import { useEffect, useRef, useState } from "react";
import { cancelSkillScan, exportSkillsRedacted, readSkillsDiff, readSkillsScanSettings, readSkillScan, safeUiError, saveSkillsScanSettings, saveSkillsSnapshot, type SkillDiffReport, type SkillScanReport } from "../../lib/tauri";
import { hostName } from "../../lib/hostNames";
import { ToolbarActions } from "../../components/ui/ToolbarActions";
import { message, resolvedLanguage, useLanguage, type MessageKey } from "../../lib/i18n";

const tx = (key: MessageKey, params: Record<string, string | number> = {}): string => message(key, resolvedLanguage(), params);

const hostLabels: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex", dsh: "DeepSeek Harness", openclaw: "OpenClaw", hermes: "Hermes", workbuddy: "WorkBuddy" };
const severityLabel = (severity: "critical" | "warning" | "info"): string => tx(severity === "critical" ? "sk.critical" : severity === "warning" ? "sk.warning" : "sk.info");

function hostLabel(host: string): string { return hostLabels[host] ?? hostName(host); }
function tokensOrDash(value: number | null): string { return value === null ? "—" : value.toLocaleString(); }

export function SkillsPage() {
  useLanguage();
  const [host, setHost] = useState("all");
  const [report, setReport] = useState<SkillScanReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [diff, setDiff] = useState<SkillDiffReport | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [reportStale, setReportStale] = useState(false);
  const [selfRoot, setSelfRoot] = useState("");
  const [budgetOverride, setBudgetOverride] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const mounted = useRef(false);
  const cancelRequested = useRef(false);

  useEffect(() => {
    mounted.current = true;
    void readSkillsScanSettings().then((settings) => {
      if (!mounted.current) return;
      setSelfRoot(settings.self_root);
      setBudgetOverride(settings.budget === null ? "" : String(settings.budget));
    }).catch((reason: unknown) => {
      if (mounted.current) setSettingsError(safeUiError(reason, tx("sk.settingsReadFailed")));
    }).finally(() => {
      if (mounted.current) setSettingsLoading(false);
    });
    return () => { mounted.current = false; };
  }, []);

  const scan = async (force: boolean, selectedHost = host) => {
    if (scanning) return;
    cancelRequested.current = false;
    setScanning(true); setUnavailable(false); setError(null); setMessage(null); setDiff(null); setDiffError(null); setReportStale(Boolean(report));
    try { const next = await readSkillScan(selectedHost, force); if (!mounted.current) return; if (next.status === "unavailable") { setUnavailable(true); setMessage(tx("sk.scanUnavailMsg")); } else { setReport(next); setReportStale(false); setUnavailable(false); setMessage(next.from_cache ? tx("sk.fromCacheMsg") : tx("sk.scanDone")); } }
    catch (reason: unknown) { if (!mounted.current) return; const cancelled = cancelRequested.current || reason instanceof Error && /已取消|cancel/i.test(reason.message); if (cancelled) setMessage(tx("sk.scanCancelled")); else setError(safeUiError(reason, tx("sk.scanFailed"))); }
    finally { if (mounted.current) setScanning(false); }
  };
  const cancel = async () => {
    if (!scanning) return;
    cancelRequested.current = true;
    try { const result = await cancelSkillScan(); if (mounted.current) setMessage(result === "cancelled" ? tx("sk.cancelRequested") : tx("sk.nothingToCancel")); }
    catch (reason: unknown) { if (mounted.current) setError(safeUiError(reason, tx("sk.cancelFailed"))); }
  };
  const saveSnapshot = async () => {
    if (snapshotBusy || scanning || !report) return;
    setSnapshotBusy(true); setError(null); setMessage(null);
    try { await saveSkillsSnapshot(); if (mounted.current) setMessage(tx("sk.snapshotSaved")); }
    catch (reason: unknown) { if (mounted.current) setError(safeUiError(reason, tx("sk.snapshotFailed"))); }
    finally { if (mounted.current) setSnapshotBusy(false); }
  };
  const compareSnapshot = async () => {
    if (diffLoading || scanning || !report) return;
    setDiffLoading(true); setDiffError(null);
    try { const next = await readSkillsDiff(); if (mounted.current) setDiff(next); }
    catch (reason: unknown) { if (mounted.current) { setDiff(null); setDiffError(safeUiError(reason, tx("sk.diffFailed"))); } }
    finally { if (mounted.current) setDiffLoading(false); }
  };
  const saveScanSettings = async () => {
    if (settingsBusy || settingsLoading) return;
    const trimmedBudget = budgetOverride.trim();
    const budget = trimmedBudget ? Number(trimmedBudget) : null;
    if (budget !== null && (!Number.isSafeInteger(budget) || budget <= 0)) {
      setSettingsError(tx("sk.budgetInvalid"));
      return;
    }
    setSettingsBusy(true); setSettingsError(null); setSettingsMessage(null);
    try {
      await saveSkillsScanSettings(selfRoot, budget);
      if (!mounted.current) return;
      setSettingsMessage(report ? tx("sk.savedRescan") : tx("sk.savedNext"));
      if (report) setReportStale(true);
    } catch (reason: unknown) {
      if (mounted.current) setSettingsError(safeUiError(reason, tx("sk.settingsSaveFailed")));
    } finally {
      if (mounted.current) setSettingsBusy(false);
    }
  };
  const exportRedacted = async () => {
    if (exportBusy || scanning || !report) return;
    setExportBusy(true); setError(null); setMessage(null);
    try {
      const receipt = await exportSkillsRedacted(selfRoot.trim() || null);
      if (!mounted.current) return;
      if (receipt.status === "cancelled") return;
      setMessage(tx("sk.exported"));
    } catch (reason: unknown) {
      if (mounted.current) setError(safeUiError(reason, tx("sk.exportFailed")));
    } finally {
      if (mounted.current) setExportBusy(false);
    }
  };
  const hosts = report?.hosts.filter((item) => host === "all" || item.host === host) ?? [];
  const reportMatchesHost = Boolean(report && (host === "all" ? report.host_selection === "all" : report.host_selection === "all" || report.host_selection === host));
  const selectedHostNotScanned = Boolean(report && !reportMatchesHost);
  const diagnostics = report?.diagnostics.filter((item) => item.severity === "critical" || item.severity === "warning") ?? [];
  const hostOptions = Array.from(new Set([...Object.keys(hostLabels), ...(report?.hosts.map((item) => item.host) ?? [])])).sort();
  return <>
    <h2 id="skills-title" className="visually-hidden">{tx("sk.pageTitle")}</h2>
    <ToolbarActions><div className="skills-toolbar">
      <label><span>{tx("sk.host")}</span><select value={host} onChange={(event) => setHost(event.target.value)} disabled={scanning || snapshotBusy || diffLoading || exportBusy}><option value="all">{tx("sk.allHosts")}</option>{hostOptions.map((value) => <option value={value} key={value}>{hostLabel(value)}</option>)}</select></label>
      {report && !scanning && <button className="button button-secondary" type="button" onClick={() => void scan(true)} disabled={snapshotBusy || diffLoading || exportBusy}>{tx("sk.rescan")}</button>}
      {!report && !scanning && <button className="button button-secondary" type="button" onClick={() => void scan(true)}>{tx("sk.startScan")}</button>}
      {scanning && <button className="button button-secondary" type="button" onClick={() => void cancel()}>{tx("sk.cancelScan")}</button>}
    </div></ToolbarActions>
    {report && reportMatchesHost && !scanning && <div className="skills-result-actions" aria-label={tx("sk.resultActions")}>
      <button className="button button-secondary" type="button" onClick={() => void saveSnapshot()} disabled={snapshotBusy || diffLoading || exportBusy} title={tx("sk.snapshotWarn")}>{snapshotBusy ? tx("sk.saving") : tx("sk.saveSnapshot")}</button>
      <button className="button button-secondary" type="button" onClick={() => void compareSnapshot()} disabled={snapshotBusy || diffLoading || exportBusy}>{diffLoading ? tx("sk.comparing") : tx("sk.compare")}</button>
      <button className="button button-secondary" type="button" onClick={() => void exportRedacted()} disabled={snapshotBusy || diffLoading || exportBusy}>{exportBusy ? tx("sk.exporting") : tx("sk.exportJson")}</button>
    </div>}
    <details className="skills-panel skills-settings-panel">
      <summary>{tx("sk.advanced")}</summary>
      <p className="skills-note">{tx("sk.advancedNote")}</p>
      <div className="skills-settings-grid">
        <label><span>{tx("sk.selfRoot")}</span><input value={selfRoot} onChange={(event) => setSelfRoot(event.target.value)} placeholder={tx("sk.selfRootPh")} disabled={settingsLoading || settingsBusy} /></label>
        <label><span>{tx("sk.budgetOverride")}</span><input type="number" min="1" step="1" value={budgetOverride} onChange={(event) => setBudgetOverride(event.target.value)} placeholder={tx("sk.budgetPh")} disabled={settingsLoading || settingsBusy} /></label>
        <div className="skills-settings-actions"><button className="button button-secondary" type="button" onClick={() => void saveScanSettings()} disabled={settingsLoading || settingsBusy}>{settingsBusy ? tx("sk.saving") : tx("sk.saveSettings")}</button>{settingsMessage && <span role="status">{settingsMessage}</span>}{settingsError && <span className="skills-settings-error" role="alert">{settingsError}</span>}</div>
      </div>
    </details>
    {error && <div className="error-banner" role="alert">{error}</div>}{scanning && <section className="skills-state" role="status"><strong>{tx("sk.scanning")}</strong><p>{tx("sk.scanningNote")}</p></section>}{message && <p className="skills-message" role="status">{message}</p>}
    {unavailable && !scanning && <section className="skills-state" role="status"><strong>{tx("sk.unavailable")}</strong><p>{report ? tx("sk.unavailPrev") : tx("sk.unavailNone")}{tx("sk.unavailNote")}</p></section>}
    {!report && !unavailable && !scanning && !error && <section className="skills-state"><strong>{tx("sk.notScanned")}</strong><p>{tx("sk.notScannedNote")}</p></section>}
    {selectedHostNotScanned && <div className="usage-refresh-status" role="status">{tx("sk.notCovered", { scope: host === "all" ? tx("sk.allHosts") : hostLabel(host) })}</div>}
    {report && reportMatchesHost && <>
      {reportStale && scanning && <div className="usage-refresh-status" role="status">{tx("sk.refreshing")}</div>}
      {reportStale && !scanning && (error || unavailable) && <div className="usage-refresh-status trust-refresh-status-error" role="status">{tx("sk.noNewResult")}</div>}
      <section className="skills-summary" aria-label={tx("sk.summaryAria")}><span>{reportStale ? tx("sk.prevScan") : tx("sk.run", { run: report.run ?? tx("sk.unknown") })}</span><span>{tx("sk.hostLine", { host: report.host_selection })}</span><span>{tx("sk.hostSummaries", { n: report.hosts.length })}</span><span>{tx("sk.diagnostics", { n: report.diagnostics.length })}</span><span>{tx(report.from_cache ? "sk.fromCache" : reportStale ? "sk.prevResult" : "sk.thisScan")}</span></section>
      {diffError && <div className="error-banner" role="alert">{diffError}</div>}
      {diff && <section className="skills-panel" aria-labelledby="skills-diff-title"><div className="section-heading"><div><p className="eyebrow">{tx("sk.explicitDiff")}</p><h3 id="skills-diff-title">{tx("sk.diffTitle")}</h3></div><span className={`status-pill status-pill-${diff.status === "partial" ? "warning" : "success"}`}>{diff.status === "partial" ? tx("sk.partial", { n: diff.dropped_rows }) : tx("sk.complete")}</span></div><p className="skills-note">{tx("sk.diffNote")}</p><div className="skills-diff-summary"><span>{tx("sk.added")} {diff.summary.added}</span><span>{tx("sk.removed")} {diff.summary.removed}</span><span>{tx("sk.usageChanged")} {diff.summary.usage_changed}</span><span>{tx("sk.newSecurity")} {diff.summary.new_security_findings}</span></div>{diff.added_skills.length > 0 && <div className="skills-not-assessed"><strong>{tx("sk.addedSkills")}</strong>{diff.added_skills.map((item, index) => <p key={`added-${index}`}>＋ {item.host} · {item.name}</p>)}</div>}{diff.removed_skills.length > 0 && <div className="skills-not-assessed"><strong>{tx("sk.removedSkills")}</strong>{diff.removed_skills.map((item, index) => <p key={`removed-${index}`}>− {item.host} · {item.name}</p>)}</div>}{diff.new_security_findings.length > 0 && <div className="skills-not-assessed"><strong>{tx("sk.newRuleHits")}</strong>{diff.new_security_findings.map((item, index) => <p key={`security-${index}`}>{item.skill} · {item.rule} · {tx("sk.lineN", { n: item.line })}</p>)}</div>}</section>}
      <section className="skills-host-grid" aria-label={tx("sk.hostSummaryAria")}>{hosts.length ? hosts.map((item) => <article className="skills-host-card" key={item.host}><div className="section-heading"><div><p className="eyebrow">{tx("sk.host")}</p><h3>{hostLabel(item.host)}</h3></div><span className="status-pill">{tx(item.trigger_data === "available" ? "sk.trigAvail" : item.trigger_data === "unavailable" ? "sk.trigNone" : "sk.trigUnknown")}</span></div><div className="skills-host-metrics"><span>{tx("sk.onDisk")} {tokensOrDash(item.skills_on_disk)}</span><span>{tx("sk.discoverable")} {tokensOrDash(item.unique_discoverable_skills)}</span><span>{tx("sk.runtimeVerified")} {tokensOrDash(item.runtime_verified_loaded_skills)}</span></div>{item.description_budget.available && item.description_budget.budget_chars !== null ? <div className="skills-budget"><div><span>{tx("sk.descBudget")}</span><strong>{item.description_budget.used_chars ?? 0} / {item.description_budget.budget_chars} {tx("sk.chars")}</strong></div><div className="skills-budget-bar"><span style={{ width: `${Math.max(0, Math.min(100, item.description_budget.pct_used ?? 0))}%` }} /></div><small>{item.description_budget.source ?? tx("sk.sourceUnknown")}</small></div> : <p className="skills-muted">{tx("sk.noBudget")}</p>}</article>) : <p className="skills-muted">{tx("sk.noSummary")}</p>}</section>
      <section className="skills-panel" aria-labelledby="skills-findings-title"><div className="section-heading"><div><p className="eyebrow">{tx("sk.actNow")}</p><h3 id="skills-findings-title">{tx("sk.heuristicHits")}</h3></div><span className="count-badge">{diagnostics.length}</span></div>{diagnostics.length ? <div className="skills-diagnostic-list">{diagnostics.map((item, index) => <article className="skills-diagnostic" key={`${item.code}-${index}`}><div className="skills-diagnostic-head"><span className={`finding-severity finding-severity-${item.severity === "critical" ? "critical" : "warning"}`}>{severityLabel(item.severity)}</span><strong>{item.code} · {item.name}</strong>{item.skill && <span>{item.skill}</span>}</div>{item.impact && <p>{item.impact}</p>}{item.recommendation && <p>{tx("sk.action")}{item.recommendation}</p>}{item.evidence_count > 0 && <small>{tx("sk.evidenceCount")}{item.evidence_count}</small>}{item.caveats.map((caveat) => <small className="skills-caveat" key={caveat}>! {caveat}</small>)}</article>)}</div> : <p className="skills-muted">{tx("sk.noHits")}</p>}</section>
      <section className="skills-panel" aria-labelledby="skills-not-assessed-title"><div className="section-heading"><div><p className="eyebrow">{tx("sk.coverageEdge")}</p><h3 id="skills-not-assessed-title">{tx("sk.notAssessed")}</h3></div><span className="count-badge">{report.not_assessed.length}</span></div>{report.not_assessed.length ? <div className="skills-not-assessed">{report.not_assessed.map((item, index) => <p key={`${item.code}-${index}`}><strong>{item.code} · {item.name}</strong><span>{item.reason}</span></p>)}</div> : <p className="skills-muted">{tx("sk.noneNotAssessed")}</p>}<p className="skills-note">{tx("sk.footerNote")}</p></section>
    </>}
  </>;
}
