// 规划违例普查：在大量「样本之外」的种子上测全部约束，报告每条约束的违例率与典型岛。
//   node scripts/city-kit/survey.mjs [种子数=150] [档位=1]
// 用途：30 个固定岛只是回归样本，真实用户的种子千差万别；修规划问题要先看普查的违例率，而不是只盯那 30 个岛。
import { loadCity } from "./index.mjs";

const count = Number(process.argv[2] ?? 150);
const tier = Number(process.argv[3] ?? 1);
const { createCityPlan, MIAMI_COASTAL, CONSTRAINTS } = await loadCity({
  "engine/cityPlan.ts": ["createCityPlan"], "engine/citySeaside.ts": ["MIAMI_COASTAL"], "engine/planner/constraints.ts": ["CONSTRAINTS"],
});
const tally = new Map(CONSTRAINTS.map((c) => [c.id, { islands: 0, total: 0, examples: [] }]));
const started = Date.now();
for (let i = 0; i < count; i += 1) {
  const seed = 2_000_000_000 + i * 104_729; // 与回归样本（1703294958 + i*7919）错开
  const plan = createCityPlan(seed, tier, MIAMI_COASTAL);
  for (const c of CONSTRAINTS) {
    const v = c.measure(plan);
    if (!v.length) continue;
    const t = tally.get(c.id); t.islands += 1; t.total += v.length;
    if (t.examples.length < 2) t.examples.push(`${seed}: ${v[0].detail.slice(0, 90)}`);
  }
}
console.log(`survey: ${count} seeds, tier ${tier}, ${Math.round((Date.now() - started) / 1000)}s`);
for (const [id, t] of tally) console.log(`${id.padEnd(34)} islands ${String(t.islands).padStart(3)}/${count}  violations ${String(t.total).padStart(4)}${t.examples.length ? "   e.g. " + t.examples[0] : ""}`);
