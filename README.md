# 净资产追踪小程序

微信小程序 · 个人净资产快照工具。每月一次更新各账户余额，自动计算净资产并展示分类汇总。

## 项目结构

```
property/
├── project.config.json          # 工程配置
├── miniprogram/                 # 小程序源码
│   ├── app.js / app.json / app.wxss
│   ├── pages/                   # index / add-account / account-detail / transaction-detail
│   ├── components/              # amount-input / account-card / category-header
│   ├── services/                # cloud / account / transaction（云开发数据访问）
│   └── utils/                   # categories / format / date
└── cloudfunctions/              # 云函数目录（MVP 暂未使用）
```

## 资源文件 · 分享小程序码

分享卡 / 海报右下角的小程序码是一张**静态图片**：`miniprogram/assets/share-qr_430.jpg`。

- 必须是**永久有效**的小程序码（`mp.weixin.qq.com` → 小程序码/推广生成），**指向首页** `pages/index/index`，建议方形、白底、≥280px。
- 引用位置：`pages/health/health.js` 的 `buildShareCard()` 里 `qr: '/assets/share-qr_430.jpg'`（换图改这里）。
- 文件缺失或加载失败时，分享卡会**优雅回退**为「微信搜索『净值本』」文字，不报错。
- 局限：静态码无法携带 `scene`，统计不到分享归因；将来需要归因时改用云函数动态码（`wxacode.getUnlimited`），只需把 `card.qr` 换成动态生成的临时图路径。

## 原型与数据诚实（重要约定）

**页面上出现的每一个数字，都必须来自小程序真实存储或能真实算出的数据，绝不捏造。** 这条同时约束正式功能和 `prototypes/` 里的原型稿：

- 画原型页时，**不要**使用当前数据模型存不了、也算不出来的指标当页面元素（例如凭空的"超过 X% 同龄人""上月分 ↑3"）。算不出来就改设计，而不是编一个数。
- 已知占位数据：同龄对标 `benchmark.js` 的年龄分布是 `isPlaceholder` 占位值，**不是真实数据**，不能拿来做结论或分享内容。
- 健康分是**实时计算、不存储**的（`services/health.js`）；历史/环比分由 `health.evaluateAt(accounts, dateMs)` 用 `balanceAfter` 快照**重算**得到（无可比历史时返回 `null`，页面隐藏环比而非编造）。

## 启动步骤

### 1. 安装并打开微信开发者工具
下载地址：<https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html>

### 2. 导入项目
- 「项目 → 导入项目」选择本目录 `D:\Project\property`
- AppID：使用自有 AppID 或选择「测试号」（注意：测试号无法使用云开发，需使用自有 AppID）

### 3. 开通云开发
- 顶部工具栏点击「云开发」按钮 → 创建免费环境（按提示开通即可）
- 复制环境 ID（envId），形如 `cloud1-xxx`

### 4. 填写 envId
打开 `miniprogram/app.js`，将顶部 `CLOUD_ENV_ID` 常量替换为你的环境 ID：

```js
const CLOUD_ENV_ID = '<YOUR_ENV_ID>'  // ← 替换为云开发环境 ID
```

### 5. 初始化云数据库

在「云开发控制台 → 数据库」中创建以下两个集合并配置权限：

| 集合名 | 权限 | 说明 |
|---|---|---|
| `accounts` | 仅创建者可读写 | 账户数据 |
| `transactions` | 仅创建者可读写 | 变动记录 |

**索引建议**（控制台 → 数据库 → 集合 → 索引管理）：

- `accounts`：联合索引 `_openid:1, categoryId:1, isHidden:1`
- `transactions`：联合索引 `_openid:1, accountId:1, createdAt:-1`

### 6. 编译运行

点击「编译」按钮。第一次进入应能看到「我的净资产 (CNY) ¥0.00」与空态引导。

## 数据模型

### accounts 集合

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动生成 |
| `_openid` | string | 用户隔离 |
| `categoryId` | string | `liquid` / `investment` / `fixed` / `receivable` / `debt` |
| `subType` | string | 子类型（cash / alipay / stock / fund / ...，或 `other`） |
| `name` | string | 账户名（默认子类名） |
| `balance` | number | 余额（**整数分**） |
| `includeInChart` | boolean | 是否计入图表，默认 true |
| `note` | string | 备注 |
| `icon` | string | 图标（emoji 占位） |
| `colorTheme` | string | 颜色（继承自大类） |
| `createdAt` | Date | |
| `updatedAt` | Date | 最近余额更新时间 |
| `isHidden` | boolean | 软删除标记 |

### transactions 集合

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 自动生成 |
| `_openid` | string | 用户隔离 |
| `accountId` | string | 关联账户 |
| `type` | string | `set`（修改余额） / `delta`（增减金额） |
| `amount` | number | 变动金额（正负，单位**分**） |
| `balanceAfter` | number | 变动后余额（**分**） |
| `note` | string | 备注 |
| `createdAt` | Date | 记录时间 |

## 当前进度

- ✅ MVP：账户管理、修改/增减余额、变动记录列表、左滑删除、隐藏金额、软删除
- ✅ V1.1：趋势页（折线图、双 Tab、5 段时间筛选、文字摘要）
- ⏳ V2.0：TabBar、数据导出

## V1.1 趋势页

入口：首页右上角「📈」按钮 → 进入趋势页（位于分包 `subpackages/chart-pkg/`）。

- **双 Tab**：净资产 / 负债 ⇄ 流动资金 / 投资
- **时间范围**：30 天 / 6 月 / 1 年（默认）/ 年初至今 / 自定义起止日期
- **文字摘要**：本段期间净资产与负债的变化金额 + 百分比
- **隐私联动**：首页 👁 切换后，趋势页的 Y 轴标签与摘要金额同步显示为 `***`

技术细节：
- ECharts 通过 `subpackages/chart-pkg/ec-canvas/` 引入，约 1MB，按 PRD 7.3 放入分包
- `app.json` 配置了 `preloadRule`，首页加载完成后空闲预下载分包
- 数据来源：复用 MVP 的 `accounts` / `transactions` 集合，按时间节点取每个账户的最近 `balanceAfter` 作为快照
- 单字段索引建议：`transactions.createdAt`（趋势查询常按 createdAt 过滤；联合索引 `(_openid, accountId, createdAt DESC)` 已能覆盖大部分场景）

### V1.1 离线开发

如果首次拉取的环境无法访问 jsdelivr/github raw，需手动放置以下 6 个文件到 `miniprogram/subpackages/chart-pkg/ec-canvas/`：

- `ec-canvas.{js,json,wxml,wxss}` 和 `wx-canvas.js`：从 [echarts-for-weixin](https://github.com/ecomfe/echarts-for-weixin/tree/master/ec-canvas) 拷贝
- `echarts.js`：[echarts@5.5.1 dist/echarts.min.js](https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js) 改名后放入
