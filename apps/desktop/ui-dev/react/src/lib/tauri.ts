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
};

export type OverviewSnapshot = {
  freshness: string;
  hosts: number | null;
  findings: number | null;
  evidence: number | null;
  monitored: boolean;
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

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} DTO 格式不兼容`);
  return value as Record<string, unknown>;
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 256) throw new Error(`${label} DTO 字段不安全`);
  return value;
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

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} DTO 状态不安全`);
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

function safeTimestamp(value: unknown, label: string): string | null {
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
      id: stringField(row.id, "trust candidate id"),
      detected: row.detected,
      artifact_profile_available: row.artifact_profile_available,
      coverage_state: stringField(row.coverage_state, "trust coverage state"),
    };
  });
  const profileErrors = requiredArray(root.profile_errors, "profile errors").map((item) => stringField(item, "profile error"));
  return { candidates, profile_errors: profileErrors };
}

function parseTrustAudit(value: unknown): TrustAuditReport {
  const root = record(value, "trust audit");
  const evidence = requiredArray(root.evidence, "trust evidence").map((item) => {
    const row = record(item, "trust evidence");
    const scopes = Array.isArray(row.scope_classes) ? row.scope_classes.map((scope) => stringField(scope, "scope class")) : [];
    if (typeof row.observed_at_ms !== "number" || !Number.isSafeInteger(row.observed_at_ms) || row.observed_at_ms < 0) throw new Error("trust evidence timestamp 不安全");
    return {
      kind: stringField(row.kind, "evidence kind"), stage: stringField(row.stage, "evidence stage"),
      evidence_level: stringField(row.evidence_level, "evidence level"), evidence_origin: stringField(row.evidence_origin, "evidence origin"),
      observed_at_ms: row.observed_at_ms, workspace_ref: safeReference(row.workspace_ref, "workspace ref"),
      native_event_ref: safeReference(row.native_event_ref, "native event ref"), scope_classes: scopes,
      file_count: nullableCount(row.file_count, "file count"), byte_count: nullableCount(row.byte_count, "byte count"),
      destination_class: nullableString(row.destination_class, "destination class"), collector_id: stringField(row.collector_id, "collector id"),
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

  const candidate = await handler("read_overview");
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("本地 overview DTO 格式不兼容");
  }
  const raw = candidate as Record<string, unknown>;
  const sync = raw.sync as Record<string, unknown> | undefined;
  const hosts = raw.tokens_by_host && typeof raw.tokens_by_host === "object" && !Array.isArray(raw.tokens_by_host)
    ? Object.keys(raw.tokens_by_host).length
    : null;
  return {
    freshness: typeof sync?.at === "string" ? `本地 authority · ${sync.at}` : "本地 authority · 时间不可用",
    hosts,
    // These fields are intentionally unavailable until their dedicated React
    // DTOs land. Showing “—” is safer than deriving a Finding from overview.
    findings: null,
    evidence: null,
    monitored: false,
  };
}

export async function listen(event: string, handler: (payload: unknown) => void): Promise<Unsubscribe> {
  const listener = globalTauri()?.event?.listen;
  if (!listener) return () => undefined;
  return listener(event, handler);
}
