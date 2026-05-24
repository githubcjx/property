Page({
  data: {
    version: 'V1.1',
    statusBarHeight: 20,
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
  },

  onBack() {
    wx.navigateBack()
  },

  onAbout() {
    wx.navigateTo({ url: '/pages/about/about' })
  },
})
