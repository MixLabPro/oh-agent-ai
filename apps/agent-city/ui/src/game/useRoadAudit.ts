import { useCallback, useEffect, useRef, useState } from "react";
import type { CityEngine } from "../engine/CityEngine";
import type { ReadyCitySurfaceCapture } from "../engine/surface/citySurfacePort";
import type { AuditKey } from "./driving/audit/contracts";
import type { AuditPlan, AuditPlanReport } from "./driving/audit/RoadAuditPlanner";
import type { AuditManifest } from "./driving/audit/contracts";
import type { PassabilityResult } from "./driving/audit/RoadPassabilityAudit";
import type { PublishedDrivingGraph } from "./driving/audit/ReleasedDrivingGraph";
import type { RoadAuditWorkerMessage } from "./RoadAuditWorker";
import { auditMustInvalidate, clearOwnedCaptureResources, RoadAuditRunLock } from "./RoadAuditLifecycle";

export type RoadAuditStatus = "not-run" | "capturing" | "running" | "complete" | "stale" | "cancelled" | "error";
export type RoadAuditSnapshot = Readonly<{
  status: RoadAuditStatus; results: readonly PassabilityResult[]; completed: number; total: number;
  report: AuditPlanReport | null; plan: AuditPlan | null; manifest: AuditManifest | null; key: AuditKey | null;
  reason: string | null; capture: ReadyCitySurfaceCapture | null; publishedGraph: PublishedDrivingGraph | null;
}>;
type WorldCapture = Extract<Awaited<ReturnType<CityEngine["captureDrivingWorld"]>>, { status: "ready" }>;
const MAX_AUDIT_MS = 5 * 60_000;

/** Bounded local audit runner. Heavy planning and simulation run in a worker;
 * terminating that worker is the cancellation primitive. A run retains its
 * frozen-world lease only while results are being inspected or consumed. */
export function useRoadAudit(engineRef: React.RefObject<CityEngine | null>, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<RoadAuditSnapshot>({ status: "not-run", results: [], completed: 0, total: 0,
    report: null, plan: null, manifest: null, key: null, reason: null, capture: null, publishedGraph: null });
  const workerRef = useRef<Worker | null>(null);
  const captureRef = useRef<WorldCapture | null>(null);
  const captureAbortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const freshnessRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lifecycleRef = useRef(new RoadAuditRunLock());
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const releaseCapture = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (freshnessRef.current) clearInterval(freshnessRef.current);
    timeoutRef.current = null; freshnessRef.current = null;
    captureAbortRef.current?.abort(); captureAbortRef.current = null;
    captureRef.current?.release(); captureRef.current = null;
    workerRef.current?.terminate(); workerRef.current = null;
  }, []);
  const cancel = useCallback((status: "cancelled" | "stale" = "cancelled", reason = "") => {
    lifecycleRef.current.invalidate();
    releaseCapture();
    setSnapshot((old) => status === "stale"
      ? { status, results: [], completed: 0, total: 0, report: null, plan: null, manifest: null, key: null, reason: reason || null, capture: null, publishedGraph: null }
      : { ...old, status, reason: reason || null, capture: null, publishedGraph: null });
  }, [releaseCapture]);

  const run = useCallback(async () => {
    if (!engineRef.current) return;
    const runId = lifecycleRef.current.begin(enabledRef.current);
    if (runId === null) return;
    releaseCapture();
    setSnapshot({ status: "capturing", results: [], completed: 0, total: 0, report: null, plan: null, manifest: null, key: null, reason: null, capture: null, publishedGraph: null });
    let captured: Awaited<ReturnType<CityEngine["captureDrivingWorld"]>>;
    const captureAbort = new AbortController();
    captureAbortRef.current = captureAbort;
    const captureTimeout = setTimeout(() => {
      if (lifecycleRef.current.isCurrent(runId)) cancel("cancelled", "audit-time-limit");
    }, MAX_AUDIT_MS);
    timeoutRef.current = captureTimeout;
    try { captured = await engineRef.current.captureDrivingWorld(captureAbort.signal); }
    catch {
      if (!clearOwnedCaptureResources(lifecycleRef.current.isCurrent(runId), timeoutRef, captureAbortRef, captureTimeout, captureAbort, clearTimeout)) return;
      if (lifecycleRef.current.finish(runId)) setSnapshot((old) => ({ ...old, status: "error", reason: "capture-failed" }));
      return;
    }
    if (!lifecycleRef.current.isCurrent(runId)) { if (captured.status === "ready") captured.release(); return; }
    clearOwnedCaptureResources(true, timeoutRef, captureAbortRef, captureTimeout, captureAbort, clearTimeout);
    if (captured.status !== "ready") { lifecycleRef.current.finish(runId); setSnapshot((old) => ({ ...old, status: "error", reason: `capture-${captured.status}` })); return; }
    captureRef.current = captured;
    const snapshot = captured.readWorld();
    const layout = engineRef.current?.currentLayout;
    if (!snapshot || !layout || !captured.isLeaseCurrent()) { captured.release(); captureRef.current = null; lifecycleRef.current.finish(runId); setSnapshot((old) => ({ ...old, status: "stale", reason: "capture-stale" })); return; }
    const structurePaths: Record<string, readonly { x: number; z: number }[]> = {};
    layout.highways?.forEach((points, index) => { structurePaths[`expressway:${index}`] = points; });
    layout.highwayRamps?.forEach((ramp, index) => { structurePaths[`ramp:${index}`] = ramp.points; });
    let worker: Worker;
    try { worker = new Worker(new URL("./RoadAuditWorker.ts", import.meta.url), { type: "module" }); }
    catch { captured.release(); captureRef.current = null; lifecycleRef.current.finish(runId); setSnapshot((old) => ({ ...old, status: "error", reason: "worker-unavailable" })); return; }
    workerRef.current = worker;
    setSnapshot((old) => ({ ...old, status: "running", capture: captured }));
    const workerTimeout = setTimeout(() => {
      if (lifecycleRef.current.isCurrent(runId)) cancel("cancelled", "audit-time-limit");
    }, MAX_AUDIT_MS);
    timeoutRef.current = workerTimeout;
    const freshness = setInterval(() => {
      if (lifecycleRef.current.sameGeneration(runId) && captureRef.current === captured && !captured.isLeaseCurrent())
        cancel("stale", "world-revision-changed");
    }, 500);
    freshnessRef.current = freshness;
    worker.onmessage = (event: MessageEvent<RoadAuditWorkerMessage>) => {
      const message = event.data;
      if (message.runId !== runId || !lifecycleRef.current.isCurrent(runId)) return;
      if (message.type === "progress") {
        if (!captured.isLeaseCurrent()) { cancel("stale", "world-revision-changed"); return; }
        setSnapshot((old) => old.status === "running" ? { ...old, results: [...old.results, message.result], completed: message.index, total: message.total } : old);
      } else if (message.type === "complete") {
        if (!captured.isLeaseCurrent()) { cancel("stale", "world-revision-changed"); return; }
        let verified = false;
        try { verified = captured.verifyCurrent(); } catch { /* A failed deep check invalidates the result. */ }
        if (!captured.isLeaseCurrent() || !verified) { cancel("stale", "world-revision-changed"); return; }
        if (timeoutRef.current === workerTimeout) { clearTimeout(workerTimeout); timeoutRef.current = null; }
        worker.terminate(); workerRef.current = null;
        lifecycleRef.current.finish(runId);
        setSnapshot((old) => ({ ...old, status: "complete", report: message.report, plan: message.plan, manifest: message.manifest, key: message.key,
          completed: message.report.results.length, total: message.plan.routes.length, capture: captured }));
      } else {
        releaseCapture();
        lifecycleRef.current.finish(runId);
        setSnapshot((old) => ({ ...old, status: "error", reason: message.reason, capture: null }));
      }
    };
    worker.onerror = () => { if (lifecycleRef.current.isCurrent(runId)) cancel("cancelled", "audit-worker-failed"); };
    try {
      const request = structuredClone({ runId, snapshot, input: { roadEdges: layout.roadEdges, landings: snapshot.landings, structurePaths } });
      worker.postMessage(request);
    } catch {
      releaseCapture();
      lifecycleRef.current.finish(runId);
      setSnapshot((old) => ({ ...old, status: "error", reason: "snapshot-not-cloneable", capture: null }));
    }
  }, [cancel, engineRef, releaseCapture]);

  useEffect(() => {
    if (auditMustInvalidate(enabled, lifecycleRef.current.active, !!captureRef.current)) cancel("stale", "audit-disabled");
  }, [enabled, cancel, releaseCapture]);
  useEffect(() => () => { lifecycleRef.current.invalidate(); releaseCapture(); }, [releaseCapture]);
  return { snapshot, run, cancel } as const;
}
