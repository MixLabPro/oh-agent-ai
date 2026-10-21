#!/usr/bin/env node
// 修复工具能不能修坏桥头（2026-10-21，用户：「不追求完美，因为我们还有 city repair——玩家能不能用这个工具修复问题是关键」）。
// 真实城市 7/2（生成器斜接桥头的样本）：找出车沿桥轴开不过去的桥 → 用修复补丁整座擦掉 → 按画路工具同一套校验
// （validateRoadAdd：桥长、桥上无路口、两端直引道 ≥6、岸坡不陡）在附近找一笔能画的直桥 → 套补丁、重编驾驶面，
// 同一驾驶内核沿新桥开一遍。断言：每座坏桥都能擦；擦掉后桥与桁架登记一起消失；至少一座坏桥能被重画成车开得过去的桥。
// 只读合成城市，不读用户日志。用法：node scripts/verify-plan-repair-bridgehead.mjs [seed tier]
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";
import { makeRoutePilot } from "./city-kit/route-pilot.mjs";

globalThis.window ??= globalThis;
const kit = await loadCity({
  "engine/cityLayout.ts": ["layoutCity"],
  "cityModel.ts": ["buildCityModel"],
  "engine/planPatch.ts": ["applyPlanPatch", "emptyPlanPatch", "bridgeChain"],
  "engine/planRoadRules.ts": ["validateRoadAdd", "validateEdgeDrop", "snapPoint"],
  "engine/surface/compileSurface.ts": ["compileCitySurface", "landingConnectivity"],
  "engine/surface/SurfaceIndex.ts": ["buildSurfaceIndex"],
  "engine/surface/surfaceRegions.ts": ["buildSurfaceRegions"],
  "game/driving/surfaceFootprint.ts": ["footprintSupport"],
  "game/driving/SurfaceDrivingWorld.ts": ["SurfaceDrivingEnvironment", "SurfaceWorldValidator", "polylineProgress"],
  "game/driving/DrivingKernel.ts": ["DrivingKernel"],
  "game/DrivingSimulation.ts": ["initialDrivingState"],
});

const [seed, tier] = process.argv.length >= 4 ? [Number(process.argv[2]), Number(process.argv[3])] : [7, 2];
const GENERATED_AT = Date.UTC(2026, 9, 7, 12, 0, 0);
let r = 12345; const rnd = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
const rows = Array.from({ length: tier * 400 - 20 }, (_, i) => {
  const total = Math.round(2000 + rnd() ** 3 * 4_000_000); const start = GENERATED_AT - Math.round(rnd() * 28 * 86_400_000);
  return { session_ref: `session:${i}`, harness: ["codex", "claude-code", "dsh"][i % 3], first_event_at: new Date(start).toISOString(),
    last_event_at: new Date(start + Math.round(rnd() * 3_600_000)).toISOString(), event_count: 10, model_ids: ["claude-sonnet-5"],
    tokens: { uncached_input_tokens: Math.round(total * 0.2), cache_read_tokens: Math.round(total * 0.5), cache_write_tokens: Math.round(total * 0.1), output_tokens: Math.round(total * 0.2), total },
    peak_tokens: Math.round(total * 0.3), cost_minor: { amount_minor: Math.round(total / 1000), currency: "USD", basis: "api_equivalent" },
    cost_status: { state: "estimated", reason: "", has_unresolved: false } };
});
const model = kit.buildCityModel({ rows, findings: [], windowStartMs: GENERATED_AT - 30 * 86_400_000, windowEndMs: GENERATED_AT, windowLabel: "30d", totalSessions: rows.length, truncated: false, generatedAt: GENERATED_AT });
const base = kit.layoutCity(model, null, seed);
assert.equal(base.scaleTier, tier, `the synthetic model lands on tier ${tier}`);

const key = { baseSnapshotHash: "repair-bridgehead-v1", vehicleConfigHash: "car-v1", kernelBuildId: "fixture-build-v1",
  surfaceVersion: 2, queryVersion: 2, snapshotCompilerVersion: 1, physicsVersion: 1, collisionVersion: 1, controllerVersion: 1, plannerVersion: 1, observerVersion: 1, manifestHash: "x", releasePolicyVersion: 1, releaseBoundaryHash: null };
const drivePath = makeRoutePilot(kit, key);
const compile = (layout) => {
  const c = kit.compileCitySurface(layout); const surface = { ...c.surface, revision: "repair" };
  const index = kit.buildSurfaceIndex(surface); assert.equal(index.status, "ready");
  const regions = kit.buildSurfaceRegions(surface, index); assert.equal(regions.status, "ready");
  return { c, regions };
};
const onRoad = (layout, p, max = 12) => {
  let best = null, bestD = max;
  for (const e of layout.roadEdges) if (!e.bridge) for (let i = 1; i < e.points.length; i++) {
    const a = e.points[i - 1], b = e.points[i]; const dx = b.x - a.x, dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)); const q = { x: a.x + dx * t, z: a.z + dz * t };
    const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bestD) { bestD = d; best = { x: Math.round(q.x * 100) / 100, z: Math.round(q.z * 100) / 100 }; }
  }
  return best;
};
const leg = (layout, end, other) => {
  const id = `${end.x}:${end.z}`; const ox = end.x - other.x, oz = end.z - other.z, ol = Math.hypot(ox, oz);
  let best = null, bestDot = -Infinity;
  for (const e of layout.roadEdges) {
    if (e.bridge || (e.from !== id && e.to !== id)) continue;
    const pts = e.from === id ? e.points : [...e.points].reverse(); const d = Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z) || 1;
    const dot = ((pts[1].x - pts[0].x) * ox + (pts[1].z - pts[0].z) * oz) / (d * ol);
    if (dot > bestDot) { bestDot = dot; best = { pts, d }; }
  }
  if (!best) return null;
  const t = Math.min(6, best.d * 0.8) / best.d;
  return { x: best.pts[0].x + (best.pts[1].x - best.pts[0].x) * t, z: best.pts[0].z + (best.pts[1].z - best.pts[0].z) * t };
};
const along = (a, b, s) => { const d = Math.hypot(b.x - a.x, b.z - a.z); return { x: a.x + (b.x - a.x) * s / d, z: a.z + (b.z - a.z) * s / d }; };

// ── 1. 坏桥：车沿桥轴（桥前 6 → 桥后 6）开不过去 ──
const before = compile(base);
const decks = base.roadEdges.filter((e) => e.bridge);
const bad = [];
const seen = new Set();
for (const deck of decks) {
  if (seen.has(deck.id)) continue;
  const chain = kit.bridgeChain(base.roadEdges, deck); for (const e of chain) seen.add(e.id);
  const ends = chain.flatMap((e) => [e.points[0], e.points[e.points.length - 1]]);
  let [a, b] = [ends[0], ends[1]]; for (const p of ends) for (const q of ends) if (Math.hypot(p.x - q.x, p.z - q.z) > Math.hypot(a.x - b.x, a.z - b.z)) [a, b] = [p, q];
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  // 沿真实引道开（与 verify-city-structure-surface --cities 的 routed 同口径）：两端各取与离桥方向最一致的地面边，走 6。
  const path = [leg(base, a, b) ?? along(a, b, -6), a, b, leg(base, b, a) ?? along(a, b, len + 6)];
  const pathLen = path.slice(1).reduce((sum, q, i) => sum + Math.hypot(q.x - path[i].x, q.z - path[i].z), 0);
  const forward = drivePath(before.regions, path, { until: pathLen - 0.5 }).result, back = drivePath(before.regions, [...path].reverse(), { until: pathLen - 0.5 }).result;
  if (forward !== "ok" || back !== "ok") bad.push({ deck, chain, a, b, len, forward, back });
}
console.log(`${seed}/${tier}: ${decks.length} deck edges, ${seen.size ? new Set([...seen]).size : 0} in chains; ${bad.length} bridge(s) not drivable straight along the axis`);
for (const x of bad) console.log(`  ${x.deck.id.slice(0, 32)} w${x.deck.width} len ${x.len.toFixed(1)} forward ${x.forward} back ${x.back}`);

// ── 2. 擦掉每座坏桥：校验放行、补丁干净、桥面与登记一起消失 ──
let fixed = 0; const report = [];
for (const x of bad) {
  const verdict = kit.validateEdgeDrop(base, model, x.deck.id);
  assert.deepEqual(verdict.blockers, [], `${x.deck.id}: a whole bridge can be erased`);
  const drop = { ...kit.emptyPlanPatch(base.seed, base.scaleTier), roadOps: [{ t: "drop", edge: x.deck.id }] };
  const erased = { ...kit.applyPlanPatch(base, drop) };
  assert.deepEqual(erased.stale, [], `${x.deck.id}: the erase replays cleanly`);
  assert.ok(!erased.layout.roadEdges.some((e) => x.chain.some((c) => c.id === e.id)), "every deck piece of the bridge is gone");
  assert.equal(erased.layout.bridges.length, base.bridges.length - base.bridges.filter((g) => x.chain.some((c) => {
    const mid = { x: (g.from.x + g.to.x) / 2, z: (g.from.z + g.to.z) / 2 };
    return c.points.some((p, i) => i > 0 && Math.abs((p.x - c.points[i - 1].x) * (mid.z - c.points[i - 1].z) - (p.z - c.points[i - 1].z) * (mid.x - c.points[i - 1].x)) / Math.hypot(p.x - c.points[i - 1].x, p.z - c.points[i - 1].z) <= c.width / 2 + 1);
  })).length, "the truss registry drops exactly the erased bridge");

  // 玩家接着擦掉旧桥头留下的岸边残路（连着旧桥端点的路——它们伸到水边，会横穿新桥面）。
  const landings = new Set(x.chain.flatMap((e) => [e.from, e.to]));
  const stubs = erased.layout.roadEdges.filter((e) => !e.bridge && (landings.has(e.from) || landings.has(e.to)));
  for (const stub of stubs) {
    const v = kit.validateEdgeDrop(erased.layout, model, stub.id); assert.deepEqual(v.blockers, [], `${stub.id}: the leftover shore road can be erased`);
  }
  drop.roadOps.push(...stubs.map((stub) => ({ t: "drop", edge: stub.id })));
  const cleared = kit.applyPlanPatch(base, drop);
  assert.deepEqual(cleared.stale, [], "erasing the leftovers replays cleanly");
  erased.layout = cleared.layout;

  // ── 3. 重画：沿原桥轴平移/旋转，起止点吸附到两岸的路上，取第一笔画路校验全过的 ──
  const ux = (x.b.x - x.a.x) / x.len, uz = (x.b.z - x.a.z) / x.len;
  let drawn = null; const refused = {};
  search: for (const offset of [0, 4, -4, 8, -8, 12, -12, 16, -16, 24, -24, 32, -32]) for (const reach of [14, 18, 24, 30, 40, 50]) for (const skew of [0, 0.08, -0.08, 0.16, -0.16, 0.25, -0.25]) {
    const nx = -uz, nz = ux; const cx = Math.cos(skew), sx = Math.sin(skew); const vx = ux * cx - uz * sx, vz = ux * sx + uz * cx;
    const mid = { x: (x.a.x + x.b.x) / 2 + nx * offset, z: (x.a.z + x.b.z) / 2 + nz * offset };
    const half = x.len / 2 + reach;
    // 玩家的落笔：探针附近 12 内最近的地面路上的点（画路工具再按路口 8 / 路段 4 吸附）。
    const from = onRoad(erased.layout, { x: mid.x - vx * half, z: mid.z - vz * half }), to = onRoad(erased.layout, { x: mid.x + vx * half, z: mid.z + vz * half });
    if (!from || !to || [from, to].some((p) => kit.snapPoint(erased.layout, p.x, p.z).kind === "free")) continue;
    const verdict = kit.validateRoadAdd(erased.layout, model, from, to, x.deck.width);
    for (const code of verdict.blockers.length ? verdict.blockers : verdict.warnings.some((w) => w.startsWith("bridge:")) ? [] : ["no-water"]) refused[code] = (refused[code] ?? 0) + 1;
    if (verdict.blockers.length || !verdict.warnings.some((w) => w.startsWith("bridge:"))) continue;
    drawn = { from: { x: from.x, z: from.z }, to: { x: to.x, z: to.z }, verdict };
    break search;
  }
  if (!drawn) { report.push(`  ${x.deck.id.slice(0, 32)}: erased; no legal straight redraw found nearby ${JSON.stringify(refused)}`); continue; }
  const redraw = { ...drop, roadOps: [...drop.roadOps, { t: "add", from: drawn.from, to: drawn.to, width: x.deck.width }] };
  const repaired = kit.applyPlanPatch(base, redraw);
  assert.deepEqual(repaired.stale, [], `${x.deck.id}: the redraw replays cleanly`);
  const after = compile(repaired.layout);
  // 从桥头前 4 开到桥尾后 4：考的是两个桥头本身（路口里的渠化导流岛在路中线上，沿中线开的领航员会撞岛——那是路口的事）。
  const newDeck = repaired.layout.roadEdges.find((e) => e.bridge && !base.roadEdges.some((o) => o.id === e.id));
  assert.ok(newDeck, "the redraw lays a new deck");
  const [d0, d1] = [newDeck.points[0], newDeck.points[newDeck.points.length - 1]];
  const near = (p) => Math.hypot(p.x - drawn.from.x, p.z - drawn.from.z);
  const [deckFrom, deckTo] = near(d0) < near(d1) ? [d0, d1] : [d1, d0];
  const deckLen = Math.hypot(deckTo.x - deckFrom.x, deckTo.z - deckFrom.z);
  const tail = 4;
  const path = [along(deckFrom, deckTo, -tail), deckFrom, deckTo, along(deckFrom, deckTo, deckLen + tail)];
  // 领航员追最后一个目标点会在终点前打满方向撞路缘（与路面无关，换尾长恒在终点前 0.3 出现）：跑到终点前 0.5 即算通过。
  const until = deckLen + 2 * tail - 0.5;
  const forward = drivePath(after.regions, path, { until }).result, back = drivePath(after.regions, [...path].reverse(), { until }).result;
  assert.ok(!forward.startsWith("invalid") && !back.startsWith("invalid"), `${forward} / ${back}`);
  const ok = forward === "ok" && back === "ok";
  if (ok) fixed++;
  report.push(`  ${x.deck.id.slice(0, 32)}: erased; redrawn ${drawn.verdict.warnings.find((w) => w.startsWith("bridge:"))} from ${drawn.from.x.toFixed(1)}:${drawn.from.z.toFixed(1)} → forward ${forward} back ${back}`);
}
for (const line of report) console.log(line);
if (bad.length) assert.ok(fixed > 0, "at least one defective bridge can be repaired by the player (erase + redraw)");
// 7/2 的悬索桥就是那座斜接坏桥头（驾驶内核在桥头 wheel-twist / 越出桥面）：它必须能被玩家修好。
if (seed === 7 && tier === 2) assert.ok(report.some((line) => line.includes("-16.57:295.97/58.1:308.1") && line.includes("forward ok back ok")), "the 7/2 suspension bridge is repairable");
console.log(`City plan repair bridgehead: ${bad.length} defective bridge(s) on ${seed}/${tier}; every one erasable as a whole (registry follows); ${fixed}/${bad.length} redrawn with the draw tool's own rules and driven across by the same kernel.`);
