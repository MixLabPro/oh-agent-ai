//! Codex 会话日志（rollout JSONL）读取器 —— P4 适配器的 "locate → shape →
//! extract" 三段（五段式流水线 locate → shape → extract → derive → coverage，
//! 见 `docs/RUNTIME_EVIDENCE_CONTRACT.md` §4.2）。"derive → coverage" 两段在
//! core 的 `crates/skill-vitals-core/src/codex_evidence.rs`，I/O 不进去。
//!
//! Codex 的 rollout 落盘在 `~/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-*.jsonl`，
//! 明文 append-only JSONL，每行一个 `{type, timestamp, payload}` 包络。**命名冲突
//! 警告**：`src/codex.rs`（和 `scripts/skill_vitals/adapters/codex.py`）是安装时
//! 的运行时探针适配器，跟这里完全无关；本模块是会话日志审计，叫 `codex_session`，
//! 不要互相复用。
//!
//! **没有版本闸。** DSH 的 `SESSION_FORMAT_VERSION` 是 adapter-private（`dsh.rs`
//! 里那个 `EXPECTED_SESSION_FORMAT_VERSION`），§14.4 明确说 Codex 格式无版本、
//! 靠兼容 shim 演进——照搬版本闸会把「新 cli 多写了一种记录类型」误判成「日志
//! 损坏」。这里只靠存在性探测降级：空文件 → `missing-header`，读到非 JSON 行 →
//! `non-json`，文件不可读 → `file-missing`。**绝不假装读到了 0 条**（同
//! `dsh.rs` 的降级铁律——报 0 会直接伪造出假的覆盖结论）。
//!
//! 未知的记录类型**原样保留进 `items`**，不在这里判「损坏」也不丢——认识不认识
//! 是 core `codex_evidence::derive_coverage` 的职责（它把未知类型记进
//! `attempts`，§14.4 "skipped and recorded in attempts, never treated as
//! corruption"）。解析器只负责「把 JSONL 逐行读进来 + 抽出 provenance 字段」。
use std::path::Path;

use serde_json::{json, Map, Value};

use crate::util::split_lines;

fn empty_result() -> Map<String, Value> {
    let mut map = Map::new();
    map.insert("items".to_string(), Value::Null);
    map.insert("session_id".to_string(), Value::Null);
    map.insert("history_mode".to_string(), Value::Null);
    map.insert("cli_version".to_string(), Value::Null);
    map.insert("model".to_string(), Value::Null);
    map.insert("workspace_roots".to_string(), Value::Array(Vec::new()));
    map.insert("degraded".to_string(), Value::Bool(false));
    map
}

fn degraded(reason: &str) -> Value {
    let mut map = empty_result();
    map.insert("degraded".to_string(), json!(reason));
    // 降级时 items 必须保持 null，**绝不改成空数组**——空数组会被上层当成
    // 「读全了但确实 0 条」，那是编造。
    map.insert("items".to_string(), Value::Null);
    Value::Object(map)
}

/// 纯解析：把整个 rollout JSONL 文本折成 provenance 字段 + 原始条目数组。
/// 与 Python `scripts/skill_vitals/adapters/codex_session.py::parse_codex_session_log`
/// 逐字节对齐。
///
/// 抽取的 provenance 字段（实测 field path，见 `codex-corpus-facts` 记忆与
/// `fixtures/codex/README.md`）：
///
/// | 输出字段 | 来源 | 说明 |
/// |---|---|---|
/// | `session_id` | `session_meta.payload.session_id`（缺时退回 `.id`） | §14.4 back-fill |
/// | `history_mode` | `session_meta.payload.history_mode` | 形状探针，只作 provenance |
/// | `cli_version` | `session_meta.payload.cli_version` | 同上 |
/// | `model` | `turn_context.payload.model`（**最新**一条） | session_meta.payload.model 实测恒为 null |
/// | `workspace_roots` | `turn_context.payload.workspace_roots`（**最新**非空一条） | 与 dsh 的 last_catalog_wins 同一「当前状态」惯例 |
///
/// 其余所有行（event_msg / response_item / world_state / compacted / …）原样收进
/// `items`，解析器不挑拣。
pub fn parse_codex_session_log(text: &str) -> Value {
    let lines = split_lines(text);
    if lines.is_empty() {
        return degraded("missing-header");
    }

    let mut items: Vec<Value> = Vec::new();
    let mut session_id: Option<String> = None;
    let mut history_mode: Option<String> = None;
    let mut cli_version: Option<String> = None;
    let mut model: Option<String> = None;
    let mut workspace_roots: Vec<String> = Vec::new();

    for line in &lines {
        if line.trim().is_empty() {
            // 空白行不是事件（真实 writer 只在文件尾补一个换行），跳过。
            continue;
        }
        let item: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => return degraded("non-json"),
        };
        let ttype = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match ttype {
            "session_meta" => {
                if let Some(p) = item.get("payload").and_then(|v| v.as_object()) {
                    session_id = p
                        .get("session_id")
                        .or_else(|| p.get("id"))
                        .and_then(|v| v.as_str())
                        .map(str::to_owned);
                    history_mode = p.get("history_mode").and_then(|v| v.as_str()).map(str::to_owned);
                    cli_version = p.get("cli_version").and_then(|v| v.as_str()).map(str::to_owned);
                }
            }
            "turn_context" => {
                if let Some(p) = item.get("payload").and_then(|v| v.as_object()) {
                    // 模型：取最新一条 turn_context 的非空值。真实语料里
                    // session_meta.payload.model 恒为 null，model 只在
                    // turn_context 里（实测 `gpt-5.6-sol`）。
                    if let Some(m) = p.get("model").and_then(|v| v.as_str()) {
                        model = Some(m.to_string());
                    }
                    // workspace_roots：最新一条非空列表覆盖成「当前」。
                    let names: Vec<String> = p
                        .get("workspace_roots")
                        .and_then(|v| v.as_array())
                        .map(|a| {
                            a.iter().filter_map(|r| r.as_str()).map(str::to_owned).collect()
                        })
                        .unwrap_or_default();
                    if !names.is_empty() {
                        workspace_roots = names;
                    }
                }
            }
            _ => {} // 其它记录类型只进 items，provenance 不从这里取
        }
        items.push(item);
    }

    let mut map = empty_result();
    map.insert("items".to_string(), json!(items));
    map.insert("session_id".to_string(), json!(session_id));
    map.insert("history_mode".to_string(), json!(history_mode));
    map.insert("cli_version".to_string(), json!(cli_version));
    map.insert("model".to_string(), json!(model));
    map.insert("workspace_roots".to_string(), json!(workspace_roots));
    Value::Object(map)
}

/// 读文件（非 UTF-8 字节替换为 U+FFFD，与 Python `errors="replace"` 对齐），再交给
/// 纯解析。文件缺失/不可读时降级为 `file-missing`。
pub fn read_codex_session_log(path: &Path) -> Value {
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(_) => return degraded("file-missing"),
    };
    let text = String::from_utf8_lossy(&bytes).into_owned();
    parse_codex_session_log(&text)
}

/// 列出 Codex 会话根集合的确定性状形：每个根是否存在、rollout 数量、字节总量。
/// 与 Python `scripts/skill_vitals/adapters/codex_session.py::codex_session_roots_report`
/// 逐字节对齐。
///
/// **存在性探测，绝不报错**：根目录不存在 → `exists=false` 且 file_count/
/// total_bytes 归零，不猜路径、也不把缺席当成 0 条真数据。`home` 由调用方从
/// `HOME`/`USERPROFILE` 解析（测试用 `isolated_home_env` 注入同一路径）。
///
/// 键序是字节一致的一部分，不能重排：根对象 kind → path → exists →
/// file_count → total_bytes；外层 host → roots。
pub fn codex_session_roots_report(home: &Path) -> Value {
    let entries: [(&str, &str); 2] = [("live", "sessions"), ("archived", "archived_sessions")];
    let mut roots = Vec::new();
    for (kind, rel) in entries {
        let root = home.join(".codex").join(rel);
        let exists = root.is_dir();
        let mut file_count = 0usize;
        let mut total_bytes = 0u64;
        if exists {
            let mut files: Vec<std::path::PathBuf> = walkdir::WalkDir::new(&root)
                .into_iter()
                .filter_map(Result::ok)
                .filter(|e| e.file_type().is_file())
                .filter(|e| e.path().extension().map(|x| x == "jsonl").unwrap_or(false))
                .map(|e| e.into_path())
                .collect();
            files.sort_by(|a, b| a.to_string_lossy().cmp(&b.to_string_lossy()));
            file_count = files.len();
            for f in &files {
                // 与 Python `_file_bytes` 同款：文件在枚举与 stat 之间消失时按
                // 0 字节计，不 abort 整个报告；文件仍算进 file_count。
                total_bytes += std::fs::metadata(f).map(|m| m.len()).unwrap_or(0);
            }
        }
        roots.push(json!({
            "kind": kind,
            "path": root.to_string_lossy().to_string(),
            "exists": exists,
            "file_count": file_count,
            "total_bytes": total_bytes,
        }));
    }
    json!({ "host": "codex", "roots": roots })
}

/// `codex-evidence` 子命令直接收路径参数（与 behavior/duration-audit 同款），不
/// 走环境变量注入——`SKILL_VITALS_CODEX_SESSION_LOG` 的机制（DSH 那个
/// `SKILL_VITALS_DSH_SESSION_LOG` 的对称物）等未来真有「按宿主自动发现会话日志」
/// 的扫描入口时再加，现在加就是死代码。
#[cfg(test)]
mod tests {
    use super::*;

    fn meta_line(id: &str, mode: &str, cli: &str) -> String {
        format!(
            r#"{{"timestamp":"2026-07-25T11:19:35.404Z","type":"session_meta","payload":{{"session_id":"{id}","id":"{id}","history_mode":"{mode}","cli_version":"{cli}","cwd":"/repo"}}}}"#
        )
    }

    fn turn_context_line(model: &str, roots: &[&str]) -> String {
        let roots_json = serde_json::to_string(&roots).unwrap();
        format!(
            r#"{{"timestamp":"2026-07-25T11:20:00Z","type":"turn_context","payload":{{"turn_id":"t1","cwd":"/repo","workspace_roots":{roots_json},"model":"{model}","approval_policy":"on-request"}}}}"#
        )
    }

    #[test]
    fn parses_provenance_and_keeps_all_items() {
        let text = format!(
            "{}\n{}\n{}\n{}\n",
            meta_line("s1", "legacy", "0.146.0-alpha.3.1"),
            turn_context_line("gpt-5.6-sol", &["/repo"]),
            r#"{"timestamp":"2026-07-25T11:21:00Z","type":"event_msg","payload":{"type":"task_started"}}"#,
            r#"{"timestamp":"2026-07-25T11:21:01Z","type":"future_record_type","payload":{"n":1}}"#,
        );
        let v = parse_codex_session_log(&text);
        assert_eq!(v["session_id"], json!("s1"));
        assert_eq!(v["history_mode"], json!("legacy"));
        assert_eq!(v["cli_version"], json!("0.146.0-alpha.3.1"));
        assert_eq!(v["model"], json!("gpt-5.6-sol"));
        assert_eq!(v["workspace_roots"], json!(["/repo"]));
        // 未知记录类型原样保留，解析器不判损坏（core 的 derive_coverage 才负责
        // 把不认识的分型记进 attempts）。
        assert_eq!(v["items"].as_array().unwrap().len(), 4);
        assert_eq!(v["items"][3]["type"], json!("future_record_type"));
        assert_eq!(v["degraded"], json!(false));
    }

    #[test]
    fn empty_text_is_missing_header() {
        assert_eq!(parse_codex_session_log("")["degraded"], json!("missing-header"));
        assert_eq!(parse_codex_session_log("")["items"], Value::Null);
    }

    #[test]
    fn non_json_first_line_degrades() {
        assert_eq!(parse_codex_session_log("not json\n")["degraded"], json!("non-json"));
    }

    #[test]
    fn non_json_mid_file_degrades_not_zero() {
        // 读到一半遇到垃圾行：必须报 degraded，不能拿着半截结果说「读了 N 条」。
        let text = format!(
            "{}\n{}\ngarbage line\n",
            meta_line("s1", "legacy", "0.146"),
            r#"{"timestamp":"2026-07-25T11:21:00Z","type":"event_msg","payload":{"type":"task_started"}}"#,
        );
        let v = parse_codex_session_log(&text);
        assert_eq!(v["degraded"], json!("non-json"));
        assert_eq!(v["items"], Value::Null);
    }

    #[test]
    fn no_session_meta_degrades_not_but_leaves_provenance_null() {
        // §14.4：只靠存在性探测降级。有行、可解析、但没有 session_meta 不算损坏
        // ——provenance 如实给 null（诚实缺失，不编造），items 照常收。
        let text = r#"{"timestamp":"2026-07-25T11:21:00Z","type":"event_msg","payload":{"type":"task_started"}}
"#;
        let v = parse_codex_session_log(text);
        assert_eq!(v["degraded"], json!(false));
        assert_eq!(v["session_id"], Value::Null);
        assert_eq!(v["history_mode"], Value::Null);
        assert_eq!(v["items"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn model_and_workspace_roots_take_latest_turn_context() {
        // 「当前状态」惯例：最新一条非空 turn_context 覆盖（与 dsh 的
        // last_catalog_wins 同款）。模型中途切换后，报告里是最后的那个。
        let text = format!(
            "{}\n{}\n{}\n",
            meta_line("s1", "paginated", "0.149.0-alpha.4"),
            turn_context_line("gpt-5.6-sol", &["/old"]),
            turn_context_line("gpt-5.6-pro", &["/repo", "/data"]),
        );
        let v = parse_codex_session_log(&text);
        assert_eq!(v["model"], json!("gpt-5.6-pro"));
        assert_eq!(v["workspace_roots"], json!(["/repo", "/data"]));
        assert_eq!(v["history_mode"], json!("paginated"));
    }

    #[test]
    fn session_id_backfills_from_id_when_session_id_missing() {
        let text = r#"{"type":"session_meta","payload":{"id":"uuid-1","history_mode":"legacy","cli_version":"0.146"}}
"#;
        let v = parse_codex_session_log(text);
        assert_eq!(v["session_id"], json!("uuid-1"));
    }

    #[test]
    fn missing_file_degrades() {
        let v = read_codex_session_log(Path::new("/nonexistent-xyz/rollout.jsonl"));
        assert_eq!(v["degraded"], json!("file-missing"));
        assert_eq!(v["items"], Value::Null);
    }

    /// 每个测试独占一个临时目录，互不污染；用进程 id + 用例名保证唯一。
    fn temp_home(tag: &str) -> std::path::PathBuf {
        let base = std::env::temp_dir().join(format!(
            "sv-codex-roots-{}-{}",
            std::process::id(),
            tag
        ));
        let _ = std::fs::remove_dir_all(&base);
        base
    }

    #[test]
    fn roots_report_enumerates_live_and_archived() {
        let home = temp_home("both");
        let live = home.join(".codex").join("sessions").join("2026").join("08");
        let arch = home.join(".codex").join("archived_sessions");
        std::fs::create_dir_all(&live).unwrap();
        std::fs::create_dir_all(&arch).unwrap();
        // 日期分层：rglob 递归必须穿过多层子目录（live 里就是 YYYY/MM/DD）。
        std::fs::write(live.join("rollout-a.jsonl"), "{}").unwrap();
        std::fs::write(live.join("rollout-b.jsonl"), "{}").unwrap();
        std::fs::write(arch.join("rollout-c.jsonl"), "abc").unwrap();

        let v = codex_session_roots_report(&home);
        assert_eq!(v["host"], json!("codex"));
        let roots = v["roots"].as_array().unwrap();
        assert_eq!(roots.len(), 2);
        assert_eq!(roots[0]["kind"], json!("live"));
        assert_eq!(roots[0]["exists"], json!(true));
        assert_eq!(roots[0]["file_count"], json!(2));
        assert_eq!(roots[0]["total_bytes"], json!(4)); // "{}" × 2
        assert_eq!(roots[1]["kind"], json!("archived"));
        assert_eq!(roots[1]["exists"], json!(true));
        assert_eq!(roots[1]["file_count"], json!(1));
        assert_eq!(roots[1]["total_bytes"], json!(3)); // "abc"
        // 键序（字节一致的一部分）：kind → path → exists → file_count →
        // total_bytes。
        assert_eq!(roots[0].as_object().unwrap().keys().collect::<Vec<_>>(),
                   vec!["kind", "path", "exists", "file_count", "total_bytes"]);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn roots_report_absent_archive_zero_fills() {
        // archived_sessions 缺席：存在性探测，绝不报错、不猜路径、也不把缺席
        // 当成 0 条真数据（同 parse 的降级铁律）。
        let home = temp_home("absent");
        let live = home.join(".codex").join("sessions");
        std::fs::create_dir_all(&live).unwrap();
        std::fs::write(live.join("rollout-a.jsonl"), "{}").unwrap();

        let v = codex_session_roots_report(&home);
        let roots = v["roots"].as_array().unwrap();
        assert_eq!(roots[0]["exists"], json!(true));
        assert_eq!(roots[0]["file_count"], json!(1));
        assert_eq!(roots[1]["kind"], json!("archived"));
        assert_eq!(roots[1]["exists"], json!(false));
        assert_eq!(roots[1]["file_count"], json!(0));
        assert_eq!(roots[1]["total_bytes"], json!(0));
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn roots_report_empty_live_is_exists_not_error() {
        // live 根存在但没有任何 rollout：exists=true + 0 文件，不是错误。
        let home = temp_home("empty");
        std::fs::create_dir_all(home.join(".codex").join("sessions")).unwrap();
        let v = codex_session_roots_report(&home);
        let roots = v["roots"].as_array().unwrap();
        assert_eq!(roots[0]["exists"], json!(true));
        assert_eq!(roots[0]["file_count"], json!(0));
        assert_eq!(roots[0]["total_bytes"], json!(0));
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn roots_report_ignores_non_jsonl_files() {
        // 根下的非 .jsonl 文件（.json、.txt 等）不计数。注意 `*.jsonl` 是后缀
        // 匹配，session_index.jsonl 这种也会被算进去——但标题索引在 sessions/
        // 之外，不在任何根里，所以不会误计（它的问题由标题索引的后续工作处理）。
        let home = temp_home("nonrollout");
        let live = home.join(".codex").join("sessions");
        std::fs::create_dir_all(&live).unwrap();
        std::fs::write(live.join("rollout-a.jsonl"), "{}").unwrap();
        std::fs::write(live.join("meta.json"), "{}").unwrap();
        std::fs::write(live.join("notes.txt"), "x").unwrap();

        let v = codex_session_roots_report(&home);
        let roots = v["roots"].as_array().unwrap();
        assert_eq!(roots[0]["file_count"], json!(1));
        assert_eq!(roots[0]["total_bytes"], json!(2));
        let _ = std::fs::remove_dir_all(&home);
    }
}
