/**
 * FlightVisuals（§4/G1.4，CALIBRATION_SPEC §5 R3）：程序化双翼飞机 + 圆环 + 轻反馈。
 * 机身轮廓（Lathe 半径曲线）、圆角翼尖与 Fresnel 边缘光的造型/手法参照 tinyskies
 * `BiplaneMesh.ts` / `RimLight.ts`（commit 2659a5c；作者已授权参考与移植，
 * 见 TINYSKIES_PORTING_ANALYSIS.md），按城市尺度与现有材质体系重写。
 * 所有几何/材质自建自释放；对象数相对 G1 占位机 +6 以内、新增材质 1 个（§10 预算）。
 */
import * as THREE from "three";
import type { FlightSimState, FlightParams } from "./FlightSimulation";
import type { CourseRing } from "./RaceCourse";

const RING_ACTIVE_COLOR = new THREE.Color("#8fe3ff");
const RING_NEAR_COLOR = new THREE.Color("#4d7d99");
const RING_FAR_COLOR = new THREE.Color("#27414f");
const RIM_COLOR = new THREE.Color("#ffeebb");

/** Fresnel 边缘光：onBeforeCompile 注入片元，零额外 draw call（参照 tinyskies RimLight）。 */
function addRimLight(material: THREE.MeshStandardMaterial, intensity = 0.25, power = 3.5): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = { value: RIM_COLOR };
    shader.uniforms.rimIntensity = { value: intensity };
    shader.uniforms.rimPower = { value: power };
    shader.fragmentShader = shader.fragmentShader
      .replace("uniform vec3 emissive;", "uniform vec3 emissive;\nuniform vec3 rimColor;\nuniform float rimIntensity;\nuniform float rimPower;")
      .replace("#include <dithering_fragment>", `vec3 rimViewDir = normalize(vViewPosition);
vec3 rimNormal = normalize(normal);
float rimFresnel = 1.0 - abs(dot(rimViewDir, rimNormal));
gl_FragColor.rgb += rimColor * rimIntensity * pow(rimFresnel, rimPower);
#include <dithering_fragment>`);
  };
  material.needsUpdate = true;
}

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
    const body = new THREE.MeshStandardMaterial({ color: "#c8452c", roughness: 0.55, metalness: 0.08 });
    const cloth = new THREE.MeshStandardMaterial({ color: "#e8dfc8", roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: "#2c3238", roughness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: "#88ccee", roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.65 });
    addRimLight(body);
    addRimLight(cloth, 0.2);

    // 机身：Lathe 24 段半径轮廓（鼻锥缓入 → 等径 → 尾椎 smoothstep 收敛），沿 +X 前向。
    const length = r * 4.6;
    const profile: THREE.Vector2[] = [];
    for (let index = 0; index <= 24; index += 1) {
      const t = index / 24;
      let radius: number;
      if (t < 0.15) radius = THREE.MathUtils.lerp(r * 0.22, r * 0.42, Math.sin((t / 0.15) * Math.PI / 2));
      else if (t < 0.4) radius = r * 0.42;
      else {
        const k = (t - 0.4) / 0.6;
        radius = THREE.MathUtils.lerp(r * 0.42, r * 0.1, k * k * (3 - 2 * k));
      }
      profile.push(new THREE.Vector2(radius, t * length));
    }
    const fuselageGeometry = new THREE.LatheGeometry(profile, 20);
    fuselageGeometry.rotateZ(-Math.PI / 2); // 旋转母线到 +X：y=0（鼻）在前
    fuselageGeometry.translate(-length * 0.45, 0, 0);
    const fuselageMesh = new THREE.Mesh(fuselageGeometry, body);

    // 风挡：小球玻璃 + 深色框。
    const windshieldGeometry = new THREE.SphereGeometry(r * 0.24, 10, 8);
    const windshield = new THREE.Mesh(windshieldGeometry, glass);
    windshield.scale.set(1.3, 0.8, 0.9);
    windshield.position.set(r * 0.7, r * 0.34, 0);

    // 双翼 + 圆角翼尖（端部圆柱收边，去积木感）。
    const wingUpper = new THREE.BoxGeometry(r * 4.6, r * 0.12, r * 0.95);
    const wingLower = new THREE.BoxGeometry(r * 3.8, r * 0.12, r * 0.85);
    const tipUpper = new THREE.CylinderGeometry(r * 0.475, r * 0.475, r * 0.12, 10);
    tipUpper.rotateX(Math.PI / 2);
    const tipLower = new THREE.CylinderGeometry(r * 0.425, r * 0.425, r * 0.12, 10);
    tipLower.rotateX(Math.PI / 2);
    const wingUpperMesh = new THREE.Mesh(wingUpper, cloth); wingUpperMesh.position.set(r * 0.1, r * 0.52, 0);
    const wingLowerMesh = new THREE.Mesh(wingLower, cloth); wingLowerMesh.position.set(r * 0.1, -r * 0.3, 0);
    const tips: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const upper = new THREE.Mesh(tipUpper, cloth);
      upper.position.set(r * 0.1 + side * r * 2.3, r * 0.52, 0);
      const lower = new THREE.Mesh(tipLower, cloth);
      lower.position.set(r * 0.1 + side * r * 1.9, -r * 0.3, 0);
      tips.push(upper, lower);
    }

    // 斜撑（左右各一）+ 尾翼。
    const strutGeometry = new THREE.CylinderGeometry(r * 0.05, r * 0.05, r * 1.0, 6);
    const struts: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(strutGeometry, dark);
      strut.position.set(r * 0.1, r * 0.11, side * r * 0.75);
      strut.rotation.x = side * 0.35;
      struts.push(strut);
    }
    const tailGeometry = new THREE.BoxGeometry(r * 1.5, r * 0.1, r * 0.55);
    const finGeometry = new THREE.BoxGeometry(r * 0.1, r * 0.8, r * 0.6);
    const tailMesh = new THREE.Mesh(tailGeometry, cloth); tailMesh.position.set(-r * 1.7, 0, 0);
    const finMesh = new THREE.Mesh(finGeometry, body); finMesh.position.set(-r * 1.7, r * 0.4, 0);

    // 螺旋桨（每帧自转）。
    const propellerGeometry = new THREE.BoxGeometry(r * 0.06, r * 1.5, r * 0.16);
    this.propeller = new THREE.Mesh(propellerGeometry, dark);
    this.propeller.position.set(r * 1.95, 0, 0);

    this.disposables.push(fuselageGeometry, windshieldGeometry, wingUpper, wingLower, tipUpper, tipLower, strutGeometry, tailGeometry, finGeometry, propellerGeometry, body, cloth, dark, glass);
    this.group.add(fuselageMesh, windshield, wingUpperMesh, wingLowerMesh, ...tips, ...struts, tailMesh, finMesh, this.propeller);
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
