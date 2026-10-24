/**
 * Squad IM envelope v:1 — parse, feed reducer, kind filter, claim tint state.
 * TypeScript only renders; Rust assigns id/ts and owns the claim table.
 */
export const SQUAD_EVENT = "__AV_PLUGIN_SQUAD_EVENT__";
export const ENVELOPE_V = 1;
export const MAX_FEED = 80;
export const KILL_FEED_MS = 4200;

export const SQUAD_KINDS = ["chat", "claim", "release", "preview", "reject", "set", "reset", "observe"] as const;
export type SquadKind = (typeof SQUAD_KINDS)[number];

export type KindFilter = Record<SquadKind, boolean>;

/** Fixed visibility. Not a user preference: write-related on, chat/observe off, reset on like set. */
export const DEFAULT_KIND_FILTER: KindFilter = {
  chat: false,
  observe: false,
  claim: true,
  release: true,
  preview: true,
  reject: true,
  set: true,
  reset: true,
};

export type SquadEnvelope = {
  v: 1;
  id: string;
  ts: number;
  session_id: string;
  agent_id: string;
  agent_name: string;
  kind: SquadKind;
  payload: Record<string, unknown>;
};

export type ClaimTint = {
  assetRef: string;
  sessionId: string;
  agentId: string;
  agentName: string;
  expiresAt: number;
  eventId: string;
};

/** Highest fanout `payload.revision` seen per lot. Soft claim/release do not write this. */
export type RevisionWatermark = { revision: number; ts: number };

export type SquadFeedState = {
  items: SquadEnvelope[];
  claims: Record<string, ClaimTint>;
  revisions: Record<string, RevisionWatermark>;
};

const KIND_SET = new Set<string>(SQUAD_KINDS);
const SR = /^sr_[0-9a-f]{32}$/;
const CA = /^ca_[0-9a-f]{32}$/;

export function isWriteKind(kind: SquadKind): boolean {
  return kind === "preview" || kind === "reject" || kind === "set" || kind === "reset" || kind === "claim" || kind === "release";
}

const FANOUT_KINDS = new Set<SquadKind>(["preview", "reject", "set", "reset"]);

/** Numeric revision on MCP fanout kinds only. Claim/release never invent one. */
export function envelopeRevision(event: SquadEnvelope): number | null {
  if (!FANOUT_KINDS.has(event.kind)) return null;
  const revision = event.payload.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) return null;
  return revision;
}

/** True when a fanout envelope is older than the highest revision already applied for that asset_ref. */
export function isStaleFanout(state: SquadFeedState, event: SquadEnvelope): boolean {
  const assetRef = envelopeAssetRef(event);
  if (!assetRef) return false;
  const revision = envelopeRevision(event);
  if (revision == null) return false;
  const seen = state.revisions?.[assetRef];
  if (!seen) return false;
  if (revision < seen.revision) return true;
  return revision === seen.revision && event.ts < seen.ts;
}

export function parseSquadEnvelope(raw: unknown): SquadEnvelope | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.v !== ENVELOPE_V) return null;
  if (typeof row.id !== "string" || !row.id.startsWith("evt_") || row.id.length > 80) return null;
  if (typeof row.ts !== "number" || !Number.isSafeInteger(row.ts) || row.ts < 0) return null;
  if (typeof row.session_id !== "string" || !SR.test(row.session_id)) return null;
  if (typeof row.agent_id !== "string" || !row.agent_id.trim() || row.agent_id.length > 64) return null;
  if (typeof row.agent_name !== "string" || !row.agent_name.trim() || row.agent_name.length > 80) return null;
  if (typeof row.kind !== "string" || !KIND_SET.has(row.kind)) return null;
  if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) return null;
  return {
    v: 1,
    id: row.id,
    ts: row.ts,
    session_id: row.session_id,
    agent_id: row.agent_id.trim(),
    agent_name: row.agent_name.trim(),
    kind: row.kind as SquadKind,
    payload: row.payload as Record<string, unknown>,
  };
}

export function emptyFeed(): SquadFeedState {
  return { items: [], claims: {}, revisions: {} };
}

export function applySquadEnvelope(state: SquadFeedState, event: SquadEnvelope, nowSecs: number): SquadFeedState {
  if (state.items.some((item) => item.id === event.id)) return state;
  if (isStaleFanout(state, event)) return state;
  const items = [event, ...state.items].slice(0, MAX_FEED);
  return {
    items,
    claims: applyClaim(state.claims, event, nowSecs),
    revisions: applyRevisionWatermark(state.revisions, event),
  };
}

function applyRevisionWatermark(
  revisions: Record<string, RevisionWatermark>,
  event: SquadEnvelope,
): Record<string, RevisionWatermark> {
  const assetRef = envelopeAssetRef(event);
  const revision = envelopeRevision(event);
  if (!assetRef || revision == null) return revisions;
  return { ...revisions, [assetRef]: { revision, ts: event.ts } };
}

export function applyClaim(claims: Record<string, ClaimTint>, event: SquadEnvelope, nowSecs: number): Record<string, ClaimTint> {
  const next = expireClaims(claims, nowSecs);
  const assetRef = typeof event.payload.asset_ref === "string" && CA.test(event.payload.asset_ref)
    ? event.payload.asset_ref : null;
  if (!assetRef) return next;
  if (event.kind === "claim") {
    const expiresAt = typeof event.payload.expires_at === "number" && Number.isSafeInteger(event.payload.expires_at)
      ? event.payload.expires_at : nowSecs + 90;
    next[assetRef] = {
      assetRef,
      sessionId: event.session_id,
      agentId: event.agent_id,
      agentName: event.agent_name,
      expiresAt,
      eventId: event.id,
    };
    return next;
  }
  if (event.kind === "release" || event.kind === "set" || event.kind === "reset") {
    delete next[assetRef];
  }
  return next;
}

export function expireClaims(claims: Record<string, ClaimTint>, nowSecs: number): Record<string, ClaimTint> {
  const next: Record<string, ClaimTint> = {};
  for (const [key, claim] of Object.entries(claims)) {
    if (claim.expiresAt > nowSecs) next[key] = claim;
  }
  return next;
}

export function visibleFeed(items: SquadEnvelope[], filter: KindFilter = DEFAULT_KIND_FILTER): SquadEnvelope[] {
  return items.filter((item) => filter[item.kind]);
}

export function envelopeAssetRef(event: SquadEnvelope): string | null {
  const asset = event.payload.asset_ref;
  return typeof asset === "string" && CA.test(asset) ? asset : null;
}

export function envelopeSummary(event: SquadEnvelope): string {
  const asset = envelopeAssetRef(event);
  const chip = asset ? asset.slice(0, 10) : "";
  if (event.kind === "chat") {
    const text = typeof event.payload.text === "string" ? event.payload.text : "";
    return text.slice(0, 80);
  }
  if (event.kind === "claim") return chip ? `claim ${chip}` : "claim";
  if (event.kind === "release") {
    const reason = typeof event.payload.reason === "string" ? event.payload.reason : "manual";
    return chip ? `release ${reason} ${chip}` : `release ${reason}`;
  }
  const ok = event.payload.ok === false ? "fail" : "ok";
  const rule = typeof event.payload.rule === "string" ? event.payload.rule : "";
  return [event.kind, ok, rule, chip].filter(Boolean).join(" ");
}

export function claimsFromRows(rows: unknown, nowSecs: number): Record<string, ClaimTint> {
  const out: Record<string, ClaimTint> = {};
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const item = row as Record<string, unknown>;
    if (typeof item.asset_ref !== "string" || !CA.test(item.asset_ref)) continue;
    if (typeof item.session_id !== "string" || !SR.test(item.session_id)) continue;
    if (typeof item.agent_id !== "string" || !item.agent_id) continue;
    if (typeof item.agent_name !== "string" || !item.agent_name) continue;
    if (typeof item.expires_at !== "number" || item.expires_at <= nowSecs) continue;
    out[item.asset_ref] = {
      assetRef: item.asset_ref,
      sessionId: item.session_id,
      agentId: item.agent_id,
      agentName: item.agent_name,
      expiresAt: item.expires_at,
      eventId: `claim_${item.asset_ref}`,
    };
  }
  return out;
}
