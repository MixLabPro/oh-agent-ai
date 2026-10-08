/**
 * FlightWorld（§4/§6.3/§8）：把进入游戏那一刻的 CityLayout+CityModel 冻结成
 * 只读的飞行世界——保守碰撞盒（楼体/桥梁/地标/背景楼/聚合楼/远山）、地形高度、
 * 软/硬边界与安全出生点。纯模块（无 three/DOM），空间网格加速查询；
 * 游戏期间数据更新只留 revision 标记，本快照永不热更（§8 布局冻结）。
 */
import { builtFractionAt, type CityModel } from "../cityModel";
import type { CityLayout, Parcel } from "../engine/cityLayout";
import { DetMath as Math } from "../engine/detMath";

export type ObstacleBox = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };

export type FlightWorldInput = {
  layout: CityLayout;
  model: CityModel;
  /** 进入时的回放游标；null = live（按 windowEnd 计冻结高度）。 */
  cursorMs: number | null;
};

export type FlightBounds = {
  centerX: number;
  centerZ: number;
  /** 软边界：越过即提示返航。 */
  softRadius: number;
  /** 硬边界：触发安全重置。 */
  hardRadius: number;
  minY: number;
  maxY: number;
};

export type SpawnPoint = { x: number; y: number; z: number; heading: number };

const GRID_CELL = 48;

/** 地标保守高度表（与 cityCatalog 取景高度同源；碰撞取略高值）。 */
const LANDMARK_HEIGHT: Record<string, number> = {
  "tv-tower": 36, "twist-tower": 36, "twin-towers": 40, "ferris-wheel": 28,
  arch: 18, pagoda: 16, lighthouse: 16, "sail-opera": 12, "suspension-bridge": 14, "villa-complex": 9,
};

export class FlightWorld {
  readonly boxes: readonly ObstacleBox[];
  readonly bounds: FlightBounds;
  private readonly grid = new Map<string, number[]>();
  private readonly terrainAt: (x: number, z: number) => number;

  constructor(input: FlightWorldInput) {
    const { layout, model } = input;
    this.terrainAt = layout.terrain.height;
    const cursor = input.cursorMs ?? model.windowEndMs;
    const live = input.cursorMs === null;
    const boxes: ObstacleBox[] = [];

    // 会话楼：slots 提供 x/z 与地块尺寸，grounds 提供地面高度；高度冻结为进入时的显示高度。
    const slots = new Map<string, Parcel>();
    const grounds = new Map<string, number>();
    for (const district of layout.districts) {
      for (const [id, slot] of district.slots) slots.set(id, slot);
      for (const [id, ground] of district.grounds) grounds.set(id, ground);
    }
    for (const building of model.buildings) {
      const slot = slots.get(building.id);
      if (!slot) continue;
      const ground = Math.max(0, grounds.get(building.id) ?? layout.terrain.height(slot.x, slot.z));
      const display = builtFractionAt(building, cursor, live, 0);
      if (display <= 0) continue;
      // 保守 AABB：非塔楼按地块面宽/进深取包络（朝向任意 → 对角线方形），塔楼用 footprint。
      const long = Math.max(building.footprint, slot.width * 0.92, slot.depth * 0.9);
      const half = building.archetype === "tower" || building.archetype === "landmark"
        ? building.footprint * 0.5 + 0.6
        : Math.hypot(long, long) * 0.5;
      boxes.push({ minX: slot.x - half, maxX: slot.x + half, minY: ground, maxY: ground + Math.max(1.5, building.height * display), minZ: slot.z - half, maxZ: slot.z + half });
    }
    // 背景楼（F2：appearAt 已过的才存在）与聚合楼群。
    for (const context of layout.contextBuildings) {
      if (context.appearAt > cursor) continue;
      const half = Math.hypot(context.width, context.depth) * 0.5;
      boxes.push({ minX: context.x - half, maxX: context.x + half, minY: Math.max(0, context.y), maxY: context.y + context.height, minZ: context.z - half, maxZ: context.z + half });
    }
    for (const block of layout.massing) {
      const half = 7 + Math.min(8, Math.sqrt(block.count));
      boxes.push({ minX: block.x - half, maxX: block.x + half, minY: Math.max(0, block.y), maxY: block.y + block.height, minZ: block.z - half, maxZ: block.z + half });
    }
    // 桥梁：布局不存桥面高程，按保守带（水面→桁架上方）整段成盒；桥塔并入。
    for (const bridge of layout.bridges) {
      const minX = Math.min(bridge.from.x, bridge.to.x) - 6;
      const maxX = Math.max(bridge.from.x, bridge.to.x) + 6;
      const minZ = Math.min(bridge.from.z, bridge.to.z) - 6;
      const maxZ = Math.max(bridge.from.z, bridge.to.z) + 6;
      boxes.push({ minX, maxX, minY: -2, maxY: 13, minZ, maxZ });
    }
    // 城市地标：radius 为占地半径；高程按类型表。
    for (const landmark of layout.landmarks ?? []) {
      const height = LANDMARK_HEIGHT[landmark.kind] ?? 14;
      const half = Math.max(4, landmark.radius * 0.8);
      const x2 = landmark.to ? (landmark.x + landmark.to.x) / 2 : landmark.x;
      const z2 = landmark.to ? (landmark.z + landmark.to.z) / 2 : landmark.z;
      boxes.push({ minX: x2 - half, maxX: x2 + half, minY: 0, maxY: height, minZ: z2 - half, maxZ: z2 + half });
    }
    // 城区地标（取景区旗塔，~45）。
    for (const marker of layout.districtLandmarks ?? []) {
      boxes.push({ minX: marker.x - 3, maxX: marker.x + 3, minY: Math.max(0, marker.y), maxY: marker.y + 46, minZ: marker.z - 3, maxZ: marker.z + 3 });
    }
    // 市政设施：整块街区高度的保守盒。
    for (const civic of layout.civics) {
      const half = Math.hypot(civic.width, civic.depth) * 0.5;
      boxes.push({ minX: civic.x - half, maxX: civic.x + half, minY: Math.max(0, civic.y), maxY: civic.y + 13, minZ: civic.z - half, maxZ: civic.z + half });
    }
    for (const site of layout.publicSites) {
      if (site.kind === "harbor" || site.kind === "park") continue; // 码头/公园：低矮开敞，不作硬障碍
      const height = site.kind === "tower" ? 32 : site.kind === "stadium" ? 15 : 11;
      const half = site.radius * 0.8;
      boxes.push({ minX: site.x - half, maxX: site.x + half, minY: 0, maxY: height, minZ: site.z - half, maxZ: site.z + half });
    }
    // 海上装饰远山：地形查询覆盖不到它们，单独成盒避免穿山。
    for (const mountain of layout.seaMountains ?? []) {
      const half = mountain.radius * 0.9;
      boxes.push({ minX: mountain.center.x - half, maxX: mountain.center.x + half, minY: -2, maxY: mountain.height, minZ: mountain.center.z - half, maxZ: mountain.center.z + half });
    }
    for (const mountain of layout.decorMountains ?? []) {
      const half = mountain.radius * 0.9;
      const top = Math.max(30, mountain.terrain.height(mountain.center.x, mountain.center.z));
      boxes.push({ minX: mountain.center.x - half, maxX: mountain.center.x + half, minY: -2, maxY: top, minZ: mountain.center.z - half, maxZ: mountain.center.z + half });
    }

    this.boxes = boxes;
    const urban = layout.urbanBounds;
    const centerX = (urban.left + urban.right) / 2;
    const centerZ = (urban.north + urban.south) / 2;
    const hardRadius = Math.max(layout.boundsRadius * 1.8, layout.islandRadius * 2.2);
    let top = 60;
    for (const box of boxes) if (box.maxY > top && Number.isFinite(box.maxY)) top = box.maxY;
    this.bounds = { centerX, centerZ, softRadius: hardRadius * 0.78, hardRadius, minY: 2, maxY: top + 40 };
    for (let index = 0; index < boxes.length; index += 1) {
      const box = boxes[index];
      for (let gx = Math.floor(box.minX / GRID_CELL); gx <= Math.floor(box.maxX / GRID_CELL); gx += 1) {
        for (let gz = Math.floor(box.minZ / GRID_CELL); gz <= Math.floor(box.maxZ / GRID_CELL); gz += 1) {
          const key = `${gx}:${gz}`;
          const list = this.grid.get(key);
          if (list) list.push(index);
          else this.grid.set(key, [index]);
        }
      }
    }
  }

  terrainHeight(x: number, z: number): number {
    return this.terrainAt(x, z);
  }

  /** 与窗口相交的碰撞盒（含 margin 外扩）；一次分配，供扫掠检测逐盒测试。 */
  boxesInWindow(minX: number, minZ: number, maxX: number, maxZ: number): ObstacleBox[] {
    const seen = new Set<number>();
    const out: ObstacleBox[] = [];
    for (let gx = Math.floor(minX / GRID_CELL); gx <= Math.floor(maxX / GRID_CELL); gx += 1) {
      for (let gz = Math.floor(minZ / GRID_CELL); gz <= Math.floor(maxZ / GRID_CELL); gz += 1) {
        for (const index of this.grid.get(`${gx}:${gz}`) ?? []) {
          if (seen.has(index)) continue;
          seen.add(index);
          out.push(this.boxes[index]);
        }
      }
    }
    return out;
  }

  /** 一点是否净空：不与任何碰撞盒（外扩 margin）相交、在地形之上 margin、在硬边界内。 */
  isPointClear(x: number, y: number, z: number, margin: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
    const { bounds } = this;
    if (y < bounds.minY || y > bounds.maxY) return false;
    if (Math.hypot(x - bounds.centerX, z - bounds.centerZ) > bounds.hardRadius) return false;
    if (y < Math.max(0, this.terrainAt(x, z)) + margin) return false;
    for (const box of this.boxesInWindow(x - margin, z - margin, x + margin, z + margin)) {
      if (x > box.minX - margin && x < box.maxX + margin && z > box.minZ - margin && z < box.maxZ + margin && y > box.minY - margin && y < box.maxY + margin) return false;
    }
    return true;
  }

  /**
   * 安全出生点（§6.3）：优先海面一侧、朝向城市的弧位；机位与机后相机锚点都需净空。
   * 确定性：环形扫描，无随机数。找不到返回 null（调用方拒绝开始，给自由练习/重新生成）。
   * 出生环必须在软边界以内（曾从 0.82×hard 起——软边界在 0.78×hard，出生即告警）。
   */
  findSafeSpawn(clearance: number, cameraBack: number, cameraUp: number): SpawnPoint | null {
    const { bounds } = this;
    const altitude = Math.min(bounds.maxY - clearance * 2, Math.max(30, (bounds.maxY - 40) * 0.55 + 26));
    for (let ring = 0; ring < 5; ring += 1) {
      const radius = bounds.softRadius * (0.9 + ring * 0.04);
      const steps = 24;
      const offset = ring * 0.13; // 环之间错开半个步角
      for (let step = 0; step < steps; step += 1) {
        const angle = (step / steps) * Math.PI * 2 + offset;
        const x = bounds.centerX + Math.cos(angle) * radius;
        const z = bounds.centerZ + Math.sin(angle) * radius;
        if (this.terrainAt(x, z) > -0.5) continue; // 只要海面位（空岛/全陆时由后备环处理）
        const heading = Math.atan2(bounds.centerZ - z, bounds.centerX - x);
        const planeOk = this.isPointClear(x, altitude, z, clearance);
        const camOk = this.isPointClear(x - Math.cos(heading) * cameraBack, altitude + cameraUp, z - Math.sin(heading) * cameraBack, clearance * 0.6);
        if (planeOk && camOk) return { x, y: altitude, z, heading };
      }
    }
    // 后备：任意净空的环形位（含陆地上空），从软边界内向外收。
    for (let ring = 0; ring < 12; ring += 1) {
      const radius = bounds.softRadius * (0.95 - ring * 0.08);
      for (let step = 0; step < 24; step += 1) {
        const angle = (step / 24) * Math.PI * 2;
        const x = bounds.centerX + Math.cos(angle) * radius;
        const z = bounds.centerZ + Math.sin(angle) * radius;
        const ground = Math.max(0, this.terrainAt(x, z));
        const y = Math.max(altitude, ground + clearance * 2.5);
        const heading = Math.atan2(bounds.centerZ - z, bounds.centerX - x);
        const planeOk = this.isPointClear(x, y, z, clearance);
        const camOk = this.isPointClear(x - Math.cos(heading) * cameraBack, y + cameraUp, z - Math.sin(heading) * cameraBack, clearance * 0.6);
        if (planeOk && camOk) return { x, y, z, heading };
      }
    }
    // 最后兜底：城心正上方（任何城市都应有这一格净空）。
    const topY = Math.min(bounds.maxY - clearance, 120);
    if (this.isPointClear(bounds.centerX, topY, bounds.centerZ, clearance)) {
      return { x: bounds.centerX, y: topY, z: bounds.centerZ, heading: 0 };
    }
    return null;
  }
}
