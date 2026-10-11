import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";
const { inspectBlockPlacement } = await loadCity({ "engine/planner/blockPlacement.ts": ["inspectBlockPlacement"] });
const p = (x, z) => ({ x, z });
const base = { block: { polygon: [p(0, 0), p(80, 0), p(80, 80), p(0, 80)], holes: [] },
  footprint: { x: 40, z: 40, yaw: 0, width: 16, depth: 16 }, roads: [], sites: [], highways: [], buildable: () => true };
const check = (input, reason) => { const before = JSON.stringify(input), result = inspectBlockPlacement(input); assert.equal(JSON.stringify(input), before);
  assert.equal(result.ok, reason === undefined); if (reason) assert.equal(result.reason, reason); return result; };
assert.equal(check(base).terrainSamples, 289);
assert.ok(check({ ...base, footprint: { ...base.footprint, yaw: Math.PI / 4 } }).ok);
check({ ...base, footprint: { ...base.footprint, x: 3 } }, "rectangle-crosses-block-boundary");
check({ ...base, block: { ...base.block, holes: [[p(39, 39), p(41, 39), p(41, 41), p(39, 41)]] } }, "rectangle-crosses-hole");
const notch = [p(0, 0), p(80, 0), p(80, 80), p(41, 80), p(41, 45), p(39, 45), p(39, 80), p(0, 80)];
check({ ...base, block: { polygon: notch } }, "rectangle-crosses-block-boundary"); // All four corners inside, upper edge crosses notch.
check({ ...base, block: { polygon: notch }, footprint: { ...base.footprint, x: 18 } });
const road = points => ({ id: "road", from: "a", to: "b", width: 8, kind: "local", points });
check({ ...base, roads: [road([p(0, 70), p(40, 40), p(80, 70)])] }, "actual-road-capsule-conflict");
check({ ...base, roads: [road([p(0, 10), p(80, 10)])] });
check({ ...base, sites: [{ x: 48, z: 40, radius: 1 }] }, "declared-site-circle-conflict");
check({ ...base, highways: [[p(0, 40), p(80, 40)]] }, "highway-capsule-conflict");
check({ ...base, buildable: (x, z) => !(x === 40 && z === 40) }, "rectangle-terrain-or-reserve-conflict");
check({ ...base, reserved: q => q.x === 40 && q.z === 40 }, "rectangle-terrain-or-reserve-conflict");
check({ ...base, terrainSampleBudget: 1 }, "terrain-sample-budget-exhausted");
check({ ...base, cancelled: () => true }, "cancelled");
check({ ...base, footprint: { ...base.footprint, width: NaN } }, "invalid-footprint-or-budget");
const result = check(base); assert.equal(result.scope, "sampled-rectangle-and-declared-circle-proxies");
console.log("City block placement: full rectangle/corner/concavity/hole, actual curved road/site/highway, sampled interior, failclosed budget/cancel and immutable proposals passed.");
