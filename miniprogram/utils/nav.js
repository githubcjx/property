// 返回上一页 —— 但要能应付「二级页就是启动页」的情况。
//
// 订阅消息落地（inventoryRemind 的 page = pages/inventory/inventory）、分享卡片、
// 小程序码都会让用户直接落在二级页上，此时页面栈只有一层，wx.navigateBack() 会
// 静默失败：用户点了左上角却毫无反应，只能关掉小程序。这种情况下重定向回首页。
//
// 二级页的返回按钮一律走这里，不要直接调 wx.navigateBack()。
const HOME = '/pages/index/index'

function goBack() {
  if (getCurrentPages().length > 1) {
    // fail 兜底：极端情况下栈长度与实际可回退性不一致
    wx.navigateBack({ fail: () => wx.reLaunch({ url: HOME }) })
    return
  }
  wx.reLaunch({ url: HOME })
}

module.exports = { goBack }
