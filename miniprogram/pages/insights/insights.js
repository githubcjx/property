const app = getApp()
const accountSvc = require('../../services/account.js')
const allocationSvc = require('../../services/allocation.js')
const attributionSvc = require('../../services/attribution.js')
const { formatCNY } = require('../../utils/format.js')

Page({
  data: {
    statusBarHeight: 20,
    reduceMotion: false,
    theme: 'aurora',
    hideAmount: false,
    loading: true,
    hasData: false,
    tab: 'alloc', // 'alloc' 配置 | 'change' 变动

    // 配置（处理后的展示对象）
    alloc: null,

    // 变动
    periods: [],
    periodKey: 'month',
    change: null,
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      hideAmount: app.globalData.hideAmount,
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
      this._accounts = accounts
      const hasData = accounts.length > 0

      // 配置（同步计算）
      this.applyAlloc(allocationSvc.evaluate(accounts))

      // 变动（异步，按当前周期）
      const changeRaw = await attributionSvc.evaluate(accounts, this.data.periodKey)
      this.applyChange(changeRaw)

      this.setData({ hasData })
    } catch (err) {
      console.error('资产洞察加载失败', err)
      wx.showToast({ icon: 'none', title: '加载失败：' + (err.errMsg || err.message || '') })
    } finally {
      this.setData({ loading: false })
    }
  },

  applyAlloc(r) {
    const hide = this.data.hideAmount
    const cny = (fen) => formatCNY(fen, { hide })
    if (!r || !r.hasData) {
      this.setData({ alloc: null })
      return
    }
    const assetCategories = r.assetCategories.map(c => Object.assign({}, c, {
      pctText: c.pct.toFixed(1),
      amountText: cny(c.amount),
    }))
    const ratios = r.ratios.map(x => Object.assign({}, x, {
      pctText: x.pct.toFixed(1),
      barPct: Math.max(0, Math.min(100, x.pct)).toFixed(1),
    }))
    const concentration = r.concentration ? Object.assign({}, r.concentration, {
      pctText: r.concentration.pct.toFixed(1),
      amountText: cny(r.concentration.amount),
    }) : null

    this.setData({
      alloc: {
        totals: {
          assets: cny(r.totals.assets),
          debt: cny(r.totals.debt),
          netWorth: cny(r.totals.netWorth),
        },
        assetCategories,
        conicGradient: r.conicGradient,
        ratios,
        concentration,
        accountCount: r.accountCount,
      },
    })
  },

  applyChange(r) {
    const hide = this.data.hideAmount
    if (!r || !r.hasData) {
      this.setData({ periods: (r && r.periods) || attributionSvc.PERIODS, change: null })
      return
    }
    const sign = (fen) => formatCNY(fen, { hide, sign: true })
    const contributors = r.contributors.map(c => Object.assign({}, c, {
      contribText: sign(c.contribution),
      dir: c.contribution > 0 ? 'pos' : 'neg',
      barPct: Math.max(4, Math.min(100, c.pctOfChange)).toFixed(1),
    }))
    this.setData({
      periods: r.periods,
      periodKey: r.periodKey,
      change: {
        periodLabel: r.periodLabel,
        baselineText: formatCNY(r.baseline, { hide }),
        currentText: formatCNY(r.current, { hide }),
        totalDeltaText: sign(r.totalDelta),
        totalDir: r.totalDelta > 0 ? 'pos' : (r.totalDelta < 0 ? 'neg' : 'flat'),
        totalDeltaPctText: (r.totalDeltaPct >= 0 ? '+' : '') + r.totalDeltaPct.toFixed(1) + '%',
        gainText: sign(r.gainSum),
        lossText: sign(r.lossSum),
        fxText: sign(r.fxFen),
        hasFx: !!r.fxFen,
        contributors,
        hasMovement: r.hasMovement,
      },
    })
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab && tab !== this.data.tab) this.setData({ tab })
  },

  async onPeriod(e) {
    const key = e.currentTarget.dataset.key
    if (!key || key === this.data.periodKey) return
    this.setData({ periodKey: key })
    if (!this._accounts) return
    try {
      const changeRaw = await attributionSvc.evaluate(this._accounts, key)
      this.applyChange(changeRaw)
    } catch (err) {
      console.error('切换周期失败', err)
    }
  },

  onContribTap(e) {
    const id = e.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: '/pages/account-detail/account-detail?id=' + id })
  },

  onBack() {
    wx.navigateBack()
  },
})
