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
        float layer(vec2 uv, float scale, float speed, float slant) {
          vec2 p = vec2(uv.x * uAspect * scale + uv.y * slant, uv.y * scale);
          p.y += uTime * speed;
          float column = floor(p.x);
          float rnd = fract(sin(column * 127.1) * 43758.5453);
          float across = abs(fract(p.x) - 0.5) * 2.0;
          float y = fract(p.y + rnd * 7.0);
          float len = 0.18 + rnd * 0.22;
          float shape = smoothstep(0.0, 0.25, y) * smoothstep(len, len - 0.12, y) * smoothstep(0.55, 0.1, across);
          return shape * step(0.8, rnd);
        }
        void main() {
          float rain = layer(vUv, 20.0, 9.0, 0.32) * 0.5
                     + layer(vUv, 34.0, 13.0, 0.42) * 0.34
                     + layer(vUv, 54.0, 17.0, 0.5) * 0.22;
          gl_FragColor = vec4(0.72, 0.78, 0.86, rain * uAmount);
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
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 1.4;
    this.mesh.scale.set(half * 2 * camera.aspect, half * 2, 1);
    this.mesh.quaternion.copy(camera.quaternion);
    this.mesh.position.copy(camera.position).addScaledVector(this.forward.set(0, 0, -1).applyQuaternion(camera.quaternion), 1.4);
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
