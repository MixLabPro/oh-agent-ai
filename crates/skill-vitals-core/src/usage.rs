//! 会话级成本折叠 —— 把 usage 事件按当时活跃的模型分桶。
//!
//! 与 `behavior` 模块（SV601–610 风险规则）是两条正交的审计维度：风险规则
//! 输出 finding 列表，这里输出 `{"by_model": {...}, "sequence": [...]}`。
//! 浏览器 tab 经 wasm 与 CLI 共用这一份引擎 —— never a second copy。
//!
//! 折叠语义与 DSH token-meter（packages/llm/token-meter/src/usage-projection.ts
//! 的 tokenUsageProjectionDefinition）完全一致，并已用真实日志对账：各桶之和
//! == tokenUsage 投影累计值（94997694 会话 180577354/498735/712320/0 逐字节
//! 一致）。Python 平行实现见 `scripts/skill_vitals/usage.py`，差分防护在本文件
//! 的 parity 测试与 `tests/test_cli_matrix.py` 的双实现逐字节比较。
//!
//! 三个关键语义（为什么这样实现，对应共性缺陷）：
//! - **按模型分桶**：request/header 的 config.model 会在会话中途变化（真实日志
//!   出现过 pro → flash → pro），`tokenUsage` 投影只有全会话累计、没有模型维度
//!   ——拿一个模型价算整段账会错 3 倍。
//! - **同 (turn, step) 去重**：usage chunk 先到、assistant/message 后到是同一
//!   step 的两份 sample，只计最后一份；替换时从**原归属模型**减掉旧值——否则
//!   双计会让分桶之和超过真实累计。
//! - **无活跃模型归 unknown**：老日志无 request/header 时宁缺勿造，落进
//!   `"unknown"` 桶由展示层标「未计价」，绝不臆造一个模型。
//!
//! 每个桶除四个全量字段外还带四个 `peak_*` 子字段——落在北京高峰时段
//! （**周一至周五** 9–12、14–18 点；周末全天为空闲）的部分，由触发这份贡献的
//! 事件自己的 `time` 字段判定。
//! 这不是为了展示"高峰用了多少"这件事本身，而是让展示层能算出**真实发生的
//! 费用**（按每笔请求实际的时段计价），而不是过去那种"给空闲价和高峰价两个
//! 数，猜不出你半夜发的请求该按哪个算"的区间估算——旧版本注释说"累计桶无法
//! 重建每笔请求的时刻"，那是折叠时把 `time` 直接扔掉的自我实现，不是数据不
//! 存在。

use serde_json::{Map, Value, json};

/// 同一模型名在一次会话里被两家供应商服务过时的标记。故意用一个不可能是
/// 真实供应商名的字符串：它不会命中 `priced_providers` 白名单，于是自动
/// 落进「不计价」——不需要计价方再认一个特殊分支。
pub const AMBIGUOUS_PROVIDER: &str = "__ambiguous__";

/// usage sample 的四个字段名（日志里的 camelCase），顺序与四桶对齐。
const SAMPLE_FIELDS: [&str; 4] =
    ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"];

/// 从 usage sample 取四桶。字段映射与 token-meter `bucketsFrom` 完全一致
/// （reasoning 已含在 outputTokens，不重复计）。
///
/// 缺字段仍按 0 累加——这是**求和**的正确语义，且四桶之和必须与 DSH 的
/// `tokenUsage` 逐字节相等（已对账的不变量，不能动）。但「求和按 0」不等于
/// 「测到了 0」：`seen` 收集**真正出现过**的字段名，由 `token_by_model` 折成
/// `unreported_fields`，让展示层能写「未上报」而不是「0」。
///
/// 有实测依据：真实会话（session-e4b0be69）的 1398 个 usage 样本（720 条
/// `assistant/chunk` + 678 条 `assistant/message`）里 `cacheWriteTokens`
/// **一次都没出现过**，`cacheReadTokens` 出现 1348 次。原来缺字段直接落 0，
/// UI 于是显示「缓存写 0」——一个被伪造出来的测量值。这与「host 能力缺失时
/// 降级、绝不臆造」是同一条纪律：缺列的报告有用，编造列的没用。
///
/// （早先这条注释写的是「679 个样本」——那个数只数了 `assistant/message`
/// 一种类型，漏了 `assistant/chunk`；发现于事后核对真实日志时，已更正。）
fn buckets_from(usage: &Value, seen: &mut [bool; 4]) -> [i64; 4] {
    let mut out = [0i64; 4];
    for (i, key) in SAMPLE_FIELDS.iter().enumerate() {
        if let Some(n) = usage.get(key).and_then(|v| v.as_i64()) {
            seen[i] = true;
            out[i] = n;
        }
    }
    out
}

const BEIJING_OFFSET_SECS: i64 = 8 * 3600;

/// Unix ms → 北京时间小时数 [0,24)。中国自 1991 年起全境固定 UTC+8、无夏令时，
/// 这是精确换算，不是近似。
fn beijing_hour(time_ms: i64) -> i32 {
    let secs = time_ms.div_euclid(1000) + BEIJING_OFFSET_SECS;
    (secs.rem_euclid(86_400) / 3600) as i32
}

/// Unix ms → 北京时间星期几（周一=0 … 周日=6）。
///
/// 1970-01-01 是星期四（以周一=0 计即 3），所以 `(天数 + 3) % 7`。用纯整数算，
/// 不引日期库——`div_euclid`/`rem_euclid` 保证 1970 年之前的负时间戳也对。
fn beijing_weekday(time_ms: i64) -> i64 {
    let secs = time_ms.div_euclid(1000) + BEIJING_OFFSET_SECS;
    (secs.div_euclid(86_400) + 3).rem_euclid(7)
}

/// 高峰时段：北京时间**周一至周五**的 9–12 点、14–18 点（左闭右开）。
/// 其余一切时间（含周六周日全天）都是空闲时段，空闲价 = 高峰价的一半。
///
/// **周末那一条以前漏了**，代价是精确的 2 倍：真实账单对照（2026-08-23 周日
/// 14:45 那次会话）我们算 ¥1.0308372、官方收 ¥0.5154186，正好 ×2.0000——
/// 29 次请求的 token 数逐位吻合，只有时段判错。而且这条从来没被真实账单验证
/// 过：上一次对账的会话跑在 21–22 点，全程落在空闲时段，走的根本不是这个
/// 分支，所以碰巧对上了。
fn is_peak_slot(time_ms: i64) -> bool {
    if beijing_weekday(time_ms) > 4 {
        return false; // 周六(5)、周日(6) 全天空闲
    }
    let hour = beijing_hour(time_ms);
    (9..12).contains(&hour) || (14..18).contains(&hour)
}

/// 事件是否落在高峰时段。缺 `time`（老日志/畸形事件）保守按空闲算——峰值单价
/// 更高，宁可少算费用也不要凭空安一个「高峰」时刻上去（不臆造）。
fn is_peak(event: &Value) -> bool {
    match event.get("time").and_then(|v| v.as_i64()) {
        Some(ms) => is_peak_slot(ms),
        None => false,
    }
}

/// 分桶相加。`sign=-1` 用于替换语义（从原归属模型减掉旧值）。`peak` 决定这份
/// 贡献是否也叠进 `peak_*` 子桶——四个基础桶始终是全量（空闲+高峰），
/// `peak_*` 只是其中高峰时段的子集，off-peak 由展示层用 全量 − peak 推出，
/// 不另开一份容易和全量对不上的独立字段。
fn add_buckets(by_model: &mut Map<String, Value>, model: &str, b: [i64; 4], sign: i64, peak: bool) {
    let entry = by_model.entry(model.to_string()).or_insert_with(|| json!({
        "uncached_input_tokens": 0i64,
        "output_tokens": 0i64,
        "cache_read_tokens": 0i64,
        "cache_write_tokens": 0i64,
        "peak_uncached_input_tokens": 0i64,
        "peak_output_tokens": 0i64,
        "peak_cache_read_tokens": 0i64,
        "peak_cache_write_tokens": 0i64,
    }));
    if let Some(obj) = entry.as_object_mut() {
        let mut fields: Vec<(&str, i64)> = vec![
            ("uncached_input_tokens", b[0]),
            ("output_tokens", b[1]),
            ("cache_read_tokens", b[2]),
            ("cache_write_tokens", b[3]),
        ];
        if peak {
            fields.extend([
                ("peak_uncached_input_tokens", b[0]),
                ("peak_output_tokens", b[1]),
                ("peak_cache_read_tokens", b[2]),
                ("peak_cache_write_tokens", b[3]),
            ]);
        }
        for (key, v) in fields {
            if let Some(cur) = obj.get_mut(key) {
                if let Some(n) = cur.as_i64() {
                    *cur = json!(n + sign * v);
                }
            }
        }
    }
}

/// usage 事件 → (turn, step, usage)。非 usage 事件返回 None。
///
/// `assistant/chunk` 仅当 `data.chunk.type == "usage"`；`assistant/message`
/// 仅当 `data.usage` 存在；缺 turn/step 视为畸形 usage 事件，跳过。
fn usage_sample(event: &Value) -> Option<(i64, i64, &Value)> {
    let etype = event.get("type").and_then(|v| v.as_str())?;
    let data = event.get("data").and_then(|v| v.as_object())?;
    let (turn, step, usage) = if etype == "assistant/chunk" {
        let chunk = data.get("chunk").and_then(|v| v.as_object())?;
        if chunk.get("type").and_then(|v| v.as_str()) != Some("usage") {
            return None;
        }
        (data.get("turn"), data.get("step"), chunk.get("usage"))
    } else if etype == "assistant/message" {
        if !data.contains_key("usage") {
            return None;
        }
        (data.get("turn"), data.get("step"), data.get("usage"))
    } else {
        return None;
    };
    let (Some(turn), Some(step)) = (turn, step) else { return None };
    let (Some(turn), Some(step)) = (turn.as_i64(), step.as_i64()) else { return None };
    Some((turn, step, usage?))
}

/// 事件流 → `{"by_model": {...}, "sequence": [...]}`。
///
/// 纯函数、确定性：同一事件流重放结果逐字节一致。非 object 条目跳过；
/// request/header 设活跃模型（sequence 相邻去重，保留「切回」信息）；
/// usage 事件折进当前模型；无 request/header 时归 `"unknown"` 桶。
pub fn token_by_model(events: &[Value]) -> Value {
    // 只看分叉之后的事件——审计回答的是「**这个**会话干了什么」。从上游会话
    // branch 出来时抄进日志的那段历史属于上游自己那份审计，在这里再算一遍就是
    // 对同一笔钱/同一批行为重复计数（见 util::fork_boundary 的实测数据）。
    let events = &crate::util::post_fork(events)[..];
    let mut by_model: Map<String, Value> = Map::new();
    // 模型名 → 供应商（冲突或未上报时为 Null）。与 by_model 并列而不是把两者
    // 拼成复合键：展示层要按 (供应商, 模型) 拆行，拼成一个字符串反而要再拆开。
    let mut providers: Map<String, Value> = Map::new();
    let mut last: Option<(i64, i64, [i64; 4], String, bool)> = None; // 同 step 去重槽
    let mut active: Option<String> = None;
    let mut sequence: Vec<String> = Vec::new();
    let mut seen: [bool; 4] = [false; 4]; // 真正出现过的 usage 字段（见 buckets_from）
    let mut samples: u64 = 0; // 0 个样本时不对「未上报」下任何断言

    for event in events {
        if !event.is_object() {
            continue;
        }
        if event.get("type").and_then(|v| v.as_str()) == Some("request/header") {
            let model = event
                .pointer("/data/header/config/model")
                .and_then(|v| v.as_str());
            let Some(model) = model else { continue };
            // 供应商与模型是**两个维度**：真实会话里同一份日志既有
            // provider=deepseek-official 的 flash，也有 provider=shengsuanyun 的
            // pro——两家的价目表不同，只按模型名计价会把一家的用量按另一家的价
            // 算（实测把胜算云的 3.5M token 按 DeepSeek 官方价算出了 ¥1.66）。
            //
            // 三种取值必须分开，否则会把「老日志没这个字段」和「两家都服务过
            // 这个模型」混为一谈：
            //   - Null       = 所有 header 都没上报 provider（老日志）→ 计价方
            //                  沿用默认表，保持既有行为；
            //   - "…"        = 唯一确定的供应商 → 按白名单判断能不能计价；
            //   - AMBIGUOUS  = 同一模型名被两家服务过 → 我们无法判断哪些 token
            //                  属于哪家，猜一个等于替用户编一次归属，拒绝计价。
            let provider = event
                .pointer("/data/header/config/provider")
                .and_then(|v| v.as_str());
            match providers.get(model) {
                None => {
                    providers.insert(
                        model.to_string(),
                        provider.map(|p| json!(p)).unwrap_or(Value::Null),
                    );
                }
                Some(prev) => {
                    if prev.as_str() != Some(AMBIGUOUS_PROVIDER) && prev.as_str() != provider {
                        providers.insert(model.to_string(), json!(AMBIGUOUS_PROVIDER));
                    }
                }
            }
            if active.as_deref() != Some(model) {
                sequence.push(model.to_string());
            }
            active = Some(model.to_string());
            continue;
        }
        let Some((turn, step, usage)) = usage_sample(event) else { continue };
        samples += 1;
        let buckets = buckets_from(usage, &mut seen);
        let model = active.clone().unwrap_or_else(|| "unknown".to_string());
        let peak = is_peak(event);
        match &last {
            Some((lt, ls, lb, lmodel, lpeak)) if *lt == turn && *ls == step => {
                if *lb == buckets && *lpeak == peak {
                    continue;
                }
                add_buckets(&mut by_model, lmodel, *lb, -1, *lpeak);
                add_buckets(&mut by_model, &model, buckets, 1, peak);
                last = Some((turn, step, buckets, model, peak));
            }
            _ => {
                add_buckets(&mut by_model, &model, buckets, 1, peak);
                last = Some((turn, step, buckets, model, peak));
            }
        }
    }

    // 一个样本都没有时返回空列表：没有数据就不做「宿主不报这个字段」的断言。
    let unreported: Vec<&str> = if samples > 0 {
        SAMPLE_FIELDS.iter().enumerate().filter(|(i, _)| !seen[*i]).map(|(_, k)| *k).collect()
    } else {
        Vec::new()
    };

    json!({
        "by_model": Value::Object(by_model),
        "providers": Value::Object(providers),
        "sequence": sequence,
        "unreported_fields": unreported,
    })
}

/// usage sample 的单个字段：在场取值，缺席取 `None`。
///
/// 与 `buckets_from` 的「缺字段按 0」是**两种正确语义**，不是不一致：那边在做
/// 求和（四桶之和必须与 DSH `tokenUsage` 逐字节相等，是已对账的不变量），求和
/// 里缺项当 0 是对的；这里在做逐请求的**测量值**，缺项落 0 就是把「宿主没报」
/// 伪造成「测到 0」——正是 `unreported_fields` 当初要修的那个缺陷。
fn opt_i64(usage: &Value, key: &str) -> Option<i64> {
    usage.get(key).and_then(|v| v.as_i64())
}

/// `Option<i64>` → JSON（`None` 落 `null`，不落 0）。
fn or_null(v: Option<i64>) -> Value {
    match v {
        Some(n) => json!(n),
        None => Value::Null,
    }
}

/// 逐请求指标（PRD §9.3 RequestMetric）——与 `token_by_model` 是**同一个 fold
/// 的两个出口**，区别只在保留分辨率：那边把每个样本折进按模型的总数，这里保留
/// 每次请求自己的一行。会话健康时间线上的每个点都来自它。
///
/// 为什么必须同源而不是另写一份：同 (turn, step) 的 usage chunk 先到、
/// assistant/message 后到是同一次请求的两份 sample，只算最后一份。两处各写一遍
/// 去重迟早分叉，所以共用 `usage_sample` 与同一套「后到者覆盖」语义，并由
/// `request_metrics_reconciles_with_token_by_model` 钉死不变量：
/// **逐请求四桶之和 == `token_by_model` 四桶之和**。
///
/// 三条诚实性约定（与本仓「缺列不编列」同一条纪律）：
/// - 缺字段落 `null` 不落 0（见 `opt_i64`）。
/// - `context_tokens` 只在它求和的每一项都在场时才非空。真实会话
///   （session-e4b0be69）687 个请求点里有 13 个缺 `cacheReadTokens`，这 13 点
///   就该在图上留缺口；拿部分和硬凑出一个偏低的占用，比缺口更有害。
/// - **不输出逐请求的 `compacted` 布尔列**：压缩事件类型已确认（见 `compaction.rs`），
///   但它是独立于请求的一类事件（同一 turn 内没有对应哪个具体 request），不该硬塞成
///   每行一个 true/false。真正的压缩视图是 `compaction_events()` 单独的输出。
///
/// `context_window` 取自 `request/context` 事件的 `data.contextWindow`，按
/// 「最近一次上报」向后生效——真实日志里它一个会话只出现 5 次（每次模型切换
/// 各一次），不是每请求一次，所以不能按请求去找，只能沿用最近值。
pub fn request_metrics(events: &[Value]) -> Value {
    // 只看分叉之后的事件——审计回答的是「**这个**会话干了什么」。从上游会话
    // branch 出来时抄进日志的那段历史属于上游自己那份审计，在这里再算一遍就是
    // 对同一笔钱/同一批行为重复计数（见 util::fork_boundary 的实测数据）。
    let events = &crate::util::post_fork(events)[..];
    let mut out: Vec<Value> = Vec::new();
    let mut active: Option<String> = None;
    let mut window: Option<i64> = None;
    let mut last_key: Option<(i64, i64)> = None; // 同 (turn, step) 去重

    for event in events {
        if !event.is_object() {
            continue;
        }
        match event.get("type").and_then(|v| v.as_str()) {
            Some("request/header") => {
                if let Some(m) = event.pointer("/data/header/config/model").and_then(|v| v.as_str())
                {
                    active = Some(m.to_string());
                }
                continue;
            }
            Some("request/context") => {
                // 缺 contextWindow 时保留上一次的值，不清空——一次畸形事件不该
                // 让后面所有请求都失去分母。
                if let Some(w) = event.pointer("/data/contextWindow").and_then(|v| v.as_i64()) {
                    window = Some(w);
                }
                continue;
            }
            _ => {}
        }

        let Some((turn, step, usage)) = usage_sample(event) else { continue };

        let uncached = opt_i64(usage, "inputTokens");
        let cache_read = opt_i64(usage, "cacheReadTokens");
        // 两项都在场才给 context_tokens；少一项整行留空（见 doc 注释）。
        let context_tokens = match (uncached, cache_read) {
            (Some(a), Some(b)) => Some(a + b),
            _ => None,
        };

        let row = json!({
            "request_seq": 0i64, // 去重后统一回填，见下
            "seq": or_null(event.get("seq").and_then(|v| v.as_i64())),
            "time": or_null(event.get("time").and_then(|v| v.as_i64())),
            "turn": turn,
            "step": step,
            "model": active.clone().unwrap_or_else(|| "unknown".to_string()),
            "context_window": or_null(window),
            "context_tokens": or_null(context_tokens),
            "uncached_input_tokens": or_null(uncached),
            "output_tokens": or_null(opt_i64(usage, "outputTokens")),
            "cache_read_tokens": or_null(cache_read),
            "cache_write_tokens": or_null(opt_i64(usage, "cacheWriteTokens")),
            // 这笔请求是否落在北京高峰时段。**规则留在 core，价格留给调用方**：
            // 展示层要画逐请求费用曲线，就必须知道每笔按高峰价还是空闲价算；
            // 让浏览器自己重算一遍 `is_peak` 就是这条规则的第四份拷贝。
            // 时间戳缺失时为 null——不是 false（"没测到"不等于"不在高峰"）。
            "is_peak": match event.get("time").and_then(|v| v.as_i64()) {
                Some(_) => json!(is_peak(event)),
                None => Value::Null,
            },
        });

        if last_key == Some((turn, step)) {
            // 后到者覆盖前一行（与 token_by_model 的替换语义一致）
            if let Some(slot) = out.last_mut() {
                *slot = row;
            }
        } else {
            out.push(row);
            last_key = Some((turn, step));
        }
    }

    // request_seq 在去重之后才有意义：它是「第几个请求点」，不是「第几个样本」。
    for (i, row) in out.iter_mut().enumerate() {
        if let Some(obj) = row.as_object_mut() {
            obj.insert("request_seq".to_string(), json!(i as i64 + 1));
        }
    }

    Value::Array(out)
}

/// 常驻上下文构成（PRD FR-04a，回答「token 都去哪了」的第一层）。
///
/// 返回**每次请求都要重发的那段前缀**的分类估算：
///
/// | 类别 | 来源 | 性质 |
/// |---|---|---|
/// | `system_tokens` | `request/header.data.header.system` | 实测文本 → est_tokens 估算 |
/// | `tools_tokens` | `request/header.data.header.tools`（序列化后） | 同上 |
/// | `catalog_tokens` | `source.kind == "skill-catalog"` 的 `entries[].name + description` | 同上 |
///
/// `catalog_names` 是 `catalog_tokens` 的逐条拆分（T1，PRD FR-SK-02/AC-SK-01 的数据源）：
/// `[{name, tokens}]`。**故意不带 description 原文**——FR-SK-09 要求导出不含未脱敏
/// 内容，description 是内容，一旦进投影就会跟着 `--redact` 之外的路径流进导出；
/// 逐 skill「目录 Token」只需要 `tokens` 这个数，不需要原文佐证。
///
/// **这三个数与 `request_metrics` 的 `context_tokens` 不是同一个估算器，不能相加
/// 相等，也不能相减去凑「其余」而不加说明。** 真实会话实测：首次请求的常驻前缀
/// est_tokens = 10,830，而 provider 报的 `uncached + cacheRead` = 13,959，差的
/// 3,129 是首条用户消息与消息封套开销。所以本函数只给**常驻部分的分类**与
/// `estimator` 标注，剩下多少由展示层用 provider 计数自己减——减出来的差额必须
/// 标成「未分类」而不是某个具体类别，否则就是把估算误差伪装成测量结果。
///
/// 缺源事件时给 `null` 而不是 0：日志里从没出现过 `skill-catalog` 事件，与
/// 「发布了一个空目录」是两回事，展示层要能写「未知」而不是「0 个技能」。
/// 与 `unreported_fields` 是同一条纪律。
///
/// 「最近一次发布覆盖前一次」——目录会在会话中途重新发布，当前状态是最后那次
/// （与 binary 侧 `dsh.rs` 的 catalog 语义一致）。`request/header` 同理：模型
/// 切换会重发，system/tools 取最近一次。
pub fn context_composition(events: &[Value]) -> Value {
    // 只看分叉之后的事件——审计回答的是「**这个**会话干了什么」。从上游会话
    // branch 出来时抄进日志的那段历史属于上游自己那份审计，在这里再算一遍就是
    // 对同一笔钱/同一批行为重复计数（见 util::fork_boundary 的实测数据）。
    let events = &crate::util::post_fork(events)[..];
    let mut system: Option<i64> = None;
    let mut tools: Option<i64> = None;
    let mut catalog: Option<i64> = None;
    let mut entries: Option<i64> = None;
    let mut names: Option<Vec<Value>> = None;

    for event in events {
        if !event.is_object() {
            continue;
        }
        if event.get("type").and_then(|v| v.as_str()) == Some("request/header") {
            if let Some(s) = event.pointer("/data/header/system").and_then(|v| v.as_str()) {
                system = Some(crate::util::est_tokens(s));
            }
            // tools 是数组，按序列化后的文本估——模型看到的就是这份 JSON。
            if let Some(t) = event.pointer("/data/header/tools") {
                if !t.is_null() {
                    let text = serde_json::to_string(t).unwrap_or_default();
                    tools = Some(crate::util::est_tokens(&text));
                }
            }
            continue;
        }
        // 技能目录挂在多种事件的 data.source 上（不是专用事件类型），
        // 真实会话里出现在 user/message、agent/inbox/spliced 等等。
        let Some(source) = event.pointer("/data/source") else { continue };
        if source.get("kind").and_then(|v| v.as_str()) != Some("skill-catalog") {
            continue;
        }
        let Some(list) = source.get("entries").and_then(|v| v.as_array()) else { continue };
        let mut sum = 0i64;
        let mut this_names = Vec::with_capacity(list.len());
        for entry in list {
            let name = entry.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let desc = entry.get("description").and_then(|v| v.as_str()).unwrap_or("");
            // name 与 description 拼起来估：与 Python 侧同一口径。
            let tokens = crate::util::est_tokens(&format!("{name}{desc}"));
            sum += tokens;
            this_names.push(json!({"name": name, "tokens": tokens}));
        }
        catalog = Some(sum);
        entries = Some(list.len() as i64);
        names = Some(this_names);
    }

    // 三项都缺就没有「常驻合计」可言——不拿 0 当合计。
    let resident_total = match (system, tools, catalog) {
        (None, None, None) => Value::Null,
        _ => json!(system.unwrap_or(0) + tools.unwrap_or(0) + catalog.unwrap_or(0)),
    };

    json!({
        "system_tokens": or_null(system),
        "tools_tokens": or_null(tools),
        "catalog_tokens": or_null(catalog),
        "catalog_entries": or_null(entries),
        "catalog_names": names.map(Value::Array).unwrap_or(Value::Null),
        "resident_total": resident_total,
        // 展示层据此标注「估算」，并且**不得**把它与 provider 的 context_tokens
        // 直接相减后当作精确的分类结果。
        "estimator": "est_tokens",
    })
}

/// 分叉前那段被排除掉的用量——**只为把话说清楚而存在**。
///
/// 主输出（`token_by_model` 等）已经把分叉前的事件滤掉了，这是正确的：审计回答
/// 的是「这个会话干了什么」。但金额会因此显著变小（实测 ¥1113.66 → ¥433.30），
/// 不给出被排除的量，用户会以为数据坏了。
///
/// 返回 `Value::Null` 表示这个会话根本没有分叉——**不是返回一个全零的结构**，
/// 「没分叉」和「分叉了但上游没花钱」是两回事。
pub fn pre_fork_usage(events: &[Value]) -> Value {
    let Some(b) = crate::util::fork_boundary(events) else {
        return Value::Null;
    };
    let before: Vec<Value> = events
        .iter()
        .filter(|e| e.get("seq").and_then(|v| v.as_i64()).is_some_and(|q| q < b))
        .cloned()
        .collect();
    if before.is_empty() {
        return Value::Null;
    }
    // 这里**不能**走 token_by_model —— 它自己会先 post_fork，把这批全滤掉。
    // 直接调内部折叠。
    let mut fake = before;
    // 追加一个哨兵边界，让内部的 post_fork 认为「分叉在最开头」，从而全量保留。
    fake.insert(0, serde_json::json!({"type": "session/end-seed", "seq": -1, "data": {}}));
    let mut out = token_by_model(&fake);
    if let Some(o) = out.as_object_mut() {
        o.insert("boundary_seq".to_string(), serde_json::json!(b));
    }
    out
}

/// `days_since_1970` → ISO `YYYY-MM-DD`。
///
/// Howard Hinnant 的 civil_from_days 算法（http://howardhinnant.github.io/
/// date_algorithms.html#civil_from_days），public domain。**不引 chrono**
/// ——CLAUDE.md §「no third-party supply chain at scan time」，统计折叠这层
/// 必须是 stdlib-only；引 chrono 就破例了。算法纯整数 ~10 行，且已用
/// 2026-08-25 = days 20690 等价对过。
fn civil_date_from_days(days: i64) -> String {
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // [0, 399]
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

/// 事件流 → 按 `(date, hour)` 折叠到 token 桶。Python 平行实现见
/// `scripts/skill_vitals/usage.py::hour_buckets`，差分防护在本文件的
/// `hour_buckets_*` 测试 + `tests/test_cli_matrix.py` 的双二进制逐字节比较。
///
/// 与 `token_by_model` / `request_metrics` 是**同一次 fold 的三个出口**：
/// 那两个按模型 / 按请求折，这里按小时折。三者共用 `usage_sample` +
/// `buckets_from` + `is_peak`，去重 / peak 语义必须一致 —— 任一处改了
/// 同 `(turn, step)` 处理而另两处没改，对账立刻红。
///
/// 不变量（测试钉死）：
/// - 全桶 4+4 字段之和 == `token_by_model` 按模型聚合后求和；
/// - `(date, hour)` 是**去重后**的聚合粒度，不受 chunk/message 顺序影响；
/// - 跨午夜事件按各自 `event.time` 归属，不归到 session 开始那天；
/// - 时间戳缺失的样本落 `(None, None)` 桶（JSON 里 `"date": null` /
///   `"hour": null`），**不**进任何 `(date, hour)` 桶 —— 避免被算成
///   1970-01-01。
///
/// 输出 schema：
/// ```json
/// {
///   "buckets": [
///     {"date": "2026-08-25", "hour": 14, "is_peak": true,
///      "uncached_input_tokens": ..., ..., "peak_uncached_input_tokens": ...}
///   ],
///   "schema_version": 1,
///   "tz_name": "Asia/Shanghai (UTC+8 fixed, no DST)",
///   "tz_offset_hours": 8,
///   "unreported_fields": [...]
/// }
/// ```
pub fn hour_buckets(events: &[Value]) -> Value {
    // 只看分叉之后的事件——见 token_by_model 的同条注释
    let events = &crate::util::post_fork(events)[..];

    // (date_str, hour) → 8 桶 dict。缺 time 的样本落 (None, None)。
    // 用 Vec 而不是 HashMap 是为了**确定性**输出：按 seq 处理顺序保留
    // 首次出现 key 的位置，最终展平时按 (date, hour) 排序 —— 与 Python
    // 端的 list.sort 行为对齐（bytes-level）。
    let mut bucket_keys: Vec<(Option<String>, Option<i32>)> = Vec::new();
    let mut buckets_map: std::collections::HashMap<(Option<String>, Option<i32>), [i64; 8]> =
        std::collections::HashMap::new();

    let mut last: Option<(i64, i64, Option<String>, Option<i32>, [i64; 4], bool)> = None;
    let mut seen: [bool; 4] = [false; 4];
    let mut samples: u64 = 0;

    for event in events {
        if !event.is_object() {
            continue;
        }
        // request/header 跳过 —— hour_buckets 不按模型分桶,但保留这段逻辑
        // 让循环路径与 token_by_model 一致(防御性)。
        if event.get("type").and_then(|v| v.as_str()) == Some("request/header") {
            continue;
        }
        let Some((turn, step, usage)) = usage_sample(event) else { continue };
        samples += 1;
        let add_buckets = buckets_from(usage, &mut seen);
        let time_ms = event.get("time").and_then(|v| v.as_i64());
        let peak = time_ms.map(is_peak_slot).unwrap_or(false);

        let (date_str, hour) = match time_ms {
            Some(ms) => {
                let secs = ms.div_euclid(1000) + BEIJING_OFFSET_SECS;
                let days = secs.div_euclid(86_400);
                (Some(civil_date_from_days(days)), Some(beijing_hour(ms)))
            }
            None => (None, None),
        };

        let key = (date_str.clone(), hour);
        if !buckets_map.contains_key(&key) {
            bucket_keys.push(key.clone());
        }

        // 同 step 去重时需要**先**把旧贡献从原 hour 桶扣掉,**再**把新贡献
        // 加到当前 hour 桶 —— 这是 token_by_model 的同 step 替换语义,
        // 两边必须一致(否则累加会双计)。Rust 借用检查不允许在持有一个
        // entry() 句柄的同时再 get_mut 另一个 key,所以把"扣旧"和"加新"
        // 分两步,中间 drop 借用。
        let is_dedup = matches!(&last, Some((lt, ls, _, _, _, _)) if *lt == turn && *ls == step);
        let old_buckets = if is_dedup {
            let (lt, ls, ld, lh, lb, lpeak) = last.as_ref().expect("checked above");
            debug_assert_eq!(*lt, turn);
            debug_assert_eq!(*ls, step);
            let lkey = (ld.clone(), *lh);
            // 扣除旧贡献后立即 drop 借用,然后再加新贡献
            if let Some(lentry) = buckets_map.get_mut(&lkey) {
                for i in 0..4 {
                    lentry[i] -= lb[i];
                }
                if *lpeak {
                    for i in 0..4 {
                        lentry[4 + i] -= lb[i];
                    }
                }
            }
            Some(*lb)
        } else {
            None
        };

        let entry = buckets_map.entry(key).or_insert([0i64; 8]);
        let _ = old_buckets; // 显式 drop 旧 borrow
        for i in 0..4 {
            entry[i] += add_buckets[i];
        }
        if peak {
            for i in 0..4 {
                entry[4 + i] += add_buckets[i];
            }
        }
        last = Some((turn, step, date_str, hour, add_buckets, peak));
    }

    // 排序 + 展平：unknown (None, None) 桶沉底 —— 与 Python list.sort 的
    // (date is None, date, hour) key 一致。
    bucket_keys.sort_by(|a, b| {
        let a_is_none = a.0.is_none();
        let b_is_none = b.0.is_none();
        b_is_none
            .cmp(&a_is_none)
            .then_with(|| a.0.cmp(&b.0))
            .then_with(|| a.1.cmp(&b.1))
    });

    let mut rows: Vec<Value> = Vec::with_capacity(bucket_keys.len());
    for key in &bucket_keys {
        let b = buckets_map.get(key).copied().unwrap_or([0i64; 8]);
        let (date_str, hour) = key;
        let is_peak = match (date_str, hour) {
            (None, _) => Value::Null,
            (Some(_), _) => {
                // 任一 peak_* > 0 → 整桶标 peak(单一粒度,不是逐字段)
                Value::Bool(b[4] != 0 || b[5] != 0 || b[6] != 0 || b[7] != 0)
            }
        };
        rows.push(json!({
            "date": date_str,
            "hour": hour,
            "is_peak": is_peak,
            "uncached_input_tokens": b[0],
            "output_tokens": b[1],
            "cache_read_tokens": b[2],
            "cache_write_tokens": b[3],
            "peak_uncached_input_tokens": b[4],
            "peak_output_tokens": b[5],
            "peak_cache_read_tokens": b[6],
            "peak_cache_write_tokens": b[7],
        }));
    }

    // 一个样本都没有时返回空 unreported —— 与 token_by_model 同条纪律
    let unreported: Vec<&str> = if samples > 0 {
        SAMPLE_FIELDS
            .iter()
            .enumerate()
            .filter(|(i, _)| !seen[*i])
            .map(|(_, k)| *k)
            .collect()
    } else {
        Vec::new()
    };

    json!({
        "buckets": rows,
        "schema_version": 1,
        "tz_name": "Asia/Shanghai (UTC+8 fixed, no DST)",
        "tz_offset_hours": 8,
        "unreported_fields": unreported,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 同 (turn, step) 的 usage chunk 先到、message 后到：只计 message，不双计。
    #[test]
    fn usage_dedup_same_step_replaced_by_message() {
        let events = [
            json!({"type":"request/header","seq":1,"data":{"header":{"config":{"model":"m"}}}}),
            json!({"type":"assistant/chunk","seq":2,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":1000,"outputTokens":200,"cacheReadTokens":300}}}}),
            json!({"type":"assistant/message","seq":3,"data":{"turn":1,"step":1,"usage":{"inputTokens":1200,"outputTokens":250,"cacheReadTokens":300}}}),
        ];
        let out = token_by_model(&events);
        // 事件无 time 字段 → is_peak 保守判 false，peak_* 全 0。
        assert_eq!(
            out["by_model"]["m"],
            json!({
                "uncached_input_tokens":1200,"output_tokens":250,"cache_read_tokens":300,"cache_write_tokens":0,
                "peak_uncached_input_tokens":0,"peak_output_tokens":0,"peak_cache_read_tokens":0,"peak_cache_write_tokens":0,
            })
        );
        assert_eq!(out["sequence"], json!(["m"]));
    }

    /// 模型切换保留「切回」信息：pro → flash → pro 的 sequence 是 3 个元素。
    #[test]
    fn usage_sequence_preserves_switch_back() {
        let events = [
            json!({"type":"request/header","seq":1,"data":{"header":{"config":{"model":"a"}}}}),
            json!({"type":"assistant/chunk","seq":2,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":1}}}}),
            json!({"type":"request/header","seq":3,"data":{"header":{"config":{"model":"b"}}}}),
            json!({"type":"assistant/chunk","seq":4,"data":{"turn":2,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":1}}}}),
            json!({"type":"request/header","seq":5,"data":{"header":{"config":{"model":"a"}}}}),
            json!({"type":"assistant/chunk","seq":6,"data":{"turn":3,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":1}}}}),
            // 相邻重复不推进序列
            json!({"type":"request/header","seq":7,"data":{"header":{"config":{"model":"a"}}}}),
        ];
        let out = token_by_model(&events);
        assert_eq!(out["sequence"], json!(["a", "b", "a"]));
        assert_eq!(out["by_model"]["a"]["uncached_input_tokens"], json!(2));
        assert_eq!(out["by_model"]["b"]["uncached_input_tokens"], json!(1));
    }

    /// 高峰/空闲按事件自己的 time 精确判定，不是猜的区间。北京 10:00（峰值）
    /// 与 20:00（空闲，18 点后）各出一条 usage，验证 peak_* 只累计峰值那条，
    /// 全量字段仍是两条之和——off-peak 由展示层拿 全量−peak 推出。
    #[test]
    fn usage_peak_hour_attributed_from_event_time() {
        let events = [
            json!({"type":"request/header","seq":1,"time":1704074400000i64,"data":{"header":{"config":{"model":"m"}}}}),
            // 2024-01-01 10:00:00 北京时间（[9,12) 高峰）
            json!({"type":"assistant/chunk","seq":2,"time":1704074400000i64,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":100,"outputTokens":10}}}}),
            // 2024-01-01 20:00:00 北京时间（18 点后，空闲）
            json!({"type":"assistant/chunk","seq":3,"time":1704110400000i64,"data":{"turn":2,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":50,"outputTokens":5}}}}),
        ];
        let out = token_by_model(&events);
        let bucket = &out["by_model"]["m"];
        assert_eq!(bucket["uncached_input_tokens"], json!(150), "全量 = 峰值 100 + 空闲 50");
        assert_eq!(bucket["output_tokens"], json!(15), "全量 = 峰值 10 + 空闲 5");
        assert_eq!(bucket["peak_uncached_input_tokens"], json!(100), "只有 10 点那条算峰值");
        assert_eq!(bucket["peak_output_tokens"], json!(10));
    }

    /// 无 request/header 的 usage 归 unknown 桶，不臆造模型。
    #[test]
    fn usage_no_header_goes_to_unknown() {
        let events = [
            json!({"type":"assistant/chunk","seq":1,"data":{"turn":9,"step":9,"chunk":{"type":"usage","usage":{"inputTokens":7}}}}),
        ];
        let out = token_by_model(&events);
        assert_eq!(out["by_model"]["unknown"]["uncached_input_tokens"], json!(7));
        assert_eq!(out["sequence"], json!([]));
    }

    /// 非 object 条目与缺 turn/step 的畸形 usage 事件跳过。
    #[test]
    fn usage_non_object_and_malformed_skipped() {
        let events = [
            json!("not-an-object"),
            json!(7),
            json!({"type":"assistant/chunk","seq":1,"data":{"chunk":{"type":"usage","usage":{"inputTokens":7}}}}), // 缺 turn/step
            json!({"type":"assistant/chunk","seq":2,"data":{"turn":1,"step":1,"chunk":{"type":"text","text":"x"}}}), // 非 usage
        ];
        let out = token_by_model(&events);
        // unreported_fields 为空：一个 usage 样本都没有，就不对「宿主不报某字段」
        // 下断言——没有数据时不做判断，与 host 能力缺失时「缺列不编列」同一条纪律。
        assert_eq!(out, json!({"by_model": {}, "providers": {}, "sequence": [], "unreported_fields": []}));
    }

    /// Python `json.dumps(token_by_model(events), ensure_ascii=False, separators=(",", ":"))`
    /// 对同一事件流（见本文件 docstring 提到的平行实现）的逐字节对照 —— 键序、
    /// 值、序列全部一致。期望串在 Python 侧生成后硬编码于此，Python 一改这里就红。
    #[test]
    fn token_by_model_python_rust_byte_for_byte_parity() {
        let events = [
            json!({"type":"user/message","seq":1,"time":1,"data":{"turn":0,"step":0}}),
            json!({"type":"request/header","seq":2,"time":2,"data":{"header":{"config":{"model":"deepseek/deepseek-v4-pro-0813"}}}}),
            json!({"type":"assistant/chunk","seq":3,"time":3,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":1000,"outputTokens":200,"cacheReadTokens":300}}}}),
            json!({"type":"assistant/chunk","seq":4,"time":4,"data":{"turn":1,"step":1,"chunk":{"type":"text","text":"你好"}}}),
            json!({"type":"assistant/message","seq":5,"time":5,"data":{"turn":1,"step":1,"usage":{"inputTokens":1200,"outputTokens":250,"cacheReadTokens":300}}}),
            json!({"type":"request/header","seq":6,"time":6,"data":{"header":{"config":{"model":"deepseek/deepseek-v4-flash"}}}}),
            json!({"type":"assistant/chunk","seq":7,"time":7,"data":{"turn":2,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":500,"outputTokens":50}}}}),
            json!({"type":"request/header","seq":8,"time":8,"data":{"header":{"config":{"model":"deepseek/deepseek-v4-pro-0813"}}}}),
            json!({"type":"assistant/chunk","seq":9,"time":9,"data":{"turn":3,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":700,"cacheReadTokens":20}}}}),
        ];
        let out = token_by_model(&events);
        // 事件 time 都是 1–9（unix ms，北京时间 1970-01-01 08:00:00 附近）→
        // 落在 [8,9) 点，不在任何高峰区间，peak_* 全 0。
        assert_eq!(
            serde_json::to_string(&out).unwrap(),
            r#"{"by_model":{"deepseek/deepseek-v4-pro-0813":{"uncached_input_tokens":1900,"output_tokens":250,"cache_read_tokens":320,"cache_write_tokens":0,"peak_uncached_input_tokens":0,"peak_output_tokens":0,"peak_cache_read_tokens":0,"peak_cache_write_tokens":0},"deepseek/deepseek-v4-flash":{"uncached_input_tokens":500,"output_tokens":50,"cache_read_tokens":0,"cache_write_tokens":0,"peak_uncached_input_tokens":0,"peak_output_tokens":0,"peak_cache_read_tokens":0,"peak_cache_write_tokens":0}},"providers":{"deepseek/deepseek-v4-pro-0813":null,"deepseek/deepseek-v4-flash":null},"sequence":["deepseek/deepseek-v4-pro-0813","deepseek/deepseek-v4-flash","deepseek/deepseek-v4-pro-0813"],"unreported_fields":["cacheWriteTokens"]}"#
        );
    }

    /// 「字段从未上报」必须与「字段上报了 0」区分开——这两者以前都落成 `0`，
    /// UI 于是把「宿主根本不报缓存写入」显示成「缓存写 0」，一个伪造的测量值。
    ///
    /// 实测依据：真实会话 session-e4b0be69 的 1398 个 usage 样本里
    /// `cacheWriteTokens` 一次都没出现，`cacheReadTokens` 出现 1348 次——
    /// 「缺席」在真实数据里是常态，不是边缘情况。
    #[test]
    fn usage_unreported_field_is_not_a_measured_zero() {
        let header = json!({"type":"request/header","seq":1,"data":{"header":{"config":{"model":"m"}}}});

        // ① 宿主从不上报 cacheWrite/cacheRead → 两者都进 unreported_fields
        let absent = [
            header.clone(),
            json!({"type":"assistant/chunk","seq":2,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":10,"outputTokens":2}}}}),
        ];
        let out = token_by_model(&absent);
        assert_eq!(out["unreported_fields"], json!(["cacheReadTokens", "cacheWriteTokens"]));
        assert_eq!(out["by_model"]["m"]["cache_write_tokens"], json!(0), "求和仍按 0——四桶之和必须与 tokenUsage 相等");

        // ② 宿主显式上报 0 → 不算未上报，`0` 是一个真实测量值
        let explicit_zero = [
            header.clone(),
            json!({"type":"assistant/chunk","seq":2,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":10,"outputTokens":2,"cacheReadTokens":0,"cacheWriteTokens":0}}}}),
        ];
        let out = token_by_model(&explicit_zero);
        assert_eq!(out["unreported_fields"], json!([]), "上报了 0 就是测到了 0，不能算未上报");

        // ③ 只要出现过一次就算已上报——673 次缺席 + 1 次出现，仍是「报了」
        let sometimes = [
            header,
            json!({"type":"assistant/chunk","seq":2,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":10}}}}),
            json!({"type":"assistant/chunk","seq":3,"data":{"turn":2,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":10,"cacheReadTokens":5}}}}),
        ];
        let out = token_by_model(&sometimes);
        assert_eq!(out["unreported_fields"], json!(["outputTokens", "cacheWriteTokens"]));
    }

    // ── request_metrics（逐请求分辨率）────────────────────────────────────

    /// 一次请求一行，含定位（turn/step/seq/time）、模型与分母。
    ///
    /// 这些字段以前**全都存在于事件流、却被 fold 丢掉了**：`usage_sample` 早就
    /// 在读 turn/step（只为去重），`request/header` 的 seq/time 也在手上。会话
    /// 健康时间线做不出来不是因为没数据，是因为没有出口。
    #[test]
    fn request_metrics_emits_one_row_per_request_with_coordinates() {
        let events = [
            json!({"type":"request/context","seq":1,"time":1001,"data":{"provider":"p","model":"m","contextWindow":1000000}}),
            json!({"type":"request/header","seq":2,"time":1002,"data":{"header":{"config":{"model":"m"}}}}),
            json!({"type":"assistant/chunk","seq":3,"time":1003,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":1000,"outputTokens":200,"cacheReadTokens":300,"cacheWriteTokens":0}}}}),
            json!({"type":"assistant/chunk","seq":4,"time":1004,"data":{"turn":2,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":2000,"outputTokens":50,"cacheReadTokens":700,"cacheWriteTokens":0}}}}),
        ];
        let out = request_metrics(&events);
        let rows = out.as_array().unwrap();
        assert_eq!(rows.len(), 2, "两次请求两行");
        assert_eq!(rows[0]["request_seq"], json!(1));
        assert_eq!(rows[0]["turn"], json!(1));
        assert_eq!(rows[0]["step"], json!(1));
        assert_eq!(rows[0]["seq"], json!(3));
        assert_eq!(rows[0]["time"], json!(1003));
        assert_eq!(rows[0]["model"], json!("m"));
        assert_eq!(rows[0]["context_window"], json!(1000000), "分母来自 request/context");
        assert_eq!(rows[0]["context_tokens"], json!(1300), "1000 未命中 + 300 命中");
        assert_eq!(rows[1]["request_seq"], json!(2));
        assert_eq!(rows[1]["context_tokens"], json!(2700));
        // 分母只上报一次，对后续请求继续有效
        assert_eq!(rows[1]["context_window"], json!(1000000));
    }

    /// 缺字段落 `null`，不落 0；`context_tokens` 缺任一加数就整行留空。
    ///
    /// 实测依据：真实会话 687 个请求点里 13 个缺 `cacheReadTokens`。给这 13 点
    /// 用「只有未命中输入」凑一个偏低的占用，画出来的曲线会在这些点莫名塌陷，
    /// 比直接留缺口更有害——FR-04 规定的降级正由此触发。
    #[test]
    fn request_metrics_missing_field_is_null_not_zero() {
        let events = [
            json!({"type":"request/header","seq":1,"data":{"header":{"config":{"model":"m"}}}}),
            // 缺 cacheReadTokens
            json!({"type":"assistant/chunk","seq":2,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":1000,"outputTokens":200}}}}),
        ];
        let rows = request_metrics(&events);
        let row = &rows[0];
        assert_eq!(row["cache_read_tokens"], Value::Null, "宿主没报就是 null，不是 0");
        assert_eq!(row["cache_write_tokens"], Value::Null);
        assert_eq!(row["context_tokens"], Value::Null, "缺一个加数，整行留空而不是拿部分和硬凑");
        assert_eq!(row["uncached_input_tokens"], json!(1000), "在场的字段照常给值");
    }

    /// 无 request/context 时分母为 null——不拿任何默认窗口顶替。
    #[test]
    fn request_metrics_absent_context_window_is_null() {
        let events = [
            json!({"type":"request/header","seq":1,"data":{"header":{"config":{"model":"m"}}}}),
            json!({"type":"assistant/chunk","seq":2,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":10,"cacheReadTokens":5}}}}),
        ];
        let rows = request_metrics(&events);
        assert_eq!(rows[0]["context_window"], Value::Null, "没有分母就是没有，不臆造 128K");
        assert_eq!(rows[0]["context_tokens"], json!(15), "分子照常可算");
    }

    /// 不输出逐请求的 `compacted` 布尔列——压缩事件类型已确认（见 `compaction.rs`），
    /// 但它独立于请求，不该硬塞成每行一个 true/false；真正的压缩视图是
    /// `compaction_events()` 单独的输出。
    #[test]
    fn request_metrics_omits_per_request_compacted_field() {
        let events = [
            json!({"type":"request/header","seq":1,"data":{"header":{"config":{"model":"m"}}}}),
            json!({"type":"assistant/chunk","seq":2,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":1}}}}),
        ];
        let rows = request_metrics(&events);
        // 压缩视图独立存在于 compaction::compaction_events，不塞进逐请求的一列。
        assert!(rows[0].get("compacted").is_none(), "压缩是独立事件，不是逐请求布尔列");
    }

    /// 模型切换：每行归属当时活跃的模型，分母随 request/context 更新。
    #[test]
    fn request_metrics_attributes_model_per_request() {
        let events = [
            json!({"type":"request/context","seq":1,"data":{"contextWindow":1000000}}),
            json!({"type":"request/header","seq":2,"data":{"header":{"config":{"model":"pro"}}}}),
            json!({"type":"assistant/chunk","seq":3,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":10,"cacheReadTokens":1}}}}),
            json!({"type":"request/context","seq":4,"data":{"contextWindow":128000}}),
            json!({"type":"request/header","seq":5,"data":{"header":{"config":{"model":"flash"}}}}),
            json!({"type":"assistant/chunk","seq":6,"data":{"turn":2,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":20,"cacheReadTokens":2}}}}),
        ];
        let rows = request_metrics(&events);
        assert_eq!(rows[0]["model"], json!("pro"));
        assert_eq!(rows[0]["context_window"], json!(1000000));
        assert_eq!(rows[1]["model"], json!("flash"));
        assert_eq!(rows[1]["context_window"], json!(128000), "窗口随切换变化时必须跟着变");
    }

    /// 无 request/header 归 unknown 桶，与 token_by_model 一致，不臆造模型。
    #[test]
    fn request_metrics_no_header_is_unknown() {
        let events = [
            json!({"type":"assistant/chunk","seq":1,"data":{"turn":9,"step":9,"chunk":{"type":"usage","usage":{"inputTokens":7}}}}),
        ];
        let rows = request_metrics(&events);
        assert_eq!(rows[0]["model"], json!("unknown"));
    }

    /// **同源不变量**：逐请求四桶之和 == `token_by_model` 四桶之和。
    ///
    /// 这是 `request_metrics` 与 `token_by_model` 必须共用同一套去重语义的证明。
    /// 任何一边改了去重（比如把「后到者覆盖」改成「首个胜出」）都会让这条红。
    /// 真实会话 session-e4b0be69 上也对过：1398 个样本去重成 687 个请求点，
    /// 四桶之和 226,424,711 / 685,754 / 50,073,856 / 0 两侧完全一致。
    #[test]
    fn request_metrics_reconciles_with_token_by_model() {
        let events = [
            json!({"type":"request/header","seq":1,"data":{"header":{"config":{"model":"pro"}}}}),
            // 同 (1,1)：chunk 先到、message 后到 —— 只算后者
            json!({"type":"assistant/chunk","seq":2,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":1000,"outputTokens":200,"cacheReadTokens":300,"cacheWriteTokens":0}}}}),
            json!({"type":"assistant/message","seq":3,"data":{"turn":1,"step":1,"usage":{"inputTokens":1200,"outputTokens":250,"cacheReadTokens":300,"cacheWriteTokens":0}}}),
            json!({"type":"request/header","seq":4,"data":{"header":{"config":{"model":"flash"}}}}),
            json!({"type":"assistant/chunk","seq":5,"data":{"turn":2,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":500,"outputTokens":50,"cacheReadTokens":0,"cacheWriteTokens":0}}}}),
            json!({"type":"assistant/chunk","seq":6,"data":{"turn":3,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":700,"outputTokens":10,"cacheReadTokens":20,"cacheWriteTokens":0}}}}),
        ];
        let rows = request_metrics(&events);
        let rows = rows.as_array().unwrap();
        assert_eq!(rows.len(), 3, "4 个样本去重成 3 个请求点");

        let sum = |key: &str| -> i64 {
            rows.iter().map(|r| r[key].as_i64().unwrap_or(0)).sum()
        };
        let agg = token_by_model(&events);
        let agg_sum = |key: &str| -> i64 {
            agg["by_model"]
                .as_object()
                .unwrap()
                .values()
                .map(|m| m[key].as_i64().unwrap_or(0))
                .sum()
        };
        for key in ["uncached_input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens"] {
            assert_eq!(sum(key), agg_sum(key), "{key} 逐请求之和必须等于按模型之和");
        }
        assert_eq!(sum("uncached_input_tokens"), 2400, "1200(替换后) + 500 + 700");
    }

    /// Python `json.dumps(request_metrics(events), ensure_ascii=False,
    /// separators=(",", ":"))` 的逐字节对照——键序、null 位置、值全部一致。
    /// 期望串在 Python 侧生成后硬编码于此。**注意这条只钉 Rust**：它不跑
    /// Python，所以 Python 侧必须有 `tests/test_characterization.py::
    /// TestRequestMetrics::test_byte_for_byte_matches_rust` 钉同一个串，
    /// 两侧各钉一次才是真差分（只钉一侧的话另一侧单方面改动仍然全绿）。
    ///
    /// 第二行故意缺 `cacheReadTokens`：验证 `cache_read_tokens` 与
    /// `context_tokens` 双双落 `null` 而不是 0，且两侧对 null 的序列化一致。
    #[test]
    fn request_metrics_python_rust_byte_for_byte_parity() {
        let events = [
            json!({"type":"request/context","seq":1,"time":1001,"data":{"provider":"p","model":"m","contextWindow":1000000}}),
            json!({"type":"request/header","seq":2,"time":1002,"data":{"header":{"config":{"model":"m"}}}}),
            json!({"type":"assistant/chunk","seq":3,"time":1003,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":1000,"outputTokens":200,"cacheReadTokens":300}}}}),
            json!({"type":"assistant/chunk","seq":4,"time":1004,"data":{"turn":2,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":2000,"outputTokens":50}}}}),
        ];
        assert_eq!(
            serde_json::to_string(&request_metrics(&events)).unwrap(),
            r#"[{"request_seq":1,"seq":3,"time":1003,"turn":1,"step":1,"model":"m","context_window":1000000,"context_tokens":1300,"uncached_input_tokens":1000,"output_tokens":200,"cache_read_tokens":300,"cache_write_tokens":null,"is_peak":false},{"request_seq":2,"seq":4,"time":1004,"turn":2,"step":1,"model":"m","context_window":1000000,"context_tokens":null,"uncached_input_tokens":2000,"output_tokens":50,"cache_read_tokens":null,"cache_write_tokens":null,"is_peak":false}]"#
        );
    }

    // ── context_composition（FR-04a 常驻上下文构成）────────────────────────

    /// 三类都来自真实事件：system/tools 取自 request/header，catalog 取自
    /// data.source.kind == "skill-catalog"（不是专用事件类型）。
    #[test]
    fn context_composition_classifies_resident_prefix() {
        let events = [
            json!({"type":"request/header","seq":1,"data":{"header":{
                "config":{"model":"m"},
                "system":"You are an AI agent.",
                "tools":[{"name":"bash","description":"Run a shell command"}]
            }}}),
            json!({"type":"user/message","seq":2,"data":{"source":{
                "kind":"skill-catalog","form":"catalog",
                "entries":[{"name":"a","description":"skill a does things"},
                           {"name":"b","description":"skill b"}]
            }}}),
        ];
        let out = context_composition(&events);
        assert_eq!(out["system_tokens"], json!(crate::util::est_tokens("You are an AI agent.")));
        assert_eq!(out["catalog_entries"], json!(2));
        let expect_catalog = crate::util::est_tokens("askill a does things")
            + crate::util::est_tokens("bskill b");
        assert_eq!(out["catalog_tokens"], json!(expect_catalog));
        assert_eq!(
            out["catalog_names"],
            json!([
                {"name": "a", "tokens": crate::util::est_tokens("askill a does things")},
                {"name": "b", "tokens": crate::util::est_tokens("bskill b")},
            ]),
            "逐条拆分只带 name + tokens，不带 description 原文"
        );
        assert_eq!(out["estimator"], json!("est_tokens"));
        // 合计 = 三项之和
        let total = out["system_tokens"].as_i64().unwrap()
            + out["tools_tokens"].as_i64().unwrap()
            + out["catalog_tokens"].as_i64().unwrap();
        assert_eq!(out["resident_total"], json!(total));
    }

    /// Python `json.dumps(context_composition(events), ensure_ascii=False,
    /// separators=(",", ":"))` 的逐字节对照。两侧各钉一次才是真差分——见
    /// `request_metrics_python_rust_byte_for_byte_parity` 的同款说明。
    ///
    /// `tools_tokens` 特别容易分叉：它估的是**序列化后的 JSON 文本**，
    /// Python 必须用 `separators=(",", ":")`（紧凑，无空格）才能与 Rust 的
    /// `serde_json::to_string` 一致。默认的 `json.dumps` 会在 `, ` 和 `: ` 里
    /// 多出空格，字符数变多、估算值随之偏大——这条断言就是钉这个的。
    #[test]
    fn context_composition_python_rust_byte_for_byte_parity() {
        let events = [
            json!({"type":"request/header","seq":1,"data":{"header":{
                "config":{"model":"m"},
                "system":"You are an AI agent.",
                "tools":[{"name":"bash","description":"Run a shell command"}]
            }}}),
            json!({"type":"user/message","seq":2,"data":{"source":{
                "kind":"skill-catalog","form":"catalog",
                "entries":[{"name":"a","description":"skill a does things"},
                           {"name":"b","description":"skill b"}]
            }}}),
        ];
        assert_eq!(
            serde_json::to_string(&context_composition(&events)).unwrap(),
            r#"{"system_tokens":6,"tools_tokens":15,"catalog_tokens":8,"catalog_entries":2,"catalog_names":[{"name":"a","tokens":6},{"name":"b","tokens":2}],"resident_total":29,"estimator":"est_tokens"}"#
        );
    }

    /// 「最近一次发布覆盖前一次」：目录中途重发，当前状态是最后那次，
    /// 不是历次累加（累加会把同一批技能算两遍）。
    #[test]
    fn context_composition_catalog_last_publication_wins() {
        let events = [
            json!({"type":"user/message","seq":1,"data":{"source":{
                "kind":"skill-catalog","entries":[
                    {"name":"a","description":"x"},{"name":"b","description":"y"},
                    {"name":"c","description":"z"}]}}}),
            json!({"type":"agent/inbox/spliced","seq":2,"data":{"source":{
                "kind":"skill-catalog","entries":[{"name":"a","description":"x"}]}}}),
        ];
        let out = context_composition(&events);
        assert_eq!(out["catalog_entries"], json!(1), "取最后一次发布，不累加");
        assert_eq!(out["catalog_tokens"], json!(crate::util::est_tokens("ax")));
        assert_eq!(
            out["catalog_names"],
            json!([{"name": "a", "tokens": crate::util::est_tokens("ax")}]),
            "取最后一次发布，不累加"
        );
    }

    /// 源事件从未出现 → `null` 而不是 0。
    ///
    /// 「日志里没有 skill-catalog 事件」与「发布了一个空目录」是两回事：前者是
    /// 未知，后者是测到了 0。混成同一个 0，UI 就会写「0 个技能」——一个伪造的
    /// 测量值，与 `unreported_fields` 当初修的是同一类缺陷。
    #[test]
    fn context_composition_absent_source_is_null_not_zero() {
        let out = context_composition(&[]);
        assert_eq!(out["system_tokens"], Value::Null);
        assert_eq!(out["tools_tokens"], Value::Null);
        assert_eq!(out["catalog_tokens"], Value::Null);
        assert_eq!(out["catalog_entries"], Value::Null);
        assert_eq!(out["catalog_names"], Value::Null, "没见过 catalog 事件时是 null，不是空数组");
        assert_eq!(out["resident_total"], Value::Null, "三项全缺时不给 0 当合计");

        // 只有 header 没有 catalog：catalog 仍是 null，但合计按已知项给出
        let partial = [json!({"type":"request/header","seq":1,"data":{"header":{
            "system":"abc","tools":[]
        }}})];
        let out = context_composition(&partial);
        assert_eq!(out["catalog_tokens"], Value::Null);
        assert!(out["resident_total"].as_i64().is_some(), "有已知项就给合计");
    }

    /// T1 隐私决策：`catalog_names` 只出 `{name, tokens}`，description 原文绝不
    /// 出现在输出的任何位置——一旦进投影就会跟着走通用导出路径，FR-SK-09 要求
    /// 导出不含未脱敏内容。这里故意塞一个包含敏感词的 description，断言序列化
    /// 后的整个 JSON 字符串里都找不到它。
    #[test]
    fn context_composition_catalog_names_excludes_description_text() {
        let events = [json!({"type":"user/message","seq":1,"data":{"source":{
            "kind":"skill-catalog","entries":[
                {"name":"a","description":"contains SECRET_TOKEN_ABC123 in the text"}]}}})];
        let out = context_composition(&events);
        let serialized = serde_json::to_string(&out).unwrap();
        assert!(
            !serialized.contains("SECRET_TOKEN_ABC123"),
            "description 原文不得出现在 context_composition 的任何输出字段里"
        );
        assert_eq!(
            out["catalog_names"],
            json!([{"name": "a", "tokens": crate::util::est_tokens("acontains SECRET_TOKEN_ABC123 in the text")}])
        );
    }

    /// 模型切换会重发 request/header —— system/tools 取最近一次。
    #[test]
    fn context_composition_header_last_wins() {
        let events = [
            json!({"type":"request/header","seq":1,"data":{"header":{"system":"short","tools":[]}}}),
            json!({"type":"request/header","seq":2,"data":{"header":{
                "system":"a much longer system prompt than the first one","tools":[]}}}),
        ];
        let out = context_composition(&events);
        assert_eq!(
            out["system_tokens"],
            json!(crate::util::est_tokens("a much longer system prompt than the first one"))
        );
    }

    /// 高峰只在**周一至周五**的 9–12、14–18 点；周末全天空闲。
    ///
    /// 这条是真实账单打出来的回归：2026-08-23（周日）14:45 那次会话，29 次请求
    /// 的 token 数与 DeepSeek 账单逐位吻合，金额却正好 ×2.0000——因为原来的
    /// `is_peak` 只看小时不看星期，把周日下午判成了高峰，而每一档 peak 恰好是
    /// off_peak 的两倍。更隐蔽的是它**从来没被真实账单验证过**：在这之前唯一
    /// 对过账的会话跑在 21–22 点，全程走空闲分支，碰巧对上了。
    #[test]
    fn peak_requires_weekday_not_just_hour() {
        // 北京时间的确定性时间戳（见函数注释里的换算）。
        const FRI_10: i64 = 1787277600000; // 2026-08-21 周五 10:00
        const SAT_10: i64 = 1787364000000; // 2026-08-22 周六 10:00
        const SUN_14: i64 = 1787464800000; // 2026-08-23 周日 14:00
        const MON_15: i64 = 1787554800000; // 2026-08-24 周一 15:00
        const MON_20: i64 = 1787572800000; // 2026-08-24 周一 20:00

        // 星期换算本身先钉住（周一=0 … 周日=6）
        assert_eq!(beijing_weekday(FRI_10), 4);
        assert_eq!(beijing_weekday(SAT_10), 5);
        assert_eq!(beijing_weekday(SUN_14), 6);
        assert_eq!(beijing_weekday(MON_15), 0);

        assert!(is_peak_slot(FRI_10), "周五 10 点在高峰窗口内");
        assert!(is_peak_slot(MON_15), "周一 15 点在高峰窗口内");
        // **回归点**：同样是 10 点/14 点，周末必须是空闲。
        assert!(!is_peak_slot(SAT_10), "周六全天空闲，即使落在 9–12 内");
        assert!(!is_peak_slot(SUN_14), "周日全天空闲——真实账单打出来的那条");
        // 工作日但在窗口外，仍是空闲（上一次对账碰巧走的就是这条路）。
        assert!(!is_peak_slot(MON_20), "周一 20 点在窗口外");
    }

    /// 星期换算是**纯算术**，不是查表，也没有写死任何一个具体周末。
    ///
    /// Rust 侧没有日期库可以当参照，所以证明方式换成「滚动日历不变量」：从一个
    /// 已知锚点出发，往后每加一天星期就 +1 并按 7 取模，连续 200 年不许漂移。
    /// 闰年、世纪边界（2000 是闰年、2100 不是）全都跨过——算法根本不做日历
    /// 运算，只在绝对秒数上做整除，这些情况对它不存在。
    ///
    /// 与 Python 侧那条「逐日对照标准库 1970→2100」互补：那边证明绝对正确性，
    /// 这边证明无漂移；两者由 `test_cli_matrix.py` 的逐字节差分绑在一起。
    #[test]
    fn weekday_is_arithmetic_not_a_hardcoded_table() {
        const DAY_MS: i64 = 86_400_000;
        const MON_15: i64 = 1787554800000; // 锚点：2026-08-24 周一 15:00 北京
        assert_eq!(beijing_weekday(MON_15), 0, "锚点必须是周一");

        // 往后 200 年逐日推进，星期必须严格 +1 mod 7。
        for k in 0..(365 * 200) {
            let expected = k % 7;
            assert_eq!(
                beijing_weekday(MON_15 + k * DAY_MS),
                expected,
                "第 {k} 天星期漂移了——说明换算里混进了日历假设"
            );
        }
        // 往前也一样（负方向 + 1970 之前的负时间戳）。
        for k in 1..(365 * 60) {
            let expected = (((-k) % 7) + 7) % 7;
            assert_eq!(beijing_weekday(MON_15 - k * DAY_MS), expected, "倒推第 {k} 天错了");
        }
        // 同一天内任何时刻星期不变（含跨 UTC 日界的边缘）。
        for h in 0..24 {
            assert_eq!(beijing_weekday(MON_15 - 15 * 3_600_000 + h * 3_600_000), 0);
        }
    }

    /// 非 object 与畸形样本跳过；空输入给空数组（不是 null）。
    #[test]
    fn request_metrics_skips_malformed_and_returns_array() {
        let events = [
            json!("not-an-object"),
            json!({"type":"assistant/chunk","seq":1,"data":{"chunk":{"type":"usage","usage":{"inputTokens":7}}}}), // 缺 turn/step
        ];
        assert_eq!(request_metrics(&events), json!([]));
        assert_eq!(request_metrics(&[]), json!([]));
    }

    // ──────────────────────── hour_buckets ────────────────────────
    //
    // 与 Python 侧 TestHourBuckets 同款锁步（两边各钉一份；任一侧动了都会红）。
    // 北京时间戳对照表（周二 = 工作日分支）：
    //   06:30 = 早空闲, 9-12/14-18 之外
    //   09:30 = 早高峰, 14:30 = 下午高峰
    //   23:50 → 00:10 = 跨午夜(落到不同日期)
    //   14:30 周六 = 工作日 14 点是高峰,周六全天空闲

    /// 空输入 → 空桶数组 + 元信息(不臆造零桶,与 token_by_model 同条纪律)。
    #[test]
    fn hour_buckets_empty_returns_empty_array() {
        let out = hour_buckets(&[]);
        assert_eq!(out["buckets"], json!([]));
        assert_eq!(out["schema_version"], json!(1));
        assert_eq!(out["tz_name"], json!("Asia/Shanghai (UTC+8 fixed, no DST)"));
        assert_eq!(out["tz_offset_hours"], json!(8));
        assert_eq!(out["unreported_fields"], json!([]));
    }

    /// 单笔高峰样本：4 基础 + 4 peak_* 都该有数,is_peak=true。
    /// 2026-08-25(周二) 14:30 北京 = peak 时段。
    #[test]
    fn hour_buckets_peak_sample_populates_both() {
        let events = [
            json!({"type":"request/header","seq":1,"time":1787639400000i64,"data":{"header":{"config":{"model":"pro"}}}}),
            json!({"type":"assistant/chunk","seq":2,"time":1787639400000i64,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":1000,"outputTokens":200,"cacheReadTokens":300,"cacheWriteTokens":50}}}}),
        ];
        let out = hour_buckets(&events);
        let buckets = out["buckets"].as_array().unwrap();
        assert_eq!(buckets.len(), 1);
        let b = &buckets[0];
        assert_eq!(b["date"], json!("2026-08-25"));
        assert_eq!(b["hour"], json!(14));
        assert_eq!(b["is_peak"], json!(true));
        assert_eq!(b["uncached_input_tokens"], json!(1000));
        assert_eq!(b["output_tokens"], json!(200));
        assert_eq!(b["cache_read_tokens"], json!(300));
        assert_eq!(b["cache_write_tokens"], json!(50));
        assert_eq!(b["peak_uncached_input_tokens"], json!(1000));
        assert_eq!(b["peak_output_tokens"], json!(200));
        assert_eq!(b["peak_cache_read_tokens"], json!(300));
        assert_eq!(b["peak_cache_write_tokens"], json!(50));
    }

    /// 空闲样本：基础桶有数,peak_* 全 0,is_peak=false。
    #[test]
    fn hour_buckets_off_peak_keeps_peak_subbuckets_zero() {
        // 2026-08-25 06:30 北京 = 早空闲
        let events = [
            json!({"type":"request/header","seq":1,"time":1787610600000i64,"data":{"header":{"config":{"model":"pro"}}}}),
            json!({"type":"assistant/chunk","seq":2,"time":1787610600000i64,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":500,"outputTokens":100}}}}),
        ];
        let out = hour_buckets(&events);
        let b = &out["buckets"][0];
        assert_eq!(b["hour"], json!(6));
        assert_eq!(b["is_peak"], json!(false));
        assert_eq!(b["peak_uncached_input_tokens"], json!(0));
        assert_eq!(b["peak_output_tokens"], json!(0));
    }

    /// **周六下午 14 点也是空闲**——漏这条规则按真实账单对照会精确 ×2
    /// (2026-08-23 周日 14:45 那次会话语义缺陷源)。
    #[test]
    fn hour_buckets_weekend_peak_hour_is_off_peak() {
        // 2026-08-29(周六) 14:30 北京
        let events = [
            json!({"type":"request/header","seq":1,"time":1787985000000i64,"data":{"header":{"config":{"model":"pro"}}}}),
            json!({"type":"assistant/chunk","seq":2,"time":1787985000000i64,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":1000,"outputTokens":200}}}}),
        ];
        let out = hour_buckets(&events);
        let b = &out["buckets"][0];
        assert_eq!(b["date"], json!("2026-08-29"));
        assert_eq!(b["hour"], json!(14));
        assert_eq!(b["is_peak"], json!(false), "周六全天 = 空闲");
    }

    /// 跨午夜：23:50 → 00:10 各自归属日期。
    #[test]
    fn hour_buckets_cross_midnight_keeps_own_date() {
        let events = [
            json!({"type":"request/header","seq":1,"time":1787673000000i64,"data":{"header":{"config":{"model":"pro"}}}}),
            // 周二 23:50 北京
            json!({"type":"assistant/chunk","seq":2,"time":1787673000000i64,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":100,"outputTokens":10}}}}),
            // 周三 00:10 北京
            json!({"type":"assistant/chunk","seq":3,"time":1787674200000i64,"data":{"turn":2,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":200,"outputTokens":20}}}}),
        ];
        let out = hour_buckets(&events);
        let buckets = out["buckets"].as_array().unwrap();
        assert_eq!(buckets.len(), 2);
        assert_eq!(buckets[0]["date"], json!("2026-08-25"));
        assert_eq!(buckets[0]["hour"], json!(23));
        assert_eq!(buckets[0]["uncached_input_tokens"], json!(100));
        assert_eq!(buckets[1]["date"], json!("2026-08-26"));
        assert_eq!(buckets[1]["hour"], json!(0));
        assert_eq!(buckets[1]["uncached_input_tokens"], json!(200));
    }

    /// 同 (turn, step) 后到者覆盖：跨小时替换也要把旧贡献从原 hour 扣掉。
    #[test]
    fn hour_buckets_same_step_dedup_replaces() {
        let ts_14 = 1787639400000i64;  // 周二 14:30
        let ts_15 = ts_14 + 3600 * 1000; // +1h → 周二 15:30(高峰)
        let events = [
            json!({"type":"request/header","seq":1,"time":ts_14,"data":{"header":{"config":{"model":"pro"}}}}),
            // 14 点 chunk → 14 点桶 +1000
            json!({"type":"assistant/chunk","seq":2,"time":ts_14,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":1000,"outputTokens":100}}}}),
            // 15 点 message 覆盖 → 15 点桶 +1200, 14 点桶 -1000
            json!({"type":"assistant/message","seq":3,"time":ts_15,"data":{"turn":1,"step":1,"usage":{"inputTokens":1200,"outputTokens":120}}}),
        ];
        let out = hour_buckets(&events);
        let buckets = out["buckets"].as_array().unwrap();
        assert_eq!(buckets.len(), 2);
        let b14 = buckets.iter().find(|b| b["hour"] == json!(14)).unwrap();
        let b15 = buckets.iter().find(|b| b["hour"] == json!(15)).unwrap();
        assert_eq!(b14["uncached_input_tokens"], json!(0),
                   "chunk 的贡献被替换走");
        assert_eq!(b14["output_tokens"], json!(0));
        assert_eq!(b15["uncached_input_tokens"], json!(1200));
        assert_eq!(b15["output_tokens"], json!(120));
    }

    /// time 缺失 → (None, None) 桶,**不**混入任何 (date, hour) 桶。
    /// 避免下游 7 天合计把它算成 1970-01-01。
    #[test]
    fn hour_buckets_missing_time_is_unknown_bucket() {
        let events = [
            json!({"type":"request/header","seq":1,"time":1001,"data":{"header":{"config":{"model":"pro"}}}}),
            json!({"type":"assistant/chunk","seq":2,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":500,"outputTokens":50}}}}),
        ];
        let out = hour_buckets(&events);
        let buckets = out["buckets"].as_array().unwrap();
        assert_eq!(buckets.len(), 1);
        let b = &buckets[0];
        assert_eq!(b["date"], json!(null));
        assert_eq!(b["hour"], json!(null));
        assert_eq!(b["is_peak"], json!(null));
        assert_eq!(b["uncached_input_tokens"], json!(500));
    }

    /// **同源不变量**：所有 bucket 的 4 基础桶之和 == token_by_model 的 4 桶之和。
    /// 证明 hour_buckets 与 token_by_model 共用同 step 去重 / 折叠逻辑。
    #[test]
    fn hour_buckets_reconciles_with_token_by_model() {
        let events = [
            json!({"type":"request/header","seq":1,"time":1787639400000i64,"data":{"header":{"config":{"model":"pro"}}}}),
            // 同 (1,1) → 只算后到
            json!({"type":"assistant/chunk","seq":2,"time":1787639400000i64,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":1000,"outputTokens":200,"cacheReadTokens":300,"cacheWriteTokens":0}}}}),
            json!({"type":"assistant/message","seq":3,"time":1787639400001i64,"data":{"turn":1,"step":1,"usage":{"inputTokens":1200,"outputTokens":250,"cacheReadTokens":300,"cacheWriteTokens":0}}}),
            // 切到空闲时段
            json!({"type":"assistant/chunk","seq":4,"time":1787610600000i64,"data":{"turn":2,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":500,"outputTokens":50}}}}),
        ];
        let hb = hour_buckets(&events);
        let tm = token_by_model(&events);
        for (i, key) in ["uncached_input_tokens","output_tokens","cache_read_tokens","cache_write_tokens"].iter().enumerate() {
            let hour_total: i64 = hb["buckets"].as_array().unwrap().iter()
                .map(|b| b[key].as_i64().unwrap_or(0)).sum();
            let model_total: i64 = tm["by_model"].as_object().unwrap().values()
                .map(|m| m[key].as_i64().unwrap_or(0)).sum();
            assert_eq!(hour_total, model_total,
                "{key}: hour_buckets 之和 ({hour_total}) 必须等于 token_by_model 按模型聚合 ({model_total})");
            // 4 桶位与 4 SAMPLE_FIELDS 一致(0/1/2/3)
            let _ = i;
        }
    }
}

