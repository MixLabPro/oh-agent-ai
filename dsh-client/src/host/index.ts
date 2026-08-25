// Host half of the audit plugin: registers the `behaviorFindings` and
// `tokenByModel` session projections. The host is the only computation site
// (DSH projection push model) — it folds raw session events through the Rust
// behavior rules (compiled to wasm) and publishes the findings; the client
// half only reads useProjection.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { initSync, audit_events, token_by_model, request_metrics, context_composition, compaction_events, subagent_spawns, structural_waste, skill_audit, skill_audit_enriched, duration_audit } from '../wasm-shim.js'

const here = dirname(fileURLToPath(import.meta.url))

// PRD §9.5 ProjectionMeta（P2 债，此前完全没实现）：`loading`/`error` 是投影
//生命周期状态，由 DSH 的投影框架本身在调用 view() 之前/之外决定（session 还
// 没加载 / 计算抛了异常）——那两态不是这里要算的。这里只算框架决定"可以调用
// view() 了"之后、我们自己知道的那部分：**这次算出来的数据是不是完整**。
// 只覆盖 requestMetrics/contextComposition/compactionEvents/structuralWaste——
// behaviorFindings/tokenByModel 目前是 AuditView.tsx 已经在消费的形状，要接
// ProjectionMeta 得同时改客户端，那是 UI 接线那一轮的事，不在这次的 P2 债里。
//
// 字段名故意跟数据字段的大小写风格不一致：`missingFields`/`status` 用驼峰，
// 跟 PRD §9.5 的 TS 接口定义一致——是宿主这层自己算出来的元信息，不是 wasm
// 透传的原始字段，跟 snake_case 的数据字段分得清楚，不是疏漏。
/** 折叠状态上由宿主注入的分叉边界。`null` = 该会话没分叉（不是"未知"）。 */
type Seeded<T> = T & { seed?: number | null }

/** DSH 传给钩子的会话头。`seedLength` 只在从上游 branch 出来时出现。 */
type SessionArg = { id: string; header?: { cwd?: string; seedLength?: number } }

type ProjectionMeta = { status: 'complete' | 'partial'; missingFields: string[] }
const metaSchema = { status: z.enum(['complete', 'partial']), missingFields: z.array(z.string()) }

function completeIf(missingFields: string[]): ProjectionMeta {
  return { status: missingFields.length === 0 ? 'complete' : 'partial', missingFields }
}

// Instantiate the wasm once at module load.
const wasmModule = new WebAssembly.Module(readFileSync(join(here, '../skill_vitals_wasm_bg.wasm')))
initSync({ module: wasmModule })

// 价格表：宿主是 Node，跟 CLI 一样能直接读文件——不是浏览器，不受"client 读不到
// repo 文件"那条约束（AuditView.tsx 的 PRICING 内嵌副本是为浏览器渲染模型短名
// 准备的，见 styles/index.ts 顶部注释；那份副本现在只管显示，不再算钱）。这里
// 读的是 build 时复制进包里的同一份 `scripts/skill_vitals/pricing.json`
// （见 package.json 的 build 说明），不是又手抄一份数字——价格改了只用改
// pricing.json 一处，dsh-client 的 pkg build 会带上新值。
const pricing = JSON.parse(readFileSync(join(here, '../pricing.json'), 'utf8'))

// `_norm_model`/`_price`/`model_short` 的 JS 镜像（Python: scripts/skill_vitals/
// cost.py，Rust: src/cost.rs::cost_report）——三种语言算同一套价目表，算法必须
// 逐行对得上；跑 `npm run verify:host` 里对真实 fixture 的断言即是这份镜像的
// 差分守护（CLI 侧另有 test_cli_matrix.py 的 both() 逐字节比对）。
function modelsOf(provider: string | null | undefined): Record<string, any> | null {
  if (!provider) return null
  return pricing.providers?.[provider]?.models ?? null
}

function normModelIn(model: string, cards: Record<string, any>): string | null {
  const seg = String(model).split('/').pop()
  if (!seg) return null
  for (const key in cards) {
    if (seg === key || seg.startsWith(key)) return key
  }
  return null
}

/** 解析 (供应商, 模型) 实际适用的价格卡。顺序：该供应商自己的表 → 回落
 *  fallback_provider（原厂）→ 都没有才算未计价。**回落是有意的默认**：供应商
 *  没报价时给一个标注了来源的估算比什么都不给有用，但 basis 必须传到展示层
 *  写明「按原厂报价估算」，否则就是拿别家的价冒充实价。 */
const AMBIGUOUS_PROVIDER = '__ambiguous__'

function resolveCard(model: string, provider: string | null):
    { key: string; providerKey: string; basis: 'provider' | 'fallback' | 'ambiguous' } | null {
  // 归属不明：哨兵不是真实供应商名，查不到它的表，会一路掉到回落分支。单独
  // 认出来是为了让展示层说对话——也顺带保证这个内部哨兵**永远不会**被当成
  // 供应商名渲染给用户看。
  const ambiguous = provider === AMBIGUOUS_PROVIDER
  const own = ambiguous ? null : modelsOf(provider)
  if (own) {
    const key = normModelIn(model, own)
    if (key) return { key, providerKey: provider as string, basis: 'provider' }
  }
  const fb = pricing.fallback_provider
  const cards = modelsOf(fb)
  if (!cards) return null
  const key = normModelIn(model, cards)
  if (!key) return null
  return { key, providerKey: fb, basis: ambiguous ? 'ambiguous' : 'fallback' }
}

function modelShortHost(model: string): string {
  const cards = modelsOf(pricing.fallback_provider)
  const key = cards ? normModelIn(model, cards) : null
  return key ?? String(model).split('/').pop()?.slice(0, 24) ?? ''
}

// cacheReadCost 不是另一个独立的桶——它已经算在 total 里，是 total 内部一个
// 单独留出来的切面，专门回答"缓存命中帮我省了多少钱"（Rust/Python 侧同名
// 字段见 src/cost.rs::Price / cost.py::_price 的同一处注释）。
function bucketPrice(buckets: any, modelKey: string, providerKey: string): { total: number; peak: number; cacheReadCost: number } {
  const card = pricing.providers[providerKey].models[modelKey]
  const uPeak = (buckets.peak_uncached_input_tokens || 0) / 1e6
  const cPeak = (buckets.peak_cache_read_tokens || 0) / 1e6
  const oPeak = (buckets.peak_output_tokens || 0) / 1e6
  const uOff = (buckets.uncached_input_tokens || 0) / 1e6 - uPeak
  const cOff = (buckets.cache_read_tokens || 0) / 1e6 - cPeak
  const oOff = (buckets.output_tokens || 0) / 1e6 - oPeak
  const cacheReadCost = cOff * card.input_cached.off_peak + cPeak * card.input_cached.peak
  const off = uOff * card.input_uncached.off_peak + cOff * card.input_cached.off_peak + oOff * card.output.off_peak
  const peak = uPeak * card.input_uncached.peak + cPeak * card.input_cached.peak + oPeak * card.output.peak
  return { total: off + peak, peak, cacheReadCost }
}

/**
 * 逐请求费用序列（FR-04 的「费用」纵轴）。
 *
 * **规则与价格的分工**：哪笔请求算高峰由 core 判定并通过 `is_peak` 透出
 * （见 usage.rs 该字段的注释）——展示层要是自己重算一遍北京 9–12/14–18，
 * 那就是这条规则的第四份拷贝。这里只做「按 is_peak 选一档单价再乘」。
 *
 * `is_peak` 为 null（宿主没上报时间戳）时**这一笔不计价**，返回 null 而不是
 * 当成空闲价——猜一档单价出来就是编数字。累计曲线因此可能低估，由
 * `priced/total` 一并透出，展示层照实说。
 */
function costSeriesFrom(rows: any[], providers?: Record<string, string | null>): { series: { request_seq: number; cumulative: number }[]; priced: number; total: number } {
  const series: { request_seq: number; cumulative: number }[] = []
  let acc = 0
  let priced = 0
  for (const r of rows) {
    // 与 costReportFrom 走同一个解析器——逐请求曲线的单价必须和汇总金额同源，
    // 否则曲线终值跟 KPI 对不上。
    const resolved = resolveCard(r.model, (providers && providers[r.model]) || null)
    if (resolved !== null && r.is_peak !== null && r.is_peak !== undefined) {
      const card = pricing.providers[resolved.providerKey].models[resolved.key]
      const tier = r.is_peak ? 'peak' : 'off_peak'
      acc += ((r.uncached_input_tokens || 0) / 1e6) * card.input_uncached[tier]
        + ((r.cache_read_tokens || 0) / 1e6) * card.input_cached[tier]
        + ((r.output_tokens || 0) / 1e6) * card.output[tier]
      priced++
    }
    series.push({ request_seq: r.request_seq, cumulative: acc })
  }
  return { series, priced, total: rows.length }
}

/**
 * G2（GOVERNANCE_BACKLOG.md）：一段 [seq, run_end_seq] 区间里实际烧了多少
 * token / 钱——`rows` 已经是按区间筛过的 request_metrics 行，这里只求和、
 * 定价，跟 `costSeriesFrom` 走同一套单价解析（`resolveCard` + `is_peak`
 * 选档），不是又发明一套算法。
 *
 * `tokens`/`cost` 为 `null` 表示「算不出」（区间内没有任何请求行 / 没有任何
 * 一行能定到价），不是 0——0 留给「确实统计到了、加总正好是 0」这个真实
 * 结果，跟 `costReportFrom`/`SubUsage` 已有的 null-vs-0 纪律一致。
 */
function loopCostFor(rows: any[], providers?: Record<string, string | null>): { tokens: number | null; cost: number | null } {
  let tokens = 0
  let cost = 0
  let priced = 0
  for (const r of rows) {
    tokens += (r.uncached_input_tokens || 0) + (r.cache_read_tokens || 0) + (r.output_tokens || 0)
    const resolved = resolveCard(r.model, (providers && providers[r.model]) || null)
    if (resolved !== null && r.is_peak !== null && r.is_peak !== undefined) {
      const card = pricing.providers[resolved.providerKey].models[resolved.key]
      const tier = r.is_peak ? 'peak' : 'off_peak'
      cost += ((r.uncached_input_tokens || 0) / 1e6) * card.input_uncached[tier]
        + ((r.cache_read_tokens || 0) / 1e6) * card.input_cached[tier]
        + ((r.output_tokens || 0) / 1e6) * card.output[tier]
      priced++
    }
  }
  return { tokens: rows.length > 0 ? tokens : null, cost: priced > 0 ? cost : null }
}

// usage（tokenByModel 的 view() 输出）× 价格表 → 结构化成本。`cost_report` 的
// TS 镜像：per_model 为空且 unpriced_tokens 为 0 时代表「没有可分桶的桶」——
// 与 Rust/Python 返回 None 同一语义，这里用全 null 的形状表达（DSH 的
// register() 需要固定 schema，不能像 Option 那样整体变成 null）。
// unpriced_tokens > 0 记作 partial：不是宿主漏报了字段（跟其余四个 P2 投影
// 的 missingFields 语义不同），是「有模型不在报价单里，这笔钱算不出」——
// 消费方看到 partial 就知道 total 是低估，不是精确值，语义结果一致。
function costReportFrom(usage: { by_model: Record<string, any>; providers?: Record<string, string | null> }) {
  const byModel = usage.by_model || {}
  const providers = usage.providers
  let total = 0
  let peakTotal = 0
  let unpriced = 0
  const perModel: Record<string, { short_name: string; provider: string | null; pricing_basis: string; priced_with: string; total: number; peak: number; cache_read_cost: number }> = {}
  for (const model in byModel) {
    const buckets = byModel[model]
    // 价目表**按供应商分层**（与 Rust/Python cost_report 同一套解析）：真实
    // 日志里 provider=shengsuanyun 的 pro 和 provider=deepseek-official 的
    // flash 并存，两家报价不同。顺序见 resolveCard：该供应商自己的表 → 回落
    // 原厂 → 未计价。回落必须带着 basis 传到展示层写明「按原厂报价估算」。
    const provider = (providers && typeof providers[model] === 'string') ? providers[model] as string : null
    const resolved = resolveCard(model, provider)
    if (resolved === null) {
      unpriced += (buckets.uncached_input_tokens || 0) + (buckets.cache_read_tokens || 0) + (buckets.cache_write_tokens || 0)
      continue
    }
    const { key, providerKey, basis } = resolved
    const p = bucketPrice(buckets, key, providerKey)
    total += p.total
    peakTotal += p.peak
    perModel[model] = {
      short_name: modelShortHost(model),
      // 展示层要按 (供应商, 模型) 拆行——只给模型名的话，用户拿这张表跟
      // 任何一家的账单都对不上（同一会话可能横跨两家）。
      // 归属不明时 provider 落 null——'__ambiguous__' 是内部哨兵，绝不能作为
      // 供应商名渲染给用户看。
      provider: basis === 'ambiguous' ? null : provider,
      // 这一行是按谁的报价算的。非 provider 时展示层必须说明依据。
      pricing_basis: basis,
      priced_with: providerKey,
      total: p.total, peak: p.peak, cache_read_cost: p.cacheReadCost,
    }
  }
  if (Object.keys(perModel).length === 0 && unpriced === 0) {
    return {
      currency: null, estimate_disclaimer: null, total: null, peak_total: null,
      per_model: {}, unpriced_tokens: 0, ...completeIf([]),
    }
  }
  const missing = unpriced > 0 ? ['unpriced_tokens'] : []
  return {
    currency: 'CNY', estimate_disclaimer: '估算值，不是账单',
    total, peak_total: peakTotal, per_model: perModel, unpriced_tokens: unpriced,
    ...completeIf(missing),
  }
}

// ── 子代理会话的用量 ─────────────────────────────────────────────────────
//
// 用户要的是「这个会话总共花了多少」= 本会话 + 各子代理。子代理跑在**各自
// 独立的 session 文件**里，父会话的事件流里根本没有它们的 usage 事件，所以
// 只能去读文件。实测 session-e4b0be69：本会话 ¥433.30 + 5 个子代理 ¥69.74。
//
// 三条实现约束：
//   1. **不逆向 DSH 的目录名编码。**会话目录名是 cwd 的某种 slug
//      （`--Users-Admin-projects-…--`），那是 DSH 内部格式、会变。改为在
//      sessions/*/ 下按 agent_id 直接找目录——一次浅扫，稳。
//   2. **必须缓存。**单个会话解压 71ms（1.3MB 压缩 → 2.9MB / 4409 行），
//      5 个就是 350ms；projection 的 view() 每次事件都会跑，不缓存必卡。
//   3. **一律 try/catch 降级。**读不到就报 null，绝不让审计 tab 因为读不了
//      兄弟会话而整个崩掉——那是锦上添花的数据，不是主线。
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** DSH 的会话日志是**多帧追加**写的：zstdDecompressSync 只解第一帧
 *  （1.3MB 的文件会只解出 280 字节，正好是个 session 头，看着像"空会话"——
 *  查这个问题时先被这个坑骗过一次）。必须逐帧解。 */
function readZstdFrames(file: string): string {
  const buf = readFileSync(file)
  let off = 0
  const parts: Buffer[] = []
  while (off < buf.length) {
    const next = buf.indexOf(ZSTD_MAGIC, off + 4)
    try { parts.push(zstdDecompressSync(buf.subarray(off, next === -1 ? buf.length : next))) } catch { /* 跳过坏帧 */ }
    if (next === -1) break
    off = next
  }
  return Buffer.concat(parts).toString('utf8')
}

function sessionsRoot(): string {
  return process.env.DSH_HOME
    ? join(process.env.DSH_HOME, 'sessions')
    : join(process.env.HOME || '', '.dsh', 'sessions')
}

function locateSession(agentId: string): string | null {
  try {
    const root = sessionsRoot()
    for (const ws of readdirSync(root)) {
      const f = join(root, ws, agentId, 'session.jsonl.zstd')
      if (existsSync(f)) return f
    }
  } catch { /* 目录不在 / 没权限 —— 降级 */ }
  return null
}

// P0-01（真实审计 2026-08-25 发现）：`skill_invocations` 是子代理**自己**
// 解析出来的 Skill 调用——`null` 表示这个子会话读不到/解析失败（跟
// `total`/`tokens` 那几个字段的 null-vs-0 是同一条纪律），`[]` 是"读到了，
// 这个子代理确实一次 Skill 都没调"，两者不是同一件事。
type SubUsage = {
  agent_id: string; total: number | null; tokens: number | null; findings: number | null
  duration_ms: number | null; skill_invocations: any[] | null
}
const subCache = new Map<string, SubUsage>()

/** 子会话自己事件流的时间跨度（最后一个事件的 time − 第一个事件的 time）。
 * 原生 DSH UI 会显示子代理跑了多久（用户观察到的现象）——这就是那个数字的
 * 来源：子会话没有专门的"总耗时"事件，只能从它自己完整的事件流两端量出来。
 * 只有一个带 time 的事件时跨度就是 0，这是真的 0，不是"没测到"；一个带
 * time 的事件都没有才是 null。 */
function eventSpanMs(events: any[]): number | null {
  let min: number | null = null
  let max: number | null = null
  for (const e of events) {
    const t = e?.time
    if (typeof t !== 'number') continue
    if (min === null || t < min) min = t
    if (max === null || t > max) max = t
  }
  return min !== null && max !== null ? max - min : null
}

/** 读一个子代理会话，折出它的费用、用量与**它自己**的 Skill 调用。读不到时
 * 每一项都是 null——**不是 0**。
 *
 * P0-01（真实审计 2026-08-25 发现）：这个函数曾经只算费用/Token/finding
 * 数/时长，从不解析子代理自己的 Skill 调用——`skillAudit` 投影却拿它的
 * `total !== null`（费用算得出）当"Skill 已覆盖"的判据，两件事被错误地
 * 划了等号：日志能读到（因而算得出费用）不等于"这个子代理调过的 Skill
 * 已经被审计过"，因为压根没有代码去做后面这件事。现在真的调
 * `skill_audit_enriched` 解析这个子会话自己的事件流——`total !== null`
 * 与"Skill 已覆盖"现在才是同一件事（都取决于同一次文件读取是否成功）。
 *
 * 只读**这一层**子代理自己的 Skill 调用，不递归到它自己派生的孙子代理
 * （`spawnsJson` 仍然喂给 `skill_audit_enriched`，让它能给这一层内部
 * 触发的 model_selected 调用回填 agent_id，但那些孙子代理各自的 Skill
 * 事件本身不在这个函数的审计范围内）——跟 `subagentUsage` 原本"只读一层"
 * 的既有取舍一致，不是这次改动新引入的限制。真要多层审计，需要在这里
 * 加真正的递归，是比这次修复更大的一次改动，故意不在这次里做。
 */
function subagentUsage(agentId: string): SubUsage {
  const hit = subCache.get(agentId)
  if (hit) return hit
  const miss: SubUsage = { agent_id: agentId, total: null, tokens: null, findings: null, duration_ms: null, skill_invocations: null }
  const file = locateSession(agentId)
  if (!file) { subCache.set(agentId, miss); return miss }
  try {
    const events: any[] = []
    for (const line of readZstdFrames(file).split('\n')) {
      if (!line) continue
      try { events.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
    }
    const json = JSON.stringify(events)
    const usage = JSON.parse(token_by_model(json))
    const cost = costReportFrom(usage)
    const buckets: any[] = Object.values(usage.by_model || {})
    // 子会话自己的 Skill 调用：跟主会话 skillAudit 投影用的是同一套三段
    // 契约（execEvents 类比整份原始事件流——一次性读文件不像主会话按事件
    // 白名单增量折叠，直接喂全量更简单；requests/spawns 供 request_seq
    // 定位与 model_selected 的 agent_id 回填）。
    const requestsJson = request_metrics(json)
    const spawnsJson = subagent_spawns(json)
    const skillInvocations = JSON.parse(skill_audit_enriched(json, requestsJson, spawnsJson)).enriched
    const out: SubUsage = {
      agent_id: agentId,
      total: cost.total,
      tokens: buckets.length
        ? buckets.reduce((s, b) => s + (b.uncached_input_tokens || 0) + (b.cache_read_tokens || 0) + (b.output_tokens || 0), 0)
        : null,
      // 子会话自己的 cwd 拿不到（它有自己的 header，但我们只喂了事件），
      // SV605 因此退化为绝对路径启发式——core 里有明确的降级约定。
      findings: JSON.parse(audit_events(json, '')).length,
      duration_ms: eventSpanMs(events),
      skill_invocations: skillInvocations,
    }
    subCache.set(agentId, out)
    return out
  } catch {
    subCache.set(agentId, miss)
    return miss
  }
}

// Event types the behavior rules (SV601–SV614) consume.
const RELEVANT_TYPES = new Set([
  'tool/call',
  'tool/code-dispatch-start',
  'tool/code-dispatch',
  'tool/result',
  'approval/asked',
  'approval/decided',
  'sandbox/mode',
  // 边界事件：本身不产 finding，但 core 的 Coords 靠它们顺延 turn/step。
  // 真实日志里 approval/asked 完全不带 turn/step（0/2），只能从这里拿到；
  // SV612/SV613 的 turn 分组也依赖 turn/start·turn/end。
  'turn/start',
  'turn/end',
  'step/start',
  'step/end',
  // 会话分叉边界。本身不产 finding，但 core 的 post_fork 靠它划出「这个会话
  // 自己干的」与「从上游 branch 时抄进来的历史」——不放行的话浏览器里看到的
  // 仍是把上游那笔账算了两遍的数字（见 core util::fork_boundary 的实测）。
  'session/end-seed',
])

// cwd 捕获：session/created 在新建和恢复/重放的 session 上都会触发（重放把
// 历史事件整段作为 constructor seed 灌入），且提供真正的 Session 对象。
// 用它做两件事：①记 cwd；②立刻主动调用 snapshot() 强制把这个 session 的投影
// cell 建好——这次建 cell 发生在同步调用栈里，activeSessionId 保证 apply() 第
// 一次执行时能查到正确的 sessionId。活事件路径（session/event）同样用
// activeSessionId，不再需要 WeakMap<event, sessionId>。
const cwdBySession = new Map<string, string>()
// 会话分叉边界，与 cwd 同一条捕获路径。core 的 post_fork 只认日志头的
// `seedLength`——**不能用 `session/end-seed` 事件**：那个标记的是「一段续种
// 结束」，会话每次被唤醒都会触发。真实日志 session-6b47acc7 完全没分叉，却
// 有一个 end-seed 落在最后一个事件上，按事件判会把整个会话丢光（UI 上费用/
// 上下文/常驻前缀/子代理全变「不可用」——就是这么被发现的）。
const seedBySession = new Map<string, number | null>()
let activeSessionId: string | null = null

// Wire schema matching the Rust finding shape:
// { rule, severity, category, tool_name, evidence, seq, time, evidence_recency }
const findingSchema = z.array(z.object({
  rule: z.string(),
  severity: z.string(),
  category: z.string(),
  tool_name: z.string().nullable(),
  evidence: z.string(),
  seq: z.number().nullable(),
  time: z.number().nullable(),
  // 定位坐标：事件自带优先，缺的从 turn/start·step/start 顺延，turn 外为 null。
  // 覆盖率天然不齐（真实日志：tool/call 三者全有，approval/asked 只有 callId，
  // tool/result 没有 callId），所以三者都可空——不齐是事实，不是缺陷。
  turn: z.number().nullable(),
  step: z.number().nullable(),
  call_id: z.string().nullable(),
  // 宿主注入：core 看不到 sessionId（它不在事件流里），但标记必须按会话隔离，
  // 否则 A 会话标记的 finding 会在 B 会话里继承（PRD §5.1 / AC-02 明令禁止）。
  session_id: z.string(),
  evidence_recency: z.string(),
  // G2（GOVERNANCE_BACKLOG.md）：[seq, run_end_seq] 是这条 finding 真实覆盖
  // 的区间终点，只有 SV611/612/613 填真实值，其余（含 SV601–610、SV614）
  // 恒为 null——core 侧的设计取舍见 trajectory.rs::finding 的文档注释。
  // 不声明这个键 zod 会静默把它剥掉（z.object 默认丢弃未声明字段），G2 的
  // 前提字段就白加了。
  run_end_seq: z.number().nullable(),
}))

export const inject = ['sessionProjections']

export function apply(ctx: { on: (event: string, handler: (session: any) => void) => void; sessionProjections: any }) {
  // 先注册捕获钩子，在访问 sessionProjections 之前，这样 snapshot() 能一起建 cell。
  ctx.on('session/created', (session: SessionArg) => {
    cwdBySession.set(session.id, session.header?.cwd ?? '')
    seedBySession.set(session.id, session.header?.seedLength ?? null)
    activeSessionId = session.id
    try {
      ctx.sessionProjections.snapshot(session)
    } finally {
      activeSessionId = null
    }
  })
  ctx.on('session/event', (session: SessionArg) => {
    cwdBySession.set(session.id, session.header?.cwd ?? '')
    seedBySession.set(session.id, session.header?.seedLength ?? null)
    activeSessionId = session.id
  })

  // 分叉边界不是一个事件类型，是日志头的一个数（见 seedBySession 的注释）。
  // 每个投影在第一次 apply 时把它记进自己的 state，view() 再合成一个规整形状
  // 的 `{type:'session', data:{seedLength}}` 塞到事件数组最前面喂给 wasm——
  // core 的 post_fork 认的就是它。
  // 泛型而不是 any：它给 state 挂上 seed，类型上必须体现出来，否则各个 view
  // 里读 state.seed 全是 TS2339——而 seed 正是分叉过滤的关键字段，恰恰最不该
  // 失去类型保护（真机上就因为 apply 返回裸对象字面量把它丢过一次）。
  const withSeed = <T extends object>(state: T): Seeded<T> =>
    (state as Seeded<T>).seed !== undefined || activeSessionId === null
      ? (state as Seeded<T>)
      : { ...state, seed: seedBySession.get(activeSessionId) ?? null }
  const seeded = (seed: number | null | undefined, events: any[]) =>
    typeof seed === 'number' && seed > 0
      ? [{ type: 'session', seq: null, time: null, data: { seedLength: seed } }, ...events]
      : events

  // ── sessionCwd projection（阶段 A-5，真实审计 2026-08-25 发现）──────────
  // 导出 JSON 里带着原始 evidence 文本，evidence 里常常嵌着本机绝对路径
  // （SV604/SV605 尤其如此——写文件的证据就是路径本身），路径通常又带着 OS
  // 用户名。审计报告 AC-12 把"导出是否经过 redact 管道"标成发布阻塞项，这个
  //投影就是给 export.ts 的 `redactPath` 提供替换锚点：把会话工作区根路径
  // 换成 `<workspace>`，不丢证据信息（相对路径一样能定位）。
  //
  // 单开一个投影而不是把 cwd 塞进 behaviorFindings 的 view() 输出——
  // behaviorFindings 的 schema 是 core finding 数组的镜像（bare array，不是
  // 对象），硬塞一个 cwd 字段进去要么破坏这个"逐条 finding"的形状，要么把
  // 返回类型从数组改成 {findings, cwd} 对象，牵连到每一个已经假设"这是
  // Finding[]"的消费者。cwd 的捕获方式跟 behaviorFindings 完全一样（同一份
  // cwdBySession，同一次 session/created·session/event 时机），只是不跟着
  // 事件流累积状态——重复这几行比强行共享状态更简单，也不产生新的耦合。
  ctx.sessionProjections.register({
    key: 'sessionCwd',
    schema: z.object({ cwd: z.string() }),
    init: () => ({ cwd: '' }),
    apply(state: { cwd: string }) {
      if (state.cwd === '' && activeSessionId !== null) {
        return { cwd: cwdBySession.get(activeSessionId) ?? '' }
      }
      return state
    },
    view(state: { cwd: string }) {
      return { cwd: state.cwd }
    },
    stateVersion: 1,
  })

  // ── behaviorFindings projection ───────────────────────────────────────────
  ctx.sessionProjections.register({
    key: 'behaviorFindings',
    schema: findingSchema,
    init: () => ({ cwd: '', sessionId: '', events: [] as any[] }),
    apply(state: { cwd: string; sessionId: string; events: any[] }, event: { type: string }) {
      state = withSeed(state)
      if (state.cwd === '' && activeSessionId !== null) {
        state = { ...state, cwd: cwdBySession.get(activeSessionId) ?? '' }
      }
      // sessionId 与 cwd 同路径捕获：core 拿不到它（不在事件流里），只有宿主有。
      if (state.sessionId === '' && activeSessionId !== null) {
        state = { ...state, sessionId: activeSessionId }
      }
      // turn/step 边界事件本身不产 finding，但 Coords 要靠它们顺延坐标——
      // 不放行的话 approval/* 这类不自带 turn 的 finding 永远定位不到 turn。
      if (!RELEVANT_TYPES.has(event.type)) return state
      return { ...state, events: [...state.events, event] }
    },
    view(state: Seeded<{ cwd: string; sessionId: string; events: any[] }>) {
      const findings = JSON.parse(audit_events(JSON.stringify(seeded(state.seed, state.events)), state.cwd))
      return findings.map((f: any) => ({ ...f, session_id: state.sessionId }))
    },
    // G2 加了 run_end_seq——schema（view() 输出契约）变了就要 bump，即便
    // apply/init 的内部状态形状没变（旧缓存的 cell 不会自带这个新键）。
    stateVersion: 5,
  })

  // ── tokenByModel projection ───────────────────────────────────────────────
  ctx.sessionProjections.register({
    key: 'tokenByModel',
    schema: z.object({
      by_model: z.record(z.object({
        uncached_input_tokens: z.number(),
        output_tokens: z.number(),
        cache_read_tokens: z.number(),
        cache_write_tokens: z.number(),
        peak_uncached_input_tokens: z.number(),
        peak_output_tokens: z.number(),
        peak_cache_read_tokens: z.number(),
        peak_cache_write_tokens: z.number(),
      })),
      sequence: z.array(z.string()),
      // 宿主从未上报过的 usage 字段名（camelCase）。真实会话里
      // cacheWriteTokens 一次都不出现——展示层据此写「未上报」而不是「0」，
      // 否则就是把「宿主不报」伪造成「测到了 0」（core 的 usage.rs 有详述）。
      unreported_fields: z.array(z.string()),
    }),
    init: () => ({ events: [] as any[] }),
    apply(state: Seeded<{ events: any[] }>, event: { type: string; data?: any }) {
      state = withSeed(state)
      if (event.type === 'request/header') {
        return { ...state, events: [...state.events, event] }
      }
      if (event.type === 'assistant/message' && event.data?.usage !== undefined) {
        return { ...state, events: [...state.events, event] }
      }
      if (event.type === 'assistant/chunk' && event.data?.chunk?.type === 'usage') {
        return { ...state, events: [...state.events, event] }
      }
      return state
    },
    view(state: Seeded<{ events: any[] }>) {
      return JSON.parse(token_by_model(JSON.stringify(seeded(state.seed, state.events))))
    },
    stateVersion: 2,
  })

  // ── costReport projection ─────────────────────────────────────────────────
  // usage × pricing.json 算出来的钱，宿主侧原生算——此前是 AuditView.tsx 自己
  // 拿 tokenByModel 的输出跑一遍相同的乘法，用一份内嵌在 client 里的 PRICING
  // 副本（浏览器读不到 repo 文件，只能内嵌，靠 test_pricing_lockstep.py 事后
  // 抓漂移）。宿主是 Node，能像 CLI 一样直接读 pricing.json——搬到这里之后
  // client 不再需要自己算价格，PRICING 副本降级为纯展示用途（模型短名，见
  // styles/index.ts）。
  //
  // apply 与 tokenByModel 故意保持同一份事件过滤——cost 是同一批 usage 事件的
  // 派生视图，不是另一路数据；DSH 的 register() 要求每个 projection 自带独立
  // 折叠状态，两份 apply 逐字重复是这个框架下的正确做法（requestMetrics 的
  // 注释也说明了同一取舍）。
  ctx.sessionProjections.register({
    key: 'costReport',
    schema: z.object({
      currency: z.string().nullable(),
      estimate_disclaimer: z.string().nullable(),
      total: z.number().nullable(),
      peak_total: z.number().nullable(),
      per_model: z.record(z.object({
        short_name: z.string(),
        /** 供应商——价目表按它生效，成本表也按 (供应商, 模型) 拆行。 */
        provider: z.string().nullable(),
        /** 'provider' = 用了这家自己的报价；'fallback' = 回落原厂报价，展示层必须说明。 */
        pricing_basis: z.string(),
        priced_with: z.string(),
        total: z.number(),
        peak: z.number(),
        cache_read_cost: z.number(),
      })),
      unpriced_tokens: z.number(),
      // FR-04「费用」纵轴的数据源：截至该请求的累计费用。
      series: z.array(z.object({ request_seq: z.number(), cumulative: z.number() })),
      priced_requests: z.number(),
      total_requests: z.number(),
      ...metaSchema,
    }),
    // request/context 也要放行——逐请求计价要走 request_metrics，它的行是按
    // 请求切的，缺这个事件会少掉分母侧的信息（与 requestMetrics 同一份白名单）。
    init: () => ({ events: [] as any[] }),
    apply(state: { events: any[] }, event: { type: string; data?: any }) {
      state = withSeed(state)
      if (event.type === 'request/header' || event.type === 'request/context') {
        return { ...state, events: [...state.events, event] }
      }
      if (event.type === 'assistant/message' && event.data?.usage !== undefined) {
        return { ...state, events: [...state.events, event] }
      }
      if (event.type === 'assistant/chunk' && event.data?.chunk?.type === 'usage') {
        return { ...state, events: [...state.events, event] }
      }
      return state
    },
    view(state: Seeded<{ events: any[] }>) {
      const json = JSON.stringify(seeded(state.seed, state.events))
      const usage = JSON.parse(token_by_model(json))
      const rows = JSON.parse(request_metrics(json))
      const cs = costSeriesFrom(rows, usage.providers)
      return {
        ...costReportFrom(usage),
        series: cs.series, priced_requests: cs.priced, total_requests: cs.total,
      }
    },
    // apply 的白名单变了（放行 request/context）→ 缓存的折叠 state 形状变了，
    // 必须 bump，否则旧 cell 会被当成新版直接复用。
    stateVersion: 2,
  })

  // ── loopCosts projection（G2，GOVERNANCE_BACKLOG.md）─────────────────────
  // SV611/612/613 现在带 `run_end_seq`（core 新增，`[seq, run_end_seq]` 是这段
  // 异常真实覆盖的区间）——这里把它跟 request_metrics 的逐请求行对齐（按 seq
  // 落在区间内筛选），用 `loopCostFor` 求和定价，得到"这段循环烧了多少 token /
  // ¥"。独立于 behaviorFindings 之外单开一个投影，而不是把这批事件塞进
  // behaviorFindings 自己的 state——behaviorFindings 的 apply 白名单是"行为
  // 规则消费的事件类型"，跟"这段烧了多少钱"是两个不同的关注点；`costReport`
  // 早就示范过"各投影各自重新过滤事件"是这个框架下的正确做法（避免一个
  // projection 的 state 里塞进另一个 projection 才用得到的事件类型）。
  //
  // 用 (rule, seq) 当 key 返回一个扁平数组，客户端 `derive.ts` 按同一个 key
  // 把它拼回 FindingGroupedRow——不直接把 tokens/cost 塞进 behaviorFindings
  // 的 finding 对象，是因为那份 schema 由 core 的 finding 形状决定（12 键，
  // 与 match_behavior 同构），这里的两个新字段是宿主算出来的衍生值，混进去
  // 会让"哪些键来自 core、哪些来自宿主"变得含糊。
  ctx.sessionProjections.register({
    key: 'loopCosts',
    schema: z.array(z.object({
      rule: z.string(),
      seq: z.number(),
      tokens: z.number().nullable(),
      cost: z.number().nullable(),
    })),
    init: () => ({ events: [] as any[] }),
    apply(state: { events: any[] }, event: { type: string; data?: any }) {
      state = withSeed(state)
      // 行为规则消费的事件类型（判定循环用）∪ 计价需要的用量事件类型
      // （对齐区间用）——两个白名单的并集，缺一个都拼不出结果。
      if (RELEVANT_TYPES.has(event.type)
        || event.type === 'request/header' || event.type === 'request/context'
        || (event.type === 'assistant/message' && event.data?.usage !== undefined)
        || (event.type === 'assistant/chunk' && event.data?.chunk?.type === 'usage')) {
        return { ...state, events: [...state.events, event] }
      }
      return state
    },
    view(state: Seeded<{ events: any[] }>) {
      const json = JSON.stringify(seeded(state.seed, state.events))
      const findings = JSON.parse(audit_events(json, ''))
      const usage = JSON.parse(token_by_model(json))
      const rows: any[] = JSON.parse(request_metrics(json))
      const out: { rule: string; seq: number; tokens: number | null; cost: number | null }[] = []
      for (const f of findings) {
        if (f.seq == null || f.run_end_seq == null) continue
        if (f.rule !== 'SV611' && f.rule !== 'SV612' && f.rule !== 'SV613') continue
        const inRange = rows.filter((r: any) => r.seq != null && r.seq >= f.seq && r.seq <= f.run_end_seq)
        out.push({ rule: f.rule, seq: f.seq, ...loopCostFor(inRange, usage.providers) })
      }
      return out
    },
    stateVersion: 1,
  })

  // ── preForkUsage projection ──────────────────────────────────────────────
  // 「上游会话在分叉点之前已经消耗了多少」。**只为把话说清楚而存在**：主口径
  // （tokenByModel/costReport）已经把这一段滤掉了，那是对的——审计回答的是
  // 「这个会话干了什么」，上游花的钱上游那份报告已经算过，再算一遍就是重复
  // 计费。但金额会因此显著变小（实测 ¥1113.66 → ¥433.30），不把被排除的量
  // 说出来，用户会以为数据坏了。core 的 usage::pre_fork_usage 是同一个动机。
  //
  // `forked: false` 表示这个会话根本没分叉——**不是返回一个全零的结构**，
  // 「没分叉」和「分叉了但上游没花钱」是两回事，展示层要能分开说。
  ctx.sessionProjections.register({
    key: 'preForkUsage',
    schema: z.object({
      forked: z.boolean(),
      boundary_seq: z.number().nullable(),
      tokens: z.number().nullable(),
      cost: z.number().nullable(),
      /** 分叉起点继承过来的上下文占用——**存量**，与上面三个流量字段性质不同。 */
      inherited_context: z.number().nullable(),
      inherited_window: z.number().nullable(),
      ...metaSchema,
    }),
    init: () => ({ events: [] as any[] }),
    // 与 costReport 同一份白名单——折的是同一批 usage 事件，只是取的是
    // 边界**之前**那一段。
    apply(state: { events: any[] }, event: { type: string; data?: any }) {
      state = withSeed(state)
      if (event.type === 'request/header' || event.type === 'request/context') {
        return { ...state, events: [...state.events, event] }
      }
      if (event.type === 'assistant/message' && event.data?.usage !== undefined) {
        return { ...state, events: [...state.events, event] }
      }
      if (event.type === 'assistant/chunk' && event.data?.chunk?.type === 'usage') {
        return { ...state, events: [...state.events, event] }
      }
      return state
    },
    view(state: { events: any[]; seed?: number | null }) {
      const seed = state.seed
      const none = { inherited_context: null, inherited_window: null }
      if (!seed || seed <= 0) {
        return { forked: false, boundary_seq: null, tokens: null, cost: null, ...none, ...completeIf([]) }
      }
      // post_fork 保留 seq >= boundary，且**没有 seq 的事件一律保留**（缺 seq
      // 是"没上报"不是"在分叉之前"）。这里取补集，所以反过来要求 seq 必须存在
      // 且 < boundary——与 core pre_fork_usage 的 is_some_and(|q| q < b) 一致。
      const before = state.events.filter(e => typeof e.seq === 'number' && e.seq < seed)
      if (before.length === 0) {
        return { forked: true, boundary_seq: seed, tokens: 0, cost: 0, ...none, ...completeIf([]) }
      }
      // **故意不加 seedLength 标记**：wasm 里的 post_fork 找不到边界就全量保留，
      // 正好是"只折这一段"要的行为。走的仍是同一个 token_by_model 折叠引擎，
      // 不是在浏览器里另写一份规则。
      const usage = JSON.parse(token_by_model(JSON.stringify(before)))
      const priced = costReportFrom(usage)
      let tokens = 0
      for (const b of Object.values(usage.by_model || {}) as any[]) {
        tokens += (b.uncached_input_tokens || 0) + (b.output_tokens || 0)
          + (b.cache_read_tokens || 0) + (b.cache_write_tokens || 0)
      }
      // ── 分叉起点继承了多少上下文 ──────────────────────────────────────
      // **不能用上面的 `tokens`**：那是上游几十上百个 turn 累计花掉的量
      // （真机 277.2M），而继承过来的是"上游最后一次请求当时上下文里装了
      // 多少"——受 context window 封顶（≤1M）。两者差着数量级，混用会把
      // 一个 81% 的占用显示成 27700%。
      //
      // 费用/Token 是流量（不继承），上下文是存量（继承）——这条线是整个
      // 分叉设计的分界，这里是"存量"那半边唯一需要显式算的数。
      const rows = JSON.parse(request_metrics(JSON.stringify(before)))
      let inheritedContext: number | null = null
      let inheritedWindow: number | null = null
      // 从后往前找**最后一个测到了的**请求：靠后的行可能缺 context_tokens
      // （真实会话 687 行里有 13 行是这样），跳过它们取到的仍是一个真实测量，
      // 只是时间上稍早——比留 null 有用，也比拿缺失行当 0 诚实。
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].context_tokens != null) {
          inheritedContext = rows[i].context_tokens
          inheritedWindow = rows[i].context_window
          break
        }
      }
      return {
        forked: true, boundary_seq: seed, tokens,
        // 上游也可能全是未知模型 → 估不出金额。null 而不是 0。
        cost: priced.total,
        inherited_context: inheritedContext, inherited_window: inheritedWindow,
        ...completeIf(priced.unpriced_tokens > 0 ? ['unpriced_tokens'] : []),
      }
    },
    // DSH 的 register() 强制要求这个字段（非负整数），少了直接让**整个插件树
    // 加载失败**——不是这个投影降级，是 dsh web 起不来。新投影从 1 开始。
    stateVersion: 1,
  })

  // ── subagentSpawns projection ────────────────────────────────────────────
  // 「派出了哪些子代理」——时间线的关键事件，也是父子会话的**唯一权威链路**
  // （子会话头里的 parentSession 不可靠，见 core subagent.rs 的模块注释）。
  //
  // apply 放行 tool/call + tool/result：调用给出 turn/描述，回执里才有子会话 id。
  ctx.sessionProjections.register({
    key: 'subagentSpawns',
    schema: z.object({
      spawns: z.array(z.object({
        seq: z.number().nullable(),
        time: z.number().nullable(),
        turn: z.number().nullable(),
        step: z.number().nullable(),
        call_id: z.string(),
        // 回执没到时为 null——「调用发生了但还没拿到 id」不是「没派活」。
        agent_id: z.string().nullable(),
        description: z.string().nullable(),
        // 从子代理**自己那份会话日志**折出来的。读不到时全是 null，不是 0。
        cost: z.number().nullable(),
        tokens: z.number().nullable(),
        findings: z.number().nullable(),
        // 子会话自己事件流的时间跨度（首尾 time 之差）——原生 DSH UI 会显示
        // 子代理跑了多久，这是同一个数字的来源（子会话没有专门的"总耗时"
        // 事件）。读不到日志时为 null，不是 0。
        duration_ms: z.number().nullable(),
      })),
      /** 各子代理费用之和；一个都读不到时为 null。 */
      total_cost: z.number().nullable(),
      ...metaSchema,
    }),
    init: () => ({ events: [] as any[] }),
    apply(state: { events: any[] }, event: { type: string }) {
      state = withSeed(state)
      if (event.type === 'tool/call' || event.type === 'tool/result') {
        return { ...state, events: [...state.events, event] }
      }
      return state
    },
    view(state: Seeded<{ events: any[] }>) {
      const raw = JSON.parse(subagent_spawns(JSON.stringify(seeded(state.seed, state.events))))
      const spawns = raw.map((s: any) => {
        const u = s.agent_id ? subagentUsage(s.agent_id) : null
        return { ...s, cost: u?.total ?? null, tokens: u?.tokens ?? null, findings: u?.findings ?? null, duration_ms: u?.duration_ms ?? null }
      })
      const priced = spawns.filter((s: any) => s.cost !== null)
      const missing: string[] = []
      // 回执还没到 → 拿不到 id → 查不了用量。
      if (spawns.some((s: any) => s.agent_id === null)) missing.push('agent_id')
      // 有 id 但读不到那份日志（被清理了 / 没权限 / DSH_HOME 不对）——
      // 这时总额是**低估**，必须说出来，不能让它看起来是完整的。
      if (spawns.some((s: any) => s.agent_id !== null && s.cost === null)) missing.push('subagent_cost')
      return {
        spawns,
        total_cost: priced.length ? priced.reduce((a: number, s: any) => a + s.cost, 0) : null,
        ...completeIf(missing),
      }
    },
    // schema 变了（spawns[] 多了 duration_ms）→ 必须 bump，同 skillAudit T6
    // 加 agent_id 那次一样：即便 apply()/init() 的 state 形状没变，view() 的
    // 输出 schema 变了也要 bump，不然已缓存的旧 state 复用出来的 view 会跟
    // 新 schema 对不上。
    stateVersion: 2,
  })

  // ── requestMetrics projection ─────────────────────────────────────────────
  // 会话健康时间线（PRD FR-03/FR-04）的数据源：**逐请求**一行，不是聚合值。
  // tokenByModel 折出来的是按模型的总数，画不出时间序列——两者是同一个 core
  // fold 的两个出口，不变量「逐请求四桶之和 == 按模型四桶之和」由 core 的
  // request_metrics_reconciles_with_token_by_model 钉死。
  //
  // 与 tokenByModel 的 apply 唯一实质差异：**必须放行 request/context**。
  // 它携带 data.contextWindow，是上下文占用率分母的唯一来源（真实会话里一次
  // 会话只出现 5 次、每次模型切换各一次），此前没有任何 projection 捕获它。
  ctx.sessionProjections.register({
    key: 'requestMetrics',
    schema: z.object({
      requests: z.array(z.object({
        request_seq: z.number(),
        // 以下字段宿主未上报时为 null——**不是 0**。null 表示「没测到」，
        // 0 表示「测到了 0」，展示层据此留缺口而不是画一条塌陷的曲线。
        seq: z.number().nullable(),
        time: z.number().nullable(),
        turn: z.number().nullable(),
        step: z.number().nullable(),
        model: z.string(),
        context_window: z.number().nullable(),
        // 只在 uncached 与 cache_read 双双在场时才非空（core 有详述）。
        context_tokens: z.number().nullable(),
        uncached_input_tokens: z.number().nullable(),
        output_tokens: z.number().nullable(),
        cache_read_tokens: z.number().nullable(),
        cache_write_tokens: z.number().nullable(),
      })),
      ...metaSchema,
    }),
    init: () => ({ events: [] as any[] }),
    apply(state: Seeded<{ events: any[] }>, event: { type: string; data?: any }) {
      state = withSeed(state)
      if (event.type === 'request/header' || event.type === 'request/context') {
        return { ...state, events: [...state.events, event] }
      }
      if (event.type === 'assistant/message' && event.data?.usage !== undefined) {
        return { ...state, events: [...state.events, event] }
      }
      if (event.type === 'assistant/chunk' && event.data?.chunk?.type === 'usage') {
        return { ...state, events: [...state.events, event] }
      }
      return state
    },
    view(state: Seeded<{ events: any[] }>) {
      const requests = JSON.parse(request_metrics(JSON.stringify(seeded(state.seed, state.events))))
      // 逐行看：任一行缺 context_tokens/context_window 就整体标 partial——
      // FR-04 的"隐藏 [上下文] 视图"取决于"可算占用的请求点比例"，先给出
      // 哪些字段缺，比例判断留给展示层（宿主不猜阈值）。
      const missing: string[] = []
      if (requests.some((r: any) => r.context_tokens === null)) missing.push('context_tokens')
      if (requests.some((r: any) => r.context_window === null)) missing.push('context_window')
      return { requests, ...completeIf(missing) }
    },
    // 仍是 1：init/apply（累积的原始事件数组）没变，只是 view() 的派生输出
    // 多包了一层 meta——不是缓存的折叠 state 形状变了，不需要 bump。
    stateVersion: 1,
  })

  // ── contextComposition projection ─────────────────────────────────────────
  // FR-04a「token 都去哪了」：常驻前缀（系统提示词 / 工具定义 / 技能目录）的
  // 分类估算。这三段每次请求都要重发，是上下文里唯一「不随对话增长」的部分。
  //
  // apply 的筛选与别处不同：技能目录**不是专用事件类型**，它挂在 user/message、
  // agent/inbox/spliced 等多种事件的 `data.source` 上（真实会话验证）。所以这里
  // 按 `data.source.kind` 判断，不能用 type 白名单——用白名单目录永远是 null。
  ctx.sessionProjections.register({
    key: 'contextComposition',
    schema: z.object({
      // 源事件从未出现时为 null，**不是 0**：「日志里没有 skill-catalog 事件」
      // 与「发布了一个空目录」是两回事，UI 要能写「未知」而不是「0 个技能」。
      system_tokens: z.number().nullable(),
      tools_tokens: z.number().nullable(),
      catalog_tokens: z.number().nullable(),
      catalog_entries: z.number().nullable(),
      // T1（Skill 执行审计 P0）：catalog_tokens 的逐条拆分，供 FR-SK-02/AC-SK-01
      // 下钻用。故意不带 description 原文——FR-SK-09 导出不含未脱敏内容。
      catalog_names: z.array(z.object({ name: z.string(), tokens: z.number() })).nullable(),
      resident_total: z.number().nullable(),
      // 三项都是 est_tokens 估算，与 requestMetrics 的 context_tokens
      // （provider 计数）不是同一个估算器——实测常驻估算 12,233 vs 首次请求
      // 实际 13,959。展示层必须标注估算，且不得把两者相减后当作精确分类。
      estimator: z.string(),
      ...metaSchema,
    }),
    init: () => ({ events: [] as any[] }),
    apply(state: { events: any[] }, event: { type: string; data?: any }) {
      state = withSeed(state)
      if (event.type === 'request/header') {
        return { ...state, events: [...state.events, event] }
      }
      if (event.data?.source?.kind === 'skill-catalog') {
        return { ...state, events: [...state.events, event] }
      }
      return state
    },
    view(state: Seeded<{ events: any[] }>) {
      const c = JSON.parse(context_composition(JSON.stringify(seeded(state.seed, state.events))))
      const missing: string[] = []
      if (c.system_tokens === null) missing.push('system_tokens')
      if (c.tools_tokens === null) missing.push('tools_tokens')
      if (c.catalog_tokens === null) missing.push('catalog_tokens')
      return { ...c, ...completeIf(missing) }
    },
    stateVersion: 1,
  })

  // ── compactionEvents projection ───────────────────────────────────────────
  // 时间线的 ✂ 标记，以及 FR-04b 结构性浪费的**实测**来源：`prunes[].shadowed_
  // token_count` 是宿主自己算出的被丢弃 token 数，不是 est_tokens 估算。
  //
  // apply **必须放行 turn/start · turn/end**：`compaction/prune` 自身不带 turn，
  // 靠 turn 边界顺延（真实日志上验证过——只喂 compaction/* 的话每条 prune 的
  // turn 都会落成 null）。真实会话实测：10 次 prune 全部顺延到 turn 85（同一次
  // 爆发，合计 33,099 token），恰好是上下文峰值所在的那个 turn；完整压缩发生在
  // 两个 turn 之后的 turn 87——这条因果链正是这个 projection 存在的理由。
  ctx.sessionProjections.register({
    key: 'compactionEvents',
    schema: z.object({
      compactions: z.array(z.object({
        compaction_id: z.string().nullable(),
        start_seq: z.number().nullable(),
        start_time: z.number().nullable(),
        turn: z.number().nullable(),
        end_seq: z.number().nullable(),
        has_summary: z.boolean(),
      })),
      prunes: z.array(z.object({
        seq: z.number().nullable(),
        time: z.number().nullable(),
        turn: z.number().nullable(),
        // 宿主实测值；缺则 null——不是 0（与 unreported_fields 同一条纪律）。
        shadowed_token_count: z.number().nullable(),
        shadowed_seq_count: z.number().nullable(),
      })),
      pruned_tokens_total: z.number(),
      prunes_without_token_count: z.number(),
      ...metaSchema,
    }),
    init: () => ({ events: [] as any[] }),
    apply(state: { events: any[] }, event: { type: string }) {
      state = withSeed(state)
      const t = event.type
      if (t.startsWith('compaction/') || t === 'turn/start' || t === 'turn/end') {
        return { ...state, events: [...state.events, event] }
      }
      return state
    },
    view(state: Seeded<{ events: any[] }>) {
      const c = JSON.parse(compaction_events(JSON.stringify(seeded(state.seed, state.events))))
      // 没见过任何 prune 不算"缺"——那是"这次会话没发生压缩"，是完整信息，
      // 不是数据不全。只有"见过 prune 但缺它的 shadowedTokenCount"才算 partial。
      const missing = c.prunes_without_token_count > 0 ? ['shadowed_token_count'] : []
      return { ...c, ...completeIf(missing) }
    },
    stateVersion: 1,
  })

  // ── structuralWaste projection（FR-04b）───────────────────────────────────
  // 回答"哪些是浪费的""我该怎么办"。规则可直接判定，不需要历史基线（"相对
  // 浪费"——缓存命中率偏低等——继续留给展示层，受 FR-05 约束）。
  //
  // 两个检测器需要**两种不同的事件流**：重复结果/失败次数看 tool/call+tool/
  // result（执行事件）；失败区间的上下文增量要靠 request_metrics 算出的
  // context_tokens（usage 事件）。所以这个 projection 的 state 分开存两路，
  // view() 里先把 usage 那路折成 requests，再喂给 wasm 的 structural_waste——
  // 与 CLI 侧 `behavior.rs`（先算 requests 再传给 detect_structural_waste）
  // 是同一个调用顺序，不是又发明一套逻辑。
  const WASTE_EXEC_TYPES = new Set(['tool/call', 'tool/result'])
  ctx.sessionProjections.register({
    key: 'structuralWaste',
    schema: z.object({
      findings: z.array(z.object({
        rule: z.string(),
        severity: z.string(),
        category: z.string(),
        tool_name: z.string().nullable(),
        evidence: z.string(),
        seq: z.number().nullable(),
        time: z.number().nullable(),
        turn: z.number().nullable(),
        step: z.number().nullable(),
        call_id: z.string().nullable(),
        evidence_recency: z.string(),
        // **备注按它隔离**（AC-02）。core 看不到 sessionId（不在事件流里），
        // 由宿主注入——与 behaviorFindings 同一处理。少了这个字段，浪费行的
        // 备注键会退化成 ["", rule, evidence]，A 会话写的备注会静默出现在 B
        // 会话同 rule+evidence 的行上。
        session_id: z.string(),
        // 影响量级：始终非负、始终存在——找不到就不产出这条 finding（AC-08
        // "缺一不得展示"），不会出现 waste_tokens 为 null 的行。
        waste_tokens: z.number(),
        // 建议是文字，不是可执行的控制按钮（§3.3 产品分层边界）。
        suggestion: z.string(),
      })),
      ...metaSchema,
    }),
    init: () => ({ sessionId: '', execEvents: [] as any[], usageEvents: [] as any[] }),
    apply(state: { sessionId: string; execEvents: any[]; usageEvents: any[] }, event: { type: string; data?: any }) {
      state = withSeed(state)
      // sessionId 与 behaviorFindings 同路径捕获：core 拿不到它（不在事件流
      // 里），只有宿主有；备注按它隔离（AC-02）。
      if (state.sessionId === '' && activeSessionId !== null) {
        state = { ...state, sessionId: activeSessionId }
      }
      let next = state
      if (WASTE_EXEC_TYPES.has(event.type)) {
        next = { ...next, execEvents: [...next.execEvents, event] }
      }
      if (event.type === 'request/header' || event.type === 'request/context') {
        next = { ...next, usageEvents: [...next.usageEvents, event] }
      } else if (event.type === 'assistant/message' && event.data?.usage !== undefined) {
        next = { ...next, usageEvents: [...next.usageEvents, event] }
      } else if (event.type === 'assistant/chunk' && event.data?.chunk?.type === 'usage') {
        next = { ...next, usageEvents: [...next.usageEvents, event] }
      }
      return next
    },
    view(state: Seeded<{ sessionId: string; execEvents: any[]; usageEvents: any[] }>) {
      const requestsJson = request_metrics(JSON.stringify(seeded(state.seed, state.usageEvents)))
      const findings = JSON.parse(structural_waste(JSON.stringify(seeded(state.seed, state.execEvents)), requestsJson))
      // 每条 finding 自己已经满足 AC-08（缺一不得展示，检测器内部已经跳过了
      // 算不出的情况）——这里的 partial 指向别处：SV-COST-02 靠 request_metrics
      // 的 context_tokens 算增量，那份数据若本身不全，检测器会**漏报**而不是
      // 报错的一条，这种"该报的没报"从返回的数组本身看不出来，所以单独标注。
      const requests: any[] = JSON.parse(requestsJson)
      const missing = requests.some((r) => r.context_tokens === null)
        ? ['context_tokens（可能导致 SV-COST-02 漏报，不是数组本身缺字段）']
        : []
      // 与 behaviorFindings 同样注入 sessionId——备注按它隔离，见 schema 注释。
      return {
        findings: findings.map((f: any) => ({ ...f, session_id: state.sessionId })),
        ...completeIf(missing),
      }
    },
    // init 的 state 形状变了（多了 sessionId）→ 必须 bump，否则缓存的旧
    // state 会被当成新版直接复用，session_id 恒为 undefined。
    stateVersion: 2,
  })

  // ── skillAudit projection（backlog T5，Skill 执行审计）─────────────────────
  // 谁在什么时候被什么方式（explicit / model_selected）触发、加载成功没有
  // （loaded / failed / incomplete）、花了多久——core skill.rs 的
  // SkillInvocationEvent[]（T3），这里只是宿主半份的投影接线。
  //
  // 跟 structuralWaste 同一个理由需要两路事件流：触发/配对看 execEvents
  // （turn/step 边界 + tool/call(name="skill") + tool/result + skill-invocation
  // 载体），`request_seq` 定位要靠 request_metrics 算出的那份 requests
  // （usageEvents 折出来）——与 wasm 侧 skill_audit(events_json, requests_json)
  // 的二参数契约一一对应。
  //
  // skill-invocation 载体不是独立事件类型（T2 同款处境），挂在 user/message
  // 的 data.source.kind 上——不能把 user/message 整体放行进 SKILL_EXEC_TYPES：
  // 那会把所有用户消息（含原始 prompt 文本）收进投影，体积爆炸 + 把未脱敏
  // 内容带进导出。
  //
  // T6 子 Agent 覆盖率：model_selected 的调用通过 callId 查 subagentSpawns
  // 拿到 agent_id，再拿 agent_id 读子会话（via subagentUsage）。
  //
  // P0-01（真实审计 2026-08-25 发现，见 subagentUsage 头部注释）：这里曾经
  // 只用子会话的费用可读性（`u.total !== null`）当"Skill 已覆盖"的判据，
  // 从不解析子会话自己的 Skill 调用——`coverage_by_skill` 的 key 也不是真
  // 实的 skill 名，是 `spawn.description`（子 Agent 的任务描述，两者是完
  // 全不同的东西）。现在 `subagentUsage` 真的解析了子会话自己的 Skill 调
  // 用（`skill_invocations`），这里把它们**合并进主列表**（打上
  // `source_agent_id`/`depth` 标记子会话来源），`covered` 判据也换成
  // "Skill 调用解析成功"（`skill_invocations !== null`），跟"覆盖率"这个
  // 名字实际对得上了。`coverage_by_skill` 的 key 简化成真实 skill 名（不
  // 再区分 discovered/covered——那个区分在旧设计里其实从来没有过真正的语
  // 义：一次调用要么被成功解析并计入，要么整个子会话读不到、连它调过什么
  // 都无从谈起，中间没有"发现了但没覆盖"这个中间态）。
  //
  // 只读一层：子会话自己派生的孙子代理不会被递归展开去审计它们的 Skill
  // 调用（`subagentUsage` 文档注释已说明是刻意的范围收窄，不是遗漏）。
  const SKILL_EXEC_TYPES = new Set(['tool/call', 'tool/result', 'turn/start', 'turn/end', 'step/start', 'step/end'])
  ctx.sessionProjections.register({
    key: 'skillAudit',
    schema: z.object({
      invocations: z.array(z.object({
        name: z.string().nullable(),
        trigger_mode: z.enum(['explicit', 'model_selected']),
        load_status: z.enum(['loaded', 'failed', 'incomplete']),
        // 缺失字段进 missing_fields，绝不填 0——同一条纪律见 skill.rs 模块注释。
        duration_ms: z.number().nullable(),
        seq: z.number().nullable(),
        time: z.number().nullable(),
        turn: z.number().nullable(),
        step: z.number().nullable(),
        call_id: z.string().nullable(),
        request_seq: z.number().nullable(),
        missing_fields: z.array(z.string()),
        // T6：子 Agent 关联。model_selected 有 call_id → agent_id；explicit 无。
        // 这条是"这次调用有没有进一步派生出一个子 Agent"，跟下面的
        // source_agent_id（"这条调用是在哪个会话里发生的"）是两个不同的问题。
        agent_id: z.string().nullable(),
        // P0-01：这条调用本身是在哪找到的——null 表示主会话；否则是发现它
        // 的那个子会话的 agent_id。depth 0 = 主会话，1 = 直接子会话（当前
        // 只支持这一层，不递归到孙子代理）。
        source_agent_id: z.string().nullable(),
        depth: z.number(),
      })),
      // T6 覆盖率
      sessions_discovered: z.number(),
      sessions_covered: z.number().nullable(),
      missing_sessions: z.array(z.string()),
      // P0-01：key 是真实 skill 名（缺名的调用归进 'unknown'），value 是
      // 跨主会话与全部已覆盖子会话的调用次数之和——不再有 discovered/
      // covered 两个数字（旧设计里那个区分并不对应任何真实存在的中间态）。
      coverage_by_skill: z.record(z.number()),
      ...metaSchema,
    }),
    init: () => ({ execEvents: [] as any[], usageEvents: [] as any[] }),
    apply(state: { execEvents: any[]; usageEvents: any[] }, event: { type: string; data?: any }) {
      state = withSeed(state)
      let next = state
      const isSkillInvocation = event.data?.source?.kind === 'skill-invocation'
      if (SKILL_EXEC_TYPES.has(event.type) || isSkillInvocation) {
        next = { ...next, execEvents: [...next.execEvents, event] }
      }
      if (event.type === 'request/header' || event.type === 'request/context') {
        next = { ...next, usageEvents: [...next.usageEvents, event] }
      } else if (event.type === 'assistant/message' && event.data?.usage !== undefined) {
        next = { ...next, usageEvents: [...next.usageEvents, event] }
      } else if (event.type === 'assistant/chunk' && event.data?.chunk?.type === 'usage') {
        next = { ...next, usageEvents: [...next.usageEvents, event] }
      }
      return next
    },
    view(state: Seeded<{ execEvents: any[]; usageEvents: any[] }>) {
      const requestsJson = request_metrics(JSON.stringify(seeded(state.seed, state.usageEvents)))
      // 先折 subagentSpawns（同一批 execEvents，只是过滤条件不同），
      // 拿 spawns 再调 skill_audit_enriched——两步是因为 wasm 侧的
      // skill_invocations_enriched 需要 spawns 做 agent_id 回填。
      const spawnsJson = subagent_spawns(JSON.stringify(seeded(state.seed, state.execEvents)))
      const spawns = JSON.parse(spawnsJson)
      const enriched = JSON.parse(skill_audit_enriched(
        JSON.stringify(seeded(state.seed, state.execEvents)),
        requestsJson,
        spawnsJson,
      ))

      // ── T6 覆盖率：读子会话日志，真的解析它自己的 Skill 调用 ────────────
      // 子会话日志读不到/解析失败 → sessions_covered 偏低 + missing_sessions
      // 非空。这是**正确行为**（backlog T6 AC-SK-05：会话树不得显示为完整）。
      const discovered = new Set<string>()
      const covered = new Set<string>()
      const missingSessions = new Set<string>()
      const coverageBySkill: Record<string, number> = {}
      const tally = (name: string | null) => {
        const key = name ?? 'unknown'
        coverageBySkill[key] = (coverageBySkill[key] || 0) + 1
      }

      const mainInvocations = (enriched.enriched as any[]).map(inv => ({
        ...inv, source_agent_id: null, depth: 0,
      }))
      for (const inv of mainInvocations) tally(inv.name)

      // P0-01：子会话自己的 Skill 调用——真的调了 subagentUsage 里新加的
      // skill_invocations，不再只看费用能不能算出来。
      const subInvocations: any[] = []
      for (const spawn of spawns) {
        const aid = spawn.agent_id
        if (!aid) continue
        discovered.add(aid)
        const u = subagentUsage(aid)
        if (u.skill_invocations !== null) {
          covered.add(aid)
          for (const inv of u.skill_invocations) {
            tally(inv.name)
            subInvocations.push({ ...inv, source_agent_id: aid, depth: 1 })
          }
        } else {
          missingSessions.add(aid)
        }
      }

      const invocations = [...mainInvocations, ...subInvocations]
      const missing = Array.from(
        new Set(invocations.flatMap((r: any) => r.missing_fields as string[])),
      ) as string[]
      return {
        invocations,
        sessions_discovered: discovered.size,
        sessions_covered: covered.size,
        missing_sessions: Array.from(missingSessions),
        coverage_by_skill: coverageBySkill,
        ...completeIf(missing),
      }
    },
    // schema 变了（P0-01：invocations 加了 source_agent_id/depth，子会话
    // 自己的 Skill 调用现在会真的出现在这个数组里，coverage_by_skill 的
    // value 形状也从 {discovered,covered} 简化成单个 number）→ 必须 bump。
    stateVersion: 3,
  })

  // ── skillAttribution projection（阶段 B-3，真实审计 2026-08-25 后续跟进：
  // Skill → Finding/工具/费用归因）───────────────────────────────────────
  // 「这次 Skill 调用期间触发了多少 finding、跑了多少工具调用、烧了多少
  // token/钱」——跟 loopCosts（G2）同一套手法：不发明新算法，把已经算出来
  // 的 findings/request_metrics/duration_audit.tool_calls 按 seq 区间对齐
  // 求和，token/费用直接复用 `loopCostFor`。
  //
  // 区间怎么切：本会话全部（seq 非 null 的）Skill 调用按 seq 升序排列，
  // 相邻两次调用的 seq 就是天然边界——[本次.seq, 下一次.seq)，最后一次开
  // 区间到会话结束。Skill 调用没有 SV611/612/613 那种规则算出来的
  // run_end_seq，退而求其次用"下一次调用开始"当边界——代价是：两次调用
  // 之间如果夹杂着跟 Skill 本身无关的工作，会被计入前一次调用的账，这是
  // 已知的近似，不是精确因果关系（客户端渲染时须带出这条说明）。
  //
  // 只对本会话自己的调用做归因——这个投影折叠的事件流本来就只来自本会话
  // （子会话的 Skill 调用是 `subagentUsage` 另外读取它自己的日志得到的，
  // 根本不会进到这里的 `state.events` 里），`skill_audit_enriched` 算出的
  // `enriched` 天然只包含本会话调用，不需要额外按 source_agent_id 过滤。
  // 子会话调用要归因需要读它自己的 request_metrics/duration_audit/
  // findings（另一条完全独立、seq 计数也独立的事件流），跟 subagentUsage
  // "只读一层"是同一个范围收窄，不在这次改动里做——**客户端拿到这份数据后
  // 必须只用 source_agent_id === null 的调用去查，绝不能拿子会话调用的
  // seq 直接查这张表**：两条事件流的 seq 计数器互相独立，数值偶然相同不
  // 代表同一个位置，查出来的归因会张冠李戴。
  //
  // 用 `seq` 当 key 返回一个扁平数组，客户端按 invocation.seq 拼回
  // （derive 逻辑见 SkillSection.tsx）。findings/tool_calls 恒为真实计数
  // （0 是"测到了、真的是 0"，这两个字段的输入永远可测，不存在"测不出"这
  // 一态）；tokens/cost 沿用 `loopCostFor` 的 null-vs-0 纪律。
  ctx.sessionProjections.register({
    key: 'skillAttribution',
    schema: z.array(z.object({
      seq: z.number(),
      findings: z.number(),
      tool_calls: z.number(),
      tokens: z.number().nullable(),
      cost: z.number().nullable(),
    })),
    init: () => ({ events: [] as any[] }),
    apply(state: { events: any[] }, event: { type: string; data?: any }) {
      state = withSeed(state)
      const isSkillInvocation = event.data?.source?.kind === 'skill-invocation'
      if (RELEVANT_TYPES.has(event.type) || isSkillInvocation
        || event.type === 'request/header' || event.type === 'request/context'
        || (event.type === 'assistant/message' && event.data?.usage !== undefined)
        || (event.type === 'assistant/chunk' && event.data?.chunk?.type === 'usage')) {
        return { ...state, events: [...state.events, event] }
      }
      return state
    },
    view(state: Seeded<{ events: any[] }>) {
      const json = JSON.stringify(seeded(state.seed, state.events))
      const findings: any[] = JSON.parse(audit_events(json, ''))
      const requests: any[] = JSON.parse(request_metrics(json))
      const duration = JSON.parse(duration_audit(json))
      const usage = JSON.parse(token_by_model(json))
      const spawnsJson = subagent_spawns(json)
      const enriched = JSON.parse(skill_audit_enriched(json, JSON.stringify(requests), spawnsJson)).enriched

      const starts = (enriched as any[])
        .filter(inv => inv.seq != null)
        .map(inv => inv.seq as number)
        .sort((a, b) => a - b)
      const out: { seq: number; findings: number; tool_calls: number; tokens: number | null; cost: number | null }[] = []
      for (let i = 0; i < starts.length; i++) {
        const start = starts[i]
        const end = i + 1 < starts.length ? starts[i + 1] : null
        const inRange = (seq: number | null) => seq != null && seq >= start && (end === null || seq < end)
        const rangeRequests = requests.filter(r => inRange(r.seq))
        const rangeFindings = findings.filter(f => inRange(f.seq))
        const rangeToolCalls = (duration.tool_calls as any[]).filter(t => inRange(t.seq))
        out.push({
          seq: start,
          findings: rangeFindings.length,
          tool_calls: rangeToolCalls.length,
          ...loopCostFor(rangeRequests, usage.providers),
        })
      }
      return out
    },
    // 全新投影，从 1 起——不延续 skillAudit 的版本号，两个投影独立计数。
    stateVersion: 1,
  })

  // ── durationAudit projection（DURATION_AUDIT_BACKLOG.md D6，D1–D3）──────
  // 通用工具调用耗时 + turn/step 时长 + 审批等待延迟——与 wasm 侧
  // duration_audit(events_json) 的单参数契约一一对应。
  //
  // 过滤集合 = skillAudit 的 SKILL_EXEC_TYPES（tool/call·tool/result·
  // turn/*·step/*）**加上** approval/asked·approval/decided（D3 要）。
  // **故意不收 hook/***：hook_executions（D4）的宿主前提还没验证过——浏览器
  // 能不能拿到 hook/* 事件目前没有证据（见 duration.rs::hook_executions 的
  // 模块级警告），在验证通过之前不接进这条链路，接了也只会是个恒为空的
  // 死过滤条件，不能按"只是加个类型"的成本算进来。
  const DURATION_EVENT_TYPES = new Set([
    'tool/call', 'tool/result', 'turn/start', 'turn/end', 'step/start', 'step/end',
    'approval/asked', 'approval/decided',
  ])
  ctx.sessionProjections.register({
    key: 'durationAudit',
    schema: z.object({
      tool_calls: z.array(z.object({
        call_id: z.string(),
        tool_name: z.string().nullable(),
        load_status: z.enum(['loaded', 'failed', 'incomplete']),
        duration_ms: z.number().nullable(),
        seq: z.number().nullable(),
        turn: z.number().nullable(),
        step: z.number().nullable(),
        missing_fields: z.array(z.string()),
      })),
      turns: z.array(z.object({
        turn: z.number(),
        duration_ms: z.number().nullable(),
        seq_start: z.number().nullable(),
        seq_end: z.number().nullable(),
        ended_reason: z.string().nullable(),
        load_status: z.enum(['loaded', 'incomplete']),
        missing_fields: z.array(z.string()),
      })),
      steps: z.array(z.object({
        turn: z.number(),
        step: z.number(),
        duration_ms: z.number().nullable(),
        seq_start: z.number().nullable(),
        seq_end: z.number().nullable(),
        load_status: z.enum(['loaded', 'incomplete']),
        missing_fields: z.array(z.string()),
      })),
      approvals: z.array(z.object({
        id: z.string(),
        tool_name: z.string().nullable(),
        wait_ms: z.number().nullable(),
        outcome: z.string().nullable(),
        status: z.enum(['decided', 'pending']),
        turn: z.number().nullable(),
        step: z.number().nullable(),
        seq: z.number().nullable(),
        missing_fields: z.array(z.string()),
      })),
      ...metaSchema,
    }),
    init: () => ({ execEvents: [] as any[] }),
    apply(state: { execEvents: any[] }, event: { type: string; data?: any }) {
      // apply() 必须展开前态——返回裸字面量会静默丢 seed/cwd/sessionId
      // （T5 踩过、skillAudit 也这么写的，这里照抄不要犯同样的错）。
      state = withSeed(state)
      if (!DURATION_EVENT_TYPES.has(event.type)) return state
      return { ...state, execEvents: [...state.execEvents, event] }
    },
    view(state: Seeded<{ execEvents: any[] }>) {
      const out = JSON.parse(duration_audit(JSON.stringify(seeded(state.seed, state.execEvents))))
      const missing = Array.from(new Set([
        ...out.tool_calls.flatMap((r: any) => r.missing_fields as string[]),
        ...out.turns.flatMap((r: any) => r.missing_fields as string[]),
        ...out.steps.flatMap((r: any) => r.missing_fields as string[]),
        ...out.approvals.flatMap((r: any) => r.missing_fields as string[]),
      ])) as string[]
      return {
        tool_calls: out.tool_calls,
        turns: out.turns,
        steps: out.steps,
        approvals: out.approvals,
        ...completeIf(missing),
      }
    },
    // 全新投影，从 1 起——不延续 skillAudit 的版本号，两个投影独立计数。
    stateVersion: 1,
  })
}
