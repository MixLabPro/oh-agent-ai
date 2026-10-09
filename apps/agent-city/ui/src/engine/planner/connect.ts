/**
 * 统一连接器（CITY_NETWORK_FIRST_CODE_DESIGN §4，迁移批次 4）：ConnectionRequest → 有限搜索阶梯 → 事务提交。
 *
 * 阶梯（稳定顺序，§4.1「按稳定顺序尝试」）：
 *   1 direct-projection  最近合法路段投影直连（落点中段要求接近垂直；垂足离路段端 <12 吸附端点）；
 *   2 node-merge         并线：与已有道路节点直连（全程校验：不过水、可建、坡度、避让用地、端点净空角）；
 *   3 detour             绕障碍少量折线：朝最近落点、两侧 ±、三档侧向偏移的四点折线；
 *   4 grid-astar         有界网格 A*（状态 = 位置 + 入射方向；只限扩展节点数预算，禁墙钟超时——§5A-7）。
 * 批次 5 增补 bridge-candidate（显式桥候选：ground→bridge→ground 三段，§4.2）。
 *
 * 所有提交走 network.ts 的 commitNetworkPatch：草稿上应用 → 硬约束校验 → 版本匹配 → 一次替换；
 * 任一步失败正式网络零改动（§5A-7 确定性与无副作用失败）。
 * 确定性：无墙钟、无随机；候选排序的稳定次级键 = 距离 + id（§6.3 tie-break：成本、长度、候选稳定 id）。
 *
 * 迁移纪律：direct-projection 的判据逐字保留 connectToNetwork 的历史口径（投影/吸附/夹角/safeRoadLink/
 * clearAngle/交叉检查），批次 4-2 迁移以基线哈希不变为证明；node-merge/detour/grid-astar 是孤立分量
 * 兜底的替代路径（批次 4-3，行为变更），用地避让沿用旧 tolerance=1 档的 r+3。
 */
import { DetMath as Math } from "../detMath";
import { roadNodeId, segmentDistance } from "../cityPlan";
import type { RoadEdge, Vec2 } from "../cityLayout";
import { commitNetworkPatch, keyOf, type Network, type NetworkPatch, type PatchResult } from "./network";
import { crosses } from "./footprint";
import type { Geography } from "./geography";
import { corridorFailure, validateCandidate, type CorridorPolicy, type RouteCandidate, type RouteSegment } from "./validation";

export { corridorFailure, VALIDATION_CONFIG } from "./validation";
export type { CorridorPolicy, RouteCandidate, RouteSegment, CandidateValidation, CandidateViolation } from "./validation";

export type ConnectionPurpose = "district-access" | "site-access" | "coastal-link";
export type RoadClass = "arterial" | "collector" | "local";
/** 失败原因枚举（设计 §4.3；water-span 含河与海，slope 兼指不可建地形与超限坡度）。 */
export type ConnectionFailure =
  | "water-span" | "slope" | "site-clearance" | "junction-angle" | "search-budget"
  | "no-target" | "stale-base" | "projection-loss" | "crossing";
export type ConnectionStrategy = "direct-projection" | "node-merge" | "detour" | "grid-astar" | "bridge-candidate" | "mini-roundabout";
// 形态 backlog（2026-10-08 盘点，详见 docs/CITY_PLANNER_V2_FINDINGS §5）：
//  - "mini-roundabout"（city-roundabout 批次已立项，见下方「策略档」一节）：三岔夹角灰带用小型
//    交通环消解冲突，替代「删短枝」，压 acuteJunctions 残留。不在 DEFAULT_LADDER——它修复
//    既有路口，不是「从源到目标」的连接搜索；入口在 networkRepairs.resolveAcuteJunctions（删是最后手段）。
//  - 高架匝道/互通：不在此加档，随 RoadEdge 立体分层批次（设计 §4.2）。
//  - 尽端回车圈（cul-de-sac bulb）：EndpointRole planned-local 的渲染层装饰，内容打磨批。
const FAILURES: readonly string[] = ["water-span", "slope", "site-clearance", "junction-angle", "search-budget", "no-target", "stale-base", "projection-loss", "crossing"];

/** 版本化连接器配置（设计 §6.3：参数取值实测后锁入版本化配置，禁散落默认数值）。
 *  v2（city-roundabout 批次）：新增 mini-roundabout 策略档参数，旧键不动。 */
export const CONNECTOR_CONFIG = {
  version: 2,
  minJunctionAngleDeg: 60,      // 直连落点在中段时的最小夹角（connectToNetwork 历史默认档）
  endpointClearAngleDeg: 35,    // 端点处与既有路的净空角（clearAngle 历史口径）
  snapEndDistance: 12,          // 垂足离路段端 <12 吸附到端点（不留碎段）
  minLinkDistance: 0.5,
  directSiteMargin: 5,          // 直连的用地避让加成（safeRoadLink 的 radius+5）
  fallbackSiteMargin: 3,        // 并线/绕行/A* 的用地避让加成（旧孤立分量兜底 tolerance=1 档 = r+3）
  detourTargets: 3,             // 绕行候选落点数（按距离最近的目标路段）
  detourOffsets: [28, 56, 84],  // 绕行侧向偏移档（逐档放宽）
  detourMinBendCos: Math.cos((60 * Math.PI) / 180), // 折线拐角 ≥ 60°（防发卡弯）
  gridStep: 12,                 // A* 格距
  turnPenalty: 1.35,            // A* 转向成本系数（软成本：长度、转弯构成代价，§4.1）
  aStarBudget: 12000,           // 每请求 A* 扩展状态上限（节点数预算，非墙钟）
  aStarGoals: 8,                // A* 目标节点数（离 source 最近的目标节点子集）
  bridgeSampleSpacing: 6,       // 显式桥候选的连线采样步长（入口路历史口径）
  bridgeMaxSpanSamples: 14,     // 连续水段 ≤ 14 采样 ≈ 84 单位才可成桥（入口路历史口径）
  bridgeCandidates: 40,         // 桥候选按距离取前 N 个投影点（入口路历史口径；界限是候选数不是半径）
  // mini-roundabout 策略档（半径 10–14 的交叉口环，4–6 段弧边；见 proposeMiniRoundabout）
  roundaboutRadii: [10, 12, 14],       // 半径尝试档（确定性顺序，区间 10–14）
  roundaboutMaxPairAngleDeg: 50,       // 策略带宽：路口相邻边最小夹角 < 50° 才建环（30–50° 灰区；<30° 对按阈值放宽 (b) 接纳）
  roundaboutArcStepDeg: 90,            // 单段弧边跨越的最大圆心角（三岔口按角差 ceil 分段，合计恒 4–6 段）
  roundaboutMinSegments: 4,            // 弧段数下限（契约：环是 4–6 段）
  roundaboutMaxSegments: 6,            // 弧段数上限
  roundaboutMinChord: 3,               // 弧段最小弦长（防碎边；对夹角 <≈12° 三档半径都建不成，如实退回删除）
  roundaboutMinOuter: 6,               // 切点之后腿的剩余长度下限（不切出短残腿；不足则该档半径作废）
};

export type ConnectionTarget =
  /** 主网分量（intent.primaryComponentId 的分量，执行时由 isPrimaryNode 解析——不许「接最近分量」）。 */
  | { kind: "primary"; isPrimaryNode: (id: string) => boolean }
  /** 指定路段集合（并线/滨海段端接入等指名宿主的连接）。 */
  | { kind: "edges"; include: (edge: RoadEdge) => boolean }
  /** 指定节点（滨海/沿河路段断头互接的历史档：两端已判定，只差校验与提交）。 */
  | { kind: "node"; id: string };

export type ConnectionRequest = {
  id: string;
  source: Vec2;
  target: ConnectionTarget;
  purpose: ConnectionPurpose;
  allowBridge: boolean;
  maxLength: number;
  roadClass: RoadClass;
  /** 主干级连接（宽 12；滨海路段互接的历史档）。 */
  primary?: boolean;
  /** 直连落点夹角下限（度）；缺省 CONNECTOR_CONFIG.minJunctionAngleDeg。 */
  minAngleDeg?: number;
  /** A* 扩展节点预算；缺省 CONNECTOR_CONFIG.aStarBudget。 */
  searchBudget?: number;
};

export type ConnectionProposal = {
  patch: NetworkPatch;
  cost: number;
  strategy: ConnectionStrategy;
  policy: CorridorPolicy;
  /** 发起用途（批 A：门路判定以 purpose 为准——siteGate 旗标在 868 过河档被误标过）。 */
  purpose: ConnectionPurpose;
  /** 该连接是否检查与既有路交叉（滨海互接的历史档不查——提交期草稿复核沿用同一口径）。 */
  crossings: boolean;
  /** 显式桥段（原始坐标；调用方据此登记桥梁注册表 bridges）。 */
  bridgeSpans: BridgeSpan[];
};
export type ConnectionResult =
  | ({ ok: true; version?: number } & ConnectionProposal)
  | { ok: false; reason: ConnectionFailure; attempted: number; detail?: string };

/** 连接尝试的诊断记录（buildPlan 收集，经 plan.connections 导出；需求侧汇总见 intent.ts 的 unmet）。 */
export type ConnectionAttempt = {
  id: string;
  purpose: ConnectionPurpose;
  ok: boolean;
  strategy?: ConnectionStrategy;
  reason?: ConnectionFailure;
  detail?: string;
};

export type ConnectorWorld = {
  network: Network & { version?: number };
  geo: Geography;
  inRiver: (x: number, z: number) => boolean;
  /** 预留地（publicSites + landmarks，用地位置在规划中会挪动，故为函数）。 */
  reservations: () => Array<{ x: number; z: number; radius: number }>;
};

// ── 共享校验（§5B：连接器与骨架共用 corridor validator，skeleton.ts 出口弦不再当特例）──────────────

const directPolicy = (world: ConnectorWorld): CorridorPolicy => ({ requireBuildable: true, maxSlope: 0.9, sites: world.reservations(), siteMargin: CONNECTOR_CONFIG.directSiteMargin });
const fallbackPolicy = (world: ConnectorWorld, margin = CONNECTOR_CONFIG.fallbackSiteMargin): CorridorPolicy => ({ requireBuildable: true, maxSlope: 0.9, sites: world.reservations(), siteMargin: margin });

/** 骨架内部连线（高架出口接驳弦等）的可走性：逐 4 单位全 buildable（skeleton.ts 批次 5-2 起共用）。 */
export function walkableCorridor(geo: Geography, a: Vec2, b: Vec2): boolean {
  const distance = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(distance / 4));
  for (let k = 0; k <= steps; k += 1) if (!geo.buildable(a.x + (b.x - a.x) * k / steps, a.z + (b.z - a.z) * k / steps)) return false;
  return true;
}

/** re-stick 净空（clearsHighways 同公式，向上取整对齐既有 69 门）：5.25 + hypot(w,d)/2 + 1。 */
export const reStickClearance = (width: number, depth: number) => Math.ceil(5.25 + Math.hypot(width, depth) / 2 + 1);
/** 接驳弦不得切进保护区圆（skeleton.ts 出口弦 69 门的共享化形态，批次 5-2）。 */
export function chordClearsDisc(a: Vec2, b: Vec2, center: Vec2, clearance: number): boolean {
  return segmentDistance(center, a, b) >= clearance;
}

/** 端点净空角（connectToNetwork 的 clearAngle 逐字迁移）：at 处的任何既有路与 toward 方向夹角 ≥ 35°。 */
export function endpointClear(network: Network, at: Vec2, toward: Vec2): boolean {
  const id = roadNodeId(keyOf(at));
  const ux = toward.x - at.x; const uz = toward.z - at.z; const ul = Math.hypot(ux, uz) || 1;
  for (const edge of network.edges.values()) {
    if (edge.from !== id && edge.to !== id) continue;
    const other = edge.from === id ? edge.points[edge.points.length - 1] : edge.points[0];
    const vx = other.x - at.x; const vz = other.z - at.z; const vl = Math.hypot(vx, vz) || 1;
    if ((ux * vx + uz * vz) / (ul * vl) > Math.cos((CONNECTOR_CONFIG.endpointClearAngleDeg * Math.PI) / 180)) return false;
  }
  return true;
}

// ── 内部工具 ─────────────────────────────────────────────────────────────────────────────

type JoinPoint = { edge: RoadEdge | null; at: Vec2; onEnd: boolean };
type StrategyOutcome = { ok: true; join: JoinPoint; polyline: Vec2[]; cost: number } | { ok: false; reason: ConnectionFailure; detail: string };

function targetIncludes(request: ConnectionRequest, edge: RoadEdge): boolean {
  const t = request.target;
  if (t.kind === "primary") return t.isPrimaryNode(edge.from); // 历史口径：分量内边两端同分量，判 from 等价
  if (t.kind === "edges") return t.include(edge);
  return edge.from === t.id || edge.to === t.id;
}

function crossAny(network: Network, a: Vec2, b: Vec2, skip: RoadEdge | null): boolean {
  for (const other of network.edges.values()) {
    if (other === skip) continue;
    if (crosses(a, b, other.points[0], other.points[1])) return true;
  }
  return false;
}

/** 投影 + 端点吸附（connectToNetwork 同口径：垂足离端 <12 吸到端点；返回 keyed 落点）。 */
function projectOnEdge(source: Vec2, edge: RoadEdge): { p: Vec2; onEnd: boolean; d: number } {
  const [a, b] = edge.points;
  const dx = b.x - a.x; const dz = b.z - a.z; const len = Math.hypot(dx, dz) || 1;
  const t = Math.max(0, Math.min(1, ((source.x - a.x) * dx + (source.z - a.z) * dz) / (len * len)));
  let p = keyOf({ x: a.x + dx * t, z: a.z + dz * t });
  if (t * len < CONNECTOR_CONFIG.snapEndDistance) p = a; else if ((1 - t) * len < CONNECTOR_CONFIG.snapEndDistance) p = b;
  return { p, onEnd: p === a || p === b, d: Math.hypot(p.x - source.x, p.z - source.z) };
}

function targetNodesOf(request: ConnectionRequest, world: ConnectorWorld): Array<{ id: string; p: Vec2; d: number }> {
  const { network } = world;
  const out = new Map<string, Vec2>();
  if (request.target.kind === "primary") {
    for (const [id, node] of network.nodes) if (request.target.isPrimaryNode(id)) out.set(id, node);
  } else if (request.target.kind === "node") {
    const node = network.nodes.get(request.target.id);
    if (node) out.set(request.target.id, node);
  } else {
    for (const edge of network.edges.values()) {
      if (!request.target.include(edge)) continue;
      const from = network.nodes.get(edge.from); const to = network.nodes.get(edge.to);
      if (from) out.set(edge.from, from);
      if (to) out.set(edge.to, to);
    }
  }
  return [...out]
    .map(([id, p]) => ({ id, p, d: Math.hypot(p.x - request.source.x, p.z - request.source.z) }))
    .sort((x, y) => x.d - y.d || (x.id < y.id ? -1 : 1));
}

// ── 阶梯 1：最近合法路段投影直连（connectToNetwork 判据逐字保留）─────────────────────────

function proposeDirectProjection(request: ConnectionRequest, world: ConnectorWorld): StrategyOutcome {
  const { network } = world;
  const minAngle = ((request.minAngleDeg ?? CONNECTOR_CONFIG.minJunctionAngleDeg) * Math.PI) / 180;
  const policy = directPolicy(world);
  let best: { edge: RoadEdge; p: Vec2; d: number; onEnd: boolean } | null = null;
  const rejected: { nearest: { d: number; reason: ConnectionFailure } | null } = { nearest: null };
  let targets = 0;
  const note = (d: number, reason: ConnectionFailure) => { if (!rejected.nearest || d < rejected.nearest.d) rejected.nearest = { d, reason }; };
  for (const edge of network.edges.values()) {
    if (edge.bridge || !targetIncludes(request, edge)) continue;
    targets += 1;
    const { p, onEnd, d } = projectOnEdge(request.source, edge);
    if (d < CONNECTOR_CONFIG.minLinkDistance || d > request.maxLength || (best && d >= best.d)) continue;
    if (!onEnd) {
      const [a, b] = edge.points;
      const dx = b.x - a.x; const dz = b.z - a.z; const len = Math.hypot(dx, dz) || 1;
      const cos = Math.abs(((p.x - request.source.x) * dx + (p.z - request.source.z) * dz) / (d * len));
      if (cos > Math.cos(minAngle)) { note(d, "junction-angle"); continue; }
    }
    const corridor = corridorFailure(world, request.source, p, policy);
    if (corridor) { note(d, corridor); continue; }
    if (!endpointClear(network, p, request.source) || !endpointClear(network, request.source, p)) { note(d, "junction-angle"); continue; }
    if (crossAny(network, request.source, p, edge)) { note(d, "crossing"); continue; }
    best = { edge, p, d, onEnd };
  }
  if (!best) {
    return { ok: false, reason: targets ? rejected.nearest?.reason ?? "no-target" : "no-target", detail: targets ? `nearest rejection d=${rejected.nearest ? Math.round(rejected.nearest.d) : "-"} over ${targets} target edges` : `no target edge for ${request.id}` };
  }
  return { ok: true, join: { edge: best.edge, at: best.p, onEnd: best.onEnd }, polyline: [request.source, best.p], cost: best.d };
}

// ── 阶梯 2：并线（与已有道路节点直连，全程校验）─────────────────────────────────────────

function proposeNodeMerge(request: ConnectionRequest, world: ConnectorWorld, options: LadderOptions): StrategyOutcome {
  const { network } = world;
  const policy = fallbackPolicy(world, options.siteMargin);
  const relaxed = options.anglePolicy === "relaxed";
  const sourceId = roadNodeId(keyOf(request.source));
  const rejected: { nearest: { d: number; reason: ConnectionFailure } | null } = { nearest: null };
  const note = (d: number, reason: ConnectionFailure) => { if (!rejected.nearest || d < rejected.nearest.d) rejected.nearest = { d, reason }; };
  for (const { id, p, d } of targetNodesOf(request, world)) {
    if (id === sourceId || d < CONNECTOR_CONFIG.minLinkDistance) continue;
    if (network.edges.has([sourceId, id].sort().join("/"))) continue; // 已直连的节点（源悬挂边的对端）不是候选
    if (d > request.maxLength) break; // 已按 (d, id) 排序
    const corridor = corridorFailure(world, request.source, p, policy);
    if (corridor) { note(d, corridor); continue; }
    // 角度从宽档（软成本，设计 §4.1「转弯是软成本」）：只作最后手段，acuteJunctions 度量其质量代价。
    if (!relaxed && (!endpointClear(network, p, request.source) || !endpointClear(network, request.source, p))) { note(d, "junction-angle"); continue; }
    if (options.crossings !== false && crossAny(network, request.source, p, null)) { note(d, "crossing"); continue; }
    return { ok: true, join: { edge: null, at: p, onEnd: true }, polyline: [request.source, p], cost: d };
  }
  return { ok: false, reason: rejected.nearest?.reason ?? "no-target", detail: `no mergeable node within ${request.maxLength}${rejected.nearest ? ` (nearest rejection ${rejected.nearest.reason})` : ""}` };
}

// ── 阶梯 3：绕障碍少量折线（朝最近落点、两侧 ±、三档偏移的四点折线）──────────────────────

function proposeDetour(request: ConnectionRequest, world: ConnectorWorld): StrategyOutcome {
  const { network } = world;
  const policy = fallbackPolicy(world);
  const minAngle = ((request.minAngleDeg ?? CONNECTOR_CONFIG.minJunctionAngleDeg) * Math.PI) / 180;
  const joins: Array<{ edge: RoadEdge; p: Vec2; onEnd: boolean; d: number }> = [];
  for (const edge of network.edges.values()) {
    if (edge.bridge || !targetIncludes(request, edge)) continue;
    const { p, onEnd, d } = projectOnEdge(request.source, edge);
    if (d < CONNECTOR_CONFIG.minLinkDistance || d >= request.maxLength) continue; // 自身悬挂边的投影（d≈0）不是绕行落点
    joins.push({ edge, p, onEnd, d });
  }
  joins.sort((x, y) => x.d - y.d || (x.edge.id < y.edge.id ? -1 : 1));
  if (!joins.length) return { ok: false, reason: "no-target", detail: `no joinable edge within ${request.maxLength}` };
  let best: { join: (typeof joins)[number]; polyline: Vec2[]; cost: number } | null = null;
  const rejected: { nearest: { d: number; reason: ConnectionFailure } | null } = { nearest: null };
  const note = (d: number, reason: ConnectionFailure) => { if (!rejected.nearest || d < rejected.nearest.d) rejected.nearest = { d, reason }; };
  const cosAt = (b: Vec2, a: Vec2, c: Vec2) => { // b 处入/出方向的夹角余弦
    const ux = a.x - b.x; const uz = a.z - b.z; const vx = c.x - b.x; const vz = c.z - b.z;
    return (ux * vx + uz * vz) / ((Math.hypot(ux, uz) || 1) * (Math.hypot(vx, vz) || 1));
  };
  for (const join of joins.slice(0, CONNECTOR_CONFIG.detourTargets)) {
    const dx = join.p.x - request.source.x; const dz = join.p.z - request.source.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len; const uz = dz / len;
    for (const side of [1, -1]) for (const offset of CONNECTOR_CONFIG.detourOffsets) {
      const px = -uz * side; const pz = ux * side;
      const q1 = keyOf({ x: request.source.x + ux * (len / 3) + px * offset, z: request.source.z + uz * (len / 3) + pz * offset });
      const q2 = keyOf({ x: request.source.x + ux * (2 * len / 3) + px * offset, z: request.source.z + uz * (2 * len / 3) + pz * offset });
      const polyline = [request.source, q1, q2, join.p];
      const cost = Math.hypot(q1.x - request.source.x, q1.z - request.source.z) + Math.hypot(q2.x - q1.x, q2.z - q1.z) + Math.hypot(join.p.x - q2.x, join.p.z - q2.z);
      if (cost > request.maxLength || (best && cost >= best.cost)) continue;
      let failure = corridorFailure(world, request.source, q1, policy) ?? corridorFailure(world, q1, q2, policy) ?? corridorFailure(world, q2, join.p, policy);
      if (!failure && cosAt(q1, request.source, q2) > CONNECTOR_CONFIG.detourMinBendCos) failure = "junction-angle"; // 拐角 ≥ 60°：cos ≤ cos60
      if (!failure && cosAt(q2, q1, join.p) > CONNECTOR_CONFIG.detourMinBendCos) failure = "junction-angle";
      if (!failure && !join.onEnd) {
        const [a, b] = join.edge.points;
        const hx = b.x - a.x; const hz = b.z - a.z; const hl = Math.hypot(hx, hz) || 1;
        if (Math.abs(((join.p.x - q2.x) * hx + (join.p.z - q2.z) * hz) / ((Math.hypot(join.p.x - q2.x, join.p.z - q2.z) || 1) * hl)) > Math.cos(minAngle)) failure = "junction-angle";
      }
      if (!failure && (!endpointClear(network, join.p, q2) || !endpointClear(network, request.source, q1))) failure = "junction-angle";
      if (!failure) {
        let crossing = false;
        for (let k = 1; k < polyline.length && !crossing; k += 1) if (crossAny(network, polyline[k - 1], polyline[k], k === polyline.length - 1 ? join.edge : null)) crossing = true;
        if (crossing) failure = "crossing";
      }
      if (failure) { note(join.d, failure); continue; }
      best = { join, polyline, cost };
    }
  }
  if (!best) return { ok: false, reason: rejected.nearest?.reason ?? "no-target", detail: `no detour within ${request.maxLength} over ${Math.min(joins.length, CONNECTOR_CONFIG.detourTargets)} joins` };
  return { ok: true, join: { edge: best.join.edge, at: best.join.p, onEnd: best.join.onEnd }, polyline: best.polyline, cost: best.cost };
}

// ── 阶梯 4：有界网格 A*（状态 = 位置 + 入射方向；扩展节点预算）────────────────────────────

const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const;
const dirIndex = (dx: number, dz: number) => (((Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) % 8) + 8) % 8);

/** 源是度 1 断头时沿悬挂方向起搜（避免首步就急转）；否则朝目标。 */
function startHeading(network: Network, source: Vec2, toward: Vec2): number {
  const id = roadNodeId(keyOf(source));
  const incident = [...network.edges.values()].filter((e) => e.from === id || e.to === id);
  if (incident.length === 1) {
    const e = incident[0];
    const other = e.from === id ? network.nodes.get(e.to) : network.nodes.get(e.from);
    if (other) return dirIndex(source.x - other.x, source.z - other.z);
  }
  return dirIndex(toward.x - source.x, toward.z - source.z);
}

function proposeGridAStar(request: ConnectionRequest, world: ConnectorWorld): StrategyOutcome {
  const { network } = world;
  const step = CONNECTOR_CONFIG.gridStep;
  const budget = request.searchBudget ?? CONNECTOR_CONFIG.aStarBudget;
  const policy = fallbackPolicy(world);
  const sourceId = roadNodeId(keyOf(request.source));
  const goals = targetNodesOf(request, world)
    .filter((g) => g.id !== sourceId && !network.edges.has([sourceId, g.id].sort().join("/"))) // 已直连的节点（源悬挂边对端）不是目标
    .filter((g) => g.d <= request.maxLength).slice(0, CONNECTOR_CONFIG.aStarGoals);
  if (!goals.length) return { ok: false, reason: "no-target", detail: `no target node within ${request.maxLength}` };
  const cellMemo = new Map<string, boolean>(); // 胞元可通过性只依赖 geo/用地（请求内不变），按格记忆化
  const cellBlocked = (cx: number, cz: number) => {
    const ck = `${cx},${cz}`;
    const memo = cellMemo.get(ck);
    if (memo !== undefined) return memo;
    const p = { x: cx * step, z: cz * step };
    let blocked = true;
    if (world.geo.height(p.x, p.z) > 0.5 && !world.inRiver(p.x, p.z) && world.geo.buildable(p.x, p.z) && world.geo.terrain.slope(p.x, p.z) <= policy.maxSlope) {
      blocked = policy.sites.some((site) => Math.hypot(p.x - site.x, p.z - site.z) < site.radius + policy.siteMargin);
    }
    cellMemo.set(ck, blocked);
    return blocked;
  };
  const goalCell = (g: { p: Vec2 }) => ({ x: Math.round(g.p.x / step), z: Math.round(g.p.z / step) });
  const heuristic = (cx: number, cz: number) => { // 到最近目标的欧氏距离（≤ 剩余长度 ≤ 剩余成本，可证不高估）
    let h = Infinity;
    for (const g of goals) h = Math.min(h, Math.hypot(g.p.x - cx * step, g.p.z - cz * step));
    return h;
  };
  const sourceCell = { x: Math.round(request.source.x / step), z: Math.round(request.source.z / step) };
  const sdir = startHeading(network, request.source, goals[0].p);
  const keyOf3 = (cx: number, cz: number, dir: number) => `${cx},${cz},${dir}`;
  type State = { f: number; g: number; seq: number; cx: number; cz: number; dir: number };
  const open: State[] = [];
  const push = (s: State) => { // 小顶堆，次级键 = 插入序（确定性 tie-break）
    open.push(s); let i = open.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (open[p].f < open[i].f || (open[p].f === open[i].f && open[p].seq <= open[i].seq)) break; [open[p], open[i]] = [open[i], open[p]]; i = p; }
  };
  const pop = (): State => {
    const top = open[0]; const last = open.pop()!;
    if (open.length) {
      open[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1; const r = l + 1; let m = i;
        if (l < open.length && (open[l].f < open[m].f || (open[l].f === open[m].f && open[l].seq < open[m].seq))) m = l;
        if (r < open.length && (open[r].f < open[m].f || (open[r].f === open[m].f && open[r].seq < open[m].seq))) m = r;
        if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m;
      }
    }
    return top;
  };
  const best = new Map<string, number>();
  const prev = new Map<string, string>();
  const startKey = keyOf3(sourceCell.x, sourceCell.z, sdir);
  best.set(startKey, 0); prev.set(startKey, "");
  let seq = 1;
  push({ f: heuristic(sourceCell.x, sourceCell.z), g: 0, seq: seq++, cx: sourceCell.x, cz: sourceCell.z, dir: sdir });
  let expansions = 0;
  let goalState: { key: string; cx: number; cz: number } | null = null;
  while (open.length) {
    if (expansions >= budget) return { ok: false, reason: "search-budget", detail: `A* exceeded ${budget} expansions (search-budget ≠ no path, 设计 §6.3)` };
    const s = pop();
    expansions += 1;
    if (goals.some((g) => { const c = goalCell(g); return Math.abs(c.x - s.cx) <= 1 && Math.abs(c.z - s.cz) <= 1; })) { goalState = { key: keyOf3(s.cx, s.cz, s.dir), cx: s.cx, cz: s.cz }; break; }
    for (const nd of [(s.dir + 7) % 8, s.dir, (s.dir + 1) % 8]) { // 只允许直行/±45°：平滑路径
      const nx = s.cx + DIRS[nd][0]; const nz = s.cz + DIRS[nd][1];
      if (Math.hypot(nx * step - request.source.x, nz * step - request.source.z) > request.maxLength) continue; // 有界搜索区域
      if (cellBlocked(nx, nz)) continue;
      const move = Math.hypot(DIRS[nd][0] * step, DIRS[nd][1] * step);
      const ng = s.g + move * (nd === s.dir ? 1 : CONNECTOR_CONFIG.turnPenalty);
      const nk = keyOf3(nx, nz, nd);
      if ((best.get(nk) ?? Infinity) <= ng) continue;
      const sk = keyOf3(s.cx, s.cz, s.dir);
      best.set(nk, ng); prev.set(nk, sk);
      push({ f: ng + heuristic(nx, nz), g: ng, seq: seq++, cx: nx, cz: nz, dir: nd });
    }
  }
  if (!goalState) return { ok: false, reason: "no-target", detail: `grid search exhausted within ${request.maxLength} after ${expansions} expansions` };
  // 重构：格心序列 → 共线合并 → [source, ..., 目标节点]
  const cells: Array<{ x: number; z: number }> = [];
  for (let k: string = goalState.key; k; k = prev.get(k)!) { const [x, z] = k.split(","); cells.unshift({ x: Number(x), z: Number(z) }); }
  const kept: Array<{ x: number; z: number }> = cells.filter((c, i) =>
    i === 0 || i === cells.length - 1 || (c.x - cells[i - 1].x) * (cells[i + 1].z - c.z) - (c.z - cells[i - 1].z) * (cells[i + 1].x - c.x) !== 0);
  // 起点不在格点上：首个格心可能在源「身后」几单位（round 对齐），留着会沿悬挂边折回（端点净空角拒绝）。
  while (kept.length && Math.hypot(kept[0].x * step - request.source.x, kept[0].z * step - request.source.z) < step) kept.shift();
  const goal = goals.slice().sort((a, b) => Math.hypot(a.p.x - goalState.cx * step, a.p.z - goalState.cz * step) - Math.hypot(b.p.x - goalState.cx * step, b.p.z - goalState.cz * step) || (a.id < b.id ? -1 : 1))[0];
  const polyline = [request.source, ...kept.map((c) => ({ x: c.x * step, z: c.z * step })), goal.p];
  let cost = 0; for (let k = 1; k < polyline.length; k += 1) cost += Math.hypot(polyline[k].x - polyline[k - 1].x, polyline[k].z - polyline[k - 1].z);
  if (cost > request.maxLength) return { ok: false, reason: "no-target", detail: `reconstructed path ${Math.round(cost)} exceeds maxLength ${request.maxLength}` };
  // 全线终筛（格心检查是初筛，宽走廊以密集采样为准——§9.2「格点合法 ≠ 整个宽路面合法」）
  for (let k = 1; k < polyline.length; k += 1) {
    const failure = corridorFailure(world, polyline[k - 1], polyline[k], policy);
    if (failure) return { ok: false, reason: failure, detail: `A* polyline segment ${k} failed ${failure}` };
    if (crossAny(network, polyline[k - 1], polyline[k], null)) return { ok: false, reason: "crossing", detail: `A* polyline segment ${k} crosses an existing edge` };
  }
  if (!endpointClear(network, request.source, polyline[1]) || !endpointClear(network, goal.p, polyline[polyline.length - 2])) return { ok: false, reason: "junction-angle", detail: "A* join fails the endpoint clearance angle" };
  return { ok: true, join: { edge: null, at: goal.p, onEnd: true }, polyline, cost };
}

// ── 阶梯 5（批次 5-1）：显式桥候选 ground→bridge→ground（§4.2 桥梁统一）──────────────────
// 不自动「遇水可桥」：仅 allowBridge 的请求以 bridge-candidate 策略显式执行。判据逐字保留
// 入口路历史口径——连线逐 6 单位采样，连续水段 ≤ 14 采样（≈84）才可成桥，桥头落在干地
// （水段外扩一格），其它用地 r+2、自身用地 r 内不得穿越；候选 = 全部非桥路段上的投影点
// 按距离取前 40（界限是候选数，不是半径）。地面引道不查 buildable/坡度：岸边地标的门前
// 引道本就穿过不可建的前滩带（历史口径；地形批 TerrainPatch 落地前的已知豁免，见设计 §5.1）。

export type BridgeSpan = { from: Vec2; to: Vec2 };
type BridgeOptions = { self?: { x: number; z: number; radius: number }; blockers: Array<{ x: number; z: number; radius: number }>; siteGate?: boolean };
// 批 A 后本策略对象仅作提案携带的账面值（终筛由 validateCandidate 按段结构另行构造标准）；maxSlope: Infinity 不再有消费路径，留作历史口径对照。
const bridgePolicy = (bridge: BridgeOptions): CorridorPolicy => ({ requireBuildable: false, maxSlope: Infinity, sites: bridge.blockers, siteMargin: 2, siteGate: bridge.siteGate ?? false });

function proposeBridgeCandidate(request: ConnectionRequest, world: ConnectorWorld, bridge: BridgeOptions, crossings: boolean): (StrategyOutcome & { bridgeSpans: BridgeSpan[] }) | { ok: false; reason: ConnectionFailure; detail: string } {
  const { network } = world;
  const self = bridge.self;
  const blockers = bridge.blockers;
  const candidates: Array<{ edge: RoadEdge; p: Vec2; d: number }> = [];
  for (const edge of network.edges.values()) {
    if (edge.bridge || !targetIncludes(request, edge)) continue;
    const [a, b] = edge.points;
    const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((request.source.x - a.x) * dx + (request.source.z - a.z) * dz) / l2));
    const p = { x: a.x + dx * t, z: a.z + dz * t }; // 原始投影（不吸附端点——历史口径）
    candidates.push({ edge, p, d: Math.hypot(p.x - request.source.x, p.z - request.source.z) });
  }
  candidates.sort((x, y) => x.d - y.d || (x.edge.id < y.edge.id ? -1 : 1));
  let nearestReject: ConnectionFailure = "no-target";
  // sourceHasRoad 是循环不变量，提出循环外只算一次（评审 P2：原在每候选内全量扫边 O(40×|E|)）。
  const sourceId = roadNodeId(keyOf(request.source));
  let sourceHasRoad = false;
  for (const edge of world.network.edges.values()) if (!edge.bridge && (edge.from === sourceId || edge.to === sourceId)) { sourceHasRoad = true; break; } // 桥链末端的节点度>0 但无地面路，不算
  for (const candidate of candidates.slice(0, CONNECTOR_CONFIG.bridgeCandidates)) {
    if (candidate.d < CONNECTOR_CONFIG.minLinkDistance) continue; // 源自身悬挂边的投影（d≈0）：连到原地不是连接
    // 连线水段分析：首/末水采样界定连续水段；无水 = 纯地面引道。
    // 采样口径（批 A 二分实证）：提议期保持历史 6 单位；终筛对 wet/gate 引道同样按 6 重推导
    // （validation.ts approachWetSampleSpacing）——曾把任一侧改 4，验收集 disconnected 2→8、
    // bridgehead 5→10（采样抖动拒掉历史接受的候选）；纯陆地引道两侧都是历史 4。
    const n = Math.max(4, Math.ceil(Math.hypot(candidate.p.x - request.source.x, candidate.p.z - request.source.z) / CONNECTOR_CONFIG.bridgeSampleSpacing));
    const maxWetSamples = CONNECTOR_CONFIG.bridgeMaxSpanSamples;
    const at = (k: number) => ({ x: request.source.x + (candidate.p.x - request.source.x) * (k / n), z: request.source.z + (candidate.p.z - request.source.z) * (k / n) });
    const wet = (k: number) => { const q = at(k); return world.geo.height(q.x, q.z) <= 0.5 || world.inRiver(q.x, q.z); };
    let first = -1; let last = -1; let blocked = false;
    for (let k = 1; k < n; k += 1) {
      const q = at(k);
      if (wet(k)) { if (first < 0) first = k; last = k; }
      if (blockers.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < o.radius + 2)) { blocked = true; break; }
      if (self && Math.hypot(self.x - q.x, self.z - q.z) < self.radius) { blocked = true; break; }
    }
    if (blocked) { nearestReject = "site-clearance"; continue; }
    let span: [Vec2, Vec2] | null = null;
    if (first >= 0) {
      // 近岸引道存在性（批 A）：非门路且源头不是路网节点（度 0 新点）时 deck 不得直接从源头
      // 起步（first≥2，至少一个完整干地采样）——否则桥端没有地面路（实测 2001570935/t5：
      // 13 单位微型 deck → bridgeheadContinuity）。两类豁免回到历史 first≥1：
      // ① 门路（purpose=site-access——siteGate 旗标不可靠：868 过河档也标它，却是 district-access）：
      //    门是站点的唯一通道，贴水线别墅的门路 deck 从门起步后紧邻既有路节点，历史桥端不缺地
      //    （实测 3005969553：first≥2 误杀门路 → siteWithoutDoorRoad）；
      // ② 源头本就是带地面边的路端节点（isolate 场景）。远端落点必在既有路边（T 拆分后两侧
      //    有地面路），维持历史 last≤n-2。
      if (last - first + 1 > maxWetSamples || first < (request.purpose === "site-access" || sourceHasRoad ? 1 : 2) || last > n - 2) { nearestReject = "water-span"; continue; }
      let continuous = true;
      for (let k = first; k <= last; k += 1) if (!wet(k)) { continuous = false; break; }
      if (!continuous) { nearestReject = "water-span"; continue; }
      const near = at(first - 1);
      if (self && Math.hypot(self.x - near.x, self.z - near.z) < self.radius + 2) { nearestReject = "site-clearance"; continue; } // 桥头不得落在用地圈里
      span = [near, at(last + 1)];
    }
    const join = keyOf(candidate.p);
    const polyline = span ? [request.source, span[0], span[1], join] : [request.source, join];
    const cost = polyline.slice(1).reduce((sum, q, k) => sum + Math.hypot(q.x - polyline[k].x, q.z - polyline[k].z), 0);
    if (cost > request.maxLength) { nearestReject = "no-target"; continue; }
    // 提议期终筛（批 A §4-A：提交被拒的候选在候选预算内续试后续投影点，不让第一个草案堵住
    // 其它合法候选）：ground-approach 标准（有限坡度实测 6/前滩不套 buildable/只避让 blockers）+ deck
    // 段垂直净空判。失败记因续试；候选预算 = bridgeCandidates（40 个投影点）。
    const segments: RouteSegment[] = span
      ? [
          { a: polyline[0], b: polyline[1], kind: "ground-approach", touchesDeck: true },
          { a: polyline[1], b: polyline[2], kind: "deck" },
          { a: polyline[2], b: polyline[3], kind: "ground-approach", touchesDeck: true },
        ]
      : [{ a: polyline[0], b: polyline[1], kind: "ground-approach" }];
    const verdict = validateCandidate(world, world.network, { id: `${request.id}:bridge`, crossings, blockers, gate: request.purpose === "site-access", segments }, { roadPolicy: bridgePolicy(bridge) });
    if (!verdict.ok) {
      const v = verdict.violations[0];
      nearestReject = v.kind === "water-span" || v.kind === "slope" || v.kind === "site-clearance" || v.kind === "crossing" ? v.kind : "projection-loss"; // vertical-clearance-unsupported 暂并入 projection-loss（detail 保留实因）
      continue;
    }
    const onEnd = roadNodeId(join) === candidate.edge.from || roadNodeId(join) === candidate.edge.to;
    return { ok: true, join: { edge: candidate.edge, at: join, onEnd }, polyline, cost, bridgeSpans: span ? [{ from: span[0], to: span[1] }] : [] };
  }
  return { ok: false, reason: nearestReject, detail: `no bridge candidate within ${CONNECTOR_CONFIG.bridgeCandidates} projections (${nearestReject})` };
}

// ── 策略档（不在 DEFAULT_LADDER）：mini-roundabout 小型交通环（city-roundabout 批次，形态盘点 §5-1）──
// 作用对象：三岔口（共享端点 V 的 3 条腿）里相邻边最小夹角落入灰带（< roundaboutMaxPairAngleDeg=50°，
// 覆盖 30–50° 灰区；acuteJunctions 标记的 <30° 对按「阈值放宽 (b)」接纳——只要建环后新路口的
// 相邻边夹角全部 ≥30°，原本 <30° 的对也以环消解）。做法：以 V 为圆心、半径 10–14 建环，三条腿在
// 环上切断（切点 = 腿方向上距 V 半径处），环按相邻切点的角差分段（每段 ≤90°，三岔口合计恒 4–6 段）；
// 补丁 = 删 3 条整腿 + 加「腿剩余段（arterial/primary 标志精确重建 5/8/12 宽；主干允许进环，桥腿不参与）
// + 全部弧段（local 5 宽环流）」，等价于 split 后去掉 V→切点的残头，一次性经 commitNetworkPatch 事务
// 提交（§4.3：草稿复核 → 版本匹配 → 一次替换，失败零副作用）。弧段逐条过 corridorFailure 地面校验
// 与既有路交叉检查；提交期还在草稿上复核「环上每个 ≥3 度路口相邻边夹角 ≥30°」（acuteJunctions 同款
// 判据——阈值放宽的后验门）。调用方（networkRepairs.resolveAcuteJunctions）把本档排在「删短枝」之前：
// 删除是建环失败后的最后手段。

export type RoundaboutResult =
  | { ok: true; version: number; strategy: "mini-roundabout"; patch: NetworkPatch; radius: number; ring: Vec2[] }
  | { ok: false; reason: ConnectionFailure; detail: string };

/** 腿可重建：拆掉重加须由 arterial/primary 标志精确恢复宽度（local 5 / arterial 8 / 主干 12——主干
 *  允许进环：市政广场外环本就有主干放射其上，环是路口形态不是删路，不违反删除路径的主干保护）。
 *  桥腿不参与（环段是地面弧边，不能替换桥跨）。环段一律 local 5 宽：环是慢行环流，等级在进口
 *  保留；同时避免 4/6 段环的对边平行弧段触发 crowdedArterials（该约束先于环存在，不为其豁免）。 */
function roundaboutRebuildable(edge: RoadEdge): boolean {
  return !edge.bridge && (edge.kind === "arterial" ? edge.width === 8 || edge.width === 12 : edge.width === 5);
}

/** 提案：几何 + 走廊 + 交叉 + 环上角度复核；半径按 [10,12,14] 顺序试第一档全过的（确定性）。 */
function proposeMiniRoundabout(
  world: ConnectorWorld,
  center: { id: string; x: number; z: number },
  legs: RoadEdge[],
): { patch: NetworkPatch; radius: number; ring: Vec2[] } | { reason: ConnectionFailure; detail: string } {
  const centerId = center.id;
  if (legs.length !== 3) return { reason: "no-target", detail: `mini-roundabout needs a 3-way junction, got ${legs.length} legs` };
  for (const leg of legs) {
    if (leg.from !== centerId && leg.to !== centerId) return { reason: "no-target", detail: `leg ${leg.id} not incident to ${centerId}` };
    if (!roundaboutRebuildable(leg)) return { reason: "no-target", detail: `leg ${leg.id} not rebuildable (bridge, or width ${leg.width}/kind ${leg.kind} outside the 5/8/12 reconstruction set)` };
  }
  // 腿方向（V → 远端），按角度排序（稳定次级键 = 腿 id）；夹角灰带之外不是本档的活。
  const directed = legs.map((leg) => {
    const far = leg.from === centerId ? leg.points[leg.points.length - 1] : leg.points[0];
    const a = Math.atan2(far.z - center.z, far.x - center.x);
    return { leg, far, a: ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), len: Math.hypot(far.x - center.x, far.z - center.z) };
  }).sort((x, y) => x.a - y.a || (x.leg.id < y.leg.id ? -1 : 1));
  let minGap = Infinity;
  for (let k = 0; k < directed.length; k += 1) {
    const next = k + 1 < directed.length ? directed[k + 1].a : directed[0].a + Math.PI * 2;
    minGap = Math.min(minGap, next - directed[k].a);
  }
  if (minGap >= (CONNECTOR_CONFIG.roundaboutMaxPairAngleDeg * Math.PI) / 180) {
    return { reason: "junction-angle", detail: `junction min gap ${Math.round((minGap * 180) / Math.PI)}deg outside the roundabout band (<${CONNECTOR_CONFIG.roundaboutMaxPairAngleDeg}deg)` };
  }
  const policy = fallbackPolicy(world);
  const legIds = new Set(legs.map((e) => e.id));
  let last: { reason: ConnectionFailure; detail: string } = { reason: "no-target", detail: "no radius candidate" };
  for (const radius of CONNECTOR_CONFIG.roundaboutRadii) {
    // 切点 + 腿剩余段（剩余 < roundaboutMinOuter 的档作废——不切出短残腿）。
    let outerOk = true;
    for (const d of directed) {
      if (d.len - radius < CONNECTOR_CONFIG.roundaboutMinOuter) {
        last = { reason: "no-target", detail: `leg ${d.leg.id} remainder ${Math.round(d.len - radius)} < ${CONNECTOR_CONFIG.roundaboutMinOuter} at r=${radius}` };
        outerOk = false; break;
      }
    }
    if (!outerOk) continue;
    // 环点：切点 + 各角差的中间点（每段 ≤90°，ceil 分段）；三岔口合计 4–6 段（弧段数 = 环点数，首尾相接）。
    const ring: Array<{ p: Vec2; leg: number }> = [];
    for (let k = 0; k < directed.length; k += 1) {
      const d = directed[k];
      ring.push({ p: keyOf({ x: center.x + ((d.far.x - center.x) / d.len) * radius, z: center.z + ((d.far.z - center.z) / d.len) * radius }), leg: k });
      const a0 = d.a;
      const a1 = k + 1 < directed.length ? directed[k + 1].a : directed[0].a + Math.PI * 2;
      const span = a1 - a0;
      const n = Math.max(1, Math.ceil((span * 180) / Math.PI / CONNECTOR_CONFIG.roundaboutArcStepDeg));
      for (let s = 1; s < n; s += 1) ring.push({ p: keyOf({ x: center.x + radius * Math.cos(a0 + (span * s) / n), z: center.z + radius * Math.sin(a0 + (span * s) / n) }), leg: -1 });
    }
    if (ring.length < CONNECTOR_CONFIG.roundaboutMinSegments || ring.length > CONNECTOR_CONFIG.roundaboutMaxSegments) {
      last = { reason: "no-target", detail: `ring has ${ring.length} arc segments (band ${CONNECTOR_CONFIG.roundaboutMinSegments}..${CONNECTOR_CONFIG.roundaboutMaxSegments}) at r=${radius}` };
      continue;
    }
    // 弧段硬检查：弦长下限（防碎边）+ corridorFailure 地面校验（不过水/可建/坡度/避让用地）+ 不与既有路交叉（被替换的三条腿除外）。
    let failure: ConnectionFailure | null = null;
    let detail = "";
    for (let k = 0; k < ring.length && !failure; k += 1) {
      const p = ring[k].p; const q = ring[(k + 1) % ring.length].p;
      if (Math.hypot(q.x - p.x, q.z - p.z) < CONNECTOR_CONFIG.roundaboutMinChord) { failure = "no-target"; detail = `arc chord ${k} shorter than ${CONNECTOR_CONFIG.roundaboutMinChord} at r=${radius}`; break; }
      const corridor = corridorFailure(world, p, q, policy);
      if (corridor) { failure = corridor; detail = `arc chord ${k} failed ${corridor} at r=${radius}`; break; }
      for (const other of world.network.edges.values()) {
        if (legIds.has(other.id)) continue;
        if (crosses(p, q, other.points[0], other.points[1])) { failure = "crossing"; detail = `arc chord ${k} crosses edge ${other.id} at r=${radius}`; break; }
      }
    }
    if (!failure) {
      // 环上角度复核（acuteJunctions 同款判据）：切点 = 腿剩余段 + 两侧弧段；中间点 = 两侧弧段。
      // 构造上夹角 ≥90°（径向 vs 弦切向 ±半步、弧段间 180°−步长），此处显式复核防数值退化。
      for (let k = 0; k < ring.length && !failure; k += 1) {
        const cur = ring[k]; const prev = ring[(k + ring.length - 1) % ring.length]; const next = ring[(k + 1) % ring.length];
        const dirs = [Math.atan2(prev.p.z - cur.p.z, prev.p.x - cur.p.x), Math.atan2(next.p.z - cur.p.z, next.p.x - cur.p.x)];
        if (cur.leg >= 0) dirs.push(Math.atan2(directed[cur.leg].far.z - cur.p.z, directed[cur.leg].far.x - cur.p.x));
        const sorted = dirs.map((a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort((x, y) => x - y);
        for (let m = 0; m < sorted.length && !failure; m += 1) {
          const gap = (m + 1 < sorted.length ? sorted[m + 1] : sorted[0] + Math.PI * 2) - sorted[m];
          if (gap < (30 * Math.PI) / 180) { failure = "junction-angle"; detail = `ring junction ${k} gap ${Math.round((gap * 180) / Math.PI)}deg < 30deg at r=${radius}`; }
        }
      }
    }
    if (failure) { last = { reason: failure, detail }; continue; }
    // 补丁：删 3 条整腿，加腿剩余段（arterial/primary 标志精确重建 5/8/12 宽）+ 弧段（local 5 宽的环流）。
    const addEdges: NetworkPatch["addEdges"] = directed.map((d, k) => ({ a: ring.find((r) => r.leg === k)!.p, b: d.far, arterial: d.leg.kind === "arterial", primary: d.leg.width >= 12 }));
    for (let k = 0; k < ring.length; k += 1) addEdges.push({ a: ring[k].p, b: ring[(k + 1) % ring.length].p, arterial: false });
    return { patch: { baseVersion: world.network.version ?? 0, removeEdgeIds: legs.map((e) => e.id), splits: [], addEdges }, radius, ring: ring.map((r) => r.p) };
  }
  return last;
}

/** 建环并事务提交。成功后清掉环心 V（三条腿全删后成为孤立节点——componentOf 按节点并查集算分量，
 *  孤立节点会被 disconnectedComponents 计成新分量；applyOps 无节点删除原语，这里与 dropEdge 同款
 *  只在成功提交后清这一个 id，且仅当它确实无关联边）。 */
export function runMiniRoundabout(world: ConnectorWorld, center: { id: string; x: number; z: number }, legs: RoadEdge[]): RoundaboutResult {
  const live = legs.map((e) => world.network.edges.get(e.id)).filter((e): e is RoadEdge => !!e);
  if (live.length !== legs.length) return { ok: false, reason: "projection-loss", detail: `only ${live.length}/${legs.length} legs still in the network` };
  const proposal = proposeMiniRoundabout(world, center, live);
  if ("reason" in proposal) return { ok: false, reason: proposal.reason, detail: proposal.detail };
  const legIds = new Set(live.map((e) => e.id));
  const committed = commitNetworkPatch(world.network, proposal.patch, (draft) => {
    for (let k = 0; k < proposal.ring.length; k += 1) {
      const p = proposal.ring[k]; const q = proposal.ring[(k + 1) % proposal.ring.length];
      for (const other of draft.edges.values()) {
        if (legIds.has(other.id)) continue; // 腿剩余段与弧段共线/共享端点，strict crosses 不计
        if (crosses(p, q, other.points[0], other.points[1])) return `crossing ${other.id}`;
      }
    }
    for (const point of proposal.ring) {
      const id = roadNodeId(keyOf(point));
      const node = draft.nodes.get(id);
      if (!node) continue;
      const dirs: number[] = [];
      for (const e of draft.edges.values()) {
        if (e.from !== id && e.to !== id) continue;
        const other = e.from === id ? e.points[e.points.length - 1] : e.points[0];
        dirs.push(Math.atan2(other.z - node.z, other.x - node.x));
      }
      if (dirs.length < 3) continue; // 环上中间点是 2 度折点；角度守卫只量 ≥3 度路口
      const sorted = dirs.map((a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort((x, y) => x - y);
      for (let m = 0; m < sorted.length; m += 1) {
        const gap = (m + 1 < sorted.length ? sorted[m + 1] : sorted[0] + Math.PI * 2) - sorted[m];
        if (gap < (30 * Math.PI) / 180) return `junction-angle ring node ${id} gap ${Math.round((gap * 180) / Math.PI)}deg < 30deg`;
      }
    }
    return null;
  });
  if (!committed.ok) {
    const failure = (committed.detail ?? "").split(" ")[0];
    return { ok: false, reason: committed.reason === "stale-base" ? "stale-base" : FAILURES.includes(failure) ? failure as ConnectionFailure : "projection-loss", detail: committed.detail ?? committed.reason };
  }
  let incident = false;
  for (const e of world.network.edges.values()) if (e.from === center.id || e.to === center.id) { incident = true; break; }
  if (!incident) world.network.nodes.delete(center.id);
  return { ok: true, version: committed.version, strategy: "mini-roundabout", patch: proposal.patch, radius: proposal.radius, ring: proposal.ring };
}

// ── 阶梯汇总 + 事务提交（§4.3：草稿验证、失败零副作用）───────────────────────────────────

export type LadderOptions = {
  /** 执行的阶梯子集/顺序；缺省全阶梯（direct → merge → detour → A*；allowBridge 时追加 bridge-candidate）。 */
  strategies?: ConnectionStrategy[];
  /** node-merge 的用地避让加成（滨海互接的历史档传 5 = safeRoadLink 口径）。 */
  siteMargin?: number;
  /** 是否检查与既有路交叉（滨海互接的历史档不查，传 false）；批 A 起同时驱动 bridge-candidate
   *  的预筛与 deck 段垂直净空判（crossings=false 时 deck 不查重叠）。 */
  crossings?: boolean;
  /** node-merge 的端点角度档：strict（缺省，净空角 ≥35°）或 relaxed（最后手段——设计 §4.1 转弯是软成本，
   *  角度从宽只换连通，质量代价由 acuteJunctions 约束度量；走廊/交叉硬检查不放松）。 */
  anglePolicy?: "strict" | "relaxed";
  /** bridge-candidate 的用地视图：self = 发起连接的用地自身（r 内禁穿、桥头 r+2 外），blockers = 其它用地（r+2 外）。 */
  bridge?: BridgeOptions;
};

export const DEFAULT_LADDER: ConnectionStrategy[] = ["direct-projection", "node-merge", "detour", "grid-astar"];

function buildPatch(world: ConnectorWorld, request: ConnectionRequest, join: JoinPoint, polyline: Vec2[], bridgeAt: number[] = []): NetworkPatch {
  const arterial = request.roadClass !== "local";
  return {
    baseVersion: world.network.version ?? 0,
    removeEdgeIds: [],
    splits: join.edge && !join.onEnd ? [{ edgeId: join.edge.id, at: join.at }] : [],
    addEdges: polyline.slice(1).map((b, k) => ({ a: polyline[k], b, arterial, bridge: bridgeAt.includes(k + 1), primary: request.primary ?? false })),
  };
}

/** 提交前草稿复核（§4.3 validate 在草稿上跑）：统一走 validation.ts 的 validateCandidate。
 *  批 A 起按段结构检查，废除策略级整体豁免（siteGate 全免 / 湿桥地面段不复查 / maxSlope=Infinity）：
 *   - 普通阶梯的地面段 = ground-road（proposed.policy 即历史口径，行为逐字不变）；
 *   - bridge-candidate 的地面段（湿桥引道、纯陆地、门路）= ground-approach：不过水（贴 deck 端点
 *     豁免水线）、有限坡度（实测 3.0）、前滩不套 buildable、只避让 blockers——发起用地自身不在
 *     blockers 里，即「入口只豁免自身明确通道，不豁免坡度/其它障碍」；
 *   - 桥面段 = deck：不吃地面判据，但 crossings 开启时与既有边重叠按 vertical-clearance-unsupported
 *     拒绝（RoadEdge 无高程模型，信息不足不静默放行）。 */
export function draftProblem(world: ConnectorWorld, proposed: ConnectionProposal, draft: Network): string | null {
  const approach = proposed.strategy === "bridge-candidate";
  const adds = proposed.patch.addEdges;
  const candidate: RouteCandidate = {
    id: proposed.strategy,
    crossings: proposed.crossings,
    blockers: approach ? proposed.policy.sites : [], // 非桥策略全是 ground-road 段（用 roadPolicy.sites），blockers 无消费方
    gate: approach && proposed.purpose === "site-access",
    segments: adds.map((e, k) => ({
      a: e.a,
      b: e.b,
      kind: e.bridge ? "deck" : approach ? "ground-approach" : "ground-road",
      touchesDeck: approach && !e.bridge && ((k > 0 && adds[k - 1].bridge) || (k < adds.length - 1 && adds[k + 1].bridge)),
    })),
  };
  const verdict = validateCandidate(world, draft, candidate, { roadPolicy: proposed.policy });
  if (verdict.ok) return null;
  const v = verdict.violations[0];
  return v.kind === "crossing" ? `${proposed.strategy}-crossing ${v.detail}` : `${v.kind} ${v.detail}`;
}

/** 纯搜索：返回补丁（不动正式网络）。 */
export function proposeConnection(request: ConnectionRequest, world: ConnectorWorld, options: LadderOptions = {}): ConnectionResult {
  const ladder = options.strategies ?? (request.allowBridge ? [...DEFAULT_LADDER, "bridge-candidate"] : DEFAULT_LADDER);
  const failures: string[] = [];
  let lastReason: ConnectionFailure = "no-target";
  for (let i = 0; i < ladder.length; i += 1) {
    const strategy = ladder[i];
    const outcome: (StrategyOutcome & { bridgeSpans?: BridgeSpan[] }) = strategy === "direct-projection" ? proposeDirectProjection(request, world)
      : strategy === "node-merge" ? proposeNodeMerge(request, world, options)
      : strategy === "detour" ? proposeDetour(request, world)
      : strategy === "grid-astar" ? proposeGridAStar(request, world)
      : proposeBridgeCandidate(request, world, options.bridge ?? { blockers: world.reservations() }, options.crossings !== false);
    if (outcome.ok) {
      const policy = strategy === "direct-projection" ? directPolicy(world)
        : strategy === "bridge-candidate" ? bridgePolicy(options.bridge ?? { blockers: world.reservations() })
        : fallbackPolicy(world, strategy === "node-merge" ? options.siteMargin : undefined);
      const bridgeAt = strategy === "bridge-candidate" ? [2] : []; // 三段中的中段是桥（无水时 polyline 只有 2 点，不含索引 2）
      return { ok: true, patch: buildPatch(world, request, outcome.join, outcome.polyline, bridgeAt), cost: outcome.cost, strategy, policy, purpose: request.purpose, crossings: options.crossings !== false, bridgeSpans: outcome.bridgeSpans ?? [] };
    }
    lastReason = outcome.reason;
    failures.push(`${strategy}:${outcome.reason}`);
  }
  return { ok: false, reason: lastReason, attempted: ladder.length, detail: failures.join(", ") };
}

/** 提交一份已提出的补丁（stale-base / 校验失败零副作用）。 */
export function commitConnection(world: ConnectorWorld, proposed: Extract<ConnectionResult, { ok: true }>): PatchResult {
  return commitNetworkPatch(world.network, proposed.patch, (draft) => draftProblem(world, proposed, draft));
}

/** 显式定线连接（落位期已验证过的固定段，如海上地标堤道）：批 A 起同过统一终筛（§4-A
 *  「固定路线仍通过同一候选校验与提交接口」）——deck 段按垂直净空判、地面段按 ground-road
 *  标准；固定定线不再持有安全豁免。仍只走事务提交，不另起搜索。
 *  opts.splitInherit（skeleton 环线出口拆边）：既有边的原位拆分，宿主边的有效性由继承获得
 *  （宿主建时本就不按新定线标准），只做事务结构检查（自环/未知边/版本），不重查走廊/交叉——
 *  与 NetworkPatch.splits 原语同域（拓扑精化，不是新路线）。调用方必须检查返回值。 */
export function commitFixedLink(world: ConnectorWorld, addEdges: NetworkPatch["addEdges"], opts: { splitInherit?: boolean } = {}): PatchResult {
  const candidate: RouteCandidate = {
    id: "fixed-link",
    crossings: true,
    blockers: [], // deck 段不查 sites；ground-road 段用 roadPolicy.sites——blockers 无消费方
    segments: addEdges.map((e) => ({ a: e.a, b: e.b, kind: e.bridge ? "deck" : "ground-road" })),
  };
  return commitNetworkPatch(world.network, { baseVersion: world.network.version ?? 0, removeEdgeIds: [], splits: [], addEdges }, (draft) => {
    if (opts.splitInherit) return null;
    const verdict = validateCandidate(world, draft, candidate, { roadPolicy: fallbackPolicy(world) });
    return verdict.ok ? null : `${verdict.violations[0].kind} ${verdict.violations[0].detail}`;
  });
}

/** 失败原因首词解析（runConnection/堤道记账共用；不认识的 kind 落 projection-loss，detail 保留实因）。 */
export function parseFailure(detail: string | undefined): ConnectionFailure {
  const failure = (detail ?? "").split(" ")[0];
  return FAILURES.includes(failure) ? failure as ConnectionFailure : "projection-loss";
}

/** 搜索 + 事务提交（§9.1：失败进诊断，不触碰正式网络）。 */
export function runConnection(request: ConnectionRequest, world: ConnectorWorld, options: LadderOptions = {}): ConnectionResult {
  const proposed = proposeConnection(request, world, options);
  if (!proposed.ok) return proposed;
  const committed = commitConnection(world, proposed);
  if (!committed.ok) {
    if (committed.reason === "stale-base") return { ok: false, reason: "stale-base", attempted: 1, detail: committed.detail };
    return { ok: false, reason: parseFailure(committed.detail), attempted: 1, detail: `${committed.reason}: ${committed.detail ?? ""}` };
  }
  return { ...proposed, version: committed.version };
}
