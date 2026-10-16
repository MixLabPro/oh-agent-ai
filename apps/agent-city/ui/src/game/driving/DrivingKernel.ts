/** Single entry for manual driving and headless audit. This first implementation
 * wraps the existing arcade model; it does not certify the synthetic world as City.
 */
import { DRIVING_DT, DRIVING_PARAMS, stepDriving, type DrivingEnvironment, type DrivingInputState, type DrivingState } from "../DrivingSimulation";
export { DRIVING_DT } from "../DrivingSimulation";
export type KernelStep = Readonly<{
  state: Readonly<DrivingState>;
  motion: Readonly<{ blocked: boolean; reason: string | null }>;
}>;
export type KernelIdentity = Readonly<{
  baseSnapshotHash: string; vehicleConfigHash: string; kernelBuildId: string;
  physicsVersion: number; collisionVersion: number; queryVersion: number;
}>;
export class DrivingKernel {
  readonly identity: KernelIdentity;
  constructor(private readonly world: DrivingEnvironment, identity: KernelIdentity) {
    this.identity = Object.freeze({ ...identity });
  }
  step(previous: Readonly<DrivingState>, input: Readonly<DrivingInputState>): KernelStep {
    if (!validDrivingState(previous)) throw new Error("invalid-driving-state");
    let blocked = false; let reason: string | null = null;
    // Pass copies to the existing mutable adapter contract. Neither a pilot nor
    // an environment may mutate a live state held by the runner/runtime.
    const state = stepDriving({ ...previous }, {
      forward: input.forward === true, backward: input.backward === true,
      left: input.left === true, right: input.right === true,
    }, { move: (before, desired) => {
      const result = this.world.move({ ...before }, { ...desired });
      blocked = result.blocked; reason = result.reason ?? null;
      return { ...result };
    } });
    if (!validDrivingState(state)) throw new Error("invalid-driving-state");
    const maxStep = Math.max(DRIVING_PARAMS.maxForward, DRIVING_PARAMS.maxReverse) * DRIVING_DT + 1e-6;
    if (Math.hypot(state.x - previous.x, state.z - previous.z) > maxStep) {
      throw new Error("unexpected-position-jump");
    }
    return Object.freeze({ state: Object.freeze(state), motion: Object.freeze({ blocked, reason }) });
  }
}
export function validDrivingState(state: Readonly<DrivingState>): boolean {
  return [state.x, state.y, state.z, state.heading, state.speed, state.steering,
    state.distance, state.pitch, state.roll].every(Number.isFinite) &&
    typeof state.surfaceId === "string" && state.surfaceId.length > 0 &&
    typeof state.braking === "boolean" && typeof state.reversing === "boolean";
}
