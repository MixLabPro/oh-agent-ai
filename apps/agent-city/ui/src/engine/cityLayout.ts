import { DetMath as Math } from "./detMath"; // 跨引擎确定性：见 detMath.ts
/** Geography and public planning are fixed; sessions occupy reserved parcels. */
import { hashSeed, type CityModel } from "../cityModel";
import { clearsHighways, createCityPlan, polygonDistance, scaleTierFor, type Biome, type Landmark } from "./cityPlan";
import { seasideHotelLots, seasideStripContains, type CoastalConfig } from "./citySeaside";

export type Vec2 = { x: number; z: number };
export type Zone = "downtown" | "residential" | "commercial" | "waterfront";
export type Parcel = Vec2 & { id: string; blockId: string; yaw: number; zone: Zone; width: number; depth: number };
export type CityBlock = {
  id: string; districtId: string; x: number; z: number; width: number; depth: number;
  zone: Zone; parcels: Parcel[]; polygon: Vec2[];
  /** 无楼且不在已建街区旁的预留圈内：地面画成自然绿地，不铺地块（G1「街区随建成量生长」）。 */
  vacant?: boolean;
};
export type RoadNode = Vec2 & { id: string };
export type RoadEdge = { id: string; from: string; to: string; width: number; kind: "arterial" | "local"; points: Vec2[]; bridge?: boolean };
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
export type PublicSite = Vec2 & { id: string; kind: "civic" | "station" | "stadium" | "park" | "tower" | "harbor"; radius: number; yaw: number };
export type CityLayout = {
  /** G1：规模档位、生态带与城市核心点（下游取景/航拍/植被读这里，不再假设岛在原点、固定大小）。 */
  scaleTier: number; biome: Biome; core: Vec2; islandRadius: number;
  seed: number; districts: DistrictLayout[]; blocks: CityBlock[]; roadNodes: RoadNode[]; roadEdges: RoadEdge[];
  /** 哪些街区已建/预留的指纹：静态城缓存（地面贴图）据此判断是否重画。 */
  activityKey?: string;
  /** 环岛滨海路段（不含河岸路），S3 滨海景观带沿其在建成区附近的岸段铺设。 */
  coastRoads?: Vec2[][];
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
  gardens: GardenSite[];
  boatLoops: Vec2[][]; seaMountains: Array<{ center: Vec2; radius: number; height: number; seed: number }>;
};

const plans = new Map<string, ReturnType<typeof createCityPlan>>();

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
export function layoutCity(model: CityModel, previous?: CityLayout | null, seed = 1927, coastal: CoastalConfig | null = null, backdrop: BackdropMode = "auto"): CityLayout {
  // 规模档位由会话总数分档：档位内刷新/分页不改地图；跨档时岛按原形状放大。
  const tier = scaleTierFor(model.buildings.length);
  // plans 缓存键携带海滨配置身份（profile+version）：同 seed 不同配置不得复用旧规划。
  // 缓存键含参数指纹：同 profile/version 改参数（如 maxCoastalHeight）必须产生
  // 新规划——曾只带 profile:version，参数变化时复用旧海滨带（审查 #5 复现）。
  const coastalKey = coastal
    ? `${coastal.profile}:v${coastal.version}:${[
        coastal.preferredAzimuth, coastal.azimuthTolerance, coastal.segmentArc,
        coastal.wetSandWidth, coastal.drySandWidth, coastal.promenadeOffset,
        coastal.hotelOffset, coastal.bandOuter, coastal.maxCoastalSlope,
        coastal.maxCoastalHeight, coastal.riverMargin, coastal.siteMargin,
        coastal.minValidRatio,
      ].join(",")}`
    : "none";
  const planKey = `${seed}:${tier}:${coastalKey}`;
  let plan = plans.get(planKey);
  if (!plan) { plan = createCityPlan(seed, tier, coastal); plans.set(planKey, plan); }
  // 海滨酒店地块并入可落楼街区（单地块合成街区，朝海、宽 20–29）：酒店只在有会话落户时才出现。
  // 只进本函数的落楼候选，不改缓存的 plan、不进返回的 layout.blocks（地面贴图/规划守卫看到的规划不变），
  // 配套选址与背景楼仍只看 plan.blocks——酒店地块留给会话。
  // 酒店地块在路网之后才排：环岛滨海路的接入路、被裁的主干道接回大道等都可能从地块上穿过（真机：楼压在路上）。
  // 按地块的真实朝向矩形检查——外扩半个路幅 + 0.5——压路的地块不发放。
  const lotClearOfRoads = (lot: { x: number; z: number; yaw: number; width: number; depth: number }) => {
    const ax = Math.sin(lot.yaw); const az = Math.cos(lot.yaw); // 局部 z 轴（进深）
    const bx = az; const bz = -ax;                               // 局部 x 轴（面宽）
    for (const edge of plan.roadEdges) {
      const [a, b] = edge.points; const len = Math.hypot(b.x - a.x, b.z - a.z);
      const pad = edge.width / 2 + 0.5;
      for (let d = 0; d <= len; d += 1.5) {
        const t = len ? d / len : 0;
        const dx = a.x + (b.x - a.x) * t - lot.x; const dz = a.z + (b.z - a.z) * t - lot.z;
        if (Math.abs(dx * bx + dz * bz) < lot.width / 2 + pad && Math.abs(dx * ax + dz * az) < lot.depth / 2 + pad) return false;
      }
    }
    return true;
  };
  const hotelBlocks: CityBlock[] = seasideHotelLots(plan.seaside).filter(lotClearOfRoads).map((lot) => ({
    id: lot.id, districtId: "", x: lot.x, z: lot.z, width: lot.width, depth: lot.depth, zone: "waterfront" as Zone, polygon: [],
    parcels: [{ id: `${lot.id}/0`, blockId: lot.id, x: lot.x, z: lot.z, yaw: lot.yaw, zone: "waterfront" as Zone, width: lot.width, depth: lot.depth }],
  }));
  const blocks = [...plan.blocks, ...hotelBlocks];
  const parcels = blocks.flatMap((block) => block.parcels);
  const parcelIndex = new Map(parcels.map((parcel) => [parcel.id, parcel]));
  const assigned = new Map<string, Parcel>();
  const used = new Set<string>();
  // 跨档（会话数越过 400 的整数倍）：岛按原形状放大，地块编号对应的位置变了，旧地址不能原样复用——
  // 按放大比例把每栋楼映射到「放大后的原位置」最近的空地块（SPEC §4.2），城市看起来是整体长大而不是整体洗牌。
  // 先落位的是更早开工的楼（占最好的位置）；映射不到（半径 > 120 内没有空地块）的留给后面的常规落位。
  if (previous?.seed === seed && previous.scaleTier !== tier && previous.islandRadius > 0) {
    const ratio = plan.islandRadius / previous.islandRadius;
    const old = new Map(previous.districts.flatMap((district) => [...district.slots]));
    const CELL = 40;
    const grid = new Map<string, Parcel[]>();
    for (const parcel of parcels) { const key = `${Math.floor(parcel.x / CELL)}:${Math.floor(parcel.z / CELL)}`; const list = grid.get(key); if (list) list.push(parcel); else grid.set(key, [parcel]); }
    const ordered = [...model.buildings].filter((building) => old.has(building.id)).sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
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
      if (parcel && parcelIndex.has(parcel.id) && !used.has(parcel.id)) {
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
  {
    let index = 0; let accumulated = 0; let quota = 0;
    for (const district of ranked) {
      quota += (sessionsOf.get(district.id)! / totalSessions) * totalLots;
      while (index < usableBlocks.length && (accumulated < quota || district === ranked[ranked.length - 1])) {
        wedgeOf.set(usableBlocks[index].id, district.id);
        accumulated += usableBlocks[index].parcels.length;
        index += 1;
      }
    }
  }
  const blocksOf = (districtId: string) => usableBlocks.filter((block) => wedgeOf.get(block.id) === districtId);
  /** 小区中心：本片街区按离核心距离由近到远，取 30% 处——靠内但不压在核心点上（核心是市政广场）。 */
  const anchorOf = new Map<string, Vec2>();
  for (const district of ranked) {
    const own = blocksOf(district.id).sort((a, b) => Math.hypot(a.x - core.x, a.z - core.z) - Math.hypot(b.x - core.x, b.z - core.z));
    const pick = own[Math.min(own.length - 1, Math.floor(own.length * 0.3))];
    anchorOf.set(district.id, pick ? { x: pick.x, z: pick.z } : core);
  }

  // 小区中心花园：先于会话落楼，在本小区内离中心最近的空街区整块预留（只看规划与会话数，确定性不变）。
  const gardens: GardenSite[] = [];
  for (const district of ranked) {
    const anchor = anchorOf.get(district.id)!;
    const block = blocksOf(district.id)
      .filter((candidate) => candidate.parcels.every((parcel) => !used.has(parcel.id)) && clearsHighways(candidate, candidate.width, candidate.depth, plan.highways))
      .sort((a, b) => Math.hypot(a.x - anchor.x, a.z - anchor.z) - Math.hypot(b.x - anchor.x, b.z - anchor.z) || a.id.localeCompare(b.id))[0];
    if (!block) continue;
    for (const parcel of block.parcels) used.add(parcel.id);
    gardens.push({ id: `garden:${district.id}`, districtId: district.id, blockId: block.id, x: block.x, z: block.z, y: plan.terrain.height(block.x, block.z), yaw: block.parcels[0].yaw, width: block.width, depth: block.depth, seed: hashSeed(`garden:${district.id}`) });
  }

  // 城区地标（用户：地标尽量放在城区中心、与景观湖配套）：先于会话落楼，在花园（景观湖）街区旁最近的空地块占位，
  // 城区的楼再从花园向外长。曾在落楼之后取「离锚点最近的空地块」——内圈已被会话楼占满，地标落到城区边缘。
  const districtLandmarks: DistrictLandmark[] = [];
  for (const district of ranked) {
    if (!model.buildings.some((building) => building.districtId === district.id)) continue;
    const garden = gardens.find((g) => g.districtId === district.id);
    const centre = garden ?? anchorOf.get(district.id)!;
    const spot = plan.blocks.flatMap((block) => block.parcels)
      .filter((parcel) => !used.has(parcel.id) && clearsHighways(parcel, 16, 16, plan.highways))
      .sort((a, b) => Math.hypot(a.x - centre.x, a.z - centre.z) - Math.hypot(b.x - centre.x, b.z - centre.z) || a.id.localeCompare(b.id))[0];
    if (!spot) continue;
    used.add(spot.id);
    districtLandmarks.push({ districtId: district.id, parcelId: spot.id, x: spot.x, z: spot.z, yaw: spot.yaw, y: plan.terrain.height(spot.x, spot.z) });
  }

  // 为商场预留整块的商业/市中心街区：会话楼现在优先占好地段，曾把这些街区都占成「部分有楼」，商场找不到整块（布局守卫）。
  // 配套仍在会话落楼之后按城区质心选址（placeCivics），落楼前锁住、选址前释放。
  const civicTotal = model.buildings.length === 0 ? 0 : Math.max(2, Math.min(30, Math.floor(model.buildings.length / CIVIC_PER_SESSIONS)));
  const mallReserve = plan.blocks
    .filter((block) => (block.zone === "commercial" || block.zone === "downtown") && block.parcels.length > 0 && block.parcels.every((p) => !used.has(p.id)) && clearsHighways(block, block.width, block.depth, plan.highways))
    .sort((a, b) => Math.hypot(a.x - core.x, a.z - core.z) - Math.hypot(b.x - core.x, b.z - core.z) || a.id.localeCompare(b.id))
    .slice(0, Math.ceil(civicTotal / 3) + 1);
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
  const civics = placeCivics(model, parcels, used, assigned, previous ?? null, plan);
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
        const [a, b] = edge.points;
        const dx = b.x - a.x; const dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((parcel.x - a.x) * dx + (parcel.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
        const distance = Math.hypot(parcel.x - a.x - dx * t, parcel.z - a.z - dz * t);
        return distance < halfDiagonal + edge.width / 2 + 0.5;
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
      const [a, b] = edge.points; const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
      road = Math.min(road, Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t));
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
  const grown = growWithBuildings(plan, used, districts, civics);
  return { ...plan, ...grown, districtLandmarks, districts, seed, massing, civics, gardens, boatLanes: [], decorMountains: [], boatLoops, seaMountains, coastalConfigKey: coastalKey, coastalConfig: coastal, contextBuildings };
}

/**
 * G1「街区随建成量生长」（docs/CITY_SENSE_REVIEW.md）：街网只铺到已有楼的街区，
 * 其余街区是自然绿地、服务它们的支路与次干道不修。真机多视角评估：30 天 ~380 栋楼却铺满整岛街网，
 * 七成街区是空地块，像一张分地图而不是城市。主干道、环线、环岛/河岸路、桥照旧（城市骨架先行）。
 * 连通：去掉支路后若某个仍有活动的分量与主网断开，就按 BFS 把被去掉的边一圈圈加回来直到连上；
 * 完全无活动的碎片分量整段删掉。车流只保留仍沿真实路段走的回路。
 */
function growWithBuildings(plan: ReturnType<typeof createCityPlan>, used: Set<string>, districts: DistrictLayout[], civics: CivicSite[]) {
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
    const [a, b] = edge.points; const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    return anchors.some((anchor) => Math.hypot(anchor.x - m.x, anchor.z - m.z) < anchor.r);
  };
  // 骨架（宽 12、桥）永远保留；宽 ≤8 的街道只在服务活动区时保留。
  const keep = new Set(plan.roadEdges.filter((edge) => edge.bridge || edge.width >= 12 || serves(edge)).map((edge) => edge.id));
  const dropped = plan.roadEdges.filter((edge) => !keep.has(edge.id));
  const components = () => {
    const parent = new Map<string, string>();
    const find = (x: string): string => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
    for (const edge of plan.roadEdges) if (keep.has(edge.id)) for (const id of [edge.from, edge.to]) if (!parent.has(id)) parent.set(id, id);
    for (const edge of plan.roadEdges) if (keep.has(edge.id)) { const a = find(edge.from); const b = find(edge.to); if (a !== b) parent.set(a, b); }
    return { parent, find };
  };
  const primaryId = plan.roadEdges.find((edge) => edge.width >= 12 && !edge.bridge)?.from;
  for (let guard = 0; guard < 200 && primaryId; guard += 1) {
    const { parent, find } = components();
    const main = find(primaryId);
    const stray = [...parent.keys()].filter((id) => find(id) !== main);
    if (!stray.length) break;
    // 碎片里有没有活动：它的边是否服务活动区。
    const strayRoots = new Set(stray.map(find));
    let changed = false;
    for (const root of strayRoots) {
      const members = new Set(stray.filter((id) => find(id) === root));
      // 含骨架（宽 12 / 桥）或服务活动区的分量必须接回主网；只有纯空置支路碎片才删。
      const hasLife = plan.roadEdges.some((edge) => keep.has(edge.id) && members.has(edge.from) && (edge.width >= 12 || edge.bridge || serves(edge)));
      if (!hasLife) { for (const edge of plan.roadEdges) if (keep.has(edge.id) && members.has(edge.from) && edge.width < 12 && !edge.bridge) keep.delete(edge.id); changed = true; continue; }
      // 只加回一条最短的接回路径（经被删边 BFS 到主网任一节点）；曾整圈整圈加回，几乎把空置街网全长回来了。
      const viaDropped = new Map<string, RoadEdge[]>();
      for (const edge of dropped) if (!keep.has(edge.id)) for (const id of [edge.from, edge.to]) (viaDropped.get(id) ?? viaDropped.set(id, []).get(id)!).push(edge);
      const back = new Map<string, RoadEdge | null>([...members].map((id) => [id, null]));
      const queue = [...members]; let reached: string | null = null;
      for (let q = 0; q < queue.length && !reached; q += 1) {
        for (const edge of viaDropped.get(queue[q]) ?? []) {
          const next = edge.from === queue[q] ? edge.to : edge.from;
          if (back.has(next)) continue;
          back.set(next, edge); queue.push(next);
          if (parent.has(next) && find(next) === main) { reached = next; break; }
        }
      }
      for (let cursor = reached; cursor && back.get(cursor); ) {
        const edge = back.get(cursor)!; keep.add(edge.id); changed = true;
        cursor = edge.from === cursor ? edge.to : edge.from;
      }
    }
    if (!changed) break;
  }
  const roadEdges = plan.roadEdges.filter((edge) => keep.has(edge.id));
  const nodeIds = new Set(roadEdges.flatMap((edge) => [edge.from, edge.to]));
  const roadNodes = plan.roadNodes.filter((node) => nodeIds.has(node.id));
  const pairs = new Set(roadEdges.map((edge) => [edge.from, edge.to].sort().join("/")));
  for (const district of districts) {
    district.carPaths = district.carPaths.filter((route) => route.every((p, i) => i === 0 || pairs.has([`${route[i - 1].x}:${route[i - 1].z}`, `${p.x}:${p.z}`].sort().join("/"))));
  }
  return { blocks, roadEdges, roadNodes, activityKey: [...live].sort().join(",") + "|" + districts.map((d) => `${d.id}:${d.sessionCount}:${d.anomaly?.severity ?? ""}`).join(",") }; // 会话数→地标/城区旗，异常→市政厅信标
}

/** 配套选址：会话楼先占地，配套只拿剩下的地块（绝不挤走会话）。
 *  第 i 座配套属于「第 i 座落成时会话最多的城区」之外按会话数加权轮转的城区，落在该城区楼群外缘
 *  最近的空地块上，彼此至少隔 60。上一版布局里已有的配套若地块仍空着就原地保留（刷新不搬家）。 */
function placeCivics(model: CityModel, parcels: Parcel[], used: Set<string>, assigned: Map<string, Parcel>, previous: CityLayout | null, plan: ReturnType<typeof createCityPlan>): CivicSite[] {
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
  type Lot = { id: string; x: number; z: number; yaw: number; width: number; depth: number; zone: Zone };
  const free: Lot[] = plan.blocks
    .filter((block) => block.parcels.length > 0 && block.parcels.every((parcel) => !used.has(parcel.id)) && clearsHighways(block, block.width, block.depth, plan.highways))
    .map((block) => ({ id: block.id, x: block.x, z: block.z, yaw: block.parcels[0].yaw, width: block.width, depth: block.depth, zone: block.zone }));
  const taken = new Set<string>();
  const out: CivicSite[] = [];
  const old = new Map((previous?.civics ?? []).map((civic) => [civic.id, civic]));
  // 第一遍：先为所有仍能原地保留的配套占住原街区，否则编号更小的新配套会先抢走它（刷新不搬家）。
  const reservedFor = new Map<string, string>(); // blockId → civic id
  sequence.forEach((_, index) => {
    const keep = old.get(`civic:${index}`);
    if (keep && free.some((lot) => lot.id === keep.parcelId)) reservedFor.set(keep.parcelId, `civic:${index}`);
  });
  sequence.forEach((districtId, index) => {
    const id = `civic:${index}`;
    const kind = CIVIC_ORDER[index % CIVIC_ORDER.length];
    const unlockAt = times[Math.min(times.length - 1, (index + 1) * CIVIC_PER_SESSIONS - 1)] ?? times[times.length - 1];
    const keep = old.get(id);
    let parcel: Lot | undefined = keep && reservedFor.get(keep.parcelId) === id ? free.find((p) => p.id === keep.parcelId && !taken.has(p.id)) : undefined;
    // 已有配套原地保留时连同它原来的城区一起保留：总数一变，轮转里「第 i 座属于哪个城区」会变，
    // 曾因此让 civic:7 换了城区、搬去新城区找地（刷新不搬家契约被打破）。
    const owner = parcel && keep ? keep.districtId : districtId;
    if (!parcel) {
      const own = model.buildings.filter((b) => b.districtId === districtId).map((b) => assigned.get(b.id)).filter((p): p is Parcel => !!p);
      if (!own.length) return;
      const cx = own.reduce((acc, p) => acc + p.x, 0) / own.length;
      const cz = own.reduce((acc, p) => acc + p.z, 0) / own.length;
      // 按服务半径铺开（SPEC §4.4）：离已有配套越远越好（封顶 150），同时不要离本城区中心太远；
      // 学校偏居住区、商场偏商业/市中心、医院偏市中心与商业区。曾只取「离城区质心最近的空街区」，
      // 配套全挤在城区中心，一座岛上五座学校互相挨着。
      const preferred: Record<CivicKind, Zone[]> = { school: ["residential"], mall: ["downtown", "commercial", "waterfront"], hospital: ["downtown", "commercial", "residential"] };
      parcel = free
        .filter((p) => !taken.has(p.id) && !reservedFor.has(p.id) && out.every((c) => Math.hypot(c.x - p.x, c.z - p.z) >= 60))
        .map((p) => {
          const nearestCivic = Math.min(150, ...out.map((c) => Math.hypot(c.x - p.x, c.z - p.z)));
          const rank = preferred[kind].indexOf(p.zone);
          const zonePenalty = rank < 0 ? 60 : rank * 15;
          return { p, d: Math.hypot(p.x - cx, p.z - cz) * 0.35 - nearestCivic * 0.7 + zonePenalty + hashSeed(`${id}:${p.id}`) * 10 };
        })
        .sort((a, b) => a.d - b.d || a.p.id.localeCompare(b.p.id))[0]?.p;
    }
    if (!parcel) return;
    taken.add(parcel.id);
    // 大门朝路（用户：医院门前没有路）：在街区朝向的四个方向里，选正门（局部 +z）外 8 处离道路最近的那个。
    const roadGap = (q: Vec2) => Math.min(...plan.roadEdges.filter((e) => !e.bridge).map((e) => {
      const [a, b] = e.points; const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / l2));
      return Math.hypot(q.x - a.x - dx * t, q.z - a.z - dz * t) - e.width / 2;
    }));
    let yaw = parcel.yaw; let best = Infinity;
    for (let k = 0; k < 4; k += 1) {
      const y = parcel.yaw + (k * Math.PI) / 2; const half = (k % 2 ? parcel.width : parcel.depth) / 2;
      const gap = roadGap({ x: parcel.x + Math.sin(y) * (half + 8), z: parcel.z + Math.cos(y) * (half + 8) });
      if (gap < best) { best = gap; yaw = y; }
    }
    const swap = Math.round((yaw - parcel.yaw) / (Math.PI / 2)) % 2 !== 0;
    out.push({ id, kind, districtId: owner, parcelId: parcel.id, x: parcel.x, z: parcel.z, y: plan.terrain.height(parcel.x, parcel.z), yaw, width: swap ? parcel.depth : parcel.width, depth: swap ? parcel.width : parcel.depth, unlockAt });
  });
  return out;
}

function coastCentroid(coast: Vec2[]): Vec2 {
  let x = 0;
  let z = 0;
  for (const point of coast) { x += point.x; z += point.z; }
  return { x: x / coast.length, z: z / coast.length };
}
