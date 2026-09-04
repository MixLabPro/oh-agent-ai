/* @ts-self-types="./agent_vitals_wasm.d.ts" */

/**
 * 事件数组（DSH SessionEvent 的 camelCase 封套）→ Behavior Finding 数组。
 *
 * 输入是 `JSON.stringify(events)`，输出是 `JSON.stringify(findings)`。输入不是
 * 合法 JSON 数组时返回 `"[]"`（浏览器侧总会传合法 JSON，这里只是容错，不是
 * 数据源）。`workspace_root` 为空串表示未知——SV605 会退化为纯绝对路径启发式
 * （宁可多报不误放）。
 * @param {string} events_json
 * @param {string} workspace_root
 * @returns {string}
 */
export function audit_events(events_json, workspace_root) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(events_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(workspace_root, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN;
        wasm.audit_events(retptr, ptr0, len0, ptr1, len1);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred3_0 = r0;
        deferred3_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export3(deferred3_0, deferred3_1, 1);
    }
}

/**
 * 上下文压缩事件（时间线的 ✂ 标记 + FR-04b 的实测浪费量）。
 *
 * 输入需包含 `compaction/*` **以及 `turn/start` · `turn/end`**：`compaction/prune`
 * 自身不带 turn，靠 turn 边界顺延；只喂 compaction 事件的话每条 prune 的 turn
 * 都会落成 null（真实日志上验证过这个坑）。
 *
 * `prunes[].shadowed_token_count` 是**宿主实测**的被丢弃 token 数，与
 * `context_composition` 的 est_tokens 估算 provenance 不同，展示层须分开标注。
 * @param {string} events_json
 * @returns {string}
 */
export function compaction_events(events_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(events_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.compaction_events(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred2_0 = r0;
        deferred2_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
    }
}

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
 * @param {string} events_json
 * @returns {string}
 */
export function context_composition(events_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(events_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.context_composition(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred2_0 = r0;
        deferred2_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
    }
}

/**
 * 执行时长审计（`DURATION_AUDIT_BACKLOG.md` D1–D3）：通用工具调用耗时 +
 * turn/step 时长 + 审批等待延迟，合并成一次 wasm 调用，与 `skill_audit` 的
 * 单事件数组输入同一种契约。
 *
 * **D4（hook 消费）故意不在这里**——`duration::hook_executions` 的宿主前提
 * （浏览器能不能拿到 `hook/*` 事件）还没有人拿真实会话验证过，在验证通过
 * 之前不接进这条浏览器链路，只在 CLI 侧可用（`hook_executions` 本身已经
 * 就绪，见 `crates/agent-vitals-domain/src/domain/duration.rs` 的模块级警告）。
 * @param {string} events_json
 * @returns {string}
 */
export function duration_audit(events_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(events_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.duration_audit(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred2_0 = r0;
        deferred2_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
    }
}

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
 * @param {string} events_json
 * @returns {string}
 */
export function hour_buckets(events_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(events_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.hour_buckets(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred2_0 = r0;
        deferred2_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
    }
}

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
 * @param {string} events_json
 * @returns {string}
 */
export function request_metrics(events_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(events_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.request_metrics(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred2_0 = r0;
        deferred2_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Skill 执行审计（backlog T4）：`SkillInvocationEvent[]`——谁在什么时候被什么
 * 方式（`explicit` / `model_selected`）触发、加载成功没有（`loaded` /
 * `failed` / `incomplete`）、花了多久。
 *
 * 与 `structural_waste` 同一种二参数契约：`requests_json` 需要是
 * `request_metrics` 已经算好的那份输出（同一批 usage_events）——`request_seq`
 * 靠 `(turn, step)` 精确匹配回那一行，不是"最近的 seq"启发式。
 * @param {string} events_json
 * @param {string} requests_json
 * @returns {string}
 */
export function skill_audit(events_json, requests_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(events_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(requests_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN;
        wasm.skill_audit(retptr, ptr0, len0, ptr1, len1);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred3_0 = r0;
        deferred3_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export3(deferred3_0, deferred3_1, 1);
    }
}

/**
 * T6 — 子 Agent 聚合与覆盖率。`spawns_json` 是 `subagent_spawns` 的输出。
 * 返回 `skill_invocations_enriched` 的结果（enriched invocations + coverage matrix）。
 * @param {string} events_json
 * @param {string} requests_json
 * @param {string} spawns_json
 * @returns {string}
 */
export function skill_audit_enriched(events_json, requests_json, spawns_json) {
    let deferred4_0;
    let deferred4_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(events_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(requests_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(spawns_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len2 = WASM_VECTOR_LEN;
        wasm.skill_audit_enriched(retptr, ptr0, len0, ptr1, len1, ptr2, len2);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred4_0 = r0;
        deferred4_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export3(deferred4_0, deferred4_1, 1);
    }
}

/**
 * FR-04b 结构性浪费：回答"哪些是浪费的""我该怎么办"。规则可直接判定，不
 * 需要历史基线（"相对浪费"——缓存命中率偏低等——继续留在展示层，受 FR-05
 * 约束）。`requests_json` 需要是 `request_metrics` 已经算好的那份输出（同一
 * 批 usage_events），两个检测器共用它来算失败区间的上下文增量。
 * @param {string} events_json
 * @param {string} requests_json
 * @returns {string}
 */
export function structural_waste(events_json, requests_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(events_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(requests_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN;
        wasm.structural_waste(retptr, ptr0, len0, ptr1, len1);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred3_0 = r0;
        deferred3_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export3(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @param {string} events_json
 * @returns {string}
 */
export function subagent_spawns(events_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(events_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.subagent_spawns(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred2_0 = r0;
        deferred2_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
    }
}

/**
 * 成本账事件数组 → 按模型分桶的 token 报告。
 *
 * 与 `audit_events` 同契约：输入 `JSON.stringify(events)`，输出
 * `JSON.stringify(token_by_model(events))`——`{"by_model": {...}, "sequence": [...]}`
 * （snake_case）。CLI 与浏览器 tab 都走同一份 core 折叠（单一真相源）；tab 的
 * 宿主半份把 usage 事件喂进来，客户端只读投影渲染。
 * @param {string} events_json
 * @returns {string}
 */
export function token_by_model(events_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(events_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.token_by_model(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred2_0 = r0;
        deferred2_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export3(deferred2_0, deferred2_1, 1);
    }
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
    };
    return {
        __proto__: null,
        "./agent_vitals_wasm_bg.js": import0,
    };
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('agent_vitals_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
