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

// 汇率集合（公共数据，所有用户可读；仅云函数 fxRateSync 写）
function fxRates() {
  return db().collection('fxRates')
}

// 净值目标（每人同时只有一条未归档）
function goals() {
  return db().collection('goals')
}

// 盘点提醒订阅（每人一条；云函数 inventoryRemind 读它决定给谁发）
function reminders() {
  return db().collection('reminders')
}

// 服务端时间（写入字段使用）
function serverDate(offset) {
  return db().serverDate(offset ? { offset } : undefined)
}

// 取每个账户在 sinceDate 之前最近一条交易的 balanceAfter，返回 { accountId: balanceAfter }。
// 用普通查询（小程序端聚合 aggregate 在本环境会报 -501007，故不用）：
//   按 createdAt 倒序翻页，每个账户「第一次出现」即其最新基线，集齐全部账户即停 —— 通常 1~2 页。
//   等价于逐账户 orderBy desc limit 1，但请求数远少于 N。
// 准确性：①权限「仅创建者可读写」→ 只读本人数据 ②倒序首现即最新，与逐账户一致
//        ③翻页上限内未找到的账户 → 单独精确兜底查询，保证不漏。
async function latestBalanceMapBefore(sinceDate, accountIds) {
  const cmd = command()
  const need = {}
  let needCount = 0
  ;(accountIds || []).forEach(function (id) {
    if (id && !(id in need)) { need[id] = true; needCount++ }
  })
  const map = {}
  if (needCount === 0) return map

  const PAGE = 20
  const MAX_PAGES = 30
  let skip = 0
  let exhausted = false   // 是否已读完 sinceDate 之前的全部交易
  for (let i = 0; i < MAX_PAGES && needCount > 0; i++) {
    const res = await transactions()
      .where({ createdAt: cmd.lte(sinceDate) })
      .field({ accountId: true, balanceAfter: true, balanceAfterCnyFen: true, createdAt: true })
      .orderBy('createdAt', 'desc')
      .skip(skip).limit(PAGE).get()
    const data = (res && res.data) || []
    for (let j = 0; j < data.length; j++) {
      const t = data[j]
      if (need[t.accountId] && !(t.accountId in map)) {
        // 返回人民币快照（历史口径统一为人民币）；老数据回退 balanceAfter
        map[t.accountId] = (t.balanceAfterCnyFen != null ? t.balanceAfterCnyFen : t.balanceAfter) || 0
        delete need[t.accountId]
        needCount--
        if (needCount === 0) break
      }
    }
    if (data.length < PAGE) { exhausted = true; break }
    skip += PAGE
  }

  // 仅当「数据没读完就撞到翻页上限」时，才对剩余账户精确兜底；
  // 若已读完(exhausted)，剩余账户本就没有 sinceDate 之前的记录（如新建账户），无需再查 —— 避免无谓请求。
  if (needCount > 0 && !exhausted) {
    await Promise.all(Object.keys(need).map(async function (id) {
      try {
        const res = await transactions()
          .where({ accountId: id, createdAt: cmd.lte(sinceDate) })
          .orderBy('createdAt', 'desc').limit(1).get()
        const t = (res.data || [])[0]
        if (t) map[id] = (t.balanceAfterCnyFen != null ? t.balanceAfterCnyFen : t.balanceAfter) || 0
      } catch (e) {}
    }))
  }
  return map
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
  fxRates,
  goals,
  reminders,
  serverDate,
  getAll,
  latestBalanceMapBefore,
}
