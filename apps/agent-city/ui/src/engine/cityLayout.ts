/** Geography and public planning are fixed; sessions occupy reserved parcels. */
import { hashSeed, type CityModel } from "../cityModel";
import { clearsHighways, createCityPlan, scaleTierFor, type Biome, type Landmark } from "./cityPlan";

export type Vec2 = { x: number; z: number };
export type Zone = "downtown" | "residential" | "commercial" | "waterfront";
export type Parcel = Vec2 & { id: string; blockId: string; yaw: number; zone: Zone; width: number; depth: number };
export type CityBlock = {
  id: string; districtId: string; x: number; z: number; width: number; depth: number;
  zone: Zone; parcels: Parcel[]; polygon: Vec2[];
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
};
/** 城市配套：学校 / 商场 / 医院。数量随会话规模增长（每 CIVIC_PER_SESSIONS 个会话一座），
 *  落成时刻 = 城市长到那个规模的时刻——回放时看得见「城市在发展」。纯装饰，不进统计、不可拾取。 */
/** 小区中心花园：每个执行环境城区锚点处预留一个整街区（湖 + 假山 + 亭 + 环湖树），楼从四周向外长。 */
export type GardenSite = Vec2 & { id: string; districtId: string; blockId: string; y: number; yaw: number; width: number; depth: number; seed: number };
export type CivicKind = "school" | "mall" | "hospital";
export type CivicSite = Vec2 & { id: string; kind: CivicKind; districtId: string; parcelId: string; y: number; yaw: number; width: number; depth: number; unlockAt: number };
export const CIVIC_PER_SESSIONS = 45;
const CIVIC_ORDER: CivicKind[] = ["school", "mall", "hospital"];

export type BridgeLayout = { from: Vec2; to: Vec2; angle: number; length: number };
export type PublicSite = Vec2 & { id: string; kind: "civic" | "station" | "stadium" | "park" | "tower" | "harbor"; radius: number; yaw: number };
export type CityLayout = {
  /** G1：规模档位、生态带与城市核心点（下游取景/航拍/植被读这里，不再假设岛在原点、固定大小）。 */
  scaleTier: number; biome: Biome; core: Vec2; islandRadius: number;
  seed: number; districts: DistrictLayout[]; blocks: CityBlock[]; roadNodes: RoadNode[]; roadEdges: RoadEdge[];
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
export function layoutCity(model: CityModel, previous?: CityLayout | null, seed = 1927, coastal: import("./citySeaside").CoastalConfig | null = null): CityLayout {
  // 规模档位由会话总数分档：档位内刷新/分页不改地图；跨档时岛按原形状放大。
  const tier = scaleTierFor(model.buildings.length);
  // plans 缓存键携带海滨配置身份（profile+version）：同 seed 不同配置不得复用旧规划。
  const planKey = `${seed}:${tier}:${coastal ? `${coastal.profile}:v${coastal.version}` : "none"}`;
  let plan = plans.get(planKey);
  if (!plan) { plan = createCityPlan(seed, tier, coastal); plans.set(planKey, plan); }
  const parcels = plan.blocks.flatMap((block) => block.parcels);
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
  const usableBlocks = plan.blocks.filter((block) => block.parcels.length > 0)
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
    const score = (p: Parcel) => Math.hypot(p.x - anchor.x, p.z - anchor.z) + hashSeed(p.id) * 6;
    const inside = blocksOf(district.id).flatMap((block) => block.parcels).filter((parcel) => !used.has(parcel.id)).sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id));
    const overflow: typeof buildings = [];
    let cursor = 0;
    for (const building of buildings) {
      while (cursor < inside.length && used.has(inside[cursor].id)) cursor += 1;
      let parcel: Parcel | undefined = inside[cursor];
      if (parcel) cursor += 1;
      else parcel = parcels.filter((candidate) => !used.has(candidate.id)).sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id))[0];
      if (!parcel) { overflow.push(building); continue; }
      assigned.set(building.id, parcel);
      used.add(parcel.id);
    }
    if (overflow.length) massing.push(...aggregateOverflow(district.id, anchor, overflow, parcels, plan));
  }
  const civics = placeCivics(model, parcels, used, assigned, previous ?? null, plan);
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
  return { ...plan, districts, seed, massing, civics, gardens, boatLanes: [], decorMountains: [], boatLoops, seaMountains };
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
    out.push({ id, kind, districtId: owner, parcelId: parcel.id, x: parcel.x, z: parcel.z, y: plan.terrain.height(parcel.x, parcel.z), yaw: parcel.yaw, width: parcel.width, depth: parcel.depth, unlockAt });
  });
  return out;
}

function coastCentroid(coast: Vec2[]): Vec2 {
  let x = 0;
  let z = 0;
  for (const point of coast) { x += point.x; z += point.z; }
  return { x: x / coast.length, z: z / coast.length };
}
