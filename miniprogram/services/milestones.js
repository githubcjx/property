// 里程碑 · 7 关
// 基于 accounts + transactions 重建净资产时间线，找到每一关的首次跨越点。
// ¥100w 为高光关口（"first 100K is the hardest" 心理关口，复利启航点）。
//
// 输出：
// {
//   current: fen,
//   milestones: [
//     { amount, status, achievedAt, durationFromPrevMonths, speedupMonths,
//       progressPct, remainingFen, isHighlight }
//   ],
//   peak: { amount, time, drawdownPct } | null,
//   firstPositiveAt: ms | null,
//   growth: utils/growth.js 的估算结果，仅供净值目标卡做预测（本服务自己不预测）
// }

const cloud = require('./cloud.js')
const { isDebtCategory } = require('../utils/categories.js')
const { netCnyFen, isIncluded, snapshotCnyFen } = require('../utils/networth.js')
const { estimateMonthlyGrowth } = require('../utils/growth.js')

// 7 档（单位：分；1 元 = 100 分）
const MILESTONES_FEN = [
  1_000_000,       // ¥1 万      = 10,000 元
  10_000_000,      // ¥10 万     = 100,000 元
  50_000_000,      // ¥50 万     = 500,000 元
  100_000_000,     // ¥100 万 ★ = 1,000,000 元（高光关口 · 复利启航）
  300_000_000,     // ¥300 万
  500_000_000,     // ¥500 万
  1_000_000_000,   // ¥1000 万
]
const HIGHLIGHT_FEN = 100_000_000

// ---------- 日期工具 ----------

function toMs(d) {
  if (!d) return NaN
  if (d instanceof Date) return d.getTime()
  if (typeof d === 'number') return d
  if (typeof d === 'string') return new Date(d).getTime()
  if (d.$date) return new Date(d.$date).getTime()
  const t = new Date(d).getTime()
  return isNaN(t) ? NaN : t
}

// ---------- 时间线重建 ----------

// 把 accounts + txs 卷成一条 [{time, net}] 升序数组。
// 关键：每个时间点的 net 用「该点之前每个账户最后一条 tx 的 balanceAfter」求和（负债取负）。
function buildNetWorthTimeline(accounts, allTxs) {
  // 1. 过滤 includeInChart，按账户分组 tx（升序）
  const accMap = {}
  for (const a of accounts) {
    if (a.includeInChart === false) continue
    accMap[a._id] = a
  }

  const txByAcc = {}
  const allTimes = []
  for (const t of allTxs) {
    if (!accMap[t.accountId]) continue
    const ms = toMs(t.createdAt)
    if (isNaN(ms)) continue
    if (!txByAcc[t.accountId]) txByAcc[t.accountId] = []
    // 历史口径统一为人民币：用冻结的人民币快照（老数据回退 balanceAfter）
    txByAcc[t.accountId].push({ ms, balanceAfter: snapshotCnyFen(t) })
    allTimes.push(ms)
  }
  for (const k in txByAcc) txByAcc[k].sort((a, b) => a.ms - b.ms)

  // 2. 唯一时间点（升序，去重）
  allTimes.sort((a, b) => a - b)
  const uniqueTimes = []
  for (let i = 0; i < allTimes.length; i++) {
    if (i === 0 || allTimes[i] !== allTimes[i - 1]) uniqueTimes.push(allTimes[i])
  }

  // 3. 双指针累加：避免每个时间点都从头扫一遍每个账户的 tx
  const lastBalByAcc = {}
  const ptrByAcc = {}
  const accIds = Object.keys(accMap)
  for (const id of accIds) {
    lastBalByAcc[id] = 0
    ptrByAcc[id] = 0
  }

  const timeline = []
  for (const t of uniqueTimes) {
    // 推进每个账户的指针，吃掉所有 ms <= t 的 tx
    for (const id of accIds) {
      const txs = txByAcc[id] || []
      let p = ptrByAcc[id]
      while (p < txs.length && txs[p].ms <= t) {
        lastBalByAcc[id] = txs[p].balanceAfter
        p++
      }
      ptrByAcc[id] = p
    }
    // 算净资产
    let net = 0
    for (const id of accIds) {
      const a = accMap[id]
      const bal = lastBalByAcc[id]
      if (isDebtCategory(a.categoryId)) net -= bal
      else net += bal
    }
    timeline.push({ time: t, net })
  }
  return timeline
}

// ---------- 关口检测 ----------

function findFirstCrossing(timeline, threshold) {
  for (const p of timeline) {
    if (p.net >= threshold) return p.time
  }
  return null
}

function findPeak(timeline) {
  if (!timeline.length) return null
  let peak = timeline[0]
  for (const p of timeline) if (p.net > peak.net) peak = p
  return peak
}

function findFirstPositive(timeline) {
  for (const p of timeline) if (p.net > 0) return p.time
  return null
}

// ---------- 格式化（数值 → 文案） ----------

// 关口金额专用：7 个关口是**人民币锚点**（「一百万」本身就是人民币语境的说法，
// 折成 $14 万会让高光关口失去意义），所以这里的 ¥ 与 万/亿 是有意为之，不是漏改的硬编码。
// 真实金额（当前净值 / 峰值 / 月均增速）一律由页面用 formatMoney + 本位币渲染。
function fmtAmountText(fen) {
  const yuan = Math.round(fen / 100)
  if (Math.abs(yuan) >= 10000_0000) return '¥' + (yuan / 10000_0000).toFixed(0) + ' 亿'
  if (Math.abs(yuan) >= 10000)      return '¥' + Math.round(yuan / 10000) + ' 万'
  return '¥' + yuan.toLocaleString('en-US')
}

function fmtDate(ms) {
  const d = new Date(ms)
  return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日'
}

// 月数 → 人类表达
function fmtDuration(months) {
  if (months == null || !isFinite(months)) return ''
  const abs = Math.abs(months)
  if (abs < 1) {
    const days = Math.max(1, Math.round(abs * 30))
    return days + ' 天'
  }
  if (abs < 12) return Math.round(abs) + ' 个月'
  const years = Math.floor(abs / 12)
  const rem = Math.round(abs % 12)
  if (rem === 0) return years + ' 年'
  return years + ' 年 ' + rem + ' 个月'
}

// ---------- 主入口 ----------

async function evaluate() {
  // 分页拉全量：小程序端单次 get 最多 20 条
  const accounts = await cloud.getAll(() => cloud.accounts().where({ isHidden: false }))

  // 当前净资产：直接取账户余额（原币种折算到人民币），权威
  let current = 0
  for (const a of accounts) {
    if (!isIncluded(a)) continue
    current += netCnyFen(a)
  }

  if (accounts.length === 0) {
    return emptyResult(current)
  }

  // 拉所有 tx（分页拉全量：单次 get 最多 20 条，升序截断会丢掉较新的 tx、把时间线算错）
  const txs = await cloud.getAll(() => cloud.transactions().orderBy('createdAt', 'asc'))

  const timeline = buildNetWorthTimeline(accounts, txs)
  // 拼接"现在"这个点，保证最新值参与峰值/增速计算
  const nowMs = Date.now()
  if (timeline.length === 0 || timeline[timeline.length - 1].time < nowMs - 1000) {
    timeline.push({ time: nowMs, net: current })
  } else {
    // 修正最末点为权威值
    timeline[timeline.length - 1].net = current
  }

  const firstPositiveAt = findFirstPositive(timeline)
  const peakPoint = findPeak(timeline)
  // 增速估算收口在 utils/growth.js（不变量 4b）：只由净值目标卡消费，里程碑自己不做预测
  const growth = estimateMonthlyGrowth(timeline)

  // 遍历 7 档，构建结果
  const milestones = []
  let prevAchievedTime = firstPositiveAt || timeline[0].time
  let prevDurationMonths = null
  let achievedCount = 0
  let foundCurrent = false

  for (let i = 0; i < MILESTONES_FEN.length; i++) {
    const ms = MILESTONES_FEN[i]
    const crossTime = findFirstCrossing(timeline, ms)
    const isHighlight = ms === HIGHLIGHT_FEN

    if (crossTime != null) {
      // ---- 已达成 ----
      achievedCount++
      const durMonths = (crossTime - prevAchievedTime) / (86400000 * 30)

      // 加速 / 减速：只在第 3 关及之后才有意义
      // （首关与首次破零通常同日，第 2 关对比首关 → 对比的"上一关用时"几乎为 0，不准）
      let speedupMonths = null
      let speedupText = ''
      let speedupKind = ''
      if (achievedCount >= 3 && prevDurationMonths != null && prevDurationMonths >= 0.5) {
        speedupMonths = prevDurationMonths - durMonths   // > 0 = 快了
        if (speedupMonths > 0.3) {
          speedupText = '快了 ' + fmtDuration(speedupMonths)
          speedupKind = 'faster'
        } else if (speedupMonths < -0.3) {
          speedupText = '慢了 ' + fmtDuration(-speedupMonths)
          speedupKind = 'slower'
        } else {
          speedupKind = 'flat'
        }
      }

      milestones.push({
        amount: ms,
        amountText: fmtAmountText(ms),
        status: 'achieved',
        achievedAt: crossTime,
        achievedDateText: fmtDate(crossTime),
        durationFromPrevMonths: durMonths,
        durationText: achievedCount === 1 ? '' : fmtDuration(durMonths),
        durationLabel: achievedCount === 1 ? '' : '距上一关',
        speedupMonths,
        speedupText,
        speedupKind,
        isHighlight,
      })
      prevAchievedTime = crossTime
      prevDurationMonths = durMonths
    } else if (!foundCurrent) {
      // ---- 当前关 ----
      foundCurrent = true
      const remaining = Math.max(0, ms - current)
      const progressPct = ms > 0
        ? Math.max(0, Math.min(99.9, (current / ms) * 100))
        : 0
      // 这里不算「预计达成」：全页唯一的预测在净值目标卡（见 utils/growth.js 与 CLAUDE.md 不变量 4b），
      // 同屏出现两个 ETA 会自相矛盾。
      milestones.push({
        amount: ms,
        amountText: fmtAmountText(ms),
        status: 'current',
        progressPct,
        progressPctText: progressPct.toFixed(1),
        remainingFen: remaining,
        remainingText: fmtAmountText(remaining),
        isHighlight,
      })
    } else {
      // ---- 未来 ----
      milestones.push({
        amount: ms,
        amountText: fmtAmountText(ms),
        status: 'future',
        isHighlight,
      })
    }
  }

  // 历史峰值与回撤
  let peak = null
  if (peakPoint && peakPoint.net > 0) {
    const drawdownPct = peakPoint.net > current
      ? ((peakPoint.net - current) / peakPoint.net) * 100
      : 0
    peak = {
      amount: peakPoint.net,
      time: peakPoint.time,
      dateText: fmtDate(peakPoint.time),
      daysAgo: Math.max(0, Math.round((nowMs - peakPoint.time) / 86400000)),
      drawdownPct,
      drawdownText: drawdownPct > 0.1 ? '-' + drawdownPct.toFixed(1) + '%' : '',
    }
  }

  // 首次破零
  let firstPositive = null
  if (firstPositiveAt) {
    firstPositive = {
      time: firstPositiveAt,
      dateText: fmtDate(firstPositiveAt),
      daysAgo: Math.max(0, Math.round((nowMs - firstPositiveAt) / 86400000)),
    }
  }

  return {
    current,
    milestones,
    peak,
    firstPositive,
    growth,   // { monthlyFen, coverage, months, volatile }，净值目标卡据此决定是否给预测
    hasData: true,
  }
}

function emptyResult(current) {
  return {
    current,
    milestones: MILESTONES_FEN.map(ms => ({
      amount: ms,
      amountText: fmtAmountText(ms),
      status: 'future',
      isHighlight: ms === HIGHLIGHT_FEN,
    })),
    peak: null,
    firstPositive: null,
    growth: { monthlyFen: 0, coverage: 'short', months: 0, volatile: false },
    hasData: false,
  }
}

module.exports = {
  evaluate,
  MILESTONES_FEN,
  HIGHLIGHT_FEN,
}
