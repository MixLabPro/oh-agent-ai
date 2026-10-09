/** J 首批：把既有合法地面交叉细分为共享节点，不新增道路走廊；桥交叉不平接。 */
import { DetMath as Math } from "../detMath";
import { crosses } from "./footprint";
import { commitNetworkPatch, keyOf } from "./network";
import { corridorFailure, type ConnectorWorld } from "./connect";

export const JUNCTION_CONFIG = { version: 1, maxJunctions: 128, minAngleDeg: 35, minLegLength: 3 };

export function connectGroundJunctions(world: ConnectorWorld): { connected: number; declined: number; budgetExhausted: boolean } {
  let connected = 0; let declined = 0;
  // 确定排序快照；每条旧边维护拆分后的在册宿主，避免同一宿主多次拆分引用失效。
  const edges = [...world.network.edges.values()].filter((e) => !e.bridge && e.points.length === 2).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const parts = new Map(edges.map((e) => [e.id, [e.id]]));
  for (let i = 0; i < edges.length; i += 1) for (let j = i + 1; j < edges.length; j += 1) {
    const a = edges[i]; const b = edges[j];
    if (!crosses(a.points[0], a.points[1], b.points[0], b.points[1])) continue;
    const u = { x: a.points[1].x - a.points[0].x, z: a.points[1].z - a.points[0].z };
    const v = { x: b.points[1].x - b.points[0].x, z: b.points[1].z - b.points[0].z };
    const cosine = Math.abs((u.x * v.x + u.z * v.z) / (Math.hypot(u.x, u.z) * Math.hypot(v.x, v.z)));
    if (cosine > Math.cos(JUNCTION_CONFIG.minAngleDeg * Math.PI / 180)) { declined += 1; continue; }
    const delta = { x: b.points[0].x - a.points[0].x, z: b.points[0].z - a.points[0].z };
    const t = (delta.x * v.z - delta.z * v.x) / (u.x * v.z - u.z * v.x);
    const at = keyOf({ x: a.points[0].x + t * u.x, z: a.points[0].z + t * u.z });
    const hosts = [a, b].map((edge) => (parts.get(edge.id) ?? []).map((id) => world.network.edges.get(id)).find((e) => e && crosses(e.points[0], e.points[1], edge === a ? b.points[0] : a.points[0], edge === a ? b.points[1] : a.points[1])));
    if (hosts.some((h) => !h || h.points.some((p) => Math.hypot(p.x - at.x, p.z - at.z) < JUNCTION_CONFIG.minLegLength))) { declined += 1; continue; }
    // 按两条宿主的实际路幅复核，细分不授予既有非法走廊安全豁免。
    if (hosts.some((h) => corridorFailure(world, h!.points[0], h!.points[1], { requireBuildable: true, maxSlope: 0.9, sites: world.reservations(), siteMargin: 3, roadWidth: h!.width }))) { declined += 1; continue; }
    if (connected >= JUNCTION_CONFIG.maxJunctions) return { connected, declined, budgetExhausted: true };
    const result = commitNetworkPatch(world.network, { baseVersion: world.network.version ?? 0, addEdges: [], removeEdgeIds: [], splits: hosts.map((h) => ({ edgeId: h!.id, at })) }, (draft) => {
      const id = `${at.x}:${at.z}`;
      const incident = [...draft.edges.values()].filter((e) => e.from === id || e.to === id);
      if (incident.length !== 4) return "unsupported multiway junction";
      const legs = incident.map((e) => e.from === id ? e.points[e.points.length - 1] : e.points[0]);
      for (let p = 0; p < legs.length; p += 1) for (let q = p + 1; q < legs.length; q += 1) {
        const ux = legs[p].x - at.x; const uz = legs[p].z - at.z;
        const vx = legs[q].x - at.x; const vz = legs[q].z - at.z;
        if ((ux * vx + uz * vz) / (Math.hypot(ux, uz) * Math.hypot(vx, vz)) > Math.cos(JUNCTION_CONFIG.minAngleDeg * Math.PI / 180)) return "junction-angle";
      }
      return null;
    });
    if (!result.ok) { declined += 1; continue; }
    const nodeId = `${at.x}:${at.z}`;
    for (let k = 0; k < hosts.length; k += 1) {
      const host = hosts[k]!; const original = k === 0 ? a : b;
      const halfIds = [host.from, host.to].map((id) => [id, nodeId].sort().join("/"));
      parts.set(original.id, [...parts.get(original.id)!.filter((id) => id !== host.id), ...halfIds]);
    }
    connected += 1;
  }
  return { connected, declined, budgetExhausted: false };
}
