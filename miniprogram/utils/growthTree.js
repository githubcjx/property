// 首页小树的「阶段」计算 —— 单一事实来源。
//
// 小树衡量的是「坚持」，不是「有钱」：只看相伴天数与更新次数，绝不看金额。
// 故意如此 —— 用净资产决定树的大小，等于让负债的人永远只有一颗种子，
// 而这与本应用的立场相反（见 CLAUDE.md 不变量 10 · 数据诚实：两个数都来自
// 真实存储的 accounts.createdAt 与 transactions 条数，没有任何编造的门槛）。
//
// 两个条件必须「同时」满足才升级：只看天数，放着不管的账号也会白长一棵大树；
// 只看次数，一天狂点二十下就能速成。天数 = 时间的诚实，次数 = 人的诚实。
//
// 树只会长大，永不枯萎 —— 冷落它不该被惩罚，回来时它还在原地等你。

// 由小到大；每级的 days/updates 均为「进入该级所需的下限」。
const STAGES = [
  { key: 'seed',    name: '一颗种子', days: 0,   updates: 0 },
  { key: 'sprout',  name: '一株新芽', days: 0,   updates: 1 },
  { key: 'sapling', name: '小树苗',   days: 14,  updates: 5 },
  { key: 'young',   name: '一棵小树', days: 60,  updates: 12 },
  { key: 'tree',    name: '一棵大树', days: 180, updates: 30 },
]

const DAY_MS = 24 * 60 * 60 * 1000

// 云端日期可能是 Date / 数字 / 字符串 / {$date}，统一转毫秒（同 services 的 toMs 惯例）
function toMs(v) {
  if (!v) return 0
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return v
  if (typeof v === 'object' && v.$date) return toMs(v.$date)
  const t = new Date(v).getTime()
  return isNaN(t) ? 0 : t
}

// 相伴天数 = 今天 − 最早那个账户的创建日（按自然日计，当天 = 第 1 天）
function daysSince(accounts) {
  let earliest = 0
  for (const a of accounts || []) {
    const ms = toMs(a.createdAt)
    if (ms && (!earliest || ms < earliest)) earliest = ms
  }
  if (!earliest) return 0
  const d0 = new Date(earliest); d0.setHours(0, 0, 0, 0)
  const d1 = new Date();         d1.setHours(0, 0, 0, 0)
  return Math.max(1, Math.round((d1 - d0) / DAY_MS) + 1)
}

// 取当前阶段索引：从大到小找第一个两个条件都够的
function stageIndex(days, updates) {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (days >= STAGES[i].days && updates >= STAGES[i].updates) return i
  }
  return 0
}

// 下一级还差什么。两个条件都不够时必须两个都说 —— 只说「再更新 2 次」，
// 等于承诺更新两次就能长大，可天数还差着，那是句会落空的话（数据诚实）。
function nextText(idx, days, updates) {
  const next = STAGES[idx + 1]
  if (!next) return '它已经长到最大了'
  const needUpd = Math.max(0, next.updates - updates)
  const needDay = Math.max(0, next.days - days)
  if (needUpd > 0 && needDay > 0) {
    return '还差 ' + needUpd + ' 次更新、' + needDay + ' 天，长成' + next.name
  }
  if (needUpd > 0) return '再更新 ' + needUpd + ' 次，长成' + next.name
  if (needDay > 0) return '再过 ' + needDay + ' 天，长成' + next.name
  return '马上就要长大了'
}

// accounts: 首页已加载的账户数组（免额外请求）；updates: transactions 总条数
function evaluate(accounts, updates) {
  const days = daysSince(accounts)
  const n = Math.max(0, updates || 0)
  const idx = stageIndex(days, n)
  const st = STAGES[idx]
  return {
    stage: idx,
    key: st.key,
    name: st.name,
    days,
    updates: n,
    title: st.name + ' · 第 ' + days + ' 天',
    next: nextText(idx, days, n),
    isMax: idx === STAGES.length - 1,
  }
}

module.exports = { STAGES, evaluate, daysSince }
