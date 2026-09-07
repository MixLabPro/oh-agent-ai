//! 扫描本机各 Agent 宿主的 skill 安装目录，输出成本清单（JSON）。
//!
//! 只做确定性统计，不做判断。判断交给调用它的 Agent。
//!
//! 关键设计：**区分「装在磁盘上」和「真的进了上下文」**。未启用的插件副本、
//! 其他宿主（Codex 等）的 skill 都在磁盘上，但不占 Claude Code 的描述预算。
//! 把它们算进去会得出「预算超支」的假警报。
//!
//! 本文件是 scripts/scan.py 的移植。输出必须与之逐字节一致 ——
//! `python3 tests/golden_runner.py` 是唯一裁判。

// 子树：skills/（静态 SKILL.md 体检）+ agent/（会话行为/成本审计）。
// dsh.rs 与 util.rs 是两世界共享，留在顶层。
mod skills;
mod agent;
mod util;

use std::path::{Path, PathBuf};

use clap::{Parser, Subcommand};
use serde_json::{json, Value};

use agent_vitals_runtime::skills::scanner::Ctx;
use util::norm;

// v0.8 Phase E7.2：覆盖优先级排序（level_rank/level_rank_for/severity_rank/
// conflict_rank/CODEX_FALLBACK_DESC_BUDGET/layer_of）+ JSON 字段取值助手
// （s/i/f/b/chars）迁进 agent-vitals-domain（纯计算，不认识宿主 wire 格式，
// 本该一直在那）。`analysis.rs`/`overlap.rs` 同一步跟着搬进 domain；
// `layer_of` 原本因为 `discovery.rs` 还在二进制里而保留 re-export，E7.5
// discovery.rs 也搬进库 crate 后这条 re-export 已无调用点，删掉——只有
// `s`/`i`/`f`/`b`（doctor/explain/report/snapshot/oneline 用）在 apps/cli
// 里还有调用点，保留 re-export 让这些 call site 零改动；其余
// （`conflict_rank`/`level_rank`/`level_rank_for`/`severity_rank`/
// `CODEX_FALLBACK_DESC_BUDGET`/`chars`）只在 domain/runtime 内部被用，不再
// re-export（`doctor.rs` 恰好有自己独立的 `severity_rank` 实现，同名不同
// 函数，不是同一份代码的两个入口）。
pub(crate) use agent_vitals_domain::util::{b, f, i, s};

/// 拒绝负数。**不能静默接受后产出垃圾** —— `--budget -1` 会算出
/// `pct_used: -6300.0` 并原样打进摘要行，一个负百分比被当成测量值输出。
/// 拒绝比编一个数好。
///
/// 需要配合 `allow_negative_numbers`：否则 clap 把 `-1` 当成另一个参数，
/// 报「未知参数」，用户看不出真正的问题在哪。
fn non_negative(s: &str) -> Result<i64, String> {
    let v: i64 = s.parse().map_err(|_| format!("not an integer: {}", s))?;
    if v < 0 {
        return Err(format!("cannot be negative (received {})", v));
    }
    Ok(v)
}

#[derive(Parser)]
#[command(name = "agent-vitals", version, about = "Agent Skills health-check scanner",
          allow_negative_numbers = true)]
struct Args {
    /// Analyze one host; default: scan every supported host separately
    #[arg(long, global = true, default_value = "all",
          value_parser = ["all", "claude-code", "codex", "openclaw", "hermes", "workbuddy", "dsh"])]
    host: String,

    /// Additional scan path; repeatable
    #[arg(long = "path", global = true)]
    path: Vec<String>,

    /// Write scan JSON to FILE; use - for stdout. Without this option, run doctor.
    #[arg(long = "json", value_name = "FILE")]
    json: Option<PathBuf>,

    /// Description character budget; default: 15000
    #[arg(long, global = true, value_parser = non_negative)]
    budget: Option<i64>,

    /// Calculate budget and conflicts over all on-disk skills (diagnostic; default: loaded only)
    #[arg(long, global = true)]
    all: bool,

    /// Minimum installed age for zombie classification; default: 14
    #[arg(long = "zombie-age", global = true, default_value_t = 14, value_parser = non_negative)]
    zombie_age: i64,

    /// Recommend splitting above this tier2_core_tokens value; default: 6000
    #[arg(long = "split-threshold", global = true, default_value_t = 6000, value_parser = non_negative)]
    split_threshold: i64,

    /// Previous scan JSON used for change comparison
    #[arg(long, global = true)]
    baseline: Option<PathBuf>,

    /// Exit code 1 when a finding at this severity is present (for CI). Default: critical; none never fails on findings
    #[arg(long = "fail-on", global = true, default_value = "critical",
          value_parser = ["none", "critical", "warning", "info"])]
    fail_on: String,

    /// Diagnostic codes excluded from the gate, comma-separated (e.g. SV301,SV302). Ignored codes are still printed
    #[arg(long, global = true, default_value = "")]
    ignore: String,

    /// Gate only diagnostics that are new relative to the baseline; exit code 2 without a baseline
    #[arg(long = "new-only", global = true)]
    new_only: bool,

    /// Disable doctor's automatic snapshot and comparison
    #[arg(long = "no-snapshot", global = true)]
    no_snapshot: bool,

    /// Redact home directories and user names in absolute paths for safe sharing
    #[arg(long, global = true)]
    redact: bool,

    /// Also redact skill names to stable skill-001-style IDs
    #[arg(long = "redact-names", global = true)]
    redact_names: bool,

    /// This tool's own skill directory, excluded from security scanning; inferred when omitted.
    #[arg(long = "self-root", global = true)]
    self_root: Option<PathBuf>,

    /// DSH registry snapshot JSON (probe evidence); when absent, loaded falls back to the session log
    #[arg(long = "runtime-json", global = true)]
    runtime_json: Option<PathBuf>,

    #[command(subcommand)]
    cmd: Option<Cmd>,
}

/// Subcommands are layered on top of the existing options.
///
/// `agent-vitals` with no arguments is equivalent to `doctor` (PRODUCT §5): the
/// deciding factor is whether `--json` was given, not whether a subcommand was used —
/// SKILL.md and every integration test rely on `--json <file>` for the raw JSON, so
/// demoting the scan to a subcommand would break every caller at once.
#[derive(Subcommand)]
enum Cmd {
    /// List discovered skills and their effective state
    List {
        /// Show dormant / zombie only
        #[arg(long)]
        unused: bool,
        /// Show shadowed copies only
        #[arg(long)]
        shadowed: bool,
        /// Dormant threshold in days; default: 30
        #[arg(long, value_parser = non_negative)]
        stale: Option<i64>,
        #[arg(long, default_value = "cost", value_parser = ["usage", "cost", "name"])]
        sort: String,
        /// Show only the first N rows
        #[arg(long)]
        top: Option<usize>,
        /// Write JSON instead of a table. Unlike the top-level --json, this serializes
        /// the table rows rather than the scan.
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
    },
    /// Turn scan facts into cause, impact, and action
    Doctor {
        /// Jaccard threshold for SV401; default: 0.25 (shared with overlap)
        #[arg(long, default_value_t = skills::doctor::DEFAULT_OVERLAP_MIN)]
        min: f64,
        /// Write diagnostic JSON instead of a report
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
    },
    /// Turn the scan report into a quantified, ranked, honest savings plan
    /// (diagnosis → treatment plan; SKILL.md §4 Recommended disposition as data).
    ///
    /// Items are a **proposal**: risk ordering is a suggested reading order, the
    /// decision stays with the user (`Never delete or disable a skill unless the
    /// user explicitly asks`). `savings_per_event` is always measured (report
    /// fields, tokens); `events_per_month` is filled ONLY from `--startup-rate`
    /// (an estimate, never from lifetime `usage_count` — that is exposed
    /// separately as `measured_lifetime_triggers`).
    Plan {
        /// Estimated starts of Claude Code per month; the ONLY source for
        /// per-startup items' events_per_month (an estimate, not a measurement)
        #[arg(long, value_parser = non_negative)]
        startup_rate: Option<i64>,
        /// Write plan JSON to FILE; use - for stdout
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
    },
    /// Save a snapshot to ~/.agent-vitals/snapshots
    Snapshot {
        /// Retain the newest N snapshots; default: 30; 0 means unlimited
        #[arg(long, default_value_t = agent_vitals_runtime::skills::snapshot::SNAPSHOT_KEEP, value_parser = non_negative)]
        keep: i64,
    },
    /// Compare with the previous snapshot
    Diff {
        /// Snapshot file to compare; default: latest
        file: Option<PathBuf>,
        /// Write JSON instead of a report
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
    },
    /// Explain why one skill is ineffective and how to fix it
    Explain {
        /// Skill name or <plugin>:<name>
        name: String,
        /// Jaccard threshold for neighbors; default: 0.25 (shared with overlap)
        #[arg(long, default_value_t = skills::doctor::DEFAULT_OVERLAP_MIN)]
        min: f64,
        /// Write JSON instead of a report
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
    },
    /// Lexical filter for skills that may compete for similar requests
    Overlap {
        /// Jaccard threshold; default: 0.25
        #[arg(long, default_value_t = skills::doctor::DEFAULT_OVERLAP_MIN)]
        min: f64,
        /// Show only the first N pairs
        #[arg(long)]
        top: Option<usize>,
        /// Write JSON instead of a table
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
    },
    /// Audit a DSH session log for high-risk behaviors (SV601-SV610)
    Behavior {
        /// Path to the DSH session JSONL log (file or directory)
        session_log: PathBuf,
        /// Write findings JSON to FILE; use - for stdout
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
    },
    /// Fold a DSH session log into oneline.json + today.json/month.json +
    /// alert.json + sessions.jsonl (R1d-tick producer; byte-for-byte mirror of
    /// Python `scan.py oneline`). Fenced: state owner must be `rust` (takeover)
    /// unless --shadow. Writer fencing fails fast before the audit cost.
    Oneline {
        /// Path to the DSH session JSONL log (single file, not a directory)
        session_log: PathBuf,
        /// Native session id override (the tick's discovery passes the agentId
        /// dir name here — DSH logs are always named `session.jsonl`, so the
        /// file-stem default "session" would collide every session into one
        /// dedup key). Default: file stem, byte-mirroring Python scan.py.
        #[arg(long = "session-id")]
        session_id: Option<String>,
        /// Skip folding hour buckets into today.json/month.json (still writes
        /// oneline.json + sessions.jsonl + alert.json + ledger)
        #[arg(long)]
        no_merge: bool,
        /// Rehearse on a copy: skip writer fencing (like `state fold-session --shadow`)
        #[arg(long)]
        shadow: bool,
    },
    // Discover 是 R1d-tick 的输入面：Tauri tick 在这里 shell out，折最新未折。
    // 中文说明放注释——clap 的 help 是 scanner-owned 文本，test_regressions 的
    // test_help_defaults_to_english 钉死 ASCII-only（英文），不能漏进 command surface。
    /// Discover unfolded DSH sessions under `<DSH_HOME>/sessions` (R1d-tick
    /// input: the Tauri tick shells out here and folds the latest). Read-only:
    /// touches no fencing and writes no state; zstd-only sessions are counted
    /// and reported honestly (decompression is unwired — an R2a SessionStore
    /// gap). JSON output: `unfolded` sorted by mtime descending (latest first).
    Discover {
        /// Write JSON to FILE; use - for stdout. Default: stdout.
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
    },
    /// Print the HostProfile registry (v0.6 host-contract spec §5.1): the
    /// four runtime hosts' declared structural capabilities (unmeasured
    /// signals, degraded rules, session-store/fold capability). This is the
    /// registry itself, not a per-session derive — see `docs/
    /// VITALS_CORE_V0_6_HOST_CONTRACT_SPEC.md` §5.2 for what it does and does
    /// not answer.
    Hosts {
        /// Write hosts JSON to FILE; use - for stdout. Without this option,
        /// print a human table.
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
    },
    /// Audit a DSH session log for Skill execution events (skill-invocation / tool/call name=skill).
    SkillAudit {
        /// Path to the DSH session JSONL log (file or directory)
        session_log: PathBuf,
        /// Write skill audit JSON to FILE; use - for stdout
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
    },
    /// Audit a DSH session log for execution duration (tool calls / turns / steps / approvals / hooks).
    DurationAudit {
        /// Path to the DSH session JSONL log (file or directory)
        session_log: PathBuf,
        /// Write duration audit JSON to FILE; use - for stdout
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
    },
    /// Audit a Codex rollout log into a CanonicalSession with §13 coverage
    /// (P4 "sound" proof — Legacy + Paginated fold into the shared 19-signal model).
    ///
    /// Emits coverage JSON, not findings: Codex has no SV601-614 detectors yet
    /// (detector decoupling is the deferred later phase). `--host codex` is the
    /// install-time probe surface and is unrelated to this subcommand.
    CodexEvidence {
        /// Path to the Codex rollout JSONL log (or use --roots)
        #[arg(required_unless_present = "roots")]
        session_log: Option<PathBuf>,
        /// List the Codex session roots (live + archived) instead of auditing
        /// one log — archived_sessions existence is probed, never an error
        #[arg(long = "roots")]
        roots: bool,
        /// Write coverage JSON to FILE; use - for stdout
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
    },
    /// Price Codex token usage (USD) into a per-model / per-day cost report
    /// (cc-trace research §D landing, docs/CC_TRACE_APPLICATION.md §5 item 4).
    /// Reads the SQL authority DB (populated by `sync-facts`); priced against
    /// codex_pricing.json (USD). Text / JSON / HTML. Codex is a ChatGPT
    /// subscription, so the USD figure is list-price, not a bill.
    CodexCost {
        /// Restrict the report to one calendar month; `all` = every month
        #[arg(long = "month")]
        month: Option<String>,
        /// Today only; default (no flags) is the current calendar month
        #[arg(long = "today", conflicts_with = "month")]
        today: bool,
        /// Write the report JSON to FILE; use - for stdout
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
        /// Write a self-contained HTML dashboard to FILE
        #[arg(long = "html")]
        html: Option<PathBuf>,
    },
    /// Audit ONE Codex session (per-session cost + provenance), in the DSH
    /// audit-tab visual language. `codex-cost` aggregates session identity away
    /// during fold; `codex-evidence` gives per-file provenance without cost.
    /// This joins the two halves back around a logical session_id (resume
    /// rollouts merge by session_id), reusing the exact fold → price path.
    /// Stateless single call; `--list` enumerates sessions (the id picker).
    CodexSession {
        /// List all Codex sessions: id/title/model/file count/date span
        #[arg(long)]
        list: bool,
        /// The logical session_id to audit; default = the most recent session
        #[arg(long)]
        session: Option<String>,
        /// Write the audit JSON to FILE; use - for stdout
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
        /// Write a self-contained HTML audit report to FILE
        #[arg(long = "html")]
        html: Option<PathBuf>,
    },
    /// Audit a Claude Code session (`~/.claude/projects/**/*.jsonl`) into a
    /// CanonicalSession with §13 coverage + SV601–614 findings. Claude's tool
    /// results carry no reason codes, so SV607/608 degrade to Unavailable
    /// (host capability, §12); SV609/610/614 are Unavailable via the empty
    /// approval/sandbox timelines. Stateless single call; `--list` enumerates.
    ClaudeSession {
        /// List all Claude sessions: id/title/model/cwd/date span
        #[arg(long)]
        list: bool,
        /// The session_id to audit; default = the most recent session
        #[arg(long)]
        session: Option<String>,
        /// Write the audit JSON to FILE; use - for stdout
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
    },
    /// Fold Claude Code session files (`~/.claude/projects/**/*.jsonl`) into the
    /// claude data plane: claude-fold.json checkpoints + claude-ledger.json /
    /// claude-ledger-archive.json per-day by_model buckets (R1d-tick producer
    /// for the tray's Claude ≈ estimate columns; the tick runs this after the
    /// DSH oneline fold). Byte-for-byte mirror of Python `scan.py claude-sync`.
    /// Fenced like oneline: state owner must be `rust` (takeover) unless
    /// --shadow. Tail-reads appended rows since the last sync (offset + size +
    /// mtime checkpoints, exactly-once); cost-state records replace the
    /// session baseline rather than adding to it.
    ClaudeSync {
        /// Rehearse on a copy: skip writer fencing (like `oneline --shadow`)
        #[arg(long)]
        shadow: bool,
    },
    /// Audit ONE Claude session JSONL into per-message UsageFact rows (facts +
    /// attempts + coverage; v0.7 spec §3 candidate #3). R1 ratified: in-memory
    /// emit + read-only diagnostic — writes no state at all. machine_namespace
    /// is REQUIRED (spec §9): a fact's identity fields seed its fact_id, so a
    /// CLI-invented namespace would make replays unstable AND trigger takeover's
    /// identity bootstrap (a state write) — both forbidden, so a missing value
    /// fails with exit 2 instead of being defaulted.
    /// Byte-for-byte mirror of Python `scan.py claude-usage-facts --json -`.
    ClaudeUsageFacts {
        /// Path to a Claude session JSONL file
        session_jsonl: PathBuf,
        /// machine_namespace component of SessionKey — required (spec §9);
        /// the CLI never reads/writes state to invent one (missing exits 2)
        #[arg(long)]
        machine_namespace: Option<String>,
        /// source_profile component of SessionKey (default: 'default')
        #[arg(long, default_value = "default")]
        source_profile: String,
        /// Write the UsageFact JSON to FILE; use - for stdout (default: human summary)
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
        /// v0.9 Stage A: persist facts through the runtime ingest service into
        /// <data_home>/facts/<host>.jsonl (exactly-once by fact_id). Rust-only
        /// by design — Python grows no writer (spec DoD #7); without this flag
        /// the output stays byte-identical to the Python implementation.
        #[arg(long)]
        write: bool,
    },
    /// Audit ONE or MORE Codex rollout JSONL files into per-`token_count`
    /// UsageFact rows (facts + attempts + coverage; v0.7 spec §3 candidate #3
    /// Stage 2). In-memory emit + read-only diagnostic — writes no state at all.
    /// machine_namespace is REQUIRED (spec §9) — same reasoning as
    /// claude-usage-facts: missing exits 2 instead of being defaulted.
    /// source_event_id is namespaced by the physical rollout stem (not the
    /// logical session): the same stem re-collected byte-identically dedups
    /// (live/archive), different stems never merge (2026-09-03 decision D′).
    /// Byte-for-byte mirror of Python `scan.py codex-usage-facts --json -`.
    CodexUsageFacts {
        /// One or more Codex rollout JSONL file paths
        #[arg(required = true, num_args = 1..)]
        rollouts: Vec<PathBuf>,
        /// machine_namespace component of SessionKey — required (spec §9);
        /// the CLI never reads/writes state to invent one (missing exits 2)
        #[arg(long)]
        machine_namespace: Option<String>,
        /// source_profile component of SessionKey (default: 'default')
        #[arg(long, default_value = "default")]
        source_profile: String,
        /// Write the UsageFact JSON to FILE; use - for stdout (default: human summary)
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
        /// v0.9 Stage A: persist facts through the runtime ingest service into
        /// <data_home>/facts/<host>.jsonl (exactly-once by fact_id). Rust-only
        /// by design — Python grows no writer (spec DoD #7); without this flag
        /// the output stays byte-identical to the Python implementation.
        #[arg(long)]
        write: bool,
    },
    /// Audit ONE DSH session file (`.jsonl` or multi-frame `.zstd`) into
    /// per-observation-slot UsageFact rows (facts + coverage; v0.7 spec §3
    /// candidate #3 Stage 3). In-memory emit + read-only diagnostic — writes no
    /// state at all. machine_namespace is REQUIRED (spec §9) — same reasoning as
    /// claude-usage-facts: missing exits 2 instead of being defaulted.
    /// source_profile derives from the header cwd by default; a header with no
    /// cwd and no explicit profile is `unattributed` (exit 2). Strict single-file
    /// errors (§4.1) never emit a fake-empty success.
    /// Byte-for-byte mirror of Python `scan.py dsh-usage-facts --json -`.
    DshUsageFacts {
        /// Path to a DSH session file (.jsonl or multi-frame .zstd)
        #[arg(long = "path")]
        session_path: PathBuf,
        /// machine_namespace component of SessionKey — required (spec §9);
        /// the CLI never reads/writes state to invent one (missing exits 2)
        #[arg(long)]
        machine_namespace: Option<String>,
        /// source_profile component of SessionKey (default: derive from the
        /// session header cwd; explicit wins; header cwd missing + none →
        /// unattributed, exit 2)
        #[arg(long)]
        source_profile: Option<String>,
        /// Write the UsageFact JSON to FILE; use - for stdout (default: human summary)
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
        /// v0.9 Stage A: persist facts through the runtime ingest service into
        /// <data_home>/facts/<host>.jsonl (exactly-once by fact_id). Rust-only
        /// by design — Python grows no writer (spec DoD #7); without this flag
        /// the output stays byte-identical to the Python implementation.
        #[arg(long)]
        write: bool,
    },
    /// Rebuild the SQLite facts index from the authoritative JSONL
    /// (`<data_home>/facts/<host>.jsonl`). Spec §5.1: SQLite is a deletable,
    /// rebuildable projection — this is the DoD #1 repair path. Stage B.
    DataRebuildIndex {
        /// Output the rebuild report as JSON (default: human summary)
        #[arg(long = "json")]
        rows_json: bool,
    },
    /// Reconcile the facts index against the summary DTO (tokens_by_host),
    /// per host: measured / no-facts (facts plane not yet ingested for this
    /// host — a coverage gap, never rendered as zero) / index-only (anomaly).
    /// Stage B; closes the reconcile item left open by Stage A.
    DataReconcile {
        /// Month to reconcile against ("YYYY-MM"; default: current month)
        #[arg(long)]
        month: Option<String>,
        /// Output the report as JSON
        #[arg(long = "json")]
        rows_json: bool,
    },
    /// Routine facts sync across all three hosts (locate, checkpoint diff,
    /// emit, then SQL authority + legacy dual-write). Idempotent: re-runs
    /// skip unchanged files (source_files fingerprints) and dedup facts by
    /// fact_id. The machine namespace comes from machine.json (the sync
    /// caller IS the machine). v0.9.1 retirement-path step 1.
    SyncFacts {
        /// Output the sync report as JSON
        #[arg(long = "json")]
        rows_json: bool,
    },
    /// One-time import of the legacy facts JSONL into the SQL authority DB
    /// (spec 6.2.1: JSONL is the highest-fidelity migration source; same
    /// fact_id = idempotent). Safe to re-run.
    DataMigrate,
    /// Phase 4.1 (spec 6.3): machine-readable reconcile of the SQL authority DB
    /// against the legacy state JSON, per host x bucket (tokens, strict equal)
    /// and per provider x basis x currency (amounts, minor units). Diffs are
    /// exact / explained (delta within a recorded exception, e.g. undated
    /// residual) / mismatch. `reconciled: true` iff all exact-or-explained —
    /// this is the read side of the Phase 4.2 switch gate. Exit 1 on mismatch.
    DataReconcileAuthority {
        /// Month to reconcile ("YYYY-MM"; default: current month)
        #[arg(long)]
        month: Option<String>,
        /// Output the report as JSON
        #[arg(long = "json")]
        rows_json: bool,
    },
    /// Authority DB status: schema version, recent sync runs, source
    /// counts, data-quality summary (spec 9, authority part of data
    /// doctor).
    DataStatus {
        /// Output as JSON
        #[arg(long = "json")]
        rows_json: bool,
    },
    /// Reconcile the two budget ledgers for a month: state chain
    /// (month.json fold) vs facts index. `reconciled: true` is the
    /// precondition for retirement-path step 4 (state JSON retirement).
    /// Retirement-path step 3 acceptance surface.
    DataBudgetReconcile {
        /// Month to reconcile ("YYYY-MM"; default: current month)
        #[arg(long)]
        month: Option<String>,
        /// Output as JSON
        #[arg(long = "json")]
        rows_json: bool,
    },
    /// Export facts from the SQL authority database (spec §9: both exports are
    /// generated from SQL queries). Identity fields verbatim; soft-deleted rows
    /// excluded. Files land as <host>.jsonl
    DataExportPrivate {
        /// Output directory (created on demand); files land as <host>.jsonl
        #[arg(long)]
        out: PathBuf,
    },
    /// Export facts with identity fields pseudonymized (machine_namespace /
    /// native_session_id / source_profile / source_event_id → stable fnv1a64
    /// pseudonyms, fact_id re-stamped through the contract layer). Same SQL
    /// source as data-export-private. Spec §6: this is a SEPARATE
    /// write path from data-export-private by design — not a --redacted flag.
    DataExportRedacted {
        /// Output directory (created on demand); files land as <host>.jsonl
        #[arg(long)]
        out: PathBuf,
    },
    /// Drill into unresolved/unpriced usage per model (completes DoD #4:
    /// monthly cost split by basis AND drillable to its sources). Groups
    /// match by_provider keys; reasons: billing-route-unknown /
    /// billing-mode-unknown / no-price-card / partial-price-basis. Stage B.
    DataUnresolved {
        /// Month to inspect ("YYYY-MM"; default: current month)
        #[arg(long)]
        month: Option<String>,
        /// Output as JSON
        #[arg(long = "json")]
        rows_json: bool,
    },
    /// Audit a WorkBuddy session (`~/.workbuddy/` sqlite db + audit-log + file-history)
    /// into a CanonicalSession with §13 coverage + SV601–614 findings. The db
    /// `sessions` row is the join anchor across the three joinable surfaces (spec
    /// §2.1); cost is the host-billed credit_json (spec §9). SV604/605 degrade to
    /// Unavailable (host capability: only bash/web_fetch tool calls are joinable to
    /// sessions, §3.1). Stateless single call; `--list` enumerates.
    WorkbuddySession {
        /// List all WorkBuddy sessions: id/title/model/cwd/date span
        #[arg(long)]
        list: bool,
        /// The session_id to audit; default = the most recent session
        #[arg(long)]
        session: Option<String>,
        /// Write the audit JSON to FILE; use - for stdout
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
    },
    /// Inspect the spend budget alert (thresholds + current alert level).
    /// R1b: read path only (`show`); write actions (`set`/`enable`/`disable`/
    /// `snooze`/`unsnooze`) land with R1c's Rust state-writer, so this subcommand
    /// intentionally refuses them for now rather than half-implementing them.
    Budget {
        /// show — 只读告警态（R1b）
        #[arg(value_parser = ["show"])]
        action: String,
        /// Query a specific month (YYYY-MM) instead of the current one
        #[arg(long)]
        month: Option<String>,
        /// Print JSON to stdout instead of the human-readable report
        #[arg(long)]
        json: bool,
    },
    /// v0.9.1 Phase 3.4 SQL budget surface: explicit management API over the
    /// authority DB's `budget_config`/`budget_snoozes` (spec §5.3), replacing
    /// alert.json/budget.json reads. Amounts are CNY minor units (integer cents).
    /// `alert` computes the full budget alert from the authority DB (SQL
    /// equivalent of `budget show`), cross-host metered CNY.
    BudgetSql {
        #[arg(value_parser = ["status", "alert", "config-show", "config-set", "snooze-set", "snooze-clear"])]
        action: String,
        /// status/config-show: query this month (YYYY-MM) instead of the current one
        #[arg(long)]
        month: Option<String>,
        /// config-set: monthly budget in CNY minor (¥600.00 = 60000)
        #[arg(long)]
        monthly_cny_minor: Option<i64>,
        /// config-set: daily budget in CNY minor
        #[arg(long)]
        daily_cny_minor: Option<i64>,
        /// config-set: warning ratio in basis points (80% = 8000)
        #[arg(long)]
        warning_ratio_bp: Option<i64>,
        /// snooze-set: snooze until this ISO datetime (Beijing time, e.g. 2026-09-10T08:00:00)
        #[arg(long)]
        until: Option<String>,
    },
    /// Drive the Rust state write chain. R1c: the pure merge rules live in
    /// core::state (single source of truth), this subcommand is the I/O + time
    /// wiring; the differential in tests/test_cli_matrix.py drives it against
    /// Python state.py on an isolated AGENT_VITALS_HOME for byte-for-byte lockstep.
    /// This is also the surface the R1d tick calls instead of spawning python3.
    State {
        #[command(subcommand)]
        action: StateAction,
    },
    /// R2a SessionStore query surface (docs/R2A_CONTRACT_DESIGN.md §2-3): a
    /// versioned, in-memory read-only query model over normalized SessionReport
    /// envelopes. Stateless single call — populates from Codex sources on
    /// demand (Phase 1); DSH (zstd) is reported `source-unavailable`, never an
    /// empty page (§3.3).
    Sessions {
        #[command(subcommand)]
        action: SessionsAction,
    },
    /// Read-only Data Query API surface (v0.9 Stage 0.5, spec §7's suggested
    /// `data coverage`). Goes through the `SummaryRepository` trait to the
    /// runtime's repository — since Phase 3.5 Tier A the CLI constructs
    /// `SqlSummaryRepository` (reads the authority DB `agent-vitals.sqlite3`,
    /// incl. legacy_aggregate deep history); `JsonSummaryRepository` coexists
    /// until Phase 4 retires it. The CLI only goes through the trait, never
    /// naming the concrete type past the call site (spec §3.1 dependency
    /// table). `--json` prints the frozen `to_json()` DTO verbatim; spec §3.1
    /// makes it a contract violation to consume amounts while dropping
    /// freshness/coverage/excluded_hosts, so both views surface all three.
    Data {
        #[command(subcommand)]
        action: DataAction,
    },
}

// `data` 子命令的子动作。Stage 0 的 repository 只有 `monthly_summary`/
// `daily_summary` 两个查询（spec §3.1 的 `coverage_status(CoverageQuery)` 是
// Stage B 的独立查询面）——MonthlySummary DTO 本身承载 coverage/excluded_
// hosts，所以月视图命令沿用 spec 建议名 `coverage`，不另设第二个命令去打印
// 同一份 DTO 的另一种排版。帮助文本一律英文（test_regressions 钉 `--help`
// 无 CJK——scanner-owned text 的纪律），中文设计注记只留在这里。
#[derive(Subcommand)]
enum DataAction {
    /// Monthly cross-host summary (coverage, excluded hosts, freshness).
    /// Missing data renders as "no data", never as zero.
    Coverage {
        /// Query a specific month (YYYY-MM) instead of the current Beijing month
        #[arg(long)]
        month: Option<String>,
        /// Print the frozen DTO JSON to stdout (default: compact text view)
        #[arg(long)]
        json: bool,
    },
    /// Single-day cross-host summary (Beijing date, YYYY-MM-DD).
    Daily {
        /// Beijing date to query (YYYY-MM-DD)
        #[arg(long)]
        date: String,
        /// Print the frozen DTO JSON to stdout (default: compact text view)
        #[arg(long)]
        json: bool,
    },
}

/// `sessions` 子命令的子动作（R2a §2.5/§3.3 查询模型）。
#[derive(Subcommand)]
enum SessionsAction {
    /// List sessions: versioned list DTO + cursor-paginated page (filter by
    /// host/model/date-range/query). `--json` prints the DTO to stdout; the
    /// default is a human table.
    List {
        /// Filter by host kind (only `codex` is readable in Phase 1; `dsh`
        /// returns a typed `source-unavailable` error, never an empty page).
        /// Named `--host-kind` because `--host` is the scanner's global arg
        /// (default "all").
        #[arg(long = "host-kind")]
        host_kind: Option<String>,
        /// Filter by model (exact)
        #[arg(long)]
        model: Option<String>,
        /// Date lower bound (YYYY-MM-DD, inclusive; matches the session span)
        #[arg(long = "from")]
        date_from: Option<String>,
        /// Date upper bound (YYYY-MM-DD, inclusive)
        #[arg(long = "to")]
        date_to: Option<String>,
        /// Free-text query against session_id / title
        #[arg(long = "query")]
        query: Option<String>,
        /// Page size; default 50
        #[arg(long, default_value_t = 50)]
        page_size: usize,
        /// Cursor JSON from a previous page's next_cursor
        #[arg(long)]
        cursor: Option<String>,
        /// Print the versioned DTO as JSON to stdout
        #[arg(long)]
        json: bool,
    },
    /// Read ONE session envelope by session_key (+ optional session_revision).
    Read {
        /// session_key JSON (host_kind/native_id/source_profile/machine_namespace)
        #[arg(long = "session-key")]
        session_key: String,
        /// Require this session_revision; a mismatch is `stale-revision`
        #[arg(long)]
        revision: Option<String>,
        /// Print the envelope as JSON to stdout
        #[arg(long)]
        json: bool,
    },
    /// Aggregate findings across ALL sessions (both sources), rule-level rollup.
    Findings {
        /// Print the versioned rollup DTO as JSON to stdout
        #[arg(long)]
        json: bool,
    },
    /// Multi-host navigation projection (docs/MENUBAR_MULTIHOST_NAVIGATION_SPEC.md
    /// §5.1/§5.2): one spawn, both host snapshots — today tokens + today session
    /// count + recent N deep-link rows. The Tauri menu bar caches the envelope and
    /// only re-renders (§6 决策 3); all measurement (sorting, day boundary,
    /// coverage) happens here in the data layer.
    Navigation {
        /// Day to project (YYYY-MM-DD, Beijing day boundary — the core fold's
        /// date buckets are UTC+8 hours, no DST). Defaults to today (Beijing).
        #[arg(long, default_value = "")]
        day: String,
        /// Timezone of the projected day. Only `Asia/Shanghai` is supported (the
        /// core day boundary is fixed UTC+8, no DST; §5.1).
        #[arg(long, default_value = "Asia/Shanghai")]
        timezone: String,
        /// How many recent rows per host; default 5 (§5.1)
        #[arg(long, default_value_t = 5)]
        recent: usize,
        /// Print the versioned envelope as JSON to stdout
        #[arg(long)]
        json: bool,
    },
}

/// `state` 子命令的子动作 —— 一动作一入口，喂的都是**已算好**的 JSON
/// （hour-buckets / by_date_model / summary），CLI 只接线不重算，让差分测试能
/// 逐字节对账 Python 侧。
#[derive(Subcommand)]
enum StateAction {
    /// Fold hour buckets into today.json (Python `state.merge_today`).
    /// `--by-model` is today's slice of token_by_date_model; when the slice
    /// for today is absent, omit it (Python merges with `None`).
    MergeToday {
        /// hour-buckets JSON (the `hb` object from usage.hour_buckets)
        hb: PathBuf,
        /// today's by_model JSON (by_date_model[today]); optional
        #[arg(long)]
        by_model: Option<PathBuf>,
    },
    /// Fold hour buckets + by_date_model into month.json, migrating stale days
    /// to month-archive.json first (Python `state.merge_month`, two-phase).
    MergeMonth {
        /// hour-buckets JSON
        hb: PathBuf,
        /// by_date_model JSON (usage.token_by_date_model output)
        #[arg(long)]
        by_date_model: Option<PathBuf>,
    },
    /// Write oneline.json (the tick's display summary; Python `state.write_oneline`)
    WriteOneline {
        summary: PathBuf,
    },
    /// Append one summary row to sessions.jsonl (Python `state.append_session_history`)
    AppendHistory {
        summary: PathBuf,
    },
    /// Write alert.json (Python `state.write_alert`)
    WriteAlert {
        alert: PathBuf,
    },
    /// Set budget snooze → budget.json (Python `budget.set_snooze`)
    Snooze {
        until_iso: String,
        reason: String,
    },
    /// Clear budget snooze → remove budget.json (Python `budget.clear_snooze`)
    Unsnooze,
    /// Session-level dedup fold (R1d §4.2/§4.3): fold a session's pre-computed
    /// audit output into today/month/oneline/alert/sessions.jsonl exactly once.
    /// Fenced: refuses unless the writer-manifest owner is "rust" (run
    /// `state takeover rust` first, or pass --shadow to rehearse on a copy).
    FoldSession {
        /// fold-req JSON (session_id/host_kind/machine_namespace/oneline/
        /// hour_buckets/by_model_today/by_date_model/alert)
        req: PathBuf,
        /// Shadow mode: skip the owner check and fold into whatever
        /// AGENT_VITALS_HOME points at (non-authority rehearsal copy).
        #[arg(long)]
        shadow: bool,
    },
    /// Atomically switch the state writer (owner + epoch+1). This is the
    /// §4.2 cutover point: run `takeover rust` to let Rust produce, `takeover
    /// python` to roll back.
    Takeover {
        /// "rust" or "python"
        owner: String,
    },
    /// Print (creating if needed) the machine namespace — SessionKey's third
    /// component, persisted in machine.json (app-owned config, §4.3).
    MachineNamespace,
    /// Read-only per-source breakdown of the current month (month.json's
    /// per-day by_source rolled up + priced). JSON on stdout: `by_source`
    /// (source → model → 8-bucket) and `by_source_cost` (source → price), or
    /// both empty when the month has no by_source data — never fabricated.
    BySource,
    /// Read-only per-model monthly cost breakdown of the current month
    /// (month.json's per-day by_model rolled up + priced; v0.7 spec §3 first
    /// landed output view). JSON on stdout: `by_model` (model → 8-bucket) and
    /// `by_model_cost` (model → price), or both empty when the month has no
    /// by_model data — never fabricated.
    ByModel,
    /// v0.7 spec §3 second output view: provider-grain "未落入已声明订阅覆盖
    /// 范围" estimate (Claude Code catalog pricing surface). Reads month.json
    /// by_model, maps the 8-bucket DSH shape → Claude 4-type snake shape
    /// (peak_* dropped), then prices via core `claude_subscription_uncovered_
    /// estimate`. Output JSON: `by_model` (Claude 4-type) + `uncovered`
    /// (`price_claude_map` with `pricing_basis="estimated-subscription-
    /// exclusion"`); both empty/null when no by_model data.
    Uncovered,
    /// v0.7 spec §3 third output view: actual-vs-nominal cache-savings ratio.
    /// Reads month.json by_model, prices the same shape via core
    /// `cache_counterfactual_cost` (cache-discount counterfactual). Output JSON:
    /// `by_model` + `savings` (`{actual, nominal, ratio, currency,
    /// estimate_disclaimer}`); both empty/null when no by_model data.
    Savings,
}

/// 探测「扫描器自身所在的 skill 目录」。
///
/// Python 版靠 `__file__` 就能定位自己；二进制形态下这条线断了 ——
/// 二进制装在 npm / cargo 的 bin 目录里，和 skill 目录没有任何关系。
///
/// **不能按内容判断**（比如认 `name: agent-vitals`）：那样任何 skill 改个名字
/// 就能让自己免于安全扫描。按**安装位置**判断才不可伪造 —— 只有当二进制确实
/// 被放在某个 skill 目录里面时（`<skill>/bin/agent-vitals` 这种形态），
/// 才认那个目录是自己。
///
/// 探测不到就**不排除任何东西**。宁可把自己也扫一遍（多几条 cited 命中），
/// 也不能给出一个可以被冒名顶替的豁免。
fn detect_self_root() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let mut dir = exe.parent()?;
    for _ in 0..3 {
        if dir.join("SKILL.md").is_file() {
            return Some(dir.to_path_buf());
        }
        dir = dir.parent()?;
    }
    None
}

/// 报告 → 闸门 → 存档，返回退出码。
///
/// **顺序是有意的。**闸门结论要紧跟报告（读者刚看完发现），存档放最后
/// （它是副作用，不是结论）。存档失败不影响闸门的退出码 —— 一个写不了快照的
/// CI runner 不该因此把构建判成通过或失败。
fn run_doctor(doc: &Value, args: &Args, min: f64, auto_snapshot: bool,
              baseline: Option<&std::path::Path>) -> i32 {
    print!("{}", skills::doctor::render_doctor(doc, &skills::doctor::DoctorOpts {
        split_threshold: args.split_threshold,
        min,
        version: env!("CARGO_PKG_VERSION"),
    }));
    let ds = skills::doctor::diagnose(doc, args.split_threshold, min);

    let mut base_ds: Option<Vec<Value>> = None;
    if args.new_only {
        let path = match baseline {
            None => {
                eprintln!("--new-only needs a baseline: run `agent-vitals snapshot` first, \
or specify one with --baseline.");
                return skills::doctor::EXIT_TOOL_ERROR;
            }
            Some(p) => p,
        };
        let prev: Value = match util::read_lossy(path)
            .and_then(|t| serde_json::from_str(&t).ok())
        {
            None => {
                eprintln!("--new-only could not read baseline {}", path.display());
                return skills::doctor::EXIT_TOOL_ERROR;
            }
            Some(v) => v,
        };
        // **在基线文档上重跑同一个 diagnose。**它是纯函数，这一步不需要任何
        // 额外的「历史诊断」存储，也就不会与快照的内容脱节。
        base_ds = Some(skills::doctor::diagnose(&prev, args.split_threshold, min));
    }

    let ignore: Vec<String> = args.ignore.split(',')
        .map(|x| x.trim().to_uppercase())
        .filter(|x| !x.is_empty())
        .collect();
    let (text, rc) = skills::doctor::render_gate(
        &ds, &skills::doctor::GateOpts { fail_on: args.fail_on.clone(), ignore },
        base_ds.as_deref());
    print!("{}", text);
    print!("{}", agent_vitals_runtime::skills::snapshot::doctor_snapshot(doc, auto_snapshot));
    rc
}

/// `codex-evidence` 的人读呈现——从 `codex_evidence_json` 输出的同一个 Value
/// 上读（形状唯一来源），Python 侧 `cli.py` 的 codex-evidence handler 逐字节
/// 对齐这一份。
fn render_codex_evidence(out: &Value) -> String {
    let dash = |v: Option<&Value>| match v {
        Some(Value::String(s)) => s.clone(),
        Some(_) => "—".to_string(),
        None => "—".to_string(),
    };
    let roots: String = out
        .get("workspace_roots")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|r| r.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "—".to_string());
    let signals: Vec<&str> = out
        .get("signals")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|s| s.as_str()).collect())
        .unwrap_or_default();

    let mut s = String::new();
    s.push_str(&format!("host: {}\n", dash(Some(&Value::String("codex".into())))));
    s.push_str(&format!("session: {}\n", dash(out.get("session_id"))));
    s.push_str(&format!("title: {}\n", dash(out.get("title"))));
    s.push_str(&format!("history_mode: {}\n", dash(out.get("history_mode"))));
    s.push_str(&format!("cli_version: {}\n", dash(out.get("cli_version"))));
    s.push_str(&format!("model: {}\n", dash(out.get("model"))));
    s.push_str(&format!("workspace_roots: {roots}\n"));
    s.push_str(&format!("signals: {}\n", signals.join(", ")));
    s.push('\n');
    // 逐条列出「有覆盖」的信号（也就是 signals 数组里的那些）——19 个全零的
    // unavailable 信号不在人读视图里制造噪音，JSON 里才是全量。
    if let Some(cov) = out.get("coverage").and_then(|v| v.as_object()) {
        for name in &signals {
            if let Some(c) = cov.get(*name) {
                let (m, d, l, u) = (
                    c.get("measured").and_then(|v| v.as_u64()).unwrap_or(0),
                    c.get("derived").and_then(|v| v.as_u64()).unwrap_or(0),
                    c.get("lossy").and_then(|v| v.as_u64()).unwrap_or(0),
                    c.get("unmetered").and_then(|v| v.as_u64()).unwrap_or(0),
                );
                s.push_str(&format!("  {name:<20} measured={m} derived={d} lossy={l} unmetered={u}\n"));
            }
        }
    }
    s.push('\n');
    s.push_str(&format!(
        "attempts: {}    notes: {}\n",
        out.get("attempts").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
        out.get("notes").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
    ));
    s
}

/// `codex-evidence --roots` 的人读呈现——从 `codex_session_roots_report` 的
/// 同一个 Value 上读（形状唯一来源），Python 侧 `cli.py::_render_codex_roots`
/// 逐字节对齐这一份。缺席的根不猜路径也不报错，只标 `(absent)`。
fn render_codex_roots(out: &Value) -> String {
    let mut s = String::from("host: codex\n");
    if let Some(roots) = out.get("roots").and_then(|v| v.as_array()) {
        for entry in roots {
            let (Some(kind), Some(path)) = (
                entry.get("kind").and_then(|v| v.as_str()),
                entry.get("path").and_then(|v| v.as_str()),
            ) else {
                continue;
            };
            if entry.get("exists").and_then(|v| v.as_bool()).unwrap_or(false) {
                let fc = entry.get("file_count").and_then(|v| v.as_u64()).unwrap_or(0);
                let tb = entry.get("total_bytes").and_then(|v| v.as_u64()).unwrap_or(0);
                s.push_str(&format!("{kind:<8} {path}  ({fc} rollouts, {tb} bytes)\n"));
            } else {
                s.push_str(&format!("{kind:<8} {path}  (absent)\n"));
            }
        }
    }
    s
}

/// `agent-vitals plan` 的人读呈现 —— 从 `build_plan` 的同一个 Value 上读
/// （形状唯一来源），Python 侧 `cli.py::_render_plan_human` 逐字节对齐这一份。
/// 渲染只做呈现：null 一律落 `—`（没测到就标没测到，不假装 0），summary 不汇总
/// token（per-startup 与 per-trigger 单位不可通约）。
fn render_plan(out: &Value) -> String {
    let host = out.get("host_selection").and_then(|v| v.as_str()).unwrap_or("");
    let startup = out.get("startup_rate_per_month").and_then(|v| v.as_i64());
    let refs: Vec<&str> = out.get("diagnosis_refs")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str()).collect())
        .unwrap_or_default();
    let summary = out.get("summary").unwrap_or(&Value::Null);
    let n = summary.get("item_count").and_then(|v| v.as_i64()).unwrap_or(0);
    let savings = summary.get("savings_items").and_then(|v| v.as_i64()).unwrap_or(0);

    let mut s = String::new();
    s.push_str(&format!("host: {host}\n"));
    match startup {
        Some(x) => s.push_str(&format!("startup rate per month: {x}\n")),
        None => s.push_str("startup rate per month: —\n"),
    }
    if refs.is_empty() {
        s.push_str("diagnosis refs: (none)\n");
    } else {
        s.push_str(&format!("diagnosis refs: {}\n", refs.join(", ")));
    }
    s.push('\n');
    s.push_str(&format!("{n} items · {savings} with measured savings\n\n"));
    if let Some(items) = out.get("items").and_then(|v| v.as_array()) {
        for (i, it) in items.iter().enumerate() {
            let id = it.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let skill = it.get("skill").and_then(|v| v.as_str()).unwrap_or("");
            let risk = it.get("risk").and_then(|v| v.as_str()).unwrap_or("");
            s.push_str(&format!("{}. {id}  {skill}  [{risk}]\n", i + 1));
            match it.get("savings_per_event") {
                Some(Value::Object(o)) => {
                    let tokens = o.get("tokens").and_then(|v| v.as_i64()).unwrap_or(0);
                    let per = o.get("per").and_then(|v| v.as_str()).unwrap_or("");
                    s.push_str(&format!("   savings: {tokens} tokens per {per}\n"));
                }
                _ => s.push_str("   savings: none measured\n"),
            }
            match it.get("events_per_month") {
                Some(v) if !v.is_null() => s.push_str(&format!("   events per month: {v}\n")),
                _ => s.push_str("   events per month: —\n"),
            }
            match it.get("measured_lifetime_triggers") {
                Some(v) if !v.is_null() => {
                    s.push_str(&format!("   lifetime triggers measured: {v}\n"));
                }
                _ => s.push_str("   lifetime triggers measured: —\n"),
            }
            let drefs: Vec<&str> = it.get("diagnosis_refs")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str()).collect())
                .unwrap_or_default();
            if drefs.is_empty() {
                s.push_str("   diagnosis: (none)\n");
            } else {
                s.push_str(&format!("   diagnosis: {}\n", drefs.join(", ")));
            }
            let rationale = it.get("rationale").and_then(|v| v.as_str()).unwrap_or("");
            s.push_str(&format!("   {rationale}\n\n"));
        }
    }
    s
}

/// `codex-fold → 计价` 共享助手：从已折叠合并的 fold 出一个 `--json` 报告 dict
/// （host/currency/month/today 外层包装 + report 键）。filter_key=None 不过滤
/// （all 视图）；want_hours=True 时报告带 hours（today 视图小时热力图）。空折叠
/// 给全零结构而不是 None——调用方要的是「没有数据」而不是「崩了」，且包装是
/// 固定契约（unaccounted/plan 透传，无时间归属、不随月过滤）。与 Python
/// `cli.py::codex_report_from_merged` 同构（差分看守字节一致）。
fn codex_report_from_merged(
    merged: &Value,
    filter_key: Option<&str>,
    month_out: Option<&str>,
    want_hours: bool,
) -> Value {
    let mut by_hour_model = merged["by_hour_model"].clone();
    let mut by_model = merged["by_model"].clone();
    if let Some(m) = filter_key {
        // 过滤小时轴（升序 -> 保持升序），再重算 by_model。小时键 `YYYY-MM-DDTHH`
        // 用 startswith 匹配：月份前缀 `YYYY-MM` / 今天 `YYYY-MM-DD` 都成立。
        let mut filtered = serde_json::Map::new();
        if let Some(bh) = by_hour_model.as_object() {
            for (h, v) in bh {
                if h.starts_with(m) {
                    filtered.insert(h.clone(), v.clone());
                }
            }
        }
        by_hour_model = Value::Object(filtered);
        // 重算模型轴：merge 的 by_model 只读 fold 的 by_model 字段，不读
        // by_hour_model——拿 merge 折回去得到的是空模型轴（真实 defect：
        // --month 整份报告静默变全零）。
        by_model =
            agent_vitals_hosts::codex_usage::codex_by_model_from_hours(&by_hour_model, None);
    }
    let pricing = agent_vitals_runtime::sessions::codex_cost::load_codex_pricing();
    let plan = merged["plan"].clone();
    let report = agent_vitals_runtime::sessions::codex_cost::codex_cost_report(
        &by_hour_model,
        &by_model,
        &merged["unaccounted"],
        &plan,
        &pricing,
        want_hours,
    );
    let report = report.unwrap_or_else(|| {
        // 空折叠：全零结构（同 handler 注释——透传 unaccounted/plan）。
        let mut tt = serde_json::Map::new();
        for f in agent_vitals_hosts::codex_usage::CODEX_TOKEN_FIELDS {
            tt.insert(f.to_string(), json!(0));
        }
        let mut base = serde_json::Map::new();
        base.insert("total_cost_usd".into(), json!(0));
        base.insert("total_tokens".into(), Value::Object(tt));
        base.insert("per_model".into(), Value::Object(serde_json::Map::new()));
        base.insert("days".into(), Value::Array(vec![]));
        base.insert("unpriced_tokens".into(), json!(0));
        base.insert("unaccounted_usage".into(), merged["unaccounted"].clone());
        base.insert("plan".into(), plan);
        if want_hours {
            base.insert("hours".into(), Value::Array(vec![]));
        }
        Value::Object(base)
    });
    let mut out = serde_json::Map::new();
    out.insert("host".into(), json!("codex"));
    out.insert("currency".into(), json!("USD"));
    out.insert(
        "month".into(),
        month_out.map(Value::from).unwrap_or(Value::Null),
    );
    out.insert("today".into(), json!(agent_vitals_runtime::sessions::codex_cost::today_beijing()));
    if let Some(rep) = report.as_object() {
        for (k, v) in rep {
            out.insert(k.clone(), v.clone());
        }
    }
    Value::Object(out)
}

/// 统一看板内联的 codex 规范单块（docs/UNIFIED_COST_VIEW.md 的 1 号宿主契约）：
/// {host, currency, today, default, views:{today,month,all}}。每个 view 即
/// `codex_report_from_merged` 的一个报告。today 视图 want_hours=True；month
/// 视图用调用方给的 month_key/month_out；all 视图不过滤。与 Python
/// `cli.py::codex_calendar_blob` 同构。
fn codex_calendar_blob(
    merged: &Value,
    month_key: Option<&str>,
    month_out: Option<&str>,
    default: &str,
) -> Value {
    let today = agent_vitals_runtime::sessions::codex_cost::today_beijing();
    let mut views = serde_json::Map::new();
    views.insert(
        "today".into(),
        codex_report_from_merged(merged, Some(&today), Some(&today[..7]), true),
    );
    views.insert(
        "month".into(),
        codex_report_from_merged(merged, month_key, month_out, false),
    );
    views.insert(
        "all".into(),
        codex_report_from_merged(merged, None, None, false),
    );
    let mut blob = serde_json::Map::new();
    blob.insert("host".into(), json!("codex"));
    blob.insert("currency".into(), json!("USD"));
    blob.insert("today".into(), json!(today));
    blob.insert("default".into(), json!(default));
    blob.insert("views".into(), Value::Object(views));
    Value::Object(blob)
}

/// `codex-cost --html`：复用统一看板模板 calendar.html（退役独立 codex_cost.html，
/// 一套视觉模板，见 docs/UNIFIED_COST_VIEW.md）。只内联 codex 规范单块 +
/// `AGENT_VITALS_DEFAULT_HOST='codex'`（codex 视角的看板，不内联 DSH 块）。
/// JSON 经 `</script`/`<!--` 转义。与 Python `cli.py::_render_codex_cost_html`
/// 同构（HTML 文件不参与差分，只需等价可解析的页面）。
fn render_codex_cost_html(
    output_path: &Path,
    merged: &Value,
    month_key: Option<&str>,
    month_out: Option<&str>,
    default: &str,
) {
    const TEMPLATE: &str = include_str!("../../../assets/templates/calendar.html");
    let blob = codex_calendar_blob(merged, month_key, month_out, default);
    let json_text = serde_json::to_string(&blob).unwrap_or_default();
    let safe = json_text
        .replace("</script", "<\\/script")
        .replace("<!--", "<\\!--");
    let inject = format!(
        "<script id=\"agent-vitals-data-codex\" type=\"application/json\">{safe}</script>"
    );
    let host_inject = "<script>window.AGENT_VITALS_DEFAULT_HOST = 'codex';</script>";
    let html = TEMPLATE
        .replacen("</head>", &format!("{inject}\n</head>"), 1)
        .replacen("</head>", &format!("{host_inject}\n</head>"), 1);
    if let Some(parent) = output_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if std::fs::write(output_path, html).is_err() {
        eprintln!("failed to write {}", output_path.display());
        std::process::exit(2);
    }
}

/// v0.9 Stage 0.5 的 Data 面文本视图（`data coverage` / `data daily` 的默认
/// 输出）。呈现是 CLI 的职责（spec §3.1：data 层不做 UI 呈现），但诚实规则
/// 与 DTO 同源：Unavailable → "no data"，绝不渲染 0（0.6 纪律提前落到 CLI
/// 面）；金额一律带 basis 标签——estimate/api_equivalent 不冒充真实账单
/// （spec §4）。不标货币符号：Stage 0 DTO 刻意不带 currency 字段（§8.4/0.4c
/// 的决定：口径字段承载语义，混币永不相加），文本视图不重新发明。
fn amount_parts(h: &agent_vitals_data::projection::HostAmount) -> Vec<String> {
    let mut parts: Vec<String> = h
        .amounts_by_basis
        .iter()
        .map(|(b, v)| format!("{}={:.2}", b.as_str(), v))
        .collect();
    if parts.is_empty() {
        // 有观测、无钱（全 unknown 日）——不是 0，也不是账单（Unresolved
        // 不得归零，见 summary.rs::claude_host_amount）。
        parts.push("no priceable amount (unresolved)".to_string());
    }
    if h.has_unresolved {
        parts.push("has unresolved tokens".to_string());
    }
    parts
}

fn freshness_tag(h: &agent_vitals_data::projection::HostAmount) -> String {
    use agent_vitals_data::projection::FreshnessState;
    let last = h.freshness.last_observed_at.as_deref().unwrap_or("-");
    match h.freshness.state {
        FreshnessState::Fresh => format!("fresh ({last})"),
        FreshnessState::Stale => format!("stale ({last})"),
        FreshnessState::Partial => format!("partial ({last})"),
        // "Unavailable 不能带 last_observed_at"（domain 不变式 3）——防御性
        // 保留 last 位，但状态词本身已经说明没有观测。
        FreshnessState::Unavailable => "no data (unavailable)".to_string(),
    }
}

fn print_monthly_summary_text(s: &agent_vitals_data::projection::MonthlySummary) {
    println!("month {}", s.month);
    for (name, h) in &s.by_host {
        let amounts = amount_parts(h).join("  ");
        if h.freshness.state == agent_vitals_data::projection::FreshnessState::Unavailable {
            println!("  {name:<12} {}", freshness_tag(h));
        } else {
            println!("  {name:<12} {amounts}");
            println!("  {:<12} {}", "", freshness_tag(h));
        }
    }
    println!(
        "coverage {}/{} (denominator v{})",
        s.coverage.measured_fields, s.coverage.total_fields, s.coverage.denominator_version
    );
    let excluded: Vec<&str> = s.excluded_hosts.iter().map(|x| x.as_str()).collect();
    if excluded.is_empty() {
        println!("excluded hosts: (none)");
    } else {
        println!("excluded hosts: {}", excluded.join(", "));
    }
    println!(
        "summable total: {:.2} (estimates/diagnostics excluded, see per-host basis)",
        s.total_summable()
    );
}

fn print_daily_summary_text(s: &agent_vitals_data::projection::DailySummary) {
    println!("date {}", s.date);
    for (name, h) in &s.by_host {
        let amounts = amount_parts(h).join("  ");
        if h.freshness.state == agent_vitals_data::projection::FreshnessState::Unavailable {
            println!("  {name:<12} {}", freshness_tag(h));
        } else {
            println!("  {name:<12} {amounts}");
            println!("  {:<12} {}", "", freshness_tag(h));
        }
    }
    println!(
        "coverage {}/{} (denominator v{})",
        s.coverage.measured_fields, s.coverage.total_fields, s.coverage.denominator_version
    );
    let excluded: Vec<&str> = s.excluded_hosts.iter().map(|x| x.as_str()).collect();
    if excluded.is_empty() {
        println!("excluded hosts: (none)");
    } else {
        println!("excluded hosts: {}", excluded.join(", "));
    }
    println!(
        "summable total: {:.2} (estimates/diagnostics excluded, see per-host basis)",
        s.total_summable()
    );
}

fn main() {
    let args = Args::parse();

    // 行为审计：审计一份 DSH 会话日志的执行轨迹，**不跑 skill 扫描**。
    // 独立取证命令（读会话日志 → 规则引擎 → findings），在扫描之前短路。
    if let Some(Cmd::Behavior { session_log, rows_json }) = &args.cmd {
        if let Some(path) = rows_json {
            // `--json` 的 20 键载荷在 behavior.rs::audit_payload（唯一来源）——
            // DSH SessionReport 的 session 载荷就是它，键序逐字节对齐 Python。
            let Some(payload) = agent_vitals_runtime::sessions::behavior::audit_payload(session_log) else {
                eprintln!("session log unavailable: unreadable, malformed, or schema mismatch");
                std::process::exit(2);
            };
            let findings_len = payload
                .get("findings")
                .and_then(|v| v.as_array())
                .map_or(0, |a| a.len());
            let text = serde_json::to_string_pretty(&payload).unwrap_or_default();
            if path == &PathBuf::from("-") {
                println!("{text}");
            } else if std::fs::write(path, &text).is_err() {
                eprintln!("failed to write {}", path.display());
                std::process::exit(2);
            } else {
                println!("Wrote {}: {} findings", path.display(), findings_len);
            }
            return;
        }
        let Some(audit) = agent_vitals_runtime::sessions::behavior::audit_session_log(session_log) else {
            eprintln!("session log unavailable: unreadable, malformed, or schema mismatch");
            std::process::exit(2);
        };
        let findings = &audit.findings;
        for f in findings {
            let sev = f.get("severity").and_then(|v| v.as_str()).unwrap_or("");
            let glyph = match sev { "critical" => "✕", "warning" => "⚠", _ => "·" };
            let rule = f.get("rule").and_then(|v| v.as_str()).unwrap_or("");
            let cat = f.get("category").and_then(|v| v.as_str()).unwrap_or("");
            let ev = f.get("evidence").and_then(|v| v.as_str()).unwrap_or("");
            let seq_s = f.get("seq").and_then(|v| v.as_i64())
                .map(|n| n.to_string()).unwrap_or_else(|| "None".to_string());
            println!("{glyph} {rule} {cat} {ev} (seq {seq_s})");
        }
        // 成本块：findings 之后空行 + 费用估算（纯展示层，见 cost.rs）。无
        // 可分桶的桶时 cost_block 返回空列表 → 不打印（与 tab 空态同构）。
        let pricing = agent::cost::load_pricing();
        let block = agent::cost::cost_block(&audit.usage, &pricing);
        if !block.is_empty() {
            println!();
            for line in &block {
                println!("{line}");
            }
        }
        // 闸门与 doctor 同一套 --fail-on/--ignore 语义（无 --new-only，见
        // behavior_gate 的 docstring）。此前硬编码「有 critical 就退 1」，把
        // --fail-on warning / --ignore SV603 这类全局参数静默吞掉了。成本不
        // 影响退出码——闸门只看风险。
        std::process::exit(agent_vitals_runtime::sessions::behavior::behavior_gate(findings, &args.fail_on, &args.ignore));
    }

    // R1d-tick：oneline 生产者——把一份 DSH 会话日志折成一行摘要 + 今日/本月账
    // + 预算告警，并在 ledger 记 key。在扫描之前短路（与 behavior 同款），
    // fencing/审计失败 exit 2 不落盘；dedup 命中则正常退出（无输出以外副作用）。
    if let Some(Cmd::Oneline { session_log, session_id, no_merge, shadow }) = &args.cmd {
        match agent::oneline::oneline(session_log, session_id.as_deref(), *no_merge, *shadow) {
            Ok(_) => return,
            Err(msg) => {
                eprintln!("{msg}");
                std::process::exit(2);
            }
        }
    }

    // v0.6 host-contract spec §5.1/§11-M0: print the core HostProfile registry
    // as-is. `hosts_json()` is the byte-parity surface Python's
    // `host_capability.hosts_json()` mirrors (G1).
    if let Some(Cmd::Hosts { rows_json }) = &args.cmd {
        let out = agent_vitals_domain::host_capability::hosts_json();
        if let Some(path) = rows_json {
            let text = serde_json::to_string_pretty(&out).unwrap_or_default();
            if path == &PathBuf::from("-") {
                println!("{text}");
            } else if std::fs::write(path, &text).is_err() {
                eprintln!("failed to write {}", path.display());
                std::process::exit(2);
            } else {
                println!("Wrote {}", path.display());
            }
        } else {
            for h in out["hosts"].as_array().cloned().unwrap_or_default() {
                let id = h["id"].as_str().unwrap_or("?");
                let display = h["display"].as_str().unwrap_or("?");
                let unmeasured = h["unmeasured_signals"].as_array().map(|a| a.len()).unwrap_or(0);
                let degraded = h["degraded_rules"].as_array().map(|a| a.len()).unwrap_or(0);
                let store = h["session_store"].as_bool().unwrap_or(false);
                let fold = h["fold"].as_str().unwrap_or("none");
                println!(
                    "{id} ({display}): unmeasured={unmeasured} degraded_rules={degraded} \
session_store={store} fold={fold}"
                );
            }
        }
        return;
    }

    // R1d-tick：discover——列 DSH 会话根下未折的裸 session.jsonl（mtime 最新在前）。
    // 只读：不碰 fencing、不写 state；tick 与验收测试都从这里拿「折哪条」。
    if let Some(Cmd::Discover { rows_json }) = &args.cmd {
        let report = agent_vitals_runtime::sessions::discovery::discover();
        let text = serde_json::to_string_pretty(&report).unwrap_or_default();
        if let Some(path) = rows_json {
            if path == &PathBuf::from("-") {
                println!("{text}");
            } else if std::fs::write(path, &text).is_err() {
                eprintln!("failed to write {}", path.display());
                std::process::exit(2);
            }
        } else {
            println!("{text}");
        }
        return;
    }

    // T11：Skill 执行审计——从会话日志抽取 skill-invocation / tool/call(name=skill) 事件，
    // 输出调用记录（触发方式/加载状态/耗时/位置）。与 behavior 不同：这是 skill 专用，
    // 只出 skill 相关的 invocations 结构，不带 SV601–614 findings。
    if let Some(Cmd::SkillAudit { session_log, rows_json }) = &args.cmd {
        let Some(audit) = agent_vitals_runtime::sessions::behavior::audit_session_log(session_log) else {
            eprintln!("session log unavailable: unreadable, malformed, or schema mismatch");
            std::process::exit(2);
        };
        let skill = &audit.skill;
        if let Some(path) = rows_json {
            let text = serde_json::to_string_pretty(skill).unwrap_or_default();
            if path == &PathBuf::from("-") {
                println!("{text}");
            } else if std::fs::write(path, &text).is_err() {
                eprintln!("failed to write {}", path.display());
                std::process::exit(2);
            } else {
                let inv_count = skill.as_array().map(|a| a.len()).unwrap_or(0);
                println!("Wrote {}: {} skill invocations", path.display(), inv_count);
            }
            return;
        }
        // 人读格式：按触发方式和加载状态分组统计
        let invs = skill.as_array().cloned().unwrap_or_default();
        if invs.is_empty() {
            println!("No skill invocations found in session log.");
            return;
        }
        let mut by_mode = std::collections::HashMap::new();
        let mut by_status = std::collections::HashMap::new();
        for inv in &invs {
            let m = inv.get("trigger_mode").and_then(|v| v.as_str()).unwrap_or("unknown");
            let s = inv.get("load_status").and_then(|v| v.as_str()).unwrap_or("unknown");
            *by_mode.entry(m).or_insert(0) += 1;
            *by_status.entry(s).or_insert(0) += 1;
        }
        println!("Skill invocations: {} total", invs.len());
        for (m, n) in &by_mode {
            println!("  {}: {}", m, n);
        }
        for (s, n) in &by_status {
            println!("  {}: {}", s, n);
        }
        return;
    }

    // D11：执行时长审计——工具调用/turn/step/审批等待/hook 消费五路耗时数据。
    // 与 skill-audit 同一种结构（独立子命令 + `--json` 输出同一份 core 结果），
    // 这里额外给人读格式加一段"最慢的几条"——这正是这个命令存在的理由，不是
    // 跟 skill-audit 一样只报计数就够了。
    if let Some(Cmd::DurationAudit { session_log, rows_json }) = &args.cmd {
        let Some(audit) = agent_vitals_runtime::sessions::behavior::audit_session_log(session_log) else {
            eprintln!("session log unavailable: unreadable, malformed, or schema mismatch");
            std::process::exit(2);
        };
        let duration = &audit.duration;
        if let Some(path) = rows_json {
            let text = serde_json::to_string_pretty(duration).unwrap_or_default();
            if path == &PathBuf::from("-") {
                println!("{text}");
            } else if std::fs::write(path, &text).is_err() {
                eprintln!("failed to write {}", path.display());
                std::process::exit(2);
            } else {
                println!("Wrote {}", path.display());
            }
            return;
        }
        let arr = |key: &str| duration.get(key).and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let tool_calls = arr("tool_calls");
        let turns = arr("turns");
        let steps = arr("steps");
        let approvals = arr("approvals");
        let hooks = duration.pointer("/hooks/executions").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        if tool_calls.is_empty() && turns.is_empty() && steps.is_empty() && approvals.is_empty() && hooks.is_empty() {
            println!("No duration data found in session log.");
            return;
        }
        println!(
            "Tool calls: {} · Turns: {} · Steps: {} · Approvals: {} · Hook executions: {}",
            tool_calls.len(), turns.len(), steps.len(), approvals.len(), hooks.len()
        );
        // 最慢的几条工具调用——duration_ms 缺失（incomplete/failed 没等到结果）
        // 的排到最后，不是当成 0（那样反而会排到最前，读成"最快"）。
        let mut slow = tool_calls;
        slow.sort_by_key(|r| std::cmp::Reverse(r.get("duration_ms").and_then(|v| v.as_i64())));
        let timed: Vec<_> = slow.into_iter().filter(|r| r.get("duration_ms").and_then(|v| v.as_i64()).is_some()).collect();
        if !timed.is_empty() {
            println!("\nSlowest tool calls:");
            for row in timed.iter().take(5) {
                let name = row.get("tool_name").and_then(|v| v.as_str()).unwrap_or("(unknown)");
                let ms = row.get("duration_ms").and_then(|v| v.as_i64()).unwrap_or(0);
                let status = row.get("load_status").and_then(|v| v.as_str()).unwrap_or("?");
                println!("  {name} — {ms}ms ({status})");
            }
        }
        return;
    }

    // P4（docs/RUNTIME_EVIDENCE_CONTRACT.md §17）：Codex rollout → CanonicalSession
    // 的 "sound" 证明。输出 §13 coverage，不是 findings——Codex 还没有 SV601–614
    // 检测器（detector decoupling 是后置的更大一摊，P4 明确不做）。`--host codex`
    // 是安装时探针的表面，与这个子命令无关（命名冲突见 codex_session.rs 顶部注释）。
    if let Some(Cmd::CodexEvidence { session_log, roots, rows_json }) = &args.cmd {
        if *roots {
            let home = std::env::var("HOME")
                .or_else(|_| std::env::var("USERPROFILE"))
                .unwrap_or_default();
            let report = agent_vitals_hosts::codex_session::codex_session_roots_report(Path::new(&home));
            if let Some(path) = rows_json {
                let text = serde_json::to_string_pretty(&report).unwrap_or_default();
                if path == &PathBuf::from("-") {
                    println!("{text}");
                } else if std::fs::write(path, &text).is_err() {
                    eprintln!("failed to write {}", path.display());
                    std::process::exit(2);
                } else {
                    println!("Wrote {}", path.display());
                }
            } else {
                print!("{}", render_codex_roots(&report));
            }
            return;
        }
        // clap 的 required_unless_present 保证：roots=false 时 session_log 必在。
        let session_log = session_log.as_ref().expect("session_log required unless --roots");
        let parsed = agent_vitals_hosts::codex_session::read_codex_session_log(session_log);
        if parsed.get("degraded").and_then(|v| v.as_str()).is_some() {
            eprintln!("session log unavailable: unreadable, malformed, or empty");
            std::process::exit(2);
        }
        let items: Vec<Value> = parsed
            .get("items")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let session_id = parsed
            .get("session_id")
            .and_then(|v| v.as_str())
            .map(str::to_owned)
            // §14.4 back-fill：session_meta 缺席时退回文件名，保证 session 永远
            // 可指认（与 behavior 的 dsh session_id 同款兜底）。
            .unwrap_or_else(|| {
                session_log
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown")
                    .to_string()
            });
        let history_mode = parsed.get("history_mode").and_then(|v| v.as_str()).map(str::to_owned);
        let cli_version = parsed.get("cli_version").and_then(|v| v.as_str()).map(str::to_owned);
        let model = parsed.get("model").and_then(|v| v.as_str()).map(str::to_owned);
        let workspace_roots: Vec<String> = parsed
            .get("workspace_roots")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|r| r.as_str().map(str::to_owned)).collect())
            .unwrap_or_default();
        // 标题从 ~/.codex/session_index.jsonl 查（索引缺失/不在索引 → None，存在性
        // 探测，绝不报错）。`session_id` 这里还要移进 build，先借引用查表。
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_default();
        let session_index = agent_vitals_hosts::codex_session::read_session_index(Path::new(&home));
        let title = session_index.get(&session_id).cloned();
        let evidence = agent_vitals_hosts::codex_evidence::build_codex_evidence(
            items, session_id, title, history_mode, cli_version, workspace_roots, model,
        );
        if let Some(path) = rows_json {
            let out = agent_vitals_hosts::codex_evidence::codex_evidence_json(&evidence);
            let text = serde_json::to_string_pretty(&out).unwrap_or_default();
            if path == &PathBuf::from("-") {
                println!("{text}");
            } else if std::fs::write(path, &text).is_err() {
                eprintln!("failed to write {}", path.display());
                std::process::exit(2);
            } else {
                let n = out
                    .get("signals")
                    .and_then(|v| v.as_array())
                    .map(|a| a.len())
                    .unwrap_or(0);
                println!("Wrote {}: {} signals", path.display(), n);
            }
            return;
        }
        print!("{}", render_codex_evidence(&agent_vitals_hosts::codex_evidence::codex_evidence_json(&evidence)));
        return;
    }

    // Codex 成本报告（cc-trace 研究 §D 落地）。**v0.9.1 Tier B（spec §5.2）**：
    // codex 用量从 SQL 权威库读（`runtime::summary::codex_merged_from_sql` →
    // `authority_query::codex_by_hour_model`），不再全量 fold `~/.codex` rollout；
    // Python 侧 `codex-cost` 已整命令退役（ClawHub stdlib-only、无权威库），此
    // 路径 Rust-only。无状态单次调用：SQL 全窗查 → 计价 → 文本/JSON/HTML 三路。
    // 时间轴是**小时桶**（统一多桶折叠契约，见 docs/UNIFIED_COST_VIEW.md）。
    // `--month` 过滤小时轴后**重算** by_model（`codex_by_model_from_hours` 把过滤
    // 后的小时求和折回模型轴），保证 days 与 per_model 对得上。SQL 面降级：
    // `unaccounted` 恒 `[]`（残差哨兵是 rollout fold 独有）、`plan` 只有 tier
    // tag（限额快照丢失，见 `codex_merged_from_sql` doc）。`--today` 时报告带
    // `hours`（小时热力图数据）。
    if let Some(Cmd::CodexCost {
        month,
        today,
        rows_json,
        html,
    }) = &args.cmd
    {
        let (merged, note) = agent_vitals_runtime::summary::codex_merged_from_sql(
            &agent_vitals_runtime::home::data_home(),
        );
        // 库缺失/打不开 → stderr 提示：不把「空报告」当成「codex 没花钱」端出去
        // （二进制-only 安装从没跑过 sync-facts 时就是这个形态）。
        if let Some(note) = note {
            eprintln!("note: {note}");
        }
        // 月份解析（北京口径，与 Python `cli.py` 同源）：默认 = 当前自然月；
        // `--today` = 今天（过滤键是完整 YYYY-MM-DD，month 标签取今天所属月）；
        // `--month all` = 全部月份；其余 = 指定月。filter_key=None 即不过滤。
        let (filter_key, month_out): (Option<String>, Option<String>) = if *today {
            let t = agent_vitals_runtime::sessions::codex_cost::today_beijing();
            (Some(t.clone()), Some(t[..7].to_string()))
        } else {
            match month.as_deref() {
                Some("all") => (None, None),
                Some(m) => (Some(m.to_string()), Some(m.to_string())),
                None => {
                    let cur = agent_vitals_runtime::sessions::codex_cost::current_month_beijing();
                    (Some(cur.clone()), Some(cur))
                }
            }
        };
        // `--today` 时 want_hours=True：报告带 hours 键（today 视图渲染小时热力图）。
        // 折叠→过滤→计价→包装全部走共享助手（与 `_render_codex_cost_html` 的
        // 3 视图 blob 同一份逻辑，见 `codex_report_from_merged`）。
        let want_hours = *today;
        let out = codex_report_from_merged(
            &merged, filter_key.as_deref(), month_out.as_deref(), want_hours);
        let mut wrote = false;
        if let Some(path) = rows_json {
            let text = serde_json::to_string_pretty(&out).unwrap_or_default();
            if path == &PathBuf::from("-") {
                println!("{text}");
            } else if std::fs::write(path, &text).is_err() {
                eprintln!("failed to write {}", path.display());
                std::process::exit(2);
            } else {
                println!("Wrote {}", path.display());
            }
            wrote = true;
        }
        if let Some(path) = html {
            // `--html` 复用统一看板模板（codex 视角）：default 随请求——请求月
            // → "month"、全部 → "all"、今天 → "today"、无请求 → "month"。
            let default_view = if *today { "today" }
                else if month.as_deref() == Some("all") { "all" }
                else { "month" };
            render_codex_cost_html(
                path, &merged, filter_key.as_deref(), month_out.as_deref(), default_view);
            wrote = true;
        }
        if !wrote {
            print!("{}", agent_vitals_runtime::sessions::codex_cost::render_codex_cost(&out));
        }
        return;
    }

    // Codex 单会话审计：逐 session 成本 + 出处覆盖并集。codex-cost 在折叠时把
    // session 身份聚合掉，codex-evidence 给出处但不含成本；这里把该 session 的
    // 文件们折叠→合并→计价（复用 codex-cost 同一条路径），再把 evidence 覆盖取
    // 并集，拼回一个逻辑 session（跨文件 resume 按 session_id 合并）。
    // `--list` 只是选 id 的前置（id/标题/模型/文件数/时间跨度），单会话深挖是
    // `--html`/`--json`/文本三路。无状态单次调用。HTML 是新模板
    // codex_session.html（套 DSH 审计 tab 的版式，docs/DSH_INTEGRATION.md 的
    // .sv-* 视觉约定），JSON 经 `</script`/`<!--` 转义后内联。
    if let Some(Cmd::CodexSession { list, session, rows_json, html }) = &args.cmd {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_default();
        let home_path = Path::new(&home);
        if *list {
            if html.is_some() {
                eprintln!("--list only supports --json or plain text, not --html");
                std::process::exit(2);
            }
            let out = agent_vitals_runtime::sessions::codex_session_audit::codex_session_list(home_path);
            if let Some(path) = rows_json {
                let text = serde_json::to_string_pretty(&out).unwrap_or_default();
                if path == &PathBuf::from("-") {
                    println!("{text}");
                } else if std::fs::write(path, &text).is_err() {
                    eprintln!("failed to write {}", path.display());
                    std::process::exit(2);
                } else {
                    println!("Wrote {}", path.display());
                }
            } else {
                print!("{}", agent_vitals_runtime::sessions::codex_session_audit::render_codex_session_list(&out));
            }
            return;
        }
        // 缺省 --session = 最新（list 排序首项 = 末行时间戳最晚）。无任何 rollout
        // 文件 → 「no codex sessions found」，与 codex-cost 对空家目录的处理一致。
        let session_id = match session {
            Some(s) => s.clone(),
            None => {
                let list = agent_vitals_runtime::sessions::codex_session_audit::codex_session_list(home_path);
                let first = list
                    .get("sessions")
                    .and_then(|v| v.as_array())
                    .and_then(|a| a.first())
                    .and_then(|v| v.get("session_id"))
                    .and_then(|v| v.as_str())
                    .map(str::to_owned);
                match first {
                    Some(s) => s,
                    None => {
                        eprintln!("no codex sessions found");
                        std::process::exit(2);
                    }
                }
            }
        };
        let Some(out) = agent_vitals_runtime::sessions::codex_session_audit::codex_session_audit_json(home_path, &session_id)
        else {
            eprintln!("codex session not found: {session_id}");
            std::process::exit(2);
        };
        let mut wrote = false;
        if let Some(path) = rows_json {
            let text = serde_json::to_string_pretty(&out).unwrap_or_default();
            if path == &PathBuf::from("-") {
                println!("{text}");
            } else if std::fs::write(path, &text).is_err() {
                eprintln!("failed to write {}", path.display());
                std::process::exit(2);
            } else {
                println!("Wrote {}", path.display());
            }
            wrote = true;
        }
        if let Some(path) = html {
            agent_vitals_runtime::sessions::codex_session_audit::render_codex_session_html(path, &out);
            wrote = true;
        }
        if !wrote {
            print!("{}", agent_vitals_runtime::sessions::codex_session_audit::render_codex_session(&out));
        }
        return;
    }

    // Claude Code 会话审计。与 codex-session 同款 home 解析与缺省 --session =
    // 最新；SV607/608 的 Unavailable 覆盖在 claude_session.rs（host-capability
    // degradation，§12）。
    if let Some(Cmd::ClaudeSession { list, session, rows_json }) = &args.cmd {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_default();
        let home_path = Path::new(&home);
        if *list {
            let out = agent_vitals_hosts::claude_session::claude_session_list(home_path);
            if let Some(path) = rows_json {
                let text = serde_json::to_string_pretty(&out).unwrap_or_default();
                if path == &PathBuf::from("-") {
                    println!("{text}");
                } else if std::fs::write(path, &text).is_err() {
                    eprintln!("failed to write {}", path.display());
                    std::process::exit(2);
                } else {
                    println!("Wrote {}", path.display());
                }
            } else {
                print!("{}", agent_vitals_hosts::claude_session::render_claude_session_list(&out));
            }
            return;
        }
        // 缺省 --session = 最新（list 排序首项 = 末行时间戳最晚）。
        let session_id = match session {
            Some(s) => s.clone(),
            None => {
                let list = agent_vitals_hosts::claude_session::claude_session_list(home_path);
                let first = list
                    .get("sessions")
                    .and_then(|v| v.as_array())
                    .and_then(|a| a.first())
                    .and_then(|v| v.get("session_id"))
                    .and_then(|v| v.as_str())
                    .map(str::to_owned);
                match first {
                    Some(s) => s,
                    None => {
                        eprintln!("no claude sessions found");
                        std::process::exit(2);
                    }
                }
            }
        };
        let Some(out) = agent_vitals_hosts::claude_session::claude_session_audit_json(home_path, &session_id)
        else {
            eprintln!("claude session not found or unreadable: {session_id}");
            std::process::exit(2);
        };
        let text = serde_json::to_string_pretty(&out).unwrap_or_default();
        if let Some(path) = rows_json {
            if path == &PathBuf::from("-") {
                println!("{text}");
            } else if std::fs::write(path, &text).is_err() {
                eprintln!("failed to write {}", path.display());
                std::process::exit(2);
            } else {
                println!("Wrote {}", path.display());
            }
        } else {
            println!("{text}");
        }
        return;
    }

    // claude-sync：Claude Code 会话账 fold 生产者（tick 在 oneline 之后调）。
    // home 解析同 claude-session；fencing/内部错误 exit 2（同 oneline 语义）。
    if let Some(Cmd::ClaudeSync { shadow }) = &args.cmd {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_default();
        match agent::claude_cost::claude_sync(Path::new(&home), *shadow) {
            Ok(_) => return,
            Err(msg) => {
                eprintln!("{msg}");
                std::process::exit(2);
            }
        }
    }

    // ── v0.9 Stage A：emit → ingest 端到端接线（R4 §5 ingest_service）────
    // --write 把 emitter 的事实流经 runtime 共享 ingest service 落盘
    // `<data_home>/facts/<host>.jsonl`：按事实自身 `host` 分组、fact_id
    // exactly-once、写后重放自检。**唯一写路径**——sync_service（Stage B）
    // 也走 ingest_service，不在这里旁路直捅 writer。
    fn run_ingest(
        write: bool,
        cmd: &str,
        facts: &[serde_json::Value],
    ) -> Option<agent_vitals_runtime::ingest_service::IngestReport> {
        if !write {
            return None;
        }
        match agent_vitals_runtime::ingest_service::ingest_facts(
            &agent_vitals_runtime::home::data_home(),
            facts,
        ) {
            Ok(r) => Some(r),
            Err(e) => {
                eprintln!("{cmd} --write failed: {e}");
                std::process::exit(2);
            }
        }
    }

    fn attach_write_report(
        mut payload: serde_json::Value,
        report: &Option<agent_vitals_runtime::ingest_service::IngestReport>,
    ) -> serde_json::Value {
        if let Some(r) = report {
            if let Some(obj) = payload.as_object_mut() {
                obj.insert(
                    "write".to_string(),
                    serde_json::to_value(r).expect("IngestReport serializes"),
                );
            }
        }
        payload
    }

    fn print_ingest_summary(report: &Option<agent_vitals_runtime::ingest_service::IngestReport>) {
        if let Some(r) = report {
            for h in &r.hosts {
                println!(
                    "ingest → {}: +{} appended, {} duplicate, {} invalid, total {}{}",
                    h.facts_path.display(),
                    h.appended,
                    h.duplicate,
                    h.invalid,
                    h.total_after,
                    if h.repaired_tail {
                        " (repaired crash tail)"
                    } else {
                        ""
                    },
                );
            }
        }
    }

    // claude-usage-facts：单份 Claude JSONL → UsageFact rows（内存 emit，不写
    // state）。R1 拍板：per-message 事实行 + attempts + coverage，`--json -`
    // 输出与 Python `scan.py claude-usage-facts --json -` 字节相等（parity 钉测
    // 在 tests/test_claude_usage_fact.py::ClaudeUsageFactsBothTests）。
    if let Some(Cmd::ClaudeUsageFacts { session_jsonl, machine_namespace, source_profile, rows_json, write }) =
        &args.cmd
    {
        // machine_namespace 必传且非空（spec §9）。绝不让 CLI 读 takeover 身份来
        // 补齐：那是一次隐式 state 写，而 claude-usage-facts 是只读诊断。
        let ns = match machine_namespace {
            Some(ns) if !ns.is_empty() => ns.clone(),
            _ => {
                eprintln!(
                    "claude-usage-facts: --machine-namespace is required \
                     (v0.7 spec §9: caller-provided; a CLI default would write state)"
                );
                std::process::exit(2);
            }
        };
        let sid = session_jsonl
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_string();
        let result = match agent::claude_usage_fact::claude_jsonl_to_usage_facts(
            session_jsonl,
            &ns,
            source_profile,
            &sid,
        ) {
            Ok(r) => r,
            Err(msg) => {
                eprintln!("claude-usage-facts failed: {msg}");
                std::process::exit(2);
            }
        };
        let write_report = run_ingest(*write, "claude-usage-facts", &result.facts);
        if let Some(path) = rows_json {
            let payload = attach_write_report(
                agent::claude_usage_fact::to_payload_value(&result, &sid, &ns, source_profile),
                &write_report,
            );
            let text = serde_json::to_string_pretty(&payload).unwrap_or_default();
            if path == &PathBuf::from("-") {
                println!("{text}");
            } else if std::fs::write(path, &text).is_err() {
                eprintln!("failed to write {}", path.display());
                std::process::exit(2);
            } else {
                println!(
                    "Wrote {}: {} facts",
                    path.display(),
                    result.facts.len()
                );
            }
        } else {
            print!(
                "{}",
                agent::claude_usage_fact::to_human_summary(
                    &result, session_jsonl, &sid, &ns, source_profile
                )
            );
            print_ingest_summary(&write_report);
        }
        return;
    }

    // Stage 2（commit 2）：Codex UsageFact 诊断 CLI（v0.7 spec §3 候选 #3）。
    // 一份或多份 rollout JSONL → facts + attempts + coverage；**不写盘**。source
    // event id 按 rollout stem 命名空间——同 stem 的 byte-identical 复本去重、
    // 异 stem 永不误合并。与 Python `scan.py codex-usage-facts --json -` 字节相等
    // （parity 钉测在 tests/test_codex_usage_fact.py）。
    if let Some(Cmd::CodexUsageFacts { rollouts, machine_namespace, source_profile, rows_json, write }) =
        &args.cmd
    {
        // machine_namespace 必传（spec §9）。绝不让 CLI 读 takeover 身份来补齐：
        // 那是一次隐式 state 写（bootstrap machine.json），而 codex-usage-facts
        // 是只读诊断——缺失或空串即失败（exit 2），与 Python handler 同款。
        let ns = match machine_namespace {
            Some(ns) if !ns.is_empty() => ns.clone(),
            _ => {
                eprintln!(
                    "codex-usage-facts: --machine-namespace is required \
                     (v0.7 spec §9: caller-provided; a CLI default would write state)"
                );
                std::process::exit(2);
            }
        };
        let result = match agent::codex_usage_fact::codex_rollouts_to_usage_facts(
            rollouts,
            &ns,
            source_profile,
        ) {
            Ok(r) => r,
            Err(msg) => {
                eprintln!("codex-usage-facts failed: {msg}");
                std::process::exit(2);
            }
        };
        let write_report = run_ingest(*write, "codex-usage-facts", &result.facts);
        if let Some(path) = rows_json {
            let payload = attach_write_report(
                agent::codex_usage_fact::to_payload_value(&result, &ns, source_profile),
                &write_report,
            );
            let text = serde_json::to_string_pretty(&payload).unwrap_or_default();
            if path == &PathBuf::from("-") {
                println!("{text}");
            } else if std::fs::write(path, &text).is_err() {
                eprintln!("failed to write {}", path.display());
                std::process::exit(2);
            } else {
                println!(
                    "Wrote {}: {} facts",
                    path.display(),
                    result.facts.len()
                );
            }
        } else {
            print!(
                "{}",
                agent::codex_usage_fact::to_human_summary(&result, rollouts, &ns, source_profile)
            );
            print_ingest_summary(&write_report);
        }
        return;
    }

    if let Some(Cmd::DshUsageFacts { session_path, machine_namespace, source_profile, rows_json, write }) = &args.cmd
    {
        // machine_namespace 必传（spec §9），同 codex-usage-facts：绝不让 CLI 读
        // takeover 身份补齐（隐式 state 写），缺失或空串即失败（exit 2）。
        let ns = match machine_namespace {
            Some(ns) if !ns.is_empty() => ns.clone(),
            _ => {
                eprintln!(
                    "dsh-usage-facts: --machine-namespace is required \
                     (v0.7 spec §9: caller-provided; a CLI default would write state)"
                );
                std::process::exit(2);
            }
        };
        // strict 硬错误（读/解码/解析/身份/归属/duplicate）→ exit 2，不出空成功伪装
        // 「没有用量」。Err 串恒为 "code: message"，与 Python DshUsageFactError 同源。
        let result = match agent::dsh_usage_fact::dsh_session_to_usage_facts(
            session_path,
            &ns,
            source_profile.as_deref(),
        ) {
            Ok(r) => r,
            Err(msg) => {
                eprintln!("dsh-usage-facts failed: {msg}");
                std::process::exit(2);
            }
        };
        let write_report = run_ingest(*write, "dsh-usage-facts", &result.facts);
        if let Some(json_path) = rows_json {
            // --json payload = spec §5 字面 {facts, coverage}（键序固定，Python
            // handler 的 payload dict 同款；--write 追加 Rust-only 的 `write`
            // 键，flag 关闭时与 Python 字节相等）。facts 是 build_usage_fact
            // 输出、coverage 四键。
            let payload = attach_write_report(
                agent::dsh_usage_fact::to_payload_value(&result),
                &write_report,
            );
            let text = serde_json::to_string_pretty(&payload).unwrap_or_default();
            if json_path == &PathBuf::from("-") {
                println!("{text}");
            } else if std::fs::write(json_path, &text).is_err() {
                eprintln!("failed to write {}", json_path.display());
                std::process::exit(2);
            } else {
                println!(
                    "Wrote {}: {} facts",
                    json_path.display(),
                    result.facts.len()
                );
            }
        } else {
            print!(
                "{}",
                agent::dsh_usage_fact::to_human_summary(&result, session_path, &ns)
            );
            print_ingest_summary(&write_report);
        }
        return;
    }

    // data-rebuild-index（Stage B）：删 SQLite 索引 → 从权威 JSONL 全量重放。
    // 这是 DoD #1（"删除 SQLite 后可由事实文件重建等价 projection"）的
    // 人工入口；索引层的日常自愈在 ingest_service 里自动发生。
    if let Some(Cmd::DataRebuildIndex { rows_json }) = &args.cmd {
        let report = agent_vitals_runtime::ingest_service::rebuild_index(
            &agent_vitals_runtime::home::data_home(),
        );
        match report {
            Ok(outcome) => {
                if *rows_json {
                    println!(
                        "{}",
                        serde_json::to_string_pretty(&outcome).unwrap_or_default()
                    );
                } else {
                    println!(
                        "Rebuilt facts index: {} facts across {} host file(s){}",
                        outcome.rebuild.total,
                        outcome.rebuild.hosts.len(),
                        if outcome.rebuild.repaired_tails > 0 {
                            format!(" ({} crash tail(s) repaired)", outcome.rebuild.repaired_tails)
                        } else {
                            String::new()
                        },
                    );
                    for (host, n) in &outcome.rebuild.hosts {
                        println!("  {host}: {n}");
                    }
                    if let Some(ret) = &outcome.retention {
                        for (host, r) in ret.as_object().map(|m| m.iter()).into_iter().flatten() {
                            println!(
                                "  retention[{host}]: kept {} (+{} undated), dropped {} (cutoff {})",
                                r["kept"], r["kept_undated"], r["dropped"], r["cutoff_month"],
                            );
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("data-rebuild-index failed: {e}");
                std::process::exit(2);
            }
        }
        return;
    }

    // data-reconcile（Stage B）：facts 索引 vs DTO tokens_by_host 逐宿主对账。
    // 「没 ingest」= no-facts 缺口，「0 tokens」只在对账成立时出现。
    if let Some(Cmd::DataReconcile { month, rows_json }) = &args.cmd {
        let month = month
            .clone()
            .unwrap_or_else(agent_vitals_runtime::clock::current_month_beijing);
        let summary = agent_vitals_data::repository::SummaryRepository::monthly_summary(
            &agent_vitals_runtime::summary::JsonSummaryRepository,
            &agent_vitals_data::repository::MonthlySummaryQuery { month: month.clone() },
        );
        // DTO 侧 tokens_by_host 是 typed BTreeMap<String, HostTokens>——逐宿主
        // to_json() 成对账面的 {total,...} 形状。
        let dto_map: serde_json::Map<String, Value> = summary
            .tokens_by_host
            .iter()
            .map(|(k, v)| (k.clone(), v.to_json()))
            .collect();
        match agent_vitals_runtime::ingest_service::reconcile_index_vs_dto(
            &agent_vitals_runtime::home::data_home(),
            &month,
            &dto_map,
        ) {
            Ok(report) => {
                if *rows_json {
                    let mut out = report;
                    out["month"] = serde_json::json!(month);
                    println!("{}", serde_json::to_string_pretty(&out).unwrap_or_default());
                } else {
                    println!("Reconcile (facts index vs summary DTO, month {month}):");
                    for h in report["hosts"].as_array().unwrap_or(&vec![]) {
                        println!(
                            "  {:<12} {:<10} index={:<10} dto={:<10} delta={}",
                            h["host"].as_str().unwrap_or("?"),
                            h["state"].as_str().unwrap_or("?"),
                            h["index_total"],
                            h["dto_total"],
                            h["delta"],
                        );
                    }
                    println!("reconciled: {}", report["reconciled"]);
                }
            }
            Err(e) => {
                eprintln!("data-reconcile failed: {e}");
                std::process::exit(2);
            }
        }
        return;
    }

    // data budget-reconcile（退休路径 ③ 验收面）：state 链账 vs 索引账。
    if let Some(Cmd::DataBudgetReconcile { month, rows_json }) = &args.cmd {
        let month = month
            .clone()
            .unwrap_or_else(agent_vitals_runtime::clock::current_month_beijing);
        let report = agent_vitals_runtime::budget::reconcile_budget_sources(&month);
        if *rows_json {
            println!("{}", serde_json::to_string_pretty(&report).unwrap_or_default());
        } else {
            // cost 是 {total, peak_total} 对象——取 total（此前把对象当
            // 数字读，永远显示「无」，JSON 面是对的、人读面说谎）。
            let fmt = |v: &Value| {
                v.get("total")
                    .and_then(Value::as_f64)
                    .map(|x| format!("¥{x:.2}"))
                    .unwrap_or_else(|| "无".into())
            };
            println!("Budget reconcile (month {month}):");
            println!("  state 链（month.json）: {}", fmt(&report["state_cost"]));
            println!("  索引（facts）        : {}", fmt(&report["index_cost"]));
            let note = report["note"].as_str().unwrap_or("");
            println!(
                "  reconciled: {}{}",
                report["reconciled"],
                if note.is_empty() { String::new() } else { format!("（{note}）") }
            );
        }
        return;
    }

    // data-reconcile-authority（Phase 4.1，spec §6.3）：SQL 权威库 vs legacy
    // state JSON 逐 host×bucket / provider×basis×currency 对账。mismatch → 退出 1。
    if let Some(Cmd::DataReconcileAuthority { month, rows_json }) = &args.cmd {
        let month = month
            .clone()
            .unwrap_or_else(agent_vitals_runtime::clock::current_month_beijing);
        let report = agent_vitals_runtime::summary::reconcile_authority_vs_legacy(&month);
        // §6.3：例外落 data_quality_issues（data-status 可见）。写失败不拦报告。
        if let Err(e) = agent_vitals_runtime::summary::persist_reconcile_exceptions(
            &agent_vitals_runtime::home::data_home(),
            &report,
        ) {
            eprintln!("note: reconcile exceptions not persisted: {e}");
        }
        if *rows_json {
            println!("{}", serde_json::to_string_pretty(&report).unwrap_or_default());
        } else {
            println!("Authority vs legacy reconcile (month {month}):");
            for r in report["tokens_by_host"].as_array().unwrap_or(&vec![]) {
                println!(
                    "  tokens {:<12} {:<9} abs_delta={}",
                    r["host"].as_str().unwrap_or("?"),
                    r["verdict"].as_str().unwrap_or("?"),
                    r["abs_delta_tokens"],
                );
            }
            for r in report["amounts_by_provider_basis"].as_array().unwrap_or(&vec![]) {
                if r["verdict"] != "exact" {
                    println!(
                        "  amount {:<24} {:<18} sql={} legacy={} ({})",
                        r["provider"].as_str().unwrap_or("?"),
                        r["basis"].as_str().unwrap_or("?"),
                        r["sql_minor"],
                        r["legacy_minor"],
                        r["verdict"].as_str().unwrap_or("?"),
                    );
                }
            }
            println!("reconciled: {}", report["reconciled"]);
        }
        if report["reconciled"] != serde_json::json!(true) {
            std::process::exit(1);
        }
        return;
    }

    // sync-facts（Stage B 遗留收口）：三宿主例行 ingest——退休路径第 ① 步。
    // 托盘 tick 未来也调这一条（不各自长文件枚举）。
    if let Some(Cmd::SyncFacts { rows_json }) = &args.cmd {
        match agent_vitals_runtime::sync_service::sync_facts(
            &agent_vitals_runtime::home::data_home(),
        ) {
            Ok(report) => {
                if *rows_json {
                    println!(
                        "{}",
                        serde_json::to_string_pretty(&report).unwrap_or_default()
                    );
                } else {
                    println!(
                        "Facts sync: +{} appended, {} duplicate",
                        report.total_appended, report.total_duplicate
                    );
                    for h in &report.hosts {
                        println!(
                            "  {:<12} seen {} synced {} skipped {} (+{} dup{})",
                            h.host,
                            h.files_seen,
                            h.files_synced,
                            h.files_skipped,
                            h.appended,
                            if h.errors.is_empty() {
                                String::new()
                            } else {
                                format!("; {} error(s)", h.errors.len())
                            },
                        );
                    }
                }
            }
            Err(e) => {
                eprintln!("sync-facts failed: {e}");
                std::process::exit(2);
            }
        }
        return;
    }

    // data-migrate / data-status（v0.9.1 Phase 2 收口）：存量迁移与权威库
    // 状态面。migrate 幂等（fact_id 主键），可重复执行直到全 duplicate。
    if let Some(Cmd::DataMigrate) = &args.cmd {
        let data_home = agent_vitals_runtime::home::data_home();
        let db = match agent_vitals_data::authority::AuthorityDb::open(
            &agent_vitals_data::authority::default_authority_path(&data_home),
            agent_vitals_runtime::sql_sync::now_ms(),
        ) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("data-migrate failed: {e}");
                std::process::exit(2);
            }
        };
        let run_id = agent_vitals_runtime::sql_sync::new_run_id("migration");
        if let Err(e) = db.begin_run(&run_id, "migration", agent_vitals_runtime::sql_sync::now_ms()) {
            eprintln!("data-migrate failed: {e}");
            std::process::exit(2);
        }
        // 迁移总量（JSONL + legacy ledger 合并同一口径——收尾行与 migrations
        // checkpoint 都从这读）。
        struct Totals {
            inserted: usize,
            duplicate: usize,
            rejected: usize,
            updated: usize,
            conflicts: usize,
        }
        let mut total = Totals { inserted: 0, duplicate: 0, rejected: 0, updated: 0, conflicts: 0 };
        for host in ["claude-code", "codex", "dsh"] {
            let path = data_home.join("facts").join(format!("{host}.jsonl"));
            if !path.exists() {
                continue;
            }
            match db.with_immediate_txn(|conn| {
                let writer = agent_vitals_data::fact_writer_sql::SqlFactWriter::new(
                    conn,
                    &run_id,
                    agent_vitals_runtime::sql_sync::now_ms(),
                )?;
                writer.import_facts_jsonl(host, &path)
            }) {
                Ok(r) => {
                    println!(
                        "  {host}: +{} inserted, {} duplicate, {} rejected",
                        r.inserted, r.duplicate, r.rejected
                    );
                    total.inserted += r.inserted;
                    total.duplicate += r.duplicate;
                    total.rejected += r.rejected;
                }
                Err(e) => {
                    let _ = db.finish_run(
                        &run_id,
                        "failed",
                        Some("import_failed"),
                        Some(&e.to_string()),
                        agent_vitals_runtime::sql_sync::now_ms(),
                    );
                    eprintln!("data-migrate failed ({host}): {e}");
                    std::process::exit(2);
                }
            }
        }
        // Phase 3.2（spec §6.2.3）：claude ledger 深历史 → legacy_aggregate。
        // 这些账在 JSONL 里**没有对应行**——claude 客户端会压缩/轮转会话文件，
        // 历史行物理消失后 ledger 里仍有账（R4 §5.2a：ledger 是这部分账的
        // store of record）。不用判断「该日是否已有实时事实」：legacy 身份
        // 五元组（machine_namespace="legacy" / native_session_id="day:{day}"）
        // 与实时事实完全不重叠，查询侧 SqlSummaryRepository::merged_claude_days
        // 先铺 legacy 再被实时行按日覆盖（有实时用实时、没有才退深历史）。
        let ledger_days = match agent_vitals_data::legacy_import::load_claude_ledger_days(
            &agent_vitals_runtime::state::state_dir(),
        ) {
            Ok(d) => d,
            Err(e) => {
                // 坏 ledger（非法 JSON 等）与 JSONL 导入失败同款处理：run 记
                // failed 后退出——吞掉它就是「看似迁移成功、深历史实际没进库」。
                let _ = db.finish_run(
                    &run_id,
                    "failed",
                    Some("import_failed"),
                    Some(&e.to_string()),
                    agent_vitals_runtime::sql_sync::now_ms(),
                );
                eprintln!("data-migrate failed (claude-ledger): {e}");
                std::process::exit(2);
            }
        };
        if ledger_days.as_object().map(|m| !m.is_empty()).unwrap_or(false) {
            match db.with_immediate_txn(|conn| {
                agent_vitals_data::legacy_import::import_claude_ledger_days(
                    conn,
                    &run_id,
                    agent_vitals_runtime::sql_sync::now_ms(),
                    &ledger_days,
                )
            }) {
                Ok(r) => {
                    println!(
                        "  claude-ledger: +{} inserted, {} duplicate, {} updated, {} rejected, {} conflicts",
                        r.imported, r.duplicate, r.updated, r.rejected, r.conflicts
                    );
                    total.inserted += r.imported;
                    total.duplicate += r.duplicate;
                    total.updated += r.updated;
                    // 拒入行并入总 rejected（2026-09-07 审查收口：否则
                    // checkpoint 的 rejected 键只剩 JSONL 侧的数，迁移摘要
                    // 与 data_quality_issues 面互相矛盾）。
                    total.rejected += r.rejected;
                    total.conflicts += r.conflicts;
                }
                Err(e) => {
                    let _ = db.finish_run(
                        &run_id,
                        "failed",
                        Some("import_failed"),
                        Some(&e.to_string()),
                        agent_vitals_runtime::sql_sync::now_ms(),
                    );
                    eprintln!("data-migrate failed (claude-ledger): {e}");
                    std::process::exit(2);
                }
            }
        }
        // ledger 的无日期残差池（`unaccounted`）：不编日期塞 usage_facts，记为
        // 一条 `undated_residual` 覆盖缺口 issue（spec §5.4：无日期事实不静默
        // 丢弃；裁决见 legacy_import::import_claude_ledger_unaccounted）。
        match agent_vitals_data::legacy_import::load_claude_ledger_unaccounted(
            &agent_vitals_runtime::state::state_dir(),
        ) {
            Ok(unacc) => {
                match db.with_immediate_txn(|conn| {
                    agent_vitals_data::legacy_import::import_claude_ledger_unaccounted(
                        conn,
                        agent_vitals_runtime::sql_sync::now_ms(),
                        &unacc,
                    )
                }) {
                    Ok(0) => {}
                    Ok(tokens) => println!(
                        "  claude-ledger unaccounted: {tokens} undated residual tokens recorded as a coverage-gap issue (not facts)"
                    ),
                    Err(e) => eprintln!("data-migrate warning (claude-ledger unaccounted): {e}"),
                }
            }
            Err(e) => eprintln!("data-migrate warning (claude-ledger unaccounted, unreadable): {e}"),
        }
        let _ = db.finish_run(&run_id, "succeeded", None, None, agent_vitals_runtime::sql_sync::now_ms());
        // spec §6.1：迁移必须记录在 migrations 表（与 DDL 版本分离）——
        // checkpoint 可重跑的锚点。
        let _ = db.conn().execute(
            "INSERT INTO migrations(migration_id, started_at_ms, completed_at_ms,
                 status, source_version, target_version, checkpoint_json, error_detail)
             VALUES (?1, ?2, ?3, 'completed', 'jsonl-legacy', ?4, ?5, NULL)
             ON CONFLICT(migration_id) DO UPDATE SET
                 completed_at_ms = excluded.completed_at_ms,
                 status = excluded.status,
                 checkpoint_json = excluded.checkpoint_json",
            rusqlite::params![
                run_id,
                agent_vitals_runtime::sql_sync::now_ms(),
                agent_vitals_runtime::sql_sync::now_ms(),
                format!("sql-authority-v{}", agent_vitals_data::authority::SCHEMA_VERSION),
                json!({
                    "inserted": total.inserted, "duplicate": total.duplicate,
                    "rejected": total.rejected, "updated": total.updated,
                    "conflicts": total.conflicts,
                })
                .to_string(),
            ],
        );
        println!(
            "Migration done: +{} inserted, {} duplicate, {} rejected, {} updated, {} conflicts",
            total.inserted, total.duplicate, total.rejected, total.updated, total.conflicts
        );
        return;
    }
    if let Some(Cmd::DataStatus { rows_json }) = &args.cmd {
        let data_home = agent_vitals_runtime::home::data_home();
        let out = (|| -> Result<Value, String> {
            let db = agent_vitals_data::authority::AuthorityDb::open(
                &agent_vitals_data::authority::default_authority_path(&data_home),
                agent_vitals_runtime::sql_sync::now_ms(),
            )
            .map_err(|e| e.to_string())?;
            let conn = db.conn();
            let schema: String = conn
                .query_row(
                    "SELECT value FROM schema_meta WHERE key = 'schema_version'",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or_else(|_| "?".into());
            let facts: i64 = conn
                .query_row("SELECT COUNT(*) FROM usage_facts WHERE deleted_at_ms IS NULL", [], |r| r.get(0))
                .unwrap_or(0);
            let sources: i64 = conn
                .query_row("SELECT COUNT(*) FROM source_files", [], |r| r.get(0))
                .unwrap_or(0);
            let sessions: i64 = conn
                .query_row("SELECT COUNT(*) FROM sessions WHERE deleted_at_ms IS NULL", [], |r| r.get(0))
                .unwrap_or(0);
            let issues: i64 = conn
                .query_row("SELECT COUNT(*) FROM data_quality_issues WHERE resolved_at_ms IS NULL", [], |r| r.get(0))
                .unwrap_or(0);
            // 逐 code 明细：`undated_residual`（ledger 无日期残差）、
            // `legacy_aggregate`（聚合兜底月份）等按名可见，不只是一个总数。
            let mut issues_by_code: serde_json::Map<String, Value> = serde_json::Map::new();
            if let Ok(mut stmt) = conn.prepare(
                "SELECT code, COUNT(*) FROM data_quality_issues
                 WHERE resolved_at_ms IS NULL GROUP BY code ORDER BY code",
            ) {
                if let Ok(rows) = stmt.query_map([], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
                }) {
                    for (code, n) in rows.filter_map(Result::ok) {
                        issues_by_code.insert(code, json!(n));
                    }
                }
            }
            let mut runs = Vec::new();
            if let Ok(mut stmt) = conn.prepare(
                "SELECT run_id, trigger, status, started_at_ms, error_code FROM sync_runs
                 ORDER BY started_at_ms DESC LIMIT 5",
            ) {
                if let Ok(rows) = stmt.query_map([], |r| {
                    Ok(json!({
                        "run_id": r.get::<_, String>(0)?,
                        "trigger": r.get::<_, String>(1)?,
                        "status": r.get::<_, String>(2)?,
                        "started_at_ms": r.get::<_, i64>(3)?,
                        "error_code": r.get::<_, Option<String>>(4)?,
                    }))
                }) {
                    for row in rows.filter_map(Result::ok) {
                        runs.push(row);
                    }
                }
            }
            Ok(json!({
                "schema_version": schema,
                "facts": facts,
                "sources": sources,
                "sessions": sessions,
                "open_quality_issues": issues,
                "open_quality_issues_by_code": issues_by_code,
                "recent_runs": runs,
            }))
        })();
        match out {
            Ok(v) => {
                if *rows_json {
                    println!("{}", serde_json::to_string_pretty(&v).unwrap_or_default());
                } else {
                    println!(
                        "Authority DB ({}): schema v{}, facts {}, sources {}, sessions {}, open issues {}",
                        data_home.display(),
                        v["schema_version"].as_str().unwrap_or("?"),
                        v["facts"],
                        v["sources"],
                        v["sessions"],
                        v["open_quality_issues"],
                    );
                    if let Some(by_code) = v["open_quality_issues_by_code"].as_object() {
                        for (code, n) in by_code {
                            println!("  issue [{code}]: {n}");
                        }
                    }
                    if let Some(runs) = v["recent_runs"].as_array() {
                        for r in runs {
                            println!(
                                "  run {} [{}] {} (at {}){}",
                                r["run_id"], r["trigger"], r["status"], r["started_at_ms"],
                                r["error_code"].as_str().map(|c| format!(" err={c}")).unwrap_or_default(),
                            );
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("data-status failed: {e}");
                std::process::exit(2);
            }
        }
        return;
    }

    // data-export-private / data-export-redacted（Stage C，spec §6；v0.9.1
    // Phase 3.6 起数据源 = SQL 权威库，spec §9）：两条独立写路径——私有 trace
    // 原样、脱敏导出重导身份。命令面分开正是 spec「不能由一个 redacted: bool
    // 决定」的落地。字段映射与锁语义（SQL 快照，不再拿 .ingest.lock）见
    // runtime::export 模块头。
    if let Some(Cmd::DataExportPrivate { out }) = &args.cmd {
        match agent_vitals_runtime::export::export_private(
            &agent_vitals_runtime::home::data_home(),
            out,
        ) {
            Ok(files) => println!("Private export: {} fact file(s) → {}", files, out.display()),
            Err(e) => {
                eprintln!("data-export-private failed: {e}");
                std::process::exit(2);
            }
        }
        return;
    }
    if let Some(Cmd::DataExportRedacted { out }) = &args.cmd {
        match agent_vitals_runtime::export::export_redacted(
            &agent_vitals_runtime::home::data_home(),
            out,
        ) {
            Ok((files, n)) => println!(
                "Redacted export: {} fact(s) in {} file(s) → {}",
                n,
                files,
                out.display()
            ),
            Err(e) => {
                eprintln!("data-export-redacted failed: {e}");
                std::process::exit(2);
            }
        }
        return;
    }

    // data-unresolved（Stage B）：has_unresolved 的逐模型下钻（DoD #4）。
    if let Some(Cmd::DataUnresolved { month, rows_json }) = &args.cmd {
        let month = month
            .clone()
            .unwrap_or_else(agent_vitals_runtime::clock::current_month_beijing);
        let detail = agent_vitals_runtime::summary::unresolved_detail(&month);
        if *rows_json {
            let out = serde_json::json!({"month": month, "providers": detail});
            println!("{}", serde_json::to_string_pretty(&out).unwrap_or_default());
        } else {
            println!("Unresolved usage detail (month {month}):");
            let mut any = false;
            for (prov, rows) in detail.as_object().map(|m| m.iter()).into_iter().flatten() {
                for r in rows.as_array().map(|a| a.iter()).into_iter().flatten() {
                    any = true;
                    println!(
                        "  {:<24} {:<28} {:<22} tokens={}",
                        prov,
                        r["model"].as_str().unwrap_or("?"),
                        r["reason"].as_str().unwrap_or("?"),
                        r["tokens"],
                    );
                }
            }
            if !any {
                println!("  (none — all measured usage is priced and routed)");
            }
        }
        return;
    }

    // WorkBuddy 会话审计。与 claude/codex-session 同款 home 解析与缺省 --session =
    // 最新；SV604/605 的 Unavailable 覆盖在 workbuddy_session.rs（host-capability
    // degradation，spec §3.1）。db 无行且 audit-log 无记录 → 不存在（exit 2）。
    if let Some(Cmd::WorkbuddySession { list, session, rows_json }) = &args.cmd {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_default();
        let home_path = Path::new(&home);
        if *list {
            let out = agent_vitals_hosts::workbuddy_session::workbuddy_session_list(home_path);
            if let Some(path) = rows_json {
                let text = serde_json::to_string_pretty(&out).unwrap_or_default();
                if path == &PathBuf::from("-") {
                    println!("{text}");
                } else if std::fs::write(path, &text).is_err() {
                    eprintln!("failed to write {}", path.display());
                    std::process::exit(2);
                } else {
                    println!("Wrote {}", path.display());
                }
            } else {
                print!(
                    "{}",
                    agent_vitals_hosts::workbuddy_session::render_workbuddy_session_list(&out)
                );
            }
            return;
        }
        // 缺省 --session = 最新（list 排序首项 = updated_at 最晚）。
        let session_id = match session {
            Some(s) => s.clone(),
            None => {
                let list = agent_vitals_hosts::workbuddy_session::workbuddy_session_list(home_path);
                let first = list
                    .get("sessions")
                    .and_then(|v| v.as_array())
                    .and_then(|a| a.first())
                    .and_then(|v| v.get("session_id"))
                    .and_then(|v| v.as_str())
                    .map(str::to_owned);
                match first {
                    Some(s) => s,
                    None => {
                        eprintln!("no workbuddy sessions found");
                        std::process::exit(2);
                    }
                }
            }
        };
        let Some(out) =
            agent_vitals_hosts::workbuddy_session::workbuddy_session_audit_json(home_path, &session_id)
        else {
            eprintln!("workbuddy session not found or unreadable: {session_id}");
            std::process::exit(2);
        };
        let text = serde_json::to_string_pretty(&out).unwrap_or_default();
        if let Some(path) = rows_json {
            if path == &PathBuf::from("-") {
                println!("{text}");
            } else if std::fs::write(path, &text).is_err() {
                eprintln!("failed to write {}", path.display());
                std::process::exit(2);
            } else {
                println!("Wrote {}", path.display());
            }
        } else {
            println!("{text}");
        }
        return;
    }

    // R2a SessionStore 查询面（只读）。home 解析与 codex-session 同款；查询本体
    // 在 core，r2a_store 只做 I/O + 组装 + 类型化错误码。
    if let Some(Cmd::Sessions { action }) = &args.cmd {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_default();
        let home_path = Path::new(&home);
        match action {
            SessionsAction::List {
                host_kind,
                model,
                date_from,
                date_to,
                query,
                page_size,
                cursor,
                json,
            } => {
                let filter = agent_vitals_domain::r2a::SessionFilter {
                    host_kind: host_kind.clone(),
                    model: model.clone(),
                    date_from: date_from.clone(),
                    date_to: date_to.clone(),
                    query: query.clone(),
                };
                agent_vitals_runtime::sessions::r2a_store::sessions_list(
                    home_path,
                    &filter,
                    *page_size,
                    cursor,
                    *json,
                );
            }
            SessionsAction::Read { session_key, revision, json } => {
                agent_vitals_runtime::sessions::r2a_store::sessions_read(home_path, session_key, revision, *json);
            }
            SessionsAction::Findings { json } => {
                agent_vitals_runtime::sessions::r2a_store::sessions_findings(home_path, *json);
            }
            SessionsAction::Navigation { day, timezone, recent, json } => {
                // `--day` 缺省 = 今天（北京日界，core 折叠的日期桶是 UTC+8 时
                // 段；spec §5.1）。
                let day = if day.is_empty() {
                    agent_vitals_runtime::sessions::codex_cost::today_beijing()
                } else {
                    day.clone()
                };
                agent_vitals_runtime::sessions::r2a_store::sessions_navigation(home_path, &day, timezone, *recent, *json);
            }
        }
        return;
    }

    // 预算告警只读路径（R1b）。决策在 core（evaluate_alert），这里只接线：
    // 读输入 → 调 core → 文本/JSON 渲染。`budget show --month` 是纯月查询，
    // 跟阈值/告警无关，走 budget_show_month。set/snooze 等写路径随 R1c 落地。
    if let Some(Cmd::Budget { action, month, json }) = &args.cmd {
        match action.as_str() {
            "show" => {
                if let Some(m) = month {
                    agent_vitals_runtime::budget::budget_show_month(m, *json);
                } else {
                    agent_vitals_runtime::budget::budget_show(*json);
                }
            }
            // clap value_parser 只放行 "show"，这里不可达 —— 防御性保留，
            // R1c 加写路径时替换成真分支。
            other => {
                eprintln!("budget action not implemented in Rust yet: {other}");
                std::process::exit(2);
            }
        }
        return;
    }

    // v0.9.1 Phase 3.4 SQL 预算面：budget_config/budget_snoozes 显式管理 API
    // + budget_status_sql（替代 alert.json/budget.json 的读面；Tier B 切完
    // 托盘预算卡后旧链停写）。金额全 minor 整数；错误路径 exit 2。
    if let Some(Cmd::BudgetSql { action, month, monthly_cny_minor, daily_cny_minor, warning_ratio_bp, until }) = &args.cmd {
        let db = || -> agent_vitals_data::authority::AuthorityDb {
            match agent_vitals_data::authority::AuthorityDb::open(
                &agent_vitals_data::authority::default_authority_path(
                    &agent_vitals_runtime::home::data_home(),
                ),
                agent_vitals_runtime::sql_sync::now_ms(),
            ) {
                Ok(d) => d,
                Err(e) => {
                    eprintln!("budget-sql failed: {e}");
                    std::process::exit(2);
                }
            }
        };
        match action.as_str() {
            "status" => {
                let m = month.clone().unwrap_or_else(agent_vitals_runtime::clock::current_month_beijing);
                match agent_vitals_runtime::budget::budget_status_sql(&m) {
                    Some(v) => println!("{}", serde_json::to_string_pretty(&v).unwrap_or_default()),
                    None => {
                        eprintln!("budget-sql status failed: authority DB unavailable");
                        std::process::exit(2);
                    }
                }
            }
            "alert" => {
                // SQL 权威面的 `budget show` 等价物：evaluate_alert 从权威库算
                // （跨宿主按量 CNY 口径），不读 today.json/month.json/alert.json。
                let v = agent_vitals_runtime::budget::evaluate_alert_from_sql(
                    &agent_vitals_runtime::home::data_home(),
                );
                println!("{}", serde_json::to_string_pretty(&v).unwrap_or_default());
            }
            "config-show" => {
                let d = db();
                match d.budget_config_get() {
                    Ok(Some(c)) => println!(
                        "{}",
                        serde_json::to_string_pretty(&json!({
                            "monthly_cny_minor": c.monthly_cny_minor,
                            "daily_cny_minor": c.daily_cny_minor,
                            "warning_ratio_bp": c.warning_ratio_bp,
                            "updated_at_ms": c.updated_at_ms,
                        }))
                        .unwrap_or_default()
                    ),
                    Ok(None) => println!("(no budget config — use config-set or let status seed from legacy config.toml)"),
                    Err(e) => {
                        eprintln!("budget-sql config-show failed: {e}");
                        std::process::exit(2);
                    }
                }
            }
            "config-set" => {
                let (Some(m), Some(d)) = (monthly_cny_minor, daily_cny_minor) else {
                    eprintln!("config-set requires --monthly-cny-minor and --daily-cny-minor");
                    std::process::exit(2);
                };
                if *m < 0 || *d < 0 || warning_ratio_bp.is_some_and(|w| !(0..=10_000).contains(&w)) {
                    eprintln!("config-set: amounts must be non-negative; warning-ratio-bp within 0..=10000");
                    std::process::exit(2);
                }
                let d0 = db();
                match d0.budget_config_set(*m, *d, warning_ratio_bp.unwrap_or(8_000), agent_vitals_runtime::sql_sync::now_ms()) {
                    Ok(()) => println!("budget config saved: monthly={m} daily={d} warn_bp={}", warning_ratio_bp.unwrap_or(8_000)),
                    Err(e) => {
                        eprintln!("budget-sql config-set failed: {e}");
                        std::process::exit(2);
                    }
                }
            }
            "snooze-set" => {
                let Some(u) = until else {
                    eprintln!("snooze-set requires --until <ISO datetime>");
                    std::process::exit(2);
                };
                // 解析在 runtime 侧做（iso_to_ms_beijing 未导出——这里经
                // budget_status_sql 的伴生入口直接传串，由 runtime 解析并
                // 落库；解析失败如实报错不猜时区）。
                match agent_vitals_runtime::budget::budget_snooze_set_sql(u) {
                    Ok(ms) => println!("snoozed until {u} (until_ms={ms})"),
                    Err(e) => {
                        eprintln!("budget-sql snooze-set failed: {e}");
                        std::process::exit(2);
                    }
                }
            }
            "snooze-clear" => {
                let d0 = db();
                match d0.budget_snooze_clear() {
                    Ok(()) => println!("snooze cleared"),
                    Err(e) => {
                        eprintln!("budget-sql snooze-clear failed: {e}");
                        std::process::exit(2);
                    }
                }
            }
            other => {
                eprintln!("budget-sql action not implemented: {other}");
                std::process::exit(2);
            }
        }
        return;
    }

    // 状态写链（R1c）。输入都是已经算好的 JSON 文件，CLI 只做「读文件 → 调
    // 写函数 → 落盘」。文件缺 / 坏 → 走 Python 同款诚实路径（读不到就不写那
    // 个字段），不在 CLI 层补默认值。
    if let Some(Cmd::State { action }) = &args.cmd {
        use agent_vitals_runtime::state as st;
        let read_input = |p: &PathBuf| -> serde_json::Value {
            let text = std::fs::read_to_string(p).unwrap_or_else(|e| {
                eprintln!("cannot read {p:?}: {e}");
                std::process::exit(2);
            });
            serde_json::from_str(&text).unwrap_or_else(|e| {
                eprintln!("invalid JSON in {p:?}: {e}");
                std::process::exit(2);
            })
        };
        let opt = |p: &Option<PathBuf>| p.as_ref().map(read_input);
        match action {
            StateAction::MergeToday { hb, by_model } => {
                st::merge_today(&read_input(hb), opt(by_model).as_ref());
            }
            StateAction::MergeMonth { hb, by_date_model } => {
                st::merge_month(&read_input(hb), opt(by_date_model).as_ref());
            }
            StateAction::WriteOneline { summary } => {
                st::write_oneline(&read_input(summary));
            }
            StateAction::AppendHistory { summary } => {
                st::append_session_history(&read_input(summary));
            }
            StateAction::WriteAlert { alert } => {
                st::write_alert(&read_input(alert));
            }
            StateAction::Snooze { until_iso, reason } => {
                match st::set_snooze(until_iso, reason) {
                    Some(_) => {}
                    None => {
                        eprintln!("invalid ISO time: {until_iso}");
                        std::process::exit(2);
                    }
                }
            }
            StateAction::Unsnooze => st::clear_snooze(),
            StateAction::FoldSession { req, shadow } => {
                use agent_vitals_runtime::takeover::FoldOutcome;
                match agent_vitals_runtime::takeover::fold_session(&read_input(req), *shadow) {
                    Ok(FoldOutcome::Folded) => println!(r#"{{"outcome":"folded"}}"#),
                    Ok(FoldOutcome::SkippedAlreadyFolded) => {
                        println!(r#"{{"outcome":"skipped"}}"#);
                    }
                    Err(msg) => {
                        eprintln!("{msg}");
                        std::process::exit(2);
                    }
                }
            }
            StateAction::Takeover { owner } => {
                agent_vitals_runtime::takeover::takeover(owner);
                println!("owner switched to {owner}");
            }
            StateAction::MachineNamespace => {
                println!("{}", agent_vitals_runtime::takeover::machine_namespace());
            }
            StateAction::BySource => st::by_source_report(),
            StateAction::ByModel => st::by_model_report(),
            StateAction::Uncovered => st::uncovered_report(),
            StateAction::Savings => st::savings_report(),
        }
        return;
    }

    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    let home_n = norm(&PathBuf::from(&home));
    let cwd_n = std::env::current_dir().map(|p| norm(&p)).unwrap_or_default();

    // 默认预算取自环境变量。口径随 Claude Code 版本变化，故做成可配置。
    let default_budget: i64 = std::env::var("SLASH_COMMAND_TOOL_CHAR_BUDGET")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(15000);
    let budget = args.budget.unwrap_or(default_budget);

    // 扫描器自身所在的 skill 根目录：安全扫描要排除它（不变量 5）
    let self_root = args.self_root.clone().or_else(detect_self_root);

    let ctx = Ctx {
        home_n: home_n.clone(),
        cwd_n: cwd_n.clone(),
        self_root,
    };

    let cfg = agent_vitals_hosts::hosts::claude_code::sources::skills::read_host_config(&home_n);

    // Session surface 负责读日志；Skill surface 只消费注入的证据。
    let (dsh_path, dsh_evidence) = agent_vitals_runtime::session_sources::read_dsh_skill_correlation();
    let inv = agent_vitals_runtime::skills::inventory::take(
        &agent_vitals_runtime::skills::inventory::Selection {
            host: &args.host,
            extra_paths: &args.path,
            runtime_json: args.runtime_json.as_deref(),
        },
        &home_n,
        &cfg,
        &ctx,
        agent_vitals_runtime::skills::inventory::SessionEvidenceInput {
            dsh_path,
            dsh: dsh_evidence,
        },
    );

    // 采集到此为止；下面全是纯数据变换，交给 report。
    let rep = skills::report::build(&skills::report::ReportInput {
        host: &args.host,
        all: args.all,
        budget,
        zombie_age: args.zombie_age,
        split_threshold: args.split_threshold,
        home_n: &home_n,
        inv: &inv,
        cfg: &cfg,
    });
    let mut doc = rep.doc;


    // 快照要在**算完 diff 之后**才写，否则这一次会拿自己当基线，变化段永远
    // 是空的 —— 一个看起来在工作、实际什么都没比的功能。
    let auto_snapshot = matches!(&args.cmd, None | Some(Cmd::Doctor { .. }))
        && !args.no_snapshot
        && args.json.is_none()
        && !matches!(&args.cmd, Some(Cmd::Doctor { rows_json: Some(_), .. }));
    let baseline: Option<PathBuf> = args.baseline.clone().or_else(|| {
        match &args.cmd {
            Some(Cmd::Diff { file, .. }) => file.clone().or_else(agent_vitals_runtime::skills::snapshot::latest_snapshot),
            // --new-only 也要找基线。**不能只挂在 auto_snapshot 上** ——
            // `--no-snapshot` 的语义是「别写」，不是「别比」。
            _ if auto_snapshot || args.new_only => agent_vitals_runtime::skills::snapshot::latest_snapshot(),
            _ => None,
        }
    });
    if let Some(b) = &baseline {
        // 先算完再插入：diff 要读 doc 的内容，不能在可变借用期间读
        let d = skills::diff::diff_against(b, &doc);
        doc.as_object_mut()
            .unwrap()
            .insert("diff_vs_baseline".into(), d);
    }

    if args.redact || args.redact_names {
        doc = skills::redact::redact(&doc, args.redact_names, &home_n, &cwd_n);
        doc.as_object_mut().unwrap().insert(
            "redacted".into(),
            json!({
                "paths": true,
                "names": args.redact_names,
                "note": "This output is redacted for sharing. Run a new scan to obtain the original data.",
            }),
        );
    }

    // v0.9 Stage 0.5 Data Query API（只读诊断）。数据面经 trait——CLI 拿到
    // 的是 `Box<dyn SummaryRepository>`，不 new 具体类型到调用点之外、不读
    // 任何 state 文件（spec §3.1 依赖表：apps 只消费 Runtime 的版本化 DTO）。
    // Phase 3.5 Tier A：读源切到 SQL 权威库（`SqlSummaryRepository`，含
    // legacy_aggregate 深历史按日合并）——`Cmd::DataReconcile` 的
    // `JsonSummaryRepository` 保持不动，它对账的就是旧 index 投影 vs DTO，
    // 换读源等于把对账基准也换了。
    if let Some(Cmd::Data { action }) = &args.cmd {
        let repo: Box<dyn agent_vitals_data::repository::SummaryRepository> = Box::new(
            agent_vitals_runtime::summary::SqlSummaryRepository::new(),
        );
        match action {
            DataAction::Coverage { month, json } => {
                let m = month
                    .clone()
                    .unwrap_or_else(agent_vitals_runtime::clock::current_month_beijing);
                let summary = repo.monthly_summary(
                    &agent_vitals_data::repository::MonthlySummaryQuery { month: m },
                );
                if *json {
                    println!(
                        "{}",
                        serde_json::to_string_pretty(&summary.to_json()).unwrap_or_default()
                    );
                } else {
                    print_monthly_summary_text(&summary);
                }
            }
            DataAction::Daily { date, json } => {
                let summary = repo.daily_summary(
                    &agent_vitals_data::repository::DailySummaryQuery { date: date.clone() },
                );
                if *json {
                    println!(
                        "{}",
                        serde_json::to_string_pretty(&summary.to_json()).unwrap_or_default()
                    );
                } else {
                    print_daily_summary_text(&summary);
                }
            }
        }
        return;
    }

    // `agent-vitals` 无参数等价于 `doctor`。判据是有没有给 --json，理由见 Cmd。
    if args.cmd.is_none() && args.json.is_none() {
        std::process::exit(run_doctor(&doc, &args, skills::doctor::DEFAULT_OVERLAP_MIN,
                                      auto_snapshot, baseline.as_deref()));
    }

    if let Some(Cmd::Snapshot { keep }) = &args.cmd {
        let (text, rc) = agent_vitals_runtime::skills::snapshot::render_snapshot(&doc, &agent_vitals_runtime::skills::snapshot::SnapshotOpts {
            keep: *keep,
            redacted: args.redact || args.redact_names,
        });
        if rc == 0 { print!("{}", text); } else { eprint!("{}", text); }
        std::process::exit(rc);
    }

    if let Some(Cmd::Diff { rows_json, .. }) = &args.cmd {
        if let Some(path) = rows_json {
            match doc.get("diff_vs_baseline") {
                None => {
                    eprintln!("No snapshot is available for comparison.");
                    std::process::exit(1);
                }
                Some(d) => {
                    if std::fs::write(path, serde_json::to_string_pretty(d).unwrap_or_default()).is_err() {
                        eprintln!("failed to write {}", path.display());
                        std::process::exit(2);
                    }
                    println!("Wrote {}", path.display());
                    return;
                }
            }
        }
        let gate = doc.pointer("/trigger_data/zombie_min_age_days")
            .and_then(|v| v.as_i64())
            .unwrap_or(args.zombie_age);
        let (text, to_stderr, rc) = agent_vitals_runtime::skills::snapshot::render_diff(&doc, gate);
        if to_stderr { eprint!("{}", text); } else { print!("{}", text); }
        std::process::exit(rc);
    }

    if let Some(Cmd::Doctor { min, rows_json }) = &args.cmd {
        if let Some(path) = rows_json {
            let ds = skills::doctor::diagnose(&doc, args.split_threshold, *min);
            let n = ds.len();
            let payload = serde_json::json!({
                "schema_version": doc.get("schema_version"),
                "run": util::run_id(&doc),
                "host_selection": doc.get("host_selection"),
                "diagnostics": ds,
                "not_assessed": skills::doctor::NOT_ASSESSED.iter()
                    .map(|(c, n, w)| serde_json::json!({"code": c, "name": n, "reason": w}))
                    .collect::<Vec<_>>(),
            });
            if std::fs::write(path, serde_json::to_string_pretty(&payload).unwrap_or_default()).is_err() {
                eprintln!("failed to write {}", path.display());
                std::process::exit(2);
            }
            println!("Wrote {}: {} diagnostics", path.display(), n);
            return;
        }
        std::process::exit(run_doctor(&doc, &args, *min, auto_snapshot,
                                      baseline.as_deref()));
    }

    if let Some(Cmd::Plan { startup_rate, rows_json }) = &args.cmd {
        // 纯派生：build_plan 只读已扫好的 doc，不触发 auto_snapshot（plan 是
        // 报告的一个视图，不是一次新扫描）。
        let payload = agent::plan::build_plan(&doc, *startup_rate);
        if let Some(path) = rows_json {
            let text = serde_json::to_string_pretty(&payload).unwrap_or_default();
            if path == &PathBuf::from("-") {
                println!("{text}");
            } else if std::fs::write(path, &text).is_err() {
                eprintln!("failed to write {}", path.display());
                std::process::exit(2);
            } else {
                let n = payload["summary"]["item_count"].as_i64().unwrap_or(0);
                println!("Wrote {}: {} items", path.display(), n);
            }
            return;
        }
        print!("{}", render_plan(&payload));
        return;
    }

    if let Some(Cmd::Explain { name, min, rows_json }) = &args.cmd {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs_f64())
            .unwrap_or(0.0);
        let o = skills::explain::ExplainOpts { name: name.clone(), min: *min, now };
        match skills::explain::render_explain(&doc, &o, rows_json.is_some()) {
            // 找不到那个名字要以非零退出：脚本调用方靠退出码判断，打印一行
            // 「没找到」然后返回 0 会被当成「查过了，没问题」。
            skills::explain::ExplainOut::NotFound(msg) => {
                eprint!("{}", msg);
                std::process::exit(1);
            }
            skills::explain::ExplainOut::Json(payload, n) => {
                let path = rows_json.as_ref().expect("Json branch implies rows_json is present");
                if std::fs::write(path, serde_json::to_string_pretty(&payload).unwrap_or_default()).is_err() {
                    eprintln!("failed to write {}", path.display());
                    std::process::exit(2);
                }
                println!("Wrote {}: {} copies", path.display(), n);
            }
            skills::explain::ExplainOut::Text(t) => print!("{}", t),
        }
        return;
    }

    if let Some(Cmd::List { unused, shadowed, stale, sort, top, rows_json }) = &args.cmd {
        if let Some(path) = rows_json {
            let rows = skills::render::list_rows(&doc, &skills::render::ListOpts {
                unused: *unused, shadowed: *shadowed, stale: *stale,
                sort: sort.clone(), top: *top,
            });
            let n = rows.as_array().map(|a| a.len()).unwrap_or(0);
            if std::fs::write(path, serde_json::to_string_pretty(&rows).unwrap_or_default()).is_err() {
                eprintln!("failed to write {}", path.display());
                std::process::exit(2);
            }
            println!("Wrote {}: {} rows", path.display(), n);
            return;
        }
        print!("{}", skills::render::render_list(&doc, &skills::render::ListOpts {
            unused: *unused,
            shadowed: *shadowed,
            stale: *stale,
            sort: sort.clone(),
            top: *top,
        }));
        return;
    }

    if let Some(Cmd::Overlap { min, top, rows_json }) = &args.cmd {
        let o = agent_vitals_domain::skills::overlap::OverlapOpts { min: *min, top: *top };
        if let Some(path) = rows_json {
            let rows = agent_vitals_domain::skills::overlap::overlap_pairs(&doc, &o);
            let n = rows.as_array().map(|a| a.len()).unwrap_or(0);
            if std::fs::write(path, serde_json::to_string_pretty(&rows).unwrap_or_default()).is_err() {
                eprintln!("failed to write {}", path.display());
                std::process::exit(2);
            }
            println!("Wrote {}: {} pairs", path.display(), n);
            return;
        }
        print!("{}", agent_vitals_domain::skills::overlap::render_overlap(&doc, &o));
        return;
    }

    // Python: json.dumps(out, ensure_ascii=False, indent=2)
    let text = serde_json::to_string_pretty(&doc).unwrap_or_default();

    // 预算不可用时**不能打印数字** —— 之前这里照着 `{}%` 的模板打，
    // 多宿主下打出了 `描述预算 None%`：Python 的内部表示漏到了中文界面上，
    // 而且它读起来像「用了 None 那么多」，而不是「这个口径不适用」。
    let bd = doc.get("description_budget");
    let budget_available = bd
        .and_then(|b| b.get("available"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let budget_text = if budget_available {
        format!(
            "{}% ({})",
            bd.and_then(|b| b.get("pct_used")).cloned().unwrap_or(Value::Null),
            bd.and_then(|b| b.get("scope")).and_then(|v| v.as_str()).unwrap_or("")
        )
    } else if args.host == "openclaw" {
        "configurable (not set for this instance)".to_string()
    } else {
        "unavailable".to_string()
    };

    let summary_counts = SummaryCounts {
        disk: rep.disk,
        loaded: rep.loaded,
        tier1_total: rep.tier1_total,
        budget_text,
        trigger_available: rep.trigger_available,
        host: args.host.clone(),
        oversized: rep.oversized,
        flagged: rep.flagged,
        all_cited: rep.all_cited,
    };

    match &args.json {
        // 原来的裸调用行为（JSON 打到 stdout）改用 `--json -`
        Some(path) if path.as_os_str() == "-" => println!("{}", text),
        Some(path) => {
            if let Err(e) = std::fs::write(path, &text) {
                eprintln!("failed to write {}: {}", path.display(), e);
                std::process::exit(2);
            }
            println!("{}", summary_counts.render(&path.to_string_lossy()));
        }
        None => unreachable!("no --json: the doctor branch above should have handled this"),
    }

    if !inv.unreadable.is_empty() {
        // 也写一份到 stderr：JSON 里那条字段只有解析输出的人会看到，
        // 而直接在终端跑的人同样需要知道清点数字是不完整的。
        eprintln!(
            "\nWarning: {} SKILL.md files could not be read and were excluded (see unreadable_skills):",
            inv.unreadable.len()
        );
        for u in inv.unreadable.iter().take(10) {
            eprintln!("  {}", s(u, "path"));
        }
    }
    if inv.skills.is_empty() {
        eprintln!("\nNo skills were found. Use --path to specify an installation directory.");
    }
}

struct SummaryCounts {
    disk: usize,
    loaded: usize,
    tier1_total: i64,
    budget_text: String,
    trigger_available: bool,
    host: String,
    oversized: usize,
    flagged: usize,
    all_cited: usize,
}

impl SummaryCounts {
    fn render(&self, path: &str) -> String {
        // OpenClaw 的「已加载」需要运行时证实，措辞必须换一套 ——
        // 在那里说「已加载 N 个」会把「记录数」说成「确定在上下文里」。
        let active = if self.host == "openclaw" {
            format!("{} runtime-visible records", self.loaded)
        } else {
            format!("{} loaded", self.loaded)
        };
        format!(
            "Wrote {}: {} skills on disk, {}, approximately {} Tier1 tokens, \
description budget {}, trigger data {}, {} split candidates, {} security findings \
({} contain only citation-like matches and still require review)",
            path,
            self.disk,
            active,
            self.tier1_total,
            self.budget_text,
            if self.trigger_available { "available" } else { "unavailable" },
            self.oversized,
            self.flagged,
            self.all_cited,
        )
    }
}

#[cfg(test)]
mod codex_sql_tests {
    use super::*;

    fn fresh_dir(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("av-codex-sql-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// codex 按量事实一笔（gpt-5.6-sol，价目表里有价）。`ts_ms` 决定北京小时桶。
    fn seed_codex_fact(db: &agent_vitals_data::authority::AuthorityDb, id: &str, ts_ms: i64, u: i64) {
        db.conn()
            .execute(
                "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
                 VALUES ('r', 1, 'cli', 'succeeded', 1) ON CONFLICT(run_id) DO NOTHING",
                [],
            )
            .unwrap();
        db.conn()
            .execute(
                &format!(
                    "INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id,
                         source_event_id, observation_kind, provider_id, model_id, event_ts_ms,
                         event_peak, uncached_input_tokens, cache_read_tokens, cache_write_tokens,
                         output_tokens, ingested_run_id, created_at_ms, updated_at_ms)
                     VALUES ('{id}', 'codex', 'm', 's', '{id}', 'token_count', NULL,
                             'gpt-5.6-sol', {ts_ms}, 0, {u}, 200000, 50000, 80000, 'r', 1, 1)"
                ),
                [],
            )
            .unwrap();
    }

    /// `codex_merged_from_sql`（Tier B：`codex-cost` 切 SQL 权威库）：
    /// - `by_hour_model` / `by_model` 从 `usage_facts` 的 codex 行读出、经
    ///   `codex_report_from_merged` 折出正数成本；
    /// - `unaccounted` = `[]`（残差哨兵是 rollout fold 独有）、`plan` 只带
    ///   `plan_type: "plus"`（pricing.json billing_modes.openai._note 声明的
    ///   实测不变量，用于保住「(按量标价)」诚实标注，不带月费/限额）；
    /// - 库缺失 → note 非 None（CLI 打 stderr，不把空报告当「没花钱」）。
    #[test]
    fn codex_merged_from_sql_reads_facts_and_degrades_unaccounted_plan() {
        let dir = fresh_dir("degrade");

        // 空库（尚未建）→ note 提示 sync-facts；merged 兜底但 plan tag 在。
        let (empty, note) = agent_vitals_runtime::summary::codex_merged_from_sql(&dir);
        assert!(note.is_some(), "库文件不存在 → 必须给 stderr 提示");
        assert_eq!(empty["unaccounted"], json!([]));
        assert_eq!(empty["plan"]["plan_type"], "plus");

        let db = agent_vitals_data::authority::AuthorityDb::open(
            &agent_vitals_data::authority::default_authority_path(&dir),
            1,
        )
        .unwrap();
        // 1788393601000 ms = 2026-09-03T00:00:01Z → 北京 2026-09-03T08。
        seed_codex_fact(&db, "c1", 1_788_393_601_000, 800_000);
        drop(db);

        let (merged, note) = agent_vitals_runtime::summary::codex_merged_from_sql(&dir);
        assert!(note.is_none(), "库已建且可开 → 无提示");
        assert_eq!(merged["unaccounted"], json!([]));
        assert_eq!(merged["plan"]["plan_type"], "plus");
        assert!(
            merged["by_hour_model"]["2026-09-03T08"]["gpt-5.6-sol"].is_object(),
            "北京小时桶应含 seed 的模型：{}",
            merged["by_hour_model"]
        );
        // 走真实报告路径：total_cost_usd 为正、per_model 有 sol、unaccounted 空、
        // plan 透传（→ render 侧走 "(按量标价)" 标注）。
        let report = codex_report_from_merged(&merged, None, None, false);
        assert!(report["total_cost_usd"].as_f64().unwrap() > 0.0);
        assert!(report["per_model"]["gpt-5.6-sol"].is_object());
        assert_eq!(report["unaccounted_usage"], json!([]));
        assert_eq!(report["plan"]["plan_type"], "plus");
        // 订阅标注保住：render 文本含「按量标价」而非裸「total cost」。
        let text = agent_vitals_runtime::sessions::codex_cost::render_codex_cost(&report);
        assert!(text.contains("按量标价"), "codex 订阅 → USD 总额必须标「按量标价」：{text}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// **`Some(filter_key)` 分支覆盖**（删掉的 `test_codex_cost_month_filter_
    /// reconciles` 的 Rust-only 替身）：seed 跨两个北京月的 codex 事实，
    /// `codex_report_from_merged` 按月过滤后——
    /// - `per_model` 非空、`total_cost_usd > 0`（月过滤不得把报告静默清零，
    ///   这是真实 shipped defect 的回归）；
    /// - 守恒：`sum(days.cost_usd) == total_cost_usd`（过滤后 by_model 由
    ///   `codex_by_model_from_hours` 从过滤后小时重算，days 与 per_model 对得上）；
    /// - 过滤后 total < 全窗 total（另一个月的事实确实被排掉了）。
    #[test]
    fn codex_report_month_filter_reconciles_and_does_not_zero() {
        let dir = fresh_dir("monthfilter");
        let db = agent_vitals_data::authority::AuthorityDb::open(
            &agent_vitals_data::authority::default_authority_path(&dir),
            1,
        )
        .unwrap();
        // 1786881600000 ms → 北京 2026-08-16T20；1788393601000 → 北京 2026-09-03T08。
        seed_codex_fact(&db, "aug", 1_786_881_600_000, 500_000);
        seed_codex_fact(&db, "sep", 1_788_393_601_000, 900_000);
        drop(db);

        let (merged, _) = agent_vitals_runtime::summary::codex_merged_from_sql(&dir);
        let all = codex_report_from_merged(&merged, None, None, false);
        let sep = codex_report_from_merged(&merged, Some("2026-09"), Some("2026-09"), false);

        let sep_total = sep["total_cost_usd"].as_f64().unwrap();
        assert!(sep_total > 0.0, "月过滤后报告不得静默清零");
        assert!(!sep["per_model"].as_object().unwrap().is_empty());
        let sep_days_sum: f64 = sep["days"]
            .as_array()
            .unwrap()
            .iter()
            .map(|d| d["cost_usd"].as_f64().unwrap_or(0.0))
            .sum();
        assert!(
            (sep_days_sum - sep_total).abs() < 1e-9,
            "守恒：sum(days)={sep_days_sum} != total={sep_total}"
        );
        assert!(
            sep_total < all["total_cost_usd"].as_f64().unwrap(),
            "9 月窗必须比全窗小（8 月那笔被排掉）"
        );
        // 8 月的日期不得出现在 9 月过滤后的 days 里。
        for d in sep["days"].as_array().unwrap() {
            assert!(d["date"].as_str().unwrap().starts_with("2026-09"));
        }

        let _ = std::fs::remove_dir_all(&dir);
    }
}
