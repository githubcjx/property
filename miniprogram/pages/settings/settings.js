const app = getApp()
const { getTheme } = require('../../utils/theme.js')
const { APP_VERSION } = require('../../utils/version.js')

Page({
  data: {
    version: APP_VERSION,
    statusBarHeight: 20,
    reduceMotion: false,
    theme: 'aurora',
    themeName: '',
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      themeName: getTheme(app.globalData.theme).name,
    })
  },

  onShow() {
    this.setData({
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      themeName: getTheme(app.globalData.theme).name,
    })
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
