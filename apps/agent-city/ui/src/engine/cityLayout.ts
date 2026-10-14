import { DetMath as Math } from "./detMath"; // 跨引擎确定性：见 detMath.ts
/** Geography and public planning are fixed; sessions occupy reserved parcels. */
import { hashSeed, type CityModel } from "../cityModel";
import { createCityPlan, type Biome, type Landmark } from "./cityPlan";
import { clearsHighways, polygonDistance } from "./roadGeometry";
import { scaleTierFor } from "./scaleTier";
import { oceanDriveSplitZ, oceanDriveWall, seasideHotelLots, seasideStripContains, type CoastalConfig, type OceanDriveBuilding } from "./citySeaside";
import { preserveDemandPaths, preserveDisplayJunctions, retainBridgeLandings } from "./planner/retention";
import { diagnoseNetwork } from "./planner/intent";
import type { ParcelFrontageProof } from "./planner/roadBlocks";
import { validateParcelFrontage } from "./planner/parcelFrontage";
import { lotClearsRoads } from "./planner/lotRoadClearance";
import { measureLayoutCapacity } from "./planner/layoutCapacity";
import { closestPolylineSegment, polylineDistance } from "./planner/footprint";
import { isletEstate } from "./cityIsletEstate";
import { findBlockLotCandidate, LAYOUT_PLACEMENT_WORK_CONFIG } from "./planner/blockLotCandidates";
import { inspectBlockPlacement, type BlockPlacementInput, type BlockPlacementResult } from "./planner/blockPlacement";
import { civicMinimumSize, civicEnvelopeSize, GARDEN_MINIMUM_SIZE, DISTRICT_LANDMARK_ENVELOPE } from "./models/layoutPlacementGeometry";

export type Vec2 = { x: number; z: number };
export type Zone = "downtown" | "residential" | "commercial" | "waterfront";
export type Parcel = Vec2 & { id: string; blockId: string; yaw: number; zone: Zone; width: number; depth: number; frontage?: ParcelFrontageProof };
export type BlockSurfaceExclusion = { kind: "road-corridor" | "highway-corridor"; id: string; points: Vec2[]; width: number }
  | { kind: "site-circle"; id: string; x: number; z: number; radius: number };
export type CityBlock = {
  id: string; districtId: string; x: number; z: number; width: number; depth: number;
  zone: Zone; parcels: Parcel[]; polygon: Vec2[];
  /** Derived from accepted roads; these are not invented grid boundaries. */
  sourceFaceId?: string; networkVersion?: number; roadBoundary?: Vec2[]; holes?: Vec2[][];
  surfaceCoverage?: "road-width-inset" | "requires-envelope-clipping";
  surfaceExclusions?: BlockSurfaceExclusion[];
  /** 无楼且不在已建街区旁的预留圈内：地面画成自然绿地，不铺地块（G1「街区随建成量生长」）。 */
  vacant?: boolean;
};
export type RoadNode = Vec2 & { id: string };
export type RoadEdge = { id: string; from: string; to: string; width: number; kind: "arterial" | "local"; points: Vec2[]; bridge?: boolean; structure?: "ground-road" | "ground-approach" | "deck"; purpose?: "waterfront" };
export type TerrainField = {
  height: (x: number, z: number) => number; slope: (x: number, z: number) => number;
  buildable: (x: number, z: number) => boolean; coastRadius: (angle: number) => number;
  center: Vec2; radius: number; hasRiver: boolean;
};
export type DistrictLayout = {
  id: string; label: string; center: Vec2; radius: number; terrain: TerrainField;
  slots: Map<string, Parcel>; grounds: Map<string, number>; roads: Vec2[][]; carPaths: Vec2[][];
  river: Vec2[] | null; riverHalfWidth: number; trees: Array<Vec2 & { y: number; seed: number }>;
  plaza: Vec2 & { y: number }; anomaly: { severity: "critical" | "warning" | "info"; count: number } | null;
  sessionCount: number;
  /** 地价（0–1，S5）：离城区中心/城市核心越近、临主干道、临海越高。建筑形态随它变化（高 → 塔楼、低 → 板楼），
   *  楼高仍由 token 决定——地价只改「长成什么样」，不改「有多大」。 */
  landValue: Map<string, number>;
};
/** 城区地标（S5「每区一个地标」）：落在离城区中心最近的空地块上，取区色；装饰，不代表会话。 */
export type DistrictLandmark = { districtId: string; parcelId: string; x: number; z: number; yaw: number; y: number };
/** 城市配套：学校 / 商场 / 医院。数量随会话规模增长（每 CIVIC_PER_SESSIONS 个会话一座），
 *  落成时刻 = 城市长到那个规模的时刻——回放时看得见「城市在发展」。纯装饰，不进统计、不可拾取。 */
/** 小区中心花园：每个执行环境城区锚点处预留一个整街区（湖 + 假山 + 亭 + 环湖树），楼从四周向外长。 */
export type GardenSite = Vec2 & { id: string; districtId: string; blockId: string; y: number; yaw: number; width: number; depth: number; seed: number };
export type CivicKind = "school" | "mall" | "hospital";
export type CivicSite = Vec2 & { id: string; kind: CivicKind; districtId: string; parcelId: string; y: number; yaw: number; width: number; depth: number; unlockAt: number };
/** 非会话型城市肌理：只填充未占用的内陆/沿岸街区，不进入统计、拾取或回放。 */
/** 背景楼策略（CITY_DATA_LEGIBILITY_SPEC F1/F4）：
 *  - auto（默认）：数量随会话数缩放（×0.35），离会话楼 < BACKDROP_KEEP_OUT 不放，优先远离数据、靠近核心——
 *    远景天际线让给氛围，城区之间留给数据；
 *  - off：纯数据城市（零背景楼）；
 *  - full：VICE 批次原行为（贴着会话城区填满 224–280 栋）。 */
export type BackdropMode = "auto" | "off" | "full";
export const BACKDROP_KEEP_OUT = 60;
export const BACKDROP_PER_SESSION = 0.35;

export type ContextBuilding = Vec2 & { id: string; y: number; yaw: number; width: number; depth: number; height: number; seed: number; zone: Zone;
  /** F2：回放到这一刻才落成（按选址次序均匀铺在数据窗口前 85%）——回放起点是空地，城市随时间填满。 */
  appearAt: number };
export const CIVIC_PER_SESSIONS = 45;
const CIVIC_ORDER: CivicKind[] = ["school", "mall", "hospital"];

export type BridgeLayout = { from: Vec2; to: Vec2; angle: number; length: number };
export type PublicSite = Vec2 & { id: string; kind: "civic" | "station" | "stadium" | "park" | "tower" | "harbor"; radius: number; yaw: number; access?: import("./planner/jointSite").PlotAccess };
export type CityLayout = {
  /** Full accepted plan status; display pruning is a separate projection. */
  planningOutcome?: ReturnType<typeof import("./planner/solve").repairPlanningOutcome>;
  derivedFinalization?: { ok: boolean; reason?: string };
  parcelSource?: "accepted-road-faces" | "legacy-grid";
  derivedNetworkVersion?: number;
  displayOutcome?: { status: "partial" | "failed"; reasons: string[] };
  placementBudget?: { limit: number; spent: number; remaining: number };
  sessionCapacity?: ReturnType<typeof measureLayoutCapacity>;
  placementReport?: Array<{ id: string; class: "garden" | "district-landmark" | "civic";
    status: "placed" | "candidate-exhausted" | "budget-exhausted" | "unsupported"; reason?: string;
    terrainSamples: number; attempted: number; scope: "sampled-rectangle-and-declared-circle-proxies" }>;
  /** G1：规模档位、生态带与城市核心点（下游取景/航拍/植被读这里，不再假设岛在原点、固定大小）。 */
  scaleTier: number; biome: Biome; core: Vec2; islandRadius: number;
  seed: number; districts: DistrictLayout[]; blocks: CityBlock[]; roadNodes: RoadNode[]; roadEdges: RoadEdge[];
  /** 哪些街区已建/预留的指纹：静态城缓存（地面贴图）据此判断是否重画。 */
  activityKey?: string;
  /** 环岛滨海路段（不含河岸路），S3 滨海景观带沿其在建成区附近的岸段铺设。 */
  coastRoads?: Vec2[][];
  /** 尽端回车点（形态批 §5-3，加性）：计划层 classifyEndpoints 判为 cul-de-sac 的合法尽端，
   *  生长剪枝（G1）删掉所在支路后已不存在于最终路网的点被剔除——回车圈只画在真实路尽头。 */
  culDeSacEnds?: Vec2[];
  districtLandmarks?: DistrictLandmark[];
  terrain: TerrainField; extent: number; coast: Vec2[]; river: Vec2[]; publicSites: PublicSite[];
  parkTrees: Array<Vec2 & { y: number; seed: number }>;
  urbanBounds: { left: number; right: number; north: number; south: number };
  bridges: BridgeLayout[]; boatLanes: Array<{ radius: number; speed: number; phase: number }>;
  boundsRadius: number; decorMountains: Array<{ center: Vec2; radius: number; terrain: TerrainField }>;
  /** Harness quarter anchors (token rank → anchor) and the elevated expressway
   *  that marks the north/south district border. */
  districtAnchors: Vec2[]; highways: Vec2[][];
  /** Sessions beyond the parcel budget, aggregated into non-interactive
   *  background massing blocks (honest count surfaced in the HUD). */
  massing: Array<{ districtId: string; x: number; z: number; y: number; count: number; tokens: number; height: number }>;
  /** 海岸外扩环状航道（折线）与两侧装饰远山。 */
  civics: CivicSite[];
  landmarks: Landmark[];
  /** VICE B1 海滨带：提供 coastal config 时存在；无配置为 null（旧行为）。 */
  seaside: import("./citySeaside").SeasideBand | null;
  /** 海滨配置参数指纹，用于静态场景缓存失效。 */
  coastalConfigKey: string;
  coastalConfig: CoastalConfig | null;
  /** 低数据量也保留城市轮廓；这些环境楼明确不代表会话。 */
  contextBuildings: ContextBuilding[];
  /** Ocean Drive Art Deco 街墙（开湾时东岛南段酒店线；背景楼，不占会话、不进统计）。 */
  oceanDrive?: OceanDriveBuilding[];
  gardens: GardenSite[];
  boatLoops: Vec2[][]; seaMountains: Array<{ center: Vec2; radius: number; height: number; seed: number }>;
};

const plans = new Map<string, ReturnType<typeof createCityPlan>>();
export const CITY_PLAN_CACHE_CONFIG = { version: 1, maxEntries: 8 } as const;
export const cityPlanCacheSize = () => plans.size;

/** Overflow sessions never vanish and never crash the page: they merge into a
 *  few background massing blocks per district, placed on open buildable land
 *  beyond the quarter's parcels. The HUD reports the aggregated count. */
function aggregateOverflow(districtId: string, anchor: Vec2, overflow: CityModel["buildings"], parcels: Parcel[], plan: ReturnType<typeof createCityPlan>) {
  const tokens = overflow.reduce((sum, building) => sum + building.tokensTotal, 0);
  const blocks = Math.max(1, Math.min(9, Math.round(overflow.length / 36)));
  const taken = new Set(parcels.map((parcel) => parcel.id));
  void taken;
  const per = Math.ceil(overflow.length / blocks);
  const out: Array<{ districtId: string; x: number; z: number; y: number; count: number; tokens: number; height: number }> = [];
  for (let index = 0; index < blocks; index += 1) {
    // 从锚点向外步进找一块开阔可建地（离已用地块足够远）。
    const angle = hashSeed(`${districtId}:mass:${index}`) * Math.PI * 2;
    let placed: Vec2 | null = null;
    for (let step = 6; step <= 26 && !placed; step += 2) {
      const reach = 60 + step * 9;
      const x = anchor.x + Math.cos(angle) * reach;
      const z = anchor.z + Math.sin(angle) * reach;
      if (!plan.terrain.buildable(x, z)) continue;
      if (!clearsHighways({ x, z }, 30, 30, plan.highways)) continue;
      if (plan.blocks.some((block) => block.parcels.length > 0 && Math.hypot(block.x - x, block.z - z) < 46)) continue;
      if (out.some((block2) => Math.hypot(block2.x - x, block2.z - z) < 34)) continue;
      placed = { x, z };
    }
    if (!placed) continue; // No unsafe fallback into infrastructure reservations.
    out.push({
      districtId,
      x: placed.x, z: placed.z, y: Math.max(0.3, plan.terrain.height(placed.x, placed.z)),
      count: index === blocks - 1 ? overflow.length - per * (blocks - 1) : per,
      tokens: Math.round(tokens / blocks),
      height: 9 + hashSeed(`${districtId}:mh:${index}`) * 8,
    });
  }
  return out;
}

/** The seed controls geography, never harness count, token ranking or time window. */
/** 规划修复补丁的移楼钉子（planPatch.ts::layoutPinsFor）：buildingId → parcelId，只在档位一致时生效。 */
export type LayoutPins = { scaleTier: number; parcels: ReadonlyMap<string, string> };

export function layoutCity(model: CityModel, previous?: CityLayout | null, seed = 1927, coastal: CoastalConfig | null = null, backdrop: BackdropMode = "auto", pins: LayoutPins | null = null): CityLayout {
  // 规模档位由会话总数分档：档位内刷新/分页不改地图；跨档时岛按原形状放大。
  const tier = scaleTierFor(model.buildings.length);
  // plans 缓存键携带海滨配置身份（profile+version）：同 seed 不同配置不得复用旧规划。
  // 缓存键含参数指纹：同 profile/version 改参数（如 maxCoastalHeight）必须产生
  // 新规划——曾只带 profile:version，参数变化时复用旧海滨带（审查 #5 复现）。
  const coastalKey = coastal
    ? `${coastal.profile}:v${coastal.version}:${[
        coastal.preferredAzimuth, coastal.azimuthTolerance, coastal.segmentArc,
        coastal.wetSandWidth, coastal.drySandWidth, coastal.promenadeOffset, coastal.boulevardOffset,
        coastal.hotelOffset, coastal.bandOuter, coastal.maxCoastalSlope,
        coastal.maxCoastalHeight, coastal.riverMargin, coastal.siteMargin,
        coastal.minValidRatio, coastal.bayHalfWidth, coastal.bayShift,
      ].join(",")}`
    : "none";
  const planKey = `${seed}:${tier}:${coastalKey}`;
  let plan = plans.get(planKey);
  if (plan) { plans.delete(planKey); plans.set(planKey, plan); }
  else {
    plan = createCityPlan(seed, tier, coastal);
    if (plan.derivedFinalization.ok && plan.capacity.satisfied && plan.planningOutcome.status !== "failed") {
      plans.set(planKey, plan);
      while (plans.size > CITY_PLAN_CACHE_CONFIG.maxEntries) plans.delete(plans.keys().next().value!);
    }
  }
  // 海滨酒店地块并入可落楼街区（单地块合成街区，朝海、宽 20–29）：酒店只在有会话落户时才出现。
  // 只进本函数的落楼候选，不改缓存的 plan、不进返回的 layout.blocks（地面贴图/规划守卫看到的规划不变），
  // 配套选址与背景楼仍只看 plan.blocks——酒店地块留给会话。
  // 酒店地块在路网之后才排：环岛滨海路的接入路、被裁的主干道接回大道等都可能从地块上穿过（真机：楼压在路上）。
  // 按地块的真实朝向矩形检查——外扩半个路幅 + 0.5——压路的地块不发放。
  const lotClearOfRoads = (lot: { x: number; z: number; yaw: number; width: number; depth: number }) => {
    return lotClearsRoads(lot, plan.roadEdges);
  };
  // 开湾时南段（Ocean Beach / Washington Beach）的酒店线让给 Art Deco 街墙（oceanDrive，背景楼），会话酒店只留北段。
  const oceanDriveSplit = (coastal?.bayHalfWidth ?? 0) > 0 ? oceanDriveSplitZ(plan.seaside) : -Infinity;
  const hotelBlocks: CityBlock[] = seasideHotelLots(plan.seaside).filter(lotClearOfRoads).filter((lot) => lot.z >= oceanDriveSplit).map((lot) => ({
    id: lot.id, districtId: "", x: lot.x, z: lot.z, width: lot.width, depth: lot.depth, zone: "waterfront" as Zone, polygon: [],
    parcels: [{ id: `${lot.id}/0`, blockId: lot.id, x: lot.x, z: lot.z, yaw: lot.yaw, zone: "waterfront" as Zone, width: lot.width, depth: lot.depth }],
  }));
  // Ocean Drive 街墙地块（用户定：会话楼优先占用、空位再补背景 Art Deco 酒店）：沿南段酒店线连续排，
  // 海滨地块（facadeFor：海滨 + 楼高 ≤ 36 → Art Deco 立面；C-1：楼高 > 26 让到内陆），属于东岛城区的扇区。
  // 压路（含横街）、压公共用地/地标的位置不排，读作街墙在路口处断开。
  const oceanLots = coastal && oceanDriveSplit > -Infinity ? oceanDriveWall(plan.seaside, coastal, seed, (lot) => {
    if (!lotClearsRoads(lot, plan.roadEdges)) return false;
    const h = plan.terrain.height(lot.x, lot.z);
    if (h < 0.5 || h > 6) return false;
    const half = Math.hypot(lot.width, lot.depth) / 2;
    return [...plan.publicSites, ...plan.landmarks].every((site) => !site.radius || Math.hypot(site.x - lot.x, site.z - lot.z) > half + site.radius + 1);
  }) : [];
  const oceanBlocks: CityBlock[] = oceanLots.map((lot) => ({
    id: `oceandrive:${lot.id}`, districtId: "", x: lot.x, z: lot.z, width: lot.width, depth: lot.depth, zone: "waterfront" as Zone, polygon: [],
    parcels: [{ id: `${lot.id}/0`, blockId: `oceandrive:${lot.id}`, x: lot.x, z: lot.z, yaw: lot.yaw, zone: "waterfront" as Zone, width: lot.width, depth: lot.depth }],
  }));
  const blocks = [...plan.blocks, ...hotelBlocks, ...oceanBlocks];
  const parcels = blocks.flatMap((block) => block.parcels);
  const parcelIndex = new Map(parcels.map((parcel) => [parcel.id, parcel]));
  const assigned = new Map<string, Parcel>();
  const used = new Set<string>();
  // 规划修复的移楼钉子（CITY_PLAN_MANUAL_REPAIR_SPEC §5/§12.4）：先于「刷新不搬家」落位。
  // 只在 layoutCity 之后做后处理时，生长剪枝不知道楼搬走了——新家的空置街区支路被剪掉（楼落在没有路的地方），
  // 老家街区却保住了路；刷新后目标地块还可能先被分给新会话，补丁随即失效、用户的修改悄悄消失。
  // 钉子只认存在且未占的地块；档位不符（岛已放大重排）整份不认，由 applyPlanPatch 报 tier-changed。
  // 无钉子时本段不执行，布局与旧版逐字节相同（golden/scene-baseline 不变）。
  if (pins && pins.scaleTier === tier) {
    const present = new Set(model.buildings.map((building) => building.id));
    for (const [buildingId, parcelId] of pins.parcels) {
      const parcel = parcelIndex.get(parcelId);
      if (present.has(buildingId) && parcel && !used.has(parcelId) && !assigned.has(buildingId)) { assigned.set(buildingId, parcel); used.add(parcelId); }
    }
  }
  // 跨档（会话数越过 400 的整数倍）：岛按原形状放大，地块编号对应的位置变了，旧地址不能原样复用——
  // 按放大比例把每栋楼映射到「放大后的原位置」最近的空地块（SPEC §4.2），城市看起来是整体长大而不是整体洗牌。
  // 先落位的是更早开工的楼（占最好的位置）；映射不到（半径 > 120 内没有空地块）的留给后面的常规落位。
  if (previous?.seed === seed && previous.scaleTier !== tier && previous.islandRadius > 0) {
    const ratio = plan.islandRadius / previous.islandRadius;
    const old = new Map(previous.districts.flatMap((district) => [...district.slots]));
    const CELL = 40;
    const grid = new Map<string, Parcel[]>();
    for (const parcel of parcels) { const key = `${Math.floor(parcel.x / CELL)}:${Math.floor(parcel.z / CELL)}`; const list = grid.get(key); if (list) list.push(parcel); else grid.set(key, [parcel]); }
    const ordered = [...model.buildings].filter((building) => old.has(building.id) && !assigned.has(building.id)).sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
    for (const building of ordered) {
      const from = old.get(building.id)!;
      const tx = from.x * ratio; const tz = from.z * ratio;
      const cx = Math.floor(tx / CELL); const cz = Math.floor(tz / CELL);
      let best: Parcel | null = null; let bestD = Infinity;
      for (let ring = 0; ring <= 3 && !best; ring += 1) {
        for (let gx = cx - ring; gx <= cx + ring; gx += 1) for (let gz = cz - ring; gz <= cz + ring; gz += 1) {
          if (Math.max(Math.abs(gx - cx), Math.abs(gz - cz)) !== ring) continue;
          for (const parcel of grid.get(`${gx}:${gz}`) ?? []) {
            if (used.has(parcel.id)) continue;
            const d = Math.hypot(parcel.x - tx, parcel.z - tz);
            if (d < bestD) { bestD = d; best = parcel; }
          }
        }
      }
      if (best && bestD <= 120) { assigned.set(building.id, best); used.add(best.id); }
    }
  }
  if (previous?.seed === seed && previous.scaleTier === tier) {
    const old = new Map(previous.districts.flatMap((district) => [...district.slots]));
    for (const building of model.buildings) {
      const parcel = old.get(building.id);
      if (parcel && parcelIndex.has(parcel.id) && !used.has(parcel.id) && !assigned.has(building.id)) {
        assigned.set(building.id, parcelIndex.get(parcel.id)!); used.add(parcel.id);
      }
    }
  }
  // Harness affinity × growth narrative: each district fills outward from its
  // quarter anchor in session-time order — the oldest sessions settle closest
  // to the anchor and newer ones push outward, so a timeline replay shows each
  // quarter growing from its seed core instead of a skyline reshuffle. Within
  // the same moment taller towers still claim the inner lots (stable tiebreak).
  // Already-placed buildings keep their parcels (see `previous` above), so a
  // refresh never relocates the city; only new sessions compete for what is
  // left — a late-discovered older session may land slightly outward, which is
  // the honest cost of never moving an existing building.
  // ── G3 小区划分（CITY_PLANNING_SPEC §4.4）──
  // 以城市核心为圆心，按方位角排列可建街区，按各执行环境会话数的比例切成连续扇形——每个执行环境一片连成一块的小区。
  // 曾按 4 个固定锚点「就近」落楼：锚点贴到陆地后可能挨在一起，两个城区挤成一团、标签重叠（seed 42）。
  // 城区排名按 (会话数降序, id 字典序) 确定性排序——输入顺序不影响划分（契约：reversed 输入得到同一座城）。
  const ranked = [...model.districts]
    .sort((a, b) => b.sessionCount - a.sessionCount || (a.id < b.id ? -1 : 1))
    .filter((district) => model.buildings.some((building) => building.districtId === district.id));
  const sessionsOf = new Map(ranked.map((district) => [district.id, model.buildings.filter((building) => building.districtId === district.id).length]));
  const totalSessions = [...sessionsOf.values()].reduce((sum, n) => sum + n, 0) || 1;
  const core = plan.core;
  const wedgeStart = hashSeed(`${seed}:wedge`) * Math.PI * 2;
  const angleFrom = (p: Vec2) => (((Math.atan2(p.z - core.z, p.x - core.x) - wedgeStart) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const usableBlocks = blocks.filter((block) => block.parcels.length > 0)
    .sort((a, b) => angleFrom(a) - angleFrom(b) || a.id.localeCompare(b.id));
  const totalLots = usableBlocks.reduce((sum, block) => sum + block.parcels.length, 0);
  const wedgeOf = new Map<string, string>(); // blockId → districtId
  /** 按方位扇形把 blocks 切给 order 里的城区，份额 = weight 占比（最后一个城区拿余量）。 */
  const assignWedges = (pool: CityBlock[], order: Array<{ id: string; weight: number }>) => {
    const lots = pool.reduce((sum, block) => sum + block.parcels.length, 0);
    const total = order.reduce((sum, item) => sum + item.weight, 0) || 1;
    let index = 0; let accumulated = 0; let quota = 0;
    for (const item of order) {
      quota += (item.weight / total) * lots;
      while (index < pool.length && (accumulated < quota || item === order[order.length - 1])) {
        wedgeOf.set(pool[index].id, item.id);
        accumulated += pool[index].parcels.length;
        index += 1;
      }
    }
  };
  // 开湾（Vice City 式）：东岛整岛归一个执行环境（用户：「东岛应该是单独一个执行环境的区」）。曾以核心为圆心切扇形，
  // 核心在西岛，扇形跨过海湾把东岛切成几块分给不同执行环境。选会话占比与东岛地块占比最接近的城区（排名第一的留在
  // 大陆核心）；它在东岛放不下的部分按差额在西岛再分一片，其余城区照旧按扇形分西岛。
  const riverXAt = (z: number) => {
    let best = plan.river[0]; for (const p of plan.river) if (Math.abs(p.z - z) < Math.abs(best.z - z)) best = p;
    return best.x;
  };
  const bayMode = (coastal?.bayHalfWidth ?? 0) > 0 && plan.river.length > 0 && ranked.length > 1;
  const eastBlocks = bayMode ? usableBlocks.filter((block) => block.x > riverXAt(block.z)) : [];
  const eastLots = eastBlocks.reduce((sum, block) => sum + block.parcels.length, 0);
  let eastDistrictId: string | null = null;
  if (bayMode && eastLots > 0) {
    const eastShare = eastLots / Math.max(1, totalLots);
    const eastDistrict = ranked.slice(1).reduce((best, district) =>
      Math.abs(sessionsOf.get(district.id)! / totalSessions - eastShare) < Math.abs(sessionsOf.get(best.id)! / totalSessions - eastShare) ? district : best);
    eastDistrictId = eastDistrict.id;
    for (const block of eastBlocks) wedgeOf.set(block.id, eastDistrict.id);
    const eastSet = new Set(eastBlocks.map((block) => block.id));
    const deficit = Math.max(0, sessionsOf.get(eastDistrict.id)! - eastLots * (totalSessions / Math.max(1, totalLots)));
    assignWedges(usableBlocks.filter((block) => !eastSet.has(block.id)),
      ranked.map((district) => ({ id: district.id, weight: district === eastDistrict ? deficit : sessionsOf.get(district.id)! }))
        .filter((item) => item.weight > 0));
  } else {
    assignWedges(usableBlocks, ranked.map((district) => ({ id: district.id, weight: sessionsOf.get(district.id)! })));
  }
  const blocksOf = (districtId: string) => usableBlocks.filter((block) => wedgeOf.get(block.id) === districtId);
  /** 小区中心：本片街区按离核心距离由近到远，取 30% 处——靠内但不压在核心点上（核心是市政广场）。 */
  const anchorOf = new Map<string, Vec2>();
  for (const district of ranked) {
    const own = blocksOf(district.id).sort((a, b) => Math.hypot(a.x - core.x, a.z - core.z) - Math.hypot(b.x - core.x, b.z - core.z));
    const pick = own[Math.min(own.length - 1, Math.floor(own.length * 0.3))];
    anchorOf.set(district.id, pick ? { x: pick.x, z: pick.z } : core);
    // 东岛城区从 Ocean Beach 往北长（用户定）：锚点 = 离 Ocean Drive 街墙中点最近的本区街区（花园与生长起点都在这里）。
    // 曾按「离核心 30% 处」——东岛靠海湾、靠市中心的北段先建满，南段海滩一片空地（2000 会话截图）。
    if (district.id === eastDistrictId && oceanLots.length) {
      const mid = [...oceanLots].sort((a, b) => a.z - b.z)[Math.floor(oceanLots.length / 2)];
      const inland = own.filter((block) => !block.id.startsWith("oceandrive:") && !block.id.startsWith("hotel:"))
        .sort((a, b) => Math.hypot(a.x - mid.x, a.z - mid.z) - Math.hypot(b.x - mid.x, b.z - mid.z))[0];
      if (inland) anchorOf.set(district.id, { x: inland.x, z: inland.z });
    }
  }

  // 小区中心花园：先于会话落楼，在本小区内离中心最近的空街区整块预留（只看规划与会话数，确定性不变）。
  const placementReport: NonNullable<CityLayout["placementReport"]> = [];
  const placementBudget = { limit: LAYOUT_PLACEMENT_WORK_CONFIG.terrainSampleBudget, spent: 0, remaining: LAYOUT_PLACEMENT_WORK_CONFIG.terrainSampleBudget };
  const occupiedParcels = () => parcels.filter((parcel) => used.has(parcel.id));
  // Protect a still-legal previous civic before newly arrived sessions compete
  // for addresses. Release only this reservation before placeCivics consumes it.
  const previousCivicBlocks: CityBlock[] = [];
  if (previous?.seed === seed && previous.scaleTier === tier) for (const civic of previous.civics ?? []) {
    const block = plan.blocks.find((candidate) => candidate.id === civic.parcelId);
    const envelope = civicEnvelopeSize(civic.kind, civic.width, civic.depth);
    if (!block || !envelope || !block.parcels.length || block.parcels.some((parcel) => used.has(parcel.id))) continue;
    if (!inspectLayoutPlacement({ ...layoutPlacementEnvironment(plan, occupiedParcels()), block,
      footprint: { ...civic, ...envelope } }, placementBudget).ok) continue;
    previousCivicBlocks.push(block); for (const parcel of block.parcels) used.add(parcel.id);
  }
  const gardens: GardenSite[] = [];
  for (const district of ranked) {
    const anchor = anchorOf.get(district.id)!;
    const id = `garden:${district.id}`;
    const candidates = blocksOf(district.id).filter((candidate) => candidate.parcels.length && candidate.parcels.every((parcel) => !used.has(parcel.id)))
      .sort((a, b) => Math.hypot(a.x - anchor.x, a.z - anchor.z) - Math.hypot(b.x - anchor.x, b.z - anchor.z) || a.id.localeCompare(b.id));
    let found: GardenSite | null = null, samples = 0, attempted = 0, reason = "no free real face";
    const old = previous?.seed === seed && previous.scaleTier === tier ? previous.gardens.find((garden) => garden.id === id) : null;
    const oldBlock = old && candidates.find((block) => block.id === old.blockId);
    if (old && oldBlock && old.width >= GARDEN_MINIMUM_SIZE.width && old.depth >= GARDEN_MINIMUM_SIZE.depth) {
      const evidence = inspectLayoutPlacement({ ...layoutPlacementEnvironment(plan, occupiedParcels()), block: oldBlock, footprint: old }, placementBudget);
      samples += evidence.terrainSamples; attempted += 1;
      if (evidence.ok) found = { ...old };
    }
    if (!found) for (const block of candidates) {
      const proposal = findLayoutBlockLot(block, GARDEN_MINIMUM_SIZE, plan, occupiedParcels(), placementBudget);
      samples += proposal.coverage.terrainSamples; attempted += proposal.coverage.attempted;
      if (proposal.ok) { found = { id, districtId: district.id, blockId: block.id, ...proposal.footprint,
        y: plan.terrain.height(proposal.footprint.x, proposal.footprint.z), seed: hashSeed(id) }; break; }
      reason = proposal.reason;
      if (reason === "terrain-sample-budget-exhausted" || reason === "cancelled") break;
    }
    if (found) {
      const block = candidates.find((block) => block.id === found!.blockId)!;
      for (const parcel of block.parcels) used.add(parcel.id);
      gardens.push(found);
    }
    recordLayoutPlacement(placementReport, id, "garden", !!found, reason, samples, attempted);
  }

  // 城区地标（用户：地标尽量放在城区中心、与景观湖配套）：先于会话落楼，在花园（景观湖）街区旁最近的空地块占位，
  // 城区的楼再从花园向外长。曾在落楼之后取「离锚点最近的空地块」——内圈已被会话楼占满，地标落到城区边缘。
  const districtLandmarks: DistrictLandmark[] = [];
  for (const district of ranked) {
    if (!model.buildings.some((building) => building.districtId === district.id)) continue;
    const garden = gardens.find((g) => g.districtId === district.id);
    const centre = garden ?? anchorOf.get(district.id)!;
    const candidates = plan.blocks.filter((block) => block.parcels.length && block.parcels.every((parcel) => !used.has(parcel.id)))
      .flatMap((block) => block.parcels.map((parcel) => ({ block, parcel })))
      .sort((a, b) => Math.hypot(a.parcel.x - centre.x, a.parcel.z - centre.z) - Math.hypot(b.parcel.x - centre.x, b.parcel.z - centre.z) || a.parcel.id.localeCompare(b.parcel.id));
    let placed = false, samples = 0, attempted = 0, reason = "no free real face";
    for (const { block, parcel } of candidates) {
      const evidence = inspectLayoutPlacement({ ...layoutPlacementEnvironment(plan, occupiedParcels()), block,
        footprint: { ...parcel, ...DISTRICT_LANDMARK_ENVELOPE } }, placementBudget);
      samples += evidence.terrainSamples; attempted += 1;
      if (evidence.ok) {
        // The 17m renderer skirt is larger than one session address; preserve
        // every neighbouring address by reserving its complete owning face.
        for (const address of block.parcels) used.add(address.id);
        districtLandmarks.push({ districtId: district.id, parcelId: parcel.id, x: parcel.x, z: parcel.z, yaw: parcel.yaw, y: plan.terrain.height(parcel.x, parcel.z) });
        placed = true; break;
      }
      reason = evidence.reason ?? "placement-rejected";
      if (reason === "terrain-sample-budget-exhausted" || reason === "cancelled") break;
    }
    recordLayoutPlacement(placementReport, `district-landmark:${district.id}`, "district-landmark", placed, reason, samples, attempted);
  }

  // 为商场预留整块的商业/市中心街区：会话楼现在优先占好地段，曾把这些街区都占成「部分有楼」，商场找不到整块（布局守卫）。
  // 配套仍在会话落楼之后按城区质心选址（placeCivics），落楼前锁住、选址前释放。
  const civicTotal = model.buildings.length === 0 ? 0 : Math.max(2, Math.min(30, Math.floor(model.buildings.length / CIVIC_PER_SESSIONS)));
  const mallCandidates = plan.blocks
    .filter((block) => (block.zone === "commercial" || block.zone === "downtown") && block.parcels.length > 0 && block.parcels.every((p) => !used.has(p.id)))
    .sort((a, b) => Math.hypot(a.x - core.x, a.z - core.z) - Math.hypot(b.x - core.x, b.z - core.z) || a.id.localeCompare(b.id));
  const mallReserve: CityBlock[] = [];
  if (civicTotal) for (const block of mallCandidates) {
    const proposal = findLayoutBlockLot(block, civicMinimumSize("mall")!, plan, occupiedParcels(), placementBudget);
    if (proposal.ok) mallReserve.push(block);
    else if (proposal.reason === "terrain-sample-budget-exhausted" || proposal.reason === "cancelled") break;
    if (mallReserve.length >= Math.ceil(civicTotal / 3) + 1) break;
  }
  for (const block of mallReserve) for (const parcel of block.parcels) used.add(parcel.id);

  // 落楼：每个执行环境在自己的小区里按 (startedAt, −height, id) 从花园向外取地块——回放时看得见小区从中心长出来。
  // 小区装满（会话数相对配额偏多）才溢出到小区外最近的空地块；全城都满才进背景楼群。
  // 已落位的会话保留地址（见上方 previous），刷新不搬家。
  const pending = model.buildings.filter((building) => !assigned.has(building.id));
  const massing: CityLayout["massing"] = [];
  for (const district of ranked) {
    const anchor = anchorOf.get(district.id)!;
    const buildings = pending
      .filter((building) => building.districtId === district.id)
      .sort((a, b) => a.startedAt - b.startedAt || b.height - a.height || a.id.localeCompare(b.id));
    if (!buildings.length) continue;
    // 距花园排序 + 小于一个地块间距（~7）的哈希抖动：既不排成机械同心环，又保住
    // 「越新的会话越靠外」的回放生长波前（曾用 ±30 抖动——远大于地块间距，约
    // 五分之一的楼会落在当前前沿之内，回放叙事读起来像乱序）。
    // 区内优先占用「好地段」：downtown/商业/海滨/酒店地块的距离分减 60/40/45（实测 97% 的楼落在住宅区——花园锚点远离核心与主干道，
    // 按纯距离生长永远够不着它们）。仍以花园为中心向外长，只是好地段先被填上。
    const ZONE_BONUS: Record<string, number> = { downtown: 60, commercial: 40, waterfront: 45 };
    const hotelReady = buildings.length >= 20; // 小城市（守卫：3 个会话的城不出酒店）不享受酒店加分
    const score = (p: Parcel) => Math.hypot(p.x - anchor.x, p.z - anchor.z) - (p.blockId.startsWith("hotel:") ? (hotelReady ? 220 : 0) : ZONE_BONUS[p.zone] ?? 0) + hashSeed(p.id) * 6;
    // 海滨酒店地块是全城共享的度假用地：任何城区都可落楼（曾只在楔形扇区内取地，酒店地块不属于任何扇区，冠一顶都没有）。
    // 每块酒店地块归离它最近的城区（锚点距离），并给 220 的落位加分——酒店离花园锚点上百单位，按距离生长永远轮不到（实测 0 顶冠）。
    const nearestDistrict = (b: CityBlock) => [...anchorOf].sort((x, y) => Math.hypot(x[1].x - b.x, x[1].z - b.z) - Math.hypot(y[1].x - b.x, y[1].z - b.z))[0]?.[0];
    const inside = [...blocksOf(district.id), ...(buildings.length >= 20 ? hotelBlocks.filter((b) => nearestDistrict(b) === district.id) : [])].flatMap((block) => block.parcels).filter((parcel) => !used.has(parcel.id)).sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id));
    const overflow: typeof buildings = [];
    let cursor = 0;
    for (const building of buildings) {
      while (cursor < inside.length && used.has(inside[cursor].id)) cursor += 1;
      let parcel: Parcel | undefined = inside[cursor];
      // C-1 近岸高度梯度：楼高 > 26 的会话楼不占海滨地块，让给低层（迈阿密剖面：低层临水、塔楼退后）。楼高仍由 token 决定，只换位置。
      if (parcel && building.height > 26 && parcel.zone === "waterfront") {
        const inland = inside.find((p, k) => k > cursor && !used.has(p.id) && p.zone !== "waterfront");
        if (inland) { used.add(inland.id); assigned.set(building.id, inland); continue; }
      }
      if (parcel) cursor += 1;
      else parcel = parcels.filter((candidate) => !used.has(candidate.id)).sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id))[0];
      if (!parcel) { overflow.push(building); continue; }
      assigned.set(building.id, parcel);
      used.add(parcel.id);
    }
    if (overflow.length) massing.push(...aggregateOverflow(district.id, anchor, overflow, parcels, plan));
  }
  for (const block of mallReserve) for (const parcel of block.parcels) used.delete(parcel.id);
  for (const block of previousCivicBlocks) for (const parcel of block.parcels) used.delete(parcel.id);
  const civics = placeCivics(model, parcels, used, assigned, previous ?? null, plan, placementReport, placementBudget);
  // 海滨迈阿密是一个已经建成的城市，即使当前窗口只有少量会话也不应退化成
  // 空白规划图。背景楼只从空置地块取址，避开数据楼/整块花园/市政设施/高架
  // /酒店海滨保留带；优先填充会话城区周围，再向城市核心扩散，不加入会话统计。
  const contextBuildings: ContextBuilding[] = [];
  if (coastal?.profile === "miami-coastal" && backdrop !== "off") {
    const full = backdrop === "full";
    const reserved = new Set([...used, ...civics.map((civic) => civic.parcelId)]);
    const coreRadius = plan.islandRadius;
    const sessionSlots = [...assigned.values()];
    const candidates = plan.blocks
      .flatMap((block) => block.parcels)
      .filter((parcel) => {
        const radius = Math.hypot(parcel.x - core.x, parcel.z - core.z);
        return !reserved.has(parcel.id)
          && radius <= coreRadius * 0.94
          && plan.terrain.buildable(parcel.x, parcel.z)
          && plan.terrain.slope(parcel.x, parcel.z) < 0.55
          && clearsHighways(parcel, parcel.width * 0.84, parcel.depth * 0.84, plan.highways)
          && (!plan.seaside || !seasideStripContains(plan.seaside, parcel, 2));
      })
      .map((parcel) => {
        let sessionDistance = Infinity;
        for (const slot of sessionSlots) sessionDistance = Math.min(sessionDistance, Math.hypot(parcel.x - slot.x, parcel.z - slot.z));
        const coreDistance = Math.hypot(parcel.x - core.x, parcel.z - core.z);
        const jitter = hashSeed(`vice-context-rank:${seed}:${parcel.id}`) * 14;
        // full：VICE 原排序（贴近会话楼优先）。auto：离会话楼越远越先、仍偏向核心——
        // 城区之间与城区边缘留给数据（真机截图：背景楼贴着城区外缘，host 分区读不出来）。
        const rank = full
          ? Math.min(sessionDistance, coreDistance * 0.85) + jitter
          : coreDistance * 0.6 - Math.min(sessionDistance, 240) * 0.8 + jitter;
        return { parcel, rank, sessionDistance };
      })
      .filter((candidate) => full || candidate.sessionDistance >= BACKDROP_KEEP_OUT)
      .sort((a, b) => a.rank - b.rank || a.parcel.id.localeCompare(b.parcel.id));
    const cap = Math.min(280, 224 + (tier - 1) * 24);
    // auto：楼量随数据（3 个会话不该是一座 200 栋的城——真机/无头照片实测）。
    const target = full ? cap : Math.min(cap, Math.round(model.buildings.length * BACKDROP_PER_SESSION));
    const selected: typeof candidates = [];
    for (const candidate of candidates) {
      if (selected.length >= target) break; // target 可为 0（auto 下极少会话）
      const parcel = candidate.parcel;
      const buildingSeed = hashSeed(`vice-context:${seed}:${parcel.id}`);
      // Background facades were needle-thin at aerial scale because they used
      // only 76–88% of a 7.2-unit frontage. Give towers a wider street-facing
      // podium while keeping their depth close to the parcel footprint.
      const width = parcel.width * (1.16 + buildingSeed * 0.24);
      const depth = parcel.depth * (0.9 + buildingSeed * 0.14);
      const clearanceRadius = Math.hypot(width, depth) / 2 + 1;
      const halfDiagonal = Math.hypot(width, depth) / 2;
      if (sessionSlots.some((slot) => Math.hypot(slot.x - parcel.x, slot.z - parcel.z) < halfDiagonal + Math.hypot(slot.width, slot.depth) / 2 + 2)) continue;
      if (civics.some((site) => Math.hypot(site.x - parcel.x, site.z - parcel.z) < halfDiagonal + Math.hypot(site.width, site.depth) / 2 + 2)) continue;
      if (plan.roadEdges.some((edge) => {
        const nearest = closestPolylineSegment(edge.points, parcel);
        return !nearest || nearest.d < halfDiagonal + edge.width / 2 + 0.5;
      })) continue;
      if (selected.some((other) => {
        const otherSeed = hashSeed(`vice-context:${seed}:${other.parcel.id}`);
        const otherWidth = other.parcel.width * (1.16 + otherSeed * 0.24);
        const otherDepth = other.parcel.depth * (0.9 + otherSeed * 0.14);
        const otherRadius = Math.hypot(otherWidth, otherDepth) / 2 + 1;
        return Math.hypot(other.parcel.x - parcel.x, other.parcel.z - parcel.z) < clearanceRadius + otherRadius;
      })) continue;
      selected.push(candidate);
      contextBuildings.push({
        id: `context:${parcel.id}`, x: parcel.x, z: parcel.z,
        y: Math.max(0.3, plan.terrain.height(parcel.x, parcel.z)), yaw: parcel.yaw,
        width,
        depth,
        height: parcel.zone === "downtown" ? 38 + buildingSeed * 34
          : parcel.zone === "commercial" ? 20 + buildingSeed * 28
            : parcel.zone === "waterfront" ? 16 + buildingSeed * 20
              : 8 + buildingSeed * 14,
        seed: buildingSeed, zone: parcel.zone, appearAt: 0,
      });
      if (selected.length >= target) break;
    }
  }
  // 会话没占用的街墙地块补背景 Art Deco 酒店（2–6 层）：街墙始终连续，会话越多真实数据占比越高。
  const civicParcels = new Set(civics.map((civic) => civic.parcelId));
  const oceanDrive = oceanLots.filter((lot) => !used.has(`${lot.id}/0`) && !civicParcels.has(`${lot.id}/0`) && !civicParcels.has(`oceandrive:${lot.id}`));
  {
    // 数据窗口缺省（测试夹具/旧调用方）时退回会话起始时刻的范围，绝不产出 NaN。
    const starts = model.buildings.map((building) => building.startedAt).filter(Number.isFinite);
    const windowStart = Number.isFinite(model.windowStartMs) ? model.windowStartMs : (starts.length ? Math.min(...starts) : 0);
    const windowEnd = Number.isFinite(model.windowEndMs) ? model.windowEndMs : (starts.length ? Math.max(...starts) : windowStart);
    const span = Math.max(0, windowEnd - windowStart);
    contextBuildings.forEach((building, index) => {
      building.appearAt = windowStart + ((index + 0.5) / contextBuildings.length) * span * 0.85;
    });
  }
  // 地价场（S5，参照 Lechner 等的用地价值）：城区中心 50%、城市核心 20%、临主干道 15%、临海 15%。
  const primaryRoads = plan.roadEdges.filter((edge) => edge.width >= 12 && !edge.bridge);
  const landValueAt = (p: Vec2, anchor: Vec2) => {
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const centre = 1 - clamp(Math.hypot(p.x - anchor.x, p.z - anchor.z) / 180);
    const coreness = 1 - clamp(Math.hypot(p.x - core.x, p.z - core.z) / (plan.islandRadius * 0.8));
    let road = Infinity;
    for (const edge of primaryRoads) {
      const nearest = closestPolylineSegment(edge.points, p);
      if (nearest) road = Math.min(road, nearest.d);
    }
    const shore = polygonDistance(p, plan.coast);
    return clamp(0.5 * centre + 0.2 * coreness + 0.15 * (road < 30 ? 1 - road / 30 : 0) + 0.15 * (shore < 120 ? 1 - shore / 120 : 0));
  };

  const districts = model.districts.map((district, districtIndex): DistrictLayout => {
    const buildings = model.buildings.filter((building) => building.districtId === district.id && assigned.has(building.id));
    const slots = new Map(buildings.map((building) => [building.id, assigned.get(building.id)!]));
    const points = [...slots.values()];
    const center = points.length ? { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, z: points.reduce((sum, p) => sum + p.z, 0) / points.length } : { x: 0, z: 0 };
    const marker = points[0] ?? { x: -160, z: -100 };
    // Finding 信标与区标签落在公共开放空间（市政广场/公园优先），不挂楼顶。
    const plazaSite = plan.publicSites
      .filter((site) => site.kind === "civic" || site.kind === "park" || site.kind === "station")
      .sort((a, b) => Math.hypot(a.x - center.x, a.z - center.z) - Math.hypot(b.x - center.x, b.z - center.z))[0];
    const plaza = plazaSite ? { x: plazaSite.x, z: plazaSite.z, y: Math.max(0.4, plan.terrain.height(plazaSite.x, plazaSite.z)) } : { ...marker, y: 3 };
    return {
      id: district.id, label: district.label, center, radius: Math.max(30, ...points.map((p) => Math.hypot(p.x - center.x, p.z - center.z))),
      terrain: plan!.terrain, slots, grounds: new Map(points.map((p, i) => [buildings[i].id, plan!.terrain.height(p.x, p.z)])),
      roads: [], carPaths: districtIndex === 0 ? plan!.carPaths : [],
      river: plan!.river, riverHalfWidth: 18, trees: [], plaza,
      anomaly: district.anomaly ? { severity: district.anomaly.severity, count: district.anomaly.count } : null,
      sessionCount: district.sessionCount,
      landValue: new Map(buildings.map((building) => [building.id, landValueAt(assigned.get(building.id)!, anchorOf.get(district.id) ?? core)])),
    };
  });
  // 海岸外扩航道：把海岸折线径向外推成闭环，船沿海岸线巡航。
  const centroid = coastCentroid(plan.coast);
  const boatLoops = [1.24, 1.36, 1.5].map((factor, lane) => {
    const loop = plan.coast.map((point) => ({ x: centroid.x + (point.x - centroid.x) * factor, z: centroid.z + (point.z - centroid.z) * factor }));
    return [...loop, loop[0]];
  });
  // 两侧海域的装饰远山（低模剪影，构成海平线层次）。
  const seaMountains = [
    { center: { x: centroid.x + 980, z: centroid.z - 320 }, radius: 120, height: 88, seed: 71 },
    { center: { x: centroid.x - 1020, z: centroid.z + 260 }, radius: 150, height: 108, seed: 37 },
  ];
  const grown = growWithBuildings(plan, used, districts, civics, hotelBlocks.flatMap(block => block.parcels));
  // 生长剪枝（G1）会删掉空置街区的支路：计划层的回车点若所在路已被删，就不再画回车圈。
  // 只保留最终路网里仍是度 1 非桥路端的点（与 classifyEndpoints 的度口径一致）。
  const liveDegree = new Map<string, number>();
  for (const edge of grown.roadEdges) if (!edge.bridge) for (const id of [edge.from, edge.to]) liveDegree.set(id, (liveDegree.get(id) ?? 0) + 1);
  const culDeSacEnds = (plan.culDeSacEnds ?? []).filter((end) => liveDegree.get(`${end.x}:${end.z}`) === 1);
  const sessionCapacity = measureLayoutCapacity({ parcelIds: parcels.map(parcel => parcel.id), usedParcelIds: [...used],
    sessionIds: model.buildings.map(building => building.id), assignments: [...assigned].map(([id, parcel]) => [id, parcel.id] as const),
    aggregatedSessionCount: massing.reduce((sum, block) => sum + block.count, 0) });
  return { ...plan, ...grown, landmarks: [...plan.landmarks, ...isletVillas(plan)], culDeSacEnds, districtLandmarks, districts, seed, massing, civics, gardens, placementReport, placementBudget, sessionCapacity, boatLanes: [], decorMountains: [], boatLoops, seaMountains, coastalConfigKey: coastalKey, coastalConfig: coastal, contextBuildings, oceanDrive };
}

/**
 * G1「街区随建成量生长」（docs/CITY_SENSE_REVIEW.md）：街网只铺到已有楼的街区，
 * 其余街区是自然绿地、服务它们的支路与次干道不修。真机多视角评估：30 天 ~380 栋楼却铺满整岛街网，
 * 七成街区是空地块，像一张分地图而不是城市。主干道、环线、环岛/河岸路、桥照旧（城市骨架先行）。
 * 连通：去掉支路后若某个仍有活动的分量与主网断开，就按 BFS 把被去掉的边一圈圈加回来直到连上；
 * 完全无活动的碎片分量整段删掉。车流只保留仍沿真实路段走的回路。
 */
function growWithBuildings(plan: ReturnType<typeof createCityPlan>, used: Set<string>, districts: DistrictLayout[], civics: CivicSite[], auxiliaryParcels: readonly Parcel[] = []) {
  // 配套（学校/商场/医院）占的整街区也算已建：曾不算，周围街道被生长剪枝删掉，医院门前没有路（真机截图）。
  const civicBlocks = new Set(civics.map((c) => c.parcelId));
  const active = plan.blocks.filter((block) => civicBlocks.has(block.id) || block.parcels.some((parcel) => used.has(parcel.id)));
  // 只有已落楼（会话楼/配套/小花园）的街区算建成；下一栋楼来时它所在街区才铺开（布局每次随数据重算）。
  // 曾留一圈 75 的预留：几乎罩住全部街区，街网照旧铺满（截图验收没看到变化）。
  const live = new Set(active.map((block) => block.id));
  const blocks = plan.blocks.map((block) => (live.has(block.id) ? block : { ...block, vacant: true }));
  const anchors: Array<{ x: number; z: number; r: number }> = [
    ...active.map((block) => ({ x: block.x, z: block.z, r: Math.hypot(block.width, block.depth) / 2 + 4 })),
    ...[...plan.publicSites, ...(plan.landmarks ?? [])].filter((site) => site.radius).map((site) => ({ x: site.x, z: site.z, r: site.radius + 16 })),
    ...seasideHotelLots(plan.seaside).map((lot) => ({ x: lot.x, z: lot.z, r: 26 })),
  ];
  const serves = (edge: RoadEdge) => {
    return edge.points.slice(1).some((b, index) => {
      const a = edge.points[index];
      const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      return anchors.some((anchor) => Math.hypot(anchor.x - m.x, anchor.z - m.z) < anchor.r);
    });
  };
  // 骨架（宽 12、桥）永远保留；宽 ≤8 的街道只在服务活动区时保留。
  const selection = new Set(plan.roadEdges.filter((edge) => edge.bridge || edge.width >= 12 || serves(edge)).map((edge) => edge.id));
  // Retain the exact accepted frontage host and its proved route, not a new
  // nearest-road approximation after display pruning.
  const serviceSelection = new Set(selection);
  const edgeById = new Map(plan.roadEdges.map((edge) => [edge.id, edge]));
  const unresolvedParcelFrontage: string[] = [];
  const unsupportedAuxiliaryFrontage = auxiliaryParcels.filter(parcel => used.has(parcel.id)).map(parcel => parcel.id).sort();
  for (const block of active) for (const parcel of block.parcels) {
    if (!civicBlocks.has(block.id) && !used.has(parcel.id)) continue;
    const proof = parcel.frontage;
    if (!proof) {
      if (plan.parcelSource === "accepted-road-faces") unresolvedParcelFrontage.push(parcel.id);
      continue;
    }
    const validation = validateParcelFrontage(proof, parcel, block, edgeById, plan.derivedNetworkVersion, plan.primaryAnchorNodeId);
    if (!validation.ok) { unresolvedParcelFrontage.push(parcel.id); continue; }
    serviceSelection.add(proof.hostEdgeId);
    for (const id of proof.primaryEdgePath) serviceSelection.add(id);
  }
  const landings = retainBridgeLandings(plan.roadEdges, serviceSelection);
  const selected = landings.selected;
  const required = [
    ...plan.roadEdges.filter((edge) => selected.has(edge.id)).flatMap((edge) => [edge.from, edge.to]),
    ...[...plan.publicSites, ...(plan.landmarks ?? [])].flatMap((site) => site.access ? [site.access.nodeId] : []),
  ];
  const retention = preserveDemandPaths(plan.roadEdges, selected, plan.primaryAnchorNodeId, required);
  const terminals = new Set((diagnoseNetwork(plan)?.endpoints ?? []).filter((end) => end.role.kind !== "must-connect").map((end) => end.node));
  const closure = preserveDisplayJunctions(plan.roadEdges, retention.keep, terminals);
  const keep = closure.keep;
  const roadEdges = plan.roadEdges.filter((edge) => keep.has(edge.id));
  const nodeIds = new Set(roadEdges.flatMap((edge) => [edge.from, edge.to]));
  const roadNodes = plan.roadNodes.filter((node) => nodeIds.has(node.id));
  const pairs = new Set(roadEdges.flatMap((edge) => edge.points.slice(1).map((point, i) =>
    [`${edge.points[i].x}:${edge.points[i].z}`, `${point.x}:${point.z}`].sort().join("/"))));
  for (const district of districts) {
    district.carPaths = district.carPaths.filter((route) => route.every((p, i) => i === 0 || pairs.has([`${route[i - 1].x}:${route[i - 1].z}`, `${p.x}:${p.z}`].sort().join("/"))));
  }
  const displayReasons = [
    ...(unresolvedParcelFrontage.length ? ["occupied parcel frontage evidence missing or stale"] : []),
    ...(unsupportedAuxiliaryFrontage.length ? ["occupied auxiliary hotel parcels have no declared frontage proof"] : []),
    ...(retention.unresolved.length ? ["required display paths unresolved"] : []),
    ...(closure.unresolved.length ? ["display pruning exposes unresolved required endpoints"] : []),
    ...(retention.anchorMissing ? ["display primary anchor missing"] : []),
    ...(landings.missing.length ? ["accepted bridge ground landings missing"] : []),
  ];
  const displayOutcome: NonNullable<CityLayout["displayOutcome"]> = {
    status: displayReasons.length ? "failed" : "partial",
    reasons: [...displayReasons, "display topology checks do not certify model physics or visual readiness"],
  };
  return { blocks, roadEdges, roadNodes, displayOutcome, retentionReport: { restored: [...keep].filter((id) => !selection.has(id)).sort(), unresolved: retention.unresolved, unresolvedParcelFrontage: unresolvedParcelFrontage.sort(), unsupportedAuxiliaryFrontage, unresolvedPruningEnds: closure.unresolved, anchorMissing: retention.anchorMissing, missingBridgeLandings: landings.missing }, activityKey: [...live].sort().join(",") + "|" + districts.map((d) => `${d.id}:${d.sessionCount}:${d.anomaly?.severity ?? ""}`).join(",") }; // 会话数→地标/城区旗，异常→市政厅信标
}

/** 配套选址：会话楼先占地，配套只拿剩下的地块（绝不挤走会话）。
 *  第 i 座配套属于「第 i 座落成时会话最多的城区」之外按会话数加权轮转的城区，落在该城区楼群外缘
 *  最近的空地块上，彼此至少隔 60。上一版布局里已有的配套若地块仍空着就原地保留（刷新不搬家）。 */
type SitePlacementEnvironment = Pick<CityLayout, "roadEdges" | "publicSites" | "landmarks" | "highways" | "terrain">;
function layoutPlacementEnvironment(plan: SitePlacementEnvironment, occupied: readonly Parcel[]): Omit<BlockPlacementInput, "block" | "footprint"> {
  return { roads: plan.roadEdges, sites: [...plan.publicSites, ...plan.landmarks.filter((site) => site.radius),
    ...occupied.map((parcel) => ({ x: parcel.x, z: parcel.z, radius: Math.hypot(parcel.width, parcel.depth) / 2 }))],
    highways: plan.highways, buildable: plan.terrain.buildable };
}

/** Generator/editor boundary: callers supply the renderer envelope and its real
 * host face, not a bounding-box surrogate. Occupancy excludes the moving owner.
 * This is sampled geometry admission, not full model/entrance certification. */
export type SitePlacementFootprint = BlockPlacementInput["footprint"] & { blockId: string };
export function checkSitePlacement(layout: CityLayout, footprint: SitePlacementFootprint, occupied: readonly Parcel[],
  options: Pick<BlockPlacementInput, "terrainSampleBudget" | "cancelled"> = {}): BlockPlacementResult {
  const hosts = layout.blocks.filter(block => block.id === footprint.blockId);
  // Missing/ambiguous identities fail closed; never guess a nearby or larger face.
  if (hosts.length !== 1) return { ok: false, reason: hosts.length ? "ambiguous-host-block" : "unknown-host-block",
    polygon: [], terrainSamples: 0, scope: "sampled-rectangle-and-declared-circle-proxies", terrainCoverage: "at-most-one-unit-grid" };
  return inspectBlockPlacement({ ...layoutPlacementEnvironment(layout, occupied), block: hosts[0], footprint,
    cancelled: options.cancelled, terrainSampleBudget: options.terrainSampleBudget ?? LAYOUT_PLACEMENT_WORK_CONFIG.terrainSampleBudget });
}

type LayoutPlacementBudget = { limit: number; spent: number; remaining: number };
function inspectLayoutPlacement(input: BlockPlacementInput, budget: LayoutPlacementBudget) {
  const evidence = inspectBlockPlacement({ ...input, terrainSampleBudget: budget.remaining });
  budget.spent += evidence.terrainSamples; budget.remaining -= evidence.terrainSamples;
  return evidence;
}
function findLayoutBlockLot(block: CityBlock, minimumSize: { width: number; depth: number },
  plan: ReturnType<typeof createCityPlan>, occupied: readonly Parcel[], budget: LayoutPlacementBudget) {
  const proposal = findBlockLotCandidate({ block, environment: { ...layoutPlacementEnvironment(plan, occupied), terrainSampleBudget: budget.remaining }, minimumSize, candidateLimit: 30 });
  budget.spent += proposal.coverage.terrainSamples; budget.remaining -= proposal.coverage.terrainSamples;
  return proposal;
}

function recordLayoutPlacement(report: NonNullable<CityLayout["placementReport"]>, id: string,
  kind: "garden" | "district-landmark" | "civic", placed: boolean, reason: string, terrainSamples: number, attempted: number): void {
  report.push({ id, class: kind, status: placed ? "placed" : reason.includes("budget") || reason === "cancelled" ? "budget-exhausted"
    : reason.includes("unsupported") || reason.includes("invalid") ? "unsupported" : "candidate-exhausted",
    ...(!placed ? { reason } : {}), terrainSamples, attempted, scope: "sampled-rectangle-and-declared-circle-proxies" });
}

function orientCivicPlacement(plan: ReturnType<typeof createCityPlan>, block: CityBlock,
  footprint: { x: number; z: number; yaw: number; width: number; depth: number }, kind: string,
  occupied: readonly Parcel[], budget: LayoutPlacementBudget) {
  const minimum = civicMinimumSize(kind), before = budget.spent;
  let attempted = 0, reason = "no valid renderer orientation", best = Infinity;
  let chosen: typeof footprint | null = null;
  if (!minimum) return { footprint: null, attempted, terrainSamples: 0, reason: "unsupported renderer envelope" };
  const roadGap = (q: Vec2) => Math.min(...plan.roadEdges.filter((edge) => !edge.bridge).flatMap((edge) => edge.points.slice(1).map((b, i) => {
    const a = edge.points[i], dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(q.x - a.x - dx * t, q.z - a.z - dz * t) - edge.width / 2;
  })));
  for (let k = 0; k < 4; k++) {
    const yaw = footprint.yaw + k * Math.PI / 2;
    const width = k % 2 ? footprint.depth : footprint.width, depth = k % 2 ? footprint.width : footprint.depth;
    if (width < minimum.width || depth < minimum.depth) continue;
    const envelope = civicEnvelopeSize(kind, width, depth)!;
    const candidate = { x: footprint.x, z: footprint.z, yaw, width, depth };
    const evidence = inspectLayoutPlacement({ ...layoutPlacementEnvironment(plan, occupied), block,
      footprint: { ...candidate, ...envelope } }, budget);
    attempted += 1;
    if (!evidence.ok) {
      reason = evidence.reason ?? "orientation rejected";
      if (reason === "terrain-sample-budget-exhausted" || reason === "cancelled") return { footprint: null, attempted, terrainSamples: budget.spent - before, reason };
      continue;
    }
    const gap = roadGap({ x: candidate.x + Math.sin(yaw) * (depth / 2 + 8), z: candidate.z + Math.cos(yaw) * (depth / 2 + 8) });
    if (gap < best) { best = gap; chosen = candidate; }
  }
  return { footprint: chosen, attempted, terrainSamples: budget.spent - before, reason };
}

function placeCivics(model: CityModel, parcels: Parcel[], used: Set<string>, assigned: Map<string, Parcel>, previous: CityLayout | null,
  plan: ReturnType<typeof createCityPlan>, placementReport: NonNullable<CityLayout["placementReport"]>, placementBudget: LayoutPlacementBudget): CivicSite[] {
  const total = model.buildings.length;
  const count = total === 0 ? 0 : Math.max(2, Math.min(30, Math.floor(total / CIVIC_PER_SESSIONS)));
  if (!count) return [];
  const times = model.buildings.map((building) => building.startedAt).sort((a, b) => a - b);
  // 城区会话数 → 配额（最大余数法），保证多会话的城区配套多。
  const weights = model.districts.map((district) => ({ id: district.id, n: model.buildings.filter((b) => b.districtId === district.id).length })).filter((d) => d.n > 0);
  const sum = weights.reduce((acc, d) => acc + d.n, 0) || 1;
  const quota = weights.map((d) => ({ id: d.id, exact: (d.n / sum) * count, take: Math.floor((d.n / sum) * count) }));
  let left = count - quota.reduce((acc, q) => acc + q.take, 0);
  [...quota].sort((a, b) => (b.exact - b.take) - (a.exact - a.take) || (a.id < b.id ? -1 : 1)).forEach((q) => { if (left > 0) { q.take += 1; left -= 1; } });
  // 轮转顺序：按配额从多到少交错，第 i 座的落成时刻按全城规模走。
  const sequence: string[] = [];
  for (let round = 0; sequence.length < count; round += 1) {
    for (const q of [...quota].sort((a, b) => b.take - a.take || (a.id < b.id ? -1 : 1))) if (round < q.take) sequence.push(q.id);
  }
  // 单个地块只有约 7×8，放不下学校/商场：配套占整个空街区（街区里没有任何会话楼）。
  type Lot = { id: string; x: number; z: number; yaw: number; width: number; depth: number; zone: Zone; block: CityBlock };
  const freeBlocks = plan.blocks.filter((block) => block.parcels.length > 0 && block.parcels.every((parcel) => !used.has(parcel.id)));
  const environment = () => layoutPlacementEnvironment(plan, parcels.filter((parcel) => used.has(parcel.id)));
  const taken = new Set<string>();
  const out: CivicSite[] = [];
  const old = new Map((previous?.civics ?? []).map((civic) => [civic.id, civic]));
  // 第一遍：先为所有仍能原地保留的配套占住原街区，否则编号更小的新配套会先抢走它（刷新不搬家）。
  const reservedFor = new Map<string, string>(); // blockId → civic id
  sequence.forEach((_, index) => {
    const keep = old.get(`civic:${index}`);
    const block = keep && freeBlocks.find((block) => block.id === keep.parcelId);
    const envelope = keep && civicEnvelopeSize(keep.kind, keep.width, keep.depth);
    if (keep && block && envelope && inspectLayoutPlacement({ ...environment(), block, footprint: { ...keep, ...envelope } }, placementBudget).ok) reservedFor.set(keep.parcelId, `civic:${index}`);
  });
  sequence.forEach((districtId, index) => {
    const id = `civic:${index}`;
    const kind = CIVIC_ORDER[index % CIVIC_ORDER.length];
    const unlockAt = times[Math.min(times.length - 1, (index + 1) * CIVIC_PER_SESSIONS - 1)] ?? times[times.length - 1];
    const keep = old.get(id);
    let samples = 0, attempted = 0, reason = "no legal unoccupied real face";
    const minimumSize = civicMinimumSize(kind);
    if (!minimumSize) { recordLayoutPlacement(placementReport, id, "civic", false, "unsupported renderer envelope", 0, 0); return; }
    let parcel: Lot | undefined;
    let oriented: { x: number; z: number; yaw: number; width: number; depth: number } | null = null;
    const oldBlock = keep && reservedFor.get(keep.parcelId) === id ? freeBlocks.find((block) => block.id === keep.parcelId && !taken.has(block.id)) : undefined;
    const oldEnvelope = keep && civicEnvelopeSize(keep.kind, keep.width, keep.depth);
    if (keep && oldBlock && oldEnvelope && keep.kind === kind) {
      const evidence = inspectLayoutPlacement({ ...environment(), block: oldBlock, footprint: { ...keep, ...oldEnvelope } }, placementBudget);
      samples += evidence.terrainSamples; attempted += 1;
      if (evidence.ok) {
        taken.add(oldBlock.id); for (const address of oldBlock.parcels) used.add(address.id);
        out.push({ ...keep, unlockAt });
        recordLayoutPlacement(placementReport, id, "civic", true, "retained actual prior renderer footprint", samples, attempted); return;
      }
      reason = `prior footprint cannot be retained: ${evidence.reason}`;
    }
    // 已有配套原地保留时连同它原来的城区一起保留：总数一变，轮转里「第 i 座属于哪个城区」会变，
    // 曾因此让 civic:7 换了城区、搬去新城区找地（刷新不搬家契约被打破）。
    const owner = districtId;
    if (!parcel) {
      const own = model.buildings.filter((b) => b.districtId === districtId).map((b) => assigned.get(b.id)).filter((p): p is Parcel => !!p);
      if (!own.length) { recordLayoutPlacement(placementReport, id, "civic", false, "no assigned session anchors", samples, attempted); return; }
      const cx = own.reduce((acc, p) => acc + p.x, 0) / own.length;
      const cz = own.reduce((acc, p) => acc + p.z, 0) / own.length;
      // 按服务半径铺开（SPEC §4.4）：离已有配套越远越好（封顶 150），同时不要离本城区中心太远；
      // 学校偏居住区、商场偏商业/市中心、医院偏市中心与商业区。曾只取「离城区质心最近的空街区」，
      // 配套全挤在城区中心，一座岛上五座学校互相挨着。
      const preferred: Record<CivicKind, Zone[]> = { school: ["residential"], mall: ["downtown", "commercial", "waterfront"], hospital: ["downtown", "commercial", "residential"] };
      const rankedBlocks = freeBlocks.filter((block) => !taken.has(block.id) && (!reservedFor.has(block.id) || reservedFor.get(block.id) === id))
        .map((block) => {
          const nearestCivic = Math.min(150, ...out.map((c) => Math.hypot(c.x - block.x, c.z - block.z)));
          const rank = preferred[kind].indexOf(block.zone), zonePenalty = rank < 0 ? 60 : rank * 15;
          return { block, score: Math.hypot(block.x - cx, block.z - cz) * 0.35 - nearestCivic * 0.7 + zonePenalty + hashSeed(`${id}:${block.id}`) * 10 };
        }).sort((a, b) => a.score - b.score || a.block.id.localeCompare(b.block.id));
      for (const { block } of rankedBlocks) {
        const proposal = findLayoutBlockLot(block, minimumSize, plan, parcels.filter((parcel) => used.has(parcel.id)), placementBudget);
        samples += proposal.coverage.terrainSamples; attempted += proposal.coverage.attempted;
        if (proposal.ok && out.every((c) => Math.hypot(c.x - proposal.footprint.x, c.z - proposal.footprint.z) >= 60)) {
          const orientation = orientCivicPlacement(plan, block, proposal.footprint, kind, parcels.filter((parcel) => used.has(parcel.id)), placementBudget);
          samples += orientation.terrainSamples; attempted += orientation.attempted;
          if (orientation.footprint) { parcel = { id: block.id, block, zone: block.zone, ...proposal.footprint }; oriented = orientation.footprint; break; }
          reason = orientation.reason;
          if (reason === "terrain-sample-budget-exhausted" || reason === "cancelled") break;
        }
        else { reason = proposal.ok ? "civic spacing below 60" : proposal.reason; if (reason === "terrain-sample-budget-exhausted" || reason === "cancelled") break; }
      }
    }
    if (!parcel || !oriented) { recordLayoutPlacement(placementReport, id, "civic", false, reason, samples, attempted); return; }
    // 大门朝路（用户：医院门前没有路）：在街区朝向的四个方向里，选正门（局部 +z）外 8 处离道路最近的那个。
    taken.add(parcel.id); for (const address of parcel.block.parcels) used.add(address.id);
    out.push({ id, kind, districtId: owner, parcelId: parcel.id, ...oriented, y: plan.terrain.height(oriented.x, oriented.z), unlockAt });
    recordLayoutPlacement(placementReport, id, "civic", true, "accepted renderer rectangle", samples, attempted);
  });
  return out;
}

/** 豪宅岛（Vice City 的 Starfish Island 母题）：湾心小岛的场地层（环路/支路/棕榈）+ 一圈海湾豪宅 + 北侧大宅，
 *  位置全由 cityIsletEstate.isletEstate 算（渲染场地层用同一个函数，棕榈天然避开住宅）。布局期装饰：规划层只认得
 *  贴岛北缘穿过的那段堤道，不进规划基线、不占地块、不接路。离任何桥 < 20 的住宅不放（兜底：堤道被别的桥取代时）。 */
function isletVillas(plan: { islets?: Array<Vec2 & { radius: number; kind?: string; side?: 1 | -1 }>; bridges: BridgeLayout[] }): Landmark[] {
  const out: Landmark[] = [];
  for (const [index, islet] of (plan.islets ?? []).entries()) {
    const id = `landmark:islet-grounds:${index}`;
    // Leaf Links：3 号堤道从岛南部穿过（geography 把中心放在堤道以北 0.2R）；Prawn：引道从岛心往东。只画场地层。
    if (islet.kind === "leaf-links") { out.push({ id, kind: "islet-grounds", variant: "golf", x: islet.x, z: islet.z, yaw: 0, radius: 0, reach: islet.radius, roadZ: 0.2 * islet.radius }); continue; }
    // Prawn 的场地按「引道朝局部 +x」布置；贴西岸（side −1、短桥接大陆）时整组转 180°。
    if (islet.kind === "prawn") { out.push({ id, kind: "islet-grounds", variant: "studio", x: islet.x, z: islet.z, yaw: (islet.side ?? 1) < 0 ? Math.PI : 0, radius: 0, reach: islet.radius }); continue; }
    out.push({ id, kind: "islet-grounds", x: islet.x, z: islet.z, yaw: 0, radius: 0, reach: islet.radius });
    const estate = isletEstate(islet.radius, Math.floor(hashSeed(id) * 0x7fffffff));
    estate.houses.forEach((house, k) => {
      const at = { x: islet.x + house.x, z: islet.z + house.z };
      if (!plan.bridges.every((b) => polylineDistance([[b.from, b.to]], at) > 20 + 13 * house.scale)) return;
      out.push({ id: `landmark:islet-mansion:${index}:${k}`, kind: "islet-mansion", x: at.x, z: at.z, yaw: house.yaw, radius: 0,
        reach: house.reach, scale: house.scale });
    });
  }
  return out;
}

function coastCentroid(coast: Vec2[]): Vec2 {
  let x = 0;
  let z = 0;
  for (const point of coast) { x += point.x; z += point.z; }
  return { x: x / coast.length, z: z / coast.length };
}
