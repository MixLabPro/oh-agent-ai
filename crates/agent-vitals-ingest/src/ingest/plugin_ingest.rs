//! 插件宿主摄入编排 + Candidate → UsageFact 喉咙（HOST_MANIFEST_DSL_SPEC
//! §5-§6、§9.2）。
//!
//! 职责边界：`agent-vitals-hosts::generic` 产「候选行」（recipe 三态），
//! 本模块把候选行组装进 `build_usage_fact` 的字段 map（身份/billing 锁/
//! provenance 全部本体侧 stamp，manifest 无权提供 fact_id），并编排
//! validate（dry-run）与 ingest --write（facts JSONL exactly-once +
//! authority 双写）。
//!
//! **P0 护栏落点**（§6）：billing 锁（`billing_mode=metered` +
//! `pricing_basis=metered_estimate`，manifest 无权改）；provenance
//! （`source_revision` = manifest sha256 前 16 hex）；行数上限（超限整
//! 文件失败，不提交该文件任何事实）；fact_id 稳定性（重放两遍 id 序列
//! 不一致 → 拒绝安装）；首装 format guard（整个 corpus 零 emit → 拒绝；
//! 单文件零 target 只标黄——混合目录不误伤，spec §4.3 修订案）。

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use agent_vitals_domain::usage_fact::build_usage_fact;
use agent_vitals_hosts::generic_candidate::CandidateUsageV1;
use agent_vitals_hosts::generic_manifest::{self, PluginManifest};
use agent_vitals_hosts::generic_recipe::{self, LineVerdict, RecipeDef};
use serde_json::{json, Value};

use crate::host_registry::{scan_plugin_hosts, PluginHost};

/// 单文件提取报告（如实三态计数 + 最多 8 条问题样例）。
#[derive(Debug, Default, Clone, serde::Serialize)]
pub struct PluginFileReport {
    pub rel_path: String,
    /// 绝对路径只在本地进程内用（authority sources 登记）；不进 JSON 负载
    /// （§6.3：redacted 面不暴露本地路径）。
    #[serde(skip_serializing)]
    pub abs_path: PathBuf,
    pub session_id: String,
    pub emitted: usize,
    pub skipped: usize,
    pub invalid: usize,
    pub invalid_problems: Vec<String>,
    /// 零 target 文件标黄（§4.3：不整文件失败，报告可见）。
    pub zero_target: bool,
    /// 行数超限 → 整文件失败，该文件事实不进账（§6.4）。
    pub failed: bool,
    pub problems: Vec<String>,
}

#[derive(Debug, Default, serde::Serialize)]
pub struct PluginRunReport {
    pub slug: String,
    pub host: String,
    pub recipe: String,
    pub manifest_revision: String,
    pub files: Vec<PluginFileReport>,
    pub emitted: usize,
    pub skipped: usize,
    pub invalid: usize,
    pub failed_files: usize,
    pub fact_id_stable: bool,
    pub date_min_utc_ms: Option<i64>,
    pub date_max_utc_ms: Option<i64>,
    pub models: Vec<String>,
    /// 首装 format guard：整个 corpus 零 emit → false（拒绝安装）。
    pub corpus_has_emit: bool,
    /// 如实警示（§「发现矛盾报告给上层」）：跨 root 的同一 session id 落在
    /// 多个 source_profile 下时，JSONL（身份含 profile）与 authority（身份
    /// UNIQUE 不含 profile）的行数会分歧——这里点名，不静默。
    pub warnings: Vec<String>,
    #[serde(skip_serializing)]
    pub facts: Vec<Value>,
}

/// 加载并校验 manifest 文件（含 slug == 目录名检查）。`--file` 模式下
/// 目录名检查以 manifest 文件自身目录为准。
pub fn load_manifest(manifest_path: &Path) -> Result<(PluginManifest, String), String> {
    let raw = std::fs::read(manifest_path)
        .map_err(|e| format!("manifest `{}` 不可读：{e}", manifest_path.display()))?;
    let value: Value = serde_json::from_slice(&raw)
        .map_err(|e| format!("manifest `{}` 不是合法 JSON：{e}", manifest_path.display()))?;
    let manifest = generic_manifest::parse_manifest(value)
        .map_err(|e| format!("manifest 校验失败：{e}"))?;
    let dir_name = manifest_path
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string());
    if dir_name.as_deref() != Some(manifest.slug.as_str()) {
        return Err(format!(
            "slug `{}` 与 manifest 所在目录名 `{}` 不一致（§3.1）",
            manifest.slug,
            dir_name.unwrap_or_default()
        ));
    }
    use sha2::Digest;
    let digest = sha2::Sha256::digest(&raw);
    let revision: String = digest.iter().take(8).map(|b| format!("{b:02x}")).collect();
    Ok((manifest, revision))
}

fn dotted_get<'a>(record: &'a Value, path: &str) -> &'a Value {
    // 与 hosts::generic::recipe::dotted_get 同语义（空路径短路）。
    if path.is_empty() {
        return &Value::Null;
    }
    let mut cur = record;
    for seg in path.split('.') {
        match cur.get(seg) {
            Some(v) => cur = v,
            None => return &Value::Null,
        }
    }
    cur
}

/// source_profile：声明形式 root 串的 sha256 前 8 hex（不含绝对路径，
/// §9.2）。root 声明形如 `~/...`，跨机器稳定。
fn source_profile_for_root(slug: &str, root_declared: &str) -> String {
    use sha2::Digest;
    let digest = sha2::Sha256::digest(format!("{slug}|{root_declared}").as_bytes());
    let hex: String = digest.iter().take(4).map(|b| format!("{b:02x}")).collect();
    format!("host-{hex}")
}

/// 候选行 → UsageFact 字段 map（§9.2 映射表）。**billing 锁在这里 stamp**：
/// `billing_mode=metered` + `pricing_basis=metered_estimate`，provider 证据
/// 不构成订阅证据（billing fallback 规则）。
/// 一次插件运行内不变的字段 map 组装上下文（避免 8 参函数，clippy 门）。
struct ThroatCtx<'a> {
    def: &'a RecipeDef,
    manifest: &'a PluginManifest,
    revision: &'a str,
    machine_namespace: &'a str,
}

fn candidate_to_fact_fields(
    ctx: &ThroatCtx,
    source_profile: &str,
    native_session_id: &str,
    candidate: &CandidateUsageV1,
    event_ts_raw: &str,
) -> Value {
    let (def, manifest, manifest_revision, machine_namespace) =
        (ctx.def, ctx.manifest, ctx.revision, ctx.machine_namespace);
    let mut m = serde_json::Map::new();
    m.insert("machine_namespace".into(), json!(machine_namespace));
    m.insert("host".into(), json!(manifest.facts_host()));
    m.insert("source_profile".into(), json!(source_profile));
    m.insert("native_session_id".into(), json!(native_session_id));
    m.insert("source_event_id".into(), json!(candidate.source_event_id));
    m.insert("observation_kind".into(), json!(def.observation_kind));
    m.insert("identity_basis".into(), json!("native"));
    m.insert("event_ts_utc".into(), json!(event_ts_raw));
    m.insert("event_tz_basis".into(), Value::Null);
    m.insert("time_basis".into(), json!("native"));
    m.insert(
        "source_usage_semantics".into(),
        json!(def.source_usage_semantics),
    );
    // provenance（§6.3）：manifest revision 进 source_revision；
    // adapter_version = recipe 代码版本（P0 与 recipe id 同源）。
    m.insert("source_revision".into(), json!(manifest_revision));
    m.insert("adapter_version".into(), json!(def.id));
    m.insert("model_raw".into(), json!(candidate.model_raw));
    m.insert(
        "provider_raw".into(),
        candidate
            .provider_raw
            .as_ref()
            .map(|s| json!(s))
            .unwrap_or(Value::Null),
    );
    m.insert(
        "provider_request_id".into(),
        candidate
            .provider_request_id
            .as_ref()
            .map(|s| json!(s))
            .unwrap_or(Value::Null),
    );
    for (key, v) in [
        ("uncached_input_tokens", candidate.uncached_input_tokens),
        ("cache_read_tokens", candidate.cache_read_tokens),
        ("cache_write_tokens", candidate.cache_write_tokens),
        ("output_tokens", candidate.output_tokens),
    ] {
        m.insert(key.into(), v.map(|n| json!(n)).unwrap_or(Value::Null));
    }
    // billing 锁（§6.1）：插件事实永远 metered estimate。
    m.insert("billing_source".into(), Value::Null);
    m.insert("billing_mode".into(), json!("metered"));
    m.insert("pricing_basis".into(), json!("metered_estimate"));
    m.insert(
        "evidence_basis".into(),
        if candidate.provider_raw.is_some() {
            json!("session-native")
        } else {
            json!("missing")
        },
    );
    Value::Object(m)
}

/// 对单个文件跑提取循环。返回 (报告, 该文件的事实行)。
fn extract_file(
    ctx: &ThroatCtx,
    source_profile: &str,
    rel_path: &str,
    abs_path: &Path,
    session_id: &str,
    content: &str,
) -> (PluginFileReport, Vec<Value>) {
    let (def, manifest) = (ctx.def, ctx.manifest);
    let mut report = PluginFileReport {
        rel_path: rel_path.to_string(),
        abs_path: abs_path.to_path_buf(),
        session_id: session_id.to_string(),
        ..Default::default()
    };
    let mut facts = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            report.invalid += 1;
            if report.invalid_problems.len() < 8 {
                let excerpt: String = line.chars().take(120).collect();
                report
                    .invalid_problems
                    .push(format!("bad_json: {excerpt}"));
            }
            continue;
        };
        // 拿原始时间串给 fact 的 event_ts_utc（Candidate 只留毫秒）。
        let ts_raw = dotted_get(
            &record,
            &generic_recipe::effective_path(def, manifest, generic_recipe::Slot::EventTs),
        )
        .as_str()
        .unwrap_or_default()
        .to_string();
        match generic_recipe::extract_line(def, manifest, &record) {
            LineVerdict::Emit(c) => {
                let fields = candidate_to_fact_fields(
                    ctx,
                    source_profile,
                    session_id,
                    &c,
                    &ts_raw,
                );
                // fact_id 在这里 stamp（§9.2：外部不可写）——之后 FactWriter /
                // SQL 侧的重复 build 是幂等的（身份相同 ⇒ id 相同）。
                match build_usage_fact(fields.as_object().expect("map")) {
                    Ok(built) => {
                        facts.push(built);
                        report.emitted += 1;
                    }
                    Err(problems) => {
                        report.invalid += 1;
                        if report.invalid_problems.len() < 8 {
                            report
                                .invalid_problems
                                .push(format!("contract: {}", problems.join("; ")));
                        }
                    }
                }
            }
            LineVerdict::Skip { reason } => {
                report.skipped += 1;
                let _ = reason;
            }
            LineVerdict::Invalid { code, excerpt } => {
                report.invalid += 1;
                if report.invalid_problems.len() < 8 {
                    report.invalid_problems.push(format!("{code}: {excerpt}"));
                }
            }
        }
    }
    if report.emitted == 0 && report.invalid == 0 {
        report.zero_target = true;
    }
    if report.emitted as u64 > manifest.max_rows_per_file {
        report.failed = true;
        report.problems.push(format!(
            "行数超限：{} > {}（§6.4 整文件失败，不提交部分事实）",
            report.emitted, manifest.max_rows_per_file
        ));
        facts.clear();
        report.emitted = 0;
    }
    (report, facts)
}

/// 主入口：manifest + 显式文件列表 → 完整运行报告。`files` 为空 = 按
/// manifest discovery 走（生产路径）；非空 = fixture/测试直供（文件名提取
/// session id，profile 用其父目录声明形式）。
pub fn run_plugin(
    manifest_path: &Path,
    files: &[PathBuf],
    machine_namespace: &str,
    home: &Path,
) -> Result<PluginRunReport, String> {
    let (manifest, revision) = load_manifest(manifest_path)?;
    let def = generic_recipe::recipe_def(&manifest.recipe)
        .ok_or_else(|| format!("未知 recipe `{}`", manifest.recipe))?;
    generic_recipe::check_overrides(def, &manifest).map_err(|e| format!("overrides 校验失败：{e}"))?;

    // 文件集：显式列表 or discovery。
    let mut units: Vec<(String, PathBuf, String, String)> = Vec::new(); // (rel, abs, session_id, profile)
    if files.is_empty() {
        let report = agent_vitals_hosts::generic_discover::discover_files(&manifest, home)
            .map_err(|e| format!("discovery 失败：{e}"))?;
        for f in &report.files {
            let root_declared = manifest
                .roots
                .iter()
                .find(|r| {
                    let expanded =
                        agent_vitals_hosts::generic_discover::expand_tilde_home(r, home);
                    expanded
                        .canonicalize()
                        .map(|c| f.abs_path.starts_with(&c))
                        .unwrap_or(false)
                })
                .map(|s| s.as_str())
                .unwrap_or("");
            let profile = source_profile_for_root(&manifest.slug, root_declared);
            units.push((f.rel_path.clone(), f.abs_path.clone(), f.session_id.clone(), profile));
        }
    } else {
        for path in files {
            let abs = path.canonicalize().unwrap_or_else(|_| path.clone());
            let file_name = abs
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let Some(caps) = manifest.session_pattern.captures(&file_name) else {
                return Err(format!("文件 `{file_name}` 不匹配 session.pattern"));
            };
            let session_id = caps
                .name("id")
                .map(|m| m.as_str().to_string())
                .unwrap_or_default();
            // fixture 模式 profile 固定（不依赖临时目录绝对路径）——
            // golden/parity 的逐字节跨机复现前提（验收发现 #3）。
            let profile = source_profile_for_root(&manifest.slug, "<fixture>");
            units.push((file_name, abs, session_id, profile));
        }
    }
    units.sort_by(|a, b| a.0.cmp(&b.0));

    let ctx = ThroatCtx {
        def,
        manifest: &manifest,
        revision: &revision,
        machine_namespace,
    };

    let mut out = PluginRunReport {
        slug: manifest.slug.clone(),
        host: manifest.facts_host(),
        recipe: def.id.to_string(),
        manifest_revision: revision.clone(),
        ..Default::default()
    };
    for (rel, abs, session_id, profile) in &units {
        let content = std::fs::read_to_string(abs)
            .map_err(|e| format!("文件 `{}` 不可读：{e}", abs.display()))?;
        let (report, mut facts) = extract_file(
            &ctx,
            profile,
            rel,
            abs,
            session_id,
            &content,
        );
        out.emitted += report.emitted;
        out.skipped += report.skipped;
        out.invalid += report.invalid;
        out.failed_files += usize::from(report.failed);
        out.corpus_has_emit |= report.emitted > 0;
        out.files.push(report);
        out.facts.append(&mut facts);
    }

    // 汇总：日期范围 + 模型清单。
    let mut models = std::collections::BTreeSet::new();
    for f in &out.facts {
        let ms = f
            .get("event_ts_utc")
            .and_then(|t| t.as_str())
            .and_then(agent_vitals_domain::domain::budget::parse_iso)
            .map(|(s, _)| s.saturating_mul(1000));
        if let Some(ms) = ms {
            out.date_min_utc_ms = Some(out.date_min_utc_ms.map_or(ms, |m: i64| m.min(ms)));
            out.date_max_utc_ms = Some(out.date_max_utc_ms.map_or(ms, |m: i64| m.max(ms)));
        }
        if let Some(m) = f.get("model_raw").and_then(Value::as_str) {
            models.insert(m.to_string());
        }
    }
    out.models = models.into_iter().collect();

    // 跨 root 同 session 多 profile 警示（验收发现：JSONL/authority 双层
    // 分歧必须可见）。
    {
        let mut by_session: BTreeMap<&str, std::collections::BTreeSet<&str>> =
            BTreeMap::new();
        for (session, profile) in units.iter().map(|(_r, _a, s, p)| (s.as_str(), p.as_str())) {
            by_session.entry(session).or_default().insert(profile);
        }
        for (session, profiles) in &by_session {
            if profiles.len() > 1 {
                out.warnings.push(format!(
                    "session `{session}` 出现在 {} 个 source_profile 下（跨 root）——\
                     facts JSONL 按 profile 分行，authority 按 host+session 身份去重合并",
                    profiles.len()
                ));
            }
        }
    }

    // fact_id 稳定性（§6.5）：提取是纯函数，重放两遍 id 序列必须一致。
    let ids_once: Vec<String> = out
        .facts
        .iter()
        .filter_map(|f| f.get("fact_id").and_then(Value::as_str).map(String::from))
        .collect();
    out.fact_id_stable = {
        // 第二遍：重跑同样的提取循环（纯函数 ⇒ 确定性；这一步同时验证
        // build_usage_fact 的 fact_id 与字段 map 一一对应，无隐藏状态）。
        let mut ids_again = Vec::new();
        for (rel, abs, session_id, profile) in &units {
            let Ok(content) = std::fs::read_to_string(abs) else {
                continue;
            };
            let (_, facts2) = extract_file(
                &ctx,
                profile,
                rel,
                abs,
                session_id,
                &content,
            );
            for f in facts2 {
                if let Some(id) = f.get("fact_id").and_then(Value::as_str) {
                    ids_again.push(id.to_string());
                }
            }
        }
        ids_once == ids_again
    };
    Ok(out)
}

/// validate 的判定门（§6.5）：返回 Ok(()) 或可操作拒绝原因。
pub fn validate_gate(report: &PluginRunReport) -> Result<(), String> {
    if !report.fact_id_stable {
        return Err("fact_id 稳定性检查失败：同文件重放两遍 id 序列不一致——\
                    检查 event_key 是否稳定（§6.5）"
            .to_string());
    }
    if report.failed_files > 0 {
        return Err(format!(
            "{} 个文件行数超限整文件失败（§6.4）——调低 limits 或修 recipe",
            report.failed_files
        ));
    }
    if !report.corpus_has_emit {
        return Err(
            "首装 format guard：整个 corpus 零 emit（§4.3）——include 或 recipe \
             discriminator 与数据不匹配"
                .to_string(),
        );
    }
    Ok(())
}

/// ingest --write：validate 门 → facts JSONL（exactly-once）→ authority
/// 双写。任何一步失败如实报错；两阶段各自 exactly-once，重跑安全。
pub fn plugin_ingest_write(
    manifest_path: &Path,
    machine_namespace: &str,
    data_home: &Path,
    home: &Path,
) -> Result<Value, String> {
    let mut report = run_plugin(manifest_path, &[], machine_namespace, home)?;
    validate_gate(&report).map_err(|e| format!("validate 拒绝安装：{e}"))?;
    let facts = std::mem::take(&mut report.facts);
    let ingest = crate::ingest_service::ingest_facts(data_home, &facts)?;
    // authority 双写（§2 图：facts 后写 authority 先写语义对齐为「同一事务
    // 面」；这里沿用 sync_service 的 write_flat_facts_with_sources，SQL 侧
    // exactly-once 由 (host, ns, session, event_id, kind) UNIQUE 承担）。
    let authority = match open_authority_and_write(data_home, &report, &facts) {
        Ok(v) => v,
        Err(e) => {
            return Err(format!(
                "authority 双写失败（facts JSONL 已落盘、重跑不双计）：{e}"
            ));
        }
    };
    let payload = json!({
        "mode": "ingest",
        "report": serde_json::to_value(&report).unwrap_or(Value::Null),
        "ingest": ingest,
        "authority": authority,
    });
    Ok(payload)
}

fn open_authority_and_write(
    data_home: &Path,
    report: &PluginRunReport,
    facts: &[Value],
) -> Result<Value, String> {
    let authority_path = agent_vitals_data::authority::default_authority_path(data_home);
    let now = crate::clock::now_ms();
    let db = agent_vitals_data::authority::AuthorityDb::open(&authority_path, now)
        .map_err(|e| format!("authority open: {e}"))?;
    let no_overrides: std::collections::HashMap<String, crate::source_graph::SourceCheckpointOverride> = std::collections::HashMap::new();
    let outcome = crate::sql_sync::write_flat_facts_with_sources(
        &db,
        &report.host,
        // write_flat_facts_with_sources 需要 machine_namespace——从事实行取。
        facts
            .first()
            .and_then(|f| f.get("machine_namespace"))
            .and_then(Value::as_str)
            .unwrap_or(""),
        // sources：以事实行为准构建（path, (size, mtime_ns)）由调用方给——
        // P0 简化：文件元数据从报告文件列表反查。
        &source_entries(report),
        &no_overrides,
        facts,
        &[],
        // session_excerpts：行为面素材，插件宿主不产（行为须官方，spec §1）。
        &[],
        None,
        None,
        now,
    )
    .map_err(|e| format!("authority write: {e}"))?;
    Ok(json!({
        "files_synced": outcome.files_synced,
        "files_skipped": outcome.files_skipped,
        "inserted": outcome.inserted,
        "duplicate": outcome.duplicate,
        "rejected": outcome.rejected,
        "errors": outcome.errors,
    }))
}

fn source_entries(report: &PluginRunReport) -> Vec<(PathBuf, (u64, u64))> {
    let mut entries = Vec::new();
    for f in &report.files {
        if let Ok(meta) = std::fs::metadata(&f.abs_path) {
            let size = meta.len();
            let mtime = meta
                .modified()
                .ok()
                .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_nanos() as u64)
                .unwrap_or(0);
            entries.push((f.abs_path.clone(), (size, mtime)));
        }
    }
    entries
}

/// 周期再摄取（zcode 宿主接入收尾，2026-09-23）：对**已安装**的全部插件
/// manifest 逐个执行 [`plugin_ingest_write`]——exactly-once 由事实层
/// fact_id 幂等兜底（重放 = duplicate 计数，不双计）。单 manifest 失败
/// 隔离为 Err 条目（坏 manifest 不得拖垮整轮 sync，tick 兜底语义）。
/// 返回 (slug, 摘要 or 错误) 列表供调用方记入 report.errors/log。
pub fn ingest_installed(
    ns: &str,
    data_home: &Path,
    user_home: &Path,
) -> Vec<(String, Result<Value, String>)> {
    let (hosts, errors) = scan_plugin_hosts(data_home);
    let mut out = Vec::new();
    for e in errors {
        out.push((
            e.manifest_path.to_string_lossy().to_string(),
            Err(format!("manifest 解析失败: {}", e.problem)),
        ));
    }
    for h in hosts {
        let result = plugin_ingest_write(&h.manifest_path, ns, data_home, user_home)
            .map_err(|e| format!("plugin_ingest_write: {e}"));
        out.push((h.slug.clone(), result));
    }
    out
}

/// plugin-list 的负载：registry 内容 + 坏 manifest 报错。
pub fn plugin_list(data_home: &Path) -> Value {
    let (hosts, errors) = scan_plugin_hosts(data_home);
    let host_values: Vec<Value> = hosts
        .iter()
        .map(|h| {
            json!({
                "slug": h.slug,
                "display_name": h.display_name,
                "recipe": h.recipe,
                "host": format!("host:{}", h.slug),
                "manifest_revision": h.manifest_sha256,
                "manifest_path": h.manifest_path.to_string_lossy(),
            })
        })
        .collect();
    let error_values: Vec<Value> = errors
        .iter()
        .map(|e| {
            json!({
                "manifest_path": e.manifest_path.to_string_lossy(),
                "problem": e.problem,
            })
        })
        .collect();
    json!({ "hosts": host_values, "errors": error_values })
}

/// 保留 host→PluginHost 的有序视图给调用方（BTreeMap 键序稳定）。
pub fn plugin_hosts_by_slug(data_home: &Path) -> BTreeMap<String, PluginHost> {
    scan_plugin_hosts(data_home)
        .0
        .into_iter()
        .map(|h| (h.slug.clone(), h))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp_home(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "av-plugin-{}-{}-{}",
            tag,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// 布一个最小 zcode 形状的插件宿主：manifest 进 hosts.d/zcode/，
    /// 两份 rollout fixture。
    fn setup_host(home: &Path) -> (PathBuf, Vec<PathBuf>) {
        let manifest_dir = home.join("hosts.d/zcode");
        std::fs::create_dir_all(&manifest_dir).unwrap();
        let manifest = r#"{
            "manifest_version": 1,
            "slug": "zcode",
            "display": { "name": "ZCode" },
            "discovery": { "roots": ["~/data"], "include": ["model-io-sess_*.jsonl"] },
            "source": { "format": "jsonl" },
            "session": { "from": "filename", "pattern": "^model-io-sess_(?P<id>.+)\\.jsonl$" },
            "recipe": "request-usage-anthropic-v1",
            "overrides": {
                "event_ts": "completedAt",
                "model_raw": "model.modelId",
                "provider_raw": "model.providerId",
                "uncached_input_tokens": "response.providerMetadata.anthropic.usage.input_tokens",
                "cache_read_tokens": "response.providerMetadata.anthropic.usage.cache_read_input_tokens",
                "output_tokens": "response.providerMetadata.anthropic.usage.output_tokens",
                "provider_request_id": "requestId"
            },
            "event_key": { "paths": ["requestId", "attempt"] },
            "billing": { "policy": "lock:metered_estimate" }
        }"#;
        let manifest_path = manifest_dir.join("manifest.json");
        std::fs::write(&manifest_path, manifest).unwrap();

        let data = home.join("data");
        std::fs::create_dir_all(&data).unwrap();
        let row = |id: &str, attempt: i64, input: i64| {
            serde_json::json!({
                "requestId": id, "attempt": attempt,
                "completedAt": "2026-09-19T15:18:41.337Z",
                "model": { "modelId": "GLM-5.3", "providerId": "builtin:bigmodel-coding-plan" },
                "response": {
                    "usage": { "inputTokens": input + 5 },
                    "providerMetadata": { "anthropic": { "usage": {
                        "input_tokens": input, "cache_read_input_tokens": 5,
                        "output_tokens": 99
                    }}}
                }
            })
            .to_string()
        };
        let f1 = data.join("model-io-sess_aaa.jsonl");
        std::fs::write(&f1, format!("{}\n{}\n", row("r1", 1, 100), row("r2", 1, 200))).unwrap();
        let f2 = data.join("model-io-sess_bbb.jsonl");
        std::fs::write(&f2, format!("{}\n", row("r3", 1, 300))).unwrap();
        (manifest_path, vec![f1, f2])
    }

    #[test]
    fn run_plugin_emits_facts_with_billing_lock_and_identity() {
        let home = tmp_home("emit");
        let (manifest, files) = setup_host(&home);
        let report = run_plugin(&manifest, &files, "m1", &home).unwrap();
        assert_eq!(report.emitted, 3);
        assert_eq!(report.skipped, 0);
        assert_eq!(report.invalid, 0);
        assert!(report.fact_id_stable);
        assert!(report.corpus_has_emit);
        assert_eq!(report.models, ["GLM-5.3"]);
        assert_eq!(report.host, "host:zcode");
        let f = &report.facts[0];
        assert_eq!(f["host"], "host:zcode");
        assert_eq!(f["billing_mode"], "metered", "计价锁（§6.1）");
        assert_eq!(f["pricing_basis"], "metered_estimate");
        assert_eq!(f["machine_namespace"], "m1");
        assert_eq!(f["native_session_id"], "aaa");
        assert_eq!(f["uncached_input_tokens"], 100);
        assert_eq!(f["cache_read_tokens"], 5);
        let fid = f["fact_id"].as_str().unwrap();
        assert!(fid.starts_with("uf1-") && fid.len() == 20, "fact_id 已 stamp：{fid}");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn zero_corpus_emit_is_refused_by_gate() {
        let home = tmp_home("zeroguard");
        let (manifest, _files) = setup_host(&home);
        let empty = home.join("data/model-io-sess_empty.jsonl");
        std::fs::write(&empty, "{\"requestId\":\"x\",\"attempt\":1}\n").unwrap();
        let report = run_plugin(&manifest, &[empty], "m1", &home).unwrap();
        let err = validate_gate(&report).unwrap_err();
        assert!(err.contains("零 emit"), "{err}");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn bad_manifest_dir_name_is_refused() {
        let home = tmp_home("dirname");
        let (manifest, _files) = setup_host(&home);
        let wrong = home.join("hosts.d/other.json");
        std::fs::copy(&manifest, &wrong).unwrap();
        let e = run_plugin(&wrong, &[], "m1", &home).unwrap_err();
        assert!(e.contains("目录名"), "{e}");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn ingest_write_is_exactly_once_and_dual_writes_authority() {
        let home = tmp_home("e2e");
        let data_home = home.join("data-home");
        std::fs::create_dir_all(&data_home).unwrap();
        let (manifest, _files) = setup_host(&home);

        let payload = plugin_ingest_write(&manifest, "m1", &data_home, &home).unwrap();
        let ingest = &payload["ingest"];
        assert_eq!(ingest["hosts"][0]["appended"], 3, "首跑追加 3 条");
        assert_eq!(ingest["hosts"][0]["duplicate"], 0);

        // facts 文件落在 slug 命名空间。
        let facts_file = data_home.join("facts/host-zcode.jsonl");
        assert!(facts_file.exists(), "{:?}", facts_file);
        assert_eq!(std::fs::read_to_string(&facts_file).unwrap().lines().count(), 3);

        // authority 双写：usage_facts 有行（host = host:zcode）。
        let authority_path =
            agent_vitals_data::authority::default_authority_path(&data_home);
        let db = agent_vitals_data::authority::AuthorityDb::open(&authority_path, 0).unwrap();
        let count: i64 = db
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM usage_facts WHERE host = 'host:zcode'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 3, "authority 双写落行");

        // 重跑：两个阶段都 exactly-once。
        let payload2 = plugin_ingest_write(&manifest, "m1", &data_home, &home).unwrap();
        assert_eq!(payload2["ingest"]["hosts"][0]["appended"], 0, "重跑零追加");
        assert_eq!(payload2["ingest"]["hosts"][0]["duplicate"], 3);
        let count2: i64 = db
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM usage_facts WHERE host = 'host:zcode'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count2, 3, "authority 重跑不双计");

        // retention 覆盖插件文件（registry 驱动）。
        let rep = crate::ingest_service::enforce_retention(&data_home, "2026-09").unwrap();
        assert!(
            rep.get("host:zcode").is_some(),
            "retention 输出含插件宿主：{rep}"
        );

        // host-agnostic 下游：matrix 的 combo 查询面按 host 收纳（§7.4）。
        let n: i64 = db
            .conn()
            .query_row(
                "SELECT COUNT(DISTINCT host) FROM usage_facts",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(n >= 1);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn ingest_refuses_without_machine_namespace_shape() {
        // fact 身份缺 machine_namespace → build_usage_fact 报 contract 问题计
        // invalid（喉咙不造默认值，spec §9）。
        let home = tmp_home("nons");
        let (manifest, files) = setup_host(&home);
        let report = run_plugin(&manifest, &files, "", &home).unwrap();
        assert_eq!(report.emitted, 0, "空 ns 不产事实");
        assert_eq!(report.invalid, 3, "如实计 invalid");
        let _ = std::fs::remove_dir_all(&home);
    }
}
