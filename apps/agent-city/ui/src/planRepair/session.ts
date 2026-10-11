/**
 * 规划修复会话（docs/CITY_PLAN_MANUAL_REPAIR_SPEC.md §13）：把补丁层接到 CityEngine 与存档。
 *
 * 本批只有**开发开关下的控制台入口**（`window.__cityPlan`），没有编辑 UI——先让补丁能在真实城市里
 * 走通「写补丁 → 重建 → 渲染/飞行世界读到 → 刷新不丢」，UI（拾取/拖拽/面板）属下一批。
 * 开关：`?cityPlan` 或 localStorage `cityPlanDev=1`（同 cityGame 的开发开关口径）。未开启时本模块
 * 不读存档、不挂 window、不改引擎行为（引擎里 planPatch 恒为 null → 与旧版逐字节一致）。
 */
import type { CityEngine } from "../engine/CityEngine";
import { auditLayout, type PlanIssue } from "../engine/planAudit";
import { applyPlanPatch, emptyPlanPatch, recordEdgeDrop, recordNodeMove, validateBuildingMove, type PlanPatchV1 } from "../engine/planPatch";
import { cityPlanPatchStore, emptyPlanPatchStore, type PlanPatchStoreV1 } from "../data/planPatch";

export function planDevEnabled(): boolean {
  try {
    return new URLSearchParams(location.search).has("cityPlan") || localStorage.getItem("cityPlanDev") === "1";
  } catch { return false; }
}

export type EditResult = { ok: true; patch: PlanPatchV1; warnings: string[] } | { ok: false; reason: string; blockers?: string[] };

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
    const empty = !next || (!Object.keys(next.buildingMoves).length && !Object.keys(next.nodeMoves).length && !next.edgeDrops.length && !next.suppressedContext.length);
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

  /** 拖一个路网节点（传 effective id，即屏幕上当前看到的）。M1 只有套用层的锁定/撞车保护，
   *  没有几何校验（锐角/并行间距/断网是 M2）——所以这是调试口，结果看 status().stale。 */
  moveNode(effectiveNodeId: string, x: number, z: number): EditResult {
    const base = this.working();
    if (!base.ok) return base;
    const generated = this.engine.generatedLayout!;
    const patch = recordNodeMove(base.patch, applyPlanPatch(generated, base.patch), effectiveNodeId, { x, z });
    this.commit(patch);
    return { ok: true, patch, warnings: [] };
  }

  dropEdge(effectiveEdgeId: string): EditResult {
    const base = this.working();
    if (!base.ok) return base;
    const generated = this.engine.generatedLayout!;
    const patch = recordEdgeDrop(base.patch, applyPlanPatch(generated, base.patch), effectiveEdgeId);
    this.commit(patch);
    return { ok: true, patch, warnings: [] };
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

  /** 离某栋楼最近的、可以搬过去的空地块（试搬用）。 */
  candidates(buildingId: string, limit = 8): Array<{ parcelId: string; x: number; z: number; distance: number; warnings: string[] }> {
    const layout = this.engine.currentLayout; const model = this.engine.currentModel;
    const home = layout?.districts.flatMap((district) => [...district.slots]).find(([id]) => id === buildingId)?.[1];
    if (!layout || !model || !home) return [];
    const patch = this.engine.planPatch ?? emptyPlanPatch(layout.seed, layout.scaleTier);
    return layout.blocks.flatMap((block) => block.parcels)
      .map((parcel) => ({ parcel, distance: Math.hypot(parcel.x - home.x, parcel.z - home.z) }))
      .sort((a, b) => a.distance - b.distance || (a.parcel.id < b.parcel.id ? -1 : 1))
      .flatMap(({ parcel, distance }) => {
        if (parcel.id === home.id) return [];
        const verdict = validateBuildingMove(layout, model, patch, buildingId, parcel.id);
        return verdict.blockers.length ? [] : [{ parcelId: parcel.id, x: parcel.x, z: parcel.z, distance: Math.round(distance), warnings: verdict.warnings }];
      })
      .slice(0, limit);
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
      counts: patch ? { buildingMoves: Object.keys(patch.buildingMoves).length, nodeMoves: Object.keys(patch.nodeMoves).length, edgeDrops: patch.edgeDrops.length, suppressedContext: patch.suppressedContext.length } : null,
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
