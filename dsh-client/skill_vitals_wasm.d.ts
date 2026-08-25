// wasm-pack 生成的 JS glue 不带 .d.ts（构建关掉了 wasm-opt，也不跑 tsc），
// 所以这份声明是手写的，与 crates/skill-vitals-wasm/src/lib.rs 的
// #[wasm_bindgen] 导出一一对应。这是本仓库唯一需要手写声明的地方——
// Node 侧一律走 @types/node，不自己编。
//
// 注意签名的统一形状：**JSON 字符串进，JSON 字符串出**。跨语言边界只传 JSON，
// 不传结构化对象——这样浏览器/Node/CLI 跑的是同一份 core 规则，而不是三份。
export function initSync(module: WebAssembly.Module): unknown
export function audit_events(events_json: string, workspace_root: string): string
export function token_by_model(events_json: string): string
export function request_metrics(events_json: string): string
export function context_composition(events_json: string): string
export function compaction_events(events_json: string): string
export function duration_audit(events_json: string): string
export function subagent_spawns(events_json: string): string
export function structural_waste(events_json: string, requests_json: string): string
export function skill_audit(events_json: string, requests_json: string): string
export function skill_audit_enriched(events_json: string, requests_json: string, spawns_json: string): string
