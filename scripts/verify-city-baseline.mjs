#!/usr/bin/env node
// 规划基线哈希（CITY_ARCHITECTURE 迁移步 2）：30 个岛（10 种子 × 1/2/5 档）的规划结果各取一个规范化哈希，
// 与 golden/city-plan-baseline.json 逐岛比较。用途是「重构不改行为」的机器证明——拆文件、换加载方式、
// 抽取约束时哈希必须不变；有意改规划时才 --update，且必须先看 --diff 确认变化是想要的。
//   node scripts/verify-city-baseline.mjs            校验
//   node scripts/verify-city-baseline.mjs --diff     校验并列出每个不一致岛的差异分区
//   node scripts/verify-city-baseline.mjs --update   重写基线（先确认！反射性 --update 会让这条守卫失去意义）
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { cachedPlan, loadCity, repo } from "./city-kit/index.mjs";

const { createCityPlan: rawPlan, MIAMI_COASTAL } = await loadCity({
  "engine/cityPlan.ts": ["createCityPlan"],
  "engine/citySeaside.ts": ["MIAMI_COASTAL"],
});
const goldenPath = path.join(repo, "golden/city-plan-baseline.json");

const round = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v);
const norm = (value) => JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "number" ? round(v) : v)));
const hash = (value) => crypto.createHash("sha1").update(JSON.stringify(norm(value))).digest("hex").slice(0, 16);

/** 分区哈希：出现差异时能指出是路网、用地、地块还是车流变了。 */
function sections(plan) {
  return {
    roads: hash({ nodes: plan.roadNodes, edges: plan.roadEdges }),
    sites: hash({ publicSites: plan.publicSites, landmarks: plan.landmarks }),
    blocks: hash(plan.blocks.map((b) => ({ id: b.id, zone: b.zone, polygon: b.polygon, parcels: b.parcels.map((p) => [p.id, p.x, p.z, p.yaw, p.width, p.depth]) }))),
    skeleton: hash({ core: plan.core, coast: plan.coast, highways: plan.highways, bridges: plan.bridges, river: plan.river, islandRadius: plan.islandRadius }),
    traffic: hash(plan.carPaths),
    seaside: hash(plan.seaside ?? null),
  };
}

const current = {};
for (const tier of [1, 2, 5]) for (let i = 0; i < 10; i += 1) {
  const seed = 1703294958 + i * 7919;
  const s = sections(cachedPlan(rawPlan, seed, tier, MIAMI_COASTAL));
  current[`${seed}/t${tier}`] = { all: hash(s), ...s };
}

if (process.argv.includes("--update")) {
  fs.mkdirSync(path.dirname(goldenPath), { recursive: true });
  fs.writeFileSync(goldenPath, `${JSON.stringify(current, null, 1)}\n`);
  console.log(`City baseline: rewrote ${Object.keys(current).length} island hashes.`);
  process.exit(0);
}

assert(fs.existsSync(goldenPath), "golden/city-plan-baseline.json missing — run with --update once and review");
const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
const changed = Object.keys(current).filter((k) => golden[k]?.all !== current[k].all);
if (changed.length) {
  const lines = changed.map((k) => `${k}: ${Object.keys(current[k]).filter((s) => s !== "all" && golden[k]?.[s] !== current[k][s]).join(", ") || "(new island)"}`);
  assert.fail(`plan changed on ${changed.length}/${Object.keys(current).length} islands (differing sections below). 重构应保持哈希不变；有意改规划请先 --diff 审阅再 --update：\n  ${lines.join("\n  ")}`);
}
console.log(`City baseline: ${Object.keys(current).length} island plans match golden/city-plan-baseline.json (roads, sites, blocks, skeleton, traffic, seaside).`);
