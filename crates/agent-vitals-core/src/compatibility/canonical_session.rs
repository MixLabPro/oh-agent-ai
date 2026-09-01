//! §14.2 输入桥——`CanonicalSession` 的五条现有 timeline 投影为
//! `vitals_core::event::CanonicalEvent`。纯函数，不重新读原始日志（§21 止损
//! 线第 5 条）：只读 `CanonicalSession` 已经算好的五条 timeline，不碰
//! `dsh_evidence.rs` 的适配器逻辑。
//!
//! # 坐标怎么过去
//!
//! §8.4.1（spec patch）：turn 坐标不是子 trajectory，是事件属性——`turn` /
//! `step` / `call_id` / `seq` 全部原样塞进 `CanonicalEvent.attributes`，
//! Detector 需要时自己读，Core 不解释它们、也不替 Detector 重建 turn 状态
//! 机。
//!
//! # `ordinal` 的复用
//!
//! `TimelineEntry.ordinal`（post_fork 执行流下标）直接当 `CanonicalEvent.
//! ordinal` 用，`EventId` 由它派生（`evt-{ordinal}`）。这是安全的：五条
//! timeline 的 entry 分别来自五种互斥的原始事件类型（`tool/call` /
//! `tool/result` / `approval/*` / `sandbox/mode` / `turn/*`），同一个原始
//! 事件不会出现在两条 timeline 里，所以 ordinal 在五条 timeline 合并后仍然
//! 唯一——旧路径 `flatten()` 和这条新路径按同一个下标排序，是逐字节 parity
//! （§14.4）成立的前提之一。

use serde_json::{json, Value};
use vitals_core::event::{CanonicalEvent, SourceRef};
use vitals_core::id::{ActorId, EventId};
use vitals_core::provenance::Provenance;

use crate::evidence::CanonicalSession;

/// §7.1：本次迁移登记的信号名——直接沿用旧 `Signal` 枚举变体名的
/// snake_case（`ToolCalls` → `agent.tool_calls`）。这条桥存在的目的就是跟
/// 旧模型保持连续性，不是发明一套新命名。
pub const SIGNAL_TOOL_CALLS: &str = "agent.tool_calls";
pub const SIGNAL_TOOL_RESULTS: &str = "agent.tool_results";
pub const SIGNAL_APPROVAL_DECISIONS: &str = "agent.approval_decisions";
pub const SIGNAL_SANDBOX_MODES: &str = "agent.sandbox_modes";
pub const SIGNAL_TURN_BOUNDARIES: &str = "agent.turn_boundaries";

pub const KIND_TOOL_CALL: &str = "agent.tool_call";
pub const KIND_TOOL_RESULT: &str = "agent.tool_result";
pub const KIND_APPROVAL: &str = "agent.approval";
pub const KIND_SANDBOX_MODE: &str = "agent.sandbox_mode";
pub const KIND_TURN: &str = "agent.turn";

/// 没有 session_id 时的稳定匿名 actor id（§6.2："来源无法提供时由 Adapter
/// 生成稳定匿名 ID"）。现有 `build_dsh_evidence` 的单测把 `session_id`
/// 传成空字符串是常见写法，落到这里不该产出一个空 `ActorId`（会被
/// `CanonicalEvent::validate` 拒绝）。
const ANONYMOUS_ACTOR: &str = "anonymous-session";

#[derive(Debug)]
pub enum CompatibilityError {
    Vitals(vitals_core::error::VitalsError),
}

impl std::fmt::Display for CompatibilityError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CompatibilityError::Vitals(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for CompatibilityError {}

impl From<vitals_core::error::VitalsError> for CompatibilityError {
    fn from(e: vitals_core::error::VitalsError) -> Self {
        CompatibilityError::Vitals(e)
    }
}

fn base_event(actor_id: &str, kind: &'static str, ordinal: usize, time: Option<i64>, attributes: serde_json::Value) -> CanonicalEvent {
    CanonicalEvent {
        schema_version: 1,
        id: EventId::from(format!("evt-{ordinal}")),
        actor_id: ActorId::from(actor_id),
        goal_id: None,
        kind: kind.to_string(),
        ordinal: ordinal as u64,
        occurred_at_ms: time,
        attributes,
        outcome: None,
        source: SourceRef {
            source_type: "dsh_session".to_string(),
            source_id: actor_id.to_string(),
            raw_reference: None,
            raw_ordinal: Some(ordinal as u64),
        },
        provenance: Provenance::Measured,
    }
}

/// §14.2：把 `CanonicalSession` 的五条 timeline 投影成 `CanonicalEvent`
/// 列表，按 `ordinal` 升序返回（虽然 Engine 自己也会重新排序——§6.3 的排序
/// 是 Engine 的权威行为，这里保持有序只是让调用方在喂给 Engine 之前也能看
/// 出正确的顺序，不是替 Engine 决定顺序）。
pub fn canonical_session_to_vitals(session: &CanonicalSession) -> Result<Vec<CanonicalEvent>, CompatibilityError> {
    let actor_id = if session.meta.session_id.is_empty() { ANONYMOUS_ACTOR } else { session.meta.session_id.as_str() };
    let mut events = Vec::new();

    for entry in &session.tool_calls.entries {
        events.push(base_event(
            actor_id,
            KIND_TOOL_CALL,
            entry.ordinal,
            entry.time,
            json!({
                "name": entry.observation.name,
                "args_text": entry.observation.args_text,
                "seq": entry.seq,
                "turn": entry.turn,
                "step": entry.step,
                "call_id": entry.call_id,
            }),
        ));
    }
    for entry in &session.tool_results.entries {
        events.push(base_event(
            actor_id,
            KIND_TOOL_RESULT,
            entry.ordinal,
            entry.time,
            json!({
                "error_code": entry.observation.error_code,
                "seq": entry.seq,
                "turn": entry.turn,
                "step": entry.step,
                "call_id": entry.call_id,
            }),
        ));
    }
    for entry in &session.approvals.entries {
        // `asked`/`decided` 各自整体投影成 `null` 或一个子 object——不是拍
        // 平成 `asked_tool_name`/`asked_reason` 两个可能各自为 null 的键。
        // SV614(a) 需要区分"这条 approval 有没有 asked 端"，拍平之后光看
        // `attributes.get("asked_tool_name")` 分不清"没有 asked 端"和"有
        // asked 端但 tool_name 恰好是 null"——两者在拍平后长得一样。整体
        // Option 投影没有这个歧义：键不存在 = `null`，Some(..) = 一个 object，
        // 即使里面的字段本身也是 null。
        let asked = entry.observation.asked.as_ref().map_or(Value::Null, |a| {
            json!({"tool_name": a.tool_name, "reason": a.reason})
        });
        let decided = entry.observation.decided.as_ref().map_or(Value::Null, |d| json!({"outcome": d.outcome}));
        events.push(base_event(
            actor_id,
            KIND_APPROVAL,
            entry.ordinal,
            entry.time,
            json!({
                "seq": entry.seq,
                "turn": entry.turn,
                "step": entry.step,
                "call_id": entry.call_id,
                "asked": asked,
                "decided": decided,
            }),
        ));
    }
    for entry in &session.sandbox_modes.entries {
        events.push(base_event(
            actor_id,
            KIND_SANDBOX_MODE,
            entry.ordinal,
            entry.time,
            json!({
                "mode": entry.observation.mode,
                "seq": entry.seq,
                "turn": entry.turn,
                "step": entry.step,
            }),
        ));
    }
    for entry in &session.turns.entries {
        events.push(base_event(
            actor_id,
            KIND_TURN,
            entry.ordinal,
            entry.time,
            json!({
                "turn": entry.observation.turn,
                // SV612 的死循环判定就是比较这个字段——turn 内 tool/call 的
                // 有序 (name, args_text) 列表。第一版桥接漏了它，只投影了
                // `TurnObservation` 的其余六个字段；写 `Sv612Detector` 时才
                // 发现"新路径读不到旧检测器唯一依赖的那个字段"，回来补上。
                "sig": entry.observation.sig,
                "end_reason_kind": entry.observation.end_reason_kind,
                "end_error_code": entry.observation.end_error_code,
                "end_seq": entry.observation.end_seq,
                "end_time": entry.observation.end_time,
                "last_seq": entry.observation.last_seq,
                // entry 自身的坐标（不是 observation 里的）——`from_entry()`
                // 旧实现用它们填 finding 的 turn/step/call_id 展示字段，与
                // `observation.turn`（本 turn 的编号）是两件事，都要留着。
                "seq": entry.seq,
                "entry_turn": entry.turn,
                "step": entry.step,
                "call_id": entry.call_id,
            }),
        ));
    }

    for e in &events {
        e.validate()?;
    }
    events.sort_by_key(|e| e.ordinal);
    Ok(events)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::evidence::{
        ApprovalAsked, ApprovalDecided, ApprovalObservation, Coverage, SandboxModeObservation, SessionMeta, SignalSet,
        Timeline, TimelineEntry, ToolCallObservation, ToolResultObservation, TurnObservation,
    };

    fn entry<T>(observation: T, seq: i64, time: i64, turn: Option<i64>, step: Option<i64>, call_id: Option<&str>, ordinal: usize) -> TimelineEntry<T> {
        TimelineEntry {
            observation,
            seq: Some(seq),
            time: Some(time),
            turn,
            step,
            call_id: call_id.map(|s| s.to_string()),
            ordinal,
        }
    }

    fn empty_session() -> CanonicalSession {
        CanonicalSession {
            meta: SessionMeta { session_id: "session-1".to_string(), host_id: "dsh", workspace_roots: vec![], model: None, span: None },
            signals: SignalSet::EMPTY,
            coverage: Coverage::new(),
            attempts: vec![],
            notes: vec![],
            tool_calls: Timeline::new(),
            tool_results: Timeline::new(),
            approvals: Timeline::new(),
            sandbox_modes: Timeline::new(),
            turns: Timeline::new(),
        }
    }

    #[test]
    fn projects_tool_call_with_attributes_and_stable_ordinal_id() {
        let mut session = empty_session();
        session
            .tool_calls
            .entries
            .push(entry(ToolCallObservation { name: "bash".to_string(), args_text: r#"{"command":"rm -rf /x"}"#.to_string() }, 4, 1004, Some(7), Some(1), Some("call_own"), 3));

        let events = canonical_session_to_vitals(&session).unwrap();
        assert_eq!(events.len(), 1);
        let e = &events[0];
        assert_eq!(e.id, EventId::from("evt-3"));
        assert_eq!(e.ordinal, 3);
        assert_eq!(e.kind, KIND_TOOL_CALL);
        assert_eq!(e.attributes["name"], json!("bash"));
        assert_eq!(e.attributes["turn"], json!(7));
        assert_eq!(e.attributes["call_id"], json!("call_own"));
    }

    #[test]
    fn empty_session_id_falls_back_to_a_stable_anonymous_actor() {
        let mut session = empty_session();
        session.meta.session_id = String::new();
        session.tool_calls.entries.push(entry(ToolCallObservation { name: "bash".to_string(), args_text: "ls".to_string() }, 1, 1001, None, None, None, 0));

        let events = canonical_session_to_vitals(&session).unwrap();
        assert_eq!(events[0].actor_id, ActorId::from(ANONYMOUS_ACTOR));
    }

    #[test]
    fn ordinals_stay_unique_across_all_five_timelines() {
        let mut session = empty_session();
        session.tool_calls.entries.push(entry(ToolCallObservation { name: "bash".to_string(), args_text: "ls".to_string() }, 1, 1001, None, None, None, 0));
        session.tool_results.entries.push(entry(ToolResultObservation { error_code: None }, 2, 1002, None, None, None, 1));
        session.approvals.entries.push(entry(
            ApprovalObservation { asked: Some(ApprovalAsked { tool_name: Some("bash".to_string()), reason: None }), decided: None },
            3,
            1003,
            None,
            None,
            Some("call_a"),
            2,
        ));
        session.sandbox_modes.entries.push(entry(SandboxModeObservation { mode: "read-only".to_string() }, 4, 1004, None, None, None, 3));
        session.turns.entries.push(entry(
            TurnObservation { turn: 1, sig: vec![], last_seq: Some(4), end_reason_kind: None, end_error_code: None, end_seq: None, end_time: None },
            5,
            1005,
            None,
            None,
            None,
            4,
        ));

        let events = canonical_session_to_vitals(&session).unwrap();
        assert_eq!(events.len(), 5);
        let ids: Vec<&str> = events.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(ids, vec!["evt-0", "evt-1", "evt-2", "evt-3", "evt-4"]);
        // 输出按 ordinal 升序。
        assert!(events.windows(2).all(|w| w[0].ordinal < w[1].ordinal));
    }

    #[test]
    fn approval_carries_asked_and_decided_when_present() {
        let mut session = empty_session();
        session.approvals.entries.push(entry(
            ApprovalObservation {
                asked: Some(ApprovalAsked { tool_name: Some("bash".to_string()), reason: Some("escalate".to_string()) }),
                decided: Some(ApprovalDecided { outcome: "allowed-once".to_string() }),
            },
            1,
            1001,
            Some(9),
            Some(2),
            Some("call_ask"),
            0,
        ));
        let events = canonical_session_to_vitals(&session).unwrap();
        assert_eq!(events[0].attributes["asked"]["tool_name"], json!("bash"));
        assert_eq!(events[0].attributes["decided"]["outcome"], json!("allowed-once"));
    }

    #[test]
    fn approval_asked_is_null_not_an_object_with_null_fields_when_absent() {
        // §14.4 SV614(a) 需要能区分"没有 asked 端"（跳过）与"有 asked 端但
        // tool_name 字段恰好是 null"——前者投影成 `null`，后者投影成一个
        // object（哪怕内部字段是 null），两者不可混淆。
        let mut session = empty_session();
        session.approvals.entries.push(entry(
            ApprovalObservation { asked: None, decided: Some(ApprovalDecided { outcome: "rejected".to_string() }) },
            1,
            1001,
            None,
            None,
            Some("call_x"),
            0,
        ));
        let events = canonical_session_to_vitals(&session).unwrap();
        assert_eq!(events[0].attributes["asked"], Value::Null);
        assert_eq!(events[0].attributes["decided"]["outcome"], json!("rejected"));
    }
}
