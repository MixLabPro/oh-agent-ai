# WorkBuddy fixtures

One synthetic WorkBuddy home (`workdir/.workbuddy/`), used by the
`workbuddy-session` acceptance gate (`tests/test_cli_matrix.py` — differential
py==rs via `AGENT_VITALS_BIN`) and the §10 acceptance checks in
`docs/WORKBUDDY_INTEGRATION.md`. Rebuild with:

```bash
python3 fixtures/workbuddy/build_workbuddy_fixture.py
```

The builder is deterministic (fixed timestamps/hashes) and self-verifying: it
re-opens the home and runs the real evidence + audit projection, asserting the
exact §10 三态契约 and the §9 cost block. A fixture that stops exercising the
mapping table fails loudly instead of silently changing the gate.

## Why this exists

WorkBuddy persists each session across **three joinable surfaces** (§2.1;
`traces/` is session-anonymous and deliberately unused, §12.2):

- `workbuddy.db` — `sessions` (id/title/model/cwd/permission_mode/
  use_sandbox_cli/created_at/updated_at) + `session_usage`
  (session_id/used/size/updated_at/credit_json). **sessionId is the only join
  anchor.** `created_at`/`updated_at` (both tables) and audit-log `timestamp`
  are **INTEGER epoch-milliseconds** (13-digit), matching the real machine
  (2026-09-10) — not ISO strings. The adapter normalizes them per spec §6.2
  (integer → ms → `YYYY-MM-DDTHH:MM:SSZ` UTC; out of `[2000-01-01, now+24h]`
  → null + `attempts`).
- `audit-log/*.jsonl` — per-event decision records grouped by the **`sessionId`
  field** (not the filename), carrying `eventType`/`sequence`/`prevHash`/`hash`/
  `requestId`/`toolCallId`/`commandPreview`/`messageKey`/`messageParams`.
- `file-history/<sessionId>/<contentHash>@v<n>` — version snapshots; the count
  is the FileMutations source (§3).

## The fixture

Two sessions:

- **s1 健康会话** — three clean records (two `sandbox-executed` bash, one
  `WebFetch`), a continuous hash chain (head `prevHash=""`), db `fullAccess` +
  `credit_json {"r1":22.53,"r2":19.48}` (real per-request magnitude ~22 credits)
  → healthy-session shape of §10 acceptance #4: `rules_unavailable=7`,
  `findings_total=0`, cost `{tokens:5000, cny:42.01, host_billed:true}` (`cny`
  is the credit sum — the field rename to `cash_cny`/`nominal_cny` is A3, not
  yet done).
- **s2 审批流程会话** — three approval decisions (approved/rejected/bulk-delete
  rejected) + one `sandbox-executed`, with a **rotated** hash-chain head
  (`prevHash="5a5a..."` on seq=100 has no predecessor) → the approvals axis +
  rotation note: `findings_total=4` (SV609×3 info, SV610×1 allowed-once
  warning), `rules_unavailable=6`, cost `{tokens:12000, cny:0.0,
  host_billed:true}`.

The Rust side (`crates/agent-vitals-hosts/src/hosts/workbuddy/sessions/evidence.rs` +
`crates/agent-vitals-hosts/src/hosts/workbuddy/sources/mod.rs`) reads the same sqlite db (rusqlite, bundled)
and audit-log; the differential gate in `tests/test_cli_matrix.py` copies
`workdir` into a temp HOME, feeds it to both implementations, and byte-compares
the output — which is what pins the two sides together.
