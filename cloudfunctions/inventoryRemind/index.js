// 盘点提醒下发（净值本 · 一键盘点）
//
// 触发：定时触发器，每月 1 日 09:00 北京时间（cron 见 config.json，UTC = 北京 −8h，故配 1 点）。
// 工作流：
//   1. 扫 reminders 集合里 pending=true 的用户（= 手上有一次没用掉的订阅额度）
//   2. 逐个调 subscribeMessage.send 下发「该盘点了」提醒，落地页是盘点页
//   3. 无论成功与否都把 pending 置 false —— 微信「一次性订阅」额度调用即消耗，
//      留着 true 下个月只会重复失败；用户下次盘点完会重新订阅。
//   4. 结果写入 remindLogs 集合便于排查
//
// 前置条件（缺一不可，否则本函数只会记录 skipped）：
//   · 微信公众平台 → 订阅消息 → 选用一个「记账/账单提醒」类公共模板，拿到模板 ID
//   · 把该 ID 同时填进本文件的 TEMPLATE_ID 与小程序端 utils/reminder.js 的 TEMPLATE_ID
//   · 按所选模板的实际字段名改写下面的 buildData()（字段对不上微信报 47003）
//
// 也可在云开发控制台「测试运行」立即跑一次。

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ⚠️ 与 miniprogram/utils/reminder.js 的 TEMPLATE_ID 保持一致
const TEMPLATE_ID = ''

// 点开提醒后的落地页
const LANDING_PAGE = 'pages/inventory/inventory'

// 单次执行最多发多少条，避免异常情况下把额度打满
const MAX_PER_RUN = 500

// 模板字段：不同模板字段名不同（thing1 / time2 / phrase3 …），
// 选定模板后照抄「详情」里的字段名改这里。value 有长度限制（thing 类 ≤ 20 字符）。
function buildData(nowMs) {
  const d = new Date(nowMs + 8 * 3600 * 1000)   // 云函数跑在 UTC，+8h 得北京时间
  const monthText = (d.getUTCMonth() + 1) + ' 月'
  return {
    thing1: { value: '该盘点了' },
    thing2: { value: '花几分钟核对各账户余额' },
    time3: { value: d.getUTCFullYear() + ' 年 ' + monthText },
  }
}

function isConfigured() {
  return typeof TEMPLATE_ID === 'string' && TEMPLATE_ID.length >= 20
}

exports.main = async () => {
  const startedAt = Date.now()

  if (!isConfigured()) {
    // 没配模板就安静跳过，不写日志噪音，也不报错触发告警
    return { ok: false, skipped: 'TEMPLATE_ID 未配置' }
  }

  const col = db.collection('reminders')

  // 云函数侧单次最多取 1000 条，这里按 100 翻页
  const targets = []
  const PAGE = 100
  for (let skip = 0; skip < MAX_PER_RUN; skip += PAGE) {
    const res = await col.where({ pending: true }).skip(skip).limit(PAGE).get()
    const batch = res.data || []
    targets.push(...batch)
    if (batch.length < PAGE) break
  }

  if (targets.length === 0) {
    return { ok: true, total: 0, sent: 0, failed: 0 }
  }

  const data = buildData(startedAt)
  let sent = 0
  let failed = 0
  const errors = []

  for (const t of targets) {
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: t._openid,
        templateId: TEMPLATE_ID,
        page: LANDING_PAGE,
        data,
      })
      sent++
    } catch (err) {
      failed++
      // 只留前 20 条错误，避免日志文档过大
      if (errors.length < 20) {
        errors.push({ errCode: err.errCode, errMsg: String(err.errMsg || err).slice(0, 200) })
      }
    }
    // 成功与否都消耗额度，统一清掉
    await col.doc(t._id).update({
      data: { pending: false, lastSentAt: db.serverDate() },
    }).catch(() => {})
  }

  await db.collection('remindLogs').add({
    data: {
      runAt: db.serverDate(),
      total: targets.length,
      sent,
      failed,
      errors,
      costMs: Date.now() - startedAt,
    },
  }).catch(() => {})

  return { ok: true, total: targets.length, sent, failed }
}
