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

mod analysis;
mod behavior;
mod codex;
mod cost;
mod openclaw;
mod overlap;
mod diff;
mod dsh;
mod discovery;
mod doctor;
mod explain;
mod frontmatter;
mod host;
mod inventory;
mod redact;
mod render;
mod report;
mod security;
mod snapshot;
mod util;
mod workbuddy;

use std::path::PathBuf;

use clap::{Parser, Subcommand};
use serde_json::{json, Value};

use discovery::Ctx;
use util::norm;

/// 覆盖优先级**按宿主而异**，不能只用一张表。
///
/// Python 侧曾经是一张全局表，装的是 OpenClaw 的顺序却套用到每个宿主，
/// 于是 Claude Code 的 personal 与 project 被判反 —— 正是「与多数人直觉相反」
/// 的那一对。判反的后果不是少一条信息，是把诊断方向整个指错。
///
/// DSH 是第一个二维覆盖宿主（HOST_ADAPTER_CONTRACT §DSH）：先比 scope 层
/// （近层同名直接赢），层内才用 rank 裁决。前五个宿主只有一个隐式层，所以
/// `level_rank_for` 返回 `(layer, rank)`：它们的 layer 恒为 0、rank 即原标量，
/// 排序结果逐字节不变。
pub(crate) fn level_rank_for(host_family: &str, level: &str, layer: &str) -> (u16, u16) {
    if host_family == "dsh" {
        return (dsh_layer_ordinal(layer), dsh_rank(level));
    }
    (0, scalar_rank(host_family, level))
}

/// 前五个宿主 / 未知宿主的层内 rank（原标量；u8 拓宽为 u16 以统一二维键）。
fn scalar_rank(host_family: &str, level: &str) -> u16 {
    match host_family {
        // OpenClaw：workspace > project > personal > managed
        "openclaw" => match level {
            "workspace" | "enterprise" => 0,
            "project" => 1,
            "personal" => 2,
            "managed" | "plugin" => 3,
            "other-host" => 8,
            _ => 9,
        },
        // 其余（含未知宿主）按 Claude Code：enterprise > personal > project > plugin
        _ => match level {
            "enterprise" => 0,
            "personal" => 1,
            "project" => 2,
            "plugin" => 3,
            "other-host" => 8,
            _ => 9,
        },
    }
}

/// DSH 的 discovery roots（**层内** rank，越小越优先）。词表出自契约根表。
fn dsh_rank(level: &str) -> u16 {
    match level {
        "project-dsh" => 100,
        "project-agents" => 200,
        "custom" => 300,
        "user-dsh" => 400,
        "user-agents" => 500,
        "bundled" => 600,
        _ => 999,
    }
}

/// DSH 的 scope 层序，**近层在前**。具体 scope 链名由 DSH 适配器接入时对齐；
/// 未列出的层算最远，保证已知的近层总是赢。
const DSH_LAYER_ORDER: &[&str] = &[];
const DSH_LAYER_FAR: u16 = 99;

fn dsh_layer_ordinal(layer: &str) -> u16 {
    DSH_LAYER_ORDER
        .iter()
        .position(|x| *x == layer)
        .map(|i| i as u16)
        .unwrap_or(DSH_LAYER_FAR)
}

/// 从记录里取覆盖层名。前五个宿主只有一个隐式层（返回 ""）。
/// DSH 的层写在 conflict_domain 第三段（A5：`dsh:<DSH_HOME>:<layer>`）。
pub(crate) fn layer_of(v: &Value) -> &str {
    let family = v
        .get("host_family")
        .and_then(|x| x.as_str())
        .or_else(|| v.get("host").and_then(|x| x.as_str()))
        .unwrap_or("");
    if family != "dsh" {
        return "";
    }
    let domain = v.get("conflict_domain").and_then(|x| x.as_str()).unwrap_or("");
    // 取最后一个 ":" 之后的段作层名，容忍 DSH_HOME 里出现冒号（如 Windows 盘符）。
    domain
        .strip_prefix("dsh:")
        .and_then(|rest| rest.rsplit(':').next())
        .unwrap_or("")
}

pub(crate) fn level_rank(v: &Value) -> (u16, u16) {
    let family = v
        .get("host_family")
        .and_then(|x| x.as_str())
        .or_else(|| v.get("host").and_then(|x| x.as_str()))
        .unwrap_or("");
    let level = v.get("level").and_then(|x| x.as_str()).unwrap_or("");
    let layer = layer_of(v);
    level_rank_for(family, level, layer)
}

/// Codex 没有可配置的预算旋钮，用实测得到的回退值。
pub(crate) const CODEX_FALLBACK_DESC_BUDGET: i64 = 8000;

pub(crate) fn severity_rank(s: &str) -> u8 {
    match s {
        "critical" => 0,
        "high" => 1,
        "medium" => 2,
        _ => 3,
    }
}

pub(crate) fn conflict_rank(s: &str) -> u8 {
    match s {
        "high" => 0,
        "medium" => 1,
        _ => 2,
    }
}

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
#[command(name = "skill-vitals", version, about = "Agent Skills health-check scanner",
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
/// `skill-vitals` with no arguments is equivalent to `doctor` (PRODUCT §5): the
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
        #[arg(long, default_value_t = doctor::DEFAULT_OVERLAP_MIN)]
        min: f64,
        /// Write diagnostic JSON instead of a report
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
    },
    /// Save a snapshot to ~/.skill-vitals/snapshots
    Snapshot {
        /// Retain the newest N snapshots; default: 30; 0 means unlimited
        #[arg(long, default_value_t = snapshot::SNAPSHOT_KEEP, value_parser = non_negative)]
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
        #[arg(long, default_value_t = doctor::DEFAULT_OVERLAP_MIN)]
        min: f64,
        /// Write JSON instead of a report
        #[arg(long = "json")]
        rows_json: Option<PathBuf>,
    },
    /// Lexical filter for skills that may compete for similar requests
    Overlap {
        /// Jaccard threshold; default: 0.25
        #[arg(long, default_value_t = doctor::DEFAULT_OVERLAP_MIN)]
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
}

/// 探测「扫描器自身所在的 skill 目录」。
///
/// Python 版靠 `__file__` 就能定位自己；二进制形态下这条线断了 ——
/// 二进制装在 npm / cargo 的 bin 目录里，和 skill 目录没有任何关系。
///
/// **不能按内容判断**（比如认 `name: skill-vitals`）：那样任何 skill 改个名字
/// 就能让自己免于安全扫描。按**安装位置**判断才不可伪造 —— 只有当二进制确实
/// 被放在某个 skill 目录里面时（`<skill>/bin/skill-vitals` 这种形态），
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
    print!("{}", doctor::render_doctor(doc, &doctor::DoctorOpts {
        split_threshold: args.split_threshold,
        min,
        version: env!("CARGO_PKG_VERSION"),
    }));
    let ds = doctor::diagnose(doc, args.split_threshold, min);

    let mut base_ds: Option<Vec<Value>> = None;
    if args.new_only {
        let path = match baseline {
            None => {
                eprintln!("--new-only needs a baseline: run `skill-vitals snapshot` first, \
or specify one with --baseline.");
                return doctor::EXIT_TOOL_ERROR;
            }
            Some(p) => p,
        };
        let prev: Value = match util::read_lossy(path)
            .and_then(|t| serde_json::from_str(&t).ok())
        {
            None => {
                eprintln!("--new-only could not read baseline {}", path.display());
                return doctor::EXIT_TOOL_ERROR;
            }
            Some(v) => v,
        };
        // **在基线文档上重跑同一个 diagnose。**它是纯函数，这一步不需要任何
        // 额外的「历史诊断」存储，也就不会与快照的内容脱节。
        base_ds = Some(doctor::diagnose(&prev, args.split_threshold, min));
    }

    let ignore: Vec<String> = args.ignore.split(',')
        .map(|x| x.trim().to_uppercase())
        .filter(|x| !x.is_empty())
        .collect();
    let (text, rc) = doctor::render_gate(
        &ds, &doctor::GateOpts { fail_on: args.fail_on.clone(), ignore },
        base_ds.as_deref());
    print!("{}", text);
    print!("{}", snapshot::doctor_snapshot(doc, auto_snapshot));
    rc
}

pub(crate) fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}
pub(crate) fn i(v: &Value, k: &str) -> i64 {
    v.get(k).and_then(|x| x.as_i64()).unwrap_or(0)
}
pub(crate) fn f(v: &Value, k: &str) -> f64 {
    v.get(k).and_then(|x| x.as_f64()).unwrap_or(0.0)
}
pub(crate) fn b(v: &Value, k: &str) -> bool {
    v.get(k).and_then(|x| x.as_bool()).unwrap_or(false)
}
pub(crate) fn chars(v: &Value, k: &str) -> usize {
    v.get(k).and_then(|x| x.as_str()).map_or(0, |x| x.chars().count())
}

fn main() {
    let args = Args::parse();

    // 行为审计：审计一份 DSH 会话日志的执行轨迹，**不跑 skill 扫描**。
    // 独立取证命令（读会话日志 → 规则引擎 → findings），在扫描之前短路。
    if let Some(Cmd::Behavior { session_log, rows_json }) = &args.cmd {
        let Some(audit) = behavior::audit_session_log(session_log) else {
            eprintln!("session log unavailable: unreadable, malformed, or schema mismatch");
            std::process::exit(2);
        };
        let findings = &audit.findings;
        if let Some(path) = rows_json {
            // `--json` 输出十二个键（这行注释原来写"九个"，早就跟实际字段数
            // 脱节了——subagents/skill/duration 陆续加进来时没人回头改这一句，
            // 这次顺手改成准确的数字，不然它只会继续误导下一个读它的人）。
            // 三份用量数据是同一批事件的三种分辨率，
            // 不是重复：usage 按模型汇总（成本），requests 保留逐请求时间序列
            // （上下文占用曲线的数据源），context 是常驻前缀的分类估算。
            //
            // requests[].context_tokens 是 provider 计数，context.* 是 est_tokens
            // 估算——**两者不同估算器，不能相减后当作精确分类**（详见 core 的
            // context_composition 文档注释）。
            //
            // cost 不是 audit 六键之一——它读的是 audit.usage × pricing.json，
            // 是 usage 上的一次派生计算，不是 behavior_session_log 的一部分
            // （cost.rs 顶部注释：纯展示层）。之前只有人读的 cost_block 文本，
            // 想要这份数字得手写脚本重新调 _price/load_pricing；现在 cost_report
            // 是 cost_block 和这里唯一的算价格的地方，两处不会算出两个数。
            let pricing = cost::load_pricing();
            let cost = cost::cost_report(&audit.usage, &pricing);
            // pre_fork 与 usage 是同一个形状（token_by_model 的输出），所以
            // 定价走同一个 cost_report——**不是**在这里另写一套算法。
            // usage→cost 与 pre_fork→pre_fork_cost 两条路对称：main.rs 就是
            // CLI 的展示层，它给 usage 定价本来就是合法的（cost.rs 顶部注释：
            // core 只给 token，定价在展示层），给 pre_fork 定价是补上同一处
            // 遗漏的对称性，不是破例。
            //
            // 没分叉时 pre_fork 是 null → pre_fork_cost 也是 null，**不是一个
            // 全零的 cost_report**：「没分叉」和「分叉了但上游没花钱」是两回事。
            let pre_fork_cost = if audit.pre_fork.is_null() {
                None
            } else {
                cost::cost_report(&audit.pre_fork, &pricing)
            };
            let text = serde_json::to_string_pretty(&json!({
                "findings": findings,
                "usage": &audit.usage,
                "requests": &audit.requests,
                "context": &audit.context,
                "compaction": &audit.compaction,
                "waste": &audit.waste,
                "cost": cost,
                "pre_fork": &audit.pre_fork,
                "pre_fork_cost": pre_fork_cost,
                "subagents": &audit.subagents,
                "skill": &audit.skill,
                "duration": &audit.duration,
                "rule_outcomes": &audit.rule_outcomes,
            })).unwrap_or_default();
            if path == &PathBuf::from("-") {
                println!("{text}");
            } else if std::fs::write(path, &text).is_err() {
                eprintln!("failed to write {}", path.display());
                std::process::exit(2);
            } else {
                println!("Wrote {}: {} findings", path.display(), findings.len());
            }
            return;
        }
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
        let pricing = cost::load_pricing();
        let block = cost::cost_block(&audit.usage, &pricing);
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
        std::process::exit(behavior::behavior_gate(findings, &args.fail_on, &args.ignore));
    }

    // T11：Skill 执行审计——从会话日志抽取 skill-invocation / tool/call(name=skill) 事件，
    // 输出调用记录（触发方式/加载状态/耗时/位置）。与 behavior 不同：这是 skill 专用，
    // 只出 skill 相关的 invocations 结构，不带 SV601–614 findings。
    if let Some(Cmd::SkillAudit { session_log, rows_json }) = &args.cmd {
        let Some(audit) = behavior::audit_session_log(session_log) else {
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
        let Some(audit) = behavior::audit_session_log(session_log) else {
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

    let cfg = host::read_host_config(&home_n);

    let inv = inventory::take(
        &inventory::Selection {
            host: &args.host,
            extra_paths: &args.path,
            runtime_json: args.runtime_json.as_deref(),
        },
        &home_n, &cfg, &ctx);

    // 采集到此为止；下面全是纯数据变换，交给 report。
    let rep = report::build(&report::ReportInput {
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
            Some(Cmd::Diff { file, .. }) => file.clone().or_else(snapshot::latest_snapshot),
            // --new-only 也要找基线。**不能只挂在 auto_snapshot 上** ——
            // `--no-snapshot` 的语义是「别写」，不是「别比」。
            _ if auto_snapshot || args.new_only => snapshot::latest_snapshot(),
            _ => None,
        }
    });
    if let Some(b) = &baseline {
        // 先算完再插入：diff 要读 doc 的内容，不能在可变借用期间读
        let d = diff::diff_against(b, &doc);
        doc.as_object_mut()
            .unwrap()
            .insert("diff_vs_baseline".into(), d);
    }

    if args.redact || args.redact_names {
        doc = redact::redact(&doc, args.redact_names, &home_n, &cwd_n);
        doc.as_object_mut().unwrap().insert(
            "redacted".into(),
            json!({
                "paths": true,
                "names": args.redact_names,
                "note": "This output is redacted for sharing. Run a new scan to obtain the original data.",
            }),
        );
    }

    // `skill-vitals` 无参数等价于 `doctor`。判据是有没有给 --json，理由见 Cmd。
    if args.cmd.is_none() && args.json.is_none() {
        std::process::exit(run_doctor(&doc, &args, doctor::DEFAULT_OVERLAP_MIN,
                                      auto_snapshot, baseline.as_deref()));
    }

    if let Some(Cmd::Snapshot { keep }) = &args.cmd {
        let (text, rc) = snapshot::render_snapshot(&doc, &snapshot::SnapshotOpts {
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
        let (text, to_stderr, rc) = snapshot::render_diff(&doc, gate);
        if to_stderr { eprint!("{}", text); } else { print!("{}", text); }
        std::process::exit(rc);
    }

    if let Some(Cmd::Doctor { min, rows_json }) = &args.cmd {
        if let Some(path) = rows_json {
            let ds = doctor::diagnose(&doc, args.split_threshold, *min);
            let n = ds.len();
            let payload = serde_json::json!({
                "schema_version": doc.get("schema_version"),
                "run": util::run_id(&doc),
                "host_selection": doc.get("host_selection"),
                "diagnostics": ds,
                "not_assessed": doctor::NOT_ASSESSED.iter()
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

    if let Some(Cmd::Explain { name, min, rows_json }) = &args.cmd {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs_f64())
            .unwrap_or(0.0);
        let o = explain::ExplainOpts { name: name.clone(), min: *min, now };
        match explain::render_explain(&doc, &o, rows_json.is_some()) {
            // 找不到那个名字要以非零退出：脚本调用方靠退出码判断，打印一行
            // 「没找到」然后返回 0 会被当成「查过了，没问题」。
            explain::ExplainOut::NotFound(msg) => {
                eprint!("{}", msg);
                std::process::exit(1);
            }
            explain::ExplainOut::Json(payload, n) => {
                let path = rows_json.as_ref().expect("Json branch implies rows_json is present");
                if std::fs::write(path, serde_json::to_string_pretty(&payload).unwrap_or_default()).is_err() {
                    eprintln!("failed to write {}", path.display());
                    std::process::exit(2);
                }
                println!("Wrote {}: {} copies", path.display(), n);
            }
            explain::ExplainOut::Text(t) => print!("{}", t),
        }
        return;
    }

    if let Some(Cmd::List { unused, shadowed, stale, sort, top, rows_json }) = &args.cmd {
        if let Some(path) = rows_json {
            let rows = render::list_rows(&doc, &render::ListOpts {
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
        print!("{}", render::render_list(&doc, &render::ListOpts {
            unused: *unused,
            shadowed: *shadowed,
            stale: *stale,
            sort: sort.clone(),
            top: *top,
        }));
        return;
    }

    if let Some(Cmd::Overlap { min, top, rows_json }) = &args.cmd {
        let o = overlap::OverlapOpts { min: *min, top: *top };
        if let Some(path) = rows_json {
            let rows = overlap::overlap_pairs(&doc, &o);
            let n = rows.as_array().map(|a| a.len()).unwrap_or(0);
            if std::fs::write(path, serde_json::to_string_pretty(&rows).unwrap_or_default()).is_err() {
                eprintln!("failed to write {}", path.display());
                std::process::exit(2);
            }
            println!("Wrote {}: {} pairs", path.display(), n);
            return;
        }
        print!("{}", overlap::render_overlap(&doc, &o));
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
