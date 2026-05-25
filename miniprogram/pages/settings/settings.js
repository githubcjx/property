const app = getApp()

Page({
  data: {
    version: 'V1.1',
    statusBarHeight: 20,
    reduceMotion: false,
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      reduceMotion: app.globalData.reduceMotion,
    })
  },

  onShow() {
    this.setData({ reduceMotion: app.globalData.reduceMotion })
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

  onAbout() {
    wx.navigateTo({ url: '/pages/about/about' })
  },
})
