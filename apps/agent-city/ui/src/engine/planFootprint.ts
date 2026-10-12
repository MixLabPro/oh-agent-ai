/**
 * 自由级设施（致敬地标、市政用地）的真实占地、朝向与入口（docs/CITY_MAP_EDITOR_ROADMAP_SPEC.md P1-3 的自由落位部分）。
 *
 * 生成器把它们存成「中心 + radius」——radius 是**名义预留圆**（modelEnvelope 叫它 nominal-plot-reservation / legacy-radius），
 * 不是建筑的形状。编辑器曾直接拿这个圆做落位：路必须离中心 ≥ 0.75r、重叠也按圆算，于是车站这种矩形建筑永远贴不上路；
 * 接入路又从圆的外接方形外起笔（r·√2 外），离建筑真实边缘还有大半个半径——用户截图：车站孤零零立在草地上，路接不上。
 *
 * 这里按模型的真实地面实体给占地（局部坐标，+z 为正面——与 models/physical 的 EntranceSpec 同一约定）：
 *   - 在生成器的地面登记表里的（villa-complex）：resolveGroundModel 的声明；
 *   - 渲染层导出了几何的：市政厅 civicGroundFootprint、车站站台 + 站房、体育场看台外廓；
 *   - 其余（塔、摩天轮、公园、港口…，本来就近似圆）：保留预留圆，如实标 `exact: false`。
 * 纯函数；局部 → 世界的变换与 planner/modelEnvelope 的 worldPoint 同一个公式（yaw 绕 y，+z 正面 → 世界 (sin yaw, cos yaw)）。
 */
import { hashSeed } from "../cityModel";
import type { Vec2 } from "./cityLayout";
import { resolveGroundModel } from "./models/groundRegistry";
import type { LocalFootprint, LocalRegion } from "./models/physical";
import { civicGroundFootprint, stationHallLocal } from "./models/publicSiteGeometry";

export type Polygon = readonly Vec2[];
/** 设施前沿到路肩的退距（同 MODEL_ENVELOPE_CONFIG.defaultRoadSetback）。 */
export const ROAD_SETBACK = 3;

export type FootprintSpec = {
  /** 局部坐标的凸多边形并集（圆已离散成 16 边形）。 */
  parts: readonly Polygon[];
  /** 是否是模型的真实形状（false = 名义预留圆）。 */
  exact: boolean;
  /** 局部包围盒。 */
  min: Vec2; max: Vec2;
};

const circle = (cx: number, cz: number, r: number, n = 16): Polygon => Array.from({ length: n }, (_, i) => ({ x: cx + Math.cos((i / n) * Math.PI * 2) * r, z: cz + Math.sin((i / n) * Math.PI * 2) * r }));
const rect = (cx: number, cz: number, w: number, d: number): Polygon => [{ x: cx - w / 2, z: cz - d / 2 }, { x: cx + w / 2, z: cz - d / 2 }, { x: cx + w / 2, z: cz + d / 2 }, { x: cx - w / 2, z: cz + d / 2 }];
const fromRegion = (region: LocalRegion): Polygon =>
  region.shape === "circle" ? circle(region.center.x, region.center.z, region.radius)
    : region.shape === "rect" ? rect(region.center.x, region.center.z, region.width, region.depth) : region.vertices;
const fromFootprint = (footprint: LocalFootprint): Polygon[] => footprint.parts.map(fromRegion);

function spec(parts: Polygon[], exact: boolean): FootprintSpec {
  const xs = parts.flat().map((p) => p.x); const zs = parts.flat().map((p) => p.z);
  return { parts, exact, min: { x: Math.min(...xs), z: Math.min(...zs) }, max: { x: Math.max(...xs), z: Math.max(...zs) } };
}

/**
 * 设施的局部占地。kind：地标种类（landmarkKind）或市政用地种类（publicKind）；id 给需要种子的模型（庄园）。
 * 只认得出名义圆时返回圆（exact=false）。
 */
export function siteFootprint(kind: string, id: string, radius: number): FootprintSpec {
  const ground = resolveGroundModel(kind, { seed: hashSeed(id), radius });
  if (ground.status === "partial") return spec(fromFootprint(ground.declaration.footprint), true);
  if (kind === "civic") return spec(fromFootprint(civicGroundFootprint(radius)), true);
  if (kind === "station") {
    // 与 civicSystem 渲染同源：站台 r·1.5 × r·1.1（含雨棚、轨道、列车），站房在站台后沿外侧。
    const hall = stationHallLocal(radius);
    return spec([rect(0, 0, radius * 1.5, radius * 1.1), rect(hall.centre.x, hall.centre.z, hall.width, hall.depth)], true);
  }
  if (kind === "stadium") {
    // 看台：椭圆 27 × 19.5 上 18 段 10.5 × 5.5 的看台块（渲染写死，不随 radius 缩放）；外廓按看台外沿取矩形。
    return spec([rect(0, 0, 2 * (27 + 5.5), 2 * (19.5 + 5.5))], true);
  }
  return spec([circle(0, 0, radius)], false);
}

/** 局部 → 世界（同 modelEnvelope.worldPoint）。 */
export const toWorld = (p: Vec2, origin: Vec2, yaw: number): Vec2 => ({
  x: origin.x + p.x * Math.cos(yaw) + p.z * Math.sin(yaw),
  z: origin.z - p.x * Math.sin(yaw) + p.z * Math.cos(yaw),
});

export function worldParts(footprint: FootprintSpec, origin: Vec2, yaw: number): Polygon[] {
  return footprint.parts.map((part) => part.map((p) => toWorld(p, origin, yaw)));
}

/** 包围盒在世界里的朝向矩形（叠加层、拾取、障碍物用）。 */
export function worldBox(footprint: FootprintSpec, origin: Vec2, yaw: number): { x: number; z: number; yaw: number; width: number; depth: number } {
  const c = toWorld({ x: (footprint.min.x + footprint.max.x) / 2, z: (footprint.min.z + footprint.max.z) / 2 }, origin, yaw);
  return { x: c.x, z: c.z, yaw, width: footprint.max.x - footprint.min.x, depth: footprint.max.z - footprint.min.z };
}

/** 正面入口：局部包围盒 +z 面的中点，朝外方向 = 局部 +z。 */
export function frontEntrance(footprint: FootprintSpec, origin: Vec2, yaw: number): { at: Vec2; outward: Vec2 } {
  return { at: toWorld({ x: (footprint.min.x + footprint.max.x) / 2, z: footprint.max.z }, origin, yaw), outward: { x: Math.sin(yaw), z: Math.cos(yaw) } };
}

/** 让局部 +z（正面）指向方向 d 的 yaw。 */
export const yawFacing = (d: Vec2): number => Math.atan2(d.x, d.z);

// ── 凸多边形几何 ──

const cross = (a: Vec2, b: Vec2, p: Vec2) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
export function pointInPolygon(p: Vec2, poly: Polygon): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const c = cross(poly[i], poly[(i + 1) % poly.length], p);
    if (Math.abs(c) < 1e-9) continue;
    const s = c > 0 ? 1 : -1;
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}
function pointSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(a, b, c); const d2 = cross(a, b, d); const d3 = cross(c, d, a); const d4 = cross(c, d, b);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
/** 线段到凸多边形的距离（相交或在内为 0）。 */
export function segmentPolygonDistance(a: Vec2, b: Vec2, poly: Polygon): number {
  if (pointInPolygon(a, poly) || pointInPolygon(b, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const c = poly[i]; const d = poly[(i + 1) % poly.length];
    if (segmentsCross(a, b, c, d)) return 0;
    best = Math.min(best, pointSegment(a, c, d), pointSegment(b, c, d), pointSegment(c, a, b), pointSegment(d, a, b));
  }
  return best;
}
/** 两个凸多边形是否相交（分离轴，贴边不算）。 */
export function polygonsOverlap(a: Polygon, b: Polygon): boolean {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i]; const q = poly[(i + 1) % poly.length];
    const nx = -(q.z - p.z); const nz = q.x - p.x;
    const project = (shape: Polygon) => shape.map((v) => v.x * nx + v.z * nz);
    const pa = project(a); const pb = project(b);
    if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false;
  }
  return true;
}
export const rectPolygon = (r: { x: number; z: number; yaw: number; width: number; depth: number }): Polygon => rect(0, 0, r.width, r.depth).map((p) => toWorld(p, r, r.yaw));
