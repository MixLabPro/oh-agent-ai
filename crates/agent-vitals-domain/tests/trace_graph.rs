//! `domain::trace::build_trace_graph` 的 canonical-fixture 测试——与
//! `tests/behavior_rules.rs` 同一个理由迁到集成测试：经
//! `agent_vitals_hosts::dsh_evidence::build_dsh_evidence` 造 `CanonicalSession`
//! fixture，跨 crate 传 domain 类型的 inline lib test 会撞
//! `multiple versions of crate`。

use agent_vitals_domain::contracts::r2a::SessionKey;
use agent_vitals_domain::contracts::trace_graph::{BranchState, TraceEdgeType, TraceNodeType, TraceStatus};
use agent_vitals_domain::domain::trace::build_trace_graph;
use agent_vitals_hosts::dsh_evidence::build_dsh_evidence;
use agent_vitals_domain::evidence::CanonicalSession;
use serde_json::{json, Value};

fn tool_call(seq: i64, time: i64, name: &str, call_id: &str, turn: i64) -> Value {
    json!({
        "type": "tool/call", "seq": seq, "time": time,
        "data": {"name": name, "arguments": "{}", "callId": call_id, "turn": turn},
    })
}

fn tool_result(seq: i64, time: i64, call_id: &str, error_code: Option<&str>) -> Value {
    // DSH 的 `result_code` 读 `data.error.code`（嵌套对象），不是 `data.error`
    // 本身——见 `hosts/dsh/sessions/evidence.rs::result_code`。
    json!({
        "type": "tool/result", "seq": seq, "time": time,
        "data": {"callId": call_id, "error": error_code.map(|c| json!({"code": c}))},
    })
}

fn turn_start(seq: i64, time: i64, turn: i64) -> Value {
    json!({"type": "turn/start", "seq": seq, "time": time, "data": {"turn": turn}})
}

fn turn_end(seq: i64, time: i64, turn: i64, reason: &str) -> Value {
    json!({
        "type": "turn/end", "seq": seq, "time": time,
        "data": {"turn": turn, "reason": {"kind": reason}},
    })
}

fn synth_session(events: Vec<Value>) -> CanonicalSession {
    build_dsh_evidence(events, Vec::new(), Some("/tmp/proj".to_string()), "s1".to_string()).canonical
}

fn key() -> SessionKey {
    SessionKey::new("dsh", "s1", "default", "ns-test")
}

#[test]
fn deterministic_same_input_twice_produces_identical_graph() {
    let events = vec![
        turn_start(1, 1000, 1),
        tool_call(2, 1001, "read", "c1", 1),
        tool_result(3, 1002, "c1", None),
        turn_end(4, 1003, 1, "ok"),
    ];
    let s1 = synth_session(events.clone());
    let s2 = synth_session(events);
    let g1 = build_trace_graph(&s1, key());
    let g2 = build_trace_graph(&s2, key());
    assert_eq!(g1.to_json(), g2.to_json(), "同一输入必须产出字节相同的图");
    assert_eq!(g1.graph_id, g2.graph_id);
    assert_eq!(g1.input_fingerprint, g2.input_fingerprint);
}

#[test]
fn nodes_are_sorted_by_seq_not_by_declaration_or_time() {
    // turn/start seq=1，但把 tool_call 的 seq 故意设得比 turn 大，验证排序
    // 跟着 seq 走，不是「turns 先于 tool_calls」这种硬编码分组。
    let events = vec![
        turn_start(1, 1000, 1),
        tool_call(5, 999, "read", "c1", 1), // time 比 turn 早，但 seq 更大
        tool_result(6, 1002, "c1", None),
        turn_end(7, 1003, 1, "ok"),
    ];
    let session = synth_session(events);
    let g = build_trace_graph(&session, key());
    // 权威顺序按 (scope, ordinal)，ordinal 源自 seq：turn(seq=1) 排第一，
    // tool_call(seq=5) 排第二——即便 tool_call 的 started_at_ms 更早。
    assert_eq!(g.nodes[0].node_type, TraceNodeType::AssistantTurn);
    assert_eq!(g.nodes[0].ordinal, 0);
    assert_eq!(g.nodes[1].node_type, TraceNodeType::ToolCall);
    assert_eq!(g.nodes[1].ordinal, 1);
    assert!(g.nodes[0].started_at_ms.unwrap() > g.nodes[1].started_at_ms.unwrap());
}

#[test]
fn tool_call_gets_turn_as_parent_and_a_control_flow_edge() {
    let events = vec![
        turn_start(1, 1000, 1),
        tool_call(2, 1001, "read", "c1", 1),
        tool_result(3, 1002, "c1", None),
        turn_end(4, 1003, 1, "ok"),
    ];
    let session = synth_session(events);
    let g = build_trace_graph(&session, key());
    let turn_node = g.nodes.iter().find(|n| n.node_type == TraceNodeType::AssistantTurn).unwrap();
    let call_node = g.nodes.iter().find(|n| n.node_type == TraceNodeType::ToolCall).unwrap();
    assert_eq!(call_node.parent_node_id.as_deref(), Some(turn_node.node_id.as_str()));
    assert_eq!(g.edges.len(), 1);
    assert_eq!(g.edges[0].from_node_id, turn_node.node_id);
    assert_eq!(g.edges[0].to_node_id, call_node.node_id);
    assert_eq!(g.edges[0].edge_type, TraceEdgeType::ControlFlow);
    assert_eq!(g.coverage.missing_parent, 0);
}

#[test]
fn tool_call_with_unresolvable_turn_counts_as_missing_parent_not_zero() {
    // turn=99 从未出现过 turn/start——「有 turn 号但解析不出节点」是真实
    // 缺失，必须计入 missing_parent，不能悄悄挂 None 假装没发生。
    let events = vec![
        tool_call(1, 1000, "read", "c1", 99),
        tool_result(2, 1001, "c1", None),
    ];
    let session = synth_session(events);
    let g = build_trace_graph(&session, key());
    let call_node = g.nodes.iter().find(|n| n.node_type == TraceNodeType::ToolCall).unwrap();
    assert_eq!(call_node.parent_node_id, None);
    assert_eq!(g.coverage.missing_parent, 1);
    assert_eq!(g.edges.len(), 0);
}

#[test]
fn tool_result_error_propagates_to_tool_call_node_status() {
    let events = vec![
        turn_start(1, 1000, 1),
        tool_call(2, 1001, "bash", "c1", 1),
        tool_result(3, 1002, "c1", Some("permission_denied")),
        turn_end(4, 1003, 1, "ok"),
    ];
    let session = synth_session(events);
    let g = build_trace_graph(&session, key());
    let call_node = g.nodes.iter().find(|n| n.node_type == TraceNodeType::ToolCall).unwrap();
    assert_eq!(call_node.status, Some(TraceStatus::Error));
    assert_eq!(call_node.ended_at_ms, Some(1002));
    assert_eq!(g.coverage.missing_status, 0);
}

#[test]
fn tool_call_without_matching_result_has_no_status_and_counts_as_missing() {
    // turn_end 补全，让 turn 节点自己有 status——这条测试只想验证 tool_call
    // 缺 result 时的行为，不该被「turn 也没结束」这个无关缺失干扰断言。
    let events = vec![
        turn_start(1, 1000, 1),
        tool_call(2, 1001, "bash", "c1", 1),
        turn_end(3, 1002, 1, "ok"),
    ];
    let session = synth_session(events);
    let g = build_trace_graph(&session, key());
    let call_node = g.nodes.iter().find(|n| n.node_type == TraceNodeType::ToolCall).unwrap();
    assert_eq!(call_node.status, None, "没有 tool_result 时不得冒充 ok/error");
    assert_eq!(g.coverage.missing_status, 1, "只有 tool_call 这一个节点缺 status");
}

#[test]
fn turn_end_error_reason_sets_error_status() {
    let events = vec![turn_start(1, 1000, 1), turn_end(2, 1001, 1, "error")];
    let session = synth_session(events);
    let g = build_trace_graph(&session, key());
    let turn_node = g.nodes.iter().find(|n| n.node_type == TraceNodeType::AssistantTurn).unwrap();
    assert_eq!(turn_node.status, Some(TraceStatus::Error));
}

#[test]
fn empty_session_yields_empty_graph_not_a_crash() {
    let session = synth_session(vec![]);
    let g = build_trace_graph(&session, key());
    assert!(g.nodes.is_empty());
    assert!(g.edges.is_empty());
    assert_eq!(g.coverage.total_nodes, 0);
    assert_eq!(g.coverage.missing_parent, 0);
}

#[test]
fn values_map_is_deterministic_and_carries_tool_call_count() {
    let events = vec![
        turn_start(1, 1000, 1),
        tool_call(2, 1001, "read", "c1", 1),
        tool_result(3, 1002, "c1", None),
        tool_call(4, 1003, "write", "c2", 1),
        tool_result(5, 1004, "c2", None),
        turn_end(6, 1005, 1, "ok"),
    ];
    let session = synth_session(events);
    let g = build_trace_graph(&session, key());
    let turn_node = g.nodes.iter().find(|n| n.node_type == TraceNodeType::AssistantTurn).unwrap();
    assert_eq!(turn_node.values.get("tool_call_count"), Some(&2.0));
}

#[test]
fn branch_state_defaults_live_and_unmetered_nodes_is_zero_for_v0_10_0() {
    // 诚实性边界 2（trace_graph.rs 头注）：CanonicalSession 目前只装得下
    // 一条已选定路径，v0.10.0 尚无信号区分废弃分支，所以恒 Live——这条测试
    // 钉住「不伪造 Abandoned」，同时钉住这不是遗漏（有意为之）。
    let events = vec![turn_start(1, 1000, 1), turn_end(2, 1001, 1, "ok")];
    let session = synth_session(events);
    let g = build_trace_graph(&session, key());
    assert!(g.nodes.iter().all(|n| matches!(n.branch_state, BranchState::Live)));
    assert_eq!(g.coverage.unmetered_nodes, 0);
}

#[test]
fn node_id_is_stable_across_two_builds_of_the_same_session() {
    let events = vec![turn_start(1, 1000, 1), tool_call(2, 1001, "read", "c1", 1)];
    let session = synth_session(events);
    let g1 = build_trace_graph(&session, key());
    let g2 = build_trace_graph(&session, key());
    for (a, b) in g1.nodes.iter().zip(g2.nodes.iter()) {
        assert_eq!(a.node_id, b.node_id, "node_id 必须是同输入下的稳定哈希");
    }
}

#[test]
fn different_session_key_changes_node_id_but_not_graph_shape() {
    // node_id 的种子含 session_key（防止跨会话撞键），但图的结构（节点数/
    // 排序/coverage）不该随 session_key 变化——只有 id 字符串本身会变。
    let events = vec![turn_start(1, 1000, 1), tool_call(2, 1001, "read", "c1", 1)];
    let session = synth_session(events);
    let g1 = build_trace_graph(&session, key());
    let other_key = SessionKey::new("dsh", "s1", "default", "ns-OTHER");
    let g2 = build_trace_graph(&session, other_key);
    assert_eq!(g1.nodes.len(), g2.nodes.len());
    assert_ne!(g1.nodes[0].node_id, g2.nodes[0].node_id);
    assert_ne!(g1.graph_id, g2.graph_id);
}
