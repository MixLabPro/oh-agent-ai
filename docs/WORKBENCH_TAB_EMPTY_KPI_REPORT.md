# 问题调查报告:工作台各 tab 空数据 / DSH-only 核查(修正版)

- **日期**:2026-09-03(修正版,取代同日首版)
- **对象**:agent-vitals 菜单栏 app(Tauri 2,`src-tauri/` 独立 workspace)的工作台窗口(`workbench.html`,label `workbench`)
- **构建**:`/Applications/agent-vitals.app`,内嵌 CLI `Contents/Resources/bin/agent-vitals` = v1.3.0
- **调查问题**:「总览顶部今日 / 本月 / 预算 KPI 为空」是否同样出现在其余四个 tab —— token 日历、会话、Findings、数据源
- **方法**:逐 tab 追 UI → IPC → Rust handler → 落盘数据源整条链;对嵌入式 CLI 与 `~/.agent-vitals/state/` 做真机实测;复核了代码注释与单测对「断更根因」的自我证词。未改动任何代码。
- **修正记录**:首版把 DSH 断更根因误判为「fold 只消费裸 jsonl、zstd 读不了」,并把总览定性为「DSH-only 正常设计、非 bug」。复核后修正:①根因是 **SessionKey 一次性封账**(§二,zstd 全程可读);②总览/日历未达既定跨宿主定位,属交付面未接齐(§三);③v0.7 **整体未完成**(Stage 3: DSH → UsageFact 未落地),本问题不否定 v0.6 与 Stage 1/2 已验收成果(§六);④跨宿主日历是既定目标、非「是否做」的决策(§七第 5 项);⑤Claude 总览合并须由 Rust 出统一 DTO、前端只格式化,防口径漂移(§3.5)。**状态:未定稿** —— 待复核通过后再标最终版(§七末)。

---

## 〇、结论速览(修正后)

这次实际暴露的是**三类不同性质的问题**,不是一个「空」:

| # | 类 | 内容 | 等级 |
|---|---|---|---|
| 1 | **数据生产缺口** | DSH 会话按 SessionKey **一次性封账**(R1d exactly-once),活跃/重新打开的会话在首次 fold 后继续追加,其新增部分**永不**再进 today/month —— 不是 zstd 读不了 | P0 |
| 2 | **跨宿主投影缺口** | 工作台总览三卡 + token 日历仍 DSH-only,未达既定产品定位(跨宿主审计工作台 / 跨宿主今日总览 / 日历常驻)。拆开看:Claude = 数据已在 DTO、纯前端接线缺口;Codex = Overview 尚无成本 DTO、投影未实现;DSH 空态 = 子域诚实,但**不等于**跨宿主总览为空 | P1 |
| 3 | **纯 UI 缺陷** | 数据源页渲染循环写死 `["codex","dsh"]`,漏画 claude-code,且命名兜底会把未知宿主错标成 Codex | P1 |

其余两 tab:**会话**有活数据(237 条)不受影响;**Findings** 有活数据(2995 条)但**汇总未携带来源覆盖状态**,用户可能把总数误认成全宿主完整结果(独立 P2,见 §四)。

---

## 一、现象:顶部 KPI 为什么空

顶部三张卡(今日 / 本月 / 预算)只从 **DSH fold** 取数:

| 卡片 | 数据源 | 现状 |
|---|---|---|
| 今日 | `state/today.json`(要求 `date` == 北京今天) | date = **2026-08-31**,非今天 → 「— / 今天还没有数据」 |
| 本月 | `state/month.json`(`filter_days_to_month`) | month = 2026-09,仅 `2026-09-01` 一天(~100 token 桩) |
| 预算 | `state/alert.json` | 8 月评估,跨月后置 stale |

**同一时刻的真实活动在别处**:claude-ledger 今天(09-03)≈911M tokens;codex 今天 2 会话;r2a sessions 共 237 条。这些与窗口三卡不同源(§三、§四)。

---

## 二、[P0] 数据生产缺口:DSH 断更的真正根因 = SessionKey 一次性封账

### 2.1 首版误判(已推翻)

首版写「fold 只消费裸 jsonl,zstd 导致增量恒 0」。**与代码不符**,三处证伪:

1. `src/agent/discovery.rs:22-29` 模块注释:「真实机上的会话几乎全是 `session.jsonl.zstd`(0 个裸 `.jsonl`)——本发现器**两种形式都浮出**」;`:56-58` `zstd_only` 字段注明「这些**也进 `unfolded`**,经 oneline 的多帧解压折账」。
2. `src/dsh.rs:355` `read_session_text` 对 `.zstd` 后缀走 `decode_zstd_multi_frame`(多帧解压)—— zstd 全程可读。
3. `discovery.rs:271-295` 逐字:`zstd_only_dirs` = 只有 `.zstd` 的目录,**「这些也是候选……(真机 59/59 全是这种,R1d tick 折的就是它们)」**,唯一过滤是 `tk_io::folded_in_ledger(&key)`。

所以 `zstd_only=59` 是**来源形态统计**;`bare=0, zstd_only=59` **不能解释 `unfolded=[]`**。

### 2.2 真正的根因

`crates/agent-vitals-core/src/takeover.rs` `ledger_folded`(docstring 自证):

> R1d 的 exactly-once 语义 = **key 唯一**:同一 session_log(同一 key)连续多 tick 只折第一次,之后全跳过,不重复累加。日志**增长**的情况(同 key、内容变了)R1d 也跳过 —— **宁可少计也不翻倍,增量重 fold 是 R3 watcher 的 `fold_resume` 差事,不是 R1d 的**。这是有意取舍,不是漏查。

**根因定性**:R1d 去重粒度只有 **SessionKey**,没有 SourceRevision / checkpoint。discovery 浮出未折会话 → `folded_in_ledger` 按 SessionKey 判重 → 一个会话第一次 fold 后 key 入 ledger;此后即使用户**重开/继续**该会话、`.zstd` 文件继续追加、mtime 晚于 `folded_at`,也因 key 已存在而被滤掉 —— **新增部分永远不会进入 today/month**。增量重折设计上留给 R3 watcher 的 `fold_resume`,而当前主动 runtime(R1d tick discover → fold)不消费增长。

**真机证据**:部分 `.zstd` 文件修改时间**晚于** ledger 里对应 key 的 `folded_at`,但仍 `unfolded=[]`——会话日志明明在增长,却因 key 已封账而整体跳过。`month.json` 停在 09-01(~100 token 桩)、`today.json` 停在 08-31,正是「折过一轮后 ledger 把 59 个 key 全封住、之后增长不再被重折」的形态。

> 补一句边界:这不是「DSH 从某天起没数据」——08-14…08-31 的 ¥1.7k 就是这些会话**首次**折账的产出;断的是**首次之后**的追加。归类上,根因在 DSH fold/state 运行时的封账粒度(设计取舍),其闭环是 R3 增量重折的接线,不是 v0.6/v0.7 的 Claude/Codex 引擎欠账(§六)。

---

## 三、[P1] 跨宿主投影缺口:总览 + token 日历未达既定产品定位

### 3.1 产品定位(架构文档既定,非本报告新增主张)

- `MENUBAR_MULTIHOST_NAVIGATION_SPEC.md` 顶部 v1.3 修订自述:正是「**DSH 空转、钱全在 Claude Code 里跑的 deepseek 流**」的真机用户 bug 触发,把「顶层钱行是 DSH-only 却被当全局行」列为 **P0**;
- 工作台定位 = 跨宿主审计工作台;`UNIFIED_COST_VIEW.md`(设计底稿,状态=前置/未落地)定义「顶部 = 跨宿主今日总览」目标画面;
- 架构文档把跨宿主 `calendar.html` 升级为常驻客户端体验。

### 3.2 现状:后端已多宿主,前端没接齐

- `read_overview()` **已返回** `claude_today` / `claude_month` / `claude_today_tokens`(overview.rs 从 claude-ledger 读);托盘 `metered_amount` **已消费**这些字段组成合并按量总账(v1.3)。
- 窗口 `renderOverview()` **不使用**这些字段(workbench.js grep 无 `ov.claude_*`)——总览三卡只渲染 DSH 那半。这是**交付面未接齐**,不是数据天然「不归总览管」。

按缺口拆分(修复责任不同):

| 子项 | 现状 | 定性 |
|---|---|---|
| **Claude 缺失** | Rust 侧已有 `claude_*` 输入,`read_overview` 已返回;托盘已消费 | **投影未上窗口**:Rust 返回统一计量 DTO 后窗口消费之(§3.5);JS 不做金额合并 |
| **Codex 缺失** | Overview **尚无对应成本 DTO**;codex 成本只在 sessions/hosts 侧 | **数据投影未实现**(需在 Overview 数据层加投影,不是改前端) |
| **DSH 空态** | 当前 DSH 子域结果诚实 | 诚实,但**不能代表跨宿主总览为空** |

### 3.3 token 日历:展示忠实,产品能力未完成

调用链判断正确:`read_month` → `read_month_days_at`(`overview.rs:749`)只读 `state/month.json` + `month-archive.json`(DSH fold),`claude-ledger` / codex 不在读取范围;实测 9 月仅 09-01 一天、8 月归档 13 天。它**忠实展示 month.json,没有伪造数据**——但产品规格要求的是**跨宿主日历**(UNIFIED_COST_VIEW 底稿 / MENUBAR spec)。定性应改为:

> 当前 DSH-only 日历没有造假,但**尚未满足跨宿主工作台设计,是功能缺口**,而不只是「DSH 没有新数据」。

### 3.4 预算卡:语义与今日/本月卡不同,不得混为一谈

三张卡不是同一个产品决策:

- **「今日成本」「本月成本」**:应是按币种分列的**跨宿主**按量总览。合并计算由 Rust 完成并返回**最终 DTO**(`today_metered_by_currency` / `month_metered_by_currency` / `pricing_basis` / `estimated` / `coverage`),托盘与工作台消费同一结果;`workbench.js` 只格式化,不做金额合并 / 币种选择 / `≈` 判断 —— 边界见 §3.5。
- **「预算」**:目前明确是 **DSH 预算**,只能约束 DSH 对应账域。在统一预算范围、订阅/按量裁定、币种规则未定前,**不能把 Claude/Codex 金额塞进 DSH 预算分母**(MENUBAR spec D2「预算/alert 仍 DSH-only」是有意决策)。

因此建议改成分开的两项,而不是一个笼统的「三卡合并」:① 今日/本月 → 跨宿主按量成本;② 预算 → 继续显示 DSH scope,并在标题/副文案**明示范围**(如「DSH 预算」)。

---

### 3.5 总览接线的边界:合并计算留在 Rust,前端只格式化

**Claude 总览不能在前端照抄托盘 `metered_amount` 的合并逻辑再算一遍。** `workbench.js` 应只格式化,不承担金额合并、币种选择、`≈`(估算)判断。应由 Rust 返回最终 DTO(`today_metered_by_currency` / `month_metered_by_currency` / `pricing_basis` / `estimated` / `coverage`),托盘与工作台消费**同一结果**。否则合并逻辑在 JS 里再复制一份,两个界面会再次金额口径漂移(2026-08 月成本两次重算 ¥2386 vs ¥1733、month.json 三倍计数,都是「同一条账在多个界面各自算」的教训)。所以 §3.2「Claude 缺失」的前端接线 = **消费这个统一 DTO**,不是把托盘逻辑搬进浏览器。

## 四、会话 / Findings:有活数据;但 Findings 缺来源覆盖状态

### 4.1 会话 —— 不受影响

spawn 嵌入式 CLI `sessions list` 读 **r2a 多宿主 store**。实测 `source_statuses`:**claude-code ok/147、codex ok/31、dsh ok/59,total 237**;今天 codex 2 会话、live Claude 会话(`3d96a4d2`,findings 40)在列。两个注意点(都不是「没数据」):日期过滤按会话起点匹配(跨天长会话起点早于今天 → 按今天滤 claude-code 得 0);WorkBuddy 在 store 里 source-unavailable(查它报 err,诚实不可用)。

### 4.2 Findings —— 有活数据,但跨宿主覆盖状态未完整呈现 [P2]

`sessions findings` 实测:findings = **2995**,顶层 keys = `engine_version / findings / generated_at / pricing_version / rules / schema_version / store_revision / totals` —— **无 `source_statuses`**。Findings 页(`renderFindingsDetail`)也只按 severity/rule 过滤渲染,没有 partial/unavailable 标志。

「读不到的宿主被排除」本身**没有制造假 finding**(诚实),但用户无法区分「全宿主完整汇总」与「部分来源可用」——可能把总数误认成完整结果。**登记独立缺口**:Findings 汇总需携带来源覆盖状态,或与 SessionStore 的 source statuses 同屏展示(参照会话 tab 的 host 过滤 / 数据源页的 status 卡)。

> 证据口径修正:首版「Claude 是唯一产生花费的宿主」**证据不足**。codex 今天 2 会话只证明**活动**,会话行 `cost_usd`/`tokens_total` 为空、未取到可计价成本,不能证明产生了可计价花费。措辞收紧为:今天**唯一有当日记账/计价证据**的是 Claude Code(claude-ledger 911M);Codex 今日有活动、无计价证据。

---

## 五、[P1] 纯 UI 缺陷:数据源页写死 codex+dsh,漏画 claude-code

- 链路(`workbench.js:2068` `loadSources`):两个数据源独立拉取——`sessions_list` pageSize:1 → `source_statuses`,`read_overview` → sync 脚注。`source_statuses` 实测含 **3 宿主**(claude-code/147、codex/31、dsh/59)。
- 缺陷(`workbench.js:2122`):渲染循环写死 `for (const key of ["codex","dsh"])`,claude-code 被**静默丢弃**——恰是当前最活跃的宿主。旁证是旧逻辑:`renderSourceCard` 命名兜底 `key==="dsh" ? "DSH" : "Codex Sessions"`(line 2139),任何非 dsh 键都会被标成 Codex。脚注写「共 3 个数据源」却只画 2 卡。
- **修复不应只是把循环换成 `Object.keys()`**,需要验收守卫:
  - 每个 `source_statuses` key 恰好渲染一张卡;
  - 已知宿主有明确显示名(claude-code / codex / dsh / workbuddy),未知宿主用**通用 fallback,不得错标为 Codex**;
  - 渲染卡数 = 页脚数据源数量一致;
  - 顺序由宿主契约或稳定排序决定(不靠对象键序)。

---

## 六、结论与定性:说明了什么问题?v0.7 完成度如何

**本问题不否定 v0.6 与 v0.7 Stage 1/2 的已验收成果;但 v0.7 整体仍未完成——DSH Stage 3 尚未落地。** 报告暴露的三类问题定位到 v0.7 里程碑时,要分清「已完成」与「未完成」:

1. **v0.6 与 v0.7 Stage 1/2(Claude、Codex adapter emit UsageFact + r2a 查询面)已验收且真机在跑**——claude-ledger 09-03 写入(≈911M)、sessions 237 条、codex 今日 2 会话、findings 2995。注意 Stage 1/2 的 UsageFact 是**内存 / 只读诊断输出,不持久化**(VITALS_CORE_V0_7_STAGE_1_CLAUDE_ADAPTER.md §6 与 §261),**不构成「成本权威账已跨宿主」**。
2. **v0.7 Stage 3(dsh state chain emit UsageFact,决策 B replay)尚未落地**(VITALS_CORE_V0_7_ADAPTER_DECISIONS.md 清单第 8-9 项仍 ⏸)。today / month 的**成本权威账仍是 DSH state**,UsageFact 未持久化 → 本报告的 P0(DSH 封账粒度)与跨宿主成本投影的**根治都压在 Stage 3 之后**。
3. **P1(跨宿主投影 / UI 接线)是菜单栏工作台的交付面收尾**——查询面已跨宿主(r2a + Claude/Codex adapter),**成本权威账与运行时写链尚未统一**;`read_overview` 已算好 `claude_*`、托盘已用,窗口总览/日历/sources 页没跟上。规格曾把它判为 P0 并只修了托盘一行钱(v1.3),窗口侧属**同一 P0 的残留**。

**一句定性**:查询面已跨宿主,成本权威账与运行时写链尚未统一;窗口最显眼的「今天/本月花了多少」仍指着 DSH 那条「首次折账后停止前进」的账。这类缝只会在「真机 + DSH 恰好断更」时现形——恰是 repo「tests read the real machine」哲学要抓的缺陷类型:合成 fixture 里会话不会「折完一轮后继续增长」,所以单测钉不住。

---

## 七、修复顺序建议(基于修正后的根因与分级)

按「根因 → 数据 → 投影 → 呈现」排;每一项的根治与 v0.7 Stage 3 的相对先后,见段末「执行顺序」。

1. **[P0 数据生产缺口] R3 增量重折的最小正确闭环(进入 R3,但按序做)** —— R1d 只封首折是设计取舍;要让活跃/重开会话的追加进入 today/month,闭环顺序必须是:
   1. 用 **SourceRevision** 检测已封账 SessionKey 的内容变化;
   2. 保存每会话上一版贡献 / 事实 ID;
   3. 变化后**先全量重折该会话**;
   4. **原子替换**旧贡献,或按 UsageFact 去重后应用增量;
   5. 证明 turn-boundary checkpoint 满足 `fold_resume == fold(all)` 后,才把增量恢复当性能优化。

   第一版宁可「检测变化后全量重折并替换」,也**不要**把完整总量再累加一次(那会直接翻倍)。DSH zstd 是多帧压缩,**任意文件增长 ≠ 安全 checkpoint 边界**——不能把 `fold_resume` 直接接上就当完成。

2. **[P1 投影缺口] 窗口总览接入跨宿主口径** —— 消费 Rust 返回的**统一计量 DTO**(§3.5),`workbench.js` 只格式化,**不在 JS 里照抄 `metered_amount` 合并**。先覆盖 **Claude**(数据在 Rust 侧已有 `claude_*` 输入);**Codex** 需先在 Overview 数据层补成本投影。**预算卡不动金额、只明示「DSH 预算」范围**(D2)。
3. **[P1 纯 UI] 数据源页渲染循环** —— 改遍历 `source_statuses` 键 + 显示名表 + fallback + 卡数一致 + 稳定排序(带 §五 的验收守卫)。
4. **[P2 呈现] Findings 汇总携带来源覆盖状态**(或与会话 tab 的 source statuses 同屏)。
5. **[既定目标,待定实施] token 日历** —— **跨宿主日历已确认需要实现**,不是「是否做」的产品决策;真正待决定的是:进入哪个里程碑,以及数据契约用**统一 UsageFact 日视图**还是**临时拼接各宿主账本**。

**明确不做**:预算/alert 并入跨宿主(范围、订阅/按量、币种规则未定前);「每宿主一行钱」(MENUBAR spec §3.1 主账规则);R1d 直接重折 / 把完整总量再累加一次(翻倍)。

**执行顺序(相对里程碑)**:① 先完成 v0.7 **Stage 3:DSH → UsageFact**——先建立 DSH 的事件身份与重放契约,R3 才不必继续围绕旧的「SessionKey 一次性封账」模型打补丁;② 紧接着做上表第 1 项的 R3 最小正确闭环(SourceRevision + 全量重折替换);③ 再修工作台 Claude 总览、数据源卡、Findings 覆盖状态;④ 最后接 Codex 成本投影与跨宿主日历。本报告当前**不标记最终版**,待修正逐条通过后定稿。

---

## 附录:证据出处

- **P0 根因**:`crates/agent-vitals-core/src/takeover.rs` `ledger_folded`(key 唯一,日志增长也跳过,增量重折留给 R3 `fold_resume`);`src/agent/discovery.rs:22-29`(两种形式都浮出)、`:271-295`(zstd-only 目录也是候选,真机 59/59)、`:491` 单测 `discover_filters_zstd_only_via_ledger`;`src/dsh.rs:355` `read_session_text`(`.zstd` → `decode_zstd_multi_frame`)。同步消息在 `src-tauri/src/lib.rs:846`(`bare={}, zstd_only={}`)。
- **跨宿主定位**:`MENUBAR_MULTIHOST_NAVIGATION_SPEC.md` v1.3 修订(P0:「顶层钱行是 DSH-only 却被当全局行」;D2 预算 DSH-only);`UNIFIED_COST_VIEW.md` 状态=设计底稿(前置/未落地)。
- **代码**:`overview.rs:749`(`read_month_days_at`,读 month/archive)、`:832`(`read_month_json`);`lib.rs:1202-1203`(`read_month` 薄转发);`workbench.js:2068-2093`(`loadSources`)、`:2122`(写死 `["codex","dsh"]`)、`:2139`(命名兜底)、`:2043`(finding→会话跳转)。
- **落盘数据**:`~/.agent-vitals/state/month.json`(2026-09,仅 09-01)、`month-archive.json`(2026-08,13 天)、`last-sync.json`(bare=0, zstd_only=59)、`today.json`(date=2026-08-31)。
- **真机实测**(内嵌 CLI v1.3.0):`sessions list --json` → `source_statuses` 三宿主(147/31/59),total 237;`sessions findings --json` → findings=2995,顶层 **无 `source_statuses`**;`sessions findings --from` 报「unexpected argument '--from'」(findings 无日期过滤)。
