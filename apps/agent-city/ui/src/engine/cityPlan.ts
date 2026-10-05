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
export type LandmarkKind = "tv-tower" | "sail-opera" | "arch" | "pagoda" | "lighthouse" | "ferris-wheel" | "suspension-bridge" | "twin-towers" | "twist-tower";
export type Landmark = Vec2 & { id: string; kind: LandmarkKind; yaw: number; radius: number; to?: Vec2 };
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
  place("observation-tower", "tower", around(turn + 0.9, 0.16 * R), 26, 0);
  place("central-station", "station", around(turn + 2.2, 0.38 * R), 46, 0.12);
  place("riverside-park", "park", hasRiver ? { x: riverX(core.z + 0.18 * R) + riverWidth(core.z) + 60, z: core.z + 0.18 * R } : around(turn + 3.6, 0.3 * R), 47, 0);
  place("east-stadium", "stadium", around(turn + 4.8, 0.45 * R), 49, 0.2);
  {
    // 港口：离核心最近的一段海岸内侧（码头离市中心不远）。
    const shore = [...coast].sort((a, b) => Math.hypot(a.x - core.x, a.z - core.z) - Math.hypot(b.x - core.x, b.z - core.z))[0];
    // 中心放在岸线内侧固定距离（0.7×半径），码头边缘贴水：曾按到核心距离的 12% 内移，核心远时港口落在内陆沙地上。
    const toCore = Math.max(1, Math.hypot(core.x - shore.x, core.z - shore.z));
    const inset = Math.min(37 * 0.7, toCore * 0.5);
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
    ];
    // 数量随岛规模增长：1 档 4 座，每两档多一座，最多 7 座。曾固定抽 2–3 座：摩天轮只在 16/60 个种子里出现，
    // 真机反馈「原来的吊桥和摩天轮为什么没看见」。
    const count = Math.min(7, 4 + Math.floor((tier - 1) / 2));
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
  const SHORE_SITE_KINDS = new Set(["harbor", "lighthouse", "sail-opera", "ferris-wheel"]);
  // 主干道：5–6 条，均分方位 + 抖动；指向山脊的方向（与山脊方位夹角 < 40°）不修路。
  const trunkCount = 5 + Math.floor(random("trunks") * 2);
  const trunkBase = random("trunkBase") * Math.PI * 2;
  const trunks: Array<{ angle: number; points: Vec2[] }> = [];
  const bridges: CityLayout["bridges"] = [];
  for (let i = 0; i < trunkCount; i += 1) {
    const angle = trunkBase + (i / trunkCount) * Math.PI * 2 + (random(`trunkJ${i}`) - 0.5) * 0.35;
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
  const SHORE_BOUND = new Set([...SHORE_SITE_KINDS, "civic"]); // civic = 核心广场，四周是环路
  const trunkSegments = trunks.flatMap((trunk) => trunk.points.slice(1).map((b, k) => [trunk.points[k], b] as const))
    .filter(([a, b]) => !bridges.some((bridge) => bridge.to === b || bridge.from === a && bridge.to === b));
  for (const site of [...publicSites, ...landmarks]) {
    if (!site.radius || SHORE_BOUND.has(site.kind)) continue;
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
        if (!buildable(q.x, q.z) || landClearance(q.x, q.z) < site.radius * 0.6) continue;
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
        (c) => distanceToTrunks(c) >= site.radius + 8 && clearsHighways(c, site.radius * 2, site.radius * 2, ringRuns));
      site.x = q.x; site.z = q.z;
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
  for (const segment of coastalRoadRuns) {
    if (segment.length < 2) continue;
    for (const endpoint of [segment[0], segment[segment.length - 1]]) {
      connectToNetwork(endpoint, 160, true, (edge) => coastalRoadEdgeIds.has(edge.id));
    }
  }

  const zoneFor = (center: Vec2): Zone => {
    // 分区由地理与骨架决定：核心附近 downtown、临海 waterfront、主干道两侧 commercial、其余 residential。
    if (Math.hypot(center.x - core.x, center.z - core.z) < 0.24 * R) return "downtown";
    if (coastDistance(center.x, center.z) < 90) return "waterfront";
    if (trunkIndex.closerThan(center, 60)) return "commercial";
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
      const polygon = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      const center = at(i + 0.5, j + 0.5);
      const centerAngle = Math.atan2(center.z - core.z, center.x - core.x);
      if (!angleBetween(centerAngle, sector.lo, sector.hi)) continue;
      // 四角都在本扇区内（不和相邻扇区的街网重叠）、可建、离主干道与环线高架留出路幅。
      if (polygon.some((p) => !angleBetween(Math.atan2(p.z - core.z, p.x - core.x), sector.lo, sector.hi))) continue;
      if (polygon.some((p) => !buildable(p.x, p.z))) continue;
      // 海滨保留带（水线→带外缘）内不生成街区：沙滩/步道/酒店排用地。
      if (seaside && polygon.some((p) => seasideStripContains(seaside, p, 4))) continue;
      if (polygon.some((p, k) => { const q = polygon[(k + 1) % 4]; return !buildable((p.x + q.x) / 2, (p.z + q.z) / 2); })) continue;
      if ([center, ...polygon].some((p) => trunkIndex.closerThan(p, 7))) continue;
      if ([center, ...polygon].some((p) => ringIndex.closerThan(p, 9))) continue;
      // 压到预留地的格子整格不生成（曾只是不放地块、四条边照样成路——支路穿过公园/广场）。
      if (reservations().some((site) => polygonDistance(site, polygon) > -site.radius)) continue;
      const zone = zoneFor(center);
      const id = `plan:${sectorIndex}:${i}:${j}`; const parcels: Parcel[] = [];
      const sideLength = Math.hypot(polygon[1].x - polygon[0].x, polygon[1].z - polygon[0].z);
      const columnCount = Math.max(3, Math.floor((sideLength - 14) / 7.2));
      for (let side = 0; side < 2; side += 1) for (let index = 0; index < columnCount; index += 1) {
        const a = polygon[side === 0 ? 0 : 3]; const b = polygon[side === 0 ? 1 : 2];
        const length = Math.hypot(b.x - a.x, b.z - a.z); const dx = (b.x - a.x) / length; const dz = (b.z - a.z) / length;
        const t = (index + 0.5) / columnCount; const inset = side === 0 ? 12 : -12;
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
        const q = polygon[(e + 1) % 4];
        // 贴着主干道的那条边不再单修一条平行支路：主干道本身就是这排街区的临街道路。
        if (trunkIndex.closerThan(p, 12) && trunkIndex.closerThan(q, 12)) { frontNodes.push(p, q); return; }
        // 与主干道/滨海大道近乎平行（<15°）且很近：≤12 视为同一条路不修，≤25 降为支路——不再并排出现两条大路。
        const parallel = parallelPrimaryGap(p, q);
        if (parallel <= 12) { frontNodes.push(p, q); return; }
        addEdge(p, q, parallel > 25 && (e % 2 === 0 ? j % 3 === 0 : i % 3 === 0));
      });
    }
  });

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
    let nearest: { p: Vec2; d: number } | null = null;
    for (const edge of edges.values()) {
      if (edge.bridge) continue;
      const [a, b] = edge.points; const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((site.x - a.x) * dx + (site.z - a.z) * dz) / l2));
      const p = { x: a.x + dx * t, z: a.z + dz * t }; const d = Math.hypot(p.x - site.x, p.z - site.z);
      if (!nearest || d < nearest.d) nearest = { p, d };
    }
    if (!nearest || nearest.d <= site.radius + 14) continue;
    const ux = (nearest.p.x - site.x) / nearest.d; const uz = (nearest.p.z - site.z) / nearest.d;
    // 岸边地标（灯塔在岬角尖上）门口常是不可建的岸滩：沿朝路方向往里走到可建地面再起路。
    let reach = site.radius + 6;
    while (reach < nearest.d - 4 && !buildable(site.x + ux * reach, site.z + uz * reach)) reach += 4;
    const gate = key({ x: site.x + ux * reach, z: site.z + uz * reach });
    if (!connectToNetwork(gate, 240, false)) connectToNetwork(gate, 700, false, () => false, 35);
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

  // 终筛：主干道、桥、连接支路都定型后，对每个地块统一核对「到任何路段的距离」。
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
      const route = carPaths[r];
      const ok = route.every((p, i) => i === 0 || pairs.has([roadNodeId(key(route[i - 1])), roadNodeId(key(p))].sort().join("/")));
      if (!ok) carPaths.splice(r, 1);
    }
  }
  return { blocks, roadNodes: [...nodes.values()], roadEdges: [...edges.values()], terrain, extent, coast, river, publicSites, parkTrees,
    urbanBounds, bridges, boundsRadius, carPaths, districtAnchors, highways: highwayRuns, core, islandRadius: R, landmarks: withBridgeLandmark(landmarks, bridges, random), seaside };
}

/** 悬索大桥：有河桥时把最长的那座做成悬索桥（地标，不改路网）。曾按 55% 概率：用户的岛恰好没抽中。 */
function withBridgeLandmark(landmarks: Landmark[], bridges: CityLayout["bridges"], _random: (key: string) => number): Landmark[] {
  if (!bridges.length) return landmarks;
  const longest = [...bridges].sort((a, b) => b.length - a.length)[0];
  return [...landmarks, { id: "landmark:suspension-bridge", kind: "suspension-bridge", x: longest.from.x, z: longest.from.z, to: longest.to, yaw: longest.angle, radius: 0 }];
}
