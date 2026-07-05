// 全局版本号·单一来源。
// 小程序内所有展示版本号的地方（首页/设置/关于/更新日志）都从这里取，
// 发布新版本时只改这一处；同时记得在 pages/changelog/changelog.js 的
// releases 数组里追加对应的更新条目（约定见 CLAUDE.md）。
const APP_VERSION = 'V1.10'

module.exports = {
  APP_VERSION,
}
