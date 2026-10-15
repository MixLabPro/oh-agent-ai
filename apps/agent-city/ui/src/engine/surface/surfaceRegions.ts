/** Same-layer surface union with curb/island semantics. CPU-only, no THREE/DOM/host.
 *
 * SurfaceIndex 只回答「这个点下面有哪些三角形」，跨 patch 重叠一律 ambiguous——这是对的：
 * 路口扇面、路段带、换宽圆盘在同一 XZ 叠着画，谁当支撑面不能由几何重叠顺序随机决定。
 * 本模块把这件事做成显式规则，而不是在查询层「挑最高」：
 *
 * 1. 合并（alias）只在同 layer、两片段重叠区内**所有叠置顶点**（双方三角形顶点 + 三角边交点，
 *    分段线性高差的极值只可能落在这些点上）的高差都 ≤ aliasTolerance 时成立。实测十五城
 *    规划布局里路口扇面与路段带的叠置高差最大到 0.28（扇面在坡地上只做中点平面检查），
 *    这种对不是 alias，叠置区按 height-conflict 判不可行驶，交给 Agent A 修编译器。
 * 2. 可行驶 = 被某区域成员覆盖、不被渠化岛覆盖、不被边界未解决的车行片段覆盖、不被另一区域
 *    或冲突对同时覆盖。人行道不提供支撑，只把相邻边界标成 curb。
 * 3. 区域边界不是各片段边界环的并集（片段内部互相覆盖的边不是路缘）：所有可能改变可行驶状态
 *    的线段（成员环、岛、未解决片段的全部三角边）在交点处切分，每一小段两侧各偏 sideOffset
 *    重新分类，一侧可行驶、一侧不可行驶才是边界；两侧同区域但高差 > aliasTolerance 是 step。
 *
 * 这里只给出几何候选：没有 portal、没有固体障碍、不认证通行（geometricallyEligibleLength 仍为 0）。
 * 车体覆盖与连续运动验证在 game/driving/surfaceFootprint.ts。 */
import type { SurfaceIndexBuild, SurfaceQueryHit, SurfaceTriangle } from "./SurfaceIndex";
import type { CompiledCitySurface, SurfaceKind, SurfacePatch } from "./types";

/** Bump when classification, merge or boundary rules change; part of AuditKey.queryVersion inputs. */
export const SURFACE_REGION_RULES_VERSION = 1;

export type SurfaceRegionParams = Readonly<{
  /** Max height difference for two overlapping/touching patches to act as one surface. */
  aliasTolerance: number;
  /** Perpendicular probe distance for boundary side classification (world units). */
  sideOffset: number;
  segmentCellSize: number;
  maxSegments: number;
  maxSegmentCellsPerSegment: number;
  maxSplitTests: number;
  maxOverlayTests: number;
  maxClassifications: number;
  maxBoxTriangles: number;
}>;
/** Locked values (spec §13). aliasTolerance 0.1: 十五城叠置高差分布 <0.02 占 97%，0.05–0.1 仍有
 *  数十个点（扇面/带子同坡细分不同），0.1 以上集中在少数路口且最大 0.28 > 轮半径的一半。
 *  0.1 小于 CAR_DIMENSIONS.wheelRadius(0.24) 的一半，作为可连续碾过的接缝上限。 */
export const DEFAULT_SURFACE_REGION_PARAMS: SurfaceRegionParams = Object.freeze({
  aliasTolerance: 0.1,
  sideOffset: 1e-3,
  segmentCellSize: 8,
  maxSegments: 2_000_000,
  maxSegmentCellsPerSegment: 4096,
  maxSplitTests: 40_000_000,
  maxOverlayTests: 40_000_000,
  maxClassifications: 4_000_000,
  maxBoxTriangles: 4096,
});

export type BlockedLabel = "curb" | "closed";
export type RegionBoundaryLabel = BlockedLabel | "step";
export type PointBlockCause = "no-surface" | "sidewalk" | "island" | "unresolved-patch" | "ambiguous-region"
  | "height-conflict" | "budget" | "invalid-input";
export type SurfacePointState =
  | Readonly<{ status: "drivable"; regionId: string; layerId: string; y: number;
      normal: Readonly<{ x: number; y: number; z: number }>; patchId: string; triangleIndex: number }>
  | Readonly<{ status: "blocked"; label: BlockedLabel; cause: PointBlockCause }>;
export type RegionBoundarySegment = Readonly<{
  regionId: string; ax: number; az: number; bx: number; bz: number;
  label: RegionBoundaryLabel; cause: PointBlockCause | "step";
}>;
export type SurfaceRegion = Readonly<{ id: string; layerId: string; patchIds: readonly string[]; boundarySegments: number }>;
export type RegionExclusion = Readonly<{ patchId: string; kind: SurfaceKind; reason: "boundary-unresolved" | "empty" }>;
export type RegionConflict = Readonly<{ a: string; b: string; layerId: string; maxHeightDifference: number }>;
export type SurfaceRegionReport = Readonly<{
  rulesVersion: number; regions: number; memberPatches: number;
  excluded: readonly RegionExclusion[]; conflicts: readonly RegionConflict[];
  aliasPairs: number; maxAliasHeightDifference: number;
  boundaryByLabel: Readonly<Record<RegionBoundaryLabel, number>>;
  islandPatches: number; unresolvedIslandPatches: number;
}>;
export type SegmentBoxResult = Readonly<{ status: "ok"; segments: readonly RegionBoundarySegment[] }> | Readonly<{ status: "budget" | "invalid-input" }>;
export type SurfaceRegionsBuild =
  | Readonly<{ status: "ready"; revision: string; params: SurfaceRegionParams;
      regions: readonly SurfaceRegion[]; report: SurfaceRegionReport;
      regionById: (id: string) => SurfaceRegion | null;
      /** The single authority on drivable/blocked at a point; boundaries are built from it. */
      classify: (x: number, z: number, layerId: string) => SurfacePointState;
      /** All boundary segments of a region, stable order (diagnostics / local overlay). */
      boundaryOf: (regionId: string) => readonly RegionBoundarySegment[];
      /** Boundary segments of one region whose AABB touches the box (exact AABB filter). */
      segmentsInBox: (regionId: string, minX: number, minZ: number, maxX: number, maxZ: number, maxResults: number) => SegmentBoxResult }>
  | Readonly<{ status: "unresolved"; reason: "invalid-input" | "revision-mismatch" | "index-unresolved"
      | "segment-budget" | "split-budget" | "overlay-budget" | "classification-budget" }>;

const DRIVABLE: ReadonlySet<SurfaceKind> = new Set(["carriageway", "junction", "bridge-deck", "ramp", "expressway-deck"]);
const ALL_KINDS: readonly SurfaceKind[] = Object.freeze(["carriageway", "junction", "bridge-deck", "ramp", "expressway-deck", "sidewalk", "island", "decor"]);

type Seg = { ax: number; az: number; bx: number; bz: number };
class BudgetError extends Error { constructor(readonly reason: Extract<SurfaceRegionsBuild, { status: "unresolved" }>["reason"]) { super(reason); } }

function barycentric(t: SurfaceTriangle, x: number, z: number): [number, number, number] | null {
  const d = (t.bz - t.cz) * (t.ax - t.cx) + (t.cx - t.bx) * (t.az - t.cz);
  if (!Number.isFinite(d) || d === 0) return null;
  const wa = ((t.bz - t.cz) * (x - t.cx) + (t.cx - t.bx) * (z - t.cz)) / d;
  const wb = ((t.cz - t.az) * (x - t.cx) + (t.ax - t.cx) * (z - t.cz)) / d;
  return [wa, wb, 1 - wa - wb];
}
const BARY_EPS = 1e-7;
const insideClosed = (w: [number, number, number] | null) => !!w && w[0] >= -BARY_EPS && w[1] >= -BARY_EPS && w[2] >= -BARY_EPS;
const heightAt = (t: SurfaceTriangle, w: [number, number, number]) => w[0] * t.ay + w[1] * t.by + w[2] * t.cy;

/** Parameters on s (0..1) where t touches or crosses it, including collinear overlap ends. */
function splitParams(s: Seg, t: Seg, out: number[]): void {
  const rx = s.bx - s.ax; const rz = s.bz - s.az; const qx = t.bx - t.ax; const qz = t.bz - t.az;
  const rr = rx * rx + rz * rz; const qq = qx * qx + qz * qz;
  if (rr === 0 || qq === 0) return;
  const denom = rx * qz - rz * qx;
  const wx = t.ax - s.ax; const wz = t.az - s.az;
  const tol = 1e-9 * Math.sqrt(rr * qq);
  if (Math.abs(denom) > tol) {
    const u = (wx * qz - wz * qx) / denom; const v = (wx * rz - wz * rx) / denom;
    const e = 1e-9;
    if (u >= -e && u <= 1 + e && v >= -e && v <= 1 + e) out.push(Math.min(1, Math.max(0, u)));
    return;
  }
  // Parallel: only collinear overlaps split s, at t's endpoints projected onto s.
  if (Math.abs(wx * rz - wz * rx) > tol) return;
  for (const [px, pz] of [[t.ax, t.az], [t.bx, t.bz]]) {
    const u = ((px - s.ax) * rx + (pz - s.az) * rz) / rr;
    if (u > 0 && u < 1) out.push(u);
  }
}

/** Overlay vertices of two triangles: each one's vertices inside the other, and edge crossings. */
function overlayPoints(a: SurfaceTriangle, b: SurfaceTriangle, emit: (x: number, z: number) => void): void {
  const av: [number, number][] = [[a.ax, a.az], [a.bx, a.bz], [a.cx, a.cz]];
  const bv: [number, number][] = [[b.ax, b.az], [b.bx, b.bz], [b.cx, b.cz]];
  for (const [x, z] of av) if (insideClosed(barycentric(b, x, z))) emit(x, z);
  for (const [x, z] of bv) if (insideClosed(barycentric(a, x, z))) emit(x, z);
  const params: number[] = [];
  for (let i = 0; i < 3; i++) {
    const s = { ax: av[i][0], az: av[i][1], bx: av[(i + 1) % 3][0], bz: av[(i + 1) % 3][1] };
    for (let j = 0; j < 3; j++) {
      params.length = 0;
      splitParams(s, { ax: bv[j][0], az: bv[j][1], bx: bv[(j + 1) % 3][0], bz: bv[(j + 1) % 3][1] }, params);
      for (const u of params) emit(s.ax + (s.bx - s.ax) * u, s.az + (s.bz - s.az) * u);
    }
  }
}

function triangleOf(patch: SurfacePatch, t: number): SurfaceTriangle {
  const v = patch.vertices; const ia = patch.indices[t * 3] * 3; const ib = patch.indices[t * 3 + 1] * 3; const ic = patch.indices[t * 3 + 2] * 3;
  return { ax: v[ia], ay: v[ia + 1], az: v[ia + 2], bx: v[ib], by: v[ib + 1], bz: v[ib + 2], cx: v[ic], cy: v[ic + 1], cz: v[ic + 2] };
}

/** Builds regions over a snapshot and the ready SurfaceIndex of the SAME revision. */
export function buildSurfaceRegions(snapshot: CompiledCitySurface, index: SurfaceIndexBuild,
  params: SurfaceRegionParams = DEFAULT_SURFACE_REGION_PARAMS): SurfaceRegionsBuild {
  const fail = (reason: Extract<SurfaceRegionsBuild, { status: "unresolved" }>["reason"]): SurfaceRegionsBuild => Object.freeze({ status: "unresolved", reason });
  const positive = [params.aliasTolerance, params.sideOffset, params.segmentCellSize];
  const counts = [params.maxSegments, params.maxSegmentCellsPerSegment, params.maxSplitTests, params.maxOverlayTests, params.maxClassifications, params.maxBoxTriangles];
  if (!positive.every((n) => Number.isFinite(n) && n > 0) || !counts.every((n) => Number.isSafeInteger(n) && n > 0)) return fail("invalid-input");
  if (index.status !== "ready") return fail("index-unresolved");
  if (index.revision !== snapshot.revision) return fail("revision-mismatch");
  try { return build(snapshot, index, params); } catch (error) {
    if (error instanceof BudgetError) return fail(error.reason);
    throw error;
  }
}

function build(snapshot: CompiledCitySurface, index: Extract<SurfaceIndexBuild, { status: "ready" }>, params: SurfaceRegionParams): SurfaceRegionsBuild {
  // Patch membership. A drivable patch without a resolved manifold boundary cannot
  // contribute support: its true covered area/edges are unknown (self-folded ribbons).
  const byId = new Map(snapshot.patches.map((patch) => [patch.id, patch]));
  const members = new Set<string>(); const excluded: RegionExclusion[] = [];
  let islandPatches = 0; let unresolvedIslandPatches = 0;
  for (const patch of [...snapshot.patches].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    if (patch.kind === "island") { islandPatches++; if (!patch.boundaryLoops.length) unresolvedIslandPatches++; }
    if (!DRIVABLE.has(patch.kind)) continue;
    if (!patch.indices.length) excluded.push(Object.freeze({ patchId: patch.id, kind: patch.kind, reason: "empty" }));
    else if (!patch.boundaryLoops.some((loop) => !loop.hole)) excluded.push(Object.freeze({ patchId: patch.id, kind: patch.kind, reason: "boundary-unresolved" }));
    else members.add(patch.id);
  }

  // ── Alias merge: union-find over member pairs, exact overlay-vertex height check ──
  const parent = new Map<string, string>([...members].map((id) => [id, id]));
  const find = (id: string): string => { let r = id; while (parent.get(r) !== r) r = parent.get(r)!; let c = id; while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; } return r; };
  const pairDy = new Map<string, number>();
  const pairKey = (a: string, b: string) => a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
  let overlayTests = 0;
  for (const id of [...members].sort()) {
    const patch = byId.get(id)!;
    for (let t = 0; t < patch.indices.length / 3; t++) {
      const a = triangleOf(patch, t);
      const box = index.trianglesInBox({ minX: Math.min(a.ax, a.bx, a.cx), minZ: Math.min(a.az, a.bz, a.cz), maxX: Math.max(a.ax, a.bx, a.cx), maxZ: Math.max(a.az, a.bz, a.cz),
        layerId: patch.layerId, kinds: [...DRIVABLE], maxResults: params.maxBoxTriangles });
      if (box.status !== "ok") throw new BudgetError("overlay-budget");
      for (const ref of box.triangles) {
        if (ref.patchId <= id || !members.has(ref.patchId)) continue;
        if (++overlayTests > params.maxOverlayTests) throw new BudgetError("overlay-budget");
        const b = index.triangle(ref)!;
        let worst = -1;
        overlayPoints(a, b, (x, z) => {
          const wa = barycentric(a, x, z); const wb = barycentric(b, x, z);
          if (!wa || !wb) { worst = Infinity; return; }
          worst = Math.max(worst, Math.abs(heightAt(a, wa) - heightAt(b, wb)));
        });
        if (worst < 0) continue;
        const key = pairKey(id, ref.patchId);
        pairDy.set(key, Math.max(pairDy.get(key) ?? -1, worst));
      }
    }
  }
  const conflicts: RegionConflict[] = []; let aliasPairs = 0; let maxAlias = 0;
  const conflictSet = new Set<string>();
  for (const [key, dy] of [...pairDy].sort((x, y) => x[0] < y[0] ? -1 : 1)) {
    const [a, b] = key.split("\u0000");
    if (dy <= params.aliasTolerance) { aliasPairs++; maxAlias = Math.max(maxAlias, dy); parent.set(find(a), find(b)); }
    else { conflictSet.add(key); conflicts.push(Object.freeze({ a, b, layerId: byId.get(a)!.layerId, maxHeightDifference: Number.isFinite(dy) ? dy : -1 })); }
  }
  // Stable region identity: the smallest member patch id, never insertion order.
  const groups = new Map<string, string[]>();
  for (const id of members) { const root = find(id); const list = groups.get(root); if (list) list.push(id); else groups.set(root, [id]); }
  const regionOf = new Map<string, string>(); const regionMeta = new Map<string, { layerId: string; patchIds: string[] }>();
  for (const list of groups.values()) {
    list.sort(); const layerId = byId.get(list[0])!.layerId;
    const id = `region:${layerId}:${list[0]}`;
    regionMeta.set(id, { layerId, patchIds: list });
    for (const patchId of list) regionOf.set(patchId, id);
  }

  // ── Point classifier: the one definition of drivable used everywhere ──
  let classifications = 0; let building = true;
  const blocked = (label: BlockedLabel, cause: PointBlockCause): SurfacePointState => Object.freeze({ status: "blocked", label, cause });
  const classify = (x: number, z: number, layerId: string): SurfacePointState => {
    if (building && ++classifications > params.maxClassifications) throw new BudgetError("classification-budget");
    if (!Number.isFinite(x) || !Number.isFinite(z) || typeof layerId !== "string" || !layerId) return blocked("closed", "invalid-input");
    const result = index.query({ x, z, layerId, kinds: ALL_KINDS });
    if (result.status === "miss") return blocked("closed", "no-surface");
    if (result.status !== "hit" && result.status !== "ambiguous") return blocked("closed", result.status);
    const hits = result.status === "hit" ? [result.hit] : result.candidates;
    let sidewalk = false; const drivable: SurfaceQueryHit[] = [];
    for (const hit of hits) {
      if (hit.kind === "island") return blocked("curb", "island");
      if (hit.kind === "sidewalk") sidewalk = true;
      else if (DRIVABLE.has(hit.kind)) {
        if (!members.has(hit.patchId)) return blocked("closed", "unresolved-patch");
        drivable.push(hit);
      }
    }
    if (!drivable.length) return sidewalk ? blocked("curb", "sidewalk") : blocked("closed", "no-surface");
    const region = regionOf.get(drivable[0].patchId)!;
    if (drivable.some((hit) => regionOf.get(hit.patchId) !== region)) return blocked("closed", "ambiguous-region");
    const patchIds = [...new Set(drivable.map((hit) => hit.patchId))];
    for (let i = 0; i < patchIds.length; i++) for (let j = i + 1; j < patchIds.length; j++) {
      if (conflictSet.has(pairKey(patchIds[i], patchIds[j]))) return blocked("closed", "height-conflict");
    }
    let top = drivable[0]; let low = Infinity;
    for (const hit of drivable) {
      low = Math.min(low, hit.point.y);
      if (hit.point.y > top.point.y || (hit.point.y === top.point.y && (hit.patchId < top.patchId || (hit.patchId === top.patchId && hit.triangleIndex < top.triangleIndex)))) top = hit;
    }
    // Defensive: pairwise alias checks bound this, a violation means the merge was wrong.
    if (top.point.y - low > params.aliasTolerance) return blocked("closed", "height-conflict");
    // Support is the upper envelope of aliases (the surface actually drawn on top).
    return Object.freeze({ status: "drivable", regionId: region, layerId, y: top.point.y, normal: top.normal, patchId: top.patchId, triangleIndex: top.triangleIndex });
  };

  // ── Candidate segments: every line across which classify() can change ──
  const layers = new Map<string, Seg[]>();
  let segmentCount = 0;
  const addSeg = (layerId: string, s: Seg, dedupe: Set<string>) => {
    if (s.ax === s.bx && s.az === s.bz) return;
    const key = s.ax < s.bx || (s.ax === s.bx && s.az < s.bz) ? `${s.ax},${s.az},${s.bx},${s.bz}` : `${s.bx},${s.bz},${s.ax},${s.az}`;
    if (dedupe.has(key)) return; dedupe.add(key);
    if (++segmentCount > params.maxSegments) throw new BudgetError("segment-budget");
    let list = layers.get(layerId); if (!list) layers.set(layerId, list = []);
    list.push(s);
  };
  const dedupeByLayer = new Map<string, Set<string>>();
  const dedupeOf = (layerId: string) => { let d = dedupeByLayer.get(layerId); if (!d) dedupeByLayer.set(layerId, d = new Set()); return d; };
  for (const patch of [...snapshot.patches].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    const relevant = members.has(patch.id) || patch.kind === "island" || (DRIVABLE.has(patch.kind) && !members.has(patch.id));
    if (!relevant) continue;
    const dedupe = dedupeOf(patch.layerId);
    if (patch.boundaryLoops.length && (members.has(patch.id) || patch.kind === "island")) {
      for (const loop of patch.boundaryLoops) for (let i = 0; i < loop.vertices.length; i++) {
        const p = loop.vertices[i]; const q = loop.vertices[(i + 1) % loop.vertices.length];
        addSeg(patch.layerId, { ax: p.x, az: p.z, bx: q.x, bz: q.z }, dedupe);
      }
    } else {
      // Unknown boundary: every triangle edge is a potential coverage change.
      for (let t = 0; t < patch.indices.length / 3; t++) {
        const tri = triangleOf(patch, t);
        addSeg(patch.layerId, { ax: tri.ax, az: tri.az, bx: tri.bx, bz: tri.bz }, dedupe);
        addSeg(patch.layerId, { ax: tri.bx, az: tri.bz, bx: tri.cx, bz: tri.cz }, dedupe);
        addSeg(patch.layerId, { ax: tri.cx, az: tri.cz, bx: tri.ax, bz: tri.az }, dedupe);
      }
    }
  }

  // ── Arrangement split + two-sided classification ──
  const cell = params.segmentCellSize;
  const cellsOf = (s: Seg, pad = 0): [number, number, number, number] => [
    Math.floor((Math.min(s.ax, s.bx) - pad) / cell), Math.floor((Math.min(s.az, s.bz) - pad) / cell),
    Math.floor((Math.max(s.ax, s.bx) + pad) / cell), Math.floor((Math.max(s.az, s.bz) + pad) / cell)];
  const boundary: RegionBoundarySegment[] = []; const boundaryKeys = new Set<string>();
  let splitTests = 0;
  for (const [layerId, segs] of [...layers].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    const grid = new Map<string, number[]>();
    segs.forEach((s, i) => {
      const [x0, z0, x1, z1] = cellsOf(s);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > params.maxSegmentCellsPerSegment) throw new BudgetError("segment-budget");
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = `${x}:${z}`; const b = grid.get(k); if (b) b.push(i); else grid.set(k, [i]); }
    });
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]; const ts = [0, 1];
      const [x0, z0, x1, z1] = cellsOf(s); const seen = new Set<number>();
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (const j of grid.get(`${x}:${z}`) ?? []) {
        if (j === i || seen.has(j)) continue; seen.add(j);
        if (++splitTests > params.maxSplitTests) throw new BudgetError("split-budget");
        splitParams(s, segs[j], ts);
      }
      ts.sort((a, b) => a - b);
      const dx = s.bx - s.ax; const dz = s.bz - s.az; const length = Math.hypot(dx, dz);
      const nx = -dz / length; const nz = dx / length;
      for (let k = 1; k < ts.length; k++) {
        const u0 = ts[k - 1]; const u1 = ts[k];
        if ((u1 - u0) * length < 1e-6) continue;
        const um = (u0 + u1) / 2; const mx = s.ax + dx * um; const mz = s.az + dz * um;
        const left = classify(mx + nx * params.sideOffset, mz + nz * params.sideOffset, layerId);
        const right = classify(mx - nx * params.sideOffset, mz - nz * params.sideOffset, layerId);
        const ax = s.ax + dx * u0; const az = s.az + dz * u0; const bx = s.ax + dx * u1; const bz = s.az + dz * u1;
        const emit = (regionId: string, label: RegionBoundaryLabel, cause: RegionBoundarySegment["cause"]) => {
          const key = `${regionId}|${label}|${ax < bx || (ax === bx && az < bz) ? [ax, az, bx, bz] : [bx, bz, ax, az]}`;
          if (boundaryKeys.has(key)) return; boundaryKeys.add(key);
          boundary.push(Object.freeze({ regionId, ax, az, bx, bz, label, cause }));
        };
        if (left.status === "drivable" && right.status === "drivable") {
          if (left.regionId !== right.regionId) { emit(left.regionId, "closed", "ambiguous-region"); emit(right.regionId, "closed", "ambiguous-region"); }
          else if (Math.abs(left.y - right.y) > params.aliasTolerance) emit(left.regionId, "step", "step");
        } else if (left.status === "drivable" && right.status === "blocked") emit(left.regionId, right.label, right.cause);
        else if (right.status === "drivable" && left.status === "blocked") emit(right.regionId, left.label, left.cause);
      }
    }
  }
  building = false;

  // ── Boundary segment grid for footprint queries ──
  const segGrid = new Map<string, number[]>();
  boundary.forEach((s, i) => {
    const [x0, z0, x1, z1] = cellsOf(s);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = `${x}:${z}`; const b = segGrid.get(k); if (b) b.push(i); else segGrid.set(k, [i]); }
  });
  const perRegion = new Map<string, number>();
  const byLabel: Record<RegionBoundaryLabel, number> = { curb: 0, closed: 0, step: 0 };
  for (const s of boundary) { perRegion.set(s.regionId, (perRegion.get(s.regionId) ?? 0) + 1); byLabel[s.label]++; }
  const regions = Object.freeze([...regionMeta].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([id, meta]) => Object.freeze({
    id, layerId: meta.layerId, patchIds: Object.freeze(meta.patchIds), boundarySegments: perRegion.get(id) ?? 0 })));
  const regionIndex = new Map(regions.map((region) => [region.id, region]));
  const segmentsInBox = (regionId: string, minX: number, minZ: number, maxX: number, maxZ: number, maxResults: number): SegmentBoxResult => {
    if (!regionIndex.has(regionId) || ![minX, minZ, maxX, maxZ].every(Number.isFinite) || minX > maxX || minZ > maxZ || !Number.isSafeInteger(maxResults) || maxResults < 1) return Object.freeze({ status: "invalid-input" });
    const [x0, z0, x1, z1] = cellsOf({ ax: minX, az: minZ, bx: maxX, bz: maxZ });
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > params.maxSegmentCellsPerSegment) return Object.freeze({ status: "budget" });
    const seen = new Set<number>(); const out: RegionBoundarySegment[] = [];
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (const i of segGrid.get(`${x}:${z}`) ?? []) {
      if (seen.has(i)) continue; seen.add(i);
      const s = boundary[i];
      if (s.regionId !== regionId || Math.max(s.ax, s.bx) < minX || Math.min(s.ax, s.bx) > maxX || Math.max(s.az, s.bz) < minZ || Math.min(s.az, s.bz) > maxZ) continue;
      if (out.length >= maxResults) return Object.freeze({ status: "budget" });
      out.push(s);
    }
    return Object.freeze({ status: "ok", segments: Object.freeze(out) });
  };
  const byRegion = new Map<string, RegionBoundarySegment[]>();
  for (const s of boundary) { const list = byRegion.get(s.regionId); if (list) list.push(s); else byRegion.set(s.regionId, [s]); }
  const boundaryOf = (regionId: string) => Object.freeze([...(byRegion.get(regionId) ?? [])]);
  const report: SurfaceRegionReport = Object.freeze({
    rulesVersion: SURFACE_REGION_RULES_VERSION, regions: regions.length, memberPatches: members.size,
    excluded: Object.freeze(excluded), conflicts: Object.freeze(conflicts), aliasPairs, maxAliasHeightDifference: maxAlias,
    boundaryByLabel: Object.freeze(byLabel), islandPatches, unresolvedIslandPatches });
  return Object.freeze({ status: "ready", revision: snapshot.revision, params, regions, report,
    regionById: (id: string) => regionIndex.get(id) ?? null, classify, boundaryOf, segmentsInBox });
}
