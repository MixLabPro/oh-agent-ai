# Codex 会话审计信号挖掘 — Spec

> 状态：**已批准**（2026-08-30）。落盘于 `docs/`，实现分 Phase A / Phase B 两个提交。
> 来源：对真实会话 `01a029cb`（2026-08-22，`gpt-5.6-sol`，paginated，`codex_work_desktop`）
> 的逐字段深挖——六类证据被当前审计丢弃，本 spec 把它们接回来。

## 1. Context：线格式里被丢弃的证据

对 `/Users/Admin/.codex/sessions/2026/08/22/rollout-2026-08-22T22-06-31-01a029cb-692f-7be0-b984-2ed06347eea9.jsonl`
（208 行、25 分钟、$3.38 / 114.5 万 tokens）实测，当前 19 信号模型 + codex-session 报告
丢弃以下证据：

| # | 证据 | 实测（01a029cb） | 现状 |
|---|---|---|---|
| 1 | **配额消耗轨迹** | `rate_limits.primary.used_percent` 24 个快照，19%→20%（本会话消耗周配额 1 个百分点） | fold 只保留最后一条 plan 快照（`_combine_plan` last-seen wins），轨迹被丢弃 |
| 2 | **active_permission_profile** | 6 个 turn 激活 `:danger-full-access`、8 个 turn 为 null（「保持上一档」语义）；静态 `permission_profile` 恒 `{type: disabled}` | 全仓零提取（grep 无命中）——比静态 sandbox_policy 细一个粒度的 per-turn 权限档位 |
| 3 | **turn 结束原因** | 14 个 turn 全 `error=None, reason=None`（干净结束） | canonical 的 `turns` timeline 已提取 `end_reason_kind`/`end_error_code`，审计层转 `codex_evidence_json` 时丢弃 |
| 4 | **effort / reasoning_effort** | 恒 `"low"`；`thread_settings.reasoning_effort:"low"` + `reasoning_summary:"detailed"` | 零提取——§3.1 的 Policy 类伴随变量，与成本/推理强度强相关 |
| 5 | **工具 stdout 体积** | 5 条 CommandExecution 共 9150B stdout（2641/2045/2080/2096/288B） | ToolResults 只数 presence，不数「多少字节灌进上下文」 |
| 6 | **duration 语义** | `{secs:0, nanos:4416-9250}` = **4–9µs**——sed 读 2KB 文件不可能 9µs，**不是进程墙钟** | §13 矩阵声称 `CommandExecutionItem.duration` → measured，注释称「也喂 Tool-call duration」——实为误导 |

附注：`turn_context.comp_hash` 14 个 turn 恒 `3000`——本会话零压缩，**Compaction=0 是如实
的**；且该字段是未来的**免费压缩证据载体**（跨 turn 变化即压缩发生，不依赖
`context_compacted` 事件）。本 spec 只注记不实现。

## 2. 设计决策

- **D1 分层线 = 消费方**：`Signal` enum 只放有检测器/聚合消费的维度。六项里只有**配额**
  是真正的新维度（contract §8「Quota is a third, distinct kind of cost」；日历/菜单栏/
  quota 规则将来都吃它）→ **新增 1 个 enum 信号 `QuotaConsumption`**。其余五项是已有信号
  的数据富化或防御性更正，进报告不进 enum。先例：§13 矩阵本就有非 enum 维度行
  （Tool-call duration / Workspace root / Storage medium / Process liveness）。
- **D2 不动 fold**：配额轨迹在**审计层**扫 `all_items`（`_context_window_of` 先例：
  `codex_session_audit.py:58-80` ↔ `src/agent/codex_session_audit.rs:57-75`）。
  `codex_fold_file`/`codex_merge_folds`/`codex-cost` 锁步**零风险**——探索确认 fold 输出
  不序列化、四键形状被 characterization 钉死，改它得不偿失。
- **D3 turn 结束从 canonical 取**：审计层现把 `build_codex_evidence` 返回的 canonical 丢弃
  （py `codex_session_audit.py:186-189` 转 json 即丢）——改为**保留 canonical**，从
  `canonical.turns` 聚合 end_reason_kind/end_error_code 分布。复用 `populate_codex_timelines`
  的配对状态机，不重扫 items（第二份配对逻辑必然漂移）。
- **D4 模板不加 JS 折叠**：所有数值在 Python/Rust 审计层**预计算**，模板只显示。新字段
  的锁步由 `both()` 差分天然覆盖（新 key = 新字节），不新增 verify 脚本。
- **D5 duration 不读数**：实测微秒级非墙钟，语义待 Codex 上游澄清。本 spec 只做
  **文档/注释更正**（防御），不引入 duration 信号、不接 duration-audit。

## 3. 数据形状（`codex-session --json` 新 key）

插入位置：`date_span` 之后、`cost_report` 之前（Python
`codex_session_audit.py:194-211` dict、Rust `src/agent/codex_session_audit.rs:233-255`
Map，**同序号插入**；键序是字节一致的一部分，不能重排）。

```json
"quota_trajectory": {                     // 审计层扫 all_items 的 token_count.rate_limits
  "first": {"used_percent": 19.0, "observed_at": "2026-08-22T14:07:33.058Z"},
  "last":  {"used_percent": 20.0, "observed_at": "2026-08-22T14:32:49.509Z"},
  "consumed_percent": 1.0                 // last-first；first 缺失 → null
},
"permission_trajectory": [                // 按 turn_context 事件序
  {"turn": 1, "active_profile": ":danger-full-access",   // null 允许（保持上一档）
   "sandbox": "danger-full-access", "approval": "never"}
],
"turn_ends": {"total": 14, "clean": 14, "error": 0, "codes": {}},   // 来自 canonical.turns
"effort": {"effort": "low", "reasoning_effort": "low",               // last-seen wins
           "reasoning_summary": "detailed"},
"tool_output_bytes": {"stdout": 9150, "stderr": 0, "commands": 5}    // CommandExecution 求和
```

实现纪律：

- **严格类型镜像 serde_json**（`as_i64`/`as_f64` ↔ isinstance + bool 排除），扫描 helper 仿
  `_context_window_of` 的写法。
- **used_percent 提取复用** `codex_usage._plan_from_rate_limits`（py `codex_usage.py:92` ↔
  rust `codex_usage.rs:182`）的字段读取口径，不重写第二份字段路径。
- `quota_trajectory.first/last` 为「有效 used_percent 的首/末快照」；只有 1 个快照时
  first==last、consumed=0；0 个快照时整键 `null`（`_empty_cost_report` 式兜底，绝不编数）。

## 4. Phase A — 报告富化（无 enum 变更）

### 4.1 双实现审计层（锁步铁律）

- `scripts/agent_vitals/agent/codex_session_audit.py`：新增 5 个 scan helper（
  `_quota_trajectory_of` / `_permission_trajectory_of` / `_turn_ends_of` /
  `_effort_of` / `_tool_output_bytes_of`），`codex_session_audit_json` 插入 5 个 key；
  **保留** `build_codex_evidence` 返回的 canonical（现 py:186-189 丢弃），`turn_ends` 从
  `canonical["turns"]` 聚合。
- `src/agent/codex_session_audit.rs`：同结构镜像（`FileInfo.items` 已在手 rs:47/107）。

### 4.2 模板 `scripts/agent_vitals/templates/codex_session.html`

- 配额轨迹：`#s-plan` 区块（:360-393）加一行「本会话消耗配额 N 个百分点（A%→B%）」。
- 权限轨迹：`#s-timeline` 与 `#s-plan` 之间（:134/:145）新 subcard「权限轨迹（per turn）」，
  逐 turn `.sv-kv`/`.sv-tag` 行。
- turn 结束：`#s-coverage` / provenance 一行（`.sv-insight`）。
- effort：topbar-chips 徽章。
- 工具输出体积：`#s-coverage` 一行（「工具输出 N KB 进上下文」）。
- **无新 JS 折叠**（D4），全部读预计算字段。

### 4.3 防御性文档/注释更正（D5 + comp_hash）

- `docs/RUNTIME_EVIDENCE_CONTRACT.md:561` §13 Tool-call duration 行 Codex-Paginated cell 加
  「⚠️ 实测 4–9µs 非墙钟，语义待澄清」脚注；`:623` TurnItem 表 duration 句同。
- `crates/agent-vitals-core/src/codex_evidence.rs:403-404` 过时注释（「CommandExecution
  额外带 duration → 也喂 Tool-call duration」——实际从未喂）改为诚实话；
  `codex_evidence.py:218-220` 同源注释同步。
- comp_hash 注记：`scripts/agent_vitals/adapters/codex_session.py:116`（turn_context 分支）
  + Rust `src/agent/codex_session.rs:103` + contract §14.1。
- 记忆 `codex-corpus-facts.md` 补 duration 语义实测 + comp_hash 事实。

### 4.4 测试

- `tests/test_cli_matrix.py::test_codex_session_detail_differential`（:1350）：新 key 语义
  断言（fixtures/codex/cost/ 三文件带 rate_limits，可测 trajectory）。
- `test_codex_session_multi_file_union`（:1431）：多文件 resume 时 trajectory 跨文件
  first/last 正确。
- `tests/test_cli_m3.py::TestCodexSessionHtml`（:647-727）：新 section 结构断言。
- 差分本身由 `both()` 自动钉（新 key 即新字节，Python↔Rust 逐字节相等）。

## 5. Phase B — `QuotaConsumption` 信号（enum 变更，独立提交）

### 5.1 共享层

- `crates/agent-vitals-core/src/evidence.rs`：`Signal::QuotaConsumption`
  （host-neutral 名，不违反 `shared_type_layer_has_no_host_identifiers_in_code`）。

### 5.2 Codex 侧（measured）

- `crates/agent-vitals-core/src/codex_evidence.rs` ALL_SIGNALS（:438）+1；
  `derive_coverage` 的 `token_count` 分支：`rate_limits` 存在 → `bump(QuotaConsumption,
  Measured, 1)`（每事件 1，同 Usage 口径；无 rate_limits 的 token_count 不数——同
  ContextWindow 的守卫式）。
- `scripts/agent_vitals/agent/codex_evidence.py` ALL_SIGNALS（:37-57）+1、derive_coverage
  同步。
- `available: true`（wire 提供，Legacy/Paginated 两种 mode 都持久化）——
  `is_unavailable`/`_UNAVAILABLE_SIGNALS` **不动**（仍是 4 项）。

### 5.3 DSH 侧（honest unavailable）

- `crates/agent-vitals-core/src/dsh_evidence.rs:486-489` 零填充列表 +1
  （`coverage.set(Signal::QuotaConsumption, CoverageCounts::default())`），注释「矩阵没
  覆盖的三行」→ 四行；单测 `unmapped_signals_are_unavailable_not_fabricated`
  （:649-652）列表 +1。
- Python DSH 行为路径（`behavior.py`）无 enum/ALL_SIGNALS，`requires` 不含新信号 → **不动**。

### 5.4 wasm + 文案 19→20

- wasm 重编（core enum 变更波及 `audit_events` 输出）+ 拷进 `dsh-client/` + 跑其 verify
  （锁步铁律：wasm↔CLI 漂移只能靠重跑 wasm build 抓）。
- 文案全量：
  - 模板 subtitle「19 信号覆盖」（codex_session.html:141）→「20 信号覆盖」；
  - `scripts/verify-codex-session-findings.mjs` synthetic 数据：covered 加
    QuotaConsumption、availCount 15→16、KPI 10/16；
  - `tests/test_characterization.py:2872` `test_all_19_signals_appear_in_coverage` → 20；
  - contract §3 enum 列表（:100-118）+ §13 矩阵新行
    `| Quota consumption | unavailable | measured | measured | unavailable | unavailable |`
    （DSH/Claude Code/WorkBuddy 诚实 unavailable——wire 无此字段，将来实测再翻，同
    NetworkAccess 先例）。

## 6. 测试矩阵

| 层 | 测试 |
|---|---|
| 差分锁步 | `AGENT_VITALS_BIN=target/release/agent-vitals python3 -m unittest tests.test_cli_matrix`（新 key 字节级） |
| 审计语义 | test_cli_matrix detail/multi-file 新断言 |
| HTML | test_cli_m3 结构断言；blob 内联 = `--json` 输出，自动覆盖新 key |
| 枚举 | cargo test（dsh 零填充单测 +1）、characterization 20 信号 |
| 模板 JS | verify-codex-session-findings.mjs 更新后经 test_codex_session_template.py 跑 |
| wasm | 重编 + dsh-client verify（Phase B） |

## 7. 验证（端到端）

```bash
cargo test && cargo clippy --release --all-targets -- -D warnings
python3 -m unittest discover tests
AGENT_VITALS_BIN=target/release/agent-vitals python3 -m unittest tests.test_cli_matrix
(cd crates/agent-vitals-wasm && wasm-pack build --target web)   # Phase B
# 真机回归：01a029cb 再跑 codex-session，人工核对 5 个新 key + 模板新区块
```

## 8. Out of scope（后续项）

- 日历/菜单栏聚合配额轨迹（跨会话投影）、quota 烧速检测器规则、codex duration-audit
  消费、comp_hash 实现、name-aware 门控、Claude Code/WorkBuddy/DSH 配额来源实测。

## 9. 交付

Phase A 与 Phase B 各一个提交；本文件即 spec 的正本（草案阶段在
`.claude/plans/cryptic-waddling-floyd.md`）。
