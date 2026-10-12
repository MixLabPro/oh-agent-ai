import { useEffect, useRef, useState } from "react";
import { siteLabel, type RepairTool, type RoadType } from "./controller";
import type { PlanRepairUi } from "./usePlanRepair";

const RULE_LABEL: Record<string, string> = {
  buildingOverRoad: "楼压路", buildingOverlap: "楼重叠", buildingOnSlope: "坡地/不可建", orphanedBlock: "街区无路", patchStale: "补丁失效",
};
const SEVERITY_LABEL = { error: "错误", warning: "警告", info: "提示" } as const;
const MAX_ISSUE_ROWS = 8;

const TOOLS: Array<{ id: RepairTool; label: string; key: string; hint: string }> = [
  { id: "build", label: "移动", key: "V", hint: "点选任意建筑，再点空地搬过去：会话楼搬到你选的地块，设施、地标、市政用地搬到任意空地" },
  { id: "draw", label: "画路", key: "R", hint: "点两下画一段路，可连续画" },
  { id: "erase", label: "橡皮擦", key: "E", hint: "点击红色高亮的路段擦掉" },
  { id: "restyle", label: "改路", key: "T", hint: "选路型后点一条路：整条街改成这个路型" },
  { id: "node", label: "路口", key: "N", hint: "点一个路口拿起来，再点一下放下：连着的路跟着走" },
  { id: "site", label: "设施", key: "S", hint: "编辑非会话建筑：公共设施、花园、地标、市政用地、背景楼——搬家或拆除" },
];
const ROAD_TYPES: Array<{ id: RoadType; label: string; hint: string }> = [
  { id: "local", label: "小路", hint: "宽 5，街区内的支路" },
  { id: "secondary", label: "次干道", hint: "宽 8" },
  { id: "main", label: "主干道", hint: "宽 12，城市骨架级" },
  { id: "waterfront", label: "滨海大道", hint: "宽 12，沿路向海一侧铺滨海景观带（步道、矮墙、路灯）" },
  { id: "viaduct", label: "高架", hint: "逐点点击画折线，可跨河跨路，两端自动落地成匝道；回车完成" },
];

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
    return <button className="city-repair-entry" disabled={entryDisabled} onClick={repair.enter} title="修复规划：移动建筑、画路、橡皮擦、拖路口（开发预览）">✎ 修复规划</button>;
  }

  const counts = info.counts;
  const total = counts ? counts.buildingMoves + counts.roadOps + counts.highwayOps + counts.siteOps + counts.suppressedContext : 0;
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
  const previewNote = !previewReason && preview && "warning" in preview ? preview.warning : null;

  return <section className="city-repair" aria-label="规划修复">
    <header><h2>修复规划 <small>开发预览</small></h2><button onClick={repair.exit} aria-label="退出修复规划">退出</button></header>
    <div className="city-repair-tools" role="toolbar" aria-label="修复工具">
      {TOOLS.map((tool) => <button key={tool.id} className={state.tool === tool.id ? "is-active" : ""} aria-pressed={state.tool === tool.id} title={`${tool.hint}（${tool.key}）`} onClick={() => repair.setTool(tool.id)}>
        {tool.label}<kbd>{tool.key}</kbd>
      </button>)}
    </div>
    {(state.tool === "draw" || state.tool === "restyle") && <div className="city-repair-widths" role="radiogroup" aria-label="路型">
      {ROAD_TYPES.filter((type) => state.tool === "draw" || type.id !== "viaduct").map((type) => <button key={type.id} role="radio" aria-checked={state.roadType === type.id} title={type.hint} className={state.roadType === type.id ? "is-active" : ""} onClick={() => repair.setRoadType(type.id)}>{type.label}</button>)}
    </div>}
    {state.tool === "draw" && state.roadType === "viaduct" && state.viaduct.length > 0 && <div className="city-repair-site">
      <span>高架已点 {state.viaduct.length} 个点</span>
      <button onClick={repair.finishViaduct} disabled={state.viaduct.length < 2} title="回车">完成</button>
    </div>}
    {info.remap && <div className={`city-repair-banner${info.remap.failed.length ? " city-repair-banner-soft" : " city-repair-banner-ok"}`} role="status">
      <p>城市随会话数增长从第 {info.remap.fromTier} 档变到第 {info.remap.toTier} 档（放大 {info.remap.ratio.toFixed(2)} 倍），
        已把你的 {info.remap.remapped} 处修改搬到新地图上{info.remap.failed.length ? `；${info.remap.failed.length} 处没找到对应位置，已移除（原补丁已存档）` : ""}。</p>
      {info.remap.failed.length > 0 && <ul className="city-repair-remap-failed">{info.remap.failed.slice(0, 5).map((item) => <li key={`${item.kind}:${item.id}`}>{item.detail}</li>)}</ul>}
      <button onClick={repair.dismissRemap}>知道了</button>
    </div>}
    {info.tierChanged ? <div className="city-repair-banner" role="alert">
      <p>城市已随会话数增长扩大了一档，地块和路口都重新排过——之前的 {info.staleCount} 处修改已全部失效，没有显示在地图上。</p>
      <button onClick={repair.pruneStale}>清除失效修改</button>
    </div> : info.staleCount > 0 && <div className="city-repair-banner city-repair-banner-soft">
      <p>{info.staleCount} 处修改已失效（城市重算后对象不在了或位置变了），它们不起作用；点「体检」可逐条查看。</p>
      <button onClick={repair.pruneStale}>清除失效修改</button>
    </div>}
    {state.message && <p className={`city-repair-msg city-repair-${state.message.kind}`} role={state.message.kind === "error" ? "alert" : "status"}>{state.message.text}</p>}
    {previewReason && <p className="city-repair-reason">不可行：{previewReason}</p>}
    {previewNote && <p className="city-repair-note">注意：{previewNote}</p>}
    {state.buildingId && state.tool === "build" && <p className="city-repair-sel">选中：<code>{state.buildingId}</code></p>}
    {state.tool === "site" && state.site && <div className="city-repair-site">
      <span>选中：<b>{siteLabel(state.site)}</b></span>
      {state.site.level === "free" && <span className="city-repair-turn">
        <button onClick={() => repair.rotateSite(-1)} title="逆时针转 90°（[）">↺</button>
        <button onClick={() => repair.rotateSite(1)} title="顺时针转 90°（]）">↻</button>
      </span>}
      <button onClick={repair.removeSelected} title="拆除选中的设施（Delete）">拆除</button>
    </div>}
    {state.tool === "site" && !state.site && state.preview?.kind === "site" && <p className="city-repair-sel">指向：{state.preview.label}（点击选中）</p>}
    {state.stranded.length > 0 && <div className="city-repair-site">
      <span>原址留下 {state.stranded.length} 段断头接入路</span>
      <button onClick={repair.eraseStranded} title="一次擦掉，撤销可恢复">擦掉</button>
    </div>}
    <p className="city-repair-status">
      {total === 0 ? "尚无修改" : `${total} 处修改`}
      {counts && total > 0 && `（${[counts.buildingMoves ? `移楼 ${counts.buildingMoves}` : "", counts.roadAdds ? `画路 ${counts.roadAdds}` : "", counts.roadDrops ? `擦路 ${counts.roadDrops}` : "", counts.highwayOps ? `高架 ${counts.highwayOps}` : "", counts.roadOps - counts.roadAdds - counts.roadDrops > 0 ? `改路口 ${counts.roadOps - counts.roadAdds - counts.roadDrops}` : "", counts.siteOps ? `改设施 ${counts.siteOps}` : ""].filter(Boolean).join(" · ")}）`}
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
    <p className="city-repair-help">V 移动 · R 画路 · E 橡皮擦 · N 路口 · S 设施 · [ ] 转向 · Delete 拆除 · Esc 逐级取消 · ⌘Z 撤销</p>
  </section>;
}
