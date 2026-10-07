import { DetMath as Math } from "../detMath";
import { segmentDistance } from "../cityPlan";
import type { RoadEdge } from "../cityLayout";
import type { RepairContext } from "./context";

// 路网修复手段（CITY_ROAD_NETWORK_SPEC §6：no-parallel / no-acute / no-loose-end）。与 repairs.ts 不同，这些会**改变**规划结果
// （删冗余路段），所以每条都有三道保险：① 只删窄路（局部街 5 / 次干 8），主干 12、桥、沿岸大道一律不动；
// ② 删后连通分量数不变（不切断路网）；③ 不拿走任何用地仅有的门前路。删完产生的新断头交给同一张表里的
// extendLooseEnds / pruneShortSpurs，在 solvePlan 的不动点循环里收口。

const edgeLength = (e: RoadEdge) => Math.hypot(e.points[1].x - e.points[0].x, e.points[1].z - e.points[0].z);

/** 删一条路段，并清掉因此无任何路段的孤立节点（只清我们删出来的，已有的孤立节点不动，免得改变无关的规划哈希）。 */
function dropEdge(ctx: RepairContext, e: RoadEdge): void {
  ctx.edges.delete(e.id);
  for (const id of [e.from, e.to]) {
    let used = false;
    for (const other of ctx.edges.values()) if (other.from === id || other.to === id) { used = true; break; }
    if (!used) ctx.nodes.delete(id);
  }
}

/** 当前路网（含桥）的连通分量数。 */
function components(ctx: RepairContext, skip?: string): number {
  const adj = new Map<string, string[]>();
  for (const e of ctx.edges.values()) {
    if (e.id === skip) continue;
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
    (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e.from);
  }
  const seen = new Set<string>(); let n = 0;
  for (const id of adj.keys()) {
    if (seen.has(id)) continue;
    n += 1; const stack = [id]; seen.add(id);
    while (stack.length) { const c = stack.pop()!; for (const next of adj.get(c) ?? []) if (!seen.has(next)) { seen.add(next); stack.push(next); } }
  }
  return n;
}

/** 删掉 edge 后，附近每块用地是否仍有 ≤ 半径+20 的非桥路（门前路不能因为去冗余而没了）。 */
function keepsSiteDoors(ctx: RepairContext, edge: RoadEdge): boolean {
  const sites = [...ctx.publicSites, ...ctx.landmarks].filter((s) => s.radius && !(s as { shore?: unknown }).shore);
  for (const s of sites) {
    if (segmentDistance(s, edge.points[0], edge.points[1]) > s.radius + 20) continue; // 这条路本来就不是它的门前路
    let other = Infinity;
    for (const e of ctx.edges.values()) if (e !== edge && !e.bridge) other = Math.min(other, segmentDistance(s, e.points[0], e.points[1]));
    if (other > s.radius + 20) return false;
  }
  return true;
}

/** 这条路段是否被某条车流折线走过（中点贴在折线段上）。 */
function onCarPath(ctx: RepairContext, edge: RoadEdge): boolean {
  const m = { x: (edge.points[0].x + edge.points[1].x) / 2, z: (edge.points[0].z + edge.points[1].z) / 2 };
  for (const path of ctx.carPaths) for (let i = 1; i < path.length; i += 1) if (segmentDistance(m, path[i - 1], path[i]) < 0.3) return true;
  return false;
}

/** 能删吗：窄路、非桥、不切断、不夺门前路、不拆车流回路。 */
function removable(ctx: RepairContext, edge: RoadEdge, baseline: number): boolean {
  if (edge.bridge || edge.width >= 12) return false;
  if (components(ctx, edge.id) > baseline) return false;
  if (onCarPath(ctx, edge)) return false;
  return keepsSiteDoors(ctx, edge);
}

/** 约束 crowdedArterials（与 constraints.ts 同一判据）：两条不共点的次干道并排（< 25、夹角 < 15°、侧向重叠）——删较短的一条。 */
export function resolveCrowdedArterials(ctx: RepairContext): number {
  let removed = 0;
  const baseline = components(ctx);
  const arterials = [...ctx.edges.values()].filter((e) => e.kind === "arterial" && !e.bridge);
  const dead = new Set<string>();
  for (let a = 0; a < arterials.length; a += 1) for (let b = a + 1; b < arterials.length; b += 1) {
    const A = arterials[a]; const B = arterials[b];
    if (dead.has(A.id) || dead.has(B.id)) continue;
    if ([A.from, A.to].some((id) => id === B.from || id === B.to)) continue;
    const [b0, b1] = [B.points[0], B.points.at(-1)!]; const [a0, a1] = [A.points[0], A.points.at(-1)!];
    const mid = { x: (a0.x + a1.x) / 2, z: (a0.z + a1.z) / 2 };
    const l2 = (b1.x - b0.x) ** 2 + (b1.z - b0.z) ** 2 || 1;
    const t = ((mid.x - b0.x) * (b1.x - b0.x) + (mid.z - b0.z) * (b1.z - b0.z)) / l2;
    if (t <= 0.1 || t >= 0.9 || segmentDistance(mid, b0, b1) >= 25) continue;
    const angle = Math.abs(Math.atan2(a1.z - a0.z, a1.x - a0.x) - Math.atan2(b1.z - b0.z, b1.x - b0.x)) % Math.PI;
    if (Math.min(angle, Math.PI - angle) >= (15 * Math.PI) / 180) continue;
    const [shorter, longer] = edgeLength(A) <= edgeLength(B) ? [A, B] : [B, A];
    for (const victim of [shorter, longer]) {
      if (!removable(ctx, victim, baseline)) continue;
      dropEdge(ctx, victim); dead.add(victim.id); removed += 1; break;
    }
  }
  return removed;
}

/** 约束 acuteJunctions：路口相邻两条路夹角 < 30° —— 删其中较短的窄路（保持连通与门前路）。 */
export function resolveAcuteJunctions(ctx: RepairContext): number {
  let removed = 0;
  const baseline = components(ctx);
  const incident = new Map<string, RoadEdge[]>();
  for (const e of ctx.edges.values()) for (const id of [e.from, e.to]) (incident.get(id) ?? incident.set(id, []).get(id)!).push(e);
  for (const [id, list] of incident) {
    const live = list.filter((e) => ctx.edges.has(e.id));
    if (live.length < 3) continue;
    const node = ctx.nodes.get(id); if (!node) continue;
    const ang = (e: RoadEdge) => { const pts = e.from === id ? e.points : [...e.points].reverse(); return Math.atan2(pts[1].z - node.z, pts[1].x - node.x); };
    const sorted = live.map((e) => ({ e, a: ((ang(e) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) })).sort((x, y) => x.a - y.a);
    for (let k = 0; k < sorted.length; k += 1) {
      const gap = (k + 1 < sorted.length ? sorted[k + 1].a : sorted[0].a + Math.PI * 2) - sorted[k].a;
      if (gap >= (30 * Math.PI) / 180) continue;
      const pair = [sorted[k].e, sorted[(k + 1) % sorted.length].e].sort((x, y) => edgeLength(x) - edgeLength(y));
      const victim = pair.find((e) => ctx.edges.has(e.id) && removable(ctx, e, baseline));
      if (victim) { dropEdge(ctx, victim); removed += 1; }
      break;
    }
  }
  return removed;
}

/** 约束 looseInlandRoadEnds：短悬挂链（< 60、全是窄路）就删——通往空地的小尾巴；长路不动（要接通而不是删）。 */
export function pruneShortSpurs(ctx: RepairContext): number {
  let removed = 0;
  const sites = [...ctx.publicSites, ...ctx.landmarks].filter((s) => s.radius);
  for (let pass = 0; pass < 4; pass += 1) {
    const deg = new Map<string, RoadEdge[]>();
    for (const e of ctx.edges.values()) if (!e.bridge) for (const id of [e.from, e.to]) (deg.get(id) ?? deg.set(id, []).get(id)!).push(e);
    let changed = 0;
    for (const [id, list] of deg) {
      if (list.length !== 1) continue;
      const node = ctx.nodes.get(id); if (!node || ctx.height(node.x, node.z) < 2.5) continue;
      if (sites.some((s) => Math.hypot(s.x - node.x, s.z - node.z) < s.radius + 12)) continue; // 门前终点
      const chain: RoadEdge[] = []; let cur = id; let prev: RoadEdge | null = null; let len = 0; let ok = true;
      for (let step = 0; step < 12; step += 1) {
        const next: RoadEdge | undefined = (deg.get(cur) ?? []).find((e) => e !== prev && ctx.edges.has(e.id));
        if (!next || next.width >= 12) { ok = false; break; }
        chain.push(next); len += edgeLength(next); prev = next; cur = next.from === cur ? next.to : next.from;
        if ((deg.get(cur)?.length ?? 0) >= 3) break;
        if (len >= 60) { ok = false; break; }
      }
      if (!ok || len >= 60 || (deg.get(cur)?.length ?? 0) < 3) continue;
      if (!chain.every((e) => keepsSiteDoors(ctx, e) && !onCarPath(ctx, e))) continue;
      for (const e of chain) dropEdge(ctx, e);
      removed += chain.length; changed += 1;
    }
    if (!changed) break;
  }
  return removed;
}

/**
 * 约束 looseInlandRoadEnds：「近失误」断头——端点离另一条路只有一个车道宽的距离（实测 15 个样本外断头里 12 个在 10–15），
 * 原来的垂直接入因为夹角/最小角规则被拒。这里放宽到：端点 ≤ 24 内有他路，沿垂足直连安全（不过水、不穿用地、不穿路），就接上；
 * 垂足离路段端点 < 12 时吸附到端点，中段则把宿主路段切成 T 路口。连接线与宿主垂直，所以不会新造锐角路口。
 */
export function joinNearMissEnds(ctx: RepairContext): number {
  let joined = 0;
  const sites = [...ctx.publicSites, ...ctx.landmarks].filter((s) => s.radius);
  const deg = new Map<string, RoadEdge[]>();
  for (const e of ctx.edges.values()) if (!e.bridge) for (const id of [e.from, e.to]) (deg.get(id) ?? deg.set(id, []).get(id)!).push(e);
  for (const [id, list] of deg) {
    if (list.length !== 1) continue;
    const node = ctx.nodes.get(id); if (!node || ctx.height(node.x, node.z) < 2.5) continue;
    if (sites.some((s) => Math.hypot(s.x - node.x, s.z - node.z) < s.radius + 12)) continue;
    const own = list[0];
    let best: { edge: RoadEdge; p: { x: number; z: number }; d: number } | null = null;
    for (const e of ctx.edges.values()) {
      if (e.bridge || e === own || e.from === id || e.to === id) continue;
      const [a, b] = e.points; const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((node.x - a.x) * dx + (node.z - a.z) * dz) / l2));
      const len = Math.sqrt(l2);
      const p = t * len < 12 ? a : (1 - t) * len < 12 ? b : { x: a.x + dx * t, z: a.z + dz * t };
      const d = Math.hypot(p.x - node.x, p.z - node.z);
      if (d < 0.5 || d > 24 || (best && d >= best.d)) continue;
      best = { edge: e, p, d };
    }
    if (!best) continue;
    const target = ctx.key(best.p);
    if (!ctx.safeRoadLink(node, target)) continue;
    let crossing = false;
    for (const e of ctx.edges.values()) if (e !== best.edge && ctx.crosses(node, target, e.points[0], e.points[1])) { crossing = true; break; }
    if (crossing) continue;
    const [a, b] = best.edge.points;
    const onEnd = (target.x === a.x && target.z === a.z) || (target.x === b.x && target.z === b.z);
    if (!onEnd && ctx.edges.has(best.edge.id)) {
      const host = best.edge;
      ctx.edges.delete(host.id);
      ctx.addEdge(a, target, host.kind === "arterial", false, host.width >= 12);
      ctx.addEdge(target, b, host.kind === "arterial", false, host.width >= 12);
    }
    ctx.addEdge(node, target, own.kind === "arterial", false, own.width >= 12);
    joined += 1;
  }
  return joined;
}
