const app = getApp()
const { THEME_GROUPS, THEME_LOCK_ENABLED, THEME_AD_UNIT_ID, isAdConfigured, DEFAULT_THEME } = require('../../utils/theme.js')

Page({
  data: {
    groups: THEME_GROUPS,
    theme: DEFAULT_THEME,
    reduceMotion: false,
    statusBarHeight: 20,
    lockEnabled: THEME_LOCK_ENABLED,   // 广告解锁总开关；关闭时 premium 系列免费、不显角标
    unlockedMap: {},   // { themeKey: true }，已解锁的锁定主题；免费主题不入表
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
    })
    this._syncUnlocked()
  },

  onShow() {
    app.applyThemeChrome()
    this.setData({
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
    })
    this._syncUnlocked()
  },

  onUnload() {
    // 激励视频广告是单例，无需销毁；解绑回调即可
    if (this._ad) { this._ad.offClose && this._ad.offClose(); this._ad.offError && this._ad.offError() }
  },

  _syncUnlocked() {
    const map = {}
    ;(app.globalData.unlockedThemes || []).forEach(k => { map[k] = true })
    this.setData({ unlockedMap: map })
  },

  onPick(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.theme) return
    if (!app.isThemeUnlocked(key)) {
      this._unlock(key)
      return
    }
    this._apply(key)
  },

  // 实际应用主题（已解锁或免费）
  _apply(key) {
    app.setTheme(key)
    this.setData({ theme: key })
    wx.vibrateShort && wx.vibrateShort({ type: 'light' })
  },

  // 看激励视频解锁该主题（看完才解锁并应用）
  _unlock(key) {
    const done = () => {
      app.unlockTheme(key)
      this._syncUnlocked()
      this._apply(key)
      wx.showToast({ icon: 'success', title: '已解锁' })
    }

    // 广告位未配置（占位期）：模拟解锁，方便开发预览。填真实 adUnitId 后走下方真实广告。
    if (!isAdConfigured()) {
      wx.showModal({
        title: '解锁主题',
        content: '（广告位未配置，当前为模拟解锁）正式版将播放一段激励视频，看完即可解锁该主题。',
        confirmText: '模拟解锁',
        success: (r) => { if (r.confirm) done() },
      })
      return
    }

    const ad = this._ensureAd()
    if (!ad) {
      wx.showToast({ icon: 'none', title: '当前环境暂不支持广告' })
      return
    }
    this._pendingDone = done
    wx.showLoading({ title: '加载广告…', mask: true })
    ad.show()
      .then(() => wx.hideLoading())
      .catch(() => ad.load()
        .then(() => ad.show())
        .then(() => wx.hideLoading())
        .catch(() => {
          wx.hideLoading()
          wx.showToast({ icon: 'none', title: '广告加载失败，稍后再试' })
        }))
  },

  // 懒创建激励视频广告单例（一个广告位复用；解锁哪套由 _pendingDone 决定）
  _ensureAd() {
    if (this._ad) return this._ad
    if (!wx.createRewardedVideoAd) return null
    const ad = wx.createRewardedVideoAd({ adUnitId: THEME_AD_UNIT_ID })
    ad.onError((err) => { console.error('[theme] rewardedAd error', err) })
    ad.onClose((res) => {
      const ok = res && res.isEnded
      const done = this._pendingDone
      this._pendingDone = null
      if (ok) { if (done) done() }
      else { wx.showToast({ icon: 'none', title: '看完整段视频才能解锁哦' }) }
    })
    this._ad = ad
    return ad
  },

  onBack() {
    wx.navigateBack()
  },
})
