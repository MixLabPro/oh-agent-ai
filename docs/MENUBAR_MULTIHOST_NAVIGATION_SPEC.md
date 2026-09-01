# 菜单栏多宿主导航（宿主 → 最近会话）—— 设计 spec

状态：**草案（2026-09-01），未实现**。
范围：把 `docs/MENUBAR_MIGRATION.md` §11 的 out-of-scope 项「多 host / 跨宿主菜单栏
聚合」挪进范围，给托盘菜单引入**二级导航**：1 级是宿主行（今日 token + 会话数），
2 级是该宿主的最近会话跳转清单。本文只消费现有会话 store（`sessions list`），
**不新增任何 core 规则、不改价表、不进差分 golden**——全部是托盘侧的组装与展示。
设计动机对照 CodexBar（steipete/CodexBar）的菜单栏体验；引用 `文件:行号` 为证。

## 0. TL;DR

- **现状托盘菜单全平、单宿主**：今日成本/日预算/本月成本/最近会话/预算状态/同步/
  打开工作台/立即同步/退出（`src-tauri/src/lib.rs:271-335`），数据全部来自 DSH
  state 文件（today.json/month.json/alert.json/oneline.json），**对 Codex 无感**。
- **CodexBar 是「每 provider 一个状态图标 + popover tiles（用量条 + reset 倒计时）」，
  会话/成本历史刻意不进 popover**。结论：抄「每宿主一行状态」，不抄「菜单里列会话」。
- **设计**：L1 每宿主一行 = 今日 token + 今日会话数（**token 轴**，规避 DSH-CNY vs
  Codex-USD 币种分叉）；L2 = 该宿主最近 N 个会话的**跳转清单**（身份字段、无成本列），
  点击深链到工作台会话详情。L2 是「跳转」不是「浏览器」——浏览/分页/过滤是工作台
  会话 tab 的职责（`src-tauri/ui/workbench.js:414-505`），菜单里再造一个更差的浏览器
  是推翻工作台刚定下的「single-session reports discoverable」决定。
- **数据源**：L2 最近会话 + 今日会话数统一走 `sessions list --host-kind X`
  （R2A store，复用 spawn + 类型化错误，`src/agent/r2a_store.rs:970-1045`）；DSH 的
  今日 token 读 today.json（与顶层「今日成本」行**同源**，绝不矛盾）。
- **诚实降级**：store 冷 build 失败/超时 → 宿主行显示「—」+ 子菜单「会话数据暂不可用」，
  主入口（今日/预算/同步）照常；绝不臆造 0（CLAUDE.md 空态诚实铁律）。
- **明确不做**：live「正在运行」指示（需要 autosync 式 mtime 静止检测，该逻辑已删）、
  per-host 今日成本（Codex 侧北京日界折叠是新工作 + 币种分叉）、reset 倒计时（我们
  审计本地成本，没有云端额度窗口语义）。

## 1. 背景：CodexBar 对照

CodexBar（Swift 原生 macOS 14+ 菜单栏 app）的事实（README + 截图描述）：

- 默认**每 provider 一个菜单栏图标**，图标本身是微型用量表；有 merge 模式合并成单
  图标 + 切换器。错误/过期数据可置灰或显示 incident 指示。
- 点开是 **popover**：provider tiles（icon / name / usage bar / reset countdown，
  session/weekly/monthly 窗口）。
- **会话/成本历史刻意放在持久化视图（Settings → Usage & Spend），popover 里不列
  会话**。价值主张原文："keep limits visible and show when each window resets"——
  看的是额度窗口状态，不是会话清单。

三条对照结论：

1. **保持单图标，不抄多图标**。我们是 Tauri tray + 菜单（单图标形态）；macOS 菜单栏
   堆多个动态图标是 CodexBar（Swift 多 status item）的形态，Tauri 一个 tray 挂一个
   菜单天然就是「单图标 + 内部分层」——CodexBar 的 merge 模式正是我们的既有形态，
   不用变。
2. **抄「每宿主一行状态」**：一眼看出哪个宿主今天在烧 token。这是 CodexBar 真正
   做对的地方，也是我们单宿主菜单暴露的断层（§2.3-1）。
3. **不抄「列会话」**：CodexBar 明确把会话/成本历史留在独立视图。我们的工作台会话
   tab 已经是这个独立视图（host 过滤/分页/详情/时间线，`workbench.js:414-505`），
   菜单栏再展开 10 行会话是重复造一个更差版本。

CodexBar 有而我们**不该**抄的：reset 倒计时（provider 额度窗口，我们审计的是本地
成本没有额度窗口——预算健康已由 alert.json 行覆盖）、live 指示（无可靠 running 信
号，§2.3-6）。

## 2. 现状盘点

### 2.1 托盘（src-tauri，独立 workspace）

- 全平菜单，无 submenu 先例（`lib.rs:271-335` 全 `MenuItem`）。
- 数据源 `read_overview` → `overview.rs::read_overview`，**DSH-only**：today.json
  （今日 token + 成本）、month.json（本月）、alert.json（预算权威，已接线，
  `lib.rs:108-143`）、oneline.json（最近会话行，`lib.rs:224-248`）。
- 托盘标题「今日 tokens · ¥」（`today_title`，`lib.rs:162-171`）。
- tick 每 5 分钟 discover → spawn `oneline`（**DSH-only**，`lib.rs:485-495`），启动
  即跑一轮。
- 金额格式统一走 `fmt_money`（core `format_money` 同 spec，`lib.rs:33-37`）。

### 2.2 会话数据面（R2A store，二进制 crate）

- `sessions list --host-kind dsh|codex --json`：`r2a_store.rs:970-1045`；Tauri IPC
  薄壳 `store.rs:128-149`（spawn 二进制 + stdout 解析 + 类型化错误透传）。
- **host_kind 硬编码两值**：`dsh` / `codex`（`r2a_store.rs:267`、`:984`）。
- list 项字段（`Summary`，`r2a_store.rs:142-151` + `render_list` `:1176-1186`）：
  `session_key.host_kind/native_id`、`title`、`model`、`date_span.first/last`
  （**UTC 日期**）、`tokens_total`、`findings_total`、`cost_usd`。
  **DSH 的 `cost_usd` 恒为 None**（`r2a_store.rs:202-203`：「cost 是 CNY 币种，
  绝不把人民币当美元填」）。→ 决定 L2 不能带成本列（§6 决策 6）。
- 分页页有 `total`（`r2a_store.rs:1171-1173`）→ 今日会话数可读。
- **排序 = SessionKey 四元组序**（host_kind → native_id → source_profile →
  machine_namespace，`crates/agent-vitals-core/src/r2a.rs:22`、`:149-152`），
  **非时间序** → 「最近 N 个」不能直接取第一页。
- 日期过滤 = **date_span 交叠语义**：`[first,last]` 与 `[date_from,date_to]` 有交叠
  才算命中，ISO 日期字典序（`r2a.rs:201-216`）。
- 工作台会话 tab 已消费同一命令（host 过滤/分页/详情，`workbench.js:414-505`），
  冷 cache 首建要几十秒（`workbench.js:414` 注释）。

### 2.3 六个缺口（本文要解决或明确不解决的）

| # | 缺口 | 本文处理 |
|---|---|---|
| 1 | 托盘对 Codex 无感，overview 无 per-host 轴 | 解决：L1 宿主行 |
| 2 | Codex 侧没有「今日」聚合 | 解决：v1 走 sessions list 过滤求和；v2 进 core（§10） |
| 3 | `sessions list` 无时间序，「最近 N 个」要自己排 | 解决：托盘侧按 date_span 降序取前 N（§6 决策 2） |
| 4 | per-host 币种分叉（DSH CNY / Codex USD） | 规避：L1/L2 用 token 轴，不带钱（§6 决策 1、6） |
| 5 | 无 deep-link：工作台详情只能内部开（`workbench.js:493-505`） | 解决：focus_session IPC（§7） |
| 6 | 无 live「正在运行」信号（dsh_autosync 已删） | **不做**（§11），"活跃"钉死为今日活跃 |

## 3. 需求与语义钉死

用户提议：「1 级导航是宿主+宿主（例如 Deepseek Harness 15k 活跃、Codex 20k），点击
以后二级展开 10 个最近的 session」。

- **「活跃」钉死为今日活跃**：今日（北京日界）token 总数 + 今日会话数。**不是**「正在
  运行」——我们没有可靠的 running 信号（§2.3-6），且用户示例本身就是 token 数
  （"15k 活跃 / 20k"），不是运行状态。
- **L1 行用 token + 会话数，不用钱**：① 与用户示例一致；② 规避币种分叉（§2.3-4）；
  ③ per-host 成本需要 Codex 侧北京日界折叠的新计算（§2.3-2）。钱保持在顶层全局行
  （今日/本月/预算），per-host 成本是 v2（§10 Phase 3）。
- **「10 个」改为前 5 个**：L2 是跳转清单不是浏览器——跳最近 5 个足够，浏览要分页+
  过滤那是工作台的活（§1 结论 3）。10 个恰好卡在「jump 太多 / browser 太少」的死区。

## 4. 菜单结构设计

现状 → 目标（**粗体 = 新增/改动**，`→` = 深链到工作台）：

```
现状（lib.rs:271-335，全平）          目标
──────────────────────              ─────────────────────────
今日成本：¥12.34 · 1.4M tokens       今日成本：¥12.34 · 1.4M tokens   ← 不变
今日预算：¥24 / ¥30（93%）           今日预算：¥24 / ¥30（93%）        ← 不变
本月成本：¥774.7 / ¥600              本月成本：¥774.7 / ¥600           ← 不变
最近会话：deepseek-v4-flash · 15K     ─────────────────
    · ¥0.02  ⚡ 删除，被宿主行吸收    ▸ DeepSeek Harness · 15K · 3 会话   ← L1 子菜单
                                    ▸ Codex · 20K · 1 会话
预算：✓ ¥12.79 / ¥600                ─────────────────
上次同步：09:50 成功                  预算：✓ ¥12.79 / ¥600              ← 不变
─────────────────                   上次同步：09:50 成功                ← 不变
打开工作台… / 立即同步 / 退出          ─────────────────
                                    打开工作台… / 立即同步 / 退出
```

L1 宿主行展开后的 L2 子菜单（以 DSH 为例）：

```
▸ DeepSeek Harness · 15K · 3 会话        ← 点击展开
  09-01 · deepseek-v4-flash · 15K         ← 最近会话跳转行（无成本列）
  09-01 · deepseek-v4-pro-0813 · 4.5K
  08-31 · deepseek-v4-pro-0813 · 12K
  ─────────────────
  查看全部会话 →                          ← 深链：工作台会话 tab，按 host 过滤
```

结构决策：

- **预算/同步/今日/本月永远留在顶层，不藏进宿主**——它们是主入口最该一眼看到的东西，
  host 展开是增量信息，不是替代。
- **L1 行的顺序 = 固定宿主序**（dsh → codex），不是按 token 量排序——菜单每轮重建
  的排序要稳定，且宿主只有两个，量排序无信息量。
- **「最近会话」平铺行删除**：它展示的是「最近一条 DSH 会话」，被 DSH 宿主子菜单的
  第一行吸收，功能不丢、不再占一行。
- L2 跳转行格式 `<date> · <model 短名> · <tokens>`：身份字段、无成本列（§2.2 币种
  事实 + §6 决策 6）。model 用 `short_model`（`lib.rs:176-178`）；`date_span.last`
  是日期粒度（非时间），菜单如实显示日期，时间线在详情页。
- host 显示名映射是**托盘侧展示**（dsh → `DeepSeek Harness`，codex → `Codex`），
  与 `short_model` 同类的展示逻辑，不是 core 规则；工作台仍显示 raw host_kind
  （`workbench.js:465`）。

## 5. 数据契约

### L1 宿主行（每宿主一行）

| 字段 | 含义 | 来源 | 备注 |
|---|---|---|---|
| `display_name` | 宿主显示名 | 托盘侧映射表（§4） | dsh → DeepSeek Harness，codex → Codex |
| `today_tokens` | 今日 token 总数 | DSH：`ov.today.tokens`（today.json）；Codex：sessions list 求和（§6 决策 3） | **DSH 必须与顶层「今日成本」行同源**，两行不得对同一宿主报出两个 token 数 |
| `today_sessions` | 今日会话数 | `sessions list --host-kind X --from T --to T` 的 `page.total` | T = 今天（日界见 §6 决策 4） |
| `recent` | 最近 N 个会话（L2） | `sessions list --host-kind X --page-size M` 页内按 `date_span.last` 降序取前 N（§6 决策 2） | N=5，M 取 50（留出降序余地） |

### L2 跳转行（每行）

| 字段 | 来源 | 缺失时 |
|---|---|---|
| `date_span.last`（前 8 字符） | list 项 | 该段省略 |
| `model`（short_model） | list 项 | 该段省略 |
| `tokens_total`（fmt_tokens） | list 项 | 该段省略 |
| 点击行为 | — | 深链 focus_session（§7），完整字段在详情页 |

### 宿主区整体

`hosts: [{ host_kind, display_name, today_tokens, today_sessions, recent: [...] }]`
并入 `read_overview` 的返回（`overview.rs` 组装，纯展示结构；**不在菜单侧做任何求和/
过滤/排序以外的计算**）。宿主区整体失败（二进制缺失/store build 失败）→ 宿主区整个
不渲染，顶层行照常（§8）。

## 6. 数据源缺口与实现决策

### 决策 1 —— L1 用 token + 会话数，不用钱
理由：币种分叉（§2.3-4）+ 用户示例本身是 token + 今日成本折叠对 Codex 是新工作。
**为什么不做「今日成本：Codex ¥X」**：Codex 侧没有北京日界折叠，`sessions list` 的
`cost_usd` 是 USD 且 DSH 恒 None——把两个币种塞进一个全 ¥ 的菜单（`fmt_money` 前缀 ¥）
要么编造、要么需要新的 core 定价通路。v1 诚实地不带钱，钱留在顶层全局行。

### 决策 2 —— 「最近 N 个」在托盘侧按 `date_span.last` 降序取前 N，不改 core
`sessions list` 排序是 SessionKey 四元组序（§2.2），不是时间序。给 core 加
`--sort recent` 是可选优化，但**展示层排序是 presentation，不是 measurement**——
与 timeline 几何留在前端（CLAUDE.md「唯一例外：timeline 的 geometry」）同一判据。
托盘侧 `sort_by(date_span.last, desc)` 不改任何测量结果，只改展示顺序。同一日期内的
次序沿用 store 序（native_id），对跳转清单足够。若排序质量不够再考虑 core 扩展
（§10 Phase 3 备注）。

### 决策 3 —— DSH 今日 token 读 today.json，Codex 走 spawn 求和
- DSH：`ov.today.tokens` 已经是权威（`today_title` 同源，`lib.rs:162-171`），直接复用。
  若 DSH 也用 `sessions list` 求和，会与顶层今日行对同一数据报出两个数（today.json
  的折叠 vs store 的折叠），用户会在同屏看到矛盾。
- Codex：v1 用 `sessions list --host-kind codex --from T --to T` 求和 `tokens_total`。
  v2 进 core 做北京日界折叠（§10 Phase 3），与 DSH 对称。
- **一致性验收测试**：DSH host 行 token == `ov.today.tokens`（§9）。

### 决策 4 —— 「今日」日界取 date_span 交叠语义 + UTC，记作已知近似
`--from T --to T`（T = 今天）过滤的是**会话跨度 [first,last] 与 [T,T] 交叠**
（`r2a.rs:201-216`），date_span 是 **UTC 日期**。北京 00:00–08:00 的早间会话跨度可能
落在 UTC 昨天，会被「今天」过滤漏掉。**已知近似，不改**：菜单是瞥一眼的量级显示，
不是精确账本（精确账本在日历/工作台）。v2 的 core 折叠可以精确（§10 Phase 3）。注释
里按仓库惯例写清「为什么 obvious 的做法（用北京日期当 filter 值）也是近似」。

### 决策 5 —— tick 成本：每宿主一次 spawn，冷 cache 诚实降级
tick 现在每 5 分钟 spawn discover + oneline（`lib.rs:485-495`）。宿主区加 2 次
`sessions list` spawn（每宿主一次）。store 是全量构建（工作台冷 cache 几十秒，
`workbench.js:414`），但带 store_revision + 缓存，热 build 便宜。处理：
- tick 的宿主区读取走**与 oneline 并列的后台路径**，失败不影响顶层行；
- 冷 cache 首轮：宿主区显示「—」+ 子菜单「会话数据暂不可用」，下一轮重试（§8）；
- 不让 tick 串行等一个几十秒的 spawn——`sessions list` 与 discover/oneline 并列
  spawn 或超时截断（实现时选：超时截断最简）。

### 决策 6 —— L2 行无成本列
`cost_usd` 对 DSH 恒 None、Codex 是 USD（§2.2）——L2 若带钱，同一列两种币种且一半
是空。L2 是跳转清单，身份字段（日期/模型/token 量）足够识别；成本在详情页
（`workbench.js:523` 已显示 cost_usd / "—"）。

### 决策 7 —— L2 数据与 L1 今日数据来自同一次 spawn？
**不合并**：L1「今日」需要 `--from/--to` 过滤（交叠语义），L2「最近」需要无过滤的全
量（跨天）。一次 `--page-size 50` 无过滤的 spawn 拿全量再在托盘侧过滤今日 = 复制 core
的 `matches` 交叠逻辑 → 违反「不落第二份拷贝」（CLAUDE.md）。所以每宿主两次窄查询
（今日过滤页 + 全量页取最近），或一次全量 + 一次今日过滤。**推荐**：每宿主 2 次窄查询，
语义各自单一、不重复过滤逻辑；5 分钟 tick 共 4 次 `sessions list` spawn，热 cache 下
可接受，冷 cache 降级见决策 5。

## 7. 深链：工作台 focus_session

现状：工作台详情只能从会话 tab 内部打开（`workbench.js:493-505` 的
`openSessionDetail(s)` 读 `s.session_key`）。菜单 L2 跳转需要「外部打开指定会话」。

新增两个 IPC（`lib.rs`，薄壳，不动 core）：

- `focus_session(session_key: Value)`：把 session_key 存进 app state 的
  `Mutex<Option<Value>>` 待消费目标，`show_workbench` 显示+聚焦（复用 `show_workbench`，
  `lib.rs:511-515`）。
- `consume_focus_target() -> Option<Value>`：读并**清空**待消费目标；工作台在初始化
  与每次可见（`visibilitychange`）时调用；拿到后切到会话 tab、按 host 过滤、调
  `openSessionDetail`。
- 工作台侧改动最小：一个「检查 target → 导航」的入口函数，不改变现有分页/状态管理。

**为什么是「待消费目标」而不是事件**：工作台 webview 当前不监听任何 Tauri 事件，
`emit` 需要在 webview 侧加监听器 + 处理窗口未建/隐藏的时序；一个拉取的 target 天然
处理「菜单点了但工作台还没建好」的情况——下次可见时拉取即可命中。与「× 隐藏不销毁、
再开保留状态」的现有窗口语义（`lib.rs:549-558`）一致。

## 8. 诚实降级规则

| 场景 | 宿主行 L1 | 子菜单 L2 |
|---|---|---|
| 二进制缺失 / `sessions list` spawn 失败（`cancelled`，`store.rs:138-149`） | 整行显示「—」（如 `Codex · —`） | 不渲染 |
| store 冷 build 中/超时 | `Codex · —` | 「会话数据暂不可用」 |
| 该宿主零会话（`page.total == 0`，诚实零） | `Codex · 0 · 0 会话` | 「尚无会话」 |
| 今日无数据但历史有（date 过滤空页） | `Codex · 0 · 0 会话`（今日确实没跑） | 最近会话照常（跨天） |
| 字段缺失（model/tokens/date 为 null） | 对应段省略（`fmt_tokens`/`short_model` 均为 Option 语义） | 对应段省略 |

铁律：**缺数据显示「—」/诚实描述，不摆 0 冒充**（CLAUDE.md 空态诚实）；「没有会话」与
「读不了会话」是两个不同的字（`r2a_store.rs:340-348` 的三态语义沿用）。宿主区失败不得
影响顶层今日/预算/同步行——主入口永不因增量信息崩。

## 9. 测试计划

全部是托盘侧测试（`lib.rs` `#[cfg(test)]` 注入 now 的模式已有，`lib.rs:279-335`）：

1. **菜单结构**：宿主行存在/缺失、submenu 行数、删除「最近会话」平铺行、顺序固定
   （dsh → codex）。
2. **一致性**（决策 3 验收）：DSH host 行 token 恒等于 `ov.today.tokens`——构造
   `ov.today` 与 `ov.hosts` 冲突的输入，菜单必须报出 today.json 的值。
3. **L2 排序**：纯函数「按 date_span.last 降序取前 N」，注入乱序 items 钉住输出。
4. **降级矩阵**：§8 每行一测——sessions 失败 → 宿主行「—」且顶层行照常；零会话 →
   「尚无会话」；今日空 → 今日 0 + 最近照常。
5. **深链**：`consume_focus_target` 读后清空（第二次调用返回 None）；未设置时返回
   None（不虚构目标）。
6. **无需 golden 更新**：不加价表、不加规则、不动 core——差分守卫与 golden 都不受影响
   （这本身是一条验收标准：改完 `cargo test` 全绿 + Python 套件全绿，零 `--update`）。

## 10. 分阶段实施

### Phase 1 —— L1 宿主行（token + 会话数）
`overview.rs` 扩展 `hosts: [...]`；`lib.rs` 菜单宿主区 + Submenu；L2 子菜单只放
「查看全部会话 →」（focus_session 到工作台会话 tab 按 host 过滤，不展开具体会话）。
验收：两宿主行出现、DSH 与顶层今日行一致、降级矩阵通过。

### Phase 2 —— L2 最近 N 跳转行 + focus_session
`focus_session`/`consume_focus_target` IPC + 工作台「外部 target 导航」；L2 渲染前 5
行最近会话。验收：菜单点 L2 行 → 工作台打开该会话详情；consume 清空语义测试过。

### Phase 3（v2，另立项）—— Codex 北京日界折叠 + per-host 成本
core 新增 Codex 北京日界「今日」折叠（与 DSH today.json 对称，含锁步）；per-host
成本展示（需先定币种决策：Codex 按 CNY 价表定价 vs 菜单区分币种 vs 保持 token-only）；
live「正在运行」指示（评估是否复活 mtime 静止检测）。

## 11. Out of scope（明确不做）

- **live「正在运行」指示**（§2.3-6，需要 autosync 式检测，已删）。
- **per-host 今日/本月成本**（Phase 3，需币种决策）。
- **reset 倒计时**（provider 额度窗口语义，我们审计本地成本无额度窗口）。
- **菜单内分页/搜索/过滤**（那是工作台会话 tab 的职责）。
- **多图标模式**（保持单图标 + 菜单内分层，§1 结论 1）。
- **改 core 的 `sessions list` 排序/过滤**（决策 2：展示层排序；core 只读消费）。
- **工作台 session DTO 字段扩展**（L2 身份字段已够用）。

## 12. 与既有文档的关系

- `MENUBAR_MIGRATION.md` §11：本文把「多 host / 跨宿主菜单栏聚合」从 out-of-scope
  挪进范围；§11 其余 out-of-scope 项不变。
- `R2A_CONTRACT_DESIGN.md`：会话 store 契约，本文只读消费其 `sessions list`，不改契约。
- `TAURI_RUNTIME_WORKBENCH_SPEC.md`：工作台窗口语义（hide-not-destroy、tab 状态保留），
  §7 深链必须与之兼容。
- `PRODUCT.md` 菜单栏章节：落地后在产品文档同步更新（双语，CLAUDE.md 编辑惯例）。

## 附：本文核实的事实清单（2026-09-01）

- 托盘菜单全平、单宿主：`src-tauri/src/lib.rs:271-335`；tick DSH-only
  `lib.rs:485-495`；`today_title` `lib.rs:162-171`；`short_model` `lib.rs:176-178`。
- `sessions list` IPC 薄壳：`src-tauri/src/store.rs:128-149`；错误码 `cancelled` 透传。
- host_kind 两值：`src/agent/r2a_store.rs:267`（summary 分发）、`:984`（list 分发）。
- list 项字段：`r2a_store.rs:142-151`（Summary）、`:1166-1186`（render_list 列）；
  DSH `cost_usd` 恒 None：`:202-203`。
- 排序非时间序：`crates/agent-vitals-core/src/r2a.rs:22`、`:149-152`（四元组序）。
- 日期过滤交叠语义：`r2a.rs:201-216`；degraded 会话（date None）在有日期过滤时被排除：
  `r2a.rs:188-189`。
- 工作台会话 tab：`src-tauri/ui/workbench.js:414`（冷 cache 几十秒）、`:493-505`
  （详情打开）、`:523`（成本 USD / DSH "—"）。
- 托盘无 Submenu 先例、无 host 显示名映射（工作台显示 raw host_kind，`workbench.js:465`）。
- CodexBar（steipete/CodexBar）：Swift 原生、每 provider 一图标 + popover tiles
  （用量条/reset 倒计时）、会话/成本历史在持久化 Settings → Usage & Spend 视图、
  popover 不列会话。
