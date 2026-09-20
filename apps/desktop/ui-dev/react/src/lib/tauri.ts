export type Unsubscribe = () => void;

type TauriGlobal = {
  core?: { invoke?: (command: string, args?: unknown) => Promise<unknown> };
  event?: { listen?: (event: string, handler: (payload: unknown) => void) => Promise<Unsubscribe> };
};

const browserPreview: OverviewSnapshot = {
  freshness: "浏览器预览 · 合成数据",
  hosts: 5,
  findings: 0,
  evidence: 8,
  monitored: false,
  today_tokens: 374000,
  today_spend: { CNY: 3.21 },
  month_spend: { CNY: 57.64, USD: 20 },
  subscription_cny_month: 49,
  sync: { ok: true, stage: "complete", at: null },
  budget: { source: "sql", level: "warn", month_cost: 8.64, monthly_cny: 12, month_ratio: 0.72 },
  host_rows: [],
};

export type OverviewSnapshot = {
  freshness: string;
  hosts: number | null;
  findings: number | null;
  evidence: number | null;
  monitored: boolean;
  today_tokens: number | null;
  today_spend: Record<string, number>;
  month_spend: Record<string, number>;
  subscription_cny_month: number | null;
  sync: { ok: boolean; stage: string; at: string | null };
  budget: { source: "sql" | "alert" | "missing"; level: string; month_cost: number | null; monthly_cny: number | null; month_ratio: number | null };
  host_rows: Array<{ host: string; status: "ready" | "partial" | "unavailable"; today_tokens: number | null; today_sessions: number | null; recent_count: number }>;
};

export type UsageDay = {
  date: string;
  total_tokens: number;
  dsh_tokens: number;
  claude_tokens: number;
  codex_tokens: number;
  costs: Record<string, number>;
  cost_lines: Array<{ source: "dsh" | "claude" | "codex"; currency: string; amount: number; basis: "metered_actual" | "metered_estimate" | "api_equivalent" }>;
};

export type UsageCalendar = {
  month: string;
  days: UsageDay[];
};

export type UsageSourceSummary = {
  month: string;
  freshness: "fresh" | "stale" | "partial" | "unavailable" | "unknown";
  last_observed_at: string | null;
  coverage: { measured_fields: number; total_fields: number };
  excluded_hosts: string[];
  actual_spend: Record<string, number>;
  spend_by_basis: Record<string, Record<string, number>>;
};

export type StatisticsTimezone = { timezone: string };

export type UsageHour = {
  hour: number;
  dsh_tokens: number | null;
  claude_tokens: number | null;
  codex_tokens: number | null;
};

export type UsageHourly = {
  date: string;
  hosts_available: { dsh: string | null; claude: string | null; codex: string | null };
  hours: UsageHour[];
};

export type SessionCost = {
  amount_minor: number;
  currency: string;
  basis: "metered_actual" | "metered_estimate" | "fixed_subscription" | "api_equivalent" | "other";
};

export type SessionCostStatus = {
  state: "estimated" | "subscription" | "unpriced" | "unavailable";
  reason: string;
  has_unresolved: boolean;
};

export type SessionRow = {
  session_ref: string;
  host: string;
  first_event_at: string | null;
  last_event_at: string | null;
  event_count: number;
  model_ids: string[];
  tokens: {
    uncached_input_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    output_tokens: number;
    total: number;
  };
  peak_tokens: number;
  cost_minor: SessionCost | null;
  cost_status: SessionCostStatus;
};

export type SessionsPage = {
  sessions: SessionRow[];
  next_cursor: string | null;
  has_more: boolean;
  window_session_count: number;
  window_total_tokens: number;
  window_label: string | null;
};

export type SessionTimelineRow = {
  event_at: string | null;
  model_id: string;
  observation_kind: string;
  peak: boolean;
  tokens: SessionRow["tokens"];
};

export type SessionWorkflowEvent = {
  event_at: string | null;
  event_type: string;
  capability_kind: string | null;
  capability_id: string | null;
  capability_version: string | null;
  outcome: "succeeded" | "failed" | "unknown";
  duration_ms: number | null;
  error_fingerprint: string | null;
  invocation_fingerprint: string | null;
};

export type SessionBillingBucket = {
  provider_id: string;
  provider_raw: string | null;
  model_id: string;
  billing_template_id: string | null;
  billing_mode: string;
  pricing_basis: string;
  evidence_basis: string;
  pricing_version: string | null;
  pricing_source: string | null;
  cost_minor: SessionCost | null;
  peak: boolean;
  tokens: SessionRow["tokens"];
  has_unresolved: boolean;
  unresolved_reason: string | null;
};

export type SessionDetail = SessionRow & {
  billing_breakdown: SessionBillingBucket[];
  timeline: SessionTimelineRow[];
  workflow_timeline: SessionWorkflowEvent[];
  workflow_has_more: boolean;
  has_more: boolean;
  next_cursor: string | null;
};

export type SessionsWindow = "month" | "today" | "7d" | "custom";
export type SessionsCostFilter = "all" | SessionCostStatus["state"];
export type SessionsFilters = {
  window: SessionsWindow;
  month: string;
  date_from: string;
  date_to: string;
  host_kind: string;
  model: string;
  provider: string;
  cost_status: SessionsCostFilter;
};

export type RouteQualityModel = {
  model: string;
  requests: number;
  tokens_total: number;
  last_event_ms: number;
};

export type RouteQualityFamily = {
  family: "anthropic" | "openai" | "deepseek" | "glm" | "minimax" | "gemini" | "qwen" | "synthetic" | "unknown";
  flag: "native" | "non_native" | "api_error" | "no_baseline";
  requests: number;
  sessions: number;
  tokens_total: number;
  last_event_ms: number;
  request_share: number;
  models: RouteQualityModel[];
};

export type RouteQualityHost = {
  host: string;
  has_baseline: boolean;
  native_families: string[];
  totals: { requests: number; sessions: number };
  families: RouteQualityFamily[];
};

export type RouteQualityReport = {
  since_ms: number;
  now_ms: number;
  families_vocabulary: string[];
  hosts: RouteQualityHost[];
};

export type TrustHostCandidate = {
  id: string;
  detected: boolean;
  artifact_profile_available: boolean;
  coverage_state: string;
};

export type TrustEvidence = {
  kind: string;
  stage: string;
  evidence_level: string;
  evidence_origin: string;
  observed_at_ms: number;
  workspace_ref: string | null;
  native_event_ref: string | null;
  scope_classes: string[];
  file_count: number | null;
  byte_count: number | null;
  destination_class: string | null;
  collector_id: string;
};

export type TrustAuditReport = {
  host: string;
  discovered: number;
  inserted: number;
  duplicate: number;
  findings_upserted: number;
  evidence_links_added: number;
  stage_counts: Record<string, number>;
  observation_kind_counts: Record<string, number>;
  evidence: TrustEvidence[];
};

export type TrustDiscovery = { candidates: TrustHostCandidate[]; profile_errors: string[] };

export type TrustMonitorCapability = "not_started" | "available" | "partial" | "unavailable";
export type TrustMonitorConfig = {
  status: "ok" | "unavailable";
  reason: "authority_unavailable" | "monitor_state_unavailable" | null;
  enabled: boolean;
  interval_seconds: number;
  notifications_enabled: boolean;
  capability: TrustMonitorCapability;
  last_success_at_ms: number | null;
  last_error_code: "sensor_unavailable" | "snapshot_failed" | "sensor_partial" | "authority_unavailable" | "monitor_state_unavailable" | null;
  updated_at_ms: number | null;
  notification_permission: "granted" | "denied" | "unavailable" | null;
};

export type TrustSnapshotCapability = "macos_lsof_partial" | "runtime_sensor_unavailable_on_this_platform" | "lsof_unavailable" | "lsof_no_visible_output" | "lsof_invalid_output" | "unavailable";
export type TrustRuntimeSnapshot = {
  capability: TrustSnapshotCapability;
  candidate_processes: number;
  observations: number;
  inserted: number;
  duplicate: number;
  findings_upserted: number;
  notification_candidates: number;
  evidence_links_added: number;
};

export type FindingStatusRollup = {
  open: number;
  later: number;
  acknowledged: number;
  resolved: number;
  not_applicable: number;
};

export type FindingSample = {
  has_evidence: boolean;
};

export type FindingGroup = {
  group_id: string;
  action_kind: string;
  rule: string;
  host: string;
  evidence_class: string;
  count: number;
  first_seen_at_ms: number;
  last_seen_at_ms: number;
  severity: string;
  status_rollup: FindingStatusRollup;
  sessions_count: number;
  sample_evidence: FindingSample[];
  read_only: boolean;
  manual_follow_up: boolean;
};

export type FindingsReport = {
  totals: { issues: number; findings: number; critical: number; warning: number; info: number; sessions: number; sessions_total: number };
  rules: Array<{ rule: string; severity: string; category: string; hits: number; sessions: number }>;
  issues: FindingGroup[];
  next_cursor: string | null;
  refreshed: boolean;
};

export type FindingsFreshness = {
  status: "ok" | "unavailable";
  state: "fresh" | "stale" | "not_yet_synced" | "unknown";
  last_successful_sync_at: string | null;
  stale_hosts: string[];
  syncing: boolean;
};

export type DecisionAmount = { amount_minor: number; currency: string; basis: string };
export type DecisionTopSession = {
  session_ref: string;
  span_first_ms: number;
  span_last_ms: number;
  tokens_total: number;
  failures: number;
};
export type DecisionMatrixRow = {
  host: string;
  model_id: string;
  provider_id: string;
  sessions: number;
  tokens: { uncached_input: number; cache_read: number; cache_write: number; output: number; total: number };
  cache_hit_ratio: number | null;
  has_subscription: boolean;
  waste_rate: number | null;
  amounts: DecisionAmount[];
  top_sessions: DecisionTopSession[];
  host_behavior: Record<string, number>;
  limit_pressure: { hits: number; per_session: number | null } | null;
  cost_provider_unresolved: boolean;
};
export type DecisionSummary = {
  kind: "cost_outlier" | "marathon" | "currency_split";
  currency?: string;
  outlier?: { host: string; model_id: string; provider_id: string; per_session_minor: number; cache_hit_ratio: number | null; uncached_tokens: number };
  control?: { host: string; model_id: string; provider_id: string; per_session_minor: number; cache_hit_ratio: number | null; uncached_tokens: number };
  ratio_vs_control?: number;
  saving_minor?: number;
  saving_pct?: number;
  session_ref?: string;
  span_hours?: number;
  tokens_total?: number;
  failures?: number;
  combo?: { host: string; model_id: string };
  currencies?: string[];
  by_currency?: Record<string, { combos: number; tokens: number }>;
};
export type DecisionMatrixReport = {
  schema_version: "agent-vitals-decision-matrix/v1";
  status: "ok";
  month: string;
  rows: DecisionMatrixRow[];
  findings_summary: DecisionSummary[];
  limitations: string[];
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} DTO 格式不兼容`);
  return value as Record<string, unknown>;
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 256) throw new Error(`${label} DTO 字段不安全`);
  return value;
}

function decisionLabel(value: unknown, label: string): string {
  const text = stringField(value, label);
  const valid = text === "<unknown>" || text === "<synthetic>" || (/^[A-Za-z0-9][A-Za-z0-9._:@+<>-]{0,127}(\/[A-Za-z0-9][A-Za-z0-9._:@+<>-]{0,127})?$/.test(text) && !text.includes("://") && !text.includes("..") && !text.startsWith("file:") && !/^[A-Za-z]:/.test(text));
  if (!valid) throw new Error(`${label} DTO 标识不安全`);
  return text;
}

function decisionCurrency(value: unknown, label: string): string {
  const text = stringField(value, label);
  if (!/^[A-Z0-9_]{1,12}$/.test(text)) throw new Error(`${label} DTO 币种不安全`);
  return text;
}

function decisionBasis(value: unknown, label: string): string {
  const text = stringField(value, label);
  if (text !== "metered_actual" && text !== "metered_estimate" && text !== "fixed_subscription" && text !== "api_equivalent" && text !== "other") throw new Error(`${label} DTO 计价口径不安全`);
  return text;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return stringField(value, label);
}

function nullableCount(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} DTO 计数不安全`);
  return value;
}

function requiredArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} DTO 缺少数组字段`);
  return value;
}

function requiredCount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} DTO 缺少安全计数`);
  return value;
}

function boundedCount(value: unknown, label: string, maximum = 1_000_000_000): number {
  const count = requiredCount(value, label);
  if (count > maximum) throw new Error(`${label} DTO 计数超限`);
  return count;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} DTO 状态不安全`);
  return value;
}

function requiredFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} DTO 数值不安全`);
  return value;
}

function safeReference(value: unknown, label: string): string | null {
  const reference = nullableString(value, label);
  if (reference !== null && !/^tr_[A-Za-z0-9_-]{8,128}$/.test(reference)) throw new Error(`${label} DTO 引用格式不安全`);
  return reference;
}

function boundedEnum(value: unknown, label: string, allowed: readonly string[], fallback: string): string {
  const candidate = stringField(value, label);
  return allowed.includes(candidate) ? candidate : fallback;
}

function safeHostLabel(value: unknown): string {
  if (typeof value !== "string") return "generic";
  const candidate = value;
  if (/^plugin:[a-z][a-z0-9-]{0,31}$/.test(candidate)) return candidate;
  return /^[a-z][a-z0-9_-]{0,31}$/.test(candidate) ? candidate : "generic";
}

function safeMoneyMap(value: unknown, label: string): Record<string, number> {
  if (value === null || value === undefined) return {};
  const source = record(value, label);
  return Object.fromEntries(Object.entries(source).slice(0, 8).flatMap(([currency, amount]) => {
    if (!/^[A-Z0-9_]{1,12}$/.test(currency) || typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 1e15) return [];
    return [[currency, amount]];
  }));
}

function nullableMoney(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1e15) throw new Error(`${label} DTO 金额不安全`);
  return value;
}

function overviewTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return null;
  return value;
}

function parseOverviewSnapshot(value: unknown): OverviewSnapshot {
  const root = record(value, "overview");
  const syncRow = root.sync == null ? {} : record(root.sync, "overview sync");
  const syncStage = boundedEnum(syncRow.stage ?? "unknown", "overview sync stage", ["complete", "fold", "discover", "resolve", "never", "paused", "unknown"], "unknown");
  const syncOk = syncRow.ok === true && syncStage !== "unknown";
  const syncAt = overviewTimestamp(syncRow.at);
  const budgetRow = root.budget == null ? {} : record(root.budget, "overview budget");
  const budgetSource = boundedEnum(budgetRow.source ?? "missing", "overview budget source", ["sql", "alert", "missing"], "missing") as OverviewSnapshot["budget"]["source"];
  const budgetLevel = boundedEnum(budgetRow.level ?? "unknown", "overview budget level", ["no_budget", "ok", "warn", "over", "snoozed", "disabled", "unknown"], "unknown");
  const rawHosts = Array.isArray(root.hosts) ? root.hosts : [];
  const hostRows = rawHosts.slice(0, 16).map((item) => {
    const row = record(item, "overview host");
    return {
      host: safeHostLabel(row.host_kind),
      status: boundedEnum(row.status, "overview host status", ["ready", "partial", "unavailable"], "unavailable") as OverviewSnapshot["host_rows"][number]["status"],
      today_tokens: nullableCount(row.today_tokens, "overview host tokens"),
      today_sessions: nullableCount(row.today_sessions, "overview host sessions"),
      recent_count: Array.isArray(row.recent) ? Math.min(row.recent.length, 100) : 0,
    };
  });
  const today = root.today == null ? null : record(root.today, "overview today");
  const month = root.month == null ? null : record(root.month, "overview month");
  const todaySpend = safeMoneyMap(today?.total_actual_spend, "overview today spend");
  const monthSpend = safeMoneyMap(month?.total_actual_spend, "overview month spend");
  const todayTokens = root.today_tokens_sql === null || root.today_tokens_sql === undefined
    ? null : boundedCount(root.today_tokens_sql, "overview today tokens");
  const subscription = nullableMoney(root.subscription_cny_month, "overview subscription");
  const hostCount = rawHosts.length ? Math.min(rawHosts.length, 16) : (root.tokens_by_host && typeof root.tokens_by_host === "object" && !Array.isArray(root.tokens_by_host) ? Math.min(Object.keys(root.tokens_by_host).length, 16) : null);
  return {
    freshness: syncAt ? `本地同步 · ${syncAt}` : syncOk ? "本地同步 · 已完成" : "本地同步 · 状态不可用",
    hosts: hostCount,
    findings: null,
    evidence: null,
    monitored: false,
    today_tokens: todayTokens,
    today_spend: todaySpend,
    month_spend: monthSpend,
    subscription_cny_month: subscription,
    sync: { ok: syncOk, stage: syncStage, at: syncAt },
    budget: { source: budgetSource, level: budgetLevel, month_cost: nullableMoney(budgetRow.month_cost, "overview month cost"), monthly_cny: nullableMoney(budgetRow.monthly_cny, "overview monthly budget"), month_ratio: budgetRow.month_ratio == null ? null : Math.min(requiredFiniteNumber(budgetRow.month_ratio, "overview budget ratio"), 1000) },
    host_rows: hostRows,
  };
}

function safeMonth(value: unknown, label: string): string {
  const month = stringField(value, label);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`${label} DTO 月份不安全`);
  return month;
}

function safeDate(value: unknown, label: string): string {
  const date = stringField(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${label} DTO 日期不安全`);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) throw new Error(`${label} DTO 日期不安全`);
  return date;
}

function safeNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1e15) throw new Error(`${label} DTO 数值不安全`);
  return value;
}

function safeNullableToken(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  return boundedCount(value, label, 1_000_000_000_000_000);
}

function parseUsageDay(value: unknown, date: string): UsageDay {
  const row = record(value, "usage day");
  const costs: Record<string, number> = {};
  const rawCosts = [
    ["dsh", "CNY", row.dsh_cost_cny, "metered_actual"],
    ["claude", "CNY", row.claude_cost_cny, "metered_estimate"],
    ["claude", "USD", row.claude_cost_usd, "metered_estimate"],
    ["codex", "USD", row.codex_cost_usd, "api_equivalent"],
  ] as const;
  const costLines = rawCosts.map(([source, currency, rawAmount, basis]) => {
    const amount = safeNonNegativeNumber(rawAmount, `usage ${source} ${currency} cost`);
    costs[currency] = (costs[currency] ?? 0) + amount;
    return { source, currency, amount, basis };
  }).filter((line) => line.amount > 0);
  const dshTokens = boundedCount(row.dsh_tokens, "usage dsh tokens", 1_000_000_000_000_000);
  const claudeTokens = boundedCount(row.claude_tokens, "usage claude tokens", 1_000_000_000_000_000);
  const codexTokens = boundedCount(row.codex_tokens, "usage codex tokens", 1_000_000_000_000_000);
  const totalTokens = boundedCount(row.total_tokens, "usage total tokens", 1_000_000_000_000_000);
  if (totalTokens !== dshTokens + claudeTokens + codexTokens) throw new Error("usage token totals 不守恒");
  return {
    date,
    total_tokens: totalTokens, dsh_tokens: dshTokens, claude_tokens: claudeTokens, codex_tokens: codexTokens, costs, cost_lines: costLines,
  };
}

function parseUsageCalendar(value: unknown): UsageCalendar {
  const root = record(value, "usage calendar");
  const month = safeMonth(root.month, "usage month");
  const daysObject = record(root.days, "usage days");
  const entries = Object.entries(daysObject);
  if (entries.length > 62) throw new Error("usage days 超出月份范围");
  const days = entries.map(([date, item]) => {
    const safe = safeDate(date, "usage day key");
    if (!safe.startsWith(`${month}-`)) throw new Error("usage day 不属于请求月份");
    return parseUsageDay(item, safe);
  });
  return { month, days: days.sort((left, right) => left.date.localeCompare(right.date)) };
}

function parseUsageSourceSummary(value: unknown): UsageSourceSummary {
  const root = record(value, "usage source summary");
  const month = safeMonth(root.month, "usage summary month");
  const freshnessRow = record(root.freshness, "usage freshness");
  const freshness = boundedEnum(freshnessRow.state, "usage freshness state", ["fresh", "stale", "partial", "unavailable"], "unknown") as UsageSourceSummary["freshness"];
  const coverageRow = record(root.coverage, "usage coverage");
  const excluded = requiredArray(root.excluded_hosts, "usage excluded hosts").slice(0, 32).map((host) => safeHostLabel(host));
  const measured = boundedCount(coverageRow.measured_fields, "usage measured fields", 1_000);
  const total = boundedCount(coverageRow.total_fields, "usage total fields", 1_000);
  if (measured > total) throw new Error("usage coverage 不守恒");
  const rawBasis = record(root.actual_spend_by_basis, "usage spend by basis");
  const spendByBasis: Record<string, Record<string, number>> = {};
  for (const basis of ["metered_actual", "host_billed", "fixed_subscription", "metered_declared", "metered_estimate", "api_equivalent", "other"]) {
    if (rawBasis[basis] !== undefined) spendByBasis[basis] = safeMoneyMap(rawBasis[basis], `usage ${basis} spend`);
  }
  return {
    month,
    freshness,
    last_observed_at: safeTimestamp(freshnessRow.last_observed_at, "usage observed at"),
    coverage: { measured_fields: measured, total_fields: total },
    excluded_hosts: excluded,
    actual_spend: safeMoneyMap(root.total_actual_spend, "usage actual spend"),
    spend_by_basis: spendByBasis,
  };
}

function parseUsageHourly(value: unknown): UsageHourly {
  const root = record(value, "usage hourly");
  const date = safeDate(root.date, "usage hourly date");
  const source = record(root.hosts_available, "usage hourly sources");
  const sourceValue = (key: string): string | null => {
    if (source[key] === null || source[key] === undefined) return null;
    const value = boundedEnum(source[key], `usage hourly ${key} source`, ["sql-facts"], "unknown");
    return value === "sql-facts" ? value : null;
  };
  const rawHours = requiredArray(root.hours, "usage hours");
  if (rawHours.length !== 24) throw new Error("usage hours 必须有 24 个小时");
  const hours = rawHours.map((item) => {
    const row = record(item, "usage hour");
    const hour = requiredCount(row.hour, "usage hour index");
    if (hour > 23) throw new Error("usage hour index 超出范围");
    return { hour, dsh_tokens: safeNullableToken(row.dsh_tokens, "usage hourly dsh"), claude_tokens: safeNullableToken(row.claude_tokens, "usage hourly claude"), codex_tokens: safeNullableToken(row.codex_tokens, "usage hourly codex") };
  }).sort((left, right) => left.hour - right.hour);
  if (hours.length !== 24 || new Set(hours.map((hour) => hour.hour)).size !== 24) throw new Error("usage hours 必须覆盖 0-23 且不可重复");
  return { date, hosts_available: { dsh: sourceValue("dsh"), claude: sourceValue("claude"), codex: sourceValue("codex") }, hours };
}

function parseSessionCost(value: unknown, label: string): SessionCost | null {
  if (value === null || value === undefined) return null;
  const row = record(value, label);
  return {
    amount_minor: boundedCount(row.amount_minor, `${label} amount`, 1_000_000_000_000_000),
    currency: decisionCurrency(row.currency, `${label} currency`),
    basis: decisionBasis(row.basis, `${label} basis`) as SessionCost["basis"],
  };
}

function parseSessionTokens(value: unknown, label: string): SessionRow["tokens"] {
  const tokenRow = record(value, label);
  const uncached = boundedCount(tokenRow.uncached_input_tokens, `${label} uncached input`, 1_000_000_000_000_000);
  const cacheRead = boundedCount(tokenRow.cache_read_tokens, `${label} cache read`, 1_000_000_000_000_000);
  const cacheWrite = boundedCount(tokenRow.cache_write_tokens, `${label} cache write`, 1_000_000_000_000_000);
  const output = boundedCount(tokenRow.output_tokens, `${label} output`, 1_000_000_000_000_000);
  const total = boundedCount(tokenRow.total, `${label} total`, 1_000_000_000_000_000);
  if (total !== uncached + cacheRead + cacheWrite + output) throw new Error(`${label} token totals 不守恒`);
  return { uncached_input_tokens: uncached, cache_read_tokens: cacheRead, cache_write_tokens: cacheWrite, output_tokens: output, total };
}

function parseSessionCostStatus(value: unknown): SessionCostStatus {
  const costStatus = record(value, "session cost status");
  const state = boundedEnum(costStatus.state, "session cost state", ["estimated", "subscription", "unpriced", "unavailable"], "unavailable") as SessionCostStatus["state"];
  const reason = boundedEnum(costStatus.reason, "session cost reason", [
    "no-usage-facts", "subscription-token-usage-is-not-a-per-token-bill", "official-card-fallback-estimate",
    "metered-estimate", "multiple-provider-costs-require-breakdown", "no-pricing-snapshot", "no-price-card",
    "cost-unavailable", "cost-query-failed",
  ], "cost-unavailable");
  return { state, reason, has_unresolved: requiredBoolean(costStatus.has_unresolved, "session cost unresolved") };
}

function parseSessionRow(value: unknown): SessionRow {
  const row = record(value, "session row");
  const sessionRef = stringField(row.session_ref, "session ref");
  if (!/^sr_[A-Za-z0-9_-]{8,128}$/.test(sessionRef)) throw new Error("session ref DTO 引用格式不安全");
  const tokens = parseSessionTokens(row.tokens, "session tokens");
  const modelIds = requiredArray(row.model_ids, "session model ids").slice(0, 16).map((model) => decisionLabel(model, "session model"));
  return {
    session_ref: sessionRef,
    host: safeHostLabel(row.host),
    first_event_at: safeTimestamp(row.first_event_at, "session first event"),
    last_event_at: safeTimestamp(row.last_event_at, "session last event"),
    event_count: boundedCount(row.event_count, "session event count", 1_000_000_000),
    model_ids: modelIds,
    tokens,
    peak_tokens: boundedCount(row.peak_tokens, "session peak tokens", 1_000_000_000_000_000),
    cost_minor: parseSessionCost(row.cost_minor, "session cost"),
    cost_status: parseSessionCostStatus(row.cost_status),
  };
}

function safeWorkflowLabel(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  const text = stringField(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@+\-]{0,127}$/.test(text) || text.includes("..")) return null;
  return text;
}

function safeFingerprint(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  const text = stringField(value, label);
  return /^fnv1a64:[0-9a-f]{16}$/.test(text) ? text : null;
}

function safeBillingReason(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return boundedEnum(value, "session billing reason", [
    "subscription token usage is not a per-token bill",
    "no pricing snapshot covers this event time",
    "no compatible price card for this provider/model bucket",
    "provider-specific price card unavailable; official-card fallback estimate required",
  ], "cost-unavailable");
}

function parseSessionTimeline(value: unknown): SessionTimelineRow {
  const row = record(value, "session timeline row");
  return {
    event_at: safeTimestamp(row.event_at, "session timeline event"),
    model_id: decisionLabel(row.model_id, "session timeline model"),
    observation_kind: safeWorkflowLabel(row.observation_kind, "session observation") ?? "unknown",
    peak: requiredBoolean(row.peak, "session timeline peak"),
    tokens: parseSessionTokens(row.tokens, "session timeline tokens"),
  };
}

function parseSessionWorkflowEvent(value: unknown): SessionWorkflowEvent {
  const row = record(value, "session workflow event");
  const eventType = boundedEnum(row.event_type, "session workflow event type", ["task_started", "task_finished", "skill_invoked", "skill_finished", "tool_invoked", "tool_finished", "model_switched"], "unknown");
  const outcome = boundedEnum(row.outcome, "session workflow outcome", ["succeeded", "failed"], "unknown") as SessionWorkflowEvent["outcome"];
  const duration = row.duration_ms === null || row.duration_ms === undefined ? null : boundedCount(row.duration_ms, "session workflow duration", 86_400_000);
  return {
    event_at: safeTimestamp(row.event_at, "session workflow event time"),
    event_type: eventType,
    capability_kind: row.capability_kind === null || row.capability_kind === undefined ? null : boundedEnum(row.capability_kind, "session capability kind", ["skill", "tool", "model", "subagent"], "unknown"),
    capability_id: safeWorkflowLabel(row.capability_id, "session capability id"),
    capability_version: safeWorkflowLabel(row.capability_version, "session capability version"),
    outcome,
    duration_ms: duration,
    error_fingerprint: safeFingerprint(row.error_fingerprint, "session error fingerprint"),
    invocation_fingerprint: safeFingerprint(row.invocation_fingerprint, "session invocation fingerprint"),
  };
}

function parseSessionBillingBucket(value: unknown): SessionBillingBucket {
  const row = record(value, "session billing bucket");
  return {
    provider_id: decisionLabel(row.provider_id ?? "<unknown>", "session provider"),
    provider_raw: row.provider_raw === null || row.provider_raw === undefined ? null : decisionLabel(row.provider_raw, "session provider raw"),
    model_id: decisionLabel(row.model_id, "session billing model"),
    billing_template_id: safeWorkflowLabel(row.billing_template_id, "session billing template"),
    billing_mode: safeWorkflowLabel(row.billing_mode, "session billing mode") ?? "unknown",
    pricing_basis: safeWorkflowLabel(row.pricing_basis, "session pricing basis") ?? "unavailable",
    evidence_basis: safeWorkflowLabel(row.evidence_basis, "session evidence basis") ?? "unknown",
    pricing_version: safeWorkflowLabel(row.pricing_version, "session pricing version"),
    pricing_source: safeWorkflowLabel(row.pricing_source, "session pricing source"),
    cost_minor: parseSessionCost(row.cost_minor, "session bucket cost"),
    peak: requiredBoolean(row.peak, "session billing peak"),
    tokens: parseSessionTokens(row.tokens, "session billing tokens"),
    has_unresolved: requiredBoolean(row.has_unresolved, "session billing unresolved"),
    unresolved_reason: safeBillingReason(row.unresolved_reason),
  };
}

function parseSessionDetail(value: unknown): SessionDetail {
  const root = record(value, "session detail envelope");
  const data = record(root.data, "session detail data");
  const base = parseSessionRow(data);
  const timeline = requiredArray(data.timeline, "session detail timeline").slice(0, 1000).map(parseSessionTimeline);
  const workflow = requiredArray(data.workflow_timeline, "session workflow timeline").slice(0, 1000).map(parseSessionWorkflowEvent);
  const billing = requiredArray(data.billing_breakdown, "session billing breakdown").slice(0, 500).map(parseSessionBillingBucket);
  const hasMore = requiredBoolean(data.has_more, "session detail has more");
  const nextCursor = data.next_cursor === null || data.next_cursor === undefined ? null : stringField(data.next_cursor, "session detail cursor");
  if (nextCursor !== null && (nextCursor.length < 1 || nextCursor.length > 4096)) throw new Error("session detail cursor DTO 不安全");
  if (hasMore && nextCursor === null) throw new Error("session detail 分页缺少 next_cursor");
  return { ...base, billing_breakdown: billing, timeline, workflow_timeline: workflow, workflow_has_more: requiredBoolean(data.workflow_has_more, "session workflow has more"), has_more: hasMore, next_cursor: nextCursor };
}

function parseSessionsPage(value: unknown): SessionsPage {
  const root = record(value, "sessions envelope");
  const data = record(root.data, "sessions data");
  const rows = requiredArray(data.sessions, "sessions rows");
  if (rows.length > 500) throw new Error("sessions rows 超出页面上限");
  const sessions = rows.map(parseSessionRow);
  const hasMore = requiredBoolean(data.has_more, "sessions has more");
  const nextCursor = data.next_cursor === null || data.next_cursor === undefined ? null : stringField(data.next_cursor, "sessions cursor");
  if (nextCursor !== null && (nextCursor.length < 1 || nextCursor.length > 4096)) throw new Error("sessions cursor DTO 不安全");
  if (hasMore && nextCursor === null) throw new Error("sessions 分页缺少 next_cursor");
  const windowSessionCount = boundedCount(data.window_session_count, "sessions window count", 10_000_000);
  const windowTotalTokens = boundedCount(data.window_total_tokens, "sessions window tokens", 1_000_000_000_000_000);
  if (windowSessionCount < sessions.length) throw new Error("sessions window count 小于当前页");
  const pageTokens = sessions.reduce((sum, session) => sum + session.tokens.total, 0);
  if (pageTokens > windowTotalTokens) throw new Error("sessions 当前页 token 超出窗口总量");
  const window = data.window === null || data.window === undefined ? null : record(data.window, "sessions window");
  return { sessions, next_cursor: nextCursor, has_more: hasMore, window_session_count: windowSessionCount, window_total_tokens: windowTotalTokens, window_label: window ? nullableString(window.label, "sessions window label") : null };
}

const routeFamilies = ["anthropic", "openai", "deepseek", "glm", "minimax", "gemini", "qwen", "synthetic", "unknown"] as const;
const routeFlags = ["native", "non_native", "api_error", "no_baseline"] as const;

function routeFamily(value: unknown, label: string): RouteQualityFamily["family"] {
  return boundedEnum(value, label, routeFamilies, "unknown") as RouteQualityFamily["family"];
}

function routeModel(value: unknown, label: string): string {
  return decisionLabel(value, label);
}

function parseRouteQualityModel(value: unknown): RouteQualityModel {
  const row = record(value, "route quality model");
  return {
    model: routeModel(row.model, "route quality model id"),
    requests: boundedCount(row.requests, "route quality model requests", 1_000_000_000),
    tokens_total: boundedCount(row.tokens_total, "route quality model tokens", 1_000_000_000_000_000),
    last_event_ms: boundedCount(row.last_event_ms, "route quality model last event", 9_000_000_000_000),
  };
}

function parseRouteQualityFamily(value: unknown): RouteQualityFamily {
  const row = record(value, "route quality family");
  const models = requiredArray(row.models, "route quality models");
  if (models.length > 128) throw new Error("route quality models 超出上限");
  const share = requiredFiniteNumber(row.request_share, "route quality request share");
  if (share > 100) throw new Error("route quality request share 超出范围");
  return {
    family: routeFamily(row.family, "route quality family name"),
    flag: boundedEnum(row.flag, "route quality family flag", routeFlags, "no_baseline") as RouteQualityFamily["flag"],
    requests: boundedCount(row.requests, "route quality family requests", 1_000_000_000),
    sessions: boundedCount(row.sessions, "route quality family sessions", 1_000_000_000),
    tokens_total: boundedCount(row.tokens_total, "route quality family tokens", 1_000_000_000_000_000),
    last_event_ms: boundedCount(row.last_event_ms, "route quality family last event", 9_000_000_000_000),
    request_share: share,
    models: models.map(parseRouteQualityModel),
  };
}

function parseRouteQuality(value: unknown): RouteQualityReport {
  const root = record(value, "route quality report");
  const hosts = requiredArray(root.hosts, "route quality hosts");
  if (hosts.length > 128) throw new Error("route quality hosts 超出上限");
  const vocabulary = requiredArray(root.families_vocabulary, "route quality vocabulary").slice(0, 32).map((item) => {
    const family = stringField(item, "route quality vocabulary item");
    if (!(routeFamilies as readonly string[]).includes(family)) throw new Error("route quality vocabulary 含未知模型族");
    return family;
  });
  return {
    since_ms: boundedCount(root.since_ms, "route quality since", 9_000_000_000_000),
    now_ms: boundedCount(root.now_ms, "route quality now", 9_000_000_000_000),
    families_vocabulary: vocabulary,
    hosts: hosts.map((item) => {
      const row = record(item, "route quality host");
      const totals = record(row.totals, "route quality totals");
      const native = requiredArray(row.native_families, "route quality native families").slice(0, 16).map((family) => routeFamily(family, "route quality native family"));
      const families = requiredArray(row.families, "route quality host families");
      if (families.length > 32) throw new Error("route quality families 超出上限");
      return {
        host: safeHostLabel(row.host),
        has_baseline: requiredBoolean(row.has_baseline, "route quality baseline"),
        native_families: native,
        totals: { requests: boundedCount(totals.requests, "route quality total requests", 1_000_000_000), sessions: boundedCount(totals.sessions, "route quality total sessions", 1_000_000_000) },
        families: families.map(parseRouteQualityFamily),
      };
    }),
  };
}

function safeTrustIdentifier(value: unknown, label: string, fallback = "unknown"): string {
  if (typeof value !== "string" || value.length > 96 || !/^[a-z][a-z0-9_-]{0,95}$/.test(value)) return fallback;
  return value;
}

function safeTimestamp(value: unknown, _label: string): string | null {
  if (value === null || value === undefined || typeof value !== "string") return null;
  const candidate = value;
  // Rust emits RFC3339 timestamps; reject permissive Date.parse inputs so a
  // malformed freshness payload cannot be rendered as "fresh".
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(candidate) || Number.isNaN(Date.parse(candidate))) {
    return null;
  }
  return candidate;
}

function safeHash(value: unknown, label: string): string {
  const reference = stringField(value, label);
  if (!/^fnv1a64:[0-9a-f]{16}$/.test(reference)) throw new Error(`${label} DTO 引用格式不安全`);
  return reference;
}

function parseTrustDiscovery(value: unknown): TrustDiscovery {
  const root = record(value, "trust discovery");
  const candidates = requiredArray(root.candidates, "trust candidates").map((item) => {
    const row = record(item, "trust candidate");
    if (typeof row.detected !== "boolean" || typeof row.artifact_profile_available !== "boolean") throw new Error("trust candidate 状态不安全");
    return {
      id: safeHostLabel(row.id),
      detected: row.detected,
      artifact_profile_available: row.artifact_profile_available,
      coverage_state: boundedEnum(row.coverage_state, "trust coverage state", ["not_detected", "profiled", "detected_unprofiled"], "unknown"),
    };
  });
  const profileErrors = requiredArray(root.profile_errors, "profile errors").slice(0, 16).map((item) => safeTrustIdentifier(item, "profile error", "profile_error_unavailable"));
  return { candidates, profile_errors: profileErrors };
}

function parseTrustAudit(value: unknown): TrustAuditReport {
  const root = record(value, "trust audit");
  const evidence = requiredArray(root.evidence, "trust evidence").map((item) => {
    const row = record(item, "trust evidence");
    const scopes = Array.isArray(row.scope_classes) ? row.scope_classes.slice(0, 16).map((scope) => safeTrustIdentifier(scope, "scope class", "unknown_scope")) : [];
    if (typeof row.observed_at_ms !== "number" || !Number.isSafeInteger(row.observed_at_ms) || row.observed_at_ms < 0) throw new Error("trust evidence timestamp 不安全");
    return {
      kind: boundedEnum(row.kind, "evidence kind", ["file_scope", "package", "credential", "connection", "outbound_bytes", "remote_ack", "consent_state", "retry"], "unknown"),
      stage: boundedEnum(row.stage, "evidence stage", ["read_observed", "package_observed", "credential_observed", "egress_attempted", "egress_transmitted", "remote_accepted"], "unknown"),
      evidence_level: boundedEnum(row.evidence_level, "evidence level", ["E0", "E1", "E2", "E3", "E4", "E5"], "unknown"),
      evidence_origin: boundedEnum(row.evidence_origin, "evidence origin", ["local_artifact", "client_state_claim", "runtime_process_metadata", "network_metadata", "verified_receipt", "unknown_legacy"], "unknown"),
      observed_at_ms: row.observed_at_ms, workspace_ref: safeReference(row.workspace_ref, "workspace ref"),
      native_event_ref: safeReference(row.native_event_ref, "native event ref"), scope_classes: scopes,
      file_count: nullableCount(row.file_count, "file count"), byte_count: nullableCount(row.byte_count, "byte count"),
      destination_class: row.destination_class == null ? null : boundedEnum(row.destination_class, "destination class", ["vendor_api", "object_storage", "telemetry", "eval", "model_api", "unknown"], "unknown"), collector_id: safeTrustIdentifier(row.collector_id, "collector id"),
    };
  });
  const count = (name: string) => requiredCount(root[name], name);
  const map = (name: string) => {
    const source = record(root[name], name);
    return Object.fromEntries(Object.entries(source).map(([key, item]) => [stringField(key, name), requiredCount(item, name)]));
  };
  return {
    host: stringField(root.host, "trust host"), discovered: count("discovered"), inserted: count("inserted"), duplicate: count("duplicate"),
    findings_upserted: count("findings_upserted"), evidence_links_added: count("evidence_links_added"),
    stage_counts: map("stage_counts"), observation_kind_counts: map("observation_kind_counts"), evidence,
  };
}

function nullableTimestampMs(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  return requiredCount(value, label);
}

function parseTrustMonitorConfig(value: unknown): TrustMonitorConfig {
  const root = record(value, "trust monitor config");
  const status = root.status === "ok" ? "ok" : "unavailable";
  const reason = root.reason === "authority_unavailable" || root.reason === "monitor_state_unavailable" ? root.reason : null;
  const capability = boundedEnum(root.capability, "trust monitor capability", ["not_started", "available", "partial", "unavailable"], "unavailable") as TrustMonitorCapability;
  const rawInterval = root.interval_seconds;
  const interval_seconds = typeof rawInterval === "number" && Number.isSafeInteger(rawInterval) && rawInterval >= 5 && rawInterval <= 3600 ? rawInterval : 30;
  const rawError = root.last_error_code;
  const allowedErrors = ["sensor_unavailable", "snapshot_failed", "sensor_partial", "authority_unavailable", "monitor_state_unavailable"] as const;
  const last_error_code = rawError === null || rawError === undefined ? null : boundedEnum(rawError, "trust monitor error", allowedErrors, "sensor_unavailable") as TrustMonitorConfig["last_error_code"];
  const rawPermission = root.notification_permission;
  const notification_permission = rawPermission === null || rawPermission === undefined
    ? null
    : boundedEnum(rawPermission, "notification permission", ["granted", "denied", "unavailable"], "unavailable") as TrustMonitorConfig["notification_permission"];
  return {
    status, reason,
    enabled: root.enabled === true,
    interval_seconds,
    notifications_enabled: root.notifications_enabled === true,
    capability,
    last_success_at_ms: nullableTimestampMs(root.last_success_at_ms, "last monitor success"),
    last_error_code,
    updated_at_ms: nullableTimestampMs(root.updated_at_ms, "monitor updated at"),
    notification_permission,
  };
}

function parseTrustRuntimeSnapshot(value: unknown): TrustRuntimeSnapshot {
  const root = record(value, "trust runtime snapshot");
  return {
    capability: boundedEnum(root.capability, "runtime capability", ["macos_lsof_partial", "runtime_sensor_unavailable_on_this_platform", "lsof_unavailable", "lsof_no_visible_output", "lsof_invalid_output"], "unavailable") as TrustSnapshotCapability,
    candidate_processes: boundedCount(root.candidate_processes, "candidate processes"),
    observations: boundedCount(root.observations, "runtime observations"),
    inserted: boundedCount(root.inserted, "runtime inserted"),
    duplicate: boundedCount(root.duplicate, "runtime duplicate"),
    findings_upserted: boundedCount(root.findings_upserted, "runtime findings"),
    notification_candidates: boundedCount(root.notification_candidates, "runtime notifications"),
    evidence_links_added: boundedCount(root.evidence_links_added, "runtime evidence links"),
  };
}

function parseFindingGroup(value: unknown): FindingGroup {
  const row = record(value, "finding group");
  const status = record(row.status_rollup, "finding status rollup");
  const rawSamples = requiredArray(row.sample_evidence, "finding sample evidence");
  if (rawSamples.length > 3) throw new Error("finding sample evidence 超出上限");
  const sampleEvidence = rawSamples.map((item) => {
    const sample = record(item, "finding sample");
    if (typeof sample.available !== "boolean") throw new Error("finding sample DTO 状态不安全");
    return { has_evidence: sample.available };
  });
  const count = (name: string) => requiredCount(status[name], name);
  const firstSeen = requiredCount(row.first_seen_at_ms, "finding first seen");
  const lastSeen = requiredCount(row.last_seen_at_ms, "finding last seen");
  if (firstSeen > lastSeen) throw new Error("finding 时间范围不安全");
  return {
    group_id: safeHash(row.group_id, "finding group id"),
    action_kind: boundedEnum(row.action_kind, "finding action kind", ["behavior", "billing", "budget", "source", "usage", "probe", "other"], "other"),
    rule: stringField(row.rule, "finding rule"), host: safeHostLabel(row.host),
    evidence_class: boundedEnum(row.evidence_class, "finding evidence class", ["egress", "billing", "data_source", "trust", "usage", "behavior", "generic"], "generic"),
    count: requiredCount(row.count, "finding count"), first_seen_at_ms: firstSeen,
    last_seen_at_ms: lastSeen, severity: stringField(row.severity, "finding severity"),
    status_rollup: { open: count("open"), later: count("later"), acknowledged: count("acknowledged"), resolved: count("resolved"), not_applicable: count("not_applicable") },
    sessions_count: requiredCount(row.sessions_count, "finding sessions"), sample_evidence: sampleEvidence,
    read_only: requiredBoolean(row.read_only, "finding read_only"), manual_follow_up: requiredBoolean(row.manual_follow_up, "finding manual_follow_up"),
  };
}

function parseFindings(value: unknown): FindingsReport {
  const root = record(value, "findings report");
  if (root.schema_version !== "agent-vitals-findings/v1" || root.status !== "ok") throw new Error("findings DTO schema mismatch");
  const totals = record(root.totals, "findings totals");
  const rules = requiredArray(root.rules, "finding rules").map((item) => {
    const row = record(item, "finding rule");
    return { rule: stringField(row.rule, "rule"), severity: stringField(row.severity, "rule severity"), category: typeof row.category === "string" ? row.category : "—", hits: requiredCount(row.hits, "rule hits"), sessions: requiredCount(row.sessions, "rule sessions") };
  });
  const nextCursor = root.next_cursor == null ? null : stringField(root.next_cursor, "findings cursor");
  return {
    totals: { issues: requiredCount(totals.issues, "issues total"), findings: requiredCount(totals.findings, "findings total"), critical: requiredCount(totals.critical, "critical total"), warning: requiredCount(totals.warning, "warning total"), info: requiredCount(totals.info, "info total"), sessions: requiredCount(totals.sessions, "findings sessions"), sessions_total: requiredCount(totals.sessions_total, "total sessions") },
    rules, issues: requiredArray(root.issues, "finding groups").map(parseFindingGroup), next_cursor: nextCursor, refreshed: root.refreshed === true,
  };
}

function parseFindingsFreshness(value: unknown): FindingsFreshness {
  const root = record(value, "findings freshness");
  if (root.status === "unavailable") return { status: "unavailable", state: "unknown", last_successful_sync_at: null, stale_hosts: [], syncing: false };
  if (root.status !== "ok") throw new Error("findings freshness 状态不兼容");
  const freshness = record(root.freshness, "findings freshness data");
  const stale = requiredArray(freshness.stale_hosts, "stale hosts").map((host) => safeHostLabel(host));
  const lastSuccessfulSyncAt = safeTimestamp(freshness.last_successful_sync_at, "last sync");
  const requestedState = freshness.state === "fresh" || freshness.state === "stale" || freshness.state === "not_yet_synced" ? freshness.state : "unknown";
  const state = requestedState === "fresh" && lastSuccessfulSyncAt === null ? "unknown" : requestedState;
  return { status: "ok", state, last_successful_sync_at: lastSuccessfulSyncAt, stale_hosts: stale, syncing: freshness.syncing === true };
}

function boundedRatio(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} DTO 比例不安全`);
  return value;
}

function parseDecisionAmount(value: unknown): DecisionAmount {
  const row = record(value, "decision amount");
  return { amount_minor: requiredCount(row.amount_minor, "decision amount"), currency: decisionCurrency(row.currency, "decision currency"), basis: decisionBasis(row.basis, "decision basis") };
}

function parseDecisionSession(value: unknown): DecisionTopSession {
  const row = record(value, "decision top session");
  const first = requiredCount(row.span_first_ms, "decision session first");
  const last = requiredCount(row.span_last_ms, "decision session last");
  if (first > last) throw new Error("decision session 时间范围不安全");
  const reference = stringField(row.session_ref, "decision session ref");
  if (!/^sr_[A-Za-z0-9_-]{8,128}$/.test(reference)) throw new Error("decision session ref 不安全");
  return { session_ref: reference, span_first_ms: first, span_last_ms: last, tokens_total: requiredCount(row.tokens_total, "decision session tokens"), failures: requiredCount(row.failures, "decision session failures") };
}

function parseDecisionRow(value: unknown): DecisionMatrixRow {
  const row = record(value, "decision matrix row");
  const tokens = record(row.tokens, "decision token buckets");
  const hostBehavior = record(row.host_behavior, "decision host behavior");
  const behavior = Object.fromEntries(Object.entries(hostBehavior).filter(([key]) => ["SV607", "SV608", "SV610"].includes(key)).map(([key, item]) => [key, requiredCount(item, `decision ${key}`)]));
  const rawPressure = row.limit_pressure;
  let limitPressure: DecisionMatrixRow["limit_pressure"] = null;
  if (rawPressure !== null && rawPressure !== undefined) {
    const pressure = record(rawPressure, "decision pressure");
    limitPressure = { hits: requiredCount(pressure.hits, "decision pressure hits"), per_session: pressure.per_session === null ? null : requiredFiniteNumber(pressure.per_session, "decision pressure per session") };
  }
  return {
    host: safeHostLabel(row.host), model_id: decisionLabel(row.model_id, "decision model"), provider_id: decisionLabel(row.provider_id, "decision provider"),
    sessions: requiredCount(row.sessions, "decision sessions"),
    tokens: { uncached_input: requiredCount(tokens.uncached_input, "uncached input"), cache_read: requiredCount(tokens.cache_read, "cache read"), cache_write: requiredCount(tokens.cache_write, "cache write"), output: requiredCount(tokens.output, "output tokens"), total: requiredCount(tokens.total, "total tokens") },
    cache_hit_ratio: boundedRatio(row.cache_hit_ratio, "cache hit"), has_subscription: requiredBoolean(row.has_subscription, "subscription"), waste_rate: boundedRatio(row.waste_rate, "waste rate"),
    amounts: requiredArray(row.amounts, "decision amounts").slice(0, 8).map(parseDecisionAmount), top_sessions: requiredArray(row.top_sessions, "decision top sessions").slice(0, 3).map(parseDecisionSession),
    host_behavior: behavior, limit_pressure: limitPressure, cost_provider_unresolved: requiredBoolean(row.cost_provider_unresolved, "provider resolution"),
  };
}

function parseDecisionSummary(value: unknown): DecisionSummary {
  const row = record(value, "decision summary");
  const kind = row.kind;
  if (kind !== "cost_outlier" && kind !== "marathon" && kind !== "currency_split") throw new Error("decision summary 类型不安全");
  const summary: DecisionSummary = { kind };
  if (row.currency !== undefined) summary.currency = decisionCurrency(row.currency, "decision currency");
  if (row.outlier !== undefined) summary.outlier = parseDecisionSummaryCombo(row.outlier);
  if (row.control !== undefined) summary.control = parseDecisionSummaryCombo(row.control);
  for (const key of ["ratio_vs_control", "saving_pct", "span_hours"] as const) if (row[key] !== undefined) { if (typeof row[key] !== "number" || !Number.isFinite(row[key]) || row[key] < 0) throw new Error(`decision ${key} 不安全`); summary[key] = row[key]; }
  for (const key of ["saving_minor", "tokens_total", "failures"] as const) if (row[key] !== undefined) summary[key] = requiredCount(row[key], `decision ${key}`);
  if (row.session_ref !== undefined) { const reference = stringField(row.session_ref, "decision summary session"); if (!/^sr_[A-Za-z0-9_-]{8,128}$/.test(reference)) throw new Error("decision summary session 不安全"); summary.session_ref = reference; }
  if (row.combo !== undefined) { const combo = record(row.combo, "decision summary combo"); summary.combo = { host: safeHostLabel(combo.host), model_id: decisionLabel(combo.model_id, "summary model") }; }
  if (row.currencies !== undefined) summary.currencies = requiredArray(row.currencies, "summary currencies").slice(0, 8).map((item) => decisionCurrency(item, "summary currency"));
  if (row.by_currency !== undefined) { const source = record(row.by_currency, "summary currency values"); summary.by_currency = Object.fromEntries(Object.entries(source).slice(0, 8).map(([key, item]) => { const value = record(item, "summary currency value"); return [decisionCurrency(key, "summary currency key"), { combos: requiredCount(value.combos, "summary combos"), tokens: requiredCount(value.tokens, "summary tokens") }]; })); }
  return summary;
}

function parseDecisionSummaryCombo(value: unknown): NonNullable<DecisionSummary["outlier"]> {
  const row = record(value, "decision summary combo");
  return { host: safeHostLabel(row.host), model_id: decisionLabel(row.model_id, "summary model"), provider_id: row.provider_id === undefined ? "<unknown>" : decisionLabel(row.provider_id, "summary provider"), per_session_minor: requiredCount(row.per_session_minor, "summary per session"), cache_hit_ratio: boundedRatio(row.cache_hit_ratio, "summary cache hit"), uncached_tokens: row.uncached_tokens === undefined ? 0 : requiredCount(row.uncached_tokens, "summary uncached") };
}

function parseDecisionMatrix(value: unknown): DecisionMatrixReport {
  const root = record(value, "decision matrix");
  if (root.schema_version !== "agent-vitals-decision-matrix/v1" || root.status !== "ok") throw new Error("decision matrix DTO schema mismatch");
  const month = stringField(root.month, "decision month");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("decision month DTO 格式不安全");
  const rows = requiredArray(root.rows, "decision rows");
  const summaries = requiredArray(root.findings_summary, "decision summary");
  const limitations = requiredArray(root.limitations, "decision limitations");
  const allowedLimitations = new Set(["waste_rate_unavailable", "host_behavior_host_level", "amounts_currency_separated", "fingerprint_link_deferred", "top_sessions_unavailable", "pricing_unavailable"]);
  if (rows.length > 500 || summaries.length > 4 || limitations.length > 6) throw new Error("decision matrix DTO 数量超限");
  return { schema_version: "agent-vitals-decision-matrix/v1", status: "ok", month, rows: rows.map(parseDecisionRow), findings_summary: summaries.map(parseDecisionSummary), limitations: limitations.map((item) => { const limitation = stringField(item, "decision limitation"); if (!allowedLimitations.has(limitation)) throw new Error("decision limitation 不安全"); return limitation; }) };
}

export async function discoverTrust(): Promise<TrustDiscovery> {
  const handler = globalTauri()?.core?.invoke;
  if (!handler) return { candidates: [{ id: "zcode", detected: true, artifact_profile_available: true, coverage_state: "artifact_profile_available" }], profile_errors: [] };
  return parseTrustDiscovery(await handler("trust_discover"));
}

export async function auditTrust(host: string): Promise<TrustAuditReport> {
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(host)) throw new Error("宿主标识不安全");
  const handler = globalTauri()?.core?.invoke;
  if (!handler) return {
    host, discovered: 1, inserted: 1, duplicate: 0, findings_upserted: 0, evidence_links_added: 0,
    stage_counts: { package_observed: 1 }, observation_kind_counts: { package: 1 }, evidence: [{
      kind: "package", stage: "package_observed", evidence_level: "E1", evidence_origin: "local_artifact", observed_at_ms: Date.now(),
      workspace_ref: "hmac:preview-workspace", native_event_ref: "hmac:preview-event", scope_classes: ["workspace_current", "git_history"],
      file_count: 42, byte_count: 1024 * 1024, destination_class: "object_storage", collector_id: "preview",
    }],
  };
  const result = await handler("trust_audit", { host });
  const root = record(result, "trust audit envelope");
  const reports = Array.isArray(root.reports) ? root.reports : [];
  if (reports.length !== 1) throw new Error("trust audit 未返回单一宿主报告");
  return parseTrustAudit(reports[0]);
}

export async function readTrustMonitorConfig(): Promise<TrustMonitorConfig> {
  const handler = globalTauri()?.core?.invoke;
  if (!handler) return parseTrustMonitorConfig({
    status: "ok", reason: null, enabled: false, interval_seconds: 30, notifications_enabled: false,
    capability: "not_started", last_success_at_ms: null, last_error_code: null,
    updated_at_ms: null, notification_permission: null,
  });
  return parseTrustMonitorConfig(await handler("trust_monitor_config"));
}

export async function saveTrustMonitorConfig(input: {
  enabled: boolean;
  interval_seconds: number;
  notifications_enabled: boolean;
}): Promise<TrustMonitorConfig> {
  if (typeof input.enabled !== "boolean" || typeof input.notifications_enabled !== "boolean") {
    throw new Error("实时监测开关参数不安全");
  }
  if (!Number.isSafeInteger(input.interval_seconds) || input.interval_seconds < 5 || input.interval_seconds > 3600) {
    throw new Error("实时监测间隔必须在 5 秒到 3600 秒之间");
  }
  const handler = globalTauri()?.core?.invoke;
  if (!handler) return parseTrustMonitorConfig({
    status: "ok", reason: null, enabled: input.enabled, interval_seconds: input.interval_seconds,
    notifications_enabled: input.enabled && input.notifications_enabled, capability: input.enabled ? "partial" : "not_started",
    last_success_at_ms: null, last_error_code: null, updated_at_ms: Date.now(), notification_permission: null,
  });
  return parseTrustMonitorConfig(await handler("save_trust_monitor_config", {
    enabled: input.enabled,
    intervalSeconds: input.interval_seconds,
    notificationsEnabled: input.notifications_enabled,
  }));
}

export async function runTrustRuntimeSnapshot(): Promise<TrustRuntimeSnapshot> {
  const handler = globalTauri()?.core?.invoke;
  if (!handler) return parseTrustRuntimeSnapshot({
    capability: "macos_lsof_partial", candidate_processes: 1, observations: 2, inserted: 2,
    duplicate: 0, findings_upserted: 1, notification_candidates: 1, evidence_links_added: 2,
  });
  return parseTrustRuntimeSnapshot(await handler("trust_runtime_snapshot"));
}

export async function readFindings(): Promise<FindingsReport> {
  const handler = globalTauri()?.core?.invoke;
  if (!handler) return parseFindings({
    schema_version: "agent-vitals-findings/v1", status: "ok",
    totals: { issues: 2, findings: 2, critical: 1, warning: 1, info: 0, sessions: 2, sessions_total: 5 },
    rules: [{ rule: "SV709", severity: "critical", category: "object_storage_egress", hits: 1, sessions: 1 }, { rule: "PRICE_COVERAGE", severity: "warning", category: "billing", hits: 1, sessions: 1 }],
    issues: [
      { group_id: "fnv1a64:0123456789abcdef", action_kind: "behavior", rule: "SV709", host: "plugin:zcode", evidence_class: "egress", count: 1, first_seen_at_ms: 1789891200000, last_seen_at_ms: 1789891200000, severity: "critical", status_rollup: { open: 1, later: 0, acknowledged: 0, resolved: 0, not_applicable: 0 }, sessions_count: 1, sample_evidence: [{ available: true }], read_only: true, manual_follow_up: false },
      { group_id: "fnv1a64:1111111111111111", action_kind: "billing", rule: "PRICE_COVERAGE", host: "minimax-code", evidence_class: "billing", count: 1, first_seen_at_ms: 1789891200000, last_seen_at_ms: 1789891200000, severity: "warning", status_rollup: { open: 1, later: 0, acknowledged: 0, resolved: 0, not_applicable: 0 }, sessions_count: 1, sample_evidence: [{ available: true }], read_only: false, manual_follow_up: true },
    ], next_cursor: null, refreshed: false,
  });
  return parseFindings(await handler("findings_groups_safe", { pageSize: 50, cursor: null }));
}

export async function readFindingsFreshness(): Promise<FindingsFreshness> {
  const handler = globalTauri()?.core?.invoke;
  if (!handler) return { status: "ok", state: "stale", last_successful_sync_at: "2026-09-20T15:00:00+08:00", stale_hosts: ["dsh"], syncing: false };
  return parseFindingsFreshness(await handler("findings_freshness"));
}

export async function readDecisionMatrix(): Promise<DecisionMatrixReport> {
  const handler = globalTauri()?.core?.invoke;
  if (!handler) return parseDecisionMatrix({
    schema_version: "agent-vitals-decision-matrix/v1", status: "ok", month: "2026-09",
    rows: [{ host: "plugin:zcode", model_id: "glm-5", provider_id: "zhipu", sessions: 4, tokens: { uncached_input: 1200, cache_read: 8800, cache_write: 300, output: 900, total: 11200 }, cache_hit_ratio: 0.8544, has_subscription: false, waste_rate: null, amounts: [{ amount_minor: 781, currency: "CNY", basis: "metered_estimate" }], top_sessions: [{ session_ref: "sr_0123456789", span_first_ms: 1789891200000, span_last_ms: 1789894800000, tokens_total: 6400, failures: 2 }], host_behavior: { SV610: 2 }, limit_pressure: { hits: 1, per_session: 0.25 }, cost_provider_unresolved: false }],
    findings_summary: [{ kind: "marathon", session_ref: "sr_0123456789", span_hours: 25.2, tokens_total: 11200, failures: 2, combo: { host: "plugin:zcode", model_id: "glm-5" }}],
    limitations: ["waste_rate_unavailable", "host_behavior_host_level", "amounts_currency_separated", "fingerprint_link_deferred"],
  });
  return parseDecisionMatrix(await handler("decision_matrix_safe", { month: null }));
}

function globalTauri(): TauriGlobal | undefined {
  return (window as Window & { __TAURI__?: TauriGlobal }).__TAURI__;
}

export async function invoke<T>(command: string, args?: unknown): Promise<T> {
  const handler = globalTauri()?.core?.invoke;
  if (handler) return (await handler(command, args)) as T;

  // The preview is intentionally synthetic and contains no local paths,
  // session data, evidence contents, or credentials.
  if (command === "react_preview_overview") return browserPreview as T;
  throw new Error(`本地 API 不可用：${command}`);
}

export async function readOverviewSnapshot(): Promise<OverviewSnapshot> {
  const handler = globalTauri()?.core?.invoke;
  if (!handler) return browserPreview;
  return parseOverviewSnapshot(await handler("read_overview"));
}

export async function readUsageCalendar(month: string): Promise<UsageCalendar> {
  const safe = safeMonth(month, "usage month");
  const handler = globalTauri()?.core?.invoke;
  if (!handler) return parseUsageCalendar({ month: safe, days: [] });
  const parsed = parseUsageCalendar(await handler("read_calendar_month", { month: safe }));
  if (parsed.month !== safe) throw new Error("usage calendar 返回了错误月份");
  return parsed;
}

export async function readUsageSourceSummary(month: string): Promise<UsageSourceSummary> {
  const safe = safeMonth(month, "usage summary month");
  const handler = globalTauri()?.core?.invoke;
  if (!handler) return parseUsageSourceSummary({
    month: safe,
    freshness: { state: "unavailable", last_observed_at: null },
    coverage: { measured_fields: 0, total_fields: 0 },
    excluded_hosts: [], total_actual_spend: {}, actual_spend_by_basis: {},
  });
  const parsed = parseUsageSourceSummary(await handler("data_monthly_summary", { month: safe }));
  if (parsed.month !== safe) throw new Error("usage source summary 返回了错误月份");
  return parsed;
}

export async function readUsageHourly(date: string): Promise<UsageHourly> {
  const safe = safeDate(date, "usage hourly date");
  const handler = globalTauri()?.core?.invoke;
  if (!handler) return parseUsageHourly({ date: safe, hosts_available: { dsh: null, claude: null, codex: null }, hours: Array.from({ length: 24 }, (_, hour) => ({ hour, dsh_tokens: null, claude_tokens: null, codex_tokens: null })) });
  const parsed = parseUsageHourly(await handler("read_hourly_distribution", { date: safe }));
  if (parsed.date !== safe) throw new Error("usage hourly 返回了错误日期");
  return parsed;
}

export async function readRouteQuality(days: 30 | 90 | 365): Promise<RouteQualityReport> {
  if (days !== 30 && days !== 90 && days !== 365) throw new Error("路线质量统计窗口不安全");
  const now = Date.now();
  const fallback: RouteQualityReport = {
    since_ms: now - days * 86_400_000,
    now_ms: now,
    families_vocabulary: [...routeFamilies],
    hosts: [{
      host: "plugin:zcode",
      has_baseline: true,
      native_families: ["glm"],
      totals: { requests: 12, sessions: 3 },
      families: [{
        family: "glm", flag: "native", requests: 9, sessions: 3, tokens_total: 18000, last_event_ms: now - 3_600_000, request_share: 75,
        models: [{ model: "glm-5", requests: 9, tokens_total: 18000, last_event_ms: now - 3_600_000 }],
      }, {
        family: "deepseek", flag: "non_native", requests: 2, sessions: 1, tokens_total: 4200, last_event_ms: now - 7_200_000, request_share: 16.7,
        models: [{ model: "deepseek-v4-flash", requests: 2, tokens_total: 4200, last_event_ms: now - 7_200_000 }],
      }, {
        family: "synthetic", flag: "api_error", requests: 1, sessions: 1, tokens_total: 0, last_event_ms: now - 10_800_000, request_share: 8.3,
        models: [{ model: "<synthetic>", requests: 1, tokens_total: 0, last_event_ms: now - 10_800_000 }],
      }],
    }],
  };
  const handler = globalTauri()?.core?.invoke;
  if (!handler) return parseRouteQuality(fallback);
  try {
    return parseRouteQuality(await handler("routes_quality", { days }));
  } catch {
    // Do not surface Rust/CLI diagnostics, local paths, or provider details in
    // the UI. The desktop log remains the place for operator-level debugging.
    throw new Error("路线质量报告读取失败");
  }
}

export async function readSessions(input: {
  day?: string;
  month?: string;
  date_from?: string;
  date_to?: string;
  host_kind?: string;
  model?: string;
  provider?: string;
  page_size?: number;
  cursor?: string | null;
}): Promise<SessionsPage> {
  if ((input.date_from === undefined) !== (input.date_to === undefined)) throw new Error("sessions 日期范围必须成对提供");
  const args: Record<string, unknown> = {};
  if (input.day !== undefined) args.day = safeDate(input.day, "sessions day");
  if (input.month !== undefined) args.month = safeMonth(input.month, "sessions month");
  if (input.date_from !== undefined && input.date_to !== undefined) {
    const from = safeDate(input.date_from, "sessions date from");
    const to = safeDate(input.date_to, "sessions date to");
    if (from > to) throw new Error("sessions 日期范围起点不能晚于终点");
    args.date_from = from;
    args.date_to = to;
  }
  if (input.host_kind) {
    const host = safeHostLabel(input.host_kind);
    if (host === "generic") throw new Error("sessions host filter 不安全");
    args.host_kind = host;
  }
  if (input.model) args.model = decisionLabel(input.model, "sessions model filter");
  if (input.provider) args.provider = decisionLabel(input.provider, "sessions provider filter");
  if (input.page_size !== undefined) {
    if (!Number.isSafeInteger(input.page_size) || input.page_size < 1 || input.page_size > 500) throw new Error("sessions page size 不安全");
    args.page_size = input.page_size;
  }
  if (input.cursor) {
    if (input.cursor.length > 4096) throw new Error("sessions cursor 不安全");
    args.cursor = input.cursor;
  }
  const handler = globalTauri()?.core?.invoke;
  if (!handler) {
    const preview = new Date();
    const iso = preview.toISOString();
    const sample = {
      session_ref: "sr_browser_mock_01",
      host: "codex",
      first_event_at: new Date(preview.valueOf() - 3_600_000).toISOString(),
      last_event_at: iso,
      event_count: 24,
      model_ids: ["gpt-5.6-sol"],
      tokens: { uncached_input_tokens: 92000, cache_read_tokens: 128000, cache_write_tokens: 12000, output_tokens: 14000, total: 246000 },
      peak_tokens: 34000,
      cost_minor: { amount_minor: 84, currency: "USD", basis: "metered_estimate" },
      cost_status: { state: "estimated", reason: "metered-estimate", has_unresolved: false },
    };
    return parseSessionsPage({ data: { sessions: [sample], next_cursor: null, has_more: false, window_session_count: 1, window_total_tokens: 246000, window: { label: input.month ?? "preview" } } });
  }
  return parseSessionsPage(await handler("sessions_list", args));
}

export async function readSessionDetail(sessionRef: string, cursor: string | null = null): Promise<SessionDetail> {
  if (typeof sessionRef !== "string" || !/^sr_[A-Za-z0-9_-]{8,128}$/.test(sessionRef)) throw new Error("session_ref 不安全");
  const args: Record<string, unknown> = { sessionRef, limit: 200 };
  if (cursor !== null) {
    if (typeof cursor !== "string" || cursor.length < 1 || cursor.length > 4096) throw new Error("session detail cursor 不安全");
    args.cursor = cursor;
  }
  const handler = globalTauri()?.core?.invoke;
  if (!handler) {
    const now = new Date();
    const makeEvent = (offset: number, total: number, model: string, peak = false): SessionTimelineRow => ({
      event_at: new Date(now.valueOf() - offset).toISOString(), model_id: model, observation_kind: "assistant-usage", peak,
      tokens: { uncached_input_tokens: total, cache_read_tokens: 0, cache_write_tokens: 0, output_tokens: 0, total },
    });
    const sample = {
      session_ref: sessionRef, host: "codex", first_event_at: new Date(now.valueOf() - 3_600_000).toISOString(), last_event_at: now.toISOString(),
      event_count: 24, model_ids: ["gpt-5.6-sol"], tokens: { uncached_input_tokens: 92000, cache_read_tokens: 128000, cache_write_tokens: 12000, output_tokens: 14000, total: 246000 }, peak_tokens: 34000,
      cost_minor: { amount_minor: 84, currency: "USD", basis: "metered_estimate" }, cost_status: { state: "estimated", reason: "metered-estimate", has_unresolved: false },
      billing_breakdown: [{ provider_id: "openai", provider_raw: "openai", model_id: "gpt-5.6-sol", billing_template_id: null, billing_mode: "metered", pricing_basis: "metered_estimate", evidence_basis: "explicit-official-route", pricing_version: "preview-v1", pricing_source: "official", cost_minor: { amount_minor: 84, currency: "USD", basis: "metered_estimate" }, peak: true, tokens: { uncached_input_tokens: 92000, cache_read_tokens: 128000, cache_write_tokens: 12000, output_tokens: 14000, total: 246000 }, has_unresolved: false, unresolved_reason: null }],
      timeline: [makeEvent(3_600_000, 92000, "gpt-5.6-sol"), makeEvent(1_800_000, 154000, "gpt-5.6-sol", true)],
      workflow_timeline: [{ event_at: new Date(now.valueOf() - 3_500_000).toISOString(), event_type: "tool_finished", capability_kind: "tool", capability_id: "bash", capability_version: null, outcome: "succeeded", duration_ms: 1400, error_fingerprint: null, invocation_fingerprint: null }],
      workflow_has_more: false, has_more: false, next_cursor: null,
    };
    return parseSessionDetail({ data: sample });
  }
  return parseSessionDetail(await handler("sessions_read", args));
}

export async function readStatisticsTimezone(): Promise<StatisticsTimezone> {
  const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const handler = globalTauri()?.core?.invoke;
  if (!handler) return { timezone: fallback };
  const root = record(await handler("statistics_timezone_config"), "statistics timezone");
  const timezone = stringField(root.timezone, "statistics timezone");
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(); } catch (_) { throw new Error("统计时区不可用"); }
  return { timezone };
}

export async function listen(event: string, handler: (payload: unknown) => void): Promise<Unsubscribe> {
  const listener = globalTauri()?.event?.listen;
  if (!listener) return () => undefined;
  return listener(event, handler);
}
