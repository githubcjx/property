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

module.exports = {
  listByAccount,
  getById,
  deleteTransaction,
  updateTransaction,
}
