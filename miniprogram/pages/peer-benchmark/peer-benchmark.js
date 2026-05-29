const app = getApp()
const accountSvc = require('../../services/account.js')
const benchmarkSvc = require('../../services/benchmark.js')

const STORAGE_BIRTH_YEAR = 'pref_birth_year'
const MASK = '¥••'

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

Page({
  data: {
    statusBarHeight: 20,
    reduceMotion: false,
    theme: 'aurora',
    hideAmount: false,
    loading: true,

    hasData: false,   // 有账户
    hasAge: false,    // 已填出生年
    inRange: true,

    birthYear: null,
    birthDate: '2000-06-01',   // picker 值
    endBirthDate: '2016-12-31',
    cohortLabel: '',

    netWorthText: MASK,
    percentile: 0,
    percentileText: '0',
    tierText: '',
    pinPct: 50,
    medianText: MASK,
    aboveMedian: false,
    nextTier: null,

    ladder: [],
    youLadderIndex: 0,
    youNetWorthText: MASK,

    source: null,
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const by = wx.getStorageSync(STORAGE_BIRTH_YEAR) || null
    const maxYear = new Date().getFullYear() - 10
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      hideAmount: app.globalData.hideAmount,
      birthYear: by,
      birthDate: by ? (by + '-06-01') : '2000-06-01',
      endBirthDate: maxYear + '-12-31',
    })
  },

  onShow() {
    this.setData({
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      hideAmount: app.globalData.hideAmount,
    })
    this.refresh()
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      const accounts = await accountSvc.listAccounts()
      const r = benchmarkSvc.evaluate({ accounts, birthYear: this.data.birthYear })
      this.applyResult(r, accounts.length > 0)
    } catch (err) {
      console.error('同龄对标加载失败', err)
      wx.showToast({ icon: 'none', title: '加载失败：' + (err.errMsg || err.message || '') })
    } finally {
      this.setData({ loading: false })
    }
  },

  applyResult(r, hasData) {
    const hide = this.data.hideAmount
    const m = (t) => hide ? MASK : t

    if (!r.hasAge) {
      this.setData({ hasData, hasAge: false, source: r.source })
      return
    }
    if (r.inRange === false) {
      this.setData({ hasData, hasAge: true, inRange: false, source: r.source })
      return
    }

    const ladder = r.ladder.map(row => Object.assign({}, row, { valueText: m(row.valueText) }))
    const nextTier = r.nextTier ? {
      gapText: m(r.nextTier.gapText),
      targetText: m(r.nextTier.targetText),
      tierText: r.nextTier.tierText,
    } : null

    this.setData({
      hasData, hasAge: true, inRange: true,
      cohortLabel: r.cohortLabel,
      netWorthText: m(r.netWorthText),
      youNetWorthText: m(r.netWorthText),
      percentile: r.percentile,
      percentileText: r.percentileText,
      tierText: r.tierText,
      pinPct: clamp(r.percentile, 6, 94),
      medianText: m(r.medianText),
      aboveMedian: r.aboveMedian,
      nextTier,
      ladder,
      youLadderIndex: r.youLadderIndex,
      source: r.source,
    })
  },

  onPickBirth(e) {
    const val = e.detail.value || ''
    const year = parseInt(String(val).split('-')[0], 10)
    if (!year || isNaN(year)) return
    wx.setStorageSync(STORAGE_BIRTH_YEAR, year)
    this.setData({ birthYear: year, birthDate: year + '-06-01' })
    this.refresh()
  },

  onBack() { wx.navigateBack() },

  onShareAppMessage() {
    return {
      title: '净值本 · 看看你超过了多少同龄人',
      path: '/pages/index/index',
      imageUrl: '/assets/logo.png',
    }
  },
})
