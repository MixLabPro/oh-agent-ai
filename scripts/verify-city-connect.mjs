#!/usr/bin/env node
// 统一连接器守卫（CITY_NETWORK_FIRST_CODE_DESIGN 迁移批次 4，设计 §4/§8 合成场景）：
//   (a) 直连：最近合法路段投影、T 口拆边保属性（等级/宽度继承）、拆边后路径保持；
//   (b) 并线：node-merge 与已有节点直连（全程校验：不过水、可建、坡度、避让用地、端点净空角）；
//   (c) 绕行：直连被用地挡住时，两侧 ± 三档偏移的折线绕过；
//   (d) A*：三档绕行偏移都不够时，有界网格 A*（位置 + 入射方向状态）绕湖接通；
//   (e) 预算耗尽：search-budget 上限返回 search-budget（≠ 无路可走），失败零副作用；
//   (f) 主网定向：目标必须是 primary 分量——诱饵分量更近也不许接；主网不可达时如实失败；
//   (g) stale-base：过期 baseVersion 拒绝且零副作用；
//   (h) 确定性：同输入两次搜索产生相同补丁与相同网络。
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";

const { runConnection, proposeConnection, commitConnection, emptyNetwork, addNetworkEdge } = await loadCity({
  "engine/planner/connect.ts": ["runConnection", "proposeConnection", "commitConnection"],
  "engine/planner/network.ts": ["emptyNetwork", "addNetworkEdge"],
});

/** 合成地理：半径 1000 的平岛（高 1.2），可选竖直河道（x = riverX，宽 riverWidth）与圆形湖。 */
function makeWorld({ riverX = -400, riverWidth = 18, lake = null, sites = [] } = {}) {
  const inLake = (x, z) => !!lake && Math.hypot(x - lake.x, z - lake.z) < lake.r;
  const height = (x, z) => (Math.hypot(x, z) < 1000 && !inLake(x, z) && Math.abs(x - riverX) >= riverWidth) ? 1.2 : -1;
  const buildable = (x, z) => Math.hypot(x, z) < 988 && !inLake(x, z) && Math.abs(x - riverX) > riverWidth + 12 && (!lake || Math.hypot(x - lake.x, z - lake.z) > lake.r + 12);
  const geo = {
    R: 1200, coast: [], bbox: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 },
    hasRiver: true, river: [], riverShift: riverX, riverX: () => riverX, riverWidth: () => riverWidth,
    coastDistance: (x, z) => 1000 - Math.hypot(x, z),
    landClearance: (x, z) => Math.min(1000 - Math.hypot(x, z), Math.abs(x - riverX) - riverWidth),
    hillAngle: 0, hillDir: { x: 0, z: 1 }, hillLine: 5000, hillProj: () => -1,
    height, buildable,
    terrain: { height, slope: () => 0.2, buildable, center: { x: 0, z: 0 }, radius: 1200, coastRadius: () => 1200, hasRiver: true },
  };
  return { network: emptyNetwork(), geo, inRiver: (x, z) => Math.abs(x - riverX) < riverWidth, reservations: () => sites };
}
const snap = (n) => JSON.stringify({ v: n.version ?? 0, nodes: [...n.nodes], edges: [...n.edges] });
const edgeId = (a, b) => [a, b].sort().join("/");
const connected = (network, from, to) => {
  const adj = new Map([...network.nodes.keys()].map((id) => [id, []]));
  for (const e of network.edges.values()) { adj.get(e.from)?.push(e.to); adj.get(e.to)?.push(e.from); }
  const seen = new Set([from]); const queue = [from];
  for (let i = 0; i < queue.length; i += 1) for (const next of adj.get(queue[i]) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  return seen.has(to);
};
const request = (over) => ({ id: "req", source: { x: 0, z: 0 }, target: { kind: "edges", include: () => true }, purpose: "district-access", allowBridge: false, maxLength: 400, roadClass: "local", ...over });

// (a) 直连：投影 T 口拆边，宿主属性保留，拆边后路径保持（设计 §8「拆边后属性与路径保持」）。
{
  const w = makeWorld();
  addNetworkEdge(w.network, { x: 0, z: 0 }, { x: 0, z: -60 }, false);
  addNetworkEdge(w.network, { x: -200, z: 120 }, { x: 200, z: 120 }, true);
  const r = runConnection(request({ id: "direct" }), w);
  assert.ok(r.ok && r.strategy === "direct-projection", `direct projection expected: ${JSON.stringify(r)}`);
  assert.equal(r.version, 1, "commit must bump the version exactly once");
  assert.ok(!w.network.edges.has(edgeId("-200:120", "200:120")), "host edge must be split, not kept whole");
  const halves = [...w.network.edges.values()].filter((e) => e.kind === "arterial" && e.width === 8 && (e.from === "0:120" || e.to === "0:120"));
  assert.equal(halves.length, 2, `split must keep two arterial halves, got ${halves.length}`);
  assert.ok(w.network.edges.has(edgeId("0:0", "0:120")), "connecting edge missing");
  assert.ok(connected(w.network, "0:0", "200:120"), "path lost across the T junction");
}

// (b) 并线：node-merge 直连既有节点（不拆边），通过全部硬校验后提交。
{
  const w = makeWorld();
  addNetworkEdge(w.network, { x: 0, z: 0 }, { x: -60, z: 0 }, false);
  addNetworkEdge(w.network, { x: 120, z: 0 }, { x: 260, z: 0 }, true);
  const r = runConnection(request({ id: "merge", target: { kind: "node", id: "120:0" } }), w, { strategies: ["node-merge"] });
  assert.ok(r.ok && r.strategy === "node-merge", `node merge expected: ${JSON.stringify(r)}`);
  assert.ok(w.network.edges.has(edgeId("0:0", "120:0")), "merge edge missing");
  assert.ok(w.network.edges.has(edgeId("120:0", "260:0")), "merge must not split the host edge");
  assert.ok(connected(w.network, "0:0", "260:0"), "merge did not join the components");
}

// (c) 绕行：直连被用地挡住（site-clearance），折线从侧面绕过（两侧 ±，三档偏移的第一档即可）。
{
  const w = makeWorld({ sites: [{ x: 0, z: 75, radius: 20 }] });
  addNetworkEdge(w.network, { x: 0, z: 0 }, { x: 0, z: -60 }, false);
  addNetworkEdge(w.network, { x: -100, z: 150 }, { x: 100, z: 150 }, true);
  const r = runConnection(request({ id: "detour" }), w, { strategies: ["direct-projection", "detour"] });
  assert.ok(r.ok && r.strategy === "detour", `detour expected: ${JSON.stringify(r)}`);
  assert.equal(r.patch.addEdges.length, 3, `detour must add a polyline, got ${r.patch.addEdges.length} edges`);
  assert.ok(r.patch.splits.length === 1, "detour join should split the host into a T junction");
  assert.ok(connected(w.network, "0:0", "100:150"), "detour did not join the components");
  for (const e of r.patch.addEdges) for (const site of w.reservations()) {
    const mid = { x: (e.a.x + e.b.x) / 2, z: (e.a.z + e.b.z) / 2 };
    assert.ok(Math.hypot(mid.x - site.x, mid.z - site.z) > site.radius, "detour segment grazes the blocking site");
  }
}

// (d) A*：湖挡住直线与三档绕行偏移，有界网格搜索（位置 + 入射方向）绕过去。
{
  const w = makeWorld({ lake: { x: 0, z: 0, r: 90 } });
  addNetworkEdge(w.network, { x: -200, z: 0 }, { x: -320, z: 0 }, false);
  addNetworkEdge(w.network, { x: 200, z: 0 }, { x: 320, z: 0 }, true);
  const r = runConnection(request({ id: "astar", source: { x: -200, z: 0 }, maxLength: 600 }), w);
  assert.ok(r.ok && r.strategy === "grid-astar", `grid A* expected: ${JSON.stringify(r)}`);
  assert.ok(connected(w.network, "-200:0", "320:0"), "A* did not join the components");
  for (const e of r.patch.addEdges) { // 全线不得入水（格点合法 ≠ 走廊合法，终筛以密集采样为准）
    const steps = Math.max(1, Math.ceil(Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z) / 4));
    for (let k = 0; k <= steps; k += 1) {
      const p = { x: e.a.x + (e.b.x - e.a.x) * k / steps, z: e.a.z + (e.b.z - e.a.z) * k / steps };
      assert.ok(Math.hypot(p.x, p.z) >= 90, `A* segment crosses the lake at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
    }
  }
  // (e) 预算耗尽：search-budget 是「未完成搜索」，不是「无路」；失败零副作用。
  const w2 = makeWorld({ lake: { x: 0, z: 0, r: 90 } });
  addNetworkEdge(w2.network, { x: -200, z: 0 }, { x: -320, z: 0 }, false);
  addNetworkEdge(w2.network, { x: 200, z: 0 }, { x: 320, z: 0 }, true);
  const frozen = snap(w2.network);
  const r2 = runConnection(request({ id: "budget", source: { x: -200, z: 0 }, maxLength: 600, searchBudget: 5 }), w2);
  assert.ok(!r2.ok && r2.reason === "search-budget", `search-budget expected: ${JSON.stringify(r2)}`);
  assert.equal(snap(w2.network), frozen, "failed connection mutated the network");
  const r3 = runConnection(request({ id: "no-target", target: { kind: "edges", include: () => false } }), w2);
  assert.ok(!r3.ok && r3.reason === "no-target", `no-target expected: ${JSON.stringify(r3)}`);
  assert.equal(snap(w2.network), frozen, "no-target failure mutated the network");
}

// (f) 主网定向：目标必须是 primary 分量——更近的诱饵分量不许接（不许「接最近分量」）；
//     主网不可达时如实失败并保持零副作用。
{
  const w = makeWorld();
  addNetworkEdge(w.network, { x: 0, z: 0 }, { x: 0, z: -60 }, false);
  addNetworkEdge(w.network, { x: 0, z: 30 }, { x: 300, z: 30 }, false);   // 诱饵：更近，但不是主网
  addNetworkEdge(w.network, { x: 0, z: 300 }, { x: 300, z: 300 }, true);  // 主网
  const primary = new Set(["0:300", "300:300"]);
  const r = runConnection(request({ id: "primary", target: { kind: "primary", isPrimaryNode: (id) => primary.has(id) } }), w);
  assert.ok(r.ok, `primary-targeted connection expected to succeed: ${JSON.stringify(r)}`);
  const added = r.patch.addEdges[r.patch.addEdges.length - 1];
  assert.ok(primary.has(`${added.b.x}:${added.b.z}`) || primary.has(`${added.a.x}:${added.a.z}`), "connection must land on the primary component");
  assert.ok(!connected(w.network, "0:0", "300:30"), "the decoy component must stay unreached");
  // 主网被河隔开：连接器不许退回「接最近分量」，也不许跨水硬连。
  const w2 = makeWorld({ riverX: 0 });
  addNetworkEdge(w2.network, { x: -200, z: 0 }, { x: -320, z: 0 }, false);
  addNetworkEdge(w2.network, { x: -200, z: 40 }, { x: -60, z: 40 }, false); // 诱饵（近，同侧）
  addNetworkEdge(w2.network, { x: 200, z: 0 }, { x: 320, z: 0 }, true);     // 主网（河对岸）
  const primary2 = new Set(["200:0", "320:0"]);
  const frozen = snap(w2.network);
  const r2 = runConnection(request({ id: "primary-blocked", source: { x: -200, z: 0 }, maxLength: 600, target: { kind: "primary", isPrimaryNode: (id) => primary2.has(id) } }), w2);
  assert.ok(!r2.ok && ["water-span", "no-target", "search-budget"].includes(r2.reason), `unreachable primary must fail honestly: ${JSON.stringify(r2)}`);
  assert.equal(snap(w2.network), frozen, "failed primary connection mutated the network");
  assert.ok(!connected(w2.network, "-200:0", "-60:40"), "must not silently connect to the nearer non-primary component");
}

// (g) stale-base：过期 baseVersion 拒绝且零副作用（设计 §8「过期 baseVersion 拒绝」）。
{
  const w = makeWorld();
  addNetworkEdge(w.network, { x: 0, z: 0 }, { x: 0, z: -60 }, false);
  addNetworkEdge(w.network, { x: -200, z: 120 }, { x: 200, z: 120 }, true);
  const proposed = proposeConnection(request({ id: "stale" }), w);
  assert.ok(proposed.ok, "proposal must succeed on a fresh network");
  w.network.version = 7;
  const frozen = snap(w.network);
  const committed = commitConnection(w, proposed);
  assert.ok(!committed.ok && committed.reason === "stale-base", `stale-base expected: ${JSON.stringify(committed)}`);
  assert.equal(snap(w.network), frozen, "stale-base commit mutated the network");
}

// (h) 确定性：同输入两次搜索产生相同补丁；两次提交产生相同网络。
{
  const build = () => {
    const w = makeWorld({ lake: { x: 0, z: 0, r: 90 } });
    addNetworkEdge(w.network, { x: -200, z: 0 }, { x: -320, z: 0 }, false);
    addNetworkEdge(w.network, { x: 200, z: 0 }, { x: 320, z: 0 }, true);
    return w;
  };
  const w1 = build(); const w2 = build();
  const r1 = runConnection(request({ id: "det", source: { x: -200, z: 0 }, maxLength: 600 }), w1);
  const r2 = runConnection(request({ id: "det", source: { x: -200, z: 0 }, maxLength: 600 }), w2);
  assert.ok(r1.ok && r2.ok, "both deterministic runs must succeed");
  assert.equal(JSON.stringify(r1.patch), JSON.stringify(r2.patch), "same input must yield the identical patch");
  assert.equal(snap(w1.network), snap(w2.network), "same input must yield the identical network");
}

// (i) 显式桥候选（批次 5-1，设计 §4.2）：窄河 ground→bridge→ground 三段、桥头在干地、跨距受控；
//     宽河拒绝；不 allowBridge 的普通连接不许「遇水自动可桥」。
{
  // 窄河（宽 18）：地面阶梯全部 water-span 失败，bridge-candidate 产出三段（中段 bridge）。
  const w = makeWorld({ riverX: 0 });
  addNetworkEdge(w.network, { x: -100, z: 0 }, { x: -220, z: 0 }, false);   // 门口悬挂支路
  addNetworkEdge(w.network, { x: 100, z: 0 }, { x: 220, z: 0 }, true);      // 对岸干道
  const noBridge = runConnection(request({ id: "nobridge", source: { x: -100, z: 0 }, maxLength: 400 }), w);
  assert.ok(!noBridge.ok && ["water-span", "slope", "no-target", "search-budget"].includes(noBridge.reason), `ground ladder must refuse to cross the river: ${JSON.stringify(noBridge)}`);
  assert.ok(!connected(w.network, "-100:0", "220:0"), "ground-only request must not reach the far bank");
  assert.ok([...w.network.edges.values()].every((e) => !e.bridge), "ground-only request must not sneak a bridge edge in");
  const br = runConnection(request({ id: "bridge", source: { x: -100, z: 0 }, maxLength: 400, allowBridge: true }), w, { strategies: ["bridge-candidate"], crossings: false });
  assert.ok(br.ok && br.strategy === "bridge-candidate", `bridge candidate expected: ${JSON.stringify(br)}`);
  assert.equal(br.patch.addEdges.length, 3, `ground-bridge-ground needs 3 segments, got ${br.patch.addEdges.length}`);
  assert.equal(br.patch.addEdges.filter((e) => e.bridge).length, 1, "exactly the middle segment is the bridge");
  assert.equal(br.bridgeSpans.length, 1, "one bridge span to register");
  for (const end of [br.bridgeSpans[0].from, br.bridgeSpans[0].to]) assert.ok(w.geo.height(end.x, end.z) > 0.5, "bridgeheads must sit on dry land");
  const committed = runConnection(request({ id: "bridge2", source: { x: -100, z: 0 }, maxLength: 400, allowBridge: true }), w, { strategies: ["bridge-candidate"], crossings: false });
  assert.ok(committed.ok, "the bridge connection must commit");
  assert.ok(connected(w.network, "-100:0", "220:0"), "bridge did not join the banks");
  assert.ok([...w.network.edges.values()].some((e) => e.bridge), "the committed network must carry the bridge edge");
  // 宽河（跨距 > 84）：拒绝成桥，且零副作用。
  const w2 = makeWorld({ riverX: 0, riverWidth: 140 });
  addNetworkEdge(w2.network, { x: -200, z: 0 }, { x: -320, z: 0 }, false);
  addNetworkEdge(w2.network, { x: 200, z: 0 }, { x: 320, z: 0 }, true);
  const frozen = snap(w2.network);
  const tooWide = runConnection(request({ id: "wide", source: { x: -200, z: 0 }, maxLength: 800, allowBridge: true }), w2, { strategies: ["bridge-candidate"], crossings: false });
  assert.ok(!tooWide.ok && tooWide.reason === "water-span", `wide river must be refused: ${JSON.stringify(tooWide)}`);
  assert.equal(snap(w2.network), frozen, "refused bridge mutated the network");
}

console.log("City connect: direct projection with attribute-preserving splits, node merge, site detour, bounded grid A* (heading state, expansion budget), search-budget/no-target/stale-base failures with zero side effects, primary-component targeting, explicit ground-bridge-ground candidates (narrow river only), deterministic.");
