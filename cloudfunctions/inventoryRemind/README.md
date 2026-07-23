# inventoryRemind · 盘点提醒下发

每月 1 日北京时间 09:00 给「上次盘点后订阅了提醒」的用户下发一条微信订阅消息，
点开直接进盘点页。这是「一键盘点」月度循环的最后一环：盘点 → 订阅 → 下月提醒 → 再盘点。

> 这个云函数**不是小程序运行时的一部分**，小程序端不会调用它，它只被定时触发器唤起。

## 上线前必须做的三步

1. **选模板**：微信公众平台 → 小程序 → 订阅消息 → 公共模板库 → 搜「记账」「账单提醒」，
   选一个字段合适的模板，在「我的模板」里拿到模板 ID。
2. **填 ID（两处，必须一致）**：
   - `cloudfunctions/inventoryRemind/index.js` 的 `TEMPLATE_ID`
   - `miniprogram/utils/reminder.js` 的 `TEMPLATE_ID`

   小程序端未填时，盘点完成页显示「即将上线」且不会调订阅接口；云函数未填时直接返回
   `skipped`，不会报错。**两边都填上，功能才真正打开。**
3. **对齐字段**：按所选模板「详情」里的字段名改写 `index.js` 的 `buildData()`
   （`thing1` / `time2` / `phrase3` 之类，各模板不同）。字段名对不上微信会返回
   **47003 参数不匹配**，`thing` 类的值超过 20 个字符也会被拒。

## 部署

```bash
cd cloudfunctions/inventoryRemind && npm install
```

然后在微信开发者工具里右键该函数 → **上传并部署（云端安装依赖）**。

`config.json` 已声明：
- `permissions.openapi: ["subscribeMessage.send"]` —— 不声明会报无权限
- 定时触发器 `0 0 1 1 * * *`（秒 分 时 日 月 周 年）

**cron 是 UTC**，`时=1 日=1` 即每月 1 日 UTC 01:00 = **北京 09:00**。改时间记得减 8 小时。

## 数据

- 读 `reminders`：`{ _openid, pending, subscribedAt, lastSentAt }`。
  `pending: true` = 该用户手上有一次没用掉的订阅额度。
- 写 `remindLogs`：每次执行的 `{ runAt, total, sent, failed, errors, costMs }`，排查用。

**微信「一次性订阅」的额度调用即消耗**，所以本函数无论发送成功与否都会把 `pending`
置回 `false` —— 留着 `true` 下个月只会重复失败。用户下次盘点完成后会重新订阅。

## 手动验证

云开发控制台 → 云函数 → inventoryRemind → **测试运行**（空参数即可）。
返回 `{ ok, total, sent, failed }`；`skipped` 说明 `TEMPLATE_ID` 还没填。
自己先在小程序里盘点一次并同意订阅，就能收到那条提醒。
