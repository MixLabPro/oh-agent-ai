#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { cachedPlan, kitStats, loadCity, snapshotCachedPlans, assertCachedPlansUnchanged } from "./city-kit/index.mjs";
import { manifest, selectStages } from "./city-kit/verification.mjs";

assert.equal(new Set(manifest.map((s) => s.id)).size, manifest.length);
assert.deepEqual(selectStages("full").map((s) => s.id), manifest.map((s) => s.id));
assert.throws(() => selectStages("module", "unknown"));
for (const group of ["network", "sites", "planning", "display", "game"]) assert(selectStages("module", group).length > 0);
assert(manifest.some((s) => s.env.CITY_SEASIDE_TIER === "10"));
assert(manifest.some((s) => s.file === "verify-city-cross-engine.mjs" && !s.shared));
assert(manifest.some((s) => s.file === "verify-city-solve.mjs" && !s.shared));
// Preserve all 32 original stages plus six game guards, exact terrain regression, and the physical-declaration guard.
assert.equal(manifest.length, 41);
assert(manifest.some((s) => s.id === "verify-city-road-report"));
assert.equal(selectStages("module", "game").length, 6);
let calls = 0;
const factory = (seed, tier, config, opts) => ({ seed, tier, config: { ...config }, opts, call: ++calls });
const c = { margin: 1, version: 2 };
const a = cachedPlan(factory, 1, 1, c);
const beforeMutation = snapshotCachedPlans();
a.seed = 2;
assert.throws(() => assertCachedPlansUnchanged(beforeMutation), /mutated/);
a.seed = 1;
assertCachedPlansUnchanged(beforeMutation);
assert.equal(cachedPlan(factory, 1, 1, { version: 2, margin: 1 }), a);
c.margin = 2;
assert.notEqual(cachedPlan(factory, 1, 1, c), a);
assert.notEqual(cachedPlan(factory, 1, 1, c, { skipSolve: true }), a);
assert.notEqual(cachedPlan(() => ({ other: true }), 1, 1, c), a);
let failures = 0;
const broken = () => { failures++; throw new Error("injected"); };
for (let i = 0; i < 2; i++) assert.throws(() => cachedPlan(broken, 1, 1, c), /injected/);
assert.equal(failures, 2);
const before = process.env.CITY_KIT_NO_CACHE;
process.env.CITY_KIT_NO_CACHE = "1";
assert.notEqual(cachedPlan(factory, 1, 1, c), cachedPlan(factory, 1, 1, c));
if (before === undefined) delete process.env.CITY_KIT_NO_CACHE; else process.env.CITY_KIT_NO_CACHE = before;
for (let i = 0; i < 70; i++) cachedPlan(factory, i, 1, c);
assert(kitStats().cachedPlans <= 64);

// Different export bundles must reuse the same generation without invoking the
// cache for the independent determinism comparison.
const x = await loadCity({ "engine/cityPlan.ts": ["createCityPlan"], "engine/citySeaside.ts": ["MIAMI_COASTAL"] });
const y = await loadCity({ "engine/cityPlan.ts": ["createCityPlan"], "engine/citySeaside.ts": ["MIAMI_COASTAL"], "engine/planner/constraints.ts": ["CONSTRAINTS"] });
const p = cachedPlan(x.createCityPlan, 1703294958, 1, x.MIAMI_COASTAL);
const snapshot = JSON.stringify(p);
const q = cachedPlan(y.createCityPlan, 1703294958, 1, y.MIAMI_COASTAL);
assert.equal(p, q);
for (const constraint of y.CONSTRAINTS) constraint.measure(q);
assert.equal(JSON.stringify(p), snapshot, "read-only constraints must not contaminate the shared plan");
assert.equal(JSON.stringify(y.createCityPlan(1703294958, 1, y.MIAMI_COASTAL)), snapshot, "uncached generation agrees with reused plan");
for (const stage of manifest) assert(fs.existsSync(new URL("./" + stage.file, import.meta.url)));
console.log("City verification: manifest coverage, config mutation/factory/options isolation, failures uncached, LRU, cross-bundle reuse and uncached equivalence passed.");
