#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = path.join(repo, "apps/desktop/ui-dev");
const uiRequire = createRequire(path.join(ui, "package.json"));
const { buildSync } = uiRequire("esbuild");
const source = path.join(ui, "react/src/lib/tauri.ts");
const built = buildSync({ entryPoints: [source], bundle: true, format: "cjs", platform: "node", target: "node20", write: false, logLevel: "silent" });

const pending = {
  slug: "sample-agent", display_name: "Sample Agent", state: "pending", manifest_hash: "0123456789abcdef",
  discovery_include_count: 1, trust_roots_count: 1, artifact_terms_count: 2, extensions_count: 1,
  trust_adapter: "generic_artifact_v1", watch_priority: "normal",
  source_scope_preview: { roots_count: 1, root_classes: ["home_relative"], covers_workspace_or_project: true, may_include_git_metadata: false, covers_full_filesystem: false, may_leave_home_directory: false },
  trust_scope_preview: { roots_count: 1, root_classes: ["home_relative_app_data"], covers_workspace_or_project: false, may_include_git_metadata: false, home_relative_only: true },
  local_path: "/Users/private/should-not-enter-ui",
};
const approved = { ...pending, slug: "approved-agent", display_name: "Approved Agent", state: "approved", manifest_hash: "fedcba9876543210" };
let suppressions = [
  { suppression_id: "trust-suppression-SV709-1780000000000", issue_type: "SV709", created_at_ms: 1780000000000, revoked_at_ms: null, reason: "/Users/private/must-be-ignored" },
  { suppression_id: "trust-suppression-SV702-1780000000001", issue_type: "SV702", created_at_ms: 1780000000001, revoked_at_ms: 1780000000002 },
];
const status = { status: "ok", authority_state: "ready", data: { pending: [pending], approved: [approved], history: [{ path: "/private/history" }] } };
const calls = [];
const invoke = async (command, args = {}) => {
  calls.push({ command, args });
  if (command === "trust_profile_proposal_status") return status;
  if (command === "trust_suppression_list") return { status: "ok", suppressions };
  if (command === "trust_profile_approve") return { status: "ok", data: { status: "approved", slug: args.slug } };
  if (command === "trust_profile_reject") return { status: "ok", data: { status: "rejected", slug: args.slug } };
  if (command === "trust_profile_revoke") return { status: "ok", data: { status: "revoked", slug: args.slug } };
  if (command === "trust_suppression_revoke") {
    const row = suppressions.find((item) => item.suppression_id === args.suppressionId);
    if (row) row.revoked_at_ms = 1780000000003;
    return { status: "revoked", suppression_id: args.suppressionId };
  }
  if (command === "trust_suppression_create") return { status: "saved", suppression_id: "trust-suppression-SV709-1780000000004" };
  throw new Error(`unexpected command ${command}`);
};

const sandbox = { module: { exports: {} }, exports: {}, require: uiRequire, console: { error() {}, warn() {}, log() {} }, Intl, Date, Math, Promise, setTimeout, clearTimeout, window: { __TAURI__: { core: { invoke } } } };
vm.createContext(sandbox);
vm.runInContext(built.outputFiles[0].text, sandbox, { filename: "tauri-trust-controls.bundle.cjs" });
const bridge = sandbox.module.exports;

const profiles = await bridge.readTrustProfileStatus();
assert.equal(profiles.pending.length, 1);
assert.equal(profiles.pending[0].source_scope_preview.covers_workspace_or_project, true);
assert.equal(profiles.approved[0].state, "approved");
assert.equal("local_path" in profiles.pending[0], false, "raw manifest extras must not cross the React bridge");
const readSuppressions = await bridge.readTrustSuppressions();
assert.equal(readSuppressions.length, 2);
assert.equal(readSuppressions[0].issue_type, "SV709");
assert.equal("reason" in readSuppressions[0], false, "free-form suppression reason must stay out of the UI DTO");
await bridge.approveTrustProfile(profiles.pending[0]);
await bridge.rejectTrustProfile(profiles.pending[0]);
await bridge.revokeTrustProfile(profiles.approved[0]);
assert.equal(await bridge.revokeTrustSuppression(profiles.pending.length ? "trust-suppression-SV709-1780000000000" : ""), "revoked");
assert.equal(await bridge.createTrustSuppression("SV709"), "trust-suppression-SV709-1780000000004");
assert.deepEqual(calls.filter((call) => call.command.startsWith("trust_profile_") && call.command !== "trust_profile_proposal_status").map((call) => call.args.manifestHash), [pending.manifest_hash, pending.manifest_hash, approved.manifest_hash], "every profile mutation must be pinned to the viewed manifest hash");
await assert.rejects(() => bridge.approveTrustProfile({ ...profiles.pending[0], manifest_hash: "bad" }), /reference is invalid/);
await assert.rejects(() => bridge.createTrustSuppression("SV999"), /issue type is invalid/);

const malformed = async (command) => command === "trust_profile_proposal_status"
  ? { status: "ok", data: { pending: [{ ...pending, source_scope_preview: { ...pending.source_scope_preview, root_classes: ["/Users/private"] } }], approved: [] } }
  : { status: "ok", suppressions: [] };
sandbox.window.__TAURI__.core.invoke = malformed;
await assert.rejects(() => bridge.readTrustProfileStatus(), /root class 不安全/);

console.log("React Trust controls contract: OK (scope redaction, bounded DTOs, hash-pinned UI decisions)");
