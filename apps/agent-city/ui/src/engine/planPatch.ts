/**
 * 规划修复补丁层（docs/CITY_PLAN_MANUAL_REPAIR_SPEC.md §4/§5，M1 首批）。
 *
 * 定位：layoutCity 之后的纯后处理——生成器（createCityPlan/layoutCity，city-opt 分支的地盘）
 * 每次数据刷新重算整张图，用户编辑表达为「种子生成结果之上的覆写补丁」：补丁按稳定 id
 * 引用对象（session_ref / parcelId / roadNode 坐标 id），套用确定性、顺序无关。
 *
 * 契约（verify-plan-patch.mjs 守卫）：
 *   - 同一底层布局 + 同一补丁 → 逐字段相等；补丁条目序倒排结果不变（排序后处理）；
 *   - 补丁只套在**未打补丁的底层布局**上（CityEngine 每次 layoutCity 重建后重新套）。不承诺叠套：
 *     节点移动/删路改写了 id，第二次套用时原 id 已不存在——曾在注释里声称「幂等」，
 *     实测叠套会报 missing-node/missing-edge，契约收窄为如实的样子。buildingMoves 叠套仍是 no-op
 *     （layoutCity 的 pins 先把楼放到目标地块，套用时命中「已在目标」分支）；
 *   - 失效条目（对象不存在 / 边锁定 / 地块被占 / 节点撞车 / 跨档位）不套用、进 stale 清单如实上报，不静默吞；
 *   - 桥（bridge/deck/ground-approach）与滨海段（purpose=waterfront）锁定不可编辑（SPEC §7.2）。
 *
 * **补丁永远存原始 id**：节点移动后按新坐标重挂 id，编辑器从 effective 布局拾取到的是新 id。
 * 直接写进补丁会对不上底层布局（拖过的节点再拖一次、删一条拖过的路 → 全部 stale）。
 * 编辑器必须经 `recordNodeMove` / `recordEdgeDrop` 写补丁，它们按 `PatchedLayout.ids` 翻译回原始 id。
 *
 * M1 范围：buildingMoves 全量 + nodeMoves/edgeDrops 的套用与锁定规则（编辑器 UI 属后续批）；
 * suppressedContext（M3）仅透传过滤。plan 级约束复用（体检的另一半）等 city-opt 的
 * constraints.ts 导出稳定后再接（SPEC §0 重估条款）。
 */
import { hashSeed, type CityBuilding, type CityModel } from "../cityModel";
import { clearsHighways, roadNodeId } from "./cityPlan";
import type { CityLayout, Parcel, RoadEdge, Vec2 } from "./cityLayout";

export const PLAN_PATCH_VERSION = 1;

export type PlanPatchV1 = {
  version: 1;
  seed: number;
  /** 补丁写下时的规模档位。跨档（岛放大、地块与节点重排）后全部条目失效——不做坐标重定位（SPEC §4）。 */
  scaleTier: number;
  updatedAt: number;
  /** 道路节点**原始** id（底层布局里的坐标串 "x:z"）→ 新位置；移动后节点按新坐标重挂 id 与边引用。 */
  nodeMoves: Record<string, Vec2>;
  /** 删除的路段**原始** id（"from/to" 字典序）。 */
  edgeDrops: string[];
  /** 会话楼 id（session_ref）→ 新地块 id（Parcel.id）。 */
  buildingMoves: Record<string, string>;
  /** 压制的背景楼 id（"context:<parcelId>"，M3）。 */
  suppressedContext: string[];
};

/** 条目无法套用的原因——诚实降级：丢弃 + 上报，绝不猜测替代目标。 */
export type PatchStaleEntry = {
  kind: "building-move" | "node-move" | "edge-drop" | "context-suppress";
  id: string;
  reason: "missing-node" | "missing-edge" | "missing-parcel" | "unknown-building" | "missing-context" | "locked-edge" | "parcel-occupied" | "node-collision" | "tier-changed";
  detail: string;
};

/** effective id → 原始 id（只记被重挂的；不在表里的 id 本身就是原始 id）。 */
export type PatchIdMap = { nodes: ReadonlyMap<string, string>; edges: ReadonlyMap<string, string> };

export type PatchedLayout = { layout: CityLayout; stale: PatchStaleEntry[]; patchHash: string; ids: PatchIdMap };

export function emptyPlanPatch(seed: number, scaleTier: number): PlanPatchV1 {
  return { version: PLAN_PATCH_VERSION, seed, scaleTier, updatedAt: 0, nodeMoves: {}, edgeDrops: [], buildingMoves: {}, suppressedContext: [] };
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
  const nodeMoves: Record<string, Vec2> = {};
  if (isRecord(raw.nodeMoves)) for (const [id, to] of Object.entries(raw.nodeMoves)) {
    if (isRecord(to) && isFiniteNumber(to.x) && isFiniteNumber(to.z)) nodeMoves[id] = { x: to.x, z: to.z };
  }
  const buildingMoves: Record<string, string> = {};
  if (isRecord(raw.buildingMoves)) for (const [id, parcelId] of Object.entries(raw.buildingMoves)) {
    if (typeof parcelId === "string") buildingMoves[id] = parcelId;
  }
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  return {
    version: PLAN_PATCH_VERSION, seed: raw.seed, scaleTier: raw.scaleTier,
    updatedAt: isFiniteNumber(raw.updatedAt) ? raw.updatedAt : 0,
    nodeMoves, edgeDrops: strings(raw.edgeDrops), buildingMoves, suppressedContext: strings(raw.suppressedContext),
  };
}

/** 补丁指纹：键排序后的规范序列化 → FNV；进 activityKey 触发静态城缓存重画。 */
export function hashPlanPatch(patch: PlanPatchV1): string {
  const canonical = JSON.stringify({
    version: patch.version,
    scaleTier: patch.scaleTier,
    nodeMoves: Object.keys(patch.nodeMoves).sort().map((id) => [id, patch.nodeMoves[id]]),
    edgeDrops: [...patch.edgeDrops].sort(),
    buildingMoves: Object.keys(patch.buildingMoves).sort().map((id) => [id, patch.buildingMoves[id]]),
    suppressedContext: [...patch.suppressedContext].sort(),
  });
  return String(Math.round(hashSeed(canonical) * 1e9));
}

const quantize = (p: Vec2): Vec2 => ({ x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 });

/** M1 锁定口径（SPEC §7.2）：桥面、桥头引道、滨海段不可编辑——它们的几何由海滨带/桥锚定，
 *  拖动会连锁破坏 seaside/桥塔语义。 */
export function edgeLocked(edge: RoadEdge): boolean {
  return edge.bridge === true || edge.structure === "deck" || edge.structure === "ground-approach" || edge.purpose === "waterfront";
}

/** 楼的净空要避开的路：地面路（非桥）。体检与编辑校验共用这一个口径——
 *  曾经校验查全部路段、体检只查地面路，编辑器会拦下体检根本不报的落位（「三者同源」被破坏）。 */
export function clearanceRoads(layout: CityLayout): RoadEdge[] {
  return layout.roadEdges.filter((edge) => !edge.bridge);
}

/** 全城地块索引：街区地块 + 已落楼地块（酒店地块不进 layout.blocks，只存在于 slots 里）。 */
export function parcelIndex(layout: CityLayout): Map<string, Parcel> {
  const index = new Map<string, Parcel>();
  for (const block of layout.blocks) for (const parcel of block.parcels) index.set(parcel.id, parcel);
  for (const district of layout.districts) for (const parcel of district.slots.values()) if (!index.has(parcel.id)) index.set(parcel.id, parcel);
  return index;
}

/** 被占用/预留的地块：会话楼、配套整街区、小区花园街区、城区地标、未压制的背景楼。
 *  编辑校验与套用共用——套用曾只看会话楼，刷新后目标地块冒出背景楼时照套不误，两楼叠在一起。 */
export function reservedParcelIds(layout: CityLayout, patch: PlanPatchV1): Set<string> {
  const parcels = parcelIndex(layout);
  const blockOf = new Map<string, string[]>();
  for (const block of layout.blocks) for (const parcel of block.parcels) {
    const list = blockOf.get(parcel.blockId); if (list) list.push(parcel.id); else blockOf.set(parcel.blockId, [parcel.id]);
  }
  const reserved = new Set<string>();
  for (const district of layout.districts) for (const parcel of district.slots.values()) reserved.add(parcel.id);
  for (const civic of layout.civics) for (const parcelId of blockOf.get(civic.parcelId) ?? [civic.parcelId]) reserved.add(parcelId);
  for (const garden of layout.gardens) for (const parcelId of blockOf.get(garden.blockId) ?? []) reserved.add(parcelId);
  for (const landmark of layout.districtLandmarks ?? []) reserved.add(landmark.parcelId);
  const suppressed = new Set(patch.suppressedContext);
  for (const context of layout.contextBuildings) {
    const parcelId = context.id.replace(/^context:/, "");
    if (parcels.has(parcelId) && !suppressed.has(context.id)) reserved.add(parcelId);
  }
  return reserved;
}

/** 朝向矩形与路段带是否相交（口径同 cityLayout 的 lotClearOfRoads：局部轴投影 + 路幅半宽外扩）。 */
export function rectClearOfEdges(rect: { x: number; z: number; yaw: number; width: number; depth: number }, edges: readonly RoadEdge[], pad = 0.5): boolean {
  const ax = Math.sin(rect.yaw); const az = Math.cos(rect.yaw); // 局部 z 轴（进深）
  const bx = az; const bz = -ax;                                // 局部 x 轴（面宽）
  for (const edge of edges) {
    const half = edge.width / 2 + pad;
    for (let i = 1; i < edge.points.length; i += 1) {
      const a = edge.points[i - 1]; const b = edge.points[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let d = 0; d <= len; d += 1.5) {
        const t = len ? d / len : 0;
        const dx = a.x + (b.x - a.x) * t - rect.x; const dz = a.z + (b.z - a.z) * t - rect.z;
        if (Math.abs(dx * bx + dz * bz) < rect.width / 2 + half && Math.abs(dx * ax + dz * az) < rect.depth / 2 + half) return false;
      }
    }
  }
  return true;
}

export type BuildingRect = { x: number; z: number; yaw: number; width: number; depth: number };

/**
 * 楼的实际占地矩形（朝向随地块）：非塔楼取地块面宽/进深的 0.92/0.9（同 FlightWorld 的 long 口径），
 * 塔楼/地标取 footprint 方形。**不能**用 FlightWorld 的保守 AABB（地块对角线方形，半宽 ≈ 4.7）：
 * 同街区地块间距 ≈ 7.2，相邻两楼必然「相交」——真实城市 380 楼报 253 条、1600 楼报 1111 条
 * buildingOverlap error，体检被噪声淹没。碰撞要保守，重叠判定要贴身，两件事不能共用一个包络。
 */
export function buildingRect(building: Pick<CityBuilding, "footprint" | "archetype">, slot: Parcel): BuildingRect {
  if (building.archetype === "tower" || building.archetype === "landmark") {
    return { x: slot.x, z: slot.z, yaw: slot.yaw, width: building.footprint, depth: building.footprint };
  }
  return { x: slot.x, z: slot.z, yaw: slot.yaw, width: slot.width * 0.92, depth: slot.depth * 0.9 };
}

/** 两个朝向矩形是否相交（分离轴定理，四根轴）。贴边（间隙 ≤ 1e-6）不算相交。 */
export function rectsOverlap(a: BuildingRect, b: BuildingRect): boolean {
  const axesOf = (r: BuildingRect) => [{ x: Math.cos(r.yaw), z: -Math.sin(r.yaw) }, { x: Math.sin(r.yaw), z: Math.cos(r.yaw) }];
  const extent = (r: BuildingRect, axis: Vec2) => {
    const [u, v] = axesOf(r);
    return Math.abs(u.x * axis.x + u.z * axis.z) * r.width / 2 + Math.abs(v.x * axis.x + v.z * axis.z) * r.depth / 2;
  };
  for (const axis of [...axesOf(a), ...axesOf(b)]) {
    const gap = Math.abs((b.x - a.x) * axis.x + (b.z - a.z) * axis.z);
    if (gap >= extent(a, axis) + extent(b, axis) - 1e-6) return false;
  }
  return true;
}

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
  const reserved = reservedParcelIds(layout, patch);
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

/** 编辑器写补丁：拖动 effective 布局里的节点 → 以原始 id 记录（重复拖同一节点覆盖原条目）。 */
export function recordNodeMove(patch: PlanPatchV1, patched: PatchedLayout, effectiveNodeId: string, to: Vec2, now = Date.now()): PlanPatchV1 {
  const original = patched.ids.nodes.get(effectiveNodeId) ?? effectiveNodeId;
  return { ...patch, updatedAt: now, nodeMoves: { ...patch.nodeMoves, [original]: quantize(to) } };
}

/** 编辑器写补丁：删除 effective 布局里的路段 → 以原始 id 记录。 */
export function recordEdgeDrop(patch: PlanPatchV1, patched: PatchedLayout, effectiveEdgeId: string, now = Date.now()): PlanPatchV1 {
  const original = patched.ids.edges.get(effectiveEdgeId) ?? effectiveEdgeId;
  if (patch.edgeDrops.includes(original)) return patch;
  return { ...patch, updatedAt: now, edgeDrops: [...patch.edgeDrops, original].sort() };
}

const NO_IDS: PatchIdMap = { nodes: new Map(), edges: new Map() };

/** 套用补丁（SPEC §5；顺序 edgeDrops → nodeMoves → buildingMoves → 派生重算 → suppressedContext。
 *  删除先于移动：补丁里的边/节点 id 都是底层布局的原始 id，节点移动会重挂 id，先删才不会失配）。
 *  不改入参；失效条目进 stale。 */
export function applyPlanPatch(layout: CityLayout, patch: PlanPatchV1): PatchedLayout {
  const stale: PatchStaleEntry[] = [];
  const patchHash = hashPlanPatch(patch);

  // ── 0. 跨档位：岛放大后地块/节点全部重排，整份补丁失效（不做坐标重定位，SPEC §4）──
  if (patch.scaleTier !== layout.scaleTier) {
    const detail = `补丁写于第 ${patch.scaleTier} 档，城市已扩容到第 ${layout.scaleTier} 档`;
    for (const id of Object.keys(patch.buildingMoves).sort()) stale.push({ kind: "building-move", id, reason: "tier-changed", detail });
    for (const id of Object.keys(patch.nodeMoves).sort()) stale.push({ kind: "node-move", id, reason: "tier-changed", detail });
    for (const id of [...patch.edgeDrops].sort()) stale.push({ kind: "edge-drop", id, reason: "tier-changed", detail });
    for (const id of [...patch.suppressedContext].sort()) stale.push({ kind: "context-suppress", id, reason: "tier-changed", detail });
    return { layout, stale, patchHash, ids: NO_IDS };
  }

  let { roadNodes, roadEdges } = layout;
  const nodeId = (x: number, z: number) => roadNodeId(quantize({ x, z }));

  // ── 1. edgeDrops：锁定/缺失跳过；删后清孤立节点 ──
  const drops = new Set([...patch.edgeDrops].sort());
  if (drops.size) {
    for (const id of drops) if (!layout.roadEdges.some((edge) => edge.id === id)) stale.push({ kind: "edge-drop", id, reason: "missing-edge", detail: "路段不存在（规划已重算）" });
    roadEdges = roadEdges.filter((edge) => {
      if (!drops.has(edge.id)) return true;
      if (edgeLocked(edge)) { stale.push({ kind: "edge-drop", id: edge.id, reason: "locked-edge", detail: "骨架/桥/滨海段不可删（M1）" }); return true; }
      return false;
    });
    const kept = new Set(roadEdges.flatMap((edge) => [edge.from, edge.to]));
    roadNodes = roadNodes.filter((node) => kept.has(node.id));
  }

  // ── 2. nodeMoves：锁定边触碰即整条跳过；节点映射必须是单射，否则撞车条目整体失效 ──
  const movedIds = new Map<string, string>(); // 原始节点 id → 新节点 id
  const nodeMoves = Object.keys(patch.nodeMoves).sort();
  if (nodeMoves.length) {
    const byId = new Map(roadNodes.map((node) => [node.id, node]));
    const candidates = new Map<string, Vec2>(); // 原始 id → 量化后的目标
    for (const id of nodeMoves) {
      if (!byId.has(id)) { stale.push({ kind: "node-move", id, reason: "missing-node", detail: "规划里没有这个节点（城市已重排或种子已换）" }); continue; }
      if (roadEdges.some((edge) => (edge.from === id || edge.to === id) && edgeLocked(edge))) {
        stale.push({ kind: "node-move", id, reason: "locked-edge", detail: "节点连着桥/引道/滨海段，M1 锁定不可编辑" });
        continue;
      }
      const target = quantize(patch.nodeMoves[id]);
      if (nodeId(target.x, target.z) !== id) candidates.set(id, target);
    }
    // 撞车：目标落在一个不动的节点上（含相邻节点 → 零长边），或两条移动去同一点。
    // 曾不查：重复节点 id、重复路段 id、`0:0/0:0` 零长边一路流进渲染。被拒的节点留在原位，
    // 又可能挡住别人的目标——迭代到稳定（每轮至少拒一条，必然收敛）。
    for (;;) {
      const counts = new Map<string, number>();
      for (const target of candidates.values()) { const fresh = nodeId(target.x, target.z); counts.set(fresh, (counts.get(fresh) ?? 0) + 1); }
      const rejected = [...candidates].filter(([, target]) => {
        const fresh = nodeId(target.x, target.z);
        return (counts.get(fresh) ?? 0) > 1 || (byId.has(fresh) && !candidates.has(fresh));
      }).map(([id]) => id);
      if (!rejected.length) break;
      for (const id of rejected) {
        const target = candidates.get(id)!;
        stale.push({ kind: "node-move", id, reason: "node-collision", detail: `目标 ${nodeId(target.x, target.z)} 已有节点或与另一条移动重合` });
        candidates.delete(id);
      }
    }
    if (candidates.size) {
      roadNodes = roadNodes.map((node) => {
        const target = candidates.get(node.id);
        if (!target) return node;
        const fresh = nodeId(target.x, target.z);
        movedIds.set(node.id, fresh);
        return { ...node, id: fresh, x: target.x, z: target.z };
      });
      const at = new Map(roadNodes.map((node) => [node.id, node]));
      roadEdges = roadEdges.map((edge) => {
        const from = movedIds.get(edge.from) ?? edge.from;
        const to = movedIds.get(edge.to) ?? edge.to;
        if (from === edge.from && to === edge.to) return edge;
        const points = [...edge.points];
        if (from !== edge.from) points[0] = { x: at.get(from)!.x, z: at.get(from)!.z };
        if (to !== edge.to) points[points.length - 1] = { x: at.get(to)!.x, z: at.get(to)!.z };
        return { ...edge, id: [from, to].sort().join("/"), from, to, points };
      });
    }
  }
  const nodeIds = new Map([...movedIds].map(([original, fresh]) => [fresh, original]));
  const edgeIds = new Map<string, string>();
  for (const edge of layout.roadEdges) {
    const from = movedIds.get(edge.from) ?? edge.from; const to = movedIds.get(edge.to) ?? edge.to;
    const fresh = [from, to].sort().join("/");
    if (fresh !== edge.id) edgeIds.set(fresh, edge.id);
  }

  // ── 3. buildingMoves：目标缺失/被占（按套用顺序先到先得）→ stale；否则换 slot 重算地面高度 ──
  const districts = layout.districts.map((district) => ({ ...district, slots: new Map(district.slots), grounds: new Map(district.grounds), carPaths: district.carPaths }));
  if (Object.keys(patch.buildingMoves).length) {
    const parcels = parcelIndex(layout);
    const taken = reservedParcelIds(layout, patch);
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
    const id = movedIds.get(nodeId(end.x, end.z)) ?? nodeId(end.x, end.z);
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
  let { contextBuildings } = layout;
  const suppressed = new Set(patch.suppressedContext);
  if (suppressed.size) {
    // 按原始集合逐条比对：曾以「总数没变」为前提，只要有一条压制生效，其余不存在的 id 就不再上报。
    const existing = new Set(layout.contextBuildings.map((context) => context.id));
    for (const id of [...suppressed].sort()) if (!existing.has(id)) stale.push({ kind: "context-suppress", id, reason: "missing-context", detail: "背景楼不存在（布局重算后未生成）" });
    contextBuildings = contextBuildings.filter((context) => !suppressed.has(context.id));
  }

  const suffix = `|patch:${patchHash}`;
  const activityKey = typeof layout.activityKey === "string" && layout.activityKey.endsWith(suffix)
    ? layout.activityKey // 叠套时不重复追加指纹
    : `${layout.activityKey ?? ""}${suffix}`;

  return { layout: { ...layout, roadNodes, roadEdges, districts, culDeSacEnds, contextBuildings, activityKey }, stale, patchHash, ids: { nodes: nodeIds, edges: edgeIds } };
}
