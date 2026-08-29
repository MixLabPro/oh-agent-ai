// Wire-contract verification: DSH's sessionProjection registry only *publishes*
// a projection when its definition carries `wire` — snapshot()/drive()/
// viewCheckpoint() all `continue` past `wire === undefined` — and restore() can
// only parse cached rows when the definition carries `stateSchema`. The audit
// plugin shipped all 14 projections registered in the OLD shape `{schema, view}`;
// the registry erased `wire` to `undefined`, every client read hit the empty
// baseline, and the 审计 tab sat on 不可用/计算中 forever. The mismatch shipped
// because host/index.ts declared sessionProjections as `any` AND the old
// verify-host.mjs mock stored the raw def and read `def.schema`/`def.view`
// directly — neither path ever looked at `wire`.
//
// This check replicates the registry's REAL register() erasure
// (deepseek-harness/packages/session/session-projection/src/index.ts): it keeps
// only {key, stateSchema, init, apply, wire, stateVersion} and drops everything
// else, reading `wire` exclusively from `definition.wire`. Then it asserts every
// audit key still carries a live wire + stateSchema, and that each erased def
// round-trips through its own schemas. It also self-checks the mock — a def
// registered in the old shape must erase to wire===undefined — so this check can
// never silently pass on a regression the way the old mock did.
//
//   cd dsh-client && npm run build   # needs lib/index.js, like verify-host.mjs
//   node scripts/verify-wire-contract.mjs

import { apply } from '../lib/index.js'

// Every audit projection the plugin registers. If this list grows, the register()
// helper's call sites and this list are the two halves of the same contract.
const OUR_KEYS = [
  'sessionCwd', 'behaviorFindings', 'tokenByModel', 'costReport', 'loopCosts',
  'preForkUsage', 'subagentSpawns', 'requestMetrics', 'contextComposition',
  'compactionEvents', 'structuralWaste', 'skillAudit', 'skillAttribution',
  'durationAudit',
]

function fail(msg) {
  console.error(`\n[verify-wire] FAIL: ${msg}`)
  process.exitCode = 1
  throw new Error(msg)
}
function ok(msg) {
  console.log(`[verify-wire] ok: ${msg}`)
}

// ── faithful replica of the real registry's register() erasure ──────────────
// Deliberately NOT the lenient `defs[key] = def` of verify-host.mjs — that one
// never erased anything and therefore could not see a missing wire.
function makeRegistry() {
  const registrations = new Map()
  return {
    ctx: {
      on() {},
      sessionProjections: {
        register(definition) {
          const wire = definition.wire
          const erased = {
            key: definition.key,
            stateSchema: definition.stateSchema,
            init: header => definition.init(header),
            apply: (state, event) => definition.apply(state, event),
            wire: wire === undefined
              ? undefined
              : { viewSchema: wire.viewSchema, view: state => wire.view(state) },
            stateVersion: definition.stateVersion,
          }
          if (!Number.isSafeInteger(erased.stateVersion) || erased.stateVersion < 0) {
            throw new Error(`session projection ${JSON.stringify(erased.key)} stateVersion must be a non-negative integer, got ${String(erased.stateVersion)}`)
          }
          registrations.set(erased.key, erased)
          return () => {}
        },
      },
    },
    registrations,
  }
}

const { ctx, registrations } = makeRegistry()
apply(ctx)

let failures = 0

// ── 1. every audit projection must carry the wire shape (the fix) ────────────
console.log('\n[verify-wire] wire presence — a projection without wire is never published by DSH')
for (const k of OUR_KEYS) {
  const def = registrations.get(k)
  const hasWire = def !== undefined && def.wire !== undefined
  const hasStateSchema = def !== undefined && def.stateSchema !== undefined
  if (!hasWire || !hasStateSchema) {
    failures++
    console.log(`  ✗ ${k.padEnd(26)} wire=${hasWire ? '✓' : 'MISSING'} stateSchema=${hasStateSchema ? '✓' : 'MISSING'}`)
  } else {
    console.log(`  ✓ ${k.padEnd(26)} wire ✓ stateSchema ✓ stateVersion=${def.stateVersion}`)
  }
}
if (failures > 0) {
  fail(`${failures}/14 audit projections lack the wire/stateSchema shape — DSH will never publish them (审计 tab stuck on 不可用/计算中)`)
}

// ── 2. every erased def must round-trip through its own schemas ─────────────
// This is the cold path a client hits: restore parses a cached row with
// stateSchema, then the wire viewSchema validates what the client receives.
// Drive one universal session/created event through apply() first so the wire
// view folds a real first event, not just the empty init state.
console.log('\n[verify-wire] delivery round-trip: init → apply(session/created) → stateSchema.parse → wire.view → wire.viewSchema.parse')
for (const k of OUR_KEYS) {
  const def = registrations.get(k)
  try {
    let state = def.init({})
    state = def.apply(state, { type: 'session/created', seq: 1, time: 1, data: {} })
    state = def.stateSchema.parse(state)
    const out = def.wire.viewSchema.parse(def.wire.view(state))
    ok(`${k}: round-trips (view output ${Array.isArray(out) ? out.length + ' rows' : 'valid'})`)
  } catch (e) {
    failures++
    console.log(`  ✗ ${k}: THROW ${String(e).slice(0, 160)}`)
  }
}
if (failures > 0) {
  fail(`${failures} projections failed the delivery round-trip`)
}

// ── 3. mock fidelity: the check must catch the old shape ────────────────────
// A def registered as {schema, view} (the pre-fix shape) must erase to
// wire===undefined under the faithful mock. If this ever passes, the mock has
// regressed into the lenient form that masked the original bug.
{
  const oldShape = {
    key: '__old_shape_sentinel', schema: { parse: x => x }, view: s => s,
    init: () => ({}), apply: s => s, stateVersion: 1,
  }
  const r = makeRegistry()
  r.ctx.sessionProjections.register(oldShape)
  const erased = [...r.registrations.values()][0]
  if (erased.wire !== undefined) {
    fail('mock fidelity: old-shape {schema,view} did NOT erase to wire===undefined — the mock is lenient again')
  }
  ok('mock fidelity: old-shape {schema,view} → wire===undefined (the mock catches the regression)')
}
{
  const newShape = {
    key: '__wire_shape_sentinel', stateSchema: { parse: x => x },
    wire: { viewSchema: { parse: x => x }, view: s => s },
    init: () => ({}), apply: s => s, stateVersion: 1,
  }
  const r = makeRegistry()
  r.ctx.sessionProjections.register(newShape)
  const erased = [...r.registrations.values()][0]
  if (erased.wire === undefined || erased.stateSchema === undefined) {
    fail('mock fidelity: new-shape def did NOT keep wire/stateSchema')
  }
  ok('mock fidelity: new-shape def keeps wire + stateSchema')
}

console.log('\n[verify-wire] ALL CHECKS PASSED — all 14 audit projections carry the wire shape DSH requires')
