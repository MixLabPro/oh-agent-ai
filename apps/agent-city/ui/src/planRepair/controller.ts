/**
 * 规划修复模式的交互状态机（docs/CITY_PLAN_MANUAL_REPAIR_SPEC.md §7.1）。
 *
 * 纯逻辑：不碰 three/DOM/引擎，依赖全部经 `RepairDeps` 注入——可以在 node 里直接测
 * （scripts/verify-plan-repair-controller.mjs），也让「点击 → 状态 → 反馈」这条链不依赖 WebGL 才能验证。
 *
 * 交互（M1：只有移楼）：点选一栋会话楼 → 候选空地块高亮 → 点任一地块（不必是高亮的）尝试搬过去。
 * 点不合格的地块不会静默失败：硬阻止原因逐条翻译成人话显示。
 */
import type { EditResult, RepairCandidate } from "./session";

export type RepairMessage = { kind: "hint" | "ok" | "warn" | "error"; text: string };

export type RepairState = {
  active: boolean;
  buildingId: string | null;
  candidates: RepairCandidate[];
  message: RepairMessage | null;
};

export type RepairDeps = {
  isSessionBuilding(id: string): boolean;
  candidates(buildingId: string): RepairCandidate[];
  nearestParcel(x: number, z: number): { id: string } | null;
  parcelOf(buildingId: string): string | null;
  moveBuilding(buildingId: string, parcelId: string): EditResult;
  /** 选中环（引擎的选中高亮）；null 取消。 */
  setSelected(id: string | null): void;
};

const BLOCKER_TEXT: Record<string, string> = {
  "parcel-occupied": "该地块已被其他会话楼、配套或背景楼占用",
  "building-over-road": "楼会压到道路上",
  "building-overlap": "会和其他会话楼重叠",
  "steep-slope": "地块坡度太陡",
  "not-buildable": "该处不可建设（水面或岩岸）",
  "highway-clearance": "高架净空不足",
  "missing-parcel": "地块不存在（城市已重排）",
  "unknown-building": "这栋楼不在当前城市里",
};
const WARNING_TEXT: Record<string, string> = {
  "cross-district": "已搬出它所属的小区",
};

export const blockerText = (code: string): string => BLOCKER_TEXT[code] ?? code;
export const warningText = (code: string): string => WARNING_TEXT[code] ?? code;

const HINT_PICK: RepairMessage = { kind: "hint", text: "点选一栋会话楼，再点要搬去的空地块" };

export class RepairController {
  private state: RepairState = { active: false, buildingId: null, candidates: [], message: null };
  private readonly listeners = new Set<(state: RepairState) => void>();

  constructor(private readonly deps: RepairDeps) {}

  get snapshot(): RepairState {
    return this.state;
  }

  subscribe(listener: (state: RepairState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private set(next: Partial<RepairState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener(this.state);
  }

  enter(): void {
    if (this.state.active) return;
    this.set({ active: true, buildingId: null, candidates: [], message: HINT_PICK });
  }

  exit(): void {
    if (!this.state.active) return;
    this.deps.setSelected(null);
    this.set({ active: false, buildingId: null, candidates: [], message: null });
  }

  /** Esc：先取消选中，没有选中再退出模式。 */
  cancel(): void {
    if (!this.state.active) return;
    if (this.state.buildingId) this.deselect(HINT_PICK);
    else this.exit();
  }

  private deselect(message: RepairMessage | null): void {
    this.deps.setSelected(null);
    this.set({ buildingId: null, candidates: [], message });
  }

  private select(buildingId: string, message?: RepairMessage): void {
    const candidates = this.deps.candidates(buildingId);
    this.deps.setSelected(buildingId);
    this.set({
      buildingId, candidates,
      message: message ?? (candidates.length
        ? { kind: "hint", text: `已选中，附近有 ${candidates.length} 个可搬去的空地块（绿色）；点任一地块搬过去` }
        : { kind: "warn", text: "已选中，但附近没有可搬去的空地块" }),
    });
  }

  /** 引擎的选取手势：pickedId = 射线最近命中物（会话楼 id 或 decor:…），ground = 射线与地形的交点。 */
  click(click: { pickedId: string | null; ground: { x: number; z: number } | null }): void {
    if (!this.state.active) return;
    const { pickedId, ground } = click;
    if (pickedId !== null) {
      if (this.deps.isSessionBuilding(pickedId)) { this.select(pickedId); return; }
      this.set({ message: { kind: "warn", text: "只有会话楼可以移动；背景楼、配套和地标不可编辑" } });
      return;
    }
    const buildingId = this.state.buildingId;
    if (!buildingId) {
      this.set({ message: HINT_PICK });
      return;
    }
    if (!ground) { this.deselect(HINT_PICK); return; } // 点到天空：取消选中
    const parcel = this.deps.nearestParcel(ground.x, ground.z);
    if (!parcel) { this.set({ message: { kind: "warn", text: "这里没有可落位的地块" } }); return; }
    if (parcel.id === this.deps.parcelOf(buildingId)) { this.set({ message: { kind: "hint", text: "它已经在这个地块上了" } }); return; }
    const result = this.deps.moveBuilding(buildingId, parcel.id);
    if (!result.ok) {
      const text = result.blockers?.length ? `不能搬到这里：${result.blockers.map(blockerText).join("；")}` : `不能搬到这里：${result.reason}`;
      this.set({ message: { kind: "error", text } });
      return;
    }
    // 搬成功：引擎已重建城市，重新选中恢复选中环，并按新位置刷新候选。
    this.select(buildingId, {
      kind: result.warnings.length ? "warn" : "ok",
      text: result.warnings.length ? `已搬过去（${result.warnings.map(warningText).join("；")}）` : "已搬过去",
    });
  }

  /** 撤销/重做/恢复生成/数据刷新之后：楼可能已不在原处或已不存在，重算候选。 */
  refresh(message?: RepairMessage): void {
    if (!this.state.active) return;
    const id = this.state.buildingId;
    if (!id) { if (message) this.set({ message }); return; }
    if (!this.deps.isSessionBuilding(id)) { this.deselect(message ?? { kind: "warn", text: "选中的楼已不在城市里" }); return; }
    this.select(id, message);
  }
}
