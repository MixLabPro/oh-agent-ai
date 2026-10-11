/**
 * 地标/市政用地搬家后的接入路（docs/CITY_PLAN_MANUAL_REPAIR_SPEC.md §16.3）。
 *
 * 自由级设施（致敬地标、市政用地）可以搬到任意空地，但搬过去时身边常常没有路——浏览器实测电视塔搬完孤零零立在草地上，
 * 原址却留着一截断头的接入路。这里两件事，都是纯函数：
 *   - `accessRoadFor`：给新位置找一条最短的接入路（从占地外沿接到最近的道路上）。只接受「不推平、不安置、不入水」的路——
 *     为了方便顺手拆掉别人的楼不是接入路该干的事；找不到就如实返回 null，由用户自己画。
 *   - `strandedAccessEdges`：原址留下的断头接入路（从生成器登记的接入点 / 原占地内的断头路口沿单行链往外走）。
 *     只是**列出来**让用户一键擦掉，不自动删——断头路也可能服务着别的楼。
 */
import type { CityModel } from "../cityModel";
import type { CityLayout, Vec2 } from "./cityLayout";
import { nearestOnPolyline } from "./planPatch";
import { snapPoint, validateRoadAdd } from "./planRoadRules";

/** 与路的间隙不超过这么多就算「已经挨着路」，不再补接入路。 */
const ADJACENT_GAP = 6;
/** 接入路最长（再长就不是接入路，是一条新路，交给用户画）。 */
const MAX_ACCESS = 160;
/** 比这更短的接入路不补（路段最短 6，留一点余量）。 */
const MIN_ACCESS = 8;
/** 搬家后考察的最近路段数。 */
const CANDIDATE_EDGES = 4;

export type AccessRoad = { from: Vec2; to: Vec2; length: number };

/**
 * 圆形占地（中心 center、半径 r）到最近道路的接入路。起点放在占地外接正方形之外——
 * 占地按正方形参与「压到建筑」判定，起点落在正方形对角区会被当成压到设施自己。
 */
export function accessRoadFor(layout: CityLayout, model: CityModel, center: Vec2, r: number, width = 5): AccessRoad | null {
  const edges = layout.roadEdges.filter((edge) => !edge.bridge && edge.structure !== "deck");
  const near = edges
    .map((edge) => ({ edge, hit: nearestOnPolyline(center, edge.points) }))
    .sort((a, b) => a.hit.distance - b.hit.distance)
    .slice(0, CANDIDATE_EDGES);
  if (!near.length) return null;
  if (near[0].hit.distance - r <= ADJACENT_GAP) return null;
  const startOffset = r * Math.SQRT2 + 2;
  for (const { hit } of near) {
    const d = hit.distance;
    if (d <= startOffset + 1) continue;
    const ux = (hit.point.x - center.x) / d; const uz = (hit.point.z - center.z) / d;
    const from = { x: center.x + ux * startOffset, z: center.z + uz * startOffset };
    const snap = snapPoint(layout, hit.point.x, hit.point.z);
    if (snap.locked) continue;
    const to = { x: snap.x, z: snap.z };
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    // 外接正方形的角已经快碰到路（比最短路段还近）：等于挨着路，不补——硬补会是一截过短的路，校验也不收。
    if (length < MIN_ACCESS) return null;
    if (length > MAX_ACCESS) continue;
    const verdict = validateRoadAdd(layout, model, from, to, width);
    if (verdict.blockers.length) continue;
    if (verdict.warnings.some((code) => code.startsWith("bulldoze:") || code.startsWith("relocate:"))) continue;
    return { from, to, length: Math.round(length) };
  }
  return null;
}

/**
 * 原址留下的断头接入路：起点是度为 1 的路口——生成器登记的接入点（accessNodeId），或落在原占地内的断头路口；
 * 沿度为 2 的路口往外走，走到岔路口或离原址太远为止。返回路段 id（按顺序可逐条擦）。
 * existing：搬家前就存在的路段 id。新补的接入路不在其中，走到它就停——否则搬到原址旁边时，
 * 新接入路自己的端点也是「原占地内的断头路口」，会沿着它把刚接通的旧接入路误列为遗留（测试 (f) 抓到）。
 */
export function strandedAccessEdges(layout: CityLayout, oldCenter: Vec2, r: number, accessNodeId?: string, existing?: ReadonlySet<string>): string[] {
  const incident = new Map<string, string[]>();
  for (const edge of layout.roadEdges) {
    for (const node of [edge.from, edge.to]) {
      const list = incident.get(node);
      if (list) list.push(edge.id); else incident.set(node, [edge.id]);
    }
  }
  const edgeById = new Map(layout.roadEdges.map((edge) => [edge.id, edge]));
  const nodes = new Map(layout.roadNodes.map((node) => [node.id, node]));
  const reach = r * 1.5 + 60;
  const starts = layout.roadNodes.filter((node) => (incident.get(node.id)?.length ?? 0) === 1
    && (node.id === accessNodeId || Math.hypot(node.x - oldCenter.x, node.z - oldCenter.z) <= r * 1.2));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const start of starts) {
    let at = start.id;
    for (let guard = 0; guard < 16; guard += 1) {
      const next = (incident.get(at) ?? []).find((id) => !seen.has(id));
      const edge = next ? edgeById.get(next) : undefined;
      if (!edge || edge.bridge || edge.structure === "deck" || (existing && !existing.has(edge.id))) break;
      seen.add(edge.id); out.push(edge.id);
      at = edge.from === at ? edge.to : edge.from;
      const node = nodes.get(at);
      if (!node || (incident.get(at)?.length ?? 0) !== 2 || Math.hypot(node.x - oldCenter.x, node.z - oldCenter.z) > reach) break;
    }
  }
  return out;
}
