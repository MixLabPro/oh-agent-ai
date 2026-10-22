#!/usr/bin/env node
// Host → City entity envelope + building construction apply path.
// No WebGL: pure parse/dispatch/reducer + part-reveal math.
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";

const {
  parseEntityChanged, dispatchEntityChanged, ENTITY_CHANGED_EVENT, ENTITY_CHANGED_TYPE,
} = await loadCity({
  "engine/entityEvents.ts": ["parseEntityChanged", "dispatchEntityChanged", "ENTITY_CHANGED_EVENT", "ENTITY_CHANGED_TYPE"],
});
const {
  parseBuildingChanged, applyBuildingEvent, entityChangedFromBuilding,
  partReveal, visiblePartCount, constructionOrder,
} = await loadCity({
  "engine/sessionKitConstruction.ts": [
    "parseBuildingChanged", "applyBuildingEvent", "entityChangedFromBuilding",
    "partReveal", "visiblePartCount", "constructionOrder",
  ],
});

const ASSET = `ca_${"a".repeat(32)}`;
const EVENT = `be_${"b".repeat(32)}`;
const SESSION = `sr_${"c".repeat(32)}`;
const model = {
  kit_version: "session-kit/v1",
  parts: [
    { id: "cap", kind: "cone", role: "roof", at: [0, 2, 0], size: [2, 1.5, 2] },
    { id: "base", kind: "box", role: "structure", at: [0, 0, 0], size: [3, 2, 3] },
  ],
};

const envelope = {
  type: ENTITY_CHANGED_TYPE,
  schema_version: 1,
  entity_kind: "building",
  entity_id: ASSET,
  action: "set",
  revision: 1,
  event_id: EVENT,
  session_id: SESSION,
  source: "override",
  model,
  asset_ref: ASSET,
  build_event_id: EVENT,
  kind: "set",
};

assert.equal(ENTITY_CHANGED_EVENT, "__AV_PLUGIN_ENTITY_CHANGED__");
assert.equal(ENTITY_CHANGED_TYPE, "CityEntityChanged");

const parsed = parseEntityChanged(envelope);
assert.ok(parsed);
assert.equal(parsed.entity_kind, "building");
assert.equal(parsed.entity_id, ASSET);
assert.equal(parsed.action, "set");
assert.equal(parsed.event_id, EVENT);
assert.equal(parsed.revision, 1);

assert.equal(parseEntityChanged({ ...envelope, type: "CityBuildingChanged" }), null, "building-only type must not parse");
assert.equal(parseEntityChanged({ ...envelope, entity_kind: "" }), null, "kind is required");
assert.ok(parseEntityChanged({
  type: ENTITY_CHANGED_TYPE, entity_kind: "road", entity_id: "rd_1",
  action: "set", revision: 1, event_id: "ev_1",
}), "road envelope must parse so the channel stays reusable");

const kinds = [];
assert.equal(dispatchEntityChanged(parsed, { building: () => kinds.push("building") }), true);
assert.deepEqual(kinds, ["building"]);
const vehicle = parseEntityChanged({ type: ENTITY_CHANGED_TYPE, entity_kind: "vehicle", entity_id: "vh_1", action: "set", revision: 1, event_id: "ev_2" });
assert.ok(vehicle);
assert.equal(dispatchEntityChanged(vehicle, { building: () => kinds.push("building") }), false, "unknown kinds are ignored");
assert.deepEqual(kinds, ["building"]);

const building = parseBuildingChanged(envelope);
assert.ok(building);
assert.equal(building.entity_kind, "building");
assert.equal(building.asset_ref, ASSET);
const ordered = constructionOrder(building.model.parts);
assert.deepEqual(ordered.map((part) => part.id), ["base", "cap"]);

const applied = applyBuildingEvent(null, building, SESSION, true);
assert.ok(applied);
assert.equal(applied.animate, true);
assert.equal(applied.kind, "set");
assert.equal(applied.parts.length, 2);
assert.equal(applied.buildEventId, EVENT);
assert.equal(applyBuildingEvent(applied, building, SESSION, true), applied, "same event_id is a no-op");

const older = parseBuildingChanged({ ...envelope, revision: 0, event_id: "be_old", build_event_id: "be_old" });
assert.equal(applyBuildingEvent(applied, older, SESSION, true), applied, "older revision ignored");

const reset = parseBuildingChanged({
  type: ENTITY_CHANGED_TYPE, entity_kind: "building", entity_id: ASSET,
  action: "reset", revision: 2, event_id: "be_reset", kind: "reset", source: "default",
});
const cleared = applyBuildingEvent(applied, reset, SESSION, true);
assert.equal(cleared.kind, "reset");
assert.equal(cleared.parts.length, 0);
assert.equal(cleared.animate, true);

assert.equal(parseBuildingChanged({
  type: ENTITY_CHANGED_TYPE, entity_kind: "road", entity_id: ASSET,
  action: "set", revision: 1, event_id: EVENT, model,
}), null, "road must not enter the building handler");

const fromRow = entityChangedFromBuilding({
  asset_ref: ASSET, revision: 1, kind: "set", build_event_id: EVENT, model,
});
assert.equal(fromRow.type, ENTITY_CHANGED_TYPE);
assert.equal(fromRow.entity_kind, "building");
assert.equal(fromRow.event_id, EVENT);

assert.equal(visiblePartCount(0, 3), 0);
assert.equal(visiblePartCount(0.1, 3), 1);
assert.equal(visiblePartCount(0.5, 3), 2);
assert.equal(visiblePartCount(1, 3), 3);
assert.equal(partReveal(0.2, 0, 4), 0.8);
assert.equal(partReveal(0.2, 1, 4), 0);
assert.equal(partReveal(0.5, 1, 4), 1);
assert.equal(partReveal(0.5, 2, 4), 0);

const aliasOnly = parseEntityChanged({
  entity_kind: "building", asset_ref: ASSET, kind: "set", revision: 4,
  build_event_id: EVENT, type: ENTITY_CHANGED_TYPE, model,
});
assert.equal(aliasOnly.entity_id, ASSET);
assert.equal(aliasOnly.action, "set");
assert.equal(aliasOnly.event_id, EVENT);

console.log("verify-city-entity-bridge: ok");
