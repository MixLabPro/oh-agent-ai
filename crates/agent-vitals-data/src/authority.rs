//! v0.9.1（SQL Authority Migration，spec §3/§7 Phase 1）：**SQLite 单一运行时
//! 权威库**——`<data_home>/agent-vitals.sqlite3`。
//!
//! 与旧 `store`（index.sqlite3）的本质区别（spec §1.1 不可变决策）：
//! - 本库是**运行时权威数据源**，不是可重建投影；「删库 → 从 JSONL 重建」
//!   不再是正常恢复方式。损坏 → 如实报错，恢复 = 用户备份 + 宿主原始日志
//!   重放（§7 Phase 1），恢复不了就报 coverage 缺口，绝不静默回落另一本账。
//! - `facts/*.jsonl` 降级为迁移/导出输入；宿主日志是不可信输入，必须经
//!   清洗校验才能进 `usage_facts`。
//! - 所有写入走 `BEGIN IMMEDIATE` 事务 + `sync_runs` 记录；running 批次在
//!   下次 open 时标 interrupted（§3.1）。
//!
//! **时钟纪律**：本 crate 不读时钟（dependency_budget 禁 chrono/time，且
//! 「事实自带事件时间」的同款纪律）——所有 `*_at_ms` 由调用方（runtime）
//! 注入。规格的 `CHECK`/`UNIQUE`/部分索引逐条照搬 spec §3，DDL 是 spec 的
//! 镜像，改动必须两处同步 + 递增 [`SCHEMA_VERSION`]。
//!
//! Phase 1 范围：DDL + migration runner + 事务帮助器 + sync_runs。写入端
//! （SQL writer）与查询端（SqlSummaryRepository）是 Phase 2/3。

use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags, OptionalExtension};

use agent_vitals_domain::billing::{BillingTemplateKind, PricingSource};

use crate::safe_query::authority_callback;

/// 当前 DDL 版本。spec §3 的表结构变更递增；`migrations` 表（§3.5）记录的
/// 是**数据迁移**（legacy import 等），与 DDL 版本刻意分开。
///
/// v2（`host_runtime_snapshots`）走 `MIGRATE_V1_TO_V2` 升级。增量 7.5 的 4 个
/// 脱敏只读 view（`v_facts_safe` / …）是**版本无关**的只读加法：`VIEWS_V1`
/// 在每次 open 用 `CREATE VIEW IF NOT EXISTS` 幂等重建，不占版本号。
pub const SCHEMA_VERSION: i64 = 14;

/// 权威库默认路径：`<data_home>/agent-vitals.sqlite3`（spec §3）。
/// 与旧 `index.sqlite3` 并存至 Phase 1 迁移框架完成导入后退役。
pub fn default_authority_path(data_home: &Path) -> PathBuf {
    data_home.join("agent-vitals.sqlite3")
}

/// `host_bills_for_period` 的一行：`(host, provider_id, billing_basis,
/// amount_minor, currency)`。`amount_minor` 是最小货币单位整数——金额从不
/// 以浮点入库（spec §5.3），折算在展示层。
pub type HostBillRow = (String, String, String, i64, String);
pub type HostBillDetailRow = (String, String, String, String, i64, String, String);

/// 用户计费声明的一行：关系本身和付款/账单分开建模。金额可未知，不能以
/// `host_bills` 的实付金额或公开价卡来填充。
pub type BillingDeclarationRow = (
    String, String, String, String, Option<String>, Option<i64>, Option<String>,
    String, Option<String>, Option<String>,
);
/// 声明修订的稳定读取行。修订为追加记录，绝不覆盖先前用户输入。
pub type BillingDeclarationRevisionRow = (
    String,
    String,
    i64,
    String,
    Option<String>,
    String,
    String,
    String,
    Option<String>,
    Option<i64>,
    Option<String>,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    i64,
);
/// 修订的一项可选作用范围：`account`、`route`、`model` 或 `session`。
pub type BillingDeclarationScopeRow = (String, String, String);
pub type BillingRecalculationJobRow = (
    String, String, String, String, i64, Option<i64>, Option<i64>, Option<String>, Option<String>,
);
pub type BillingRecalculationResultRow = (String, String, i64, i64, i64, Option<i64>, Option<i64>, i64);
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BillingDeclarationImpactPreview {
    pub fact_count: i64,
    pub session_count: i64,
    pub total_tokens: i64,
    pub first_event_ts_ms: Option<i64>,
    pub last_event_ts_ms: Option<i64>,
    /// 命中范围内 `evidence_basis = 'conflict'` 的事实：用户声明不得吞掉已知相反
    /// 证据（执行计划 E207），它们既不归因也不算「移出」，预览单列为「仍待确认」。
    pub conflict_fact_count: i64,
    pub conflict_tokens: i64,
}

pub const BILLING_DECLARATION_FACT_FROM: &str =
    "FROM usage_facts f LEFT JOIN route_evidence r ON r.evidence_id = f.route_evidence_id";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConflictEvidence {
    /// 正常选择：排除 `conflict` 证据的事实。
    Exclude,
    /// 只选 `conflict` 证据的事实（预览的「仍待确认」桶）。
    Only,
}

/// Normalize a declaration boundary to an inclusive Beijing calendar date.
/// Existing Beta rows may contain `YYYY-MM`; keep reading them as the first or
/// last day of that month while new UI writes use `YYYY-MM-DD`.
pub fn billing_boundary_date(value: &str, end: bool) -> Option<String> {
    let bytes = value.as_bytes();
    let valid_digits = |mut range: std::ops::Range<usize>| {
        range.all(|index| bytes.get(index).is_some_and(|byte| byte.is_ascii_digit()))
    };
    if value.len() == 10 && bytes.get(4) == Some(&b'-') && bytes.get(7) == Some(&b'-')
        && valid_digits(0..4) && valid_digits(5..7) && valid_digits(8..10)
    {
        let month = value[5..7].parse::<u32>().ok()?;
        let day = value[8..10].parse::<u32>().ok()?;
        let year = value[0..4].parse::<i32>().ok()?;
        let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
        let days = match month {
            1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
            4 | 6 | 9 | 11 => 30,
            2 if leap => 29,
            2 => 28,
            _ => return None,
        };
        return (day >= 1 && day <= days).then(|| value.to_owned());
    }
    if value.len() != 7 || bytes.get(4) != Some(&b'-') || !valid_digits(0..4) || !valid_digits(5..7) {
        return None;
    }
    let month = value[5..7].parse::<u32>().ok()?;
    let year = value[0..4].parse::<i32>().ok()?;
    if !(1..=12).contains(&month) { return None; }
    if !end { return Some(format!("{value}-01")); }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let day = match month {
        2 if leap => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    Some(format!("{value}-{day:02}"))
}

pub fn valid_billing_boundary(value: &str) -> bool {
    billing_boundary_date(value, false).is_some()
}

/// `(fact_count, session_count, total_tokens, first_event_ts_ms, last_event_ts_ms)`。
type PreviewAggregate = (i64, i64, i64, Option<i64>, Option<i64>);

pub struct BillingDeclarationFactSelection {
    pub where_sql: String,
    pub params: Vec<rusqlite::types::Value>,
}

/// 声明命中事实的**唯一**选择谓词。预览、重算归因与运行时计价三处都从这里拿
/// `WHERE`，所以「预览说会移出的」与「重算真正归因的」不可能是两个集合。
///
/// 规则：宿主/provider 相等；事实有时间戳且落在 `effective_start..=effective_end`
/// 的北京时间自然日内；旧月份边界兼容展开为该月首日/末日。宿主自报
/// `billing_mode='subscription'` 的事实不参与（它们本来
/// 就不按量）；已被其他 saved 声明覆盖的事实不重复移出；作用域按 kind 取交集、
/// 同 kind 取并集；`window` 只用于展示口径的额外时间窗。
pub fn billing_declaration_fact_selection(
    host: &str, provider_id: &str, effective_start: &str, effective_end: Option<&str>,
    scopes: &[(&str, &str)], window: Option<(i64, i64)>, conflicts: ConflictEvidence,
) -> BillingDeclarationFactSelection {
    use rusqlite::types::Value;
    let start_date = billing_boundary_date(effective_start, false)
        .unwrap_or_else(|| effective_start.to_owned());
    let end_date = effective_end.and_then(|end| billing_boundary_date(end, true));
    let mut params: Vec<Value> = vec![
        Value::Text(host.to_owned()), Value::Text(provider_id.to_owned()),
        Value::Text(start_date),
        end_date.map_or(Value::Null, Value::Text),
    ];
    // 「服务商未知」的组：事实的 provider_id 为 NULL，用户在声明里补的
    // `provider_id` 是他给出的答案，不是事实上已有的值。作用域
    // `("provider", "unresolved")` 把匹配条件从 `= ?2` 换成 `IS NULL`，
    // 声明本身仍记录用户选的服务商（计费主链规格 v1.2 §5.3a）。
    let provider_unresolved = scopes.iter()
        .any(|(kind, value)| *kind == "provider" && *value == "unresolved");
    let mut where_sql = String::from(if provider_unresolved {
        "f.deleted_at_ms IS NULL AND f.host = ?1 AND f.provider_id IS NULL AND ?2 IS NOT NULL
           AND f.event_ts_ms IS NOT NULL"
    } else {
        "f.deleted_at_ms IS NULL AND f.host = ?1 AND f.provider_id = ?2
           AND f.event_ts_ms IS NOT NULL"
    });
    where_sql.push_str("
           AND strftime('%Y-%m-%d', f.event_ts_ms / 1000, 'unixepoch', '+8 hours') >= ?3
           AND (?4 IS NULL OR strftime('%Y-%m-%d', f.event_ts_ms / 1000, 'unixepoch', '+8 hours') <= ?4)
           AND COALESCE(f.billing_mode, 'unknown') != 'subscription'
           AND NOT EXISTS (SELECT 1 FROM billing_fact_attributions ba
               JOIN billing_declaration_revisions br ON br.revision_id = ba.revision_id
               WHERE ba.fact_id = f.fact_id AND ba.attribution_kind = 'subscription_covered'
                 AND br.revision_number = (SELECT MAX(br2.revision_number)
                   FROM billing_declaration_revisions br2 WHERE br2.declaration_id = br.declaration_id)
                 AND br.change_kind = 'saved')",
    );
    where_sql.push_str(match conflicts {
        ConflictEvidence::Exclude => " AND COALESCE(f.evidence_basis, 'missing') != 'conflict'",
        ConflictEvidence::Only => " AND COALESCE(f.evidence_basis, 'missing') = 'conflict'",
    });
    if let Some((start_ms, end_ms)) = window {
        params.push(Value::Integer(start_ms));
        params.push(Value::Integer(end_ms));
        where_sql.push_str(&format!(
            " AND f.event_ts_ms >= ?{} AND f.event_ts_ms < ?{}", params.len() - 1, params.len(),
        ));
    }
    for (kind, column) in [
        ("account", "r.account_ref"), ("route", "f.route_evidence_id"),
        ("model", "f.model_id"), ("session", "f.session_key"),
    ] {
        let values = scopes.iter().filter(|(scope_kind, _)| *scope_kind == kind)
            .map(|(_, value)| *value).collect::<Vec<_>>();
        if values.is_empty() { continue; }
        let placeholders = values.iter().map(|value| {
            params.push(Value::Text((*value).to_owned()));
            format!("?{}", params.len())
        }).collect::<Vec<_>>().join(", ");
        where_sql.push_str(&format!(" AND {column} IN ({placeholders})"));
    }
    BillingDeclarationFactSelection { where_sql, params }
}
type BillingDeclarationRevisionSnapshot = (
    i64, String, String, String, Option<String>, Option<i64>, Option<String>, String,
    Option<String>, Option<String>, Option<String>,
);
/// 旧版本发现、尚未被用户确认的订阅候选：`(id, host, provider, currency,
/// amount_minor, period_start, status)`。候选不构成实际付款。
pub type BillingImportCandidateRow = (String, String, String, String, i64, String, String);

type BillingTemplateRow = (String, Option<String>, String, String, i64, Option<i64>);
type OutcomeMeasurementRow = (String, String, String, Option<i64>, Option<String>, String);

/// 权威库错误。`Corrupt` **不再自愈**——恢复路径是「用户备份 + 原始日志
/// 重放」，静默删库重建会把权威库变成可被悄悄替换的第二本账（spec §1.1.3
/// 的反面教材）。
#[derive(Debug)]
pub enum AuthorityError {
    Sqlite(rusqlite::Error),
    /// 库的 schema 版本比本二进制新——升级二进制，不降级重建。
    NewerSchema {
        found: i64,
        supported: i64,
    },
    Io(std::io::Error),
    /// `open_readonly` 专用（spec §9.3：只读取数面不建库）——文件不存在。
    /// 与 `open` 的「不存在则建库」刻意相反：只读消费者遇到缺库必须如实报
    /// 错，不能悄悄造一个空库端出 facts=0。
    MissingFile,
    /// `open_readonly` 专用——不是 SQLite 文件 / 文件损坏 / 半建库
    /// （`schema_meta` 读不出）。
    Corrupt,
    /// `open_readonly` 专用——库的 schema 版本比本二进制旧，需要产品迁移。
    /// （`open` 里这条走 `__unsupported_legacy_version__` 防御分支；只读面
    /// 单列一个 typed 变体，供错误码映射成 `schema_migration_required`。）
    OlderSchema {
        found: i64,
    },
}

impl From<rusqlite::Error> for AuthorityError {
    fn from(e: rusqlite::Error) -> Self {
        AuthorityError::Sqlite(e)
    }
}

impl From<std::io::Error> for AuthorityError {
    fn from(e: std::io::Error) -> Self {
        AuthorityError::Io(e)
    }
}

impl std::fmt::Display for AuthorityError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthorityError::Sqlite(e) => write!(f, "authority sqlite: {e}"),
            AuthorityError::NewerSchema { found, supported } => write!(
                f,
                "authority schema v{found} is newer than supported v{supported} — 升级二进制"
            ),
            AuthorityError::Io(e) => write!(f, "authority io: {e}"),
            AuthorityError::MissingFile => write!(f, "authority db file does not exist"),
            AuthorityError::Corrupt => {
                write!(f, "authority db is not readable (not a SQLite file, corrupt, or half-built)")
            }
            AuthorityError::OlderSchema { found } => write!(
                f,
                "authority schema v{found} is older than supported v{SCHEMA_VERSION} — run product migration"
            ),
        }
    }
}

/// spec §3 全量 DDL（v1）。`executescript` 一次成库；幂等性由「只在空/低版
/// 本库上执行」保证，不用 IF NOT EXISTS（有版本闸后重复执行是 bug，静默
/// 跳过反而掩盖它）。
const SCHEMA_V1: &str = r#"
CREATE TABLE schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE sync_runs (
  run_id TEXT PRIMARY KEY,
  started_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER,
  trigger TEXT NOT NULL,                 -- cli | tray | migration | repair | maintenance
  status TEXT NOT NULL,                  -- running | succeeded | failed | cancelled
  schema_version INTEGER NOT NULL,
  error_code TEXT,
  error_detail TEXT
);

CREATE TABLE source_files (
  source_id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  path_hash TEXT NOT NULL,                -- 不暴露本地路径
  native_session_id TEXT,
  size_bytes INTEGER NOT NULL,
  mtime_ns INTEGER NOT NULL,
  content_fingerprint TEXT,
  parser_version INTEGER NOT NULL,
  first_seen_at_ms INTEGER NOT NULL,
  last_seen_at_ms INTEGER NOT NULL,
  last_successful_run_id TEXT REFERENCES sync_runs(run_id),
  last_error_code TEXT,
  UNIQUE(host, path_hash)
);

CREATE TABLE sessions (
  session_key TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  native_session_id TEXT NOT NULL,
  machine_namespace TEXT NOT NULL,
  source_profile TEXT,
  started_at_ms INTEGER,
  ended_at_ms INTEGER,
  last_observed_at_ms INTEGER NOT NULL,
  deleted_at_ms INTEGER,
  UNIQUE(host, machine_namespace, native_session_id)
);

CREATE TABLE usage_facts (
  fact_id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  machine_namespace TEXT NOT NULL,
  native_session_id TEXT NOT NULL,
  session_key TEXT REFERENCES sessions(session_key),
  source_event_id TEXT NOT NULL,
  observation_kind TEXT NOT NULL,
  source_profile TEXT,
  provider_id TEXT,
  model_id TEXT,
  event_ts_ms INTEGER,
  event_peak INTEGER NOT NULL DEFAULT 0,
  uncached_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  source_id TEXT REFERENCES source_files(source_id),
  ingested_run_id TEXT NOT NULL REFERENCES sync_runs(run_id),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  deleted_at_ms INTEGER,
  CHECK (uncached_input_tokens >= 0),
  CHECK (cache_read_tokens >= 0),
  CHECK (cache_write_tokens >= 0),
  CHECK (output_tokens >= 0),
  UNIQUE(host, machine_namespace, native_session_id, source_event_id, observation_kind)
);

CREATE INDEX usage_facts_host_time
  ON usage_facts(host, event_ts_ms) WHERE deleted_at_ms IS NULL;
CREATE INDEX usage_facts_session_time
  ON usage_facts(session_key, event_ts_ms) WHERE deleted_at_ms IS NULL;
CREATE INDEX usage_facts_provider_model_time
  ON usage_facts(provider_id, model_id, event_ts_ms) WHERE deleted_at_ms IS NULL;

CREATE TABLE host_bills (
  bill_id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  billing_period TEXT NOT NULL,           -- YYYY-MM
  billing_basis TEXT NOT NULL,            -- fixed_subscription | host_billed | metered_actual
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  source_id TEXT REFERENCES source_files(source_id),
  evidence_ref TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  deleted_at_ms INTEGER,
  UNIQUE(host, provider_id, billing_period, billing_basis, evidence_ref)
);

CREATE TABLE pricing_snapshots (
  pricing_version TEXT PRIMARY KEY,
  captured_at_ms INTEGER NOT NULL,
  source_kind TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE budget_config (
  config_id INTEGER PRIMARY KEY CHECK (config_id = 1),
  monthly_cny_minor INTEGER,
  daily_cny_minor INTEGER,
  warning_ratio_bp INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE budget_snoozes (
  snooze_id INTEGER PRIMARY KEY CHECK (snooze_id = 1),
  until_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE data_quality_issues (
  issue_id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,               -- source | session | fact | month
  scope_key TEXT NOT NULL,
  code TEXT NOT NULL,
  severity TEXT NOT NULL,
  first_seen_at_ms INTEGER NOT NULL,
  last_seen_at_ms INTEGER NOT NULL,
  resolved_at_ms INTEGER,
  detail_json TEXT NOT NULL,
  UNIQUE(scope_type, scope_key, code)
);

CREATE TABLE migrations (
  migration_id TEXT PRIMARY KEY,
  started_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER,
  status TEXT NOT NULL,
  source_version TEXT NOT NULL,
  target_version TEXT NOT NULL,
  checkpoint_json TEXT NOT NULL,
  error_detail TEXT
);

CREATE TABLE workflow_events (
  event_id TEXT PRIMARY KEY,
  session_key TEXT REFERENCES sessions(session_key),
  event_ts_ms INTEGER NOT NULL,
  event_type TEXT NOT NULL,               -- task_started | task_finished | skill_invoked |
                                          -- skill_finished | tool_invoked | tool_finished |
                                          -- model_switched | approval_denied
  capability_kind TEXT,                   -- skill | tool | model
  capability_id TEXT,                     -- Skill/tool/model 的稳定标识
  capability_version TEXT,
  outcome TEXT NOT NULL,                  -- succeeded | failed | cancelled | unknown
  duration_ms INTEGER,
  error_fingerprint TEXT,                 -- 脱敏、稳定的错误分类/指纹
  invocation_fingerprint TEXT,            -- 脱敏调用指纹，用于识别重复重试
  source_id TEXT REFERENCES source_files(source_id),
  ingested_run_id TEXT NOT NULL REFERENCES sync_runs(run_id),
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX workflow_events_session_time
  ON workflow_events(session_key, event_ts_ms);
CREATE INDEX workflow_events_capability_time
  ON workflow_events(capability_kind, capability_id, event_ts_ms);
CREATE INDEX workflow_events_error_time
  ON workflow_events(error_fingerprint, event_ts_ms)
  WHERE error_fingerprint IS NOT NULL;

-- v2：非账务但面向产品展示的宿主实时状态。不能塞进 usage_facts（不是用量），
-- 也不能继续由 UI 直接读宿主日志；payload 保留来源的完整、脱敏 JSON 形状。
CREATE TABLE host_runtime_snapshots (
  host TEXT NOT NULL,
  snapshot_kind TEXT NOT NULL,            -- 目前：codex_quota
  payload_json TEXT NOT NULL,
  observed_at_ms INTEGER NOT NULL,
  source_id TEXT REFERENCES source_files(source_id),
  ingested_run_id TEXT NOT NULL REFERENCES sync_runs(run_id),
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(host, snapshot_kind)
);
"#;

const MIGRATE_V1_TO_V2: &str = r#"
CREATE TABLE host_runtime_snapshots (
  host TEXT NOT NULL,
  snapshot_kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  observed_at_ms INTEGER NOT NULL,
  source_id TEXT REFERENCES source_files(source_id),
  ingested_run_id TEXT NOT NULL REFERENCES sync_runs(run_id),
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(host, snapshot_kind)
);
"#;

const SCHEMA_V3_ADD: &str = r#"
ALTER TABLE usage_facts ADD COLUMN provider_raw TEXT;
ALTER TABLE usage_facts ADD COLUMN billing_source TEXT;
ALTER TABLE usage_facts ADD COLUMN billing_mode TEXT;
ALTER TABLE usage_facts ADD COLUMN pricing_basis TEXT;
ALTER TABLE usage_facts ADD COLUMN evidence_basis TEXT;
ALTER TABLE usage_facts ADD COLUMN normalization_version TEXT;
ALTER TABLE usage_facts ADD COLUMN route_evidence_id TEXT;
ALTER TABLE usage_facts ADD COLUMN attribution_version TEXT;

CREATE TABLE route_evidence (
  evidence_id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  machine_namespace TEXT NOT NULL,
  native_session_id TEXT,
  provider_raw TEXT,
  endpoint_host TEXT,
  account_ref TEXT,
  plan_type TEXT,
  quota_window TEXT,
  evidence_basis TEXT NOT NULL,
  observed_at_ms INTEGER,
  source_id TEXT REFERENCES source_files(source_id),
  ingested_run_id TEXT NOT NULL REFERENCES sync_runs(run_id)
);
CREATE INDEX route_evidence_session ON route_evidence(host, machine_namespace, native_session_id);
CREATE TRIGGER usage_facts_route_evidence_insert_fk
BEFORE INSERT ON usage_facts
WHEN NEW.route_evidence_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM route_evidence WHERE evidence_id = NEW.route_evidence_id)
BEGIN
  SELECT RAISE(ABORT, 'usage_facts.route_evidence_id does not reference route_evidence');
END;
CREATE TRIGGER usage_facts_route_evidence_update_fk
BEFORE UPDATE OF route_evidence_id ON usage_facts
WHEN NEW.route_evidence_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM route_evidence WHERE evidence_id = NEW.route_evidence_id)
BEGIN
  SELECT RAISE(ABORT, 'usage_facts.route_evidence_id does not reference route_evidence');
END;

CREATE TABLE issue_instances (
  issue_id TEXT PRIMARY KEY,
  machine_namespace TEXT NOT NULL,
  host TEXT NOT NULL,
  session_key TEXT,
  issue_type TEXT NOT NULL,
  instance_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL,
  severity TEXT NOT NULL,
  evaluator_id TEXT NOT NULL,
  evaluator_version TEXT NOT NULL,
  evidence_fingerprint TEXT NOT NULL,
  opened_at_ms INTEGER NOT NULL,
  closed_at_ms INTEGER,
  metadata_json TEXT NOT NULL,
  UNIQUE(machine_namespace, issue_type, instance_fingerprint)
);

CREATE TABLE issue_status_transitions (
  transition_id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issue_instances(issue_id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  transitioned_at_ms INTEGER NOT NULL,
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  evidence_fingerprint TEXT NOT NULL,
  evaluator_id TEXT NOT NULL,
  evaluator_version TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  UNIQUE(issue_id, transition_id)
);
CREATE INDEX issue_transitions_issue_time ON issue_status_transitions(issue_id, transitioned_at_ms, transition_id);
"#;

// v0.12：计费合同、catalog 和金额测量都必须版本化。所有对历史 facts 的新
// 关联均可空：迁移绝不凭当前模板猜测旧 session 的合同。
const SCHEMA_V4_ADD: &str = r#"
ALTER TABLE usage_facts ADD COLUMN billing_template_id TEXT;
ALTER TABLE pricing_snapshots ADD COLUMN catalog_version TEXT;
ALTER TABLE pricing_snapshots ADD COLUMN billing_template_id TEXT;

CREATE TABLE provider_catalog_snapshots (
  catalog_version TEXT PRIMARY KEY,
  captured_at_ms INTEGER NOT NULL,
  source_kind TEXT NOT NULL,
  snapshot_id TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL
);

CREATE TABLE billing_templates (
  billing_template_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  account_ref TEXT,
  template_kind TEXT NOT NULL,
  pricing_source TEXT NOT NULL,
  effective_from_ms INTEGER NOT NULL,
  effective_to_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  CHECK (effective_to_ms IS NULL OR effective_to_ms >= effective_from_ms)
);
CREATE INDEX billing_templates_provider_window
  ON billing_templates(provider_id, account_ref, effective_from_ms, effective_to_ms);

CREATE TABLE billing_template_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  billing_template_id TEXT NOT NULL REFERENCES billing_templates(billing_template_id),
  catalog_version TEXT REFERENCES provider_catalog_snapshots(catalog_version),
  captured_at_ms INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE(billing_template_id, catalog_version, snapshot_id)
);
CREATE INDEX billing_template_snapshots_template_time
  ON billing_template_snapshots(billing_template_id, captured_at_ms);

CREATE TABLE outcome_measurements (
  measurement_id TEXT PRIMARY KEY,
  fact_set_fingerprint TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  basis TEXT NOT NULL,
  amount_minor INTEGER,
  currency TEXT,
  measured_at_ms INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  CHECK ((amount_minor IS NULL AND currency IS NULL) OR (amount_minor IS NOT NULL AND currency IS NOT NULL))
);

CREATE TABLE savings_records (
  savings_id TEXT PRIMARY KEY,
  measurement_id TEXT NOT NULL REFERENCES outcome_measurements(measurement_id),
  billing_template_snapshot_id TEXT REFERENCES billing_template_snapshots(snapshot_id),
  pricing_version TEXT REFERENCES pricing_snapshots(pricing_version),
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  savings_basis TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  CHECK (savings_basis IN ('estimated', 'actual', 'realized'))
);
CREATE INDEX savings_records_measurement ON savings_records(measurement_id);

CREATE TRIGGER usage_facts_billing_template_insert_fk
BEFORE INSERT ON usage_facts
WHEN NEW.billing_template_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM billing_templates WHERE billing_template_id = NEW.billing_template_id)
BEGIN
  SELECT RAISE(ABORT, 'usage_facts.billing_template_id does not reference billing_templates');
END;
CREATE TRIGGER usage_facts_billing_template_update_fk
BEFORE UPDATE OF billing_template_id ON usage_facts
WHEN NEW.billing_template_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM billing_templates WHERE billing_template_id = NEW.billing_template_id)
BEGIN
  SELECT RAISE(ABORT, 'usage_facts.billing_template_id does not reference billing_templates');
END;
"#;

// `data_status` 的未决 provider 归因使用相关子查询。只索引未解决的问题，
// 使查询谓词命中索引，又不为历史审计记录增加索引成本。
const SCHEMA_V5_ADD: &str = r#"
CREATE INDEX IF NOT EXISTS data_quality_issues_open_code_scope
  ON data_quality_issues(code, scope_key)
  WHERE resolved_at_ms IS NULL;
"#;

// SQLite cannot add REFERENCES constraints to existing columns. These triggers
// make the nullable v0.12 provenance columns fail closed on every write.
const SCHEMA_V6_ADD: &str = r#"
CREATE TRIGGER pricing_snapshots_catalog_insert_fk
BEFORE INSERT ON pricing_snapshots
WHEN NEW.catalog_version IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM provider_catalog_snapshots WHERE catalog_version = NEW.catalog_version)
BEGIN
  SELECT RAISE(ABORT, 'pricing_snapshots.catalog_version does not reference provider_catalog_snapshots');
END;
CREATE TRIGGER pricing_snapshots_catalog_update_fk
BEFORE UPDATE OF catalog_version ON pricing_snapshots
WHEN NEW.catalog_version IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM provider_catalog_snapshots WHERE catalog_version = NEW.catalog_version)
BEGIN
  SELECT RAISE(ABORT, 'pricing_snapshots.catalog_version does not reference provider_catalog_snapshots');
END;
CREATE TRIGGER pricing_snapshots_template_insert_fk
BEFORE INSERT ON pricing_snapshots
WHEN NEW.billing_template_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM billing_templates WHERE billing_template_id = NEW.billing_template_id)
BEGIN
  SELECT RAISE(ABORT, 'pricing_snapshots.billing_template_id does not reference billing_templates');
END;
CREATE TRIGGER pricing_snapshots_template_update_fk
BEFORE UPDATE OF billing_template_id ON pricing_snapshots
WHEN NEW.billing_template_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM billing_templates WHERE billing_template_id = NEW.billing_template_id)
BEGIN
  SELECT RAISE(ABORT, 'pricing_snapshots.billing_template_id does not reference billing_templates');
END;
"#;

// v1.0：旧公共价表中的个人订阅不是付款凭证。升级时保留为待确认候选，
// 必须由用户接受后才写入 host_bills / FixedSubscription。
const SCHEMA_V7_ADD: &str = r#"
CREATE TABLE billing_import_candidates (
  candidate_id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  billing_period_start TEXT NOT NULL,
  source_pricing_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'dismissed')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  resolved_at_ms INTEGER,
  UNIQUE(provider_id, currency, amount_minor, billing_period_start, source_pricing_version)
);
CREATE INDEX billing_import_candidates_status ON billing_import_candidates(status, provider_id);
"#;

// v1.0：计费关系是用户声明，不是付款记录，也不能寄居在公共价格目录。
const SCHEMA_V8_ADD: &str = r#"
CREATE TABLE billing_declarations (
  declaration_id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  relationship_kind TEXT NOT NULL CHECK (relationship_kind IN (
    'official_subscription', 'official_api', 'third_party', 'organization', 'unknown'
  )),
  subscription_name TEXT,
  amount_minor INTEGER CHECK (amount_minor IS NULL OR amount_minor >= 0),
  currency TEXT,
  effective_start TEXT NOT NULL,
  effective_end TEXT,
  source_candidate_id TEXT UNIQUE REFERENCES billing_import_candidates(candidate_id),
  evidence_ref TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  deleted_at_ms INTEGER,
  CHECK ((amount_minor IS NULL AND currency IS NULL) OR
         (amount_minor IS NOT NULL AND currency IS NOT NULL AND trim(currency) <> '')),
  CHECK (effective_end IS NULL OR effective_end >= effective_start)
);
CREATE INDEX billing_declarations_active_scope
  ON billing_declarations(host, provider_id, effective_start, effective_end)
  WHERE deleted_at_ms IS NULL;
"#;

// v1.0：声明当前态可供读取，但每次保存与撤销必须追加一个不可变修订；范围
// 是用户提供的附加证据，不能修改原始事实或推断未选中的历史记录。
const SCHEMA_V9_ADD: &str = r#"
CREATE TABLE billing_declaration_revisions (
  revision_id TEXT PRIMARY KEY,
  declaration_id TEXT NOT NULL REFERENCES billing_declarations(declaration_id),
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  change_kind TEXT NOT NULL CHECK (change_kind IN ('saved', 'revoked')),
  supersedes_revision_id TEXT UNIQUE REFERENCES billing_declaration_revisions(revision_id),
  host TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  relationship_kind TEXT NOT NULL CHECK (relationship_kind IN (
    'official_subscription', 'official_api', 'third_party', 'organization', 'unknown'
  )),
  subscription_name TEXT,
  amount_minor INTEGER CHECK (amount_minor IS NULL OR amount_minor >= 0),
  currency TEXT,
  effective_start TEXT NOT NULL,
  effective_end TEXT,
  source_candidate_id TEXT REFERENCES billing_import_candidates(candidate_id),
  evidence_ref TEXT,
  created_at_ms INTEGER NOT NULL,
  CHECK ((amount_minor IS NULL AND currency IS NULL) OR
         (amount_minor IS NOT NULL AND currency IS NOT NULL AND trim(currency) <> '')),
  CHECK (effective_end IS NULL OR effective_end >= effective_start),
  UNIQUE(declaration_id, revision_number)
);
CREATE TABLE billing_declaration_scopes (
  revision_id TEXT NOT NULL REFERENCES billing_declaration_revisions(revision_id) ON DELETE CASCADE,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('account', 'route', 'model', 'session')),
  scope_value TEXT NOT NULL CHECK (trim(scope_value) <> ''),
  PRIMARY KEY(revision_id, scope_kind, scope_value)
);
CREATE INDEX billing_declaration_revisions_current
  ON billing_declaration_revisions(declaration_id, revision_number DESC);
CREATE INDEX billing_declaration_scopes_lookup
  ON billing_declaration_scopes(scope_kind, scope_value, revision_id);
"#;

const SCHEMA_V10_ADD: &str = r#"
CREATE TABLE IF NOT EXISTS billing_recalculation_jobs (
  job_id TEXT PRIMARY KEY,
  declaration_id TEXT NOT NULL REFERENCES billing_declarations(declaration_id),
  revision_id TEXT NOT NULL REFERENCES billing_declaration_revisions(revision_id),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  requested_at_ms INTEGER NOT NULL,
  started_at_ms INTEGER,
  completed_at_ms INTEGER,
  error_code TEXT,
  error_detail TEXT,
  UNIQUE(revision_id)
);
CREATE INDEX IF NOT EXISTS billing_recalculation_jobs_status
  ON billing_recalculation_jobs(status, requested_at_ms);
"#;

const SCHEMA_V11_ADD: &str = r#"
CREATE TABLE IF NOT EXISTS billing_recalculation_results (
  job_id TEXT PRIMARY KEY REFERENCES billing_recalculation_jobs(job_id),
  revision_id TEXT NOT NULL REFERENCES billing_declaration_revisions(revision_id),
  fact_count INTEGER NOT NULL CHECK (fact_count >= 0),
  session_count INTEGER NOT NULL CHECK (session_count >= 0),
  total_tokens INTEGER NOT NULL CHECK (total_tokens >= 0),
  first_event_ts_ms INTEGER,
  last_event_ts_ms INTEGER,
  published_at_ms INTEGER NOT NULL
);
"#;

const SCHEMA_V12_ADD: &str = r#"
CREATE TABLE IF NOT EXISTS billing_fact_attributions (
  fact_id TEXT NOT NULL REFERENCES usage_facts(fact_id),
  revision_id TEXT NOT NULL REFERENCES billing_declaration_revisions(revision_id),
  job_id TEXT NOT NULL REFERENCES billing_recalculation_jobs(job_id),
  attribution_kind TEXT NOT NULL CHECK (attribution_kind IN ('subscription_covered', 'user_declared')),
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY(fact_id, revision_id)
);
CREATE INDEX IF NOT EXISTS billing_fact_attributions_revision
  ON billing_fact_attributions(revision_id, fact_id);

-- v1.0 budget profiles: keep the legacy single CNY row readable while allowing
-- independent estimate/confirmed budgets and an explicit currency per profile.
CREATE TABLE IF NOT EXISTS budget_profiles (
  profile_id TEXT PRIMARY KEY CHECK (profile_id IN ('estimate', 'confirmed')),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  monthly_minor INTEGER NOT NULL CHECK (monthly_minor > 0),
  daily_minor INTEGER,
  warning_ratio_bp INTEGER NOT NULL CHECK (warning_ratio_bp BETWEEN 0 AND 10000),
  updated_at_ms INTEGER NOT NULL
);
"#;

const SCHEMA_V13_ADD: &str = r#"
CREATE TABLE IF NOT EXISTS budget_profiles (
  profile_id TEXT PRIMARY KEY CHECK (profile_id IN ('estimate', 'confirmed')),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  monthly_minor INTEGER NOT NULL CHECK (monthly_minor > 0),
  daily_minor INTEGER,
  warning_ratio_bp INTEGER NOT NULL CHECK (warning_ratio_bp BETWEEN 0 AND 10000),
  updated_at_ms INTEGER NOT NULL
);
"#;

// v14（计费主链 v1.2「明确计费方式」）：作用域词表加 `provider`，唯一合法值
// `unresolved`——「服务商未知」的组（事实 provider_id 为 NULL）由用户补上服务商，
// 声明记录他选的服务商，作用域让预览/重算只命中 NULL-provider 的事实。SQLite 改
// 不了 CHECK，只能重建表；行原样搬迁，索引重建。
const SCHEMA_V14_ADD: &str = r#"
CREATE TABLE billing_declaration_scopes_v14 (
  revision_id TEXT NOT NULL REFERENCES billing_declaration_revisions(revision_id) ON DELETE CASCADE,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('account', 'route', 'model', 'session', 'provider')),
  scope_value TEXT NOT NULL CHECK (trim(scope_value) <> ''),
  PRIMARY KEY(revision_id, scope_kind, scope_value)
);
INSERT INTO billing_declaration_scopes_v14(revision_id, scope_kind, scope_value)
  SELECT revision_id, scope_kind, scope_value FROM billing_declaration_scopes;
DROP INDEX IF EXISTS billing_declaration_scopes_lookup;
DROP TABLE billing_declaration_scopes;
ALTER TABLE billing_declaration_scopes_v14 RENAME TO billing_declaration_scopes;
CREATE INDEX billing_declaration_scopes_lookup
  ON billing_declaration_scopes(scope_kind, scope_value, revision_id);
"#;

/// 增量 7.5：v1 base 表之上的 4 个脱敏只读 view。`CREATE VIEW IF NOT EXISTS`
/// 幂等——在 `ensure_schema` 的「version == SCHEMA_VERSION」分支上执行。
/// **不**进 `SCHEMA_V1` 主 DDL，避免『v1 库必须重跑 SCHEMA_V1 才能拿 view』
/// 这种不必要的迁移负担。
const VIEWS_V1: &str = r#"
CREATE VIEW IF NOT EXISTS v_facts_safe AS
  SELECT fact_id, host, observation_kind, source_profile,
         provider_id, provider_raw, billing_source, billing_mode,
         pricing_basis, billing_template_id, evidence_basis, normalization_version,
         route_evidence_id, attribution_version,
         model_id, event_ts_ms, event_peak,
         uncached_input_tokens, cache_read_tokens,
         cache_write_tokens, output_tokens,
         ingested_run_id, created_at_ms, updated_at_ms, deleted_at_ms
  FROM usage_facts;
CREATE VIEW IF NOT EXISTS v_sessions_safe AS
  SELECT session_key, host, source_profile,
         started_at_ms, ended_at_ms, last_observed_at_ms, deleted_at_ms
  FROM sessions;
CREATE VIEW IF NOT EXISTS v_data_quality_safe AS
  SELECT issue_id, scope_type, scope_key, code, severity,
         first_seen_at_ms, last_seen_at_ms, resolved_at_ms
  FROM data_quality_issues;
CREATE VIEW IF NOT EXISTS v_sync_runs_safe AS
  SELECT run_id, started_at_ms, completed_at_ms, trigger, status,
         schema_version, error_code
  FROM sync_runs;
"#;

/// v0.9.1 Phase 3.4：`budget_config` 单行（config_id=1）的 typed 视图。
/// 金额一律**最小货币单位整数**（纪律 2「金额不落浮点」——展示层再换算）；
/// `warning_ratio_bp` 是万分比（8000 = 80%，seed 时由 config.toml 的
/// `warn_at_ratio: 0.8` × 10000 得来）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BudgetConfig {
    pub monthly_cny_minor: i64,
    pub daily_cny_minor: i64,
    pub warning_ratio_bp: i64,
    pub updated_at_ms: i64,
}

/// v1.0 的双预算配置。`estimate` 与 `confirmed` 是两个互斥口径，不能用
/// 一个金额字段代替；currency 明确绑定到每个口径，避免 USD 静默进入 CNY。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BudgetProfile {
    pub profile_id: String,
    pub currency: String,
    pub monthly_minor: i64,
    pub daily_minor: Option<i64>,
    pub warning_ratio_bp: i64,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HostImportedDataDeletion {
    pub facts: usize,
    pub sessions: usize,
    pub source_files: usize,
}

/// 权威库连接。**非 Sync**（rusqlite `Connection` 语义同旧 store）；每线程
/// 自开。open 时：`foreign_keys=ON`（spec §3 前言）+ WAL + `busy_timeout`
/// + DDL 版本闸 + 中断批次清扫（§3.1）。
#[derive(Debug)]
pub struct AuthorityDb {
    conn: Connection,
}

impl AuthorityDb {
    /// 打开（不存在则建库 + 全量 DDL）。**损坏不自愈**——`Corrupt` 上抛，
    /// 恢复路径在模块头。
    pub fn open(db_path: &Path, now_ms: i64) -> Result<Self, AuthorityError> {
        if let Some(dir) = db_path.parent() {
            std::fs::create_dir_all(dir).map_err(AuthorityError::Io)?;
        }
        let conn = Connection::open(db_path)?;
        // 损坏库在第一个语句就会炸——先探一下（PRAGMA 是最便宜的语句），
        // 把 sqlite 的 "not a database"/"malformed" 归为 Corrupt 语义由调用
        // 方走恢复流程，而不是当成普通 Sqlite 错误继续写。
        // busy_timeout 必须先于 journal_mode：WAL 切换本身要拿锁——并发
        // open（托盘 tick + CLI）时先设 journal_mode 会直接 BUSY 报错
        // （审查 P1-1 的触发面之一）。
        conn.busy_timeout(std::time::Duration::from_millis(5_000))?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        Self::ensure_schema(&conn, now_ms)?;
        crate::issues::repair_issue_timestamp_units(&conn)?;
        Ok(Self { conn })
    }

    /// **只读取数面**（Data MCP `data-mcp serve`，spec §9.3）：`SQLITE_OPEN_READ_ONLY`——
    /// 不建库、不跑 DDL、不 migration、不清扫中断批次。缺文件 / 损坏 / schema
    /// 版本不符各返回 typed 错误，供调用方映射成 spec §11 的稳定错误码
    /// （`database_missing` / `database_unreadable` / `schema_too_new` /
    /// `schema_migration_required`）。
    ///
    /// 与 [`Self::open`] 的「不存在则建库」刻意相反：只读消费者遇到缺库/损坏
    /// 必须如实报错——在 `sql_authority_enabled` 下，一个被悄悄新建的空库
    /// 端出 facts=0 会被读成「没花钱」（spec §5.3 / 1.7 的灾难态）。
    pub fn open_readonly(db_path: &Path) -> Result<Self, AuthorityError> {
        if !db_path.exists() {
            return Err(AuthorityError::MissingFile);
        }
        let conn = Connection::open_with_flags(
            db_path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
        )
        .map_err(|_| AuthorityError::Corrupt)?;
        conn.busy_timeout(std::time::Duration::from_millis(5_000))?;
        // 损坏 / 非 SQLite / 半建库探测：`schema_meta` 读不出就不是我们的库。
        // （`PRAGMA integrity_check` 更彻底但慢——留给 `data_status` 自己跑，
        // 它是 doctor 工具，其余工具在这一步 fail-fast 即可。）
        let found: i64 = match conn.query_row(
            "SELECT value FROM schema_meta WHERE key = 'schema_version'",
            [],
            |r| r.get::<_, String>(0),
        ) {
            Ok(s) => s.parse().map_err(|_| AuthorityError::Corrupt)?,
            Err(_) => return Err(AuthorityError::Corrupt),
        };
        match found.cmp(&SCHEMA_VERSION) {
            std::cmp::Ordering::Equal => Ok(Self { conn }),
            std::cmp::Ordering::Greater => Err(AuthorityError::NewerSchema {
                found,
                supported: SCHEMA_VERSION,
            }),
            std::cmp::Ordering::Less => Err(AuthorityError::OlderSchema { found }),
        }
    }

    /// **只读 + authorizer 守护的连接**（增量 7.5 `query_sql_readonly` 专用）——
    /// `SQLITE_OPEN_READ_ONLY` + 挂 SQLite `sqlite3_set_authorizer` 回调，按
    /// 来源表 + 来源列拒绝敏感字段（spec §8.2 P1-5：作者层拒绝是第一层防线，
    /// 结果列名扫描仅第二层）。
    ///
    /// **不在 v1 兼容承诺内**：仅 `mcp-internal` 构建调用；公开构建不挂这个
    /// 工具。Caller 必须在执行前/后 close this connection。
    pub fn make_query_sql_readonly_connection(
        db_path: &Path,
    ) -> Result<Connection, AuthorityError> {
        if !db_path.exists() {
            return Err(AuthorityError::MissingFile);
        }
        let conn = Connection::open_with_flags(
            db_path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
        )
        .map_err(|_| AuthorityError::Corrupt)?;
        conn.busy_timeout(std::time::Duration::from_millis(3_000))?;
        // 用 raw connection 挂 authorizer——`rusqlite::Connection::authorizer`
        // 接受 `FnMut(AuthContext) -> Authorization + Send + RefUnwindSafe + 'static`。
        conn.authorizer(Some(authority_callback));
        Ok(conn)
    }

    fn ensure_schema(conn: &Connection, now_ms: i64) -> Result<(), AuthorityError> {
        // 版本行在 SCHEMA_V1 里随全量 DDL 一起建——这里只**读**：schema_meta
        // 表不存在 = 全新库（None）。不能先无条件建表再跑全量 DDL（后者会
        // 撞 already exists）。
        let meta_exists: bool = conn
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'",
                [],
                |_| Ok(true),
            )
            .unwrap_or(false);
        let version: Option<i64> = if meta_exists {
            conn.query_row(
                "SELECT value FROM schema_meta WHERE key = 'schema_version'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
            .and_then(|v| v.parse().ok())
        } else {
            None
        };
        match version {
            Some(v) if v > SCHEMA_VERSION => {
                return Err(AuthorityError::NewerSchema {
                    found: v,
                    supported: SCHEMA_VERSION,
                })
            }
            Some(v) if v == SCHEMA_VERSION => {
                // 增量 7.5：脱敏只读 view（`query_sql_readonly` 的来源层屏障）。
                // 版本无关的只读加法——`CREATE VIEW IF NOT EXISTS` 幂等。
                conn.execute_batch("DROP VIEW IF EXISTS v_facts_safe;")?;
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(13) => {
                conn.execute_batch("BEGIN IMMEDIATE")?;
                let migration = conn.execute_batch(SCHEMA_V14_ADD);
                match migration {
                    Ok(()) => {
                        conn.execute("UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'", rusqlite::params![SCHEMA_VERSION.to_string()])?;
                        conn.execute_batch("COMMIT")?;
                    }
                    Err(error) => { let _ = conn.execute_batch("ROLLBACK"); return Err(error.into()); }
                }
                conn.execute_batch("DROP VIEW IF EXISTS v_facts_safe;")?;
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(12) => {
                conn.execute_batch("BEGIN IMMEDIATE")?;
                let migration = conn.execute_batch(SCHEMA_V13_ADD).and_then(|()| conn.execute_batch(SCHEMA_V14_ADD));
                match migration {
                    Ok(()) => {
                        conn.execute("UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'", rusqlite::params![SCHEMA_VERSION.to_string()])?;
                        conn.execute_batch("COMMIT")?;
                    }
                    Err(error) => { let _ = conn.execute_batch("ROLLBACK"); return Err(error.into()); }
                }
                conn.execute_batch("DROP VIEW IF EXISTS v_facts_safe;")?;
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(11) => {
                conn.execute_batch("BEGIN IMMEDIATE")?;
                let migration = conn.execute_batch(SCHEMA_V12_ADD).and_then(|()| conn.execute_batch(SCHEMA_V13_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V14_ADD));
                match migration {
                    Ok(()) => {
                        conn.execute("UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'", rusqlite::params![SCHEMA_VERSION.to_string()])?;
                        conn.execute_batch("COMMIT")?;
                    }
                    Err(error) => { let _ = conn.execute_batch("ROLLBACK"); return Err(error.into()); }
                }
                conn.execute_batch("DROP VIEW IF EXISTS v_facts_safe;")?;
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(10) => {
                conn.execute_batch("BEGIN IMMEDIATE")?;
                let migration = conn.execute_batch(SCHEMA_V11_ADD).and_then(|()| conn.execute_batch(SCHEMA_V12_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V13_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V14_ADD));
                match migration {
                    Ok(()) => {
                        conn.execute("UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'", rusqlite::params![SCHEMA_VERSION.to_string()])?;
                        conn.execute_batch("COMMIT")?;
                    }
                    Err(error) => { let _ = conn.execute_batch("ROLLBACK"); return Err(error.into()); }
                }
                conn.execute_batch("DROP VIEW IF EXISTS v_facts_safe;")?;
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(9) => {
                conn.execute_batch("BEGIN IMMEDIATE")?;
                let migration = conn.execute_batch(SCHEMA_V10_ADD).and_then(|()| conn.execute_batch(SCHEMA_V11_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V12_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V13_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V14_ADD));
                match migration {
                    Ok(()) => {
                        conn.execute("UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'", rusqlite::params![SCHEMA_VERSION.to_string()])?;
                        conn.execute_batch("COMMIT")?;
                    }
                    Err(error) => { let _ = conn.execute_batch("ROLLBACK"); return Err(error.into()); }
                }
                conn.execute_batch("DROP VIEW IF EXISTS v_facts_safe;")?;
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(8) => {
                conn.execute_batch("BEGIN IMMEDIATE")?;
                let migration = conn.execute_batch(SCHEMA_V9_ADD).and_then(|()| conn.execute_batch(SCHEMA_V10_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V11_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V12_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V13_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V14_ADD));
                match migration {
                    Ok(()) => {
                        conn.execute("UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'", rusqlite::params![SCHEMA_VERSION.to_string()])?;
                        conn.execute_batch("COMMIT")?;
                    }
                    Err(error) => { let _ = conn.execute_batch("ROLLBACK"); return Err(error.into()); }
                }
                conn.execute_batch("DROP VIEW IF EXISTS v_facts_safe;")?;
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(7) => {
                conn.execute_batch("BEGIN IMMEDIATE")?;
                let migration = conn.execute_batch(SCHEMA_V8_ADD).and_then(|()| conn.execute_batch(SCHEMA_V9_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V10_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V11_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V12_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V13_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V14_ADD));
                match migration {
                    Ok(()) => {
                        conn.execute("UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'", rusqlite::params![SCHEMA_VERSION.to_string()])?;
                        conn.execute_batch("COMMIT")?;
                    }
                    Err(error) => { let _ = conn.execute_batch("ROLLBACK"); return Err(error.into()); }
                }
                conn.execute_batch("DROP VIEW IF EXISTS v_facts_safe;")?;
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(6) => {
                conn.execute_batch("BEGIN IMMEDIATE")?;
                let migration = conn.execute_batch(SCHEMA_V7_ADD).and_then(|()| conn.execute_batch(SCHEMA_V8_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V9_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V10_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V11_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V12_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V13_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V14_ADD));
                match migration {
                    Ok(()) => {
                        conn.execute(
                            "UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'",
                            rusqlite::params![SCHEMA_VERSION.to_string()],
                        )?;
                        conn.execute_batch("COMMIT")?;
                    }
                    Err(error) => { let _ = conn.execute_batch("ROLLBACK"); return Err(error.into()); }
                }
                conn.execute_batch("DROP VIEW IF EXISTS v_facts_safe;")?;
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(5) => {
                conn.execute_batch("BEGIN IMMEDIATE")?;
                let migration = conn.execute_batch(SCHEMA_V6_ADD).and_then(|()| conn.execute_batch(SCHEMA_V7_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V8_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V9_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V10_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V11_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V12_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V13_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V14_ADD));
                match migration {
                    Ok(()) => {
                        conn.execute(
                            "UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'",
                            rusqlite::params![SCHEMA_VERSION.to_string()],
                        )?;
                        conn.execute_batch("COMMIT")?;
                    }
                    Err(error) => {
                        let _ = conn.execute_batch("ROLLBACK");
                        return Err(error.into());
                    }
                }
                conn.execute_batch("DROP VIEW IF EXISTS v_facts_safe;")?;
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(4) => {
                conn.execute_batch("BEGIN IMMEDIATE")?;
                let migration = conn.execute_batch(SCHEMA_V5_ADD).and_then(|()| conn.execute_batch(SCHEMA_V6_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V7_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V8_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V9_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V10_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V11_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V12_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V13_ADD)).and_then(|()| conn.execute_batch(SCHEMA_V14_ADD));
                match migration {
                    Ok(()) => {
                        conn.execute("UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'", rusqlite::params![SCHEMA_VERSION.to_string()])?;
                        conn.execute_batch("COMMIT")?;
                    }
                    Err(error) => { let _ = conn.execute_batch("ROLLBACK"); return Err(error.into()); }
                }
                conn.execute_batch("DROP VIEW IF EXISTS v_facts_safe;")?;
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(3) => {
                conn.execute_batch("BEGIN IMMEDIATE")?;
                let migration = conn.execute_batch(SCHEMA_V4_ADD);
                match migration {
                    Ok(()) => {
                        if let Err(error) = conn.execute_batch(SCHEMA_V5_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V6_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V7_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V8_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V9_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V10_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V11_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V12_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V13_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V14_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        conn.execute(
                            "UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'",
                            rusqlite::params![SCHEMA_VERSION.to_string()],
                        )?;
                        conn.execute_batch("COMMIT")?;
                    }
                    Err(error) => {
                        let _ = conn.execute_batch("ROLLBACK");
                        return Err(error.into());
                    }
                }
                conn.execute_batch("DROP VIEW IF EXISTS v_facts_safe;")?;
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(2) => {
                conn.execute_batch("BEGIN IMMEDIATE")?;
                let migration = conn.execute_batch(SCHEMA_V3_ADD);
                match migration {
                    Ok(()) => {
                        if let Err(error) = conn.execute_batch(SCHEMA_V4_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V5_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V6_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V7_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V8_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V9_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V10_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V11_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V12_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V13_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V14_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        conn.execute(
                            "UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'",
                            rusqlite::params![SCHEMA_VERSION.to_string()],
                        )?;
                        conn.execute_batch("COMMIT")?;
                    }
                    Err(error) => {
                        let _ = conn.execute_batch("ROLLBACK");
                        return Err(error.into());
                    }
                }
                conn.execute_batch("DROP VIEW IF EXISTS v_facts_safe;")?;
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(1) => {
                conn.execute_batch("BEGIN IMMEDIATE")?;
                let migration = conn.execute_batch(MIGRATE_V1_TO_V2);
                match migration {
                    Ok(()) => {
                        if let Err(error) = conn.execute_batch(SCHEMA_V3_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V4_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V5_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V6_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V7_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V8_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V9_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V10_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V11_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V12_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V13_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        if let Err(error) = conn.execute_batch(SCHEMA_V14_ADD) {
                            let _ = conn.execute_batch("ROLLBACK");
                            return Err(error.into());
                        }
                        conn.execute(
                            "UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'",
                            rusqlite::params![SCHEMA_VERSION.to_string()],
                        )?;
                        conn.execute_batch("COMMIT")?;
                    }
                    Err(error) => {
                        let _ = conn.execute_batch("ROLLBACK");
                        return Err(error.into());
                    }
                }
                conn.execute_batch(VIEWS_V1)?;
            }
            Some(old) => {
                return Err(AuthorityError::Sqlite(
                    rusqlite::Error::InvalidParameterName(format!(
                        "__unsupported_legacy_version__:{old}"
                    )),
                ));
            }
            None => {
                // 空库：若已有业务表（无版本行的半建库——创建中断残留），
                // 视为损坏：建库流程必须事务化完成，半建状态不可信。
                let has_tables: bool = conn
                    .query_row(
                        "SELECT 1 FROM sqlite_master WHERE type = 'table'
                         AND name IN ('usage_facts','sync_runs','sessions')",
                        [],
                        |_| Ok(true),
                    )
                    .unwrap_or(false);
                if has_tables {
                    return Err(AuthorityError::Sqlite(
                        rusqlite::Error::InvalidParameterName(
                            "__corrupt_partial_schema__".to_string(),
                        ),
                    ));
                }
                conn.execute_batch("BEGIN IMMEDIATE")?;
                conn.execute_batch(SCHEMA_V1)?;
                conn.execute_batch(SCHEMA_V3_ADD)?;
                conn.execute_batch(SCHEMA_V4_ADD)?;
                conn.execute_batch(SCHEMA_V5_ADD)?;
                conn.execute_batch(SCHEMA_V6_ADD)?;
                conn.execute_batch(SCHEMA_V7_ADD)?;
                conn.execute_batch(SCHEMA_V8_ADD)?;
                conn.execute_batch(SCHEMA_V9_ADD)?;
                conn.execute_batch(SCHEMA_V10_ADD)?;
                conn.execute_batch(SCHEMA_V11_ADD)?;
                conn.execute_batch(SCHEMA_V12_ADD)?;
                conn.execute_batch(SCHEMA_V13_ADD)?;
                conn.execute_batch(SCHEMA_V14_ADD)?;
                // 增量 7.5：新建库时同步加 4 个脱敏只读 view（spec §8.2 P1-5）。
                conn.execute_batch(VIEWS_V1)?;
                conn.execute(
                    "INSERT INTO schema_meta(key, value) VALUES('schema_version', ?1)",
                    rusqlite::params![SCHEMA_VERSION.to_string()],
                )?;
                conn.execute_batch("COMMIT")?;
                let _ = now_ms; // v1 建库本身不写业务时间戳（版本行是元数据）
            }
        }
        // 中断批次清扫（§3.1）：任何 running 的批次在下次 open 时标
        // interrupted——它是观测记录，不是可恢复状态（恢复靠幂等重跑）。
        conn.execute(
            "UPDATE sync_runs SET status = 'cancelled',
                 error_code = COALESCE(error_code, 'interrupted'),
                 completed_at_ms = COALESCE(completed_at_ms, ?1)
             WHERE status = 'running'",
            rusqlite::params![now_ms],
        )?;
        Ok(())
    }

    /// 开启一个同步批次（§3.1 sync_runs）。`run_id` 由调用方生成（幂等重跑
    /// 用同一 id 时是「重跑恢复」语义，不是新批次）。
    pub fn begin_run(
        &self,
        run_id: &str,
        trigger: &str,
        now_ms: i64,
    ) -> Result<(), AuthorityError> {
        self.conn.execute(
            "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
             VALUES (?1, ?2, ?3, 'running', ?4)
             ON CONFLICT(run_id) DO UPDATE SET
                 started_at_ms = excluded.started_at_ms,
                 status = 'running',
                 error_code = NULL,
                 error_detail = NULL",
            rusqlite::params![run_id, now_ms, trigger, SCHEMA_VERSION],
        )?;
        Ok(())
    }

    /// 结束批次。status ∈ succeeded | failed | cancelled（§3.1 词表）。
    pub fn finish_run(
        &self,
        run_id: &str,
        status: &str,
        error_code: Option<&str>,
        error_detail: Option<&str>,
        now_ms: i64,
    ) -> Result<(), AuthorityError> {
        self.conn.execute(
            "UPDATE sync_runs SET status = ?2, completed_at_ms = ?3,
                 error_code = ?4, error_detail = ?5
             WHERE run_id = ?1",
            rusqlite::params![run_id, status, now_ms, error_code, error_detail],
        )?;
        Ok(())
    }

    /// 保留滚动（spec §5.4）：物理清理 13 个自然月前的 usage_facts 行。
    /// `cutoff_iso_prefix` = "YYYY-MM"（event_ts_ms 由调用方换成 ISO 前缀
    /// 比较不便——这里直接收 UTC 毫秒下界 `cutoff_ms`：event_ts_ms < cutoff
    /// 的行删除）。无日期（event_ts_ms NULL）与 deleted 行的清理走显式
    /// 修复流程（spec §5.4「不能静默删除」），本函数不碰。
    pub fn retention_usage_facts(&self, cutoff_ms: i64) -> Result<usize, AuthorityError> {
        Ok(self.conn.execute(
            "DELETE FROM usage_facts WHERE event_ts_ms IS NOT NULL AND event_ts_ms < ?1",
            rusqlite::params![cutoff_ms],
        )?)
    }

    /// 删除一个宿主由本 App 导入的可见数据。事实和会话采用既有软删除语义，
    /// 使历史计费归因外键仍完整；来源指纹被物理删除，恢复读取后才会重新导入。
    /// 不触及用户手工账单、计费声明、价格快照或任何其他宿主。
    pub fn delete_imported_host_data(
        &self, host: &str, now_ms: i64,
    ) -> Result<HostImportedDataDeletion, AuthorityError> {
        self.with_immediate_txn(|conn| {
            let facts = conn.execute(
                "UPDATE usage_facts SET deleted_at_ms = ?2, updated_at_ms = ?2
                 WHERE host = ?1 AND deleted_at_ms IS NULL",
                rusqlite::params![host, now_ms],
            )?;
            let sessions = conn.execute(
                "UPDATE sessions SET deleted_at_ms = ?2
                 WHERE host = ?1 AND deleted_at_ms IS NULL",
                rusqlite::params![host, now_ms],
            )?;
            conn.execute(
                "DELETE FROM workflow_events WHERE session_key IN (SELECT session_key FROM sessions WHERE host = ?1)
                   OR source_id IN (SELECT source_id FROM source_files WHERE host = ?1)",
                [host],
            )?;
            conn.execute("DELETE FROM host_runtime_snapshots WHERE host = ?1", [host])?;
            // route_evidence 是导入的路由证据；清除其 ID 后再删行，避免已软
            // 删除的事实留下悬挂证据引用。
            conn.execute("UPDATE usage_facts SET route_evidence_id = NULL WHERE host = ?1", [host])?;
            conn.execute("DELETE FROM route_evidence WHERE host = ?1", [host])?;
            // 已软删除的事实不再保留源文件关联，避免 source_files 外键阻碍
            // 指纹清理，也避免已删除数据继续关联可推断的来源元数据。
            conn.execute("UPDATE usage_facts SET source_id = NULL WHERE host = ?1", [host])?;
            let source_files = conn.execute("DELETE FROM source_files WHERE host = ?1", [host])?;
            Ok(HostImportedDataDeletion { facts, sessions, source_files })
        })
    }

    // ─────── v0.9.1 Phase 3.4：budget_config / budget_snoozes 显式管理 API
    // （spec §5.3「账单和预算配置为显式管理 API」；单行表 config_id/snooze_id
    // 恒 1，upsert 语义）。金额全是 minor 整数；判断在消费方，全整数比较。

    /// 读预算配置。None = 从未配置（消费方决定回落默认或报 no_budget）。
    pub fn budget_config_get(&self) -> Result<Option<BudgetConfig>, AuthorityError> {
        let r = self.conn.query_row(
            "SELECT monthly_cny_minor, daily_cny_minor, warning_ratio_bp, updated_at_ms
             FROM budget_config WHERE config_id = 1",
            [],
            |r| {
                Ok(BudgetConfig {
                    monthly_cny_minor: r.get(0)?,
                    daily_cny_minor: r.get(1)?,
                    warning_ratio_bp: r.get(2)?,
                    updated_at_ms: r.get(3)?,
                })
            },
        );
        match r {
            Ok(c) => Ok(Some(c)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// 写预算配置（单行 upsert）。`updated_at_ms` 由调用方注入（时钟纪律）。
    pub fn budget_config_set(
        &self,
        monthly_cny_minor: i64,
        daily_cny_minor: i64,
        warning_ratio_bp: i64,
        now_ms: i64,
    ) -> Result<(), AuthorityError> {
        self.conn.execute(
            "INSERT INTO budget_config(config_id, monthly_cny_minor, daily_cny_minor,
                 warning_ratio_bp, updated_at_ms)
             VALUES (1, ?1, ?2, ?3, ?4)
             ON CONFLICT(config_id) DO UPDATE SET
                 monthly_cny_minor = excluded.monthly_cny_minor,
                 daily_cny_minor = excluded.daily_cny_minor,
                 warning_ratio_bp = excluded.warning_ratio_bp,
                 updated_at_ms = excluded.updated_at_ms",
            rusqlite::params![monthly_cny_minor, daily_cny_minor, warning_ratio_bp, now_ms],
        )?;
        Ok(())
    }

    /// 读取 v1.0 双预算配置，固定按 profile_id 排序，便于各消费面稳定对拍。
    pub fn budget_profiles_get(&self) -> Result<Vec<BudgetProfile>, AuthorityError> {
        let mut stmt = self.conn.prepare(
            "SELECT profile_id, currency, monthly_minor, daily_minor,
                    warning_ratio_bp, updated_at_ms
             FROM budget_profiles ORDER BY profile_id",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(BudgetProfile {
                profile_id: r.get(0)?, currency: r.get(1)?, monthly_minor: r.get(2)?,
                daily_minor: r.get(3)?, warning_ratio_bp: r.get(4)?, updated_at_ms: r.get(5)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    /// 写入一个预算口径。金额和币种均在数据库约束下落库；同一 profile 幂等覆盖。
    pub fn budget_profile_set(
        &self,
        profile_id: &str,
        currency: &str,
        monthly_minor: i64,
        daily_minor: Option<i64>,
        warning_ratio_bp: i64,
        now_ms: i64,
    ) -> Result<(), AuthorityError> {
        if !matches!(profile_id, "estimate" | "confirmed") {
            return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                "unsupported budget profile".to_string(),
            )));
        }
        if currency.len() != 3 || !currency.is_ascii() || monthly_minor <= 0
            || daily_minor.is_some_and(|v| v <= 0)
            || !(0..=10_000).contains(&warning_ratio_bp)
        {
            return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                "invalid budget profile".to_string(),
            )));
        }
        self.conn.execute(
            "INSERT INTO budget_profiles(profile_id, currency, monthly_minor, daily_minor,
                 warning_ratio_bp, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(profile_id) DO UPDATE SET
                 currency = excluded.currency, monthly_minor = excluded.monthly_minor,
                 daily_minor = excluded.daily_minor,
                 warning_ratio_bp = excluded.warning_ratio_bp,
                 updated_at_ms = excluded.updated_at_ms",
            rusqlite::params![profile_id, currency, monthly_minor, daily_minor, warning_ratio_bp, now_ms],
        )?;
        Ok(())
    }

    /// 读 snooze（`until_ms`）。None = 从未设置；已过期的不清除（判断在
    /// 消费方——「过期自动失效」与 Python 链 `now >= until` 同语义），返回
    /// 原值让消费方比较，避免这里读时钟。
    pub fn budget_snooze_get(&self) -> Result<Option<i64>, AuthorityError> {
        self.conn
            .query_row(
                "SELECT until_ms FROM budget_snoozes WHERE snooze_id = 1",
                [],
                |r| r.get(0),
            )
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(other.into()),
            })
    }

    /// 写 snooze（单行 upsert）。`until_ms` = 毫秒时间戳（调用方由 ISO 解析）。
    pub fn budget_snooze_set(&self, until_ms: i64, now_ms: i64) -> Result<(), AuthorityError> {
        self.conn.execute(
            "INSERT INTO budget_snoozes(snooze_id, until_ms, updated_at_ms)
             VALUES (1, ?1, ?2)
             ON CONFLICT(snooze_id) DO UPDATE SET
                 until_ms = excluded.until_ms, updated_at_ms = excluded.updated_at_ms",
            rusqlite::params![until_ms, now_ms],
        )?;
        Ok(())
    }

    /// 清除 snooze（物理删单行——「撤销」不是「设为过去」，删了就是干净状态）。
    pub fn budget_snooze_clear(&self) -> Result<(), AuthorityError> {
        self.conn
            .execute("DELETE FROM budget_snoozes WHERE snooze_id = 1", [])?;
        Ok(())
    }

    // ─────── v0.9.1 Phase 2.8：pricing_snapshots（spec §5.3 价格快照）───────
    // 历史查询以记录的 pricing version 重放，不能用当前价卡覆盖历史解释
    // （§5.3）。一个 version 的内容不可变：`pricing_version` 是 payload 的
    // 内容指纹，同指纹 = 同 payload = 幂等吸收（DO NOTHING）。

    /// 落一份价格快照。`pricing_version` 由调用方按 payload 内容派生
    /// （`fnv1a64_hex(canonical_json)`）。已存在 → DO NOTHING（内容不可变）。
    pub fn pricing_snapshot_put(
        &self,
        pricing_version: &str,
        source_kind: &str,
        payload_json: &str,
        captured_at_ms: i64,
    ) -> Result<bool, AuthorityError> {
        self.pricing_snapshot_put_with_provenance(
            pricing_version, source_kind, payload_json, captured_at_ms, None, None,
        )
    }

    /// 落一份不可变价格快照，并显式关联其 catalog／模板证据。通用旧入口
    /// 保持无归属兼容；新的计费接入必须使用这个入口，触发器会拒绝孤儿引用。
    #[allow(clippy::too_many_arguments)]
    pub fn pricing_snapshot_put_with_provenance(
        &self,
        pricing_version: &str,
        source_kind: &str,
        payload_json: &str,
        captured_at_ms: i64,
        catalog_version: Option<&str>,
        billing_template_id: Option<&str>,
    ) -> Result<bool, AuthorityError> {
        let changed = self.conn.execute(
            "INSERT INTO pricing_snapshots(pricing_version, captured_at_ms, source_kind, payload_json, catalog_version, billing_template_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(pricing_version) DO NOTHING",
            rusqlite::params![pricing_version, captured_at_ms, source_kind, payload_json, catalog_version, billing_template_id],
        )?;
        Ok(changed > 0)
    }

    /// 某 version 的 payload（历史重放入口）。
    pub fn pricing_snapshot_get(
        &self,
        pricing_version: &str,
    ) -> Result<Option<String>, AuthorityError> {
        Ok(self
            .conn
            .query_row(
                "SELECT payload_json FROM pricing_snapshots WHERE pricing_version = ?1",
                rusqlite::params![pricing_version],
                |r| r.get::<_, String>(0),
            )
            .optional()?)
    }

    /// 所有历史价格快照，按捕获时间升序。迁移读取旧版嵌入价表中的用户声明
    /// 时使用；调用方必须把提取出的个人数据写入本地表，不能重新塞回公共目录。
    pub fn pricing_snapshot_payloads(&self) -> Result<Vec<(String, String)>, AuthorityError> {
        let mut stmt = self.conn.prepare(
            "SELECT pricing_version, payload_json FROM pricing_snapshots
             ORDER BY captured_at_ms ASC, pricing_version ASC",
        )?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// `captured_at_ms` 最新的快照 `(version, captured_at_ms)`，或 None（从未落）。
    pub fn pricing_snapshot_latest(&self) -> Result<Option<(String, i64)>, AuthorityError> {
        Ok(self
            .conn
            .query_row(
                "SELECT pricing_version, captured_at_ms FROM pricing_snapshots
                 ORDER BY captured_at_ms DESC, pricing_version DESC LIMIT 1",
                [],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)),
            )
            .optional()?)
    }

    /// `captured_at_ms <= at_ms` 里最新的一份——「按事件时间点选价卡版本」
    /// （Q13：调价日前后分别用正确版本）。没有更早的快照 → None（不拿更晚的
    /// 版本冒充历史）。
    pub fn pricing_snapshot_asof(&self, at_ms: i64) -> Result<Option<String>, AuthorityError> {
        Ok(self
            .conn
            .query_row(
                "SELECT payload_json FROM pricing_snapshots
                 WHERE captured_at_ms <= ?1
                 ORDER BY captured_at_ms DESC, pricing_version DESC LIMIT 1",
                rusqlite::params![at_ms],
                |r| r.get::<_, String>(0),
            )
            .optional()?)
    }

    pub fn pricing_snapshot_count(&self) -> Result<i64, AuthorityError> {
        Ok(self
            .conn
            .query_row("SELECT COUNT(*) FROM pricing_snapshots", [], |r| r.get(0))?)
    }

    // ─────── v0.12：billing catalog/template snapshots ────────────────────

    /// 写入 catalog 快照。`catalog_version` 和 `snapshot_id` 都是不可变身份；
    /// 相同 version 的不同 payload 是调用方错误，不能静默改写历史计费解释。
    pub fn provider_catalog_snapshot_put(
        &self,
        catalog_version: &str,
        snapshot_id: &str,
        source_kind: &str,
        payload_json: &str,
        captured_at_ms: i64,
    ) -> Result<bool, AuthorityError> {
        if catalog_version.is_empty() || snapshot_id.is_empty() || source_kind.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "catalog_version, snapshot_id, and source_kind are required".to_string(),
            )
            .into());
        }
        let existing: Option<(String, String)> = self.conn.query_row(
            "SELECT snapshot_id, payload_json FROM provider_catalog_snapshots WHERE catalog_version = ?1",
            rusqlite::params![catalog_version],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).optional()?;
        if let Some((existing_id, existing_payload)) = existing {
            if existing_id == snapshot_id && existing_payload == payload_json {
                return Ok(false);
            }
            return Err(rusqlite::Error::InvalidParameterName(
                "catalog_version already names a different immutable snapshot".to_string(),
            ).into());
        }
        self.conn.execute(
            "INSERT INTO provider_catalog_snapshots(
               catalog_version, captured_at_ms, source_kind, snapshot_id, payload_json)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![catalog_version, captured_at_ms, source_kind, snapshot_id, payload_json],
        )?;
        Ok(true)
    }

    /// 原子写入公共 catalog 与其价格快照。两张表必须作为一个版本一起出现；
    /// 任一步违反不可变身份或外键约束，事务整体回滚，旧有效版本保持可读。
    #[allow(clippy::too_many_arguments)]
    pub fn pricing_catalog_snapshot_put(
        &self,
        catalog_version: &str,
        snapshot_id: &str,
        source_kind: &str,
        payload_json: &str,
        captured_at_ms: i64,
        billing_template_id: Option<&str>,
    ) -> Result<(bool, bool), AuthorityError> {
        self.conn.execute("BEGIN IMMEDIATE", [])?;
        let result = (|| {
            let catalog_changed = self.provider_catalog_snapshot_put(
                catalog_version,
                snapshot_id,
                source_kind,
                payload_json,
                captured_at_ms,
            )?;
            let pricing_changed = self.pricing_snapshot_put_with_provenance(
                catalog_version,
                source_kind,
                payload_json,
                captured_at_ms,
                Some(catalog_version),
                billing_template_id,
            )?;
            Ok::<_, AuthorityError>((catalog_changed, pricing_changed))
        })();
        match result {
            Ok(changed) => {
                self.conn.execute("COMMIT", [])?;
                Ok(changed)
            }
            Err(error) => {
                let _ = self.conn.execute("ROLLBACK", []);
                Err(error)
            }
        }
    }

    /// 落入一个模板定义。更新合同必须使用新的 template id；这里不接受覆盖。
    #[allow(clippy::too_many_arguments)]
    pub fn billing_template_put(
        &self,
        billing_template_id: &str,
        provider_id: &str,
        account_ref: Option<&str>,
        template_kind: &str,
        pricing_source: &str,
        effective_from_ms: i64,
        effective_to_ms: Option<i64>,
        created_at_ms: i64,
    ) -> Result<bool, AuthorityError> {
        if billing_template_id.is_empty() || provider_id.is_empty()
            || BillingTemplateKind::parse(template_kind).is_none()
            || PricingSource::parse(pricing_source).is_none()
            || effective_to_ms.is_some_and(|end| end < effective_from_ms) {
            return Err(rusqlite::Error::InvalidParameterName(
                "invalid immutable billing template".to_string(),
            ).into());
        }
        let existing: Option<BillingTemplateRow> = self.conn.query_row(
            "SELECT provider_id, account_ref, template_kind, pricing_source, effective_from_ms, effective_to_ms
             FROM billing_templates WHERE billing_template_id = ?1",
            rusqlite::params![billing_template_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
        ).optional()?;
        if let Some(existing) = existing {
            let expected = (provider_id.to_string(), account_ref.map(str::to_string),
                template_kind.to_string(), pricing_source.to_string(), effective_from_ms, effective_to_ms);
            if existing == expected {
                return Ok(false);
            }
            return Err(rusqlite::Error::InvalidParameterName(
                "billing_template_id already names a different immutable template".to_string(),
            ).into());
        }
        let changed = self.conn.execute(
            "INSERT INTO billing_templates(
               billing_template_id, provider_id, account_ref, template_kind, pricing_source,
               effective_from_ms, effective_to_ms, created_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(billing_template_id) DO NOTHING",
            rusqlite::params![billing_template_id, provider_id, account_ref, template_kind,
                pricing_source, effective_from_ms, effective_to_ms, created_at_ms],
        )?;
        Ok(changed > 0)
    }

    /// 保存模板在一个 catalog 版本下的冻结形态，供历史金额重放使用。
    pub fn billing_template_snapshot_put(
        &self,
        snapshot_id: &str,
        billing_template_id: &str,
        catalog_version: Option<&str>,
        payload_json: &str,
        captured_at_ms: i64,
    ) -> Result<bool, AuthorityError> {
        if snapshot_id.is_empty() || billing_template_id.is_empty() || payload_json.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "template snapshot id, template id, and payload are required".to_string(),
            ).into());
        }
        let existing: Option<(String, Option<String>, String)> = self.conn.query_row(
            "SELECT billing_template_id, catalog_version, payload_json
             FROM billing_template_snapshots WHERE snapshot_id = ?1",
            rusqlite::params![snapshot_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).optional()?;
        if let Some(existing) = existing {
            let expected = (billing_template_id.to_string(), catalog_version.map(str::to_string), payload_json.to_string());
            if existing == expected {
                return Ok(false);
            }
            return Err(rusqlite::Error::InvalidParameterName(
                "snapshot_id already names a different immutable template snapshot".to_string(),
            ).into());
        }
        let changed = self.conn.execute(
            "INSERT INTO billing_template_snapshots(
               snapshot_id, billing_template_id, catalog_version, captured_at_ms, payload_json)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(snapshot_id) DO NOTHING",
            rusqlite::params![snapshot_id, billing_template_id, catalog_version, captured_at_ms, payload_json],
        )?;
        Ok(changed > 0)
    }

    /// 写入一份可复算的 outcome measurement。相同 ID 只能重放完全相同的
    /// 证据，不允许以新算法或新金额覆盖历史 measurement。
    #[allow(clippy::too_many_arguments)]
    pub fn outcome_measurement_put(
        &self,
        measurement_id: &str,
        fact_set_fingerprint: &str,
        algorithm_version: &str,
        basis: &str,
        amount_minor: Option<i64>,
        currency: Option<&str>,
        measured_at_ms: i64,
        payload_json: &str,
    ) -> Result<bool, AuthorityError> {
        if measurement_id.is_empty() || fact_set_fingerprint.is_empty() || algorithm_version.is_empty()
            || !matches!(basis, "estimated" | "actual" | "realized")
            || amount_minor.is_some_and(|amount| amount < 0)
            || (amount_minor.is_some() != currency.is_some())
            || currency.is_some_and(str::is_empty) || payload_json.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "invalid outcome measurement".to_string(),
            ).into());
        }
        let existing: Option<OutcomeMeasurementRow> = self.conn.query_row(
            "SELECT fact_set_fingerprint, algorithm_version, basis, amount_minor, currency, payload_json
             FROM outcome_measurements WHERE measurement_id = ?1",
            rusqlite::params![measurement_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
        ).optional()?;
        if let Some(existing) = existing {
            let expected = (fact_set_fingerprint.to_string(), algorithm_version.to_string(), basis.to_string(),
                amount_minor, currency.map(str::to_string), payload_json.to_string());
            if existing == expected {
                return Ok(false);
            }
            return Err(rusqlite::Error::InvalidParameterName(
                "measurement_id already names a different immutable outcome".to_string(),
            ).into());
        }
        let changed = self.conn.execute(
            "INSERT INTO outcome_measurements(
               measurement_id, fact_set_fingerprint, algorithm_version, basis, amount_minor,
               currency, measured_at_ms, payload_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![measurement_id, fact_set_fingerprint, algorithm_version, basis,
                amount_minor, currency, measured_at_ms, payload_json],
        )?;
        Ok(changed > 0)
    }

    /// 写入 Savings 记录。estimated 永远不能被写作 actual/realized；后两者
    /// 必须引用同口径 measurement，防止 API 价差伪装成已实现节省。
    #[allow(clippy::too_many_arguments)]
    pub fn savings_record_put(
        &self,
        savings_id: &str,
        measurement_id: &str,
        billing_template_snapshot_id: Option<&str>,
        pricing_version: Option<&str>,
        amount_minor: i64,
        currency: &str,
        savings_basis: &str,
        created_at_ms: i64,
    ) -> Result<bool, AuthorityError> {
        if savings_id.is_empty() || measurement_id.is_empty() || amount_minor < 0 || currency.is_empty()
            || !matches!(savings_basis, "estimated" | "actual" | "realized") {
            return Err(rusqlite::Error::InvalidParameterName("invalid savings record".to_string()).into());
        }
        let measurement_basis: Option<String> = self.conn.query_row(
            "SELECT basis FROM outcome_measurements WHERE measurement_id = ?1",
            rusqlite::params![measurement_id], |r| r.get(0),
        ).optional()?;
        let Some(measurement_basis) = measurement_basis else {
            return Err(rusqlite::Error::InvalidParameterName("savings measurement does not exist".to_string()).into());
        };
        if savings_basis != "estimated" && measurement_basis != savings_basis {
            return Err(rusqlite::Error::InvalidParameterName(
                "actual or realized savings require an equally evidenced measurement".to_string(),
            ).into());
        }
        let existing = self.conn.query_row(
            "SELECT measurement_id, billing_template_snapshot_id, pricing_version,
                    amount_minor, currency, savings_basis
             FROM savings_records WHERE savings_id = ?1",
            rusqlite::params![savings_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
        ).optional()?;
        if let Some(existing) = existing {
            let incoming = (measurement_id.to_string(), billing_template_snapshot_id.map(str::to_string),
                pricing_version.map(str::to_string), amount_minor, currency.to_string(), savings_basis.to_string());
            if existing == incoming {
                return Ok(false);
            }
            return Err(rusqlite::Error::InvalidParameterName(
                "savings_id already names a different immutable savings record".to_string(),
            ).into());
        }
        let changed = self.conn.execute(
            "INSERT INTO savings_records(
               savings_id, measurement_id, billing_template_snapshot_id, pricing_version,
               amount_minor, currency, savings_basis, created_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(savings_id) DO NOTHING",
            rusqlite::params![savings_id, measurement_id, billing_template_snapshot_id,
                pricing_version, amount_minor, currency, savings_basis, created_at_ms],
        )?;
        Ok(changed > 0)
    }

    // ─────── v0.9.1 Phase 2.8：host_bills（spec §5.3 显式管理 API）───────
    // 宿主自身账单（WorkBuddy 积分、订阅月费、中转对账单…）——**不是**从我们
    // 的价卡派生，由用户显式录入，更新必须验证币种/账期/金额范围（§5.3）。

    /// 录一条宿主账单。`bill_id` = `{host}:{provider}:{period}:{basis}:{evidence_ref}`
    /// 的稳定构造（调用方给），同键 upsert（更正金额）。`amount_minor` 最小
    /// 货币单位整数（¥1.00 = 100）。校验：period `YYYY-MM`、basis 五档之一、
    /// amount_minor ≥ 0、currency 非空——不合格 `Err`（不猜不默认）。
    ///
    /// `evidence_ref` 是 `&str` 而不是 `Option`——空串就是"没有凭证引用"，**绝不存
    /// NULL**：SQLite 的 UNIQUE 里 NULL 互不相等，NULL 的 evidence_ref 会让
    /// `ON CONFLICT` 落空、同一 bill_id 第二次录入撞 PRIMARY KEY 报错而不是 upsert
    /// （`bill_id` 构造里的 `{evidence_ref}` 段同样是空串，两侧对齐）。
    #[allow(clippy::too_many_arguments)]
    pub fn host_bill_put(
        &self,
        bill_id: &str,
        host: &str,
        provider_id: &str,
        billing_period: &str,
        billing_basis: &str,
        amount_minor: i64,
        currency: &str,
        evidence_ref: &str,
        now_ms: i64,
    ) -> Result<(), AuthorityError> {
        let bad =
            |m: &str| AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(m.to_string()));
        if billing_period.len() != 7
            || billing_period.as_bytes()[4] != b'-'
            || !billing_period[..4].bytes().all(|c| c.is_ascii_digit())
            || !billing_period[5..].bytes().all(|c| c.is_ascii_digit())
        {
            return Err(bad("billing_period must be YYYY-MM"));
        }
        if !matches!(
            billing_basis,
            "fixed_subscription"
                | "host_billed"
                | "metered_actual"
                | "metered_estimate"
                | "api_equivalent"
        ) {
            return Err(bad("billing_basis not in the five-basis vocabulary"));
        }
        if amount_minor < 0 {
            return Err(bad("amount_minor must be >= 0"));
        }
        if currency.len() != 3 || !currency.bytes().all(|c| c.is_ascii_uppercase()) {
            return Err(bad("currency must be a three-letter uppercase code"));
        }
        self.conn.execute(
            "INSERT INTO host_bills(bill_id, host, provider_id, billing_period, billing_basis,
                 amount_minor, currency, evidence_ref, created_at_ms, updated_at_ms)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)
             ON CONFLICT(host, provider_id, billing_period, billing_basis, evidence_ref) DO UPDATE SET
                 amount_minor = excluded.amount_minor, currency = excluded.currency,
                 updated_at_ms = excluded.updated_at_ms, deleted_at_ms = NULL",
            rusqlite::params![
                bill_id, host, provider_id, billing_period, billing_basis,
                amount_minor, currency, evidence_ref, now_ms
            ],
        )?;
        Ok(())
    }

    /// 某账期的所有活账单行 `(host, provider_id, basis, amount_minor, currency)`。
    pub fn host_bills_for_period(
        &self,
        billing_period: &str,
    ) -> Result<Vec<HostBillRow>, AuthorityError> {
        let mut stmt = self.conn.prepare(
            "SELECT host, provider_id, billing_basis, amount_minor, currency FROM host_bills
             WHERE billing_period = ?1 AND deleted_at_ms IS NULL
             ORDER BY host, provider_id, billing_basis",
        )?;
        let rows = stmt
            .query_map(rusqlite::params![billing_period], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, String>(4)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// 带稳定 bill_id/evidence 的账单明细，供设置页更正或 soft-delete；
    /// 汇总仍使用上面的五列投影，避免把内部 id 扩散到旧 DTO。
    pub fn host_bill_details_for_period(
        &self, billing_period: &str,
    ) -> Result<Vec<HostBillDetailRow>, AuthorityError> {
        let mut stmt = self.conn.prepare(
            "SELECT bill_id, host, provider_id, billing_basis, amount_minor, currency, evidence_ref
             FROM host_bills WHERE billing_period = ?1 AND deleted_at_ms IS NULL
             ORDER BY host, provider_id, billing_basis, bill_id",
        )?;
        let rows = stmt.query_map(rusqlite::params![billing_period], |r| Ok((
            r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?,
        )))?.collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// soft delete（查询默认过滤 `deleted_at_ms IS NULL`）。
    pub fn host_bill_delete(&self, bill_id: &str, now_ms: i64) -> Result<bool, AuthorityError> {
        let n = self.conn.execute(
            "UPDATE host_bills SET deleted_at_ms = ?2 WHERE bill_id = ?1 AND deleted_at_ms IS NULL",
            rusqlite::params![bill_id, now_ms],
        )?;
        Ok(n > 0)
    }

    pub fn host_bill_count(&self) -> Result<i64, AuthorityError> {
        Ok(self.conn.query_row(
            "SELECT COUNT(*) FROM host_bills WHERE deleted_at_ms IS NULL",
            [],
            |r| r.get(0),
        )?)
    }

    /// 写入或更正本地计费声明。声明从不创建 `host_bills`，也不改写 facts。
    #[allow(clippy::too_many_arguments)]
    pub fn billing_declaration_put(
        &self, declaration_id: &str, host: &str, provider_id: &str, relationship_kind: &str,
        subscription_name: Option<&str>, amount_minor: Option<i64>, currency: Option<&str>,
        effective_start: &str, effective_end: Option<&str>, source_candidate_id: Option<&str>,
        evidence_ref: Option<&str>, now_ms: i64,
    ) -> Result<bool, AuthorityError> {
        let valid_kind = matches!(relationship_kind,
            "official_subscription" | "official_api" | "third_party" | "organization" | "unknown");
        let valid_amount = match (amount_minor, currency) {
            (None, None) => true,
            (Some(amount), Some(currency)) => amount >= 0 && !currency.trim().is_empty(),
            _ => false,
        };
        if declaration_id.is_empty() || host.is_empty() || provider_id.is_empty() || !valid_kind
            || !valid_amount || !valid_billing_boundary(effective_start)
            || effective_end.is_some_and(|end| {
                !valid_billing_boundary(end)
                    || billing_boundary_date(end, true) < billing_boundary_date(effective_start, false)
            })
        {
            return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                "invalid billing declaration".to_string(),
            )));
        }
        if let Some(candidate_id) = source_candidate_id {
            let candidate = self.conn.query_row(
                "SELECT host, provider_id, status FROM billing_import_candidates WHERE candidate_id = ?1",
                rusqlite::params![candidate_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)),
            ).optional()?;
            if !matches!(candidate, Some((ref candidate_host, ref candidate_provider, ref status))
                if candidate_host == host && candidate_provider == provider_id && status == "accepted")
            {
                return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                    "billing declaration candidate must be accepted and match host/provider".to_string(),
                )));
            }
        }
        let changed = self.conn.execute(
            "INSERT INTO billing_declarations(
                 declaration_id, host, provider_id, relationship_kind, subscription_name,
                 amount_minor, currency, effective_start, effective_end, source_candidate_id,
                 evidence_ref, created_at_ms, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)
             ON CONFLICT(declaration_id) DO UPDATE SET
               host = excluded.host, provider_id = excluded.provider_id,
               relationship_kind = excluded.relationship_kind,
               subscription_name = excluded.subscription_name, amount_minor = excluded.amount_minor,
               currency = excluded.currency, effective_start = excluded.effective_start,
               effective_end = excluded.effective_end, source_candidate_id = excluded.source_candidate_id,
               evidence_ref = excluded.evidence_ref, updated_at_ms = excluded.updated_at_ms,
               deleted_at_ms = NULL",
            rusqlite::params![declaration_id, host, provider_id, relationship_kind,
                subscription_name, amount_minor, currency, effective_start, effective_end,
                source_candidate_id, evidence_ref, now_ms],
        )?;
        Ok(changed > 0)
    }

    /// 活跃声明的稳定读取顺序；金额缺失保持 `None`，不以 0 或价卡代替。
    pub fn billing_declarations(&self) -> Result<Vec<BillingDeclarationRow>, AuthorityError> {
        let mut stmt = self.conn.prepare(
            "SELECT declaration_id, host, provider_id, relationship_kind, subscription_name,
                    amount_minor, currency, effective_start, effective_end, source_candidate_id
             FROM billing_declarations WHERE deleted_at_ms IS NULL
             ORDER BY host, provider_id, effective_start, declaration_id",
        )?;
        let rows = stmt.query_map([], |r| Ok((
            r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?,
            r.get(7)?, r.get(8)?, r.get(9)?,
        )))?.collect::<Result<Vec<_>, _>>().map_err(AuthorityError::from);
        rows
    }

    /// 释放被**已撤销**声明占住的旧资产候选。
    ///
    /// `billing_declarations.source_candidate_id` 上有 UNIQUE 约束，而 SQLite 的
    /// UNIQUE **对软删行照样生效**——撤销只置 `deleted_at_ms` 的话，那张候选就被一条
    /// 看不见的行永久锁住，用户再也声明不了它。2026-09-16 真机就是这个：撤销
    /// claude-code/anthropic 后重新声明同一张旧套餐记录 →
    /// `保存失败：authority sqlite: UNIQUE constraint failed:
    /// billing_declarations.source_candidate_id`。
    ///
    /// **撤销是不再生效，不是放弃这张候选**，所以候选回到 `pending`（可以重新确认，
    /// 也可以走「这不是我的套餐」→ dismissed，那是另一条路）。声明侧的溯源不丢：
    /// `billing_declaration_revisions.source_candidate_id` 没有 UNIQUE、逐条留痕，
    /// 撤销修订本身就是带着它写进去的。
    fn release_revoked_candidate_claims(&self, candidate_id: &str) -> Result<(), AuthorityError> {
        self.conn.execute(
            "UPDATE billing_declarations SET source_candidate_id = NULL
             WHERE source_candidate_id = ?1 AND deleted_at_ms IS NOT NULL",
            rusqlite::params![candidate_id],
        )?;
        self.conn.execute(
            "UPDATE billing_import_candidates SET status = 'pending', resolved_at_ms = NULL
             WHERE candidate_id = ?1 AND status = 'accepted'",
            rusqlite::params![candidate_id],
        )?;
        Ok(())
    }

    /// 保存一个追加式声明修订。作用范围只能缩小到已指定的账户、路由、模型或
    /// 会话；空范围表示仅由声明本身的宿主/provider/有效期约束，绝不扩大历史。
    #[allow(clippy::too_many_arguments)]
    pub fn billing_declaration_revision_save(
        &self, revision_id: &str, declaration_id: &str, supersedes_revision_id: Option<&str>,
        host: &str, provider_id: &str, relationship_kind: &str, subscription_name: Option<&str>,
        amount_minor: Option<i64>, currency: Option<&str>, effective_start: &str,
        effective_end: Option<&str>, source_candidate_id: Option<&str>, evidence_ref: Option<&str>,
        scopes: &[(&str, &str)], now_ms: i64,
    ) -> Result<bool, AuthorityError> {
        let valid_kind = matches!(relationship_kind,
            "official_subscription" | "official_api" | "third_party" | "organization" | "unknown");
        let valid_amount = match (amount_minor, currency) {
            (None, None) => true,
            (Some(amount), Some(value)) => amount >= 0 && !value.trim().is_empty(),
            _ => false,
        };
        let valid_scope = |kind: &str, value: &str| {
            (matches!(kind, "account" | "route" | "model" | "session") && !value.trim().is_empty())
                || (kind == "provider" && value == "unresolved")
        };
        if revision_id.is_empty() || declaration_id.is_empty() || host.is_empty() || provider_id.is_empty()
            || !valid_kind || !valid_amount || !valid_billing_boundary(effective_start)
            || effective_end.is_some_and(|end| {
                !valid_billing_boundary(end)
                    || billing_boundary_date(end, true) < billing_boundary_date(effective_start, false)
            })
            || scopes.iter().any(|(kind, value)| !valid_scope(kind, value))
        {
            return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                "invalid billing declaration revision".to_string(),
            )));
        }
        let mut seen_scopes = std::collections::HashSet::new();
        if scopes.iter().any(|(kind, value)| !seen_scopes.insert((*kind, *value))) {
            return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                "duplicate billing declaration scope".to_string(),
            )));
        }
        self.conn.execute_batch("BEGIN IMMEDIATE")?;
        let result = (|| -> Result<bool, AuthorityError> {
            let exists: Option<i64> = self.conn.query_row(
                "SELECT 1 FROM billing_declaration_revisions WHERE revision_id = ?1",
                rusqlite::params![revision_id], |row| row.get(0),
            ).optional()?;
            if exists.is_some() {
                return Ok(false);
            }
            if let Some(candidate_id) = source_candidate_id {
                // 撤销过的声明不该继续占着这张候选（见 `release_revoked_candidate_claims`）：
                // 先释放它，再按「一张候选只归一条**有效**声明」的约束往下走。
                self.release_revoked_candidate_claims(candidate_id)?;
                let candidate = self.conn.query_row(
                    "SELECT host, provider_id, status FROM billing_import_candidates WHERE candidate_id = ?1",
                    rusqlite::params![candidate_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)),
                ).optional()?;
                let Some((candidate_host, candidate_provider, status)) = candidate else {
                    return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                        "billing declaration candidate must be accepted and match host/provider".to_string(),
                    )));
                };
                if candidate_host != host || candidate_provider != provider_id
                    || !matches!(status.as_str(), "pending" | "accepted")
                {
                    return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                        "billing declaration candidate must be pending/accepted and match host/provider".to_string(),
                    )));
                }
                // 同一张候选被两条**有效**声明同时占用是约束本身要挡的（一张旧套餐记录
                // 只对应一条声明）。这里先判一次只为把话说清楚——不然用户看到的是裸的
                // `UNIQUE constraint failed: billing_declarations.source_candidate_id`。
                let claimed: Option<String> = self.conn.query_row(
                    "SELECT declaration_id FROM billing_declarations
                     WHERE source_candidate_id = ?1 AND deleted_at_ms IS NULL AND declaration_id <> ?2
                     LIMIT 1",
                    rusqlite::params![candidate_id, declaration_id], |row| row.get(0),
                ).optional()?;
                if claimed.is_some() {
                    return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                        "this legacy package record is already used by another live declaration; revoke that one first".to_string(),
                    )));
                }
                if status == "pending" {
                    self.conn.execute(
                        "UPDATE billing_import_candidates
                         SET status = 'accepted', resolved_at_ms = ?2, updated_at_ms = ?2
                         WHERE candidate_id = ?1 AND status = 'pending'",
                        rusqlite::params![candidate_id, now_ms],
                    )?;
                }
            }
            let previous: Option<(String, i64)> = self.conn.query_row(
                "SELECT revision_id, revision_number FROM billing_declaration_revisions
                 WHERE declaration_id = ?1 ORDER BY revision_number DESC LIMIT 1",
                rusqlite::params![declaration_id], |row| Ok((row.get(0)?, row.get(1)?)),
            ).optional()?;
            let revision_number = match previous {
                Some((ref current, number)) if supersedes_revision_id == Some(current.as_str()) => number + 1,
                Some(_) => return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                    "billing declaration revision must supersede the current revision".to_string(),
                ))),
                None if supersedes_revision_id.is_none() => 1,
                None => return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                    "first billing declaration revision cannot supersede another revision".to_string(),
                ))),
            };
            self.conn.execute(
                "INSERT INTO billing_declarations(
                     declaration_id, host, provider_id, relationship_kind, subscription_name,
                     amount_minor, currency, effective_start, effective_end, source_candidate_id,
                     evidence_ref, created_at_ms, updated_at_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)
                 ON CONFLICT(declaration_id) DO UPDATE SET
                   host = excluded.host, provider_id = excluded.provider_id,
                   relationship_kind = excluded.relationship_kind, subscription_name = excluded.subscription_name,
                   amount_minor = excluded.amount_minor, currency = excluded.currency,
                   effective_start = excluded.effective_start, effective_end = excluded.effective_end,
                   source_candidate_id = excluded.source_candidate_id, evidence_ref = excluded.evidence_ref,
                   updated_at_ms = excluded.updated_at_ms, deleted_at_ms = NULL",
                rusqlite::params![declaration_id, host, provider_id, relationship_kind,
                    subscription_name, amount_minor, currency, effective_start, effective_end,
                    source_candidate_id, evidence_ref, now_ms],
            )?;
            self.conn.execute(
                "INSERT INTO billing_declaration_revisions(
                     revision_id, declaration_id, revision_number, change_kind, supersedes_revision_id,
                     host, provider_id, relationship_kind, subscription_name, amount_minor, currency,
                     effective_start, effective_end, source_candidate_id, evidence_ref, created_at_ms)
                 VALUES (?1, ?2, ?3, 'saved', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
                rusqlite::params![revision_id, declaration_id, revision_number, supersedes_revision_id,
                    host, provider_id, relationship_kind, subscription_name, amount_minor, currency,
                    effective_start, effective_end, source_candidate_id, evidence_ref, now_ms],
            )?;
            for (scope_kind, scope_value) in scopes {
                self.conn.execute(
                    "INSERT INTO billing_declaration_scopes(revision_id, scope_kind, scope_value)
                     VALUES (?1, ?2, ?3)",
                    rusqlite::params![revision_id, scope_kind, scope_value],
                )?;
            }
            Ok(true)
        })();
        match result {
            Ok(changed) => { self.conn.execute_batch("COMMIT")?; Ok(changed) }
            Err(error) => { let _ = self.conn.execute_batch("ROLLBACK"); Err(error) }
        }
    }

    /// 撤销不删除声明历史：追加 `revoked` 修订，复制最近范围，并使当前态失效。
    pub fn billing_declaration_revision_revoke(
        &self, revision_id: &str, declaration_id: &str, supersedes_revision_id: &str, now_ms: i64,
    ) -> Result<bool, AuthorityError> {
        if revision_id.is_empty() || declaration_id.is_empty() || supersedes_revision_id.is_empty() {
            return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                "invalid billing declaration revoke".to_string(),
            )));
        }
        self.conn.execute_batch("BEGIN IMMEDIATE")?;
        let result = (|| -> Result<bool, AuthorityError> {
            let exists: Option<i64> = self.conn.query_row(
                "SELECT 1 FROM billing_declaration_revisions WHERE revision_id = ?1",
                rusqlite::params![revision_id], |row| row.get(0),
            ).optional()?;
            if exists.is_some() { return Ok(false); }
            let prior: Option<BillingDeclarationRevisionSnapshot> = self.conn.query_row(
                "SELECT revision_number, host, provider_id, relationship_kind, subscription_name,
                        amount_minor, currency, effective_start, effective_end, source_candidate_id, evidence_ref
                 FROM billing_declaration_revisions
                 WHERE revision_id = ?1 AND declaration_id = ?2 AND change_kind = 'saved'",
                rusqlite::params![supersedes_revision_id, declaration_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?,
                    row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?)),
            ).optional()?;
            let Some((number, host, provider_id, relationship_kind, subscription_name, amount_minor, currency,
                effective_start, effective_end, source_candidate_id, evidence_ref)) = prior else {
                return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                    "billing declaration revoke must supersede the active revision".to_string(),
                )));
            };
            // 撤销要释放它占的旧资产候选；下面写撤销修订时会把 `source_candidate_id`
            // 移进参数列表，所以先留一份。
            let revoked_candidate_id = source_candidate_id.clone();
            let current: Option<String> = self.conn.query_row(
                "SELECT revision_id FROM billing_declaration_revisions WHERE declaration_id = ?1
                 ORDER BY revision_number DESC LIMIT 1", rusqlite::params![declaration_id], |row| row.get(0),
            ).optional()?;
            if current.as_deref() != Some(supersedes_revision_id) {
                return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                    "billing declaration revoke must supersede the current revision".to_string(),
                )));
            }
            self.conn.execute(
                "INSERT INTO billing_declaration_revisions(
                     revision_id, declaration_id, revision_number, change_kind, supersedes_revision_id,
                     host, provider_id, relationship_kind, subscription_name, amount_minor, currency,
                     effective_start, effective_end, source_candidate_id, evidence_ref, created_at_ms)
                 VALUES (?1, ?2, ?3, 'revoked', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
                rusqlite::params![revision_id, declaration_id, number + 1, supersedes_revision_id,
                    host, provider_id, relationship_kind, subscription_name, amount_minor, currency,
                    effective_start, effective_end, source_candidate_id, evidence_ref, now_ms],
            )?;
            self.conn.execute(
                "INSERT INTO billing_declaration_scopes(revision_id, scope_kind, scope_value)
                 SELECT ?1, scope_kind, scope_value FROM billing_declaration_scopes WHERE revision_id = ?2",
                rusqlite::params![revision_id, supersedes_revision_id],
            )?;
            self.conn.execute(
                "UPDATE billing_declarations SET deleted_at_ms = ?2, updated_at_ms = ?2
                 WHERE declaration_id = ?1 AND deleted_at_ms IS NULL",
                rusqlite::params![declaration_id, now_ms],
            )?;
            // 撤销必须**释放**它占的旧资产候选——`source_candidate_id` 上的 UNIQUE 对软删
            // 行照样生效，只置 `deleted_at_ms` 会把那张候选永久锁在一条看不见的行上
            // （见 `release_revoked_candidate_claims` 的注释）。
            if let Some(candidate_id) = revoked_candidate_id.as_deref() {
                self.release_revoked_candidate_claims(candidate_id)?;
            }
            Ok(true)
        })();
        match result {
            Ok(changed) => { self.conn.execute_batch("COMMIT")?; Ok(changed) }
            Err(error) => { let _ = self.conn.execute_batch("ROLLBACK"); Err(error) }
        }
    }

    pub fn billing_declaration_revisions(
        &self, declaration_id: &str,
    ) -> Result<Vec<BillingDeclarationRevisionRow>, AuthorityError> {
        let mut stmt = self.conn.prepare(
            "SELECT revision_id, declaration_id, revision_number, change_kind, supersedes_revision_id,
                    host, provider_id, relationship_kind, subscription_name, amount_minor, currency,
                    effective_start, effective_end, source_candidate_id, evidence_ref, created_at_ms
             FROM billing_declaration_revisions WHERE declaration_id = ?1 ORDER BY revision_number",
        )?;
        let rows = stmt.query_map(rusqlite::params![declaration_id], |row| Ok((
            row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?,
            row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?, row.get(11)?,
            row.get(12)?, row.get(13)?, row.get(14)?, row.get(15)?,
        )))?.collect::<Result<Vec<_>, _>>().map_err(AuthorityError::from);
        rows
    }

    pub fn billing_declaration_scopes(
        &self, revision_id: &str,
    ) -> Result<Vec<BillingDeclarationScopeRow>, AuthorityError> {
        let mut stmt = self.conn.prepare(
            "SELECT revision_id, scope_kind, scope_value FROM billing_declaration_scopes
             WHERE revision_id = ?1 ORDER BY scope_kind, scope_value",
        )?;
        let rows = stmt.query_map(rusqlite::params![revision_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?.collect::<Result<Vec<_>, _>>().map_err(AuthorityError::from);
        rows
    }

    /// 只读计算声明修订将触及哪些事实；不写任何派生结果。`window` 只给
    /// 「本月涉及」一类展示用；预览与重算（`None`）都走声明自己的有效期。
    pub fn billing_declaration_impact_preview(
        &self, revision_id: &str, window: Option<(i64, i64)>,
    ) -> Result<BillingDeclarationImpactPreview, AuthorityError> {
        let revision: Option<(String, String, String, String, Option<String>)> = self.conn.query_row(
            "SELECT host, provider_id, effective_start, change_kind, effective_end
             FROM billing_declaration_revisions WHERE revision_id = ?1",
            rusqlite::params![revision_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        ).optional()?;
        let Some((host, provider_id, effective_start, change_kind, effective_end)) = revision else {
            return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                "unknown billing declaration revision".to_string(),
            )));
        };
        if change_kind == "revoked" {
            return Ok(BillingDeclarationImpactPreview::default());
        }
        let scopes = self.billing_declaration_scopes(revision_id)?;
        let scope_refs = scopes.iter()
            .map(|(_, kind, value)| (kind.as_str(), value.as_str()))
            .collect::<Vec<_>>();
        self.billing_declaration_impact_preview_for(
            &host, &provider_id, &effective_start, effective_end.as_deref(), &scope_refs, window,
        )
    }

    /// Preview a prospective declaration before it is persisted. This is the
    /// dry-run counterpart to `billing_declaration_impact_preview`: the UI can
    /// show the affected facts/sessions/tokens before accepting a candidate,
    /// without creating a saved revision or changing candidate status.
    ///
    /// 与 [`Self::billing_declaration_matching_fact_ids`] 共用
    /// [`billing_declaration_fact_selection`]——预览命中的事实集合就是重算会归因的
    /// 集合，这是计费主链规格 R1 钉住的不变量（此前预览按前端传入的统计月窗口、
    /// 重算按全历史，两者对不上）。
    pub fn billing_declaration_impact_preview_for(
        &self, host: &str, provider_id: &str, effective_start: &str,
        effective_end: Option<&str>, scopes: &[(&str, &str)], window: Option<(i64, i64)>,
    ) -> Result<BillingDeclarationImpactPreview, AuthorityError> {
        if window.is_some_and(|(start, end)| end <= start) {
            return Ok(BillingDeclarationImpactPreview::default());
        }
        let aggregate = |conflicts: ConflictEvidence| -> Result<PreviewAggregate, AuthorityError> {
            let selection = billing_declaration_fact_selection(
                host, provider_id, effective_start, effective_end, scopes, window, conflicts,
            );
            let sql = format!(
                "SELECT COUNT(*), COUNT(DISTINCT f.session_key),
                        COALESCE(SUM(f.uncached_input_tokens + f.cache_read_tokens
                            + f.cache_write_tokens + f.output_tokens), 0),
                        MIN(f.event_ts_ms), MAX(f.event_ts_ms)
                 {BILLING_DECLARATION_FACT_FROM} WHERE {}",
                selection.where_sql,
            );
            Ok(self.conn.query_row(
                &sql, rusqlite::params_from_iter(selection.params.iter()),
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )?)
        };
        let (fact_count, session_count, total_tokens, first, last) = aggregate(ConflictEvidence::Exclude)?;
        let (conflict_fact_count, _, conflict_tokens, _, _) = aggregate(ConflictEvidence::Only)?;
        Ok(BillingDeclarationImpactPreview {
            fact_count, session_count, total_tokens,
            first_event_ts_ms: first, last_event_ts_ms: last,
            conflict_fact_count, conflict_tokens,
        })
    }

    fn billing_declaration_matching_fact_ids(&self, revision_id: &str) -> Result<Vec<String>, AuthorityError> {
        let revision: (String, String, String, Option<String>) = self.conn.query_row(
            "SELECT host, provider_id, effective_start, effective_end FROM billing_declaration_revisions WHERE revision_id = ?1 AND change_kind = 'saved'",
            rusqlite::params![revision_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;
        let scopes = self.billing_declaration_scopes(revision_id)?;
        let scope_refs = scopes.iter()
            .map(|(_, kind, value)| (kind.as_str(), value.as_str()))
            .collect::<Vec<_>>();
        let selection = billing_declaration_fact_selection(
            &revision.0, &revision.1, &revision.2, revision.3.as_deref(), &scope_refs, None,
            ConflictEvidence::Exclude,
        );
        let sql = format!(
            "SELECT f.fact_id {BILLING_DECLARATION_FACT_FROM} WHERE {} ORDER BY f.fact_id",
            selection.where_sql,
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(selection.params.iter()), |row| row.get(0))?;
        rows.collect::<Result<Vec<String>, _>>().map_err(AuthorityError::from)
    }

    pub fn billing_recalculation_enqueue(
        &self, job_id: &str, declaration_id: &str, revision_id: &str, now_ms: i64,
    ) -> Result<bool, AuthorityError> {
        if job_id.is_empty() || declaration_id.is_empty() || revision_id.is_empty() {
            return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName("invalid recalculation job".to_string())));
        }
        let valid: Option<String> = self.conn.query_row(
            "SELECT change_kind FROM billing_declaration_revisions WHERE revision_id = ?1 AND declaration_id = ?2",
            rusqlite::params![revision_id, declaration_id], |row| row.get(0),
        ).optional()?;
        if valid.as_deref() != Some("saved") {
            return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName("recalculation requires a saved declaration revision".to_string())));
        }
        let changed = self.conn.execute(
            "INSERT INTO billing_recalculation_jobs(job_id, declaration_id, revision_id, status, requested_at_ms)
             VALUES (?1, ?2, ?3, 'queued', ?4) ON CONFLICT(revision_id) DO NOTHING",
            rusqlite::params![job_id, declaration_id, revision_id, now_ms],
        )?;
        Ok(changed > 0)
    }

    pub fn billing_recalculation_set_status(
        &self, job_id: &str, status: &str, error_code: Option<&str>, error_detail: Option<&str>, now_ms: i64,
    ) -> Result<bool, AuthorityError> {
        if !matches!(status, "running" | "succeeded" | "failed" | "cancelled") {
            return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName("invalid recalculation status".to_string())));
        }
        let changed = self.conn.execute(
            "UPDATE billing_recalculation_jobs SET status = ?2,
                 started_at_ms = CASE WHEN ?2 = 'running' THEN COALESCE(started_at_ms, ?5) ELSE started_at_ms END,
                 completed_at_ms = CASE WHEN ?2 IN ('succeeded', 'failed', 'cancelled') THEN ?5 ELSE completed_at_ms END,
                 error_code = ?3, error_detail = ?4 WHERE job_id = ?1 AND status IN ('queued', 'running')",
            rusqlite::params![job_id, status, error_code, error_detail, now_ms],
        )?;
        Ok(changed > 0)
    }

    /// 失败或取消的任务可由用户显式重试；成功任务不回退，避免重试按钮
    /// 改写已经发布的结果版本。任务 id 保持不变，结果快照仍可追溯。
    pub fn billing_recalculation_retry(
        &self, job_id: &str, now_ms: i64,
    ) -> Result<bool, AuthorityError> {
        let changed = self.conn.execute(
            "UPDATE billing_recalculation_jobs SET status = 'queued',
                 completed_at_ms = NULL, error_code = NULL, error_detail = NULL,
                 requested_at_ms = ?2
             WHERE job_id = ?1 AND status IN ('failed', 'cancelled')",
            rusqlite::params![job_id, now_ms],
        )?;
        Ok(changed > 0)
    }

    /// 应用重启时恢复任务队列：把上次进程中断的 running 任务标为失败，
    /// 再返回仍待执行的 queued 任务，由宿主启动 worker。只改变任务状态，
    /// 不触碰事实、结果快照或归因表。
    pub fn billing_recalculation_recover(
        &self, now_ms: i64,
    ) -> Result<Vec<String>, AuthorityError> {
        self.conn.execute(
            "UPDATE billing_recalculation_jobs SET status = 'failed',
                 completed_at_ms = ?1, error_code = COALESCE(error_code, 'interrupted'),
                 error_detail = COALESCE(error_detail, 'worker interrupted by app restart')
             WHERE status = 'running'",
            rusqlite::params![now_ms],
        )?;
        let mut stmt = self.conn.prepare(
            "SELECT job_id FROM billing_recalculation_jobs
             WHERE status = 'queued' ORDER BY requested_at_ms, job_id",
        )?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect::<Result<Vec<String>, _>>().map_err(AuthorityError::from)
    }

    pub fn billing_recalculation_job(
        &self, job_id: &str,
    ) -> Result<Option<BillingRecalculationJobRow>, AuthorityError> {
        Ok(self.conn.query_row(
            "SELECT job_id, declaration_id, revision_id, status, requested_at_ms, started_at_ms,
                    completed_at_ms, error_code, error_detail FROM billing_recalculation_jobs WHERE job_id = ?1",
            rusqlite::params![job_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
                row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?)),
        ).optional()?)
    }

    /// 返回尚未成功发布结果的任务，供工作台在重启后显示可恢复状态。
    /// 成功任务不进入此列表，旧结果仍通过 billing_recalculation_result 可查。
    pub fn billing_recalculation_jobs_needing_attention(
        &self,
    ) -> Result<Vec<BillingRecalculationJobRow>, AuthorityError> {
        let mut stmt = self.conn.prepare(
            "SELECT job_id, declaration_id, revision_id, status, requested_at_ms, started_at_ms,
                    completed_at_ms, error_code, error_detail
             FROM billing_recalculation_jobs
             WHERE status IN ('queued', 'running', 'failed', 'cancelled')
             ORDER BY requested_at_ms, job_id",
        )?;
        let rows = stmt.query_map([], |row| Ok((
            row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?,
            row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?,
        )))?;
        rows.collect::<Result<Vec<BillingRecalculationJobRow>, _>>().map_err(AuthorityError::from)
    }

    /// 执行一个只读聚合型重算任务并原子发布结果快照；原始 facts 与旧结果不变。
    pub fn billing_recalculation_run(
        &self, job_id: &str, now_ms: i64,
    ) -> Result<bool, AuthorityError> {
        let job = self.billing_recalculation_job(job_id)?;
        let Some((_, _, revision_id, status, _, _, _, _, _)) = job else { return Ok(false); };
        if status != "queued" { return Ok(false); }
        self.billing_recalculation_set_status(job_id, "running", None, None, now_ms)?;
        let preview = match self.billing_declaration_impact_preview(&revision_id, None) {
            Ok(value) => value,
            Err(error) => {
                self.billing_recalculation_set_status(job_id, "failed", Some("preview_failed"), Some("impact preview failed"), now_ms)?;
                return Err(error);
            }
        };
        let fact_ids = match self.billing_declaration_matching_fact_ids(&revision_id) {
            Ok(fact_ids) => fact_ids,
            Err(error) => {
                let detail = error.to_string();
                let _ = self.billing_recalculation_set_status(
                    job_id, "failed", Some("fact_match_failed"), Some(&detail), now_ms,
                );
                return Err(error);
            }
        };
        let attribution_kind: String = match self.conn.query_row(
            "SELECT CASE WHEN relationship_kind = 'official_subscription' THEN 'subscription_covered' ELSE 'user_declared' END
             FROM billing_declaration_revisions WHERE revision_id = ?1",
            rusqlite::params![revision_id], |row| row.get(0),
        ) {
            Ok(kind) => kind,
            Err(error) => {
                let detail = error.to_string();
                let _ = self.billing_recalculation_set_status(
                    job_id, "failed", Some("attribution_kind_failed"), Some(&detail), now_ms,
                );
                return Err(error.into());
            }
        };
        if let Err(error) = self.conn.execute_batch("BEGIN IMMEDIATE") {
            let detail = error.to_string();
            let _ = self.billing_recalculation_set_status(
                job_id, "failed", Some("transaction_start_failed"), Some(&detail), now_ms,
            );
            return Err(error.into());
        }
        let transaction_result = (|| -> Result<(), rusqlite::Error> {
            self.conn.execute(
                "INSERT INTO billing_recalculation_results(
                     job_id, revision_id, fact_count, session_count, total_tokens,
                     first_event_ts_ms, last_event_ts_ms, published_at_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(job_id) DO UPDATE SET published_at_ms = excluded.published_at_ms",
                rusqlite::params![job_id, revision_id, preview.fact_count, preview.session_count,
                    preview.total_tokens, preview.first_event_ts_ms, preview.last_event_ts_ms, now_ms],
            )?;
            for fact_id in fact_ids {
                self.conn.execute(
                    "INSERT INTO billing_fact_attributions(fact_id, revision_id, job_id, attribution_kind, created_at_ms)
                     VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(fact_id, revision_id) DO NOTHING",
                    rusqlite::params![fact_id, revision_id, job_id, attribution_kind, now_ms],
                )?;
            }
            self.conn.execute(
                "UPDATE billing_recalculation_jobs SET status = 'succeeded', completed_at_ms = ?2
                 WHERE job_id = ?1 AND status = 'running'", rusqlite::params![job_id, now_ms],
            )?;
            self.conn.execute_batch("COMMIT")?;
            Ok(())
        })();
        match transaction_result {
            Ok(()) => Ok(true),
            Err(error) => {
                let _ = self.conn.execute_batch("ROLLBACK");
                let detail = error.to_string();
                let _ = self.billing_recalculation_set_status(
                    job_id, "failed", Some("transaction_failed"), Some(&detail), now_ms,
                );
                Err(error.into())
            }
        }
    }

    pub fn billing_recalculation_result(
        &self, job_id: &str,
    ) -> Result<Option<BillingRecalculationResultRow>, AuthorityError> {
        Ok(self.conn.query_row(
            "SELECT job_id, revision_id, fact_count, session_count, total_tokens,
                    first_event_ts_ms, last_event_ts_ms, published_at_ms
             FROM billing_recalculation_results WHERE job_id = ?1",
            rusqlite::params![job_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
                row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?)),
        ).optional()?)
    }

    /// 幂等写入一个待确认的旧订阅候选。相同候选不会重复；候选永远不写入
    /// `host_bills`，必须由上层获得用户确认后另走明确账单写入。
    #[allow(clippy::too_many_arguments)]
    pub fn billing_import_candidate_put(
        &self,
        candidate_id: &str,
        host: &str,
        provider_id: &str,
        currency: &str,
        amount_minor: i64,
        billing_period_start: &str,
        source_pricing_version: &str,
        now_ms: i64,
    ) -> Result<bool, AuthorityError> {
        if candidate_id.is_empty() || host.is_empty() || provider_id.is_empty()
            || currency.trim().is_empty() || amount_minor < 0
            || billing_period_start.len() != 7 || source_pricing_version.is_empty()
        {
            return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                "invalid billing import candidate".to_string(),
            )));
        }
        let changed = self.conn.execute(
            "INSERT INTO billing_import_candidates(
                 candidate_id, host, provider_id, currency, amount_minor, billing_period_start,
                 source_pricing_version, status, created_at_ms, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?8)
             ON CONFLICT(candidate_id) DO NOTHING",
            rusqlite::params![candidate_id, host, provider_id, currency, amount_minor,
                billing_period_start, source_pricing_version, now_ms],
        )?;
        Ok(changed > 0)
    }

    pub fn pending_billing_import_candidates(
        &self,
    ) -> Result<Vec<BillingImportCandidateRow>, AuthorityError> {
        Ok(self.billing_import_candidates()?.into_iter()
            .filter(|row| row.6 == "pending").collect())
    }

    /// 所有旧资产候选（含用户已决定项）。已决定项仍需可见，才能提供可核对
    /// 的回执与撤销入口；它们不参与同步生成或实际支出计算。
    pub fn billing_import_candidates(
        &self,
    ) -> Result<Vec<BillingImportCandidateRow>, AuthorityError> {
        let mut stmt = self.conn.prepare(
            "SELECT candidate_id, host, provider_id, currency, amount_minor, billing_period_start, status
             FROM billing_import_candidates
             ORDER BY provider_id, billing_period_start, candidate_id",
        )?;
        let rows = stmt.query_map([], |r| Ok((
            r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?,
            r.get::<_, String>(3)?, r.get::<_, i64>(4)?, r.get::<_, String>(5)?,
            r.get::<_, String>(6)?,
        )))?.collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// 用户对旧资产候选作出的本地决定。`accepted` 只确认“这是我的套餐
    /// 声明”，并不创建付款/账单；`dismissed` 表示该候选不属于当前用户。
    /// 两种决定都不可再被后续同步重新变回 pending。
    pub fn billing_import_candidate_resolve(
        &self,
        candidate_id: &str,
        status: &str,
        now_ms: i64,
    ) -> Result<bool, AuthorityError> {
        if !matches!(status, "accepted" | "dismissed") {
            return Err(AuthorityError::Sqlite(rusqlite::Error::InvalidParameterName(
                "billing candidate status must be accepted or dismissed".to_string(),
            )));
        }
        Ok(self.conn.execute(
            "UPDATE billing_import_candidates
             SET status = ?2, updated_at_ms = ?3, resolved_at_ms = ?3
             WHERE candidate_id = ?1 AND status = 'pending'",
            rusqlite::params![candidate_id, status, now_ms],
        )? > 0)
    }

    /// 用户主动撤销刚才的候选决定，恢复为待确认。同步不会调用该方法，故不会
    /// 擅自推翻用户决定；撤销同样不涉及付款或账单。
    pub fn billing_import_candidate_reopen(
        &self,
        candidate_id: &str,
        now_ms: i64,
    ) -> Result<bool, AuthorityError> {
        Ok(self.conn.execute(
            "UPDATE billing_import_candidates
             SET status = 'pending', updated_at_ms = ?2, resolved_at_ms = NULL
             WHERE candidate_id = ?1 AND status IN ('accepted', 'dismissed')",
            rusqlite::params![candidate_id, now_ms],
        )? > 0)
    }

    /// 将先前错误自动导入的旧价表账单撤回。仅匹配专用 evidence 标签，绝不
    /// 触碰用户手工录入的账单。
    pub fn revoke_legacy_pricing_host_bills(&self, now_ms: i64) -> Result<usize, AuthorityError> {
        Ok(self.conn.execute(
            "UPDATE host_bills SET deleted_at_ms = ?1
             WHERE evidence_ref = 'legacy-pricing-catalog' AND deleted_at_ms IS NULL",
            rusqlite::params![now_ms],
        )?)
    }

    /// `BEGIN IMMEDIATE` 事务帮助器：闭包成功 → COMMIT，Err → ROLLBACK 后
    /// 原样上抛。**所有业务写入都必须走这里**（spec §5.1.4——事务边界是
    /// 写入协议的一部分，不是调用方的自由裁量）。
    pub fn with_immediate_txn<T>(
        &self,
        f: impl FnOnce(&Connection) -> Result<T, AuthorityError>,
    ) -> Result<T, AuthorityError> {
        self.conn.execute_batch("BEGIN IMMEDIATE")?;
        match f(&self.conn) {
            Ok(v) => {
                self.conn.execute_batch("COMMIT")?;
                Ok(v)
            }
            Err(e) => {
                let _ = self.conn.execute_batch("ROLLBACK");
                Err(e)
            }
        }
    }

    /// 只读连接访问（查询面在 Phase 3 接 repository；Phase 2 的 writer 也
    /// 走 with_immediate_txn——这个 getter 仅供测试与迁移框架）。
    /// 读取一份宿主实时快照；调用方负责反序列化，并把损坏 payload 当数据质量
    /// 问题而不是回落读取原始日志。
    pub fn runtime_snapshot_get(
        &self,
        host: &str,
        snapshot_kind: &str,
    ) -> Result<Option<(String, i64)>, AuthorityError> {
        self.conn
            .query_row(
                "SELECT payload_json, observed_at_ms FROM host_runtime_snapshots
                 WHERE host = ?1 AND snapshot_kind = ?2",
                rusqlite::params![host, snapshot_kind],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(AuthorityError::from)
    }

    /// 写入一份宿主实时快照（`codex_quota` 之外的第二类消费方：Claude Pro 的
    /// 窗口状态）。
    ///
    /// **只让更新的快照覆盖旧的**（`WHERE excluded.observed_at_ms >= ...`）——
    /// 与 Codex 那条同一条纪律：扫描是跨文件取最新，但不同批次到达顺序不保证，
    /// 没有这个守卫就会出现"旧观察覆盖新观察"，而窗口状态恰恰是**越新越准**的
    /// 东西（重置时刻会往后推）。
    ///
    /// 返回是否真的写入（`false` = 已有更新的观察，本次忽略）。
    pub fn runtime_snapshot_upsert(
        &self,
        host: &str,
        snapshot_kind: &str,
        payload_json: &str,
        observed_at_ms: i64,
        now_ms: i64,
    ) -> Result<bool, AuthorityError> {
        let changed = self.conn.execute(
            "INSERT INTO host_runtime_snapshots(
                 host, snapshot_kind, payload_json, observed_at_ms, source_id,
                 ingested_run_id, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, NULL, NULL, ?5)
             ON CONFLICT(host, snapshot_kind) DO UPDATE SET
                 payload_json = excluded.payload_json,
                 observed_at_ms = excluded.observed_at_ms,
                 updated_at_ms = excluded.updated_at_ms
             WHERE excluded.observed_at_ms >= host_runtime_snapshots.observed_at_ms",
            rusqlite::params![host, snapshot_kind, payload_json, observed_at_ms, now_ms],
        )?;
        Ok(changed > 0)
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_db(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "avd-authority-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn empty_install_creates_full_schema_and_stamps_version() {
        let db = tmp_db("fresh");
        {
            let a = AuthorityDb::open(&db, 1_000).unwrap();
            // 全部表存在。
            let tables: Vec<String> = a
                .conn()
                .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
                .unwrap()
                .query_map([], |r| r.get(0))
                .unwrap()
                .filter_map(Result::ok)
                .collect();
            for t in [
                "schema_meta",
                "sync_runs",
                "source_files",
                "sessions",
                "usage_facts",
                "host_bills",
                "pricing_snapshots",
                "budget_config",
                "budget_snoozes",
                "data_quality_issues",
                "migrations",
                "workflow_events",
                "host_runtime_snapshots",
                "route_evidence",
                "issue_instances",
                "issue_status_transitions",
                "provider_catalog_snapshots",
                "billing_templates",
                "billing_template_snapshots",
                "billing_import_candidates",
                "outcome_measurements",
                "savings_records",
                "billing_declarations",
                "billing_declaration_revisions",
                "billing_declaration_scopes",
                "billing_recalculation_jobs",
                "billing_recalculation_results",
                "billing_fact_attributions",
            ] {
                assert!(tables.iter().any(|x| x == t), "缺表 {t}: {tables:?}");
            }
            // 重复 open 幂等（版本已 stamp）。
            drop(a);
        }
        let a2 = AuthorityDb::open(&db, 2_000).unwrap();
        let ver: String = a2
            .conn()
            .query_row(
                "SELECT value FROM schema_meta WHERE key = 'schema_version'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(ver, SCHEMA_VERSION.to_string());
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn interrupted_running_batches_are_swept_on_open() {
        let db = tmp_db("sweep");
        let a = AuthorityDb::open(&db, 1_000).unwrap();
        a.begin_run("run-1", "tray", 1_000).unwrap();
        a.begin_run("run-2", "cli", 1_100).unwrap();
        a.finish_run("run-2", "succeeded", None, None, 1_200)
            .unwrap();
        drop(a);
        // 模拟 crash：run-1 停在 running。重新 open → 清扫为 cancelled。
        let a2 = AuthorityDb::open(&db, 9_000).unwrap();
        let (status, code): (String, Option<String>) = a2
            .conn()
            .query_row(
                "SELECT status, error_code FROM sync_runs WHERE run_id = 'run-1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(status, "cancelled");
        assert_eq!(code.as_deref(), Some("interrupted"));
        // succeeded 批次不受清扫影响。
        let s2: String = a2
            .conn()
            .query_row(
                "SELECT status FROM sync_runs WHERE run_id = 'run-2'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(s2, "succeeded");
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn v1_database_migrates_to_current_schema() {
        let db = tmp_db("v1-to-v2");
        let conn = rusqlite::Connection::open(&db).unwrap();
        conn.execute_batch("BEGIN IMMEDIATE;").unwrap();
        conn.execute_batch(SCHEMA_V1).unwrap();
        conn.execute(
            "INSERT INTO schema_meta(key, value) VALUES('schema_version', '1')",
            [],
        )
        .unwrap();
        conn.execute_batch("DROP TABLE host_runtime_snapshots;")
            .unwrap();
        conn.execute_batch("COMMIT;").unwrap();
        drop(conn);

        let upgraded = AuthorityDb::open(&db, 2_000).unwrap();
        let version: String = upgraded
            .conn()
            .query_row(
                "SELECT value FROM schema_meta WHERE key = 'schema_version'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION.to_string());
        let exists: i64 = upgraded
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'host_runtime_snapshots'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(exists, 1);
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn v6_database_migrates_candidates_and_billing_declarations() {
        let db = tmp_db("v6-to-v8");
        {
            let current = AuthorityDb::open(&db, 1).unwrap();
            current.conn().execute_batch(
                "DROP TABLE billing_fact_attributions;
                 DROP TABLE billing_recalculation_results;
                 DROP TABLE billing_recalculation_jobs;
                 DROP TABLE billing_declaration_scopes;
                 DROP TABLE billing_declaration_revisions;
                 DROP TABLE billing_declarations;
                 DROP TABLE billing_import_candidates;
                 UPDATE schema_meta SET value = '6' WHERE key = 'schema_version';",
            ).unwrap();
        }
        let upgraded = AuthorityDb::open(&db, 2).unwrap();
        let version: String = upgraded.conn().query_row(
            "SELECT value FROM schema_meta WHERE key = 'schema_version'", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(version, SCHEMA_VERSION.to_string());
        assert!(upgraded.billing_import_candidate_put(
            "candidate", "claude-code", "minimax", "CNY", 11_400, "2026-09", "legacy", 3,
        ).unwrap());
        assert_eq!(upgraded.pending_billing_import_candidates().unwrap().len(), 1);
        assert!(upgraded.billing_import_candidate_resolve("candidate", "accepted", 4).unwrap());
        assert!(upgraded.billing_declaration_put(
            "decl", "claude-code", "minimax", "official_subscription", None,
            Some(11_400), Some("CNY"), "2026-09", None, Some("candidate"), None, 5,
        ).unwrap());
        assert_eq!(upgraded.billing_declarations().unwrap().len(), 1);
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn v8_database_adds_immutable_declaration_revision_tables() {
        let db = tmp_db("v8-to-v9");
        {
            let current = AuthorityDb::open(&db, 1).unwrap();
            current.conn().execute_batch(
                "DROP TABLE billing_fact_attributions;
                 DROP TABLE billing_recalculation_results;
                 DROP TABLE billing_recalculation_jobs;
                 DROP TABLE billing_declaration_scopes;
                 DROP TABLE billing_declaration_revisions;
                 UPDATE schema_meta SET value = '8' WHERE key = 'schema_version';",
            ).unwrap();
        }
        let upgraded = AuthorityDb::open(&db, 2).unwrap();
        let version: String = upgraded.conn().query_row(
            "SELECT value FROM schema_meta WHERE key = 'schema_version'", [], |row| row.get(0),
        ).unwrap();
        assert_eq!(version, SCHEMA_VERSION.to_string());
        let scope_table: String = upgraded.conn().query_row(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'billing_declaration_scopes'",
            [], |row| row.get(0),
        ).unwrap();
        assert_eq!(scope_table, "billing_declaration_scopes");
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn stale_v9_stamp_with_later_tables_upgrades_idempotently() {
        let db = tmp_db("stale-v9");
        {
            let current = AuthorityDb::open(&db, 1).unwrap();
            current.conn().execute(
                "UPDATE schema_meta SET value = '9' WHERE key = 'schema_version'",
                [],
            ).unwrap();
        }
        let upgraded = AuthorityDb::open(&db, 2).unwrap();
        let version: String = upgraded.conn().query_row(
            "SELECT value FROM schema_meta WHERE key = 'schema_version'", [], |row| row.get(0),
        ).unwrap();
        assert_eq!(version, SCHEMA_VERSION.to_string());
        assert_eq!(upgraded.billing_recalculation_result("missing").unwrap(), None);
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn billing_import_candidate_decision_never_creates_a_bill() {
        let db = tmp_db("candidate-decision");
        let authority = AuthorityDb::open(&db, 1).unwrap();
        authority.billing_import_candidate_put(
            "candidate", "claude-code", "minimax", "CNY", 11_400, "2026-09", "legacy", 1,
        ).unwrap();
        assert!(authority.billing_import_candidate_resolve("candidate", "accepted", 2).unwrap());
        assert!(authority.pending_billing_import_candidates().unwrap().is_empty());
        assert_eq!(authority.billing_import_candidates().unwrap()[0].6, "accepted",
            "the resolved state remains available for a persistent receipt and undo");
        assert_eq!(authority.host_bill_count().unwrap(), 0,
            "a package declaration is not a payment record");
        assert!(!authority.billing_import_candidate_resolve("candidate", "dismissed", 3).unwrap(),
            "a resolved candidate cannot be silently rewritten by sync");
        let status: String = authority.conn().query_row(
            "SELECT status FROM billing_import_candidates WHERE candidate_id = 'candidate'", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(status, "accepted");
        assert!(authority.billing_import_candidate_reopen("candidate", 4).unwrap());
        assert_eq!(authority.pending_billing_import_candidates().unwrap().len(), 1,
            "only an explicit user action can restore a pending candidate");
        assert!(!authority.billing_import_candidate_reopen("candidate", 5).unwrap());
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn billing_declaration_is_separate_from_bills_and_allows_unknown_amount() {
        let db = tmp_db("billing-declaration");
        let authority = AuthorityDb::open(&db, 1).unwrap();
        assert!(authority.billing_declaration_put(
            "decl-unknown", "codex", "openai", "official_subscription", Some("Plus"),
            None, None, "2026-09", None, None, Some("user:declared"), 2,
        ).unwrap());
        assert!(authority.billing_declaration_put(
            "decl-paid-contract", "claude-code", "anthropic", "official_subscription", Some("Pro"),
            Some(2_000), Some("USD"), "2026-09", Some("2026-12"), None, None, 3,
        ).unwrap());
        let rows = authority.billing_declarations().unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].0, "decl-paid-contract");
        assert_eq!(rows[0].5, Some(2_000));
        assert_eq!(rows[1].0, "decl-unknown");
        assert_eq!(rows[1].5, None, "unknown contract amount must remain unknown");
        assert_eq!(authority.host_bill_count().unwrap(), 0,
            "a billing declaration must not masquerade as a payment record");
        assert!(authority.billing_declaration_put(
            "bad", "codex", "openai", "official_subscription", None,
            Some(100), None, "2026-09", None, None, None, 4,
        ).is_err(), "amount without a currency is invalid");
        assert!(authority.billing_declaration_put(
            "bad-month", "codex", "openai", "official_subscription", None,
            None, None, "2026-99", None, None, None, 4,
        ).is_err(), "malformed period must not pass a length-only check");
        authority.billing_import_candidate_put(
            "candidate", "claude-code", "anthropic", "USD", 2_000, "2026-09", "legacy", 4,
        ).unwrap();
        assert!(authority.billing_declaration_put(
            "wrong-candidate", "codex", "openai", "official_subscription", None,
            None, None, "2026-09", None, Some("candidate"), None, 4,
        ).is_err(), "candidate must belong to the declaration host/provider and be accepted");
        authority.billing_import_candidate_resolve("candidate", "accepted", 5).unwrap();
        assert!(authority.billing_declaration_put(
            "candidate-declaration", "claude-code", "anthropic", "official_subscription", None,
            Some(2_000), Some("USD"), "2026-09", None, Some("candidate"), None, 6,
        ).unwrap());
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn billing_revision_accepts_pending_candidate_atomically() {
        let db = tmp_db("billing-candidate-atomic");
        let authority = AuthorityDb::open(&db, 1).unwrap();
        authority.billing_import_candidate_put(
            "pending-ok", "codex", "openai", "CNY", 1_990, "2026-09", "uat", 1,
        ).unwrap();
        assert!(authority.billing_declaration_revision_save(
            "revision-from-pending", "declaration-from-pending", None,
            "codex", "openai", "official_subscription", Some("Plus"),
            Some(1_990), Some("CNY"), "2026-09", None, Some("pending-ok"),
            Some("candidate:pending-ok"), &[], 2,
        ).unwrap());
        assert_eq!(authority.billing_import_candidates().unwrap()[0].6, "accepted");
        assert_eq!(authority.billing_declaration_revisions("declaration-from-pending").unwrap()[0].13,
            Some("pending-ok".to_string()));

        authority.billing_import_candidate_put(
            "pending-fail", "codex", "openai", "CNY", 2_990, "2026-09", "uat", 3,
        ).unwrap();
        assert!(authority.billing_declaration_revision_save(
            "revision-from-pending-fail", "declaration-from-pending-fail", None,
            "codex", "openai", "official_subscription", None, None, None,
            "2026-09", None, Some("pending-fail"), None,
            &[("model", "gpt-5"), ("model", "gpt-5")], 4,
        ).is_err());
        let status: String = authority.conn().query_row(
            "SELECT status FROM billing_import_candidates WHERE candidate_id = 'pending-fail'",
            [], |row| row.get(0),
        ).unwrap();
        assert_eq!(status, "pending", "a failed revision must roll candidate acceptance back");
        let _ = std::fs::remove_file(&db);
    }

    /// 2026-09-16 真机：撤销一条挂过旧资产候选的声明之后，那张候选被一条看不见的软删行
    /// 永久占住，重新声明同一张候选直接失败：
    /// `保存失败：authority sqlite: UNIQUE constraint failed: billing_declarations.source_candidate_id`。
    /// 根因是 `source_candidate_id` 上的 UNIQUE **对软删行照样生效**。撤销必须释放它，
    /// 候选回到 pending（撤销是不再生效，不是放弃这张候选）。
    #[test]
    fn revoking_a_declaration_releases_its_legacy_candidate_for_reuse() {
        let db = tmp_db("billing-revoke-releases-candidate");
        let authority = AuthorityDb::open(&db, 1).unwrap();
        authority
            .billing_import_candidate_put(
                "cand-reuse", "claude-code", "anthropic", "USD", 2_000, "2025-07", "uat", 1,
            )
            .unwrap();
        assert!(authority
            .billing_declaration_revision_save(
                "rev-1", "decl-1", None, "claude-code", "anthropic", "official_subscription",
                Some("Claude Pro"), Some(2_000), Some("USD"), "2025-07-20", None,
                Some("cand-reuse"), None, &[], 2,
            )
            .unwrap());
        assert_eq!(authority.billing_import_candidates().unwrap()[0].6, "accepted");

        assert!(authority
            .billing_declaration_revision_revoke("rev-1-revoke", "decl-1", "rev-1", 3)
            .unwrap());
        assert_eq!(
            authority.billing_import_candidates().unwrap()[0].6,
            "pending",
            "撤销只是不再生效，不是放弃候选：候选必须回到 pending",
        );

        // 用户的原始动作：撤销之后重新声明同一张旧套餐记录——必须成功。
        assert!(
            authority
                .billing_declaration_revision_save(
                    "rev-2", "decl-2", None, "claude-code", "anthropic", "official_subscription",
                    Some("Claude Pro"), Some(2_000), Some("USD"), "2025-07-20", None,
                    Some("cand-reuse"), None, &[], 4,
                )
                .unwrap(),
            "撤销后同一张候选必须可以重新声明",
        );

        // 但**有效**声明仍然只认一张候选（约束本意），且错误要说得清——不能让用户再看到
        // 裸的 UNIQUE 串。
        authority
            .billing_import_candidate_put(
                "cand-taken", "codex", "openai", "CNY", 1_000, "2026-09", "uat", 5,
            )
            .unwrap();
        assert!(authority
            .billing_declaration_revision_save(
                "rev-taken-1", "decl-taken-1", None, "codex", "openai", "official_subscription",
                None, Some(1_000), Some("CNY"), "2026-09", None, Some("cand-taken"), None, &[], 6,
            )
            .unwrap());
        let error = authority
            .billing_declaration_revision_save(
                "rev-taken-2", "decl-taken-2", None, "codex", "openai", "official_subscription",
                None, Some(1_000), Some("CNY"), "2026-09", None, Some("cand-taken"), None, &[], 7,
            )
            .unwrap_err()
            .to_string();
        assert!(
            error.contains("already used by another live declaration"),
            "同一张候选被两条有效声明占用时要给人话而不是裸 UNIQUE 串：{error}",
        );
        let _ = std::fs::remove_file(&db);
    }

    /// 保存路径自愈历史脏数据：**旧版本撤销**留下「软删行仍占着候选」的记录，升级后
    /// 也必须能重新声明——真机上用户正是被这种行卡住的（撤销发生在修复之前）。
    #[test]
    fn saving_heals_a_candidate_claim_left_by_an_older_revoke() {
        let db = tmp_db("billing-heal-stale-candidate");
        let authority = AuthorityDb::open(&db, 1).unwrap();
        authority
            .billing_import_candidate_put(
                "cand-stale", "claude-code", "anthropic", "USD", 2_000, "2025-07", "uat", 1,
            )
            .unwrap();
        assert!(authority
            .billing_declaration_revision_save(
                "rev-stale", "decl-stale", None, "claude-code", "anthropic",
                "official_subscription", None, Some(2_000), Some("USD"), "2025-07-20", None,
                Some("cand-stale"), None, &[], 2,
            )
            .unwrap());
        // 复现旧版本的撤销：只置 `deleted_at_ms`，没有释放 `source_candidate_id`。
        authority
            .conn()
            .execute(
                "UPDATE billing_declarations SET deleted_at_ms = 3 WHERE declaration_id = 'decl-stale'",
                [],
            )
            .unwrap();
        assert!(
            authority
                .billing_declaration_revision_save(
                    "rev-heal", "decl-heal", None, "claude-code", "anthropic",
                    "official_subscription", None, Some(2_000), Some("USD"), "2025-07-20", None,
                    Some("cand-stale"), None, &[], 4,
                )
                .unwrap(),
            "历史脏数据必须在保存路径上自愈，否则升级后用户仍然卡住",
        );
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn billing_declaration_revisions_are_scoped_immutable_and_revocable() {
        let db = tmp_db("billing-declaration-revisions");
        let authority = AuthorityDb::open(&db, 1).unwrap();
        assert!(authority.billing_declaration_revision_save(
            "revision-1", "declaration", None, "codex", "openai", "official_subscription",
            Some("Plus"), None, None, "2026-09", None, None, Some("user:declared"),
            &[("route", "official-desktop"), ("model", "gpt-5.6-sol")], 2,
        ).unwrap());
        assert_eq!(authority.billing_declaration_revisions("declaration").unwrap().len(), 1);
        assert_eq!(authority.billing_declaration_scopes("revision-1").unwrap(), vec![
            ("revision-1".to_string(), "model".to_string(), "gpt-5.6-sol".to_string()),
            ("revision-1".to_string(), "route".to_string(), "official-desktop".to_string()),
        ]);
        assert_eq!(authority.host_bill_count().unwrap(), 0,
            "a scoped declaration remains distinct from a payment record");
        assert!(authority.billing_declaration_revision_save(
            "revision-2", "declaration", Some("revision-1"), "codex", "openai",
            "official_subscription", Some("Plus"), None, None, "2026-10", None, None,
            Some("user:corrected"), &[("account", "personal")], 3,
        ).unwrap());
        let revisions = authority.billing_declaration_revisions("declaration").unwrap();
        assert_eq!(revisions.len(), 2);
        assert_eq!(revisions[0].2, 1);
        assert_eq!(revisions[0].11, "2026-09", "old revision remains intact");
        assert_eq!(revisions[1].2, 2);
        assert_eq!(revisions[1].11, "2026-10");
        assert!(authority.billing_declaration_revision_save(
            "bad-branch", "declaration", Some("revision-1"), "codex", "openai",
            "official_subscription", None, None, None, "2026-10", None, None, None, &[], 4,
        ).is_err(), "a stale revision cannot silently form a second current branch");
        assert!(authority.billing_declaration_revision_revoke(
            "revision-3", "declaration", "revision-2", 5,
        ).unwrap());
        assert!(authority.billing_declarations().unwrap().is_empty(),
            "revoke makes only the current materialization inactive, not history disappear");
        let revisions = authority.billing_declaration_revisions("declaration").unwrap();
        assert_eq!(revisions.len(), 3);
        assert_eq!(revisions[2].3, "revoked");
        assert_eq!(authority.billing_declaration_scopes("revision-3").unwrap(), vec![
            ("revision-3".to_string(), "account".to_string(), "personal".to_string()),
        ], "revoke carries the revoked revision's exact scope for auditability");
        assert!(!authority.billing_declaration_revision_revoke(
            "revision-3", "declaration", "revision-2", 6,
        ).unwrap(), "replaying the same revoke is idempotent");
        assert_eq!(authority.host_bill_count().unwrap(), 0);
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn invalid_or_duplicate_declaration_scopes_do_not_create_revisions() {
        let db = tmp_db("billing-declaration-invalid-scopes");
        let authority = AuthorityDb::open(&db, 1).unwrap();
        assert!(authority.billing_declaration_revision_save(
            "invalid", "declaration", None, "codex", "openai", "official_api", None,
            None, None, "2026-09", None, None, None,
            &[("model", "gpt-5"), ("model", "gpt-5")], 2,
        ).is_err());
        assert!(authority.billing_declaration_revisions("declaration").unwrap().is_empty());
        assert!(authority.billing_declarations().unwrap().is_empty());
        assert!(authority.billing_declaration_revision_save(
            "invalid-kind", "declaration", None, "codex", "openai", "official_api", None,
            None, None, "2026-09", None, None, None, &[("host", "codex")], 3,
        ).is_err());
        assert!(authority.billing_declaration_revisions("declaration").unwrap().is_empty());
        let _ = std::fs::remove_file(&db);
    }

    /// 「服务商未知」的组（事实 `provider_id IS NULL`）：声明记录用户选的服务商，
    /// 作用域 `provider=unresolved` 让预览与重算只命中 NULL-provider 的事实，
    /// 不会把同宿主里已知 provider 的事实一起吞掉；反之普通声明也不会碰到它们。
    #[test]
    fn provider_unresolved_scope_targets_null_provider_facts_only() {
        let db = tmp_db("billing-provider-unresolved");
        let authority = AuthorityDb::open(&db, 1).unwrap();
        authority.conn().execute_batch(
            "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
             VALUES('pu-run', 1, 'test', 'succeeded', 13);
             INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id, source_event_id,
                 session_key, observation_kind, provider_id, model_id, event_ts_ms, evidence_basis, billing_mode,
                 uncached_input_tokens, cache_read_tokens, cache_write_tokens, output_tokens,
                 ingested_run_id, created_at_ms, updated_at_ms)
             VALUES('f-null-a', 'claude-code', 'm', 'n1', 'e1', NULL, 'assistant-usage', NULL, 'glm-5', 1000, 'missing', NULL, 10, 0, 0, 0, 'pu-run', 1, 1),
                   ('f-null-b', 'claude-code', 'm', 'n2', 'e2', NULL, 'assistant-usage', NULL, 'glm-5', 2000, 'missing', NULL, 20, 0, 0, 0, 'pu-run', 1, 1),
                   ('f-known', 'claude-code', 'm', 'n3', 'e3', NULL, 'assistant-usage', 'zhipu-glm', 'glm-5', 3000, 'session-native', 'metered', 40, 0, 0, 0, 'pu-run', 1, 1);",
        ).unwrap();
        let scopes = [("provider", "unresolved"), ("model", "glm-5")];
        let preview = authority.billing_declaration_impact_preview_for(
            "claude-code", "zhipu-glm", "1970-01-01", Some("1970-12-31"), &scopes, None,
        ).unwrap();
        assert_eq!((preview.fact_count, preview.total_tokens), (2, 30), "{preview:?}");
        let plain = authority.billing_declaration_impact_preview_for(
            "claude-code", "zhipu-glm", "1970-01-01", Some("1970-12-31"), &[("model", "glm-5")], None,
        ).unwrap();
        assert_eq!((plain.fact_count, plain.total_tokens), (1, 40), "plain declaration only sees the known-provider fact");
        authority.billing_declaration_revision_save(
            "pu-rev", "pu-decl", None, "claude-code", "zhipu-glm", "official_subscription",
            None, None, None, "1970-01-01", Some("1970-12-31"), None, None, &scopes, 2,
        ).unwrap();
        authority.billing_recalculation_enqueue("pu-job", "pu-decl", "pu-rev", 3).unwrap();
        assert!(authority.billing_recalculation_run("pu-job", 4).unwrap());
        let attributed: Vec<String> = authority.conn().prepare(
            "SELECT fact_id FROM billing_fact_attributions WHERE job_id = 'pu-job' ORDER BY fact_id",
        ).unwrap().query_map([], |row| row.get(0)).unwrap().collect::<Result<_, _>>().unwrap();
        assert_eq!(attributed, vec!["f-null-a".to_string(), "f-null-b".to_string()]);
        assert!(authority.billing_declaration_revision_save(
            "bad-rev", "bad-decl", None, "claude-code", "zhipu-glm", "official_api",
            None, None, None, "1970-01-01", Some("1970-12-31"), None, None, &[("provider", "anything")], 5,
        ).is_err(), "provider scope only accepts the literal `unresolved`");
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn billing_boundaries_accept_exact_dates_and_legacy_months() {
        assert_eq!(billing_boundary_date("2026-08-14", false).as_deref(), Some("2026-08-14"));
        assert_eq!(billing_boundary_date("2026-08-14", true).as_deref(), Some("2026-08-14"));
        assert_eq!(billing_boundary_date("2026-08", false).as_deref(), Some("2026-08-01"));
        assert_eq!(billing_boundary_date("2026-08", true).as_deref(), Some("2026-08-31"));
        assert!(billing_boundary_date("2026-02-30", false).is_none());
        assert!(billing_boundary_date("2026-08-00", false).is_none());
    }

    #[test]
    fn billing_declaration_impact_preview_matches_scope_intersection() {
        let db = tmp_db("billing-impact-preview");
        let authority = AuthorityDb::open(&db, 1).unwrap();
        authority.conn().execute_batch(
            "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
             VALUES('preview-run', 1, 'test', 'succeeded', 9);
             INSERT INTO route_evidence(evidence_id, host, machine_namespace, native_session_id,
                 endpoint_host, account_ref, evidence_basis, ingested_run_id)
             VALUES('route-a', 'codex', 'machine', 'session-a', 'official', 'personal', 'test', 'preview-run'),
                   ('route-b', 'codex', 'machine', 'session-b', 'other', 'personal', 'test', 'preview-run');
             INSERT INTO sessions(session_key, host, native_session_id, machine_namespace, last_observed_at_ms)
             VALUES('session-a-key', 'codex', 'session-a', 'machine', 1000),
                   ('session-b-key', 'codex', 'session-b', 'machine', 3000);
             INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id, source_event_id,
                 session_key, observation_kind, provider_id, model_id, event_ts_ms, route_evidence_id,
                 uncached_input_tokens, cache_read_tokens, cache_write_tokens, output_tokens,
                 ingested_run_id, created_at_ms, updated_at_ms)
             VALUES('fact-1', 'codex', 'machine', 'session-a', 'event-1', 'session-a-key', 'assistant-usage', 'openai', 'model-a', 1000, 'route-a', 10, 0, 0, 0, 'preview-run', 1, 1),
                   ('fact-2', 'codex', 'machine', 'session-a', 'event-2', 'session-a-key', 'assistant-usage', 'openai', 'model-b', 2000, 'route-a', 20, 0, 0, 0, 'preview-run', 1, 1),
                   ('fact-3', 'codex', 'machine', 'session-b', 'event-3', 'session-b-key', 'assistant-usage', 'openai', 'model-a', 3000, 'route-b', 30, 0, 0, 0, 'preview-run', 1, 1);",
        ).unwrap();
        assert_eq!(authority.billing_declaration_impact_preview_for(
            "codex", "openai", "1970-01", Some("1970-12"),
            &[("route", "route-a"), ("model", "model-a")], Some((0, 4_000)),
        ).unwrap(), BillingDeclarationImpactPreview {
            fact_count: 1, session_count: 1, total_tokens: 10,
            first_event_ts_ms: Some(1000), last_event_ts_ms: Some(1000),
            conflict_fact_count: 0, conflict_tokens: 0,
        });
        assert_eq!(authority.conn().query_row(
            "SELECT COUNT(*) FROM billing_declaration_revisions", [], |row| row.get::<_, i64>(0),
        ).unwrap(), 0, "prospective preview must not persist a revision");
        authority.billing_declaration_revision_save(
            "preview-revision", "preview-declaration", None, "codex", "openai", "official_api",
            None, None, None, "1970-01", Some("1970-12"), None, Some("test"),
            &[("route", "route-a"), ("model", "model-a")], 2,
        ).unwrap();
        assert_eq!(authority.billing_declaration_impact_preview(
            "preview-revision", Some((0, 4_000)),
        ).unwrap(), BillingDeclarationImpactPreview {
            fact_count: 1, session_count: 1, total_tokens: 10,
            first_event_ts_ms: Some(1000), last_event_ts_ms: Some(1000),
            conflict_fact_count: 0, conflict_tokens: 0,
        });
        assert_eq!(authority.host_bill_count().unwrap(), 0);
        authority.billing_recalculation_enqueue("preview-job", "preview-declaration", "preview-revision", 3).unwrap();
        assert!(authority.billing_recalculation_run("preview-job", 4).unwrap());
        let attribution: String = authority.conn().query_row(
            "SELECT fact_id FROM billing_fact_attributions WHERE job_id = 'preview-job'", [], |row| row.get(0),
        ).unwrap();
        assert_eq!(attribution, "fact-1");
        assert_eq!(authority.host_bill_count().unwrap(), 0);
        let _ = std::fs::remove_file(&db);
    }

    /// 计费主链规格 R1：预览命中的事实集合 == 重算归因的事实集合（同一谓词）。
    /// 夹具故意放三种不该被移出的事实：`conflict` 证据（E207，单列为仍待确认）、
    /// 已被另一条 saved 声明覆盖的事实（不重复移出）、宿主自报 subscription 的
    /// 事实（本来就不按量）。此前预览按前端传的统计月窗口、重算按全历史，
    /// 「保存前显示的作用范围」与实际写入对不上。
    #[test]
    fn preview_and_recalculation_select_the_same_facts() {
        let db = tmp_db("billing-preview-equals-recalc");
        let authority = AuthorityDb::open(&db, 1).unwrap();
        authority.conn().execute_batch(
            "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
             VALUES('r1-run', 1, 'test', 'succeeded', 13);
             INSERT INTO sessions(session_key, host, native_session_id, machine_namespace, last_observed_at_ms)
             VALUES('s1', 'codex', 'n1', 'machine', 1000), ('s2', 'codex', 'n2', 'machine', 3000),
                    ('s3', 'codex', 'n3', 'machine', 3500);
             INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id, source_event_id,
                 session_key, observation_kind, provider_id, model_id, event_ts_ms, evidence_basis, billing_mode,
                 uncached_input_tokens, cache_read_tokens, cache_write_tokens, output_tokens,
                 ingested_run_id, created_at_ms, updated_at_ms)
             VALUES('f-move-1', 'codex', 'machine', 'n1', 'e1', 's1', 'assistant-usage', 'openai', 'model-a', 1000, 'session-native', 'metered', 10, 0, 0, 0, 'r1-run', 1, 1),
                   ('f-move-2', 'codex', 'machine', 'n2', 'e2', 's2', 'assistant-usage', 'openai', 'model-a', 3000, NULL, NULL, 30, 0, 0, 0, 'r1-run', 1, 1),
                   ('f-other-model', 'codex', 'machine', 'n1', 'e3', 's1', 'assistant-usage', 'openai', 'model-b', 2000, 'session-native', 'metered', 20, 0, 0, 0, 'r1-run', 1, 1),
                   ('f-conflict', 'codex', 'machine', 'n1', 'e4', 's1', 'assistant-usage', 'openai', 'model-a', 2500, 'conflict', 'metered', 7, 0, 0, 0, 'r1-run', 1, 1),
                   ('f-covered', 'codex', 'machine', 'n3', 'e5', 's3', 'assistant-usage', 'openai', 'model-a', 3500, 'session-native', 'metered', 50, 0, 0, 0, 'r1-run', 1, 1),
                   ('f-native-sub', 'codex', 'machine', 'n2', 'e6', 's2', 'assistant-usage', 'openai', 'model-a', 3600, 'session-native', 'subscription', 90, 0, 0, 0, 'r1-run', 1, 1);",
        ).unwrap();
        authority.billing_declaration_revision_save(
            "other-rev", "other-decl", None, "codex", "openai", "official_subscription",
            None, None, None, "1970-01", Some("1970-01"), None, None, &[("session", "s3")], 2,
        ).unwrap();
        authority.billing_recalculation_enqueue("other-job", "other-decl", "other-rev", 2).unwrap();
        assert!(authority.billing_recalculation_run("other-job", 2).unwrap());
        let covered: Vec<String> = authority.conn().prepare(
            "SELECT fact_id FROM billing_fact_attributions WHERE job_id = 'other-job'",
        ).unwrap().query_map([], |row| row.get(0)).unwrap().collect::<Result<_, _>>().unwrap();
        assert_eq!(covered, vec!["f-covered".to_string()]);

        let scopes = [("model", "model-a")];
        let preview = authority.billing_declaration_impact_preview_for(
            "codex", "openai", "1970-01", Some("1970-12"), &scopes, None,
        ).unwrap();
        assert_eq!(preview.fact_count, 2, "{preview:?}");
        assert_eq!(preview.total_tokens, 40);
        assert_eq!(preview.session_count, 2);
        assert_eq!(preview.conflict_fact_count, 1);
        assert_eq!(preview.conflict_tokens, 7);

        authority.billing_declaration_revision_save(
            "r1-rev", "r1-decl", None, "codex", "openai", "official_subscription",
            None, None, None, "1970-01", Some("1970-12"), None, None, &scopes, 3,
        ).unwrap();
        assert_eq!(
            authority.billing_declaration_impact_preview("r1-rev", None).unwrap(), preview,
            "revision-level preview must equal the prospective preview for the same range",
        );
        assert_eq!(
            authority.billing_declaration_matching_fact_ids("r1-rev").unwrap(),
            vec!["f-move-1".to_string(), "f-move-2".to_string()],
        );
        authority.billing_recalculation_enqueue("r1-job", "r1-decl", "r1-rev", 4).unwrap();
        assert!(authority.billing_recalculation_run("r1-job", 5).unwrap());
        let attributed: Vec<String> = authority.conn().prepare(
            "SELECT fact_id FROM billing_fact_attributions WHERE job_id = 'r1-job' ORDER BY fact_id",
        ).unwrap().query_map([], |row| row.get(0)).unwrap().collect::<Result<_, _>>().unwrap();
        assert_eq!(attributed, vec!["f-move-1".to_string(), "f-move-2".to_string()]);
        let result = authority.billing_recalculation_result("r1-job").unwrap().unwrap();
        assert_eq!((result.2, result.3, result.4), (2, 2, 40), "published snapshot == preview");
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn billing_recalculation_job_is_idempotent_and_has_explicit_receipt() {
        let db = tmp_db("billing-recalculation-job");
        let authority = AuthorityDb::open(&db, 1).unwrap();
        authority.billing_declaration_revision_save(
            "revision-job", "declaration-job", None, "codex", "openai", "official_api",
            None, None, None, "2026-09", None, None, None, &[], 1,
        ).unwrap();
        assert!(authority.billing_recalculation_enqueue("job-1", "declaration-job", "revision-job", 2).unwrap());
        assert!(!authority.billing_recalculation_enqueue("job-2", "declaration-job", "revision-job", 3).unwrap());
        assert_eq!(authority.billing_recalculation_job("job-1").unwrap().unwrap().3, "queued");
        assert!(authority.billing_recalculation_run("job-1", 4).unwrap());
        assert_eq!(authority.billing_recalculation_job("job-1").unwrap().unwrap().3, "succeeded");
        assert_eq!(authority.billing_recalculation_result("job-1").unwrap().unwrap().2, 0);
        assert!(!authority.billing_recalculation_run("job-1", 5).unwrap());
        assert!(!authority.billing_recalculation_enqueue("job-3", "declaration-job", "revision-job", 6).unwrap(),
            "one revision cannot create a second recalculation job");
        authority.billing_declaration_revision_save(
            "revision-job-2", "declaration-job-2", None, "codex", "openai", "official_api",
            None, None, None, "2026-09", None, None, None, &[], 7,
        ).unwrap();
        assert!(authority.billing_recalculation_enqueue("job-failed", "declaration-job-2", "revision-job-2", 8).unwrap());
        assert!(authority.billing_recalculation_set_status("job-failed", "running", None, None, 9).unwrap());
        assert!(authority.billing_recalculation_set_status("job-failed", "failed", Some("worker_failed"), Some("worker unavailable"), 10).unwrap());
        let job = authority.billing_recalculation_job("job-failed").unwrap().unwrap();
        assert_eq!(job.3, "failed");
        assert_eq!(job.5, Some(9));
        assert_eq!(job.6, Some(10));
        assert_eq!(job.7.as_deref(), Some("worker_failed"));
        assert!(!authority.billing_recalculation_set_status("job-failed", "succeeded", None, None, 11).unwrap());
        assert!(authority.billing_recalculation_retry("job-failed", 12).unwrap());
        let retried = authority.billing_recalculation_job("job-failed").unwrap().unwrap();
        assert_eq!(retried.3, "queued");
        assert_eq!(retried.6, None);
        assert_eq!(retried.7, None);
        assert!(!authority.billing_recalculation_retry("job-1", 13).unwrap(),
            "成功任务不可回退为 queued");
        let queued = authority.billing_recalculation_recover(14).unwrap();
        assert_eq!(queued, vec!["job-failed".to_string()]);
        assert!(authority.billing_recalculation_set_status("job-failed", "running", None, None, 15).unwrap());
        assert_eq!(authority.billing_recalculation_recover(16).unwrap(), Vec::<String>::new());
        assert_eq!(authority.billing_recalculation_job("job-failed").unwrap().unwrap().3, "failed");
        assert_eq!(authority.billing_recalculation_jobs_needing_attention().unwrap().len(), 1);
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn billing_recalculation_failure_after_running_is_terminal_and_retryable() {
        let db = tmp_db("billing-recalculation-transaction-failure");
        let authority = AuthorityDb::open(&db, 1).unwrap();
        authority.billing_declaration_revision_save(
            "revision-transaction-failure", "declaration-transaction-failure", None,
            "codex", "openai", "official_api", None, None, None, "2026-09", None,
            None, None, &[], 1,
        ).unwrap();
        assert!(authority.billing_recalculation_enqueue(
            "job-transaction-failure", "declaration-transaction-failure",
            "revision-transaction-failure", 2,
        ).unwrap());
        authority.conn().execute_batch("DROP TABLE billing_recalculation_results").unwrap();

        assert!(authority.billing_recalculation_run("job-transaction-failure", 3).is_err());
        let failed = authority.billing_recalculation_job("job-transaction-failure").unwrap().unwrap();
        assert_eq!(failed.3, "failed");
        assert_eq!(failed.7.as_deref(), Some("transaction_failed"));
        assert_eq!(failed.6, Some(3));
        assert!(authority.billing_recalculation_retry("job-transaction-failure", 4).unwrap());
        assert_eq!(authority.billing_recalculation_job("job-transaction-failure").unwrap().unwrap().3, "queued");
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn v2_database_migrates_to_current_schema_and_preserves_facts() {
        let db = tmp_db("v2-to-v3");
        let conn = rusqlite::Connection::open(&db).unwrap();
        conn.execute_batch("BEGIN IMMEDIATE;").unwrap();
        conn.execute_batch(SCHEMA_V1).unwrap();
        conn.execute_batch("INSERT INTO schema_meta(key, value) VALUES('schema_version', '2');")
            .unwrap();
        conn.execute_batch(
            "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
             VALUES('migration-fixture', 1, 'migration', 'succeeded', 2);
             INSERT INTO usage_facts(
               fact_id, host, machine_namespace, native_session_id, source_event_id,
               observation_kind, uncached_input_tokens, cache_read_tokens,
               cache_write_tokens, output_tokens, ingested_run_id, created_at_ms, updated_at_ms)
             VALUES('fact-preserve', 'codex', 'ns', 'session', 'event', 'assistant-usage',
                    11, 22, 33, 44, 'migration-fixture', 1, 1);",
        )
        .unwrap();
        conn.execute_batch("COMMIT;").unwrap();
        drop(conn);

        let upgraded = AuthorityDb::open(&db, 2_000).unwrap();
        let version: String = upgraded
            .conn()
            .query_row(
                "SELECT value FROM schema_meta WHERE key = 'schema_version'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION.to_string());
        let index_exists: i64 = upgraded
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                 WHERE type = 'index' AND name = 'data_quality_issues_open_code_scope'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(index_exists, 1, "missing data-status correlation index");
        for column in [
            "provider_raw",
            "billing_source",
            "billing_mode",
            "pricing_basis",
            "evidence_basis",
            "normalization_version",
            "route_evidence_id",
            "attribution_version",
            "billing_template_id",
        ] {
            let found: i64 = upgraded
                .conn()
                .query_row(
                    "SELECT COUNT(*) FROM pragma_table_info('usage_facts') WHERE name = ?1",
                    [column],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(found, 1, "missing migrated column {column}");
        }
        let preserved: (i64, i64, i64, i64, i64) = upgraded
            .conn()
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(uncached_input_tokens), 0),
                        COALESCE(SUM(cache_read_tokens), 0),
                        COALESCE(SUM(cache_write_tokens), 0),
                        COALESCE(SUM(output_tokens), 0)
                 FROM usage_facts WHERE fact_id = 'fact-preserve'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .unwrap();
        assert_eq!(preserved, (1, 11, 22, 33, 44));
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn v3_database_migrates_to_v4_without_assigning_historical_templates() {
        let db = tmp_db("v3-to-v4");
        let conn = rusqlite::Connection::open(&db).unwrap();
        conn.execute_batch("BEGIN IMMEDIATE;").unwrap();
        conn.execute_batch(SCHEMA_V1).unwrap();
        conn.execute_batch(SCHEMA_V3_ADD).unwrap();
        conn.execute_batch("INSERT INTO schema_meta(key, value) VALUES('schema_version', '3');")
            .unwrap();
        conn.execute_batch(
            "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
             VALUES('migration-fixture', 1, 'migration', 'succeeded', 3);
             INSERT INTO usage_facts(
               fact_id, host, machine_namespace, native_session_id, source_event_id,
               observation_kind, uncached_input_tokens, ingested_run_id, created_at_ms, updated_at_ms)
             VALUES('fact-v3', 'codex', 'ns', 'session', 'event', 'assistant-usage',
                    88, 'migration-fixture', 1, 1);",
        ).unwrap();
        conn.execute_batch("COMMIT;").unwrap();
        drop(conn);

        let upgraded = AuthorityDb::open(&db, 2_000).unwrap();
        let template_id: Option<String> = upgraded.conn().query_row(
            "SELECT billing_template_id FROM usage_facts WHERE fact_id = 'fact-v3'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(template_id, None);
        for table in ["provider_catalog_snapshots", "billing_templates", "billing_template_snapshots",
            "outcome_measurements", "savings_records"] {
            let found: i64 = upgraded.conn().query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [table], |r| r.get(0),
            ).unwrap();
            assert_eq!(found, 1, "missing v4 table {table}");
        }
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn billing_catalog_and_template_snapshots_are_immutable_and_referential() {
        let db = tmp_db("billing-snapshots");
        let authority = AuthorityDb::open(&db, 1_000).unwrap();
        assert!(authority.provider_catalog_snapshot_put(
            "catalog-1", "bc1-abc", "official", "{\"providers\":[]}", 1_000,
        ).unwrap());
        assert!(!authority.provider_catalog_snapshot_put(
            "catalog-1", "bc1-abc", "official", "{\"providers\":[]}", 2_000,
        ).unwrap());
        assert!(authority.provider_catalog_snapshot_put(
            "catalog-1", "bc1-other", "official", "{}", 2_000,
        ).is_err());
        assert!(authority.billing_template_put(
            "template-1", "openai", Some("acct-hash"), "metered_api", "official", 0, None, 1_000,
        ).unwrap());
        assert!(!authority.billing_template_put(
            "template-1", "openai", Some("acct-hash"), "metered_api", "official", 0, None, 2_000,
        ).unwrap());
        assert!(authority.billing_template_put(
            "template-1", "openai", Some("acct-hash"), "custom", "official", 0, None, 2_000,
        ).is_err());
        assert!(authority.billing_template_put(
            "template-invalid", "openai", None, "subscription", "official", 0, None, 1_000,
        ).is_err());
        assert!(authority.billing_template_snapshot_put(
            "bts1-abc", "template-1", Some("catalog-1"), "{\"kind\":\"metered_api\"}", 1_000,
        ).unwrap());
        assert!(authority.billing_template_snapshot_put(
            "bts1-abc", "template-1", Some("catalog-1"), "{}", 2_000,
        ).is_err());
        assert!(authority.billing_template_snapshot_put(
            "bad", "missing", Some("catalog-1"), "{}", 1_000,
        ).is_err());
        assert!(authority.conn().execute(
            "INSERT INTO pricing_snapshots(pricing_version, captured_at_ms, source_kind, payload_json, catalog_version)
             VALUES ('bad-catalog', 1, 'test', '{}', 'missing')", [],
        ).is_err());
        assert!(authority.conn().execute(
            "INSERT INTO pricing_snapshots(pricing_version, captured_at_ms, source_kind, payload_json, billing_template_id)
             VALUES ('bad-template', 1, 'test', '{}', 'missing')", [],
        ).is_err());
        assert_eq!(authority.conn().execute(
            "INSERT INTO pricing_snapshots(pricing_version, captured_at_ms, source_kind, payload_json, catalog_version, billing_template_id)
             VALUES ('priced-template', 1, 'test', '{}', 'catalog-1', 'template-1')", [],
        ).unwrap(), 1);
        assert!(authority.pricing_snapshot_put_with_provenance(
            "api-priced-template", "test", "{}", 2_000, Some("catalog-1"), Some("template-1"),
        ).unwrap());
        assert!(authority.pricing_snapshot_put_with_provenance(
            "api-orphan", "test", "{}", 2_000, Some("missing"), None,
        ).is_err());
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn savings_cannot_upgrade_an_estimate_to_actual_or_realized() {
        let db = tmp_db("savings-evidence");
        let authority = AuthorityDb::open(&db, 1_000).unwrap();
        assert!(authority.outcome_measurement_put(
            "outcome-est", "facts-1", "cost-v1", "estimated", Some(123), Some("USD"), 1_000, "{}",
        ).unwrap());
        assert!(authority.savings_record_put(
            "saving-est", "outcome-est", None, None, 123, "USD", "estimated", 1_000,
        ).unwrap());
        assert!(authority.savings_record_put(
            "saving-actual", "outcome-est", None, None, 123, "USD", "actual", 1_000,
        ).is_err());
        assert!(authority.outcome_measurement_put(
            "outcome-actual", "facts-2", "invoice-v1", "actual", Some(456), Some("USD"), 2_000, "{}",
        ).unwrap());
        assert!(authority.savings_record_put(
            "saving-actual", "outcome-actual", None, None, 456, "USD", "actual", 2_000,
        ).unwrap());
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn corrupted_database_is_reported_not_deleted() {
        // 与旧 store 的关键差异：损坏 → 报错走恢复流程，绝不静默删库重建。
        let db = tmp_db("corrupt");
        std::fs::write(&db, b"NOT A SQLITE DATABASE AT ALL____garbage").unwrap();
        let err = AuthorityDb::open(&db, 1_000).unwrap_err();
        assert!(
            matches!(err, AuthorityError::Sqlite(_)),
            "损坏必须以 Sqlite 错误上抛（不自愈），got {err:?}"
        );
        // 文件原样保留（用户备份/取证）。
        assert!(db.exists());
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn partial_schema_from_interrupted_creation_is_rejected() {
        let db = tmp_db("partial");
        // 模拟建库中途死掉：有业务表但没有版本行。
        let conn = rusqlite::Connection::open(&db).unwrap();
        conn.execute_batch("CREATE TABLE usage_facts (fact_id TEXT PRIMARY KEY);")
            .unwrap();
        drop(conn);
        let err = AuthorityDb::open(&db, 1_000).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("__corrupt_partial_schema__"), "got {msg}");
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn newer_schema_is_rejected_not_downgraded() {
        let db = tmp_db("newer");
        {
            let conn = rusqlite::Connection::open(&db).unwrap();
            conn.execute_batch(
                "CREATE TABLE schema_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 INSERT INTO schema_meta VALUES('schema_version', '99');",
            )
            .unwrap();
        }
        let err = AuthorityDb::open(&db, 1_000).unwrap_err();
        assert!(
            matches!(err, AuthorityError::NewerSchema { found: 99, .. }),
            "got {err:?}"
        );
        let _ = std::fs::remove_file(&db);
    }

    // ── open_readonly（Data MCP 只读取数面，spec §9.3）────────────────

    #[test]
    fn open_readonly_missing_file_is_typed() {
        let db = tmp_db("ro-missing");
        assert!(matches!(
            AuthorityDb::open_readonly(&db).unwrap_err(),
            AuthorityError::MissingFile
        ));
        // 缺文件时**不建库**（与 `open` 的关键区别）。
        assert!(!db.exists());
    }

    #[test]
    fn open_readonly_opens_a_valid_db_and_forbids_writes() {
        let db = tmp_db("ro-valid");
        AuthorityDb::open(&db, 1_000).unwrap(); // 先正常建库
        let ro = AuthorityDb::open_readonly(&db).unwrap();
        // 只读连接：写语句必须失败。
        let write = ro
            .conn()
            .execute("INSERT INTO schema_meta(key, value) VALUES('x','y')", []);
        assert!(write.is_err(), "read-only connection must reject writes");
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn open_readonly_reports_corrupt_for_garbage_and_half_built() {
        let garbage = tmp_db("ro-garbage");
        std::fs::write(&garbage, b"NOT A SQLITE DATABASE").unwrap();
        assert!(matches!(
            AuthorityDb::open_readonly(&garbage).unwrap_err(),
            AuthorityError::Corrupt
        ));
        let _ = std::fs::remove_file(&garbage);

        let half = tmp_db("ro-half");
        rusqlite::Connection::open(&half)
            .unwrap()
            .execute_batch("CREATE TABLE usage_facts (fact_id TEXT PRIMARY KEY);")
            .unwrap();
        assert!(matches!(
            AuthorityDb::open_readonly(&half).unwrap_err(),
            AuthorityError::Corrupt
        ));
        let _ = std::fs::remove_file(&half);
    }

    #[test]
    fn existing_v1_db_picks_up_safe_views_on_reopen() {
        // 增量 7.5：v1 库已存在的情况下，再开一次应该把 v_*_safe view
        // 幂等加进去（review 增量 7.5：migrate 路径不阻塞）。
        let path = tmp_db("v1-views");
        let db = AuthorityDb::open(&path, 1_000).unwrap();
        // 先关掉 + 重新打开。
        drop(db);
        let db2 = AuthorityDb::open(&path, 1_001).unwrap();
        let n: i64 = db2
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='view' AND name IN ('v_facts_safe', 'v_sessions_safe', 'v_data_quality_safe', 'v_sync_runs_safe')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 4, "v_*_safe views 应在二次 open 时被幂等加进去");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn open_readonly_distinguishes_newer_and_older_schema() {
        let newer = tmp_db("ro-newer");
        rusqlite::Connection::open(&newer)
            .unwrap()
            .execute_batch(
                "CREATE TABLE schema_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 INSERT INTO schema_meta VALUES('schema_version', '99');",
            )
            .unwrap();
        assert!(matches!(
            AuthorityDb::open_readonly(&newer).unwrap_err(),
            AuthorityError::NewerSchema { found: 99, .. }
        ));
        let _ = std::fs::remove_file(&newer);

        let older = tmp_db("ro-older");
        rusqlite::Connection::open(&older)
            .unwrap()
            .execute_batch(
                "CREATE TABLE schema_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 INSERT INTO schema_meta VALUES('schema_version', '0');",
            )
            .unwrap();
        assert!(matches!(
            AuthorityDb::open_readonly(&older).unwrap_err(),
            AuthorityError::OlderSchema { found: 0 }
        ));
        let _ = std::fs::remove_file(&older);
    }

    #[test]
    fn retention_deletes_only_dated_rows_older_than_cutoff() {
        let db = tmp_db("retention");
        let a = AuthorityDb::open(&db, 1_000).unwrap();
        a.begin_run("run-1", "cli", 1_000).unwrap();
        a.with_immediate_txn(|conn| {
            // 三行：旧（< cutoff）、新（≥ cutoff）、无日期（§5.4 不静默删）。
            for (rid, ts) in [
                ("f-old", Some(500_i64)),
                ("f-new", Some(9_999_i64)),
                ("f-nodate", None),
            ] {
                conn.execute(
                    "INSERT INTO usage_facts(fact_id, host, machine_namespace,
                         native_session_id, source_event_id, observation_kind,
                         event_ts_ms, ingested_run_id, created_at_ms, updated_at_ms)
                     VALUES (?1,'dsh','ns','s',?1,'token_count',?2,'run-1',1,1)",
                    rusqlite::params![rid, ts],
                )
                .unwrap();
            }
            Ok(())
        })
        .unwrap();
        let n = a.retention_usage_facts(5_000).unwrap();
        assert_eq!(n, 1, "只删 event_ts_ms < cutoff 的行");
        let left: i64 = a
            .conn()
            .query_row("SELECT COUNT(*) FROM usage_facts", [], |r| r.get(0))
            .unwrap();
        assert_eq!(left, 2, "新行与无日期行保留");
        // 幂等：再跑删 0 行。
        assert_eq!(a.retention_usage_facts(5_000).unwrap(), 0);
        std::fs::remove_file(&db).ok();
    }

    #[test]
    fn delete_imported_host_data_is_scoped_and_reimportable() {
        let path = tmp_db("delete-imported-host");
        let db = AuthorityDb::open(&path, 1).unwrap();
        db.conn().execute_batch(
            "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version) VALUES ('run', 1, 'test', 'succeeded', 12);
             INSERT INTO source_files(source_id, host, path_hash, size_bytes, mtime_ns, parser_version, first_seen_at_ms, last_seen_at_ms) VALUES
               ('source-codex', 'codex', 'c', 1, 1, 1, 1, 1), ('source-dsh', 'dsh', 'd', 1, 1, 1, 1, 1);
             INSERT INTO sessions(session_key, host, native_session_id, machine_namespace, last_observed_at_ms) VALUES
               ('session-codex', 'codex', 'c', 'm', 1), ('session-dsh', 'dsh', 'd', 'm', 1);
             INSERT INTO usage_facts(fact_id, host, machine_namespace, native_session_id, session_key, source_event_id, observation_kind, source_id, ingested_run_id, created_at_ms, updated_at_ms) VALUES
               ('fact-codex', 'codex', 'm', 'c', 'session-codex', 'e1', 'usage', 'source-codex', 'run', 1, 1),
               ('fact-dsh', 'dsh', 'm', 'd', 'session-dsh', 'e2', 'usage', 'source-dsh', 'run', 1, 1);"
        ).unwrap();
        db.host_bill_put("bill-dsh", "dsh", "deepseek", "2026-09", "metered_actual", 100, "CNY", "user:receipt", 2).unwrap();
        assert_eq!(db.delete_imported_host_data("codex", 3).unwrap(), HostImportedDataDeletion { facts: 1, sessions: 1, source_files: 1 });
        let (codex_live, dsh_live, sources): (i64, i64, i64) = db.conn().query_row(
            "SELECT SUM(host = 'codex' AND deleted_at_ms IS NULL), SUM(host = 'dsh' AND deleted_at_ms IS NULL), COUNT(*) FROM usage_facts", [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).unwrap();
        assert_eq!((codex_live, dsh_live, sources), (0, 1, 2));
        assert_eq!(db.conn().query_row("SELECT COUNT(*) FROM source_files WHERE host = 'codex'", [], |r| r.get::<_, i64>(0)).unwrap(), 0);
        assert_eq!(db.host_bill_count().unwrap(), 1, "manual bills are not imported source data");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn immediate_txn_rolls_back_on_error() {
        let db = tmp_db("txn");
        let a = AuthorityDb::open(&db, 1_000).unwrap();
        a.begin_run("run-1", "cli", 1_000).unwrap();
        let err: Result<(), AuthorityError> = a.with_immediate_txn(|conn| {
            conn.execute(
                "INSERT INTO sync_runs(run_id, started_at_ms, trigger, status, schema_version)
                 VALUES ('run-2', 1000, 'cli', 'running', 1)",
                [],
            )
            .map_err(AuthorityError::from)?;
            Err(AuthorityError::Sqlite(
                rusqlite::Error::InvalidParameterName("boom".to_string()),
            ))
        });
        assert!(err.is_err());
        let n: i64 = a
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM sync_runs WHERE run_id = 'run-2'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 0, "回滚后不得有半提交残留");
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn budget_config_crud_roundtrip_and_overwrite() {
        let db = tmp_db("bcfg");
        let a = AuthorityDb::open(&db, 1_000).unwrap();
        assert!(a.budget_config_get().unwrap().is_none(), "新库无配置");
        a.budget_config_set(60_000, 3_000, 8_000, 2_000).unwrap();
        let c = a.budget_config_get().unwrap().expect("seed 后有配置");
        assert_eq!(
            (
                c.monthly_cny_minor,
                c.daily_cny_minor,
                c.warning_ratio_bp,
                c.updated_at_ms
            ),
            (60_000, 3_000, 8_000, 2_000)
        );
        // upsert 覆盖 + updated_at_ms 滚动（第二次 set 的时钟是 3_000）。
        a.budget_config_set(61_000, 3_100, 9_000, 3_000).unwrap();
        let c2 = a.budget_config_get().unwrap().unwrap();
        assert_eq!(
            (
                c2.monthly_cny_minor,
                c2.daily_cny_minor,
                c2.warning_ratio_bp,
                c2.updated_at_ms
            ),
            (61_000, 3_100, 9_000, 3_000)
        );
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn budget_profiles_keep_estimate_and_confirmed_currencies_separate() {
        let db = tmp_db("budget-profiles");
        let a = AuthorityDb::open(&db, 1_000).unwrap();
        a.budget_profile_set("estimate", "CNY", 60_000, Some(3_000), 8_000, 2_000).unwrap();
        a.budget_profile_set("confirmed", "USD", 10_000, None, 9_000, 3_000).unwrap();
        assert_eq!(a.budget_profiles_get().unwrap(), vec![
            BudgetProfile {
                profile_id: "confirmed".into(), currency: "USD".into(), monthly_minor: 10_000,
                daily_minor: None, warning_ratio_bp: 9_000, updated_at_ms: 3_000,
            },
            BudgetProfile {
                profile_id: "estimate".into(), currency: "CNY".into(), monthly_minor: 60_000,
                daily_minor: Some(3_000), warning_ratio_bp: 8_000, updated_at_ms: 2_000,
            },
        ]);
        assert!(a.budget_profile_set("estimate", "CN", 1, None, 8_000, 4_000).is_err());
        assert!(a.budget_profile_set("estimate", "USD", 0, None, 8_000, 4_000).is_err());
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn budget_snooze_set_get_clear() {
        let db = tmp_db("bsnz");
        let a = AuthorityDb::open(&db, 1_000).unwrap();
        assert!(a.budget_snooze_get().unwrap().is_none());
        a.budget_snooze_set(9_999, 1_000).unwrap();
        assert_eq!(a.budget_snooze_get().unwrap(), Some(9_999));
        a.budget_snooze_set(8_888, 2_000).unwrap();
        assert_eq!(a.budget_snooze_get().unwrap(), Some(8_888), "upsert 覆盖");
        a.budget_snooze_clear().unwrap();
        assert!(a.budget_snooze_get().unwrap().is_none(), "clear 后干净");
        // clear 再 clear 幂等。
        a.budget_snooze_clear().unwrap();
        let _ = std::fs::remove_file(&db);
    }

    /// Phase 2.8：`pricing_snapshots` 写入方——同 version 幂等（内容不可变）、
    /// `asof` 按事件时间点选最新的更早版本、`latest` 取最新捕获。
    #[test]
    fn pricing_snapshots_put_get_asof_latest() {
        let db = tmp_db("pxsnap");
        let a = AuthorityDb::open(&db, 1_000).unwrap();
        assert_eq!(a.pricing_snapshot_count().unwrap(), 0);
        assert!(a.pricing_snapshot_latest().unwrap().is_none());
        assert!(
            a.pricing_snapshot_asof(9_999).unwrap().is_none(),
            "无更早版本 → None"
        );

        assert!(a
            .pricing_snapshot_put("v-aug", "embedded-assets", "{\"m\":1}", 1_000)
            .unwrap());
        assert!(
            !a.pricing_snapshot_put("v-aug", "embedded-assets", "{\"m\":1}", 5_000)
                .unwrap(),
            "同 version 再写 → DO NOTHING（内容不可变）"
        );
        assert!(a
            .pricing_snapshot_put("v-sep", "embedded-assets", "{\"m\":2}", 3_000)
            .unwrap());
        assert_eq!(a.pricing_snapshot_count().unwrap(), 2);

        assert_eq!(
            a.pricing_snapshot_get("v-sep").unwrap().as_deref(),
            Some("{\"m\":2}")
        );
        assert_eq!(
            a.pricing_snapshot_latest().unwrap(),
            Some(("v-sep".into(), 3_000))
        );
        // asof 调价前 → 用旧版本；调价后 → 新版本；更早 → None。
        assert_eq!(
            a.pricing_snapshot_asof(2_000).unwrap().as_deref(),
            Some("{\"m\":1}")
        );
        assert_eq!(
            a.pricing_snapshot_asof(4_000).unwrap().as_deref(),
            Some("{\"m\":2}")
        );
        assert!(a.pricing_snapshot_asof(500).unwrap().is_none());
        let _ = std::fs::remove_file(&db);
    }

    #[test]
    fn pricing_catalog_snapshot_put_rolls_back_both_tables_on_failure() {
        let db = tmp_db("pxsnap-atomic");
        let a = AuthorityDb::open(&db, 1_000).unwrap();
        let result = a.pricing_catalog_snapshot_put(
            "public-v1",
            "public-v1",
            "public-maintainer-https",
            "{\"providers\":{}}",
            2_000,
            Some("missing-template"),
        );
        assert!(result.is_err());
        assert_eq!(a.pricing_snapshot_count().unwrap(), 0);
        assert_eq!(
            a.conn()
                .query_row(
                    "SELECT COUNT(*) FROM provider_catalog_snapshots",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            0
        );
        let _ = std::fs::remove_file(&db);
    }

    /// Phase 2.8：`host_bills` 写入方——校验四项（period/basis/amount/currency）、
    /// 同键 upsert（更正金额，deleted 复活）、`for_period` 只回活行、soft delete。
    #[test]
    fn host_bill_put_validates_and_upserts() {
        let db = tmp_db("hbill");
        let a = AuthorityDb::open(&db, 1_000).unwrap();
        assert_eq!(a.host_bill_count().unwrap(), 0);

        // 四项校验——每条都必须 Err（不猜、不默认）。
        assert!(
            a.host_bill_put("x", "wb", "wb", "2026-9", "host_billed", 100, "CNY", "", 1)
                .is_err(),
            "period 非 YYYY-MM"
        );
        assert!(
            a.host_bill_put("x", "wb", "wb", "2026-09", "credits", 100, "CNY", "", 1)
                .is_err(),
            "basis 不在五档词表"
        );
        assert!(
            a.host_bill_put("x", "wb", "wb", "2026-09", "host_billed", -1, "CNY", "", 1)
                .is_err(),
            "amount_minor < 0"
        );
        assert!(
            a.host_bill_put("x", "wb", "wb", "2026-09", "host_billed", 100, "  ", "", 1)
                .is_err(),
            "currency 空"
        );
        assert!(
            a.host_bill_put("x", "wb", "wb", "2026-09", "host_billed", 100, "cny", "", 1)
                .is_err(),
            "currency 必须是三位大写代码"
        );

        // 正常录入 + 同键 upsert 更正金额。
        a.host_bill_put(
            "b1",
            "workbuddy",
            "workbuddy",
            "2026-09",
            "host_billed",
            21_500,
            "CNY",
            "credit_json",
            1_000,
        )
        .unwrap();
        assert_eq!(a.host_bill_count().unwrap(), 1);
        a.host_bill_put(
            "b1",
            "workbuddy",
            "workbuddy",
            "2026-09",
            "host_billed",
            30_000,
            "CNY",
            "credit_json",
            2_000,
        )
        .unwrap();
        assert_eq!(
            a.host_bill_count().unwrap(),
            1,
            "同 (host,provider,period,basis,evidence) → upsert 不新增"
        );

        // evidence_ref 空串同样能 upsert（不撞 PRIMARY KEY）。
        a.host_bill_put(
            "b2:",
            "wb2",
            "wb2",
            "2026-09",
            "host_billed",
            500,
            "CNY",
            "",
            1,
        )
        .unwrap();
        a.host_bill_put(
            "b2:",
            "wb2",
            "wb2",
            "2026-09",
            "host_billed",
            700,
            "CNY",
            "",
            2,
        )
        .unwrap();
        assert_eq!(
            a.host_bill_count().unwrap(),
            2,
            "空 evidence 也 upsert 而非新增/报错"
        );
        a.host_bill_delete("b2:", 9).unwrap();

        let rows = a.host_bills_for_period("2026-09").unwrap();
        assert_eq!(
            rows,
            vec![(
                "workbuddy".to_string(),
                "workbuddy".to_string(),
                "host_billed".to_string(),
                30_000,
                "CNY".to_string()
            )]
        );
        assert!(a.host_bills_for_period("2026-08").unwrap().is_empty());

        // soft delete → for_period 不再回它；重复 delete 返回 false。
        assert!(a.host_bill_delete("b1", 3_000).unwrap());
        assert!(!a.host_bill_delete("b1", 4_000).unwrap());
        assert!(a.host_bills_for_period("2026-09").unwrap().is_empty());
        assert_eq!(a.host_bill_count().unwrap(), 0);

        // upsert 到已 soft-deleted 的键 → 复活（deleted_at_ms = NULL）。
        a.host_bill_put(
            "b1",
            "workbuddy",
            "workbuddy",
            "2026-09",
            "host_billed",
            12_000,
            "CNY",
            "credit_json",
            5_000,
        )
        .unwrap();
        assert_eq!(a.host_bill_count().unwrap(), 1, "同键再录 → 复活");
        let _ = std::fs::remove_file(&db);
    }
}
