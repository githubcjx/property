# reminderSend · 每月记账提醒群发

订阅号每月一次群发记账提醒。每月 25 日 21:00（北京时间）由定时器触发。

## 部署步骤

### 1. 上传云函数

微信开发者工具 → 云开发面板 → 云函数 → 右键 `reminderSend` → 上传并部署：云端安装依赖

### 2. 配置环境变量（关键）

云开发控制台 → 云函数 → reminderSend → 配置 → 环境变量，新增：

| 变量名 | 值 | 来源 |
|---|---|---|
| `MP_APPID` | 你的订阅号 AppID | 公众号后台 → 设置与开发 → 基本配置 |
| `MP_APPSECRET` | 你的订阅号 AppSecret | 同上（第一次需要点"生成"） |

**不要把 AppSecret 写进代码或提交到 git！**

### 3. 配置 IP 白名单

公众号后台 → 设置与开发 → 基本配置 → IP 白名单，把云函数的出口 IP 加进去。
云函数 IP 可在云开发控制台 → 云函数 → reminderSend → 详情里看到。

### 4. 验证

云开发控制台 → 云函数 → reminderSend → 测试 → 直接调用一次，看 `reminderLogs` 集合里有没有写一条 `success: true` 的记录。

如果失败，常见原因：
- `errcode 40164`：IP 白名单没配
- `errcode 45028`：当天群发次数用完（订阅号 1 次/天）
- `errcode 40001`：AppSecret 错了
- `errcode 45047`：粉丝数 < 100，无法群发（订阅号要求至少 100 个粉丝）

### 5. 定时触发器

`config.json` 里的 cron `0 0 21 25 * * *` 表示每月 25 日 21:00 触发。
注意：**云函数定时器默认是 UTC 时间**，要发北京时间 21:00 → cron 写 `0 0 13 25 * * *`（21:00 - 8h = 13:00 UTC）。

修改 `config.json` 后重新部署生效。

## 提醒文案

文案在 `index.js` 顶部 `REMIND_TEXT` 常量。改完重新部署即可。

## 数据库

执行结果会写入 `reminderLogs` 集合，字段：
- `triggeredAt`：触发时间
- `success`：是否成功
- `wxResult`：微信 API 返回
- `error`：失败原因（如果有）
- `source`：`cron` 或 `manual`

`wx_meta` 集合保存 access_token 缓存：
- 文档 ID：`mp_access_token`
- 字段：`token`、`expireAt`

两个集合需要在云开发控制台预先创建（首次写入会自动创建）。
