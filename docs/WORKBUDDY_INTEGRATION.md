# WorkBuddy 宿主接入：调研结论与适配边界

> 采集 2026-09-02。本机 `~/.workbuddy/` 真实语料实测（memory：`workbuddy-data-facts`）。
> 关联：[RUNTIME_EVIDENCE_CONTRACT.md](./RUNTIME_EVIDENCE_CONTRACT.md)（§13/§14.6 的 WorkBuddy 对账）·
> [CLAUDE_CODE_INTEGRATION.md](./CLAUDE_CODE_INTEGRATION.md)（同构接入范式的上一例）·
> [MENUBAR_MULTIHOST_NAVIGATION_SPEC.md](./MENUBAR_MULTIHOST_NAVIGATION_SPEC.md)（多宿主导航）·
> [VITALS_CORE_V0_5_IMPLEMENTATION_SPEC.md](./VITALS_CORE_V0_5_IMPLEMENTATION_SPEC.md)（v0.5 架构）。
> 状态：**调研结论 + 设计草案，尚未落地**。数据面证据已实测（§2 的 4 表面 3 可 join、
> audit-log 三层决策账本、traces 会话匿名、credit_json 宿主计价）；§3 规则能力矩阵、§7 决策
> 映射、§8 请求重建已定案（P0 修正版）。§4 的 provenance / `ToolResultObservation.failed` 是
> Claude 接入第一刀落进 `agent-vitals-core` 的既有成果，WorkBuddy 直接复用，**不需要再改 core
> 模型**。评审结论：不修改通用 `vitals-core`、不修改 `agent-vitals-core` 既有证据模型的方向**成立**。

## 0. 结论

WorkBuddy 接入**不需要修改通用 `vitals-core`，也不需要修改 `agent-vitals-core` 的证据模型**
——Claude 接入第一刀已经把 provenance（`TimelineEntry.provenance`）与 `ToolResultObservation.failed`
补进 core，WorkBuddy 需要的全部 observation 类型（`ToolCallObservation`/`ApprovalObservation{asked,decided}`/
`SandboxModeObservation{mode}`/`TurnObservation`/`TimelineEntry`）都已存在。净新增的是一个**适配器**
（`agent-vitals-core/src/workbuddy_evidence.rs` + binary `src/agent/workbuddy_session.rs` + Python
镜像三个文件），外加一个**新依赖类**：rusqlite（bundled，仅二进制侧，§1.4）。

正确层级（与 Claude §0 同构）：

```text
~/.workbuddy/{workbuddy.db, audit-log/*.jsonl, file-history/<sessionId>/}
→ WorkBuddyEvidence {           ← 与 claude_code_evidence.rs / codex_evidence.rs 同层
    canonical: CanonicalSession,
    raw_records
  }
→ compatibility/canonical_session.rs::canonical_session_to_vitals()
→ CanonicalEvent → Detector
```

**不要写 `workbuddy.db → CanonicalEvent` 直连**——理由与 Claude 相同：绕开五条通用 timeline、
Coverage 三态、SourceAttempt 与既有兼容测试路径（§1.1）。

**与 Claude/DSH/Codex 的关键差异**（全部来自实测，§2）：

- 会话数据**不在一个文件里**，而是三张可 join 表面 + 一张接不进 session 的表面（traces）。
  适配器的 locate/shape 阶段按 `sessionId` 把 db 行、audit-log 记录、file-history 目录**拼装**
  成一条会话；traces 按 §14.4 记 attempts、标 Unavailable，**绝不猜 session**。
- audit-log 是**安全决策账本**，不是逐请求账本（13/22 requestId 可 join）。工具调用只有
  **bash 子集**（`commandPreview`）+ **WebFetch**（`messageParams.target`）可 join；
  write/edit/subagent/duration 证据只在匿名 traces 里 → SV604/605 降级 Unavailable（§3）。
- 成本是**宿主自己按人民币记的账**（`session_usage.credit_json`），不是 token 桶 × 单价——
  **不涉及 pricing.json，不涨第四份价格拷贝**（§9）。
- audit-log 自带 `prevHash→hash` 链，是最老可能轮转的安全账本——完整性校验是适配器的
  职责之一，轮转要诚实标注 verified-from（§2.3、§12.3）。

## 1. 现有链路（代码验证，2026-09-02）

### 1.1 真实接入路径

与 Claude §1.1 同一桥：`crates/agent-vitals-core/src/compatibility/canonical_session.rs`
`canonical_session_to_vitals(&CanonicalSession) -> Vec<CanonicalEvent>` 是唯一合法的
CanonicalSession → CanonicalEvent 桥。WorkBuddy 适配器先产出 `CanonicalSession`，走这条桥，
**不新增第二条桥**。

### 1.2 证据适配器范式（WorkBuddy 的挂载层）

`claude_code_evidence.rs` 是本轮要镜像的范式：适配器持有 `canonical + raw_records`，
`build_workbuddy_evidence` 产出、`workbuddy_evidence_json` 回吐原始形状。与
`claude_code_evidence.rs` / `codex_evidence.rs` / `dsh_evidence.rs` 同层同构。

### 1.3 数据面定位与 join 锚点

本机实测 4 表面（§2.1 表），3 个可 clean-join。**`sessionId` 是唯一 join 锚点**：
db `sessions.id`、`session_usage.session_id`、audit-log 记录的 `sessionId` 字段、
file-history 目录名四处对齐。traces 会话匿名（65% 无法归属），不是 join 面（§12.2）。

### 1.4 第一个 sqlite 读取依赖（设计决策，待评审）

WorkBuddy 的主表面是 SQLite `workbuddy.db`。Python 用 stdlib `sqlite3` 读；Rust 侧
**新增 `rusqlite = { version = "0.31", features = ["bundled"] }`**（仅二进制 root 的
`[dependencies]`，core crate 保持纯函数零 I/O）。理由：

- **差分门禁要求两边读同一个真实 sqlite 夹具**：`test_cli_matrix.py` 的 `both()` 把同一
  个 fixture home 喂给 py==rs 逐字节比对；若 Rust 读不了 db，usage/策略信号两边必分叉。
  JSON 镜像方案（把 db 行导出成 JSON 让两边读）是**同一数据的第二份表示**，产生漂移风险，
  违背「core 是唯一真相源」纪律——不用。
- 零依赖约束只约束**被分发的 Python skill 形式**（CLAUDE.md：「what is *distributed* as the
  in-host skill」）；Rust binary 通道（npm/brew/cargo/Release）本就带 clap/regex/serde/sha2/
  walkdir/ruzstd 等常规 crates.io 依赖，`ruzstd` 先例（2026-08-30 用户拍板）已确认这一条。
- `bundled` 编译 sqlite3.c，构建期需要 C 工具链（macOS clang / CI ubuntu gcc 都有）；
  CI `cargo test`/`clippy` 构建时间略有增加，可接受。
- wasm crate 不依赖 root 的 `[dependencies]`，WorkBuddy 也不是 DSH tab 面，**不重建 wasm**（§6）。

### 1.5 TrajectoryAssigner 的职责边界（同 Claude §1.3，评审 P0-2 已验证）

turn/step/请求重建、工具调用关联必须在**适配器的 derive 阶段**完成并写进
`CanonicalSession` timeline；TrajectoryAssigner 只做 `CanonicalEvent → TrajectoryId`，
不挂 turn 状态机（WorkBuddy 没有 turn 结构可挂，§8）。

### 1.6 SignalVocabulary 不需要 WorkBuddy 专属词表（同 Claude §1.4，评审 P0-3 已验证）

适配器统一输出**已有 canonical kinds**：audit-log `commandPreview` → `agent.tool_call`
（`tool_name="bash"`）、`WebFetch` → `agent.tool_call`（`tool_name="web_fetch"`）、
审批/拒绝决策 → `approval/asked` + `approval/decided`。不需要新增 WorkBuddy 专属词表。

## 2. WorkBuddy 数据面（实测 2026-09-02）

### 2.1 表面清单（4 表面，3 个可 clean-join）

| 表面 | 本机实测 | join key | 对适配的价值 |
|---|---|---|---|
| `workbuddy.db` `sessions` | 22 行 | id | 元数据 / `permission_mode` / `model` / `cwd` / 时间戳 |
| `workbuddy.db` `session_usage` | 22 行 | session_id | `used`(token) / `size` / `credit_json`(宿主计费) |
| `audit-log/*.jsonl` | 23 文件 / 2563 条 / 23 sessionId（21 在 DB） | 记录内 `sessionId` 字段 | 安全决策账本（命令/网络/批量删除），自带 hash 链 |
| `file-history/<sessionId>/<contentHash>@v<n>` | 16 会话 / 730 文件 | 目录名 | 文件内容快照（**无路径**，只有内容 hash@版本） |
| `traces/<pid>/trace_<id>.json` | 670 文件 / 652MB / 103 pid | **无**（会话匿名） | span 树：tool calls + generations + duration —— **接不进 session，不作为 join 面** |

**三条读表纪律**：

- **audit-log 按记录内 `sessionId` 字段分组，不是按文件名**（真实文件名与 sessionId 未必
  对应）；文件名只用于枚举 `audit-log/*.jsonl`。
- **db 列按名读取**：`sessions` 读 `id/permission_mode/model/cwd` 及时间戳，`session_usage`
  读 `session_id/used/size/credit_json`。任何必需列缺失 → 该信号报 Unavailable，**绝不编造**
  （缺列报缺，编列害人）。
- **file-history 只数版本数**（目录下 `@v<n>` 文件数 = FileMutations measured），内容 hash
  与版本号原样保留，**路径不存在**——SV604/605 在 WorkBuddy 上结构性无解（§3）。

### 2.2 audit-log 是三层决策账本（比 §13 的「security decisions」更细）

每条记录字段（并集）：`sessionId / requestId / toolCallId / category / eventType / decision /
commandPreview / commandHash / messageKey / messageParams / timestamp / sequence / prevHash /
hash`。命令类记录带 `commandPreview`/`commandHash`，网络/审批类带 `messageKey`/`messageParams`。
三类决策路径（实测计数）：

| 路径 | eventType | decision | 适配价值 |
|---|---|---|---|
| 命令进沙箱执行 | `command-safety.sandbox-executed`（2391） | `allowed` | `commandPreview` 是完整 bash 命令 → **SV601-603 的 exec→bash 源**；沙箱轴 |
| 命令需批准放行 | `approval.commandApproved`（1） | `approved` | 审批轴：asked + decided |
| 命令被用户拒绝 | `rejection.commandRejected`（11） | `rejected` | 审批轴：asked + decided(rejected) |
| 批量删除审批流 | `file-safety.bulk-delete.{needs-approval,approved,rejected}`（34/28/6） | — | 审批轴；`messageParams` 有 count/threshold/targets |
| 网页抓取 | `WebFetch`（75） | `allowed` | `messageParams.target`=URL → **SV606 源** |

### 2.3 链路完整性：`prevHash→hash` 链

记录按 `sequence` 排序后，`records[i+1].prevHash == records[i].hash` 实测 99.8% 链接连续
（8d4719f0 188/188 全连；少量 seq 跳号来自并发 spool 写）。**最老记录可能被轮转**：
5018bac6 从 seq=1268 起、首条 prevHash 指向不存在的旧链。

适配器的校验职责（§4）：**验证链路连续性**（`prevHash[i+1] == hash[i]`，纯结构校验，
不重算 hash 算法），report `verified_from = 首条记录的 sequence`；首条 prevHash 非空且
匹配不到任何记录 → note「最老记录可能被轮转，链从 seq=N 起验证」——**绝不假定链完整**。
`sha2` 已在二进制依赖里，但结构校验只需要字符串相等，不需要算 hash。

### 2.4 关键口径：audit-log 不是逐请求账本

`credit_json` 的 22 个 requestId 里只有 13（59%）出现在同 session 的 audit-log——其余 41%
的请求没有安全决策（没跑命令/没上网/没批量删除）。**不能拿 audit-log 当请求/轮次计数**，
它只记录安全相关动作。因此 TurnBoundaries 只能按 `requestId` 去重得**下界**（§8）。

## 3. 规则能力矩阵（评审 P0-4 修正版）

判据沿用 §7.4.1：**该信号在本输入里有没有可消费事件**，不是 coverage 计数。
实测结论（memory `workbuddy-data-facts` §13 对账 + 本设计定稿）：

| 规则 | WorkBuddy 判定 | 依据 |
|---|---|---|
| SV601–603（bash 命令族） | **Available** | `command-safety.sandbox-executed` 的 `commandPreview` → bash `args_text`（SV601-603 的 exec→bash 源）。**只覆盖 bash 子集**——其余工具名只在匿名 traces 里 |
| SV604（敏感路径 write/edit） | **Unavailable**（宿主能力降级） | write/edit 调用在 WorkBuddy 只在匿名 traces 的 function span 里；file-history 有内容无路径。可 join 的 tool_calls 结构性不含 write/edit → 测不出来就是假阴性，报 Unavailable（§3.1） |
| SV605（write/edit 出 workspace） | **Unavailable**（同上） | 同上 |
| SV606（内网 web_fetch） | **Available** | `WebFetch` 事件 → `tool_name="web_fetch"`、`args_text=messageParams.target`；`_INTERNAL_IP_URL_RE` 直接跑 |
| SV607（拒绝/中止） | **Unavailable** | audit-log 无 exit 码；traces 的 `status`/`error` 有但接不进 session。`_DENIED_CODES` 无源 |
| SV608（超时） | **Unavailable** | 无 `TOOL_TIMEOUT` 源 |
| SV609（approval 请求） | **Available** | `commandApproved`/`commandRejected`/`bulk-delete.*` → `approval/asked`（有记录时）；健康会话无审批记录则走 timeline gate 报 Unavailable（§3.2） |
| SV610（危险授权/sandbox） | **Available**（诚实 MeasuredZero） | `sandbox-executed` → SandboxModes 非空，SV610 可跑；但 WorkBuddy 的 `permission_mode` 只有 `bypassPermissions`/`fullAccess` 两值，**不等于 DSH 的 `danger-full-access`**（use_sandbox_cli 恒 1，命令永远进沙箱），词表不翻译 → 诚实 MeasuredZero（§3.3） |
| SV611（重复调用） | **Available** | 在 bash+web_fetch 子集上跑 `(name, args_text)` 去重；audit-log 的 `commandHash`+`commandPreview` 是同一语义的两面（§7） |
| SV612（turn 分组） | **Unavailable** | 无 turn 结构（audit-log 无 turn/step）；turns timeline 恒空，timeline gate 自然给出 |
| SV613(a/b) | **Unavailable** | requires `[TurnBoundaries, ToolResults]` 双空（turns 空 + results 空）→ OR 门控判定 unavailable |
| SV614 | **Available** | requires `[ApprovalDecisions, SandboxModes]` OR 门控——audit-log 双轴都在，是 OR 门控的天然输入；健康会话 MeasuredZero（§3.4） |

### 3.1 SV604/605 的宿主能力降级（与 Claude 的 SV607/608 override 对称）

Claude 侧：tool_results 存在但 `error_code` 结构性恒 None → SV607/608 从 MeasuredZero
降级 Unavailable（`degrade_sv607_608`）。WorkBuddy 侧同一形状，对象换成 SV604/605：
**可 join 的 tool_calls 结构性只有 bash+web_fetch**，write/edit 证据只在匿名 traces——
SV604/605 在 WorkBuddy 上「规则照跑零命中」就是假阴性。降级发生在**调度层**
（`agent/workbuddy_session_audit.py::workbuddy_audit_projection` + Rust
`src/agent/workbuddy_session.rs::degrade_sv604_605`），**不进共享求值器**
`canonical_audit.audit_projection` / `match_behavior_canonical`——与 Claude 的 override
同纪律。降级 reason 定稿：

```text
workbuddy host capability: only bash (audit-log commandPreview) and web_fetch
(WebFetch target) tool calls are joinable to sessions; write/edit tool calls exist
only in session-anonymous traces (file-history has content without paths), so
SV604/605 cannot discriminate
```

### 3.2 SV609 的三态随会话内容诚实变化

SV609 门控读 `ApprovalDecisions` timeline。audit-log **结构性**承载审批记录（实测
1 commandApproved + 11 commandRejected + 28 bulk-delete.approved），所以 ApprovalDecisions
signal `available=true`；但**具体会话**有没有审批记录决定 SV609 的三态：

- 有审批记录 → SV609 跑 → 有 asked 就出 finding（info）；
- 无审批记录 → approvals timeline 空 → SV609 Unavailable（timeline gate）。

§10 验收的健康会话故意无审批记录（§10.4 数字），审批映射另由 approval-flow 会话钉住（§11.7）。

### 3.3 SV610 的诚实 MeasuredZero（词表不翻译）

DSH 的 `danger-full-access` 语义是「沙箱本身授予无限制访问」。WorkBuddy 的 `permission_mode`
（bypassPermissions/fullAccess）是**审批模式**，且 `use_sandbox_cli` 恒 1（命令永远进沙箱）
——bypassPermissions 也不是 `danger-full-access`。所以 SandboxModes 的 `mode` 直接写
WorkBuddy 原生值（`fullAccess`/`bypassPermissions`），**不翻译成 DSH 词表**；SV610 检查
`mode == "danger-full-access"` 永不命中 → 诚实 MeasuredZero + note。任何「把 fullAccess
映射成 danger-full-access」的改动都是回归（误报）。

### 3.4 SV614 在 WorkBuddy 上可跑

SV614 是 OR 门控（approvals 或 sandbox 任一非空即可跑）。audit-log 双轴都在：
`commandApproved`/`commandRejected`/`bulk-delete.*` → approvals，`sandbox-executed` → sandbox。
所以 SV614 在 WorkBuddy 上**跑得动**：SV614a（同一调用多次请求审批，按 call_id 分组）、
SV614b（连续 ≥3 次拒绝）、SV614c（danger-full-access ≥2）都可用。健康会话 MeasuredZero。

## 4. Provenance 与链路校验（复用 Claude 第一刀，无 core 改动）

Claude 第一刀已把两样东西落进 core，WorkBuddy 直接复用：

1. **`TimelineEntry<T>.provenance`**（evidence.rs）：适配器层类型，兼容桥原样透传。
   WorkBuddy 的 provenance 分配：bash/web_fetch tool_calls、approval/sandbox 决策 = **Measured**
   （audit-log 原生记录）；TurnBoundaries（distinct requestId 去重）= **Derived**（lossy 下界，
   非原生轮次坐标）；无任何 Estimated/Lossy 需要编。Derived 恒 Derived、绝落不进 Measured。
2. **`source_type` 按 `SessionMeta.host_id` 生成**：`workbuddy_session`，不许落回 dsh 名下。

**链路完整性校验放 evidence 层**（§2.3）：canonical 是宿主中立的，hash 链信息不进
`CanonicalSession`，而是 `build_workbuddy_evidence` 读 raw audit-log 记录时算，
结果进 `build_notes()` 的 note（`verified_from` / rotation 标注）。Python 与 Rust 必须
算同一条 note（差分逐字节钉住）——但只需要字符串相等，`sha2` 不参与。

## 5. SessionStore 接入面（本阶段不做，后续阶段）

与 Claude §5 同属一个待办：`SessionStore::workbuddy(home)` + `sessions list --host-kind
workbuddy` + `all()` 合并 + source fingerprint（`~/.workbuddy/workbuddy.db` mtime +
`audit-log/` 目录）等。Claude 的 §11 工作项 7 尚未落地，WorkBuddy 排在其后，本阶段
只做 CLI `workbuddy-session`（§11），不进 SessionStore/Tauri。

## 6. WASM（明确：不重建）

WorkBuddy 不是 DSH audit-tab 的宿主——DSH tab 消费的是 DSH session 事件（`audit_events`
wasm 直喂 DSH 原始形状）。WorkBuddy 接入**不重建 wasm、不拷 pkg/**，与 Claude 同理由：
计算保持 host-side，浏览器不解析 WorkBuddy 原始数据（也没有 tab 消费它）。

## 7. 决策映射（audit-log → canonical timeline）

**先定一条不双计纪律**：审批/拒绝记录（`commandApproved`/`commandRejected`/`bulk-delete.*`）
**只进 approvals 轴**；`sandbox-executed` **只进 tool_calls + sandbox 轴**。两条记录之间不
做 join（被批准的命令是否另有 sandbox-executed 记录不可靠）——独立记录各归各轴，同一
`(sessionId, requestId)` 的跨记录不双计（§10 验收 #6）。

| audit-log 记录 | canonical timeline 条目 | provenance |
|---|---|---|
| `command-safety.sandbox-executed`，`commandPreview=C` | ToolCalls：`{name:"bash", args_text:C}`；SandboxModes：`{mode: permission_mode}` | Measured |
| `WebFetch`，`messageParams.target=U` | ToolCalls：`{name:"web_fetch", args_text:U}` | Measured |
| `approval.commandApproved` / `rejection.commandRejected` | approvals：`asked={tool_name:"bash", reason:messageKey}` + `decided={outcome:"allowed-once"|"rejected"}` | Measured |
| `file-safety.bulk-delete.{approved,rejected}` | approvals：`asked={tool_name:"bulk_delete", reason:messageKey}` + `decided={outcome:"allowed-once"|"rejected"}` | Measured |
| `file-safety.bulk-delete.needs-approval` | approvals：`asked`（无 decided） | Measured |

**decision → outcome 映射**：`approved → "allowed-once"`（一次性放行，与 DSH 语义同）、
`rejected → "rejected"`（直译）。`"allowed-once"` 会让 SV610 出 finding——这正是「WorkBuddy
授予了一次性审批」的诚实审计结果；健康会话没有审批记录，SV610 走 sandbox 轴 MeasuredZero
（§3.3）。`bulk-delete.needs-approval` 只有 `asked` 无 `decided` → 只喂 SV609，不喂 SV610/614
的 decided 分支。

**`args_text` 的 bash 例外**：`commandPreview` 是 shell 字符串，直接作 `args_text`（与
DSH/Codex/Claude 的 bash 处理同一形状）；`WebFetch` 的 `args_text = messageParams.target`。
不需要 Claude §7 的 JSON 键序确定性序列化（audit-log 没有 tool_use.input JSON object）——
但 `commandHash` 保留在 raw_records，作为 SV611 语义同一性的旁证（§3）。

## 8. 请求/轮次重建（WorkBuddy 没有 turn 结构）

**TurnBoundaries 只到「请求」粒度，且是下界**：

- audit-log 记录带 `requestId`；一个 requestId ≈ 一次用户请求的决策流。distinct requestId
  = 该会话可观察的请求数下界（41% 的请求没有安全决策、不进 audit-log，§2.4）。
- 按 §3 的矩阵，**turns timeline 保持空**：不把 distinct requestId 硬填成 `TurnObservation`
  ——那会发明 turn 坐标、且 sig 只有 bash 子集（漏非 bash 工具会漏报循环、短 sig 会误报），
  违背「绝不发明不存在的边界」。TurnBoundaries 的 **coverage** 报 derived=N（下界），规则层
  SV612/613 因 turns timeline 空而 Unavailable——这正是
  `empty_timeline_with_nonzero_coverage_is_unavailable_not_measured_zero` 钉住的模式。
- 时间戳缺失/异常 → 该记录不参与 requestId 去重，记为 attempts（§14.4），不 panic。

## 9. 成本部分（宿主已记账，不重复计价）

**`session_usage.credit_json` = `{requestId: ¥}`**（键与 audit-log requestId 可 join，实测
13/22）。TOTAL ¥4307.76 / 11 会话有 credit，榜首「分析演示模块重构计划」¥1763.88。`used`
= token 计数（5018bac6=218256）。模型分布：deepseek-v4-flash 6 / MiniMax-M3 5 / hy3 4 /
auto 4 / MiniMax-M2.5 2。

三条纪律：

- **cost = 逐会话求 `credit_json` 各 requestId 之和**（值可能是数字或数字字符串，适配器
  稳健求和）。这是宿主自己的账单，**不重新做 token × 单价**——不涉及 pricing.json、
  不长第四份价格拷贝。
- **token = `session_usage.used`** 单值（聚合），**没有逐请求 token**（traces 只有 trace 级
  `totalTokens`，且会话匿名）→ Usage 信号 Unavailable、UsageAggregate measured=1。
- 输出契约：`workbuddy-session --json` 的顶层加一个 `cost` 键
  `{tokens, cny, host_billed: true}`，与 Claude 的 key 序同构（host 各钉各的字节契约，§11.7）。

## 10. 验收章节（新增）

1. 原始 WorkBuddy 字段（audit-log 记录/credit_json/commandHash）不得进入 `vitals-core`；
2. WorkBuddy adapter 必须先生成 `CanonicalSession`，走 `canonical_session_to_vitals` 桥；
3. Derived/Lossy provenance 不得变成 Measured（§4 的 `TimelineEntry.provenance` 测试）；
4. unsupported 规则（SV604/605/607/608/609/612/613）必须 Unavailable，不得 MeasuredZero——
   SV607/608/609/612/613 由 timeline gate 自然给出，SV604/605 是宿主能力降级 override（§3.1）；
5. 跨宿主相同行为产生相同 finding（与 DSH/Codex/Claude fixture 对齐）；
6. 独立记录不双计：审批记录只进 approvals 轴、sandbox-executed 才进 tool_calls 轴（§7）；
7. audit-log 计数是下界（非逐请求账本）；TurnBoundaries derived 下界诚实标注（§8）；
8. hash 链完整性：linkage 校验 + 轮转时 verified-from 标注（§2.3/§4）；
9. cost = credit_json 宿主账单求和（不重复计价），token = `session_usage.used`（§9）；
10. traces 会话匿名：一律 Unavailable + attempts，不得用 prompt 文本里的 UUID 猜 session（§12.2）。

## 11. 接入工作项（依赖序）

1. **rusqlite（bundled）进二进制依赖**（§1.4），core crate 不动；
2. ~~core 证据模型~~ —— 无需改动（Claude 第一刀已备齐 provenance + failed）；
3. **`crates/agent-vitals-core/src/workbuddy_evidence.rs`**：`build_workbuddy_evidence`
   （audit-log → tool_calls/approvals/sandbox timeline + TurnBoundaries derived coverage +
   链路完整性 note）+ `is_unavailable`（ToolResults/StepBoundaries/Usage/ContextWindow/
   QuotaConsumption/SandboxPolicy/Compaction/SubagentSpawns/SkillInvocations/Hooks/
   UserPrompts/UserCorrections）+ `derive_coverage` + `build_notes`。core 单测：
   `approval_records_feed_only_the_approvals_axis`、`rotated_chain_reports_verified_from`、
   `turns_timeline_stays_empty_so_sv612_613_are_unavailable`、`mode_stays_workbuddy_native_not_danger_full_access`；
4. **`src/agent/workbuddy_session.rs`**（binary I/O + CLI）：rusqlite 读 `sessions`/
   `session_usage`、glob `audit-log/*.jsonl` 按 `sessionId` 字段分组、file-history 计数；
   `workbuddy_session_list` / `workbuddy_audit_projection`（用 core `match_behavior_canonical`
   + `degrade_sv604_605`）/ `workbuddy_session_audit_json`；`Cmd::WorkbuddySession` 进
   `src/main.rs` + `pub mod workbuddy_session` 进 `src/agent/mod.rs`；
5. **Python 镜像**：`adapters/workbuddy_session.py`（I/O，sqlite3 stdlib）+ 
   `agent/workbuddy_evidence.py`（derive→coverage）+ `agent/workbuddy_session_audit.py`
   （组合 + `workbuddy_audit_projection` + SV604/605 override + `cost` 块 + list）；
   `workbuddy-session` 子命令进 `scripts/agent_vitals/cli.py`（镜像 claude-session：--list /
   --session（默认最新）/ --json，None → exit 2）；
6. **fixtures/workbuddy/** + `build_workbuddy_fixture.py`（自校验）：真实 sqlite `workbuddy.db`
   + `audit-log/s1.jsonl`（健康会话）+ `audit-log/s2.jsonl`（approval-flow + 轮转链）+
   `file-history/s1|s2/`。builder 确定性、自校验钉死 §10.4 数字（见下）；
7. **tests/test_cli_matrix.py** workbuddy 差分（py==rs 逐字节）：
   `test_workbuddy_session_list_differential`、`test_workbuddy_session_detail_differential`
   （钉死 §10.4 数字 + key 序 + notes 精确串）、`test_workbuddy_session_approval_flow_differential`
   （钉审批映射：approvals timeline 3 条（asked+decided）、SV609 出 3 条 finding、SV610 出
   1 条（allowed-once）、轮转链 verified-from note）、
   `test_workbuddy_session_defaults_to_latest`、`test_workbuddy_session_missing_surfaces_degrade`
   （db/audit-log 缺 → 对应信号 Unavailable，不编造）；
8. **清单守卫三处**：`tests/test_classification.py` `PY_AGENT_FAMILY` 加
   `workbuddy_evidence`/`workbuddy_session_audit`、`RS_AGENT_FAMILY` 加 `workbuddy_session`；
   `tests/test_clawhub_packaging.py` `ALLOWED_PACKAGE_FILES` 加
   `agent/workbuddy_evidence.py`/`agent/workbuddy_session_audit.py`/`adapters/workbuddy_session.py`；
   `.github/workflows/package-clawhub.yml` case-list 同步（三处逐字一致）；
9. **无 wasm、pricing.json 不动**（§6/§9）。

**健康会话 s1 的 §10.4 验收数字**（自校验 + 差分都钉死）：

```text
coverage:  ToolCalls measured=3 (bash×2 + web_fetch×1) · ToolResults available=false
           TurnBoundaries derived=2 (requestId r1/r2) · ApprovalDecisions available=true measured=0
           ApprovalPolicy measured=1 · SandboxModes measured=2 · NetworkAccess measured=1
           UsageAggregate measured=1 · FileMutations measured=3
rules:     measured_zero = SV601/602/603/606/610/611/614
           unavailable  = SV604/605/607/608/609/612/613
           rules_unavailable=7 · findings_total=0
```

## 12. 诚实性注记

1. **audit-log 不是逐请求账本**（13/22 可 join）：一切从 audit-log 来的计数（ToolCalls/
   ApprovalDecisions/SandboxModes/TurnBoundaries）都是**下界**；
2. **traces 会话匿名**（65% 无法归属）：能「归属」的 id 实测是内容假阳性（模板 ID、目录名、
   CLI 参数里的 UUID）——**绝不**用 prompt 文本里的 UUID 猜 session；traces 一律 Unavailable
   + attempts（§14.4：skipped and recorded, never treated as corruption）；
3. **hash 链最老可能轮转**（5018bac6 从 seq=1268 起）：verified-from 诚实标注，不假定链完整；
4. **TurnBoundaries derived 是 lossy 下界**（distinct requestId，无 turn 结构）：SV612/613 报
   Unavailable，不发明不存在的轮次边界；
5. **ToolCalls 只有 bash+web_fetch 子集可 join**：write/edit/subagent/duration 证据只在匿名
   traces → SV604/605 降级 Unavailable（§3.1），其余工具名的审计留待 traces join 落地；
6. **cost = credit_json 宿主账单**：不重新计价、不动 pricing.json；`used` 是聚合 token，无逐请求
   用量；
7. **permission_mode 只两值 + use_sandbox_cli 恒 1**：ApprovalPolicy/SandboxModes 保真度低于
   DSH；SV610 的 `danger-full-access` 词表不适用于 WorkBuddy，诚实 MeasuredZero；
8. **`mode` 恒 craft、welcomeMode 会话级配置**（workbuddy.rs 静态层已守不变量 12）：模型/模式
   属性不能写死，逐会话读；
9. **会话/文件会被轮换清理**（file-history 16/22 会话、审计记录从 seq=1268 起）：一切统计都是
   时点值；
10. **`adapters/workbuddy.py` 现只做静态 skill 发现**（marketplace.json 清单，src/skills/
    workbuddy.rs 同构）：会话数据面适配器净新增，不并进静态文件。
