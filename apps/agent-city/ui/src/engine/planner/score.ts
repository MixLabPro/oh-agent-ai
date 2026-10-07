/**
 * 规划评分（CITY_PLANNER_V2_SPEC §5.5，步 3 只读版）。
 *
 * 定位：分数只用于「两个合法方案之间做选择」与「两版规划器对比」（survey 输出平均分）；
 * **不用于验收**——验收仍是 constraints + 普查上限。硬约束违例的方案不参与比较（solve 里先 measure）。
 *
 * 每项归一化到 [0,1]、越大越好；权重表 ≤8 项、每项注明来源（现有守卫或用户反馈），改权重按改 golden 对待。
 * 近似处（terrain 中心代替名义锚点、R 圆代替真实岸线）标注了 TODO(步 6)：SiteSpec 落地后换成名义位置。
 */
import { DetMath as Math } from "../detMath";
import { segmentDistance } from "../cityPlan";
import { CONSTRAINTS, type CityPlan } from "./constraints";

export type ScoreTerm = "siteDrift" | "doorAlignment" | "shoreHug" | "landmarkSpread" | "networkQuality" | "parcelYield";
export type ScoreWeights = Record<ScoreTerm, number>;

/** 权重表（改这里 = 改 golden，需在提交信息里写明理由）。 */
export const SCORE_WEIGHTS: ScoreWeights = {
  siteDrift: 1.0,        // 名义位置承载城市结构（车站在外环、塔在核心旁）——v2 §5.5
  doorAlignment: 1.0,    // 「门贴路」规则（stationDoorFacesRoad 的软版本）
  shoreHug: 0.8,         // 「歌剧院应该在水边」（用户反馈）
  landmarkSpread: 0.8,   // 天际线不扎堆
  networkQuality: 1.2,   // 锐角 / 扎堆主干 / 断头（现 3 条软约束）
  parcelYield: 1.0,      // 档位面积利用率（半径校正的质量）
};

const SHORE_KINDS = new Set(["lighthouse", "sail-opera", "ferris-wheel", "villa-complex", "harbor"]);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const angleDelta = (a: number, b: number) => { const d = Math.abs(a - b) % (Math.PI * 2); return Math.min(d, Math.PI * 2 - d); };

const measure = (id: string, plan: CityPlan) => CONSTRAINTS.find((c) => c.id === id)?.measure(plan).length ?? 0;

/** 各项得分 [0,1]（供 survey 与将来 solve 的局部交换分别读取；总分 = Σ wᵢ·termᵢ）。 */
export function scoreTerms(plan: CityPlan): Record<ScoreTerm, number> {
  const sites = [...plan.publicSites, ...plan.landmarks].filter((s) => s.radius);
  const solid = plan.roadEdges.filter((e) => !e.bridge);

  // 用地离结构锚点的平均距离 / R。TODO(步 6)：换成 SiteSpec 的名义位置（anchor 函数）。
  // 当前锚点近似：岸类用地取「离 core 同方位的 R 圈」，内陆用地取 core——比较两版规划器时口径一致。
  const drift = sites.length
    ? sites.reduce((sum, s) => {
        const anchorDist = SHORE_KINDS.has(s.kind) ? Math.max(0, plan.islandRadius - s.radius * 0.7) : 0;
        const want = Math.hypot(s.x - plan.core.x, s.z - plan.core.z);
        return sum + Math.abs(want - anchorDist) / plan.islandRadius;
      }, 0) / sites.length
    : 0;

  // 车站正门与最近路向的夹角（yaw 与路切向对齐 = 1；垂直 = 0）。
  let doorSum = 0; let doorN = 0;
  for (const s of sites) {
    if (s.kind !== "station" && s.kind !== "stadium") continue;
    let best: { d: number; yaw: number } | null = null;
    for (const e of solid) {
      const d = segmentDistance(s, e.points[0], e.points[1]);
      if (!best || d < best.d) best = { d, yaw: Math.atan2(e.points[1].z - e.points[0].z, e.points[1].x - e.points[0].x) };
    }
    if (best) { doorSum += 1 - clamp01(angleDelta(s.yaw, best.yaw) / (Math.PI / 2)); doorN += 1; }
  }

  // 岸类用地贴岸程度：中心离岸 ≈ 0.7 半径最佳（TODO(步 6)：换真实岸线距离）。
  let shoreSum = 0; let shoreN = 0;
  for (const s of sites) {
    if (!SHORE_KINDS.has(s.kind)) continue;
    const dist = Math.hypot(s.x - plan.core.x, s.z - plan.core.z);
    const target = plan.islandRadius - s.radius * 0.7;
    shoreSum += 1 - clamp01(Math.abs(dist - target) / (s.radius * 0.7)); shoreN += 1;
  }

  // 地标两两最小间距 / R（越大越散）。
  let minGap = Infinity;
  const marks = plan.landmarks.filter((l) => l.radius);
  for (let i = 0; i < marks.length; i += 1) for (let j = i + 1; j < marks.length; j += 1) {
    minGap = Math.min(minGap, Math.hypot(marks[i].x - marks[j].x, marks[i].z - marks[j].z));
  }

  const softViolations = measure("acuteJunctions", plan) + measure("crowdedArterials", plan) + measure("looseInlandRoadEnds", plan);
  const parcels = plan.blocks.reduce((sum, b) => sum + b.parcels.length, 0);
  const parcelsTarget = plan.scaleTier * 2700; // targetParcels 未导出：档位×2000×1.35 的近似，比较用足够

  return {
    siteDrift: clamp01(1 - drift * 4),
    doorAlignment: doorN ? doorSum / doorN : 1,
    shoreHug: shoreN ? shoreSum / shoreN : 1,
    landmarkSpread: marks.length > 1 ? clamp01(minGap / (plan.islandRadius * 0.5)) : 1,
    networkQuality: clamp01(1 - softViolations / 12),
    parcelYield: clamp01(parcels / parcelsTarget),
  };
}

/** 总分（Σ 权重×项）。只读；不参与验收（见文件头）。 */
export function scorePlan(plan: CityPlan): number {
  const terms = scoreTerms(plan);
  return (Object.keys(SCORE_WEIGHTS) as ScoreTerm[]).reduce((sum, term) => sum + SCORE_WEIGHTS[term] * terms[term], 0);
}
