Page({
  data: {
    version: 'V1.1',
  },

  onAbout() {
    wx.navigateTo({ url: '/pages/about/about' })
  },
})
