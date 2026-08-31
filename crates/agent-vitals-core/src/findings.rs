//! 跨会话 findings 的**纯汇总**（workbench「Findings」页 + `sessions findings`）。
//!
//! 计算在宿主、前端只渲染投影（CLAUDE.md）：本模块只吃内存里的
//! [`FindingSession`] 列表，做 rule 级聚合与严重度排序，不碰 I/O。I/O 全在 binary
//! （`src/agent/r2a_store.rs`）：「哪个字段带 findings」的唯一权威谓词
//! （`findings_for`，DSH `session.findings` / Codex `session.audit.findings`）与
//! `generated_at` / `pricing_version` 取时都留在 binary——与 `list_sessions` /
//! `build_envelope` 同款分工（core 不读时钟、不读价表）。
//!
//! **Rust-only，不镜像 Python**：python 逐步弱化（`docs/TAURI_RUNTIME_WORKBENCH_SPEC.md`
//! §7.1），新纯规则只进 core；差分 gate 只覆盖双方都存在的规则，本模块无 Python 半边。
//!
//! 排序语义（确定性，供前端直接渲染）：
//!   · rules：severity rank（critical > warning > info > other）→ hits 降序 → rule 升序；
//!   · findings 明细：severity rank 降序（最危险在前）→ seq 降序 → time 降序。
//!     既有 findings 的 `seq` 一定存在（行为规则逐条编号）；`time` 在 Codex 线格式里
//!     多为 null，以 0 参与排序、序列化时诚实输出 null。

use std::collections::{BTreeMap, BTreeSet};

use serde_json::{Value, json};

use crate::r2a::{CURRENT_CONTRACT_VERSION, ENGINE_VERSION, SessionKey};

/// severity 排序 rank：critical=0 > warning=1 > info=2 > 其他=3。
/// 未知严重度不炸、排最后（防御脏数据，规则排序与明细排序共用这一份）。
fn severity_rank(s: &str) -> u8 {
    match s {
        "critical" => 0,
        "warning" => 1,
        "info" => 2,
        _ => 3,
    }
}

/// 单条 finding 的最小投影（明细行需要的字段子集）。`tool_name`/`evidence`/`time`/
/// `seq` 都可能诚实缺失（Codex 线格式 time/turn 多为 null）→ Option。
#[derive(Debug, Clone)]
pub struct FindingRef {
    pub rule: String,
    pub severity: String,
    pub category: String,
    pub tool_name: Option<String>,
    pub evidence: Option<String>,
    pub time: Option<i64>,
    pub seq: Option<u64>,
}

/// 一个会话对 rollup 的输入：key（host_kind + 身份）+ 派生列（title/model 可 null，
/// DSH 标题仅 17/59 有，诚实缺失）+ 该会话的 findings 数组。
#[derive(Debug)]
pub struct FindingSession<'a> {
    pub key: &'a SessionKey,
    pub title: Option<&'a str>,
    pub model: Option<&'a str>,
    pub store_revision: u64,
    pub findings: &'a [FindingRef],
}

/// 规则级聚合行：`severity` = 该规则**最危险**那条的严重度（实践中一个规则一个
/// 严重度，max 是防御）；`hits` = 命中总数；`sessions` = 去重会话数。
#[derive(Debug)]
pub struct RuleRow {
    pub rule: String,
    pub severity: String,
    pub category: String,
    pub hits: usize,
    pub sessions: usize,
}

/// 跨会话 rollup（`sessions findings --json` 的纯数据面；DTO 头部由
/// [`FindingsRollup::to_json`] 组装，`pricing_version`/`generated_at` 由 I/O 层传入）。
#[derive(Debug)]
pub struct FindingsRollup {
    pub total: usize,
    pub critical: usize,
    pub warning: usize,
    pub info: usize,
    pub other: usize,
    pub sessions_with: usize,
    pub sessions_total: usize,
    pub store_revision: u64,
    pub rules: Vec<RuleRow>,
    pub findings: Vec<Value>,
}

/// 聚合入口：纯函数，输入即全部事实，输出与输入一一对应。空语料 → 全零 totals +
/// 空 rules/findings（诚实空，不是错误——源不可用由 binary 的
/// `source-unavailable` 错误码表达，跟这是两回事）。
pub fn rollup_findings(sessions: &[FindingSession]) -> FindingsRollup {
    let mut total = 0usize;
    let mut critical = 0usize;
    let mut warning = 0usize;
    let mut info = 0usize;
    let mut other = 0usize;
    let mut sessions_with = 0usize;
    let mut store_rev = 0u64;
    // rule -> (worst severity string, category, hits, distinct ledger_key set)。
    // BTreeSet 保证「去重会话数」确定性；BTreeMap 保证规则输出确定性。
    let mut by_rule: BTreeMap<String, (String, String, usize, BTreeSet<String>)> =
        BTreeMap::new();
    let mut detail: Vec<Value> = Vec::new();

    for s in sessions {
        store_rev = store_rev.max(s.store_revision);
        if !s.findings.is_empty() {
            sessions_with += 1;
        }
        for f in s.findings {
            total += 1;
            match severity_rank(&f.severity) {
                0 => critical += 1,
                1 => warning += 1,
                2 => info += 1,
                _ => other += 1,
            }
            let e = by_rule
                .entry(f.rule.clone())
                .or_insert_with(|| {
                    (f.severity.clone(), f.category.clone(), 0, BTreeSet::new())
                });
            // 规则严重度 = max（rank 最小那条）；新条目首插即自带最坏，后续比 rank。
            if severity_rank(&f.severity) < severity_rank(&e.0) {
                e.0 = f.severity.clone();
            }
            e.2 += 1;
            e.3.insert(s.key.ledger_key());
            detail.push(json!({
                "host_kind": s.key.host_kind,
                "title": s.title,
                "model": s.model,
                "session_key": s.key.to_json(),
                "rule": f.rule,
                "severity": f.severity,
                "category": f.category,
                "tool_name": f.tool_name,
                "evidence": f.evidence,
                "time": f.time,
                "seq": f.seq,
            }));
        }
    }

    let mut rules: Vec<RuleRow> = by_rule
        .into_iter()
        .map(|(rule, (severity, category, hits, sessions))| RuleRow {
            rule,
            severity,
            category,
            hits,
            sessions: sessions.len(),
        })
        .collect();
    rules.sort_by(|a, b| {
        severity_rank(&a.severity)
            .cmp(&severity_rank(&b.severity))
            .then(b.hits.cmp(&a.hits))
            .then(a.rule.cmp(&b.rule))
    });
    detail.sort_by(|a, b| {
        let sev = |v: &Value| severity_rank(v.get("severity").and_then(Value::as_str).unwrap_or(""));
        sev(a)
            .cmp(&sev(b))
            .then(b["seq"].as_u64().unwrap_or(0).cmp(&a["seq"].as_u64().unwrap_or(0)))
            .then(b["time"].as_i64().unwrap_or(0).cmp(&a["time"].as_i64().unwrap_or(0)))
    });

    FindingsRollup {
        total,
        critical,
        warning,
        info,
        other,
        sessions_with,
        sessions_total: sessions.len(),
        store_revision: store_rev,
        rules,
        findings: detail,
    }
}

impl FindingsRollup {
    /// DTO 形状（键序是字节一致的一部分，与 list DTO 同款头部）：
    /// schema_version → engine_version → pricing_version → store_revision →
    /// generated_at → totals → rules → findings。`pricing_version`/`generated_at`
    /// 由 I/O 层从价表/时钟取（core 不读），与 `build_envelope` 同款传参。
    pub fn to_json(&self, pricing_version: &str, generated_at: &str) -> Value {
        json!({
            "schema_version": CURRENT_CONTRACT_VERSION.to_string(),
            "engine_version": ENGINE_VERSION,
            "pricing_version": pricing_version,
            "store_revision": self.store_revision,
            "generated_at": generated_at,
            "totals": {
                "findings": self.total,
                "critical": self.critical,
                "warning": self.warning,
                "info": self.info,
                "other": self.other,
                "sessions": self.sessions_with,
                "sessions_total": self.sessions_total,
            },
            "rules": self.rules.iter().map(|r| json!({
                "rule": r.rule,
                "severity": r.severity,
                "category": r.category,
                "hits": r.hits,
                "sessions": r.sessions,
            })).collect::<Vec<_>>(),
            "findings": self.findings,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::r2a::SessionKey;

    fn key(host: &str, id: &str) -> SessionKey {
        SessionKey::new(host, id, "profile", "machine")
    }

    fn finding(rule: &str, sev: &str, seq: u64) -> FindingRef {
        FindingRef {
            rule: rule.to_string(),
            severity: sev.to_string(),
            category: "cat".to_string(),
            tool_name: None,
            evidence: None,
            time: None,
            seq: Some(seq),
        }
    }

    /// 混合 DSH+Codex：totals 汇总正确；同一规则跨会话 → hits 合计 + sessions 去重；
    /// store_revision 取 max。这是「聚合不是计数副本」的正面钉死——hits 是跨会话
    /// 相加，sessions 是去重。
    #[test]
    fn rollup_mixes_sources_and_aggregates_rules() {
        let dsh = SessionKey::new("dsh", "d1", "p", "m");
        let codex = SessionKey::new("codex", "c1", "p", "m");
        let dsh_f = vec![
            finding("SV601", "critical", 10),
            finding("SV601", "critical", 11),
            finding("SV610", "warning", 12),
        ];
        let codex_f = vec![
            finding("SV601", "critical", 20),
            finding("SV610", "warning", 21),
        ];
        let sessions = vec![
            FindingSession {
                key: &dsh,
                title: Some("t-dsh"),
                model: Some("m1"),
                store_revision: 1,
                findings: &dsh_f,
            },
            FindingSession {
                key: &codex,
                title: None,
                model: None,
                store_revision: 7,
                findings: &codex_f,
            },
        ];
        let r = rollup_findings(&sessions);
        assert_eq!(r.total, 5);
        assert_eq!(r.critical, 3);
        assert_eq!(r.warning, 2);
        assert_eq!(r.info, 0);
        assert_eq!(r.other, 0);
        assert_eq!(r.sessions_with, 2);
        assert_eq!(r.sessions_total, 2);
        assert_eq!(r.store_revision, 7);

        // 规则按 severity rank 再 hits 降序
        assert_eq!(r.rules.len(), 2);
        assert_eq!(r.rules[0].rule, "SV601"); // critical 在前
        assert_eq!(r.rules[0].hits, 3);
        assert_eq!(r.rules[0].sessions, 2); // 跨两源去重
        assert_eq!(r.rules[1].rule, "SV610");
        assert_eq!(r.rules[1].hits, 2);
        assert_eq!(r.rules[1].sessions, 2);

        // 明细按 severity rank 降序 → seq 降序
        assert_eq!(r.findings.len(), 5);
        assert!(r.findings[..3].iter().all(|v| v["severity"] == "critical"));
        assert_eq!(r.findings[0]["seq"], 20);
        assert_eq!(r.findings[1]["seq"], 11);
        assert_eq!(r.findings[2]["seq"], 10);
        // 明细行带会话上下文（标题 null 诚实输出）
        assert_eq!(r.findings[0]["title"], Value::Null);
        assert_eq!(r.findings[0]["host_kind"], "codex");
    }

    /// severity rank 钉死：critical 恒在 warning/info 前；未知严重度排最后但不炸。
    #[test]
    fn severity_rank_ordering_is_pinned() {
        assert_eq!(severity_rank("critical"), 0);
        assert_eq!(severity_rank("warning"), 1);
        assert_eq!(severity_rank("info"), 2);
        assert_eq!(severity_rank("bogus"), 3);
        assert!(severity_rank("critical") < severity_rank("warning"));
        assert!(severity_rank("warning") < severity_rank("info"));
        assert!(severity_rank("info") < severity_rank("bogus"));
    }

    /// 未知严重度计入 `other`，critical+warning+info+other == total（对账不丢数）。
    #[test]
    fn unknown_severity_lands_in_other_and_reconciles() {
        let k = key("dsh", "d1");
        let f = vec![
            finding("SV601", "critical", 1),
            finding("SV999", "mystery", 2),
            finding("SV610", "info", 3),
        ];
        let r = rollup_findings(&[FindingSession {
            key: &k,
            title: None,
            model: None,
            store_revision: 0,
            findings: &f,
        }]);
        assert_eq!(r.total, 3);
        assert_eq!(r.critical, 1);
        assert_eq!(r.info, 1);
        assert_eq!(r.other, 1);
        assert_eq!(r.critical + r.warning + r.info + r.other, r.total);
    }

    /// 空语料 → 全零 totals + 空 rules/findings（诚实空态，不是错误）。
    #[test]
    fn empty_corpus_is_all_zero() {
        let r = rollup_findings(&[]);
        assert_eq!(r.total, 0);
        assert_eq!(r.critical + r.warning + r.info + r.other, 0);
        assert_eq!(r.sessions_with, 0);
        assert_eq!(r.sessions_total, 0);
        assert_eq!(r.rules.len(), 0);
        assert_eq!(r.findings.len(), 0);
        assert_eq!(r.store_revision, 0);
    }

    /// 有会话但全无 findings：sessions_with=0 而 sessions_total=N（「扫了但没命中」
    /// 与「根本没会话」是两个数字，前端不能把它们并成一个）。
    #[test]
    fn scanned_but_no_findings_still_counts_sessions() {
        let k = key("codex", "c1");
        let r = rollup_findings(&[FindingSession {
            key: &k,
            title: None,
            model: None,
            store_revision: 3,
            findings: &[],
        }]);
        assert_eq!(r.sessions_with, 0);
        assert_eq!(r.sessions_total, 1);
        assert_eq!(r.total, 0);
        assert_eq!(r.store_revision, 3);
    }

    /// DTO 形状：键序头部 + totals 四桶 + rules/findings 数组；null 字段诚实序列化。
    #[test]
    fn to_json_shape_and_nullable_fields() {
        let k = key("dsh", "d1");
        let f = vec![finding("SV601", "critical", 1)];
        let r = rollup_findings(&[FindingSession {
            key: &k,
            title: None,
            model: Some("deepseek-v4-flash"),
            store_revision: 9,
            findings: &f,
        }]);
        let v = r.to_json("abc123", "2026-08-31T00:00:00Z");
        assert_eq!(v["schema_version"], "1");
        assert_eq!(v["engine_version"], "1");
        assert_eq!(v["pricing_version"], "abc123");
        assert_eq!(v["generated_at"], "2026-08-31T00:00:00Z");
        assert_eq!(v["store_revision"], 9);
        assert_eq!(v["totals"]["findings"], 1);
        assert_eq!(v["rules"][0]["rule"], "SV601");
        assert_eq!(v["findings"][0]["title"], Value::Null);
        assert_eq!(v["findings"][0]["model"], "deepseek-v4-flash");
        assert_eq!(v["findings"][0]["time"], Value::Null);
        // 键序断言：头部顺序即 JSON 顺序（json! 保插入序）
        let obj = v.as_object().unwrap();
        let keys: Vec<_> = obj.keys().collect();
        assert_eq!(keys, vec![
            "schema_version", "engine_version", "pricing_version",
            "store_revision", "generated_at", "totals", "rules", "findings",
        ]);
    }
}
