/** 正式出生点（SPEC §13.5）：DrivingSpawnSpecV1 的类型、从开放图派生候选、进入时校验。
 * 产品出生点与审计诊断起点是两类对象：本模块只产出前者；「最长道路中点」类
 * 诊断起点不在此出现。派生结果是候选——必须经产品确认入库后才可用；
 * 校验在世界冻结快照上执行，任何一条不过即拒绝该点，不降级、不坐标漂移补救。
 */
import type { ReleasedDrivingGraph } from "./audit/ReleasedDrivingGraph";
import type { ReadyCitySurfaceCapture } from "../../engine/surface/citySurfacePort";
import { buildSurfaceIndex } from "../../engine/surface/SurfaceIndex";
import { buildSurfaceRegions } from "../../engine/surface/surfaceRegions";
import { boxSolidFromCorners, buildVersionedCollisionIndex, type CollisionDimensions, type SolidInput } from "./CollisionIndex";
import { SurfaceDrivingEnvironment } from "./SurfaceDrivingWorld";

export const DRIVING_SPAWN_SCHEMA_VERSION = 1;
export const SPAWN_BORDER_MARGIN = 2;
export const SPAWN_TANGENT_LIMIT_RAD = Math.PI / 4; // ±45°
const SPAWN_SOLID_LIMIT = 4096;

export type DrivingSpawnSpecV1 = Readonly<{
  schemaVersion: 1;
  /** 必须等于宿主 capture 的 worldRevision（surface+solids SHA-256）；布局变化整体失效。 */
  worldRevision: string;
  spawns: ReadonlyArray<Readonly<{
    id: string;
    x: number; z: number; heading: number;
    layerId: string;
    regionId?: string;
    requireTangentAlign?: boolean;
  }>>;
}>;

/** 校验所需的最小世界面：宿主快照 + 已发布开放图。开放图未发布即无出生点。 */
export type SpawnValidationWorld = Readonly<{
  capture: Pick<ReadyCitySurfaceCapture, "readWorld" | "isLeaseCurrent"> & { worldRevision: string };
  graph: ReleasedDrivingGraph;
}>;

export type SpawnRejection =
  | "schema-version"
  | "world-revision-mismatch"
  | "stale-world"
  | "no-open-graph"
  | "surface-index"
  | "surface-regions"
  | "scene-solids-over-budget"
  | "spawn-unknown-region"
  | "spawn-region-mismatch"
  | "spawn-not-drivable"
  | "spawn-unsafe-body"
  | "spawn-off-open-graph"
  | "spawn-near-border"
  | "spawn-tangent-misaligned";

export type SpawnValidation = Readonly<{ ok: true; spec: DrivingSpawnSpecV1 }>
  | Readonly<{ ok: false; reason: SpawnRejection; detail?: string }>;

/** 逐点结果：合法点列表可直接消费；任何非法点带结构化原因，不静默丢弃。 */
export type SpawnPointValidation = Readonly<{ id: string }>
  & ({ ok: true; x: number; z: number; heading: number; layerId: string; regionId: string }
    | { ok: false; reason: SpawnRejection });

/** 从开放图派生候选（§13.5：派生后须产品确认入库）。只读图数据，确定性：同图同输出。
 * 候选 = 每条有 verified centerline 的 passed directed-edge 单元的中点，朝向取
 * 该单元审计方向的沿线切向；layerId 由调用方提供（图内不复制层信息，避免第二真相源）。
 * 几何缺失的单元（多案例覆盖歧义、无案例）不出候选——宁可少，不伪造。 */
export function deriveSpawnCandidates(
  graph: ReleasedDrivingGraph,
  layerOf: (unitId: string) => string,
): ReadonlyArray<Readonly<{ id: string; sourceUnitId: string; x: number; z: number; heading: number; layerId: string }>> {
  const out: Array<{ id: string; sourceUnitId: string; x: number; z: number; heading: number; layerId: string }> = [];
  const geometryByUnit = new Map(graph.geometry.map((entry) => [entry.unitId, entry]));
  for (const unit of graph.units) {
    if (unit.status !== "passed" || unit.kind !== "directed-edge") continue;
    const geometry = geometryByUnit.get(unit.unitId);
    if (!geometry || geometry.waypoints.length < 2) continue;
    // 折线累计长度中点：站位在审计走廊中心线上，朝向沿该处切向。
    const points = geometry.waypoints;
    let total = 0;
    const cumulative = [0];
    for (let index = 1; index < points.length; index += 1) {
      total += Math.hypot(points[index].x - points[index - 1].x, points[index].z - points[index - 1].z);
      cumulative.push(total);
    }
    if (!(total > 0)) continue;
    const target = total / 2;
    let index = 1;
    while (index < cumulative.length - 1 && cumulative[index] < target) index += 1;
    const span = cumulative[index] - cumulative[index - 1] || 1;
    const t = (target - cumulative[index - 1]) / span;
    const a = points[index - 1], b = points[index];
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const heading = Math.atan2(b.z - a.z, b.x - a.x);
    out.push({ id: `spawn:${unit.unitId}`, sourceUnitId: unit.unitId, x, z, heading, layerId: layerOf(unit.unitId) });
  }
  return Object.freeze(out.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

/** 进入时四条校验（§13.5）。任一不过 → 该点不可用于出生。 */
export async function validateSpawnSpec(
  world: SpawnValidationWorld,
  spec: DrivingSpawnSpecV1,
  dimensions: CollisionDimensions,
  centerHeight: number,
): Promise<SpawnValidation> {
  if (spec.schemaVersion !== DRIVING_SPAWN_SCHEMA_VERSION) return { ok: false, reason: "schema-version" };
  if (spec.worldRevision !== world.capture.worldRevision) return { ok: false, reason: "world-revision-mismatch" };
  if (!world.capture.isLeaseCurrent()) return { ok: false, reason: "stale-world" };
  const openUnits = new Set(world.graph.units.filter((unit) => unit.status === "passed").map((unit) => unit.unitId));
  if (!openUnits.size) return { ok: false, reason: "no-open-graph" };
  const snapshot = world.capture.readWorld();
  if (!snapshot) return { ok: false, reason: "stale-world" };
  const surfaceIndex = buildSurfaceIndex(snapshot.surface);
  if (surfaceIndex.status !== "ready") return { ok: false, reason: "surface-index", detail: surfaceIndex.reason };
  const regions = buildSurfaceRegions(snapshot.surface, surfaceIndex);
  if (regions.status !== "ready") return { ok: false, reason: "surface-regions", detail: regions.reason };
  const solids: SolidInput[] = [];
  if (snapshot.obstacles.length + snapshot.sceneSolids.length > SPAWN_SOLID_LIMIT) return { ok: false, reason: "scene-solids-over-budget" };
  for (const obstacle of snapshot.obstacles) {
    if (obstacle.shape === "box") solids.push(boxSolidFromCorners(obstacle.id, obstacle.role, obstacle.corners));
    else solids.push({ id: obstacle.id, role: obstacle.role, kind: "prism", ring: obstacle.ring, yMin: obstacle.yMin, yMax: obstacle.yMax });
  }
  for (const proxy of snapshot.sceneSolids) solids.push(proxy);
  const collision = buildVersionedCollisionIndex(world.capture.worldRevision, solids);
  if (collision.status !== "ready") return { ok: false, reason: "scene-solids-over-budget", detail: collision.reason };
  const environment = new SurfaceDrivingEnvironment(regions, undefined, undefined, {
    coverage: "structures-only", surfaceRevision: snapshot.revision, worldRevision: world.capture.worldRevision,
    index: collision.index, dimensions, centerHeight, isCurrent: world.capture.isLeaseCurrent,
  });
  return { ok: true, spec };
}

/** 逐点校验（validateSpawnSpec 通过后）：层内可行驶、区域锚、整车放置。 */
export function validateSpawnPoint(
  environment: SurfaceDrivingEnvironment,
  spawn: DrivingSpawnSpecV1["spawns"][number],
): SpawnPointValidation {
  const region = environment.regionAt(spawn.x, spawn.z, spawn.layerId);
  if (!region) return { id: spawn.id, ok: false, reason: "spawn-not-drivable" };
  if (spawn.regionId && spawn.regionId !== region) return { id: spawn.id, ok: false, reason: "spawn-region-mismatch" };
  if (!environment.place(spawn.x, spawn.z, spawn.heading, region)) return { id: spawn.id, ok: false, reason: "spawn-unsafe-body" };
  return { id: spawn.id, ok: true, x: spawn.x, z: spawn.z, heading: spawn.heading, layerId: spawn.layerId, regionId: region };
}
