/**
 * 网络优先设计批次 2（CITY_NETWORK_FIRST_CODE_DESIGN §3 / 迁移批次 2）：意图层只读诊断。
 *
 * 本批只建立「该连谁」的检测：ConnectionDemand（哪些区域/设施必须互通）、EndpointRole
 * （每个度为 1 的路端属于谁/为什么合法）、主网定义（primaryComponentId = 含 civic/plaza
 * 骨架节点的连通分量）。「怎么合法连接」属于批次 3+ 的统一连接器——本模块**不改动任何
 * 网络状态**（守卫用前后深比较证明），unmet 只进诊断，不触发补路。
 *
 * 派生来源是当前管线的最终产物（后验意图）：批次 6 SiteSpec 落地后，demand 改为在骨架
 * 生成前显式声明（先验意图），本文件的类型与判定函数继续复用。
 */
import type { Vec2 } from "../cityLayout";
import type { CityPlan } from "./constraints";
import { isPlannedRoadEnd, WATER_STOP_MARGIN } from "./endpoints";

/** 度为 1 路端的角色（设计 §3：角色携带所有权或需求引用）。 */
export type EndpointRole =
  | { kind: "site-access"; ownerId: string }
  | { kind: "cul-de-sac"; reason: "coast" | "planned-local" | "terrain" }
  | { kind: "must-connect"; demandId: string };

/** 必须互通的需求（设计 §3 ConnectionDemand 的诊断子集；corridor/redundancy 留给批次 4+）。 */
export type ConnectionDemand = {
  id: string;
  class: "district-access" | "site-access" | "coastal-link";
  required: boolean;
  /** 需求锚点（分量 id / 用地 id / 沿海路段序号），仅供诊断输出定位。 */
  anchor: string;
};

export type EndpointDiagnostic = { node: string; at: Vec2; role: EndpointRole };
export type DemandDiagnostic = { demand: ConnectionDemand; satisfied: boolean; reason?: string };
export type NetworkDiagnostics = {
  primaryComponentId: string;
  demands: DemandDiagnostic[];
  endpoints: EndpointDiagnostic[];
  /** 未满足的 required 需求（影子指标：不 gating 质量，gating 检测本身完整）。 */
  unmet: Array<{ demandId: string; reason: string }>;
};

type Site = { id?: string; kind: string; x: number; z: number; radius: number };
const seg = (p: Vec2, a: Vec2, b: Vec2) => {
  const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
  return Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z);
};

/** 连通分量（桥计入连通——车能过桥）。返回 node id → 分量 id（复用 roadNodeId 作分量代表）。 */
export function componentOf(plan: CityPlan): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; let c = x; while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; } return r; };
  for (const n of plan.roadNodes) parent.set(n.id, n.id);
  for (const e of plan.roadEdges) { const ra = find(e.from); const rb = find(e.to); if (ra !== rb) parent.set(ra, rb); }
  const comp = new Map<string, string>();
  for (const n of plan.roadNodes) comp.set(n.id, find(n.id));
  return comp;
}

/** 主网 = 含 civic/plaza 骨架节点的分量：取离核心最近的路端（环岛节点围绕核心，半径 52；
 *  无任何路端时返回 null —— civic 骨架缺失，按设计属于规划失败，这里只作诊断输出）。 */
export function primaryComponentId(plan: CityPlan, comp: Map<string, string>): string | null {
  let best: { id: string; d: number } | null = null;
  for (const n of plan.roadNodes) {
    const d = Math.hypot(n.x - plan.core.x, n.z - plan.core.z);
    if (!best || d < best.d) best = { id: n.id, d };
  }
  return best ? (comp.get(best.id) ?? null) : null;
}

/** 后验派生需求：非主网分量要接主网（district-access）、每个用地要有门前路（site-access）、
 *  每段沿海/河岸路要挂进主网（coastal-link）。id 稳定（分量代表 id / 用地 id / 段序号）。 */
export function deriveDemands(plan: CityPlan, comp: Map<string, string>, primary: string): ConnectionDemand[] {
  const demands: ConnectionDemand[] = [];
  const seen = new Set<string>();
  for (const n of plan.roadNodes) {
    const c = comp.get(n.id)!;
    if (c !== primary && !seen.has(c)) {
      seen.add(c);
      demands.push({ id: `district:${c}`, class: "district-access", required: true, anchor: c });
    }
  }
  const sites = [...plan.publicSites, ...plan.landmarks].filter((s) => s.radius) as Site[];
  for (const s of sites) demands.push({ id: `site:${s.id ?? s.kind}`, class: "site-access", required: true, anchor: s.id ?? s.kind });
  (plan.coastRoads ?? []).forEach((_run, i) => demands.push({ id: `coastal:${i}`, class: "coastal-link", required: true, anchor: `run ${i}` }));
  return demands;
}

/** 需求满足判定（与现有约束同口径，避免第二套标准）：
 *  district-access = 分量并入主网；site-access = siteWithoutDoorRoad 同判据（最近路含桥，
 *  离占地边缘 ≤ 20——岸边地标门口直接起桥也算，sail-opera 的堤道即此类）；
 *  coastal-link = 海段（plan.coastRoads 仅含海段）任一端挂进主网；河岸段端由近水豁免兜底
 *  （宽河超 40 的分歧记为批次 3 债务：coastRoads 与修复期 coastRoadRunEnds 的切片口径要统一）。 */
export function evaluateDemands(plan: CityPlan, comp: Map<string, string>, primary: string, demands: ConnectionDemand[]): DemandDiagnostic[] {
  const sites = [...plan.publicSites, ...plan.landmarks].filter((s) => s.radius) as Site[];
  return demands.map((d) => {
    if (d.class === "district-access") {
      const satisfied = comp.get(d.anchor) === primary;
      return { demand: d, satisfied, reason: satisfied ? undefined : "component not merged into the primary network" };
    }
    if (d.class === "site-access") {
      const s = sites.find((x) => (x.id ?? x.kind) === d.anchor)!;
      let near = Infinity; // 含桥（门口起桥也是门前有路）
      for (const e of plan.roadEdges) near = Math.min(near, seg(s, e.points[0], e.points[e.points.length - 1]));
      const satisfied = near <= s.radius + 20;
      return { demand: d, satisfied, reason: satisfied ? undefined : `no road within radius+20 of the plot edge (nearest centre distance ${Math.round(near)})` };
    }
    const run = (plan.coastRoads ?? [])[Number(d.anchor.replace("run ", ""))] ?? [];
    // 挂接判定按几何邻接（run 折线点与节点 id 的浮点键不稳定）：任一端 1 单位内有主网分量节点。
    const primaryNodes = plan.roadNodes.filter((n) => comp.get(n.id) === primary);
    const attached = [run[0], run[run.length - 1]].some((end: Vec2 | undefined) => end && primaryNodes.some((n) => Math.hypot(n.x - end.x, n.z - end.z) < 1));
    return { demand: d, satisfied: attached, reason: attached ? undefined : "coastal run end not attached to the primary network" };
  });
}

/** 每个度为 1 的非桥路端一个角色（与 endpoints.isPlannedRoadEnd 同一豁免口径）：
 *  门前终点 → site-access（带 ownerId）；滨海大道断点 → cul-de-sac(planned-local)（海滨段规则：
 *  无效样本处断开、不跨接）；沿海/河岸路段端 → must-connect（挂对应 coastal-link 需求）；
 *  近水终止 → cul-de-sac(coast)；其余 → must-connect（挂所在分量的 district-access 需求）。 */
export function classifyEndpoints(plan: CityPlan, comp: Map<string, string>, primary: string): EndpointDiagnostic[] {
  const deg = new Map<string, number>();
  for (const e of plan.roadEdges) if (!e.bridge) for (const id of [e.from, e.to]) deg.set(id, (deg.get(id) || 0) + 1);
  const nodes = new Map(plan.roadNodes.map((n) => [n.id, n]));
  const sites = [...plan.publicSites, ...plan.landmarks].filter((s) => s.radius) as Site[];
  const boulevardEnds = (plan.seaside?.samples ?? []).filter((s: { valid: boolean; boulevard?: Vec2 }) => s.valid && s.boulevard).map((s: { boulevard?: Vec2 }) => s.boulevard!);
  const coastRoadRunEnds = (plan.coastRoads ?? []).flatMap((r: Vec2[]) => [r[0], r[r.length - 1]]);
  const out: EndpointDiagnostic[] = [];
  for (const [id, d] of deg) {
    if (d !== 1) continue;
    const q = nodes.get(id);
    if (!q) continue;
    let role: EndpointRole;
    const site = sites.find((s) => Math.hypot(s.x - q.x, s.z - q.z) < s.radius + 12);
    const coastRunEnd = coastRoadRunEnds.findIndex((c) => Math.hypot(c.x - q.x, c.z - q.z) < 1);
    if (site) role = { kind: "site-access", ownerId: site.id ?? site.kind };
    else if (boulevardEnds.some((b) => Math.hypot(b.x - q.x, b.z - q.z) < 1)) role = { kind: "cul-de-sac", reason: "planned-local" };
    else if (coastRunEnd >= 0) role = { kind: "must-connect", demandId: `coastal:${coastRunEnd}` };
    else if (isPlannedRoadEnd(q, { sites, boulevardEnds, coastRoadRunEnds: [], coast: plan.coast ?? [], river: plan.river ?? null })) role = { kind: "cul-de-sac", reason: "coast" };
    else role = { kind: "must-connect", demandId: `district:${comp.get(id) ?? "?"}` };
    out.push({ node: id, at: { x: q.x, z: q.z }, role });
  }
  return out;
}

/** 汇总诊断（只读：不触碰 plan 的任何字段）。 */
export function diagnoseNetwork(plan: CityPlan): NetworkDiagnostics | null {
  const comp = componentOf(plan);
  const primary = primaryComponentId(plan, comp);
  if (!primary) return null;
  const demands = deriveDemands(plan, comp, primary);
  const evaluated = evaluateDemands(plan, comp, primary, demands);
  return {
    primaryComponentId: primary,
    demands: evaluated,
    endpoints: classifyEndpoints(plan, comp, primary),
    unmet: evaluated.filter((d) => d.demand.required && !d.satisfied).map((d) => ({ demandId: d.demand.id, reason: d.reason ?? "unmet" })),
  };
}

export { WATER_STOP_MARGIN };
