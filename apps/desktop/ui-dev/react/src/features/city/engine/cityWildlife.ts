/**
 * 城市野生物组：V 字鸟群、夜间流星、远火山烟柱、黄昏萤火虫。
 * 手法参考 tinyskies/GlobeFly（作者授权参考其代码）：鸟群队形与扑翼节奏出自
 * BirdFlock，流星的对象池/拖尾节奏出自 MeteorShower，萤火虫的闪烁点阵出自
 * FireflyCluster；火山烟柱为自建上升烟团。全部廉价几何、数量固定、昼夜联动；
 * 确定性由 hashSeed 保证（流星夜按日期哈希，回放同一晚必现）。
 */

import * as THREE from "three";
import { hashSeed } from "../cityModel";

type Mountain = { center: { x: number; z: number }; radius: number; height: number; seed: number };

/** V 字鸟群：两群海鸥剪影绕城巡航，白天可见、入夜归巢。单 InstancedMesh。 */
class BirdFlocks {
  private readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly flocks: Array<{ orbit: number; radius: number; altitude: number; speed: number; phase: number; bob: number }> = [];
  private readonly offsets: Array<[number, number]>;
  private daylight = 1;

  constructor(center: { x: number; z: number }, radius: number) {
    // 鸥形剪影：两片后掠翼 + 尾尖，6 个三角形的扁平 V——航拍距离下读作滑翔的鸟。
    const shape = new THREE.Shape();
    shape.moveTo(-1.7, 0.12); shape.lineTo(-0.5, 0.05); shape.lineTo(0, 0.28);
    shape.lineTo(0.5, 0.05); shape.lineTo(1.7, 0.12); shape.lineTo(0.42, -0.1);
    shape.lineTo(0, -0.02); shape.lineTo(-0.42, -0.1); shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({ color: "#343a40", transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    // tinyskies BirdFlock 的 V 位（头鸟在前，两翼逐级后撤）；×3.2 拉到城市尺度。
    this.offsets = [[0, 0], [-0.13, -0.085], [-0.13, 0.085], [-0.26, -0.17], [-0.26, 0.17], [-0.39, -0.25], [-0.39, 0.25]]
      .map(([back, side]) => [back * 10.5, side * 10.5] as [number, number]);
    const total = this.offsets.length * 2;
    this.mesh = new THREE.InstancedMesh(geometry, this.material, total);
    this.mesh.name = "city-birds";
    this.mesh.frustumCulled = false;
    for (let index = 0; index < 2; index += 1) {
      const seed = hashSeed(`flock:${index}`);
      this.flocks.push({
        orbit: seed * Math.PI * 2,
        radius: radius * (1.05 + seed * 0.35),
        altitude: 78 + seed * 46,
        speed: (0.05 + seed * 0.018) * (index === 0 ? 1 : -1),
        phase: seed * 7,
        bob: 0.55 + seed * 0.4,
      });
    }
  }

  readonly group = new THREE.Group();

  setDaylight(daylight: number): void {
    this.daylight = daylight;
    this.material.opacity = 0.85 * daylight;
    this.group.visible = daylight > 0.05;
  }

  update(dt: number, elapsed: number): void {
    if (!this.group.visible) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    let index = 0;
    for (const flock of this.flocks) {
      const angle = flock.orbit + elapsed * flock.speed;
      for (const [back, side] of this.offsets) {
        const along = angle - Math.sign(flock.speed) * back / flock.radius;
        const x = Math.cos(along) * (flock.radius + side * Math.sin(along));
        const z = Math.sin(along) * (flock.radius + side * -Math.cos(along));
        const flap = Math.sin(elapsed * 7.5 + flock.phase + back * 1.9 + side * 3.1);
        position.set(x, flock.altitude + flap * flock.bob, z);
        euler.set(flap * 0.14, -angle - Math.sign(flock.speed) * Math.PI / 2, flap * 0.22);
        quaternion.setFromEuler(euler);
        scale.setScalar(0.92 + flap * 0.1);
        matrix.compose(position, quaternion, scale);
        this.mesh.setMatrixAt(index, matrix);
        index += 1;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.group.removeFromParent();
  }

  get object3d(): THREE.Object3D {
    return this.mesh;
  }
}

/** 夜间流星：对象池 3 颗，按日期哈希决定「流星夜」（约三成夜晚），其余夜偶发孤星。 */
class MeteorShower {
  private readonly pool: Array<{ mesh: THREE.Mesh; active: boolean; life: number; span: number; velocity: THREE.Vector3 }> = [];
  private readonly material: THREE.MeshBasicMaterial;
  private countdown = 3;
  private interval = 1.2;
  private night = 0;
  private spawnCount = 0;
  readonly group = new THREE.Group();

  constructor(private radius: number) {
    // 拉长的锥形流星：头在前、尾渐细，additive 发光。
    const geometry = new THREE.ConeGeometry(0.9, 26, 5, 1, true).rotateX(Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({ color: "#fff3d2", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
    for (let index = 0; index < 3; index += 1) {
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.pool.push({ mesh, active: false, life: 0, span: 2.6, velocity: new THREE.Vector3() });
    }
  }

  setNight(night: number, nowMs: number): void {
    this.night = night;
    // 确定性流星夜：按「第几夜」哈希，约 30% 的夜晚有流星雨；回放同一晚必现。
    const nightIndex = Math.floor(nowMs / 86_400_000);
    const shower = hashSeed(`meteor-night:${nightIndex}`) < 0.3;
    this.interval = shower ? 1.35 : 7.5;
  }

  update(dt: number): void {
    const active = this.night > 0.55;
    this.group.visible = active;
    if (!active) {
      for (const meteor of this.pool) meteor.mesh.visible = false;
      return;
    }
    this.countdown -= dt;
    if (this.countdown <= 0) {
      const free = this.pool.find((meteor) => !meteor.active);
      if (free) {
        // 发射参数走 seeded 序列（spawnCount 递增），同一次会话内可复现。
        const seed = hashSeed(`meteor-spawn:${this.spawnCount}`);
        this.spawnCount += 1;
        const reach = this.radius * (1.15 + seed * 0.5);
        const heading = seed * Math.PI * 2;
        free.mesh.position.set(Math.cos(heading) * reach, 560 + seed * 220, Math.sin(heading) * reach);
        free.velocity.set(-Math.cos(heading) * 150 - 60, -95 - seed * 45, -Math.sin(heading) * 150 + 40).normalize().multiplyScalar(230 + seed * 70);
        free.span = 2.2 + seed * 1.1;
        free.life = 0;
        free.active = true;
        free.mesh.visible = true;
      }
      this.countdown = this.interval * (0.7 + hashSeed(`meteor-gap:${this.spawnCount}`) * 0.6);
    }
    for (const meteor of this.pool) {
      if (!meteor.active) continue;
      meteor.life += dt;
      const age = meteor.life / meteor.span;
      if (age >= 1) { meteor.active = false; meteor.mesh.visible = false; continue; }
      meteor.mesh.position.addScaledVector(meteor.velocity, dt);
      const fade = Math.sin(age * Math.PI);
      meteor.mesh.scale.setScalar(0.5 + fade * 0.8);
      meteor.mesh.lookAt(meteor.mesh.position.clone().add(meteor.velocity));
      meteor.mesh.rotateX(Math.PI / 2);
    }
  }

  dispose(): void {
    this.pool.forEach((meteor) => meteor.mesh.geometry.dispose());
    this.material.dispose();
    this.group.removeFromParent();
  }
}

/** 远火山：海平线远山中最高的那座冒烟——上升烟团缓慢膨胀漂移，夜里山口微光。 */
class VolcanoPlume {
  private readonly puffs: THREE.InstancedMesh;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly glow: THREE.Mesh;
  private readonly glowMaterial: THREE.MeshBasicMaterial;
  private readonly crater: THREE.Vector3;
  private readonly wind = new THREE.Vector3(4.2, 0, 2.6);
  private readonly ages: number[] = [];
  private readonly spans: number[] = [];
  readonly group = new THREE.Group();

  constructor(mountain: Mountain) {
    // buildSeaMountains 的锥中心在 y=0，峰值在 height/2。
    this.crater = new THREE.Vector3(mountain.center.x, mountain.height / 2, mountain.center.z);
    const geometry = new THREE.SphereGeometry(1, 7, 6);
    this.material = new THREE.MeshLambertMaterial({ color: "#c9ced2", transparent: true, opacity: 0.4, depthWrite: false });
    this.puffs = new THREE.InstancedMesh(geometry, this.material, 11);
    this.puffs.name = "city-volcano-plume";
    for (let index = 0; index < 11; index += 1) {
      this.ages.push(hashSeed(`puff:${index}`) * 9);
      this.spans.push(7 + hashSeed(`puffspan:${index}`) * 5);
    }
    this.glowMaterial = new THREE.MeshBasicMaterial({ color: "#ff5a2e", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(4.5, 8, 6), this.glowMaterial);
    this.glow.position.copy(this.crater);
    this.group.add(this.puffs, this.glow);
  }

  setNight(night: number): void {
    this.glowMaterial.opacity = night * 0.3;
  }

  update(dt: number): void {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    for (let index = 0; index < this.ages.length; index += 1) {
      this.ages[index] += dt;
      if (this.ages[index] > this.spans[index]) this.ages[index] = 0;
      const age = this.ages[index] / this.spans[index];
      const rise = age * 58;
      position.copy(this.crater).addScaledVector(this.wind, age * this.spans[index]);
      position.y += rise;
      const size = 3.5 + age * 13;
      scale.set(size, size * 0.8, size);
      matrix.compose(position, new THREE.Quaternion(), scale);
      this.puffs.setMatrixAt(index, matrix);
    }
    this.puffs.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.puffs.geometry.dispose();
    this.material.dispose();
    this.glow.geometry.dispose();
    this.glowMaterial.dispose();
    this.group.removeFromParent();
  }
}

/** 黄昏萤火虫：绿地/林区的闪烁点阵，暮色起亮、深夜渐弱。单 Points batch。 */
class Fireflies {
  private readonly material: THREE.ShaderMaterial;
  private readonly timeU = { value: 0 };
  private readonly nightU = { value: 0 };
  readonly points: THREE.Points;

  constructor(spots: Array<{ x: number; z: number; y: number }>, count = 130) {
    const picked: Array<{ x: number; z: number; y: number; seed: number }> = [];
    for (let index = 0; index < count && index < spots.length; index += 1) {
      const spot = spots[Math.floor(hashSeed(`firefly:${index}`) * spots.length)];
      picked.push({ ...spot, seed: hashSeed(`fireflyphase:${index}`) });
    }
    const positions = new Float32Array(picked.length * 3);
    const phases = new Float32Array(picked.length);
    picked.forEach((spot, index) => {
      positions[index * 3] = spot.x + (spot.seed - 0.5) * 6;
      positions[index * 3 + 1] = spot.y + 1.4 + spot.seed * 2.2;
      positions[index * 3 + 2] = spot.z + (hashSeed(`fireflyz:${index}`) - 0.5) * 6;
      phases[index] = spot.seed * Math.PI * 2;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.timeU, uNight: this.nightU },
      vertexShader: /* glsl */ `
        attribute float aPhase;
        uniform float uTime;
        varying float vGlow;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float blink = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(uTime * (1.4 + aPhase * 0.22) + aPhase * 6.28), 3.0);
          float drift = sin(uTime * 0.6 + aPhase * 4.0) * 0.5;
          mvPosition.y += drift;
          vGlow = blink;
          gl_PointSize = (60.0 + blink * 46.0) / max(1.0, -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uNight;
        varying float vGlow;
        void main() {
          float falloff = 1.0 - smoothstep(0.15, 0.5, length(gl_PointCoord - vec2(0.5)));
          vec3 warm = mix(vec3(0.82, 0.95, 0.45), vec3(1.0, 0.92, 0.5), vGlow);
          gl_FragColor = vec4(warm, vGlow * falloff * uNight);
        }`,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.name = "city-fireflies";
    this.points.frustumCulled = false;
  }

  setNight(night: number): void {
    // 暮色（stars~0.2-0.4）最盛，深夜稍弱但仍在——真实萤火虫的作息。
    this.nightU.value = Math.max(0, Math.min(1, (night - 0.06) / 0.2)) * (1 - night * 0.35);
  }

  update(dt: number, elapsed: number): void {
    this.timeU.value = elapsed;
    void dt;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}

export class CityWildlife {
  private readonly birds: BirdFlocks;
  private readonly meteors: MeteorShower;
  private readonly volcano: VolcanoPlume | null;
  private readonly fireflies: Fireflies | null;
  readonly group = new THREE.Group();

  constructor(center: { x: number; z: number }, radius: number, parkTrees: Array<{ x: number; z: number; y: number }>, seaMountains: Mountain[]) {
    this.birds = new BirdFlocks(center, radius);
    this.group.add(this.birds.object3d);
    this.meteors = new MeteorShower(radius);
    this.group.add(this.meteors.group);
    const volcanoMountain = [...seaMountains].sort((a, b) => b.height - a.height)[0];
    this.volcano = volcanoMountain ? new VolcanoPlume(volcanoMountain) : null;
    if (this.volcano) this.group.add(this.volcano.group);
    this.fireflies = parkTrees.length ? new Fireflies(parkTrees) : null;
    if (this.fireflies) this.group.add(this.fireflies.points);
  }

  setNight(night: number, nowMs: number): void {
    this.birds.setDaylight(1 - night);
    this.meteors.setNight(night, nowMs);
    this.volcano?.setNight(night);
    this.fireflies?.setNight(night);
  }

  update(dt: number, elapsed: number): void {
    this.birds.update(dt, elapsed);
    this.meteors.update(dt);
    this.volcano?.update(dt);
    this.fireflies?.update(dt, elapsed);
  }

  dispose(): void {
    this.birds.dispose();
    this.meteors.dispose();
    this.volcano?.dispose();
    this.fireflies?.dispose();
    this.group.removeFromParent();
  }
}
