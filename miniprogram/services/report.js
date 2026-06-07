// 净值报告 · 月报(单关键词) + 年报(资产人格) 的派生规则与数据编排
//
// ⚠️ 当前为「演示数据」阶段：USE_DEMO=true 时 buildMonthlyReport() 返回写死的示例数据，
//    仅供开发预览页面效果。发版前务必：① 把 USE_DEMO 置 false ② 补完真实计算（见各 TODO）。
//    演示数据不会展示给真实用户（页面 USE_DEMO 同步关闭即可）。
//
// 数据诚实（CLAUDE.md 不变量 10）：正式计算只能用真实存储/可算的数据
//   —— 月报涨幅来自 stats.js、归因来自 attribution.js、体检分用 health.evaluateAt() 重算、
//      坚持度数 transactions；无可比数据时降级，不脑补。

const cloud = require('./cloud.js')
const healthSvc = require('./health.js')
const { isDebtCategory } = require('../utils/categories.js')

// ===================== 可调阈值 =====================
const TH = {
  // 月报
  monthUpPct: 1,          // 涨幅 ≥ 视为「涨」
  monthDownPct: -1,       // 涨幅 ≤ 视为「跌」
  driverDominantPct: 45,  // 单一驱动占比 ≥ 视为「主导」，否则「均衡」
  recordsDiligent: 4,     // 月记录 ≥ 视为「自律」
  healthUp: 5,            // 健康分提升 ≥ 视为「向好」
  // 年报
  yearInvestGrowthPct: 40, // A 轴：投资对全年增长贡献 ≥ → 进取
  yearInvestRatioPct: 30,  // A 轴兜底（无增长时）：年末投资资产占比 ≥ → 进取
  yearMaxCatPct: 50,       // B 轴：年末最大单一大类占比 ≤ → 多元，否则聚焦
  yearDebtDropPP: 5,       // 特质·去杠杆：负债率年降 ≥ 个百分点
  yearHealthUp: 8,         // 特质·体质进阶：健康分年升 ≥
  yearMonthsRecorded: 8,   // 特质·自律复盘：全年有记录月份 ≥
}

// ===================== 月报 · 单关键词 =====================
// 输入 report 对象需含：coverage / milestoneName / allTimeHigh / nwPct / driver{key,sharePct} / health.delta / records
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
  const hd = (r.health && r.health.delta) || 0
  if (hd >= TH.healthUp) return { word: '稳中向好', why: `净值基本持平，但财务健康分提升了 ${hd} 分。` }
  if ((r.records || 0) >= TH.recordsDiligent) return { word: '自律复盘', why: `本月你记录了 ${r.records} 次，坚持复盘最难得。` }
  return { word: '波澜不惊', why: '本月净值平稳，没有大起大落。' }
}

// ===================== 年报 · 资产人格（2 轴 4 型 + 特质标签）=====================
// 输入 y 需含：coverage / monthsActive / yearGrew / investmentGrowthSharePct / investRatioPct / maxCategorySharePct
//   及特质输入：hadDrawdownButEndedHigher / mostMonthsUp / allTimeHighInYear / debtDropPP / healthDeltaYear / monthsRecorded / emergencyFundOk
const PERSONA_DESC = {
  '多元进取者': '你敢于配置权益，又懂得分散布局，攻守兼备。',
  '锐意聚焦者': '你重仓你所相信的，集中下注、目标清晰。',
  '稳健布局者': '你靠稳步积累 + 多元配置，把财富越滚越稳。',
  '深耕守成者': '你专注于核心资产，一步一个脚印地积累。',
}
function deriveAssetPersonality(y) {
  if (!y || y.coverage === 'insufficient') {
    return { name: '年度记录新手', desc: '今年的数据还不足以刻画完整的资产人格，明年见。', axes: null, traits: [] }
  }
  // A 轴：进取 ↔ 积累
  const aggressive = y.yearGrew
    ? (y.investmentGrowthSharePct || 0) >= TH.yearInvestGrowthPct
    : (y.investRatioPct || 0) >= TH.yearInvestRatioPct
  // B 轴：多元 ↔ 聚焦
  const diversified = (y.maxCategorySharePct != null ? y.maxCategorySharePct : 100) <= TH.yearMaxCatPct

  const name = aggressive
    ? (diversified ? '多元进取者' : '锐意聚焦者')
    : (diversified ? '稳健布局者' : '深耕守成者')

  const traits = []
  if (y.hadDrawdownButEndedHigher) traits.push('穿越波动')
  if (y.mostMonthsUp) traits.push('稳步上行')
  if (y.allTimeHighInYear) traits.push('再创新高')
  if ((y.debtDropPP || 0) >= TH.yearDebtDropPP) traits.push('去杠杆能手')
  if ((y.healthDeltaYear || 0) >= TH.yearHealthUp) traits.push('体质进阶')
  if ((y.monthsRecorded || 0) >= TH.yearMonthsRecorded) traits.push('自律复盘')
  if (y.emergencyFundOk) traits.push('现金充裕')

  return {
    name,
    desc: PERSONA_DESC[name],
    axes: { aggressive, diversified },
    traits: traits.slice(0, 3),
  }
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
    health: { score: 82, status: 'good', delta: 3 },
    // 关键词派生输入
    milestoneName: null,
    allTimeHigh: false,
    driver: { key: 'investment', sharePct: 62 },
  }
  r.keyword = deriveMonthlyKeyword(r)
  return r
}

// ===================== 真实月报编排 =====================
// 口径与 stats.js / health.evaluateAt 一致（CLAUDE.md 不变量 5）：历史余额 = 该账户在某时点前最近一条 balanceAfter。
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
      if (t) { balances[a._id] = t.balanceAfter || 0; anySnapshot = true }
      else balances[a._id] = 0
    } catch (e) { balances[a._id] = 0 }
  }))
  return { balances, anySnapshot }
}

// 月内净值走势（n 个节点，归一化为 0-100 柱高）
async function buildSpark(accounts, startMs, endMs, n) {
  const count = n || 6
  const curBal = {}
  accounts.forEach(a => { curBal[a._id] = a.balance || 0 })
  const vals = []
  for (let i = 0; i < count; i++) {
    const t = startMs + (endMs - startMs) * i / (count - 1)
    if (i === count - 1) { vals.push(netWorthOf(accounts, curBal)); continue }
    const { balances } = await snapshotBalances(accounts, t)
    vals.push(netWorthOf(accounts, balances))
  }
  const min = Math.min.apply(null, vals)
  const max = Math.max.apply(null, vals)
  return vals.map(v => (max === min ? 60 : Math.round(((v - min) / (max - min)) * 70 + 20)))
}

async function countMonthRecords(monthStartMs) {
  try {
    const res = await cloud.transactions()
      .where({ createdAt: cloud.command().gte(new Date(monthStartMs)) }).count()
    return res.total || 0
  } catch (e) { return 0 }
}

function recordedDays(accounts) {
  let earliest = 0
  for (const a of accounts) {
    const t = toMs(a.createdAt)
    if (t > 0 && (earliest === 0 || t < earliest)) earliest = t
  }
  if (!earliest) return 0
  const days = Math.floor((Date.now() - earliest) / 86400000) + 1
  return days > 0 ? days : 1
}

// 驱动大类 → 归因 driver 类型
function driverTypeOf(a) {
  return isDebtCategory(a.categoryId) ? 'debtReduction' : a.categoryId
}

// monthDate: 目标月内任一 Date（默认本月）。返回与 getDemoMonthlyReport 同结构。
async function buildMonthlyReport(accounts, monthDate) {
  const ref = monthDate || new Date()
  const monthStartMs = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0).getTime()
  const nowMs = Date.now()
  const periodLabel = `${ref.getFullYear()} 年 ${ref.getMonth() + 1} 月`

  const included = (accounts || []).filter(a => a.includeInChart !== false)
  const curBal = {}
  included.forEach(a => { curBal[a._id] = a.balance || 0 })
  const netWorthFen = netWorthOf(included, curBal)

  const curHealthR = healthSvc.evaluate(accounts)
  const records = await countMonthRecords(monthStartMs)
  const accountsUpdated = included.filter(a => toMs(a.updatedAt) >= monthStartMs).length
  const totalDays = recordedDays(accounts)

  // 期初快照（月初）
  const { balances: baseBal, anySnapshot } = await snapshotBalances(included, monthStartMs)

  // 无可比基线（月初前无任何记录）→ 降级，不脑补涨幅/归因
  if (!anySnapshot || included.length === 0) {
    const r = {
      isDemo: false, periodLabel, coverage: 'insufficient',
      nwPct: 0, nwDeltaFen: 0, netWorthFen,
      spark: [], movers: [], driver: { key: 'balanced', sharePct: 0 },
      records, accountsUpdated, totalDays,
      health: { score: curHealthR.overall.score, status: curHealthR.overall.status, delta: 0 },
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

  // 归因：每账户对净值的贡献（负债减少计正）
  let totalPos = 0
  const contribs = []
  for (const a of included) {
    const delta = (curBal[a._id] || 0) - (baseBal[a._id] || 0)
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

  // 健康分环比（用上月末重算，不存储）
  let healthDelta = 0
  const prevHealthR = await healthSvc.evaluateAt(accounts, monthStartMs)
  if (prevHealthR && prevHealthR.overall.score != null && curHealthR.overall.score != null) {
    healthDelta = curHealthR.overall.score - prevHealthR.overall.score
  }

  const spark = await buildSpark(included, monthStartMs, nowMs)

  const report = {
    isDemo: false, periodLabel, coverage: 'full',
    nwPct, nwDeltaFen, netWorthFen,
    spark, movers, driver,
    records, accountsUpdated, totalDays,
    health: { score: curHealthR.overall.score, status: curHealthR.overall.status, delta: healthDelta },
    milestoneName: null,   // TODO: 接 milestones.js 判断本月是否跨过里程碑阈值
    allTimeHigh: false,    // TODO: 遍历历史净值节点判断是否创新高
  }
  report.keyword = deriveMonthlyKeyword(report)
  return report
}

module.exports = {
  TH,
  deriveMonthlyKeyword,
  deriveAssetPersonality,
  getDemoMonthlyReport,
  buildMonthlyReport,
}
