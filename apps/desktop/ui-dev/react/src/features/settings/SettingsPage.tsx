import { useEffect, useMemo, useState } from "react";
import { listen, readSourceHealth, type SourceConnectionState, type SourceErrorKind, type SourceHealthReport } from "../../lib/tauri";

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

function SourceRow({ source }: { source: SourceHealthReport["sources"][number] }) {
  const errorText = source.error_kinds.map((kind) => errorLabels[kind]).join("、");
  const imported = source.connection_state === "not_detected" && source.sessions === 0 ? "尚未导入" : `${source.sessions} 个会话 · ${source.facts} 条记录`;
  const label = sourceLabel(source.host);
  return <article className="settings-source-row" tabIndex={0} aria-label={`${label}，${stateLabels[source.connection_state]}`}>
    <div className="settings-source-main">
      <div className={`settings-source-dot settings-source-dot-${sourceTone(source.connection_state)}`} aria-hidden="true" />
      <div className="settings-source-copy"><strong>{label}</strong><span>{stateLabels[source.connection_state]}</span></div>
    </div>
    <div className="settings-source-metrics"><span>{imported}</span><span>最近记录：{observedAt(source.last_event_at_ms)}</span>{source.failed_sources > 0 && <span className="settings-source-error">读取失败 · {errorText || "读取失败"}</span>}</div>
    <div className="settings-source-scan">扫描 {source.source_count} 个文件<br /><small>{source.last_scanned_at_ms === null ? "尚未扫描" : `上次扫描 ${observedAt(source.last_scanned_at_ms)}`}</small></div>
  </article>;
}

export function SettingsPage() {
  const [report, setReport] = useState<SourceHealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    setError(null);
    void readSourceHealth().then(setReport).catch((reason: unknown) => {
      setReport(null);
      setError(reason instanceof Error ? reason.message : "来源状态读取失败");
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    let active = true;
    let cleanups: Array<() => void> = [];
    Promise.all([listen("sync-status-updated", () => { if (active) refresh(); }), listen("usage-fold-updated", () => { if (active) refresh(); })]).then((unsubscribers) => {
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
      {!loading && !error && report?.status === "ok" && <div className="settings-source-list">{report.sources.length ? report.sources.map((source) => <SourceRow key={source.host} source={source} />) : <div className="settings-source-state"><strong>没有可显示的来源</strong><span>来源注册表暂未返回任何工具。</span></div>}</div>}
      {report && <div className="settings-sync-summary"><span>上次同步：{syncLabel(report)}</span><span>{report.sync.paused === true ? "自动同步已暂停" : report.sync.paused === false ? "自动同步已开启" : "自动同步状态不可用"}</span><small>本轮只读；暂停、恢复、排除和删除将在后续设置切片中单独验收。</small></div>}
    </section>

    <section className="settings-placeholder" aria-label="其他设置迁移状态"><strong>其他设置正在迁移</strong><span>计费与套餐、预算、统计与数据、关于与诊断会继续沿用旧工作台，待各自完成安全 DTO、保存回执和失败恢复后再切换。</span></section>
  </>;
}
