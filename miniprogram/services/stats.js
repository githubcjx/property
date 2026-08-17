// 统计：首页 hero 下方那一行净资产变化。
//
// 基线是「30 天前」这个滚动窗口，不是日历月界。这一条试过日历、退回来了，别再改：
//
//   · 数据是不规则采样的 —— 一个月才产生一个点，而那个点落在哪天完全由用户决定。
//     日历锚（本月至今 / 上个月）在这种数据上一定会错位：月底记账的人，「本月至今」
//     一个月里有 29 天显示 0；月初记账的人，标着「8月」的数字量的其实是 7/2→8/2。
//     标签宣称了一个数据给不了的精度，那就是造数（不变量 10）。
//   · 滚动窗口的基线是「大约一个月前你上次记的那个点」，它自己会跟着每个人的节奏走：
//     8/31 记的人和 9/2 记的人，看到的都是各自那一个月的真实变化。
//   · 它在月内纹丝不动 —— 这是对的，不是缺陷。这是个月度节拍的产品，数据一个月才动
//     一次；数据没变而数字每次打开都在跳，那才是假话。
//
// 「较上次记录」也试过，同样别再改：区间长度会随记录间隔随机伸缩（5 天涨 3000 和
// 53 天涨 8 万并排出现，后者看起来大 26 倍），而且随手改一个账户余额就会重置锚点，
// 把上一次认真盘点的成果整个抹掉 —— transactions 里分不出「全面盘点」和「随手一改」。
const cloud = require('./cloud.js')
const { isDebtCategory } = require('../utils/categories.js')
const { netCnyFen, isIncluded, snapshotCnyFen } = require('../utils/networth.js')

const RECENT_DAYS = 30

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

// 自 since 以来的净资产变化（since 由调用方给，月报要算任意区间可以直接用）。
// 返回 { delta, deltaPct, baseline, hasBaseline }
//   · hasBaseline=false：since 时刻一个账户都还不存在（这个账本那时还没开张）。
//     此时 delta 会等于「全部净资产」，把它说成「这段时间涨了这么多」是造数 ——
//     调用方应整块隐藏，不要退而求其次显示 +100%。
//   · deltaPct=null：基线恰好为 0（资产与负债相抵），百分比没有意义，只报绝对额。
async function getNetWorthDeltaSince(since, accounts) {
  const empty = { delta: 0, deltaPct: null, baseline: 0, hasBaseline: false }
  if (!since || !accounts || accounts.length === 0) return empty

  const included = accounts.filter(isIncluded)
  if (included.length === 0) return empty

  const snapshotByAcc = await snapshotsBefore(since, included)

  // 只比较「基线时刻就已经存在」的账户：current 与 baseline 必须是同一批账户。
  // 否则窗口内新建的账户会把它的全部初始余额算成「这段时间的增长」—— 建一个 200 万的
  // 房产账户进来，首页就会宣布你这个月涨了 200 万。那不是增长，那是你终于把它记下来了。
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

// 近一个月：首页用的就是这个。
async function getRecentDelta(accounts) {
  return getNetWorthDeltaSince(new Date(Date.now() - RECENT_DAYS * 86400000), accounts)
}

module.exports = {
  getNetWorthDeltaSince,
  getRecentDelta,
}
