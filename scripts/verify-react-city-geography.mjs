#!/usr/bin/env node
// 种子地理守卫（CITY_PLANNING_SPEC §6）：不同种子必须是明显不同的岛，任何种子都是完整可用的城。
// 曾经海岸是写死折线 + ±19 抖动，30 个种子的轮廓几乎完全重合——截图里「每个人的岛都一样」。
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
vm.runInNewContext(out.outputFiles[0].text, { module: mod, exports: mod.exports, process, console, Math, Map, Set });
const { layoutCity } = mod.exports;

const harnesses = ["codex", "claude-code", "dsh", "harness:zcode"];
const model = (count) => {
  const buildings = Array.from({ length: count }, (_, i) => ({ id: `s${i}`, districtId: harnesses[i % harnesses.length], height: 3 + (i * 37) % 44, footprint: 7.2, startedAt: i * 1000 }));
  return { buildings, districts: harnesses.map((id) => ({ id, label: id, sessionCount: buildings.filter((b) => b.districtId === id).length, anomaly: null })) };
};

/** 海岸轮廓的世界坐标极坐标剖面：72 个方位上的半径，按均值归一化（只比形状，不比大小）。 */
function profile(coast) {
  const cx = coast.reduce((a, p) => a + p.x, 0) / coast.length;
  const cz = coast.reduce((a, p) => a + p.z, 0) / coast.length;
  const polar = coast.map((p) => ({ a: Math.atan2(p.z - cz, p.x - cx), r: Math.hypot(p.x - cx, p.z - cz) })).sort((u, v) => u.a - v.a);
  const samples = [];
  for (let k = 0; k < 72; k += 1) {
    const a = -Math.PI + (k / 72) * Math.PI * 2;
    let lo = polar[polar.length - 1]; let hi = polar[0];
    for (let i = 0; i < polar.length; i += 1) if (polar[i].a >= a) { hi = polar[i]; lo = polar[(i - 1 + polar.length) % polar.length]; break; }
    const span = ((hi.a - lo.a) + Math.PI * 2) % (Math.PI * 2) || 1;
    const t = (((a - lo.a) + Math.PI * 2) % (Math.PI * 2)) / span;
    samples.push(lo.r + (hi.r - lo.r) * t);
  }
  const mean = samples.reduce((x, y) => x + y, 0) / samples.length;
  return samples.map((r) => r / mean - 1);
}
function correlation(a, b) {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0)); const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return dot / (na * nb || 1);
}

const seeds = [1485618003, ...Array.from({ length: 30 }, (_, i) => (i * 2654435761 + 12345) >>> 0 || 1)];
const profiles = [];
const biomes = new Set();
const landmarkKinds = new Set();
let rivers = 0;
for (const seed of seeds) {
  const input = model(700);
  const layout = layoutCity(input, null, seed);
  const placed = layout.districts.reduce((sum, d) => sum + d.slots.size, 0);
  assert.equal(placed, 700, `seed ${seed}: every session gets a lot (${placed}/700)`);
  for (const site of layout.publicSites) assert(layout.terrain.buildable(site.x, site.z) || layout.terrain.height(site.x, site.z) > 0.5, `seed ${seed}: ${site.id} on land`);
  for (const bridge of layout.bridges) {
    const mid = { x: (bridge.from.x + bridge.to.x) / 2, z: (bridge.from.z + bridge.to.z) / 2 };
    assert(layout.terrain.height(mid.x, mid.z) < 0.5, `seed ${seed}: bridge spans water`);
  }
  // 小区连片且彼此分开：曾按固定锚点就近落楼，两个城区挤成一团、标签重叠（seed 42）。
  const centers = layout.districts.filter((d) => d.slots.size).map((d) => {
    const pts = [...d.slots.values()];
    return { id: d.id, x: pts.reduce((a, p) => a + p.x, 0) / pts.length, z: pts.reduce((a, p) => a + p.z, 0) / pts.length };
  });
  for (let i = 0; i < centers.length; i += 1) for (let j = i + 1; j < centers.length; j += 1) {
    const gap = Math.hypot(centers[i].x - centers[j].x, centers[i].z - centers[j].z);
    // 100：曾挤成一团的种子（seed 42）两城区质心只隔几十单位；正常种子在 110–400 之间，120 的阈值贴着边、一次选址微调就会误报。
    assert(gap >= 100, `seed ${seed}: districts ${centers[i].id} and ${centers[j].id} crowd together (${gap.toFixed(2)} apart)`);
  }
  // 致敬型地标：每岛 2–4 座（含可能的悬索桥），在陆地上，不压任何会话地块。
  // 地标数随档位增长（1 档 4 座、最多 7 座）+ 有河桥时的悬索桥；同类不重复，双子塔与扭转塔二选一。
  assert(layout.landmarks.length >= 2 && layout.landmarks.length <= 8, `seed ${seed}: ${layout.landmarks.length} landmarks`);
  const kinds = layout.landmarks.map((landmark) => landmark.kind);
  assert(new Set(kinds).size === kinds.length, `seed ${seed}: duplicate landmark kind`);
  assert(!(kinds.includes("twin-towers") && kinds.includes("twist-tower")), `seed ${seed}: both skyline towers`);
  const lots = layout.districts.flatMap((d) => [...d.slots.values()]);
  // The elevated ring lives outside roadEdges: ground-road guards cannot protect it.
  for (const lot of lots) for (const run of layout.highways) for (let i = 1; i < run.length; i += 1) {
    const a = run[i - 1]; const b = run[i]; const dx = b.x - a.x; const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((lot.x - a.x) * dx + (lot.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const gap = Math.hypot(lot.x - a.x - dx * t, lot.z - a.z - dz * t);
    assert(gap >= 5.25 + Math.hypot(lot.width, lot.depth) / 2 + 1, `seed ${seed}: ${lot.id} overlaps expressway`);
  }
  // 公共用地与地标（半径 > 0 的）同样不得压在环线高架的路幅上：它们先于环线选址，曾只有地块被守住。
  for (const site of [...layout.publicSites, ...layout.landmarks.filter((l) => l.radius > 0)]) for (const run of layout.highways) for (let i = 1; i < run.length; i += 1) {
    const a = run[i - 1]; const b = run[i]; const dx = b.x - a.x; const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((site.x - a.x) * dx + (site.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const gap = Math.hypot(site.x - a.x - dx * t, site.z - a.z - dz * t);
    assert(gap >= 5.25 + site.radius + 1, `seed ${seed}: ${site.id} overlaps expressway (gap ${gap.toFixed(1)})`);
  }
  for (const landmark of layout.landmarks) {
    landmarkKinds.add(landmark.kind);
    if (landmark.kind === "suspension-bridge") continue;
    assert(layout.terrain.height(landmark.x, landmark.z) > 0.5, `seed ${seed}: ${landmark.id} on land`);
    for (const lot of lots) assert(Math.hypot(lot.x - landmark.x, lot.z - landmark.z) >= landmark.radius, `seed ${seed}: ${landmark.id} sits on session lot ${lot.id}`);
  }
  profiles.push(profile(layout.coast));
  biomes.add(layout.biome);
  if (layout.river.length) rivers += 1;
}
const pairs = [];
for (let i = 0; i < profiles.length; i += 1) for (let j = i + 1; j < profiles.length; j += 1) pairs.push(correlation(profiles[i], profiles[j]));
pairs.sort((x, y) => x - y);
const median = pairs[Math.floor(pairs.length / 2)];
assert(median < 0.6, `island shapes too similar across seeds (median correlation ${median.toFixed(2)})`);
assert(landmarkKinds.size >= 7, `landmark variety too low: ${[...landmarkKinds].join(",")}`);
assert(biomes.size >= 4, `seeds should reach most biomes (got ${[...biomes].join(",")})`);
assert(rivers >= 18 && rivers < 30, `about four in five islands have a river (got ${rivers}/30)`);
console.log(`City geography: ${seeds.length} seeds, all placed, expressway clearance, sites on land, bridges over water; shape correlation median ${median.toFixed(2)}, ${biomes.size} biomes, ${rivers}/${seeds.length} rivers, ${landmarkKinds.size} landmark kinds passed.`);
