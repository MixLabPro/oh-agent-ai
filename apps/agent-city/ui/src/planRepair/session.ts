/**
 * 规划修复会话（docs/CITY_PLAN_MANUAL_REPAIR_SPEC.md §13）：把补丁层接到 CityEngine 与存档。
 *
 * 编辑 UI（planRepair/PlanRepairPanel + controller）与开发控制台入口（`window.__cityPlan`）共用这个会话：
 * 校验 → 写补丁 → 引擎重建 → 存档。道路编辑一律先过 planRoadRules 的硬规则，再追加一条道路日志。
 * 开关：`?cityPlan` 或 localStorage `cityPlanDev=1`（同 cityGame 的开发开关口径）。未开启时本模块
 * 不读存档、不挂 window、不改引擎行为（引擎里 planPatch 恒为 null → 与旧版逐字节一致）。
 */
import type { CityEngine } from "../engine/CityEngine";
import { auditLayout, type PlanIssue } from "../engine/planAudit";
import { appendRoadOp, appendSiteOp, emptyPlanPatch, validateBuildingMove, type PlanPatchV1 } from "../engine/planPatch";
import { listSites, pickSite, siteMoveProblem, siteTargets, type SiteInfo, type SiteTarget } from "../engine/planSites";
import type { RepairRay } from "../engine/CityEngine";
import { bulldozeForRoads } from "../engine/planBulldozer";
import { nearestEdgeAt, snapPoint, validateEdgeDrop, validateNodeMove, validateRoadAdd, type RoadVerdict, type SnapPoint } from "../engine/planRoadRules";
import type { Vec2 } from "../engine/cityLayout";
import { cityPlanPatchStore, emptyPlanPatchStore, type PlanPatchStoreV1 } from "../data/planPatch";

export function planDevEnabled(): boolean {
  try {
    return new URLSearchParams(location.search).has("cityPlan") || localStorage.getItem("cityPlanDev") === "1";
  } catch { return false; }
}

export type RepairCandidate = { parcelId: string; x: number; z: number; yaw: number; width: number; depth: number; distance: number; warnings: string[] };

export type EditResult = { ok: true; patch: PlanPatchV1; warnings: string[] } | { ok: false; reason: string; blockers?: string[] };
/** 设施搬家后 id 可能变（背景楼的 id 由地块决定），成功时带回新 id 供编辑器重新选中。 */
export type SiteEditResult = EditResult & { siteId?: string };

const UNDO_LIMIT = 100;
const SAVE_DEBOUNCE_MS = 400;

export class PlanRepairSession {
  private store: PlanPatchStoreV1 = emptyPlanPatchStore();
  private loaded = false;
  private undoStack: Array<PlanPatchV1 | null> = [];
  private redoStack: Array<PlanPatchV1 | null> = [];
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private saveFailed = false;
  private loadTicket = 0;

  constructor(private readonly engine: CityEngine) {}

  /** 读存档并把该种子的补丁交给引擎。存档读不到/损坏 → 空库（诚实降级，不抛）。 */
  async load(seed: number): Promise<void> {
    // 序号守卫：初始种子与存档种子会连发两次 load，读存档是异步的，乱序返回时旧的不能覆盖新的。
    const ticket = ++this.loadTicket;
    let store: PlanPatchStoreV1;
    try { store = (await cityPlanPatchStore("read")) ?? emptyPlanPatchStore(); } catch { store = emptyPlanPatchStore(); }
    if (ticket !== this.loadTicket) return;
    this.store = store;
    this.loaded = true;
    this.undoStack = []; this.redoStack = [];
    this.engine.setPlanPatch(this.store.patches[String(seed)] ?? null);
  }

  private get seed(): number | null {
    return this.engine.currentLayout?.seed ?? null;
  }

  /** 当前补丁；没有则按当前档位建一份空的。档位对不上（城市已扩容）→ 不静默覆盖旧补丁，要求先 reset。 */
  private working(): { ok: true; patch: PlanPatchV1 } | { ok: false; reason: string } {
    const layout = this.engine.currentLayout;
    if (!layout || !this.engine.currentModel) return { ok: false, reason: "city-not-ready" };
    const existing = this.engine.planPatch;
    if (!existing) return { ok: true, patch: emptyPlanPatch(layout.seed, layout.scaleTier) };
    if (existing.scaleTier !== layout.scaleTier) return { ok: false, reason: `patch-tier-${existing.scaleTier}-vs-city-tier-${layout.scaleTier}: reset() first` };
    return { ok: true, patch: existing };
  }

  private commit(next: PlanPatchV1 | null): void {
    this.undoStack.push(this.engine.planPatch);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.apply(next);
  }

  private apply(next: PlanPatchV1 | null): void {
    const empty = !next || (!Object.keys(next.buildingMoves).length && !next.roadOps.length && !next.siteOps.length && !next.suppressedContext.length);
    const patch = empty ? null : next;
    this.engine.setPlanPatch(patch);
    const seed = this.seed;
    if (seed === null) return;
    if (patch) this.store.patches[String(seed)] = patch; else delete this.store.patches[String(seed)];
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (!this.loaded) return; // 没读过存档就写会覆盖其它种子的补丁
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      void cityPlanPatchStore("write", this.store).then((result) => { this.saveFailed = result === null; }).catch(() => { this.saveFailed = true; });
    }, SAVE_DEBOUNCE_MS);
  }

  /** 搬一栋会话楼到另一个地块。硬阻止（压路/重叠/被占/坡地/不可建/高架）直接拒绝并给出原因。 */
  moveBuilding(buildingId: string, parcelId: string): EditResult {
    const base = this.working();
    if (!base.ok) return base;
    const layout = this.engine.currentLayout!; const model = this.engine.currentModel!;
    const verdict = validateBuildingMove(layout, model, base.patch, buildingId, parcelId);
    if (verdict.blockers.length) return { ok: false, reason: "blocked", blockers: verdict.blockers };
    const patch = { ...base.patch, updatedAt: Date.now(), buildingMoves: { ...base.patch.buildingMoves, [buildingId]: parcelId } };
    this.commit(patch);
    return { ok: true, patch, warnings: verdict.warnings };
  }

  /** 拖一个路口（传当前 id，即屏幕上看到的）。先过硬规则：锁定/撞车/过短/入水/穿楼/锐角。 */
  moveNode(nodeId: string, x: number, z: number): EditResult {
    const base = this.working();
    if (!base.ok) return base;
    const verdict = validateNodeMove(this.engine.currentLayout!, this.engine.currentModel!, nodeId, { x, z });
    if (verdict.blockers.length) return { ok: false, reason: "blocked", blockers: verdict.blockers };
    return this.commitWithBulldozer(appendRoadOp(base.patch, { t: "move", node: nodeId, to: { x, z } }), verdict.warnings);
  }

  /** 橡皮擦：删一段路（传当前 id）。 */
  dropEdge(edgeId: string): EditResult {
    const base = this.working();
    if (!base.ok) return base;
    const verdict = validateEdgeDrop(this.engine.currentLayout!, this.engine.currentModel!, edgeId);
    if (verdict.blockers.length) return { ok: false, reason: "blocked", blockers: verdict.blockers };
    const patch = appendRoadOp(base.patch, { t: "drop", edge: edgeId });
    this.commit(patch);
    return { ok: true, patch, warnings: verdict.warnings };
  }

  /** 画路：from/to 是已吸附的坐标（snap() 的结果）。端点落在路段中间会把该路段拆成两半。 */
  addRoad(from: Vec2, to: Vec2, width: number): EditResult {
    const base = this.working();
    if (!base.ok) return base;
    const verdict = validateRoadAdd(this.engine.currentLayout!, this.engine.currentModel!, from, to, width);
    if (verdict.blockers.length) return { ok: false, reason: "blocked", blockers: verdict.blockers };
    return this.commitWithBulldozer(appendRoadOp(base.patch, { t: "add", from, to, width }), verdict.warnings);
  }

  // ── 设施（非会话建筑）：市长管公共设施，会话楼由开发商盖 ──

  /** 射线下最近的可编辑设施（实例级拾取）。 */
  pickSite(ray: RepairRay): SiteInfo | null {
    const layout = this.engine.currentLayout;
    return layout ? pickSite(layout, ray) : null;
  }

  siteById(id: string): SiteInfo | null {
    const layout = this.engine.currentLayout;
    return layout ? listSites(layout).find((site) => site.id === id) ?? null : null;
  }

  siteTargets(site: SiteInfo, limit = 40): SiteTarget[] {
    const layout = this.engine.currentLayout;
    return layout ? siteTargets(layout, site, this.engine.planPatch?.suppressedContext ?? [], limit) : [];
  }

  /** 地面点落在哪个可接收的目标上：街区级设施取包含该点（或最近）的街区，地块级取最近地块。 */
  siteTargetAt(site: SiteInfo, x: number, z: number): string | null {
    const layout = this.engine.currentLayout;
    if (!layout) return null;
    if (site.level === "free") return `@${Math.round(x * 100) / 100},${Math.round(z * 100) / 100}`;
    if (site.level === "parcel") return this.nearestParcel(x, z)?.id ?? null;
    let best: { id: string; d: number } | null = null;
    for (const block of layout.blocks) {
      if (!block.parcels.length) continue;
      const d = Math.hypot(block.x - x, block.z - z);
      if (d <= Math.max(block.width, block.depth) / 2 + 4 && (!best || d < best.d)) best = { id: block.id, d };
    }
    return best?.id ?? null;
  }

  moveSite(site: SiteInfo, targetId: string): SiteEditResult {
    const base = this.working();
    if (!base.ok) return base;
    const problem = siteMoveProblem(this.engine.currentLayout!, site, targetId, base.patch.suppressedContext);
    if (problem) return { ok: false, reason: "blocked", blockers: [problem] };
    const patch = appendSiteOp(base.patch, { t: "move", id: site.id, at: { x: site.x, z: site.z }, to: targetId });
    this.commit(patch);
    return { ok: true, patch, warnings: [], siteId: site.kind === "context" ? `context:${targetId}` : site.id };
  }

  removeSite(site: SiteInfo): EditResult {
    const base = this.working();
    if (!base.ok) return base;
    const patch = appendSiteOp(base.patch, { t: "remove", id: site.id, at: { x: site.x, z: site.z } });
    this.commit(patch);
    return { ok: true, patch, warnings: [] };
  }

  /** 道路改动连同推土机的后果一起提交（同一步撤销）：压到的设施推平、会话楼由开发商就近安置。
   *  warnings 里的预估计数（bulldoze:N / relocate:N）换成实际结果（bulldozed:N / relocated:N / homeless:N）。 */
  private commitWithBulldozer(patch: PlanPatchV1, warnings: string[]): EditResult {
    const generated = this.engine.generatedLayout; const before = this.engine.currentLayout; const model = this.engine.currentModel;
    const result = generated && before && model ? bulldozeForRoads(generated, model, before, patch) : { patch, bulldozed: [], relocated: [], homeless: [] };
    this.commit(result.patch);
    const facts = [
      ...warnings.filter((code) => !code.startsWith("bulldoze:") && !code.startsWith("relocate:")),
      ...(result.bulldozed.length ? [`bulldozed:${result.bulldozed.length}`] : []),
      ...(result.relocated.length ? [`relocated:${result.relocated.length}`] : []),
      ...(result.homeless.length ? [`homeless:${result.homeless.length}`] : []),
    ];
    return { ok: true, patch: result.patch, warnings: facts };
  }

  // ── 悬停预览用的只读包装（不写补丁）──
  snap(x: number, z: number): SnapPoint | null {
    const layout = this.engine.currentLayout;
    return layout ? snapPoint(layout, x, z) : null;
  }

  edgeAt(x: number, z: number): { id: string; points: Vec2[]; width: number; locked: boolean } | null {
    const layout = this.engine.currentLayout;
    const edge = layout ? nearestEdgeAt(layout, x, z) : null;
    return edge ? { id: edge.id, points: edge.points, width: edge.width, locked: edge.bridge === true || edge.structure === "deck" || edge.structure === "ground-approach" || edge.purpose === "waterfront" } : null;
  }

  validateDrop(edgeId: string): RoadVerdict {
    const layout = this.engine.currentLayout; const model = this.engine.currentModel;
    return layout && model ? validateEdgeDrop(layout, model, edgeId) : { blockers: ["city-not-ready"], warnings: [] };
  }

  validateAdd(from: Vec2, to: Vec2, width: number): RoadVerdict {
    const layout = this.engine.currentLayout; const model = this.engine.currentModel;
    return layout && model ? validateRoadAdd(layout, model, from, to, width) : { blockers: ["city-not-ready"], warnings: [] };
  }

  undo(): boolean {
    if (!this.undoStack.length) return false;
    this.redoStack.push(this.engine.planPatch);
    this.apply(this.undoStack.pop() ?? null);
    return true;
  }

  redo(): boolean {
    if (!this.redoStack.length) return false;
    this.undoStack.push(this.engine.planPatch);
    this.apply(this.redoStack.pop() ?? null);
    return true;
  }

  /** 恢复生成：清掉当前种子的全部补丁（可撤销）。 */
  reset(): void {
    if (this.engine.planPatch) this.commit(null);
  }

  /** 离某栋楼最近的、可以搬过去的空地块（试搬用）。按距离从近到远逐个校验，凑够 limit 个就停——
   *  曾先校验全城再截断，真实城市 4000 地块 × 上千路段的校验每次选楼都要卡一下。 */
  candidates(buildingId: string, limit = 8, maxDistance = 160): RepairCandidate[] {
    const layout = this.engine.currentLayout; const model = this.engine.currentModel;
    const home = layout?.districts.flatMap((district) => [...district.slots]).find(([id]) => id === buildingId)?.[1];
    if (!layout || !model || !home) return [];
    const patch = this.engine.planPatch ?? emptyPlanPatch(layout.seed, layout.scaleTier);
    const sorted = layout.blocks.flatMap((block) => block.parcels)
      .map((parcel) => ({ parcel, distance: Math.hypot(parcel.x - home.x, parcel.z - home.z) }))
      .filter(({ parcel, distance }) => parcel.id !== home.id && distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance || (a.parcel.id < b.parcel.id ? -1 : 1));
    const out: RepairCandidate[] = [];
    for (const { parcel, distance } of sorted) {
      const verdict = validateBuildingMove(layout, model, patch, buildingId, parcel.id);
      if (verdict.blockers.length) continue;
      out.push({ parcelId: parcel.id, x: parcel.x, z: parcel.z, yaw: parcel.yaw, width: parcel.width, depth: parcel.depth, distance: Math.round(distance), warnings: verdict.warnings });
      if (out.length >= limit) break;
    }
    return out;
  }

  /** 某栋会话楼当前所在地块（生效布局）。 */
  parcelOf(buildingId: string): string | null {
    return this.engine.currentLayout?.districts.flatMap((district) => [...district.slots]).find(([id]) => id === buildingId)?.[1].id ?? null;
  }

  /** 点到地面一处时最近的地块（半径内）；含酒店地块。 */
  nearestParcel(x: number, z: number, radius = 14): { id: string; x: number; z: number } | null {
    const layout = this.engine.currentLayout;
    if (!layout) return null;
    let best: { id: string; x: number; z: number } | null = null; let bestD = radius;
    const consider = (parcel: { id: string; x: number; z: number }) => {
      const d = Math.hypot(parcel.x - x, parcel.z - z);
      if (d < bestD) { bestD = d; best = parcel; }
    };
    for (const block of layout.blocks) for (const parcel of block.parcels) consider(parcel);
    for (const district of layout.districts) for (const parcel of district.slots.values()) consider(parcel);
    return best;
  }

  /** 全城布局级体检（含补丁失效条目）。 */
  audit(): PlanIssue[] {
    const layout = this.engine.currentLayout; const model = this.engine.currentModel;
    if (!layout || !model) return [];
    return auditLayout(layout, model, this.engine.planPatched?.stale ?? []);
  }

  status() {
    const layout = this.engine.currentLayout;
    const patch = this.engine.planPatch;
    return {
      ready: !!layout, seed: layout?.seed ?? null, cityTier: layout?.scaleTier ?? null, patchTier: patch?.scaleTier ?? null,
      patch, stale: this.engine.planPatched?.stale ?? [], saveFailed: this.saveFailed,
      canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0,
      counts: patch ? { buildingMoves: Object.keys(patch.buildingMoves).length, roadOps: patch.roadOps.length, roadAdds: patch.roadOps.filter((op) => op.t === "add").length, roadDrops: patch.roadOps.filter((op) => op.t === "drop").length, siteOps: patch.siteOps.length, suppressedContext: patch.suppressedContext.length } : null,
    };
  }

  dispose(): void {
    clearTimeout(this.saveTimer);
  }
}

declare global {
  interface Window { __cityPlan?: PlanRepairSession }
}

/** 开发开关下把会话挂到 `window.__cityPlan`；返回卸载函数。 */
export function installPlanRepairDebug(engine: CityEngine): { session: PlanRepairSession; dispose: () => void } {
  const session = new PlanRepairSession(engine);
  window.__cityPlan = session;
  console.info("[city-plan] window.__cityPlan 已就绪：status() candidates(id) moveBuilding(id, parcelId) moveNode(id,x,z) dropEdge(id) undo() redo() reset() audit()");
  return { session, dispose: () => { session.dispose(); if (window.__cityPlan === session) delete window.__cityPlan; } };
}
