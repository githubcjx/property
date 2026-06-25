// 同龄对标 · 方案 A（写死权威分布）
//
// 思路：对照一份「写死的、按年龄分桶的净资产分布」（非本 App 用户实时数据），
// 用用户净资产在所属年龄桶内插值出百分位（你超过了同龄 X%）。
//
// ⚠️ 下方 dist 中的数值目前为「占位示意」，结构正确、数值待替换为权威来源。
//    口径与来源在 SOURCE 中声明；替换真实数据时，保持 p* 含义不变即可。
//
// 单位约定：dist 表内为「元」，便于阅读；账户净资产传入为「分」，evaluate 内部转换。

const { sumNetCnyFen } = require('../utils/networth.js')

// ---------- 分位含义 ----------
// p{N} = 该年龄段中「有 N% 的人净资产低于此值」的门槛。
//   中位数 = p50；「前 25%」门槛 = p75；「前 10%」= p90；「前 1%」= p99；「前 75%」= p25。
const PCTS = [10, 25, 50, 75, 90, 95, 99]

// ---------- 数据来源声明（口径 / 年份，展示在页面底部） ----------
const SOURCE = {
  name: '西南财大《中国家庭金融调查 CHFS》',
  scopeText: '城镇家庭口径 · 净资产',
  year: '2019',
  note: '占位示意数据，非本 App 用户实时数据；分位为同年龄段静态分布插值结果。',
  isPlaceholder: true,
}

// ---------- 按年龄分桶的分位表（单位：元，占位示意） ----------
// 每桶给出 PCTS 对应门槛。整体随年龄递增（年龄越大、积累越多）。
const AGE_BUCKETS = [
  { key: 'lt25', label: '25 岁以下', minAge: 0,  maxAge: 24,
    dist: { p10: 3000,  p25: 15000,  p50: 60000,   p75: 180000,  p90: 420000,   p95: 700000,   p99: 1500000 } },
  { key: '25-29', label: '25–29 岁', minAge: 25, maxAge: 29,
    dist: { p10: 6000,  p25: 35000,  p50: 110000,  p75: 320000,  p90: 680000,   p95: 1100000,  p99: 2400000 } },
  { key: '30-34', label: '30–34 岁', minAge: 30, maxAge: 34,
    dist: { p10: 10000, p25: 60000,  p50: 180000,  p75: 520000,  p90: 980000,   p95: 1500000,  p99: 3200000 } },
  { key: '35-39', label: '35–39 岁', minAge: 35, maxAge: 39,
    dist: { p10: 18000, p25: 90000,  p50: 280000,  p75: 760000,  p90: 1400000,  p95: 2200000,  p99: 4500000 } },
  { key: '40-44', label: '40–44 岁', minAge: 40, maxAge: 44,
    dist: { p10: 25000, p25: 120000, p50: 360000,  p75: 980000,  p90: 1800000,  p95: 2900000,  p99: 6000000 } },
  { key: '45-49', label: '45–49 岁', minAge: 45, maxAge: 49,
    dist: { p10: 30000, p25: 150000, p50: 430000,  p75: 1150000, p90: 2200000,  p95: 3500000,  p99: 7500000 } },
  { key: '50-59', label: '50–59 岁', minAge: 50, maxAge: 59,
    dist: { p10: 35000, p25: 170000, p50: 480000,  p75: 1300000, p90: 2600000,  p95: 4200000,  p99: 9000000 } },
  { key: '60+',   label: '60 岁以上', minAge: 60, maxAge: 200,
    dist: { p10: 30000, p25: 150000, p50: 450000,  p75: 1200000, p90: 2400000,  p95: 3900000,  p99: 8500000 } },
]

// ---------- 工具 ----------

function bucketForAge(age) {
  if (age == null || isNaN(age)) return null
  for (const b of AGE_BUCKETS) {
    if (age >= b.minAge && age <= b.maxAge) return b
  }
  return null
}

function ageFromBirthYear(birthYear) {
  if (!birthYear) return null
  const now = new Date().getFullYear()
  const age = now - birthYear
  if (age < 0 || age > 200) return null
  return age
}

// 净资产（人民币分）：仅含 includeInChart 的账户，负债取负，原币种折算到人民币
function netWorthFenOf(accounts) {
  return sumNetCnyFen(accounts)
}

// 净资产（元）在分位表内插值出百分位（0–99.9）
// 财富近似对数正态：断点之间用对数线性插值；最低段（< p10 门槛）用线性退化到 0。
function percentileOf(yuan, dist) {
  const pts = PCTS.map(p => ({ p, v: dist['p' + p] })).filter(pt => pt.v > 0)
  if (!pts.length) return null
  const first = pts[0]
  const last = pts[pts.length - 1]

  if (yuan <= 0) return 0.5
  if (yuan <= first.v) {
    // 0 → first.p 线性
    return Math.max(0.5, (yuan / first.v) * first.p)
  }
  if (yuan >= last.v) {
    // 超过最高断点：在 last.p 与 99.9 之间略微外推，封顶 99.9
    return Math.min(99.9, last.p + (99.9 - last.p) * 0.5)
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    if (yuan >= a.v && yuan < b.v) {
      const frac = (Math.log(yuan) - Math.log(a.v)) / (Math.log(b.v) - Math.log(a.v))
      return a.p + frac * (b.p - a.p)
    }
  }
  return last.p
}

// ---------- 格式化（元 → 文案） ----------

function fmtYuan(yuan) {
  const v = Math.round(yuan)
  const abs = Math.abs(v)
  if (abs >= 1e8) {
    const yi = v / 1e8
    return '¥' + (Number.isInteger(yi) ? yi : yi.toFixed(2).replace(/\.?0+$/, '')) + ' 亿'
  }
  if (abs >= 1e4) {
    const wan = v / 1e4
    return '¥' + (Number.isInteger(wan) ? wan : Number(wan.toFixed(1))) + ' 万'
  }
  return '¥' + v.toLocaleString('en-US')
}

// 「前 N%」：percentile=73 → 前 27%
function aheadTierText(percentile) {
  const ahead = Math.max(0.1, 100 - percentile)
  if (ahead < 1) return '前 1%'
  return '前 ' + Math.round(ahead) + '%'
}

// ---------- 主入口 ----------
//
// 入参：{ accounts? , netWorthFen? , birthYear }
//   传 accounts 则内部算净资产；也可直接传 netWorthFen。
// 出参见底部 return。所有金额字段同时给「原始值 + 文案」，遮蔽交由页面处理。
function evaluate({ accounts, netWorthFen, birthYear }) {
  const nwFen = (netWorthFen != null) ? netWorthFen : netWorthFenOf(accounts)
  const nwYuan = nwFen / 100
  const age = ageFromBirthYear(birthYear)
  const bucket = bucketForAge(age)

  if (!birthYear || age == null) {
    return { hasAge: false, netWorthText: fmtYuan(nwYuan), source: SOURCE }
  }
  if (!bucket) {
    return { hasAge: true, age, inRange: false, netWorthText: fmtYuan(nwYuan), source: SOURCE }
  }

  const pct = percentileOf(nwYuan, bucket.dist)
  const percentile = Math.round(pct * 10) / 10   // 一位小数

  // 财富阶梯（从高到低展示）
  const ladder = [
    { tier: '前 1%',  pctKey: 'p99', valueText: fmtYuan(bucket.dist.p99) },
    { tier: '前 5%',  pctKey: 'p95', valueText: fmtYuan(bucket.dist.p95) },
    { tier: '前 10%', pctKey: 'p90', valueText: fmtYuan(bucket.dist.p90) },
    { tier: '前 25%', pctKey: 'p75', valueText: fmtYuan(bucket.dist.p75) },
    { tier: '中位数', pctKey: 'p50', valueText: fmtYuan(bucket.dist.p50), isMedian: true },
    { tier: '前 75%', pctKey: 'p25', valueText: fmtYuan(bucket.dist.p25) },
  ]

  // 「你」在阶梯中的插入位置：阶梯从高到低，统计门槛 > 当前净资产的条数
  const ladderVals = [bucket.dist.p99, bucket.dist.p95, bucket.dist.p90, bucket.dist.p75, bucket.dist.p50, bucket.dist.p25]
  const youLadderIndex = ladderVals.filter(v => v > nwYuan).length

  // 下一档：找第一个门槛 > 当前净资产
  let nextTier = null
  const ups = PCTS.map(p => ({ p, v: bucket.dist['p' + p] })).filter(pt => pt.v > nwYuan).sort((a, b) => a.v - b.v)
  if (ups.length) {
    const nx = ups[0]
    nextTier = {
      gapText: fmtYuan(nx.v - nwYuan),
      targetText: fmtYuan(nx.v),
      tierText: aheadTierText(nx.p),
    }
  }

  return {
    hasAge: true,
    inRange: true,
    age,
    cohortLabel: bucket.label,
    netWorthText: fmtYuan(nwYuan),
    percentile,                          // 超过同龄 X%
    percentileText: percentile.toFixed(percentile < 100 && percentile % 1 ? 1 : 0),
    tierText: aheadTierText(percentile), // 前 X%
    medianText: fmtYuan(bucket.dist.p50),
    aboveMedian: nwYuan >= bucket.dist.p50,
    nextTier,
    ladder,
    youLadderIndex,
    source: SOURCE,
  }
}

module.exports = {
  evaluate,
  bucketForAge,
  ageFromBirthYear,
  netWorthFenOf,
  AGE_BUCKETS,
  SOURCE,
}
