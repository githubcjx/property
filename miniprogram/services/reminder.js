// 盘点提醒订阅（V2.0）
//
// 数据模型：reminders 集合每人一条（_openid 自动隔离）
//   { _openid, pending, subscribedAt, lastSentAt }
//   pending=true 表示「手上有一次没用掉的订阅额度」，云函数 inventoryRemind
//   每月 1 日扫这个字段决定给谁发，发完置 false。
//
// 用户重复订阅（一个月盘点两次）只会让 pending 保持 true，不会攒成两条提醒 —— 有意为之，
// 微信侧额度可以叠加，但一个月发两条一样的提醒是打扰。

const cloud = require('./cloud.js')
const { TEMPLATE_ID, isConfigured } = require('../utils/reminder.js')

// 当前用户的订阅记录；没有则返回 null
async function getMine() {
  const res = await cloud.reminders().limit(1).get()
  return (res.data || [])[0] || null
}

// 是否已订阅（有未使用的额度）
async function isPending() {
  const doc = await getMine()
  return !!(doc && doc.pending)
}

// 唤起微信订阅授权，同意后记录额度。
// 返回 'ok' | 'reject' | 'unconfigured' | 'fail'
function requestSubscribe() {
  if (!isConfigured()) return Promise.resolve('unconfigured')
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: [TEMPLATE_ID],
      success: async (res) => {
        if (res[TEMPLATE_ID] !== 'accept') {
          resolve('reject')
          return
        }
        try {
          await save()
          resolve('ok')
        } catch (err) {
          console.error('[reminder] 订阅记录写入失败', err)
          resolve('fail')
        }
      },
      fail: (err) => {
        console.warn('[reminder] requestSubscribeMessage 失败', err)
        resolve('fail')
      },
    })
  })
}

// upsert：已有记录就把额度重新置为可用，没有就新建
async function save() {
  const now = cloud.serverDate()
  const doc = await getMine()
  if (doc) {
    await cloud.reminders().doc(doc._id).update({
      data: { pending: true, subscribedAt: now },
    })
    return doc._id
  }
  const res = await cloud.reminders().add({
    data: { pending: true, subscribedAt: now, lastSentAt: null },
  })
  return res._id
}

module.exports = {
  isConfigured,
  getMine,
  isPending,
  requestSubscribe,
}
