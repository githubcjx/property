const app = getApp()
const accountSvc = require('../../services/account.js')
const allocationSvc = require('../../services/allocation.js')
const { formatCNY } = require('../../utils/format.js')
const { goBack } = require('../../utils/nav.js')

Page({
  data: {
    statusBarHeight: 20,
    reduceMotion: false,
    theme: 'aurora',
    hideAmount: false,
    loading: true,
    hasData: false,

    // 资产配置（处理后的展示对象）
    alloc: null,
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
    app.applyThemeChrome()
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
      this.applyAlloc(allocationSvc.evaluate(accounts))
      this.setData({ hasData: accounts.length > 0 })
    } catch (err) {
      console.error('资产配置加载失败', err)
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

  onBack() {
    goBack()
  },
})
