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

module.exports = {
  db,
  command,
  accounts,
  transactions,
  serverDate,
}
