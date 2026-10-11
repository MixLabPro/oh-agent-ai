/**
 * 规划修复模式的 React 胶水：会话（加载/保存补丁）+ 状态机 + 引擎钩子 + 叠加层 + 键盘 + 光标。
 *
 * 开发开关（planDevEnabled）未开启时本 hook 什么都不做：不读存档、不挂 window、不碰引擎。
 * 与游戏/航拍/导出互斥（SPEC §8）：`blocked` 变真即退出修复模式，进入也被拒。
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { CityModel } from "../cityModel";
import type { CityEngine } from "../engine/CityEngine";
import type { PlanIssue } from "../engine/planAudit";
import { RepairController, type RepairState, type RepairTool, type RoadWidth } from "./controller";
import { ParcelOverlay, type OverlayMarker, type OverlayRibbon, type OverlaySiteMark } from "./overlay";
import { installPlanRepairDebug, planDevEnabled, type PlanRepairSession } from "./session";

export type RepairInfo = {
  counts: { buildingMoves: number; roadOps: number; roadAdds: number; roadDrops: number; siteOps: number; suppressedContext: number } | null;
  staleCount: number;
  canUndo: boolean;
  canRedo: boolean;
  saveFailed: boolean;
};

const INACTIVE: RepairState = { active: false, tool: "build", buildingId: null, candidates: [], site: null, siteTargets: [], drawStart: null, roadWidth: 5, preview: null, message: null };
const NO_INFO: RepairInfo = { counts: null, staleCount: 0, canUndo: false, canRedo: false, saveFailed: false };

export function usePlanRepair(engine: RefObject<CityEngine | null>, options: { seed: number; model: CityModel | null; blocked: boolean }) {
  const enabled = planDevEnabled();
  const installed = useRef<ReturnType<typeof installPlanRepairDebug> | null>(null);
  const controllerRef = useRef<RepairController | null>(null);
  const overlayRef = useRef<ParcelOverlay | null>(null);
  const loadedSeed = useRef<number | null>(null);
  const auditOpen = useRef(false);
  const [state, setState] = useState<RepairState>(INACTIVE);
  const [info, setInfo] = useState<RepairInfo>(NO_INFO);
  const [issues, setIssues] = useState<PlanIssue[] | null>(null);

  const syncInfo = useCallback(() => {
    const session = installed.current?.session;
    if (!session) return;
    const status = session.status();
    setInfo({ counts: status.counts, staleCount: status.stale.length, canUndo: status.canUndo, canRedo: status.canRedo, saveFailed: status.saveFailed });
    if (auditOpen.current) setIssues(session.audit());
  }, []);

  /** 会话与控制器按需建一次（StrictMode 的 挂载→卸载→再挂载 会销毁，故每次进入前检查）。 */
  const ensure = useCallback((): { session: PlanRepairSession; controller: RepairController } | null => {
    const current = engine.current;
    if (!enabled || !current) return null;
    if (!installed.current) installed.current = installPlanRepairDebug(current);
    const session = installed.current.session;
    if (!controllerRef.current) {
      const controller = new RepairController({
        isSessionBuilding: (id) => session.parcelOf(id) !== null,
        candidates: (id) => session.candidates(id, 40),
        nearestParcel: (x, z) => session.nearestParcel(x, z),
        parcelOf: (id) => session.parcelOf(id),
        moveBuilding: (id, parcelId) => session.moveBuilding(id, parcelId),
        setSelected: (id) => current.setSelected(id),
        snap: (x, z) => session.snap(x, z),
        edgeAt: (x, z) => session.edgeAt(x, z),
        validateAdd: (from, to, width) => session.validateAdd(from, to, width),
        addRoad: (from, to, width) => session.addRoad(from, to, width),
        validateDrop: (id) => session.validateDrop(id),
        dropEdge: (id) => session.dropEdge(id),
        pickSite: (ray) => session.pickSite(ray),
        siteById: (id) => session.siteById(id),
        siteTargets: (site) => session.siteTargets(site),
        siteTargetAt: (site, x, z) => session.siteTargetAt(site, x, z),
        moveSite: (site, targetId) => session.moveSite(site, targetId),
        removeSite: (site) => session.removeSite(site),
      });
      controller.subscribe((next) => { setState(next); syncInfo(); }); // 点击触发的编辑也要同步补丁计数/撤销态
      controllerRef.current = controller;
    }
    return { session, controller: controllerRef.current };
  }, [enabled, engine, syncInfo]);

  // 种子/模型变化：读该种子的补丁交给引擎；换种子退出修复模式（候选与选中都属于旧城）。
  useEffect(() => {
    if (!enabled) return;
    const ready = ensure(); if (!ready) return;
    if (loadedSeed.current !== options.seed) {
      loadedSeed.current = options.seed;
      controllerRef.current?.exit();
      void ready.session.load(options.seed).then(() => { controllerRef.current?.refresh(); syncInfo(); });
    }
  }, [options.seed, options.model, enabled]);

  // 数据刷新（模型重算）后：选中的楼可能没了、候选/预览可能变了。
  useEffect(() => { controllerRef.current?.refresh(); syncInfo(); }, [options.model]);

  // 互斥：游戏/航拍/导出/忙碌时退出。
  useEffect(() => { if (options.blocked) controllerRef.current?.exit(); }, [options.blocked]);

  // 模式开关 → 引擎钩子 + 叠加层 + 键盘；退出时全部撤回。
  useEffect(() => {
    if (!state.active) return;
    const current = engine.current; const controller = controllerRef.current;
    if (!current || !controller) return;
    const overlay = new ParcelOverlay();
    current.addOverlay(overlay.group);
    current.setRepairHook({ onClick: (click) => controller.click(click), onMove: (ground, ray) => controller.hover(ground, ray) });
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      if (event.key === "Escape") { event.preventDefault(); controller.cancel(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        const session = installed.current?.session; if (!session) return;
        if (event.shiftKey ? session.redo() : session.undo()) { controller.refresh({ kind: "ok", text: event.shiftKey ? "已重做" : "已撤销" }); syncInfo(); }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if ((event.key === "Delete" || event.key === "Backspace") && controller.snapshot.tool === "site" && controller.snapshot.site) { event.preventDefault(); controller.removeSelected(); syncInfo(); return; }
      const tool: Record<string, RepairTool> = { v: "build", r: "draw", e: "erase", s: "site" };
      if (tool[event.key.toLowerCase()]) { event.preventDefault(); controller.setTool(tool[event.key.toLowerCase()]); }
    };
    window.addEventListener("keydown", onKey);
    overlayRef.current = overlay;
    return () => {
      window.removeEventListener("keydown", onKey);
      current.setRepairHook(null);
      current.setCursor("");
      current.removeOverlay(overlay.group);
      overlay.dispose();
      overlayRef.current = null;
    };
  }, [state.active]);

  // 工具 → 光标：画路/橡皮擦用十字，选择用默认。
  useEffect(() => { if (state.active) engine.current?.setCursor(state.tool === "build" ? "" : "crosshair"); }, [state.active, state.tool]);

  // 候选 / 预览 / 起点变化 → 刷新叠加层（贴在地形高度上）。
  useEffect(() => {
    const overlay = overlayRef.current; const layout = engine.current?.currentLayout;
    if (!overlay || !layout) return;
    const heightAt = (x: number, z: number) => layout.terrain.height(x, z);
    // 绿色目标：移楼工具看候选地块，设施工具看合法的空街区/空地块。
    const targets = state.tool === "site" ? state.siteTargets : state.candidates.map((candidate) => ({ x: candidate.x, z: candidate.z, yaw: candidate.yaw, width: candidate.width, depth: candidate.depth }));
    overlay.setParcels(targets.map((target) => ({
      x: target.x, z: target.z, y: Math.max(0, heightAt(target.x, target.z)),
      yaw: target.yaw, width: target.width, depth: target.depth,
    })));
    const marks: OverlaySiteMark[] = [];
    if (state.preview?.kind === "site") marks.push({ ...state.preview.rect, y: Math.max(0, heightAt(state.preview.rect.x, state.preview.rect.z)), tone: "hover" });
    if (state.site) marks.push({ x: state.site.x, z: state.site.z, yaw: state.site.yaw, width: state.site.width, depth: state.site.depth, y: Math.max(0, heightAt(state.site.x, state.site.z)), tone: "selected" });
    overlay.setSiteMarks(marks);
    const ribbons: OverlayRibbon[] = []; const markers: OverlayMarker[] = [];
    const { preview, drawStart } = state;
    if (preview?.kind === "erase") ribbons.push({ points: preview.points, width: preview.width, tone: preview.ok ? "erase" : "erase-blocked" });
    if (preview?.kind === "draw") { ribbons.push({ points: [preview.from, preview.to], width: preview.width, tone: preview.ok ? "draw" : "draw-blocked" }); markers.push({ ...preview.to, tone: preview.ok ? "snap" : "snap-blocked" }); }
    if (preview?.kind === "snap") markers.push({ ...preview.at, tone: preview.ok ? "snap" : "snap-blocked" });
    if (drawStart) markers.push({ x: drawStart.x, z: drawStart.z, tone: "start" });
    overlay.setPreview(ribbons, markers, heightAt);
  }, [state.candidates, state.siteTargets, state.site, state.preview, state.drawStart, state.active, state.tool]);

  useEffect(() => () => {
    controllerRef.current?.exit();
    installed.current?.dispose();
    installed.current = null; controllerRef.current = null; loadedSeed.current = null;
  }, []);

  const withSession = (run: (session: PlanRepairSession, controller: RepairController) => void) => {
    const ready = ensure(); if (!ready) return;
    run(ready.session, ready.controller); syncInfo();
  };

  return {
    enabled, state, info, issues,
    enter: () => { if (options.blocked || !options.model) return; withSession((_s, controller) => controller.enter()); },
    exit: () => { auditOpen.current = false; setIssues(null); controllerRef.current?.exit(); },
    setTool: (tool: RepairTool) => withSession((_s, controller) => controller.setTool(tool)),
    removeSelected: () => withSession((_s, controller) => controller.removeSelected()),
    setRoadWidth: (width: RoadWidth) => withSession((_s, controller) => controller.setRoadWidth(width)),
    undo: () => withSession((session, controller) => { if (session.undo()) controller.refresh({ kind: "ok", text: "已撤销" }); }),
    redo: () => withSession((session, controller) => { if (session.redo()) controller.refresh({ kind: "ok", text: "已重做" }); }),
    reset: () => withSession((session, controller) => { session.reset(); controller.refresh({ kind: "ok", text: "已恢复生成" }); }),
    audit: () => withSession((session) => { auditOpen.current = true; setIssues(session.audit()); }),
    closeAudit: () => { auditOpen.current = false; setIssues(null); },
    locate: (issue: PlanIssue) => { if (issue.at) engine.current?.focusPoint(issue.at.x, issue.at.z); },
  };
}

export type PlanRepairUi = ReturnType<typeof usePlanRepair>;
