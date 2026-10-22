# Agent City building MCP (MVP)

External agents can read, preview, replace, and reset **one session building's 3D model** through Data MCP. Persistence is a City-owned SQLite override keyed by stable `asset_ref`. After a successful set/reset the write path **persists → pushes a shared host event → City plays construction**.

## Tools

Server: `agent-vitals data-mcp serve --allow-local-writes` (get/preview work without the flag; set/reset need it).

`session_id` is either:

- `sessions_search.session_ref` (`sr_` + 32 hex), or
- the building `asset_ref` (`ca_` + 32 hex) returned by `get_building`.

| Tool | Writes? | Contract |
|---|---|---|
| `get_building` | no | Current model (override or default), `revision`, `kit_version`, parts, geometric `summary`, `observe.text` |
| `preview_building` | no | Validate only. Same structured errors as set. |
| `set_building_model` | yes | Optimistic concurrency on `expected_revision`. Success → new `revision` + `build_event_id` |
| `reset_building` | yes | Clear override, restore default, bump `revision`, queue a build event |

ReACT loop: **get → preview → set → get**. Confirm the set by matching `revision` and `build_event_id`. Observation is structured JSON (`data.observe`); screenshots are optional and **not** in this MVP.

## Model (`session-kit/v1`)

```json
{
  "kit_version": "session-kit/v1",
  "params": { "form": "tower" },
  "parts": [
    { "id": "base", "kind": "box", "role": "structure", "at": [0, 0, 0], "size": [3, 2, 3] },
    { "id": "cap", "kind": "cone", "role": "roof", "at": [0, 2, 0], "size": [2, 1.5, 2] }
  ]
}
```

- `parts` length 1–64.
- `kind`: `box` | `cylinder` | `cone`. `role`: `wall` | `trim` | `roof` | `glass` | `structure`.
- `at` is the base centre (y = bottom). `size` is `[x, y, z]` extents. Optional `rot`, `color` (`#rrggbb`).
- `params.form`: `tower` | `slab` | `block` | `midrise`. Optional `params.palette`.
- No scripts, no extra fields. Unknown `kit_version` is a validation error. Stored overrides keep their `kit_version` so old rows are not silently migrated.

Cheap geometry checks: finite numbers, parts ≤64, lot envelope (±4 x, ±6 z, height 0–48 world units), AABB overlap.

## Errors

Preview and set share one shape inside `data` (check `data.ok`; this is not a JSON-RPC error):

```json
{
  "ok": false,
  "error": {
    "kind": "validation",
    "rule": "overlap",
    "parts": ["a", "b"],
    "message": "parts `a` and `b` overlap",
    "suggested_fix": "move or shrink one of the two parts so their boxes no longer intersect"
  }
}
```

`kind` is `validation` or `conflict` (`revision_conflict` — retry with `get_building.revision`). Unknown `session_id` is MCP `not_found`. Mutations without `--allow-local-writes` are `permission_denied`.

## Persistence

`~/.agent-vitals/state/plugins/city-buildings/overrides.sqlite` (or `$AGENT_VITALS_HOME/...`):

- `overrides(asset_ref, revision, kit_version, model_json, updated_at_ms)` — `model_json` NULL means default.
- `build_events(build_event_id, asset_ref, revision, kind, part_count, created_at_ms)` — queued, replayable construction records.

Atomic `BEGIN IMMEDIATE` check-and-commit. Survives app restart. Parcel/lot metadata is reported `unavailable` until the city loader can supply it.

## UI bridge (persist → push → animate)

MCP is a separate stdio process, so it cannot emit a Tauri event directly. After COMMIT the query layer:

1. Writes `state/plugins/city-buildings/notify.json` (durable mailbox).
2. Best-effort JSON line to `state/plugins/city-buildings/host.sock` when PluginHost is listening.
3. PluginHost evals **one shared CustomEvent** on the City webview: `__AV_PLUGIN_ENTITY_CHANGED__`.
4. City dispatches on `entity_kind`. `"building"` applies the session-kit overlay and plays block-by-block construction. Other kinds are ignored until a handler exists.

Host → City envelope (reusable; this PR implements `building`):

```json
{
  "type": "CityEntityChanged",
  "schema_version": 1,
  "entity_kind": "building",
  "entity_id": "ca_…",
  "action": "set",
  "revision": 1,
  "event_id": "be_…"
}
```

Building payloads also carry MCP/SQLite aliases (`asset_ref`, `build_event_id`, `kind`) plus the kit `model`. Tool JSON still returns `build_event_id`. `construction.ui` is `pushed` (socket accepted) or `queued` (mailbox + poll).

Load path: city:v3 `buildings.overrides` (not stuffed into session pages — kit floats must not go through the integer-only v3 validator). Cold open **snaps** current overrides. Live host/poll events **animate**. City also polls `build_events` every 8s if the eval landed before the listener.

PluginHost delivers each `event_id` at most once while the City webview is ready.

## Try it

```bash
python3 scripts/verify-city-building-mcp.py
# optional live tools/list check:
python3 scripts/verify-city-building-mcp.py --bin target/debug/agent-vitals
```

Against a real install (after `sync-facts` so sessions exist), with City open:

```bash
agent-vitals data-mcp serve --allow-local-writes
```

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"demo","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"sessions_search","arguments":{"limit":1}}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_building","arguments":{"session_id":"sr_…"}}}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"preview_building","arguments":{"session_id":"sr_…","model":{…}}}}
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"set_building_model","arguments":{"session_id":"sr_…","expected_revision":0,"model":{…}}}}
```

Copy `session_ref` from `sessions_search` into `session_id`. With City open, set should push `__AV_PLUGIN_ENTITY_CHANGED__` and play construction; `get_building` must show the new `revision` and parts. Restart still shows the override. `reset_building` restores the default with animation.

## Deferred (not in this PR)

- Road / vehicle write-path animation (the envelope and channel are ready; no handlers yet).
- Parcel/lot coordinates, screenshots, resident metrics, multi-bot locks beyond `revision`.
