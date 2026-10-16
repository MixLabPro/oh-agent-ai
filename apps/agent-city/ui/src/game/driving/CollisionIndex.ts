/** Static solid obstacles for driving: buildings, landmarks, railings, piers, truss bars, islands and
 * structure deck slabs. Pure CPU; no THREE, DOM or host (THREE scene capture lives in
 * engine/surface/sceneSolids.ts and hands plain numbers in).
 *
 * 为什么不是「XZ 多边形 + y 区间」：桥面板、匝道板、护栏都是倾斜的长盒子，用整体 y 区间判，
 * 车开在匝道板上会撞到同一块板高处那端的「区间」。这里每个固体都是凸多面体（平行六面体或
 * 竖直凸棱柱），车身是按支撑面 pitch/roll 摆好的有向盒，两者用分离轴定理精确判交：
 * 面法线（各 3 / 棱柱 n+2）+ 双方棱方向两两叉积。触碰即相交（闭集），与区域边界的「触碰即拦」一致。
 *
 * 净空（立交桥下、匝道下）也由这里判：结构板本身就是固体，地面上的车身顶到板底即碰撞。
 * 区域层只回答「车轮下有没有面」，从来不回答「车顶上有没有东西」。 */

export const COLLISION_RULES_VERSION = 1;

export type V3 = Readonly<{ x: number; y: number; z: number }>;
/** Parallelepiped: centre and three half-edge vectors (an OBB when orthogonal; sheared transforms stay exact). */
export type BoxSolidInput = Readonly<{ id: string; role: string; kind: "box"; center: V3; halfAxes: readonly [V3, V3, V3] }>;
/** Vertical prism over a convex XZ ring (any winding; non-convex input is replaced by its hull). */
export type PrismSolidInput = Readonly<{ id: string; role: string; kind: "prism"; ring: readonly Readonly<{ x: number; z: number }>[]; yMin: number; yMax: number }>;
export type SolidInput = BoxSolidInput | PrismSolidInput;

type Poly = { vertices: V3[]; faces: V3[]; edges: V3[] };
export type Solid = Readonly<{ id: string; role: string; minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number; poly: Poly }>;
export type CollisionParams = Readonly<{ cellSize: number; maxCellsPerSolid: number; maxCandidates: number }>;
export const DEFAULT_COLLISION_PARAMS: CollisionParams = Object.freeze({ cellSize: 8, maxCellsPerSolid: 4096, maxCandidates: 4096 });
export type CollisionReport = Readonly<{ rulesVersion: number; solids: number; rejected: number; byRole: Readonly<Record<string, number>> }>;
export type CollisionHit = Readonly<{ status: "hit"; solid: Solid }> | Readonly<{ status: "clear" }> | Readonly<{ status: "budget" | "invalid-input" }>;

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const finite = (v: V3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/** Convex polytope of a parallelepiped (8 corners, 3 face normals, 3 edge directions). */
export function boxPoly(center: V3, h: readonly [V3, V3, V3]): Poly {
  const vertices: V3[] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) {
    vertices.push({ x: center.x + a * h[0].x + b * h[1].x + c * h[2].x, y: center.y + a * h[0].y + b * h[1].y + c * h[2].y, z: center.z + a * h[0].z + b * h[1].z + c * h[2].z });
  }
  return { vertices, faces: [cross(h[1], h[2]), cross(h[2], h[0]), cross(h[0], h[1])], edges: [h[0], h[1], h[2]] };
}
function hull2(points: readonly Readonly<{ x: number; z: number }>[]) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  const c = (o: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower: { x: number; z: number }[] = []; for (const p of pts) { while (lower.length >= 2 && c(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper: { x: number; z: number }[] = []; for (const p of [...pts].reverse()) { while (upper.length >= 2 && c(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function prismPoly(ring: readonly Readonly<{ x: number; z: number }>[], yMin: number, yMax: number): Poly | null {
  const h = hull2(ring);
  if (h.length < 3) return null;
  const vertices: V3[] = [...h.map((p) => ({ x: p.x, y: yMin, z: p.z })), ...h.map((p) => ({ x: p.x, y: yMax, z: p.z }))];
  const edges: V3[] = [{ x: 0, y: 1, z: 0 }];
  const faces: V3[] = [{ x: 0, y: 1, z: 0 }];
  for (let i = 0; i < h.length; i++) {
    const a = h[i]; const b = h[(i + 1) % h.length]; const e = { x: b.x - a.x, y: 0, z: b.z - a.z };
    edges.push(e); faces.push({ x: -e.z, y: 0, z: e.x });
  }
  return { vertices, faces, edges };
}
/** Separating-axis test between two convex polytopes; touching counts as intersecting. */
export function polytopesIntersect(a: Poly, b: Poly): boolean {
  const axes: V3[] = [...a.faces, ...b.faces];
  for (const ea of a.edges) for (const eb of b.edges) axes.push(cross(ea, eb));
  for (const axis of axes) {
    const len = Math.hypot(axis.x, axis.y, axis.z);
    if (len < 1e-12) continue; // parallel edges: covered by the face axes
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const v of a.vertices) { const d = dot(v, axis); if (d < aMin) aMin = d; if (d > aMax) aMax = d; }
    for (const v of b.vertices) { const d = dot(v, axis); if (d < bMin) bMin = d; if (d > bMax) bMax = d; }
    const slack = 1e-9 * len * (1 + Math.abs(aMin) / len + Math.abs(bMin) / len);
    if (aMax < bMin - slack || bMax < aMin - slack) return false;
  }
  return true;
}

export type CollisionIndex = Readonly<{
  report: CollisionReport;
  /** First solid (stable: lowest id) intersecting the body. */
  hit: (body: Poly) => CollisionHit;
  solids: () => readonly Solid[];
}>;

export function buildCollisionIndex(inputs: readonly SolidInput[], params: CollisionParams = DEFAULT_COLLISION_PARAMS): CollisionIndex {
  const solids: Solid[] = []; let rejected = 0; const byRole: Record<string, number> = {};
  for (const input of [...inputs].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    let poly: Poly | null = null;
    if (input.kind === "box" && finite(input.center) && input.halfAxes.every(finite)) {
      const volume = Math.abs(dot(input.halfAxes[0], cross(input.halfAxes[1], input.halfAxes[2])));
      poly = volume > 1e-12 ? boxPoly(input.center, input.halfAxes) : null;
    } else if (input.kind === "prism" && Number.isFinite(input.yMin) && Number.isFinite(input.yMax) && input.yMax > input.yMin && input.ring.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z))) {
      poly = prismPoly(input.ring, input.yMin, input.yMax);
    }
    if (!poly) { rejected++; continue; }
    const xs = poly.vertices.map((v) => v.x), ys = poly.vertices.map((v) => v.y), zs = poly.vertices.map((v) => v.z);
    solids.push(Object.freeze({ id: input.id, role: input.role, minX: Math.min(...xs), minY: Math.min(...ys), minZ: Math.min(...zs), maxX: Math.max(...xs), maxY: Math.max(...ys), maxZ: Math.max(...zs), poly }));
    byRole[input.role] = (byRole[input.role] ?? 0) + 1;
  }
  const cell = params.cellSize; const grid = new Map<string, number[]>();
  const cells = (minX: number, minZ: number, maxX: number, maxZ: number) => [Math.floor(minX / cell), Math.floor(minZ / cell), Math.floor(maxX / cell), Math.floor(maxZ / cell)];
  const oversized: number[] = [];
  solids.forEach((s, i) => {
    const [x0, z0, x1, z1] = cells(s.minX, s.minZ, s.maxX, s.maxZ);
    // Huge solids (a sea mountain) go to a short always-tested list instead of thousands of cells.
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > params.maxCellsPerSolid) { oversized.push(i); return; }
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = `${x}:${z}`; const b = grid.get(k); if (b) b.push(i); else grid.set(k, [i]); }
  });
  const hit = (body: Poly): CollisionHit => {
    if (!body.vertices.length || !body.vertices.every(finite)) return Object.freeze({ status: "invalid-input" });
    const xs = body.vertices.map((v) => v.x), ys = body.vertices.map((v) => v.y), zs = body.vertices.map((v) => v.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const [x0, z0, x1, z1] = cells(minX, minZ, maxX, maxZ);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > params.maxCellsPerSolid) return Object.freeze({ status: "budget" });
    const seen = new Set<number>(oversized);
    const candidates = [...oversized];
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (const i of grid.get(`${x}:${z}`) ?? []) {
      if (seen.has(i)) continue; seen.add(i); candidates.push(i);
      if (candidates.length > params.maxCandidates) return Object.freeze({ status: "budget" });
    }
    candidates.sort((a, b) => a - b);
    for (const i of candidates) {
      const s = solids[i];
      if (s.maxX < minX || s.minX > maxX || s.maxY < minY || s.minY > maxY || s.maxZ < minZ || s.minZ > maxZ) continue;
      if (polytopesIntersect(body, s.poly)) return Object.freeze({ status: "hit", solid: s });
    }
    return Object.freeze({ status: "clear" });
  };
  return Object.freeze({ report: Object.freeze({ rulesVersion: COLLISION_RULES_VERSION, solids: solids.length, rejected, byRole: Object.freeze(byRole) }), hit, solids: () => solids });
}

/** Solid inputs from 8 box corners in boxCorners() order (lx ∈ ±½ → ly ∈ {0,1} → lz ∈ ±½). */
export function boxSolidFromCorners(id: string, role: string, c: readonly V3[]): BoxSolidInput {
  const half = (a: V3, b: V3): V3 => ({ x: (b.x - a.x) / 2, y: (b.y - a.y) / 2, z: (b.z - a.z) / 2 });
  const center = c.reduce((n, p) => ({ x: n.x + p.x / 8, y: n.y + p.y / 8, z: n.z + p.z / 8 }), { x: 0, y: 0, z: 0 });
  return Object.freeze({ id, role, kind: "box", center, halfAxes: [half(c[0], c[4]), half(c[0], c[2]), half(c[0], c[1])] as const });
}

/** Vehicle body: bottom clearance and roof above the support plane, footprint margins horizontally. */
export type BodyParams = Readonly<{ bottom: number; top: number }>;
/** bottom 0.1 ≈ 0.4 × wheel radius (road paint 0.025–0.05 and the 0.04 road lift never reach it);
 *  top = car height 1.15 + 0.1 vertical margin. */
export const DEFAULT_BODY_PARAMS: BodyParams = Object.freeze({ bottom: 0.1, top: 1.25 });

/** The car's oriented body box at a support pose; `grow` widens it horizontally (swept sample) and
 * `lift` extends it vertically both ways (height change across the sample). */
export function carBody(pose: Readonly<{ x: number; z: number; heading: number }>, support: Readonly<{ y: number; pitch: number; roll: number }>,
  halfLength: number, halfWidth: number, body: BodyParams = DEFAULT_BODY_PARAMS, grow = 0, lift = 0): Poly {
  const ch = Math.cos(pose.heading), sh = Math.sin(pose.heading);
  const cp = Math.cos(support.pitch), sp = Math.sin(support.pitch), cr = Math.cos(support.roll), sr = Math.sin(support.roll);
  const f0 = { x: ch, y: 0, z: sh }; const l0 = { x: -sh, y: 0, z: ch }; const up = { x: 0, y: 1, z: 0 };
  // Pitch > 0: front higher; roll > 0: left (+l, the footprint's w = +1 side) higher.
  const f = { x: f0.x * cp + up.x * sp, y: f0.y * cp + up.y * sp, z: f0.z * cp + up.z * sp };
  const u1 = { x: up.x * cp - f0.x * sp, y: up.y * cp - f0.y * sp, z: up.z * cp - f0.z * sp };
  const l = { x: l0.x * cr + u1.x * sr, y: l0.y * cr + u1.y * sr, z: l0.z * cr + u1.z * sr };
  const u = { x: u1.x * cr - l0.x * sr, y: u1.y * cr - l0.y * sr, z: u1.z * cr - l0.z * sr };
  const mid = (body.bottom + body.top) / 2; const hh = (body.top - body.bottom) / 2 + lift;
  const center = { x: pose.x + u.x * mid, y: support.y + u.y * mid, z: pose.z + u.z * mid };
  const scale = (v: V3, k: number): V3 => ({ x: v.x * k, y: v.y * k, z: v.z * k });
  return boxPoly(center, [scale(f, halfLength + grow), scale(l, halfWidth + grow), scale(u, hh)]);
}
export type { Poly as CollisionPoly };
