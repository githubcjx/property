// TODO: 替换为你的云开发环境 ID（云开发控制台获取）
const CLOUD_ENV_ID = 'cloud1-d9g5kur3sa2da3193'

const { DEFAULT_THEME, isLight, isLocked } = require('./utils/theme.js')
const { DEFAULT_BASE } = require('./utils/currency.js')
const fxRateSvc = require('./services/fxRate.js')

App({
  globalData: {
    hideAmount: wx.getStorageSync('pref_hide_amount') === true,
    cloudReady: false,
    reduceMotion: wx.getStorageSync('pref_reduce_motion') === true,
    theme: wx.getStorageSync('pref_theme') || DEFAULT_THEME,
    // 已解锁的付费主题 key 列表（看激励视频解锁后写入，永久保留）
    unlockedThemes: wx.getStorageSync('pref_unlocked_themes') || [],
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
    // 既往不咎：升级前已在用的锁定主题（如老版免费的「晴空软光」）视为已解锁，
    // 避免老用户升级后当前主题突然「需看广告」被踢出体验。
    const cur = this.globalData.theme
    if (isLocked(cur) && this.globalData.unlockedThemes.indexOf(cur) < 0) {
      this.unlockTheme(cur)
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

  // 主题是否已解锁：免费主题恒 true；锁定主题(locked)需已看过激励视频。
  isThemeUnlocked(key) {
    return !isLocked(key) || this.globalData.unlockedThemes.indexOf(key) >= 0
  },

  // 解锁一个主题（激励视频看完后调用）。幂等；永久持久化。
  unlockTheme(key) {
    if (this.globalData.unlockedThemes.indexOf(key) >= 0) return
    this.globalData.unlockedThemes = this.globalData.unlockedThemes.concat(key)
    wx.setStorageSync('pref_unlocked_themes', this.globalData.unlockedThemes)
  },

  // 设置本位币（显示镜头）。只改显示口径，不改任何已存数据、不重算历史。
  setBaseCurrency(code) {
    const next = code || 'CNY'
    this.globalData.baseCurrency = next
    wx.setStorageSync('pref_base_ccy', next)
    return next
  },
})
