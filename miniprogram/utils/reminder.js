// 盘点提醒 · 订阅消息配置（单一来源）
//
// 微信「一次性订阅消息」：用户每同意一次，服务端就获得一次发送额度，用完即止。
// 所以每次盘点完成后都要重新引导订阅，形成「盘点 → 订阅 → 下月提醒 → 再盘点」的月度循环。
//
// 模板 ID 从微信公众平台申请：小程序后台 → 订阅消息 → 公共模板库 → 选一个
// 「记账/账单提醒」类模板 → 我的模板里拿到 tmpl id（形如 abcDEF...，25+ 位）。
// 填进 TEMPLATE_ID 即自动启用；未配置时完成页显示「即将上线」且不调订阅接口
// （同款「未配置就整条链路 no-op」的写法，另一处在 cloudfunctions/inventoryRemind）。
//
// ⚠️ 选定模板后，模板的字段名（thing19 / time16 …）必须与云函数 inventoryRemind
//    里 buildData() 的键一一对应 —— 连 thing/time 前缀都要照抄，否则微信报 47003。

const TEMPLATE_ID = 'ER_yTytW0B13nJQfeULlPy0EA85jYS2Z2IKw1fRV3H8'

function isConfigured() {
  return typeof TEMPLATE_ID === 'string' && TEMPLATE_ID.length >= 20
}

module.exports = {
  TEMPLATE_ID,
  isConfigured,
}
