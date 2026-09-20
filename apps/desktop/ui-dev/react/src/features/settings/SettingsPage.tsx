import { useEffect, useMemo, useState, type FormEvent } from "react";
import { addCustomSourceRoot, listen, pickCustomSourceRoot, readCustomSourceConfig, readSourceHealth, readSyncRequestStatus, removeCustomSourceRoot, setSyncPaused, triggerSync, type CustomSourceReport, type SourceConnectionState, type SourceErrorKind, type SourceHealthReport } from "../../lib/tauri";

const stateLabels: Record<SourceConnectionState, string> = {
  connected: "已连接",
  needs_attention: "需要处理",
  paused: "已暂停",
  excluded: "已停止读取",
  not_detected: "未检测到",
  unknown: "状态未知",
};

const errorLabels: Record<SourceErrorKind, string> = {
  permission_denied: "没有读取权限",
  file_missing: "找不到日志文件",
  all_files_failed: "所有日志文件都读取失败",
  db_error: "本地数据库出错",
  migration_failed: "本地数据库需要迁移",
  read_failed: "读取失败",
};

function observedAt(value: number | null): string {
  if (value === null) return "尚无记录";
  return new Date(value).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function syncLabel(report: SourceHealthReport): string {
  if (report.sync.state === "ok") return report.sync.last_success_at ? `成功 · ${report.sync.last_success_at.slice(0, 16)}` : "成功";
  if (report.sync.state === "never") return "尚未同步";
  if (report.sync.state === "failed") return "部分来源读取失败";
  return "状态暂不可用";
}

function sourceTone(state: SourceConnectionState): "success" | "warning" | "neutral" {
  if (state === "connected") return "success";
  if (state === "needs_attention") return "warning";
  return "neutral";
}

function sourceLabel(host: string): string {
  const labels: Record<string, string> = {
    "claude-code": "Claude Code",
    codex: "Codex",
    dsh: "DeepSeek Harness",
    workbuddy: "WorkBuddy",
  };
  return labels[host] ?? host;
}

function shortenPath(path: string): string {
  if (path.startsWith("~/")) return path;
  const parts = path.split(/[\\/]/u).filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path;
}

function syncActionLabel(state: SourceConnectionState): string | null {
  if (state === "connected") return "同步全部来源";
  if (state === "needs_attention") return "重新同步全部来源";
  if (state === "not_detected") return "扫描全部来源";
  return null;
}

function SourceRow({ source, syncing, onSync }: { source: SourceHealthReport["sources"][number]; syncing: boolean; onSync: () => void }) {
  const errorText = source.error_kinds.map((kind) => errorLabels[kind]).join("、");
  const imported = source.connection_state === "not_detected" && source.sessions === 0 ? "尚未导入" : `${source.sessions} 个会话 · ${source.facts} 条记录`;
  const label = sourceLabel(source.host);
  const actionLabel = syncActionLabel(source.connection_state);
  return <article className="settings-source-row" tabIndex={0} aria-label={`${label}，${stateLabels[source.connection_state]}`}>
    <div className="settings-source-main">
      <div className={`settings-source-dot settings-source-dot-${sourceTone(source.connection_state)}`} aria-hidden="true" />
      <div className="settings-source-copy"><strong>{label}</strong><span>{stateLabels[source.connection_state]}</span></div>
    </div>
    <div className="settings-source-metrics"><span>{imported}</span><span>最近记录：{observedAt(source.last_event_at_ms)}</span>{source.failed_sources > 0 && <span className="settings-source-error">读取失败 · {errorText || "读取失败"}</span>}</div>
    <div className="settings-source-scan">扫描 {source.source_count} 个文件<br /><small>{source.last_scanned_at_ms === null ? "尚未扫描" : `上次扫描 ${observedAt(source.last_scanned_at_ms)}`}</small></div>
    {actionLabel && <button className="button button-secondary button-small settings-source-action" type="button" onClick={onSync} disabled={syncing}>{syncing ? "同步中…" : actionLabel}</button>}
  </article>;
}

type CustomSourceSectionProps = {
  report: CustomSourceReport | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onSync: () => Promise<boolean>;
};

function CustomSourceSection({ report, loading, error, onReload, onSync }: CustomSourceSectionProps) {
  const [host, setHost] = useState<"codex" | "claude-code" | "dsh">("codex");
  const [root, setRoot] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const chooseRoot = async () => {
    setActionError(null);
    try {
      const selected = await pickCustomSourceRoot();
      if (selected) {
        setRoot(selected);
        setMessage("已选择目录，请确认工具后添加。");
      }
    } catch (reason: unknown) {
      setActionError(reason instanceof Error ? reason.message : "无法打开目录选择");
    }
  };

  const addRoot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setActionError(null);
    setMessage(null);
    try {
      const result = await addCustomSourceRoot(host, root.trim());
      setMessage(result.changed ? "目录已保存，正在同步。" : "该目录已在读取范围内，正在重新同步。");
      onReload();
      const synced = await onSync();
      setMessage(synced ? "目录已保存，同步完成。" : "目录已保存，但本次同步未完成；稍后可重新同步。");
    } catch (reason: unknown) {
      setActionError(reason instanceof Error ? reason.message : "添加读取位置失败");
    } finally {
      setSaving(false);
    }
  };

  const removeRoot = async (source: CustomSourceReport["sources"][number]) => {
    if (saving) return;
    setSaving(true);
    setActionError(null);
    setMessage(null);
    try {
      const result = await removeCustomSourceRoot(source.host, source.root);
      setMessage(result.changed ? "已移除读取位置；已导入数据仍保留。" : "该目录已不在读取范围内。");
      onReload();
    } catch (reason: unknown) {
      setActionError(reason instanceof Error ? reason.message : "移除读取位置失败");
    } finally {
      setSaving(false);
    }
  };

  return <section className="settings-custom-section" aria-labelledby="settings-custom-title">
    <div className="settings-section-heading"><div><p className="eyebrow">本机位置</p><h3 id="settings-custom-title">其他读取位置</h3><p>选择包含工具日志的本机文件夹；只会加入本机读取范围。</p></div></div>
    {error && <div className="error-banner" role="alert">读取位置设置暂不可用：{error}<button className="button button-secondary button-small" type="button" onClick={onReload}>重试</button></div>}
    {loading && <div className="settings-source-state" role="status"><strong>正在读取位置配置</strong><span>不会读取目录内容。</span></div>}
    {!loading && !error && report?.status === "unavailable" && <div className="settings-source-state"><strong>读取位置设置暂不可用</strong><span>可以稍后重试；已有来源状态不受影响。</span></div>}
    {!loading && !error && report?.status === "ok" && <>
      <div className="settings-location-list" aria-label="标准读取位置">
        {Object.entries(report.locations).filter(([, path]) => path).map(([locationHost, path]) => <div className="settings-location-row" key={locationHost}><strong>{sourceLabel(locationHost)}</strong><span>{shortenPath(path as string)}</span><details><summary>显示完整路径</summary><code>{path}</code></details></div>)}
      </div>
      <form className="settings-custom-form" onSubmit={addRoot}>
        <label><span>工具</span><select value={host} onChange={(event) => setHost(event.target.value as typeof host)}><option value="codex">Codex</option><option value="claude-code">Claude Code</option><option value="dsh">DeepSeek Harness</option></select></label>
        <label className="settings-custom-path"><span>目录</span><input value={root} onChange={(event) => setRoot(event.target.value)} placeholder="/Volumes/…/sessions" autoComplete="off" /></label>
        <button className="button button-secondary" type="button" onClick={chooseRoot} disabled={saving}>选择文件夹</button>
        <button className="button button-secondary" type="submit" disabled={saving || !root.trim()}>{saving ? "保存中…" : "添加并同步"}</button>
      </form>
      {report.sources.length > 0 && <div className="settings-custom-list" aria-label="已添加读取位置">{report.sources.map((source) => <div className="settings-custom-row" key={`${source.host}:${source.root}`}><div><strong>{sourceLabel(source.host)}</strong><span>{shortenPath(source.root)}</span><details><summary>显示完整路径</summary><code>{source.root}</code></details></div><button className="button button-secondary button-small" type="button" onClick={() => removeRoot(source)} disabled={saving}>移除读取位置</button></div>)}</div>}
      {report.sources.length === 0 && <p className="settings-custom-empty">尚未添加其他读取位置。</p>}
    </>}
    {actionError && <div className="error-banner" role="alert">{actionError}</div>}
    {message && <p className="settings-custom-message" role="status" aria-live="polite">{message}</p>}
  </section>;
}

export function SettingsPage() {
  const [report, setReport] = useState<SourceHealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [customReport, setCustomReport] = useState<CustomSourceReport | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  const [customLoading, setCustomLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pauseSaving, setPauseSaving] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    setError(null);
    void readSourceHealth().then(setReport).catch((reason: unknown) => {
      setReport(null);
      setError(reason instanceof Error ? reason.message : "来源状态读取失败");
    }).finally(() => setLoading(false));
  };

  const refreshCustom = () => {
    setCustomLoading(true);
    setCustomError(null);
    void readCustomSourceConfig().then(setCustomReport).catch((reason: unknown) => {
      setCustomReport(null);
      setCustomError(reason instanceof Error ? reason.message : "自定义来源配置读取失败");
    }).finally(() => setCustomLoading(false));
  };

  const runSync = async (): Promise<boolean> => {
    if (syncing) return false;
    setSyncing(true);
    setError(null);
    setSyncMessage("同步已发起，正在等待本机回执…");
    try {
      const requestId = await triggerSync();
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const status = await readSyncRequestStatus(requestId);
        if (status.failed) throw new Error("同步请求已失效");
        if (status.completed) {
          setSyncMessage("同步完成，来源状态已刷新。");
          refresh();
          return true;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      setSyncMessage("同步仍在后台运行；稍后可重新查看来源状态。");
      return false;
    } catch (reason: unknown) {
      setSyncMessage(null);
      setError(reason instanceof Error ? reason.message : "同步请求未能完成");
      return false;
    } finally {
      setSyncing(false);
    }
  };

  const togglePause = async () => {
    if (pauseSaving || report?.sync.paused === null || report?.sync.paused === undefined) return;
    setPauseSaving(true);
    setError(null);
    try {
      await setSyncPaused(!report.sync.paused);
      setSyncMessage(!report.sync.paused ? "自动同步已暂停。" : "自动同步已恢复。");
      refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "自动同步设置未保存");
    } finally {
      setPauseSaving(false);
    }
  };

  useEffect(() => {
    refresh();
    refreshCustom();
    let active = true;
    let cleanups: Array<() => void> = [];
    Promise.all([listen("sync-status-updated", () => { if (active) { refresh(); refreshCustom(); } }), listen("usage-fold-updated", () => { if (active) { refresh(); refreshCustom(); } })]).then((unsubscribers) => {
      if (active) cleanups = unsubscribers;
      else unsubscribers.forEach((unsubscribe) => unsubscribe());
    });
    return () => { active = false; cleanups.forEach((unsubscribe) => unsubscribe()); };
  }, []);

  const attentionCount = useMemo(() => report?.sources.filter((source) => source.connection_state === "needs_attention").length ?? 0, [report]);

  return <>
    <section className="settings-page-header" aria-labelledby="settings-title">
      <div><p className="eyebrow">本机设置</p><h2 id="settings-title">数据源与本机配置</h2><p className="section-description">先查看数据源是否正常读取；本页只显示安全聚合，不展示绝对路径或原始错误。</p></div>
      <button className="button button-secondary" type="button" onClick={refresh} disabled={loading}>{loading ? "读取中…" : "重载"}</button>
    </section>

    <nav className="settings-section-nav" aria-label="设置分区"><a className="settings-section-nav-active" href="#settings-sources">数据源</a><span>计费与套餐</span><span>预算</span><span>统计与数据</span><span>关于与诊断</span></nav>

    <section className="settings-section" id="settings-sources" aria-labelledby="settings-sources-title">
      <div className="settings-section-heading"><div><p className="eyebrow">数据源</p><h3 id="settings-sources-title">来源健康</h3><p>每个工具独立显示读取状态；来源之间不合并计数。</p></div>{report && <span className={`status-pill status-pill-${attentionCount ? "warning" : "success"}`}>{attentionCount ? `${attentionCount} 个来源需要处理` : "来源状态正常"}</span>}</div>
      {error && <div className="error-banner" role="alert">来源状态暂不可用：{error}<button className="button button-secondary button-small" type="button" onClick={refresh}>重试</button></div>}
      {loading && <div className="settings-source-state" role="status"><strong>正在读取来源状态</strong><span>只查询本机 authority，不会触发同步或读取额外路径。</span></div>}
      {!loading && !error && report?.status === "unavailable" && <div className="settings-source-state"><strong>来源状态暂不可用</strong><span>本地 authority 无法读取；这不是“没有来源”，请修复数据库或重新同步后再试。</span></div>}
      {!loading && !error && report?.status === "ok" && <div className="settings-source-list">{report.sources.length ? report.sources.map((source) => <SourceRow key={source.host} source={source} syncing={syncing} onSync={runSync} />) : <div className="settings-source-state"><strong>没有可显示的来源</strong><span>来源注册表暂未返回任何工具。</span></div>}</div>}
      {report && <div className="settings-sync-summary"><span>上次同步：{syncLabel(report)}</span><span>{report.sync.paused === true ? "自动同步已暂停" : report.sync.paused === false ? "自动同步已开启" : "自动同步状态不可用"}</span>{report.sync.paused !== null && <button className="button button-secondary button-small" type="button" onClick={togglePause} disabled={pauseSaving}>{pauseSaving ? "保存中…" : report.sync.paused ? "恢复自动同步" : "暂停自动同步"}</button>} {syncMessage && <small role="status">{syncMessage}</small>}<small>排除和删除已导入数据仍保留在旧工作台，后续单独验收。</small></div>}
    </section>

    <CustomSourceSection report={customReport} loading={customLoading} error={customError} onReload={refreshCustom} onSync={runSync} />

    <section className="settings-placeholder" aria-label="其他设置迁移状态"><strong>其他设置正在迁移</strong><span>计费与套餐、预算、统计与数据、关于与诊断会继续沿用旧工作台，待各自完成安全 DTO、保存回执和失败恢复后再切换。</span></section>
  </>;
}
