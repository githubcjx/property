const app = getApp()
const { getTheme } = require('../../utils/theme.js')
const { getCurrency } = require('../../utils/currency.js')
const { APP_VERSION } = require('../../utils/version.js')

Page({
  data: {
    version: APP_VERSION,
    statusBarHeight: 20,
    reduceMotion: false,
    theme: 'aurora',
    themeName: '',
    accentColor: '#a7d3ff',   // 原生 switch 的 color 取不到 CSS 变量，用当前主题强调色
    baseCurrencyText: '',
    fxDate: '',
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      themeName: getTheme(app.globalData.theme).name,
      accentColor: getTheme(app.globalData.theme).accent,
    })
    this.syncCurrency()
  },

  onShow() {
    app.applyThemeChrome()
    this.setData({
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      themeName: getTheme(app.globalData.theme).name,
      accentColor: getTheme(app.globalData.theme).accent,
    })
    this.syncCurrency()
  },

  syncCurrency() {
    const code = app.globalData.baseCurrency || 'CNY'
    const c = getCurrency(code)
    const meta = app.globalData.fxRatesMeta
    this.setData({
      baseCurrencyText: code + ' ' + c.symbol,
      fxDate: (meta && meta.date) ? ('截至 ' + meta.date) : '每日自动更新',
    })
  },

  onBaseCurrency() {
    wx.navigateTo({ url: '/pages/base-currency/base-currency' })
  },

  onRates() {
    wx.navigateTo({ url: '/pages/rates/rates' })
  },

  onTheme() {
    wx.navigateTo({ url: '/pages/theme/theme' })
  },

  onReduceMotionChange(e) {
    const v = e.detail.value
    app.globalData.reduceMotion = v
    wx.setStorageSync('pref_reduce_motion', v)
    this.setData({ reduceMotion: v })
  },

  onBack() {
    wx.navigateBack()
  },

  onChangelog() {
    wx.navigateTo({ url: '/pages/changelog/changelog' })
  },

  onAbout() {
    wx.navigateTo({ url: '/pages/about/about' })
  },
})
