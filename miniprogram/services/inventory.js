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

const STALE_DAYS = 30      // 超过视为「太久没核对」（横幅触发 + 琥珀色警示）
const ROW_HIDE_DAYS = 7    // 首页账户行 ≤7 天不显示新鲜度小字，减少噪音
const COOLDOWN_DAYS = 7    // 盘点后的冷静期：这期间不再弹横幅（见 bannerInfo）
const REVALUE_DAYS = 365   // 固定资产超过这个天数没估过，入口转琥珀色（见 fixedSummary）

const STORAGE_LAST_TS = 'inv_last_ts'

// 月度盘点只核对「会动」的账户：流动资金 / 投资 / 应收款 / 负债。
//
// 固定资产被排除，依据不是任何推断，而是用户自己在建账户时选的分类 ——
// utils/categories.js 里 fixed 的 desc 原话就是「房产 / 车辆等长期资产」。
// 房子和工资卡本来就不是一个节奏的东西，把它们排进同一个逐个核对的列表，
// 是让 11 个一年不动的账户去拖慢那 4 个每月都动的（这也正是「盘点很烦、
// 一年只做 4 次」的根因）。固定资产改走 REVALUE_DAYS 的低频重估入口。
//
// 注意：排除的只是「核对流程」，不是「净资产计算」—— 固定资产照常计入净值，
// 见 utils/networth.js 与不变量 4。
const SCOPE_EXCLUDED_CATEGORIES = ['fixed']

function inScope(acc) {
  return !!acc && SCOPE_EXCLUDED_CATEGORIES.indexOf(acc.categoryId) === -1
}

// 把账户拆成「盘点要核对的」与「固定资产」两拨
function splitByScope(accounts) {
  const moving = []
  const fixed = []
  for (const a of accounts || []) (inScope(a) ? moving : fixed).push(a)
  return { moving, fixed }
}

// 固定资产入口的摘要：{ count, days, agoText, due }
// days = 这批账户里「最久没被估过」的那个的天数（取最小新鲜度）。
// 一个都没有时 count 为 0，调用方隐藏整行。
function fixedSummary(accounts) {
  const fixed = (accounts || []).filter(a => !inScope(a))
  if (!fixed.length) return { count: 0, days: null, agoText: '', due: false }
  let days = null
  for (const a of fixed) {
    const d = calendarDaysAgo(freshnessMs(a))
    if (d == null) continue
    if (days == null || d > days) days = d
  }
  if (days == null) return { count: fixed.length, days: null, agoText: '', due: false }
  let agoText
  if (days < 30) agoText = '上次估值 ' + (days === 0 ? '今天' : days + ' 天前')
  else if (days < 365) agoText = '上次估值 ' + Math.floor(days / 30) + ' 个月前'
  else agoText = '已 ' + Math.floor(days / 365) + ' 年没估过'
  return { count: fixed.length, days, agoText, due: days >= REVALUE_DAYS }
}

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

// { days, stale, text, agoText }：days=null 表示无时间信息（文案为空）
//   text    首页账户行用，含「核对」字样，避免被误读成 App 会自动同步余额
//   agoText 盘点页用，只有时间部分（「今天 / 昨天 / X 天前」），由页面自行组句
function freshInfo(acc) {
  const ms = freshnessMs(acc)
  const days = calendarDaysAgo(ms)
  if (days == null) return { days: null, stale: false, text: '', agoText: '' }
  let agoText
  if (days === 0) agoText = '今天'
  else if (days === 1) agoText = '昨天'
  else agoText = days + ' 天前'
  const text = days >= STALE_DAYS ? (days + ' 天没核对了') : ('上次核对 ' + agoText)
  return { days, stale: days >= STALE_DAYS, text, agoText }
}

// 「有几个账户该核对了」—— 只数盘点范围内的账户。
// 固定资产不在月度盘点里（见 splitByScope），若把它算进来，一处一年没重估的房产
// 会让首页永远挂着「该盘点了」，而用户进盘点页根本找不到它，催了也消不掉。
// 房产的过期由 fixedSummary().due 单独管。
function staleCount(accounts) {
  let n = 0
  for (const a of accounts || []) {
    if (!inScope(a)) continue
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
//
// 冷静期：刚盘过的 COOLDOWN_DAYS 天内一律不弹，哪怕还有账户没核对 —— 用户在盘点里
// 主动「跳过」某个账户（比如房产估值一时查不到）是一个决定，回到首页立刻再催一遍
// 等于无视这个决定。冷静期过后若仍超期，会重新提醒。
// 注意：只有真的走过流程才会写 inv_last_ts（一个账户都没动就退出不写，见 pages/inventory），
// 所以「点开看一眼就退」拿不到冷静期。
function bannerInfo(accounts) {
  const scoped = (accounts || []).filter(inScope)
  if (!scoped.length) return { show: false, staleCount: 0, lastDays: null }
  const stale = staleCount(scoped)
  const lastTs = lastInventoryTs()
  const lastDays = lastTs ? calendarDaysAgo(lastTs) : null
  if (lastDays != null && lastDays < COOLDOWN_DAYS) {
    return { show: false, staleCount: stale, lastDays }
  }
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
  COOLDOWN_DAYS,
  REVALUE_DAYS,
  inScope,
  splitByScope,
  fixedSummary,
  freshnessMs,
  freshInfo,
  staleCount,
  lastInventoryTs,
  markInventoryDone,
  bannerInfo,
  netWorthAtCnyFen,
}
