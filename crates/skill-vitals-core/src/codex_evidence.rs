//! P4 of the runtime evidence model (`docs/RUNTIME_EVIDENCE_CONTRACT.md` §17).
//!
//! Codex 适配器的 "derive → coverage" 两段（五段式流水线 locate → shape →
//! extract → derive → coverage，"locate → shape → extract" 留在
//! `src/codex_session.rs`，I/O 不在这里）。它把一份 rollout JSONL 里抽出的
//! 原始条目折成 `evidence::CanonicalSession`，覆盖计数按
//! `docs/RUNTIME_EVIDENCE_CONTRACT.md` §13 host coverage matrix 的 **Codex
//! (Legacy) 与 Codex (Paginated) 两列**逐条对应。
//!
//! **P4 的验收标准是单个词 "sound"**：Codex 是唯一一个在两种互不兼容的词表
//! （`ThreadHistoryMode` 的 Legacy / Paginated，见 §14.1）之间不自我声明、
//! 必须靠探测内容区分的宿主。如果加这一个宿主、两种形状会逼着共享类型层
//! （`CanonicalSession`/`Coverage`/`RuleSpec`，P1 落地）做结构性改动，这个
//! 模型就失败了。这里的职责就是证明它不用改——本文件**不修改 evidence.rs
//! 的任何类型**，只用它们；`shared_type_layer_has_no_host_identifiers_in_code`
//! 测试继续绿就是那份证明的自动化形态。
//!
//! **§14.1 的 Rust 枚举名不是线格式。** 文档自己也承认格式无版本、靠兼容
//! shim 演进（§14.4），本机 51 份真实 rollout 实测出的 `event_msg.type` /
//! `item_completed.payload.item.type` / `response_item.payload.type` 三套
//! **snake_case / PascalCase 线格式**才是权威。下面的映射表直接以实测词表为
//! 准（见本文件脚注的完整枚举），不是为了省事抄 §14.1。
//!
//! **不是 trait**——理由同 `dsh_evidence.rs`：宿主之间差的是"哪些阶段
//! 存在"，trait 会强迫每个宿主实现一堆空方法。
//!
//! `CodexEvidence` 把 `CanonicalSession`（§12 规定不持有任何宿主专属 payload）
//! 和它派生自的原始条目捆在一起——将来把 SV 规则迁到 Codex 上时，规则引擎
//! 需要原始条目，跟 DSH 的 `DshEvidence` 同一个理由、同一个形状。

use serde_json::Value;

use crate::evidence::{
    AdapterNote, CanonicalSession, Coverage, CoverageCounts, SessionMeta, Signal, SignalSet,
    SourceAttempt, SourceKind, Surface,
};

/// Codex 适配器一次审计的产物：`CanonicalSession` + 它派生自的原始条目。
/// `history_mode`/`cli_version`/`title` 是 provenance（`session_meta` 里读出来的
/// 前两个；`title` 是 `~/.codex/session_index.jsonl` 查出的 `thread_name`），
/// 只进报告不参与计数。`title` 是 **Codex 专属字段**，所以放 evidence 顶层而
/// 不是 `CanonicalSession`（§12 铁律「宿主专属字段不进共享类型层」）——与
/// `history_mode`/`cli_version` 同一个位置。
pub struct CodexEvidence {
    pub canonical: CanonicalSession,
    pub items: Vec<Value>,
    pub title: Option<String>,
    pub history_mode: Option<String>,
    pub cli_version: Option<String>,
}

// ────────────────────────── 词表：实测 + §14.1 补缺 ──────────────────────────

/// 顶层 `{type, timestamp, payload}` 包络的已知 type 值。实测（本机 51 份
/// rollout）出现 7 种；`compacted` 是顶层独立类型（带着 `replacement_history`，
/// §13 Compaction 行 "measured (+ replacement_history)" 的来源）。
const KNOWN_TOP_LEVEL_TYPES: &[&str] = &[
    "session_meta",
    "turn_context",
    "event_msg",
    "response_item",
    "world_state",
    "compacted",
    "inter_agent_communication_metadata",
];

/// `event_msg.payload.type` 的已知值。实测 17 种（Legacy 词表 + Paginated 的
/// `item_completed` 载体）。`HookPrompt` 是 §14.1 文档里有、本机语料没采样到
/// 的 Paginated item——不是 event，所以这里不放。
const KNOWN_EVENT_TYPES: &[&str] = &[
    "agent_message",
    "agent_reasoning",
    "context_compacted",
    "image_generation_end",
    "item_completed",
    "mcp_tool_call_end",
    "patch_apply_end",
    "sub_agent_activity",
    "task_complete",
    "task_started",
    "thread_goal_updated",
    "thread_rolled_back",
    "thread_settings_applied",
    "token_count",
    "turn_aborted",
    "user_message",
    "web_search_end",
];

/// `event_msg.payload.type == "item_completed"` 时 `payload.item.type` 的已知值
/// （Paginated 的 TurnItem 词表）。实测 13 种；`HookPrompt` 是 §14.1 文档
/// 明确列出的 TurnItem 变体，本机语料没采样到（n=2 份 Paginated 太小，不能
/// 当"不存在"，见 docs §14.1 与 `codex-corpus-facts` 记忆）。
const KNOWN_ITEM_TYPES: &[&str] = &[
    "AgentMessage",
    "CollabAgentToolCall",
    "CommandExecution",
    "ContextCompaction",
    "DynamicToolCall",
    "Extension",
    "FileChange",
    "HookPrompt",
    "ImageView",
    "McpToolCall",
    "Plan",
    "Reasoning",
    "SubAgentActivity",
    "UserMessage",
];

/// `response_item.payload.type` 的已知值。实测 9 种。
const KNOWN_RESPONSE_TYPES: &[&str] = &[
    "agent_message",
    "custom_tool_call",
    "custom_tool_call_output",
    "function_call",
    "function_call_output",
    "message",
    "reasoning",
    "tool_search_call",
    "tool_search_output",
];

/// 一个条目在哪个命名空间、叫什么类型。`Unknown` 的字符串是"要记进 attempts
/// 的报错文本"，已去重。
enum Classification {
    Known,
    Unknown(String),
}

/// 顶层 type 在不在已知表里；在的话，按命名空间往下看内层 type 认不认得。
/// 任何一层不认识 → `Unknown("<命名空间>/<type>")`，调用方把它记进
/// `attempts`（§14.4："unknown item types are skipped and recorded in
/// attempts, never treated as corruption"）——这是 P4 顺带证明的第一条
/// `SourceAttempt` 真实使用（DSH 的 attempts 一直是空的）。
///
/// **已知但恰好不映射到任何 Signal 的条目（`reasoning` / `agent_reasoning` /
/// `world_state` …）直接跳过，不记 attempts**——`attempts` 只记"不认识"的，
/// 不记"认识但恰好不喂信号"的，否则一份真实会话会因为这类高频条目刷出
/// 一墙噪音。
fn classify(item: &Value) -> Classification {
    let top = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
    if !KNOWN_TOP_LEVEL_TYPES.contains(&top) {
        return Classification::Unknown(format!("unknown record type: {top}"));
    }
    let Some(payload) = item.get("payload").and_then(|v| v.as_object()) else {
        return Classification::Known; // 没有 payload 的 record 是合法的（如 session_meta 可能极简）
    };
    let inner = payload.get("type").and_then(|v| v.as_str()).unwrap_or("");
    // 三段独立的存在性探测。用 match guard + 一个 if 的平铺写法，避免
    // "if 套 if" 的嵌套控制流（clippy collapsible-match 会拦）。
    let unknown_msg: Option<String> = match top {
        "event_msg" if !KNOWN_EVENT_TYPES.contains(&inner) => {
            Some(format!("unknown event type: {inner}"))
        }
        "event_msg" if inner == "item_completed" => {
            // item_completed 是 Paginated 的载体：再往下探一层 item.type。
            let item_type = payload
                .get("item")
                .and_then(|v| v.get("type"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if !KNOWN_ITEM_TYPES.contains(&item_type) {
                Some(format!("unknown item type: {item_type}"))
            } else {
                None
            }
        }
        "response_item" if !KNOWN_RESPONSE_TYPES.contains(&inner) => {
            Some(format!("unknown response item type: {inner}"))
        }
        _ => None,
    };
    match unknown_msg {
        Some(msg) => Classification::Unknown(msg),
        None => Classification::Known,
    }
}

// ────────────────────────── coverage 计数 ──────────────────────────

/// `CoverageCounts` 里四个互斥计数桶之一——Codex 的一个条目能同时喂多个
/// Signal（`CommandExecution` 同时是 ToolCalls 和 ToolResults 的载体），每个
/// 桶独立累加，不是 DSH 那种"一个事件类型只进一个 Signal"的覆盖式 `set`。
#[derive(Clone, Copy)]
enum Bucket {
    Measured,
    Derived,
    Lossy,
}

/// 往某个 Signal 的某个桶里加计数。`CoverageCounts` 是 `Copy`，取出来改了
/// 再放回去即可；`signals` 集合的成员资格统一在收尾时按 total>0 补。
fn bump(coverage: &mut Coverage, signal: Signal, bucket: Bucket, n: u64) {
    if n == 0 {
        return;
    }
    let mut c = coverage.get(signal);
    match bucket {
        Bucket::Measured => c.measured += n,
        Bucket::Derived => c.derived += n,
        Bucket::Lossy => c.lossy += n,
    }
    coverage.set(signal, c);
}

/// 顶层/event/item/response 四个来源的计数。返回 `(signals, coverage, 未知类型
/// 的报错列表)`——报错是 §14.4 要求记进 `attempts` 的那份"skipped, never
/// corruption"清单，去重后按字典序排序，保证跨语言字节一致。
///
/// 映射表逐条对应 §13 的 Codex 两列（Legacy / Paginated 同列时说明两套词表
/// 都覆盖；分列时标在注释里）：
///
/// | Signal | 来源（命名空间:type） | §13 列 |
/// |---|---|---|
/// | ToolCalls | event_msg:`mcp_tool_call_end`,`web_search_end`; item:`McpToolCall`,`DynamicToolCall`,`CollabAgentToolCall`,`CommandExecution`,`Extension`; response_item:`custom_tool_call`,`function_call`,`tool_search_call` | 两列 measured |
/// | ToolResults | response_item:`custom_tool_call_output`,`function_call_output`,`tool_search_output`; item:`CommandExecution`（带 stdout/stderr/exit_code） | 两列 measured |
/// | TurnBoundaries | event_msg:`task_started`,`task_complete` | 两列 measured |
/// | Usage | event_msg:`token_count`（逐请求时间序列） | 两列 measured (6 buckets) |
/// | UsageAggregate | 有 token_count 时 `derived(1)`（只有总量无逐请求——不对，token_count 有逐请求；这里照 DSH 的 UsageAggregate 语义标 derived(1) 只做存在性） | derivable |
/// | ContextWindow | event_msg:`token_count` 且 `payload.info.model_context_window` 在 | 两列 measured |
/// | ApprovalDecisions | item:`FileChange` 且 `payload.item.auto_approved` 非空——§13 Paginated 列 "partial (`FileChangeItem.auto_approved`)"。本机语料 60 份 FileChange 全都没带这字段（见 codex-corpus-facts 记忆），所以真实语料大概率走不到这条；Legacy 列 unavailable（`policy.rs` 不持久化 ExecApprovalRequest） | 两列 unavailable/partial |
/// | ApprovalPolicy | event_msg:`thread_settings_applied`（`payload.thread_settings.approval_policy`）; 顶层 `turn_context`（`payload.approval_policy`）——§14.2：两种 mode 都持久化策略 | 两列 measured |
/// | SandboxModes | 无来源——`policy.rs` 不持久化 Guardian*/SafetyBuffering | 两列 unavailable |
/// | SandboxPolicy | §13 矩阵没有 Codex 列——照 DSH 的规矩 unavailable，不编造 | — |
/// | NetworkAccess | 无来源 | 两列 unavailable |
/// | Compaction | event_msg:`context_compacted`; item:`ContextCompaction`; 顶层 `compacted`（带 `replacement_history`） | 两列 measured |
/// | SubagentSpawns | event_msg:`sub_agent_activity`; item:`SubAgentActivity`（`agent_thread_id` 给 parent→child 链） | 两列 measured |
/// | SkillInvocations | **不 port Codex 的启发式**（§14.3：`detect_implicit_skill_invocation_for_command` 不持久化，离线只能 Derived；"Do not port... 第五份平行实现比诚实的 Derived 标记更糟"）。这里只做存在性下界：有任何工具执行形态的证据 → `derived(1)`，并附一条 AdapterNote 说明离线推断可能与宿主运行时决定不一致 | 两列 derived |
/// | Hooks | item:`HookPrompt`（§14.1；本机语料没采样到）——Legacy 无 | 两列 unavailable/measured |
/// | FileMutations | event_msg:`patch_apply_end`（lossy，只有 end 没有变更明细）; item:`FileChange`（measured，带 changes/status） | 两列 lossy/measured |
/// | StepBoundaries | 无来源 | 两列 unavailable |
///
/// **"Tool-call duration" 不在上表里**——19 个 `Signal` 没有它的变体。
/// `CommandExecutionItem.duration` 是**值**不是通道：它跟着 item 走，将来做
/// duration 折叠（DSH `duration-audit` 的同款路径）时从原始条目上读即可。
/// P4 的 "sound" 恰好体现在这里：吸收 Paginated 的 duration 不需要给共享
/// 类型层开新槽。
/// | UserPrompts / UserCorrections | §13 矩阵没有 Codex 列——unavailable | — |
fn derive_coverage(items: &[Value]) -> (SignalSet, Coverage, Vec<String>) {
    let mut coverage = Coverage::new();
    let mut unknown: Vec<String> = Vec::new();

    for item in items {
        match classify(item) {
            Classification::Unknown(msg) => {
                if !unknown.contains(&msg) {
                    unknown.push(msg);
                }
            }
            Classification::Known => {}
        }

        let Some(payload) = item.get("payload").and_then(|v| v.as_object()) else {
            continue;
        };
        let inner = payload.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match item.get("type").and_then(|v| v.as_str()).unwrap_or("") {
            "event_msg" => match inner {
                "mcp_tool_call_end" | "web_search_end" => {
                    bump(&mut coverage, Signal::ToolCalls, Bucket::Measured, 1);
                }
                "task_started" | "task_complete" => {
                    bump(&mut coverage, Signal::TurnBoundaries, Bucket::Measured, 1);
                }
                "token_count" => {
                    bump(&mut coverage, Signal::Usage, Bucket::Measured, 1);
                    // 常驻上下文窗口（model_context_window）在 payload.info 里——
                    // 与逐请求 token 分离，§13 ContextWindow 行的来源。
                    let has_window = payload
                        .get("info")
                        .and_then(|v| v.get("model_context_window"))
                        .and_then(|v| v.as_u64())
                        .is_some();
                    if has_window {
                        bump(&mut coverage, Signal::ContextWindow, Bucket::Measured, 1);
                    }
                }
                "thread_settings_applied" => {
                    // §14.2：ThreadSettingsSnapshot 两种 mode 都持久化，携带
                    // approval_policy（AskForApproval）。策略是"设置了策略"这
                    // 件事的载体，数它即可，不解析策略值。
                    let has_policy = payload
                        .get("thread_settings")
                        .and_then(|v| v.get("approval_policy"))
                        .is_some();
                    if has_policy {
                        bump(&mut coverage, Signal::ApprovalPolicy, Bucket::Measured, 1);
                    }
                }
                "patch_apply_end" => {
                    // §13 FileMutations (Legacy) = "lossy (patch_apply_end only)"——
                    // 只有 end，没有变更明细，进 lossy 桶。
                    bump(&mut coverage, Signal::FileMutations, Bucket::Lossy, 1);
                }
                "context_compacted" => {
                    bump(&mut coverage, Signal::Compaction, Bucket::Measured, 1);
                }
                "sub_agent_activity" => {
                    bump(&mut coverage, Signal::SubagentSpawns, Bucket::Measured, 1);
                }
                "item_completed" => {
                    let item_type = payload
                        .get("item")
                        .and_then(|v| v.get("type"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    classify_item(&mut coverage, item_type, payload);
                }
                _ => {} // agent_message/agent_reasoning/user_message/turn_aborted/... 不喂信号
            },
            "response_item" => match inner {
                "custom_tool_call" | "function_call" | "tool_search_call" => {
                    bump(&mut coverage, Signal::ToolCalls, Bucket::Measured, 1);
                }
                "custom_tool_call_output" | "function_call_output" | "tool_search_output" => {
                    bump(&mut coverage, Signal::ToolResults, Bucket::Measured, 1);
                }
                _ => {} // message/reasoning/agent_message 不喂信号
            },
            "turn_context" => {
                // 顶层 turn_context 也携带 approval_policy（实测字段）——与
                // thread_settings_applied 同源不同载体，数它的存在性即可。
                if payload.get("approval_policy").is_some() {
                    bump(&mut coverage, Signal::ApprovalPolicy, Bucket::Measured, 1);
                }
            }
            "compacted" => {
                bump(&mut coverage, Signal::Compaction, Bucket::Measured, 1);
            }
            _ => {} // session_meta/world_state/inter_agent_communication_metadata 不喂信号
        }
    }

    let mut signals = SignalSet::EMPTY;
    for s in ALL_SIGNALS {
        if coverage.get(*s).total() > 0 {
            signals.insert(*s);
        }
    }

    // UsageAggregate / SkillInvocations 的存在性派生，收尾统一判——它们不依赖
    // 具体条目形态，只依赖"有没有 Usage 证据 / 有没有工具执行证据"。
    let usage_present = coverage.get(Signal::Usage).total() > 0;
    if usage_present {
        bump(&mut coverage, Signal::UsageAggregate, Bucket::Derived, 1);
        signals.insert(Signal::UsageAggregate);
    }
    let tool_exec_evidence = coverage.get(Signal::ToolCalls).total() > 0;
    if tool_exec_evidence {
        bump(&mut coverage, Signal::SkillInvocations, Bucket::Derived, 1);
        signals.insert(Signal::SkillInvocations);
    }

    // §13 没有 Codex 列 / 明确 unavailable 的信号——照 DSH 的规矩显式记全零
    // （不进 SignalSet），不能编一个非零数字出来。
    for signal in [
        Signal::StepBoundaries,
        Signal::SandboxModes,
        Signal::SandboxPolicy,
        Signal::NetworkAccess,
        Signal::UserPrompts,
        Signal::UserCorrections,
    ] {
        coverage.set(signal, CoverageCounts::default());
    }

    unknown.sort();
    (signals, coverage, unknown)
}

/// `item_completed.payload.item` 的 TurnItem 分型喂信号——单独抽出来，让
/// `derive_coverage` 的主循环只读一层。
fn classify_item(coverage: &mut Coverage, item_type: &str, payload: &serde_json::Map<String, Value>) {
    match item_type {
        // 工具执行：McpToolCall/DynamicToolCall/CollabAgentToolCall/Extension 是
        // §14.1 列出的 typed 等价物；CommandExecution 额外带 duration → 也喂
        // Tool-call duration（§13 Paginated 列 measured）。
        "McpToolCall" | "DynamicToolCall" | "CollabAgentToolCall" | "Extension" => {
            bump(coverage, Signal::ToolCalls, Bucket::Measured, 1);
        }
        "CommandExecution" => {
            bump(coverage, Signal::ToolCalls, Bucket::Measured, 1);
            // 带 stdout/stderr/exit_code 的执行记录同时是"结果"载体。
            bump(coverage, Signal::ToolResults, Bucket::Measured, 1);
            // `.duration`（实测 157/157 都有）是**值**不是通道——19 个 Signal
            // 里没有 ToolCallDuration 变体，P4 的 "sound" 恰好证明不需要加：
            // duration 跟着原始条目走，将来做 duration 折叠时从 item 上读即可，
            // 覆盖率模型不为它开新槽。
        }
        // FileChange：§13 Paginated FileMutations 列 measured；`auto_approved`
        // 非空时是 ApprovalDecisions 的 partial 证据（§13 Paginated 列）。
        "FileChange" => {
            bump(coverage, Signal::FileMutations, Bucket::Measured, 1);
            let auto = payload
                .get("item")
                .and_then(|v| v.get("auto_approved"))
                .is_some_and(|v| !v.is_null());
            if auto {
                bump(coverage, Signal::ApprovalDecisions, Bucket::Measured, 1);
            }
        }
        "ContextCompaction" => bump(coverage, Signal::Compaction, Bucket::Measured, 1),
        "SubAgentActivity" => bump(coverage, Signal::SubagentSpawns, Bucket::Measured, 1),
        "HookPrompt" => bump(coverage, Signal::Hooks, Bucket::Measured, 1),
        _ => {} // Plan/Reasoning/AgentMessage/UserMessage/ImageView 不喂信号
    }
}

/// 19 个 Signal 的声明序——`Signal` 的 `Ord` 派生自枚举声明顺序，跨语言输出
/// 顺序靠这份显式表对齐（Python 镜像里同名同序），不靠 Rust 的 Debug 序。
const ALL_SIGNALS: &[Signal] = &[
    Signal::ToolCalls,
    Signal::ToolResults,
    Signal::TurnBoundaries,
    Signal::StepBoundaries,
    Signal::Usage,
    Signal::UsageAggregate,
    Signal::ContextWindow,
    Signal::ApprovalDecisions,
    Signal::ApprovalPolicy,
    Signal::SandboxModes,
    Signal::SandboxPolicy,
    Signal::NetworkAccess,
    Signal::Compaction,
    Signal::SubagentSpawns,
    Signal::SkillInvocations,
    Signal::Hooks,
    Signal::FileMutations,
    Signal::UserPrompts,
    Signal::UserCorrections,
];

/// 条目数组 → `CodexEvidence`。五段式流水线的 "derive → coverage" 两段；
/// "locate → shape → extract" 留在 `src/codex_session.rs`。
///
/// 这是**第一条真的把 `attempts` 填起来**的适配器（DSH 的 attempts 一直是
/// 空 `Vec::new()`）：未知条目类型记成 `SourceAttempt { available: false,
/// error: "unknown … type: …" }`——§14.4 说 Codex 只能靠 existence probing
/// 降级，"skipped and recorded in attempts, never treated as corruption"。
pub fn build_codex_evidence(
    items: Vec<Value>,
    session_id: String,
    title: Option<String>,
    history_mode: Option<String>,
    cli_version: Option<String>,
    workspace_roots: Vec<String>,
    model: Option<String>,
) -> CodexEvidence {
    let (signals, coverage, unknown) = derive_coverage(&items);
    let attempts: Vec<SourceAttempt> = unknown
        .into_iter()
        .map(|msg| SourceAttempt {
            source_id: "codex.rollout.jsonl",
            kind: SourceKind::LogFile,
            surface: Surface::SessionLog,
            available: false,
            error: Some(msg),
            observed_span: None,
        })
        .collect();

    let mut notes: Vec<AdapterNote> = Vec::new();
    if coverage.get(Signal::SkillInvocations).total() > 0 {
        // §14.3：诚实标记 Derived，说明离线推断可能与宿主运行时决定不一致，
        // 且明确拒绝 port 上游的 detect_implicit_skill_invocation_for_command
        //（第五份平行实现只会增加跨语言 lockstep 的维护面）。这段文本在
        // Python 镜像里逐字节相同。
        notes.push(AdapterNote {
            message: "Codex does not persist skill invocations (§14.3); SkillInvocations coverage is a derived presence lower bound, and offline inference may disagree with the host's runtime decision. The upstream heuristic detect_implicit_skill_invocation_for_command is deliberately not ported.".to_string(),
        });
    }

    let canonical = CanonicalSession {
        meta: SessionMeta {
            session_id,
            host_id: "codex",
            workspace_roots,
            model,
            span: None,
        },
        signals,
        coverage,
        attempts,
        notes,
    };
    CodexEvidence { canonical, items, title, history_mode, cli_version }
}

/// `CodexEvidence` → `codex-evidence --json` 的输出形状。`RuleOutcome` /
/// `CanonicalSession` 都不是 serde 类型（§10/§11 的类型定义没有 derive
/// Serialize），展示层自己转一道——与 `behavior.rs::rule_outcomes_json` 同一个
/// 做法，输出形状由这里单独控制，Python 镜像逐字节对齐。
pub fn codex_evidence_json(evidence: &CodexEvidence) -> Value {
    let signals: Vec<String> = ALL_SIGNALS
        .iter()
        .filter(|s| evidence.canonical.signals.contains(**s))
        .map(|s| format!("{s:?}"))
        .collect();
    let mut coverage_map = serde_json::Map::new();
    for s in ALL_SIGNALS {
        let c = evidence.canonical.coverage.get(*s);
        coverage_map.insert(
            format!("{s:?}"),
            serde_json::json!({
                "measured": c.measured,
                "derived": c.derived,
                "lossy": c.lossy,
                "unmetered": c.unmetered,
            }),
        );
    }
    let attempts: Vec<Value> = evidence
        .canonical
        .attempts
        .iter()
        .map(|a| {
            serde_json::json!({
                "source_id": a.source_id,
                "kind": format!("{:?}", a.kind),
                "surface": format!("{:?}", a.surface),
                "available": a.available,
                "error": a.error,
                "observed_span": a.observed_span.map(|s| serde_json::json!({
                    "start_ms": s.start_ms,
                    "end_ms": s.end_ms,
                })),
            })
        })
        .collect();
    let notes: Vec<Value> = evidence
        .canonical
        .notes
        .iter()
        .map(|n| serde_json::json!(n.message))
        .collect();
    serde_json::json!({
        "host": "codex",
        "session_id": evidence.canonical.meta.session_id,
        "title": evidence.title,
        "history_mode": evidence.history_mode,
        "cli_version": evidence.cli_version,
        "workspace_roots": evidence.canonical.meta.workspace_roots,
        "model": evidence.canonical.meta.model,
        "signals": signals,
        "coverage": coverage_map,
        "attempts": attempts,
        "notes": notes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn legacy_item(event_type: &str, payload: Value) -> Value {
        // `json!` 不支持 map spread（`**`），payload 必须是运行时拼出来的对象
        // —— 先塞入调用方给的字段，再把 type/turn_id 补上。
        let mut p = payload_as_map(payload);
        p.insert("type".into(), json!(event_type));
        p.insert("turn_id".into(), json!("t1"));
        json!({"type": "event_msg", "timestamp": 0, "payload": p})
    }

    fn payload_as_map(payload: Value) -> serde_json::Map<String, Value> {
        payload.as_object().cloned().unwrap_or_default()
    }

    fn item_completed(item: Value) -> Value {
        json!({"type": "event_msg", "timestamp": 0, "payload": {
            "type": "item_completed", "turn_id": "t1", "item": item
        }})
    }

    fn response_item(item_type: &str) -> Value {
        json!({"type": "response_item", "timestamp": 0, "payload": {"type": item_type}})
    }

    fn token_count(window: bool) -> Value {
        let mut info = serde_json::Map::new();
        if window {
            info.insert("model_context_window".into(), json!(128000));
        }
        legacy_item("token_count", json!({"info": info, "rate_limits": {}}))
    }

    fn build(items: Vec<Value>) -> CodexEvidence {
        // title 在真实调用里由 session_index 查表注入；单测默认 None（无索引态）。
        build_codex_evidence(items, "s1".into(), None, Some("legacy".into()),
            Some("0.146.0".into()), vec!["/repo".into()], Some("gpt-5.3-codex".into()))
    }

    #[test]
    fn legacy_fixture_counts_measured_signals_and_leaves_paginated_ones_zero() {
        let items = vec![
            legacy_item("task_started", json!({})),
            legacy_item("mcp_tool_call_end", json!({})),
            legacy_item("web_search_end", json!({})),
            legacy_item("patch_apply_end", json!({})),
            legacy_item("context_compacted", json!({})),
            legacy_item("sub_agent_activity", json!({})),
            legacy_item("thread_settings_applied", json!({"thread_settings": {"approval_policy": "Never"}})),
            token_count(true),
        ];
        let evidence = build(items);
        let cov = &evidence.canonical.coverage;
        assert_eq!(cov.get(Signal::ToolCalls).measured, 2);
        assert_eq!(cov.get(Signal::TurnBoundaries).measured, 1);
        assert_eq!(cov.get(Signal::FileMutations).lossy, 1, "Legacy 的 patch_apply_end 只进 lossy 桶");
        assert_eq!(cov.get(Signal::Compaction).measured, 1);
        assert_eq!(cov.get(Signal::SubagentSpawns).measured, 1);
        assert_eq!(cov.get(Signal::ApprovalPolicy).measured, 1);
        assert_eq!(cov.get(Signal::Usage).measured, 1);
        assert_eq!(cov.get(Signal::ContextWindow).measured, 1);
        assert_eq!(cov.get(Signal::UsageAggregate).derived, 1);
        // Paginated-only 的信号在 Legacy 里必须是零，且不进 SignalSet：
        assert_eq!(cov.get(Signal::Hooks), CoverageCounts::default(), "Legacy 没有 HookPrompt");
        assert_eq!(cov.get(Signal::ApprovalDecisions), CoverageCounts::default(), "Legacy 没有 auto_approved");
        assert!(!evidence.canonical.signals.contains(Signal::Hooks));
    }

    #[test]
    fn paginated_fixture_counts_richer_signals_legacy_cannot_supply() {
        let items = vec![
            item_completed(json!({"type": "CommandExecution", "duration": 1234,
                                  "command": ["bash", "-c", "echo hi"], "exit_code": 0,
                                  "stdout": "hi", "stderr": ""})),
            item_completed(json!({"type": "FileChange", "changes": [], "status": "applied",
                                  "auto_approved": true})),
            item_completed(json!({"type": "McpToolCall"})),
            item_completed(json!({"type": "SubAgentActivity", "agent_thread_id": "a",
                                  "agent_path": "sub"})),
            item_completed(json!({"type": "ContextCompaction"})),
            item_completed(json!({"type": "HookPrompt", "fragments": []})),
        ];
        let evidence = build(items);
        let cov = &evidence.canonical.coverage;
        assert_eq!(cov.get(Signal::ToolCalls).measured, 2, "CommandExecution + McpToolCall");
        assert_eq!(cov.get(Signal::ToolResults).measured, 1, "CommandExecution 也是结果载体");
        assert_eq!(cov.get(Signal::FileMutations).measured, 1, "FileChange 是 measured 桶，不是 lossy");
        assert_eq!(cov.get(Signal::ApprovalDecisions).measured, 1, "FileChange.auto_approved 非空 → partial 证据");
        assert_eq!(cov.get(Signal::SubagentSpawns).measured, 1);
        assert_eq!(cov.get(Signal::Compaction).measured, 1);
        assert_eq!(cov.get(Signal::Hooks).measured, 1);
        assert!(evidence.canonical.signals.contains(Signal::Hooks));
    }

    #[test]
    fn skill_invocations_is_derived_presence_marker_not_measured() {
        let items = vec![item_completed(json!({"type": "CommandExecution", "duration": 1}))];
        let evidence = build(items);
        assert_eq!(evidence.canonical.coverage.get(Signal::SkillInvocations).derived, 1);
        assert_eq!(evidence.canonical.coverage.get(Signal::SkillInvocations).measured, 0);
        assert!(evidence.canonical.signals.contains(Signal::SkillInvocations));
        assert_eq!(evidence.canonical.notes.len(), 1, "必须带 §14.3 的 Derived 说明");
        assert!(evidence.canonical.notes[0].message.contains("detect_implicit_skill_invocation_for_command"));

        // 完全没有工具执行证据时，SkillInvocations 必须 absent，不能编一个非零。
        let empty = build(vec![legacy_item("task_started", json!({}))]);
        assert!(!empty.canonical.signals.contains(Signal::SkillInvocations));
        assert_eq!(empty.canonical.coverage.get(Signal::SkillInvocations), CoverageCounts::default());
    }

    #[test]
    fn unknown_item_types_are_recorded_in_attempts_not_corruption() {
        // §14.4：未知类型必须"skipped and recorded in attempts, never treated
        // as corruption"——不能把整份日志判成畸形。
        let items = vec![
            json!({"type": "event_msg", "timestamp": 0, "payload": {"type": "brand_new_event"}}),
            json!({"type": "event_msg", "timestamp": 0, "payload": {"type": "item_completed", "item": {"type": "BrandNewItem"}}}),
            json!({"type": "response_item", "timestamp": 0, "payload": {"type": "brand_new_response"}}),
            json!({"type": "totally_new_top_level", "timestamp": 0, "payload": {}}),
        ];
        let evidence = build(items);
        assert_eq!(evidence.canonical.attempts.len(), 4);
        assert!(evidence.canonical.attempts.iter().all(|a| !a.available));
        assert!(evidence.canonical.attempts.iter().any(|a| a.error.as_deref().unwrap_or("").contains("brand_new_event")));
        assert!(evidence.canonical.attempts.iter().any(|a| a.error.as_deref().unwrap_or("").contains("BrandNewItem")));
        assert!(evidence.canonical.attempts.iter().any(|a| a.error.as_deref().unwrap_or("").contains("brand_new_response")));
        assert!(evidence.canonical.attempts.iter().any(|a| a.error.as_deref().unwrap_or("").contains("totally_new_top_level")));
        // attempts 是 evidence 的一部分，不是把日志判成不可读：
        assert_eq!(evidence.canonical.meta.host_id, "codex");
    }

    #[test]
    fn known_non_signal_items_are_not_attempts() {
        // agent_reasoning / user_message / response_item.reasoning / world_state
        // 是"认识但恰好不喂信号"的高频条目——绝不能刷进 attempts。
        let items = vec![
            legacy_item("agent_reasoning", json!({"content": "thinking"})),
            legacy_item("user_message", json!({"content": "hi"})),
            response_item("reasoning"),
            response_item("message"),
            json!({"type": "world_state", "timestamp": 0, "payload": {"state": {}}}),
            json!({"type": "inter_agent_communication_metadata", "timestamp": 0, "payload": {}}),
        ];
        let evidence = build(items);
        assert_eq!(evidence.canonical.attempts.len(), 0, "认识的条目不记 attempts");
    }

    #[test]
    fn unavailable_signals_are_zero_and_not_in_signal_set() {
        let evidence = build(vec![token_count(true)]);
        for signal in [
            Signal::StepBoundaries, Signal::SandboxModes, Signal::SandboxPolicy,
            Signal::NetworkAccess, Signal::UserPrompts, Signal::UserCorrections,
        ] {
            assert_eq!(evidence.canonical.coverage.get(signal), CoverageCounts::default(),
                "{signal:?} 应 unavailable（全零、不进 SignalSet）");
            assert!(!evidence.canonical.signals.contains(signal));
        }
    }

    #[test]
    fn approval_policy_comes_from_turn_context_and_thread_settings() {
        // turn_context 顶层也带 approval_policy（实测字段）——两个载体都数。
        let items = vec![
            json!({"type": "turn_context", "timestamp": 0, "payload": {"approval_policy": "Never", "cwd": "/repo"}}),
            legacy_item("thread_settings_applied", json!({"thread_settings": {"approval_policy": "OnRequest"}})),
        ];
        let evidence = build(items);
        assert_eq!(evidence.canonical.coverage.get(Signal::ApprovalPolicy).measured, 2);
    }

    #[test]
    fn file_change_without_auto_approved_does_not_raise_approval_decisions() {
        // 真实语料里 FileChange 全都不带 auto_approved（n=60）——不能因此
        // 把 ApprovalDecisions 误判成有覆盖。
        let items = vec![item_completed(json!({"type": "FileChange", "changes": [], "status": "applied"}))];
        let evidence = build(items);
        assert_eq!(evidence.canonical.coverage.get(Signal::ApprovalDecisions), CoverageCounts::default());
        assert!(!evidence.canonical.signals.contains(Signal::ApprovalDecisions));
        assert_eq!(evidence.canonical.coverage.get(Signal::FileMutations).measured, 1);
    }

    #[test]
    fn evidence_json_title_none_is_null_and_some_is_surfaced() {
        // 无索引态 → title 是 null（存在性探测，绝不编造）；有索引 → thread_name。
        let none = build(vec![]);
        assert!(codex_evidence_json(&none)["title"].is_null());
        let with_title = build_codex_evidence(
            vec![], "s1".into(), Some("评估项目添加UI".into()), Some("legacy".into()),
            Some("0.146.0".into()), vec!["/repo".into()], Some("gpt-5.3-codex".into()));
        assert_eq!(codex_evidence_json(&with_title)["title"], "评估项目添加UI");
    }

    #[test]
    fn evidence_json_has_stable_shape_and_no_unknown_signal_keys() {
        let evidence = build(vec![legacy_item("mcp_tool_call_end", json!({}))]);
        let out = codex_evidence_json(&evidence);
        assert_eq!(out["host"], "codex");
        assert_eq!(out["session_id"], "s1");
        assert!(out["title"].is_null(), "build() 默认无标题");
        assert_eq!(out["history_mode"], "legacy");
        assert_eq!(out["cli_version"], "0.146.0");
        assert_eq!(out["workspace_roots"], json!(["/repo"]));
        assert_eq!(out["model"], "gpt-5.3-codex");
        assert!(out["signals"].as_array().unwrap().contains(&json!("ToolCalls")));
        // 所有 19 个 Signal 都出现在 coverage 里，缺一个就说明序列化漏了。
        let coverage = out["coverage"].as_object().unwrap();
        assert_eq!(coverage.len(), 19);
        for s in ALL_SIGNALS {
            assert!(coverage.contains_key(&format!("{s:?}")));
        }
        assert_eq!(coverage["ToolCalls"], json!({"measured": 1, "derived": 0, "lossy": 0, "unmetered": 0}));
    }

    #[test]
    fn no_usage_evidence_leaves_usage_and_derived_markers_zero() {
        let evidence = build(vec![legacy_item("task_started", json!({}))]);
        assert_eq!(evidence.canonical.coverage.get(Signal::Usage), CoverageCounts::default());
        assert_eq!(evidence.canonical.coverage.get(Signal::UsageAggregate), CoverageCounts::default());
        assert_eq!(evidence.canonical.coverage.get(Signal::ContextWindow), CoverageCounts::default());
    }
}
