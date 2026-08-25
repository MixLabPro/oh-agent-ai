// 纯派生函数：把投影的原始数据变成页面要显示的数字/结构。全部不碰
// DOM/时钟/随机数，可以直接下断言。
import { SEVERITY_ORDER, formatNumber } from '../../styles'
import { type Lang, t } from '../../i18n'
import type {
  RequestMetrics, RequestRow, ContextPeak, FindingGroupedRow, Finding,
  WasteFinding, Usage, LoopCost,
} from './types'
import { noteKey } from './notes'

// 全会话上下文占用的最大值。**跳过 context_tokens 为 null 的行**（真实会话
// 687 行里有 13 行缺）：那些请求不是「占用 0」，是没测到。拿 0 参与比较虽然
// 不影响最大值，却会让「算了多少行」说错，所以 measured/total 两个数都要返回。
export function contextPeak(rm: RequestMetrics | undefined): ContextPeak | null {
  const rows = rm?.requests
  if (!rows || rows.length === 0) return null
  let best: RequestRow | null = null
  let measured = 0
  for (const r of rows) {
    if (r.context_tokens == null) continue
    measured++
    if (best === null || r.context_tokens > (best.context_tokens as number)) best = r
  }
  if (best === null) return null
  const tokens = best.context_tokens as number
  const window = best.context_window
  return {
    tokens,
    window,
    // 分母缺失时 pct 为 null，不退化成"按某个默认上限算"——上限随模型变，
    // 编一个默认值出来就是把「没上报」伪造成「测到了」。
    pct: window ? tokens / window : null,
    turn: best.turn,
    requestSeq: best.request_seq,
    measured,
    total: rows.length,
  }
}

/** 严重度序里最靠前的那条；peers 是同级里还有几条。
 *
 * **吃的是去重后的行**（AC-01：顶部、过滤器、标题、列表必须同一套口径）。
 * 早先这里吃原始 findings，于是异常卡显示 8 条、标题显示 7 条，同一页上两个
 * 数当场打架——`SV610 ×2` 是一次 finding 的两次 occurrence，不是两条 finding。 */
export function topFinding(findings: FindingGroupedRow[]): { f: FindingGroupedRow; peers: number } | null {
  for (const sev of SEVERITY_ORDER) {
    const hits = findings.filter(x => x.severity === sev)
    if (hits.length > 0) {
      // 同级取 seq 最大的（最近发生的那条），与 findings 列表的排序一致。
      const f = hits.reduce((a, b) => ((b.latestSeq ?? -1) > (a.latestSeq ?? -1) ? b : a))
      return { f, peers: hits.length - 1 }
    }
  }
  return null
}

/** 前 N 条，排序口径与 topFinding/主队列一致（严重度优先，同级按 seq 降序）。
 * 异常 KPI 卡的内联展开（P1-05）要预览"最严重的几条"，不是只取第一条，
 * 抽出来复用同一套排序而不是各写一遍。 */
export function topFindings(findings: FindingGroupedRow[], n: number): FindingGroupedRow[] {
  const out: FindingGroupedRow[] = []
  for (const sev of SEVERITY_ORDER) {
    out.push(...findings.filter(x => x.severity === sev)
      .sort((a, b) => (b.latestSeq ?? -1) - (a.latestSeq ?? -1)))
  }
  return out.slice(0, n)
}

// G1 预算阈值判定——**纯只读比较，不产生任何拦截语义**（PRD §3.2/§3.3：控件
// 存在的前提是背后有真实生效的能力，这里背后只有"换个颜色"，没有别的）。
//
// 只分两档而不是逐字照抄 backlog 写的"70%/85%"两个检查点：可用的设计 token
// 只有 T.warn / T.error 两色（同 SEVERITY 的 warning/critical），"85%"没有
// 第三种颜色可用；具体百分比数字本身已经带出更细的信号（70% 和 91% 显示的
// 文案不同），颜色只需要回答"要不要紧"这一个二元问题。budget<=0 视为未设置
// ——0 或负数预算除出来的比例没有意义。
export type BudgetLevel = 'ok' | 'near' | 'over'
export const BUDGET_NEAR_THRESHOLD = 0.7

export function budgetStatus(total: number | null, budget: number | null): { ratio: number; level: BudgetLevel } | null {
  if (total == null || budget == null || budget <= 0) return null
  const ratio = total / budget
  const level: BudgetLevel = ratio >= 1 ? 'over' : ratio >= BUDGET_NEAR_THRESHOLD ? 'near' : 'ok'
  return { ratio, level }
}

export function formatPct(x: number, digits = 1): string {
  return (x * 100).toFixed(digits).replace(/\.0$/, '') + '%'
}

/**
 * 占比的自适应精度：≥10% 取整（23%），<10% 留一位（0.5%）。
 *
 * 固定取整会把小占比抹成没有信息的「0%」或「1%」——而小占比恰恰是这里最想
 * 说的话：缓存命中占了 18.1% 的输入 token，却只占账单的 0.5%。那个 0.5 不能
 * 被四舍五入掉。
 */
export function formatShare(x: number): string {
  return formatPct(x, x >= 0.1 ? 0 : 1)
}

// usage 字段名 → 展示标签 key。unreported_fields 用日志里的 camelCase 名。
export const UNREPORTED_LABEL: Record<string, string> = {
  inputTokens: 'inputLabel', outputTokens: 'outputLabel',
  cacheReadTokens: 'cacheReadLabel', cacheWriteTokens: 'cacheWriteLabel',
}

export function formatTokens(usage: Usage | undefined, lang: Lang, unreported?: string[]): string | null {
  if (!usage) return null
  const rows: string[] = []
  const isUnreported = (f: string) => Array.isArray(unreported) && unreported.indexOf(f) !== -1
  // 「宿主从未上报」优先于数值：DSH 的 tokenUsage 会把缺席字段填成 0，直接渲染
  // 那个 0 等于替宿主编造了一次测量。宁可写「未上报」，也不给一个假数。
  const push = (field: string, value: number | undefined) => {
    const label = t(lang, UNREPORTED_LABEL[field])
    if (isUnreported(field)) { rows.push(label + ' ' + t(lang, 'unreportedValue')); return }
    if (value !== undefined) rows.push(label + ' ' + formatNumber(value))
  }
  push('inputTokens', usage.uncachedInputTokens)
  push('outputTokens', usage.outputTokens)
  push('cacheReadTokens', usage.cacheReadTokens)
  push('cacheWriteTokens', usage.cacheWriteTokens)
  if (!rows.length) return null
  const text = rows.join(' · ')
  const sum = (usage.uncachedInputTokens || 0) + (usage.outputTokens || 0) +
    (usage.cacheReadTokens || 0) + (usage.cacheWriteTokens || 0)
  if (sum > 0 && (usage.uncachedInputTokens || 0) / sum >= 0.99) return text + '  — ' + t(lang, 'inputDominatesCost')
  return text
}

export function dedupeFindings(items: Finding[]): FindingGroupedRow[] {
  const map = new Map<string, FindingGroupedRow>()
  for (const f of items) {
    const key = noteKey(f.session_id ?? '', f.rule, f.evidence)
    const existing = map.get(key)
    const w = f as Partial<WasteFinding>
    if (!existing) {
      map.set(key, {
        key, rule: f.rule, severity: f.severity, category: f.category, tool_name: f.tool_name,
        evidence: f.evidence, count: 1, seqs: f.seq != null ? [f.seq] : [],
        latestSeq: f.seq, latestTime: f.time, evidence_recency: f.evidence_recency,
        turn: f.turn, step: f.step, call_id: f.call_id,
        // 浪费独有的两个字段——行为 finding 上是 undefined，展开详情据此
        // 决定要不要多出「影响量级 / 建议」两行。
        ...(w.waste_tokens !== undefined ? { waste_tokens: w.waste_tokens, suggestion: w.suggestion } : {}),
      })
      continue
    }
    existing.count++
    if (f.seq != null) existing.seqs.push(f.seq)
    if ((f.seq ?? -Infinity) > (existing.latestSeq ?? -Infinity)) {
      existing.latestSeq = f.seq
      existing.latestTime = f.time
      existing.evidence_recency = f.evidence_recency
      existing.turn = f.turn
      existing.step = f.step
      existing.call_id = f.call_id
    }
    // 合并同一 (rule, evidence) 的多次浪费时，影响量级要累加——**不是取最后
    // 一次**。两次各浪费 1K 就是浪费了 2K。
    if (w.waste_tokens !== undefined) {
      existing.waste_tokens = (existing.waste_tokens || 0) + w.waste_tokens
      existing.suggestion = existing.suggestion || w.suggestion
    }
  }
  return [...map.values()]
}

/**
 * 给浪费行标出"同一个 turn 里还有哪几条 finding"。
 *
 * 起因：真实会话里 SV613（连续 5 次工具失败）和 SV-COST-02（T70 期间上下文
 * 增长 1,964 token）说的是同一段过程；并排两条不加说明，用户会读成出了两件
 * 事——原型就是并排两张卡片、什么都没说。
 *
 * 但**这里只陈述共现，不断言因果**。第一版写的是「是同一起事件」，跑真实
 * 数据才发现 T70 同时还有一条 SV604（写 `~/.ssh/authorized_keys`），跟那段
 * 工具失败八竿子打不着——turn 相邻只支撑得起"同一个 turn 里还有这些"，
 * 支撑不起"这就是同一件事"。要真断言因果，得比对 evidence 里引用的具体
 * 事件，那是规则引擎的活，不是展示层能替它下的结论。
 */
export function linkWasteToFindings(rows: FindingGroupedRow[]): void {
  const behaviorByTurn = new Map<number, string[]>()
  for (const r of rows) {
    if (r.waste_tokens !== undefined || r.turn == null) continue
    const list = behaviorByTurn.get(r.turn) || []
    if (!list.includes(r.rule)) list.push(r.rule)
    behaviorByTurn.set(r.turn, list)
  }
  for (const r of rows) {
    if (r.waste_tokens === undefined || r.turn == null) continue
    const peers = behaviorByTurn.get(r.turn)
    if (peers && peers.length > 0) r.xrefRules = peers
  }
}

/**
 * 把 `loopCosts` 投影（G2，GOVERNANCE_BACKLOG.md）的结果拼回对应的 finding
 * 行——按 `(rule, seq)` 对齐，**累加这一行合并进来的每一次命中**，不是只取
 * 最近一次。
 *
 * 曾经的实现只按 `latestSeq` 关联最近一次命中，注释里假设"这三条规则的
 * evidence 文本带着次数/turn 号，同一 (rule, evidence) 不会有第二次命中"——
 * 这个假设是错的：SV611 的 evidence 只写"{工具名} 连续重复 {次数} 次"，不含
 * 具体参数，两段互不相关、发生在不同 seq 的重复调用只要次数相同文本就完全
 * 一样；SV613 同理，只编码"连续几次 + 首个错误码"。两段不相关的命中一旦
 * 撞出同一段 evidence，就会被 `dedupeFindings` 按 `(session, rule, evidence)`
 * 并成一行，只按 `latestSeq` 取值会把前面那次的消耗静默丢掉——显示的"这段
 * 循环消耗了 X token"其实是低估的（真实审计发现的问题，2026-08-25）。
 *
 * 现在改成：`FindingGroupedRow.seqs` 本来就攒了这一行合并进来的**全部** seq
 * （`dedupeFindings` 早就在维护），逐个去 `loopCosts` 里找对应的条目、能找到
 * 几条就求和几条。`tokens`/`cost` 分别独立求和——某次命中的区间算不出 cost
 * 不该连累另一次算得出的那部分（null-vs-0 的老纪律：只有一条命中都对不上时
 * 才整体置 null）。
 */
export function linkLoopCostToFindings(rows: FindingGroupedRow[], loopCosts: LoopCost[] | undefined): void {
  if (!loopCosts || loopCosts.length === 0) return
  const byKey = new Map<string, LoopCost>()
  for (const lc of loopCosts) byKey.set(lc.rule + ':' + lc.seq, lc)
  for (const r of rows) {
    const hits = r.seqs
      .map(seq => byKey.get(r.rule + ':' + seq))
      .filter((x): x is LoopCost => x !== undefined)
    if (hits.length === 0) continue
    const tokenHits = hits.filter(h => h.tokens != null)
    const costHits = hits.filter(h => h.cost != null)
    r.loop_tokens = tokenHits.length > 0 ? tokenHits.reduce((s, h) => s + (h.tokens as number), 0) : null
    r.loop_cost = costHits.length > 0 ? costHits.reduce((s, h) => s + (h.cost as number), 0) : null
    r.loop_occurrences = hits.length
  }
}
