/** Bounded joint ground-owner/corridor proposals. Call mutation only on a solve
 * draft; the dispatcher publishes network/site/references together. */
import { DetMath as Math } from "../detMath";
import type { RoadEdge, Vec2 } from "../cityLayout";
import type { LocalFootprint } from "../models/physical";
import type { RepairContext } from "./context";
import { footprintPolylineDistance, resolveModelEnvelope } from "./modelEnvelope";
import { commitNetworkPatch, previewNetworkPatch, NETWORK_RELINE_CONFIG, type Network, type NetworkPatch } from "./network";
import { relocatedSitePositionFailure } from "./snapJunctions";
import { registeredModelGroundFailure } from "./modelGround";
import { canRelocateGroundSite } from "./sitespec";
import { localResiteCandidates } from "./siting";
import { polylineDistance } from "./footprint";
import { groundJunctionCorridorFailure } from "./civicClearance";
import { classifyRoadSegments, closestSegmentPoints } from "./relations";
import { groundJunctionFindings } from "./report";

/** Six-node visibility graph: endpoints plus conservative bounding corners are
 * candidate waypoints only. Every visibility edge checks the actual UNION,
 * so openings are not replaced by a solid bounding rectangle. */
export function declaredOwnerDetour(footprint: LocalFootprint, road: RoadEdge,
  allowed: (a: Vec2, b: Vec2) => boolean = () => true): Vec2[] | null {
  const a = road.points[0], b = road.points[road.points.length - 1], required = road.width / 2 + 3;
  if (!a || !b || !Number.isFinite(required) || road.width <= 0 ||
    ![a, b].every(point => { const distance = footprintPolylineDistance(footprint, [point]); return Number.isFinite(distance) && distance >= required; })) return null;
  const bounds = footprint.parts.flatMap(part => part.shape === "circle" ? [
    { x: part.center.x - part.radius, z: part.center.z - part.radius }, { x: part.center.x + part.radius, z: part.center.z + part.radius },
  ] : part.shape === "convex" ? part.vertices : [
    { x: part.center.x - part.width / 2, z: part.center.z - part.depth / 2 },
    { x: part.center.x + part.width / 2, z: part.center.z + part.depth / 2 },
  ]);
  const left = Math.floor((Math.min(...bounds.map(point => point.x)) - required) * 100) / 100;
  const right = Math.ceil((Math.max(...bounds.map(point => point.x)) + required) * 100) / 100;
  const top = Math.floor((Math.min(...bounds.map(point => point.z)) - required) * 100) / 100;
  const bottom = Math.ceil((Math.max(...bounds.map(point => point.z)) + required) * 100) / 100;
  const nodes = [a, b, { x: left, z: top }, { x: right, z: top }, { x: right, z: bottom }, { x: left, z: bottom }];
  const costs = nodes.map(() => nodes.map(() => Infinity));
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const length = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
    const distance = footprintPolylineDistance(footprint, [nodes[i], nodes[j]]);
    if (length > 0 && Number.isFinite(distance) && distance >= required && allowed(nodes[i], nodes[j])) costs[i][j] = costs[j][i] = length;
  }
  const distance = nodes.map(() => Infinity), previous = nodes.map(() => -1), used = nodes.map(() => false); distance[0] = 0;
  for (let step = 0; step < nodes.length; step++) {
    let at = -1;
    for (let i = 0; i < nodes.length; i++) if (!used[i] && Number.isFinite(distance[i]) && (at < 0 || distance[i] < distance[at])) at = i;
    if (at < 0) return null;
    if (at === 1) {
      if (distance[at] > Math.min(700, Math.max(160, Math.hypot(b.x - a.x, b.z - a.z) * 2.5))) return null;
      const indices = []; for (let cursor = 1; cursor >= 0; cursor = previous[cursor]) indices.unshift(cursor);
      return indices.map(index => ({ ...nodes[index] }));
    }
    used[at] = true;
    for (let i = 0; i < nodes.length; i++) if (!used[i] && distance[at] + costs[at][i] < distance[i]) {
      distance[i] = distance[at] + costs[at][i]; previous[i] = at;
    }
  }
  return null;
}

type Proposal = { ok: true; patch: NetworkPatch } | { ok: false; reason: string };
export function prepareJointSiteRoadRelocation(ctx: RepairContext, ownerId: string, at: Vec2): Proposal {
  const reject = (reason: string): Proposal => ({ ok: false, reason });
  const owners = [...ctx.publicSites, ...ctx.landmarks].filter(owner => owner.id === ownerId), owner = owners[0];
  if (owners.length !== 1 || !canRelocateGroundSite(owner) || !ctx.SHORE_SITE_KINDS.has(owner.kind)) return reject("joint-owner-not-relocatable");
  if (ctx.planningWorld?.reservations.some(reservation => reservation.ownerId === ownerId && reservation.state !== "released"
    && (reservation.immutable || reservation.state !== "tentative"))) return reject("joint-owner-reservation-protected");
  let declared = false;
  for (const point of localResiteCandidates(owner)) if (point.x === at.x && point.z === at.z) { declared = true; break; }
  if (!declared) return reject("joint-owner-undeclared-candidate");
  const envelope = resolveModelEnvelope({ ...owner, ...at });
  if (envelope.status !== "partial" || envelope.relocationCorridorEnvelope?.schemaVersion !== 1
    || envelope.relocationCorridorEnvelope.coverage !== "complete-conservative-renderer-xy") return reject("joint-owner-XY-unsupported");
  const ground = registeredModelGroundFailure({ ...owner, ...at }, { height: ctx.height, inRiver: ctx.inRiver });
  if (ground) return reject(ground);
  const initial = relocatedSitePositionFailure(ctx, owner, at, true);
  if (initial !== "owner-road-envelope") return reject(initial ?? "joint-owner-has-no-road-blocker");
  if (ctx.blocks.some(block => block.parcels.some(parcel => Math.hypot(parcel.x - at.x, parcel.z - at.z)
    < owner.radius + 9 + Math.hypot(parcel.width, parcel.depth) / 2))) return reject("owner-parcel-envelope");
  const roads = [...ctx.network.edges.values()].filter(road => footprintPolylineDistance(envelope.conservativeProjection, road.points) < road.width / 2 + 3);
  if (!roads.length || roads.length > NETWORK_RELINE_CONFIG.maxEdgesPerPatch) return reject("joint-road-blocker-budget");
  if (roads.some(road => road.bridge || road.structure !== "ground-road" || [...ctx.network.edges.values()].some(edge => edge.bridge
    && [edge.from, edge.to].some(node => node === road.from || node === road.to)))) return reject("joint-road-structure-protected");
  if (roads.some(road => ctx.planningWorld?.reservations.some(reservation => reservation.ownerId === `road:${road.id}`
    && reservation.state !== "released" && (reservation.immutable || reservation.state !== "tentative")))) return reject("joint-road-reservation-protected");
  const world = { network: ctx.network, geo: ctx.geo, inRiver: ctx.inRiver, reservations: () => [...ctx.publicSites, ...ctx.landmarks].filter(site => site.id !== ownerId) };
  const decks = [...ctx.ringRuns.map(points => ({ points, width: 10.5 })), ...[...ctx.network.edges.values()].filter(edge => edge.bridge)];
  const replacements: NonNullable<NetworkPatch["relineEdges"]> = [];
  for (const road of roads) {
    if ([road.points[0], road.points[road.points.length - 1]].some(point =>
      footprintPolylineDistance(envelope.conservativeProjection, [point]) < road.width / 2 + 3)) return reject("joint-road-endpoint-in-owner-envelope");
    let blockedBy = "path-length-or-visibility";
    const shape = declaredOwnerDetour(envelope.conservativeProjection, road, (a, b) => {
      const corridor = groundJunctionCorridorFailure(world, a, b, road.width, road);
      if (corridor) { blockedBy = `corridor-${corridor}`; return false; }
      if (ctx.blocks.some(block => block.parcels.some(parcel => polylineDistance([[a, b]], parcel)
        < Math.hypot(parcel.width, parcel.depth) / 2 + road.width / 2 + 0.5))) { blockedBy = "reserved-parcel-corridor"; return false; }
      for (const deck of decks) for (let k = 1; k < deck.points.length; k++) {
        const relation = classifyRoadSegments(a, b, deck.points[k - 1], deck.points[k], 0);
        if (["invalid", "interior-crossing", "endpoint-contact", "endpoint-on-edge", "collinear-overlap"].includes(relation.kind)
          || closestSegmentPoints(a, b, deck.points[k - 1], deck.points[k]).distance < road.width / 2 + deck.width / 2 + 1) { blockedBy = "deck-clearance-unsupported"; return false; }
      }
      return true;
    });
    if (!shape) return reject(`joint-road-no-endpoint-preserving-detour:${blockedBy}`);
    replacements.push({ edgeId: road.id, points: shape });
  }
  const patch: NetworkPatch = { baseVersion: (ctx.network as Network & { version?: number }).version ?? 0,
    removeEdgeIds: [], addEdges: [], splits: [], relineEdges: replacements };
  const preview = previewNetworkPatch(ctx.network, patch);
  if (!preview.ok) return reject(preview.detail ?? preview.reason);
  const final = relocatedSitePositionFailure({ ...ctx, network: preview.network }, owner, at, true);
  return final ? reject(final) : { ok: true, patch };
}

export function relocateSiteWithGroundRoads(ctx: RepairContext, ownerId: string, at: Vec2): { changes: number; reason?: string } {
  const proposal = prepareJointSiteRoadRelocation(ctx, ownerId, at);
  if (!proposal.ok) return { changes: 0, reason: proposal.reason };
  const owner = [...ctx.publicSites, ...ctx.landmarks].find(site => site.id === ownerId)!;
  const oldContacts = new Set(groundJunctionFindings([...ctx.network.edges.values()]).map(finding => finding.id));
  const result = commitNetworkPatch(ctx.network, proposal.patch, draft => {
    if (groundJunctionFindings([...draft.edges.values()]).some(finding => !oldContacts.has(finding.id))) return "joint-road-introduced-ground-contact";
    return relocatedSitePositionFailure({ ...ctx, network: draft }, owner, at, true);
  });
  if (!result.ok) return { changes: 0, reason: result.detail ?? result.reason };
  owner.x = at.x; owner.z = at.z;
  return { changes: 1 + proposal.patch.relineEdges!.length };
}
