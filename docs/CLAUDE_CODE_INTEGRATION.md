# Claude Code 宿主接入：调研结论与适配边界

> 采集 2026-09-01。本机 Claude Code 全部会话 JSONL 实测。
> 关联：[CLAUDE_CODE_CORPUS.md](./CLAUDE_CODE_CORPUS.md)（数据面快照）· [VITALS_CORE_V0_5_IMPLEMENTATION_SPEC.md](./VITALS_CORE_V0_5_IMPLEMENTATION_SPEC.md)（v0.5 架构）· [MENUBAR_MULTIHOST_NAVIGATION_SPEC.md](./MENUBAR_MULTIHOST_NAVIGATION_SPEC.md)（多宿主导航）。
> 状态：**调研结论，不是可实施 spec**。数据面证据已实测，接入层级、规则能力矩阵、provenance、
> SessionStore、WASM 五个问题已定案（P0 修正版）；turn 重建状态机（§8）与
> 工具名规范化细节（§7）仍需实现设计定稿。评审结论：v0.5 通用 Core 不修改的方向**成立**。

## 0. 结论

Claude Code 接入**不需要修改通用 `vitals-core`**——这一条成立。但「只是一个适配器
工作量」不成立：至少还涉及 `agent-vitals-core` 证据模型（provenance）、SessionStore
（r2a 统一数据入口）和 Tauri/WASM 接入。

正确层级（§1 代码验证）：

```text
Claude JSONL
→ ClaudeEvidence {          ← 与 codex_evidence.rs / dsh_evidence.rs 同层
    canonical: CanonicalSession,
    raw_records
  }
→ compatibility/canonical_session.rs::canonical_session_to_vitals()
→ CanonicalEvent → Detector
```

**不要写 `session.jsonl → CanonicalEvent` 直连**——那会绕开五条通用 timeline、
Coverage 三态、SourceAttempt、Session metadata 与既有兼容测试路径（§1.1）。

## 1. 现有链路（代码验证，2026-09-01）

### 1.1 真实接入路径

`crates/agent-vitals-core/src/compatibility/canonical_session.rs:97`
`canonical_session_to_vitals(&CanonicalSession) -> Vec<CanonicalEvent>` 是唯一合法的
CanonicalSession → CanonicalEvent 桥。Claude 适配器必须先产出 `CanonicalSession`，
走这条桥，**不新增第二条桥**。

### 1.2 证据适配器范式（Claude 的挂载层）

`dsh_evidence.rs:355 DshEvidence` / `:498 build_dsh_evidence` / `:546 reverse_project`
是既有范式：适配器持有 `canonical + raw_records`，`build_*` 产出、`reverse_project`
回吐原始形状。`codex_evidence.rs` 同层。Claude 新增 `ClaudeEvidence`（§6 工作项 1）
与这两者同构。

### 1.3 TrajectoryAssigner 的职责边界（评审 P0-2，已验证）

`vitals-core/src/trajectory.rs:86-89`：

```rust
pub trait TrajectoryAssigner: Send + Sync {
    fn id(&self) -> &str;
    fn assign(&self, event: &CanonicalEvent) -> Result<TrajectoryId, VitalsError>;
}
```

它只把 `CanonicalEvent → TrajectoryId`，**不修改事件、不写 `vitals.turn`**。Claude 的
branch linearization、turn 重建、step 计算、tool call/result 关联必须在**适配器的
derive 阶段**完成并写进 `CanonicalSession` timeline，再由 §8.4.1 纪律（坐标是事件属性）
经桥带进 `attributes`。TrajectoryAssigner 不是 turn 状态机的挂载点。

### 1.4 SignalVocabulary 不需要 Claude 专属词表（评审 P0-3，已验证）

现有 Detector 不止靠词表门控，还**硬编码检查** kind 与 attributes 键，例如
`sv607.rs:36` `attributes.get("error_code")`、`sv607.rs:48` kind `"approval.denied_result"`。
注册 `claude.assistant → agent.tool_call` 这类映射会让门控放行但 Detector 忽略事件。

正确方式：适配器统一输出**已有 canonical kinds**：

```text
Bash tool_use  → agent.tool_call（tool_name="bash"）
tool_result    → agent.tool_result
derived turn   → agent.turn
```

通常**不需要新增 Claude 专属词表**，复用领域词表即可。

## 2. Claude Code 数据面（实测 2026-09-01）

### 2.1 语料口径（评审指出的数字矛盾，必须分别标明）

| 数字 | 值 | 口径 |
|---|---|---|
| corpus 全语料 | 130 文件 / 47,837 assistant 请求 | `CLAUDE_CODE_CORPUS.md` 采集日快照（全家族） |
| corpus minimax 家族 | 2,958 请求（M2.7 1,155 + M3 1,803） | 同上，**仅 minimax 家族**，不是总量 |
| 本次结构抽查 | 51 会话 / 125,803 事件 | 2026-09-01 walk，事件含 assistant/user/attachment 等全部类型 |
| 本次 minimax 复现 | 16 文件 / 1,705 请求 | 2026-09-01 walk，仅**仍存在**的文件 |

早前会话 65633310/8b85e949/dcf9e5b6 已被清理——Claude Code 会话会轮换删除，
任何会话文件统计都是时点值（§9.1）。**以上四行不可互比，引用时须带采集时间与范围。**

### 2.2 session.jsonl 事件类型（51 会话抽样）

| 类型 | 数量 | 对适配的价值 |
|---|---:|---|
| `assistant` | 41,754 | `message.model` + `message.usage` —— 用量/成本源 |
| `user` | 21,296 | 含 `tool_result` 块（19,437 个） |
| `attachment` | 21,073 | `deferred_tools_delta` —— 工具名清单 |
| `permission-mode` | 6,024 | **仅模式快照** `{permissionMode, sessionId}`，无逐次审批 |
| `quotaLimits`（assistant 顶层） | 20 | 限流负向快照，无 used_percent |
| `error` / `isApiErrorMessage` | 70 / 90 | 请求失败 |

### 2.3 结构事实（三态矩阵锚点）

- **`tool_result` 块 = `{content, is_error, tool_use_id, type}`**：有 `is_error` 布尔，
  **无 `exit_code` 数值**。
- **`permission-mode` = `{type, permissionMode, sessionId}`**：模式切换快照，无逐次审批。
- **无 provider 字段、无 turn/step**：全事件无结构化端点/provider 字段；turn 需从
  `uuid`/`parentUuid` 树重建。
- **`uuid`/`parentUuid` 树 + `tool_use_id`**：工具调用有唯一 ID，可关联 call/result。

### 2.4 usage 富字段

| 字段 | 本次实测 | 价值 |
|---|---|---|
| `output_tokens_details.thinking_tokens` | M2.7: **91% 非零**（max 488，中位 34）；M3: 19% 非零（max 3,102）；deepseek-*: **恒 0**；claude-opus/sonnet-5: 非零（max 1,889/7,870） | reasoning 维度 |
| `cache_creation.ephemeral_1h/5m` | 本次 16 文件几乎全无（仅 13 条 cc>0 无分桶） | Anthropic 式缓存分档 |
| `server_tool_use` | `{web_search_requests, web_fetch_requests}` | 服务端工具计数 |

**MiniMax thinking 是会话级配置，不是模型恒定**：M3 跨文件 0%~55% 差异
（6145a051=19%、agent-a652=55%、agent-a17a=0%）——不能写死模型属性。

## 3. 规则能力矩阵（评审 P0-4 修正版）

判据沿用 §7.4.1：**该信号在本输入里有没有可消费事件**，不是 coverage 计数。

| 规则 | Claude Code 判定 | 依据 |
|---|---|---|
| SV601–606（工具名族） | **Available** | 前提：工具名+参数规范化（§7）；`tool_use` 块结构化 |
| SV607（拒绝/中止/sandbox denied） | **Unavailable** | `is_error=true` 证明失败，不能证明**失败原因**；SV607 只匹配 `DENIED_CODES`（sv607.rs:2）。把一切失败伪造成一个错误码 → SV607/608 错误地 MeasuredZero |
| SV608（超时） | **Unavailable** | 只匹配 `error_code == "TOOL_TIMEOUT"`（sv608.rs:2），is_error 不含超时类型 |
| SV609（approval） | **Unavailable** | `permission-mode` 仅模式快照，无逐次审批 |
| SV610（sandbox） | **Unavailable** | 无结构化 sandbox 策略事件 |
| SV611（重复调用） | **Available** | 比较 `(name, args_text)`，非 `tool_use_id`；工具名+参数稳定规范化后即跑 |
| SV612（turn 分组） | **Derived/Partial** | 依赖 turn 重建状态机（§8）；重建不出的维度降级 |
| SV613(a)（第一个 error turn） | **Derived/Partial** | 依赖可靠推导 error turn |
| SV613(b)（连续工具失败） | **Lossy/Partial** | 可用 `is_error` 部分运行（轨迹级 `error_code.is_some()` 逻辑，trajectory.rs:402） |
| SV614 | **Unavailable** | approval + sandbox 两侧皆缺 |

### SV607/608 的模型修正（评审 P0-4）

`ToolResultObservation` 已有 `error_code: Option<String>`（evidence.rs:489），**缺
`failed: Option<bool>`**。建议：

```rust
pub struct ToolResultObservation {
    pub failed: Option<bool>,      // 通用失败检测（SV613(b) 用）
    pub error_code: Option<String>, // 原因级检测（SV607/608 用）
}
```

- `failed` 服务通用失败（is_error → failed=true，provenance=lossy）；
- `error_code` 服务拒绝/超时原因级——Claude 无来源时保持 `None`，**绝不伪造一个码**。

这属于 `agent-vitals-core` 领域证据层，不动通用 `vitals-core`。

## 4. Provenance 缺口（评审 P0-5，代码验证属实）

文档此前要求「is_error 翻译标 lossy、turn 重建标 derived」——**当前结构兑现不了**：

1. `TimelineEntry<T>`（evidence.rs:554）**没有逐事件 provenance 字段**，兼容桥
   （canonical_session.rs:97）把事件写成 `Provenance::Measured`——推导 turn、模糊
   错误类型会冒充原生测量。
2. `canonical_session.rs:84` 的 `source_type` **硬编码 `"dsh_session"`**——Codex
   经过这里也得到 DSH provenance。

修正（属 `agent-vitals-core`，不动通用 core）：

```rust
pub struct TimelineEntry<T> {
    pub observation: T,
    pub provenance: Provenance,   // 新增，桥接时透传
    // existing coordinates...
}
```

桥接时 `source_type` 按 `SessionMeta.host_id`（或通用 SourceRef）生成：
`codex_session` / `dsh_session` / `claude_code_session`。已有测试必须覆盖
「codex 输入 → 输出 source_type=codex_session，非 dsh_session」。

## 5. SessionStore 接入面（此前完全缺席）

`src/agent/r2a_store.rs` 目前对 Codex/DSH **硬编码分发**（`codex_cache_path`/
`dsh_cache_path`、`codex_source_fingerprints`/`dsh_source_fingerprints`、`source_statuses`
均按宿主写死）。接入 Claude 需要：

- `SessionStore::claude_code(home)` + `sessions list --host-kind claude-code`
- `sessions read` 接受 Claude `SessionKey`
- `SessionStore::all()` 合并 Claude
- Claude source fingerprint（`~/.claude/projects/**/*.jsonl`）+ 缓存 revision
- `source_statuses["claude-code"]`
- list/read/filter/pagination 测试
- Workbench host filter 与导航（menubar spec 的宿主轴复用）

**建议顺手抽 source registry**：第三宿主开始，每加一个宿主改多处分支的模式不可持续。

## 6. WASM 复用修正（评审 P0-5）

`agent-vitals-wasm::audit_events(events_json, workspace_root)`（lib.rs:21）接收的是
**DSH 原始事件形状**（`Vec<Value>` 直喂 `match_behavior`），**不是通用
`CanonicalEvent`**——Claude 原始 JSONL 不能直接传给它。

推荐架构：

```text
Tauri Rust backend
→ Claude source/parser → unified SessionEnvelope
→ WebView 只负责显示
```

计算保持 host-side（repo 纪律：计算在宿主侧，浏览器只读投影）。若要浏览器侧纯计算，
须新增**明确的 canonical WASM API**，不是让 JS 再实现一套 Claude parser。

## 7. 工具名规范化（实现设计待定稿）

| Claude 原始值 | canonical name |
|---|---|
| `Bash` | `bash` |
| `Write` | `write` |
| `Edit` / `MultiEdit` | `edit` |
| `WebFetch` | `web_fetch` |

- **不做这层映射，SV601–606 不会命中**（现有规则用小写名字，sv601-606 测试为证）。
- `args_text` 需确定性序列化（JSON key 排序），否则 SV611 把键序不同、语义相同的
  参数识别成不同调用。参考既有 `canonical_string`（vitals-core/canonical.rs:36）。

## 8. turn 重建状态机（未定义，SV612/613 的 gate）

`parentUuid` 树**不等于** turn。实现设计至少回答：

1. 如何选择当前有效 leaf path？多 leaf 时选哪个？
2. abandoned branch 是否排除？
3. root/orphan/cycle 如何处理？
4. 普通 human prompt 与携带 `tool_result` 的 user record 如何区分？
5. assistant 连续消息属于同一 turn 还是多 turn？
6. 子代理是否独立 scope？
7. 未结束 turn 如何关闭？
8. 重建失败时：整个 TurnBoundaries Unavailable，还是仅部分 coverage？

**状态机定稿前，SV612/613(a) 只能标 Derived/Partial，不能声称可跑。**

## 9. 成本部分（收紧）

### 9.1 provider 判定三类（此前过强）

`ANTHROPIC_BASE_URL` 只证明**当前配置**，不证明历史会话当时的 provider；
`claude-* + cache_creation>0` 也可能来自兼容代理。定价依据分三类：

```text
observed-route      当前会话明确记录/关联到 provider → 精确价
inferred-provider   由模型+缓存特征推断 → 金额标「估算」
unknown-provider    无法可靠归属 → 不出价
```

推断金额**不得**与明确路由金额混成同一精度。

### 9.2 计数规则（未验证前不合并）

- `thinking_tokens` 是否已含在 `output_tokens` 中**未验证**——不能重复相加；
- `ephemeral_5m/1h` 是 `cache_creation` 的**子桶**，不能与父字段重复计费；
- `resolve_card` fallback（cost.rs）机制可用，但 fallback 价是估算，标 `pricing_basis`。

## 10. 验收章节（新增）

1. 原始 Claude 字段不得进入 `vitals-core`；
2. Claude adapter 必须先生成 `CanonicalSession`，走 `canonical_session_to_vitals` 桥；
3. Derived/Lossy provenance 不得变成 Measured（§4 的 `TimelineEntry.provenance` 测试）；
4. unsupported 规则（SV607/608/609/610/614）必须 Unavailable，不得 MeasuredZero；
5. 跨宿主相同行为产生相同 finding（Claude 与 DSH/Codex fixture 对齐）；
6. leaf-path 与 all-recorded 分别有 fixture；
7. SessionStore list/read/all/filter/cursor 通过（§5）；
8. Tauri 不解析 Claude 原始日志（§6 架构）；
9. usage/cache/thinking 各桶可以对账（§9.2 不重复计数）；
10. provider 不确定时不得生成伪精确价格（§9.1）。

## 11. 接入工作项（依赖序）

1. **turn 重建状态机设计**（§8 八问定稿）——一切 Derived 判定的前置；
2. `ClaudeEvidence` 适配器：Claude JSONL → `CanonicalSession`（tool_use/tool_result/
   parentUuid → timeline；turn/step 由 §8 状态机算出）；
3. `TimelineEntry.provenance` 字段 + 桥透传 + `source_type` 按 host_id 生成（§4，
   属 agent-vitals-core，需 Codex/DSH 回归验证）；
4. `ToolResultObservation.failed` 字段 + SV613(b) lossy 路径（§3）；
5. 工具名规范化表 + `args_text` 确定性序列化（§7）；
6. pricing.json 补 MiniMax/claude 官方价（业务数据，需价表；§9）；
7. SessionStore：`claude_code(home)` + source registry 抽取（§5）；
8. Tauri/workbench 消费（§6 架构，计算 host-side）；
9. 验收 10 条 + fixtures 入库。

## 12. 诚实性注记

1. **会话会轮换删除**：可复现语料（1,705 请求）< corpus 快照（2,958）——钱行是下界；
2. **turn 重建是近似**：parentUuid 推断非原生坐标，重建不出报 Unavailable；
3. **is_error ≠ error_code**：只做 `failed`（lossy），不伪造原因码；
4. **thinking 是配置性**：逐请求读 `output_tokens_details.thinking_tokens`；
5. **`adapters/claude.py` 现只做静态配置证据**（enabledPlugins/skillUsage），会话数据面
   适配器净新增；
6. **本文件是调研结论**：§7/§8 未定稿前不可直接交给开发照单实现。
