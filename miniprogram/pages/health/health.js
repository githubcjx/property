const app = getApp()
const accountSvc = require('../../services/account.js')
const healthSvc = require('../../services/health.js')
const { formatCNY } = require('../../utils/format.js')

// 描述当前日期 → "05/25 更新"
function fmtUpdateDate(d) {
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${m}/${day} 更新`
}

// 综合分圆环：conic-gradient 用度数。score: 0-100 → 0-360deg
function ringDeg(score) {
  if (score == null) return '0deg'
  const d = (Math.max(0, Math.min(100, score)) / 100) * 360
  return d.toFixed(1) + 'deg'
}

// 把建议 severity 映射为图标
const SEVERITY_ICON = {
  alert: '!',
  warn:  '◐',
  good:  '✓',
  neutral: '·',
}

// 综合分 → 分享卡上的一句体质标签
const OVERALL_CHIP = {
  good:  '财务体质良好',
  warn:  '体质尚可',
  alert: '需要关注',
  neutral: '已开始记录',
}

// 指标达标（good）时的简短标签
const METRIC_GOOD_CHIP = {
  debtRatio:      '负债率健康',
  solvencyRatio:  '清偿能力强',
  immediateRatio: '流动性充足',
  financialRatio: '金融配置均衡',
  housingRatio:   '房产配置均衡',
}

// 云端日期可能是 Date / 数字 / 字符串 / {$date}，统一转毫秒
function toMs(v) {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const t = Date.parse(v); return isNaN(t) ? 0 : t }
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'object' && v.$date != null) return toMs(v.$date)
  return 0
}

// 已记录天数 = 距最早账户创建日的天数（含当天）
function recordedDays(accounts) {
  let earliest = 0
  for (const a of accounts) {
    const t = toMs(a.createdAt)
    if (t > 0 && (earliest === 0 || t < earliest)) earliest = t
  }
  if (!earliest) return 0
  const days = Math.floor((Date.now() - earliest) / 86400000) + 1
  return days > 0 ? days : 1
}

// 用真实体检结果拼分享卡（绝不含造假/同龄对标数据）
function buildShareCard(r, accounts) {
  if (r.overall.score == null) return null

  const goodCount = r.metrics.filter(m => m.status === 'good').length

  // chip 颜色：总评按状态(good绿/warn黄/alert红)，达标项绿，记录天数蓝
  const overallTone = { good: 'good', warn: 'warn', alert: 'bad', neutral: 'neutral' }[r.overall.status] || 'neutral'
  const chips = []
  chips.push({ text: OVERALL_CHIP[r.overall.status] || OVERALL_CHIP.neutral, tone: overallTone })
  for (const m of r.metrics) {
    if (m.status === 'good' && METRIC_GOOD_CHIP[m.key]) chips.push({ text: METRIC_GOOD_CHIP[m.key], tone: 'good' })
  }
  const days = recordedDays(accounts)
  if (days >= 1) chips.push({ text: '已记录 ' + days + ' 天', tone: 'liquid' })

  return {
    brand: '净值本 · 财务体检',
    title: '我的财务健康分',
    score: r.overall.score,
    scoreUnit: '分',
    status: r.overall.status,
    subline: goodCount + '/' + r.metrics.length + ' 项指标达标',
    chips: chips.slice(0, 4),
    netWorthFen: r.totals.netWorth,
    tagline: '看清，比赚得多更重要。',
    recallText: '微信搜索「净值本」· 只给自己看的资产记录',
    // 小程序码：把永久码图片放到此路径即自动出现在卡片/海报上；
    // 文件不存在时组件会优雅回退到「微信搜索」文字（见 share-sheet 组件）。
    qr: '/assets/share-qr_430.jpg',
  }
}

Page({
  data: {
    statusBarHeight: 20,
    reduceMotion: false,
    theme: 'aurora',
    hideAmount: false,
    loading: true,
    hasData: false,

    updateText: '',

    // 体检结果
    overallScore: null,
    overallStatus: 'neutral',
    overallHeadline: '',
    overallDesc: '',
    ringDeg: '0deg',

    // 顶部摘要
    totalsText: { assets: '¥0', liabilities: '¥0', netWorth: '¥0' },

    metrics: [],
    advice: [],

    // 分享
    shareVisible: false,
    shareCard: null,
    sharePoster: '',

    // 底部面板
    sheetVisible: false,
    sheetClosing: false,
    sheet: {
      kind: '',        // 'metric' | 'source'
      title: '',
      formula: '',
      definition: '',
      source: '',
      sourceLines: [],
    },
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      hideAmount: app.globalData.hideAmount,
      updateText: fmtUpdateDate(new Date()),
    })
  },

  onShow() {
    this.setData({
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      hideAmount: app.globalData.hideAmount,
    })
    this.refresh()
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      const accounts = await accountSvc.listAccounts()
      const result = healthSvc.evaluate(accounts)
      this.applyResult(result, accounts)
    } catch (err) {
      console.error('体检加载失败', err)
      wx.showToast({ icon: 'none', title: '加载失败：' + (err.errMsg || err.message || '') })
    } finally {
      this.setData({ loading: false })
    }
  },

  applyResult(r, accounts) {
    const hasData = accounts.length > 0
    const hide = this.data.hideAmount
    const cny = (fen) => formatCNY(fen, { hide })

    const metrics = r.metrics.map(m => Object.assign({}, m, {
      gaugePctText: (m.gaugePct || 0).toFixed(1),
      markerPctText: m.markerPct == null ? '' : m.markerPct.toFixed(0) + '%',
    }))

    const advice = r.advice.map(a => Object.assign({}, a, {
      iconText: SEVERITY_ICON[a.severity] || '·',
    }))

    this.setData({
      hasData,
      overallScore: r.overall.score,
      overallStatus: r.overall.status,
      overallHeadline: r.overall.headline,
      overallDesc: r.overall.desc,
      ringDeg: ringDeg(r.overall.score),
      totalsText: {
        assets:      cny(r.totals.assets),
        liabilities: cny(r.totals.liabilities),
        netWorth:    cny(r.totals.netWorth),
      },
      metrics,
      advice,
      shareCard: buildShareCard(r, accounts),
    })
  },

  onBack() {
    wx.navigateBack()
  },

  // ===== 分享 =====
  onShareTap() {
    if (!this.data.shareCard) {
      wx.showToast({ icon: 'none', title: '暂无可分享的成绩' })
      return
    }
    this.setData({ shareVisible: true })
  },

  onShareClose() {
    this.setData({ shareVisible: false })
  },

  // 组件画好海报后回传临时图路径，供 onShareAppMessage 用作 imageUrl
  onPosterReady(e) {
    this.setData({ sharePoster: (e.detail && e.detail.path) || '' })
  },

  // 发给朋友（由面板内 open-type="share" 按钮或右上角菜单触发）
  onShareAppMessage() {
    const score = this.data.overallScore
    return {
      title: score == null ? '净值本 · 极简记录你的净资产' : `我的财务健康分 ${score} 分，你的呢？`,
      path: '/pages/index/index',
      imageUrl: this.data.sharePoster || '/assets/logo.png',
    }
  },

  // 分享到朋友圈（仅右上角菜单可触发）
  onShareTimeline() {
    const score = this.data.overallScore
    return {
      title: score == null ? '净值本 · 看清你的净资产' : `我的财务健康分 ${score} 分 · 净值本`,
      query: '',
      imageUrl: this.data.sharePoster || '/assets/logo.png',
    }
  },

  onMetricTap(e) {
    const key = e.currentTarget.dataset.key
    const m = this.data.metrics.find(x => x.key === key)
    if (!m) return
    this.openSheet({
      kind: 'metric',
      title: m.name,
      formula: m.formula,
      definition: m.definition,
      source: m.source,
      sourceLines: [],
    })
  },

  onSourceTap() {
    this.openSheet({
      kind: 'source',
      title: '指标说明 · 来源',
      formula: '',
      definition: '',
      source: '',
      sourceLines: [
        '前三项标准家庭财务比率（负债、清偿、即付）公式与推荐阈值来自《家庭财务指标》——国际理财规划师常用家庭财务比率体系。',
        '金融资产占比、住房资产占比的对照基准来自中国人民银行《2019 年中国城镇居民家庭资产负债情况调查》。',
        '投资与净资产比率反映通过投资提升净资产规模的能力，《家庭财务指标》未给出固定阈值，故仅作参考展示。',
      ],
    })
  },

  openSheet(payload) {
    this.setData({
      sheet: payload,
      sheetVisible: true,
      sheetClosing: false,
    })
  },

  closeSheet() {
    if (!this.data.sheetVisible) return
    this.setData({ sheetClosing: true })
    setTimeout(() => {
      this.setData({ sheetVisible: false, sheetClosing: false })
    }, 260)
  },

  // 阻止面板内容区点击穿透到 backdrop
  onSheetNoop() {},
})
