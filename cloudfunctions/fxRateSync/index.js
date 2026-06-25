// 汇率每日同步（净值本多货币功能）
//
// 触发：定时触发器，每天 08:00 北京时间执行一次（cron 见 config.json，UTC = 北京 −8h，故配 0 点）。
//   全员共用同一份汇率，每天只抓一次，节省第三方接口请求。
// 工作流：
//   1. 从免费汇率源 open.er-api.com 取以 CNY 为基准的最新汇率
//   2. 反算成「1 外币 = X 人民币」（与小程序端 utils/currency.js 的 rates 约定一致）
//   3. 以「日期」为 _id 写入 fxRates 集合（幂等：同一天重复执行覆盖当天那条，并保留历史）
// 失败处理：抓取失败则不写库（保留上一日数据），返回错误信息便于排查。
//
// 也可在云开发控制台手动「测试运行」立即拉一次。

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const https = require('https')

// 需要维护的币种（与小程序 utils/currency.js 的 CURRENCIES 对齐，CNY 为锚定币不入表）。
const CODES = ['USD', 'HKD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD', 'CHF', 'KRW', 'TWD', 'THB', 'MYR']

const SOURCE = 'open.er-api.com'

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let buf = ''
      res.on('data', (c) => { buf += c })
      res.on('end', () => {
        try { resolve(JSON.parse(buf)) } catch (e) { reject(new Error('JSON 解析失败: ' + buf.slice(0, 200))) }
      })
    }).on('error', reject)
  })
}

// 北京日期字符串 YYYY-MM-DD（云函数运行在 UTC，+8h 得北京时间）
function bjDateStr(ms) {
  const d = new Date(ms + 8 * 3600 * 1000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

exports.main = async () => {
  // 以 CNY 为基准：data.rates[X] = 1 CNY 能换多少 X。
  const data = await httpGetJson(`https://${SOURCE}/v6/latest/CNY`)
  if (!data || data.result !== 'success' || !data.rates) {
    throw new Error('汇率源返回异常: ' + JSON.stringify(data).slice(0, 200))
  }

  // 反算「1 外币 = X 人民币」 = 1 / (1 CNY 能换的外币数)
  const rates = {}
  for (const code of CODES) {
    const perCny = data.rates[code]
    if (typeof perCny === 'number' && perCny > 0) {
      rates[code] = Math.round((1 / perCny) * 1e6) / 1e6   // 保留 6 位小数
    }
  }
  if (Object.keys(rates).length === 0) {
    throw new Error('未取到任何可用汇率')
  }

  const now = Date.now()
  const date = bjDateStr(now)
  const doc = {
    date,
    base: 'CNY',           // 锚定币：rates 含义为「1 外币 = X base」
    rates,
    source: SOURCE,
    fetchedAt: db.serverDate(),
  }

  // 幂等：date 作为 _id，当天重复执行覆盖
  const col = db.collection('fxRates')
  await col.doc(date).set({ data: doc }).catch(async (e) => {
    // 兜底：set 在某些权限/版本下需先存在，失败则尝试 add
    await col.add({ data: Object.assign({ _id: date }, doc) }).catch(() => { throw e })
  })

  return { ok: true, date, count: Object.keys(rates).length, rates }
}
