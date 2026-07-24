// 冷启动「快速开始」的常见账户菜单。
// 每条 = 一次 addAccount 的入参骨架（categoryId / subType / icon / name），不含金额
//   —— 金额由用户在引导第三屏真实录入，绝不预置（数据诚实，见 CLAUDE.md 不变量 10）。
// subType / icon 对齐 utils/categories.js；无专属子类的（余额宝/理财/定期/花呗…）落到最近大类的 'other'。
// 应收款(receivable)故意不进快捷菜单 —— 首次很少用，走「手动添加」。

const QUICK_ACCOUNTS = [
  { section: '平时能花的', items: [
    { key: 'cash',     name: '现金',     categoryId: 'liquid',     subType: 'cash',   icon: 'cash' },
    { key: 'alipay',   name: '支付宝',   categoryId: 'liquid',     subType: 'alipay', icon: 'alipay' },
    { key: 'wechat',   name: '微信零钱', categoryId: 'liquid',     subType: 'wechat', icon: 'wechat' },
    { key: 'bank',     name: '银行卡',   categoryId: 'liquid',     subType: 'bank',   icon: 'bank' },
    { key: 'yuebao',   name: '余额宝',   categoryId: 'liquid',     subType: 'other',  icon: 'wallet' },
  ]},
  { section: '钱生钱的', items: [
    { key: 'fund',     name: '基金',     categoryId: 'investment', subType: 'fund',   icon: 'fund' },
    { key: 'stock',    name: '股票',     categoryId: 'investment', subType: 'stock',  icon: 'stock' },
    { key: 'licai',    name: '理财',     categoryId: 'investment', subType: 'other',  icon: 'fund' },
    { key: 'deposit',  name: '定期存款', categoryId: 'investment', subType: 'other',  icon: 'fund' },
  ]},
  { section: '大件', items: [
    { key: 'house',    name: '房产',     categoryId: 'fixed',      subType: 'house',  icon: 'house' },
    { key: 'car',      name: '汽车',     categoryId: 'fixed',      subType: 'car',    icon: 'car' },
  ]},
  { section: '欠的钱', items: [
    { key: 'credit',   name: '信用卡',   categoryId: 'debt',       subType: 'credit', icon: 'credit' },
    { key: 'huabei',   name: '花呗',     categoryId: 'debt',       subType: 'credit', icon: 'credit' },
    { key: 'mortgage', name: '房贷',     categoryId: 'debt',       subType: 'loan',   icon: 'loan' },
    { key: 'carloan',  name: '车贷',     categoryId: 'debt',       subType: 'loan',   icon: 'loan' },
  ]},
]

module.exports = { QUICK_ACCOUNTS }
