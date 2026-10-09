/**
 * RaceCourse（§7.1）：有界确定性穿环路线生成。输入 (FlightWorld 快照, citySeed,
 * courseVersion, physicsVersion, variant) 完全决定输出；重试复用原路线，显式
 * 「新路线」才更新 variant。生成流程：海面宽弧候选 → Chaikin 平滑 → 按弧长放环 →
 * 高度净空校正 → 转弯/间距/障碍验证 → 整条安全走廊验证；最多 8 次尝试后用
 * 海面宽弧降级路线（过同一验证，不允许「忽略障碍」强行成功）。空岛同样生成。
 * 纯模块（无 three/DOM）；限时 = 参考飞行时间 × 1.6，参考时长夹在 45–90 秒带内。
 */
import type { FlightWorld } from "./FlightWorld";
import type { FlightParams } from "./FlightSimulation";
import { DetMath as Math } from "../engine/detMath";
import { hashSeed } from "../cityModel";

export const COURSE_VERSION = 1;
const RING_COUNT = 12; // 含终点（§7.1 默认）
const MAX_ATTEMPTS = 8;
const REACTION_SECONDS_AT_MAX = 1.2; // 最大速度下的可见反应时间（环间距下限）
const LIMIT_FACTOR = 1.6;

export type CourseRing = {
  x: number; y: number; z: number;
  /** 环面法线（单位向量，沿路径切线）。 */
  nx: number; ny: number; nz: number;
  radius: number;
};

export type RaceCourse = {
  kind: "generated" | "fallback";
  rings: CourseRing[];
  /** 模拟时钟时限（ms，含罚时口径见 RaceMission）。 */
  timeLimitMs: number;
  /** 参考巡航飞行时长（ms）。 */
  referenceMs: number;
  ringRadius: number;
  /** 路线身份摘要（存档键；无业务标识）。 */
  courseId: string;
  variant: number;
};

export type CourseRequest = {
  world: FlightWorld;
  params: FlightParams;
  citySeed: number;
  physicsVersion: number;
  variant: number;
};

type PathPoint = { x: number; y: number; z: number };

/** 路线生成结果：null = 无可用安全路线（调用方拒绝开始挑战，§6.3）。 */
export function generateRaceCourse(request: CourseRequest): RaceCourse | null {
  const { world, params, citySeed, physicsVersion, variant } = request;
  const bounds = world.bounds;
  const ringRadius = Math.max(8, Math.min(16, params.planeRadius * 3.4));
  const clearance = ringRadius + params.planeRadius * 1.5;

  const buildArc = (radius: number, phase: number, jitter: number, undulate: number): PathPoint[] => {
    const points: PathPoint[] = [];
    const baseAltitude = Math.min(bounds.maxY - clearance, Math.max(34, (bounds.maxY - 40) * 0.5 + 30));
    const waypointCount = 7;
    for (let index = 0; index < waypointCount; index += 1) {
      const angle = phase + (index / waypointCount) * Math.PI * 2;
      const wobble = (hashSeed(`${citySeed}:${physicsVersion}:${variant}:wob:${index}`) - 0.5) * jitter;
      const r = radius * (1 + wobble);
      const x = bounds.centerX + Math.cos(angle) * r;
      const z = bounds.centerZ + Math.sin(angle) * r;
      // 高度：海面基准 ± 和缓起伏；贴地形/障碍校正由 validate/correctHeight 兜底。
      const wave = Math.sin(angle * 2 + phase) * undulate;
      let y = baseAltitude + wave;
      const terrain = Math.max(0, world.terrainHeight(x, z));
      const obstacleFloor = obstacleTopNear(world, x, z, ringRadius * 2) ?? terrain;
      y = Math.max(y, obstacleFloor + clearance, terrain + clearance * 0.8);
      points.push({ x, y, z });
    }
    return points;
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    // 尝试参数：半径从岛缘外收到软边界内、抖动/起伏逐次收小（确定性）。
    const radius = Math.min(bounds.softRadius * 0.94, Math.max(world.islandRadius * 1.18, bounds.softRadius * (0.94 - attempt * 0.05)));
    const phase = hashSeed(`${citySeed}:${physicsVersion}:${variant}:phase:${attempt}`) * Math.PI * 2;
    const jitter = Math.max(0.04, 0.22 - attempt * 0.03);
    const undulate = Math.max(2, 10 - attempt * 1.2);
    const path = smoothClosed(buildArc(radius, phase, jitter, undulate));
    const rings = placeRings(path, ringRadius, params);
    if (!rings) continue;
    if (!validateCorridor(world, rings, params, clearance)) continue;
    return finalize(citySeed, physicsVersion, variant, rings, params, "generated");
  }
  // 降级：纯海面宽弧（无抖动、无起伏），仍走同一验证。
  const radius = Math.min(bounds.softRadius * 0.9, Math.max(world.islandRadius * 1.25, bounds.softRadius * 0.72));
  const path = smoothClosed(buildArc(radius, hashSeed(`${citySeed}:fallback`) * Math.PI * 2, 0.02, 3));
  const rings = placeRings(path, ringRadius, params);
  if (rings && validateCorridor(world, rings, params, clearance)) {
    return finalize(citySeed, physicsVersion, variant, rings, params, "fallback");
  }
  return null;
}

/** 路线几何摘要（courseId）：bounds+环坐标+半径，无会话标识（§9）。 */
function courseIdentity(citySeed: number, physicsVersion: number, variant: number, rings: CourseRing[], radius: number): string {
  const digest = rings.map((ring) => `${Math.round(ring.x)},${Math.round(ring.y)},${Math.round(ring.z)}`).join(";");
  return `course:v${COURSE_VERSION}:p${physicsVersion}:${citySeed}:${variant}:${Math.round(hashSeed(digest) * 1e9)}:r${Math.round(radius)}`;
}

function finalize(citySeed: number, physicsVersion: number, variant: number, rings: CourseRing[], params: FlightParams, kind: "generated" | "fallback"): RaceCourse {
  let length = 0;
  for (let index = 0; index < rings.length; index += 1) {
    const from = rings[index];
    const to = rings[(index + 1) % rings.length];
    length += Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  }
  // 参考时长按巡航速度；挑战带 45–90s 由生成半径自然落带，不强行改限时口径
  // （§7.1：不保证固定 45s，限时 = 参考 × 1.6）。
  const referenceMs = (length / params.cruiseSpeed) * 1000;
  const timeLimitMs = Math.round(referenceMs * LIMIT_FACTOR);
  const courseId = courseIdentity(citySeed, physicsVersion, variant, rings, rings[0].radius);
  return { kind, rings, timeLimitMs, referenceMs: Math.round(referenceMs), ringRadius: rings[0].radius, courseId, variant };
}

/** Chaikin 切角两轮：封闭折线 → 更圆滑的封闭折线（纯四则运算，确定性）。 */
function smoothClosed(points: PathPoint[]): PathPoint[] {
  let current = points;
  for (let round = 0; round < 2; round += 1) {
    const next: PathPoint[] = [];
    for (let index = 0; index < current.length; index += 1) {
      const a = current[index];
      const b = current[(index + 1) % current.length];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25, z: a.z * 0.75 + b.z * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    current = next;
  }
  return current;
}

/** 按弧长等距放 RING_COUNT 个环（起点环=出生切线方向后的第一环；环面法线沿切线）。 */
function placeRings(path: PathPoint[], ringRadius: number, params: FlightParams): CourseRing[] | null {
  if (path.length < 4) return null;
  // 累计弧长表。
  const cumulative: number[] = [0];
  for (let index = 1; index <= path.length; index += 1) {
    const a = path[index - 1];
    const b = path[index % path.length];
    cumulative.push(cumulative[index - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  const total = cumulative[cumulative.length - 1];
  if (!(total > 0)) return null;
  const sampleAt = (distance: number): PathPoint => {
    const target = ((distance % total) + total) % total;
    let index = 1;
    while (index < cumulative.length - 1 && cumulative[index] < target) index += 1;
    const span = cumulative[index] - cumulative[index - 1] || 1;
    const t = (target - cumulative[index - 1]) / span;
    const a = path[index - 1];
    const b = path[index % path.length];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
  };
  const rings: CourseRing[] = [];
  const spacing = total / RING_COUNT;
  const minSpacing = params.maxSpeed * REACTION_SECONDS_AT_MAX;
  if (spacing < minSpacing) return null; // 反应时间不足：整条半径放大重试
  for (let index = 0; index < RING_COUNT; index += 1) {
    const distance = index * spacing;
    const point = sampleAt(distance);
    const ahead = sampleAt(distance + 1);
    const behind = sampleAt(distance - 1);
    let nx = ahead.x - behind.x, ny = ahead.y - behind.y, nz = ahead.z - behind.z;
    const norm = Math.hypot(nx, ny, nz) || 1;
    if (!Number.isFinite(norm) || norm <= 0) return null;
    nx /= norm; ny /= norm; nz /= norm;
    if (![point.x, point.y, point.z, nx, ny, nz].every(Number.isFinite)) return null;
    rings.push({ x: point.x, y: point.y, z: point.z, nx, ny, nz, radius: ringRadius });
  }
  return rings;
}

/** 环心附近 (半径内) 障碍顶高度；无障碍返回 null。 */
function obstacleTopNear(world: FlightWorld, x: number, z: number, radius: number): number | null {
  let top: number | null = null;
  for (const box of world.boxesInWindow(x - radius, z - radius, x + radius, z + radius)) {
    if (x > box.minX - radius && x < box.maxX + radius && z > box.minZ - radius && z < box.maxZ + radius) {
      top = top === null ? box.maxY : Math.max(top, box.maxY);
    }
  }
  return top;
}

/**
 * 整条安全走廊验证（§7.1）：环心净空（环半径余量）、环间距（最大速度反应时间）、
 * 转弯半径（r = v/ω，巡航速度下相邻段夹角）、以及环间直线段上按步采样净空。
 */
function validateCorridor(world: FlightWorld, rings: CourseRing[], params: FlightParams, clearance: number): boolean {
  const bounds = world.bounds;
  const minTurnRadius = params.cruiseSpeed / params.turnRate;
  for (let index = 0; index < rings.length; index += 1) {
    const ring = rings[index];
    const prev = rings[(index - 1 + rings.length) % rings.length];
    const next = rings[(index + 1) % rings.length];
    if (!world.isPointClear(ring.x, ring.y, ring.z, ring.radius)) return false;
    if (ring.y < bounds.minY + ring.radius || ring.y > bounds.maxY - ring.radius) return false;
    // 环间距：弦长替代弧长下限。
    const spacing = Math.hypot(next.x - ring.x, next.y - ring.y, next.z - ring.z);
    if (spacing < params.maxSpeed * REACTION_SECONDS_AT_MAX) return false;
    // 转弯约束：两段夹角的补角在单步可行范围内（转弯半径 vs 环间距）。
    const inX = ring.x - prev.x, inY = ring.y - prev.y, inZ = ring.z - prev.z;
    const outX = next.x - ring.x, outY = next.y - ring.y, outZ = next.z - ring.z;
    const inNorm = Math.hypot(inX, inY, inZ) || 1;
    const outNorm = Math.hypot(outX, outY, outZ) || 1;
    const dot = (inX * outX + inY * outY + inZ * outZ) / (inNorm * outNorm);
    const turnAngle = Math.PI - Math.acos(Math.max(-1, Math.min(1, dot))); // 转向角
    const reachable = Math.min(inNorm, outNorm) >= turnAngle * minTurnRadius * 0.5;
    if (!reachable) return false;
    // 环间直线段采样净空（步距 = 环半径）。
    const steps = Math.max(2, Math.ceil(spacing / Math.max(4, ring.radius)));
    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      const x = ring.x + (next.x - ring.x) * t;
      const y = ring.y + (next.y - ring.y) * t;
      const z = ring.z + (next.z - ring.z) * t;
      if (!world.isPointClear(x, y, z, clearance * 0.8)) return false;
    }
  }
  return true;
}
