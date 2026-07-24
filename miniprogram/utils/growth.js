// 净值增速估算·单一来源。
//
// 「净值目标」的达成时间预测与「里程碑」当前关的预计月份都用这里的结果，
// 两处必须同口径 —— 否则同一屏上会出现两个互相矛盾的预测（不变量 4 那类重复实现陷阱）。
//
// 口径：取最近 LOOKBACK_MONTHS 个「完整自然月」的月末净值快照，相邻相减得到每月净增，
// 再取 **中位数** 作为月均增速。用中位数而不是首尾两点相减，是因为一笔年终奖 / 一次大额
// 买房支出就能把首尾差拉飞，据此外推出的达成时间会离谱地乐观或悲观。
//
// ⚠️ 关键：**当月一笔记录都没有的月份不计入样本**。「没有记录」不等于「没有变化」——
// 用户那个月只是没打开 App，钱照样在动。早期版本把这种月份当成净增 0 塞进样本，
// 真实用户（半年才更一次余额）12 个月里有 7 个空月，中位数被一堆假 0 拖到 0，
// 于是判成 nonPositive、页面显示「你在远离目标」，而其实那 12 个月净值涨了近 20 万。
// 空月一律跳过，样本因此不足时如实降级成 'short'（「再记录 X 个月」），不猜。
//
// 输入 timeline 为 [{ time: ms, net: 人民币分 }] 升序（由 services/milestones.js
// buildNetWorthTimeline 重建，遵循不变量 5 的快照口径）。本模块是纯计算，不碰数据库。

const LOOKBACK_MONTHS = 12   // 回看窗口：近 12 个完整月
const MIN_MONTHS = 6         // 少于 6 个完整月不给预测（样本太少，中位数没有意义）
const VOLATILE_RATIO = 3     // 最大单月净增 > 中位数的 3 倍 → 标记为波动较大

// 最近 n+1 个自然月起点（升序），围出 n 个完整月。
// 当前这个月还没走完，故以「本月 1 号 0 点」为右端，不把半个月算成一个月。
function monthStarts(n) {
  const now = new Date()
  const arr = []
  for (let i = n; i >= 0; i--) {
    arr.push(new Date(now.getFullYear(), now.getMonth() - i, 1).getTime())
  }
  return arr
}

// 时间线上 ms 时刻的净值 = 最后一个 time <= ms 的点。
// 该时刻还没有任何记录（账户尚未建立）时返回 null，调用方跳过这段。
function netAt(timeline, ms) {
  let net = null
  for (const p of timeline) {
    if (p.time > ms) break
    net = p.net
  }
  return net
}

// 该自然月内是否有过记录。timeline 的每个点都对应一次真实的余额变动，
// 所以「区间内有点」== 用户当月确实更新过数据。timeline 升序，可提前跳出。
function hasActivity(timeline, startMs, endMs) {
  for (const p of timeline) {
    if (p.time >= endMs) return false
    if (p.time >= startMs) return true
  }
  return false
}

function median(nums) {
  const s = nums.slice().sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

// 返回 { monthlyFen, coverage, months, volatile }
//   coverage: 'ok'          可以预测
//             'short'       **有记录的**完整月不足 MIN_MONTHS 个 → 页面只显示进度，不给日期
//             'nonPositive' 中位数 <= 0（在远离目标）→ 页面如实说明，不给日期
//   months:   实际拿到的样本月数（'short' 时用于文案「再记录 X 个月」）
//   volatile: 月度变化波动大，预测只作粗略参考
function estimateMonthlyGrowth(timeline) {
  if (!timeline || timeline.length < 2) {
    return { monthlyFen: 0, coverage: 'short', months: 0, volatile: false }
  }

  const bounds = monthStarts(LOOKBACK_MONTHS)
  const nets = bounds.map(b => netAt(timeline, b))

  const deltas = []
  for (let i = 1; i < nets.length; i++) {
    if (nets[i] == null || nets[i - 1] == null) continue
    // 整月无记录 → 这个 0 是缺数据的假象，不是真的没变，跳过（见文件头说明）
    if (!hasActivity(timeline, bounds[i - 1], bounds[i])) continue
    deltas.push(nets[i] - nets[i - 1])
  }

  if (deltas.length < MIN_MONTHS) {
    return { monthlyFen: 0, coverage: 'short', months: deltas.length, volatile: false }
  }

  const monthlyFen = median(deltas)
  if (monthlyFen <= 0) {
    return { monthlyFen, coverage: 'nonPositive', months: deltas.length, volatile: false }
  }

  const maxAbs = Math.max.apply(null, deltas.map(Math.abs))
  return {
    monthlyFen,
    coverage: 'ok',
    months: deltas.length,
    volatile: maxAbs / monthlyFen > VOLATILE_RATIO,
  }
}

module.exports = {
  LOOKBACK_MONTHS,
  MIN_MONTHS,
  VOLATILE_RATIO,
  estimateMonthlyGrowth,
}
