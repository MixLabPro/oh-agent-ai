/** Whole-vehicle surface coverage and continuous motion validation over SurfaceRegions.
 * Pure CPU; no THREE, DOM, host, renderer or persistence.
 *
 * 为什么不是「四轮 + 四角都在路上」：车体可以骑在孔洞、窄岛或片段缝上，而八个点都落在路面里。
 * 这里用的判据是：车体（含侧向余量）投影与所在区域的边界线段**无交**且中心可行驶——区域是连通
 * 闭集时这等价于整个车体都在可行驶面上（边界由 surfaceRegions 的同一个分类器逐段确定）。
 * 连续运动不只测末态：按角度/距离细分，每小段取两端膨胀矩形的凸包（膨胀量覆盖旋转弦高与
 * 圆弧轨迹弦高），凸包也不得碰边界——否则高速一步可以「跳」过一条窄岛或路缘角。
 *
 * 跨层（v2）：区域可以经已验证的 portal 跨层。车所在的层按高度选（上一位姿的 y，最近者），
 * 车轮按中心支撑平面外推的高度选层；边界线段只在「车此处就在它那层」时才算——同区域另一层更贴近
 * 车底平面，说明线段在车下方或头顶（高架下的地面路缘、桥面下的扇面边），交给碰撞层判净空。
 * 单层区域的判定与 v1 逐字相同。
 *
 * 不包含：固体障碍（建筑/护栏/桥墩，CollisionIndex 由调用方另行检查）、TOI/滑动（Agent C）。
 * 结果失败即关闭；本模块不会把任何道路标为已通行。 */
import type { SurfacePointState, SurfaceRegionsBuild, RegionBoundarySegment } from "../../engine/surface/surfaceRegions";
import { DRIVING_FOOTPRINT, GAMEPLAY_DRIVING_FOOTPRINT } from "./vehicleFootprint";
import { carBody, type CollisionIndex } from "./CollisionIndex";

export const SURFACE_FOOTPRINT_RULES_VERSION = 2;
/** A boundary farther than this from the car's support plane is never the car's boundary
 * (fast reject before the per-layer check; ≥ 10× the seam tolerance). */
export const BOUNDARY_VERTICAL_REACH = 1.5;

export type VehicleFootprint = Readonly<{ halfLength: number; halfWidth: number; wheelbase: number; track: number }>;
export type FootprintParams = Readonly<{
  /** Product SPEC §13.1: at least 0.2 world units clear on each side of the vehicle. */
  lateralMargin: number;
  longitudinalMargin: number;
  /** Max fitted pitch/roll and center-normal tilt, radians. */
  maxSlope: number;
  /** Max wheel-plane twist |(fl-fr)-(rl-rr)|/2; larger means a wheel hangs off a step. */
  maxWheelResidual: number;
  /** Max center support height change between consecutive motion samples. */
  maxStepPerSample: number;
  maxAngleStep: number;
  maxSampleDistance: number;
  maxSamples: number;
  maxSegmentsPerQuery: number;
}>;
/** Locked V1 values (spec §13). maxSlope 0.3 rad ≈ 17°：十五城车行三角面坡度 p99 1.4°–31°，
 *  更陡的多是桥头截断处贴地带子，按 excessive-slope 关闭并上报，不放宽到 50° 的极值。 */
export const DEFAULT_FOOTPRINT_PARAMS: FootprintParams = Object.freeze({
  lateralMargin: 0.2,
  longitudinalMargin: 0.1,
  maxSlope: 0.3,
  maxWheelResidual: 0.06,
  maxStepPerSample: 0.18,
  maxAngleStep: 0.05,
  maxSampleDistance: 0.25,
  maxSamples: 512,
  maxSegmentsPerQuery: 4096,
});
/** Manual gameplay tolerances are deliberately separate from the audited V1
 * contract: approximate body width, 5 cm curb buffer, while grade and step
 * safety remain unchanged. */
export const GAMEPLAY_FOOTPRINT_PARAMS: FootprintParams = Object.freeze({
  ...DEFAULT_FOOTPRINT_PARAMS,
  lateralMargin: 0.05,
  longitudinalMargin: 0.05,
});
export { GAMEPLAY_DRIVING_FOOTPRINT };

/** `y` (optional): the support height the car comes from — picks the layer in multi-layer regions. */
export type GroundPose = Readonly<{ x: number; z: number; heading: number; y?: number }>;
export type FootprintFailure = Readonly<{
  ok: false;
  reason: "no-surface" | "ambiguous-layer" | "unsupported-footprint" | "closed-portal" | "excessive-step" | "excessive-slope" | "collision" | "query-budget" | "invalid-input";
  /** What blocked: point classifier cause or the boundary segment label. */
  detail: string;
  witness: RegionBoundarySegment | null;
}>;
export type FootprintSupport = Readonly<{
  ok: true; regionId: string; layerId: string;
  /** Plane-fit height at the vehicle center (mean of four wheel contacts). */
  y: number; pitch: number; roll: number;
  wheels: readonly [number, number, number, number]; // front-left, front-right, rear-left, rear-right
  normal: Readonly<{ x: number; y: number; z: number }>;
}>;
export type MotionValidation =
  | Readonly<{ ok: true; support: FootprintSupport; samples: number }>
  | (FootprintFailure & Readonly<{ lastValidFraction: number }>);

type Ready = Extract<SurfaceRegionsBuild, { status: "ready" }>;
type P = { x: number; z: number };
const failure = (reason: FootprintFailure["reason"], detail: string, witness: RegionBoundarySegment | null = null): FootprintFailure =>
  Object.freeze({ ok: false, reason, detail, witness });

function rectangle(pose: GroundPose, halfLength: number, halfWidth: number): P[] {
  const fx = Math.cos(pose.heading); const fz = Math.sin(pose.heading);
  const rx = -fz; const rz = fx;
  // Counter-clockwise in (x, z) for positive area: rear-right → front-right → front-left → rear-left.
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([l, w]) => ({
    x: pose.x + fx * halfLength * l + rx * halfWidth * w, z: pose.z + fz * halfLength * l + rz * halfWidth * w }));
}
/** Andrew monotone chain; returns counter-clockwise hull (positive cross). */
function convexHull(points: P[]): P[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (o: P, a: P, b: P) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower: P[] = []; for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper: P[] = []; for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
/** Cyrus–Beck clip of a segment against a closed convex CCW polygon. Touching counts. */
export function segmentTouchesConvex(s: Readonly<{ ax: number; az: number; bx: number; bz: number }>, polygon: readonly P[]): boolean {
  return clipConvex(s, polygon) !== null;
}
/** The [t0, t1] part of the segment inside the polygon, or null. */
function clipConvex(s: Readonly<{ ax: number; az: number; bx: number; bz: number }>, polygon: readonly P[]): [number, number] | null {
  let t0 = 0; let t1 = 1;
  const dx = s.bx - s.ax; const dz = s.bz - s.az;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]; const b = polygon[(i + 1) % polygon.length];
    // Inside half-plane for CCW: cross(b - a, p - a) >= 0.
    const ex = b.x - a.x; const ez = b.z - a.z;
    const num = ex * (s.az - a.z) - ez * (s.ax - a.x);
    const den = ex * dz - ez * dx;
    const slack = 1e-12 * (Math.abs(ex) + Math.abs(ez)) * (1 + Math.abs(s.ax) + Math.abs(s.az));
    if (Math.abs(den) < 1e-15) { if (num < -slack) return null; continue; }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

/** The car's support plane: height at (x, z) through the support point with its normal. */
type Plane = Readonly<{ x: number; y: number; z: number; normal: Readonly<{ x: number; y: number; z: number }> }>;
const planeAt = (plane: Plane, x: number, z: number) => plane.y - (plane.normal.x * (x - plane.x) + plane.normal.z * (z - plane.z)) / plane.normal.y;

/** Is the car on this segment's layer where the segment crosses it? Single-layer regions: always. */
function concernsCar(regions: Ready, layerIds: readonly string[], segment: RegionBoundarySegment, t0: number, t1: number, plane: Plane): boolean {
  for (const t of [t0, (t0 + t1) / 2, t1]) {
    const x = segment.ax + (segment.bx - segment.ax) * t; const z = segment.az + (segment.bz - segment.az) * t;
    const h = planeAt(plane, x, z); const own = Math.abs(segment.ya + (segment.yb - segment.ya) * t - h);
    if (own > BOUNDARY_VERTICAL_REACH) continue;
    const nearer = layerIds.some((layerId) => {
      if (layerId === segment.layerId) return false;
      const there = regions.classify(x, z, layerId);
      return there.status === "drivable" && there.regionId === segment.regionId && Math.abs(there.y - h) < own;
    });
    if (!nearer) return true;
  }
  return false;
}

function boundaryHit(regions: Ready, regionId: string, polygon: P[], maxSegments: number, plane: Plane): FootprintFailure | null {
  const layerIds = regions.regionById(regionId)?.layerIds ?? [];
  const xs = polygon.map((p) => p.x); const zs = polygon.map((p) => p.z);
  const box = regions.segmentsInBox(regionId, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), maxSegments);
  if (box.status !== "ok") return box.status === "budget" ? failure("query-budget", "boundary-segments") : failure("invalid-input", "boundary-box");
  for (const segment of box.segments) {
    const clip = clipConvex(segment, polygon);
    if (!clip) continue;
    if (layerIds.length > 1 && !concernsCar(regions, layerIds, segment, clip[0], clip[1], plane)) continue;
    return failure("unsupported-footprint", `${segment.label}:${segment.cause}`, segment);
  }
  return null;
}
const centerFailure = (state: Extract<SurfacePointState, { status: "blocked" }>): FootprintFailure =>
  state.cause === "ambiguous-region" || state.cause === "height-conflict" || state.cause === "ambiguous-layer" ? failure("ambiguous-layer", state.cause)
    : state.cause === "budget" ? failure("query-budget", state.cause)
      : state.cause === "invalid-input" ? failure("invalid-input", state.cause) : failure("no-surface", state.cause);

function validParams(f: VehicleFootprint, p: FootprintParams): boolean {
  return [f.halfLength, f.halfWidth, f.wheelbase, f.track, p.maxSlope, p.maxWheelResidual, p.maxStepPerSample, p.maxAngleStep, p.maxSampleDistance].every((n) => Number.isFinite(n) && n > 0) &&
    [p.lateralMargin, p.longitudinalMargin].every((n) => Number.isFinite(n) && n >= 0) &&
    Number.isSafeInteger(p.maxSamples) && p.maxSamples > 0 && Number.isSafeInteger(p.maxSegmentsPerQuery) && p.maxSegmentsPerQuery > 0 &&
    f.wheelbase / 2 <= f.halfLength && f.track / 2 <= f.halfWidth;
}

/** Static full-body support: center drivable in the named region, no region boundary inside
 * the margin-inflated body, four wheel contacts on the same region, slope/twist within limits. */
export function footprintSupport(regions: SurfaceRegionsBuild, pose: GroundPose, regionId: string,
  footprint: VehicleFootprint = DRIVING_FOOTPRINT, params: FootprintParams = DEFAULT_FOOTPRINT_PARAMS, collision?: CollisionIndex): FootprintSupport | FootprintFailure {
  if (regions.status !== "ready") return failure("invalid-input", "regions-unresolved");
  if (![pose.x, pose.z, pose.heading].every(Number.isFinite) || !validParams(footprint, params)) return failure("invalid-input", "pose-or-params");
  const region = regions.regionById(regionId);
  if (!region) return failure("invalid-input", "unknown-region");
  if (pose.y !== undefined && !Number.isFinite(pose.y)) return failure("invalid-input", "pose-or-params");
  const center = regions.supportAt(pose.x, pose.z, regionId, pose.y);
  if (center.status === "blocked") return centerFailure(center);
  // Another region at this XZ is not a portal: never switch implicitly (portals join regions).
  if (center.regionId !== regionId) return failure("closed-portal", "region-change");
  const plane: Plane = { x: pose.x, y: center.y, z: pose.z, normal: center.normal };
  const body = rectangle(pose, footprint.halfLength + params.longitudinalMargin, footprint.halfWidth + params.lateralMargin);
  const hit = boundaryHit(regions, regionId, body, params.maxSegmentsPerQuery, plane);
  if (hit) return hit;
  const contacts = rectangle(pose, footprint.wheelbase / 2, footprint.track / 2);
  // rectangle(): [rear-right, front-right, front-left, rear-left] → fl, fr, rl, rr.
  const order = [contacts[2], contacts[1], contacts[3], contacts[0]];
  const heights: number[] = [];
  for (const p of order) {
    const state = regions.supportAt(p.x, p.z, regionId, planeAt(plane, p.x, p.z));
    // Covered by construction when no boundary crosses the body; a failure here is a rule defect.
    if (state.status !== "drivable" || state.regionId !== regionId) return failure("unsupported-footprint", state.status === "blocked" ? `wheel:${state.cause}` : "wheel:region-change");
    heights.push(state.y);
  }
  const [fl, fr, rl, rr] = heights;
  const residual = Math.abs((fl - fr) - (rl - rr)) / 2;
  if (residual > params.maxWheelResidual) return failure("excessive-step", "wheel-twist");
  const pitch = Math.atan2((fl + fr) / 2 - (rl + rr) / 2, footprint.wheelbase);
  const roll = Math.atan2((fl + rl) / 2 - (fr + rr) / 2, footprint.track);
  const tilt = Math.acos(Math.min(1, Math.abs(center.normal.y)));
  if (Math.abs(pitch) > params.maxSlope || Math.abs(roll) > params.maxSlope || tilt > params.maxSlope) return failure("excessive-slope", "support-plane");
  const y = (fl + fr + rl + rr) / 4;
  if (collision) {
    const blocked = solidHit(collision, carBody(pose, { y, pitch, roll }, footprint.halfLength + params.longitudinalMargin, footprint.halfWidth + params.lateralMargin));
    if (blocked) return blocked;
  }
  return Object.freeze({ ok: true, regionId, layerId: center.layerId, y, pitch, roll,
    wheels: Object.freeze([fl, fr, rl, rr]) as readonly [number, number, number, number], normal: center.normal });
}

function solidHit(collision: CollisionIndex, body: ReturnType<typeof carBody>): FootprintFailure | null {
  const hit = collision.hit(body);
  if (hit.status === "clear") return null;
  if (hit.status === "hit") return failure("collision", `${hit.solid.role}:${hit.solid.id}`);
  return hit.status === "budget" ? failure("query-budget", "collision") : failure("invalid-input", "collision-body");
}

/** Continuous validation of one motion primitive from → to (linear in x, z, heading, or the
 * kernel's circular arc between them). Every sub-step's swept hull must stay inside the region. */
export function validateMotion(regions: SurfaceRegionsBuild, from: GroundPose, to: GroundPose, regionId: string,
  footprint: VehicleFootprint = DRIVING_FOOTPRINT, params: FootprintParams = DEFAULT_FOOTPRINT_PARAMS, collision?: CollisionIndex): MotionValidation {
  const fail = (f: FootprintFailure, fraction: number): MotionValidation => Object.freeze({ ...f, lastValidFraction: fraction });
  if (![from.x, from.z, from.heading, to.x, to.z, to.heading].every(Number.isFinite)) return fail(failure("invalid-input", "pose"), 0);
  const turn = to.heading - from.heading;
  if (Math.abs(turn) > Math.PI) return fail(failure("invalid-input", "turn-exceeds-pi"), 0);
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const n = Math.max(1, Math.ceil(Math.abs(turn) / params.maxAngleStep), Math.ceil(distance / params.maxSampleDistance));
  if (!Number.isSafeInteger(n) || n > params.maxSamples) return fail(failure("query-budget", "motion-samples"), 0);
  let previous = footprintSupport(regions, from, regionId, footprint, params, collision);
  if (!previous.ok) return fail(previous, 0);
  if (regions.status !== "ready") return fail(failure("invalid-input", "regions-unresolved"), 0);
  const dTheta = Math.abs(turn) / n; const chord = distance / n;
  const halfL = footprint.halfLength + params.longitudinalMargin; const halfW = footprint.halfWidth + params.lateralMargin;
  const reach = Math.hypot(halfL, halfW);
  // Rotation: an arc of radius `reach` deviates from its chord by reach·(1−cos(Δθ/2)).
  // Center path: the kernel's chord may be an arc with the same Δθ; radius chord/(2·sin(Δθ/2)).
  const sag = 1 - Math.cos(dTheta / 2);
  const inflate = reach * sag + (dTheta > 1e-12 ? chord / (2 * Math.sin(dTheta / 2)) * sag : 0);
  for (let i = 1; i <= n; i++) {
    const t0 = (i - 1) / n; const t1 = i / n;
    const at = (t: number): GroundPose => ({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t, heading: from.heading + turn * t });
    const hull = convexHull([...rectangle(at(t0), halfL + inflate, halfW + inflate), ...rectangle(at(t1), halfL + inflate, halfW + inflate)]);
    const hit = boundaryHit(regions, regionId, hull, params.maxSegmentsPerQuery, { x: at(t0).x, y: previous.y, z: at(t0).z, normal: previous.normal });
    if (hit) return fail(hit, t0);
    const next = footprintSupport(regions, { ...at(t1), y: previous.y }, regionId, footprint, params, collision);
    if (!next.ok) return fail(next, t0);
    if (Math.abs(next.y - previous.y) > params.maxStepPerSample) return fail(failure("excessive-step", "center-height-jump"), t0);
    if (collision) {
      // Swept body: the mid-sample box grown by half the chord, the rotation sag and the arc
      // inflation, and stretched vertically by half the height change — covers both end poses.
      const mid = at((t0 + t1) / 2);
      const grow = chord / 2 + reach * Math.sin(dTheta / 2) + inflate;
      const support = { y: (previous.y + next.y) / 2, pitch: (previous.pitch + next.pitch) / 2, roll: (previous.roll + next.roll) / 2 };
      const lift = Math.abs(next.y - previous.y) / 2 + reach * (Math.abs(next.pitch - previous.pitch) + Math.abs(next.roll - previous.roll)) / 2;
      const blocked = solidHit(collision, carBody(mid, support, halfL, halfW, undefined, grow, lift));
      if (blocked) return fail(blocked, t0);
    }
    previous = next;
  }
  return Object.freeze({ ok: true, support: previous, samples: n });
}
