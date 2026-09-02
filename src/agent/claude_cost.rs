//! Claude Code 会话账 fold —— 独立第三数据面（DSH month.json 之外的 Claude Code 成本）。
//!
//! 2026-09-02 用户决策 D1-D4 的落地：托盘的 Claude Code 分量 = **按模型族官方卡
//! 折算**（catalog 计价面在 core `cost.rs`，钱在读取时算——本模块只折 token 桶）。
//! 为什么独立数据面：DSH 的 month.json/today.json/alert.json/manifest 是 DSH 宿主
//! 语义（`tokenUsage` 4 桶、peak/off-peak、预算告警），Claude Code 的账单形状
//! 完全不同（cost-state camelCase modelUsage、行级 snake usage、模型名带 gateway
//! 前缀）——混进既有状态链会破坏它的不变量（month.json 只存当前月、merge_month
//! single write、alert 是 DSH 预算）。所以新面独立成 `claude-fold.json`（每会话
//! checkpoint）+ `claude-ledger.json`（逐日 by_model）+ `claude-ledger-archive.json`
//! （跨月滚动），全部由 `claude-sync` 一个写入者维护（镜像 oneline 的 owner
//! fencing：owner 不是 rust 就快速失败，--shadow 演练跳过）。
//!
//! ## 真值分层（2026-09-02 审阅裁决后的事实底座）
//!
//! **cost-state 是账单真值、行只给按天归属**，不是反过来：
//!
//! - `cost-state` 记录 = Claude Code 自报的**整段会话累计**账单（随压缩点/会话
//!   结束写入）。真机证据：ee969d0c 文件尾部两条 cost-state 的 modelUsage 逐
//!   字段相同（只有 totalDuration 变）——证明它是**累计快照**不是增量；同一文
//!   件里 claude-sonnet-5 的 625M cache read 在行里零可见（被压缩抹掉的行还在
//!   cost-state 里）。所以基线语义是 **replace 不是 add**：新 cost-state 到达时
//!   整块替换旧基线、清空旧基线之后的尾差（那些行已被新基线包含），否则两条
//!   同值 cost-state 会把整段会话计两遍——单测钉这条。
//! - **costUSD 永不当账单**（catalog `host_costusd_note`）：对未知模型按默认卡
//!   $5/$0.5/$25 计，deepseek 网关模型高估 20-70×。本面只取 modelUsage 的 token
//!   桶（camel → snake），钱留给读取时用 catalog 官方卡折算。
//! - cost-state 无日界 → 基线**按 startTime（会话起始 ms）归到北京日**（v1
//!   文档化近似：压缩抹掉的消费归会话起始日；真机上 4/5 会话 cost-state 就在
//!   文件尾、尾差为零，这个近似只在跨日压缩时把中间几天的账移到起始日——已知、
//!   有注释，不是编造）。startTime 缺失退到 cost-state 记录自己的 ts 日；两者
//!   都没有 → 记 `unattributed_rows` 哨兵（基线仍存 checkpoint，但重建时无日可
//!   归——摘要里如实报），**绝不**编造一个日。
//! - 无 cost-state 的会话（真机 136/141——没写过压缩点就说明没压缩过，行就是
//!   全量）= 纯行和，逐行按 ts 归日。
//!
//! ## 行读形状嗅探（审阅裁决 P0）
//!
//! 行级 `message.usage` 真机 100% 是 **API 全形 snake 键**（`input_tokens` /
//! `cache_read_input_tokens` / `cache_creation_input_tokens` / `output_tokens`；
//! 753e080a 尾部另见 6 行只少 inference_geo 等装饰键的 5 键子集——计数键相同）。
//! 短键（`input`/`cache_read`/`cache_creation`/`output`）是真机语料 0 命中的旧
//! 形状（CLAUDE_CODE_INTEGRATION §2.4）——**两态都认**（wide in：机器找、人
//! 分类，与 usage.rs 的 usage_shaped 同条纪律）。两态皆无 → 该行不进任何桶 +
//! `unreadable_usage_rows` 哨兵——绝不把认不出的 usage 当 0。cost-state 的
//! modelUsage 是 camelCase（`inputTokens` 等），单独一路转换。
//!
//! ## Checkpoint / ledger / 归档的写序（镜像 month.json 纪律）
//!
//! - `claude-fold.json`：`{"sessions": {session_id: {size, mtime_ns, baseline,
//!   baseline_day, tail_days, unattributed_rows, unreadable_usage_rows}}}`。
//!   `size`/`mtime_ns` 是**已折到哪**的指纹（同 r2a fingerprint 的只 seek 精神：
//!   尾读只解析新行）。**无时间戳字段**——mtime/size 就是状态，字节确定性由
//!   构造保证（同一批输入重跑零变化，idempotency 测试钉）。
//! - 每次 sync 按 (size, mtime_ns) 决定 skip / 尾读续折 / 整份重折替换（size
//!   变小 = 截断重写；size 相同而 mtime 变 = 原地重写。两者都整份重折、会话
//!   状态替换——重折会让归档里旧日残留，同「会话删除不清 ledger」裁决：按日
//!   键控无尸害，文档注明）。
//! - 折完所有会话 → **从 checkpoint 全量重建** ledger（不是增量累加——重建
//!   天然幂等，崩溃重跑不会双计；增量累加才是 2026-08 三倍计数事故的温床）。
//!   逐日 by_model 桶里多会话同日相加；当前北京月的日子落 `claude-ledger.json`
//!   （**每次 sync 都写**，哪怕空 days——不清空的话跨月后旧文件停在盘上被误读
//!   成"本月"，这是 alert.json month-stale 事故的同类），更早的日子滚动进
//!   `claude-ledger-archive.json`（形状与语义复刻 month-archive：`{"months":
//!   {"YYYY-MM": {"days": {...}}}}` 逐日替换、幂等——归档只有跨月边界才写，所以
//!   `archived_at` 与 month-archive 同款会带 now 时间戳，差分测试对 ISO 打码）。
//!
//! 与 Python `scripts/agent_vitals/agent/claude_cost.py` 逐字节镜像，由
//! `tests/test_claude_cost.py` 的 `both()` 差分看守（同一批 fixture 会话文件 →
//! 两侧 fold.json/ledger/archive/stdout 字节一致）。

use std::collections::BTreeMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use serde_json::{json, Map, Value};

use crate::agent::codex_cost::{civil_from_unix_secs, current_month_beijing};
use crate::agent::claude_session::claude_project_files;
use crate::agent::state::{atomic_write_json, now_iso_utc, read_json, state_dir};
use crate::agent::takeover::require_rust_owner;

/// 行级 usage 的 4 个计数键（API 全形，真机 100%；写入桶的固定键序）。
const SNAKE_KEYS: [&str; 4] = [
    "input_tokens",
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
    "output_tokens",
];
/// 行级 usage 的短键旧形状（§2.4 勘误后：真机 0 命中，仍认——旧客户端语料）。
/// 顺序与 SNAKE_KEYS 一一对应。
const SHORT_KEYS: [&str; 4] = ["input", "cache_read", "cache_creation", "output"];
/// cost-state modelUsage 的 camel 键，同样一一对应。
const CAMEL_KEYS: [&str; 4] = [
    "inputTokens",
    "cacheReadInputTokens",
    "cacheCreationInputTokens",
    "outputTokens",
];

fn fold_path() -> std::path::PathBuf {
    state_dir().join("claude-fold.json")
}

fn ledger_path() -> std::path::PathBuf {
    state_dir().join("claude-ledger.json")
}

fn ledger_archive_path() -> std::path::PathBuf {
    state_dir().join("claude-ledger-archive.json")
}

/// ledger flat 日（`{model: 4 型 snake}`，rebuild_days 产出）→ 4 型 token 总量。
/// r2a_store 的 claude 宿主行「今日 token」走这里；SNAKE_KEYS 只此一处定义，
/// 别在 r2a 再抄一份键清单（usage_sample 同款「键集合唯一真源」纪律）。非对象
/// 值（坏日）→ 0；但「读出 0」只发生在坏数据上，空日不落 ledger。
pub fn ledger_day_total_tokens(day: &Value) -> i64 {
    let mut total = 0i64;
    if let Some(models) = day.as_object() {
        for tokens in models.values() {
            for k in SNAKE_KEYS {
                total += tokens.get(k).and_then(Value::as_i64).unwrap_or(0);
            }
        }
    }
    total
}

/// 读 ledger 当日（day_key = 北京日）的 4 型 token 总量 → r2a `sessions
/// navigation` 的 claude 宿主行「今日 token」（spec §5.2 basis=ledger）。
///
/// 三种 None：ledger 不存在 / 无 `days` 键 / 当日缺席——都诚实报 None（托盘显
/// null/—，不编 0）。「空日不落 ledger」：days 里的日子全是 fold 真测到的桶
/// （cost-state 基线日 + 行尾归属日），当日缺席 = 今天没测到账，与 codex 当日
/// 桶缺席同语义。当日存在但总和 0（只有全零 unknown 桶的病理日）→ Some(0)，
/// 「测到 0」不是「没测」。
pub fn claude_ledger_day_tokens(day_key: &str) -> Option<i64> {
    let ledger = read_json(&ledger_path())?;
    let day = ledger.get("days")?.as_object()?.get(day_key)?;
    Some(ledger_day_total_tokens(day))
}

/// "YYYY-MM-DD" → "YYYY-MM"（前 7 字符）。
fn month_key_of(date: &str) -> String {
    date.chars().take(7).collect()
}

/// ISO 时间戳（`YYYY-MM-DDTHH:MM:SS[.fff]Z`）→ **北京日** "YYYY-MM-DD"。
///
/// 为什么从字符串直接算而不经 epoch：真机 100% 定宽 Z 格式（753e080a 尾部
/// 5847 个样本全同形），日线只需日期 + 小时两截——北京 = UTC+8，UTC 时刻
/// 小时 ≥ 16 就跨到次日。经 epoch 转换反而要先解析小数秒（位数不定）再走
/// civil 表，两侧各多几十行还更容易漂。非 Z 后缀 / 非 ASCII / 超界数字 →
/// None（哨兵，绝不猜时区——带 `+05:00` 的旧格式若存在，按 UTC 算会把日线
/// 算错）。
pub(crate) fn day_from_iso_ts(ts: &str) -> Option<String> {
    let b = ts.as_bytes();
    if !ts.is_ascii()
        || b.len() < 20
        || b.get(10) != Some(&b'T')
        || b.last() != Some(&b'Z')
    {
        return None;
    }
    let y: i64 = ts[0..4].parse().ok()?;
    let mo: u32 = ts[5..7].parse().ok()?;
    let d: u32 = ts[8..10].parse().ok()?;
    let hh: u32 = ts[11..13].parse().ok()?;
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) || hh > 23 {
        return None;
    }
    let (y, mo, d) = if hh >= 16 { add_day(y, mo, d) } else { (y, mo, d) };
    Some(format!("{y:04}-{mo:02}-{d:02}"))
}

/// 公历日 +1（月末/年末/闰年走同一张表）。真机语料无闰日样本——测试钉
/// 2028-02-29 / 2026-12-31 / 普通月末四条边。
fn add_day(y: i64, mo: u32, d: u32) -> (i64, u32, u32) {
    let dim = match mo {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 {
                29
            } else {
                28
            }
        }
        _ => 31,
    };
    if d < dim {
        (y, mo, d + 1)
    } else if mo == 12 {
        (y + 1, 1, 1)
    } else {
        (y, mo + 1, 1)
    }
}

/// epoch 毫秒 → 北京日。cost-state 的 `startTime`（会话起始，ms）走这条。
pub(crate) fn day_from_ms(ms: i64) -> String {
    let (y, mo, d) = civil_from_unix_secs(ms.div_euclid(1000), 8 * 3600);
    format!("{y:04}-{mo:02}-{d:02}")
}

/// 从 usage 对象嗅 4 桶 token。两态都认、全形优先；键在而值不是数 → 该形
/// 状不算命中（corpus 值全 int）。两态皆无 → None → 哨兵计数（P0）。
fn row_tokens(usage: &Value) -> Option<[u64; 4]> {
    let obj = usage.as_object()?;
    for keys in [&SNAKE_KEYS[..], &SHORT_KEYS[..]] {
        let mut out = [0u64; 4];
        let mut ok = true;
        for (i, k) in keys.iter().enumerate() {
            match obj.get(*k).and_then(Value::as_u64) {
                Some(v) => out[i] = v,
                None => {
                    ok = false;
                    break;
                }
            }
        }
        if ok {
            return Some(out);
        }
    }
    None
}

/// 从 cost-state modelUsage 的**单个模型条目**（camelCase）读 4 桶。
/// 键不全（真机没见过——客户端漂移）→ None → 哨兵。
fn camel_entry_tokens(entry: &Value) -> Option<[u64; 4]> {
    let obj = entry.as_object()?;
    let mut out = [0u64; 4];
    for (i, k) in CAMEL_KEYS.iter().enumerate() {
        out[i] = obj.get(*k).and_then(Value::as_u64)?;
    }
    Some(out)
}

fn inc(sess: &mut Map<String, Value>, key: &str) {
    let cur = sess.get(key).and_then(Value::as_u64).unwrap_or(0);
    sess.insert(key.to_string(), json!(cur + 1));
}

/// 4 桶加到 `obj`（4 个 snake 键的桶对象，如 tail_days[day][model]）里。
fn bump_obj(obj: &mut Value, t: [u64; 4]) {
    let m = obj.as_object_mut().expect("bucket target is object");
    for (i, k) in SNAKE_KEYS.iter().enumerate() {
        let cur = m.get(*k).and_then(Value::as_u64).unwrap_or(0);
        m.insert((*k).to_string(), json!(cur + t[i]));
    }
}

/// 一条记录 → 会话状态转换（assistant 行入尾差、cost-state 换基线）。
/// 纯函数：`sess` 是 claude-fold.json 里 `sessions[sid]` 的可变引用。
fn apply_record(sess: &mut Map<String, Value>, rec: &Value) {
    // tail_days 是 assistant 行的落点；fresh 会话第一个 assistant 行进来时
    // 还没有这个键（cost-state 才会显式 reset 成 {}）——懒建，别 expect。
    if !sess.contains_key("tail_days") {
        sess.insert("tail_days".to_string(), json!({}));
    }
    match rec.get("type").and_then(Value::as_str) {
        Some("cost-state") => {
            // 基线替换：modelUsage 是整段会话的累计自报（真机两条同值
            // cost-state 逐字段相同证明）。换基线、清尾差——**不叠加**；
            // 「两条同值 cost-state + 中间有 usage 行」→ 中间行已被新基线
            // 包含，清掉正好不双计（单测钉）。
            let usage = rec.get("modelUsage");
            let mut baseline = Map::new();
            match usage.and_then(Value::as_object) {
                Some(models) => {
                    for (model, entry) in models {
                        match camel_entry_tokens(entry) {
                            Some(t) => {
                                let mut b = Map::new();
                                for (i, k) in SNAKE_KEYS.iter().enumerate() {
                                    b.insert((*k).to_string(), json!(t[i]));
                                }
                                baseline.insert(model.clone(), Value::Object(b));
                            }
                            None => inc(sess, "unreadable_usage_rows"),
                        }
                    }
                }
                None => inc(sess, "unreadable_usage_rows"),
            }
            sess.insert("baseline".to_string(), Value::Object(baseline));
            // 基线日 = startTime（会话起始 ms → 北京日）；缺 startTime 退到
            // 本条记录自己的 ts 日（v1 文档化近似，模块头注释）。都没有 →
            // unattributed 哨兵（基线仍存 checkpoint，重建时无日可归）。
            let day = rec
                .get("startTime")
                .and_then(Value::as_i64)
                .map(day_from_ms)
                .or_else(|| {
                    rec.get("timestamp")
                        .and_then(Value::as_str)
                        .and_then(day_from_iso_ts)
                });
            match day {
                Some(d) => {
                    sess.insert("baseline_day".to_string(), json!(d));
                }
                None => {
                    inc(sess, "unattributed_rows");
                    sess.insert("baseline_day".to_string(), Value::Null);
                }
            }
            sess.insert("tail_days".to_string(), json!({}));
        }
        Some("assistant") => {
            let Some(msg) = rec.get("message").and_then(Value::as_object) else {
                return;
            };
            let usage = msg.get("usage");
            let has_usage = usage
                .and_then(Value::as_object)
                .is_some_and(|o| !o.is_empty());
            if !has_usage {
                return; // 无 usage 的 assistant 行不是 usage 行
            }
            let Some(model) = msg.get("model").and_then(Value::as_str) else {
                // 有 usage 但没 model → 无处可挂 → 哨兵，绝不编一个模型名。
                inc(sess, "unreadable_usage_rows");
                return;
            };
            let Some(t) = row_tokens(usage.expect("checked above")) else {
                inc(sess, "unreadable_usage_rows"); // 两态皆无 → 哨兵（P0）
                return;
            };
            let day = rec
                .get("timestamp")
                .and_then(Value::as_str)
                .and_then(day_from_iso_ts);
            match day {
                Some(d) => {
                    let tail = sess
                        .get_mut("tail_days")
                        .and_then(Value::as_object_mut)
                        .expect("tail_days ensured above");
                    let day_obj = tail.entry(d).or_insert_with(|| json!({}));
                    let model_obj = day_obj
                        .as_object_mut()
                        .expect("day entry is object")
                        .entry(model.to_string())
                        .or_insert_with(|| json!({}));
                    bump_obj(model_obj, t);
                }
                // 行有 usage 但 ts 不可解析 → 日线无处可挂 → 哨兵，不猜日。
                None => inc(sess, "unattributed_rows"),
            }
        }
        _ => {}
    }
}

/// 把 `{model: {4 snake}}` 桶并进一个**已铺平到 model 层**的日对象
/// （多会话同日相加——逐会话 replacement 会丢别的会话，ledger 必须全量
/// 重建，这就是不增量累加的原因）。
fn merge_models_into_day(day: &mut Value, buckets: &Value) {
    let Some(by_model) = buckets.as_object() else {
        return;
    };
    let day_obj = day.as_object_mut().expect("day is object");
    for (model, t4) in by_model {
        let Some(obj) = t4.as_object() else {
            continue;
        };
        let mut arr = [0u64; 4];
        let mut any = false;
        for (i, k) in SNAKE_KEYS.iter().enumerate() {
            if let Some(v) = obj.get(*k).and_then(Value::as_u64) {
                arr[i] = v;
                any = true;
            }
        }
        if !any {
            continue;
        }
        let model_obj = day_obj.entry(model.clone()).or_insert_with(|| json!({}));
        bump_obj(model_obj, arr);
    }
}

#[derive(PartialEq, Debug, Clone, Copy)]
enum FoldKind {
    /// 新文件 / 整份重折（size 变小或 size 相同而 mtime 变）→ 状态替换。
    New,
    /// checkpoint 之后有增量 → 从 checkpoint.size 续读。
    Resume,
    /// size/mtime 都没变 → 不动。
    Skip,
}

fn stat_file(path: &Path) -> Option<(u64, u64)> {
    let md = std::fs::metadata(path).ok()?;
    let mtime = md
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    Some((md.len(), mtime))
}

/// 从字节偏移 `from` 读完整行，逐行解析。返回 (记录, 新偏移)。
/// 末行无换行符 → 不消费（客户端可能正写到一半，下个 sync 补上）。
/// 完整行 JSON 解析失败 → Err（整份 abort、checkpoint 不动，下次 sync 重试
/// ——与 claude_session 的「一条坏行毁整份」同款，绝不拼半截）。
fn read_suffix(path: &Path, from: u64) -> Result<(Vec<Value>, u64), String> {
    let mut f = std::fs::File::open(path)
        .map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    f.seek(SeekFrom::Start(from))
        .map_err(|e| format!("cannot seek {}: {e}", path.display()))?;
    let mut bytes = Vec::new();
    f.read_to_end(&mut bytes)
        .map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    let mut out = Vec::new();
    let mut pos = from;
    let mut start = 0usize;
    for (i, b) in bytes.iter().enumerate() {
        if *b == b'\n' {
            let mut line = &bytes[start..i];
            if line.ends_with(b"\r") {
                line = &line[..line.len() - 1];
            }
            if !line.is_empty() {
                let text = String::from_utf8_lossy(line);
                let v: Value = serde_json::from_str(&text).map_err(|e| {
                    format!(
                        "non-json line in {} at byte offset {}: {e}",
                        path.display(),
                        from + start as u64
                    )
                })?;
                out.push(v);
            }
            pos = from + (i + 1) as u64;
            start = i + 1;
        }
    }
    Ok((out, pos))
}

/// 一个会话文件折进 `sessions`。返回折叠类别（New 含整份重折替换）。
fn fold_one(
    sessions: &mut Map<String, Value>,
    path: &Path,
    size: u64,
    mtime: u64,
) -> Result<FoldKind, String> {
    let sid = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();
    let (from, kind) = match sessions.get(&sid) {
        None => (0, FoldKind::New),
        Some(existing) => {
            let csize = existing.get("size").and_then(Value::as_u64).unwrap_or(0);
            let cmtime = existing.get("mtime_ns").and_then(Value::as_u64).unwrap_or(0);
            if size == csize && mtime == cmtime {
                return Ok(FoldKind::Skip);
            }
            if size <= csize {
                (0, FoldKind::New) // 截断重写 / 原地重写 → 整份重折替换
            } else {
                (csize, FoldKind::Resume)
            }
        }
    };
    let (records, new_pos) = read_suffix(path, from)?;
    let mut sess = if kind == FoldKind::New {
        Map::new()
    } else {
        sessions
            .get(&sid)
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default()
    };
    for rec in &records {
        apply_record(&mut sess, rec);
    }
    sess.insert("size".to_string(), json!(new_pos));
    sess.insert("mtime_ns".to_string(), json!(mtime));
    sessions.insert(sid, Value::Object(sess));
    Ok(kind)
}

/// 从会话状态全量重建逐日桶。返回 (当前月 ledger days, 要滚进归档的 days)。
fn rebuild_days(sessions: &Value, current: &str) -> (Map<String, Value>, Map<String, Value>) {
    let mut all: BTreeMap<String, Value> = BTreeMap::new();
    let Some(sessions_map) = sessions.as_object() else {
        return (Map::new(), Map::new());
    };
    for sess in sessions_map.values() {
        let Some(obj) = sess.as_object() else {
            continue;
        };
        // 基线 → baseline_day；tail_days → 各自的日子。同一个日会被多会话
        // 贡献 → 先全量并进 all，再统一分月。
        if let Some(day) = obj.get("baseline_day").and_then(Value::as_str) {
            if let Some(b) = obj.get("baseline") {
                let entry = all.entry(day.to_string()).or_insert_with(|| json!({}));
                merge_models_into_day(entry, b);
            }
        }
        if let Some(tail) = obj.get("tail_days").and_then(Value::as_object) {
            for (day, buckets) in tail {
                let entry = all.entry(day.clone()).or_insert_with(|| json!({}));
                merge_models_into_day(entry, buckets);
            }
        }
    }
    // 分月：当前月 → ledger；更早的日子 → 归档（写侧逐日替换幂等）。
    let mut ledger = Map::new();
    let mut archive = Map::new();
    for (day, merged) in all {
        if month_key_of(&day) == current {
            ledger.insert(day, merged);
        } else {
            archive.insert(day, merged);
        }
    }
    (ledger, archive)
}

/// `agent-vitals claude-sync` 主入口：发现变化会话 → 尾读折入 checkpoint →
/// 剥掉归档里每个月的 archived_at（写入时刻的元数据，不参与内容比较）。
/// 见 claude_sync 的归档写条件——比较必须剥它，否则候选永远≠现状。
fn strip_archive_ts(value: &Value) -> Value {
    let mut out = value.clone();
    if let Some(months) = out.get_mut("months").and_then(Value::as_object_mut) {
        for entry in months.values_mut() {
            if let Some(o) = entry.as_object_mut() {
                o.remove("archived_at");
            }
        }
    }
    out
}

/// 重建 ledger + 归档 → 打印确定性摘要。owner fencing 同 oneline
/// （require_rust_owner，--shadow 跳过）。单文件坏行只计 failed、不 abort
/// 整轮（下轮重试），exit 0——fencing/审计失败才 Err。
pub fn claude_sync(home: &Path, shadow: bool) -> Result<(), String> {
    require_rust_owner(shadow)?;
    let files = claude_project_files(home);
    let fp = fold_path();
    let mut folds = read_json(&fp).unwrap_or_else(|| json!({"sessions": {}}));
    let sessions = match folds.get_mut("sessions") {
        Some(Value::Object(m)) => m,
        _ => {
            folds["sessions"] = json!({});
            folds
                .get_mut("sessions")
                .and_then(Value::as_object_mut)
                .expect("just inserted")
        }
    };
    let mut scanned = 0u64;
    let mut fresh = 0u64;
    let mut resumed = 0u64;
    let mut skipped = 0u64;
    let mut failed = 0u64;
    for path in &files {
        scanned += 1;
        let Some((size, mtime)) = stat_file(path) else {
            continue; // 枚举与 stat 之间文件消失 → 不计（下轮不再有它）
        };
        match fold_one(sessions, path, size, mtime) {
            Ok(FoldKind::New) => fresh += 1,
            Ok(FoldKind::Resume) => resumed += 1,
            Ok(FoldKind::Skip) => skipped += 1,
            Err(_) => failed += 1,
        }
    }
    // 摘要统计（最终态）：基线会话数 / 纯行和会话数 / 两个哨兵计数。
    let mut with_baseline = 0u64;
    let mut row_sum_only = 0u64;
    let mut unreadable = 0u64;
    let mut unattributed = 0u64;
    for sess in sessions.values() {
        let Some(o) = sess.as_object() else {
            continue;
        };
        if o.contains_key("baseline") {
            with_baseline += 1;
        } else {
            row_sum_only += 1;
        }
        unreadable += o.get("unreadable_usage_rows").and_then(Value::as_u64).unwrap_or(0);
        unattributed += o.get("unattributed_rows").and_then(Value::as_u64).unwrap_or(0);
    }
    atomic_write_json(&fp, &folds);
    // 全量重建 ledger + 归档（幂等；崩溃重跑不会双计）。rebuild_days 吃的是
    // sessions 映射（sid → 会话状态），不是 {"sessions": …} 外壳——两层结构刚
    // 写出时混过一次：把外壳喂进去，整本折叠空账，ledger 恒为空还不报错
    // （Python smoke 抓到；两侧一行同型，一起修）。
    let now = now_iso_utc();
    let current = current_month_beijing();
    let sessions_v = folds.get("sessions").cloned().unwrap_or_else(|| json!({}));
    let (ledger_days, archive_days) = rebuild_days(&sessions_v, &current);
    // 归档只在**日桶内容**变化时落盘：add_days_to_archive 每调用都会给当月
    // 盖一个新 archived_at，若每轮无条件写，零变化的幂等重跑也会改写整个
    // 文件（真机冻结语料复跑抓到：fold/ledger 字节不变、archive 每轮都变）。
    // archived_at 记录的是「真正归档那次」的时刻，不是「本轮核对过」。
    if !archive_days.is_empty() {
        let existing = read_json(&ledger_archive_path()).unwrap_or_else(|| json!({}));
        let candidate = agent_vitals_core::state::add_days_to_archive(
            &existing, &json!(archive_days), &now);
        if strip_archive_ts(&candidate) != strip_archive_ts(&existing) {
            atomic_write_json(&ledger_archive_path(), &candidate);
        }
    }
    atomic_write_json(&ledger_path(), &json!({ "days": ledger_days }));
    println!(
        "claude-sync: scanned {scanned} files; folded {} (new {fresh}, resumed {resumed}); skipped {skipped}; failed {failed}",
        fresh + resumed
    );
    println!(
        "claude-sync: cost-state baselines: {with_baseline} sessions; row-sum only: {row_sum_only}"
    );
    println!(
        "claude-sync: ledger days: {}; unreadable usage rows: {unreadable}; unattributed rows: {unattributed}",
        ledger_days.len()
    );
    Ok(())
}

// ────────────────────────── 纯函数单测 ──────────────────────────
// 与 `tests/test_claude_cost.py` 钉同一组数值，docstring 互相指认；
// claude-sync 端到端差分由该文件的 `both()` 看守。改数字 = 两边一起改。

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn day_from_iso_ts_beijing_dayline() {
        // Python 同组 fixture。小时 ≥ 16（UTC）跨到次日；< 16 同日。
        assert_eq!(day_from_iso_ts("2026-08-30T10:16:26.965Z"), Some("2026-08-30".into()));
        assert_eq!(day_from_iso_ts("2026-08-30T20:16:26.965Z"), Some("2026-08-31".into()));
        assert_eq!(day_from_iso_ts("2026-08-30T16:00:00Z"), Some("2026-08-31".into()));
        assert_eq!(day_from_iso_ts("2026-08-30T15:59:59Z"), Some("2026-08-30".into()));
        // 无小数秒 / 无秒的定宽格式也认（date + hour 两截就够）。
        assert_eq!(day_from_iso_ts("2026-08-30T20:16:00Z"), Some("2026-08-31".into()));
    }

    #[test]
    fn day_from_iso_ts_calendar_edges() {
        // Python 同组 fixture：月尾 / 年末 / 闰日三条边。
        assert_eq!(day_from_iso_ts("2026-08-31T18:00:00Z"), Some("2026-09-01".into()));
        assert_eq!(day_from_iso_ts("2026-12-31T17:00:00Z"), Some("2027-01-01".into()));
        assert_eq!(day_from_iso_ts("2026-12-31T15:00:00Z"), Some("2026-12-31".into()));
        assert_eq!(day_from_iso_ts("2028-02-29T17:00:00Z"), Some("2028-03-01".into())); // 闰年
        assert_eq!(day_from_iso_ts("2026-02-28T17:00:00Z"), Some("2026-03-01".into())); // 平年
        assert_eq!(day_from_iso_ts("2026-02-28T15:00:00Z"), Some("2026-02-28".into()));
    }

    #[test]
    fn day_from_iso_ts_rejects_non_z_and_garbage() {
        // Python 同组 fixture：非 Z 后缀/超界/坏格式 → None（哨兵，不猜时区）。
        assert_eq!(day_from_iso_ts("2026-08-30T10:16:26.965+00:00"), None);
        assert_eq!(day_from_iso_ts("2026-13-01T10:00:00Z"), None);
        assert_eq!(day_from_iso_ts("2026-08-32T10:00:00Z"), None);
        assert_eq!(day_from_iso_ts("2026-08-30T24:00:00Z"), None);
        assert_eq!(day_from_iso_ts("2026-08-30T10:00:00"), None);
        assert_eq!(day_from_iso_ts("not-a-timestamp"), None);
        assert_eq!(day_from_iso_ts(""), None);
    }

    #[test]
    fn day_from_ms_beijing() {
        // Python 同组 fixture（epoch ms 与日期核对，数值用真值：
        // 1788084986000 ms = 2026-08-30T10:16:26Z → 北京 08-30 18:16）。
        assert_eq!(day_from_ms(1_788_084_986_000), "2026-08-30");
        // 1788112800000 ms = 2026-08-30T18:00:00Z → 北京 08-31 02:00。
        assert_eq!(day_from_ms(1_788_112_800_000), "2026-08-31");
        // 1970-01-01T00:00:00Z → 北京 1970-01-01（epoch 原点偏移非负断言）。
        assert_eq!(day_from_ms(0), "1970-01-01");
    }

    #[test]
    fn row_tokens_accepts_both_shapes_and_sentinels() {
        // Python 同组 fixture（P0 两态嗅探）：全形优先、短键兜底、两态皆无 →
        // None → 哨兵。键在而值不是数 → 该形状不算命中。
        let full = json!({"input_tokens": 100, "cache_read_input_tokens": 200,
                          "cache_creation_input_tokens": 300, "output_tokens": 400,
                          "inference_geo": "xx", "iterations": 1});
        assert_eq!(row_tokens(&full), Some([100, 200, 300, 400]));
        // 真机 753e080a 尾部 6 行的 5 键子集：装饰键缺席、计数键齐全。
        let subset = json!({"input_tokens": 5, "cache_read_input_tokens": 6,
                            "cache_creation_input_tokens": 7, "output_tokens": 8,
                            "service_tier": "low"});
        assert_eq!(row_tokens(&subset), Some([5, 6, 7, 8]));
        // 短键旧形状（真机 0 命中，仍认）。
        let short = json!({"input": 10, "cache_read": 20, "cache_creation": 30,
                           "output": 40});
        assert_eq!(row_tokens(&short), Some([10, 20, 30, 40]));
        // 两态皆无 → 哨兵（P0：绝不把认不出的 usage 当 0）。
        assert_eq!(row_tokens(&json!({"prompt_tokens": 1})), None);
        // 键在而值不是数 → 全形不算命中、短键也够不着 → None。
        assert_eq!(row_tokens(&json!({"input_tokens": 1, "cache_read_input_tokens": 2,
                                      "cache_creation_input_tokens": 3,
                                      "output_tokens": "oops"})), None);
        assert_eq!(row_tokens(&json!({})), None);
    }

    #[test]
    fn camel_entry_tokens_converts_cost_state() {
        // Python 同组 fixture：cost-state modelUsage 的 camel 条目 → snake 4 桶。
        let entry = json!({"inputTokens": 12646741, "outputTokens": 6111069,
                           "cacheReadInputTokens": 731886848,
                           "cacheCreationInputTokens": 0,
                           "webSearchRequests": 3, "costUSD": 581.98});
        assert_eq!(camel_entry_tokens(&entry), Some([12_646_741, 731_886_848, 0, 6_111_069]));
        // 键不全（客户端漂移）→ None → 哨兵。
        assert_eq!(camel_entry_tokens(&json!({"inputTokens": 1})), None);
    }

    #[test]
    fn baseline_replace_does_not_double_count() {
        // 审阅裁决钉测：两条同值 cost-state + 中间有 usage 行 → 取最后一条为
        // 基线、中间行被基线包含不清零、不双计。Python 同名测试同 fixture。
        let cs = |start: i64| json!({
            "type": "cost-state",
            "timestamp": "2026-08-30T18:00:00.000Z",
            "startTime": start,
            "modelUsage": {
                "deepseek-v4-flash": {"inputTokens": 1000, "outputTokens": 100,
                                      "cacheReadInputTokens": 0,
                                      "cacheCreationInputTokens": 0,
                                      "webSearchRequests": 0, "costUSD": 0.1}
            },
            "hasUnknownModelCost": true,
        });
        let row = json!({
            "type": "assistant",
            "timestamp": "2026-08-30T19:00:00.000Z",
            "message": {"model": "deepseek-v4-flash", "usage": {
                "input_tokens": 10, "cache_read_input_tokens": 0,
                "cache_creation_input_tokens": 0, "output_tokens": 1}},
        });
        let mut sess = Map::new();
        for rec in [&cs(1_788_084_986_000), &row, &cs(1_788_084_986_000)] {
            apply_record(&mut sess, rec);
        }
        // 尾差被清空（中间行已被基线包含）→ baseline 只有一条 1000/100。
        assert_eq!(
            sess.get("baseline")
                .unwrap()
                .get("deepseek-v4-flash")
                .unwrap()
                .get("input_tokens"),
            Some(&json!(1000))
        );
        assert_eq!(
            sess.get("tail_days").unwrap().as_object().unwrap().len(),
            0,
            "两条同值 cost-state 之间的 usage 行不得残留进尾差"
        );
        assert_eq!(sess.get("baseline_day").unwrap(), &json!("2026-08-30"));
        // 替换后整段会话只计一次：基线 1000 in，无任何行增量。
        assert_eq!(sess.get("unattributed_rows"), None);
        assert_eq!(sess.get("unreadable_usage_rows"), None);
    }

    #[test]
    fn cost_state_mid_file_then_tail_rows_by_day() {
        // Python 同名测试同 fixture：基线之后的行 → 行 ts 日；基线 → startTime 日。
        let cs = json!({
            "type": "cost-state", "timestamp": "2026-08-30T11:00:00.000Z",
            // 1788084986000 ms = 2026-08-30T10:16:26Z → 北京 08-30（真值，别手算）。
            "startTime": 1_788_084_986_000i64,
            "modelUsage": {"claude-opus-5": {"inputTokens": 500, "outputTokens": 0,
                                             "cacheReadInputTokens": 0,
                                             "cacheCreationInputTokens": 0,
                                             "webSearchRequests": 0, "costUSD": 0.0}},
            "hasUnknownModelCost": false,
        });
        let row = |ts: &str, n: u64| json!({
            "type": "assistant", "timestamp": ts,
            "message": {"model": "deepseek-v4-flash", "usage": {
                "input_tokens": n, "cache_read_input_tokens": 0,
                "cache_creation_input_tokens": 0, "output_tokens": 0}},
        });
        let mut sess = Map::new();
        for rec in [&cs, &row("2026-08-30T19:00:00.000Z", 10), // 北京 08-31 03:00
                    &row("2026-08-31T12:00:00.000Z", 20),     // 北京 08-31
                    &row("2026-08-31T20:00:00.000Z", 30)]     // 北京 09-01
        {
            apply_record(&mut sess, rec);
        }
        assert_eq!(sess.get("baseline_day").unwrap(), &json!("2026-08-30"));
        let tail = sess.get("tail_days").unwrap();
        // 三条行的 UTC ts 各自跨日：08-30T19Z→08-31、08-31T12Z→08-31（累 30）、
        // 08-31T20Z→09-01。基线不落尾差。
        assert_eq!(
            tail.get("2026-08-31").unwrap().get("deepseek-v4-flash").unwrap().get("input_tokens"),
            Some(&json!(30))
        );
        assert_eq!(
            tail.get("2026-09-01").unwrap().get("deepseek-v4-flash").unwrap().get("input_tokens"),
            Some(&json!(30))
        );
        assert_eq!(tail.get("2026-08-30"), None);
        assert_eq!(tail.as_object().unwrap().len(), 2);
    }

    #[test]
    fn no_cost_state_session_is_row_sum() {
        // Python 同名测试同 fixture：无 cost-state → 无 baseline 键、纯行和。
        let row = json!({
            "type": "assistant", "timestamp": "2026-08-31T10:00:00.000Z",
            "message": {"model": "deepseek-v4-flash", "usage": {
                "input_tokens": 7, "cache_read_input_tokens": 8,
                "cache_creation_input_tokens": 0, "output_tokens": 9}},
        });
        let mut sess = Map::new();
        apply_record(&mut sess, &row);
        assert!(!sess.contains_key("baseline"));
        assert_eq!(
            sess.get("tail_days").unwrap().get("2026-08-31").unwrap()
                .get("deepseek-v4-flash").unwrap().get("cache_read_input_tokens"),
            Some(&json!(8))
        );
    }

    #[test]
    fn unparseable_ts_and_usage_are_sentineled_not_faked() {
        // Python 同名测试同 fixture：ts 坏 → unattributed 哨兵；usage 键两态
        // 皆无 → unreadable 哨兵；usage 有而 model 缺 → unreadable。
        let mut sess = Map::new();
        apply_record(&mut sess, &json!({
            "type": "assistant", "timestamp": "bogus",
            "message": {"model": "deepseek-v4-flash", "usage": {
                "input_tokens": 1, "cache_read_input_tokens": 0,
                "cache_creation_input_tokens": 0, "output_tokens": 0}},
        }));
        apply_record(&mut sess, &json!({
            "type": "assistant", "timestamp": "2026-08-31T10:00:00.000Z",
            "message": {"model": "deepseek-v4-flash", "usage": {"prompt_tokens": 5}},
        }));
        apply_record(&mut sess, &json!({
            "type": "assistant", "timestamp": "2026-08-31T10:00:00.000Z",
            "message": {"usage": {"input_tokens": 1, "cache_read_input_tokens": 0,
                                  "cache_creation_input_tokens": 0,
                                  "output_tokens": 0}},
        }));
        assert_eq!(sess.get("unattributed_rows"), Some(&json!(1)));
        assert_eq!(sess.get("unreadable_usage_rows"), Some(&json!(2)));
        assert_eq!(sess.get("tail_days").unwrap().as_object().unwrap().len(), 0);
    }

    #[test]
    fn rebuild_partitions_current_month_and_merges_sessions() {
        // Python 同名测试同 fixture：同日多会话相加；当前月进 ledger、更早进
        // archive（传入固定 current——纯函数不读钟）。
        let sessions = json!({
            "s1": {"size": 1, "mtime_ns": 1, "baseline": {
                "deepseek-v4-flash": {"input_tokens": 100, "cache_read_input_tokens": 0,
                                      "cache_creation_input_tokens": 0,
                                      "output_tokens": 0}},
                "baseline_day": "2026-08-31", "tail_days": {}},
            "s2": {"size": 1, "mtime_ns": 1, "tail_days": {
                "2026-08-31": {"deepseek-v4-flash": {"input_tokens": 50,
                    "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0,
                    "output_tokens": 0}}}},
            "s3": {"size": 1, "mtime_ns": 1, "tail_days": {
                "2026-09-01": {"claude-sonnet-5": {"input_tokens": 20,
                    "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0,
                    "output_tokens": 0}}}},
        });
        let (ledger, archive) = rebuild_days(&sessions, "2026-09");
        // 当前月 = 2026-09：08-31 是过去月 → 滚进 archive；只有 09-01 留 ledger。
        assert_eq!(ledger.len(), 1);
        let d1 = ledger.get("2026-09-01").unwrap();
        assert_eq!(
            d1.get("claude-sonnet-5").unwrap().get("input_tokens"),
            Some(&json!(20))
        );
        // 08-31 上 s1 baseline 100 + s2 行 50 同日相加 → 150 进归档。
        assert_eq!(archive.len(), 1);
        let d31 = archive.get("2026-08-31").unwrap();
        assert_eq!(
            d31.get("deepseek-v4-flash").unwrap().get("input_tokens"),
            Some(&json!(150))
        );
    }

    #[test]
    fn ledger_day_total_tokens_sums_snake_keys_ignoring_extras() {
        // r2a claude 宿主行走 `claude_ledger_day_tokens` → 这里。flat 日含真实
        // 模型 + `<synthetic>`（全零，cost-state 里的 unknown 占位——0 不能贡献
        // 也不该炸）+ 无关装饰键：只数 SNAKE_KEYS 4 型，其余键一律无视。
        let day = json!({
            "<synthetic>": {"input_tokens": 0, "cache_read_input_tokens": 0,
                            "cache_creation_input_tokens": 0, "output_tokens": 0},
            "deepseek-v4-flash": {"input_tokens": 12_000, "cache_read_input_tokens": 1000,
                                  "cache_creation_input_tokens": 0, "output_tokens": 200,
                                  "server_tool_use": 3},
            "claude-sonnet-5": {"input_tokens": 0, "cache_read_input_tokens": 62_500,
                                "cache_creation_input_tokens": 0, "output_tokens": 0},
        });
        assert_eq!(ledger_day_total_tokens(&day), 75_700);
        // 非对象（坏日）→ 0，不 panic（真实数据里空日不落 ledger，这是防御面）。
        assert_eq!(ledger_day_total_tokens(&Value::Null), 0);
        assert_eq!(ledger_day_total_tokens(&json!({})), 0);
    }
}
