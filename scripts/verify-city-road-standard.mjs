#!/usr/bin/env node
// 道路标准表（engine/roadStandard.ts；docs/CITY_WORLD_PRECISION_AND_SIZE_STANDARD_SPEC.md §2–§4）。
// 第一段：表与 API 本身——三档宽度与 kind、严格反查（非标宽度返回 null，不按区间猜）、等级比较与原
// `width >= 8 / >= 12` 在三档上逐一等价、表冻结不可改。后续段（路网只有标准宽度、源码无游离字面量、补丁入口拒绝非标）随迁移补上。
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";
const S = await loadCity({ "engine/roadStandard.ts": ["ROAD_CLASSES", "roadClassSpec", "roadClassOfWidth", "isStandardRoadWidth", "atLeast", "kindOfWidth", "roadWidthFor", "isStandardEdge", "EXPRESSWAY_DECK_WIDTH"] });

assert.deepEqual(S.ROAD_CLASSES.map((c) => [c.id, c.width, c.kind, c.repairType]), [["local", 5, "local", "local"], ["collector", 8, "arterial", "secondary"], ["arterial", 12, "arterial", "main"]]);
assert.ok(S.ROAD_CLASSES.every((c) => c.sidewalk === 1.8 && c.maxGrade === null && c.bridgeTransition === null && c.maxBridgeSkewDeg === null && c.label.zh && c.label.en), "phase-two fields stay null until measured");
assert.ok(Object.isFrozen(S.ROAD_CLASSES) && S.ROAD_CLASSES.every(Object.isFrozen), "the table is frozen");
assert.throws(() => { S.ROAD_CLASSES[0].width = 6; });
for (const c of S.ROAD_CLASSES) { assert.equal(S.roadClassOfWidth(c.width), c.id); assert.equal(S.roadClassOfWidth(c.width + 1e-12), c.id, "JSON round-trip noise absorbed"); assert.equal(S.roadWidthFor(c.id), c.width); }
for (const w of [0, 4.2, 6, 10, 10.5, 12.5, 24]) { assert.equal(S.roadClassOfWidth(w), null, `${w} is not a standard width`); assert.equal(S.isStandardRoadWidth(w), false); }
assert.throws(() => S.roadClassSpec("boulevard"));
// atLeast / kindOfWidth 与它们替换掉的区间判断在任何宽度上都给同一答案（迁移不改结果的前提）。
for (const w of [0, 4.2, 5, 6, 8, 10, 10.5, 12, 13, 24]) {
  assert.equal(S.atLeast({ width: w }, "collector"), w >= 8, `atLeast collector ≡ width >= 8 at ${w}`);
  assert.equal(S.atLeast({ width: w }, "arterial"), w >= 12, `atLeast arterial ≡ width >= 12 at ${w}`);
  assert.equal(S.atLeast({ width: w }, "local"), w >= 5);
  assert.equal(S.kindOfWidth(w), w >= 8 ? "arterial" : "local", `kindOfWidth ≡ width >= 8 ? arterial : local at ${w}`);
}
assert.ok(S.isStandardEdge({ width: 8, kind: "arterial" }) && S.isStandardEdge({ width: 5, kind: "local" }) && !S.isStandardEdge({ width: 8, kind: "local" }) && !S.isStandardEdge({ width: 10, kind: "arterial" }));
assert.equal(S.EXPRESSWAY_DECK_WIDTH, 10.5);
console.log("City road standard: three classes 5/8/12 with kinds, strict reverse lookup, atLeast/kindOfWidth equal to the range checks they replace, frozen table.");
