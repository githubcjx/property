const app = getApp()

Page({
  data: {
    version: 'V1.5',
    statusBarHeight: 20,
    reduceMotion: false,
    themeClass: '',
    theme: 'glass',
    themes: [
      { key: 'glass', name: '冰玻璃', desc: '深色 · 毛玻璃质感' },
      { key: 'neu',   name: '新拟态', desc: '浅色 · 柔和双阴影' },
    ],
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      themeClass: app.themeClass(),
    })
  },

  onShow() {
    this.setData({
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      themeClass: app.themeClass(),
    })
    app.applyNativeBg()
  },

  onThemeTap(e) {
    const key = e.currentTarget.dataset.key
    if (!key || key === this.data.theme) return
    app.setTheme(key)
    this.setData({ theme: key, themeClass: app.themeClass() })
    app.applyNativeBg()
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
