#!/usr/bin/env node
// Execute the production layout, not a second implementation of its allocator.
import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = path.join(repo, "apps/desktop/ui-dev");
const { buildSync } = createRequire(path.join(ui, "package.json"))("esbuild");
const out = buildSync({ entryPoints: [path.join(ui, "react/src/features/city/engine/cityLayout.ts")], bundle: true, write: false, format: "cjs", platform: "node", logLevel: "silent" });
const mod = { exports: {} };
vm.runInNewContext(out.outputFiles[0].text, { module: mod, exports: mod.exports, process, console, setTimeout, clearTimeout });
const { layoutCity } = mod.exports;

function model(count, hosts = ["codex", "claude-code", "dsh", "plugin:zcode"]) {
  const buildings = Array.from({ length: count }, (_, index) => ({
    id: `session:${index}`, districtId: hosts[index % hosts.length], height: 2.6 + index % 46,
    footprint: 7.2, startedAt: index * 1000,
  }));
  return { buildings, districts: hosts.map((id) => ({ id, label: id, sessionCount: buildings.filter((b) => b.districtId === id).length, anomaly: null })) };
}
const addresses = (layout) => Object.fromEntries(layout.districts.flatMap((district) => [...district.slots].map(([id, p]) => [id, [p.id, p.x, p.z, p.yaw]])));
function validate(layout, input) {
  const all = layout.districts.flatMap((district) => [...district.slots]);
  assert.equal(all.length, input.buildings.length, "every building must be placed");
  assert.equal(new Set(all.map(([, p]) => p.id)).size, all.length, "addresses are unique");
  const nodes = new Map(layout.roadNodes.map((node) => [node.id, node]));
  const adjacency = new Map([...nodes.keys()].map((id) => [id, []]));
  for (const edge of layout.roadEdges) {
    assert(nodes.has(edge.from) && nodes.has(edge.to));
    adjacency.get(edge.from).push(edge.to); adjacency.get(edge.to).push(edge.from);
  }
  const queue = [layout.roadNodes[0].id]; const visited = new Set(queue);
  for (let index = 0; index < queue.length; index += 1) {
    for (const neighbor of adjacency.get(queue[index])) if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
  }
  assert.equal(visited.size, nodes.size, "surface road graph is connected across hosts");
  for (const [, parcel] of all) {
    assert(Number.isFinite(layout.terrain.height(parcel.x, parcel.z)));
    assert.equal(layout.terrain.height(parcel.x, parcel.z), 1.2, "buildings occupy the level coastal plain");
    for (const edge of layout.roadEdges) {
      const [a, b] = edge.points;
      // Parcel rectangle must not intersect even the widest street + sidewalk.
      if (a.x === b.x && parcel.z >= Math.min(a.z, b.z) && parcel.z <= Math.max(a.z, b.z)) {
        assert(Math.abs(parcel.x - a.x) >= parcel.width / 2 + edge.width / 2 + 1);
      } else if (a.z === b.z && parcel.x >= Math.min(a.x, b.x) && parcel.x <= Math.max(a.x, b.x)) {
        assert(Math.abs(parcel.z - a.z) >= parcel.depth / 2 + edge.width / 2 + 1);
      }
    }
  }
  const edgePairs = new Set(layout.roadEdges.map((edge) => [edge.from, edge.to].sort().join("/")));
  for (const district of layout.districts) for (const route of district.carPaths) {
    assert.deepEqual({ ...route[0] }, { ...route.at(-1) }, "traffic circuits close without teleporting");
    for (let index = 1; index < route.length; index += 1) {
      const ids = [route[index - 1], route[index]].map((p) => `${p.x}:${p.z}`).sort().join("/");
      assert(edgePairs.has(ids), "traffic follows rendered roads");
    }
  }
}

for (const [count, hosts] of [[0, []], [1, ["codex"]], [700], [1400, ["codex"]], [1480], [240, Array.from({ length: 12 }, (_, i) => `plugin:${i}`)]]) {
  const input = model(count, hosts); const layout = layoutCity(input); validate(layout, input);
  const reversed = { ...input, buildings: [...input.buildings].reverse(), districts: [...input.districts].reverse() };
  assert.deepEqual(addresses(layoutCity(reversed)), addresses(layout), "input order does not change a fresh layout");
}
const first = layoutCity(model(500));
const expandedInput = model(1400); const expanded = layoutCity(expandedInput, first);
validate(expanded, expandedInput);
for (const [id, address] of Object.entries(addresses(first))) assert.deepEqual(addresses(expanded)[id], address, "pagination retains existing addresses");
const changed = { ...expandedInput, buildings: expandedInput.buildings.map((building) => ({ ...building, height: 48, startedAt: 0 })) };
assert.deepEqual(addresses(layoutCity(changed, expanded)), addresses(expanded), "token growth and replay timing do not move buildings");
const additionalHost = model(1400, ["codex", "claude-code", "dsh", "plugin:zcode", "new-host"]);
validate(layoutCity(additionalHost, expanded), additionalHost);
console.log("City layout: full placement, unique lots, road clearance/connectivity, traffic and incremental stability passed.");
