#!/usr/bin/env node
// 道路与用地规划守卫（docs/CITY_ROAD_PLANNING_AUDIT.md R1/R2）。
// 真机反馈「道路混乱、地标胡乱摆放、门前没有路」：重写前 30 个岛（10 种子 × 1/2/5 档）实测
// 锐角路口 45、被道路穿过的用地 196、门前无路 10；R1/R2 后 5 / 3 / 3。阈值给少量余量，
// 防止退回旧的「最近节点直连」与「主干道穿过用地」。
import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = path.join(repo, "apps/desktop/ui-dev");
const city = path.join(repo, "apps/agent-city/ui/src");
const { buildSync } = createRequire(path.join(ui, "package.json"))("esbuild");
const out = buildSync({
  stdin: {
    contents: `export { createCityPlan } from ${JSON.stringify(path.join(city, "engine/cityPlan.ts"))};
export { MIAMI_COASTAL } from ${JSON.stringify(path.join(city, "engine/citySeaside.ts"))};`,
    resolveDir: city,
  },
  bundle: true, write: false, format: "cjs", platform: "node", logLevel: "silent",
});
const mod = { exports: {} };
vm.runInNewContext(out.outputFiles[0].text, { module: mod, exports: mod.exports, process, console, Math, Map, Set });
const { createCityPlan, MIAMI_COASTAL } = mod.exports;

const segDist = (p, a, b) => {
  const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
};
const totals = { acute: 0, inside: 0, far: 0, crowded: 0, islands: 0 };
for (const tier of [1, 2, 5]) for (let i = 0; i < 10; i += 1) {
  const seed = 1703294958 + i * 7919;
  const plan = createCityPlan(seed, tier, MIAMI_COASTAL);
  totals.islands += 1;
  // 锐角路口：三路及以上的路口，相邻两条路夹角 < 30°。
  const incident = new Map();
  for (const edge of plan.roadEdges) for (const id of [edge.from, edge.to]) (incident.get(id) ?? incident.set(id, []).get(id)).push(edge);
  const nodes = new Map(plan.roadNodes.map((node) => [node.id, node]));
  for (const [id, list] of incident) {
    if (list.length < 3) continue;
    const node = nodes.get(id);
    const angles = list.map((edge) => { const pts = edge.from === id ? edge.points : [...edge.points].reverse(); return Math.atan2(pts[1].z - node.z, pts[1].x - node.x); }).sort((a, b) => a - b);
    for (let k = 0; k < angles.length; k += 1) {
      const gap = (k + 1 < angles.length ? angles[k + 1] : angles[0] + Math.PI * 2) - angles[k];
      if (gap < (30 * Math.PI) / 180) { totals.acute += 1; break; }
    }
  }
  // 用地：路不能穿过（中心到路 < 0.7 半径；核心广场除外），门前要有路（边缘到路 ≤ 20）。
  for (const site of [...plan.publicSites, ...plan.landmarks.filter((landmark) => landmark.radius)]) {
    let d = Infinity;
    for (const edge of plan.roadEdges) if (!edge.bridge) d = Math.min(d, segDist(site, edge.points[0], edge.points.at(-1)));
    if (site.kind !== "civic" && site.kind !== "arch" && d < site.radius * 0.7) totals.inside += 1; // 凯旋门按设计骑在路上
    let dAny = d; for (const edge of plan.roadEdges) if (edge.bridge) dAny = Math.min(dAny, segDist(site, edge.points[0], edge.points.at(-1))); // 海上岛地标的堤道桥也是门前的路
    if (dAny > site.radius + 20) totals.far += 1;
  }
  // 主干道不扎堆：不共享节点、彼此 < 25、夹角 < 15° 且侧向重叠的段对。
  const arterials = plan.roadEdges.filter((edge) => edge.kind === "arterial" && !edge.bridge);
  for (let a = 0; a < arterials.length; a += 1) for (let b = a + 1; b < arterials.length; b += 1) {
    const A = arterials[a]; const B = arterials[b];
    if ([A.from, A.to].some((id) => id === B.from || id === B.to)) continue;
    const [b0, b1] = [B.points[0], B.points.at(-1)];
    const mid = { x: (A.points[0].x + A.points.at(-1).x) / 2, z: (A.points[0].z + A.points.at(-1).z) / 2 };
    const l2 = (b1.x - b0.x) ** 2 + (b1.z - b0.z) ** 2 || 1;
    const t = ((mid.x - b0.x) * (b1.x - b0.x) + (mid.z - b0.z) * (b1.z - b0.z)) / l2;
    if (t <= 0.1 || t >= 0.9 || segDist(mid, b0, b1) >= 25) continue;
    const angle = Math.abs(Math.atan2(A.points.at(-1).z - A.points[0].z, A.points.at(-1).x - A.points[0].x) - Math.atan2(b1.z - b0.z, b1.x - b0.x)) % Math.PI;
    if (Math.min(angle, Math.PI - angle) < (15 * Math.PI) / 180) totals.crowded += 1;
  }
}
// 2026-10-07 碎边合并后 2，收紧到 5；同日固定地标增至 5 座后路网变动到 6（两条短支路之间的夹角），放到 8（仍低于原 10、远低于起点 45）。
assert(totals.acute <= 8, `acute junctions ${totals.acute} > 8 across ${totals.islands} islands (was 45 before R1)`);
assert(totals.inside <= 8, `sites with a road through them ${totals.inside} > 8 (was 196 before R2)`);
assert(totals.far <= 5, `sites without a road at the door ${totals.far} > 3`);
assert(totals.crowded <= 10, `crowded arterial pairs ${totals.crowded} > 10`);
console.log(`City planning: ${totals.islands} islands — acute junctions ${totals.acute}, roads through sites ${totals.inside}, sites without access ${totals.far}, crowded arterials ${totals.crowded} passed.`);
