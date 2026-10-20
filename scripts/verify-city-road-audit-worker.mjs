#!/usr/bin/env node
// Worker regression: the exact structured-clone payload used by CityApp can
// cross a worker boundary, and importing/running the worker contract has no DOM
// dependency while producing real planner/audit results.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadCity } from "./city-kit/index.mjs";
import { makeFixtures } from "./city-kit/surface-region-fixtures.mjs";

const city = await loadCity({
  "engine/surface/meshBoundaries.ts": ["extractMeshBoundaries"],
  "game/RoadAuditWorker.ts": ["runRoadAuditWorker"],
  "game/RoadAuditLifecycle.ts": ["RoadAuditRunLock", "clearOwnedCaptureResources", "auditMustInvalidate"],
});
assert.equal(typeof globalThis.self, "undefined", "worker module import must not require a DOM worker global");
const lifecycle = new city.RoadAuditRunLock();
const pending = lifecycle.begin(true);
assert.notEqual(pending, null);
assert.equal(lifecycle.begin(true), null, "a second click during async capture cannot start a competing run");
lifecycle.invalidate();
assert.equal(lifecycle.isCurrent(pending), false, "cancel invalidates late capture completion");
assert.equal(lifecycle.finish(pending), false, "stale capture cannot finish over a newer run");
assert.equal(lifecycle.begin(false), null, "disabled scene modes reject new audits");
const next = lifecycle.begin(true);
assert.equal(lifecycle.finish(next), true, "current run can finish exactly once");
assert.equal(lifecycle.active, false);
assert.equal(city.auditMustInvalidate(false, lifecycle.active, true), true, "disabling after completion invalidates a retained capture");
assert.equal(city.auditMustInvalidate(true, lifecycle.active, true), false, "enabled completed snapshot remains inspectable");
const oldRun = lifecycle.begin(true);
const slots = { timer: { current: "old-timeout" }, abort: { current: "old-abort" } };
lifecycle.invalidate();
const currentRun = lifecycle.begin(true);
slots.timer.current = "new-timeout"; slots.abort.current = "new-abort";
const cleared = [];
assert.equal(city.clearOwnedCaptureResources(lifecycle.isCurrent(oldRun), slots.timer, slots.abort,
  "old-timeout", "old-abort", (timer) => cleared.push(timer)), false, "late old capture cannot clean shared resources");
assert.deepEqual(slots, { timer: { current: "new-timeout" }, abort: { current: "new-abort" } });
assert.deepEqual(cleared, []);
assert.equal(city.clearOwnedCaptureResources(lifecycle.isCurrent(currentRun), slots.timer, slots.abort,
  "new-timeout", "new-abort", (timer) => cleared.push(timer)), true, "current capture cleans only its own resources");
assert.deepEqual(slots, { timer: { current: null }, abort: { current: null } });
assert.deepEqual(cleared, ["new-timeout"]);
const hookSource = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "../apps/agent-city/ui/src/game/useRoadAudit.ts"), "utf8");
assert.equal((hookSource.match(/\.verifyCurrent\(\)/g) ?? []).length, 1, "deep capture verification runs once at completion");
assert.equal((hookSource.match(/clearOwnedCaptureResources\(/g) ?? []).length, 2, "capture success and failure both use run-owned cleanup");
const { grid, patch } = makeFixtures(city);
const surface = { revision: "worker-surface", geometryVersion: 1,
  patches: [patch("road", "carriageway", grid(-50, -5, 50, 5, 40, 4))],
  portals: [], renderBatches: [], report: { candidateLength: 100, geometricallyEligibleLength: 100, issues: [] } };
const snapshot = { revision: "worker-world", surface, obstacles: [], landings: [],
  counts: { bridges: 0, expresswaySegments: 0, flares: 0, islands: 0, culDeSacs: 0 },
  obstacleCoverage: "structures-and-rendered-buildings", renderedSolids: [], sceneSolids: [] };
const input = { roadEdges: [{ id: "road", from: "west", to: "east", width: 6, points: [{ x: -40, z: 0 }, { x: 40, z: 0 }] }],
  landings: [], structurePaths: {} };
const request = structuredClone({ runId: 17, snapshot, input });
assert.ok(request.snapshot.surface.patches[0].vertices instanceof Float32Array, "typed surface geometry survives structured clone");
assert.ok(request.snapshot.surface.patches[0].indices instanceof Uint32Array, "surface indices survive structured clone");
const messages = [];
city.runRoadAuditWorker(request, (message) => messages.push(structuredClone(message)));
assert.ok(messages.some((message) => message.type === "progress"), "worker streams actual case results");
const completed = messages.find((message) => message.type === "complete");
assert.ok(completed, JSON.stringify(messages.find((message) => message.type === "error")));
assert.equal(completed.report.worldRevision, snapshot.revision);
assert.equal(completed.report.manifestHash, completed.plan.manifestHash);
assert.equal(completed.report.results.length, completed.plan.routes.length);
assert.ok(completed.report.results.every((result) => result.key.manifestHash === completed.manifest.key.manifestHash));
console.log("city road audit worker serialization and execution guard passed");
