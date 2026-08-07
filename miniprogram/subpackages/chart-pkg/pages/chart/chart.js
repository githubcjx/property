const app = getApp()
const echarts = require('../../ec-canvas/echarts')
const chartSvc = require('../../../../services/chart.js')
const accountSvc = require('../../../../services/account.js')
const allocationSvc = require('../../../../services/allocation.js')
const goalSvc = require('../../../../services/goal.js')
const { getTheme, isLight, DEFAULT_THEME } = require('../../../../utils/theme.js')
const { baseCurrency, cnyToBaseFen, sumNetCnyFen } = require('../../../../utils/networth.js')
const { symbolOf } = require('../../../../utils/currency.js')
const { formatMoney, fenToUnit } = require('../../../../utils/format.js')
const { goBack } = require('../../../../utils/nav.js')

// 环图摘要只列前几大类，超出的合成一行「其他」—— 这里是摘要，完整清单在资产配置页
const HUB_LEGEND_MAX = 4

// Tab 与时间范围常量
const TABS = [
  { key: 'net', label: '净资产 / 负债' },
  { key: 'flow', label: '流动 / 投资' },
]
const RANGES = [
  { key: '30d', label: '30天' },
  { key: '6m',  label: '6月' },
  { key: '1y',  label: '1年' },
  { key: 'ytd', label: '年初至今' },
]

// 物价累计涨幅低于这个数就不提通胀：区间太短时差异只有零点几个百分点，
// 说出来是噪音，不是洞察。1% 大约对应一年以上的区间。
const INFLATION_MIN_PCT = 1

// Page 实例引用，供 ec-canvas 初始化回调使用
let pageRef = null

function initChart(canvas, width, height, dpr) {
  const chart = echarts.init(canvas, null, {
    width: width,
    height: height,
    devicePixelRatio: dpr,
  })
  canvas.setChart(chart)
  if (pageRef) {
    pageRef._chart = chart
    if (pageRef._pendingOption) {
      chart.setOption(pageRef._pendingOption, true)
      pageRef._pendingOption = null
    }
  }
  return chart
}

Page({
  data: {
    tabs: TABS,
    ranges: RANGES,
    tabKey: 'net',
    rangeKey: '1y',

    summary: { rangeText: '', lines: [] },
    // 通胀那一句（够长的区间才有；见 _inflationLine）
    inflationLine: '',
    loading: true,
    hasData: false,
    hideAmount: false,
    reduceMotion: false,
    theme: DEFAULT_THEME,

    statusBarHeight: 20,

    // 回顾中枢（曲线下方的三块摘要）
    alloc: null,                    // { conicGradient, rows[] }；无数据时 null
    goal: { hasGoal: false },
    prevMonthLabel: '',

    ec: {
      lazyLoad: true,
    },
  },

  // 分享卡 / 订阅消息可能把用户直接丢到本页，此时页面栈只有一层，
  // navigateBack 会静默失败把人困住 —— 统一走 goBack（CLAUDE.md「二级页返回」约定）
  onBack() {
    goBack()
  },

  // 非 setData 状态
  _chart: null,
  _pendingOption: null,
  _seriesData: null,
  _fullSummary: null,

  onLoad() {
    pageRef = this
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      hideAmount: app.globalData.hideAmount,
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      statusBarHeight: sysInfo.statusBarHeight || 20,
    })
  },

  onReady() {
    // 初始化 ec-canvas
    const ecComp = this.selectComponent('#chart')
    if (ecComp) {
      ecComp.init(initChart)
    }
    this.refresh()
  },

  onShow() {
    app.applyThemeChrome()
    this.setData({
      reduceMotion: app.globalData.reduceMotion,
      theme: app.globalData.theme,
      hideAmount: app.globalData.hideAmount,
    })
    // 每次回到本页都重取：从目标页设完目标返回时，下面那块进度要立刻是新的
    this.loadHub()
  },

  onUnload() {
    pageRef = null
    this._chart = null
  },

  // ============== 数据刷新 ==============

  async refresh() {
    this.setData({ loading: true })
    try {
      const data = await chartSvc.getChartSeries(this.data.rangeKey)
      this._seriesData = data
      const hasData = data.series.netWorth.some(v => v !== 0)
        || data.series.debt.some(v => v !== 0)
        || data.series.liquid.some(v => v !== 0)
        || data.series.investment.some(v => v !== 0)
      this.setData({ hasData })
      this.applySummaryByTab(this.data.tabKey)
      this.renderChart()
    } catch (err) {
      console.error('chart refresh error', err)
      wx.showToast({ icon: 'none', title: '加载失败：' + (err.errMsg || err.message || '') })
    } finally {
      this.setData({ loading: false })
    }
  },

  // ============== 回顾中枢 ==============
  // 三块摘要都只读、只摘要，计算全部复用既有 service：
  // 构成走 allocation.evaluate，目标走 goal.buildGoalView，小结只是一个入口。
  // 任何一块拿不到数据都静默降级（隐藏该块），绝不影响主角曲线。
  async loadHub() {
    const now = new Date()
    const prevMonthNum = now.getMonth() === 0 ? 12 : now.getMonth()
    this.setData({ prevMonthLabel: prevMonthNum + ' 月' })

    let accounts = []
    try {
      accounts = await accountSvc.listAccounts()
    } catch (err) {
      console.warn('[hub] 账户加载失败，中枢降级隐藏', err)
      return
    }
    this.applyAlloc(allocationSvc.evaluate(accounts))
    this.loadGoal(accounts)
  },

  applyAlloc(r) {
    if (!r || !r.hasData || !r.assetCategories.length) {
      this.setData({ alloc: null })
      return
    }
    // 只取前 N 大类，其余合成「其他」—— 摘要不该把图例排到屏幕外
    const cats = r.assetCategories
    const head = cats.slice(0, HUB_LEGEND_MAX)
    const rows = head.map(c => ({
      id: c.id,
      name: c.name,
      colorClass: c.colorClass,
      pctText: c.pct.toFixed(1),
    }))
    if (cats.length > HUB_LEGEND_MAX) {
      const restPct = cats.slice(HUB_LEGEND_MAX).reduce((s, c) => s + c.pct, 0)
      rows.push({ id: '__rest', name: '其他', colorClass: 'receivable', pctText: restPct.toFixed(1) })
    }
    this.setData({ alloc: { conicGradient: r.conicGradient, rows } })
  },

  // 目标：只显示进度与「还差多少」。预计达成时间需要 growth 采样，那是目标页的事 ——
  // 这里传 null growth（与盘点完成页同一处理），卡片只承诺它算得出来的部分（不变量 10）。
  async loadGoal(accounts) {
    try {
      const goal = await goalSvc.getActiveGoal()
      if (!goal) {
        this.setData({ goal: { hasGoal: false } })
        return
      }
      const v = goalSvc.buildGoalView(goal, sumNetCnyFen(accounts), null)
      this.setData({
        goal: Object.assign({}, v, {
          pct: Math.max(0, Math.min(100, v.pct)).toFixed(1),
          remainingText: formatMoney(v.remainingFen, v.currency, { symbol: true }),
        }),
      })
    } catch (err) {
      // goals 集合还没建等情况：静默当作「未设目标」，引导仍在
      console.warn('[hub] 目标加载失败，按未设目标处理', err)
      this.setData({ goal: { hasGoal: false } })
    }
  },

  onOpenInsights() {
    wx.navigateTo({ url: '/pages/insights/insights' })
  },
  onOpenGoal() {
    wx.navigateTo({ url: '/pages/milestones/milestones' })
  },
  onOpenReport() {
    wx.navigateTo({ url: '/pages/report/report' })
  },

  // ============== ECharts 渲染 ==============

  renderChart() {
    if (!this._seriesData) return
    const option = this.buildOption(this._seriesData, this.data.tabKey, this.data.hideAmount)
    if (this._chart) {
      this._chart.setOption(option, true)
    } else {
      this._pendingOption = option
    }
  },

  // 曲线永远只有一条口径（名义）。通胀不再是一个模式，而是摘要里的一句话
  // （见 _inflationLine）—— 一条曲线，不让用户先选镜头再看图。
  buildOption(data, tabKey, hide) {
    const S = data.series
    const sfx = ''
    const t = getTheme(app.globalData.theme)
    // 浅色主题：主题可指定 chartAccent（如信号黄在纸底上偏浅，改用 accent-2 蓝）；
    // 轴文字/图例/负债线原为写死浅色，浅底下改墨色（canvas 取不到 CSS 变量）
    const light = isLight(app.globalData.theme)
    const accent = t.chartAccent || t.accent
    const accentRgb = t.chartAccentRgb || t.accentRgb
    const invest = t.investment
    const axisInk = light ? 'rgba(20,17,11,0.55)' : 'rgba(245,248,255,0.5)'
    const legendInk = light ? 'rgba(20,17,11,0.78)' : 'rgba(245,248,255,0.78)'
    const axisLine = light ? 'rgba(20,17,11,0.18)' : 'rgba(255,255,255,0.12)'
    const splitLine = light ? 'rgba(20,17,11,0.08)' : 'rgba(255,255,255,0.06)'
    const debtColor = light ? '#e5382b' : '#ffb3b3'
    const debtRgb = light ? '229,56,43' : '255,179,179'

    // series 内部是人民币分（历史重建口径），显示时折算到本位币
    const baseCcy = baseCurrency()
    const baseSym = symbolOf(baseCcy)

    const yFormatter = hide
      ? () => '***'
      : (v) => {
          const n = Math.round(fenToUnit(cnyToBaseFen(v), baseCcy))
          if (Math.abs(n) >= 10000) return baseSym + (n / 10000).toFixed(1) + 'w'
          return baseSym + n
        }

    const tooltipFormatter = hide
      ? () => '****'
      : (params) => {
          const lines = [params[0].axisValue]
          for (const p of params) {
            const text = formatMoney(cnyToBaseFen(p.data), baseCcy, { symbol: true })
            lines.push(`${p.marker} ${p.seriesName}: ${text}`)
          }
          return lines.join('\n')
        }

    let series
    if (tabKey === 'net') {
      series = [
        {
          name: '净资产' + sfx,
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          showSymbol: false,
          data: S.netWorth,
          lineStyle: { color: accent, width: 2, shadowColor: `rgba(${accentRgb},0.5)`, shadowBlur: 8 },
          itemStyle: { color: accent },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: `rgba(${accentRgb},0.38)` },
                { offset: 1, color: `rgba(${accentRgb},0)` },
              ],
            },
          },
        },
        {
          name: '负债' + sfx,
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          showSymbol: false,
          data: S.debt,
          lineStyle: { color: debtColor, width: 1.4 },
          itemStyle: { color: debtColor },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: `rgba(${debtRgb},0.18)` },
                { offset: 1, color: `rgba(${debtRgb},0)` },
              ],
            },
          },
        },
      ]
    } else {
      series = [
        {
          name: '流动资金' + sfx,
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          showSymbol: false,
          data: S.liquid,
          lineStyle: { color: accent, width: 2, shadowColor: `rgba(${accentRgb},0.4)`, shadowBlur: 6 },
          itemStyle: { color: accent },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: `rgba(${accentRgb},0.30)` },
                { offset: 1, color: `rgba(${accentRgb},0)` },
              ],
            },
          },
        },
        {
          name: '投资' + sfx,
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          showSymbol: false,
          data: S.investment,
          lineStyle: { color: invest, width: 1.6 },
          itemStyle: { color: invest },
        },
      ]
    }

    return {
      backgroundColor: 'transparent',
      grid: { left: 6, right: 12, top: 32, bottom: 24, containLabel: true },
      legend: {
        textStyle: { color: legendInk, fontSize: 11 },
        top: 0,
        right: 0,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(20, 22, 30, 0.92)',
        borderWidth: 0,
        textStyle: { color: '#f5f8ff', fontSize: 12 },
        formatter: tooltipFormatter,
      },
      xAxis: {
        type: 'category',
        data: data.xLabels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: axisLine } },
        axisTick: { show: false },
        axisLabel: {
          color: axisInk,
          fontSize: 10,
          interval: 'auto',
        },
      },
      yAxis: {
        type: 'value',
        min: 0,
        axisLabel: {
          color: axisInk,
          fontSize: 10,
          formatter: yFormatter,
        },
        splitLine: { lineStyle: { color: splitLine } },
      },
      series,
    }
  },

  // ============== 交互 ==============

  applySummaryByTab(tabKey) {
    const d = this._seriesData
    const full = d && d.summary
    if (!full || !full.metrics) {
      this.setData({ summary: { rangeText: '', lines: [] }, inflationLine: '' })
      return
    }
    const lines = (tabKey === 'net'
      ? [full.metrics.netWorth.text, full.metrics.debt.text]
      : [full.metrics.liquid.text, full.metrics.investment.text]
    ).map(t => this._maskAmounts(t))
    this.setData({
      summary: { rangeText: full.rangeText, lines },
      // 通胀只对净资产说一次，跟着「净资产/负债」这个 Tab 走
      inflationLine: tabKey === 'net' ? this._inflationLine(d) : '',
    })
  },

  // 摘要文案里的绝对金额要跟着隐私开关打码 —— 图表 y 轴与 tooltip 早就打码了，
  // 这段文字却一直是明文（「我的净资产增加了 214,000 元」），是个漏网。
  // 百分比保留：它是相对量，与分享卡「只含相对量、绝不含绝对金额」的口径一致。
  _maskAmounts(text) {
    if (!this.data.hideAmount) return text
    return String(text || '').replace(/[\d,]+ 元/g, '•••• 元')
  },

  // 通胀那一句。取代原来的「名义/真实」切换：
  // 不问用户想用哪种口径，直接把差额说出来 —— 而且只在差额真的存在时才说。
  // realDelta 来自 seriesReal（每个节点按 CPI 折成今日购买力，右端=今天），
  // 所以「实际增长」= 期末 − 折算后的期初，恒 ≤ 名义增长。
  _inflationLine(d) {
    if (!d || d.realCoverage === false) return ''            // 区间早于 CPI 数据，不臆造
    const rise = d.cpiRisePct || 0
    if (rise < INFLATION_MIN_PCT) return ''                  // 太短，说了是噪音
    const real = d.summaryReal && d.summaryReal.metrics && d.summaryReal.metrics.netWorth
    if (!real || real.start === 0) return ''                 // 期初无值，谈不上"扣掉通胀"
    const baseCcy = baseCurrency()
    const amt = this.data.hideAmount
      ? '••••'
      : formatMoney(Math.abs(cnyToBaseFen(real.delta)), baseCcy, { symbol: true })
    const verb = real.delta >= 0 ? '实际增长' : '实际减少'
    return `扣掉通胀，${verb} ${amt} · 同期物价 +${rise.toFixed(1)}%`
  },

  onTabTap(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.tabKey) return
    this.setData({ tabKey: key })
    this.applySummaryByTab(key)
    this.renderChart()
  },

  onRangeTap(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.rangeKey) return
    this.setData({ rangeKey: key })
    this.refresh()
  },
})
