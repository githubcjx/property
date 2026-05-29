// 主题：每套主题 = 一组 CSS 变量覆盖（见 app.wxss 的 .theme-xxx 类）。
// 这里是 JS 侧的单一事实来源：色卡选择器渲染 dots/名称，趋势图(ECharts)按
// 主题强调色给折线着色（canvas 内的颜色无法走 CSS 变量，只能由 JS 注入）。
const DEFAULT_THEME = 'aurora'

const THEMES = [
  {
    key: 'aurora', name: '极光冰蓝',
    dots: ['#a7d3ff', '#c8b5ff', '#08090c'],
    accent: '#a7d3ff', accentRgb: '167,211,255', investment: '#c8b5ff',
  },
  {
    key: 'gilded', name: '鎏金暮光',
    dots: ['#f3dfa3', '#e8b96a', '#0e0b07'],
    accent: '#f3dfa3', accentRgb: '243,223,163', investment: '#e8c98a',
  },
  {
    key: 'neon', name: '霓虹赛博',
    dots: ['#ff6ec7', '#5ee7ff', '#080910'],
    accent: '#5ee7ff', accentRgb: '94,231,255', investment: '#ff6ec7',
  },
  {
    key: 'emerald', name: '林间墨翠',
    dots: ['#6ee7b7', '#a3e635', '#060c09'],
    accent: '#6ee7b7', accentRgb: '110,231,183', investment: '#a3e635',
  },
  {
    key: 'twilight', name: '暮山绛紫',
    dots: ['#c4a3ff', '#ff9ec4', '#0e0a16'],
    accent: '#c4a3ff', accentRgb: '196,163,255', investment: '#ff9ec4',
  },
  {
    key: 'obsidian', name: '曜石单色',
    dots: ['#e8eaed', '#b8bcc4', '#070708'],
    accent: '#e8eaed', accentRgb: '232,234,237', investment: '#b8bcc4',
  },
]

function getTheme(key) {
  return THEMES.find(t => t.key === key) || THEMES[0]
}

module.exports = { THEMES, DEFAULT_THEME, getTheme }
