/**
 * 规划修复补丁层（docs/CITY_PLAN_MANUAL_REPAIR_SPEC.md §4/§5，M1 首批）。
 *
 * 定位：layoutCity 之后的纯后处理——生成器（createCityPlan/layoutCity，city-opt 分支的地盘）
 * 每次数据刷新重算整张图，用户编辑表达为「种子生成结果之上的覆写补丁」：补丁按稳定 id
 * 引用对象（session_ref / parcelId / roadNode 坐标 id），套用确定性、顺序无关。
 *
 * 契约（verify-plan-patch.mjs 守卫）：
 *   - 同一底层布局 + 同一补丁 → 逐字段相等；buildingMoves/suppressedContext 条目序无关，roadOps 按日志顺序；
 *   - 补丁只套在**未打补丁的底层布局**上（CityEngine 每次 layoutCity 重建后重新套）。不承诺叠套：
 *     节点移动/删路改写了 id，第二次套用时原 id 已不存在——曾在注释里声称「幂等」，
 *     实测叠套会报 missing-node/missing-edge，契约收窄为如实的样子。buildingMoves 叠套仍是 no-op
 *     （layoutCity 的 pins 先把楼放到目标地块，套用时命中「已在目标」分支）；
 *   - 失效条目（对象不存在 / 边锁定 / 地块被占 / 节点撞车 / 跨档位）不套用、进 stale 清单如实上报，不静默吞；
 *   - 桥（bridge/deck/ground-approach）与滨海段（purpose=waterfront）锁定不可编辑（SPEC §7.2）。
 *
 * **道路编辑是操作日志（roadOps），按顺序重放**：每个操作引用「执行当时的当前 id」。节点/路段 id 全由坐标推出
 * （`x:z` / `from/to`），所以同一底层布局 + 同一日志的重放是确定的，不需要把 id 翻回原始 id。
 * 曾经 nodeMoves/edgeDrops 两张表按原始 id 存——画路要把原路段从中间拆成两半，拆出来的新 id 在底层布局里不存在，
 * 「翻回原始 id」无从谈起；日志形式也让撤销自然（弹出最后一个操作）。代价：道路操作**有顺序**，
 * 不再满足「条目顺序倒排结果不变」（buildingMoves/suppressedContext 仍是集合，顺序无关）。
 *
 * 范围：buildingMoves 全量 + 道路日志（删/移/加）的套用与锁定规则；
 * suppressedContext（M3）仅透传过滤。plan 级约束复用（体检的另一半）等 city-opt 的
 * constraints.ts 导出稳定后再接（SPEC §0 重估条款）。
 */
import { hashSeed, type CityBuilding, type CityModel } from "../cityModel";
import { clearsHighways, roadNodeId } from "./cityPlan";
import type { CityLayout, RoadEdge, RoadNode, Vec2 } from "./cityLayout";
import { applySiteOps, type SiteOp } from "./planSites";
import { buildingRect, clearanceRoads, edgeLocked, parcelIndex, quantize, rectClearOfEdges, rectsOverlap, reservedParcelIds } from "./planGeometry";

export type { SiteOp } from "./planSites";

export const PLAN_PATCH_VERSION = 1;

/** 道路操作日志的一项。node/edge 是**执行当时**的当前 id。 */
export type RoadOp =
  | { t: "drop"; edge: string }
  | { t: "move"; node: string; to: Vec2 }
  /** 新增一段直路。端点吸附规则见 resolveEndpoint：靠近路口 → 接到路口；落在路段中间 → 把该路段拆成两半；否则新建路口。 */
  | { t: "add"; from: Vec2; to: Vec2; width: number };

export type PlanPatchV1 = {
  version: 1;
  seed: number;
  /** 补丁写下时的规模档位。跨档（岛放大、地块与节点重排）后全部条目失效——不做坐标重定位（SPEC §4）。 */
  scaleTier: number;
  updatedAt: number;
  /** 道路操作日志，按顺序重放。 */
  roadOps: RoadOp[];
  /** 设施（公共设施/花园/城区地标/背景楼）操作日志，按顺序重放，带位置校验（docs/…SPEC §14）。 */
  siteOps: SiteOp[];
  /** 会话楼 id（session_ref）→ 新地块 id（Parcel.id）。 */
  buildingMoves: Record<string, string>;
  /** 压制的背景楼 id（"context:<parcelId>"，M3）。 */
  suppressedContext: string[];
};

/** 条目无法套用的原因——诚实降级：丢弃 + 上报，绝不猜测替代目标。 */
export type PatchStaleEntry = {
  kind: "building-move" | "road-drop" | "road-move" | "road-add" | "site-remove" | "site-move" | "context-suppress";
  id: string;
  reason: "missing-node" | "missing-edge" | "missing-parcel" | "unknown-building" | "missing-context" | "locked-edge" | "parcel-occupied" | "node-collision" | "tier-changed" | "edge-exists" | "degenerate" | "unknown-site" | "site-changed" | "missing-target" | "target-occupied" | "site-blocked";
  detail: string;
};

export type PatchedLayout = { layout: CityLayout; stale: PatchStaleEntry[]; patchHash: string };

export function emptyPlanPatch(seed: number, scaleTier: number): PlanPatchV1 {
  return { version: PLAN_PATCH_VERSION, seed, scaleTier, updatedAt: 0, roadOps: [], siteOps: [], buildingMoves: {}, suppressedContext: [] };
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * 存档读回的宽容校验：顶层/必填字段不对 → null（整条丢弃）；集合字段里形状不对的单个条目丢弃。
 * 曾经用 `{...candidate, 默认值, ...candidate}` 补默认值——默认值被原值覆盖，存档里一个
 * `edgeDrops: null` 就让 applyPlanPatch 在 `[...null]` 处抛异常、整座城画不出来（tsc 也报 TS2783）。
 */
export function coercePlanPatch(raw: unknown): PlanPatchV1 | null {
  if (!isRecord(raw) || raw.version !== PLAN_PATCH_VERSION || !isFiniteNumber(raw.seed) || !isFiniteNumber(raw.scaleTier)) return null;
  const point = (value: unknown): Vec2 | null => (isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.z) ? { x: value.x, z: value.z } : null);
  const roadOps: RoadOp[] = [];
  // 早期开发版把道路编辑存成 edgeDrops/nodeMoves 两张表（原始 id）：先删后移，等价转成日志。
  if (Array.isArray(raw.edgeDrops)) for (const edge of raw.edgeDrops) if (typeof edge === "string") roadOps.push({ t: "drop", edge });
  if (isRecord(raw.nodeMoves)) for (const [node, to] of Object.entries(raw.nodeMoves).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const target = point(to); if (target) roadOps.push({ t: "move", node, to: target });
  }
  if (Array.isArray(raw.roadOps)) for (const op of raw.roadOps) {
    if (!isRecord(op)) continue;
    if (op.t === "drop" && typeof op.edge === "string") roadOps.push({ t: "drop", edge: op.edge });
    else if (op.t === "move" && typeof op.node === "string") { const to = point(op.to); if (to) roadOps.push({ t: "move", node: op.node, to }); }
    else if (op.t === "add" && isFiniteNumber(op.width)) { const from = point(op.from); const to = point(op.to); if (from && to) roadOps.push({ t: "add", from, to, width: op.width }); }
  }
  const siteOps: SiteOp[] = [];
  if (Array.isArray(raw.siteOps)) for (const op of raw.siteOps) {
    if (!isRecord(op) || typeof op.id !== "string") continue;
    const at = point(op.at) ?? undefined;
    if (op.t === "remove") siteOps.push({ t: "remove", id: op.id, ...(at ? { at } : {}) });
    else if (op.t === "move" && typeof op.to === "string") siteOps.push({ t: "move", id: op.id, to: op.to, ...(at ? { at } : {}) });
  }
  const buildingMoves: Record<string, string> = {};
  if (isRecord(raw.buildingMoves)) for (const [id, parcelId] of Object.entries(raw.buildingMoves)) {
    if (typeof parcelId === "string") buildingMoves[id] = parcelId;
  }
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  return {
    version: PLAN_PATCH_VERSION, seed: raw.seed, scaleTier: raw.scaleTier,
    updatedAt: isFiniteNumber(raw.updatedAt) ? raw.updatedAt : 0,
    roadOps, siteOps, buildingMoves, suppressedContext: strings(raw.suppressedContext),
  };
}

/** 补丁指纹：道路日志按顺序、其余键排序后规范序列化 → FNV；进 activityKey 触发静态城缓存重画。 */
export function hashPlanPatch(patch: PlanPatchV1): string {
  const canonical = JSON.stringify({
    version: patch.version,
    scaleTier: patch.scaleTier,
    roadOps: patch.roadOps,
    siteOps: patch.siteOps,
    buildingMoves: Object.keys(patch.buildingMoves).sort().map((id) => [id, patch.buildingMoves[id]]),
    suppressedContext: [...patch.suppressedContext].sort(),
  });
  return String(Math.round(hashSeed(canonical) * 1e9));
}


export { edgeLocked, clearanceRoads, parcelIndex, reservedParcelIds, rectClearOfEdges, buildingRect, rectsOverlap, quantize, type BuildingRect } from "./planGeometry";

/** 编辑前校验（SPEC §7.3）：blockers 非空必须拒绝提交；warnings 只提示。
 *  `layout` 是当前 effective 布局（已套补丁），校验看的是用户眼前的城市。 */
export function validateBuildingMove(layout: CityLayout, model: CityModel, patch: PlanPatchV1, buildingId: string, targetParcelId: string): { blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const home = layout.districts.find((district) => district.slots.has(buildingId));
  const building = model.buildings.find((candidate) => candidate.id === buildingId);
  if (!home || !building) return { blockers: ["unknown-building"], warnings };
  const parcels = parcelIndex(layout);
  const target = parcels.get(targetParcelId);
  if (!target) return { blockers: ["missing-parcel"], warnings };
  const ownParcelId = home.slots.get(buildingId)?.id;
  const reserved = reservedParcelIds(layout, patch.suppressedContext);
  // 自己当前所在地块不算被占（原地重放、换过去再换回来都合法）。
  const occupied = (reserved.has(targetParcelId) && ownParcelId !== targetParcelId)
    // 补丁里已有别的楼要搬去同一地块 → 冲突。
    || Object.entries(patch.buildingMoves).some(([id, parcelId]) => id !== buildingId && parcelId === targetParcelId);
  if (occupied) blockers.push("parcel-occupied");
  if (!rectClearOfEdges(target, clearanceRoads(layout), 0.5)) blockers.push("building-over-road");
  if (!layout.terrain.buildable(target.x, target.z)) blockers.push("not-buildable");
  else if (layout.terrain.slope(target.x, target.z) > 0.55) blockers.push("steep-slope");
  if (!clearsHighways(target, target.width, target.depth, layout.highways)) blockers.push("highway-clearance");
  // buildingOverlap（SPEC §7.3 硬阻止）：新位置的占地矩形与任何别的会话楼相交。
  const buildingsById = new Map(model.buildings.map((candidate) => [candidate.id, candidate]));
  const rect = buildingRect(building, target);
  const overlaps = layout.districts.some((district) => [...district.slots].some(([id, slot]) => {
    const other = buildingsById.get(id);
    return id !== buildingId && !!other && Math.hypot(slot.x - target.x, slot.z - target.z) < 60 && rectsOverlap(rect, buildingRect(other, slot));
  }));
  if (overlaps) blockers.push("building-overlap");
  // 软警告：跨小区（目标地块的街区被别的城区占用）——楼仍属原城区，只是搬出了自己的小区。
  const owner = layout.districts.find((district) => [...district.slots.values()].some((parcel) => parcel.blockId === target.blockId));
  if (owner && owner.id !== home.id) warnings.push("cross-district");
  return { blockers, warnings };
}

/** layoutCity 的落位钉子（SPEC §5 / §12.4）：补丁里的移楼在**落位阶段**生效，而不是只做后处理。
 *  只做后处理时，底层布局不知道楼搬走了——新家所在的空置街区支路已被 growWithBuildings 剪掉
 *  （楼落在没有路的街区），老家街区却因「仍有楼」保住了路；数据刷新后目标地块还可能被分给新会话，
 *  补丁随即以 parcel-occupied 失效、用户的修改悄悄消失。layoutCity 只在档位一致时认钉子。 */
export function layoutPinsFor(patch: PlanPatchV1 | null | undefined): { scaleTier: number; parcels: ReadonlyMap<string, string> } | null {
  if (!patch || !Object.keys(patch.buildingMoves).length) return null;
  return { scaleTier: patch.scaleTier, parcels: new Map(Object.keys(patch.buildingMoves).sort().map((id) => [id, patch.buildingMoves[id]])) };
}

/** 编辑器写补丁：追加一个道路操作（引用生效布局里的当前 id）。 */
export function appendRoadOp(patch: PlanPatchV1, op: RoadOp, now = Date.now()): PlanPatchV1 {
  return { ...patch, updatedAt: now, roadOps: [...patch.roadOps, op] };
}

/** 编辑器写补丁：追加一个设施操作（at = 设施当前位置，用来在重放时校验「还是同一座」）。 */
export function appendSiteOp(patch: PlanPatchV1, op: SiteOp, now = Date.now()): PlanPatchV1 {
  return { ...patch, updatedAt: now, siteOps: [...patch.siteOps, op] };
}

/** 端点离已有路口这么近就接到路口上。 */
export const SNAP_NODE_RADIUS = 1;
/** 端点落在路段中间（离折线 ≤ 此值）就把该路段拆成两半。 */
export const SNAP_EDGE_RADIUS = 0.6;

type RoadState = { nodes: RoadNode[]; edges: RoadEdge[] };

const edgeIdOf = (from: string, to: string) => [from, to].sort().join("/");

export function nearestOnPolyline(p: Vec2, points: readonly Vec2[]): { distance: number; segment: number; point: Vec2 } {
  let best = { distance: Infinity, segment: 1, point: points[0] };
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]; const b = points[i];
    const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
    const q = { x: a.x + dx * t, z: a.z + dz * t };
    const distance = Math.hypot(p.x - q.x, p.z - q.z);
    if (distance < best.distance) best = { distance, segment: i, point: q };
  }
  return best;
}

/** 把路段在 p 处拆成两半（属性完整继承；折线按最近一段切开）。p 取整到 0.01。 */
function splitEdge(state: RoadState, edge: RoadEdge, p: Vec2, segment: number): string {
  const at = quantize(p);
  const id = roadNodeId(at);
  const first = edge.points.slice(0, segment); first.push(at);
  const second = [at, ...edge.points.slice(segment)];
  if (!state.nodes.some((node) => node.id === id)) state.nodes.push({ id, x: at.x, z: at.z });
  state.edges = state.edges.filter((candidate) => candidate !== edge);
  state.edges.push({ ...edge, id: edgeIdOf(edge.from, id), from: edge.from, to: id, points: first });
  state.edges.push({ ...edge, id: edgeIdOf(id, edge.to), from: id, to: edge.to, points: second });
  return id;
}

/** 端点解析：路口 → 路段中间（拆开）→ 新建路口。碰到锁定路段（桥/引道/滨海）返回 "locked-edge"。 */
function resolveEndpoint(state: RoadState, p: Vec2): { id: string } | { error: "locked-edge" } {
  const at = quantize(p);
  const near = state.nodes.find((node) => Math.hypot(node.x - at.x, node.z - at.z) < SNAP_NODE_RADIUS);
  if (near) return { id: near.id };
  let host: { edge: RoadEdge; hit: ReturnType<typeof nearestOnPolyline> } | null = null;
  for (const edge of state.edges) {
    const hit = nearestOnPolyline(at, edge.points);
    if (hit.distance <= SNAP_EDGE_RADIUS && (!host || hit.distance < host.hit.distance)) host = { edge, hit };
  }
  if (host) {
    if (edgeLocked(host.edge)) return { error: "locked-edge" };
    return { id: splitEdge(state, host.edge, host.hit.point, host.hit.segment) };
  }
  const id = roadNodeId(at);
  state.nodes.push({ id, x: at.x, z: at.z });
  return { id };
}

/**
 * 重放道路操作日志。每个操作在**试算副本**上执行，成功才提交——否则「端点已把路拆了、整条边却因重复而失败」
 * 会留下半截改动。失败的操作进 stale、不影响后续操作（后续操作若引用了它产生的 id，会各自报 missing）。
 */
function replayRoadOps(layout: CityLayout, ops: readonly RoadOp[], stale: PatchStaleEntry[]): { nodes: RoadNode[]; edges: RoadEdge[]; endMap: Map<string, string> } {
  let state: RoadState = { nodes: layout.roadNodes.map((node) => ({ ...node })), edges: [...layout.roadEdges] };
  // 回车点跟随：底层回车点节点 id → 当前 id（移动会改 id）。
  const endMap = new Map((layout.culDeSacEnds ?? []).map((end) => { const id = roadNodeId(quantize(end)); return [id, id] as [string, string]; }));
  ops.forEach((op, index) => {
    const label = `${index + 1}:${op.t}`;
    const trial: RoadState = { nodes: state.nodes.map((node) => ({ ...node })), edges: [...state.edges] };
    if (op.t === "drop") {
      const edge = trial.edges.find((candidate) => candidate.id === op.edge);
      if (!edge) { stale.push({ kind: "road-drop", id: label, reason: "missing-edge", detail: `路段 ${op.edge} 不存在（规划已重算或前序操作已改动）` }); return; }
      if (edgeLocked(edge)) { stale.push({ kind: "road-drop", id: label, reason: "locked-edge", detail: "骨架/桥/滨海段不可删" }); return; }
      trial.edges = trial.edges.filter((candidate) => candidate !== edge);
      const kept = new Set(trial.edges.flatMap((candidate) => [candidate.from, candidate.to]));
      trial.nodes = trial.nodes.filter((node) => kept.has(node.id) || (node.id !== edge.from && node.id !== edge.to));
    } else if (op.t === "move") {
      const node = trial.nodes.find((candidate) => candidate.id === op.node);
      if (!node) { stale.push({ kind: "road-move", id: label, reason: "missing-node", detail: `路口 ${op.node} 不存在` }); return; }
      if (trial.edges.some((edge) => (edge.from === node.id || edge.to === node.id) && edgeLocked(edge))) {
        stale.push({ kind: "road-move", id: label, reason: "locked-edge", detail: "路口连着桥/引道/滨海段，不可编辑" }); return;
      }
      const target = quantize(op.to);
      const fresh = roadNodeId(target);
      if (fresh === node.id) return; // 原地不动：无操作，不算失效
      // 目标落在别的路口上 → 重复节点/重复路段/零长边（曾一路流进渲染），整条拒绝。
      if (trial.nodes.some((other) => other.id === fresh)) { stale.push({ kind: "road-move", id: label, reason: "node-collision", detail: `目标 ${fresh} 已有路口` }); return; }
      const old = node.id;
      node.id = fresh; node.x = target.x; node.z = target.z;
      trial.edges = trial.edges.map((edge) => {
        if (edge.from !== old && edge.to !== old) return edge;
        const from = edge.from === old ? fresh : edge.from; const to = edge.to === old ? fresh : edge.to;
        const points = [...edge.points];
        if (edge.from === old) points[0] = { x: target.x, z: target.z };
        if (edge.to === old) points[points.length - 1] = { x: target.x, z: target.z };
        return { ...edge, id: edgeIdOf(from, to), from, to, points };
      });
      for (const [key, value] of endMap) if (value === old) endMap.set(key, fresh);
    } else {
      const a = resolveEndpoint(trial, op.from);
      if ("error" in a) { stale.push({ kind: "road-add", id: label, reason: a.error, detail: "起点落在桥/引道/滨海段上，不能从这里接路" }); return; }
      const b = resolveEndpoint(trial, op.to);
      if ("error" in b) { stale.push({ kind: "road-add", id: label, reason: b.error, detail: "终点落在桥/引道/滨海段上，不能从这里接路" }); return; }
      if (a.id === b.id) { stale.push({ kind: "road-add", id: label, reason: "degenerate", detail: "起点和终点是同一个路口" }); return; }
      const id = edgeIdOf(a.id, b.id);
      if (trial.edges.some((edge) => edge.id === id)) { stale.push({ kind: "road-add", id: label, reason: "edge-exists", detail: `路段 ${id} 已存在` }); return; }
      const na = trial.nodes.find((node) => node.id === a.id)!; const nb = trial.nodes.find((node) => node.id === b.id)!;
      trial.edges.push({
        id, from: a.id, to: b.id, width: op.width, kind: op.width >= 8 ? "arterial" : "local",
        points: [{ x: na.x, z: na.z }, { x: nb.x, z: nb.z }], structure: "ground-road",
      });
    }
    state = trial;
  });
  return { nodes: state.nodes, edges: state.edges, endMap };
}

/** 套用补丁（SPEC §5；顺序 道路日志 → 设施日志 → buildingMoves → 派生重算 → suppressedContext）。
 *  不改入参；失效条目进 stale。 */
export function applyPlanPatch(layout: CityLayout, patch: PlanPatchV1): PatchedLayout {
  const stale: PatchStaleEntry[] = [];
  const patchHash = hashPlanPatch(patch);

  // ── 0. 跨档位：岛放大后地块/节点全部重排，整份补丁失效（不做坐标重定位，SPEC §4）──
  if (patch.scaleTier !== layout.scaleTier) {
    const detail = `补丁写于第 ${patch.scaleTier} 档，城市已扩容到第 ${layout.scaleTier} 档`;
    for (const id of Object.keys(patch.buildingMoves).sort()) stale.push({ kind: "building-move", id, reason: "tier-changed", detail });
    patch.roadOps.forEach((op, index) => stale.push({ kind: op.t === "drop" ? "road-drop" : op.t === "move" ? "road-move" : "road-add", id: `${index + 1}:${op.t}`, reason: "tier-changed", detail }));
    patch.siteOps.forEach((op, index) => stale.push({ kind: op.t === "remove" ? "site-remove" : "site-move", id: `${index + 1}:${op.t}`, reason: "tier-changed", detail }));
    for (const id of [...patch.suppressedContext].sort()) stale.push({ kind: "context-suppress", id, reason: "tier-changed", detail });
    return { layout, stale, patchHash };
  }

  // ── 1. 道路操作日志（删/移/加，按顺序重放）──
  const replayed = patch.roadOps.length ? replayRoadOps(layout, patch.roadOps, stale) : null;
  const roadNodes = replayed ? replayed.nodes : layout.roadNodes;
  const roadEdges = replayed ? replayed.edges : layout.roadEdges;

  // ── 2. 设施操作日志（删/移）：先于会话楼移动套用，后者看到的是设施改动后的占用 ──
  const sites = patch.siteOps.length ? applySiteOps(layout, patch.siteOps, patch.suppressedContext, stale) : null;
  const view: CityLayout = sites ? { ...layout, ...sites } : layout;

  // ── 3. buildingMoves：目标缺失/被占（按套用顺序先到先得）→ stale；否则换 slot 重算地面高度 ──
  const districts = layout.districts.map((district) => ({ ...district, slots: new Map(district.slots), grounds: new Map(district.grounds), carPaths: district.carPaths }));
  if (Object.keys(patch.buildingMoves).length) {
    const parcels = parcelIndex(view);
    const taken = reservedParcelIds(view, patch.suppressedContext);
    for (const buildingId of Object.keys(patch.buildingMoves).sort()) {
      const targetId = patch.buildingMoves[buildingId];
      const home = districts.find((district) => district.slots.has(buildingId));
      if (!home) { stale.push({ kind: "building-move", id: buildingId, reason: "unknown-building", detail: "会话楼不在当前布局（窗口已换）" }); continue; }
      if (home.slots.get(buildingId)!.id === targetId) continue; // 已在目标地块（layoutCity pins 已落位，或叠套）
      const target = parcels.get(targetId);
      if (!target) { stale.push({ kind: "building-move", id: buildingId, reason: "missing-parcel", detail: "目标地块不存在（规划已重算）" }); continue; }
      if (taken.has(targetId)) { stale.push({ kind: "building-move", id: buildingId, reason: "parcel-occupied", detail: "目标地块已被会话楼/配套/花园/地标/背景楼占用" }); continue; }
      taken.delete(home.slots.get(buildingId)!.id);
      taken.add(targetId);
      home.slots.set(buildingId, target);
      home.grounds.set(buildingId, layout.terrain.height(target.x, target.z));
    }
  }

  // ── 4. 派生重算：回车点跟随节点映射按度口径重筛；车流按新边对集过滤（同 growWithBuildings）──
  const degree = new Map<string, number>();
  for (const edge of roadEdges) if (!edge.bridge) for (const id of [edge.from, edge.to]) degree.set(id, (degree.get(id) ?? 0) + 1);
  const nodeById = new Map(roadNodes.map((node) => [node.id, node]));
  const culDeSacEnds = (layout.culDeSacEnds ?? []).flatMap((end) => {
    const original = roadNodeId(quantize(end));
    const id = replayed ? replayed.endMap.get(original) ?? original : original;
    const node = nodeById.get(id);
    return node && degree.get(id) === 1 ? [{ x: node.x, z: node.z }] : [];
  });
  // 车流路径逐节点走（growWithBuildings 按 from/to 对过滤）；折线路段再补中间点对，两种口径都认。
  const pairKey = (a: Vec2, b: Vec2) => [`${a.x}:${a.z}`, `${b.x}:${b.z}`].sort().join("/");
  const pairs = new Set<string>();
  for (const edge of roadEdges) {
    pairs.add([edge.from, edge.to].sort().join("/"));
    for (let i = 1; i < edge.points.length; i += 1) pairs.add(pairKey(edge.points[i - 1], edge.points[i]));
  }
  for (const district of districts) {
    district.carPaths = district.carPaths.filter((route) => route.every((p, i) => i === 0 || pairs.has(pairKey(route[i - 1], p))));
  }

  // ── 5. suppressedContext（M3 透传）──
  let { contextBuildings } = view;
  const suppressed = new Set(patch.suppressedContext);
  if (suppressed.size) {
    // 按原始集合逐条比对：曾以「总数没变」为前提，只要有一条压制生效，其余不存在的 id 就不再上报。
    const existing = new Set(view.contextBuildings.map((context) => context.id));
    for (const id of [...suppressed].sort()) if (!existing.has(id)) stale.push({ kind: "context-suppress", id, reason: "missing-context", detail: "背景楼不存在（布局重算后未生成）" });
    contextBuildings = contextBuildings.filter((context) => !suppressed.has(context.id));
  }

  const suffix = `|patch:${patchHash}`;
  const activityKey = typeof layout.activityKey === "string" && layout.activityKey.endsWith(suffix)
    ? layout.activityKey // 叠套时不重复追加指纹
    : `${layout.activityKey ?? ""}${suffix}`;

  return { layout: { ...view, roadNodes, roadEdges, districts, culDeSacEnds, contextBuildings, activityKey }, stale, patchHash };
}
