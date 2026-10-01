/** Geography and public planning are fixed; sessions occupy reserved parcels. */
import { hashSeed, type CityModel } from "../cityModel";
import { createCityPlan } from "./cityPlan";

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
export type BridgeLayout = { from: Vec2; to: Vec2; angle: number; length: number };
export type PublicSite = Vec2 & { id: string; kind: "civic" | "station" | "stadium" | "park" | "tower" | "harbor"; radius: number; yaw: number };
export type CityLayout = {
  seed: number; districts: DistrictLayout[]; blocks: CityBlock[]; roadNodes: RoadNode[]; roadEdges: RoadEdge[];
  terrain: TerrainField; extent: number; coast: Vec2[]; river: Vec2[]; publicSites: PublicSite[];
  parkTrees: Array<Vec2 & { y: number; seed: number }>;
  urbanBounds: { left: number; right: number; north: number; south: number };
  bridges: BridgeLayout[]; boatLanes: Array<{ radius: number; speed: number; phase: number }>;
  boundsRadius: number; decorMountains: Array<{ center: Vec2; radius: number; terrain: TerrainField }>;
  /** Host quarter anchors (token rank → anchor) and the elevated expressway
   *  that marks the north/south district border. */
  districtAnchors: Vec2[]; highways: Vec2[][];
  /** Sessions beyond the parcel budget, aggregated into non-interactive
   *  background massing blocks (honest count surfaced in the HUD). */
  massing: Array<{ districtId: string; x: number; z: number; y: number; count: number; tokens: number; height: number }>;
  /** 海岸外扩环状航道（折线）与两侧装饰远山。 */
  boatLoops: Vec2[][]; seaMountains: Array<{ center: Vec2; radius: number; height: number; seed: number }>;
};

const plans = new Map<number, ReturnType<typeof createCityPlan>>();

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
      if (plan.blocks.some((block) => block.parcels.length > 0 && Math.hypot(block.x - x, block.z - z) < 46)) continue;
      if (out.some((block2) => Math.hypot(block2.x - x, block2.z - z) < 34)) continue;
      placed = { x, z };
    }
    if (!placed) placed = { x: anchor.x + Math.cos(angle) * 220, z: anchor.z + Math.sin(angle) * 220 };
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

/** The seed controls geography, never host count, token ranking or time window. */
export function layoutCity(model: CityModel, previous?: CityLayout | null, seed = 1927): CityLayout {
  let plan = plans.get(seed);
  if (!plan) { plan = createCityPlan(seed); plans.set(seed, plan); }
  const parcels = plan.blocks.flatMap((block) => block.parcels);
  const parcelIndex = new Map(parcels.map((parcel) => [parcel.id, parcel]));
  const assigned = new Map<string, Parcel>();
  const used = new Set<string>();
  if (previous?.seed === seed) {
    const old = new Map(previous.districts.flatMap((district) => [...district.slots]));
    for (const building of model.buildings) {
      const parcel = old.get(building.id);
      if (parcel && parcelIndex.has(parcel.id) && !used.has(parcel.id)) {
        assigned.set(building.id, parcelIndex.get(parcel.id)!); used.add(parcel.id);
      }
    }
  }
  // Host affinity × growth narrative: each district fills outward from its
  // quarter anchor in session-time order — the oldest sessions settle closest
  // to the anchor and newer ones push outward, so a timeline replay shows each
  // quarter growing from its seed core instead of a skyline reshuffle. Within
  // the same moment taller towers still claim the inner lots (stable tiebreak).
  // Already-placed buildings keep their parcels (see `previous` above), so a
  // refresh never relocates the city; only new sessions compete for what is
  // left — a late-discovered older session may land slightly outward, which is
  // the honest cost of never moving an existing building.
  const pending = model.buildings.filter((building) => !assigned.has(building.id));
  const massing: CityLayout["massing"] = [];
  const anchors = plan.districtAnchors;
  // 城区排名按 (会话数降序, id 字典序) 确定性排序——宿主拿哪个象限锚点
  // 不随输入数组顺序变化（契约：reversed 输入得到同一座城）。
  const ranked = [...model.districts].sort((a, b) => b.sessionCount - a.sessionCount || (a.id < b.id ? -1 : 1));
  const rankOf = new Map(ranked.map((district, index) => [district.id, index]));
  for (const district of ranked) {
    const anchor = anchors[rankOf.get(district.id)! % anchors.length];
    const buildings = pending
      .filter((building) => building.districtId === district.id)
      .sort((a, b) => a.startedAt - b.startedAt || b.height - a.height || a.id.localeCompare(b.id));
    if (!buildings.length) continue;
    const available = parcels.filter((parcel) => !used.has(parcel.id)).sort((a, b) => {
      const score = (p: Parcel) => Math.hypot(p.x - anchor.x, p.z - anchor.z) + hashSeed(p.id) * 55;
      return score(a) - score(b) || a.id.localeCompare(b.id);
    });
    const overflow: typeof buildings = [];
    buildings.forEach((building, index) => {
      const parcel = available[index];
      if (!parcel) { overflow.push(building); return; }
      assigned.set(building.id, parcel);
      used.add(parcel.id);
    });
    if (overflow.length) massing.push(...aggregateOverflow(district.id, anchor, overflow, parcels, plan));
  }
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
  return { ...plan, districts, seed, massing, boatLanes: [], decorMountains: [], boatLoops, seaMountains };
}

function coastCentroid(coast: Vec2[]): Vec2 {
  let x = 0;
  let z = 0;
  for (const point of coast) { x += point.x; z += point.z; }
  return { x: x / coast.length, z: z / coast.length };
}
