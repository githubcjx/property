// 财务体检 · 指标计算
// 指标定义全部来自《家庭财务指标》（百度百科收录的国际理财规划师标准家庭财务比率体系）
// 与中国人民银行《2019 年中国城镇居民家庭资产负债情况调查》对照基准。
//
// 输出结构：
// {
//   totals: { assets, liabilities, netWorth, liquid, investment, fixed, receivable },
//   metrics: [ ... ],
//   overall: { score, status, headline, desc },
//   advice: [ ... ]
// }
//
// 金额单位：分（fen）。

const cloud = require('./cloud.js')
const { isDebtCategory } = require('../utils/categories.js')
const { valueCnyFen, isIncluded } = require('../utils/networth.js')

// ---------- 阈值 / 央行 2019 均值常量 ----------

// 家庭财务指标官方推荐区间
const TH = {
  debtRatio:      { target: 0.5, warn: 0.5, alert: 0.7 },  // ≤0.5 健康
  solvencyRatio:  { target: 0.5, warn: 0.5, alert: 0.3 },  // ≥0.5 健康
  immediateRatio: { target: 0.7, warn: 0.3, alert: 0.1 },  // ≈0.7
}

// 央行 2019 城镇居民家庭资产负债调查的全国均值（对照基准，非评分阈值）
const PBOC_2019 = {
  financialRatio: 0.204,   // 金融资产占总资产 20.4%
  housingRatio:   0.591,   // 住房资产占总资产 59.1%
}

// ---------- 工具函数 ----------

// 下列汇总均按原币种折算到人民币（valueCnyFen）后相加。

function sumByCategory(accounts, categoryId) {
  let s = 0
  for (const a of accounts) {
    if (!isIncluded(a)) continue
    if (a.categoryId === categoryId) s += valueCnyFen(a)
  }
  return s
}

function sumAssets(accounts) {
  let s = 0
  for (const a of accounts) {
    if (!isIncluded(a)) continue
    if (isDebtCategory(a.categoryId)) continue
    s += valueCnyFen(a)
  }
  return s
}

function sumLiabilities(accounts) {
  let s = 0
  for (const a of accounts) {
    if (!isIncluded(a)) continue
    if (isDebtCategory(a.categoryId)) s += valueCnyFen(a)
  }
  return s
}

function fmtPct(v, fixed) {
  if (v == null || isNaN(v)) return '—'
  const n = (v * 100)
  return n.toFixed(fixed == null ? 1 : fixed) + '%'
}

// ---------- 单项打分（仅 3 个 scorable 指标参与综合分） ----------

function scoreDebtRatio(v) {
  if (v == null) return null
  if (v <= 0.3) return 100
  if (v <= 0.5) return 80
  if (v <= 0.7) return 50
  return 20
}

function scoreSolvencyRatio(v) {
  if (v == null) return null
  if (v >= 0.7) return 100
  if (v >= 0.5) return 80
  if (v >= 0.3) return 50
  return 20
}

function scoreImmediateRatio(v) {
  if (v == null) return 100   // 零负债：视为满分
  if (v >= 0.7) return 100
  if (v >= 0.3) return 70
  if (v >= 0.1) return 40
  return 20
}

function statusByScore(score) {
  if (score == null) return 'neutral'
  if (score >= 80) return 'good'
  if (score >= 50) return 'warn'
  return 'alert'
}

// 央行均值对照型指标：偏离 ±10pct 视为 good，±20pct 视为 warn，否则 alert
function statusByDeviation(value, baseline) {
  if (value == null || isNaN(value)) return 'neutral'
  const diff = Math.abs(value - baseline)
  if (diff <= 0.10) return 'good'
  if (diff <= 0.20) return 'warn'
  return 'alert'
}

// ---------- 主入口 ----------

function evaluate(accounts) {
  const assets       = sumAssets(accounts)
  const liabilities  = sumLiabilities(accounts)
  const netWorth     = assets - liabilities
  const liquid       = sumByCategory(accounts, 'liquid')
  const investment   = sumByCategory(accounts, 'investment')
  const fixed        = sumByCategory(accounts, 'fixed')
  const receivable   = sumByCategory(accounts, 'receivable')

  // ---- 三项官方家庭财务指标 ----

  // 1. 负债比率 = 负债总额 / 总资产
  const debtRatio = assets > 0 ? liabilities / assets : null
  const debtScore = scoreDebtRatio(debtRatio)

  // 2. 清偿比率 = 净资产 / 总资产
  const solvencyRatio = assets > 0 ? netWorth / assets : null
  const solvencyScore = scoreSolvencyRatio(solvencyRatio)

  // 3. 即付比率 = 流动资产 / 负债总额
  const immediateRatio = liabilities > 0 ? liquid / liabilities : null
  const immediateScore = scoreImmediateRatio(immediateRatio)

  // ---- 三项央行均值对照 ----

  // 4. 金融资产占比 = (流动 + 投资) / 总资产，央行 2019 均值 20.4%
  const financialRatio = assets > 0 ? (liquid + investment) / assets : null

  // 5. 房产/固定资产占比 = 固定 / 总资产，央行 2019 均值 59.1%
  const housingRatio = assets > 0 ? fixed / assets : null

  // 6. 投资与净资产比率 = 投资资产 / 净资产（《家庭财务指标》指标，反映通过投资提升净资产的能力，无固定阈值）
  const investToNetWorth = netWorth > 0 ? investment / netWorth : null

  // ---- 综合分 = 3 项官方指标的算术平均 ----
  let scoreList = [debtScore, solvencyScore, immediateScore].filter(s => s != null)
  const overallScore = scoreList.length > 0
    ? Math.round(scoreList.reduce((a, b) => a + b, 0) / scoreList.length)
    : null
  const overallStatus = statusByScore(overallScore)

  // ---- 头部文案 ----
  let headline, desc
  if (overallScore == null) {
    headline = '尚无数据'
    desc = '添加账户后即可生成体检报告。'
  } else if (overallScore >= 85) {
    headline = '资产结构稳健'
    desc = '负债、净值与流动性比例均处于推荐区间，继续保持。'
  } else if (overallScore >= 70) {
    headline = '良好，仍有空间'
    desc = '主要指标接近推荐区间，可针对偏离项进行结构优化。'
  } else if (overallScore >= 50) {
    headline = '需要关注'
    desc = '存在一至两项偏离推荐区间，建议优先改善标红的指标。'
  } else {
    headline = '建议尽快调整'
    desc = '多项指标超出警戒值，建议优先降低负债压力、增强流动性。'
  }

  // ---- 6 项指标完整对象 ----
  const metrics = [
    {
      key: 'debtRatio',
      name: '负债比率',
      formula: '负债总额 / 总资产',
      definition: '反映负债占总资产的比重，越低越稳健。',
      source: '家庭财务指标 · 推荐 ≤ 0.5',
      sourceShort: '推荐 ≤ 50%',
      value: debtRatio,
      valueText: fmtPct(debtRatio),
      gaugePct: debtRatio == null ? 0 : Math.min(debtRatio * 100, 100),
      markerPct: 50,
      scorable: true,
      score: debtScore,
      status: statusByScore(debtScore),
      direction: 'lower',  // 越低越好
    },
    {
      key: 'solvencyRatio',
      name: '清偿比率',
      formula: '净资产 / 总资产',
      definition: '反映在总资产中可由家庭真正自有支配的比例。',
      source: '家庭财务指标 · 推荐 ≥ 0.5',
      sourceShort: '推荐 ≥ 50%',
      value: solvencyRatio,
      valueText: fmtPct(solvencyRatio),
      gaugePct: solvencyRatio == null ? 0 : Math.max(0, Math.min(solvencyRatio * 100, 100)),
      markerPct: 50,
      scorable: true,
      score: solvencyScore,
      status: statusByScore(solvencyScore),
      direction: 'higher',
    },
    {
      key: 'immediateRatio',
      name: '即付比率',
      formula: '流动资产 / 负债总额',
      definition: '反映用流动资产即时偿付全部负债的能力。',
      source: '家庭财务指标 · 推荐 ≈ 0.7',
      sourceShort: '推荐 ≈ 70%',
      value: immediateRatio,
      valueText: liabilities === 0 ? '无负债' : fmtPct(immediateRatio),
      gaugePct: immediateRatio == null ? 100 : Math.min(immediateRatio * 100, 100),
      markerPct: 70,
      scorable: true,
      score: immediateScore,
      status: statusByScore(immediateScore),
      direction: 'higher',
    },
    {
      key: 'investToNetWorth',
      name: '投资与净资产比率',
      formula: '投资资产 / 净资产',
      definition: '反映通过投资提升净资产规模的能力。',
      source: '家庭财务指标（无固定阈值）',
      sourceShort: '能力型指标',
      value: investToNetWorth,
      valueText: fmtPct(investToNetWorth),
      gaugePct: investToNetWorth == null ? 0 : Math.min(investToNetWorth * 100, 100),
      markerPct: null,
      scorable: false,
      score: null,
      status: 'neutral',
      direction: 'higher',
    },
    {
      key: 'financialRatio',
      name: '金融资产占比',
      formula: '(流动 + 投资) / 总资产',
      definition: '央行 2019 调查中全国城镇家庭均值为 20.4%。',
      source: '央行《2019 城镇居民家庭资产负债情况调查》',
      sourceShort: '央行均值 20.4%',
      value: financialRatio,
      valueText: fmtPct(financialRatio),
      gaugePct: financialRatio == null ? 0 : Math.min(financialRatio * 100, 100),
      markerPct: PBOC_2019.financialRatio * 100,
      scorable: false,
      score: null,
      status: statusByDeviation(financialRatio, PBOC_2019.financialRatio),
      direction: 'reference',
      baseline: PBOC_2019.financialRatio,
    },
    {
      key: 'housingRatio',
      name: '住房/固定资产占比',
      formula: '固定资产 / 总资产',
      definition: '央行 2019 调查中全国城镇家庭住房资产占总资产均值为 59.1%。',
      source: '央行《2019 城镇居民家庭资产负债情况调查》',
      sourceShort: '央行均值 59.1%',
      value: housingRatio,
      valueText: fmtPct(housingRatio),
      gaugePct: housingRatio == null ? 0 : Math.min(housingRatio * 100, 100),
      markerPct: PBOC_2019.housingRatio * 100,
      scorable: false,
      score: null,
      status: statusByDeviation(housingRatio, PBOC_2019.housingRatio),
      direction: 'reference',
      baseline: PBOC_2019.housingRatio,
    },
  ]

  // ---- 改善建议（按严重度排序） ----
  const advice = buildAdvice(metrics, { liquid, fixed, liabilities, assets })

  return {
    totals: { assets, liabilities, netWorth, liquid, investment, fixed, receivable },
    metrics,
    overall: {
      score: overallScore,
      status: overallStatus,
      headline,
      desc,
    },
    advice,
  }
}

// 给单条建议
function buildAdvice(metrics, raw) {
  const list = []

  const debt = metrics.find(m => m.key === 'debtRatio')
  const solv = metrics.find(m => m.key === 'solvencyRatio')
  const imm  = metrics.find(m => m.key === 'immediateRatio')
  const fin  = metrics.find(m => m.key === 'financialRatio')
  const hou  = metrics.find(m => m.key === 'housingRatio')

  if (debt && debt.status === 'alert') {
    list.push({
      severity: 'alert',
      title: '负债比率 ' + debt.valueText + '，超出警戒线 50%',
      desc: '建议优先偿还高利率债务（信用卡、消费贷），降低杠杆。',
    })
  } else if (debt && debt.status === 'warn') {
    list.push({
      severity: 'warn',
      title: '负债比率 ' + debt.valueText + '，接近 50% 警戒线',
      desc: '可考虑提前还款或控制新增负债，保持稳健。',
    })
  }

  if (imm && imm.status === 'alert' && raw.liabilities > 0) {
    list.push({
      severity: 'alert',
      title: '即付比率 ' + imm.valueText + '，远低于推荐值 70%',
      desc: '流动资产难以覆盖短期偿债压力，建议增厚现金类资产储备。',
    })
  }

  if (solv && solv.status === 'alert') {
    list.push({
      severity: 'alert',
      title: '清偿比率 ' + solv.valueText + '，低于推荐 50%',
      desc: '总资产中自有部分偏少，建议减少负债或暂缓大额支出。',
    })
  }

  if (hou && hou.status !== 'good' && hou.value != null) {
    const dev = hou.value - 0.591
    if (dev > 0.10) {
      list.push({
        severity: hou.status,
        title: '住房资产占比 ' + hou.valueText + '，高于央行均值 59.1%',
        desc: '不动产占比较高、流动性受限，可逐步增配金融资产以分散风险。',
      })
    }
  }

  if (fin && fin.status !== 'good' && fin.value != null) {
    const dev = fin.value - 0.204
    if (dev < -0.10) {
      list.push({
        severity: fin.status,
        title: '金融资产占比 ' + fin.valueText + '，低于央行均值 20.4%',
        desc: '可逐步将部分闲置资金配置为货币基金、债券、指数定投。',
      })
    }
  }

  if (list.length === 0) {
    list.push({
      severity: 'good',
      title: '各项指标处于推荐区间',
      desc: '继续保持，按月更新余额即可观察长期趋势。',
    })
  }

  // 排序：alert > warn > good
  const order = { alert: 0, warn: 1, good: 2, neutral: 3 }
  list.sort((a, b) => order[a.severity] - order[b.severity])
  return list.slice(0, 4)
}

// 历史健康分（不存储、按需重算）
// 健康分是账户余额的纯函数，因此「过去某时点的分」= 用该时点的余额快照重算即可，无需另存一张分数表。
// 口径与 stats.js / attribution.js 一致（CLAUDE.md 不变量 5）：
//   每个账户取 dateMs 之前最近一条 tx 的 balanceAfter 作为当时余额；该时点之前无记录 → 当时尚不存在（按 0 计入，对求和无影响）。
//   逐账户 orderBy desc + limit(1) 取，不能一次性 get 全量（端上单次最多 20 条，会取错快照——V1.6.1 修复的同类坑）。
// 返回与 evaluate() 相同的结构；若该时点之前完全没有任何记录（无可比历史）→ 返回 null，调用方据此隐藏环比，绝不脑补。
async function evaluateAt(accounts, dateMs) {
  if (!accounts || accounts.length === 0) return null
  const since = new Date(dateMs)
  const cmd = cloud.command()

  let anySnapshot = false
  const pseudoAccounts = await Promise.all(accounts.map(async (a) => {
    if (a.includeInChart === false) return a  // evaluate() 内部会跳过，无需查
    let bal = null
    try {
      const res = await cloud.transactions()
        .where({ accountId: a._id, createdAt: cmd.lte(since) })
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get()
      const t = (res.data || [])[0]
      if (t) { bal = t.balanceAfter || 0; anySnapshot = true }
    } catch (err) {
      console.warn('[health] evaluateAt snapshot error', a._id, err)
    }
    return Object.assign({}, a, { balance: bal == null ? 0 : bal })
  }))

  if (!anySnapshot) return null   // 该时点之前无任何记录 → 无可比历史
  return evaluate(pseudoAccounts)
}

module.exports = {
  evaluate,
  evaluateAt,
  PBOC_2019,
  TH,
}
