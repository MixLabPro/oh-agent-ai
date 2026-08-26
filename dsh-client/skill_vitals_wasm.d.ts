/* tslint:disable */
/* eslint-disable */

/**
 * 事件数组（DSH SessionEvent 的 camelCase 封套）→ Behavior Finding 数组。
 *
 * 输入是 `JSON.stringify(events)`，输出是 `JSON.stringify(findings)`。输入不是
 * 合法 JSON 数组时返回 `"[]"`（浏览器侧总会传合法 JSON，这里只是容错，不是
 * 数据源）。`workspace_root` 为空串表示未知——SV605 会退化为纯绝对路径启发式
 * （宁可多报不误放）。
 */
export function audit_events(events_json: string, workspace_root: string): string;

/**
 * 上下文压缩事件（时间线的 ✂ 标记 + FR-04b 的实测浪费量）。
 *
 * 输入需包含 `compaction/*` **以及 `turn/start` · `turn/end`**：`compaction/prune`
 * 自身不带 turn，靠 turn 边界顺延；只喂 compaction 事件的话每条 prune 的 turn
 * 都会落成 null（真实日志上验证过这个坑）。
 *
 * `prunes[].shadowed_token_count` 是**宿主实测**的被丢弃 token 数，与
 * `context_composition` 的 est_tokens 估算 provenance 不同，展示层须分开标注。
 */
export function compaction_events(events_json: string): string;

/**
 * 常驻上下文构成（FR-04a）：回答「token 都去哪了」的第一层。
 *
 * 输入需包含 `request/header`（带 `header.system` / `header.tools`）以及承载
 * `data.source.kind == "skill-catalog"` 的那些事件——技能目录不是专用事件类型，
 * 它挂在 `user/message` / `agent/inbox/spliced` 等多种事件上，宿主 projection
 * 的 `apply` 必须按 `data.source` 判断而不是按 type 白名单，否则目录永远为 null。
 *
 * 输出三项都是 `est_tokens` **估算**，与 `request_metrics` 的 `context_tokens`
 * （provider 计数）不是同一个估算器：实测常驻前缀估算 10,830 对真实 13,959。
 * 展示层必须标注估算、且不得把两者相减后当作精确的分类结果。
 */
export function context_composition(events_json: string): string;

/**
 * 执行时长审计（`DURATION_AUDIT_BACKLOG.md` D1–D3）：通用工具调用耗时 +
 * turn/step 时长 + 审批等待延迟，合并成一次 wasm 调用，与 `skill_audit` 的
 * 单事件数组输入同一种契约。
 *
 * **D4（hook 消费）故意不在这里**——`duration::hook_executions` 的宿主前提
 * （浏览器能不能拿到 `hook/*` 事件）还没有人拿真实会话验证过，在验证通过
 * 之前不接进这条浏览器链路，只在 CLI 侧可用（`hook_executions` 本身已经
 * 就绪，见 `crates/skill-vitals-core/src/duration.rs` 的模块级警告）。
 */
export function duration_audit(events_json: string): string;

/**
 * 成本账事件数组 → 按 (date, hour) 折叠的 token 桶。
 *
 * 与 `token_by_model` / `request_metrics` 同契约：JSON in / JSON out，
 * 浏览器 tab 与 CLI 共用同一份 core 折叠。DSH 审计 tab 的日历视图读这个
 * 投影(逐小时柱形 + 月历热力图);xbar tick 脚本**不**走 wasm(本地 shell
 * 直接读 state/*.json)——避免每次启动 5MB wasm 二进制。
 *
 * 输出 schema：
 * ```json
 * { "buckets": [{"date", "hour", "is_peak", 8 桶字段}, ...],
 *   "schema_version": 1, "tz_name", "tz_offset_hours", "unreported_fields" }
 * ```
 */
export function hour_buckets(events_json: string): string;

/**
 * 成本账事件数组 → 逐请求指标数组（会话健康时间线的数据源）。
 *
 * 与 `token_by_model` 是同一个 fold 的两个出口：那边给按模型的总数，这里给
 * 每次请求一行（`request_seq`/`turn`/`step`/`model`/`context_tokens`/
 * `context_window` + 四桶）。时间线需要的是时间序列，聚合值画不出来。
 *
 * 输入需**额外包含 `request/context` 事件**（分母 `contextWindow` 的唯一来源）
 * ——宿主侧 projection 的 `apply` 必须放行这个事件类型，否则每行 `context_window`
 * 都是 `null`，`[上下文]` 视图按 FR-04 整体降级。
 */
export function request_metrics(events_json: string): string;

/**
 * Skill 执行审计（backlog T4）：`SkillInvocationEvent[]`——谁在什么时候被什么
 * 方式（`explicit` / `model_selected`）触发、加载成功没有（`loaded` /
 * `failed` / `incomplete`）、花了多久。
 *
 * 与 `structural_waste` 同一种二参数契约：`requests_json` 需要是
 * `request_metrics` 已经算好的那份输出（同一批 usage_events）——`request_seq`
 * 靠 `(turn, step)` 精确匹配回那一行，不是"最近的 seq"启发式。
 */
export function skill_audit(events_json: string, requests_json: string): string;

/**
 * T6 — 子 Agent 聚合与覆盖率。`spawns_json` 是 `subagent_spawns` 的输出。
 * 返回 `skill_invocations_enriched` 的结果（enriched invocations + coverage matrix）。
 */
export function skill_audit_enriched(events_json: string, requests_json: string, spawns_json: string): string;

/**
 * FR-04b 结构性浪费：回答"哪些是浪费的""我该怎么办"。规则可直接判定，不
 * 需要历史基线（"相对浪费"——缓存命中率偏低等——继续留在展示层，受 FR-05
 * 约束）。`requests_json` 需要是 `request_metrics` 已经算好的那份输出（同一
 * 批 usage_events），两个检测器共用它来算失败区间的上下文增量。
 */
export function structural_waste(events_json: string, requests_json: string): string;

export function subagent_spawns(events_json: string): string;

/**
 * 成本账事件数组 → 按模型分桶的 token 报告。
 *
 * 与 `audit_events` 同契约：输入 `JSON.stringify(events)`，输出
 * `JSON.stringify(token_by_model(events))`——`{"by_model": {...}, "sequence": [...]}`
 * （snake_case）。CLI 与浏览器 tab 都走同一份 core 折叠（单一真相源）；tab 的
 * 宿主半份把 usage 事件喂进来，客户端只读投影渲染。
 */
export function token_by_model(events_json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly audit_events: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly compaction_events: (a: number, b: number, c: number) => void;
    readonly context_composition: (a: number, b: number, c: number) => void;
    readonly duration_audit: (a: number, b: number, c: number) => void;
    readonly hour_buckets: (a: number, b: number, c: number) => void;
    readonly request_metrics: (a: number, b: number, c: number) => void;
    readonly skill_audit: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly skill_audit_enriched: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly structural_waste: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly subagent_spawns: (a: number, b: number, c: number) => void;
    readonly token_by_model: (a: number, b: number, c: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
