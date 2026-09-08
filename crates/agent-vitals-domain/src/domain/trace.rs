//! `build_trace_graph`——v0.10.0 的核心纯函数（spec §2.1 / §2.1.1 / §6.1 「v0.9
//! 锚点」同一条纪律：种子是已落地的 `CanonicalSession`，本模块不重新解析任何
//! 宿主 wire 形状，也不做任何 I/O（domain crate 的边界，见
//! `tests/dependency_budget.rs`）。
//!
//! **不是每宿主一份**（与 spec §6.2 字面列出的 `hosts/<h>/sessions/trace.rs`
//! 有意的一处偏离，理由记在这里）：`CanonicalSession` 本身就是宿主中立的
//! 投影——`behavior.rs`/`trajectory.rs` 的 SV601–614 已经证明"host-neutral
//! 输入 + 一份纯函数"这个模式在三宿主上是可行且必须保持字节确定性的（spec
//! §3「v0.9 锚点」明写"直接复用 SV 规则的种子，不重写"）。给同一类输入的
//! 三份"host-specific trace.rs"必须逐字节产出相同结果，那就不是三份代码，
//! 是一份代码的三次粘贴——本函数直接是 `CanonicalSession -> TraceGraph`
//! 的单一实现，`agent-vitals-hosts` 侧只需要（未来）传对 `host_id` + `session_key`。
//!
//! **门槛对照（spec §7 v0.10.0）**：
//! 1. 输入源唯一 = `&CanonicalSession`，不读 raw event —— 本函数签名就是这个承诺；
//! 2. 缺失关系不得补造 —— coverage 的三个计数 + `unmetered_nodes` 如实统计，
//!    `parent_node_id`/`status`/`started_at_ms` 缺失时留 `None`；
//! 6. 节点排序走 `(scope, ordinal)`，不按 `started_at_ms`——见 `assign_ordinals`。

use std::collections::BTreeMap;

use serde_json::{json, Value};

use crate::contracts::evidence::{CanonicalSession, Provenance, TimelineEntry};
use crate::contracts::r2a::SessionKey;
use crate::contracts::source_identity::{canonical_json, fnv1a64_hex};
use crate::contracts::trace_graph::{
    BranchState, TraceCoverage, TraceEdge, TraceEdgeType, TraceGraph, TraceNode, TraceNodeType,
    TraceStatus, TRACE_GRAPH_SCHEMA_VERSION,
};

fn stable_id(seed: &Value) -> String {
    let mut buf = String::new();
    canonical_json(seed, &mut buf);
    fnv1a64_hex(buf.as_bytes())
}

/// 一个尚未定序的候选节点：先把 turns + tool_calls 两条 timeline 的条目都
/// 转成这个中立形状，再统一按 `(seq, timeline_priority, entry.ordinal)`
/// 排序、赋真正的 `ordinal`——两条 timeline 各自的内部顺序不能直接决定
/// 图里的全局顺序，必须先合并再排。
struct Candidate {
    seq: Option<i64>,
    /// 同一 `seq` 下的决胜位——turn 在其子 tool_call 之前（叙事顺序，且
    /// 两者永远不共享同一个 seq 值时这个字段不起作用，只在真机撞 seq 时
    /// 生效，是确定性 tie-break 不是随意选择）。
    timeline_priority: u8,
    /// adapter 已经赋好的、单条 timeline 内的稳定位置——用作最终决胜位，
    /// 不是本函数发明的顺序（该字段本就是 `CanonicalSession` 构造时定死的）。
    entry_ordinal: usize,
    native: String,
    node_type: TraceNodeType,
    started_at_ms: Option<i64>,
    ended_at_ms: Option<i64>,
    status: Option<TraceStatus>,
    provenance: Provenance,
    values: BTreeMap<String, f64>,
    metadata: Value,
    /// turn 号——tool_call 节点靠它找父节点；turn 节点自己的 turn 号也存这里
    /// （用来给 tool_call 反查时对照）。
    turn_no: Option<i64>,
    is_turn_root: bool,
}

fn turn_status(end_reason_kind: &Option<String>) -> Option<TraceStatus> {
    match end_reason_kind.as_deref() {
        None => None,
        Some("error") => Some(TraceStatus::Error),
        Some(_) => Some(TraceStatus::Ok),
    }
}

/// `failed` 是宿主报的通用是/否信号（不是所有宿主都有——DSH 恒 `None`，只报
/// `error_code`；Claude Code 的 `is_error` 是这种）；`error_code` 是原因级信号
/// （DSH 报这个）。两个字段哪个有值都算「有失败信号」——两者都缺时才是真的
/// 「不知道」，不能因为其中一个字段是这个宿主的空档就冒充没失败。
fn tool_result_status(failed: Option<bool>, error_code: &Option<String>) -> Option<TraceStatus> {
    if error_code.is_some() || failed == Some(true) {
        return Some(TraceStatus::Error);
    }
    match failed {
        Some(false) => Some(TraceStatus::Ok),
        _ => None,
    }
}

fn turn_candidates(session: &CanonicalSession) -> Vec<Candidate> {
    session
        .turns
        .entries
        .iter()
        .map(|e: &TimelineEntry<_>| {
            let obs = &e.observation;
            let mut values = BTreeMap::new();
            values.insert("tool_call_count".to_string(), obs.sig.len() as f64);
            Candidate {
                seq: e.seq,
                timeline_priority: 0, // turns 先于同 seq 的 tool_call
                entry_ordinal: e.ordinal,
                native: format!("turn-{}", obs.turn),
                node_type: TraceNodeType::AssistantTurn,
                started_at_ms: e.time,
                ended_at_ms: obs.end_time,
                status: turn_status(&obs.end_reason_kind),
                provenance: e.provenance,
                values,
                metadata: json!({
                    "end_error_code": obs.end_error_code,
                }),
                turn_no: Some(obs.turn),
                is_turn_root: true,
            }
        })
        .collect()
}

fn tool_call_candidates(session: &CanonicalSession) -> Vec<Candidate> {
    // call_id -> 对应的 tool_result entry（同 call_id 理论上只有一个 result；
    // 真机若出现重复，取第一个——不是本函数要检测的异常，交给行为规则层）。
    let mut result_by_call: BTreeMap<&str, &TimelineEntry<_>> = BTreeMap::new();
    for r in &session.tool_results.entries {
        if let Some(cid) = r.call_id.as_deref() {
            result_by_call.entry(cid).or_insert(r);
        }
    }

    session
        .tool_calls
        .entries
        .iter()
        .enumerate()
        .map(|(idx, e): (usize, &TimelineEntry<_>)| {
            let obs = &e.observation;
            let matched_result = e.call_id.as_deref().and_then(|cid| result_by_call.get(cid));
            let (ended_at_ms, status) = match matched_result {
                Some(r) => (r.time, tool_result_status(r.observation.failed, &r.observation.error_code)),
                None => (None, None),
            };
            let native = e
                .call_id
                .clone()
                .unwrap_or_else(|| format!("tool-call-seq-{}-{idx}", e.seq.map_or_else(|| "none".to_string(), |s| s.to_string())));
            Candidate {
                seq: e.seq,
                timeline_priority: 1,
                entry_ordinal: e.ordinal,
                native,
                node_type: TraceNodeType::ToolCall,
                started_at_ms: e.time,
                ended_at_ms,
                status,
                provenance: e.provenance,
                values: BTreeMap::new(),
                metadata: json!({"name": obs.name}),
                turn_no: e.turn,
                is_turn_root: false,
            }
        })
        .collect()
}

/// spec §7 门槛 6：`(scope, ordinal)` 才是权威顺序，`started_at_ms` 只用于
/// 展示。排序键 = `(seq 是否缺失, seq 值, timeline_priority, entry_ordinal)`——
/// 全部来自输入已有的字段，不引入 mtime / 数组扫描顺序。
fn sort_candidates(mut cands: Vec<Candidate>) -> Vec<Candidate> {
    cands.sort_by(|a, b| {
        let a_key = (a.seq.is_none(), a.seq.unwrap_or(i64::MAX), a.timeline_priority, a.entry_ordinal);
        let b_key = (b.seq.is_none(), b.seq.unwrap_or(i64::MAX), b.timeline_priority, b.entry_ordinal);
        a_key.cmp(&b_key)
    });
    cands
}

/// `CanonicalSession` → `TraceGraph`（spec §2.1）。`session_key` 由调用方提供
/// ——`CanonicalSession::SessionMeta` 不携带 `source_profile`/`machine_namespace`
/// （那是 ingest 层的 `SessionKey` 四元组的另外两段，`trace_service` 从 SQL
/// 会话行读得到，纯函数层不该假装自己知道）。
pub fn build_trace_graph(session: &CanonicalSession, session_key: SessionKey) -> TraceGraph {
    let turns = turn_candidates(session);
    let tool_calls = tool_call_candidates(session);

    let mut all: Vec<Candidate> = Vec::with_capacity(turns.len() + tool_calls.len());
    all.extend(turns);
    all.extend(tool_calls);
    let sorted = sort_candidates(all);

    // 先建 node_id + turn_no -> node_id 映射（turn 节点），再回填 tool_call
    // 的 parent_node_id——两趟遍历是因为 parent 必须引用已经算好 node_id 的
    // turn 节点，顺序不可颠倒。
    let host_id = session.meta.host_id;
    let mut nodes: Vec<TraceNode> = Vec::with_capacity(sorted.len());
    let mut turn_node_id_by_no: BTreeMap<i64, String> = BTreeMap::new();

    for (ordinal, c) in sorted.iter().enumerate() {
        let node_id = stable_id(&json!({
            "host": host_id,
            "session_key": session_key.to_json(),
            "scope": "main",
            "ordinal": ordinal as u64,
            "native": c.native,
            "node_type": c.node_type.as_str(),
        }));
        if c.is_turn_root {
            if let Some(t) = c.turn_no {
                turn_node_id_by_no.entry(t).or_insert_with(|| node_id.clone());
            }
        }
        nodes.push(TraceNode {
            node_id,
            scope: "main".to_string(),
            ordinal: ordinal as u64,
            native: c.native.clone(),
            node_type: c.node_type,
            fact_id: String::new(),
            evidence_ref: String::new(),
            parent_node_id: None, // 第二趟回填
            branch_state: BranchState::Live,
            started_at_ms: c.started_at_ms,
            ended_at_ms: c.ended_at_ms,
            status: c.status,
            provenance: c.provenance,
            values: c.values.clone(),
            metadata: c.metadata.clone(),
        });
    }

    let mut missing_parent: u32 = 0;
    let mut edges: Vec<TraceEdge> = Vec::new();
    for (i, c) in sorted.iter().enumerate() {
        if c.is_turn_root {
            continue; // turn 节点本身无 parent，不是「期望有但缺」
        }
        let Some(turn_no) = c.turn_no else {
            continue; // 未归属任何 turn——按设计如此，不是缺失（TurnObservation 文档同款）
        };
        match turn_node_id_by_no.get(&turn_no) {
            Some(parent_id) => {
                nodes[i].parent_node_id = Some(parent_id.clone());
                let edge_id = stable_id(&json!({
                    "from": parent_id, "to": nodes[i].node_id, "edge_type": "control_flow",
                }));
                edges.push(TraceEdge {
                    edge_id,
                    from_node_id: parent_id.clone(),
                    to_node_id: nodes[i].node_id.clone(),
                    fact_id: String::new(),
                    evidence_ref: String::new(),
                    edge_type: TraceEdgeType::ControlFlow,
                    provenance: nodes[i].provenance,
                });
            }
            None => {
                // turn 号在事件流里出现过，但没有对应的 turn 节点——真实的
                // 解析失败，不是「不归任何 turn」，必须计入 coverage。
                missing_parent += 1;
            }
        }
    }

    let missing_time = nodes
        .iter()
        .filter(|n| n.started_at_ms.is_none() && n.ended_at_ms.is_none())
        .count() as u32;
    let missing_status = nodes.iter().filter(|n| n.status.is_none()).count() as u32;
    let unmetered_nodes = nodes
        .iter()
        .filter(|n| !matches!(n.branch_state, BranchState::Live))
        .count() as u32;

    let coverage = TraceCoverage {
        missing_parent,
        missing_time,
        missing_status,
        unmetered_nodes,
        total_nodes: nodes.len() as u32,
        total_edges: edges.len() as u32,
    };

    let graph_id = stable_id(&json!({
        "kind": "trace_graph", "host": host_id, "session_key": session_key.to_json(),
    }));
    let fingerprint_seed: Vec<Value> = nodes
        .iter()
        .map(|n| json!([n.native, n.ordinal, n.node_type.as_str()]))
        .collect();
    let input_fingerprint = stable_id(&Value::Array(fingerprint_seed));

    TraceGraph {
        schema_version: TRACE_GRAPH_SCHEMA_VERSION,
        graph_id,
        session_key,
        task_id: None, // spec §2.1.1 三分法：图级别目前没有信号来源（见 trace_graph.rs 头注）
        nodes,
        edges,
        coverage,
        input_fingerprint,
    }
}

// 单测（含用 `agent_vitals_hosts::dsh_evidence::build_dsh_evidence` 造真实
// `CanonicalSession` fixture 的那批）搬到 `tests/trace_graph.rs`——原因与
// `tests/behavior_rules.rs` 头注同源：跨 crate 传 domain 类型的 inline lib
// test 若同时依赖 `agent-vitals-hosts`（[dev-dependencies]），会在
// `cargo test --lib` 时撞「multiple versions of crate」，因为 hosts crate
// 自己又反向依赖 domain。集成测试（`tests/` 下独立编译单元）不受影响。
