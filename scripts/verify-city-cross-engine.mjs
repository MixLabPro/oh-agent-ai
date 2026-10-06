#!/usr/bin/env node
// 跨 JS 引擎确定性守卫（docs/CITY_ROAD_SIMULATION_ANALYSIS.md §2）：同一份 createCityPlan 在 V8（本守卫进程）
// 与 JavaScriptCore（App 的 WKWebView 引擎，macOS 自带 jsc）里必须产出逐字节相同的布局摘要。
// 修复前 30/30 不同——其余 City 守卫验证的是 V8 的城市，不是用户看到的城市。无 jsc 的平台（Linux CI）报告跳过。
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = path.join(repo, "apps/desktop/ui-dev");
const engine = path.join(repo, "apps/agent-city/ui/src/engine");
const jsc = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc";
const { buildSync } = createRequire(path.join(ui, "package.json"))("esbuild");
const entry = `
import { createCityPlan } from ${JSON.stringify(path.join(engine, "cityPlan.ts"))};
import { MIAMI_COASTAL } from ${JSON.stringify(path.join(engine, "citySeaside.ts"))};
const fnv = (t) => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i += 1) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
const out = [];
for (const tier of [1, 2, 5]) for (let i = 0; i < 10; i += 1) {
  const plan = createCityPlan(1703294958 + i * 7919, tier, MIAMI_COASTAL);
  const shape = JSON.stringify({
    roads: plan.roadEdges.map((e) => [e.id, e.width, e.points.map((p) => [p.x, p.z])]),
    blocks: plan.blocks.map((b) => [b.id, b.parcels.map((p) => [p.id, p.x, p.z, p.yaw])]),
    sites: [...plan.publicSites, ...plan.landmarks].map((s) => [s.kind, s.x, s.z]),
  });
  out.push(tier + "/" + i + ":" + fnv(shape));
}
const line = out.join(" ");
if (typeof print === "function") print(line); else console.log(line);
`;
const bundle = buildSync({ stdin: { contents: entry, resolveDir: engine, loader: "ts" }, bundle: true, write: false, format: "iife", platform: "neutral", logLevel: "silent" }).outputFiles[0].text;
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "city-xengine-")), "plan.js");
fs.writeFileSync(file, bundle);
const v8 = execFileSync(process.execPath, [file], { encoding: "utf8" }).trim();
if (!fs.existsSync(jsc)) {
  console.log("City cross-engine: skipped (no JavaScriptCore shell on this platform).");
} else {
  const core = execFileSync(jsc, [file], { encoding: "utf8" }).trim();
  const a = v8.split(" "); const b = core.split(" ");
  const differing = a.filter((digest, i) => digest !== b[i]);
  assert.equal(differing.length, 0, `V8 and JavaScriptCore produced different layouts for ${differing.length}/${a.length} seeds: ${differing.slice(0, 5).join(" ")}`);
  console.log(`City cross-engine: ${a.length} layouts identical in V8 and JavaScriptCore passed.`);
}
