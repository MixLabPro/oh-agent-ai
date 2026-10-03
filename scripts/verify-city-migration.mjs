import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildSync } = createRequire(path.join(repo, "apps/desktop/ui-dev/package.json"))("esbuild");
function load(file) {
  const source = buildSync({ entryPoints: [path.join(repo, "apps/agent-city/ui/src", file)], bundle: true,
    write: false, format: "cjs", platform: "node" }).outputFiles[0].text;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, console, Date });
  return module.exports;
}
const { replayStartMs } = load("replayRange.ts");
const from = new Date(2025, 9, 3).getTime(), to = new Date(2026, 9, 3).getTime();
const event = new Date(2026, 8, 15, 12).toISOString();
assert.equal(replayStartMs([{ first_event_at: event }], from, to), new Date(2026, 8, 15).getTime());
assert.equal(replayStartMs([], from, to), from);
assert.equal(replayStartMs([{ first_event_at: "bad" }], from, to), from);
assert.equal(replayStartMs([{ first_event_at: new Date(from - 86400000).toISOString() }], from, to), from);
assert.equal(replayStartMs([{ first_event_at: new Date(to + 86400000).toISOString() }], from, to), from);
const { CityWildlife } = load("engine/cityWildlife.ts");
const loop = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }, { x: 0, z: 100 }];
const wildlife = new CityWildlife({ x: 50, z: 50 }, 150, [], [], [loop], () => 3);
const wings = wildlife.group.getObjectByName("city-bird-wings");
const birds = wildlife.group.getObjectByName("city-birds");
const people = wildlife.group.getObjectByName("city-pedestrians");
assert.equal(wings.count, birds.count * 2);
assert.ok(people.count > 0 && people.count <= 220);
wildlife.setNight(0, to); wildlife.update(0, 0);
const start = Array.from(people.instanceMatrix.array);
const wingStart = Array.from(wings.instanceMatrix.array);
wildlife.update(1, 1);
assert.notDeepEqual(Array.from(wings.instanceMatrix.array), wingStart);
assert.notDeepEqual(Array.from(people.instanceMatrix.array), start);
wildlife.update(0, 0);
assert.deepEqual(Array.from(people.instanceMatrix.array), start, "replay/export rewind is deterministic");
let disposed = 0;
for (const mesh of [birds, wings, people]) {
  mesh.geometry.addEventListener("dispose", () => disposed++);
  mesh.material.addEventListener("dispose", () => disposed++);
}
wildlife.dispose(); assert.equal(disposed, 6);
const empty = new CityWildlife({ x: 0, z: 0 }, 150, [], [], [], () => 0);
assert.equal(empty.group.getObjectByName("city-pedestrians"), undefined); empty.dispose();
console.log("City migration: passed (data-driven/clamped replay, flapping wings, bounded moving walkers, rewind, disposal, empty scene).");
