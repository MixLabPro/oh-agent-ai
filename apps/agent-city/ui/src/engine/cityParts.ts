/**
 * 城市部件：把 CityModel + CityLayout 变成 Three.js 场景（全部 InstancedMesh）。
 *
 * 一次模型刷新 = 一次 buffer 重建（毫秒级）；每帧只做增量：
 *  · 施工动画：只有显示进度在变的楼才重写矩阵（脏集驱动）。
 *  · 生命感：车 / 船 / 云 / 吊车 / 信标脉冲，均为常数成本的小矩阵更新。
 *  · 水面：自写轻量 shader（解析法线 + 菲涅尔 + 伪高光），不做反射/折射。
 */

import * as THREE from "three";
import { builtFractionAt, hashSeed, type CityBuilding, type CityModel } from "../cityModel";
import { MIAMI_COASTAL, promenadeSegments, validRuns } from "./citySeaside";
import { fbm } from "./cityNoise";
import type { CityLayout, DistrictLayout, Parcel, Vec2 } from "./cityLayout";
import { activeTheme, skyYawOf } from "./cityTheme";
import type { CityAssets } from "./cityAssets";
import type { LoadedFlora } from "./cityFlora";
import { decorKindForName } from "./cityDecor";
import { makeCityTexture, makeDecoFacadeTexture, makeFacadeTexture, makeLabelSprite, paletteFor } from "./cityTextures";
import type { TerrainField } from "./cityLayout";
import { createRenderCanvas } from "./renderCanvas";
import { SegmentIndex } from "./cityPlan";
import { roadPaintPlan } from "./cityRoadPaint";

const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
/** Low-poly Art Deco tower silhouette: chamfered corners, podium, and stepped crown. */
function artDecoTowerGeometry(): THREE.BufferGeometry {
  const profiles: Array<[number, number]> = [
    [0, 0.92], [0.08, 1], [0.14, 0.88], [0.82, 0.88],
    [0.9, 0.78], [0.95, 0.68], [1, 0.68],
  ];
  const corners: Array<[number, number]> = [
    [-0.36, -0.5], [0.36, -0.5], [0.5, -0.36], [0.5, 0.36],
    [0.36, 0.5], [-0.36, 0.5], [-0.5, 0.36], [-0.5, -0.36],
  ];
  const positions: number[] = []; const uvs: number[] = []; const indices: number[] = [];
  profiles.forEach(([y, scale], ring) => corners.forEach(([x, z], corner) => {
    positions.push(x * scale, y, z * scale);
    uvs.push(corner / corners.length, y);
    if (ring > 0) {
      const previous = (ring - 1) * corners.length + corner;
      const next = (ring - 1) * corners.length + (corner + 1) % corners.length;
      const current = ring * corners.length + corner;
      const currentNext = ring * corners.length + (corner + 1) % corners.length;
      indices.push(previous, current, currentNext, previous, currentNext, next);
    }
  }));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
/** 单位圆柱（半径 1、高 1、底面为原点）：sx/sz 当半径、sy 当高度。 */
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 14).translate(0, 0.5, 0);
/** 区界高架桥面：BOX 底面在 DECK_Y、厚 DECK_THICKNESS，行车面在两者之和。
 *  路灯曾按 8.2（板底）立杆，光斑埋进桥面板、又因半径大于半幅桥宽漏到桥下地面。 */
const EXPRESSWAY_DECK_Y = 8.2;
const EXPRESSWAY_DECK_THICKNESS = 0.9;
const EXPRESSWAY_DECK_WIDTH = 10.5;
const EXPRESSWAY_DECK_TOP = EXPRESSWAY_DECK_Y + EXPRESSWAY_DECK_THICKNESS;
/** 高架两端的匝道长度：环线在海岸/山体处断开成几段，段尾曾悬在 8.2 高的半空、下面是沙地（拍照实测）。 */
const EXPRESSWAY_RAMP = 90;

/** 每个折线点处的桥面底高：两端各 EXPRESSWAY_RAMP 内平滑落到地面以上 0.3，中段保持 EXPRESSWAY_DECK_Y。 */
function expresswayDeckHeights(points: Array<{ x: number; z: number }>, groundAt: (x: number, z: number) => number): number[] {
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

export type QualityLevel = 0 | 1 | 2;

type BuildingRuntime = {
  building: CityBuilding;
  slot: Parcel;
  /** 渲染立面（地块分区驱动，覆盖模型层 hash）。 */
  facade: number;
  /** 地基海拔：楼底、吊车、选中环的基准 y。 */
  groundY: number;
  paletteWall: THREE.Color;
  display: number;
  target: number;
  /** 上一份渲染对象里已有高度（分页/刷新回访的楼）：重建不重演生长；
   *  false = 本轮新到的楼，display 从 0 长入（懒加载的「逐步更新到完整城市」）。 */
  settled: boolean;
  district: DistrictLayout;
  shaftPrimary: number;
  shaftUpper: number;
  podium: number;
  roof: number;
  scaffold: number;
  antenna: number;
  beacon: number;
  craneMast: number;
  craneArm: number;
  cranePhase: number;
  /** 吊车立柱的世界坐标：applyConstruction 按地块 yaw 与楼宽算出，逐帧的吊臂旋转复用同一份。 */
  craneX: number;
  craneZ: number;
  blinkPhase: number;
  /** 装饰艺术附件实例起点（-1 = 不是海滨装饰楼）：corner 用 decoCornerMesh[i]，trim 用 decoTrimMesh[2i, 2i+1]。 */
  deco: number;
  /** 屋顶轮廓：0 平顶 / 1 坡顶 / 2 尖顶 / 3 退台冠 / 4 屋顶花园。只由 (分区, 楼型, seed) 决定，确定性。 */
  roofKind: number;
  /** 全城 token 最多的会话：专属冠顶 + 灯环 + 光束。 */
  hero: boolean;
};

/** terrain 非空 → 车贴地行驶；桥面路径 terrain 为空、y 固定。 */
type CarPath = { points: Vec2[]; cumulative: number[]; total: number; y: number; terrain: TerrainField | null };
type Car = { path: CarPath; distance: number; speed: number };

/** 每块立面平铺里的窗格数（列 × 行）：与 makeFacadeTexture 画的窗格对齐，亮灯按窗格取 hash。 */
const FACADE_GRIDS: Array<[number, number]> = [[5, 4], [1, 4], [4, 4], [1, 2]];

type FacadeUniforms = {
  uRows: { value: number };
  uPhoto: { value: number };
  uPhotoTex: { value: THREE.Texture | null };
  uPhotoRows: { value: number };
  uTileWidth: { value: number };
  uSelfLit: { value: number };
  /** 夜里亮窗：0 = 全灭，≈1 = 夜档（每扇窗按 hash 决定亮不亮，只发光窗格、墙面不发光）。 */
  uWindowGlow: { value: number };
  uGrid: { value: THREE.Vector2 };
  /** 玻璃反射：天空全景（与天空球、水面同一张图、同一套调色），只作用在窗格上。 */
  uEnv: { value: THREE.Texture | null };
  uEnvStrength: { value: number };
  uGradeTop: { value: THREE.Color };
  uGradeHorizon: { value: THREE.Color };
  uGradeAmount: { value: number };
  uSkyYaw: { value: number };
};

/** 带「按自身颜色补自发光」的白底材质（颜色来自实例色）：彩色环境光下保住执行环境色相。 */
function selfLitMaterial(amount: number): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ color: "#ffffff" });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * ${amount.toFixed(3)};`);
  };
  material.customProgramCacheKey = () => `city-self-lit-${amount.toFixed(3)}`;
  return material;
}

/** 立面材质：程序化窗格贴图负责「看得出是窗」，照片（可选）只调制材质明暗——
 *  照片立面直接当窗格用时，城市尺度下玻璃幕墙读成瓷砖墙，窄楼读成条形码（两轮截图实测）。
 *  uSelfLit：按自身颜色补一点自发光，日落主题的粉/紫色光会把薄荷、青色楼中和成灰。 */
function facadeMaterial(map: THREE.Texture, uniforms: FacadeUniforms, key: string): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ map });
  // 楼层按实例属性拉伸立面纹理的 v 轴：一根 InstancedMesh 搞定所有高度。
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aFloors;\nuniform float uRows;\nuniform float uPhotoRows;\nuniform float uTileWidth;\nvarying vec2 vPhotoUv;\nvarying vec3 vFacadeWorld;\nvarying vec3 vFacadeNormal;\nvarying float vBuildSeed;")
      .replace("#include <project_vertex>", `#include <project_vertex>
vFacadeWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
vBuildSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
// 盒子的面法线是轴向的：经实例矩阵（只有 yaw + 缩放）变换后归一化即为世界法线。
vFacadeNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);`)
      // 照片 UV 横向按「这个面的真实宽度 / 一块照片的宽度」平铺。宽度从实例矩阵读：
      // ±x 面的宽是 z 轴缩放，±z 面是 x 轴缩放。
      .replace("#include <uv_vertex>", `#include <uv_vertex>
#ifdef USE_MAP
vec2 baseUv = vMapUv;
vMapUv.y *= aFloors / uRows;
float faceWidth = abs(normal.x) > 0.5 ? length(instanceMatrix[2].xyz) : length(instanceMatrix[0].xyz);
vPhotoUv = vec2(baseUv.x * faceWidth / max(uTileWidth, 1.0), baseUv.y * aFloors / max(uPhotoRows, 1.0));
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
uniform float uPhoto;
uniform sampler2D uPhotoTex;
uniform float uSelfLit;
uniform sampler2D uEnv;
uniform float uEnvStrength;
uniform vec3 uGradeTop;
uniform vec3 uGradeHorizon;
uniform float uGradeAmount;
uniform float uSkyYaw;
varying vec2 vPhotoUv;
varying vec3 vFacadeWorld;
varying vec3 vFacadeNormal;
varying float vBuildSeed;
uniform float uWindowGlow;
uniform vec2 uGrid;
float facadeWindow = 0.0;
float cellHash(vec2 c, float s) { return fract(sin(dot(c, vec2(127.1, 311.7)) + s * 91.7) * 43758.5453); }
vec3 facadeSky(vec3 dir) {
  dir = normalize(dir);
  vec2 uv = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5 + uSkyYaw, asin(clamp(dir.y, 0.002, 1.0)) / 3.1415927 + 0.5);
  vec3 photo = texture2D(uEnv, uv).rgb;
  vec3 tint = mix(uGradeHorizon, uGradeTop, smoothstep(0.0, 0.6, max(dir.y, 0.0)));
  return mix(photo, photo * tint * 1.55, uGradeAmount);
}`)
      .replace("#include <map_fragment>", `#ifdef USE_MAP
  vec4 facadeTexel = texture2D( map, vMapUv );
  // 窗格遮罩：程序化立面里窗是暗格、墙是亮底。只让窗反光——整面反光的楼像一面镜子。
  facadeWindow = 1.0 - smoothstep(0.22, 0.5, dot(facadeTexel.rgb, vec3(0.2126, 0.7152, 0.0722)));
  diffuseColor *= facadeTexel;
  if (uPhoto > 0.5) {
    float l = dot(texture2D(uPhotoTex, vPhotoUv).rgb, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb *= mix(0.8 + 0.45 * smoothstep(0.03, 0.5, l), 1.0, facadeWindow);
  }
#endif`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * uSelfLit;
// 夜里亮窗：只有窗格发光，每扇窗按 (楼, 窗格) hash 决定亮不亮，暖黄/冷白两种灯色；墙面保持暗。
// 曾把 uSelfLit 抬到 0.58 作用在整个立面颜色上——墙和窗一起发光，整栋楼是一块奶白色的纸盒。
if (uWindowGlow > 0.02) {
  vec2 cell = floor(vec2(vMapUv.x * uGrid.x, vMapUv.y * uGrid.y));
  float on = step(cellHash(cell, vBuildSeed), (0.28 + 0.5 * vBuildSeed) * smoothstep(0.1, 0.95, uWindowGlow));
  float warm = step(0.35, cellHash(cell + 17.0, vBuildSeed));
  vec3 lamp = mix(vec3(0.62, 0.8, 1.0), vec3(1.0, 0.72, 0.36), warm);
  totalEmissiveRadiance += lamp * facadeWindow * on * uWindowGlow * 2.3;
}`)
      // 光照算完之后再混反射：玻璃的颜色主要来自它映出的天空，不受漫反射光的明暗支配。
      .replace("#include <opaque_fragment>", `if (uEnvStrength > 0.0) {
  vec3 viewDir = normalize(vFacadeWorld - cameraPosition);
  vec3 n = normalize(vFacadeNormal);
  vec3 reflected = reflect(viewDir, n);
  // 反射向下看到的是地面/邻楼（环境图里没有）：压暗而不是映天空。
  float skyward = smoothstep(-0.15, 0.25, reflected.y);
  float fresnel = 0.06 + 0.94 * pow(1.0 - max(dot(-viewDir, n), 0.0), 4.0);
  // 俯视时反射多朝下（映地面），只轻压：压太狠玻璃发黑，航拍视角下大部分时间都是这个角度。
  vec3 reflection = facadeSky(reflected) * mix(0.68, 1.0, skyward);
  outgoingLight = mix(outgoingLight, reflection, clamp(facadeWindow * uEnvStrength * (0.35 + 0.65 * fresnel), 0.0, 0.92));
}
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `city-facade-${key}`;
  return material;
}

function polyCumulative(points: Vec2[]): { cumulative: number[]; total: number } {
  const cumulative = [0];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].z - points[index - 1].z);
    cumulative.push(total);
  }
  return { cumulative, total };
}

function samplePolyline(path: CarPath, distance: number): { x: number; z: number; dx: number; dz: number } {
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

/** 静态城（只依赖 seed 的部分：地形/基建/高架/公共设施/地标/远山/树/水面/
 *  车/船/云/花园）。模块级缓存——数据刷新重建时整段复用，重建成本只剩建筑层；
 *  只保留最近一个 seed（换岛时旧静态城整体释放）。 */
/** 夜间照明：路灯灯头（自发光）、地面光斑（加色）、高架灯带。亮度由 setNightGlow 统一驱动。 */
type NightLights = { heads: THREE.MeshBasicMaterial; pools: THREE.MeshBasicMaterial; strips: THREE.MeshBasicMaterial; neon: THREE.MeshBasicMaterial };

/** 动画起点：车/船/云/旋转件第一次出现时的状态。它们在静态缓存里跨实例共享、每帧原地累加，
 *  所以起点按对象记在模块级 WeakMap，只在第一次见到时写入——之后的任何实例都能把它们放回原位。
 *  胶片导出靠它从同一个状态开拍（曾经接着实时循环的状态开拍：同一座城两次导出从第 ~17 帧开始逐像素不同）。 */
const animationOrigin = new WeakMap<object, number>();
const carBaseSpeed = new WeakMap<object, number>();
/** 车的原速：第一次见到时记下（构造时 speed 还是原值），低画质藏车不再丢失它。 */
function baseSpeedOf(car: { speed: number }): number {
  if (!carBaseSpeed.has(car)) carBaseSpeed.set(car, car.speed);
  return carBaseSpeed.get(car) as number;
}
function originOf(owner: object, value: number): number {
  if (!animationOrigin.has(owner)) animationOrigin.set(owner, value);
  return animationOrigin.get(owner) as number;
}

/** 火山体：移植 tinyskies Volcano.ts::buildVolcanoGeometry。原版 S=0.35、H=1.25 的单位尺度换成
 *  「底半径 = radius、火山口高 = rimHeight」；原版的 3D simplex 噪声换成本仓库的 fbm（三轴投影组合）。 */
function volcanoGeometry(radius: number, rimHeight: number, seed: number): THREE.BufferGeometry {
  const S = radius / 1.39; // 原版底半径 (0.24 + 1.15)·S
  const yScale = rimHeight / S; // 原版火山口高 S·H；这里按目标高度换算
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0 * S, 0.88 * S), new THREE.Vector2(0.06 * S, 0.88 * S), new THREE.Vector2(0.09 * S, 0.94 * S),
    new THREE.Vector2(0.12 * S, 0.98 * S), new THREE.Vector2(0.18 * S, 1.0 * S), new THREE.Vector2(0.24 * S, 0.98 * S),
  ];
  const steps = 24;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    profile.push(new THREE.Vector2(0.24 * S + Math.pow(t, 1.6) * 1.15 * S, (1 - t) * 0.98 * S));
  }
  // LatheGeometry 按点序决定面朝向：原版自上而下排点（配 DoubleSide 材质），这里翻成自下而上，单面材质下外侧朝外。
  const geometry = new THREE.LatheGeometry(profile.reverse(), 32);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  // fbm ≈ -1..1；原版 terrainNoise 是 0..1，换算过来（曾直接当 0..1 用，扭曲量翻三倍、山脚戳出黑色尖刺）。
  const noise3 = (x: number, y: number, z: number, octaves: number) => (fbm(x + z * 0.71, y + z * 1.37, seed + 77, octaves) + fbm(z + y * 0.53, x - y * 0.91, seed + 131, octaves)) * 0.25 + 0.5;
  const rimY = S;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i); const y = position.getY(i); const z = position.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 0.001) { position.setY(i, y * yScale); continue; }
    const t = y / rimY;
    const warp = (noise3((x / S) * 4, (y / S) * 4, (z / S) * 4, 4) - 0.5) * 2;
    const slopeBand = Math.sin(t * Math.PI);
    const radialScale = 1 + warp * 0.25 * Math.max(slopeBand, (1 - t) * 0.6);
    position.setX(i, x * radialScale);
    position.setZ(i, z * radialScale);
    position.setY(i, (y + warp * 0.08 * S * slopeBand) * yScale);
  }
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i); const y = position.getY(i) / yScale; const z = position.getZ(i);
    const r = Math.hypot(x, z);
    const t = Math.max(0, y / rimY);
    const cNoise = noise3((x / S) * 10, (y / S) * 10, (z / S) * 10, 3);
    const tMod = Math.max(0, Math.min(1, t + (cNoise - 0.5) * 0.25));
    let c: [number, number, number];
    if (tMod > 0.88 && r < 0.1 * S) c = [0.85, 0.25, 0.05]; // 岩浆芯
    else if (tMod > 0.82) c = [0.16, 0.1, 0.08]; // 焦黑火山口
    else if (tMod > 0.55) { const k = (tMod - 0.55) / 0.27; c = [0.38 + (0.16 - 0.38) * k, 0.24 + (0.1 - 0.24) * k, 0.18 + (0.08 - 0.18) * k]; }
    else { const k = Math.min(1, tMod / 0.55); c = [0.28 + 0.1 * k, 0.32 - 0.08 * k, 0.22 - 0.04 * k]; } // 青褐山脚
    const highlight = (cNoise - 0.5) * 0.1;
    colors[i * 3] = Math.max(0, Math.min(1, c[0] + highlight));
    colors[i * 3 + 1] = Math.max(0, Math.min(1, c[1] + highlight));
    colors[i * 3 + 2] = Math.max(0, Math.min(1, c[2] + highlight));
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

type StaticCity = {
  seed: number;
  landmarkWindows: CityParts["landmarkWindows"];
  lifeguardGlowMaterial: THREE.MeshBasicMaterial | null;
  layout: CityLayout;
  group: THREE.Group;
  disposables: Array<{ dispose: () => void }>;
  water: THREE.Mesh;
  treeMesh: THREE.InstancedMesh;
  carMesh: THREE.InstancedMesh;
  cars: Array<{ path: CarPath; distance: number; speed: number }>;
  boatMesh: THREE.InstancedMesh;
  boats: Array<{ path: CarPath; distance: number; speed: number; phase: number; wakeTimer: number }>;
  wakeMesh: THREE.InstancedMesh;
  wakes: Array<{ x: number; z: number; birth: number; driftX: number; driftZ: number }>;
  cloudMesh: THREE.InstancedMesh;
  clouds: Array<{ x: number; z: number; y: number; speed: number; scale: number }>;
  /** 缓存命中时新实例上这些字段是空的（它们在静态构建里赋值）：地面素材/水面倒影与夜间开关/摩天轮旋转/夜间灯光都要随缓存带回。 */
  terrainUniforms: Record<string, { value: unknown }> | null;
  /** 旗帜摆动的时间 uniform：材质经缓存共享，uniform 对象也必须随缓存带回。 */
  flagTime: { value: number } | null;
  waterAssetUniforms: Record<string, { value: unknown }> | null;
  landmarkSpinners: Array<{ object: THREE.Object3D; axis: "x" | "y" | "z"; speed: number }>;
  nightLights: NightLights | null;
  context: { bodies: THREE.InstancedMesh; crowns: THREE.InstancedMesh; matrices: Float32Array } | null;
};
let staticCityCache: StaticCity | null = null;

export class CityParts {
  readonly group = new THREE.Group();
  readonly raycastTargets: THREE.Object3D[] = [];
  readonly water: THREE.Mesh;
  private readonly runtimes: BuildingRuntime[] = [];
  private readonly runtimeById = new Map<string, BuildingRuntime>();
  private readonly shaftMeshes: THREE.InstancedMesh[] = [];
  private zoneById: Map<string, string> = new Map();
  private readonly shaftIdByInstance: Array<Map<number, string>> = [];
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly podiumMesh: THREE.InstancedMesh;
  private readonly roofMesh: THREE.InstancedMesh;
  private readonly facadeUniforms: FacadeUniforms[] = [];
  /** 海滨装饰艺术低层楼的附件：圆角转角柱、顶部阶梯女儿墙、底层遮阳棚（每栋 3 个实例）。 */
  private readonly decoTrimMesh: THREE.InstancedMesh;
  /** 屋顶轮廓网格（下标 = runtime.roof；不是这种轮廓的实例缩成 0）。 */
  private readonly roofProfiles: THREE.InstancedMesh[] = [];
  private readonly gardenTreeMesh: THREE.InstancedMesh;
  /** 城市配套（学校/商场/医院）：每个部件记住所属配套与「满高」矩阵参数，按落成进度纵向长出来。 */
  private civicPieces: Array<{ civic: number; mesh: 0 | 1 | 2; index: number; x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw: number; baseY: number }> = [];
  private civicMeshes: THREE.InstancedMesh[] = [];
  private civicProgress: number[] = [];
  private civicTarget: number[] = [];
  private heroParts: { spire: THREE.Mesh; rings: THREE.Mesh[]; beam: THREE.Mesh | null } | null = null;
  private readonly decoCornerMesh: THREE.InstancedMesh;
  private nightLights: NightLights | null = null;
  private terrainUniforms: Record<string, { value: unknown }> | null = null;
  private flagTime: { value: number } | null = null;
  private waterAssetUniforms: Record<string, { value: unknown }> | null = null;
  /** 屋顶霓虹描边：比屋顶略大的自发光薄板，露出的一圈即霓虹；仅日落主题。 */
  private readonly neonMesh: THREE.InstancedMesh;
  private readonly scaffoldMesh: THREE.InstancedMesh;
  private readonly antennaMesh: THREE.InstancedMesh;
  private readonly beaconMesh: THREE.InstancedMesh;
  private readonly craneMastMesh: THREE.InstancedMesh;
  private readonly craneArmMesh: THREE.InstancedMesh;
  private readonly treeMesh: THREE.InstancedMesh;
  /** 生态带植被网格（加载完成后替换程序化树；每个树种一个）。 */
  private floraMeshes: THREE.InstancedMesh[] = [];
  /** 地标里会动的部件：摩天轮转盘、灯塔光束。 */
  private landmarkSpinners: Array<{ object: THREE.Object3D; axis: "x" | "y" | "z"; speed: number }> = [];
  private readonly carMesh: THREE.InstancedMesh;
  private carKeep = 1;
  private readonly boatMesh: THREE.InstancedMesh;
  private readonly wakeMesh: THREE.InstancedMesh;
  private readonly wakes: Array<{ x: number; z: number; birth: number; driftX: number; driftZ: number }>;
  private readonly cloudMesh: THREE.InstancedMesh;
  private readonly anomalyMarkers: Array<{ mesh: THREE.Mesh; ring: THREE.Mesh; baseY: number; phase: number }> = [];
  private readonly labels: THREE.Sprite[] = [];
  private readonly hoverRing: THREE.Mesh;
  private readonly selectRing: THREE.Mesh;
  private readonly cars: Car[];
  private readonly boats: Array<{ path: CarPath; distance: number; speed: number; phase: number; wakeTimer: number }>;
  private readonly clouds: Array<{ x: number; z: number; y: number; speed: number; scale: number }>;
  private readonly waterUniforms: { uTime: { value: number }; uSun: { value: THREE.Vector3 }; uShallow: { value: THREE.Color }; uDeep: { value: THREE.Color }; uSky: { value: THREE.Color } };
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scaleVector = new THREE.Vector3();
  private readonly positionVector = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly hsl = { h: 0, s: 0, l: 0 };
  private cursor = Number.NaN;
  private live = true;
  private labelsVisible = true;
  /** 重建前各楼的显示进度（null = 首个模型，全城直接成像）。 */
  private previousDisplays: Map<string, number> | null = null;
  hoveredId: string | null = null;
  selectedId: string | null = null;

  constructor(private model: CityModel, private layout: CityLayout, previousDisplays: Map<string, number> | null = null) {
    this.previousDisplays = previousDisplays;
    const total = model.buildings.length;

    // ── 静态城（seed 决定）：缓存命中则整段复用，重建只花在建筑层 ──────
    let staticCity = staticCityCache && staticCityCache.seed === layout.seed && staticCityCache.layout.scaleTier === layout.scaleTier
      && staticCityCache.layout.coastalConfigKey === layout.coastalConfigKey
      && staticCityCache.layout.activityKey === layout.activityKey // G1：建成区变化 → 地面与路网重画
      && staticCityCache.layout.highways === layout.highways
      && JSON.stringify([staticCityCache.layout.civics, staticCityCache.layout.gardens, staticCityCache.layout.contextBuildings]) === JSON.stringify([layout.civics, layout.gardens, layout.contextBuildings]) ? staticCityCache : null;
    if (!staticCity) {
      staticCityCache?.disposables.forEach((disposable) => disposable.dispose());
      const staticBucket: Array<{ dispose: () => void }> = [];
      (this.disposables as Array<{ dispose: () => void }>) = staticBucket;
      this.buildTerrain();
      this.buildInfrastructure();
      this.buildDistrictExpressways();
      this.nightLights = this.buildNightLights();
      this.buildPublicSites();
      this.buildMarina();
      this.buildCivics();
      this.buildLandmarks();
      this.buildDistrictLandmarks();
      this.buildUrbanContext();
      this.buildSeaMountains();
      this.buildBeachRibbon();
      const seaside = this.layout.seaside;
      if (seaside && !seaside.degraded) this.buildPromenade(promenadeSegments(seaside));
      this.buildPromenade(this.urbanPromenadeSegments());
      // 装饰酒店排已退役：酒店地块交给会话（cityLayout hotelBlocks），只有落户的会话才成楼。
      this.buildLifeguardTowers();
      this.buildBeachFurniture();
      // 酒店招牌随装饰酒店一起退役（它们挂在不存在的楼面上）。
      this.treeMesh = this.buildTrees();
      const carResult = this.buildCars();
      this.carMesh = carResult.mesh;
      const boatResult = this.buildBoats();
      this.boatMesh = boatResult.mesh;
      this.wakeMesh = boatResult.wakeMesh;
      this.wakes = boatResult.wakes;
      const cloudResult = this.buildClouds();
      this.cloudMesh = cloudResult.mesh;
      this.water = this.buildWater();
      this.buildGardens();
      this.buildFlags();
      staticCity = {
        seed: layout.seed,
        layout,
        group: this.group,
        disposables: staticBucket,
        water: this.water,
        treeMesh: this.treeMesh,
        carMesh: this.carMesh,
        cars: carResult.cars,
        boatMesh: this.boatMesh,
        boats: boatResult.boats,
        wakeMesh: this.wakeMesh,
        wakes: boatResult.wakes,
        cloudMesh: this.cloudMesh,
        clouds: cloudResult.clouds,
        terrainUniforms: this.terrainUniforms,
        flagTime: this.flagTime,
        waterAssetUniforms: this.waterAssetUniforms,
        landmarkSpinners: this.landmarkSpinners,
        nightLights: this.nightLights,
        context: this.context,
        landmarkWindows: this.landmarkWindows,
        lifeguardGlowMaterial: this.lifeguardGlowMaterial,
      };
      staticCityCache = staticCity;
      // this.group 曾是静态组：让位给动态组，静态组挂为其子节点。
      (this.group as THREE.Group) = new THREE.Group();
      (this.disposables as Array<{ dispose: () => void }>) = [];
    }
    this.group.add(staticCity.group);
    this.water = staticCity.water;
    this.treeMesh = staticCity.treeMesh;
    this.carMesh = staticCity.carMesh;
    this.boatMesh = staticCity.boatMesh;
    this.cloudMesh = staticCity.cloudMesh;
    this.cars = staticCity.cars;
    this.boats = staticCity.boats;
    this.clouds = staticCity.clouds;
    this.wakeMesh = staticCity.wakeMesh;
    this.wakes = staticCity.wakes;
    this.terrainUniforms = staticCity.terrainUniforms;
    this.flagTime = staticCity.flagTime;
    this.waterAssetUniforms = staticCity.waterAssetUniforms;
    this.landmarkSpinners = staticCity.landmarkSpinners;
    this.nightLights = staticCity.nightLights;
    this.context = staticCity.context;
    // 夜间材质随静态城一起复用：曾只缓存网格不缓存这两个引用，缓存命中后救生塔灯与地标亮窗夜里不再亮。
    this.landmarkWindows = staticCity.landmarkWindows;
    this.lifeguardGlowMaterial = staticCity.lifeguardGlowMaterial;
    this.captureAnimationOrigin();
    this.waterUniforms = (this.water.material as THREE.ShaderMaterial).uniforms as unknown as {
      uTime: { value: number };
      uSun: { value: THREE.Vector3 };
      uShallow: { value: THREE.Color };
      uDeep: { value: THREE.Color };
      uSky: { value: THREE.Color };
    };

    // ── 建筑：立面（3 变体 × [主体+退台] 两段）──────────────────────────
    const facades = [makeFacadeTexture(0, 11), makeFacadeTexture(1, 37), makeFacadeTexture(2, 71), makeDecoFacadeTexture()];
    facades.forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      this.disposables.push(texture);
    });
    // 立面由地块分区驱动：市中心玻璃幕墙 / 商业横带 / 居住窗洞。
    const zoneById = new Map<string, string>();
    for (const district of this.layout.districts) {
      for (const [id, parcel] of district.slots) zoneById.set(id, parcel.zone);
    }
    this.zoneById = zoneById;
    const facadeCounts = [0, 0, 0, 0];
    for (const building of model.buildings) {
      if (!zoneById.has(building.id)) continue;
      facadeCounts[this.facadeFor(building)] += this.formOf(building) === "tower" || this.formOf(building) === "landmark" ? 2 : 1;
    }
    facades.forEach((texture, variant) => {
      const capacity = facadeCounts[variant] + 8;
      const geometry = BOX.clone();
      geometry.setAttribute("aFloors", new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
      // 装饰艺术立面一块平铺画 2 层，其余程序化立面沿用一层一块。
      const uniforms: FacadeUniforms = {
        // 一块纹理覆盖几层楼：程序化立面画的是 4 层（makeFacadeTexture），装饰艺术画 2 层。
        // 曾按「每层一块」铺，每层楼塞进 4 排窗、窗高只有四分之一——窗又扁又小，玻璃反射只落在细缝里。
        uRows: { value: variant === 3 ? 2 : 4 },
        uPhoto: { value: 0 },
        uPhotoTex: { value: null },
        uPhotoRows: { value: 1 },
        uTileWidth: { value: 1 },
        uSelfLit: { value: 0.24 },
        uWindowGlow: { value: 0 },
        uGrid: { value: new THREE.Vector2(...(FACADE_GRIDS[variant] ?? [4, 4])) },
        uEnv: { value: null },
        uEnvStrength: { value: 0 },
        uGradeTop: { value: new THREE.Color(activeTheme().skyGrade.top) },
        uGradeHorizon: { value: new THREE.Color(activeTheme().skyGrade.horizon) },
        uGradeAmount: { value: activeTheme().skyGrade.amount },
        uSkyYaw: { value: skyYawOf(activeTheme()) },
      };
      this.facadeUniforms.push(uniforms);
      const mesh = new THREE.InstancedMesh(geometry, facadeMaterial(texture, uniforms, String(variant)), capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.name = `city-shafts-${variant}`;
      this.shaftMeshes.push(mesh);
      this.shaftIdByInstance.push(new Map());
      this.group.add(mesh);
      this.raycastTargets.push(mesh);
      this.disposables.push(geometry, mesh.material);
    });

    // 屋顶轮廓：坡顶（三棱柱，屋脊沿 z）、尖顶（四棱锥）、退台冠（小一号的盒子）、屋顶花园（草皮板）。
    const pitched = BOX.clone();
    {
      const position = pitched.getAttribute("position") as THREE.BufferAttribute;
      for (let index = 0; index < position.count; index += 1) if (position.getY(index) > 0.99) position.setX(index, 0);
      pitched.computeVertexNormals();
    }
    const spire = new THREE.ConeGeometry(0.5, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    const profileGeometries = [pitched, spire, BOX, BOX];
    profileGeometries.forEach((geometry, index) => {
      const mesh = this.makeInstanced(geometry, selfLitMaterial(0.18), total);
      mesh.castShadow = true;
      mesh.name = `city-roof-profile-${index + 1}`;
      this.roofProfiles.push(mesh);
    });
    this.gardenTreeMesh = this.makeInstanced(new THREE.IcosahedronGeometry(1, 0).translate(0, 1, 0), new THREE.MeshLambertMaterial({ color: activeTheme().foliage }), total * 3);
    this.gardenTreeMesh.castShadow = true;
    const decoCount = facadeCounts[3] + 4;
    this.decoTrimMesh = this.makeInstanced(BOX, selfLitMaterial(0.24), decoCount * 2);
    this.decoCornerMesh = this.makeInstanced(CYLINDER, selfLitMaterial(0.24), decoCount);
    this.podiumMesh = this.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#e8e2d5" }), total);
    this.roofMesh = this.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#ffffff" }), total);
    this.neonMesh = this.makeInstanced(BOX, new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), total);
    this.neonMesh.castShadow = false;
    this.scaffoldMesh = this.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#e0a83f", transparent: true, opacity: 0.24, depthWrite: false }), total);
    this.scaffoldMesh.castShadow = false;
    this.antennaMesh = this.makeInstanced(new THREE.CylinderGeometry(0.09, 0.16, 1, 5).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: "#5d6470" }), 96);
    this.beaconMesh = this.makeInstanced(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffb02e" }), 96);
    this.craneMastMesh = this.makeInstanced(new THREE.BoxGeometry(0.85, 1, 0.85).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: "#ffb400", emissive: "#6b4300" }), 48);
    this.craneArmMesh = this.makeInstanced(new THREE.BoxGeometry(1, 0.32, 0.32), new THREE.MeshLambertMaterial({ color: "#ffb400", emissive: "#6b4300" }), 48);

    // ── 动态层：溢出楼群 / 信标 / 标签 / 选中环 / 建筑运行时 ────────────
    this.buildMassing();
    this.buildAnomalyMarkers();
    this.hoverRing = this.makeGroundRing("#087f62");
    this.selectRing = this.makeGroundRing("#c96f4a");
    this.buildRuntimes();
    this.buildLabels();
  }

  private makeInstanced(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(capacity, 1));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.disposables.push(geometry, material);
    return mesh;
  }

  private makeGroundRing(color: string): THREE.Mesh {
    const geometry = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.renderOrder = 3;
    this.group.add(mesh);
    this.disposables.push(geometry, material);
    return mesh;
  }

  /** 地形 mesh：高度场位移的 PlaneGeometry；UV 与区纹理的世界映射严格一致。 */
  private buildTerrain(): void {
    {
      const extent = this.layout.extent;
      const segments = 192;
      const geometry = new THREE.PlaneGeometry(extent, extent, segments, segments).rotateX(-Math.PI / 2);
      const position = geometry.attributes.position as THREE.BufferAttribute;
      for (let index = 0; index < position.count; index += 1) {
        const worldX = position.getX(index);
        const worldZ = position.getZ(index);
        position.setXYZ(index, worldX, this.layout.terrain.height(worldX, worldZ), worldZ);
      }
      geometry.computeVertexNormals();
      const texture = makeCityTexture(this.layout);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshLambertMaterial({ map: texture });
      this.installGroundDetail(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.disposables.push(geometry, material, texture);
    }
  }

  /** 地面细节：全城图集（2048–4096²）只够画「哪里是路/沙/草」，近看糊成色块。
   *  在图集颜色上按材质类别叠加世界坐标平铺的照片细节（颜色比值 + 法线明暗），
   *  分类只看图集颜色与海拔：深灰低饱和=沥青，浅灰=人行道，绿=草，暖浅=沙，近水面的沙=滩涂。 */
  private installGroundDetail(material: THREE.MeshLambertMaterial): void {
    const uniforms: Record<string, { value: unknown }> = { uDetail: { value: 0 } };
    // 海滨沙滩不在 shader 里：画进地面贴图（makeCityTexture），道路才能压在它上面。
    for (const name of ["Asphalt", "Concrete", "Sand", "Mud", "Grass"]) {
      uniforms[`u${name}C`] = { value: null };
      uniforms[`u${name}N`] = { value: null };
      uniforms[`u${name}Mean`] = { value: new THREE.Vector3(0.5, 0.5, 0.5) };
    }
    this.terrainUniforms = uniforms;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCityWorld;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvCityWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      const samplers = ["Asphalt", "Concrete", "Sand", "Mud", "Grass"].map((n) => `uniform sampler2D u${n}C; uniform sampler2D u${n}N; uniform vec3 u${n}Mean;`).join("\n");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nvarying vec3 vCityWorld;\nuniform float uDetail;\n${samplers}`)
        .replace("#include <map_fragment>", `#include <map_fragment>
#ifdef USE_MAP
  if (uDetail > 0.5) {
    vec3 base = diffuseColor.rgb;
    float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
    float mx = max(base.r, max(base.g, base.b));
    float sat = (mx - min(base.r, min(base.g, base.b))) / max(mx, 1e-3);
    float wA = (1.0 - smoothstep(0.12, 0.3, sat)) * (1.0 - smoothstep(0.05, 0.14, lum));
    float wC = (1.0 - smoothstep(0.08, 0.22, sat)) * smoothstep(0.16, 0.36, lum);
    float wG = smoothstep(0.005, 0.05, base.g - max(base.r, base.b));
    float wS = smoothstep(0.02, 0.09, base.r - base.b) * smoothstep(0.18, 0.4, lum) * (1.0 - wG);
    // 只在水线附近算滩涂：曾用 0.5–1.9，海拔低的整片沙滩都被染成泥色（真机：沙滩发褐、看不出是沙滩）。
    float wet = 1.0 - smoothstep(0.15, 0.6, vCityWorld.y);
    float wM = wS * wet;
    wS *= 1.0 - wet;
    float sum = wA + wC + wG + wS + wM;
    float strength = smoothstep(0.05, 0.45, sum);
    sum += 1e-4;
    vec2 p = vCityWorld.xz;
    vec3 ratio = (wA * texture2D(uAsphaltC, p / 7.0).rgb / uAsphaltMean
      + wC * texture2D(uConcreteC, p / 5.5).rgb / uConcreteMean
      + wS * texture2D(uSandC, p / 13.0).rgb / uSandMean
      + wM * texture2D(uMudC, p / 9.0).rgb / uMudMean
      + wG * mix(vec3(1.0), texture2D(uGrassC, p / 34.0).rgb / uGrassMean, 0.45)) / sum;
    vec3 nrm = (wA * (texture2D(uAsphaltN, p / 7.0).xyz * 2.0 - 1.0)
      + wC * (texture2D(uConcreteN, p / 5.5).xyz * 2.0 - 1.0)
      + wS * (texture2D(uSandN, p / 13.0).xyz * 2.0 - 1.0)
      + wM * (texture2D(uMudN, p / 9.0).xyz * 2.0 - 1.0)
      + wG * 0.4 * (texture2D(uGrassN, p / 34.0).xyz * 2.0 - 1.0)) / sum;
    diffuseColor.rgb *= mix(vec3(1.0), clamp(ratio, 0.35, 1.8), 0.8 * strength);
    // 法线贴图做「固定光向」的明暗起伏：地面近似水平，省掉切线空间，代价是凹凸不随太阳转。
    diffuseColor.rgb *= 1.0 + 0.55 * strength * (nrm.x * 0.6 - nrm.y * 0.45);
    // 滩涂：向泥色偏、压暗，像刚退潮的湿岸。
    vec3 mud = texture2D(uMudC, p / 9.0).rgb;
    diffuseColor.rgb = mix(diffuseColor.rgb, mud * 0.9, 0.3 * wM / sum * strength);
  }
#endif`);
    };
    material.customProgramCacheKey = () => "city-terrain-detail";
  }

  /** 平面镜反射输入：texture=null 关闭（省电档，或相机在水面以下）。 */
  setMirror(texture: THREE.Texture | null, matrix: THREE.Matrix4 | null): void {
    if (!this.waterAssetUniforms) return;
    this.waterAssetUniforms.uMirror.value = texture;
    this.waterAssetUniforms.uHasMirror.value = texture ? 1 : 0;
    if (matrix) (this.waterAssetUniforms.uMirrorMatrix.value as THREE.Matrix4).copy(matrix);
  }

  setNightWater(night: number): void {
    if (this.waterAssetUniforms) this.waterAssetUniforms.uNight.value = night;
  }

  /** 昼夜天空混合量（0 = 黄昏/夜，1 = 白天）：水面与玻璃反射的粉紫调色量随白天程度衰减。 */
  setSkyMix(dayMix: number): void {
    const amount = activeTheme().skyGrade.amount * (1 - dayMix);
    if (this.waterAssetUniforms) this.waterAssetUniforms.uGradeAmount.value = amount;
    for (const uniforms of this.facadeUniforms) uniforms.uGradeAmount.value = amount;
  }

  /** 素材到齐后原地换上：地面细节、照片立面、灰泥法线、水面法线与天空反射。 */
  applyAssets(assets: CityAssets): void {
    const theme = activeTheme();
    const mean = (texture: THREE.Texture): THREE.Vector3 => {
      const image = texture.image as CanvasImageSource & { width: number; height: number };
      const canvas = createRenderCanvas();
      canvas.width = canvas.height = 8;
      const ctx = canvas.getContext("2d");
      if (!ctx) return new THREE.Vector3(0.5, 0.5, 0.5);
      ctx.drawImage(image, 0, 0, 8, 8);
      const data = ctx.getImageData(0, 0, 8, 8).data;
      const sum = [0, 0, 0];
      for (let index = 0; index < data.length; index += 4) for (let c = 0; c < 3; c += 1) sum[c] += data[index + c];
      // 着色器里采样得到的是线性值（sRGB 纹理自动解码），均值也换算成线性。
      const toLinear = (v: number) => Math.pow(v / 255 / 64, 2.2);
      return new THREE.Vector3(toLinear(sum[0]), toLinear(sum[1]), toLinear(sum[2]));
    };
    if (this.terrainUniforms) {
      const ground = assets.ground;
      const pairs: Array<[string, { color: THREE.Texture; normal: THREE.Texture }]> = [["Asphalt", ground.asphalt], ["Concrete", ground.concrete], ["Sand", ground.sand], ["Mud", ground.mud], ["Grass", ground.grass]];
      for (const [name, layer] of pairs) {
        this.terrainUniforms[`u${name}C`].value = layer.color;
        this.terrainUniforms[`u${name}N`].value = layer.normal;
        this.terrainUniforms[`u${name}Mean`].value = mean(layer.color);
      }
      this.terrainUniforms.uDetail.value = 1;
    }
    // 照片立面：每张图的「每块平铺对应多少层」不同（窗格行数），uRows 让一层楼≈一行窗。
    // 一块平铺覆盖的楼层数与宽度（世界单位，窗宽≈2.4）：让窗格大小在三种立面间一致。
    const rows = [8, 10, 10];
    const tileWidths = [30, 32, 32];
    assets.facades.forEach((texture, variant) => {
      const uniforms = this.facadeUniforms[variant];
      if (!uniforms) return;
      uniforms.uPhotoTex.value = texture;
      uniforms.uPhoto.value = 1;
      uniforms.uPhotoRows.value = rows[variant];
      uniforms.uTileWidth.value = tileWidths[variant];
    });
    // 玻璃反射强度按立面：市中心玻璃幕墙最强，商业楼窗户次之，住宅与海滨灰泥楼的窗只带一点。
    const envStrength = [0.3, 0.7, 0.9, 0.3];
    // 反射一律用白天照片：黄昏的粉紫由 uGradeAmount 叠加（见 setSkyMix），白天不染色——和天穹的混合保持一致。
    const sky = assets.sky.day;
    this.facadeUniforms.forEach((uniforms, variant) => {
      uniforms.uEnv.value = sky;
      uniforms.uEnvStrength.value = envStrength[variant] ?? 0;
    });
    const deco = this.shaftMeshes[3]?.material as THREE.MeshLambertMaterial | undefined;
    if (deco) {
      deco.normalMap = assets.stuccoNormal;
      deco.normalScale.set(0.6, 0.6);
      deco.needsUpdate = true;
    }
    if (this.waterAssetUniforms) {
      this.waterAssetUniforms.uNormal.value = assets.waterNormal;
      this.waterAssetUniforms.uSkyTex.value = assets.sky.day;
      this.waterAssetUniforms.uHasAssets.value = 1;
    }
  }

  /** Batched city furniture and waterfront infrastructure, not selectable data. */
  private buildInfrastructure(): void {
    type Part = { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: string; tilt?: number; yaw?: number };
    const parts: Part[] = [];
    const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, tilt = 0, yaw = 0) => parts.push({ x, y, z, sx, sy, sz, color, tilt, yaw });
    // Curbs and street lights are real geometry; asphalt and markings share the atlas.
    for (const edge of this.layout.roadEdges) {
      // Bridge spans need actual geometry; the terrain atlas is below the river surface.
      if (edge.bridge) {
        const [a, b] = edge.points;
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        const yaw = -Math.atan2(b.z - a.z, b.x - a.x);
        const x = (a.x + b.x) / 2; const z = (a.z + b.z) / 2;
        // Deck top meets the level plain; unlike atlas roads it remains above water.
        const deckTop = Math.max(this.layout.terrain.height(a.x, a.z), this.layout.terrain.height(b.x, b.z));
        add(x, deckTop - 0.4, z, length + 0.5, 0.4, edge.width, "#6a7071", 0, yaw);
        for (const side of [-1, 1]) {
          const offset = side * (edge.width / 2 - 0.15);
          add(x + Math.sin(yaw) * offset, deckTop, z + Math.cos(yaw) * offset, length, 0.65, 0.3, "#b9bcb2", 0, yaw);
          const lineOffset = side * (edge.width / 2 - 0.65);
          add(x + Math.sin(yaw) * lineOffset, deckTop + 0.015, z + Math.cos(yaw) * lineOffset, length, 0.025, 0.12, "#e4dfc9", 0, yaw);
        }
        for (let distance = 2; distance < length - 1; distance += 6) {
          const t = (distance + 1) / length;
          add(a.x + (b.x - a.x) * t, deckTop + 0.015, a.z + (b.z - a.z) * t, Math.min(2, length - distance), 0.025, 0.14, "#dfd1a5", 0, yaw);
        }
        for (let distance = 16; distance < length - 12; distance += 32) {
          const t = distance / length;
          const px = a.x + (b.x - a.x) * t; const pz = a.z + (b.z - a.z) * t;
          const bed = this.layout.terrain.height(px, pz);
          add(px, bed, pz, 1.6, Math.max(0.1, deckTop - 0.35 - bed), edge.width - 0.6, "#a9aaa0", 0, yaw);
        }
        continue;
      }
      // 沿路段的实际方向摆放（G2 起各片区街网朝向不同；曾只认水平/竖直两种方向）。
      const [a, b] = edge.points;
      const segment = Math.hypot(b.x - a.x, b.z - a.z);
      if (segment < 14) continue;
      const length = segment - 11;
      const yaw = -Math.atan2(b.z - a.z, b.x - a.x);
      const nx = -(b.z - a.z) / segment; const nz = (b.x - a.x) / segment; // 路段法向
      const x = (a.x + b.x) / 2; const z = (a.z + b.z) / 2;
      const base = Math.max(0, this.layout.terrain.height(x, z));
      for (const side of [-1, 1]) {
        const offset = side * (edge.width / 2 + 0.25);
        add(x + nx * offset, base + 0.02, z + nz * offset, length, 0.18, 0.35, "#cbc6ba", 0, yaw);
      }
    }
    // 城北高架与城南港口曾按常量坐标（urbanBounds.north − 12 / right − 80、south + 58）摆放、与地理无关：
    // G2 起高架是规划层的环线（buildDistrictExpressways 渲染），港口是 harbor 公共用地（buildPublicSites）。
    const mesh = this.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#ffffff" }), parts.length);
    parts.forEach((part, index) => {
      this.positionVector.set(part.x, part.y, part.z);
      this.euler.set(part.tilt ?? 0, part.yaw ?? 0, 0);
      this.quaternion.setFromEuler(this.euler);
      this.scaleVector.set(part.sx, part.sy, part.sz);
      this.matrix.compose(this.positionVector, this.quaternion, this.scaleVector);
      mesh.setMatrixAt(index, this.matrix); mesh.setColorAt(index, this.color.set(part.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = parts.length;
    mesh.name = "city-infrastructure-decorative";
  }

  /** 区界高架：与北环高架同视觉语言（桥面/车道线/护栏/桥墩），
   *  沿规划折线分段铺装 —— harness 城区之间可辨认的硬边界。 */
  private buildDistrictExpressways(): void {
    type Piece = { x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw: number; pitch?: number; color: string };
    const pieces: Piece[] = [];
    for (const points of this.layout.highways ?? []) {
      const heights = expresswayDeckHeights(points, (x, z) => this.layout.terrain.height(x, z));
      // Piers every ~34 units by mileage, anchored into the terrain or riverbed
      // (over water the pier reaches below the surface — a real bridge span).
      let accumulated = 0;
      let nextPier = 0;
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        if (index > 0) accumulated += Math.hypot(point.x - points[index - 1].x, point.z - points[index - 1].z);
        if (accumulated >= nextPier) {
          nextPier = accumulated + 34;
          const groundY = Math.max(-3, this.layout.terrain.height(point.x, point.z));
          // 墩顶止于桥面底面（咬合 0.05）：桥面板在任何视角下都完整包住墩顶，
          // 不会出现"桥墩穿透路面"的视觉交叠。
          // BOX 以底面为原点：y 是墩底而不是中心。曾按「中心」写成 (地面+墩顶)/2，
          // 桥墩悬在半空且戳出桥面（截图里河中那个方块）。
          const pierTop = heights[index] + 0.05;
          if (pierTop - groundY < 1.5) continue; // 匝道落地段不需要桥墩
          // 桥墩随该点处桥面走向旋转（横截面垂直于桥），盖梁宽度覆盖桥面。
          const neighbor = points[Math.min(index + 1, points.length - 1)];
          const prev = points[Math.max(index - 1, 0)];
          const pierYaw = -Math.atan2(neighbor.z - prev.z, neighbor.x - prev.x);
          pieces.push({ x: point.x, y: groundY, z: point.z, sx: 1.8, sy: pierTop - groundY, sz: 8.4, yaw: pierYaw, color: "#a9aaa0" });
        }
      }
      for (let index = 1; index < points.length; index += 1) {
        const a = points[index - 1];
        const b = points[index];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 6) continue;
        const yaw = -Math.atan2(b.z - a.z, b.x - a.x);
        const mx = (a.x + b.x) / 2;
        const mz = (a.z + b.z) / 2;
        const ya = heights[index - 1];
        const yb = heights[index];
        const my = (ya + yb) / 2;
        const pitch = Math.atan2(yb - ya, length);
        const slant = Math.hypot(length, yb - ya);
        const top = my + EXPRESSWAY_DECK_THICKNESS;
        pieces.push({ x: mx, y: my, z: mz, sx: slant + 0.5, sy: EXPRESSWAY_DECK_THICKNESS, sz: EXPRESSWAY_DECK_WIDTH, yaw, pitch, color: "#6a7071" });
        // 车道线/护栏沿桥面横向偏移（offset 之前被忽略，全叠在中线上），且要在桥面顶面（deckY+0.9）之上。
        const sideX = Math.sin(yaw);
        const sideZ = Math.cos(yaw);
        for (const offset of [-3.6, 0, 3.6]) pieces.push({ x: mx + sideX * offset, y: top, z: mz + sideZ * offset, sx: slant, sy: 0.05, sz: 0.3, yaw, pitch, color: "#c6c6bb" });
        for (const offset of [-5.1, 5.1]) pieces.push({ x: mx + sideX * offset, y: top, z: mz + sideZ * offset, sx: slant, sy: 0.55, sz: 0.3, yaw, pitch, color: "#b9bcb2" });
      }
    }
    if (!pieces.length) return;
    const geometry = BOX.clone();
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: "#ffffff" }), pieces.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pieces.forEach((piece, index) => {
      this.positionVector.set(piece.x, piece.y, piece.z);
      // 先绕局部 z 俯仰（匝道坡度），再绕 y 转向：'YZX' 顺序。
      this.euler.set(0, piece.yaw, piece.pitch ?? 0, "YZX");
      this.quaternion.setFromEuler(this.euler);
      this.euler.set(0, 0, 0, "XYZ");
      this.scaleVector.set(piece.sx, piece.sy, piece.sz);
      this.matrix.compose(this.positionVector, this.quaternion, this.scaleVector);
      mesh.setMatrixAt(index, this.matrix);
      mesh.setColorAt(index, this.color.set(piece.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = "city-district-expressways";
    this.group.add(mesh);
    this.disposables.push(geometry, mesh.material);
  }

  /** 公共用地的 3D 体量：此前市政广场/车站/体育场/观景塔/港口只有地面纹理里的一块色块
   *  （海岸边那块灰色长方形就是港口）。全部由方块与圆柱拼成，局部坐标按地块 yaw 旋转。 */
  private buildPublicSites(): void {
    type Piece = { x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw: number; color: string };
    const boxes: Piece[] = [];
    const cylinders: Piece[] = [];
    const glows: Piece[] = []; // 夜间霓虹/边缘光：与 nightLights.neon 共用亮度，实例色定色相
    for (const site of this.layout.publicSites) {
      if (site.kind === "park") continue;
      const r = site.radius;
      const base = Math.max(0, this.layout.terrain.height(site.x, site.z));
      const cos = Math.cos(site.yaw);
      const sin = Math.sin(site.yaw);
      // 局部 (lx, lz) → 世界；与吊车/地块同一套 yaw 约定。
      const place = (lx: number, lz: number) => ({ x: site.x + lx * cos + lz * sin, z: site.z - lx * sin + lz * cos });
      const box = (lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: string, extraYaw = 0) => {
        const p = place(lx, lz);
        boxes.push({ x: p.x, y: base + ly, z: p.z, sx, sy, sz, yaw: site.yaw + extraYaw, color });
      };
      const cyl = (lx: number, ly: number, lz: number, radius: number, height: number, color: string) => {
        const p = place(lx, lz);
        cylinders.push({ x: p.x, y: base + ly, z: p.z, sx: radius, sy: height, sz: radius, yaw: 0, color });
      };
      const glow = (lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: string, extraYaw = 0) => {
        const p = place(lx, lz);
        glows.push({ x: p.x, y: base + ly, z: p.z, sx, sy, sz, yaw: site.yaw + extraYaw, color });
      };
      if (site.kind === "civic") {
        box(0, 0, 0, r * 1.2, 1.6, r * 0.9, "#e4dcc8");
        box(0, 1.6, 0, r * 0.9, 9, r * 0.55, "#efe7d6");
        for (let column = -3; column <= 3; column += 1) cyl(column * r * 0.12, 1.6, r * 0.34, 0.75, 9, "#f6f0e2");
        box(0, 10.6, 0, r * 0.98, 1.1, r * 0.62, "#cdbf9f");
        cyl(0, 11.7, 0, r * 0.27, 4.2, "#d6c9a8");
        cyl(0, 15.9, 0, r * 0.2, 3.4, "#5fa7a3");
        cyl(0, 19.3, 0, 0.4, 6, "#c9b98f");
        // 檐口一圈暖白边缘光 + 门廊柱脚洗墙光 + 穹顶青色腰线。
        for (const sz of [-1, 1]) glow(0, 11.7, sz * r * 0.31, r * 0.98, 0.22, 0.22, "#ffe2a8");
        for (const sx of [-1, 1]) glow(sx * r * 0.49, 11.7, 0, 0.22, 0.22, r * 0.62, "#ffe2a8");
        glow(0, 1.7, r * 0.46, r * 1.2, 0.2, 0.2, "#ffd08a");
        glow(0, 17.4, 0, r * 0.41, 0.25, r * 0.41, "#46e6ff");
        glow(0, 25.6, 0, 0.6, 0.9, 0.6, "#ff5a7a");
      } else if (site.kind === "station") {
        box(0, 0, 0, r * 1.5, 0.7, r * 1.1, "#cfc7b3");
        for (const track of [-18, -10, -2, 6]) box(track, 0.7, 0, 0.5, 0.15, r * 1.1, "#6f7773");
        box(0, 7.4, 0, r * 1.4, 0.55, r * 0.9, "#8e9a9c");
        for (const px of [-r * 0.6, 0, r * 0.6]) for (const pz of [-r * 0.38, r * 0.38]) cyl(px, 0.7, pz, 0.55, 6.7, "#a9b0b0");
        box(0, 0, -r * 0.62, r * 1.3, 11, 7, "#d9cdb5");
        cyl(r * 0.5, 11, -r * 0.62, 1.6, 10, "#c8bba0");
        cyl(r * 0.5, 21, -r * 0.62, 2.1, 1.2, "#f4efe0");
        // 站房钟面发光 + 雨棚两侧边缘光 + 站台边线。
        glow(r * 0.5, 21.15, -r * 0.62, 1.7, 0.9, 1.7, "#fff3cf");
        for (const sz of [-1, 1]) glow(0, 7.5, sz * r * 0.45, r * 1.4, 0.22, 0.22, "#58e0ff");
        glow(0, 11, -r * 0.62 + 3.6, r * 1.3, 0.22, 0.22, "#ffd08a");
      } else if (site.kind === "stadium") {
        const segments = 18;
        for (let index = 0; index < segments; index += 1) {
          const t = (index / segments) * Math.PI * 2;
          const lx = Math.cos(t) * 27;
          const lz = Math.sin(t) * 19.5;
          // 椭圆切线方向：看台段首尾相接。
          const tangent = Math.atan2(19.5 * Math.cos(t), -27 * Math.sin(t));
          box(lx, 0, lz, 10.5, index % 4 === 0 ? 11 : 8, 5.5, index % 4 === 0 ? "#c05a4f" : "#dcd8ca", -tangent);
        }
        for (const [lx, lz] of [[-30, -22], [30, -22], [-30, 22], [30, 22]]) {
          cyl(lx, 0, lz, 0.55, 24, "#9aa0a0");
          glow(lx, 24, lz, 4, 1.4, 2.4, "#fff3c4"); // 泛光灯塔灯头：夜里发光
        }
        // 看台上沿一圈青/洋红交替的边缘光。
        for (let index = 0; index < segments; index += 1) {
          const t = (index / segments) * Math.PI * 2;
          const tangent = Math.atan2(19.5 * Math.cos(t), -27 * Math.sin(t));
          glow(Math.cos(t) * 27, index % 4 === 0 ? 11.1 : 8.1, Math.sin(t) * 19.5, 10.5, 0.22, 0.22, index % 2 === 0 ? "#38e8ff" : "#ff4fd8", -tangent);
        }
      } else if (site.kind === "tower") {
        cyl(0, 0, 0, 6.5, 3.2, "#c4c7c6");
        cyl(0, 3.2, 0, 2.3, 42, "#cfd3d6");
        cyl(0, 42, 0, 6.4, 3.8, "#eaf0f2");
        cyl(0, 45.8, 0, 4.2, 2.2, "#7fb4c2");
        cyl(0, 48, 0, 0.45, 15, "#d45a4a");
        // 观景台与塔身腰线霓虹 + 天线红色航空灯。
        glow(0, 45.2, 0, 4.4, 0.35, 4.4, "#46e6ff");
        glow(0, 41.6, 0, 6.6, 0.3, 6.6, "#ff4fd8");
        glow(0, 20, 0, 2.5, 0.35, 2.5, "#ffd08a");
        glow(0, 62.6, 0, 1.1, 1.3, 1.1, "#ff3b3b");
      } else if (site.kind === "harbor") {
        box(0, 0, 0, r * 1.5, 0.5, r * 1.2, "#8e9490");
        box(0, 0.5, -r * 0.5, r * 1.1, 6.5, 10, "#bab4a3");
        const containerColors = ["#a9684f", "#4f7f8a", "#c9a24a", "#6a8a62", "#8a5a7a", "#d8d2c0"];
        for (let col = 0; col < 5; col += 1) {
          for (let row = 0; row < 3; row += 1) {
            const stack = 1 + Math.floor(hashSeed(`ctn:${site.id}:${col}:${row}`) * 3);
            for (let level = 0; level < stack; level += 1) {
              box(-r * 0.55 + col * 7, 0.5 + level * 2.7, -r * 0.1 + row * 4.4, 6.2, 2.6, 3.8, containerColors[Math.floor(hashSeed(`ctc:${site.id}:${col}:${row}:${level}`) * containerColors.length)]);
            }
          }
        }
        for (const [lx, lz] of [[-r * 0.65, r * 0.38], [-r * 0.65, r * 0.62], [r * 0.15, r * 0.38], [r * 0.15, r * 0.62]]) cyl(lx, 0.5, lz, 0.6, 17, "#c9532f");
        box(-r * 0.25, 17.5, r * 0.5, r * 1.1, 1.3, 1.5, "#c9532f");
        box(-r * 0.25 + r * 0.55, 17.2, r * 0.5, 14, 1, 1, "#d9d3c2", 0);
        // 码头发光：岸线灯带、龙门吊顶部泛光灯、堆场高杆灯与吊臂红色航空灯。
        glow(0, 0.55, r * 0.6, r * 1.5, 0.25, 0.25, "#ffb366");
        glow(0, 0.55, -r * 0.6, r * 1.5, 0.25, 0.25, "#ffb366");
        for (const [lx, lz] of [[-r * 0.65, r * 0.38], [-r * 0.65, r * 0.62], [r * 0.15, r * 0.38], [r * 0.15, r * 0.62]]) glow(lx, 17.6, lz, 1.4, 0.7, 1.4, "#fff1c4");
        glow(-r * 0.25 + r * 0.55 + 7, 17.2, r * 0.5, 0.9, 0.9, 0.9, "#ff3b3b");
        for (const lx of [-r * 0.6, 0, r * 0.6]) {
          cyl(lx, 0.5, -r * 0.2, 0.18, 12, "#8a9096");
          glow(lx, 12.5, -r * 0.2, 1.6, 0.5, 1.6, "#fff1c4");
        }
      }
    }
    if (!boxes.length) return;
    const build = (geometry: THREE.BufferGeometry, pieces: Piece[], name: string) => {
      if (!pieces.length) return;
      const material = new THREE.MeshLambertMaterial({ color: "#ffffff" });
      const mesh = new THREE.InstancedMesh(geometry.clone(), material, pieces.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      pieces.forEach((piece, index) => {
        this.positionVector.set(piece.x, piece.y, piece.z);
        this.euler.set(0, piece.yaw, 0);
        this.quaternion.setFromEuler(this.euler);
        this.scaleVector.set(piece.sx, piece.sy, piece.sz);
        this.matrix.compose(this.positionVector, this.quaternion, this.scaleVector);
        mesh.setMatrixAt(index, this.matrix);
        mesh.setColorAt(index, this.color.set(piece.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.name = name;
      this.group.add(mesh);
      this.disposables.push(mesh.geometry, material);
    };
    build(BOX, boxes, "city-public-sites-boxes");
    build(CYLINDER, cylinders, "city-public-sites-cylinders");
    const neon = this.nightLights?.neon;
    if (neon && glows.length) {
      const mesh = new THREE.InstancedMesh(BOX.clone(), neon, glows.length);
      glows.forEach((piece, index) => {
        this.positionVector.set(piece.x, piece.y, piece.z);
        this.euler.set(0, piece.yaw, 0);
        this.quaternion.setFromEuler(this.euler);
        this.scaleVector.set(piece.sx, piece.sy, piece.sz);
        this.matrix.compose(this.positionVector, this.quaternion, this.scaleVector);
        mesh.setMatrixAt(index, this.matrix);
        mesh.setColorAt(index, this.color.set(piece.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.name = "city-public-sites-glow";
      this.group.add(mesh);
      this.disposables.push(mesh.geometry);
    }
  }

  /** 小区中心花园：草坪 + 湖（与海面同一套水面材质，能映倒影）+ 湖石驳岸 + 假山叠石 + 亭 + 环湖树。 */
  /** 旗帜（tinyskies FlagSystem 手法）：各区花园一杆 harness 色旗 + 观测塔一面大旗。
   *  布料摆动在顶点着色器里做——摆幅从旗杆（x=0）到自由端渐增，双频叠加更像风。 */
  private buildFlags(): void {
    const spots: Array<{ x: number; z: number; y: number; yaw: number; pole: number; cloth: number; color: string }> = [];
    for (const garden of this.layout.gardens ?? []) {
      const c = Math.cos(garden.yaw);
      const s = Math.sin(garden.yaw);
      spots.push({
        x: garden.x + c * garden.width * 0.3 - s * garden.depth * 0.32,
        z: garden.z + s * garden.width * 0.3 + c * garden.depth * 0.32,
        y: garden.y, yaw: garden.yaw, pole: 7.5, cloth: 1,
        color: paletteFor(garden.districtId).accent,
      });
    }
    const tower = this.layout.publicSites.find((site) => site.kind === "tower");
    if (tower) {
      spots.push({ x: tower.x, z: tower.z, y: this.layout.terrain.height(tower.x, tower.z), yaw: tower.yaw, pole: 15, cloth: 1.5, color: "#f2efe6" });
    }
    if (!spots.length) return;
    this.flagTime = { value: 0 };
    const poleGeometry = new THREE.CylinderGeometry(0.12, 0.17, 1, 6).translate(0, 0.5, 0);
    const poleMaterial = new THREE.MeshLambertMaterial({ color: "#8a9096" });
    const poleMesh = this.makeInstanced(poleGeometry, poleMaterial, spots.length);
    // 旗面：左缘挂在杆顶，宽度 5.2×cloth；aPhase 是实例属性（每面旗自己的风相位）。
    const clothWidth = 5.2;
    const clothGeometry = new THREE.PlaneGeometry(clothWidth, 3.1, 10, 5).translate(clothWidth / 2 + 0.1, -1.7, 0);
    const phases = new Float32Array(spots.map((_, index) => hashSeed(`flag:${index}`) * Math.PI * 2));
    clothGeometry.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
    const clothMaterial = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    const flagTime = this.flagTime;
    clothMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = flagTime;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aPhase;\nuniform float uTime;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          float hoist = smoothstep(0.0, ${clothWidth.toFixed(1)}, position.x);
          transformed.z += (sin(uTime * 2.7 + aPhase + position.x * 1.1) * 0.4 + sin(uTime * 5.2 + aPhase * 1.7 + position.x * 2.4) * 0.13) * hoist;
          transformed.y -= hoist * hoist * 0.2;`);
    };
    clothMaterial.customProgramCacheKey = () => "city-flag-cloth";
    const clothMesh = new THREE.InstancedMesh(clothGeometry, clothMaterial, spots.length);
    clothMesh.name = "city-flags";
    spots.forEach((spot, index) => {
      this.compose(spot.x, spot.y, spot.z, spot.yaw, 0.8, spot.pole, 0.8);
      poleMesh.setMatrixAt(index, this.matrix);
      this.compose(spot.x, spot.y + spot.pole - 0.15, spot.z, spot.yaw, spot.cloth, spot.cloth, 1);
      clothMesh.setMatrixAt(index, this.matrix);
      clothMesh.setColorAt(index, this.color.set(spot.color));
    });
    if (clothMesh.instanceColor) clothMesh.instanceColor.needsUpdate = true;
    this.group.add(poleMesh, clothMesh);
    this.disposables.push(poleGeometry, poleMaterial, clothGeometry, clothMaterial);
  }

  private buildGardens(): void {
    const gardens = this.layout.gardens ?? [];
    if (!gardens.length) return;
    type Piece = { x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw: number; tilt: number; color: string };
    const boxes: Piece[] = [];
    const rocks: Piece[] = [];
    const cones: Piece[] = [];
    const trees: Piece[] = [];
    const waterMaterial = this.water.material as THREE.Material;
    for (const garden of gardens) {
      const r = garden.seed;
      const base = Math.max(0.3, garden.y);
      const cos = Math.cos(garden.yaw);
      const sin = Math.sin(garden.yaw);
      const at = (lx: number, lz: number) => ({ x: garden.x + lx * cos + lz * sin, z: garden.z - lx * sin + lz * cos });
      const W = garden.width - 3;
      const D = garden.depth - 3;
      const lawn = at(0, 0);
      boxes.push({ x: lawn.x, y: base, z: lawn.z, sx: W, sy: 0.25, sz: D, yaw: garden.yaw, tilt: 0, color: "#7fae6a" });
      // 湖：偏一侧的椭圆，留出另一侧放亭子。
      const lakeX = -W * 0.08;
      const lakeZ = D * 0.04;
      const rx = W * 0.32;
      const rz = D * 0.3;
      const lakeCenter = at(lakeX, lakeZ);
      const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), waterMaterial);
      lake.position.set(lakeCenter.x, base + 0.3, lakeCenter.z);
      lake.rotation.y = garden.yaw;
      lake.scale.set(rx, 1, rz);
      lake.renderOrder = 1;
      this.group.add(lake);
      this.disposables.push(lake.geometry);
      // 湖石驳岸：一圈大小不一的扁石。
      for (let index = 0; index < 22; index += 1) {
        const t = (index / 22) * Math.PI * 2;
        const jitter = hashSeed(`${garden.id}:bank:${index}`);
        const q = at(lakeX + Math.cos(t) * (rx + 0.6), lakeZ + Math.sin(t) * (rz + 0.6));
        const size = 0.9 + jitter * 0.9;
        rocks.push({ x: q.x, y: base + 0.2, z: q.z, sx: size * 1.3, sy: size * 0.55, sz: size, yaw: jitter * 6.28, tilt: 0, color: jitter > 0.5 ? "#a8a59c" : "#8f8c84" });
      }
      // 假山：湖心偏后的一组叠石，越往上越小、略微错位。
      const hill = at(lakeX + rx * 0.35, lakeZ - rz * 0.25);
      for (let index = 0; index < 7; index += 1) {
        const jitter = hashSeed(`${garden.id}:rock:${index}`);
        const level = index < 3 ? 0 : index < 5 ? 1 : index < 6 ? 2 : 3;
        const size = (3.2 - level * 0.7) * (0.8 + jitter * 0.4);
        const off = (jitter - 0.5) * 2.4;
        rocks.push({ x: hill.x + off, y: base + 0.1 + level * 2.1, z: hill.z + (hashSeed(`${garden.id}:rz:${index}`) - 0.5) * 2.4, sx: size, sy: size * (1.1 + jitter * 0.5), sz: size * 0.85, yaw: jitter * 6.28, tilt: (jitter - 0.5) * 0.4, color: ["#9b978c", "#b3afa4", "#86837b"][index % 3] });
      }
      // 亭：四柱 + 方台 + 攒尖顶（执行环境强调色），在湖的另一侧。
      const pavilion = at(W * 0.34, -D * 0.18);
      const roofColor = new THREE.Color(paletteFor(garden.districtId).accent).lerp(new THREE.Color("#5a3b2c"), 0.35).getStyle();
      boxes.push({ x: pavilion.x, y: base + 0.25, z: pavilion.z, sx: 5.4, sy: 0.5, sz: 5.4, yaw: garden.yaw, tilt: 0, color: "#d8d1c2" });
      for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
        const q = at(W * 0.34 + dx, -D * 0.18 + dz);
        boxes.push({ x: q.x, y: base + 0.75, z: q.z, sx: 0.35, sy: 3.4, sz: 0.35, yaw: garden.yaw, tilt: 0, color: "#8a3b2e" });
      }
      cones.push({ x: pavilion.x, y: base + 4.1, z: pavilion.z, sx: 4.4, sy: 2.6, sz: 4.4, yaw: garden.yaw + Math.PI / 4, tilt: 0, color: roofColor });
      // 环湖树。
      for (let index = 0; index < 14; index += 1) {
        const t = (index / 14) * Math.PI * 2 + r;
        const q = at(Math.cos(t) * W * 0.44, Math.sin(t) * D * 0.42);
        const size = 1.4 + hashSeed(`${garden.id}:tree:${index}`) * 0.9;
        trees.push({ x: q.x, y: base + 0.2, z: q.z, sx: size, sy: size * 1.2, sz: size, yaw: 0, tilt: 0, color: index % 3 === 0 ? "#5f9a55" : "#6fae63" });
      }
    }
    const build = (geometry: THREE.BufferGeometry, pieces: Piece[], name: string) => {
      if (!pieces.length) return;
      const material = new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true });
      const mesh = new THREE.InstancedMesh(geometry, material, pieces.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      pieces.forEach((piece, index) => {
        this.positionVector.set(piece.x, piece.y, piece.z);
        this.euler.set(piece.tilt, piece.yaw, 0);
        this.quaternion.setFromEuler(this.euler);
        this.scaleVector.set(piece.sx, piece.sy, piece.sz);
        this.matrix.compose(this.positionVector, this.quaternion, this.scaleVector);
        mesh.setMatrixAt(index, this.matrix);
        mesh.setColorAt(index, this.color.set(piece.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.name = name;
      this.group.add(mesh);
      this.disposables.push(geometry, material);
    };
    build(BOX.clone(), boxes, "city-garden-boxes");
    build(new THREE.DodecahedronGeometry(0.6, 0).translate(0, 0.45, 0), rocks, "city-garden-rocks");
    build(new THREE.ConeGeometry(0.5, 1, 4).translate(0, 0.5, 0), cones, "city-garden-roofs");
    build(new THREE.IcosahedronGeometry(1, 0).translate(0, 1.4, 0), trees, "city-garden-trees");
  }

  /** 夜间照明（静态，随 seed 缓存）：沿主干道两侧交错的路灯（杆 + 自发光灯头 + 地面光斑）、高架灯带。
   *  曾只有每条主干道路段中点一盏不发光的灯，夜里道路是一片黑——现在街道有"灯线"，这是夜景像城市的关键。 */
  private buildNightLights(): NightLights {
    const heads = new THREE.MeshBasicMaterial({ color: "#ffc773", toneMapped: false });
    // 光斑用径向渐变贴图（中心亮、边缘衰减到 0）：纯色圆片在夜里像一个个米色沙盘圆点，不像灯光。
    const glow = createRenderCanvas();
    glow.width = glow.height = 64;
    const gctx = glow.getContext("2d");
    if (gctx) {
      const gradient = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.35, "rgba(255,255,255,0.45)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      gctx.fillStyle = gradient;
      gctx.fillRect(0, 0, 64, 64);
    }
    const glowTexture = new THREE.CanvasTexture(glow);
    const pools = new THREE.MeshBasicMaterial({ color: "#ff9e4d", map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.disposables.push(glowTexture);
    pools.visible = false;
    const strips = new THREE.MeshBasicMaterial({ color: "#ffb366", toneMapped: false });
    const neon = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
    const poles = this.makeInstanced(new THREE.CylinderGeometry(0.1, 0.14, 1, 5).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: "#59636a" }), 4600);
    const headMesh = this.makeInstanced(new THREE.BoxGeometry(0.5, 0.22, 0.9), heads, 4600);
    const poolMesh = this.makeInstanced(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), pools, 4600);
    poolMesh.renderOrder = 2;
    const stripMesh = this.makeInstanced(BOX, strips, 2200);
    const spacing = 30;
    let lamps = 0;
    const lamp = (x: number, z: number, nx: number, nz: number, base: number, yaw: number, poolReach = 3.2, poolRadius = 9.5) => {
      if (lamps >= 4600) return;
      this.compose(x, base, z, 0, 1, 4.6, 1);
      poles.setMatrixAt(lamps, this.matrix);
      // 灯头悬在路中心一侧（臂长 0.7），朝路面。
      this.compose(x - nx * 0.45, base + 4.55, z - nz * 0.45, yaw, 1, 1, 1); // 灯头长 0.9：一端贴住灯杆，不再悬空
      headMesh.setMatrixAt(lamps, this.matrix);
      this.compose(x - nx * poolReach, base + 0.12, z - nz * poolReach, 0, poolRadius, 1, poolRadius);
      poolMesh.setMatrixAt(lamps, this.matrix);
      lamps += 1;
    };
    // 沿合并后的整条路（roadPaintPlan 的 run）按弧长每 30 放一盏，间距跨路段累计。曾逐条路段放、
    // 且跳过 <18 的段：滨海大道细分成 ~15 的短段，整条一盏灯都没有（真机夜景：海滨道路漆黑）。
    for (const run of roadPaintPlan(this.layout.roadEdges).runs) {
      if (run.kind !== "arterial") continue;
      let walked = 0; let next = spacing / 2; let index = 0;
      for (let i = 1; i < run.points.length; i += 1) {
        const a = run.points[i - 1]; const b = run.points[i];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 1e-3) continue;
        const dx = (b.x - a.x) / length; const dz = (b.z - a.z) / length;
        const nx = -dz; const nz = dx;
        const yaw = -Math.atan2(dz, dx);
        while (next <= walked + length) {
          const t = next - walked;
          const side = index % 2 === 0 ? 1 : -1; // 两侧交错
          const x = a.x + dx * t + nx * side * (run.width / 2 + 0.9);
          const z = a.z + dz * t + nz * side * (run.width / 2 + 0.9);
          lamp(x, z, nx * side, nz * side, Math.max(0, this.layout.terrain.height(x, z)), yaw);
          next += spacing; index += 1;
        }
        walked += length;
      }
    }
    // 公园：沿园路一圈路灯（外圈 8 盏），灯头朝内。
    for (const site of this.layout.publicSites) {
      if (site.kind !== "park") continue;
      const ring = Math.max(10, site.radius * 0.7);
      for (let i = 0; i < 8; i += 1) {
        const t = (i / 8) * Math.PI * 2;
        const ox = Math.cos(t); const oz = Math.sin(t);
        const x = site.x + ox * ring; const z = site.z + oz * ring;
        lamp(x, z, ox, oz, Math.max(0, this.layout.terrain.height(x, z)), -Math.atan2(ox, -oz) + Math.PI / 2);
      }
    }
    // 高架：桥面两侧交错路灯，灯头朝路中心。立在行车面（板顶）上；光斑圆心落到桥面中线、
    // 半径不超过半幅桥宽——地面路灯的 9.5 光斑在 10.5 宽桥面上大半悬空，看起来是灯光穿透到桥下。
    for (const run of this.layout.highways ?? []) {
      const heights = expresswayDeckHeights(run, (x, z) => this.layout.terrain.height(x, z));
      let carry = 0;
      for (let i = 1; i < run.length; i += 1) {
        const a = run[i - 1]; const b = run[i];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 1) continue;
        const dx = (b.x - a.x) / length; const dz = (b.z - a.z) / length;
        const yaw = -Math.atan2(dz, dx);
        for (let t = 14 - carry; t < length; t += 34) {
          const side = Math.floor((t + length * 0.37 + a.x) / 34) % 2 === 0 ? 1 : -1;
          const deckTop = heights[i - 1] + (heights[i] - heights[i - 1]) * (t / length) + EXPRESSWAY_DECK_THICKNESS;
          lamp(a.x + dx * t - dz * side * 5.1, a.z + dz * t + dx * side * 5.1, -dz * side, dx * side, deckTop, yaw, 5.1, EXPRESSWAY_DECK_WIDTH / 2 - 0.3);
        }
        carry = (length - (14 - carry)) % 34;
      }
    }
    poles.count = lamps; headMesh.count = lamps; poolMesh.count = lamps;
    for (const mesh of [poles, headMesh, poolMesh]) { mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false; }
    // 高架灯带：沿环线两侧护栏上沿的发光细条（桥面高 8.2，护栏在 ±5.1）。
    let strip = 0;
    for (const run of this.layout.highways ?? []) {
      const heights = expresswayDeckHeights(run, (x, z) => this.layout.terrain.height(x, z));
      for (let i = 1; i < run.length && strip < 2190; i += 1) {
        const a = run[i - 1]; const b = run[i];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 6) continue;
        if (Math.abs(heights[i] - heights[i - 1]) > 0.15) continue; // 匝道坡段不挂水平灯带（会悬空/插进桥面）
        const yaw = -Math.atan2(b.z - a.z, b.x - a.x);
        const sx = Math.sin(yaw); const sz = Math.cos(yaw);
        for (const offset of [-5.1, 5.1]) {
          this.compose((a.x + b.x) / 2 + sx * offset, (heights[i] + heights[i - 1]) / 2 + EXPRESSWAY_DECK_THICKNESS + 0.35, (a.z + b.z) / 2 + sz * offset, yaw, length, 0.14, 0.14);
          stripMesh.setMatrixAt(strip, this.matrix);
          strip += 1;
        }
      }
    }
    stripMesh.count = strip;
    stripMesh.instanceMatrix.needsUpdate = true;
    stripMesh.frustumCulled = false;
    this.disposables.push(heads, pools, strips, neon);
    return { heads, pools, strips, neon };
  }

  /** 致敬型地标（程序化几何，不复刻具体建筑）。城市身份地标有 70 单位最低天际线预算，
   *  不随会话数缩小；会话楼仍保留真实 token 高度，数据建筑与装饰地标语义分离。 */
  private buildLandmarks(): void {
    const landmarks = this.layout.landmarks ?? [];
    if (!landmarks.length) return;
    const tallest = Math.max(30, ...this.model.buildings.map((building) => building.height));
    const cap = Math.max(70, tallest * 0.9);
    const neon = activeTheme().neon;
    const material = (color: string, emissive = 0) => {
      const m = new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(emissive) });
      this.disposables.push(m);
      return m;
    };
    const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, ry = 0) => {
      const m = new THREE.Mesh(geometry, mat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      this.disposables.push(geometry);
      return m;
    };
    const white = material("#f3f1ea");
    const steel = material("#c9cfd3");
    const red = material("#c8473a");
    for (const landmark of landmarks) {
      const group = new THREE.Group();
      const ground = Math.max(0.3, this.layout.terrain.height(landmark.x, landmark.z));
      group.position.set(landmark.x, ground, landmark.z);
      group.rotation.y = landmark.yaw;
      if (landmark.kind === "tv-tower") {
        const h = Math.min(cap, 70);
        mesh(new THREE.CylinderGeometry(1.6, 3.2, h * 0.78, 12).translate(0, h * 0.39, 0), steel, group, 0, 0, 0);
        mesh(new THREE.SphereGeometry(5.5, 18, 12).scale(1, 0.55, 1), white, group, 0, h * 0.72, 0);
        mesh(new THREE.TorusGeometry(6.2, 0.5, 6, 32).rotateX(Math.PI / 2), material("#7fb4c2", neon ? 0.8 : 0.2), group, 0, h * 0.72, 0);
        mesh(new THREE.CylinderGeometry(0.25, 0.45, h * 0.24, 6).translate(0, h * 0.12, 0), red, group, 0, h * 0.78, 0);
      } else if (landmark.kind === "twin-towers") {
        // Miami Tropical Deco 双塔：白色塔身 + 浅青玻璃带窗、每层带一道白色「眉檐」遮阳板、四角粉彩竖鳍、
        // 阶梯式（ziggurat）塔冠与霓虹勾边。曾用夜景窗格贴图乘粉彩色：贴图本身偏暗，乘出来两栋漆黑（真机截图）。
        const h = Math.min(cap, 62);
        const canvas = createRenderCanvas(); canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#f6f3ec"; ctx.fillRect(0, 0, 64, 64);              // 白色外墙
          ctx.fillStyle = "#8fd3dc"; ctx.fillRect(4, 18, 56, 30);             // 带窗（浅青玻璃）
          ctx.fillStyle = "#b9e6ec"; ctx.fillRect(4, 18, 56, 6);              // 玻璃上沿反光
          ctx.fillStyle = "#e9e4da"; for (let x = 4; x < 64; x += 14) ctx.fillRect(x, 18, 2, 30); // 窗棂
        }
        const facade = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
        facade.colorSpace = THREE.SRGBColorSpace;
        facade.wrapS = facade.wrapT = THREE.RepeatWrapping;
        const floors = Math.max(8, Math.round(h / 4));
        facade.repeat.set(3, floors);
        // 少量自发光托底：暖色夕照下纯 Lambert 白墙读成米褐色（截图实测），粉彩鳍读成暗红/墨绿。
        const wall = new THREE.MeshLambertMaterial({ map: facade, emissive: new THREE.Color("#3a3936"), emissiveMap: facade });
        // 夜景亮窗：玻璃幕墙夜里要开灯（真机夜景：双塔窗格全暗）。一张 4 层高的亮窗图（黑墙 + 暖色窗格，
        // 随机约 30% 熄灯），按层平铺；setNightGlow 在夜里把 emissiveMap 换成它并按夜色加亮。
        const litCanvas = createRenderCanvas(); litCanvas.width = 64; litCanvas.height = 256;
        const lctx = litCanvas.getContext("2d");
        if (lctx) {
          lctx.fillStyle = "#000000"; lctx.fillRect(0, 0, 64, 256);
          for (let floor = 0; floor < 4; floor += 1) for (let cell = 0; cell < 4; cell += 1) {
            const on = hashSeed(`twin-window:${floor}:${cell}`);
            if (on < 0.3) continue;
            lctx.fillStyle = on > 0.85 ? "#bfe9ff" : "#ffd89a";
            lctx.fillRect(4 + cell * 14 + 2, floor * 64 + 18, 12, 30);
          }
        }
        const lit = new THREE.CanvasTexture(litCanvas as HTMLCanvasElement);
        lit.colorSpace = THREE.SRGBColorSpace;
        lit.wrapS = lit.wrapT = THREE.RepeatWrapping;
        lit.repeat.set(3, floors / 4);
        this.landmarkWindows.push({ material: wall, day: facade, lit, dayEmissive: new THREE.Color("#3a3936") });
        this.disposables.push(wall, facade, lit);
        const eyebrow = material("#ffffff", 0.25);
        for (const side of [-1, 1]) {
          const accent = material(side < 0 ? "#8fe0e6" : "#f7b3cf", 0.3);
          const glow = material(side < 0 ? "#6ff2ff" : "#ff7ac8", neon ? 1.6 : 0.5);
          const cx = side * 13;
          mesh(new THREE.BoxGeometry(12, h, 12).translate(0, h / 2, 0), wall, group, cx, 0, 0);
          // 眉檐：每层一道薄板，四面出挑 0.9。
          const ledges = new THREE.InstancedMesh(new THREE.BoxGeometry(13.8, 0.28, 13.8), eyebrow, floors);
          for (let f = 0; f < floors; f += 1) {
            this.compose(0, ((f + 1) * h) / floors - h / floors * 0.22, 0, 0, 1, 1, 1);
            ledges.setMatrixAt(f, this.matrix);
          }
          ledges.position.set(cx, 0, 0); ledges.castShadow = true;
          group.add(ledges); this.disposables.push(ledges.geometry);
          // 四角粉彩竖鳍。
          for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(new THREE.BoxGeometry(0.9, h + 1.5, 0.9).translate(0, (h + 1.5) / 2, 0), accent, group, cx + fx * 6.1, 0, fz * 6.1);
          // 阶梯塔冠：三级收分 + 旗杆尖。
          let top = h;
          for (const [w, t] of [[10, 3], [7.5, 3], [5, 3.5]] as Array<[number, number]>) {
            mesh(new THREE.BoxGeometry(w, t, w).translate(0, t / 2, 0), white, group, cx, top, 0);
            mesh(new THREE.BoxGeometry(w + 0.3, 0.35, w + 0.3), glow, group, cx, top + t, 0); // 每级霓虹勾边
            top += t;
          }
          mesh(new THREE.CylinderGeometry(0.15, 0.3, 7, 6).translate(0, 3.5, 0), steel, group, cx, top, 0);
          // 塔身竖向霓虹（朝外一面中线）。
          mesh(new THREE.BoxGeometry(0.35, h * 0.85, 0.35).translate(0, h * 0.425, 0), glow, group, cx + side * 6.15, h * 0.08, 0);
        }
        // 双塔连廊（白色，霓虹下沿）。
        mesh(new THREE.BoxGeometry(14, 2.6, 3.4).translate(0, 1.3, 0), white, group, 0, h * 0.55, 0);
      } else if (landmark.kind === "twist-tower") {
        const h = Math.min(cap, 66);
        const floors = 22;
        const floorGeometry = new THREE.BoxGeometry(1, 1, 1);
        const floorMaterial = material("#ffffff");
        const floorMesh = new THREE.InstancedMesh(floorGeometry, floorMaterial, floors);
        const palette = ["#68c9d0", "#d78db3", "#9b9be0"];
        for (let i = 0; i < floors; i += 1) {
          this.compose(0, ((i + 0.5) * h) / floors, 0, (i / floors) * Math.PI * 0.5, 12, (h / floors) * 0.9, 12);
          floorMesh.setMatrixAt(i, this.matrix);
          floorMesh.setColorAt(i, this.color.set(palette[i % palette.length]));
        }
        floorMesh.instanceMatrix.needsUpdate = true;
        if (floorMesh.instanceColor) floorMesh.instanceColor.needsUpdate = true;
        floorMesh.castShadow = floorMesh.receiveShadow = true;
        floorMesh.name = "city-landmark-twisting-deco-tower";
        group.add(floorMesh);
        this.disposables.push(floorGeometry, floorMaterial);
      } else if (landmark.kind === "arch") {
        const h = Math.min(cap, 26);
        for (const side of [-1, 1]) mesh(new THREE.BoxGeometry(5, h, 7).translate(0, h / 2, 0), white, group, side * 8, 0, 0);
        mesh(new THREE.BoxGeometry(21, 6, 7.4).translate(0, 3, 0), white, group, 0, h, 0);
        mesh(new THREE.BoxGeometry(22, 1, 8).translate(0, 0.5, 0), material("#d9d3c2"), group, 0, h + 6, 0);
      } else if (landmark.kind === "sail-opera") {
        mesh(new THREE.BoxGeometry(46, 3, 26).translate(0, 1.5, 0), material("#d9d3c2"), group, 0, 0, 0);
        // 帆：半个穹顶（半球再切一半）拉成薄而高的壳，开口朝前；双面材质（开口里也要看得见内壁）。
        const sail = new THREE.MeshLambertMaterial({ color: "#f6f4ee", side: THREE.DoubleSide });
        this.disposables.push(sail);
        const shells = 4;
        for (let i = 0; i < shells; i += 1) {
          const size = 13 - i * 2;
          const shell = new THREE.SphereGeometry(size, 20, 12, Math.PI / 2, Math.PI, 0, Math.PI / 2).scale(0.75, 1.6, 0.9);
          const m = mesh(shell, sail, group, -15 + i * 9.5, 3, 0, 0);
          m.rotation.z = -0.18;
        }
      } else if (landmark.kind === "lighthouse") {
        const h = Math.min(cap, 32);
        const bands = 6;
        for (let i = 0; i < bands; i += 1) {
          const r0 = 3.4 - (i / bands) * 1.4; const r1 = 3.4 - ((i + 1) / bands) * 1.4;
          mesh(new THREE.CylinderGeometry(r1, r0, h / bands, 14).translate(0, h / bands / 2, 0), i % 2 ? red : white, group, 0, (i * h) / bands, 0);
        }
        mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, 10).translate(0, 1.5, 0), material("#fff2c0", 1.5), group, 0, h, 0);
        mesh(new THREE.ConeGeometry(2.8, 3, 10).translate(0, 1.5, 0), red, group, 0, h + 3, 0);
        if (neon) {
          // 旋转光束：两束对向的加色锥，绕竖轴转（进 bloom）。
          const beamMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff2c0").multiplyScalar(1.6), transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
          this.disposables.push(beamMaterial);
          const beam = new THREE.Group();
          beam.position.set(0, h + 1.5, 0);
          for (const side of [-1, 1]) {
            const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 160, 16, 1, true).translate(0, -90, 0).rotateZ((side * Math.PI) / 2), beamMaterial);
            this.disposables.push(cone.geometry);
            beam.add(cone);
          }
          group.add(beam);
          this.landmarkSpinners.push({ object: beam, axis: "y", speed: 0.9 });
        }
      } else if (landmark.kind === "ferris-wheel") {
        // 远景里曾显得很小（多视角评估）：半径 20 → 26。
        const radius = Math.min(cap * 0.5, 26);
        for (const side of [-1, 1]) {
          mesh(new THREE.BoxGeometry(1, radius + 4, 1).translate(0, (radius + 4) / 2, 0), steel, group, -4, 0, side * 3).rotation.z = side * 0.18;
          mesh(new THREE.BoxGeometry(1, radius + 4, 1).translate(0, (radius + 4) / 2, 0), steel, group, 4, 0, side * 3).rotation.z = -side * 0.18;
        }
        const wheel = new THREE.Group();
        wheel.position.set(0, radius + 4, 0);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.45, 6, 48), material("#e8eef0", neon ? 0.6 : 0));
        this.disposables.push(ring.geometry);
        wheel.add(ring);
        const cabins = 16;
        for (let i = 0; i < cabins; i += 1) {
          const t = (i / cabins) * Math.PI * 2;
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.25, radius, 0.25).translate(0, radius / 2, 0), steel);
          spoke.rotation.z = t;
          this.disposables.push(spoke.geometry);
          wheel.add(spoke);
          const cabin = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material(["#ff6f61", "#ffd166", "#06d6a0", "#118ab2"][i % 4], neon ? 0.5 : 0));
          cabin.position.set(Math.cos(t) * radius, Math.sin(t) * radius, 0);
          this.disposables.push(cabin.geometry);
          wheel.add(cabin);
        }
        group.add(wheel);
        this.landmarkSpinners.push({ object: wheel, axis: "z", speed: 0.08 });
      } else if (landmark.kind === "pagoda") {
        const tiers = 7;
        let y = 0;
        mesh(new THREE.BoxGeometry(16, 2, 16).translate(0, 1, 0), material("#d9d3c2"), group, 0, 0, 0);
        y = 2;
        const roof = material("#3d5a4f");
        const wall = material("#b5463a");
        for (let i = 0; i < tiers; i += 1) {
          const w = 10 - i * 1.1;
          mesh(new THREE.BoxGeometry(w, 3.6, w).translate(0, 1.8, 0), wall, group, 0, y, 0);
          // 檐：四棱锥扁台，比墙宽一圈，角略上翘的感觉靠「宽而薄」。
          mesh(new THREE.ConeGeometry(w * 0.95, 1.6, 4).rotateY(Math.PI / 4).translate(0, 0.8, 0), roof, group, 0, y + 3.6, 0);
          y += 4.4;
        }
        mesh(new THREE.CylinderGeometry(0.2, 0.35, 6, 6).translate(0, 3, 0), material("#c9a24a"), group, 0, y, 0);
      } else if (landmark.kind === "suspension-bridge" && landmark.to) {
        // 悬索桥：沿既有过河桥加两座门式塔与主缆、吊索（路网不变，只是换造型）。
        // 桥面高度与 buildInfrastructure 的桥面一致（两端地形高度的较大者）；塔、吊索都以它为底。
        // 曾把主缆写成整段抛物线并且塔底/吊索底硬编码在 y=0/8.2：塔外侧 |local|>1 时抛物线反向上翘，
        // 两侧缆索飞到塔顶之上（用户截图「两边桥上天了」）——主缆现在只在两塔之间是悬链，塔外是落到桥面的斜拉后锚。
        group.position.set(landmark.x, 0, landmark.z);
        group.rotation.y = -Math.atan2(landmark.to.z - landmark.z, landmark.to.x - landmark.x);
        const span = Math.hypot(landmark.to.x - landmark.x, landmark.to.z - landmark.z);
        const deckY = Math.max(0.3, this.layout.terrain.height(landmark.x, landmark.z), this.layout.terrain.height(landmark.to.x, landmark.to.z));
        const towerH = 34;
        const topY = deckY + towerH - 1;
        const t0 = span * 0.18;
        const t1 = span * 0.82;
        const mid = (t0 + t1) / 2;
        const lowY = deckY + 9;
        const towerMaterial = material("#c8473a");
        for (const x of [t0, t1]) {
          for (const side of [-1, 1]) mesh(new THREE.BoxGeometry(1.6, towerH, 1.6).translate(0, towerH / 2, 0), towerMaterial, group, x, deckY, side * 5.5);
          mesh(new THREE.BoxGeometry(1.6, 1.6, 12.6).translate(0, 0.8, 0), towerMaterial, group, x, deckY + towerH - 4, 0);
        }
        const lights = this.nightLights;
        const bulbs: Array<[number, number, number, number]> = []; // x,y,z,kind(0 = 暖灯, 1 = 霓虹)
        const cableY = (x: number) => {
          if (x < t0) return deckY + 1 + (x / Math.max(1, t0)) * (topY - deckY - 1);
          if (x > t1) return deckY + 1 + ((span - x) / Math.max(1, span - t1)) * (topY - deckY - 1);
          const c = (x - mid) / ((t1 - t0) / 2);
          return lowY + (topY - lowY) * c * c;
        };
        for (const side of [-1, 1]) {
          const points: THREE.Vector3[] = [];
          for (let i = 0; i <= 40; i += 1) {
            const x = (i / 40) * span;
            points.push(new THREE.Vector3(x, cableY(x), side * 5.5));
          }
          const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, 0.3, 5), steel);
          this.disposables.push(cable.geometry);
          group.add(cable);
          // 吊索：只在两塔之间，从桥面立起到主缆。
          for (let x = t0 + 3; x < t1 - 2; x += 4) {
            const y = cableY(x);
            const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.12, y - deckY - 0.9, 0.12).translate(0, (y - deckY - 0.9) / 2, 0), steel);
            hanger.position.set(x, deckY + 0.9, side * 5.5);
            this.disposables.push(hanger.geometry);
            group.add(hanger);
            bulbs.push([x, y - 0.5, side * 5.5, 0]);
          }
          // 桥面护栏灯串与塔身霓虹。
          for (let x = 4; x < span - 3; x += 7) bulbs.push([x, deckY + 1.1, side * 5.2, 0]);
          for (const tx of [t0, t1]) {
            bulbs.push([tx, deckY + towerH + 0.4, side * 5.5, 1]);
            for (let k = 1; k <= 4; k += 1) bulbs.push([tx, deckY + (towerH * k) / 5, side * 5.5 + side * 0.9, 1]);
          }
        }
        if (lights && bulbs.length) {
          const place = (list: typeof bulbs, material: THREE.Material, size: number, neonTint: boolean) => {
            if (!list.length) return;
            const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(size, size, size), material, list.length);
            list.forEach((b, i) => {
              this.matrix.compose(this.positionVector.set(b[0], b[1], b[2]), this.quaternion.identity(), this.scaleVector.set(1, 1, 1));
              instanced.setMatrixAt(i, this.matrix);
              if (neonTint) instanced.setColorAt(i, this.color.set(i % 2 === 0 ? "#38e8ff" : "#ff4fd8"));
            });
            instanced.instanceMatrix.needsUpdate = true;
            if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
            instanced.frustumCulled = false;
            this.disposables.push(instanced.geometry);
            group.add(instanced);
          };
          place(bulbs.filter((b) => b[3] === 0), lights.heads, 0.5, false);
          place(bulbs.filter((b) => b[3] === 1), lights.neon, 0.9, true);
        }
      }
      group.name = `city-landmark-${landmark.kind}`;
      this.group.add(group);
    }
  }

  /** 学校 / 商场 / 医院：由方块与圆柱拼成，局部坐标按街区朝向旋转。纯装饰，不进拾取。 */
  private buildCivics(): void {
    const civics = this.layout.civics ?? [];
    if (!civics.length) return;
    type Piece = (typeof this.civicPieces)[number];
    const boxes: Piece[] = [];
    const cylinders: Piece[] = [];
    const glows: Piece[] = [];
    const colors: [string[], string[], string[]] = [[], [], []];
    civics.forEach((civic, civicIndex) => {
      const cos = Math.cos(civic.yaw);
      const sin = Math.sin(civic.yaw);
      const base = Math.max(0.3, civic.y);
      const W = Math.min(civic.width, 48) * 0.82;
      const D = Math.min(civic.depth, 40) * 0.82;
      const at = (lx: number, lz: number) => ({ x: civic.x + lx * cos + lz * sin, z: civic.z - lx * sin + lz * cos });
      const box = (lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: string) => {
        const q = at(lx, lz);
        boxes.push({ civic: civicIndex, mesh: 0, index: boxes.length, x: q.x, y: base + ly, z: q.z, sx, sy, sz, yaw: civic.yaw, baseY: base });
        colors[0].push(color);
      };
      const cyl = (lx: number, ly: number, lz: number, r: number, h: number, color: string) => {
        const q = at(lx, lz);
        cylinders.push({ civic: civicIndex, mesh: 1, index: cylinders.length, x: q.x, y: base + ly, z: q.z, sx: r, sy: h, sz: r, yaw: 0, baseY: base });
        colors[1].push(color);
      };
      // 夜间边缘光：随同一座配套一起生长（同一套 baseY/progress），挂第三个实例网格。
      const glow = (lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: string) => {
        const q = at(lx, lz);
        glows.push({ civic: civicIndex, mesh: 2, index: glows.length, x: q.x, y: base + ly, z: q.z, sx, sy, sz, yaw: civic.yaw, baseY: base });
        colors[2].push(color);
      };
      if (civic.kind === "school") {
        // U 形教学楼 + 操场（绿茵 + 红色跑道）+ 旗杆。
        box(-W * 0.38, 0, -D * 0.18, W * 0.2, 9, D * 0.6, "#e9d9b8");
        box(W * 0.38, 0, -D * 0.18, W * 0.2, 9, D * 0.6, "#e9d9b8");
        box(0, 0, -D * 0.42, W * 0.96, 11, D * 0.16, "#f1e4c6");
        box(0, 11, -D * 0.42, W * 0.96, 0.6, D * 0.18, "#b5533c");
        box(0, 0.05, D * 0.22, W * 0.62, 0.12, D * 0.42, "#b8574a");
        box(0, 0.1, D * 0.22, W * 0.5, 0.14, D * 0.3, "#6fa65a");
        cyl(W * 0.42, 0, D * 0.4, 0.15, 12, "#d8dcdc");
        box(W * 0.42 + 1.1, 10.4, D * 0.4, 2, 1.3, 0.1, "#d84b3a");
        glow(0, 11.6, -D * 0.42, W * 0.96, 0.22, 0.22, "#ffd08a");
        glow(-W * 0.38, 9, -D * 0.18 + D * 0.3, W * 0.2, 0.22, 0.22, "#ffd08a");
        glow(W * 0.38, 9, -D * 0.18 + D * 0.3, W * 0.2, 0.22, 0.22, "#ffd08a");
        glow(0, 0.3, D * 0.22, W * 0.62, 0.14, 0.2, "#46e6ff");
      } else if (civic.kind === "mall") {
        // 大体量低层 + 玻璃中庭 + 屋顶停车场 + 招牌塔。
        box(0, 0, 0, W, 10, D, "#d9d3c7");
        box(0, 10, 0, W * 0.98, 0.4, D * 0.98, "#6e7275");
        for (let row = -2; row <= 2; row += 1) box(W * 0.15, 10.45, row * D * 0.16, W * 0.5, 0.06, 0.25, "#e8e3c8");
        box(-W * 0.3, 0, 0, W * 0.24, 13, D * 0.5, "#6f9fb6");
        cyl(-W * 0.3, 13, 0, Math.min(W, D) * 0.12, 2.5, "#9ac4d4");
        box(W * 0.42, 0, -D * 0.42, 3.2, 20, 3.2, "#2f6f8f");
        box(W * 0.42, 15, -D * 0.42 - 1.7, 6, 4, 0.3, "#ff6f61");
        glow(W * 0.42, 15, -D * 0.42 - 1.9, 6, 4, 0.1, "#ff4fd8"); // 招牌发光
        glow(0, 10.5, D * 0.5, W, 0.22, 0.22, "#ff4fd8");
        glow(0, 10.5, -D * 0.5, W, 0.22, 0.22, "#46e6ff");
        glow(-W * 0.3, 13.4, 0, Math.min(W, D) * 0.25, 0.22, Math.min(W, D) * 0.25, "#46e6ff");
      } else {
        // 医院：白色主楼 + 两翼 + 红十字 + 屋顶停机坪。
        box(0, 0, 0, W * 0.34, 22, D * 0.44, "#f4f5f2");
        box(-W * 0.32, 0, D * 0.06, W * 0.3, 12, D * 0.34, "#ecefea");
        box(W * 0.32, 0, D * 0.06, W * 0.3, 12, D * 0.34, "#ecefea");
        cyl(0, 22, 0, Math.min(W, D) * 0.16, 0.4, "#5d6266");
        box(0, 22.42, 0, Math.min(W, D) * 0.16, 0.05, 1.2, "#f2f2ee");
        box(0, 16, D * 0.225, 1.4, 5, 0.3, "#e0352b");
        box(0, 16, D * 0.225, 5, 1.4, 0.3, "#e0352b");
        box(0, 0, D * 0.36, W * 0.3, 3.4, 4, "#d84a3d");
        glow(0, 16, D * 0.235, 1.2, 4.8, 0.1, "#ff4a3d"); // 红十字发光
        glow(0, 16, D * 0.235, 4.8, 1.2, 0.1, "#ff4a3d");
        glow(0, 22.2, 0, W * 0.34, 0.22, D * 0.44, "#7fe8ff");
        glow(0, 3.5, D * 0.36 + 2, W * 0.3, 0.22, 0.22, "#ff4a3d");
      }
    });
    const build = (geometry: THREE.BufferGeometry, pieces: Piece[], palette: string[], name: string) => {
      const mesh = this.makeInstanced(geometry.clone(), selfLitMaterial(0.18), Math.max(1, pieces.length));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = pieces.length;
      palette.forEach((color, index) => mesh.setColorAt(index, this.color.set(color)));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.name = name;
      return mesh;
    };
    const glowMesh = this.nightLights
      ? new THREE.InstancedMesh(BOX.clone(), this.nightLights.neon, Math.max(1, glows.length))
      : build(BOX, glows, colors[2], "city-civic-glow");
    glowMesh.count = glows.length;
    if (this.nightLights) {
      colors[2].forEach((color, index) => glowMesh.setColorAt(index, this.color.set(color)));
      if (glowMesh.instanceColor) glowMesh.instanceColor.needsUpdate = true;
      glowMesh.frustumCulled = false;
      glowMesh.name = "city-civic-glow";
      this.group.add(glowMesh);
      this.disposables.push(glowMesh.geometry);
    }
    this.civicMeshes = [build(BOX, boxes, colors[0], "city-civic-boxes"), build(CYLINDER, cylinders, colors[1], "city-civic-cylinders"), glowMesh];
    this.civicPieces = [...boxes, ...cylinders, ...glows];
    this.civicProgress = civics.map(() => 1);
    this.civicTarget = civics.map(() => 1);
    for (let index = 0; index < civics.length; index += 1) this.writeCivic(index);
  }

  /** 按进度写一座配套的部件矩阵：从地面纵向长出来（y 方向缩放），进度 0 时整座藏起。 */
  private writeCivic(civicIndex: number): void {
    const progress = this.civicProgress[civicIndex];
    const ease = progress * progress * (3 - 2 * progress);
    for (const piece of this.civicPieces) {
      if (piece.civic !== civicIndex) continue;
      if (ease <= 0.001) this.compose(piece.x, -40, piece.z, 0, 0, 0, 0);
      else this.compose(piece.x, piece.baseY + (piece.y - piece.baseY) * ease, piece.z, piece.yaw, piece.sx, piece.sy * ease, piece.sz);
      this.civicMeshes[piece.mesh].setMatrixAt(piece.index, this.matrix);
    }
    for (const mesh of this.civicMeshes) mesh.instanceMatrix.needsUpdate = true;
  }

  private updateCivics(dt: number): void {
    for (let index = 0; index < this.civicTarget.length; index += 1) {
      const current = this.civicProgress[index];
      const target = this.civicTarget[index];
      if (current === target) continue;
      this.civicProgress[index] = target > current ? Math.min(target, current + dt / 1.2) : Math.max(target, current - dt / 0.6);
      this.writeCivic(index);
    }
  }

  /** 屋顶轮廓选择：只依赖 (分区, 楼型, 立面, seed)，同一份数据永远同一种屋顶。 */
  private roofKindFor(building: CityBuilding, facade: number): number {
    if (facade === 3) return 0; // 装饰艺术楼有自己的阶梯冠
    const zone = this.zoneById.get(building.id);
    const r = building.seed;
    if (this.formOf(building) === "landmark" || this.formOf(building) === "tower") return r > 0.66 ? 2 : r > 0.3 ? 3 : 0;
    if ((zone === "residential" || zone === "waterfront") && building.height < 30) return r < 0.55 ? 1 : 0;
    if (zone === "commercial") return r < 0.4 ? 4 : r < 0.6 ? 3 : 0;
    if (zone === "downtown") return r < 0.35 ? 3 : 0;
    return 0;
  }

  /** 地标塔冠顶：金属尖顶 + 三道自发光灯环；日落霓虹主题再加一道向上的光束（进 bloom）。 */
  private buildHeroCrown(hero: BuildingRuntime): void {
    const palette = paletteFor(hero.building.districtId);
    const spireMaterial = new THREE.MeshLambertMaterial({ color: "#dfe6ea", emissive: new THREE.Color(palette.accent).multiplyScalar(0.12) });
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 8, 1).translate(0, 0.5, 0), spireMaterial);
    spire.castShadow = true;
    const ringMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.accent).multiplyScalar(activeTheme().neon ? 3 : 1.4), toneMapped: false });
    const rings = [0, 1, 2].map(() => new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40).rotateX(Math.PI / 2), ringMaterial));
    let beam: THREE.Mesh | null = null;
    const disposables: Array<{ dispose(): void }> = [spire.geometry, spireMaterial, ringMaterial, ...rings.map((ring) => ring.geometry)];
    if (activeTheme().neon) {
      const beamMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.accent).lerp(new THREE.Color("#ffffff"), 0.4).multiplyScalar(2.2), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      // 光柱自下而上淡出（加色混合下顶点色 → 黑 = 透明）：曾是等亮度的 900 高圆柱，近看顶端是一截平切的白块。
      const beamGeometry = new THREE.CylinderGeometry(0.6, 1.6, 1, 16, 6, true).translate(0, 0.5, 0);
      const fade = new Float32Array(beamGeometry.attributes.position.count * 3);
      for (let i = 0; i < beamGeometry.attributes.position.count; i += 1) {
        const y = beamGeometry.attributes.position.getY(i);
        const k = Math.min(1, y / 0.03) * Math.pow(1 - y, 1.6); // 底部 ~12 单位淡入：近看不再是一截硬边白块
        fade[i * 3] = fade[i * 3 + 1] = fade[i * 3 + 2] = k;
      }
      beamGeometry.setAttribute("color", new THREE.BufferAttribute(fade, 3));
      beamMaterial.vertexColors = true;
      beamMaterial.visible = false; // 只在夜里亮（setNightGlow），白天天上不再挂一根白线
      beam = new THREE.Mesh(beamGeometry, beamMaterial);
      beam.renderOrder = 5;
      disposables.push(beam.geometry, beamMaterial);
      this.group.add(beam);
    }
    this.group.add(spire, ...rings);
    this.disposables.push(...disposables);
    this.heroParts = { spire, rings, beam };
  }

  private placeHeroCrown(x: number, top: number, z: number, width: number, depth: number, h: number, capped: boolean): void {
    const parts = this.heroParts;
    if (!parts) return;
    const visible = capped;
    const radius = Math.min(width, depth) * 0.42;
    const spireHeight = Math.max(14, h * 0.4);
    parts.spire.visible = visible;
    parts.spire.position.set(x, top, z);
    parts.spire.scale.set(radius, spireHeight, radius);
    parts.rings.forEach((ring, index) => {
      ring.visible = visible;
      const t = 0.12 + index * 0.2;
      ring.position.set(x, top + spireHeight * t, z);
      const r = radius * (1 - t) + 0.6;
      ring.scale.set(r, 1, r);
    });
    if (parts.beam) {
      parts.beam.visible = visible;
      parts.beam.position.set(x, top + spireHeight, z);
      parts.beam.scale.set(1, 420, 1);
    }
  }

  /** 分区驱动立面：downtown 玻璃 / commercial 横带 / residential 窗洞 /
   *  waterfront 混合。无地块信息的楼（不应出现）退回模型层的 hash 立面。 */
  /** 城区地标（S5「每个区也需要有自己的地标建筑物」）：离城区中心最近的空地块上一座三级收分的装饰艺术塔，
   *  墙身取区色粉彩、玻璃带窗、霓虹勾边与塔尖，夜里亮窗（与双子塔同一套 landmarkWindows）。
   *  高度取本区最高会话楼 × 1.15（58–110）——城区天际线的峰值；装饰，不代表会话。 */
  private buildDistrictLandmarks(): void {
    const neon = activeTheme().neon;
    for (const spot of this.layout.districtLandmarks ?? []) {
      const palette = paletteFor(spot.districtId);
      const tallest = Math.max(0, ...this.model.buildings.filter((b) => b.districtId === spot.districtId).map((b) => b.height));
      const h = Math.max(58, Math.min(110, tallest * 1.15));
      const day = createRenderCanvas(); day.width = 64; day.height = 64;
      const dctx = day.getContext("2d");
      if (dctx) {
        dctx.fillStyle = "#ffffff"; dctx.fillRect(0, 0, 64, 64);
        dctx.fillStyle = "#9fd6e0"; dctx.fillRect(6, 16, 52, 34);
        dctx.fillStyle = "#c8ecf2"; dctx.fillRect(6, 16, 52, 6);
        dctx.fillStyle = "#eeeeee"; for (let x = 6; x < 64; x += 13) dctx.fillRect(x, 16, 2, 34);
      }
      const lit = createRenderCanvas(); lit.width = 64; lit.height = 256;
      const lctx = lit.getContext("2d");
      if (lctx) {
        lctx.fillStyle = "#000000"; lctx.fillRect(0, 0, 64, 256);
        for (let floor = 0; floor < 4; floor += 1) for (let cell = 0; cell < 4; cell += 1) {
          const on = hashSeed(`district-window:${spot.districtId}:${floor}:${cell}`);
          if (on < 0.3) continue;
          lctx.fillStyle = on > 0.85 ? "#bfe9ff" : "#ffd89a";
          lctx.fillRect(6 + cell * 13 + 1, floor * 64 + 16, 11, 34);
        }
      }
      const floors = Math.max(8, Math.round(h / 4));
      const dayTexture = new THREE.CanvasTexture(day as HTMLCanvasElement);
      const litTexture = new THREE.CanvasTexture(lit as HTMLCanvasElement);
      for (const texture of [dayTexture, litTexture]) { texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; }
      dayTexture.repeat.set(3, floors); litTexture.repeat.set(3, floors / 4);
      const pastel = new THREE.Color(palette.accent).lerp(new THREE.Color("#ffffff"), 0.55);
      const wall = new THREE.MeshLambertMaterial({ map: dayTexture, color: pastel, emissive: new THREE.Color("#3a3936"), emissiveMap: dayTexture });
      this.landmarkWindows.push({ material: wall, day: dayTexture, lit: litTexture, dayEmissive: new THREE.Color("#3a3936") });
      const trim = new THREE.MeshLambertMaterial({ color: "#ffffff", emissive: new THREE.Color("#ffffff").multiplyScalar(0.2) });
      const glow = new THREE.MeshLambertMaterial({ color: palette.accent, emissive: new THREE.Color(palette.accent).multiplyScalar(neon ? 1.4 : 0.45) });
      const group = new THREE.Group();
      group.name = `city-landmark-district:${spot.districtId}`;
      group.position.set(spot.x, Math.max(0.3, spot.y), spot.z);
      group.rotation.y = spot.yaw;
      const add = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number) => {
        const mesh = new THREE.Mesh(geometry, material); mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh); this.disposables.push(geometry);
      };
      add(new THREE.BoxGeometry(17, 4, 17).translate(0, 2, 0), trim, 0);                          // 裙楼
      let y = 4;
      for (const [w, share] of [[12, 0.55], [9.5, 0.27], [7, 0.18]] as Array<[number, number]>) {
        const height = (h - 4) * share;
        add(new THREE.BoxGeometry(w, height, w).translate(0, height / 2, 0), wall, y);
        add(new THREE.BoxGeometry(w + 0.6, 0.45, w + 0.6), glow, y + height);                      // 每级霓虹勾边
        y += height;
      }
      add(new THREE.CylinderGeometry(0.2, 0.5, 9, 6).translate(0, 4.5, 0), trim, y);              // 塔尖
      this.group.add(group);
      this.disposables.push(dayTexture, litTexture, wall, trim, glow);
    }
  }

  private landValueCache: Map<string, number> | null = null;
  /** 地价驱动形态（S5，用户「同区建筑颜色风格一致，但形态随地块价值变化」）：区内地价前 25% 读作
   *  塔楼（细、退台、塔冠），后 30% 读作板楼/街坊楼（宽、浅）；中段保留数据给的原型；数据地标原样。
   *  楼高不动——token 决定大小，地价只决定长成什么样。 */
  private formOf(building: CityBuilding): CityBuilding["archetype"] {
    if (building.archetype === "landmark") return "landmark";
    if (!this.landValueCache) {
      this.landValueCache = new Map();
      // 区内相对地价（百分位）：绝对值在各区都偏低（实测最高 0.55），绝对阈值一栋塔都切不出来；
      // 地价本来就是相对的——区内最贵的四分之一盖塔楼，最便宜的三成盖板楼/街坊楼。
      for (const district of this.layout.districts) {
        const ranked = [...(district.landValue ?? [])].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
        ranked.forEach(([id], index) => this.landValueCache!.set(id, ranked.length > 1 ? index / (ranked.length - 1) : 0.5));
      }
    }
    const percentile = this.landValueCache.get(building.id);
    if (percentile === undefined) return building.archetype;
    return percentile >= 0.75 ? "tower" : percentile < 0.3 ? (building.seed < 0.5 ? "slab" : "block") : building.archetype;
  }

  private percentileOf(building: CityBuilding): number | undefined {
    if (!this.landValueCache) this.formOf(building);
    return this.landValueCache?.get(building.id);
  }


  private facadeFor(building: CityBuilding): number {
    const zone = this.zoneById.get(building.id);
    if (!zone) return building.facade;
    // 海滨（非地标、楼高 ≤ 36）→ 装饰艺术灰泥立面：粉彩墙、水平饰带、圆角转角。曾限定「低于 22」，
    // 但楼高由 token 决定，真实会话几乎都高于 22，一栋都没命中；迈阿密海滨的装饰艺术酒店本来也有十几层。
    // 楼高仍由 token 决定（数据语义不变），只是低矮的海滨楼换一种建筑语汇。
    if (zone === "waterfront" && building.height <= 36 && this.formOf(building) !== "landmark") return 3;
    // S5：地块只有 ~7 宽，体量差异被地块裁平（截图验收：同区仍千篇一律）。地价改由材质读出来——
    // 区内最贵的四分之一用玻璃幕墙（downtown 立面），最便宜的三成用住宅立面。
    const percentile = this.percentileOf(building);
    if (percentile !== undefined && percentile >= 0.75) return 2;
    if (percentile !== undefined && percentile < 0.3) return 0;
    if (zone === "downtown") return 2;
    if (zone === "commercial") return 1;
    if (zone === "residential") return 0;
    return building.seed > 0.5 ? 1 : 0;
  }

  /** 溢出会话的背景楼群：低细节体量块，可数不可点——数据没被丢，只是不占独立地块。 */
  private buildMassing(): void {
    const blocks = this.layout.massing ?? [];
    if (!blocks.length) return;
    const mesh = this.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#c9c7bd" }), blocks.length);
    blocks.forEach((block, index) => {
      this.compose(block.x, block.y, block.z, hashSeed(`mass:${block.districtId}:${index}`) * 0.6 - 0.3, 16, block.height, 12);
      mesh.setMatrixAt(index, this.matrix);
      mesh.setColorAt(index, this.color.set(index % 2 ? "#c4c2b6" : "#cdcbbf"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.name = "city-massing";
  }

  /** Deterministic Miami skyline fabric on vacant inner commercial lots.
   *  Decorative only: no session id, label, hit target, growth or HUD count.
   *  Two instanced batches keep the skyline affordable even on low-end GPUs. */
  private buildUrbanContext(): void {
    const buildings = this.layout.contextBuildings ?? [];
    if (!buildings.length) return;
    const facade = makeDecoFacadeTexture();
    facade.colorSpace = THREE.SRGBColorSpace;
    facade.repeat.set(8, 5.5); // one facade tile per chamfered face; 2-floor tile × 5.5 gives ~11-floor rhythm.
    const bodyGeometry = artDecoTowerGeometry();
    const bodyMaterial = new THREE.MeshLambertMaterial({ map: facade });
    const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, buildings.length);
    const crownGeometry = BOX.clone();
    const crownMaterial = new THREE.MeshLambertMaterial({ color: "#f4e5d3" });
    const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, buildings.length);
    const colorsByZone: Record<string, string[]> = {
      downtown: ["#91c8cf", "#d89bb6", "#b4a4d5", "#dfc49a"],
      commercial: ["#a8c9bf", "#d9ad9e", "#c5b9a2", "#9dbdcc"],
      waterfront: ["#e6c6a9", "#e5a8ad", "#b1d3cd", "#ead6b9"],
      residential: ["#c8c2a9", "#b5c3b0", "#d5bfa9", "#b8c3c5"],
    };
    for (let index = 0; index < buildings.length; index += 1) {
      const building = buildings[index];
      const colors = colorsByZone[building.zone] ?? colorsByZone.commercial;
      this.compose(building.x, building.y, building.z, building.yaw, building.width, building.height, building.depth);
      bodies.setMatrixAt(index, this.matrix);
      // F3：降饱和、略压明度——远看仍是统一天际线，近看一眼分出「我的楼」（会话楼保持执行环境色相与屋顶霓虹）。
      this.color.set(colors[Math.floor(building.seed * colors.length) % colors.length]);
      this.color.getHSL(this.hsl);
      bodies.setColorAt(index, this.color.setHSL(this.hsl.h, this.hsl.s * 0.45, this.hsl.l * 0.92));
      const roofScale = building.zone === "residential" ? 0.88 : 0.68;
      this.compose(building.x, building.y + building.height, building.z, building.yaw, building.width * roofScale, 1.2 + building.seed * 2.1, building.depth * roofScale);
      crowns.setMatrixAt(index, this.matrix);
      crowns.setColorAt(index, this.color.set(building.zone === "downtown"
        ? colors[(Math.floor(building.seed * colors.length) + 1) % colors.length]
        : colors[Math.floor(building.seed * colors.length) % colors.length]).multiplyScalar(building.zone === "residential" ? 0.9 : 1.05));
    }
    for (const mesh of [bodies, crowns]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    }
    bodies.name = "city-vice-context-facades";
    crowns.name = "city-vice-context-rooftops";
    // F2：记下每栋的完整矩阵（落成态），回放时按进度在 y 方向缩放写回。
    const matrices = new Float32Array(buildings.length * 32);
    for (let index = 0; index < buildings.length; index += 1) {
      bodies.getMatrixAt(index, this.matrix); this.matrix.toArray(matrices, index * 32);
      crowns.getMatrixAt(index, this.matrix); this.matrix.toArray(matrices, index * 32 + 16);
    }
    this.context = { bodies, crowns, matrices };
    this.group.add(bodies, crowns);
    this.disposables.push(bodyGeometry, bodyMaterial, facade, crownGeometry, crownMaterial);
  }

  private context: { bodies: THREE.InstancedMesh; crowns: THREE.InstancedMesh; matrices: Float32Array } | null = null;
  private contextTarget = new Float32Array(0);
  private contextProgress = new Float32Array(0);
  private readonly contextScratch = new THREE.Matrix4();
  private readonly contextScale = new THREE.Matrix4();

  /** 背景楼进度 → 矩阵：落成态矩阵左乘「以楼底为原点的 y 缩放」（BOX/塔几何都以底面为原点，直接右乘缩放即可）。 */
  private writeContext(): void {
    const context = this.context;
    if (!context) return;
    const count = Math.min(this.contextProgress.length, context.bodies.count);
    for (let index = 0; index < count; index += 1) {
      const t = this.contextProgress[index];
      const ease = t * t * (3 - 2 * t);
      for (const [mesh, offset] of [[context.bodies, 0], [context.crowns, 16]] as const) {
        this.contextScratch.fromArray(context.matrices, index * 32 + offset);
        // 屋顶冠在楼顶：楼还在长时先藏起（就地缩放会悬在半空），封顶后再出现。
        if (ease <= 0.001 || (offset === 16 && ease < 0.999)) this.contextScratch.makeScale(0, 0, 0).setPosition(0, -40, 0);
        else if (ease < 0.999) this.contextScratch.multiply(this.contextScale.makeScale(1, ease, 1));
        mesh.setMatrixAt(index, this.contextScratch);
      }
    }
    context.bodies.instanceMatrix.needsUpdate = true;
    context.crowns.instanceMatrix.needsUpdate = true;
  }

  private updateContext(dt: number): void {
    let dirty = false;
    for (let index = 0; index < this.contextTarget.length; index += 1) {
      const current = this.contextProgress[index];
      const target = this.contextTarget[index];
      if (current === target) continue;
      this.contextProgress[index] = target > current ? Math.min(target, current + dt / 1.2) : Math.max(target, current - dt / 0.6);
      dirty = true;
    }
    if (dirty) this.writeContext();
  }

  /** 海平线远山：低模锥形剪影 + fbm 顶点扰动，两侧海域各一座。 */
  private buildSeaMountains(): void {
    const mountains = this.layout.seaMountains ?? [];
    if (!mountains.length) return;
    const volcano = [...mountains].sort((a, b) => b.height - a.height)[0];
    for (const mountain of mountains) {
      if (mountain === volcano) {
        // 冒烟的那座（CityWildlife 选最高的）是火山：火山体直接移植 tinyskies Volcano.ts 的 buildVolcanoGeometry
        // （作者授权）——带火山口的车削轮廓、噪声扭曲成不规则岩体、顶点色从青褐山脚→灰烬→焦黑火山口→岩浆芯。
        // 曾是一个光秃的浅色圆锥，读作「海上一顶帽子」（拍照实测）。烟柱从 height/2 的火山口冒出。
        const mesh = new THREE.Mesh(volcanoGeometry(mountain.radius, mountain.height / 2, this.layout.seed), new THREE.MeshLambertMaterial({ vertexColors: true })); // 吃雾：远海处与海面一同淡入天色，曾 fog:false 在雾化的海平线上悬浮成飞碟（真机截图）
        mesh.position.set(mountain.center.x, -2, mountain.center.z);
        mesh.name = "city-sea-volcano";
        this.group.add(mesh);
        this.disposables.push(mesh.geometry, mesh.material as THREE.Material);
        continue;
      }
      const geometry = new THREE.ConeGeometry(mountain.radius, mountain.height, 11, 4);
      const position = geometry.attributes.position as THREE.BufferAttribute;
      const colors = new Float32Array(position.count * 3);
      const rock = new THREE.Color("#a9a496");
      const high = new THREE.Color("#d6d0c2");
      const tint = new THREE.Color();
      for (let index = 0; index < position.count; index += 1) {
        const x = position.getX(index);
        const y = position.getY(index);
        const z = position.getZ(index);
        const wobble = 1 + fbm(x * 0.03 + mountain.seed, z * 0.03 - mountain.seed, mountain.seed, 3) * 0.22;
        position.setX(index, x * wobble);
        position.setZ(index, z * wobble);
        tint.copy(rock).lerp(high, Math.max(0, (y + mountain.height / 2) / mountain.height));
        colors[index * 3] = tint.r;
        colors[index * 3 + 1] = tint.g;
        colors[index * 3 + 2] = tint.b;
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      const material = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(mountain.center.x, 0, mountain.center.z);
      mesh.name = "city-sea-mountain";
      this.group.add(mesh);
      this.disposables.push(geometry, material);
    }
  }

  /** 树位：规划层的 parkTrees（此前算出来却从没渲染，district.trees 恒为空）+
   *  棕榈主题下沿街行道树（避开桥、水面和路口）。 */
  private treeSpots(): Array<{ x: number; z: number; y: number; seed: number }> {
    const theme = activeTheme();
    const spots: Array<{ x: number; z: number; y: number; seed: number }> = [];
    for (const district of this.layout.districts) spots.push(...district.trees);
    spots.push(...(this.layout.parkTrees ?? []));
    // 海滨步道棕榈列（VICE B3）：沿步道折线 ~9 单位间距、两侧交错，走同一份
    // treeSpots——进 treeMesh（棕榈几何）与 applyFlora（真实生态带管线）双路径。
    {
      const seaside = this.layout.seaside;
      const promenades = [...(seaside && !seaside.degraded ? promenadeSegments(seaside) : []), ...this.urbanPromenadeSegments()]; // S3：城区岸段步道也有棕榈列
      if (promenades.length) {
        const terrain = this.layout.terrain;
        let row = 0;
        // 逐合法连续段种植（段间已被净空校验切断，不跨缺口搭桥）。
        for (const segment of promenades) {
          for (let i = 1; i < segment.length; i += 1) {
            const a = segment[i - 1]; const b = segment[i];
            const next = segment[Math.min(segment.length - 1, i + 1)];
            const prev = segment[Math.max(0, i - 2)];
            const segLen = Math.hypot(b.x - a.x, b.z - a.z);
            const steps = Math.max(1, Math.floor(segLen / 7));
            for (let s = 1; s <= steps; s += 1) {
              const t = s / (steps + 1);
              const x = a.x + (b.x - a.x) * t; const z = a.z + (b.z - a.z) * t;
              const tangent = { x: (next.x - prev.x), z: (next.z - prev.z) };
              const tl = Math.hypot(tangent.x, tangent.z) || 1;
              const side = row % 2 === 0 ? 2.8 : -2.8;
              const px = x + (-tangent.z / tl) * side; const pz = z + (tangent.x / tl) * side;
              row += 1;
              const y = terrain.height(px, pz);
              if (y < 0.5 || y > 6) continue;
              spots.push({ x: px, z: pz, y, seed: hashSeed(`palmtree:${px.toFixed(1)}:${pz.toFixed(1)}`) });
            }
          }
        }
      }
    }
    if (theme.streetTreeSpacing > 0) {
      const terrain = this.layout.terrain;
      const roads = new SegmentIndex(this.layout.roadEdges.map((edge) => edge.points));
      const highways = new SegmentIndex(this.layout.highways ?? []);
      // G2 热带绿化：沿合并后的整条路（roadPaintPlan run）按弧长种行道树，间距跨路段累计；路幅分档做净空。
      // 曾逐条路段种且跳过 <20 的段（多数路已被切成 ~15 的短段），净空又统一按最宽路（7.2）算——
      // 5 宽支路旁的树（离中线 4.9）全被拒，城市里几乎看不到行道树（多视角评估「像沙漠」）。
      const byWidth = new Map<number, Vec2[][]>();
      for (const edge of this.layout.roadEdges) if (!edge.bridge) (byWidth.get(edge.width) ?? byWidth.set(edge.width, []).get(edge.width)!).push(edge.points);
      const widthIndex = [...byWidth].map(([width, runs]) => ({ clearance: width / 2 + 1.2, index: new SegmentIndex(runs) }));
      const clearOfRoads = (p: Vec2) => widthIndex.every(({ clearance, index }) => !index.closerThan(p, clearance));
      const slots = this.layout.districts.flatMap((district) => [...district.slots.values()]);
      const buildings = new SegmentIndex(slots.map((slot) => [slot, slot]));
      const buildingClearance = slots.reduce((radius, slot) => Math.max(radius, Math.hypot(slot.width, slot.depth) / 2 + 1.2), 0);
      for (const run of roadPaintPlan(this.layout.roadEdges).runs) {
        const spacing = theme.streetTreeSpacing * (run.kind === "arterial" ? 0.8 : 1);
        let walked = 0; let next = 9; let index = 0;
        for (let i = 1; i < run.points.length; i += 1) {
          const a = run.points[i - 1]; const b = run.points[i];
          const length = Math.hypot(b.x - a.x, b.z - a.z);
          if (length < 1e-3) continue;
          const dx = (b.x - a.x) / length; const dz = (b.z - a.z) / length;
          while (next <= walked + length) {
            const along = next - walked; next += spacing;
            const side = index % 2 === 0 ? 1 : -1; index += 1;
            const offset = run.width / 2 + 2.4;
            const x = a.x + dx * along - dz * offset * side;
            const z = a.z + dz * along + dx * offset * side;
            const y = terrain.height(x, z);
            if (y < 1.2) continue;
            const point = { x, z };
            if (!clearOfRoads(point) || highways.closerThan(point, EXPRESSWAY_DECK_WIDTH / 2 + 2)) continue;
            if (buildings.closerThan(point, buildingClearance)) continue;
            spots.push({ x, z, y, seed: hashSeed(`street:${Math.round(x)}:${Math.round(z)}`) });
          }
          walked += length;
        }
      }
    }
    return spots;
  }

  /** 圆冠树：树干 + 二十面体树冠。 */
  private roundTreeGeometry(): THREE.BufferGeometry {
    const theme = activeTheme();
    const trunk = new THREE.CylinderGeometry(0.14, 0.2, 0.9, 5).translate(0, 0.45, 0);
    const crown = new THREE.IcosahedronGeometry(0.78, 0).translate(0, 1.35, 0);
    return this.tintedMerge([[trunk, theme.trunk], [crown, theme.foliage]]);
  }

  /** 棕榈：略弯的细高树干 + 一圈下垂的羽叶（每片叶 = 前倾的扁长方体）。 */
  private palmGeometry(): THREE.BufferGeometry {
    const theme = activeTheme();
    const height = 4.6;
    const trunk = new THREE.CylinderGeometry(0.1, 0.19, height, 6).translate(0, height / 2, 0);
    // 树干顶端微微偏向一侧，避免整齐得像电线杆。
    const position = trunk.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index += 1) {
      const t = position.getY(index) / height;
      position.setX(index, position.getX(index) + t * t * 0.55);
    }
    trunk.computeVertexNormals();
    const parts: Array<[THREE.BufferGeometry, string]> = [[trunk, theme.trunk]];
    const fronds = 8;
    for (let index = 0; index < fronds; index += 1) {
      const frond = new THREE.BoxGeometry(2.3, 0.05, 0.42).translate(1.15, 0, 0);
      frond.rotateZ(-0.42 - (index % 2) * 0.22); // 叶尖下垂
      frond.rotateY((index / fronds) * Math.PI * 2);
      frond.translate(0.55, height - 0.05, 0);
      parts.push([frond, index % 3 === 0 ? "#27a868" : theme.foliage]);
    }
    return this.tintedMerge(parts);
  }

  private tintedMerge(parts: Array<[THREE.BufferGeometry, string]>): THREE.BufferGeometry {
    let total = 0;
    for (const [geometry] of parts) total += geometry.getAttribute("position").count;
    const colors = new Float32Array(total * 3);
    let offset = 0;
    const color = new THREE.Color();
    for (const [geometry, hex] of parts) {
      color.set(hex);
      for (let index = 0; index < geometry.getAttribute("position").count; index += 1) {
        colors[offset++] = color.r;
        colors[offset++] = color.g;
        colors[offset++] = color.b;
      }
    }
    const merged = mergeGeometries(parts.map(([geometry]) => geometry));
    merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    for (const [geometry] of parts) geometry.dispose();
    return merged;
  }

  /** 用生态带模型替换程序化树：树位不变（同一份 treeSpots），按确定性 hash 分给各树种。 */
  applyFlora(flora: LoadedFlora): void {
    if (!flora.length || this.floraMeshes.length) return;
    const spots = this.treeSpots();
    const total = flora.reduce((sum, item) => sum + item.species.weight, 0);
    const buckets: Array<typeof spots> = flora.map(() => []);
    for (const spot of spots) {
      let pick = hashSeed(`flora:${spot.x.toFixed(1)}:${spot.z.toFixed(1)}`) * total;
      let index = 0;
      while (index < flora.length - 1 && pick >= flora[index].species.weight) { pick -= flora[index].species.weight; index += 1; }
      buckets[index].push(spot);
    }
    flora.forEach(({ species, geometry }, index) => {
      const list = buckets[index];
      if (!list.length) return;
      const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const tint = species.tint ? new THREE.Color(species.tint) : null;
      list.forEach((spot, i) => {
        const size = species.height * (0.8 + spot.seed * 0.45);
        this.compose(spot.x, spot.y - 0.1, spot.z, spot.seed * Math.PI * 2, size, size, size);
        mesh.setMatrixAt(i, this.matrix);
        // 染色树种（樱花/枫）：实例色乘在顶点色上，树干也会被染——用浅色乘数只轻推色相。
        mesh.setColorAt(i, tint ? this.color.copy(tint).lerp(new THREE.Color("#ffffff"), 0.25 + spot.seed * 0.2) : this.color.set("#ffffff").multiplyScalar(0.88 + spot.seed * 0.2));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.name = `city-flora-${index}`;
      this.group.add(mesh);
      this.floraMeshes.push(mesh);
      this.disposables.push(material); // 几何由 cityFlora 缓存共享，不随 parts 销毁
    });
    if (this.floraMeshes.length) this.treeMesh.visible = false;
  }

  /** 滨海步道（VICE B3）：沿 promenade 折线的浅色铺装缎带——人行道语义，不进
   *  roadEdges/carPaths（机动车不会开上步道）。单 BufferGeometry，静态缓存段。 */
  /** S3「滨海景观带随用地走」：环岛滨海路在建成区（会话楼 160 内）旁的岸段，向海一侧 9 处铺同一套步道
   *  （粉色铺装 + 白色矮墙 + 路灯）。曾只有海滨那一段 85° 弧有景观带，住宅区一直排到海边、景观带却停了（真机截图）。 */
  private urbanPromenadeSegments(): Vec2[][] {
    const slots = this.layout.districts.flatMap((district) => [...district.slots.values()]);
    if (!slots.length) return [];
    const near = new SegmentIndex(slots.map((slot) => [slot, slot]));
    const terrain = this.layout.terrain;
    const out: Vec2[][] = [];
    for (const run of this.layout.coastRoads ?? []) {
      let current: Vec2[] = [];
      for (let i = 0; i < run.length; i += 1) {
        const a = run[Math.max(0, i - 1)]; const b = run[Math.min(run.length - 1, i + 1)];
        const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        let nx = -(b.z - a.z) / len; let nz = (b.x - a.x) / len;
        const p = run[i];
        if (terrain.height(p.x + nx * 12, p.z + nz * 12) > terrain.height(p.x - nx * 12, p.z - nz * 12)) { nx = -nx; nz = -nz; }
        const q = { x: p.x + nx * 9, z: p.z + nz * 9 };
        if (near.closerThan(p, 160) && terrain.height(q.x, q.z) > 0.4) current.push(q);
        else { if (current.length >= 3) out.push(current); current = []; }
      }
      if (current.length >= 3) out.push(current);
    }
    return out;
  }

  private buildPromenade(segments: Vec2[][]): void {
    if (!segments.length) return;
    const half = 4.2;
    const positions: number[] = [];
    for (const polyline of segments)
    for (let i = 1; i < polyline.length; i += 1) {
      const a = polyline[i - 1]; const b = polyline[i];
      const dx = b.x - a.x; const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len * half; const nz = dx / len * half;
      const ay = this.layout.terrain.height(a.x, a.z) + 0.07;
      const by = this.layout.terrain.height(b.x, b.z) + 0.07;
      // 逆时针（从上往下看）绕序 → 法线朝上；曾生成朝下法线被背面剔除（俯视消失）。
      positions.push(a.x + nx, ay, a.z + nz, b.x - nx, by, b.z - nz, a.x - nx, ay, a.z - nz,
                     a.x + nx, ay, a.z + nz, b.x + nx, by, b.z + nz, b.x - nx, by, b.z - nz);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.computeVertexNormals();
    // 粉色铺装（迈阿密步道的辨识色）：曾用 #d4c8a8，和干沙几乎同色，真机上步道看不出来。
    const material = new THREE.MeshLambertMaterial({ color: "#e7b3a3" });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "city-promenade";
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.disposables.push(geometry, material);
    // 朝海一侧的白色矮墙（隔开沙滩与步道）+ 朝陆一侧每 ~16 单位一盏路灯。
    const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const furniture = new THREE.MeshLambertMaterial({ color: "#ffffff" });
    type Piece = { x: number; y: number; z: number; yaw: number; w: number; h: number; d: number; color: string; glow?: boolean };
    const pieces: Piece[] = [];
    for (const polyline of segments) {
      let sinceLamp = 8;
      for (let i = 1; i < polyline.length; i += 1) {
        const a = polyline[i - 1]; const b = polyline[i];
        const dx = b.x - a.x; const dz = b.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        // 左法线 (-dz, dx)；朝海一侧 = 地形更低的一侧。
        let nx = -dz / len; let nz = dx / len;
        const mx = (a.x + b.x) / 2; const mz = (a.z + b.z) / 2;
        if (this.layout.terrain.height(mx + nx * 8, mz + nz * 8) > this.layout.terrain.height(mx - nx * 8, mz - nz * 8)) { nx = -nx; nz = -nz; }
        const yaw = -Math.atan2(dz, dx);
        const wx = mx + nx * (half + 0.2); const wz = mz + nz * (half + 0.2);
        pieces.push({ x: wx, y: this.layout.terrain.height(wx, wz), z: wz, yaw, w: len + 0.3, h: 0.55, d: 0.35, color: "#f7f3ea" });
        for (let d = 0; d < len; d += 1) {
          sinceLamp += 1;
          if (sinceLamp < 16) continue;
          sinceLamp = 0;
          const t = d / len;
          const lx = a.x + dx * t - nx * (half - 0.4); const lz = a.z + dz * t - nz * (half - 0.4);
          const ly = this.layout.terrain.height(lx, lz);
          pieces.push({ x: lx, y: ly, z: lz, yaw, w: 0.14, h: 3.6, d: 0.14, color: "#3c4650" });
          pieces.push({ x: lx, y: ly + 3.6, z: lz, yaw, w: 0.5, h: 0.22, d: 0.5, color: "#fff1c9", glow: true });
        }
      }
    }
    if (pieces.length) {
      const props = new THREE.InstancedMesh(unit, furniture, pieces.length);
      pieces.forEach((piece, i) => {
        this.positionVector.set(piece.x, piece.y, piece.z);
        this.euler.set(0, piece.yaw, 0); this.quaternion.setFromEuler(this.euler);
        this.scaleVector.set(piece.w, piece.h, piece.d);
        this.matrix.compose(this.positionVector, this.quaternion, this.scaleVector);
        props.setMatrixAt(i, this.matrix); props.setColorAt(i, this.color.set(piece.color));
      });
      props.castShadow = true;
      props.instanceMatrix.needsUpdate = true;
      if (props.instanceColor) props.instanceColor.needsUpdate = true;
      props.name = "city-promenade-props";
      this.group.add(props);
      // 夜里亮灯：灯头另起一批，用路灯灯头同一份自发光材质（setNightGlow 已按夜色驱动、白天熄灭）。
      // 曾与灯杆同一 Lambert 批次，夜里步道一片漆黑（剩余项清单「步道路灯夜里不亮」）。
      const heads = pieces.filter((piece) => piece.glow);
      if (heads.length && this.nightLights) {
        const glowMesh = new THREE.InstancedMesh(unit, this.nightLights.heads, heads.length);
        heads.forEach((piece, i) => {
          this.positionVector.set(piece.x, piece.y + 0.01, piece.z);
          this.euler.set(0, piece.yaw, 0); this.quaternion.setFromEuler(this.euler);
          this.scaleVector.set(piece.w * 1.05, piece.h * 1.1, piece.d * 1.05);
          this.matrix.compose(this.positionVector, this.quaternion, this.scaleVector);
          glowMesh.setMatrixAt(i, this.matrix);
        });
        glowMesh.instanceMatrix.needsUpdate = true;
        glowMesh.name = "city-promenade-props";
        this.group.add(glowMesh);
      }
    }
    this.disposables.push(unit, furniture);
  }

  /** 救生塔（VICE S1）：架高值守小屋 + 平台 + 檐顶 + 楼梯——架高结构是
   *  Lifeguard Tower 的第一特征（不是灯塔的窄圆柱）。条纹为辅助色。夜间
   *  自发光由独立 MeshBasic 材质驱动（不依赖路灯照亮），随 setNightGlow 亮起。
   *  合法沙带内最多 3 座，确定性 seed。 */
  private buildLifeguardTowers(): void {
    const seaside = this.layout.seaside;
    if (!seaside || seaside.degraded) return;
    const valid = seaside.samples.filter((s) => s.valid);
    if (valid.length < 5) return;
    // 约每 4 个合法采样（~150 单位海岸）一座，最多 8 座；曾最多 3 座，长海岸上几乎看不见。
    const count = Math.min(8, Math.max(2, Math.floor(valid.length / 4)));
    const structureMaterial = new THREE.MeshLambertMaterial({ color: "#ffffff" });
    const stripeMaterial = new THREE.MeshLambertMaterial({ color: "#f4efe4" });
    const glowMaterial = new THREE.MeshBasicMaterial({ color: "#ffca7a", toneMapped: false });
    this.lifeguardGlowMaterial = glowMaterial;
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const structureMesh = new THREE.InstancedMesh(box, structureMaterial, count * 6);
    const stripeMesh = new THREE.InstancedMesh(box, stripeMaterial, count * 4);
    stripeMesh.castShadow = true;
    const glowMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 6, 5), glowMaterial, count);
    structureMesh.castShadow = true;
    const palettes = [
      { wall: "#ff5fa8", accent: "#fff4ec" },
      { wall: "#00c2d1", accent: "#fff4ec" },
      { wall: "#ff8a3c", accent: "#fff4ec" },
    ];
    let cursor = 0;
    for (let t = 0; t < count; t += 1) {
      // 在沙带内均匀散布（避开酒店位），偏移到湿沙外缘附近。
      const sample = valid[Math.floor(((t + 0.3) / count) * (valid.length - 1))];
      const seed = hashSeed(`lifeguard:${t}`);
      const ground = this.layout.terrain.height(sample.dryOuter.x, sample.dryOuter.z);
      // compose 的约定：局部 z 轴 = (sin yaw, cos yaw)。要让进深轴沿岸线法向（立面朝海），yaw = atan2(inward.x, inward.z)。
      // 曾写 atan2(inward.x, -inward.z)：只有 inward.z = 0 处才对，其它岸段楼体相对岸线斜转，沿「朝海」偏移的
      // 遮阳带/壁柱/霓虹招牌从楼的侧面戳出来（真机截图：白色横杆伸出墙外）。
      const yaw = Math.atan2(sample.inward.x, sample.inward.z);
      const pal = palettes[t % palettes.length];
      const legH = 2.6 + seed * 0.8;
      const hutW = 3.2 + seed * 0.8;
      const hutH = 2.2 + seed * 0.5;
      const x = sample.dryOuter.x; const z = sample.dryOuter.z;
      // 四根立柱（架高是第一特征）。
      for (let leg = 0; leg < 4; leg += 1) {
        const lx = x + (leg % 2 === 0 ? -1 : 1) * (hutW / 2 - 0.25);
        const lz = z + (leg < 2 ? -1 : 1) * (1.1);
        this.compose(lx, ground, lz, yaw, 0.28, legH, 0.28);
        structureMesh.setMatrixAt(cursor + leg, this.matrix);
        structureMesh.setColorAt(cursor + leg, this.color.set("#8a7a68"));
      }
      cursor += 4;
      // 平台。
      this.compose(x, ground + legH, z, yaw, hutW + 0.6, 0.22, 2.6);
      structureMesh.setMatrixAt(cursor, this.matrix);
      structureMesh.setColorAt(cursor, this.color.set(pal.wall));
      // 值守小屋（条纹墙身）。
      this.compose(x, ground + legH + 0.22, z, yaw, hutW, hutH, 2.2);
      structureMesh.setMatrixAt(cursor + 1, this.matrix);
      structureMesh.setColorAt(cursor + 1, this.color.set(pal.wall));
      cursor += 2;
      // 檐顶（出挑薄板 + 中央通风塔）。
      this.compose(x, ground + legH + 0.22 + hutH, z, yaw, hutW + 1.0, 0.18, 3.0);
      structureMesh.setMatrixAt(cursor, this.matrix);
      structureMesh.setColorAt(cursor, this.color.set(pal.accent));
      this.compose(x, ground + legH + 0.22 + hutH + 0.18, z, yaw, 0.8, 0.7, 0.8);
      structureMesh.setMatrixAt(cursor + 1, this.matrix);
      structureMesh.setColorAt(cursor + 1, this.color.set(pal.accent));
      cursor += 2;
      // 楼梯（斜向薄板从地面到平台，简化为两级踏步面板）。
      const outward = { x: -sample.inward.x, z: -sample.inward.z };
      for (let step = 0; step < 3; step += 1) {
        const sy = ground + (legH * (step + 1)) / 4;
        const sx = x + outward.x * (1.4 + step * 0.7);
        const sz = z + outward.z * (1.4 + step * 0.7);
        this.compose(sx, sy, sz, yaw, 1.2, 0.12, 0.45);
        stripeMesh.setMatrixAt(t * 4 + step, this.matrix);
      }
      // 条纹：小屋顶部一圈色环。
      this.compose(x, ground + legH + 0.22 + hutH * 0.65, z, yaw, hutW + 0.05, 0.3, 2.25);
      stripeMesh.setMatrixAt(t * 4 + 3, this.matrix); // 曾写 t*3+2：覆盖第三级踏步，且相邻塔的槽位互相踩
      // 夜间指示灯（小屋顶部小光球）。
      this.compose(x, ground + legH + 0.22 + hutH + 0.18 + 0.7, z, 0, 1, 1, 1);
      glowMesh.setMatrixAt(t, this.matrix);
    }
    structureMesh.count = cursor;
    stripeMesh.count = count * 4;
    structureMesh.name = "city-lifeguard-towers";
    if (structureMesh.instanceColor) structureMesh.instanceColor.needsUpdate = true;
    glowMesh.visible = false; // 白天不亮，setNightGlow 驱动
    this.group.add(structureMesh, stripeMesh, glowMesh);
    this.disposables.push(box, structureMaterial, stripeMaterial, glowMaterial);
  }

  /** 沙滩设施：遮阳伞（伞杆 + 伞面）与躺椅，成组散布在干沙上——真机反馈「看不到沙滩和海滨设施」。
   *  沿连续合法岸段每 ~9 单位一组，位置/颜色由确定性 hash 抖动；救生塔附近留空。 */
  private buildBeachFurniture(): void {
    const seaside = this.layout.seaside;
    if (!seaside || seaside.degraded) return;
    const wet = this.layout.coastalConfig?.wetSandWidth ?? 7;
    const dry = this.layout.coastalConfig?.drySandWidth ?? 14;
    type Spot = { x: number; z: number; yaw: number; seed: number };
    const spots: Spot[] = [];
    // 沙排场：沿每段连续海岸累计弧长，每 ~110 单位一块（段首留 30），场地长轴沿岸、居干沙中线。
    const courts: Spot[] = [];
    for (const run of validRuns(seaside)) {
      let walked = 0; let next = 30;
      for (let i = 1; i < run.length; i += 1) {
        const a = run[i - 1]; const b = run[i];
        const length = Math.hypot(b.waterline.x - a.waterline.x, b.waterline.z - a.waterline.z);
        while (next <= walked + length) {
          const t = (next - walked) / length;
          const inx = a.inward.x + (b.inward.x - a.inward.x) * t; const inz = a.inward.z + (b.inward.z - a.inward.z) * t;
          const norm = Math.hypot(inx, inz) || 1;
          const depth = (wet + dry) / 2 + 0.5;
          const x = a.waterline.x + (b.waterline.x - a.waterline.x) * t + (inx / norm) * depth;
          const z = a.waterline.z + (b.waterline.z - a.waterline.z) * t + (inz / norm) * depth;
          if (this.layout.terrain.height(x, z) > 0.2) courts.push({ x, z, yaw: Math.atan2(inx, inz), seed: hashSeed(`court:${courts.length}`) });
          next += 110;
        }
        walked += length;
      }
    }
    for (const run of validRuns(seaside)) for (let i = 1; i < run.length; i += 1) {
      const a = run[i - 1]; const b = run[i];
      const length = Math.hypot(b.waterline.x - a.waterline.x, b.waterline.z - a.waterline.z);
      for (let d = 4; d < length; d += 9) {
        const t = d / length;
        const seed = hashSeed(`beach:${Math.round(a.waterline.x)}:${Math.round(a.waterline.z)}:${d}`);
        if (seed < 0.18) continue; // 留一些空沙滩
        const inx = a.inward.x + (b.inward.x - a.inward.x) * t; const inz = a.inward.z + (b.inward.z - a.inward.z) * t;
        const norm = Math.hypot(inx, inz) || 1;
        const depth = wet + 1.5 + seed * (dry - wet - 2.5);
        const x = a.waterline.x + (b.waterline.x - a.waterline.x) * t + (inx / norm) * depth;
        const z = a.waterline.z + (b.waterline.z - a.waterline.z) * t + (inz / norm) * depth;
        if (this.layout.terrain.height(x, z) < 0.2) continue;
        if (courts.some((court) => Math.hypot(court.x - x, court.z - z) < 12)) continue; // 给沙排场让位
        spots.push({ x, z, yaw: Math.atan2(inx, inz), seed });
      }
    }
    this.buildBeachLife(courts, spots, wet);
    if (!spots.length) return;
    const colors = ["#ff5fa8", "#00c2d1", "#ffb03a", "#ffffff", "#7a5cff", "#ff6b4a"];
    const poleGeometry = new THREE.CylinderGeometry(0.07, 0.07, 2.4, 5).translate(0, 1.2, 0);
    const canopyGeometry = new THREE.ConeGeometry(1.6, 0.7, 8).translate(0, 2.55, 0);
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const poleMaterial = new THREE.MeshLambertMaterial({ color: "#f2ede2" });
    const canopyMaterial = new THREE.MeshLambertMaterial({ color: "#ffffff" });
    const loungerMaterial = new THREE.MeshLambertMaterial({ color: "#ffffff" });
    const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, spots.length);
    const canopies = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, spots.length);
    const loungers = new THREE.InstancedMesh(box, loungerMaterial, spots.length * 2);
    canopies.castShadow = true;
    let lounger = 0;
    spots.forEach((spot, i) => {
      const y = this.layout.terrain.height(spot.x, spot.z);
      this.compose(spot.x, y, spot.z, spot.yaw + spot.seed * 0.6, 1, 1, 1);
      poles.setMatrixAt(i, this.matrix);
      canopies.setMatrixAt(i, this.matrix);
      canopies.setColorAt(i, this.color.set(colors[Math.floor(spot.seed * 997) % colors.length]));
      // 两张躺椅并排、朝海（局部 z = 内向，椅子摆在伞的朝海一侧）。
      const sx = Math.sin(spot.yaw); const sz = Math.cos(spot.yaw);
      for (const side of [-0.7, 0.7]) {
        const lx = spot.x - sx * 1.6 + sz * side; const lz = spot.z - sz * 1.6 - sx * side;
        this.compose(lx, y + 0.05, lz, spot.yaw, 0.6, 0.28, 1.9);
        loungers.setMatrixAt(lounger, this.matrix);
        loungers.setColorAt(lounger, this.color.set(spot.seed > 0.6 ? "#fff4ec" : "#4fd1d9"));
        lounger += 1;
      }
    });
    loungers.count = lounger;
    for (const mesh of [poles, canopies, loungers]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.name = "city-beach-furniture";
      mesh.receiveShadow = true;
    }
    this.group.add(poles, canopies, loungers);
    this.disposables.push(poleGeometry, canopyGeometry, box, poleMaterial, canopyMaterial, loungerMaterial);
  }

  /** 沙排场 + 沙滩人物。人物是静态的、真实比例（身高 ~1.75，躺椅长 1.9，与之同尺度），
   *  比楼小得多：曾经的街区行人是刻意超比例的人偶，且沿车行路网走（真机：「在公路上走」）。
   *  人形 = 双腿 + 躯干（衣色）+ 双臂 + 头（肤色），两个 InstancedMesh 共用矩阵。 */
  private buildBeachLife(courts: Array<{ x: number; z: number; yaw: number; seed: number }>, spots: Array<{ x: number; z: number; yaw: number; seed: number }>, wet: number): void {
    const dummy = new THREE.Object3D();
    const box = (w: number, h: number, d: number, x: number, y: number, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
    const clothesParts = [box(0.15, 0.82, 0.18, -0.1, 0), box(0.15, 0.82, 0.18, 0.1, 0), box(0.4, 0.58, 0.22, 0, 0.82)];
    const skinParts = [box(0.1, 0.56, 0.11, -0.26, 0.86), box(0.1, 0.56, 0.11, 0.26, 0.86), new THREE.SphereGeometry(0.13, 8, 6).translate(0, 1.6, 0)];
    const clothesGeometry = mergeGeometries(clothesParts);
    const skinGeometry = mergeGeometries(skinParts);
    [...clothesParts, ...skinParts].forEach((g) => g.dispose());
    type Pose = { x: number; z: number; yaw: number; lying?: boolean; seed: number };
    const people: Pose[] = [];
    const local = (spot: { x: number; z: number; yaw: number }, across: number, along: number) => {
      // 局部 z = 内向（朝陆），局部 x = 沿岸。
      const sx = Math.sin(spot.yaw); const sz = Math.cos(spot.yaw);
      return { x: spot.x + sx * across + sz * along, z: spot.z + sz * across - sx * along };
    };
    // 每块沙排场 4 名球员，两边各二，面向球网。
    for (const court of courts) for (let k = 0; k < 4; k += 1) {
      const side = k < 2 ? -1 : 1; const lane = k % 2 === 0 ? -1.6 : 1.6;
      const p = local(court, lane, side * (3.2 + hashSeed(`player:${court.x}:${k}`) * 1.6));
      people.push({ ...p, yaw: court.yaw + (side < 0 ? Math.PI / 2 : -Math.PI / 2), seed: hashSeed(`pl:${court.x}:${k}`) });
    }
    // 伞下：约三分之一的伞旁有人躺在躺椅上，另有少数站着。
    for (const spot of spots) {
      if (spot.seed > 0.66) people.push({ ...local(spot, -1.6, 0.7), yaw: spot.yaw, lying: true, seed: spot.seed });
      else if (spot.seed < 0.3) people.push({ ...local(spot, 0.4, -1.4), yaw: spot.yaw + spot.seed * 6, seed: spot.seed });
    }
    // 水边散步的人：湿沙上，零星分布。
    for (const spot of spots) if (spot.seed > 0.4 && spot.seed < 0.52) {
      const p = local(spot, -(spot.seed * 0 + (wet * 0.5 + 2)), 0);
      people.push({ ...p, yaw: spot.yaw + Math.PI / 2, seed: spot.seed });
    }
    if (people.length) {
      const clothesMaterial = new THREE.MeshLambertMaterial({ color: "#ffffff" });
      const skinMaterial = new THREE.MeshLambertMaterial({ color: "#ffffff" });
      const clothes = new THREE.InstancedMesh(clothesGeometry, clothesMaterial, people.length);
      const skin = new THREE.InstancedMesh(skinGeometry, skinMaterial, people.length);
      const outfits = ["#ff5fa8", "#00a6b8", "#ffb03a", "#f4f1ea", "#3b4a8c", "#e2483d", "#2f8f5b"];
      const tones = ["#f1c9a5", "#d9a77c", "#b07a52", "#7a4e33"];
      people.forEach((person, i) => {
        const y = this.layout.terrain.height(person.x, person.z);
        dummy.position.set(person.x, y + (person.lying ? 0.36 : 0), person.z);
        // 躺着 = 绕局部 x 轴放倒 90°，头朝内陆（躺椅靠背一侧）。
        dummy.rotation.set(person.lying ? -Math.PI / 2 : 0, person.yaw + (person.lying ? Math.PI : 0), 0, "YXZ");
        dummy.scale.setScalar(0.92 + person.seed * 0.16);
        dummy.updateMatrix();
        clothes.setMatrixAt(i, dummy.matrix); skin.setMatrixAt(i, dummy.matrix);
        clothes.setColorAt(i, this.color.set(outfits[Math.floor(person.seed * 7919) % outfits.length]));
        skin.setColorAt(i, this.color.set(tones[Math.floor(person.seed * 104729) % tones.length]));
      });
      for (const mesh of [clothes, skin]) {
        mesh.castShadow = true;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.name = "city-beach-people";
      }
      this.group.add(clothes, skin);
      this.disposables.push(clothesMaterial, skinMaterial);
    }
    this.disposables.push(clothesGeometry, skinGeometry);
    // 沙排场：白色边线 + 两根网柱 + 球网（场地 14×7，长轴沿岸）。
    if (courts.length) {
      const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
      const courtMaterial = new THREE.MeshLambertMaterial({ color: "#ffffff" });
      const parts = new THREE.InstancedMesh(unit, courtMaterial, courts.length * 8);
      let n = 0;
      const put = (spot: { x: number; z: number; yaw: number }, across: number, along: number, w: number, h: number, d: number, y: number, color: string) => {
        const p = local(spot, across, along);
        dummy.position.set(p.x, this.layout.terrain.height(p.x, p.z) + y, p.z);
        dummy.rotation.set(0, spot.yaw, 0); dummy.scale.set(w, h, d); dummy.updateMatrix();
        parts.setMatrixAt(n, dummy.matrix); parts.setColorAt(n, this.color.set(color)); n += 1;
      };
      for (const court of courts) {
        put(court, -3.5, 0, 14, 0.04, 0.14, 0.01, "#f6f2e6"); put(court, 3.5, 0, 14, 0.04, 0.14, 0.01, "#f6f2e6");
        put(court, 0, -7, 0.14, 0.04, 7, 0.01, "#f6f2e6"); put(court, 0, 7, 0.14, 0.04, 7, 0.01, "#f6f2e6");
        put(court, -4.1, 0, 0.12, 2.45, 0.12, 0, "#e9e4d6"); put(court, 4.1, 0, 0.12, 2.45, 0.12, 0, "#e9e4d6");
        put(court, 0, 0, 0.03, 0.9, 8.2, 1.5, "#6f7b84");   // 球网（纯黑像一块板，灰调读作网）
        put(court, 0, 0, 0.05, 0.08, 8.2, 2.4, "#f6f2e6");  // 网顶白带
      }
      parts.count = n;
      parts.castShadow = true;
      parts.instanceMatrix.needsUpdate = true;
      if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
      parts.name = "city-volleyball-courts";
      this.group.add(parts);
      this.disposables.push(unit, courtMaterial);
    }
  }

  /** 沙滩网格：沿整条海岸线（地形的岸线就是这条 96 点折线）铺贴地色带——浪花 / 湿沙 / 干沙，
   *  每条色带是独立的平面四边形，边缘锐利。海滨段铺全宽（干沙 + 路缘），其余海岸铺窄的自然沙滩；
   *  山坡/悬崖、港口与河口处不铺。曾只有海滨那 85° 一段有沙滩，且画在低分辨率贴图里（真机：糊、少）。
   *  向海一侧延伸到水下 6 单位，水线由水面与地形自然相交给出。 */
  private buildBeachRibbon(): void {
    const coast = this.layout.coast;
    if (!coast || coast.length < 3) return;
    const terrain = this.layout.terrain;
    const config = this.layout.coastalConfig;
    const wet = config?.wetSandWidth ?? 7;
    const fullDepth = (config?.drySandWidth ?? 20) + 3;
    const naturalDepth = 10;
    const seaside = this.layout.seaside && !this.layout.seaside.degraded ? this.layout.seaside : null;
    const seasidePoints = seaside ? seaside.samples.filter((s) => s.valid).map((s) => s.waterline) : [];
    const harbors = this.layout.publicSites.filter((site) => site.kind === "harbor");
    const river = this.layout.river ?? [];
    const nearRiver = (x: number, z: number) => river.some((p) => Math.hypot(p.x - x, p.z - z) < 34);
    const n = coast.length;
    // 每个岸点：内向法线 + 沙滩进深（0 = 不铺）。
    const vertex = coast.map((p, i) => {
      const prev = coast[(i - 1 + n) % n]; const next = coast[(i + 1) % n];
      let nx = -(next.z - prev.z); let nz = next.x - prev.x;
      const len = Math.hypot(nx, nz) || 1; nx /= len; nz /= len;
      if (terrain.height(p.x + nx * 8, p.z + nz * 8) < terrain.height(p.x - nx * 8, p.z - nz * 8)) { nx = -nx; nz = -nz; }
      let depth = seasidePoints.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.5) ? fullDepth : naturalDepth;
      if (terrain.height(p.x + nx * depth, p.z + nz * depth) > 5) depth = 0;         // 山坡/悬崖
      if (harbors.some((h) => Math.hypot(h.x - p.x, h.z - p.z) < h.radius + 26)) depth = 0;
      if (nearRiver(p.x, p.z)) depth = 0;
      return { p, nx, nz, depth };
    });
    const positions: number[] = []; const colors: number[] = [];
    const bands: Array<[number, number, THREE.Color]> = [];
    const foam = new THREE.Color("#eef5f2"); const wetSand = new THREE.Color("#cdb487"); const drySand = new THREE.Color("#f3e5c2");
    const point = (x: number, z: number, nx: number, nz: number, d: number) => {
      const px = x + nx * d; const pz = z + nz * d;
      return [px, terrain.height(px, pz) + 0.05, pz];
    };
    for (let i = 0; i < n; i += 1) {
      const a = vertex[i]; const b = vertex[(i + 1) % n];
      if (!a.depth || !b.depth) continue;
      const length = Math.hypot(b.p.x - a.p.x, b.p.z - a.p.z);
      const steps = Math.max(1, Math.ceil(length / 5)); // 细分贴地，避免长边中段被地形顶穿
      for (let k = 0; k < steps; k += 1) {
        const t0 = k / steps; const t1 = (k + 1) / steps;
        const at = (t: number) => {
          const nx = a.nx + (b.nx - a.nx) * t; const nz = a.nz + (b.nz - a.nz) * t; const l = Math.hypot(nx, nz) || 1;
          return { x: a.p.x + (b.p.x - a.p.x) * t, z: a.p.z + (b.p.z - a.p.z) * t, nx: nx / l, nz: nz / l, depth: a.depth + (b.depth - a.depth) * t };
        };
        const s0 = at(t0); const s1 = at(t1);
        bands.length = 0;
        bands.push([-6, 1.0, foam], [1.0, Math.min(wet, s0.depth - 1), wetSand], [Math.min(wet, s0.depth - 1), s0.depth, drySand]);
        for (const [from, to, color] of bands) {
          const to1 = color === drySand ? s1.depth : to;
          const q = [point(s0.x, s0.z, s0.nx, s0.nz, from), point(s1.x, s1.z, s1.nx, s1.nz, from),
                     point(s1.x, s1.z, s1.nx, s1.nz, to1), point(s0.x, s0.z, s0.nx, s0.nz, to)];
          for (const index of [0, 2, 1, 0, 3, 2]) { positions.push(...q[index]); colors.push(color.r, color.g, color.b); }
        }
      }
    }
    if (!positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
    geometry.computeVertexNormals();
    // 法线朝向依赖岸线绕向：双面渲染，省掉判绕向。
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "city-beach";
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.disposables.push(geometry, material);
  }

  /** 港口码头（G3「水上活动」）：港口用地朝开阔水面的方向伸出 4 条白色栈桥，两侧泊着游艇/小艇。
   *  曾只有一块灰色港区地坪，水上几乎没有生活（多视角评估）。方向取港口周边最深的一侧，栈桥从岸线起步。 */
  private buildMarina(): void {
    const harbor = this.layout.publicSites.find((site) => site.kind === "harbor");
    if (!harbor) return;
    const terrain = this.layout.terrain;
    let best = { angle: 0, depth: Infinity };
    for (let k = 0; k < 24; k += 1) {
      const angle = (k / 24) * Math.PI * 2;
      const h = terrain.height(harbor.x + Math.cos(angle) * (harbor.radius + 24), harbor.z + Math.sin(angle) * (harbor.radius + 24));
      if (h < best.depth) best = { angle, depth: h };
    }
    if (best.depth > -0.5) return;
    const ux = Math.cos(best.angle); const uz = Math.sin(best.angle);
    let shore = harbor.radius * 0.5;
    while (shore < harbor.radius + 40 && terrain.height(harbor.x + ux * shore, harbor.z + uz * shore) > 0) shore += 1;
    const yaw = -Math.atan2(uz, ux);
    const vx = -uz; const vz = ux;
    const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const deck = new THREE.MeshLambertMaterial({ color: "#f3efe6" });
    const hulls = new THREE.MeshLambertMaterial({ color: "#ffffff" });
    const piers = new THREE.InstancedMesh(unit, deck, 8);
    const boats = new THREE.InstancedMesh(unit, hulls, 40);
    const cabinMaterial = new THREE.MeshLambertMaterial({ color: "#f7f5ef" });
    const cabins = new THREE.InstancedMesh(unit, cabinMaterial, 40);
    let p = 0; let b = 0;
    for (let i = 0; i < 4; i += 1) {
      const lateral = (i - 1.5) * 12;
      const length = 30 + (i % 2) * 6;
      const sx = harbor.x + ux * (shore - 3) + vx * lateral; const sz = harbor.z + uz * (shore - 3) + vz * lateral;
      const cx = sx + ux * length / 2; const cz = sz + uz * length / 2;
      this.compose(cx, 0.35, cz, yaw, length, 0.35, 2.2);
      piers.setMatrixAt(p++, this.matrix);
      // 栈桥两侧每隔 6 泊一条船（长 7–9），颜色按种子在白/海军蓝/珊瑚之间。
      // 截图验收：每 6 一条时船挤成一整块、把栈桥都盖住了——改为每 8 一个泊位、约四成空位，船体收窄并加白色舱室。
      for (let along = 7; along < length - 3 && b < 40; along += 8) for (const side of [-1, 1]) {
        const seed = hashSeed(`marina:${i}:${along}:${side}`);
        if (seed < 0.45 || b >= 40) continue;
        const bx = sx + ux * along + vx * side * 3.6; const bz = sz + uz * along + vz * side * 3.6;
        const len = 6 + seed * 2;
        this.compose(bx, -0.15, bz, yaw + Math.PI / 2, 2.1, 1.2, len);
        boats.setMatrixAt(b, this.matrix);
        boats.setColorAt(b, this.color.set(seed > 0.85 ? "#1f3b5c" : seed > 0.7 ? "#e8775f" : "#ffffff"));
        this.compose(bx - ux * len * 0.08, 1.0, bz - uz * len * 0.08, yaw + Math.PI / 2, 1.5, 0.9, len * 0.4);
        cabins.setMatrixAt(b, this.matrix);
        b += 1;
      }
    }
    piers.count = p; boats.count = b; cabins.count = b;
    for (const mesh of [piers, boats, cabins]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.name = "city-marina";
    }
    this.group.add(piers, boats, cabins);
    this.disposables.push(unit, deck, hulls, cabinMaterial);
  }

  private buildTrees(): THREE.InstancedMesh {
    const spots = this.treeSpots();
    const palm = activeTheme().vegetation === "palm";
    const treeGeometry = palm ? this.palmGeometry() : this.roundTreeGeometry();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.InstancedMesh(treeGeometry, material, Math.max(spots.length, 1));
    mesh.castShadow = true;
    spots.forEach((spot, index) => {
      const scale = palm ? 1.25 + spot.seed * 0.7 : 0.8 + spot.seed * 0.9;
      this.compose(spot.x, spot.y - 0.1, spot.z, spot.seed * Math.PI * 2, scale, scale, scale);
      mesh.setMatrixAt(index, this.matrix);
    });
    mesh.count = spots.length;
    this.group.add(mesh);
    this.disposables.push(treeGeometry, material);
    return mesh;
  }

  private buildCars(): { mesh: THREE.InstancedMesh; cars: Car[] } {
    const paths: CarPath[] = [];
    for (const district of this.layout.districts) {
      for (const path of district.carPaths) {
        const { cumulative, total } = polyCumulative(path);
        paths.push({ points: path, cumulative, total, y: 0.08, terrain: district.terrain });
      }
    }
    const cars: Car[] = [];
    paths.forEach((path, pathIndex) => {
      const count = 3;
      for (let index = 0; index < count; index += 1) {
        const seed = hashSeed(`car:${pathIndex}:${index}`);
        cars.push({ path, distance: (index / count) * path.total + seed * 5, speed: 6.5 + seed * 6 });
      }
    });
    const carColors = ["#f8f5ec", "#c96f4a", "#4d7ca8", "#3f8f7a", "#d8a13c", "#8d5a5a"];
    const geometry = new THREE.BoxGeometry(2.5, 0.8, 1.2).translate(0, 0.4, 0);
    const material = new THREE.MeshLambertMaterial({ color: "#ffffff" });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(cars.length, 1));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cars.forEach((car, index) => {
      const tint = carColors[Math.floor(hashSeed(`carc:${index}`) * carColors.length)];
      mesh.setColorAt(index, this.color.set(tint));
    });
    mesh.count = cars.length;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.disposables.push(geometry, material);
    return { mesh, cars };
  }

  private buildBoats(): { mesh: THREE.InstancedMesh; boats: Array<{ path: CarPath; distance: number; speed: number; phase: number; wakeTimer: number }>; wakeMesh: THREE.InstancedMesh; wakes: Array<{ x: number; z: number; birth: number; driftX: number; driftZ: number }> } {
    // 船沿海岸外扩航道巡航（折线推进，与车辆同一套采样）。
    const boats: ReturnType<CityParts["buildBoats"]>["boats"] = [];
    this.layout.boatLoops?.forEach((loop, laneIndex) => {
      const { cumulative, total } = polyCumulative(loop);
      const count = 3 + (laneIndex % 2);
      for (let index = 0; index < count; index += 1) {
        boats.push({
          path: { points: loop, cumulative, total, y: -0.3, terrain: null },
          distance: (index / count) * total + hashSeed(`bd:${laneIndex}:${index}`) * 40,
          speed: (laneIndex % 2 === 0 ? 1 : -1) * (2.6 + hashSeed(`bs:${laneIndex}:${index}`) * 1.6),
          phase: hashSeed(`bp:${laneIndex}:${index}`) * Math.PI * 2,
          wakeTimer: hashSeed(`bt:${laneIndex}:${index}`) * 0.3,
        });
      }
    });
    const hull = new THREE.BoxGeometry(11.5, 2, 4).translate(0, 1, 0);
    const cabin = new THREE.BoxGeometry(4.3, 1.8, 2.9).translate(1.4, 2.9, 0);
    const geometry = mergeGeometries([hull, cabin]);
    const material = new THREE.MeshLambertMaterial({ color: "#f2efe6" });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(boats.length, 1));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    boats.forEach((boat, index) => {
      mesh.setColorAt(index, this.color.set(index % 3 === 0 ? "#c96f4a" : index % 3 === 1 ? "#5d7f9a" : "#e8e2d5"));
    });
    mesh.count = boats.length;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.disposables.push(geometry, material, hull, cabin);
    // 飞桥游艇（VICE S3）：2 艘白色豪华游艇——船体+飞桥层+桅杆。比斯坎湾意象。
    // 单独批次（几何更复杂），复用现有航道与尾迹系统。
    {
      const yachtCount = 2;
      const flybridge = new THREE.BoxGeometry(3.4, 1.4, 2.2).translate(-1.8, 4.2, 0);
      const radarArch = new THREE.BoxGeometry(0.3, 2.2, 2.4).translate(-3.6, 5.4, 0);
      const bowSpray = new THREE.ConeGeometry(0.5, 2.5, 4).rotateZ(-Math.PI / 2).translate(6.5, 0.8, 0);
      const yachtGeometry = mergeGeometries([hull.clone(), cabin.clone(), flybridge, radarArch, bowSpray]);
      const yachtMaterial = new THREE.MeshLambertMaterial({ color: "#f8f6f0" });
      const yachtMesh = new THREE.InstancedMesh(yachtGeometry, yachtMaterial, yachtCount);
      yachtMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      yachtMesh.frustumCulled = false;
      yachtMesh.name = "city-yachts";
      // 挑 2 艘船的位置替换为游艇（索引 0 和 lane 1 的 0 号）。
      this.yachtIndices = boats.length > 0 ? [0, Math.min(boats.length - 1, 3)] : [];
      this.yachtMesh = yachtMesh;
      this.yachtMesh.count = this.yachtIndices.length;
      for (let y = 0; y < this.yachtIndices.length; y += 1) {
        yachtMesh.setColorAt(y, this.color.set(y === 0 ? "#f8f6f0" : "#e8e4d8"));
      }
      this.group.add(yachtMesh);
      this.disposables.push(yachtGeometry, yachtMaterial, flybridge, radarArch, bowSpray);
    }
    // 尾迹泡沫（tinyskies WakeTrail 手法）：船尾定期吐软圆斑，漂移放大后消散。
    // 径向渐变贴图让圆斑边缘衰减——纯色圆片读作沙盘贴纸，不像浪花。
    const foamCanvas = createRenderCanvas();
    foamCanvas.width = foamCanvas.height = 64;
    const foamCtx = foamCanvas.getContext("2d");
    if (foamCtx) {
      const gradient = foamCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, "rgba(255,255,255,0.95)");
      gradient.addColorStop(0.45, "rgba(255,255,255,0.4)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      foamCtx.fillStyle = gradient;
      foamCtx.fillRect(0, 0, 64, 64);
    }
    const foamTexture = new THREE.CanvasTexture(foamCanvas);
    const foamMaterial = new THREE.MeshBasicMaterial({ color: "#eef6f7", map: foamTexture, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
    const wakeGeometry = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
    const wakeMesh = new THREE.InstancedMesh(wakeGeometry, foamMaterial, 128);
    wakeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    wakeMesh.frustumCulled = false;
    wakeMesh.renderOrder = 1;
    const wakes: Array<{ x: number; z: number; birth: number; driftX: number; driftZ: number }> = [];
    for (let index = 0; index < 128; index += 1) {
      wakes.push({ x: 0, z: 0, birth: -1, driftX: 0, driftZ: 0 });
      this.compose(0, -60, 0, 0, 0.0001, 0.0001, 0.0001);
      wakeMesh.setMatrixAt(index, this.matrix);
    }
    this.group.add(wakeMesh);
    this.disposables.push(foamTexture, foamMaterial, wakeGeometry);
    return { mesh, boats, wakeMesh, wakes };
  }

  private buildClouds(): { mesh: THREE.InstancedMesh; clouds: Array<{ x: number; z: number; y: number; speed: number; scale: number }> } {
    const clouds: Array<{ x: number; z: number; y: number; speed: number; scale: number }> = [];
    const bounds = this.layout.boundsRadius + 40;
    for (let index = 0; index < 3; index += 1) {
      const seed = hashSeed(`cloud:${index}`);
      clouds.push({
        x: (seed - 0.5) * bounds * 2,
        z: (hashSeed(`cz:${index}`) - 0.5) * bounds * 2,
        y: 220 + seed * 44,
        speed: 0.65 + seed * 0.7,
        scale: 0.5 + seed * 0.4,
      });
    }
    const geometry = new THREE.SphereGeometry(1, 8, 6);
    const material = new THREE.MeshLambertMaterial({ color: "#ffffff", transparent: true, opacity: 0.88, fog: false });
    const mesh = new THREE.InstancedMesh(geometry, material, clouds.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    clouds.forEach((cloud, index) => {
      const blob = 9.5 * cloud.scale;
      this.compose(cloud.x, cloud.y, cloud.z, 0, blob * 1.6, blob * 0.34, blob * 0.8);
      mesh.setMatrixAt(index, this.matrix);
    });
    mesh.count = clouds.length;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.disposables.push(geometry, material);
    return { mesh, clouds };
  }

  private buildAnomalyMarkers(): void {
    for (const district of this.layout.districts) {
      if (!district.anomaly) continue;
      const color = district.anomaly.severity === "critical" ? "#d64545" : district.anomaly.severity === "warning" ? "#e0940f" : "#4a7fa0";
      const geometry = new THREE.OctahedronGeometry(1.15);
      const material = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(district.plaza.x, district.plaza.y + 9, district.plaza.z);
      mesh.renderOrder = 2;
      const ringGeometry = new THREE.RingGeometry(2.6, 3.0, 44).rotateX(-Math.PI / 2);
      const ringMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.set(district.plaza.x, district.plaza.y + 0.16, district.plaza.z);
      ring.renderOrder = 3;
      this.group.add(mesh, ring);
      this.anomalyMarkers.push({ mesh, ring, baseY: district.plaza.y + 9, phase: hashSeed(`anom:${district.id}`) * Math.PI * 2 });
      this.disposables.push(geometry, material, ringGeometry, ringMaterial);
    }
  }

  private buildLabels(): void {
    for (const district of this.layout.districts) {
      const palette = paletteFor(district.id);
      const detail = `${district.sessionCount} sessions`;
      const { texture, aspect } = makeLabelSprite(district.label, detail, palette.accent);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: false });
      const sprite = new THREE.Sprite(material);
      // 标签略放大，且彼此靠近（<150）时逐个抬高，避免重叠（多视角评估：标签小且叠在一起）。
      const height = 0.024;
      sprite.scale.set(height * aspect, height, 1);
      sprite.renderOrder = 20;
      const crowd = this.labels.filter((other) => Math.hypot(other.position.x - district.center.x, other.position.z - district.center.z) < 150).length;
      sprite.position.set(district.center.x, district.plaza.y + 45 + crowd * 34, district.center.z);
      this.group.add(sprite);
      this.labels.push(sprite);
      this.disposables.push(material, texture);
    }
  }

  private buildWater(): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2);
    // 岸线深度图（tinyskies Globe 的 oceanDepth 等价物）：构建期把 -height/16 采样
    // 进单通道纹理（384²，随静态城缓存一次性烘焙）。水面是 1×1 段平面没有顶点
    // 可烘，纹理方案逐像素平滑；河床 height<0 同样被采到，河岸也起涟漪。
    const DEPTH_TEX = 384;
    const DEPTH_WORLD = 1500;
    const depthData = new Uint8Array(DEPTH_TEX * DEPTH_TEX);
    for (let y = 0; y < DEPTH_TEX; y += 1) {
      for (let x = 0; x < DEPTH_TEX; x += 1) {
        const worldX = (x / (DEPTH_TEX - 1) - 0.5) * DEPTH_WORLD * 2;
        const worldZ = (y / (DEPTH_TEX - 1) - 0.5) * DEPTH_WORLD * 2;
        const h = this.layout.terrain.height(worldX, worldZ);
        depthData[y * DEPTH_TEX + x] = Math.max(0, Math.min(255, Math.round((-h / 16) * 255)));
      }
    }
    const depthTexture = new THREE.DataTexture(depthData, DEPTH_TEX, DEPTH_TEX, THREE.RedFormat, THREE.UnsignedByteType);
    depthTexture.minFilter = THREE.LinearFilter;
    depthTexture.magFilter = THREE.LinearFilter;
    depthTexture.wrapS = THREE.ClampToEdgeWrapping;
    depthTexture.wrapT = THREE.ClampToEdgeWrapping;
    depthTexture.needsUpdate = true;
    this.disposables.push(depthTexture);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSun: { value: new THREE.Vector3(0.55, 0.75, 0.36).normalize() },
        uDeep: { value: new THREE.Color(activeTheme().water.deep) },
        uShallow: { value: new THREE.Color(activeTheme().water.shallow) },
        uSky: { value: new THREE.Color(activeTheme().water.sky) },
        uDepth: { value: depthTexture },
        uDepthWorld: { value: DEPTH_WORLD },
        // 与 scene.background 同色：ShaderMaterial 不吃 scene.fog，水面远处要自己淡出到天空色，
        // 否则 2600 见方的水面直边会像「世界边缘」露在天空下。
        uFog: { value: new THREE.Color(activeTheme().skyHorizon) },
        uFogRange: { value: new THREE.Vector2(...activeTheme().waterFog) },
        uNormal: { value: null as THREE.Texture | null },
        // 平面镜反射（引擎每帧把镜像相机看到的场景渲染进来）：岸边的楼、山、桥倒映在水里。
        uMirror: { value: null as THREE.Texture | null },
        uMirrorMatrix: { value: new THREE.Matrix4() },
        uHasMirror: { value: 0 },
        uNight: { value: 0 },
        uSkyTex: { value: null as THREE.Texture | null },
        uHasAssets: { value: 0 },
        uGradeTop: { value: new THREE.Color(activeTheme().skyGrade.top) },
        uGradeHorizon: { value: new THREE.Color(activeTheme().skyGrade.horizon) },
        uGradeAmount: { value: activeTheme().skyGrade.amount },
        uSkyYaw: { value: skyYawOf(activeTheme()) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSun;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uSky;
        uniform vec3 uFog;
        uniform vec2 uFogRange;
        uniform sampler2D uNormal;
        uniform sampler2D uMirror;
        uniform mat4 uMirrorMatrix;
        uniform float uHasMirror;
        uniform float uNight;
        uniform sampler2D uSkyTex;
        uniform float uHasAssets;
        uniform vec3 uGradeTop;
        uniform vec3 uGradeHorizon;
        uniform float uGradeAmount;
        uniform float uSkyYaw;
        uniform sampler2D uDepth;
        uniform float uDepthWorld;
        varying vec3 vWorld;
        // 与天空球同一套采样 + 调色：反射和远处淡出都要与天空完全一致，否则地平线出现接缝。
        vec3 skyAt(vec3 dir) {
          dir = normalize(dir);
          vec2 uv = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5 + uSkyYaw, asin(clamp(dir.y, 0.002, 1.0)) / 3.1415927 + 0.5);
          vec3 photo = texture2D(uSkyTex, uv).rgb;
          vec3 tint = mix(uGradeHorizon, uGradeTop, smoothstep(0.0, 0.6, max(dir.y, 0.0)));
          return mix(photo, photo * tint * 1.55, uGradeAmount);
        }
        // 水面法线贴图（512²）在该 uv 处的 mip 级：0 = 1 texel/像素，每 +1 = 降采样一倍。
        float waterMip(vec2 uv) {
          vec2 d = fwidth(uv) * 512.0;
          return log2(max(max(d.x, d.y), 1e-4));
        }
        float rHash(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
        vec2 rHash2(vec2 c) { return fract(sin(vec2(dot(c, vec2(127.1, 311.7)), dot(c, vec2(269.5, 183.3)))) * 43758.5453); }
        // 平滑值噪声（格点哈希 + smoothstep 插值）：没有周期，等值线不成点阵。
        float valueNoise(vec2 q) {
          vec2 i = floor(q);
          vec2 f = fract(q);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float a = rHash(i);
          float b = rHash(i + vec2(1.0, 0.0));
          float c = rHash(i + vec2(0.0, 1.0));
          float e = rHash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, u.x), mix(c, e, u.x), u.y);
        }
        // 一层涟漪：格距 cell；查 3×3 邻格（中心在格内 0.15–0.85、半径 ≤ 0.85 格，跨格的环也能画到）。
        float rippleLayer(vec2 p, float cell, float t, float seed) {
          vec2 g = floor(p / cell);
          float acc = 0.0;
          for (int i = -1; i <= 1; i++) {
            for (int j = -1; j <= 1; j++) {
              vec2 c = g + vec2(float(i), float(j));
              float period = 3.0 + rHash(c + seed) * 5.0;              // 时间：每格自己的周期
              float phase = t / period + rHash(c + seed + 7.1);        // …且错相
              float cycle = floor(phase);
              float age = fract(phase);
              float alive = step(0.45, rHash(c + cycle * 3.3 + seed + 1.7)); // 约一半轮次不出现
              vec2 center = (c + 0.15 + rHash2(c + cycle * 13.7 + seed) * 0.7) * cell; // 位置：每轮重抽
              float maxR = cell * (0.3 + 0.55 * rHash(c + cycle * 5.9 + seed + 4.2)); // 大小：每轮随机
              float r = age * maxR;
              float width = 0.7 + r * 0.06;
              float ring = 1.0 - smoothstep(0.0, width, abs(length(p - center) - r));
              acc += ring * (1.0 - age) * (1.0 - age) * alive;
            }
          }
          return acc;
        }
        // 离岸深度（构建期烘焙）：0 = 水线，1 = 深水；纹理外一律深水。
        float shoreDepth(vec2 p) {
          vec2 uv = p / (uDepthWorld * 2.0) + 0.5;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
          return texture2D(uDepth, uv).r;
        }
        void main() {
          vec2 p = vWorld.xz;
          // 不再用解析波（几组平面波之和）做法线：平面波相加本身是二维干涉点阵，波峰周期性对齐，
          // 镜面高光 pow(·,64) 在每个波峰上点出一颗一模一样的白椭圆，满海排成格子（拍照实测：
          // 关掉碎光、法线贴图、镜面倒影、尾迹之后椭圆都还在）。法线只来自下面旋转错开的法线贴图层，
          // 起伏的随机感交给随机涟漪。
          vec3 n = vec3(0.0, 1.0, 0.0);
          if (uHasAssets > 0.5) {
            // 两层反向滚动的法线贴图：细碎波纹不再是规则的正弦格。
            // 曾是 p/46、p/19 两层轴对齐平铺：同一块贴图每 46 单位原样复制，掠射角下菲涅尔
            // 反射把每块的法线偏转放大成一颗暗椭圆，全海排成规则点阵。现在三层各自旋转到
            // 非轴向、尺度互不整除（重复周期错开），再用低频场混合权重，平铺不再对齐成格。
            vec2 pa = mat2(0.857, 0.515, -0.515, 0.857) * p;   // 31°
            vec2 pb = mat2(0.682, -0.731, 0.731, 0.682) * p;   // -47°
            vec2 pc = mat2(0.276, 0.961, -0.961, 0.276) * p;   // 74°
            vec2 uvA = pa / 41.3 + vec2(uTime * 0.010, uTime * 0.006);
            vec2 uvB = pb / 15.7 - vec2(uTime * 0.007, -uTime * 0.011);
            vec2 uvC = pc / 113.0 + vec2(uTime * 0.004, -uTime * 0.003);
            vec3 a = texture2D(uNormal, uvA).xyz * 2.0 - 1.0;
            vec3 b = texture2D(uNormal, uvB).xyz * 2.0 - 1.0;
            vec3 c = texture2D(uNormal, uvC).xyz * 2.0 - 1.0;
            // 旋转只把点阵转斜，不消除周期（上一版修复的错）。真正成格的原因：一层平铺在屏幕上
            // 只有几十像素时，512² 贴图被 mip 降采样 ~3 级，细节滤光、只剩「以平铺尺寸为周期」的
            // 低频分量——一张干净的正弦格，再被掠射菲涅尔放大。按各层自己的 mip 级淡出：细节一旦
            // 被滤掉就不再贡献法线，留下的起伏由下面 wave() 的解析法线（非格点平面波）接管。
            float wA = 1.0 - smoothstep(1.0, 2.5, waterMip(uvA));
            float wB = 1.0 - smoothstep(1.0, 2.5, waterMip(uvB));
            float wC = 1.0 - smoothstep(1.0, 2.5, waterMip(uvC));
            float mixW = 0.5 + 0.5 * sin(p.x * 0.013 + p.y * 0.017) * sin(p.y * 0.011 - p.x * 0.007);
            vec3 t = a * wA * (0.6 + 0.4 * mixW) + b * wB * (1.0 - 0.4 * mixW) + c * wC * 0.7;
            float strength = 0.28;
            n = normalize(vec3(t.x * strength + n.x * 0.5, 1.0, t.y * strength + n.z * 0.5));
          }
          vec3 view = normalize(cameraPosition - vWorld);
          float fresnel = pow(1.0 - max(dot(n, view), 0.0), 2.4);
          vec3 base = mix(uShallow, uDeep, clamp(length(p) / 420.0, 0.0, 1.0));
          vec3 skyColor = uHasAssets > 0.5 ? mix(skyAt(reflect(-view, n)), uSky, uNight) : uSky; // 夜里不再倒映晚霞照片
          if (uHasMirror > 0.5) {
            // 镜像贴图按投影坐标采样，再用波纹法线扰动：倒影随水波轻晃而不是一面硬镜子。
            vec4 projected = uMirrorMatrix * vec4(vWorld, 1.0);
            vec2 mirrorUv = projected.xy / projected.w + n.xz * 0.035;
            skyColor = texture2D(uMirror, mirrorUv).rgb;
          }
          // 有镜面倒影时反射占比更高：平静海面在斜视角下几乎就是一面镜子。
          float reflectance = uHasMirror > 0.5 ? 0.04 + fresnel * 0.9 : (uHasAssets > 0.5 ? 0.12 + fresnel * 0.78 : fresnel * 0.6);
          vec3 color = mix(base, skyColor, reflectance);
          float specular = pow(max(dot(reflect(-normalize(uSun), n), view), 0.0), 64.0);
          color += vec3(1.0, 0.97, 0.88) * specular * 1.05;
          // ── 随机涟漪 ─────────────────────────────────────────────────────
          // 曾是 sin×sin×sin 的「碎光」乘积场 × 正弦掩码 × 波峰门控：正弦的乘积本身是周期点阵，
          // 满海排成规则的白椭圆（拍照实测，关掉法线贴图/镜面/尾迹都还在）。现在是真正的涟漪：
          // 海面按格子划分，每格每一轮——中心在格内随机重抽（位置随机）、周期 3–8 秒且各自错相
          // 并有约一半轮次不出现（时间随机）、最大半径随机（大小随机）；两层不同格距（22/47，
          // 第二层旋转）混出大小涟漪。全部由 uTime 与哈希决定：导出仍可复现。
          float dist = distance(cameraPosition, vWorld);
          float sunPath = smoothstep(0.55, 0.95, dot(reflect(-normalize(uSun), n), view));
          float ripples = rippleLayer(p, 22.0, uTime, 0.0)
            + rippleLayer(mat2(0.6, 0.8, -0.8, 0.6) * p, 47.0, uTime * 0.8, 31.0) * 0.75;
          // 环宽 ~1 单位：屏幕上一像素已经大于环宽时淡出（远处不闪成噪点），再进雾前柔和收尾。
          float footprint = length(fwidth(p));
          ripples *= (1.0 - smoothstep(0.5, 1.6, footprint)) * (1.0 - smoothstep(650.0, 1100.0, dist));
          color += vec3(0.88, 0.95, 1.0) * ripples * 0.16 * (1.0 - uNight * 0.75);
          // 太阳反射带里的涟漪更亮（碎金）：只在日间。
          color += vec3(1.0, 0.98, 0.9) * ripples * sunPath * 0.55 * (1.0 - uNight);
          // ── 岸线涟漪（tinyskies Globe 手法，作者授权移植）──────────────────
          // 只此一件：fract(深度×频率−时间) 生成向岸滚动的白色波纹带，sin 噪声让
          // 条带不规则、深度衰减离岸消失。深度驱动、空间上低频（条带宽 ~10-30 单
          // 位），远处（700–1400）柔和淡出防混叠；不动碎光、不加开阔海面浪花。
          float d = shoreDepth(p);
          if (d < 0.8) {
            float dayFade = 1.0 - uNight * 0.6;
            // 条带的不规则来自哈希值噪声（非周期），不再是两个正弦之和——深度在大片浅滩/陆下近乎常数时，
            // 条带退化成噪声的等值线，正弦和的等值线是一张规则的椭圆点阵，满海一圈圈白椭圆（拍照实测）。
            float nz = (valueNoise(p * 0.035 + vec2(uTime * 0.05, -uTime * 0.03)) - 0.5) * 0.09
              + (valueNoise(p * 0.09 - vec2(uTime * 0.04, uTime * 0.06)) - 0.5) * 0.04;
            float contour = fract((d + nz) * 4.0 - uTime * 0.42);
            // 只在深度真的在变的地方画（靠近真实岸线）：用 2 单位差分估深度梯度，平坦处不画条带。
            float grad = length(vec2(shoreDepth(p + vec2(2.0, 0.0)) - d, shoreDepth(p + vec2(0.0, 2.0)) - d)) * 0.5;
            float band = smoothstep(0.45, 0.7, contour) * (1.0 - smoothstep(0.75, 1.0, contour));
            // 只留最靠岸的一窄条：窄河里深度处处都浅，曾整条河铺满白色条带、读作结冰（拍照实测）。
            float depthFade = 1.0 - smoothstep(0.03, 0.3, d);
            float bandFade = 1.0 - smoothstep(700.0, 1400.0, dist);
            float slopeFade = smoothstep(0.0012, 0.004, grad);
            color = mix(color, vec3(0.9, 0.97, 0.98), band * depthFade * bandFade * slopeFade * 0.45 * dayFade);
          }
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          // 雾混在色调映射之后：scene.background 不经色调映射，先混再映射会让远水发灰、与天空出现色带。
          vec3 fogColor = uFog;
          if (uHasAssets > 0.5) {
            // 远处淡出到「这个方向地平线上的天空」，而不是一个常数色。
            vec3 horizonDir = normalize(vec3(vWorld.x - cameraPosition.x, 0.0, vWorld.z - cameraPosition.z));
            fogColor = skyAt(horizonDir + vec3(0.0, 0.01, 0.0));
          }
          // 夜里远海淡出到夜雾色：skyAt 采样的是黄昏照片，天穹入夜后换成渐变，水面却一直淡出到照片里的
          // 晚霞——23 点远海一整条粉红光带（用户截图「光照污染」）。
          fogColor = mix(fogColor, uSky, uNight); // uSky 每个 tick 按当前档位的雾色更新；uFog 是主题常量（迈阿密的晚霞橙），夜里不能用
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(uFogRange.x, uFogRange.y, dist));
          #include <colorspace_fragment>
        }
      `,
    });
    this.waterAssetUniforms = material.uniforms as Record<string, { value: unknown }>;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = -0.55;
    this.disposables.push(geometry, material);
    return mesh;
  }

  private buildRuntimes(): void {
    const districtsById = new Map(this.layout.districts.map((district) => [district.id, district]));
    let podiumCount = 0;
    let roofCount = 0;
    let scaffoldCount = 0;
    let antennaCount = 0;
    let beaconCount = 0;
    let craneCount = 0;
    const shaftCursor = [0, 0, 0, 0];
    let decoCursor = 0;

    const ordered = [...this.model.buildings].sort((left, right) => left.startedAt - right.startedAt);
    for (const building of ordered) {
      const district = districtsById.get(building.districtId);
      const slot = district?.slots.get(building.id);
      if (!district || !slot) continue;
      const palette = paletteFor(building.districtId);
      const runtime: BuildingRuntime = {
        building,
        slot,
        facade: -1,
        groundY: district.grounds.get(building.id) ?? 0,
        paletteWall: new THREE.Color(palette.wall).multiplyScalar(0.92 + building.seed * 0.16),
        display: this.previousDisplays?.get(building.id) ?? 0,
        target: building.builtFraction,
        settled: this.previousDisplays ? this.previousDisplays.has(building.id) : true,
        district,
        shaftPrimary: -1,
        shaftUpper: -1,
        podium: -1,
        roof: -1,
        scaffold: -1,
        antenna: -1,
        beacon: -1,
        craneMast: -1,
        craneArm: -1,
        cranePhase: building.seed * Math.PI * 2,
        craneX: 0,
        craneZ: 0,
        blinkPhase: hashSeed(`blink:${building.id}`) * Math.PI * 2,
        deco: -1,
        roofKind: 0,
        hero: false,
      };

      runtime.facade = this.facadeFor(building);
      if (runtime.facade === 3) {
        runtime.deco = decoCursor;
        decoCursor += 1;
        // 装饰艺术楼墙面用执行环境强调色的粉彩版（而不是执行环境的浅墙色）：浅墙色在黄昏暖光下被压成灰，
        // 海滨要的是一眼能认出的粉、薄荷、青、紫。
        runtime.paletteWall = new THREE.Color(palette.accent).lerp(new THREE.Color("#ffffff"), 0.52).multiplyScalar(0.96 + building.seed * 0.08);
        // 转角柱与墙同色略亮；女儿墙与遮阳棚用执行环境强调色的粉彩版——海滨一眼看出是哪个执行环境。
        const accent = new THREE.Color(palette.accent).lerp(new THREE.Color("#ffffff"), 0.35);
        this.decoCornerMesh.setColorAt(runtime.deco, runtime.paletteWall.clone().multiplyScalar(1.06));
        this.decoTrimMesh.setColorAt(runtime.deco * 2, accent);
        this.decoTrimMesh.setColorAt(runtime.deco * 2 + 1, accent.clone().multiplyScalar(0.92));
      }
      const mesh = this.shaftMeshes[runtime.facade];
      const instanceMap = this.shaftIdByInstance[runtime.facade];
      const wantsUpper = this.formOf(building) === "tower" || this.formOf(building) === "landmark";
      runtime.shaftPrimary = shaftCursor[runtime.facade];
      mesh.setColorAt(runtime.shaftPrimary, runtime.paletteWall);
      (mesh.geometry.getAttribute("aFloors") as THREE.InstancedBufferAttribute).setX(runtime.shaftPrimary, Math.max(2, Math.round(building.height / 3.1)));
      instanceMap.set(runtime.shaftPrimary, building.id);
      shaftCursor[runtime.facade] += 1;
      if (wantsUpper) {
        runtime.shaftUpper = shaftCursor[runtime.facade];
        mesh.setColorAt(runtime.shaftUpper, runtime.paletteWall.clone().multiplyScalar(0.94));
        (mesh.geometry.getAttribute("aFloors") as THREE.InstancedBufferAttribute).setX(runtime.shaftUpper, Math.max(2, Math.round((building.height * 0.28) / 3.1)));
        instanceMap.set(runtime.shaftUpper, building.id);
        shaftCursor[runtime.facade] += 1;
      }

      const needsPodium = this.formOf(building) !== "tower" && this.formOf(building) !== "landmark";
      if (needsPodium) {
        runtime.podium = podiumCount;
        this.podiumMesh.setColorAt(podiumCount, runtime.paletteWall.clone().multiplyScalar(0.88));
        podiumCount += 1;
      }
      runtime.roof = roofCount;
      this.roofMesh.setColorAt(roofCount, new THREE.Color(palette.roof).multiplyScalar(0.94 + building.seed * 0.12));
      runtime.roofKind = this.roofKindFor(building, runtime.facade);
      const roofColor = new THREE.Color(palette.roof).multiplyScalar(0.94 + building.seed * 0.12);
      const profileColors = [roofColor, new THREE.Color(palette.accent).lerp(new THREE.Color("#e8eef0"), 0.55), runtime.paletteWall.clone().multiplyScalar(0.96), new THREE.Color("#7fae6a")];
      this.roofProfiles.forEach((mesh, index) => mesh.setColorAt(roofCount, profileColors[index]));
      // 乘 3.2 让亮度越过 bloom 阈值（MeshBasicMaterial 不吃光照，toneMapped=false 保留 HDR 值）。
      this.neonMesh.setColorAt(roofCount, new THREE.Color(palette.accent).multiplyScalar(3.2));
      roofCount += 1;
      runtime.scaffold = scaffoldCount;
      scaffoldCount += 1;
      if (this.formOf(building) === "landmark" && antennaCount < 94) {
        runtime.antenna = antennaCount;
        antennaCount += 1;
        runtime.beacon = beaconCount;
        beaconCount += 1;
      }
      if (building.active && craneCount < 46) {
        runtime.craneMast = craneCount;
        runtime.craneArm = craneCount;
        craneCount += 1;
      }

      this.runtimes.push(runtime);
      this.runtimeById.set(building.id, runtime);
    }

    this.shaftMeshes.forEach((mesh, variant) => {
      mesh.count = shaftCursor[variant];
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    this.podiumMesh.count = podiumCount;
    if (this.podiumMesh.instanceColor) this.podiumMesh.instanceColor.needsUpdate = true;
    this.roofMesh.count = roofCount;
    for (const mesh of this.roofProfiles) {
      mesh.count = roofCount;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.gardenTreeMesh.count = roofCount * 3;
    // 天际线焦点：token 最多的会话。楼高本就是 token 的单调函数，它已是（或几乎是）最高楼；
    // 这里只给它专属冠顶，不改高度——高度是数据语义。
    let hero: BuildingRuntime | null = null;
    for (const runtime of this.runtimes) if (!hero || runtime.building.tokensTotal > hero.building.tokensTotal) hero = runtime;
    if (hero) {
      hero.hero = true;
      hero.roofKind = 0;
      this.buildHeroCrown(hero);
    }
    this.neonMesh.count = activeTheme().neon ? roofCount : 0;
    if (this.neonMesh.instanceColor) this.neonMesh.instanceColor.needsUpdate = true;
    if (this.roofMesh.instanceColor) this.roofMesh.instanceColor.needsUpdate = true;
    this.scaffoldMesh.count = scaffoldCount;
    this.antennaMesh.count = antennaCount;
    this.beaconMesh.count = beaconCount;
    this.craneMastMesh.count = craneCount;
    this.decoCornerMesh.count = decoCursor;
    this.decoTrimMesh.count = decoCursor * 2;
    if (this.decoCornerMesh.instanceColor) this.decoCornerMesh.instanceColor.needsUpdate = true;
    if (this.decoTrimMesh.instanceColor) this.decoTrimMesh.instanceColor.needsUpdate = true;
    this.craneArmMesh.count = craneCount;

    // 初次落矩阵：回访的楼按已知高度写（settled），新到的楼从 display=0 藏起，
    // 由 update 循环长入——immediate=true 会按 target 写满高，新楼会先闪一下。
    for (const runtime of this.runtimes) this.applyConstruction(runtime, runtime.settled);
  }

  private compose(x: number, y: number, z: number, rotationY: number, sx: number, sy: number, sz: number): void {
    this.euler.set(0, rotationY, 0);
    this.quaternion.setFromEuler(this.euler);
    this.positionVector.set(x, y, z);
    this.scaleVector.set(Math.max(sx, 0.0001), Math.max(sy, 0.0001), Math.max(sz, 0.0001));
    this.matrix.compose(this.positionVector, this.quaternion, this.scaleVector);
  }

  /** 施工矩阵：显示进度 display ∈ [0,1] → 主体/退台/屋面/脚手架/天线/吊车。
   *  所有 y 以地基海拔 groundY 为基准 —— 楼长在起伏地形上。 */
  private applyConstruction(runtime: BuildingRuntime, immediate: boolean): void {
    const building = runtime.building;
    const { x, z } = runtime.slot;
    const g = runtime.groundY;
    const visible = immediate ? runtime.target : runtime.display;
    const fraction = Math.max(0, Math.min(1, visible));
    if (fraction <= 0.001) {
      this.hideAll(runtime);
      return;
    }
    const h = building.height;
    const fp = building.footprint;
    const built = Math.max(0.5, fraction * h);
    const split = this.formOf(building) === "tower" || this.formOf(building) === "landmark" ? 0.72 : 1;
    const podiumHeight = runtime.podium >= 0 ? Math.min(built, 1.5) : 0;

    let widths: [number, number];
    if (this.formOf(building) === "slab") widths = [fp * 1.3, fp * 0.58];
    else if (this.formOf(building) === "block") widths = [fp * 1.2, fp * 0.85];
    else if (this.formOf(building) === "tower" || this.formOf(building) === "landmark") widths = [fp * 0.72, fp * 0.72]; // 细方塔（曾 0.86×0.55，与板楼裁平后难分）
    else widths = [fp, fp];
    const streetWidth = runtime.slot.width * (runtime.slot.zone === "downtown" ? 0.8 : 0.88);
    if (this.formOf(building) !== "tower" && this.formOf(building) !== "landmark") widths[0] = Math.max(widths[0], streetWidth);
    widths[0] = Math.min(widths[0], runtime.slot.width - 0.8);
    widths[1] = Math.min(widths[1], runtime.slot.depth - 2);
    // 海滨酒店地块上的会话楼：铺满宽地块成为一栋酒店（低楼走装饰艺术立面，见 facadeFor 的海滨规则）。
    // 楼高仍由 token 决定——酒店是会话，不是装饰。
    if (runtime.slot.blockId.startsWith("hotel:")) widths = [runtime.slot.width * 0.92, runtime.slot.depth * 0.9];

    // Parcel frontage owns orientation; podium, shaft and roof share it.
    const yaw = runtime.slot.yaw;
    // 主体段。
    const shaftBottom = g + podiumHeight;
    const shaftTop = g + Math.min(built, h * split);
    const shaftHeight = Math.max(0, shaftTop - shaftBottom);
    if (runtime.shaftPrimary >= 0) {
      if (shaftHeight < 0.15) {
        this.compose(x, -40, z, 0, 0, 0, 0);
      } else {
        this.compose(x, shaftBottom, z, yaw, widths[0], shaftHeight, widths[1]);
      }
      this.shaftMeshes[runtime.facade].setMatrixAt(runtime.shaftPrimary, this.matrix);
    }
    // 退台段（tower/landmark）。
    if (runtime.shaftUpper >= 0) {
      const upperHeight = Math.max(0, built - h * split);
      if (upperHeight < 0.15) {
        this.compose(x, -40, z, 0, 0, 0, 0);
      } else {
        this.compose(x, g + h * split, z, yaw, widths[0] * 0.72, upperHeight, widths[1] * 0.72);
      }
      this.shaftMeshes[runtime.facade].setMatrixAt(runtime.shaftUpper, this.matrix);
    }
    if (runtime.podium >= 0) {
      this.compose(x, g, z, yaw, fp * 1.16, podiumHeight > 0.1 ? podiumHeight : 0, fp * 1.16);
      this.podiumMesh.setMatrixAt(runtime.podium, this.matrix);
    }
    if (runtime.roof >= 0) {
      const roofY = g + Math.max(0.4, built - 0.18);
      const roofWidth = runtime.shaftUpper >= 0 && built > h * split ? widths[0] * 0.78 : widths[0] * 1.06;
      const roofDepth = runtime.shaftUpper >= 0 && built > h * split ? widths[1] * 0.78 : widths[1] * 1.06;
      this.compose(x, roofY, z, yaw, roofWidth, 0.34, roofDepth);
      this.roofMesh.setMatrixAt(runtime.roof, this.matrix);
      this.compose(x, roofY - 0.12, z, yaw, roofWidth * 1.16, 0.3, roofDepth * 1.16);
      this.neonMesh.setMatrixAt(runtime.roof, this.matrix);
      // 屋顶轮廓只在封顶后出现：施工中的楼顶是脚手架。
      const capped = fraction > 0.985;
      const top = roofY + 0.34;
      this.roofProfiles.forEach((mesh, index) => {
        const kind = index + 1;
        if (!capped || runtime.roofKind !== kind) this.compose(x, -40, z, 0, 0, 0, 0);
        else if (kind === 1) this.compose(x, top, z, yaw, roofWidth, Math.min(roofWidth, roofDepth) * 0.42, roofDepth);
        else if (kind === 2) this.compose(x, top, z, yaw, roofWidth * 0.92, Math.max(6, h * 0.22), roofDepth * 0.92);
        else if (kind === 3) this.compose(x, top, z, yaw, roofWidth * 0.62, Math.max(2.4, h * 0.06), roofDepth * 0.62);
        else this.compose(x, top, z, yaw, roofWidth * 0.86, 0.35, roofDepth * 0.86);
        mesh.setMatrixAt(runtime.roof, this.matrix);
      });
      for (let tree = 0; tree < 3; tree += 1) {
        if (capped && runtime.roofKind === 4) {
          const angle = runtime.building.seed * 6.283 + tree * 2.1;
          const reach = Math.min(roofWidth, roofDepth) * 0.28;
          const scale = 0.7 + ((runtime.building.seed * 7 + tree) % 1) * 0.5;
          this.compose(x + Math.cos(angle) * reach, top + 0.3, z + Math.sin(angle) * reach, 0, scale, scale * 1.1, scale);
        } else this.compose(x, -40, z, 0, 0, 0, 0);
        this.gardenTreeMesh.setMatrixAt(runtime.roof * 3 + tree, this.matrix);
      }
      if (runtime.hero) this.placeHeroCrown(x, roofY + 0.34, z, roofWidth, roofDepth, h, capped);
    }
    // 脚手架：包住"计划高度"的剩余部分——楼还没到的地方先看见壳。
    if (runtime.scaffold >= 0) {
      const remaining = h - built;
      if (fraction < 0.985 && remaining > 0.6) {
        this.compose(x, g + built, z, yaw, widths[0] * 1.14, remaining, widths[1] * 1.14);
      } else {
        this.compose(x, -40, z, 0, 0, 0, 0);
      }
      this.scaffoldMesh.setMatrixAt(runtime.scaffold, this.matrix);
    }
    // 装饰艺术附件：圆角转角柱随楼长高；封顶后立起阶梯女儿墙；底层有遮阳棚。
    if (runtime.deco >= 0) {
      const local = (lx: number, lz: number) => ({ x: x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z: z - lx * Math.sin(yaw) + lz * Math.cos(yaw) });
      const radius = Math.min(widths[0], widths[1]) * 0.24;
      const corner = local(widths[0] / 2 - radius * 0.55, widths[1] / 2 - radius * 0.55);
      this.compose(corner.x, g, corner.z, 0, radius, Math.max(0.2, built + 0.4), radius);
      this.decoCornerMesh.setMatrixAt(runtime.deco, this.matrix);
      const done = fraction > 0.985;
      const crown = local(0, widths[1] * 0.1);
      this.compose(crown.x, g + built, crown.z, yaw, done ? widths[0] * 0.42 : 0, done ? 2.4 : 0, done ? widths[1] * 0.7 : 0);
      this.decoTrimMesh.setMatrixAt(runtime.deco * 2, this.matrix);
      const awning = local(-widths[0] * 0.08, widths[1] / 2 + 0.8);
      const awningOn = built > 3.4;
      this.compose(awning.x, g + 2.7, awning.z, yaw, awningOn ? widths[0] * 0.66 : 0, awningOn ? 0.28 : 0, awningOn ? 1.7 : 0);
      this.decoTrimMesh.setMatrixAt(runtime.deco * 2 + 1, this.matrix);
    }
    // 天线（landmark 封顶后立起）。
    if (runtime.antenna >= 0) {
      const done = fraction > 0.985;
      this.compose(x, g + h, z, 0, 1, done ? h * 0.1 + 3.4 : 0, 1);
      this.antennaMesh.setMatrixAt(runtime.antenna, this.matrix);
      this.compose(x, g + h + (done ? h * 0.1 + 3.4 : 0), z, 0, 1, 1, 1);
      this.beaconMesh.setMatrixAt(runtime.beacon >= 0 ? runtime.beacon : 0, this.matrix);
    }
    // 吊车（活跃会话）。
    if (runtime.craneMast >= 0) {
      const mastHeight = h * 1.02 + 6.5;
      // 立柱立在地块局部坐标的一角（随 slot.yaw 旋转），不再按世界轴偏移而被楼体吞掉。
      const localX = widths[0] * 0.5 + 0.6;
      const localZ = widths[1] * 0.5 + 0.6;
      const cornerX = x + localX * Math.cos(yaw) + localZ * Math.sin(yaw);
      const cornerZ = z - localX * Math.sin(yaw) + localZ * Math.cos(yaw);
      runtime.craneX = cornerX;
      runtime.craneZ = cornerZ;
      this.compose(cornerX, g, cornerZ, 0, 1, mastHeight, 1);
      this.craneMastMesh.setMatrixAt(runtime.craneMast, this.matrix);
      this.applyCraneArm(runtime, cornerX, cornerZ, g, mastHeight, 0);
    }
  }

  private applyCraneArm(runtime: BuildingRuntime, cornerX: number, cornerZ: number, groundY: number, mastHeight: number, armRotation: number): void {
    const armLength = runtime.building.footprint * 2.4 + 3.4;
    const angle = runtime.cranePhase + armRotation;
    const centerX = cornerX + Math.cos(angle) * armLength * 0.34;
    const centerZ = cornerZ - Math.sin(angle) * armLength * 0.34;
    // three.js 绕 Y 转 θ 后 x 轴指向 (cosθ, -sinθ)，与上面的中心偏移同向，必须传 +angle；
    // 曾传 -angle，悬臂被镜像到另一侧，脱离立柱悬在空中。
    this.compose(centerX, groundY + mastHeight + 0.1, centerZ, angle, armLength, 2.2, 2.2);
    this.craneArmMesh.setMatrixAt(runtime.craneArm, this.matrix);
  }

  private hideAll(runtime: BuildingRuntime): void {
    this.compose(0, -40, 0, 0, 0, 0, 0);
    const building = runtime.building;
    if (runtime.shaftPrimary >= 0) this.shaftMeshes[runtime.facade].setMatrixAt(runtime.shaftPrimary, this.matrix);
    if (runtime.shaftUpper >= 0) this.shaftMeshes[runtime.facade].setMatrixAt(runtime.shaftUpper, this.matrix);
    if (runtime.podium >= 0) this.podiumMesh.setMatrixAt(runtime.podium, this.matrix);
    if (runtime.deco >= 0) {
      this.decoCornerMesh.setMatrixAt(runtime.deco, this.matrix);
      this.decoTrimMesh.setMatrixAt(runtime.deco * 2, this.matrix);
      this.decoTrimMesh.setMatrixAt(runtime.deco * 2 + 1, this.matrix);
    }
    if (runtime.roof >= 0) {
      this.roofMesh.setMatrixAt(runtime.roof, this.matrix);
      this.neonMesh.setMatrixAt(runtime.roof, this.matrix);
      for (const mesh of this.roofProfiles) mesh.setMatrixAt(runtime.roof, this.matrix);
      for (let tree = 0; tree < 3; tree += 1) this.gardenTreeMesh.setMatrixAt(runtime.roof * 3 + tree, this.matrix);
      if (runtime.hero && this.heroParts) this.placeHeroCrown(0, -40, 0, 0, 0, 0, false);
    }
    if (runtime.scaffold >= 0) this.scaffoldMesh.setMatrixAt(runtime.scaffold, this.matrix);
    if (runtime.antenna >= 0) this.antennaMesh.setMatrixAt(runtime.antenna, this.matrix);
    if (runtime.beacon >= 0) this.beaconMesh.setMatrixAt(runtime.beacon, this.matrix);
    if (runtime.craneMast >= 0) {
      this.craneMastMesh.setMatrixAt(runtime.craneMast, this.matrix);
      this.craneArmMesh.setMatrixAt(runtime.craneArm, this.matrix);
    }
  }

  /** pace>0 时按回放节奏夹住升起时长（见 builtFractionAt）；live 或未回放时传 0。 */
  applyCursor(cursor: number, live: boolean, paceMsPerSec = 0): void {
    this.cursor = cursor;
    this.live = live;
    (this.layout.civics ?? []).forEach((civic, index) => { this.civicTarget[index] = live || cursor >= civic.unlockAt ? 1 : 0; });
    const context = this.layout.contextBuildings ?? [];
    if (this.contextTarget.length !== context.length) { this.contextTarget = new Float32Array(context.length).fill(1); this.contextProgress = new Float32Array(context.length).fill(1); }
    context.forEach((building, index) => { this.contextTarget[index] = live || cursor >= building.appearAt ? 1 : 0; });
    for (const runtime of this.runtimes) {
      runtime.target = builtFractionAt(runtime.building, cursor, live, paceMsPerSec);
      if (live && runtime.building.active) runtime.target = Math.max(runtime.target, runtime.building.builtFraction);
    }
  }

  /** 重建前的显示进度快照：applyModel 把它交给下一份 CityParts——回访的楼保持
   *  高度（不重演生长），新到的楼从 0 长入（分页/失效刷新的「逐步长全」）。 */
  displaySnapshot(): Map<string, number> {
    const out = new Map<string, number>();
    for (const [id, runtime] of this.runtimeById) out.set(id, runtime.display);
    return out;
  }

  /** display/civicProgress 直接对齐 target：模型重建后的第一步。重建时 display
   *  被初始化为「已完工」（closed 的 builtFraction=1，civic 全 1），回放中若任由
   *  动画循环追赶，整城会先闪满高、再被压回时间轴进度——数据加载不应改变城市
   *  已呈现的样子。 */
  snapToTargets(): void {
    this.contextProgress.set(this.contextTarget);
    this.writeContext();
    for (const runtime of this.runtimes) {
      if (!runtime.settled) continue; // 新楼交给 update 循环长入
      runtime.display = runtime.target;
      this.applyConstruction(runtime, true);
    }
    for (let index = 0; index < this.civicTarget.length; index += 1) {
      if (this.civicProgress[index] !== this.civicTarget[index]) {
        this.civicProgress[index] = this.civicTarget[index];
        this.writeCivic(index);
      }
    }
    for (const mesh of this.shaftMeshes) mesh.instanceMatrix.needsUpdate = true;
    this.podiumMesh.instanceMatrix.needsUpdate = true;
    this.decoCornerMesh.instanceMatrix.needsUpdate = true;
    this.decoTrimMesh.instanceMatrix.needsUpdate = true;
    for (const mesh of this.roofProfiles) mesh.instanceMatrix.needsUpdate = true;
    this.gardenTreeMesh.instanceMatrix.needsUpdate = true;
    this.roofMesh.instanceMatrix.needsUpdate = true;
    this.neonMesh.instanceMatrix.needsUpdate = true;
    this.scaffoldMesh.instanceMatrix.needsUpdate = true;
    this.antennaMesh.instanceMatrix.needsUpdate = true;
    this.craneMastMesh.instanceMatrix.needsUpdate = true;
  }

  setQualityLevel(level: QualityLevel): void {
    this.cloudMesh.visible = level >= 1;
    this.carKeep = level >= 1 ? 1 : 0.5;
    this.applyCarDensity();
  }

  /** 低画质只开一半车：多出来的车缩成 0（藏起），速度从「原速」取回。
   *  曾直接把 speed 写成 0 且不留原速：掉到 Q0 一次，那一半车整场会话都冻在原地（升档也不恢复），
   *  冻结时的矩阵还取决于掉档那一刻——同一座城两次导出的车位置不同。 */
  private applyCarDensity(): void {
    const visibleCars = Math.floor(this.cars.length * this.carKeep);
    this.cars.forEach((car, index) => {
      const speed = baseSpeedOf(car);
      car.speed = index < visibleCars ? speed : 0;
      this.placeCar(car, index, index < visibleCars);
    });
    this.carMesh.instanceMatrix.needsUpdate = true;
  }

  private placeCar(car: Car, index: number, visible: boolean): void {
    if (!visible) {
      this.compose(0, -40, 0, 0, 0, 0, 0);
    } else {
      const sample = samplePolyline(car.path, car.distance);
      const y = car.path.terrain ? car.path.terrain.height(sample.x, sample.z) + car.path.y : car.path.y;
      this.compose(sample.x - sample.dz * 1.2, y + 0.04, sample.z + sample.dx * 1.2, Math.atan2(-sample.dz, sample.dx), 1, 1, 1);
    }
    this.carMesh.setMatrixAt(index, this.matrix);
  }

  /** 航拍时隐藏「计划高度」脚手架壳：低机位下它是悬在天上的半透明大方块。 */
  setScaffoldVisible(visible: boolean): void {
    this.scaffoldMesh.visible = visible;
  }

  /** 拍照用：暂时藏起标签与悬停/选中环（不改 labelsVisible 偏好），返回恢复函数。 */
  hideOverlaysForPhoto(): () => void {
    const labels = this.labels.map((label) => label.visible);
    const rings = [this.hoverRing.visible, this.selectRing.visible];
    const scaffold = this.scaffoldMesh.visible;
    // 「计划高度」脚手架壳在照片里读作悬空的半透明方块（航拍/导出也藏它）。
    this.scaffoldMesh.visible = false;
    for (const label of this.labels) label.visible = false;
    this.hoverRing.visible = false;
    this.selectRing.visible = false;
    return () => {
      this.labels.forEach((label, index) => { label.visible = labels[index]; });
      this.hoverRing.visible = rings[0];
      this.selectRing.visible = rings[1];
      this.scaffoldMesh.visible = scaffold;
    };
  }

  setLabelsVisible(visible: boolean): void {
    this.labelsVisible = visible;
    for (const label of this.labels) label.visible = visible;
  }

  private decorTargetsCache: THREE.Object3D[] | null = null;

  /** 非会话建筑的拾取目标（酒店、地标、配套、市政设施、背景楼、聚合楼群、海滨装饰、火山）：
   *  首次使用时沿场景树按网格名收集一次；它们曾不在拾取范围内，点了毫无反应。 */
  get decorTargets(): THREE.Object3D[] {
    if (this.decorTargetsCache) return this.decorTargetsCache;
    const out: THREE.Object3D[] = [];
    this.group.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh || !object.visible) return;
      for (let node: THREE.Object3D | null = object; node; node = node.parent) {
        if (decorKindForName(node.name)) { out.push(object); return; }
      }
    });
    this.decorTargetsCache = out;
    return out;
  }

  /** 命中的非会话网格 → `decor:<kind>[:<detail>]`；配套按实例反查学校/商场/医院。 */
  decorAt(mesh: THREE.Object3D, instanceId: number | undefined): string | null {
    for (let node: THREE.Object3D | null = mesh; node; node = node.parent) {
      const kind = decorKindForName(node.name);
      if (!kind) continue;
      if (kind === "civic" && instanceId !== undefined) {
        const meshIndex = this.civicMeshes.indexOf(mesh as THREE.InstancedMesh);
        const piece = this.civicPieces.find((item) => item.mesh === meshIndex && item.index === instanceId);
        const civic = piece ? (this.layout.civics ?? [])[piece.civic] : undefined;
        return civic ? `decor:civic:${civic.kind}` : "decor:civic";
      }
      return `decor:${kind}`;
    }
    return null;
  }

  idAt(mesh: THREE.Object3D, instanceId: number): string | null {
    const index = this.shaftMeshes.indexOf(mesh as THREE.InstancedMesh);
    if (index < 0) return null;
    return this.shaftIdByInstance[index].get(instanceId) ?? null;
  }

  /** 所有楼的锚点（航拍挑主角用）：只读快照，不暴露 runtime。 */
  anchors(): Map<string, { x: number; z: number; height: number; ground: number }> {
    const out = new Map<string, { x: number; z: number; height: number; ground: number }>();
    for (const [id, runtime] of this.runtimeById) out.set(id, { x: runtime.slot.x, z: runtime.slot.z, height: runtime.building.height, ground: runtime.groundY });
    return out;
  }

  /** 云层材质（昼夜循环驱动透明度）。 */
  get cloudMaterial(): (THREE.Material & { opacity: number }) | null {
    return this.cloudMesh ? (this.cloudMesh.material as THREE.Material & { opacity: number }) : null;
  }

  /** 水色 uniform（昼夜循环驱动深浅两色）。 */
  get waterColors(): { uShallow: { value: THREE.Color }; uDeep: { value: THREE.Color }; uSky: { value: THREE.Color } } | null {
    return this.water ? ((this.water.material as THREE.ShaderMaterial).uniforms as unknown as { uShallow: { value: THREE.Color }; uDeep: { value: THREE.Color }; uSky: { value: THREE.Color } }) : null;
  }

  /** 夜晚城市亮窗：抬升立面自发光，保留 theme 基线下限（白天≈基线不变）。
   *  theme 切换会重设 uSelfLit 基线，下一次昼夜 tick 会在其上再抬升。 */
  private nightGlow = 0;
  private lifeguardGlowMaterial: THREE.MeshBasicMaterial | null = null;
  landmarkWindows: Array<{ material: THREE.MeshLambertMaterial; day: THREE.Texture; lit: THREE.Texture; dayEmissive: THREE.Color }> = [];
  private signageNeonMaterial: THREE.MeshBasicMaterial | null = null;
  private yachtMesh: THREE.InstancedMesh | null = null;
  private yachtIndices: number[] = [];

  setNightGlow(selfLit: number): void {
    this.nightGlow = selfLit;
    // 电灯用自己的「夜」量：DAY 档 selfLit = 0.05（立面的白天余光），直接拿来点灯会让正午的光斑/霓虹
    // 越过 0.03/0.04 的开灯阈值、灯头也带着亮度（审计实测正午灯全开）。≤0.1 一律算白天 = 0。
    const night = Math.max(0, (selfLit - 0.1) / 0.9);
    const beamMaterial = this.heroParts?.beam?.material as THREE.MeshBasicMaterial | undefined;
    if (beamMaterial) {
      beamMaterial.visible = night > 0.05;
      beamMaterial.opacity = 0.22 * Math.min(1, night * 1.5);
    }
    const lights = this.nightLights;
    if (lights) {
      // 电灯白天完全熄灭（0），随 night 线性亮起：此前留的 0.12/0.1「白天底线」
      // 在 4600 盏灯的规模下肉眼可见，读作「灯没关」；灯杆由 Lambert 灰呈现，
      // 灯头不需要白天亮度。
      lights.heads.color.setRGB(1, 0.78, 0.45).multiplyScalar(night * 3.2);
      lights.pools.color.setRGB(1, 0.62, 0.3).multiplyScalar(night * 0.9);
      lights.pools.visible = night > 0.03;
      lights.strips.color.setRGB(1, 0.7, 0.4).multiplyScalar(night * 2.4);
      // 霓虹/边缘光：实例色决定色相（青/洋红/暖白），这里只管亮度；白天熄灭。
      lights.neon.color.setRGB(1, 1, 1).multiplyScalar(night * 2.6);
      // 白天整体关掉：近黑的实例色在日光下读作一块块深色方块（桥塔上的霓虹点实测）。
      lights.neon.visible = night > 0.04;
    }
    // 地标玻璃幕墙：夜里换亮窗贴图并加亮，白天回到立面贴图 + 少量托底自发光。
    for (const entry of this.landmarkWindows) {
      const lit = night > 0.05;
      if (lit) { entry.material.emissiveMap = entry.lit; entry.material.emissive.setRGB(1, 1, 1).multiplyScalar(0.25 + night * 1.6); }
      else { entry.material.emissiveMap = entry.day; entry.material.emissive.copy(entry.dayEmissive); }
    }
    // 救生塔夜间指示灯（VICE S1）：独立 MeshBasic，不依赖路灯照亮。
    if (this.lifeguardGlowMaterial) {
      const parent = this.lifeguardGlowMaterial.opacity !== undefined;
      this.lifeguardGlowMaterial.transparent = true;
      this.lifeguardGlowMaterial.opacity = night;
      // 通过材质找到 mesh 并切可见性。
      this.group.traverse((child) => {
        if (child instanceof THREE.InstancedMesh && child.material === this.lifeguardGlowMaterial) {
          child.visible = night > 0.05;
        }
      });
    }
    // 酒店招牌霓虹（VICE S2）：白天完全熄灭，夜间亮起。
    if (this.signageNeonMaterial) {
      this.group.traverse((child) => {
        if (child instanceof THREE.InstancedMesh && child.material === this.signageNeonMaterial) {
          child.visible = night > 0.05;
        }
      });
    }
  }

  /** theme 基线 + 夜晚抬升的合成值（theme 切换后由昼夜 tick 重新应用）。 */
  applySelfLit(themeBase: number): void {
    for (const uniforms of this.facadeUniforms) {
      // 夜里不再抬升墙面自发光（只点亮窗格，见 uWindowGlow）；墙面保持主题基线。
      uniforms.uSelfLit.value = themeBase;
      uniforms.uWindowGlow.value = this.nightGlow;
    }
  }

  anchorFor(id: string): { x: number; z: number; height: number; ground: number } | null {
    const runtime = this.runtimeById.get(id);
    if (!runtime) return null;
    return { x: runtime.slot.x, z: runtime.slot.z, height: runtime.building.height, ground: runtime.groundY };
  }

  setHovered(id: string | null): void {
    this.hoveredId = id;
    const anchor = id ? this.anchorFor(id) : null;
    if (!anchor) {
      this.hoverRing.visible = false;
      return;
    }
    const runtime = id ? this.runtimeById.get(id) : null;
    const ringRadius = runtime ? runtime.building.footprint * 1.5 : 3;
    this.hoverRing.scale.set(ringRadius, 1, ringRadius);
    this.hoverRing.position.set(anchor.x, anchor.ground + 0.18, anchor.z);
    this.hoverRing.visible = true;
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    const anchor = id ? this.anchorFor(id) : null;
    if (!anchor) {
      this.selectRing.visible = false;
      return;
    }
    const runtime = id ? this.runtimeById.get(id) : null;
    const ringRadius = runtime ? runtime.building.footprint * 1.7 : 3.4;
    this.selectRing.scale.set(ringRadius, 1, ringRadius);
    this.selectRing.position.set(anchor.x, anchor.ground + 0.2, anchor.z);
    this.selectRing.visible = true;
  }

  /** 每帧增量更新。返回是否有矩阵写入（供引擎决定是否强制重绘）。 */
  update(dt: number, elapsed: number): boolean {
    this.waterUniforms.uTime.value = elapsed;
    if (this.flagTime) this.flagTime.value = elapsed;
    this.updateCivics(dt);
    this.updateContext(dt);
    for (const spinner of this.landmarkSpinners) spinner.object.rotation[spinner.axis] += spinner.speed * dt;

    let dirty = false;
    const rate = Math.min(1, dt * 1.35);
    for (const runtime of this.runtimes) {
      if (Math.abs(runtime.display - runtime.target) > 0.0012) {
        runtime.display += (runtime.target - runtime.display) * rate;
        this.applyConstruction(runtime, false);
        dirty = true;
      } else if (runtime.display !== runtime.target) {
        runtime.display = runtime.target;
        runtime.settled = true;
        this.applyConstruction(runtime, false);
        dirty = true;
      }
    }
    if (dirty || Number.isNaN(this.cursor)) {
      for (const mesh of this.shaftMeshes) mesh.instanceMatrix.needsUpdate = true;
      this.podiumMesh.instanceMatrix.needsUpdate = true;
      this.decoCornerMesh.instanceMatrix.needsUpdate = true;
      this.decoTrimMesh.instanceMatrix.needsUpdate = true;
      for (const mesh of this.roofProfiles) mesh.instanceMatrix.needsUpdate = true;
      this.gardenTreeMesh.instanceMatrix.needsUpdate = true;
      this.roofMesh.instanceMatrix.needsUpdate = true;
      this.neonMesh.instanceMatrix.needsUpdate = true;
      this.scaffoldMesh.instanceMatrix.needsUpdate = true;
      this.antennaMesh.instanceMatrix.needsUpdate = true;
      this.craneMastMesh.instanceMatrix.needsUpdate = true;
    }

    // 吊车臂：活跃楼的节奏 = 繁忙度。
    for (const runtime of this.runtimes) {
      if (runtime.craneArm < 0 || runtime.display <= 0.002 || (runtime.craneX === 0 && runtime.craneZ === 0)) continue;
      const spin = (0.25 + runtime.building.busyness * 0.85) * dt;
      runtime.cranePhase += spin;
      const mastHeight = runtime.building.height * 1.02 + 6.5;
      // 曾在此处重算旧公式（x + fp*0.72，无 yaw/楼宽），把 applyConstruction 里修正的立柱位置
      // 每帧覆盖回去：吊臂绕着错误的点转，与立柱脱节。
      const cornerX = runtime.craneX;
      const cornerZ = runtime.craneZ;
      this.applyCraneArm(runtime, cornerX, cornerZ, runtime.groundY, mastHeight, 0);
      this.craneArmMesh.instanceMatrix.needsUpdate = true;
      // 吊车顶警示灯。
      if (runtime.beacon >= 0) {
        const blink = 0.55 + 0.45 * Math.sin(elapsed * 2.4 + runtime.blinkPhase);
        this.compose(cornerX, runtime.groundY + mastHeight + 0.3, cornerZ, 0, blink, blink, blink);
        this.beaconMesh.setMatrixAt(runtime.beacon, this.matrix);
        this.beaconMesh.instanceMatrix.needsUpdate = true;
      }
    }

    // 车辆。
    let carsMoved = false;
    this.cars.forEach((car, index) => {
      if (car.speed === 0) return;
      car.distance += car.speed * dt;
      this.placeCar(car, index, true);
      carsMoved = true;
    });
    if (carsMoved) this.carMesh.instanceMatrix.needsUpdate = true;

    // 船只（沿海岸航道折线推进 + 起伏）+ 尾迹泡沫在船尾持续吐出。
    let wakeCursor = 0;
    this.boats.forEach((boat, index) => {
      boat.distance += boat.speed * dt;
      const sample = samplePolyline(boat.path, boat.distance);
      const bob = Math.sin(elapsed * 0.9 + boat.phase) * 0.12;
      this.compose(sample.x, -0.3 + bob, sample.z, Math.atan2(-sample.dz, sample.dx), 1, 1, 1);
      this.boatMesh.setMatrixAt(index, this.matrix);
      boat.wakeTimer -= dt;
      if (boat.wakeTimer <= 0) {
        boat.wakeTimer = 0.3 + 0.08 * Math.sin(elapsed * 1.7 + boat.phase);
        const puff = this.wakes[wakeCursor];
        wakeCursor = (wakeCursor + 1) % this.wakes.length;
        const side = Math.sin(elapsed * 5.3 + boat.phase + index);
        puff.x = sample.x - sample.dx * 6.4 - sample.dz * side * 1.6;
        puff.z = sample.z - sample.dz * 6.4 + sample.dx * side * 1.6;
        puff.birth = elapsed;
        puff.driftX = -sample.dx * 0.5 - sample.dz * side * 0.35;
        puff.driftZ = -sample.dz * 0.5 + sample.dx * side * 0.35;
      }
    });
    this.boatMesh.instanceMatrix.needsUpdate = true;
    // 飞桥游艇（VICE S3）：在对应船位渲染游艇（隐藏原船实例色→改为游艇色）。
    if (this.yachtMesh && this.yachtIndices.length) {
      for (let y = 0; y < this.yachtIndices.length; y += 1) {
        const boat = this.boats[this.yachtIndices[y]];
        if (!boat) continue;
        const sample = samplePolyline(boat.path, boat.distance);
        const bob = Math.sin(elapsed * 0.9 + boat.phase) * 0.12;
        this.compose(sample.x, -0.3 + bob, sample.z, Math.atan2(-sample.dz, sample.dx), 1, 1, 1);
        this.yachtMesh.setMatrixAt(y, this.matrix);
      }
      this.yachtMesh.instanceMatrix.needsUpdate = true;
    }
    // 尾迹推进：放大 + 漂移，寿命 2.8s 后藏起。
    let wakesMoved = false;
    for (let index = 0; index < this.wakes.length; index += 1) {
      const puff = this.wakes[index];
      if (puff.birth < 0) continue;
      const age = elapsed - puff.birth;
      if (age > 2.8) {
        puff.birth = -1;
        this.compose(0, -60, 0, 0, 0.0001, 0.0001, 0.0001);
      } else {
        puff.x += puff.driftX * dt;
        puff.z += puff.driftZ * dt;
        this.compose(puff.x, -0.44, puff.z, age * 0.5, 1.1 + age * 2.3, 1, 1.1 + age * 2.3);
      }
      this.wakeMesh.setMatrixAt(index, this.matrix);
      wakesMoved = true;
    }
    if (wakesMoved) this.wakeMesh.instanceMatrix.needsUpdate = true;

    // 云。
    const bounds = this.layout.boundsRadius + 60;
    this.clouds.forEach((cloud, index) => {
      cloud.x += cloud.speed * dt;
      if (cloud.x > bounds) cloud.x = -bounds;
      const blob = 9.5 * cloud.scale;
      this.compose(cloud.x, cloud.y, cloud.z, 0, blob * 1.6, blob * 0.34, blob * 0.8);
      this.cloudMesh.setMatrixAt(index, this.matrix);
    });
    if (this.cloudMesh.visible) this.cloudMesh.instanceMatrix.needsUpdate = true;

    // 异常信标。
    for (const marker of this.anomalyMarkers) {
      marker.mesh.position.y = marker.baseY + Math.sin(elapsed * 1.4 + marker.phase) * 0.6;
      marker.mesh.rotation.y = elapsed * 0.9 + marker.phase;
      marker.mesh.rotation.x = Math.sin(elapsed * 0.7 + marker.phase) * 0.18;
      const pulse = 0.86 + 0.14 * Math.sin(elapsed * 2.6 + marker.phase);
      marker.ring.scale.set(pulse, 1, pulse);
      (marker.ring.material as THREE.MeshBasicMaterial).opacity = 0.32 + 0.3 * (0.5 + 0.5 * Math.sin(elapsed * 2.6 + marker.phase));
    }

    // 悬停/选中环呼吸（透明度脉动，不改 scale——scale 由选中目标决定）。
    const ringPulse = 0.55 + 0.3 * (0.5 + 0.5 * Math.sin(elapsed * 3.2));
    if (this.hoverRing.visible) (this.hoverRing.material as THREE.MeshBasicMaterial).opacity = ringPulse;
    if (this.selectRing.visible) (this.selectRing.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.3 * (0.5 + 0.5 * Math.sin(elapsed * 2.4));

    return dirty || carsMoved;
  }

  private captureAnimationOrigin(): void {
    for (const car of this.cars) { originOf(car, car.distance); baseSpeedOf(car); }
    for (const boat of this.boats) originOf(boat, boat.distance);
    for (const cloud of this.clouds) originOf(cloud, cloud.x);
    for (const spinner of this.landmarkSpinners) originOf(spinner, spinner.object.rotation[spinner.axis]);
  }

  /** 把所有随帧累加的动画状态放回起点，楼与配套直接落到目标进度（不再有生长插值）。
   *  胶片导出开拍前调用：同一份数据 + seed，任何时候导出都从同一个状态开始。 */
  resetAnimation(): void {
    this.contextProgress.set(this.contextTarget);
    this.writeContext();
    for (const car of this.cars) car.distance = originOf(car, car.distance);
    this.applyCarDensity();
    for (const boat of this.boats) boat.distance = originOf(boat, boat.distance);
    for (const cloud of this.clouds) cloud.x = originOf(cloud, cloud.x);
    for (const spinner of this.landmarkSpinners) spinner.object.rotation[spinner.axis] = originOf(spinner, spinner.object.rotation[spinner.axis]);
    // 每栋都重写一遍实例矩阵（不只是进度变了的）：吊臂角度、信标闪烁等姿态只在楼可见时逐帧写，
    // 楼一旦藏起就停在上一部片子留下的样子——只按进度判脏会漏掉它们。
    for (const runtime of this.runtimes) {
      runtime.cranePhase = runtime.building.seed * Math.PI * 2;
      runtime.display = runtime.target;
      runtime.settled = true;
      this.applyConstruction(runtime, false);
    }
    for (const mesh of [...this.shaftMeshes, ...this.roofProfiles, this.podiumMesh, this.decoCornerMesh, this.decoTrimMesh, this.gardenTreeMesh, this.roofMesh, this.neonMesh, this.scaffoldMesh, this.antennaMesh, this.craneMastMesh, this.craneArmMesh, this.beaconMesh]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (let index = 0; index < this.civicTarget.length; index += 1) {
      if (this.civicProgress[index] === this.civicTarget[index]) continue;
      this.civicProgress[index] = this.civicTarget[index];
      this.writeCivic(index);
    }
  }

  districtAnchor(districtId: string): { x: number; z: number; y: number; radius: number } | null {
    const district = this.layout.districts.find((item) => item.id === districtId);
    return district ? { x: district.center.x, z: district.center.z, y: district.plaza.y, radius: district.radius } : null;
  }

  dispose(): void {
    // 只拆动态层：静态城（地形/基建/车船云）留在模块级缓存，同一 seed 的下一次
    // 重建直接复用；换 seed 时由构造函数统一释放旧缓存。
    this.group.removeFromParent();
    if (staticCityCache && staticCityCache.seed === this.layout.seed) {
      this.group.remove(staticCityCache.group);
    }
    for (const disposable of this.disposables) disposable.dispose();
  }
}

/** 简易几何合并（部件都是 position/normal/uv 布局，不值得引 utils）。 */
function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
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
