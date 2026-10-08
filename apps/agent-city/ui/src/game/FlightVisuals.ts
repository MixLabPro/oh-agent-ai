/**
 * FlightVisuals（§4/G1.4）：程序化双翼飞机（少量基础几何重建，不搬上游模型）+
 * 轻反馈（碰撞短闪）。所有几何/材质自建自释放；dispose 后对象计数归零（§10 资源预算）。
 */
import * as THREE from "three";
import type { FlightSimState, FlightParams } from "./FlightSimulation";

export class FlightVisuals {
  readonly group = new THREE.Group();
  private readonly propeller: THREE.Mesh;
  private readonly flash: THREE.PointLight;
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private flashUntil = 0;

  constructor(params: FlightParams) {
    const r = params.planeRadius;
    const fuselage = new THREE.CapsuleGeometry(r * 0.42, r * 2.6, 4, 10);
    const wing = new THREE.BoxGeometry(r * 4.4, r * 0.12, r * 0.9);
    const tail = new THREE.BoxGeometry(r * 1.7, r * 0.1, r * 0.55);
    const fin = new THREE.BoxGeometry(r * 0.1, r * 0.85, r * 0.7);
    const spinner = new THREE.ConeGeometry(r * 0.3, r * 0.7, 8);
    const body = new THREE.MeshStandardMaterial({ color: "#c8452c", roughness: 0.55, metalness: 0.08 });
    const cloth = new THREE.MeshStandardMaterial({ color: "#e8dfc8", roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: "#2c3238", roughness: 0.6 });
    this.disposables.push(fuselage, wing, tail, fin, spinner, body, cloth, dark);
    const fuselageMesh = new THREE.Mesh(fuselage, body);
    fuselageMesh.rotation.z = Math.PI / 2; // 机身沿 +X（前向）
    const wingMain = new THREE.Mesh(wing, cloth); wingMain.position.set(r * 0.1, r * 0.55, 0);
    const wingLow = new THREE.Mesh(wing, cloth); wingLow.position.set(r * 0.1, -r * 0.35, 0);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(r * 0.08, r * 0.9, r * 0.08), dark); strut.position.set(r * 0.1, r * 0.1, 0);
    const tailMesh = new THREE.Mesh(tail, cloth); tailMesh.position.set(-r * 1.55, 0, 0);
    const finMesh = new THREE.Mesh(fin, body); finMesh.position.set(-r * 1.55, r * 0.45, 0);
    this.propeller = new THREE.Mesh(new THREE.BoxGeometry(r * 0.06, r * 1.5, r * 0.16), dark);
    this.propeller.position.set(r * 1.75, 0, 0);
    this.disposables.push(this.propeller.geometry); // 材质 dark 已在上面入列，不重复释放
    this.group.add(fuselageMesh, wingMain, wingLow, strut, tailMesh, finMesh, this.propeller);
    this.flash = new THREE.PointLight("#ffb257", 0, r * 14, 2);
    this.group.add(this.flash);
  }

  /** 每渲染帧：位置 + 朝向（yaw/pitch/roll 均为视觉量）。 */
  update(sim: FlightSimState, dt: number): void {
    this.group.position.set(sim.x, sim.y, sim.z);
    // 前向 = (cos h, 0, sin h)：three 的 yaw 绕 Y，+X 前向 → rotation.y = -heading。
    this.group.rotation.set(0, 0, 0);
    this.group.rotateY(-sim.heading);
    this.group.rotateZ(-sim.bank);
    const pitch = Math.atan2(sim.verticalSpeed, Math.max(1e-3, sim.speed)) * 0.6;
    this.group.rotateZ(-pitch);
    this.propeller.rotation.x += dt * Math.min(40, 6 + sim.speed);
    if (this.flash.intensity > 0) {
      this.flash.intensity = Math.max(0, this.flash.intensity - dt * 6);
    }
  }

  /** 碰撞温和反馈：短促灯光脉冲（无声、不依赖颜色语义）。 */
  pulseFeedback(): void {
    this.flash.intensity = 5;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const disposable of this.disposables) disposable.dispose();
    this.flash.dispose();
  }
}
