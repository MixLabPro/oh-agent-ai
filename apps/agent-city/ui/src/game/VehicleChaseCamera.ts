/**
 * VehicleChaseCamera：载具无关的追尾相机核心（从 FlightCamera 提取的通用 80%）。
 * 1-exp(-k·dt) 位置/注视点阻尼 + 速度相关距离/FOV + 遮挡收缩 + 贴地保护 +
 * 环绕/缩放交互 + 首帧 snap。飞机与汽车各自的相机壳提供载具特定的参数和查询。
 */
import * as THREE from "three";

const TWO_PI = Math.PI * 2;
const wrapAngle = (a: number) => a - TWO_PI * Math.round(a / TWO_PI);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 载具呈现给相机的最小状态（不绑定任何特定模拟类型）。 */
export type ChaseTarget = Readonly<{
  x: number; y: number; z: number;
  heading: number;
  speed: number;
  /** 归一化速度比 [0,1]（距离拉远用）：飞机 min→max，汽车 0→max。 */
  speedRatio: number;
  /** 归一化速度比 [0,1]（FOV 速度感用）：飞机 cruise→max。缺省同 speedRatio。 */
  fovSpeedRatio?: number;
  /** 运行时覆盖 config.baseBack（壳按载具参数实时计算距离时使用）。 */
  backOverride?: number;
  /** 运行时覆盖 config.baseHeight。 */
  heightOverride?: number;
  /** 运行时覆盖 config.lookAhead。 */
  lookAheadOverride?: number;
}>;

/** 相机配置：壳在构造时提供全部参数，运行时不再变化。 */
export type ChaseCameraConfig = Readonly<{
  /** 位置阻尼（1/s）；越大越紧。飞机 4.2、汽车 15。 */
  positionDamping: number;
  /** 拖动/缩放期间的位置阻尼（收紧防滞后于手）。 */
  dragPositionDamping: number;
  /** 注视点阻尼。飞机 10、汽车 20。 */
  lookDamping: number;
  /** 机/车后基础距离（绝对世界单位）。 */
  baseBack: number;
  /** 机/车上方基础高度。 */
  baseHeight: number;
  /** 速度满时距离追加比例（back × speedBackBoost 拉远）。 */
  speedBackBoost: number;
  /** 注视点前视距离（沿航向）。 */
  lookAhead: number;
  /** 基础 FOV（度）。 */
  fovBase: number;
  /** 巡航→极速追加 FOV（度）；reduced-motion 时为 0。 */
  fovSpeedSpan: number;
  /** 贴地保护余量（相机 y ≥ 地面高度 + 此值）。 */
  groundMargin: number;
  /** 遮挡查询：返回 false 时按比例拉近。由壳注入（飞行查 FlightWorld、汽车查碰撞索引/地形）。 */
  occlusionQuery?: (x: number, y: number, z: number, margin: number) => boolean;
  /** 地面高度查询（贴地保护用）。 */
  terrainHeight?: (x: number, z: number) => number;
  /** FOV 平滑率（1/s）。 */
  fovDamping?: number;
}>;

/** 环绕状态（拖动查看）。yaw/pitch 是相对于默认追尾位的偏移，zoom 乘距离。 */
export type ChaseOrbitState = { yaw: number; pitch: number; zoom: number };

/** 缩放限制：近裁剪面与模型尺寸共同决定，由壳传入。 */
export const chaseZoomRange = (min: number, max: number) => ({ min, max });

export class VehicleChaseCamera {
  private look = new THREE.Vector3();
  private anchor = new THREE.Vector3();
  private offset = new THREE.Vector3();
  private initialized = false;

  private yawTarget = 0;
  private pitchTarget = 0;
  private zoomTarget = 1;
  private yaw = 0;
  private pitch = 0;
  private zoom = 1;
  private dragging = false;
  private sinceInteraction = Infinity;

  /** 仰角限位：下限防钻地，上限防 lookAt 与 up 平行。 */
  readonly elevationRange: Readonly<{ min: number; max: number }>;
  readonly zoomRange: Readonly<{ min: number; max: number }>;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly config: ChaseCameraConfig,
    private readonly reducedMotion: boolean,
    options: { elevation?: { min: number; max: number }; zoom?: { min: number; max: number } } = {},
  ) {
    this.elevationRange = options.elevation ?? { min: Math.PI / 2 - 1.42, max: 1.45 };
    this.zoomRange = options.zoom ?? { min: 0.55, max: 3.5 };
  }

  get orbit(): ChaseOrbitState {
    return { yaw: this.yaw, pitch: this.pitch, zoom: this.zoom };
  }

  orbitBy(dYaw: number, dPitch: number): void {
    this.yawTarget = wrapAngle(this.yawTarget + dYaw);
    this.pitchTarget = clamp(this.pitchTarget + dPitch, -Math.PI, Math.PI);
    this.sinceInteraction = 0;
  }

  zoomBy(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.zoomTarget = clamp(this.zoomTarget * factor, this.zoomRange.min, this.zoomRange.max);
    this.sinceInteraction = 0;
  }

  setDragging(dragging: boolean): void {
    this.dragging = dragging;
    this.sinceInteraction = 0;
  }

  resetOrbit(includeZoom = true): void {
    this.yawTarget = 0;
    this.pitchTarget = 0;
    if (includeZoom) this.zoomTarget = 1;
    this.sinceInteraction = 0;
  }

  reset(target: ChaseTarget): void {
    this.yawTarget = this.yaw = 0;
    this.pitchTarget = this.pitch = 0;
    this.zoom = this.zoomTarget;
    this.dragging = false;
    this.sinceInteraction = Infinity;
    this.computeOffset(target);
    this.anchor.set(target.x + this.offset.x, target.y + this.offset.y, target.z + this.offset.z);
    this.camera.position.copy(this.anchor);
    const aheadReset = target.lookAheadOverride ?? this.config.lookAhead;
    this.look.set(target.x + Math.cos(target.heading) * aheadReset, target.y, target.z + Math.sin(target.heading) * aheadReset);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
    this.initialized = true;
  }

  private backDistance(target: ChaseTarget): number {
    const base = target.backOverride ?? this.config.baseBack;
    return base * (1 + this.config.speedBackBoost * clamp(target.speedRatio, 0, 1));
  }

  private computeOffset(target: ChaseTarget): void {
    const back = this.backDistance(target);
    const up = target.heightOverride ?? this.config.baseHeight;
    const distance = Math.hypot(back, up) * this.zoom;
    const elevation = clamp(Math.atan2(up, back) + this.pitch, this.elevationRange.min, this.elevationRange.max);
    const horizontal = distance * Math.cos(elevation);
    const angle = target.heading + this.yaw;
    this.offset.set(-Math.cos(angle) * horizontal, distance * Math.sin(elevation), -Math.sin(angle) * horizontal);
  }

  private advanceOrbit(dt: number): void {
    this.sinceInteraction += dt;
    const angleSmoothing = -60 * Math.log(1 - 0.08); // OrbitControls dampingFactor=0.08 等效
    const angleEase = 1 - Math.exp(-angleSmoothing * dt);
    this.yaw = wrapAngle(this.yaw + wrapAngle(this.yawTarget - this.yaw) * angleEase);
    this.pitch += (this.pitchTarget - this.pitch) * angleEase;
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-14 * dt));
  }

  update(dt: number, target: ChaseTarget, queries?: {
    occlusion?: (x: number, y: number, z: number, margin: number) => boolean;
    terrain?: (x: number, z: number) => number;
  }): void {
    if (!this.initialized) this.reset(target);
    this.advanceOrbit(dt);
    this.computeOffset(target);
    const forwardX = Math.cos(target.heading);
    const forwardZ = Math.sin(target.heading);
    const { x: ox, y: oy, z: oz } = this.offset;
    let anchorX = target.x + ox;
    let anchorZ = target.z + oz;
    let anchorY = target.y + oy;
    // 遮挡收缩（queries.occlusion 优先，回退 config.occlusionQuery）
    const occlusion = queries?.occlusion ?? this.config.occlusionQuery;
    let shrink = 1;
    if (occlusion) {
      for (const sample of [0.35, 0.6, 0.85]) {
        const sx = target.x + ox * (1 - sample);
        const sy = target.y + oy * (1 - sample);
        const sz = target.z + oz * (1 - sample);
        if (!occlusion(sx, sy, sz, 1)) shrink = Math.min(shrink, sample * 0.8);
      }
    }
    if (shrink < 1) {
      anchorX = target.x + ox * shrink;
      anchorZ = target.z + oz * shrink;
      anchorY = target.y + oy * (0.4 + 0.6 * shrink);
    }
    // 贴地保护（queries.terrain 优先，回退 config.terrainHeight）
    const terrain = queries?.terrain ?? this.config.terrainHeight;
    if (terrain) {
      const floor = Math.max(0, terrain(anchorX, anchorZ)) + this.config.groundMargin;
      if (anchorY < floor) anchorY = floor;
    }
    this.anchor.set(anchorX, anchorY, anchorZ);
    const interacting = this.dragging || this.sinceInteraction < 0.5;
    this.camera.position.lerp(this.anchor, 1 - Math.exp(-(interacting ? this.config.dragPositionDamping : this.config.positionDamping) * dt));
    // 注视点：前视距离随 zoom 收缩（拉近到贴脸时看回载具本体）
    const zoomT = clamp((this.zoom - this.zoomRange.min) / (1 - this.zoomRange.min), 0, 1);
    const ahead = (target.lookAheadOverride ?? this.config.lookAhead) * zoomT * Math.max(0, Math.cos(this.yaw));
    const desiredLook = new THREE.Vector3(target.x + forwardX * ahead, target.y, target.z + forwardZ * ahead);
    this.look.lerp(desiredLook, 1 - Math.exp(-this.config.lookDamping * dt));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
    // FOV 速度响应
    const targetFov = this.reducedMotion ? this.config.fovBase : this.config.fovBase + this.config.fovSpeedSpan * clamp(target.fovSpeedRatio ?? target.speedRatio, 0, 1);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-(this.config.fovDamping ?? 3) * dt));
      this.camera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    this.initialized = false;
  }
}
