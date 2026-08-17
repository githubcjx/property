// 日期格式化：跨年显示完整日期，本年只显示月日

function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

function toDate(d) {
  if (!d) return null
  if (d instanceof Date) return d
  if (typeof d === 'string' || typeof d === 'number') return new Date(d)
  // 云数据库返回 { $date: ... } 或服务端时间对象
  if (d.$date) return new Date(d.$date)
  return new Date(d)
}

// 「5月1日 08:09」 / 「2024年12月31日 19:42」
function formatDateTime(d) {
  const date = toDate(d)
  if (!date || isNaN(date.getTime())) return ''
  const now = new Date()
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const day = date.getDate()
  const hh = pad2(date.getHours())
  const mm = pad2(date.getMinutes())
  if (y === now.getFullYear()) {
    return `${m}月${day}日 ${hh}:${mm}`
  }
  return `${y}年${m}月${day}日 ${hh}:${mm}`
}

// 「2024-05-01」用于头部
function formatYMD(d) {
  const date = toDate(d)
  if (!date || isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

// 相对今天的简短日期：「今天」「昨天」「5月1日」
function formatShort(d) {
  const date = toDate(d)
  if (!date || isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) return '今天'
  const yesterday = new Date(now.getTime() - 86400000)
  if (date.toDateString() === yesterday.toDateString()) return '昨天'
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }
  return formatYMD(date)
}

// 相对时间（"瞄一眼就懂"档位）：
//   < 1 min   → 刚刚更新
//   < 1 hour  → X 分钟前 更新
//   同一天     → 今天更新
//   昨天       → 昨天更新
//   2–6 天    → X 天前 更新
//   7–29 天   → X 周前 更新
//   30–364 天 → X 个月前 更新
//   ≥ 365 天  → X 年前 更新
function formatRelative(d) {
  const date = toDate(d)
  if (!date || isNaN(date.getTime())) return ''
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffSec < 60)   return '刚刚更新'
  if (diffSec < 3600) return Math.max(1, Math.floor(diffSec / 60)) + ' 分钟前 更新'

  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) return '今天更新'

  const yesterday = new Date(now.getTime() - 86400000)
  if (date.toDateString() === yesterday.toDateString()) return '昨天更新'

  // 按日历日差
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const b = new Date(now.getFullYear(),  now.getMonth(),  now.getDate())
  const days = Math.floor((b.getTime() - a.getTime()) / 86400000)

  if (days < 7)   return days + ' 天前 更新'
  if (days < 30)  return Math.floor(days / 7)  + ' 周前 更新'
  if (days < 365) return Math.floor(days / 30) + ' 个月前 更新'
  return Math.floor(days / 365) + ' 年前 更新'
}

// 本月 1 日 00:00（本地时区）。首页「本月至今」的基线，
// 也是这个 App 唯一的时间节拍——盘点/月报/1 号提醒都踩在同一个月界上。
function startOfMonth(d) {
  const date = d ? toDate(d) : new Date()
  if (!date || isNaN(date.getTime())) return null
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
}

module.exports = {
  toDate,
  startOfMonth,
  formatDateTime,
  formatYMD,
  formatShort,
  formatRelative,
}
