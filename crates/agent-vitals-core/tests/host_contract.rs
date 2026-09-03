//! v0.6 host-contract spec §8：完整性守卫 G2/G3/G4/G8/G10 的 Rust 侧对应
//! （G1 已在 `host_capability.rs`/`main.rs::Cmd::Hosts` 的单测 + `test_cli_
//! matrix.py::test_hosts_json_byte_parity` 落地）。
//!
//! G5（§13 矩阵对账）/G6（合成会话不变量）本轮**只在 Python 侧**
//! `tests/test_host_contract.py` 落地——两语言的 `HOSTS` 行由 G1 byte-parity
//! 锁死相等，矩阵对账再抄一份到 Rust 只是把同一个断言跑两遍、不是独立
//! oracle，价值有限；G7（展示层派生）/G9（`HostRuntimeRegistration`）两语言
//! 都未落地，理由见 Python 侧 `KnownGapRegistrationTests`。

use agent_vitals_core::evidence::RuleOutcome;
use agent_vitals_core::host_capability::{degrade_rule_outcomes, HOSTS};

const RUNTIME_HOST_IDS: [&str; 4] = ["dsh", "codex", "claude-code", "workbuddy"];

// ────────────────────────── G2：三集合分离 ──────────────────────────

#[test]
fn g2_hosts_row_ids_equal_runtime_host_ids_exactly() {
    let mut ids: Vec<&str> = HOSTS.iter().map(|h| h.id).collect();
    ids.sort_unstable();
    let mut expected = RUNTIME_HOST_IDS;
    expected.sort_unstable();
    assert_eq!(ids, expected);
}

#[test]
fn g2_pseudo_choice_all_never_enters_the_registry() {
    assert!(HOSTS.iter().all(|h| h.id != "all"), "'all' 是跨宿主聚合伪值，绝不进 HostProfile 行");
}

#[test]
fn g2_scan_cli_host_choices_literal_agrees_across_three_locations() {
    // 与 Python `tests/test_host_contract.py::G2ThreeSetSeparationTests` 的
    // 源码自扫描同一份基准字面量——三处（不是 spec 原文声称的四处：cli.py
    // 现在只有一处全局 `--host`，本轮未处理的 P2，见 Python 侧同名测试注释）
    // 必须逐字相同。
    const LITERAL: &str =
        r#""all", "claude-code", "codex", "openclaw", "hermes", "workbuddy", "dsh""#;
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    for rel in [
        "scripts/agent_vitals/cli.py",
        "src/main.rs",
        "tests/test_cli_matrix.py",
    ] {
        let path = root.join(rel);
        let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{path:?}: {e}"));
        assert!(text.contains(LITERAL), "{path:?} 的 host 清单与基准字面量不一致");
    }
}

// ────────────────────────── G3：语言支持矩阵 ──────────────────────────

#[test]
fn g3_every_runtime_host_has_both_language_evidence_modules() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let matrix: [(&str, &str, &str); 4] = [
        ("dsh", "dsh_evidence.rs", "dsh_evidence.py"),
        ("codex", "codex_evidence.rs", "codex_evidence.py"),
        ("claude-code", "claude_code_evidence.rs", "claude_evidence.py"),
        ("workbuddy", "workbuddy_evidence.rs", "workbuddy_evidence.py"),
    ];
    for (host, rust_name, py_name) in matrix {
        let rust_path = root.join("crates/agent-vitals-core/src").join(rust_name);
        let py_path = root.join("scripts/agent_vitals/agent").join(py_name);
        assert!(rust_path.is_file(), "{host}: 缺 {rust_path:?}");
        assert!(py_path.is_file(), "{host}: 缺 {py_path:?}");
    }
}

// ────────────────────────── G4：降级穷举（行驱动） ──────────────────────────

fn make_outcome(status: &str) -> RuleOutcome {
    match status {
        "measured_zero" => RuleOutcome::MeasuredZero,
        "findings" => RuleOutcome::Findings(vec![serde_json::json!({"rule": "X"})]),
        "unavailable" => RuleOutcome::Unavailable {
            missing: vec![],
            reason: "gate: no evidence".to_string(),
        },
        other => panic!("unknown status {other}"),
    }
}

#[test]
fn g4_degrade_only_flips_measured_zero_for_declared_codes() {
    for host in HOSTS {
        if host.degraded_rules.is_empty() {
            continue;
        }
        for status in ["measured_zero", "findings", "unavailable"] {
            let mut outcomes: Vec<(&'static str, RuleOutcome)> = host
                .degraded_rules
                .iter()
                .map(|r| (r.code, make_outcome(status)))
                .collect();
            outcomes.push(("SV999", RuleOutcome::MeasuredZero));
            degrade_rule_outcomes(host.id, &mut outcomes);
            for (code, outcome) in &outcomes {
                if *code == "SV999" {
                    assert!(matches!(outcome, RuleOutcome::MeasuredZero),
                        "{}: 不在 degraded_rules 里的码不该受影响", host.id);
                    continue;
                }
                if status == "measured_zero" {
                    assert!(matches!(outcome, RuleOutcome::Unavailable { .. }),
                        "{}/{code}: measured_zero 必须被翻转", host.id);
                } else {
                    let matches_status = matches!(
                        (status, outcome),
                        ("findings", RuleOutcome::Findings(_))
                            | ("unavailable", RuleOutcome::Unavailable { .. })
                    );
                    assert!(matches_status, "{}/{code}: {status} 态不得被覆盖", host.id);
                }
            }
        }
    }
}

// ────────────────────────── G8：源码自扫描 ──────────────────────────

#[test]
fn g8_claude_code_and_codex_derive_unavailable_from_host_profile() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    for name in ["claude_code_evidence.rs", "codex_evidence.rs"] {
        let path = root.join("crates/agent-vitals-core/src").join(name);
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("host_capability::host_profile("),
            "{name} 的 is_unavailable 应该查 host_capability::HOSTS");
        assert!(!text.contains("fn is_unavailable(signal: Signal) -> bool {\n    matches!"),
            "{name} 的 is_unavailable 疑似退回了 matches! 字面量表");
    }
}

#[test]
fn g8_dsh_derives_unavailable_from_host_profile() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let path = root.join("crates/agent-vitals-core/src/dsh_evidence.rs");
    let text = std::fs::read_to_string(&path).unwrap();
    assert!(text.contains(r#"host_capability::host_profile("dsh")"#),
        "dsh_evidence.rs 的五个 unmeasured 信号置零应查 HOSTS 行");
}

// ────────────────────────── G10：计价分辨率 ──────────────────────────

fn mechanically_find_time_varying_cards(pricing: &serde_json::Value) -> Vec<(String, String)> {
    let mut found = Vec::new();
    if let Some(providers) = pricing.get("providers").and_then(|v| v.as_object()) {
        for (provider, pv) in providers {
            if let Some(models) = pv.get("models").and_then(|v| v.as_object()) {
                for (model, card) in models {
                    if let Some(v) = card.get("input_uncached") {
                        if v.get("off_peak").is_some() && v.get("peak").is_some() {
                            found.push((provider.clone(), model.clone()));
                        }
                    }
                }
            }
        }
    }
    found.sort();
    found
}

#[test]
fn g10_time_varying_card_set_matches_registry() {
    let pricing = agent_vitals_core::cost::load_pricing();
    let found = mechanically_find_time_varying_cards(&pricing);
    let expected = vec![
        ("deepseek-official".to_string(), "deepseek-v4-flash".to_string()),
        ("deepseek-official".to_string(), "deepseek-v4-pro".to_string()),
        ("shengsuanyun".to_string(), "deepseek-v4-pro".to_string()),
    ];
    assert_eq!(found, expected);
}

#[test]
fn g10_price_claude_map_has_exactly_the_three_registered_callers() {
    // 廉价哨兵（G8 风格）：v0.6.x 热修后 `flat_rate` 已收窄为只服务真正平费率
    // 字段，不再有 off_peak 兜底可"悄悄接上"；这条哨兵现在盯的是`price_claude_map`
    // 的调用面本身——调用点数变了说明有新计价入口出现，需要确认它是否传对了
    // `peak_resolved`（时变卡缺分辨率时必须诚实降级成 `"partial"`，不能悄悄
    // 冒充 `"catalog"`）。三个已登记入口：`claude_day_cost`/`claude_session_cost`
    // （`price_claude_map` doc 注释自钉「两面的钱必须同源」）+ v0.7 spec §3 新增的
    // `claude_subscription_uncovered_estimate`（`peak_resolved=true`，复用
    // ledger 的峰谷分辨率，不是又一个下界兜底）。
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let text = std::fs::read_to_string(root.join("crates/agent-vitals-core/src/cost.rs")).unwrap();
    let occurrences = text.matches("price_claude_map(").count();
    // 1 处定义签名 + 三个已登记入口各调用 1 次。
    assert_eq!(occurrences, 4,
        "price_claude_map 的调用点数量变化——检查新计价入口传的 peak_resolved \
         是否诚实，需要同步这份登记");
}

// 缺口登记（v0.6.x 前置热修，2026-09-03 结清）：`claude_day_cost`/
// `claude_session_cost` 曾共用 `price_claude_map` → `price_claude_model` →
// `flat_rate` 的 off_peak 兜底，登记为 "pending v0.7"（后改记 v0.6.x）；
// 两者已同批切换到峰谷读法（`claude_day_cost` 用 `peak_resolved=true`，
// ledger 日桶的 `peak_*` 子桶来自 `tail_days` 逐行真实 ts；`claude_session_cost`
// 结构性没有逐行 ts，`peak_resolved=false`，如实报 `pricing_basis="partial"`
// 而不是悄悄用下界冒充精确）。缺口清单闭集为空，见下面两个测试的新断言
// （v0.6 spec §8 G10 / §12 DoD 2/9："三张时变卡在任何计价入口都不走下界读法"
// 现在无条件成立，不再需要缺口登记）。

#[test]
fn g10_claude_day_cost_prices_peak_tokens_at_peak_rate_not_off_peak_floor() {
    // 硬断言（v0.6 spec §8 G10 / §12 DoD 2/9，v0.6.x 热修落地后从"验证仍卡在
    // 下界"翻转成"验证已经峰谷正确"）：`claude_day_cost` 的 ledger 日桶现在
    // 带 `peak_*` 子桶（来自 `claude_cost.rs::tail_days` 逐行真实 ts），全落
    // 在高峰时段的用量必须按 peak 单价算，不是 off_peak 下界——否则
    // `flat_rate` 的下界兜底又静默接管了这张时变卡。
    let pricing = agent_vitals_core::cost::load_pricing();
    let card = &pricing["providers"]["deepseek-official"]["models"]["deepseek-v4-flash"];
    let off_peak_rate = card["input_uncached"]["off_peak"].as_f64().unwrap();
    let peak_rate = card["input_uncached"]["peak"].as_f64().unwrap();
    assert_ne!(off_peak_rate, peak_rate, "测试卡必须真的时变，否则本断言无意义");

    // 全落峰值：base 与 peak_ 子桶相等——1M input 全部在高峰时段发生。
    let day = serde_json::json!({"deepseek-v4-flash": {
        "input_tokens": 1_000_000, "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": 0, "output_tokens": 0,
        "peak_input_tokens": 1_000_000, "peak_cache_read_input_tokens": 0,
        "peak_cache_creation_input_tokens": 0, "peak_output_tokens": 0,
    }});
    let report = agent_vitals_core::cost::claude_day_cost(&day, &pricing).unwrap();
    let day_total = report["per_model"]["deepseek-v4-flash"]["total"].as_f64().unwrap();
    assert!((day_total - peak_rate).abs() < 1e-9,
        "claude_day_cost 全高峰用量必须按 peak 单价算");
    assert!((day_total - off_peak_rate).abs() > 1e-9);
    assert_eq!(report["pricing_basis"], "catalog", "有峰谷分辨率时是精确值，不再是估算");

    // 全落空闲：peak_* 子桶全 0——必须精确算成 off_peak（不是"没分辨率的
    // 下界"，是"真的测到全部落在空闲时段"，两者数值恰好相同、语义不同，
    // pricing_basis 必须仍是 catalog）。
    let day_off = serde_json::json!({"deepseek-v4-flash": {
        "input_tokens": 1_000_000, "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": 0, "output_tokens": 0,
    }});
    let report_off = agent_vitals_core::cost::claude_day_cost(&day_off, &pricing).unwrap();
    let off_total = report_off["per_model"]["deepseek-v4-flash"]["total"].as_f64().unwrap();
    assert!((off_total - off_peak_rate).abs() < 1e-9);
    assert_eq!(report_off["pricing_basis"], "catalog");
}

#[test]
fn g10_claude_session_cost_honestly_reports_partial_for_time_varying_cards() {
    // `claude_session_cost` 结构性没有逐行 ts（cost-state 是会话累计自报，
    // 不是逐请求流水）——时变卡这里永远给不出真峰谷分辨率，v0.6.x 热修后
    // 如实报 `pricing_basis="partial"`（不是悄悄按 off_peak 冒充 "catalog"
    // 精确值；数值仍是 off_peak 下界，因为那是唯一"没有更多信息时"站得住
    // 的算法，但标注必须诚实）。
    let pricing = agent_vitals_core::cost::load_pricing();
    let card = &pricing["providers"]["deepseek-official"]["models"]["deepseek-v4-flash"];
    let off_peak_rate = card["input_uncached"]["off_peak"].as_f64().unwrap();
    let session = serde_json::json!({"deepseek-v4-flash": {
        "inputTokens": 1_000_000, "cacheReadInputTokens": 0,
        "cacheCreationInputTokens": 0, "outputTokens": 0,
    }});
    let report = agent_vitals_core::cost::claude_session_cost(&session, &pricing).unwrap();
    let session_total = report["per_model"]["deepseek-v4-flash"]["total"].as_f64().unwrap();
    assert!((session_total - off_peak_rate).abs() < 1e-9);
    assert_eq!(report["per_model"]["deepseek-v4-flash"]["pricing_basis"], "partial");
    assert_eq!(report["pricing_basis"], "partial");
}

#[test]
fn g10_dsh_ledger_bucket_pricer_already_does_peak_split() {
    // 正对照：DSH 日桶计价（`cost::bucket_price`，经公开入口 `cost_report`
    // 触达）已经是全仓验证过的峰谷读法——喂一份全落在高峰的用量，价格必须
    // 按 peak 单价算，不是 off_peak。
    let pricing = agent_vitals_core::cost::load_pricing();
    let card = &pricing["providers"]["deepseek-official"]["models"]["deepseek-v4-flash"];
    let peak_rate = card["input_uncached"]["peak"].as_f64().unwrap();
    let off_peak_rate = card["input_uncached"]["off_peak"].as_f64().unwrap();

    let usage = serde_json::json!({
        "by_model": {"deepseek-v4-flash": {
            "uncached_input_tokens": 1_000_000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 1_000_000, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
        }},
        "providers": {"deepseek-v4-flash": "deepseek-official"},
    });
    let report = agent_vitals_core::cost::cost_report(&usage, &pricing).unwrap();
    let total = report["total"].as_f64().unwrap();
    assert!((total - peak_rate).abs() < 1e-9);
    assert!((total - off_peak_rate).abs() > 1e-9);
}
