// 汇率读取（客户端）：读 fxRates 集合最新一条，注入 getApp().globalData，并本地缓存。
//
// 汇率由云函数 fxRateSync 每天 09:00 统一写入，客户端只读、不可手填。
// 这里把「1 外币 = X 人民币」的 rates 表放进 globalData.fxRates，
// 供 utils/networth.js / utils/currency.js 在折算时取用；失败时回退本地缓存，保证离线/弱网可用。

const cloud = require('./cloud.js')

const CACHE_KEY = 'fx_rates_cache'

function apply(doc) {
  const app = getApp()
  if (app && app.globalData && doc && doc.rates) {
    app.globalData.fxRates = doc.rates
    app.globalData.fxRatesMeta = { date: doc.date || '', source: doc.source || '' }
  }
}

// 拉取最新汇率 → 注入 globalData + 写缓存；失败回退缓存。返回 doc 或 null。
async function refresh() {
  try {
    const res = await cloud.fxRates().orderBy('date', 'desc').limit(1).get()
    const doc = (res.data || [])[0]
    if (doc && doc.rates) {
      apply(doc)
      try { wx.setStorageSync(CACHE_KEY, doc) } catch (e) {}
      return doc
    }
  } catch (e) {
    console.warn('[fxRate] 拉取汇率失败，尝试使用本地缓存', e)
  }
  try {
    const cached = wx.getStorageSync(CACHE_KEY)
    if (cached && cached.rates) { apply(cached); return cached }
  } catch (e) {}
  return null
}

// 汇率元信息（截至日期 / 来源），供「汇率」设置页展示。
function getMeta() {
  const app = getApp()
  return (app && app.globalData && app.globalData.fxRatesMeta) || null
}

// 当前 rates 表（可能为 null）。
function getRates() {
  const app = getApp()
  return (app && app.globalData && app.globalData.fxRates) || null
}

module.exports = { refresh, getMeta, getRates }
