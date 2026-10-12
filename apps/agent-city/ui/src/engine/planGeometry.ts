/**
 * 规划修复的底层几何/占用基础（纯函数）：被补丁层、道路规则、设施规则共用，不依赖补丁结构，
 * 所以不会与 planPatch 形成循环依赖。planPatch.ts 把这些原样再导出，外部引用路径不变。
 */
import type { CityBuilding } from "../cityModel";
import type { CityLayout, Parcel, RoadEdge, Vec2 } from "./cityLayout";
import { pointInPolygon, siteFootprint, worldOverhead } from "./planFootprint";

const distanceToSegment = (p: Vec2, a: Vec2, b: Vec2) => {
  const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
};

export const quantize = (p: Vec2): Vec2 => ({ x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 });

/** 高架桥面宽与两端匝道长——与渲染层 render/shared.ts 的 EXPRESSWAY_DECK_WIDTH / EXPRESSWAY_RAMP 同值
 *  （那个模块带 three，规则层不引；verify-plan-bulldozer 断言两边相等）。 */
export const VIADUCT_DECK_WIDTH = 10.5;
export const VIADUCT_RAMP = 90;

/** 锁定口径（放权后，SPEC §15）：只锁**桥面**——它的几何由桥梁模型（桥塔/桁架）绑定，单独擦或拖会留下悬空的桥。
 *  曾经连桥头引道、滨海路一起锁（M1 求稳），用户实测「很多东西都不能改」：滨海路占全城道路总长的大头，
 *  一锁就把最显眼的路全锁了。现在它们可编辑，改动的影响以提示呈现（擦掉引道桥会断开），不再拒绝。 */
export function edgeLocked(edge: RoadEdge): boolean {
  return edge.bridge === true || edge.structure === "deck";
}

/** 楼的净空要避开的路：地面路（非桥）。体检与编辑校验共用这一个口径——
 *  曾经校验查全部路段、体检只查地面路，编辑器会拦下体检根本不报的落位（「三者同源」被破坏）。 */
export function clearanceRoads(layout: CityLayout): RoadEdge[] {
  return cached(layout, "clearanceRoads", layoutDeps(layout), () => layout.roadEdges.filter((edge) => !edge.bridge));
}

/**
 * 布局对象不可变（补丁每次产出新布局），按布局缓存派生结果（路线图 SPEC P0-1）。曾在每次 validateBuildingMove 里
 * 重建全城地块索引与占用集合——推土机安置一栋楼要校验上百块地，4000 楼时一笔路的试算 8.9 秒。
 * 测试会改合成布局的字段，所以缓存命中还要核对来源数组仍是同一个引用、以及各集合的元素数（就地 push 也能察觉）。
 */
const derivedCache = new WeakMap<CityLayout, { deps: readonly unknown[]; values: Map<string, unknown> }>();
function cached<T>(layout: CityLayout, key: string, deps: readonly unknown[], build: () => T): T {
  let entry = derivedCache.get(layout);
  if (!entry || entry.deps.length !== deps.length || entry.deps.some((dep, i) => dep !== deps[i])) { entry = { deps, values: new Map() }; derivedCache.set(layout, entry); }
  if (!entry.values.has(key)) entry.values.set(key, build());
  return entry.values.get(key) as T;
}
// 计数也进依赖：测试会往已用过的合成布局里就地 push 地块（verify-plan-patch (g) 占地重叠），只核对数组引用会读到旧索引。
const layoutDeps = (layout: CityLayout): unknown[] => [layout.blocks, layout.districts, layout.civics, layout.gardens, layout.districtLandmarks, layout.landmarks, layout.publicSites, layout.contextBuildings, layout.roadEdges,
  layout.blocks.reduce((n, block) => n + block.parcels.length, 0), layout.districts.reduce((n, district) => n + district.slots.size, 0), layout.contextBuildings.length, layout.roadEdges.length];

/** 全城地块索引：街区地块 + 已落楼地块（酒店地块不进 layout.blocks，只存在于 slots 里）。按布局缓存，调用方不得修改返回值。 */
export function parcelIndex(layout: CityLayout): Map<string, Parcel> {
  return cached(layout, "parcelIndex", layoutDeps(layout), () => buildParcelIndex(layout));
}
function buildParcelIndex(layout: CityLayout): Map<string, Parcel> {
  const index = new Map<string, Parcel>();
  for (const block of layout.blocks) for (const parcel of block.parcels) index.set(parcel.id, parcel);
  for (const district of layout.districts) for (const parcel of district.slots.values()) if (!index.has(parcel.id)) index.set(parcel.id, parcel);
  return index;
}

/** 被占用/预留的地块：会话楼、配套整街区、小区花园街区、城区地标整街区、致敬地标与市政用地圆内、未压制的背景楼。
 *  编辑校验与套用共用——套用曾只看会话楼，刷新后目标地块冒出背景楼时照套不误，两楼叠在一起。 */
export function reservedParcelIds(layout: CityLayout, suppressedContext: Iterable<string> = []): Set<string> {
  // 返回副本：调用方（applyPlanPatch 的移楼循环）会就地增删占用。只读的调用方用 reservedParcelIdsShared。
  return new Set(reservedParcelIdsShared(layout, suppressedContext));
}

/** 同 reservedParcelIds，返回按布局缓存的同一个集合——只读，不得修改。 */
export function reservedParcelIdsShared(layout: CityLayout, suppressedContext: Iterable<string> = []): ReadonlySet<string> {
  const suppressedList = [...suppressedContext];
  return cached(layout, `reserved|${[...suppressedList].sort().join(",")}`, layoutDeps(layout), () => buildReserved(layout, suppressedList));
}

/** 全城会话楼落位（id → 地块）的扁平表与「街区 → 第一个在其中落楼的城区」（validateBuildingMove 每次都要扫）。 */
export function slotIndex(layout: CityLayout): { slots: ReadonlyArray<readonly [string, Parcel]>; districtOfBlock: ReadonlyMap<string, string>; homeOf: ReadonlyMap<string, string> } {
  return cached(layout, "slotIndex", layoutDeps(layout), () => {
    const slots: Array<readonly [string, Parcel]> = []; const districtOfBlock = new Map<string, string>(); const homeOf = new Map<string, string>();
    for (const district of layout.districts) for (const [id, slot] of district.slots) {
      slots.push([id, slot]);
      if (!homeOf.has(id)) homeOf.set(id, district.id);
      if (!districtOfBlock.has(slot.blockId)) districtOfBlock.set(slot.blockId, district.id);
    }
    return { slots, districtOfBlock, homeOf };
  });
}
function buildReserved(layout: CityLayout, suppressedContext: readonly string[]): Set<string> {
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
  // 按模型真实占地（planFootprint）判：地块中心落在占地外扩 4 以内即占用；只认得出预留圆的模型照旧按圆 + 4。
  const roundSites = [...(layout.landmarks ?? []).map((site) => ({ site, id: site.id })), ...(layout.publicSites ?? []).map((site) => ({ site, id: `public:${site.id}` }))].filter(({ site }) => site.radius);
  const shapes = roundSites.map(({ site, id }) => {
    const footprint = siteFootprint(site.kind, id, site.radius, "shore" in site && !!site.shore);
    return { site, footprint, parts: footprint.exact ? worldOverhead(footprint, site, site.yaw) : [] };
  });
  if (shapes.length) for (const parcel of parcels.values()) {
    if (shapes.some(({ site, footprint, parts }) => (footprint.exact
      ? parts.some((part) => pointInPolygon(parcel, part) || part.some((v, i) => distanceToSegment(parcel, v, part[(i + 1) % part.length]) < 4))
      : Math.hypot(parcel.x - site.x, parcel.z - site.z) < site.radius + 4))) reserved.add(parcel.id);
  }
  const suppressed = new Set(suppressedContext);
  for (const context of layout.contextBuildings) {
    const parcelId = context.id.replace(/^context:/, "");
    if (parcels.has(parcelId) && !suppressed.has(context.id)) reserved.add(parcelId);
  }
  return reserved;
}

/** 地面路网格索引的格子边长。 */
const GRID = 40;

/**
 * 地面路（clearanceRoads）的网格索引：每个线段按包围盒登记到格子里。按布局缓存。
 * edgesNear 返回「可能离 (x,z) 不超过 radius 的路段」，**按 clearanceRoads 的原顺序**、不重复——
 * 调用方的「取最小、并列取先出现」口径因此不变（路线图 SPEC P0-1：结果逐字不变的提速）。
 */
function edgeGrid(layout: CityLayout): { cells: Map<string, number[]>; edges: RoadEdge[]; maxHalf: number } {
  return cached(layout, "edgeGrid", layoutDeps(layout), () => {
    const edges = clearanceRoads(layout); const cells = new Map<string, number[]>(); let maxHalf = 0;
    edges.forEach((edge, index) => {
      maxHalf = Math.max(maxHalf, edge.width / 2);
      const seen = new Set<string>();
      for (let i = 1; i < edge.points.length; i += 1) {
        const a = edge.points[i - 1]; const b = edge.points[i];
        for (let gx = Math.floor(Math.min(a.x, b.x) / GRID); gx <= Math.floor(Math.max(a.x, b.x) / GRID); gx += 1)
          for (let gz = Math.floor(Math.min(a.z, b.z) / GRID); gz <= Math.floor(Math.max(a.z, b.z) / GRID); gz += 1) {
            const key = `${gx}:${gz}`;
            if (seen.has(key)) continue; seen.add(key);
            const list = cells.get(key); if (list) list.push(index); else cells.set(key, [index]);
          }
      }
    });
    return { cells, edges, maxHalf };
  });
}

/** 中心线离 (x,z) 可能 ≤ radius 的地面路段（原顺序、不重复）。任何一点在半径内的线段，其包围盒必与查询方框共用格子。 */
export function edgesNear(layout: CityLayout, x: number, z: number, radius: number): RoadEdge[] {
  const { cells, edges } = edgeGrid(layout);
  const hits = new Set<number>();
  for (let gx = Math.floor((x - radius) / GRID); gx <= Math.floor((x + radius) / GRID); gx += 1)
    for (let gz = Math.floor((z - radius) / GRID); gz <= Math.floor((z + radius) / GRID); gz += 1)
      for (const index of cells.get(`${gx}:${gz}`) ?? []) hits.add(index);
  return [...hits].sort((a, b) => a - b).map((index) => edges[index]);
}

/** 同 rectClearOfEdges(rect, clearanceRoads(layout), pad)，只查附近的路（结果相同）。 */
export function rectClearOfRoads(layout: CityLayout, rect: { x: number; z: number; yaw: number; width: number; depth: number }, pad = 0.5): boolean {
  const half = edgeGrid(layout).maxHalf + pad; // 与 rectClearOfEdges 粗筛同一个可达半径（取最宽的路），再留 1 的余量
  const reach = Math.hypot(rect.width / 2 + half, rect.depth / 2 + half) + 1;
  return rectClearOfEdges(rect, edgesNear(layout, rect.x, rect.z, reach), pad);
}

/** 朝向矩形与路段带是否相交（口径同 cityLayout 的 lotClearOfRoads：局部轴投影 + 路幅半宽外扩）。 */
export function rectClearOfEdges(rect: { x: number; z: number; yaw: number; width: number; depth: number }, edges: readonly RoadEdge[], pad = 0.5): boolean {
  const ax = Math.sin(rect.yaw); const az = Math.cos(rect.yaw); // 局部 z 轴（进深）
  const bx = az; const bz = -ax;                                // 局部 x 轴（面宽）
  for (const edge of edges) {
    const half = edge.width / 2 + pad;
    // 粗筛（结果逐字不变）：采样点要命中，离矩形中心不能超过 hypot(半面宽+half, 半进深+half)；
    // 线段外扩这个半径的包围盒不含中心，整段都不可能命中。曾逐段按 1.5 步长采样全城路——体检 3.6 秒的 90%。
    const reach = Math.hypot(rect.width / 2 + half, rect.depth / 2 + half);
    for (let i = 1; i < edge.points.length; i += 1) {
      const a = edge.points[i - 1]; const b = edge.points[i];
      if (rect.x < Math.min(a.x, b.x) - reach || rect.x > Math.max(a.x, b.x) + reach || rect.z < Math.min(a.z, b.z) - reach || rect.z > Math.max(a.z, b.z) + reach) continue;
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
