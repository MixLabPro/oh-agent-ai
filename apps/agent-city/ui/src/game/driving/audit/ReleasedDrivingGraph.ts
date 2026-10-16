/** ReleasedDrivingGraph（D2 最小切片）：把一次 AuditReleaseDecision 固化为带身份的只读开放图。
 *
 * 不做判定：只消费 evaluateAuditRelease 的结论。ready=false 时拒绝发布；green 子集只收录
 * status==="passed" 的单元。发布后图与 key 绑定，isCurrent 由宿主租约提供；key 或世界失效后
 * 整图作废，不残留半张图。不修改 manifest、不复跑审计、不提供 UI——界面消费仍属 E。
 */
import { sameAuditKey } from "./AuditIdentity";
import type { AuditKey, AuditManifest, AuditUnitKind } from "./contracts";
import type { AuditReleaseDecision } from "./AuditReleasePolicy";

export const RELEASED_DRIVING_GRAPH_VERSION = 1;
export type ReleasedUnitStatus = "passed" | "blocked" | "pending" | "excluded";
export type ReleasedDrivingUnit = Readonly<{
  unitId: string; kind: AuditUnitKind; status: ReleasedUnitStatus; reason: string;
}>;
export type ReleasedDrivingGraph = Readonly<{
  graphVersion: number; key: AuditKey; releaseBoundaryHash: string;
  units: readonly ReleasedDrivingUnit[]; counts: Readonly<Record<"passed" | "blocked" | "pending" | "excluded", number>>;
}>;
export type GraphLease = Readonly<{
  /** Cheap per-step freshness, mirroring the frozen-source fast check. */
  isCurrent(): boolean;
  /** Full identity of the world the audit ran on. */
  currentKey(): AuditKey;
}>;
export type PublishedDrivingGraph = Readonly<{
  graph: ReleasedDrivingGraph;
  /** True until the lease reports stale; a stale handle must not be used for driving admission. */
  isCurrent(): boolean;
}>;

/** Publish never fabricates readiness: it re-checks the decision it was given. */
export function publishDrivingGraph(
  manifest: AuditManifest,
  decision: AuditReleaseDecision,
): { ok: true; graph: ReleasedDrivingGraph } | { ok: false; reason: string } {
  if (manifest.key.releaseBoundaryHash === null) return { ok: false, reason: "final-boundary-replay-required" };
  if (!decision.ready) return { ok: false, reason: decision.reasons[0] ?? "release-not-ready" };
  const units = decision.units.map<ReleasedDrivingUnit>((unit) =>
    ({ unitId: unit.unitId, kind: manifest.units.find((candidate) => candidate.id === unit.unitId)?.kind ?? "directed-edge", status: unit.status, reason: unit.reason }));
  const counts = { passed: 0, blocked: 0, pending: 0, excluded: 0 } as Record<"passed" | "blocked" | "pending" | "excluded", number>;
  for (const unit of units) counts[unit.status] += 1;
  return { ok: true, graph: Object.freeze({
    graphVersion: RELEASED_DRIVING_GRAPH_VERSION, key: manifest.key, releaseBoundaryHash: manifest.key.releaseBoundaryHash,
    units: Object.freeze(units), counts: Object.freeze(counts),
  }) };
}

/** Bind a published graph to a live lease; the handle dies with the lease, not with this call. */
export function bindDrivingGraph(graph: ReleasedDrivingGraph, lease: GraphLease): PublishedDrivingGraph {
  return { graph, isCurrent: () => lease.isCurrent() && sameAuditKey(lease.currentKey(), graph.key) };
}
