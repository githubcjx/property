const app = getApp()
const { APP_VERSION } = require('../../utils/version.js')

Page({
  data: {
    version: APP_VERSION,
    statusBarHeight: 20,
    reduceMotion: false,
    theme: 'aurora',
    // 版本由提交记录归并而来,自新到旧排列
    releases: [
      {
        version: 'V1.6.2',
        date: '2026-06',
        title: '晒成绩',
        items: [
          '「财务体检」新增「晒一晒」：一键生成你的财务健康分卡片，可发给朋友，或保存海报去朋友圈',
          '分享卡默认隐藏所有金额，只晒分数、等级与达标项，金额是否露出由你一键切换',
          '支持把小程序分享到朋友圈（点右上角菜单 → 分享到朋友圈）',
        ],
      },
      {
        version: 'V1.6.1',
        date: '2026-06',
        title: '纸币配色 & 取数修复',
        items: [
          '新增「人民币纸币配色系列」6 套主题：不焦绿 / 绝绝紫 / 不摆蓝 / 糖太棕 / 放青松 / 发财红，按面值排序，到「主题」里挑一套换心情',
          '修复：账户或交易记录较多时，变动归因、近 30 天变化、趋势图、里程碑的金额可能算错，现已校正',
        ],
      },
      {
        version: 'V1.6',
        date: '2026-05',
        title: '资产洞察',
        highlight: true,
        items: [
          '新增「资产洞察」：环形图看清流动 / 投资 / 固定 / 负债的资产构成与占比，及最大单一资产集中度',
          '「变动归因」：按本月 / 近 30 天 / 今年，拆解净资产涨跌分别由哪些账户贡献',
        ],
      },
      {
        version: 'V1.5',
        date: '2026-05',
        title: '同龄对标 & 工具中心',
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
      theme: app.globalData.theme,
    })
  },

  onShow() {
    this.setData({ reduceMotion: app.globalData.reduceMotion, theme: app.globalData.theme })
  },

  onBack() {
    wx.navigateBack()
  },
})
