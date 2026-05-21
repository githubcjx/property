const app = getApp()
const accountSvc = require('../../services/account.js')
const { CATEGORIES, isDebtCategory } = require('../../utils/categories.js')
const { formatYuan } = require('../../utils/format.js')

const STORAGE_EXPANDED = 'idx_expanded_categories'

Page({
  data: {
    version: 'V1.1',
    loading: true,
    hasData: false,
    netWorthText: '¥0',
    netWorthRaw: 0,
    hideAmount: false,
    groups: [],
    statusBarHeight: 20,
    expandedMap: {}, // { categoryId: true } — 哪些大类是展开的
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const stored = wx.getStorageSync(STORAGE_EXPANDED) || {}
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      hideAmount: app.globalData.hideAmount,
      expandedMap: stored,
    })
  },

  onShow() {
    this.setData({ hideAmount: app.globalData.hideAmount })
    this.refresh()
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      const accounts = await accountSvc.listAccounts()
      this.buildGroups(accounts)
    } catch (err) {
      console.error('加载账户失败', err)
      wx.showToast({ icon: 'none', title: '加载失败：' + (err.errMsg || err.message || '') })
    } finally {
      this.setData({ loading: false })
    }
  },

  buildGroups(accounts) {
    const groups = CATEGORIES.map(cat => ({
      categoryId: cat.id,
      name: cat.name,
      colorClass: cat.colorClass,
      color: cat.color,
      icon: cat.icon || '',
      tintClass: 'cat-tint-' + cat.colorClass,
      isDebt: cat.id === 'debt',
      totalFen: 0,
      lastUpdated: 0,
      accounts: [],
    }))
    const map = groups.reduce((m, g) => { m[g.categoryId] = g; return m }, {})

    let netWorth = 0
    for (const acc of accounts) {
      const g = map[acc.categoryId]
      if (!g) continue
      g.accounts.push(acc)
      g.totalFen += (acc.balance || 0)
      const upd = acc.updatedAt || acc.createdAt
      const updMs = upd ? (upd instanceof Date ? upd.getTime() : new Date(upd).getTime()) : 0
      if (updMs && (!g.lastUpdated || updMs > g.lastUpdated)) {
        g.lastUpdated = updMs
      }
      if (acc.includeInChart) {
        if (isDebtCategory(acc.categoryId)) netWorth -= (acc.balance || 0)
        else netWorth += (acc.balance || 0)
      }
    }

    const visibleGroups = groups.filter(g => g.accounts.length > 0)
    const netWorthText = this.data.hideAmount
      ? '¥****'
      : (netWorth < 0 ? '-¥' + formatYuan(Math.abs(netWorth), {}) : '¥' + formatYuan(netWorth, {}))

    this.setData({
      groups: visibleGroups,
      netWorthRaw: netWorth,
      netWorthText,
      hasData: accounts.length > 0,
    })
  },

  onToggleHide() {
    const next = app.toggleHideAmount()
    this.setData({ hideAmount: next })
    const netWorth = this.data.netWorthRaw
    const text = next
      ? '¥****'
      : (netWorth < 0 ? '-¥' + formatYuan(Math.abs(netWorth), {}) : '¥' + formatYuan(netWorth, {}))
    this.setData({ netWorthText: text })
  },

  // 手风琴：点大类 header 切换展开
  onToggleGroup(e) {
    const id = e.detail && e.detail.categoryId
    if (!id) return
    const map = Object.assign({}, this.data.expandedMap)
    if (map[id]) delete map[id]
    else map[id] = true
    this.setData({ expandedMap: map })
    wx.setStorageSync(STORAGE_EXPANDED, map)
  },

  onAdd() {
    wx.navigateTo({ url: '/pages/add-account/add-account' })
  },

  onTrend() {
    wx.navigateTo({ url: '/subpackages/chart-pkg/pages/chart/chart' })
  },

  onSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' })
  },

  onAbout() {
    wx.navigateTo({ url: '/pages/about/about' })
  },

  onAccountTap(e) {
    const id = e.detail.id
    if (!id) return
    wx.navigateTo({ url: '/pages/account-detail/account-detail?id=' + id })
  },
})
