const app = getApp()
const echarts = require('../../ec-canvas/echarts')
const chartSvc = require('../../../../services/chart.js')

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
    customStart: '',
    customEnd: '',

    summary: { rangeText: '', lines: [] },
    loading: true,
    hasData: false,
    hideAmount: false,

    ec: {
      lazyLoad: true,
    },
  },

  // 非 setData 状态
  _chart: null,
  _pendingOption: null,
  _seriesData: null,
  _fullSummary: null,

  onLoad() {
    pageRef = this
    this.setData({ hideAmount: app.globalData.hideAmount })
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
      this._fullSummary = data.summary
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

  buildOption(data, tabKey, hide) {
    const yFormatter = hide
      ? () => '***'
      : (v) => {
          const n = Math.round(v / 100)
          if (Math.abs(n) >= 10000) return '¥' + (n / 10000).toFixed(1) + 'w'
          return '¥' + n
        }

    const tooltipFormatter = hide
      ? () => '****'
      : (params) => {
          const lines = [params[0].axisValue]
          for (const p of params) {
            const fen = p.data
            const yuan = Math.round(fen / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
            lines.push(`${p.marker} ${p.seriesName}: ¥${yuan}`)
          }
          return lines.join('\n')
        }

    let series
    if (tabKey === 'net') {
      series = [
        {
          name: '净资产',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          showSymbol: false,
          data: data.series.netWorth,
          lineStyle: { color: '#FFFFFF', width: 2 },
          itemStyle: { color: '#FFFFFF' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(255,255,255,0.18)' },
                { offset: 1, color: 'rgba(255,255,255,0)' },
              ],
            },
          },
        },
        {
          name: '负债',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          showSymbol: false,
          data: data.series.debt,
          lineStyle: { color: '#F87171', width: 1.5 },
          itemStyle: { color: '#F87171' },
        },
      ]
    } else {
      series = [
        {
          name: '流动资金',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          showSymbol: false,
          data: data.series.liquid,
          lineStyle: { color: '#34D399', width: 2 },
          itemStyle: { color: '#34D399' },
        },
        {
          name: '投资',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          showSymbol: false,
          data: data.series.investment,
          lineStyle: { color: '#A78BFA', width: 2 },
          itemStyle: { color: '#A78BFA' },
        },
      ]
    }

    return {
      backgroundColor: 'transparent',
      grid: { left: 6, right: 12, top: 32, bottom: 24, containLabel: true },
      legend: {
        textStyle: { color: 'rgba(235,235,245,0.8)', fontSize: 11 },
        top: 0,
        right: 0,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#2C2C2E',
        borderWidth: 0,
        textStyle: { color: '#FFFFFF', fontSize: 12 },
        formatter: tooltipFormatter,
      },
      xAxis: {
        type: 'category',
        data: data.xLabels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
        axisTick: { show: false },
        axisLabel: {
          color: 'rgba(235,235,245,0.5)',
          fontSize: 10,
          interval: 'auto',
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: 'rgba(235,235,245,0.5)',
          fontSize: 10,
          formatter: yFormatter,
        },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      },
      series,
    }
  },

  // ============== 交互 ==============

  applySummaryByTab(tabKey) {
    const full = this._fullSummary
    if (!full || !full.metrics) {
      this.setData({ summary: { rangeText: '', lines: [] } })
      return
    }
    const lines = tabKey === 'net'
      ? [full.metrics.netWorth.text, full.metrics.debt.text]
      : [full.metrics.liquid.text, full.metrics.investment.text]
    this.setData({ summary: { rangeText: full.rangeText, lines } })
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
