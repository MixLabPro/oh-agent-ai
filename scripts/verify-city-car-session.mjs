#!/usr/bin/env node
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";
import { makeFixtures } from "./city-kit/surface-region-fixtures.mjs";
const m = await loadCity({
  "engine/surface/meshBoundaries.ts": ["extractMeshBoundaries"],
  "game/runtime/createCityCarSession.ts": ["createCityCarSession"],
  "game/runtime/GameRuntime.ts": ["GameRuntime"],
});
const { patch, grid, snapshot } = makeFixtures(m);
const surface = snapshot([patch("pad", "carriageway", grid(-30, -8, 30, 8, 10, 4))]);
function hostFixture(renderedSolids = []) {
  const state = { releases: 0, hooks: 0, current: true, hook: null };
  const world = { revision: "world-fixture", surface, obstacles: [], renderedSolids, landings: [], counts: {}, obstacleCoverage: renderedSolids.length ? "structures-and-rendered-buildings" : "structures-only" };
  const capture = { status: "ready", revision: surface.revision, worldRevision: world.revision,
    isCurrent: () => state.current,
    readWorld: () => state.current ? world : null,
    setFrameHook: (hook) => { state.hook = hook; if (hook) state.hooks++; },
    release: () => { if (!state.current) return; state.current = false; state.releases++; state.hook = null; } };
  return { state, host: { captureDrivingWorld: async () => capture } };
}
const request = { x: 0, z: 0, heading: 0, layerId: "ground",
  collider: { dimensions: { halfLength: 1.4, halfWidth: .7, halfHeight: .5 }, centerHeight: .55, vehicleConfigHash: "explicit-fixture-v1" }, present: () => {} };
{
  const f = hostFixture(); const runtime = new m.GameRuntime();
  const result = await m.createCityCarSession(f.host, runtime, request);
  assert.equal(result.status, "ready"); assert.equal(runtime.snapshot.phase, "paused");
  assert.equal(runtime.snapshot.revision, "world-fixture"); assert.equal(result.adapter.snapshot.surfaceId, "region:ground:pad");
  runtime.resume(); runtime.setInput({ forward: true }); f.state.hook(1/60);
  assert.ok(result.adapter.snapshot.x > 0);
  runtime.exit(); assert.equal(f.state.releases, 1); assert.equal(f.state.hook, null);
}
{
  // 2026-10-16 起：真实渲染几何已按逐实例保守盒并入碰撞（见
  // verify-city-car-rendered-collision.mjs）；本守卫的旧拒绝断言随之退役。
  // 这里改测非几何意义上的非法 renderedSolids（缺 positions/indices 的
  // 假对象）在转换层被 fail-closed 拒绝，不进入帧钩子。
  const f = hostFixture([Object.freeze({ id: "malformed-mesh", role: "building", positions: undefined, indices: undefined, transforms: new Float64Array(16) })]); const runtime = new m.GameRuntime();
  const result = await m.createCityCarSession(f.host, runtime, request);
  assert.equal(result.status, "unavailable"); assert.equal(result.reason, "invalid-rendered-solid");
  assert.equal(f.state.releases, 1, "entry refusal releases displayed geometry freeze");
  assert.equal(f.state.hooks, 0, "architecture without collision never starts a frame hook");
  assert.equal(runtime.snapshot.phase, "idle");
}
{
  const f = hostFixture(); const runtime = new m.GameRuntime();
  const result = await m.createCityCarSession(f.host, runtime, { ...request, x: 29.5 });
  assert.equal(result.status, "unavailable"); assert.equal(result.reason, "unsafe-car-spawn");
  assert.equal(f.state.releases, 1); assert.equal(f.state.hooks, 0);
}
{
  const f = hostFixture(); const runtime = new m.GameRuntime(); const abort = new AbortController();
  const result = await m.createCityCarSession(f.host, runtime, request, abort.signal);
  assert.equal(result.status, "ready"); abort.abort();
  assert.equal(runtime.snapshot.phase, "idle"); assert.equal(f.state.releases, 1);
}
console.log("City car bridge: structure fixture shares frozen world/kernel; architectural collision refusal, unsafe spawn and abort all release the lease");
