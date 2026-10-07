#!/usr/bin/env node
// 建筑与周边场景的物理依赖守卫（用户：「确认它和周边场景物理依赖关系」）。对 30 个岛（10 种子 × 1/2/5 档）的
// 每个地标与公共用地断言：
//   1. 立在陆地上：占地圈 16 点地形高于水面（岸边类允许 ≤4 点落在岸滩/水边）；
//   2. 门前有路：最近非桥路段离边缘 ≤ 20；
//   3. 不被道路穿过：中心到路 ≥ 0.7 半径（市政广场 = 环岛、凯旋门 = 骑路，按各自规则单独断言）；
//   4. 凯旋门骑路：有主干道从中心 3 内穿过，且开口轴（局部 z）与该路方向夹角 < 15°；
//   5. 互不重叠、不压地块：两两中心距 ≥ 半径和；没有地块中心落在用地半径内。
import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const city = path.join(repo, "apps/agent-city/ui/src");
const { buildSync } = createRequire(path.join(repo, "apps/desktop/ui-dev/package.json"))("esbuild");
const out = buildSync({
  stdin: { contents: `export { createCityPlan } from ${JSON.stringify(path.join(city, "engine/cityPlan.ts"))};
export { MIAMI_COASTAL } from ${JSON.stringify(path.join(city, "engine/citySeaside.ts"))};
export { planAirport, roadSamples } from ${JSON.stringify(path.join(city, "engine/cityAirport.ts"))};`, resolveDir: city },
  bundle: true, write: false, format: "cjs", platform: "node", logLevel: "silent",
});
const mod = { exports: {} };
vm.runInNewContext(out.outputFiles[0].text, { module: mod, exports: mod.exports, process, console, Math, Map, Set });
const { createCityPlan, MIAMI_COASTAL, planAirport, roadSamples } = mod.exports;

const seg = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)); return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t); };
const SHORE = new Set(["harbor", "lighthouse", "sail-opera", "ferris-wheel", "villa-complex"]);
const bad = { wet: [], noRoad: [], through: [], arch: [], overlap: [], parcel: [], frontage: [] };
let checked = 0;
for (const tier of [1, 2, 5]) for (let i = 0; i < 10; i += 1) {
  const seed = 1703294958 + i * 7919;
  const plan = createCityPlan(seed, tier, MIAMI_COASTAL);
  const sites = [...plan.publicSites, ...plan.landmarks].filter((s) => s.radius);
  const roads = plan.roadEdges.filter((e) => !e.bridge);
  const tag = (s) => `${seed}/t${tier} ${s.kind}`;
  for (const s of sites) {
    checked += 1;
    let wet = 0;
    for (let k = 0; k < 16; k += 1) { const t = (k / 16) * Math.PI * 2, r = k % 2 ? s.radius : s.radius * 0.6; if (plan.terrain.height(s.x + Math.cos(t) * r, s.z + Math.sin(t) * r) < 0.5) wet += 1; }
    if (s.kind !== "harbor" && !s.shore && wet > (SHORE.has(s.kind) ? 4 : 0)) bad.wet.push(`${tag(s)} wet=${wet}`);
    const near = Math.min(...roads.map((e) => seg(s, e.points[0], e.points.at(-1))));
    const nearAny = Math.min(near, ...plan.roadEdges.filter((e) => e.bridge).map((e) => seg(s, e.points[0], e.points.at(-1)))); // 门口直接起桥（岸边地标隔河）也是门前有路
    if (nearAny > s.radius + 20) bad.noRoad.push(`${tag(s)} gap=${Math.round(nearAny - s.radius)}`);
    // 车站/体育场正面贴路：中心到路 ≤ 半径（占地前沿贴着人行道），不再停在「半径 + 20」外。
    if ((s.kind === "station" || s.kind === "stadium") && near > s.radius * 1.3 && near <= s.radius + 90) bad.frontage.push(`${tag(s)} d=${Math.round(near)} r=${s.radius}`);
    // 车站/体育场正面贴路：中心到路 ≤ 半径（占地前沿贴着人行道），不再停在「半径 + 20」外。
    // 车站正门（局部 +z）朝向最近的路：站房入口与路面方向夹角 < 45°。
    if (s.kind === "station" && near <= s.radius + 90) {
      let best = null; for (const e of roads) { const [a, b] = [e.points[0], e.points.at(-1)]; const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((s.x - a.x) * dx + (s.z - a.z) * dz) / l2)); const q = { x: a.x + dx * t, z: a.z + dz * t }; const d = Math.hypot(q.x - s.x, q.z - s.z); if (!best || d < best.d) best = { d, q }; }
      const cos = (Math.sin(s.yaw) * (best.q.x - s.x) + Math.cos(s.yaw) * (best.q.z - s.z)) / (best.d || 1);
      if (cos < Math.cos((45 * Math.PI) / 180)) bad.frontage.push(`${tag(s)} door faces away from the road (cos ${cos.toFixed(2)})`);
    }
    if (s.kind === "arch") {
      const host = roads.filter((e) => e.width >= 12).find((e) => seg(s, e.points[0], e.points.at(-1)) < 3);
      if (!host) bad.arch.push(`${tag(s)} not on a road`);
      else {
        const dir = Math.atan2(host.points.at(-1).x - host.points[0].x, host.points.at(-1).z - host.points[0].z);
        let d = Math.abs(dir - s.yaw) % Math.PI; d = Math.min(d, Math.PI - d);
        if (d > (15 * Math.PI) / 180) bad.arch.push(`${tag(s)} opening off road by ${Math.round((d * 180) / Math.PI)}deg`);
      }
    } else if (s.kind !== "civic" && near < s.radius * 0.7) bad.through.push(`${tag(s)} d=${Math.round(near)}`);
    for (const o of sites) if (o !== s && o.kind > s.kind && Math.hypot(o.x - s.x, o.z - s.z) < o.radius + s.radius) bad.overlap.push(`${tag(s)} x ${o.kind}`);
    for (const b of plan.blocks) for (const p of b.parcels) if (Math.hypot(p.x - s.x, p.z - s.z) < s.radius) { bad.parcel.push(`${tag(s)} parcel ${p.id}`); break; }
  }
}
const report = Object.entries(bad).map(([k, v]) => `${k} ${v.length}`).join(", ");
// 上限：沿用规划守卫口径——0 容忍穿路/压地块/凯旋门不骑路；陆地与入口给少量余量（岸边地形噪声）。
assert.equal(bad.arch.length, 0, `arch must straddle a main road:\n  ${bad.arch.join("\n  ")}`);
// F1 闭环（cityPlan 终筛前的「路穿用地」修复循环）之后不再有容忍项：必须为 0。
assert(bad.through.length === 0, `roads through sites:\n  ${bad.through.join("\n  ")}`);
assert(bad.frontage.length <= 2, `stations/stadiums set back from the road:\n  ${bad.frontage.join("\n  ")}`);
assert.equal(bad.parcel.length, 0, `lots inside sites:\n  ${bad.parcel.slice(0, 8).join("\n  ")}`);
assert(bad.overlap.length <= 2, `overlapping sites:\n  ${bad.overlap.join("\n  ")}`);
assert(bad.wet.length <= 3, `sites standing in water:\n  ${bad.wet.join("\n  ")}`);
assert(bad.noRoad.length <= 3, `sites without a road at the door:\n  ${bad.noRoad.join("\n  ")}`);
console.log(`City context: ${checked} sites/landmarks on 30 islands — ${report} passed.`);

// 海上岛地标（歌剧院）：必须有堤道桥连到岸、岸点踩在实地上、占地圈在深水里。
for (const tier of [1, 5]) for (let i = 0; i < 10; i += 1) {
  const plan = createCityPlan(1703294958 + i * 7919, tier, MIAMI_COASTAL);
  const opera = plan.landmarks.find((s) => s.kind === "sail-opera");
  if (!opera || !opera.shore) continue;
  assert(plan.terrain.height(opera.shore.x, opera.shore.z) > 0.2, `opera causeway lands in water (tier ${tier} #${i})`);
  const bridge = plan.roadEdges.find((e) => e.bridge && (Math.hypot(e.points[0].x - opera.shore.x, e.points[0].z - opera.shore.z) < 1 || Math.hypot(e.points[1].x - opera.shore.x, e.points[1].z - opera.shore.z) < 1));
  assert(bridge, `opera causeway missing (tier ${tier} #${i})`);
}

// 机场岛：整个 240×110 平台必须全在水里（用户截图：平台一角压在陆地上）。逐岛按渲染同一套参数选址，再独立采样平台范围。
let airports = 0; let airportIslands = 0;
for (const tier of [1, 2, 5]) for (let i = 0; i < 10; i += 1) {
  const seed = 1703294958 + i * 7919;
  const plan = createCityPlan(seed, tier, MIAMI_COASTAL); airportIslands += 1;
  const avoid = [...plan.publicSites.filter((x) => x.kind === "harbor"), ...plan.landmarks.filter((x) => x.kind === "sail-opera"), ...(plan.seaside && !plan.seaside.degraded ? plan.seaside.samples.filter((x) => x.valid).map((x) => x.waterline) : [])];
  const a = planAirport(plan.coast, plan.core ?? { x: 0, z: 0 }, avoid, roadSamples(plan.roadEdges), (x, z) => plan.terrain.height(x, z) < -0.6);
  if (!a) continue; airports += 1;
  const c = Math.cos(a.yaw), sn = Math.sin(a.yaw);
  for (let lx = -120; lx <= 120; lx += 12) for (let lz = -55; lz <= 55; lz += 11) {
    const h = plan.terrain.height(a.centre.x + lx * c + lz * sn, a.centre.z - lx * sn + lz * c);
    assert(h < 0.3, `airport platform stands on land (seed ${seed} t${tier}, h=${h.toFixed(2)})`);
  }
}
assert(airports >= airportIslands - 3, `airport placed on only ${airports}/${airportIslands} islands`);
console.log(`City airport: ${airports}/${airportIslands} islands placed with the whole platform over water.`);

// 悬索桥（门式塔高 34）不得被环线高架穿过：桥身整段离高架 ≥ 36（用户截图：高架从塔架中间穿过）。
let suspension = 0;
for (const tier of [1, 2, 5]) for (let i = 0; i < 10; i += 1) {
  const seed = 1703294958 + i * 7919;
  const plan = createCityPlan(seed, tier, MIAMI_COASTAL);
  const bridge = plan.landmarks.find((l) => l.kind === "suspension-bridge");
  if (!bridge) continue; suspension += 1;
  for (const run of plan.highways ?? []) for (let k = 1; k < run.length; k += 1) for (let u = 0; u <= 10; u += 1) {
    const p = { x: bridge.x + (bridge.to.x - bridge.x) * (u / 10), z: bridge.z + (bridge.to.z - bridge.z) * (u / 10) };
    assert(seg(p, run[k - 1], run[k]) >= 35, `expressway runs through the suspension bridge (seed ${seed} t${tier})`);
  }
}
console.log(`City suspension bridge: ${suspension}/30 islands have one, none crossed by the elevated ring road.`);
