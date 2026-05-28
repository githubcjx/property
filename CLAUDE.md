# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

微信小程序「净值本」— a personal net-worth tracker. Native WeChat Mini Program (no React/Taro), using the `glass-easel` component framework. The backend is entirely **WeChat Cloud Development (云开发 / `wx.cloud`)** — there is no custom server. UI strings and code comments are in Chinese.

## Build / run / deploy

There is **no npm build, lint, or test tooling for the mini program** (`nodeModules: false` in `project.config.json`). All development happens inside **微信开发者工具 (WeChat DevTools)**:

- **Run/preview**: open the project root in WeChat DevTools and click 编译 (Compile). See `README.md` for first-time setup (importing the project, opening 云开发, creating the `accounts`/`transactions` collections and their indexes).
- **Cloud env ID** lives at the top of `miniprogram/app.js` (`CLOUD_ENV_ID`) — already set to a real environment; not a placeholder.
- **Cloud function** (`cloudfunctions/reminderSend/`) is the only place with npm deps: `cd cloudfunctions/reminderSend && npm install`. Deploy via DevTools → 云开发 → right-click the function → 上传并部署. It is **not** part of the mini-program runtime — see its own `README.md`. Secrets (`MP_APPID`/`MP_APPSECRET`) come from cloud-function env vars, never hardcoded. Its cron in `config.json` is in **UTC** (北京时间 − 8h).

## Architecture & invariants

These are the cross-cutting rules that aren't obvious from any single file. Violating them silently corrupts financial data, so keep them consistent across the whole codebase.

**1. Money is integer 分 (cents), everywhere.** `balance`, `amount`, `balanceAfter` are always integer fen in the DB, in services, and in page logic. Convert to yuan **only** at the UI boundary via `miniprogram/utils/format.js` (`fenToYuan` / `yuanToFen` / `formatYuan` / `formatCNY` / `formatDelta`). Never do `/100` or `* 100` ad hoc.

**2. All DB access goes through the services layer.** `miniprogram/services/cloud.js` is the single accessor for the DB handle, command, the two collections, and `serverDate()`. Every other service requires it; pages call services, **never** `wx.cloud.database()` directly. Two collections, both user-isolated by `_openid` (auto): `accounts` and `transactions`. Deletion of accounts is **soft** (`isHidden: true`).

**3. Balance changes always write an account update *and* append a transaction.** `account.js` `setBalance`/`deltaBalance` update `accounts.balance` and append a `transactions` doc (`type: 'set'|'delta'`, with the post-change `balanceAfter` snapshot). When a transaction is later edited/deleted (`transaction.js`), the linked account's balance is adjusted by the diff, but **other historical transactions' `balanceAfter` are frozen snapshots and are deliberately not recomputed.**

**4. Net-worth math is duplicated by design — keep all copies in sync.** The rule (assets `liquid`/`investment`/`fixed`/`receivable` add, `debt` subtracts, and **only accounts with `includeInChart !== false` count**) is re-implemented in `index.js`, `stats.js`, `chart.js`, `health.js`, `milestones.js`, and `benchmark.js`. The canonical debt test is `isDebtCategory()` from `utils/categories.js`. If you change the rule, change it in all of them.

**5. Time-series = balance snapshots, current point = live balance.** `chart.js`, `stats.js`, and `milestones.js` reconstruct historical net worth by taking, for each time node, each account's most-recent `transaction.balanceAfter` at-or-before that node. The latest/"current" node instead reads the live `account.balance` (authoritative) so charts agree with the home screen. Cloud DB returns dates in several shapes (`Date` / number / string / `{$date}`); each service has a `toMs`/`toDate` helper to normalize — reuse that pattern, don't assume `Date`.

**6. Categories are the domain model.** `utils/categories.js` `CATEGORIES` is the source of truth: 5 fixed top categories, each with subTypes. Account `icon` is an **icon-key string** (e.g. `cash`, `house`) mapped to a `.ic-<key>` CSS class in `app.wxss` — not an emoji. `isIconKey()` distinguishes new icon-key data from legacy emoji strings; fall back to `folder` when unknown.

**7. Cross-page state via `getApp().globalData`.** Privacy toggle `hideAmount` (persisted to storage, hides all amounts as `****`), plus `reduceMotion` and `cloudReady`. Pages re-read these in `onShow` to stay in sync. Toggle through `app.toggleHideAmount()` / `app.setReduceMotion()`, not by mutating globalData directly.

**8. The trend chart is a subpackage.** `subpackages/chart-pkg/` bundles ECharts (~1MB) under `ec-canvas/` and is preloaded after the home page (`preloadRule` in `app.json`). If `ec-canvas/echarts.js` is missing in a fresh checkout, see the README's offline section.

## Pages

`pages/`: `index` (home — net worth + category groups + a 工具/tools panel), `add-account`, `account-detail`, `transaction-detail`, `settings`, `about`, `health` (财务体检, scoring in `services/health.js`), `milestones` (里程碑, `services/milestones.js`), `peer-benchmark` (同龄对标, `services/benchmark.js`). The trend chart is `subpackages/chart-pkg/pages/chart`. Reusable components live in `components/` (`amount-input`, `account-card`, `category-header`).

> Note: `benchmark.js`'s age-bucketed distribution (`AGE_BUCKETS`) is **placeholder data** (`SOURCE.isPlaceholder: true`), not authoritative — preserve the structure but don't treat the numbers as real. The README's "当前进度" section is stale (settings/health/milestones/peer-benchmark and the reminder cloud function already exist).
