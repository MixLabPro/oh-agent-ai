/** Exact conforming split of road polygons against the rendered terrain triangulation.
 * Pure CPU: no THREE, host or layout runtime.
 *
 * 渲染地形是 extent/192 网格上的分段线性面（每格对角线连 (ix, iz+1)–(ix+1, iz)，即 gx+gz=整数）。
 * 路面若要处处贴地，三角形就必须落在单个地形三角形里——按容差逐级加密在陡坡上会把顶点堆到 25 万
 * 仍贴不住（2026-10 实测），所以不贴地的路面四边形/扇区直接按地形三角形裁成凸片：偏差为 0，
 * 顶点数与跨过的地形三角形数成正比。
 *
 * 不产生裂缝的关键是**规范点**：凸片的顶点只可能是多边形角点、多边形边与地形线的交点、多边形内的
 * 地形顶点。交点由 `edgeCrossings` 统一计算（端点按字典序规范化，正反两向结果逐位相同），
 * Sutherland–Hodgman 的原始输出再吸附到这些规范点上，相邻片/相邻条带共享边的顶点因此逐位一致，
 * 不会出现 T 形接点。 */

export type TerrainGrid = Readonly<{ cellSize: number; half: number }>;
export type ClipPoint = { readonly x: number; readonly z: number };

const lexLess = (a: ClipPoint, b: ClipPoint) => a.x < b.x || (a.x === b.x && a.z < b.z);

/** Interior crossings of segment p→q with terrain lines (x, z and diagonal families), ordered from p. */
export function edgeCrossings(grid: TerrainGrid, p: ClipPoint, q: ClipPoint): ClipPoint[] {
  const flip = lexLess(q, p);
  const a = flip ? q : p; const b = flip ? p : q;
  const g = (v: number) => (v + grid.half) / grid.cellSize;
  const ts: number[] = [];
  for (const [u0, u1] of [[g(a.x), g(b.x)], [g(a.z), g(b.z)], [g(a.x) + g(a.z), g(b.x) + g(b.z)]]) {
    if (u0 === u1) continue;
    for (let k = Math.ceil(Math.min(u0, u1)); k <= Math.floor(Math.max(u0, u1)); k += 1) {
      const t = (k - u0) / (u1 - u0);
      if (t > 1e-12 && t < 1 - 1e-12) ts.push(t);
    }
  }
  ts.sort((x, y) => x - y);
  const out: ClipPoint[] = [];
  for (const t of ts) {
    if (out.length && t - (out[out.length - 1] as ClipPoint & { t: number }).t < 1e-12) continue;
    out.push(Object.assign({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, { t }));
  }
  const points = out.map(({ x, z }) => ({ x, z }));
  return flip ? points.reverse() : points;
}

/** Terrain vertices strictly inside a convex polygon (either winding). */
function interiorTerrainVertices(grid: TerrainGrid, polygon: readonly ClipPoint[]): ClipPoint[] {
  const xs = polygon.map((p) => p.x); const zs = polygon.map((p) => p.z);
  const i0 = Math.ceil((Math.min(...xs) + grid.half) / grid.cellSize); const i1 = Math.floor((Math.max(...xs) + grid.half) / grid.cellSize);
  const j0 = Math.ceil((Math.min(...zs) + grid.half) / grid.cellSize); const j1 = Math.floor((Math.max(...zs) + grid.half) / grid.cellSize);
  const sign = Math.sign(signedArea(polygon));
  const out: ClipPoint[] = [];
  for (let i = i0; i <= i1; i += 1) for (let j = j0; j <= j1; j += 1) {
    const p = { x: -grid.half + i * grid.cellSize, z: -grid.half + j * grid.cellSize };
    let inside = true;
    for (let k = 0; k < polygon.length && inside; k += 1) {
      const a = polygon[k]; const b = polygon[(k + 1) % polygon.length];
      inside = sign * ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) > 1e-9;
    }
    if (inside) out.push(p);
  }
  return out;
}
export function signedArea(polygon: readonly ClipPoint[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) { const a = polygon[i]; const b = polygon[(i + 1) % polygon.length]; area += a.x * b.z - b.x * a.z; }
  return area / 2;
}

/** Boundary of a convex polygon with every terrain-line crossing inserted (canonical points). */
export function refinedBoundary<T extends ClipPoint>(grid: TerrainGrid, corners: readonly T[]): (T | ClipPoint)[] {
  const out: (T | ClipPoint)[] = [];
  for (let k = 0; k < corners.length; k += 1) { out.push(corners[k]); out.push(...edgeCrossings(grid, corners[k], corners[(k + 1) % corners.length])); }
  return out;
}

/** Splits a convex polygon into convex pieces each lying inside one terrain triangle.
 * Returned pieces reference the canonical point objects (corners passed in, edge crossings
 * from `edgeCrossings`, interior terrain vertices), so shared vertices compare by identity. */
export function clipConvexToTerrain<T extends ClipPoint>(grid: TerrainGrid, corners: readonly T[]): (T | ClipPoint)[][] {
  const boundary = refinedBoundary(grid, corners);
  const canonical: (T | ClipPoint)[] = [...boundary, ...interiorTerrainVertices(grid, corners)];
  const scale = grid.cellSize * 1e-7;
  const snap = (p: ClipPoint): T | ClipPoint => {
    let best: T | ClipPoint | null = null; let bestD = Infinity;
    for (const c of canonical) { const d = Math.abs(c.x - p.x) + Math.abs(c.z - p.z); if (d < bestD) { bestD = d; best = c; } }
    return best && bestD <= scale ? best : p;
  };
  const xs = corners.map((p) => p.x); const zs = corners.map((p) => p.z);
  const gx0 = Math.floor((Math.min(...xs) + grid.half) / grid.cellSize); const gx1 = Math.floor((Math.max(...xs) + grid.half) / grid.cellSize);
  const gz0 = Math.floor((Math.min(...zs) + grid.half) / grid.cellSize); const gz1 = Math.floor((Math.max(...zs) + grid.half) / grid.cellSize);
  const g = (p: ClipPoint) => ({ gx: (p.x + grid.half) / grid.cellSize, gz: (p.z + grid.half) / grid.cellSize });
  const clip = (poly: ClipPoint[], f: (p: ClipPoint) => number): ClipPoint[] => {
    const out: ClipPoint[] = [];
    for (let k = 0; k < poly.length; k += 1) {
      const a = poly[k]; const b = poly[(k + 1) % poly.length]; const fa = f(a); const fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }); }
    }
    return out;
  };
  const pieces: (T | ClipPoint)[][] = [];
  for (let ix = gx0; ix <= gx1; ix += 1) for (let iz = gz0; iz <= gz1; iz += 1) {
    for (const upper of [false, true]) {
      let poly: ClipPoint[] = [...corners];
      const s = ix + iz + 1;
      const planes: ((p: ClipPoint) => number)[] = upper
        ? [(p) => ix + 1 - g(p).gx, (p) => iz + 1 - g(p).gz, (p) => g(p).gx + g(p).gz - s]
        : [(p) => g(p).gx - ix, (p) => g(p).gz - iz, (p) => s - g(p).gx - g(p).gz];
      for (const plane of planes) { poly = clip(poly, plane); if (poly.length < 3) break; }
      if (poly.length < 3) continue;
      const snapped: (T | ClipPoint)[] = [];
      for (const p of poly) { const c = snap(p); if (snapped[snapped.length - 1] !== c && snapped[0] !== c) snapped.push(c); }
      if (snapped.length >= 3 && Math.abs(signedArea(snapped)) > grid.cellSize * grid.cellSize * 1e-10) pieces.push(snapped);
    }
  }
  return pieces;
}

/** Triangles of one convex piece. Fans from a vertex only when no three consecutive points are
 * collinear (otherwise the skipped edge would leave a T-junction); else from an added centroid. */
export function triangulateConvex<P extends ClipPoint>(piece: readonly P[], centroid: () => P): [P, P, P][] {
  if (piece.length === 3) return [[piece[0], piece[1], piece[2]]];
  const scale = Math.max(...piece.map((p) => Math.abs(p.x) + Math.abs(p.z)), 1);
  const collinear = piece.some((b, k) => {
    const a = piece[(k + piece.length - 1) % piece.length]; const c = piece[(k + 1) % piece.length];
    return Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) <= 1e-12 * scale * scale;
  });
  if (!collinear) return piece.slice(1, -1).map((p, k) => [piece[0], p, piece[k + 2]]);
  const c = centroid();
  return piece.map((p, k) => [c, p, piece[(k + 1) % piece.length]]);
}
