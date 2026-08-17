const app = getApp()
const { APP_VERSION } = require('../../utils/version.js')
const { RELEASES } = require('../../utils/releases.js')
const { DEFAULT_THEME } = require('../../utils/theme.js')

Page({
  data: {
    version: APP_VERSION,
    statusBarHeight: 20,
    theme: DEFAULT_THEME,
    // 版本日志单一来源见 utils/releases.js（自新到旧）
    releases: RELEASES,
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
    this.setData({ theme: app.globalData.theme })
  },

  onBack() {
    wx.navigateBack()
  },
})
