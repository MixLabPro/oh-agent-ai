# v0.8 Phase E7 —— Skill Surface 宿主归位（收口缺口）

> 用户 2026-09-04 审阅发现的真实缺口：`crates/agent-vitals-hosts` 的模块文档
> （CLAUDE.md「D4/D5 填」那句）早就声明每个宿主该有 `sessions/` **和**
> `skills/` 两个子树，但 D4/D5 实际执行时只做了 `sessions/`（会话 I/O 迁移），
> `skills/` 从未被碰过——**Skill Surface 的宿主适配逻辑仍整个留在
> `apps/cli/src/skills/`**，没有跟着 Session Surface 一起做 hosts/domain/
> runtime 三层归位。已用 `find`/`wc -l`/`grep` 核实：
> `crates/agent-vitals-hosts/src/hosts/<h>/` 目前只有 `sessions/` 子目录，
> 没有任何 `skills/` 子目录；`apps/cli/src/skills/` 18 个文件、共 7589 行，
> 混着纯解析、跨宿主编排、宿主专有解释、CLI 渲染四种职责在一起。
>
> **这是需要更正的记录**：此前几次提交把 Phase E 报告为"全部完成"，准确说法
> 应为——**Session Surface 的宿主归位（D1/D4/D5）已完成；Skill Surface 的宿主
> 归位从未开始，是本阶段之前遗漏的缺口，不是明确不做的范围**（与 D6 里
> `r2a_store.rs`/`discovery.rs` 那种"评估过、有документированный理由留下"的
> 情况不同——这里是真的没做）。

## 1. 目标结构（用户提案，经文件级核实调整）

```
apps/cli/src/
  commands/skills.rs          # 参数解析、调用 runtime service、JSON/终端渲染

crates/agent-vitals-runtime/src/skills/
  inventory.rs                 # 跨宿主编排（今 apps/cli/src/skills/inventory.rs）
  scanner.rs                   # 通用目录遍历（discovery.rs 里与宿主无关的部分）
  snapshot.rs                  # 本机快照/diff/状态写入（今 skills/snapshot.rs，5 处 I/O）
  service.rs                   # CLI/Tauri 共用入口

crates/agent-vitals-domain/src/domain/skills/
  frontmatter.rs                # 纯解析（今 skills/frontmatter.rs，已核实零 I/O）
  analysis.rs                   # overlap/规则/通用分析（今 analysis.rs 792 行，零 I/O）
  overlap.rs                    # 今 overlap.rs，零 I/O
  security_rules.rs             # 对"已读文本"的纯规则判断（今 security.rs，348 行，
                                 # 1 处 I/O 命中——需要先把那 1 处剥给 sources，规则本身纯）

crates/agent-vitals-hosts/src/hosts/<h>/skills/
  claude_code/skills/           # 今 host.rs 里 claude-code 专属部分（197 行，零 I/O
                                 # 命中——是不是真的零 I/O 需要读完全文确认，host.rs
                                 # 可能只是解释已读的 enabledPlugins/skillUsage 结构，
                                 # 不代表它不该属于 claude_code host）
  codex/{skills.rs,sources.rs}  # 今 codex.rs（383 行，3 处 I/O）
  openclaw/{skills.rs,sources.rs} # 今 openclaw.rs（404 行，16 处 I/O——命中最多，
                                 # 说明大部分是宿主专有读取逻辑，拆分优先级低但工作量大）
  workbuddy/{skills.rs,sources.rs} # 今 workbuddy.rs（341 行，9 处 I/O）
  dsh/skills/                   # 目前 apps/cli/src/skills/ 里没有 dsh 专属文件——
                                 # DSH 的 skill 面证据可能走别的路径，需要先确认再决定
                                 # 是否需要新建

CLI 展示层留在 apps/cli（不进 runtime，Tauri 若复用走 runtime 的 service）：
  doctor.rs（966 行）、explain.rs（637 行）、report.rs（236 行）、
  render.rs（357 行）、redact.rs（506 行）、diff.rs（295 行）
```

**核实结果与用户原提案的差异**：用户提案把 `doctor.rs`/`report.rs`/`explain.rs`
标"取决于是否还需由 Tauri 复用"——实测这三个文件 + `render.rs`/`redact.rs`/
`diff.rs` 目前 I/O 命中数是 0（`doctor`/`explain`/`report`/`render`/`redact`）
或很低（`diff.rs` 1 处），**是不是"CLI 展示层"不能只看 I/O 命中数判断**——
它们可能是"读已经收集好的 `SkillVital` 结构、渲染成文字/JSON"，本质是纯函数，
但服务的是"人读的报告格式"而不是"跨宿主可复用的领域模型"，这条边界需要在
真正动这几个文件时逐个读函数签名确认，本文档只记录第一轮基于 grep 的粗判。

**⚠️ 对用户原提案的一处必要修正**：`agent-vitals-domain/src/domain/skill.rs`
**已经存在**——是 Session Surface 的「skill 执行审计」模块（`SkillInvocationEvent`
等，agent 家族，单数 `skill`），与本阶段要搬的 Skill Surface「静态体检」（`skills`
家族，复数）是本仓库刻意分开、专门写测试钉住的两个东西（CLAUDE.md：「有两个都
叫『skill』的东西，按名字猜会互相进错门…`skills/` 是 skill 体检…`agent/` 是
skill 执行…名字像扫描器的 `skill.py`/`skill.rs` 属 agent 家族」）。如果照用户
原提案把新代码放进 `domain/skill/`（单数目录），Rust 会因为 `skill.rs` 与
`skill/` 同名冲突编译不过，就算改名躲开冲突也是把这场本仓库已经吃过亏的命名
陷阱重新引入一次。**改用复数 `domain/skills/`**——与仓库里所有其他"静态体检"
目录（`apps/cli/src/skills/`、`packages/.../agent_vitals/skills/`）的复数命名
一致，`domain/skill.rs`（单数）不动。

## 2. 分步计划（比照 D1-D7 的节奏，每步独立小提交、全量门禁绿）

```
E7.1  frontmatter.rs → agent-vitals-domain/src/domain/skills/frontmatter.rs
      最小、最安全的第一步：已核实零 I/O、零宿主专有逻辑，167 行。
      ✅ 完成（`a4488c2`）。
E7.2  analysis.rs + overlap.rs → agent-vitals-domain/src/domain/skills/
      ✅ 完成。没有引用 frontmatter.rs 的类型（原猜测落空），但比预想更深：
      两个文件依赖 main.rs 顶层 8 个 `pub(crate)` helper——JSON 取值助手
      `s`/`i`/`f`/`b`/`chars`（5 个，跨 skills/ 和 agent/ 广泛复用）+ Skill
      冲突/覆盖排序簇 `level_rank`/`level_rank_for`/`severity_rank`/
      `conflict_rank`/`CODEX_FALLBACK_DESC_BUDGET`（5 个，仅 analysis.rs 用）
      + `layer_of`（discovery.rs 也用）。全部先迁：JSON 助手 → `domain::util`，
      排序簇 → 新增 `domain::skills::ranking`（`domain::skill.rs` 单数已占用，
      同 E7.1 的命名教训）。main.rs 保留 `pub(crate) use` 让未跟着迁的调用点
      （doctor.rs/explain.rs/report.rs/snapshot.rs/agent/oneline.rs 用
      `s`/`i`/`f`/`b`；discovery.rs 用 `layer_of`）零改动；`conflict_rank`/
      `level_rank`/`level_rank_for`/`CODEX_FALLBACK_DESC_BUDGET`/`chars`
      搬完后在 apps/cli 里已无调用点，不再 re-export（`doctor.rs` 恰好有自己
      独立同名的 `severity_rank` 实现，是两个不同函数，不是同一份代码的两个
      入口，也顺带没被误删）。golden 15+15 逐字节一致，证明纯移动零行为漂移。
E7.3  security.rs → agent-vitals-domain/src/domain/skills/security_rules.rs
      ✅ 完成。核实结果：不是 1 处 I/O，是 3 处（`std::fs::metadata`
      读权限位、`read_lossy` 读文件内容、`Path::canonicalize` 判 self-
      exclusion），且**这次不是移动，是拆**——原 `security_scan` 把目录遍历/
      读文件/读权限位焊在正则规则判断的同一个函数里。拆法：`Rule`/`rules`/
      `is_cited`/`worst`/`check`/`EXEC_EXT` 纯规则引擎 + 新写的 `evaluate()`
      （接收调用方已收集好的 `(相对路径, 是否可执行, 读到的文本)` 三元组，
      做原 `security_scan` 里除 I/O 之外的全部逻辑：去重/cited 统计/URL 提取/
      结果组装）+ `self_excluded_result()` 进 domain；`apps/cli/src/skills/
      security.rs` 收缩成只剩 `mode_of` + 目录遍历循环 + `canonicalize`
      判定的 I/O 薄壳，收集完数据调 `evaluate()`。`doctor.rs` 唯一的跨模块
      调用点（`rule_names()`，无 `#[cfg(test)]`——domain 侧不能再标 test-only，
      否则 apps/cli 用普通依赖模式编译时这个跨 crate 测试调用点找不到符号）
      改指 `agent_vitals_domain::skills::security_rules::rule_names`。
      顺手清了 `apps/cli/src/util.rs` 里 `split_lines` re-export 从「有真实
      调用点」变成「只剩测试用」后 `cargo build --release` 冒出的
      unused_imports（改成 test 模块内部 import，不改变覆盖范围）。
      golden 15+15 逐字节一致——这是本轮唯一一次「拆」而非「搬」，golden
      过了才真正证明零行为漂移，不是靠"只挪没改"的先验保证。
E7.4  snapshot.rs → agent-vitals-runtime/src/skills/snapshot.rs
      5 处 I/O，本机快照读写——与 D6 的 state/budget/takeover 同类，是 runtime
      的天然归属。
E7.5  inventory.rs + discovery.rs 拆分 → runtime/skills/{inventory,scanner}.rs
      discovery.rs 963 行是这次最大最复杂的一块——4 处 I/O 命中不代表只有 4 处
      跟宿主相关，需要通读，可能还要再拆出 hosts/<h>/skills/ 的部分（哪些目录
      算"这个宿主的 skill 根"是宿主专有知识，不是通用扫描逻辑）。
E7.6  codex.rs / openclaw.rs / workbuddy.rs / host.rs → hosts/<h>/skills/
      + hosts/<h>/sources/skills.rs（I/O 部分，feature-gated，复用 D4/D5 已经
      搭好的 sources feature）。四个宿主逐个做，workbuddy 和 openclaw I/O
      命中最多，工作量最大。
E7.7  apps/cli/src/skills/mod.rs 收敛成 apps/cli/src/commands/skills.rs
      （参数解析 + 调用 runtime service + 渲染），doctor/explain/report/render/
      redact/diff 视 E7.1-E7.6 结果决定去留（大概率留在 CLI，逐个核实）。
```

**本文档创建时只完成到规划**——E7.1 是唯一在本轮实际执行的子步骤，其余留给
后续轮次，与 D2-D7 当初"规模现实：不是一次会话能全部完成"的评估同理，只是
这次没有独立 worktree 分工，全在主 worktree 逐步做。

## 4. 用户 2026-09-04 第二轮审阅：E7 范围应扩大到 `apps/cli/src/agent/`

Skill Surface 之外，`apps/cli/src/agent/`（历史遗留的"会话产品应用层"，
约 8745 行）同样混着宿主解析、事实发射、状态写入、会话查询、CLI 展示，边界
不干净。用户给出的文件级判断（摘要，完整表见 review 原文）：

- **明确的宿主 adapter，该搬**：`claude_usage_fact.rs`/`codex_usage_fact.rs`/
  `dsh_usage_fact.rs`（三份 UsageFact 发射器，Claude/Codex/DSH → `hosts/<h>/
  sessions/usage_fact.rs`）。
- **不是 Host adapter、是 Runtime 的跨宿主服务，体量最大**：`r2a_store.rs`
  （2708 行——跨 Claude/Codex/DSH 的 session cache/分页/查询/findings，用户
  原话"是 v0.9 数据底座的核心迁移对象"）。
- **该拆成"宿主 fold"与"Runtime 写账/投影"两半**：`claude_cost.rs`（逐会话
  fold + ledger/checkpoint 写入）、`oneline.rs`（DSH 折账 + state 写入 + 报告
  输出）。
- **入口位置错、规则不重复**：`behavior.rs`（DSH session 审计的 CLI 薄组合，
  该挪进 `runtime/session_audit_service.rs`）、`codex_cost.rs`（fold 结果计价，
  该拆 Domain cost projection + Runtime catalog/projection）、
  `codex_session_audit.rs`（组装单会话成本/证据/HTML，是跨"成本、证据、报告"
  的产品投影，**不该进 `hosts/codex`**，该进 Runtime session projection
  service）。
- **纯 re-export shim，无价值重复**：`cost.rs`/`plan.rs`——直接删，CLI 改依赖
  Domain。
- **registry，不是宿主专属**：`host_runtime_registration.rs` → `agent-vitals-
  hosts` registry 或 Runtime registry。

**核心原则（用户原话）**："架构关键不是『按文件来源搬家』，而是把能力按可
复用边界拆开"——宿主特有事实（JSONL/rollout/zstd 格式、token/工具调用识别、
各宿主 skill roots/MCP 命名）进 `hosts/<h>/`；任何宿主都成立的纯规则（稳定
ID、成本口径、指标公式、Finding/Issue/Remedy 契约）进 `domain/`；把多宿主
数据跑成产品能力（扫描编排、写入、缓存、索引、会话查询、预算、coverage、
重建、同步）进 `runtime/`；用户如何调用和看到它留 `apps/cli`/`apps/desktop`。
`r2a_store.rs` 的"列出所有会话、跨宿主分页、生成 navigation DTO"是通用
Runtime 能力，但"如何从 Codex rollout 得到逻辑 session id"必须留在 Codex
host——**不能把所有 `agent/` 文件都挪进 `hosts/`，那会让每个宿主各自长出
一套 writer/cache/会话分页/账目逻辑，等于重新制造本来要消灭的重复**。

**范围判断**：这轮分析质量高、方向与 E7.1 已验证的纪律一致（先读文件、别
假设），但体量比原 E7（仅 Skill Surface）几乎翻倍，且触及的 `r2a_store.rs`
被用户自己定性为"v0.9 数据底座核心"——已经不完全是"把 v0.8 该做的事补完"，
而是开始触及下一个大版本的数据面工作。**本轮（截至
`0b562c4`）不在这个新扩大的范围里再往下执行**——先把分析原文和判断记录进
本文档，值不值得现在继续做、还是先按当前已完成的 D/E/E7.1/F1a 收一次尾，
留给用户决定。

## 3. 不确定项（留给执行到那一步时核实，不在此提前假设）

- DSH 是否需要 `hosts/dsh/skills/`——`apps/cli/src/skills/` 里没有 dsh 专属
  文件，可能 DSH 的 skill 证据走 `hosts/dsh/sessions/` 或另一条路径，需要
  执行到 E7.6 附近再查。
- `doctor.rs`/`explain.rs`/`report.rs` 等"零 I/O 但看着像业务逻辑"的文件，
  最终该落 `apps/cli`（CLI 展示层）还是 `agent-vitals-runtime`（Tauri 复用的
  service 投影）——不是 I/O 命中数能回答的问题，需要读函数签名判断"是不是
  Tauri 菜单栏也需要同一份逻辑"。
