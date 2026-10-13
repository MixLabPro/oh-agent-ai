/** Deterministic work accounting. A planning attempt owns one ledger across
 * request retries, repair drafts and radius attempts; rejection never refunds
 * work already done. This primitive does not itself schedule or publish work. */
export const PLANNING_WORK_UNITS = ["candidate", "terrainSample", "expandedState", "cloneRow", "transaction", "radiusAttempt", "derivedRow"] as const;
export type PlanningWorkUnit = typeof PLANNING_WORK_UNITS[number];
export type PlanningWorkCounts = Readonly<Record<PlanningWorkUnit, number>>;
export type PlanningStop =
  | { readonly status: "cancelled"; readonly stage: string }
  | { readonly status: "budget-exhausted"; readonly stage: string; readonly unit: PlanningWorkUnit;
      readonly requested: number; readonly consumed: number; readonly limit: number };
export class PlanningInterrupted extends Error {
  readonly detail: PlanningStop;
  constructor(detail: PlanningStop) {
    super(detail.status === "cancelled" ? `planning-cancelled:${detail.stage}`
      : `planning-budget-exhausted:${detail.stage}:${detail.unit}`);
    this.name = "PlanningInterrupted";
    this.detail = Object.freeze({ ...detail });
  }
}
export type PlanningWorkSnapshot = {
  readonly limits: PlanningWorkCounts;
  readonly consumed: PlanningWorkCounts;
  readonly stop?: PlanningStop;
};
export type PlanningWorkLedger = {
  /** Charge before doing work. Multi-unit charges are atomic; an over-limit
   * request performs no work and terminally stops this whole planning job. */
  readonly spend: (stage: string, charge: Partial<Record<PlanningWorkUnit, number>>) => void;
  readonly check: (stage: string) => void;
  readonly snapshot: () => PlanningWorkSnapshot;
};
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const stageValid = (stage: string) => typeof stage === "string" && stage.length > 0 && stage.length <= 128;

export function createPlanningWorkLedger(input: PlanningWorkCounts, isCancelled: () => boolean = () => false): PlanningWorkLedger {
  const limits = Object.freeze({ ...input });
  if (!input || Object.keys(limits).length !== PLANNING_WORK_UNITS.length
    || PLANNING_WORK_UNITS.some(unit => !Object.hasOwn(limits, unit) || !count(limits[unit])))
    throw new Error("invalid-planning-work-limits");
  const consumed = Object.fromEntries(PLANNING_WORK_UNITS.map(unit => [unit, 0])) as Record<PlanningWorkUnit, number>;
  let stop: PlanningInterrupted | undefined;
  const check = (stage: string) => {
    if (!stageValid(stage)) throw new Error("invalid-planning-work-stage");
    if (stop) throw stop;
    if (isCancelled()) { stop = new PlanningInterrupted({ status: "cancelled", stage }); throw stop; }
  };
  const spend = (stage: string, charge: Partial<Record<PlanningWorkUnit, number>>) => {
    check(stage);
    if (!charge || typeof charge !== "object" || Array.isArray(charge)
      || (Object.getPrototypeOf(charge) !== Object.prototype && Object.getPrototypeOf(charge) !== null))
      throw new Error("invalid-planning-work-charge");
    const charges = { ...charge };
    if (Object.keys(charges).some(unit => !PLANNING_WORK_UNITS.includes(unit as PlanningWorkUnit) || !count(charges[unit as PlanningWorkUnit])))
      throw new Error("invalid-planning-work-charge");
    // Fixed dimension order makes the reported first exhausted unit independent
    // of caller property ordering, without changing the candidate ordering.
    for (const unit of PLANNING_WORK_UNITS) {
      const amount = charges[unit] ?? 0;
      if (amount > limits[unit] - consumed[unit]) {
        stop = new PlanningInterrupted({ status: "budget-exhausted", stage, unit,
          requested: amount, consumed: consumed[unit], limit: limits[unit] });
        throw stop;
      }
    }
    for (const unit of PLANNING_WORK_UNITS) consumed[unit] += charges[unit] ?? 0;
  };
  return Object.freeze({ check, spend, snapshot: () => Object.freeze({ limits,
    consumed: Object.freeze({ ...consumed }), ...(stop ? { stop: stop.detail } : {}) }) });
}
