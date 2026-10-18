/** VTOL 世界适配：地面段直接委托 ContinuousDrivingEnvironment（gameplay 可越/边界滑动
 * 全部继承）；新增垂直离地（lift）与空中移动（moveAir）两条查询。
 * 空中碰撞语义与地面刻意不同：mountablePolicy "disabled"（严格）——空中车不「爬」任何
 * 实体，桥面板侧缘/岛顶在空中都是真实阻挡；悬停地板（无支撑落点不坠落，冷气悬停）
 * 与天花板（最高实体 + 余量）由这里执行；落点支撑有效时用 gameplay 足迹校验落地
 * （可落在路面/桥面/岛顶——与地面体制同一套可越融合规则）。
 */
import type { SurfaceRegionsBuild } from "../../engine/surface/surfaceRegions";
import type { DrivingMotion, DrivingMoveResult, DrivingState } from "../DrivingSimulation";
import { DEFAULT_FOOTPRINT_PARAMS, footprintSupport, mountableQueryOf, type FootprintParams, type MountableQuery, type VehicleFootprint } from "./surfaceFootprint";
import { DRIVING_FOOTPRINT } from "./vehicleFootprint";
import { resolveDrivingCollision, type SupportedPose } from "./DrivingCollisionSolver";
import { DEFAULT_SWEEP_LIMITS, sweepBody, type BodyPose, type SweepLimits } from "./DrivingCollision";
import type { CollisionDimensions, Solid } from "./CollisionIndex";
import { ContinuousDrivingEnvironment, type ContinuousMotionParams, type ContinuousWorldBinding } from "./ContinuousDrivingEnvironment";
import type { VtolAirMotion, VtolAirResult, VtolLiftResult } from "./vtolDriving";

export type { ContinuousWorldBinding, ContinuousMotionParams };
export type VtolEnvironmentPolicy = Readonly<{ boundarySlide?: boolean; mountablePolicy?: "disabled" | "gameplay" }>;

const CEILING_MARGIN = 40;
const CEILING_FALLBACK = 120;
const WATER_LEVEL = 0.2;

export class VtolDrivingEnvironment {
  private readonly inner: ContinuousDrivingEnvironment;
  private readonly regions: SurfaceRegionsBuild;
  private readonly binding: ContinuousWorldBinding;
  private readonly footprint: VehicleFootprint;
  private readonly params: FootprintParams;
  private readonly motionParams: ContinuousMotionParams;
  private readonly gameplay: VtolEnvironmentPolicy;
  private readonly mountable: MountableQuery | null;
  private readonly ceiling: number;

  constructor(regions: SurfaceRegionsBuild, binding: ContinuousWorldBinding,
    footprint: VehicleFootprint = DRIVING_FOOTPRINT, params: FootprintParams = DEFAULT_FOOTPRINT_PARAMS,
    motionParams: ContinuousMotionParams = {}, gameplay: VtolEnvironmentPolicy = {}) {
    this.inner = new ContinuousDrivingEnvironment(regions, binding, footprint, params, motionParams,
      { boundarySlide: gameplay.boundarySlide ?? false, mountablePolicy: gameplay.mountablePolicy ?? "disabled" });
    this.regions = regions; this.binding = binding; this.footprint = footprint;
    this.params = params; this.motionParams = motionParams; this.gameplay = gameplay;
    this.mountable = (gameplay.mountablePolicy ?? "disabled") === "gameplay" ? mountableQueryOf(binding.solids) : null;
    const top = binding.solids.reduce((max, solid) => Math.max(max, solid.maxY), 0);
    this.ceiling = Math.max(CEILING_FALLBACK, top + CEILING_MARGIN);
  }

  /** 地面水平段：与连续环境完全一致（含支撑/可越/边界滑动语义）。 */
  move(previous: DrivingState, desired: DrivingMotion): DrivingMoveResult { return this.inner.move(previous, desired); }
  /** 出生/复位校验与连续环境同源（VTOL 车在地面上按完全相同的规则放置）。 */
  place(x: number, z: number, heading: number, regionId: string, y?: number) { return this.inner.place(x, z, heading, regionId, y); }

  /** 垂直离地：上方实体（如桥面板底面）与天花板裁剪目标高度。 */
  lift(previous: DrivingState, targetY: number): VtolLiftResult {
    if (!this.current()) return { y: previous.y, trimmed: true };
    const h = this.binding.centerHeight;
    const base: BodyPose = { x: previous.x, y: previous.y + h, z: previous.z, heading: previous.heading, pitch: 0, roll: 0 };
    const swept = sweepBody(this.binding.solids, base, { ...base, y: targetY + h }, this.binding.dimensions,
      { ...DEFAULT_SWEEP_LIMITS, ...this.motionParams, mountablePolicy: "disabled" });
    if (swept.status === "clear") return { y: Math.min(targetY, this.ceiling), trimmed: targetY > this.ceiling };
    if (swept.status === "contact" && swept.contact) {
      const fraction = Math.max(0, swept.contact.time - 0.02);
      return { y: previous.y + (targetY - previous.y) * fraction, trimmed: true };
    }
    return { y: previous.y, trimmed: true }; // fail-closed：查询未决时不起升
  }

  /** 空中移动：严格 3D 扫掠（滑移复用）→ 落地/悬停地板/天花板后处理。 */
  moveAir(previous: DrivingState, desired: VtolAirMotion): VtolAirResult {
    if (!this.current()) return this.airStopped(previous, "stale-world", false, false);
    const targetY = Math.min(desired.y, this.ceiling);
    const ceilingHit = desired.y > this.ceiling + 1e-9;
    const resolved = resolveDrivingCollision(this.binding.solids,
      { isCurrent: () => this.current(), constrain: this.airConstrain, body: this.airBody },
      this.airPose(previous), { x: desired.x, y: targetY, z: desired.z, heading: desired.heading, pitch: 0, roll: 0, surfaceId: previous.surfaceId },
      this.binding.dimensions, { ...this.motionParams, mountablePolicy: "disabled" });
    if (resolved.status !== "moved") return this.airStopped(previous, `air:${resolved.reason}`, false, false);
    const pose = resolved.path[resolved.path.length - 1];
    // 落地：下降中且终点支撑有效 → gameplay 足迹校验（可越融合与地面一致）。
    const descending = pose.y < previous.y - 1e-9;
    if (descending) {
      const support = this.supportHeight(pose.x, pose.z, previous.surfaceId);
      if (support !== null && pose.y <= support + 0.02) {
        const check = footprintSupport(this.regions, { x: pose.x, z: pose.z, heading: pose.heading }, previous.surfaceId,
          this.footprint, this.params, undefined, this.mountable ?? undefined);
        if (check.ok) return this.airPoseResult(previous,
          { x: pose.x, y: check.y, z: pose.z, heading: pose.heading, pitch: check.pitch, roll: check.roll, surfaceId: check.regionId },
          resolved, "landed", resolved.contacts.length > 0, false, true);
        // 支撑存在但足迹无效（路缘外沿等）：落到支撑高、保持空中（悬停地板语义）。
        return this.airPoseResult(previous, { ...pose, y: support }, resolved, "landing-unsupported", false, true);
      }
    }
    // 悬停地板：无支撑（水面/屋顶上方）且试图沉到海面以下 → 钳在海面。
    const floorSupport = this.supportHeight(pose.x, pose.z, previous.surfaceId);
    if (floorSupport === null && pose.y < WATER_LEVEL) return this.airPoseResult(previous, { ...pose, y: WATER_LEVEL }, resolved, "hover-floor", false, true);
    if (ceilingHit) return this.airPoseResult(previous, pose, resolved, "ceiling", false, true);
    return this.airPoseResult(previous, pose, resolved, resolved.contacts.length ? "contact" : null, resolved.contacts.length > 0, false);
  }

  /** 支撑面高度（中心探测；无支撑返回 null——水面/屋顶/边界外）。 */
  supportHeight(x: number, z: number, regionId: string): number | null {
    if (!this.current()) return null;
    const check = footprintSupport(this.regions, { x, z, heading: 0 }, regionId, this.footprint, this.params, undefined, this.mountable ?? undefined);
    return check.ok ? check.y : null;
  }

  private current(): boolean {
    return this.binding.isCurrent() && this.regions.status === "ready" && this.regions.revision === this.binding.surfaceRevision;
  }
  /** 空中姿态：支撑坐标系（y=高度），碰撞体由 airBody 抬到车身中心；pitch/roll 恒 0（v1 姿态仅视觉）。 */
  private airPose(state: DrivingState): SupportedPose {
    return { x: state.x, y: state.y, z: state.z, heading: state.heading, pitch: 0, roll: 0, surfaceId: state.surfaceId };
  }
  private airBody = (pose: SupportedPose): BodyPose => ({ x: pose.x, y: pose.y + this.binding.centerHeight, z: pose.z, heading: pose.heading, pitch: 0, roll: 0 });
  /** 空中不校验支撑：任何投影都接受（地板/天花板/落地由 moveAir 后处理）。 */
  private airConstrain = (_from: SupportedPose, target: SupportedPose) =>
    ({ ok: true as const, pose: { x: target.x, y: target.y, z: target.z, heading: target.heading, pitch: 0, roll: 0, surfaceId: _from.surfaceId } });
  private airStopped(previous: DrivingState, reason: string, contact: boolean, floor: boolean): VtolAirResult {
    return Object.freeze({ ...previous, blocked: true, reason, travelledDistance: 0, speedFraction: 0,
      queryStatus: reason.startsWith("air:unresolved") ? "unresolved" : "resolved",
      trajectory: Object.freeze([{ ...previous }]), contacts: Object.freeze([]), contact, landed: false, floor });
  }
  private airPoseResult(previous: DrivingState, pose: SupportedPose, resolved: ReturnType<typeof resolveDrivingCollision>,
    reason: string | null, contact: boolean, floor: boolean, landed = false): VtolAirResult {
    // contacts 与连续环境同构（SweepContact → DrivingContact：worldRevision/时间归一）。
    const contacts = Object.freeze(resolved.contacts.map((c) => Object.freeze({
      obstacleId: c.solidId, worldRevision: this.binding.worldRevision,
      time: c.time, timeUpper: c.timeUpper, normal: Object.freeze({ ...c.normal }), kind: c.kind })));
    return Object.freeze({ ...previous, x: pose.x, y: pose.y, z: pose.z, heading: pose.heading, pitch: pose.pitch, roll: pose.roll,
      surfaceId: pose.surfaceId, blocked: false, reason: reason ?? undefined, travelledDistance: resolved.distance,
      speedFraction: resolved.speedFraction, queryStatus: "resolved",
      trajectory: Object.freeze(resolved.path.slice()), contacts, contact, landed, floor });
  }
}
