// 主题：每套主题 = 一组 CSS 变量覆盖（见 app.wxss 的 .theme-xxx 类）。
// 这里是 JS 侧的单一事实来源：色卡选择器渲染 dots/名称，趋势图(ECharts)按
// 主题强调色给折线着色（canvas 内的颜色无法走 CSS 变量，只能由 JS 注入）。
const DEFAULT_THEME = 'aurora'

const THEMES = [
  // —— 人民币纸币色卡系列（按面值 1/5/10/20/50/100 排序）——
  {
    key: 'yuan1', name: '不焦绿', series: 'banknote',
    dots: ['#8fb96b', '#c9c88a', '#070d09'],
    accent: '#8fb96b', accentRgb: '143,185,107', investment: '#c9c88a',
  },
  {
    key: 'yuan5', name: '绝绝紫', series: 'banknote',
    dots: ['#c4a0db', '#f2c79b', '#0e0a16'],
    accent: '#c4a0db', accentRgb: '196,160,219', investment: '#f2c79b',
  },
  {
    key: 'yuan10', name: '不摆蓝', series: 'banknote',
    dots: ['#6fa6c4', '#f0c9ae', '#070d12'],
    accent: '#6fa6c4', accentRgb: '111,166,196', investment: '#f0c9ae',
  },
  {
    key: 'yuan20', name: '糖太棕', series: 'banknote',
    dots: ['#d9a86a', '#e8b98c', '#0e0a05'],
    accent: '#d9a86a', accentRgb: '217,168,106', investment: '#e8b98c',
  },
  {
    key: 'yuan50', name: '放青松', series: 'banknote',
    dots: ['#74c495', '#9fd9b8', '#070f0b'],
    accent: '#74c495', accentRgb: '116,196,149', investment: '#9fd9b8',
  },
  {
    key: 'yuan100', name: '发财红', series: 'banknote',
    dots: ['#f06a86', '#f2a07a', '#100609'],
    accent: '#f06a86', accentRgb: '240,106,134', investment: '#f2a07a',
  },
  // —— 经典深色系列 ——
  {
    key: 'aurora', name: '极光冰蓝', series: 'classic',
    dots: ['#a7d3ff', '#c8b5ff', '#08090c'],
    accent: '#a7d3ff', accentRgb: '167,211,255', investment: '#c8b5ff',
  },
  {
    key: 'gilded', name: '鎏金暮光', series: 'classic',
    dots: ['#f3dfa3', '#e8b96a', '#0e0b07'],
    accent: '#f3dfa3', accentRgb: '243,223,163', investment: '#e8c98a',
  },
  {
    key: 'neon', name: '霓虹赛博', series: 'classic',
    dots: ['#ff6ec7', '#5ee7ff', '#080910'],
    accent: '#5ee7ff', accentRgb: '94,231,255', investment: '#ff6ec7',
  },
  {
    key: 'emerald', name: '林间墨翠', series: 'classic',
    dots: ['#6ee7b7', '#a3e635', '#060c09'],
    accent: '#6ee7b7', accentRgb: '110,231,183', investment: '#a3e635',
  },
  {
    key: 'twilight', name: '暮山绛紫', series: 'classic',
    dots: ['#c4a3ff', '#ff9ec4', '#0e0a16'],
    accent: '#c4a3ff', accentRgb: '196,163,255', investment: '#ff9ec4',
  },
  {
    key: 'obsidian', name: '曜石单色', series: 'classic',
    dots: ['#e8eaed', '#b8bcc4', '#070708'],
    accent: '#e8eaed', accentRgb: '232,234,237', investment: '#b8bcc4',
  },
  // —— 软光质感系列（新拟态软浮雕）——
  {
    key: 'slate', name: '晴空软光', series: 'tactile',
    dots: ['#6cb8f2', '#79cf8e', '#f0cd6a'],
    accent: '#6cb8f2', accentRgb: '108,184,242', investment: '#79cf8e',
  },
]

// 系列分组（用于主题选择页分段标题与说明）。顺序即展示顺序。
const THEME_SERIES = [
  { key: 'banknote', name: '人民币纸币配色系列', desc: '取自一版纸币标准色，按面值 1 / 5 / 10 / 20 / 50 / 100 排序' },
  { key: 'classic', name: '经典深色系列', desc: '深色玻璃质感原生配色' },
  { key: 'tactile', name: '软光质感系列', desc: '新拟态软浮雕 · 去玻璃反光、哑光有质感' },
]

// 派生：[{ ...series, themes: [...] }]，已过滤掉无主题的空系列。
const THEME_GROUPS = THEME_SERIES
  .map(s => ({ ...s, themes: THEMES.filter(t => t.series === s.key) }))
  .filter(g => g.themes.length)

function getTheme(key) {
  return THEMES.find(t => t.key === key) || THEMES[0]
}

// JS 侧类目色(镜像 app.wxss 的 --liquid/--investment/--fixed/--receivable，按主题)。
// canvas 与原生组件(switch)取不到 CSS 变量，只能在此维护；改 wxss 类目色时这里要同步(不变量9)。
// debt 跨主题恒为红(财务负向语义)，不入表，由 DEBT_HEX 兜底。
const CAT_HEX = {
  yuan1:   { liquid: '#8fb96b', investment: '#c9c88a', fixed: '#b6d88f', receivable: '#e2eccb' },
  yuan5:   { liquid: '#c4a0db', investment: '#f2c79b', fixed: '#a9d1d9', receivable: '#efe3f6' },
  yuan10:  { liquid: '#6fa6c4', investment: '#f0c9ae', fixed: '#9bb89a', receivable: '#ddc7dc' },
  yuan20:  { liquid: '#d9a86a', investment: '#e8b98c', fixed: '#9acaae', receivable: '#edcdb6' },
  yuan50:  { liquid: '#74c495', investment: '#9fd9b8', fixed: '#d2c8ac', receivable: '#cebbd8' },
  yuan100: { liquid: '#f06a86', investment: '#f2a07a', fixed: '#d8cca0', receivable: '#e8b6d6' },
  aurora:  { liquid: '#a7d3ff', investment: '#c8b5ff', fixed: '#b7e8f0', receivable: '#e0eaff' },
  gilded:  { liquid: '#f3dfa3', investment: '#e8c98a', fixed: '#d9b38c', receivable: '#f7ecd2' },
  neon:    { liquid: '#5ee7ff', investment: '#ff6ec7', fixed: '#a78bfa', receivable: '#c9f7ff' },
  emerald: { liquid: '#6ee7b7', investment: '#a3e635', fixed: '#5eead4', receivable: '#ecfccb' },
  twilight:{ liquid: '#c4a3ff', investment: '#ff9ec4', fixed: '#a3c4ff', receivable: '#f0e6ff' },
  obsidian:{ liquid: '#e8eaed', investment: '#b8bcc4', fixed: '#9aa0aa', receivable: '#f5f6f8' },
  slate:   { liquid: '#6cb8f2', investment: '#79cf8e', fixed: '#f0cd6a', receivable: '#a7d4f5' },
}
const DEBT_HEX = '#ffb3b3'   // 与 app.wxss --debt 一致；财务负向跨主题恒红

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '')
  const s = h.length === 3 ? h.replace(/(.)/g, '$1$1') : h
  const n = parseInt(s, 16)
  return ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255)
}

// 按当前主题取类目色。colorClass ∈ liquid|investment|fixed|receivable|debt。
function catHex(themeKey, colorClass) {
  if (colorClass === 'debt') return DEBT_HEX
  const m = CAT_HEX[themeKey] || CAT_HEX[DEFAULT_THEME]
  return m[colorClass] || getTheme(themeKey).accent
}
function catRgb(themeKey, colorClass) {
  return hexToRgb(catHex(themeKey, colorClass))
}

module.exports = { THEMES, THEME_SERIES, THEME_GROUPS, DEFAULT_THEME, getTheme, catHex, catRgb, hexToRgb }
