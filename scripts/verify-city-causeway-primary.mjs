#!/usr/bin/env node
// Transaction contract guard, not proof that every offshore owner is served.
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";
const { createCityPlan, MIAMI_COASTAL, componentOf, primaryComponentId, diagnoseNetwork } = await loadCity({
  "engine/cityPlan.ts": ["createCityPlan"],
  "engine/citySeaside.ts": ["MIAMI_COASTAL"],
  "engine/planner/intent.ts": ["componentOf", "primaryComponentId", "diagnoseNetwork"],
});
for (const seed of [2002827683, 2005655366]) {
  const plan = createCityPlan(seed, 1, MIAMI_COASTAL);
  const components = componentOf(plan), primary = primaryComponentId(plan, components);
  for (const owner of plan.landmarks.filter((site) => site.shore)) {
    assert.ok(owner.access, `regression ${seed}: offshore service must recover, not merely report failure`);
    if (owner.access) {
      assert.equal(components.get(owner.access.nodeId), primary, "accepted offshore gate must belong to the main network");
      assert.equal(owner.x, owner.access.ownerX);
      assert.equal(owner.z, owner.access.ownerZ);
      assert.equal(owner.yaw, owner.access.ownerYaw);
    } else {
      assert.ok(plan.connections.some((attempt) => attempt.id === `causeway:${owner.id}` && !attempt.ok),
        "unserved offshore owner must have an explicit failed transaction");
      assert.ok(diagnoseNetwork(plan).unmet.some((demand) => demand.demandId === `site:${owner.id}`),
        "failed access cannot disappear from the necessary-demand denominator");
    }
  }
}
console.log("City causeway primary: two regression islands recover bound offshore entrances on the main network. Other city obligations remain separate gates.");
