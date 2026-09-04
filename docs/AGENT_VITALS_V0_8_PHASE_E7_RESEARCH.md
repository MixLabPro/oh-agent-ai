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
E7.2  analysis.rs + overlap.rs → agent-vitals-domain/src/domain/skills/
      已核实零 I/O，但需要确认是否引用 frontmatter.rs 的类型（E7.1 之后才知道
      导入路径怎么改）。
E7.3  security.rs → agent-vitals-domain/src/domain/skills/security_rules.rs
      1 处 I/O 命中需要先读上下文确认是读文件内容（该留在 sources）还是纯粹
      读已经在内存里的字符串（该留在 domain）。
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

## 3. 不确定项（留给执行到那一步时核实，不在此提前假设）

- DSH 是否需要 `hosts/dsh/skills/`——`apps/cli/src/skills/` 里没有 dsh 专属
  文件，可能 DSH 的 skill 证据走 `hosts/dsh/sessions/` 或另一条路径，需要
  执行到 E7.6 附近再查。
- `doctor.rs`/`explain.rs`/`report.rs` 等"零 I/O 但看着像业务逻辑"的文件，
  最终该落 `apps/cli`（CLI 展示层）还是 `agent-vitals-runtime`（Tauri 复用的
  service 投影）——不是 I/O 命中数能回答的问题，需要读函数签名判断"是不是
  Tauri 菜单栏也需要同一份逻辑"。
