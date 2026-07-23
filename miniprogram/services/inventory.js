// 一键盘点（V2.0）领域逻辑：账户「新鲜度」、盘点横幅条件、上次盘点净值基线。
//
// 新鲜度 = 该账户余额最后一次被确认的时间，取 checkedAt > updatedAt > createdAt：
//   · checkedAt：盘点「没变，确认」与所有余额变动都会刷（见 services/account.js），
//     一旦存在即为权威值；
//   · 老数据没有 checkedAt 时回退 updatedAt（与首页分组头「X 天前更新」既有口径一致；
//     改名/备注也会刷 updatedAt，属于可接受的近似，账户一经盘点或改余额即自愈）。
//
// 上次盘点时间存本机 storage（inv_last_ts）。完成页「较上次盘点」的基线不存数值，
// 而是按不变量 5 的快照口径回算（cloud.latestBalanceMapBefore），历史交易被编辑过
// 也不会失真；没有可回算的记录（首次盘点/换设备）时返回 null，调用方隐藏对比，不造数。

const cloud = require('./cloud.js')
const { isDebtCategory } = require('../utils/categories.js')
const { isIncluded } = require('../utils/networth.js')
const { toDate } = require('../utils/date.js')

const STALE_DAYS = 30      // 超过视为「太久没更新」（横幅触发 + 琥珀色警示）
const ROW_HIDE_DAYS = 7    // 首页账户行 ≤7 天不显示新鲜度小字，减少噪音

const STORAGE_LAST_TS = 'inv_last_ts'

// 账户新鲜度时间戳（ms）；取不到任何时间时返回 0
function freshnessMs(acc) {
  if (!acc) return 0
  const d = toDate(acc.checkedAt || acc.updatedAt || acc.createdAt)
  return d && !isNaN(d.getTime()) ? d.getTime() : 0
}

// 按日历日的天数差（今天=0）
function calendarDaysAgo(ms) {
  if (!ms) return null
  const d = new Date(ms)
  const now = new Date()
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000))
}

// { days, stale, text }：days=null 表示无时间信息（text 为空）
function freshInfo(acc) {
  const ms = freshnessMs(acc)
  const days = calendarDaysAgo(ms)
  if (days == null) return { days: null, stale: false, text: '' }
  let text
  if (days === 0) text = '今天更新'
  else if (days === 1) text = '昨天更新'
  else if (days < STALE_DAYS) text = days + ' 天前更新'
  else text = days + ' 天未更新'
  return { days, stale: days >= STALE_DAYS, text }
}

function staleCount(accounts) {
  let n = 0
  for (const a of accounts || []) {
    const days = calendarDaysAgo(freshnessMs(a))
    if (days != null && days >= STALE_DAYS) n++
  }
  return n
}

function lastInventoryTs() {
  const ts = wx.getStorageSync(STORAGE_LAST_TS)
  return typeof ts === 'number' && ts > 0 ? ts : null
}

function markInventoryDone() {
  wx.setStorageSync(STORAGE_LAST_TS, Date.now())
}

// 首页盘点横幅条件：有账户，且（任一账户超期 或 距上次完成盘点超期）。
// 从未盘点过且账户都新鲜时不打扰。
function bannerInfo(accounts) {
  if (!accounts || !accounts.length) return { show: false }
  const stale = staleCount(accounts)
  const lastTs = lastInventoryTs()
  const lastDays = lastTs ? calendarDaysAgo(lastTs) : null
  const show = stale > 0 || (lastDays != null && lastDays >= STALE_DAYS)
  return { show, staleCount: stale, lastDays }
}

// 按快照口径回算 ms 时刻的净资产（人民币分）。
// 仅含 includeInChart 账户；当时还不存在的账户自然无快照、不计入（同 stats.js 语义）。
// 一条快照都取不到时返回 null（无可对比历史）。
async function netWorthAtCnyFen(ms, accounts) {
  const included = (accounts || []).filter(isIncluded)
  if (!included.length) return null
  const map = await cloud.latestBalanceMapBefore(new Date(ms), included.map(a => a._id))
  let net = 0
  let found = false
  for (const a of included) {
    const snap = map[a._id]
    if (snap == null) continue
    found = true
    if (isDebtCategory(a.categoryId)) net -= snap
    else net += snap
  }
  return found ? net : null
}

module.exports = {
  STALE_DAYS,
  ROW_HIDE_DAYS,
  freshnessMs,
  freshInfo,
  staleCount,
  lastInventoryTs,
  markInventoryDone,
  bannerInfo,
  netWorthAtCnyFen,
}
