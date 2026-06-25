// 分享面板组件 · 通用「晒成绩」底部上滑面板
// 职责：预览分享卡（DOM）+ 金额打码开关 + 生成海报(canvas) + 两个动作（发给朋友 / 保存海报）。
//
// 设计要点（见 prototypes/share-step1.html）：
//  - 卡片只展示「相对量」（分数 / 等级 / 标签），绝对金额默认打码（masked=true）。
//  - 「发给朋友」走 <button open-type="share">，触发宿主页面的 onShareAppMessage；
//    本组件在卡片/打码状态变化时重绘海报并通过 bind:posterready 把临时图路径回传给页面，
//    页面在 onShareAppMessage 里把它作为 imageUrl 返回（否则微信会截屏，泄露金额）。
//  - 「保存海报」把同一张图存相册，用户自行发朋友圈（带图刷屏的合规路径）。
//  - 离屏 canvas 常驻 DOM（不随 visible wx:if 销毁），保证菜单分享时海报也已就绪。

const { formatCNY } = require('../../utils/format.js')

// 状态色：与 app.wxss / 体检页保持一致
const STATUS_COLOR = {
  good:  '#9ee6c1',
  warn:  '#f6d68a',
  alert: '#ffb3b3',
  neutral: '#a7d3ff',
}

// 标签(chip) 按 tone 上色；与 wxss 的 .c-chip.tone-* 一一对应
const TONE_COLOR = {
  good:       '#9ee6c1',
  bad:        '#ffb3b3',
  warn:       '#f6d68a',
  investment: '#c8b5ff',
  liquid:     '#a7d3ff',
  fixed:      '#b7e8f0',
  // neutral 不在表内 → 走默认灰白
}

Component({
  options: {
    addGlobalClass: true,
    multipleSlots: false,
  },

  properties: {
    visible: { type: Boolean, value: false, observer: '_onVisible' },
    // 卡片数据：{ brand, title, score, scoreUnit, status, subline, chips:[], netWorthFen, tagline, recallText }
    card: { type: Object, value: null, observer: '_onCardChange' },
  },

  data: {
    closing: false,
    masked: true,          // 金额打码：铁律默认开
    qrBroken: false,       // 小程序码图片加载失败 → 预览回退到文字
    // 离屏画布逻辑尺寸（px）
    cw: 300,
    ch: 470,
    // 预览用：净资产展示文案
    netText: '¥ ******',
  },

  lifetimes: {
    attached() {
      this._refreshNetText()
    },
  },

  methods: {
    _onVisible(v) {
      if (v) {
        this.setData({ closing: false })
        // 面板打开后重绘一次，保证海报最新
        this._scheduleDraw()
      }
    },

    _onCardChange() {
      this.setData({ qrBroken: false })
      this._refreshNetText()
      this._scheduleDraw()
    },

    // 预览里小程序码图片加载失败（文件还没放）→ 回退文字
    onQrError() {
      this.setData({ qrBroken: true })
    },

    // 切换打码：实时改预览 + 重绘海报 + 重新回传路径
    onToggleMask() {
      this.setData({ masked: !this.data.masked }, () => {
        this._refreshNetText()
        this._scheduleDraw()
      })
    },

    _refreshNetText() {
      const card = this.data.card || {}
      const fen = card.netWorthFen
      const text = this.data.masked || fen == null
        ? '¥ ******'
        : formatCNY(fen, {})
      this.setData({ netText: text })
    },

    onClose() {
      if (this.data.closing) return
      this.setData({ closing: true })
      setTimeout(() => {
        this.setData({ closing: false })
        this.triggerEvent('close')
      }, 240)
    },

    onNoop() {},

    // 发给朋友：按钮自带 open-type="share" 会触发宿主页 onShareAppMessage，
    // 这里只负责关闭面板（海报路径已通过 posterready 提前回传）。
    onTapFriend() {
      this.onClose()
    },

    // 保存海报到相册
    onSavePoster() {
      const path = this._posterPath
      const save = (p) => wx.saveImageToPhotosAlbum({
        filePath: p,
        success: () => wx.showToast({ icon: 'success', title: '海报已存相册' }),
        fail: (err) => {
          const msg = err && err.errMsg || ''
          if (/auth deny|authorize|permission/i.test(msg)) {
            // 用户拒绝过相册权限 → 引导去设置开启
            wx.showModal({
              title: '需要相册权限',
              content: '保存海报需要授权访问相册，请在设置中开启。',
              confirmText: '去设置',
              success: (r) => { if (r.confirm) wx.openSetting() },
            })
          } else if (/privacy|隐私/i.test(msg)) {
            // 隐私保护指引未声明「相册(写入)」→ 正式版被拦截（体验版可能放行）
            // 需在「微信公众平台 → 设置 → 服务内容声明 → 用户隐私保护指引」补充并重新发布
            wx.showModal({
              title: '保存失败',
              content: '当前版本暂未开通相册保存权限，请稍后再试或长按图片保存。',
              showCancel: false,
            })
          } else {
            // 兜底：暴露真实 errMsg，便于线上定位（用户主动取消 cancel 也走这里，可静默）
            if (/cancel/i.test(msg)) return
            wx.showToast({ icon: 'none', title: '保存失败：' + msg })
          }
        },
      })
      if (path) { save(path); return }
      // 兜底：还没画完就先画再存
      this._drawPoster((p) => { if (p) save(p); else wx.showToast({ icon: 'none', title: '海报生成失败' }) })
    },

    // 防抖重绘
    _scheduleDraw() {
      if (this._drawTimer) clearTimeout(this._drawTimer)
      this._drawTimer = setTimeout(() => this._drawPoster(), 60)
    },

    // 绘制海报到离屏 canvas，导出临时图，回传给页面
    _drawPoster(cb) {
      const card = this.data.card
      if (!card || card.score == null) { if (cb) cb(null); return }

      const q = this.createSelectorQuery()
      q.select('#shareCanvas').fields({ node: true, size: true }).exec((res) => {
        if (!res || !res[0] || !res[0].node) { if (cb) cb(null); return }
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const info = (wx.getWindowInfo && wx.getWindowInfo()) || {}
        const dpr = info.pixelRatio || 2
        const W = this.data.cw, H = this.data.ch
        canvas.width = W * dpr
        canvas.height = H * dpr
        ctx.scale(dpr, dpr)

        const exportImg = () => {
          wx.canvasToTempFilePath({
            canvas,
            fileType: 'png',
            success: (r) => {
              this._posterPath = r.tempFilePath
              this.triggerEvent('posterready', { path: r.tempFilePath })
              if (cb) cb(r.tempFilePath)
            },
            fail: () => { if (cb) cb(null) },
          })
        }

        // 小程序码是静态图片：先异步加载，加载成功才画码，失败则回退到文字
        if (card.qr) {
          const img = canvas.createImage()
          img.onload = () => { this._paint(ctx, W, H, card, img); exportImg() }
          img.onerror = () => { this._paint(ctx, W, H, card, null); exportImg() }
          img.src = card.qr
        } else {
          this._paint(ctx, W, H, card, null)
          exportImg()
        }
      })
    },

    // ---- 具体绘制 ----（qrImg 为已加载的小程序码图片，可为 null）
    _paint(ctx, W, H, card, qrImg) {
      const accent = STATUS_COLOR[card.status] || STATUS_COLOR.neutral

      // 背景
      ctx.fillStyle = '#0e1014'
      ctx.fillRect(0, 0, W, H)
      // 顶部彩色辉光
      const glow = ctx.createRadialGradient(W * 0.8, 0, 10, W * 0.8, 0, W * 0.9)
      glow.addColorStop(0, this._rgba(accent, 0.22))
      glow.addColorStop(1, this._rgba(accent, 0))
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, W, H)
      // 底部冰蓝辉光
      const glow2 = ctx.createRadialGradient(0, H, 10, 0, H, W * 0.8)
      glow2.addColorStop(0, 'rgba(167,211,255,0.16)')
      glow2.addColorStop(1, 'rgba(167,211,255,0)')
      ctx.fillStyle = glow2
      ctx.fillRect(0, 0, W, H)

      const PAD = 26
      // 统一用 top 基线：y 即每行文字的「顶部」，不同字号也能精确排版，
      // 否则大字号（分数 72px）按 alphabetic 基线会整体上移、看着偏。
      ctx.textBaseline = 'top'
      let y = 34

      // 品牌
      ctx.fillStyle = 'rgba(245,248,255,0.55)'
      ctx.font = '12px sans-serif'
      ctx.fillText(card.brand || '净值本', PAD, y)
      y += 24

      // 标题
      ctx.fillStyle = '#f5f8ff'
      ctx.font = 'bold 20px sans-serif'
      ctx.fillText(card.title || '我的财务体检', PAD, y)
      y += 42

      // 大分数（渐变）
      const scoreStr = String(card.score)
      const scoreSize = 72
      ctx.font = 'bold ' + scoreSize + 'px sans-serif'
      const grad = ctx.createLinearGradient(0, y, 0, y + scoreSize)
      grad.addColorStop(0, '#ffffff')
      grad.addColorStop(1, accent)
      ctx.fillStyle = grad
      ctx.fillText(scoreStr, PAD, y)
      const sw = ctx.measureText(scoreStr).width
      // 单位「分」与分数底部对齐
      const unitSize = 22
      ctx.font = 'bold ' + unitSize + 'px sans-serif'
      ctx.fillStyle = accent
      ctx.fillText(card.scoreUnit || '分', PAD + sw + 6, y + scoreSize - unitSize - 8)
      y += scoreSize + 8

      // 副行（X/6 达标）
      if (card.subline) {
        ctx.font = '13px sans-serif'
        ctx.fillStyle = 'rgba(245,248,255,0.78)'
        ctx.fillText(card.subline, PAD, y)
        y += 26
      }
      y += 6

      // 标签 chips（按 tone 上色：体检分↑绿 / ↓红，其余按类型）
      const chips = (card.chips || []).slice(0, 4)
      const chipH = 24
      const chipFont = 12
      let cx = PAD
      let cy = y
      ctx.font = chipFont + 'px sans-serif'
      for (const chip of chips) {
        const text = typeof chip === 'string' ? chip : (chip.text || '')
        const color = TONE_COLOR[chip && chip.tone]
        const tw = ctx.measureText(text).width
        const cwid = tw + 20
        if (cx + cwid > W - PAD) { cx = PAD; cy += chipH + 8 }
        this._roundRect(ctx, cx, cy, cwid, chipH, 9)
        ctx.fillStyle = color ? this._rgba(color, 0.16) : 'rgba(255,255,255,0.07)'
        ctx.fill()
        ctx.fillStyle = color || 'rgba(245,248,255,0.78)'
        ctx.fillText(text, cx + 10, cy + (chipH - chipFont) / 2)
        cx += cwid + 8
      }
      y = cy + chipH + 22

      // 分隔虚线
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(PAD, y)
      ctx.lineTo(W - PAD, y)
      ctx.stroke()
      ctx.setLineDash([])
      y += 22

      // 净资产行（label 与 amount 字号不同，按底部对齐）
      const labelSize = 12
      const amtSize = 15
      ctx.font = labelSize + 'px sans-serif'
      ctx.fillStyle = 'rgba(245,248,255,0.55)'
      ctx.fillText('我的净资产', PAD, y + (amtSize - labelSize))
      ctx.font = 'bold ' + amtSize + 'px sans-serif'
      ctx.fillStyle = '#f5f8ff'
      const amt = this.data.netText
      const aw = ctx.measureText(amt).width
      ctx.fillText(amt, W - PAD - aw, y)
      y += amtSize + 20

      // ===== 底部 footer：左侧理念 + 回流文案，右侧小程序码 =====
      const tagline = card.tagline || '看清，比赚得多更重要。'
      if (qrImg) {
        const qs = 70
        const qx = W - PAD - qs
        const qy = H - PAD - qs
        // 白底圆角，保证深色海报上可扫
        ctx.fillStyle = '#ffffff'
        this._roundRect(ctx, qx - 5, qy - 5, qs + 10, qs + 10, 10)
        ctx.fill()
        ctx.drawImage(qrImg, qx, qy, qs, qs)

        // 左侧文案，与码竖直居中对齐
        const lx = PAD
        ctx.font = 'bold 14px sans-serif'
        ctx.fillStyle = '#a7d3ff'
        ctx.fillText(tagline, lx, qy + 8)
        ctx.font = '12px sans-serif'
        ctx.fillStyle = 'rgba(245,248,255,0.78)'
        ctx.fillText('长按 / 扫码打开「净值本」', lx, qy + 34)
        ctx.font = '11px sans-serif'
        ctx.fillStyle = 'rgba(245,248,255,0.36)'
        ctx.fillText('只给自己看的资产记录', lx, qy + 54)
      } else {
        // 无小程序码时：理念 + 文字回流（微信搜索）
        ctx.font = 'bold 13px sans-serif'
        ctx.fillStyle = '#a7d3ff'
        ctx.fillText(tagline, PAD, y)
        ctx.font = '11px sans-serif'
        ctx.fillStyle = 'rgba(245,248,255,0.36)'
        ctx.fillText(card.recallText || '微信搜索「净值本」· 只给自己看的资产记录', PAD, H - 24)
      }
    },

    _roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.arcTo(x + w, y, x + w, y + h, r)
      ctx.arcTo(x + w, y + h, x, y + h, r)
      ctx.arcTo(x, y + h, x, y, r)
      ctx.arcTo(x, y, x + w, y, r)
      ctx.closePath()
    },

    _rgba(hex, a) {
      const h = hex.replace('#', '')
      const r = parseInt(h.substring(0, 2), 16)
      const g = parseInt(h.substring(2, 4), 16)
      const b = parseInt(h.substring(4, 6), 16)
      return `rgba(${r},${g},${b},${a})`
    },
  },
})
