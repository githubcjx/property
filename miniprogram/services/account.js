const cloud = require('./cloud.js')
const { getCategory, getSubType } = require('../utils/categories.js')

// 拉取当前用户所有未隐藏的账户（按创建时间升序）
// 分页拉全量：小程序端单次 get 最多 20 条，账户超过 20 个时不能用 limit(200) 一次拉。
async function listAccounts() {
  return cloud.getAll(() => cloud.accounts()
    .where({ isHidden: false })
    .orderBy('createdAt', 'asc'))
}

async function getAccount(id) {
  const res = await cloud.accounts().doc(id).get()
  return res.data
}

// 创建账户。balance 单位：分。返回 _id。
async function addAccount({ categoryId, subType, customName, name, balance, includeInChart, note, icon, currency }) {
  const cat = getCategory(categoryId)
  if (!cat) throw new Error('未知大类: ' + categoryId)
  const st = getSubType(categoryId, subType)
  // 名称回退：用户填写 > 自定义子类输入 > 子类默认名 > 大类名
  const finalName = (name && name.trim())
    || (customName && customName.trim())
    || (st && st.name)
    || cat.name
  const finalIcon = icon || (st && st.icon) || 'folder'
  const initBalance = Math.round(balance || 0)
  const now = cloud.serverDate()

  const doc = {
    categoryId,
    subType: subType || 'other',
    name: finalName,
    balance: initBalance,
    // 账户币种，原币种存储；缺省人民币。创建后不可改（改币种=换账户）。
    currency: currency || 'CNY',
    includeInChart: includeInChart !== false,
    note: note || '',
    icon: finalIcon,
    colorTheme: cat.color,
    createdAt: now,
    updatedAt: now,
    isHidden: false,
  }
  const res = await cloud.accounts().add({ data: doc })

  // 如果初始余额非 0，写入一条「初始余额」变动记录
  if (initBalance !== 0) {
    await cloud.transactions().add({
      data: {
        accountId: res._id,
        type: 'set',
        amount: initBalance,
        balanceAfter: initBalance,
        note: '初始余额',
        createdAt: now,
      },
    })
  }
  return res._id
}

async function updateAccount(id, partial) {
  const data = Object.assign({}, partial, { updatedAt: cloud.serverDate() })
  await cloud.accounts().doc(id).update({ data })
}

// 软删除
async function softDeleteAccount(id) {
  await cloud.accounts().doc(id).update({
    data: { isHidden: true, updatedAt: cloud.serverDate() },
  })
}

// 修改余额：直接设定新余额，自动计算差值
async function setBalance(accountId, newBalance, note, date) {
  const acc = await getAccount(accountId)
  const current = acc.balance || 0
  const target = Math.round(newBalance)
  const delta = target - current
  const createdAt = date || cloud.serverDate()

  await cloud.accounts().doc(accountId).update({
    data: { balance: target, updatedAt: createdAt },
  })
  await cloud.transactions().add({
    data: {
      accountId,
      type: 'set',
      amount: delta,
      balanceAfter: target,
      note: (note && note.trim()) || '修改余额',
      createdAt,
    },
  })
  return { delta, balanceAfter: target }
}

// 增减金额：相对变化
async function deltaBalance(accountId, deltaFen, note, date) {
  const acc = await getAccount(accountId)
  const current = acc.balance || 0
  const delta = Math.round(deltaFen)
  const target = current + delta
  const createdAt = date || cloud.serverDate()

  await cloud.accounts().doc(accountId).update({
    data: { balance: target, updatedAt: createdAt },
  })
  await cloud.transactions().add({
    data: {
      accountId,
      type: 'delta',
      amount: delta,
      balanceAfter: target,
      note: (note && note.trim()) || '增减金额',
      createdAt,
    },
  })
  return { delta, balanceAfter: target }
}

module.exports = {
  listAccounts,
  getAccount,
  addAccount,
  updateAccount,
  softDeleteAccount,
  setBalance,
  deltaBalance,
}
