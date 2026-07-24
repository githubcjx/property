// 冷启动引导：挑常见账户(认领) → 逐个估余额 → 揭晓净资产。
// 复用 amount-input 组件(mode=set)与盘点 wizard 的结构；每填一个即 addAccount 落库、可续。
// 账户创建时若余额非 0，addAccount 会自动补「初始余额」交易，净值/趋势/新鲜度一次点亮。

const app = getApp()
const accountSvc = require('../../services/account.js')
const { QUICK_ACCOUNTS } = require('../../utils/accountTemplates.js')
const { getCategory, isDebtCategory } = require('../../utils/categories.js')
const { catRgb } = require('../../utils/theme.js')
const { formatMoney } = require('../../utils/format.js')

Page({
  data: {
    statusBarHeight: 20,
    theme: 'aurora',
    reduceMotion: false,

    step: 'pick',            // pick | fill | reveal
    sections: [],            // QUICK_ACCOUNTS + colorClass + selected
    selectedCount: 0,

    // 填余额 wizard
    total: 0,
    idx: 0,
    cur: null,
    showInput: false,
    inputRgb: '167, 211, 255',

    // 揭晓
    netText: '',
  },

  onLoad() {
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const sections = QUICK_ACCOUNTS.map(s => ({
      section: s.section,
      items: s.items.map(it => Object.assign({}, it, {
        colorClass: (getCategory(it.categoryId) || {}).colorClass || 'liquid',
        selected: false,
      })),
    }))
    this.setData({
      statusBarHeight: sys.statusBarHeight || 20,
      theme: app.globalData.theme,
      reduceMotion: app.globalData.reduceMotion,
      sections,
    })
    this._netFen = 0
  },

  onShow() { app.applyThemeChrome() },

  onBack() { wx.navigateBack() },

  // ===== 挑账户 =====
  onToggle(e) {
    const { s, i } = e.currentTarget.dataset
    const sections = this.data.sections
    sections[s].items[i].selected = !sections[s].items[i].selected
    let n = 0
    sections.forEach(sec => sec.items.forEach(x => { if (x.selected) n++ }))
    this.setData({ sections, selectedCount: n })
  },

  onPickNext() {
    const list = []
    this.data.sections.forEach(sec => sec.items.forEach(it => { if (it.selected) list.push(it) }))
    if (!list.length) return
    this._fill = list
    this.setData({ total: list.length, idx: 0, step: 'fill' })
    this.applyFill()
  },

  // ===== 逐个估余额 =====
  applyFill() {
    const it = this._fill[this.data.idx]
    this.setData({ cur: it, inputRgb: catRgb(this.data.theme, it.colorClass) })
  },

  onFillOpen() { this.setData({ showInput: true }) },
  onInputCancel() { this.setData({ showInput: false }) },

  async onInputConfirm(e) {
    const { fenValue } = e.detail
    const it = this._fill[this.data.idx]
    const ai = this.selectComponent('#ai')
    try {
      await accountSvc.addAccount({
        categoryId: it.categoryId,
        subType: it.subType,
        name: it.name,
        icon: it.icon,
        balance: fenValue,
      })
      this._netFen += isDebtCategory(it.categoryId) ? -fenValue : fenValue
      if (ai) ai.finishSubmit()
      this.setData({ showInput: false })
      this.advance()
    } catch (err) {
      console.error('创建账户失败', err)
      if (ai) ai.finishSubmit()
      wx.showToast({ icon: 'none', title: '保存失败：' + (err.errMsg || err.message || '') })
    }
  },

  // 跳过 = 只跳过「数字」，账户照建（余额 0，以后再填）—— 与盘点「跳过不删账户」一致。
  async onSkip() {
    const it = this._fill[this.data.idx]
    try {
      await accountSvc.addAccount({
        categoryId: it.categoryId,
        subType: it.subType,
        name: it.name,
        icon: it.icon,
        balance: 0,
      })
    } catch (err) {
      console.error('创建账户失败(跳过)', err)
    }
    this.advance()
  },

  advance() {
    if (this.data.idx < this.data.total - 1) {
      this.setData({ idx: this.data.idx + 1 })
      this.applyFill()
    } else {
      this.setData({ step: 'reveal', netText: formatMoney(this._netFen, 'CNY', { symbol: true }) })
    }
  },

  // ===== 揭晓 =====
  onEnter() { wx.reLaunch({ url: '/pages/index/index' }) },
})
