#!/usr/bin/env node
// Squad IM envelope parse/filter/claim tint reducer. No WebGL.
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";

const {
  parseSquadEnvelope, applySquadEnvelope, emptyFeed, visibleFeed, DEFAULT_KIND_FILTER,
  envelopeAssetRef, envelopeSummary, claimsFromRows, expireClaims, SQUAD_EVENT, isWriteKind,
} = await loadCity({
  "engine/squadEvents.ts": [
    "parseSquadEnvelope", "applySquadEnvelope", "emptyFeed", "visibleFeed", "DEFAULT_KIND_FILTER",
    "envelopeAssetRef", "envelopeSummary", "claimsFromRows", "expireClaims", "SQUAD_EVENT", "isWriteKind",
  ],
});

const SESSION = `sr_${"c".repeat(32)}`;
const ASSET = `ca_${"a".repeat(32)}`;

assert.equal(SQUAD_EVENT, "__AV_PLUGIN_SQUAD_EVENT__");
assert.equal(DEFAULT_KIND_FILTER.chat, false);
assert.equal(DEFAULT_KIND_FILTER.observe, false);
assert.equal(DEFAULT_KIND_FILTER.set, true);
assert.equal(DEFAULT_KIND_FILTER.reset, true);
assert.equal(DEFAULT_KIND_FILTER.preview, true);

const claim = parseSquadEnvelope({
  v: 1, id: "evt_claim1", ts: 1_761_180_000, session_id: SESSION,
  agent_id: "nano", agent_name: "Nano", kind: "claim",
  payload: { asset_ref: ASSET, ttl_sec: 90, expires_at: 1_761_180_090 },
});
assert.ok(claim);
assert.equal(claim.kind, "claim");
assert.equal(envelopeAssetRef(claim), ASSET);
assert.equal(parseSquadEnvelope({ ...claim, v: 2 }), null);
assert.equal(parseSquadEnvelope({ type: "CityEntityChanged", kind: "set" }), null);

let feed = applySquadEnvelope(emptyFeed(), claim, 1_761_180_000);
assert.equal(feed.claims[ASSET].agentId, "nano");
const chat = parseSquadEnvelope({
  v: 1, id: "evt_chat1", ts: 1_761_180_001, session_id: SESSION,
  agent_id: "nano", agent_name: "Nano", kind: "chat", payload: { text: "heads up" },
});
feed = applySquadEnvelope(feed, chat, 1_761_180_001);
assert.equal(visibleFeed(feed.items, DEFAULT_KIND_FILTER).length, 1, "chat off by default");
assert.equal(visibleFeed(feed.items, { ...DEFAULT_KIND_FILTER, chat: true }).length, 2);

const stolen = parseSquadEnvelope({
  v: 1, id: "evt_claim2", ts: 1_761_180_010, session_id: SESSION,
  agent_id: "byte", agent_name: "Byte", kind: "claim",
  payload: { asset_ref: ASSET, ttl_sec: 90, expires_at: 1_761_180_100 },
});
feed = applySquadEnvelope(feed, stolen, 1_761_180_010);
assert.equal(feed.claims[ASSET].agentId, "byte");

const set = parseSquadEnvelope({
  v: 1, id: "evt_set1", ts: 1_761_180_020, session_id: SESSION,
  agent_id: "city-mcp", agent_name: "City MCP", kind: "set",
  payload: { asset_ref: ASSET, ok: true, revision: 1, build_event_id: `be_${"b".repeat(32)}` },
});
feed = applySquadEnvelope(feed, set, 1_761_180_020);
assert.equal(feed.claims[ASSET], undefined, "set_won / set envelope clears tint");
assert.equal(isWriteKind("set"), true);
assert.equal(isWriteKind("chat"), false);
assert.match(envelopeSummary(set), /set ok/);

const rows = claimsFromRows([{
  session_id: SESSION, asset_ref: ASSET, agent_id: "nano", agent_name: "Nano", expires_at: 9_999_999_999,
}], 1);
assert.equal(rows[ASSET].agentId, "nano");
assert.deepEqual(expireClaims(rows, 9_999_999_999), {});

console.log("verify-city-squad-im: ok");
