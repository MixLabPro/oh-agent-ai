#!/usr/bin/env node
// Execute the production layout, not a second implementation of its allocator.
import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = path.join(repo, "apps/desktop/ui-dev");
const city = path.join(repo, "apps/agent-city/ui/src");
const { buildSync } = createRequire(path.join(ui, "package.json"))("esbuild");
const out = buildSync({ entryPoints: [path.join(city, "engine/cityLayout.ts")], bundle: true, write: false, format: "cjs", platform: "node", logLevel: "silent" });
const mod = { exports: {} };
vm.runInNewContext(out.outputFiles[0].text, { module: mod, exports: mod.exports, process, console, setTimeout, clearTimeout });
const { layoutCity } = mod.exports;

function model(count, harnesses = ["codex", "claude-code", "dsh", "plugin:zcode"]) {
  const buildings = Array.from({ length: count }, (_, index) => ({
    id: `session:${index}`, districtId: harnesses[index % harnesses.length], height: 2.6 + index % 46,
    footprint: 7.2, startedAt: index * 1000,
  }));
  return { buildings, districts: harnesses.map((id) => ({ id, label: id, sessionCount: buildings.filter((b) => b.districtId === id).length, anomaly: null })) };
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
  assert.equal(visited.size, nodes.size, "surface road graph is connected across harnesses");
  for (const [, parcel] of all) {
    assert(Number.isFinite(layout.terrain.height(parcel.x, parcel.z)));
    assert.equal(layout.terrain.height(parcel.x, parcel.z), 1.2, "buildings occupy the level coastal plain");
    // Parcel footprint (half-diagonal of width × depth) must clear every street + sidewalk, in any direction.
    // 曾只检查水平/竖直路段：街网一旦斜向（warp 后已是斜的，G2 起各片区朝向不同）这条断言就形同虚设。
    const halfDiagonal = Math.hypot(parcel.width, parcel.depth) / 2;
    for (const edge of layout.roadEdges) {
      const [a, b] = edge.points;
      const dx = b.x - a.x; const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((parcel.x - a.x) * dx + (parcel.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      const gap = Math.hypot(parcel.x - a.x - dx * t, parcel.z - a.z - dz * t);
      assert(gap >= halfDiagonal + edge.width / 2 + 0.5, `parcel ${parcel.id} overlaps road ${edge.id} (gap ${gap.toFixed(1)})`);
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

for (const [count, harnesses] of [[0, []], [1, ["codex"]], [700], [1400, ["codex"]], [1480], [240, Array.from({ length: 12 }, (_, i) => `plugin:${i}`)]]) {
  const input = model(count, harnesses); const layout = layoutCity(input); validate(layout, input);
  const reversed = { ...input, buildings: [...input.buildings].reverse(), districts: [...input.districts].reverse() };
  assert.deepEqual(addresses(layoutCity(reversed)), addresses(layout), "input order does not change a fresh layout");
}
const first = layoutCity(model(500));
// 分页追加在同一规模档位内（400 会话一档）必须不搬家；跨档时岛按原形状放大、整体重排（CITY_PLANNING_SPEC §4.2，
// 比例映射留待后续），所以这里用同档的 500 → 780。
const expandedInput = model(780); const expanded = layoutCity(expandedInput, first);
validate(expanded, expandedInput);
for (const [id, address] of Object.entries(addresses(first))) assert.deepEqual(addresses(expanded)[id], address, "pagination retains existing addresses");
const changed = { ...expandedInput, buildings: expandedInput.buildings.map((building) => ({ ...building, height: 48, startedAt: 0 })) };
assert.deepEqual(addresses(layoutCity(changed, expanded)), addresses(expanded), "token growth and replay timing do not move buildings");
const additionalHarness = model(1400, ["codex", "claude-code", "dsh", "plugin:zcode", "new-harness"]);
validate(layoutCity(additionalHarness, expanded), additionalHarness);
// 城市配套（学校/商场/医院）：数量随会话规模增长、只占没有会话楼的整街区、落成时刻随规模单调、刷新不搬家。
const civicCount = (count) => layoutCity(model(count)).civics.length;
assert.equal(civicCount(0), 0, "an empty city has no civic buildings");
// 规划城区约 1600 个地块：会话楼接近填满时空街区所剩无几，配套不挤占会话地块，数量随之封顶（1400 会话时约 11 座）。
assert(civicCount(90) < civicCount(300) && civicCount(300) < civicCount(700) && civicCount(700) < civicCount(1000), "civic buildings grow with the city until it runs out of empty blocks");
for (const layout of [first, expanded]) {
  const sessionBlocks = new Set(layout.districts.flatMap((district) => [...district.slots.values()].map((parcel) => parcel.blockId)));
  for (const civic of layout.civics) assert(!sessionBlocks.has(civic.parcelId), `${civic.id} must not share a block with session buildings`);
  assert.equal(new Set(layout.civics.map((civic) => civic.parcelId)).size, layout.civics.length, "one civic building per block");
  for (let index = 1; index < layout.civics.length; index += 1) assert(layout.civics[index].unlockAt >= layout.civics[index - 1].unlockAt, "civic buildings open in growth order");
}
const expandedBlocks = new Set(expanded.districts.flatMap((district) => [...district.slots.values()].map((parcel) => parcel.blockId)));
for (const civic of first.civics) {
  if (expandedBlocks.has(civic.parcelId)) continue;
  const again = expanded.civics.find((item) => item.id === civic.id);
  assert(again && again.parcelId === civic.parcelId, `${civic.id} keeps its block while the block stays free`);
}
// 个人化地形：每个用户一个随机种子（首次打开城市页生成并落盘）。任何种子下都必须是一座完整可用的城：
// 会话全部落位、公共用地与城区锚点不落进海里、同种子同输入得到同一座城。
for (const seed of [7, 42, 2026, 31337, 99991, 123456789, 4294967295]) {
  const input = model(700);
  const layout = layoutCity(input, null, seed);
  validate(layout, input);
  for (const site of layout.publicSites) assert(layout.terrain.height(site.x, site.z) > 0.5, `seed ${seed}: ${site.id} must sit on land`);
  for (const anchor of layout.districtAnchors) assert(layout.terrain.height(anchor.x, anchor.z) > 0.5, `seed ${seed}: district anchor must sit on land`);
  assert.deepEqual(addresses(layoutCity(input, null, seed)), addresses(layout), `seed ${seed}: deterministic`);
}
// 配套按服务半径铺开：同一座岛上任意两座配套至少隔 60，学校多数落在居住区、商场多数落在商业区/市中心。
{
  const layout = layoutCity(model(1000), null, 42);
  const civics = layout.civics;
  assert(civics.length >= 10, `enough civic buildings to judge spread (${civics.length})`);
  for (let i = 0; i < civics.length; i += 1) for (let j = i + 1; j < civics.length; j += 1) assert(Math.hypot(civics[i].x - civics[j].x, civics[i].z - civics[j].z) >= 60, "civic buildings keep their distance");
  const zoneOf = (civic) => layout.blocks.find((block) => block.id === civic.parcelId)?.zone;
  const schools = civics.filter((civic) => civic.kind === "school");
  const malls = civics.filter((civic) => civic.kind === "mall");
  assert(schools.filter((civic) => zoneOf(civic) === "residential").length >= schools.length / 2, "schools prefer residential blocks");
  // 岛上商业/市中心街区本就稀少（被会话楼占满），商场退而求其次落在海滨（沿海商业街）：这里只要求不落进居住区。
  assert(malls.filter((civic) => zoneOf(civic) !== "residential").length >= malls.length / 2, "malls prefer commercial, downtown or waterfront blocks");
}
// 跨档地址映射：整体长大而不是整体洗牌——每栋楼落在「放大后的原位置」附近。
{
  const before = layoutCity(model(700), null, 42);
  const after = layoutCity(model(900), before, 42);
  assert(after.scaleTier > before.scaleTier, "700 -> 900 sessions crosses a tier");
  const ratio = after.islandRadius / before.islandRadius;
  const was = new Map(before.districts.flatMap((d) => [...d.slots]));
  const now = new Map(after.districts.flatMap((d) => [...d.slots]));
  let moved = 0; let kept = 0;
  for (const [id, parcel] of was) {
    const next = now.get(id); if (!next) continue;
    kept += 1;
    if (Math.hypot(next.x - parcel.x * ratio, next.z - parcel.z * ratio) <= 120) moved += 1;
  }
  assert(kept >= 650, `buildings survive a tier change (${kept}/700)`);
  assert(moved / kept >= 0.9, `a tier change keeps buildings near their scaled position (${moved}/${kept})`);
}
// 跨档：同一种子从档位 2 到 4，岛只放大不变形（归一化轮廓逐点重合）。
{
  const small = layoutCity(model(700), null, 42); const big = layoutCity(model(1500), null, 42);
  assert(big.scaleTier > small.scaleTier, "more sessions move to a larger tier");
  const ratio = big.islandRadius / small.islandRadius;
  assert(ratio > 1.2, "a larger tier grows the island");
  small.coast.forEach((p, i) => { const q = big.coast[i]; assert(Math.hypot(q.x - p.x * ratio, q.z - p.z * ratio) < 0.5, "tier change scales the coast without reshaping it"); });
}
console.log("City layout: full placement, unique lots, road clearance/connectivity, traffic, incremental stability, civic growth and per-user seeds passed.");
