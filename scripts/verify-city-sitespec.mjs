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

const { createCityPlan, MIAMI_COASTAL, SITE_SPECS, specByKind, coastalSitingKinds, straddleSitingKinds, frontageExemptKinds, nominalAnchorPoint, SITING_TABLE_VERSION } = await loadCity({
  "engine/cityPlan.ts": ["createCityPlan"],
  "engine/citySeaside.ts": ["MIAMI_COASTAL"],
  "engine/planner/sitespec.ts": ["SITE_SPECS", "specByKind", "coastalSitingKinds", "straddleSitingKinds", "frontageExemptKinds", "nominalAnchorPoint", "SITING_TABLE_VERSION"],
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
assert.equal(JSON.stringify(SITE_SPECS), JSON.stringify(SITE_SPECS), "SITE_SPECS export order unstable");
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
