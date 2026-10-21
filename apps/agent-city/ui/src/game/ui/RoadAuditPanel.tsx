import { useState } from "react";
import type { CityEngine } from "../../engine/CityEngine";
import type { RoadAuditSnapshot } from "../useRoadAudit";
import { buildRoadAuditViewRows } from "../RoadAuditView";

export function RoadAuditPanel({ snapshot, run, cancel, engineRef, locale, canRun, close }: {
  snapshot: RoadAuditSnapshot; run: () => void; cancel: () => void;
  engineRef: React.RefObject<CityEngine | null>; locale: "en" | "zh-Hans"; canRun: boolean; close: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(60);
  const en = locale === "en";
  const rows = snapshot.plan ? buildRoadAuditViewRows(snapshot.plan, snapshot.results) : [];
  const locate = (id: string) => {
    const point = rows.find((row) => row.id === id)?.location;
    if (point) engineRef.current?.focusPoint(point.x, point.z);
  };
  const statusText = snapshot.status === "not-run" ? (en ? "Not run" : "未运行")
    : snapshot.status === "capturing" ? (en ? "Freezing displayed city…" : "正在冻结当前城市…")
      : snapshot.status === "running" ? (en ? `Auditing ${snapshot.completed}/${snapshot.total || "…"}` : `审计中 ${snapshot.completed}/${snapshot.total || "…"}`)
        : snapshot.status === "complete" ? (en ? "Complete for this snapshot" : "本次快照已完成")
          : snapshot.status === "stale" ? (en ? "Snapshot changed; results discarded" : "城市快照已变化，结果失效")
            : snapshot.status === "cancelled" ? (en ? "Cancelled" : "已取消")
              : (en ? `Unavailable: ${snapshot.reason ?? "audit failed"}` : `不可用：${snapshot.reason ?? "审计失败"}`);
  return <aside className="city-road-audit" aria-label={en ? "Road audit" : "道路审计"}
    style={{ position: "absolute", zIndex: 10, top: 82, right: 16, width: "min(360px, calc(100% - 32px))",
      maxHeight: "calc(100% - 98px)", overflowY: "auto", padding: 12, border: "1px solid #45617f",
      borderRadius: 10, color: "#edf3fc", background: "rgba(12, 22, 36, 0.94)", backdropFilter: "blur(10px)" }}>
    <header><strong>{en ? "Local road audit" : "本地道路审计"}</strong><span role="status">{statusText}</span></header>
    <div className="city-road-audit-actions">
      <button type="button" onClick={close}>{en ? "Close" : "关闭"}</button>
      <button type="button" disabled={!canRun || snapshot.status === "running" || snapshot.status === "capturing"} onClick={run}>{en ? "Run audit" : "运行审计"}</button>
      {(snapshot.status === "running" || snapshot.status === "capturing") && <button type="button" onClick={cancel}>{en ? "Cancel" : "取消"}</button>}
      {(snapshot.status === "running" || snapshot.status === "complete") && <button type="button" onClick={cancel}>{en ? "Release snapshot" : "释放快照"}</button>}
    </div>
    {snapshot.report && <>
      <p>{snapshot.report.summary}</p>
      <p className="city-road-audit-note">{en ? "This is a diagnostic result for the displayed snapshot. Formal driving admission requires a separate final-boundary replay; this view does not certify the city." : "这是当前显示快照的诊断结果。正式驾驶准入还需要独立的最终边界回放；此页面不代表城市已认证。"}</p>
      {(() => {
        const ranked = [...rows].sort((a, b) => {
          const rank = (status: string) => status === "blocked" ? 0 : status === "inconclusive" ? 1 : status === "excluded" ? 2 : 3;
          return rank(a.status) - rank(b.status) || a.id.localeCompare(b.id);
        });
        const counts = { passed: 0, blocked: 0, inconclusive: 0, excluded: 0 };
        for (const row of rows) counts[row.status] += 1;
        return <>
          <p>{en ? `Passed ${counts.passed} · blocked ${counts.blocked} · no conclusion ${counts.inconclusive} · excluded ${counts.excluded}` : `通过 ${counts.passed} · 阻塞 ${counts.blocked} · 无结论 ${counts.inconclusive} · 排除 ${counts.excluded}`}</p>
          {ranked.slice(0, visibleCount).map((row) => {
        const result = row.result;
        const verdict = row.status;
        const label = verdict === "passed" ? (en ? "Passed" : "通过") : verdict === "blocked" ? (en ? "Blocked" : "阻塞") : verdict === "excluded" ? (en ? "Excluded" : "排除") : (en ? "No conclusion" : "无结论");
        return <details key={row.id} className={`city-road-audit-case is-${verdict}`}>
          <summary><span>{label}</span><code>{row.id}</code><small>{result?.cause ?? row.reason}</small></summary>
          <p>{row.reason}</p>
          {result && <>{result.witness?.kind === "cut" && <p>{en ? "Blocking cut" : "阻断截面"} · {result.witness.layerId} · {result.witness.widest.toFixed(2)} / {result.witness.required.toFixed(2)}</p>}
            {result.witness?.kind === "topology" && <p>{en ? "Disconnected regions" : "不连通区域"} · {result.witness.startRegion} → {result.witness.exitRegion}</p>}
            {result.run?.diagnostic && <p>{result.run.diagnostic.stage}: {result.run.diagnostic.reason} · tick {result.run.diagnostic.tick}</p>}</>}
          {verdict !== "passed" && verdict !== "excluded" && <button type="button" onClick={() => locate(row.id)}>{en ? "Locate on map" : "在地图中定位"}</button>}
        </details>;
          })}
          {ranked.length > visibleCount && <button type="button" onClick={() => setVisibleCount((count) => count + 60)}>{en ? `Show 60 more (${ranked.length - visibleCount} left)` : `再显示 60 项（剩余 ${ranked.length - visibleCount}）`}</button>}
        </>;
      })()}
    </>}
  </aside>;
}
