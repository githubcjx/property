// 云开发数据库句柄统一获取

function db() {
  return wx.cloud.database()
}

function command() {
  return db().command
}

function accounts() {
  return db().collection('accounts')
}

function transactions() {
  return db().collection('transactions')
}

// 服务端时间（写入字段使用）
function serverDate(offset) {
  return db().serverDate(offset ? { offset } : undefined)
}

// 分页拉全量。小程序端单次 get() 最多返回 20 条（limit 上限即 20），
// 想拿超过 20 条必须用 skip 翻页。buildQuery() 每次返回一个「全新」查询
// （含 where / orderBy，但不要带 skip/limit），内部逐页累加直到取完。
async function getAll(buildQuery, pageSize) {
  const size = pageSize || 20
  const all = []
  let skip = 0
  // 上限保护，避免异常情况下死循环
  while (skip < 100000) {
    const res = await buildQuery().skip(skip).limit(size).get()
    const batch = (res && res.data) || []
    all.push(...batch)
    if (batch.length < size) break
    skip += size
  }
  return all
}

module.exports = {
  db,
  command,
  accounts,
  transactions,
  serverDate,
  getAll,
}
