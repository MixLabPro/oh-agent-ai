/** 骨架之后的地块入口联合指派。plot-gate 不冒充模型门洞，后者另有物理声明契约。 */
import { DetMath as Math } from "../detMath";
import type { PublicSite, Vec2 } from "../cityLayout";
import { siteCandidateHardReject, type SiteCandidate, type SiteCandidateWorld } from "./access";
import { assignSite, ASSIGN_WEIGHTS } from "./assign";
import { runConnection, type ConnectorWorld, type ConnectionStrategy } from "./connect";
import { polylineDistance, closestPolylineSegment } from "./footprint";
import { keyOf, type Network } from "./network";
import { resolvePlanarAccess, planarAccessPose } from "../models/siteAccess";
import type { SiteSpec } from "./sitespec";
import { nominalAnchorPoint } from "./sitespec";

export type PlotAccess = { role: "plot-gate"; capability?: "ground-frontage" | "island-causeway" | "shore-plot-boundary"; nodeId: string; ownerX: number; ownerZ: number; ownerYaw: number; entranceId?: string;
  entranceEvidence?: "model-position" | "plot-proxy"; doorX?: number; doorZ?: number };
export const JOINT_SITE_CONFIG = {
  version: 8,
  frontageSegments: 64,
  probes: [0.25, 0.5, 0.75] as const,
  fallbackProbes: [0.125, 0.375, 0.625, 0.875] as const,
  /** Only after the primary candidate set is exhausted; at most 640 extra frontage points. */
  fallbackCandidateLimit: 64,
  fallbackRegionRadii: [0, 24, 48, 72, 96, 120, 144, 168] as const,
  fallbackRegionDirections: 16,
  /** Add only after the previous tiers are exhausted; does not reorder existing successful placements. */
  outerRegionRadii: [192, 216, 240, 264, 288, 312, 336, 360] as const,
  outerRegionDirections: 24,
  /** Per required owner: 512 primary frontage + 640 fallback frontage + 113 inner + 192 outer points. */
  maxCandidateEvaluations: 1457,
};

export function assignConnectedSite(world: SiteCandidateWorld, connector: ConnectorWorld, spec: SiteSpec, id: string, primaryAnchor: string | null,
  validateProposal?: (site: PublicSite, network: Network) => string | null): { site: PublicSite | null; network?: Network; reason?: string; rejected: number; routeRetries?: number } {
  const resolved = resolvePlanarAccess(spec.planarAccess, spec.radius);
  if (!resolved.ok) return { site: null, reason: resolved.reason, rejected: 0 };
  if (!primaryAnchor || !connector.network.nodes.has(primaryAnchor)) return { site: null, reason: "primary-anchor-missing", rejected: 0 };
  const adjacent = new Map<string, string[]>();
  for (const edge of connector.network.edges.values()) {
    (adjacent.get(edge.from) ?? adjacent.set(edge.from, []).get(edge.from)!).push(edge.to);
    (adjacent.get(edge.to) ?? adjacent.set(edge.to, []).get(edge.to)!).push(edge.from);
  }
  const primaryNodes = new Set([primaryAnchor]); const queue = [primaryAnchor];
  for (let cursor = 0; cursor < queue.length; cursor += 1) for (const node of adjacent.get(queue[cursor]) ?? []) if (!primaryNodes.has(node)) {
    primaryNodes.add(node); queue.push(node);
  }
  const frontage = [...connector.network.edges.values()].filter((edge) => !edge.bridge && edge.width >= 8 && primaryNodes.has(edge.from)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const routeRetries: SiteCandidate[] = [];
  const routeFailureEvidence = new Map<string, string>();
  const evaluateCandidate = (candidate: SiteCandidate, accepted: Map<string, { site: PublicSite; network: Network }>, rescue = false): string | null => {
    if ([...connector.network.edges.values()].some((edge) => polylineDistance([edge.points], candidate) < spec.radius + edge.width / 2)) return "road-intersects-site-footprint";
    let best: { x: number; z: number; distance: number; id: string } | null = null;
    for (const edge of connector.network.edges.values()) {
      if (edge.bridge || !primaryNodes.has(edge.from)) continue;
      const closest = closestPolylineSegment(edge.points, candidate);
      if (!closest) continue;
      const { x, z } = closest.q, distance = closest.d;
      if (!best || distance < best.distance || (distance === best.distance && edge.id < best.id)) best = { x, z, distance, id: edge.id };
    }
    // A frontage candidate records an actual road probe. Only the exhausted
    // retry tier may recover that original attachment direction when a nearer
    // but impassable corridor stole its pose; ordinary successes stay stable.
    let recoveredFrontage = false;
    if (rescue && candidate.frontage) {
      const evidence = candidate.frontage;
      const same = (a: Vec2, b: Vec2) => a.x === b.x && a.z === b.z;
      const host = [...connector.network.edges.values()].find((edge) => !edge.bridge && primaryNodes.has(edge.from)
        && edge.points.some((point, i) => i > 0 && ((same(edge.points[i - 1], evidence.a) && same(point, evidence.b))
          || (same(edge.points[i - 1], evidence.b) && same(point, evidence.a)))));
      if (!host || polylineDistance([[evidence.a, evidence.b]], evidence.at) > 0.01) return "stale-frontage-evidence";
      const distance = Math.hypot(evidence.at.x - candidate.x, evidence.at.z - candidate.z);
      if (!Number.isFinite(distance) || distance <= 0) return "invalid-frontage-evidence";
      recoveredFrontage = !best || Math.hypot(best.x - evidence.at.x, best.z - evidence.at.z) > 0.01;
      best = { ...evidence.at, distance, id: host.id };
    }
    if (!best || best.distance <= spec.radius + 8) {
      if (!rescue && candidate.frontage) routeRetries.push(candidate);
      return "no-frontage-corridor";
    }
    const toRoad = { x: (best.x - candidate.x) / best.distance, z: (best.z - candidate.z) / best.distance };
    const { yaw, door, gate: declaredGate } = planarAccessPose(resolved.access, candidate, toRoad, spec.radius + 8);
    if (!declaredGate) return "invalid-planar-gate-geometry";
    const gate = keyOf(declaredGate);
    // Use the actual quantized gate, not the ideal r+8 radius: rounding can
    // move it slightly outward. This conservative lower bound only prunes
    // mathematically unreachable routes; final maxLength stays unchanged.
    const routeLowerBound = best.distance - Math.hypot(gate.x - candidate.x, gate.z - candidate.z);
    if (routeLowerBound > spec.radius + 30 + 1e-9) return "no-target-outside-route-bound";
    const site: PublicSite = { id, kind: spec.kind as PublicSite["kind"], x: candidate.x, z: candidate.z, radius: spec.radius, yaw,
      access: { role: "plot-gate", capability: "ground-frontage", nodeId: `${gate.x}:${gate.z}`, ownerX: candidate.x, ownerZ: candidate.z, ownerYaw: yaw,
        entranceId: resolved.access.entranceId, entranceEvidence: door ? "model-position" : "plot-proxy", ...(door ? { doorX: door.x, doorZ: door.z } : {}) } };
    const network: Network = { nodes: new Map([...connector.network.nodes].map(([key, node]) => [key, { ...node }])), edges: new Map([...connector.network.edges].map(([key, edge]) => [key, { ...edge, points: edge.points.map((p) => ({ ...p })) }])) };
    const strategies: ConnectionStrategy[] = rescue ? recoveredFrontage
      ? ["direct-projection", "node-merge", "detour", "grid-astar"] : ["detour", "grid-astar"] : ["direct-projection", "node-merge"];
    const result = runConnection({ id: `assign:${id}`, source: gate, target: { kind: "primary", isPrimaryNode: (node) => primaryNodes.has(node) }, purpose: "site-access", allowBridge: false, maxLength: spec.radius + 30, roadClass: "local" },
      { ...connector, network, reservations: () => [...connector.reservations(), site] }, { strategies });
    if (!result.ok) {
      if (!rescue) routeRetries.push(candidate);
      if (!routeFailureEvidence.has(result.reason)) routeFailureEvidence.set(result.reason,
        `centre=${candidate.x}:${candidate.z} gate=${gate.x}:${gate.z} host=${best.id} distance=${best.distance}; ${result.detail ?? result.reason}`);
      return result.reason;
    }
    const proposalFailure = validateProposal?.(site, network);
    if (proposalFailure) return proposalFailure;
    accepted.set(candidate.id, { site, network }); return null;
  };
  const tryCandidates = (limit: number, probes: readonly number[], fallbackPoints: readonly Vec2[] = []) => {
    const accepted = new Map<string, { site: PublicSite; network: Network }>();
    const assignment = assignSite({ ...world, trunkRuns: frontage.map((edge) => edge.points), frontageCandidateLimit: limit, frontageProbeFractions: probes,
      ...(fallbackPoints.length ? { frontageFallbackPoints: fallbackPoints } : {}) }, spec, nominalAnchorPoint(spec, world), ASSIGN_WEIGHTS,
      (candidate) => evaluateCandidate(candidate, accepted));
    return { accepted, assignment };
  };
  const primary = tryCandidates(JOINT_SITE_CONFIG.frontageSegments, JOINT_SITE_CONFIG.probes);
  const anchor = nominalAnchorPoint(spec, world);
  const regionPoints: Vec2[] = [];
  if (!primary.assignment.chosen) for (const radius of JOINT_SITE_CONFIG.fallbackRegionRadii) {
    const directions = radius === 0 ? 1 : JOINT_SITE_CONFIG.fallbackRegionDirections;
    for (let direction = 0; direction < directions; direction += 1) {
      const angle = (direction / directions) * Math.PI * 2;
      regionPoints.push({ x: anchor.x + Math.cos(angle) * radius, z: anchor.z + Math.sin(angle) * radius });
    }
  }
  const fallback = primary.assignment.chosen ? null : tryCandidates(JOINT_SITE_CONFIG.fallbackCandidateLimit, JOINT_SITE_CONFIG.fallbackProbes, regionPoints);
  const outerRegionPoints: Vec2[] = [];
  if (!primary.assignment.chosen && !fallback?.assignment.chosen) for (const radius of JOINT_SITE_CONFIG.outerRegionRadii) {
    for (let direction = 0; direction < JOINT_SITE_CONFIG.outerRegionDirections; direction += 1) {
      const angle = (direction / JOINT_SITE_CONFIG.outerRegionDirections) * Math.PI * 2;
      const point = { x: anchor.x + Math.cos(angle) * radius, z: anchor.z + Math.sin(angle) * radius };
      // A gate is offset by r+8 and the connector allows at most r+30 length,
      // so a primary ground edge farther than 2r+38 cannot possibly be reached.
      // Filter only mathematically impossible outer points before the expensive
      // footprint/connector checks; retain the full valid search envelope.
      let nearest = Infinity;
      for (const edge of connector.network.edges.values()) {
        if (edge.bridge || !primaryNodes.has(edge.from)) continue;
        nearest = Math.min(nearest, polylineDistance([edge.points], point));
      }
      if (nearest > spec.radius + 8 && nearest <= 2 * spec.radius + 38) outerRegionPoints.push(point);
    }
  }
  const outer = outerRegionPoints.length ? tryCandidates(0, [], outerRegionPoints) : null;
  const final = outer?.assignment.chosen ? outer : fallback?.assignment.chosen ? fallback : fallback ?? primary;
  let chosen = final.assignment.chosen ? final.accepted.get(final.assignment.chosen.id) : null;
  let rejected = primary.assignment.rejected + (fallback?.assignment.rejected ?? 0) + (outer?.assignment.rejected ?? 0);
  const retryReasons = new Map<string, number>(), retried = new Set<string>();
  // Preserve all previously accepted direct placements. Only after every
  // original tier fails, retry physically valid positions with another route,
  // within the existing candidate and route-length bounds.
  if (!chosen) for (const candidate of routeRetries) {
    if (rejected >= JOINT_SITE_CONFIG.maxCandidateEvaluations) break;
    // Identical centres generated from different actual hosts are different
    // attachment poses. Deduplicate evidence, not the owner's position alone.
    const key = `${candidate.x}:${candidate.z}${candidate.frontage
      ? `:${candidate.frontage.at.x}:${candidate.frontage.at.z}:${JSON.stringify([candidate.frontage.a, candidate.frontage.b])}` : ""}`;
    if (retried.has(key)) continue; retried.add(key);
    const accepted = new Map<string, { site: PublicSite; network: Network }>();
    const reason = siteCandidateHardReject({ ...world, trunkRuns: frontage.map((edge) => edge.points) }, spec, candidate)
      ?? evaluateCandidate(candidate, accepted, true);
    if (!reason) { chosen = accepted.get(candidate.id); break; }
    rejected += 1; retryReasons.set(reason, (retryReasons.get(reason) ?? 0) + 1);
  }
  const diagnostics = [primary, ...(fallback ? [fallback] : []), ...(outer ? [outer] : [])].map(({ assignment }) => {
    const summary = assignment.rejectionReasons?.map(({ reason, count }) => `${reason}=${count}`).join(", ");
    return `${assignment.candidates} candidates${summary ? ` [${summary}]` : ""}`;
  }).join("; ") + (retried.size ? `; ${retried.size} route retries [${[...retryReasons].map(([reason, count]) => `${reason}=${count}`).join(", ")}]` : "")
    + (routeFailureEvidence.size ? `; route evidence [${[...routeFailureEvidence].map(([reason, evidence]) => `${reason}: ${evidence}`).join(" | ")}]` : "");
  return chosen ? { ...chosen, rejected, routeRetries: retried.size } : {
    site: null, reason: `${final.assignment.reason ?? "no joint site/access candidate"} (${diagnostics})`, rejected, routeRetries: retried.size,
  };
}
