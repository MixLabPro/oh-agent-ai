// Zero-dependency verification for the out-of-tree audit plugin.
//
// Proves the three things the plugin must establish, without any DSH or npm
// dependencies:
//   1. `package.json` carries a well-formed `dsh.client` manifest whose
//      `exports["./client"]` resolves to an existing bundle file.
//   2. `package.json` also carries `dsh.bundle.patch` → `cordis.patch.yml` with
//      a single insert row, so `dsh plugin add` mounts it as a loader entry
//      (without this the client-modules scanner never sees it).
//   3. That bundle (`client.js`) is a valid `window.__ModuleLoader__.load`
//      handoff whose factory returns `{ apply, inject }`, and a mounted
//      `apply` registers the `audit` entry into the `conversation.view` slot.
//
// It mirrors the real `ClientModuleSystem` contract (modules/src/client/system.ts)
// and the tsdown artifact test (ui-trajectory/tests/client-bundle.client.spec.ts),
// but with a stubbed React/module table so it runs in plain Node.

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Node 22 exposes a host `navigator.language` (usually en-US), while this
// standalone verifier must exercise the documented zh-CN fallback path.
// Keep the test deterministic without changing browser runtime behavior.
if (globalThis.navigator && typeof globalThis.navigator === 'object') {
  try {
    Object.defineProperty(globalThis.navigator, 'language', { value: 'zh-CN', configurable: true })
  } catch (_) {
    // Older runtimes may expose a non-configurable navigator.
  }
}

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

function fail(msg) {
  console.error(`\n[verify] FAIL: ${msg}`)
  process.exitCode = 1
  throw new Error(msg)
}

function ok(msg) {
  console.log(`[verify] ok: ${msg}`)
}

// --- 1. syntax-check both artifacts --------------------------------------
for (const file of ['lib/client.cjs', 'lib/index.js']) {
  const r = spawnSync(process.execPath, ['--check', resolve(root, file)], { encoding: 'utf8' })
  if (r.status !== 0) fail(`node --check ${file} failed:\n${r.stderr}`)
  ok(`node --check ${file}`)
}

// --- 2. manifest + exports["./client"] -----------------------------------
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
ok(`package name: ${pkg.name}`)
if (pkg.type !== 'module') fail('package.json type must be "module"')

const dshClient = pkg?.dsh?.client
if (!dshClient || typeof dshClient !== 'object') fail('missing dsh.client declaration')
if (dshClient.platform !== 'web') fail(`dsh.client.platform must be "web", got ${JSON.stringify(dshClient.platform)}`)
if (dshClient.inject !== undefined && !Array.isArray(dshClient.inject)) fail('dsh.client.inject must be a string array')
ok(`dsh.client.platform: ${dshClient.platform}`)
ok(`dsh.client.inject: ${JSON.stringify(dshClient.inject)}`)

const clientRel = pkg?.exports?.['./client']
if (typeof clientRel !== 'string') fail('exports["./client"] must be a string')
if (!clientRel.startsWith('./')) fail(`exports["./client"] must be a relative path, got ${clientRel}`)
const clientAbs = resolve(root, clientRel)
try {
  readFileSync(clientAbs)
} catch {
  fail(`exports["./client"] resolves to missing file: ${clientAbs}`)
}
ok(`exports["./client"] -> ${clientRel} (exists)`)

// --- 2.5 bundle wiring: the patch that makes this a loader entry ----------
// The client-modules node half only scans loader entries (ctx.loader.entries());
// a loader entry comes from a bundle patch insert. Without dsh.bundle.patch +
// cordis.patch.yml, `dsh plugin add` installs this package as a dead dependency
// and the 「审计」 tab never appears — the exact gap the plugin originally shipped
// with. Guard it so it cannot silently return.
const patchRel = pkg?.dsh?.bundle?.patch
if (typeof patchRel !== 'string') fail('missing dsh.bundle.patch')
const patchAbs = resolve(root, patchRel)
let patchText
try {
  patchText = readFileSync(patchAbs, 'utf8')
} catch {
  fail(`dsh.bundle.patch resolves to missing file: ${patchAbs}`)
}
if ((patchText.match(/- insert:/g) || []).length !== 1) fail('cordis.patch.yml must have exactly one - insert:')
if ((patchText.match(/- id:/g) || []).length !== 1) fail('cordis.patch.yml must have exactly one - id:')
if (!patchText.includes('id: agent-vitals-audit')) fail('cordis.patch.yml insert id must be agent-vitals-audit')
if (!patchText.includes('name: dsh-agent-vitals-audit')) fail('cordis.patch.yml insert name must be dsh-agent-vitals-audit')
ok(`dsh.bundle.patch -> ${patchRel} (exists, single insert row)`)

// --- 3. load the bundle as the browser loader would ----------------------
const code = readFileSync(clientAbs, 'utf8')
let handoff
globalThis.window = globalThis // bundle references `window.__ModuleLoader__`
globalThis.window.__ModuleLoader__ = {
  load(h) {
    handoff = h
  },
}
// Evaluate exactly like the test fixture (new Function runs in window scope).
new Function(code)()

if (!handoff) fail('bundle did not call window.__ModuleLoader__.load')
ok(`handoff id: ${handoff.id}`)
if (handoff.id !== pkg.name) fail(`handoff id ${handoff.id} !== package name ${pkg.name}`)

// Stub the module table: only `react` is required by this minimal bundle.
// useState is a single-shot stub (returns [initial, noop]) — verify.mjs
// never re-renders, it just proves the component mounts without throwing.
// AuditView itself now calls useState directly (F3 marks state), not just
// the nested FindingGroup this stub previously got away with skipping.
const reactStub = {
  createElement(type, props, ...children) {
    return { type, props, children }
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}]
  },
}
const exports = handoff.factory((spec) => {
  if (spec === 'react') return reactStub
  throw new Error(`unexpected require: ${spec}`)
})

if (typeof exports.apply !== 'function') fail('exports.apply is not a function')
ok('exports.apply is a function')
if (JSON.stringify(exports.inject) !== JSON.stringify(['slots', 'locale'])) {
  fail(`exports.inject should be ["slots", "locale"], got ${JSON.stringify(exports.inject)}`)
}
ok('exports.inject === ["slots", "locale"]')

// --- 4. mount apply against a stub ctx and assert the registration --------
// The style effect touches `document` — stub just enough for it to run.
globalThis.document = {
  createElement: () => ({ setAttribute() {}, set textContent(_) {} }),
  head: { appendChild() {} },
}

function testWithLocale(localeConfig, expectedLabel, descLabel) {
  const calls = []
  const ctx = {
    effect(fn, tag) {
      calls.push({ kind: 'effect', tag })
      return fn()
    },
    slots: {
      inject(name, fn) {
        calls.push({ kind: 'inject', name })
        return fn()
      },
      register(options, component) {
        calls.push({ kind: 'register', options, component })
        return () => {}
      },
    },
  }
  if (localeConfig) {
    ctx.locale = localeConfig
  }

  exports.apply(ctx)

  const injectCall = calls.find((c) => c.kind === 'inject')
  if (!injectCall || injectCall.name !== 'conversation.view') {
    fail(`apply did not slots.inject('conversation.view', ...); calls=${JSON.stringify(calls.map((c) => c.name))}`)
  }

  const regCall = calls.find((c) => c.kind === 'register')
  if (!regCall) fail('apply did not call ctx.slots.register')
  const { options, component } = regCall
  if (options.name !== 'conversation.view') fail(`register name ${options.name} !== 'conversation.view'`)
  if (options.id !== 'audit') fail(`register id ${options.id} !== 'audit'`)
  if (options.order !== 20) fail(`register order ${options.order} !== 20`)
  if (typeof options.label !== 'function') fail('register label is not a function')
  const actualLabel = options.label()
  if (actualLabel !== expectedLabel) {
    fail(`register label ${descLabel} thunk must resolve to "${expectedLabel}", got "${actualLabel}"`)
  }
  if (typeof component !== 'function') fail('register component is not a function')
  ok(`register label() resolves to "${expectedLabel}" (${descLabel})`)

  return component
}

// Test 1: no locale injection (fallback to navigator.language)
const component1 = testWithLocale(null, '审计', '(no DSH locale, zh-CN default)')

// Test 2: DSH locale.language='en' (English setting in DSH)
const component2 = testWithLocale({ language: 'en' }, 'Audit', '(DSH locale.language=en)')

// Test component mount (use the second component from the last test)
const element = component2({})
if (typeof element?.type !== 'function') fail('registered component did not return a createElement(AuditView, …) element')
const vnode = element.type(element.props)
if (vnode?.props?.['data-audit-view'] === undefined) fail('AuditView did not render the data-audit-view container')
ok('AuditView renders a data-audit-view container element')

console.log('\n[verify] ALL CHECKS PASSED — audit plugin is buildable and scannable')
