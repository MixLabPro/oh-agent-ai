/**
 * 城市天气（tinyskies RainOverlay/RainbowArch 手法，作者授权参考）：
 *  · 按日期哈希确定性生成——回放同一天必现同天气（流星夜同款纪律）；
 *  · 三态：clear 62% / overcast 20% / rain 18%，一天内恒定、首尾 1.5h 平滑过渡；
 *  · 雨后清晨出彩虹（昨日降雨 + 当日哈希，50%），上午渐隐；
 *  · 渲染层：程序化雨丝屏幕层（玻璃水珠折射版需要读帧缓冲，太贵不搬）+ 光谱弧。
 *  天气是纯装饰（同气球/流星），不映射任何数据语义。
 */

import * as THREE from "three";
import { hashSeed } from "../cityModel";

export type WeatherKind = "clear" | "overcast" | "rain";
export type WeatherState = { kind: WeatherKind; intensity: number; rainbow: number; overcast: number };

const RAIN_THRESHOLD = 0.82;
const OVERCAST_THRESHOLD = 0.62;

/** 某时刻的天气。ms 为回放游标或真实时钟。 */
export function weatherAt(ms: number): WeatherState {
  const dayIndex = Math.floor(ms / 86_400_000);
  const hour = (ms / 3_600_000) % 24;
  // 顺序日期先过一次 Knuth 混淆再入哈希：FNV 对「末位数字 +1」的字符串雪崩
  // 不足，直接哈希会让相邻日期的天气强相关（实测连出十几天的同种天气）。
  const roll = hashSeed(`weather:${(Math.imul(dayIndex, 2654435761) ^ 0x9e3779b9) >>> 0}`);
  const kind: WeatherKind = roll < OVERCAST_THRESHOLD ? "clear" : roll < RAIN_THRESHOLD ? "overcast" : "rain";
  // 首尾 1.5 小时包络：跨日不跳变，日内恒定。
  const envelope = Math.max(0, Math.min(1, Math.min(hour / 1.5, (24 - hour) / 1.5)));
  const intensity = kind === "clear" ? 0 : envelope;
  const overcast = kind === "clear" ? 0 : envelope * (kind === "rain" ? 1 : 0.72);
  const yesterdayRained = hashSeed(`weather:${(Math.imul(dayIndex - 1, 2654435761) ^ 0x9e3779b9) >>> 0}`) >= RAIN_THRESHOLD;
  const rainbow = yesterdayRained && hashSeed(`bow:${dayIndex}`) < 0.5 ? Math.max(0, Math.min(1, (11 - hour) / 2.5)) : 0;
  return { kind, intensity, overcast, rainbow };
}

/** 屏幕空间雨丝：相机前方跟随的四边形 + 程序化斜雨（三层不同密度/速度/倾角）。 */
export class RainOverlay {
  readonly mesh: THREE.Mesh;
  private readonly uniforms: { uTime: { value: number }; uAmount: { value: number }; uAspect: { value: number } };

  constructor() {
    this.uniforms = { uTime: { value: 0 }, uAmount: { value: 0 }, uAspect: { value: 1 } };
    const material = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uAmount;
        uniform float uAspect;
        varying vec2 vUv;
        float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
        // 一层雨丝：细长、略斜的线段。曾是「格宽一半 × 格高 0.2–0.4」的方块且严格居中在固定列上、
        // 同层同速——画面上是一排排整齐的白方块（用户：「这是下雪吗？」）。
        // 现在：每列各自的下落速度与相位；每滴各自的横向偏移、长度、有无；线宽只占格宽的 ~7%。
        float layer(vec2 uv, float scale, float speed, float slant, float seed) {
          vec2 p = vec2(uv.x * uAspect * scale + uv.y * slant, uv.y * scale * 0.22);
          float column = floor(p.x);
          float colSpeed = 0.7 + 0.6 * h1(column + seed * 3.1);
          p.y += uTime * speed * colSpeed + h1(column * 1.7 + seed) * 11.0;
          float cell = floor(p.y);
          float drop = h1(column * 13.1 + cell * 7.7 + seed);
          float offset = (h1(column * 5.3 + cell * 3.3 + seed + 1.9) - 0.5) * 0.7;
          float across = abs(fract(p.x) - 0.5 - offset);
          float y = fract(p.y);
          float len = 0.3 + drop * 0.4;
          float shape = smoothstep(0.0, 0.12, y) * smoothstep(len, len - 0.15, y) * (1.0 - smoothstep(0.012, 0.04, across));
          return shape * step(0.5, drop);
        }
        void main() {
          float rain = layer(vUv, 26.0, 8.0, 0.32, 0.0) * 0.55
                     + layer(vUv, 44.0, 11.0, 0.42, 17.0) * 0.4
                     + layer(vUv, 70.0, 14.0, 0.5, 41.0) * 0.28;
          gl_FragColor = vec4(0.86, 0.9, 0.96, min(1.0, rain * uAmount * 1.4));
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.mesh.name = "city-rain";
    this.mesh.renderOrder = 90;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  setAspect(width: number, height: number): void {
    this.uniforms.uAspect.value = Math.max(0.2, width / Math.max(1, height));
  }

  setAmount(amount: number): void {
    this.uniforms.uAmount.value = amount;
    this.mesh.visible = amount > 0.02;
  }

  /** 每帧贴在相机前方（相机不进场景图，四边形手动跟随）。 */
  update(dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    if (!this.mesh.visible) return;
    this.uniforms.uTime.value = elapsed;
    void dt;
    // 四边形必须在近裁剪面之外：曾放在相机前 1.4，而相机 near = 1.5，雨丝层永远被裁掉——雨天从来没下过雨。
    const distance = Math.max(3, camera.near * 2);
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance;
    this.mesh.scale.set(half * 2 * camera.aspect, half * 2, 1);
    this.mesh.quaternion.copy(camera.quaternion);
    this.mesh.position.copy(camera.position).addScaledVector(this.forward.set(0, 0, -1).applyQuaternion(camera.quaternion), distance);
  }

  private readonly forward = new THREE.Vector3();

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}

/** 雨后彩虹：海平面上空的半圆光谱弧，反太阳方位，强度随上午渐隐（weatherAt 给出）。 */
export class RainbowArch {
  readonly mesh: THREE.Mesh;
  private readonly uniforms: { uOpacity: { value: number } };

  constructor(radius: number) {
    this.uniforms = { uOpacity: { value: 0 } };
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec2 vUv;
        vec3 band(float t) {
          // 光谱：外缘紫 → 内缘红，只在环带内可见（RingGeometry 的 uv.y 跨越环宽）。
          vec3 spectrum[6] = vec3[6](
            vec3(0.55, 0.35, 0.75), vec3(0.35, 0.5, 0.85), vec3(0.4, 0.7, 0.9),
            vec3(0.5, 0.85, 0.6), vec3(0.95, 0.8, 0.4), vec3(0.95, 0.45, 0.4)
          );
          float f = clamp(t, 0.0, 1.0) * 5.0;
          int i = int(f);
          return mix(spectrum[i], spectrum[min(i + 1, 5)], fract(f));
        }
        void main() {
          float edge = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.78, vUv.y);
          gl_FragColor = vec4(band(vUv.y) * edge * 0.8, edge * uOpacity);
        }`,
    });
    const geometry = new THREE.RingGeometry(radius * 0.78, radius, 48, 1, 0, Math.PI);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = "city-rainbow";
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** 摆到反太阳方位的海平面上空。 */
  set(amount: number, sunAzimuth: number, center: { x: number; z: number }, distance: number): void {
    this.uniforms.uOpacity.value = amount * 0.55;
    this.mesh.visible = amount > 0.02;
    if (!this.mesh.visible) return;
    const opposite = sunAzimuth + Math.PI;
    this.mesh.position.set(center.x + Math.cos(opposite) * distance, -18, center.z + Math.sin(opposite) * distance);
    this.mesh.lookAt(center.x, this.mesh.position.y, center.z);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}
