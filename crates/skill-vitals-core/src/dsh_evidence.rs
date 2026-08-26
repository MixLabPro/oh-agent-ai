//! P2 of the runtime evidence model (`docs/RUNTIME_EVIDENCE_CONTRACT.md` §17).
//!
//! DSH 的五段式适配器流水线（locate → shape → extract → derive → coverage,
//! `evidence::CanonicalSession` 的文档注释）里 "derive → coverage" 这两段：
//! 从 `src/dsh.rs` 已经抽好的 execution_events / usage_events 里数出每个
//! `Signal` 的覆盖情况，拼成 `evidence::CanonicalSession`。"locate → shape →
//! extract" 三段留在 `src/dsh.rs::read_session_log`（I/O，P2 不动——Python
//! 那边的 `adapters/dsh.py` 还要继续逐字节对齐它）。
//!
//! **不是 trait**——`evidence::CanonicalSession` 自己的文档注释已经写明理由
//! （`ARCHITECTURE.md` §4.2）：宿主之间差的是"哪些阶段存在"，trait 会强迫
//! 每个宿主实现一堆空方法，反而把这个差异藏起来。这里就是普通函数。
//!
//! `DshEvidence` 把 `CanonicalSession`（纯 provenance/coverage 记账，§12
//! 规定它不持有任何宿主专属 payload）和它派生自的原始事件捆在一起——
//! `behavior.rs` 的规则引擎现在还得靠原始事件跑（`match_behavior` /
//! `token_by_model` 等还没迁到读 `Signal`，那是 P3 的事），P2 阶段两者必须
//! 一起往下传，不能只留 `CanonicalSession`。
//!
//! `reverse_project` 是临时的桥：P3 把规则迁到直接读 `Signal` 之后这个函数
//! 就删掉，连同 `behavior.rs` 里调用它、再把结果拆包成裸事件数组的桥接代码
//! 一起删。

use serde_json::Value;

use crate::evidence::{CanonicalSession, Coverage, CoverageCounts, SessionMeta, Signal, SignalSet};

/// DSH 适配器一次审计的产物：`CanonicalSession` + 它派生自的原始事件。
pub struct DshEvidence {
    pub canonical: CanonicalSession,
    pub execution_events: Vec<Value>,
    pub usage_events: Vec<Value>,
    pub cwd: Option<String>,
}

fn event_type(ev: &Value) -> Option<&str> {
    ev.get("type").and_then(|v| v.as_str())
}

fn count_types(events: &[Value], types: &[&str]) -> u64 {
    events
        .iter()
        .filter(|e| event_type(e).map(|t| types.contains(&t)).unwrap_or(false))
        .count() as u64
}

fn measured(count: u64) -> CoverageCounts {
    CoverageCounts { measured: count, ..Default::default() }
}

fn derived(count: u64) -> CoverageCounts {
    CoverageCounts { derived: count, ..Default::default() }
}

/// 非零覆盖才计入 `SignalSet`——一个信号在这份日志里从没出现过时，既不
/// 该出现在 signals 集合里，也不该在 `Coverage` 里留一条全零但"看起来
/// 存在"的记录之外的东西（`Coverage::get` 对缺席信号本来就返回全零，见
/// `evidence.rs`）。
fn add(signals: &mut SignalSet, coverage: &mut Coverage, signal: Signal, counts: CoverageCounts) {
    if counts.total() > 0 {
        signals.insert(signal);
    }
    coverage.set(signal, counts);
}

/// execution_events / usage_events → 每个 `Signal` 的覆盖计数，按
/// `docs/RUNTIME_EVIDENCE_CONTRACT.md` §13 host coverage matrix 的 DSH 列
/// 逐条对应。矩阵没覆盖到的三行（SandboxPolicy / UserPrompts /
/// UserCorrections）不编造 provenance——一律记全零（unavailable，不进
/// `SignalSet`），等真正需要这三个信号时再去读 `src/dsh.rs` 的事件类型
/// 补上，不能靠猜。
fn derive_coverage(execution_events: &[Value], usage_events: &[Value]) -> (SignalSet, Coverage) {
    let mut signals = SignalSet::EMPTY;
    let mut coverage = Coverage::new();

    add(&mut signals, &mut coverage, Signal::ToolCalls, measured(count_types(
        execution_events,
        &["tool/call", "tool/code-dispatch-start", "tool/code-dispatch"],
    )));
    add(&mut signals, &mut coverage, Signal::ToolResults, measured(count_types(execution_events, &["tool/result"])));
    add(&mut signals, &mut coverage, Signal::TurnBoundaries, measured(count_types(execution_events, &["turn/start", "turn/end"])));
    add(&mut signals, &mut coverage, Signal::StepBoundaries, measured(count_types(execution_events, &["step/start", "step/end"])));
    // approval/asked 和 approval/decided 是同一个「问了 → 给了结果」生命周期
    // 的两端——P3 group① 发现的真 bug：这里之前只数 decided,漏了 asked,
    // 导致一个只问过、还没等到 approval/decided 就结束的会话(真实存在,
    // 比如会话中途中断)被判定成 ApprovalDecisions 全零覆盖(unavailable),
    // 但日志里明明有 approval/asked 这条证据。
    add(&mut signals, &mut coverage, Signal::ApprovalDecisions, measured(count_types(
        execution_events, &["approval/asked", "approval/decided"],
    )));
    // ApprovalPolicy 和 SandboxModes 目前都只能从 `sandbox/mode` 反推——DSH
    // 日志里没有把"策略"和"当前模式"分成两类事件,§13 对这两行给的都是
    // measured,共用同一个计数源如实反映这一点,不是重复计错。
    add(&mut signals, &mut coverage, Signal::ApprovalPolicy, measured(count_types(execution_events, &["sandbox/mode"])));
    add(&mut signals, &mut coverage, Signal::SandboxModes, measured(count_types(execution_events, &["sandbox/mode"])));
    add(&mut signals, &mut coverage, Signal::Compaction, measured(count_types(
        execution_events,
        &["compaction/start", "compaction/summary", "compaction/end", "compaction/prune"],
    )));
    add(&mut signals, &mut coverage, Signal::Hooks, measured(count_types(execution_events, &["hook/invoked", "hook/result"])));

    // SubagentSpawns / SkillInvocations 不是按 type 白名单能数出来的独立
    // 事件——前者要看 session header 的 parentSession/子会话关联
    // （`subagent.rs::subagent_spawns` 的判定逻辑），后者挂在 user/message
    // 的 data.source.kind 上（`skill.rs::skill_invocations`）。P2 不重新
    // 实现这两条判定（避免出现第二份、可能跑偏的探测规则,P3 迁移规则时
    // 直接把这两个函数的产出接进 Signal model 才是正确位置）。这里只用
    // 「本会话是否有 session 头」做一个保守的存在性下界,标 Derived 而不是
    // Measured——它不是真的从这些事件"测出"子代理/技能调用数,只是知道
    // "这份日志有结构,值得看"。
    let has_session_header = count_types(execution_events, &["session"]) > 0;
    add(&mut signals, &mut coverage, Signal::SubagentSpawns, if has_session_header { derived(1) } else { CoverageCounts::default() });
    add(&mut signals, &mut coverage, Signal::SkillInvocations, if has_session_header { derived(1) } else { CoverageCounts::default() });

    // FileMutations：DSH 没有独立的 file/write 事件类型（不在 dsh.rs 的
    // EXECUTION_EVENT_TYPES 白名单里）。§13 判它 measured 是因为可以从
    // tool/result 反推出具体改了哪些文件,但反推规则是另一层判定逻辑,P2
    // 不重新发明——这里只标 Derived,用 tool/result 的出现次数做下界。
    let tool_result_count = count_types(execution_events, &["tool/result"]);
    add(&mut signals, &mut coverage, Signal::FileMutations, if tool_result_count > 0 { derived(tool_result_count) } else { CoverageCounts::default() });

    // Usage / UsageAggregate 来自单独的 usage_events 数组,不是
    // execution_events——两者是 dsh.rs 里并列的独立字段。
    add(&mut signals, &mut coverage, Signal::Usage, measured(usage_events.len() as u64));
    add(&mut signals, &mut coverage, Signal::UsageAggregate, if usage_events.is_empty() { CoverageCounts::default() } else { derived(1) });

    // ContextWindow：usage_events 里 header 的 system/tools 载荷已经在喂
    // `usage::context_composition`,这里只做存在性判定,不重算那份计算
    // （避免出现第二份可能跑偏的常驻上下文估算）。
    add(&mut signals, &mut coverage, Signal::ContextWindow, if usage_events.is_empty() { CoverageCounts::default() } else { derived(1) });

    // NetworkAccess：§13 判 DSH unavailable——EXECUTION_EVENT_TYPES 里确实
    // 没有任何网络访问事件类型,如实记 unavailable（全零 coverage,不进
    // SignalSet）,不编一个措辞好看的"未来支持"。
    coverage.set(Signal::NetworkAccess, CoverageCounts::default());

    // 契约 §13 矩阵没有这三行的 DSH 列——不编造,一律 unavailable。
    coverage.set(Signal::SandboxPolicy, CoverageCounts::default());
    coverage.set(Signal::UserPrompts, CoverageCounts::default());
    coverage.set(Signal::UserCorrections, CoverageCounts::default());

    (signals, coverage)
}

/// execution_events + usage_events + cwd → `DshEvidence`。五段式流水线的
/// "derive → coverage" 两段；"locate → shape → extract" 留在
/// `src/dsh.rs::read_session_log`（P2 不动）。
pub fn build_dsh_evidence(
    execution_events: Vec<Value>,
    usage_events: Vec<Value>,
    cwd: Option<String>,
    session_id: String,
) -> DshEvidence {
    let (signals, coverage) = derive_coverage(&execution_events, &usage_events);
    let canonical = CanonicalSession {
        meta: SessionMeta {
            session_id,
            host_id: "dsh",
            workspace_roots: cwd.clone().into_iter().collect(),
            model: None,
            span: None,
        },
        signals,
        coverage,
        attempts: Vec::new(),
        notes: Vec::new(),
    };
    DshEvidence { canonical, execution_events, usage_events, cwd }
}

/// 临时反向投影——把 `DshEvidence` 转回 `behavior.rs` 现有规则引擎期待的
/// 输入形状（裸的 execution_events / usage_events / cwd）。P3 把规则迁到
/// 直接读 `Signal` 之后删掉这个函数，连同调用它的桥接代码。
pub fn reverse_project(evidence: &DshEvidence) -> (Vec<Value>, Vec<Value>, Option<String>) {
    (evidence.execution_events.clone(), evidence.usage_events.clone(), evidence.cwd.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ev(t: &str) -> Value {
        json!({"type": t, "seq": 0, "time": 0, "data": {}})
    }

    #[test]
    fn reverse_project_recovers_exact_events_and_cwd() {
        let execution_events = vec![ev("tool/call"), ev("tool/result")];
        let usage_events = vec![json!({"type": "tool/call", "seq": 0, "time": 0,
            "data": {"header": {"config": {"model": "m"}}}})];
        let evidence = build_dsh_evidence(
            execution_events.clone(), usage_events.clone(),
            Some("/repo".to_string()), "s1".to_string());
        let (ex, us, cwd) = reverse_project(&evidence);
        assert_eq!(ex, execution_events, "反向投影必须字节级还原 execution_events");
        assert_eq!(us, usage_events, "反向投影必须字节级还原 usage_events");
        assert_eq!(cwd, Some("/repo".to_string()));
    }

    #[test]
    fn reverse_project_recovers_none_cwd() {
        let evidence = build_dsh_evidence(vec![], vec![], None, "s1".to_string());
        let (_, _, cwd) = reverse_project(&evidence);
        assert_eq!(cwd, None);
    }

    #[test]
    fn tool_calls_and_results_counted_from_matching_event_types() {
        let events = vec![ev("tool/call"), ev("tool/call"), ev("tool/result"), ev("turn/start")];
        let evidence = build_dsh_evidence(events, vec![], None, "s1".to_string());
        let cov = &evidence.canonical.coverage;
        assert_eq!(cov.get(Signal::ToolCalls).measured, 2);
        assert_eq!(cov.get(Signal::ToolResults).measured, 1);
        assert!(evidence.canonical.signals.contains(Signal::ToolCalls));
        assert!(evidence.canonical.signals.contains(Signal::ToolResults));
    }

    #[test]
    fn absent_signal_is_not_in_signal_set_and_coverage_is_zero() {
        let evidence = build_dsh_evidence(vec![ev("tool/call")], vec![], None, "s1".to_string());
        assert!(!evidence.canonical.signals.contains(Signal::Hooks),
            "没有 hook/* 事件时 Hooks 不应进 SignalSet");
        assert_eq!(evidence.canonical.coverage.get(Signal::Hooks), CoverageCounts::default());
    }

    #[test]
    fn approval_asked_counts_toward_approval_decisions_signal() {
        // 回归测试:P3 group① 发现——只问过(approval/asked)但会话在等到
        // approval/decided 之前就结束,之前会被错判成 ApprovalDecisions
        // 全零覆盖(unavailable),明明日志里有证据。
        let evidence = build_dsh_evidence(vec![ev("approval/asked")], vec![], None, "s1".to_string());
        assert_eq!(evidence.canonical.coverage.get(Signal::ApprovalDecisions).measured, 1);
        assert!(evidence.canonical.signals.contains(Signal::ApprovalDecisions));
    }

    #[test]
    fn network_access_is_always_unavailable_for_dsh() {
        let evidence = build_dsh_evidence(vec![ev("tool/call")], vec![json!({"a": 1})], None, "s1".to_string());
        assert!(!evidence.canonical.signals.contains(Signal::NetworkAccess));
        assert_eq!(evidence.canonical.coverage.get(Signal::NetworkAccess), CoverageCounts::default());
    }

    #[test]
    fn unmapped_signals_are_unavailable_not_fabricated() {
        // §13 矩阵没有 DSH 列的三行——必须原样全零,不能编一个非零数字出来。
        let evidence = build_dsh_evidence(vec![ev("tool/call")], vec![json!({"a": 1})], None, "s1".to_string());
        for signal in [Signal::SandboxPolicy, Signal::UserPrompts, Signal::UserCorrections] {
            assert_eq!(evidence.canonical.coverage.get(signal), CoverageCounts::default());
            assert!(!evidence.canonical.signals.contains(signal));
        }
    }

    #[test]
    fn usage_signal_measured_count_matches_usage_events_len() {
        let usage_events = vec![json!({"a": 1}), json!({"a": 2}), json!({"a": 3})];
        let evidence = build_dsh_evidence(vec![], usage_events, None, "s1".to_string());
        assert_eq!(evidence.canonical.coverage.get(Signal::Usage).measured, 3);
        assert!(evidence.canonical.signals.contains(Signal::Usage));
    }

    #[test]
    fn empty_session_has_no_signals_measured() {
        let evidence = build_dsh_evidence(vec![], vec![], None, "s1".to_string());
        assert_eq!(evidence.canonical.coverage.overall_ratio(), None);
    }

    #[test]
    fn session_meta_carries_dsh_host_id_and_workspace_root() {
        let evidence = build_dsh_evidence(vec![], vec![], Some("/x/y".to_string()), "s1".to_string());
        assert_eq!(evidence.canonical.meta.host_id, "dsh");
        assert_eq!(evidence.canonical.meta.workspace_roots, vec!["/x/y".to_string()]);
        assert_eq!(evidence.canonical.meta.session_id, "s1");
    }
}
