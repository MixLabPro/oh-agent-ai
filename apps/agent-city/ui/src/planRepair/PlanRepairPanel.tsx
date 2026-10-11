import { useEffect, useRef, useState } from "react";
import { siteLabel, type RepairTool, type RoadWidth } from "./controller";
import type { PlanRepairUi } from "./usePlanRepair";

const RULE_LABEL: Record<string, string> = {
  buildingOverRoad: "楼压路", buildingOverlap: "楼重叠", buildingOnSlope: "坡地/不可建", orphanedBlock: "街区无路", patchStale: "补丁失效",
};
const SEVERITY_LABEL = { error: "错误", warning: "警告", info: "提示" } as const;
const MAX_ISSUE_ROWS = 8;

const TOOLS: Array<{ id: RepairTool; label: string; key: string; hint: string }> = [
  { id: "build", label: "移楼", key: "V", hint: "仅用于修复生成问题：会话楼由开发商（程序）盖，市长不指定位置。点选会话楼，再点空地块" },
  { id: "draw", label: "画路", key: "R", hint: "点两下画一段路，可连续画" },
  { id: "erase", label: "橡皮擦", key: "E", hint: "点击红色高亮的路段擦掉" },
  { id: "site", label: "设施", key: "S", hint: "编辑公共设施、花园、城区地标、背景楼：搬家或拆除" },
];
const WIDTHS: Array<{ id: RoadWidth; label: string }> = [{ id: 5, label: "小路" }, { id: 8, label: "次干道" }];

/**
 * 规划修复面板（开发预览，仅中文）。未进入修复模式时只显示一个始终可见的入口按钮——
 * 曾把入口放在设置弹窗最底部，小窗口里被挤出可视区，用户根本找不到。
 */
export function PlanRepairPanel({ repair, entryDisabled }: { repair: PlanRepairUi; entryDisabled: boolean }) {
  const { state, info, issues } = repair;
  const [confirmReset, setConfirmReset] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => { if (!state.active) setConfirmReset(false); }, [state.active]);

  if (!repair.enabled) return null;
  if (!state.active) {
    return <button className="city-repair-entry" disabled={entryDisabled} onClick={repair.enter} title="修复规划：移楼、画路、橡皮擦（开发预览）">✎ 修复规划</button>;
  }

  const counts = info.counts;
  const total = counts ? counts.buildingMoves + counts.roadOps + counts.siteOps + counts.suppressedContext : 0;
  // 恢复生成两段确认（同 reseed 的 4 秒确认模式）：误点一次不会丢掉全部修改。
  const onReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      timer.current = window.setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    window.clearTimeout(timer.current); setConfirmReset(false); repair.reset();
  };
  const preview = state.preview;
  const previewReason = preview && "reason" in preview ? preview.reason : null;

  return <section className="city-repair" aria-label="规划修复">
    <header><h2>修复规划 <small>开发预览</small></h2><button onClick={repair.exit} aria-label="退出修复规划">退出</button></header>
    <div className="city-repair-tools" role="toolbar" aria-label="修复工具">
      {TOOLS.map((tool) => <button key={tool.id} className={state.tool === tool.id ? "is-active" : ""} aria-pressed={state.tool === tool.id} title={`${tool.hint}（${tool.key}）`} onClick={() => repair.setTool(tool.id)}>
        {tool.label}<kbd>{tool.key}</kbd>
      </button>)}
    </div>
    {state.tool === "draw" && <div className="city-repair-widths" role="radiogroup" aria-label="路宽">
      {WIDTHS.map((width) => <button key={width.id} role="radio" aria-checked={state.roadWidth === width.id} className={state.roadWidth === width.id ? "is-active" : ""} onClick={() => repair.setRoadWidth(width.id)}>{width.label}</button>)}
    </div>}
    {state.message && <p className={`city-repair-msg city-repair-${state.message.kind}`} role={state.message.kind === "error" ? "alert" : "status"}>{state.message.text}</p>}
    {previewReason && <p className="city-repair-reason">不可行：{previewReason}</p>}
    {state.buildingId && state.tool === "build" && <p className="city-repair-sel">选中：<code>{state.buildingId}</code></p>}
    {state.tool === "site" && state.site && <div className="city-repair-site">
      <span>选中：<b>{siteLabel(state.site)}</b></span>
      <button onClick={repair.removeSelected} title="拆除选中的设施（Delete）">拆除</button>
    </div>}
    {state.tool === "site" && !state.site && state.preview?.kind === "site" && <p className="city-repair-sel">指向：{state.preview.label}（点击选中）</p>}
    <p className="city-repair-status">
      {total === 0 ? "尚无修改" : `${total} 处修改`}
      {counts && total > 0 && `（${[counts.buildingMoves ? `移楼 ${counts.buildingMoves}` : "", counts.roadAdds ? `画路 ${counts.roadAdds}` : "", counts.roadDrops ? `擦路 ${counts.roadDrops}` : "", counts.roadOps - counts.roadAdds - counts.roadDrops > 0 ? `改路口 ${counts.roadOps - counts.roadAdds - counts.roadDrops}` : "", counts.siteOps ? `改设施 ${counts.siteOps}` : ""].filter(Boolean).join(" · ")}）`}
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
    <p className="city-repair-help">V 移楼 · R 画路 · E 橡皮擦 · S 设施 · Delete 拆除 · Esc 逐级取消 · ⌘Z 撤销</p>
  </section>;
}
