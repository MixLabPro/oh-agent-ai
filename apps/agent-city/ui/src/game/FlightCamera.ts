/**
 * FlightCamera（§6 借鉴 tinyskies CameraRig 的阻尼与速度相关距离，重写为城市平面）：
 * 机后追尾 + 1-exp(-k·dt) 阻尼 + 速度相关距离/FOV + 相机-飞机遮挡收缩 + 贴地保护。
 * 只在 game 拥有相机时被调用（引擎 updateScene 已让位）；reduced-motion 时不做 FOV 变化。
 *
 * 环绕/缩放：相机位置 = 飞机 + 球坐标偏移（yaw 相对航向、pitch 相对默认仰角、zoom 乘距离）。
 * 三个量都为 0/0/1 时偏移恰好等于原来的「机后 back、机上 up」，所以不操作时行为与旧版逐点一致。
 * 相机始终注视飞机，只是绕着它转——不是自由相机。输入由 FlightCameraControls 喂进来。
 * 绕到侧面/前面后留在原处（与默认城市相机一致），双击复位；从机头前方看时 A/D 的屏幕方向是反的，这是环绕查看的固有代价。
 */
import * as THREE from "three";
import type { FlightSimState, FlightParams } from "./FlightSimulation";
import type { FlightWorld } from "./FlightWorld";

const POSITION_DAMPING = 4.2;
const DRAG_POSITION_DAMPING = 14; // 拖动/缩放期间收紧位置阻尼，否则相机会明显滞后于手
const LOOK_DAMPING = 10;
const BASE_BACK_RATIO = 5.2; // 机后距离 = 半径 × 系数（随速度再放大）
const BASE_UP_RATIO = 2.4;
const FOV_BASE = 52;
const FOV_SPEED_SPAN = 8; // 巡航→极速再加 8° FOV（速度感）

/** 绝对仰角范围：下限与引擎 OrbitControls 一致（maxPolarAngle=1.42 → 相机不低于水平线以上 8.6°，
 *  默认交互里同样看不到机腹以下）；上限接近正俯视，保持 <90° 避免 lookAt 与 up 平行。 */
const ELEVATION_MIN = Math.PI / 2 - 1.42;
const ELEVATION_MAX = 1.45;
/** 缩放倍率相对默认距离。引擎近裁剪面 1.5、最小飞机半径 2.2、半翼展 2.1r：
 *  0.55 时侧面机位离翼尖约 2.3 单位 > 1.5；再近翼尖会被近裁剪面切掉。 */
export const ZOOM_MIN = 0.55;
export const ZOOM_MAX = 3.5;
/** 角度平滑与引擎 OrbitControls 的 dampingFactor=0.08（每帧补 8%）等效：折算成 60Hz 下的连续速率≈5/s，
 *  约 0.2 秒追上拖动量，所以环绕有「跟手但略飘」的默认手感；缩放在 OrbitControls 里不做阻尼，这里保留较快的缓动避免跳变。 */
const ENGINE_DAMPING_FACTOR = 0.08;
const ANGLE_SMOOTHING = -60 * Math.log(1 - ENGINE_DAMPING_FACTOR);
const ZOOM_SMOOTHING = 14;
/** 最近一次操作后这么久内仍按「操作中」处理（滚轮没有 up 事件）。 */
const INTERACTION_HOLD = 0.5;

const TWO_PI = Math.PI * 2;
const wrapAngle = (angle: number) => angle - TWO_PI * Math.round(angle / TWO_PI);
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));

export type FlightOrbitState = { yaw: number; pitch: number; zoom: number };

export class FlightCamera {
  private look = new THREE.Vector3();
  private anchor = new THREE.Vector3();
  private offset = new THREE.Vector3();
  private initialized = false;

  // 目标值（输入直接写）与当前值（逐帧缓动追上）。
  private yawTarget = 0;
  private pitchTarget = 0;
  private zoomTarget = 1;
  private yaw = 0;
  private pitch = 0;
  private zoom = 1;
  private dragging = false;
  private sinceInteraction = Infinity;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly reducedMotion: boolean,
  ) {}

  /** 当前（已缓动）环绕状态，测试与调试用。 */
  get orbit(): FlightOrbitState {
    return { yaw: this.yaw, pitch: this.pitch, zoom: this.zoom };
  }

  /** 拖动环绕：dYaw 正 = 相机绕到飞机左侧（画面像被抓住向右拖）；dPitch 正 = 相机升高。 */
  orbitBy(dYaw: number, dPitch: number): void {
    this.yawTarget = wrapAngle(this.yawTarget + dYaw);
    // 只做粗限幅防止累积发散；真正的绝对仰角夹取在 computeOffset（默认仰角随速度变化，这里不知道当前速度）。
    this.pitchTarget = clamp(this.pitchTarget + dPitch, -Math.PI, Math.PI);
    this.sinceInteraction = 0;
  }

  /** 缩放：factor < 1 拉近、> 1 拉远，相对当前目标值累乘并夹在 [ZOOM_MIN, ZOOM_MAX]。 */
  zoomBy(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.zoomTarget = clamp(this.zoomTarget * factor, ZOOM_MIN, ZOOM_MAX);
    this.sinceInteraction = 0;
  }

  setDragging(dragging: boolean): void {
    this.dragging = dragging;
    this.sinceInteraction = 0;
  }

  /** 双击复位：回到默认追尾位（含缩放）。 */
  resetOrbit(includeZoom = true): void {
    this.yawTarget = 0;
    this.pitchTarget = 0;
    if (includeZoom) this.zoomTarget = 1;
    this.sinceInteraction = 0;
  }

  reset(sim: FlightSimState, params: FlightParams): void {
    // 新一局从追尾位开始；缩放是用户偏好，跨重试保留（会话退出时随相机一起释放）。
    this.yawTarget = this.yaw = 0;
    this.pitchTarget = this.pitch = 0;
    this.zoom = this.zoomTarget;
    this.dragging = false;
    this.sinceInteraction = Infinity;
    this.computeOffset(sim, params);
    this.anchor.set(sim.x + this.offset.x, sim.y + this.offset.y, sim.z + this.offset.z);
    this.camera.position.copy(this.anchor);
    this.look.set(sim.x + Math.cos(sim.heading) * 6, sim.y, sim.z + Math.sin(sim.heading) * 6);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
    this.initialized = true;
  }

  private backDistance(sim: FlightSimState, params: FlightParams): number {
    const speedRatio = (sim.speed - params.minSpeed) / Math.max(1e-6, params.maxSpeed - params.minSpeed);
    return params.planeRadius * BASE_BACK_RATIO * (1 + 0.35 * Math.max(0, Math.min(1, speedRatio)));
  }

  private upDistance(params: FlightParams): number {
    return params.planeRadius * BASE_UP_RATIO;
  }

  /** 相机相对飞机的偏移（世界系）。yaw=pitch=0、zoom=1 时恒等于 (-cos h·back, up, -sin h·back)。 */
  private computeOffset(sim: FlightSimState, params: FlightParams): void {
    const back = this.backDistance(sim, params);
    const up = this.upDistance(params);
    const distance = Math.hypot(back, up) * this.zoom;
    const elevation = clamp(Math.atan2(up, back) + this.pitch, ELEVATION_MIN, ELEVATION_MAX);
    const horizontal = distance * Math.cos(elevation);
    const angle = sim.heading + this.yaw;
    this.offset.set(-Math.cos(angle) * horizontal, distance * Math.sin(elevation), -Math.sin(angle) * horizontal);
  }

  private advanceOrbit(dt: number): void {
    this.sinceInteraction += dt;
    const angleEase = 1 - Math.exp(-ANGLE_SMOOTHING * dt);
    this.yaw = wrapAngle(this.yaw + wrapAngle(this.yawTarget - this.yaw) * angleEase);
    this.pitch += (this.pitchTarget - this.pitch) * angleEase;
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-ZOOM_SMOOTHING * dt));
  }

  update(dt: number, sim: FlightSimState, params: FlightParams, world: FlightWorld): void {
    if (!this.initialized) this.reset(sim, params);
    this.advanceOrbit(dt);
    this.computeOffset(sim, params);
    const forwardX = Math.cos(sim.heading);
    const forwardZ = Math.sin(sim.heading);
    const { x: ox, y: oy, z: oz } = this.offset;
    let anchorX = sim.x + ox;
    let anchorZ = sim.z + oz;
    let anchorY = sim.y + oy;
    // 遮挡收缩：机位→飞机连线中点若在碰撞盒内，按比例拉近（避免钻楼时不穿模）。
    let shrink = 1;
    for (const sample of [0.35, 0.6, 0.85]) {
      const sx = sim.x + ox * (1 - sample);
      const sy = sim.y + oy * (1 - sample);
      const sz = sim.z + oz * (1 - sample);
      if (!world.isPointClear(sx, sy, sz, params.planeRadius * 0.7)) {
        shrink = Math.min(shrink, sample * 0.8);
      }
    }
    if (shrink < 1) {
      anchorX = sim.x + ox * shrink;
      anchorZ = sim.z + oz * shrink;
      anchorY = sim.y + oy * (0.4 + 0.6 * shrink);
    }
    // 相机贴地/贴水面保护（引擎的地形夹取在 game 模式下不生效）。
    const floor = Math.max(0, world.terrainHeight(anchorX, anchorZ)) + params.planeRadius * 0.9;
    if (anchorY < floor) anchorY = floor;
    this.anchor.set(anchorX, anchorY, anchorZ);
    const interacting = this.dragging || this.sinceInteraction < INTERACTION_HOLD;
    this.camera.position.lerp(this.anchor, 1 - Math.exp(-(interacting ? DRAG_POSITION_DAMPING : POSITION_DAMPING) * dt));
    // 注视点：默认看飞机前方 2.4r（给前路留视野）；绕到侧面/前面或拉近到贴脸时收回到飞机本体。
    const zoomT = clamp((this.zoom - ZOOM_MIN) / (1 - ZOOM_MIN), 0, 1);
    const ahead = params.planeRadius * 2.4 * zoomT * Math.max(0, Math.cos(this.yaw));
    const desiredLook = new THREE.Vector3(sim.x + forwardX * ahead, sim.y, sim.z + forwardZ * ahead);
    this.look.lerp(desiredLook, 1 - Math.exp(-LOOK_DAMPING * dt));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
    const speedRatio = Math.max(0, Math.min(1, (sim.speed - params.cruiseSpeed) / Math.max(1e-6, params.maxSpeed - params.cruiseSpeed)));
    const targetFov = this.reducedMotion ? FOV_BASE : FOV_BASE + FOV_SPEED_SPAN * speedRatio;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-3 * dt));
      this.camera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    this.initialized = false;
  }
}
