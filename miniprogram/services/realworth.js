// 真实净值（购买力）——把「12 个月前的名义净值」用 CPI 折算成今天的钱，再和今天比。
//
// 口径（以今天的钱衡量）：
//   realBaseline = 名义(12个月前) × CPI因子(12个月前→今天)
//   真实增长 = 今天 / realBaseline − 1
//   名义增长 = 今天 / 名义(12个月前) − 1
//   通胀     = CPI因子 − 1
// 全部复用现成件：今日净值用 networth.netCnyFen；12 个月前净值用 stats 的快照重建
//   （不变量 5，与趋势页/近30天同源）；CPI 用 utils/cpiData。
//
// 数据诚实（不变量 10）：缺数据一律降级、绝不脑补——
//   coverage: 'ok' | 'short'(历史不足12个月/无正基线) | 'noCpi'(CPI未覆盖该区间) | 'nodata'(无账户)

const statsSvc = require('./stats.js')
const cpi = require('../utils/cpiData.js')
const { netCnyFen, isIncluded } = require('../utils/networth.js')

const WINDOW_DAYS = 365

function pct(cur, base) {
  if (base) return ((cur - base) / Math.abs(base)) * 100
  return cur ? (cur > 0 ? 100 : -100) : 0
}

async function evaluate(accounts) {
  const included = (accounts || []).filter(isIncluded)
  if (!included.length) return { coverage: 'nodata' }

  const current = included.reduce((s, a) => s + netCnyFen(a), 0)

  // 12 个月前名义净值（快照重建；stats 已做聚合取基线 + 逐账户回退）
  const { baseline } = await statsSvc.getNetWorthDelta(WINDOW_DAYS, accounts)

  // 历史不足或无可比正基线（新用户 / 一年前净值 ≤ 0，增长率无意义）
  if (!baseline || baseline <= 0) return { coverage: 'short', current }

  const now = Date.now()
  const past = now - WINDOW_DAYS * 86400000

  const factor = cpi.factorBetween(past, now)
  if (factor == null) {
    // CPI 未覆盖该区间：仍可诚实给出名义增长，只是不做通胀换算
    return { coverage: 'noCpi', current, baseline, nominalPct: pct(current, baseline) }
  }

  const realBaseline = Math.round(baseline * factor)
  return {
    coverage: 'ok',
    windowMonths: 12,
    current,
    baseline,                          // 名义(12个月前)
    realBaseline,                      // 折合今天的购买力
    realDeltaFen: current - realBaseline,
    realPct: pct(current, realBaseline),
    nominalPct: pct(current, baseline),
    inflationPct: (factor - 1) * 100,
    beatInflation: current >= realBaseline,
    cpiSource: cpi.META.source,
    cpiLatest: cpi.META.latestYm,
  }
}

module.exports = { evaluate }
