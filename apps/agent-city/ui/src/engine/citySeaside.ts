/**
 * 海滨带契约（CITY_VICE_THEME_TECHNICAL_DESIGN §1 / B1）：把「环岛一圈 waterfront」
 * 收敛为一段连续、朝向良好的海滨街面，并向下游输出沙带/步道/酒店排的空间数据。
 *
 * 纯函数模块：不 import three、不读主题/UI；对城市几何的判定全部经 SeasideWorld
 * 谓词注入（规划层传入 coastDistance/height/slope/river/reservations）。确定性由
 * hashSeed 保证——同 seed 同配置必得同一段；无有效段时整段降级（degraded 带
 * reason），不强行摆放（技术设计 §8 停止条件）。
 *
 * 偏移顺序（沿内向法线，世界单位）：水线 → 湿沙外缘 → 干沙外缘 → 步道中心 →
 * 酒店前排 → 带外缘。湿沙靠水、干沙靠内陆（修订设计纠正过的顺序）。
 */

import { hashSeed } from "../cityModel";
import type { Vec2 } from "./cityLayout";

export type CoastalConfig = {
  profile: "miami-coastal";
  version: number;
  biome: "tropical";
  /** 段选择：期望朝向（段外法线方向，弧度）与偏好衰减角。 */
  preferredAzimuth: number;
  azimuthTolerance: number;
  /** 目标段弧长（弧度）。 */
  segmentArc: number;
  /** 沿内向法线的偏移（世界单位）。 */
  wetSandWidth: number;
  drySandWidth: number;
  promenadeOffset: number;
  hotelOffset: number;
  bandOuter: number;
  /** 校验阈值。 */
  maxCoastalSlope: number;
  maxCoastalHeight: number;
  riverMargin: number;
  siteMargin: number;
  /** 有效采样占比低于该值 → 整段降级。 */
  minValidRatio: number;
};

export const MIAMI_COASTAL: CoastalConfig = {
  profile: "miami-coastal",
  version: 1,
  biome: "tropical",
  preferredAzimuth: Math.PI / 2,
  azimuthTolerance: 1.2,
  segmentArc: (85 * Math.PI) / 180,
  wetSandWidth: 7,
  drySandWidth: 14,
  promenadeOffset: 18,
  hotelOffset: 27,
  bandOuter: 38,
  maxCoastalSlope: 0.9,
  maxCoastalHeight: 6,
  riverMargin: 26,
  siteMargin: 14,
  minValidRatio: 0.6,
};

export type SeasideSample = {
  azimuth: number;
  waterline: Vec2;
  /** 单位内向法线（指向陆地）。 */
  inward: Vec2;
  wetOuter: Vec2;
  dryOuter: Vec2;
  promenade: Vec2;
  hotelLine: Vec2;
  outer: Vec2;
  /** 酒店线处地面高度。 */
  groundY: number;
  valid: boolean;
  reason?: string;
};

export type SeasideBand = {
  id: string;
  azimuthFrom: number;
  azimuthTo: number;
  samples: SeasideSample[];
  validRatio: number;
  degraded: boolean;
  reason?: string;
};

/** 规划层注入的世界判定（全部为近似即可；coastDistance 是保守下界）。 */
export type SeasideWorld = {
  /** 带符号离岸距离近似：陆正海负。 */
  landSignedDistance: (x: number, z: number) => number;
  height: (x: number, z: number) => number;
  slope: (x: number, z: number) => number;
  /** 点到河带边缘的距离（无河返回 Infinity）。 */
  riverDistance: (x: number, z: number) => number;
  reservations: Array<{ x: number; z: number; radius: number }>;
  /** 排除朝向（港口/河口等），at 为方位角、halfWidth 为半宽。 */
  blockedAzimuths: Array<{ at: number; halfWidth: number }>;
};

const normalizeAngle = (a: number): number => {
  let r = a % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r;
};
const angleDelta = (a: number, b: number): number => {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(d, Math.PI * 2 - d);
};

/** 海岸点 i 处的单位内向法线：相邻点切向取垂直，朝向用「指向城心」定向。 */
export function coastInwardNormal(coast: Vec2[], center: Vec2, index: number): Vec2 {
  const n = coast.length;
  const prev = coast[(index - 1 + n) % n];
  const next = coast[(index + 1) % n];
  let tx = next.x - prev.x;
  let tz = next.z - prev.z;
  const len = Math.hypot(tx, tz) || 1;
  tx /= len; tz /= len;
  let nx = -tz;
  let nz = tx;
  const p = coast[index];
  if (nx * (center.x - p.x) + nz * (center.z - p.z) < 0) { nx = -nx; nz = -nz; }
  return { x: nx, z: nz };
}

const offset = (p: Vec2, d: Vec2, amount: number): Vec2 => ({ x: p.x + d.x * amount, z: p.z + d.z * amount });

/** 单个海岸采样的带点计算与校验。 */
function buildSample(point: Vec2, inward: Vec2, azimuth: number, world: SeasideWorld, config: CoastalConfig): SeasideSample {
  const wetOuter = offset(point, inward, config.wetSandWidth);
  const dryOuter = offset(point, inward, config.drySandWidth);
  const promenade = offset(point, inward, config.promenadeOffset);
  const hotelLine = offset(point, inward, config.hotelOffset);
  const outer = offset(point, inward, config.bandOuter);
  const groundY = world.height(hotelLine.x, hotelLine.z);
  let valid = true;
  let reason: string | undefined;
  if (world.landSignedDistance(hotelLine.x, hotelLine.z) <= 2) { valid = false; reason = "hotel-line-off-land"; }
  else if (world.slope(promenade.x, promenade.z) > config.maxCoastalSlope) { valid = false; reason = "steep-promenade"; }
  else if (groundY > config.maxCoastalHeight) { valid = false; reason = "high-ground"; }
  else if (world.riverDistance(promenade.x, promenade.z) < config.riverMargin) { valid = false; reason = "river"; }
  else if (world.reservations.some((site) => Math.hypot(hotelLine.x - site.x, hotelLine.z - site.z) < site.radius + config.siteMargin)) { valid = false; reason = "reservation"; }
  return { azimuth, waterline: point, inward, wetOuter, dryOuter, promenade, hotelLine, outer, groundY, valid, reason };
}

/**
 * 选段 + 建带。候选窗口按海岸索引滑动（步长 = 每窗至少移动 3 个海岸点），得分 =
 * 有效采样比例 + 朝向偏好 − 排除朝向惩罚 + 小幅种子抖动；最高分即选段。
 * 无任何窗口达到 minValidRatio → degraded 段（保留最佳窗口与诊断），不返回 null
 * 以便下游统一消费；彻底无候选海岸时返回 degraded 空带。
 */
export function buildSeasideBand(coast: Vec2[], center: Vec2, world: SeasideWorld, config: CoastalConfig, seed: number): SeasideBand {
  const n = coast.length;
  const azimuthOf = (p: Vec2) => normalizeAngle(Math.atan2(p.z - center.z, p.x - center.x));
  const samplesPerWindow = Math.max(4, Math.round((config.segmentArc / (Math.PI * 2)) * n));
  const step = Math.max(3, Math.round(samplesPerWindow / 6));
  let best: { from: number; score: number; samples: SeasideSample[] } | null = null;
  for (let start = 0; start < n; start += step) {
    const samples: SeasideSample[] = [];
    for (let k = 0; k < samplesPerWindow; k += 1) {
      const index = (start + Math.round((k * (samplesPerWindow - 1)) / Math.max(1, samplesPerWindow - 1))) % n;
      const point = coast[index];
      const inward = coastInwardNormal(coast, center, index);
      samples.push(buildSample(point, inward, azimuthOf(point), world, config));
    }
    const midAzimuth = azimuthOf(coast[(start + Math.round(samplesPerWindow / 2)) % n]);
    const outward = normalizeAngle(midAzimuth);
    const orientationBonus = Math.max(0, 1 - angleDelta(outward, config.preferredAzimuth) / Math.max(0.001, config.azimuthTolerance));
    const blocked = world.blockedAzimuths.some((b) => angleDelta(outward, b.at) < b.halfWidth);
    const validRatio = samples.filter((s) => s.valid).length / samples.length;
    const score = validRatio + orientationBonus * 0.5 - (blocked ? 2 : 0) + hashSeed(`seaside-score:${seed}:${start}`) * 0.05;
    if (!best || score > best.score) best = { from: start, score, samples };
  }
  const id = `seaside:${seed}`;
  if (!best) return { id, azimuthFrom: 0, azimuthTo: 0, samples: [], validRatio: 0, degraded: true, reason: "no-coast" };
  const validRatio = best.samples.filter((s) => s.valid).length / best.samples.length;
  const azimuthFrom = azimuthOf(coast[best.from]);
  const azimuthTo = azimuthOf(coast[(best.from + samplesPerWindow - 1) % n]);
  return {
    id,
    azimuthFrom,
    azimuthTo,
    samples: best.samples,
    validRatio,
    degraded: validRatio < config.minValidRatio,
    reason: validRatio < config.minValidRatio ? `valid-ratio-${validRatio.toFixed(2)}` : undefined,
  };
}

/** 点是否落在海滨保留带内（水线→带外缘的条带，含内侧小缓冲）：街区/地块避让用。 */
export function seasideStripContains(band: SeasideBand, p: Vec2, buffer = 0): boolean {
  if (band.degraded) return false;
  for (let lateralIndex = 0; lateralIndex < band.samples.length; lateralIndex += 1) {
    const sample = band.samples[lateralIndex];
    if (!sample.valid) continue;
    const dx = p.x - sample.waterline.x;
    const dz = p.z - sample.waterline.z;
    const along = dx * sample.inward.x + dz * sample.inward.z;
    const lateral = Math.abs(-dx * sample.inward.z + dz * sample.inward.x);
    if (along >= -buffer && along <= bandOuterOf(sample) + buffer && lateral <= lateralHalfOf(band, lateralIndex, sample)) return true;
  }
  return false;
}
const bandOuterOf = (sample: SeasideSample): number => Math.hypot(sample.outer.x - sample.waterline.x, sample.outer.z - sample.waterline.z);
/** 该采样单元的横向半径：与相邻水线采样距离的一半（采样近似等距）。 */
const lateralHalfOf = (band: SeasideBand, index: number, sample: SeasideSample): number => {
  const n = band.samples.length;
  let nearest = Infinity;
  for (const step of [-1, 1]) {
    const other = band.samples[(index + step + n) % n];
    if (other === sample) continue;
    nearest = Math.min(nearest, Math.hypot(other.waterline.x - sample.waterline.x, other.waterline.z - sample.waterline.z));
  }
  return (Number.isFinite(nearest) ? nearest : 28) / 2 + 1;
};

/** 步道中心折线（棕榈列/铺装消费）：无效采样在相邻有效点之间线性补点，保持折线连续。 */
export function promenadePolyline(band: SeasideBand): Vec2[] {
  const valid = band.samples.filter((sample) => sample.valid).map((sample) => sample.promenade);
  if (valid.length < 2) return valid;
  const points: Vec2[] = [valid[0]];
  for (let index = 1; index < valid.length; index += 1) {
    const a = valid[index - 1];
    const b = valid[index];
    const gap = Math.hypot(b.x - a.x, b.z - a.z);
    // 间距超过常规采样距 → 中间存在无效采样，按 ~15 单位间距线性补足（无上限：
    // 连续多个无效采样的长缺口也要连续，曾用 min(3,…) 上限在 4+ 连续无效时断裂）。
    if (gap > 30) {
      const fill = Math.max(1, Math.ceil(gap / 15) - 1);
      for (let k = 1; k <= fill; k += 1) points.push({ x: a.x + (b.x - a.x) * (k / (fill + 1)), z: a.z + (b.z - a.z) * (k / (fill + 1)) });
    }
    points.push(b);
  }
  return points;
}

/** B2 数据纹理的有符号距离编码/解码（RGBA8 的 R 通道）。 */
export const encodeDistance = (d: number, range: number): number => Math.max(0, Math.min(1, (d / range + 1) / 2));
export const decodeDistance = (v: number, range: number): number => (v * 2 - 1) * range;
/** 量化误差上界：8bit 通道 → range/127.5。用于「误差 < 过渡宽度」的预算断言。 */
export const distanceQuantizationError = (range: number): number => range / 127.5;
