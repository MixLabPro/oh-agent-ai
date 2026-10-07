import { DetMath as Math } from "./detMath"; // 跨引擎确定性：见 detMath.ts
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
import { boulevardSegments, buildSeasideBand, MIAMI_COASTAL, seasideStripContains, type CoastalConfig, type SeasideBand, type SeasideWorld } from "./citySeaside";
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

/** 路段空间索引：按 CELL 分格，查询只看点周围的格子（全路段逐一算距离是规划生成的主要耗时：profile 里占 60%）。 */
export class SegmentIndex {
  private readonly cell = 60;
  private readonly cells = new Map<string, Array<[Vec2, Vec2]>>();
  constructor(runs: Vec2[][]) { for (const run of runs) for (let i = 1; i < run.length; i += 1) this.add(run[i - 1], run[i]); }
  add(a: Vec2, b: Vec2): void {
    const c = this.cell;
    for (let gx = Math.floor(Math.min(a.x, b.x) / c); gx <= Math.floor(Math.max(a.x, b.x) / c); gx += 1)
      for (let gz = Math.floor(Math.min(a.z, b.z) / c); gz <= Math.floor(Math.max(a.z, b.z) / c); gz += 1) {
        const key = `${gx}:${gz}`;
        const list = this.cells.get(key);
        if (list) list.push([a, b]); else this.cells.set(key, [[a, b]]);
      }
  }
  /** 点到任一路段的距离是否小于 d（d 不超过一个格宽，查询 3×3 格）。 */
  closerThan(p: Vec2, d: number): boolean {
    const gx = Math.floor(p.x / this.cell); const gz = Math.floor(p.z / this.cell);
    const reach = Math.ceil(d / this.cell);
    for (let dx = -reach; dx <= reach; dx += 1) for (let dz = -reach; dz <= reach; dz += 1) {
      const list = this.cells.get(`${gx + dx}:${gz + dz}`);
      if (list) for (const [a, b] of list) if (segmentDistance(p, a, b) < d) return true;
    }
    return false;
  }
}

/** Conservative footprint guard: includes the full deck and a sidewalk setback. */
export function clearsHighways(p: Vec2, width: number, depth: number, highways: Vec2[][] | SegmentIndex): boolean {
  const clearance = 5.25 + Math.hypot(width, depth) / 2 + 1;
  if (highways instanceof SegmentIndex) return !highways.closerThan(p, clearance);
  for (const run of highways) for (let i = 1; i < run.length; i += 1) {
    if (segmentDistance(p, run[i - 1], run[i]) < clearance) return false;
  }
  return true;
}

export type Biome = "tropical" | "temperate" | "boreal" | "savanna" | "eastasian";

/** 致敬型地标（SPEC §4.4）：程序化几何、不复刻具体建筑；纯装饰，不占会话地块、不进统计。 */
export type LandmarkKind = "tv-tower" | "sail-opera" | "arch" | "pagoda" | "lighthouse" | "ferris-wheel" | "suspension-bridge" | "twin-towers" | "twist-tower" | "villa-complex";
/** shore：海上小岛地标（歌剧院）的堤道陆地端；有它即「立在水中的岛上」，不适用陆地/岸滩规则。 */
export type Landmark = Vec2 & { id: string; kind: LandmarkKind; yaw: number; radius: number; to?: Vec2; shore?: Vec2 };
const BIOMES: Biome[] = ["tropical", "temperate", "boreal", "savanna", "eastasian"];

/** 每档对应的目标地块数（SPEC §4.2：400 会话一档 × 1.35 余量给公共用地、花园、配套与道路损耗）。 */
// 档位：每档 400 栋，按会话数逐档扩张大陆，最多 10 档 = 4000 栋（一年的会话）。
// 曾一度改成「1 档就预留 2000 栋」：会话少时整座岛空旷得像荒地（真机截图反馈），
// 所以初始面积回到原版的 400 栋一档，随数据逐步长大。
export const SESSIONS_PER_TIER = 400;
export const MAX_TIER = 10;
export function scaleTierFor(sessions: number): number {
  return Math.max(1, Math.min(MAX_TIER, Math.ceil(sessions / SESSIONS_PER_TIER)));
}
const targetParcels = (tier: number) => Math.ceil(SESSIONS_PER_TIER * tier * 1.35);

type Shape = {
  stretch: number; spin: number;
  harmonics: Array<{ k: number; a: number; p: number }>;
  bays: Array<{ at: number; depth: number; width: number }>;
};

export function createCityPlan(seed: number, tier = 2, config: CoastalConfig | null = null) {
  const random = (key: string) => hashSeed(`${seed}:${key}`);
  // 岛形参数（与半径无关）：放大时形状不变。
  const shape: Shape = {
    stretch: 0.78 + random("stretch") * 0.5,
    spin: random("spin") * Math.PI * 2,
    harmonics: [2, 3, 5].map((k) => ({ k, a: 0.05 + random(`h${k}`) * (k === 2 ? 0.16 : 0.1), p: random(`hp${k}`) * Math.PI * 2 })),
    bays: Array.from({ length: 1 + Math.floor(random("bays") * 3) }, (_, i) => ({ at: random(`bay${i}`) * Math.PI * 2, depth: 0.14 + random(`bayd${i}`) * 0.18, width: 0.18 + random(`bayw${i}`) * 0.25 })),
  };
  // 海滨配置（VICE B1）：提供 config 时强制生态带（miami-coastal → tropical），
  // 否则保持原有随机五选一——无配置调用方行为不变。
  const biome: Biome = config ? config.biome : BIOMES[Math.floor(random("biome") * BIOMES.length) % BIOMES.length];
  // 先按档位估一个半径，再按实测地块数校正（最多 4 次）：面积 ∝ R²。
  // 起始估计：390 半径 ≈ 一档 400 会话的地皮，再按实测地块数校正。
  let radius = 390 * Math.sqrt(tier);
  let plan = buildPlan(seed, radius, shape, biome, config, tier);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parcels = plan.blocks.reduce((sum, block) => sum + block.parcels.length, 0);
    if (parcels >= targetParcels(tier)) break;
    radius *= Math.sqrt(targetParcels(tier) / Math.max(1, parcels)) * 1.04;
    plan = buildPlan(seed, radius, shape, biome, config, tier);
  }
  return { ...plan, scaleTier: tier, biome };
}

function buildPlan(seed: number, R: number, shape: Shape, biome: Biome, config: CoastalConfig | null, tier: number) {
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
  // 离山脚留 12：山体高度从 hillLine−10 开始起坡，地块要落在 1.2 的平地上。
  const buildable = (x: number, z: number) => landClearance(x, z) > 12 && hillProj(x, z) < hillLine - 12;
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
  const snap = (nominal: Vec2, clearance: number, placed: Array<Vec2 & { radius: number }>, radius: number, accept?: (q: Vec2) => boolean): Vec2 => {
    for (let ring = 0; ring <= 60; ring += 1) {
      const steps = Math.max(1, ring * 8);
      for (let k = 0; k < steps; k += 1) {
        const a = (k / steps) * Math.PI * 2 + ring * 0.37;
        const q = { x: nominal.x + Math.cos(a) * ring * 12, z: nominal.z + Math.sin(a) * ring * 12 };
        if (landClearance(q.x, q.z) < clearance || hillProj(q.x, q.z) > hillLine - clearance * 0.5) continue;
        if (placed.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < o.radius + radius + 20)) continue;
        if (accept && !accept(q)) continue;
        return q;
      }
    }
    return nominal;
  };
  const around = (angle: number, distance: number): Vec2 => ({ x: core.x + Math.cos(angle) * distance, z: core.z + Math.sin(angle) * distance });
  const turn = random("siteTurn") * Math.PI * 2;

  // ── 公共用地：相对核心点放置再贴陆地（按条件选址在 G3 细化）。
  const publicSites: PublicSite[] = [];
  // 离水的最小距离：港口只要 ~24（堆场 1.5r×1.2r，近边正好落在水线上），其余预留地仍是 radius+14。
  // 曾一律 radius+14=51，港口中心被推到离水 ~60 的内陆，码头和吊车立在沙地上（拍照实测）。
  const siteClearance = (kind: string, radius: number) => (kind === "harbor" ? 24 : radius + 14);
  const place = (id: string, kind: PublicSite["kind"], nominal: Vec2, radius: number, yaw: number) => {
    const q = snap(nominal, siteClearance(kind, radius), publicSites, radius);
    publicSites.push({ id, kind, x: q.x, z: q.z, radius, yaw });
  };
  place("civic-square", "civic", core, 44, -0.15);
  // 广场被 snap 推离核心点（核心离水/河不够远）时，环岛、放射主干道、高架都还围着旧核心点画，于是市政广场孤零零
  // 偏在一旁、环岛中间是空的（用户截图；30 岛里 10 个岛偏 12–60）。广场挪到哪里，核心点就跟到哪里。
  { const plaza = publicSites[publicSites.length - 1]; core = { x: plaza.x, z: plaza.z }; }
  place("observation-tower", "tower", around(turn + 0.9, 0.16 * R), 26, 0);
  place("central-station", "station", around(turn + 2.2, 0.38 * R), 46, 0.12);
  place("riverside-park", "park", hasRiver ? { x: riverX(core.z + 0.18 * R) + riverWidth(core.z) + 60, z: core.z + 0.18 * R } : around(turn + 3.6, 0.3 * R), 47, 0);
  place("east-stadium", "stadium", around(turn + 4.8, 0.45 * R), 49, 0.2);
  {
    // 港口：离核心最近的一段海岸内侧（码头离市中心不远）。
    // 取离核心 ≥150 的最近岸点：核心贴海时（用户种子）曾取到市政广场旁的岸点，再被避让推进内陆，港口落在市中心（真机截图）。
    const byDistance = [...coast].sort((a, b) => Math.hypot(a.x - core.x, a.z - core.z) - Math.hypot(b.x - core.x, b.z - core.z));
    const shore = byDistance.find((p) => Math.hypot(p.x - core.x, p.z - core.z) >= 150) ?? byDistance[0];
    // 中心只内移 10：码头半边伸向水面（buildMarina 的栈桥由此入海）。
    const toCore = Math.max(1, Math.hypot(core.x - shore.x, core.z - shore.z));
    const inset = Math.min(10, toCore * 0.5);
    const inward = { x: shore.x + ((core.x - shore.x) / toCore) * inset, z: shore.z + ((core.z - shore.z) / toCore) * inset };
    place("working-harbor", "harbor", inward, 37, -Math.atan2(shore.z - core.z, shore.x - core.x));
  }

  // ── 致敬型地标：种子从候选里抽 2–3 座，按地理条件选址；和公共用地一样先于街区预留土地。
  const landmarks: Landmark[] = [];
  {
    const shoreOrder = [...coast].sort((p, q) => Math.hypot(p.x - core.x, p.z - core.z) - Math.hypot(q.x - core.x, q.z - core.z));
    const inwardFrom = (shore: Vec2, amount: number) => ({ x: shore.x + (core.x - shore.x) * amount, z: shore.z + (core.z - shore.z) * amount });
    const taken = () => [...publicSites, ...landmarks].map((site) => ({ x: site.x, z: site.z, radius: site.radius }));
    const candidates: Array<{ kind: LandmarkKind; weight: number; site: () => { at: Vec2; radius: number; clearance: number; yaw: number } | null }> = [
      { kind: "tv-tower", weight: 2, site: () => ({ at: around(turn + 0.4, 0.14 * R), radius: 16, clearance: 20, yaw: 0 }) },
      { kind: "twin-towers", weight: 1, site: () => ({ at: around(turn + 3.1, 0.12 * R), radius: 22, clearance: 20, yaw: turn }) },
      { kind: "twist-tower", weight: 1, site: () => ({ at: around(turn + 2.6, 0.17 * R), radius: 16, clearance: 20, yaw: 0 }) },
      { kind: "arch", weight: 1, site: () => ({ at: around(turn + 5.6, 0.26 * R), radius: 18, clearance: 20, yaw: turn + 5.6 }) },
      { kind: "sail-opera", weight: 2, site: () => { const shore = shoreOrder[Math.min(shoreOrder.length - 1, 3)]; return { at: inwardFrom(shore, 0.1), radius: 34, clearance: 16, yaw: -Math.atan2(shore.z - core.z, shore.x - core.x) }; } },
      { kind: "lighthouse", weight: 2, site: () => { const shore = shoreOrder[shoreOrder.length - 1]; return { at: inwardFrom(shore, 0.04), radius: 12, clearance: 6, yaw: 0 }; } },
      { kind: "ferris-wheel", weight: 2, site: () => { const shore = shoreOrder[Math.floor(shoreOrder.length * 0.45)]; return { at: inwardFrom(shore, 0.08), radius: 26, clearance: 14, yaw: -Math.atan2(shore.z - core.z, shore.x - core.x) + Math.PI / 2 }; } },
      { kind: "pagoda", weight: biome === "eastasian" ? 5 : 1, site: () => ({ at: { x: hillDir.x * (hillLine - 80), z: hillDir.z * (hillLine - 80) }, radius: 18, clearance: 18, yaw: hillAngle }) },
      // 地中海庄园：低层纪念性地标，天际线里「横向白楼 + 红陶坡顶」的断点。热带海滨优先；
      // 站位与帆顶剧院（shoreOrder[3]）错开；拱廊面（局部 +Z）朝向放置点看到的局部岸线方向，
      // 大岛上这与「朝城心反向」并不重合——平行水线才能读成滨海庄园。
      { kind: "villa-complex", weight: biome === "tropical" ? 4 : 1, site: () => { const shore = shoreOrder[Math.min(shoreOrder.length - 1, 5)]; const at = inwardFrom(shore, 0.08); return { at, radius: 34, clearance: 16, yaw: Math.atan2(shore.x - at.x, shore.z - at.z) }; } },
    ];
    // 数量随岛规模增长：1 档 4 座，每两档多一座，最多 7 座。曾固定抽 2–3 座：摩天轮只在 16/60 个种子里出现，
    // 真机反馈「原来的吊桥和摩天轮为什么没看见」。
    const count = Math.min(9, 6 + Math.floor((tier - 1) / 2)); // 固定地标增至 5 座（塔/庄园/摩天轮/歌剧院/灯塔），总数随之上调，仍给抽签留 1–4 席
    const pool = [...candidates];
    // Vice City 的第一眼轮廓需要一座 downtown 高塔；若完全按抽签，某些种子会
    // 只抽到灯塔/摩天轮/低矮文化馆，低会话量时整座城就像空地块规划图。
    // 高塔属于固定城市地标，不代表会话、不进数据统计；具体造型仍由 seed 决定。
    if (config?.profile === "miami-coastal") {
      const skylineKinds: LandmarkKind[] = ["twin-towers", "twist-tower"];
      const skylineKind = skylineKinds[Math.floor(random("miami-skyline") * skylineKinds.length)];
      const skylineIndex = pool.findIndex((candidate) => candidate.kind === skylineKind);
      if (skylineIndex >= 0) {
        const skyline = pool.splice(skylineIndex, 1)[0];
        // 双子塔与扭转塔二选一：固定高塔占位后，另一座不再进抽签池（曾在 5 档岛上两座同时出现）。
        for (let k = pool.length - 1; k >= 0; k -= 1) if (pool[k].kind === "twin-towers" || pool[k].kind === "twist-tower") pool.splice(k, 1);
        const site = skyline.site();
        if (site) {
          const q = snap(site.at, site.clearance, taken(), site.radius);
          landmarks.push({ id: `landmark:${skyline.kind}`, kind: skyline.kind, x: q.x, z: q.z, yaw: site.yaw, radius: site.radius });
        }
      }
    }
    // 摩天轮是海滨城的第二个固定标志（与高塔一样不代表会话），其余仍由种子抽选。
    if (config?.profile === "miami-coastal") {
      // 地中海庄园与摩天轮一样是海滨城固定地标（用户：「没有看见这些城市地标建筑物」——抽签抽不到就永远看不见）。
      // 海滨城识别锚点不靠抽签（用户：「种子彩票」——小档位的抽签名额被固定地标挤占，灯塔/帆顶剧院可能永远看不到）：
      // 帆形歌剧院与灯塔也固定放置，和庄园、摩天轮同一模式。
      for (const fixedKind of ["sail-opera", "lighthouse"] as LandmarkKind[]) {
        const index = pool.findIndex((candidate) => candidate.kind === fixedKind);
        if (index < 0) continue;
        const fixed = pool.splice(index, 1)[0];
        const site = fixed.site();
        if (!site) continue;
        const q = snap(site.at, site.clearance, taken(), site.radius);
        landmarks.push({ id: `landmark:${fixed.kind}`, kind: fixed.kind, x: q.x, z: q.z, yaw: site.yaw, radius: site.radius });
      }
      const villaIndex = pool.findIndex((candidate) => candidate.kind === "villa-complex");
      if (villaIndex >= 0) {
        const villa = pool.splice(villaIndex, 1)[0];
        const site = villa.site();
        if (site) {
          const q = snap(site.at, site.clearance, taken(), site.radius);
          landmarks.push({ id: `landmark:${villa.kind}`, kind: villa.kind, x: q.x, z: q.z, yaw: site.yaw, radius: site.radius });
        }
      }
      const wheelIndex = pool.findIndex((candidate) => candidate.kind === "ferris-wheel");
      if (wheelIndex >= 0) {
        const wheel = pool.splice(wheelIndex, 1)[0];
        const site = wheel.site();
        if (site) {
          const q = snap(site.at, site.clearance, taken(), site.radius);
          landmarks.push({ id: `landmark:${wheel.kind}`, kind: wheel.kind, x: q.x, z: q.z, yaw: site.yaw, radius: site.radius });
        }
      }
    }
    // 高塔已占一席；余下地标保持种子抽选。
    for (let n = landmarks.length; n < count && pool.length; n += 1) {
      const total = pool.reduce((sum, c) => sum + c.weight, 0);
      let pick = random(`landmark${n}`) * total;
      let index = 0;
      while (index < pool.length - 1 && pick >= pool[index].weight) { pick -= pool[index].weight; index += 1; }
      const chosen = pool.splice(index, 1)[0];
      // 双子塔与扭转塔同属 downtown 高塔：抽到一个就不再抽另一个。
      if (chosen.kind === "twin-towers" || chosen.kind === "twist-tower") for (let k = pool.length - 1; k >= 0; k -= 1) if (pool[k].kind === "twin-towers" || pool[k].kind === "twist-tower") pool.splice(k, 1);
      const site = chosen.site();
      if (!site) continue;
      const q = snap(site.at, site.clearance, taken(), site.radius);
      landmarks.push({ id: `landmark:${chosen.kind}`, kind: chosen.kind, x: q.x, z: q.z, yaw: site.yaw, radius: site.radius });
    }
  }
  /** 公共用地 + 地标：街区与地块都要避开的预留地。 */
  const reservations = () => [...publicSites, ...landmarks];

  // ── L2 骨架（CITY_PLANNING_SPEC §4.3）──
  // 主干道从核心放射、沿陆地延伸到海边，过河处自动成桥；环线高架绕核心一圈（沿陆地断续）；
  // 主干道之间每个扇区各铺一张朝向沿扇区放射方向的街网——不再是全岛一张方格（曾经整张方格盖在岛上）。
  const nodes = new Map<string, RoadNode>(); const edges = new Map<string, RoadEdge>();
  const coastalRoadEdgeIds = new Set<string>();
  const coastalRoadNodeIds = new Set<string>();
  const key = (p: Vec2) => ({ x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 });
  const addEdge = (a0: Vec2, b0: Vec2, arterial: boolean, bridge = false, primary = false) => {
    const a = key(a0); const b = key(b0);
    const from = roadNodeId(a); const to = roadNodeId(b); if (from === to) return;
    const id = [from, to].sort().join("/");
    nodes.set(from, { ...a, id: from }); nodes.set(to, { ...b, id: to });
    if (!edges.has(id)) edges.set(id, { id, from, to, width: primary ? 12 : arterial ? 8 : 5, kind: arterial ? "arterial" : "local", points: [a, b], bridge });
  };
  const inRiver = (x: number, z: number) => hasRiver && coastDistance(x, z) > 0 && Math.abs(x - riverX(z)) < riverWidth(z);

  // 市政广场（核心处，半径 44）外环路半径：主干道都接在这一圈上，广场四周是路、中间不走车。
  const PLAZA_RING = 52;
  const SHORE_SITE_KINDS = new Set(["harbor", "lighthouse", "sail-opera", "ferris-wheel", "villa-complex"]); // 庄园：临水拱廊，同属岸边地标
  // 主干道：5–6 条，均分方位 + 抖动；指向山脊的方向（与山脊方位夹角 < 40°）不修路。
  const trunkCount = 5 + Math.floor(random("trunks") * 2);
  const trunkBase = random("trunkBase") * Math.PI * 2;
  const trunks: Array<{ angle: number; points: Vec2[] }> = [];
  const bridges: CityLayout["bridges"] = [];
  for (let i = 0; i < trunkCount; i += 1) {
    const nominal = trunkBase + (i / trunkCount) * Math.PI * 2 + (random(`trunkJ${i}`) - 0.5) * 0.35;
    // 桥址取最窄处（规划旧债 D-桥址，CITY_ROAD_SIMULATION_PROPOSAL §1）：主干道是从核心出发的射线，过河位置
    // 曾由抖动角度偶然决定。在 ±0.14 弧度内选过河跨距最短的角度；跨距相同取偏移最小者，尽量不动原规划。
    const waterSpan = (a: number) => {
      const d = { x: Math.cos(a), z: Math.sin(a) };
      let span = 0; let entered = false;
      for (let step = Math.ceil(PLAZA_RING / 12) + 1; step < 400; step += 1) {
        const q = { x: core.x + d.x * step * 12, z: core.z + d.z * step * 12 };
        if (inRiver(q.x, q.z)) { span += 12; entered = true; continue; }
        if (entered || coastDistance(q.x, q.z) <= 0) break;
      }
      return span;
    };
    let angle = nominal;
    if (hasRiver) {
      let best = { offset: 0, span: waterSpan(nominal) };
      if (best.span > 0) for (let k = -7; k <= 7; k += 1) {
        const offset = k * 0.02; const span = waterSpan(nominal + offset);
        if (span > 0 && (span < best.span || (span === best.span && Math.abs(offset) < Math.abs(best.offset)))) best = { offset, span };
      }
      angle = nominal + best.offset;
    }
    const dir = { x: Math.cos(angle), z: Math.sin(angle) };
    if (dir.x * hillDir.x + dir.z * hillDir.z > Math.cos((40 * Math.PI) / 180)) continue;
    // 主干道从市政广场外环出发（环形广场 = 环岛），不再穿过广场中心。
    const start = { x: core.x + dir.x * PLAZA_RING, z: core.z + dir.z * PLAZA_RING };
    const points: Vec2[] = [start];
    let water = 0;
    let lastLand: Vec2 = start;
    let farBank = 0;
    for (let step = Math.ceil(PLAZA_RING / 12) + 1; step < 400; step += 1) {
      const q = { x: core.x + dir.x * step * 12, z: core.z + dir.z * step * 12 };
      if (inRiver(q.x, q.z)) {
        // 入水前的最后一个陆地点作为桥头（曾用「每 3 步才记一次」的上一个路点，桥头最多退回岸上 36）。
        if (water === 0 && points[points.length - 1] !== lastLand) points.push(lastLand);
        water += 12; if (water > 140) break; continue; // 河：最多跨 140
      }
      // Riverbank setbacks are not obstacles to a road crossing the river.
      if (coastDistance(q.x, q.z) <= 0 || hillProj(q.x, q.z) >= hillLine - 12) break;
      // 岸边用地（港口/灯塔/歌剧院/摩天轮）：主干道到它门口为止，这一段就是它的入口路。
      // 曾一路穿过去直到海边（港口中心离主干道 1 单位）。
      if (water === 0 && [...publicSites, ...landmarks].some((site) => SHORE_SITE_KINDS.has(site.kind) && Math.hypot(q.x - site.x, q.z - site.z) < site.radius + 4)) {
        if (points[points.length - 1] !== lastLand) points.push(lastLand);
        break;
      }
      if (water > 0) {
        // 对岸退界最多再铺 3 步（36）桥面就落地：曾一直延伸到「可建设」地块为止——对岸是一长条不可建的
        // 低地/海岸带时，「桥」在干地上又铺了两百多单位（扩到 1 档 2000 栋的大岛后 seed 2175747322 实测）。
        if (!buildable(q.x, q.z) && farBank < 3) { farBank += 1; continue; }
        farBank = 0;
        // 刚过完河：把对岸点接上，这一段是桥。
        const from = points[points.length - 1];
        bridges.push({ from, to: q, angle: Math.atan2(q.z - from.z, q.x - from.x), length: Math.hypot(q.x - from.x, q.z - from.z) });
        addEdge(from, q, true, true, true);
        points.push(q);
        water = 0;
        continue;
      }
      lastLand = q;
      if (step % 3 === 0) points.push(q);
    }
    if (points.length < 3) continue;
    for (let k = 1; k < points.length; k += 1) {
      const isBridge = bridges.some((bridge) => bridge.to === points[k]);
      if (!isBridge) addEdge(points[k - 1], points[k], true, false, true);
    }
    trunks.push({ angle, points });
  }
  trunks.sort((p, q) => p.angle - q.angle);
  // 广场环路：经过每条主干道的起点，其余按 24 等分补点；跨河/不可建的弧段不修。
  {
    const angles = [...trunks.map((t) => ((t.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)),
      ...Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2)].sort((a, b) => a - b)
      .filter((a, i, all) => i === 0 || a - all[i - 1] > 0.08);
    const ringPoint = (a: number) => {
      const trunk = trunks.find((t) => Math.abs((((t.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - a) < 1e-9);
      return trunk ? trunk.points[0] : { x: core.x + Math.cos(a) * PLAZA_RING, z: core.z + Math.sin(a) * PLAZA_RING };
    };
    for (let i = 0; i < angles.length; i += 1) {
      const a = ringPoint(angles[i]); const b = ringPoint(angles[(i + 1) % angles.length]);
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      if (inRiver(mid.x, mid.z) || inRiver(a.x, a.z) || inRiver(b.x, b.z) || coastDistance(mid.x, mid.z) <= 0) continue;
      addEdge(a, b, true);
    }
  }
  const trunkIndex = new SegmentIndex(trunks.map((trunk) => trunk.points));
  const distanceToTrunks = (p: Vec2) => {
    let d = Infinity;
    for (const trunk of trunks) for (let k = 1; k < trunk.points.length; k += 1) d = Math.min(d, segmentDistance(p, trunk.points[k - 1], trunk.points[k]));
    return d;
  };

  // 环线高架：半径 0.55R ± fbm，河流/河岸连续跨越，仅出海或进山时断开。
  const ringRadius = 0.55 * R;
  const ringRuns: Vec2[][] = [];
  let run: Vec2[] = [];
  for (let i = 0; i <= 96; i += 1) {
    const t = (i / 96) * Math.PI * 2;
    const r = ringRadius * (1 + 0.08 * fbm(Math.cos(t) * 1.7, Math.sin(t) * 1.7, seed + 91, 2));
    const q = { x: core.x + Math.cos(t) * r, z: core.z + Math.sin(t) * r };
    if (coastDistance(q.x, q.z) > 0 && hillProj(q.x, q.z) < hillLine - 12) run.push(q);
    else { if (run.length >= 6) ringRuns.push(run); run = []; }
  }
  if (run.length >= 6) ringRuns.push(run);
  // Highway fragments stop at the coast today, where the deck still hangs above
  // the ground. Trim each end to buildable land, then connect it to a nearby arterial.
  for (let r = ringRuns.length - 1; r >= 0; r -= 1) {
    const points = ringRuns[r];
    if (Math.hypot(points[0].x - points[points.length - 1].x, points[0].z - points[points.length - 1].z) < 0.01) continue;
    const safe = (p: Vec2) => buildable(p.x, p.z);
    while (points.length > 6 && !safe(points[0])) points.shift();
    while (points.length > 6 && !safe(points[points.length - 1])) points.pop();
    if (points.length <= 6) { ringRuns.splice(r, 1); continue; }
    const exits: Vec2[] = [];
    for (const end of [points[0], points[points.length - 1]]) {
      const candidates: Array<{ p: Vec2; distance: number }> = [];
      for (const edge of edges.values()) {
        if (edge.bridge) continue;
        const [a, b] = edge.points;
        const dx = b.x - a.x; const dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((end.x - a.x) * dx + (end.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
        const p = key({ x: a.x + t * dx, z: a.z + t * dz });
        if (Math.hypot(p.x - core.x, p.z - core.z) < 110) continue; // 出口不能落在环岛附近：高架贴到市政广场（半径 44 + 避让 ≈ 69）会把广场推离核心点
        const distance = Math.hypot(p.x - end.x, p.z - end.z);
        const samples = Math.max(1, Math.ceil(distance / 4));
        let clear = true;
        for (let k = 0; k <= samples; k += 1) {
          if (!safe({ x: end.x + (p.x - end.x) * k / samples, z: end.z + (p.z - end.z) * k / samples })) { clear = false; break; }
        }
        if (clear) candidates.push({ p, distance });
      }
      candidates.sort((a, b) => a.distance - b.distance);
      if (candidates[0]) exits.push(candidates[0].p);
    }
    if (exits.length !== 2) { ringRuns.splice(r, 1); continue; }
    ringRuns[r] = [exits[0], ...points, exits[1]].filter((p, i, all) => i === 0 || Math.hypot(p.x - all[i - 1].x, p.z - all[i - 1].z) > 0.01);
    for (const endpoint of exits) for (const edge of [...edges.values()]) {
      if (edge.bridge || segmentDistance(endpoint, edge.points[0], edge.points[1]) > 0.02) continue;
      edges.delete(edge.id);
      addEdge(edge.points[0], endpoint, true);
      addEdge(endpoint, edge.points[1], true);
    }
  }
  // 公共用地与地标先于环线选址，名义位置可能正压在高架上（clearsHighways 守卫只覆盖了地块/配套/花园）：
  // 环线只取决于核心点与岛半径，所以这里把压线的预留地原地重新贴到不压高架的位置；街区与地块都在此之后生成。
  for (const site of [...publicSites, ...landmarks]) {
    if (!site.radius || clearsHighways(site, site.radius * 2, site.radius * 2, ringRuns)) continue;
    const others = [...publicSites, ...landmarks].filter((o) => o !== site).map((o) => ({ x: o.x, z: o.z, radius: o.radius }));
    const q = snap(site, siteClearance(site.kind, site.radius), others, site.radius, (c) => clearsHighways(c, site.radius * 2, site.radius * 2, ringRuns));
    site.x = q.x; site.z = q.z;
  }
  // ── 用地临街（R2）：内陆的公共用地与地标贴到最近主干道的一侧（边缘离路肩 6），朝向与道路对齐。
  // 曾在主干道之前按地理选址、之后互不避让：车站中心正压在主干道上，10 个对象没有一个与门前道路对齐。
  // 岸边对象（港口、灯塔、歌剧院、摩天轮）保持海岸位置，稍后补一条入口路。
  // 占地内外两圈 16 个点都得是干地（高于 0.8、不在河道里）：水面渲染还盖住低矮的河岸坡，只看到河道中线的距离不够。
  const footprintDry = (c: Vec2, r: number) => {
    for (let k = 0; k < 16; k += 1) {
      const a = (k / 16) * Math.PI * 2; const rr = k % 2 ? r : r * 0.6;
      const x = c.x + Math.cos(a) * rr; const z = c.z + Math.sin(a) * rr;
      if (height(x, z) < 0.8 || inRiver(x, z)) return false;
    }
    return true;
  };
  const SHORE_BOUND = new Set([...SHORE_SITE_KINDS, "civic"]); // civic = 核心广场，四周是环路
  // 桥头（过河桥两端）：用地不能贴着桥头——桥头必须接一条路回路网，那条路就只能从用地里穿过（庄园落在桥头旁 21，规划守卫抓到）。
  const nearBridgeEnd = (x: number, z: number, radius: number) => bridges.some((b) => Math.hypot(b.from.x - x, b.from.z - z) < radius + 14 || Math.hypot(b.to.x - x, b.to.z - z) < radius + 14);
  const trunkSegments = trunks.flatMap((trunk) => trunk.points.slice(1).map((b, k) => [trunk.points[k], b] as const))
    .filter(([a, b]) => !bridges.some((bridge) => bridge.to === b || bridge.from === a && bridge.to === b));
  // 岸边地标（歌剧院、摩天轮、灯塔、庄园）向核心方向内移，直到占地圈 16 点里落在水上的 ≤3 个——
  // 曾按「离核心最近的海岸点」放下就不管了，约三分之一占地悬在海面上（场景依赖守卫抓到）。港口本就临水，除外。
  for (const site of landmarks) {
    if (!site.radius || !SHORE_SITE_KINDS.has(site.kind)) continue;
    const wetCount = (c: Vec2) => { let n = 0; for (let k = 0; k < 16; k += 1) { const t = (k / 16) * Math.PI * 2; const r = k % 2 ? site.radius : site.radius * 0.6; if (height(c.x + Math.cos(t) * r, c.z + Math.sin(t) * r) < 0.5) n += 1; } return n; };
    const dx = core.x - site.x; const dz = core.z - site.z; const len = Math.hypot(dx, dz) || 1;
    // 每步都要求中心仍在陆上、不在河里：直线朝核心走可能跨过河道（geography 守卫 seed 3668352332 抓到摩天轮进河）。
    for (let step = 0; step < 20 && wetCount(site) > 3; step += 1) {
      const nx = site.x + (dx / len) * 3; const nz = site.z + (dz / len) * 3;
      if (height(nx, nz) <= 0.5 || inRiver(nx, nz) || distanceToTrunks({ x: nx, z: nz }) < site.radius + 4 || nearBridgeEnd(nx, nz, site.radius)) break; // 也不推到主干道/桥头上
      site.x = nx; site.z = nz;
    }
  }
  // 跨路地标（门式）：凯旋门骑在主干道上、道路从拱券开口穿过——曾与其它用地一样贴到路旁，门下是草地
  // （用户截图：「凯旋门下面不是路？建筑物缺少约束」）。取最近主干道中段，开口轴（局部 z）沿道路方向。
  const STRADDLE = new Set(["arch"]);
  for (const site of landmarks) {
    if (!STRADDLE.has(site.kind)) continue;
    const ranked = trunkSegments.map(([a, b]) => ({ a, b, d: segmentDistance(site, a, b) })).sort((x, y) => x.d - y.d);
    const others = [...publicSites, ...landmarks].filter((o) => o !== site && o.radius);
    for (const { a, b } of ranked) {
      const dx = b.x - a.x; const dz = b.z - a.z; const len = Math.hypot(dx, dz);
      if (len < 20) continue;
      const q = { x: a.x + dx * 0.5, z: a.z + dz * 0.5 };
      if (!buildable(q.x, q.z) || !footprintDry(q, site.radius)) continue;
      if (!clearsHighways(q, site.radius * 2, site.radius * 2, ringRuns)) continue; // 不能压在环线高架下（geography 守卫）
      if (others.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < o.radius + site.radius + 10)) continue;
      site.x = q.x; site.z = q.z; site.yaw = Math.atan2(dx, dz);
      break;
    }
  }
  for (const site of [...publicSites, ...landmarks]) {
    if (!site.radius || SHORE_BOUND.has(site.kind) || STRADDLE.has(site.kind)) continue;
    const ranked = trunkSegments.map(([a, b]) => ({ a, b, d: segmentDistance(site, a, b) })).sort((x, y) => x.d - y.d).slice(0, 4);
    const others = [...publicSites, ...landmarks].filter((o) => o !== site && o.radius);
    let placed = false;
    for (const { a, b } of ranked) {
      const dx = b.x - a.x; const dz = b.z - a.z; const len = Math.hypot(dx, dz) || 1;
      const t = Math.max(0.2, Math.min(0.8, ((site.x - a.x) * dx + (site.z - a.z) * dz) / (len * len)));
      const foot = { x: a.x + dx * t, z: a.z + dz * t };
      let nx = -dz / len; let nz = dx / len;
      if ((site.x - foot.x) * nx + (site.z - foot.z) * nz < 0) { nx = -nx; nz = -nz; }
      for (const sign of [1, -1]) {
        const offset = site.radius + 12;
        const q = { x: foot.x + nx * sign * offset, z: foot.z + nz * sign * offset };
        // 整个占地都要在陆上：曾只要求中心离水 0.6 半径，双子塔（两塔各偏 13）一半立进河里（真机截图）。
        if (!buildable(q.x, q.z) || landClearance(q.x, q.z) < site.radius + 4 || !footprintDry(q, site.radius)) continue;
        if (distanceToTrunks(q) < site.radius + 8) continue;               // 别的主干道也不能穿过它
        if (!clearsHighways(q, site.radius * 2, site.radius * 2, ringRuns)) continue;
        if (others.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < o.radius + site.radius + 10)) continue;
        site.x = q.x; site.z = q.z; site.yaw = -Math.atan2(dz, dx);
        placed = true; break;
      }
      if (placed) break;
    }
    // 找不到临街位置时，至少别让主干道从中间穿过：就近挪到离主干道 ≥ 半径+8 的位置。
    if (!placed && distanceToTrunks(site) < site.radius + 6) {
      const q = snap(site, siteClearance(site.kind, site.radius), others.map((o) => ({ x: o.x, z: o.z, radius: o.radius })), site.radius,
        (c) => distanceToTrunks(c) >= site.radius + 8 && landClearance(c.x, c.z) >= site.radius + 4 && footprintDry(c, site.radius) && clearsHighways(c, site.radius * 2, site.radius * 2, ringRuns));
      site.x = q.x; site.z = q.z;
    }
  }
  for (const site of [...publicSites, ...landmarks]) {
    if (!site.radius || SHORE_BOUND.has(site.kind) || STRADDLE.has(site.kind) || (landClearance(site.x, site.z) >= site.radius + 4 && footprintDry(site, site.radius))) continue;
    const others = [...publicSites, ...landmarks].filter((o) => o !== site && o.radius).map((o) => ({ x: o.x, z: o.z, radius: o.radius }));
    const q = snap(site, siteClearance(site.kind, site.radius), others, site.radius,
      (c) => landClearance(c.x, c.z) >= site.radius + 4 && footprintDry(c, site.radius) && distanceToTrunks(c) >= site.radius + 8 && clearsHighways(c, site.radius * 2, site.radius * 2, ringRuns));
    site.x = q.x; site.z = q.z;
  }
  // 港口最后贴回岸线：前面的避让（离其它用地、离环线高架）会把它推进内陆，港口离水上百（用户截图：港口在市中心）。
  // 朝最近的岸点逐步移动，直到中心离岸 ≤ 12（码头半边伸进水面）。
  for (const site of publicSites) {
    if (site.kind !== "harbor") continue;
    let nearest = coast[0];
    for (const q of coast) if (Math.hypot(q.x - site.x, q.z - site.z) < Math.hypot(nearest.x - site.x, nearest.z - site.z)) nearest = q;
    for (let step = 0; step < 80 && coastDistance(site.x, site.z) > 12; step += 1) {
      const dx = nearest.x - site.x; const dz = nearest.z - site.z; const len = Math.hypot(dx, dz) || 1;
      site.x += (dx / len) * 3; site.z += (dz / len) * 3;
    }
    site.yaw = -Math.atan2(nearest.z - core.z, nearest.x - core.x);
  }
  // 岸边地标（帆形歌剧院、灯塔、摩天轮、庄园）同样贴回岸线（用户：「类似悉尼歌剧院的建筑不是应该在水边吗」）：
  // 朝最近岸点移动到中心离岸 ≈ 0.7 半径，同时占地圈 16 点落水不超过 3（立在水边、不悬空）。
  for (const site of landmarks) {
    if (!site.radius || !SHORE_SITE_KINDS.has(site.kind)) continue;
    const wet = (x: number, z: number) => { let n = 0; for (let k = 0; k < 16; k += 1) { const t = (k / 16) * Math.PI * 2; const r = k % 2 ? site.radius : site.radius * 0.6; const px = x + Math.cos(t) * r; const pz = z + Math.sin(t) * r; if (height(px, pz) < 0.5 || inRiver(px, pz) || (hasRiver && Math.abs(px - riverX(pz)) < riverWidth(pz) + 14)) n += 1; } return n; }; // 河道及两岸 14 内也算水：歌剧院曾立在河口上（用户截图）
    const others = [...publicSites, ...landmarks].filter((o) => o !== site && o.radius);
    // 试最近的 8 个岸点，取最终离岸最近的落点（一条路径被别的用地挡住时换个方向贴岸）。
    const targets = [...coast].sort((a, b) => Math.hypot(a.x - site.x, a.z - site.z) - Math.hypot(b.x - site.x, b.z - site.z)).slice(0, 8);
    let best = { x: site.x, z: site.z, d: coastDistance(site.x, site.z) };
    for (const target of targets) {
      let x = site.x; let z = site.z;
      for (let step = 0; step < 100 && coastDistance(x, z) > site.radius * 0.7; step += 1) {
        const dx = target.x - x; const dz = target.z - z; const len = Math.hypot(dx, dz) || 1;
        const nx = x + (dx / len) * 3; const nz = z + (dz / len) * 3;
        if (wet(nx, nz) > 3 || inRiver(nx, nz) || nearBridgeEnd(nx, nz, site.radius) || distanceToTrunks({ x: nx, z: nz }) < site.radius + 4 || !clearsHighways({ x: nx, z: nz }, site.radius * 2, site.radius * 2, ringRuns) || others.some((o) => Math.hypot(o.x - nx, o.z - nz) < o.radius + site.radius)) break; // 不滑到主干道上
        x = nx; z = nz;
      }
      const d = coastDistance(x, z);
      if (d < best.d) best = { x, z, d };
    }
    if (wet(best.x, best.z) <= 3 && (distanceToTrunks(best) >= site.radius * 0.7 || distanceToTrunks(site) < site.radius * 0.7)) { site.x = best.x; site.z = best.z; } // 落点压到主干道上就留在原位
    // 仍有 >3 点在水上（原位本就半悬空，核心方向也可能隔着水）：在 70 内按距离由近到远搜一个占地干燥、不压主干道/其它用地的落点。
    if (wet(site.x, site.z) > 3) {
      let found: Vec2 | null = null;
      for (let rr = 6; rr <= 70 && !found; rr += 6) {
        for (let k = 0; k < 24 && !found; k += 1) {
          const a = (k / 24) * Math.PI * 2; const nx = site.x + Math.cos(a) * rr; const nz = site.z + Math.sin(a) * rr;
          if (wet(nx, nz) > 2 || height(nx, nz) <= 0.5 || distanceToTrunks({ x: nx, z: nz }) < site.radius + 4) continue;
          if (!clearsHighways({ x: nx, z: nz }, site.radius * 2, site.radius * 2, ringRuns) || others.some((o) => Math.hypot(o.x - nx, o.z - nz) < o.radius + site.radius)) continue;
          found = { x: nx, z: nz };
        }
      }
      if (found) { site.x = found.x; site.z = found.z; }
    }
  }
  // 帆形歌剧院改立在海上小岛、以堤道连岸（用户：「歌剧院不应该在河里，需要在海上」「范式和机场一样」）。
  // 取离当前位置最近的几个岸点，岸外 radius+40 处整个占地圈必须是深水（不在河口），且离港口/其它用地够远。
  for (const site of landmarks) {
    if (site.kind !== "sail-opera") continue;
    const others = [...publicSites, ...landmarks].filter((o) => o !== site && o.radius);
    const targets = [...coast].sort((a, b) => Math.hypot(a.x - site.x, a.z - site.z) - Math.hypot(b.x - site.x, b.z - site.z)).slice(0, 40);
    for (const shore of targets) {
      const len = Math.hypot(shore.x - core.x, shore.z - core.z) || 1;
      const out = { x: (shore.x - core.x) / len, z: (shore.z - core.z) / len };
      const c = { x: shore.x + out.x * (site.radius + 40), z: shore.z + out.z * (site.radius + 40) };
      let deep = true;
      for (let k = 0; k < 16 && deep; k += 1) { const t = (k / 16) * Math.PI * 2; const r = k % 2 ? site.radius : site.radius * 0.6; const x = c.x + Math.cos(t) * r; const z = c.z + Math.sin(t) * r; if (height(x, z) > -0.8 || inRiver(x, z) || (hasRiver && Math.abs(x - riverX(z)) < riverWidth(z) + 60)) deep = false; }
      if (!deep || others.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < o.radius + site.radius + (o.kind === "harbor" ? 120 : 30))) continue;
      if (height(shore.x - out.x * 6, shore.z - out.z * 6) < 0.3) continue; // 堤道陆地端要踩在实地上
      site.x = c.x; site.z = c.z; site.shore = { x: shore.x - out.x * 6, z: shore.z - out.z * 6 };
      site.yaw = -Math.atan2(out.z, out.x);
      break;
    }
  }
  const ringIndex = new SegmentIndex(ringRuns);
  const distanceToRing = (p: Vec2) => {
    let d = Infinity;
    for (const ring of ringRuns) for (let k = 1; k < ring.length; k += 1) d = Math.min(d, segmentDistance(p, ring[k - 1], ring[k]));
    return d;
  };

  // ── 海滨带（VICE B1）：选段避开港口与河口朝向；街区/地块避开保留带。
  // 港口已按「离核心最近海岸」放置，其方位由站点位置推出；河口 = 海岸点中离河中线近的两侧。
  let seaside: SeasideBand | null = null;
  if (config) {
    const blockedAzimuths: Array<{ at: number; halfWidth: number; weight?: number }> = [];
    const azimuthOf = (p: Vec2) => { let a = Math.atan2(p.z - core.z, p.x - core.x); if (a < 0) a += Math.PI * 2; return a; };
    for (const site of publicSites) if (site.kind === "harbor") blockedAzimuths.push({ at: azimuthOf(site), halfWidth: (30 * Math.PI) / 180, weight: 3 });
    if (hasRiver) {
      for (const point of coast) {
        if (Math.abs(point.x - riverX(point.z)) < riverWidth(point.z) + 30) blockedAzimuths.push({ at: azimuthOf(point), halfWidth: (14 * Math.PI) / 180 });
      }
    }
    const world: SeasideWorld = {
      landSignedDistance: coastDistance,
      height,
      slope: (x, z) => Math.hypot(height(x + 1, z) - height(x - 1, z), height(x, z + 1) - height(x, z - 1)) / 2,
      riverDistance: (x, z) => (hasRiver ? Math.abs(x - riverX(z)) - riverWidth(z) : Infinity),
      reservations: [...publicSites, ...landmarks].map((site) => ({ x: site.x, z: site.z, radius: site.radius })),
      blockedAzimuths,
    };
    seaside = buildSeasideBand(coast, core, world, config, seed);
  }

  // 滨海大道位于酒店排与棕榈步道之间。只消费合法连续岸段；无效样本处断开，
  // 不把水口/陡岸/港区缺口直线跨接。路段复用主干道宽度、路面纹理与路缘批次。
  const coastalRoadRuns = seaside && !seaside.degraded ? boulevardSegments(seaside).map((segment) => segment.map(key)) : [];
  for (const segment of coastalRoadRuns) {
    for (let k = 1; k < segment.length; k += 1) {
      const a = key(segment[k - 1]); const b = key(segment[k]);
      addEdge(a, b, true, false, true);
      const aId = roadNodeId(a); const bId = roadNodeId(b);
      coastalRoadNodeIds.add(aId); coastalRoadNodeIds.add(bId);
      coastalRoadEdgeIds.add([aId, bId].sort().join("/"));
    }
  }
  const trimmedTrunkEnds: Vec2[] = []; // 下方 connectToNetwork 定义后接入大道
  // 主干道先于海滨带生成，可能恰好沿着后来的海滨大道走到海边（两条宽路叠在一起，seed 1703326634 1 档）。
  // 大道铺好后，删去两端都在 18 内的主干道段，主干道新的断头再接入大道。
  if (coastalRoadRuns.length) {
    const boulevardIndex = new SegmentIndex(coastalRoadRuns);
    const loose: Vec2[] = [];
    for (const edge of [...edges.values()]) {
      if (edge.bridge || coastalRoadEdgeIds.has(edge.id) || edge.width < 12) continue;
      const [a, b] = edge.points;
      if (!boulevardIndex.closerThan(a, 18) || !boulevardIndex.closerThan(b, 18)) continue;
      edges.delete(edge.id); loose.push(a, b);
    }
    const degree = (p: Vec2) => { const id = roadNodeId(key(p)); let d = 0; for (const e of edges.values()) if (e.from === id || e.to === id) d += 1; return d; };
    for (const p of loose) {
      if (coastalRoadNodeIds.has(roadNodeId(key(p)))) continue;
      const d = degree(p);
      if (d === 0) { nodes.delete(roadNodeId(key(p))); continue; }
      if (d === 1) trimmedTrunkEnds.push(p);
    }
  }

  // ── 环岛滨海路（规划总纲 S1，Lynch「边界要被路径看见」）：沿整条海岸、离水线 22 单位一条连续道路。
  // 曾只有海滨景观那 85° 一段有大道，其余海岸没有路（真机：住宅区一直延伸到海边却没有沿海道路）。
  // 跳过：海滨景观段（已有大道）、山体、河口、岸边用地；按连续可用段成路，段端稍后接入路网。
  const COAST_ROAD_OFFSET = 22;
  const coastRoadRuns: Vec2[][] = [];
  let coastalRunCount = 0; // 之前是环岛滨海路段，之后是河岸路段（S3 滨海景观带只沿前者铺）
  {
    const existingPrimary = new SegmentIndex([...edges.values()].filter((edge) => edge.width >= 12).map((edge) => edge.points));
    const n = coast.length;
    const offsetPoint = (i: number) => {
      const p = coast[i]; const prev = coast[(i - 1 + n) % n]; const next = coast[(i + 1) % n];
      let nx = -(next.z - prev.z); let nz = next.x - prev.x; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      if (nx * (core.x - p.x) + nz * (core.z - p.z) < 0) { nx = -nx; nz = -nz; }
      return { x: p.x + nx * COAST_ROAD_OFFSET, z: p.z + nz * COAST_ROAD_OFFSET };
    };
    const usable = (q: Vec2) => coastDistance(q.x, q.z) > 10 && !inRiver(q.x, q.z) && landClearance(q.x, q.z) > 10
      && hillProj(q.x, q.z) < hillLine - 12 && height(q.x, q.z) < 6
      && !(seaside && seasideStripContains(seaside, q, 6))
      && !reservations().some((site) => Math.hypot(q.x - site.x, q.z - site.z) < site.radius + 8)
      && !ringIndex.closerThan(q, 10)
      && !existingPrimary.closerThan(q, 26); // 已有主干道/海滨大道经过的岸段不再并排修一条
    const pts = Array.from({ length: n }, (_, i) => offsetPoint(i));
    const ok = pts.map(usable);
    // 从一个不可用点开始绕一圈，切出连续段（全可用时就是闭环）。
    const start = ok.indexOf(false);
    let current: Vec2[] = [];
    for (let k = 0; k <= n; k += 1) {
      const i = start < 0 ? k % n : (start + k) % n;
      const a = current[current.length - 1];
      const chordOk = !a || [0.25, 0.5, 0.75].every((t) => usable({ x: a.x + (pts[i].x - a.x) * t, z: a.z + (pts[i].z - a.z) * t }));
      if (ok[i] && chordOk) current.push(pts[i]);
      else { if (current.length >= 3) coastRoadRuns.push(current); current = ok[i] ? [pts[i]] : []; }
    }
    if (current.length >= 3) coastRoadRuns.push(current);
    // ── 河岸路（规划总纲 S2）：河是城市的另一条「边界」，两岸各一条沿河道路（离河道边缘 14），
    // 遇主干道/桥头/预留地断开，段端稍后以 T 路口接入。与环岛滨海路共用一套接入、避让与街网退让逻辑。
    coastalRunCount = coastRoadRuns.length;
    if (hasRiver) {
      const existingArterial = new SegmentIndex([...edges.values()].filter((edge) => edge.width >= 8 && !edge.bridge).map((edge) => edge.points));
      const riverUsable = (q: Vec2) => coastDistance(q.x, q.z) > 14 && !inRiver(q.x, q.z) && landClearance(q.x, q.z) > 8
        && hillProj(q.x, q.z) < hillLine - 12 && height(q.x, q.z) < 6
        && !(seaside && seasideStripContains(seaside, q, 6))
        && !reservations().some((site) => Math.hypot(q.x - site.x, q.z - site.z) < site.radius + 8)
        // 不再避让环线高架：高架是架空的，河岸路从桥下穿过（曾在高架两侧各断一截，真机截图「道路缺少连接」）。
        && !existingArterial.closerThan(q, 28); // 28 > 规划守卫的「拥挤」阈值 25：曾 22，地标改位后 24–25 处并行被计为拥挤
      for (const side of [-1, 1]) {
        let runPts: Vec2[] = [];
        for (let z = bbox.minZ; z <= bbox.maxZ; z += 20) {
          const q = { x: riverX(z) + side * (riverWidth(z) + 14), z };
          const last = runPts[runPts.length - 1];
          const chordOk = !last || riverUsable({ x: (last.x + q.x) / 2, z: (last.z + q.z) / 2 });
          if (riverUsable(q) && chordOk) runPts.push(q);
          else { if (runPts.length >= 3) coastRoadRuns.push(runPts); runPts = riverUsable(q) ? [q] : []; }
        }
        if (runPts.length >= 3) coastRoadRuns.push(runPts);
      }
    }
    // 主干级（宽 12）：与海滨大道同级，平行的街网道路据此降级为支路。
    for (const runPts of coastRoadRuns) for (let k = 1; k < runPts.length; k += 1) addEdge(runPts[k - 1], runPts[k], true, false, true);
  }
  const coastRoadIndex = new SegmentIndex(coastRoadRuns);

  // 两端都接入陆侧主干道，避免只有拓扑连通但车辆到大道时会瞬移/断头。
  // 连接线按 4 单位采样，避让水面、陡坡、海岸和市政/地标预留地。
  const safeRoadLink = (a: Vec2, b: Vec2) => {
    const distance = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(distance / 4));
    for (let i = 0; i <= steps; i += 1) {
      const p = { x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps };
      if (!buildable(p.x, p.z) || terrain.slope(p.x, p.z) > 0.9) return false;
      if (reservations().some((site) => Math.hypot(p.x - site.x, p.z - site.z) < site.radius + 5)) return false;
    }
    return true;
  };
  // ── 接入路（Parish–Müller 式 localConstraints）：把一个端点「垂直」接到最近的已有路段上，
  // 落点把那条路切成 T 路口；落点离路段端点 <12 时吸附到端点（不留碎段）。拒绝：与被接道路夹角 <60°、
  // 与其它道路交叉、穿过水面/陡坡/预留地。曾经直连「700/400 内最近的主干道节点」：
  // 不看角度、不看沿途道路——真机里那束 X 形长斜线与 8° 锐角路口都出自这里（docs/CITY_ROAD_PLANNING_AUDIT.md）。
  const crosses = (a: Vec2, b: Vec2, c: Vec2, d: Vec2) => {
    const o = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  const clearAngle = (at: Vec2, toward: Vec2) => {
    const id = roadNodeId(key(at));
    const ux = toward.x - at.x; const uz = toward.z - at.z; const ul = Math.hypot(ux, uz) || 1;
    for (const edge of edges.values()) {
      if (edge.from !== id && edge.to !== id) continue;
      const other = edge.from === id ? edge.points[edge.points.length - 1] : edge.points[0];
      const vx = other.x - at.x; const vz = other.z - at.z; const vl = Math.hypot(vx, vz) || 1;
      if ((ux * vx + uz * vz) / (ul * vl) > Math.cos((35 * Math.PI) / 180)) return false;
    }
    return true;
  };
  const connectToNetwork = (endpoint: Vec2, maxDistance: number, arterial: boolean, exclude: (edge: RoadEdge) => boolean = () => false, minAngle = 60): boolean => {
    let best: { edge: RoadEdge; p: Vec2; d: number } | null = null;
    for (const edge of edges.values()) {
      if (edge.bridge || exclude(edge)) continue;
      const [a, b] = edge.points;
      const dx = b.x - a.x; const dz = b.z - a.z; const len = Math.hypot(dx, dz) || 1;
      const t = Math.max(0, Math.min(1, ((endpoint.x - a.x) * dx + (endpoint.z - a.z) * dz) / (len * len)));
      let p = key({ x: a.x + dx * t, z: a.z + dz * t });
      if (t * len < 12) p = a; else if ((1 - t) * len < 12) p = b;
      const d = Math.hypot(p.x - endpoint.x, p.z - endpoint.z);
      if (d < 0.5 || d > maxDistance || (best && d >= best.d)) continue;
      // 夹角：落在路段中段时要求接近垂直（≥60°）；吸附到端点时由端点处的其它路决定，不再限制。
      const onEnd = p === a || p === b;
      if (!onEnd) {
        const cos = Math.abs(((p.x - endpoint.x) * dx + (p.z - endpoint.z) * dz) / (d * len));
        if (cos > Math.cos((minAngle * Math.PI) / 180)) continue;
      }
      if (!safeRoadLink(endpoint, p)) continue;
      // 两端都不能和已有道路成 <35° 的夹角：吸附到端点时曾不查角度，接入路沿着被接道路折回去（0° 重叠 / 10° 三角）。
      if (!clearAngle(p, endpoint) || !clearAngle(endpoint, p)) continue;
      let blocked = false;
      for (const other of edges.values()) {
        if (other === edge) continue;
        if (crosses(endpoint, p, other.points[0], other.points[1])) { blocked = true; break; }
      }
      if (blocked) continue;
      best = { edge, p, d };
    }
    if (!best) return false;
    const { edge, p } = best;
    const [a, b] = edge.points;
    if (p !== a && p !== b) {
      edges.delete(edge.id);
      const primary = edge.width >= 12; const art = edge.kind === "arterial";
      addEdge(a, p, art, false, primary); addEdge(p, b, art, false, primary);
    }
    addEdge(endpoint, p, arterial);
    return true;
  };
  for (const p of trimmedTrunkEnds) connectToNetwork(p, 40, true, (edge) => !coastalRoadEdgeIds.has(edge.id), 35);
  for (const segment of coastalRoadRuns) {
    if (segment.length < 2) continue;
    for (const endpoint of [segment[0], segment[segment.length - 1]]) {
      connectToNetwork(endpoint, 160, true, (edge) => coastalRoadEdgeIds.has(edge.id));
    }
  }

  let primaryIndexCache: SegmentIndex | null = null;
  const primaryRoadIndex = () => (primaryIndexCache ??= new SegmentIndex([...edges.values()].filter((edge) => edge.width >= 12 && !edge.bridge).map((edge) => edge.points)));
  const zoneFor = (center: Vec2): Zone => {
    // 分区由地理与骨架决定：核心附近 downtown、临海 waterfront、主干道两侧 commercial、其余 residential。
    // 实测 380 栋会话楼 97% 落在 residential、0 栋商业：downtown 半径 0.24R 几乎被市政广场与用地占满，
    // commercial 只认放射主干道。改为 0.3R，且临任意宽路（环岛滨海路、河岸路、海滨大道）也算商业街。
    if (Math.hypot(center.x - core.x, center.z - core.z) < 0.3 * R) return "downtown";
    if (coastDistance(center.x, center.z) < 90) return "waterfront";
    if (trunkIndex.closerThan(center, 80) || primaryRoadIndex().closerThan(center, 60)) return "commercial"; // 主干道 80 / 宽路 60：曾 60/45，商业仅 ~9%
    return "residential";
  };

  // 扇区街网：相邻两条主干道之间，网格 u 轴沿扇区起始那条主干道（街区沿主干道排开、横街以 T 路口接入主干道），
  // v 轴垂直指向扇区内部。曾沿扇区平分线：街网与两侧主干道都斜交、隔 10 单位空地带浮着（审计 R3 前的第一步）。
  const blocks: CityBlock[] = [];
  const angleBetween = (a: number, lo: number, hi: number) => {
    const span = ((hi - lo) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) || Math.PI * 2;
    const off = ((a - lo) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    return off > 0 && off < span;
  };
  const primarySegments = [...edges.values()].filter((edge) => edge.width >= 12 && !edge.bridge).map((edge) => edge.points);
  const parallelPrimaryGap = (a: Vec2, b: Vec2) => {
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const angle = Math.atan2(b.z - a.z, b.x - a.x);
    let gap = Infinity;
    for (const [c, d] of primarySegments) {
      let delta = Math.abs(angle - Math.atan2(d.z - c.z, d.x - c.x)) % Math.PI;
      delta = Math.min(delta, Math.PI - delta);
      if (delta < (15 * Math.PI) / 180) gap = Math.min(gap, segmentDistance(mid, c, d));
    }
    return gap;
  };
  const frontNodes: Vec2[] = []; // 首排街区贴主干道的角点：街网生成后以 T 路口接入主干道
  const sectors = trunks.length ? trunks.map((trunk, i) => ({ lo: trunk.angle, hi: trunks[(i + 1) % trunks.length].angle })) : [{ lo: 0, hi: Math.PI * 2 }];
  sectors.forEach((sector, sectorIndex) => {
    const span = ((sector.hi - sector.lo) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) || Math.PI * 2;
    // 宽扇区（>135°，常因指向山脊的主干道被省略）贴一侧主干道铺不满：退回平分线朝向、两侧都铺。
    const aligned = span <= Math.PI * 0.75;
    const theta = aligned ? sector.lo : sector.lo + span / 2;
    const u = { x: Math.cos(theta), z: Math.sin(theta) };
    const TRUNK_GAP = 8; // 首排街区离主干道中线 8（路幅半宽 6 + 路缘）
    const v = { x: -u.z, z: u.x };
    const du = 44 + random(`du${sectorIndex}`) * 10;
    const dv = 40 + random(`dv${sectorIndex}`) * 12;
    // A shared, seed-keyed displacement at every grid junction breaks the
    // perfect Manhattan checkerboard without opening cracks between blocks.
    // Keep it below 12% of the narrowest block span so junctions become organic
    // at aerial scale without folding adjacent block quads.
    const nodeOffsets = new Map<string, Vec2>();
    const at = (i: number, j: number): Vec2 => {
      const id = `${i}:${j}`;
      let offset = nodeOffsets.get(id);
      if (!offset) {
        const amplitude = aligned && j === 0 ? 0 : 5.2; // 贴主干道的首排不抖动，免得角点压进路面
        offset = {
          x: (random(`grid:${sectorIndex}:${id}:x`) - 0.5) * amplitude * 2,
          z: (random(`grid:${sectorIndex}:${id}:z`) - 0.5) * amplitude * 2,
        };
        nodeOffsets.set(id, offset);
      }
      const gap = aligned ? TRUNK_GAP : 0;
      return { x: core.x + u.x * i * du + v.x * (j * dv + gap) + offset.x, z: core.z + u.z * i * du + v.z * (j * dv + gap) + offset.z };
    };
    const reachCells = Math.ceil((R * 1.6) / Math.min(du, dv));
    for (let i = 1; i < reachCells; i += 1) for (let j = aligned ? 0 : -reachCells; j < reachCells; j += 1) {
      let polygon = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      let center = at(i + 0.5, j + 0.5);
      const centerAngle = Math.atan2(center.z - core.z, center.x - core.x);
      if (!angleBetween(centerAngle, sector.lo, sector.hi)) continue;
      // 四角都在本扇区内（不和相邻扇区的街网重叠）、可建、离主干道与环线高架留出路幅。
      // S4「街区形状由大地块决定」：跨出扇区的格子不再整格丢弃（曾留下锯齿边、主干道两侧空一圈），
      // 而是沿扇区两条边界射线（内收 10）裁切——斜向主干道旁的街区成为三角形/梯形，一直排到路边。
      let clipped = false;
      let onClipLine: (p: Vec2) => boolean = () => false; // 裁切线上的边是临主干道的界面，不修成街道
      if (polygon.some((p) => !angleBetween(Math.atan2(p.z - core.z, p.x - core.x), sector.lo, sector.hi))) {
        const lo = { x: Math.cos(sector.lo), z: Math.sin(sector.lo) }; const hi = { x: Math.cos(sector.hi), z: Math.sin(sector.hi) };
        const insideLo = (p: Vec2) => lo.x * (p.z - core.z) - lo.z * (p.x - core.x) - 10;   // 逆时针侧为正
        const insideHi = (p: Vec2) => -(hi.x * (p.z - core.z) - hi.z * (p.x - core.x)) - 10; // 顺时针侧为正
        const clip = (poly: Vec2[], f: (p: Vec2) => number) => {
          const out: Vec2[] = [];
          for (let k = 0; k < poly.length; k += 1) {
            const a = poly[k]; const b = poly[(k + 1) % poly.length];
            const fa = f(a); const fb = f(b);
            if (fa >= 0) out.push(a);
            if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }); }
          }
          return out;
        };
        polygon = clip(clip(polygon, insideLo), insideHi);
        onClipLine = (p: Vec2) => Math.abs(insideLo(p)) < 0.01 || Math.abs(insideHi(p)) < 0.01;
        if (polygon.length < 3) continue;
        let area = 0; for (let k = 0; k < polygon.length; k += 1) { const a = polygon[k]; const b = polygon[(k + 1) % polygon.length]; area += a.x * b.z - b.x * a.z; }
        if (Math.abs(area) / 2 < 350) continue;
        // 尖角 <50° 的裁切块不要：它的街道会在尖角处相交成锐角路口（初版 30 岛锐角 2 → 45）。保留梯形与钝形块。
        let minAngle = Math.PI;
        for (let k = 0; k < polygon.length; k += 1) {
          const prev = polygon[(k + polygon.length - 1) % polygon.length]; const cur = polygon[k]; const next = polygon[(k + 1) % polygon.length];
          const ux = prev.x - cur.x; const uz = prev.z - cur.z; const vx = next.x - cur.x; const vz = next.z - cur.z;
          const lu = Math.hypot(ux, uz); const lv = Math.hypot(vx, vz);
          if (lu < 1e-6 || lv < 1e-6) continue;
          minAngle = Math.min(minAngle, Math.acos(Math.max(-1, Math.min(1, (ux * vx + uz * vz) / (lu * lv)))));
        }
        if (minAngle < (50 * Math.PI) / 180) continue;
        center = { x: polygon.reduce((t, p) => t + p.x, 0) / polygon.length, z: polygon.reduce((t, p) => t + p.z, 0) / polygon.length };
        if (!angleBetween(Math.atan2(center.z - core.z, center.x - core.x), sector.lo, sector.hi)) continue;
        clipped = true;
      }
      if (polygon.some((p) => !buildable(p.x, p.z))) continue;
      // 海滨保留带（水线→带外缘）内不生成街区：沙滩/步道/酒店排用地。
      if (seaside && polygon.some((p) => seasideStripContains(seaside, p, 4))) continue;
      if (polygon.some((p, k) => { const q = polygon[(k + 1) % polygon.length]; return !buildable((p.x + q.x) / 2, (p.z + q.z) / 2); })) continue;
      if ([center, ...polygon].some((p) => trunkIndex.closerThan(p, 7))) continue;
      if ([center, ...polygon].some((p) => ringIndex.closerThan(p, 9))) continue;
      if ([center, ...polygon].some((p) => coastRoadIndex.closerThan(p, 7))) continue;
      // 压到预留地的格子整格不生成（曾只是不放地块、四条边照样成路——支路穿过公园/广场）。
      if (reservations().some((site) => polygonDistance(site, polygon) > -site.radius)) continue;
      const zone = zoneFor(center);
      const id = `plan:${sectorIndex}:${i}:${j}`; const parcels: Parcel[] = [];
      // 裁切出的三角/梯形街区：沿最长边排一排临街地块（内收朝多边形内侧）。
      let front = 0;
      if (clipped) for (let k = 1; k < polygon.length; k += 1) {
        const len = (q: number) => Math.hypot(polygon[(q + 1) % polygon.length].x - polygon[q].x, polygon[(q + 1) % polygon.length].z - polygon[q].z);
        if (len(k) > len(front)) front = k;
      }
      const sideLength = clipped ? Math.hypot(polygon[(front + 1) % polygon.length].x - polygon[front].x, polygon[(front + 1) % polygon.length].z - polygon[front].z)
        : Math.hypot(polygon[1].x - polygon[0].x, polygon[1].z - polygon[0].z);
      const columnCount = Math.max(clipped ? 1 : 3, Math.floor((sideLength - 14) / 7.2));
      for (let side = 0; side < (clipped ? 1 : 2); side += 1) for (let index = 0; index < columnCount; index += 1) {
        const a = clipped ? polygon[front] : polygon[side === 0 ? 0 : 3]; const b = clipped ? polygon[(front + 1) % polygon.length] : polygon[side === 0 ? 1 : 2];
        const length = Math.hypot(b.x - a.x, b.z - a.z); const dx = (b.x - a.x) / length; const dz = (b.z - a.z) / length;
        const t = (index + 0.5) / columnCount;
        let inset = side === 0 ? 12 : -12;
        if (clipped) { const mx = (a.x + b.x) / 2; const mz = (a.z + b.z) / 2; if (-dz * (center.x - mx) + dx * (center.z - mz) < 0) inset = -12; }
        const p = { x: a.x + dx * (7 + (length - 14) * t) - dz * inset, z: a.z + dz * (7 + (length - 14) * t) + dx * inset };
        // Warped corners can leave an interior parcel inside the curved beach
        // reserve even when all four block corners are outside it.
        if (seaside && seasideStripContains(seaside, p, 1)) continue;
        if (polygonDistance(p, polygon) < 3.6 + 5) continue;
        if (reservations().some((site) => Math.hypot(p.x - site.x, p.z - site.z) < site.radius + 9)) continue;
        if (!clearsHighways(p, 7.2, 8, ringIndex)) continue;
        parcels.push({ ...p, id: `${id}/${side}:${index}`, blockId: id, yaw: -Math.atan2(dz, dx), zone, width: Math.min(7.2, (length - 14) / columnCount), depth: 8 });
      }
      const k = (p: Vec2) => key(p);
      blocks.push({ id, districtId: "", ...center, width: du, depth: dv, zone, parcels, polygon: polygon.map(k) });
      // 每 3 条网格线一条主干级街道（宽 8），其余为支路。
      polygon.forEach((p, e) => {
        const q = polygon[(e + 1) % polygon.length];
        // 贴着主干道的那条边不再单修一条平行支路：主干道本身就是这排街区的临街道路。
        if (trunkIndex.closerThan(p, 12) && trunkIndex.closerThan(q, 12)) { frontNodes.push(p, q); return; }
        // 裁切线上的边：不修街道（曾在没有主干道的扇区边界上与相邻扇区街网斜交成锐角路口，30 岛 2 → 39）。
        if (onClipLine(p) && onClipLine(q)) { frontNodes.push(p, q); return; }
        // 与主干道/滨海大道近乎平行（<15°）且很近：≤12 视为同一条路不修，≤25 降为支路——不再并排出现两条大路。
        const parallel = parallelPrimaryGap(p, q);
        if (parallel <= 12) { frontNodes.push(p, q); return; }
        addEdge(p, q, parallel > 25 && (e % 2 === 0 ? j % 3 === 0 : i % 3 === 0));
      });
    }
  });

  // 沿海路 / 河岸路的断头互接：一段的端点 80 内有另一段（或同段另一端）的断头，就直连成一条（不过水、不穿用地）。
  // 河岸路在入海口附近停下、环岛路在河口另一侧停下，两端都是断头却互不相接（真机截图）。
  {
    const deg = () => { const d = new Map<string, number>(); for (const e of edges.values()) for (const n of [e.from, e.to]) d.set(n, (d.get(n) ?? 0) + 1); return d; };
    const ends = coastRoadRuns.flatMap((run, r) => [{ p: run[0], r }, { p: run[run.length - 1], r }]);
    const joined = new Set<string>();
    for (const a of ends) {
      const d = deg(); const ida = roadNodeId(key(a.p));
      if ((d.get(ida) ?? 0) !== 1 || joined.has(ida)) continue;
      const mate = ends
        .filter((b) => b !== a && (d.get(roadNodeId(key(b.p))) ?? 0) === 1 && !joined.has(roadNodeId(key(b.p))))
        .map((b) => ({ b, dist: Math.hypot(b.p.x - a.p.x, b.p.z - a.p.z) }))
        .filter(({ dist, b }) => dist > 1 && dist < 80 && safeRoadLink(a.p, b.p) && clearAngle(a.p, b.p) && clearAngle(b.p, a.p))
        .sort((x, y) => x.dist - y.dist)[0];
      if (!mate) continue;
      addEdge(a.p, mate.b.p, true, false, true);
      joined.add(ida); joined.add(roadNodeId(key(mate.b.p)));
    }
  }
  // 环岛滨海路段端接入路网；离它 ≤16 的街网节点以 T 路口接上（街区一直排到沿海路）。
  for (const runPts of coastRoadRuns) for (const end of [runPts[0], runPts[runPts.length - 1]]) {
    if (Math.hypot(end.x - runPts[0].x, end.z - runPts[0].z) < 0.01 && end !== runPts[0]) continue;
    connectToNetwork(end, 160, false, (edge) => coastRoadRuns.some((r) => r.some((q) => Math.hypot(q.x - edge.points[0].x, q.z - edge.points[0].z) < 0.01) && r.some((q) => Math.hypot(q.x - edge.points[1].x, q.z - edge.points[1].z) < 0.01)));
  }
  for (const node of [...nodes.values()]) {
    if (!coastRoadIndex.closerThan(node, 16) || coastRoadIndex.closerThan(node, 0.5)) continue;
    connectToNetwork(node, 18, false, (edge) => edge.width < 12 || !coastRoadIndex.closerThan(edge.points[0], 0.5));
  }
  // 节点落在别的路段中间时把那条路段切开（S4 裁切块的边沿网格线只走到裁切点，与相邻整格的同线整边重叠成 0° 「锐角」）：
  // 重叠的共线边因此变成共享路段，T 接点成为真正的路口。按 60 分桶避免 O(N·E)。
  {
    for (let pass = 0; pass < 3; pass += 1) {
      const CELL = 60; const buckets = new Map<string, RoadEdge[]>();
      for (const edge of edges.values()) {
        if (edge.bridge) continue;
        const [a, b] = edge.points;
        for (let gx = Math.floor(Math.min(a.x, b.x) / CELL); gx <= Math.floor(Math.max(a.x, b.x) / CELL); gx += 1)
          for (let gz = Math.floor(Math.min(a.z, b.z) / CELL); gz <= Math.floor(Math.max(a.z, b.z) / CELL); gz += 1) {
            const k = `${gx}:${gz}`; (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(edge);
          }
      }
      let split = 0;
      for (const node of [...nodes.values()]) {
        const host = (buckets.get(`${Math.floor(node.x / CELL)}:${Math.floor(node.z / CELL)}`) ?? []).find((edge) =>
          edges.has(edge.id) && edge.from !== node.id && edge.to !== node.id && segmentDistance(node, edge.points[0], edge.points[1]) < 0.05
          && Math.hypot(node.x - edge.points[0].x, node.z - edge.points[0].z) > 0.5 && Math.hypot(node.x - edge.points[1].x, node.z - edge.points[1].z) > 0.5);
        if (!host) continue;
        edges.delete(host.id);
        const primary = host.width >= 12; const art = host.kind === "arterial";
        addEdge(host.points[0], node, art, false, primary); addEdge(node, host.points[1], art, false, primary);
        split += 1;
      }
      if (!split) break;
    }
  }

  // 横街接入主干道：首排街区的角点（及离主干道 ≤16 的街网节点）垂直接到主干道上，形成 T 路口。
  {
    const seen = new Set<string>();
    const candidates = [...frontNodes, ...[...nodes.values()].filter((n) => trunkIndex.closerThan(n, 16))];
    for (const p of candidates) {
      const id = roadNodeId(key(p));
      if (seen.has(id)) continue; seen.add(id);
      if (!nodes.has(id)) continue; // 角点上没有任何街道（整条边都贴主干道）就不必接
      connectToNetwork(p, 18, false, (edge) => edge.kind !== "arterial" || edge.width < 12);
    }
  }
  // 街网生成后再给大道两端各补一条到街区街道的接入路（同一套 localConstraints）。
  for (const segment of coastalRoadRuns) {
    if (segment.length < 2) continue;
    for (const endpoint of [segment[0], segment[segment.length - 1]]) connectToNetwork(endpoint, 160, false, (edge) => coastalRoadEdgeIds.has(edge.id));
  }

  // 入口路（R2）：仍离路较远的用地/地标（岸边对象，或找不到临街位置的）从朝向最近道路的边缘
  // 拉一条支路接入路网——门前要有路（真机：双子塔、摩天轮、港口门前无路）。
  for (const site of [...publicSites, ...landmarks]) {
    if (!site.radius) continue;
    // 海上岛地标：先铺堤道桥（岛缘 → 岸点），再从岸点往路网接路。
    const landmarkSite = site as typeof site & { shore?: Vec2 };
    const ref: Vec2 = landmarkSite.shore ?? site;
    if (landmarkSite.shore) {
      const l = Math.hypot(site.x - ref.x, site.z - ref.z) || 1;
      const edgePt = key({ x: site.x - ((site.x - ref.x) / l) * site.radius * 0.9, z: site.z - ((site.z - ref.z) / l) * site.radius * 0.9 });
      const shorePt = key(ref);
      addEdge(shorePt, edgePt, false, true, false);
      bridges.push({ from: shorePt, to: edgePt, angle: Math.atan2(edgePt.z - shorePt.z, edgePt.x - shorePt.x), length: Math.hypot(edgePt.x - shorePt.x, edgePt.z - shorePt.z) });
    }
    let nearest: { p: Vec2; d: number; edge: RoadEdge } | null = null;
    for (const edge of edges.values()) {
      if (edge.bridge) continue;
      const [a, b] = edge.points; const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((ref.x - a.x) * dx + (ref.z - a.z) * dz) / l2));
      const p = { x: a.x + dx * t, z: a.z + dz * t }; const d = Math.hypot(p.x - ref.x, p.z - ref.z);
      if (!nearest || d < nearest.d) nearest = { p, d, edge };
    }
    if (!nearest || nearest.d <= (landmarkSite.shore ? 6 : site.radius + 14)) continue;
    const ux = (nearest.p.x - ref.x) / nearest.d; const uz = (nearest.p.z - ref.z) / nearest.d;
    // 岸边地标（灯塔在岬角尖上）门口常是不可建的岸滩：沿朝路方向往里走到可建地面再起路。
    let reach = landmarkSite.shore ? 0 : site.radius + 6;
    // 不再向内陆走到可建地：岬角灯塔会走 100+，入口路从远处的路边起步、根本到不了地标（用户：门前要有路）。
    // 门口在不可建岸滩时，由下方的「全程在陆上」兜底直连。
    const gate = key({ x: ref.x + ux * reach, z: ref.z + uz * reach });
    if (!connectToNetwork(gate, 240, false) && !connectToNetwork(gate, 700, false, () => false, 35)) {
      // 兜底：岸边地标贴回水边后常在岬角上，到最近路面要穿过不可建的岸滩。在最近 6 个路面点里取第一条
      // 「全程在陆上、不穿河、不穿其它用地」的直线连过去，并在落点切开宿主路段成 T 路口。
      const blockers = [...publicSites, ...landmarks].filter((o) => o !== site && o.radius);
      const candidates: Array<{ p: Vec2; d: number; edge: RoadEdge }> = [];
      for (const edge of edges.values()) {
        if (edge.bridge) continue;
        const [ea, eb] = edge.points; const ex = eb.x - ea.x; const ez = eb.z - ea.z; const el = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((gate.x - ea.x) * ex + (gate.z - ea.z) * ez) / el));
        const p = { x: ea.x + ex * t, z: ea.z + ez * t };
        candidates.push({ p, d: Math.hypot(p.x - gate.x, p.z - gate.z), edge });
      }
      candidates.sort((x, y) => x.d - y.d);
      // 返回连线上的水段（首/末水点）：无水 = 纯陆路；水段 ≤ 84 且两端是干地 = 可架短桥（岸边地标常与路网隔着河，
      // 守卫抓到 3 例「门前无路」）；更宽或被其它用地挡住则不连。
      const clear = (to: Vec2): { span: [Vec2, Vec2] | null } | null => {
        const n = Math.max(4, Math.ceil(Math.hypot(to.x - gate.x, to.z - gate.z) / 6));
        let first = -1; let last = -1;
        for (let k = 1; k < n; k += 1) {
          const x = gate.x + (to.x - gate.x) * (k / n); const z = gate.z + (to.z - gate.z) * (k / n);
          if (height(x, z) <= 0.5 || inRiver(x, z)) { if (first < 0) first = k; last = k; }
          if (blockers.some((o) => Math.hypot(o.x - x, o.z - z) < o.radius + 2)) return null;
          if (Math.hypot(site.x - x, site.z - z) < site.radius) return null;
        }
        if (first < 0) return { span: null };
        if (last - first + 1 > 14 || first < 1 || last > n - 2) return null;
        for (let k = first; k <= last; k += 1) { // 水段必须连续（中间不能又是陆地再入水）
          const x = gate.x + (to.x - gate.x) * (k / n); const z = gate.z + (to.z - gate.z) * (k / n);
          if (!(height(x, z) <= 0.5 || inRiver(x, z))) return null;
        }
        const at = (k: number) => ({ x: gate.x + (to.x - gate.x) * (k / n), z: gate.z + (to.z - gate.z) * (k / n) });
        if (Math.hypot(at(first - 1).x - site.x, at(first - 1).z - site.z) < site.radius + 2) return null; // 桥头不能落在用地圈里：路会从用地中间穿过（庄园跨河时）
        return { span: [at(first - 1), at(last + 1)] };
      };
      const picked = candidates.slice(0, 40).map((c) => ({ c, plan: clear(c.p) })).find((x) => x.plan);
      const pick = picked?.c;
      if (pick) {
        const host = pick.edge; const join = key(pick.p);
        if (edges.has(host.id) && roadNodeId(join) !== host.from && roadNodeId(join) !== host.to) {
          edges.delete(host.id);
          addEdge(host.points[0], join, host.kind === "arterial", false, host.width >= 12);
          addEdge(join, host.points[1], host.kind === "arterial", false, host.width >= 12);
        }
        const span = picked!.plan!.span;
        if (span) { // 门口 → 近岸 → 桥 → 对岸 → 接入点
          addEdge(gate, span[0], false);
          addEdge(span[0], span[1], false, true, false);
          bridges.push({ from: span[0], to: span[1], angle: Math.atan2(span[1].z - span[0].z, span[1].x - span[0].x), length: Math.hypot(span[1].x - span[0].x, span[1].z - span[0].z) });
          addEdge(span[1], join, false);
        } else addEdge(gate, join, false);
      }
    }
  }

  // 连通：各扇区街网可能被河/保留用地切成几块。并查集找连通分量，每个不含核心的分量用一条支路
  // 接到最近的主干道节点（主干道都从核心出发，彼此已连通）。
  {
    const parent = new Map<string, string>();
    const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; let c = x; while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; } return r; };
    for (const id of nodes.keys()) parent.set(id, id);
    for (const edge of edges.values()) { const ra = find(edge.from); const rb = find(edge.to); if (ra !== rb) parent.set(ra, rb); }
    const coreId = trunks.length ? roadNodeId(key(trunks[0].points[0])) : roadNodeId(key(core));
    // 每个孤立分量按 localConstraints 垂直接入「含核心的分量」；接上一个就重算分量。
    // 逐级放宽：严格（≤220、≥60°）→ 放远放宽（≤400、≥35°）→ 最后才退回旧的直连最近节点，保证全网连通。
    const coreRoot = () => find(coreId);
    const recompute = () => {
      for (const id of nodes.keys()) if (!parent.has(id)) parent.set(id, id);
      for (const edge of edges.values()) { const ra = find(edge.from); const rb = find(edge.to); if (ra !== rb) parent.set(ra, rb); }
    };
    for (let pass = 0; pass < 3; pass += 1) {
      recompute();
      const groupsNow = new Map<string, RoadNode[]>();
      for (const node of nodes.values()) { const r = find(node.id); const list = groupsNow.get(r); if (list) list.push(node); else groupsNow.set(r, [node]); }
      for (const [root, members] of groupsNow) {
        if (!nodes.has(coreId) || root === coreRoot()) continue;
        const target = coreRoot();
        const outside = (edge: RoadEdge) => find(edge.from) !== target;
        const ordered = [...members].sort((a, b) => distanceToTrunks(a) - distanceToTrunks(b)).slice(0, 12);
        let linked = false;
        for (const member of ordered) {
          if (pass === 0 ? connectToNetwork(member, 220, false, outside) : connectToNetwork(member, 400, false, outside, 35)) { linked = true; break; }
        }
        if (!linked && pass === 2) {
          let best: { a: RoadNode; b: RoadNode; d: number } | null = null;
          // 最后手段也先选不穿过用地/地标的直连；实在没有才不限。
          const clearOfSites = (a: Vec2, b: Vec2) => {
            const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4));
            for (let k = 0; k <= n; k += 1) {
              const q = { x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n };
              if (reservations().some((site) => Math.hypot(q.x - site.x, q.z - site.z) < site.radius + 3)) return false;
            }
            return true;
          };
          for (const strict of [true, false]) {
            for (const a of members) for (const b of nodes.values()) {
              if (find(b.id) !== target) continue;
              const d = Math.hypot(a.x - b.x, a.z - b.z);
              if (best && d >= best.d) continue;
              if (strict && !clearOfSites(a, b)) continue;
              best = { a, b, d };
            }
            if (best) break;
          }
          const chosen = best as { a: RoadNode; b: RoadNode; d: number } | null;
          if (chosen) addEdge(chosen.a, chosen.b, false);
        }
        recompute();
      }
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
  // 山体植被（tinyskies 的教训：山不能光秃秃）——高度 3.2 以上、坡度可站立
  // （slope < 1.5）的山坡是主要林区；公园/河岸/近海沙滩维持原有条件。
  const slope = (x: number, z: number) => Math.hypot(height(x + 1, z) - height(x - 1, z), height(x, z + 1) - height(x, z - 1)) / 2;
  for (let i = 0; i < 2600; i += 1) {
    const x = bbox.minX - 60 + random(`tx${i}`) * spanX; const z = bbox.minZ - 60 + random(`tz${i}`) * spanZ;
    const h = height(x, z);
    const park = publicSites.some((s) => s.kind === "park" && Math.hypot(x - s.x, z - s.z) < s.radius - 5);
    const bank = Math.abs(x - riverX(z)) - riverWidth(z);
    const mountainside = h > 3.2 && h < 60 && slope(x, z) < 1.5;
    const wild = hillProj(x, z) > hillLine - 20 || coastDistance(x, z) < 30 || mountainside;
    if (h < 2.5 || (!park && !wild && !(hasRiver && bank < 23))) continue;
    if ((edgeBuckets.get(`${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`) ?? []).some((e) => segmentDistance({ x, z }, e.points[0], e.points[1]) < e.width / 2 + 3)) continue;
    parkTrees.push({ x, z, y: height(x, z), seed: random(`tree${i}`) });
  }
  // ── 碎边合并：长度 <5 的非桥路段把两端并成一个节点。接入路吸附到离已有路口几单位处时会留下 0–4 长的碎边，
  // 与广场环路等形成 <30° 的「锐角路口」（30 岛中 10 个锐角全部是这种形状）。
  const sliverSkip = new Set<string>();
  for (let pass = 0; pass < 50; pass += 1) {
    // 宽 12 的骨架（海滨大道按 ~15 细分、段间可能 <5）不合并：并掉会打断大道的车流回路（seaside 守卫）。
    const sliver = [...edges.values()].find((e) => !sliverSkip.has(e.id) && !e.bridge && e.width < 12 && Math.hypot(e.points[1].x - e.points[0].x, e.points[1].z - e.points[0].z) < 5);
    if (!sliver) break;
    // 保留挂着骨架（宽 12）的那一端：并掉海滨大道端点会让大道车流回路引用不存在的节点（seaside 守卫 10 档）。
    const touchesPrimary = (id: string) => [...edges.values()].some((e) => e !== sliver && e.width >= 12 && (e.from === id || e.to === id));
    const fromPrimary = touchesPrimary(sliver.from); const toPrimary = touchesPrimary(sliver.to);
    if (fromPrimary && toPrimary) { sliverSkip.add(sliver.id); continue; }
    edges.delete(sliver.id);
    const keepId = toPrimary ? sliver.to : sliver.from;
    const keepNode = nodes.get(keepId)!; const dropId = keepId === sliver.from ? sliver.to : sliver.from;
    for (const e of [...edges.values()]) {
      if (e.from !== dropId && e.to !== dropId) continue;
      edges.delete(e.id);
      const other = e.from === dropId ? e.points[1] : e.points[0];
      addEdge(keepNode, other, e.kind === "arterial", e.bridge ?? false, e.width >= 12);
    }
    nodes.delete(dropId);
  }

  const carPaths = blocks.filter((b, i) => b.parcels.length > 0 && i % 7 === 0).map((b) => [...b.polygon, b.polygon[0]]);
  // 海滨大道车流沿海岸单向行驶，再通过真实路网回到起点；找不到完整地面回路时
  // 不生成假路线。返程搜索排除大道自身边，避免车辆在两端掉头后原路折返。
  const roadReturnPath = (from: Vec2, to: Vec2): Vec2[] | null => {
    const start = roadNodeId(key(from)); const goal = roadNodeId(key(to));
    const adjacency = new Map<string, string[]>();
    for (const id of nodes.keys()) adjacency.set(id, []);
    for (const edge of edges.values()) {
      if (coastalRoadEdgeIds.has(edge.id)) continue;
      adjacency.get(edge.from)?.push(edge.to); adjacency.get(edge.to)?.push(edge.from);
    }
    const previous = new Map<string, string | null>([[start, null]]); const queue = [start];
    for (let i = 0; i < queue.length && !previous.has(goal); i += 1) {
      for (const next of adjacency.get(queue[i]) ?? []) if (!previous.has(next)) { previous.set(next, queue[i]); queue.push(next); }
    }
    if (!previous.has(goal)) return null;
    const path: string[] = [];
    for (let cursor: string | null = goal; cursor; cursor = previous.get(cursor) ?? null) path.push(cursor);
    return path.reverse().map((id) => nodes.get(id)!).filter(Boolean).map(({ x, z }) => ({ x, z }));
  };
  for (const segment of coastalRoadRuns) {
    if (segment.length < 2) continue;
    const homeward = roadReturnPath(segment[segment.length - 1], segment[0]);
    if (homeward && homeward.length > 1) carPaths.push([...segment, ...homeward.slice(1)]);
    else {
      // Some valid beach segments have only one safe district-road access because
      // the opposite end is screened by river mouths/reservations. Keep deterministic
      // shuttle traffic on the rendered boulevard rather than wrapping/teleporting.
      carPaths.push([...segment, ...segment.slice(0, -1).reverse()]);
    }
  }

  // 城区锚点：第一名执行环境在核心，其余绕核心等角分布再贴陆地，彼此至少隔 ~200。
  const anchorsPlaced: Array<Vec2 & { radius: number }> = [];
  const nominalAnchors = [core, around(turn + 1.6, 0.42 * R), around(turn + 3.7, 0.42 * R), around(turn + 5.3, 0.42 * R)];
  for (const nominal of nominalAnchors) {
    const q = snap(nominal, 40, [...anchorsPlaced, ...publicSites.map((site) => ({ x: site.x, z: site.z, radius: site.radius * 0.4 }))], 90);
    anchorsPlaced.push({ ...q, radius: 90 });
  }
  const districtAnchors = anchorsPlaced.map(({ x, z }) => ({ x, z }));

  // 高架：环线（沿陆地断续），取代原来按常量画在城北的一条直线。
  const highwayRuns: Vec2[][] = ringRuns;

  // 下游读的边界：全部由岛的实际包围盒推导（曾是常量 ±570 / -350..430 / 650 / 1600）。
  const urbanBounds = { left: bbox.minX + 30, right: bbox.maxX - 30, north: bbox.minZ + 30, south: bbox.maxZ - 30 };
  const boundsRadius = Math.max(bbox.maxX - bbox.minX, bbox.maxZ - bbox.minZ) / 2 + 40;
  const extent = Math.ceil((Math.max(Math.abs(bbox.minX), Math.abs(bbox.maxX), Math.abs(bbox.minZ), Math.abs(bbox.maxZ)) + 260) * 2 / 100) * 100;
  // ── 断头路收尾（30 岛实测 ~390 个断头，多为环岛/河岸路段端与被切断的碎段）：
  // 每个非入口、非岸边自然终点的断头：沿其悬挂链走到最近的路口，先尝试按 localConstraints 接回路网，
  // 接不上且整条悬挂链很短（主干 <40、其余 <30）就删掉——不留通往空地的小尾巴。
  {
    const sitesForGate = [...publicSites, ...landmarks].filter((site) => site.radius);
    const degree = () => { const d = new Map<string, number>(); for (const e of edges.values()) for (const n of [e.from, e.to]) d.set(n, (d.get(n) ?? 0) + 1); return d; };
    for (let pass = 0; pass < 3; pass += 1) {
      const deg = degree();
      const ends = [...nodes.values()].filter((n) => deg.get(n.id) === 1);
      for (const end of ends) {
        if (!nodes.has(end.id) || degree().get(end.id) !== 1) continue;
        if (sitesForGate.some((site) => Math.hypot(site.x - end.x, site.z - end.z) < site.radius + 60)) continue; // 用地入口（门前接入点可能内移到岸滩以外，60 内都算）
        if (coastDistance(end.x, end.z) < 30 || inRiver(end.x, end.z)) continue;                              // 通到海边/河边的自然终点
        // 悬挂链：从断头一路走到度 ≠ 2 的节点。
        const chain: RoadEdge[] = []; let cursor = end.id; let length = 0; const d2 = degree();
        for (let guard = 0; guard < 64; guard += 1) {
          const next = [...edges.values()].find((e) => (e.from === cursor || e.to === cursor) && !chain.includes(e));
          if (!next) break;
          chain.push(next); length += Math.hypot(next.points[1].x - next.points[0].x, next.points[1].z - next.points[0].z);
          cursor = next.from === cursor ? next.to : next.from;
          if (d2.get(cursor) !== 2) break;
        }
        const wide = chain.some((e) => e.width >= 12);
        if (connectToNetwork(end, wide ? 120 : 60, false, (edge) => chain.includes(edge), 45)) continue;
        if (chain.some((e) => e.bridge) || length >= (wide ? 40 : 30)) continue;
        for (const e of chain) edges.delete(e.id);
        nodes.delete(end.id);
      }
    }
    for (const id of [...nodes.keys()]) if (![...edges.values()].some((e) => e.from === id || e.to === id)) nodes.delete(id);
  }

  // 接入路把已有路段切成 T 路口后，车流折线还按旧端点走：把落在线段上的路口节点按顺序插回去。
  {
    const allNodes = [...nodes.values()];
    for (let r = 0; r < carPaths.length; r += 1) {
      const route = carPaths[r]; const out: Vec2[] = [route[0]];
      for (let i = 1; i < route.length; i += 1) {
        const a = route[i - 1]; const b = route[i];
        const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
        const between = allNodes
          .map((n) => ({ n, t: ((n.x - a.x) * dx + (n.z - a.z) * dz) / l2 }))
          .filter(({ n, t }) => t > 1e-4 && t < 1 - 1e-4 && segmentDistance(n, a, b) < 0.02)
          .sort((x, y) => x.t - y.t);
        for (const { n } of between) out.push({ x: n.x, z: n.z });
        out.push(b);
      }
      carPaths[r] = out;
    }
    // 贴主干道那条边不再单独成路：绕街区一圈的车流若经过不存在的路段就整条丢弃（不让车开在没有路的地方）。
    const pairs = new Set([...edges.values()].map((edge) => [edge.from, edge.to].sort().join("/")));
    for (let r = carPaths.length - 1; r >= 0; r -= 1) {
      // 碎边合并/断头清理后，折线里可能留下相距 <1 的两个点（原来的碎边已并成一个节点）：把中间点并掉再核对，
      // 不因为一个 0.4 长的碎边就丢掉整条 220 点的车流回路（海滨大道回路因此消失，滨海车流守卫抓到）。
      const raw = carPaths[r];
      const route = raw.filter((q, i) => i === 0 || i === raw.length - 1 || Math.hypot(q.x - raw[i + 1].x, q.z - raw[i + 1].z) >= 1);
      carPaths[r] = route;
      const ok = route.every((p, i) => i === 0 || pairs.has([roadNodeId(key(route[i - 1])), roadNodeId(key(p))].sort().join("/")));
      if (!ok) carPaths.splice(r, 1);
    }
  }
  // ── F1 闭环（CITY_ROAD_F1_ALGORITHM_SPEC）：路网不是一次生成就完事——所有改路步骤（接入路、断头路收尾、
  // 碎边合并）之后，量一遍「路穿过用地」，只对有问题的用地修复，再量，直到没有问题或 6 轮。曾只在各步骤里各修各的，
  // 后一步改了路/地标位置，前一步接好的关系就失效（场景依赖守卫长期容忍 2 例穿路：庄园、双子塔）。
  // 修复手段：沿「路 → 用地中心」方向把用地推到离路 0.85 半径（占地仍在干地、不入河、不压其它用地/高架/地块）。
  {
    const movable = [...publicSites, ...landmarks].filter((s) => s.radius && s.kind !== "civic" && s.kind !== "arch" && !(s as { shore?: Vec2 }).shore);
    const solid = [...edges.values()].filter((e) => !e.bridge);
    const nearestRoad = (x: number, z: number) => {
      let best: { d: number; q: Vec2 } | null = null;
      for (const e of solid) {
        const [a, b] = e.points; const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
        const q = { x: a.x + dx * t, z: a.z + dz * t }; const d = Math.hypot(q.x - x, q.z - z);
        if (!best || d < best.d) best = { d, q };
      }
      return best;
    };
    const wetAt = (site: { radius: number }, x: number, z: number) => { let n = 0; for (let k = 0; k < 16; k += 1) { const t = (k / 16) * Math.PI * 2; const r = k % 2 ? site.radius : site.radius * 0.6; const px = x + Math.cos(t) * r; const pz = z + Math.sin(t) * r; if (height(px, pz) < 0.5 || inRiver(px, pz)) n += 1; } return n; };
    // 临街：车站/体育场的正面要贴着路边（用户截图：车站离路一大截——「门前有路」守卫只要求 ≤ 半径+20）。
    // 沿「路 → 用地中心」反方向的反向把它拉到离路 0.85 半径（占地前沿 ≈ 0.65 半径，贴着人行道），
    // 仍满足上面的「中心到路 ≥ 0.7 半径」；新位置须是干地、不压其它用地/高架、不让别的路穿过。
    for (const site of movable) {
      if (site.kind !== "station" && site.kind !== "stadium") continue;
      const near = nearestRoad(site.x, site.z);
      if (!near || near.d <= site.radius * 0.95 || near.d > site.radius + 90) continue;
      const others = [...publicSites, ...landmarks].filter((o) => o !== site && o.radius);
      const dirx = (site.x - near.q.x) / near.d; const dirz = (site.z - near.q.z) / near.d;
      const nx = near.q.x + dirx * site.radius * 0.85; const nz = near.q.z + dirz * site.radius * 0.85;
      const probe = nearestRoad(nx, nz);
      if (!probe || probe.d < site.radius * 0.8) continue;
      if (wetAt(site, nx, nz) > Math.max(3, wetAt(site, site.x, site.z)) || height(nx, nz) <= 0.5) continue;
      if (others.some((o) => Math.hypot(o.x - nx, o.z - nz) < o.radius + site.radius)) continue;
      if (!clearsHighways({ x: nx, z: nz }, site.radius * 2, site.radius * 2, ringRuns)) continue;
      site.x = nx; site.z = nz;
      for (const block of blocks) block.parcels = block.parcels.filter((pc) => Math.hypot(pc.x - nx, pc.z - nz) >= site.radius);
    }
    // 临街：车站/体育场的正面要贴着路边（用户截图：车站离路一大截——「门前有路」守卫只要求 ≤ 半径+20）。
    // 沿「路 → 用地中心」反方向的反向把它拉到离路 0.85 半径（占地前沿 ≈ 0.65 半径，贴着人行道），
    // 仍满足上面的「中心到路 ≥ 0.7 半径」；新位置须是干地、不压其它用地/高架、不让别的路穿过。
    for (const site of movable) {
      if (site.kind !== "station" && site.kind !== "stadium") continue;
      const near = nearestRoad(site.x, site.z);
      if (!near || near.d > site.radius + 90) continue;
      // 车站正面（站房入口/雨篷）在局部 +z：转向最近的路（原先是固定朝向 0.12，从不看路）。
      if (site.kind === "station" && near.d > 0.5) site.yaw = Math.atan2(near.q.x - site.x, near.q.z - site.z);
      if (near.d <= site.radius * 0.95) continue;
      const others = [...publicSites, ...landmarks].filter((o) => o !== site && o.radius);
      const dirx = (site.x - near.q.x) / near.d; const dirz = (site.z - near.q.z) / near.d;
      const nx = near.q.x + dirx * site.radius * 0.85; const nz = near.q.z + dirz * site.radius * 0.85;
      const probe = nearestRoad(nx, nz);
      if (!probe || probe.d < site.radius * 0.8) continue;
      if (wetAt(site, nx, nz) > Math.max(3, wetAt(site, site.x, site.z)) || height(nx, nz) <= 0.5) continue;
      if (others.some((o) => Math.hypot(o.x - nx, o.z - nz) < o.radius + site.radius)) continue;
      if (!clearsHighways({ x: nx, z: nz }, site.radius * 2, site.radius * 2, ringRuns)) continue;
      site.x = nx; site.z = nz;
      for (const block of blocks) block.parcels = block.parcels.filter((pc) => Math.hypot(pc.x - nx, pc.z - nz) >= site.radius);
    }
    for (let round = 0; round < 6; round += 1) {
      let moved = 0;
      for (const site of movable) {
        const near = nearestRoad(site.x, site.z);
        if (!near || near.d >= site.radius * 0.7) continue;
        const others = [...publicSites, ...landmarks].filter((o) => o !== site && o.radius);
        const away = near.d > 0.5 ? { x: (site.x - near.q.x) / near.d, z: (site.z - near.q.z) / near.d } : { x: 1, z: 0 };
        const wet0 = wetAt(site, site.x, site.z);
        // 沿「离路」方向优先，再试两侧与四个斜向（路穿过用地、而用地一侧临河时只有斜着挪得开）；最大推 1.3 半径。
        const diag = Math.SQRT1_2; const tryDirs = [away, { x: -away.z, z: away.x }, { x: away.z, z: -away.x }, { x: (away.x - away.z) * diag, z: (away.z + away.x) * diag }, { x: (away.x + away.z) * diag, z: (away.z - away.x) * diag }, { x: -away.x, z: -away.z }];
        let done = false;
        for (const dir of tryDirs) {
          for (let push = 4; push <= site.radius * 1.3 && !done; push += 3) {
            const nx = site.x + dir.x * push; const nz = site.z + dir.z * push;
            const probe = nearestRoad(nx, nz);
            if (!probe || probe.d < site.radius * 0.85) continue;
            if (wetAt(site, nx, nz) > Math.max(3, wet0) || height(nx, nz) <= 0.5) continue;
            if (others.some((o) => Math.hypot(o.x - nx, o.z - nz) < o.radius + site.radius)) continue;
            if (!clearsHighways({ x: nx, z: nz }, site.radius * 2, site.radius * 2, ringRuns)) continue;
            if (distanceToTrunks({ x: nx, z: nz }) < site.radius * 0.7) continue;
            site.x = nx; site.z = nz; done = true; moved += 1;
            for (const block of blocks) block.parcels = block.parcels.filter((p) => Math.hypot(p.x - nx, p.z - nz) >= site.radius);
          }
          if (done) break;
        }
        // 兜底：附近推不开（岸边用地夹在海与路之间、桥头贴着它）——沿海岸换一个位置：从近到远逐个试海岸点，
        // 取「向核心内移 0.7 半径」处，满足同样的条件，再加上不贴桥头，且离路在 [0.85 半径, 半径+20]（门前有路）。
        if (!done && (SHORE_SITE_KINDS.has(site.kind)) && !(site as { shore?: Vec2 }).shore) {
          const ranked2 = [...coast].sort((u, v) => Math.hypot(u.x - site.x, u.z - site.z) - Math.hypot(v.x - site.x, v.z - site.z));
          // 向内移 0.7 / 1.0 / 1.5 / 2.0 个半径各试一次：沿海大道离水线 ~22，贴岸 0.7 半径的位置正好压在它上面，
          // 退到大道内侧（岸边用地与海之间隔一条路）也算临水。
          const slots = ranked2.slice(0, 400).flatMap((q) => [0.7, 1.0, 1.5, 2.0].map((f) => ({ q, f })));
          for (let idx = 0; idx < slots.length && !done; idx += 1) {
            const { q, f } = slots[idx]; const lx = core.x - q.x; const lz = core.z - q.z; const ll = Math.hypot(lx, lz) || 1;
            const nx = q.x + (lx / ll) * site.radius * f; const nz = q.z + (lz / ll) * site.radius * f;
            const probe = nearestRoad(nx, nz);
            if (!probe || probe.d < site.radius * 0.85 || probe.d > site.radius + 20) continue;
            if (wetAt(site, nx, nz) > 3 || height(nx, nz) <= 0.5 || nearBridgeEnd(nx, nz, site.radius)) continue;
            if (others.some((o) => Math.hypot(o.x - nx, o.z - nz) < o.radius + site.radius)) continue;
            if (!clearsHighways({ x: nx, z: nz }, site.radius * 2, site.radius * 2, ringRuns)) continue;
            if (distanceToTrunks({ x: nx, z: nz }) < site.radius * 0.7) continue;
            site.x = nx; site.z = nz; done = true; moved += 1;
            for (const block of blocks) block.parcels = block.parcels.filter((pc) => Math.hypot(pc.x - nx, pc.z - nz) >= site.radius);
          }
        }
      }
      if (!moved) break;
    }
  }
  // ── F1 修复 B：被用地截断的路。岸边路/河岸路按「连续可用段」成路、跳过用地，于是一条路在车站/港口/地标处断成两截，
  // 两个断头隔着用地遥遥相对（用户截图：车站把河岸路挡断了，前后两头各自停在半路）。找出这样的断头对——同等级同宽、
  // 方向基本共线、连线被同一块用地挡住——用一条绕用地外缘（半径 + 8）的折线接起来，不过水、不穿其它用地、不与别的路相交。
  {
    const solid = () => [...edges.values()].filter((e) => !e.bridge);
    const degree = new Map<string, RoadEdge[]>();
    for (const e of solid()) for (const id of [e.from, e.to]) (degree.get(id) ?? degree.set(id, []).get(id)!).push(e);
    const loose = [...degree.entries()].filter(([, list]) => list.length === 1).map(([id, list]) => ({ id, edge: list[0], at: nodes.get(id)! })).filter((x) => x.at && height(x.at.x, x.at.z) >= 2.5);
    const sitesAll = [...publicSites, ...landmarks].filter((o) => o.radius);
    const crosses = (a: Vec2, b: Vec2) => solid().some((e) => {
      const [c, d] = e.points; if (roadNodeId(c) === roadNodeId(a) || roadNodeId(d) === roadNodeId(a) || roadNodeId(c) === roadNodeId(b) || roadNodeId(d) === roadNodeId(b)) return false;
      const o = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
      return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
    });
    const used = new Set<string>();
    for (let i = 0; i < loose.length; i += 1) for (let j = i + 1; j < loose.length; j += 1) {
      const A = loose[i]; const B = loose[j];
      if (used.has(A.id) || used.has(B.id) || A.edge.kind !== B.edge.kind || A.edge.width !== B.edge.width) continue;
      const span = Math.hypot(B.at.x - A.at.x, B.at.z - A.at.z); if (span < 30 || span > 320) continue;
      const nb = (L: typeof A) => { const [p0, p1] = L.edge.points; return roadNodeId(p0) === L.id ? p1 : p0; };
      const dirOf = (L: typeof A, to: Vec2) => { const n = nb(L); const v = { x: L.at.x - n.x, z: L.at.z - n.z }; const w = { x: to.x - L.at.x, z: to.z - L.at.z }; const c = (v.x * w.x + v.z * w.z) / ((Math.hypot(v.x, v.z) || 1) * (Math.hypot(w.x, w.z) || 1)); return c; };
      if (dirOf(A, B.at) < Math.cos((50 * Math.PI) / 180) || dirOf(B, A.at) < Math.cos((50 * Math.PI) / 180)) continue; // 两头都要朝着对方延伸
      const blocker = sitesAll.find((o) => segmentDistance(o, A.at, B.at) < o.radius + 4 && Math.hypot(o.x - A.at.x, o.z - A.at.z) <= o.radius + 90 && Math.hypot(o.x - B.at.x, o.z - B.at.z) <= o.radius + 90);
      if (!blocker) continue;
      const R = blocker.radius + 8; const ux = (B.at.x - A.at.x) / span; const uz = (B.at.z - A.at.z) / span; const px = -uz; const pz = ux;
      for (const side of [1, -1]) {
        const m = key({ x: blocker.x + px * side * R, z: blocker.z + pz * side * R });
        // 折线 A → q1 → m → q2 → B：q1/q2 取 A/B 与 m 的中点再向外推，让转角缓一些（单个拐点会出 <60° 的急弯）。
        const q1 = key({ x: (A.at.x + m.x) / 2 + px * side * R * 0.15, z: (A.at.z + m.z) / 2 + pz * side * R * 0.15 });
        const q2 = key({ x: (B.at.x + m.x) / 2 + px * side * R * 0.15, z: (B.at.z + m.z) / 2 + pz * side * R * 0.15 });
        const chain = [A.at, q1, m, q2, B.at];
        let ok = true;
        for (let k = 0; k < chain.length && ok; k += 1) {
          const q = chain[k];
          if (k > 0 && k < chain.length - 1 && (height(q.x, q.z) <= 0.5 || inRiver(q.x, q.z))) ok = false;
          if (sitesAll.some((o) => o !== blocker && Math.hypot(o.x - q.x, o.z - q.z) < o.radius + 4)) ok = false;
          if (k > 0 && crosses(chain[k - 1], q)) ok = false;
        }
        if (!ok) continue;
        for (let k = 1; k < chain.length; k += 1) addEdge(chain[k - 1], chain[k], A.edge.kind === "arterial", false, A.edge.width >= 12);
        used.add(A.id); used.add(B.id);
        break;
      }
    }
  }
  // ── F1 修复 C：断头顺着自己的方向直接延伸过去（用户截图：「大陆明明可以连接，为什么不直接连接过去」）。
  // 沿岸/河岸路被高架、用地、河口切成一段一段，断头只试过「垂直 T 接」，从不沿原方向继续走——于是一条本该贯通的路
  // 停在半路，对面几十单位外就是另一段路。这里对每个内陆断头沿「邻点 → 端点」方向射线，取最先碰到的路段（不是自己这条）：
  // 落点在路段端点 12 内就吸附，中段则把宿主路段切成 T 路口；沿途必须能通过 safeRoadLink（不过水、不穿用地、坡度可走）、
  // 与落点处已有道路夹角 ≥ 30°。高架不在路网里（离地 8），路从它下面穿过是允许的。
  {
    for (let pass = 0; pass < 2; pass += 1) {
      const solidEdges = [...edges.values()].filter((e) => !e.bridge);
      const inc = new Map<string, RoadEdge[]>();
      for (const e of solidEdges) for (const id of [e.from, e.to]) (inc.get(id) ?? inc.set(id, []).get(id)!).push(e);
      const sitesAll2 = [...publicSites, ...landmarks].filter((o) => o.radius);
      let healed = 0;
      for (const [id, list] of inc) {
        if (list.length !== 1) continue;
        const at = nodes.get(id); if (!at || height(at.x, at.z) < 2.5) continue;
        if (sitesAll2.some((o) => Math.hypot(o.x - at.x, o.z - at.z) < o.radius + 12)) continue; // 伸进用地边缘的门前路是正常终点
        const own = list[0]; const [p0, p1] = own.points; const from = roadNodeId(p0) === id ? p1 : p0;
        const dx = at.x - from.x; const dz = at.z - from.z; const dl = Math.hypot(dx, dz); if (dl < 1) continue;
        const ux = dx / dl; const uz = dz / dl;
        let best: { t: number; edge: RoadEdge } | null = null;
        for (const e of solidEdges) {
          if (e === own) continue;
          const [c, d] = e.points; const ex = d.x - c.x; const ez = d.z - c.z;
          const den = ux * ez - uz * ex; if (Math.abs(den) < 1e-6) continue;
          const t = ((c.x - at.x) * ez - (c.z - at.z) * ex) / den;
          const w = ((c.x - at.x) * uz - (c.z - at.z) * ux) / den;
          if (t < 3 || t > 320 || w < -0.02 || w > 1.02) continue;
          if (!best || t < best.t) best = { t, edge: e };
        }
        if (!best) continue;
        const [c, d] = best.edge.points;
        let target = key({ x: at.x + ux * best.t, z: at.z + uz * best.t });
        const lenE = Math.hypot(d.x - c.x, d.z - c.z) || 1;
        const along = Math.hypot(target.x - c.x, target.z - c.z);
        if (along < 12) target = c; else if (lenE - along < 12) target = d;
        if (roadNodeId(target) === id) continue;
        if (!safeRoadLink(at, target)) continue;
        // 与落点处已有道路夹角 ≥ 30°（clearAngle 的 35° 对「延伸」略严，这里只防折回重叠）。
        const ex2 = d.x - c.x; const ez2 = d.z - c.z; const cosA = Math.abs((ux * ex2 + uz * ez2) / lenE);
        if (target !== c && target !== d && cosA > Math.cos((30 * Math.PI) / 180)) continue;
        if ([...edges.values()].some((o) => o !== best!.edge && !o.bridge && o !== own && crosses(at, target, o.points[0], o.points[1]) )) continue;
        const host = best.edge;
        if (target !== c && target !== d && edges.has(host.id)) {
          edges.delete(host.id);
          addEdge(c, target, host.kind === "arterial", false, host.width >= 12);
          addEdge(target, d, host.kind === "arterial", false, host.width >= 12);
        }
        addEdge(at, target, own.kind === "arterial", false, own.width >= 12);
        healed += 1;
      }
      if (!healed) break;
    }
  }
  // 终筛：所有改路步骤（接入路、断头路收尾、碎边合并）之后，对每个地块统一核对「到任何路段的距离」。
  // 曾放在断头路收尾与碎边合并之前：那两步新增/移动的路段会压到地块上（凯旋门骑路改位后布局守卫抓到 gap 6.2）。
  // 块级检查只看街区四角与中心到主干道的距离，边中点更近的地块会漏过；连接支路又长达上百单位直穿街区、
  // 且在地块之后才加入——布局守卫抓到过 gap 6.4 的压路地块。
  {
    const CELL = 60;
    const grid = new Map<string, RoadEdge[]>();
    for (const edge of edges.values()) {
      const [a0, b0] = edge.points;
      for (let gx = Math.floor(Math.min(a0.x, b0.x) / CELL) - 1; gx <= Math.floor(Math.max(a0.x, b0.x) / CELL) + 1; gx += 1)
        for (let gz = Math.floor(Math.min(a0.z, b0.z) / CELL) - 1; gz <= Math.floor(Math.max(a0.z, b0.z) / CELL) + 1; gz += 1) {
          const key2 = `${gx}:${gz}`;
          const list = grid.get(key2);
          if (list) list.push(edge); else grid.set(key2, [edge]);
        }
    }
    for (const block of blocks) {
      block.parcels = block.parcels.filter((parcel) => {
        const need = Math.hypot(parcel.width, parcel.depth) / 2;
        return (grid.get(`${Math.floor(parcel.x / CELL)}:${Math.floor(parcel.z / CELL)}`) ?? []).every((edge) =>
          segmentDistance(parcel, edge.points[0], edge.points[1]) >= need + edge.width / 2 + 0.5);
      });
    }
  }

  return { blocks, roadNodes: [...nodes.values()], roadEdges: [...edges.values()], terrain, extent, coast, river, publicSites, parkTrees,
    urbanBounds, bridges, boundsRadius, carPaths, coastRoads: coastRoadRuns.slice(0, coastalRunCount), districtAnchors, highways: highwayRuns, core, islandRadius: R, landmarks: withBridgeLandmark(landmarks, bridges, random, highwayRuns), seaside };
}

/** 悬索大桥：有河桥时把最长的那座做成悬索桥（地标，不改路网）。曾按 55% 概率：用户的岛恰好没抽中。 */
function withBridgeLandmark(landmarks: Landmark[], bridges: CityLayout["bridges"], _random: (key: string) => number, highways: Vec2[][] = []): Landmark[] {
  if (!bridges.length) return landmarks;
  // 悬索桥的门式塔高 34、桥宽 12：环线高架（离地 8）若从桥身中段穿过，会直接穿过塔架与主缆（用户截图）。
  // 取最长的、且整段离高架 ≥ 36 的过河桥；都不满足就不做悬索桥（桥仍是普通桥）。
  const clearOfHighways = (b: CityLayout["bridges"][number]) => highways.every((run) => run.every((q, i) => { if (i === 0) return true; for (let k = 0; k <= 10; k += 1) { const t = k / 10; if (segmentDistance({ x: b.from.x + (b.to.x - b.from.x) * t, z: b.from.z + (b.to.z - b.from.z) * t }, run[i - 1], q) < 36) return false; } return true; }));
  const longest = [...bridges].sort((a, b) => b.length - a.length).find(clearOfHighways);
  if (!longest) return landmarks;
  return [...landmarks, { id: "landmark:suspension-bridge", kind: "suspension-bridge", x: longest.from.x, z: longest.from.z, to: longest.to, yaw: longest.angle, radius: 0 }];
}
