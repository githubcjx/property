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

// 相伴天数 = 今天 − 最早的那个起点（按自然日计，当天 = 第 1 天）。
// 起点取「最早一笔记录」与「最早一个账户」中更早的那个：
// 账户是软删除，清理掉旧账户后它就不在 accounts 里了，只靠账户算会让天数凭空归零；
// 而余额为 0 建起来的账户又不产生记录，只靠记录算则新用户没有起点。两个都看才兜得住。
function daysSince(accounts, firstAt) {
  let earliest = toMs(firstAt)
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

// 这里【故意】没有「还差 N 次更新就长大」这类进度文案，别加回来：
// 把进度摆成待办，就会有人为了刷树去点无意义的更新，记进来的是假数据
// （数据诚实，见 CLAUDE.md 不变量 10）。树长大该是隔一阵回来时自己发现的惊喜，
// 不是照着清单刷出来的 KPI。所有关于树的文案一律回望，不前瞻。

// accounts: 调用方已加载的账户数组；stats: services/transaction.js growthStats() 的返回
function evaluate(accounts, stats) {
  const s = stats || {}
  const days = daysSince(accounts, s.firstAt)
  const n = Math.max(0, s.updates || 0)
  const idx = stageIndex(days, n)
  const st = STAGES[idx]
  return {
    stage: idx,
    key: st.key,
    name: st.name,
    days,
    updates: n,
    isMax: idx === STAGES.length - 1,
  }
}

// 「上次见过的阶段」存本地。判定与落戳合成一个动作：谁先看到这次长大，
// 谁就把戳消费掉，另一处便不会为同一次成长再庆祝一遍（盘点完成页 / 首页）。
const STORAGE_STAGE = 'tree_stage_seen'

function takeGrowth(info) {
  const seen = wx.getStorageSync(STORAGE_STAGE)
  // 首次运行 seen 是空串而非数字 —— 那不算「长大」，只落戳，免得新用户一进来就被恭喜
  const grew = typeof seen === 'number' && info.stage > seen
  if (seen !== info.stage) wx.setStorageSync(STORAGE_STAGE, info.stage)
  return grew
}

module.exports = { STAGES, evaluate, daysSince, takeGrowth, STORAGE_STAGE }
