// 净值目标（V2.0）：用户自定义一个净资产目标，看进度与预计达成时间。
//
// 一期只允许「一个进行中的目标」—— 多目标会立刻引出「哪些账户算进这个目标」，
// 那是另一个产品。换目标 = 归档旧的、建新的（旧目标不删，为将来的目标历史留数据）。
//
// 金额口径：目标金额按用户设定时的币种原样存（targetFen + currency），
// 展示也用这个币种；和当前净资产比较时统一折算到人民币（内部锚定币，同不变量 4）。
// 若目标直接存人民币，本位币是美元的用户会看到目标金额随汇率漂移。
//
// 预测：剩余金额 ÷ 月均增速，增速来自 utils/growth.js（与里程碑当前关同一口径）。
// 只用用户自己的真实历史外推，不提供「自填预期收益率」——一旦允许自填，屏幕上的
// 数字就不再可追溯到已存数据（不变量 10）。

const cloud = require('./cloud.js')
const { toCny, convert, symbolOf } = require('../utils/currency.js')
const { currentRates, baseCurrency } = require('../utils/networth.js')
const { MIN_MONTHS } = require('../utils/growth.js')

const MAX_PREDICT_MONTHS = 600   // 50 年，超出即视为不可预测

const goals = cloud.goals   // 集合访问器统一走 services/cloud.js（不变量 2）

// 当前进行中的目标；没有则返回 null
async function getActiveGoal() {
  const res = await goals()
    .where({ isArchived: false })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()
  return (res.data || [])[0] || null
}

// 新建目标。已有进行中的目标时先归档（保证同时只有一条 active）。
// name 允许为空，页面回退为「我的目标」。
async function createGoal({ name, targetFen, currency }) {
  const existing = await getActiveGoal()
  if (existing) await archiveGoal(existing._id)

  const res = await goals().add({
    data: {
      name: (name || '').trim() || '我的目标',
      targetFen: Math.round(targetFen),
      currency: currency || baseCurrency(),
      createdAt: cloud.serverDate(),
      achievedAt: null,
      isArchived: false,
    },
  })
  return res._id
}

async function updateGoal(id, { name, targetFen }) {
  const data = {}
  if (name != null) data.name = (name || '').trim() || '我的目标'
  if (targetFen != null) data.targetFen = Math.round(targetFen)
  await goals().doc(id).update({ data })
}

async function archiveGoal(id) {
  await goals().doc(id).update({ data: { isArchived: true } })
}

// 标记达成时间（首次达成时写一次，用于达成态展示「X 年 X 月达成」）
async function markAchieved(id) {
  await goals().doc(id).update({ data: { achievedAt: cloud.serverDate() } })
}

// 纯计算：目标 + 当前净资产(人民币分) + 增速 → 页面所需的全部字段。
// 不碰数据库，便于单测。
//
// 返回 { hasGoal, name, currency, symbol, targetFen, currentFen, remainingFen,
//        pct, pctText, achieved, state, monthsToGo, etaText, months, volatile }
//   state: 'ok'          给出预计达成时间
//          'achieved'    已达成
//          'short'       完整月样本不足，只显示进度
//          'nonPositive' 增速 <= 0，如实说明正在远离目标
//          'tooFar'      按当前增速要 50 年以上，不给具体月份
function buildGoalView(goal, currentCnyFen, growth) {
  if (!goal) return { hasGoal: false }

  const ccy = goal.currency || 'CNY'
  const rates = currentRates()
  // 展示统一用目标自己的币种；比较统一在人民币口径下做
  const targetCny = toCny(goal.targetFen || 0, ccy, rates)
  const currentInCcy = convert(currentCnyFen || 0, 'CNY', ccy, rates)
  const remainingCny = targetCny - (currentCnyFen || 0)
  const remainingInCcy = convert(Math.max(0, remainingCny), 'CNY', ccy, rates)

  const pct = targetCny > 0
    ? Math.max(0, Math.min(100, (currentCnyFen / targetCny) * 100))
    : 0
  const achieved = remainingCny <= 0

  const view = {
    hasGoal: true,
    _id: goal._id,
    name: goal.name || '我的目标',
    currency: ccy,
    symbol: symbolOf(ccy),
    targetFen: goal.targetFen || 0,
    currentFen: currentInCcy,
    remainingFen: remainingInCcy,
    pct,
    pctText: pct.toFixed(1),
    achieved,
    achievedAt: goal.achievedAt || null,
    months: (growth && growth.months) || 0,
    volatile: !!(growth && growth.volatile),
    monthsToGo: null,
    etaText: '',
  }

  if (achieved) {
    view.state = 'achieved'
    return view
  }

  const cov = (growth && growth.coverage) || 'short'
  if (cov !== 'ok') {
    // 'short' → 样本不足；'nonPositive' → 在远离目标。两种都不给日期。
    view.state = cov
    view.monthsNeeded = Math.max(0, MIN_MONTHS - view.months)   // 「再记录 X 个月」文案用
    return view
  }

  const monthsToGo = remainingCny / growth.monthlyFen
  // growth 是人民币口径，折算到目标币种后再交给 UI，
  // 否则卡上「目标/当前/还差」是 $，而「月均净增」却是 ¥
  view.monthlyFen = convert(growth.monthlyFen, 'CNY', ccy, rates)
  view.monthsToGo = monthsToGo
  // 超过 50 年不给具体月份：写出「2183 年 4 月」只会显得荒谬，且那么远的外推本就没有意义
  if (monthsToGo > MAX_PREDICT_MONTHS) {
    view.state = 'tooFar'
    return view
  }
  view.state = 'ok'
  view.etaText = fmtFutureMonth(monthsToGo)
  return view
}

// 未来月数 → 「2029 年 6 月」
function fmtFutureMonth(monthsFromNow) {
  const d = new Date()
  d.setMonth(d.getMonth() + Math.ceil(monthsFromNow))
  return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月'
}

module.exports = {
  getActiveGoal,
  createGoal,
  updateGoal,
  archiveGoal,
  markAchieved,
  buildGoalView,
}
