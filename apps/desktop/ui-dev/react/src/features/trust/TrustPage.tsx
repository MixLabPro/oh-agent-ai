import { useEffect, useRef, useState } from "react";
import { ToolbarActions } from "../../components/ui/ToolbarActions";
import {
  auditTrust,
  approveTrustProfile,
  rejectTrustProfile,
  discoverTrust,
  listenAppEvents,
  readTrustProfileStatus,
  readTrustSuppressions,
  readTrustEvidence,
  readTrustMonitorConfig,
  revokeTrustProfile,
  revokeTrustSuppression,
  runTrustRuntimeSnapshot,
  dismissTrustMonitorPrompt, saveTrustMonitorConfig,
  safeUiError,
  type TrustAuditReport,
  type TrustEvidence,
  type TrustHostCandidate,
  type TrustMonitorConfig,
  type TrustRuntimeSnapshot,
  type TrustProfileSummary,
  type TrustProfileStatus,
  type TrustSuppression,
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

function evidenceLevelLabel(level: string): string {
  return ({ E0: "推断", E1: "本地证据", E2: "上传就绪", E3: "网络尝试", E4: "已传输", E5: "远端接收" } as Record<string, string>)[level] ?? "未知等级";
}

function evidenceStageLabel(stage: string): string {
  return ({ read_observed: "读取已观察", package_observed: "打包已观察", credential_observed: "凭证已观察", egress_attempted: "出网尝试", egress_transmitted: "出网传输", remote_accepted: "远端已接收" } as Record<string, string>)[stage] ?? "未知阶段";
}

function evidenceKindLabel(kind: string): string {
  return ({ file_scope: "文件范围", package: "归档/快照", credential: "上传凭证", connection: "连接", outbound_bytes: "出网字节", remote_ack: "远端回执", consent_state: "同意状态", retry: "重试" } as Record<string, string>)[kind] ?? "未知类别";
}

function evidenceOriginLabel(origin: string): string {
  return ({ local_artifact: "本地落盘", client_state_claim: "客户端状态", runtime_process_metadata: "运行时进程", network_metadata: "网络元数据", verified_receipt: "已验证回执", unknown_legacy: "历史来源" } as Record<string, string>)[origin] ?? "未知来源";
}

function destinationLabel(destination: string | null): string {
  return ({ vendor_api: "厂商 API", object_storage: "对象存储", telemetry: "遥测", eval: "评测", model_api: "模型 API", unknown: "未知目的地" } as Record<string, string>)[destination ?? ""] ?? "未声明";
}

function errorMessage(reason: unknown): string {
  return safeUiError(reason, "本地 Trust 数据暂不可用");
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

function rootClassLabel(value: string): string {
  return ({
    git_metadata: "Git 元数据目录线索",
    workspace_or_project: "工作区 / 项目目录线索",
    home_relative_app_data: "用户目录下的应用数据",
    filesystem_root: "文件系统根目录",
    parent_traversal: "包含父目录跳转",
    home_directory: "整个用户目录",
    home_relative: "用户目录内相对路径",
    absolute_home_path: "用户目录内绝对路径",
    absolute_system_path: "用户目录外绝对路径",
    relative_path: "相对工作目录路径",
  } as Record<string, string>)[value] ?? "未知路径类别";
}

function profileApprovalIsSafe(profile: TrustProfileSummary): boolean {
  const source = profile.source_scope_preview;
  const trust = profile.trust_scope_preview;
  if (!source || !trust || !source.roots_count || !trust.roots_count) return false;
  if (source.covers_full_filesystem || source.may_leave_home_directory) return false;
  return source.root_classes.every((item) => ["home_relative", "home_directory", "absolute_home_path"].includes(item))
    && trust.root_classes.every((item) => item === "home_relative_app_data" || item === "workspace_or_project" || item === "git_metadata");
}

function profileScopeText(profile: TrustProfileSummary): string {
  const source = profile.source_scope_preview;
  const trust = profile.trust_scope_preview;
  if (!source || !trust) return "无法生成完整的安全范围预览。";
  const sourceClasses = source.root_classes.map(rootClassLabel).join("、") || "无可识别类别";
  const trustClasses = trust.root_classes.map(rootClassLabel).join("、") || "无可识别类别";
  return `日志来源 ${source.roots_count} 个根目录（${sourceClasses}），${profile.discovery_include_count} 个文件匹配模式；Trust 扫描 ${trust.roots_count} 个根目录（${trustClasses}），${profile.artifact_terms_count} 个文件名词项、${profile.extensions_count} 个扩展名。`;
}

export function TrustPage() {
  const [candidates, setCandidates] = useState<TrustHostCandidate[]>([]);
  const [profileErrors, setProfileErrors] = useState<string[]>([]);
  const [selectedHost, setSelectedHost] = useState<string | null>(null);
  const [report, setReport] = useState<TrustAuditReport | null>(null);
  const [evidenceHistory, setEvidenceHistory] = useState<TrustEvidence[]>([]);
  const [evidenceCursor, setEvidenceCursor] = useState<string | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(true);
  const [evidenceLoadingMore, setEvidenceLoadingMore] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [loading, setLoading] = useState("正在发现本机宿主…");
  const [error, setError] = useState<string | null>(null);
  const [monitor, setMonitor] = useState<TrustMonitorConfig | null>(null);
  const [monitorDraft, setMonitorDraft] = useState({ enabled: false, interval_seconds: 30, notifications_enabled: false });
  const [monitorLoading, setMonitorLoading] = useState(true);
  const [monitorSaving, setMonitorSaving] = useState(false);
  const [monitorFeedback, setMonitorFeedback] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TrustRuntimeSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [expandedEvidence, setExpandedEvidence] = useState<string | null>(null);
  const [auditLoadingHost, setAuditLoadingHost] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<TrustProfileStatus>({ pending: [], approved: [] });
  const [suppressions, setSuppressions] = useState<TrustSuppression[]>([]);
  const [controlsLoading, setControlsLoading] = useState(true);
  const [controlsError, setControlsError] = useState<string | null>(null);
  const [controlsFeedback, setControlsFeedback] = useState<string | null>(null);
  const [profileConfirmation, setProfileConfirmation] = useState<{ action: "approve" | "reject" | "revoke"; slug: string; manifestHash: string } | null>(null);
  const [profileFeedback, setProfileFeedback] = useState<{ section: "pending" | "approved"; error: boolean; message: string } | null>(null);
  const [profileAction, setProfileAction] = useState<string | null>(null);
  const [suppressionAction, setSuppressionAction] = useState<string | null>(null);
  const controlsRequest = useRef(0);
  const auditRequest = useRef(0);
  const evidenceRequest = useRef(0);

  const discover = () => {
    setLoading("正在发现本机宿主…");
    setError(null);
    void discoverTrust()
      .then((result) => { setCandidates(result.candidates); setProfileErrors(result.profile_errors); setLoading(""); })
      .catch((reason: unknown) => { setError(errorMessage(reason)); setLoading(""); });
  };

  const loadTrustControls = async () => {
    const requestId = ++controlsRequest.current;
    setControlsLoading(true);
    setControlsError(null);
    const [profiles, rules] = await Promise.allSettled([readTrustProfileStatus(), readTrustSuppressions()]);
    if (requestId !== controlsRequest.current) return false;
    const errors: string[] = [];
    if (profiles.status === "fulfilled") setProfileStatus(profiles.value);
    else errors.push(safeUiError(profiles.reason, "Profile 授权状态暂不可用"));
    if (rules.status === "fulfilled") setSuppressions(rules.value);
    else errors.push(safeUiError(rules.reason, "Trust 通知抑制状态暂不可用"));
    setControlsError(errors.length ? errors.join("；") : null);
    setControlsLoading(false);
    return profiles.status === "fulfilled";
  };

  const refreshEvidenceHistory = async (cursor: string | null = null, append = false) => {
    const requestId = ++evidenceRequest.current;
    if (append) setEvidenceLoadingMore(true); else setEvidenceLoading(true);
    setEvidenceError(null);
    try {
      const history = await readTrustEvidence(null, 200, cursor);
      if (requestId !== evidenceRequest.current) return;
      setEvidenceHistory((current) => append ? current.concat(history.evidence) : history.evidence);
      setEvidenceCursor(history.next_cursor);
    } catch (reason: unknown) {
      if (requestId === evidenceRequest.current) setEvidenceError(errorMessage(reason));
    } finally {
      if (requestId === evidenceRequest.current) {
        setEvidenceLoading(false);
        setEvidenceLoadingMore(false);
      }
    }
  };

  useEffect(() => { discover(); void loadTrustControls(); void refreshEvidenceHistory(); }, []);

  useEffect(() => () => { controlsRequest.current += 1; }, []);

  const refreshTrustPage = () => {
    discover();
    void loadTrustControls();
  };

  const requestProfileDecision = (profile: TrustProfileSummary, action: "approve" | "reject" | "revoke") => {
    const section = action === "revoke" ? "approved" : "pending";
    if (action === "approve" && !profileApprovalIsSafe(profile)) {
      setProfileFeedback({ section, error: true, message: "该 Profile 的授权范围无法安全预览或超出用户目录；请修正为用户目录内的明确根路径后重新暂存。" });
      return;
    }
    setProfileFeedback(null);
    setProfileConfirmation({ action, slug: profile.slug, manifestHash: profile.manifest_hash });
  };

  const decideProfile = async (profile: TrustProfileSummary, action: "approve" | "reject" | "revoke") => {
    const section = action === "revoke" ? "approved" : "pending";
    if (profileConfirmation?.action !== action || profileConfirmation.slug !== profile.slug || profileConfirmation.manifestHash !== profile.manifest_hash) {
      setProfileFeedback({ section, error: true, message: "清单版本已变化，请刷新授权状态后重新确认。" });
      setProfileConfirmation(null);
      return;
    }
    const actionKey = `${action}:${profile.slug}`;
    setProfileAction(actionKey);
    setProfileConfirmation(null);
    setProfileFeedback({ section, error: false, message: `正在${action === "approve" ? "批准" : action === "reject" ? "拒绝" : "撤销"} ${profile.display_name}…` });
    try {
      if (action === "approve") await approveTrustProfile(profile);
      else if (action === "reject") await rejectTrustProfile(profile);
      else await revokeTrustProfile(profile);
      discover();
      const refreshed = await loadTrustControls();
      setProfileFeedback({ section, error: !refreshed, message: refreshed
        ? `${profile.display_name}：${action === "approve" ? "已批准并启用" : action === "reject" ? "已拒绝" : "已撤销启用；历史证据保留"}。`
        : `${profile.display_name} 的操作已完成，但授权列表刷新失败；请点击“刷新授权状态”核对。` });
    } catch (reason: unknown) {
      setProfileFeedback({ section, error: true, message: `操作未完成：${safeUiError(reason, "本机 Profile 操作失败")}` });
    } finally {
      setProfileAction(null);
    }
  };

  const revokeSuppression = async (suppression: TrustSuppression) => {
    if (!window.confirm(`恢复 ${suppression.issue_type} 的后续系统通知？历史 Finding 不会改变。`)) return;
    setSuppressionAction(suppression.suppression_id);
    setControlsFeedback(null);
    try {
      const status = await revokeTrustSuppression(suppression.suppression_id);
      setControlsFeedback(status === "revoked" ? `${suppression.issue_type} 后续通知已恢复。` : "该通知抑制已不存在；列表已刷新。");
      await loadTrustControls();
    } catch (reason: unknown) {
      setControlsFeedback(`撤销失败：${safeUiError(reason, "Trust 通知设置暂不可用")}`);
    } finally {
      setSuppressionAction(null);
    }
  };

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

  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | null = null;
    void listenAppEvents((event) => {
      if (!active || event.type !== "SourceDataDeleted") return;
      auditRequest.current += 1;
      setReport(() => null);
      setSelectedHost(null);
      setExpandedEvidence(null);
      setAuditLoadingHost(null);
      setMonitorFeedback("来源投影已删除；旧 Trust 报告已清除，请重新发现宿主。");
      setEvidenceHistory([]);
      void refreshEvidenceHistory();
      discover();
    })
      .then((unsubscribe) => { if (active) cleanup = unsubscribe; else unsubscribe(); });
    return () => { active = false; cleanup?.(); };
  }, []);

  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | null = null;
    void listenAppEvents((event) => {
      if (!active || event.type !== "TrustMonitorInvalidated") return;
      setReport(null);
      setSelectedHost(null);
      setExpandedEvidence(null);
      void refreshEvidenceHistory();
      void readTrustMonitorConfig().then((value) => {
        if (!active) return;
        setMonitor(value);
        setMonitorDraft({ enabled: value.enabled, interval_seconds: value.interval_seconds, notifications_enabled: value.notifications_enabled });
        setMonitorFeedback("实时监测状态与历史证据已刷新；历史读取不会重新扫描宿主目录。");
      }).catch(() => undefined);
    }).then((unsubscribe) => { if (active) cleanup = unsubscribe; else unsubscribe(); });
    return () => { active = false; cleanup?.(); };
  }, []);

  // R6a（REFRESH_STORM）：一次性知情询问——仅 enabled_source === 'legacy_default'
  // （迁移前存量库、从未显式选择过）时展示；任何选择都离开该态（开启/保持
  // 关闭 → user，稍后 → dismissed 永不再问）。三要素文案：本机进程观察 /
  // 仅本地存 7 天 / 零网络外发。
  const askEnable = async () => {
    setMonitorSaving(true);
    try {
      const value = await saveTrustMonitorConfig({ enabled: true, interval_seconds: monitorDraft.interval_seconds, notifications_enabled: false });
      setMonitor(value);
      setMonitorDraft({ enabled: value.enabled, interval_seconds: value.interval_seconds, notifications_enabled: value.notifications_enabled });
      setMonitorFeedback(value.enabled ? "后台监测已开启，正在安排首次采样。" : "后台监测已关闭；不会在后台采集。");
    } catch (reason: unknown) { setMonitorFeedback(`保存失败：${errorMessage(reason)}`); }
    finally { setMonitorSaving(false); }
  };
  const askDisable = async () => {
    setMonitorSaving(true);
    try {
      const value = await saveTrustMonitorConfig({ enabled: false, interval_seconds: monitorDraft.interval_seconds, notifications_enabled: false });
      setMonitor(value);
      setMonitorDraft({ enabled: value.enabled, interval_seconds: value.interval_seconds, notifications_enabled: value.notifications_enabled });
      setMonitorFeedback("已保持默认关闭；之后可从下面的开关随时打开。");
    } catch (reason: unknown) { setMonitorFeedback(`保存失败：${errorMessage(reason)}`); }
    finally { setMonitorSaving(false); }
  };
  const askLater = async () => {
    try {
      const value = await dismissTrustMonitorPrompt();
      setMonitor(value);
      setMonitorFeedback("已跳过本次询问，不再自动弹出；可从设置随时开启。");
    } catch (reason: unknown) { setMonitorFeedback(`操作失败：${errorMessage(reason)}`); }
  };

  const saveMonitor = (next: { enabled: boolean; interval_seconds: number; notifications_enabled: boolean }) => {
    if (monitorSaving || monitor?.status !== "ok") return;
    setMonitorDraft(next);
    setMonitorSaving(true);
    setMonitorFeedback("正在应用监测设置…");
    void saveTrustMonitorConfig(next)
      .then((value) => {
        setMonitor(value);
        setMonitorDraft({ enabled: value.enabled, interval_seconds: value.interval_seconds, notifications_enabled: value.notifications_enabled });
        setMonitorFeedback(value.enabled ? "后台监测已开启，正在安排首次采样。" : "后台监测已关闭；不会在后台采集。");
      })
      .catch((reason: unknown) => {
        if (monitor) setMonitorDraft({ enabled: monitor.enabled, interval_seconds: monitor.interval_seconds, notifications_enabled: monitor.notifications_enabled });
        setMonitorFeedback(`保存失败：${errorMessage(reason)}`);
      })
      .finally(() => setMonitorSaving(false));
  };

  const runSnapshot = () => {
    setSnapshotLoading(true);
    setMonitorFeedback(null);
    void runTrustRuntimeSnapshot()
      .then((value) => {
        setSnapshot(value);
        setReport(null);
        setSelectedHost(null);
        void refreshEvidenceHistory();
        setMonitorFeedback(value.observations > 0
          ? `快照已记录 ${value.observations} 条脱敏证据；这表示尝试链路，不证明已传输。`
          : `本次未形成证据（${snapshotCapabilityLabel(value.capability)}）。`);
      })
      .catch((reason: unknown) => setMonitorFeedback(`快照失败：${errorMessage(reason)}`))
      .finally(() => setSnapshotLoading(false));
  };

  const runAudit = (host: string) => {
    const requestId = ++auditRequest.current;
    setSelectedHost(host);
    setExpandedEvidence(null);
    setAuditLoadingHost(host);
    setLoading(`正在读取 ${host} 的本地证据…`);
    setError(null);
    void auditTrust(host)
      .then(async (result) => { if (requestId === auditRequest.current) { setReport(result); setLoading(""); await refreshEvidenceHistory(); } })
      .catch((reason: unknown) => { if (requestId === auditRequest.current) { setError(errorMessage(reason)); setLoading(""); } })
      .finally(() => { if (requestId === auditRequest.current) setAuditLoadingHost(null); });
  };

  const displayedEvidence = report?.evidence ?? evidenceHistory;

  return <section className="trust-page" aria-labelledby="trust-page-title">
    <h2 id="trust-page-title" className="visually-hidden">本地 Agent 出境审计</h2>
    <ToolbarActions>
      <button className="button button-secondary" type="button" onClick={refreshTrustPage} disabled={Boolean(loading) || controlsLoading}>重新发现</button>
    </ToolbarActions>
    {loading && <p className="inline-status" role="status">{loading}</p>}
    {error && <div className="error-banner" role="alert">{error}</div>}
    {auditLoadingHost && report && <div className="trust-refresh-status" role="status">正在刷新 {auditLoadingHost} 的本地证据；下面暂保留上一次可读报告。</div>}
    {!auditLoadingHost && error && report && <div className="trust-refresh-status trust-refresh-status-error" role="status">本次审计未完成；仍展示 {report.host} 上一次已取得的脱敏证据。</div>}
    {profileErrors.length > 0 && <div className="callout"><strong>部分宿主配置不可用</strong><span>{profileErrors.length} 条配置警告不会被当作风险结论。</span></div>}
    <details className="trust-control-disclosure">
      <summary>宿主 Profile 与通知控制 <span>{profileStatus.pending.length} 待批准 · {profileStatus.approved.length} 已启用</span></summary>
    <section className="trust-control-card" aria-labelledby="trust-profile-controls-title">
      <div className="trust-card-heading"><div><p className="eyebrow">本机 UI 授权</p><h3 id="trust-profile-controls-title">宿主 Profile 与通知抑制</h3></div><button className="button button-secondary button-small" type="button" onClick={() => void loadTrustControls()} disabled={controlsLoading || profileAction !== null || suppressionAction !== null}>{controlsLoading ? "读取中…" : "刷新授权状态"}</button></div>
      <p className="trust-control-copy">Agent / MCP 可以暂存 Profile，但不能代替你批准、拒绝或撤销。审批会按清单哈希再次核对；已生成的历史 Trust 证据不会随撤销删除。</p>
      {controlsError && <div className="error-banner" role="alert">{controlsError} · 当前保留上次读取结果</div>}
      {controlsFeedback && <p className="monitor-feedback" role="status">{controlsFeedback}</p>}
      <div className="trust-control-columns">
        <section className="trust-control-group" aria-labelledby="trust-pending-title">
          <div className="trust-control-group-heading"><h4 id="trust-pending-title">待批准 Profile</h4><span className="count-badge">{profileStatus.pending.length}</span></div>
          {profileFeedback?.section === "pending" && <p className={`trust-profile-feedback ${profileFeedback.error ? "trust-profile-feedback-error" : ""}`} role={profileFeedback.error ? "alert" : "status"}>{profileFeedback.message}</p>}
          {profileStatus.pending.length === 0 ? <p className="trust-control-empty">没有待批准的 Profile；这不表示本机 Agent 风险为零。</p> : profileStatus.pending.map((profile) => {
            const canApprove = profile.state === "pending" && profileApprovalIsSafe(profile);
            return <article className={`trust-profile-row ${profile.state === "invalid" ? "trust-profile-row-invalid" : ""}`} key={`${profile.slug}:${profile.manifest_hash}`}>
              <div className="trust-profile-heading"><div><strong>{profile.display_name}</strong><span>{profile.slug} · {profile.state === "invalid" ? "清单无效" : "等待你决定"}</span></div><code title="确认绑定的清单版本">{profile.manifest_hash}</code></div>
              {profile.state === "invalid" ? <p className="trust-profile-warning">该提案无法通过当前 schema 校验。范围不可安全预览；你可以拒绝，但不能批准。</p> : <>
                <p className="trust-profile-scope">日志读取范围：{profile.source_scope_preview ? `${profile.source_scope_preview.roots_count} 个根目录 · ${profile.source_scope_preview.root_classes.map(rootClassLabel).join("、") || "无可识别类别"} · ${profile.discovery_include_count} 个文件匹配模式` : "不可安全预览"}</p>
                <p className="trust-profile-scope">Trust 元数据扫描：{profile.trust_scope_preview ? `${profile.trust_scope_preview.roots_count} 个根目录 · ${profile.trust_scope_preview.root_classes.map(rootClassLabel).join("、") || "无可识别类别"} · ${profile.artifact_terms_count} 个文件名词项 · ${profile.extensions_count} 个扩展名` : "不可安全预览"}</p>
                {(profile.source_scope_preview?.covers_full_filesystem || profile.source_scope_preview?.may_leave_home_directory || profile.source_scope_preview?.may_include_git_metadata || profile.trust_scope_preview?.may_include_git_metadata) && <p className="trust-profile-warning">范围包含文件系统宽路径或 Git 元数据线索。路径名类别不是实际文件清单；请仔细核对授权确认内容。</p>}
                <small className="trust-profile-disclaimer">只显示脱敏路径类别，不显示绝对路径或 manifest 原文；匹配词仅显示数量。范围类别是路径名线索，不证明实际读取了哪些文件。</small>
              </>}
              <div className="trust-profile-actions">
                <button className="button button-primary-small" type="button" onClick={() => requestProfileDecision(profile, "approve")} disabled={!canApprove || profileAction !== null || controlsLoading}>{profileAction === `approve:${profile.slug}` ? "批准中…" : "批准并启用"}</button>
                <button className="button button-secondary button-small" type="button" onClick={() => requestProfileDecision(profile, "reject")} disabled={profileAction !== null || controlsLoading}>{profileAction === `reject:${profile.slug}` ? "拒绝中…" : "拒绝"}</button>
                {!canApprove && profile.state === "pending" && <span className="trust-profile-warning-inline">范围无法安全预览，已禁用批准</span>}
              </div>
              {profileConfirmation?.slug === profile.slug && profileConfirmation.manifestHash === profile.manifest_hash && profileConfirmation.action !== "revoke" && <div className="trust-profile-confirm" role="group" aria-label={`${profile.display_name} 操作确认`}>
                <p><strong>确认{profileConfirmation.action === "approve" ? "批准并启用" : "拒绝"} {profile.display_name}？</strong> {profileConfirmation.action === "approve" ? `${profileScopeText(profile)}批准后该宿主可被本机同步读取。` : "拒绝只移除待批准提案。"}清单版本：{profile.manifest_hash}。</p>
                <div className="trust-profile-actions"><button className="button button-primary-small" type="button" onClick={() => void decideProfile(profile, profileConfirmation.action)} disabled={profileAction !== null || controlsLoading}>确认{profileConfirmation.action === "approve" ? "批准" : "拒绝"}</button><button className="button button-secondary button-small" type="button" onClick={() => { setProfileConfirmation(null); setProfileFeedback({ section: "pending", error: false, message: "已取消；Profile 未改变。" }); }}>取消</button></div>
              </div>}
            </article>;
          })}
        </section>
        <section className="trust-control-group" aria-labelledby="trust-approved-title">
          <div className="trust-control-group-heading"><h4 id="trust-approved-title">已启用 Profile</h4><span className="count-badge">{profileStatus.approved.length}</span></div>
          {profileFeedback?.section === "approved" && <p className={`trust-profile-feedback ${profileFeedback.error ? "trust-profile-feedback-error" : ""}`} role={profileFeedback.error ? "alert" : "status"}>{profileFeedback.message}</p>}
          {profileStatus.approved.length === 0 ? <p className="trust-control-empty">目前没有已启用的动态 Profile。</p> : profileStatus.approved.map((profile) => <article className="trust-profile-row" key={`${profile.slug}:${profile.manifest_hash}`}>
            <div className="trust-profile-heading"><div><strong>{profile.display_name}</strong><span>{profile.slug} · 已启用</span></div><code title="撤销绑定的当前清单版本">{profile.manifest_hash}</code></div>
            <p className="trust-profile-scope">{profileScopeText(profile)}</p>
            {(profile.source_scope_preview?.may_leave_home_directory || profile.source_scope_preview?.may_include_git_metadata || profile.trust_scope_preview?.may_include_git_metadata) && <p className="trust-profile-warning">当前授权涉及宽路径或 Git 元数据线索。</p>}
            <div className="trust-profile-actions"><button className="button button-secondary button-small" type="button" onClick={() => requestProfileDecision(profile, "revoke")} disabled={profileAction !== null || controlsLoading}>{profileAction === `revoke:${profile.slug}` ? "撤销中…" : "撤销启用"}</button></div>
            {profileConfirmation?.action === "revoke" && profileConfirmation.slug === profile.slug && profileConfirmation.manifestHash === profile.manifest_hash && <div className="trust-profile-confirm" role="group" aria-label={`${profile.display_name} 撤销确认`}>
              <p><strong>确认撤销 {profile.display_name}？</strong> 撤销将停用此 Profile，不会删除历史 Trust 证据。清单版本：{profile.manifest_hash}。</p>
              <div className="trust-profile-actions"><button className="button button-primary-small" type="button" onClick={() => void decideProfile(profile, "revoke")} disabled={profileAction !== null || controlsLoading}>确认撤销</button><button className="button button-secondary button-small" type="button" onClick={() => { setProfileConfirmation(null); setProfileFeedback({ section: "approved", error: false, message: "已取消；Profile 仍处于启用状态。" }); }}>取消</button></div>
            </div>}
          </article>)}
        </section>
      </div>
      <section className="trust-control-group trust-suppression-group" aria-labelledby="trust-suppression-title">
        <div className="trust-control-group-heading"><div><h4 id="trust-suppression-title">Trust 通知抑制</h4><p>恢复通知只影响后续提醒，不改变或删除历史 Finding。</p></div><span className="count-badge">{suppressions.length}</span></div>
        {suppressions.length === 0 ? <p className="trust-control-empty">没有已记录的 Trust 通知抑制。</p> : <ul className="trust-suppression-list">{suppressions.map((suppression) => <li key={suppression.suppression_id}>
          <div><strong>{suppression.issue_type}</strong><span>{new Date(suppression.created_at_ms).toLocaleString("zh-CN")} · {suppression.revoked_at_ms === null ? "后续通知已忽略" : "通知已恢复"}</span></div>
          {suppression.revoked_at_ms === null && <button className="button button-secondary button-small" type="button" onClick={() => void revokeSuppression(suppression)} disabled={suppressionAction !== null || controlsLoading}>{suppressionAction === suppression.suppression_id ? "恢复中…" : "恢复通知"}</button>}
        </li>)}</ul>}
      </section>
    </section>
    </details>
    <section className="trust-monitor-card" aria-labelledby="trust-monitor-title">
      <div className="trust-card-heading"><div><p className="eyebrow">Runtime monitor</p><h3 id="trust-monitor-title">实时监测控制</h3></div>
      <span className={`status-pill ${monitor?.status === "ok" && monitor.enabled ? "status-pill-success" : monitor?.status === "unavailable" ? "status-pill-warning" : ""}`}><span aria-hidden="true" className="status-dot" />{monitorLoading ? "读取中" : monitor?.status === "unavailable" ? "无法确认状态" : monitor?.enabled ? "已开启" : "默认关闭"}</span></div>
      {monitor?.status === "ok" && monitor.enabled_source === "legacy_default" && (
        <div className="trust-banner" role="note" data-testid="trust-rollout-ask">
          <p><strong>信任监测可以默认开启。</strong>它观察本机 agent 进程的活动链（git 历史 / 归档写入 / 网络连接），证据仅保存在本机、7 天后自动过期，不上传任何数据。</p>
          <div className="trust-banner-actions">
            <button className="button button-primary-small" type="button" onClick={askEnable} disabled={monitorSaving}>开启</button>
            <button className="button button-secondary" type="button" onClick={askDisable} disabled={monitorSaving}>保持关闭</button>
            <button className="button button-ghost" type="button" onClick={askLater} disabled={monitorSaving}>稍后</button>
          </div>
        </div>
      )}
      <p className="monitor-copy">开启后尽快采集首轮快照，随后结合宿主活动在后台巡检。采样可能错过短暂行为；仅记录本机进程级类型信号，不读取文件内容、保存路径或上传网络数据。</p>
      {monitor?.status === "unavailable" && <div className="callout monitor-unavailable" role="status"><strong>监测状态不可用</strong><span>{monitorReasonLabel(monitor.reason, monitor.last_error_code)}；无法确认当前开关，也不会尝试写入设置。</span></div>}
      <div className="monitor-controls">
        <label className="monitor-check"><input aria-describedby="trust-monitor-title" type="checkbox" checked={monitorDraft.enabled} onChange={(event) => saveMonitor({ ...monitorDraft, enabled: event.target.checked, notifications_enabled: event.target.checked && monitorDraft.notifications_enabled })} disabled={monitorLoading || monitorSaving || monitor?.status !== "ok"} /><span>启用后台监测</span></label>
        <label className="monitor-check"><input type="checkbox" checked={monitorDraft.notifications_enabled} onChange={(event) => saveMonitor({ ...monitorDraft, notifications_enabled: event.target.checked })} disabled={!monitorDraft.enabled || monitorLoading || monitorSaving || monitor?.status !== "ok"} /><span>发现新行为链时通知</span></label>
      </div>
      <div className="monitor-meta"><span>能力：{monitor?.status === "ok" ? monitor.enabled && monitor.capability === "not_started" ? "首次采样中" : capabilityLabel(monitor.capability) : "不可观察"}</span><span>最近状态：{monitor?.last_error_code ? monitorReasonLabel(monitor.reason, monitor.last_error_code) : monitor?.status === "ok" ? "无错误" : "不可观察"}</span><span>更新：{monitorUpdatedAt(monitor?.updated_at_ms ?? null)}</span></div>
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
          <div className="trust-card-heading"><div><p className="eyebrow">{report ? `${report.host} · ${report.host === selectedHost ? "刚完成审计" : "上一次审计结果"}` : "历史本地证据"}</p><h3>{displayedEvidence.length}{evidenceCursor && !report ? "+" : ""} 条证据</h3></div><div className="trust-evidence-actions"><span className={`status-pill ${report ? "status-pill-success" : ""}`}><span aria-hidden="true" className="status-dot" />{report ? "本地结果" : "只读历史"}</span><button className="button button-secondary button-small" type="button" onClick={() => { setReport(null); setSelectedHost(null); void refreshEvidenceHistory(); }} disabled={evidenceLoading}>{evidenceLoading ? "读取中…" : "刷新历史"}</button></div></div>
          {report && <div className="trust-summary"><span>新写入 {report.inserted}</span><span>重复 {report.duplicate}</span><span>Finding 更新 {report.findings_upserted}</span></div>}
          {evidenceError && <div className="error-banner" role="alert">历史证据暂不可用：{evidenceError}</div>}
          {evidenceLoading && <p className="inline-status" role="status">正在读取已保存的本机证据…</p>}
          {!evidenceLoading && displayedEvidence.length === 0 ? <div className="mini-empty">{report ? "没有足够的本地证据形成时间线。当前结果不是“确认安全”。" : "尚无已保存的 Trust 证据。这里不会自动扫描；选择宿主并点击“本地审计”开始采集。"}</div> : <ol className="evidence-timeline">
            {displayedEvidence.map((item, index) => {
              const evidenceKey = `${item.collector_id}-${item.observed_at_ms}-${index}`;
              const isExpanded = expandedEvidence === evidenceKey;
              return <li className="evidence-row" key={evidenceKey}>
              <div className="evidence-marker" aria-hidden="true" />
              <div className="evidence-main"><div className="evidence-title"><strong>{evidenceKindLabel(item.kind)} · {evidenceStageLabel(item.stage)}</strong><div className="evidence-title-actions"><span className={`status-pill ${levelTone(item.evidence_level)}`} title={evidenceLevelLabel(item.evidence_level)}>{item.evidence_level} · {evidenceLevelLabel(item.evidence_level)}</span><button className="button button-secondary button-small evidence-detail-button" type="button" aria-expanded={isExpanded} aria-controls={`trust-evidence-detail-${index}`} onClick={() => setExpandedEvidence(isExpanded ? null : evidenceKey)}>{isExpanded ? "收起明细" : "查看明细"}</button></div></div><p>{localTime(item.observed_at_ms)} · 来源 {evidenceOriginLabel(item.evidence_origin)} · {item.collector_id}</p><p>范围：{item.scope_classes.length ? item.scope_classes.join("、") : "未声明"} · 文件 {item.file_count ?? "—"} · 大小 {bytes(item.byte_count)}</p><p>安全引用：{item.native_event_ref ?? item.workspace_ref ?? "不可用"}</p>
                {isExpanded && <div className="evidence-detail" id={`trust-evidence-detail-${index}`} role="region" aria-label="证据明细"><div><span>判定位置</span><strong>{evidenceStageLabel(item.stage)}</strong></div><div><span>证据来源</span><strong>{evidenceOriginLabel(item.evidence_origin)}</strong></div><div><span>目的地类别</span><strong>{destinationLabel(item.destination_class)}</strong></div><div><span>采集器</span><strong>{item.collector_id}</strong></div><div><span>安全引用</span><code>{item.native_event_ref ?? item.workspace_ref ?? "不可用"}</code></div><p>以上字段是本机脱敏投影；它能说明观察到的行为链，不单独证明内容已经传输或被用于训练。</p></div>}
              </div>
            </li>;
            })}
          </ol>}
          {evidenceCursor && !report && <div className="sessions-more"><button className="button button-secondary" type="button" onClick={() => void refreshEvidenceHistory(evidenceCursor, true)} disabled={evidenceLoadingMore}>{evidenceLoadingMore ? "正在读取更早证据…" : `载入更早证据（已显示 ${evidenceHistory.length} 条）`}</button></div>}

      </section>
    </div>
  </section>;
}
