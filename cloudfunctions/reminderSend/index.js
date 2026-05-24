// 每月一次群发记账提醒（订阅号）
//
// 触发：定时触发器（每月 25 日 21:00 北京时间，cron 见 config.json）
// 工作流：
//   1. 取 access_token（带本地缓存，避免每次都请求微信）
//   2. 调 /cgi-bin/message/mass/sendall 群发文本消息给所有关注者
//   3. 把执行结果写入 cloud DB 的 reminderLogs 集合，方便排查

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 直接走 wx-server-sdk 自带的 https 请求工具
const https = require('https')

// 公众号凭证（部署时通过云函数「环境变量」配置，不要硬编码在代码里）
const APPID  = process.env.MP_APPID  || ''
const SECRET = process.env.MP_APPSECRET || ''

// 提醒文案（你可以改成更自然的语气）
const REMIND_TEXT = '【净值本】这个月怎么样？花一分钟更新一下账户余额，看看 30 天里悄悄变了多少 ✨'

// ========== access_token 缓存 ==========
// 微信限制：每天 access_token 调用次数有限，必须缓存
// 这里走 DB 缓存（一个 wx_meta 集合的单条文档）
async function getAccessToken() {
  if (!APPID || !SECRET) throw new Error('请在云函数环境变量里配置 MP_APPID 与 MP_APPSECRET')

  const col = db.collection('wx_meta')
  const cached = await col.doc('mp_access_token').get().catch(() => null)
  const now = Date.now()
  if (cached && cached.data && cached.data.expireAt > now + 60 * 1000) {
    return cached.data.token
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${SECRET}`
  const data = await httpGetJson(url)
  if (!data.access_token) throw new Error('获取 access_token 失败: ' + JSON.stringify(data))

  await col.doc('mp_access_token').set({
    data: {
      token: data.access_token,
      expireAt: now + (data.expires_in - 200) * 1000,  // 提前 200s 续期
    },
  })
  return data.access_token
}

// ========== 群发文本消息 ==========
async function massSendText(text) {
  const token = await getAccessToken()
  const url = `https://api.weixin.qq.com/cgi-bin/message/mass/sendall?access_token=${token}`
  const body = {
    filter: { is_to_all: true },   // 发给全员
    msgtype: 'text',
    text: { content: text },
  }
  return httpPostJson(url, body)
}

// ========== HTTPS helpers ==========
function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let buf = ''
      res.on('data', (c) => { buf += c })
      res.on('end', () => {
        try { resolve(JSON.parse(buf)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}
function httpPostJson(url, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const body = JSON.stringify(payload)
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let buf = ''
      res.on('data', (c) => { buf += c })
      res.on('end', () => {
        try { resolve(JSON.parse(buf)) } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ========== 入口 ==========
exports.main = async (event) => {
  const startTime = new Date()
  try {
    const result = await massSendText(REMIND_TEXT)
    await db.collection('reminderLogs').add({
      data: {
        triggeredAt: startTime,
        success: result.errcode === 0,
        wxResult: result,
        source: event && event.Type === 'Timer' ? 'cron' : 'manual',
      },
    }).catch(() => null)
    console.log('[reminderSend] sent', result)
    return { ok: result.errcode === 0, wx: result }
  } catch (err) {
    console.error('[reminderSend] failed', err)
    await db.collection('reminderLogs').add({
      data: {
        triggeredAt: startTime,
        success: false,
        error: String(err && err.message || err),
      },
    }).catch(() => null)
    return { ok: false, error: String(err && err.message || err) }
  }
}
