import * as THREE from "three";
import type { CarPath } from "./types";

export const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

/** 单位圆柱（半径 1、高 1、底面为原点）：sx/sz 当半径、sy 当高度。 */
export const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 14).translate(0, 0.5, 0);
/** 区界高架桥面：BOX 底面在 DECK_Y、厚 DECK_THICKNESS，行车面在两者之和。
 *  路灯曾按 8.2（板底）立杆，光斑埋进桥面板、又因半径大于半幅桥宽漏到桥下地面。 */
export const EXPRESSWAY_DECK_Y = 8.2;
export const EXPRESSWAY_DECK_THICKNESS = 0.9;
export const EXPRESSWAY_DECK_WIDTH = 10.5;
export const EXPRESSWAY_DECK_TOP = EXPRESSWAY_DECK_Y + EXPRESSWAY_DECK_THICKNESS;
/** 高架两端的匝道长度：环线在海岸/山体处断开成几段，段尾曾悬在 8.2 高的半空、下面是沙地（拍照实测）。 */
export const EXPRESSWAY_RAMP = 90;

/** 每个折线点处的桥面底高：两端各 EXPRESSWAY_RAMP 内平滑落到地面以上 0.3，中段保持 EXPRESSWAY_DECK_Y。 */
export function expresswayDeckHeights(points: Array<{ x: number; z: number }>, groundAt: (x: number, z: number) => number): number[] {
  const along: number[] = [0];
  for (let i = 1; i < points.length; i += 1) along.push(along[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  const total = along[along.length - 1] || 1;
  const closed = Math.hypot(points[0].x - points[points.length - 1].x, points[0].z - points[points.length - 1].z) < 0.01;
  return points.map((point, i) => {
    if (closed) return EXPRESSWAY_DECK_Y;
    const edge = Math.min(along[i], total - along[i]);
    const u = Math.min(1, edge / EXPRESSWAY_RAMP);
    const ease = u * u * (3 - 2 * u);
    const ground = Math.max(0, groundAt(point.x, point.z)) + 0.3 - EXPRESSWAY_DECK_THICKNESS;
    return ground + (EXPRESSWAY_DECK_Y - ground) * ease;
  });
}

/** 带「按自身颜色补自发光」的白底材质（颜色来自实例色）：彩色环境光下保住执行环境色相。 */
export function selfLitMaterial(amount: number): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ color: "#ffffff" });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * ${amount.toFixed(3)};`);
  };
  material.customProgramCacheKey = () => `city-self-lit-${amount.toFixed(3)}`;
  return material;
}

export function samplePolyline(path: CarPath, distance: number): { x: number; z: number; dx: number; dz: number } {
  const d = ((distance % path.total) + path.total) % path.total;
  let index = 1;
  while (index < path.cumulative.length - 1 && path.cumulative[index] < d) index += 1;
  const segmentStart = path.points[index - 1];
  const segmentEnd = path.points[index];
  const segmentLength = path.cumulative[index] - path.cumulative[index - 1] || 1;
  const t = (d - path.cumulative[index - 1]) / segmentLength;
  return {
    x: segmentStart.x + (segmentEnd.x - segmentStart.x) * t,
    z: segmentStart.z + (segmentEnd.z - segmentStart.z) * t,
    dx: (segmentEnd.x - segmentStart.x) / segmentLength,
    dz: (segmentEnd.z - segmentStart.z) / segmentLength,
  };
}

/** 动画起点：车/船/云/旋转件第一次出现时的状态。它们在静态缓存里跨实例共享、每帧原地累加，
 *  所以起点按对象记在模块级 WeakMap，只在第一次见到时写入——之后的任何实例都能把它们放回原位。
 *  胶片导出靠它从同一个状态开拍（曾经接着实时循环的状态开拍：同一座城两次导出从第 ~17 帧开始逐像素不同）。 */
const animationOrigin = new WeakMap<object, number>();
const carBaseSpeed = new WeakMap<object, number>();
/** 车的原速：第一次见到时记下（构造时 speed 还是原值），低画质藏车不再丢失它。 */
export function baseSpeedOf(car: { speed: number }): number {
  if (!carBaseSpeed.has(car)) carBaseSpeed.set(car, car.speed);
  return carBaseSpeed.get(car) as number;
}
export function originOf(owner: object, value: number): number {
  if (!animationOrigin.has(owner)) animationOrigin.set(owner, value);
  return animationOrigin.get(owner) as number;
}

/** 简易几何合并（部件都是 position/normal/uv 布局，不值得引 utils）。 */
export function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"] as const) {
    const first = geometries[0].getAttribute(name);
    if (!first) continue;
    const combined = new Float32Array(geometries.reduce((sum, geometry) => sum + (geometry.getAttribute(name)?.array.length ?? 0), 0));
    let offset = 0;
    for (const geometry of geometries) {
      const attribute = geometry.getAttribute(name);
      if (!attribute) continue;
      combined.set(attribute.array as Float32Array, offset);
      offset += attribute.array.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(combined, first.itemSize));
  }
  const indices: number[] = [];
  let vertexOffset = 0;
  for (const geometry of geometries) {
    if (geometry.index) {
      for (const index of geometry.index.array as unknown as number[]) indices.push(index + vertexOffset);
    } else {
      for (let index = 0; index < geometry.getAttribute("position").count; index += 1) indices.push(index + vertexOffset);
    }
    vertexOffset += geometry.getAttribute("position").count;
  }
  merged.setIndex(indices);
  return merged;
}
