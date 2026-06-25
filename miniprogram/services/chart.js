const cloud = require('./cloud.js')
const { CATEGORIES } = require('../utils/categories.js')
const { snapshotCnyFen, valueCnyFen } = require('../utils/networth.js')

// ============== 时间节点策略 ==============

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function endOfDay(d) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}
function endOfMonth(d) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
  return x
}

function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function addMonths(d, n) {
  const x = new Date(d)
  x.setMonth(x.getMonth() + n)
  return x
}

// 返回 { startDate, endDate, nodes:[Date], xLabels:[string], granularity:'day'|'month' }
function buildNodes(rangeKey, opts) {
  const now = new Date()
  let startDate, endDate, nodes = [], granularity

  if (rangeKey === '30d') {
    endDate = endOfDay(now)
    startDate = startOfDay(addDays(now, -30))
    granularity = 'day'
    for (let i = 0; i <= 30; i++) {
      nodes.push(endOfDay(addDays(startDate, i)))
    }
  } else if (rangeKey === '6m') {
    endDate = endOfDay(now)
    granularity = 'month'
    const start = new Date(now.getFullYear(), now.getMonth() - 6, 1)
    startDate = start
    for (let i = 0; i <= 6; i++) {
      const m = new Date(start.getFullYear(), start.getMonth() + i, 1)
      // 最后一个节点用「今天」，避免未来日期
      if (i === 6) nodes.push(endOfDay(now))
      else nodes.push(endOfMonth(m))
    }
  } else if (rangeKey === '1y') {
    endDate = endOfDay(now)
    granularity = 'month'
    const start = new Date(now.getFullYear(), now.getMonth() - 12, 1)
    startDate = start
    for (let i = 0; i <= 12; i++) {
      const m = new Date(start.getFullYear(), start.getMonth() + i, 1)
      if (i === 12) nodes.push(endOfDay(now))
      else nodes.push(endOfMonth(m))
    }
  } else if (rangeKey === 'ytd') {
    endDate = endOfDay(now)
    granularity = 'month'
    const start = new Date(now.getFullYear(), 0, 1)
    startDate = start
    const monthsDiff = now.getMonth() // 0..11
    nodes.push(start)
    for (let i = 1; i <= monthsDiff; i++) {
      nodes.push(endOfMonth(new Date(now.getFullYear(), i - 1, 1)))
    }
    nodes.push(endOfDay(now))
  } else if (rangeKey === 'custom' && opts && opts.start && opts.end) {
    startDate = startOfDay(opts.start)
    endDate = endOfDay(opts.end)
    const dayDiff = Math.round((endDate.getTime() - startDate.getTime()) / 86400000)
    if (dayDiff <= 31) {
      granularity = 'day'
      for (let i = 0; i <= dayDiff; i++) {
        nodes.push(endOfDay(addDays(startDate, i)))
      }
    } else {
      granularity = 'month'
      const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
      nodes.push(startDate)
      while (true) {
        const monthEnd = endOfMonth(cur)
        if (monthEnd.getTime() >= endDate.getTime()) break
        if (monthEnd.getTime() > startDate.getTime()) nodes.push(monthEnd)
        cur.setMonth(cur.getMonth() + 1)
      }
      nodes.push(endDate)
    }
  } else {
    // fallback to 1y
    return buildNodes('1y')
  }

  const xLabels = nodes.map(d => formatLabel(d, granularity))
  return { startDate, endDate, nodes, xLabels, granularity }
}

function formatLabel(d, granularity) {
  if (granularity === 'day') {
    return (d.getMonth() + 1) + '/' + d.getDate()
  }
  return (d.getMonth() + 1) + '月'
}

// ============== 主聚合逻辑 ==============

// 兼容云开发的多种日期形态：Date / 时间戳 / 字符串 / { $date }
function toMs(d) {
  if (!d) return NaN
  if (d instanceof Date) return d.getTime()
  if (typeof d === 'number') return d
  if (typeof d === 'string') return new Date(d).getTime()
  if (d.$date) return new Date(d.$date).getTime()
  // 服务端时间对象 fallback
  const t = new Date(d).getTime()
  return isNaN(t) ? NaN : t
}

// 取每个账户在每个节点的余额快照：找 createdAt <= node 的最近一条 transaction.balanceAfter
function snapshotForAccount(txList, nodeTime) {
  // txList 已按 createdAt 升序
  let last = null
  for (const t of txList) {
    const ct = toMs(t.createdAt)
    if (isNaN(ct)) continue            // 日期解析失败的 tx 直接跳过，不再误判
    if (ct <= nodeTime) last = snapshotCnyFen(t)   // 历史口径统一为人民币
    else break
  }
  return last   // null 表示该节点之前没有任何快照
}

async function getChartSeries(rangeKey, opts) {
  const { startDate, endDate, nodes, xLabels, granularity } = buildNodes(rangeKey, opts)

  // 1. 拉所有未隐藏账户（分页拉全量：小程序端单次 get 最多 20 条）
  const accounts = await cloud.getAll(() => cloud.accounts().where({ isHidden: false }))
  const accIdSet = accounts.reduce((s, a) => { s[a._id] = a; return s }, {})

  // 2. 拉 endDate 之前所有 transaction（要包含 startDate 之前的，作为基线）
  // 必须分页拉全量：单次 get 最多 20 条，升序截断会丢掉较新的快照、把各节点基线算错。
  const allTxs = await cloud.getAll(() => cloud.transactions()
    .where({ createdAt: cloud.command().lte(endDate) })
    .orderBy('createdAt', 'asc'))

  // 按 accountId 分组（已升序）
  const txByAcc = {}
  for (const t of allTxs) {
    if (!accIdSet[t.accountId]) continue
    if (!txByAcc[t.accountId]) txByAcc[t.accountId] = []
    txByAcc[t.accountId].push(t)
  }

  // 3. 计算每个节点的各大类合计 + 净资产
  const netWorth = []
  const debt = []
  const liquid = []
  const investment = []

  const nowMs = Date.now()
  for (const node of nodes) {
    const t = node.getTime()
    const isCurrent = t >= nowMs - 1000   // "当前/最新节点"判定
    const bucket = { liquid: 0, investment: 0, fixed: 0, receivable: 0, debt: 0 }

    for (const a of accounts) {
      if (a.includeInChart === false) continue
      if (bucket[a.categoryId] === undefined) continue

      const txs = txByAcc[a._id] || []
      let bal = snapshotForAccount(txs, t)

      // 关键防御 1：当前节点直接取账户余额，保证图表最右点和首页一致
      // 这能修复"已添加但 tx 缺失/解析失败"的账户在最近月份显示为 0 的问题
      if (isCurrent) {
        bal = valueCnyFen(a)   // 当前节点取账户余额并折算到人民币，与历史口径一致
      } else if (bal === null) {
        bal = 0
      }

      bucket[a.categoryId] += bal
    }
    const net = bucket.liquid + bucket.investment + bucket.fixed + bucket.receivable - bucket.debt
    netWorth.push(net)
    debt.push(bucket.debt)
    liquid.push(bucket.liquid)
    investment.push(bucket.investment)
  }

  // 诊断日志：如果用户报告"明明加了负债但图上是 0"，看这里就能定位
  if (debt.every(v => v === 0)) {
    const debtAccs = accounts.filter(a => a.categoryId === 'debt')
    console.warn('[chart] 负债序列全为 0', {
      负债账户数: debtAccs.length,
      负债账户详情: debtAccs.map(a => ({
        name: a.name,
        balance: a.balance,
        includeInChart: a.includeInChart,
        hasTxs: !!(txByAcc[a._id] && txByAcc[a._id].length),
      })),
    })
  }

  const series = { netWorth, debt, liquid, investment }
  return {
    xLabels,
    granularity,
    rangeKey,
    startDate,
    endDate,
    series,
    summary: buildSummary(nodes, series),
  }
}

// ============== 摘要文字 ==============

function fmtRange(start, end) {
  const sy = start.getFullYear(), sm = start.getMonth() + 1
  const ey = end.getFullYear(), em = end.getMonth() + 1
  if (sy === ey) return `${sy}年${sm}月 - ${em}月`
  return `${sy}年${sm}月 - ${ey}年${em}月`
}

function fmtAmount(fen) {
  const n = Math.round(Math.abs(fen) / 100)
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// 单个指标的展示文本（startFen 必为非零）
function buildMetricText(name, deltaFen, startFen) {
  if (deltaFen === 0) return `我的${name}没有改变`
  const verb = deltaFen > 0 ? '增加了' : '减少了'
  const p = Math.round((deltaFen / Math.abs(startFen)) * 100)
  const pct = `，较期初 ${p >= 0 ? '+' : ''}${p}%`
  return `我的${name}${verb} ${fmtAmount(deltaFen)} 元${pct}`
}

// 期初定义：范围内首个非零数据点。
// 这样可以避开「时间范围起点早于账户存在时间」造成的 start = 0、百分比无法计算的问题。
function metricFor(arr, name) {
  const end = arr[arr.length - 1] || 0

  let firstIdx = -1
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] !== 0) { firstIdx = i; break }
  }

  // 期间内全程为 0：完全无该类资产
  if (firstIdx === -1) {
    return { delta: 0, start: 0, end: 0, text: `我没有${name}` }
  }

  // 仅最末有值：在期间内首次出现（之前无快照）→ 固定 ±100%
  if (firstIdx === arr.length - 1) {
    const verb = end > 0 ? '增加了' : '减少了'
    const sign = end > 0 ? '+' : '-'
    return {
      delta: end, start: 0, end,
      text: `我的${name}${verb} ${fmtAmount(end)} 元，较期初 ${sign}100%`,
    }
  }

  const start = arr[firstIdx]
  const delta = end - start
  return { delta, start, end, text: buildMetricText(name, delta, start) }
}

function buildSummary(nodes, series) {
  if (!nodes.length) {
    return { rangeText: '', metrics: {} }
  }
  return {
    rangeText: fmtRange(nodes[0], nodes[nodes.length - 1]),
    metrics: {
      netWorth: metricFor(series.netWorth, '净资产'),
      debt: metricFor(series.debt, '负债'),
      liquid: metricFor(series.liquid, '流动资金'),
      investment: metricFor(series.investment, '投资'),
    },
  }
}

module.exports = {
  getChartSeries,
  buildNodes,
}
