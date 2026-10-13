import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";
const { PLANNING_WORK_UNITS, createPlanningWorkLedger, PlanningInterrupted } = await loadCity({
  "engine/planner/operationBudget.ts": ["PLANNING_WORK_UNITS", "createPlanningWorkLedger", "PlanningInterrupted"],
});
const limits = maximum => Object.fromEntries(PLANNING_WORK_UNITS.map(unit => [unit, maximum]));
{
  const input = limits(3), ledger = createPlanningWorkLedger(input);
  input.candidate = 100;
  ledger.spend("request:1", { candidate: 1, cloneRow: 2 });
  const first = ledger.snapshot();
  ledger.spend("rejected-draft", { candidate: 1 });
  ledger.spend("radius-retry", { candidate: 1, radiusAttempt: 1 });
  assert.equal(first.consumed.candidate, 1, "snapshots do not change with later work");
  assert.equal(ledger.snapshot().consumed.candidate, 3, "rejection and retry share cumulative accounting");
  assert.throws(() => { first.consumed.candidate = 0; }, TypeError);
  assert.throws(() => { first.limits.candidate = 100; }, TypeError);
  assert.throws(() => ledger.spend("next-request", { candidate: 1, terrainSample: 2 }), error =>
    error instanceof PlanningInterrupted && error.detail.status === "budget-exhausted" && error.detail.unit === "candidate");
  assert.equal(ledger.snapshot().consumed.terrainSample, 0, "failed multi-charge is atomic");
  assert.throws(() => ledger.check("final-publication"), PlanningInterrupted, "exhaustion remains terminal");
}
{
  let cancelled = false;
  const ledger = createPlanningWorkLedger(limits(5), () => cancelled);
  ledger.spend("first-draft", { transaction: 1 }); cancelled = true;
  assert.throws(() => ledger.check("publish"), error => error.detail?.status === "cancelled");
  cancelled = false;
  assert.throws(() => ledger.spend("retry-after-cancellation", {}), PlanningInterrupted);
  assert.equal(ledger.snapshot().consumed.transaction, 1);
}
{
  const run = charge => {
    const ledger = createPlanningWorkLedger(limits(0));
    try { ledger.spend("same-stage", charge); } catch (error) { return error.detail; }
  };
  assert.deepEqual(run({ terrainSample: 1, candidate: 1 }), run({ candidate: 1, terrainSample: 1 }));
  const ledger = createPlanningWorkLedger(limits(2));
  for (const charge of [{ candidate: NaN }, { candidate: -1 }, { candidate: 0.1 }, { unknown: 1 }, [], Object.create({ candidate: -1 })])
    assert.throws(() => ledger.spend("invalid", charge), /invalid-planning-work-charge/);
  assert.equal(ledger.snapshot().consumed.candidate, 0);
  let reads = 0;
  ledger.spend("getter-snapshot", { get candidate() { reads += 1; return reads === 1 ? 1 : -1; } });
  assert.equal(reads, 1, "input accessors are read once before mutation");
  assert.equal(ledger.snapshot().consumed.candidate, 1);
  assert.throws(() => createPlanningWorkLedger({}), /invalid-planning-work-limits/);
  assert.throws(() => createPlanningWorkLedger(limits(Infinity)), /invalid-planning-work-limits/);
  const huge = createPlanningWorkLedger(limits(Number.MAX_SAFE_INTEGER));
  huge.spend("all", { expandedState: Number.MAX_SAFE_INTEGER });
  assert.throws(() => huge.spend("overflow", { expandedState: 1 }), PlanningInterrupted);
}
console.log("City operation budget: cumulative no-refund accounting, atomic charges, terminal cancellation/exhaustion, immutable snapshots and deterministic reasons pass; production scheduling/wiring and measured default limits remain pending.");
