const app = getApp()
const accountSvc = require('../../services/account.js')
const { CATEGORIES, getSubType, getCategory } = require('../../utils/categories.js')
const { unitToFen, fenToUnit } = require('../../utils/format.js')
const { CURRENCIES, symbolOf } = require('../../utils/currency.js')
const { DEFAULT_THEME } = require('../../utils/theme.js')

// 币种选择器选项（显示「代码 名称」），index 对齐 CURRENCIES
const CCY_OPTIONS = CURRENCIES.map(c => c.code + ' ' + c.name)
const CCY_CODES = CURRENCIES.map(c => c.code)

// 三步流程：
//   step=1 选大类 → step=2 选子类（同页内展开） → step=3 填写表单
// 编辑模式：URL 带 editId 时进入第 3 步，预填表单
Page({
  data: {
    step: 1,
    categories: CATEGORIES.map(c => Object.assign({}, c, {
      tintClass: 'cat-tint-' + c.colorClass,
      glyphClass: 'ic-glyph-' + c.id,
    })),
    statusBarHeight: 20,

    expandedCategoryId: '',
    selectedCategoryId: '',
    selectedColorClass: 'liquid',
    selectedCategoryName: '',
    selectedTintClass: '',
    selectedSubType: null,
    customSubName: '',

    form: {
      name: '',
      balanceYuan: '',
      includeInChart: true,
      note: '',
      currency: 'CNY',
    },
    currencyOptions: CCY_OPTIONS,
    currencyIndex: 0,
    currencySymbol: '¥',

    editId: '',
    submitting: false,

    showSuccess: false,
    burstKey: 0,
    reduceMotion: false,
    theme: DEFAULT_THEME,
  },

  onLoad(query) {
    app.applyThemeChrome()
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
    })
    if (query.editId) {
      this.loadEdit(query.editId)
    }
  },

  async loadEdit(id) {
    try {
      const acc = await accountSvc.getAccount(id)
      const sub = getSubType(acc.categoryId, acc.subType)
      const cat = getCategory(acc.categoryId)
      this.setData({
        editId: id,
        step: 3,
        selectedCategoryId: acc.categoryId,
        selectedColorClass: cat ? cat.colorClass : 'liquid',
        selectedCategoryName: cat ? cat.name : '',
        selectedTintClass: 'cat-tint-' + (cat ? cat.colorClass : 'liquid'),
        selectedSubType: sub || { id: acc.subType, name: acc.name, icon: acc.icon, custom: true },
        customSubName: sub ? '' : acc.name,
        currencySymbol: symbolOf(acc.currency || 'CNY'),
        form: {
          name: acc.name,
          balanceYuan: String(fenToUnit(acc.balance || 0, acc.currency || 'CNY')),
          includeInChart: acc.includeInChart !== false,
          note: acc.note || '',
          currency: acc.currency || 'CNY',
        },
      })
      wx.setNavigationBarTitle({ title: '编辑账户' })
    } catch (err) {
      wx.showToast({ icon: 'none', title: '加载失败' })
    }
  },

  onToggleCategory(e) {
    const id = e.currentTarget.dataset.id
    this.setData({
      expandedCategoryId: this.data.expandedCategoryId === id ? '' : id,
    })
  },

  onSelectSub(e) {
    const { categoryId, subId } = e.currentTarget.dataset
    const sub = getSubType(categoryId, subId)
    if (!sub) return
    const cat = getCategory(categoryId)

    if (sub.custom) {
      wx.showModal({
        title: '自定义名称',
        editable: true,
        placeholderText: '如「招商储蓄卡」',
        success: (res) => {
          if (res.confirm) {
            const name = (res.content || '').trim()
            this.setData({
              selectedCategoryId: categoryId,
              selectedColorClass: cat.colorClass,
              selectedCategoryName: cat.name,
              selectedTintClass: 'cat-tint-' + cat.colorClass,
              selectedSubType: sub,
              customSubName: name,
              step: 3,
              form: Object.assign({}, this.data.form, { name }),
            })
          }
        },
      })
      return
    }

    this.setData({
      selectedCategoryId: categoryId,
      selectedColorClass: cat.colorClass,
      selectedCategoryName: cat.name,
      selectedTintClass: 'cat-tint-' + cat.colorClass,
      selectedSubType: sub,
      customSubName: '',
      step: 3,
      form: Object.assign({}, this.data.form, { name: '' }),
    })
  },

  onBackToList() {
    if (this.data.editId) {
      wx.navigateBack()
      return
    }
    this.setData({ step: 1, selectedSubType: null, selectedCategoryId: '' })
  },

  onBack() {
    if (this.data.step === 3 && !this.data.editId) {
      this.setData({ step: 1, selectedSubType: null, selectedCategoryId: '' })
    } else {
      wx.navigateBack()
    }
  },

  onNameInput(e)    { this.setData({ 'form.name': e.detail.value }) },
  onBalanceInput(e) { this.setData({ 'form.balanceYuan': e.detail.value }) },
  onCurrencyChange(e) {
    const idx = Number(e.detail.value) || 0
    const code = CCY_CODES[idx] || 'CNY'
    this.setData({ currencyIndex: idx, 'form.currency': code, currencySymbol: symbolOf(code) })
  },
  onChartSwitch()   { this.setData({ 'form.includeInChart': !this.data.form.includeInChart }) },
  onNoteInput(e)    { this.setData({ 'form.note': e.detail.value }) },

  async onSubmit() {
    if (this.data.submitting) return
    const { selectedCategoryId, selectedSubType, customSubName, form, editId } = this.data
    const finalName = (form.name && form.name.trim()) || customSubName || (selectedSubType && selectedSubType.name) || ''
    if (!finalName) {
      wx.showToast({ icon: 'none', title: '请填写账户名称' })
      return
    }

    const balanceFen = unitToFen(form.balanceYuan || 0, form.currency || 'CNY')
    this.setData({ submitting: true })

    try {
      if (editId) {
        await accountSvc.updateAccount(editId, {
          name: finalName,
          includeInChart: form.includeInChart,
          note: form.note || '',
          icon: selectedSubType ? selectedSubType.icon : 'folder',
        })
      } else {
        await accountSvc.addAccount({
          categoryId: selectedCategoryId,
          subType: selectedSubType ? selectedSubType.id : 'other',
          customName: customSubName,
          name: finalName,
          balance: balanceFen,
          includeInChart: form.includeInChart,
          note: form.note || '',
          icon: selectedSubType ? selectedSubType.icon : 'folder',
          currency: form.currency || 'CNY',
        })
      }
      // success animation overlay
      this.setData({
        showSuccess: true,
        burstKey: this.data.burstKey + 1,
      })
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (err) {
      console.error(err)
      wx.showToast({ icon: 'none', title: '操作失败：' + (err.errMsg || err.message || '') })
      this.setData({ submitting: false })
    }
  },
})
