const app = getApp()
const fxRate = require('../../services/fxRate.js')
const { CURRENCIES } = require('../../utils/currency.js')
const { DEFAULT_THEME } = require('../../utils/theme.js')

Page({
  data: {
    statusBarHeight: 20,
    reduceMotion: false,
    theme: DEFAULT_THEME,
    rows: [],
    date: '',
    source: '',
    hasRates: false,
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
    })
    this.load()
  },

  onShow() {
    app.applyThemeChrome()
    this.setData({ theme: app.globalData.theme, reduceMotion: app.globalData.reduceMotion })
  },

  async load() {
    // 优先用 globalData 已有汇率；没有则尝试拉一次
    let rates = fxRate.getRates()
    if (!rates) {
      const doc = await fxRate.refresh()
      rates = (doc && doc.rates) || null
    }
    const meta = fxRate.getMeta() || {}
    const rows = CURRENCIES
      .filter(c => c.code !== 'CNY')
      .map(c => ({
        code: c.code,
        name: c.name,
        symbol: c.symbol,
        // 「1 外币 = X 人民币」，保留 4 位有效展示
        rateText: (rates && typeof rates[c.code] === 'number')
          ? String(rates[c.code])
          : '—',
      }))
    this.setData({
      rows,
      date: meta.date || '',
      source: meta.source || 'open.er-api.com',
      hasRates: !!rates,
    })
  },

  onBack() {
    wx.navigateBack()
  },
})
