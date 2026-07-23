const app = getApp()
const accountSvc = require('../../services/account.js')
const txSvc = require('../../services/transaction.js')
const { formatMoney } = require('../../utils/format.js')
const { formatDateTime } = require('../../utils/date.js')
const { getCategory, isIconKey } = require('../../utils/categories.js')
const { catHex, catRgb } = require('../../utils/theme.js')
const { symbolOf, digitsOf } = require('../../utils/currency.js')
const { valueCnyFen, cnyToBaseFen, baseCurrency } = require('../../utils/networth.js')

const SWIPE_THRESHOLD = 30

function splitAmount(fen, ccy) {
  const digits = digitsOf(ccy || 'CNY')
  const unit = Math.round(fen) / Math.pow(10, digits)
  const abs = Math.abs(unit)
  const [int, frac = ''] = abs.toFixed(digits).split('.')
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return {
    sign: unit < 0 ? '-' : '',
    int: withCommas,
    frac,
    hasFrac: digits > 0,
  }
}

Page({
  data: {
    accountId: '',
    account: null,
    accountName: '',
    accountIcon: 'folder',
    iconKey: '',
    accountColor: '#a7d3ff',
    colorClass: 'liquid',
    categoryName: '',
    categoryTag: '',
    isDebt: false,
    statusBarHeight: 20,

    // 余额分割
    balSign: '',
    balInt: '0',
    balFrac: '00',
    balHasFrac: true,
    balSymbol: '¥',
    approxText: '',
    balanceRaw: 0,
    updatedText: '',
    noteText: '',

    // sparkline 数据
    sparkPoints: [],
    sparkEmpty: true,

    txList: [],
    loading: true,

    showInput: false,
    inputMode: 'set',
    hideAmount: false,

    swipeOpenId: '',

    // 撒花动效 trigger
    burstKey: 0,
    burstColor: '167, 211, 255',
  },

  _touchStartX: 0,
  _touchStartY: 0,
  _touchedId: '',
  _touchAxis: null,

  onLoad(query) {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      accountId: query.id || '',
      statusBarHeight: sysInfo.statusBarHeight || 20,
      hideAmount: app.globalData.hideAmount,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
    })
  },

  onShow() {
    app.applyThemeChrome()
    this.setData({
      hideAmount: app.globalData.hideAmount,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
    })
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
      this.applyTxs(txs, (acc && acc.currency) || 'CNY')
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
    const ccy = acc.currency || 'CNY'
    const parts = splitAmount(acc.balance || 0, ccy)
    // 外币账户：副显折算到本位币的近似值（≈），原币种为主
    const base = baseCurrency()
    const approxText = (ccy !== base)
      ? '≈ ' + formatMoney(cnyToBaseFen(valueCnyFen(acc)), base, { symbol: true }) + '（' + base + '）'
      : ''
    this.setData({
      account: acc,
      accountName: acc.name,
      accountIcon: useKey ? icon : 'folder',
      iconKey: useKey ? icon : 'folder',
      accountColor: catHex(this.data.theme, cat ? cat.colorClass : 'liquid'),
      colorClass: cat ? cat.colorClass : '',
      categoryName: cat ? cat.name : '',
      categoryTag: cat ? cat.colorClass : '',
      isDebt: cat && cat.id === 'debt',
      balanceRaw: acc.balance || 0,
      currentBalanceText: formatMoney(acc.balance || 0, ccy, { symbol: true }),
      balSymbol: symbolOf(ccy),
      balSign: parts.sign,
      balInt: parts.int,
      balFrac: parts.frac,
      balHasFrac: parts.hasFrac,
      approxText,
      updatedText: acc.updatedAt ? formatDateTime(acc.updatedAt) + ' 更新' : '刚刚更新',
      noteText: acc.note || '',
      burstColor: catRgb(this.data.theme, cat ? cat.colorClass : 'liquid'),
    })
  },

  // 变动记录一律按账户原币种展示（外币账户不能拿 ¥ 拼字符串）
  applyTxs(txs, ccy) {
    const list = txs.map(t => {
      const amt = t.amount || 0
      return {
        _id: t._id,
        type: t.type,
        note: t.note || (t.type === 'set' ? '修改余额' : '增减金额'),
        time: formatDateTime(t.createdAt),
        deltaText: formatMoney(amt, ccy, { symbol: true, sign: true }),
        deltaCls: amt > 0 ? 'amount-pos' : (amt < 0 ? 'amount-neg' : ''),
        afterText: '余额 ' + formatMoney(t.balanceAfter || 0, ccy, { symbol: true }),
        positive: amt >= 0,
      }
    })

    // sparkline: 取最后 16 条按时间升序的 balanceAfter
    const points = txs.slice().reverse().slice(-16).map(t => t.balanceAfter || 0)
    const sparkEmpty = points.length < 2

    this._sparkPoints = points
    this.setData({
      txList: list,
      sparkPoints: points,
      sparkEmpty,
      swipeOpenId: '',
    })
    // 触发折线绘制（异步，等 DOM 就绪）
    wx.nextTick ? wx.nextTick(() => this.renderSparkline()) : setTimeout(() => this.renderSparkline(), 50)
  },

  // ============== 近期曲线（Canvas 折线图） ==============
  renderSparkline() {
    const points = this._sparkPoints || this.data.sparkPoints || []
    if (!points || points.length < 2) return
    const query = wx.createSelectorQuery().in(this)
    query.select('#sparkCanvas').fields({ node: true, size: true }).exec((res) => {
      const item = res && res[0]
      if (!item || !item.node) return
      const canvas = item.node
      const ctx = canvas.getContext('2d')
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const dpr = info.pixelRatio || 2
      const W = item.width
      const H = item.height
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.scale(dpr, dpr)

      const P = 10
      const min = Math.min.apply(null, points)
      const max = Math.max.apply(null, points)
      const range = Math.max(max - min, 1)
      const n = points.length
      const xAt = (i) => P + (n === 1 ? (W / 2 - P) : (i / (n - 1)) * (W - P * 2))
      const yAt = (v) => H - P - ((v - min) / range) * (H - P * 2)
      const pts = points.map((v, i) => [xAt(i), yAt(v)])

      const accent = this.data.accountColor || '#a7d3ff'
      const rgb = this.data.burstColor || '167, 211, 255'

      // cancel previous animation
      if (this._sparkRaf && canvas.cancelAnimationFrame) {
        canvas.cancelAnimationFrame(this._sparkRaf)
      }

      const total = pts.length - 1
      const start = Date.now()
      const drawDuration = 1100

      const drawFrame = () => {
        const elapsed = Date.now() - start
        const t = Math.min(1, elapsed / drawDuration)
        const eased = 1 - Math.pow(1 - t, 3)
        const target = total * eased

        ctx.clearRect(0, 0, W, H)

        // build visible polyline
        const vis = []
        for (let i = 0; i < pts.length; i++) {
          if (i <= Math.floor(target)) {
            vis.push(pts[i])
          } else if (i > 0 && i - 1 <= target) {
            const frac = target - (i - 1)
            const x0 = pts[i - 1][0], y0 = pts[i - 1][1]
            const x1 = pts[i][0], y1 = pts[i][1]
            vis.push([x0 + (x1 - x0) * frac, y0 + (y1 - y0) * frac])
            break
          }
        }

        // gradient fill
        if (vis.length >= 2) {
          const grad = ctx.createLinearGradient(0, P, 0, H - P)
          grad.addColorStop(0, 'rgba(' + rgb + ', 0.40)')
          grad.addColorStop(1, 'rgba(' + rgb + ', 0)')
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.moveTo(vis[0][0], H - P)
          for (let i = 0; i < vis.length; i++) {
            ctx.lineTo(vis[i][0], vis[i][1])
          }
          ctx.lineTo(vis[vis.length - 1][0], H - P)
          ctx.closePath()
          ctx.fill()
        }

        // stroke line
        if (vis.length >= 2) {
          ctx.strokeStyle = accent
          ctx.lineWidth = 2
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.shadowColor = 'rgba(' + rgb + ', 0.7)'
          ctx.shadowBlur = 10
          ctx.beginPath()
          for (let i = 0; i < vis.length; i++) {
            if (i === 0) ctx.moveTo(vis[i][0], vis[i][1])
            else ctx.lineTo(vis[i][0], vis[i][1])
          }
          ctx.stroke()
          ctx.shadowBlur = 0
        }

        // intermediate dots
        if (t >= 1) {
          ctx.fillStyle = 'rgba(' + rgb + ', 0.55)'
          for (let i = 0; i < pts.length - 1; i++) {
            ctx.beginPath()
            ctx.arc(pts[i][0], pts[i][1], 2, 0, Math.PI * 2)
            ctx.fill()
          }
          // pulsing last dot
          const phase = (Date.now() % 2400) / 2400
          const pulse = Math.sin(phase * Math.PI * 2)
          const ringR = 5 + (pulse + 1) * 4
          const ringA = 0.55 * (1 - (pulse + 1) / 2 * 0.9)
          const [lx, ly] = pts[pts.length - 1]
          ctx.beginPath()
          ctx.strokeStyle = 'rgba(' + rgb + ', ' + ringA.toFixed(3) + ')'
          ctx.lineWidth = 1.5
          ctx.arc(lx, ly, ringR, 0, Math.PI * 2)
          ctx.stroke()
          ctx.fillStyle = accent
          ctx.beginPath()
          ctx.arc(lx, ly, 3.5, 0, Math.PI * 2)
          ctx.fill()
          // schedule next pulse frame (~30fps)
          this._sparkRaf = canvas.requestAnimationFrame(drawFrame)
        } else {
          this._sparkRaf = canvas.requestAnimationFrame(drawFrame)
        }
      }

      drawFrame()
    })
  },

  onUnload() {
    if (this._sparkRaf) this._sparkRaf = null
  },

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
      confirmColor: '#FF0000',
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
      this.setData({
        showInput: false,
        burstKey: this.data.burstKey + 1,
      })
      this.refresh()
    } catch (err) {
      console.error(err)
      if (ai) ai.finishSubmit()
      wx.showToast({ icon: 'none', title: '保存失败：' + (err.errMsg || err.message || '') })
    }
  },

  onBack() {
    wx.navigateBack()
  },

  onEdit() {
    wx.navigateTo({ url: '/pages/add-account/add-account?editId=' + this.data.accountId })
  },

  onMore() {
    const acc = this.data.account
    if (!acc) return
    wx.showActionSheet({
      itemList: ['删除账户'],
      itemColor: '#FF0000',
      success: (res) => {
        if (res.tapIndex === 0) this.confirmDelete()
      },
    })
  },

  confirmDelete() {
    wx.showModal({
      title: '删除账户',
      content: '账户将从首页隐藏，历史记录保留。确认删除？',
      confirmColor: '#FF0000',
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
