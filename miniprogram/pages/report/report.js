const app = getApp()
const reportSvc = require('../../services/report.js')
const accountSvc = require('../../services/account.js')
const { formatCNY } = require('../../utils/format.js')
const { goBack } = require('../../utils/nav.js')

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
    canPrev: false,    // 可翻上一月（无下界，始终可点；服务无基线时显示降级文案）
    canNext: false,    // 可翻下一月（上界=上一个完整月，到顶置灰）
    pctText: '',
    pctClass: 'up',
    keyword: null,
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

  onLoad(options) {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      hideAmount: app.globalData.hideAmount,
    })
    // 目标月：?ym=YYYY-MM；缺省 = 上一个完整月。超过上界（未来月）则夹到上一完整月。
    const newest = reportSvc.defaultReportMonth()
    const want = this._parseYm(options && options.ym) || newest
    this._month = want.getTime() > newest.getTime() ? newest : want
    this._cache = {}   // monthKey → report，来回翻同月秒开不重查
    this.loadReport()
  },

  _parseYm(ym) {
    if (!ym) return null
    const m = /^(\d{4})-(\d{1,2})$/.exec(ym)
    if (!m) return null
    const d = new Date(+m[1], +m[2] - 1, 1)
    return isNaN(d.getTime()) ? null : d
  },

  _monthKey(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) },

  // 上界 = 上一个完整月（永不进入进行中的当月）；下界无（始终可往回翻）
  _updateNav() {
    const newest = reportSvc.defaultReportMonth()
    this.setData({
      canPrev: true,
      canNext: this._month.getTime() < newest.getTime(),
    })
  },

  async loadReport() {
    if (USE_DEMO) {
      const r = reportSvc.getDemoMonthlyReport()
      this._report = r
      this.setData({ loading: false, empty: false })
      this.applyReport(r)
      return
    }
    const key = this._monthKey(this._month)
    // 缓存命中：秒开，无需 loading / 重新查询
    if (this._cache[key]) {
      const r = this._cache[key]
      this._report = r
      this.setData({ loading: false, empty: false })
      this.applyReport(r)
      this._updateNav()
      return
    }
    this.setData({ loading: true })
    try {
      let accounts = this._accounts
      if (!accounts) {
        accounts = await accountSvc.listAccounts()
        this._accounts = accounts
      }
      if (!accounts || accounts.length === 0) {
        this.setData({ loading: false, empty: true })
        return
      }
      const r = await reportSvc.buildMonthlyReport(accounts, this._month)
      this._report = r
      this._cache[key] = r
      this.setData({ loading: false, empty: false })
      this.applyReport(r)
      this._updateNav()
    } catch (err) {
      console.error('月报加载失败', err)
      this.setData({ loading: false })
      wx.showToast({ icon: 'none', title: '加载失败：' + (err.errMsg || err.message || '') })
    }
  },

  // 切月：上一月（始终允许）/ 下一月（到上界则忽略）
  onPrevMonth() {
    const d = this._month
    this._month = new Date(d.getFullYear(), d.getMonth() - 1, 1)
    this.loadReport()
  },
  onNextMonth() {
    if (!this.data.canNext) return
    const d = this._month
    this._month = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    this.loadReport()
  },

  onShow() {
    app.applyThemeChrome()
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

    this.setData({
      isDemo: !!r.isDemo,
      coverage: r.coverage || 'full',
      periodLabel: r.periodLabel,
      pctText,
      pctClass,
      keyword: r.keyword,
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
    goBack()
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
