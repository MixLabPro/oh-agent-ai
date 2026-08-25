//! 轨迹级检测器 —— 跨事件/序列级的高危模式。
//!
//! 与 `behavior` 模块（SV601–610 单事件静态匹配）是两层审计：这里的四个检测器
//! 看窗口、计数、连续段，捕捉「单条事件看不出来」的轨迹症状：
//!   SV611 重复工具调用 —— 连续相同 (name, arguments) 签名 ≥3 次
//!   SV612 死循环 —— 连续两个动作序列相同的 turn
//!   SV613 进度停滞 —— 连续 error turn / 连续工具失败
//!   SV614 权限异常 —— 同一调用反复审批 / 连续拒绝 / 危险模式反复授予
//! findings 复用 8 键结构，由消费端追加在 `match_behavior` 之后（字节序稳定）。
//! Python 平行实现 `scripts/skill_vitals/trajectory.py`，parity 测试逐字节看守。
//!
//! 阈值常量选值避开 `fixtures/dsh/behavior.jsonl`（无重复调用、≤2 审批、≤1 超时、
//! 无连续 error turn），让「全部规则都命中」的 fixture 保持干净。harness 侧证实：
//! `turn/end.reason.kind` 是唯一 LLM 失败信号、`step/end` 是完成心跳、`repeat-tool-
//! reminder` guard 只存内存（事后审计必须自己重算）——这些都直接落到下面的语义里。

use std::collections::HashMap;

use serde_json::{Value, json};

use crate::behavior::{int_or_none, normalize, tool_invocation};

// ── 阈值常量（与 Python 镜像逐字节一致）─────────────────────────────────
const MIN_REPEAT: usize = 3; // SV611 连续相同签名次数
const MIN_LOOP_TURNS: usize = 2; // SV612 连续相同签名 turn 数
const MIN_ERROR_TURNS: usize = 2; // SV613a 连续 error turn 数
const MIN_FAILED_RESULTS: usize = 3; // SV613b 连续带 error.code 的 tool/result 数
const MIN_SAME_CALL_APPROVALS: usize = 3; // SV614a 同一 callId 审批次数
const MIN_CONSECUTIVE_REJECTIONS: usize = 3; // SV614b 连续 rejected 数
const MIN_DANGER_GRANTS: usize = 2; // SV614c danger-full-access 出现次数

/// 一个 turn 的归并结果：(turn 号, 工具调用签名列表, turn/start 的 seq, time,
/// 该 turn 内目前观察到的最后一个事件的 seq)。最后一项供 G2 的 `run_end_seq`
/// 用——不止累计工具调用时更新，turn 内任何事件（含 tool/result、turn/end）
/// 都推进它，这样才是这个 turn 在事件流里真实占到的位置，不是"最后一次工具
/// 调用"这个更窄的概念。
type TurnSig = (i64, Vec<(String, String)>, Value, Value, Value);

/// 一条轨迹 finding。与 `match_behavior` 的 finding 同构（12 键、键序一致，
/// `tests/test_characterization.py::test_trajectory_findings_share_the_same_
/// key_order` 逐字节看守）——追加进同一数组时 diff/排序/渲染零改动。
/// `tool_name` 只在 SV611 有意义（重复的工具名），其余轨迹级模式诚实置 null。
///
/// `run_end_seq`（G2，GOVERNANCE_BACKLOG.md）：`seq` 只是判定命中那一刻的
/// 锚点，本身推不出这段异常在事件流里烧到哪个 seq 才算完——`[seq,
/// run_end_seq]` 才是可以拿去跟 `costReport.series`/`request_metrics` 对齐、
/// 算"这段烧了多少钱"的真实区间。只有 SV611/612/613 填真实值；SV614（权限
/// 异常）没有"这一段烧了多少"的概念（是计数类判定，不是区间类），置 null——
/// 不臆造一个不存在的区间。SV612 的区间刻意**只覆盖被判定重复的那个 turn**
/// （`seq` 锚定的那个），不回溯到被复制的原 turn——扩到两个 turn 需要在
/// finding 里再带一个"区间起点"，backlog 把这个決定判给了"先给最小可用版本"
/// 一侧，读这条 finding 的人要连原 turn 的花费一起看，需要另外用 `turn`
/// 字段自己找上一个 turn。
#[allow(clippy::too_many_arguments)]
fn finding(
    rule: &str,
    severity: &str,
    category: &str,
    tool: Option<&str>,
    evidence: String,
    seq: Value,
    time: Value,
    run_end_seq: Value,
) -> Value {
    json!({
        "rule": rule,
        "severity": severity,
        "category": category,
        "tool_name": match tool {
            Some(t) => Value::String(t.to_string()),
            None => Value::Null,
        },
        "evidence": normalize(&evidence),
        "seq": seq,
        "time": time,
        "turn": Value::Null,
        "step": Value::Null,
        "call_id": Value::Null,
        "evidence_recency": "log",
        "run_end_seq": run_end_seq,
    })
}

/// `seq → (turn, step, call_id)`。
///
/// 轨迹检测器只把**锚点事件的 `seq`** 记进 finding，不持有事件本身，所以坐标在
/// 检测跑完后按 seq 回填——比给四个检测器各加一路坐标透传要小得多，且保证
/// 与 `match_behavior` 用的是同一套 `Coords` 语义（自带优先、turn 外为 null）。
///
/// 键序保持与 `match_behavior` 的 finding 完全一致：`finding()` 先以 `null`
/// 占好 `turn`/`step`/`call_id` 三个位，这里只改值不插键——两类 finding 追加
/// 进同一个数组时仍是同构的 11 键，diff/排序/渲染零改动。
///
/// `pub(crate)`：`skill.rs`（T3，Skill 执行审计）也复用它给 `skill-invocation`
/// 载体找 turn/step——那类事件不像 `tool/call` 自带坐标，只能靠边界顺延。
pub(crate) fn coord_map(events: &[Value]) -> std::collections::HashMap<i64, (Value, Value, Value)> {
    let mut map = std::collections::HashMap::new();
    let mut coords = crate::behavior::Coords::default();
    for event in events {
        if !event.is_object() {
            continue;
        }
        coords.observe(event);
        if let Some(seq) = event.get("seq").and_then(|v| v.as_i64()) {
            map.insert(seq, coords.resolve(event));
        }
    }
    map
}

/// 按 finding 自己的 `seq` 回填坐标。查不到（锚点 seq 缺失/畸形）保持 null。
fn fill_coords(findings: &mut [Value], map: &std::collections::HashMap<i64, (Value, Value, Value)>) {
    for f in findings.iter_mut() {
        let Some(seq) = f.get("seq").and_then(|v| v.as_i64()) else { continue };
        let Some((turn, step, call_id)) = map.get(&seq) else { continue };
        if let Some(obj) = f.as_object_mut() {
            obj.insert("turn".to_string(), turn.clone());
            obj.insert("step".to_string(), step.clone());
            obj.insert("call_id".to_string(), call_id.clone());
        }
    }
}

/// 事件序列 → 轨迹 findings（SV611–614），按码序追加。
pub fn match_trajectory(events: &[Value]) -> Vec<Value> {
    let mut findings = Vec::new();
    findings.extend(detect_repeated(events));
    findings.extend(detect_loop(events));
    findings.extend(detect_stall(events));
    findings.extend(detect_permission(events));
    fill_coords(&mut findings, &coord_map(events));
    findings
}

/// SV611：连续相同 (name, arguments) 签名 ≥3 次。
///
/// 对齐 harness `repeat-tool-reminder` 的**连续**语义（同一个调用紧挨着又来一遍
/// 才是「重复」，不是全会话里出现过几次）——区别在：它只存内存、重启即清零，
/// 这里从事件流重算。每次越过 MIN_REPEAT 的倍数报一条（run 为 6 时报 ×3 和 ×6，
/// 锚点始终是 run 起点）。
fn detect_repeated(events: &[Value]) -> Vec<Value> {
    let mut out = Vec::new();
    let mut prev: Option<(String, String)> = None; // (name, args) 签名
    let mut count: usize = 0;
    let mut anchor: Option<(String, Value, Value)> = None; // (name, seq, time)
    for event in events {
        if !event.is_object() {
            continue;
        }
        let Some((name, args)) = tool_invocation(event) else { continue };
        let sig = (name.to_string(), args);
        if prev.as_ref() == Some(&sig) {
            count += 1;
        } else {
            prev = Some(sig);
            count = 1;
            anchor = Some((
                name.to_string(),
                int_or_none(event.get("seq")),
                int_or_none(event.get("time")),
            ));
        }
        if count >= MIN_REPEAT && count % MIN_REPEAT == 0 {
            if let Some((aname, seq, time)) = &anchor {
                out.push(finding(
                    "SV611",
                    "warning",
                    "trajectory",
                    Some(aname),
                    format!("{} 连续重复 {} 次", aname, count),
                    seq.clone(),
                    time.clone(),
                    // G2：本次达标窗口的终点就是让 count 越过阈值倍数的这个事件；
                    // 窗口是累计的（锚点 anchor 始终是 run 起点），所以 run 到 6 时
                    // 再报一次，覆盖的区间会比到 3 时那次更宽——如实反映"这一段
                    // 到目前为止一共烧了多少"，不是"最近 3 次"这个更窄的窗口。
                    int_or_none(event.get("seq")),
                ));
            }
        }
    }
    out
}

/// SV612：连续两个「动作序列相同」的 turn。
///
/// turn 签名 = 该 turn 内 tool/call（含 code-dispatch）的 (name, arguments) 有序
/// 列表，按 turn/start 边界分组；空 turn（无工具调用）跳过——两个都没有动作的
/// turn 不是死循环。同一段连续相同 turn 只报一次（run 内不再重报）。
fn detect_loop(events: &[Value]) -> Vec<Value> {
    let mut out = Vec::new();
    // (turn, 签名列表, turn/start 的 seq, time, 该 turn 目前观察到的最后 seq)
    let mut turns: Vec<TurnSig> = Vec::new();
    let mut current: Option<TurnSig> = None;
    for event in events {
        if !event.is_object() {
            continue;
        }
        if event.get("type").and_then(|v| v.as_str()) == Some("turn/start") {
            if let Some(t) = current.take() {
                turns.push(t);
            }
            let turn = event.pointer("/data/turn").and_then(|v| v.as_i64()).unwrap_or(0);
            let seq = int_or_none(event.get("seq"));
            current = Some((turn, Vec::new(), seq.clone(), int_or_none(event.get("time")), seq));
            continue;
        }
        // turn 内任何事件都推进「目前观察到的最后 seq」——不止工具调用：
        // G2 的 run_end_seq 要覆盖这个 turn 实际占到的位置（例如它自己的
        // tool/result），只用最后一次工具调用的 seq 会把区间掐得偏短。
        if let Some(t) = current.as_mut() {
            if let Some(seq) = event.get("seq").and_then(|v| v.as_i64()) {
                t.4 = json!(seq);
            }
        }
        if let Some((name, args)) = tool_invocation(event) {
            if let Some(t) = current.as_mut() {
                t.1.push((name.to_string(), args));
            }
        }
    }
    if let Some(t) = current {
        turns.push(t);
    }

    let mut prev_sig: Option<Vec<(String, String)>> = None;
    let mut run_count: usize = 0;
    for (turn, sigs, seq, time, last_seq) in &turns {
        if sigs.is_empty() {
            continue;
        }
        if prev_sig.as_ref() == Some(sigs) {
            run_count += 1;
        } else {
            prev_sig = Some(sigs.clone());
            run_count = 1;
        }
        // 只在 run 长度恰好到达阈值时报一次（run 更长不重报，run 中断后新序列重新数）
        if run_count == MIN_LOOP_TURNS {
            out.push(finding(
                "SV612",
                "warning",
                "trajectory",
                None,
                format!(
                    "死循环: turn {} 与上一 turn 动作序列相同",
                    turn,
                ),
                seq.clone(),
                time.clone(),
                // G2：只覆盖判定命中的这个 turn（seq 锚定的那个），不含被
                // 复制的上一个 turn——见 finding() 文档注释的设计取舍。
                last_seq.clone(),
            ));
        }
    }
    out
}

/// SV613：进度停滞。
///
/// (a) 连续 `turn/end` 以 `reason.kind=="error"` 结束 —— LLM 级停滞；
/// (b) 连续 `tool/result` 带 `error.code` —— 工具级停滞。
/// 各自只在同类事件上跑 run；**run 在「断掉」（一个成功/无关事件）或流结束时
/// 关闭，报 run 的真实总长度**（真实 run 5 个失败就报 5，不报阈值倍数 3）——
/// 锚点仍是 run 起点。真实日志 e4b0be69 的 6 连 edit 失败由此报「连续 5 个」。
fn detect_stall(events: &[Value]) -> Vec<Value> {
    let mut out = Vec::new();

    let mut err_run: usize = 0;
    let mut err_anchor: Option<(Value, Value, String)> = None; // (seq, time, 首个 error code)
    let mut err_last: Value = Value::Null; // G2：run 内最后一个事件的 seq
    for event in events {
        if !event.is_object() {
            continue;
        }
        if event.get("type").and_then(|v| v.as_str()) != Some("turn/end") {
            continue;
        }
        if event.pointer("/data/reason/kind").and_then(|v| v.as_str()) == Some("error") {
            if err_run == 0 {
                let code = event
                    .pointer("/data/reason/error/code")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                err_anchor = Some((int_or_none(event.get("seq")), int_or_none(event.get("time")), code));
            }
            err_run += 1;
            err_last = int_or_none(event.get("seq"));
        } else {
            flush_error_run(&mut out, &mut err_run, &mut err_anchor, &mut err_last);
        }
    }
    flush_error_run(&mut out, &mut err_run, &mut err_anchor, &mut err_last);

    let mut fail_run: usize = 0;
    let mut fail_anchor: Option<(Value, Value, String)> = None; // (seq, time, 首个 code)
    let mut fail_last: Value = Value::Null; // G2：run 内最后一个事件的 seq
    for event in events {
        if !event.is_object() {
            continue;
        }
        if event.get("type").and_then(|v| v.as_str()) != Some("tool/result") {
            continue;
        }
        match event.pointer("/data/error/code").and_then(|v| v.as_str()) {
            Some(code) => {
                if fail_run == 0 {
                    fail_anchor = Some((
                        int_or_none(event.get("seq")),
                        int_or_none(event.get("time")),
                        code.to_string(),
                    ));
                }
                fail_run += 1;
                fail_last = int_or_none(event.get("seq"));
            }
            None => {
                flush_fail_run(&mut out, &mut fail_run, &mut fail_anchor, &mut fail_last);
            }
        }
    }
    flush_fail_run(&mut out, &mut fail_run, &mut fail_anchor, &mut fail_last);

    out
}

/// 关闭一个 error-turn run：达到阈值则报一条（evidence 用 run 总长度），再复位。
/// `last_seq`（G2）是 run 里最后一个事件的 seq——与 anchor 的起点 seq 一起
/// 构成 `[seq, run_end_seq]` 这段停滞真实覆盖的区间。
fn flush_error_run(
    out: &mut Vec<Value>,
    run: &mut usize,
    anchor: &mut Option<(Value, Value, String)>,
    last_seq: &mut Value,
) {
    if *run >= MIN_ERROR_TURNS {
        if let Some((seq, time, code)) = anchor {
            let suffix = if code.is_empty() {
                String::new()
            } else {
                format!("（{}）", code)
            };
            out.push(finding(
                "SV613",
                "warning",
                "trajectory",
                None,
                format!("进度停滞: 连续 {} 个 turn 以 error 结束{}", *run, suffix),
                seq.clone(),
                time.clone(),
                last_seq.clone(),
            ));
        }
    }
    *run = 0;
    *anchor = None;
    *last_seq = Value::Null;
}

/// 关闭一个 tool-failure run：同上，evidence 报 run 总长度。
fn flush_fail_run(
    out: &mut Vec<Value>,
    run: &mut usize,
    anchor: &mut Option<(Value, Value, String)>,
    last_seq: &mut Value,
) {
    if *run >= MIN_FAILED_RESULTS {
        if let Some((seq, time, first_code)) = anchor {
            out.push(finding(
                "SV613",
                "warning",
                "trajectory",
                None,
                format!("进度停滞: 连续 {} 个工具失败（首个 {}）", *run, first_code),
                seq.clone(),
                time.clone(),
                last_seq.clone(),
            ));
        }
    }
    *run = 0;
    *anchor = None;
    *last_seq = Value::Null;
}

fn detect_permission(events: &[Value]) -> Vec<Value> {
    let mut out = Vec::new();

    // (a) 同一 callId 审批次数
    let mut by_call: HashMap<String, (usize, Value, Value)> = HashMap::new();
    for event in events {
        if !event.is_object() {
            continue;
        }
        if event.get("type").and_then(|v| v.as_str()) != Some("approval/asked") {
            continue;
        }
        let Some(call_id) = event.pointer("/data/callId").and_then(|v| v.as_str()) else {
            continue;
        };
        let e = by_call
            .entry(call_id.to_string())
            .or_insert_with(|| (0, Value::Null, Value::Null));
        if e.0 == 0 {
            e.1 = int_or_none(event.get("seq"));
            e.2 = int_or_none(event.get("time"));
        }
        e.0 += 1;
    }
    // HashMap 迭代顺序不确定 —— 按 callId 排序保证确定性（差分护栏要求）。
    let mut calls: Vec<(&String, &(usize, Value, Value))> = by_call.iter().collect();
    calls.sort_by(|a, b| a.0.cmp(b.0));
    for (call_id, (count, seq, time)) in calls {
        if *count >= MIN_SAME_CALL_APPROVALS {
            out.push(finding(
                "SV614",
                "warning",
                "approval",
                None,
                format!("权限异常: 同一调用 {} 请求审批 {} 次", call_id, count),
                seq.clone(),
                time.clone(),
                // G2：SV614 是计数类判定（同一调用审批几次），不是区间类
                // （没有"从哪烧到哪"的概念）——诚实置 null，不臆造一个区间。
                Value::Null,
            ));
        }
    }

    // (b) 连续 rejected
    let mut rej_run: usize = 0;
    let mut anchor: Option<(Value, Value)> = None;
    for event in events {
        if !event.is_object() {
            continue;
        }
        if event.get("type").and_then(|v| v.as_str()) != Some("approval/decided") {
            continue;
        }
        if event.pointer("/data/outcome").and_then(|v| v.as_str()) == Some("rejected") {
            if rej_run == 0 {
                anchor = Some((int_or_none(event.get("seq")), int_or_none(event.get("time"))));
            }
            rej_run += 1;
            if rej_run >= MIN_CONSECUTIVE_REJECTIONS && rej_run % MIN_CONSECUTIVE_REJECTIONS == 0 {
                if let Some((seq, time)) = &anchor {
                    out.push(finding(
                        "SV614",
                        "warning",
                        "approval",
                        None,
                        format!("权限异常: 连续 {} 次审批被拒", rej_run),
                        seq.clone(),
                        time.clone(),
                        Value::Null,
                    ));
                }
            }
        } else {
            rej_run = 0;
            anchor = None;
        }
    }

    // (c) danger-full-access 出现次数
    let mut danger: usize = 0;
    let mut dseq = Value::Null;
    let mut dtime = Value::Null;
    for event in events {
        if !event.is_object() {
            continue;
        }
        if event.get("type").and_then(|v| v.as_str()) != Some("sandbox/mode") {
            continue;
        }
        if event.pointer("/data/mode").and_then(|v| v.as_str()) == Some("danger-full-access") {
            if danger == 0 {
                dseq = int_or_none(event.get("seq"));
                dtime = int_or_none(event.get("time"));
            }
            danger += 1;
        }
    }
    if danger >= MIN_DANGER_GRANTS {
        out.push(finding(
            "SV614",
            "warning",
            "approval",
            None,
            format!("权限异常: 危险模式 danger-full-access 授予 {} 次", danger),
            dseq,
            dtime,
            Value::Null,
        ));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(etype: &str, seq: i64, time: i64, data: Value) -> Value {
        json!({"type": etype, "seq": seq, "time": time, "data": data})
    }

    fn tool_call(name: &str, arguments: &str, seq: i64) -> Value {
        ev("tool/call", seq, 1000 + seq, json!({"name": name, "arguments": arguments}))
    }

    fn turn_start(turn: i64, seq: i64) -> Value {
        ev("turn/start", seq, 1000 + seq, json!({"turn": turn}))
    }

    fn turn_end(turn: i64, seq: i64, kind: &str) -> Value {
        ev("turn/end", seq, 1000 + seq, json!({"turn": turn, "reason": {"kind": kind}}))
    }

    fn tool_result_error(seq: i64, code: &str) -> Value {
        ev("tool/result", seq, 1000 + seq,
           json!({"message": {"content": []}, "error": {"name": "x", "code": code}}))
    }

    #[test]
    fn sv611_repeated_tool_call_hit_and_miss() {
        let hit = [
            tool_call("bash", r#"{"command":"ls"}"#, 1),
            tool_call("bash", r#"{"command":"ls"}"#, 2),
            tool_call("bash", r#"{"command":"ls"}"#, 3),
        ];
        let out = match_trajectory(&hit);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0]["rule"], "SV611");
        assert_eq!(out[0]["tool_name"], "bash");
        assert_eq!(out[0]["seq"], 1); // 锚点是 run 起点

        // miss：参数不同不算重复；只有 2 次不算
        let miss1 = [
            tool_call("bash", r#"{"command":"ls"}"#, 1),
            tool_call("bash", r#"{"command":"ls -la"}"#, 2),
            tool_call("bash", r#"{"command":"ls"}"#, 3),
        ];
        assert!(match_trajectory(&miss1).is_empty());
        let miss2 = [
            tool_call("bash", r#"{"command":"ls"}"#, 1),
            tool_call("bash", r#"{"command":"ls"}"#, 2),
        ];
        assert!(match_trajectory(&miss2).is_empty());
    }

    #[test]
    fn sv612_dead_loop_hit_and_miss() {
        // turn 1 与 turn 2 动作序列相同 → 命中
        let hit = [
            turn_start(1, 1),
            tool_call("bash", r#"{"command":"ls"}"#, 2),
            tool_call("write", r#"{"file_path":"a"}"#, 3),
            turn_start(2, 4),
            tool_call("bash", r#"{"command":"ls"}"#, 5),
            tool_call("write", r#"{"file_path":"a"}"#, 6),
        ];
        let out = match_trajectory(&hit);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0]["rule"], "SV612");
        assert_eq!(out[0]["seq"], 4); // 第二个 turn 的 turn/start

        // miss：turn 序列不同
        let miss = [
            turn_start(1, 1),
            tool_call("bash", r#"{"command":"ls"}"#, 2),
            turn_start(2, 3),
            tool_call("write", r#"{"file_path":"a"}"#, 4),
        ];
        assert!(match_trajectory(&miss).is_empty());
    }

    #[test]
    fn sv613_stall_hit_and_miss() {
        // (a) 连续 2 个 error turn
        let hit_a = [
            turn_start(1, 1),
            turn_end(1, 2, "error"),
            turn_start(2, 3),
            turn_end(2, 4, "error"),
        ];
        let out = match_trajectory(&hit_a);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0]["rule"], "SV613");
        // 锚点是第一个 error turn/end（seq 2），不是 turn/start
        assert_eq!(out[0]["seq"], 2);

        // (b) 连续 3 个工具失败
        let hit_b = [
            tool_result_error(1, "TOOL_TIMEOUT"),
            tool_result_error(2, "TOOL_TIMEOUT"),
            tool_result_error(3, "TOOL_TIMEOUT"),
        ];
        let out_b = match_trajectory(&hit_b);
        assert_eq!(out_b.len(), 1);
        assert_eq!(out_b[0]["rule"], "SV613");

        // miss：中间有成功结果打断
        let miss = [
            tool_result_error(1, "TOOL_TIMEOUT"),
            tool_result_error(2, "TOOL_TIMEOUT"),
            ev("tool/result", 3, 1003, json!({"message": {"content": []}})),
            tool_result_error(4, "TOOL_TIMEOUT"),
        ];
        assert!(match_trajectory(&miss).is_empty());
    }

    #[test]
    fn sv614_permission_anomaly_hit_and_miss() {
        // (a) 同一 callId 审批 3 次
        let hit_a = [
            ev("approval/asked", 1, 1001, json!({"id": "a1", "toolName": "bash", "callId": "c1"})),
            ev("approval/asked", 2, 1002, json!({"id": "a2", "toolName": "bash", "callId": "c1"})),
            ev("approval/asked", 3, 1003, json!({"id": "a3", "toolName": "bash", "callId": "c1"})),
        ];
        let out = match_trajectory(&hit_a);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0]["rule"], "SV614");
        assert!(out[0]["evidence"].as_str().unwrap().contains("c1"));

        // (b) 连续 3 次 rejected
        let hit_b = [
            ev("approval/decided", 1, 1001, json!({"id": "a1", "outcome": "rejected"})),
            ev("approval/decided", 2, 1002, json!({"id": "a2", "outcome": "rejected"})),
            ev("approval/decided", 3, 1003, json!({"id": "a3", "outcome": "rejected"})),
        ];
        let out_b = match_trajectory(&hit_b);
        assert_eq!(out_b.len(), 1);
        assert_eq!(out_b[0]["rule"], "SV614");

        // (c) danger-full-access 2 次
        let hit_c = [
            ev("sandbox/mode", 1, 1001, json!({"mode": "danger-full-access"})),
            ev("sandbox/mode", 2, 1002, json!({"mode": "workspace-write"})),
            ev("sandbox/mode", 3, 1003, json!({"mode": "danger-full-access"})),
        ];
        let out_c = match_trajectory(&hit_c);
        assert_eq!(out_c.len(), 1);
        assert_eq!(out_c[0]["rule"], "SV614");

        // miss：2 次审批不同 callId；1 次 rejected；1 次 danger
        let miss = [
            ev("approval/asked", 1, 1001, json!({"id": "a1", "toolName": "bash", "callId": "c1"})),
            ev("approval/asked", 2, 1002, json!({"id": "a2", "toolName": "bash", "callId": "c2"})),
            ev("approval/decided", 3, 1003, json!({"id": "a1", "outcome": "rejected"})),
            ev("sandbox/mode", 4, 1004, json!({"mode": "danger-full-access"})),
        ];
        assert!(match_trajectory(&miss).is_empty());
    }

    /// Python `json.dumps(match_trajectory(events), ensure_ascii=False, separators=(",", ":"))`
    /// 对同一事件流（覆盖全部 4 个检测器：重复调用/死循环/停滞/权限异常）的逐字节对照。
    /// 期望串在 Python 侧生成后硬编码于此，Python 一改这里就红。
    #[test]
    fn match_trajectory_python_rust_byte_for_byte_parity() {
        let events = [
            json!({"type":"tool/call","seq":1,"time":1001,"data":{"name":"bash","arguments":"{\"command\":\"ls\"}"}}),
            json!({"type":"tool/call","seq":2,"time":1002,"data":{"name":"bash","arguments":"{\"command\":\"ls\"}"}}),
            json!({"type":"tool/call","seq":3,"time":1003,"data":{"name":"bash","arguments":"{\"command\":\"ls\"}"}}),
            json!({"type":"turn/start","seq":4,"time":1004,"data":{"turn":1}}),
            json!({"type":"tool/call","seq":5,"time":1005,"data":{"name":"bash","arguments":"{\"command\":\"ls\"}"}}),
            json!({"type":"tool/call","seq":6,"time":1006,"data":{"name":"write","arguments":"{\"file_path\":\"a\"}"}}),
            json!({"type":"turn/start","seq":7,"time":1007,"data":{"turn":2}}),
            json!({"type":"tool/call","seq":8,"time":1008,"data":{"name":"bash","arguments":"{\"command\":\"ls\"}"}}),
            json!({"type":"tool/call","seq":9,"time":1009,"data":{"name":"write","arguments":"{\"file_path\":\"a\"}"}}),
            json!({"type":"turn/start","seq":10,"time":1010,"data":{"turn":3}}),
            json!({"type":"turn/end","seq":11,"time":1011,"data":{"turn":3,"reason":{"kind":"error"}}}),
            json!({"type":"turn/start","seq":12,"time":1012,"data":{"turn":4}}),
            json!({"type":"turn/end","seq":13,"time":1013,"data":{"turn":4,"reason":{"kind":"error"}}}),
            json!({"type":"tool/result","seq":14,"time":1014,"data":{"message":{"content":[]},"error":{"name":"x","code":"TOOL_TIMEOUT"}}}),
            json!({"type":"tool/result","seq":15,"time":1015,"data":{"message":{"content":[]},"error":{"name":"x","code":"TOOL_TIMEOUT"}}}),
            json!({"type":"tool/result","seq":16,"time":1016,"data":{"message":{"content":[]},"error":{"name":"x","code":"TOOL_TIMEOUT"}}}),
            json!({"type":"approval/asked","seq":17,"time":1017,"data":{"id":"a1","toolName":"bash","callId":"c1"}}),
            json!({"type":"approval/asked","seq":18,"time":1018,"data":{"id":"a2","toolName":"bash","callId":"c1"}}),
            json!({"type":"approval/asked","seq":19,"time":1019,"data":{"id":"a3","toolName":"bash","callId":"c1"}}),
            json!({"type":"approval/decided","seq":20,"time":1020,"data":{"id":"a1","outcome":"rejected"}}),
            json!({"type":"approval/decided","seq":21,"time":1021,"data":{"id":"a2","outcome":"rejected"}}),
            json!({"type":"approval/decided","seq":22,"time":1022,"data":{"id":"a3","outcome":"rejected"}}),
            json!({"type":"sandbox/mode","seq":23,"time":1023,"data":{"mode":"danger-full-access"}}),
            json!({"type":"sandbox/mode","seq":24,"time":1024,"data":{"mode":"workspace-write"}}),
            json!({"type":"sandbox/mode","seq":25,"time":1025,"data":{"mode":"danger-full-access"}}),
        ];
        let out = match_trajectory(&events);
        assert_eq!(
            serde_json::to_string(&out).unwrap(),
            r#"[{"rule":"SV611","severity":"warning","category":"trajectory","tool_name":"bash","evidence":"bash 连续重复 3 次","seq":1,"time":1001,"turn":null,"step":null,"call_id":null,"evidence_recency":"log","run_end_seq":3},{"rule":"SV612","severity":"warning","category":"trajectory","tool_name":null,"evidence":"死循环: turn 2 与上一 turn 动作序列相同","seq":7,"time":1007,"turn":2,"step":null,"call_id":null,"evidence_recency":"log","run_end_seq":9},{"rule":"SV613","severity":"warning","category":"trajectory","tool_name":null,"evidence":"进度停滞: 连续 2 个 turn 以 error 结束","seq":11,"time":1011,"turn":3,"step":null,"call_id":null,"evidence_recency":"log","run_end_seq":13},{"rule":"SV613","severity":"warning","category":"trajectory","tool_name":null,"evidence":"进度停滞: 连续 3 个工具失败（首个 TOOL_TIMEOUT）","seq":14,"time":1014,"turn":null,"step":null,"call_id":null,"evidence_recency":"log","run_end_seq":16},{"rule":"SV614","severity":"warning","category":"approval","tool_name":null,"evidence":"权限异常: 同一调用 c1 请求审批 3 次","seq":17,"time":1017,"turn":null,"step":null,"call_id":"c1","evidence_recency":"log","run_end_seq":null},{"rule":"SV614","severity":"warning","category":"approval","tool_name":null,"evidence":"权限异常: 连续 3 次审批被拒","seq":20,"time":1020,"turn":null,"step":null,"call_id":null,"evidence_recency":"log","run_end_seq":null},{"rule":"SV614","severity":"warning","category":"approval","tool_name":null,"evidence":"权限异常: 危险模式 danger-full-access 授予 2 次","seq":23,"time":1023,"turn":null,"step":null,"call_id":null,"evidence_recency":"log","run_end_seq":null}]"#
        );
    }
}