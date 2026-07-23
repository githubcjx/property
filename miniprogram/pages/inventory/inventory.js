// 一键盘点：逐个账户「没变，确认 / 余额变了，修改 / 跳过」，让月度更新变成 5 分钟仪式。
// 每个动作即时落库（没有「提交」环节），中途退出/杀进程都不丢已确认的数据。
// 领域逻辑见 services/inventory.js；「没变」只刷 checkedAt，不造假交易。

const app = getApp()
const accountSvc = require('../../services/account.js')
const invSvc = require('../../services/inventory.js')
const { CATEGORIES, isIconKey } = require('../../utils/categories.js')
const { catRgb } = require('../../utils/theme.js')
const { symbolOf } = require('../../utils/currency.js')
const { formatMoney } = require('../../utils/format.js')
const { sumNetCnyFen, cnyToBaseFen, baseCurrency } = require('../../utils/networth.js')
const { TOOL_BADGES } = require('../../utils/toolBadges.js')

const STORAGE_TOOL_SEEN = 'tool_badge_seen'   // 与首页约定一致（utils/toolBadges.js）

Page({
  data: {
    statusBarHeight: 20,
    theme: 'aurora',
    reduceMotion: false,
    hideAmount: false,

    loading: true,
    empty: false,
    phase: 'wizard',        // wizard | done

    total: 0,
    idx: 0,
    progressPct: 0,
    cur: null,              // 当前账户的展示数据（见 buildList）
    submitting: false,

    // 改余额半屏（复用 amount-input 组件）
    showInput: false,
    inputRgb: '167, 211, 255',

    // 退出确认
    quitVisible: false,
    quitCount: 0,

    // 完成页
    okCount: 0,
    editCount: 0,
    skipCount: 0,
    doneSub: '',
    netText: '',
    baseSymbol: '¥',
    hasDelta: false,
    deltaText: '',
    deltaPositive: true,
    lastDaysText: '',
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      hideAmount: app.globalData.hideAmount,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
    })
    this._stats = { ok: 0, edit: 0, skip: 0 }
    this._markBadgeSeen()
    this.load()
  },

  onShow() {
    app.applyThemeChrome()
    this.setData({
      hideAmount: app.globalData.hideAmount,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
    })
  },

  // 从横幅进入也把工具红点标记为已读（与首页 onToolTap 的约定一致）
  _markBadgeSeen() {
    if (!TOOL_BADGES.inventory) return
    const seen = wx.getStorageSync(STORAGE_TOOL_SEEN) || {}
    if ((seen.inventory || 0) < TOOL_BADGES.inventory) {
      seen.inventory = TOOL_BADGES.inventory
      wx.setStorageSync(STORAGE_TOOL_SEEN, seen)
    }
  },

  async load() {
    this.setData({ loading: true })
    try {
      const accounts = await accountSvc.listAccounts()
      if (!accounts.length) {
        this.setData({ empty: true, loading: false })
        return
      }
      this.buildList(accounts)
      this.setData({ loading: false })
    } catch (err) {
      console.error('盘点加载失败', err)
      this.setData({ loading: false })
      wx.showToast({ icon: 'none', title: '加载失败：' + (err.errMsg || err.message || '') })
    }
  },

  // 顺序与首页一致：分类顺序 → 组内创建顺序（listAccounts 已按 createdAt 升序）
  buildList(accounts) {
    this._accounts = accounts
    const items = []
    CATEGORIES.forEach(cat => {
      const group = accounts.filter(a => a.categoryId === cat.id)
      group.forEach((a, i) => {
        const ccy = a.currency || 'CNY'
        const fresh = invSvc.freshInfo(a)
        items.push({
          _id: a._id,
          name: a.name,
          icon: isIconKey(a.icon) ? a.icon : 'folder',
          colorClass: cat.colorClass,
          isDebt: cat.id === 'debt',
          currency: ccy,
          symbol: symbolOf(ccy),
          balance: a.balance || 0,
          balanceText: formatMoney(a.balance || 0, ccy, { symbol: true }),
          freshText: fresh.text,
          freshStale: fresh.stale,
          checkedToday: fresh.days === 0,
          groupName: cat.name,
          groupIndex: i + 1,
          groupCount: group.length,
        })
      })
    })
    this._items = items
    this.setData({ total: items.length, idx: 0 })
    this.applyCurrent()
  },

  applyCurrent() {
    const idx = this.data.idx
    const it = this._items[idx]
    this.setData({
      cur: it,
      progressPct: this.data.total ? Math.round((idx / this.data.total) * 100) : 0,
    })
  },

  advance() {
    if (this.data.idx < this.data.total - 1) {
      this.setData({ idx: this.data.idx + 1 })
      this.applyCurrent()
    } else {
      this.finish(false)
    }
  },

  onPrev() {
    if (this.data.idx === 0 || this.data.submitting) return
    this.setData({ idx: this.data.idx - 1 })
    this.applyCurrent()
  },

  onSkip() {
    if (this.data.submitting) return
    this._stats.skip++
    this.advance()
  },

  // 「没变，确认」：只刷 checkedAt，不写交易
  async onConfirmSame() {
    if (this.data.submitting) return
    const it = this._items[this.data.idx]
    this.setData({ submitting: true })
    try {
      await accountSvc.touchChecked(it._id)
      it.checkedToday = true
      it.freshText = '今天更新'
      it.freshStale = false
      this._stats.ok++
      this.setData({ submitting: false })
      this.advance()
    } catch (err) {
      console.error(err)
      this.setData({ submitting: false })
      wx.showToast({ icon: 'none', title: '保存失败：' + (err.errMsg || err.message || '') })
    }
  },

  // 「余额变了，修改」：调起 amount-input（mode=set，外币按原币种输入）
  onOpenEdit() {
    if (this.data.submitting) return
    const it = this._items[this.data.idx]
    this.setData({
      showInput: true,
      inputRgb: catRgb(this.data.theme, it.colorClass),
    })
  },

  onInputCancel() {
    this.setData({ showInput: false })
  },

  async onInputConfirm(e) {
    const { fenValue, note } = e.detail
    const it = this._items[this.data.idx]
    const ai = this.selectComponent('#ai')
    try {
      await accountSvc.setBalance(it._id, fenValue, note)
      // 同步本地视图与净值计算用的账户数据
      it.balance = fenValue
      it.balanceText = formatMoney(fenValue, it.currency, { symbol: true })
      it.checkedToday = true
      it.freshText = '今天更新'
      it.freshStale = false
      const acc = (this._accounts || []).find(a => a._id === it._id)
      if (acc) acc.balance = fenValue
      this._stats.edit++
      if (ai) ai.finishSubmit()
      this.setData({ showInput: false })
      this.advance()
    } catch (err) {
      console.error(err)
      if (ai) ai.finishSubmit()
      wx.showToast({ icon: 'none', title: '保存失败：' + (err.errMsg || err.message || '') })
    }
  },

  // 关闭：盘点中且动过账户时先确认（已确认的都已落库，退出无损）；其余情形直接返回
  onClose() {
    if (this.data.phase === 'wizard' && !this.data.empty && !this.data.loading) {
      const touched = this._stats.ok + this._stats.edit
      if (touched > 0) {
        this.setData({ quitVisible: true, quitCount: touched })
        return
      }
    }
    wx.navigateBack()
  },

  onQuitContinue() {
    this.setData({ quitVisible: false })
  },

  onQuitEnd() {
    this.setData({ quitVisible: false })
    this.finish(true)
  },

  // 完成：算本次净值 +「较上次盘点」对比（回算不出历史基线时隐藏对比，不造数）
  async finish(partial) {
    const s = this._stats
    const seen = s.ok + s.edit
    const lastTs = invSvc.lastInventoryTs()

    const baseCcy = baseCurrency()
    const netCny = sumNetCnyFen(this._accounts)
    const netText = formatMoney(cnyToBaseFen(netCny), baseCcy, { symbol: true })

    this.setData({
      phase: 'done',
      progressPct: 100,
      okCount: s.ok,
      editCount: s.edit,
      skipCount: s.skip,
      doneSub: partial ? '本次过目 ' + seen + ' 个账户' : this.data.total + ' 个账户已全部过目',
      netText,
      baseSymbol: symbolOf(baseCcy),
    })

    // 对比基线按快照口径回算；先算完再记录本次盘点时间
    if (lastTs) {
      try {
        const baseline = await invSvc.netWorthAtCnyFen(lastTs, this._accounts)
        if (baseline != null) {
          const deltaCny = netCny - baseline
          const positive = deltaCny >= 0
          const days = Math.max(0, Math.floor((Date.now() - lastTs) / 86400000))
          this.setData({
            hasDelta: true,
            deltaPositive: positive,
            deltaText: (positive ? '+' : '-') + formatMoney(Math.abs(cnyToBaseFen(deltaCny)), baseCcy, { symbol: true }),
            lastDaysText: days === 0 ? '今天早些时候' : days + ' 天前',
          })
        }
      } catch (err) {
        console.warn('[inventory] 回算上次盘点基线失败，隐藏对比', err)
      }
    }
    invSvc.markInventoryDone()
  },

  // 订阅提醒：占位入口（云函数下发能力随 V2.0.1 上线）
  onSubscribeTap() {
    wx.showToast({ icon: 'none', title: '盘点提醒即将上线，敬请期待' })
  },

  onDone() {
    wx.navigateBack()
  },

  onToggleHide() {
    const next = app.toggleHideAmount()
    this.setData({ hideAmount: next })
  },

  noop() {},
})
