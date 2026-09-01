//! WorkBuddy 适配器的 "derive → coverage" 两段（五段式流水线 locate → shape →
//! extract → derive → coverage，"locate → shape → extract" 留在
//! `src/agent/workbuddy_session.rs`，I/O 不在这里）。它把
//! `~/.workbuddy/audit-log/*.jsonl` 里按 `sessionId` 分组出的原始记录 + db/file-history
//! 拆出的 `session_meta` 折成 `evidence::CanonicalSession`，覆盖计数按
//! `docs/WORKBUDDY_INTEGRATION.md` §3 矩阵逐信号对应。
//!
//! 与 Python `scripts/agent_vitals/agent/workbuddy_evidence.py` 逐字节对齐——产出同一个
//! `workbuddy_evidence_json` 输出字典（键序一致），`tests/test_cli_matrix.py::both()`
//! 的差分靠这份一致把关。
//!
//! **audit-log 只喂三条 timeline（approvals/sandbox_modes 非空，turns 恒空）。** 五条
//! timeline 里：`tool_calls` 只有 bash 子集（`sandbox-executed` 的 `commandPreview`）+
//! `web_fetch`（`WebFetch` 的 `messageParams.target`）可 join——write/edit 只在匿名
//! traces 里（spec §3）；`approvals` 由 commandApproved/commandRejected/bulk-delete.*
//! 喂（spec §7 决策映射）；`sandbox_modes` 由 sandbox-executed 喂（mode = WorkBuddy
//! 原生的 `permission_mode`，**不翻译成 DSH 的 danger-full-access**，spec §3.3）；
//! `turns` **恒空**——没有 turn 结构，把 distinct requestId 硬填成 turn 就是发明不存在
//! 的边界，SV612/613 靠 `timeline_is_empty` 诚实 Unavailable（spec §8）。
//!
//! **决策映射不双计。** 审批/拒绝记录只进 approvals 轴；sandbox-executed 才进
//! tool_calls + sandbox 轴。被批准的命令是否另有执行记录不可靠，两条记录之间不做
//! join（spec §7）。
//!
//! **audit-log 按 `sequence` 排序。** 记录可能来自多个并发 spool 文件，`sequence` 是
//! 宿主原生顺序（实测有跳号，来自并发写）。排序键 = `(sequence or MAX, 文件内序)`；
//! 输出 `seq` = 排序后的下标（会话内序，同 Claude 的 `seq = ordinal` 惯例）。
//!
//! **`session_meta` 携带 db/file-history 拆出的会话级数据**（I/O 层拆好传进来）：
//! `permission_mode/use_sandbox_cli/model/cwd/used/credit_json/file_mutations/title`。
//! db 缺失的列 → 对应信号降级 Unavailable（缺列报缺，编列害人），绝不编一个非零数字
//! 出来。

use std::collections::HashSet;

use serde_json::Value;

use crate::budget::parse_iso;
use crate::evidence::{
    AdapterNote, ApprovalAsked, ApprovalDecided, ApprovalObservation, CanonicalSession,
    Coverage, CoverageCounts, Provenance, SandboxModeObservation, SessionMeta, Signal, SignalSet,
    SourceAttempt, SourceKind, Surface, Timeline, TimelineEntry, ToolCallObservation,
    ToolResultObservation, TurnObservation,
};

/// 会话级元数据（I/O 层 `src/agent/workbuddy_session.rs` 从 db/file-history 拆好传进来）。
/// db 缺失的列是 `None`——缺列报缺，绝不编一个非零数字出来（spec §3 矩阵）。
pub struct WorkbuddySessionMeta {
    pub permission_mode: Option<String>,
    pub use_sandbox_cli: Option<i64>,
    pub model: Option<String>,
    pub cwd: Option<String>,
    pub title: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub used: Option<i64>,
    pub credit_json: Option<String>,
    pub file_mutations: u64,
}

/// WorkBuddy 适配器一次审计的产物：`CanonicalSession` + 它派生自的原始记录。
pub struct WorkbuddyEvidence {
    pub canonical: CanonicalSession,
    pub raw_records: Vec<Value>,
}

/// 20 个 Signal 的声明序——`signals` 数组 / `coverage` 字典的输出顺序都靠这份显式
/// 表对齐（与 Python `workbuddy_evidence.py::ALL_SIGNALS` 同表同序），不靠 Rust 的
/// Debug 序。与 claude_code_evidence / codex_evidence 同一张表。
const ALL_SIGNALS: &[Signal] = &[
    Signal::ToolCalls,
    Signal::ToolResults,
    Signal::TurnBoundaries,
    Signal::StepBoundaries,
    Signal::Usage,
    Signal::UsageAggregate,
    Signal::ContextWindow,
    Signal::QuotaConsumption,
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

/// audit-log 已知的 eventType（实测 5 路径，spec §2.2）。其余 eventType 记成
/// `SourceAttempt`，绝不当作损坏吞掉——审计账本可能还有没被本机语料触发的路径，
/// 吞掉就是假装账本干净。
const KNOWN_EVENT_TYPES: &[&str] = &[
    "sandbox-executed",
    "WebFetch",
    "commandApproved",
    "commandRejected",
    "bulk-delete.needs-approval",
    "bulk-delete.approved",
    "bulk-delete.rejected",
];

/// spec §3 明确 unavailable / 没有对应列的信号（WorkBuddy 列）。`derive_coverage`
/// 的置零与 `workbuddy_evidence_json` 的 `available` 标记共用这一份清单，不准两处
/// 各写一份漂移。
///
/// - ToolResults：audit-log 无 exit 码，traces 的 status/error 接不进 session；
/// - TurnBoundaries **不在**这个集合里——它按 distinct requestId 派生 coverage
///   （lossy 下界，available=true），但 turns timeline 恒空（spec §8）；
/// - Usage：无逐请求 token（traces 只有 trace 级 totalTokens）；UsageAggregate
///   反而 measured（session_usage.used，spec §9）；
/// - SandboxPolicy：use_sandbox_cli 是常量（恒 1），不是结构化策略事件；
/// - SubagentSpawns / SkillInvocations / Hooks / UserPrompts / UserCorrections /
///   ContextWindow / QuotaConsumption / StepBoundaries / Compaction：只存于匿名
///   traces 或根本不在 WorkBuddy 会话面上。
fn is_unavailable(signal: Signal) -> bool {
    matches!(
        signal,
        Signal::ToolResults
            | Signal::StepBoundaries
            | Signal::Usage
            | Signal::ContextWindow
            | Signal::QuotaConsumption
            | Signal::SandboxPolicy
            | Signal::Compaction
            | Signal::SubagentSpawns
            | Signal::SkillInvocations
            | Signal::Hooks
            | Signal::UserPrompts
            | Signal::UserCorrections
    )
}

// 各 note 的说明文本——与 Python 逐字节相同，差分测试靠它。
const TURN_BOUNDARY_NOTE: &str = "turn boundaries are derived from distinct audit-log \
requestId (a lower bound: audit-log is not a per-request ledger); native turn structure is \
absent, so SV612/613 are Unavailable, never fabricated boundaries.";
const SANDBOX_MODE_NOTE: &str = "sandbox mode is the WorkBuddy-native permission_mode \
(bypassPermissions / fullAccess); the DSH danger-full-access vocabulary does not apply, so \
SV610 is an honest MeasuredZero, never a translation.";
const TRACES_ERROR: &str = "traces are session-anonymous (no sessionId join); skipped per \
RUNTIME_EVIDENCE_CONTRACT §14.4";

/// traces 是「已知但刻意不用的表面」（spec §12.2）——会话匿名，join 不进 session。
/// 记成 `SourceAttempt`（§14.4：skipped and recorded, never treated as corruption）。
/// `kind="Directory"` / `surface="Traces"` 是 `evidence::SourceKind`/`Surface` 为这个
/// 目录型表面补的两个变体——Python 侧同款序列化（`format!("{:?}", ...)`）。
fn traces_attempt() -> SourceAttempt {
    SourceAttempt {
        source_id: "workbuddy.traces",
        kind: SourceKind::Directory,
        surface: Surface::Traces,
        available: false,
        error: Some(TRACES_ERROR.to_string()),
        observed_span: None,
    }
}

/// 一条 timeline entry 的构造器。`turn`/`step` 恒 None——WorkBuddy 无 turn/step
/// 结构；`time` = audit-log timestamp 的 unix 秒（`parse_iso`，无效则 None）。
/// 所有 entry 都是 `Measured`——它们来自真实 audit-log 记录，不是 derive 出来的。
fn timeline_entry<T>(
    observation: T,
    seq: Option<i64>,
    time: Option<i64>,
    call_id: Option<String>,
    ordinal: usize,
) -> TimelineEntry<T> {
    TimelineEntry {
        observation,
        provenance: Provenance::Measured,
        seq,
        time,
        turn: None,
        step: None,
        call_id,
        ordinal,
    }
}

fn text(record: &Value, key: &str) -> String {
    record.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}

/// audit-log `sequence` 字段 → int（int 或数字字符串），否则 None。只认纯 ASCII
/// 数字，与 `claude_code_evidence` 的 `_num` 同纪律（不宽容出 Rust 不会给的值）；
/// 非对象记录 → None（排序兜底，不崩溃）。
fn seq_of(record: &Value) -> Option<i64> {
    let obj = record.as_object()?;
    match obj.get("sequence") {
        Some(Value::Number(n)) => n.as_i64(),
        Some(Value::String(s))
            if !s.is_empty() && s.is_ascii() && s.bytes().all(|b| b.is_ascii_digit()) =>
        {
            s.parse().ok()
        }
        _ => None,
    }
}

/// 按 `(sequence or MAX, 文件内序)` 排序。并发 spool 写的跳号不影响顺序；
/// 缺 sequence 的记录排最后、内部保输入序。返回 `(文件内序, 记录)`。
fn sort_records(records: &[Value]) -> Vec<(usize, &Value)> {
    let mut indexed: Vec<(usize, &Value)> = records.iter().enumerate().collect();
    indexed.sort_by_key(|(idx, rec)| {
        (seq_of(rec).map(|s| s as u64).unwrap_or(2_u64.pow(63)), *idx)
    });
    indexed
}

/// sandbox-executed 的完整 bash 命令 → SV601-603 的 args_text（spec §3）。
fn command_preview(record: &Value) -> String {
    text(record, "commandPreview")
}

/// WebFetch 的 `messageParams.target` URL → SV606 的 args_text。
fn target_of(record: &Value) -> String {
    record
        .get("messageParams")
        .and_then(|p| p.get("target"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

/// 审批/拒绝记录的 `messageKey` → `ApprovalAsked.reason`（spec §7）。
fn message_key(record: &Value) -> String {
    text(record, "messageKey")
}

/// 审批记录的 tool_name：命令类 → bash，批量删除 → bulk_delete。
fn approval_tool(record: &Value) -> String {
    let et = text(record, "eventType");
    if et.starts_with("command") {
        "bash".to_string()
    } else {
        "bulk_delete".to_string()
    }
}

fn parse_time(record: &Value) -> Option<i64> {
    let ts = record.get("timestamp").and_then(Value::as_str)?;
    parse_iso(ts).map(|(s, _)| s)
}

/// audit-log `prevHash→hash` 链的完整性 note（spec §2.3/§4）。只做**结构校验**
/// （`records[i+1].prevHash == records[i].hash`），不重算 hash 算法。轮转诚实
/// 标注：首条 prevHash 非空且匹配不到任何记录 → 「最老记录可能被轮转，链从
/// seq=F 起验证」。头 prevHash 空 = 该记录是已知起点（干净链）。
fn chain_note(records: &[Value]) -> Option<String> {
    let mut seqs: Vec<(usize, i64, &Value)> = Vec::new();
    for (idx, rec) in sort_records(records) {
        if !rec.is_object() {
            continue;
        }
        let seq = seq_of(rec);
        seqs.push((idx, seq.unwrap_or(idx as i64), rec));
    }
    if seqs.is_empty() {
        return None;
    }
    let first_seq = seqs[0].1;
    if seqs.len() == 1 {
        return Some(format!(
            "audit-log hash chain: 1 record, no links to verify (verified from seq={first_seq})"
        ));
    }
    let hashes: HashSet<String> =
        seqs.iter().map(|(_, _, rec)| text(rec, "hash")).collect();
    let head_prev = text(seqs[0].2, "prevHash");
    for i in 0..seqs.len() - 1 {
        let cur_hash = text(seqs[i].2, "hash");
        let nxt_prev = text(seqs[i + 1].2, "prevHash");
        if !cur_hash.is_empty() && nxt_prev != cur_hash {
            return Some(format!(
                "audit-log hash chain broken at seq={} (prevHash does not match hash of seq={})",
                seqs[i + 1].1, seqs[i].1
            ));
        }
    }
    if !head_prev.is_empty() && !hashes.contains(&head_prev) {
        return Some(format!(
            "audit-log hash chain verified from seq={first_seq}: oldest records may be rotated \
            (first prevHash has no predecessor)"
        ));
    }
    Some(format!(
        "audit-log hash chain continuous: {} records (verified from seq={first_seq})",
        seqs.len()
    ))
}

struct WorkbuddyTimelines {
    tool_calls: Timeline<ToolCallObservation>,
    tool_results: Timeline<ToolResultObservation>,
    approvals: Timeline<ApprovalObservation>,
    sandbox_modes: Timeline<SandboxModeObservation>,
    turns: Timeline<TurnObservation>,
}

/// 跑一遍（按 sequence 排序后的）audit-log 记录，翻译成五条 host-neutral timeline
/// （spec §7 决策映射）：
/// - `tool_calls`：sandbox-executed → bash（commandPreview）；WebFetch → web_fetch
///   （messageParams.target）。
/// - `approvals`：commandApproved/commandRejected/bulk-delete.* → asked
///   （tool_name + messageKey），approved/rejected 再补 decided
///   （allowed-once/rejected）。needs-approval 只有 asked。
/// - `sandbox_modes`：sandbox-executed → mode = permission_mode（原生值，不翻译）。
/// - `turns`/`tool_results`：恒空（spec §3/§8）。
///
/// 返回 `(timelines, unknown)`。`seq` = 排序后的下标（会话内序）。`mode` 缺列时
/// 取空串（`SandboxModeObservation.mode` 是 `String` 不是 `Option`；SV610 只拿它和
/// `"danger-full-access"` 比，空串与 Python 的 `null` 判定相同——诚实空，不编值）。
fn populate_workbuddy_timelines(
    records: &[Value],
    session_meta: &WorkbuddySessionMeta,
) -> (WorkbuddyTimelines, Vec<String>) {
    let mut tool_calls = Timeline::new();
    let mut approvals = Timeline::new();
    let mut sandbox = Timeline::new();
    let mut unknown: Vec<String> = Vec::new();
    let mode = session_meta.permission_mode.clone().unwrap_or_default();
    for (ordinal, (_, record)) in sort_records(records).into_iter().enumerate() {
        let Some(obj) = record.as_object() else {
            continue;
        };
        let event_type = obj.get("eventType").and_then(Value::as_str).unwrap_or("");
        if !KNOWN_EVENT_TYPES.contains(&event_type) {
            let msg = format!("unknown audit-log event type: {event_type}");
            if !unknown.contains(&msg) {
                unknown.push(msg);
            }
            continue;
        }
        let seq = ordinal as i64;
        let time = parse_time(record);
        let call_id = record.get("toolCallId").and_then(Value::as_str).map(str::to_owned);
        if event_type == "sandbox-executed" {
            tool_calls.entries.push(timeline_entry(
                ToolCallObservation {
                    name: "bash".to_string(),
                    args_text: command_preview(record),
                },
                Some(seq),
                time,
                call_id.clone(),
                ordinal,
            ));
            sandbox.entries.push(timeline_entry(
                SandboxModeObservation { mode: mode.clone() },
                Some(seq),
                time,
                call_id,
                ordinal,
            ));
        } else if event_type == "WebFetch" {
            tool_calls.entries.push(timeline_entry(
                ToolCallObservation {
                    name: "web_fetch".to_string(),
                    args_text: target_of(record),
                },
                Some(seq),
                time,
                call_id,
                ordinal,
            ));
        } else {
            let mut observation = ApprovalObservation {
                asked: Some(ApprovalAsked {
                    tool_name: Some(approval_tool(record)),
                    reason: Some(message_key(record)),
                }),
                decided: None,
            };
            if event_type == "commandApproved" || event_type == "bulk-delete.approved" {
                observation.decided = Some(ApprovalDecided {
                    outcome: "allowed-once".to_string(),
                });
            } else if event_type == "commandRejected" || event_type == "bulk-delete.rejected" {
                observation.decided = Some(ApprovalDecided {
                    outcome: "rejected".to_string(),
                });
            }
            approvals.entries.push(timeline_entry(observation, Some(seq), time, call_id, ordinal));
        }
    }
    (
        WorkbuddyTimelines {
            tool_calls,
            tool_results: Timeline::new(),
            approvals,
            sandbox_modes: sandbox,
            turns: Timeline::new(),
        },
        unknown,
    )
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Bucket {
    Measured,
    Derived,
    // Lossy 在 WorkBuddy 路径上从未被构造（Python `_bump(coverage, ..., "lossy", n)`
    // 同样没有任何调用点——`coverage` 初始化里 lossy=0 恒零）。variant 留着是为了
    // 与 claude/codex 证据模块共用同一套 4 桶 bump 形状（measured/derived/lossy/
    // unmetered），WorkBuddy 的 coverage 输出也按这份形状序列化。allow 而非删除：
    // 删掉会破坏 bump 的穷尽 match，且未来若某个信号改为 lossy 下界还要再加回来。
    #[allow(dead_code)]
    Lossy,
}

fn bump(coverage: &mut Coverage, signal: Signal, bucket: Bucket, n: u64) {
    let mut c = coverage.get(signal);
    match bucket {
        Bucket::Measured => c.measured += n,
        Bucket::Derived => c.derived += n,
        Bucket::Lossy => c.lossy += n,
    }
    coverage.set(signal, c);
}

/// spec §3 矩阵逐信号喂覆盖。ToolCalls/SandboxModes/NetworkAccess/ApprovalDecisions
/// 与 populate 的 timeline 同源（sandbox-executed 数 = tool_calls 的 bash 数 =
/// sandbox 数，等）——coverage 与 timeline 两条账必须对得上，否则门控读 timeline
/// 非空而 coverage 全零。FileMutations/ApprovalPolicy/UsageAggregate 从
/// `session_meta`（db/file-history）拆出。返回 `(sigset, coverage, unknown)`。
fn derive_coverage(
    records: &[Value],
    session_meta: &WorkbuddySessionMeta,
) -> (SignalSet, Coverage, Vec<String>) {
    let mut coverage = Coverage::new();
    let mut unknown: Vec<String> = Vec::new();
    let mut request_ids: HashSet<&str> = HashSet::new();

    for record in records {
        let Some(obj) = record.as_object() else {
            continue;
        };
        let event_type = obj.get("eventType").and_then(Value::as_str).unwrap_or("");
        if !KNOWN_EVENT_TYPES.contains(&event_type) {
            let msg = format!("unknown audit-log event type: {event_type}");
            if !unknown.contains(&msg) {
                unknown.push(msg);
            }
            continue;
        }
        if let Some(rid) = obj.get("requestId").and_then(Value::as_str) {
            if !rid.is_empty() {
                request_ids.insert(rid);
            }
        }
        if event_type == "sandbox-executed" {
            bump(&mut coverage, Signal::ToolCalls, Bucket::Measured, 1);
            bump(&mut coverage, Signal::SandboxModes, Bucket::Measured, 1);
        } else if event_type == "WebFetch" {
            bump(&mut coverage, Signal::ToolCalls, Bucket::Measured, 1);
            bump(&mut coverage, Signal::NetworkAccess, Bucket::Measured, 1);
        } else {
            bump(&mut coverage, Signal::ApprovalDecisions, Bucket::Measured, 1);
        }
    }

    // FileMutations measured = file-history 版本数（spec §3 Measured 行）。
    if session_meta.file_mutations > 0 {
        bump(&mut coverage, Signal::FileMutations, Bucket::Measured, session_meta.file_mutations);
    }
    // ApprovalPolicy measured = permission_mode / use_sandbox_cli 存在（spec §3）。
    if session_meta.permission_mode.is_some() || session_meta.use_sandbox_cli.is_some() {
        bump(&mut coverage, Signal::ApprovalPolicy, Bucket::Measured, 1);
    }
    // UsageAggregate measured = session_usage.used / credit_json 存在（spec §9）。
    // `credit_json` 是「非空字符串即真」的 Python truthiness——空串算没有。
    if session_meta.used.is_some()
        || session_meta.credit_json.as_deref().map(|s| !s.is_empty()).unwrap_or(false)
    {
        bump(&mut coverage, Signal::UsageAggregate, Bucket::Measured, 1);
    }
    // TurnBoundaries derived = distinct requestId（lossy 下界，spec §8）。coverage
    // 与 turns timeline **不同源**（timeline 恒空）——这正是
    // `empty_timeline_with_nonzero_coverage_is_unavailable_not_measured_zero` 钉住的
    // 模式：SV612/613 读 timeline 判 Unavailable，coverage 只报可观察的请求下界。
    if !request_ids.is_empty() {
        bump(&mut coverage, Signal::TurnBoundaries, Bucket::Derived, request_ids.len() as u64);
    }

    let mut signals = SignalSet::EMPTY;
    for s in ALL_SIGNALS.iter().copied() {
        if coverage.get(s).total() > 0 {
            signals.insert(s);
        }
    }
    for s in ALL_SIGNALS.iter().copied().filter(|s| is_unavailable(*s)) {
        coverage.set(s, CoverageCounts::default());
    }
    unknown.sort();
    (signals, coverage, unknown)
}

fn build_notes(coverage: &Coverage, records: &[Value]) -> Vec<AdapterNote> {
    let mut notes: Vec<AdapterNote> = Vec::new();
    if coverage.get(Signal::TurnBoundaries).total() > 0 {
        notes.push(AdapterNote { message: TURN_BOUNDARY_NOTE.to_string() });
    }
    if coverage.get(Signal::SandboxModes).total() > 0 {
        notes.push(AdapterNote { message: SANDBOX_MODE_NOTE.to_string() });
    }
    if let Some(chain) = chain_note(records) {
        notes.push(AdapterNote { message: chain });
    }
    notes
}

fn first_cwd(session_meta: &WorkbuddySessionMeta) -> Vec<String> {
    session_meta.cwd.clone().map(|c| vec![c]).unwrap_or_default()
}

/// 记录数组 + 会话元数据 → evidence（"derive → coverage" 两段；"locate → shape →
/// extract" 留在 `src/agent/workbuddy_session.rs`）。与 Python `build_workbuddy_evidence`
/// 对齐：`canonical` 是 `CanonicalSession`（meta/signals/coverage/attempts/notes +
/// 五条 timeline，turns 恒空——spec §8 的「故意空」构造点）。
///
/// 诚实真值表（喂 WorkBuddy canonical 后每条 SV 规则的结果）：
///
/// | 规则 | WorkBuddy |
/// |---|---|
/// | SV601–603 | 跑（sandbox-executed 的 commandPreview → bash args_text） |
/// | SV604/605 | **Unavailable**（dispatcher 层 host-capability degradation，spec §3.1） |
/// | SV606 | 跑（WebFetch target → web_fetch args_text） |
/// | SV607/608 | Unavailable（无 tool_results / exit 码） |
/// | SV609 | 跑（audit-log 审批路径 → asked）；无审批记录则 Unavailable |
/// | SV610 | 跑（sandbox 非空），mode 恒非 danger-full-access → 诚实 MeasuredZero |
/// | SV611 | 跑（bash+web_fetch 子集） |
/// | SV612/613 | Unavailable（turns 恒空 / results 恒空） |
/// | SV614 | 跑（approvals+sandbox 双轴都在） |
pub fn build_workbuddy_evidence(
    raw_records: Vec<Value>,
    session_id: String,
    session_meta: &WorkbuddySessionMeta,
) -> WorkbuddyEvidence {
    let (timelines, unknown) = populate_workbuddy_timelines(&raw_records, session_meta);
    let (signals, coverage, cov_unknown) = derive_coverage(&raw_records, session_meta);
    let mut all_unknown = unknown;
    for m in cov_unknown {
        if !all_unknown.contains(&m) {
            all_unknown.push(m);
        }
    }
    all_unknown.sort();
    let mut attempts: Vec<SourceAttempt> = vec![traces_attempt()];
    for msg in all_unknown {
        attempts.push(SourceAttempt {
            source_id: "workbuddy.audit-log",
            kind: SourceKind::LogFile,
            surface: Surface::SessionLog,
            available: false,
            error: Some(msg),
            observed_span: None,
        });
    }
    let notes = build_notes(&coverage, &raw_records);
    let canonical = CanonicalSession {
        meta: SessionMeta {
            session_id,
            host_id: "workbuddy",
            workspace_roots: first_cwd(session_meta),
            model: session_meta.model.clone(),
            span: None,
        },
        signals,
        coverage,
        attempts,
        notes,
        tool_calls: timelines.tool_calls,
        tool_results: timelines.tool_results,
        approvals: timelines.approvals,
        sandbox_modes: timelines.sandbox_modes,
        turns: timelines.turns,
    };
    WorkbuddyEvidence { canonical, raw_records }
}

/// evidence → `workbuddy-evidence --json` 的输出形状。与 Python `workbuddy_evidence_json`
/// 逐字节对齐——键序、嵌套结构、`attempts`/`notes` 的序列化都是这里单独控制的。
/// `signals` 数组按 ALL_SIGNALS 序；`coverage` 20 键全量（unavailable 的也是全零四条，
/// 不是缺键）；`available` 标记宿主是否提供该维度——false = 结构缺口，任何会话都为零，
/// KPI 分母不算它。
pub fn workbuddy_evidence_json(evidence: &WorkbuddyEvidence) -> Value {
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
                "available": !is_unavailable(*s),
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
                "observed_span": a.observed_span.map(|sp| serde_json::json!({
                    "start_ms": sp.start_ms,
                    "end_ms": sp.end_ms,
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
        "host": "workbuddy",
        "session_id": evidence.canonical.meta.session_id,
        "workspace_roots": evidence.canonical.meta.workspace_roots,
        "model": evidence.canonical.meta.model,
        "signals": signals,
        "coverage": coverage_map,
        "attempts": attempts,
        "notes": notes,
    })
}
