#!/usr/bin/env node
// Settings page contract checks. The page talks to several independent local
// projections; every read must be generation-guarded so an older response
// cannot overwrite a newer mutation/readback.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(repo, "apps/desktop/ui-dev/react/src/features/settings/SettingsPage.tsx"), "utf8");

for (const name of ["sourceRequest", "sourceControlsRequest", "customRequest", "budgetRequest", "billingRequest", "dataRequest", "aboutRequest", "quotaReminderRequest"]) {
  assert.match(source, new RegExp(`const ${name} = useRef\\(0\\)`), `${name} generation missing`);
}
assert.match(source, /const settingsMounted = useRef\(true\)/, "settings mounted guard missing");
assert.match(source, /useEffect\(\(\) => \{\s*settingsMounted\.current = true/u, "settings mounted guard is not re-armed for StrictMode effect replay");
assert.match(source, /settingsMounted\.current = false/, "settings unmount invalidation missing");
assert.equal((source.match(/const mounted = useMountedRef\(\)/g) ?? []).length, 6, "settings child mounted guards are incomplete");
assert.match(source, /if \(!mounted\.current\) return;/, "settings child actions do not stop after unmount");
assert.match(source, /if \(mounted\.current\) set(?:ActionError|Message|Saving|Exporting|Checking|Opening)/, "settings child error/finally state is not guarded");

for (const section of [
  ["sourceRequest", "sourceRequestId = ++sourceRequest.current", "readSourceHealth", "setReport", "setLoading(false)"],
  ["customRequest", "requestId = ++customRequest.current", "readCustomSourceConfig", "setCustomReport", "setCustomLoading(false)"],
  ["budgetRequest", "requestId = ++budgetRequest.current", "readBudgetSettings", "setBudgetReport", "setBudgetLoading(false)"],
  ["billingRequest", "requestId = ++billingRequest.current", "readBillingSettings", "setBillingReport", "setBillingLoading(false)"],
  ["dataRequest", "requestId = ++dataRequest.current", "readStatisticsSettings", "setDataReport", "setDataLoading(false)"],
  ["aboutRequest", "requestId = ++aboutRequest.current", "readAboutDiagnostics", "setAboutReport", "setAboutLoading(false)"],
  ["quotaReminderRequest", "requestId = ++quotaReminderRequest.current", "readQuotaReminderConfig", "setQuotaReminder", "setQuotaReminderLoading(false)"],
]) {
  const [generation, marker, read, success, finallyState] = section;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${generation} request increment missing`);
  const end = source.indexOf("\n  };", start >= 0 ? start : 0);
  const body = source.slice(start >= 0 ? start : 0, end >= 0 ? end : source.length);
  assert.match(body, new RegExp(read), `${generation} read missing`);
  assert.match(body, /settingsMounted\.current && [A-Za-z]+ === [A-Za-z]+\.current/, `${generation} success/error guard missing`);
  assert.match(body, new RegExp(finallyState.replace(/[()]/g, "\\$&")), `${generation} loading state missing`);
  assert.match(body, /settingsMounted\.current && [A-Za-z]+ === [A-Za-z]+\.current/, `${generation} finally guard missing`);
  assert.match(body, new RegExp(success), `${generation} success setter missing`);
}

const sourceStart = source.indexOf("const sourceRequestId = ++sourceRequest.current");
const sourceEnd = source.indexOf("\n  };", sourceStart);
const sourceBody = source.slice(sourceStart, sourceEnd);
assert.match(sourceBody, /sourceControlsRequestId === sourceControlsRequest\.current/, "source controls read is not generation guarded");
assert.match(sourceBody, /sourceRequestId === sourceRequest\.current/, "source health read is not generation guarded");
assert.match(source, /const paused = await setSyncPaused\(!report\.sync\.paused\)/, "pause receipt is not captured");
assert.match(source, /setSyncMessage\(message\(paused \? "sx\.autoPausedMsg" : "sx\.autoResumedMsg", language\)\)/, "pause message does not use backend receipt");
assert.doesNotMatch(source, /await setSyncPaused\([^\n]+\);\s*setSyncMessage\(!report\.sync\.paused/u, "pause message still infers state from stale report");

assert.match(source, /const requestId = await triggerSync\(\);\s*if \(!settingsMounted\.current\) return false;/u, "sync completion does not stop after unmount");
assert.match(source, /const status = await readSyncRequestStatus\(requestId\);\s*if \(!settingsMounted\.current\) return false;/u, "sync polling does not stop after unmount");
assert.match(source, /catch \(reason: unknown\) \{\s*if \(settingsMounted\.current\) \{\s*setSyncMessage\(null\);/u, "sync error state is not unmount guarded");
assert.match(source, /finally \{\s*if \(settingsMounted\.current\) setSyncing\(false\);/u, "sync busy state is not unmount guarded");
assert.match(source, /const paused = await setSyncPaused\([^\n]+\);\s*if \(!settingsMounted\.current\) return;/u, "pause completion does not stop after unmount");
assert.match(source, /const receipt = await setSourceHarnessExcluded\([^\n]+\);\s*if \(!settingsMounted\.current\) return;/u, "source exclusion completion does not stop after unmount");
assert.match(source, /const receipt = await deleteImportedSourceData\([^\n]+\);\s*if \(!settingsMounted\.current\) return;/u, "source deletion completion does not stop after unmount");
assert.match(source, /if \(settingsMounted\.current\) setPauseSaving\(false\);/u, "pause busy state is not unmount guarded");
assert.match(source, /if \(settingsMounted\.current\) setSourceControlHarness\(null\);/u, "source exclusion busy state is not unmount guarded");
assert.match(source, /if \(settingsMounted\.current\) setDeleteBusyHarness\(null\);/u, "source deletion busy state is not unmount guarded");

console.log("React Settings contract: OK (per-projection generations, unmount guard, pause receipt)");
