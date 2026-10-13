/**
 * 路面网格（渲染层；路网数据零改动）：沥青与路面标线从地面贴图里搬出来，画成贴地的独立网格。
 * 规格：docs/CITY_ROAD_SURFACE_RENDER_SPEC.md。
 *
 * 为什么不是「把地面贴图开大」：全城一张 2048² 图集铺 1600 单位，≈1.3 px/单位——5 宽的支路只有 6 个像素，
 * 0.22 宽的中线是 0.3 个像素。地面细节 shader 再按图集颜色「猜」哪里是沥青，阈值把双线性插值的模糊边
 * 硬化成一格一格的台阶（真机近景：路边锯齿、标线成团）。4096 图集 64 MiB、WebView 峰值 2.6 GB 已经否过。
 * 路面的边界与标线都是几何量（中线、路宽、停止线距离），在片元里按世界坐标解析计算，任何缩放都锐利，
 * 显存只多两个贴地网格（档 2 ≈ 1.6 MB、档 10 ≈ 8 MB；对比 2048² 图集本身 16 MB）。
 *
 * 构成：
 *  - 路段带（roadPaintPlan 的 run）：只在地形不平处自适应细分，顶点高度取渲染地形三角面（terrainSurfaceHeight），
 *    UV = (弧长 u, 横向 v)；标线在 shader 里由 (u, v) + 每端退让量算出。
 *  - 路口填充（圆角 / 路口中心圆盘 / 换宽圆盘 / 渐变梯形）：与地面贴图同一份几何（cityRoadJunctions），不画标线。
 *  - 人行道带（路宽 + 2.4，同贴图口径）与转角同心弧：人行道与草地 / 街区的分界也是几何边，不再是图集台阶。
 *  - 宽度分层：五个材质组（人行道 / 路口填充 / 宽 ≤5 / ≤8 / 更宽，分属 base 与带子两个 mesh），polygonOffset 逐层加大——宽路盖窄路，
 *    「主路直穿、小路收口」不用逐口裁剪；同层重叠只发生在同色、无标线的路口内部。
 */

import * as THREE from "three";
import type { CityLayout, RoadEdge, Vec2 } from "../cityLayout";
import { roadPaintPlan } from "../cityRoadPaint";
import { cornerArc, junctionIndex, renderRoadEdges, roadJunctionPlan, STRAIGHT_GAP, taperOutline, type JunctionArm, type RoadJunction } from "../cityRoadJunctions";
import { LIGHT_BUDGET } from "../cityLightBudget";
import { terrainSurfaceHeight } from "./terrainSystem";

export interface RoadSurfaceHost {
  readonly layout: CityLayout;
  readonly group: THREE.Group;
  readonly disposables: Array<{ dispose: () => void }>;
  /** 与地形共用同一批 uniform 对象：沥青照片细节、夜间压暗、窗光外溢随地形一起更新。 */
  readonly terrainUniforms: Record<string, { value: unknown }> | null;
}

/** 路面抬升（防 z-fighting 的同时低于路缘盒基面 0.02 + 盒高）；层间再靠 polygonOffset 分开。 */
export const ROAD_SURFACE_LIFT = 0.04;
const ALONG_STEP = 3;
/** 填充圆弧每段 ≤ 20°（路缘实体仍按 12°）：填充是平贴地面的色块，弦高差肉眼不可辨，顶点省四成。 */
const FILL_ARC_STEP = Math.PI / 9;
const ACROSS_STEP = 4;

/** 宽度 → 层（0 = 人行道，1 = 路口填充，2–4 = 支路 / 次干 / 主干）。 */
export function roadLayerOf(width: number): 2 | 3 | 4 {
  return width <= 5 ? 2 : width <= 8 ? 3 : 4;
}
/** 人行道带宽（每侧），与地面贴图的「路宽 + 2.4」一致。 */
const SIDEWALK = 1.2;
const SIDEWALK_COLOR = "#d4cfc2";
/** aRoadRun.w：0 = 路段带（画标线），1 = 沥青填充，2 = 人行道。 */
const PIECE_RIBBON = 0; const PIECE_FILL = 1; const PIECE_SIDEWALK = 2;
/** 宽度 → 标线方案：0 支路（虚中线）、1 次干（黄虚中线 + 白边线）、2 主干（双黄实线 + 白车道虚线 + 白边线）。 */
export function roadMarkingKindOf(width: number): 0 | 1 | 2 {
  return width < 8 ? 0 : width < 12 ? 1 : 2;
}
const asphaltOf = (kind: RoadEdge["kind"]) => (kind === "arterial" ? "#505b60" : "#646c6b");

/** run 一端的标线参数（距该端的弧长）。center/left/right = 中线、+v 侧边线、−v 侧边线从该端退多远开始画；
 *  stop / zebra = 停止线 / 斑马线中心距该端（−1 = 不画）。 */
export type RunEnd = { center: number; left: number; right: number; stop: number; zebra: number };
const OPEN_END: RunEnd = { center: 0, left: 0, right: 0, stop: -1, zebra: -1 };
/** 斑马线沿路长 2.5（中心 ±1.25）。 */
export const ZEBRA_HALF = 1.25;

/** 路口口门距离：本臂整幅要走多远才离开其它臂的路面（与次路停止线同一公式，|sin| < 0.2 的近平行臂不构成口门）。 */
function mouthOf(junction: RoadJunction, arm: JunctionArm): number {
  let mouth = 0;
  for (const other of junction.arms) {
    if (other === arm) continue;
    const sin = Math.abs(arm.dir.x * other.dir.z - arm.dir.z * other.dir.x);
    const cos = Math.abs(arm.dir.x * other.dir.x + arm.dir.z * other.dir.z);
    if (sin >= 0.2) mouth = Math.max(mouth, (other.half + arm.half * cos) / sin);
  }
  return mouth;
}

/** run 在某端的标线参数。atStart：该端是 run 的起点（+v 侧 = 臂的逆时针侧）还是终点（+v 侧 = 顺时针侧）。
 *  非路口端（度 2 续接 / 尽端）不退让。桥面 / 滨水臂沿用旧贴图的 6 / 6.5。 */
export function runEndMarkings(index: ReturnType<typeof junctionIndex>, junctionNodes: ReadonlySet<string>, edge: RoadEdge, node: string, atStart: boolean): RunEnd {
  if (!junctionNodes.has(node)) return OPEN_END;
  const junction = index.byNode.get(node);
  const arm = index.armOf(edge, node);
  if (!junction || !arm || arm.legacy) return { center: 6, left: 6, right: 6, stop: -1, zebra: arm && arm.length >= 14 ? 6.5 : -1 };
  const mouth = mouthOf(junction, arm);
  // 一侧有圆角：边线退到切点（路缘圆弧从这里开始）；没有圆角但不是直行侧：退到口门；直行侧：贯通。
  const side = (trim: number | null, gap: number) => trim ?? (gap < STRAIGHT_GAP ? mouth : 0);
  const ccw = side(arm.ccwTrim, arm.ccwGap); const cw = side(arm.cwTrim, arm.cwGap);
  const stop = arm.stopAt ?? -1;
  // 斑马线：次路在停止线之后，其余在口门外；臂太短（< 14，或斑马线越过 45% 臂长）不画——同旧贴图的「< 14 不画」。
  let zebra = stop > 0 ? stop + 0.25 + 0.4 + ZEBRA_HALF : mouth + 0.5 + ZEBRA_HALF;
  if (arm.length < 14 || zebra + ZEBRA_HALF > 0.45 * arm.length) zebra = -1;
  // 中线：主路直穿（0，斑马线带内由 shader 让开）；其余退到斑马线 / 停止线 / 口门之后。
  const center = arm.role === "major" ? 0 : zebra > 0 ? zebra + ZEBRA_HALF + 0.5 : stop > 0 ? stop + 0.6 : mouth + 0.5;
  return atStart ? { center, left: ccw, right: cw, stop, zebra } : { center, left: cw, right: ccw, stop, zebra };
}

type Builder = { positions: number[]; normals: number[]; colors: number[]; uv: number[]; run: number[]; ends: number[]; edges: number[]; zebra: number[]; index: number[]; count: number };
const newBuilder = (): Builder => ({ positions: [], normals: [], colors: [], uv: [], run: [], ends: [], edges: [], zebra: [], index: [], count: 0 });
/** 三角形一律朝上（俯视逆时针）：带子与扇面的点序各有方向，靠约定很容易整片绕反、被背面剔除
 *  （第一版就是整张路面网格不可见）。按法向 y 分量现场定序；退化三角形丢弃。 */
function pushUpTriangle(b: Builder, i: number, j: number, k: number): void {
  const P = b.positions;
  const ax = P[j * 3] - P[i * 3]; const az = P[j * 3 + 2] - P[i * 3 + 2];
  const bx = P[k * 3] - P[i * 3]; const bz = P[k * 3 + 2] - P[i * 3 + 2];
  const ny = az * bx - ax * bz;
  if (Math.abs(ny) < 1e-9) return;
  if (ny > 0) b.index.push(i, j, k); else b.index.push(i, k, j);
}

/** 路面几何（纯数据，不建 THREE 对象）：按层返回各自的顶点 / 属性，供 buildRoadSurface 与守卫共用。 */
export function roadSurfaceGeometry(layout: Pick<CityLayout, "roadEdges" | "extent" | "terrain">) {
  const roadEdges = renderRoadEdges(layout.roadEdges); // 窄短桩按接续宽路画（cityRoadJunctions.renderRoadEdges）
  const { runs, junctions } = roadPaintPlan(roadEdges);
  const plan = roadJunctionPlan(roadEdges);
  const index = junctionIndex(plan);
  const layers = [newBuilder(), newBuilder(), newBuilder(), newBuilder(), newBuilder()];
  const color = new THREE.Color();
  const heightAt = (x: number, z: number) => terrainSurfaceHeight(layout, x, z) + ROAD_SURFACE_LIFT;
  /** 中点处渲染地形高度等于两端线性插值（容差 0.02 = 抬升量的一半，最坏也不钻到地下）= 这一截下面的地形当平面，不再切。 */
  const PLANAR_TOLERANCE = ROAD_SURFACE_LIFT / 2;
  const planarMid = (p: Vec2, q: Vec2, mid: Vec2) => Math.abs(heightAt(mid.x, mid.z) - (heightAt(p.x, p.z) + heightAt(q.x, q.z)) / 2) <= PLANAR_TOLERANCE;
  /** 法线取地形真值梯度（中心差分 1）：同一位置的重叠顶点法线一致，层间不因光照差闪烁。 */
  const normalAt = (x: number, z: number) => {
    const gx = (layout.terrain.height(x + 1, z) - layout.terrain.height(x - 1, z)) / 2;
    const gz = (layout.terrain.height(x, z + 1) - layout.terrain.height(x, z - 1)) / 2;
    const length = Math.hypot(gx, 1, gz);
    return [-gx / length, 1 / length, -gz / length];
  };
  const vertex = (b: Builder, x: number, z: number, attrs: { u: number; v: number; run: number[]; ends: number[]; edges: number[]; zebra: number[]; color: THREE.Color }) => {
    b.positions.push(x, heightAt(x, z), z); b.normals.push(...normalAt(x, z));
    b.colors.push(attrs.color.r, attrs.color.g, attrs.color.b);
    b.uv.push(attrs.u, attrs.v); b.run.push(...attrs.run); b.ends.push(...attrs.ends); b.edges.push(...attrs.edges); b.zebra.push(...attrs.zebra);
    return b.count++;
  };

  /** 沿线采样的带子：地形不平处二分细分（最短 1.5）、横截面不平时横向 ≤ ACROSS_STEP；折点用两侧方向的角平分线 + 斜接系数（上限 2，锐折不炸尖）。 */
  const ribbon = (points: Vec2[], lengths: number[], width: number, b: Builder, attrsBase: { run: number[]; ends: number[]; edges: number[]; zebra: number[]; color: THREE.Color }) => {
    const half = width / 2;
    const samples: Array<{ x: number; z: number; u: number; nx: number; nz: number; miter: number }> = [];
    const dirOf = (i: number) => {
      const a = points[i]; const c = points[i + 1]; const len = Math.hypot(c.x - a.x, c.z - a.z) || 1;
      return { x: (c.x - a.x) / len, z: (c.z - a.z) / len };
    };
    for (let i = 0; i < points.length - 1; i += 1) {
      const d = dirOf(i);
      const a = points[i]; const c = points[i + 1];
      const segment = lengths[i + 1] - lengths[i];
      const at = (t: number, v: number) => ({ x: a.x + (c.x - a.x) * t - d.z * v, z: a.z + (c.z - a.z) * t + d.x * v });
      // 自适应细分：只有渲染地形在这一截下面不是一个平面时才切——岛内低平原整片是平的，
      // 均匀 3 单位一切的第一版在档 2 城里堆出 ~20 万顶点（≈ 20 MB 顶点属性），绝大多数切在平地上。
      const ts = [0];
      const split = (t0: number, t1: number, depth: number) => {
        const tm = (t0 + t1) / 2;
        const bent = depth < 7 && (t1 - t0) * segment > 1.5 && [-half, 0, half].some((v) => !planarMid(at(t0, v), at(t1, v), at(tm, v)));
        if (bent) { split(t0, tm, depth + 1); split(tm, t1, depth + 1); } else ts.push(t1);
      };
      split(0, 1, 0);
      for (let k = i === 0 ? 0 : 1; k < ts.length; k += 1) {
        const t = ts[k];
        let nx = -d.z; let nz = d.x; let miter = 1;
        if (k === ts.length - 1 && i + 1 < points.length - 1) {
          const e = dirOf(i + 1);
          const mx = -(d.z + e.z); const mz = d.x + e.x; const ml = Math.hypot(mx, mz);
          if (ml > 1e-6) { nx = mx / ml; nz = mz / ml; miter = Math.min(2, 1 / Math.max(0.5, nx * -d.z + nz * d.x)); }
        }
        samples.push({ x: a.x + (c.x - a.x) * t, z: a.z + (c.z - a.z) * t, u: lengths[i] + segment * t, nx, nz, miter });
      }
    }
    // 横向：整条带子横截面都是平面（两边与中线共线）就不切，否则按 ≤ ACROSS_STEP 切。
    const flatAcross = samples.every((p) => planarMid({ x: p.x - p.nx * half * p.miter, z: p.z - p.nz * half * p.miter }, { x: p.x + p.nx * half * p.miter, z: p.z + p.nz * half * p.miter }, p));
    const across = flatAcross ? 1 : Math.max(1, Math.ceil(width / ACROSS_STEP));
    const rows = samples.map((sample) => Array.from({ length: across + 1 }, (_, j) => {
      const v = -half + (width * j) / across;
      return vertex(b, sample.x + sample.nx * v * sample.miter, sample.z + sample.nz * v * sample.miter, { ...attrsBase, u: sample.u, v });
    }));
    for (let r = 1; r < rows.length; r += 1) for (let j = 0; j < across; j += 1) {
      const a = rows[r - 1][j]; const c = rows[r - 1][j + 1]; const d = rows[r][j]; const e = rows[r][j + 1];
      pushUpTriangle(b, a, d, c); pushUpTriangle(b, c, d, e);
    }
  };

  // ── 路段带 ──
  for (const run of runs) {
    const points = run.points;
    if (points.length < 2) continue;
    const lengths = [0];
    for (let i = 1; i < points.length; i += 1) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
    const total = lengths[lengths.length - 1];
    if (total < 1e-3) continue;
    const start = runEndMarkings(index, junctions, run.startEdge, run.from, true);
    const end = runEndMarkings(index, junctions, run.endEdge, run.to, false);
    const half = run.width / 2;
    const attrsBase = {
      run: [half, roadMarkingKindOf(run.width), total, PIECE_RIBBON],
      ends: [start.center, end.center, start.stop, end.stop],
      edges: [start.left, start.right, end.left, end.right],
      zebra: [start.zebra, end.zebra],
      color: color.set(asphaltOf(run.kind)).clone(),
    };
    ribbon(points, lengths, run.width, layers[roadLayerOf(run.width)], attrsBase);
    // 人行道带：同一条中线、宽 + 2.4，压在最底层；不画标线。
    ribbon(points, lengths, run.width + 2 * SIDEWALK, layers[0], { ...attrsBase, run: [half + SIDEWALK, 0, total, PIECE_SIDEWALK], color: color.set(SIDEWALK_COLOR).clone() });
  }

  // ── 路口填充：扇形三角化 + 径向细分（长扇面贴地不穿地形） ──
  const fill = color.clone();
  const fan = (center: Vec2, ring: Vec2[], closed: boolean, hex: string, sidewalk = false) => {
    const b = layers[sidewalk ? 0 : 1];
    const attrs = { u: 0, v: 0, run: [0, 0, 0, sidewalk ? PIECE_SIDEWALK : PIECE_FILL], ends: [0, 0, -1, -1], edges: [0, 0, 0, 0], zebra: [-1, -1], color: fill.set(hex).clone() };
    const segments = closed ? ring.length : ring.length - 1;
    if (segments < 1) return;
    // 平地上一圈只要「圆心 + 环」一层（顶点共享）；扇面下的地形不平才按 ≤ ALONG_STEP 径向分层。
    const lerp = (p: Vec2, q: Vec2, t: number) => ({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
    let flat = true;
    for (let k = 0; k < segments && flat; k += 1) {
      const p = ring[k]; const q = ring[(k + 1) % ring.length];
      flat = planarMid(center, p, lerp(center, p, 0.5)) && planarMid(p, q, lerp(p, q, 0.5)) && planarMid(center, lerp(p, q, 0.5), lerp(center, lerp(p, q, 0.5), 0.5));
    }
    const reach = Math.max(...ring.map((p) => Math.hypot(p.x - center.x, p.z - center.z)));
    const steps = flat ? 1 : Math.max(1, Math.ceil(reach / ALONG_STEP));
    const middle = vertex(b, center.x, center.z, attrs);
    let previous: number[] | null = null;
    for (let i = 1; i <= steps; i += 1) {
      const row = ring.map((p) => vertex(b, center.x + (p.x - center.x) * (i / steps), center.z + (p.z - center.z) * (i / steps), attrs));
      for (let k = 0; k < segments; k += 1) {
        const n = (k + 1) % ring.length;
        if (!previous) pushUpTriangle(b, middle, row[k], row[n]);
        else { pushUpTriangle(b, previous[k], row[k], previous[n]); pushUpTriangle(b, previous[n], row[k], row[n]); }
      }
      previous = row;
    }
  };
  const circle = (c: Vec2, radius: number) => Array.from({ length: 16 }, (_, k) => ({ x: c.x + Math.cos((k / 16) * Math.PI * 2) * radius, z: c.z + Math.sin((k / 16) * Math.PI * 2) * radius }));
  for (const junction of plan) {
    const node = { x: junction.x, z: junction.z };
    for (const corner of junction.corners) {
      fan(node, cornerArc(corner, 0, FILL_ARC_STEP), false, asphaltOf(corner.kind));
      // 转角人行道：半径 r − 1.2 的同心弧（同地面贴图），圆角铺装压在它上面，只剩弧外 1.2 的一圈。
      fan(node, cornerArc(corner, SIDEWALK, FILL_ARC_STEP), false, SIDEWALK_COLOR, true);
    }
    if (junctions.has(junction.id)) {
      // 路口中心圆盘（≥3 路）：最宽臂的颜色与半径——覆盖背离侧的楔形缺口。
      const widest = junction.arms.find((arm) => arm.edge.width === junction.maxWidth && !arm.edge.bridge) ?? junction.arms[0];
      fan(node, circle(node, junction.maxWidth / 2), true, asphaltOf(widest.edge.kind));
    } else if (junction.arms.length === 2 && !junction.touchesDeck && junction.arms[0].edge.width !== junction.arms[1].edge.width) {
      // 度 2 换宽：窄路宽的圆盘补折角缝（同旧贴图 seams：取窄的，取宽的会鼓包）。
      // 颜色取窄路：换宽 = 换等级，颜色在节点处一刀切换；用宽路色会在窄路两侧露出一圈深色（真机 8→5 渐变）。
      const narrow = junction.arms[0].edge.width < junction.arms[1].edge.width ? junction.arms[0] : junction.arms[1];
      fan(node, circle(node, narrow.half), true, asphaltOf(narrow.edge.kind));
      fan(node, circle(node, narrow.half + SIDEWALK), true, SIDEWALK_COLOR, true);
    }
    if (junction.taper) {
      const { narrow } = junction.taper;
      const outline = taperOutline(junction, 0);
      const mid = { x: outline.reduce((sum, p) => sum + p.x, 0) / 4, z: outline.reduce((sum, p) => sum + p.z, 0) / 4 };
      fan(mid, outline, true, asphaltOf(narrow.edge.kind));
      fan(mid, taperOutline(junction, SIDEWALK), true, SIDEWALK_COLOR, true);
    }
  }
  return layers;
}

/** 路面标线色（sRGB）：白 = 车道 / 边线 / 斑马线 / 停止线，黄 = 次干 / 主干中线。 */
const MARK_WHITE = "#eceae2";
const MARK_YELLOW = "#e0c15c";

function installRoadShader(host: RoadSurfaceHost, material: THREE.MeshLambertMaterial, cacheKey: string): void {
  const shared = host.terrainUniforms ?? {};
  const own = { uMarkWhite: { value: new THREE.Color(MARK_WHITE) }, uMarkYellow: { value: new THREE.Color(MARK_YELLOW) } };
  material.onBeforeCompile = (shader) => {
    for (const name of ["uDetail", "uNightDim", "uSpill", "uSpillGain", "uExtent", "uAsphaltC", "uAsphaltN", "uAsphaltMean", "uConcreteC", "uConcreteN", "uConcreteMean"]) {
      shader.uniforms[name] = shared[name] ?? { value: name === "uDetail" || name === "uNightDim" || name === "uSpillGain" ? 0 : name === "uExtent" ? 1 : name.endsWith("Mean") ? new THREE.Vector3(0.5, 0.5, 0.5) : null };
    }
    Object.assign(shader.uniforms, own);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
attribute vec4 aRoadRun; varying vec4 vRoadRun; varying vec3 vRoadWorld;
#ifndef ROAD_BASE
attribute vec2 aRoadUV; attribute vec4 aRoadEnds; attribute vec4 aRoadEdges; attribute vec2 aRoadZebra;
varying vec2 vRoadUV; varying vec4 vRoadEnds; varying vec4 vRoadEdges; varying vec2 vRoadZebra;
#endif`)
      .replace("#include <project_vertex>", `#include <project_vertex>
vRoadRun = aRoadRun; vRoadWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#ifndef ROAD_BASE
vRoadUV = aRoadUV; vRoadEnds = aRoadEnds; vRoadEdges = aRoadEdges; vRoadZebra = aRoadZebra;
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec4 vRoadRun; varying vec3 vRoadWorld;
#ifndef ROAD_BASE
varying vec2 vRoadUV; varying vec4 vRoadEnds; varying vec4 vRoadEdges; varying vec2 vRoadZebra;
#endif
uniform float uDetail; uniform float uNightDim; uniform sampler2D uSpill; uniform float uSpillGain; uniform float uExtent;
uniform sampler2D uAsphaltC; uniform sampler2D uAsphaltN; uniform vec3 uAsphaltMean; uniform vec3 uMarkWhite; uniform vec3 uMarkYellow;
uniform sampler2D uConcreteC; uniform sampler2D uConcreteN; uniform vec3 uConcreteMean;
// 抗锯齿基元：全部用 fwidth 做一个像素宽的过渡，任何缩放下线宽都是真实世界宽度。
float roadLine(float d, float hw) { float fw = max(fwidth(d), 1e-4); return 1.0 - smoothstep(hw - fw, hw + fw, abs(d)); }
float roadRange(float x, float a, float b) { float fw = max(fwidth(x), 1e-4); return smoothstep(a - fw, a + fw, x) * (1.0 - smoothstep(b - fw, b + fw, x)); }
float roadDash(float u, float period, float duty) { float x = u / period; float f = fract(x); float fw = max(fwidth(x), 1e-4);
  // 远处一个像素覆盖多段虚线时退化成平均覆盖率（duty），不闪烁。
  float on = smoothstep(0.0, fw, f) * (1.0 - smoothstep(duty - fw, duty, f)); return mix(on, duty, smoothstep(0.25, 0.6, fw)); }`)
      // 注入在 color_fragment 之后：Lambert 里顶点色乘法（沥青底色）在 map_fragment 之后才做，
      // 注入在前面的话白色标线会被乘成沥青色、整条消失（第一版真机就是这样）。
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  vec2 p = vRoadWorld.xz;
  // 照片细节与地面 shader 同一组贴图、同一世界尺度（沥青 /7、混凝土 /5.5）：路面与周边地面的颗粒感一致。
  float isWalk = step(1.5, vRoadRun.w);
  if (uDetail > 0.5) {
    vec3 ratio = mix(texture2D(uAsphaltC, p / 7.0).rgb / uAsphaltMean, texture2D(uConcreteC, p / 5.5).rgb / uConcreteMean, isWalk);
    vec3 nrm = mix(texture2D(uAsphaltN, p / 7.0).xyz, texture2D(uConcreteN, p / 5.5).xyz, isWalk) * 2.0 - 1.0;
    diffuseColor.rgb *= mix(vec3(1.0), clamp(ratio, 0.5, 1.6), 0.55);
    diffuseColor.rgb *= 1.0 + 0.3 * (nrm.x * 0.6 - nrm.y * 0.45);
  }
#ifndef ROAD_BASE
  float ribbon = 1.0 - step(0.5, vRoadRun.w);
  float u = vRoadUV.x; float v = vRoadUV.y; float hw = vRoadRun.x; float kind = vRoadRun.y; float len = vRoadRun.z;
  float back = len - u;
  float zebraBand = (vRoadZebra.x > 0.0 ? roadRange(u, vRoadZebra.x - ${ZEBRA_HALF.toFixed(2)}, vRoadZebra.x + ${ZEBRA_HALF.toFixed(2)}) : 0.0)
                  + (vRoadZebra.y > 0.0 ? roadRange(back, vRoadZebra.y - ${ZEBRA_HALF.toFixed(2)}, vRoadZebra.y + ${ZEBRA_HALF.toFixed(2)}) : 0.0);
  zebraBand = min(zebraBand, 1.0);
  // 条纹以路中线对称（v = 0, ±1, ±2 … 处各一条），两侧不留半条碎纹。
  float zebra = zebraBand * roadDash(v + 0.25, 1.0, 0.5) * roadRange(v, -hw + 0.35, hw - 0.35);
  float lines = 1.0 - zebraBand;
  float centerOn = roadRange(u, vRoadEnds.x, len - vRoadEnds.y) * lines;
  float leftOn = roadRange(u, vRoadEdges.x, len - vRoadEdges.z) * lines;
  float rightOn = roadRange(u, vRoadEdges.y, len - vRoadEdges.w) * lines;
  // 停止线：横跨驶入半幅（右侧通行）——起点端在 −v 侧，终点端在 +v 侧；宽 0.5。
  float stopLine = (vRoadEnds.z > 0.0 ? roadRange(u, vRoadEnds.z - 0.25, vRoadEnds.z + 0.25) * roadRange(v, -hw + 0.25, -0.15) : 0.0)
                 + (vRoadEnds.w > 0.0 ? roadRange(back, vRoadEnds.w - 0.25, vRoadEnds.w + 0.25) * roadRange(v, 0.15, hw - 0.25) : 0.0);
  float isLocal = 1.0 - step(0.5, kind); float isSecondary = step(0.5, kind) * (1.0 - step(1.5, kind)); float isMain = step(1.5, kind);
  float edgeLine = (isSecondary + isMain) * (roadLine(v - (hw - 0.45), 0.07) * leftOn + roadLine(v + (hw - 0.45), 0.07) * rightOn);
  float white = isLocal * roadLine(v, 0.07) * roadDash(u, 6.0, 0.5) * centerOn
              + isMain * roadLine(abs(v) - hw * 0.5, 0.065) * roadDash(u, 6.0, 0.5) * centerOn
              + edgeLine + zebra + stopLine;
  float yellow = isSecondary * roadLine(v, 0.08) * roadDash(u, 6.0, 0.5) * centerOn
               + isMain * roadLine(abs(v) - 0.2, 0.07) * centerOn;
  white = clamp(white, 0.0, 1.0) * ribbon * 0.92; yellow = clamp(yellow, 0.0, 1.0) * ribbon * 0.9;
  diffuseColor.rgb = mix(diffuseColor.rgb, uMarkWhite, white);
  diffuseColor.rgb = mix(diffuseColor.rgb, uMarkYellow, yellow);
#endif
}`)
      // 夜间与地面同口径：主题色压暗 + 楼窗光外溢（与 terrainSystem 同一组 uniform）。
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
diffuseColor.rgb *= mix(1.0, ${LIGHT_BUDGET.ambient.groundDim.toFixed(2)}, uNightDim);
if (uSpillGain > 0.001) { vec2 suv = vRoadWorld.xz / uExtent + 0.5; totalEmissiveRadiance += texture2D(uSpill, suv).rgb * uSpillGain; }`);
  };
  material.customProgramCacheKey = () => cacheKey;
}

/** 建路面网格：两个 Mesh——
 *  - city-road-surface-base：人行道 + 路口填充（第 0/1 层），只带位置 / 法线 / 颜色 / 片类，不画标线；
 *  - city-road-surface：路段带（第 2–4 层），带标线所需的每端参数。
 *  拆开是为了体量：填充与人行道占顶点的九成，却用不上那 10 个标线属性（档 10 城每顶点 100 B → 52 B 量级）。
 *  每个材质组一个 polygonOffset 层级，逐层加大。 */
export function buildRoadSurface(host: RoadSurfaceHost): void {
  const layers = roadSurfaceGeometry(host.layout);
  const build = (layerIndices: number[], full: boolean, name: string) => {
    const positions: number[] = []; const normals: number[] = []; const colors: number[] = []; const uv: number[] = [];
    const run: number[] = []; const ends: number[] = []; const edges: number[] = []; const zebra: number[] = []; const index: number[] = [];
    const geometry = new THREE.BufferGeometry();
    for (const layerIndex of layerIndices) {
      const layer = layers[layerIndex];
      const base = positions.length / 3; const first = index.length;
      positions.push(...layer.positions); normals.push(...layer.normals); colors.push(...layer.colors); run.push(...layer.run);
      if (full) { uv.push(...layer.uv); ends.push(...layer.ends); edges.push(...layer.edges); zebra.push(...layer.zebra); }
      for (const i of layer.index) index.push(base + i);
      if (index.length > first) geometry.addGroup(first, index.length - first, layerIndex);
    }
    if (!index.length) { geometry.dispose(); return; }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("aRoadRun", new THREE.Float32BufferAttribute(run, 4));
    if (full) {
      geometry.setAttribute("aRoadUV", new THREE.Float32BufferAttribute(uv, 2));
      geometry.setAttribute("aRoadEnds", new THREE.Float32BufferAttribute(ends, 4));
      geometry.setAttribute("aRoadEdges", new THREE.Float32BufferAttribute(edges, 4));
      geometry.setAttribute("aRoadZebra", new THREE.Float32BufferAttribute(zebra, 2));
    }
    geometry.setIndex(positions.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
    geometry.computeBoundingSphere();
    // materialIndex 用全局层号：材质数组按层号排，未用到的层占位（同一套 polygonOffset 阶梯跨两个 mesh 连续）。
    const materials = layers.map((_, layer) => {
      const material = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1 - layer, polygonOffsetUnits: -2 - 2 * layer });
      if (!full) material.defines = { ROAD_BASE: "" };
      installRoadShader(host, material, full ? "city-road-surface" : "city-road-surface-base");
      return material;
    });
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.name = name;
    mesh.receiveShadow = true;
    host.group.add(mesh);
    host.disposables.push(geometry, ...materials.filter((_, layer) => layerIndices.includes(layer)));
    for (const [layer, material] of materials.entries()) if (!layerIndices.includes(layer)) material.dispose();
  };
  build([0, 1], false, "city-road-surface-base");
  build([2, 3, 4], true, "city-road-surface");
}
