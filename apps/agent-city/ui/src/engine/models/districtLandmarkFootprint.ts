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
};

const DEFAULT_RECT = 13; // 找不到地块时的保底半宽：与旧的 26 单位见方保留量一致

/** 地标局部系下街区所有地块的包围盒，并按朝路方向转到正则系。找不到所属地块返回保底场地。 */
export function landmarkSite(landmark: { x: number; z: number; yaw: number; parcelId: string }, parcels: readonly Placed[], height: number): LandmarkSite {
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
  const grow = Math.max(1, Math.min(wanted, (PODIUM_MAX_SHARE * Math.min(roomW, roomD)) / skirt));
  const w = skirt * grow, d = DISTRICT_LANDMARK_RENDER_GEOMETRY.skirtDepth * grow;
  // 裙楼靠街区里侧（-z），前面留前院；左右居中。
  const podium = { cu: (rect.u0 + rect.u1) / 2, cv: rect.v0 + d / 2, w, d };
  return { turn, rect, grow, podium, yardDepth: Math.max(0, rect.v1 - (podium.cv + d / 2)) };
}
