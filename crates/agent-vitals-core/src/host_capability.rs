//! host-capability degradation 表的单一事实来源。
//!
//! 两条宿主路径（Claude Code 的 SV607/608、WorkBuddy 的 SV604/605）把
//! MeasuredZero 覆盖成 Unavailable 的理由与规则集合，原本埋在各自的 dispatcher
//! 层（`src/agent/claude_session.rs` / `src/agent/workbuddy_session.rs`），core 的
//! `match_behavior_canonical` 无守卫——未来任何直接消费 canonical 的 surface
//! （Tauri 菜单栏 / workbench 接线）都会拿到「结构上读不到维度却报零命中」的
//! 假测量。表在这里下沉：CLI 两个 dispatcher 与未来消费者共用同一个
//! `host_id → (规则集, 缺失信号, reason)` 映射，漏一条宿主 = 漏一处 degrade。
//! 共享求值器 `behavior.rs` 不碰这张表——它宿主无关，特例进共享代码就再难
//! 摘出来（`canonical_audit.py` 的模块文档钉了同一条纪律）。
//!
//! **只覆盖 MeasuredZero**：门控已因 timeline 空给 Unavailable（缺失信号、无需
//! override）或给了 Findings（真命中）时保持原样——override 永不吞真命中。
//!
//! 与 Python `scripts/agent_vitals/agent/host_capability.py` 逐字节对齐（reason
//! 文案、规则集合、missing 信号），差分测试靠它。

use crate::evidence::{RuleOutcome, Signal};

/// SV607/608 host-capability degradation 的 reason。Claude 的 tool_result 没有
/// 原因码词汇——`error_code` 结构性恒 None（绝不伪造原因码，§3），SV607/608 是
/// 原因级检测器（读 error_code，不读 failed），在全 None 上空转出 MeasuredZero
/// 是对「结构上读不到原因」撒谎。与 Python `host_capability.py` 的
/// `CLAUDE_SV607_608_REASON` 逐字节相同。
pub const CLAUDE_SV607_608_REASON: &str = "claude-code host capability: tool results carry \
no reason codes (error_code structurally absent); SV607/608 are reason-level detectors and \
cannot discriminate";

/// SV604/605 host-capability degradation 的 reason。WorkBuddy 的 `tool_calls`
/// timeline 只有 bash（audit-log `commandPreview`）和 web_fetch（`WebFetch`
/// target）两个子集可 join——write/edit 只存在于会话匿名的 traces。
/// 与 Python `host_capability.py` 的 `WORKBUDDY_SV604_605_REASON` 逐字节相同。
pub const WORKBUDDY_SV604_605_REASON: &str = "workbuddy host capability: only bash \
(audit-log commandPreview) and web_fetch (WebFetch target) tool calls are joinable to \
sessions; write/edit tool calls exist only in session-anonymous traces (file-history has \
content without paths), so SV604/605 cannot discriminate";

/// 把宿主的结构性缺口如实标注成 Unavailable。未知宿主 → no-op（DSH/Codex 没有
/// 这种 degrade，它们的 golden 字节零改动）。
pub fn degrade_rule_outcomes(host_id: &str, outcomes: &mut [(&'static str, RuleOutcome)]) {
    let (codes, missing, reason): (&[&str], &[Signal], &str) = match host_id {
        "claude-code" => (&["SV607", "SV608"], &[Signal::ToolResults], CLAUDE_SV607_608_REASON),
        "workbuddy" => (&["SV604", "SV605"], &[Signal::ToolCalls], WORKBUDDY_SV604_605_REASON),
        _ => return,
    };
    for (code, outcome) in outcomes.iter_mut() {
        if codes.contains(code) && matches!(outcome, RuleOutcome::MeasuredZero) {
            *outcome = RuleOutcome::Unavailable {
                missing: missing.to_vec(),
                reason: reason.to_string(),
            };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn outcomes() -> Vec<(&'static str, RuleOutcome)> {
        vec![
            ("SV601", RuleOutcome::MeasuredZero),
            ("SV604", RuleOutcome::MeasuredZero),
            ("SV605", RuleOutcome::MeasuredZero),
            ("SV607", RuleOutcome::MeasuredZero),
            ("SV608", RuleOutcome::MeasuredZero),
        ]
    }

    fn unavailable_of(o: &RuleOutcome) -> Option<(&[Signal], &str)> {
        match o {
            RuleOutcome::Unavailable { missing, reason } => Some((missing, reason)),
            _ => None,
        }
    }

    #[test]
    fn claude_code_flips_only_measured_zero_sv607_sv608() {
        let mut out = outcomes();
        degrade_rule_outcomes("claude-code", &mut out);
        for (code, outcome) in &out {
            match *code {
                "SV607" | "SV608" => {
                    let (missing, reason) = unavailable_of(outcome).expect("必须 Unavailable");
                    assert_eq!(missing, &[Signal::ToolResults]);
                    assert_eq!(reason, CLAUDE_SV607_608_REASON);
                }
                _ => assert!(matches!(outcome, RuleOutcome::MeasuredZero), "{code} 不得动"),
            }
        }
    }

    #[test]
    fn workbuddy_flips_only_measured_zero_sv604_sv605() {
        let mut out = outcomes();
        degrade_rule_outcomes("workbuddy", &mut out);
        for (code, outcome) in &out {
            match *code {
                "SV604" | "SV605" => {
                    let (missing, reason) = unavailable_of(outcome).expect("必须 Unavailable");
                    assert_eq!(missing, &[Signal::ToolCalls]);
                    assert_eq!(reason, WORKBUDDY_SV604_605_REASON);
                }
                _ => assert!(matches!(outcome, RuleOutcome::MeasuredZero), "{code} 不得动"),
            }
        }
    }

    #[test]
    fn unknown_host_is_a_no_op() {
        let mut out = outcomes();
        degrade_rule_outcomes("dsh", &mut out);
        for (_, outcome) in &out {
            assert!(matches!(outcome, RuleOutcome::MeasuredZero));
        }
    }

    #[test]
    fn override_never_swallows_findings_or_existing_unavailable() {
        let mut out = vec![
            ("SV607", RuleOutcome::Findings(vec![serde_json::json!({"rule": "SV607"})])),
            ("SV608", RuleOutcome::Unavailable {
                missing: vec![Signal::ToolResults],
                reason: "gate: no evidence".to_string(),
            }),
            ("SV604", RuleOutcome::MeasuredZero),
        ];
        degrade_rule_outcomes("claude-code", &mut out);
        // SV607 的 Findings 保持原样；SV608 已 Unavailable 保持原样（reason 不动）；
        // SV604 不是 claude-code 的 degrade 范围。
        assert!(matches!(out[0].1, RuleOutcome::Findings(_)));
        let (missing, reason) = unavailable_of(&out[1].1).unwrap();
        assert_eq!(reason, "gate: no evidence", "已有 Unavailable 不得被覆盖");
        assert_eq!(missing, &[Signal::ToolResults]);
        assert!(matches!(out[2].1, RuleOutcome::MeasuredZero));
    }
}
