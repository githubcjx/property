// 盘点：一屏列出「会动」的账户，默认视为没变，只点要改的那几个，最后一次批量提交。
//
// 为什么是一屏而不是逐个向导（V2.3 重写）：
//   旧版一屏一个账户，15 个账户就是 15 次翻屏 + 15 次云写入往返，其中十来个是
//   一年都不会动的房产 / 车 / 定期。真正拖慢盘点的从来不是「改数字」，而是
//   「为一堆明知没变的东西按一次、再等一次」。所以这里做两件事：
//     1. 列表只放会动的账户（固定资产走独立的低频重估，见 services/inventory.js
//        splitByScope / fixedSummary）—— 依据是用户建账户时自己选的分类，不做任何推断；
//     2. 没被点过的行 = 没变，提交时统一 touchChecked，不需要逐个确认。
//   「一次确认全部」之所以站得住，正是因为剩下的行少到能同时显示在一屏上：
//   用户读完 4 个数字再按，那是真的核对；如果这一按盖掉的是 11 个看不见的账户，
//   那就只是在按按钮，checkedAt 会变成谎话（不变量 10）。
//
// 提交前不落库，所以未保存时退出要拦一下（onClose）。这里刻意不做本地草稿：
// 列表只有几行，为它引入 storage 草稿 + 恢复条 + 跨设备一致性，换来的收益远小于代价。
//
// scope=fixed 时本页变成「重新估个价」：同一套列表与提交逻辑，但不是盘点 ——
// 不写 inv_last_ts、不进完成页、没有小树和提醒，估完即退。

const app = getApp()
const accountSvc = require('../../services/account.js')
const invSvc = require('../../services/inventory.js')
const reminderSvc = require('../../services/reminder.js')
const { isIconKey, getCategory } = require('../../utils/categories.js')
const { catRgb, DEFAULT_THEME } = require('../../utils/theme.js')
const { symbolOf } = require('../../utils/currency.js')
const { formatMoney } = require('../../utils/format.js')
const { sumNetCnyFen, cnyToBaseFen, baseCurrency } = require('../../utils/networth.js')
const { goBack } = require('../../utils/nav.js')
const txSvc = require('../../services/transaction.js')
const growthTree = require('../../utils/growthTree.js')
const treeArt = require('../../utils/treeArt.js')
const { getTheme, isLight } = require('../../utils/theme.js')

// Promise.allSettled 在低版本基础库上不一定有，自己兜一个：每个任务都不会 reject，
// 失败的行留在页面上重试，成功的不再重发。
function settle(p) {
  return p.then(() => ({ ok: true }), (err) => ({ ok: false, err }))
}

// 上月小结入口的窗口期：每月前 N 天。月报讲的是「上一个完整月」，
// 过了月初再提就不新鲜了；平时想看，「回顾」里常驻着。
const REPORT_WINDOW_DAYS = 3
function inReportWindow() {
  return new Date().getDate() <= REPORT_WINDOW_DAYS
}
// 上一个完整月（1 月时回退到去年 12 月）
function prevMonthLabel() {
  const m = new Date().getMonth()
  return (m === 0 ? 12 : m) + ' 月'
}

// 主角字号 112rpx 在 750rpx 屏宽下大约放得下 11 个字形；再长就要降一档，
// 否则「−¥12,345,678」会顶破屏幕。WXSS 没有 auto-fit，只能在这里按长度判一次。
const HERO_BIG_MAX = 11
function isLongAmount(text) {
  return String(text || '').length > HERO_BIG_MAX
}

Page({
  data: {
    statusBarHeight: 20,
    theme: DEFAULT_THEME,
    reduceMotion: false,
    hideAmount: false,

    loading: true,
    empty: false,
    phase: 'list',          // list | done
    scope: 'moving',        // moving 月度盘点 | fixed 固定资产重估
    navTitle: '盘点',
    leadText: '看一眼，哪个数不对就点它改掉',

    rows: [],               // 见 buildRows
    editedCount: 0,         // 已改动（值真的变了）的行数
    touchedCount: 0,        // 被点开填过数的行数（含填了同一个数的）
    failedCount: 0,         // 上次提交没存上的行数
    submitting: false,

    // 固定资产入口（scope=moving 时才显示）
    fixed: { count: 0, agoText: '', due: false },

    // 改余额半屏（复用 amount-input 组件）
    showInput: false,
    inputRgb: '167, 211, 255',
    editing: null,          // 当前正在编辑的行

    // 退出确认
    quitVisible: false,

    // 完成页 · HERO（唯一主角：这次净值动了多少）
    // heroReady：主角是否已定稿。false 时只占位，绝不先亮一个待会儿要改写的数字
    heroReady: false,
    heroMode: 'baseline',   // baseline 首次/无对比 | gain 涨 | loss 跌
    heroEyebrow: '你的起点',
    heroBig: '',            // 主角大字：gain/loss 为变动量，baseline 为当前净值本身
    heroBigLong: false,     // 金额过长（>11 字形）时降一档字号，见 isLongAmount
    heroBigMasked: '',      // 隐藏金额时的占位
    heroSub: '',
    heroNetShow: false,     // gain/loss 时在主角下补一行「现在 ¥X」
    skipNote: '',
    netText: '',
    baseSymbol: '¥',

    // 小树：与主角合成一幅画（V3.1）。treeShow 有账户就为 true（每次盘点都显示）；
    // treeGrew 仅这次跨阶段线时为 true（播生长动画 + 加一行庆祝）
    treeShow: false,
    treeGrew: false,
    treeName: '',
    treeDays: 0,
    treeUpdates: 0,

    // 上月小结入口：只在每月前 REPORT_WINDOW_DAYS 天出现
    reportRow: false,
    reportLabel: '',

    // 提醒订阅：'off' 未订阅 | 'on' 已订阅 | 'soon' 模板未配置（显示「即将上线」）
    remindState: 'soon',
    remindBusy: false,
  },

  onLoad(query) {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const scope = query && query.scope === 'fixed' ? 'fixed' : 'moving'
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      hideAmount: app.globalData.hideAmount,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      scope,
      navTitle: scope === 'fixed' ? '重新估个价' : '盘点',
      leadText: scope === 'fixed'
        ? '房子和车不会每月变，一年看一次就够'
        : '看一眼，哪个数不对就点它改掉',
    })
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

  // 离开时掐掉可能还在跑的生长动画：看不见的帧一帧都不该画
  onUnload() {
    const c = this._doneTreeCanvas
    if (this._doneTreeRaf && c && c.cancelAnimationFrame) c.cancelAnimationFrame(this._doneTreeRaf)
    this._doneTreeRaf = null
  },

  async load() {
    this.setData({ loading: true })
    try {
      const accounts = await accountSvc.listAccounts()
      this._accounts = accounts
      const { moving, fixed } = invSvc.splitByScope(accounts)
      const list = this.data.scope === 'fixed' ? fixed : moving
      // 固定资产摘要照常算：只有固定资产的用户（比如只记了一套房），盘点列表是空的，
      // 但空态里仍要给出「去重新估个价」这条出路，不能只丢一句「还没有账户数据」。
      const fixedSummary = this.data.scope === 'moving'
        ? invSvc.fixedSummary(accounts)
        : { count: 0, agoText: '', due: false }
      if (!list.length) {
        this.setData({ empty: true, loading: false, fixed: fixedSummary })
        return
      }
      this.buildRows(list)
      this.setData({ loading: false, fixed: fixedSummary })
    } catch (err) {
      console.error('盘点加载失败', err)
      this.setData({ loading: false })
      wx.showToast({ icon: 'none', title: '加载失败：' + (err.errMsg || err.message || '') })
    }
  },

  // 顺序按「离上次核对最久」降序 —— 盘点是干活，干活按紧急排，不按分类排。
  // 天数相同的保持 listAccounts 的创建顺序（sort 稳定性在小程序端不保证，故带上 seq）。
  buildRows(accounts) {
    const rows = accounts.map((a, seq) => {
      const cat = getCategory(a.categoryId) || {}
      const ccy = a.currency || 'CNY'
      const fresh = invSvc.freshInfo(a)
      return {
        _id: a._id,
        seq,
        name: a.name,
        icon: isIconKey(a.icon) ? a.icon : 'folder',
        colorClass: cat.colorClass || 'liquid',
        isDebt: cat.id === 'debt',
        currency: ccy,
        symbol: symbolOf(ccy),
        balance: a.balance || 0,
        balanceText: formatMoney(a.balance || 0, ccy, { symbol: true }),
        freshDays: fresh.days == null ? -1 : fresh.days,
        freshText: fresh.days == null ? '' : (fresh.stale ? fresh.days + ' 天没核对' : '上次核对 ' + fresh.agoText),
        freshStale: fresh.stale,
        newBalance: null,
        newBalanceText: '',
        deltaText: '',
        deltaPositive: true,
        isSame: false,
        failed: false,
      }
    })
    rows.sort((x, y) => (y.freshDays - x.freshDays) || (x.seq - y.seq))
    this._rows = rows
    this.flushRows()
  },

  // 本地状态 → 视图。所有计数都从 _rows 现算，不维护额外计数器（改判/重试都能自洽）。
  flushRows() {
    const rows = this._rows || []
    let edited = 0
    let touched = 0
    let failed = 0
    for (const r of rows) {
      if (r.newBalance != null) {
        touched++
        if (r.newBalance !== r.balance) edited++
      }
      if (r.failed) failed++
    }
    this.setData({ rows, editedCount: edited, touchedCount: touched, failedCount: failed })
  },

  // ===== 编辑一行 =====
  onRowTap(e) {
    if (this.data.submitting) return
    const id = e.currentTarget.dataset.id
    const row = (this._rows || []).find(r => r._id === id)
    if (!row) return
    this.setData({
      editing: row,
      showInput: true,
      inputRgb: catRgb(this.data.theme, row.colorClass),
    })
  },

  onInputCancel() {
    this.setData({ showInput: false })
  },

  // 只改本地，不落库 —— 落库统一在 onSubmit
  onInputConfirm(e) {
    const { fenValue } = e.detail
    const editing = this.data.editing
    const ai = this.selectComponent('#ai')
    const row = (this._rows || []).find(r => r._id === (editing && editing._id))
    if (row) {
      row.newBalance = fenValue
      row.newBalanceText = formatMoney(fenValue, row.currency, { symbol: true })
      row.failed = false
      const diff = fenValue - row.balance
      row.isSame = diff === 0
      // 负债的「变好」是欠款变少，所以正负号看的是钱的方向，不是数字方向
      row.deltaPositive = row.isDebt ? diff < 0 : diff > 0
      row.deltaText = row.isSame
        ? ''
        : (diff > 0 ? '+' : '−') + formatMoney(Math.abs(diff), row.currency, { symbol: true })
    }
    if (ai) ai.finishSubmit()
    this.setData({ showInput: false })
    this.flushRows()
  },

  // ===== 提交 =====
  // 没点过的行 = 没变 → touchChecked（只盖核对时间，不写交易，不变量 3）
  // 点过但填了同一个数的行，同样只 touchChecked —— 用户确认了「就是这个数」，
  // 硬写一笔 amount=0 的交易会污染流水和所有基于 balanceAfter 的回算。
  async onSubmit() {
    if (this.data.submitting) return
    const rows = this._rows || []
    // 上一轮有失败时，这次只重试失败的那几行，成功的不再重发
    const targets = this.data.failedCount > 0 ? rows.filter(r => r.failed) : rows
    if (!targets.length) return

    this.setData({ submitting: true })
    const results = await Promise.all(targets.map(r => {
      const changed = r.newBalance != null && r.newBalance !== r.balance
      return settle(changed
        ? accountSvc.setBalance(r._id, r.newBalance, '盘点')
        : accountSvc.touchChecked(r._id))
    }))

    let failed = 0
    targets.forEach((r, i) => {
      if (results[i].ok) {
        r.failed = false
        if (r.newBalance != null && r.newBalance !== r.balance) {
          // 同步本地账户数据，完成页的净值才是提交后的净值
          const acc = (this._accounts || []).find(a => a._id === r._id)
          if (acc) acc.balance = r.newBalance
          r.balance = r.newBalance
          r.balanceText = r.newBalanceText
        }
      } else {
        r.failed = true
        failed++
        console.error('[inventory] 保存失败', r.name, results[i].err)
      }
    })
    this.setData({ submitting: false })
    this.flushRows()

    if (failed > 0) {
      wx.showToast({ icon: 'none', title: failed + ' 项没存上，可重试' })
      return
    }
    if (this.data.scope === 'fixed') {
      wx.showToast({ icon: 'success', title: '已更新' })
      setTimeout(goBack, 600)
      return
    }
    this.finish()
  },

  // ===== 退出 =====
  // 有没保存的改动才拦；没有就直接走（点进来看一眼再退出不该被打断）
  onClose() {
    if (this.data.submitting) return
    if (this.data.phase === 'list' && this.data.touchedCount > 0) {
      this.setData({ quitVisible: true })
      return
    }
    goBack()
  },

  onQuitContinue() { this.setData({ quitVisible: false }) },
  onQuitDiscard() { this.setData({ quitVisible: false }); goBack() },
  onQuitSave() { this.setData({ quitVisible: false }); this.onSubmit() },

  // ===== 固定资产：另一条低频车道 =====
  onOpenFixed() {
    wx.navigateTo({ url: '/pages/inventory/inventory?scope=fixed' })
  },

  // 完成：主角是「这次净值动了多少」。回算不出上次基线时降级为「起点」呈现，绝不造对比。
  async finish() {
    const lastTs = invSvc.lastInventoryTs()

    const baseCcy = baseCurrency()
    const baseSym = symbolOf(baseCcy)
    const netCny = sumNetCnyFen(this._accounts)
    const netText = formatMoney(cnyToBaseFen(netCny), baseCcy, { symbol: true })

    // 「起点」呈现：没有上次可比时这就是终局；有上次但回算失败时它也是兜底。
    const baselineHero = {
      heroMode: 'baseline',
      heroEyebrow: '你的起点',
      heroBig: netText,
      heroBigLong: isLongAmount(netText),
      heroBigMasked: baseSym + ' ••••',
      heroSub: lastTs
        ? '这次暂时算不出与上次的对比，先记下现在的净值'
        : '记住这个数 —— 下次盘点，就知道自己走了多远',
      heroNetShow: false,
      heroReady: true,
    }

    // 主角只写一次，绝不中途改口。有上次盘点时结果要等回算完才知道，
    // 那就先空着占位 —— 先亮一个「你的起点 ¥X」再改成「较上次 +¥Y」，
    // 用户看见的是 App 当着他的面改答案，那是闪烁，不是加载。
    this.setData(Object.assign({
      phase: 'done',
      netText,
      baseSymbol: baseSym,
      reportRow: inReportWindow(),
      reportLabel: prevMonthLabel(),
    }, lastTs ? { heroReady: false } : baselineHero), () => this._maybeDrawTree())

    this._refreshRemindState()
    this.checkTreeGrowth()

    // 对比基线按快照口径回算；先算完再记录本次盘点时间
    if (lastTs) {
      let hero = null
      try {
        const baseline = await invSvc.netWorthAtCnyFen(lastTs, this._accounts)
        if (baseline != null) {
          const deltaCny = netCny - baseline
          const positive = deltaCny >= 0
          const days = Math.max(0, Math.floor((Date.now() - lastTs) / 86400000))
          const bigText = (positive ? '+' : '−') + formatMoney(Math.abs(cnyToBaseFen(deltaCny)), baseCcy, { symbol: true })
          // 主角就是「这次动了多少」：涨发光、跌平静、金额下沉为副信息
          hero = {
            heroMode: positive ? 'gain' : 'loss',
            heroEyebrow: '较上次盘点',
            heroBig: bigText,
            heroBigLong: isLongAmount(bigText),
            heroBigMasked: (positive ? '+ ' : '− ') + baseSym + ' ••••',
            heroSub: '从 ' + (days === 0 ? '今天早些时候' : days + ' 天前') + ' 那次盘点算起',
            heroNetShow: true,
            heroReady: true,
          }
        }
      } catch (err) {
        console.warn('[inventory] 回算上次盘点基线失败，降级为「起点」呈现', err)
      }
      // 成功或兜底都在这一次 setData 里定稿，主角自始至终只被写过一遍。
      // 树的 canvas 长在 heroReady 的 block 里，定稿这一刻节点才存在 —— 回调里补画。
      this.setData(hero || baselineHero, () => this._maybeDrawTree())
    }
    invSvc.markInventoryDone()
  },

  // 完成页的小树：每次盘点都显示（让"你刚做完事"这一刻总有回应，且功能可被发现），
  // 但只有这次真跨了阶段线才庆祝 —— 播生长动画 + 标题改「长大了」。没跨线就静静立着，
  // 底下一行只回望"相伴多久、更新过多少次"，绝不写"再更新 N 次"那种任务式前瞻文案。
  // takeGrowth 决定"是否庆祝"并落戳，保证同一次成长首页不会再恭喜一遍。失败静默。
  async checkTreeGrowth() {
    try {
      const info = growthTree.evaluate(this._accounts, await txSvc.growthStats())
      const grew = growthTree.takeGrowth(info)
      this._treeInfo = { key: info.key, grew }
      this.setData({
        treeShow: true,
        treeGrew: grew,
        treeName: info.name,
        treeDays: info.days,
        treeUpdates: info.updates,
      }, () => this._maybeDrawTree())
    } catch (err) {
      console.warn('[inventory] 小树阶段判定失败，跳过', err)
    }
  },

  // 树的 canvas 现在长在 hero 里（V3.1 合一），节点只有 heroReady 之后才存在。
  // 而阶段判定与主角回算是两条并行的异步链，谁先到不一定 —— 所以两边都调这里，
  // 条件齐了才画，且只画一次（否则生长动画会被重播一遍）。
  _maybeDrawTree() {
    if (this._treeDrawn) return
    if (!this.data.heroReady || !this.data.treeShow || !this._treeInfo) return
    this._treeDrawn = true
    this._drawDoneTree(this._treeInfo.key)
  },

  // 生长动画每次盘点都播一遍（简化动效时除外）。
  //
  // 早先只在跨阶段那次播，理由是「稀有，所以值钱」。那条理由适用于天天见的东西，
  // 不适用于一个月见一次的：隔 30 天，用户根本记不得上次动画长什么样，
  // 稀有性感知不到，换来的只是 11 个月里每次都看一张静止图。
  // 真正让人知道「树长大了」的是那行徽标和树本身变大了（is-grew 的地光），
  // 不是动画播没播 —— 所以庆祝的信号留给它们，动画回归它本来的职责：
  // 回应「你刚做完一件事」。
  _drawDoneTree(key) {
    const animate = !this.data.reduceMotion
    wx.createSelectorQuery().in(this)
      .select('#doneTree').fields({ node: true, size: true }).exec((res) => {
        const item = res && res[0]
        if (!item || !item.node) return
        const canvas = item.node
        const ctx = canvas.getContext('2d')
        const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2
        canvas.width = item.width * dpr
        canvas.height = item.height * dpr
        ctx.scale(dpr, dpr)
        const th = getTheme(this.data.theme)
        // pad：画布比树大一圈，把树冠外发光完整留在画布内（见 utils/treeArt.js 的 pad 说明）。
        // 这一圈透明留白由 .hero-tree 的负外边距在版面上抵掉。
        const opt = { accent: th.chartAccent || th.accent, light: isLight(this.data.theme), pad: 0.13 }
        if (!animate) {
          treeArt.drawStage(ctx, item.width, item.height, key, 1, opt)
          return
        }
        const t0 = Date.now()
        const frame = () => {
          const p = Math.min(1, (Date.now() - t0) / 1100)
          treeArt.drawStage(ctx, item.width, item.height, key, p, opt)
          // 播完即止，不留常驻 rAF（见 utils/treeArt.js 顶部）
          if (p < 1) this._doneTreeRaf = canvas.requestAnimationFrame(frame)
          else this._doneTreeRaf = null
        }
        this._doneTreeCanvas = canvas
        frame()
      })
  },

  // 完成页刻意没有「目标进度」卡（V3.1 删除，别加回来）：
  // 「离目标还差多少」是回望时的问题，不是刚做完一件事时的问题 —— 摆在这里，
  // 只会让一次不错的更新显得渺小。目标进度常驻在「回顾」中枢里（趋势页底部）。

  onOpenReport() {
    wx.navigateTo({ url: '/pages/report/report' })
  },

  // 提醒入口状态：模板未配置时保持「即将上线」，否则查一次是否已有未使用的订阅额度
  async _refreshRemindState() {
    if (!reminderSvc.isConfigured()) {
      this.setData({ remindState: 'soon' })
      return
    }
    try {
      const pending = await reminderSvc.isPending()
      this.setData({ remindState: pending ? 'on' : 'off' })
    } catch (err) {
      console.warn('[inventory] 读取提醒订阅状态失败', err)
      this.setData({ remindState: 'off' })
    }
  },

  // 「下月初提醒我盘点」：微信一次性订阅，同意后记一次额度，云函数每月 1 日发
  async onSubscribeTap() {
    if (this.data.remindBusy) return
    if (this.data.remindState === 'soon') {
      wx.showToast({ icon: 'none', title: '提醒功能还在开发中' })
      return
    }
    if (this.data.remindState === 'on') {
      wx.showToast({ icon: 'none', title: '已订阅，下月初会提醒你' })
      return
    }
    this.setData({ remindBusy: true })
    const r = await reminderSvc.requestSubscribe()
    this.setData({ remindBusy: false })
    if (r === 'ok') {
      this.setData({ remindState: 'on' })
      wx.showToast({ icon: 'success', title: '下月初会提醒你' })
    } else if (r === 'reject') {
      wx.showToast({ icon: 'none', title: '已取消订阅' })
    } else if (r === 'unconfigured') {
      this.setData({ remindState: 'soon' })
    } else {
      wx.showToast({ icon: 'none', title: '订阅失败，稍后再试' })
    }
  },

  onDone() {
    goBack()
  },

  noop() {},
})
