// 金额：内部统一以「分」存储，UI 层用元展示

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

module.exports = {
  fenToYuan,
  yuanToFen,
  formatYuan,
  formatCNY,
  formatDelta,
}
