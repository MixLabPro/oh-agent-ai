import { useEffect, useState } from "react";
import { auditTrust, discoverTrust, type TrustAuditReport, type TrustHostCandidate } from "../../lib/tauri";

function bytes(value: number | null): string {
  if (value == null) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function localTime(value: number): string {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
}

function levelTone(level: string): string {
  return level === "E3" || level === "E4" ? "status-pill-warning" : "";
}

function errorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : "本地 Trust 数据暂不可用";
  return /DTO|格式|字段|引用|计数|schema/i.test(message)
    ? "本地 Trust 数据格式不兼容（schema mismatch），请升级应用或重建投影"
    : message;
}

export function TrustPage() {
  const [candidates, setCandidates] = useState<TrustHostCandidate[]>([]);
  const [profileErrors, setProfileErrors] = useState<string[]>([]);
  const [selectedHost, setSelectedHost] = useState<string | null>(null);
  const [report, setReport] = useState<TrustAuditReport | null>(null);
  const [loading, setLoading] = useState("正在发现本机宿主…");
  const [error, setError] = useState<string | null>(null);

  const discover = () => {
    setLoading("正在发现本机宿主…");
    setError(null);
    void discoverTrust()
      .then((result) => { setCandidates(result.candidates); setProfileErrors(result.profile_errors); setLoading(""); })
      .catch((reason: unknown) => { setError(errorMessage(reason)); setLoading(""); });
  };

  useEffect(() => { discover(); }, []);

  const runAudit = (host: string) => {
    setSelectedHost(host);
    setReport(null);
    setLoading(`正在读取 ${host} 的本地证据…`);
    setError(null);
    void auditTrust(host)
      .then((result) => { setReport(result); setLoading(""); })
      .catch((reason: unknown) => { setError(errorMessage(reason)); setLoading(""); });
  };

  return <section className="trust-page" aria-labelledby="trust-page-title">
    <div className="trust-page-header">
      <div><p className="eyebrow">Trust / 证据链</p><h2 id="trust-page-title">本地 Agent 出境审计</h2><p className="hero-copy">只读发现与审计。前端只接收已脱敏的证据投影，不读取原始工作区。</p></div>
      <button className="button button-secondary" type="button" onClick={discover} disabled={Boolean(loading)}>重新发现</button>
    </div>
    {loading && <p className="inline-status" role="status">{loading}</p>}
    {error && <div className="error-banner" role="alert">{error}</div>}
    {profileErrors.length > 0 && <div className="callout"><strong>部分宿主配置不可用</strong><span>{profileErrors.length} 条配置警告不会被当作风险结论。</span></div>}
    <div className="trust-layout">
      <section className="trust-card" aria-label="发现的本地宿主">
        <div className="trust-card-heading"><div><p className="eyebrow">覆盖面</p><h3>本机宿主</h3></div><span className="count-badge">{candidates.length}</span></div>
        {candidates.length === 0 && !loading ? <div className="mini-empty">尚未发现可审计宿主。没有宿主不等于没有风险，只表示当前覆盖为空。</div> : <div className="host-list">
          {candidates.map((candidate) => <article className={`host-row ${selectedHost === candidate.id ? "host-row-selected" : ""}`} key={candidate.id}>
            <div><strong>{candidate.id}</strong><p>{candidate.detected ? "检测到本地目录" : "未检测到本地目录"} · {candidate.coverage_state}</p></div>
            <button className="button button-primary-small" type="button" disabled={!candidate.detected || !candidate.artifact_profile_available || Boolean(loading)} onClick={() => runAudit(candidate.id)}>{selectedHost === candidate.id && report ? "已完成" : "本地审计"}</button>
          </article>)}
        </div>}
      </section>
      <section className="trust-card" aria-label="Trust 审计结果" aria-live="polite">
        {!report ? <div className="mini-empty"><p className="eyebrow">证据时间线</p><h3>选择宿主开始审计</h3><p>审计只读本机已声明的 profile 路径，并把结果压缩为安全引用、范围、大小与时间。</p></div> : <>
          <div className="trust-card-heading"><div><p className="eyebrow">{report.host} · 审计完成</p><h3>{report.evidence.length} 条证据</h3></div><span className="status-pill status-pill-success"><span aria-hidden="true" className="status-dot" />本地结果</span></div>
          <div className="trust-summary"><span>新写入 {report.inserted}</span><span>重复 {report.duplicate}</span><span>Finding 更新 {report.findings_upserted}</span></div>
          {report.evidence.length === 0 ? <div className="mini-empty">没有足够的本地证据形成时间线。当前结果不是“确认安全”。</div> : <ol className="evidence-timeline">
            {report.evidence.map((item, index) => <li className="evidence-row" key={`${item.collector_id}-${item.observed_at_ms}-${index}`}>
              <div className="evidence-marker" aria-hidden="true" />
              <div className="evidence-main"><div className="evidence-title"><strong>{item.kind} · {item.stage}</strong><span className={`status-pill ${levelTone(item.evidence_level)}`}>{item.evidence_level}</span></div><p>{localTime(item.observed_at_ms)} · 来源 {item.evidence_origin} · {item.collector_id}</p><p>范围：{item.scope_classes.length ? item.scope_classes.join("、") : "未声明"} · 文件 {item.file_count ?? "—"} · 大小 {bytes(item.byte_count)}</p><p>安全引用：{item.native_event_ref ?? item.workspace_ref ?? "不可用"}</p></div>
            </li>)}
          </ol>}
        </>}
      </section>
    </div>
  </section>;
}
