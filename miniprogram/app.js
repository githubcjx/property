// TODO: 替换为你的云开发环境 ID（云开发控制台获取）
const CLOUD_ENV_ID = 'cloud1-d9g5kur3sa2da3193'

const { DEFAULT_THEME } = require('./utils/theme.js')
const { DEFAULT_BASE } = require('./utils/currency.js')
const fxRateSvc = require('./services/fxRate.js')

App({
  globalData: {
    hideAmount: wx.getStorageSync('pref_hide_amount') === true,
    cloudReady: false,
    reduceMotion: wx.getStorageSync('pref_reduce_motion') === true,
    theme: wx.getStorageSync('pref_theme') || DEFAULT_THEME,
    // 多货币：本位币（显示镜头，默认人民币）+ 汇率表（由 fxRate.refresh 填充）
    baseCurrency: wx.getStorageSync('pref_base_ccy') || DEFAULT_BASE,
    fxRates: null,
    fxRatesMeta: null,
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
    // 异步加载汇率（失败回退本地缓存）；不阻塞启动
    fxRateSvc.refresh()
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

  setTheme(key) {
    this.globalData.theme = key
    wx.setStorageSync('pref_theme', key)
    return key
  },

  // 设置本位币（显示镜头）。只改显示口径，不改任何已存数据、不重算历史。
  setBaseCurrency(code) {
    const next = code || 'CNY'
    this.globalData.baseCurrency = next
    wx.setStorageSync('pref_base_ccy', next)
    return next
  },
})
