const app = getApp()
const milestonesSvc = require('../../services/milestones.js')

// 进度 0-100 → conic-gradient 度数
function pctToDeg(pct) {
  if (pct == null || isNaN(pct)) return '0deg'
  const d = (Math.max(0, Math.min(100, pct)) / 100) * 360
  return d.toFixed(1) + 'deg'
}

// 进度小球：从 -90deg 起，pct% × 360 之后落在圆周
function pctToTipDeg(pct) {
  if (pct == null || isNaN(pct)) return '-90deg'
  const d = -90 + (Math.max(0, Math.min(100, pct)) / 100) * 360
  return d.toFixed(1) + 'deg'
}

Page({
  data: {
    statusBarHeight: 20,
    reduceMotion: false,
    hideAmount: false,
    loading: true,
    hasData: false,

    currentText: '¥0',
    monthlyRateText: '¥0',

    // hero · 下一关
    nextTarget: null,        // 仅当存在 current 关时填
    ringDeg: '0deg',
    ringTipDeg: '-90deg',

    // 关口列表 + 计数
    milestones: [],
    achievedCount: 0,
    totalCount: 7,

    // 旅程
    peak: null,
    firstPositive: null,

    // 是否所有关都达成
    allDone: false,
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      reduceMotion: app.globalData.reduceMotion,
      hideAmount: app.globalData.hideAmount,
    })
  },

  onShow() {
    this.setData({
      reduceMotion: app.globalData.reduceMotion,
      hideAmount: app.globalData.hideAmount,
    })
    this.refresh()
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      const r = await milestonesSvc.evaluate()
      this.applyResult(r)
    } catch (err) {
      console.error('里程碑加载失败', err)
      wx.showToast({ icon: 'none', title: '加载失败：' + (err.errMsg || err.message || '') })
    } finally {
      this.setData({ loading: false })
    }
  },

  applyResult(r) {
    const hide = this.data.hideAmount

    // 找 current 关，没有则全部达成
    const current = r.milestones.find(m => m.status === 'current')
    const achievedCount = r.milestones.filter(m => m.status === 'achieved').length

    // 处理隐藏金额：保留结构，金额与进度% 都换成占位符
    // （进度% × 固定关口可反推净资产，故一并遮蔽；环弧/进度条的视觉宽度另在 wxml 中和）
    const milestones = r.milestones.map(m => {
      const c = Object.assign({}, m)
      if (hide && c.status === 'current') {
        c.remainingText = '¥••'
        c.progressPctText = '••'
      }
      return c
    })

    let nextTarget = null
    let ringDeg = '0deg'
    let ringTipDeg = '-90deg'
    if (current) {
      // hero 的"还差"与环心进度% 同样会反推金额：隐藏时换占位符，并把环弧/弧端小球归零
      nextTarget = hide
        ? Object.assign({}, current, { remainingText: '¥••', progressPctText: '••' })
        : current
      ringDeg = hide ? '0deg' : pctToDeg(current.progressPct)
      ringTipDeg = hide ? '-90deg' : pctToTipDeg(current.progressPct)
    }

    const peak = r.peak ? Object.assign({}, r.peak, hide ? { amountText: '¥••' } : {}) : null

    this.setData({
      hasData: r.hasData,
      currentText: hide ? '¥••' : r.currentText,
      monthlyRateText: hide ? '¥••' : r.monthlyRateText,
      milestones,
      achievedCount,
      totalCount: milestones.length,
      nextTarget,
      ringDeg,
      ringTipDeg,
      peak,
      firstPositive: r.firstPositive,
      allDone: !!r.hasData && !current,
    })
  },

  onBack() {
    wx.navigateBack()
  },
})
