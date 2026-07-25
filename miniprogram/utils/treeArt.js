// 首页小树的绘制（原生 canvas 2d）。
//
// 为什么不是 PixiJS / WebGL 引擎：那类引擎自带常驻渲染循环，而这棵树 99% 的时间
// 是静止的（阶段几周才变一次）—— 为一个静态装饰养一个 rAF + WebGL 上下文，正是
// 本项目一直在躲的发热来源（见 memory：动效与发热的取舍）。此处只在「阶段跳变」
// 那一刻播一次 ~1.1s 的生长动画，播完落到静止帧、不再有任何循环。
//
// 造型全部手写在归一化的 100×100 坐标里（y 向下，土面 y=86，中轴 x=50），
// 由 drawStage 按画布尺寸整体缩放 —— 所以在任何机型/DPR 上都是同一套比例。
// 颜色取当前主题 accent（canvas 拿不到 CSS 变量，只能由 JS 注入，见不变量 9）。

const { hexToRgb } = require('./theme.js')

const TAU = Math.PI * 2
const RAD = Math.PI / 180

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3) }
// 轻微回弹：叶片/树冠「弹开」的手感，回弹量克制（1.35）以免显得廉价
function easeOutBack(t) {
  const c = 1.35
  const u = t - 1
  return 1 + (c + 1) * u * u * u + c * u * u
}

// 每片叶 / 每团树冠有各自的出场延迟，错峰展开才像长出来，而不是整体放大
function pop(p, delay, dur) {
  return easeOutBack(clamp01((p - delay) / (dur || 0.32)))
}

// ---------- 造型数据 ----------
// stem/branch: 二次曲线骨架 [x0,y0, cx,cy, x1,y1] + 两端宽度 w0→w1
// leaf: 从 (x,y) 沿 ang 方向长出的水滴形，len 长、wd 半宽
// canopy: 树冠由若干圆叠成一个整体轮廓（下面用 clip + 渐变打光，避免「雪人」感）
const SHAPES = {
  seed: {
    soilR: 22,
    seed: { x: 50, y: 78, rx: 6.4, ry: 8.6, rot: -14 },
  },
  sprout: {
    soilR: 22,
    stem: { p: [50, 87, 47, 74, 50, 62], w0: 2.6, w1: 1.5 },
    leaves: [
      { x: 49.6, y: 64.5, len: 15, wd: 6, ang: -158, d: 0.42 },
      { x: 49.6, y: 64.5, len: 15.5, wd: 6.2, ang: -22, d: 0.56 },
    ],
  },
  sapling: {
    soilR: 24,
    stem: { p: [50, 87, 45, 64, 50.5, 40], w0: 3.2, w1: 1.4 },
    leaves: [
      { x: 48.2, y: 75.5, len: 15, wd: 5.5, ang: -22, d: 0.40 },
      { x: 47.6, y: 64, len: 15.5, wd: 5.5, ang: -158, d: 0.50 },
      { x: 48.4, y: 52, len: 14, wd: 5, ang: -25, d: 0.60 },
      { x: 49.5, y: 45, len: 12.5, wd: 4.5, ang: -155, d: 0.68 },
      { x: 50.5, y: 41, len: 11, wd: 4, ang: -88, d: 0.78 },
    ],
  },
  young: {
    soilR: 26,
    stem: { p: [50, 87, 48, 66, 50, 46], w0: 6.5, w1: 2.4 },
    branches: [
      { p: [49.2, 64, 41, 58, 33, 52], w0: 2.6, w1: 1.1 },
      { p: [49.4, 57, 58, 52, 65, 47], w0: 2.4, w1: 1.0 },
    ],
    canopy: [
      { x: 50, y: 33, r: 15.5, d: 0.42 },
      { x: 35, y: 42, r: 10.5, d: 0.52 },
      { x: 64, y: 40, r: 11, d: 0.58 },
      { x: 45, y: 24, r: 10, d: 0.66 },
      { x: 59, y: 27, r: 9.5, d: 0.72 },
    ],
  },
  tree: {
    soilR: 30,
    flare: true,
    stem: { p: [50, 87, 47, 64, 50, 42], w0: 10.5, w1: 3.2 },
    branches: [
      { p: [48.5, 68, 37, 64, 28, 54], w0: 3.4, w1: 1.2 },
      { p: [48.6, 63, 62, 60, 71, 50], w0: 3.2, w1: 1.2 },
      { p: [49.3, 55, 41, 50, 36, 42], w0: 2.6, w1: 1.0 },
      { p: [49.5, 50, 58, 46, 63, 38], w0: 2.4, w1: 1.0 },
    ],
    canopy: [
      { x: 50, y: 28, r: 19, d: 0.40 },
      { x: 30, y: 42, r: 13, d: 0.48 },
      { x: 70, y: 40, r: 13.5, d: 0.54 },
      { x: 50, y: 45, r: 12, d: 0.58 },
      { x: 38, y: 20, r: 12.5, d: 0.62 },
      { x: 63, y: 20, r: 12, d: 0.68 },
    ],
    sparks: [
      { x: 38, y: 27, r: 1.7, d: 0.82 },
      { x: 59, y: 18, r: 1.4, d: 0.88 },
      { x: 46, y: 37, r: 1.2, d: 0.94 },
    ],
  },
}

const ORDER = ['seed', 'sprout', 'sapling', 'young', 'tree']

// ---------- 基础图元 ----------

// 二次曲线取样，用于把骨架变成有粗细变化的实心枝干
function samples(p, n) {
  const out = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    out.push([
      u * u * p[0] + 2 * u * t * p[2] + t * t * p[4],
      u * u * p[1] + 2 * u * t * p[3] + t * t * p[5],
    ])
  }
  return out
}

// 变宽枝干：沿骨架法线向两侧偏移半宽，闭合成一条上细下粗的实心路径。
// 用 lineWidth 描边做不到根粗梢细，而锥度正是树「有重量」的关键。
function limbPath(ctx, seg) {
  const pts = samples(seg.p, 14)
  const left = []
  const right = []
  for (let i = 0; i < pts.length; i++) {
    const t = i / (pts.length - 1)
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const L = Math.hypot(dx, dy) || 1
    const nx = -dy / L
    const ny = dx / L
    const hw = (seg.w0 + (seg.w1 - seg.w0) * t) / 2
    left.push([pts[i][0] + nx * hw, pts[i][1] + ny * hw])
    right.push([pts[i][0] - nx * hw, pts[i][1] - ny * hw])
  }
  ctx.beginPath()
  ctx.moveTo(left[0][0], left[0][1])
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1])
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1])
  ctx.closePath()
}

// 水滴形叶片：从基点沿 ang 长出，两条二次曲线合围；k 为出场缩放（从基点长出）
function leafPath(ctx, lf, k) {
  const a = lf.ang * RAD
  const L = lf.len * k
  const W = lf.wd * k
  const cx = Math.cos(a)
  const cy = Math.sin(a)
  const px = -cy
  const py = cx
  const mx = lf.x + cx * L * 0.42
  const my = lf.y + cy * L * 0.42
  ctx.beginPath()
  ctx.moveTo(lf.x, lf.y)
  ctx.quadraticCurveTo(mx + px * W, my + py * W, lf.x + cx * L, lf.y + cy * L)
  ctx.quadraticCurveTo(mx - px * W, my - py * W, lf.x, lf.y)
  ctx.closePath()
}

// 「睡着」的树：把叶色大幅去饱和、略微暖化 —— 不掉一片叶（永不枯萎），
// 只是当首页那条入口在催盘点(is-stale)时安静下来、褪成暖灰调，好让那句
// 提醒立得住（否则一棵得意洋洋的树会把责备的力气卸掉一半）。
function muteRgb(rgbStr) {
  const p = rgbStr.split(',').map((n) => parseInt(n, 10))
  const luma = 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2]
  const mix = (c, t, k) => Math.round(c + (t - c) * k)
  // 先 78% 去饱和到自身灰度，再往暖灰(dusty taupe)偏一点
  return [
    mix(mix(p[0], luma, 0.78), 150, 0.22),
    mix(mix(p[1], luma, 0.78), 140, 0.22),
    mix(mix(p[2], luma, 0.78), 122, 0.26),
  ].join(', ')
}

// ---------- 主绘制 ----------

/**
 * @param ctx     canvas 2d context（调用方已按 dpr scale 过）
 * @param W,H     CSS 像素尺寸
 * @param stageKey seed|sprout|sapling|young|tree
 * @param p       生长进度 0..1（1 = 静止终帧）
 * @param opt     { accent: '#rrggbb', light: bool, muted: bool }
 *                muted=true → 睡着：褪色、去掉外发光与光点（催盘点时用）
 */
function drawStage(ctx, W, H, stageKey, p, opt) {
  const S = SHAPES[stageKey] || SHAPES.seed
  const o = opt || {}
  const accent = o.accent || '#a7d3ff'
  const rgb = o.muted ? muteRgb(hexToRgb(accent)) : hexToRgb(accent)
  const gb = o.muted ? 0 : 1   // 睡着时关掉一切外发光（shadowBlur 归零）
  const fol = (a) => 'rgba(' + rgb + ',' + a + ')'
  const bark = o.light ? '#6b543f' : '#8b7360'
  const soilInk = o.light ? 'rgba(60,44,30,0.16)' : 'rgba(255,255,255,0.07)'

  const s = Math.min(W, H) / 100
  const ox = (W - 100 * s) / 2
  const oy = (H - 100 * s) / 2

  ctx.clearRect(0, 0, W, H)
  ctx.save()
  ctx.translate(ox, oy)
  ctx.scale(s, s)

  const prog = clamp01(p)

  // —— 土面：一道压扁的暗影，给整棵树一个「站在地上」的落点 ——
  ctx.fillStyle = soilInk
  ctx.beginPath()
  ctx.ellipse(50, 86.5, S.soilR, 3.4, 0, 0, TAU)
  ctx.fill()

  // —— 种子阶段：没有枝干，只有一颗埋在土里的种子 + 一圈等待发芽的微光 ——
  if (stageKey === 'seed') {
    const k = pop(prog, 0.1, 0.45)
    if (k > 0) {
      const sd = S.seed
      ctx.save()
      ctx.globalAlpha = clamp01(prog / 0.35)
      ctx.beginPath()
      ctx.arc(sd.x, sd.y, 15, 0, TAU)
      ctx.fillStyle = fol(0.07)
      ctx.fill()

      ctx.translate(sd.x, sd.y)
      ctx.rotate(sd.rot * RAD)
      ctx.scale(k, k)
      const g = ctx.createLinearGradient(-sd.rx, -sd.ry, sd.rx, sd.ry)
      g.addColorStop(0, fol(0.95))
      g.addColorStop(1, fol(0.5))
      ctx.fillStyle = g
      ctx.shadowColor = fol(0.45)
      ctx.shadowBlur = 10 * s * gb
      ctx.beginPath()
      ctx.ellipse(0, 0, sd.rx, sd.ry, 0, 0, TAU)
      ctx.fill()
      ctx.shadowBlur = 0
      // 高光：一小道弯月，让它有「壳」的实体感
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.beginPath()
      ctx.ellipse(-sd.rx * 0.32, -sd.ry * 0.3, sd.rx * 0.28, sd.ry * 0.34, -0.5, 0, TAU)
      ctx.fill()
      ctx.restore()
    }
    ctx.restore()
    return
  }

  // —— 枝干：从土里往上「长出来」（自下而上揭开），比整体放大更像生长 ——
  const grow = easeOutCubic(clamp01(prog / 0.6))
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 88 - 88 * grow, 100, 88 * grow + 2)
  ctx.clip()

  const barkG = ctx.createLinearGradient(38, 0, 62, 0)
  barkG.addColorStop(0, bark)
  barkG.addColorStop(0.45, o.light ? '#8a6f52' : '#a68a72')
  barkG.addColorStop(1, bark)
  ctx.fillStyle = barkG

  if (S.flare) {
    // 根部外张：两笔小三角，大树才有的「扎根」体量
    ctx.beginPath()
    ctx.moveTo(50 - S.stem.w0 / 2, 80)
    ctx.quadraticCurveTo(50 - S.stem.w0 / 2 - 3, 85, 50 - S.stem.w0 / 2 - 7, 87)
    ctx.lineTo(50 + S.stem.w0 / 2 + 7, 87)
    ctx.quadraticCurveTo(50 + S.stem.w0 / 2 + 3, 85, 50 + S.stem.w0 / 2, 80)
    ctx.closePath()
    ctx.fill()
  }
  if (S.stem) { limbPath(ctx, S.stem); ctx.fill() }
  for (const b of (S.branches || [])) { limbPath(ctx, b); ctx.fill() }
  ctx.restore()

  // —— 叶片（新芽 / 小树苗）：逐片弹开，基部深、梢部亮，中间一条叶脉 ——
  for (const lf of (S.leaves || [])) {
    const k = pop(prog, lf.d)
    if (k <= 0) continue
    const a = lf.ang * RAD
    const tipX = lf.x + Math.cos(a) * lf.len
    const tipY = lf.y + Math.sin(a) * lf.len
    const g = ctx.createLinearGradient(lf.x, lf.y, tipX, tipY)
    g.addColorStop(0, fol(0.55))
    g.addColorStop(1, fol(0.98))
    ctx.fillStyle = g
    ctx.shadowColor = fol(0.4)
    ctx.shadowBlur = 8 * s * gb
    leafPath(ctx, lf, k)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(lf.x, lf.y)
    ctx.lineTo(lf.x + Math.cos(a) * lf.len * k * 0.88, lf.y + Math.sin(a) * lf.len * k * 0.88)
    ctx.stroke()
  }

  // —— 树冠（小树 / 大树）：先把所有圆并成一个轮廓，再在轮廓内打一道斜光。
  //    分开填每个圆会露出一圈圈「雪人」边界；并集 + clip 渐变才有整团的体积感。——
  const canopy = S.canopy || []
  const live = canopy.map(c => ({ c, k: pop(prog, c.d) })).filter(x => x.k > 0)
  if (live.length) {
    const union = () => {
      ctx.beginPath()
      for (const { c, k } of live) {
        const r = c.r * k
        ctx.moveTo(c.x + r, c.y)
        ctx.arc(c.x, c.y, r, 0, TAU)
      }
    }
    // 底色 + 外发光（与全站玻璃/光晕语言一致）
    ctx.fillStyle = fol(0.62)
    ctx.shadowColor = fol(0.42)
    ctx.shadowBlur = 14 * s * gb
    union()
    ctx.fill()
    ctx.shadowBlur = 0

    // 轮廓内打光：左上受光、右下入影
    let x0 = 100, y0 = 100, x1 = 0, y1 = 0
    for (const { c, k } of live) {
      x0 = Math.min(x0, c.x - c.r * k); y0 = Math.min(y0, c.y - c.r * k)
      x1 = Math.max(x1, c.x + c.r * k); y1 = Math.max(y1, c.y + c.r * k)
    }
    ctx.save()
    union()
    ctx.clip()
    const lg = ctx.createLinearGradient(x0, y0, x1, y1)
    lg.addColorStop(0, 'rgba(255,255,255,0.30)')
    lg.addColorStop(0.45, 'rgba(255,255,255,0.04)')
    lg.addColorStop(1, o.light ? 'rgba(40,30,20,0.20)' : 'rgba(0,0,0,0.26)')
    ctx.fillStyle = lg
    ctx.fillRect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2)
    ctx.restore()
  }

  // —— 光点：树冠里透进来的几粒光，只有大树才有，是「长成了」的犒赏 ——
  // 睡着时收起来：被催盘点的当口，不该还挂着庆祝的光。
  for (const sp of (o.muted ? [] : (S.sparks || []))) {
    const k = pop(prog, sp.d, 0.2)
    if (k <= 0) continue
    ctx.globalAlpha = clamp01(k)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.shadowColor = 'rgba(255,255,255,0.7)'
    ctx.shadowBlur = 6 * s
    ctx.beginPath()
    ctx.arc(sp.x, sp.y, sp.r, 0, TAU)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1
  }

  ctx.restore()
}

module.exports = { drawStage, ORDER }
