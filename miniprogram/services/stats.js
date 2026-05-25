// 统计：过去 30 天净资产同比变化
const cloud = require('./cloud.js')
const { isDebtCategory } = require('../utils/categories.js')

// 与 chart.js 保持一致的日期解析
function toMs(d) {
  if (!d) return NaN
  if (d instanceof Date) return d.getTime()
  if (typeof d === 'number') return d
  if (typeof d === 'string') return new Date(d).getTime()
  if (d.$date) return new Date(d.$date).getTime()
  const t = new Date(d).getTime()
  return isNaN(t) ? NaN : t
}

// 计算最近 N 天的净资产 delta + 百分比
// 采用 snapshot 语义（同趋势页）：baseline = ∑ 每账户在 T-N 之前最后一条 tx 的 balanceAfter；
// 这样在窗口内新建账户的初始余额不会被误算成"近 N 天变化"。
// 返回 { delta: fen, deltaPct: number, baseline: fen }
async function getNetWorthDelta(days, accounts) {
  if (!accounts || accounts.length === 0) {
    return { delta: 0, deltaPct: 0, baseline: 0 }
  }

  // 当前净资产（仅含 includeInChart 的账户）
  let current = 0
  const included = []
  for (const a of accounts) {
    if (a.includeInChart === false) continue
    included.push(a)
    const v = a.balance || 0
    if (isDebtCategory(a.categoryId)) current -= v
    else current += v
  }
  if (included.length === 0) {
    return { delta: 0, deltaPct: 0, baseline: 0 }
  }

  const sinceMs = Date.now() - days * 86400000
  const since = new Date(sinceMs)

  // 拉取 T-N 之前的所有 tx（升序），用来取每个账户在该时刻的余额快照
  let txs = []
  try {
    const res = await cloud.transactions()
      .where({ createdAt: cloud.command().lte(since) })
      .orderBy('createdAt', 'asc')
      .limit(1000)
      .get()
    txs = res.data || []
  } catch (err) {
    console.warn('[stats] fetch tx error', err)
    return { delta: 0, deltaPct: 0, baseline: current }
  }

  // 每个账户取最后一条 tx 的 balanceAfter 作为 T-N 时刻的余额快照
  const snapshotByAcc = {}
  for (const t of txs) {
    const ct = toMs(t.createdAt)
    if (isNaN(ct) || ct > sinceMs) continue
    snapshotByAcc[t.accountId] = t.balanceAfter || 0
  }

  let baseline = 0
  for (const a of included) {
    const snap = snapshotByAcc[a._id]
    if (snap == null) continue   // T-N 时该账户尚不存在
    if (isDebtCategory(a.categoryId)) baseline -= snap
    else baseline += snap
  }

  const delta = current - baseline
  let deltaPct = 0
  if (baseline !== 0) {
    deltaPct = (delta / Math.abs(baseline)) * 100
  } else if (delta !== 0) {
    deltaPct = delta > 0 ? 100 : -100
  }

  return { delta, deltaPct, baseline }
}

module.exports = {
  getNetWorthDelta,
}
