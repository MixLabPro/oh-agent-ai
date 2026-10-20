/**
 * 城区地标的地块布局（纯函数，不依赖 three）：塔楼地基随楼高放大 + 前院（广场、停车场、绿化）。
 *
 * 用户（2026-10-15）：「按会话楼的策略，达到一定阈值后增加地基面积」「地标独立占了一个地块，这个地块还可以加上停车场和植被」。
 * 会话楼的策略是高楼并相邻空地块、面宽翻倍，不再细成一根签。城区地标高度由会话数据决定（下限 ≈ 最高会话楼×1.1，上限 90 单位），
 * 裙楼固定 17、塔身 12 时 90 高的塔细长比 ≈ 10:1。这里让塔身宽度至少是高度的 1/LANDMARK_SLENDER，裙楼同比放大，
 * 但**只在地标已经预留的整块街区里**——生成器与编辑器都把它所在的整个街区预留了（cityLayout 注释、planGeometry），
 * 所以不会压到会话楼，也不用改规划占地与基线。街区里裙楼之外的部分做前院。
 *
 * 坐标：「正则系」= 以朝路一侧为 +z 的右手系（渲染器把整个场地放进一个按 `turn` 旋转的子组里）；原点 = 地标地块中心。
 * 编辑器把地标搬到别的街区后，渲染器每次按当前布局重算，所以场地跟着走。
 */
import { DISTRICT_LANDMARK_RENDER_GEOMETRY } from "./layoutPlacementGeometry";

/** 塔身（最宽一级）的高宽比上限：8:1 是高层塔楼的常见细长比（过 10 开始像烟囱）。 */
export const LANDMARK_SLENDER = 8;
/** 基准塔身宽度（最宽一级，单位）；裙楼 17 与它的比例固定。 */
export const LANDMARK_SHAFT_BASE = 12;
/** 离街区边界留的余量（单位）：场地不贴着街区边线。 */
export const LANDMARK_EDGE_MARGIN = 1.5;
/** 裙楼最多占街区宽度的比例：剩下的做前院与两侧绿化。 */
const PODIUM_MAX_SHARE = 0.72;
/** 裙楼层数（3 层 ≈ 10 m，玻璃幕墙）与每层高度（世界单位，3.2 m）。 */
export const PODIUM_FLOORS = 3;

type Placed = { id: string; x: number; z: number; yaw: number; width: number; depth: number; blockId: string;
  frontage?: { frontagePoint: { x: number; z: number } } };
export type LandmarkSite = {
  /** 子组绕 y 的旋转：把「朝路为 +z」的正则系转到地标局部系（0 / π / ±π/2）。 */
  turn: number;
  /** 街区在正则系里的范围（地标局部系 → 正则系后的包围盒，已含 EDGE_MARGIN 内缩）。 */
  rect: { u0: number; u1: number; v0: number; v1: number };
  /** 塔与裙楼的放大系数 ≥ 1（相对 17/12 的基准尺寸）。 */
  grow: number;
  /** 裙楼：中心 (cu, cv)、宽 w、深 d（正则系，靠街区里侧，前面留前院）。 */
  podium: { cu: number; cv: number; w: number; d: number };
  /** 前院：裙楼正面到街区前沿之间的深度；< 4 时不放停车场。 */
  yardDepth: number;
  /** 街区多边形（正则系）。它是道路中线围成的面（顶点在路中线上），所以只判「在多边形内」不够，还要离路缘留人行道。 */
  outline: Vec2[] | null;
  /** 街区周边道路（正则系线段 + 半路宽）：部件离路缘至少 SIDEWALK + 边距（见 siteClear）。 */
  roads: Array<{ a: Vec2; b: Vec2; half: number }>;
};
/** 人行道带宽（与 cityRoadJunctions.SIDEWALK_BAND 同值）：场地部件不压人行道。 */
export const SITE_SIDEWALK = 1.8;
type Vec2 = { x: number; z: number };

/** 点在多边形内，且离每条边至少 margin。多边形顶点按任意绕向给出。 */
export function insideOutline(outline: readonly Vec2[] | null, x: number, z: number, margin = 0): boolean {
  if (!outline || outline.length < 3) return true;
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
    const a = outline[i], b = outline[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  if (!inside) return false;
  if (margin <= 0) return true;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
    const a = outline[j], b = outline[i];
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
    if (Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < margin) return false;
  }
  return true;
}

/** 点在街区内，且离每条周边道路的路缘至少 SITE_SIDEWALK + margin。 */
export function siteClear(site: Pick<LandmarkSite, "outline" | "roads">, x: number, z: number, margin = 0): boolean {
  if (!insideOutline(site.outline, x, z)) return false;
  for (const road of site.roads) {
    const dx = road.b.x - road.a.x, dz = road.b.z - road.a.z, l2 = dx * dx + dz * dz;
    const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((x - road.a.x) * dx + (z - road.a.z) * dz) / l2)) : 0;
    if (Math.hypot(x - road.a.x - dx * t, z - road.a.z - dz * t) < road.half + SITE_SIDEWALK + margin) return false;
  }
  return true;
}

/** 正则系轴对齐矩形（中心 x,z，宽 w 沿 x，深 d 沿 z）整圈落在街区内：沿四条边每 ≤4 单位采样一点。 */
export function rectSiteClear(site: Pick<LandmarkSite, "outline" | "roads">, x: number, z: number, w: number, d: number, margin = 0): boolean {
  const nx = Math.max(1, Math.ceil(w / 4)), nz = Math.max(1, Math.ceil(d / 4));
  for (let i = 0; i <= nx; i += 1) for (const sz of [-1, 1]) if (!siteClear(site, x - w / 2 + (w * i) / nx, z + (sz * d) / 2, margin)) return false;
  for (let j = 0; j <= nz; j += 1) for (const sx of [-1, 1]) if (!siteClear(site, x + (sx * w) / 2, z - d / 2 + (d * j) / nz, margin)) return false;
  return true;
}

const DEFAULT_RECT = 13; // 找不到地块时的保底半宽：与旧的 26 单位见方保留量一致

/** 地标局部系下街区所有地块的包围盒，并按朝路方向转到正则系。找不到所属地块返回保底场地。 */
export function landmarkSite(landmark: { x: number; z: number; yaw: number; parcelId: string }, parcels: readonly Placed[], height: number,
  blockOutline: readonly Vec2[] | null = null, roadSegments: ReadonlyArray<{ a: Vec2; b: Vec2; half: number }> = []): LandmarkSite {
  const own = parcels.find((p) => p.id === landmark.parcelId);
  const cos = Math.cos(landmark.yaw), sin = Math.sin(landmark.yaw);
  const toLocal = (wx: number, wz: number) => { const dx = wx - landmark.x, dz = wz - landmark.z; return { u: dx * cos - dz * sin, v: dx * sin + dz * cos }; };
  let minU = -DEFAULT_RECT, maxU = DEFAULT_RECT, minV = -DEFAULT_RECT, maxV = DEFAULT_RECT;
  if (own) {
    minU = minV = Infinity; maxU = maxV = -Infinity;
    for (const p of parcels) {
      if (p.blockId !== own.blockId) continue;
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      for (const [hx, hz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        // 地块局部角点 → 世界 → 地标局部（与 three 的 rotation.y 约定一致）。
        const lx = hx * p.width / 2, lz = hz * p.depth / 2;
        const { u, v } = toLocal(p.x + lx * c + lz * s, p.z - lx * s + lz * c);
        if (u < minU) minU = u; if (u > maxU) maxU = u; if (v < minV) minV = v; if (v > maxV) maxV = v;
      }
    }
  }
  // 朝路方向：地块正面点相对地标中心的方位，取最大分量那根轴；没有正面证据时朝 +z（地块 yaw 本来就把正面转向 +z）。
  let turn = 0;
  const front = own?.frontage?.frontagePoint;
  if (front) {
    const { u, v } = toLocal(front.x, front.z);
    turn = Math.abs(v) >= Math.abs(u) ? (v >= 0 ? 0 : Math.PI) : (u >= 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  // 局部系 → 正则系是 turn 的逆旋转：x' = x·cosθ − z·sinθ，z' = x·sinθ + z·cosθ（90° 的倍数，包围盒精确）。
  const ct = Math.round(Math.cos(turn)), st = Math.round(Math.sin(turn));
  const canon = ([[minU, minV], [maxU, minV], [maxU, maxV], [minU, maxV]] as const).map(([u, v]) => ({ a: u * ct - v * st, b: u * st + v * ct }));
  const m = LANDMARK_EDGE_MARGIN;
  const rect = { u0: Math.min(...canon.map((q) => q.a)) + m, u1: Math.max(...canon.map((q) => q.a)) - m,
    v0: Math.min(...canon.map((q) => q.b)) + m, v1: Math.max(...canon.map((q) => q.b)) - m };
  const roomW = rect.u1 - rect.u0, roomD = rect.v1 - rect.v0;
  const skirt = DISTRICT_LANDMARK_RENDER_GEOMETRY.skirtWidth;
  const wanted = Math.max(1, height / (LANDMARK_SLENDER * LANDMARK_SHAFT_BASE));
  let grow = Math.max(1, Math.min(wanted, (PODIUM_MAX_SHARE * Math.min(roomW, roomD)) / skirt));
  // 街区多边形转到正则系：rect 只是地块包围盒，非矩形街区的角在路上（verify-city-collision 实测：
  // 草坪/树/绿篱伸出街区压路）。裙楼（含 0.45 挑檐）必须整个落在多边形内：先往前挪，再缩小放大系数。
  const toCanon = (p: Vec2): Vec2 => { const { u, v } = toLocal(p.x, p.z); return { x: u * ct - v * st, z: u * st + v * ct }; };
  const outline = blockOutline && blockOutline.length >= 3 ? blockOutline.map(toCanon) : null;
  const roads = roadSegments.map((road) => ({ a: toCanon(road.a), b: toCanon(road.b), half: road.half }));
  const placed = { outline, roads };
  const cu = (rect.u0 + rect.u1) / 2;
  let podium = { cu, cv: rect.v0 + (DISTRICT_LANDMARK_RENDER_GEOMETRY.skirtDepth * grow) / 2, w: skirt * grow, d: DISTRICT_LANDMARK_RENDER_GEOMETRY.skirtDepth * grow };
  if (outline || roads.length) {
    // 候选中心：① 靠街区里侧、左右居中（前面留前院）；② 地块中心附近——布局按「地块中心 + 17 见方包络」验证过地标放得下，
    // 窄街区（包围盒只有几个单位宽）里①怎么都放不下，退回②。先带 0.45 挑檐余量找，找不到再按墙体本身找。
    const centers = (d: number) => [
      ...Array.from({ length: 13 }, (_, shift) => ({ x: cu, z: rect.v0 + d / 2 + shift })),
      ...[0, 1, -1, 2, -2, 3, -3, 4, -4].flatMap((dx) => [0, 1, -1, 2, -2, 3, -3, 4, -4].map((dz) => ({ x: dx, z: dz }))),
    ];
    search: for (const [overhang, margin] of [[0.9, 0.3], [0, 0]] as const) {
      for (let g = grow; g >= 1 - 1e-9; g -= 0.05) {
        const w = skirt * g, d = DISTRICT_LANDMARK_RENDER_GEOMETRY.skirtDepth * g;
        for (const c of centers(d)) {
          if (rectSiteClear(placed, c.x, c.z, w + overhang, d + overhang, margin)) { grow = g; podium = { cu: c.x, cv: c.z, w, d }; break search; }
        }
      }
    }
  }
  return { turn, rect, grow, podium, yardDepth: Math.max(0, rect.v1 - (podium.cv + podium.d / 2)), outline, roads };
}
