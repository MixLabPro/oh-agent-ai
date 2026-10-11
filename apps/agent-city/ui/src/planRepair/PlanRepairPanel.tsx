import { useEffect, useRef, useState } from "react";
import type { PlanRepairUi } from "./usePlanRepair";

const RULE_LABEL: Record<string, string> = {
  buildingOverRoad: "楼压路", buildingOverlap: "楼重叠", buildingOnSlope: "坡地/不可建", orphanedBlock: "街区无路", patchStale: "补丁失效",
};
const SEVERITY_LABEL = { error: "错误", warning: "警告", info: "提示" } as const;
const MAX_ISSUE_ROWS = 8;

/** 规划修复面板（开发预览，仅中文）：当前步骤提示、反馈消息、补丁状态、撤销/重做/体检/恢复生成。 */
export function PlanRepairPanel({ repair }: { repair: PlanRepairUi }) {
  const { state, info, issues } = repair;
  const [confirmReset, setConfirmReset] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => { if (!state.active) setConfirmReset(false); }, [state.active]);
  if (!state.active) return null;

  const total = info.counts ? info.counts.buildingMoves + info.counts.nodeMoves + info.counts.edgeDrops + info.counts.suppressedContext : 0;
  // 恢复生成两段确认（同 reseed 的 4 秒确认模式）：误点一次不会丢掉全部修改。
  const onReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      timer.current = window.setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    window.clearTimeout(timer.current); setConfirmReset(false); repair.reset();
  };

  return <section className="city-repair" aria-label="规划修复">
    <header><h2>修复规划 <small>开发预览</small></h2><button onClick={repair.exit} aria-label="退出修复规划">退出</button></header>
    {state.message && <p className={`city-repair-msg city-repair-${state.message.kind}`} role={state.message.kind === "error" ? "alert" : "status"}>{state.message.text}</p>}
    {state.buildingId && <p className="city-repair-sel">选中：<code>{state.buildingId}</code></p>}
    <p className="city-repair-status">
      {total === 0 ? "尚无修改" : `${total} 处修改`}
      {info.counts && total > 0 && `（移楼 ${info.counts.buildingMoves}${info.counts.nodeMoves ? ` · 节点 ${info.counts.nodeMoves}` : ""}${info.counts.edgeDrops ? ` · 删路 ${info.counts.edgeDrops}` : ""}）`}
      {info.staleCount > 0 && <span className="city-repair-stale"> · {info.staleCount} 条已失效</span>}
      {total > 0 && <span> · {info.saveFailed ? "本次修改仅临时生效" : "已保存"}</span>}
    </p>
    <div className="city-repair-actions">
      <button onClick={repair.undo} disabled={!info.canUndo}>撤销</button>
      <button onClick={repair.redo} disabled={!info.canRedo}>重做</button>
      <button onClick={issues ? repair.closeAudit : repair.audit}>{issues ? "收起体检" : "体检"}</button>
      <button onClick={onReset} disabled={total === 0 && info.staleCount === 0}>{confirmReset ? "再点一次确认" : "恢复生成"}</button>
    </div>
    {issues && <div className="city-repair-audit">
      {issues.length === 0 ? <p className="city-repair-ok">体检通过：没有发现布局问题</p> : <>
        <p>{issues.length} 个问题{issues.length > MAX_ISSUE_ROWS ? `（显示前 ${MAX_ISSUE_ROWS} 个）` : ""}</p>
        <ul>{issues.slice(0, MAX_ISSUE_ROWS).map((issue) => <li key={issue.id} className={`city-repair-${issue.severity}`}>
          <span><b>{SEVERITY_LABEL[issue.severity]}</b> {RULE_LABEL[issue.rule] ?? issue.rule}：{issue.detail}</span>
          {issue.at && <button onClick={() => repair.locate(issue)}>定位</button>}
        </li>)}</ul>
      </>}
    </div>}
    <p className="city-repair-help">Esc 取消选中 / 退出 · ⌘Z 撤销 · ⇧⌘Z 重做</p>
  </section>;
}
