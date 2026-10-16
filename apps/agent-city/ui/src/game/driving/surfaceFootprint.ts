/** Whole-vehicle surface coverage and continuous motion validation over SurfaceRegions.
 * Pure CPU; no THREE, DOM, host, renderer or persistence.
 *
 * 为什么不是「四轮 + 四角都在路上」：车体可以骑在孔洞、窄岛或片段缝上，而八个点都落在路面里。
 * 这里用的判据是：车体（含侧向余量）投影与所在区域的边界线段**无交**且中心可行驶——区域是连通
 * 闭集时这等价于整个车体都在可行驶面上（边界由 surfaceRegions 的同一个分类器逐段确定）。
 * 连续运动不只测末态：按角度/距离细分，每小段取两端膨胀矩形的凸包（膨胀量覆盖旋转弦高与
 * 圆弧轨迹弦高），凸包也不得碰边界——否则高速一步可以「跳」过一条窄岛或路缘角。
 *
 * 不包含：固体障碍（建筑/护栏/桥墩，CollisionIndex）、portal 跨层、TOI/滑动（Agent C）。
 * 结果失败即关闭；本模块不会把任何道路标为已通行。 */
import type { SurfacePointState, SurfaceRegionsBuild, RegionBoundarySegment } from "../../engine/surface/surfaceRegions";
import { DRIVING_FOOTPRINT } from "./vehicleFootprint";

export const SURFACE_FOOTPRINT_RULES_VERSION = 1;

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

export type GroundPose = Readonly<{ x: number; z: number; heading: number }>;
export type FootprintFailure = Readonly<{
  ok: false;
  reason: "no-surface" | "ambiguous-layer" | "unsupported-footprint" | "closed-portal" | "excessive-step" | "excessive-slope" | "query-budget" | "invalid-input";
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
  let t0 = 0; let t1 = 1;
  const dx = s.bx - s.ax; const dz = s.bz - s.az;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]; const b = polygon[(i + 1) % polygon.length];
    // Inside half-plane for CCW: cross(b - a, p - a) >= 0.
    const ex = b.x - a.x; const ez = b.z - a.z;
    const num = ex * (s.az - a.z) - ez * (s.ax - a.x);
    const den = ex * dz - ez * dx;
    const slack = 1e-12 * (Math.abs(ex) + Math.abs(ez)) * (1 + Math.abs(s.ax) + Math.abs(s.az));
    if (Math.abs(den) < 1e-15) { if (num < -slack) return false; continue; }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

function boundaryHit(regions: Ready, regionId: string, polygon: P[], maxSegments: number): FootprintFailure | null {
  const xs = polygon.map((p) => p.x); const zs = polygon.map((p) => p.z);
  const box = regions.segmentsInBox(regionId, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), maxSegments);
  if (box.status !== "ok") return box.status === "budget" ? failure("query-budget", "boundary-segments") : failure("invalid-input", "boundary-box");
  for (const segment of box.segments) {
    if (segmentTouchesConvex(segment, polygon)) return failure("unsupported-footprint", `${segment.label}:${segment.cause}`, segment);
  }
  return null;
}
const centerFailure = (state: Extract<SurfacePointState, { status: "blocked" }>): FootprintFailure =>
  state.cause === "ambiguous-region" || state.cause === "height-conflict" ? failure("ambiguous-layer", state.cause)
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
  footprint: VehicleFootprint = DRIVING_FOOTPRINT, params: FootprintParams = DEFAULT_FOOTPRINT_PARAMS): FootprintSupport | FootprintFailure {
  if (regions.status !== "ready") return failure("invalid-input", "regions-unresolved");
  if (![pose.x, pose.z, pose.heading].every(Number.isFinite) || !validParams(footprint, params)) return failure("invalid-input", "pose-or-params");
  const region = regions.regionById(regionId);
  if (!region) return failure("invalid-input", "unknown-region");
  const center = regions.classify(pose.x, pose.z, region.layerId);
  if (center.status === "blocked") return centerFailure(center);
  // Another region at this XZ on the same layer is not a portal: never switch implicitly.
  if (center.regionId !== regionId) return failure("closed-portal", "region-change");
  const body = rectangle(pose, footprint.halfLength + params.longitudinalMargin, footprint.halfWidth + params.lateralMargin);
  const hit = boundaryHit(regions, regionId, body, params.maxSegmentsPerQuery);
  if (hit) return hit;
  const contacts = rectangle(pose, footprint.wheelbase / 2, footprint.track / 2);
  // rectangle(): [rear-right, front-right, front-left, rear-left] → fl, fr, rl, rr.
  const order = [contacts[2], contacts[1], contacts[3], contacts[0]];
  const heights: number[] = [];
  for (const p of order) {
    const state = regions.classify(p.x, p.z, region.layerId);
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
  return Object.freeze({ ok: true, regionId, layerId: region.layerId, y: (fl + fr + rl + rr) / 4, pitch, roll,
    wheels: Object.freeze([fl, fr, rl, rr]) as readonly [number, number, number, number], normal: center.normal });
}

/** Continuous validation of one motion primitive from → to (linear in x, z, heading, or the
 * kernel's circular arc between them). Every sub-step's swept hull must stay inside the region. */
export function validateMotion(regions: SurfaceRegionsBuild, from: GroundPose, to: GroundPose, regionId: string,
  footprint: VehicleFootprint = DRIVING_FOOTPRINT, params: FootprintParams = DEFAULT_FOOTPRINT_PARAMS): MotionValidation {
  const fail = (f: FootprintFailure, fraction: number): MotionValidation => Object.freeze({ ...f, lastValidFraction: fraction });
  if (![from.x, from.z, from.heading, to.x, to.z, to.heading].every(Number.isFinite)) return fail(failure("invalid-input", "pose"), 0);
  const turn = to.heading - from.heading;
  if (Math.abs(turn) > Math.PI) return fail(failure("invalid-input", "turn-exceeds-pi"), 0);
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const n = Math.max(1, Math.ceil(Math.abs(turn) / params.maxAngleStep), Math.ceil(distance / params.maxSampleDistance));
  if (!Number.isSafeInteger(n) || n > params.maxSamples) return fail(failure("query-budget", "motion-samples"), 0);
  let previous = footprintSupport(regions, from, regionId, footprint, params);
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
    const hit = boundaryHit(regions, regionId, hull, params.maxSegmentsPerQuery);
    if (hit) return fail(hit, t0);
    const next = footprintSupport(regions, at(t1), regionId, footprint, params);
    if (!next.ok) return fail(next, t0);
    if (Math.abs(next.y - previous.y) > params.maxStepPerSample) return fail(failure("excessive-step", "center-height-jump"), t0);
    previous = next;
  }
  return Object.freeze({ ok: true, support: previous, samples: n });
}
