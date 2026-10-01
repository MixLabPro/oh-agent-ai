/**
 * 城市布局（纯函数，无渲染依赖）：把 CityModel 摆进一片 seeded 随机地理。
 *
 * 地形语言（替换早期的"圆角矩形板 + 方格路网"）：
 *  · 每座岛的海岸线由角度噪声扰动（海湾/半岛），岛缘之外是海；
 *  · 岛内是丘陵缓坡，背海一侧隆起山脊（fBm + ridged noise）；
 *  · 部分（hash 决定的）岛有一条自山脚蜿蜒入海的河，河上有小桥；
 *  · 建筑坐落在可建带（坡度平缓、避开河谷与山体），楼位沿"时间环带"由内向外
 *    有机生长，与加载顺序无关；道路是沿等高带的有机环线 + 放射小径；
 *  · 地图外围另有纯装饰远山，构成天际线层次。
 *
 * 一切地貌由 district.id 的 hash 做 seed → 同一份数据永远长出同一片地理。
 */

import { clamp, fbm, hashInt, ridged, smoothstep } from "./cityNoise";
import { hashSeed, type CityModel } from "../cityModel";

export type Vec2 = { x: number; z: number };

const PLAZA_RADIUS = 6.6;
const DAY_MS = 86_400_000;

/** 点到折线的最短距离（折线段数少，线性扫描足够）。 */
function distanceToPolyline(x: number, z: number, points: Vec2[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    const ax = points[index - 1].x;
    const az = points[index - 1].z;
    const bx = points[index].x;
    const bz = points[index].z;
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSquared = dx * dx + dz * dz || 1e-6;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / lengthSquared, 0, 1);
    const px = ax + dx * t;
    const pz = az + dz * t;
    best = Math.min(best, Math.hypot(x - px, z - pz));
  }
  return best;
}

export type TerrainField = {
  /** 世界坐标 → 地形高度（陆地为正，海底为负，海平面 -0.55）。 */
  height: (x: number, z: number) => number;
  slope: (x: number, z: number) => number;
  buildable: (x: number, z: number) => boolean;
  /** 海岸半径（世界坐标下，给定方位角）。 */
  coastRadius: (angle: number) => number;
  center: Vec2;
  radius: number;
  hasRiver: boolean;
};

type TerrainParams = {
  seed: number;
  center: Vec2;
  radius: number;
  mountainDir: number;
  mountainScale: number;
  river: Vec2[] | null;
  riverHalfWidth: number;
  plazaHeight: number;
  flatCore: boolean;
};

function makeRiverPath(seed: number, center: Vec2, radius: number, mountainDir: number): { points: Vec2[]; halfWidth: number } {
  const startAngle = mountainDir + (hashInt(Math.round(seed), 3, 977) - 0.5) * 0.7;
  const endAngle = startAngle + Math.PI + (hashInt(Math.round(seed), 5, 331) - 0.5) * 0.9;
  const points: Vec2[] = [];
  const steps = 26;
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const angle = startAngle + (endAngle - startAngle) * t;
    const wobble = fbm(t * 3.1, seed * 0.013, Math.round(seed), 3) * radius * 0.16;
    const reach = radius * (0.78 + 0.34 * t);
    points.push({
      x: center.x + Math.cos(angle) * reach + Math.cos(angle + Math.PI / 2) * wobble,
      z: center.z + Math.sin(angle) * reach + Math.sin(angle + Math.PI / 2) * wobble,
    });
  }
  return { points, halfWidth: radius * 0.04 + 2.6 };
}

function buildTerrain(params: TerrainParams): TerrainField {
  const { seed, center, radius, mountainDir, mountainScale, river, riverHalfWidth } = params;

  // 陆地场：噪声 - 径向衰减，海岸线是场的零等值线——半岛、深湾、近岸小岛
  // 都由场的形状自然产生，而不是对一个圆做调制。频率相对岛径归一，
  // 大小岛获得一致的形态丰富度。
  const freqLow = 3.2 / radius;
  const freqDetail = 8.6 / radius;
  const maskAt = (x: number, z: number): number => {
    const lx = x - center.x;
    const lz = z - center.z;
    const base = fbm(lx * freqLow + 41.3, lz * freqLow + 7.9, seed ^ 0x51ab, 4);
    const detail = fbm(lx * freqDetail + 9.1, lz * freqDetail + 3.3, seed ^ 0x33cd, 3);
    const d = Math.hypot(lx, lz) / radius;
    return base * 0.34 + detail * 0.1 + (1.08 - Math.pow(d, 2.0) * 1.18);
  };

  // 海岸半径查找表：从中心径向 March 找零等值线（一次性烘焙 256 方位）。
  const COAST_SAMPLES = 256;
  const coastTable = new Float32Array(COAST_SAMPLES + 1);
  for (let index = 0; index < COAST_SAMPLES; index += 1) {
    const angle = (index / COAST_SAMPLES) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let found = radius * 1.18;
    for (let r = radius * 0.6; r <= radius * 1.22; r += radius * 0.02) {
      if (maskAt(center.x + cos * r, center.z + sin * r) <= 0) {
        found = r;
        break;
      }
    }
    coastTable[index] = found;
  }
  coastTable[COAST_SAMPLES] = coastTable[0];
  const coastOf = (angle: number): number => {
    const positive = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const position = positive / (Math.PI * 2) * COAST_SAMPLES;
    const index = Math.floor(position);
    return coastTable[index] + (coastTable[index + 1] - coastTable[index]) * (position - index);
  };

  const rawHeight = (x: number, z: number): number => {
    const localX = x - center.x;
    const localZ = z - center.z;
    const d = Math.hypot(localX, localZ);
    const mask = maskAt(x, z);
    if (mask <= 0) return -(0.55 + 2.2 * smoothstep(0, 0.55, -mask));
    // t = 离海程度（0 深内陆，1 岸边），与旧径向 t 同语义。
    const t = Math.max(0, Math.min(1, 1 - mask * 0.85));

    const angle = Math.atan2(localZ, localX);
    // 丘陵基础（内圈只做轻度压制——城区允许缓坡起伏）。
    const hillAmp = 4.6 * (0.42 + 0.58 * t);
    const hill = (fbm(localX * 0.045, localZ * 0.045, seed ^ 0x77c1, 3) * 0.5 + 0.5) * hillAmp;
    const innerFlat = params.flatCore ? 1 - 0.5 * smoothstep(0.5, 0.74, t) : 0.6 + 0.4 * t;

    // 背海侧山脊（装饰山用中心锥形隆起，数据岛用偏侧山脊）。
    const dirWeight = params.flatCore ? Math.pow(0.5 + 0.5 * Math.cos(angle - mountainDir), 1.25) : 1;
    const ridge = ridged(localX * 0.03 + 13.1, localZ * 0.03 + 71.7, seed ^ 0x2f9e, 3);
    const rise = params.flatCore ? smoothstep(0.36, 0.98, t) : smoothstep(0.04, 0.72, t);
    const mountain = rise * dirWeight * (0.3 + 0.7 * ridge) * mountainScale;

    let h = hill * innerFlat + mountain;
    // 海岸带衰减入海。
    h *= smoothstep(1.0, 0.86, t);
    // 广场压平（区地标立足处）。
    if (params.flatCore && d < PLAZA_RADIUS + 2.4) {
      h = params.plazaHeight + (h - params.plazaHeight) * smoothstep(PLAZA_RADIUS * 0.7, PLAZA_RADIUS + 2.4, d);
    }
    // 河谷下切（河底保持在海面之上，水面用纹理表达）。
    if (river) {
      const riverDistance = distanceToPolyline(x, z, river);
      const span = riverHalfWidth * 2.1;
      if (riverDistance < span) {
        const cut = Math.pow(1 - riverDistance / span, 1.35) * 2.1;
        h = Math.max(h - cut, -0.42);
      }
    }
    return h;
  };

  return {
    height: rawHeight,
    slope(x, z) {
      const eps = 1.7;
      const dx = rawHeight(x + eps, z) - rawHeight(x - eps, z);
      const dz = rawHeight(x, z + eps) - rawHeight(x, z - eps);
      return Math.hypot(dx, dz) / (2 * eps);
    },
    buildable(x, z) {
      const localX = x - center.x;
      const localZ = z - center.z;
      const d = Math.hypot(localX, localZ);
      if (d > radius * 1.06 || d < PLAZA_RADIUS + 2.2) return false;
      if (maskAt(x, z) < 0.14) return false;
      if (this.slope(x, z) > 0.62) return false;
      if (river && distanceToPolyline(x, z, river) < riverHalfWidth + 2.4) return false;
      return true;
    },
    coastRadius: coastOf,
    center,
    radius,
    hasRiver: river !== null,
  };
}

export type DistrictLayout = {
  id: string;
  label: string;
  center: Vec2;
  radius: number;
  terrain: TerrainField;
  /** 楼 id → 世界坐标。 */
  slots: Map<string, Vec2>;
  /** 楼 id → 地基海拔（楼底 y）。 */
  grounds: Map<string, number>;
  /** 有机道路折线（世界坐标，纹理与车辆同源）。 */
  roads: Vec2[][];
  /** 车行路线（世界坐标折线）。 */
  carPaths: Vec2[][];
  river: Vec2[] | null;
  riverHalfWidth: number;
  trees: Array<{ x: number; z: number; y: number; seed: number }>;
  plaza: { x: number; z: number; y: number };
  anomaly: { severity: "critical" | "warning" | "info"; count: number } | null;
  sessionCount: number;
};

export type DecorMountain = { center: Vec2; radius: number; terrain: TerrainField };

export type BridgeLayout = { from: Vec2; to: Vec2; angle: number; length: number };

export type CityLayout = {
  districts: DistrictLayout[];
  bridges: BridgeLayout[];
  boatLanes: Array<{ radius: number; speed: number; phase: number }>;
  boundsRadius: number;
  decorMountains: DecorMountain[];
};

function islandRadius(sessionCount: number): number {
  // 密度目标 ≈ 每 74 单位²一栋（含街道/绿带），可建带占岛内 2/3，
  // 外圈留给丘陵、山脊与海岸 —— 城市要有边界感，不能摊满整座岛。
  return Math.min(132, Math.max(24, 8.2 * Math.sqrt(sessionCount)));
}

/** 有机道路：两条等高环线 + 放射小径；车行取外环与一条穿越线。 */
function buildRoads(terrain: TerrainField, seed: number): { roads: Vec2[][]; carPaths: Vec2[][] } {
  const roads: Vec2[][] = [];
  const local = (angle: number, t: number): Vec2 => {
    const coast = terrain.coastRadius(angle);
    const wobble = fbm(Math.cos(angle) * 2.2 + 7.7, Math.sin(angle) * 2.2 + 3.3, seed ^ 0x11d, 3);
    const reach = coast * t * (1 + wobble * 0.05);
    return { x: terrain.center.x + Math.cos(angle) * reach, z: terrain.center.z + Math.sin(angle) * reach };
  };
  for (const t of [0.34, 0.56]) {
    const ring: Vec2[] = [];
    for (let step = 0; step <= 72; step += 1) ring.push(local((step / 72) * Math.PI * 2, t));
    roads.push(ring);
  }
  const spokes = 9;
  for (let index = 0; index < spokes; index += 1) {
    const angle = (index / spokes) * Math.PI * 2 + hashInt(index, Math.round(seed), 613) * 0.5;
    const spoke: Vec2[] = [];
    for (let step = 0; step <= 18; step += 1) {
      const t = 0.13 + (step / 18) * 0.6;
      spoke.push(local(angle + Math.sin(t * 3.1 + seed) * 0.09, t));
    }
    roads.push(spoke);
  }
  // 车行：外环 + 一条"穿越线"（对径两条放射拼成）。
  const carPaths: Vec2[][] = [roads[1]];
  const crossAngle = hashInt(Math.round(seed), 11, 977) * Math.PI * 2;
  const cross: Vec2[] = [];
  for (let step = 18; step >= 0; step -= 1) {
    const t = 0.13 + (step / 18) * 0.6;
    cross.push(local(crossAngle + Math.sin(t * 3.1 + seed) * 0.09, t));
  }
  for (let step = 0; step <= 18; step += 1) {
    const t = 0.13 + (step / 18) * 0.74;
    cross.push(local(crossAngle + Math.PI + Math.sin(t * 3.1 + seed) * 0.09, t));
  }
  carPaths.push(cross);
  return { roads, carPaths };
}

function buildTrees(terrain: TerrainField, district: DistrictLayout, roads: Vec2[][], seed: number): Array<{ x: number; z: number; y: number; seed: number }> {
  const trees: Array<{ x: number; z: number; y: number; seed: number }> = [];
  const placed = [...district.slots.values()];
  for (let attempt = 0; attempt < 900 && trees.length < 210; attempt += 1) {
    const angle = hashInt(attempt, Math.round(seed), 211) * Math.PI * 2;
    const reach = Math.sqrt(hashInt(attempt, Math.round(seed), 307)) * terrain.radius * 1.02;
    const x = terrain.center.x + Math.cos(angle) * reach;
    const z = terrain.center.z + Math.sin(angle) * reach;
    const slope = terrain.slope(x, z);
    const treeSeed = hashInt(attempt, Math.round(seed), 401);
    // 山脚/坡地与河岸多树；城区内部少量点缀。
    const coast = terrain.coastRadius(Math.atan2(z - terrain.center.z, x - terrain.center.x));
    const inCore = Math.hypot(x - terrain.center.x, z - terrain.center.z) < coast * 0.7;
    const density = inCore ? 0.1 : 0.24 + Math.min(0.5, slope) * 0.55;
    if (treeSeed > density) continue;
    if (terrain.slope(x, z) > 1.5) continue;
    if (district.river && distanceToPolyline(x, z, district.river) < district.riverHalfWidth + 1.1) continue;
    if (roads.some((road) => distanceToPolyline(x, z, road) < 2.3)) continue;
    if (placed.some((slot) => Math.hypot(slot.x - x, slot.z - z) < 3.4)) continue;
    const y = terrain.height(x, z);
    if (y < 0.1) continue;
    trees.push({ x, z, y, seed: treeSeed });
  }
  return trees;
}

export function layoutCity(model: CityModel): CityLayout {
  const spanDays = Math.max(1, (model.windowEndMs - model.windowStartMs) / DAY_MS);

  // ── 区（岛）摆位：主岛居中，卫星岛黄金角环布，山侧一律朝外。 ──
  const ordered = [...model.districts];
  const placedCenters: Array<{ district: typeof ordered[number]; center: Vec2; radius: number }> = [];
  ordered.forEach((district, index) => {
    const radius = islandRadius(Math.max(district.sessionCount, 6));
    if (index === 0) {
      placedCenters.push({ district, center: { x: 0, z: 0 }, radius });
      return;
    }
    const seed = hashSeed(district.id);
    const angle = index * 2.399963 + seed * 0.9;
    const main = placedCenters[0];
    const distance = main.radius + radius + 42 + seed * 30;
    let center = { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance };
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const clash = placedCenters.slice(1).some((other) => Math.hypot(other.center.x - center.x, other.center.z - center.z) < other.radius + radius + 14);
      if (!clash) break;
      const nextAngle = angle + attempt * 0.61 + 0.4;
      center = { x: Math.cos(nextAngle) * distance, z: Math.sin(nextAngle) * distance };
    }
    placedCenters.push({ district, center, radius });
  });

  const districts: DistrictLayout[] = placedCenters.map(({ district, center, radius }, index) => {
    const seed = Math.round(hashSeed(district.id) * 0x7fffffff) || 1;
    const outward = Math.atan2(center.z, center.x) + hashInt(seed, 17, 509) * 0.8 - 0.4;
    const hasRiver = hashInt(seed, 23, 811) < 0.8;
    const riverBase = hasRiver ? makeRiverPath(seed, center, radius, outward) : null;
    const terrainParams: TerrainParams = {
      seed,
      center,
      radius,
      mountainDir: outward,
      mountainScale: radius * 0.38 + 15,
      river: riverBase?.points ?? null,
      riverHalfWidth: riverBase?.halfWidth ?? 0,
      plazaHeight: 0.9,
      flatCore: true,
    };
    const terrain = buildTerrain(terrainParams);
    const { roads, carPaths } = buildRoads(terrain, seed);

    const layout: DistrictLayout = {
      id: district.id,
      label: district.label,
      center,
      radius,
      terrain,
      slots: new Map(),
      grounds: new Map(),
      roads,
      carPaths,
      river: riverBase?.points ?? null,
      riverHalfWidth: riverBase?.halfWidth ?? 0,
      trees: [],
      plaza: { x: center.x, z: center.z, y: 0.9 },
      anomaly: district.anomaly ? { severity: district.anomaly.severity, count: district.anomaly.count } : null,
      sessionCount: district.sessionCount,
    };

    // ── 有机落位：时间环带 + 距离/可建性检查，由内向外生长。 ──
    const districtBuildings = model.buildings.filter((building) => building.districtId === district.id);
    const orderedBuildings = [...districtBuildings].sort((left, right) => left.startedAt - right.startedAt || (left.id < right.id ? -1 : 1));
    const placedSlots: Vec2[] = [];
    for (const building of orderedBuildings) {
      const dayFraction = Math.min(0.96, Math.max(0.04, (building.startedAt - model.windowStartMs) / (spanDays * DAY_MS)));
      const seedA = hashSeed(`${building.id}#a`);
      const seedB = hashSeed(`${building.id}#b`);
      const seedC = hashSeed(`${building.id}#c`);
      // 15% 的会话跳到更外圈：打破同心环，形成卫星聚落。
      const bandJump = seedC > 0.85 ? 0.16 : 0;
      const bandJitter = (seedC - 0.5) * 0.16;
      let chosen: Vec2 | null = null;
      for (let attempt = 0; attempt < 34 && !chosen; attempt += 1) {
        const angle = seedA * Math.PI * 2 + attempt * 2.399963;
        // 方位簇聚：低频角度噪声划出"宜居扇区"，约四分之一方位是绿带/空地——
        // 城市长成多瓣聚落，而不是填满每个同心环。
        const sector = fbm(Math.cos(angle) * 2.3 + 50.3, Math.sin(angle) * 2.3 + 27.9, seed ^ 0x4d2, 2) * 0.5 + 0.5;
        if (sector < 0.42) continue;
        // 建筑带只占岛内 2/3：外圈是丘陵/绿带/海岸，城市有呼吸感。
        const band = Math.min(0.82, 0.17 + 0.5 * dayFraction + bandJump + bandJitter);
        const reachFactor = band * (0.8 + seedB * 0.34 + attempt * 0.018);
        const coast = terrain.coastRadius(angle);
        const reach = Math.min(coast - 4, reachFactor * coast);
        const x = center.x + Math.cos(angle) * reach;
        const z = center.z + Math.sin(angle) * reach;
        if (!terrain.buildable(x, z)) continue;
        const minDistance = building.footprint * 0.62 + 4.9;
        if (placedSlots.some((slot) => Math.hypot(slot.x - x, slot.z - z) < minDistance)) continue;
        chosen = { x, z };
      }
      if (!chosen) continue; // 极满时丢弃个别楼，好过重叠穿模。
      placedSlots.push(chosen);
      layout.slots.set(building.id, chosen);
      layout.grounds.set(building.id, terrain.height(chosen.x, chosen.z));
    }

    layout.trees = buildTrees(terrain, layout, roads, seed);
    return layout;
  });

  // ── 岛间桥：接在彼此朝向对方的海岸点上。 ──
  const bridges: BridgeLayout[] = [];
  const main = districts[0];
  for (const district of districts.slice(1)) {
    const direction = { x: district.center.x - main.center.x, z: district.center.z - main.center.z };
    const length = Math.hypot(direction.x, direction.z);
    if (length <= 0) continue;
    const unit = { x: direction.x / length, z: direction.z / length };
    const mainAngle = Math.atan2(direction.z, direction.x);
    const from = {
      x: main.center.x + unit.x * (main.terrain.coastRadius(mainAngle) + 1.2),
      z: main.center.z + unit.z * (main.terrain.coastRadius(mainAngle) + 1.2),
    };
    const backAngle = mainAngle + Math.PI;
    const to = {
      x: district.center.x + unit.x * -(district.terrain.coastRadius(backAngle) + 1.2),
      z: district.center.z + unit.z * -(district.terrain.coastRadius(backAngle) + 1.2),
    };
    const span = Math.hypot(to.x - from.x, to.z - from.z);
    bridges.push({ from, to, angle: Math.atan2(to.z - from.z, to.x - from.x), length: span });
  }

  let boundsRadius = 0;
  for (const district of districts) boundsRadius = Math.max(boundsRadius, Math.hypot(district.center.x, district.center.z) + district.radius * 1.28);

  // ── 装饰远山：地图外围的纯视觉山岛，构成地理背景。 ──
  const decorMountains: DecorMountain[] = [];
  for (let index = 0; index < 3; index += 1) {
    const seed = Math.round(hashSeed(`decor-mountain:${index}`) * 0x7fffffff) || 9;
    const angle = hashSeed(`decorAngle:${index}`) * Math.PI * 2 + index * 2.1;
    const distance = boundsRadius + 24 + hashSeed(`decorDist:${index}`) * 46;
    const radius = 24 + hashSeed(`decorR:${index}`) * 15;
    const center = { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance };
    const terrain = buildTerrain({
      seed,
      center,
      radius,
      mountainDir: angle + Math.PI,
      mountainScale: radius * 0.9 + 16,
      river: null,
      riverHalfWidth: 0,
      plazaHeight: 0.8,
      flatCore: false,
    });
    decorMountains.push({ center, radius, terrain });
  }

  const harborBase = boundsRadius + 34;
  const boatLanes = [
    { radius: harborBase, speed: 0.1, phase: 0 },
    { radius: harborBase + 16, speed: -0.07, phase: 2.2 },
    { radius: harborBase + 32, speed: 0.05, phase: 4.1 },
  ];

  return { districts, bridges, boatLanes, boundsRadius, decorMountains };
}
