// Host half of the audit plugin: registers the `behaviorFindings` session
// projection. The host is the only computation site (DSH projection push
// model) — it folds the raw session events through the Rust behavior rules
// (compiled to wasm) and publishes the findings; the client half only reads
// `useProjection('behaviorFindings')`.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { initSync, audit_events, token_by_model } from './skill_vitals_wasm.js'

const here = dirname(fileURLToPath(import.meta.url))

// Instantiate the wasm once at module load. The wasm-bindgen `--target web`
// glue is a plain ESM module; `initSync` is synchronous, so the projection's
// `view` can call `audit_events` synchronously afterwards.
const wasmModule = new WebAssembly.Module(readFileSync(join(here, 'skill_vitals_wasm_bg.wasm')))
initSync({ module: wasmModule })

// Event types the behavior rules (SV601–SV614) consume. Everything else is
// irrelevant — returning the same state reference means zero downstream work.
const RELEVANT_TYPES = new Set([
  'tool/call',
  'tool/code-dispatch-start',
  'tool/code-dispatch',
  'tool/result',
  'approval/asked',
  'approval/decided',
  'sandbox/mode',
])

// cwd 不是事件，只在 session header 里。投影的 init/apply/view 都拿不到
// Session 对象（dsh-session-projection 当前版本的硬约束——ProjectionDefinition
// 三个函数只收 state/event，见该包 src/index.ts 的 ProjectionDefinition 接口），
// 所以要用旁路捕获。
//
// 早期实现（曾用 WeakMap<event, sessionId> 反查）有一个致命漏洞：registry 只在
// `drive()`（活事件路径）里对每个事件先跑 `session/event` 监听器、再跑我们的
// apply；但 `cellFor → buildCell(def, session.events)`（冷读路径：snapshot() /
// checkpoint() / viewCheckpoint()，对应「已结束 / 从持久化恢复的 session 第一次
// 被读」——子代理会话跑完之后打开「审计」tab 就是这条路径）直接对 session.events
// 整段做 fold，完全不经过 session/event 总线。WeakMap 里永远查不到这些事件，
// state.cwd 停留在 init() 的 ''，SV605 退化成纯绝对路径启发式、把工作区内的写
// 全部当「工作区外写」洪泛报出（真实回归：183/188 条 SV605 里绝大多数是工作区
// 内路径）。
//
// 修复：`session/created` 对新建*和*恢复/重放的 session 都会触发（重放是把历史
// 事件整段作为 constructor seed 灌入，session.events 那时已是全量），而且它把
// 真正的 Session 对象递给我们。用它做两件事：①记 cwd；②立刻主动调用一次
// `ctx.sessionProjections.snapshot(session)` 强制把这个 session 的投影 cell 建
// 好——这次建 cell 发生在我们自己的同步调用栈里，activeSessionId 这个环境变量
// 保证 apply() 第一次执行时能查到正确的 sessionId，不再依赖事件对象身份。
// 之后活事件路径（session/event）同样用 activeSessionId，不再需要
// WeakMap<event, sessionId>。
//
// 代价：snapshot() 会顺带把同一 session 下其他插件注册的 projection（title/
// goal/stats…）也预热一遍，比原来提前算一点，无副作用（snapshot() 只读+建
// cell，不触发 change 通知，纯函数重算不会产生错误结果）。
const cwdBySession = new Map()
let activeSessionId = null

// Wire schema matching the Rust `match_behavior` finding shape, byte for byte:
// { rule, severity, category, tool_name, evidence, seq, time, evidence_recency }.
// tool_name / seq / time are nullable — a finding from tool/result, sandbox/mode,
// or a malformed event carries null there, never a fabricated value.
const findingSchema = z.array(z.object({
  rule: z.string(),
  severity: z.string(),
  category: z.string(),
  tool_name: z.string().nullable(),
  evidence: z.string(),
  seq: z.number().nullable(),
  time: z.number().nullable(),
  evidence_recency: z.string(),
}))

export const inject = ['sessionProjections']

export function apply(ctx) {
  // 先注册捕获钩子——必须在访问 ctx.sessionProjections（触发其服务构造）之前，
  // 这样我们的 session/created 处理器里调用 snapshot() 时，behaviorFindings /
  // tokenByModel 已经注册好，能一起被建 cell。
  ctx.on('session/created', (session) => {
    cwdBySession.set(session.id, session.header?.cwd ?? '')
    activeSessionId = session.id
    try {
      ctx.sessionProjections.snapshot(session)
    } finally {
      activeSessionId = null
    }
  })
  ctx.on('session/event', (session) => {
    cwdBySession.set(session.id, session.header?.cwd ?? '')
    activeSessionId = session.id
  })

  ctx.sessionProjections.register({
    key: 'behaviorFindings',
    schema: findingSchema,
    init: () => ({ cwd: '', events: [] }),
    apply(state, event) {
      // 该 session 的第一次 apply：从 activeSessionId（session/created 的强制
      // 预热调用，或 session/event 的活事件路径同步设置）查 cwd 进 state。
      if (state.cwd === '' && activeSessionId !== null) {
        state = { ...state, cwd: cwdBySession.get(activeSessionId) ?? '' }
      }
      if (!RELEVANT_TYPES.has(event.type)) return state
      return { ...state, events: [...state.events, event] }
    },
    view(state) {
      // 工作区根传给 wasm：空串 = 未知，SV605 退化为纯绝对路径启发式。
      const findingsJson = audit_events(JSON.stringify(state.events), state.cwd)
      return JSON.parse(findingsJson)
    },
    // stateVersion 3：cwd 捕获机制换了（session/created 强制预热替代
    // WeakMap<event,sessionId>），旧版本持久化的 {cwd:'', events:[...]} 是被
    // bug 污染的坏值——按 dsh-session-projection 的约定「fold 语义变了就要
    // bump」，逼一次全量重折叠，不能让旧缓存继续冒充当前结果。
    stateVersion: 3,
  })

  // tokenByModel：把 usage 事件按当时活跃的模型分桶，输出「每模型 token 明细」+
  // 模型切换序列。折叠语义不再在 JS 里——**单一真相源是 core 的
  // `usage::token_by_model`**（CLI 与浏览器 tab 共用一份引擎，never a second
  // copy），这里与 behaviorFindings 同款：apply 只收 usage 事件，view 把事件喂
  // wasm 拿到 snake_case 报告。理由：request/header 的 config.model 会在会话中途
  // 变化（真实日志 pro → flash → pro），DSH 的 `tokenUsage` 投影只有全会话累计、
  // 没有模型维度——拿一个模型价算整段账会错 3 倍。
  ctx.sessionProjections.register({
    key: 'tokenByModel',
    schema: z.object({
      by_model: z.record(z.object({
        uncached_input_tokens: z.number(),
        output_tokens: z.number(),
        cache_read_tokens: z.number(),
        cache_write_tokens: z.number(),
        // 落在北京高峰时段（9–12、14–18 点）的子集，由触发这份贡献的事件自己
        // 的 time 字段判定（wasm 的 token_by_model，core usage.rs 是单一真相
        // 源）。off-peak 份额 = 全量 − peak_*，展示层用它算出真实发生的费用，
        // 不再是「给空闲价和高峰价两个数」的区间估算——zod 不加这四个字段会把
        // 它们当未知键静默丢弃，client.js 就永远拿不到。
        peak_uncached_input_tokens: z.number(),
        peak_output_tokens: z.number(),
        peak_cache_read_tokens: z.number(),
        peak_cache_write_tokens: z.number(),
      })),
      sequence: z.array(z.string()),
    }),
    init: () => ({ events: [] }),
    apply(state, event) {
      // 只收折叠消费的事件：request/header + 带 usage 的 chunk/message。非 usage
      // chunk（文本流）与无 usage 的 message 不收——体积控制，且折叠层也不消费。
      // 与 dsh.rs 的 usage_events 过滤同一语义。
      if (event.type === 'request/header') {
        return { events: [...state.events, event] }
      }
      if (event.type === 'assistant/message' && event.data?.usage !== undefined) {
        return { events: [...state.events, event] }
      }
      if (event.type === 'assistant/chunk' && event.data?.chunk?.type === 'usage') {
        return { events: [...state.events, event] }
      }
      return state
    },
    view(state) {
      return JSON.parse(token_by_model(JSON.stringify(state.events)))
    },
    // stateVersion 2：state 形状从增量折叠 {byModel,...} 变成 {events}（view 走 wasm）。
    stateVersion: 2,
  })
}
