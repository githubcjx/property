const { formatMoney } = require('../../utils/format.js')
const { formatShort } = require('../../utils/date.js')
const { getCategory, isIconKey } = require('../../utils/categories.js')

Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    account: { type: Object, value: null, observer: '_render' },
    hideAmount: { type: Boolean, value: false, observer: '_render' },
  },
  data: {
    name: '',
    iconKey: '',     // 新数据：图标键名
    iconText: '',    // 老数据回退：emoji 字符串
    note: '',
    amountText: '',
    colorClass: '',
    updatedText: '',
    excludedFromChart: false,
  },
  lifetimes: {
    attached() {
      this._render()
    },
  },
  methods: {
    _render() {
      const acc = this.data.account
      const hide = this.data.hideAmount
      if (!acc) return
      const cat = getCategory(acc.categoryId)
      const icon = acc.icon || ''
      const useKey = isIconKey(icon)
      this.setData({
        name: acc.name,
        iconKey: useKey ? icon : '',
        iconText: useKey ? '' : (icon || '📁'),
        note: acc.note || '',
        amountText: hide ? '****' : formatMoney(acc.balance || 0, acc.currency || 'CNY', { symbol: true }),
        colorClass: cat ? cat.colorClass : '',
        updatedText: acc.updatedAt ? formatShort(acc.updatedAt) : '',
        excludedFromChart: !acc.includeInChart,
      })
    },
    onTap() {
      const id = this.data.account && this.data.account._id
      if (id) this.triggerEvent('tap', { id })
    },
  },
})
