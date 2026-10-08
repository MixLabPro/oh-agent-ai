/**
 * FlightVisuals（§4/G1.4）：程序化双翼飞机（少量基础几何重建，不搬上游模型）+
 * 轻反馈（碰撞短闪）。所有几何/材质自建自释放；dispose 后对象计数归零（§10 资源预算）。
 */
import * as THREE from "three";
import type { FlightSimState, FlightParams } from "./FlightSimulation";
import type { CourseRing } from "./RaceCourse";

const RING_ACTIVE_COLOR = new THREE.Color("#8fe3ff");
const RING_NEAR_COLOR = new THREE.Color("#4d7d99");
const RING_FAR_COLOR = new THREE.Color("#27414f");

export class FlightVisuals {
  readonly group = new THREE.Group();
  private readonly propeller: THREE.Mesh;
  private readonly flash: THREE.PointLight;
  private readonly disposables: Array<{ dispose: () => void }> = [];
  /** 12 个环共用一个 InstancedMesh（1 次 draw call，§10 绘制预算）。 */
  private ringMesh: THREE.InstancedMesh | null = null;
  private ringData: CourseRing[] = [];
  private ringMatrix = new THREE.Matrix4();
  private ringQuaternion = new THREE.Quaternion();
  private ringAxis = new THREE.Vector3(0, 0, 1);
  private ringNormal = new THREE.Vector3();
  private ringScale = new THREE.Vector3();
  private ringPosition = new THREE.Vector3();

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

  /** 生成/替换路线圆环（一次创建，重试复用；实例化渲染）。 */
  setRings(rings: CourseRing[]): void {
    this.clearRings();
    const geometry = new THREE.TorusGeometry(1, 0.07, 8, 40);
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 });
    const mesh = new THREE.InstancedMesh(geometry, material, rings.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; // 实例包围球不随矩阵更新，禁用裁剪避免整组消失
    this.ringMesh = mesh;
    this.ringData = rings;
    this.group.add(mesh);
    this.updateRings(0, 0);
  }

  /** 每帧环状态：已过的隐藏（零缩放）、当前高亮呼吸、其后渐弱（实例颜色）。 */
  updateRings(elapsed: number, targetIndex: number): void {
    const mesh = this.ringMesh;
    if (!mesh) return;
    for (let index = 0; index < this.ringData.length; index += 1) {
      const ring = this.ringData[index];
      const scale = index < targetIndex ? 0 : index === targetIndex ? ring.radius * (1 + Math.sin(elapsed * 4) * 0.04) : ring.radius;
      this.ringNormal.set(ring.nx, ring.ny, ring.nz).normalize();
      this.ringQuaternion.setFromUnitVectors(this.ringAxis, this.ringNormal);
      this.ringScale.setScalar(scale);
      this.ringMatrix.compose(this.ringPosition.set(ring.x, ring.y, ring.z), this.ringQuaternion, this.ringScale);
      mesh.setMatrixAt(index, this.ringMatrix);
      const color = index === targetIndex ? RING_ACTIVE_COLOR : index - targetIndex <= 3 ? RING_NEAR_COLOR : RING_FAR_COLOR;
      mesh.setColorAt(index, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  clearRings(): void {
    if (this.ringMesh) {
      this.ringMesh.removeFromParent();
      this.ringMesh.geometry.dispose();
      (this.ringMesh.material as THREE.Material).dispose();
      this.ringMesh.dispose();
      this.ringMesh = null;
      this.ringData = [];
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.clearRings();
    for (const disposable of this.disposables) disposable.dispose();
    this.flash.dispose();
  }
}
