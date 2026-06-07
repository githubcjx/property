const app = getApp()
const reportSvc = require('../../services/report.js')
const accountSvc = require('../../services/account.js')
const { formatCNY } = require('../../utils/format.js')

// 演示开关：true = 写死示例数据；false = 用真实账户数据计算（当前为真实计算预览）。
const USE_DEMO = false

// 驱动大类 → 分享卡上的「主要推手」短语
const DRIVER_CHIP = {
  investment: '投资是主要推手',
  liquid: '储蓄是主要推手',
  debtReduction: '减债是主要推手',
  fixed: '固定资产是主力',
  balanced: '多类资产齐发力',
}

// 驱动大类 → chip 颜色 tone
const DRIVER_TONE = {
  investment: 'investment',
  liquid: 'liquid',
  debtReduction: 'good',
  fixed: 'fixed',
  balanced: 'neutral',
}

// 驱动大类 → 列表图标键（项目 .ic-* 体系）
const MOVER_ICON = {
  investment: 'ic-stock',
  liquid: 'ic-cash',
  fixed: 'ic-house',
  debt: 'ic-debt',
  receivable: 'ic-handshake',
}

Page({
  data: {
    statusBarHeight: 20,
    reduceMotion: false,
    theme: 'aurora',
    hideAmount: false,

    loading: true,
    empty: false,
    isDemo: false,
    coverage: 'full',
    periodLabel: '',
    pctText: '',
    pctClass: 'up',
    keyword: null,
    health: null,
    records: 0,
    accountsUpdated: 0,
    totalDays: 0,
    spark: [],
    movers: [],     // 含 amtText / iconKey
    heroDeltaText: '',

    shareVisible: false,
    shareCard: null,
    sharePoster: '',
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      hideAmount: app.globalData.hideAmount,
    })
    this.loadReport()
  },

  async loadReport() {
    if (USE_DEMO) {
      const r = reportSvc.getDemoMonthlyReport()
      this._report = r
      this.setData({ loading: false, empty: false })
      this.applyReport(r)
      return
    }
    this.setData({ loading: true })
    try {
      const accounts = await accountSvc.listAccounts()
      if (!accounts || accounts.length === 0) {
        this.setData({ loading: false, empty: true })
        return
      }
      const r = await reportSvc.buildMonthlyReport(accounts)
      this._report = r
      this.setData({ loading: false, empty: false })
      this.applyReport(r)
    } catch (err) {
      console.error('月报加载失败', err)
      this.setData({ loading: false })
      wx.showToast({ icon: 'none', title: '加载失败：' + (err.errMsg || err.message || '') })
    }
  },

  onShow() {
    const hide = app.globalData.hideAmount
    this.setData({
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      hideAmount: hide,
    })
    if (this._report) this.refreshAmounts()
  },

  applyReport(r) {
    if (!r) return
    const pct = r.nwPct || 0
    const pctText = (pct > 0 ? '+' : '') + (+pct).toFixed(1) + '%'
    const pctClass = pct >= reportSvc.TH.monthUpPct ? 'up' : (pct <= reportSvc.TH.monthDownPct ? 'down' : 'flat')

    const movers = (r.movers || []).map(m => Object.assign({}, m, {
      iconKey: MOVER_ICON[m.cat] || 'ic-cash',
    }))

    const health = r.health
      ? Object.assign({}, r.health, { deltaAbs: Math.abs(r.health.delta || 0) })
      : r.health

    this.setData({
      isDemo: !!r.isDemo,
      coverage: r.coverage || 'full',
      periodLabel: r.periodLabel,
      pctText,
      pctClass,
      keyword: r.keyword,
      health,
      records: r.records,
      accountsUpdated: r.accountsUpdated,
      totalDays: r.totalDays,
      spark: r.spark || [],
      movers,
      shareCard: this.buildShareCard(r),
    })
    this.refreshAmounts()
  },

  // 金额随 hideAmount 显隐（页面口径与全局一致）
  refreshAmounts() {
    const hide = this.data.hideAmount
    const r = this._report
    if (!r) return
    const movers = this.data.movers.map(m => Object.assign({}, m, {
      amtText: formatCNY(m.amountFen, { hide }),
    }))
    this.setData({
      heroDeltaText: formatCNY(r.nwDeltaFen, { hide, sign: true }),
      movers,
    })
  },

  buildShareCard(r) {
    const pct = r.nwPct || 0
    const up = pct >= reportSvc.TH.monthUpPct
    const down = pct <= reportSvc.TH.monthDownPct

    const chips = []
    // 关键词：涨绿 / 跌黄(温和不报警) / 平灰
    if (r.keyword && r.keyword.word) {
      chips.push({ text: r.keyword.word, tone: up ? 'good' : (down ? 'warn' : 'neutral') })
    }
    // 主要推手：按驱动类型上色
    const d = r.driver || {}
    if (DRIVER_CHIP[d.key]) chips.push({ text: DRIVER_CHIP[d.key], tone: DRIVER_TONE[d.key] || 'neutral' })
    // 体检分：上升绿、下降红
    if (r.health) {
      if (r.health.delta > 0) chips.push({ text: '体检分 ↑' + r.health.delta, tone: 'good' })
      else if (r.health.delta < 0) chips.push({ text: '体检分 ↓' + Math.abs(r.health.delta), tone: 'bad' })
    }
    if (r.totalDays) chips.push({ text: '已记录 ' + r.totalDays + ' 天', tone: 'liquid' })

    return {
      brand: '净值本 · 月度小结',
      title: '我的月度净值',
      score: (pct > 0 ? '+' : '') + (+pct).toFixed(1),
      scoreUnit: '%',
      status: pct >= reportSvc.TH.monthUpPct ? 'good' : (pct <= reportSvc.TH.monthDownPct ? 'alert' : 'warn'),
      subline: r.periodLabel + ' 净值变化',
      chips: chips.filter(Boolean).slice(0, 4),
      netWorthFen: r.netWorthFen,
      tagline: '看清，比赚得多更重要。',
      recallText: '微信搜索「净值本」· 只给自己看的资产记录',
      qr: '/assets/share-qr_430.jpg',
    }
  },

  onBack() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/index/index' }) })
  },

  // 隐私眼：与全局 hideAmount 联动
  onToggleEye() {
    const hide = app.toggleHideAmount()
    this.setData({ hideAmount: hide })
    this.refreshAmounts()
  },

  // ===== 分享 =====
  onShareTap() {
    if (!this.data.shareCard) return
    this.setData({ shareVisible: true })
  },
  onShareClose() { this.setData({ shareVisible: false }) },
  onPosterReady(e) { this.setData({ sharePoster: (e.detail && e.detail.path) || '' }) },

  onShareAppMessage() {
    return {
      title: `我的月度净值 ${this.data.pctText}，你的呢？`,
      path: '/pages/index/index',
      imageUrl: this.data.sharePoster || '/assets/logo.png',
    }
  },
  onShareTimeline() {
    return {
      title: `我的月度净值 ${this.data.pctText} · 净值本`,
      query: '',
      imageUrl: this.data.sharePoster || '/assets/logo.png',
    }
  },
})
