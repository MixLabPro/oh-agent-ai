/** Frozen host -> shared car kernel bridge. Exact architectural render-mesh
 * collision remains an explicit missing capability; building/landmark boxes enter
 * through the whitelisted scene proxies so a city with buildings is drivable with
 * conservative collision instead of being refused outright.
 */
import type { CityDrivingWorldCapture } from "../../engine/CityEngine";
import type { ReadyCitySurfaceCapture } from "../../engine/surface/citySurfacePort";
import { buildSurfaceIndex } from "../../engine/surface/SurfaceIndex";
import { renderedSolidsToObstacles, RENDERED_OBSTACLE_LIMITS } from "../../engine/surface/renderedSolidObstacles";
import { buildSurfaceRegions } from "../../engine/surface/surfaceRegions";
import { initialDrivingState, DRIVING_PHYSICS_VERSION, type DrivingInputState } from "../DrivingSimulation";
import { DrivingKernel } from "../driving/DrivingKernel";
import { boxSolidFromCorners, buildVersionedCollisionIndex, type CollisionDimensions, type SolidInput } from "../driving/CollisionIndex";
import type { StructureObstacle } from "../../engine/surface/compileSurface";
import { ContinuousDrivingEnvironment, CONTINUOUS_DRIVING_QUERY_VERSION } from "../driving/ContinuousDrivingEnvironment";
import { DRIVING_COLLISION_VERSION } from "../driving/DrivingCollision";
import { GAMEPLAY_FOOTPRINT_PARAMS } from "../driving/surfaceFootprint";
import { GAMEPLAY_COLLISION_INSET, GAMEPLAY_DRIVING_FOOTPRINT } from "../driving/vehicleFootprint";
import { CarAdapter, type CarPresentation } from "./CarAdapter";
import { GameRuntime } from "./GameRuntime";
import { diagnosticSpawn } from "./diagnosticSpawn";

/** Total world-build budget, distinct from the BVH's 4096 per-query candidates.
 * A 500-session city includes thousands of architectural instances. Retain the
 * converter's bounded world limit without increasing any runtime query budget. */
const COMBINED_SOLID_LIMIT = RENDERED_OBSTACLE_LIMITS.obstacles;

/** Structures (exact descriptors) + whitelisted scene proxies (buildings/landmarks),
 * capped; overflow is an explicit unavailable, never a silent half-collision. */
type CityDrivingSnapshot = NonNullable<ReturnType<ReadyCitySurfaceCapture["readWorld"]>>;
function combinedSolidInputs(world: CityDrivingSnapshot | null, rendered: readonly StructureObstacle[]): readonly SolidInput[] | null {
  if (!world) return null;
  if (world.obstacles.length + world.sceneSolids.length + rendered.length > COMBINED_SOLID_LIMIT) return null;
  const combined: SolidInput[] = [];
  const append = (obstacle: StructureObstacle) => {
    if (obstacle.shape === "box") combined.push(boxSolidFromCorners(obstacle.id, obstacle.role, obstacle.corners));
    else combined.push({ id: obstacle.id, role: obstacle.role, kind: "prism", ring: obstacle.ring, yMin: obstacle.yMin, yMax: obstacle.yMax });
  };
  for (const obstacle of world.obstacles) append(obstacle);
  for (const proxy of world.sceneSolids) combined.push(proxy);
  for (const obstacle of rendered) append(obstacle);
  return combined;
}

export type CityCarHost = Readonly<{ captureDrivingWorld(signal?: AbortSignal): Promise<CityDrivingWorldCapture> }>;
export type CityCarRequest = Readonly<{
  x: number; z: number; heading: number; layerId: string;
  /** Explicit calibrated collider parameters; no silent visual-to-solid guess. */
  collider: Readonly<{ dimensions: CollisionDimensions; centerHeight: number; vehicleConfigHash: string }>;
  present(frame: CarPresentation): void;
}>;
export type CityCarEntry =
  | Readonly<{ status: "ready"; worldRevision: string; coverage: "structures-only" | "structures-and-scene-proxies" | "structures-and-buildings" | "structures-and-buildings-and-scene-proxies"; adapter: CarAdapter }>
  | Readonly<{ status: "unavailable"; reason: string }>;
export async function createCityCarSession(host: CityCarHost, runtime: GameRuntime<DrivingInputState>, request: CityCarRequest,
  signal?: AbortSignal): Promise<CityCarEntry> {
  return createSession(host, runtime, request, false, signal);
}
/** Diagnostic-only entry. Does not confirm/persist a product spawn or release roads. */
export async function createCityCarDiagnosticSession(host: CityCarHost, runtime: GameRuntime<DrivingInputState>,
  request: Pick<CityCarRequest, "collider" | "present">, signal?: AbortSignal): Promise<CityCarEntry> {
  return createSession(host, runtime, { ...request, x: 0, z: 0, heading: 0, layerId: "" }, true, signal);
}
async function createSession(host: CityCarHost, runtime: GameRuntime<DrivingInputState>, request: CityCarRequest,
  diagnostic: boolean, signal?: AbortSignal): Promise<CityCarEntry> {
  const unavailable = (reason: string): CityCarEntry => Object.freeze({ status: "unavailable", reason });
  if (signal?.aborted) return unavailable("cancelled");
  const capture = await host.captureDrivingWorld(signal);
  if (capture.status !== "ready") return unavailable(capture.status);
  let transferred = false;
  const cancel = () => { if (transferred) runtime.exit(); else capture.release(); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (signal?.aborted || !capture.verifyCurrent()) return unavailable("stale-or-cancelled");
    const leaseCurrent = capture.isLeaseCurrent;
    const snapshot = capture.readWorld();
    if (!snapshot || snapshot.revision !== capture.worldRevision || snapshot.surface.revision !== capture.revision) return unavailable("revision-mismatch");
    // Merge exact structural descriptors, whitelisted scene proxies, and
    // conservative per-instance rendered-solid bounds in one fail-closed index.
    if (!request.collider.vehicleConfigHash) return unavailable("invalid-vehicle-config");
    const surfaceIndex = buildSurfaceIndex(snapshot.surface);
    if (surfaceIndex.status !== "ready") return unavailable(`surface-index:${surfaceIndex.reason}`);
    const regions = buildSurfaceRegions(snapshot.surface, surfaceIndex);
    if (regions.status !== "ready") return unavailable(`surface-regions:${regions.reason}`);
    const rendered = renderedSolidsToObstacles(snapshot.renderedSolids,
      { obstacles: Math.max(0, COMBINED_SOLID_LIMIT - snapshot.obstacles.length - snapshot.sceneSolids.length), solids: RENDERED_OBSTACLE_LIMITS.solids });
    if (rendered.status !== "ready") return unavailable(rendered.reason);
    const solids = combinedSolidInputs(snapshot, rendered.obstacles);
    if (!solids) return unavailable("scene-solids-over-budget");
    const collision = buildVersionedCollisionIndex(capture.worldRevision, solids);
    if (collision.status !== "ready") return unavailable(`collision-index:${collision.reason}`);
    // Manual play gets a small horizontal body clearance so conservative scene
    // proxies and curb contacts do not turn a brush into a full stop. Vertical
    // clearance stays exact. Audit environments keep the authored dimensions.
    const gameplayDimensions = Object.freeze({
      halfLength: Math.max(0.1, request.collider.dimensions.halfLength - GAMEPLAY_COLLISION_INSET),
      halfWidth: Math.max(0.1, request.collider.dimensions.halfWidth - GAMEPLAY_COLLISION_INSET),
      halfHeight: request.collider.dimensions.halfHeight,
    });
    const environment = new ContinuousDrivingEnvironment(regions, {
      surfaceRevision: capture.revision, worldRevision: capture.worldRevision, solidRevision: capture.worldRevision,
      solids: collision.index.solids(), dimensions: gameplayDimensions,
      centerHeight: request.collider.centerHeight, isCurrent: leaseCurrent,
    }, GAMEPLAY_DRIVING_FOOTPRINT, GAMEPLAY_FOOTPRINT_PARAMS);
    if (!diagnostic) {
      const point = regions.classify(request.x, request.z, request.layerId);
      if (point.status !== "drivable") return unavailable(`spawn:${point.cause}`);
    }
    const spawn = (() => {
      if (diagnostic) return diagnosticSpawn(snapshot.surface, regions, environment);
      const point = regions.classify(request.x, request.z, request.layerId);
      if (point.status !== "drivable") return null;
      const support = environment.place(request.x, request.z, request.heading, point.regionId);
      return support ? { ...initialDrivingState(request.x, request.z, request.heading, point.regionId), ...support } : null;
    })();
    if (!spawn) return unavailable(diagnostic ? "no-safe-diagnostic-spawn" : "unsafe-car-spawn");
    const kernel = new DrivingKernel(environment, { baseSnapshotHash: capture.worldRevision,
      vehicleConfigHash: `${request.collider.vehicleConfigHash}-forgiving-collider-v3`, kernelBuildId: "city-car-continuous-gameplay-v3",
      physicsVersion: DRIVING_PHYSICS_VERSION, collisionVersion: DRIVING_COLLISION_VERSION, queryVersion: CONTINUOUS_DRIVING_QUERY_VERSION });
    const adapter = new CarAdapter({ revision: capture.worldRevision, kernel, isCurrent: leaseCurrent,
      validateSpawn: (state) => {
        const placed = environment.place(state.x, state.z, state.heading, state.surfaceId);
        return !!placed && (["y", "pitch", "roll"] as const).every((key) => Math.abs(placed[key] - state[key]) <= 1e-6);
      } }, spawn, request.present);
    transferred = true;
    const entered = await runtime.enter({ revision: capture.worldRevision, isCurrent: leaseCurrent,
      setFrameHook: capture.setFrameHook, release: () => { signal?.removeEventListener("abort", cancel); capture.release(); } }, adapter);
    const hasProxies = snapshot.sceneSolids.length > 0;
    const hasBuildings = rendered.obstacles.length > 0;
    const coverage = hasBuildings
      ? (hasProxies ? "structures-and-buildings-and-scene-proxies" : "structures-and-buildings")
      : (hasProxies ? "structures-and-scene-proxies" : "structures-only");
    return entered ? Object.freeze({ status: "ready", worldRevision: capture.worldRevision, coverage, adapter }) : unavailable(runtime.snapshot.reason ?? "runtime-refused");
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "city-car-entry-failed");
  } finally {
    if (!transferred) { signal?.removeEventListener("abort", cancel); capture.release(); }
  }
}
