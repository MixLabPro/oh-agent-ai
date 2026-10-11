/**
 * 规划修复模式的交互状态机（docs/CITY_PLAN_MANUAL_REPAIR_SPEC.md §7.1 / §13.3）。
 *
 * 纯逻辑：不碰 three/DOM/引擎，依赖全部经 `RepairDeps` 注入——可以在 node 里直接测
 * （scripts/verify-plan-repair-controller.mjs），也让「点击/悬停 → 状态 → 反馈」这条链不依赖 WebGL 才能验证。
 *
 * 三个工具（参考游戏的建造交互）：
 *   选择（build）：点会话楼 → 候选空地块高亮 → 点地块搬过去；
 *   画路（draw）：点一下落起点，鼠标移动有预览（绿可行 / 红不行 + 原因），再点一下落笔，连续接着画；
 *   橡皮擦（erase）：悬停高亮将被擦掉的路段（红；不能擦的变灰并说明原因），点击擦除。
 *   设施（site）：悬停高亮非会话建筑（公共设施/花园/城区地标/背景楼），点选后点目标空街区/空地块搬家，或拆除。
 *               市长管设施，会话楼由开发商盖——点会话楼只给提示，不能在这里动它。
 * 画路/橡皮擦只用地面点（引擎射线与地形的交点），不看射线先打到的建筑——与悬停预览用的是同一个点，所见即所点。
 */
import type { SnapPoint, RoadVerdict } from "../engine/planRoadRules";
import type { Vec2 } from "../engine/cityLayout";
import type { RepairRay } from "../engine/CityEngine";
import type { SiteInfo, SiteTarget } from "../engine/planSites";
import type { EditResult, RepairCandidate, SiteEditResult } from "./session";

export type RepairTool = "build" | "draw" | "erase" | "site";
export type RoadWidth = 5 | 8;

export type RepairMessage = { kind: "hint" | "ok" | "warn" | "error"; text: string };

/** 悬停预览（叠加层据此画色带/标记）。reason 非空时面板在消息下方显示。 */
export type RepairPreview =
  | { kind: "erase"; points: Vec2[]; width: number; ok: boolean; reason: string | null }
  | { kind: "draw"; from: Vec2; to: Vec2; width: number; ok: boolean; reason: string | null; snap: SnapPoint }
  | { kind: "snap"; at: Vec2; ok: boolean; snap: SnapPoint }
  | { kind: "site"; rect: { x: number; z: number; yaw: number; width: number; depth: number }; label: string }
  | null;

export type RepairState = {
  active: boolean;
  tool: RepairTool;
  buildingId: string | null;
  candidates: RepairCandidate[];
  /** 设施工具：选中的设施与它的合法目标（街区/地块）。 */
  site: SiteInfo | null;
  siteTargets: SiteTarget[];
  drawStart: SnapPoint | null;
  roadWidth: RoadWidth;
  preview: RepairPreview;
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
  // 道路
  snap(x: number, z: number): SnapPoint | null;
  edgeAt(x: number, z: number): { id: string; points: Vec2[]; width: number; locked: boolean } | null;
  validateAdd(from: Vec2, to: Vec2, width: number): RoadVerdict;
  addRoad(from: Vec2, to: Vec2, width: number): EditResult;
  validateDrop(edgeId: string): RoadVerdict;
  dropEdge(edgeId: string): EditResult;
  // 设施
  pickSite(ray: RepairRay): SiteInfo | null;
  siteById(id: string): SiteInfo | null;
  siteTargets(site: SiteInfo): SiteTarget[];
  siteTargetAt(site: SiteInfo, x: number, z: number): string | null;
  moveSite(site: SiteInfo, targetId: string): SiteEditResult;
  removeSite(site: SiteInfo): EditResult;
};

const BLOCKER_TEXT: Record<string, string> = {
  // 移楼
  "parcel-occupied": "该地块已被其他会话楼、配套或背景楼占用",
  "building-over-road": "楼会压到道路上",
  "building-overlap": "会和其他会话楼重叠",
  "steep-slope": "地块坡度太陡",
  "not-buildable": "该处不可建设（水面或岩岸）",
  "highway-clearance": "高架净空不足",
  "missing-parcel": "地块不存在（城市已重排）",
  "unknown-building": "这栋楼不在当前城市里",
  // 道路
  "locked-edge": "桥、桥头引道和滨海路不可编辑",
  "arterial-skeleton": "主干道是城市骨架，不能擦",
  "strands-buildings": "擦掉后有楼离最近的路超过 40",
  "disconnects-buildings": "擦掉后有楼会和路网断开",
  "edge-too-short": "太短了（至少 6）",
  "edge-too-long": "太长了（最多 250）",
  "isolated-road": "新路必须接到现有道路上",
  "road-in-water": "不能修到水面或岩岸上",
  "road-over-building": "会穿过建筑、配套或花园",
  "crosses-road": "与现有道路交叉——请在交叉点连接",
  "acute-junction": "路口夹角太小（小于 30°）",
  "edge-exists": "这里已经有路了",
  degenerate: "起点和终点是同一个路口",
  "node-collision": "目标处已有路口",
  "missing-edge": "路段不存在",
  "missing-node": "路口不存在",
  unchanged: "位置没有变化",
  "city-not-ready": "城市尚未就绪",
  // 设施
  "target-occupied": "目标已被占用（会话楼、配套、花园或背景楼）",
  "site-over-road": "会压到道路上",
};
const WARNING_TEXT: Record<string, string> = {
  "cross-district": "已搬出它所属的小区",
  "creates-dead-end": "会留下一个断头路",
  "far-move": "移动距离很远",
};

export const blockerText = (code: string): string => BLOCKER_TEXT[code] ?? code;
export const warningText = (code: string): string => WARNING_TEXT[code] ?? code;

const reasonOf = (blockers: readonly string[]) => (blockers.length ? blockers.map(blockerText).join("；") : null);

const HINT: Record<RepairTool, RepairMessage> = {
  build: { kind: "hint", text: "点选一栋会话楼，再点要搬去的空地块" },
  draw: { kind: "hint", text: "点一下落起点（会吸附到路口或路面），再点一下落笔；可连续画，Esc 结束" },
  erase: { kind: "hint", text: "把橡皮擦移到道路上，红色高亮的路段点击即擦掉" },
  site: { kind: "hint", text: "点选公共设施、花园、城区地标或背景楼；再点空地搬家，或点「拆除」" },
};

const SITE_LABEL: Record<string, string> = { school: "学校", mall: "商场", hospital: "医院", garden: "城区花园与景观湖", "district-landmark": "城区地标", context: "背景楼" };
export const siteLabel = (site: Pick<SiteInfo, "kind" | "civicKind">): string => (site.kind === "civic" ? SITE_LABEL[site.civicKind ?? ""] ?? "公共设施" : SITE_LABEL[site.kind] ?? site.kind);
const siteRect = (site: SiteInfo) => ({ x: site.x, z: site.z, yaw: site.yaw, width: site.width, depth: site.depth });

const HOVER_EPS = 0.75; // 地面点移动不到这么多就不重算预览（鼠标抖动）

export class RepairController {
  private state: RepairState = { active: false, tool: "build", buildingId: null, candidates: [], site: null, siteTargets: [], drawStart: null, roadWidth: 5, preview: null, message: null };
  private readonly listeners = new Set<(state: RepairState) => void>();
  private lastGround: Vec2 | null = null;
  private lastRay: RepairRay | null = null;

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
    this.lastGround = null;
    this.set({ active: true, tool: "build", buildingId: null, candidates: [], site: null, siteTargets: [], drawStart: null, preview: null, message: HINT.build });
  }

  exit(): void {
    if (!this.state.active) return;
    this.deps.setSelected(null);
    this.lastGround = null;
    this.set({ active: false, buildingId: null, candidates: [], site: null, siteTargets: [], drawStart: null, preview: null, message: null });
  }

  setTool(tool: RepairTool): void {
    if (!this.state.active || this.state.tool === tool) return;
    this.deps.setSelected(null);
    this.lastGround = null;
    this.set({ tool, buildingId: null, candidates: [], site: null, siteTargets: [], drawStart: null, preview: null, message: HINT[tool] });
  }

  setRoadWidth(roadWidth: RoadWidth): void {
    if (!this.state.active || this.state.roadWidth === roadWidth) return;
    this.set({ roadWidth });
    this.recomputePreview();
  }

  /** Esc：画路——先放弃当前起点，没有起点就回到选择工具；选择/橡皮擦——先取消选中，再退出模式。 */
  cancel(): void {
    const { active, tool, buildingId, drawStart } = this.state;
    if (!active) return;
    if (tool === "draw" && drawStart) { this.set({ drawStart: null, preview: null, message: HINT.draw }); this.recomputePreview(); return; }
    if (tool === "site" && this.state.site) { this.clearSite(HINT.site); return; }
    if (tool !== "build") { this.setTool("build"); return; }
    if (buildingId) { this.deselect(HINT.build); return; }
    this.exit();
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

  // ── 悬停预览（画路/橡皮擦）──────────────────────────────────────────────

  /** 引擎的指针移动：ground = 射线与地形的交点，鼠标离开/朝天为 null。 */
  hover(ground: Vec2 | null, ray: RepairRay | null = null): void {
    const { active, tool } = this.state;
    if (!active || tool === "build") return;
    if (!ground) { this.lastGround = null; this.lastRay = null; if (this.state.preview) this.set({ preview: null }); return; }
    if (this.lastGround && Math.hypot(ground.x - this.lastGround.x, ground.z - this.lastGround.z) < HOVER_EPS) return;
    this.lastGround = ground; this.lastRay = ray;
    this.recomputePreview();
  }

  /** 状态变了（工具/宽度/起点/擦除成功）但鼠标没动：用最后的地面点重算预览。 */
  private recomputePreview(): void {
    const ground = this.lastGround;
    const { tool, drawStart, roadWidth } = this.state;
    if (!ground || tool === "build") { if (this.state.preview) this.set({ preview: null }); return; }
    if (tool === "site") {
      // 设施拾取按射线与占地盒求交（实例级）：高楼会把射线与地形的交点推到楼后面，只用地面点会点歪。
      const hit = this.lastRay ? this.deps.pickSite(this.lastRay) : null;
      this.set({ preview: hit ? { kind: "site", rect: siteRect(hit), label: siteLabel(hit) } : null });
      return;
    }
    if (tool === "erase") {
      const edge = this.deps.edgeAt(ground.x, ground.z);
      if (!edge) { this.set({ preview: null }); return; }
      const verdict = this.deps.validateDrop(edge.id);
      this.set({ preview: { kind: "erase", points: edge.points, width: edge.width, ok: verdict.blockers.length === 0, reason: reasonOf(verdict.blockers) } });
      return;
    }
    const snap = this.deps.snap(ground.x, ground.z);
    if (!snap) { this.set({ preview: null }); return; }
    if (!drawStart) {
      this.set({ preview: { kind: "snap", at: { x: snap.x, z: snap.z }, ok: !snap.locked, snap } });
      return;
    }
    const verdict = snap.locked ? { blockers: ["locked-edge"], warnings: [] } : this.deps.validateAdd(drawStart, snap, roadWidth);
    this.set({ preview: { kind: "draw", from: { x: drawStart.x, z: drawStart.z }, to: { x: snap.x, z: snap.z }, width: roadWidth, ok: verdict.blockers.length === 0, reason: reasonOf(verdict.blockers), snap } });
  }

  // ── 点击 ────────────────────────────────────────────────────────────────

  /** 引擎的选取手势：pickedId = 射线最近命中物（会话楼 id 或 decor:…），ground = 射线与地形的交点。 */
  click(click: { pickedId: string | null; ground: Vec2 | null; ray?: RepairRay | null }): void {
    if (!this.state.active) return;
    if (this.state.tool === "site") { this.clickSite(click); return; }
    if (this.state.tool === "draw") { this.clickDraw(click.ground); return; }
    if (this.state.tool === "erase") { this.clickErase(click.ground); return; }
    this.clickBuild(click);
  }

  private clickBuild({ pickedId, ground }: { pickedId: string | null; ground: Vec2 | null }): void {
    if (pickedId !== null) {
      if (this.deps.isSessionBuilding(pickedId)) { this.select(pickedId); return; }
      this.set({ message: { kind: "warn", text: "只有会话楼可以移动；背景楼、配套和地标不可编辑" } });
      return;
    }
    const buildingId = this.state.buildingId;
    if (!buildingId) { this.set({ message: HINT.build }); return; }
    if (!ground) { this.deselect(HINT.build); return; } // 点到天空：取消选中
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

  private clickDraw(ground: Vec2 | null): void {
    if (!ground) return;
    this.lastGround = ground;
    const snap = this.deps.snap(ground.x, ground.z);
    if (!snap) return;
    if (snap.locked) { this.set({ message: { kind: "error", text: `不能从这里接路：${blockerText("locked-edge")}` } }); return; }
    const start = this.state.drawStart;
    if (!start) {
      this.set({ drawStart: snap, message: { kind: "hint", text: "起点已落下，移动鼠标预览，再点一下落笔；Esc 放弃这个起点" } });
      this.recomputePreview();
      return;
    }
    const result = this.deps.addRoad(start, snap, this.state.roadWidth);
    if (!result.ok) {
      const text = result.blockers?.length ? `不能这样画：${result.blockers.map(blockerText).join("；")}` : `不能这样画：${result.reason}`;
      this.set({ message: { kind: "error", text } });
      return;
    }
    // 画成功：城市已重建（端点落在路段中间时那段路已被拆开）。以终点为新起点接着画；
    // 终点落在已有路口/路面上说明接通了，提示一下，仍可继续。
    const warnings = result.warnings.map(warningText);
    this.set({
      drawStart: { ...snap, kind: "node", locked: false }, // 落笔后终点已是路口（拆开或新建）
      message: { kind: warnings.length ? "warn" : "ok", text: warnings.length ? `已画一段（${warnings.join("；")}），接着点下一个点` : "已画一段，接着点下一个点；Esc 结束" },
    });
    this.recomputePreview();
  }

  // ── 设施 ────────────────────────────────────────────────────────────────

  private clearSite(message: RepairMessage | null): void {
    this.set({ site: null, siteTargets: [], message });
  }

  private selectSite(site: SiteInfo, message?: RepairMessage): void {
    const siteTargets = this.deps.siteTargets(site);
    this.set({
      site, siteTargets,
      message: message ?? (siteTargets.length
        ? { kind: "hint", text: `已选中${siteLabel(site)}，附近有 ${siteTargets.length} 个可搬去的${site.level === "block" ? "空街区" : "空地块"}（绿色）；点任一处搬过去，或点「拆除」` }
        : { kind: "warn", text: `已选中${siteLabel(site)}，但附近没有可搬去的${site.level === "block" ? "空街区" : "空地块"}；可以拆除` }),
    });
  }

  private clickSite({ pickedId, ground, ray }: { pickedId: string | null; ground: Vec2 | null; ray?: RepairRay | null }): void {
    const hit = ray ? this.deps.pickSite(ray) : null;
    if (hit) { this.selectSite(hit); return; }
    const site = this.state.site;
    // 点到的是不可编辑的东西：会话楼归开发商，致敬地标/市政用地与路网海岸绑定。
    if (pickedId !== null && !(site && ground)) {
      this.set({ message: this.deps.isSessionBuilding(pickedId)
        ? { kind: "warn", text: "会话楼由开发商（程序）按规划来盖，市长不指定位置；生成有误时用「移楼」修复" }
        : { kind: "warn", text: "致敬地标与市政用地（体育场、摩天轮、观景塔、港口、车站）由岛屿规划决定，与路网和海岸绑定，不可编辑" } });
      return;
    }
    if (!site) { this.set({ message: HINT.site }); return; }
    if (!ground) { this.clearSite(HINT.site); return; } // 点到天空：取消选中
    const targetId = this.deps.siteTargetAt(site, ground.x, ground.z);
    if (!targetId) { this.set({ message: { kind: "warn", text: `这里没有可落位的${site.level === "block" ? "街区" : "地块"}` } }); return; }
    const result = this.deps.moveSite(site, targetId);
    if (!result.ok) {
      const text = result.blockers?.length ? `不能搬到这里：${result.blockers.map(blockerText).join("；")}` : `不能搬到这里：${result.reason}`;
      this.set({ message: result.blockers?.[0] === "unchanged" ? { kind: "hint", text: "它已经在这里了" } : { kind: "error", text } });
      return;
    }
    const moved = (result.siteId ? this.deps.siteById(result.siteId) : null) ?? site;
    this.selectSite(moved, { kind: "ok", text: `已把${siteLabel(site)}搬过去` });
  }

  /** 拆除选中的设施（面板按钮 / Delete 键）。 */
  removeSelected(): void {
    const { active, tool, site } = this.state;
    if (!active || tool !== "site" || !site) return;
    const result = this.deps.removeSite(site);
    if (!result.ok) { this.set({ message: { kind: "error", text: `不能拆除：${result.reason}` } }); return; }
    this.lastGround = null;
    this.set({ site: null, siteTargets: [], preview: null, message: { kind: "ok", text: `已拆除${siteLabel(site)}（撤销可恢复）` } });
  }

  private clickErase(ground: Vec2 | null): void {
    if (!ground) return;
    this.lastGround = ground;
    const edge = this.deps.edgeAt(ground.x, ground.z);
    if (!edge) { this.set({ message: { kind: "warn", text: "这里没有道路可擦" } }); return; }
    const result = this.deps.dropEdge(edge.id);
    if (!result.ok) {
      const text = result.blockers?.length ? `不能擦：${result.blockers.map(blockerText).join("；")}` : `不能擦：${result.reason}`;
      this.set({ message: { kind: "error", text } });
      return;
    }
    const warnings = result.warnings.map(warningText);
    this.set({ message: { kind: warnings.length ? "warn" : "ok", text: warnings.length ? `已擦掉一段路（${warnings.join("；")}）` : "已擦掉一段路" } });
    this.recomputePreview();
  }

  /** 撤销/重做/恢复生成/数据刷新之后：楼/路可能已不在原处，重算选中与预览。 */
  refresh(message?: RepairMessage): void {
    if (!this.state.active) return;
    const { tool, buildingId, site } = this.state;
    if (tool === "site") {
      if (!site) { if (message) this.set({ message }); return; }
      const again = this.deps.siteById(site.id);
      if (!again) { this.clearSite(message ?? { kind: "warn", text: "选中的设施已不在城市里" }); return; }
      this.selectSite(again, message);
      return;
    }
    if (tool === "build") {
      if (!buildingId) { if (message) this.set({ message }); return; }
      if (!this.deps.isSessionBuilding(buildingId)) { this.deselect(message ?? { kind: "warn", text: "选中的楼已不在城市里" }); return; }
      this.select(buildingId, message);
      return;
    }
    // 路网变了：起点可能已不在路上（被撤销/擦掉）——保留坐标，预览按新路网重算；
    if (message) this.set({ message });
    this.recomputePreview();
  }
}
