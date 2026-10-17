/** Bounded UAT-only placement search. These points are diagnostic, never released
 * graph evidence or confirmed product spawns. All poses use the session's frozen
 * surface and full collision environment, including the complete car footprint. */
import type { CompiledCitySurface } from "../../engine/surface/types";
import type { SurfaceRegionsBuild } from "../../engine/surface/surfaceRegions";
import { initialDrivingState, type DrivingState } from "../DrivingSimulation";
import type { DrivingEnvironment } from "../DrivingSimulation";

type SpawnEnvironment = Pick<DrivingEnvironment, "move"> & Readonly<{
  place(x: number, z: number, heading: number, regionId: string, y?: number): Readonly<{ y: number; pitch: number; roll: number }> | null;
}>;

// A short 2.5-unit probe accepts intersection noses between splitter islands.
// Require a useful run-up both ways so the diagnostic car starts somewhere it
// can actually pull away from, not merely somewhere its stationary body fits.
const SPAWN_PROBE_DISTANCE = 6;

export function diagnosticSpawn(surface: CompiledCitySurface, regions: Extract<SurfaceRegionsBuild, { status: "ready" }>,
  environment: SpawnEnvironment): DrivingState | null {
  let budget = 512;
  let forwardOnly: DrivingState | null = null;

  const hasShortClearance = (start: DrivingState, direction: "forward" | "backward"): boolean => {
    const sign = direction === "forward" ? 1 : -1;
    const desired = { x: start.x + Math.cos(start.heading) * SPAWN_PROBE_DISTANCE * sign,
      z: start.z + Math.sin(start.heading) * SPAWN_PROBE_DISTANCE * sign, heading: start.heading,
      travelBudget: SPAWN_PROBE_DISTANCE };
    const moved = environment.move(start, desired);
    return !moved.blocked && Math.hypot(moved.x - start.x, moved.z - start.z) >= SPAWN_PROBE_DISTANCE * 0.95;
  };

  const tryPose = (x: number, z: number, heading: number, layerId: string): DrivingState | null => {
    if (--budget < 0) return null;
    const point = regions.classify(x, z, layerId);
    if (point.status !== "drivable") return null;
    const support = environment.place(x, z, heading, point.regionId);
    if (!support) return null;
    return { ...initialDrivingState(x, z, heading, point.regionId), ...support };
  };

  // Ground carriageways first. The longest axis of a road mesh gives a more
  // reliable tangent than the farthest vertex from its bounding-box midpoint.
  for (const patch of surface.patches) {
    if (patch.kind !== "carriageway") continue;
    const v = patch.vertices;
    if (v.length < 9) continue;
    let meanX = 0, meanZ = 0;
    const count = v.length / 3;
    for (let i = 0; i < v.length; i += 3) { meanX += v[i]; meanZ += v[i + 2]; }
    meanX /= count; meanZ /= count;

    let xx = 0, zz = 0, xz = 0;
    let minAlong = Infinity, maxAlong = -Infinity;
    for (let i = 0; i < v.length; i += 3) {
      const dx = v[i] - meanX, dz = v[i + 2] - meanZ;
      xx += dx * dx; zz += dz * dz; xz += dx * dz;
    }
    const heading = 0.5 * Math.atan2(2 * xz, xx - zz);
    const axisX = Math.cos(heading), axisZ = Math.sin(heading);
    for (let i = 0; i < v.length; i += 3) {
      const along = (v[i] - meanX) * axisX + (v[i + 2] - meanZ) * axisZ;
      minAlong = Math.min(minAlong, along); maxAlong = Math.max(maxAlong, along);
    }

    // Test several points along long strips. Static placement checks the full
    // body; continuous 2.5-unit sweeps verify support and collision both ways.
    const spans = maxAlong - minAlong;
    const positions: ReadonlyArray<readonly [number, number]> = [[meanX, meanZ], ...[0, 0.3, -0.3].map((fraction) => {
      const along = (minAlong + maxAlong) * 0.5 + spans * fraction;
      return [meanX + axisX * along, meanZ + axisZ * along] as const;
    })];
    for (const [x, z] of positions) {
      for (const angle of [heading, heading + Math.PI]) {
        const state = tryPose(x, z, angle, patch.layerId);
        if (!state) { if (budget <= 0) return forwardOnly; continue; }
        if (!hasShortClearance(state, "forward")) continue;
        if (hasShortClearance(state, "backward")) return state;
        if (!forwardOnly) forwardOnly = state;
      }
    }
    if (budget <= 0) return forwardOnly;
  }
  return forwardOnly;
}
