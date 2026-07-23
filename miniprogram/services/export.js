// 数据导出（V2.0）：把账户与变动记录导出成 CSV，经微信会话转发给自己。
//
// 口径：
//   · 只导出未删除的账户，以及这些账户名下的变动记录。软删除账户（isHidden）
//     及其历史交易不导出 —— 所以导出文件不足以逐日重建历史净值，它是「当前资产的
//     完整流水」而非「数据库全量快照」。
//   · 金额一律换算成「元」等主单位输出（按币种小数位，日元 0 位），不导出内部的分。
//
// CSV 三个必须处理的细节，改动时别删：
//   1. 文件以 UTF-8 BOM 开头 —— Excel 在中文 Windows 下默认按 GBK 解析 CSV，
//      无 BOM 会整篇乱码。这与源码「禁止 BOM」的约定相反，是有意为之。
//   2. 字段含逗号/引号/换行时用双引号包裹、内部引号翻倍，否则列会整体错位。
//   3. 以 = + - @ 开头的字段前补一个空格，否则 Excel 会把备注当公式执行。

const cloud = require('./cloud.js')
const { getCategory, getSubType } = require('../utils/categories.js')
const { fenToUnit } = require('../utils/format.js')
const { valueCnyFen } = require('../utils/networth.js')
const { toDate } = require('../utils/date.js')

// 用转义而非字面量：BOM 是零宽字符，直接写在源码里看不见，容易被编辑器或格式化工具吃掉
const BOM = '\uFEFF'

// ---------- CSV 基础 ----------

// 纯数字（含负号/小数）直接放行：它在 Excel 里就是数字，不构成公式注入；
// 反过来若给 -1234.56 加前导空格防注入，Excel 会把它当文本，负数金额就没法求和了。
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/

function csvCell(v) {
  if (v === null || v === undefined) return ''
  let s = String(v)
  // Excel 公式注入防护：= + - @ 开头的「非纯数字」文本前补空格，避免备注被当公式执行
  if (/^[=+\-@]/.test(s) && !PLAIN_NUMBER.test(s)) s = ' ' + s
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'
  return s
}

function csvRow(cells) {
  return cells.map(csvCell).join(',')
}

function buildCsv(header, rows) {
  const lines = [csvRow(header)]
  for (const r of rows) lines.push(csvRow(r))
  return BOM + lines.join('\r\n') + '\r\n'
}

// ---------- 格式化 ----------

function pad2(n) { return n < 10 ? '0' + n : '' + n }

function fmtDateTime(d) {
  const date = toDate(d)
  if (!date || isNaN(date.getTime())) return ''
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
    + ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes())
}

// 分 → 主单位数值字符串（按币种小数位；不加千分位，方便 Excel 当数字识别）
function money(fen, ccy) {
  if (fen === null || fen === undefined) return ''
  return String(fenToUnit(fen, ccy || 'CNY'))
}

function catNames(acc) {
  const cat = getCategory(acc.categoryId)
  const st = getSubType(acc.categoryId, acc.subType)
  return {
    cat: cat ? cat.name : (acc.categoryId || ''),
    sub: st ? st.name : (acc.subType || ''),
  }
}

// ---------- 取数 ----------

async function fetchAccounts() {
  return cloud.getAll(() => cloud.accounts()
    .where({ isHidden: false })
    .orderBy('createdAt', 'asc'))
}

async function fetchTransactions() {
  return cloud.getAll(() => cloud.transactions().orderBy('createdAt', 'asc'))
}

// ---------- 两张表 ----------

const ACCOUNT_HEADER = [
  '账户名', '大类', '子类', '币种', '当前余额', '折人民币',
  '计入净值', '备注', '创建时间', '最后核对时间',
]

function accountRows(accounts) {
  return accounts.map((a) => {
    const ccy = a.currency || 'CNY'
    const n = catNames(a)
    return [
      a.name || '',
      n.cat,
      n.sub,
      ccy,
      money(a.balance || 0, ccy),
      money(valueCnyFen(a), 'CNY'),
      a.includeInChart === false ? '否' : '是',
      a.note || '',
      fmtDateTime(a.createdAt),
      fmtDateTime(a.checkedAt || a.updatedAt || a.createdAt),
    ]
  })
}

const TX_HEADER = [
  '时间', '账户', '大类', '子类', '币种', '类型',
  '变动金额', '变动后余额', '变动后折人民币', '当时汇率', '备注',
]

function transactionRows(accounts, txs) {
  // 只保留仍存在的账户的记录（已删除账户按约定不导出，孤儿记录一并跳过）
  const accMap = {}
  for (const a of accounts) accMap[a._id] = a

  const rows = []
  for (const t of txs) {
    const acc = accMap[t.accountId]
    if (!acc) continue
    const ccy = acc.currency || 'CNY'
    const n = catNames(acc)
    rows.push([
      fmtDateTime(t.createdAt),
      acc.name || '',
      n.cat,
      n.sub,
      ccy,
      t.type === 'set' ? '修改余额' : '增减金额',
      money(t.amount || 0, ccy),
      money(t.balanceAfter || 0, ccy),
      t.balanceAfterCnyFen != null ? money(t.balanceAfterCnyFen, 'CNY') : '',
      t.fxRate != null ? String(t.fxRate) : '',
      t.note || '',
    ])
  }
  return rows
}

// ---------- 对外入口 ----------

// kind: 'accounts' | 'transactions'
// 返回 { content, fileName, count }（count = 数据行数，不含表头）
async function build(kind) {
  const accounts = await fetchAccounts()
  if (kind === 'accounts') {
    const rows = accountRows(accounts)
    return {
      content: buildCsv(ACCOUNT_HEADER, rows),
      fileName: fileNameOf('账户清单'),
      count: rows.length,
    }
  }
  const txs = await fetchTransactions()
  const rows = transactionRows(accounts, txs)
  return {
    content: buildCsv(TX_HEADER, rows),
    fileName: fileNameOf('变动记录'),
    count: rows.length,
  }
}

function fileNameOf(label) {
  const d = new Date()
  const stamp = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate())
  return '净值本-' + label + '-' + stamp + '.csv'
}

// 写入临时文件并返回路径（微信只能从本地路径转发文件）
function writeTemp(fileName, content) {
  return new Promise((resolve, reject) => {
    const filePath = wx.env.USER_DATA_PATH + '/' + fileName
    wx.getFileSystemManager().writeFile({
      filePath,
      data: content,
      encoding: 'utf8',
      success: () => resolve(filePath),
      fail: reject,
    })
  })
}

module.exports = {
  build,
  writeTemp,
}
