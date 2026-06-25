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
const { toCny, rateToCny, convert } = require('./currency.js')

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

// 显示镜头：把内部人民币金额折算到当前本位币（用当前汇率）。base=CNY 时恒等。
// 返回 { fen, ccy }，由调用方用 format.formatMoney 渲染。
function baseCurrency() {
  try {
    const app = getApp()
    return (app && app.globalData && app.globalData.baseCurrency) || 'CNY'
  } catch (e) {
    return 'CNY'
  }
}
function cnyToBaseFen(cnyFen) {
  const base = baseCurrency()
  if (base === 'CNY') return cnyFen
  return convert(cnyFen || 0, 'CNY', base, currentRates())
}

// 写入交易时冻结的人民币快照字段：把当时的原币种 balanceAfter 按当时汇率折成人民币存一份。
// 历史净值重建用它（不随汇率漂移）。CNY 账户 fxRate=1；外币缺汇率时 fxRate=null 表示近似。
function cnySnapshot(balanceAfterFen, ccy) {
  const c = ccy || 'CNY'
  const rates = currentRates()
  return {
    balanceAfterCnyFen: toCny(balanceAfterFen || 0, c, rates),
    fxRate: rateToCny(c, rates),
  }
}

// 读取一条交易的「人民币快照值」用于历史重建：
//   优先用写入时冻结的 balanceAfterCnyFen；老数据/人民币账户没有该字段时回退 balanceAfter
//   （人民币账户 balanceAfter 本身即人民币，等值）。
function snapshotCnyFen(tx) {
  if (!tx) return 0
  if (tx.balanceAfterCnyFen != null) return tx.balanceAfterCnyFen
  return tx.balanceAfter || 0
}

module.exports = {
  currentRates,
  isIncluded,
  valueCnyFen,
  netCnyFen,
  sumNetCnyFen,
  cnySnapshot,
  baseCurrency,
  cnyToBaseFen,
  snapshotCnyFen,
}
