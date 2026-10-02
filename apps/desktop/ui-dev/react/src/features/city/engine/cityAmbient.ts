/**
 * 环境氛围组：海面水龙卷、城市上空的热气球、夜间水上浮灯。
 * 手法参考 tinyskies/GlobeFly（作者授权参考其代码）：水龙卷的 twisting/sway
 * 顶点注入来自 WaterSpouts，浮灯的"缓慢升空 + 暖光"来自 FloatingLanterns，
 * 热气球为低模自建。全部廉价几何，数量固定，昼夜联动。
 */

import * as THREE from "three";
import { hashSeed } from "../cityModel";

/** 海面水龙卷：半透明水柱（顶点扭转+摆动）+ 底部浪环，缓慢漂移、周期隐现。 */
class SeaSpout {
  private readonly material: THREE.MeshBasicMaterial;
  readonly mesh: THREE.Mesh;
  private readonly timeU = { value: 0 };
  private phase: number;
  private readonly drift: { x: number; z: number };
  private readonly radius: number;
  private readonly speed: number;

  constructor(private center: { x: number; z: number }, angle: number, seed: number, private terrainHeight: (x: number, z: number) => number) {
    this.phase = seed * Math.PI * 2;
    this.radius = 0.55 + seed * 0.45;
    this.speed = 0.1 + seed * 0.08;
    this.drift = { x: Math.cos(angle), z: Math.sin(angle) };
    const height = 60 + seed * 40;
    const geometry = new THREE.CylinderGeometry(11, 2.6, height, 20, 10, true).translate(0, height / 2, 0);
    this.material = new THREE.MeshBasicMaterial({
      color: 0xdcf6ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.material.defines = { USE_UV: "" };
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.time = this.timeU;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float time;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          // 扭转 + 摆动（参考 WaterSpouts 的顶点注入）
          float twist = uv.y * 5.0 + time * 0.6;
          float s = sin(twist);
          float c = cos(twist);
          transformed.xz = mat2(c, -s, s, c) * transformed.xz;
          transformed.x += sin(time * 1.7 + uv.y * 3.2) * 2.4 * uv.y;
          transformed.z += cos(time * 1.4 + uv.y * 3.9) * 2.4 * uv.y;`);
    };
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = "city-sea-spout";
    this.mesh.position.set(center.x, 0, center.z);
  }

  update(dt: number, elapsed: number): void {
    this.timeU.value += dt;
    // 缓慢绕锚点漂移 + 周期性隐现（~50s 一轮）。
    const cycle = (elapsed * this.speed + this.phase) % (Math.PI * 2);
    const presence = Math.max(0, Math.sin(cycle));
    this.material.opacity = 0.38 * presence;
    this.mesh.visible = presence > 0.03;
    // 位置不论隐现都写：曾隐藏时提前返回，矩阵停在上一次可见的样子，两次导出不同。
    const orbit = elapsed * 0.03 + this.phase;
    const x = this.center.x + Math.cos(orbit) * 18 + this.drift.x * Math.sin(elapsed * 0.05 + this.phase) * 30;
    const z = this.center.z + Math.sin(orbit) * 18 + this.drift.z * Math.sin(elapsed * 0.05 + this.phase) * 30;
    this.mesh.position.set(x, this.terrainHeight(x, z), z);
    this.mesh.rotation.y = elapsed * 0.5 + this.phase;
  }

  reset(): void {
    this.timeU.value = 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}

/** 热气球：球+筐低模，缓慢上升漂移，升出视野后从低处重来。 */
class HotAirBalloon {
  readonly group = new THREE.Group();
  private readonly envelope: THREE.Mesh;
  private readonly baseY: number;
  private readonly rise: number;
  private readonly sway: number;
  private t: number;
  private readonly t0: number;
  private readonly spawn: { x: number; z: number };

  constructor(spawn: { x: number; z: number }, color: string, seed: number) {
    this.t = seed * 120;
    this.t0 = this.t;
    this.spawn = { ...spawn };
    this.rise = 1.6 + seed * 1.4;
    this.sway = 0.4 + seed * 0.6;
    this.baseY = 70 + seed * 40;
    const envelopeGeometry = new THREE.SphereGeometry(9, 14, 12).scale(1, 1.18, 1);
    const envelopeMaterial = new THREE.MeshLambertMaterial({ color });
    this.envelope = new THREE.Mesh(envelopeGeometry, envelopeMaterial);
    this.envelope.position.y = 10;
    this.envelope.castShadow = true;
    const basketGeometry = new THREE.BoxGeometry(3.4, 2.6, 3.4);
    const basketMaterial = new THREE.MeshLambertMaterial({ color: "#8a6a4c" });
    const basket = new THREE.Mesh(basketGeometry, basketMaterial);
    const ropesGeometry = new THREE.BoxGeometry(3.0, 5.2, 3.0);
    const ropesMaterial = new THREE.MeshLambertMaterial({ color: "#5d5648", transparent: true, opacity: 0.55 });
    const ropes = new THREE.Mesh(ropesGeometry, ropesMaterial);
    ropes.position.y = 3.6;
    this.group.add(this.envelope, basket, ropes);
    this.group.position.set(spawn.x, this.baseY, spawn.z);
    this.group.name = "city-hot-air-balloon";
    this.geometries = [envelopeGeometry, basketGeometry, ropesGeometry];
    this.materials = [envelopeMaterial, basketMaterial, ropesMaterial];
  }

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  /** 位置是逐帧积分的（x/z += sway），重置必须连位置一起放回出生点。 */
  reset(): void {
    this.t = this.t0;
    this.group.position.set(this.spawn.x, this.baseY, this.spawn.z);
    this.group.rotation.set(0, 0, 0);
  }

  update(dt: number): void {
    this.t += dt;
    this.group.position.y = this.baseY + Math.sin(this.t * 0.05 * this.rise) * 55;
    this.group.position.x += Math.sin(this.t * 0.03) * 0.16 * this.sway;
    this.group.position.z += Math.cos(this.t * 0.026) * 0.14 * this.sway;
    this.group.rotation.z = Math.sin(this.t * 0.11) * 0.05;
    this.group.rotation.x = Math.cos(this.t * 0.09) * 0.04;
  }

  dispose(): void {
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.group.removeFromParent();
  }
}

/** 夜间水上浮灯：暖光小灯 instanced，随夜色淡入，缓慢升空漂移（参考 FloatingLanterns）。 */
class NightLanterns {
  readonly mesh: THREE.InstancedMesh;
  private readonly lanterns: Array<{ x: number; z: number; y: number; y0: number; rise: number; drift: number; phase: number }> = [];
  private night = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();

  constructor(center: { x: number; z: number }, radius: number, river: Array<{ x: number; z: number }> | null, count = 42) {
    const geometry = new THREE.SphereGeometry(1.1, 8, 6);
    const material = new THREE.MeshBasicMaterial({ color: "#ffca7a", transparent: true, opacity: 0, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.frustumCulled = false;
    this.mesh.name = "city-night-lanterns";
    this.mesh.visible = false;
    for (let index = 0; index < count; index += 1) {
      const seed = hashSeed(`lantern:${index}`);
      let x: number;
      let z: number;
      if (river && river.length > 4 && index % 2 === 0) {
        const point = river[Math.floor(seed * river.length)];
        x = point.x + (seed - 0.5) * 26;
        z = point.z + (hashSeed(`lz:${index}`) - 0.5) * 26;
      } else {
        const angle = seed * Math.PI * 2;
        const reach = radius * (0.9 + hashSeed(`lr:${index}`) * 0.5);
        x = center.x + Math.cos(angle) * reach;
        z = center.z + Math.sin(angle) * reach;
      }
      this.lanterns.push({ x, z, y: 3 + seed * 6, y0: 3 + seed * 6, rise: 0.5 + hashSeed(`lri:${index}`) * 0.9, drift: seed * Math.PI * 2, phase: seed * Math.PI * 2 });
    }
    this.geometry = geometry;
    this.material = material;
  }

  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.Material & { opacity: number };

  setNight(night: number): void {
    this.night = night;
    this.material.opacity = 0.9 * night;
    this.mesh.visible = night > 0.03;
  }

  reset(): void {
    for (const lantern of this.lanterns) lantern.y = lantern.y0;
  }

  // 白天也推进与写矩阵（42 个实例，开销可忽略）：曾只在夜里写，矩阵留着上一个夜晚的样子。
  update(dt: number, elapsed: number): void {
    this.lanterns.forEach((lantern, index) => {
      lantern.y += lantern.rise * dt * 1.6;
      if (lantern.y > 90) lantern.y = 2.5;
      const bob = Math.sin(elapsed * 0.5 + lantern.phase) * 0.8;
      this.position.set(lantern.x + Math.sin(elapsed * 0.04 + lantern.drift) * 9, lantern.y + bob, lantern.z + Math.cos(elapsed * 0.05 + lantern.drift) * 9);
      const pulse = 0.8 + 0.25 * Math.sin(elapsed * 1.6 + lantern.phase);
      this.scale.setScalar(pulse);
      this.quaternion.identity();
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.mesh.setMatrixAt(index, this.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}

/** 引擎侧的统一入口：创建/更新/昼夜联动/释放。 */
export class CityAmbient {
  private readonly spouts: SeaSpout[] = [];
  private readonly balloons: HotAirBalloon[] = [];
  private lanterns: NightLanterns | null = null;
  readonly group = new THREE.Group();

  constructor(center: { x: number; z: number }, radius: number, terrainHeight: (x: number, z: number) => number, river: Array<{ x: number; z: number }> | null) {
    // 两个水龙卷锚在城外海面（对角方向）。
    for (let index = 0; index < 2; index += 1) {
      const angle = index * 2.4 + 0.7;
      const reach = radius * 1.55;
      const spout = new SeaSpout({ x: center.x + Math.cos(angle) * reach, z: center.z + Math.sin(angle) * reach }, angle, hashSeed(`spout:${index}`), terrainHeight);
      this.spouts.push(spout);
      this.group.add(spout.mesh);
    }
    // 三只热气球从城边低空起。
    const palette = ["#d96a4e", "#4e96b8", "#d9a94e"];
    for (let index = 0; index < 3; index += 1) {
      const seed = hashSeed(`balloon:${index}`);
      // 三只按 120° 分开再加抖动：曾 angle = seed·2π，固定字符串的哈希恰好挤在一起，三个气球叠成一团。
      const angle = (index / 3) * Math.PI * 2 + seed * 0.9;
      const reach = radius * (0.5 + ((index * 0.37 + seed) % 1) * 0.45);
      const balloon = new HotAirBalloon({ x: center.x + Math.cos(angle) * reach, z: center.z + Math.sin(angle) * reach }, palette[index], seed);
      this.balloons.push(balloon);
      this.group.add(balloon.group);
    }
    this.lanterns = new NightLanterns(center, radius, river);
    this.group.add(this.lanterns.mesh);
  }

  setNight(night: number): void {
    this.lanterns?.setNight(night);
  }

  /** 所有随帧累加的状态回到构造时（胶片导出开拍前）。 */
  reset(): void {
    this.spouts.forEach((spout) => spout.reset());
    this.balloons.forEach((balloon) => balloon.reset());
    this.lanterns?.reset();
  }

  update(dt: number, elapsed: number): void {
    for (const spout of this.spouts) spout.update(dt, elapsed);
    for (const balloon of this.balloons) balloon.update(dt);
    this.lanterns?.update(dt, elapsed);
  }

  dispose(): void {
    this.spouts.forEach((spout) => spout.dispose());
    this.balloons.forEach((balloon) => balloon.dispose());
    this.lanterns?.dispose();
    this.group.removeFromParent();
  }
}
