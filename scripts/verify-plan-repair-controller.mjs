#!/usr/bin/env node
// 规划修复交互状态机守卫（docs/CITY_PLAN_MANUAL_REPAIR_SPEC.md §7.1）：纯逻辑，依赖全部注入。
//   (a) 未进入模式时点击一律忽略；进入后提示先选楼；
//   (b) 点会话楼 → 选中 + 候选；无候选给 warn；点非会话物体 → warn 且不改选中；
//   (c) 选中后点地面 → 找最近地块 → 搬楼；成功后重新选中（恢复选中环）并刷新候选，带 warnings 时 kind=warn；
//   (d) 硬阻止逐条翻译成人话，不静默失败，选中不丢；
//   (e) 点自己所在地块不产生补丁；点不到地块 / 点天空；
//   (f) Esc：先取消选中再退出模式；退出清选中环；
//   (g) refresh：楼消失 → 取消选中；楼还在 → 重算候选；
//   (h) subscribe 每次状态变化都通知，退订后不再通知。
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";

const { RepairController, blockerText } = await loadCity({ "planRepair/controller.ts": ["RepairController", "blockerText"] });

function harness(overrides = {}) {
  const log = { moves: [], selected: [], candidateCalls: [] };
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
    candidateList: undefined, moveResult: undefined, ...overrides,
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

console.log("City plan repair controller: clicks ignored until entered, session-building selection + candidates, move-on-ground with selection restore, blockers spelled out without raw codes, own-parcel/no-parcel/sky handled, Esc deselects then exits, refresh recomputes or drops a vanished building, subscriptions honoured.");
