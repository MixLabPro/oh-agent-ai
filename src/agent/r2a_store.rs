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

use agent_vitals_core::findings::{FindingRef, FindingSession, rollup_findings};
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

fn dsh_cache_path() -> PathBuf {
    cache_dir().join("dsh-sessions.json")
}

/// Codex 源指纹（当前源文件的指纹列表，按 `codex_rollout_files` 的全局路径序）。
/// 文件名（session 分组）不是指纹的一部分——路径就是源文件的身份，指纹看内容。
fn codex_source_fingerprints(home: &Path) -> Vec<(String, String)> {
    crate::agent::codex_session::codex_rollout_files(home)
        .iter()
        .map(|p| (p.to_string_lossy().to_string(), fingerprint_file(p).unwrap_or_default()))
        .collect()
}

/// DSH 源指纹：`<home>/.dsh/sessions/**/session.jsonl[.zstd]` 的文件指纹列表，
/// 按 `dsh_session_files` 的全局路径序。DSH_HOME env 不在 R2a 的契约里——`home`
/// 参数（= HOME）是权威根（`home/.codex`、`home/.dsh` 同一条纪律）；`discovery::dsh_home()`
/// 那套 env 覆盖只服务 tick/oneline 路径，两条路径的根在 DSH_HOME 未设时本就一致。
fn dsh_source_fingerprints(home: &Path) -> Vec<(String, String)> {
    crate::agent::discovery::dsh_session_files(&home.join(".dsh"))
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

/// DSH 源的 summary 派生列（§2.5 / §4.4）。DSH 的 `session` 载荷是 `behavior --json`
/// 的 20 键形状（§2.4），没有 Codex 形状的 `date_span`/`files`/`cost_report`/`audit`
/// 字段——派生列全部从既有键里读，**不发明新字段名**：
///
///   · title：workspace.json 查找，population 时以 appended `title` 键并入载荷
///     （标题不在 behavior 载荷里，但必须随 payload 存进 envelope 才能在缓存往返后
///     重新派生出来——复用既有 `title` 字段名，见 `SessionStore::dsh`）；
///   · model = 最后一次 usage 请求（`requests[-1]`）的模型；
///   · date_span = `requests[].time`（epoch 毫秒）的最小/最大值 → UTC 日期
///     （`civil_from_unix_secs`，offset 0 = UTC）；
///   · files = 1（DSH 一个日志文件 = 一个会话）；
///   · cost_usd = None（`behavior` 的 `cost` 是 CNY 币种；`SessionSummary::cost_usd`
///     是 USD 字段，诚实缺失，绝不把人民币当美元填）；
///   · tokens_total = `usage.by_model` 每模型 **4 个非 peak 桶**之和（peak 桶是
///     「这一天峰值」的另一视角，不是这天的用量）；
///   · findings_total = `findings` 数组长度。
///
/// `session_revision`（DSH = 最大 seq）**不在 payload 里**，由 `SessionStore::dsh`
/// 从原始文本单独算、作为 envelope 顶层字段存——缓存往返直接读 envelope 字段，不
/// 走这里。
fn dsh_extract_summary(payload: &Value) -> Summary {
    let requests = payload.get("requests").and_then(Value::as_array);
    let model = requests
        .and_then(|a| a.last())
        .and_then(|r| r.get("model"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    let mut min_ms: Option<i64> = None;
    let mut max_ms: Option<i64> = None;
    if let Some(reqs) = requests {
        for r in reqs {
            if let Some(t) = r.get("time").and_then(Value::as_i64) {
                min_ms = Some(min_ms.map_or(t, |m: i64| m.min(t)));
                max_ms = Some(max_ms.map_or(t, |m: i64| m.max(t)));
            }
        }
    }
    let utc_date = |ms: i64| -> String {
        let (y, m, d) = crate::agent::codex_cost::civil_from_unix_secs(ms / 1000, 0);
        format!("{y:04}-{m:02}-{d:02}")
    };
    let date_first = min_ms.map(utc_date);
    let date_last = max_ms.map(utc_date);
    let tokens_total = payload
        .pointer("/usage/by_model")
        .and_then(Value::as_object)
        .map(|m| {
            m.values()
                .map(|b| {
                    let bucket = |k: &str| b.get(k).and_then(Value::as_i64).unwrap_or(0);
                    bucket("uncached_input_tokens")
                        + bucket("output_tokens")
                        + bucket("cache_read_tokens")
                        + bucket("cache_write_tokens")
                })
                .sum()
        });
    let findings_total = payload
        .get("findings")
        .and_then(Value::as_array)
        .map(|a| a.len())
        .unwrap_or(0);
    Summary {
        title: payload.get("title").and_then(Value::as_str).map(str::to_owned),
        model,
        date_first,
        date_last,
        files: 1,
        cost_usd: None,
        tokens_total,
        findings_total,
    }
}

/// 按 host_kind 分发 summary 派生（DSH 形状 vs Codex 形状）。
fn summary_for(key: &SessionKey, payload: &Value) -> Summary {
    if key.host_kind == "dsh" {
        dsh_extract_summary(payload)
    } else {
        extract_summary(payload)
    }
}

/// 「哪个字段带 findings」的**单一权威**（锁步教训：同一谓词只写一处）。DSH 载荷是
/// behavior 20 键形状 → `findings`；Codex 载荷 → `audit.findings`（与
/// `extract_summary` 的 `/audit/summary/findings_total` 同源）。两者皆无 → 空 vec
/// （诚实零命中，不是错误）。字段名/数组形状由 `behavior::make_finding` 定，这里只
/// 挑出 `core::findings::FindingRef` 需要的字段子集——缺失字段诚实 None，不编造。
pub fn findings_for(key: &SessionKey, payload: &Value) -> Vec<FindingRef> {
    let arr = if key.host_kind == "dsh" {
        payload.get("findings").and_then(Value::as_array)
    } else {
        payload.pointer("/audit/findings").and_then(Value::as_array)
    };
    let Some(arr) = arr else { return Vec::new() };
    arr.iter()
        .map(|f| FindingRef {
            rule: f.get("rule").and_then(Value::as_str).unwrap_or("").to_string(),
            severity: f
                .get("severity")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            category: f
                .get("category")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            tool_name: f.get("tool_name").and_then(Value::as_str).map(str::to_owned),
            evidence: f.get("evidence").and_then(Value::as_str).map(str::to_owned),
            time: f.get("time").and_then(Value::as_i64),
            seq: f.get("seq").and_then(Value::as_u64),
        })
        .collect()
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
/// 根存在性（复用 `codex_session_roots_report`）。
///
/// **只报自己构建的源**：单源 store（`--host-kind codex`）的 envelope 只说自己，
/// 不替没构建的 DSH 猜一个状态——Phase 1 把 DSH 硬报成 `unavailable` 是 zstd 未接线
/// 时的过渡谎言，zstd 落地后那句「读不了」不再成立，而一个没扫描的源既不是 ok 也
/// 不是 unavailable，是「本次没构建」。要看到两个源的真实状态，走 `SessionStore::all`
/// （no-filter），它合并两边的状态。
fn codex_source_statuses(home: &Path, n_sessions: usize) -> Value {
    let roots = crate::agent::codex_session::codex_session_roots_report(home);
    json!({
        "codex": {
            "status": "ok",
            "sessions": n_sessions,
            "roots": roots.get("roots").cloned().unwrap_or_else(|| Value::Array(vec![])),
        },
    })
}

/// DSH 源状态。三态（§5.2 / §4.3 诚实降级）：
///
///   · `files` 为空（sessions 根缺席或没有会话文件）→ `ok`，sessions 0 —— 诚实零，
///     **不是** unavailable（「没有 DSH」和「有 DSH 但读不了」是两回事）；
///   · 全部文件成功构建 → `ok`，sessions = built；
///   · 部分构建（built > 0 < files）→ `ok` + `degraded` 逐文件透传（§4.3：单个文件
///     降级不得当 0 条真数据）；
///   · 文件在但一个都读不了（built == 0）→ `unavailable` —— 源真的不可读，CLI 面对
///     `--host-kind dsh` 报 source-unavailable 错误码，**不是空页**（§3.3）。
///
/// `roots` = `dsh_session_roots_report`（sessions + storages 两个根的存在性报告）。
fn dsh_source_statuses(home: &Path, files: &[PathBuf], degraded: &[(String, String)]) -> Value {
    let roots = crate::agent::discovery::dsh_session_roots_report(&home.join(".dsh"));
    let built = files.len() - degraded.len();
    let status = if files.is_empty() || built > 0 {
        "ok"
    } else {
        "unavailable"
    };
    let degraded_val = if degraded.is_empty() {
        Value::Null
    } else {
        Value::Array(
            degraded
                .iter()
                .map(|(p, r)| json!({ "path": p, "reason": r }))
                .collect(),
        )
    };
    json!({
        "dsh": {
            "status": status,
            "sessions": built,
            "roots": roots.get("roots").cloned().unwrap_or_else(|| Value::Array(vec![])),
            "degraded": degraded_val,
        },
    })
}

/// 合并两个单源 statuses（codex + dsh）成 `all` store 的完整 statuses。键序稳定：
/// codex 在前、dsh 在后（JSON 键序是字节一致的一部分）。
fn merge_statuses(a: &Value, b: &Value) -> Value {
    let mut merged = a.clone();
    if let (Some(m), Some(b_obj)) = (merged.as_object_mut(), b.as_object()) {
        for (k, v) in b_obj {
            m.insert(k.clone(), v.clone());
        }
    }
    merged
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
        let mut raw: Vec<PendingEntry> = Vec::new();
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
            raw.push(PendingEntry {
                key: SessionKey::new("codex", sid, &source_profile, &ns),
                payload,
                // Codex 的 revision = 载荷 date_last，从 summary 派生即可。
                revision: None,
            });
        }
        raw.sort_by(|a, b| sort_key(&a.key).cmp(&sort_key(&b.key)));

        let entries = build_entries(&raw, &generated_at, &codex_source_statuses(home, raw.len()));
        let store = SessionStore {
            entries,
            source_statuses: codex_source_statuses(home, raw.len()),
            generated_at,
        };
        write_cache(&cache_path, &store, &fingerprints);
        Ok(store)
    }

    /// 从 DSH 源填充（§5.2，zstd 落地后）。`<home>/.dsh/sessions/**/session.jsonl[.zstd]`
    /// 逐文件：解压 → 头行（id + cwd）→ `behavior::audit_payload`（复用 20 键载荷）→
    /// workspace.json 查标题 → PendingEntry。读不了的（解压失败/畸形/无 id）逐文件
    /// 记进 `degraded`，**绝不数成 0 条真数据**（§4.3）。
    ///
    /// 标题不在 behavior 载荷里（来自 workspace.json），但 summary 派生列必须能从
    /// envelope 的 `session` 载荷重算（缓存往返，`entry_from_envelope`）——所以标题
    /// 以 **appended `title` 键** 并入载荷（复用既有字段名，§2.4 不发明新字段名；
    /// `behavior --json` 是另一条 CLI 面，不受影响）。
    pub fn dsh(home: &Path) -> Result<SessionStore, StoreError> {
        let ns = takeover::machine_namespace();
        let generated_at = now_iso_utc();
        let fingerprints = dsh_source_fingerprints(home);
        let cache_path = dsh_cache_path();

        if let Some(cached) = read_cache(&cache_path) {
            if cache_is_current(&cached, &fingerprints) {
                if let Some(store) = cache_to_store(&cached) {
                    return Ok(store);
                }
            }
        }

        let dsh_root = home.join(".dsh");
        let files = crate::agent::discovery::dsh_session_files(&dsh_root);
        let ws = crate::agent::discovery::read_workspace_index(&dsh_root);

        let mut raw: Vec<PendingEntry> = Vec::new();
        let mut degraded: Vec<(String, String)> = Vec::new();
        for path in &files {
            let path_str = path.display().to_string();
            let text = match crate::dsh::read_session_text(path) {
                Ok(t) => t,
                Err(code) => {
                    degraded.push((path_str, code.to_string()));
                    continue;
                }
            };
            // 头行有效性由 parse_session_log 验（type=="session" && version==0），
            // 这里只抽 id + cwd；parse 已通过但缺 id → 无法建键 → missing-header。
            if crate::dsh::parse_session_log(&text)
                .get("degraded")
                .and_then(Value::as_str)
                .is_some()
            {
                degraded.push((path_str, "missing-header".to_string()));
                continue;
            }
            let Some((id, cwd)) = dsh_header(&text) else {
                degraded.push((path_str, "missing-header".to_string()));
                continue;
            };
            let Some(mut payload) = crate::agent::behavior::audit_payload(path) else {
                // 读之间文件被截断/替换（parse 干净但 audit 重建失败）→ 文件级降级。
                degraded.push((path_str, "file-missing".to_string()));
                continue;
            };
            if let Some((_, title)) = ws.by_session.get(&id) {
                if let Some(o) = payload.as_object_mut() {
                    o.insert("title".to_string(), Value::String(title.clone()));
                }
            }
            raw.push(PendingEntry {
                key: SessionKey::new("dsh", &id, &dsh_source_profile(cwd.as_deref()), &ns),
                payload,
                revision: dsh_session_revision(&text),
            });
        }
        raw.sort_by(|a, b| sort_key(&a.key).cmp(&sort_key(&b.key)));

        let statuses = dsh_source_statuses(home, &files, &degraded);
        let entries = build_entries(&raw, &generated_at, &statuses);
        let store = SessionStore {
            entries,
            source_statuses: statuses,
            generated_at,
        };
        write_cache(&cache_path, &store, &fingerprints);
        Ok(store)
    }

    /// 合并 codex + dsh 两个单源 store（`sessions list` no-filter = 全部源）。
    /// **没有自己的合并 cache**——每次把两个子 store 合并（各子 store 走自己的 cache
    /// 快路径），`generated_at` 取两边的 max（ISO-UTC 同格式，字典序 = 时间序，且都
    /// 冻结在各自的 cache 里，跨进程/跨实现稳定）。`source_statuses` 合并成
    /// `{codex, dsh}` 完整视图（§2.1 的 envelope 形状）。
    pub fn all(home: &Path) -> Result<SessionStore, StoreError> {
        let codex_store = SessionStore::codex(home)?;
        let dsh_store = SessionStore::dsh(home)?;
        let mut entries = codex_store.entries.clone();
        entries.extend(dsh_store.entries.clone());
        // 全局稳定序：host_kind "codex" < "dsh"，concat 已序，仍防御性重排一遍
        // （与 cache_to_store 的恢复序同一条纪律）。
        entries.sort_by(|a, b| sort_key(&a.key).cmp(&sort_key(&b.key)));
        Ok(SessionStore {
            entries,
            source_statuses: merge_statuses(&codex_store.source_statuses, &dsh_store.source_statuses),
            generated_at: codex_store.generated_at.clone().max(dsh_store.generated_at.clone()),
        })
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

/// 待构建条目：key + payload + **预计算的 session_revision**。
/// revision 与 payload 分开：Codex 的 revision = payload 的 date_last（可从载荷
/// 派生），DSH 的 revision = 原始文本最大 seq（**不在** payload 里，缓存往返不能靠
/// 载荷重算，必须先算好存进 envelope 顶层字段，`entry_from_envelope` 再原样读回）。
struct PendingEntry {
    key: SessionKey,
    payload: Value,
    revision: Option<String>,
}

/// 把 (key, payload, revision) 按稳定序构建成 `SessionReportEntry`（envelope 内
/// `store_revision` = store_seq = 排序序，保证确定性）。
fn build_entries(raw: &[PendingEntry], generated_at: &str, source_statuses: &Value) -> Vec<SessionReportEntry> {
    let engine = ENGINE_VERSION;
    let pricing = pricing_version();
    raw.iter()
        .enumerate()
        .map(|(seq, p)| {
            let s = summary_for(&p.key, &p.payload);
            let session_revision = p.revision.clone().or_else(|| s.date_last.clone());
            let envelope = build_envelope(
                engine,
                &pricing,
                seq as u64,
                generated_at,
                source_statuses.clone(),
                &p.key,
                session_revision.as_deref(),
                p.payload.clone(),
            );
            SessionReportEntry {
                key: p.key.clone(),
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

/// 从**已解压文本**读会话头：`id` + `cwd`。`id` 缺失 → None（无法建 SessionKey）。
/// 只读头行，不重复解压——调用方已用 `read_session_text` 解过一次。
fn dsh_header(text: &str) -> Option<(String, Option<String>)> {
    let line = text.lines().find(|l| !l.trim().is_empty())?;
    let v: Value = serde_json::from_str(line.trim()).ok()?;
    let id = v.get("id").and_then(Value::as_str)?;
    let cwd = v.get("cwd").and_then(Value::as_str).map(str::to_owned);
    Some((id.to_string(), cwd))
}

/// DSH 的 SessionRevision（§4.4）= 最大 `seq`（seq 单调不减，样本首 0 / 末 16201）。
/// 从头到整个文本扫（不是只看末行）：fork 边界事件的 seq 是 null，且「单调不减」
/// 是实测属性不是语言保证，最大才算稳。没有任何 seq → None（诚实缺失）。
fn dsh_session_revision(text: &str) -> Option<String> {
    let mut max: i64 = -1;
    for line in text.lines() {
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<Value>(line.trim()) {
            if let Some(seq) = v.get("seq").and_then(Value::as_i64) {
                if seq > max {
                    max = seq;
                }
            }
        }
    }
    (max >= 0).then(|| max.to_string())
}

/// DSH 的 source_profile（§1.3）= 会话头 `cwd` 清洗后的项目路径：
/// `--{cwd.replace('/', "-")}--`。cwd 缺失 → 空串（诚实缺失；native_id 全局唯一，
/// 空 source_profile 不会撞键）。
fn dsh_source_profile(cwd: Option<&str>) -> String {
    cwd.map(|c| format!("--{}--", c.replace('/', "-")))
        .unwrap_or_default()
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
    // DSH 载荷是 behavior 20 键形状，派生列走 dsh_extract_summary（含缓存往返必需
    // 的 appended `title` 键）；Codex 走 extract_summary。
    let s = summary_for(&key, payload);
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

/// `sessions list`：按 host-kind 分发源 → filter + cursor 分页 → versioned list DTO。
///
///   · `--host-kind codex` → 只填充 codex 源；
///   · `--host-kind dsh` → 只填充 dsh 源；**文件在但一个都读不了** → 类型化
///     `source-unavailable`（错误码，不是空页，§4.3/§3.3）；「根本没有 DSH」是诚实零
///     → 空页；
///   · no-filter → `SessionStore::all`（两源合并，`source_statuses` 给完整视图）。
pub fn sessions_list(
    home: &Path,
    filter: &SessionFilter,
    page_size: usize,
    cursor_json: &Option<String>,
    json_out: bool,
) {
    let store = match filter.host_kind.as_deref() {
        Some("codex") => match SessionStore::codex(home) {
            Ok(s) => s,
            Err(e) => exit_with_error(e, "session store population failed"),
        },
        Some("dsh") => {
            let s = match SessionStore::dsh(home) {
                Ok(s) => s,
                Err(e) => exit_with_error(e, "session store population failed"),
            };
            if s.source_statuses
                .get("dsh")
                .and_then(|d| d.get("status"))
                .and_then(Value::as_str)
                == Some("unavailable")
            {
                exit_with_error(
                    StoreError::SourceUnavailable,
                    "dsh source unavailable: session files exist but none are decodable (§4.3)",
                );
            }
            s
        }
        Some(other) => exit_with_error(
            StoreError::SourceUnavailable,
            &format!("unknown host kind '{other}'"),
        ),
        None => match SessionStore::all(home) {
            Ok(s) => s,
            Err(e) => exit_with_error(e, "session store population failed"),
        },
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
    // 按 key 的 host_kind 读对应源：读 codex key 不用为 dsh 付扫描钱，反之亦然。
    let store = match key.host_kind.as_str() {
        "codex" => match SessionStore::codex(home) {
            Ok(s) => s,
            Err(e) => exit_with_error(e, "session store population failed"),
        },
        "dsh" => match SessionStore::dsh(home) {
            Ok(s) => s,
            Err(e) => exit_with_error(e, "session store population failed"),
        },
        other => exit_with_error(
            StoreError::SourceUnavailable,
            &format!("unknown host kind '{other}'"),
        ),
    };
    match store.read(&key, revision.as_deref()) {
        Ok(envelope) => {
            let text = serde_json::to_string_pretty(&envelope).unwrap_or_default();
            if json_out || key.host_kind == "dsh" {
                // dsh 没有 CLI 的 HTML 渲染器（那是 Tauri 审计 tab 的活）——
                // 非 --json 的 dsh read 直接给 pretty JSON，不走 codex 渲染器。
                println!("{text}");
            } else {
                print!("{}", csa::render_codex_session(envelope.get("session").unwrap_or(&Value::Null)));
            }
        }
        Err(e) => exit_with_error(e, "read failed"),
    }
}

/// `sessions findings`：跨会话 findings 汇总（workbench「Findings」页 + CLI）。
///
/// 纯聚合在 core（`findings::rollup_findings`），这里只做 I/O：加载全源 store
/// （复用 `SessionStore::all`，各源走自己的 cache 快路径）→ 从缓存 envelope 的
/// `session` 载荷抽 findings（`findings_for`，唯一权威字段谓词）→ 组装 versioned
/// DTO。**不重跑 behavior 规则**——findings 在 population 时已算好存进 envelope，
/// 这里只聚合既成事实。错误路径与 `sessions list` 同款 `exit_with_error`。
pub fn sessions_findings(home: &Path, json_out: bool) {
    let store = match SessionStore::all(home) {
        Ok(s) => s,
        Err(e) => exit_with_error(e, "session store population failed"),
    };
    // findings_for 是 owned 返回，先全抽出来再借给 FindingSession（生命周期）。
    let extracted: Vec<Vec<FindingRef>> = store
        .entries
        .iter()
        .map(|e| findings_for(&e.key, e.envelope.get("session").unwrap_or(&Value::Null)))
        .collect();
    let sessions: Vec<FindingSession> = store
        .entries
        .iter()
        .zip(extracted.iter())
        .map(|(e, findings)| FindingSession {
            key: &e.key,
            title: e.title.as_deref(),
            model: e.model.as_deref(),
            store_revision: e.store_seq,
            findings,
        })
        .collect();
    let rollup = rollup_findings(&sessions);
    let dto = rollup.to_json(&pricing_version(), &store.generated_at);
    let text = serde_json::to_string_pretty(&dto).unwrap_or_default();
    if json_out {
        println!("{text}");
    } else {
        print!("{}", render_findings(&dto));
    }
}

/// 人读的 findings 表格（`--json` 之外）。只给 totals + 规则级聚合（明细行太多，
/// 人要的是「哪条规则、多危险、命中多少」）。字段与 DTO 的 `totals`/`rules` 一致。
fn render_findings(dto: &Value) -> String {
    let t = dto.get("totals").unwrap_or(&Value::Null);
    let mut out = String::new();
    out.push_str(&format!(
        "findings: {} (critical {} / warning {} / info {} / other {}) | sessions with findings {}/{} | store_revision {}\n",
        t.get("findings").and_then(Value::as_u64).unwrap_or(0),
        t.get("critical").and_then(Value::as_u64).unwrap_or(0),
        t.get("warning").and_then(Value::as_u64).unwrap_or(0),
        t.get("info").and_then(Value::as_u64).unwrap_or(0),
        t.get("other").and_then(Value::as_u64).unwrap_or(0),
        t.get("sessions").and_then(Value::as_u64).unwrap_or(0),
        t.get("sessions_total").and_then(Value::as_u64).unwrap_or(0),
        dto.get("store_revision").and_then(Value::as_u64).unwrap_or(0),
    ));
    for r in dto.get("rules").and_then(Value::as_array).into_iter().flatten() {
        out.push_str(&format!(
            "  {:<6} {:<9} {:<24} hits {:<5} sessions {}\n",
            r.get("rule").and_then(Value::as_str).unwrap_or(""),
            r.get("severity").and_then(Value::as_str).unwrap_or(""),
            r.get("category").and_then(Value::as_str).unwrap_or(""),
            r.get("hits").and_then(Value::as_u64).unwrap_or(0),
            r.get("sessions").and_then(Value::as_u64).unwrap_or(0),
        ));
    }
    out
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

    /// `findings_for`：唯一权威字段谓词，DSH 取 `findings`、Codex 取 `audit.findings`
    /// （与 `extract_summary` 的 `/audit/summary/findings_total` 同源）。缺失字段 →
    /// None，两者皆无 → 空 vec。这是「哪个字段带 findings」只有一处的钉死——改这里
    /// 就改全链，不许在别处再猜一次字段名。
    #[test]
    fn findings_for_reads_the_right_field_per_host() {
        let dsh_key = SessionKey::new("dsh", "d1", "p", "m");
        let codex_key = SessionKey::new("codex", "c1", "p", "m");
        let dsh_payload = json!({
            "findings": [
                {"rule": "SV601", "severity": "critical", "category": "shell",
                 "tool_name": "bash", "evidence": "rm -rf /", "time": 100, "seq": 1}
            ],
            "usage": {"by_model": {}}
        });
        let codex_payload = json!({
            "audit": {
                "summary": {"findings_total": 1},
                "findings": [
                    {"rule": "SV610", "severity": "warning", "category": "approval",
                     "tool_name": null, "evidence": "danger-full-access", "seq": 2}
                ]
            }
        });
        let d = findings_for(&dsh_key, &dsh_payload);
        assert_eq!(d.len(), 1);
        assert_eq!(d[0].rule, "SV601");
        assert_eq!(d[0].severity, "critical");
        assert_eq!(d[0].tool_name.as_deref(), Some("bash"));
        assert_eq!(d[0].time, Some(100));

        let c = findings_for(&codex_key, &codex_payload);
        assert_eq!(c.len(), 1);
        assert_eq!(c[0].rule, "SV610");
        assert_eq!(c[0].tool_name, None); // codex 的 tool_name 多为 null → 诚实 None
        assert_eq!(c[0].time, None);

        // 交叉取错字段 → 空（DSH 载荷里没有 audit，Codex 载荷里没有顶层 findings）
        assert!(findings_for(&dsh_key, &codex_payload).is_empty());
        assert!(findings_for(&codex_key, &dsh_payload).is_empty());
        // 完全没有 → 空 vec，不是错误
        assert!(findings_for(&dsh_key, &json!({"usage": {}})).is_empty());
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

    /// 建 fake DSH home：`home/.dsh/sessions/<proj>/<agentId>/session.jsonl`（裸
    /// jsonl，拷自 fixtures/dsh/behavior.jsonl，header id=sess-behavior-0001、
    /// cwd=/Users/alice/projects/demo）+ `storages/workspace.json` 标题索引。目录名
    /// `agent-1` 故意与 header id 不同——native id 必须以头行为准（§1.3/§4.5）。
    fn fake_dsh_home(t: &Path) -> PathBuf {
        let home = t.join("home");
        fake_dsh_under(&home);
        home
    }

    /// 在既有 home 下补一个 DSH 会话 + workspace.json（供 both-home 合并测试复用）。
    fn fake_dsh_under(home: &Path) {
        let dir = home
            .join(".dsh")
            .join("sessions")
            .join("--Users-alice-projects-demo--")
            .join("agent-1");
        std::fs::create_dir_all(&dir).unwrap();
        let src = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("fixtures").join("dsh").join("behavior.jsonl");
        std::fs::copy(&src, dir.join("session.jsonl")).unwrap();
        let storages = home.join(".dsh").join("storages");
        std::fs::create_dir_all(&storages).unwrap();
        std::fs::write(
            storages.join("workspace.json"),
            r#"{"global":{"archivedSessionIds":[]},"tables":{"workspaces":{"w1":{"path":"/Users/alice/projects/demo","title":"demo project","sessionIds":["sess-behavior-0001"]}}}}"#,
        )
        .unwrap();
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
        // 单源 store 只说自己构建的源——codex store 不替没构建的 DSH 猜状态（Phase 1
        // 的 dsh=unavailable 硬编码是 zstd 未接线时的过渡谎言，已随 §6.3-1/2 移除）。
        assert!(
            env["source_statuses"].get("dsh").is_none(),
            "a codex-only store must not claim a dsh status it did not build"
        );
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

    /// 「没有 DSH」是诚实零：sessions 根缺席 → 0 条目 + status ok/0，**不是**
    /// unavailable。unavailable 只留给「文件在但一个都读不了」（下一条用例）。
    #[test]
    fn dsh_populate_absent_home_is_ok_zero() {
        let _env = env_lock();
        let t = tmp_case();
        let home = t.join("home");
        std::fs::create_dir_all(&home).unwrap();
        let av = t.join("av");
        std::fs::create_dir_all(&av).unwrap();
        let _g = EnvGuard::set(&home, &av);

        let store = SessionStore::dsh(&home).expect("populate ok");
        assert_eq!(store.entries.len(), 0);
        assert_eq!(store.source_statuses["dsh"]["status"], "ok");
        assert_eq!(store.source_statuses["dsh"]["sessions"], 0);
        assert!(store.source_statuses["dsh"]["degraded"].is_null());
        assert!(dsh_cache_path().is_file(), "0 sessions is still a memo");
    }

    /// fake DSH home → 1 个逻辑会话：native_id = 会话头 id（不是目录名）、
    /// source_profile = 头 cwd 清洗、title = workspace.json、model/date_span/
    /// tokens_total/findings_total 从 behavior 20 键载荷派生、session_revision =
    /// 最大 seq、cost_usd 诚实 null（behavior cost 是 CNY）。
    #[test]
    fn dsh_populate_builds_entries_from_fake_home() {
        let _env = env_lock();
        let t = tmp_case();
        let home = fake_dsh_home(&t);
        let av = t.join("av");
        std::fs::create_dir_all(&av).unwrap();
        let _g = EnvGuard::set(&home, &av);

        let store = SessionStore::dsh(&home).expect("populate ok");
        assert_eq!(store.entries.len(), 1);
        let e = &store.entries[0];
        assert_eq!(e.key.host_kind, "dsh");
        assert_eq!(e.key.native_id, "sess-behavior-0001", "native id = header id, not dir name");
        assert_eq!(e.key.source_profile, "---Users-alice-projects-demo--");
        assert_eq!(e.title.as_deref(), Some("demo project"), "title from workspace.json");
        assert_eq!(e.model.as_deref(), Some("deepseek/deepseek-v4-pro-0813"));
        assert_eq!(e.date_first.as_deref(), Some("2025-06-15"));
        assert_eq!(e.date_last.as_deref(), Some("2025-06-15"));
        assert_eq!(e.files, 1);
        assert!(e.cost_usd.is_none(), "CNY cost must not masquerade as cost_usd");
        assert_eq!(e.tokens_total, Some(1707000), "sum of 4 non-peak buckets per model");
        assert_eq!(e.findings_total, 34);
        assert_eq!(e.session_revision.as_deref(), Some("135"), "revision = max seq");
        let env = &e.envelope;
        assert_eq!(env["schema_version"], "1");
        assert_eq!(env["session_key"]["host_kind"], "dsh");
        assert!(env["session"].get("title").is_some(), "title survives as appended payload key");
        assert!(env["session"].get("usage").is_some());
        assert_eq!(env["source_statuses"]["dsh"]["status"], "ok");
        assert_eq!(env["source_statuses"]["dsh"]["sessions"], 1);
    }

    /// dsh cache 快路径：删除 cache 重建 → 源派生内容逐字节一致（含 appended
    /// `title` 键——标题必须经缓存往返存活，否则 list 的 title 列会消失）。
    #[test]
    fn dsh_populate_cache_delete_rebuild_is_identical() {
        let _env = env_lock();
        let t = tmp_case();
        let home = fake_dsh_home(&t);
        let av = t.join("av");
        std::fs::create_dir_all(&av).unwrap();
        let _g = EnvGuard::set(&home, &av);

        let a = SessionStore::dsh(&home).unwrap();
        let b = SessionStore::dsh(&home).unwrap();
        assert_eq!(store_bytes(&a), store_bytes(&b), "cache hit must be byte-identical");
        assert!(dsh_cache_path().is_file());
        std::fs::remove_file(dsh_cache_path()).unwrap();
        let c = SessionStore::dsh(&home).unwrap();
        assert_eq!(store_bytes(&a), store_bytes(&c), "cache delete + rebuild identical");
    }

    /// 文件在但一个都读不了 → 源 `unavailable`（CLI 面对 `--host-kind dsh` 报
    /// source-unavailable 错误码，不是空页，§3.3/§4.3）。损坏的 `.zstd` → 解压失败
    /// → 逐文件 degraded 透传。
    #[test]
    fn dsh_populate_all_degraded_is_unavailable() {
        let _env = env_lock();
        let t = tmp_case();
        let home = t.join("home");
        let dir = home.join(".dsh").join("sessions").join("--proj--").join("agent-bad");
        std::fs::create_dir_all(&dir).unwrap();
        // 只有 zstd 魔数、没有完整帧 → decode_zstd_multi_frame 解不出。
        std::fs::write(dir.join("session.jsonl.zstd"), b"\x28\xb5\x2f\xfd\xff").unwrap();
        let av = t.join("av");
        std::fs::create_dir_all(&av).unwrap();
        let _g = EnvGuard::set(&home, &av);

        let store = SessionStore::dsh(&home).expect("populate ok");
        assert_eq!(store.entries.len(), 0);
        assert_eq!(store.source_statuses["dsh"]["status"], "unavailable");
        assert_eq!(store.source_statuses["dsh"]["sessions"], 0);
        let degraded = store.source_statuses["dsh"]["degraded"].as_array().unwrap();
        assert_eq!(degraded.len(), 1);
        assert_eq!(degraded[0]["reason"], "zstd-decode-error");
    }

    /// no-filter = 两源合并：3 codex + 1 dsh = 4，稳定序 codex 全部在前；完整
    /// `source_statuses`（codex + dsh）；generated_at = 两源 max。
    #[test]
    fn dsh_all_merges_codex_and_dsh() {
        let _env = env_lock();
        let t = tmp_case();
        let home = fake_codex_home(&t);
        fake_dsh_under(&home);
        let av = t.join("av");
        std::fs::create_dir_all(&av).unwrap();
        let _g = EnvGuard::set(&home, &av);

        let store = SessionStore::all(&home).expect("populate ok");
        assert_eq!(store.entries.len(), 4);
        let hosts: Vec<&str> = store.entries.iter().map(|e| e.key.host_kind.as_str()).collect();
        assert_eq!(hosts, vec!["codex", "codex", "codex", "dsh"]);
        assert_eq!(store.entries[3].key.native_id, "sess-behavior-0001");
        assert_eq!(store.source_statuses["codex"]["status"], "ok");
        assert_eq!(store.source_statuses["dsh"]["status"], "ok");
        assert!(store.generated_at >= SessionStore::codex(&home).unwrap().generated_at);
        let page = store.list(&SessionFilter::default(), None, 10).unwrap();
        assert_eq!(page.total, 4);
        // dsh 条目的 summary 列经合并 store 存活（title 列）。
        let dsh_it = page.items.last().unwrap();
        assert_eq!(dsh_it["title"], "demo project");
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
