//! R2a SessionStore 的 **I/O 层**（`docs/R2A_CONTRACT_DESIGN.md`）。
//!
//! 纯规则（SessionKey / 版本闸 / filter / cursor / 分页 / 类型化错误）在
//! `agent_vitals_domain::r2a`；本模块只做 I/O：
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
//!
//! **cache schema v2：按 session 增量失效，不再全有全无**（2026-09）。v1 把
//! 缓存写成两条互不关联的并行数组——`fingerprints`（按文件路径序）和
//! `entries`（按 session_key 序，**不同的序**）——`cache_is_current` 只能逐位比
//! 对两个数组长度是否相等、内容是否逐位相同，任何一个文件指纹变了就只能判
//! 「不 current」，**没有办法说清楚是哪个 session 受影响**，于是唯一安全的动
//! 作是把全部 session 重新审计一遍。真机验证过：58 个会话里碰一个文件的
//! mtime，重建耗时 6.8s——这正是工作台点会话/finding/数据源 tab 反复"卡到
//! 假死"的第二根因（第一根因是 `fingerprint_file` 整份读文件，已修）。
//!
//! v2 把每个 session 自己的依赖路径与指纹存成它自己的一条记录
//! （`paths`/`fingerprints` 平行数组 + `envelope`），重建时逐 session 核对：
//! 依赖的路径全部还在、指纹全部相同 → 直接复用旧 envelope（连 payload 都不
//! 重算，跳过一次完整的成本折叠/证据构建）；只要有一个不符，才把它交回
//! `codex_built_session_for`/`dsh_built_session_for` 单独重建。Codex 的一个
//! 逻辑 session 可能横跨多个 rollout 文件（resume 续写）——这条依赖路径不是
//! 发明出来的新映射，`codex_session_audit_json` 的 payload 早就自带 `files`
//! 字段，直接拿来用。DSH 是 1 文件 = 1 session（§ dsh_source_fingerprints 的
//! 注释），依赖路径永远只有一条。
//!
//! 旧的 v1 缓存文件（`schema_version` 不是 `"2"`）一律当"缓存不存在"处理——
//! 不做就地迁移，代价是升级后第一次调用是一次冷启动（和今天冷启动一样贵），
//! 换来的是往后所有增量重建都不用再为一个不相关的文件变化陪绑全量审计。
//!
//! **cache schema v3：envelope payload 增加 `cost_series` 键**（2026-09）。v2 的
//! 增量失效只看源文件指纹——载荷形状变了（工作台费用曲线读的新键）而指纹没变
//! 的会话会无限期沿用旧 envelope，费用轴在真机上静默消失。所以 v3 把 schema 抬
//! 一版，旧缓存一次性冷启动重建；同样的"改载荷就抬 schema、不做就地迁移"规则。

use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use agent_vitals_domain::findings::{FindingRef, FindingSession, rollup_findings};
use agent_vitals_domain::r2a::*;
use crate::agent::codex_session_audit as csa;
use agent_vitals_runtime::takeover;
use agent_vitals_runtime::home::data_home;

/// 并行逐会话构建，结果按输入序回填。会话构建互相独立（只读各自源文件 + 共享
/// 只读的 `fp_map`/`ws`），可并行；但每个 worker 持有当前会话解压后的全文，
/// 并发数过高会爆内存（源合计 631MB、单会话解压后可能几十 MB），所以**有界并
/// 发**——`thread::scope` + chunk 分片，worker 数 = min(输入数, 可用核, 8)，
/// 不是 thread-per-item。
///
/// 输出顺序与输入一致（chunk 依次 extend）：envelope 的 store_seq 由
/// `finalize_and_write` 排序决定，`degraded` 列表要保持文件序才字节确定——
/// 并行只换「谁来算」，不换「结果顺序」。
fn par_map_in_order<T, U, F>(items: &[T], f: F) -> Vec<U>
where
    T: Sync,
    U: Send,
    F: Fn(&T) -> U + Send + Sync,
{
    if items.len() <= 1 {
        return items.iter().map(&f).collect();
    }
    let n_workers = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
        .min(8)
        .min(items.len());
    let chunk = items.len().div_ceil(n_workers);
    std::thread::scope(|s| {
        // 不用 `move`：闭包共享借用 `f`（Fn 可并发调用），chunk 依次 spawn；
        // `&f` 是可调用的引用（&F: Fn），每次 spawn 重新取，不消费 `f` 本身。
        let handles: Vec<_> = items
            .chunks(chunk)
            .map(|c| s.spawn(|| c.iter().map(&f).collect::<Vec<_>>()))
            .collect();
        let mut out = Vec::with_capacity(items.len());
        for h in handles {
            out.extend(h.join().expect("session build worker panicked"));
        }
        out
    })
}

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

fn claude_cache_path() -> PathBuf {
    cache_dir().join("claude-sessions.json")
}

/// Codex 源指纹（当前源文件的指纹列表，按 `codex_rollout_files` 的全局路径序）。
/// 文件名（session 分组）不是指纹的一部分——路径就是源文件的身份，指纹看内容。
fn codex_source_fingerprints(home: &Path) -> Vec<(String, String)> {
    agent_vitals_hosts::codex_session::codex_rollout_files(home)
        .iter()
        .map(|p| (p.to_string_lossy().to_string(), fingerprint_file(p).unwrap_or_default()))
        .collect()
}

/// DSH 源指纹：`<home>/.dsh/sessions/**/session.jsonl[.zstd]` 的文件指纹列表，
/// 按 `dsh_session_files` 的全局路径序。DSH_HOME env 不在 R2a 的契约里——`home`
/// 参数（= HOME）是权威根（`home/.codex`、`home/.dsh` 同一条纪律）；`discovery::dsh_home()`
/// 那套 env 覆盖只服务 tick/oneline 路径，两条路径的根在 DSH_HOME 未设时本就一致。
fn dsh_source_fingerprints(home: &Path) -> Vec<(String, String)> {
    agent_vitals_runtime::sessions::discovery::dsh_session_files(&home.join(".dsh"))
        .iter()
        .map(|p| (p.to_string_lossy().to_string(), fingerprint_file(p).unwrap_or_default()))
        .collect()
}

/// Claude 源指纹：`~/.claude/projects/**/*.jsonl`（递归，`claude_project_files` 的
/// 全局路径序）。session_id = 文件 stem——文件名就是分组键，指纹看内容（与 codex
/// 同一纪律：路径是身份、指纹是内容）。
fn claude_source_fingerprints(home: &Path) -> Vec<(String, String)> {
    agent_vitals_hosts::claude_session::claude_project_files(home)
        .iter()
        .map(|p| (p.to_string_lossy().to_string(), fingerprint_file(p).unwrap_or_default()))
        .collect()
}

/// §1.5 源文件指纹：(size, mtime_ns, 首/尾 64 字节的 FNV-1a)。stat 失败 →
/// None（文件在 walk 与 stat 之间消失，cache 自然失效，不 abort）。
///
/// **只 seek 读需要的 128 字节，不整份读文件**——`sessions_list`/
/// `sessions_read`/`sessions_findings` 每次调用都要为 cache 命中判定重算全
/// 部会话文件的指纹（`codex_source_fingerprints`/`dsh_source_fingerprints`
/// 在检查 `read_cache` 之前跑），不管最终 cache 到不到命中；旧实现用
/// `std::fs::read(path)` 把整个文件读进内存只为切出这 128 字节，等于把
/// "cache 命中判定"本身变成了一次 O(全部会话文件总字节数) 的磁盘 I/O，命
/// 中与否都要付这笔钱。这是工作台"点会话/finding/数据源 tab 卡到假死"的真
/// 机根因：这台机器实测 `.codex` + `.dsh` 两个源合计 631MB、115 个文件，点
/// 一次 tab 就要整份读一遍——不是"慢"，是走了一条本不该存在的全量 I/O 路
/// 径。改成对两个窗口分别 seek + `read_exact`，把这一步从 O(总字节数) 降到
/// O(文件数 × 128 字节)。
///
/// 两次独立 seek+读（而不是"读一次、判断要不要复用"这种特判）在 size < 128
/// 时会让 `first`/`last` 的读取窗口部分或完全重叠——这是有意的：与旧实现
/// "整份读进来再各切一刀"逐字节等价（两处窗口本来就会重叠或重合），换成两
/// 次独立 seek 不用为"文件多短会重叠"写分支，指纹值不因为这次改动而变化，
/// 现有 cache 不会被无谓打脏。
fn fingerprint_file(path: &Path) -> Option<String> {
    use std::io::{Read, Seek, SeekFrom};

    let meta = std::fs::metadata(path).ok()?;
    let size = meta.len();
    let mtime_ns = meta
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_nanos() as u64;

    let mut file = std::fs::File::open(path).ok()?;

    let head_len = size.min(64) as usize;
    let mut first = vec![0u8; head_len];
    file.read_exact(&mut first).ok()?;

    let tail_start = size.saturating_sub(64);
    let tail_len = (size - tail_start) as usize; // == head_len 恒成立，写出来只为语义清楚
    file.seek(SeekFrom::Start(tail_start)).ok()?;
    let mut last = vec![0u8; tail_len];
    file.read_exact(&mut last).ok()?;

    Some(format!(
        "{size}:{mtime_ns}:{:016x}:{:016x}",
        fnv1a64(&first),
        fnv1a64(&last)
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
        let (y, m, d) = agent_vitals_domain::util::civil_from_unix_secs(ms / 1000, 0);
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
    let p = agent_vitals_runtime::sessions::codex_cost::load_codex_pricing();
    let s = serde_json::to_string(&p).unwrap_or_default();
    format!("{:016x}", fnv1a64(s.as_bytes()))
}

/// 秒级 UTC ISO（复用 state 的同一实现，测试对账把 generated_at 归一化，只比
/// 结构——两进程墙钟不同，字节一致不承诺墙钟字段）。
fn now_iso_utc() -> String {
    agent_vitals_runtime::state::now_iso_utc()
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
    let roots = agent_vitals_hosts::codex_session::codex_session_roots_report(home);
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
    let roots = agent_vitals_runtime::sessions::discovery::dsh_session_roots_report(&home.join(".dsh"));
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

/// Claude 源状态。三态与 DSH 同款（§4.3 诚实降级）——**不是** codex 的恒 ok：
/// Claude 按 session 构建（1 文件 = 1 session），文件在但一个都构建不出来
/// （built == 0）是「有语料但读不了」，该报 unavailable 而不是「0 条真数据」：
///
///   · `files` 为空（`~/.claude/projects` 缺席或没有会话文件）→ `ok`，sessions 0
///     —— 诚实零（「没装 Claude Code」和「有 Claude Code 但读不了」是两回事）；
///   · 全部文件成功构建 → `ok`，sessions = built；
///   · 文件在但一个都构建不出来（built == 0）→ `unavailable`——CLI 面对
///     `--host-kind claude-code` 报 source-unavailable 错误码，**不是空页**（§3.3）。
///
/// 与 DSH 的差异：不逐文件记 degraded（claude 按 session 构建、损坏的会话文件
/// 每次都重试——与 codex 同款已接受行为；逐文件归属是 dsh 的 1 文件 = 1 会话
/// 专属粒度）。
/// `roots` = `claude_session_roots_report`（`~/.claude/projects` 单根报告）。
fn claude_source_statuses(home: &Path, files_n: usize, built: usize) -> Value {
    let roots = agent_vitals_hosts::claude_session::claude_session_roots_report(home);
    let status = if files_n == 0 || built > 0 {
        "ok"
    } else {
        "unavailable"
    };
    json!({
        "claude-code": {
            "status": status,
            "sessions": built,
            "roots": roots.get("roots").cloned().unwrap_or_else(|| Value::Array(vec![])),
        },
    })
}

/// 合并单源 statuses（codex + dsh + claude-code）成 `all` store 的完整 statuses。
/// 键序稳定：claude-code 在前、codex 次之、dsh 在后（JSON 键序是字节一致的一部
/// 分；host_kind 字典序，与 entries 的 sort_key 同一条纪律）。
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
    /// 读 cache；部分命中（v2 schema，仅部分 session 的依赖文件变了）→ 只重建
    /// 受影响的 session；否则全量重建（`codex_session_list` →
    /// `codex_session_audit_json` → core 构建 envelope）并写 cache。
    pub fn codex(home: &Path) -> Result<SessionStore, StoreError> {
        let ns = takeover::machine_namespace();
        let generated_at = now_iso_utc();
        let fingerprints = codex_source_fingerprints(home);
        let fp_map: HashMap<&str, &str> = fingerprints.iter().map(|(p, f)| (p.as_str(), f.as_str())).collect();
        let cache_path = codex_cache_path();

        if let Some(cached) = read_cache(&cache_path) {
            if let Some((cached_sessions, _)) = read_cache_v2(&cached) {
                let (kept, covered) = kept_sessions(&cached_sessions, &fp_map);
                let to_process: Vec<&str> =
                    fingerprints.iter().map(|(p, _)| p.as_str()).filter(|p| !covered.contains(*p)).collect();
                if to_process.is_empty() && kept.len() == cached_sessions.len() {
                    // 全命中：一个 session 都不用重排/重算，直接复用 cache 文档
                    // 里冻结的 generated_at/source_statuses——与 v1 的纯读路径
                    // 同一份代价（v2 的增量能力不该让"什么都没变"的常见情形反
                    // 而多付一次排序/写盘）。
                    if let Some(store) = cache_v2_to_store(&cached, &cached_sessions) {
                        return Ok(store);
                    }
                    // 理论不可达（kept_sessions 已用同一个 entry_from_envelope
                    // 验过每条都能恢复）——真出现就落回下面重建，不 panic。
                }
                // 部分/全部失配：只对 to_process 覆盖到的 session_id 重建。一个
                // session 可能横跨多个文件，`codex_session_id_of` 只在**变化或
                // 新出现**的那些文件上跑（不是全量重新分组），成本 = O(变化文
                // 件数)，不是 O(全部文件数)。
                let mut sids: BTreeSet<String> = BTreeSet::new();
                for p in &to_process {
                    sids.insert(csa::codex_session_id_of(Path::new(p)));
                }
                let mut sessions = kept;
                let sid_list: Vec<String> = sids.into_iter().collect();
                for bs in par_map_in_order(&sid_list, |sid| codex_built_session_for(home, sid, &ns, &fp_map))
                    .into_iter()
                    .flatten()
                {
                    sessions.push(bs);
                }
                let statuses = codex_source_statuses(home, sessions.len());
                return Ok(finalize_and_write("codex", &cache_path, sessions, generated_at, statuses, Vec::new()));
            }
            // v1 缓存或形状坏（升级后字段改名等）→ 落回下面的全量重建，用新
            // v2 格式重写一份，不 abort。
        }

        // 冷启动 / 旧格式缓存：全量重建。
        let list = csa::codex_session_list(home);
        let session_ids: Vec<String> = list
            .get("sessions")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|s| s.get("session_id").and_then(Value::as_str).map(str::to_owned))
            .collect();
        let mut sessions = Vec::new();
        for bs in par_map_in_order(&session_ids, |sid| codex_built_session_for(home, sid, &ns, &fp_map))
            .into_iter()
            .flatten()
        {
            sessions.push(bs);
        }
        let statuses = codex_source_statuses(home, sessions.len());
        Ok(finalize_and_write("codex", &cache_path, sessions, generated_at, statuses, Vec::new()))
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
        let generated_at = now_iso_utc();
        let fingerprints = dsh_source_fingerprints(home);
        let fp_map: HashMap<&str, &str> = fingerprints.iter().map(|(p, f)| (p.as_str(), f.as_str())).collect();
        let cache_path = dsh_cache_path();

        if let Some(cached) = read_cache(&cache_path) {
            if let Some((cached_sessions, cached_degraded)) = read_cache_v2(&cached) {
                let (kept, mut covered) = kept_sessions(&cached_sessions, &fp_map);
                // 未变化的 degraded 文件也算"覆盖"——不然一个长期损坏的会话
                // 文件会在每次点 tab 时都被重新解压/重试一遍，白白付一次
                // I/O，明明内容根本没变。
                let (kept_deg, deg_covered) = kept_degraded(&cached_degraded, &fp_map);
                covered.extend(deg_covered);
                let to_process: Vec<String> = fingerprints
                    .iter()
                    .map(|(p, _)| p.clone())
                    .filter(|p| !covered.contains(p.as_str()))
                    .collect();
                if to_process.is_empty() && kept.len() == cached_sessions.len() && kept_deg.len() == cached_degraded.len() {
                    if let Some(store) = cache_v2_to_store(&cached, &cached_sessions) {
                        return Ok(store);
                    }
                }
                let dsh_root = home.join(".dsh");
                let files = agent_vitals_runtime::sessions::discovery::dsh_session_files(&dsh_root);
                let ws = agent_vitals_runtime::sessions::discovery::read_workspace_index(&dsh_root);
                // namespace 必须**并行前**固定：`dsh_built_session_for` 若内部现算
                // `machine_namespace()`，miss 时会写 machine.json——并发首建会得到
                // 互相不一致的随机 namespace（envelope 键的一部分，直接破坏分页键）。
                let ns = takeover::machine_namespace();
                let mut sessions = kept;
                let mut degraded: Vec<DegradedTriple> = kept_deg
                    .into_iter()
                    .map(|(p, r)| (p.clone(), fp_map.get(p.as_str()).map(|f| f.to_string()).unwrap_or_default(), r))
                    .collect();
                let to_process_set: HashSet<&str> = to_process.iter().map(String::as_str).collect();
                let to_build: Vec<&PathBuf> = files
                    .iter()
                    .filter(|p| to_process_set.contains(p.display().to_string().as_str()))
                    .collect();
                for r in par_map_in_order(&to_build, |p| dsh_built_session_for(p, &ws, &fp_map, &ns)) {
                    match r {
                        Ok(bs) => sessions.push(bs),
                        Err((p, reason, fp)) => degraded.push((p, fp, reason)),
                    }
                }
                let degraded_pairs: Vec<(String, String)> =
                    degraded.iter().map(|(p, _, r)| (p.clone(), r.clone())).collect();
                let statuses = dsh_source_statuses(home, &files, &degraded_pairs);
                return Ok(finalize_and_write("dsh", &cache_path, sessions, generated_at, statuses, degraded));
            }
        }

        // 冷启动 / 旧格式缓存：全量重建（含 degraded 逐文件记录）。
        let dsh_root = home.join(".dsh");
        let files = agent_vitals_runtime::sessions::discovery::dsh_session_files(&dsh_root);
        let ws = agent_vitals_runtime::sessions::discovery::read_workspace_index(&dsh_root);
        let ns = takeover::machine_namespace();
        let mut sessions = Vec::new();
        let mut degraded: Vec<DegradedTriple> = Vec::new();
        for r in par_map_in_order(&files, |p| dsh_built_session_for(p, &ws, &fp_map, &ns)) {
            match r {
                Ok(bs) => sessions.push(bs),
                Err((p, reason, fp)) => degraded.push((p, fp, reason)),
            }
        }
        let degraded_pairs: Vec<(String, String)> = degraded.iter().map(|(p, _, r)| (p.clone(), r.clone())).collect();
        let statuses = dsh_source_statuses(home, &files, &degraded_pairs);
        Ok(finalize_and_write("dsh", &cache_path, sessions, generated_at, statuses, degraded))
    }

    /// 从 Claude Code 源填充（§5 第三源）。镜像 `SessionStore::codex` 的全量/增量
    /// 两条路径：`claude_source_fingerprints`（`~/.claude/projects/**/*.jsonl` 全量
    /// walk）→ `cache/r2a/claude-sessions.json` v2 缓存 → 增量重建只对变化文件的
    /// stem（= session_id）重算 → `finalize_and_write("claude-code", ...)`。
    ///
    /// 冷路径全量重建走 `claude_session_list`（复用 `claude_session.rs` 的既有枚举，
    /// 镜像 codex 的 `codex_session_list`——不重复发明文件枚举）。
    pub fn claude_code(home: &Path) -> Result<SessionStore, StoreError> {
        let ns = takeover::machine_namespace();
        let generated_at = now_iso_utc();
        let fingerprints = claude_source_fingerprints(home);
        let fp_map: HashMap<&str, &str> = fingerprints.iter().map(|(p, f)| (p.as_str(), f.as_str())).collect();
        let cache_path = claude_cache_path();
        let files_n = fingerprints.len();

        if let Some(cached) = read_cache(&cache_path) {
            if let Some((cached_sessions, _)) = read_cache_v2(&cached) {
                let (kept, covered) = kept_sessions(&cached_sessions, &fp_map);
                let to_process: Vec<&str> =
                    fingerprints.iter().map(|(p, _)| p.as_str()).filter(|p| !covered.contains(*p)).collect();
                if to_process.is_empty() && kept.len() == cached_sessions.len() {
                    // 全命中：直接复用 cache 文档里冻结的 generated_at/statuses
                    // （与 codex 同款快路径——"什么都没变"的常见情形不付排序写盘）。
                    if let Some(store) = cache_v2_to_store(&cached, &cached_sessions) {
                        return Ok(store);
                    }
                }
                // 部分/全部失配：只对 to_process 覆盖到的 session_id 重建。一个
                // session 可能横跨多个 jsonl（resume），stem → sid 只跑在变化的
                // 文件上（镜像 codex 的 O(变化文件数) 纪律）。
                let mut sids: BTreeSet<String> = BTreeSet::new();
                for p in &to_process {
                    sids.insert(claude_session_id_of(Path::new(p)));
                }
                let mut sessions = kept;
                let sid_list: Vec<String> = sids.into_iter().collect();
                for bs in par_map_in_order(&sid_list, |sid| claude_built_session_for(home, sid, &ns, &fp_map))
                    .into_iter()
                    .flatten()
                {
                    sessions.push(bs);
                }
                let statuses = claude_source_statuses(home, files_n, sessions.len());
                return Ok(finalize_and_write("claude-code", &cache_path, sessions, generated_at, statuses, Vec::new()));
            }
            // v1 缓存或形状坏 → 落回下面的全量重建（与 codex 同款，不 abort）。
        }

        // 冷启动 / 旧格式缓存：全量重建。
        let list = agent_vitals_hosts::claude_session::claude_session_list(home);
        let session_ids: Vec<String> = list
            .get("sessions")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|s| s.get("session_id").and_then(Value::as_str).map(str::to_owned))
            .collect();
        let mut sessions = Vec::new();
        for bs in par_map_in_order(&session_ids, |sid| claude_built_session_for(home, sid, &ns, &fp_map))
            .into_iter()
            .flatten()
        {
            sessions.push(bs);
        }
        let statuses = claude_source_statuses(home, files_n, sessions.len());
        Ok(finalize_and_write("claude-code", &cache_path, sessions, generated_at, statuses, Vec::new()))
    }

    /// 合并 codex + dsh + claude-code 三个单源 store（`sessions list` no-filter =
    /// 全部源）。**没有自己的合并 cache**——每次把三个子 store 合并（各子 store
    /// 走自己的 cache 快路径），`generated_at` 取三边的 max（ISO-UTC 同格式，字典
    /// 序 = 时间序，且都冻结在各自的 cache 里，跨进程/跨实现稳定）。
    /// `source_statuses` 合并成 `{claude-code, codex, dsh}` 完整视图（§2.1 的
    /// envelope 形状；键序稳定，见 `merge_statuses`）。
    pub fn all(home: &Path) -> Result<SessionStore, StoreError> {
        // 三个单源 store 各自走自己的 cache、写各自的 cache 文件，互相独立——
        // 冷启动三源串行（实测 30s+）压成三源并行。`machine_namespace()` 只在各
        // 单源构建内部各固定一次，跨源无共享写。
        let (codex_store, dsh_store, claude_store) = std::thread::scope(|s| {
            let c = s.spawn(|| SessionStore::codex(home));
            let d = s.spawn(|| SessionStore::dsh(home));
            let cl = s.spawn(|| SessionStore::claude_code(home));
            (
                c.join().expect("codex store build panicked"),
                d.join().expect("dsh store build panicked"),
                cl.join().expect("claude-code store build panicked"),
            )
        });
        let codex_store = codex_store?;
        let dsh_store = dsh_store?;
        let claude_store = claude_store?;
        let mut entries = codex_store.entries.clone();
        entries.extend(dsh_store.entries.clone());
        entries.extend(claude_store.entries.clone());
        // 全局稳定序：host_kind "claude-code" < "codex" < "dsh"，concat 已序，仍
        // 防御性重排一遍（与 cache_to_store 的恢复序同一条纪律）。
        entries.sort_by(|a, b| sort_key(&a.key).cmp(&sort_key(&b.key)));
        Ok(SessionStore {
            entries,
            // claude-code 在前（preserve_order 下键序 = 插入序 = 字节序，不能先
            // 并 codex+dsh 再挂 claude——那是 {codex, dsh, claude-code}）。
            source_statuses: merge_statuses(
                &claude_store.source_statuses,
                &merge_statuses(&codex_store.source_statuses, &dsh_store.source_statuses),
            ),
            generated_at: codex_store
                .generated_at
                .clone()
                .max(dsh_store.generated_at.clone())
                .max(claude_store.generated_at.clone()),
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
///
/// `pub(crate)` 让 dsh UsageFact emitter（`agent::dsh_usage_fact`）复用同一身份
/// 读法（Python 侧 emitter 复用 `r2a.py::dsh_header`）——identity/attribution 判读
/// 不许长第二份。
pub(crate) fn dsh_header(text: &str) -> Option<(String, Option<String>)> {
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
///
/// `pub(crate)` 同上（emitter 复用，R2a 对齐验收钉住同一四元）。
pub(crate) fn dsh_source_profile(cwd: Option<&str>) -> String {
    cwd.map(|c| format!("--{}--", c.replace('/', "-")))
        .unwrap_or_default()
}

// ── cache 读写（v2：按 session 增量，见文件头注释）────────────────────

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

fn read_cache(path: &Path) -> Option<Value> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// v2 cache 里的一条 session 记录：它依赖的源文件路径 + 各自的指纹（平行数
/// 组，同序）+ 已构建好的 envelope。
struct CachedSession {
    paths: Vec<String>,
    fingerprints: Vec<String>,
    envelope: Value,
}

/// DSH「读不了但没变就别再重试」记录：(path, fingerprint, reason)。
type DegradedTriple = (String, String, String);

/// 解析 v3 cache（`schema_version == "3"`）。旧 v1/v2 缓存（顶层单一
/// `fingerprints` 数组）或任何形状不认识的文档一律返回 `None`——调用方当"缓存
/// 不存在"处理，不做就地迁移（见文件头注释）。返回 `(sessions, degraded)`，
/// `degraded` 是 DSH 侧"读不了但指纹没变就不用重试"的 (path, fingerprint,
/// reason) 三元组；Codex 没有这个概念，永远是空数组。
fn read_cache_v2(cached: &Value) -> Option<(Vec<CachedSession>, Vec<DegradedTriple>)> {
    if cached.get("schema_version").and_then(Value::as_str) != Some("3") {
        return None;
    }
    let arr = cached.get("sessions")?.as_array()?;
    let mut sessions = Vec::with_capacity(arr.len());
    for s in arr {
        let paths: Vec<String> =
            s.get("paths")?.as_array()?.iter().map(|v| v.as_str().map(str::to_owned)).collect::<Option<_>>()?;
        let fingerprints: Vec<String> = s
            .get("fingerprints")?
            .as_array()?
            .iter()
            .map(|v| v.as_str().map(str::to_owned))
            .collect::<Option<_>>()?;
        // 平行数组长度不一致或没有任何依赖路径 → 这条记录形状本身就坏了，
        // 整份缓存不值得信任（不做"部分行能读就先用着"这种没有测试能钉住
        // 的半信半疑语义），落回调用方的全量重建。
        if paths.len() != fingerprints.len() || paths.is_empty() {
            return None;
        }
        let envelope = s.get("envelope")?.clone();
        sessions.push(CachedSession { paths, fingerprints, envelope });
    }
    let degraded = cached
        .get("degraded")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|d| {
                    Some((
                        d.get("path")?.as_str()?.to_string(),
                        d.get("fingerprint")?.as_str()?.to_string(),
                        d.get("reason")?.as_str()?.to_string(),
                    ))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Some((sessions, degraded))
}

/// 已构建的 session：core 数据 + 它依赖的源路径/指纹（用于下一次写 cache）。
struct BuiltSession {
    entry: PendingEntry,
    paths: Vec<String>,
    fingerprints: Vec<String>,
}

/// 核对每条缓存 session 的**全部**依赖路径是否仍与当前指纹表一致——一个都不
/// 差才能整条复用（跳过重新审计），否则整条判脏、连同它没变的那部分文件一
/// 起交回调用方按 session_id 重建（不做"部分文件命中就拼一半"这种语义）。
/// 返回复用集 + 它们覆盖到的路径集合（后者用于算出 `to_process`）。
fn kept_sessions(cached: &[CachedSession], fp_map: &HashMap<&str, &str>) -> (Vec<BuiltSession>, HashSet<String>) {
    let mut kept = Vec::new();
    let mut covered = HashSet::new();
    for cs in cached {
        let all_match =
            cs.paths.iter().zip(&cs.fingerprints).all(|(p, fp)| fp_map.get(p.as_str()) == Some(&fp.as_str()));
        if !all_match {
            continue;
        }
        let Some(restored) = entry_from_envelope(&cs.envelope) else { continue };
        let payload = cs.envelope.get("session").cloned().unwrap_or(Value::Null);
        kept.push(BuiltSession {
            entry: PendingEntry { key: restored.key, payload, revision: restored.session_revision },
            paths: cs.paths.clone(),
            fingerprints: cs.fingerprints.clone(),
        });
        covered.extend(cs.paths.iter().cloned());
    }
    (kept, covered)
}

/// 同上，但用于 DSH 的"读不了、且内容没变"的文件——指纹没变就不用再解压/
/// 重新尝试一次，否则一个长期损坏的会话文件会在每次点 tab 时都白付一次 I/O。
fn kept_degraded(
    cached: &[DegradedTriple],
    fp_map: &HashMap<&str, &str>,
) -> (Vec<(String, String)>, HashSet<String>) {
    let mut kept = Vec::new();
    let mut covered = HashSet::new();
    for (path, fp, reason) in cached {
        if fp_map.get(path.as_str()) == Some(&fp.as_str()) {
            kept.push((path.clone(), reason.clone()));
            covered.insert(path.clone());
        }
    }
    (kept, covered)
}

/// 纯缓存命中（一个 session 都没变）时的恢复路径：不重排、不重算 store_seq、
/// 不写盘——`generated_at`/`source_statuses` 原样取自 cache 文档本身（与旧 v1
/// 的纯读路径同一条纪律：一次真正的"什么都没变"不该比它更贵）。
fn cache_v2_to_store(cached: &Value, sessions: &[CachedSession]) -> Option<SessionStore> {
    let generated_at = cached.get("generated_at").and_then(Value::as_str)?.to_string();
    let source_statuses = cached.get("source_statuses").cloned()?;
    let mut entries = Vec::with_capacity(sessions.len());
    for cs in sessions {
        entries.push(entry_from_envelope(&cs.envelope)?);
    }
    entries.sort_by(|a, b| sort_key(&a.key).cmp(&sort_key(&b.key)));
    Some(SessionStore { entries, source_statuses, generated_at })
}

/// 合并 kept + 新重建的 session，按稳定序重排、重新赋 store_seq（增量重建之
/// 外的任何变化都会挪动全局排序位置——store_seq/store_revision 从不承诺跨重
/// 建稳定，只承诺同一次构建内确定，分页 cursor 靠 `store_revision` 校验新
/// 鲜度，见 core `r2a` 设计），写 v2 cache。
fn finalize_and_write(
    source: &str,
    cache_path: &Path,
    mut sessions: Vec<BuiltSession>,
    generated_at: String,
    source_statuses: Value,
    degraded: Vec<DegradedTriple>,
) -> SessionStore {
    sessions.sort_by(|a, b| sort_key(&a.entry.key).cmp(&sort_key(&b.entry.key)));
    let mut raw = Vec::with_capacity(sessions.len());
    let mut paths_fps = Vec::with_capacity(sessions.len());
    for s in sessions {
        raw.push(s.entry);
        paths_fps.push((s.paths, s.fingerprints));
    }
    let entries = build_entries(&raw, &generated_at, &source_statuses);
    let store = SessionStore { entries, source_statuses, generated_at };
    write_cache_v2(cache_path, source, &store, &paths_fps, &degraded);
    store
}

/// v3 cache 文件形状（只写自己的可删 app cache，§3.5）：
/// `{schema_version:"3", source, built_at, source_statuses, generated_at,
///   sessions:[{paths, fingerprints, envelope}], degraded:[{path,
///   fingerprint, reason}]}`。`store.entries[i]` 与 `sessions[i]` 的
/// `paths`/`fingerprints` 必须同序——两者都源自 `finalize_and_write` 里同一次
/// 排序后的 `Vec<BuiltSession>`，不是事后再配对。
fn write_cache_v2(
    path: &Path,
    source: &str,
    store: &SessionStore,
    sessions: &[(Vec<String>, Vec<String>)],
    degraded: &[DegradedTriple],
) {
    let session_docs: Vec<Value> = store
        .entries
        .iter()
        .zip(sessions)
        .map(|(e, (paths, fps))| json!({ "paths": paths, "fingerprints": fps, "envelope": e.envelope.clone() }))
        .collect();
    let degraded_docs: Vec<Value> =
        degraded.iter().map(|(p, fp, r)| json!({ "path": p, "fingerprint": fp, "reason": r })).collect();
    let doc = json!({
        "schema_version": "3",
        "source": source,
        "built_at": store.generated_at,
        "source_statuses": store.source_statuses,
        "generated_at": store.generated_at,
        "sessions": session_docs,
        "degraded": degraded_docs,
    });
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let text = serde_json::to_string(&doc).unwrap_or_default();
    // 原子写：两个 `sessions list` 并发（后台预热 + 用户点 tab）可能同时写同一份
    // cache，直接 fs::write 会交错出半截 JSON。先写同名 .tmp 再 rename——读者要么
    // 看到旧完整文件要么看到新完整文件，绝不看到中间态。
    let tmp = path.with_extension("json.tmp");
    if std::fs::write(&tmp, text).is_ok() {
        let _ = std::fs::rename(&tmp, path);
    }
}

/// 单个 session_id 的完整重建（复用既有 `codex_session_audit_json`）。Codex 一
/// 个逻辑 session 天然可能横跨多个 rollout 文件（resume 续写产生新文件、沿用
/// 旧 session_id）——payload 自带的 `files` 字段就是这个 session 依赖的**全
/// 部**源路径，不用另外发明映射，直接拿来做增量缓存的 paths/fingerprints。
fn codex_built_session_for(home: &Path, sid: &str, ns: &str, fp_map: &HashMap<&str, &str>) -> Option<BuiltSession> {
    let payload = csa::codex_session_audit_json(home, sid)?;
    let source_profile = payload
        .get("workspace_roots")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(", "))
        .unwrap_or_default();
    let paths: Vec<String> = payload
        .get("files")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_str).map(str::to_owned).collect())
        .unwrap_or_default();
    let fingerprints: Vec<String> =
        paths.iter().map(|p| fp_map.get(p.as_str()).map(|f| f.to_string()).unwrap_or_default()).collect();
    Some(BuiltSession {
        entry: PendingEntry {
            key: SessionKey::new("codex", sid, &source_profile, ns),
            payload,
            // Codex 的 revision = 载荷 date_last，从 summary 派生即可。
            revision: None,
        },
        paths,
        fingerprints,
    })
}

/// 变化文件 → 会话 id：claude 的 session_id = 文件名 stem（
/// `claude_session.rs::file_info` 的同一派生），`claude_project_files` 分组键。
/// 只在**变化或新出现**的文件上跑（镜像 codex 的 §「成本 = O(变化文件数)」纪律）。
fn claude_session_id_of(path: &Path) -> String {
    path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown").to_string()
}

/// 单个 session_id 的完整重建（复用既有 `claude_session_audit_json`）。镜像
/// `codex_built_session_for`：claude 一个逻辑 session 同样可能横跨多个 jsonl 文件
/// （resume 续写），payload 自带的 `files` 数组就是这个 session 依赖的全部源路径，
/// 直接拿来做增量缓存的 paths/fingerprints。`source_profile` 取 payload 的 `cwd`
/// 键（dsh 同款 `--{cwd.replace('/','-')}--` 形状；claude 载荷的 cwd 来自
/// workspace_roots 首个，缺席时诚实空串）。revision = 载荷 date_last（codex 同款
/// 派生，`revision: None`）。
fn claude_built_session_for(home: &Path, sid: &str, ns: &str, fp_map: &HashMap<&str, &str>) -> Option<BuiltSession> {
    let payload = agent_vitals_hosts::claude_session::claude_session_audit_json(home, sid)?;
    let source_profile = dsh_source_profile(payload.get("cwd").and_then(Value::as_str));
    let paths: Vec<String> = payload
        .get("files")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_str).map(str::to_owned).collect())
        .unwrap_or_default();
    let fingerprints: Vec<String> =
        paths.iter().map(|p| fp_map.get(p.as_str()).map(|f| f.to_string()).unwrap_or_default()).collect();
    Some(BuiltSession {
        entry: PendingEntry {
            key: SessionKey::new("claude-code", sid, &source_profile, ns),
            payload,
            revision: None,
        },
        paths,
        fingerprints,
    })
}

/// 单个 DSH 源文件 → 一个逻辑 session（1 文件 = 1 session，见
/// `dsh_source_fingerprints` 的注释）。读不了/畸形/无 id → `Err((path, reason,
/// fingerprint))`，调用方记进 degraded（§4.3 绝不数成 0 条真数据）；fingerprint
/// 一并带出是为了让 degraded 记录也能存进 v2 cache，下次内容没变就不用重试。
fn dsh_built_session_for(
    path: &Path,
    ws: &agent_vitals_runtime::sessions::discovery::WorkspaceIndex,
    fp_map: &HashMap<&str, &str>,
    ns: &str,
) -> Result<BuiltSession, DegradedTriple> {
    let path_str = path.display().to_string();
    let fp = fp_map.get(path_str.as_str()).map(|f| f.to_string()).unwrap_or_default();
    let text = match agent_vitals_hosts::dsh_sources::read_session_text(path) {
        Ok(t) => t,
        Err(code) => return Err((path_str, code.to_string(), fp)),
    };
    // 头行有效性由 parse_session_log 验（type=="session" && version==0），这里
    // 只抽 id + cwd；parse 已通过但缺 id → 无法建键 → missing-header。
    if agent_vitals_hosts::dsh_sources::parse_session_log(&text).get("degraded").and_then(Value::as_str).is_some() {
        return Err((path_str, "missing-header".to_string(), fp));
    }
    let Some((id, cwd)) = dsh_header(&text) else {
        return Err((path_str, "missing-header".to_string(), fp));
    };
    let Some(mut payload) = agent_vitals_runtime::sessions::behavior::audit_payload(path) else {
        // 读之间文件被截断/替换（parse 干净但 audit 重建失败）→ 文件级降级。
        return Err((path_str, "file-missing".to_string(), fp));
    };
    if let Some((_, title)) = ws.by_session.get(&id) {
        if let Some(o) = payload.as_object_mut() {
            o.insert("title".to_string(), Value::String(title.clone()));
        }
    }
    let revision = dsh_session_revision(&text);
    Ok(BuiltSession {
        entry: PendingEntry {
            key: SessionKey::new("dsh", &id, &dsh_source_profile(cwd.as_deref()), ns),
            payload,
            revision,
        },
        paths: vec![path_str],
        fingerprints: vec![fp],
    })
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
///   · `--host-kind claude-code` → 只填充 claude-code 源；unavailable 判定与 dsh
///     同款（文件在但一个都构建不出 → 错误码；没装 Claude Code → 诚实零 → 空页）；
///   · no-filter → `SessionStore::all`（三源合并，`source_statuses` 给完整视图）。
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
        Some("claude-code") => {
            let s = match SessionStore::claude_code(home) {
                Ok(s) => s,
                Err(e) => exit_with_error(e, "session store population failed"),
            };
            if s.source_statuses
                .get("claude-code")
                .and_then(|d| d.get("status"))
                .and_then(Value::as_str)
                == Some("unavailable")
            {
                exit_with_error(
                    StoreError::SourceUnavailable,
                    "claude-code source unavailable: session files exist but none are decodable (§4.3)",
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
        "claude-code" => match SessionStore::claude_code(home) {
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
            if json_out || key.host_kind == "dsh" || key.host_kind == "claude-code" {
                // dsh / claude-code 没有 CLI 的 HTML 渲染器（那是 Tauri 审计 tab
                // 的活）——非 --json 的 read 直接给 pretty JSON，不走 codex 渲染器
                // （`render_codex_session` 是 codex 专属形状，喂 claude/dsh 载荷
                // 会渲染错）。
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

// ── sessions navigation（多宿主导航投影，spec §5.1/§5.2）─────────

/// `sessions navigation`：单只读投影命令，一次 spawn 返回三宿主快照
/// （`docs/MENUBAR_MULTIHOST_NAVIGATION_SPEC.md` §5.1/§5.2）。排序、日界折叠、
/// 覆盖率、会话计数全部是数据层的测量（§6 决策 3）——Tauri 只缓存渲染，不重新
/// 解释。宿主失败彼此隔离：store 构建失败 / 该宿主无数据源 → 对应宿主
/// `unavailable`，不 abort 全命令；托盘宿主区失败不影响顶层今日/预算行（§8）。
pub fn sessions_navigation(home: &Path, day_key: &str, timezone: &str, recent_n: usize, json_out: bool) {
    if timezone != "Asia/Shanghai" {
        eprintln!(
            "unsupported --timezone {timezone:?}: only Asia/Shanghai (core day boundary is fixed UTC+8, no DST; §5.1)"
        );
        std::process::exit(2);
    }
    // 三宿主 store 独立构建：失败各自降级（unavailable），不 abort。
    let dsh_store = SessionStore::dsh(home);
    let codex_store = SessionStore::codex(home);
    let claude_store = SessionStore::claude_code(home);

    // DSH 今日 token：today.json → core `today_cost`——与 Tauri 顶层钱行同一函数
    // （§5.2 basis=state-file；date stale / 缺场 → None → value=null，不编 0）。
    let pricing = agent_vitals_domain::cost::load_pricing();
    let today_data = agent_vitals_runtime::state::read_json(&agent_vitals_runtime::state::state_dir().join("today.json"));
    let dsh_today_tokens: Value = match today_data
        .as_ref()
        .and_then(|d| agent_vitals_domain::cost::today_cost(d, &pricing, day_key))
    {
        Some(r) => json!({
            "value": r.get("tokens").and_then(Value::as_i64),
            "basis": "state-file",
            // spec：DSH coverage 恒 complete——state 折叠的覆盖率是 state 层
            // 自己的轴（日历已单独展示），菜单不重复读。
            "coverage": "complete",
        }),
        None => json!({ "value": Value::Null, "basis": Value::Null, "coverage": "complete" }),
    };

    // Codex 今日 token：全 rollout 折叠（codex-cost 同一条链路，§2.3）。只在
    // 该宿主有数据源时折叠——无源反正 unavailable，省掉整次折叠 I/O。
    let codex_merged: Option<Value> = codex_store
        .as_ref()
        .ok()
        .filter(|s| host_has_source("codex", s))
        .map(|_| {
            let mut folds: Vec<Value> = Vec::new();
            for path in agent_vitals_hosts::codex_session::codex_rollout_files(home) {
                let parsed = agent_vitals_hosts::codex_session::read_codex_session_log(&path);
                let items = parsed
                    .get("items")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                folds.push(agent_vitals_hosts::codex_usage::codex_fold_file(&items));
            }
            agent_vitals_hosts::codex_usage::codex_merge_folds(&folds)
        });
    let codex_today_tokens: Value = match &codex_merged {
        Some(merged) => codex_today_tokens_json(merged, day_key, codex_store.as_ref().map_or(true, |s| s.entries.is_empty())),
        None => json!({ "value": Value::Null, "basis": Value::Null, "coverage": Value::Null }),
    };

    // Claude 今日 token：读 ledger 当日（spec §5.2 basis=ledger）。不依赖 claude
    // store 是否构建成功——ledger 是 claude-sync（同一批 ~/.claude 文件的独立
    // 账，tick 里先于宿主区刷新）的产物，导航只读它，不跨写。当日缺席 → None →
    // null 三元组（「今天没测到」，不是 0）；「空日不落 ledger」是 claude_cost.rs
    // 的写侧纪律（见 agent_vitals_runtime::sessions::claude_ledger 的注释）。
    let claude_today_tokens: Value =
        match agent_vitals_runtime::sessions::claude_ledger::claude_ledger_day_tokens(day_key) {
            Some(tokens) => json!({
                "value": tokens,
                "basis": "ledger",
                "coverage": "complete",
            }),
            None => json!({ "value": Value::Null, "basis": Value::Null, "coverage": Value::Null }),
        };

    let hosts = json!([
        host_snapshot("dsh", dsh_store.as_ref().ok(), dsh_today_tokens, day_key, recent_n),
        host_snapshot("codex", codex_store.as_ref().ok(), codex_today_tokens, day_key, recent_n),
        host_snapshot("claude-code", claude_store.as_ref().ok(), claude_today_tokens, day_key, recent_n),
    ]);
    // envelope 的 generated_at 取三 store 中较新的构建时刻（`SessionStore::all`
    // 的 max 同款语义；缓存共享时两侧逐字节一致——差分门靠它）。三 store 都
    // 失败时用当前时刻（该形态没有可共享的墙钟）。
    let generated_at = dsh_store
        .as_ref()
        .ok()
        .map(|s| s.generated_at.as_str())
        .into_iter()
        .chain(codex_store.as_ref().ok().map(|s| s.generated_at.as_str()))
        .chain(claude_store.as_ref().ok().map(|s| s.generated_at.as_str()))
        .max()
        .map(str::to_string)
        .unwrap_or_else(now_iso_utc);
    let envelope = json!({
        "schema_version": 1,
        "day_key": day_key,
        "timezone": timezone,
        "generated_at": generated_at,
        "hosts": hosts,
    });
    let text = serde_json::to_string_pretty(&envelope).unwrap_or_default();
    if json_out {
        println!("{text}");
    } else {
        print!("{}", render_navigation(&envelope));
    }
}

/// 单宿主快照组装（纯，可测）。`store` None = 构建失败 → 整宿主 `unavailable`
/// （spec §8：宿主区失败不 abort、也不摆 0 冒充）。「该宿主无数据源」——store 的
/// `source_statuses[host].roots` 全 exists=false（~/.codex / ~/.dsh / ~/.claude
/// 从未安装；与 `sessions list` 的「没有 DSH = 诚实零」不同面：托盘固定渲染
/// 三行，未安装的宿主显示「—」而不是「0 会话」，spec §8）——同样 unavailable。
/// DSH store 自报 `unavailable`（文件在但一个都读不了，§4.3）也归这一档。
fn host_snapshot(
    host_kind: &str,
    store: Option<&SessionStore>,
    today_tokens: Value,
    day_key: &str,
    recent_n: usize,
) -> Value {
    let unavailable = || {
        json!({
            "host_kind": host_kind,
            "status": "unavailable",
            "today_tokens": Value::Null,
            "today_sessions": Value::Null,
            "recent": [],
            "store_revision": Value::Null,
        })
    };
    let Some(store) = store.filter(|s| host_has_source(host_kind, s)) else {
        return unavailable();
    };
    if store
        .source_statuses
        .get(host_kind)
        .and_then(|s| s.get("status"))
        .and_then(Value::as_str)
        == Some("unavailable")
    {
        return unavailable();
    }

    // 今日会话数：date_span 与 [day_key, day_key] 交叠（`SessionFilter::matches`
    // 同语义）；无日期的 degraded 会话不计入。这是「今天碰过的会话」计数，不是
    // token 归属判定——跨日会话计 1 次是对的，它今天确实活跃（spec §5.2）。
    let filter = SessionFilter {
        host_kind: Some(host_kind.to_string()),
        date_from: Some(day_key.to_string()),
        date_to: Some(day_key.to_string()),
        ..SessionFilter::default()
    };
    let today_sessions = store.entries.iter().filter(|e| filter.matches(e)).count();

    // 最近 N：**全量排序后取前 N**，不分页（§6 决策 2——`sessions list` 是
    // SessionKey 序，页内取最近 ≠ 全局最近；导航命令读全量 summaries 排完取前
    // N）。比较器 `recent_cmp` 在 core（r2a.rs ↔ r2a.py 锁步）。
    let mut recent_entries: Vec<&SessionReportEntry> = store.entries.iter().collect();
    recent_entries.sort_by(|a, b| recent_cmp(a, b));
    let recent: Vec<Value> = recent_entries
        .iter()
        .take(recent_n)
        .map(|e| {
            json!({
                // session_key 原样透传（SessionKey::to_json 的 4 字段对象），
                // 深链时 `sessions read` 期待同形状。
                "session_key": e.key.to_json(),
                "title": e.title.as_deref(),
                "model": e.model.as_deref(),
                "tokens_total": e.tokens_total,
                "date_first": e.date_first.as_deref(),
                "date_last": e.date_last.as_deref(),
                "revision": e.session_revision.as_deref(),
            })
        })
        .collect();

    // store_revision：no-filter 的 per-filter 派生 revision（命中集最大
    // store_seq，与 `list_sessions` 同款推导；空 store → 0）。
    let store_revision = store.entries.iter().map(|e| e.store_seq).max().unwrap_or(0);
    let status = if today_tokens.get("value").and_then(Value::as_i64).is_some() {
        "ready"
    } else {
        "partial"
    };
    json!({
        "host_kind": host_kind,
        "status": status,
        "today_tokens": today_tokens,
        "today_sessions": today_sessions,
        "recent": recent,
        "store_revision": store_revision,
    })
}

/// 「该宿主有数据源」= store 的 `source_statuses[host].roots` 里至少一个根
/// exists=true（见 `host_snapshot` 的语义注释）。
fn host_has_source(host_kind: &str, store: &SessionStore) -> bool {
    store
        .source_statuses
        .get(host_kind)
        .and_then(|s| s.get("roots"))
        .and_then(Value::as_array)
        .map(|roots| roots.iter().any(|r| r.get("exists").and_then(Value::as_bool).unwrap_or(false)))
        .unwrap_or(false)
}

/// Codex 今日 token（spec §5.2 basis=events）：全折叠 → `codex_aggregate_hours`
/// → 当日桶之和 + coverage：
///
///   · 零会话（store 可读且无会话）→ 0（真零，诚实测量不是编造）；
///   · `by_hour_model` 空（读到了会话但没计量）→ value=null、coverage=null
///     （诚实「测不出」）；
///   · 当日桶存在 → value=和、coverage=partial（残差哨兵 tokens_seen>0，当日
///     数可能是下界）/ complete；
///   · 当日桶缺席（他日有计量、今天没有）→ value=null（「当日桶之和」的诚实
///     形态——spec 只给零会话一个显式 0，「今天没跑」与「今天没测到」不混成
///     一个 0）。
fn codex_today_tokens_json(merged: &Value, day_key: &str, zero_sessions: bool) -> Value {
    if zero_sessions {
        return json!({ "value": 0, "basis": "events", "coverage": "complete" });
    }
    let by_hour = merged.get("by_hour_model").unwrap_or(&Value::Null);
    if !by_hour.as_object().is_some_and(|m| !m.is_empty()) {
        return json!({ "value": Value::Null, "basis": Value::Null, "coverage": Value::Null });
    }
    let by_date = agent_vitals_hosts::codex_usage::codex_aggregate_hours(by_hour);
    let Some(value) = agent_vitals_hosts::codex_usage::codex_day_tokens(&by_date, day_key) else {
        return json!({ "value": Value::Null, "basis": Value::Null, "coverage": Value::Null });
    };
    let unaccounted = merged.get("unaccounted").unwrap_or(&Value::Null);
    let coverage = if agent_vitals_hosts::codex_usage::unaccounted_tokens_seen(unaccounted) > 0 {
        "partial"
    } else {
        "complete"
    };
    json!({ "value": value, "basis": "events", "coverage": coverage })
}

/// 人读的导航投影（`--json` 之外）：每宿主一行 L1 + 缩进 L2。与 JSON 同一份
/// 数据，别另起炉灶；格式是展示层选择，但两实现必须逐字节一致——差分门比的
/// 是 stdout。L2 文案与 Tauri 菜单同一批（§8：「会话数据暂不可用」/「尚无
/// 会话」）。
fn render_navigation(env: &Value) -> String {
    let mut out = String::new();
    out.push_str(&format!(
        "navigation {} (schema {})\n",
        env.get("day_key").and_then(Value::as_str).unwrap_or(""),
        env.get("schema_version").and_then(Value::as_u64).unwrap_or(0),
    ));
    for h in env.get("hosts").and_then(Value::as_array).into_iter().flatten() {
        let kind = h.get("host_kind").and_then(Value::as_str).unwrap_or("");
        let status = h.get("status").and_then(Value::as_str).unwrap_or("");
        let tk = h.get("today_tokens").unwrap_or(&Value::Null);
        let val = tk
            .get("value")
            .and_then(Value::as_i64)
            .map(|v| v.to_string())
            .unwrap_or_else(|| "—".to_string());
        let ts = h
            .get("today_sessions")
            .and_then(Value::as_u64)
            .map(|v| v.to_string())
            .unwrap_or_else(|| "—".to_string());
        out.push_str(&format!("{kind:<8} {status:<11} {val} · {ts} 会话\n"));
        if status == "unavailable" {
            out.push_str("          · 会话数据暂不可用\n");
            continue;
        }
        let recent = h.get("recent").and_then(Value::as_array).cloned().unwrap_or_default();
        if recent.is_empty() {
            out.push_str("          · 尚无会话\n");
            continue;
        }
        for r in &recent {
            let d = r.get("date_last").and_then(Value::as_str).unwrap_or("—");
            let m = r.get("model").and_then(Value::as_str).unwrap_or("—");
            let t = r
                .get("tokens_total")
                .and_then(Value::as_i64)
                .map(|v| v.to_string())
                .unwrap_or_else(|| "—".to_string());
            out.push_str(&format!("          · {d} · {m} · {t}\n"));
        }
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
            .join("../..").join("fixtures").join("codex").join("cost");
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
            .join("../..").join("fixtures").join("dsh").join("behavior.jsonl");
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

    /// seek 版指纹必须与"整份读文件再切 128 字节"逐字节相同——这次改动是纯
    /// 性能优化（真机 631MB/115 个会话文件全读一遍是工作台点 tab 卡到假死
    /// 的根因），不是重新定义指纹格式；算出不同的值会让现有用户的
    /// `cache/r2a/*.json` 全部失效一次，虽不是灾难但也不该在没人决定的情况
    /// 下发生。覆盖首尾窗口"不重叠/恰好相接/重叠/完全重合"四种边界：0、63、
    /// 64、65、127、128、129、200 字节。
    #[test]
    fn seek_based_fingerprint_matches_full_read_reference_at_boundary_sizes() {
        fn full_read_reference(path: &std::path::Path) -> String {
            let meta = std::fs::metadata(path).unwrap();
            let size = meta.len();
            let mtime_ns = meta.modified().unwrap().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos() as u64;
            let bytes = std::fs::read(path).unwrap();
            let n = bytes.len().min(64);
            let first = &bytes[..n];
            let last = &bytes[bytes.len().saturating_sub(64)..];
            format!("{size}:{mtime_ns}:{:016x}:{:016x}", fnv1a64(first), fnv1a64(last))
        }

        let t = tmp_case();
        for size in [0usize, 1, 63, 64, 65, 127, 128, 129, 200] {
            let p = t.join(format!("f{size}.bin"));
            // 内容不是全零/全同字节——首尾窗口如果算错了范围，指纹应该能测
            // 出差异，不能靠"内容本来就到处一样"侥幸测过。
            let content: Vec<u8> = (0..size).map(|i| (i % 251) as u8).collect();
            std::fs::write(&p, &content).unwrap();
            let seek_based = fingerprint_file(&p).unwrap();
            let reference = full_read_reference(&p);
            assert_eq!(seek_based, reference, "mismatch at size={size}");
        }
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
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..").join("fixtures").join("codex").join("legacy.jsonl"),
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

    /// v2 增量缓存新路径：一个长期损坏的 DSH 文件，内容（=指纹）没变，不该在
    /// 每次不相关的重建里都被重新尝试解压一次——`kept_degraded` 必须把它的
    /// (path, fingerprint, reason) 原样带过下一次 cache，而不是让它因为"没有
    /// 任何 session 覆盖它"而回落进 `to_process` 白白重试。用一个好会话 + 一
    /// 个坏 zstd 建初版 cache，再新增第二个好会话触发一次真·增量重建，断言
    /// v2 cache 文件里 degraded 条目的 fingerprint 与初版逐字节相同。
    #[test]
    fn dsh_unchanged_degraded_file_survives_incremental_rebuild_without_flapping() {
        let _env = env_lock();
        let t = tmp_case();
        let home = fake_dsh_home(&t); // 1 个好会话：sess-behavior-0001
        let bad_dir = home.join(".dsh").join("sessions").join("--proj--").join("agent-bad");
        std::fs::create_dir_all(&bad_dir).unwrap();
        std::fs::write(bad_dir.join("session.jsonl.zstd"), b"\x28\xb5\x2f\xfd\xff").unwrap();
        let av = t.join("av");
        std::fs::create_dir_all(&av).unwrap();
        let _g = EnvGuard::set(&home, &av);

        let a = SessionStore::dsh(&home).expect("populate ok");
        assert_eq!(a.entries.len(), 1);
        let deg_a = a.source_statuses["dsh"]["degraded"].as_array().unwrap();
        assert_eq!(deg_a.len(), 1);
        let cache_a: Value = serde_json::from_str(&std::fs::read_to_string(dsh_cache_path()).unwrap()).unwrap();
        assert_eq!(cache_a["schema_version"], "3");
        let fp_before = cache_a["degraded"][0]["fingerprint"].as_str().unwrap().to_string();
        assert!(!fp_before.is_empty(), "degraded entries must carry a real fingerprint, not a placeholder");

        // 新增一个不相关的好会话——只有它需要被重建，坏文件内容/指纹全程未动。
        let dir2 = home.join(".dsh").join("sessions").join("--proj2--").join("agent-2");
        std::fs::create_dir_all(&dir2).unwrap();
        let src = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..").join("fixtures").join("dsh").join("behavior.jsonl");
        let text = std::fs::read_to_string(&src).unwrap();
        // 换一个不同的 header id，避免与既有会话撞 native_id。
        let text2 = text.replacen("sess-behavior-0001", "sess-behavior-0002", 1);
        std::fs::write(dir2.join("session.jsonl"), text2).unwrap();

        let b = SessionStore::dsh(&home).expect("populate ok");
        assert_eq!(b.entries.len(), 2, "the new session must be picked up incrementally");
        let deg_b = b.source_statuses["dsh"]["degraded"].as_array().unwrap();
        assert_eq!(deg_b.len(), 1, "the untouched degraded file must not duplicate or vanish");
        assert_eq!(deg_b[0]["reason"], "zstd-decode-error");

        let cache_b: Value = serde_json::from_str(&std::fs::read_to_string(dsh_cache_path()).unwrap()).unwrap();
        let fp_after = cache_b["degraded"][0]["fingerprint"].as_str().unwrap();
        assert_eq!(fp_after, fp_before, "unchanged degraded file's fingerprint must round-trip byte-identical");
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

    /// 建 fake Claude Code home：`home/.claude/projects/<slug>/<stem>.jsonl`。
    /// 把 fixtures/claude 的三个合成日志拷进去 → 3 个逻辑 session（session_id =
    /// 文件 stem：healthy / dangerous / all-recorded）。
    fn fake_claude_home(t: &Path) -> PathBuf {
        let home = t.join("home");
        fake_claude_under(&home);
        home
    }

    /// 在既有 home 下补 Claude 会话（供三源合并测试复用）。
    fn fake_claude_under(home: &Path) {
        let claude = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..").join("fixtures").join("claude");
        for name in ["healthy.jsonl", "dangerous.jsonl", "all-recorded.jsonl"] {
            let dir = home.join(".claude").join("projects").join("p-skill-vitals");
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::copy(claude.join(name), dir.join(name)).unwrap();
        }
    }

    /// 「没有 Claude Code」是诚实零：projects 根缺席 → 0 条目 + status ok/0，
    /// **不是** unavailable（镜像 dsh 的「诚实零」纪律——unavailable 只留给
    /// 「文件在但一个都构建不出」）。roots 报告 exists=false 一并可见。
    #[test]
    fn claude_populate_absent_home_is_ok_zero() {
        let _env = env_lock();
        let t = tmp_case();
        let home = t.join("home");
        std::fs::create_dir_all(&home).unwrap();
        let av = t.join("av");
        std::fs::create_dir_all(&av).unwrap();
        let _g = EnvGuard::set(&home, &av);

        let store = SessionStore::claude_code(&home).expect("populate ok");
        assert_eq!(store.entries.len(), 0);
        assert_eq!(store.source_statuses["claude-code"]["status"], "ok");
        assert_eq!(store.source_statuses["claude-code"]["sessions"], 0);
        let roots = store.source_statuses["claude-code"]["roots"].as_array().unwrap();
        assert_eq!(roots.len(), 1);
        assert_eq!(roots[0]["kind"], "projects");
        assert_eq!(roots[0]["exists"], false);
        assert_eq!(roots[0]["file_count"], 0);
        assert!(claude_cache_path().is_file(), "0 sessions is still a memo");
    }

    /// fake claude home → 3 个逻辑会话：native_id = 文件 stem、host_kind =
    /// claude-code、source_profile = payload cwd 的 dsh 同款清洗
    /// （`--/repo--` 的 `/` → `-`）、title/model/date_span 从 audit 载荷派生、
    /// findings_total = audit.summary 计数（dangerous 的 SV601 = 1）、files = 1。
    /// tokens_total/cost_usd 诚实 None——claude 载荷没有 cost_report（§9 是设计
    /// 不是实现），列表显示「—」而不是编造数字。
    #[test]
    fn claude_populate_builds_entries_from_fake_home() {
        let _env = env_lock();
        let t = tmp_case();
        let home = fake_claude_home(&t);
        let av = t.join("av");
        std::fs::create_dir_all(&av).unwrap();
        let _g = EnvGuard::set(&home, &av);

        let store = SessionStore::claude_code(&home).expect("populate ok");
        assert_eq!(store.entries.len(), 3);
        let by_id: std::collections::HashMap<&str, &SessionReportEntry> =
            store.entries.iter().map(|e| (e.key.native_id.as_str(), e)).collect();
        let healthy = by_id["healthy"];
        assert_eq!(healthy.key.host_kind, "claude-code");
        assert_eq!(healthy.key.source_profile, "---repo--", "cwd /repo → / 替换为 -");
        assert_eq!(healthy.title.as_deref(), Some("我的会话"));
        assert_eq!(healthy.model.as_deref(), Some("claude-sonnet-4-5"));
        assert_eq!(healthy.date_first.as_deref(), Some("2026-08-20T14:27:00Z"));
        assert_eq!(healthy.date_last.as_deref(), Some("2026-08-20T14:30:00Z"));
        assert_eq!(healthy.files, 1);
        assert!(healthy.cost_usd.is_none(), "no cost_report → honest None");
        assert!(healthy.tokens_total.is_none(), "no cost_report → honest None");
        assert_eq!(healthy.findings_total, 0);
        assert_eq!(by_id["dangerous"].findings_total, 1, "SV601 from dangerous fixture");
        assert_eq!(by_id["dangerous"].title.as_deref(), Some("危险命令会话"));
        assert_eq!(by_id["all-recorded"].title.as_deref(), Some("全覆盖会话"));
        let env = &by_id["healthy"].envelope;
        assert_eq!(env["session_key"]["host_kind"], "claude-code");
        assert!(env["session"].get("files").is_some(), "payload files array survives");
        assert_eq!(env["source_statuses"]["claude-code"]["status"], "ok");
        assert_eq!(env["source_statuses"]["claude-code"]["sessions"], 3);
    }

    /// claude cache 快路径：两次调用逐字节一致（含 envelope 里的 statuses）、
    /// cache 文件存在、删 cache 重建仍一致——cache 只是可删 memo（codex 同款）。
    #[test]
    fn claude_populate_cache_delete_rebuild_is_identical() {
        let _env = env_lock();
        let t = tmp_case();
        let home = fake_claude_home(&t);
        let av = t.join("av");
        std::fs::create_dir_all(&av).unwrap();
        let _g = EnvGuard::set(&home, &av);

        let a = SessionStore::claude_code(&home).unwrap();
        let b = SessionStore::claude_code(&home).unwrap();
        assert_eq!(store_bytes(&a), store_bytes(&b), "cache hit must be byte-identical");
        assert!(claude_cache_path().is_file());
        std::fs::remove_file(claude_cache_path()).unwrap();
        let c = SessionStore::claude_code(&home).unwrap();
        assert_eq!(store_bytes(&a), store_bytes(&c), "cache delete + rebuild identical");
    }

    /// 源变化（新会话文件）→ 指纹不等 → 只重建变化的 session（v2 增量），新
    /// 会话必须出现、旧会话原样保留（缓存不能把新文件藏起来）。
    #[test]
    fn claude_source_change_invalidates_cache() {
        let _env = env_lock();
        let t = tmp_case();
        let home = fake_claude_home(&t);
        let av = t.join("av");
        std::fs::create_dir_all(&av).unwrap();
        let _g = EnvGuard::set(&home, &av);

        let a = SessionStore::claude_code(&home).unwrap();
        assert_eq!(a.entries.len(), 3);
        // 新增一个会话：同一份 dangerous 记录、不同 stem（= 新 session_id）。
        let claude = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..").join("fixtures").join("claude");
        std::fs::copy(claude.join("dangerous.jsonl"), home.join(".claude").join("projects").join("p-skill-vitals").join("another.jsonl")).unwrap();
        let b = SessionStore::claude_code(&home).unwrap();
        assert_eq!(b.entries.len(), 4);
        assert!(b.entries.iter().any(|e| e.key.native_id == "another"));
    }

    /// 文件在但一个都构建不出 → 源 `unavailable`（CLI 面对 `--host-kind
    /// claude-code` 报 source-unavailable 错误码，不是空页；镜像 dsh §3.3/§4.3）。
    /// 一条坏行毁整份（parse degraded）→ audit 无记录 → session 丢弃。claude 的
    /// 逐文件 degraded 数组不引入——按 session 构建，损坏文件下次重试（codex 同款）。
    #[test]
    fn claude_populate_all_degraded_is_unavailable() {
        let _env = env_lock();
        let t = tmp_case();
        let home = t.join("home");
        let dir = home.join(".claude").join("projects").join("p");
        std::fs::create_dir_all(&dir).unwrap();
        // 非 JSON 内容 → parse_claude_session_log 降级 → 0 条记录 → 构建不出。
        std::fs::write(dir.join("bad.jsonl"), "not json at all\n").unwrap();
        let av = t.join("av");
        std::fs::create_dir_all(&av).unwrap();
        let _g = EnvGuard::set(&home, &av);

        let store = SessionStore::claude_code(&home).expect("populate ok");
        assert_eq!(store.entries.len(), 0);
        assert_eq!(store.source_statuses["claude-code"]["status"], "unavailable");
        assert_eq!(store.source_statuses["claude-code"]["sessions"], 0);
        let roots = store.source_statuses["claude-code"]["roots"].as_array().unwrap();
        assert_eq!(roots[0]["file_count"], 1, "file exists but none decodable");
    }

    /// no-filter = 三源合并：3 claude-code + 3 codex + 1 dsh = 7；稳定序
    /// claude-code 全部在前（sort_key 字典序 "claude-code" < "codex" < "dsh"）；
    /// `source_statuses` 键序 = [claude-code, codex, dsh]（preserve_order 下键序
    /// 是字节序）；generated_at = 三源 max。
    #[test]
    fn claude_all_merges_three_sources() {
        let _env = env_lock();
        let t = tmp_case();
        let home = fake_codex_home(&t);
        fake_dsh_under(&home);
        fake_claude_under(&home);
        let av = t.join("av");
        std::fs::create_dir_all(&av).unwrap();
        let _g = EnvGuard::set(&home, &av);

        let store = SessionStore::all(&home).expect("populate ok");
        assert_eq!(store.entries.len(), 7);
        let hosts: Vec<&str> = store.entries.iter().map(|e| e.key.host_kind.as_str()).collect();
        assert_eq!(
            hosts,
            vec!["claude-code", "claude-code", "claude-code", "codex", "codex", "codex", "dsh"]
        );
        let keys: Vec<&str> = store.source_statuses.as_object().unwrap().keys().map(String::as_str).collect();
        assert_eq!(keys, vec!["claude-code", "codex", "dsh"], "key order is byte order");
        assert_eq!(store.source_statuses["claude-code"]["status"], "ok");
        assert_eq!(store.source_statuses["codex"]["status"], "ok");
        assert_eq!(store.source_statuses["dsh"]["status"], "ok");
        assert!(store.generated_at >= SessionStore::claude_code(&home).unwrap().generated_at);
        let page = store.list(&SessionFilter::default(), None, 10).unwrap();
        assert_eq!(page.total, 7);
        // claude 条目的 summary 列经合并 store 存活（title 列 + findings）。
        // 页内序 = sort_key（host_kind 同值时按 native_id：all-recorded 最前）。
        let first = page.items.first().unwrap();
        assert_eq!(first["session_key"]["host_kind"], "claude-code");
        assert_eq!(first["session_key"]["native_id"], "all-recorded");
        assert_eq!(first["title"], "全覆盖会话");
    }

    // ── sessions navigation 纯函数单测 ────────────────────────────

    fn nav_entry(
        host: &str,
        id: &str,
        date_first: Option<&str>,
        date_last: Option<&str>,
        rev: Option<&str>,
        seq: u64,
    ) -> SessionReportEntry {
        SessionReportEntry {
            key: SessionKey::new(host, id, "p", "m"),
            session_revision: rev.map(str::to_string),
            title: Some(format!("session-{id}")),
            model: Some("gpt-5.6-sol".to_string()),
            date_first: date_first.map(str::to_string),
            date_last: date_last.map(str::to_string),
            files: 1,
            cost_usd: None,
            tokens_total: Some(1000),
            findings_total: 0,
            store_seq: seq,
            envelope: Value::Null,
        }
    }

    fn nav_store(host: &str, entries: Vec<SessionReportEntry>, status: &str, any_root: bool) -> SessionStore {
        SessionStore {
            entries,
            source_statuses: json!({
                host: {
                    "status": status,
                    "roots": [{"kind": "live", "path": "/nope", "exists": any_root,
                               "file_count": 1, "total_bytes": 1}],
                }
            }),
            generated_at: "2026-09-01T00:00:00Z".to_string(),
        }
    }

    /// 无数据源（roots 全 exists=false——~/.codex / ~/.dsh / ~/.claude 从未安装）
    /// → 整宿主 unavailable（spec §8；与 `sessions list` 的「没有 DSH = 诚实零」
    /// 不同面：托盘固定渲染三行，未安装的宿主显示「—」而不是「0 会话」）。
    /// store 构建失败（None）与 DSH 自报 source-unavailable（文件在但一个都读不
    /// 了）同档。
    #[test]
    fn host_snapshot_unavailable_when_host_has_no_source() {
        let store = nav_store("codex", vec![], "ok", false);
        let snap = host_snapshot(
            "codex",
            Some(&store),
            json!({"value": 5, "basis": "events", "coverage": "complete"}),
            "2026-08-31",
            5,
        );
        assert_eq!(snap["status"], "unavailable");
        assert!(snap["today_tokens"].is_null());
        assert!(snap["today_sessions"].is_null());
        assert_eq!(snap["recent"].as_array().unwrap().len(), 0);
        assert!(snap["store_revision"].is_null());
        // store 构建失败 → 同 unavailable，today_tokens 丢弃（宿主原子降级）
        let snap2 = host_snapshot("dsh", None, json!({"value": 5}), "2026-08-31", 5);
        assert_eq!(snap2["status"], "unavailable");
        assert!(snap2["today_tokens"].is_null());
        // DSH「文件在但一个都读不了」（§4.3）→ 也归这一档，即使 roots 存在
        let store3 = nav_store("dsh", vec![], "unavailable", true);
        let snap3 = host_snapshot("dsh", Some(&store3), json!({"value": 5}), "2026-08-31", 5);
        assert_eq!(snap3["status"], "unavailable");
    }

    /// ready 宿主：today_sessions = date_span 与当日交叠的会话数（跨日会话计 1
    /// 次——它今天确实活跃，spec §5.2）；recent = 全量 recent_cmp 排序取前 N
    /// （date_span.last DESC → session_revision DESC → key ASC）；store_revision =
    /// 最大 store_seq；today_tokens.value null → partial（有会话但今天没测到，
    /// 不是没会话——两者不是一个状态）。
    #[test]
    fn host_snapshot_ready_measures_today_and_recent() {
        let entries = vec![
            nav_entry("codex", "span", Some("2026-08-01"), Some("2026-08-31"), Some("r1"), 3),
            nav_entry("codex", "old", Some("2026-08-30"), Some("2026-08-30"), Some("r2"), 2),
            nav_entry("codex", "newest", Some("2026-08-31"), Some("2026-08-31"), Some("r9"), 5),
        ];
        let store = nav_store("codex", entries, "ok", true);
        let snap = host_snapshot(
            "codex",
            Some(&store),
            json!({"value": 123, "basis": "events", "coverage": "complete"}),
            "2026-08-31",
            5,
        );
        assert_eq!(snap["status"], "ready");
        assert_eq!(snap["today_sessions"], 2); // span（跨日）+ newest；old 昨天
        assert_eq!(snap["store_revision"], 5);
        let recent = snap["recent"].as_array().unwrap();
        assert_eq!(recent.len(), 3);
        assert_eq!(recent[0]["session_key"]["native_id"], "newest");
        assert_eq!(recent[1]["session_key"]["native_id"], "span");
        assert_eq!(recent[2]["session_key"]["native_id"], "old");
        // 4 条 → recent 截断到 N
        let mut more = store.entries.clone();
        more.push(nav_entry("codex", "fourth", Some("2026-08-30"), Some("2026-08-31"), Some("r3"), 6));
        let store4 = nav_store("codex", more, "ok", true);
        let snap4 = host_snapshot(
            "codex",
            Some(&store4),
            json!({"value": 123}),
            "2026-08-31",
            2,
        );
        assert_eq!(snap4["recent"].as_array().unwrap().len(), 2);
        // value null → partial
        let snap2 = host_snapshot(
            "codex",
            Some(&store),
            json!({"value": Value::Null, "basis": Value::Null, "coverage": "complete"}),
            "2026-08-31",
            5,
        );
        assert_eq!(snap2["status"], "partial");
        assert_eq!(snap2["today_sessions"], 2); // 会话计数与 token 无关
    }

    /// Codex 今日 token 真值表（spec §5.2）：零会话 → 0（真零，唯一显式 0）；
    /// 读到了会话但没计量 → null 三连（测不出，不编 0）；当日桶缺席（他日有
    /// 计量、今天没有）→ null（「今天没跑」≠「今天没测到」）；当日桶存在 →
    /// 和，残差哨兵 tokens_seen>0 → partial。
    #[test]
    fn codex_today_tokens_json_honesty_truth_table() {
        // 零会话 → 0
        let merged = json!({"by_hour_model": {}});
        let v = codex_today_tokens_json(&merged, "2026-08-31", true);
        assert_eq!(v["value"], 0);
        assert_eq!(v["basis"], "events");
        assert_eq!(v["coverage"], "complete");
        // by_hour_model 空（有会话但没计量）→ 测不出
        let v2 = codex_today_tokens_json(&merged, "2026-08-31", false);
        assert!(v2["value"].is_null());
        assert!(v2["basis"].is_null());
        assert!(v2["coverage"].is_null());
        // 当日桶缺席 → null（即使昨天有计量）
        let merged2 = json!({
            "by_hour_model": {
                "2026-08-30T10+08:00": {"gpt-5.6-sol": {"p1": {"uncached_input_tokens": 100}}}
            },
            "unaccounted": []
        });
        let v3 = codex_today_tokens_json(&merged2, "2026-08-31", false);
        assert!(v3["value"].is_null());
        // 当日桶存在 → 当日全模型/全速度之和；残差 → partial
        let merged3 = json!({
            "by_hour_model": {
                "2026-08-31T09+08:00": {"gpt-5.6-sol": {"p1": {"uncached_input_tokens": 60}}},
                "2026-08-31T11+08:00": {"gpt-5.6-sol": {"p2": {"output_tokens": 40}}},
                "2026-08-31T23+08:00": {"other": {"p1": {"cached_input_tokens": 300}}}
            },
            "unaccounted": [{"type": "x", "count": 1, "tokens_seen": 1500}]
        });
        let v4 = codex_today_tokens_json(&merged3, "2026-08-31", false);
        assert_eq!(v4["value"], 400);
        assert_eq!(v4["basis"], "events");
        assert_eq!(v4["coverage"], "partial");
        // 无残差 → complete
        let merged4 = json!({
            "by_hour_model": {"2026-08-31T09+08:00": {"gpt-5.6-sol": {"p1": {"uncached_input_tokens": 60}}}},
            "unaccounted": []
        });
        let v5 = codex_today_tokens_json(&merged4, "2026-08-31", false);
        assert_eq!(v5["value"], 60);
        assert_eq!(v5["coverage"], "complete");
    }

    /// 人读渲染钉死逐字节文本（Python 镜像必须原样复刻——差分门比的是一整行
    /// stdout）。L2 文案与 Tauri 菜单同一批（spec §8）。
    #[test]
    fn render_navigation_is_byte_stable() {
        let env = json!({
            "schema_version": 1,
            "day_key": "2026-08-31",
            "timezone": "Asia/Shanghai",
            "generated_at": "2026-09-01T00:00:00Z",
            "hosts": [
                {
                    "host_kind": "dsh",
                    "status": "unavailable",
                    "today_tokens": Value::Null,
                    "today_sessions": Value::Null,
                    "recent": [],
                    "store_revision": Value::Null
                },
                {
                    "host_kind": "codex",
                    "status": "ready",
                    "today_tokens": {"value": 1234, "basis": "events", "coverage": "complete"},
                    "today_sessions": 2,
                    "recent": [{
                        "session_key": SessionKey::new("codex", "c1", "p", "m").to_json(),
                        "title": "a title",
                        "model": "gpt-5.6-sol",
                        "tokens_total": 500,
                        "date_first": "2026-08-31",
                        "date_last": "2026-08-31",
                        "revision": "r1"
                    }],
                    "store_revision": 5
                },
                {
                    "host_kind": "claude-code",
                    "status": "ready",
                    "today_tokens": {"value": 100, "basis": "ledger", "coverage": "complete"},
                    "today_sessions": 1,
                    "recent": [{
                        "session_key": SessionKey::new("claude-code", "cl1", "p", "m").to_json(),
                        "title": "claude title",
                        "model": "deepseek-v4-flash",
                        "tokens_total": 600,
                        "date_first": "2026-08-31",
                        "date_last": "2026-08-31",
                        "revision": "r1"
                    }],
                    "store_revision": 7
                },
            ],
        });
        let text = render_navigation(&env);
        assert_eq!(
            text,
            concat!(
                "navigation 2026-08-31 (schema 1)\n",
                // hosts 序固定 dsh → codex → claude-code（spec §5.1）
                "dsh      unavailable — · — 会话\n",
                "          · 会话数据暂不可用\n",
                "codex    ready       1234 · 2 会话\n",
                "          · 2026-08-31 · gpt-5.6-sol · 500\n",
                // claude-code 是 11 字符宿主名，{:<8} 不截断——对齐右移，逐字节钉住
                "claude-code ready       100 · 1 会话\n",
                "          · 2026-08-31 · deepseek-v4-flash · 600\n",
            )
        );
        // JSON 侧：serde_json（preserve_order）按 json! 的字面量顺序输出——
        // 键序即字节一致的一部分，Python 镜像必须按同样的构造顺序建 dict。
        let out = serde_json::to_string_pretty(&env).unwrap();
        let keys: Vec<&str> = env.as_object().unwrap().keys().map(String::as_str).collect();
        assert_eq!(keys, vec!["schema_version", "day_key", "timezone", "generated_at", "hosts"]);
        assert!(out.contains("\"host_kind\": \"dsh\""));
    }
}
