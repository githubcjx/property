// 资产配置分析 · 基于当前账户余额（live balance）做静态构成拆解
//
// 口径与全局一致（见 CLAUDE.md 不变量 4）：仅 includeInChart !== false 的账户计入；
// 负债大类（isDebtCategory）取负，不进入资产环图，单列为负债。
// 本模块只「陈述构成事实」——不打分、不下结论、不引入任何外部基准数据。
//
// 单位：全程「分」。文案/遮蔽交由页面用 utils/format.js 在 UI 边界处理。

const { CATEGORIES, isDebtCategory } = require('../utils/categories.js')
const { valueCnyFen } = require('../utils/networth.js')

// 资产大类展示顺序（负债单列，不在此列）
const ASSET_ORDER = ['liquid', 'investment', 'fixed', 'receivable']

// 同步：纯由 accounts 计算，不查 DB
function evaluate(accounts) {
  const included = (accounts || []).filter(a => a.includeInChart !== false)
  if (included.length === 0) {
    return { hasData: false }
  }

  // 分大类汇总（分）
  const sumByCat = {}
  let assets = 0
  let debt = 0
  let topAccount = null // 最大单一资产账户
  let topBal = 0        // 其折算到人民币后的金额（用于跨币种比较）
  for (const a of included) {
    const bal = valueCnyFen(a)   // 原币种折算到人民币
    const cid = a.categoryId
    sumByCat[cid] = (sumByCat[cid] || 0) + bal
    if (isDebtCategory(cid)) {
      debt += bal
    } else {
      assets += bal
      if (bal > 0 && (!topAccount || bal > topBal)) {
        topAccount = a
        topBal = bal
      }
    }
  }
  const netWorth = assets - debt

  // 资产大类构成（仅正向资产，用于环图 / 图例），按金额降序
  const assetCategories = []
  for (const cid of ASSET_ORDER) {
    const amt = sumByCat[cid] || 0
    if (amt <= 0) continue
    const cat = CATEGORIES.find(c => c.id === cid)
    assetCategories.push({
      id: cid,
      name: cat ? cat.name : cid,
      colorClass: cid,
      amount: amt,
      pct: assets > 0 ? (amt / assets) * 100 : 0,
    })
  }
  assetCategories.sort((a, b) => b.amount - a.amount)

  // 环图 conic-gradient：用 CSS 变量 var(--liquid) 等，跟随主题变色（不硬编码 hex）
  let cursor = 0
  const segs = []
  for (const c of assetCategories) {
    const start = cursor
    cursor += c.pct
    segs.push('var(--' + c.colorClass + ') ' + start.toFixed(2) + '% ' + cursor.toFixed(2) + '%')
  }
  const conicGradient = segs.length ? 'conic-gradient(' + segs.join(', ') + ')' : ''

  // 关键比率（占总资产）—— 中性陈述，不评判
  const ratios = []
  const pushRatio = (key, name, num, desc, isDebtRatio) => {
    if (assets <= 0) return
    ratios.push({ key, name, pct: (num / assets) * 100, desc, isDebt: !!isDebtRatio })
  }
  pushRatio('liquidity', '流动性占比', sumByCat.liquid || 0, '流动资金 / 总资产')
  pushRatio('invest', '投资占比', sumByCat.investment || 0, '投资 / 总资产')
  pushRatio('fixed', '固定资产占比', sumByCat.fixed || 0, '固定资产 / 总资产')
  pushRatio('debt', '负债率', debt, '总负债 / 总资产', true)

  // 集中度：最大单一资产占总资产比
  let concentration = null
  if (topAccount && assets > 0) {
    concentration = {
      name: topAccount.name,
      colorClass: topAccount.categoryId,
      icon: topAccount.icon || 'folder',
      amount: topBal,
      pct: (topBal / assets) * 100,
    }
  }

  return {
    hasData: true,
    totals: { assets, debt, netWorth },
    assetCategories,
    conicGradient,
    ratios,
    concentration,
    accountCount: included.length,
  }
}

module.exports = {
  evaluate,
  ASSET_ORDER,
}
