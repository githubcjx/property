const { formatYuan, yuanToFen } = require('../../utils/format.js')

// 半屏金额输入面板。两种模式：
//   mode='set'   修改余额：输入新的目标余额（始终为正数，但允许 +/- 切换以输入负余额）
//   mode='delta' 增减金额：输入变化量，+/- 切换正负
// 通过 visible 属性控制显示，「完成」时 triggerEvent('confirm', { fenValue, note, sign })
// 取消时 triggerEvent('cancel')

Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    mode: { type: String, value: 'set' },
    visible: { type: Boolean, value: false },
    accountName: { type: String, value: '' },
    accountIcon: { type: String, value: '📁' },
    accountIconKey: { type: String, value: '' },
    currentBalanceFen: { type: Number, value: 0 },
  },
  data: {
    raw: '',           // 用户输入的原始字符串（不含正负号），如 "1234.56"
    sign: 1,           // 1 / -1
    note: '',
    defaultNote: '',
    title: '',
    submitting: false,
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
        })
      }
    },
  },
  methods: {
    // 阻止穿透
    noop() {},

    // 数字键盘点击
    onKey(e) {
      if (this.data.submitting) return
      const k = e.currentTarget.dataset.k
      let raw = this.data.raw
      if (k === 'back') {
        raw = raw.slice(0, -1)
      } else if (k === '.') {
        if (raw.includes('.')) return
        if (raw === '') raw = '0.'
        else raw = raw + '.'
      } else {
        // 数字
        if (raw === '0') {
          raw = k
        } else {
          // 限制小数位数为 2
          if (raw.includes('.') && raw.split('.')[1].length >= 2) return
          // 限制总长度
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
      this.triggerEvent('cancel')
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
      // delta 模式禁止 0 变动
      const fen = yuanToFen(num) * sign
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

    // 父组件提交完成后调用，重置 loading
    finishSubmit() {
      this.setData({ submitting: false })
    },
  },

})
