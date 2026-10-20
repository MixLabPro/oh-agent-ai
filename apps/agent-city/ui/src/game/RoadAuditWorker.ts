import type { CityDrivingSnapshot } from "../engine/surface/citySurfacePort";
import { buildSurfaceIndex } from "../engine/surface/SurfaceIndex";
import { buildSurfaceRegions } from "../engine/surface/surfaceRegions";
import { continuousAuditKeyFields, passabilityWorld } from "./driving/audit/RoadPassabilityAudit";
import { auditManifestForPlan, executeAuditPlan, planRoadAudit, type AuditPlan, type PlannerInput } from "./driving/audit/RoadAuditPlanner";
import { ROUTE_PILOT_CONTROLLER_VERSION } from "./driving/audit/RoutePilot";
import type { AuditKey } from "./driving/audit/contracts";

export type RoadAuditWorkerRequest = Readonly<{ snapshot: CityDrivingSnapshot; input: Omit<PlannerInput, "worldRevision">; runId: number }>;
export type RoadAuditWorkerMessage =
  | Readonly<{ type: "progress"; runId: number; result: ReturnType<typeof executeAuditPlan>["results"][number]; index: number; total: number }>
  | Readonly<{ type: "complete"; runId: number; report: ReturnType<typeof executeAuditPlan>; plan: AuditPlan; manifest: ReturnType<typeof auditManifestForPlan>; key: AuditKey }>
  | Readonly<{ type: "error"; runId: number; reason: string }>;

export function runRoadAuditWorker(request: RoadAuditWorkerRequest, postMessage: (message: RoadAuditWorkerMessage) => void): void {
  const { snapshot, input, runId } = request;
  try {
    const regions = buildSurfaceRegions(snapshot.surface, buildSurfaceIndex(snapshot.surface));
    const built = passabilityWorld(snapshot, regions, () => true);
    if (built.status !== "ready") {
      postMessage({ type: "error", runId, reason: "audit-world-unresolved" });
      return;
    }
    const plan = planRoadAudit({ ...input, worldRevision: snapshot.revision });
    const key: AuditKey = Object.freeze({ baseSnapshotHash: snapshot.revision, kernelBuildId: "city-road-audit-worker-v1",
      surfaceVersion: snapshot.surface.geometryVersion, controllerVersion: ROUTE_PILOT_CONTROLLER_VERSION,
      plannerVersion: plan.plannerVersion, observerVersion: 2, manifestHash: plan.manifestHash,
      releasePolicyVersion: 1, releaseBoundaryHash: null, ...continuousAuditKeyFields() });
    const report = executeAuditPlan(built.world, plan, () => key, {
      onResult(result, index, total) {
        postMessage({ type: "progress", runId, result, index: index + 1, total });
      },
    });
    const manifest = auditManifestForPlan(built.world, plan, key);
    postMessage({ type: "complete", runId, report, plan, manifest, key });
  } catch (error) {
    void error;
    postMessage({ type: "error", runId, reason: "audit-worker-failed" });
  }
}

// Guarding this registration keeps importing the pure worker entry in Node-based
// contract tests free of DOM/self side effects.
if (typeof self !== "undefined") self.onmessage = (event: MessageEvent<RoadAuditWorkerRequest>) =>
  runRoadAuditWorker(event.data, (message) => self.postMessage(message));
