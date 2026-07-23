// 净值增速估算·单一来源。
//
// 「净值目标」的达成时间预测与「里程碑」当前关的预计月份都用这里的结果，
// 两处必须同口径 —— 否则同一屏上会出现两个互相矛盾的预测（不变量 4 那类重复实现陷阱）。
//
// 口径：取最近 LOOKBACK_MONTHS 个「完整自然月」的月末净值快照，相邻相减得到每月净增，
// 再取 **中位数** 作为月均增速。用中位数而不是首尾两点相减，是因为一笔年终奖 / 一次大额
// 买房支出就能把首尾差拉飞，据此外推出的达成时间会离谱地乐观或悲观。
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

function median(nums) {
  const s = nums.slice().sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

// 返回 { monthlyFen, coverage, months, volatile }
//   coverage: 'ok'          可以预测
//             'short'       完整月样本不足 MIN_MONTHS 个 → 页面只显示进度，不给日期
//             'nonPositive' 中位数 <= 0（在远离目标）→ 页面如实说明，不给日期
//   months:   实际拿到的完整月样本数（'short' 时用于文案「再记录 X 个月」）
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
