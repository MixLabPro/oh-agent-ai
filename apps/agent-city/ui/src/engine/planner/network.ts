/**
 * 路网原语（CITY_PLANNER_V2_SPEC §5.1 / 步 2b-lite）：节点/边表与加边、坐标规范化键的唯一实现。
 *
 * 从 buildPlan 逐字迁出（行为由基线哈希证明）。v2 终态是 network 阶段持有它并对外只暴露
 * 纯函数；本步先让 buildPlan 与 RepairContext 共享同一个 Network 对象，替代 addEdge/key 闭包成员
 * （spec D5：闭包杂物袋 → 数据引用）。
 */
import { roadNodeId } from "../cityPlan";
import type { RoadEdge, RoadNode, Vec2 } from "../cityLayout";

export type Network = {
  nodes: Map<string, RoadNode>;
  edges: Map<string, RoadEdge>;
};

export const emptyNetwork = (): Network => ({ nodes: new Map(), edges: new Map() });

/** 坐标取整到 0.01（路网节点的规范化键）。 */
export const keyOf = (p: Vec2) => ({ x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 });

/** 加一条路段（端点取整、同 id 不重复）。 */
export function addNetworkEdge(network: Network, a0: Vec2, b0: Vec2, arterial: boolean, bridge = false, primary = false): void {
  const a = keyOf(a0); const b = keyOf(b0);
  const from = roadNodeId(a); const to = roadNodeId(b); if (from === to) return;
  const id = [from, to].sort().join("/");
  network.nodes.set(from, { ...a, id: from }); network.nodes.set(to, { ...b, id: to });
  if (!network.edges.has(id)) network.edges.set(id, { id, from, to, width: primary ? 12 : arterial ? 8 : 5, kind: arterial ? "arterial" : "local", points: [a, b], bridge });
}

// ── 网络优先批次 3：事务式 NetworkPatch（设计 §4.3 / §5B）─────────────────────────────
// 补丁 = 在 baseVersion 之上的一组原子操作（加边、删边、拆边成 T 口）。提交流程：
// 草稿（深拷贝）上应用 → 校验 → 版本匹配 → 一次替换正式网络；任一步失败丢弃草稿，
// 正式网络零改动（失败无副作用，设计 §5A-7）。本批只提供原语与守卫证明，
// connectToNetwork 等调用方的迁移随后分批（迁移期间基线必须保持不变）。

export type NetworkPatch = {
  /** 基于的正式网络版本（乐观锁：提交时 network.version 必须相等）。 */
  baseVersion: number;
  addEdges: Array<{ a: Vec2; b: Vec2; arterial: boolean; bridge?: boolean; primary?: boolean }>;
  removeEdgeIds: string[];
  /** 顺带清掉因此无任何关联边的孤立节点（重锚/裁断的合并残点；桥头落地环批次）。
   *  提交时该节点必须已是草稿里的孤立点（应用全部操作后无任何边引用），否则拒绝。 */
  removeNodeIds?: string[];
  /** 把一条边在 t 点拆成两段（T 口）：保留原边等级/宽度/桥标记，属性继承不丢失。 */
  splits: Array<{ edgeId: string; at: Vec2 }>;
};

export type PatchResult = { ok: true; version: number } | { ok: false; reason: "stale-base" | "unknown-edge" | "validation" | "self-loop" | "node-in-use"; detail?: string };

const clone = (network: Network): Network => ({
  nodes: new Map([...network.nodes].map(([k, n]) => [k, { ...n }])),
  edges: new Map([...network.edges].map(([k, e]) => [k, { ...e, points: e.points.map((p) => ({ ...p })) }])),
});

/** 在草稿上应用补丁操作（只动草稿）。 */
function applyOps(draft: Network, patch: NetworkPatch): PatchResult {
  for (const id of patch.removeEdgeIds) {
    if (!draft.edges.has(id)) return { ok: false, reason: "unknown-edge", detail: id };
    draft.edges.delete(id);
  }
  for (const s of patch.splits) {
    const host = draft.edges.get(s.edgeId);
    if (!host) return { ok: false, reason: "unknown-edge", detail: s.edgeId };
    const at = keyOf(s.at);
    if (roadNodeId(at) === host.from || roadNodeId(at) === host.to) return { ok: false, reason: "self-loop", detail: `split at endpoint of ${s.edgeId}` };
    draft.edges.delete(s.edgeId);
    const arterial = host.kind === "arterial";
    addNetworkEdge(draft, host.points[0], s.at, arterial, host.bridge, host.width >= 12);
    addNetworkEdge(draft, s.at, host.points[host.points.length - 1], arterial, host.bridge, host.width >= 12);
  }
  for (const e of patch.addEdges) {
    addNetworkEdge(draft, e.a, e.b, e.arterial, e.bridge ?? false, e.primary ?? false);
  }
  // 节点清除放在全部操作之后：此刻仍被引用的节点不许删（调用方对合并残点的判断错了就如实拒绝）。
  for (const id of patch.removeNodeIds ?? []) {
    if (!draft.nodes.has(id)) return { ok: false, reason: "node-in-use", detail: `missing node ${id}` };
    let used = false;
    for (const e of draft.edges.values()) if (e.from === id || e.to === id) { used = true; break; }
    if (used) return { ok: false, reason: "node-in-use", detail: `node ${id} still has edges` };
    draft.nodes.delete(id);
  }
  return { ok: true, version: 0 };
}

/**
 * 事务提交：baseVersion 不匹配（stale-base）或校验不过 → 正式网络保持原样。
 * validate 在草稿上跑（连通/净空等调用方语义）；拆边保留原边属性是原语承诺。
 */
export function commitNetworkPatch(
  network: Network & { version?: number },
  patch: NetworkPatch,
  validate?: (draft: Network) => string | null,
): PatchResult {
  if ((network.version ?? 0) !== patch.baseVersion) return { ok: false, reason: "stale-base", detail: `base ${patch.baseVersion} != current ${network.version ?? 0}` };
  const draft = clone(network);
  const applied = applyOps(draft, patch);
  if (!applied.ok) return applied;
  const problem = validate?.(draft) ?? null;
  if (problem) return { ok: false, reason: "validation", detail: problem };
  // §4.3「版本匹配后一次替换」：交换前复核（validate 回调不得重入提交同一网络——契约见函数头）。
  if ((network.version ?? 0) !== patch.baseVersion) return { ok: false, reason: "stale-base", detail: "version changed during validation" };
  // 批次 4-2：就地清写而非换 Map——buildPlan 顶部解构的 { nodes, edges } 引用在事务提交后仍指向正式网络。
  network.nodes.clear(); for (const [k, n] of draft.nodes) network.nodes.set(k, n);
  network.edges.clear(); for (const [k, e] of draft.edges) network.edges.set(k, e);
  network.version = (network.version ?? 0) + 1;
  return { ok: true, version: network.version };
}
