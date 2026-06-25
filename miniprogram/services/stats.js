// 统计：过去 30 天净资产同比变化
const cloud = require('./cloud.js')
const { isDebtCategory } = require('../utils/categories.js')
const { netCnyFen, isIncluded, snapshotCnyFen } = require('../utils/networth.js')

// 计算最近 N 天的净资产 delta + 百分比
// 采用 snapshot 语义（同趋势页）：baseline = ∑ 每账户在 T-N 之前最后一条 tx 的 balanceAfter；
// 这样在窗口内新建账户的初始余额不会被误算成"近 N 天变化"。
// 返回 { delta: fen, deltaPct: number, baseline: fen }
async function getNetWorthDelta(days, accounts) {
  if (!accounts || accounts.length === 0) {
    return { delta: 0, deltaPct: 0, baseline: 0 }
  }

  // 当前净资产（仅含 includeInChart 的账户，按原币种折算到人民币）
  let current = 0
  const included = []
  for (const a of accounts) {
    if (!isIncluded(a)) continue
    included.push(a)
    current += netCnyFen(a)
  }
  if (included.length === 0) {
    return { delta: 0, deltaPct: 0, baseline: 0 }
  }

  const sinceMs = Date.now() - days * 86400000
  const since = new Date(sinceMs)

  // 基线 = 每账户在 T-N 之前最近一条 tx 的 balanceAfter。
  // cloud.latestBalanceMapBefore：倒序翻页取全部账户基线（通常 1~2 次请求），失败回退逐账户。
  let snapshotByAcc = {}
  try {
    snapshotByAcc = await cloud.latestBalanceMapBefore(since, included.map(a => a._id))
  } catch (e) {
    console.warn('[stats] 聚合取基线失败，回退逐账户', e)
    await Promise.all(included.map(async (a) => {
      try {
        const res = await cloud.transactions()
          .where({ accountId: a._id, createdAt: cloud.command().lte(since) })
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get()
        const t = (res.data || [])[0]
        if (t) snapshotByAcc[a._id] = snapshotCnyFen(t)
      } catch (err) {
        console.warn('[stats] fetch snapshot error', a._id, err)
      }
    }))
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
