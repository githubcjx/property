// 统计：首页 hero 下方那一行净资产变化。
//
// 基线是「本月 1 日 00:00」，不是滚动 30 天窗口。
// 这个 App 的节拍从头到尾是「月」——盘点是月度的、月报是月度的、订阅提醒每月 1 号发、
// 固定资产一年估一次。一个 30 天的滚动窗口和其中任何一个都对不齐，用户脑子里得同时
// 装两个周期；而且数据一个月才产生一个点，滚动窗口在同一个月内反复打开纹丝不动，
// 只在刚盘完点的那一秒变一次——那一秒他已经在完成页看过同样的话了。
// 月初那几天数字自然接近 0，那是「这个月刚开始」，不是缺陷（不变量 10）。
const cloud = require('./cloud.js')
const { isDebtCategory } = require('../utils/categories.js')
const { netCnyFen, isIncluded, snapshotCnyFen } = require('../utils/networth.js')
const { startOfMonth } = require('../utils/date.js')

// 每个账户在 since 之前最后一条 tx 的 balanceAfter（不变量 5 的快照口径）。
// cloud.latestBalanceMapBefore：倒序翻页一次取全部账户（通常 1~2 次请求），失败回退逐账户。
async function snapshotsBefore(since, included) {
  try {
    return await cloud.latestBalanceMapBefore(since, included.map(a => a._id))
  } catch (e) {
    console.warn('[stats] 聚合取基线失败，回退逐账户', e)
    const map = {}
    await Promise.all(included.map(async (a) => {
      try {
        const res = await cloud.transactions()
          .where({ accountId: a._id, createdAt: cloud.command().lte(since) })
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get()
        const t = (res.data || [])[0]
        if (t) map[a._id] = snapshotCnyFen(t)
      } catch (err) {
        console.warn('[stats] fetch snapshot error', a._id, err)
      }
    }))
    return map
  }
}

// 自 since 以来的净资产变化。返回 { delta, deltaPct, baseline, hasBaseline }
//   · hasBaseline=false：since 时刻一个账户都还不存在（这个账本那时还没开张）。
//     此时 delta 会等于「全部净资产」，把它说成「本月涨了这么多」是造数 ——
//     调用方应整块隐藏，不要退而求其次显示 +100%。
//   · deltaPct=null：基线恰好为 0（资产与负债相抵），百分比没有意义，只报绝对额。
async function getNetWorthDeltaSince(since, accounts) {
  const empty = { delta: 0, deltaPct: null, baseline: 0, hasBaseline: false }
  if (!since || !accounts || accounts.length === 0) return empty

  const included = accounts.filter(isIncluded)
  if (included.length === 0) return empty

  const snapshotByAcc = await snapshotsBefore(since, included)

  // 只比较「基线时刻就已经存在」的账户：current 与 baseline 必须是同一批账户。
  // 否则本月新建的账户会把它的全部初始余额算成「本月的增长」—— 建一个 200 万的房产
  // 账户进来，首页就会宣布你这个月涨了 200 万。那不是增长，那是你终于把它记下来了。
  let current = 0
  let baseline = 0
  let counted = 0
  for (const a of included) {
    const snap = snapshotByAcc[a._id]
    if (snap == null) continue
    counted++
    baseline += isDebtCategory(a.categoryId) ? -snap : snap
    current += netCnyFen(a)
  }
  if (counted === 0) return empty

  const delta = current - baseline
  const deltaPct = baseline !== 0 ? (delta / Math.abs(baseline)) * 100 : null
  return { delta, deltaPct, baseline, hasBaseline: true }
}

// 本月至今：首页用的就是这个。
async function getMonthToDateDelta(accounts) {
  return getNetWorthDeltaSince(startOfMonth(), accounts)
}

module.exports = {
  getNetWorthDeltaSince,
  getMonthToDateDelta,
}
