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
//   (m) 悬停抖动（< 0.75）不重算，鼠标离开清预览。
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";

const { RepairController, blockerText } = await loadCity({ "planRepair/controller.ts": ["RepairController", "blockerText"] });

function harness(overrides = {}) {
  const log = { moves: [], selected: [], candidateCalls: [], adds: [], drops: [] };
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
    addRoad: (from, to, width) => { log.adds.push([from, to, width]); return deps.addResult ?? { ok: true, patch: {}, warnings: [] }; },
    validateDrop: (id) => (id === "bridge" ? { blockers: ["locked-edge"], warnings: [] } : (deps.dropVerdict ?? { blockers: [], warnings: [] })),
    dropEdge: (id) => { log.drops.push(id); return deps.dropResult ?? { ok: true, patch: {}, warnings: [] }; },
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
  assert.match(controller.snapshot.message.text, /点选一栋会话楼/, "a ground click with nothing selected asks for a building first");
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
  assert.match(controller.snapshot.message.text, /只有会话楼/);
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
  assert.match(controller.snapshot.message.text, /reset\(\)/, "non-blocker failures still show their reason");
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
  assert.match(preview.reason, /桥、桥头引道和滨海路不可编辑/, "the reason is spelled out");
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
  assert.match(controller.snapshot.message.text, /桥、桥头引道和滨海路不可编辑/);
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
  controller.setRoadWidth(8);
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

console.log("City plan repair controller: clicks ignored until entered, eraser previews/erases with spelled-out reasons, road drawing snaps/previews/chains and keeps the start on rejection, Esc peels back one layer at a time, tool switches clear transient state, hover jitter is ignored, session-building selection + candidates, move-on-ground with selection restore, blockers spelled out without raw codes, own-parcel/no-parcel/sky handled, Esc deselects then exits, refresh recomputes or drops a vanished building, subscriptions honoured.");
