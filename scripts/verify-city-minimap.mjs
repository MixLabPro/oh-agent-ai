#!/usr/bin/env node
// 小地图路况（2026-10-21，用户：「可以搞个小地图，这样可以明显的看出道路情况？」）：minimapModel 与修复面板「体检」的
// 道路规则是同一组判据——小地图上的红点，体检里就有一条同样的问题。这里钉住：陡路标红、很陡标琥珀、斜接桥头整座桥标红、
// 正常路不标；问题点数与体检的道路规则条数一致；水陆栅格按地形水位取样（河道是水、岸上是陆）；按布局缓存。
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";
globalThis.window ??= globalThis;
const { minimapModel, auditLayout } = await loadCity({ "minimap/roadConditions.ts": ["minimapModel"], "engine/planAudit.ts": ["auditLayout"] });
const wet = (x) => x > 200 && x < 240;
const height = (x, z) => (wet(x) ? -1 : z > 40 && x > -60 && x < -40 ? 2 + (z - 40) * 0.5 : z > 40 && x > -100 && x < -80 ? 2 + (z - 40) * 0.25 : 2);
const terrain = { height, slope: () => 0, buildable: (x) => !wet(x), center: { x: 0, z: 0 }, radius: 400, coastRadius: () => 400, hasRiver: true };
const road = (a, b, width = 5, extra = {}) => ({ id: `${a.x}:${a.z}/${b.x}:${b.z}`, from: `${a.x}:${a.z}`, to: `${b.x}:${b.z}`, width, kind: width >= 8 ? "arterial" : "local", points: [a, b], structure: "ground-road", ...extra });
const edges = [
  road({ x: -50, z: 40 }, { x: -50, z: 100 }),            // 0.5 坡：开不过去
  road({ x: -90, z: 40 }, { x: -90, z: 100 }),            // 0.25 坡：很陡
  road({ x: 0, z: 0 }, { x: 150, z: 0 }, 12),             // 平路
  road({ x: 197, z: 0 }, { x: 243, z: 0 }, 5, { bridge: true, structure: "deck" }), // 桥：西端只接一条 90° 的路 → 斜接
  road({ x: 197, z: 0 }, { x: 197, z: -30 }), road({ x: 243, z: 0 }, { x: 260, z: 0 }),
];
const layout = { seed: 1, scaleTier: 1, extent: 400, terrain, coast: [{ x: -300, z: -300 }, { x: 300, z: -300 }, { x: 300, z: 300 }, { x: -300, z: 300 }], river: [],
  roadEdges: edges, roadNodes: [...new Set(edges.flatMap((e) => [e.from, e.to]))].map((id) => { const [x, z] = id.split(":").map(Number); return { id, x, z }; }),
  highways: [], districts: [], blocks: [], landmarks: [], contextBuildings: [] };
const model = minimapModel(layout);
const cond = (id) => model.roads.find((r) => r.id === id).condition;
assert.equal(cond("-50:40/-50:100"), "blocked", "a road up a 0.5 slope is red");
assert.equal(cond("-90:40/-90:100"), "steep", "a road up a 0.25 slope is amber");
assert.equal(cond("0:0/150:0"), "ok", "a flat road is not flagged");
assert.equal(cond("197:0/243:0"), "blocked", "the deck of an oblique bridgehead is red");
assert.equal(model.roads.find((r) => r.id === "197:0/243:0").cls, "bridge");
assert.equal(model.roads.find((r) => r.id === "0:0/150:0").cls, "main");
assert.deepEqual(model.counts, { blocked: 2, steep: 1 });
const roadRules = auditLayout(layout, { buildings: [] }).filter((i) => i.rule.startsWith("bridgehead") || i.rule === "roadSteep");
assert.equal(model.issues.length, roadRules.length, `every minimap spot is an audit issue and vice versa (${model.issues.length} vs ${roadRules.length})`);
assert.ok(model.issues.every((i) => i.text.zh && i.text.en), "each spot explains itself in both languages");
const { cols, rows, water } = model.water;
const at = (x, z) => water[Math.floor(((z - model.bounds.minZ) / (model.bounds.maxZ - model.bounds.minZ)) * rows) * cols + Math.floor(((x - model.bounds.minX) / (model.bounds.maxX - model.bounds.minX)) * cols)];
assert.equal(at(220, 0), 1, "the river is water"); assert.equal(at(0, 0), 0, "the bank is land");
assert.equal(minimapModel(layout), model, "cached per layout object");
console.log("City minimap: steep roads red, near-limit roads amber, oblique bridgehead decks red, flat roads plain; spots match the repair audit's road rules one for one; water sampled from terrain; cached per layout.");
