const accountSvc = require('../../services/account.js')
const txSvc = require('../../services/transaction.js')
const { formatYuan, formatDelta } = require('../../utils/format.js')
const { formatDateTime } = require('../../utils/date.js')
const { getCategory, isIconKey } = require('../../utils/categories.js')

// 滑动开启阈值（px），手指水平移动超过此值才认为是横向滑动
const SWIPE_THRESHOLD = 30

Page({
  data: {
    accountId: '',
    account: null,
    accountName: '',
    accountIcon: '📁',
    iconKey: '',
    accountColor: '#FFFFFF',
    balanceText: '¥0',
    colorClass: '',
    txList: [],
    loading: true,

    showInput: false,
    inputMode: 'set',
    hideAmount: false,

    // 当前左滑展开的变动记录 _id（只允许一条同时展开）
    swipeOpenId: '',
  },

  // 触摸状态（不放进 setData，避免无谓 render）
  _touchStartX: 0,
  _touchStartY: 0,
  _touchedId: '',
  _touchAxis: null, // 'x' | 'y' | null

  onLoad(query) {
    this.setData({ accountId: query.id || '' })
  },

  onShow() {
    this.refresh()
  },

  async refresh() {
    if (!this.data.accountId) return
    this.setData({ loading: true })
    try {
      const [acc, txs] = await Promise.all([
        accountSvc.getAccount(this.data.accountId),
        txSvc.listByAccount(this.data.accountId, 100),
      ])
      this.applyAccount(acc)
      this.applyTxs(txs)
    } catch (err) {
      console.error(err)
      wx.showToast({ icon: 'none', title: '加载失败' })
    } finally {
      this.setData({ loading: false })
    }
  },

  applyAccount(acc) {
    if (!acc) return
    const cat = getCategory(acc.categoryId)
    const icon = acc.icon || ''
    const useKey = isIconKey(icon)
    wx.setNavigationBarTitle({ title: acc.name })
    this.setData({
      account: acc,
      accountName: acc.name,
      accountIcon: icon || '📁',
      iconKey: useKey ? icon : '',
      accountColor: cat ? cat.color : '#FFFFFF',
      balanceText: '¥' + formatYuan(acc.balance || 0, {}),
      colorClass: cat ? 'cat-' + cat.colorClass : '',
    })
  },

  applyTxs(txs) {
    const list = txs.map(t => {
      const d = formatDelta(t.amount, false)
      return {
        _id: t._id,
        note: t.note || (t.type === 'set' ? '修改余额' : '增减金额'),
        time: formatDateTime(t.createdAt),
        deltaText: d.text,
        deltaCls: d.cls,
        afterText: '余额 ¥' + formatYuan(t.balanceAfter || 0, {}),
      }
    })
    this.setData({ txList: list, swipeOpenId: '' })
  },

  // ============== 滑动展开 ==============

  onTxTouchStart(e) {
    this._touchStartX = e.touches[0].clientX
    this._touchStartY = e.touches[0].clientY
    this._touchedId = e.currentTarget.dataset.id
    this._touchAxis = null
  },

  onTxTouchMove(e) {
    if (!this._touchedId) return
    const dx = e.touches[0].clientX - this._touchStartX
    const dy = e.touches[0].clientY - this._touchStartY

    if (this._touchAxis === null) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 5) this._touchAxis = 'x'
      else if (Math.abs(dy) > 5) this._touchAxis = 'y'
    }
    if (this._touchAxis !== 'x') return

    const id = this._touchedId
    const openId = this.data.swipeOpenId

    if (dx < -SWIPE_THRESHOLD && openId !== id) {
      this.setData({ swipeOpenId: id })
    } else if (dx > SWIPE_THRESHOLD && openId === id) {
      this.setData({ swipeOpenId: '' })
    } else if (dx < -SWIPE_THRESHOLD && openId && openId !== id) {
      // 滑到另一行：先关闭原来的，再打开当前
      this.setData({ swipeOpenId: id })
    }
  },

  onTxTouchEnd() {
    this._touchedId = ''
    this._touchAxis = null
  },

  onTxTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    // 当前有展开行：tap 用于关闭，不进入详情
    if (this.data.swipeOpenId) {
      this.setData({ swipeOpenId: '' })
      return
    }
    wx.navigateTo({ url: '/pages/transaction-detail/transaction-detail?id=' + id })
  },

  onTxDelete(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.showModal({
      title: '删除变动记录',
      content: '账户余额会按本次变动金额回退。确认删除？',
      confirmColor: '#F87171',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中', mask: true })
        try {
          await txSvc.deleteTransaction(id)
          wx.hideLoading()
          this.setData({ swipeOpenId: '' })
          wx.showToast({ icon: 'success', title: '已删除' })
          this.refresh()
        } catch (err) {
          wx.hideLoading()
          console.error(err)
          wx.showToast({ icon: 'none', title: '删除失败：' + (err.errMsg || err.message || '') })
        }
      },
    })
  },

  // ============== 余额操作 ==============

  onOpenSet() {
    this.setData({ showInput: true, inputMode: 'set', swipeOpenId: '' })
  },
  onOpenDelta() {
    this.setData({ showInput: true, inputMode: 'delta', swipeOpenId: '' })
  },
  onInputCancel() {
    this.setData({ showInput: false })
  },
  async onInputConfirm(e) {
    const { mode, fenValue, note } = e.detail
    const ai = this.selectComponent('#ai')
    try {
      if (mode === 'set') {
        await accountSvc.setBalance(this.data.accountId, fenValue, note)
      } else {
        await accountSvc.deltaBalance(this.data.accountId, fenValue, note)
      }
      if (ai) ai.finishSubmit()
      this.setData({ showInput: false })
      wx.showToast({ icon: 'success', title: '已保存' })
      this.refresh()
    } catch (err) {
      console.error(err)
      if (ai) ai.finishSubmit()
      wx.showToast({ icon: 'none', title: '保存失败：' + (err.errMsg || err.message || '') })
    }
  },

  // ============== 顶部菜单 ==============

  onEdit() {
    wx.navigateTo({ url: '/pages/add-account/add-account?editId=' + this.data.accountId })
  },

  onMore() {
    const acc = this.data.account
    if (!acc) return
    wx.showActionSheet({
      itemList: ['删除账户'],
      itemColor: '#F87171',
      success: (res) => {
        if (res.tapIndex === 0) this.confirmDelete()
      },
    })
  },

  confirmDelete() {
    wx.showModal({
      title: '删除账户',
      content: '账户将从首页隐藏，历史记录保留。确认删除？',
      confirmColor: '#F87171',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await accountSvc.softDeleteAccount(this.data.accountId)
          wx.showToast({ icon: 'success', title: '已删除' })
          setTimeout(() => wx.navigateBack(), 400)
        } catch (err) {
          wx.showToast({ icon: 'none', title: '删除失败' })
        }
      },
    })
  },
})
