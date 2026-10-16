#!/usr/bin/env node
// E-line prereq: exact rendered building solids now JOIN car collision as
// per-instance conservative world boxes instead of refusing the session.
// Cases: ready coverage, building blocks motion, spawn inside building refused,
// budget fail-closed, empty renderedSolids stays structures-only, degenerate
// instances skipped-but-counted, no rendered path unchanged.
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";
import { makeFixtures } from "./city-kit/surface-region-fixtures.mjs";
const m = await loadCity({
  "engine/surface/renderedSolidObstacles.ts": ["renderedSolidsToObstacles", "RENDERED_OBSTACLE_LIMITS"],
  "engine/surface/meshBoundaries.ts": ["extractMeshBoundaries"],
  "game/runtime/createCityCarSession.ts": ["createCityCarSession"],
  "game/runtime/GameRuntime.ts": ["GameRuntime"],
});
const { patch, grid, snapshot } = makeFixtures(m);
const surface = snapshot([patch("pad", "carriageway", grid(-30, -8, 30, 8, 10, 4))]);

/** Two-instance building: local unit box with base at y=0, like the city's instanced boxes. */
function buildingSolid(id, at) {
  const positions = new Float32Array([-.5,0,-.5, .5,0,-.5, .5,0,.5, -.5,0,.5, -.5,1,-.5, .5,1,-.5, .5,1,.5, -.5,1,.5]);
  const indices = new Uint32Array([0,1,2, 0,2,3, 4,6,5, 4,7,6, 0,4,5, 0,5,1, 1,5,6, 1,6,2, 2,6,7, 2,7,3, 3,7,4, 3,4,0]);
  const transforms = new Float64Array(at.length * 16);
  for (let i = 0; i < at.length; i += 1) {
    const [x, z, sx, sy, sz] = at[i];
    const mat = [sx,0,0,0, 0,sy,0,0, 0,0,sz,0, x,0,z,1]; // column-major; scale then translate (y stays 0 base)
    transforms.set(mat, i * 16);
  }
  return { id, role: "building", positions, indices, transforms };
}

function hostFixture(renderedSolids = []) {
  const state = { releases: 0, hooks: 0, current: true, hook: null };
  const world = { revision: "world-fixture", surface, obstacles: [], sceneSolids: [], renderedSolids, landings: [], counts: {}, obstacleCoverage: renderedSolids.length ? "structures-and-rendered-buildings" : "structures-only" };
  const capture = { status: "ready", revision: surface.revision, worldRevision: world.revision,
    isCurrent: () => state.current,
    isLeaseCurrent: () => state.current,
    verifyCurrent: () => state.current,
    readWorld: () => state.current ? world : null,
    setFrameHook: (hook) => { state.hook = hook; if (hook) state.hooks++; },
    release: () => { if (!state.current) return; state.current = false; state.releases++; state.hook = null; } };
  return { state, host: { captureDrivingWorld: async () => capture } };
}
const request = (over = {}) => ({ x: 0, z: 0, heading: 0, layerId: "ground",
  collider: { dimensions: { halfLength: 1.4, halfWidth: .7, halfHeight: .5 }, centerHeight: .55, vehicleConfigHash: "explicit-fixture-v1" }, present: () => {}, ...over });

// Converter unit: two 6×20×6 buildings at (12,0) and (-12,4), one flat degenerate.
{
  const solid = buildingSolid("rendered:building:0:0", [[12, 0, 6, 20, 6], [-12, 4, 6, 20, 6], [0, 0, 6, 0, 6]]);
  const result = m.renderedSolidsToObstacles([solid]);
  assert.equal(result.status, "ready");
  assert.equal(result.instances, 2);
  assert.equal(result.skippedDegenerate, 1);
  const [a] = result.obstacles;
  assert.ok(a.corners.length === 8);
  const ys = a.corners.map((c) => c.y);
  assert.equal(Math.min(...ys), 0, "base at ground");
  assert.equal(Math.max(...ys), 20, "height 20 preserved through transform");
  const xs = a.corners.map((c) => c.x);
  assert.ok(Math.min(...xs) >= 12 - 3.01 && Math.max(...xs) <= 12 + 3.01, "x extents around instance origin");
}

// Budget fail-closed.
{
  const many = Array.from({ length: m.RENDERED_OBSTACLE_LIMITS.solids + 1 }, (_, i) => buildingSolid(`s${i}`, [[i, 0, 1, 1, 1]]));
  assert.equal(m.renderedSolidsToObstacles(many).status, "unavailable");
  const one = buildingSolid("many-instances", Array.from({ length: m.RENDERED_OBSTACLE_LIMITS.obstacles + 1 }, (_, i) => [i, 0, 1, 1, 1]));
  assert.equal(m.renderedSolidsToObstacles([one]).status, "unavailable");
  assert.equal(m.renderedSolidsToObstacles([buildingSolid("bad-transform", [[0, 0, 1, 1, 1]])], { obstacles: 2, solids: 2 }).status, "ready");
}

// Session: building on the pad → coverage structures-and-buildings; driving into
// the building is blocked by exact-instance collision; spawn inside refused.
{
  const solids = [buildingSolid("rendered:building:0:0", [[12, 0, 6, 20, 6]])];
  const f = hostFixture(solids); const runtime = new m.GameRuntime();
  const result = await m.createCityCarSession(f.host, runtime, request());
  assert.equal(result.status, "ready", JSON.stringify(result));
  assert.equal(result.coverage, "structures-and-buildings");
  runtime.resume();
  // Drive forward (heading 0 → +x) for 3 simulated seconds: car must stop before x≈9.
  runtime.setInput({ forward: true });
  for (let i = 0; i < 180; i += 1) f.state.hook(1 / 60);
  const snap = result.adapter.snapshot;
  assert.ok(snap.x < 9.2, `car must not enter building, x=${snap.x}`);
  assert.ok(snap.x > 5, `car should approach the building, x=${snap.x}`);
  runtime.exit();
  assert.equal(f.state.releases, 1);
}
{
  // Spawn point inside the building footprint is refused before any hook runs.
  const solids = [buildingSolid("rendered:building:0:0", [[0, 0, 6, 20, 6]])];
  const f = hostFixture(solids); const runtime = new m.GameRuntime();
  const result = await m.createCityCarSession(f.host, runtime, request());
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "unsafe-car-spawn");
  assert.equal(f.state.hooks, 0);
  assert.equal(f.state.releases, 1);
}
{
  // No rendered solids: behaviour identical to before (structures-only).
  const f = hostFixture(); const runtime = new m.GameRuntime();
  const result = await m.createCityCarSession(f.host, runtime, request());
  assert.equal(result.status, "ready");
  assert.equal(result.coverage, "structures-only");
  runtime.exit();
}
{
  // Over-budget rendered solids fail closed with a distinct reason, no hook.
  const over = [buildingSolid("rendered:building:0:0", Array.from({ length: m.RENDERED_OBSTACLE_LIMITS.obstacles + 1 }, (_, i) => [i, 0, 1, 1, 1]))];
  const f = hostFixture(over); const runtime = new m.GameRuntime();
  const result = await m.createCityCarSession(f.host, runtime, request());
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "rendered-solids-budget");
  assert.equal(f.state.hooks, 0);
  assert.equal(f.state.releases, 1);
}
console.log("City car rendered-solids collision: converter bounds/budgets, structures-and-buildings coverage, building blocks motion and spawn, empty path unchanged");
