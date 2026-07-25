const cloud = require('./cloud.js')
const { cnySnapshot } = require('../utils/networth.js')

async function listByAccount(accountId, limit) {
  const res = await cloud.transactions()
    .where({ accountId })
    .orderBy('createdAt', 'desc')
    .limit(limit || 50)
    .get()
  return res.data || []
}

async function getById(id) {
  const res = await cloud.transactions().doc(id).get()
  return res.data
}

// 删除一条变动记录，并把账户余额按该记录的 amount 反向回退
// 注意：历史记录中其它 transaction 的 balanceAfter 不会被回算（保留为当时的快照）。
async function deleteTransaction(txId) {
  const txRes = await cloud.transactions().doc(txId).get()
  const tx = txRes.data
  if (!tx) return

  const accRes = await cloud.accounts().doc(tx.accountId).get().catch(() => null)
  if (accRes && accRes.data) {
    const newBalance = (accRes.data.balance || 0) - (tx.amount || 0)
    await cloud.accounts().doc(tx.accountId).update({
      data: { balance: newBalance, updatedAt: cloud.serverDate() },
    })
  }
  await cloud.transactions().doc(txId).remove()
}

// 编辑一条变动记录：可改 amount / note / createdAt
// 当 amount 变化时：
//   - 计算 diff = newAmount - oldAmount
//   - 当前 tx.balanceAfter += diff（仅当前快照）
//   - 关联账户 account.balance += diff
// 注意：其它历史 tx 的 balanceAfter 保留为当时快照（与 deleteTransaction 行为一致）
async function updateTransaction(txId, { amount, note, createdAt } = {}) {
  const txRes = await cloud.transactions().doc(txId).get()
  const tx = txRes.data
  if (!tx) throw new Error('记录不存在')

  const update = {}
  if (note !== undefined) update.note = note
  if (createdAt !== undefined) update.createdAt = createdAt

  if (amount !== undefined && Math.round(amount) !== Math.round(tx.amount || 0)) {
    const newAmount = Math.round(amount)
    const diff = newAmount - (tx.amount || 0)
    update.amount = newAmount
    update.balanceAfter = (tx.balanceAfter || 0) + diff

    const accRes = await cloud.accounts().doc(tx.accountId).get().catch(() => null)
    if (accRes && accRes.data) {
      const newAccBal = (accRes.data.balance || 0) + diff
      await cloud.accounts().doc(tx.accountId).update({
        data: { balance: newAccBal, updatedAt: cloud.serverDate() },
      })
      // 同步刷新该笔的人民币快照（按账户币种 + 当前汇率重算）
      Object.assign(update, cnySnapshot(update.balanceAfter, accRes.data.currency))
    }
  }

  if (Object.keys(update).length === 0) return
  await cloud.transactions().doc(txId).update({ data: update })
}

// 小树成长所需的两个量。两条查询都极轻：一个只回数字，一个只回一条文档。
//   updates —— 变动记录总条数 = 用户「更新过多少次」
//   firstAt —— 最早一笔记录的时间 = 「相伴」的起点锚
// 起点锚必须取 transaction 而不是账户：账户是软删除(isHidden)，listAccounts 查不到，
// 用户只是清理掉一个不用的旧账户，相伴天数就会归零、树当场塌掉。记录不随账户隐藏而消失。
async function growthStats() {
  const [cnt, first] = await Promise.all([
    cloud.transactions().count(),
    cloud.transactions().orderBy('createdAt', 'asc').limit(1).get(),
  ])
  const doc = first && first.data && first.data[0]
  return {
    updates: (cnt && cnt.total) || 0,
    firstAt: doc ? doc.createdAt : null,
  }
}

module.exports = {
  listByAccount,
  getById,
  deleteTransaction,
  updateTransaction,
  growthStats,
}
