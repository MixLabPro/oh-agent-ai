import { useRef, useState } from "react";
import { cancelSkillScan, readSkillScan, type SkillScanReport } from "../../lib/tauri";

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
  const cancelRequested = useRef(false);

  const scan = async (force: boolean, selectedHost = host) => {
    if (scanning) return;
    cancelRequested.current = false;
    setScanning(true); setUnavailable(false); setError(null); setMessage(null);
    try { const next = await readSkillScan(selectedHost, force); if (next.status === "unavailable") { setReport(null); setUnavailable(true); setMessage("扫描结果暂不可用；没有把不可用误判成空结果。"); } else { setReport(next); setUnavailable(false); setMessage(next.from_cache ? "已读取本机缓存结果；重新扫描会绕过缓存。" : "扫描完成；结果只来自本机 skill 定义。"); } }
    catch (reason: unknown) { if (cancelRequested.current || reason instanceof Error && reason.message.includes("已取消")) setMessage("扫描已取消；保留上一次结果。"); else setError(reason instanceof Error ? reason.message : "Skill 扫描失败"); }
    finally { setScanning(false); }
  };
  const cancel = async () => {
    if (!scanning) return;
    cancelRequested.current = true;
    try { const result = await cancelSkillScan(); setMessage(result === "cancelled" ? "已请求取消扫描。" : "当前没有可取消的扫描任务。"); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "取消扫描失败"); }
  };
  const hosts = report?.hosts.filter((item) => host === "all" || item.host === host) ?? [];
  const diagnostics = report?.diagnostics.filter((item) => item.severity === "critical" || item.severity === "warning") ?? [];
  return <>
    <section className="skills-page-header" aria-labelledby="skills-title"><div><p className="eyebrow">本机定义 · 启发式审计</p><h2 id="skills-title">Skill 体检</h2><p className="section-description">扫描只在你点击后运行，不会自动修改、禁用或删除 skill；启发式命中需要人工判断。</p></div><div className="skills-toolbar"><label><span>宿主</span><select value={host} onChange={(event) => { const next = event.target.value; setHost(next); if (report && !scanning) void scan(true, next); }} disabled={scanning}><option value="all">全部宿主</option>{Object.entries(hostLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{report && !scanning && <button className="button button-secondary" type="button" onClick={() => void scan(true)}>重新扫描</button>}{!report && !scanning && <button className="button button-secondary" type="button" onClick={() => void scan(true)}>开始扫描</button>}{scanning && <button className="button button-secondary" type="button" onClick={() => void cancel()}>取消扫描</button>}</div></section>
    {error && <div className="error-banner" role="alert">{error}</div>}{scanning && <section className="skills-state" role="status"><strong>正在扫描 Skill 定义…</strong><p>扫描可能需要几秒；不会写入快照或修改 skill 文件。</p></section>}{message && <p className="skills-message" role="status">{message}</p>}
    {unavailable && !scanning && <section className="skills-state" role="status"><strong>扫描结果暂不可用</strong><p>本次没有拿到可判定的本机结果；请检查宿主状态后重试。不可用不等于空结果，也不等于安全。</p></section>}
    {!report && !unavailable && !scanning && !error && <section className="skills-state"><strong>尚未扫描</strong><p>首次进入不会自动扫描。点击“开始扫描”后，页面会展示预算、启发式命中和未评估项。</p></section>}
    {report && !scanning && <>
      <section className="skills-summary" aria-label="扫描摘要"><span>run：{report.run ?? "未知"}</span><span>宿主：{report.host_selection}</span><span>{report.hosts.length} 个宿主摘要</span><span>{report.diagnostics.length} 条诊断</span><span>{report.from_cache ? "来自缓存" : "本次扫描"}</span></section>
      <section className="skills-host-grid" aria-label="宿主摘要">{hosts.length ? hosts.map((item) => <article className="skills-host-card" key={item.host}><div className="section-heading"><div><p className="eyebrow">宿主</p><h3>{hostLabel(item.host)}</h3></div><span className="status-pill">{item.trigger_data === "available" ? "有使用证据" : item.trigger_data === "unavailable" ? "无触发数据" : "状态未知"}</span></div><div className="skills-host-metrics"><span>磁盘 {tokensOrDash(item.skills_on_disk)}</span><span>可发现 {tokensOrDash(item.unique_discoverable_skills)}</span><span>运行时核实 {tokensOrDash(item.runtime_verified_loaded_skills)}</span></div>{item.description_budget.available && item.description_budget.budget_chars !== null ? <div className="skills-budget"><div><span>描述预算</span><strong>{item.description_budget.used_chars ?? 0} / {item.description_budget.budget_chars} 字符</strong></div><div className="skills-budget-bar"><span style={{ width: `${Math.max(0, Math.min(100, item.description_budget.pct_used ?? 0))}%` }} /></div><small>{item.description_budget.source ?? "来源未知"}</small></div> : <p className="skills-muted">该宿主没有可用的描述预算。</p>}</article>) : <p className="skills-muted">该宿主没有可显示的摘要；这不等于安全。</p>}</section>
      <section className="skills-panel" aria-labelledby="skills-findings-title"><div className="section-heading"><div><p className="eyebrow">立即处理</p><h3 id="skills-findings-title">启发式命中</h3></div><span className="count-badge">{diagnostics.length}</span></div>{diagnostics.length ? <div className="skills-diagnostic-list">{diagnostics.map((item, index) => <article className="skills-diagnostic" key={`${item.code}-${index}`}><div className="skills-diagnostic-head"><span className={`finding-severity finding-severity-${item.severity === "critical" ? "critical" : "warning"}`}>{severityLabels[item.severity]}</span><strong>{item.code} · {item.name}</strong>{item.skill && <span>{item.skill}</span>}</div>{item.impact && <p>{item.impact}</p>}{item.recommendation && <p>行动：{item.recommendation}</p>}{item.evidence_count > 0 && <small>证据计数：{item.evidence_count}</small>}{item.caveats.map((caveat) => <small className="skills-caveat" key={caveat}>! {caveat}</small>)}</article>)}</div> : <p className="skills-muted">当前没有 critical / warning 命中；启发式扫描不等于安全保证。</p>}</section>
      <section className="skills-panel" aria-labelledby="skills-not-assessed-title"><div className="section-heading"><div><p className="eyebrow">覆盖边界</p><h3 id="skills-not-assessed-title">本次未评估</h3></div><span className="count-badge">{report.not_assessed.length}</span></div>{report.not_assessed.length ? <div className="skills-not-assessed">{report.not_assessed.map((item, index) => <p key={`${item.code}-${index}`}><strong>{item.code} · {item.name}</strong><span>{item.reason}</span></p>)}</div> : <p className="skills-muted">没有额外的未评估项。</p>}<p className="skills-note">当前 React 页面只展示安全聚合；快照、对比和脱敏导出仍保留在旧工作台，且不会提供删除或禁用按钮。</p></section>
    </>}
  </>;
}
