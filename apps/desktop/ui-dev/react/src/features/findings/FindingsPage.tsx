import { useEffect, useMemo, useState } from "react";
import { listen, readDecisionMatrix, readFindings, readFindingsFreshness, type DecisionMatrixReport, type FindingGroup, type FindingSample, type FindingsFreshness, type FindingsReport } from "../../lib/tauri";
import { DecisionMatrixSection } from "./DecisionMatrixSection";

type SeverityFilter = "all" | "critical" | "warning" | "info";

const TODO_SOURCE_KINDS = new Set(["billing", "budget", "source"]);
const TODO_RULES = new Set(["PRICE_COVERAGE", "ROUTE_UNCONFIRMED"]);

function timeLabel(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间不可用";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function severityLabel(value: string): string {
  if (value === "critical") return "高风险";
  if (value === "warning") return "需关注";
  if (value === "info") return "信息";
  return value;
}

function severityClass(value: string): string {
  if (value === "critical") return "finding-severity finding-severity-critical";
  if (value === "warning") return "finding-severity finding-severity-warning";
  return "finding-severity";
}

function isTodo(group: FindingGroup): boolean {
  if (group.rule.startsWith("SV6")) return false;
  return TODO_SOURCE_KINDS.has(group.action_kind) || TODO_RULES.has(group.rule);
}

function remedyLabel(group: FindingGroup): string {
  if (group.read_only || group.rule.startsWith("SV6") || group.rule.startsWith("SV7")) return "只读证据，不提供自动修复";
  if (group.rule === "PRICE_COVERAGE") return "需要补充价卡";
  if (group.rule === "ROUTE_UNCONFIRMED") return "需要确认归属";
  if (group.action_kind === "budget") return "需要查看预算归因";
  return "需要在设置中处理";
}

function evidenceLevelLabel(value: FindingSample["evidence_level"]): string {
  return value === "E0" ? "推断" : value === "E1" ? "本地证据" : value === "E2" ? "上传就绪" : value === "E3" ? "网络尝试" : value === "E4" ? "已传输" : value === "E5" ? "远端接收" : "未知";
}

function evidenceStageLabel(value: FindingSample["stage"]): string {
  return value === "read_observed" ? "读取已观察" : value === "package_observed" ? "打包已观察" : value === "credential_observed" ? "凭证已观察" : value === "egress_attempted" ? "出网尝试" : value === "egress_transmitted" ? "出网传输" : value === "remote_accepted" ? "远端已接收" : "未知";
}

function evidenceOriginLabel(value: FindingSample["evidence_origin"]): string {
  return value === "local_artifact" ? "本地落盘" : value === "client_state_claim" ? "客户端状态" : value === "runtime_process_metadata" ? "运行时进程" : value === "network_metadata" ? "网络元数据" : value === "verified_receipt" ? "已验证回执" : value === "unknown_legacy" ? "历史来源" : "未知";
}

function destinationLabel(value: FindingSample["destination_class"]): string {
  return value === "vendor_api" ? "厂商 API" : value === "object_storage" ? "对象存储" : value === "telemetry" ? "遥测" : value === "eval" ? "评测" : value === "model_api" ? "模型 API" : value === "unknown" ? "未知目的地" : "未声明";
}

function sampleTimeLabel(first: number | null, last: number | null): string {
  if (first == null) return "观测时间不可用";
  const start = timeLabel(first);
  return last != null && last !== first ? `${start} 至 ${timeLabel(last)}` : start;
}

function sampleBytes(value: number | null): string {
  if (value == null) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function FindingEvidenceDetail({ sample, index }: { sample: FindingSample; index: number }) {
  return <article className="finding-evidence-detail" aria-label={`脱敏证据 ${index + 1}`}>
    <div className="finding-evidence-detail-header"><strong>脱敏证据 {index + 1}</strong><span className={`status-pill ${sample.has_evidence ? "status-pill-success" : "status-pill-warning"}`}><span aria-hidden="true" className="status-dot" />{sample.has_evidence ? "可用" : "字段不可用"}</span></div>
    <div className="finding-evidence-grid">
      <div><span>观测时间</span><strong>{sampleTimeLabel(sample.observed_first_at_ms, sample.observed_last_at_ms)}</strong></div>
      <div><span>证据等级</span><strong>{sample.evidence_level ? `${sample.evidence_level} · ${evidenceLevelLabel(sample.evidence_level)}` : "未知"}</strong></div>
      <div><span>观测阶段</span><strong>{evidenceStageLabel(sample.stage)}</strong></div>
      <div><span>证据来源</span><strong>{evidenceOriginLabel(sample.evidence_origin)}</strong></div>
      <div><span>作用范围</span><strong>{sample.scope_classes.length ? sample.scope_classes.join("、") : "未声明"}</strong></div>
      <div><span>目的地类别</span><strong>{destinationLabel(sample.destination_class)}</strong></div>
      <div><span>观测计数</span><strong>{sample.observation_count ?? "—"}</strong></div>
      <div><span>文件 / 大小</span><strong>{sample.file_count ?? "—"} / {sampleBytes(sample.byte_count)}</strong></div>
      <div><span>置信度</span><strong>{sample.confidence ?? "未知"}</strong></div>
      <div><span>安全引用</span><code>{sample.reference ?? "不可用"}</code></div>
    </div>
    <p>以上仅为本机脱敏投影；上传尝试不等于远端接收、留存或训练。</p>
  </article>;
}

function freshnessLabel(freshness: FindingsFreshness): string {
  if (freshness.status !== "ok") return "新鲜度不可用：本地数据状态读取失败";
  if (freshness.state === "not_yet_synced") return "新鲜度 · 尚未完成过成功同步，不能判定为数据完整";
  if (freshness.state === "unknown") return "新鲜度未知：本地同步状态没有可判定结果";
  const parts = [];
  if (freshness.syncing) parts.push("同步中");
  if (freshness.last_successful_sync_at) parts.push(`数字截至 ${freshness.last_successful_sync_at}`);
  if (freshness.stale_hosts.length) parts.push(`超过 24h 未更新：${freshness.stale_hosts.join("、")}`);
  return parts.length ? `新鲜度 · ${parts.join(" · ")}` : "新鲜度 · 数据完整";
}

function StatusSummary({ group }: { group: FindingGroup }) {
  const status = group.status_rollup;
  return <div className="finding-status-summary" aria-label="处理状态汇总">
    <span>待处理 {status.open}</span><span>稍后 {status.later}</span><span>已确认 {status.acknowledged}</span>
  </div>;
}

function FindingRow({ group }: { group: FindingGroup }) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = group.sample_evidence.length > 0;
  return <article className="finding-row">
    <div className="finding-row-main">
      <div className="finding-row-title"><strong>{group.rule}</strong><span className={severityClass(group.severity)}>{severityLabel(group.severity)}</span></div>
      <p className="finding-row-subtitle">{group.host} · {group.evidence_class}</p>
      <p className="finding-row-copy">{group.count} 次命中 · {group.sessions_count} 个会话 · {timeLabel(group.first_seen_at_ms)} 至 {timeLabel(group.last_seen_at_ms)}</p>
      <p className="finding-row-copy">{remedyLabel(group)} · {group.sample_evidence.length ? `已有 ${group.sample_evidence.length} 条脱敏证据摘要` : "证据引用不可用"}</p>
      {canExpand && <button className="button button-secondary button-small finding-evidence-toggle" type="button" aria-expanded={expanded} aria-controls={`finding-evidence-${group.group_id.replace(/[^a-z0-9-]/gi, "-")}`} onClick={() => setExpanded((value) => !value)}>{expanded ? "收起证据" : "查看证据"}</button>}
      {expanded && <div className="finding-evidence-details" id={`finding-evidence-${group.group_id.replace(/[^a-z0-9-]/gi, "-")}`}>{group.sample_evidence.map((sample, index) => <FindingEvidenceDetail key={sample.reference ?? index} sample={sample} index={index} />)}</div>}
    </div>
    <div className="finding-row-side"><StatusSummary group={group} />
      {group.manual_follow_up && !group.read_only ? <span className="status-pill status-pill-warning"><span aria-hidden="true" className="status-dot" />需要在设置中处理</span> : <span className="status-pill"><span aria-hidden="true" className="status-dot" />只读证据</span>}
    </div>
  </article>;
}

export function FindingsPage() {
  const [report, setReport] = useState<FindingsReport | null>(null);
  const [freshness, setFreshness] = useState<FindingsFreshness>({ status: "unavailable", state: "unknown", last_successful_sync_at: null, stale_hosts: [], syncing: false });
  const [matrix, setMatrix] = useState<DecisionMatrixReport | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(true);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [loading, setLoading] = useState("正在读取本地发现…");
  const [error, setError] = useState<string | null>(null);
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [rule, setRule] = useState("all");

  const load = () => {
    setLoading("正在读取本地发现投影…");
    setError(null);
    void Promise.all([readFindings(), readFindingsFreshness()])
      .then(([nextReport, nextFreshness]) => { setReport(nextReport); setFreshness(nextFreshness); setLoading(""); })
      .catch((reason: unknown) => { setError(reason instanceof Error ? reason.message : "本地发现暂不可用"); setLoading(""); });
    setMatrixLoading(true);
    setMatrixError(null);
    void readDecisionMatrix()
      .then((nextMatrix) => { setMatrix(nextMatrix); setMatrixLoading(false); })
      .catch((reason: unknown) => { setMatrixError(reason instanceof Error ? reason.message : "本地对比数据暂不可用"); setMatrixLoading(false); });
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let active = true;
    let cleanups: Array<() => void> = [];
    Promise.all(["sync-status-updated", "usage-fold-updated", "trust-monitor-updated"].map((event) => listen(event, () => { if (active) load(); })))
      .then((unsubscribers) => { if (active) cleanups = unsubscribers; else unsubscribers.forEach((unsubscribe) => unsubscribe()); });
    return () => { active = false; cleanups.forEach((unsubscribe) => unsubscribe()); };
  }, []);

  const groups = report?.issues ?? [];
  const todoGroups = useMemo(() => groups.filter(isTodo), [groups]);
  const visibleGroups = useMemo(() => groups.filter((group) => (severity === "all" || group.severity === severity) && (rule === "all" || group.rule === rule)), [groups, rule, severity]);

  return <section className="findings-page" aria-labelledby="findings-page-title">
    <div className="findings-page-header"><div><p className="eyebrow">Findings / 发现证据</p><h2 id="findings-page-title">风险与待办</h2><p className="hero-copy">先看能行动的事，再查看只读证据。没有 Finding 不等于没有行为，只表示当前证据未满足判定条件。</p></div><div className="header-actions"><button className="button button-secondary" type="button" onClick={load} disabled={Boolean(loading)}>重新读取</button></div></div>
    <div className="freshness-bar" role="status">{freshnessLabel(freshness)}</div>
    {loading && <p className="inline-status" role="status">{loading}</p>}
    {error && <div className="error-banner" role="alert">{error} · 当前保留上一次结果</div>}
    {report && <div className="finding-stats" aria-label="发现汇总"><article><span className="eyebrow">发现组</span><strong>{report.totals.issues}</strong><small>{report.totals.sessions} 个受影响会话</small></article><article><span className="eyebrow">高风险</span><strong>{report.totals.critical}</strong><small>需优先查看</small></article><article><span className="eyebrow">待关注</span><strong>{report.totals.warning}</strong><small>可行动或需确认</small></article><article><span className="eyebrow">规则</span><strong>{report.rules.length}</strong><small>本地确定性规则</small></article></div>}
    <section className="finding-section" aria-labelledby="todo-title"><div className="section-heading"><div><p className="eyebrow">行动面</p><h3 id="todo-title">待办</h3></div><span className="count-badge">{todoGroups.length}</span></div>{todoGroups.length ? <div className="finding-list">{todoGroups.map((group) => <FindingRow key={group.group_id} group={group} />)}</div> : <div className="finding-empty"><strong>当前没有可直接处理的待办</strong><p>行为命中不会伪装成任务；它们会保留在下方证据明细中。</p></div>}</section>
    <DecisionMatrixSection report={matrix} loading={matrixLoading} error={matrixError} />
    <section className="finding-section" aria-labelledby="evidence-title"><div className="section-heading"><div><p className="eyebrow">查证面</p><h3 id="evidence-title">证据明细</h3></div><div className="finding-filters"><label>等级<select value={severity} onChange={(event) => setSeverity(event.target.value as SeverityFilter)}><option value="all">全部</option><option value="critical">高风险</option><option value="warning">需关注</option><option value="info">信息</option></select></label><label>规则<select value={rule} onChange={(event) => setRule(event.target.value)}><option value="all">全部规则</option>{(report?.rules ?? []).map((item) => <option key={item.rule} value={item.rule}>{item.rule}</option>)}</select></label></div></div>{visibleGroups.length ? <div className="finding-list">{visibleGroups.map((group) => <FindingRow key={group.group_id} group={group} />)}</div> : <div className="finding-empty"><strong>{report ? "没有符合当前筛选的证据" : "正在准备证据投影"}</strong><p>{report ? "可切换等级或规则筛选；空结果不代表本机安全。" : "前端只展示脱敏后的本地投影。"}</p></div>}</section>
  </section>;
}
