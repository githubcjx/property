// 净值计算的统一口径（CLAUDE.md 不变量 4：净值规则散落多处，必须保持一致）。
//
// 这里把那条规则收口成一处：
//   · 仅 includeInChart !== false 的账户计入；
//   · 负债大类（isDebtCategory）取负，其余为正；
//   · 多货币：账户余额按「原币种 → 人民币(锚定币)」折算后再参与计算。
// 内部一律以人民币计算；显示成本位币是 UI 边界的事（见 currency.js 说明）。
//
// 汇率来源：读 getApp().globalData.fxRates（P2 由 services/fxRate.js 填充；
// 未就绪时为 null，此时全员人民币 → 折算恒等，行为与改造前完全一致）。

const { isDebtCategory } = require('./categories.js')
const { toCny } = require('./currency.js')

function currentRates() {
  try {
    const app = getApp()
    return (app && app.globalData && app.globalData.fxRates) || null
  } catch (e) {
    return null
  }
}

// 账户是否计入净值/图表
function isIncluded(acc) {
  return !!acc && acc.includeInChart !== false
}

// 账户余额（人民币分，正值），已按原币种折算到锚定币。不含正负号。
function valueCnyFen(acc, rates) {
  if (!acc) return 0
  return toCny(acc.balance || 0, acc.currency || 'CNY', rates || currentRates())
}

// 账户对净值的带符号贡献（人民币分）：资产为正、负债为负。
function netCnyFen(acc, rates) {
  const v = valueCnyFen(acc, rates || currentRates())
  return isDebtCategory(acc.categoryId) ? -v : v
}

// 一组账户的净资产（人民币分）：过滤 includeInChart + 折算 + 资产减负债。
function sumNetCnyFen(accounts) {
  const rates = currentRates()
  let net = 0
  for (const a of accounts || []) {
    if (!isIncluded(a)) continue
    net += netCnyFen(a, rates)
  }
  return net
}

module.exports = {
  currentRates,
  isIncluded,
  valueCnyFen,
  netCnyFen,
  sumNetCnyFen,
}
