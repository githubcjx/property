// TODO: 替换为你的云开发环境 ID（云开发控制台获取）
const CLOUD_ENV_ID = 'cloud1-d9g5kur3sa2da3193'

App({
  globalData: {
    hideAmount: wx.getStorageSync('pref_hide_amount') === true,
    cloudReady: false,
    reduceMotion: wx.getStorageSync('pref_reduce_motion') === true,
    // 主题：'glass'（默认冰玻璃深色）/ 'neu'（新拟态浅色）
    theme: wx.getStorageSync('pref_theme') || 'glass',
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }
    if (CLOUD_ENV_ID === 'CLOUD_ENV_ID') {
      console.warn('[app.js] 尚未配置云开发环境 ID，请在 app.js 顶部填写 CLOUD_ENV_ID')
      wx.showModal({
        title: '提示',
        content: '请在 miniprogram/app.js 顶部填写云开发环境 ID（CLOUD_ENV_ID），并在云开发控制台创建 accounts/transactions 集合',
        showCancel: false,
      })
      return
    }
    wx.cloud.init({
      env: CLOUD_ENV_ID,
      traceUser: true,
    })
    this.globalData.cloudReady = true
  },

  toggleHideAmount() {
    this.globalData.hideAmount = !this.globalData.hideAmount
    wx.setStorageSync('pref_hide_amount', this.globalData.hideAmount)
    return this.globalData.hideAmount
  },

  setReduceMotion(v) {
    const next = !!v
    this.globalData.reduceMotion = next
    wx.setStorageSync('pref_reduce_motion', next)
    return next
  },

  // 主题切换。theme: 'glass' | 'neu'
  setTheme(theme) {
    const next = theme === 'neu' ? 'neu' : 'glass'
    this.globalData.theme = next
    wx.setStorageSync('pref_theme', next)
    return next
  },

  // 供页面拼到根节点 class 上：'' | 'theme-neu'
  themeClass() {
    return this.globalData.theme === 'neu' ? 'theme-neu' : ''
  },
})
