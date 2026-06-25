// 金额：内部统一以「分」存储，UI 层用元展示
const { getCurrency, symbolOf, minorUnit } = require('./currency.js')

function fenToYuan(fen) {
  if (fen === null || fen === undefined || isNaN(fen)) return 0
  return Math.round(fen) / 100
}

function yuanToFen(yuan) {
  if (yuan === null || yuan === undefined || yuan === '') return 0
  const n = Number(yuan)
  if (isNaN(n)) return 0
  return Math.round(n * 100)
}

// 千分位整数，例：1234567 → "12,346"（输入为分，四舍五入到元）
function formatYuan(fen, opts) {
  const { sign = false, hide = false } = opts || {}
  if (hide) return '****'
  const n = fenToYuan(fen)
  const abs = Math.abs(n)
  const intPart = Math.round(abs).toString()
  const withComma = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  let str = withComma
  if (n < 0) {
    str = '-' + str
  } else if (sign && n > 0) {
    str = '+' + str
  }
  return str
}

// 带 ¥ 符号
function formatCNY(fen, opts) {
  const { hide = false, sign = false } = opts || {}
  if (hide) return '¥****'
  const n = fenToYuan(fen)
  const formatted = formatYuan(Math.abs(fen), {})
  if (n < 0) return '-¥' + formatted
  if (sign && n > 0) return '+¥' + formatted
  return '¥' + formatted
}

// 变动金额（带正负号 + 颜色 class）
function formatDelta(fen, hide) {
  if (hide) {
    return { text: '****', cls: '' }
  }
  if (fen > 0) return { text: '+¥' + formatYuan(fen, {}), cls: 'amount-pos' }
  if (fen < 0) return { text: '-¥' + formatYuan(Math.abs(fen), {}), cls: 'amount-neg' }
  return { text: '¥0', cls: '' }
}

// ===== 多货币：币种感知的换算与格式化 =====
// 旧的 fenToYuan/yuanToFen/formatYuan/formatCNY 等价于本组函数取 ccy='CNY'，
// 保留它们不动以兼容现有调用；新代码（含外币）走下面这组。

// 最小单位整数 → 主单位数值（按币种小数位，替代写死的 /100）。
function fenToUnit(fen, ccy) {
  if (fen === null || fen === undefined || isNaN(fen)) return 0
  return Math.round(fen) / minorUnit(ccy)
}

// 主单位数值 → 最小单位整数。
function unitToFen(unit, ccy) {
  if (unit === null || unit === undefined || unit === '') return 0
  const n = Number(unit)
  if (isNaN(n)) return 0
  return Math.round(n * minorUnit(ccy))
}

// 千分位格式化（按币种小数位）。opts: { sign, hide, symbol }
//   symbol 为 true 时前置该币种符号（如 $ / HK$ / ¥）。
function formatMoney(fen, ccy, opts) {
  const { sign = false, hide = false, symbol = false } = opts || {}
  const sym = symbol ? symbolOf(ccy) : ''
  if (hide) return sym + '****'
  const digits = getCurrency(ccy).minorDigits
  const n = fenToUnit(fen, ccy)
  const abs = Math.abs(n)
  const fixed = abs.toFixed(digits)        // 含按币种的小数位
  const parts = fixed.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const num = parts.join('.')
  let prefix = ''
  if (n < 0) prefix = '-'
  else if (sign && n > 0) prefix = '+'
  return prefix + sym + num
}

module.exports = {
  fenToYuan,
  yuanToFen,
  formatYuan,
  formatCNY,
  formatDelta,
  fenToUnit,
  unitToFen,
  formatMoney,
}
