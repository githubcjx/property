// 统计：过去 30 天净资产同比变化
const cloud = require('./cloud.js')
const { isDebtCategory } = require('../utils/categories.js')

// 计算最近 N 天的净资产 delta + 百分比
// 返回 { delta: fen, deltaPct: number, baseline: fen }
async function getNetWorthDelta(days, accounts) {
  if (!accounts || accounts.length === 0) {
    return { delta: 0, deltaPct: 0, baseline: 0 }
  }

  // 当前净资产（已计入图表）
  let current = 0
  const includedIds = []
  for (const a of accounts) {
    if (a.includeInChart === false) continue
    includedIds.push(a._id)
    const v = a.balance || 0
    if (isDebtCategory(a.categoryId)) current -= v
    else current += v
  }
  if (includedIds.length === 0) {
    return { delta: 0, deltaPct: 0, baseline: 0 }
  }

  const sinceMs = Date.now() - days * 86400000
  const since = new Date(sinceMs)

  // 拉取窗口内的所有 transactions
  let txs = []
  try {
    const res = await cloud.transactions()
      .where({ createdAt: cloud.command().gte(since) })
      .orderBy('createdAt', 'asc')
      .limit(1000)
      .get()
    txs = res.data || []
  } catch (err) {
    console.warn('[stats] fetch tx error', err)
    return { delta: 0, deltaPct: 0, baseline: current }
  }

  // 仅保留 includeInChart 的账户对应的 tx
  const includedSet = includedIds.reduce((m, id) => { m[id] = true; return m }, {})
  const catMap = accounts.reduce((m, a) => { m[a._id] = a.categoryId; return m }, {})

  // 30 天内净资产变化 = ∑ (delta * sign), 其中 sign = 负债账户为 -1，其它为 +1
  let delta = 0
  for (const t of txs) {
    if (!includedSet[t.accountId]) continue
    const cat = catMap[t.accountId]
    const sign = isDebtCategory(cat) ? -1 : 1
    delta += sign * (t.amount || 0)
  }

  const baseline = current - delta
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
