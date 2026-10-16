/** Frozen host -> shared car kernel bridge. Architectural mesh collision is an
 * explicit missing capability: never turn a structure-only query into city entry.
 */
import type { CityDrivingWorldCapture } from "../../engine/CityEngine";
import { buildSurfaceIndex } from "../../engine/surface/SurfaceIndex";
import { buildSurfaceRegions } from "../../engine/surface/surfaceRegions";
import { initialDrivingState, DRIVING_PHYSICS_VERSION } from "../DrivingSimulation";
import { DrivingKernel } from "../driving/DrivingKernel";
import { buildCollisionIndex, COLLISION_RULES_VERSION, type CollisionDimensions } from "../driving/CollisionIndex";
import { createStructureCollisionBinding, SurfaceDrivingEnvironment } from "../driving/SurfaceDrivingWorld";
import { SURFACE_FOOTPRINT_RULES_VERSION } from "../driving/surfaceFootprint";
import { CarAdapter, type CarPresentation } from "./CarAdapter";
import { GameRuntime } from "./GameRuntime";

export type CityCarHost = Readonly<{ captureDrivingWorld(signal?: AbortSignal): Promise<CityDrivingWorldCapture> }>;
export type CityCarRequest = Readonly<{
  x: number; z: number; heading: number; layerId: string;
  /** Explicit calibrated collider parameters; no silent visual-to-solid guess. */
  collider: Readonly<{ dimensions: CollisionDimensions; centerHeight: number; vehicleConfigHash: string }>;
  present(frame: CarPresentation): void;
}>;
export type CityCarEntry =
  | Readonly<{ status: "ready"; worldRevision: string; coverage: "structures-only"; adapter: CarAdapter }>
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
    if (signal?.aborted || !capture.isCurrent()) return unavailable("stale-or-cancelled");
    const snapshot = capture.readWorld();
    if (!snapshot || snapshot.revision !== capture.worldRevision || snapshot.surface.revision !== capture.revision) return unavailable("revision-mismatch");
    // Exact architectural render geometry is captured, but this collision path
    // currently supports only the structural boxes/prisms. No permissive fallback.
    if (snapshot.renderedSolids.length > 0) return unavailable("unavailable-rendered-collision");
    if (!request.collider.vehicleConfigHash) return unavailable("invalid-vehicle-config");
    const surfaceIndex = buildSurfaceIndex(snapshot.surface);
    if (surfaceIndex.status !== "ready") return unavailable(`surface-index:${surfaceIndex.reason}`);
    const regions = buildSurfaceRegions(snapshot.surface, surfaceIndex);
    if (regions.status !== "ready") return unavailable(`surface-regions:${regions.reason}`);
    const collision = buildCollisionIndex({ revision: capture.worldRevision, obstacles: snapshot.obstacles });
    if (collision.status !== "ready") return unavailable(`collision-index:${collision.reason}`);
    const binding = createStructureCollisionBinding({ surfaceRevision: capture.revision, worldRevision: capture.worldRevision,
      index: collision.index, dimensions: request.collider.dimensions, centerHeight: request.collider.centerHeight, isCurrent: capture.isCurrent });
    const environment = new SurfaceDrivingEnvironment(regions, undefined, undefined, binding);
    const point = regions.classify(request.x, request.z, request.layerId);
    if (point.status !== "drivable") return unavailable(`spawn:${point.cause}`);
    const support = environment.place(request.x, request.z, request.heading, point.regionId);
    if (!support) return unavailable("unsafe-car-spawn");
    const spawn = { ...initialDrivingState(request.x, request.z, request.heading, point.regionId), ...support };
    const kernel = new DrivingKernel(environment, { baseSnapshotHash: capture.worldRevision,
      vehicleConfigHash: request.collider.vehicleConfigHash, kernelBuildId: "city-car-structure-kernel-v1",
      physicsVersion: DRIVING_PHYSICS_VERSION, collisionVersion: COLLISION_RULES_VERSION, queryVersion: SURFACE_FOOTPRINT_RULES_VERSION });
    const adapter = new CarAdapter({ revision: capture.worldRevision, kernel, isCurrent: capture.isCurrent,
      validateSpawn: (state) => {
        const placed = environment.place(state.x, state.z, state.heading, state.surfaceId);
        return !!placed && (["y", "pitch", "roll"] as const).every((key) => Math.abs(placed[key] - state[key]) <= 1e-6);
      } }, spawn, request.present);
    transferred = true;
    const entered = await runtime.enter({ revision: capture.worldRevision, isCurrent: capture.isCurrent,
      setFrameHook: capture.setFrameHook, release: () => { signal?.removeEventListener("abort", cancel); capture.release(); } }, adapter);
    return entered ? Object.freeze({ status: "ready", worldRevision: capture.worldRevision, coverage: "structures-only", adapter }) : unavailable(runtime.snapshot.reason ?? "runtime-refused");
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "city-car-entry-failed");
  } finally {
    if (!transferred) { signal?.removeEventListener("abort", cancel); capture.release(); }
  }
}
