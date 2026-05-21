const cloud = require('./cloud.js')

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

module.exports = {
  listByAccount,
  getById,
  deleteTransaction,
}
