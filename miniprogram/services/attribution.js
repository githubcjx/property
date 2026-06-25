// 净资产变动归因 · 把一段时间内的净资产变化拆解到每个账户
//
// 取数语义与 stats.js / milestones.js 一致（见 CLAUDE.md 不变量 5）：
//   期初值 = 每个账户在「期初时点」之前最后一条 tx 的 balanceAfter（冻结快照）
//   期末值 = 账户的 live balance（account.balance，权威）
//   单账户对净资产的贡献 = 负债 ? -(期末-期初) : (期末-期初)
//   Σ 各账户贡献 = 净资产变化（period 内）
// 注意：其它历史 tx 的 balanceAfter 不回算，沿用冻结快照（与编辑/删除行为一致）。
//
// 单位：全程「分」。文案/遮蔽交由页面在 UI 边界处理。

const cloud = require('./cloud.js')
const { isDebtCategory } = require('../utils/categories.js')
const { valueCnyFen, snapshotCnyFen, currentRates } = require('../utils/networth.js')
const { rateToCny } = require('../utils/currency.js')

// 与 stats.js / milestones.js 一致的日期解析
function toMs(d) {
  if (!d) return NaN
  if (d instanceof Date) return d.getTime()
  if (typeof d === 'number') return d
  if (typeof d === 'string') return new Date(d).getTime()
  if (d.$date) return new Date(d.$date).getTime()
  const t = new Date(d).getTime()
  return isNaN(t) ? NaN : t
}

const PERIODS = [
  { key: 'month', label: '本月' },
  { key: 'd30', label: '近 30 天' },
  { key: 'year', label: '今年' },
]

// 期初时点（ms）
function periodStartMs(key) {
  const now = new Date()
  if (key === 'd30') return Date.now() - 30 * 86400000
  if (key === 'year') return new Date(now.getFullYear(), 0, 1).getTime()
  // 默认本月：当月 1 号 00:00（本地时区）
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime()
}

// 异步：需查 transactions 取期初快照
async function evaluate(accounts, periodKey) {
  const key = PERIODS.some(p => p.key === periodKey) ? periodKey : 'month'
  const label = (PERIODS.find(p => p.key === key) || PERIODS[0]).label
  const included = (accounts || []).filter(a => a.includeInChart !== false)
  if (included.length === 0) {
    return { hasData: false, periodKey: key, periodLabel: label, periods: PERIODS }
  }

  const startMs = periodStartMs(key)
  const since = new Date(startMs)

  // 期初快照：每个账户单独取「期初时点之前的最新一条」balanceAfter。
  // 不能用「升序 + limit(1000)」一次拉全量：小程序端 get() 单次最多 20 条
  // （limit 上限即 20），升序会被截成「最旧的 20 条」，账户多/交易多时期初取错。
  // 改为按账户 desc + limit(1)，每次只取 1 条，既精确又不触 20 条上限。
  const startByAcc = {}
  await Promise.all(included.map(async (a) => {
    try {
      const res = await cloud.transactions()
        .where({ accountId: a._id, createdAt: cloud.command().lte(since) })
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get()
      const t = (res.data || [])[0]
      // 期初快照保留：人民币值(cny) + 当时汇率(rate) + 原币种余额(native)，
      // 用于把"纯汇率波动"从"资金流"里拆出来。
      if (t) startByAcc[a._id] = { cny: snapshotCnyFen(t), rate: t.fxRate, native: t.balanceAfter || 0 }
    } catch (err) {
      console.warn('[attribution] fetch start snapshot error', a._id, err)
    }
  }))

  const rates = currentRates()
  let baseline = 0 // 期初净资产
  let current = 0 // 期末（当前）净资产
  let fxFen = 0   // 期间纯汇率波动对净值的有向贡献（人民币）
  const contributors = []
  for (const a of included) {
    const isDebt = isDebtCategory(a.categoryId)
    const start = startByAcc[a._id]
    const hasStart = start != null
    const startBal = hasStart ? start.cny : 0
    const endBal = valueCnyFen(a)   // 当前余额，原币种折算到人民币
    const isNew = !hasStart && toMs(a.createdAt) > startMs

    const startContrib = isDebt ? -startBal : startBal
    const endContrib = isDebt ? -endBal : endBal
    baseline += startContrib
    current += endContrib

    const contribution = endContrib - startContrib
    // 汇兑损益：期初持仓因汇率变动产生的人民币估值变化 = 原币种期初余额 ×(现汇率 − 期初汇率)。
    // 只对外币、且两端汇率都已知时计算；这部分是"估值变动"，不是你存取的资金流。
    let fxComp = 0
    const ccy = a.currency || 'CNY'
    const rateNow = rateToCny(ccy, rates)
    if (hasStart && ccy !== 'CNY' && rateNow != null && start.rate != null) {
      const raw = start.native * (rateNow - start.rate)
      fxComp = (isDebt ? -raw : raw)
      fxFen += fxComp
    }
    if (contribution === 0 && fxComp === 0) continue
    contributors.push({
      accountId: a._id,
      name: a.name,
      icon: a.icon || 'folder',
      colorClass: a.categoryId,
      categoryId: a.categoryId,
      isDebt,
      startFen: startBal,
      endFen: endBal,
      balanceDelta: endBal - startBal,
      contribution, // 对净资产的有向贡献（负债下降为正贡献）
      fxFen: Math.round(fxComp),       // 其中汇率影响
      flowFen: Math.round(contribution - fxComp), // 其中资金流（存取/涨跌）
      isNew,
    })
  }

  const totalDelta = current - baseline
  let totalDeltaPct = 0
  if (baseline !== 0) totalDeltaPct = (totalDelta / Math.abs(baseline)) * 100
  else if (totalDelta !== 0) totalDeltaPct = totalDelta > 0 ? 100 : -100

  // 排序：贡献从大到小（涨在上、跌在下，类瀑布）
  contributors.sort((a, b) => b.contribution - a.contribution)

  // 每项「变动占比」= |贡献| / Σ|贡献|，用于条宽
  const totalAbs = contributors.reduce((s, c) => s + Math.abs(c.contribution), 0) || 1
  let gainSum = 0
  let lossSum = 0
  for (const c of contributors) {
    c.pctOfChange = (Math.abs(c.contribution) / totalAbs) * 100
    if (c.contribution > 0) gainSum += c.contribution
    else lossSum += c.contribution
  }

  return {
    hasData: true,
    periodKey: key,
    periodLabel: label,
    periods: PERIODS,
    baseline,
    current,
    totalDelta,
    totalDeltaPct,
    contributors,
    gainSum,
    lossSum,
    fxFen: Math.round(fxFen),   // 期间纯汇率影响（人民币，有向）；无外币时为 0
    hasMovement: contributors.length > 0,
  }
}

module.exports = {
  evaluate,
  PERIODS,
}
