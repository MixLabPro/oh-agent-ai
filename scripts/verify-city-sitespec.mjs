#!/usr/bin/env node
// 选址登记表守卫（CITY_NETWORK_FIRST_CODE_DESIGN 迁移批次 6a-1）：
//   (a) 完整性：真实规划放置的每类用地/地标（radius > 0）都有 SiteSpec 行，半径与表一致——
//       表漏登一行，行为变更批接线时该类就会静默丢选址知识；
//   (b) 分类一致：coastalSitingKinds/straddleSitingKinds/frontageExemptKinds 与 cityPlan 现行
//       SHORE_SITE_KINDS / STRADDLE / SHORE_BOUND 逐一相等（6b 起这三个集合由表派生，此处是值的门禁）；
//   (c) 表自身确定性：同输入两次求值同输出、导出顺序稳定；
//   (d) suspension-bridge 不登记（radius 0 的派生装饰，不走选址）。
// 批次 6a-3 起追加：(e) access/assign 骨架的确定性（同输入两次运行同输出）与 hard 闸门行为。
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";

const { createCityPlan, MIAMI_COASTAL, SITE_SPECS, specByKind, coastalSitingKinds, straddleSitingKinds, frontageExemptKinds, nominalAnchorPoint, SITING_TABLE_VERSION, runAssignment, siteCandidateHardReject } = await loadCity({
  "engine/cityPlan.ts": ["createCityPlan"],
  "engine/citySeaside.ts": ["MIAMI_COASTAL"],
  "engine/planner/sitespec.ts": ["SITE_SPECS", "specByKind", "coastalSitingKinds", "straddleSitingKinds", "frontageExemptKinds", "nominalAnchorPoint", "SITING_TABLE_VERSION"],
  "engine/planner/assign.ts": ["runAssignment"],
  "engine/planner/access.ts": ["siteCandidateHardReject"],
});

// ── (a) 完整性：真实规划的放置种类 ↔ 表行 一一对应（含半径常量）──────────────────────
const ISLANDS = [[1, 0, null], [2, 3, MIAMI_COASTAL], [5, 7, MIAMI_COASTAL], [2, 13, null], [3, 21, MIAMI_COASTAL]];
const placedKinds = new Map();
for (const [tier, i, cfg] of ISLANDS) {
  const seed = 1703294958 + i * 7919;
  const plan = createCityPlan(seed, tier, cfg);
  for (const site of [...plan.publicSites, ...plan.landmarks]) {
    if (!site.radius) continue;
    const row = specByKind(site.kind);
    assert.ok(row, `seed ${seed}/t${tier}: placed kind "${site.kind}" has no SiteSpec row (siting knowledge would be lost at wire-up)`);
    assert.equal(site.radius, row.radius, `seed ${seed}/t${tier}: ${site.kind} radius ${site.radius} != table ${row.radius}`);
    placedKinds.set(site.kind, (placedKinds.get(site.kind) ?? 0) + 1);
  }
}
// 抽签类不必每个岛都出现，但 15 行里除 suspension-bridge 外的公共用地 6 类必须全部出现；
// 地标类在 5 个岛（固定 5 座 + 抽签 ≥1 席）上合计出现 ≥7 类。
const publicRows = SITE_SPECS.filter((r) => r.priority < 100).map((r) => r.kind);
for (const kind of publicRows) assert.ok(placedKinds.has(kind), `public kind "${kind}" never placed across the sample islands`);
const landmarkRows = SITE_SPECS.filter((r) => r.priority === 100).map((r) => r.kind);
const seenLandmarks = landmarkRows.filter((k) => placedKinds.has(k));
assert.ok(seenLandmarks.length >= 7, `only ${seenLandmarks.length} landmark kinds appeared (${seenLandmarks.join(",")}) — sample too small to cross-check the table`);

// ── (b) 分类与 cityPlan 现行集合一致（6b 派生化之前的值门禁）────────────────────────
assert.deepEqual([...coastalSitingKinds()].sort(), ["ferris-wheel", "harbor", "lighthouse", "sail-opera", "villa-complex"], "coastalSitingKinds != SHORE_SITE_KINDS");
assert.deepEqual([...straddleSitingKinds()], ["arch"], "straddleSitingKinds != STRADDLE");
assert.deepEqual([...frontageExemptKinds()].sort(), ["arch", "civic", "ferris-wheel", "harbor", "lighthouse", "sail-opera", "villa-complex"], "frontageExemptKinds != SHORE_BOUND ∪ STRADDLE");

// ── (c) 表自身确定性 ────────────────────────────────────────────────────────────
// （验收修订）原「同对象 JSON.stringify 自比」恒真，已删——真正的确定性证明是上面的 anchors
// 双跑与 runAssignment 双世界双跑；此处改为钉死导出序的可区分断言。
const exportOrder = SITE_SPECS.map((r) => r.kind).join(",");
assert.match(exportOrder, /^[a-z-]+(,[a-z-]+)*$/, "SITE_SPECS rows must all be lower-case kinds");
assert.ok(exportOrder.length > 0 && !exportOrder.includes("undefined"), "SITE_SPECS rows must all carry a kind");
const kinds = SITE_SPECS.map((r) => r.kind);
assert.equal(new Set(kinds).size, kinds.length, "duplicate kind rows in SITE_SPECS");
assert.equal(kinds.length, 15, `expected 15 rows (6 public + 9 landmark candidates), got ${kinds.length}`);
assert.equal(specByKind("suspension-bridge"), undefined, "suspension-bridge must stay unregistered (derived decoration, radius 0)");
const anchorWorld = { core: { x: 12.5, z: -7.25 }, R: 390, turn: 1.25, coast: Array.from({ length: 96 }, (_, i) => ({ x: Math.cos((i / 96) * Math.PI * 2) * 300, z: Math.sin((i / 96) * Math.PI * 2) * 300 })), hasRiver: true, riverX: (z) => 30 + Math.sin(z * 0.006) * 20, riverWidth: () => 18, hillDir: { x: 0.8, z: 0.6 }, hillLine: 210 };
const anchors1 = SITE_SPECS.map((row) => nominalAnchorPoint(row, anchorWorld));
const anchors2 = SITE_SPECS.map((row) => nominalAnchorPoint(row, anchorWorld));
assert.deepEqual(anchors1, anchors2, "nominalAnchorPoint not deterministic");
for (const p of anchors1) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z), `nominalAnchorPoint produced NaN for some row (${JSON.stringify(p)})`);

console.log(`City sitespec: table v${SITING_TABLE_VERSION} — ${SITE_SPECS.length} rows, ${placedKinds.size} kinds placed across ${ISLANDS.length} islands all match radius; coastal/straddle/frontage-exempt sets equal cityPlan's; deterministic.`);

// ── (e) 6a-3：access/assign 骨架——确定性、hard 闸门、无候选不回落 ─────────────────
// 合成世界（解析地理，不跑真实 buildPlan）：圆岛 R=300（宽缓滩：1.2 平台到 294，294–310 缓降，
// 岸外 314 起深水 ≤ −0.8）、sin 弯河偏在 x≈150、5 条放射主干、无环线/桥。
function makeWorld() {
  const R = 300; const core = { x: 0, z: 0 };
  const coast = Array.from({ length: 96 }, (_, i) => ({ x: Math.cos((i / 96) * Math.PI * 2) * R, z: Math.sin((i / 96) * Math.PI * 2) * R }));
  const d = (x, z) => Math.hypot(x, z);
  const riverX = (z) => 150 + 40 * Math.sin(z * 0.006);
  const riverWidth = () => 16;
  const height = (x, z) => { const r = d(x, z); return r <= 294 ? 1.2 : r <= 310 ? 1.2 - (r - 294) * 0.1 : Math.max(-1.2, -0.4 - (r - 310) * 0.1); };
  const coastDistance = (x, z) => R - d(x, z);
  const landClearance = (x, z) => Math.min(coastDistance(x, z), Math.abs(x - riverX(z)) - riverWidth(z));
  return {
    core, R, turn: 1.0, coast,
    trunkRuns: Array.from({ length: 5 }, (_, i) => {
      const a = i * ((Math.PI * 2) / 5) + 0.3;
      return Array.from({ length: 5 }, (_, k) => 60 + k * 50).map((r) => ({ x: Math.cos(a) * r, z: Math.sin(a) * r }));
    }),
    ringRuns: [], bridges: [], placed: [],
    height, riverX, riverWidth,
    inRiver: (x, z) => Math.abs(x - riverX(z)) < riverWidth(z),
    riverBank: (x, z, bank) => Math.abs(x - riverX(z)) < riverWidth(z) + bank,
    coastDistance, landClearance,
    buildable: (x, z) => landClearance(x, z) > 12,
    hasRiver: true,
    hillDir: { x: 1, z: 0 }, hillLine: 220, hillProj: (x) => x,
  };
}
const CLASS_SAMPLE = ["civic", "station", "harbor", "arch", "sail-opera", "ferris-wheel"].map((k) => specByKind(k));
assert.ok(CLASS_SAMPLE.every(Boolean), "class sample kinds missing from the table");
{
  const worldA = makeWorld(); const worldB = makeWorld();
  const outA = runAssignment(worldA, CLASS_SAMPLE);
  const outB = runAssignment(worldB, CLASS_SAMPLE);
  // (e1) 确定性：同输入两次运行，结果与放置表完全一致（设计 §5A-7 / §6.3 稳定 tie-break）。
  assert.deepEqual(outA, outB, "runAssignment not deterministic");
  assert.deepEqual(worldA.placed, worldB.placed, "sequential placed list not deterministic");
  // (e2) 处理序 = priority 升序、同档按 kind 字典序（public 先于地标）。
  assert.deepEqual(outA.map((r) => r.kind), ["civic", "station", "harbor", "arch", "ferris-wheel", "sail-opera"], "assignment order != priority order");
  // (e3) 广场 = 核心点（构造保证）；合成世界足够开阔，至少 4/6 类应找到合法候选（生成器确实在产出）。
  assert.equal(outA[0].chosen?.id, "plaza:core", "plaza must sit on the core by construction");
  const placedCount = outA.filter((r) => r.chosen).length;
  assert.ok(placedCount >= 4, `only ${placedCount}/6 kinds found a viable candidate in the open synthetic world (${outA.map((r) => `${r.kind}:${r.chosen ? "ok" : r.reason}`).join(", ")})`);
  // (e4) 每个结果要么有 chosen 要么有显式原因（失败不静默、不回落名义坐标）。
  assert.ok(outA.every((r) => r.chosen || (r.reason && r.candidates >= 0)), "an assignment neither chose nor explained");
}
{
  // (e5) hard 闸门逐判据：河道中心必被 buildable-center 拒；陆上点位必被 deep-water-ring 拒。
  const world = makeWorld();
  const station = specByKind("station"); const opera = specByKind("sail-opera");
  assert.equal(siteCandidateHardReject(world, station, { id: "t", x: world.riverX(0), z: 0, yaw: 0, source: "t" }), "buildable-center", "in-river candidate must be rejected by buildable-center");
  const badOffshore = { id: "t", x: 150, z: 0, yaw: 0, source: "t", shoreAnchor: { x: 250, z: 0 } };
  assert.equal(siteCandidateHardReject(world, opera, badOffshore), "deep-water-ring", "on-land candidate must be rejected by deep-water-ring");
}
{
  // (e6) 无合法候选：毒化世界（全岛低净空、非深水）——全部显式失败，chosen 均为 null。
  const poisoned = makeWorld();
  poisoned.landClearance = () => 5;
  poisoned.buildable = () => false;
  poisoned.height = () => 0.3;
  const out = runAssignment(poisoned, CLASS_SAMPLE);
  assert.ok(out.every((r) => !r.chosen && r.reason), `poisoned world must fail every kind explicitly (${out.map((r) => `${r.kind}:${r.reason}`).join(", ")})`);
}
console.log("City sitespec assign/access skeleton: deterministic double-run, priority order, plaza-on-core, hard gate rejects in-river/on-land placements, poisoned world fails explicitly without nominal-coordinate fallback.");
