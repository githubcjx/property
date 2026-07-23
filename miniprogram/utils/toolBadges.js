// 工具「新功能」红点·单一来源。
//
// 给某个工具打一个「功能版本号」；只要用户没看过（已读 < 当前版本），就在工具入口右上角
// 显示红点，并在首页左下「工具」入口聚合一个红点（有任意未读即亮）。用户点进该工具即标记已读、
// 红点消失；下次这个工具再加新功能时，把它的数字 +1，红点会重新出现。
//
// key 需与 pages/index/index.wxml 里对应 tool-cell 的 data-badge 一致。
// 已读版本持久化在 storage 'tool_badge_seen'（{ key: 已读到的版本号 }）。
const TOOL_BADGES = {
  insights: 1,   // 资产洞察：新增「购买力 / 真实净值」（V1.9）
  inventory: 1,  // 一键盘点：新工具上线（V2.0）
}

module.exports = { TOOL_BADGES }
