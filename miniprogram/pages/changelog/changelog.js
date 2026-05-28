const app = getApp()

Page({
  data: {
    version: 'V1.5',
    statusBarHeight: 20,
    reduceMotion: false,
    themeClass: '',
    // 版本由提交记录归并而来,自新到旧排列
    releases: [
      {
        version: 'V1.5',
        date: '2026-05',
        title: '同龄对标 & 工具中心',
        highlight: true,
        items: [
          '新增「同龄对标」：按年龄段看你的净资产处在什么位置',
          '趋势 / 体检 / 里程碑 / 同龄对标 四个分析工具，收进首页单一「工具」入口',
          '金额隐藏状态跨页面、重启后都保持一致',
          '支持点击右上角菜单把小程序分享给朋友',
          '里程碑进度显示优化，避免回退时的遮蔽问题',
        ],
      },
      {
        version: 'V1.4',
        date: '2026-05',
        title: '财务洞察',
        items: [
          '新增「财务体检」：6 项权威家庭财务指标，给出评分与改善建议',
          '新增「里程碑」：7 个净资产关口，¥100 万为高光关，并对比达成速度',
        ],
      },
      {
        version: 'V1.3',
        date: '2026-05',
        title: '变动记录更新',
        items: [
          '变动记录可编辑；更新时间改为「3 天前」式相对显示',
        ],
      },
      {
        version: 'V1.2',
        date: '2026-05',
        title: 'UI主题更新',
        items: [
          '全新「冰玻璃」深色视觉：玻璃质感、光晕与流动动效',
        ],
      },
      {
        version: 'V1.1',
        date: '2026-05',
        title: '首个版本',
        items: [
          '新增「净值趋势」：折线图，净资产/负债 与 流动/投资 双 Tab，多种时间范围',
          '首页新增「过去 30 天」净资产变化',
          '账户子分类扩展并按类着色（现金 / 支付宝 / 基金 / 股票…）',
          '变动记录可编辑；更新时间改为「3 天前」式相对显示',
        ],
      },
    ],
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      reduceMotion: app.globalData.reduceMotion,
      themeClass: app.themeClass(),
    })
  },

  onShow() {
    this.setData({ reduceMotion: app.globalData.reduceMotion, themeClass: app.themeClass() })
  },

  onBack() {
    wx.navigateBack()
  },
})
