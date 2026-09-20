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

function safeReference(value: unknown, label: string): string | null {
  const reference = nullableString(value, label);
  if (reference !== null && !/^tr_[A-Za-z0-9_-]{8,128}$/.test(reference)) throw new Error(`${label} DTO 引用格式不安全`);
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
