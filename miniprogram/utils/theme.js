// 主题：每套主题 = 一组 CSS 变量覆盖（见 app.wxss 的 .theme-xxx 类）。
// 这里是 JS 侧的单一事实来源：色卡选择器渲染 dots/名称，趋势图(ECharts)按
// 主题强调色给折线着色（canvas 内的颜色无法走 CSS 变量，只能由 JS 注入）。
// 默认主题：晴空软光(slate)。它是结构型主题(软光浮雕)，不只是配色，见 app.wxss。
// 注意 slate 仍带 locked:true —— 但默认主题天然会被 app.js onLaunch 的「既往不咎」
// 逻辑解锁(新用户一进来当前主题就是它)，所以即便日后打开 THEME_LOCK_ENABLED，
// 它实际上也不会被收费。要真收费得先换个默认主题。
const DEFAULT_THEME = 'slate'

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
  // —— 解锁质感系列（结构型主题，需看一段激励视频解锁；locked:true）——
  // 晴空软光(软光浮雕)、硬核粗野(浅色纸底)见 app.wxss 的 .theme-slate / .theme-brutalist。
  {
    key: 'slate', name: '晴空软光', series: 'premium', locked: true,
    dots: ['#6cb8f2', '#79cf8e', '#f0cd6a'],
    accent: '#6cb8f2', accentRgb: '108,184,242', investment: '#79cf8e',
  },
  {
    key: 'brutalist', name: '硬核粗野', series: 'premium', locked: true, light: true,
    dots: ['#ff5c38', '#3b6fe0', '#efe7d6'],           // 选择页色点：橙红 / 蓝 / 纸底
    accent: '#ffce2e', accentRgb: '255,206,46', investment: '#ff5c38',
    // 信号黄折线在浅纸底上偏浅，趋势图改用 accent-2 蓝（canvas 取不到 CSS 变量）
    chartAccent: '#3b6fe0', chartAccentRgb: '59,111,224',
  },
]

// 系列分组（用于主题选择页分段标题与说明）。顺序即展示顺序：
// 质感臻选打头（默认主题「晴空软光」在这一组，开屏所见即列表第一块），
// 人民币纸币放最后 —— 它有 6 套，摆在最前会把另外两组挤到首屏之外。
const THEME_SERIES = [
  { key: 'premium', name: '质感臻选系列', desc: '软光浮雕 + 浅色粗野 · 两种独特结构质感' },
  { key: 'classic', name: '经典深色系列', desc: '深色玻璃质感原生配色' },
  { key: 'banknote', name: '人民币纸币配色系列', desc: '取自一版纸币标准色，按面值 1 / 5 / 10 / 20 / 50 / 100 排序' },
]

// 派生：[{ ...series, themes: [...] }]，已过滤掉无主题的空系列。
const THEME_GROUPS = THEME_SERIES
  .map(s => ({ ...s, themes: THEMES.filter(t => t.series === s.key) }))
  .filter(g => g.themes.length)

// 取不到时回退默认主题（而不是 THEMES[0]）—— 数组顺序是给选择页看的展示顺序，
// 拿它当兜底会让一个坏掉的 pref_theme 渲染成碰巧排在第一位的那套配色。
function getTheme(key) {
  return THEMES.find(t => t.key === key) || THEMES.find(t => t.key === DEFAULT_THEME) || THEMES[0]
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
  brutalist: { liquid: '#3b6fe0', investment: '#ff5c38', fixed: '#f2b90a', receivable: '#5f8f3a' },
}
const DEBT_HEX = '#ffb3b3'         // 与 app.wxss --debt 一致；财务负向跨主题恒红
const DEBT_HEX_LIGHT = '#e5382b'   // 浅色主题的 --debt(见 .theme-brutalist)；浅底上浅红不可读

// 浅色主题集合(由 THEMES 的 light 标记派生)：page 底/导航栏/回弹区等系统级颜色
// 写死为深色，浅色主题需在 JS 侧动态切换(app.applyThemeChrome)。
const LIGHT_THEMES = THEMES.filter(t => t.light).map(t => t.key)
function isLight(key) { return LIGHT_THEMES.indexOf(key) >= 0 }

// 广告解锁总开关：UV 未达微信「流量主」开通门槛前先关闭 —— 此时 premium 系列
// (晴空软光/硬核粗野)全部免费开放、色卡不显示解锁角标、点选直接应用。
// 达标并把 THEME_AD_UNIT_ID 填成真实广告位后，改成 true 即启用「看广告解锁」。
const THEME_LOCK_ENABLED = false

// 需解锁的主题(locked:true 且总开关开启)：切换前要看一段激励视频。解锁状态由 app 侧
// 持久化(app.isThemeUnlocked / app.unlockTheme)，本函数只判断该主题「当前是否需要解锁」。
function isLocked(key) {
  if (!THEME_LOCK_ENABLED) return false
  const t = getTheme(key); return !!(t && t.locked)
}

// 激励视频广告位 ID —— 从微信公众平台「流量主」后台申请(形如 adunit-xxxxxxxx)，填这里即可。
// 未配置(仍为占位值)时，主题页走「模拟解锁」便于开发预览；填真实 ID 后自动走真实广告。
const THEME_AD_UNIT_ID = 'adunit-0000000000000000'
function isAdConfigured() {
  return /^adunit-[0-9a-z]+$/i.test(THEME_AD_UNIT_ID) && THEME_AD_UNIT_ID !== 'adunit-0000000000000000'
}

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
  THEMES, THEME_SERIES, THEME_GROUPS, DEFAULT_THEME, getTheme,
  catHex, catRgb, hexToRgb, isLight, isLocked, THEME_LOCK_ENABLED, THEME_AD_UNIT_ID, isAdConfigured,
}
