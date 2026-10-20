#!/usr/bin/env node
// Compare the working-tree CCD solver with fixed historical outputs from the
// v5 implementation at b1cb7d3d. No git history or second solver is loaded at
// test time. Historical unresolved results are reported separately, never as
// evidence that a path is clear.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCity } from "./city-kit/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(fs.readFileSync(path.join(root, "fixtures/city-driving/driving-collision-differential-v5.json"), "utf8"));
assert.equal(fixture.reference.commit, "b1cb7d3d");
assert.equal(fixture.reference.drivingCollisionVersion, 5);
const { sweepBody } = await loadCity({ "game/driving/DrivingCollision.ts": ["sweepBody"] });
const tolerance = fixture.reference.timeTolerance;
let contacts = 0, clearPaths = 0;

for (const sample of fixture.cases) {
  const actual = sweepBody(sample.solids, sample.from, sample.to, sample.dimensions, sample.options);
  const expected = sample.expected;
  assert.equal(actual.status, expected.status, `${sample.id}: status differs from v5 fixture`);
  assert.equal(actual.reason, expected.reason, `${sample.id}: reason differs from v5 fixture`);
  if (expected.status === "contact") {
    contacts++;
    assert.ok(actual.contact, `${sample.id}: missing contact witness`);
    assert.equal(actual.contact.solidId, expected.contact.solidId, `${sample.id}: contact solid differs`);
    assert.equal(actual.contact.kind, expected.contact.kind, `${sample.id}: contact kind differs`);
    assert.ok(expected.contact.timeUpper - expected.contact.time <= tolerance * (1 + 1e-6), `${sample.id}: historical TOI bracket too wide`);
    assert.ok(actual.contact.timeUpper - actual.contact.time <= tolerance * (1 + 1e-6), `${sample.id}: current TOI bracket too wide`);
    assert.ok(Math.max(actual.contact.time, expected.contact.time) <= Math.min(actual.contact.timeUpper, expected.contact.timeUpper) + tolerance,
      `${sample.id}: TOI brackets differ by more than one timeTolerance (historical ${expected.contact.time}..${expected.contact.timeUpper}, current ${actual.contact.time}..${actual.contact.timeUpper})`);
  } else if (expected.status === "clear") {
    clearPaths++;
  } else {
    throw new Error(`${sample.id}: fixture case must be resolved; got historical ${expected.status}:${expected.reason}`);
  }
}

const historical = fixture.historicalRemainingBudget;
assert.equal(historical.expected.status, "unresolved");
assert.equal(historical.expected.reason, "budget");
const current = sweepBody([historical.solid], historical.from, historical.to, historical.dimensions, historical.options);
console.log(`${historical.id}: v${fixture.reference.drivingCollisionVersion}@${fixture.reference.commit} was ${historical.expected.status}:${historical.expected.reason} (${historical.expected.tests} tests); current ${current.status}:${current.reason} (${current.tests} tests)`);
assert.equal(current.status, "contact", "optimized solver must resolve tick181 within its captured remaining budget");
assert.equal(current.contact?.solidId, historical.solid.id);

console.log(`Differential CCD fixture v${fixture.reference.drivingCollisionVersion}@${fixture.reference.commit}: ${fixture.cases.length} cases passed (${contacts} contacts, ${clearPaths} clear); historical unresolved budget case kept separate.`);
