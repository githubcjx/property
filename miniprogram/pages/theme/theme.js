const app = getApp()
const { THEME_GROUPS } = require('../../utils/theme.js')

Page({
  data: {
    groups: THEME_GROUPS,
    theme: 'aurora',
    reduceMotion: false,
    statusBarHeight: 20,
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
    })
  },

  onShow() {
    this.setData({
      reduceMotion: app.globalData.reduceMotion,
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
    wx.navigateBack()
  },
})
