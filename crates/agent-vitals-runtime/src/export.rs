//! Stage C（spec §6）：脱敏导出的**双写路径**。
//!
//! spec §6 明令：「私有 trace 与脱敏 export 必须是不同写路径，不能由一个
//! `redacted: bool` 决定」——因为 bool 参数的调用点迟早被传错，而两个独立
//! 函数各自把「自己写什么」写在实现里，审一个函数就知道一条路径的隐私面。
//!
//! - [`export_private`]：逐字节复制权威 JSONL（含 machine_namespace、
//!   native_session_id、cwd 派生的 source_profile）——私有 trace 的完整面。
//! - [`export_redacted`]：重放 → **重导身份**（namespace/会话/路径/
//!   **原生事件 id** 四个可辨识字段规范化为稳定伪名，fnv1a64 保证同输入
//!   同伪名、不可反推）→
//!   经 `build_usage_fact` 重算 fact_id（身份字段变了，fact_id 必须跟着
//!   契约层重 stamp——导出件的一致性由契约层背书，不是手改字符串）。
//!
//! 两条路径写各自的输出目录，绝不共用中间产物。

use std::path::Path;

use agent_vitals_domain::source_identity::fnv1a64_hex;

/// 私有导出：权威 JSONL 的逐字节复制（含全部身份字段）。
///
/// 拿 ingest 锁（审计 #3）：与 reconcile 同一条「读权威前拿锁」纪律——
/// 并发 ingest 的尾面修复/追加进行中时，无锁导出会拿到非原子截面（两个
/// 导出件互不一致）。
pub fn export_private(data_home: &Path, out_dir: &Path) -> Result<usize, String> {
    let _lease = crate::lease::acquire_blocking(
        &data_home.join("facts").join(".ingest.lock"),
        "facts-export",
        60_000,
        5_000,
    )
    .map_err(|e| format!("facts export lease: {e}"))?;
    let facts_dir = data_home.join("facts");
    std::fs::create_dir_all(out_dir).map_err(|e| format!("{}: {e}", out_dir.display()))?;
    let mut files = 0usize;
    for host in crate::ingest_service::FACT_HOSTS {
        let src = facts_dir.join(format!("{host}.jsonl"));
        if !src.exists() {
            continue;
        }
        let bytes = std::fs::read(&src).map_err(|e| format!("{}: {e}", src.display()))?;
        let dst = out_dir.join(format!("{host}.jsonl"));
        std::fs::write(&dst, &bytes).map_err(|e| format!("{}: {e}", dst.display()))?;
        files += 1;
    }
    Ok(files)
}

/// 稳定伪名：同输入同输出、不可反推（fnv1a64 的安全用途边界——它不是密码
/// 学哈希，这里的威胁模型是「导出件接收方不该直接读到原始标识符」，不是
/// 「对抗蓄意逆向」；威胁更高时该整段不导出）。
fn pseudonym(prefix: &str, raw: &str) -> String {
    format!("{}-{}", prefix, &fnv1a64_hex(raw.as_bytes())[..12])
}

/// 脱敏导出：重放 → 重导身份 → 契约层重 stamp fact_id → 写出。同
/// [`export_private`] 拿 ingest 锁（审计 #3）——两条导出路径对同一截面。
pub fn export_redacted(data_home: &Path, out_dir: &Path) -> Result<(usize, usize), String> {
    let _lease = crate::lease::acquire_blocking(
        &data_home.join("facts").join(".ingest.lock"),
        "facts-export",
        60_000,
        5_000,
    )
    .map_err(|e| format!("facts export lease: {e}"))?;
    let facts_dir = data_home.join("facts");
    std::fs::create_dir_all(out_dir).map_err(|e| format!("{}: {e}", out_dir.display()))?;
    let mut files = 0usize;
    let mut total = 0usize;
    for host in crate::ingest_service::FACT_HOSTS {
        let src = facts_dir.join(format!("{host}.jsonl"));
        if !src.exists() {
            continue;
        }
        let rep = agent_vitals_data::evidence::replay(&src)
            .map_err(|e| format!("{}: {e}", src.display()))?;
        let mut lines = Vec::with_capacity(rep.facts.len());
        for fact in &rep.facts {
            // 四个可辨识字段规范化；其余字段（token 桶、模型、provider、ts）
            // 原样保留——脱敏导出的分析价值在这些字段上。
            let mut fields = fact
                .as_object()
                .cloned()
                .ok_or_else(|| format!("{}: fact is not an object", src.display()))?;
            if let Some(ns) = fields.get("machine_namespace").and_then(|v| v.as_str()) {
                fields.insert(
                    "machine_namespace".to_string(),
                    serde_json::json!(pseudonym("ns", ns)),
                );
            }
            if let Some(sid) = fields.get("native_session_id").and_then(|v| v.as_str()) {
                fields.insert(
                    "native_session_id".to_string(),
                    serde_json::json!(pseudonym("sess", sid)),
                );
            }
            if let Some(sp) = fields.get("source_profile").and_then(|v| v.as_str()) {
                if !sp.is_empty() {
                    fields.insert(
                        "source_profile".to_string(),
                        serde_json::json!(pseudonym("profile", sp)),
                    );
                }
            }
            // **审查 P1**：source_event_id 是第 4 个身份字段（IDENTITY_
            // INPUT_FIELDS 六元组之一）——claude 侧是原生 message.uuid，
            // 全局稳定的跨界唯一标识符，明文出导出件就是身份泄漏。
            if let Some(evt) = fields.get("source_event_id").and_then(|v| v.as_str()) {
                fields.insert(
                    "source_event_id".to_string(),
                    serde_json::json!(pseudonym("evt", evt)),
                );
            }
            // **白名单维护纪律**：以上四个是手工枚举的「可辨识字段」。未来
            // 某 emitter 开始填 `session_key_ref`/`provider_request_id`/
            // `account_ref` 等（当前无生产者），就是新的泄漏面——增字段时
            // 必须对照 USAGE_FACT_FIELDS 重审本函数。
            // 身份字段已变 → fact_id 必须经契约层重算（契约层会覆盖外部传入
            // 的 fact_id——这正是「身份不接受外部声称」的设计在导出侧的复用）。
            let rebuilt = agent_vitals_domain::contracts::usage_fact::build_usage_fact(&fields)
                .map_err(|p| format!("{}: {p:?}", src.display()))?;
            lines.push(rebuilt.to_string());
        }
        let dst = out_dir.join(format!("{host}.jsonl"));
        std::fs::write(&dst, lines.join("\n") + if lines.is_empty() { "" } else { "\n" })
            .map_err(|e| format!("{}: {e}", dst.display()))?;
        files += 1;
        total += lines.len();
    }
    Ok((files, total))
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_vitals_domain::contracts::usage_fact::build_usage_fact;
    use serde_json::json;

    fn tmp(tag: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "avd-export-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn seed(home: &Path) {
        let mut f = serde_json::Map::new();
        f.insert("machine_namespace".into(), json!("my-secret-ns"));
        f.insert("host".into(), json!("codex"));
        f.insert("source_profile".into(), json!("--Users-admin-project--"));
        f.insert("native_session_id".into(), json!("sess-abcdef"));
        // 真实形状：claude 侧是原生 message.uuid（审查 P1——良性字面量
        // 抓不住泄漏）。
        f.insert(
            "source_event_id".into(),
            json!("msg_01abc2def3ghi4jkl5mno6pqr7stu8vwx9yz0"),
        );
        f.insert("observation_kind".into(), json!("token_count"));
        f.insert("uncached_input_tokens".into(), json!(100));
        let fact = build_usage_fact(&f).unwrap();
        crate::ingest_service::ingest_facts(home, &[fact]).unwrap();
    }

    #[test]
    fn private_export_is_verbatim_redacted_is_pseudonymized() {
        let home = tmp("both");
        let out_priv = home.join("out-private");
        let out_red = home.join("out-redacted");
        seed(&home);

        // 私有路径：逐字节原样（身份可读）。
        assert_eq!(export_private(&home, &out_priv).unwrap(), 1);
        let priv_text = std::fs::read_to_string(out_priv.join("codex.jsonl")).unwrap();
        assert!(priv_text.contains("my-secret-ns"));
        assert!(priv_text.contains("Users-admin-project"));

        // 脱敏路径：身份字段全部伪名化，度量字段原样。
        let (files, total) = export_redacted(&home, &out_red).unwrap();
        assert_eq!((files, total), (1, 1));
        let red_text = std::fs::read_to_string(out_red.join("codex.jsonl")).unwrap();
        assert!(!red_text.contains("my-secret-ns"), "{red_text}");
        assert!(!red_text.contains("Users-admin-project"), "{red_text}");
        assert!(!red_text.contains("sess-abcdef"), "{red_text}");
        assert!(
            !red_text.contains("msg_01abc2def3"),
            "source_event_id 必须伪名化（审查 P1），{red_text}"
        );
        assert!(red_text.contains("\"uncached_input_tokens\":100"), "{red_text}");
        // fact_id 已按重导身份重 stamp（与原文不同），但格式仍是 uf1-。
        assert!(red_text.contains("\"fact_id\":\"uf1-"), "{red_text}");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn redaction_is_stable_across_runs() {
        let home = tmp("stable");
        seed(&home);
        let out1 = home.join("r1");
        let out2 = home.join("r2");
        export_redacted(&home, &out1).unwrap();
        export_redacted(&home, &out2).unwrap();
        assert_eq!(
            std::fs::read_to_string(out1.join("codex.jsonl")).unwrap(),
            std::fs::read_to_string(out2.join("codex.jsonl")).unwrap(),
            "同输入同伪名（fnv1a64 稳定性）——重跑导出件可互相对账"
        );
        let _ = std::fs::remove_dir_all(&home);
    }
}
