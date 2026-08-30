//! R2a SessionStore 的 **I/O 层**（`docs/R2A_CONTRACT_DESIGN.md`）。
//!
//! 纯规则（SessionKey / 版本闸 / filter / cursor / 分页 / 类型化错误）在
//! `agent_vitals_core::r2a`；本模块只做 I/O：
//!
//!   · Codex 根发现 → 复用 `codex_session_audit::codex_session_audit_json`（R2a
//!     的 `session` 载荷**必须复用既有输出，不发明新字段名**，设计 §2.2）；
//!   · 构建 `SessionReportEntry` + versioned envelope（core `build_envelope`）；
//!   · 写/读自有 cache（`data_home()/cache/r2a/`）—— **Store 只写自己的可删
//!     app cache，绝不碰 R1 权威状态写**（设计 §3.5 写右边界）；
//!   · `sessions list` / `sessions read` 的 CLI 面（Tauri IPC 经 spawn 二进制
//!     走这里）。
//!
//! 源指纹（§1.5 SourceFingerprint）= (size, mtime_ns, 首/尾 64 字节 FNV-1a)，
//! 仅相等比较：cache 命中判定「相等 ⇒ 内容未变」，截断/替换（指纹不等）→
//! 全量重建。源不可用的宿主（Phase 1 的 DSH，zstd 未接线）在 `source_statuses`
//! 里报 `source-unavailable`，**绝不数成 0 个会话**。

use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use agent_vitals_core::r2a::*;
use crate::agent::codex_session_audit as csa;
use crate::agent::takeover;
use crate::skills::snapshot::data_home;

/// cache 根：`data_home()/cache/r2a/`。在 `state_dir()` 之外 —— R2a SessionStore
/// 的写面只到自己的 cache，不与 R1 的权威状态文件争 fencing。
fn cache_dir() -> PathBuf {
    data_home().join("cache").join("r2a")
}

fn codex_cache_path() -> PathBuf {
    cache_dir().join("codex-sessions.json")
}

/// Codex 源指纹（当前源文件的指纹列表，按 `codex_rollout_files` 的全局路径序）。
/// 文件名（session 分组）不是指纹的一部分——路径就是源文件的身份，指纹看内容。
fn codex_source_fingerprints(home: &Path) -> Vec<(String, String)> {
    crate::agent::codex_session::codex_rollout_files(home)
        .iter()
        .map(|p| (p.to_string_lossy().to_string(), fingerprint_file(p).unwrap_or_default()))
        .collect()
}

/// §1.5 源文件指纹：(size, mtime_ns, 首/尾 64 字节的 FNV-1a)。stat 失败 →
/// None（文件在 walk 与 stat 之间消失，cache 自然失效，不 abort）。
fn fingerprint_file(path: &Path) -> Option<String> {
    let meta = std::fs::metadata(path).ok()?;
    let size = meta.len();
    let mtime_ns = meta
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_nanos() as u64;
    let bytes = std::fs::read(path).ok()?;
    let n = bytes.len().min(64);
    let first = &bytes[..n];
    let last = &bytes[bytes.len().saturating_sub(64)..];
    Some(format!(
        "{size}:{mtime_ns}:{:016x}:{:016x}",
        fnv1a64(first),
        fnv1a64(last)
    ))
}

/// 从 `codex_session_audit_json` 的载荷抽 summary 派生列（§2.5 `SessionSummary`
/// 字段）。payload 键名全部来自既有输出，**不发明新字段名**。degraded 会话
/// （date_span 为 null）→ 相应字段为 None，诚实缺失。
#[derive(Debug, Default, Clone)]
struct Summary {
    title: Option<String>,
    model: Option<String>,
    date_first: Option<String>,
    date_last: Option<String>,
    files: usize,
    cost_usd: Option<f64>,
    tokens_total: Option<i64>,
    findings_total: usize,
}

fn extract_summary(payload: &Value) -> Summary {
    let str_at = |p: &Value, path: &[&str]| -> Option<String> {
        let mut cur = p;
        for k in path {
            cur = cur.get(*k)?;
        }
        cur.as_str().map(str::to_owned)
    };
    let date_first = str_at(payload, &["date_span", "first"]);
    let date_last = str_at(payload, &["date_span", "last"]);
    let files = payload
        .get("files")
        .and_then(Value::as_array)
        .map(|a| a.len())
        .unwrap_or(0);
    let cost_usd = payload
        .pointer("/cost_report/total_cost_usd")
        .and_then(Value::as_f64);
    let tokens_total = payload
        .pointer("/cost_report/total_tokens")
        .and_then(Value::as_object)
        .map(|m| m.values().filter_map(Value::as_i64).sum());
    let findings_total = payload
        .pointer("/audit/summary/findings_total")
        .and_then(Value::as_u64)
        .unwrap_or(0) as usize;
    Summary {
        title: payload.get("title").and_then(Value::as_str).map(str::to_owned),
        model: payload.get("model").and_then(Value::as_str).map(str::to_owned),
        date_first,
        date_last,
        files,
        cost_usd,
        tokens_total,
        findings_total,
    }
}

/// pricing_version：价表内容的确定性指纹（业务数据换版 = 换指纹）。两侧都用
/// 「价表 JSON 紧凑序列化」的 FNV-1a——serde/py 都保插入序，逐字节一致。
fn pricing_version() -> String {
    let p = crate::agent::codex_cost::load_codex_pricing();
    let s = serde_json::to_string(&p).unwrap_or_default();
    format!("{:016x}", fnv1a64(s.as_bytes()))
}

/// 秒级 UTC ISO（复用 state 的同一实现，测试对账把 generated_at 归一化，只比
/// 结构——两进程墙钟不同，字节一致不承诺墙钟字段）。
fn now_iso_utc() -> String {
    crate::agent::state::now_iso_utc()
}

/// Codex 源状态（进 envelope 的 `source_statuses` 与 list DTO）：status + 会话数 +
/// 根存在性（复用 `codex_session_roots_report`）。DSH 在 Phase 1 报
/// source-unavailable（zstd 未接线）——**不是 0 会话**，是读不了的源。
fn codex_source_statuses(home: &Path, n_sessions: usize) -> Value {
    let roots = crate::agent::codex_session::codex_session_roots_report(home);
    json!({
        "codex": {
            "status": "ok",
            "sessions": n_sessions,
            "roots": roots.get("roots").cloned().unwrap_or_else(|| Value::Array(vec![])),
        },
        "dsh": {
            "status": "unavailable",
            "reason": "unsupported-compression",
            "note": "zstd decode lands in R2a Phase 2 (§6.3-1); a dsh list request returns source-unavailable, not an empty page (§3.3)",
        },
    })
}

/// 内存中的只读 SessionStore（设计 §3.1）。构建时从源填充并写 cache；查询委托
/// core 纯函数。
#[derive(Debug, Clone)]
pub struct SessionStore {
    pub entries: Vec<SessionReportEntry>,
    pub source_statuses: Value,
    pub generated_at: String,
}

impl SessionStore {
    /// 从 Codex 源填充（Phase 1 唯一可读源）。缓存命中（指纹一致）→ 快路径直接
    /// 读 cache；否则全量重建（`codex_session_list` → `codex_session_audit_json`
    /// → core 构建 envelope）并写 cache。
    pub fn codex(home: &Path) -> Result<SessionStore, StoreError> {
        let ns = takeover::machine_namespace();
        let generated_at = now_iso_utc();
        let fingerprints = codex_source_fingerprints(home);
        let cache_path = codex_cache_path();

        if let Some(cached) = read_cache(&cache_path) {
            if cache_is_current(&cached, &fingerprints) {
                if let Some(store) = cache_to_store(&cached) {
                    return Ok(store);
                }
                // cache 形状坏（比如升级后字段改名）→ 落回全量重建，不 abort。
            }
        }

        let list = csa::codex_session_list(home);
        let sessions = list
            .get("sessions")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        // 先攒 (key, payload)，统一排序后再赋 store_seq —— store_seq = 稳定排序
        // 序（host_kind → native_id 主序），保证 Python/Rust 逐字节一致。
        let mut raw: Vec<(SessionKey, Value)> = Vec::new();
        for s in sessions {
            let Some(sid) = s.get("session_id").and_then(Value::as_str) else { continue };
            let Some(payload) = csa::codex_session_audit_json(home, sid) else { continue };
            let source_profile = payload
                .get("workspace_roots")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            raw.push((
                SessionKey::new("codex", sid, &source_profile, &ns),
                payload,
            ));
        }
        raw.sort_by(|(a, _), (b, _)| sort_key(a).cmp(&sort_key(b)));

        let entries = build_entries(&raw, &generated_at, &codex_source_statuses(home, raw.len()));
        let store = SessionStore {
            entries,
            source_statuses: codex_source_statuses(home, raw.len()),
            generated_at,
        };
        write_cache(&cache_path, &store, &fingerprints);
        Ok(store)
    }

    /// 委托 core `list_sessions`。
    pub fn list(
        &self,
        filter: &SessionFilter,
        cursor: Option<&PageCursor>,
        page_size: usize,
    ) -> Result<Page, StoreError> {
        list_sessions(&self.entries, filter, cursor, page_size)
    }

    /// 委托 core `read_session`。
    pub fn read(&self, key: &SessionKey, revision: Option<&str>) -> Result<Value, StoreError> {
        read_session(&self.entries, key, revision)
    }
}

/// 排序四元组（与 core `r2a::sort_tuple` 相同语义，这里绑定到 `SessionKey`）。
fn sort_key(k: &SessionKey) -> (&str, &str, &str, &str) {
    (&k.host_kind, &k.native_id, &k.source_profile, &k.machine_namespace)
}

/// 把 (key, payload) 按稳定序构建成 `SessionReportEntry`（envelope 内
/// `store_revision` = store_seq = 排序序，保证确定性）。
fn build_entries(raw: &[(SessionKey, Value)], generated_at: &str, source_statuses: &Value) -> Vec<SessionReportEntry> {
    let engine = ENGINE_VERSION;
    let pricing = pricing_version();
    raw.iter()
        .enumerate()
        .map(|(seq, (key, payload))| {
            let s = extract_summary(payload);
            let session_revision = s.date_last.clone();
            let envelope = build_envelope(
                engine,
                &pricing,
                seq as u64,
                generated_at,
                source_statuses.clone(),
                key,
                session_revision.as_deref(),
                payload.clone(),
            );
            SessionReportEntry {
                key: key.clone(),
                session_revision,
                title: s.title,
                model: s.model,
                date_first: s.date_first,
                date_last: s.date_last,
                files: s.files,
                cost_usd: s.cost_usd,
                tokens_total: s.tokens_total,
                findings_total: s.findings_total,
                store_seq: seq as u64,
                envelope,
            }
        })
        .collect()
}

// ── cache 读写 ──────────────────────────────────────────────────

/// cache 文件形状（只写自己的可删 app cache，§3.5）：
/// `{schema_version, source, fingerprints, built_at, source_statuses,
///   generated_at, entries:[envelope...]}`。
fn cache_to_store(cached: &Value) -> Option<SessionStore> {
    let generated_at = cached.get("generated_at").and_then(Value::as_str)?.to_string();
    let source_statuses = cached.get("source_statuses").cloned()?;
    let arr = cached.get("entries")?.as_array()?;
    let mut entries = Vec::with_capacity(arr.len());
    for env in arr {
        let e = entry_from_envelope(env)?;
        entries.push(e);
    }
    // 从 cache 恢复的 entries 仍按稳定序重排一遍（防御：cache 手改/旧版乱序）。
    entries.sort_by(|a, b| sort_key(&a.key).cmp(&sort_key(&b.key)));
    Some(SessionStore { entries, source_statuses, generated_at })
}

/// 从 cache 的 envelope 恢复 `SessionReportEntry`（读回 session_key + 派生列）。
/// 任何字段缺失 → None（cache 版本不兼容 → 落回全量重建）。
fn entry_from_envelope(env: &Value) -> Option<SessionReportEntry> {
    let key = SessionKey::from_json(env.get("session_key")?)?;
    let payload = env.get("session")?;
    let s = extract_summary(payload);
    let session_revision = env.get("session_revision").and_then(Value::as_str).map(str::to_owned);
    let store_seq = env.get("store_revision").and_then(Value::as_u64)?;
    Some(SessionReportEntry {
        key,
        session_revision,
        title: s.title,
        model: s.model,
        date_first: s.date_first,
        date_last: s.date_last,
        files: s.files,
        cost_usd: s.cost_usd,
        tokens_total: s.tokens_total,
        findings_total: s.findings_total,
        store_seq,
        envelope: env.clone(),
    })
}

fn cache_is_current(cached: &Value, fingerprints: &[(String, String)]) -> bool {
    let Some(list) = cached.get("fingerprints").and_then(Value::as_array) else {
        return false;
    };
    if list.len() != fingerprints.len() {
        return false;
    }
    for (i, cur) in fingerprints.iter().enumerate() {
        let Some(entry) = list.get(i) else { return false };
        let path = entry.get("path").and_then(Value::as_str).unwrap_or("");
        let fp = entry.get("fingerprint").and_then(Value::as_str).unwrap_or("");
        if path != cur.0 || fp != cur.1 {
            return false;
        }
    }
    true
}

fn read_cache(path: &Path) -> Option<Value> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_cache(path: &Path, store: &SessionStore, fingerprints: &[(String, String)]) {
    let fps: Vec<Value> = fingerprints
        .iter()
        .map(|(p, f)| json!({ "path": p, "fingerprint": f }))
        .collect();
    let doc = json!({
        "schema_version": "1",
        "source": "codex",
        "fingerprints": fps,
        "built_at": store.generated_at,
        "source_statuses": store.source_statuses,
        "generated_at": store.generated_at,
        "entries": store.entries.iter().map(|e| e.envelope.clone()).collect::<Vec<_>>(),
    });
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let text = serde_json::to_string(&doc).unwrap_or_default();
    let _ = std::fs::write(path, text);
}

/// 把类型化错误打到 stderr（或 JSON），退出码 2（工具自身错误；区别于
/// source-unavailable 的空页——那是错误码，不是空数组）。
fn exit_with_error(e: StoreError, msg: &str) -> ! {
    eprintln!("{}", serde_json::to_string(&e.to_json(msg)).unwrap_or_default());
    std::process::exit(2);
}

// ── CLI 面 ──────────────────────────────────────────────────────

/// `sessions list`：填充 Codex 源 → filter + cursor 分页 → versioned list DTO。
/// `--host dsh`（Phase 1 不可读源）→ 类型化 `source-unavailable`，**不是空页**。
pub fn sessions_list(
    home: &Path,
    filter: &SessionFilter,
    page_size: usize,
    cursor_json: &Option<String>,
    json_out: bool,
) {
    // 显式请求 dsh 源 → 类型化 source-unavailable（zstd Phase 2 未接线）。
    if let Some(h) = &filter.host_kind {
        if h != "codex" {
            exit_with_error(
                StoreError::SourceUnavailable,
                &format!("host '{h}' is not readable yet: zstd decoding lands in R2a Phase 2 (codex is the only populated source)"),
            );
        }
    }
    let store = match SessionStore::codex(home) {
        Ok(s) => s,
        Err(e) => exit_with_error(e, "session store population failed"),
    };
    let cursor = match cursor_json {
        Some(c) => match serde_json::from_str::<Value>(c).ok().and_then(|v| PageCursor::from_json(&v)) {
            Some(c) => Some(c),
            None => {
                eprintln!("invalid --cursor JSON (want store_revision/filter_hash/last_key)");
                std::process::exit(2);
            }
        },
        None => None,
    };
    let page = match store.list(filter, cursor.as_ref(), page_size) {
        Ok(p) => p,
        Err(e) => exit_with_error(e, "list failed: cursor stale or filter changed"),
    };
    let dto = json!({
        "schema_version": CURRENT_CONTRACT_VERSION.to_string(),
        "engine_version": ENGINE_VERSION,
        "pricing_version": pricing_version(),
        "store_revision": page.store_revision,
        "generated_at": store.generated_at,
        "source_statuses": store.source_statuses,
        "page": page.to_json(),
    });
    let text = serde_json::to_string_pretty(&dto).unwrap_or_default();
    if json_out {
        println!("{text}");
    } else {
        print!("{}", render_list(&dto));
    }
}

/// `sessions read`：`--session-key <JSON>` 定位 + 可选 revision 校验 → 完整
/// versioned envelope。key 形状坏 → schema-mismatch；找不到 → not-found；
/// revision 不符 → stale-revision。
pub fn sessions_read(
    home: &Path,
    session_key_json: &str,
    revision: &Option<String>,
    json_out: bool,
) {
    let key = match serde_json::from_str::<Value>(session_key_json)
        .ok()
        .and_then(|v| SessionKey::from_json(&v))
    {
        Some(k) => k,
        None => exit_with_error(
            StoreError::SchemaMismatch,
            "invalid --session-key JSON (want host_kind/native_id/source_profile/machine_namespace)",
        ),
    };
    let store = match SessionStore::codex(home) {
        Ok(s) => s,
        Err(e) => exit_with_error(e, "session store population failed"),
    };
    match store.read(&key, revision.as_deref()) {
        Ok(envelope) => {
            let text = serde_json::to_string_pretty(&envelope).unwrap_or_default();
            if json_out {
                println!("{text}");
            } else {
                print!("{}", csa::render_codex_session(envelope.get("session").unwrap_or(&Value::Null)));
            }
        }
        Err(e) => exit_with_error(e, "read failed"),
    }
}

/// 人读的 list 表格（`--json` 之外）。字段与 `SessionSummary` 一致，别另起炉灶。
fn render_list(dto: &Value) -> String {
    let page = dto.get("page").unwrap_or(&Value::Null);
    let items = page.get("items").and_then(Value::as_array).cloned().unwrap_or_default();
    let mut out = String::new();
    out.push_str(&format!(
        "sessions: {} total | store_revision {} | schema {}\n",
        page.get("total").and_then(Value::as_u64).unwrap_or(0),
        page.get("store_revision").and_then(Value::as_u64).unwrap_or(0),
        dto.get("schema_version").and_then(Value::as_str).unwrap_or(""),
    ));
    for it in &items {
        let key = it.get("session_key").unwrap_or(&Value::Null);
        out.push_str(&format!(
            "{:<6} {:<16} {:<28} {:<12} {}\n",
            key.get("host_kind").and_then(Value::as_str).unwrap_or(""),
            key.get("native_id").and_then(Value::as_str).unwrap_or(""),
            it.get("title").and_then(Value::as_str).unwrap_or("(no title)"),
            it.get("date_span").and_then(|d| d.get("last")).and_then(Value::as_str).unwrap_or("-"),
            it.get("cost_usd").and_then(Value::as_f64).map(|c| format!("${c:.2}")).unwrap_or("-".to_string()),
        ));
    }
    if let Some(c) = page.get("next_cursor") {
        out.push_str(&format!(
            "next_cursor: {}\n",
            serde_json::to_string(c).unwrap_or_default()
        ));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 测试改 AGENT_VITALS_HOME（machine_namespace 写 machine.json 与 cache 都
    /// 落到 data_home 下）—— 进程级锁与 discovery/state 测试互斥，避免踩踏。
    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        crate::util::ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn tmp_case() -> PathBuf {
        let t = std::env::temp_dir().join(format!(
            "av-r2a-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&t);
        std::fs::create_dir_all(&t).unwrap();
        t
    }

    struct EnvGuard {
        prev_home: Option<String>,
        prev_av: Option<String>,
    }
    impl EnvGuard {
        fn set(home: &Path, av: &Path) -> Self {
            let prev_home = std::env::var("HOME").ok();
            let prev_av = std::env::var("AGENT_VITALS_HOME").ok();
            std::env::set_var("HOME", home);
            std::env::set_var("AGENT_VITALS_HOME", av);
            EnvGuard { prev_home, prev_av }
        }
    }
    impl Drop for EnvGuard {
        fn drop(&mut self) {
            match &self.prev_home {
                Some(p) => std::env::set_var("HOME", p),
                None => std::env::remove_var("HOME"),
            }
            match &self.prev_av {
                Some(p) => std::env::set_var("AGENT_VITALS_HOME", p),
                None => std::env::remove_var("AGENT_VITALS_HOME"),
            }
        }
    }

    /// 建 fake home：`home/.codex/sessions/<date>/rollout-*.jsonl`。把 fixtures/
    /// codex/cost 的三个 rollout 拷进去 → 3 个逻辑 session（session_id = 文件
    /// stem：rollout-sol / rollout-terra / rollout-unpriced）。
    fn fake_codex_home(t: &Path) -> PathBuf {
        let home = t.join("home");
        let live = home.join(".codex").join("sessions").join("2026").join("08");
        let arch = home.join(".codex").join("archived_sessions").join("2026").join("07");
        std::fs::create_dir_all(&live).unwrap();
        std::fs::create_dir_all(&arch).unwrap();
        let cost = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("fixtures").join("codex").join("cost");
        for name in ["rollout-sol.jsonl", "rollout-unpriced.jsonl"] {
            std::fs::copy(cost.join(name), live.join(name)).unwrap();
        }
        std::fs::copy(cost.join("rollout-terra.jsonl"), arch.join("rollout-terra.jsonl")).unwrap();
        home
    }

    /// §6.3-3：机器命名空间持久化契约。可重放派生（同 HOME → 同值）+ 备份可迁移
    /// （在 app 自有 config `data_home()/machine.json`，非 state 目录）。
    #[test]
    fn machine_namespace_is_replayable_and_at_app_config() {
        let _env = env_lock();
        let t = tmp_case();
        let av = t.join("av");
        let home = t.join("home");
        std::fs::create_dir_all(&home).unwrap();
        std::fs::create_dir_all(&av).unwrap();
        let _g = EnvGuard::set(&home, &av);
        std::env::set_var("AGENT_VITALS_HOME", &av);

        let a = takeover::machine_namespace();
        let b = takeover::machine_namespace();
        assert_eq!(a, b, "replayable: same HOME must yield the same namespace");
        assert_eq!(a.len(), 32, "16 random bytes → 32 hex chars");
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));

        // 落在 app 自有 config（data_home/machine.json），不在 state 目录里。
        let path = av.join("machine.json");
        assert!(path.is_file(), "machine.json must persist at app data root");
        let doc: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(doc["schema_version"], "1.0.0");
        assert_eq!(doc["machine_namespace"], a);
    }

    /// 源指纹：确定性 + 内容变化必变（截断 → 不等）。
    #[test]
    fn source_fingerprint_deterministic_and_content_sensitive() {
        let t = tmp_case();
        let p = t.join("f.jsonl");
        std::fs::write(&p, "hello world\n").unwrap();
        let f1 = fingerprint_file(&p).unwrap();
        let f2 = fingerprint_file(&p).unwrap();
        assert_eq!(f1, f2);
        std::fs::write(&p, "hello world!").unwrap(); // 截断 + 改末字节
        let f3 = fingerprint_file(&p).unwrap();
        assert_ne!(f1, f3);
    }

    /// e2e：fake Codex home → 填充 3 个逻辑 session（store_seq 按 native_id 序）。
    #[test]
    fn codex_populate_builds_deterministic_entries() {
        let _env = env_lock();
        let t = tmp_case();
        let home = fake_codex_home(&t);
        let av = t.join("av");
        std::fs::create_dir_all(&av).unwrap();
        let _g = EnvGuard::set(&home, &av);

        let store = SessionStore::codex(&home).expect("populate ok");
        // 3 个 session：rollout-sol / rollout-terra / rollout-unpriced
        assert_eq!(store.entries.len(), 3);
        // 稳定序按 native_id 升序：rollout-sol < rollout-terra < rollout-unpriced
        let ids: Vec<&str> = store.entries.iter().map(|e| e.key.native_id.as_str()).collect();
        assert_eq!(ids, vec!["rollout-sol", "rollout-terra", "rollout-unpriced"]);
        // store_seq = 排序序
        assert_eq!(store.entries[0].store_seq, 0);
        assert_eq!(store.entries[1].store_seq, 1);
        assert_eq!(store.entries[2].store_seq, 2);
        // host_kind 与 source_profile
        assert_eq!(store.entries[0].key.host_kind, "codex");
        // envelope 形状
        let env = &store.entries[0].envelope;
        assert_eq!(env["schema_version"], "1");
        assert_eq!(env["store_revision"], 0);
        assert_eq!(env["session"]["session_id"], "rollout-sol");
        assert_eq!(env["source_statuses"]["codex"]["status"], "ok");
        assert_eq!(env["source_statuses"]["dsh"]["status"], "unavailable");
        // list 返回同一批（按 filter 全量）
        let page = store.list(&SessionFilter::default(), None, 10).unwrap();
        assert_eq!(page.total, 3);
        assert_eq!(page.store_revision, 2);
    }

    /// cache 快路径：重建 → 写 cache → 删 cache → 重建，两次输出逐字节一致
    /// （稳定性钉死：同一源重建出同一 store，缓存只是 memo 不是另一份 truth）。
    /// 逐字节比较的对象是「按 store_seq 排序的 envelope 列表 + source_statuses
    /// + generated_at」——store 本身只是这个列表的内存态。
    fn store_bytes(s: &SessionStore) -> String {
        let mut envs: Vec<Value> = s
            .entries
            .iter()
            .map(|e| e.envelope.clone())
            .collect();
        envs.sort_by(|a, b| {
            a["store_revision"]
                .as_u64()
                .cmp(&b["store_revision"].as_u64())
        });
        // generated_at 是墙钟（构建时刻），不是源派生值 —— 重建必然是新时刻。
        // 逐字节一致承诺的是**源派生内容**，墙钟字段归一化掉。
        for env in &mut envs {
            if let Some(o) = env.as_object_mut() {
                o.insert("generated_at".into(), Value::Null);
            }
        }
        serde_json::to_string(&json!({
            "entries": envs,
            "source_statuses": s.source_statuses,
        }))
        .unwrap()
    }

    #[test]
    fn codex_populate_cache_delete_rebuild_is_identical() {
        let _env = env_lock();
        let t = tmp_case();
        let home = fake_codex_home(&t);
        let av = t.join("av");
        std::fs::create_dir_all(&av).unwrap();
        let _g = EnvGuard::set(&home, &av);

        let a = SessionStore::codex(&home).unwrap();
        // 第二次调用应命中 cache（指纹一致）—— 输出必须与重建完全一致。
        let b = SessionStore::codex(&home).unwrap();
        assert_eq!(
            store_bytes(&a),
            store_bytes(&b),
            "cache hit must be byte-identical to a fresh rebuild"
        );
        // cache 文件确实存在
        assert!(codex_cache_path().is_file());
        // 删 cache 重建 → 仍然一致（cache 只是可删 memo）。
        std::fs::remove_file(codex_cache_path()).unwrap();
        let c = SessionStore::codex(&home).unwrap();
        assert_eq!(store_bytes(&a), store_bytes(&c));
    }

    /// 源变化（新 rollout）→ 指纹不等 → 旧 cache 作废、全量重建（缓存不能把
    /// 新文件藏起来）。
    #[test]
    fn source_change_invalidates_cache() {
        let _env = env_lock();
        let t = tmp_case();
        let home = fake_codex_home(&t);
        let av = t.join("av");
        std::fs::create_dir_all(&av).unwrap();
        let _g = EnvGuard::set(&home, &av);

        let a = SessionStore::codex(&home).unwrap();
        assert_eq!(a.entries.len(), 3);
        // 新增一个 rollout（新 session rollout-new）。
        let live = home.join(".codex").join("sessions").join("2026").join("08");
        std::fs::copy(
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures").join("codex").join("legacy.jsonl"),
            live.join("rollout-new.jsonl"),
        )
        .unwrap();
        let b = SessionStore::codex(&home).unwrap();
        assert_eq!(b.entries.len(), 4);
    }

    /// `--host dsh` → 类型化 source-unavailable（错误码），不是空页。这层语义
    /// 在 CLI 面（sessions_list 直接拒绝不可读源）。
    #[test]
    fn dsh_host_requests_is_source_unavailable_not_empty() {
        let _env = env_lock();
        let t = tmp_case();
        let home = fake_codex_home(&t);
        let av = t.join("av");
        std::fs::create_dir_all(&av).unwrap();
        let _g = EnvGuard::set(&home, &av);

        let store = SessionStore::codex(&home).unwrap();
        let f = SessionFilter { host_kind: Some("dsh".into()), ..Default::default() };
        // core 层面 filter 只按宿主过滤，dsh 无条目 → 空页（honest 0）。
        let page = store.list(&f, None, 10).unwrap();
        assert_eq!(page.total, 0);
        // 但 source_statuses 明说 dsh 是 unavailable —— CLI 面对 --host dsh
        // 直接报 source-unavailable（sessions_list 里的显式分支）。
        assert_eq!(store.source_statuses["dsh"]["status"], "unavailable");
    }

    /// filter/cursor 的分页语义委托 core（core 已单测），这里补一个 CLI 面
    /// 的端到端：按 model 过滤 + 翻页。
    #[test]
    fn list_filter_and_cursor_e2e() {
        let _env = env_lock();
        let t = tmp_case();
        let home = fake_codex_home(&t);
        let av = t.join("av");
        std::fs::create_dir_all(&av).unwrap();
        let _g = EnvGuard::set(&home, &av);

        let store = SessionStore::codex(&home).unwrap();
        let f = SessionFilter { model: Some("gpt-5.6-sol".into()), ..Default::default() };
        let p0 = store.list(&f, None, 1).unwrap();
        assert_eq!(p0.total, 1); // 只有 rollout-sol 是 gpt-5.6-sol
        assert_eq!(p0.items[0]["session_key"]["native_id"], "rollout-sol");
        assert!(p0.next_cursor.is_none());
    }
}
