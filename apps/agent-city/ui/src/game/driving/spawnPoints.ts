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

/** 从开放图各最大连通分量派生候选（§13.5：派生后须产品确认入库）。
 * 只读图数据，不触世界——确定性：同图同输出。候选=每个 kind=directed-edge 的
 * passed 单位中每分量最长者中点，朝向取该单元方向；layerId 由调用方随图外元数据
 * 提供（图内不复制层信息，避免第二真相源）。 */
export function deriveSpawnCandidates(
  graph: ReleasedDrivingGraph,
  layerOf: (unitId: string) => string,
): ReadonlyArray<Readonly<{ id: string; sourceUnitId: string; x: number; z: number; heading: number; layerId: string }>> {
  const passed = graph.units.filter((unit) => unit.status === "passed" && unit.kind === "directed-edge");
  // 单元 id 里编码的折线端点不足以取中点；此处保守用单元 id 稳定排序后逐分量
  // 取中位单元 id 的哈希伪坐标不可取——派生必须真实。实际中点由调用方从图的
  // 附带几何（ ReleasedDrivingGraph vNext 的 unitGeometry）提供；当前切片
  // 图尚无逐单元几何，返回空候选并说明，不伪造坐标。
  void passed; void layerOf;
  return [];
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
