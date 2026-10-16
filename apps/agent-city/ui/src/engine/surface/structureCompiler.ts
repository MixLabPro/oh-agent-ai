/** Pure structure descriptors shared by the road renderer and the driving surface.
 * CPU-only: no THREE, DOM, host or layout runtime (type-only CityLayout import).
 *
 * 桥面、高架、桁架、渠化口、尽端回车圈原来各自在 roadSystem 里边算边往 THREE 实例矩阵里写，
 * 驾驶要么另算一份（第二份几何，迟早与渲染分叉），要么凭 highways 折线补造路面（spec §3 明令禁止）。
 * 现在几何只在这里算一次：渲染按描述符原样组矩阵（实例矩阵逐字节不变，有守卫），驾驶取同一描述符
 * 的 BOX 顶面——按实例的缩放、Euler 旋转（XYZ / YZX / YXZ，与 THREE.Euler 同公式）和平移变换，
 * 不按 deckHeights + 厚度猜曲面。护栏、桥墩、桁架是静态障碍，不是可行驶面。 */
import type { CityLayout, RoadEdge, Vec2 } from "../cityLayout";
import { renderRoadEdges } from "../cityRoadJunctions";
import { channelizedTPlan, type ChannelizedArm } from "../cityRoadPaint";
import { EXPRESSWAY_DECK_THICKNESS, EXPRESSWAY_DECK_WIDTH, EXPRESSWAY_RAMP, expresswayDeckHeights } from "./structureProfiles";
import { terrainSurfaceHeight } from "./terrainSampling";

/** Road surface lift (same constant as groundRoadCompiler.ROAD_SURFACE_LIFT; kept here to avoid a cycle). */
const ROAD_LIFT = 0.04;

export type EulerOrder = "XYZ" | "YZX" | "YXZ";
export type StructureRole = "bridge-deck" | "bridge-railing" | "bridge-lane-line" | "bridge-dash" | "bridge-pier"
  | "expressway-pier" | "expressway-deck" | "expressway-lane-line" | "expressway-rail" | "truss";
/** One unit-BOX instance (BOX = BoxGeometry(1,1,1) translated so its base is at local y=0). */
export type BoxPart = Readonly<{
  x: number; y: number; z: number; sx: number; sy: number; sz: number;
  rx: number; ry: number; rz: number; order: EulerOrder; color: string; role: StructureRole;
}>;
type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

/** Row-major rotation matrix, same formulas as THREE.Matrix4.makeRotationFromEuler. */
export function eulerMatrix(x: number, y: number, z: number, order: EulerOrder): Mat3 {
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
  if (order === "XYZ") {
    const ae = a * e, af = a * f, be = b * e, bf = b * f;
    return [c * e, -c * f, d, af + be * d, ae - bf * d, -b * c, bf - ae * d, be + af * d, a * c];
  }
  if (order === "YZX") {
    const ac = a * c, ad = a * d, bc = b * c, bd = b * d;
    return [c * e, bd - ac * f, bc * f + ad, f, a * e, -b * e, -d * e, ad * f + bc, ac - bd * f];
  }
  const ce = c * e, cf = c * f, de = d * e, df = d * f;
  return [ce + df * b, de * b - cf, a * d, a * f, a * e, -b, cf * b - de, df + ce * b, a * c];
}
/** World position of a local unit-BOX point (x,z ∈ [−½,½], y ∈ [0,1]). */
export function boxPoint(part: BoxPart, lx: number, ly: number, lz: number): { x: number; y: number; z: number } {
  const m = eulerMatrix(part.rx, part.ry, part.rz, part.order);
  const px = lx * part.sx, py = ly * part.sy, pz = lz * part.sz;
  return { x: part.x + m[0] * px + m[1] * py + m[2] * pz, y: part.y + m[3] * px + m[4] * py + m[5] * pz, z: part.z + m[6] * px + m[7] * py + m[8] * pz };
}
/** The eight corners (obstacle hull) of a BOX instance. */
export function boxCorners(part: BoxPart) {
  return [-0.5, 0.5].flatMap((lx) => [0, 1].flatMap((ly) => [-0.5, 0.5].map((lz) => boxPoint(part, lx, ly, lz))));
}
/** Drivable top face: local y = 1, laterally inset to `innerHalf` world units from the centreline. */
export function boxTopFace(part: BoxPart, innerHalf = part.sz / 2) {
  const lz = Math.min(0.5, innerHalf / part.sz);
  return [boxPoint(part, -0.5, 1, -lz), boxPoint(part, 0.5, 1, -lz), boxPoint(part, 0.5, 1, lz), boxPoint(part, -0.5, 1, lz)];
}

type Terrain = Pick<CityLayout, "terrain">["terrain"];
type BridgeLayoutInput = Pick<CityLayout, "terrain" | "extent" | "roadEdges">;
const part = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, role: StructureRole, ry = 0, rz = 0, order: EulerOrder = "XYZ", rx = 0): BoxPart =>
  Object.freeze({ x, y, z, sx, sy, sz, rx, ry, rz, order, color, role });

/** Endpoints of ordinary (non-deck) render road edges, cached per road array. */
const groundEnds = new WeakMap<object, Vec2[]>();
function landsOnRoad(layout: BridgeLayoutInput, p: Vec2): boolean {
  if (!Array.isArray(layout.roadEdges)) return false; // no road data: nothing to land on (old level deck)
  let ends = groundEnds.get(layout.roadEdges);
  if (!ends) { ends = renderRoadEdges(layout.roadEdges).filter((e) => !e.bridge && e.structure !== "deck").flatMap((e) => [e.points[0], e.points[e.points.length - 1]]); groundEnds.set(layout.roadEdges, ends); }
  return ends.some((q) => Math.abs(q.x - p.x) < 0.01 && Math.abs(q.z - p.z) < 0.01);
}
/** Bridge deck top profile: each end that lands on a road meets the RENDERED road surface there
 * (terrain triangulation + road lift); an end with no road keeps the landed end's height (an end
 * over open water must not dip into it); with no landing at all the old level deck remains.
 * 曾是一块平板，顶面取两岸 terrain.height 真值的较大者：低岸一端高出引道 0.1–1.1，引道坡度又可达 ~6°，
 * 桥头路面不是戳出桥面就是一道台阶（十五城 28 座桥没有一座两端都接得上）。 */
export function bridgeDeckProfile(layout: BridgeLayoutInput, from: Vec2, to: Vec2, width = 0, levelFloor = -Infinity) {
  const level = Math.max(levelFloor, layout.terrain.height(from.x, from.z), layout.terrain.height(to.x, to.z));
  const fromLands = landsOnRoad(layout, from); const toLands = landsOnRoad(layout, to);
  const road = (p: Vec2) => terrainSurfaceHeight(layout, p.x, p.z) + ROAD_LIFT;
  const ya = fromLands ? road(from) : toLands ? road(to) : level;
  const yb = toLands ? road(to) : fromLands ? road(from) : level;
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const pitch = Math.atan2(yb - ya, length);
  // Cross slope: the landed road surfaces lean sideways; a level-across deck left their edges
  // 0.11–0.15 above it. A box cannot twist, so it takes the mean lean of its landed ends.
  const nx = -(to.z - from.z) / length; const nz = (to.x - from.x) / length; const half = width / 2;
  const lean = (p: Vec2) => half > 0 ? (road({ x: p.x + nx * half, z: p.z + nz * half }) - road({ x: p.x - nx * half, z: p.z - nz * half })) / width : 0;
  const leans = [fromLands ? lean(from) : null, toLands ? lean(to) : null].filter((v): v is number => v !== null);
  const crossSlope = leans.length ? leans.reduce((n, v) => n + v, 0) / leans.length : 0;
  return Object.freeze({ ya, yb, length, pitch, crossSlope, fromLands, toLands, slant: Math.hypot(length, yb - ya), at: (t: number) => ya + (yb - ya) * t });
}
/** Edge bridge (straight span): deck slab, railings, lane lines, dashes, piers — the parts
 * buildInfrastructure draws, in its order, all standing on the slab's actual top face. */
export function bridgeDeckParts(edge: RoadEdge, layout: BridgeLayoutInput): BoxPart[] {
  const parts: BoxPart[] = [];
  const [a, b] = edge.points;
  const profile = bridgeDeckProfile(layout, a, b, edge.width);
  const { length, pitch } = profile;
  const yaw = -Math.atan2(b.z - a.z, b.x - a.x);
  // Roll about the span axis (local x, applied first in YZX) so +lateral (local +z) rises by crossSlope.
  // Local +z maps to (sin yaw, cos yaw) = the deck's +n side used by the profile (n = (−uz, ux)).
  // Rx(roll) turns local +z toward −y for roll > 0, so the +n side rises by crossSlope at roll = −atan.
  const roll = -Math.atan(profile.crossSlope);
  const x = (a.x + b.x) / 2; const z = (a.z + b.z) / 2; const yTop = profile.at(0.5);
  // Slab: place it so its top-face centre is exactly on the profile at mid-span.
  const draft = part(0, 0, 0, profile.slant + 0.5, 0.4, edge.width, "#6a7071", "bridge-deck", yaw, pitch, "YZX", roll);
  const top0 = boxPoint(draft, 0, 1, 0);
  const slab = part(x - top0.x, yTop - top0.y, z - top0.z, profile.slant + 0.5, 0.4, edge.width, "#6a7071", "bridge-deck", yaw, pitch, "YZX", roll);
  parts.push(slab);
  /** A part standing on the slab top at along-fraction t (0 = from end, 1 = to end) and lateral offset w. */
  const onDeck = (t: number, w: number, lift: number, sx: number, sy: number, sz: number, color: string, role: StructureRole) => {
    const p = boxPoint(slab, ((t - 0.5) * profile.slant) / (profile.slant + 0.5), 1, w / edge.width);
    return part(p.x, p.y + lift, p.z, sx, sy, sz, color, role, yaw, pitch, "YZX", roll);
  };
  for (const side of [-1, 1]) {
    // Lateral sign: the old code offset by (sin yaw, cos yaw)·offset, i.e. local +z.
    parts.push(onDeck(0.5, side * (edge.width / 2 - 0.15), 0, profile.slant, 0.65, 0.3, "#b9bcb2", "bridge-railing"));
    parts.push(onDeck(0.5, side * (edge.width / 2 - 0.65), 0.015, profile.slant, 0.025, 0.12, "#e4dfc9", "bridge-lane-line"));
  }
  for (let distance = 2; distance < length - 1; distance += 6) {
    const t = (distance + 1) / length;
    parts.push(onDeck(t, 0, 0.015, Math.min(2, length - distance), 0.025, 0.14, "#dfd1a5", "bridge-dash"));
  }
  for (let distance = 16; distance < length - 12; distance += 32) {
    const t = distance / length;
    const px = a.x + (b.x - a.x) * t; const pz = a.z + (b.z - a.z) * t;
    const bed = layout.terrain.height(px, pz);
    parts.push(part(px, bed, pz, 1.6, Math.max(0.1, profile.at(t) - 0.35 - bed), edge.width - 0.6, "#a9aaa0", "bridge-pier", yaw));
  }
  return parts;
}
/** Railing inner face, measured from the deck centreline (railings are 0.3 wide at width/2 − 0.15). */
export const bridgeDrivableHalf = (edge: RoadEdge) => edge.width / 2 - 0.3;

/** Rendered road-surface top at a point that lies on an ordinary ground road (within half its
 * width of a non-bridge render edge), else null. Expressway ramp ends land on it. */
export function groundRoadTopAt(layout: BridgeLayoutInput, x: number, z: number): number | null {
  if (!Array.isArray(layout.roadEdges) || !Number.isFinite(layout.extent)) return null;
  for (const edge of renderRoadEdges(layout.roadEdges)) {
    if (edge.bridge || edge.structure === "deck") continue;
    for (let i = 1; i < edge.points.length; i += 1) {
      const a = edge.points[i - 1]; const b = edge.points[i];
      const dx = b.x - a.x; const dz = b.z - a.z; const ll = dx * dx + dz * dz;
      const t = ll === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / ll));
      if (Math.hypot(x - a.x - dx * t, z - a.z - dz * t) <= edge.width / 2) return terrainSurfaceHeight(layout, x, z) + ROAD_LIFT;
    }
  }
  return null;
}
/** Longest deck piece inside a ramp zone: the eased ramp profile is sampled at least this densely. */
export const EXPRESSWAY_RAMP_PIECE = 10;
type ExpresswayLayout = Pick<CityLayout, "terrain"> & Partial<Pick<CityLayout, "extent" | "roadEdges">>;
/** The drawn expressway run: polyline segments that reach into a ramp zone are split into ≤ RAMP_PIECE
 * collinear pieces, and each point gets its deck-bottom height (ends landed on the rendered road).
 * Renderer, night lamps and the driving surface all read this one run.
 * 规划给的高架在两端各有一条 137–280 长的单段支线，与环线成 ~30° 锐角汇入。只按折线点取高时 ease
 * 剖面一次也没被采样：支线是一整块直坡板，汇入处比环线桥面低 0.6–1.1、从侧面插进环线板里，
 * 驾驶面因此在汇入楔形区高差冲突，上了匝道也到不了桥面。 */
export function expresswayRun(layout: ExpresswayLayout, run: ReadonlyArray<{ x: number; z: number }>): { points: Vec2[]; heights: number[] } {
  const closed = run.length > 1 && Math.hypot(run[0].x - run[run.length - 1].x, run[0].z - run[run.length - 1].z) < 0.01;
  let total = 0; for (let i = 1; i < run.length; i += 1) total += Math.hypot(run[i].x - run[i - 1].x, run[i].z - run[i - 1].z);
  const points: Vec2[] = run.length ? [{ x: run[0].x, z: run[0].z }] : [];
  let along = 0;
  for (let i = 1; i < run.length; i += 1) {
    const a = run[i - 1]; const b = run[i]; const length = Math.hypot(b.x - a.x, b.z - a.z);
    const inRamp = !closed && (along < EXPRESSWAY_RAMP || along + length > total - EXPRESSWAY_RAMP);
    const pieces = inRamp ? Math.max(1, Math.ceil(length / EXPRESSWAY_RAMP_PIECE)) : 1;
    for (let k = 1; k < pieces; k += 1) points.push({ x: a.x + (b.x - a.x) * (k / pieces), z: a.z + (b.z - a.z) * (k / pieces) });
    points.push({ x: b.x, z: b.z });
    along += length;
  }
  const heights = points.length ? expresswayDeckHeights(points, (x, z) => layout.terrain.height(x, z), (x, z) => groundRoadTopAt(layout as BridgeLayoutInput, x, z)) : [];
  return { points, heights };
}

export type ExpresswayPiece = BoxPart & Readonly<{ highway: number; segment: number }>;
/** District expressways: piers, then per segment deck + lane lines + rails (buildDistrictExpressways order).
 * Segments shorter than 6 are not drawn — and therefore not driveable. */
export function expresswayPieces(layout: Pick<CityLayout, "highways" | "terrain"> & Partial<Pick<CityLayout, "extent" | "roadEdges">>): ExpresswayPiece[] {
  const pieces: ExpresswayPiece[] = [];
  (layout.highways ?? []).forEach((run, highway) => {
    const push = (p: BoxPart, segment: number) => pieces.push(Object.freeze({ ...p, highway, segment }));
    const { points, heights } = expresswayRun(layout, run);
    // Piers every ~34 units by mileage, anchored into the terrain or riverbed
    // (over water the pier reaches below the surface — a real bridge span).
    let accumulated = 0;
    let nextPier = 0;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (index > 0) accumulated += Math.hypot(point.x - points[index - 1].x, point.z - points[index - 1].z);
      if (accumulated >= nextPier) {
        nextPier = accumulated + 34;
        const groundY = Math.max(-3, layout.terrain.height(point.x, point.z));
        // 墩顶止于桥面底面（咬合 0.05）。BOX 以底面为原点：y 是墩底而不是中心。
        const pierTop = heights[index] + 0.05;
        if (pierTop - groundY < 1.5) continue; // 匝道落地段不需要桥墩
        const neighbor = points[Math.min(index + 1, points.length - 1)];
        const prev = points[Math.max(index - 1, 0)];
        const pierYaw = -Math.atan2(neighbor.z - prev.z, neighbor.x - prev.x);
        push(part(point.x, groundY, point.z, 1.8, pierTop - groundY, 8.4, "#a9aaa0", "expressway-pier", pierYaw, 0, "YZX"), -1);
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
      push(part(mx, my, mz, slant + 0.5, EXPRESSWAY_DECK_THICKNESS, EXPRESSWAY_DECK_WIDTH, "#6a7071", "expressway-deck", yaw, pitch, "YZX"), index);
      const sideX = Math.sin(yaw);
      const sideZ = Math.cos(yaw);
      for (const offset of [-3.6, 0, 3.6]) push(part(mx + sideX * offset, top, mz + sideZ * offset, slant, 0.05, 0.3, "#c6c6bb", "expressway-lane-line", yaw, pitch, "YZX"), index);
      for (const offset of [-5.1, 5.1]) push(part(mx + sideX * offset, top, mz + sideZ * offset, slant, 0.55, 0.3, "#b9bcb2", "expressway-rail", yaw, pitch, "YZX"), index);
    }
  });
  return pieces;
}
/** Rail inner face from the expressway centreline (rails 0.3 wide at ±5.1). */
export const EXPRESSWAY_DRIVABLE_HALF = 5.1 - 0.15;

/** Red through-truss bars: [x, y, z, len, thick, rotY, tilt, vertical]; tilt is the diagonal lean of a
 * vertical member or the span pitch of a chord (both a local-z rotation in YXZ order). */
export function trussBars(layout: Pick<CityLayout, "landmarks" | "bridges" | "terrain" | "extent" | "roadEdges">): Array<[number, number, number, number, number, number, number, number]> {
  const suspension = (layout.landmarks ?? []).find((l) => l.kind === "suspension-bridge");
  const bridges = (layout.bridges ?? []).filter((b) => b.length >= 40 && b.length <= 160
    && !(suspension && Math.hypot(b.from.x - suspension.x, b.from.z - suspension.z) < 1));
  const bars: Array<[number, number, number, number, number, number, number, number]> = [];
  for (const bridge of bridges) {
    const dx = bridge.to.x - bridge.from.x; const dz = bridge.to.z - bridge.from.z; const len = Math.hypot(dx, dz);
    const ux = dx / len; const uz = dz / len; const nx = -uz; const nz = ux;
    const yaw = -Math.atan2(dz, dx);
    // Follows the same pitched deck as bridgeDeckParts (chords pitched along the span, posts on the deck).
    const profile = bridgeDeckProfile(layout, bridge.from, bridge.to);
    const deckAt = (t: number) => profile.at(t / len);
    const H = 7; const panels = Math.max(4, Math.round(len / 9)); const step = len / panels;
    for (const side of [-1, 1]) {
      const ox = nx * side * 6.6; const oz = nz * side * 6.6;
      const at = (t: number) => ({ x: bridge.from.x + ux * t + ox, z: bridge.from.z + uz * t + oz });
      const mid = at(len / 2);
      bars.push([mid.x, deckAt(len / 2) + H, mid.z, profile.slant, 0.6, yaw, profile.pitch, 0]);          // 上弦
      bars.push([mid.x, deckAt(len / 2) + 0.2, mid.z, profile.slant, 0.6, yaw, profile.pitch, 0]);        // 下弦
      for (let i = 0; i <= panels; i += 1) {
        const p = at(i * step);
        bars.push([p.x, deckAt(i * step), p.z, 0.45, H, yaw, 0, 1]);                 // 竖杆
        if (i < panels) {
          const q = at((i + 0.5) * step);
          bars.push([q.x, deckAt((i + 0.5) * step), q.z, 0.4, Math.hypot(step, H), yaw, (i % 2 ? 1 : -1) * Math.atan2(step, H), 1]); // 斜腹杆
        }
      }
    }
    // 顶部横撑（每两格一根），让桁架从远处读成「穿式」而不是两片护栏。
    for (let i = 0; i <= panels; i += 2) {
      const t = i * step; const x = bridge.from.x + ux * t; const z = bridge.from.z + uz * t;
      bars.push([x, deckAt(t) + H, z, 13.2, 0.5, yaw + Math.PI / 2, 0, 0]);
    }
  }
  return bars;
}
/** A truss bar as the BOX instance the renderer composes (YXZ, horizontal bars centred on y). */
export function trussBarPart([x, y, z, a, b, rotY, tilt, vertical]: [number, number, number, number, number, number, number, number]): BoxPart {
  return vertical ? part(x, y, z, a, b, a, "#a8322a", "truss", rotY, tilt, "YXZ") : part(x, y - b / 2, z, a, b, b, "#a8322a", "truss", rotY, tilt, "YXZ");
}

/** 尽端回车圈半径（形态批 §5-3）：所在路段半宽 + 2.5，夹在 6–9。守夜灯同用此口径。 */
export function culDeSacBulbRadius(roadWidth: number): number {
  return Math.max(6, Math.min(9, roadWidth / 2 + 2.5));
}
export type CulDeSacDisc = Readonly<{ x: number; z: number; radius: number; base: number; gx: number; gz: number }>;
/** Cul-de-sac discs: centre, radius, base height and the central-difference slope the renderer tilts by. */
export function culDeSacDiscs(layout: Pick<CityLayout, "culDeSacEnds" | "roadEdges" | "terrain">): CulDeSacDisc[] {
  const ends = layout.culDeSacEnds ?? [];
  const widthAt = new Map<string, number>();
  for (const edge of renderRoadEdges(layout.roadEdges)) {
    if (edge.bridge) continue;
    for (const id of [edge.from, edge.to]) widthAt.set(id, Math.max(widthAt.get(id) ?? 0, edge.width));
  }
  const height = layout.terrain.height;
  return ends.map((end: Vec2) => {
    const radius = culDeSacBulbRadius(widthAt.get(`${end.x}:${end.z}`) ?? 9);
    const base = Math.max(0, height(end.x, end.z));
    const gx = (height(end.x + radius, end.z) - height(end.x - radius, end.z)) / (2 * radius);
    const gz = (height(end.x, end.z + radius) - height(end.x, end.z - radius)) / (2 * radius);
    return Object.freeze({ x: end.x, z: end.z, radius, base, gx, gz });
  });
}
/** Disc top cap (20 segments like the renderer's CylinderGeometry): centre then rim, world XYZ.
 * Rotation = shortest arc from +Y to normalize(−gx, 1, −gz), as Quaternion.setFromUnitVectors. */
export function culDeSacTopCap(disc: CulDeSacDisc): { center: { x: number; y: number; z: number }; rim: { x: number; y: number; z: number }[] } {
  const len = Math.hypot(disc.gx, 1, disc.gz); const n = [-disc.gx / len, 1 / len, -disc.gz / len];
  // Rodrigues rotation about axis (up × n) by angle acos(n.y).
  const ax = n[2], az = -n[0]; const s = Math.hypot(ax, az); const c = n[1];
  const rotate = (x: number, y: number, z: number) => {
    if (s < 1e-12) return [x, y, z];
    const kx = ax / s, kz = az / s; // ky = 0
    const dot = kx * x + kz * z; const crossX = -kz * y, crossY = kz * x - kx * z, crossZ = kx * y; // k × v with ky=0
    return [x * c + crossX * s + kx * dot * (1 - c), y * c + crossY * s, z * c + crossZ * s + kz * dot * (1 - c)];
  };
  const at = (lx: number, lz: number) => { const [x, y, z] = rotate(lx * disc.radius, 0.12, lz * disc.radius); return { x: disc.x + x, y: disc.base + 0.02 + y, z: disc.z + z }; };
  return { center: at(0, 0), rim: Array.from({ length: 20 }, (_, k) => { const theta = (k / 20) * Math.PI * 2; return at(Math.sin(theta), Math.cos(theta)); }) };
}

export type ChannelFlare = Readonly<{ mouth: number; arm: "stem" | "host"; color: string; left: readonly Vec2[]; right: readonly Vec2[] }>;
export type ChannelIsland = Readonly<{ mouth: number; ring: readonly Vec2[] }>;
const asphaltOf = (edge: { kind: string }) => (edge.kind === "arterial" ? "#505b60" : "#646c6b");
/** 喇叭渐变与水滴分流岛的平面几何（buildChannelizedJunctions 原样）：喇叭从口部（d0，半宽 w/2+extra）
 *  线性收到正常路幅，沿边按 ~4.5 单位切片；岛是口部一侧圆头、向内收尖的低多边形。高度由消费方取。 */
export function channelizedGeometry(layout: Pick<CityLayout, "roadEdges">): { flares: ChannelFlare[]; islands: ChannelIsland[] } {
  const mouths = channelizedTPlan(renderRoadEdges(layout.roadEdges));
  const flares: ChannelFlare[] = []; const islands: ChannelIsland[] = [];
  const flare = (arm: ChannelizedArm, x: number, z: number, mouth: number, name: "stem" | "host") => {
    const width = arm.edge.width;
    const extra = Math.min(2.3, 0.45 * width);
    const d0 = 2.2;
    const length = 9 + width * 0.55;
    const slices = Math.max(1, Math.ceil(length / 4.5));
    const nx = -arm.dir.z; const nz = arm.dir.x;
    const at = (d: number, half: number, sign: number) => ({ x: x + arm.dir.x * d + nx * half * sign, z: z + arm.dir.z * d + nz * half * sign });
    const left: Vec2[] = []; const right: Vec2[] = [];
    for (let s = 0; s <= slices; s += 1) {
      const t = s / slices;
      const half = width / 2 + extra * (1 - t);
      left.push(at(d0 + length * t, half, 1));
      right.push(at(d0 + length * t, half, -1));
    }
    flares.push(Object.freeze({ mouth, arm: name, color: asphaltOf(arm.edge), left: Object.freeze(left), right: Object.freeze(right) }));
  };
  const ISLAND_PROFILE = [
    { d: 0.0, w: 1.0 }, { d: 0.16, w: 1.14 }, { d: 0.58, w: 0.55 }, { d: 1.0, w: 0.0 },
    { d: 0.58, w: -0.55 }, { d: 0.16, w: -1.14 }, { d: 0.0, w: -1.0 },
  ];
  const island = (arm: ChannelizedArm, x: number, z: number, mouth: number) => {
    const extra = Math.min(2.3, 0.45 * arm.edge.width);
    const start = 2.2 + 2.2;
    const length = 4.4 + arm.edge.width * 0.3;
    const half = Math.min(0.8, extra * 0.4);
    const nx = -arm.dir.z; const nz = arm.dir.x;
    islands.push(Object.freeze({ mouth, ring: Object.freeze(ISLAND_PROFILE.map((point) => ({
      x: x + arm.dir.x * (start + length * point.d) + nx * half * point.w,
      z: z + arm.dir.z * (start + length * point.d) + nz * half * point.w,
    }))) }));
  };
  mouths.forEach((mouth, index) => {
    flare(mouth.stem, mouth.x, mouth.z, index, "stem");
    flare(mouth.host, mouth.x, mouth.z, index, "host");
    island(mouth.stem, mouth.x, mouth.z, index);
  });
  return { flares, islands };
}
/** Flare paint lift (0.02–0.05 band; below the road surface lift 0.04). */
export const FLARE_LIFT = 0.035;
/** Flare triangles per slice in the renderer's order: (left s, left s+1, right s+1), (left s, right s+1, right s). */
export function flareTriangles(flare: ChannelFlare): [Vec2, Vec2, Vec2][] {
  const out: [Vec2, Vec2, Vec2][] = [];
  for (let s = 0; s + 1 < flare.left.length; s += 1) {
    const a = flare.left[s]; const b = flare.left[s + 1]; const c = flare.right[s + 1]; const e = flare.right[s];
    out.push([a, b, c], [a, c, e]);
  }
  return out;
}
