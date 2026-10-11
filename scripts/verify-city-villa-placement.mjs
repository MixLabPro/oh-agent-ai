import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";
const { createCityPlan, MIAMI_COASTAL, CONSTRAINTS, diagnoseNetwork, inspectModelGround, inspectEnvelopeRoad } = await loadCity({
  "engine/cityPlan.ts": ["createCityPlan"], "engine/citySeaside.ts": ["MIAMI_COASTAL"],
  "engine/planner/constraints.ts": ["CONSTRAINTS"], "engine/planner/intent.ts": ["diagnoseNetwork"],
  "engine/planner/modelGround.ts": ["inspectModelGround"], "engine/planner/modelEnvelope.ts": ["inspectEnvelopeRoad"],
});
const plan = createCityPlan(1703310796, 2, MIAMI_COASTAL);
const owner = plan.landmarks.find(site => site.id === "landmark:villa-complex");
assert(owner, "required regression model cannot disappear");
assert.equal(owner.radius, 34, "do not shrink the renderer or its plot");
assert.equal(inspectModelGround(owner, { height: plan.terrain.height, inRiver: () => false }).status, "partial");
assert.equal(plan.planningOutcome.status, "degraded");
assert.deepEqual(plan.planningOutcome.groundFailures, []);
assert.deepEqual(diagnoseNetwork(plan).unmet, []);
assert.equal(plan.capacity.satisfied, true);
assert.equal(plan.derivedFinalization.ok, true);
for (const constraint of CONSTRAINTS) assert.deepEqual(constraint.measure(plan), [], constraint.id);
for (const road of plan.roadEdges) {
  const result = inspectEnvelopeRoad(owner, road, { setback: 3 });
  assert.equal(result.status, "partial"); assert.equal(result.entity.relation, "clear", road.id);
}
for (const points of plan.highways) {
  const result = inspectEnvelopeRoad(owner, { width: 10.5, points }, { setback: 1 });
  assert.equal(result.status, "partial"); assert.equal(result.entity.relation, "clear");
}
assert(plan.solveReport.some(entry => entry.name === "resiteWetShoreSites" && entry.changes > 0), "accepted repair must be attributed");
console.log("City villa placement: 1703310796/t2 keeps the owner/radius, admits actual ground and complete XY corridors, all registered constraints/required demands/capacity pass; full physics/global budgets remain pending.");
