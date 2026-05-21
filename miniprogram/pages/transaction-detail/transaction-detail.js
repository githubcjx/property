const txSvc = require('../../services/transaction.js')
const accountSvc = require('../../services/account.js')
const { formatYuan, formatDelta } = require('../../utils/format.js')
const { formatDateTime } = require('../../utils/date.js')
const { isIconKey } = require('../../utils/categories.js')

Page({
  data: {
    tx: null,
    accountName: '',
    accountIcon: '📁',
    iconKey: '',
    timeText: '',
    deltaText: '',
    deltaCls: '',
    afterText: '',
    typeText: '',
  },

  onLoad(query) {
    this.load(query.id)
  },

  async load(id) {
    if (!id) return
    try {
      const tx = await txSvc.getById(id)
      const acc = await accountSvc.getAccount(tx.accountId).catch(() => null)
      const d = formatDelta(tx.amount, false)
      const icon = acc ? (acc.icon || '') : ''
      const useKey = isIconKey(icon)
      this.setData({
        tx,
        accountName: acc ? acc.name : '账户已删除',
        accountIcon: acc ? (icon || '📁') : '🗑',
        iconKey: useKey ? icon : '',
        timeText: formatDateTime(tx.createdAt),
        deltaText: d.text,
        deltaCls: d.cls,
        afterText: '¥' + formatYuan(tx.balanceAfter || 0, {}),
        typeText: tx.type === 'set' ? '修改余额' : '增减金额',
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
