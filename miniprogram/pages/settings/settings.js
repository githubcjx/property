const app = getApp()
const { getTheme, DEFAULT_THEME } = require('../../utils/theme.js')
const { getCurrency } = require('../../utils/currency.js')
const { APP_VERSION } = require('../../utils/version.js')
const exportSvc = require('../../services/export.js')

Page({
  data: {
    version: APP_VERSION,
    statusBarHeight: 20,
    theme: DEFAULT_THEME,
    themeName: '',
    accentColor: '#a7d3ff',   // 原生 switch 的 color 取不到 CSS 变量，用当前主题强调色
    baseCurrencyText: '',
    fxDate: '',

    // 导出：文件生成后弹出的转发面板
    sharePanelVisible: false,
    exportFileName: '',
    exportCount: 0,
    exportKindText: '',
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      theme: app.globalData.theme,
      themeName: getTheme(app.globalData.theme).name,
      accentColor: getTheme(app.globalData.theme).accent,
    })
    this.syncCurrency()
  },

  onShow() {
    app.applyThemeChrome()
    this.setData({
      theme: app.globalData.theme,
      themeName: getTheme(app.globalData.theme).name,
      accentColor: getTheme(app.globalData.theme).accent,
    })
    this.syncCurrency()
  },

  syncCurrency() {
    const code = app.globalData.baseCurrency || 'CNY'
    const c = getCurrency(code)
    const meta = app.globalData.fxRatesMeta
    this.setData({
      baseCurrencyText: code + ' ' + c.symbol,
      fxDate: (meta && meta.date) ? ('截至 ' + meta.date) : '每日自动更新',
    })
  },

  onBaseCurrency() {
    wx.navigateTo({ url: '/pages/base-currency/base-currency' })
  },

  onRates() {
    wx.navigateTo({ url: '/pages/rates/rates' })
  },

  onTheme() {
    wx.navigateTo({ url: '/pages/theme/theme' })
  },

  // ============ 导出数据 ============
  // 两张表分开导出：CSV 是单表格式，塞两张表进一个文件在 Excel 里会列错位。
  onExport() {
    wx.showActionSheet({
      itemList: ['导出变动记录', '导出账户清单'],
      success: (res) => {
        this.confirmExport(res.tapIndex === 1 ? 'accounts' : 'transactions')
      },
      fail: () => {},
    })
  },

  // 导出的是明文金额，发错人就全泄露了，先确认一次
  confirmExport(kind) {
    wx.showModal({
      title: '导出数据',
      content: '导出文件包含全部金额明文（不受「隐藏金额」影响）。下一步会让你把文件转发到微信会话，建议发给「文件传输助手」，注意不要误发他人。',
      confirmText: '继续导出',
      success: (res) => {
        if (res.confirm) this.prepareExport(kind)
      },
    })
  },

  // 先把文件生成好，再弹出转发面板让用户点按钮触发转发。
  // 关键：wx.shareFileMessage 必须在「用户点击手势」中同步调用——不能跟在 await
  // 或弹窗回调后面，否则 iOS 会报 fail can only be invoked by user TAP gesture。
  // 所以这里只负责异步生成文件，真正的转发放到 onSharePrepared（由按钮点击直接触发）。
  async prepareExport(kind) {
    if (this._exporting) return
    this._exporting = true
    // 云开发单次最多取 20 条，全量靠翻页，记录多时会慢，这里给个明确的等待态
    wx.showLoading({ title: '正在整理数据', mask: true })
    try {
      const { content, fileName, count } = await exportSvc.build(kind)
      if (!count) {
        wx.hideLoading()
        wx.showToast({ icon: 'none', title: '还没有可导出的数据' })
        return
      }
      const filePath = await exportSvc.writeTemp(fileName, content)
      wx.hideLoading()
      this._exportFilePath = filePath
      this.setData({
        sharePanelVisible: true,
        exportFileName: fileName,
        exportCount: count,
        exportKindText: kind === 'accounts' ? '账户清单' : '变动记录',
      })
    } catch (err) {
      wx.hideLoading()
      console.error('[export] 生成失败', err)
      wx.showToast({ icon: 'none', title: '导出失败：' + (err.errMsg || err.message || '') })
    } finally {
      this._exporting = false
    }
  },

  onCloseSharePanel() {
    this.setData({ sharePanelVisible: false })
  },

  // 必须保持「同步」：本函数由按钮点击直接触发，调用 shareFileMessage 之前
  // 不能有任何 await / 异步等待，否则会丢失点击手势上下文导致转发失败。
  onSharePrepared() {
    const filePath = this._exportFilePath
    if (!filePath) return
    wx.shareFileMessage({
      filePath,
      fileName: this.data.exportFileName,
      success: () => {
        this.setData({ sharePanelVisible: false })
        wx.showToast({ icon: 'success', title: '已发送' })
      },
      fail: (err) => {
        // 用户主动取消转发不算失败
        if (err && /cancel/i.test(err.errMsg || '')) return
        console.error('[export] 转发失败', err)
        wx.showToast({ icon: 'none', title: '转发失败，请稍后再试' })
      },
    })
  },

  noop() {},

  onBack() {
    wx.navigateBack()
  },

  onChangelog() {
    wx.navigateTo({ url: '/pages/changelog/changelog' })
  },

  onAbout() {
    wx.navigateTo({ url: '/pages/about/about' })
  },
})
