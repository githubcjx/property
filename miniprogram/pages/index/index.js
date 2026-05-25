const app = getApp()
const accountSvc = require('../../services/account.js')
const statsSvc = require('../../services/stats.js')
const { CATEGORIES, isDebtCategory, isIconKey } = require('../../utils/categories.js')
const { formatYuan } = require('../../utils/format.js')
const { formatRelative } = require('../../utils/date.js')

const STORAGE_EXPANDED = 'idx_expanded_categories'

function splitAmount(fen) {
  const yuan = Math.round(fen) / 100
  const abs = Math.abs(yuan)
  const [int, frac = '00'] = abs.toFixed(2).split('.')
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return {
    sign: yuan < 0 ? '-' : '',
    int: withCommas,
    frac,
  }
}

Page({
  data: {
    version: 'V1.1',
    loading: true,
    hasData: false,

    netWorthRaw: 0,
    netSign: '',
    netInt: '0',
    netFrac: '00',

    deltaText: '+¥0',
    deltaPctText: '+0.0%',
    deltaPositive: true,
    hasDelta: false,

    hideAmount: false,
    groups: [],
    composition: [],
    statusBarHeight: 20,
    expandedMap: {},

    wobbleMap: {},
    netShineKey: 0,
    reduceMotion: false,
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const stored = wx.getStorageSync(STORAGE_EXPANDED) || {}
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      hideAmount: app.globalData.hideAmount,
      reduceMotion: app.globalData.reduceMotion,
      expandedMap: stored,
    })
  },

  onShow() {
    this.setData({
      hideAmount: app.globalData.hideAmount,
      reduceMotion: app.globalData.reduceMotion,
    })
    this.refresh()
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      const accounts = await accountSvc.listAccounts()
      this.buildGroups(accounts)
      statsSvc.getNetWorthDelta(30, accounts).then(({ delta, deltaPct }) => {
        this.applyDelta(delta, deltaPct)
      }).catch(() => {})
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
      glyphClass: 'ic-glyph-' + cat.id,
      tintClass: 'cat-tint-' + cat.colorClass,
      isDebt: cat.id === 'debt',
      totalFen: 0,
      lastUpdated: 0,
      accounts: [],
    }))
    const map = groups.reduce((m, g) => { m[g.categoryId] = g; return m }, {})

    let netWorth = 0
    let totalAssets = 0
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
        if (isDebtCategory(acc.categoryId)) {
          netWorth -= (acc.balance || 0)
        } else {
          netWorth += (acc.balance || 0)
          totalAssets += (acc.balance || 0)
        }
      }
    }

    const visibleGroups = groups.filter(g => g.accounts.length > 0)

    // pre-format display strings (WXML can't do floor/format)
    visibleGroups.forEach(g => {
      g.totalText = (g.isDebt ? '−¥' : '¥') + formatYuan(g.totalFen, {})
      g.lastUpdatedText = g.lastUpdated ? formatRelative(g.lastUpdated) : ''
      g.accounts = g.accounts.map(a => {
        const ic = a.icon || ''
        return Object.assign({}, a, {
          icon: isIconKey(ic) ? ic : 'folder',
          balanceText: (g.isDebt ? '−¥' : '¥') + formatYuan(a.balance || 0, {}),
        })
      })
    })

    const composition = CATEGORIES.map(cat => {
      const g = map[cat.id]
      const v = g ? g.totalFen : 0
      const pct = totalAssets > 0 ? v / totalAssets : 0
      const sizeRpx = Math.max(28, Math.round(28 + pct * 64))
      return {
        id: cat.id,
        name: cat.name,
        color: cat.color,
        rgbName: cat.colorClass,
        sizeRpx,
        valueYuan: Math.round(v / 100),
      }
    })

    const parts = splitAmount(netWorth)
    this.setData({
      groups: visibleGroups,
      composition,
      netWorthRaw: netWorth,
      netSign: parts.sign,
      netInt: parts.int,
      netFrac: parts.frac,
      hasData: accounts.length > 0,
      netShineKey: this.data.netShineKey + 1,
    })

    this.animateNetWorth(netWorth)
  },

  animateNetWorth(targetFen) {
    if (this._netRaf) clearTimeout(this._netRaf)
    const startFen = this._lastDisplayed != null ? this._lastDisplayed : 0
    if (startFen === targetFen) {
      this._lastDisplayed = targetFen
      return
    }
    const duration = 1200
    const t0 = Date.now()
    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const cur = Math.round(startFen + (targetFen - startFen) * eased)
      const parts = splitAmount(cur)
      this.setData({
        netSign: parts.sign,
        netInt: parts.int,
        netFrac: parts.frac,
      })
      if (t < 1) {
        this._netRaf = setTimeout(tick, 36)
      } else {
        this._lastDisplayed = targetFen
      }
    }
    tick()
  },

  applyDelta(deltaFen, deltaPct) {
    const positive = deltaFen >= 0
    const sign = positive ? '+' : '-'
    const deltaText = sign + '¥' + formatYuan(Math.abs(deltaFen), {})
    const pctStr = (positive ? '+' : '') + (Math.round(deltaPct * 10) / 10).toFixed(1) + '%'
    this.setData({
      deltaText,
      deltaPctText: pctStr,
      deltaPositive: positive,
      hasDelta: true,
    })
  },

  onToggleHide() {
    const next = app.toggleHideAmount()
    this.setData({ hideAmount: next })
  },

  onToggleGroup(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const map = Object.assign({}, this.data.expandedMap)
    if (map[id]) delete map[id]
    else map[id] = true
    const wobble = Object.assign({}, this.data.wobbleMap)
    wobble[id] = (wobble[id] || 0) + 1
    this.setData({ expandedMap: map, wobbleMap: wobble })
    wx.setStorageSync(STORAGE_EXPANDED, map)
  },

  onAdd() {
    wx.navigateTo({ url: '/pages/add-account/add-account' })
  },
  onTrend() {
    wx.navigateTo({ url: '/subpackages/chart-pkg/pages/chart/chart' })
  },
  onHealth() {
    wx.navigateTo({ url: '/pages/health/health' })
  },
  onMilestones() {
    wx.navigateTo({ url: '/pages/milestones/milestones' })
  },
  onSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' })
  },
  onAccountTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/pages/account-detail/account-detail?id=' + id })
  },
})
