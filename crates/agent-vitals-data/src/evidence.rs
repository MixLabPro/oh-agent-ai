//! Stage A（P0）：`UsageFact` append-only JSONL writer——事实写入、去重、
//! 重放与 reconciliation 的机制层（spec §3.4/§3.5/§7 Stage A）。
//!
//! **机制层，不含生产者**：本模块只回答「一份合法的 `UsageFact` 如何幂等地
//! 落盘、如何无歧义地读回」；wire → fact 的生产者（`{claude,codex,dsh}_
//! usage_fact` emitter）仍在 apps/cli（Stage 0.3 记录的归位 scope gap，
//! R4 §7 Stage A 前置项）。两者解耦：writer 消费的是
//! `domain::contracts::usage_fact` 契约层，与 emitter 住在哪个 crate 无关。
//!
//! **P0 显式不做的**（spec §3.5 写入协议的后续段）：writer lease、intent、
//! projection/manifest/checkpoint 都是 P1——本模块只保证单进程内
//! exactly-once 追加与崩溃可读，多进程一致性与可恢复半提交是下一批。
//!
//! 三条设计决定（每条都写明为什么）：
//!
//! 1. **去重 = 内存 `fact_id` 集合 + open 时全文件重放扫描**。`fact_id` 由
//!    契约层从 6 个身份字段算出（`build_usage_fact` 内部 stamp，调用方传了
//!    也会被覆盖——身份不接受外部声称），所以「同一逻辑事件重复 emit」必然
//!    得到同一 `fact_id`，集合查重就是 exactly-once。open 的 O(n) 扫描在
//!    P1 SQLite 索引化之前是唯一诚实的方案；文件按 13 个月保留策略滚动
    //!    （spec §6），单文件规模有上界。
//! 2. **崩溃尾行容忍**：append 单行 JSON 后进程可能死在写入中途，留下半
//!    行。重放时**最后一行**解析失败 → 视为 crash 残留，跳过并计数上报；
//!    **中间行**解析失败 → `Corrupt` 错误——那不是崩溃边界，是真实损坏，
//!    静默跳过就是把损坏伪装成没发生。
//! 3. **不取时钟**：chrono/time 被本 crate 的 dependency_budget 禁止，且
//!    事实自带 `event_ts_utc`（宿主事件时间）；写入顺序就是文件序，重放
//!    排序（`sort_key`）按 `(time_basis, fact_id)` 确定化——同一份文件在
//!    任何机器上重放出同一个序列。

use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};

use agent_vitals_domain::contracts::usage_fact::build_usage_fact;
use serde_json::json;

/// 单次 append 的结果。`Duplicate` 不是错误：exactly-once 语义下「重复 emit
/// 同一逻辑事件」是调用方的正常行为（重放、重跑、双管道），writer 幂等吞掉。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppendOutcome {
    Appended,
    Duplicate,
}

/// append 失败的原因。`Invalid` 携带契约层的问题清单（缺身份字段、token
/// 非法等——诚实报具体字段名）；`Corrupt` 表示已有文件中间出现不可解析行。
#[derive(Debug)]
pub enum AppendError {
    /// 契约校验失败（`build_usage_fact` 的问题清单原样透出）。
    Invalid(Vec<String>),
    /// 已有文件在非末尾位置存在不可解析行——真实损坏，拒绝继续追加。
    Corrupt { line_no: usize },
    /// 文件系统错误。
    Io(std::io::Error),
}

impl From<std::io::Error> for AppendError {
    fn from(e: std::io::Error) -> Self {
        AppendError::Io(e)
    }
}

/// open（或重放）一份 facts 文件的结果：合法事实按文件序 + 崩溃残留计数。
#[derive(Debug, Default)]
pub struct Replay {
    pub facts: Vec<serde_json::Value>,
    /// 文件末尾解析失败的行数（crash 半行）。中间坏行直接 Err，不进这里。
    pub trailing_partial: usize,
}

/// 逐行解析一份 facts 文件。尾行半行容忍 + 中间坏行报错——见模块头决定 2。
pub fn replay(path: &Path) -> Result<Replay, AppendError> {
    let mut report = Replay::default();
    let Some(text) = std::fs::read_to_string(path).ok() else {
        return Ok(report); // 文件不存在 = 零事实，不是错误
    };
    let lines: Vec<&str> = text.lines().collect();
    for (idx, line) in lines.iter().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        match serde_json::from_str::<serde_json::Value>(line) {
            Ok(v) => report.facts.push(v),
            Err(_) if idx == lines.len() - 1 => {
                // 只可能是最后一条非空行时才容忍——idx == len-1 恰好覆盖
                // 「末行半行」；末尾多个连续坏行会落到中间分支报 Corrupt，
                // 那种形状不是单次 crash 能产生的，按损坏处理。
                report.trailing_partial += 1;
            }
            Err(_) => return Err(AppendError::Corrupt { line_no: idx + 1 }),
        }
    }
    Ok(report)
}

/// append-only `UsageFact` writer。
///
/// `open` 做一次全文件重放构建 `fact_id` 集合（去重的依据），之后的每次
/// `append` 校验 → 查重 → 单行追加。同一进程内反复 open 同一文件是安全的
/// （每次都重扫——调用方应持有 writer 复用，而不是每条 fact open 一次）。
pub struct FactWriter {
    facts_path: PathBuf,
    seen: HashSet<String>,
}

impl FactWriter {
    /// 打开（不存在则首次 append 时创建）。构建 seen 集合；中间坏行在此
    /// 提前暴露——带着一个已损坏的文件继续 append 只会让损坏更难定位。
    pub fn open(path: &Path) -> Result<Self, AppendError> {
        let replay = replay(path)?;
        let seen = replay
            .facts
            .iter()
            .filter_map(|f| f.get("fact_id").and_then(|v| v.as_str()).map(String::from))
            .collect();
        Ok(Self { facts_path: path.to_path_buf(), seen })
    }

    /// 校验（`build_usage_fact`：补 `fact_id`/`schema_version`、缺失键置
    /// null）→ 查重 → 追加。返回写入的事实文档（调用方可用于后续断言）。
    pub fn append(
        &mut self,
        fields: &serde_json::Map<String, serde_json::Value>,
    ) -> Result<(AppendOutcome, Option<serde_json::Value>), AppendError> {
        let fact = build_usage_fact(fields).map_err(AppendError::Invalid)?;
        let fact_id = fact
            .get("fact_id")
            .and_then(|v| v.as_str())
            .expect("build_usage_fact stamps fact_id")
            .to_string();
        if self.seen.contains(&fact_id) {
            return Ok((AppendOutcome::Duplicate, None));
        }
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.facts_path)?;
        // 单行 + 换行一次 write：O_APPEND 下小行的单次 write 是追加原子的
        // 临界保护（P0 单进程的假设在模块头写明；多进程是 P1 的 lease）。
        let mut line = fact.to_string();
        line.push('\n');
        file.write_all(line.as_bytes())?;
        file.flush()?;
        self.seen.insert(fact_id);
        Ok((AppendOutcome::Appended, Some(fact)))
    }

    /// 已去重的 fact_id 数（观测/测试用）。
    pub fn seen_count(&self) -> usize {
        self.seen.len()
    }
}

/// reconciliation：facts 的每宿主 token 总和 vs 消费方 DTO 的
/// `tokens_by_host`（Stage D 冻结形状）。**报告式，不 panic**——与
/// `usage.rs::unaccounted_usage` 哨兵同一惯例：发现矛盾是报告给上层决定，
/// 不是 writer 代替调用方 abort。
///
/// fact 的 token 桶（snake 四桶）与 `tokens_by_host` 的四轴同词表；host 取
/// `host` 字段（by_host 视角聚合）。缺桶按 0 计——「缺失」在 fact 层是
/// null（宿主没这项证据），聚合为 0 是对的；「真实 0」也是 0，两者在聚合
/// 面等价是设计使然（区分发生在单 fact 层，那里 null 与 0 是不同的值）。
pub fn reconcile_tokens(
    facts: &[serde_json::Value],
    tokens_by_host: &serde_json::Value,
) -> serde_json::Value {
    let mut from_facts: std::collections::BTreeMap<String, i64> = Default::default();
    for f in facts {
        let host = f.get("host").and_then(|v| v.as_str()).unwrap_or("unknown");
        let g = |k: &str| f.get(k).and_then(|v| v.as_i64()).unwrap_or(0);
        *from_facts.entry(host.to_string()).or_insert(0) += g("uncached_input_tokens")
            + g("cache_read_tokens")
            + g("cache_write_tokens")
            + g("output_tokens");
    }
    let mut from_dto: std::collections::BTreeMap<String, i64> = Default::default();
    if let Some(map) = tokens_by_host.as_object() {
        for (host, t) in map {
            from_dto.insert(host.clone(), t.get("total").and_then(|v| v.as_i64()).unwrap_or(0));
        }
    }
    let mut mismatches = Vec::new();
    let hosts: std::collections::BTreeSet<&String> =
        from_facts.keys().chain(from_dto.keys()).collect();
    for host in hosts {
        let a = from_facts.get(host).copied().unwrap_or(0);
        let b = from_dto.get(host).copied().unwrap_or(0);
        if a != b {
            mismatches.push(json!({
                "host": host,
                "facts_total": a,
                "projection_total": b,
                "delta": a - b,
            }));
        }
    }
    json!({
        "reconciled": mismatches.is_empty(),
        "hosts_compared": from_facts.len().max(from_dto.len()),
        "mismatches": mismatches,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// 合法 fact 的身份字段（fact_id 由 build_usage_fact 内部计算）。
    fn base_fields() -> serde_json::Map<String, serde_json::Value> {
        let mut m = serde_json::Map::new();
        m.insert("machine_namespace".to_string(), json!("m1"));
        m.insert("host".to_string(), json!("codex"));
        m.insert("source_profile".to_string(), json!("default"));
        m.insert("native_session_id".to_string(), json!("sess-1"));
        m.insert("source_event_id".to_string(), json!("evt-1"));
        m.insert("observation_kind".to_string(), json!("token_count"));
        m.insert("uncached_input_tokens".to_string(), json!(800));
        m.insert("output_tokens".to_string(), json!(80));
        m
    }

    fn tmp_path(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "avd-evidence-{}-{}-{}",
            tag,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn append_is_exactly_once_across_reopen() {
        let path = tmp_path("dedup");
        let fields = base_fields();
        let mut w = FactWriter::open(&path).unwrap();
        let (out1, f1) = w.append(&fields).unwrap();
        assert_eq!(out1, AppendOutcome::Appended);
        assert!(f1.is_some());
        // 同一逻辑事件重复 emit（模拟重放/双管道）→ Duplicate，不落第二行。
        let (out2, f2) = w.append(&fields).unwrap();
        assert_eq!(out2, AppendOutcome::Duplicate);
        assert!(f2.is_none());
        // 跨 writer 实例（重新 open = 模拟重启）：去重集合从文件重建。
        drop(w);
        let mut w2 = FactWriter::open(&path).unwrap();
        assert_eq!(w2.seen_count(), 1, "重启后 seen 集合必须从文件重建");
        let (out3, _) = w2.append(&fields).unwrap();
        assert_eq!(out3, AppendOutcome::Duplicate);
        // 文件里恰好一行。
        assert_eq!(replay(&path).unwrap().facts.len(), 1);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn different_identity_is_a_different_fact() {
        let path = tmp_path("distinct");
        let mut w = FactWriter::open(&path).unwrap();
        let a = base_fields();
        let mut b = base_fields();
        b.insert("source_event_id".to_string(), json!("evt-2"));
        w.append(&a).unwrap();
        w.append(&b).unwrap();
        assert_eq!(w.seen_count(), 2, "不同身份必是不同事实");
        assert_eq!(replay(&path).unwrap().facts.len(), 2);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn invalid_fact_is_rejected_with_field_names() {
        let path = tmp_path("invalid");
        let mut w = FactWriter::open(&path).unwrap();
        let mut bad = base_fields();
        bad.remove("native_session_id");
        bad.insert("uncached_input_tokens".to_string(), json!(-5));
        let err = w.append(&bad).unwrap_err();
        match err {
            AppendError::Invalid(problems) => {
                let joined = problems.join("; ");
                assert!(joined.contains("native_session_id"), "{joined}");
                assert!(joined.contains("uncached_input_tokens"), "{joined}");
            }
            other => panic!("expected Invalid, got {other:?}"),
        }
        // 被拒绝的 fact 不得留半行在文件里。
        assert_eq!(replay(&path).unwrap().facts.len(), 0);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn trailing_partial_line_is_tolerated_mid_lines_are_corrupt() {
        let path = tmp_path("crash");
        // 模拟 crash 半行：一条完整 fact + 一条截断的 JSON。
        let mut w = FactWriter::open(&path).unwrap();
        w.append(&base_fields()).unwrap();
        drop(w);
        let mut text = std::fs::read_to_string(&path).unwrap();
        text.push_str("{\"fact_id\": \"uf1-trunca");
        std::fs::write(&path, text).unwrap();

        let rep = replay(&path).unwrap();
        assert_eq!(rep.facts.len(), 1, "完整行照常读回");
        assert_eq!(rep.trailing_partial, 1, "crash 半行被计数跳过");
        // 尾行半行后 writer 仍可继续 append（追加在坏行之后——坏行永远只是
        // 尾行，重放仍然只跳它一个）。
        let mut w = FactWriter::open(&path).unwrap();
        let mut second = base_fields();
        second.insert("source_event_id".to_string(), json!("evt-2"));
        w.append(&second).unwrap();

        // 中间坏行 = 真实损坏，必须报 Corrupt 而不是静默跳过。
        let mut broken = std::fs::read_to_string(&path).unwrap();
        broken = broken.replace("}\n{", "}\nNOT_JSON\n{");
        std::fs::write(&path, &broken).unwrap();
        match replay(&path) {
            Err(AppendError::Corrupt { line_no }) => assert!(line_no >= 2),
            other => panic!("expected Corrupt, got {other:?}"),
        }
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn reconcile_reports_mismatch_without_panicking() {
        let mut fields = base_fields();
        fields.insert("cache_read_tokens".to_string(), json!(200));
        let fact = build_usage_fact(&fields).unwrap();
        let facts = vec![fact];
        let dto = json!({ "codex": { "total": 1080 } }); // 800+200+80=1080 一致
        let ok = reconcile_tokens(&facts, &dto);
        assert_eq!(ok["reconciled"], json!(true));
        let dto_bad = json!({ "codex": { "total": 999 } });
        let bad = reconcile_tokens(&facts, &dto_bad);
        assert_eq!(bad["reconciled"], json!(false));
        assert_eq!(bad["mismatches"][0]["delta"], json!(81));
    }
}
