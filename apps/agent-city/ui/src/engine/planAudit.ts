/**
 * 规划体检（docs/CITY_PLAN_MANUAL_REPAIR_SPEC.md §6，M1 首批）：只读扫描布局层违例，
 * 产出可定位的问题清单。规则 id 与 planner/constraints.ts 的约束同语言——plan 级
 * （roadThroughSite/looseInlandRoadEnds/...）在 city-opt 的 constraints 导出稳定后接入，
 * 本批只落布局级规则；plan 级诊断可先用 `scripts/diagnose-city-residuals.mjs` 补位。
 */
import type { CityBuilding, CityModel } from "../cityModel";
import type { CityLayout, Parcel, Vec2 } from "./cityLayout";
import { buildingRect, clearanceRoads, rectClearOfEdges, rectsOverlap, type BuildingRect, type PatchStaleEntry } from "./planPatch";

export type PlanIssueSeverity = "error" | "warning" | "info";

export type PlanIssue = {
  /** 稳定 id：`<rule>:<entityId>`——面板定位、防重、测试断言都靠它。 */
  id: string;
  severity: PlanIssueSeverity;
  rule: string;
  /** 定位点；补丁失效条目没有地理位置 → null（面板不显示「定位」）。曾填 NaN，点定位会把相机飞到 NaN。 */
  at: Vec2 | null;
  detail: string;
  entities: string[];
};

const SLOPE_LIMIT = 0.55;   // 同背景楼筛（cityLayout contextBuildings 候选）
const ORPHAN_DISTANCE = 40; // 有楼街区到最近非桥路段的距离上限

/** 点到折线段集的最近距离（块中心 → 路网用）。 */
function distanceToEdges(point: Vec2, edges: readonly { points: Vec2[] }[]): number {
  let best = Infinity;
  for (const edge of edges) {
    for (let i = 1; i < edge.points.length; i += 1) {
      const a = edge.points[i - 1]; const b = edge.points[i];
      const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / l2));
      best = Math.min(best, Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t));
    }
  }
  return best;
}

const SEVERITY_ORDER: Record<PlanIssueSeverity, number> = { error: 0, warning: 1, info: 2 };

/**
 * 布局层体检。stale 来自 applyPlanPatch 的失效清单（patchStale 规则）；
 * 结果按 (severity, id) 排序——确定性输出，测试与面板共用。
 */
export function auditLayout(layout: CityLayout, model: CityModel, stale: readonly PatchStaleEntry[] = []): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const buildingsById = new Map(model.buildings.map((building) => [building.id, building]));
  const groundRoads = clearanceRoads(layout);

  type Placed = { building: CityBuilding; slot: Parcel; rect: BuildingRect };
  const placed: Placed[] = [];
  for (const district of layout.districts) {
    for (const [id, slot] of district.slots) {
      const building = buildingsById.get(id);
      if (!building) continue;
      placed.push({ building, slot, rect: buildingRect(building, slot) });
      // buildingOnSlope：不可建为 error，坡度超限为 warning（口径同背景楼筛）。
      if (!layout.terrain.buildable(slot.x, slot.z)) {
        issues.push({ id: `buildingOnSlope:not-buildable:${id}`, severity: "error", rule: "buildingOnSlope", at: { x: slot.x, z: slot.z }, detail: `会话楼 ${id} 落在不可建地形上`, entities: [id] });
      } else if (layout.terrain.slope(slot.x, slot.z) > SLOPE_LIMIT) {
        issues.push({ id: `buildingOnSlope:steep:${id}`, severity: "warning", rule: "buildingOnSlope", at: { x: slot.x, z: slot.z }, detail: `会话楼 ${id} 所在地块坡度超过 ${SLOPE_LIMIT}`, entities: [id] });
      }
      // buildingOverRoad：朝向矩形与路段带相交（含桥下车位不算——只查地面路）。
      if (!rectClearOfEdges(slot, groundRoads, 0.5)) {
        issues.push({ id: `buildingOverRoad:${id}`, severity: "error", rule: "buildingOverRoad", at: { x: slot.x, z: slot.z }, detail: `会话楼 ${id} 压在道路上`, entities: [id] });
      }
    }
  }

  // buildingOverlap：实际占地矩形两两相交（buildingRect + 分离轴；48 单元空间网格只做候选裁剪）。
  // 曾借 FlightWorld 的保守碰撞 AABB——相邻地块必然相交，真实城市 1600 楼报 1111 条 error。
  const CELL = 48;
  const grid = new Map<string, Placed[]>();
  for (const item of placed) {
    const key = `${Math.floor(item.slot.x / CELL)}:${Math.floor(item.slot.z / CELL)}`;
    const list = grid.get(key); if (list) list.push(item); else grid.set(key, [item]);
  }
  const seen = new Set<string>();
  for (const [key, items] of grid) {
    const [gx, gz] = key.split(":").map(Number);
    const neighbours: Placed[] = [];
    for (let dx = -1; dx <= 1; dx += 1) for (let dz = -1; dz <= 1; dz += 1) neighbours.push(...(grid.get(`${gx + dx}:${gz + dz}`) ?? []));
    for (const a of items) for (const b of neighbours) {
      if (a === b) continue;
      const pairId = [a.building.id, b.building.id].sort().join("/");
      if (seen.has(pairId)) continue;
      if (rectsOverlap(a.rect, b.rect)) {
        seen.add(pairId);
        issues.push({ id: `buildingOverlap:${pairId}`, severity: "error", rule: "buildingOverlap", at: { x: (a.slot.x + b.slot.x) / 2, z: (a.slot.z + b.slot.z) / 2 }, detail: `会话楼 ${a.building.id} 与 ${b.building.id} 的占地相交`, entities: [a.building.id, b.building.id] });
      }
    }
  }

  // orphanedBlock：有楼街区离任何地面路都太远（医院门前没有路的泛化）。
  if (groundRoads.length) {
    const builtBlockIds = new Set(placed.map((item) => item.slot.blockId));
    for (const block of layout.blocks) {
      if (!builtBlockIds.has(block.id)) continue;
      const gap = distanceToEdges({ x: block.x, z: block.z }, groundRoads) - (Math.hypot(block.width, block.depth) / 2);
      if (gap > ORPHAN_DISTANCE) {
        issues.push({ id: `orphanedBlock:${block.id}`, severity: "warning", rule: "orphanedBlock", at: { x: block.x, z: block.z }, detail: `街区 ${block.id} 有楼但离最近道路 ${Math.round(gap)}（> ${ORPHAN_DISTANCE}）`, entities: [block.id] });
      }
    }
  }

  // patchStale：补丁失效条目如实上报（info：不是城市的问题，是补丁追不上城市）。
  for (const entry of stale) {
    issues.push({ id: `patchStale:${entry.kind}:${entry.id}`, severity: "info", rule: "patchStale", at: null, detail: `补丁条目失效（${entry.reason}）：${entry.detail}`, entities: [entry.id] });
  }

  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
