/** Frozen host -> shared car kernel bridge. Exact architectural render-mesh
 * collision remains an explicit missing capability; building/landmark boxes enter
 * through the whitelisted scene proxies so a city with buildings is drivable with
 * conservative collision instead of being refused outright.
 */
import type { CityDrivingWorldCapture } from "../../engine/CityEngine";
import type { ReadyCitySurfaceCapture } from "../../engine/surface/citySurfacePort";
import { buildSurfaceIndex } from "../../engine/surface/SurfaceIndex";
import { buildSurfaceRegions } from "../../engine/surface/surfaceRegions";
import { initialDrivingState, DRIVING_PHYSICS_VERSION } from "../DrivingSimulation";
import { DrivingKernel } from "../driving/DrivingKernel";
import { boxSolidFromCorners, buildVersionedCollisionIndex, COLLISION_RULES_VERSION, type CollisionDimensions, type SolidInput } from "../driving/CollisionIndex";
import { createStructureCollisionBinding, SurfaceDrivingEnvironment } from "../driving/SurfaceDrivingWorld";
import { SURFACE_FOOTPRINT_RULES_VERSION } from "../driving/surfaceFootprint";
import { CarAdapter, type CarPresentation } from "./CarAdapter";
import { GameRuntime } from "./GameRuntime";

/** Conservative combined budget: a proxy flood cannot silently disable entry. */
const COMBINED_SOLID_LIMIT = 4096;

/** Structures (exact descriptors) + whitelisted scene proxies (buildings/landmarks),
 * capped; overflow is an explicit unavailable, never a silent half-collision. */
type CityDrivingSnapshot = NonNullable<ReturnType<ReadyCitySurfaceCapture["readWorld"]>>;
function combinedSolidInputs(world: CityDrivingSnapshot | null): readonly SolidInput[] | null {
  if (!world) return null;
  if (world.obstacles.length + world.sceneSolids.length > COMBINED_SOLID_LIMIT) return null;
  const combined: SolidInput[] = [];
  for (const obstacle of world.obstacles) {
    if (obstacle.shape === "box") combined.push(boxSolidFromCorners(obstacle.id, obstacle.role, obstacle.corners));
    else combined.push({ id: obstacle.id, role: obstacle.role, kind: "prism", ring: obstacle.ring, yMin: obstacle.yMin, yMax: obstacle.yMax });
  }
  for (const proxy of world.sceneSolids) combined.push(proxy);
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
  | Readonly<{ status: "ready"; worldRevision: string; coverage: "structures-and-scene-proxies"; adapter: CarAdapter }>
  | Readonly<{ status: "unavailable"; reason: string }>;
export async function createCityCarSession(host: CityCarHost, runtime: GameRuntime, request: CityCarRequest,
  signal?: AbortSignal): Promise<CityCarEntry> {
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
    // Exact architectural render meshes are captured but not yet consumed for
    // collision; buildings/landmarks participate through the whitelisted scene
    // proxies so a city WITH buildings is drivable under conservative collision.
    if (!request.collider.vehicleConfigHash) return unavailable("invalid-vehicle-config");
    const surfaceIndex = buildSurfaceIndex(snapshot.surface);
    if (surfaceIndex.status !== "ready") return unavailable(`surface-index:${surfaceIndex.reason}`);
    const regions = buildSurfaceRegions(snapshot.surface, surfaceIndex);
    if (regions.status !== "ready") return unavailable(`surface-regions:${regions.reason}`);
    const solids = combinedSolidInputs(snapshot);
    if (!solids) return unavailable("scene-solids-over-budget");
    const collision = buildVersionedCollisionIndex(capture.worldRevision, solids);
    if (collision.status !== "ready") return unavailable(`collision-index:${collision.reason}`);
    const binding = createStructureCollisionBinding({ surfaceRevision: capture.revision, worldRevision: capture.worldRevision,
      index: collision.index, dimensions: request.collider.dimensions, centerHeight: request.collider.centerHeight, isCurrent: leaseCurrent });
    const environment = new SurfaceDrivingEnvironment(regions, undefined, undefined, binding);
    const point = regions.classify(request.x, request.z, request.layerId);
    if (point.status !== "drivable") return unavailable(`spawn:${point.cause}`);
    const support = environment.place(request.x, request.z, request.heading, point.regionId);
    if (!support) return unavailable("unsafe-car-spawn");
    const spawn = { ...initialDrivingState(request.x, request.z, request.heading, point.regionId), ...support };
    const kernel = new DrivingKernel(environment, { baseSnapshotHash: capture.worldRevision,
      vehicleConfigHash: request.collider.vehicleConfigHash, kernelBuildId: "city-car-structure-kernel-v1",
      physicsVersion: DRIVING_PHYSICS_VERSION, collisionVersion: COLLISION_RULES_VERSION, queryVersion: SURFACE_FOOTPRINT_RULES_VERSION });
    const adapter = new CarAdapter({ revision: capture.worldRevision, kernel, isCurrent: leaseCurrent,
      validateSpawn: (state) => {
        const placed = environment.place(state.x, state.z, state.heading, state.surfaceId);
        return !!placed && (["y", "pitch", "roll"] as const).every((key) => Math.abs(placed[key] - state[key]) <= 1e-6);
      } }, spawn, request.present);
    transferred = true;
    const entered = await runtime.enter({ revision: capture.worldRevision, isCurrent: leaseCurrent,
      setFrameHook: capture.setFrameHook, release: () => { signal?.removeEventListener("abort", cancel); capture.release(); } }, adapter);
    return entered ? Object.freeze({ status: "ready", worldRevision: capture.worldRevision, coverage: "structures-and-scene-proxies", adapter }) : unavailable(runtime.snapshot.reason ?? "runtime-refused");
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "city-car-entry-failed");
  } finally {
    if (!transferred) { signal?.removeEventListener("abort", cancel); capture.release(); }
  }
}
