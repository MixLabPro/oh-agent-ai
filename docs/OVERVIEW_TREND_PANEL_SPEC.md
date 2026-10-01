# Overview 用量趋势面板（今日逐小时堆叠 + 失败小时标记）SPEC v1.1

> **v1.1 重设计（2026-10-01，用户评审否决 v1.0）**：v1.0 的「当月逐日柱」在月初
> 只有一根孤柱，形态随日期剧烈变化，被判定为废形态。改为「今日逐小时 24 列」
> ——与用量页「当日按小时」同族形态，恒定 24 列、随时段累积，回答的是更即时的
> 问题（现在哪个时段在烧、哪个时段在炸）。失败标记同步从日粒度降到小时粒度
> （`opened_at_ms` 本就是毫秒时间戳）。小时 token 复用既有
> `read_hourly_distribution` 命令，不新增 token 读路径。

状态：**已实施**（2026-10-01，v1.1）。来源：落地页「产品演示」的概念图里有「按宿主堆叠的每日
用量柱状图 + 有连续失败的日期高亮」（`website/landing/index.html` demo 区，明确标注为模拟
数据）。真实应用一直没这个形态：用量在用量页是月历热图 + 当日小时柱，失败信号在总览发现
条 / 发现页。本 spec 把演示承诺的「一眼看到用量走势 + 哪天在反复失败」落成总览顶部的一个
真实数据面板。

## 1. 目标与非目标

**目标**
- 总览统计卡下方新增「用量趋势」面板：当月逐日堆叠柱（DSH / Claude Code / Codex 三段，
  token 高度），有反复失败类发现的日子加高亮标记。
- 每根日柱可点击，深链到当日会话（复用 R1 `sessionsDateHref`，不新增导航机制）。
- 失败日信号复用发现引擎的既有落库（`issue_instances`），零新 ingest、零 schema 变更。

**非目标**
- 不放任何金额（r6 红线：诊断/趋势信息不带钱；成本继续留在统计卡与决策区）。
- 不做本周/本月切换、不跨月滚动（面板跟随 `read_overview_details_snapshot` 的当月；跨月
  去用量页月历，那边已有完整导航）。
- 不重算「连续失败」语义——高亮忠实反映发现引擎已判定的问题日，不在查询层新造规则。

## 2. 失败日判定（数据契约）

**规则族**（与 `docs/AGENT_EXECUTION_PROBLEM_TAXONOMY.md` 注册的 trajectory 失败族一致）：
`SV611`（同一调用连续重复 ≥3 次）、`SV612`（turn 死循环）、`SV613`（进度停滞：连续
turn/工具失败），并兼容 legacy 规则名 `retry_loop`、`tool_failure`。列表是**规则级**而非
宿主级——不写宿主特化 SQL（数据完整性 watchlist 的 host-agnostic 要求）。

**计数语义**：某日 = 当天 `opened_at_ms` 落入该北京日的失败族 issue 实例数（含任意 status：
open / acknowledged / resolved / wontfix——标记表达「这天发生过反复失败」这一历史事实，用户
对单条 issue 的处置不抹掉历史）。`UNIQUE(machine_namespace, issue_type, instance_fingerprint)`
已在落库层去重，直接 COUNT 即可。

**日桶**：与用量日历同一条日界——北京日（`beijing_month_bounds_ms` 一致的 +8 边界），保证
失败标记与用量柱落在同一列，不会跨午夜错位。

**输出**：`read_overview_details_snapshot` 增加 `failure_days` 键：

```json
{ "month": "2026-10", "days": { "2026-10-01": 3, "2026-10-02": 1 } }
```

无数据日不出键；权威库不可用 → `null`（不是 `{}`——null 表示「读不到」，空对象表示
「读到了、零失败」，两者不得混同）。

## 3. 后端改动

1. `crates/agent-vitals-data/src/issues.rs` 新增
   `pub fn failure_days_month(conn: &Connection, month: &str) -> Option<Value>`：
   - `beijing_month_bounds_ms(month)` 取窗口（None → 返回 None，非法月份不猜）。
   - `SELECT opened_at_ms FROM issue_instances WHERE issue_type IN (…) AND opened_at_ms >= ? AND opened_at_ms < ?`。
   - Rust 侧按北京日分桶（`civil_date_from_days((ms + 8h).div_euclid(DAY_MS))`，与
     bounds 同一口径），组装 `{"month", "days": {date: count}}`。
2. `apps/desktop/src-tauri/src/lib.rs` `overview_details_snapshot_at`：在既有 revision 括号
   内追加 `"failure_days": db.map(...)`——与 monthly/daily/calendar 同一一致性窗口，不另开
   读路径、不加新 Tauri command。
3. Rust 测试（`issues.rs` tests，临时库）：
   - UTC 15:59 / 16:01（北京日界两侧）分别落入前后两天；
   - 非失败族规则（SV601、data_quality 类）不计入；
   - 非本月窗口不计入；`failure_days_month` 对非法月份返回 None。

## 4. 前端改动

1. `lib/tauri.ts`：`OverviewDetails.failure_days: Record<string, number> | null`；解析
   **容错降级**——键缺失或形状不对 → `null`，不抛错（失败标记坏不该连累 token 面板）。
2. `features/overview/OverviewPage.tsx` 新增 `TrendPanel`：
   - 位置：统计卡之后、月/日汇总面板之前（「放在总览上面一目了然」）。
   - 列：当月 1 日 → 今天（未来日不渲染）；高度 = 当日 total / 当月峰值；三段堆叠
     DSH（底）/ Claude Code / Codex（顶）。
   - 失败日：柱下橙色圆点 + 柱身描边；`failure_days` 为 null → 正常渲染柱、图例处诚实标注
     「失败标记不可用」；空对象 → 无标记（真零）。
   - 每柱 `<a href={sessionsDateHref(date)}>`，title/aria-label 含日期、各宿主 token、失败
     条数；零 token 且有失败的日子仍渲染标记点（诚实：没用量≠没失败）。
   - 月内零数据 → 诚实空态文案，不画假柱。
   - 图例：DSH / Claude Code / Codex / 有反复失败。
3. `lib/i18n.ts`：新增 `overview.trendTitle / trendFailureLegend / trendFailureUnavailable /
   trendEmpty / trendDayAria`（中英双语）。
4. `public/tauri-mock.js`：`read_overview_details_snapshot` 返回
   `failure_days: { [isoDay]: 2 }`（与 calendar 同样的月界守卫）。
5. CSS：`react/src/styles.css` 平铺类（`.overview-trend*`），沿用现有配色变量，无新依赖。

## 5. 红线自查

- r6：面板只有 token 与失败标记，无任何金额。✓
- 计费诚实：不涉及。✓
- 隐私/服务面：纯本地读，无网络、无 MCP、无导出变化。✓
- Golden/Python-Rust parity：不动 CLI/golden 面（Tauri bundle 新键，mock+契约覆盖）。✓
- 不 run rustfmt / 不整文件重排，diff 保持手术式。✓

## 6. 验收

1. `cargo test -p agent-vitals-data issues:: -p agent-vitals-desktop`（新测试绿）。
2. `cargo clippy --release --all-targets -- -D warnings`。
3. `npm run verify:react`（tsc + build + 全部契约脚本含 overview 契约新断言：
   TrendPanel 存在、深链走 nav helper、null 降级、mock 提供失败日、i18n 双语键齐全）。
4. subAgent 视觉验收：mock 数据下总览页截图——堆叠柱、失败标记、空态、降级态四景。
