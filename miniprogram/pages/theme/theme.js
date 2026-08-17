const app = getApp()
const { THEMES, DEFAULT_THEME } = require('../../utils/theme.js')
const { goBack } = require('../../utils/nav.js')

Page({
  data: {
    themes: THEMES,
    theme: DEFAULT_THEME,
    statusBarHeight: 20,
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      theme: app.globalData.theme,
    })
  },

  onShow() {
    app.applyThemeChrome()
    this.setData({
      theme: app.globalData.theme,
    })
  },

  onPick(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.theme) return
    app.setTheme(key)
    this.setData({ theme: key })
    wx.vibrateShort && wx.vibrateShort({ type: 'light' })
  },

  onBack() {
    goBack()
  },
})
