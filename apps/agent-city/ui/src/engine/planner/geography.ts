/**
 * 地理阶段（CITY_PLANNER_V2_SPEC §5.1 / 步 2a）：岛形、河、山脊、地形判定——从 buildPlan 逐字迁出。
 *
 * 纯函数：只依赖 (seed, R, shape)，无 three、无上游可变状态；random 是无状态键控哈希
 * （hashSeed(seed:key)），迁移不改变任何随机调用序——行为保持由 plan/场景基线哈希证明。
 * 后续阶段（skeleton/sites/network）只读本产物：coast/height/riverX 等闭包即 Geography 的字段。
 */
import { DetMath as Math } from "../detMath";
import { hashSeed } from "../../cityModel";
import { fbm, smoothstep } from "../cityNoise";
import type { TerrainField, Vec2 } from "../cityLayout";
import type { Shape } from "../cityPlan";
import { exactFieldCache } from "./exactFieldCache";

export type Geography = {
  R: number;
  coast: Vec2[];
  bbox: { minX: number; maxX: number; minZ: number; maxZ: number };
  hasRiver: boolean;
  river: Vec2[];
  riverShift: number;
  riverX: (z: number) => number;
  riverWidth: (z: number) => number;
  coastDistance: (x: number, z: number) => number;
  landClearance: (x: number, z: number) => number;
  hillAngle: number;
  hillDir: Vec2;
  hillLine: number;
  hillProj: (x: number, z: number) => number;
  height: (x: number, z: number) => number;
  buildable: (x: number, z: number) => boolean;
  terrain: TerrainField;
};

export function buildGeography(seed: number, R: number, shape: Shape, opts: { memoize?: boolean } = {}): Geography {
  // Each radius attempt owns its caches. Only the original exact scalar result
  // is reused, and eviction affects cost rather than planning decisions.
  const field = <T extends number | boolean>(evaluate: (x: number, z: number) => T) =>
    opts.memoize === true ? exactFieldCache(evaluate).query : evaluate;
  const stretch = shape.stretch; // Field closures must not depend on mutable caller-owned scalars.
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
  const coastDistance = field((x: number, z: number) => {
    const lx = x * cosSpin + z * sinSpin;
    const lz = -x * sinSpin + z * cosSpin;
    const ux = lx / stretch; const uz = lz * stretch;
    let theta = Math.atan2(uz, ux); if (theta < 0) theta += Math.PI * 2;
    const f = (theta / (Math.PI * 2)) * 720; const i = Math.floor(f);
    const edge = radiusTable[i] + (radiusTable[Math.min(720, i + 1)] - radiusTable[i]) * (f - i);
    return (edge - Math.hypot(ux, uz)) * shrink;
  });
  const landClearance = field((x: number, z: number) => Math.min(coastDistance(x, z), Math.abs(x - riverX(z)) - riverWidth(z)));

  // ── 山脊：方位随种子，占岛在该方向上最外侧的一带。
  const hillAngle = random("hillAngle") * Math.PI * 2;
  const hillDir = { x: Math.cos(hillAngle), z: Math.sin(hillAngle) };
  const reach = Math.max(...coast.map((p) => p.x * hillDir.x + p.z * hillDir.z));
  const hillLine = reach * 0.6;
  const hillProj = (x: number, z: number) => x * hillDir.x + z * hillDir.z;
  const height = field((x: number, z: number) => {
    const inland = landClearance(x, z);
    if (inland < 0) return -0.65 - Math.min(5, -inland * 0.25);
    const hillWeight = smoothstep(hillLine - 10, hillLine + reach * 0.3, hillProj(x, z));
    // 平地权重严格为零时，噪声不影响高度；路网验证会反复采样这些点。
    const hills = hillWeight === 0 ? 0 : hillWeight * (30 + 65 * fbm(x * 0.012, z * 0.013, seed, 4));
    return smoothstep(0, 10, inland) * (1.2 + hills);
  });
  // 离山脚留 12：山体高度从 hillLine−10 开始起坡，地块要落在 1.2 的平地上。
  const buildable = field((x: number, z: number) => landClearance(x, z) > 12 && hillProj(x, z) < hillLine - 12);
  const terrain: TerrainField = {
    height, slope: field((x, z) => Math.hypot(height(x + 1, z) - height(x - 1, z), height(x, z + 1) - height(x, z - 1)) / 2),
    buildable, center: { x: 0, z: 0 }, radius: R * 1.3, coastRadius: () => R, hasRiver,
  };

  return { R, coast, bbox, hasRiver, river, riverShift, riverX, riverWidth, coastDistance, landClearance, hillAngle, hillDir, hillLine, hillProj, height, buildable, terrain };
}
