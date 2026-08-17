const { unitToFen } = require('../../utils/format.js')
const { digitsOf } = require('../../utils/currency.js')

// 半屏金额输入面板。两种模式：
//   mode='set'   修改余额：输入新的目标余额
//   mode='delta' 增减金额：输入变化量，+/- 切换正负

Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    mode: { type: String, value: 'set' },
    visible: { type: Boolean, value: false },
    accountName: { type: String, value: '' },
    accountIcon: { type: String, value: 'folder' },
    accountIconKey: { type: String, value: 'folder' },
    categoryClass: { type: String, value: 'liquid' },
    categoryRgb: { type: String, value: '167, 211, 255' },
    currentBalanceFen: { type: Number, value: 0 },
    currentBalanceText: { type: String, value: '' },
    currency: { type: String, value: 'CNY' },
    currencySymbol: { type: String, value: '¥' },
  },
  data: {
    raw: '',
    sign: 1,
    note: '',
    defaultNote: '',
    title: '',
    submitting: false,
    closing: false,
  },
  observers: {
    'mode, visible'(mode, visible) {
      if (visible) {
        const def = mode === 'set' ? '修改余额' : '增减金额'
        this.setData({
          raw: '',
          sign: 1,
          note: '',
          defaultNote: def,
          title: def,
          submitting: false,
          closing: false,
        })
      }
    },
  },
  methods: {
    noop() {},

    onKey(e) {
      if (this.data.submitting) return
      const k = e.currentTarget.dataset.k
      let raw = this.data.raw
      if (k === 'back') {
        raw = raw.slice(0, -1)
      } else if (k === '.') {
        if (digitsOf(this.data.currency) === 0) return   // 无小数位币种（如 JPY）不允许小数点
        if (raw.includes('.')) return
        if (raw === '') raw = '0.'
        else raw = raw + '.'
      } else {
        if (raw === '0') {
          raw = k
        } else {
          const maxDec = digitsOf(this.data.currency)
          if (raw.includes('.') && raw.split('.')[1].length >= maxDec) return
          if (raw.replace('.', '').length >= 12) return
          raw = raw + k
        }
      }
      this.setData({ raw })
    },

    onSelectSign(e) {
      const s = Number(e.currentTarget.dataset.s)
      if (s === 1 || s === -1) this.setData({ sign: s })
    },

    onNoteInput(e) {
      this.setData({ note: e.detail.value })
    },

    onCancel() {
      if (this.data.submitting) return
      this.setData({ closing: true })
      setTimeout(() => {
        this.triggerEvent('cancel')
        this.setData({ closing: false })
      }, 260)
    },

    onConfirm() {
      if (this.data.submitting) return
      const { raw, sign, note, defaultNote, mode } = this.data
      if (raw === '' || raw === '.') {
        wx.showToast({ icon: 'none', title: '请输入金额' })
        return
      }
      const num = Number(raw)
      if (isNaN(num)) {
        wx.showToast({ icon: 'none', title: '金额格式错误' })
        return
      }
      const fen = unitToFen(num, this.data.currency) * sign
      if (mode === 'delta' && fen === 0) {
        wx.showToast({ icon: 'none', title: '变动金额不能为 0' })
        return
      }
      this.setData({ submitting: true })
      this.triggerEvent('confirm', {
        mode,
        fenValue: fen,
        note: (note && note.trim()) || defaultNote,
      })
    },

    finishSubmit() {
      this.setData({ submitting: false })
    },
  },
})
