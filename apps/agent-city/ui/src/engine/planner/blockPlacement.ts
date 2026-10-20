/** Shared layout placement geometry. Model selection and candidate search remain callers' work. */
import { DetMath as Math } from "../detMath";
import type { RoadEdge, Vec2 } from "../cityLayout";

export type BlockPlacementInput = {
  block: { polygon: readonly Vec2[]; holes?: readonly (readonly Vec2[])[] };
  footprint: Vec2 & { yaw: number; width: number; depth: number };
  roads: readonly RoadEdge[]; sites: readonly (Vec2 & { radius: number })[];
  /** Actual rendered road/sidewalk triangles, including junction fans beyond centreline capsules. */
  roadPolygons?: readonly (readonly Vec2[])[];
  highways: readonly (readonly Vec2[])[]; buildable: (x: number, z: number) => boolean;
  reserved?: (point: Vec2) => boolean; terrainSampleBudget?: number; cancelled?: () => boolean;
};
export type BlockPlacementResult = { ok: boolean; reason?: string; polygon: Vec2[]; terrainSamples: number;
  scope: "sampled-rectangle-and-declared-circle-proxies"; terrainCoverage: "at-most-one-unit-grid" };
const cross = (a: Vec2, b: Vec2, p: Vec2) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
const distance = (p: Vec2, a: Vec2, b: Vec2) => {
  const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
};
const contains = (ring: readonly Vec2[], p: Vec2) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if (distance(p, a, b) <= 1e-9) return true;
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
};
const segmentGap = (a: Vec2, b: Vec2, c: Vec2, d: Vec2) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
  ? 0 : Math.min(distance(a, c, d), distance(b, c, d), distance(c, a, b), distance(d, a, b));
const ringGap = (ring: readonly Vec2[], a: Vec2, b: Vec2) => Math.min(...ring.map((p, i) => segmentGap(p, ring[(i + 1) % ring.length], a, b)));
const pointGap = (ring: readonly Vec2[], p: Vec2) => contains(ring, p) ? 0 : Math.min(...ring.map((a, i) => distance(p, a, ring[(i + 1) % ring.length])));
const validPoint = (p: Vec2) => Number.isFinite(p.x) && Number.isFinite(p.z);

/** Rectangle yaw follows renderer rotationY: world x=local.x*cos+local.z*sin. */
export function inspectBlockPlacement(input: BlockPlacementInput): BlockPlacementResult {
  const result: BlockPlacementResult = { ok: false, polygon: [], terrainSamples: 0,
    scope: "sampled-rectangle-and-declared-circle-proxies", terrainCoverage: "at-most-one-unit-grid" };
  const fail = (reason: string) => ({ ...result, reason });
  const f = input.footprint, holes = input.block.holes ?? [], budget = input.terrainSampleBudget ?? Number.MAX_SAFE_INTEGER;
  if (!validPoint(f) || ![f.yaw, f.width, f.depth].every(Number.isFinite) || f.width <= 0 || f.depth <= 0
    || !Number.isSafeInteger(Math.ceil(f.width)) || !Number.isSafeInteger(Math.ceil(f.depth)) || !Number.isSafeInteger(budget) || budget < 0) return fail("invalid-footprint-or-budget");
  if (input.block.polygon.length < 3 || input.block.polygon.some(p => !validPoint(p)) || holes.some(hole => hole.length < 3 || hole.some(p => !validPoint(p)))) return fail("invalid-block-boundary");
  if (input.roads.some(edge => edge.points.length < 2 || !Number.isFinite(edge.width) || edge.width <= 0 || edge.points.some(p => !validPoint(p)))
    || input.roadPolygons?.some(ring => ring.length < 3 || ring.some(p=>!validPoint(p)))
    || input.sites.some(site => !validPoint(site) || !Number.isFinite(site.radius) || site.radius < 0) || input.highways.some(run => run.some(p => !validPoint(p)))) return fail("invalid-obstacle-envelope");
  if (input.cancelled?.()) return fail("cancelled");
  const c = Math.cos(f.yaw), s = Math.sin(f.yaw), at = (x: number, z: number) => ({ x: f.x + c * x + s * z, z: f.z - s * x + c * z });
  result.polygon = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => at(x * f.width / 2, z * f.depth / 2));
  if (result.polygon.some(p => !contains(input.block.polygon, p)) || result.polygon.some((a, i) => ringGap(input.block.polygon, a, result.polygon[(i + 1) % 4]) <= 1e-9)) return fail("rectangle-crosses-block-boundary");
  if (holes.some(hole => result.polygon.some(p => contains(hole, p)) || hole.some(p => contains(result.polygon, p))
    || result.polygon.some((a, i) => ringGap(hole, a, result.polygon[(i + 1) % 4]) <= 1e-9))) return fail("rectangle-crosses-hole");
  for (const edge of input.roads) for (let i = 1; i < edge.points.length; i++) {
    const a = edge.points[i - 1], b = edge.points[i];
    if (contains(result.polygon, a) || contains(result.polygon, b) || ringGap(result.polygon, a, b) < edge.width / 2 + 0.5) return fail("actual-road-capsule-conflict");
  }
  const minX=Math.min(...result.polygon.map(p=>p.x))-0.5, maxX=Math.max(...result.polygon.map(p=>p.x))+0.5;
  const minZ=Math.min(...result.polygon.map(p=>p.z))-0.5, maxZ=Math.max(...result.polygon.map(p=>p.z))+0.5;
  if (input.roadPolygons?.some(ring => {
    if (Math.max(...ring.map(p=>p.x))<minX || Math.min(...ring.map(p=>p.x))>maxX
      || Math.max(...ring.map(p=>p.z))<minZ || Math.min(...ring.map(p=>p.z))>maxZ) return false;
    return ring.some(p=>contains(result.polygon,p)) || result.polygon.some(p=>contains(ring,p))
      || result.polygon.some((a,i)=>ringGap(ring,a,result.polygon[(i+1)%4])<0.5);
  })) return fail("rendered-road-polygon-conflict");
  if (input.sites.some(site => pointGap(result.polygon, site) < site.radius)) return fail("declared-site-circle-conflict");
  for (const run of input.highways) for (let i = 1; i < run.length; i++) if (contains(result.polygon, run[i - 1]) || contains(result.polygon, run[i]) || ringGap(result.polygon, run[i - 1], run[i]) < 6.25) return fail("highway-capsule-conflict");
  const columns = Math.max(1, Math.ceil(f.width)), rows = Math.max(1, Math.ceil(f.depth));
  for (let x = 0; x <= columns; x++) for (let z = 0; z <= rows; z++) {
    if (input.cancelled?.()) return fail("cancelled");
    if (result.terrainSamples >= budget) return fail("terrain-sample-budget-exhausted");
    const p = at(-f.width / 2 + f.width * x / columns, -f.depth / 2 + f.depth * z / rows); result.terrainSamples += 1;
    if (!input.buildable(p.x, p.z) || input.reserved?.(p)) return fail("rectangle-terrain-or-reserve-conflict");
  }
  if (input.cancelled?.()) return fail("cancelled");
  return { ...result, ok: true };
}
