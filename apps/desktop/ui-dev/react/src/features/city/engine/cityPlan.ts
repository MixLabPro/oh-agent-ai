/**
 * Seeded, data-independent geography and municipal land reservations.
 *
 * CITY_PLANNING_SPEC G1：先有地理、再铺街区、规模跟着档位走。
 *   L1 地理：种子 → 岛形（极坐标谐波 + 海湾 + 拉伸旋转）、河、山脊、城市核心点、生态带。
 *   规模：scaleTier（由会话总数分档，见 cityLayout）→ 目标地块数；岛按需放大到装得下
 *         （同一种子只放大不变形，档位不变时地图不变）。
 *   街区网格按岛的实际包围盒生成；公共用地与城区锚点相对核心点放置再贴到陆地上——
 *   不再有任何写死的岛形坐标（曾经全部写死：换种子岛形不变，岛一变就落海）。
 * 只读 (seed, scaleTier)，不读任何会话字段。
 */
import { hashSeed } from "../cityModel";
import { fbm, smoothstep } from "./cityNoise";
import type { CityBlock, CityLayout, Parcel, PublicSite, RoadEdge, RoadNode, TerrainField, Vec2, Zone } from "./cityLayout";

export function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x; const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}

export function polygonDistance(p: Vec2, polygon: Vec2[]): number {
  let inside = false; let distance = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]; const b = polygon[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
    distance = Math.min(distance, segmentDistance(p, a, b));
  }
  return inside ? distance : -distance;
}

export const roadNodeId = (p: Vec2): string => `${p.x}:${p.z}`;

export type Biome = "tropical" | "temperate" | "boreal" | "savanna" | "eastasian";
const BIOMES: Biome[] = ["tropical", "temperate", "boreal", "savanna", "eastasian"];

/** 每档对应的目标地块数（SPEC §4.2：400 会话一档 × 1.35 余量给公共用地、花园、配套与道路损耗）。 */
export const SESSIONS_PER_TIER = 400;
export const MAX_TIER = 5;
export function scaleTierFor(sessions: number): number {
  return Math.max(1, Math.min(MAX_TIER, Math.ceil(sessions / SESSIONS_PER_TIER)));
}
const targetParcels = (tier: number) => Math.ceil(SESSIONS_PER_TIER * tier * 1.35);

type Shape = {
  stretch: number; spin: number;
  harmonics: Array<{ k: number; a: number; p: number }>;
  bays: Array<{ at: number; depth: number; width: number }>;
};

export function createCityPlan(seed: number, tier = 2) {
  const random = (key: string) => hashSeed(`${seed}:${key}`);
  // 岛形参数（与半径无关）：放大时形状不变。
  const shape: Shape = {
    stretch: 0.78 + random("stretch") * 0.5,
    spin: random("spin") * Math.PI * 2,
    harmonics: [2, 3, 5].map((k) => ({ k, a: 0.05 + random(`h${k}`) * (k === 2 ? 0.16 : 0.1), p: random(`hp${k}`) * Math.PI * 2 })),
    bays: Array.from({ length: 1 + Math.floor(random("bays") * 3) }, (_, i) => ({ at: random(`bay${i}`) * Math.PI * 2, depth: 0.14 + random(`bayd${i}`) * 0.18, width: 0.18 + random(`bayw${i}`) * 0.25 })),
  };
  const biome: Biome = BIOMES[Math.floor(random("biome") * BIOMES.length) % BIOMES.length];
  // 先按档位估一个半径，再按实测地块数校正（最多 4 次）：面积 ∝ R²。
  let radius = 390 * Math.sqrt(tier);
  let plan = buildPlan(seed, radius, shape);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parcels = plan.blocks.reduce((sum, block) => sum + block.parcels.length, 0);
    if (parcels >= targetParcels(tier)) break;
    radius *= Math.sqrt(targetParcels(tier) / Math.max(1, parcels)) * 1.04;
    plan = buildPlan(seed, radius, shape);
  }
  return { ...plan, scaleTier: tier, biome };
}

function buildPlan(seed: number, R: number, shape: Shape) {
  const random = (key: string) => hashSeed(`${seed}:${key}`);
  const phase = random("river") * 3;

  // ── L1 岛形 ──
  const islandRadius = (theta: number) => {
    let r = 1;
    for (const h of shape.harmonics) r += h.a * Math.cos(h.k * theta + h.p);
    for (const bay of shape.bays) {
      const d = Math.atan2(Math.sin(theta - bay.at), Math.cos(theta - bay.at));
      r -= bay.depth * Math.exp(-(d * d) / (bay.width * bay.width));
    }
    r += fbm(Math.cos(theta) * 2.2, Math.sin(theta) * 2.2, seed + 17, 3) * 0.07;
    return Math.max(0.45, r);
  };
  const coast: Vec2[] = Array.from({ length: 96 }, (_, i) => {
    const theta = (i / 96) * Math.PI * 2;
    const r = islandRadius(theta) * R;
    const lx = Math.cos(theta) * r * shape.stretch;
    const lz = Math.sin(theta) * r / shape.stretch;
    return { x: lx * Math.cos(shape.spin) - lz * Math.sin(shape.spin), z: lx * Math.sin(shape.spin) + lz * Math.cos(shape.spin) };
  });
  const bbox = coast.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minZ: Math.min(b.minZ, p.z), maxZ: Math.max(b.maxZ, p.z) }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

  // ── 河：82% 有河，大致南北向穿岛（街网沿河弯曲，桥跨在第 0 列空隙上）。
  // 横向偏移不超过岛半宽的 25%，弯曲幅度与东西镜像随种子；无河时河宽恒负、不切地。
  const hasRiver = random("hasRiver") < 0.82;
  const halfWidth = (bbox.maxX - bbox.minX) / 2;
  const riverShift = (bbox.minX + bbox.maxX) / 2 + (random("riverShift") - 0.5) * halfWidth * 0.5;
  const riverAmp = (0.04 + random("riverAmp") * 0.07) * R * (random("riverMirror") < 0.5 ? -1 : 1);
  const riverX = (z: number) => hasRiver ? riverShift + riverAmp * Math.sin(z * 0.006 + phase) + 0.03 * R * Math.sin(z * 0.014) : riverShift;
  const riverWidth = (z: number) => hasRiver ? 16 + 4 * Math.cos(z * 0.012) + smoothstep(bbox.minZ + (bbox.maxZ - bbox.minZ) * 0.55, bbox.maxZ, z) * 34 : -1e6;
  const river = hasRiver ? Array.from({ length: 121 }, (_, i) => { const z = bbox.minZ - 60 + i * ((bbox.maxZ - bbox.minZ + 120) / 120); return { x: riverX(z), z }; }) : [];
  // 离岸距离：岛本就是极坐标函数，变回局部坐标比较「该方位的海岸半径 − 点的半径」即可 O(1) 求得。
  // 曾逐点对 96 段海岸算多边形距离，单岛被调用数十万次（profile 里占 85%）。
  // 乘 min(stretch, 1/stretch)·0.92 取保守下界：只会低估离岸距离，街区不会因近似落进海里。
  const radiusTable = Array.from({ length: 721 }, (_, i) => islandRadius((i / 720) * Math.PI * 2) * R);
  const shrink = Math.min(shape.stretch, 1 / shape.stretch) * 0.92;
  const cosSpin = Math.cos(shape.spin); const sinSpin = Math.sin(shape.spin);
  const coastDistance = (x: number, z: number) => {
    const lx = x * cosSpin + z * sinSpin;
    const lz = -x * sinSpin + z * cosSpin;
    const ux = lx / shape.stretch; const uz = lz * shape.stretch;
    let theta = Math.atan2(uz, ux); if (theta < 0) theta += Math.PI * 2;
    const f = (theta / (Math.PI * 2)) * 720; const i = Math.floor(f);
    const edge = radiusTable[i] + (radiusTable[Math.min(720, i + 1)] - radiusTable[i]) * (f - i);
    return (edge - Math.hypot(ux, uz)) * shrink;
  };
  const landClearance = (x: number, z: number) => Math.min(coastDistance(x, z), Math.abs(x - riverX(z)) - riverWidth(z));

  // ── 山脊：方位随种子，占岛在该方向上最外侧的一带。
  const hillAngle = random("hillAngle") * Math.PI * 2;
  const hillDir = { x: Math.cos(hillAngle), z: Math.sin(hillAngle) };
  const reach = Math.max(...coast.map((p) => p.x * hillDir.x + p.z * hillDir.z));
  const hillLine = reach * 0.6;
  const hillProj = (x: number, z: number) => x * hillDir.x + z * hillDir.z;
  const height = (x: number, z: number) => {
    const inland = landClearance(x, z);
    if (inland < 0) return -0.65 - Math.min(5, -inland * 0.25);
    const hills = smoothstep(hillLine - 10, hillLine + reach * 0.3, hillProj(x, z)) * (30 + 65 * fbm(x * 0.012, z * 0.013, seed, 4));
    return smoothstep(0, 10, inland) * (1.2 + hills);
  };
  const buildable = (x: number, z: number) => landClearance(x, z) > 12 && hillProj(x, z) < hillLine;
  const terrain: TerrainField = {
    height, slope: (x, z) => Math.hypot(height(x + 1, z) - height(x - 1, z), height(x, z + 1) - height(x, z - 1)) / 2,
    buildable, center: { x: 0, z: 0 }, radius: R * 1.3, coastRadius: () => R, hasRiver,
  };

  // ── 城市核心点：可建地上评分最高处——离岸约 0.32R、离山脊远、靠河（有河时）。
  let core: Vec2 = { x: riverShift, z: 0 };
  let best = -Infinity;
  for (let gx = 0; gx <= 24; gx += 1) for (let gz = 0; gz <= 24; gz += 1) {
    const x = bbox.minX + ((bbox.maxX - bbox.minX) * gx) / 24;
    const z = bbox.minZ + ((bbox.maxZ - bbox.minZ) * gz) / 24;
    if (!buildable(x, z)) continue;
    const shore = coastDistance(x, z);
    const riverGap = hasRiver ? Math.abs(Math.abs(x - riverX(z)) - riverWidth(z) - 70) : 0;
    const score = -Math.abs(shore - 0.32 * R) - riverGap * 0.6 - Math.max(0, hillProj(x, z) - hillLine * 0.4) * 0.8 + random(`core${gx}:${gz}`) * 8;
    if (score > best) { best = score; core = { x, z }; }
  }

  /** 从名义位置就近找可建地：同心环搜索，离岸/离河至少 clearance，与已放置点保持间距。 */
  const snap = (nominal: Vec2, clearance: number, placed: Array<Vec2 & { radius: number }>, radius: number): Vec2 => {
    for (let ring = 0; ring <= 60; ring += 1) {
      const steps = Math.max(1, ring * 8);
      for (let k = 0; k < steps; k += 1) {
        const a = (k / steps) * Math.PI * 2 + ring * 0.37;
        const q = { x: nominal.x + Math.cos(a) * ring * 12, z: nominal.z + Math.sin(a) * ring * 12 };
        if (landClearance(q.x, q.z) < clearance || hillProj(q.x, q.z) > hillLine - clearance * 0.5) continue;
        if (placed.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < o.radius + radius + 20)) continue;
        return q;
      }
    }
    return nominal;
  };
  const around = (angle: number, distance: number): Vec2 => ({ x: core.x + Math.cos(angle) * distance, z: core.z + Math.sin(angle) * distance });
  const turn = random("siteTurn") * Math.PI * 2;

  // ── 公共用地：相对核心点放置再贴陆地（按条件选址在 G3 细化）。
  const publicSites: PublicSite[] = [];
  const place = (id: string, kind: PublicSite["kind"], nominal: Vec2, radius: number, yaw: number) => {
    const q = snap(nominal, radius + 14, publicSites, radius);
    publicSites.push({ id, kind, x: q.x, z: q.z, radius, yaw });
  };
  place("civic-square", "civic", core, 44, -0.15);
  place("observation-tower", "tower", around(turn + 0.9, 0.16 * R), 26, 0);
  place("central-station", "station", around(turn + 2.2, 0.38 * R), 46, 0.12);
  place("riverside-park", "park", hasRiver ? { x: riverX(core.z + 0.18 * R) + riverWidth(core.z) + 60, z: core.z + 0.18 * R } : around(turn + 3.6, 0.3 * R), 47, 0);
  place("east-stadium", "stadium", around(turn + 4.8, 0.45 * R), 49, 0.2);
  {
    // 港口：离核心最近的一段海岸内侧（码头离市中心不远）。
    const shore = [...coast].sort((a, b) => Math.hypot(a.x - core.x, a.z - core.z) - Math.hypot(b.x - core.x, b.z - core.z))[0];
    const inward = { x: shore.x + (core.x - shore.x) * 0.12, z: shore.z + (core.z - shore.z) * 0.12 };
    place("working-harbor", "harbor", inward, 37, -Math.atan2(shore.z - core.z, shore.x - core.x));
  }

  // ── 街区网格：按岛包围盒生成（曾是固定的 x≈±600 / z≈-455..520）。x=0 经 warp 对齐到河心，
  // 第 0 列是河道空隙（无河时照常铺）。
  const xs = new Map<number, number>([[0, -48], [1, 48]]);
  let west = 0;
  while (xs.get(west)! + riverShift > bbox.minX - 40) { west -= 1; xs.set(west, xs.get(west + 1)! - (43 + random(`west${-west}`) * 16)); }
  let east = 1;
  while (xs.get(east)! + riverShift < bbox.maxX + 40) { east += 1; xs.set(east, xs.get(east - 1)! + (49 + random(`east${east}`) * 19)); }
  const zs = new Map<number, number>([[0, core.z - 15]]);
  let north = 0;
  while (zs.get(north)! > bbox.minZ - 40) { north -= 1; zs.set(north, zs.get(north + 1)! - (34 + random(`north${-north}`) * 17)); }
  let south = 0;
  while (zs.get(south)! < bbox.maxZ + 40) { south += 1; zs.set(south, zs.get(south - 1)! + (35 + random(`south${south}`) * 20)); }
  const warp = (x: number, z: number): Vec2 => {
    const wz = z + Math.sin(x * 0.006 + phase) * 21 + (x < 0 ? x * 0.14 : -x * 0.07) * 0.6;
    return { x: x + riverX(wz), z: wz };
  };
  const blocks: CityBlock[] = [];
  const nodes = new Map<string, RoadNode>(); const edges = new Map<string, RoadEdge>();
  const addEdge = (a: Vec2, b: Vec2, arterial: boolean, bridge = false) => {
    const from = roadNodeId(a); const to = roadNodeId(b); const id = [from, to].sort().join("/");
    nodes.set(from, { ...a, id: from }); nodes.set(to, { ...b, id: to });
    edges.set(id, { id, from, to, width: arterial ? 8 : 5, kind: arterial ? "arterial" : "local", points: [a, b], bridge });
  };
  const zoneFor = (center: Vec2, col: number, row: number): Zone => {
    // 分区由地理决定（曾按网格行列号）：核心附近 downtown、临海 waterfront、主干道沿线 commercial、其余 residential。
    if (Math.hypot(center.x - core.x, center.z - core.z) < 0.24 * R) return "downtown";
    if (coastDistance(center.x, center.z) < 90) return "waterfront";
    if (row % 3 === 0 || col % 3 === 0) return "commercial";
    return "residential";
  };
  for (let row = north; row < south; row += 1) for (let col = west; col < east; col += 1) {
    if (col === 0 && hasRiver) continue;
    const x0 = xs.get(col)!; const x1 = xs.get(col + 1)!; const z0 = zs.get(row)!; const z1 = zs.get(row + 1)!;
    const polygon = [warp(x0, z0), warp(x1, z0), warp(x1, z1), warp(x0, z1)];
    // Reject whole fringe blocks; never draw a road or parcel through coast/river.
    if (polygon.some((p) => !buildable(p.x, p.z))) continue;
    if (polygon.some((p, i) => { const q = polygon[(i + 1) % 4]; return !buildable((p.x + q.x) / 2, (p.z + q.z) / 2); })) continue;
    const center = warp((x0 + x1) / 2, (z0 + z1) / 2);
    const reserved = publicSites.some((site) => polygonDistance(site, polygon) > -site.radius);
    const zone = zoneFor(center, col, row);
    const id = `plan:${col}:${row}`; const parcels: Parcel[] = [];
    const columnCount = Math.max(3, Math.floor((x1 - x0 - 14) / 7.2));
    for (let side = 0; side < 2 && !reserved; side += 1) for (let index = 0; index < columnCount; index += 1) {
      const a = polygon[side === 0 ? 0 : 3]; const b = polygon[side === 0 ? 1 : 2];
      const length = Math.hypot(b.x - a.x, b.z - a.z); const dx = (b.x - a.x) / length; const dz = (b.z - a.z) / length;
      const t = (index + 0.5) / columnCount; const inset = side === 0 ? 12 : -12;
      const p = { x: a.x + dx * (7 + (length - 14) * t) - dz * inset, z: a.z + dz * (7 + (length - 14) * t) + dx * inset };
      const half = 3.6;
      if (polygonDistance(p, polygon) < half + 5) continue;
      if (publicSites.some((site) => Math.hypot(p.x - site.x, p.z - site.z) < site.radius + 9)) continue;
      parcels.push({ ...p, id: `${id}/${side}:${index}`, blockId: id, yaw: -Math.atan2(dz, dx), zone, width: Math.min(7.2, (length - 14) / columnCount), depth: 8 });
    }
    blocks.push({ id, districtId: "", ...center, width: x1 - x0, depth: z1 - z0, zone, parcels, polygon });
    polygon.forEach((p, i) => addEdge(p, polygon[(i + 1) % 4], i % 2 === 0 ? row % 3 === 0 : col % 3 === 0));
  }
  const bridges: CityLayout["bridges"] = [];
  if (hasRiver) {
    for (const [row, z] of zs) {
      if (row % 3 !== 0) continue;
      const from = warp(xs.get(0)!, z); const to = warp(xs.get(1)!, z);
      if (!nodes.has(roadNodeId(from)) || !nodes.has(roadNodeId(to))) continue;
      addEdge(from, to, true, true);
      bridges.push({ from, to, angle: Math.atan2(to.z - from.z, to.x - from.x), length: Math.hypot(to.x - from.x, to.z - from.z) });
    }
  }
  const parkTrees: CityLayout["parkTrees"] = [];
  const spanX = bbox.maxX - bbox.minX + 120; const spanZ = bbox.maxZ - bbox.minZ + 120;
  // 路段按 60 单位网格分桶：逐棵树对全部路段算距离是百万级运算（单岛 0.2–1 s 的主要来源）。
  const CELL = 60;
  const edgeBuckets = new Map<string, RoadEdge[]>();
  for (const edge of edges.values()) {
    const [a, b] = edge.points;
    for (let gx = Math.floor(Math.min(a.x, b.x) / CELL) - 1; gx <= Math.floor(Math.max(a.x, b.x) / CELL) + 1; gx += 1)
      for (let gz = Math.floor(Math.min(a.z, b.z) / CELL) - 1; gz <= Math.floor(Math.max(a.z, b.z) / CELL) + 1; gz += 1) {
        const key = `${gx}:${gz}`;
        const list = edgeBuckets.get(key);
        if (list) list.push(edge); else edgeBuckets.set(key, [edge]);
      }
  }
  for (let i = 0; i < 1200; i += 1) {
    const x = bbox.minX - 60 + random(`tx${i}`) * spanX; const z = bbox.minZ - 60 + random(`tz${i}`) * spanZ;
    const park = publicSites.some((s) => s.kind === "park" && Math.hypot(x - s.x, z - s.z) < s.radius - 5);
    const bank = Math.abs(x - riverX(z)) - riverWidth(z);
    const wild = hillProj(x, z) > hillLine - 20 || coastDistance(x, z) < 30;
    if (height(x, z) < 2.5 || (!park && !wild && !(hasRiver && bank < 23))) continue;
    if ((edgeBuckets.get(`${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`) ?? []).some((e) => segmentDistance({ x, z }, e.points[0], e.points[1]) < e.width / 2 + 3)) continue;
    parkTrees.push({ x, z, y: height(x, z), seed: random(`tree${i}`) });
  }
  const carPaths = blocks.filter((b, i) => b.parcels.length > 0 && i % 7 === 0).map((b) => [...b.polygon, b.polygon[0]]);

  // 城区锚点：第一名宿主在核心，其余绕核心等角分布再贴陆地，彼此至少隔 ~200。
  const anchorsPlaced: Array<Vec2 & { radius: number }> = [];
  const nominalAnchors = [core, around(turn + 1.6, 0.42 * R), around(turn + 3.7, 0.42 * R), around(turn + 5.3, 0.42 * R)];
  for (const nominal of nominalAnchors) {
    const q = snap(nominal, 40, [...anchorsPlaced, ...publicSites.map((site) => ({ x: site.x, z: site.z, radius: site.radius * 0.4 }))], 90);
    anchorsPlaced.push({ ...q, radius: 90 });
  }
  const districtAnchors = anchorsPlaced.map(({ x, z }) => ({ x, z }));

  // 内部高架：沿离核心偏南 0.2R 最近的一条网格横线，裁到陆地。
  let highwayRow = 0; let gap = Infinity;
  for (const [row, z] of zs) if (Math.abs(z - (core.z + 0.2 * R)) < gap) { gap = Math.abs(z - (core.z + 0.2 * R)); highwayRow = row; }
  const highwayZ = zs.get(highwayRow)!;
  const highwayRuns: Vec2[][] = [];
  const line: Vec2[] = [];
  for (let i = 0; i <= 100; i += 1) line.push(warp(xs.get(west)! + (xs.get(east)! - xs.get(west)!) * (i / 100), highwayZ));
  const onLand = (p: Vec2) => buildable(p.x, p.z);
  let start = 0; let end = line.length - 1;
  while (start < line.length && !onLand(line[start])) start += 1;
  while (end >= 0 && !onLand(line[end])) end -= 1;
  start = Math.max(0, start - 1); end = Math.min(line.length - 1, end + 1);
  if (end - start >= 8) highwayRuns.push(line.slice(start, end + 1));

  // 下游读的边界：全部由岛的实际包围盒推导（曾是常量 ±570 / -350..430 / 650 / 1600）。
  const urbanBounds = { left: bbox.minX + 30, right: bbox.maxX - 30, north: bbox.minZ + 30, south: bbox.maxZ - 30 };
  const boundsRadius = Math.max(bbox.maxX - bbox.minX, bbox.maxZ - bbox.minZ) / 2 + 40;
  const extent = Math.ceil((Math.max(Math.abs(bbox.minX), Math.abs(bbox.maxX), Math.abs(bbox.minZ), Math.abs(bbox.maxZ)) + 260) * 2 / 100) * 100;
  return { blocks, roadNodes: [...nodes.values()], roadEdges: [...edges.values()], terrain, extent, coast, river, publicSites, parkTrees,
    urbanBounds, bridges, boundsRadius, carPaths, districtAnchors, highways: highwayRuns, core, islandRadius: R };
}
