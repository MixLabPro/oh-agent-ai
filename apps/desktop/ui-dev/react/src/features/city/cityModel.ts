/**
 * City 模型层：把 Agent Vitals 的业务数据（Session / Host / Token / Finding / 时间）
 * 映射成一座"数据城市"的中性模型。本文件不依赖任何渲染库——三维引擎只消费
 * 这里产出的 `CityModel`，未来更换 Renderer 时数据语义保持不变。
 *
 * 映射约定（SIMULATE THE DATA, FAKE THE CITY）：
 *   Session → 建筑          （1 个 session = 1 栋楼；超过渲染上限的聚合为背景楼群）
 *   Host    → 城市          （每个 host 一座岛/区，建筑风格 = host 配色与立面语言）
 *   Token   → 建筑材料/规模  （对数映射到高度与体量）
 *   Progress→ 施工进度      （会话关闭 = 封顶；活跃会话 = 工地，完成度为估算值）
 *   Finding → 区域异常      （finding 只到 host 粒度，因此在 host 区上标记，不落到具体楼）
 *   Time    → 生长与 Replay （first_event 决定楼在时间轴上的出现时刻）
 */

import type { FindingGroup, SessionRow } from "../../lib/tauri";
import { hostName } from "../../lib/hostNames";

/** 会话被视为"正在施工"的窗口：last_event 距今 10 分钟内。 */
export const ACTIVE_WINDOW_MS = 10 * 60_000;

/** 单独成楼的 session 上限；超出部分按区聚合为背景楼群（massing）。 */
export const RENDER_CAP = 1_400;
/** 数据装载上限（分页累计），避免超大历史窗口线性拖垮首屏。 */
export const LOAD_CAP = 4_500;

export type BuildingArchetype = "tower" | "slab" | "midrise" | "block" | "landmark";

export type CityBuilding = {
  /** session_ref；聚合楼为 `fill:<host>:<n>`。 */
  id: string;
  districtId: string;
  archetype: BuildingArchetype;
  /** 立面变体 0..2（punched / banded / glass），由 host 风格与 seed 决定。 */
  facade: number;
  /** session_ref 的确定性哈希 → 外观抖动，刷新不重排。 */
  seed: number;
  /** 建筑材料量：session 总 token（聚合楼为成员之和）。 */
  tokensTotal: number;
  /** 封顶高度（世界单位），由 token 对数映射。 */
  height: number;
  footprint: number;
  startedAt: number;
  endedAt: number | null;
  /** 活跃会话：仍在施工。 */
  active: boolean;
  /** 当前完成度估算 [0,1]；关闭会话恒为 1。 */
  builtFraction: number;
  /** 施工繁忙度 [0,1]：近期 token 吞吐，驱动吊车节奏。 */
  busyness: number;
  /** 聚合背景楼：代表 extraCount 个未单独成楼的 session。 */
  aggregated: boolean;
  extraCount: number;
};

export type DistrictAnomaly = {
  severity: "critical" | "warning" | "info";
  count: number;
  topRule: string;
};

export type CityDistrict = {
  id: string;
  label: string;
  /** 该区真实 session 数（含被聚合部分）。 */
  sessionCount: number;
  tokensTotal: number;
  activeCount: number;
  anomaly: DistrictAnomaly | null;
};

export type CityModel = {
  generatedAt: number;
  windowStartMs: number;
  windowEndMs: number;
  windowLabel: string;
  districts: CityDistrict[];
  buildings: CityBuilding[];
  stats: {
    renderedSessions: number;
    aggregatedSessions: number;
    totalSessions: number;
    tokensTotal: number;
    activeCount: number;
    truncated: boolean;
  };
  /** 楼 id → 原始 SessionRow（钻取面板用；聚合楼无条目）。 */
  rows: Map<string, SessionRow>;
};

/** FNV-1a：稳定、无依赖。 */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

const FAMILY_MATCHERS: Array<[RegExp, string]> = [
  [/claude|anthropic/i, "anthropic"],
  [/gpt|o[134](-|$)|openai/i, "openai"],
  [/deepseek/i, "deepseek"],
  [/glm|zhipu/i, "glm"],
  [/minimax/i, "minimax"],
  [/gemini/i, "gemini"],
  [/qwen/i, "qwen"],
];

export function modelFamily(modelIds: string[]): string {
  for (const model of modelIds) {
    for (const [pattern, family] of FAMILY_MATCHERS) {
      if (pattern.test(model)) return family;
    }
  }
  return "unknown";
}

/** Token → 高度：对数幂曲线，1e3→6 / 1e5→27 / 1e7→64，拉开天际线层次。 */
export function tokensToHeight(tokens: number): number {
  const magnitude = Math.max(0, Math.log10(Math.max(tokens, 1)) - 1);
  return Math.min(64, Math.max(2.6, 1.3 * Math.pow(magnitude, 2.2)));
}

function archetypeFor(seed: number, height: number, landmark: boolean): BuildingArchetype {
  if (landmark) return "landmark";
  if (height >= 30) return seed < 0.55 ? "tower" : "slab";
  if (height >= 14) return seed < 0.4 ? "slab" : seed < 0.78 ? "midrise" : "tower";
  return seed < 0.62 ? "midrise" : "block";
}

function percentile(sorted: number[], fraction: number): number {
  if (!sorted.length) return 240_000;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)));
  return sorted[index];
}

function parseMs(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function anomalyFromFindings(groups: FindingGroup[]): DistrictAnomaly | null {
  let critical = 0;
  let warning = 0;
  let info = 0;
  let topRule = "";
  let topRank = -1;
  for (const group of groups) {
    const open = group.status_rollup.open + group.status_rollup.later;
    if (open <= 0) continue;
    const rank = group.severity === "critical" ? 3 : group.severity === "warning" ? 2 : 1;
    if (rank === 3) critical += open;
    else if (rank === 2) warning += open;
    else info += open;
    if (rank > topRank) {
      topRank = rank;
      topRule = group.rule;
    }
  }
  const count = critical + warning + info;
  if (!count) return null;
  return { severity: critical ? "critical" : warning ? "warning" : "info", count, topRule };
}

export type CityModelInput = {
  rows: SessionRow[];
  findings: FindingGroup[];
  windowStartMs: number;
  windowEndMs: number;
  windowLabel: string;
  /** 窗口内真实 session 总数（服务端计数），用于岛体量规划。 */
  totalSessions: number;
  truncated: boolean;
  generatedAt?: number;
};

export function buildCityModel(input: CityModelInput): CityModel {
  const generatedAt = input.generatedAt ?? Date.now();
  const byHost = new Map<string, SessionRow[]>();
  for (const row of input.rows) {
    const list = byHost.get(row.host);
    if (list) list.push(row);
    else byHost.set(row.host, [row]);
  }

  const findingsByHost = new Map<string, FindingGroup[]>();
  for (const group of input.findings) {
    const list = findingsByHost.get(group.host);
    if (list) list.push(group);
    else findingsByHost.set(group.host, [group]);
  }

  // 全城 token 排名（landmark 依据）与各区已关闭会话的 P95（progress 估算基准）。
  const tokenSortedAll = input.rows.map((row) => row.tokens.total).sort((left, right) => left - right);
  const landmarkThreshold = percentile(tokenSortedAll, Math.max(0, 1 - 12 / Math.max(tokenSortedAll.length, 1)));

  const buildings: CityBuilding[] = [];
  const districts: CityDistrict[] = [];
  const rowsIndex = new Map<string, SessionRow>();
  let aggregatedSessions = 0;

  const hostIds = [...byHost.keys()].sort((left, right) => {
    const leftTokens = byHost.get(left)!.reduce((sum, row) => sum + row.tokens.total, 0);
    const rightTokens = byHost.get(right)!.reduce((sum, row) => sum + row.tokens.total, 0);
    return rightTokens - leftTokens;
  });

  const perHostQuota = Math.max(40, Math.floor(RENDER_CAP / Math.max(hostIds.length, 1)));

  for (const hostId of hostIds) {
    const hostRows = byHost.get(hostId)!;
    // 时间序（老 → 新）：城市由内向外生长。
    hostRows.sort((left, right) => parseMs(left.first_event_at, 0) - parseMs(right.first_event_at, 0));
    const closedTokens = hostRows
      .filter((row) => generatedAt - parseMs(row.last_event_at, generatedAt) > ACTIVE_WINDOW_MS)
      .map((row) => row.tokens.total)
      .sort((left, right) => left - right);
    const p95 = closedTokens.length >= 8 ? percentile(closedTokens, 0.95) : Math.max(percentile(tokenSortedAll, 0.95), 1);

    const rendered = hostRows.slice(0, perHostQuota);
    const overflow = hostRows.slice(perHostQuota);
    let districtActive = 0;

    for (const row of rendered) {
      const startedAt = parseMs(row.first_event_at, input.windowStartMs);
      const endedAt = parseMs(row.last_event_at, startedAt);
      const active = generatedAt - endedAt <= ACTIVE_WINDOW_MS;
      if (active) districtActive += 1;
      const seed = hashSeed(row.session_ref);
      const height = tokensToHeight(row.tokens.total);
      const landmark = row.tokens.total >= landmarkThreshold && row.tokens.total > 0;
      const finalHeight = landmark ? height * 1.12 : height;
      const builtFraction = active ? Math.min(0.92, Math.max(0.08, row.tokens.total / p95)) : 1;
      const ageHours = Math.max(0.75, (generatedAt - startedAt) / 3_600_000);
      const tokensPerHour = row.tokens.total / ageHours;
      buildings.push({
        id: row.session_ref,
        districtId: hostId,
        archetype: archetypeFor(seed, height, landmark && height > 24),
        facade: Math.floor(seed * 997) % 3,
        seed,
        tokensTotal: row.tokens.total,
        height: finalHeight,
        footprint: 3.4 + seed * 1.6 + Math.min(2.2, height * 0.035),
        startedAt,
        endedAt: active ? null : endedAt,
        active,
        builtFraction,
        busyness: active ? Math.min(1, Math.max(0.18, Math.log10(1 + tokensPerHour) / 5)) : 0,
        aggregated: false,
        extraCount: 0,
      });
      rowsIndex.set(row.session_ref, row);
    }

    if (overflow.length) {
      aggregatedSessions += overflow.length;
      const overflowTokens = overflow.reduce((sum, row) => sum + row.tokens.total, 0);
      const fillerCount = Math.min(26, Math.max(2, Math.round(overflow.length / 24)));
      for (let index = 0; index < fillerCount; index += 1) {
        const seed = hashSeed(`${hostId}:fill:${index}`);
        const share = overflow.length / fillerCount;
        const tokens = Math.round(overflowTokens / fillerCount);
        const height = Math.max(3, Math.min(26, tokensToHeight(tokens) * 0.42));
        buildings.push({
          id: `fill:${hostId}:${index}`,
          districtId: hostId,
          archetype: seed < 0.5 ? "midrise" : "block",
          facade: 1,
          seed,
          tokensTotal: tokens,
          height,
          footprint: 4.2 + seed * 1.4,
          startedAt: parseMs(overflow[Math.floor(seed * overflow.length) % overflow.length].first_event_at, input.windowStartMs),
          endedAt: generatedAt - 30 * 60_000,
          active: false,
          builtFraction: 1,
          busyness: 0,
          aggregated: true,
          extraCount: Math.round(share),
        });
      }
    }

    const tokensTotal = hostRows.reduce((sum, row) => sum + row.tokens.total, 0);
    districts.push({
      id: hostId,
      label: hostName(hostId),
      sessionCount: input.truncated && perHostQuota < hostRows.length ? input.totalSessions : hostRows.length,
      tokensTotal,
      activeCount: districtActive,
      anomaly: anomalyFromFindings(findingsByHost.get(hostId) ?? []),
    });
  }

  const tokensTotal = input.rows.reduce((sum, row) => sum + row.tokens.total, 0);
  return {
    generatedAt,
    windowStartMs: input.windowStartMs,
    windowEndMs: input.windowEndMs,
    windowLabel: input.windowLabel,
    districts,
    buildings,
    stats: {
      renderedSessions: input.rows.length - aggregatedSessions,
      aggregatedSessions,
      totalSessions: Math.max(input.totalSessions, input.rows.length),
      tokensTotal,
      activeCount: buildings.reduce((sum, building) => sum + (building.active ? 1 : 0), 0),
      truncated: input.truncated,
    },
    rows: rowsIndex,
  };
}

/**
 * Replay 语义：在时间游标 cursor 下这栋楼"已建成多少"。token 在会话生命周期内
 * 线性累计是可视化近似（列表数据没有逐事件 token 序列），进度含义已在 HUD 标注。
 * 活跃会话以当前 token 数按已流逝时长折算，之后随真实数据增长。
 */
export function builtFractionAt(building: CityBuilding, cursor: number, live: boolean): number {
  if (building.aggregated) return cursor >= building.startedAt ? 1 : 0;
  if (cursor < building.startedAt) return 0;
  if (building.active && live) return building.builtFraction;
  const span = (building.endedAt ?? building.startedAt) - building.startedAt;
  if (!Number.isFinite(span) || span <= 0) return 1;
  const fraction = (cursor - building.startedAt) / span;
  return Math.min(1, Math.max(0.04, fraction));
}
