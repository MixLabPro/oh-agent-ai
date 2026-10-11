/**
 * 规划修复 M2：道路编辑的硬规则（docs/CITY_PLAN_MANUAL_REPAIR_SPEC.md §7.3 节点拖动/删路段）。
 *
 * 纯函数、无副作用，看的是**当前生效布局**（已套补丁）里的当前 id——与编辑器拾取到的 id 同一口径，
 * 道路日志（planPatch.RoadOp）直接引用这些 id，无需翻译。
 *
 * 原则：**只拦「这次编辑新引入」的违例**。生成器自己留下的残余（压路、锐角、近水路段）不能让无关的编辑
 * 全被拒——比较编辑前后同一对象的违例，新增才阻止。这和体检不同：体检报全部，校验只管这一次手。
 *
 * 近似声明（如实）：楼的「接路」按最近路段的较近端点判定，不是地块 frontage 的精确证明——
 * 足以拦住「删掉这条路让楼断网/离路太远」，但不保证与规划器的 frontage 判定逐点一致。
 */
import type { CityModel } from "../cityModel";
import type { CityLayout, RoadEdge, Vec2 } from "./cityLayout";
import { buildingRect, edgeLocked, nearestOnPolyline, parcelIndex, rectClearOfEdges, type BuildingRect } from "./planPatch";
import { roadNodeId } from "./cityPlan";

export type RoadVerdict = { blockers: string[]; warnings: string[] };

const ACUTE_LIMIT = (30 * Math.PI) / 180; // 同 planner/constraints.ts::acuteJunctions
const MIN_EDGE_LENGTH = 6;
const NODE_CLEARANCE = 1;       // 目标点距任何别的路口 < 1 视为撞车
const FAR_MOVE = 80;
const FRONTAGE_LIMIT = 40;      // 楼离最近道路的上限（同体检 orphanedBlock）
const SAMPLE_STEP = 4;
const ARTERIAL_WIDTH = 12;      // 骨架边：宽 ≥ 12（SPEC §7.3「骨架边宽≥12 或桥」）

const quantize = (p: Vec2): Vec2 => ({ x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 });

/** 点到折线的最近距离。 */
function distanceToPolyline(p: Vec2, points: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]; const b = points[i];
    const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
    best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t));
  }
  return best;
}

/** 某节点处是否存在 < 30° 的相邻路夹角（≥3 路才算，同 acuteJunctions）。 */
function hasAcuteAt(edges: readonly RoadEdge[], nodeId: string, at: Vec2): boolean {
  const incident = edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
  if (incident.length < 3) return false;
  const angles = incident.map((edge) => {
    const pts = edge.from === nodeId ? edge.points : [...edge.points].reverse();
    return Math.atan2(pts[1].z - at.z, pts[1].x - at.x);
  }).sort((a, b) => a - b);
  for (let k = 0; k < angles.length; k += 1) {
    const gap = (k + 1 < angles.length ? angles[k + 1] : angles[0] + Math.PI * 2) - angles[k];
    if (gap < ACUTE_LIMIT) return true;
  }
  return false;
}

/** 需要给路让位的矩形：会话楼、背景楼、花园、配套、地标。 */
const rectCache = new WeakMap<CityLayout, { model: CityModel; rects: BuildingRect[] }>();

/** 悬停预览每次鼠标移动都要校验，障碍矩形按（布局, 模型）缓存——布局不可变，缓存随布局对象一起回收。 */
function obstacleRects(layout: CityLayout, model: CityModel): BuildingRect[] {
  const hit = rectCache.get(layout);
  if (hit && hit.model === model) return hit.rects;
  const rects = buildObstacleRects(layout, model);
  rectCache.set(layout, { model, rects });
  return rects;
}

function buildObstacleRects(layout: CityLayout, model: CityModel): BuildingRect[] {
  const rects: BuildingRect[] = [];
  const buildings = new Map(model.buildings.map((building) => [building.id, building]));
  for (const district of layout.districts) for (const [id, slot] of district.slots) {
    const building = buildings.get(id);
    if (building) rects.push(buildingRect(building, slot));
  }
  for (const context of layout.contextBuildings) rects.push({ x: context.x, z: context.z, yaw: context.yaw, width: context.width, depth: context.depth });
  for (const garden of layout.gardens) rects.push({ x: garden.x, z: garden.z, yaw: garden.yaw, width: garden.width, depth: garden.depth });
  const parcels = parcelIndex(layout);
  for (const civic of layout.civics) rects.push({ x: civic.x, z: civic.z, yaw: civic.yaw, width: civic.width, depth: civic.depth });
  for (const landmark of layout.districtLandmarks ?? []) {
    const parcel = parcels.get(landmark.parcelId);
    if (parcel) rects.push({ x: parcel.x, z: parcel.z, yaw: parcel.yaw, width: parcel.width, depth: parcel.depth });
  }
  return rects;
}

/** 路段碰到哪些矩形（返回下标集合）。先按距离粗筛，再用精确的朝向矩形 × 路带判定。 */
function rectsHitBy(edge: RoadEdge, rects: readonly BuildingRect[]): Set<number> {
  const hit = new Set<number>();
  rects.forEach((rect, index) => {
    if (distanceToPolyline(rect, edge.points) > 40) return;
    if (!rectClearOfEdges(rect, [edge], 0.5)) hit.add(index);
  });
  return hit;
}

/** 非桥路段沿线采样，统计不可建/水面采样点数。 */
function badSamples(layout: CityLayout, edge: RoadEdge): number {
  if (edge.bridge) return 0;
  let bad = 0;
  for (let i = 1; i < edge.points.length; i += 1) {
    const a = edge.points[i - 1]; const b = edge.points[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = 0; d <= len; d += SAMPLE_STEP) {
      const t = len ? d / len : 0;
      if (!layout.terrain.buildable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) bad += 1;
    }
  }
  return bad;
}

/** 拖动路口的校验。`nodeId` 是生效布局里的 id。 */
export function validateNodeMove(layout: CityLayout, model: CityModel, nodeId: string, to: Vec2): RoadVerdict {
  const blockers: string[] = []; const warnings: string[] = [];
  const node = layout.roadNodes.find((candidate) => candidate.id === nodeId);
  if (!node) return { blockers: ["missing-node"], warnings };
  const incident = layout.roadEdges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
  if (incident.some(edgeLocked)) return { blockers: ["locked-edge"], warnings };
  const target = quantize(to);
  const freshId = roadNodeId(target);
  if (freshId === nodeId) return { blockers: ["unchanged"], warnings };
  if (layout.roadNodes.some((other) => other.id !== nodeId && Math.hypot(other.x - target.x, other.z - target.z) < NODE_CLEARANCE)) blockers.push("node-collision");

  // 新几何：关联边只有朝向本节点的那一端动。
  const moved = incident.map((edge) => {
    const points = [...edge.points];
    if (edge.from === nodeId) points[0] = target; else points[points.length - 1] = target;
    return { before: edge, after: { ...edge, points } as RoadEdge };
  });
  if (moved.some(({ after }) => Math.hypot(after.points[0].x - after.points[after.points.length - 1].x, after.points[0].z - after.points[after.points.length - 1].z) < MIN_EDGE_LENGTH)) blockers.push("edge-too-short");

  // 入水：只拦新增的不可建采样点（生成器自己沿岸的路不算）。
  const badBefore = moved.reduce((sum, { before }) => sum + badSamples(layout, before), 0);
  const badAfter = moved.reduce((sum, { after }) => sum + badSamples(layout, after), 0);
  if (badAfter > badBefore) blockers.push("road-in-water");

  // 穿楼/配套/花园：只拦新碰到的矩形。
  const rects = obstacleRects(layout, model);
  if (moved.some(({ before, after }) => {
    const already = rectsHitBy(before, rects);
    return [...rectsHitBy(after, rects)].some((index) => !already.has(index));
  })) blockers.push("road-over-building");

  // 锐角：本节点与各邻居端点，编辑前没有、编辑后有。
  const afterEdges = layout.roadEdges.map((edge) => moved.find(({ before }) => before === edge)?.after ?? edge);
  const nodes = new Map<string, Vec2>(layout.roadNodes.map((candidate) => [candidate.id, candidate]));
  const neighbours = new Set(incident.map((edge) => (edge.from === nodeId ? edge.to : edge.from)));
  if (hasAcuteAt(afterEdges, nodeId, target) && !hasAcuteAt(layout.roadEdges, nodeId, node)) blockers.push("acute-junction");
  for (const id of neighbours) {
    const at = nodes.get(id);
    if (at && hasAcuteAt(afterEdges, id, at) && !hasAcuteAt(layout.roadEdges, id, at)) { if (!blockers.includes("acute-junction")) blockers.push("acute-junction"); }
  }
  if (Math.hypot(target.x - node.x, target.z - node.z) > FAR_MOVE) warnings.push("far-move");
  return { blockers, warnings };
}

/** 每栋会话楼的「接路端点」与离最近路的距离（近似：最近路段的较近端点）。 */
function accessOf(layout: CityLayout, edges: readonly RoadEdge[], rects: readonly Vec2[]): Array<{ node: string | null; distance: number }> {
  const nodes = new Map<string, Vec2>(layout.roadNodes.map((node) => [node.id, node]));
  return rects.map((p) => {
    let best: RoadEdge | null = null; let bestD = Infinity;
    for (const edge of edges) {
      if (edge.bridge) continue;
      const d = distanceToPolyline(p, edge.points);
      if (d < bestD) { bestD = d; best = edge; }
    }
    if (!best) return { node: null, distance: Infinity };
    const from = nodes.get(best.from); const to = nodes.get(best.to);
    const near = from && to && Math.hypot(from.x - p.x, from.z - p.z) <= Math.hypot(to.x - p.x, to.z - p.z) ? best.from : best.to;
    return { node: near, distance: bestD };
  });
}

/** 连通分量标号（含桥——桥连着岛上两片路网）。 */
function components(edges: readonly RoadEdge[]): Map<string, number> {
  const adjacent = new Map<string, string[]>();
  for (const edge of edges) {
    (adjacent.get(edge.from) ?? adjacent.set(edge.from, []).get(edge.from)!).push(edge.to);
    (adjacent.get(edge.to) ?? adjacent.set(edge.to, []).get(edge.to)!).push(edge.from);
  }
  const label = new Map<string, number>(); let next = 0;
  for (const start of adjacent.keys()) {
    if (label.has(start)) continue;
    const stack = [start]; label.set(start, next);
    while (stack.length) {
      const id = stack.pop()!;
      for (const other of adjacent.get(id) ?? []) if (!label.has(other)) { label.set(other, next); stack.push(other); }
    }
    next += 1;
  }
  return label;
}

/** 删路段的校验。`edgeId` 是生效布局里的 id。 */
export function validateEdgeDrop(layout: CityLayout, model: CityModel, edgeId: string): RoadVerdict {
  const blockers: string[] = []; const warnings: string[] = [];
  const edge = layout.roadEdges.find((candidate) => candidate.id === edgeId);
  if (!edge) return { blockers: ["missing-edge"], warnings };
  if (edgeLocked(edge)) return { blockers: ["locked-edge"], warnings };
  if (edge.width >= ARTERIAL_WIDTH) return { blockers: ["arterial-skeleton"], warnings };

  const remaining = layout.roadEdges.filter((candidate) => candidate !== edge);
  const slots: Vec2[] = []; const ids: string[] = [];
  const buildings = new Set(model.buildings.map((building) => building.id));
  for (const district of layout.districts) for (const [id, slot] of district.slots) if (buildings.has(id)) { slots.push(slot); ids.push(id); }
  const before = accessOf(layout, layout.roadEdges, slots);
  const after = accessOf(layout, remaining, slots);

  // 离路太远：原本在范围内、删后超出的楼。
  const stranded = ids.filter((_, i) => before[i].distance <= FRONTAGE_LIMIT && after[i].distance > FRONTAGE_LIMIT);
  if (stranded.length) blockers.push("strands-buildings");

  // 断网：原本接在主网上的楼，删后不再与其他「接主网的楼」同一连通分量。
  const compBefore = components(layout.roadEdges); const compAfter = components(remaining);
  const sizes = new Map<number, number>();
  for (const label of compBefore.values()) sizes.set(label, (sizes.get(label) ?? 0) + 1);
  const mainBefore = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0];
  const served = ids.map((_, i) => i).filter((i) => before[i].node !== null && compBefore.get(before[i].node!) === mainBefore);
  const afterLabels = new Set(served.map((i) => (after[i].node === null ? -1 : (compAfter.get(after[i].node!) ?? -1))));
  if (afterLabels.size > 1 || afterLabels.has(-1)) blockers.push("disconnects-buildings");

  // 新断头：删后某端点度数落到 1（它连着别的路，只是少了一条）。
  const degree = new Map<string, number>();
  for (const other of remaining) if (!other.bridge) for (const id of [other.from, other.to]) degree.set(id, (degree.get(id) ?? 0) + 1);
  if ([edge.from, edge.to].some((id) => degree.get(id) === 1)) warnings.push("creates-dead-end");
  return { blockers, warnings };
}

export type RoadTarget = { kind: "node" | "edge"; id: string; locked: boolean };

/** 点击地面一点最近的路口/路段：6 以内取路口，否则取路面带（半宽 + 3）内最近的路段。 */
export function nearestRoadTarget(layout: CityLayout, x: number, z: number): RoadTarget | null {
  const p = { x, z };
  let node: { id: string; d: number } | null = null;
  for (const candidate of layout.roadNodes) {
    const d = Math.hypot(candidate.x - x, candidate.z - z);
    if (d <= 6 && (!node || d < node.d)) node = { id: candidate.id, d };
  }
  if (node) {
    const locked = layout.roadEdges.some((edge) => (edge.from === node!.id || edge.to === node!.id) && edgeLocked(edge));
    return { kind: "node", id: node.id, locked };
  }
  let edge: { edge: RoadEdge; d: number } | null = null;
  for (const candidate of layout.roadEdges) {
    const d = distanceToPolyline(p, candidate.points);
    if (d <= candidate.width / 2 + 3 && (!edge || d < edge.d)) edge = { edge: candidate, d };
  }
  return edge ? { kind: "edge", id: edge.edge.id, locked: edgeLocked(edge.edge) } : null;
}

// ── 画路 / 橡皮擦 ─────────────────────────────────────────────────────────────

const SNAP_NODE_UI = 8;   // 画路时鼠标离路口这么近就吸附到路口
const SNAP_EDGE_UI = 4;   // 离路段这么近就吸附到路段上（落笔时把该路段拆开）
const MAX_NEW_EDGE = 250;
const CROSS_EPS = 1;      // 与现有路的交点离新路端点 < 1 视为「接在端点上」，不算交叉

export type SnapPoint = { x: number; z: number; kind: "node" | "edge" | "free"; nodeId?: string; edgeId?: string; locked: boolean };

/** 画路的吸附：路口（8 内）→ 路段上最近点（4 内）→ 自由点。 */
export function snapPoint(layout: CityLayout, x: number, z: number): SnapPoint {
  let node: { id: string; x: number; z: number; d: number } | null = null;
  for (const candidate of layout.roadNodes) {
    const d = Math.hypot(candidate.x - x, candidate.z - z);
    if (d <= SNAP_NODE_UI && (!node || d < node.d)) node = { id: candidate.id, x: candidate.x, z: candidate.z, d };
  }
  if (node) {
    const locked = layout.roadEdges.some((edge) => (edge.from === node!.id || edge.to === node!.id) && edgeLocked(edge));
    return { x: node.x, z: node.z, kind: "node", nodeId: node.id, locked };
  }
  let host: { edge: RoadEdge; point: Vec2; d: number } | null = null;
  for (const edge of layout.roadEdges) {
    const hit = nearestOnPolyline({ x, z }, edge.points);
    if (hit.distance <= SNAP_EDGE_UI && (!host || hit.distance < host.d)) host = { edge, point: hit.point, d: hit.distance };
  }
  if (host) { const at = quantize(host.point); return { x: at.x, z: at.z, kind: "edge", edgeId: host.edge.id, locked: edgeLocked(host.edge) }; }
  const free = quantize({ x, z });
  return { x: free.x, z: free.z, kind: "free", locked: false };
}

/** 橡皮擦悬停：路面带（半宽 + 4）内最近的路段。 */
export function nearestEdgeAt(layout: CityLayout, x: number, z: number): RoadEdge | null {
  let best: { edge: RoadEdge; d: number } | null = null;
  for (const edge of layout.roadEdges) {
    const d = nearestOnPolyline({ x, z }, edge.points).distance;
    if (d <= edge.width / 2 + 4 && (!best || d < best.d)) best = { edge, d };
  }
  return best?.edge ?? null;
}

/** 两线段的真交点（参数都落在开区间内），无交点返回 null。 */
function segmentIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r = { x: b.x - a.x, z: b.z - a.z }; const s = { x: d.x - c.x, z: d.z - c.z };
  const denom = r.x * s.z - r.z * s.x;
  if (Math.abs(denom) < 1e-9) return null; // 平行/共线
  const t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / denom;
  const u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / denom;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { x: a.x + r.x * t, z: a.z + r.z * t };
}

type Attach = { kind: "node"; id: string } | { kind: "edge"; edge: RoadEdge; point: Vec2; segment: number } | { kind: "free" };

/** 端点吸附后的接入对象：已有路口 / 路段中间（要拆）/ 自由点。与 planPatch.resolveEndpoint 同一口径（< 1 取路口，≤ 0.6 取路段）。 */
function attach(layout: CityLayout, p: Vec2): Attach {
  const at = quantize(p);
  const node = layout.roadNodes.find((candidate) => Math.hypot(candidate.x - at.x, candidate.z - at.z) < 1);
  if (node) return { kind: "node", id: node.id };
  let host: { edge: RoadEdge; hit: ReturnType<typeof nearestOnPolyline> } | null = null;
  for (const edge of layout.roadEdges) {
    const hit = nearestOnPolyline(at, edge.points);
    if (hit.distance <= 0.6 && (!host || hit.distance < host.hit.distance)) host = { edge, hit };
  }
  return host ? { kind: "edge", edge: host.edge, point: host.hit.point, segment: host.hit.segment } : { kind: "free" };
}

/** 端点处的相邻路方向（出发角）：已有路口 → 其关联边；路段中间 → 被拆出的两半。 */
function directionsAt(layout: CityLayout, end: Attach, at: Vec2): number[] {
  const toward = (from: Vec2, to: Vec2) => Math.atan2(to.z - from.z, to.x - from.x);
  if (end.kind === "node") {
    return layout.roadEdges.filter((edge) => edge.from === end.id || edge.to === end.id).map((edge) => {
      const pts = edge.from === end.id ? edge.points : [...edge.points].reverse();
      return toward(pts[0], pts[1]);
    });
  }
  if (end.kind === "edge") {
    const pts = end.edge.points;
    return [toward(at, pts[end.segment - 1]), toward(at, pts[end.segment])];
  }
  return [];
}

function minGap(angles: readonly number[]): number {
  const sorted = [...angles].sort((a, b) => a - b);
  let gap = Infinity;
  for (let k = 0; k < sorted.length; k += 1) gap = Math.min(gap, (k + 1 < sorted.length ? sorted[k + 1] : sorted[0] + Math.PI * 2) - sorted[k]);
  return gap;
}

/**
 * 画路的校验：from/to 是已吸附的坐标。硬阻止：太短/太长、锁定宿主、孤立（两端都没接上路网）、重复/退化、
 * 入水、穿过楼/配套/花园、与现有道路交叉（要在交叉点连接）、新引入的锐角路口。警告：新断头。
 */
export function validateRoadAdd(layout: CityLayout, model: CityModel, from: Vec2, to: Vec2, width: number): RoadVerdict {
  const blockers: string[] = []; const warnings: string[] = [];
  const a = quantize(from); const b = quantize(to);
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length < MIN_EDGE_LENGTH) return { blockers: ["edge-too-short"], warnings };
  if (length > MAX_NEW_EDGE) blockers.push("edge-too-long");
  const ea = attach(layout, a); const eb = attach(layout, b);
  const lockedNode = (end: Attach) => end.kind === "node" && layout.roadEdges.some((edge) => (edge.from === end.id || edge.to === end.id) && edgeLocked(edge));
  // 宿主是桥/引道/滨海段，或从桥头/滨海路口接出：会改变它们的形态，同拖路口一样锁定。
  if ((ea.kind === "edge" && edgeLocked(ea.edge)) || (eb.kind === "edge" && edgeLocked(eb.edge)) || lockedNode(ea) || lockedNode(eb)) return { blockers: ["locked-edge"], warnings };
  if (ea.kind === "node" && eb.kind === "node") {
    if (ea.id === eb.id) return { blockers: ["degenerate"], warnings };
    if (layout.roadEdges.some((edge) => edge.id === [ea.id, eb.id].sort().join("/"))) return { blockers: ["edge-exists"], warnings };
  }
  if (ea.kind === "free" && eb.kind === "free") blockers.push("isolated-road");
  if (ea.kind === "free" || eb.kind === "free") warnings.push("creates-dead-end");

  const next: RoadEdge = { id: "new", from: "a", to: "b", width, kind: width >= 8 ? "arterial" : "local", points: [a, b], structure: "ground-road" };
  if (badSamples(layout, next) > 0 || !layout.terrain.buildable(a.x, a.z) || !layout.terrain.buildable(b.x, b.z)) blockers.push("road-in-water");
  if (rectsHitBy(next, obstacleRects(layout, model)).size > 0) blockers.push("road-over-building");

  let crosses = false;
  for (const edge of layout.roadEdges) {
    if (edge.bridge || crosses) continue;
    for (let i = 1; i < edge.points.length; i += 1) {
      const hit = segmentIntersection(a, b, edge.points[i - 1], edge.points[i]);
      if (hit && Math.hypot(hit.x - a.x, hit.z - a.z) > CROSS_EPS && Math.hypot(hit.x - b.x, hit.z - b.z) > CROSS_EPS) { crosses = true; break; }
    }
  }
  if (crosses) blockers.push("crosses-road");

  // 锐角：只拦新引入的（接到的路口本来就锐角的不算新违例）。
  const dirAB = Math.atan2(b.z - a.z, b.x - a.x); const dirBA = Math.atan2(a.z - b.z, a.x - b.x);
  for (const [end, at, dir] of [[ea, a, dirAB], [eb, b, dirBA]] as const) {
    const existing = directionsAt(layout, end, at);
    if (existing.length + 1 < 3) continue;
    if (minGap([...existing, dir]) < ACUTE_LIMIT && !(existing.length >= 3 && minGap(existing) < ACUTE_LIMIT)) { blockers.push("acute-junction"); break; }
  }
  return { blockers, warnings };
}
