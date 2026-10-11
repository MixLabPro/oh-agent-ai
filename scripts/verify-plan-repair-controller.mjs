#!/usr/bin/env node
// 规划修复交互状态机守卫（docs/CITY_PLAN_MANUAL_REPAIR_SPEC.md §7.1）：纯逻辑，依赖全部注入。
//   (a) 未进入模式时点击一律忽略；进入后提示先选楼；
//   (b) 点会话楼 → 选中 + 候选；无候选给 warn；点非会话物体 → warn 且不改选中；
//   (c) 选中后点地面 → 找最近地块 → 搬楼；成功后重新选中（恢复选中环）并刷新候选，带 warnings 时 kind=warn；
//   (d) 硬阻止逐条翻译成人话，不静默失败，选中不丢；
//   (e) 点自己所在地块不产生补丁；点不到地块 / 点天空；
//   (f) Esc：先取消选中再退出模式；退出清选中环；
//   (g) refresh：楼消失 → 取消选中；楼还在 → 重算候选；
//   (h) subscribe 每次状态变化都通知，退订后不再通知；
//   (i) 橡皮擦：悬停预览（可擦=红/不可擦=灰+原因）、点击擦除、不能擦时给原因且不改路、空地提示；
//   (j) 画路：吸附预览、先落起点再落笔、预览红绿、成功后以终点接着画、失败保留起点并说明原因、锁定吸附点被拒；
//   (k) Esc 层级：画路放弃起点 → 回到选择工具 → 取消选中 → 退出；
//   (l) 工具切换清空选中/起点/预览；路宽切换重算预览；画路/橡皮擦忽略射线先命中的建筑；
//   (m) 悬停抖动（< 0.75）不重算，鼠标离开清预览；
//   (n) 设施工具：射线悬停高亮实例、点选后列合法目标、点目标搬家（背景楼 id 变了也能重新选中）、阻止原因逐条翻译、
//       点会话楼/致敬地标给分工说明、拆除（按钮/Delete）、Esc 先取消选中再回到移楼工具。
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";

const { RepairController, blockerText } = await loadCity({ "planRepair/controller.ts": ["RepairController", "blockerText"] });

function harness(overrides = {}) {
  const log = { moves: [], selected: [], candidateCalls: [], adds: [], drops: [], siteMoves: [], siteRemoves: [], nodeMoves: [], viaducts: [], cuts: [] };
  const buildings = new Set(["b1", "b2"]);
  const parcelOf = { b1: "p1", b2: "p2" };
  const cand = (parcelId, x) => ({ parcelId, x, z: 0, yaw: 0, width: 8, depth: 8, distance: 5, warnings: [] });
  const deps = {
    isSessionBuilding: (id) => buildings.has(id),
    candidates: (id) => { log.candidateCalls.push(id); return deps.candidateList ?? [cand("p3", 10), cand("p4", 20)]; },
    nearestParcel: (x) => (x < 100 ? { id: x < 15 ? "p3" : x < 50 ? "p1" : "pX" } : null),
    parcelOf: (id) => parcelOf[id] ?? null,
    moveBuilding: (id, parcelId) => { log.moves.push([id, parcelId]); return deps.moveResult ?? { ok: true, patch: {}, warnings: [] }; },
    setSelected: (id) => log.selected.push(id),
    // 道路：snap 把坐标原样吸附成自由点，x<0 视为吸附到锁定桥面；edgeAt 在 |z|<4 的带里命中路段 e1（z<0 命中锁定的 bridge）。
    snap: (x, z) => ({ x, z, kind: "free", locked: x < 0 }),
    edgeAt: (x, z) => (Math.abs(z) < 4 ? { id: z < -1 ? "bridge" : "e1", points: [{ x: 0, z: 0 }, { x: 100, z: 0 }], width: 5, locked: z < -1 } : null),
    validateAdd: (from, to) => (deps.addVerdict ?? { blockers: [], warnings: [] }),
    addRoad: (from, to, width, purpose) => { log.adds.push([from, to, width, purpose]); return deps.addResult ?? { ok: true, patch: {}, warnings: [] }; },
    // 高架：z∈[290,310] 的带里有一条东西向高架；(500,300) 是它的开口端。
    validateHighway: (points) => (deps.viaductVerdict ?? { blockers: [], warnings: [] }),
    addHighway: (points) => { log.viaducts.push(points.map((q) => ({ ...q }))); return deps.viaductResult ?? { ok: true, patch: {}, warnings: [] }; },
    highwayAt: (x, z) => (Math.abs(z - 300) < 10 && x < 500 ? { points: [{ x: x - 20, z: 300 }, { x: x + 20, z: 300 }], width: 10.5 } : null),
    cutHighway: (x, z) => { log.cuts.push([x, z]); return { ok: true, patch: {}, warnings: ["cuts-viaduct"] }; },
    highwayEndAt: (x, z) => (Math.hypot(x - 500, z - 300) <= 12 ? { x: 500, z: 300 } : null),
    validateDrop: (id) => (id === "bridge" ? { blockers: ["locked-edge"], warnings: [] } : (deps.dropVerdict ?? { blockers: [], warnings: [] })),
    dropEdge: (id) => { log.drops.push(id); return deps.dropResult ?? { ok: true, patch: {}, warnings: [] }; },
    dropEdges: (ids) => { log.drops.push(...ids); return { ok: true, patch: {}, warnings: [] }; },
    // 路口：(0,0)、(100,0) 两个路口；(-100,0) 的路口连着桥（锁定）。
    nodeAt: (x, z) => {
      const nodes = [{ id: "n0", x: 0, z: 0 }, { id: "n1", x: 100, z: 0 }, { id: "nb", x: -100, z: 0, locked: true }];
      const hit = nodes.find((node) => Math.hypot(node.x - x, node.z - z) <= 10);
      return hit ? { id: hit.id, x: hit.x, z: hit.z, locked: !!hit.locked, edges: [{ points: [{ x: hit.x, z: hit.z }, { x: hit.x + 50, z: 0 }], width: 5, atStart: true }] } : null;
    },
    validateMove: (id, x, z) => (deps.moveVerdict ?? { blockers: [], warnings: [] }),
    moveNode: (id, x, z) => { log.nodeMoves.push([id, x, z]); return deps.moveNodeResult ?? { ok: true, patch: {}, warnings: [] }; },
    buildingGhost: (id, x, z) => ({ targetId: "pG", rect: { x, z, yaw: 0, width: 8, depth: 8 }, blockers: x < 0 ? ["parcel-occupied"] : [], warnings: [] }),
    siteGhost: (site, x, z) => ({ targetId: "@" + x + "," + z, rect: { x, z, yaw: 0, width: site.width, depth: site.depth, round: site.level === "free" }, blockers: x < 0 ? ["not-buildable"] : [], warnings: [] }),
    // 设施：ray.hit 为设施 id（或 null）；目标/搬家/拆除记日志。
    pickSite: (ray) => (ray && ray.hit ? deps.sites[ray.hit] ?? null : null),
    siteById: (id) => deps.sites[id] ?? null,
    siteTargets: (site) => (site.level === "block" ? [{ id: "B2", x: 200, z: 100, yaw: 0, width: 40, depth: 40, distance: 100 }] : [{ id: "pF1", x: 90, z: 200, yaw: 0, width: 8, depth: 8, distance: 20 }, { id: "pF2", x: 110, z: 200, yaw: 0, width: 8, depth: 8, distance: 40 }]),
    siteTargetAt: (site, x) => (x < 0 ? null : site.level === "block" ? "B2" : "pF1"),
    moveSite: (site, targetId) => { log.siteMoves.push([site.id, targetId]); return deps.siteMoveResult ?? { ok: true, patch: {}, warnings: [], siteId: site.kind === "context" ? `context:${targetId}` : site.id }; },
    removeSite: (site) => { log.siteRemoves.push(site.id); return deps.siteRemoveResult ?? { ok: true, patch: {}, warnings: [] }; },
    sites: { "civic:0": { id: "civic:0", kind: "civic", civicKind: "school", x: 100, z: 100, yaw: 0, width: 40, depth: 40, height: 28, y: 2, level: "block", slotId: "B1" },
      "context:pC": { id: "context:pC", kind: "context", x: 70, z: 200, yaw: 0, width: 8, depth: 8, height: 15, y: 2, level: "parcel", slotId: "pC" },
      "context:pF1": { id: "context:pF1", kind: "context", x: 90, z: 200, yaw: 0, width: 8, depth: 8, height: 15, y: 2, level: "parcel", slotId: "pF1" } },
    siteMoveResult: undefined, siteRemoveResult: undefined,
    candidateList: undefined, moveResult: undefined, addVerdict: undefined, addResult: undefined, dropVerdict: undefined, dropResult: undefined, ...overrides,
  };
  return { deps, log, controller: new RepairController(deps), buildings, parcelOf };
}

// (a) 未进入模式忽略；进入后提示。
{
  const { controller, log } = harness();
  controller.click({ pickedId: "b1", ground: null });
  assert.equal(controller.snapshot.buildingId, null, "clicks before enter() are ignored");
  assert.equal(log.selected.length, 0);
  controller.enter();
  assert.equal(controller.snapshot.active, true);
  assert.equal(controller.snapshot.message.kind, "hint");
  controller.click({ pickedId: null, ground: { x: 10, z: 0 } });
  assert.match(controller.snapshot.message.text, /点选任意建筑/, "a ground click with nothing selected asks for a building first");
  assert.equal(log.moves.length, 0);
}

// (b) 选楼 / 无候选 / 点非会话物体。
{
  const { controller, log, deps } = harness();
  controller.enter();
  controller.click({ pickedId: "b1", ground: null });
  assert.equal(controller.snapshot.buildingId, "b1");
  assert.equal(controller.snapshot.candidates.length, 2);
  assert.deepEqual(log.selected, ["b1"], "the engine selection ring follows");
  deps.candidateList = [];
  controller.click({ pickedId: "b2", ground: null });
  assert.equal(controller.snapshot.buildingId, "b2");
  assert.equal(controller.snapshot.message.kind, "warn", "no candidates is called out, not hidden");
  controller.click({ pickedId: "decor:fountain", ground: null });
  assert.equal(controller.snapshot.buildingId, "b2", "clicking a non-session object keeps the current selection");
  assert.match(controller.snapshot.message.text, /不是建筑/, "decoration that is not a building (beach, pier, bridge) is explained, not silently ignored");
}

// (c) 搬成功：重新选中 + 候选刷新；带 warnings → warn。
{
  const { controller, log, deps } = harness();
  controller.enter();
  controller.click({ pickedId: "b1", ground: null });
  const callsBefore = log.candidateCalls.length;
  controller.click({ pickedId: null, ground: { x: 10, z: 0 } }); // nearestParcel → p3
  assert.deepEqual(log.moves, [["b1", "p3"]]);
  assert.equal(controller.snapshot.buildingId, "b1", "the building stays selected after a move");
  assert.equal(controller.snapshot.message.kind, "ok");
  assert.equal(log.candidateCalls.length, callsBefore + 1, "candidates are recomputed for the new position");
  assert.equal(log.selected.at(-1), "b1", "the selection ring is restored after the engine rebuilds");
  deps.moveResult = { ok: true, patch: {}, warnings: ["cross-district"] };
  controller.click({ pickedId: null, ground: { x: 10, z: 0 } });
  assert.equal(controller.snapshot.message.kind, "warn");
  assert.match(controller.snapshot.message.text, /已搬出它所属的小区/);
}

// (d) 硬阻止翻译成人话，选中不丢。
{
  const { controller, deps } = harness();
  controller.enter();
  controller.click({ pickedId: "b1", ground: null });
  deps.moveResult = { ok: false, reason: "blocked", blockers: ["parcel-occupied", "building-overlap"] };
  controller.click({ pickedId: null, ground: { x: 10, z: 0 } });
  const message = controller.snapshot.message;
  assert.equal(message.kind, "error");
  assert.ok(message.text.includes(blockerText("parcel-occupied")) && message.text.includes(blockerText("building-overlap")), "every blocker is spelled out");
  assert.ok(!/parcel-occupied|building-overlap/.test(message.text), "no raw codes leak into the UI");
  assert.equal(controller.snapshot.buildingId, "b1", "a rejected move keeps the selection");
  deps.moveResult = { ok: false, reason: "patch-tier-1-vs-city-tier-2: reset() first" };
  controller.click({ pickedId: null, ground: { x: 10, z: 0 } });
  // 跨档失效的补丁以 reason 形式回来：翻成人话并指向面板上的清除按钮，不把 reset() 这种开发口吻漏给用户。
  assert.match(controller.snapshot.message.text, /扩大了一档.*清除失效修改/, "a tier-changed failure is explained and points at the fix");
  assert.ok(!/reset\(\)|patch-tier/.test(controller.snapshot.message.text), "…without leaking the raw reason");
  deps.moveResult = { ok: false, reason: "something-else" };
  controller.click({ pickedId: null, ground: { x: 10, z: 0 } });
  assert.match(controller.snapshot.message.text, /something-else/, "unknown non-blocker failures still show their reason");
}

// (e) 自己的地块 / 无地块 / 天空。
{
  const { controller, log } = harness();
  controller.enter();
  controller.click({ pickedId: "b1", ground: null });
  controller.click({ pickedId: null, ground: { x: 30, z: 0 } }); // nearestParcel → p1 = b1 所在
  assert.equal(log.moves.length, 0, "dropping a building on its own parcel must not create a patch entry");
  assert.match(controller.snapshot.message.text, /已经在这个地块上/);
  controller.click({ pickedId: null, ground: { x: 500, z: 0 } }); // 无地块
  assert.equal(controller.snapshot.message.kind, "warn");
  assert.equal(log.moves.length, 0);
  controller.click({ pickedId: null, ground: null }); // 天空
  assert.equal(controller.snapshot.buildingId, null, "clicking the sky deselects");
}

// (f) Esc：先取消选中，再退出；退出清选中环。
{
  const { controller, log } = harness();
  controller.enter();
  controller.click({ pickedId: "b1", ground: null });
  controller.cancel();
  assert.equal(controller.snapshot.active, true);
  assert.equal(controller.snapshot.buildingId, null);
  assert.equal(log.selected.at(-1), null);
  controller.cancel();
  assert.equal(controller.snapshot.active, false, "a second Esc leaves repair mode");
  controller.click({ pickedId: "b1", ground: null });
  assert.equal(controller.snapshot.buildingId, null, "inactive again → clicks ignored");
}

// (g) refresh。
{
  const { controller, log, buildings } = harness();
  controller.enter();
  controller.click({ pickedId: "b1", ground: null });
  const before = log.candidateCalls.length;
  controller.refresh({ kind: "ok", text: "已撤销" });
  assert.equal(log.candidateCalls.length, before + 1, "refresh recomputes candidates");
  assert.equal(controller.snapshot.message.text, "已撤销");
  buildings.delete("b1");
  controller.refresh();
  assert.equal(controller.snapshot.buildingId, null, "a vanished building is deselected, not left dangling");
  assert.equal(controller.snapshot.message.kind, "warn");
}

// (h) subscribe。
{
  const { controller } = harness();
  let notified = 0;
  const off = controller.subscribe(() => { notified += 1; });
  controller.enter(); controller.click({ pickedId: "b1", ground: null });
  assert.ok(notified >= 2);
  off();
  const frozen = notified;
  controller.cancel();
  assert.equal(notified, frozen, "unsubscribed listeners hear nothing");
}

// (i) 橡皮擦。
{
  const { controller, log, deps } = harness();
  controller.enter();
  controller.setTool("erase");
  assert.equal(controller.snapshot.tool, "erase");
  assert.match(controller.snapshot.message.text, /橡皮擦/);
  controller.hover({ x: 50, z: 1 });
  let preview = controller.snapshot.preview;
  assert.equal(preview.kind, "erase"); assert.equal(preview.ok, true, "an erasable road previews as ok (drawn red)"); assert.equal(preview.reason, null);
  controller.hover({ x: 50, z: -3 }); // 命中锁定的 bridge
  preview = controller.snapshot.preview;
  assert.equal(preview.ok, false, "a locked road previews as not erasable");
  assert.match(preview.reason, /桥面由桥梁模型绑定，不能单独编辑/, "the reason is spelled out");
  controller.hover({ x: 50, z: 40 });
  assert.equal(controller.snapshot.preview, null, "off the road there is no preview");
  controller.hover({ x: 50, z: 1 });
  controller.click({ pickedId: "b1", ground: { x: 50, z: 1 } }); // 射线先打到了楼：橡皮擦只看地面点
  assert.deepEqual(log.drops, ["e1"], "erasing ignores the building the ray hit first and uses the ground point");
  assert.equal(controller.snapshot.message.kind, "ok");
  deps.dropVerdict = { blockers: ["strands-buildings"], warnings: [] };
  deps.dropResult = { ok: false, reason: "blocked", blockers: ["strands-buildings"] };
  controller.click({ pickedId: null, ground: { x: 50, z: 1 } });
  assert.equal(controller.snapshot.message.kind, "error");
  assert.match(controller.snapshot.message.text, /擦掉后有楼离最近的路超过 40/);
  assert.equal(log.drops.length, 2, "the controller still asks the session (which re-validates) — nothing silently skipped");
  controller.click({ pickedId: null, ground: { x: 50, z: 40 } });
  assert.match(controller.snapshot.message.text, /没有道路可擦/);
  deps.dropResult = { ok: true, patch: {}, warnings: ["creates-dead-end"] }; deps.dropVerdict = { blockers: [], warnings: [] };
  controller.click({ pickedId: null, ground: { x: 50, z: 1 } });
  assert.equal(controller.snapshot.message.kind, "warn"); assert.match(controller.snapshot.message.text, /断头路/);
}

// (j) 画路。
{
  const { controller, log, deps } = harness();
  controller.enter(); controller.setTool("draw");
  controller.hover({ x: 10, z: 10 });
  assert.equal(controller.snapshot.preview.kind, "snap", "before the first click the preview is just the snap marker");
  controller.hover({ x: -5, z: 10 });
  assert.equal(controller.snapshot.preview.ok, false, "snapping onto a locked bridge is flagged");
  controller.click({ pickedId: null, ground: { x: -5, z: 10 } });
  assert.equal(controller.snapshot.drawStart, null, "a locked start point is refused");
  assert.match(controller.snapshot.message.text, /桥面由桥梁模型绑定，不能单独编辑/);
  controller.click({ pickedId: null, ground: { x: 10, z: 10 } });
  assert.deepEqual({ x: controller.snapshot.drawStart.x, z: controller.snapshot.drawStart.z }, { x: 10, z: 10 }, "the first click only drops the start point");
  assert.equal(log.adds.length, 0);
  controller.hover({ x: 60, z: 20 });
  let preview = controller.snapshot.preview;
  assert.equal(preview.kind, "draw"); assert.equal(preview.ok, true);
  assert.deepEqual(preview.from, { x: 10, z: 10 }); assert.deepEqual(preview.to, { x: 60, z: 20 }); assert.equal(preview.width, 5);
  deps.addVerdict = { blockers: ["crosses-road", "road-over-building"], warnings: [] };
  controller.hover({ x: 70, z: 20 });
  preview = controller.snapshot.preview;
  assert.equal(preview.ok, false);
  assert.match(preview.reason, /与现有道路交叉/); assert.match(preview.reason, /会穿过建筑/);
  deps.addResult = { ok: false, reason: "blocked", blockers: ["crosses-road"] };
  controller.click({ pickedId: null, ground: { x: 70, z: 20 } });
  assert.equal(controller.snapshot.message.kind, "error");
  assert.ok(controller.snapshot.drawStart, "a rejected stroke keeps the start so the user can adjust");
  deps.addVerdict = undefined; deps.addResult = undefined;
  controller.click({ pickedId: "b1", ground: { x: 80, z: 30 } }); // 射线先打到楼：画路只看地面点
  assert.deepEqual({ x: log.adds.at(-1)[0].x, z: log.adds.at(-1)[0].z }, { x: 10, z: 10 }, "the stroke starts at the placed start point");
  assert.deepEqual({ x: log.adds.at(-1)[1].x, z: log.adds.at(-1)[1].z }, { x: 80, z: 30 }, "…and ends at the ground point, not at the building the ray hit");
  assert.equal(log.adds.at(-1)[2], 5);
  assert.deepEqual({ x: controller.snapshot.drawStart.x, z: controller.snapshot.drawStart.z }, { x: 80, z: 30 }, "after a stroke the end point becomes the next start (chain drawing)");
  assert.equal(controller.snapshot.drawStart.kind, "node", "the placed end is a junction now");
  assert.equal(controller.snapshot.message.kind, "ok");
  controller.setRoadType("secondary");
  controller.hover({ x: 120, z: 30 });
  assert.equal(controller.snapshot.preview.width, 8, "the width selector drives the preview");
  controller.click({ pickedId: null, ground: { x: 120, z: 30 } });
  assert.equal(log.adds.at(-1)[2], 8, "…and the committed road");
  deps.addResult = { ok: true, patch: {}, warnings: ["creates-dead-end"] };
  controller.click({ pickedId: null, ground: { x: 160, z: 30 } });
  assert.equal(controller.snapshot.message.kind, "warn"); assert.match(controller.snapshot.message.text, /断头路/);
}

// (k) Esc 层级。
{
  const { controller } = harness();
  controller.enter(); controller.setTool("draw");
  controller.click({ pickedId: null, ground: { x: 10, z: 10 } });
  assert.ok(controller.snapshot.drawStart);
  controller.cancel();
  assert.equal(controller.snapshot.drawStart, null); assert.equal(controller.snapshot.tool, "draw", "first Esc only drops the pending start");
  controller.cancel();
  assert.equal(controller.snapshot.tool, "build", "second Esc returns to the select tool");
  assert.equal(controller.snapshot.active, true);
  controller.click({ pickedId: "b1", ground: null });
  controller.cancel();
  assert.equal(controller.snapshot.buildingId, null, "then Esc deselects");
  controller.cancel();
  assert.equal(controller.snapshot.active, false, "and finally leaves repair mode");
  controller.enter(); controller.setTool("erase");
  controller.cancel();
  assert.equal(controller.snapshot.tool, "build", "Esc leaves the eraser for the select tool");
}

// (l) 工具切换清空。
{
  const { controller, log } = harness();
  controller.enter();
  controller.click({ pickedId: "b1", ground: null });
  assert.equal(controller.snapshot.candidates.length, 2);
  controller.setTool("draw");
  assert.equal(controller.snapshot.buildingId, null, "switching away from select clears the selection"); assert.deepEqual(controller.snapshot.candidates, []);
  assert.equal(log.selected.at(-1), null, "…including the engine's selection ring");
  controller.click({ pickedId: null, ground: { x: 10, z: 10 } });
  controller.hover({ x: 40, z: 10 });
  assert.ok(controller.snapshot.drawStart && controller.snapshot.preview);
  controller.setTool("erase");
  assert.equal(controller.snapshot.drawStart, null); assert.equal(controller.snapshot.preview, null, "switching tools drops the pending start and the preview");
  controller.setTool("build");
  controller.hover({ x: 50, z: 1 });
  assert.equal(controller.snapshot.preview, null, "the select tool never shows road previews");
  controller.exit();
  controller.hover({ x: 50, z: 1 });
  assert.equal(controller.snapshot.preview, null);
}

// (m) 悬停抖动与离开。
{
  const { controller, log } = harness();
  let snapCalls = 0;
  const inner = harness({ snap: (x, z) => { snapCalls += 1; return { x, z, kind: "free", locked: false }; } });
  inner.controller.enter(); inner.controller.setTool("draw");
  inner.controller.hover({ x: 10, z: 10 });
  const base = snapCalls;
  inner.controller.hover({ x: 10.3, z: 10.2 });
  assert.equal(snapCalls, base, "sub-threshold jitter does not recompute the preview");
  inner.controller.hover({ x: 12, z: 10 });
  assert.equal(snapCalls, base + 1, "a real move does");
  inner.controller.hover(null);
  assert.equal(inner.controller.snapshot.preview, null, "leaving the canvas clears the preview");
  void controller; void log;
}

// (n) 设施工具。
{
  const { controller, log, deps } = harness();
  controller.enter(); controller.setTool("site");
  assert.equal(controller.snapshot.tool, "site"); assert.match(controller.snapshot.message.text, /公共设施/);
  controller.hover({ x: 100, z: 100 }, { hit: "civic:0" });
  assert.equal(controller.snapshot.preview.kind, "site"); assert.equal(controller.snapshot.preview.label, "学校", "hover highlights the instance under the ray and names it");
  controller.hover({ x: 300, z: 300 }, { hit: null });
  assert.equal(controller.snapshot.preview, null, "off any site there is no highlight");
  controller.click({ pickedId: "decor:civic:school", ground: { x: 100, z: 100 }, ray: { hit: "civic:0" } });
  assert.equal(controller.snapshot.site.id, "civic:0", "clicking selects the instance the ray hit, not the decor category");
  assert.match(controller.snapshot.message.text, /已选中学校，附近有 1 个可搬去的空街区/);
  assert.equal(controller.snapshot.siteTargets.length, 1);
  // 搬家：点地面 → 目标街区。
  controller.click({ pickedId: null, ground: { x: 200, z: 100 }, ray: { hit: null } });
  assert.deepEqual(log.siteMoves, [["civic:0", "B2"]]);
  assert.equal(controller.snapshot.message.kind, "ok"); assert.match(controller.snapshot.message.text, /已把学校搬过去/);
  assert.equal(controller.snapshot.site.id, "civic:0", "the civic stays selected after the move");
  // 被占 / unchanged。
  deps.siteMoveResult = { ok: false, reason: "blocked", blockers: ["target-occupied"] };
  controller.click({ pickedId: null, ground: { x: 200, z: 100 }, ray: { hit: null } });
  assert.equal(controller.snapshot.message.kind, "error"); assert.match(controller.snapshot.message.text, /目标已被占用/);
  assert.ok(!/target-occupied/.test(controller.snapshot.message.text), "no raw codes");
  deps.siteMoveResult = { ok: false, reason: "blocked", blockers: ["unchanged"] };
  controller.click({ pickedId: null, ground: { x: 200, z: 100 }, ray: { hit: null } });
  assert.match(controller.snapshot.message.text, /已经在这里了/);
  deps.siteMoveResult = undefined;
  controller.click({ pickedId: null, ground: { x: -5, z: 100 }, ray: { hit: null } });
  assert.match(controller.snapshot.message.text, /没有可落位的街区/);
  // 背景楼搬家后 id 变了（context:<parcelId>）：控制器按返回的新 id 重新选中。
  controller.click({ pickedId: null, ground: { x: 70, z: 200 }, ray: { hit: "context:pC" } });
  assert.equal(controller.snapshot.site.id, "context:pC"); assert.match(controller.snapshot.message.text, /空地块/);
  controller.click({ pickedId: null, ground: { x: 90, z: 200 }, ray: { hit: null } });
  assert.deepEqual(log.siteMoves.at(-1), ["context:pC", "pF1"]);
  assert.equal(controller.snapshot.site.id, "context:pF1", "the selection follows the renamed building");
  // 拆除。
  controller.removeSelected();
  assert.deepEqual(log.siteRemoves, ["context:pF1"]);
  assert.equal(controller.snapshot.site, null); assert.match(controller.snapshot.message.text, /已拆除背景楼（撤销可恢复）/);
  controller.removeSelected();
  assert.equal(log.siteRemoves.length, 1, "nothing selected → nothing removed");
}

// (n2) 设施工具：不可编辑对象与分工说明。
{
  const { controller } = harness();
  controller.enter(); controller.setTool("site");
  // 所有建筑都可以移动（用户 2026-10-11）：设施工具里点到会话楼，切到移动工具并选中它。
  controller.click({ pickedId: "b1", ground: { x: 10, z: 10 }, ray: { hit: null } });
  assert.equal(controller.snapshot.tool, "build", "clicking a session building in the facility tool hands over to the move tool");
  assert.equal(controller.snapshot.buildingId, "b1", "…with it selected");
  controller.setTool("site");
  controller.click({ pickedId: "decor:seaside", ground: { x: 10, z: 10 }, ray: { hit: null } });
  assert.match(controller.snapshot.message.text, /不是建筑/); assert.equal(controller.snapshot.site, null);
  controller.click({ pickedId: null, ground: { x: 10, z: 10 }, ray: { hit: null } });
  assert.match(controller.snapshot.message.text, /点选任意非会话建筑/, "an empty click with nothing selected repeats the hint");
  // 选中后点非设施的 decor（射线先打到装饰）——仍按地面点搬家，不被「不可编辑」提示吞掉。
  controller.click({ pickedId: null, ground: { x: 100, z: 100 }, ray: { hit: "civic:0" } });
  assert.equal(controller.snapshot.site.id, "civic:0");
  const moved = harness();
  moved.controller.enter(); moved.controller.setTool("site");
  moved.controller.click({ pickedId: null, ground: { x: 100, z: 100 }, ray: { hit: "civic:0" } });
  moved.controller.click({ pickedId: "decor:garden", ground: { x: 200, z: 100 }, ray: { hit: null } });
  assert.deepEqual(moved.log.siteMoves, [["civic:0", "B2"]], "with a site selected, a ground click moves it even if the ray first grazed a decoration");
}

// (n3) Esc 与工具切换。
{
  const { controller } = harness();
  controller.enter(); controller.setTool("site");
  controller.click({ pickedId: null, ground: { x: 100, z: 100 }, ray: { hit: "civic:0" } });
  controller.cancel();
  assert.equal(controller.snapshot.site, null); assert.equal(controller.snapshot.tool, "site", "first Esc only deselects");
  controller.cancel();
  assert.equal(controller.snapshot.tool, "build", "second Esc returns to the select tool");
  controller.setTool("site");
  controller.click({ pickedId: null, ground: { x: 100, z: 100 }, ray: { hit: "civic:0" } });
  controller.setTool("draw");
  assert.equal(controller.snapshot.site, null); assert.deepEqual(controller.snapshot.siteTargets, [], "switching tools clears the site selection and targets");
  // 点天空取消选中。
  controller.setTool("site");
  controller.click({ pickedId: null, ground: { x: 100, z: 100 }, ray: { hit: "civic:0" } });
  controller.click({ pickedId: null, ground: null, ray: { hit: null } });
  assert.equal(controller.snapshot.site, null, "clicking the sky deselects");
  // refresh：设施没了 → 取消选中；还在 → 重算目标。
  controller.click({ pickedId: null, ground: { x: 100, z: 100 }, ray: { hit: "civic:0" } });
  controller.refresh({ kind: "ok", text: "已撤销" });
  assert.equal(controller.snapshot.site.id, "civic:0"); assert.equal(controller.snapshot.message.text, "已撤销");
}

// (o) 所有建筑都可以移动：移动工具点到非会话建筑 → 交给设施工具选中；锁定的说明理由。
{
  const { controller, log, deps } = harness();
  controller.enter();
  assert.equal(controller.snapshot.tool, "build");
  controller.click({ pickedId: "decor:civic:school", ground: { x: 100, z: 100 }, ray: { hit: "civic:0" } });
  assert.equal(controller.snapshot.tool, "site", "the move tool hands a facility over to the facility tool");
  assert.equal(controller.snapshot.site.id, "civic:0", "…with it selected, ready to be moved");
  controller.click({ pickedId: null, ground: { x: 200, z: 100 }, ray: { hit: null } });
  assert.deepEqual(log.siteMoves.at(-1), ["civic:0", "B2"], "…and the next ground click moves it");
  // 锁定对象：说明理由，不选中。
  deps.sites["landmark:suspension-bridge"] = { id: "landmark:suspension-bridge", kind: "landmark", landmarkKind: "suspension-bridge", x: 0, z: 0, yaw: 0, width: 30, depth: 30, height: 40, y: 0, level: "free", slotId: "", locked: "悬索桥不是建筑，是路网里的一段桥面" };
  controller.setTool("build");
  controller.click({ pickedId: "decor:landmark:suspension-bridge", ground: { x: 0, z: 0 }, ray: { hit: "landmark:suspension-bridge" } });
  assert.equal(controller.snapshot.tool, "build", "a locked object does not switch tools");
  assert.match(controller.snapshot.message.text, /悬索桥：悬索桥不是建筑/, "the lock reason is shown with the object's name");
  controller.setTool("site");
  controller.click({ pickedId: null, ground: { x: 0, z: 0 }, ray: { hit: "landmark:suspension-bridge" } });
  assert.equal(controller.snapshot.site, null); assert.match(controller.snapshot.message.text, /悬索桥/);
  // free 级（地标/市政用地）：选中后提示「点任意空地」。
  deps.sites["landmark:ferris-wheel"] = { id: "landmark:ferris-wheel", kind: "landmark", landmarkKind: "ferris-wheel", x: 60, z: -80, yaw: 0, width: 36, depth: 36, height: 45, y: 0, level: "free", slotId: "" };
  controller.click({ pickedId: null, ground: { x: 60, z: -80 }, ray: { hit: "landmark:ferris-wheel" } });
  assert.equal(controller.snapshot.site.id, "landmark:ferris-wheel");
  assert.match(controller.snapshot.message.text, /已选中摩天轮：点地面任意空地搬过去/);
}

// (p) 提示码翻译：带数量的影响（推平/安置/自动路口）与放权后的提示。
{
  const { controller, deps } = harness();
  controller.enter(); controller.setTool("draw");
  deps.addVerdict = { blockers: [], warnings: ["auto-junction:2", "bulldoze:1", "relocate:3"] };
  controller.click({ pickedId: null, ground: { x: 10, z: 10 } });
  controller.hover({ x: 60, z: 20 });
  const preview = controller.snapshot.preview;
  assert.equal(preview.ok, true, "impacts do not block");
  assert.match(preview.warning, /将在交叉处自动生成 2 个路口/); assert.match(preview.warning, /将推平 1 座设施/); assert.match(preview.warning, /将由开发商就近安置 3 栋会话楼/);
  deps.addResult = { ok: true, patch: {}, warnings: ["bulldozed:1", "relocated:3"] };
  controller.click({ pickedId: null, ground: { x: 60, z: 20 } });
  assert.match(controller.snapshot.message.text, /推平了 1 座设施/); assert.match(controller.snapshot.message.text, /开发商安置了 3 栋会话楼/);
}

// (q) 拾取体积挡住空地（浏览器实测：选中电视塔后点旁边空地，射线擦到塔的高盒子又选回塔自己）。
{
  const { controller, log, deps } = harness();
  controller.enter();
  deps.sites["landmark:tv-tower"] = { id: "landmark:tv-tower", kind: "landmark", landmarkKind: "tv-tower", x: 0, z: 300, yaw: 0, width: 20, depth: 20, height: 120, y: 0, level: "free", slotId: "" };
  // 移动工具：网格拾取没命中细塔（pickedId 为空），退回设施拾取盒 → 交给设施工具选中。
  controller.click({ pickedId: null, ground: { x: 2, z: 302 }, ray: { hit: "landmark:tv-tower" } });
  assert.equal(controller.snapshot.tool, "site", "a thin tower missed by mesh picking is still found by its pick box");
  assert.equal(controller.snapshot.site.id, "landmark:tv-tower");
  // 点塔占地以外的空地，但射线擦到塔自己的盒子：是搬家，不是重选。
  controller.click({ pickedId: null, ground: { x: 0, z: 250 }, ray: { hit: "landmark:tv-tower" } });
  assert.equal(log.siteMoves.at(-1)?.[0], "landmark:tv-tower", "ground outside the selected site's own footprint moves it");
  assert.equal(log.siteMoves.length, 1, "…exactly once");
  // 盒子擦到另一座设施、地面在其占地外 → 也是搬家；地面在其占地内 → 改选。
  controller.click({ pickedId: null, ground: { x: 100, z: 100 }, ray: { hit: "civic:0" } });
  assert.equal(controller.snapshot.site.id, "civic:0", "ground inside another site's footprint selects it");
  // 网格真命中建筑（pickedId 非空）时，即便地面点在占地外也按点建筑处理。
  controller.click({ pickedId: "decor:context", ground: { x: 70, z: 230 }, ray: { hit: "context:pC" } });
  assert.equal(controller.snapshot.site.id, "context:pC", "a real mesh hit selects even when the ground point falls outside the footprint");
}

// (r) 路口工具（SPEC §16.1）：点路口拿起 → 悬停预览关联路段跟着走 → 再点放下；锁定路口说明理由；Esc 放回。
{
  const { controller, log, deps } = harness();
  controller.enter(); controller.setTool("node");
  controller.hover({ x: 3, z: 2 });
  assert.equal(controller.snapshot.preview.kind, "node-hover", "hovering near a junction highlights it");
  assert.deepEqual(controller.snapshot.preview.at, { x: 0, z: 0 });
  controller.click({ pickedId: null, ground: { x: 40, z: 40 } });
  assert.match(controller.snapshot.message.text, /这里没有路口/, "a click away from junctions explains where to click");
  controller.click({ pickedId: null, ground: { x: -98, z: 0 } });
  assert.match(controller.snapshot.message.text, /桥面/, "a junction on a bridge cannot be picked up, with the reason");
  assert.equal(controller.snapshot.dragNode, null);
  controller.click({ pickedId: null, ground: { x: 2, z: 1 } });
  assert.equal(controller.snapshot.dragNode.id, "n0", "clicking a junction picks it up");
  controller.hover({ x: 10, z: 30 });
  const preview = controller.snapshot.preview;
  assert.equal(preview.kind, "node"); assert.equal(preview.ok, true);
  assert.deepEqual(preview.edges[0].points[0], { x: 10, z: 30 }, "the incident edge follows the cursor at the junction's end");
  assert.deepEqual(preview.edges[0].points[1], { x: 50, z: 0 }, "…while its far end stays put");
  deps.moveVerdict = { blockers: ["road-in-water"], warnings: [] };
  controller.hover({ x: 20, z: 40 });
  assert.equal(controller.snapshot.preview.ok, false); assert.match(controller.snapshot.preview.reason, /水面/);
  deps.moveVerdict = undefined;
  controller.cancel();
  assert.equal(controller.snapshot.dragNode, null, "Esc puts the junction back");
  assert.equal(controller.snapshot.tool, "node", "…without leaving the tool");
  controller.click({ pickedId: null, ground: { x: 99, z: 0 } });
  deps.moveNodeResult = { ok: true, patch: {}, warnings: ["relocated:1"] };
  controller.click({ pickedId: null, ground: { x: 110, z: 25 } });
  assert.deepEqual(log.nodeMoves.at(-1), ["n1", 110, 25], "the second click drops it where the cursor is");
  assert.equal(controller.snapshot.dragNode, null);
  assert.match(controller.snapshot.message.text, /已移动路口（开发商安置了 1 栋会话楼）/);
  deps.moveNodeResult = { ok: false, reason: "blocked", blockers: ["node-collision"] };
  controller.click({ pickedId: null, ground: { x: 1, z: 0 } });
  controller.click({ pickedId: null, ground: { x: 100, z: 0 } });
  assert.match(controller.snapshot.message.text, /不能放在这里：目标处已有路口/);
  assert.equal(controller.snapshot.dragNode.id, "n0", "a rejected drop keeps the junction in hand");
}

// (s) 落位试算（SPEC §16.4）：选中后悬停给绿/红占地；会话楼与设施都有，free 级是圆形。
{
  const { controller, deps } = harness();
  controller.enter();
  controller.hover({ x: 20, z: 0 });
  assert.equal(controller.snapshot.preview, null, "nothing selected → no ghost");
  controller.click({ pickedId: "b1", ground: null });
  controller.hover({ x: 20, z: 0 });
  assert.equal(controller.snapshot.preview.kind, "ghost"); assert.equal(controller.snapshot.preview.ok, true);
  controller.hover({ x: -20, z: 0 });
  assert.equal(controller.snapshot.preview.ok, false); assert.match(controller.snapshot.preview.reason, /已被其他会话楼/);
  deps.sites["landmark:ferris-wheel"] = { id: "landmark:ferris-wheel", kind: "landmark", landmarkKind: "ferris-wheel", x: 60, z: -80, yaw: 0, width: 36, depth: 36, height: 45, y: 0, level: "free", slotId: "" };
  controller.setTool("site");
  controller.click({ pickedId: null, ground: { x: 60, z: -80 }, ray: { hit: "landmark:ferris-wheel" } });
  controller.hover({ x: 200, z: 0 }, { hit: null });
  assert.equal(controller.snapshot.preview.kind, "ghost"); assert.equal(controller.snapshot.preview.rect.round, true, "free-level sites ghost as a circle");
  controller.hover({ x: -200, z: 0 }, { hit: null });
  assert.match(controller.snapshot.preview.reason, /不可建设/);
  // 指着另一座设施（地面在它占地内）：高亮它（点击会改选），不画试算。
  controller.hover({ x: 100, z: 100 }, { hit: "civic:0" });
  assert.equal(controller.snapshot.preview.kind, "site"); assert.equal(controller.snapshot.preview.label, "学校");
}

// (t) 地标搬家后的接入路与原址断头路（SPEC §16.3）：消息说明，面板一键擦掉，擦完/下一次点击后不再提供。
{
  const { controller, log, deps } = harness();
  controller.enter();
  deps.sites["landmark:tv-tower"] = { id: "landmark:tv-tower", kind: "landmark", landmarkKind: "tv-tower", x: 0, z: 300, yaw: 0, width: 20, depth: 20, height: 120, y: 0, level: "free", slotId: "" };
  controller.setTool("site");
  controller.click({ pickedId: null, ground: { x: 0, z: 300 }, ray: { hit: "landmark:tv-tower" } });
  deps.siteMoveResult = { ok: true, patch: {}, warnings: ["access-road:42"], siteId: "landmark:tv-tower", strandedEdges: ["e7", "e8"] };
  controller.click({ pickedId: null, ground: { x: 0, z: 200 }, ray: { hit: null } });
  assert.match(controller.snapshot.message.text, /补了一条 42 长的接入路/);
  assert.match(controller.snapshot.message.text, /原址留下 2 段断头接入路/);
  assert.deepEqual(controller.snapshot.stranded, ["e7", "e8"]);
  controller.eraseStranded();
  assert.deepEqual(log.drops.slice(-2), ["e7", "e8"], "one click erases the whole leftover chain");
  assert.deepEqual(controller.snapshot.stranded, []);
  deps.siteMoveResult = { ok: true, patch: {}, warnings: ["no-access-road"], siteId: "landmark:tv-tower", strandedEdges: ["e9"] };
  controller.click({ pickedId: null, ground: { x: 0, z: 150 }, ray: { hit: null } });
  assert.equal(controller.snapshot.message.kind, "warn", "no access road is a warning");
  assert.match(controller.snapshot.message.text, /用画路工具接一条/);
  controller.click({ pickedId: null, ground: { x: 0, z: 120 }, ray: { hit: null } });
  assert.deepEqual(controller.snapshot.stranded, ["e9"], "a further move offers the latest leftover (fresh result)");
  controller.setTool("draw");
  assert.deepEqual(controller.snapshot.stranded, [], "switching tools withdraws the offer");
}

// (u) 推土机试算结果原样进预览（叠加层据此画推平/安置标记），数字是确切的。
{
  const { controller, deps } = harness();
  controller.enter(); controller.setTool("draw");
  const impact = { bulldozed: [{ x: 1, z: 1, yaw: 0, width: 4, depth: 4 }], relocated: [], homeless: [{ x: 5, z: 5, yaw: 0, width: 4, depth: 4 }] };
  deps.addVerdict = { blockers: [], warnings: ["bulldoze:1", "homeless-risk:1"], impact };
  controller.click({ pickedId: null, ground: { x: 10, z: 10 } });
  controller.hover({ x: 60, z: 20 });
  assert.equal(controller.snapshot.preview.impact, impact);
  assert.match(controller.snapshot.preview.warning, /将推平 1 座设施/);
  assert.match(controller.snapshot.preview.warning, /1 栋会话楼附近没有空地块，会留在路上/);
}

// (v) 路型（SPEC §17）：主干道/滨海大道传宽度与 purpose；高架逐点画、回车或再点最后一点完成、Esc 撤点、接已有高架端点；
//     橡皮擦在桥面范围内切高架；拐角倒圆的预览按实际折线画。
{
  const { controller, log, deps } = harness();
  controller.enter(); controller.setTool("draw");
  controller.setRoadType("waterfront");
  controller.click({ pickedId: null, ground: { x: 10, z: 10 } });
  controller.click({ pickedId: null, ground: { x: 60, z: 10 } });
  assert.deepEqual(log.adds.at(-1).slice(2), [12, "waterfront"], "a waterfront boulevard is a 12-wide road tagged waterfront");
  deps.addVerdict = { blockers: [], warnings: [], path: [{ x: 55, z: 10 }, { x: 60, z: 12 }, { x: 62, z: 17 }, { x: 62, z: 60 }] };
  controller.hover({ x: 62, z: 60 });
  assert.equal(controller.snapshot.preview.path.length, 4, "the preview follows the filleted path, not the straight chord");
  assert.equal(controller.snapshot.preview.waterfront, true);
  deps.addVerdict = undefined;
  controller.setRoadType("main");
  assert.ok(controller.snapshot.drawStart, "switching between ground road types keeps the start (only the width changes)");
  controller.click({ pickedId: null, ground: { x: 60, z: 80 } });
  assert.deepEqual(log.adds.at(-1).slice(2), [12, undefined], "a main road is 12 wide with no purpose");

  controller.setRoadType("viaduct");
  assert.equal(controller.snapshot.drawStart, null, "entering viaduct mode drops the ground-road start");
  assert.match(controller.snapshot.message.text, /逐点点击/);
  controller.click({ pickedId: null, ground: { x: 0, z: 0 } });
  controller.click({ pickedId: null, ground: { x: 100, z: 0 } });
  controller.click({ pickedId: null, ground: { x: 200, z: 50 } });
  assert.equal(controller.snapshot.viaduct.length, 3);
  controller.cancel();
  assert.equal(controller.snapshot.viaduct.length, 2, "Esc takes back the last point");
  controller.hover({ x: 250, z: 60 });
  assert.equal(controller.snapshot.preview.kind, "viaduct"); assert.equal(controller.snapshot.preview.points.length, 3, "the preview is the placed points plus the cursor");
  deps.viaductVerdict = { blockers: ["viaduct-end-in-water"], warnings: [] };
  controller.hover({ x: 260, z: 70 });
  assert.equal(controller.snapshot.preview.ok, false); assert.match(controller.snapshot.preview.reason, /匝道落地点在水里/);
  deps.viaductVerdict = undefined;
  controller.click({ pickedId: null, ground: { x: 250, z: 60 } });
  controller.click({ pickedId: null, ground: { x: 251, z: 60.5 } }); // 在最后一点上再点一下 = 完成
  assert.equal(log.viaducts.length, 1, "clicking the last point again finishes the viaduct");
  assert.deepEqual(log.viaducts[0].map((q) => q.x), [0, 100, 250]);
  assert.deepEqual(controller.snapshot.viaduct, [], "…and starts a fresh one");
  controller.click({ pickedId: null, ground: { x: 495, z: 305 } });
  assert.deepEqual(controller.snapshot.viaduct[0], { x: 500, z: 300 }, "a point near an existing viaduct's open end snaps onto it (to extend it)");
  controller.click({ pickedId: null, ground: { x: 700, z: 300 } });
  controller.finishViaduct();
  assert.equal(log.viaducts.length, 2, "Enter (finishViaduct) commits too");
  controller.click({ pickedId: null, ground: { x: 800, z: 0 } });
  controller.finishViaduct();
  assert.match(controller.snapshot.message.text, /至少要两个点/, "a single point cannot be committed");
  assert.equal(log.viaducts.length, 2);
  controller.setRoadType("local");
  assert.deepEqual(controller.snapshot.viaduct, [], "leaving viaduct mode drops the pending points");

  controller.setTool("erase");
  controller.hover({ x: 300, z: 302 });
  assert.equal(controller.snapshot.preview.width, 10.5, "over a viaduct deck the eraser targets the viaduct");
  assert.match(controller.snapshot.preview.warning, /断成两条/);
  controller.click({ pickedId: null, ground: { x: 300, z: 302 } });
  assert.deepEqual(log.cuts.at(-1), [300, 302]);
  assert.match(controller.snapshot.message.text, /切掉一截高架/);
}

console.log("City plan repair controller: road types (main / waterfront / viaduct drawn point by point, joined, cut by the eraser) and filleted previews, junction tool picks up/previews/drops with reasons, placement ghosts for buildings and sites, leftover access roads offered and withdrawn, exact impact previews, every building is movable (tools hand over to each other, locked objects explain why, pick boxes never swallow a ground move), impacts are announced not blocked, clicks ignored until entered, eraser previews/erases with spelled-out reasons, road drawing snaps/previews/chains and keeps the start on rejection, Esc peels back one layer at a time, tool switches clear transient state, hover jitter is ignored, session-building selection + candidates, move-on-ground with selection restore, blockers spelled out without raw codes, own-parcel/no-parcel/sky handled, Esc deselects then exits, refresh recomputes or drops a vanished building, subscriptions honoured.");
