import { useEffect, useState } from "react";
import {
  auditTrust,
  discoverTrust,
  readTrustMonitorConfig,
  runTrustRuntimeSnapshot,
  saveTrustMonitorConfig,
  type TrustAuditReport,
  type TrustHostCandidate,
  type TrustMonitorConfig,
  type TrustRuntimeSnapshot,
} from "../../lib/tauri";

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

function capabilityLabel(value: TrustMonitorConfig["capability"]): string {
  return { not_started: "尚未采集", available: "可用", partial: "部分覆盖", unavailable: "不可用" }[value];
}

function snapshotCapabilityLabel(value: string): string {
  return value === "macos_lsof_partial" ? "macOS lsof · 部分覆盖" : value === "runtime_sensor_unavailable_on_this_platform" ? "当前平台无运行时传感器" : "传感器不可用";
}

function monitorUpdatedAt(value: number | null): string {
  return value == null ? "尚未写入" : localTime(value);
}

function monitorReasonLabel(value: TrustMonitorConfig["reason"], error: TrustMonitorConfig["last_error_code"] = null): string {
  if (value === "authority_unavailable") return "本地 authority 不可用";
  if (value === "monitor_state_unavailable") return "监测状态尚未初始化";
  return error === "sensor_unavailable" ? "运行时传感器不可用" : error === "snapshot_failed" ? "最近一次快照失败" : error === "sensor_partial" ? "运行时传感器仅部分覆盖" : "状态不可用";
}

export function TrustPage() {
  const [candidates, setCandidates] = useState<TrustHostCandidate[]>([]);
  const [profileErrors, setProfileErrors] = useState<string[]>([]);
  const [selectedHost, setSelectedHost] = useState<string | null>(null);
  const [report, setReport] = useState<TrustAuditReport | null>(null);
  const [loading, setLoading] = useState("正在发现本机宿主…");
  const [error, setError] = useState<string | null>(null);
  const [monitor, setMonitor] = useState<TrustMonitorConfig | null>(null);
  const [monitorDraft, setMonitorDraft] = useState({ enabled: false, interval_seconds: 30, notifications_enabled: false });
  const [monitorLoading, setMonitorLoading] = useState(true);
  const [monitorSaving, setMonitorSaving] = useState(false);
  const [monitorFeedback, setMonitorFeedback] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TrustRuntimeSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const discover = () => {
    setLoading("正在发现本机宿主…");
    setError(null);
    void discoverTrust()
      .then((result) => { setCandidates(result.candidates); setProfileErrors(result.profile_errors); setLoading(""); })
      .catch((reason: unknown) => { setError(errorMessage(reason)); setLoading(""); });
  };

  useEffect(() => { discover(); }, []);

  useEffect(() => {
    let active = true;
    void readTrustMonitorConfig()
      .then((value) => {
        if (!active) return;
        setMonitor(value);
        setMonitorDraft({ enabled: value.enabled, interval_seconds: value.interval_seconds, notifications_enabled: value.notifications_enabled });
      })
      .catch((reason: unknown) => { if (active) setMonitorFeedback(errorMessage(reason)); })
      .finally(() => { if (active) setMonitorLoading(false); });
    return () => { active = false; };
  }, []);

  const saveMonitor = () => {
    setMonitorSaving(true);
    setMonitorFeedback(null);
    void saveTrustMonitorConfig(monitorDraft)
      .then((value) => {
        setMonitor(value);
        setMonitorDraft({ enabled: value.enabled, interval_seconds: value.interval_seconds, notifications_enabled: value.notifications_enabled });
        setMonitorFeedback(value.enabled ? "实时监测已开启；只记录本机脱敏元数据。" : "实时监测已关闭；不会在后台采集。");
      })
      .catch((reason: unknown) => setMonitorFeedback(`保存失败：${errorMessage(reason)}`))
      .finally(() => setMonitorSaving(false));
  };

  const runSnapshot = () => {
    setSnapshotLoading(true);
    setMonitorFeedback(null);
    void runTrustRuntimeSnapshot()
      .then((value) => {
        setSnapshot(value);
        setMonitorFeedback(value.observations > 0
          ? `快照已记录 ${value.observations} 条脱敏证据；这表示尝试链路，不证明已传输。`
          : `本次未形成证据（${snapshotCapabilityLabel(value.capability)}）。`);
      })
      .catch((reason: unknown) => setMonitorFeedback(`快照失败：${errorMessage(reason)}`))
      .finally(() => setSnapshotLoading(false));
  };

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
    <section className="trust-monitor-card" aria-labelledby="trust-monitor-title">
      <div className="trust-card-heading"><div><p className="eyebrow">Runtime monitor</p><h3 id="trust-monitor-title">实时监测控制</h3></div><span className={`status-pill ${monitor?.status === "ok" && monitor.enabled ? "status-pill-success" : monitor?.status === "unavailable" ? "status-pill-warning" : ""}`}><span aria-hidden="true" className="status-dot" />{monitorLoading ? "读取中" : monitor?.status === "unavailable" ? "无法确认状态" : monitor?.enabled ? "已开启" : "默认关闭"}</span></div>
      <p className="monitor-copy">监测只在本机运行，采集进程级类型信号；不会读取文件内容、保存路径或上传网络数据。</p>
      {monitor?.status === "unavailable" && <div className="callout monitor-unavailable" role="status"><strong>监测状态不可用</strong><span>{monitorReasonLabel(monitor.reason, monitor.last_error_code)}；无法确认当前开关，也不会尝试写入设置。</span></div>}
      <div className="monitor-controls">
        <label className="monitor-check"><input aria-describedby="trust-monitor-title" type="checkbox" checked={monitorDraft.enabled} onChange={(event) => setMonitorDraft((current) => ({ ...current, enabled: event.target.checked, notifications_enabled: event.target.checked && current.notifications_enabled }))} disabled={monitorLoading || monitorSaving || monitor?.status !== "ok"} /><span>启用后台监测</span></label>
        <label className="monitor-field"><span>采样间隔</span><select value={monitorDraft.interval_seconds} onChange={(event) => setMonitorDraft((current) => ({ ...current, interval_seconds: Number(event.target.value) }))} disabled={monitorLoading || monitorSaving || monitor?.status !== "ok"}><option value={5}>5 秒</option><option value={10}>10 秒</option><option value={30}>30 秒</option><option value={60}>60 秒</option><option value={300}>5 分钟</option></select></label>
        <label className="monitor-check"><input type="checkbox" checked={monitorDraft.notifications_enabled} onChange={(event) => setMonitorDraft((current) => ({ ...current, notifications_enabled: event.target.checked }))} disabled={!monitorDraft.enabled || monitorLoading || monitorSaving || monitor?.status !== "ok"} /><span>发现新行为链时通知</span></label>
        <button className="button button-primary-small" type="button" onClick={saveMonitor} disabled={monitorLoading || monitorSaving || monitor?.status !== "ok"}>{monitorSaving ? "保存中…" : "保存设置"}</button>
      </div>
      <div className="monitor-meta"><span>能力：{monitor?.status === "ok" ? capabilityLabel(monitor.capability) : "不可观察"}</span><span>最近状态：{monitor?.last_error_code ? monitorReasonLabel(monitor.reason, monitor.last_error_code) : monitor?.status === "ok" ? "无错误" : "不可观察"}</span><span>更新：{monitorUpdatedAt(monitor?.updated_at_ms ?? null)}</span></div>
      <div className="monitor-snapshot">
        <div><strong>一次性进程快照</strong><p>用于立即核对当前是否存在“读 Git 历史 + 写归档/索引”的组合信号。</p></div>
        <button className="button button-secondary" type="button" onClick={runSnapshot} disabled={snapshotLoading}>{snapshotLoading ? "采集中…" : "立即采集快照"}</button>
      </div>
      {snapshot && <div className="snapshot-result" role="status"><strong>{snapshotCapabilityLabel(snapshot.capability)}</strong><span>候选进程 {snapshot.candidate_processes}</span><span>脱敏证据 {snapshot.observations}</span><span>新增 Finding {snapshot.findings_upserted}</span><span>通知候选 {snapshot.notification_candidates}</span></div>}
      {monitorFeedback && <p className="monitor-feedback" role="status">{monitorFeedback}</p>}
    </section>
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
