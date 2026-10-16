/** Surface-region adapters for the existing kernel contracts.
 *
 * SurfaceDrivingEnvironment: DrivingEnvironment.move() 用 validateMotion 判整步，通不过就整步拒绝
 * （与原型 DrivingWorld 相同语义；TOI/切线滑动是 Agent C 的 DrivingCollision）。
 * SurfaceWorldValidator: AuditWorldValidator 的独立复核——不信 kernel 报告的 y/surfaceId/blocked，
 * 而是对实际位姿变化重新做整车覆盖与连续运动检查。两者共享 surface 事实（spec §11.1 允许），
 * 所以路面编译本身的错误要靠 A 批次的渲染几何对照兜底，不能靠这两个互相印证。
 *
 * 区域 id 即 surfaceId；已验证的跨层 portal 把两层并入同一区域，所以过匝道/桥头不换 surfaceId，
 * 换层由高度连续性决定（validateMotion 按上一位姿的 y 选层）。区域切换仍一律视为非法层跳。
 * 固体障碍（CollisionIndex）作为可选参数接入：两者都通过才算合法。 */
import type { SurfaceRegionsBuild } from "../../engine/surface/surfaceRegions";
import type { DrivingEnvironment, DrivingMotion, DrivingMoveResult, DrivingState } from "../DrivingSimulation";
import type { KernelStep } from "./DrivingKernel";
import type { AuditWorldValidator, StepValidation } from "./audit/contracts";
import { DEFAULT_FOOTPRINT_PARAMS, footprintSupport, validateMotion, type FootprintParams, type VehicleFootprint } from "./surfaceFootprint";
import { DRIVING_FOOTPRINT } from "./vehicleFootprint";
import type { CollisionIndex } from "./CollisionIndex";

/** Height agreement between a reported state and the independently fitted support. */
export const SUPPORT_HEIGHT_TOLERANCE = 1e-6;

export class SurfaceDrivingEnvironment implements DrivingEnvironment {
  constructor(private readonly regions: SurfaceRegionsBuild,
    private readonly footprint: VehicleFootprint = DRIVING_FOOTPRINT,
    private readonly params: FootprintParams = DEFAULT_FOOTPRINT_PARAMS,
    /** Static solids (buildings, rails, piers, deck slabs); omitted = support surface only. */
    private readonly collision?: CollisionIndex) {
    if (regions.status !== "ready") throw new Error("surface-regions-unresolved");
  }
  move(previous: DrivingState, desired: DrivingMotion): DrivingMoveResult {
    const result = validateMotion(this.regions, previous, desired, previous.surfaceId, this.footprint, this.params, this.collision);
    if (!result.ok) {
      return { x: previous.x, y: previous.y, z: previous.z, heading: previous.heading, pitch: previous.pitch, roll: previous.roll,
        surfaceId: previous.surfaceId, blocked: true, reason: `${result.reason}:${result.detail}` };
    }
    const s = result.support;
    return { x: desired.x, z: desired.z, heading: desired.heading, y: s.y, pitch: s.pitch, roll: s.roll, surfaceId: s.regionId, blocked: false };
  }
  /** Spawn/reset entry: a pose is legal only with an explicit region id; no "nearest surface".
   * `y` picks the surface where a multi-layer region stacks (under/over a ramp). */
  place(x: number, z: number, heading: number, regionId: string, y?: number): Readonly<{ y: number; pitch: number; roll: number }> | null {
    const support = footprintSupport(this.regions, { x, z, heading, y }, regionId, this.footprint, this.params, this.collision);
    return support.ok ? Object.freeze({ y: support.y, pitch: support.pitch, roll: support.roll }) : null;
  }
}

export class SurfaceWorldValidator implements AuditWorldValidator {
  constructor(private readonly regions: SurfaceRegionsBuild,
    /** Corridor progress is case-specific (planner/corridor); never wheel distance. */
    private readonly corridorProgress: (state: Readonly<DrivingState>) => number,
    private readonly footprint: VehicleFootprint = DRIVING_FOOTPRINT,
    private readonly params: FootprintParams = DEFAULT_FOOTPRINT_PARAMS,
    /** Static solids (buildings, rails, piers, deck slabs); omitted = support surface only. */
    private readonly collision?: CollisionIndex) {
    if (regions.status !== "ready") throw new Error("surface-regions-unresolved");
  }
  validateStart(state: Readonly<DrivingState>): StepValidation {
    const support = footprintSupport(this.regions, state, state.surfaceId, this.footprint, this.params, this.collision);
    if (!support.ok) return "route-deviation";
    return Math.abs(support.y - state.y) <= SUPPORT_HEIGHT_TOLERANCE ? "valid" : "simulation-invalid";
  }
  validate(previous: Readonly<DrivingState>, next: KernelStep): StepValidation {
    const state = next.state;
    // Portals keep the region id; any surface change is an illegal layer jump, not a deviation.
    if (state.surfaceId !== previous.surfaceId) return "simulation-invalid";
    const moved = state.x !== previous.x || state.z !== previous.z || state.heading !== previous.heading;
    if (next.motion.blocked && moved) return "simulation-invalid";
    const result = validateMotion(this.regions, previous, state, previous.surfaceId, this.footprint, this.params, this.collision);
    // The kernel accepted a motion the independent check rejects: penetration through a curb,
    // island or gap is a simulation defect, never a pass and never "road blocked".
    if (!result.ok) return "simulation-invalid";
    return Math.abs(result.support.y - state.y) <= SUPPORT_HEIGHT_TOLERANCE ? "valid" : "simulation-invalid";
  }
  progress(state: Readonly<DrivingState>): number { return this.corridorProgress(state); }
}

/** Arc-length progress of the closest point on a polyline (stable tie: first segment). */
export function polylineProgress(points: readonly Readonly<{ x: number; z: number }>[]): (state: Readonly<{ x: number; z: number }>) => number {
  if (points.length < 2 || points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z))) throw new Error("invalid-progress-polyline");
  const frozen = points.map((p) => ({ x: p.x, z: p.z }));
  return (state) => {
    let best = Infinity; let progress = NaN; let along = 0;
    for (let i = 1; i < frozen.length; i++) {
      const a = frozen[i - 1]; const b = frozen[i];
      const dx = b.x - a.x; const dz = b.z - a.z; const ll = dx * dx + dz * dz; const len = Math.sqrt(ll);
      const t = ll === 0 ? 0 : Math.max(0, Math.min(1, ((state.x - a.x) * dx + (state.z - a.z) * dz) / ll));
      const d = Math.hypot(state.x - (a.x + dx * t), state.z - (a.z + dz * t));
      if (d < best) { best = d; progress = along + len * t; }
      along += len;
    }
    return progress;
  };
}
