/**
 * 规划修复的底层几何/占用基础（纯函数）：被补丁层、道路规则、设施规则共用，不依赖补丁结构，
 * 所以不会与 planPatch 形成循环依赖。planPatch.ts 把这些原样再导出，外部引用路径不变。
 */
import type { CityBuilding } from "../cityModel";
import type { CityLayout, Parcel, RoadEdge, Vec2 } from "./cityLayout";

export const quantize = (p: Vec2): Vec2 => ({ x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 });

/** 锁定口径（放权后，SPEC §15）：只锁**桥面**——它的几何由桥梁模型（桥塔/桁架）绑定，单独擦或拖会留下悬空的桥。
 *  曾经连桥头引道、滨海路一起锁（M1 求稳），用户实测「很多东西都不能改」：滨海路占全城道路总长的大头，
 *  一锁就把最显眼的路全锁了。现在它们可编辑，改动的影响以提示呈现（擦掉引道桥会断开），不再拒绝。 */
export function edgeLocked(edge: RoadEdge): boolean {
  return edge.bridge === true || edge.structure === "deck";
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

/** 被占用/预留的地块：会话楼、配套整街区、小区花园街区、城区地标整街区、致敬地标与市政用地圆内、未压制的背景楼。
 *  编辑校验与套用共用——套用曾只看会话楼，刷新后目标地块冒出背景楼时照套不误，两楼叠在一起。 */
export function reservedParcelIds(layout: CityLayout, suppressedContext: Iterable<string> = []): Set<string> {
  const parcels = parcelIndex(layout);
  const blockOf = new Map<string, string[]>();
  for (const block of layout.blocks) for (const parcel of block.parcels) {
    const list = blockOf.get(parcel.blockId); if (list) list.push(parcel.id); else blockOf.set(parcel.blockId, [parcel.id]);
  }
  const reserved = new Set<string>();
  for (const district of layout.districts) for (const parcel of district.slots.values()) reserved.add(parcel.id);
  for (const civic of layout.civics) for (const parcelId of blockOf.get(civic.parcelId) ?? [civic.parcelId]) reserved.add(parcelId);
  for (const garden of layout.gardens) for (const parcelId of blockOf.get(garden.blockId) ?? []) reserved.add(parcelId);
  // 城区地标的 17 m 裙房比一个地址大：生成器把它所在的**整个街区**都预留了（cityLayout 注释：保住相邻地址）。
  // 编辑器曾只预留它那一个地块（注册表 SPEC D1）——会话楼可能被搬进地标旁边、压到裙房。与生成器对齐。
  for (const landmark of layout.districtLandmarks ?? []) {
    const parcel = parcels.get(landmark.parcelId);
    for (const parcelId of (parcel && blockOf.get(parcel.blockId)) || [landmark.parcelId]) reserved.add(parcelId);
  }
  // 致敬地标与市政用地按圆形占地：生成器先于街区为它们留地，所以底图里圆内本无地块；
  // 但它们现在可以被搬家（§15），搬到有地块的地方后，圆内的地块必须算占用，否则会话楼会被搬进去。
  const roundSites = [...(layout.landmarks ?? []), ...(layout.publicSites ?? [])];
  if (roundSites.length) for (const parcel of parcels.values()) {
    if (roundSites.some((site) => Math.hypot(parcel.x - site.x, parcel.z - site.z) < site.radius + 4)) reserved.add(parcel.id);
  }
  const suppressed = new Set(suppressedContext);
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
