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
  { key: 'custom', label: '自定义' },
]

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
    basis: 'nominal',       // 'nominal' 名义 | 'real' 真实(通胀调整)
    cpiLatest: '',
    realCoverage: true,
    customStart: '',
    customEnd: '',

    summary: { rangeText: '', lines: [] },
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
    // 设置默认自定义日期：近 7 天
    const now = new Date()
    const start = new Date(now.getTime() - 6 * 86400000)
    this.setData({
      customStart: this._fmtDate(start),
      customEnd: this._fmtDate(now),
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

  _fmtDate(d) {
    const y = d.getFullYear()
    const m = (d.getMonth() + 1).toString().padStart(2, '0')
    const day = d.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${day}`
  },

  // ============== 数据刷新 ==============

  async refresh() {
    this.setData({ loading: true })
    try {
      const opts = this.data.rangeKey === 'custom'
        ? { start: new Date(this.data.customStart), end: new Date(this.data.customEnd) }
        : null
      const data = await chartSvc.getChartSeries(this.data.rangeKey, opts)
      this._seriesData = data
      this._summaryNominal = data.summary
      this._summaryReal = data.summaryReal
      const hasData = data.series.netWorth.some(v => v !== 0)
        || data.series.debt.some(v => v !== 0)
        || data.series.liquid.some(v => v !== 0)
        || data.series.investment.some(v => v !== 0)
      this.setData({ hasData, cpiLatest: data.cpiLatest || '', realCoverage: data.realCoverage !== false })
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
    const option = this.buildOption(this._seriesData, this.data.tabKey, this.data.hideAmount, this.data.basis)
    if (this._chart) {
      this._chart.setOption(option, true)
    } else {
      this._pendingOption = option
    }
  },

  buildOption(data, tabKey, hide, basis) {
    // 真实口径：用通胀调整序列，并给系列名加「·真实」后缀（tooltip/图例可区分）
    const S = (basis === 'real' && data.seriesReal) ? data.seriesReal : data.series
    const sfx = basis === 'real' ? '·真实' : ''
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
    const full = this.data.basis === 'real' ? this._summaryReal : this._summaryNominal
    if (!full || !full.metrics) {
      this.setData({ summary: { rangeText: '', lines: [] } })
      return
    }
    const lines = tabKey === 'net'
      ? [full.metrics.netWorth.text, full.metrics.debt.text]
      : [full.metrics.liquid.text, full.metrics.investment.text]
    this.setData({ summary: { rangeText: full.rangeText, lines } })
  },

  onBasisTap(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.basis) return
    this.setData({ basis: key })
    this.applySummaryByTab(this.data.tabKey)
    this.renderChart()
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
    if (key !== 'custom') this.refresh()
  },

  onCustomStart(e) {
    this.setData({ customStart: e.detail.value })
    if (this.data.rangeKey === 'custom') this.refresh()
  },

  onCustomEnd(e) {
    this.setData({ customEnd: e.detail.value })
    if (this.data.rangeKey === 'custom') this.refresh()
  },
})
