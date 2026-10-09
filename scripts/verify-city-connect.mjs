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

const { runConnection, proposeConnection, commitConnection, commitFixedLink, runMiniRoundabout, corridorFailure, CONNECTOR_CONFIG, VALIDATION_CONFIG, emptyNetwork, addNetworkEdge, acuteJunctions } = await loadCity({
  "engine/planner/connect.ts": ["runConnection", "proposeConnection", "commitConnection", "commitFixedLink", "runMiniRoundabout", "corridorFailure", "CONNECTOR_CONFIG", "VALIDATION_CONFIG"],
  "engine/planner/network.ts": ["emptyNetwork", "addNetworkEdge"],
  "engine/planner/constraints.ts": ["acuteJunctions"],
});

/** 合成地理：半径 1000 的平岛（高 1.2），可选竖直河道（x = riverX，宽 riverWidth）、圆形湖与
 *  陡坡盘（slopeDisc.value 自定坡度，缺省 2——批 A 引道阈值为实测 3，负例须 >3）、不可建盘
 *  （干地但 buildable=false，模拟前滩：引道按道路可行条件放行，建筑判据不适用）。 */
function makeWorld({ riverX = -400, riverWidth = 18, lake = null, slopeDisc = null, sites = [], unbuildable = [] } = {}) {
  const inLake = (x, z) => !!lake && Math.hypot(x - lake.x, z - lake.z) < lake.r;
  const inSlope = (x, z) => !!slopeDisc && Math.hypot(x - slopeDisc.x, z - slopeDisc.z) < slopeDisc.r;
  const inUnbuildable = (x, z) => unbuildable.some((d) => Math.hypot(x - d.x, z - d.z) < d.r);
  const height = (x, z) => (Math.hypot(x, z) < 1000 && !inLake(x, z) && Math.abs(x - riverX) >= riverWidth) ? 1.2 : -1;
  const buildable = (x, z) => Math.hypot(x, z) < 988 && !inLake(x, z) && Math.abs(x - riverX) > riverWidth + 12 && (!lake || Math.hypot(x - lake.x, z - lake.z) > lake.r + 12) && !inUnbuildable(x, z);
  const geo = {
    R: 1200, coast: [], bbox: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 },
    hasRiver: true, river: [], riverShift: riverX, riverX: () => riverX, riverWidth: () => riverWidth,
    coastDistance: (x, z) => 1000 - Math.hypot(x, z),
    landClearance: (x, z) => Math.min(1000 - Math.hypot(x, z), Math.abs(x - riverX) - riverWidth),
    hillAngle: 0, hillDir: { x: 0, z: 1 }, hillLine: 5000, hillProj: () => -1,
    height, buildable,
    terrain: { height, slope: (x, z) => (inSlope(x, z) ? (slopeDisc?.value ?? 2) : 0.2), buildable, center: { x: 0, z: 0 }, radius: 1200, coastRadius: () => 1200, hasRiver: true },
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

// (j) 反向/共线端点（§8「反向端点」）：接入线沿悬挂边折回（<35°）时按 junction-angle 拒绝，
//     不产生 0° 重叠的假路口；坡度超限（§8「坡度超限」）：陡坡盘挡住直线，A* 绕过去。
{
  const w = makeWorld();
  addNetworkEdge(w.network, { x: 0, z: 0 }, { x: -120, z: 0 }, false);   // 悬挂边沿 -x
  addNetworkEdge(w.network, { x: -200, z: 0 }, { x: -320, z: 0 }, true); // 目标边在悬挂边的延长线上
  const folded = runConnection(request({ id: "fold" }), w, { strategies: ["direct-projection"] });
  assert.ok(!folded.ok && folded.reason === "junction-angle", `fold-back must be refused: ${JSON.stringify(folded)}`);
  assert.ok(!w.network.edges.has(edgeId("0:0", "-200:0")), "a collinear fold-back edge must not appear");
  const w2 = makeWorld({ slopeDisc: { x: 0, z: 0, r: 90 } });
  addNetworkEdge(w2.network, { x: -200, z: 0 }, { x: -320, z: 0 }, false);
  addNetworkEdge(w2.network, { x: 200, z: 0 }, { x: 320, z: 0 }, true);
  const steep = runConnection(request({ id: "slope", source: { x: -200, z: 0 }, maxLength: 600 }), w2);
  assert.ok(steep.ok && steep.strategy === "grid-astar", `A* around the steep disc expected: ${JSON.stringify(steep)}`);
  for (const e of steep.patch.addEdges) {
    const steps = Math.max(1, Math.ceil(Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z) / 4));
    for (let k = 0; k <= steps; k += 1) {
      const p = { x: e.a.x + (e.b.x - e.a.x) * k / steps, z: e.a.z + (e.b.z - e.a.z) * k / steps };
      assert.ok(Math.hypot(p.x, p.z) >= 90, `route crosses the steep disc at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
    }
  }
  assert.ok(connected(w2.network, "-200:0", "320:0"), "slope detour did not join the components");
}

// (k) mini-roundabout 策略档（city-roundabout，形态盘点 §5-1）：三岔口锐角对（20° < 30°，阈值放宽 (b)）
//     以交通环消解——建环不删边（三条腿只剩环内残头被替换，远端全部经环连通）、弧段全过走廊、
//     建环后整网过角度守卫（acuteJunctions 归零）；陡坡盘挡住 r=10 时升档到 r=12（半径阶梯）；
//     灰带外（≥50°）/腿太短 → 拒绝且零副作用；确定性：两次建环产生相同网络。
{
  const legAt = (w, deg, len, arterial) => addNetworkEdge(w.network, { x: 0, z: 0 }, { x: Math.cos(deg * Math.PI / 180) * len, z: Math.sin(deg * Math.PI / 180) * len }, arterial);
  const trunkAt = (w, deg, len) => addNetworkEdge(w.network, { x: 0, z: 0 }, { x: Math.cos(deg * Math.PI / 180) * len, z: Math.sin(deg * Math.PI / 180) * len }, true, false, true);
  const farId = (deg, len) => `${Math.round(Math.cos(deg * Math.PI / 180) * len * 100) / 100}:${Math.round(Math.sin(deg * Math.PI / 180) * len * 100) / 100}`;
  const view = (w) => ({ roadEdges: [...w.network.edges.values()], roadNodes: [...w.network.nodes.values()] });
  const policy = (w) => ({ requireBuildable: true, maxSlope: 0.9, sites: w.reservations(), siteMargin: CONNECTOR_CONFIG.fallbackSiteMargin });
  // 锐角对：V 三条腿 90° / 70°（夹角 20°，acuteJunctions 标记）/ 220°，各长 120。
  const w = makeWorld();
  legAt(w, 90, 120, false); legAt(w, 70, 120, false); legAt(w, 220, 120, true);
  assert.equal(acuteJunctions.measure(view(w)).length, 1, "scenario must start with exactly one acute junction");
  const r = runMiniRoundabout(w, { id: "0:0", x: 0, z: 0 }, [...w.network.edges.values()]);
  assert.ok(r.ok, `mini-roundabout expected: ${JSON.stringify(r)}`);
  assert.ok(r.radius >= 10 && r.radius <= 14, `ring radius ${r.radius} outside 10..14`);
  assert.ok(r.ring.length >= CONNECTOR_CONFIG.roundaboutMinSegments && r.ring.length <= CONNECTOR_CONFIG.roundaboutMaxSegments, `ring must have 4-6 arc edges, got ${r.ring.length}`);
  assert.ok(!w.network.nodes.has("0:0"), "the ring must replace the junction node (no orphan centre)");
  assert.ok(connected(w.network, farId(90, 120), farId(70, 120)) && connected(w.network, farId(90, 120), farId(220, 120)), "all three leg far-ends must stay connected through the ring (no deletion)");
  assert.equal(w.network.edges.size, 3 + r.ring.length, `3 leg remainders + ${r.ring.length} arc edges expected, got ${w.network.edges.size}`);
  const arterialRemainder = [...w.network.edges.values()].filter((e) => e.kind === "arterial");
  assert.equal(arterialRemainder.length, 1, "the arterial leg's remainder must keep its class/width (attribute inheritance)");
  assert.ok([...w.network.edges.values()].filter((e) => e.width === 5).length >= r.ring.length, "arc edges are local-width ring segments");
  for (const p of r.ring) assert.ok(Math.abs(Math.hypot(p.x, p.z) - r.radius) < 0.06, `ring point (${p.x},${p.z}) off the radius-${r.radius} circle`);
  for (let k = 0; k < r.ring.length; k += 1) {
    const a = r.ring[k]; const b = r.ring[(k + 1) % r.ring.length];
    assert.equal(corridorFailure(w, a, b, policy(w)), null, `arc chord ${k} must pass the ground corridor`);
  }
  assert.equal(acuteJunctions.measure(view(w)).length, 0, "the ring must clear acuteJunctions across the whole network (guard's own predicate)");
  // 半径阶梯：以 V 为圆心的陡坡盘（半径 9）挡住 r=10 的弧段（弦心距 <9 采样入盘），r=12 全线过——走廊校验不空转。
  const wSlope = makeWorld({ slopeDisc: { x: 0, z: 0, r: 9 } });
  legAt(wSlope, 90, 120, false); legAt(wSlope, 70, 120, false); legAt(wSlope, 220, 120, false);
  const rs = runMiniRoundabout(wSlope, { id: "0:0", x: 0, z: 0 }, [...wSlope.network.edges.values()]);
  assert.ok(rs.ok && rs.radius === 12, `radius ladder must climb 10 -> 12 around the slope disc: ${JSON.stringify(rs)}`);
  for (let k = 0; k < rs.ring.length; k += 1) {
    const a = rs.ring[k]; const b = rs.ring[(k + 1) % rs.ring.length];
    assert.equal(corridorFailure(wSlope, a, b, policy(wSlope)), null, `arc chord ${k} at r=12 must clear the slope disc`);
  }
  // 主干三岔口（普查残留的真实形态，如 seed 2004084431：local 78° / trunk 102° / trunk 282°，24.2° 对）：
  // 主干腿进环（环是路口形态不是删路），剩余段保 12 宽，弧段是 local 5 宽的环流。
  const wTrunk = makeWorld();
  legAt(wTrunk, 77.8, 113, false); trunkAt(wTrunk, 102, 36); trunkAt(wTrunk, 282, 36);
  const rt = runMiniRoundabout(wTrunk, { id: "0:0", x: 0, z: 0 }, [...wTrunk.network.edges.values()]);
  assert.ok(rt.ok, `trunk-leg roundabout expected: ${JSON.stringify(rt)}`);
  assert.equal([...wTrunk.network.edges.values()].filter((e) => e.width === 12).length, 2, "trunk leg remainders must keep width 12");
  assert.equal([...wTrunk.network.edges.values()].filter((e) => e.width === 5).length, rt.ring.length + 1, "the ring plus the local leg remainder stay width 5");
  assert.equal(acuteJunctions.measure(view(wTrunk)).length, 0, "trunk roundabout must clear acuteJunctions too");
  assert.ok(connected(wTrunk.network, farId(77.8, 113), farId(102, 36)) && connected(wTrunk.network, farId(102, 36), farId(282, 36)), "trunk junction must stay connected through the ring");
  // 桥腿不参与（环段是地面弧边，不能替换桥跨）：锐角对里一条腿是桥的三岔口拒绝且零副作用。
  const wBridge = makeWorld();
  legAt(wBridge, 80, 120, false); legAt(wBridge, 100, 120, false); legAt(wBridge, 250, 120, false);
  const bridgeId = [ "0:0", farId(100, 120) ].sort().join("/");
  wBridge.network.edges.get(bridgeId).bridge = true;
  const frozenBridge = snap(wBridge.network);
  const rb = runMiniRoundabout(wBridge, { id: "0:0", x: 0, z: 0 }, [...wBridge.network.edges.values()]);
  assert.ok(!rb.ok && rb.reason === "no-target", `bridge-leg junction must be refused: ${JSON.stringify(rb)}`);
  assert.equal(snap(wBridge.network), frozenBridge, "refused bridge-leg roundabout mutated the network");
  // 灰带外（最小夹角 55° ≥ 50°）：策略档不是它的活——拒绝（junction-angle）且零副作用。
  const wWide = makeWorld();
  legAt(wWide, 90, 120, false); legAt(wWide, 35, 120, false); legAt(wWide, 220, 120, false);
  const frozenWide = snap(wWide.network);
  const rw = runMiniRoundabout(wWide, { id: "0:0", x: 0, z: 0 }, [...wWide.network.edges.values()]);
  assert.ok(!rw.ok && rw.reason === "junction-angle", `out-of-band junction must be refused: ${JSON.stringify(rw)}`);
  assert.equal(snap(wWide.network), frozenWide, "refused roundabout mutated the network");
  // 腿太短（12 长，切完剩 <6）：三档半径全作废——如实失败、零副作用（调用方退回删短枝）。
  const wShort = makeWorld();
  legAt(wShort, 90, 12, false); legAt(wShort, 70, 12, false); legAt(wShort, 220, 12, false);
  const frozenShort = snap(wShort.network);
  const rshort = runMiniRoundabout(wShort, { id: "0:0", x: 0, z: 0 }, [...wShort.network.edges.values()]);
  assert.ok(!rshort.ok, "short legs must not yield a roundabout");
  assert.equal(snap(wShort.network), frozenShort, "failed roundabout mutated the network");
  // 确定性：同输入两次建环产生相同网络。
  const build2 = () => { const x = makeWorld(); legAt(x, 90, 120, false); legAt(x, 70, 120, false); legAt(x, 220, 120, true); return x; };
  const wA = build2(); const wB = build2();
  runMiniRoundabout(wA, { id: "0:0", x: 0, z: 0 }, [...wA.network.edges.values()]);
  runMiniRoundabout(wB, { id: "0:0", x: 0, z: 0 }, [...wB.network.edges.values()]);
  assert.equal(snap(wA.network), snap(wB.network), "same input must yield the identical ring network");
}

// ── 批 A 统一终筛门禁（CITY_NETWORK_FIRST_OPTIMIZATION_PLAN §4-A）──────────────────────────
// 提议期预筛与提交期草稿复核共用 validateCandidate；策略级整体豁免已废除。四个负例 + 一个正向对照。

// (i1) 无水陡坡桥策略：纯地面 bridge-candidate 引道穿坡度 9 盘（> 实测阈值 6）——拒（slope），零副作用。
{
  const w = makeWorld({ slopeDisc: { x: 0, z: 75, r: 20, value: 9 } });
  addNetworkEdge(w.network, { x: -40, z: 150 }, { x: 40, z: 150 }, true);
  const frozen = snap(w.network);
  const r = runConnection(request({ id: "steep-dry", allowBridge: true, maxLength: 300 }), w, { strategies: ["bridge-candidate"], bridge: { blockers: [] } });
  assert.ok(!r.ok && r.reason === "slope", `steep dry approach must be refused: ${JSON.stringify(r)}`);
  assert.equal(snap(w.network), frozen, "refused steep approach mutated the network");
}

// (i2) 真实桥陡坡引道：跨河桥的西岸引道穿坡度 9 盘——deck 合法，但引道（ground-approach）拒 slope，零副作用。
{
  const w = makeWorld({ riverX: 0, slopeDisc: { x: -30, z: 0, r: 15, value: 9 } });
  addNetworkEdge(w.network, { x: 60, z: 0 }, { x: 220, z: 0 }, true);
  const frozen = snap(w.network);
  const r = runConnection(request({ id: "steep-bank", source: { x: -60, z: 0 }, allowBridge: true, maxLength: 400 }), w, { strategies: ["bridge-candidate"], bridge: { blockers: [] } });
  assert.ok(!r.ok && r.reason === "slope", `steep river-bank approach must be refused: ${JSON.stringify(r)}`);
  assert.equal(snap(w.network), frozen, "refused steep bank approach mutated the network");
}

// (i3) siteGate 不再豁免坡度：门路（siteGate: true，purpose=site-access）引道穿坡度 9 盘、无 blockers——
//      旧实现（整体豁免 + maxSlope=Infinity）会提交；批 A 起按 ground-approach 有限坡度（实测 6）拒 slope，零副作用。
{
  const w = makeWorld({ slopeDisc: { x: 0, z: 75, r: 20, value: 9 } });
  addNetworkEdge(w.network, { x: -40, z: 150 }, { x: 40, z: 150 }, true);
  const frozen = snap(w.network);
  const r = runConnection(request({ id: "gate-steep", purpose: "site-access", allowBridge: true, maxLength: 300 }), w, { strategies: ["bridge-candidate"], bridge: { self: { x: 0, z: -14, radius: 10 }, blockers: [], siteGate: true }, crossings: false });
  assert.ok(!r.ok && r.reason === "slope", `gate with a steep approach must be refused (no siteGate slope exemption): ${JSON.stringify(r)}`);
  assert.equal(snap(w.network), frozen, "refused steep gate mutated the network");
}

// (i4) 固定路线冲突：堤道 deck 与既有路严格相交且无高程模型——vertical-clearance-unsupported 拒，零副作用。
{
  const w = makeWorld();
  addNetworkEdge(w.network, { x: -100, z: 50 }, { x: 100, z: 50 }, true);
  const frozen = snap(w.network);
  const committed = commitFixedLink(w, [{ a: { x: 0, z: 0 }, b: { x: 0, z: 150 }, arterial: false, bridge: true, primary: false }]);
  assert.ok(!committed.ok, `conflicting fixed deck must be refused: ${JSON.stringify(committed)}`);
  assert.match(committed.detail ?? "", /vertical-clearance-unsupported/, "refusal must name the vertical-clearance cause");
  assert.equal(snap(w.network), frozen, "refused fixed link mutated the network");
}

// (i5) 正向对照（前滩引道）：干地但 buildable=false（前滩）、坡度 0.2（≤6）——引道按道路可行条件放行，
//      不套建筑 buildable 判据（「前滩地面不必满足建筑 buildable，但须按明确道路可行条件验证」）。
{
  const w = makeWorld({ unbuildable: [{ x: 0, z: 60, r: 30 }] });
  addNetworkEdge(w.network, { x: -40, z: 150 }, { x: 40, z: 150 }, true);
  const r = runConnection(request({ id: "beach-gate", allowBridge: true, maxLength: 300 }), w, { strategies: ["bridge-candidate"], bridge: { self: { x: 0, z: -14, radius: 10 }, blockers: [], siteGate: true }, crossings: false });
  assert.ok(r.ok && r.strategy === "bridge-candidate", `gentle unbuildable beachfront approach must pass: ${JSON.stringify(r)}`);
  assert.ok(w.network.edges.size > 1, "beachfront gate must commit its edges");
  assert.ok([...w.network.edges.values()].every((e) => !e.bridge), "no deck is needed on dry beachfront");
}

// (i6) 宽道路侧缘压楼（批 A2 胶囊口径）：次干（宽 8）中心线离用地盘 r+3（旧中心线口径的
//      fallback margin 恰好放行），但侧缘再进 4 个单位压进盘内——胶囊口径拒 site-clearance，零副作用。
{
  const w = makeWorld({ sites: [{ x: 0, z: 100, radius: 20 }] });
  addNetworkEdge(w.network, { x: 0, z: 0 }, { x: 0, z: -60 }, false);
  addNetworkEdge(w.network, { x: -100, z: 123 }, { x: 100, z: 123 }, true);
  const frozen = snap(w.network);
  const r = runConnection(request({ id: "wide-crush", roadClass: "arterial", maxLength: 300 }), w, { strategies: ["direct-projection"] });
  assert.ok(!r.ok && r.reason === "site-clearance", `wide arterial edge crushing the site must be refused: ${JSON.stringify(r)}`);
  assert.equal(snap(w.network), frozen, "refused wide road mutated the network");
}

console.log("City connect: direct projection with attribute-preserving splits, node merge, site detour, bounded grid A* (heading state, expansion budget), search-budget/no-target/stale-base failures with zero side effects, primary-component targeting, explicit ground-bridge-ground candidates (narrow river only), fold-back endpoints refused, slope discs detoured, mini-roundabout rings dissolving acute 3-way junctions (radius ladder, corridor-checked arcs, guard-level angles, zero side effects), unified batch-A final screen (steep dry/river-bank approaches refused, gate clipping other sites refused, conflicting fixed decks refused with vertical-clearance cause, gentle unbuildable beachfront passes, wide-road envelope clearance), deterministic.");
