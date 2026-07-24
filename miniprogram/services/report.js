// 净值报告 · 月报(单关键词) 的派生规则与数据编排
// （年报功能现阶段暂不实现，相关代码已移除）
//
// ⚠️ 当前为「演示数据」阶段：USE_DEMO=true 时 buildMonthlyReport() 返回写死的示例数据，
//    仅供开发预览页面效果。发版前务必：① 把 USE_DEMO 置 false ② 补完真实计算（见各 TODO）。
//    演示数据不会展示给真实用户（页面 USE_DEMO 同步关闭即可）。
//
// 数据诚实（CLAUDE.md 不变量 10）：正式计算只能用真实存储/可算的数据
//   —— 月报涨幅来自 stats.js、归因按 期末−月初 现算、坚持度数 transactions；
//      无可比数据时降级，不脑补。

const cloud = require('./cloud.js')
const { isDebtCategory } = require('../utils/categories.js')
const { valueCnyFen, snapshotCnyFen } = require('../utils/networth.js')

// ===================== 可调阈值 =====================
const TH = {
  // 月报
  monthUpPct: 1,          // 涨幅 ≥ 视为「涨」
  monthDownPct: -1,       // 涨幅 ≤ 视为「跌」
  driverDominantPct: 45,  // 单一驱动占比 ≥ 视为「主导」，否则「均衡」
  recordsDiligent: 4,     // 月记录 ≥ 视为「自律」
}

// ===================== 月报 · 单关键词 =====================
// 输入 report 对象需含：coverage / milestoneName / allTimeHigh / nwPct / driver{key,sharePct} / records
// driver.key ∈ 'investment' | 'liquid' | 'debtReduction' | 'fixed' | 'receivable' | 'balanced'
function deriveMonthlyKeyword(r) {
  if (!r || r.coverage === 'insufficient') {
    return { word: '初见净值', why: '你这个月开始认真记录，下月起就能看到变化轨迹。' }
  }
  if (r.milestoneName) {
    return { word: '里程碑时刻', why: `本月解锁「${r.milestoneName}」。` }
  }
  const pct = r.nwPct || 0
  if (r.allTimeHigh && pct >= TH.monthUpPct) {
    return { word: '再创新高', why: '本月净资产创下你记录以来的新高。' }
  }
  if (pct >= TH.monthUpPct) {
    const d = r.driver || {}
    const share = d.sharePct != null ? d.sharePct : 0
    if (d.key === 'investment') return { word: '乘风进取', why: `投资在本月净值增长里贡献最大（+${share}%）。` }
    if (d.key === 'liquid')     return { word: '积少成多', why: '本月增长主要来自现金 / 储蓄的稳步积累。' }
    if (d.key === 'debtReduction') return { word: '轻装上阵', why: '你在持续还债，负债下降推动了净值。' }
    if (d.key === 'fixed')      return { word: '稳健增值', why: '固定资产是本月净值增长的主力。' }
    return { word: '全面开花', why: `多类资产共同发力，本月净值 +${(+pct).toFixed(1)}%。` }
  }
  if (pct <= TH.monthDownPct) {
    return { word: '稳住阵脚', why: '本月净值有所回撤，但你依然如实记录、看清现状——这正是穿越波动的第一步。' }
  }
  // 持平
  if ((r.records || 0) >= TH.recordsDiligent) return { word: '自律复盘', why: `本月你记录了 ${r.records} 次，坚持复盘最难得。` }
  return { word: '波澜不惊', why: '本月净值平稳，没有大起大落。' }
}

// ===================== 演示数据（开发预览用，发版前删/关）=====================
function getDemoMonthlyReport() {
  const r = {
    isDemo: true,
    periodLabel: '2026 年 5 月',
    coverage: 'full',
    nwPct: 4.2,
    nwDeltaFen: 5230000,
    netWorthFen: 128450000,
    spark: [42, 48, 40, 55, 60, 52, 68, 64, 75, 80, 78, 92],
    movers: [
      { name: '投资 · 基金',      cat: 'investment', dir: 'up', sharePct: 62, amountFen: 3240000, best: true },
      { name: '流动 · 工资到账',  cat: 'liquid',     dir: 'up', sharePct: 28, amountFen: 1460000 },
      { name: '负债 · 信用卡减少', cat: 'debt',       dir: 'up', sharePct: 10, amountFen: 530000 },
    ],
    records: 8,
    accountsUpdated: 5,
    totalDays: 287,
    // 关键词派生输入
    milestoneName: null,
    allTimeHigh: false,
    driver: { key: 'investment', sharePct: 62 },
  }
  r.keyword = deriveMonthlyKeyword(r)
  return r
}

// ===================== 真实月报编排 =====================
// 口径与 stats.js 一致（CLAUDE.md 不变量 5）：历史余额 = 该账户在某时点前最近一条 balanceAfter。
// 报告不存储，按需重算（区间参数化后，回看历史月份只需换 monthDate —— 见「历史月报」待办）。

function toMs(v) {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const t = Date.parse(v); return isNaN(t) ? 0 : t }
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'object' && v.$date != null) return toMs(v.$date)
  return 0
}

// 净值 = 资产相加、负债相减（仅 includeInChart 的账户，调用方已过滤）
function netWorthOf(accounts, balMap) {
  let nw = 0
  for (const a of accounts) {
    const v = balMap[a._id] || 0
    if (isDebtCategory(a.categoryId)) nw -= v
    else nw += v
  }
  return nw
}

// 逐账户取 dateMs 之前最近一条 balanceAfter（端上单次最多 20 条，必须按账户 desc+limit(1)）
async function snapshotBalances(accounts, dateMs) {
  const since = new Date(dateMs)
  const cmd = cloud.command()
  let anySnapshot = false
  const balances = {}
  await Promise.all(accounts.map(async (a) => {
    try {
      const res = await cloud.transactions()
        .where({ accountId: a._id, createdAt: cmd.lte(since) })
        .orderBy('createdAt', 'desc').limit(1).get()
      const t = (res.data || [])[0]
      if (t) { balances[a._id] = snapshotCnyFen(t); anySnapshot = true }
      else balances[a._id] = 0
    } catch (e) { balances[a._id] = 0 }
  }))
  return { balances, anySnapshot }
}

// 月初基线余额：用聚合一次拿到「每账户在月初前最近一条 balanceAfter」，等价于逐账户 orderBy desc limit 1。
// 准确性保障：①集合权限「仅创建者可读写」→ 聚合也只读本人数据 ②group 后 limit(1000) 防截断
//            ③sort 双键确定性 ④聚合异常时回退逐账户查询。
async function getBaselineBalances(included, monthStartMs) {
  const since = new Date(monthStartMs)
  try {
    const map = await cloud.latestBalanceMapBefore(since, included.map(a => a._id))
    const baseBal = {}
    let anySnapshot = false
    for (const a of included) {
      if (Object.prototype.hasOwnProperty.call(map, a._id)) { baseBal[a._id] = map[a._id]; anySnapshot = true }
      else baseBal[a._id] = 0
    }
    return { baseBal, anySnapshot }
  } catch (e) {
    // 回退：逐账户查询（准确，但请求数多）
    console.warn('[report] 聚合取基线失败，回退逐账户查询', e)
    const { balances, anySnapshot } = await snapshotBalances(included, monthStartMs)
    return { baseBal: balances, anySnapshot }
  }
}

// 拉取 [startMs, endMs) 区间内全部交易（分页 asc）。endMs 传 null 表示「直到现在」（不设上界）。
// 供 records / accountsUpdated / spark 回放 / 期末余额回放共用，避免逐节点重复查询。
// 过去月报需要上界（只统计当月交易），当前月报不设上界（=直到此刻）。
async function fetchTransactionsInRange(startMs, endMs) {
  const cmd = cloud.command()
  const start = new Date(startMs)
  const where = endMs != null
    ? { createdAt: cmd.gte(start).and(cmd.lt(new Date(endMs))) }
    : { createdAt: cmd.gte(start) }
  const out = []
  const PAGE = 20
  let skip = 0
  for (let i = 0; i < 200; i++) {  // 上限保护
    let res
    try {
      res = await cloud.transactions()
        .where(where)
        .field({ accountId: true, balanceAfter: true, balanceAfterCnyFen: true, createdAt: true })
        .orderBy('createdAt', 'asc')
        .skip(skip).limit(PAGE).get()
    } catch (e) { break }
    const data = res.data || []
    // 历史口径统一为人民币：balanceAfter 存人民币快照（老数据回退）
    for (const t of data) out.push({ accountId: t.accountId, balanceAfter: snapshotCnyFen(t), ms: toMs(t.createdAt) })
    if (data.length < PAGE) break
    skip += PAGE
  }
  return out
}

// 区间净值走势：从月初基线出发、本地回放区间交易，在 n 个节点采样（零额外查询）。
// 末节点用 endBal（当前月 = live 权威，与首页一致；过去月 = 回放到月末的快照）。
function buildSparkReplay(included, baseBal, endBal, monthTx, startMs, endMs, n) {
  const count = n || 6
  const incSet = {}
  const bal = {}
  included.forEach(a => { incSet[a._id] = true; bal[a._id] = baseBal[a._id] || 0 })

  const vals = []
  let ti = 0
  for (let k = 0; k < count; k++) {
    const t = startMs + (endMs - startMs) * k / (count - 1)
    while (ti < monthTx.length && monthTx[ti].ms <= t) {
      const tx = monthTx[ti]
      if (incSet[tx.accountId]) bal[tx.accountId] = tx.balanceAfter
      ti++
    }
    vals.push(k === count - 1 ? netWorthOf(included, endBal) : netWorthOf(included, bal))
  }
  const min = Math.min.apply(null, vals)
  const max = Math.max.apply(null, vals)
  return vals.map(v => (max === min ? 60 : Math.round(((v - min) / (max - min)) * 70 + 20)))
}

// 累计记录天数：从最早账户创建日到 endMs（当月末；缺省到此刻）。
// 看历史月时口径为「到那个月末」，不再恒显示到今天。
function recordedDays(accounts, endMs) {
  let earliest = 0
  for (const a of accounts) {
    const t = toMs(a.createdAt)
    if (t > 0 && (earliest === 0 || t < earliest)) earliest = t
  }
  if (!earliest) return 0
  const end = endMs || Date.now()
  const days = Math.floor((end - earliest) / 86400000) + 1
  return days > 0 ? days : 1
}

// 驱动大类 → 归因 driver 类型
function driverTypeOf(a) {
  return isDebtCategory(a.categoryId) ? 'debtReduction' : a.categoryId
}

// 默认目标月 = 上一个完整月（月度小结总结刚结束的那个月，最有意义）。
function defaultReportMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() - 1, 1)  // 负月份 JS 自动回退到上一年 12 月
}

// monthDate: 目标月内任一 Date（默认上一个完整月）。返回与 getDemoMonthlyReport 同结构。
// 口径（不变量 5）：期初 = 月初前各账户最近一条 balanceAfter；
//   期末 —— 当前月用 live 余额（权威，与首页一致）；过去月把当月交易回放到月末快照。
async function buildMonthlyReport(accounts, monthDate) {
  const ref = monthDate || defaultReportMonth()
  const monthStartMs = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0).getTime()
  const monthEndMs = new Date(ref.getFullYear(), ref.getMonth() + 1, 1, 0, 0, 0, 0).getTime()
  const nowMs = Date.now()
  const isCurrentMonth = nowMs >= monthStartMs && nowMs < monthEndMs
  const periodEndMs = isCurrentMonth ? nowMs : monthEndMs
  const periodLabel = `${ref.getFullYear()} 年 ${ref.getMonth() + 1} 月`

  const included = (accounts || []).filter(a => a.includeInChart !== false)
  // 余额 map 统一以人民币为口径：当前值按原币种折算到人民币；
  // 历史快照(baseBal/endBal)用冻结的人民币快照 balanceAfterCnyFen（老数据回退 balanceAfter）。
  const liveBal = {}
  included.forEach(a => { liveBal[a._id] = valueCnyFen(a) })
  const incSet = {}
  included.forEach(a => { incSet[a._id] = true })

  const totalDays = recordedDays(accounts, periodEndMs)

  // 区间交易（分页）+ 月初基线（批量）并行，共 ~2 次请求。
  // 过去月设上界（只取当月交易）；当前月不设上界（=直到此刻）。
  const [monthTx, base] = await Promise.all([
    fetchTransactionsInRange(monthStartMs, isCurrentMonth ? null : periodEndMs),
    getBaselineBalances(included, monthStartMs),
  ])
  const baseBal = base.baseBal
  const anySnapshot = base.anySnapshot
  const records = monthTx.length
  const updatedSet = {}
  for (const t of monthTx) if (incSet[t.accountId]) updatedSet[t.accountId] = true
  const accountsUpdated = Object.keys(updatedSet).length

  // 期末余额：当前月 = live；过去月 = 月初基线回放当月交易到月末
  let endBal
  if (isCurrentMonth) {
    endBal = liveBal
  } else {
    endBal = {}
    included.forEach(a => { endBal[a._id] = baseBal[a._id] || 0 })
    for (const tx of monthTx) if (incSet[tx.accountId]) endBal[tx.accountId] = tx.balanceAfter
  }
  const netWorthFen = netWorthOf(included, endBal)

  // 无可比基线（月初前无任何记录）→ 降级，不脑补涨幅/归因
  if (!anySnapshot || included.length === 0) {
    const r = {
      isDemo: false, periodLabel, coverage: 'insufficient',
      nwPct: 0, nwDeltaFen: 0, netWorthFen,
      spark: [], movers: [], driver: { key: 'balanced', sharePct: 0 },
      records, accountsUpdated, totalDays,
      milestoneName: null, allTimeHigh: false,
    }
    r.keyword = deriveMonthlyKeyword(r)
    return r
  }

  const baselineFen = netWorthOf(included, baseBal)
  const nwDeltaFen = netWorthFen - baselineFen
  let nwPct = 0
  if (baselineFen !== 0) nwPct = (nwDeltaFen / Math.abs(baselineFen)) * 100
  else if (nwDeltaFen !== 0) nwPct = nwDeltaFen > 0 ? 100 : -100
  nwPct = Math.round(nwPct * 10) / 10

  // 归因：每账户对净值的贡献（负债减少计正），用 期末 − 月初
  let totalPos = 0
  const contribs = []
  for (const a of included) {
    const delta = (endBal[a._id] || 0) - (baseBal[a._id] || 0)
    const contri = isDebtCategory(a.categoryId) ? -delta : delta
    if (contri > 0) totalPos += contri
    contribs.push({ a, contri })
  }
  const movers = contribs
    .filter(c => c.contri > 0)
    .sort((x, y) => y.contri - x.contri)
    .slice(0, 3)
    .map((c, i) => ({
      name: c.a.name,
      cat: isDebtCategory(c.a.categoryId) ? 'debt' : c.a.categoryId,
      dir: 'up',
      sharePct: totalPos > 0 ? Math.round(c.contri / totalPos * 100) : 0,
      amountFen: c.contri,
      best: i === 0,
    }))

  // driver：按类型聚合正贡献，取最大；占比不足则 balanced
  const byType = {}
  for (const c of contribs) {
    if (c.contri <= 0) continue
    const k = driverTypeOf(c.a)
    byType[k] = (byType[k] || 0) + c.contri
  }
  let driver = { key: 'balanced', sharePct: 0 }
  const types = Object.keys(byType)
  if (types.length && totalPos > 0) {
    let maxK = types[0]
    for (const k of types) if (byType[k] > byType[maxK]) maxK = k
    const share = Math.round(byType[maxK] / totalPos * 100)
    driver = share >= TH.driverDominantPct ? { key: maxK, sharePct: share } : { key: 'balanced', sharePct: share }
  }

  const spark = buildSparkReplay(included, baseBal, endBal, monthTx, monthStartMs, periodEndMs)

  const report = {
    isDemo: false, periodLabel, coverage: 'full',
    nwPct, nwDeltaFen, netWorthFen,
    spark, movers, driver,
    records, accountsUpdated, totalDays,
    milestoneName: null,   // TODO: 接 milestones.js 判断本月是否跨过里程碑阈值
    allTimeHigh: false,    // TODO: 遍历历史净值节点判断是否创新高
  }
  report.keyword = deriveMonthlyKeyword(report)
  return report
}

module.exports = {
  TH,
  deriveMonthlyKeyword,
  getDemoMonthlyReport,
  buildMonthlyReport,
  defaultReportMonth,
}
