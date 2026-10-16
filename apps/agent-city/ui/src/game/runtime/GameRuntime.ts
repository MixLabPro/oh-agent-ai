/** Car lifecycle foundation for the future shared runtime. This does not activate
 * alongside GameSession or acquire a second rAF. The host lends one token-checked
 * frame hook; a real CityEngine scene lease is still required before city entry.
 */
import { DRIVING_DT, EMPTY_DRIVING_INPUT, type DrivingInputState } from "../DrivingSimulation";
import { FixedStepClock } from "./FixedStepClock";
import type { CarAdapter } from "./CarAdapter";

export type CarRuntimeLease = Readonly<{
  revision: string;
  isCurrent(): boolean;
  setFrameHook(hook: ((seconds: number) => void) | null): void;
  release(): void;
}>;
export type RuntimePhase = "idle" | "preparing" | "paused" | "running" | "error" | "disposed";
export type RuntimeSnapshot = Readonly<{ phase: RuntimePhase; runId: number; revision: string | null; reason: string | null }>;
type Session = { id: number; abort: AbortController; lease: CarRuntimeLease; adapter: CarAdapter; cleaned: boolean };
export class GameRuntime {
  private phase: RuntimePhase = "idle";
  private reason: string | null = null;
  private serial = 0;
  private session: Session | null = null;
  private input = { ...EMPTY_DRIVING_INPUT };
  private readonly clock = new FixedStepClock(DRIVING_DT);
  get snapshot(): RuntimeSnapshot {
    return Object.freeze({ phase: this.phase, runId: this.serial, revision: this.session?.lease.revision ?? null, reason: this.reason });
  }
  /** Takes ownership of both arguments, including on refusal/failure. A caller
   * must acquire a fresh lease/adapter to retry after world invalidation. */
  async enter(lease: CarRuntimeLease, adapter: CarAdapter): Promise<boolean> {
    if (this.phase !== "idle" && this.phase !== "error") {
      try { adapter.dispose(); } finally { lease.release(); }
      return false;
    }
    if (this.session) this.cleanup(this.session);
    const session: Session = { id: ++this.serial, abort: new AbortController(), lease, adapter, cleaned: false };
    this.session = session; this.phase = "preparing"; this.reason = null; this.clearInput(); this.clock.clear();
    try {
      if (lease.revision !== adapter.revision || !this.current(session)) throw new Error("stale-car-world");
      await adapter.prepare(session.abort.signal);
      if (this.session !== session || session.abort.signal.aborted) return false;
      if (!this.current(session)) throw new Error("stale-car-world");
      this.phase = "paused";
      lease.setFrameHook((seconds) => this.frame(session, seconds));
      adapter.present(1);
      if (this.session !== session || session.abort.signal.aborted) return false;
      if (!this.current(session)) throw new Error("stale-car-world");
      return true;
    } catch (error) {
      if (this.session === session) this.fail(session, error);
      return false;
    } finally {
      if (this.session !== session) this.cleanup(session);
    }
  }
  setInput(input: Readonly<DrivingInputState>): void {
    this.input = this.phase === "running" ? { forward: input.forward === true, backward: input.backward === true,
      left: input.left === true, right: input.right === true } : { ...EMPTY_DRIVING_INPUT };
  }
  clearInput(): void { this.input = { ...EMPTY_DRIVING_INPUT }; }
  pause(reason = "user-paused"): void {
    this.clearInput(); this.clock.clear();
    if (this.phase === "running" || this.phase === "paused") {
      this.phase = "paused"; this.reason = reason; this.session?.adapter.settle();
    }
  }
  resume(): boolean {
    const session = this.session;
    this.clearInput(); this.clock.clear();
    if (this.phase !== "paused" || !session) return false;
    if (!this.current(session)) { this.fail(session, new Error("stale-car-world")); return false; }
    this.phase = "running"; this.reason = null; return true;
  }
  reset(): boolean {
    const session = this.session;
    this.clearInput(); this.clock.clear();
    if (!session || (this.phase !== "paused" && this.phase !== "running")) return false;
    try {
      if (!this.current(session)) throw new Error("stale-car-world");
      session.adapter.reset(); session.adapter.present(1); return true;
    } catch (error) { this.fail(session, error); return false; }
  }
  exit(): void {
    const session = this.session;
    this.session = null; this.clearInput(); this.clock.clear();
    if (session) this.cleanup(session);
    if (this.phase !== "disposed") this.phase = "idle";
    this.reason = null;
  }
  dispose(): void { this.exit(); this.phase = "disposed"; }
  private current(session: Session): boolean {
    return this.session === session && !session.abort.signal.aborted && session.lease.isCurrent() && session.adapter.isCurrent();
  }
  private frame(session: Session, seconds: number): void {
    if (this.session !== session || (this.phase !== "running" && this.phase !== "paused")) return;
    try {
      if (!this.current(session)) throw new Error("stale-car-world");
      const frame = this.clock.advance(seconds, this.phase !== "running", () => {
        if (!this.current(session)) throw new Error("stale-car-world");
        session.adapter.fixedStep(this.input);
      });
      if (frame.pauseRequired) this.pause("long-frame");
      if (!this.current(session)) throw new Error("stale-car-world");
      session.adapter.present(frame.pauseRequired ? 1 : frame.alpha);
    } catch (error) { this.fail(session, error); }
  }
  private fail(session: Session, error: unknown): void {
    if (this.session !== session) return;
    this.clearInput(); this.clock.clear(); this.phase = "error";
    this.reason = error instanceof Error ? error.message : "car-runtime-error";
    this.session = null; this.cleanup(session);
  }
  private cleanup(session: Session): void {
    if (session.cleaned) return;
    session.cleaned = true; session.abort.abort();
    // Complete every cleanup stage even if a presentation/resource adapter fails.
    try { session.lease.setFrameHook(null); } catch { /* release also clears the hook */ }
    try { session.adapter.dispose(); } catch { /* host ownership must still return */ }
    try { session.lease.release(); } catch { /* cleanup is terminal and idempotent */ }
  }
}
