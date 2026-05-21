const { formatYuan } = require('../../utils/format.js')
const { formatShort } = require('../../utils/date.js')
const { getCategory } = require('../../utils/categories.js')

Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    categoryId: { type: String, value: '', observer: '_render' },
    iconKey: { type: String, value: '' },       // 由父级传入，避免观察器时序问题
    tintClass: { type: String, value: '' },     // 同上
    totalFen: { type: Number, value: 0, observer: '_render' },
    lastUpdated: { type: Number, value: 0, observer: '_render' },
    hideAmount: { type: Boolean, value: false, observer: '_render' },
    isDebt: { type: Boolean, value: false, observer: '_render' },
    expanded: { type: Boolean, value: false },
  },
  data: {
    name: '',
    textClass: '',
    bgClass: '',
    color: '',
    amountText: '',
    lastUpdatedText: '',
  },
  lifetimes: {
    attached() {
      this._render()
    },
  },
  methods: {
    _render() {
      const catId = this.data.categoryId
      const total = this.data.totalFen
      const lastUpdated = this.data.lastUpdated
      const hide = this.data.hideAmount
      const isDebt = this.data.isDebt
      const cat = getCategory(catId)
      const key = cat ? cat.colorClass : ''
      const sign = isDebt ? '-' : ''
      const amount = hide
        ? '****'
        : (sign + '¥' + formatYuan(Math.abs(total), {}))
      this.setData({
        name: cat ? cat.name : catId,
        textClass: key ? 'cat-' + key : '',
        bgClass: key ? 'cat-bg-' + key : '',
        color: cat ? cat.color : '#FFFFFF',
        amountText: amount,
        lastUpdatedText: lastUpdated ? '更新于 ' + formatShort(lastUpdated) : '',
      })
    },
    onTap() {
      this.triggerEvent('toggle', { categoryId: this.data.categoryId })
    },
  },
})
