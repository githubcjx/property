const app = getApp()
const { CURRENCIES, getCurrency } = require('../../utils/currency.js')

Page({
  data: {
    statusBarHeight: 20,
    reduceMotion: false,
    theme: 'aurora',
    currencies: CURRENCIES,
    current: 'CNY',
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      current: app.globalData.baseCurrency || 'CNY',
    })
  },

  onShow() {
    this.setData({ theme: app.globalData.theme, reduceMotion: app.globalData.reduceMotion })
  },

  // 切换本位币：二次确认。只换显示单位，不改已存数据、不重算历史。
  onPick(e) {
    const code = e.currentTarget.dataset.code
    if (!code || code === this.data.current) return
    const c = getCurrency(code)
    wx.showModal({
      title: '切换本位币？',
      content: `汇总与历史净值将改为以 ${code} ${c.symbol} 显示。\n这只是切换显示单位，不会改动你已记录的任何余额；历史按当前汇率折算展示。`,
      confirmText: '切换',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          app.setBaseCurrency(code)
          this.setData({ current: code })
          wx.showToast({ icon: 'none', title: '已切换为 ' + code })
        }
      },
    })
  },

  onBack() {
    wx.navigateBack()
  },
})
