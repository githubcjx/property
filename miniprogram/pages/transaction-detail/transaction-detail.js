const txSvc = require('../../services/transaction.js')
const accountSvc = require('../../services/account.js')
const { formatYuan, formatDelta } = require('../../utils/format.js')
const { formatDateTime } = require('../../utils/date.js')
const { isIconKey, getCategory } = require('../../utils/categories.js')

const CAT_RGB = {
  liquid: '167, 211, 255',
  investment: '200, 181, 255',
  fixed: '183, 232, 240',
  receivable: '224, 234, 255',
  debt: '255, 179, 179',
}

function splitAmount(fen) {
  const yuan = Math.round(Math.abs(fen)) / 100
  const [int, frac = '00'] = yuan.toFixed(2).split('.')
  return {
    int: int.replace(/\B(?=(\d{3})+(?!\d))/g, ','),
    frac,
  }
}

Page({
  data: {
    tx: null,
    accountName: '',
    iconKey: 'folder',
    timeText: '',
    afterText: '',
    typeText: '',

    positive: true,
    deltaSign: '',
    amtInt: '0',
    amtFrac: '00',

    categoryClass: 'liquid',
    categoryColor: '#a7d3ff',
    categoryRgb: '167, 211, 255',
    categoryName: '',

    statusBarHeight: 20,
  },

  onLoad(query) {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
    this.load(query.id)
  },

  async load(id) {
    if (!id) return
    try {
      const tx = await txSvc.getById(id)
      const acc = await accountSvc.getAccount(tx.accountId).catch(() => null)
      const cat = acc ? getCategory(acc.categoryId) : null
      const icon = acc ? (acc.icon || '') : ''
      const useKey = isIconKey(icon)
      const displayAmt = tx.type === 'set' ? tx.balanceAfter : tx.amount
      const positive = displayAmt >= 0
      const parts = splitAmount(displayAmt)
      this.setData({
        tx,
        accountName: acc ? acc.name : '账户已删除',
        iconKey: useKey ? icon : 'folder',
        timeText: formatDateTime(tx.createdAt),
        afterText: '¥' + formatYuan(tx.balanceAfter || 0, {}),
        typeText: tx.type === 'set' ? '修改余额' : '增减金额',
        positive,
        deltaSign: tx.type === 'delta' ? (positive ? '+' : '−') : '',
        amtInt: parts.int,
        amtFrac: parts.frac,
        categoryClass: cat ? cat.colorClass : 'liquid',
        categoryColor: cat ? cat.color : '#a7d3ff',
        categoryRgb: cat ? CAT_RGB[cat.colorClass] : '167, 211, 255',
        categoryName: cat ? cat.name : '',
      })
    } catch (err) {
      console.error(err)
      wx.showToast({ icon: 'none', title: '加载失败' })
    }
  },

  onClose() {
    wx.navigateBack()
  },
})
