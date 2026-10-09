/**
 * FlightCamera（§6 借鉴 tinyskies CameraRig 的阻尼与速度相关距离，重写为城市平面）：
 * 机后追尾 + 1-exp(-k·dt) 阻尼 + 速度相关距离/FOV + 相机-飞机遮挡收缩 + 贴地保护。
 * 只在 game 拥有相机时被调用（引擎 updateScene 已让位）；reduced-motion 时不做 FOV 变化。
 */
import * as THREE from "three";
import type { FlightSimState, FlightParams } from "./FlightSimulation";
import type { FlightWorld } from "./FlightWorld";

const POSITION_DAMPING = 4.2;
const LOOK_DAMPING = 10;
const BASE_BACK_RATIO = 5.2; // 机后距离 = 半径 × 系数（随速度再放大）
const BASE_UP_RATIO = 2.4;
const FOV_BASE = 52;
const FOV_SPEED_SPAN = 8; // 巡航→极速再加 8° FOV（速度感）

export class FlightCamera {
  private look = new THREE.Vector3();
  private anchor = new THREE.Vector3();
  private initialized = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly reducedMotion: boolean,
  ) {}

  reset(sim: FlightSimState, params: FlightParams): void {
    this.anchor.set(
      sim.x - Math.cos(sim.heading) * this.backDistance(sim, params),
      sim.y + this.upDistance(params),
      sim.z - Math.sin(sim.heading) * this.backDistance(sim, params),
    );
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

  update(dt: number, sim: FlightSimState, params: FlightParams, world: FlightWorld): void {
    if (!this.initialized) this.reset(sim, params);
    const forwardX = Math.cos(sim.heading);
    const forwardZ = Math.sin(sim.heading);
    const back = this.backDistance(sim, params);
    const up = this.upDistance(params);
    let anchorX = sim.x - forwardX * back;
    let anchorZ = sim.z - forwardZ * back;
    let anchorY = sim.y + up;
    // 遮挡收缩：机位→飞机连线中点若在碰撞盒内，按比例拉近（避免钻楼时不穿模）。
    let shrink = 1;
    for (const sample of [0.35, 0.6, 0.85]) {
      const sx = anchorX + (sim.x - anchorX) * sample;
      const sy = anchorY + (sim.y - anchorY) * sample;
      const sz = anchorZ + (sim.z - anchorZ) * sample;
      if (!world.isPointClear(sx, sy, sz, params.planeRadius * 0.7)) {
        shrink = Math.min(shrink, sample * 0.8);
      }
    }
    if (shrink < 1) {
      anchorX = sim.x - forwardX * back * shrink;
      anchorZ = sim.z - forwardZ * back * shrink;
      anchorY = sim.y + up * (0.4 + 0.6 * shrink);
    }
    // 相机贴地/贴水面保护（引擎的地形夹取在 game 模式下不生效）。
    const floor = Math.max(0, world.terrainHeight(anchorX, anchorZ)) + params.planeRadius * 0.9;
    if (anchorY < floor) anchorY = floor;
    this.anchor.set(anchorX, anchorY, anchorZ);
    this.camera.position.lerp(this.anchor, 1 - Math.exp(-POSITION_DAMPING * dt));
    const desiredLook = new THREE.Vector3(sim.x + forwardX * params.planeRadius * 2.4, sim.y, sim.z + forwardZ * params.planeRadius * 2.4);
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
