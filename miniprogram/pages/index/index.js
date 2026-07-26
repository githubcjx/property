const app = getApp()
const accountSvc = require('../../services/account.js')
const statsSvc = require('../../services/stats.js')
const { CATEGORIES, isDebtCategory, isIconKey } = require('../../utils/categories.js')
const { valueCnyFen, cnyToBaseFen, baseCurrency } = require('../../utils/networth.js')
const { symbolOf, digitsOf } = require('../../utils/currency.js')
const { formatYuan, formatMoney } = require('../../utils/format.js')
const { formatRelative } = require('../../utils/date.js')
const { APP_VERSION } = require('../../utils/version.js')
const { TOOL_BADGES } = require('../../utils/toolBadges.js')
const invSvc = require('../../services/inventory.js')
const txSvc = require('../../services/transaction.js')
const growthTree = require('../../utils/growthTree.js')
const treeArt = require('../../utils/treeArt.js')
const { getTheme, isLight, DEFAULT_THEME } = require('../../utils/theme.js')

const STORAGE_TOOL_SEEN = 'tool_badge_seen'   // { 工具key: 已读到的功能版本号 }

const STORAGE_EXPANDED = 'idx_expanded_categories'

// 月报横幅：每月前 N 天提示回顾「上一个完整月」的小结（本月未手动关闭、且有账户时显示）。
const BANNER_WINDOW_DAYS = 3

const STORAGE_BANNER_DISMISS = 'report_banner_dismissed_month'  // 值为 'YYYY-M'

// 调试开关：true = 无论账户新鲜与否都强制显示盘点横幅，方便在开发者工具里看样式。
// 正常必须保持 false，否则新用户一进首页就被提示「该盘点了」。
const PREVIEW_INV_BANNER = false

// 当前月份键（用于按月判断横幅是否已被关闭）
function currentMonthKey() {
  const d = new Date()
  return d.getFullYear() + '-' + (d.getMonth() + 1)
}

// 按本位币的小数位拆分（人民币/美元=2 位，日元/韩元=0 位）
function splitAmount(fen, ccy) {
  const digits = digitsOf(ccy || 'CNY')
  const unit = Math.round(fen) / Math.pow(10, digits)
  const abs = Math.abs(unit)
  const [int, frac = ''] = abs.toFixed(digits).split('.')
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return {
    sign: unit < 0 ? '-' : '',
    int: withCommas,
    frac,
    hasFrac: digits > 0,
  }
}

Page({
  data: {
    version: APP_VERSION,
    loading: true,
    hasData: false,

    netWorthRaw: 0,
    baseSymbol: '¥',
    netHasFrac: true,
    netSign: '',
    netInt: '0',
    netFrac: '00',

    deltaText: '+¥0',
    deltaPctText: '+0.0%',
    deltaPositive: true,
    hasDelta: false,

    hideAmount: false,
    groups: [],
    // 小树：{ stage, key, name, days, updates, isMax }；无账户时 null
    tree: null,
    statusBarHeight: 20,
    expandedMap: {},

    wobbleMap: {},
    reduceMotion: false,
    theme: DEFAULT_THEME,

    // 工具 · 分析中心面板
    toolsVisible: false,
    toolsClosing: false,
    toolBadges: {},        // { 工具key: 是否显示新功能红点 }
    toolBadgeAny: false,   // 是否有任意未读（聚合到「工具」入口的红点）

    // 月报横幅
    monthlyBannerVisible: false,
    monthlyBanner: null,

    // 盘点入口：常驻内容顶部，随新鲜度变脸。{ stale, title, sub }；无账户时 null
    invEntry: null,
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
    this._refreshToolBadges()
  },

  // 工具红点：读已读记录，算出每个工具是否有未读新功能 + 是否有任意未读。
  _refreshToolBadges() {
    const seen = wx.getStorageSync(STORAGE_TOOL_SEEN) || {}
    const badges = {}
    let any = false
    Object.keys(TOOL_BADGES).forEach((k) => {
      const show = TOOL_BADGES[k] > (seen[k] || 0)
      badges[k] = show
      if (show) any = true
    })
    this.setData({ toolBadges: badges, toolBadgeAny: any })
  },

  onShow() {
    app.applyThemeChrome()
    this.setData({
      hideAmount: app.globalData.hideAmount,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
    })
    this._refreshToolBadges()
    this.refresh()
  },

  // 离开首页时掐掉可能还在跑的生长动画：看不见的帧一帧都不该画
  onHide() {
    const c = this._treeCanvas
    if (this._treeRaf && c && c.canvas.cancelAnimationFrame) {
      c.canvas.cancelAnimationFrame(this._treeRaf)
    }
    this._treeRaf = null
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

  // ============ 小树 ============
  // 阶段只由「相伴天数 + 更新次数」决定，与金额无关（理由见 utils/growthTree.js）。
  // growthStats() 并发拿条数与首笔时间，两条都极轻；账户直接用已加载的这份。
  async updateTree(accounts) {
    if (!accounts || !accounts.length) {
      this._treeCanvas = null      // 节点随 hero 一起被销毁，缓存必须失效
      this._treeKey = null
      this.setData({ tree: null })
      return
    }
    let stats = null
    try {
      stats = await txSvc.growthStats()
    } catch (e) {
      console.warn('[tree] 取成长数据失败，按种子处理', e)
    }
    const info = growthTree.evaluate(accounts, stats)
    const grew = this._treeKey && this._treeKey !== info.key   // 本次会话内升级
    this.setData({ tree: info }, () => {
      this._drawTree(!this.data.reduceMotion && (grew || !this._treeKey))
      this._treeKey = info.key
    })
    // 若这次长大还没被别处（盘点完成页）庆祝过，在这儿补一句 —— 改余额、删记录等
    // 路径也会让树变化，首页是兜底的那一处。takeGrowth 落戳，保证只说一次。
    if (growthTree.takeGrowth(info)) {
      wx.showToast({ icon: 'none', title: '小树长大了 · ' + info.name })
    }
  },

  // 画一帧或播一次生长动画。animate=false 时直接落终帧 —— 平时没有任何循环在跑。
  _drawTree(animate) {
    const paint = (canvas, ctx, W, H) => {
      // chartAccent 优先：浅色主题(硬核粗野)的信号黄画在纸底上几乎看不见，
      // 该主题已为 canvas 备了一版高对比强调色，趋势图也是这么取的。
      // muted：这条入口在催盘点(is-stale)时，树褪色睡下 —— 别让它得意洋洋地
      // 抵消那句「该盘点了」（褪色逻辑在 utils/treeArt.js）。
      const th = getTheme(this.data.theme)
      const opt = {
        accent: th.chartAccent || th.accent,
        light: isLight(this.data.theme),
        muted: !!(this.data.invEntry && this.data.invEntry.stale),
      }
      const key = this.data.tree && this.data.tree.key
      if (!key) return
      if (this._treeRaf && canvas.cancelAnimationFrame) {
        canvas.cancelAnimationFrame(this._treeRaf)
        this._treeRaf = null
      }
      if (!animate) {
        treeArt.drawStage(ctx, W, H, key, 1, opt)
        return
      }
      const t0 = Date.now()
      const DUR = 1100
      const frame = () => {
        const p = Math.min(1, (Date.now() - t0) / DUR)
        treeArt.drawStage(ctx, W, H, key, p, opt)
        // 到 1 就彻底停手：不留常驻 rAF（发热的老账，见 utils/treeArt.js 顶部）
        if (p < 1) this._treeRaf = canvas.requestAnimationFrame(frame)
        else this._treeRaf = null
      }
      frame()
    }

    if (this._treeCanvas) {
      const c = this._treeCanvas
      paint(c.canvas, c.ctx, c.W, c.H)
      return
    }
    wx.createSelectorQuery().in(this)
      .select('#treeCanvas').fields({ node: true, size: true }).exec((res) => {
        const item = res && res[0]
        if (!item || !item.node) return
        const canvas = item.node
        const ctx = canvas.getContext('2d')
        const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2
        canvas.width = item.width * dpr
        canvas.height = item.height * dpr
        ctx.scale(dpr, dpr)
        this._treeCanvas = { canvas, ctx, W: item.width, H: item.height }
        paint(canvas, ctx, item.width, item.height)
      })
  },


  // 盘点入口：常驻首页内容顶部（有账户即显示），随新鲜度变脸，不可关闭 —— 这是主动作，不是打扰。
  //   发霉(stale)：任一账户超 STALE_DAYS / 距上次盘点超期（bannerInfo.show 已含冷静期逻辑）→ 强调色催一下
  //   新鲜(calm)：数据都还新 → 安静一条，只报「最久 X 天前核对」
  updateInvEntry(accounts) {
    if (!accounts || !accounts.length) {
      this.setData({ invEntry: null })
      return
    }
    const info = invSvc.bannerInfo(accounts)
    const stale = info.show || PREVIEW_INV_BANNER
    // 最久未核对的账户天数（calm 态文案用）。
    // 只看盘点范围内的账户 —— 固定资产走独立的低频重估，拿它的天数报在这里，
    // 用户点进盘点会找不到对应的账户（见 services/inventory.js splitByScope）。
    let oldest = null
    for (const a of accounts) {
      if (!invSvc.inScope(a)) continue
      const d = invSvc.freshInfo(a).days
      if (d != null && (oldest == null || d > oldest)) oldest = d
    }
    let title, sub
    if (stale) {
      title = '该盘点了'
      if (info.staleCount > 0) sub = info.staleCount + ' 个账户超过 ' + invSvc.STALE_DAYS + ' 天没更新'
      else if (info.lastDays != null) sub = '上次盘点已是 ' + info.lastDays + ' 天前'
      else sub = '花几分钟核对各账户余额'
    } else {
      title = '盘点账户'
      if (oldest == null) sub = '核对各账户余额，几分钟更新完'
      else if (oldest === 0) sub = '今天刚核对过 · 都是最新'
      else sub = oldest + ' 天前核对 · 都还新鲜'
    }
    this.setData({ invEntry: { stale, title, sub } })
  },

  onOpenInventory() {
    wx.navigateTo({ url: '/pages/inventory/inventory' })
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
      this.updateInvEntry(accounts)
      this.updateTree(accounts)
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
        // 新鲜度小字：≤7 天不显示（减少噪音），超 30 天琥珀色警示（见 services/inventory.js）
        const fresh = invSvc.freshInfo(a)
        return Object.assign({}, a, {
          icon: isIconKey(ic) ? ic : 'folder',
          symbol: symbolOf(ccy),
          balanceText: (g.isDebt ? '−' : '') + formatMoney(a.balance || 0, ccy, { symbol: true }),
          freshText: fresh.days != null && fresh.days > invSvc.ROW_HIDE_DAYS ? fresh.text : '',
          freshStale: fresh.stale,
        })
      })
    })

    const dispNet = cnyToBaseFen(netWorth)   // 净值折算到本位币用于显示
    this._baseCcy = baseCcy                   // 供 animateNetWorth 逐帧拆分用
    const parts = splitAmount(dispNet, baseCcy)
    this.setData({
      groups: visibleGroups,
      netWorthRaw: netWorth,
      baseSymbol: baseSym,
      netSign: parts.sign,
      netInt: parts.int,
      netFrac: parts.frac,
      netHasFrac: parts.hasFrac,
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
      const parts = splitAmount(cur, this._baseCcy)
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

  onStartOnboarding() {
    wx.navigateTo({ url: '/pages/onboarding/onboarding' })
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
    const { url, badge } = e.currentTarget.dataset
    // 点进带新功能红点的工具 → 标记已读，红点消失（下次该工具再更新才会重现）
    if (badge && TOOL_BADGES[badge]) {
      const seen = wx.getStorageSync(STORAGE_TOOL_SEEN) || {}
      if ((seen[badge] || 0) < TOOL_BADGES[badge]) {
        seen[badge] = TOOL_BADGES[badge]
        wx.setStorageSync(STORAGE_TOOL_SEEN, seen)
        this._refreshToolBadges()
      }
    }
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
