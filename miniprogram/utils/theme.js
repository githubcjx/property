// 主题：每套主题 = 一组 CSS 变量覆盖（见 app.wxss 的 .theme-xxx 类）。
// 这里是 JS 侧的单一事实来源：色卡选择器渲染 dots/名称，趋势图(ECharts)按
// 主题强调色给折线着色（canvas 内的颜色无法走 CSS 变量，只能由 JS 注入）。
//
// V3.0「一分钟」：主题从 14 套减到 2 套。
// 删掉的 12 套（人民币纸币 6 + 经典深色 6）都只是换配色，不改变任何一次盘点的体验，
// 却要在 app.wxss、CAT_HEX、分组选择页三处同步维护。留下的两套是【结构型】主题
// ——不只换色，还重塑玻璃/卡片/按钮的质感（见 app.wxss 的 .theme-slate / .theme-brutalist），
// 一深一浅，是两种不同的产品气质，不是两种颜色。要再加主题，先回答它属于哪一种。
//
// 同时删掉的还有「看广告解锁主题」的整套脚手架（THEME_LOCK_ENABLED / isLocked /
// THEME_AD_UNIT_ID / app.unlockTheme）：只剩两套主题时，锁住它们等于锁住全部，
// 这个开关只会是个哪天被误打开的地雷。要做流量主，那时再从头设计一次。
const DEFAULT_THEME = 'slate'

const THEMES = [
  // 晴空软光(软光浮雕)、硬核粗野(浅色纸底)见 app.wxss 的 .theme-slate / .theme-brutalist。
  {
    key: 'slate', name: '晴空软光', desc: '软光浮雕 · 深色',
    dots: ['#6cb8f2', '#79cf8e', '#f0cd6a'],
    accent: '#6cb8f2', accentRgb: '108,184,242', investment: '#79cf8e',
  },
  {
    key: 'brutalist', name: '硬核粗野', desc: '浅色纸底 · 粗野结构', light: true,
    dots: ['#ff5c38', '#3b6fe0', '#efe7d6'],           // 选择页色点：橙红 / 蓝 / 纸底
    accent: '#ffce2e', accentRgb: '255,206,46', investment: '#ff5c38',
    // 信号黄折线在浅纸底上偏浅，趋势图改用 accent-2 蓝（canvas 取不到 CSS 变量）
    chartAccent: '#3b6fe0', chartAccentRgb: '59,111,224',
  },
]

// 取不到时回退默认主题（而不是 THEMES[0]）—— 数组顺序是给选择页看的展示顺序，
// 拿它当兜底会让一个坏掉的 pref_theme 渲染成碰巧排在第一位的那套配色。
function getTheme(key) {
  return THEMES.find(t => t.key === key) || THEMES.find(t => t.key === DEFAULT_THEME) || THEMES[0]
}

// 存量迁移：老用户的 pref_theme 可能是 V3.0 删掉的 12 套之一（如 'yuan100'）。
// 那些 .theme-xxx 类已不在 app.wxss 里，页面会退回基础色板，而 CAT_HEX 找不到该 key
// 又会回落到默认主题的类目色 —— 于是 CSS 与 canvas 各说各话。这里统一收归默认主题。
// 由 app.js onLaunch 调用一次并回写 storage（见 app.js）。
function normalizeTheme(key) {
  return THEMES.some(t => t.key === key) ? key : DEFAULT_THEME
}

// JS 侧类目色(镜像 app.wxss 的 --liquid/--investment/--fixed/--receivable，按主题)。
// canvas 与原生组件(switch)取不到 CSS 变量，只能在此维护；改 wxss 类目色时这里要同步(不变量9)。
// debt 跨主题恒为红(财务负向语义)，不入表，由 DEBT_HEX 兜底。
const CAT_HEX = {
  slate:   { liquid: '#6cb8f2', investment: '#79cf8e', fixed: '#f0cd6a', receivable: '#a7d4f5' },
  brutalist: { liquid: '#3b6fe0', investment: '#ff5c38', fixed: '#f2b90a', receivable: '#5f8f3a' },
}
const DEBT_HEX = '#ffb3b3'         // 与 app.wxss --debt 一致；财务负向跨主题恒红
const DEBT_HEX_LIGHT = '#e5382b'   // 浅色主题的 --debt(见 .theme-brutalist)；浅底上浅红不可读

// 浅色主题集合(由 THEMES 的 light 标记派生)：page 底/导航栏/回弹区等系统级颜色
// 写死为深色，浅色主题需在 JS 侧动态切换(app.applyThemeChrome)。
const LIGHT_THEMES = THEMES.filter(t => t.light).map(t => t.key)
function isLight(key) { return LIGHT_THEMES.indexOf(key) >= 0 }

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '')
  const s = h.length === 3 ? h.replace(/(.)/g, '$1$1') : h
  const n = parseInt(s, 16)
  return ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255)
}

// 按当前主题取类目色。colorClass ∈ liquid|investment|fixed|receivable|debt。
function catHex(themeKey, colorClass) {
  if (colorClass === 'debt') return isLight(themeKey) ? DEBT_HEX_LIGHT : DEBT_HEX
  const m = CAT_HEX[themeKey] || CAT_HEX[DEFAULT_THEME]
  return m[colorClass] || getTheme(themeKey).accent
}
function catRgb(themeKey, colorClass) {
  return hexToRgb(catHex(themeKey, colorClass))
}

module.exports = {
  THEMES, DEFAULT_THEME, getTheme, normalizeTheme,
  catHex, catRgb, hexToRgb, isLight,
}
