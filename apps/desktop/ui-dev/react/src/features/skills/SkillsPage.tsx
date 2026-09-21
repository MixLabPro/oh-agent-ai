import { useRef, useState } from "react";
import { cancelSkillScan, readSkillsDiff, readSkillScan, safeUiError, saveSkillsSnapshot, type SkillDiffReport, type SkillScanReport } from "../../lib/tauri";

const hostLabels: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex", dsh: "DeepSeek Harness", openclaw: "OpenClaw", hermes: "Hermes", workbuddy: "WorkBuddy" };
const severityLabels = { critical: "严重", warning: "警告", info: "提示" } as const;

function hostLabel(host: string): string { return hostLabels[host] ?? host; }
function tokensOrDash(value: number | null): string { return value === null ? "—" : value.toLocaleString(); }

export function SkillsPage() {
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
  const cancelRequested = useRef(false);

  const scan = async (force: boolean, selectedHost = host) => {
    if (scanning) return;
    cancelRequested.current = false;
    setScanning(true); setUnavailable(false); setError(null); setMessage(null); setDiff(null); setDiffError(null); setReportStale(Boolean(report));
    try { const next = await readSkillScan(selectedHost, force); if (next.status === "unavailable") { setUnavailable(true); setMessage("扫描结果暂不可用；保留上一次结果，没有把不可用误判成空结果。"); } else { setReport(next); setReportStale(false); setUnavailable(false); setMessage(next.from_cache ? "已读取本机缓存结果；重新扫描会绕过缓存。" : "扫描完成；结果只来自本机 skill 定义。"); } }
    catch (reason: unknown) { const cancelled = cancelRequested.current || reason instanceof Error && /已取消|cancel/i.test(reason.message); if (cancelled) setMessage("扫描已取消；保留上一次结果。"); else setError(safeUiError(reason, "Skill 扫描失败")); }
    finally { setScanning(false); }
  };
  const cancel = async () => {
    if (!scanning) return;
    cancelRequested.current = true;
    try { const result = await cancelSkillScan(); setMessage(result === "cancelled" ? "已请求取消扫描。" : "当前没有可取消的扫描任务。"); }
    catch (reason: unknown) { setError(safeUiError(reason, "取消扫描失败")); }
  };
  const saveSnapshot = async () => {
    if (snapshotBusy || scanning || !report) return;
    setSnapshotBusy(true); setError(null); setMessage(null);
    try { await saveSkillsSnapshot(); setMessage("已存为本机快照；下次扫描可用于对比。不会上传或修改 skill。"); }
    catch (reason: unknown) { setError(safeUiError(reason, "Skill 快照保存失败")); }
    finally { setSnapshotBusy(false); }
  };
  const compareSnapshot = async () => {
    if (diffLoading || scanning || !report) return;
    setDiffLoading(true); setDiffError(null);
    try { setDiff(await readSkillsDiff()); }
    catch (reason: unknown) { setDiff(null); setDiffError(safeUiError(reason, "Skill 对比失败")); }
    finally { setDiffLoading(false); }
  };
  const reportMatchesHost = report?.host_selection === host;
  const hosts = report && reportMatchesHost ? report.hosts.filter((item) => host === "all" || item.host === host) : report?.hosts ?? [];
  const diagnostics = report?.diagnostics.filter((item) => item.severity === "critical" || item.severity === "warning") ?? [];
  return <>
    <section className="skills-page-header" aria-labelledby="skills-title"><div><p className="eyebrow">本机定义 · 启发式审计</p><h2 id="skills-title">Skill 体检</h2><p className="section-description">扫描只在你点击后运行，不会自动修改、禁用或删除 skill；启发式命中需要人工判断。存为快照只写本机，快照未脱敏，包含绝对路径、用户名、skill 名和完整描述；不要直接分享快照文件。</p></div><div className="skills-toolbar"><label><span>宿主</span><select value={host} onChange={(event) => { const next = event.target.value; setHost(next); if (report && !scanning) void scan(true, next); }} disabled={scanning || snapshotBusy || diffLoading}><option value="all">全部宿主</option>{Object.entries(hostLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{report && !scanning && <><button className="button button-secondary" type="button" onClick={() => void scan(true)} disabled={snapshotBusy || diffLoading}>重新扫描</button><button className="button button-secondary" type="button" onClick={() => void saveSnapshot()} disabled={snapshotBusy || diffLoading}>{snapshotBusy ? "保存中…" : "存为快照"}</button><button className="button button-secondary" type="button" onClick={() => void compareSnapshot()} disabled={snapshotBusy || diffLoading}>{diffLoading ? "对比中…" : "与上次快照对比"}</button></>}{!report && !scanning && <button className="button button-secondary" type="button" onClick={() => void scan(true)}>开始扫描</button>}{scanning && <button className="button button-secondary" type="button" onClick={() => void cancel()}>取消扫描</button>}</div></section>
    {error && <div className="error-banner" role="alert">{error}</div>}{scanning && <section className="skills-state" role="status"><strong>正在扫描 Skill 定义…</strong><p>扫描可能需要几秒；不会写入快照或修改 skill 文件。</p></section>}{message && <p className="skills-message" role="status">{message}</p>}
    {unavailable && !scanning && <section className="skills-state" role="status"><strong>扫描结果暂不可用</strong><p>{report ? "本次没有拿到新的可判定结果，下面仍展示上一次扫描。" : "本次没有拿到可判定的本机结果；请检查宿主状态后重试。"}不可用不等于空结果，也不等于安全。</p></section>}
    {!report && !unavailable && !scanning && !error && <section className="skills-state"><strong>尚未扫描</strong><p>首次进入不会自动扫描。点击“开始扫描”后，页面会展示预算、启发式命中和未评估项。</p></section>}
    {report && <>
      {reportStale && scanning && <div className="usage-refresh-status" role="status">正在刷新 Skill 扫描；下面暂保留上一次可读结果，未用于当前宿主判定。</div>}
      {reportStale && !scanning && (error || unavailable) && <div className="usage-refresh-status trust-refresh-status-error" role="status">本次 Skill 扫描未形成新的可判定结果；以下为上一次结果，未用于当前宿主判定。</div>}
      <section className="skills-summary" aria-label="扫描摘要"><span>{reportStale ? "上一次扫描结果" : `run：${report.run ?? "未知"}`}</span><span>宿主：{report.host_selection}</span><span>{report.hosts.length} 个宿主摘要</span><span>{report.diagnostics.length} 条诊断</span><span>{report.from_cache ? "来自缓存" : reportStale ? "上一份结果" : "本次扫描"}</span></section>
      {diffError && <div className="error-banner" role="alert">{diffError}</div>}
      {diff && <section className="skills-panel" aria-labelledby="skills-diff-title"><div className="section-heading"><div><p className="eyebrow">显式对比</p><h3 id="skills-diff-title">与上次快照的变化</h3></div><span className={`status-pill status-pill-${diff.status === "partial" ? "warning" : "success"}`}>{diff.status === "partial" ? `部分结果 · 丢弃 ${diff.dropped_rows} 条` : "结果完整"}</span></div><p className="skills-note">只展示受控的宿主、Skill 名、规则和计数；不会展示基线路径、文件名、description 或原始命令输出。</p><div className="skills-diff-summary"><span>新增 {diff.summary.added}</span><span>移除 {diff.summary.removed}</span><span>触发变化 {diff.summary.usage_changed}</span><span>新安全命中 {diff.summary.new_security_findings}</span></div>{diff.added_skills.length > 0 && <div className="skills-not-assessed"><strong>新增 Skill</strong>{diff.added_skills.map((item, index) => <p key={`added-${index}`}>＋ {item.host} · {item.name}</p>)}</div>}{diff.removed_skills.length > 0 && <div className="skills-not-assessed"><strong>移除 Skill</strong>{diff.removed_skills.map((item, index) => <p key={`removed-${index}`}>− {item.host} · {item.name}</p>)}</div>}{diff.new_security_findings.length > 0 && <div className="skills-not-assessed"><strong>新增安全规则命中</strong>{diff.new_security_findings.map((item, index) => <p key={`security-${index}`}>{item.skill} · {item.rule} · 第 {item.line} 行</p>)}</div>}</section>}
      <section className="skills-host-grid" aria-label="宿主摘要">{hosts.length ? hosts.map((item) => <article className="skills-host-card" key={item.host}><div className="section-heading"><div><p className="eyebrow">宿主</p><h3>{hostLabel(item.host)}</h3></div><span className="status-pill">{item.trigger_data === "available" ? "有使用证据" : item.trigger_data === "unavailable" ? "无触发数据" : "状态未知"}</span></div><div className="skills-host-metrics"><span>磁盘 {tokensOrDash(item.skills_on_disk)}</span><span>可发现 {tokensOrDash(item.unique_discoverable_skills)}</span><span>运行时核实 {tokensOrDash(item.runtime_verified_loaded_skills)}</span></div>{item.description_budget.available && item.description_budget.budget_chars !== null ? <div className="skills-budget"><div><span>描述预算</span><strong>{item.description_budget.used_chars ?? 0} / {item.description_budget.budget_chars} 字符</strong></div><div className="skills-budget-bar"><span style={{ width: `${Math.max(0, Math.min(100, item.description_budget.pct_used ?? 0))}%` }} /></div><small>{item.description_budget.source ?? "来源未知"}</small></div> : <p className="skills-muted">该宿主没有可用的描述预算。</p>}</article>) : <p className="skills-muted">该宿主没有可显示的摘要；这不等于安全。</p>}</section>
      <section className="skills-panel" aria-labelledby="skills-findings-title"><div className="section-heading"><div><p className="eyebrow">立即处理</p><h3 id="skills-findings-title">启发式命中</h3></div><span className="count-badge">{diagnostics.length}</span></div>{diagnostics.length ? <div className="skills-diagnostic-list">{diagnostics.map((item, index) => <article className="skills-diagnostic" key={`${item.code}-${index}`}><div className="skills-diagnostic-head"><span className={`finding-severity finding-severity-${item.severity === "critical" ? "critical" : "warning"}`}>{severityLabels[item.severity]}</span><strong>{item.code} · {item.name}</strong>{item.skill && <span>{item.skill}</span>}</div>{item.impact && <p>{item.impact}</p>}{item.recommendation && <p>行动：{item.recommendation}</p>}{item.evidence_count > 0 && <small>证据计数：{item.evidence_count}</small>}{item.caveats.map((caveat) => <small className="skills-caveat" key={caveat}>! {caveat}</small>)}</article>)}</div> : <p className="skills-muted">当前没有 critical / warning 命中；启发式扫描不等于安全保证。</p>}</section>
      <section className="skills-panel" aria-labelledby="skills-not-assessed-title"><div className="section-heading"><div><p className="eyebrow">覆盖边界</p><h3 id="skills-not-assessed-title">本次未评估</h3></div><span className="count-badge">{report.not_assessed.length}</span></div>{report.not_assessed.length ? <div className="skills-not-assessed">{report.not_assessed.map((item, index) => <p key={`${item.code}-${index}`}><strong>{item.code} · {item.name}</strong><span>{item.reason}</span></p>)}</div> : <p className="skills-muted">没有额外的未评估项。</p>}<p className="skills-note">当前 React 页面只展示安全聚合；对比和脱敏导出仍保留在旧工作台。快照由你显式保存到本机，不会上传、修改或删除 skill。</p></section>
    </>}
  </>;
}
