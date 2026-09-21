import { useEffect, useMemo, useRef, useState } from "react";
import { readRouteQuality, safeUiError, type RouteQualityFamily, type RouteQualityHost, type RouteQualityReport } from "../../lib/tauri";

const windows: Array<{ value: 30 | 90 | 365; label: string }> = [
  { value: 30, label: "近 30 天" },
  { value: 90, label: "近 90 天" },
  { value: 365, label: "近 1 年" },
];

const familyLabels: Record<RouteQualityFamily["family"], string> = {
  anthropic: "Claude 系",
  openai: "GPT 系",
  deepseek: "DeepSeek",
  glm: "GLM",
  minimax: "MiniMax",
  gemini: "Gemini",
  qwen: "Qwen",
  synthetic: "API 错误占位",
  unknown: "未识别",
};

const flagLabels: Record<RouteQualityFamily["flag"], string> = {
  native: "官方模型族",
  non_native: "非官方模型族",
  api_error: "API 错误",
  no_baseline: "无官方基准",
};

function compact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function observedAt(value: number): string {
  if (!value) return "时间不可用";
  return new Date(value).toLocaleString([], { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function reportWindow(report: RouteQualityReport): string {
  return `${observedAt(report.since_ms)} 至 ${observedAt(report.now_ms)}`;
}

function familyTone(family: RouteQualityFamily["flag"]): "success" | "warning" | "neutral" {
  if (family === "non_native" || family === "api_error") return "warning";
  if (family === "native") return "success";
  return "neutral";
}

function hostSummary(host: RouteQualityHost): { title: string; copy: string; tone: "success" | "warning" | "neutral" } {
  const nonNative = host.families.filter((family) => family.flag === "non_native");
  const apiErrors = host.families.find((family) => family.flag === "api_error");
  if (!host.has_baseline) return { title: "没有官方基准", copy: "只展示实际响应里的模型族分布，不把未知宿主误判为正常或异常。", tone: "neutral" };
  if (nonNative.length) {
    const share = nonNative.reduce((sum, family) => sum + family.request_share, 0);
    return { title: `${share.toFixed(1)}% 请求落在非官方模型族`, copy: "这是协议响应模型族与宿主官方基准不一致的被动证据；不是主动探针结论。", tone: "warning" };
  }
  if (apiErrors && apiErrors.requests > 0) return { title: "身份未见偏离，但存在 API 错误", copy: "失败占位单列展示，不计入模型身份判定。", tone: "warning" };
  return { title: "全部请求在官方模型族内", copy: "仅覆盖已入库的模型身份；不覆盖 effort、thinking 或上下文窗口等行为信号。", tone: "success" };
}

function FamilyRow({ family }: { family: RouteQualityFamily }) {
  const models = family.models.slice().sort((left, right) => right.requests - left.requests).slice(0, 3);
  return <tr>
    <td><strong>{familyLabels[family.family]}</strong><small>{family.family}</small></td>
    <td><span className={`test-quality-flag test-quality-flag-${familyTone(family.flag)}`}>{flagLabels[family.flag]}</span></td>
    <td><strong>{family.request_share.toFixed(1)}%</strong><small>{family.requests} 请求</small></td>
    <td><strong>{family.sessions}</strong><small>{compact(family.tokens_total)} tokens</small></td>
    <td><div className="test-quality-models">{models.length ? models.map((model) => <span key={model.model}><code>{model.model}</code><small>{model.requests} 请求</small></span>) : <span>模型明细不可用</span>}</div></td>
    <td className="test-quality-time">{observedAt(family.last_event_ms)}</td>
  </tr>;
}

function HostQualityPanel({ host }: { host: RouteQualityHost }) {
  const summary = hostSummary(host);
  return <section className="test-quality-host" aria-labelledby={`test-host-${host.host}`}>
    <div className="test-quality-host-heading">
      <div><p className="eyebrow">宿主 × 实际模型</p><h3 id={`test-host-${host.host}`}>{host.host}</h3><p>{host.totals.requests} 请求 · {host.totals.sessions} 会话</p></div>
      <span className={`status-pill status-pill-${summary.tone}`}>{summary.title}</span>
    </div>
    <div className={`test-quality-notice test-quality-notice-${summary.tone}`}>
      <strong>{summary.title}</strong><span>{summary.copy}</span>
    </div>
    <div className="test-quality-table-wrap"><table className="test-quality-table"><thead><tr><th scope="col">模型族</th><th scope="col">判定</th><th scope="col">请求占比</th><th scope="col">会话 / tokens</th><th scope="col">实际模型（最多 3 个）</th><th scope="col">最近活跃</th></tr></thead><tbody>{host.families.map((family) => <FamilyRow key={`${host.host}-${family.family}`} family={family} />)}</tbody></table></div>
  </section>;
}

export function TestPage() {
  const [days, setDays] = useState<30 | 90 | 365>(90);
  const [report, setReport] = useState<RouteQualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const refresh = () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    void readRouteQuality(days).then((next) => {
      if (current !== generation.current) return;
      setReport(next);
    }).catch((reason: unknown) => {
      if (current !== generation.current) return;
      setError(safeUiError(reason, "路线质量报告暂不可用"));
    }).finally(() => {
      if (current === generation.current) setLoading(false);
    });
  };

  useEffect(() => { refresh(); }, [days]);

  const totals = useMemo(() => {
    const hosts = report?.hosts ?? [];
    return hosts.reduce((acc, host) => {
      acc.requests += host.totals.requests;
      acc.sessions += host.totals.sessions;
      acc.nonNative += host.families.filter((family) => family.flag === "non_native").reduce((sum, family) => sum + family.requests, 0);
      acc.apiErrors += host.families.filter((family) => family.flag === "api_error").reduce((sum, family) => sum + family.requests, 0);
      return acc;
    }, { requests: 0, sessions: 0, nonNative: 0, apiErrors: 0 });
  }, [report]);

  return <>
    <section className="test-page-header">
      <div><p className="eyebrow">被动路线质量</p><h2>测试</h2><p className="section-description">从已记录的协议响应中核对“宿主 × 实际模型族”。这页不会发起真实请求，也不会读取凭据。</p></div>
      <div className="test-header-actions"><label className="test-window-field"><span>统计窗口</span><select value={days} onChange={(event) => setDays(Number(event.target.value) as 30 | 90 | 365)}>{windows.map((window) => <option key={window.value} value={window.value}>{window.label}</option>)}</select></label><button className="button button-secondary" type="button" onClick={refresh} disabled={loading}>{loading ? "读取中…" : "重载"}</button></div>
    </section>

    <section className="test-evidence-callout" aria-label="测试页证据边界">
      <div><p className="eyebrow">证据边界</p><h3>先看已经发生的请求，再决定是否做主动探针</h3><p>判定依据是宿主日志中协议响应返回的实际模型串；模型族与官方基准不一致时，只报告“非官方模型族”证据，不直接断言偷换或训练。主动 L0/L1 探针仍在旧工作台的高级区，需单独确认成本与凭据授权。</p></div>
      <span className="status-pill status-pill-success"><span aria-hidden="true" className="status-dot" />只读 · 不发请求</span>
    </section>

    <section className="test-summary-grid" aria-label="路线质量摘要">
      <article><span>覆盖宿主</span><strong>{report ? report.hosts.length : "—"}</strong><small>窗口内有记录的宿主</small></article>
      <article><span>请求</span><strong>{report ? totals.requests : "—"}</strong><small>协议响应事实</small></article>
      <article><span>非官方族请求</span><strong className={totals.nonNative ? "test-value-warning" : ""}>{report ? totals.nonNative : "—"}</strong><small>仅在有基准时判定</small></article>
      <article><span>API 错误</span><strong className={totals.apiErrors ? "test-value-warning" : ""}>{report ? totals.apiErrors : "—"}</strong><small>不计入身份判定</small></article>
    </section>

    {error && <div className="error-banner" role="alert">路线质量报告不可用：{error}<button className="button button-secondary button-small" type="button" onClick={refresh}>重试</button></div>}
    {loading && report && <div className="usage-refresh-status" role="status">正在刷新 {windows.find((window) => window.value === days)?.label} 路线质量；下面暂保留上一次可读报告（报告窗口：{reportWindow(report)}）。</div>}
    {!loading && error && report && <div className="usage-refresh-status trust-refresh-status-error" role="status">本次刷新未完成；仍展示上一次路线质量结果（报告窗口：{reportWindow(report)}）。</div>}
    {loading && !report && <section className="test-state" role="status"><strong>正在读取路线质量</strong><p>只查询本机 authority 的安全聚合，不会上传数据或发起模型请求。</p></section>}
    {!loading && !error && report && report.hosts.length === 0 && <section className="test-state"><strong>窗口内没有路线质量事实</strong><p>先完成一次本地同步，再回到这里查看协议响应中的实际模型族。没有事实不等于没有异常。</p></section>}
    {report && report.hosts.length > 0 && <div className="test-quality-list" aria-label={loading || error ? "上一次路线质量结果" : "路线质量结果"} aria-busy={loading || undefined}>{report.hosts.map((host) => <HostQualityPanel key={host.host} host={host} />)}</div>}
    <p className="test-quality-foot">当前选择：{windows.find((window) => window.value === days)?.label} · {report ? `报告窗口：${reportWindow(report)}` : "尚未读取"} · 质量分析不覆盖 thinking、effort、上下文窗口或网络时延。</p>
  </>;
}
