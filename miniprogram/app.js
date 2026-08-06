// TODO: 替换为你的云开发环境 ID（云开发控制台获取）
const CLOUD_ENV_ID = 'cloud1-d9g5kur3sa2da3193'

const { isLight, normalizeTheme } = require('./utils/theme.js')
const { DEFAULT_BASE } = require('./utils/currency.js')
const fxRateSvc = require('./services/fxRate.js')

App({
  globalData: {
    hideAmount: wx.getStorageSync('pref_hide_amount') === true,
    cloudReady: false,
    reduceMotion: wx.getStorageSync('pref_reduce_motion') === true,
    // V3.0 删掉了 12 套主题，老用户存的 key 可能已不存在 —— normalizeTheme 收归默认（见 utils/theme.js）
    theme: normalizeTheme(wx.getStorageSync('pref_theme')),
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
    // 主题迁移落盘：globalData 里已被 normalizeTheme 收归，storage 也要回写一次，
    // 否则下次启动仍读到那个已被删除的 key，每次都要再迁移一遍。
    if (wx.getStorageSync('pref_theme') !== this.globalData.theme) {
      wx.setStorageSync('pref_theme', this.globalData.theme)
    }
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
    this.applyThemeChrome()
    return key
  },

  // 系统级颜色跟随主题（状态栏前景 / 窗口回弹区底色 / 下拉 loading 三点）。
  // app.json 里的深色是启动首帧兜底，浅色主题(isLight)必须在这里覆盖，
  // 否则会露深底 —— 各页面 onShow 都要调一次（导航到新页面后配置会回落）。
  applyThemeChrome() {
    const light = isLight(this.globalData.theme)
    wx.setNavigationBarColor({
      frontColor: light ? '#000000' : '#ffffff',
      backgroundColor: light ? '#efe7d6' : '#07080c',
    })
    wx.setBackgroundColor({
      backgroundColor: light ? '#efe7d6' : '#050507',
      backgroundColorTop: light ? '#efe7d6' : '#050507',
      backgroundColorBottom: light ? '#efe7d6' : '#050507',
    })
    wx.setBackgroundTextStyle({ textStyle: light ? 'dark' : 'light' })
  },

  // 设置本位币（显示镜头）。只改显示口径，不改任何已存数据、不重算历史。
  setBaseCurrency(code) {
    const next = code || 'CNY'
    this.globalData.baseCurrency = next
    wx.setStorageSync('pref_base_ccy', next)
    return next
  },
})
