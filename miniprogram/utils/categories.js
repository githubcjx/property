// 5 大类 + 内置子类（按 PRD 2.1 / 3.1）
// 负债大类在净资产计算时取负值；其它大类相加。
//
// 子类的 icon 字段是「图标键名」，对应 app.wxss 中的 .ic-<key> 类。
// 渲染时使用：<view class="ic ic-{{icon}}"></view>

const CATEGORIES = [
  {
    id: 'liquid',
    name: '流动资金',
    color: '#34D399',
    colorClass: 'liquid',
    icon: 'wallet',
    desc: '现金 / 储蓄 / 货币基金等',
    subTypes: [
      { id: 'cash',    name: '现金',     icon: 'cash' },
      { id: 'alipay',  name: '支付宝',   icon: 'alipay' },
      { id: 'wechat',  name: '微信',     icon: 'wechat' },
      { id: 'bank',    name: '银行卡',   icon: 'bank' },
      { id: 'other',   name: '其他',     icon: 'folder', custom: true },
    ],
  },
  {
    id: 'investment',
    name: '投资',
    color: '#A78BFA',
    colorClass: 'investment',
    icon: 'chart',
    desc: '基金 / 股票 / 其他投资',
    subTypes: [
      { id: 'fund',  name: '基金', icon: 'fund' },
      { id: 'stock', name: '股票', icon: 'stock' },
      { id: 'other', name: '其他', icon: 'folder', custom: true },
    ],
  },
  {
    id: 'fixed',
    name: '固定资产',
    color: '#B7E8F0',
    colorClass: 'fixed',
    icon: 'house',
    desc: '房产 / 车辆等长期资产',
    subTypes: [
      { id: 'house',  name: '房产', icon: 'house' },
      { id: 'car',    name: '汽车', icon: 'car' },
      { id: 'other',  name: '其他', icon: 'folder', custom: true },
    ],
  },
  {
    id: 'receivable',
    name: '应收款',
    color: '#60A5FA',
    colorClass: 'receivable',
    icon: 'handshake',
    desc: '他人欠款 / 待收款项',
    subTypes: [
      { id: 'lend',  name: '他人欠款', icon: 'handshake' },
      { id: 'other', name: '其他',     icon: 'folder', custom: true },
    ],
  },
  {
    id: 'debt',
    name: '负债',
    color: '#F87171',
    colorClass: 'debt',
    icon: 'debt',
    desc: '贷款 / 信用卡 / 借款',
    subTypes: [
      { id: 'loan',   name: '贷款',   icon: 'loan' },
      { id: 'credit', name: '信用卡', icon: 'credit' },
      { id: 'other',  name: '其他',   icon: 'folder', custom: true },
    ],
  },
]

const CATEGORY_MAP = CATEGORIES.reduce((m, c) => {
  m[c.id] = c
  return m
}, {})

// 已知图标键名集合，用于区分老数据（emoji 字符串）与新数据（图标键名）。
const KNOWN_ICONS = [
  'cash', 'alipay', 'wechat', 'bank',
  'fund', 'stock', 'house', 'car',
  'handshake', 'debt', 'loan', 'credit',
  'folder', 'wallet',
]

function isIconKey(s) {
  return typeof s === 'string' && KNOWN_ICONS.indexOf(s) !== -1
}

function getCategory(categoryId) {
  return CATEGORY_MAP[categoryId] || null
}

function getSubType(categoryId, subTypeId) {
  const cat = getCategory(categoryId)
  if (!cat) return null
  return cat.subTypes.find(s => s.id === subTypeId) || null
}

function isDebtCategory(categoryId) {
  return categoryId === 'debt'
}

module.exports = {
  CATEGORIES,
  CATEGORY_MAP,
  KNOWN_ICONS,
  isIconKey,
  getCategory,
  getSubType,
  isDebtCategory,
}
