const app = getApp()
const accountSvc = require('../../services/account.js')
const statsSvc = require('../../services/stats.js')
const { CATEGORIES, isDebtCategory, isIconKey } = require('../../utils/categories.js')
const { valueCnyFen, cnyToBaseFen, baseCurrency } = require('../../utils/networth.js')
const { symbolOf } = require('../../utils/currency.js')
const { formatYuan, formatMoney } = require('../../utils/format.js')
const { formatRelative } = require('../../utils/date.js')
const { APP_VERSION } = require('../../utils/version.js')

const STORAGE_EXPANDED = 'idx_expanded_categories'

// 月报横幅：每月前 N 天提示回顾「上一个完整月」的小结（本月未手动关闭、且有账户时显示）。
const BANNER_WINDOW_DAYS = 3

const STORAGE_BANNER_DISMISS = 'report_banner_dismissed_month'  // 值为 'YYYY-M'

// 当前月份键（用于按月判断横幅是否已被关闭）
function currentMonthKey() {
  const d = new Date()
  return d.getFullYear() + '-' + (d.getMonth() + 1)
}

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
    version: APP_VERSION,
    loading: true,
    hasData: false,

    netWorthRaw: 0,
    baseSymbol: '¥',
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
    reduceMotion: false,
    theme: 'aurora',

    // 工具 · 分析中心面板
    toolsVisible: false,
    toolsClosing: false,

    // 月报横幅
    monthlyBannerVisible: false,
    monthlyBanner: null,
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const stored = wx.getStorageSync(STORAGE_EXPANDED) || {}
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      hideAmount: app.globalData.hideAmount,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      expandedMap: stored,
    })
  },

  onShow() {
    this.setData({
      hideAmount: app.globalData.hideAmount,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
    })
    this.refresh()
  },

  // 月报横幅：月初前 BANNER_WINDOW_DAYS 天展示「上月小结」入口。
  // 仅做入口，不在首页算百分比（涨幅留到月报页内算），不额外查询。
  // 显示条件：①有账户 ②处于月初窗口期 ③本月未手动关闭。
  updateMonthlyBanner(accounts) {
    const now = new Date()
    const inWindow = now.getDate() <= BANNER_WINDOW_DAYS
    const dismissedMonth = wx.getStorageSync(STORAGE_BANNER_DISMISS)
    if (!accounts || !accounts.length || !inWindow || dismissedMonth === currentMonthKey()) {
      this.setData({ monthlyBannerVisible: false })
      return
    }
    // 上一个完整月（1 月时回退到去年 12 月）
    const prevMonthNum = now.getMonth() === 0 ? 12 : now.getMonth()
    this.setData({
      monthlyBannerVisible: true,
      monthlyBanner: { periodLabel: prevMonthNum + ' 月' },
    })
  },

  onOpenReport() {
    wx.navigateTo({ url: '/pages/report/report' })
  },

  onDismissReportBanner() {
    // 按月持久化：本月关闭后，重开也不再显示，直到下个月（记录过期）
    wx.setStorageSync(STORAGE_BANNER_DISMISS, currentMonthKey())
    this.setData({ monthlyBannerVisible: false })
  },

  // 定义本方法即可激活右上角「...」菜单里的「发送给朋友」
  // 显式指定 imageUrl：否则微信会截取当前页面作分享缩略图，导致净资产数字被带进分享卡片
  onShareAppMessage() {
    return {
      title: '净值本 · 极简记录你的净资产',
      path: '/pages/index/index',
      imageUrl: '/assets/logo.png',
    }
  },

  // 定义本方法即可激活右上角菜单里的「分享到朋友圈」
  onShareTimeline() {
    return {
      title: '净值本 · 看清你的净资产',
      query: '',
      imageUrl: '/assets/logo.png',
    }
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      const accounts = await accountSvc.listAccounts()
      this.buildGroups(accounts)
      this.updateMonthlyBanner(accounts)
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
      const vCny = valueCnyFen(acc)   // 原币种折算到人民币
      g.totalFen += vCny
      const upd = acc.updatedAt || acc.createdAt
      const updMs = upd ? (upd instanceof Date ? upd.getTime() : new Date(upd).getTime()) : 0
      if (updMs && (!g.lastUpdated || updMs > g.lastUpdated)) {
        g.lastUpdated = updMs
      }
      if (acc.includeInChart) {
        if (isDebtCategory(acc.categoryId)) {
          netWorth -= vCny
        } else {
          netWorth += vCny
          totalAssets += vCny
        }
      }
    }

    const visibleGroups = groups.filter(g => g.accounts.length > 0)

    // 显示口径：分组合计折算到本位币；账户金额按各自原币种展示（原币种为主）
    const baseCcy = baseCurrency()
    const baseSym = symbolOf(baseCcy)

    // pre-format display strings (WXML can't do floor/format)
    visibleGroups.forEach(g => {
      g.totalText = (g.isDebt ? '−' : '') + formatMoney(cnyToBaseFen(g.totalFen), baseCcy, { symbol: true })
      g.lastUpdatedText = g.lastUpdated ? formatRelative(g.lastUpdated) : ''
      g.accounts = g.accounts.map(a => {
        const ic = a.icon || ''
        const ccy = a.currency || 'CNY'
        return Object.assign({}, a, {
          icon: isIconKey(ic) ? ic : 'folder',
          symbol: symbolOf(ccy),
          balanceText: (g.isDebt ? '−' : '') + formatMoney(a.balance || 0, ccy, { symbol: true }),
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

    const dispNet = cnyToBaseFen(netWorth)   // 净值折算到本位币用于显示
    const parts = splitAmount(dispNet)
    this.setData({
      groups: visibleGroups,
      composition,
      netWorthRaw: netWorth,
      baseSymbol: baseSym,
      netSign: parts.sign,
      netInt: parts.int,
      netFrac: parts.frac,
      hasData: accounts.length > 0,
    })

    this.animateNetWorth(dispNet)
  },

  animateNetWorth(targetFen) {
    if (this._netRaf) clearTimeout(this._netRaf)
    // 金额隐藏时显示的是 ••••,无需逐帧 setData 滚动那些不可见的数字(buildGroups 已写入终值)
    if (this.data.hideAmount) {
      this._lastDisplayed = targetFen
      return
    }
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
    const baseCcy = baseCurrency()
    const dispDelta = cnyToBaseFen(deltaFen)
    const positive = deltaFen >= 0
    const sign = positive ? '+' : '-'
    const deltaText = sign + formatMoney(Math.abs(dispDelta), baseCcy, { symbol: true })
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

  // 工具 · 分析中心面板
  onOpenTools() {
    this.setData({ toolsVisible: true, toolsClosing: false })
  },
  onCloseTools() {
    if (!this.data.toolsVisible) return
    this.setData({ toolsClosing: true })
    // 与 .tools-sheet.closing 退出动画(0.28s)对齐,等动画跑完再卸载,避免提前移除造成跳变
    setTimeout(() => this.setData({ toolsVisible: false, toolsClosing: false }), 300)
  },
  onToolTap(e) {
    const url = e.currentTarget.dataset.url
    this.setData({ toolsVisible: false, toolsClosing: false })
    if (url) wx.navigateTo({ url })
  },
  onSheetNoop() {},

  onSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' })
  },
  onAccountTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/pages/account-detail/account-detail?id=' + id })
  },
})
