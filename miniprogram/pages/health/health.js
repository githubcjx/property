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
      this.applyResult(result, accounts.length > 0)
    } catch (err) {
      console.error('体检加载失败', err)
      wx.showToast({ icon: 'none', title: '加载失败：' + (err.errMsg || err.message || '') })
    } finally {
      this.setData({ loading: false })
    }
  },

  applyResult(r, hasData) {
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
    })
  },

  onBack() {
    wx.navigateBack()
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
