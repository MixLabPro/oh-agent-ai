#!/usr/bin/env node
// 事务式 NetworkPatch 守卫（CITY_NETWORK_FIRST_CODE_DESIGN 迁移批次 3，设计 §4.3/§8 合成场景）：
//   (a) 拆边保属性：等级/宽度/桥标记继承，两段端点接续；
//   (b) 版本乐观锁：stale-base 拒绝且零副作用；
//   (c) 校验失败：正式网络逐字节不变（失败无副作用）；
//   (d) 成功提交：一次替换、版本 +1；
//   (e) 确定性：同补丁同网络重复结果一致。
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";

const { emptyNetwork, addNetworkEdge, commitNetworkPatch } = await loadCity({
  "engine/planner/network.ts": ["emptyNetwork", "addNetworkEdge", "commitNetworkPatch"],
});
const snap = (n) => JSON.stringify({ v: n.version ?? 0, nodes: [...n.nodes], edges: [...n.edges] });
const net = emptyNetwork();
addNetworkEdge(net, { x: 0, z: 0 }, { x: 100, z: 0 }, true, true, true);
addNetworkEdge(net, { x: 100, z: 0 }, { x: 200, z: 0 }, false);

// (a) 拆边保属性
let r = commitNetworkPatch(net, { baseVersion: 0, addEdges: [], removeEdgeIds: [], splits: [{ edgeId: "0:0/100:0", at: { x: 50, z: 0 } }] });
assert.ok(r.ok, `split failed: ${JSON.stringify(r)}`);
const half1 = [...net.edges.values()].find((e) => Math.abs(e.points[1].x - 50) < 0.01 && Math.abs(e.points[0].x) < 0.01);
assert.ok(half1, "split half missing");
assert.equal(half1.kind, "arterial", "split lost the arterial kind");
assert.equal(half1.width, 12, "split lost the primary width");
assert.equal(half1.bridge, true, "split lost the bridge flag");
assert.ok(!net.edges.has("0:0/100:0"), "original edge must be gone after split");
const halves = [...net.edges.values()].filter((e) => Math.abs(e.points[1].z) < 0.01 && (Math.abs(e.points[1].x - 50) < 0.01 || Math.abs(e.points[1].x - 100) < 0.01));
assert.equal(halves.length, 2, `split must yield exactly two halves, got ${halves.length}`);
r = commitNetworkPatch(net, { baseVersion: 1, addEdges: [], removeEdgeIds: [], splits: [{ edgeId: halves[0].id, at: { x: halves[0].points[0].x, z: 0 } }] });
assert.ok(!r.ok && r.reason === "self-loop", "split at an endpoint must be rejected as self-loop");
assert.equal(net.version, 1, "version must bump once per commit");

// (b) stale base 拒绝 + 零副作用
const frozen = snap(net);
r = commitNetworkPatch(net, { baseVersion: 0, addEdges: [{ a: { x: 0, z: 0 }, b: { x: 0, z: 90 }, arterial: false }], removeEdgeIds: [], splits: [] });
assert.ok(!r.ok && r.reason === "stale-base", "stale base must be rejected");
assert.equal(snap(net), frozen, "stale-base commit mutated the network");

// (c) 校验失败零副作用
r = commitNetworkPatch(net, { baseVersion: 1, addEdges: [{ a: { x: 0, z: 0 }, b: { x: 0, z: 90 }, arterial: false }], removeEdgeIds: [], splits: [] }, () => "road would cross a site");
assert.ok(!r.ok && r.reason === "validation", "validator veto must fail the commit");
assert.equal(snap(net), frozen, "failed commit mutated the network");

// (d) 未知边拒绝零副作用
r = commitNetworkPatch(net, { baseVersion: 1, addEdges: [], removeEdgeIds: ["no/such"], splits: [] });
assert.ok(!r.ok && r.reason === "unknown-edge", "unknown edge must be rejected");
assert.equal(snap(net), frozen, "unknown-edge commit mutated the network");

// (e) 成功 + 确定性
const ok1 = commitNetworkPatch(net, { baseVersion: 1, addEdges: [{ a: { x: 0, z: 0 }, b: { x: 0, z: 90 }, arterial: false }], removeEdgeIds: [], splits: [] });
assert.ok(ok1.ok && ok1.version === 2, "valid commit must succeed and bump version");
const net2 = emptyNetwork();
addNetworkEdge(net2, { x: 0, z: 0 }, { x: 100, z: 0 }, true, true, true);
addNetworkEdge(net2, { x: 100, z: 0 }, { x: 200, z: 0 }, false);
commitNetworkPatch(net2, { baseVersion: 0, addEdges: [], removeEdgeIds: [], splits: [{ edgeId: "0:0/100:0", at: { x: 50, z: 0 } }] });
commitNetworkPatch(net2, { baseVersion: 1, addEdges: [{ a: { x: 0, z: 0 }, b: { x: 0, z: 90 }, arterial: false }], removeEdgeIds: [], splits: [] });
assert.equal(snap(net2), snap(net), "same patches must yield identical networks");
console.log("City network patch: split attribute inheritance, stale-base/validation/unknown-edge rejections with zero side effects, versioned atomic commit, deterministic.");
