/** Renderer-independent car adapter. The runtime owns input and the frame clock.
 * A binding must contain one frozen environment/kernel identity; changing worlds
 * requires a new adapter, never replacing an environment underneath a live car.
 */
import { DrivingKernel, validDrivingState } from "../driving/DrivingKernel";
import type { DrivingInputState, DrivingState } from "../DrivingSimulation";

export type CarWorldBinding = Readonly<{
  revision: string;
  kernel: DrivingKernel;
  isCurrent(): boolean;
  /** Uses the same frozen support/collision facts as the kernel. */
  validateSpawn(state: Readonly<DrivingState>): boolean;
}>;
export type CarPresentation = Readonly<{
  revision: string;
  state: Readonly<DrivingState>;
  blocked: boolean;
  reason: string | null;
}>;
export class CarAdapter {
  private state: Readonly<DrivingState>;
  private previous: Readonly<DrivingState>;
  private prepared = false;
  private disposed = false;
  private blocked = false;
  private reason: string | null = null;
  readonly revision: string;
  constructor(private readonly binding: CarWorldBinding, private readonly spawn: Readonly<DrivingState>,
    private readonly render: (frame: CarPresentation) => void) {
    this.binding = Object.freeze({ ...binding });
    this.revision = binding.revision;
    this.spawn = Object.freeze({ ...spawn });
    this.state = this.previous = this.spawn;
  }
  isCurrent(): boolean { return !this.disposed && this.binding.isCurrent(); }
  get snapshot(): Readonly<DrivingState> { return Object.freeze({ ...this.state }); }
  async prepare(signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw new Error("prepare-aborted");
    this.assertCurrent();
    if (!this.revision || !validDrivingState(this.spawn) || this.spawn.speed !== 0 ||
      !this.binding.validateSpawn(this.spawn)) throw new Error("unsafe-car-spawn");
    this.assertCurrent();
    if (signal.aborted) throw new Error("prepare-aborted");
    this.prepared = true;
  }
  fixedStep(input: Readonly<DrivingInputState>): void {
    this.assertReady();
    const result = this.binding.kernel.step(this.state, input);
    // A query may synchronously invalidate the captured world. Never commit or
    // display that step, even when its numerical result looks valid.
    this.assertCurrent();
    this.previous = this.state; this.state = result.state;
    this.blocked = result.motion.blocked; this.reason = result.motion.reason;
  }
  present(alpha: number): void {
    this.assertReady();
    // A future verified portal transition must not synthesize a pose between
    // different support handles. Present the accepted endpoint until that
    // transition provides an explicitly validated presentation trajectory.
    const t = this.previous.surfaceId !== this.state.surfaceId ? 1 :
      Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
    const state = { ...this.state };
    for (const key of ["x", "y", "z", "heading", "pitch", "roll", "steering", "distance"] as const) {
      state[key] = this.previous[key] + (this.state[key] - this.previous[key]) * t;
    }
    const delta = this.state.heading - this.previous.heading;
    state.heading = this.previous.heading + Math.atan2(Math.sin(delta), Math.cos(delta)) * t;
    this.render(Object.freeze({ revision: this.revision, state: Object.freeze(state), blocked: this.blocked, reason: this.reason }));
  }
  reset(): void {
    this.assertReady();
    if (!this.binding.validateSpawn(this.spawn)) throw new Error("unsafe-car-spawn");
    this.assertCurrent();
    this.state = this.previous = this.spawn; this.blocked = false; this.reason = null;
  }
  /** Drop interpolation history when paused, avoiding a visible backward snap. */
  settle(): void { this.previous = this.state; }
  dispose(): void { this.disposed = true; this.prepared = false; }
  private assertCurrent(): void { if (!this.isCurrent()) throw new Error("stale-car-world"); }
  private assertReady(): void {
    this.assertCurrent();
    if (!this.prepared) throw new Error("car-not-prepared");
  }
}
