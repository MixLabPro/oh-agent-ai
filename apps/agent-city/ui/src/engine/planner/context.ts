import type { Landmark } from "../cityPlan";
import type { CityBlock, PublicSite, RoadEdge, RoadNode, Vec2 } from "../cityLayout";

/**
 * 规划尾部修复遍用到的闭包成员（CITY_ARCHITECTURE §2 迁移步 5b）。
 * 原先这些遍内联在 buildPlan 末尾、直接引用闭包变量；现在显式列出——一个遍用到什么，一眼可见。
 * 全是「引用」：nodes/edges/publicSites/landmarks/blocks 就是 buildPlan 里的同一份可变对象，修复遍原地改它们。
 * 只收尾部遍真正读的成员；要加新遍用到新成员，先加到这里。
 */
export interface RepairContext {
  nodes: Map<string, RoadNode>;
  edges: Map<string, RoadEdge>;
  /** 加一条路段（端点取整、同 id 不重复）。 */
  addEdge: (a0: Vec2, b0: Vec2, arterial: boolean, bridge?: boolean, primary?: boolean) => void;
  /** 坐标取整到 0.01（路网节点的规范化键）。 */
  key: (p: Vec2) => Vec2;
  height: (x: number, z: number) => number;
  inRiver: (x: number, z: number) => boolean;
  publicSites: PublicSite[];
  landmarks: Landmark[];
  blocks: CityBlock[];
  /** 环线高架折线（用地不得压在其下）。 */
  ringRuns: Vec2[][];
  coast: Vec2[];
  core: Vec2;
  nearBridgeEnd: (x: number, z: number, radius: number) => boolean;
  distanceToTrunks: (p: Vec2) => number;
  /** 两点连线能否通过（不过水、不穿预留地、坡度可走）。 */
  safeRoadLink: (a: Vec2, b: Vec2) => boolean;
  /** 线段 ab 与 cd 是否真相交（不含共端点）。 */
  crosses: (a: Vec2, b: Vec2, c: Vec2, d: Vec2) => boolean;
  SHORE_SITE_KINDS: Set<string>;
  /** 车流折线（海滨大道回路、街区回路）：去冗余的修复不得拆掉它们走的路段，否则整条回路被丢弃。 */
  carPaths: Vec2[][];
}
