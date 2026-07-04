const app = getApp()
const txSvc = require('../../services/transaction.js')
const accountSvc = require('../../services/account.js')
const { formatYuan, formatDelta, yuanToFen, fenToYuan } = require('../../utils/format.js')
const { formatDateTime } = require('../../utils/date.js')
const { isIconKey, getCategory } = require('../../utils/categories.js')

function splitAmount(fen) {
  const yuan = Math.round(Math.abs(fen)) / 100
  const [int, frac = '00'] = yuan.toFixed(2).split('.')
  return {
    int: int.replace(/\B(?=(\d{3})+(?!\d))/g, ','),
    frac,
  }
}

function pad2(n) { return n < 10 ? '0' + n : '' + n }
function toDateObj(d) {
  if (!d) return new Date()
  if (d instanceof Date) return d
  if (typeof d === 'object' && d.$date) return new Date(d.$date)
  return new Date(d)
}
function fmtDateOnly(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}
function fmtTimeOnly(d) {
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}

Page({
  data: {
    txId: '',
    tx: null,
    accountName: '',
    iconKey: 'folder',
    timeText: '',
    afterText: '',
    typeText: '',

    // 中间大数字 = 本次变动金额（delta）
    positive: true,
    deltaSign: '',
    amtInt: '0',
    amtFrac: '00',

    categoryClass: 'liquid',
    categoryName: '',
    accountId: '',

    statusBarHeight: 20,

    // 编辑抽屉
    showEdit: false,
    editClosing: false,
    editAmountStr: '',
    editSign: 1,
    editNote: '',
    editDate: '',
    editTime: '',
    submitting: false,
    reduceMotion: false,
    theme: 'aurora',
  },

  onLoad(query) {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      txId: query.id || '',
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
    })
    this.load(query.id)
  },

  onShow() {
    this.setData({ reduceMotion: app.globalData.reduceMotion, theme: app.globalData.theme })
  },

  async load(id) {
    if (!id) return
    try {
      const tx = await txSvc.getById(id)
      const acc = await accountSvc.getAccount(tx.accountId).catch(() => null)
      const cat = acc ? getCategory(acc.categoryId) : null
      const icon = acc ? (acc.icon || '') : ''
      const useKey = isIconKey(icon)

      // 中间大数字始终展示「本次变动金额」(tx.amount)
      const displayAmt = tx.amount || 0
      const positive = displayAmt >= 0
      const parts = splitAmount(displayAmt)

      this.setData({
        tx,
        accountId: tx.accountId,
        accountName: acc ? acc.name : '账户已删除',
        iconKey: useKey ? icon : 'folder',
        timeText: formatDateTime(tx.createdAt),
        afterText: '¥' + formatYuan(tx.balanceAfter || 0, {}),
        typeText: tx.type === 'set' ? '修改余额' : '增减金额',
        positive,
        deltaSign: positive ? '+' : '−',
        amtInt: parts.int,
        amtFrac: parts.frac,
        categoryClass: cat ? cat.colorClass : 'liquid',
        categoryName: cat ? cat.name : '',
      })
    } catch (err) {
      console.error(err)
      wx.showToast({ icon: 'none', title: '加载失败' })
    }
  },

  onClose() { wx.navigateBack() },

  // ============== 编辑抽屉 ==============
  onOpenEdit() {
    const tx = this.data.tx
    if (!tx) return
    const fen = tx.amount || 0
    const absYuan = Math.abs(fen) / 100
    const d = toDateObj(tx.createdAt)
    this.setData({
      showEdit: true,
      editClosing: false,
      editAmountStr: absYuan ? String(absYuan) : '',
      editSign: fen < 0 ? -1 : 1,
      editNote: tx.note || '',
      editDate: fmtDateOnly(d),
      editTime: fmtTimeOnly(d),
    })
  },

  onCloseEdit() {
    if (this.data.submitting) return
    this.setData({ editClosing: true })
    setTimeout(() => this.setData({ showEdit: false, editClosing: false }), 260)
  },

  onEditAmountInput(e) { this.setData({ editAmountStr: e.detail.value }) },
  onEditNoteInput(e)   { this.setData({ editNote: e.detail.value }) },
  onEditDateChange(e)  { this.setData({ editDate: e.detail.value }) },
  onEditTimeChange(e)  { this.setData({ editTime: e.detail.value }) },

  onEditSignPos() { this.setData({ editSign: 1 }) },
  onEditSignNeg() { this.setData({ editSign: -1 }) },

  async onEditSubmit() {
    if (this.data.submitting) return
    const { editAmountStr, editSign, editNote, editDate, editTime } = this.data
    const num = Number(editAmountStr)
    if (!editAmountStr || isNaN(num) || num < 0) {
      wx.showToast({ icon: 'none', title: '请输入合法金额' })
      return
    }
    const fen = yuanToFen(num) * editSign
    if (this.data.tx.type === 'delta' && fen === 0) {
      wx.showToast({ icon: 'none', title: '变动金额不能为 0' })
      return
    }

    // 组装时间
    let createdAt
    try {
      // editDate: 'YYYY-MM-DD', editTime: 'HH:mm'
      const parts = editDate.split('-')
      const tparts = editTime.split(':')
      createdAt = new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2]),
        Number(tparts[0]),
        Number(tparts[1]),
        0,
      )
      if (isNaN(createdAt.getTime())) throw new Error('bad date')
    } catch (err) {
      wx.showToast({ icon: 'none', title: '时间格式错误' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '保存中', mask: true })
    try {
      await txSvc.updateTransaction(this.data.txId, {
        amount: fen,
        note: (editNote || '').trim() || (this.data.tx.type === 'set' ? '修改余额' : '增减金额'),
        createdAt,
      })
      wx.hideLoading()
      wx.showToast({ icon: 'success', title: '已保存' })
      this.setData({ showEdit: false, submitting: false })
      this.load(this.data.txId)
    } catch (err) {
      wx.hideLoading()
      console.error(err)
      wx.showToast({ icon: 'none', title: '保存失败：' + (err.errMsg || err.message || '') })
      this.setData({ submitting: false })
    }
  },

  noop() {},
})
