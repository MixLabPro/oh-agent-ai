/**
 * 候选路线统一终筛（CITY_NETWORK_FIRST_OPTIMIZATION_PLAN 批 A）：搜索提案与固定定线共用
 * 一个候选表示与纯验证入口，废除策略级整体豁免——siteGate 全免、湿桥地面段不复查、
 * maxSlope=Infinity 都改为按段结构检查：
 *
 *   ground-road      普通地面段：不过水 / 可建 / 坡度 ≤0.9 / 避让预留地（直连阶梯的历史口径，逐字保留）。
 *   ground-approach  引道段（bridge-candidate 的地面引线、门路）：不要求 buildable（前滩按道路
 *                    可行条件，不套建筑判据）/ 坡度 ≤ roadApproachMaxSlope（有限值，实测标定）。
 *                    贴 deck 的 wet/gate 引道：水段与用地避让归提议期整线分析管辖，复查只净增
 *                    坡度（子段重采样会命中整线采样看不见的亚步长水凹/避让凹——见下方实证注）。
 *                    纯陆地引道：历史 4 采样全查（水/避让/坡度）。发起用地自身不在 blockers 里，
 *                    即「入口只豁免自身明确通道」。
 *   deck             桥面：不吃地面判据（跨距/桥头在提议期判据）；被允许立体跨越既有路时须查
 *                    高度净空——RoadEdge 无高程模型，信息不足按设计返回 unsupported（违规），
 *                    不是关闭平面交叉检查。
 *
 * 纯函数：只读传入网络与地理；验证失败零副作用（设计 §5A-7）。
 */
import { DetMath as Math } from "../detMath";
import type { Vec2 } from "../cityLayout";
import type { Network } from "./network";
import type { ConnectorWorld, ConnectionFailure } from "./connect";
import { crosses as crossesSeg } from "./footprint";

export const VALIDATION_CONFIG = {
  version: 1,
  // 实测标定（2026-10-08，两条种子线分开测，避免单线定标）：
  //  - 调优线（30 基线 + 60 普查 t1 + 10 t3）：桥邻接地面边 n=623 最差坡度 max=2.447，用地邻接入口边 n=766 max=0.409；
  //  - 独立验收线（3e9，t1×60）：桥邻接 n=353 max=4.98（seed 3001256748 帆船剧院翻崖岸引道），用地邻接 n=442 max=0.17。
  // 6.0 = 全体实测包络 4.98 × ~1.2 余量：覆盖所有历史已接受引道，仍拒绝不可行陡坡（旧口径是
  // maxSlope=Infinity，任何有限值都是收紧）。改此值必须引用新测量与验收集证据。
  roadApproachMaxSlope: 6,
  approachSiteMargin: 2, // 引道段的用地避让 r+2（提议期同口径）
  sampleSpacing: 4, // 普通地面段走廊采样步长（safeRoadLink 历史口径；landing.ts 有自己的同值常量）
  // 湿桥/门路引道的历史有效口径 = 提议期 6 单位采样（终筛曾整体跳过）；批 A 终筛重推导但
  // 不收紧到 4——实测收紧（提议 6/终筛 4 或双侧 4）把验收集 disconnected 2→8、bridgehead 5→10
  // （采样抖动拒掉历史接受的候选）。各段类保持其历史口径：wet/gate 引道 6、纯陆地引道与
  // 普通道路 4。改此值必须引用验收集证据。
  approachWetSampleSpacing: 6,
};

export type SegmentKind = "ground-road" | "ground-approach" | "deck";
export type RouteSegment = {
  a: Vec2;
  b: Vec2;
  kind: SegmentKind;
  /** 地面段贴 deck（相邻段是桥面）：端点豁免触水线（提议期 k=1..n-1 同标准，非第二口径）。 */
  touchesDeck?: boolean;
};
export type RouteCandidate = {
  id: string;
  segments: RouteSegment[];
  /** 平面交叉检查开关（滨海互接的历史档不查；deck 段在开启时按垂直净空 unsupported 判）。 */
  crossings: boolean;
  /** 引道段的避让盘（不含发起用地自身——自身通道即豁免本身）。 */
  blockers: Array<{ x: number; z: number; radius: number }>;
  /** 门路（site-access 门桥）：引道（干湿皆然）的历史有效口径 = 提议期 6 采样整线分析，
   *  终筛只净增有限坡度；非门路的纯陆地引道才走历史 4 采样全查（旧终筛 727 段口径）。 */
  gate?: boolean;
};
export type CandidateViolation = { segment: number; kind: ConnectionFailure | "vertical-clearance-unsupported"; detail: string };
export type CandidateValidation = { ok: true } | { ok: false; violations: CandidateViolation[] };

/** 走廊逐点硬约束（原 connect.ts 同名函数迁入，口径逐字保留：4 单位采样，含两端点）。
 *  地面走廊遇水即拒（water-span）；buildable/坡度/用地按 policy。 */
export function corridorFailure(world: ConnectorWorld, a: Vec2, b: Vec2, policy: CorridorPolicy, opts: { skipEnds?: boolean; spacing?: number; skipWater?: boolean } = {}): ConnectionFailure | null {
  const distance = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(distance / (opts.spacing ?? VALIDATION_CONFIG.sampleSpacing)));
  for (let i = 0; i <= steps; i += 1) {
    if (opts.skipEnds && (i === 0 || i === steps)) continue; // 桥引道触水线端点豁免（与提议期 k=1..n-1 同一标准，非第二口径）
    const p = { x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps };
    if (!opts.skipWater && (world.geo.height(p.x, p.z) <= 0.5 || world.inRiver(p.x, p.z))) return "water-span";
    if (policy.requireBuildable && !world.geo.buildable(p.x, p.z)) return "slope";
    if (world.geo.terrain.slope(p.x, p.z) > policy.maxSlope) return "slope";
    if (policy.sites.some((site) => Math.hypot(p.x - site.x, p.z - site.z) < site.radius + policy.siteMargin)) return "site-clearance";
  }
  return null;
}

export type CorridorPolicy = {
  requireBuildable: boolean;
  maxSlope: number;
  sites: Array<{ x: number; z: number; radius: number }>;
  siteMargin: number;
  /** 批 A 起验证不再因该旗标授予任何豁免（保留仅为调用位标注用途）；豁免语义见 RouteCandidate.blockers。 */
  siteGate?: boolean;
};

/**
 * 统一终筛（纯）：ground-road 段用 roadPolicy（各阶梯的历史口径）；ground-approach 段用
 * 引道标准（有限坡度 + 前滩不套 buildable + 只避让 blockers）；deck 段不吃地面判据、
 * 在 crossings 开启时与既有边重叠 → vertical-clearance-unsupported（无高程模型，不静默放行）。
 * network 传草稿（提交期）或当前网络（提议期预筛）——两处同一入口。
 */
export function validateCandidate(
  world: ConnectorWorld,
  network: Network,
  candidate: RouteCandidate,
  opts: { roadPolicy: CorridorPolicy },
): CandidateValidation {
  const violations: CandidateViolation[] = [];
  for (let i = 0; i < candidate.segments.length; i += 1) {
    const s = candidate.segments[i];
    if (s.kind === "deck") {
      if (candidate.crossings) {
        for (const other of network.edges.values()) {
          if (crossesSeg(s.a, s.b, other.points[0], other.points[1])) {
            violations.push({ segment: i, kind: "vertical-clearance-unsupported", detail: `deck overlaps edge ${other.id}; RoadEdge carries no elevation model` });
            break;
          }
        }
      }
      continue;
    }
    // 引道段的净新增检查 = 有限坡度（实测 3.0）。水段与用地避让归提议期整线 6 采样分析管辖：
    // 贴 deck 与门路引道不重查（子段重采样会命中整线采样看不见的亚步长水凹/避让凹——实证：
    // 验收集 bridgehead 5→10，首候选被预筛拒后落入源头贴水线的退化候选）；非门路的纯陆地引道
    // 走历史 4 采样全查（旧终筛 727 段的水/避让口径 + 有限坡度）。
    const proposalGoverned = s.touchesDeck || candidate.gate;
    const failure = s.kind === "ground-approach"
      ? corridorFailure(world, s.a, s.b, {
          requireBuildable: false,
          maxSlope: VALIDATION_CONFIG.roadApproachMaxSlope,
          sites: proposalGoverned ? [] : candidate.blockers,
          siteMargin: VALIDATION_CONFIG.approachSiteMargin,
        }, proposalGoverned
          ? { skipEnds: s.touchesDeck, spacing: VALIDATION_CONFIG.approachWetSampleSpacing, skipWater: true }
          : {})
      : corridorFailure(world, s.a, s.b, opts.roadPolicy, {});
    if (failure) violations.push({ segment: i, kind: failure, detail: `${candidate.id} segment ${i} failed ${failure}` });
    if (candidate.crossings) {
      for (const other of network.edges.values()) {
        if (crossesSeg(s.a, s.b, other.points[0], other.points[1])) {
          violations.push({ segment: i, kind: "crossing", detail: `${candidate.id} segment ${i} crosses edge ${other.id}` });
          break;
        }
      }
    }
  }
  return violations.length ? { ok: false, violations } : { ok: true };
}
