#!/usr/bin/env node
// 航拍节奏守卫：跑生产的布局 + 镜头规划，逐 0.1s 采样，钉住「速度不突变、画面不猛晃」。
// 曾经按关键帧序号均分时间，跨城区转场的速度是盘旋段的十几倍，用户看不清飞过了哪里——
// 截图看不出这种问题（单帧都正常），只能量化。
import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = path.join(repo, "apps/desktop/ui-dev");
const require = createRequire(path.join(ui, "package.json"));
const { buildSync } = require("esbuild");
const entry = `
export { layoutCity } from "./cityLayout";
export { planCinematic } from "./cityCinematic";
`;
const out = buildSync({
  stdin: { contents: entry, resolveDir: path.join(ui, "react/src/features/city/engine"), loader: "ts" },
  bundle: true, write: false, format: "cjs", platform: "node", logLevel: "silent",
});
const mod = { exports: {} };
vm.runInNewContext(out.outputFiles[0].text, { module: mod, exports: mod.exports, require, process, console, setTimeout, clearTimeout, Float64Array, Float32Array, Uint16Array, Uint32Array, Int32Array, Uint8Array, Map, Set, Math, JSON });
const { layoutCity, planCinematic } = mod.exports;

const hosts = ["codex", "claude-code", "plugin:zcode", "dsh"];
const count = 700;
const buildings = Array.from({ length: count }, (_, index) => ({
  id: `session:${index}`, districtId: hosts[index % hosts.length], height: 6 + (index * 37) % 90,
  footprint: 7.2, startedAt: index * 1000, endedAt: index * 1000 + 500, active: index % 30 === 0,
}));
const model = {
  windowStartMs: 0, windowEndMs: count * 1000, windowLabel: "30d",
  buildings,
  districts: hosts.map((id, rank) => ({ id, label: id, sessionCount: count / 4, tokensTotal: 1e8 * (4 - rank), activeCount: 0, anomaly: null })),
  stats: { totalSessions: count, tokensTotal: 1e9, renderedSessions: count, aggregatedSessions: 0, activeCount: 0, truncated: false },
  rows: new Map(),
};
// 跑多个种子：默认 1927 是现在所有人的城市，其余几个代表将来「每人一座不同的岛」。
// 航拍路线由布局推导（不是写死坐标），换种子地形就变，节奏和净空都要在每个种子上成立。
const seeds = [1927, 7, 42, 2026, 31337];
for (const seed of seeds) {
const layout = layoutCity(model, null, seed);
const anchors = new Map();
for (const district of layout.districts) for (const [id, slot] of district.slots) {
  const building = buildings.find((item) => item.id === id);
  anchors.set(id, { x: slot.x, z: slot.z, height: building.height, ground: district.grounds.get(id) ?? 0 });
}
const plan = planCinematic(layout, model, anchors);

const dt = 0.1;
const samples = [];
for (let seconds = 0; seconds <= plan.durationSec; seconds += dt) {
  const position = plan.position(seconds);
  const ground = Math.max(0, layout.terrain.height(position.x, position.z));
  samples.push({ seconds, position, altitude: Math.max(12, position.y - ground), clearance: position.y - ground });
}
const speeds = [];
const visual = []; // 速度 / 离地高度 —— 画面里地面掠过的角速度（rad/s）
for (let index = 1; index < samples.length; index += 1) {
  const a = samples[index - 1].position;
  const b = samples[index].position;
  const speed = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / dt;
  speeds.push(speed);
  visual.push(speed / samples[index].altitude);
}
// 只看巡航段：去掉首尾加减速。
const cruise = (list) => list.slice(Math.floor(list.length * 0.08), Math.floor(list.length * 0.92));
const pct = (list, p) => [...list].sort((x, y) => x - y)[Math.floor((list.length - 1) * p)];
const cruiseVisual = cruise(visual);
const cruiseSpeed = cruise(speeds);
// 相对加速度：每秒速度变化占当前速度的比例。高空 120 u/s 时变 60 u/s 看不出来，
// 低空 15 u/s 时变 60 u/s 就是猛冲——绝对值卡不住要紧的那一种。
const maxJump = Math.max(...speeds.slice(1).map((speed, index) => Math.abs(speed - speeds[index]) / dt / Math.max(1, Math.min(speed, speeds[index]))));
const report = {
  durationSec: +plan.durationSec.toFixed(1),
  speed: { min: +pct(cruiseSpeed, 0).toFixed(1), p50: +pct(cruiseSpeed, 0.5).toFixed(1), max: +pct(cruiseSpeed, 1).toFixed(1) },
  visualRadPerSec: { p05: +pct(cruiseVisual, 0.05).toFixed(3), p50: +pct(cruiseVisual, 0.5).toFixed(3), p95: +pct(cruiseVisual, 0.95).toFixed(3), max: +pct(cruiseVisual, 1).toFixed(3) },
  maxRelativeAccelPerSec: +maxJump.toFixed(2),
  keyTimes: plan.keyTimes.map((key) => [+key.seconds.toFixed(1), Math.round(key.altitude)]),
  districtCards: plan.cards.filter((card) => card.kind === "district").map((card) => [card.text, +card.atSec.toFixed(1), +(card.untilSec - card.atSec).toFixed(1)]),
};
if (process.argv.includes("--report") && seed === Number(process.env.SEED ?? seeds[0])) {
  console.log(JSON.stringify(report, null, 2));
  const rel = speeds.slice(1).map((speed, index) => [index + 1, Math.abs(speed - speeds[index]) / dt / Math.max(1, Math.min(speed, speeds[index]))]);
  rel.sort((x, y) => y[1] - x[1]);
  console.log("worst", rel.slice(0, 6).map(([i, r]) => `${(i * dt).toFixed(1)}s ${speeds[i - 1].toFixed(1)}→${speeds[i].toFixed(1)} (${r.toFixed(2)})`).join(" | "));
}

assert(plan.durationSec >= 35 && plan.durationSec <= 120, `film length ${plan.durationSec}s out of 35–120s`);
assert(report.speed.max <= 122, `cruise speed peaks at ${report.speed.max} u/s (cap 120)`);
// 视觉速度稳定：巡航段的 95 分位不超过中位数的 2 倍。
assert(report.visualRadPerSec.p95 <= report.visualRadPerSec.p50 * 2, `visual speed unstable: p95 ${report.visualRadPerSec.p95} vs p50 ${report.visualRadPerSec.p50}`);
assert(report.visualRadPerSec.max <= 0.7, `ground streaks past at ${report.visualRadPerSec.max} rad/s`);
assert(report.maxRelativeAccelPerSec <= 1, `speed changes ${report.maxRelativeAccelPerSec}×/s between samples`);
for (const [name, , dwell] of report.districtCards) assert(dwell >= 3, `${name} card shown only ${dwell}s`);
// 机位偏移是相对常数，换地形后不能把镜头送进山里或贴着地面。
const lowest = Math.min(...samples.map((sample) => sample.clearance));
assert(lowest >= 8, `seed ${seed}: camera passes ${lowest.toFixed(1)} above terrain`);
assert.equal(report.districtCards.length, hosts.length, `seed ${seed}: every host district gets a shot`);
console.log(`  seed ${seed}: ${report.durationSec}s, cruise ${report.speed.min}–${report.speed.max} u/s, visual p50 ${report.visualRadPerSec.p50} / p95 ${report.visualRadPerSec.p95} rad/s, accel ${report.maxRelativeAccelPerSec}×/s, min clearance ${lowest.toFixed(0)}`);
}
console.log(`City cinematic: pacing, clearance and district shots passed for ${seeds.length} seeds.`);
