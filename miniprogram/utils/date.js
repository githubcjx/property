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

module.exports = {
  toDate,
  formatDateTime,
  formatYMD,
  formatShort,
}
