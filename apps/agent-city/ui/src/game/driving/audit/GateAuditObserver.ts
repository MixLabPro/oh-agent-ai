import { freezeAuditCase } from "./AuditIdentity";
import { DRIVING_FOOTPRINT } from "../vehicleFootprint";
import type { DrivingState } from "../../DrivingSimulation";
import type { KernelStep } from "../DrivingKernel";
import type { AuditObserver, AuditWorldValidator, Observation, RoadAuditCase, StepValidation } from "./contracts";

/** A pilot cannot complete its own route. This observer requires an independent
 * world validator AND ordered, directional full-body gate crossings. */
export class GateAuditObserver implements AuditObserver {
  private nextGate = 0;
  private readonly test: RoadAuditCase;
  constructor(test: RoadAuditCase, private readonly world: AuditWorldValidator) {
    this.test = freezeAuditCase(test);
  }
  begin(state: Readonly<DrivingState>): StepValidation {
    return this.world.validateStart(state);
  }
  observe(previous: Readonly<DrivingState>, next: KernelStep): Observation {
    const validation = this.test.corridor.surfaceSequence.includes(next.state.surfaceId)
      ? this.world.validate(previous, next) : "route-deviation";
    const progress = this.world.progress(next.state);
    if (!Number.isFinite(progress)) return { status: "simulation-invalid", progress: 0, plannedStop: false };
    if (validation !== "valid") return { status: validation, progress, plannedStop: false };
    while (this.nextGate < this.test.gates.length) {
      const gate = this.test.gates[this.nextGate];
      const extent = (heading: number) => DRIVING_FOOTPRINT.halfLength * Math.abs(Math.cos(heading) * gate.forwardX + Math.sin(heading) * gate.forwardZ) +
        DRIVING_FOOTPRINT.halfWidth * Math.abs(-Math.sin(heading) * gate.forwardX + Math.cos(heading) * gate.forwardZ);
      const plane = (state: Readonly<DrivingState>) => (state.x - gate.x) * gate.forwardX + (state.z - gate.z) * gate.forwardZ - extent(state.heading);
      const before = plane(previous); const after = plane(next.state);
      if (!(before <= 0 && after > 0)) break;
      const t = -before / (after - before);
      const heading = previous.heading + (next.state.heading - previous.heading) * t;
      const x = previous.x + (next.state.x - previous.x) * t;
      const z = previous.z + (next.state.z - previous.z) * t;
      const lateral = Math.abs(-(x - gate.x) * gate.forwardZ + (z - gate.z) * gate.forwardX);
      const halfWidth = DRIVING_FOOTPRINT.halfLength * Math.abs(-Math.cos(heading) * gate.forwardZ + Math.sin(heading) * gate.forwardX) +
        DRIVING_FOOTPRINT.halfWidth * Math.abs(Math.sin(heading) * gate.forwardZ + Math.cos(heading) * gate.forwardX);
      const y = previous.y + (next.state.y - previous.y) * t;
      if (lateral + halfWidth > gate.halfWidth || Math.abs(y - gate.y) > gate.heightTolerance || !gate.surfaceIds.includes(next.state.surfaceId)) {
        return { status: "route-deviation", progress, plannedStop: false };
      }
      this.nextGate++;
    }
    return { status: this.nextGate === this.test.gates.length ? "complete" : "continue", progress, plannedStop: false };
  }
}
