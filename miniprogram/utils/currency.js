// 货币与汇率换算 —— 多货币功能的单一事实来源（类比 categories.js / theme.js）。
//
// 模型（见 CLAUDE.md 与对话纪要）：
//   · 账户余额以「原币种的最小单位整数」存储（沿用"金额=整数分"铁律，只是分的含义随币种）。
//   · 锚定货币 = 人民币(CNY)，永久不变：所有内部净值计算都先折算到 CNY。
//   · 本位币只是「显示镜头」，CNY → 显示货币的换算在 UI 边界做，不在这里。
//   · 汇率表 rates 形如 { USD: 7.18, HKD: 0.915, ... }，含义为「1 外币 = X 人民币」。
//
// 本模块是纯函数（不读 globalData、不查 DB），便于复用与测试；
// 取实时汇率并注入的活计交给 services/fxRate.js（P2）与 utils/networth.js。

// minorDigits：最小单位的小数位。CNY/USD 等为 2（分），JPY/KRW 等为 0（无小数）。
const CURRENCIES = [
  { code: 'CNY', symbol: '¥',   name: '人民币',   minorDigits: 2 },
  { code: 'USD', symbol: '$',   name: '美元',     minorDigits: 2 },
  { code: 'HKD', symbol: 'HK$', name: '港币',     minorDigits: 2 },
  { code: 'EUR', symbol: '€',   name: '欧元',     minorDigits: 2 },
  { code: 'GBP', symbol: '£',   name: '英镑',     minorDigits: 2 },
  { code: 'JPY', symbol: '¥',   name: '日元',     minorDigits: 0 },
  { code: 'AUD', symbol: 'A$',  name: '澳元',     minorDigits: 2 },
  { code: 'CAD', symbol: 'C$',  name: '加元',     minorDigits: 2 },
  { code: 'SGD', symbol: 'S$',  name: '新加坡元', minorDigits: 2 },
  { code: 'CHF', symbol: 'CHF', name: '瑞士法郎', minorDigits: 2 },
  { code: 'KRW', symbol: '₩',   name: '韩元',     minorDigits: 0 },
  { code: 'TWD', symbol: 'NT$', name: '新台币',   minorDigits: 2 },
  { code: 'THB', symbol: '฿',   name: '泰铢',     minorDigits: 2 },
  { code: 'MYR', symbol: 'RM',  name: '马来西亚林吉特', minorDigits: 2 },
]

const ANCHOR = 'CNY'
const DEFAULT_BASE = 'CNY'

const _byCode = CURRENCIES.reduce((m, c) => { m[c.code] = c; return m }, {})

// 未知币种兜底：当作 2 位小数、符号即代码（不抛错，避免脏数据炸页面）。
function getCurrency(code) {
  return _byCode[code] || { code: code || ANCHOR, symbol: code || '¥', name: code || '', minorDigits: 2 }
}

function symbolOf(code) { return getCurrency(code).symbol }
function digitsOf(code) { return getCurrency(code).minorDigits }

// 最小单位倍数：2 位 → 100，0 位 → 1。
function minorUnit(code) { return Math.pow(10, digitsOf(code)) }

// 「1 该币种 = ? 人民币」。CNY 恒为 1；其余查 rates；查不到返回 null。
function rateToCny(code, rates) {
  if (code === ANCHOR) return 1
  if (rates && typeof rates[code] === 'number') return rates[code]
  return null
}

// 把 from 币种的最小单位整数，换算成 to 币种的最小单位整数。
//   · from === to：恒等返回（无需汇率）——这覆盖了"全员人民币"的绝大多数情况。
//   · 缺汇率：告警并按原值返回（不静默乱算）；正常流程应保证有非同币种账户时汇率已就绪。
// 路径：from分 → from元 → 人民币元 → to元 → to分，最后四舍五入回整数最小单位。
function convert(fen, from, to, rates) {
  const n = Math.round(fen || 0)
  if (n === 0) return 0
  if (from === to) return n
  const rFrom = rateToCny(from, rates)
  const rTo = rateToCny(to, rates)
  if (rFrom == null || rTo == null) {
    console.warn('[currency] 缺少汇率，无法换算，按原值返回：', from, '→', to)
    return n
  }
  const cnyMajor = (n / minorUnit(from)) * rFrom
  const toMajor = cnyMajor / rTo
  return Math.round(toMajor * minorUnit(to))
}

// 便捷：原币种 → 人民币（锚定币）。内部净值计算统一走它。
function toCny(fen, from, rates) { return convert(fen, from, ANCHOR, rates) }

module.exports = {
  CURRENCIES,
  ANCHOR,
  DEFAULT_BASE,
  getCurrency,
  symbolOf,
  digitsOf,
  minorUnit,
  rateToCny,
  convert,
  toCny,
}
