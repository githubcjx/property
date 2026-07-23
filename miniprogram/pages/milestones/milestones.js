const app = getApp()
const milestonesSvc = require('../../services/milestones.js')
const goalSvc = require('../../services/goal.js')
const { formatMoney, unitToFen, fenToUnit } = require('../../utils/format.js')
const { baseCurrency, cnyToBaseFen } = require('../../utils/networth.js')
const { symbolOf } = require('../../utils/currency.js')

Page({
  data: {
    statusBarHeight: 20,
    reduceMotion: false,
    theme: 'aurora',
    hideAmount: false,
    loading: true,
    hasData: false,

    currentText: '¥0',       // 仅「全部达成」态展示

    // 关口列表 + 计数
    milestones: [],
    achievedCount: 0,
    totalCount: 7,

    // 旅程
    peak: null,
    firstPositive: null,

    // 是否所有关都达成
    allDone: false,

    // 我的目标
    goal: { hasGoal: false },
    goalLoading: true,
    goalSheetVisible: false,
    goalSheetEditing: false,
    goalNameInput: '',
    goalAmountInput: '',
    goalCcySymbol: '¥',
    goalSaving: false,
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      hideAmount: app.globalData.hideAmount,
    })
  },

  onShow() {
    app.applyThemeChrome()
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
      const r = await milestonesSvc.evaluate()
      this.applyResult(r)
      this._current = r.current
      this._growth = r.growth
      await this.refreshGoal()
    } catch (err) {
      console.error('净值目标加载失败', err)
      wx.showToast({ icon: 'none', title: '加载失败：' + (err.errMsg || err.message || '') })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 目标卡：目标本身失败不应连累里程碑（比如 goals 集合还没建），单独 try
  async refreshGoal() {
    let goal = null
    try {
      goal = await goalSvc.getActiveGoal()
    } catch (err) {
      console.warn('[goal] 读取目标失败，隐藏目标卡', err)
      this.setData({ goal: { hasGoal: false }, goalLoading: false })
      return
    }
    const view = goalSvc.buildGoalView(goal, this._current || 0, this._growth)
    // 首次达成时记一次达成时间（用于达成态展示），失败不影响页面
    if (view.hasGoal && view.state === 'achieved' && goal && !goal.achievedAt) {
      goalSvc.markAchieved(goal._id).catch(() => {})
    }
    this.setData({ goal: this.decorateGoal(view), goalLoading: false })
  },

  // 补上展示用文案：金额随全局 hideAmount 打码，进度与预计时间不打码
  //（它们不含绝对金额，且正是这张卡的意义所在）
  decorateGoal(v) {
    if (!v.hasGoal) return v
    const hide = this.data.hideAmount
    const ccy = v.currency
    const mask = v.symbol + ' ••'
    return Object.assign({}, v, {
      targetText: hide ? mask : formatMoney(v.targetFen, ccy, { symbol: true }),
      currentText: hide ? mask : formatMoney(v.currentFen, ccy, { symbol: true }),
      remainingText: hide ? mask : formatMoney(v.remainingFen, ccy, { symbol: true }),
      monthlyText: v.monthlyFen != null && !hide
        ? formatMoney(v.monthlyFen, ccy, { symbol: true })
        : mask,
    })
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

    // 关口金额是人民币锚点（¥1 万 / ¥100 万…），服务层已格式化好，原样用；
    // 但「当前净值 / 历史峰值」是真实金额，必须折算并按本位币符号显示。
    const baseCcy = baseCurrency()
    const maskText = symbolOf(baseCcy) + '••'
    const inBase = (cnyFen, opts) => formatMoney(cnyToBaseFen(cnyFen), baseCcy, Object.assign({ symbol: true }, opts))

    const peak = r.peak
      ? Object.assign({}, r.peak, { amountText: hide ? maskText : inBase(r.peak.amount) })
      : null

    this.setData({
      hasData: r.hasData,
      currentText: hide ? maskText : inBase(r.current),
      milestones,
      achievedCount,
      totalCount: milestones.length,
      peak,
      firstPositive: r.firstPositive,
      allDone: !!r.hasData && !current,
    })
  },

  // ============ 设定 / 修改目标 ============

  onOpenGoalSheet(e) {
    const editing = !!(e && e.currentTarget && e.currentTarget.dataset.edit)
    const g = this.data.goal
    const ccy = editing && g.hasGoal ? g.currency : baseCurrency()
    this.setData({
      goalSheetVisible: true,
      goalSheetEditing: editing,
      goalNameInput: editing && g.hasGoal ? g.name : '',
      goalAmountInput: editing && g.hasGoal ? String(fenToUnit(g.targetFen, ccy)) : '',
      goalCcySymbol: symbolOf(ccy),
      goalSaving: false,
    })
  },

  onCloseGoalSheet() {
    if (this.data.goalSaving) return
    this.setData({ goalSheetVisible: false })
  },

  onGoalNameInput(e) {
    this.setData({ goalNameInput: e.detail.value })
  },

  onGoalAmountInput(e) {
    this.setData({ goalAmountInput: e.detail.value })
  },

  async onSaveGoal() {
    if (this.data.goalSaving) return
    const ccy = this.data.goalSheetEditing && this.data.goal.hasGoal
      ? this.data.goal.currency
      : baseCurrency()
    const num = Number(this.data.goalAmountInput)
    if (!this.data.goalAmountInput || isNaN(num) || num <= 0) {
      wx.showToast({ icon: 'none', title: '请输入目标金额' })
      return
    }
    const targetFen = unitToFen(num, ccy)

    this.setData({ goalSaving: true })
    try {
      if (this.data.goalSheetEditing && this.data.goal.hasGoal) {
        await goalSvc.updateGoal(this.data.goal._id, {
          name: this.data.goalNameInput,
          targetFen,
        })
      } else {
        await goalSvc.createGoal({
          name: this.data.goalNameInput,
          targetFen,
          currency: ccy,
        })
      }
      this.setData({ goalSheetVisible: false, goalSaving: false })
      await this.refreshGoal()
    } catch (err) {
      console.error('保存目标失败', err)
      this.setData({ goalSaving: false })
      wx.showToast({ icon: 'none', title: '保存失败：' + (err.errMsg || err.message || '') })
    }
  },

  onArchiveGoal() {
    if (!this.data.goal.hasGoal) return
    wx.showModal({
      title: '结束这个目标',
      content: '目标会归档，进度不再显示。历史记录保留。',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await goalSvc.archiveGoal(this.data.goal._id)
          this.setData({ goalSheetVisible: false })
          await this.refreshGoal()
        } catch (err) {
          wx.showToast({ icon: 'none', title: '操作失败' })
        }
      },
    })
  },

  noop() {},

  onBack() {
    wx.navigateBack()
  },
})
