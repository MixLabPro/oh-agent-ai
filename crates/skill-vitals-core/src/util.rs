//! 纯计算工具函数 —— CLI 与 wasm 共用。
//!
//! 这个模块存在的理由：`est_tokens` 原先只住在 binary 的 `src/util.rs` 里，
//! 于是 wasm 拿不到它。而 FR-04a 的上下文构成归因（回答「token 都去哪了」）
//! 必须在浏览器侧算 —— 宿主投影的 `view()` 跑的是 wasm。同一个估算函数在两处
//! 各写一份就是本仓最不能接受的那类缺陷（never a second copy），所以下沉到
//! core，binary 侧改为 re-export。

/// 粗略 token 估算。中文按 0.6 token/字符，其余按 0.3 token/字符——DeepSeek
/// 官方换算比例（<https://api-docs.deepseek.com/zh-cn/quick_start/token_usage>）。
///
/// **换算比例是 2026-08-21 从旧值改过来的**：旧公式是 `cjk/1.5 + other/4`
/// （等价于 CJK×0.667、其余×0.25），来源已不可考。拿真实会话 550 段 assistant
/// 输出（reasoning + text 合并，因为这是推理模型，`outputTokens` 把隐藏的推理
/// 内容也计进去了——只算可见文本会先低估 69%，这个坑在验证时踩过）比对
/// provider 实际返回的 `outputTokens`：旧公式系统性低估 **22.2%**，DeepSeek
/// 官方比例低估 **8.8%**。官方比例明显更准，但仍不是精确值——DeepSeek 自己的
/// 文档写着"以接口返回的用量为准"，这里保留的仍然是估算，不是精确计数。
///
/// CJK 判据是 `U+4E00..=U+9FFF`（含两端）。扩展 A 区（U+3400）与扩展 B 区
/// （U+20000）**不算**，全角标点（U+FF0C）也不算；`as i64` 向下截断而非四舍
/// 五入——比例换了，截断语义没变。这些边界不是随手定的——Python 侧
/// `scripts/skill_vitals/util.py` 的 `est_tokens` 是同一套判据，
/// `tests/test_characterization.py::TestEstTokens` 把每个边界都钉成了具体数值
/// （`est_tokens("hello") == 1`，不是 `> 0`）。
pub fn est_tokens(text: &str) -> i64 {
    if text.is_empty() {
        return 0;
    }
    let mut cjk = 0usize;
    let mut total = 0usize;
    for ch in text.chars() {
        total += 1;
        if ('\u{4e00}'..='\u{9fff}').contains(&ch) {
            cjk += 1;
        }
    }
    let other = total - cjk;
    ((cjk as f64) * 0.6 + (other as f64) * 0.3) as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 与 `tests/test_characterization.py::TestEstTokens` 逐值对齐。
    /// 断言具体数值而非范围——范围断言在移植时毫无用处。
    ///
    /// 期望值按新比例（CJK×0.6、其余×0.3）重新算过，不是从旧测试改的数字——
    /// 换算比例变了，"看起来差不多改一改"式的手改容易把截断边界改错。
    #[test]
    fn est_tokens_matches_python_characterization() {
        assert_eq!(est_tokens(""), 0);
        // 其余字符：×0.3 向下截断
        assert_eq!(est_tokens("hello"), 1); // 5*0.3 = 1.5 → 1
        assert_eq!(est_tokens("xxxx"), 1); // 4*0.3 = 1.2 → 1
        assert_eq!(est_tokens("xxx"), 0); // 3*0.3 = 0.9 → 0，向下取整不是四舍五入
        assert_eq!(est_tokens(&"x".repeat(400)), 120); // 400*0.3 = 120
        // CJK：×0.6
        assert_eq!(est_tokens("中文"), 1); // 2*0.6 = 1.2 → 1
        assert_eq!(est_tokens(&"中".repeat(3)), 1); // 3*0.6 = 1.8 → 1
        assert_eq!(est_tokens(&"中".repeat(150)), 90); // 150*0.6 = 90
        // 混排：「，」是 U+FF0C，不在 CJK 区间内 → 算 other；2*0.6+8*0.3=3.6→3
        assert_eq!(est_tokens("中文，English"), 3);
    }

    /// CJK 区间端点与两侧各一个字符。写成 `<` 而非 `<=` 会在这里露馅。
    #[test]
    fn est_tokens_cjk_range_boundaries() {
        assert_eq!(est_tokens(&"一".repeat(3)), 1); // U+4E00 下界，含；3*0.6=1.8→1
        assert_eq!(est_tokens(&"\u{9fff}".repeat(3)), 1); // U+9FFF 上界，含
        assert_eq!(est_tokens(&"\u{4dff}".repeat(3)), 0); // 下界前一个 → other，3*0.3=0.9→0
        assert_eq!(est_tokens(&"\u{a000}".repeat(3)), 0); // 上界后一个 → other
        assert_eq!(est_tokens(&"\u{3400}".repeat(3)), 0); // 扩展 A 区不算 CJK
        assert_eq!(est_tokens(&"\u{20000}".repeat(3)), 0); // 扩展 B 区不算
    }

    /// 任意 Unicode 不 panic、结果非负（属性测试的用例版）。
    #[test]
    fn est_tokens_total_over_arbitrary_unicode() {
        for s in ["\u{1f600}".repeat(10), "\x00\x01\x02".to_string(),
                  "á̂".to_string(), "🇨🇳🇺🇸".to_string(), "\n\r\t".to_string()] {
            assert!(est_tokens(&s) >= 0);
        }
    }
}

use serde_json::Value;

/// 会话分叉边界：日志头 `session` 事件里的 `seedLength`；没有就是没分叉。
///
/// **为什么需要它**：DSH 里从已有会话「branch into new conversation」派生出的
/// 新会话，会先把上游会话的整段事件历史**原样抄进自己的日志**，再往后追加自己
/// 的事件。抄来的那段里包含上游当时的 `usage` 记录——那是上游真金白银调过的
/// API，已经算在上游自己那本账里了。不认这条边界就等于对同一笔钱重复计费。
///
/// 实测 session-e4b0be69：分叉前 ¥680.36 / 分叉后 ¥433.30，显示的 ¥1113.66 里
/// **61% 是上游的账**。证据不是推测——分叉前那段的 513 个 callId 逐个都能在上游
/// 日志里找到（100%），而分叉后那段只有 3.5% 重叠。
///
/// ## 为什么**不能**用 `session/end-seed` 事件
///
/// 初版就是那么做的（图省事：事件在流里，wasm 和宿主都拿得到，不用透传 header），
/// 并且在 e4b0be69 上验证通过——那个会话的第一个 `end-seed` 正好等于 seedLength。
/// **但那是巧合。**`session/end-seed` 标记的是「一段续种结束」，**会话每次被
/// 重新唤醒都会触发**：真实日志 session-6b47acc7 完全没分叉（`seedLength` 缺席、
/// `parentSession` 为空），却有一个 `end-seed` 落在 seq=65762——整份日志的最后
/// 一个事件。按「第一个 end-seed」判，整个会话都会被当成分叉前数据丢光，UI 上
/// 费用/上下文/常驻前缀/子代理全变「不可用」。
///
/// 一个事件是不是分叉边界，取决于**当初有没有分叉**，而这件事只有日志头知道。
/// 所以这里只认 `seedLength`：它缺席就是没分叉，一个事件都不滤。
pub fn fork_boundary(events: &[Value]) -> Option<i64> {
    for e in events {
        if e.get("type").and_then(|v| v.as_str()) != Some("session") {
            continue;
        }
        // 顶层与 data 下都看一眼：CLI 侧读的是原始日志头（顶层），宿主侧是从
        // `session.header` 合成的（可能挂在 data 下）。
        let n = e
            .get("seedLength")
            .or_else(|| e.pointer("/data/seedLength"))
            .and_then(|v| v.as_i64());
        // 0 或负数不是有效边界——那是「没有续种」，不是「续种了 0 个事件」。
        return n.filter(|x| *x > 0);
    }
    None
}

/// 只保留分叉之后的事件。没有分叉标记时原样返回。
///
/// 所有 core 的公开分析入口都先过这一道：审计回答的是「**这个**会话干了什么」，
/// 上游会话干过的事属于上游自己那份审计。
pub fn post_fork(events: &[Value]) -> Vec<Value> {
    match fork_boundary(events) {
        Some(b) => events
            .iter()
            // map_or(true, …) 而不是 is_none_or —— 后者要 Rust 1.82，本仓 MSRV 是 1.74。
            // 语义：没有 seq 的事件一律保留（缺 seq 是"没上报"，不是"在分叉之前"）。
            .filter(|e| e.get("seq").and_then(|v| v.as_i64()).map_or(true, |q| q >= b))
            .cloned()
            .collect(),
        None => events.to_vec(),
    }
}

#[cfg(test)]
mod fork_tests {
    use super::*;
    use serde_json::json;

    fn ev(t: &str, seq: i64) -> Value {
        json!({"type": t, "seq": seq, "data": {}})
    }
    fn header(seed: Option<i64>) -> Value {
        match seed {
            Some(n) => json!({"type": "session", "seq": Value::Null, "data": {"seedLength": n}}),
            None => json!({"type": "session", "seq": Value::Null, "data": {}}),
        }
    }

    /// 边界来自日志头的 `seedLength`；之前的事件全部滤掉。
    ///
    /// 钉的是一个**真实的重复计费缺陷**：从上游会话 branch 出来的新会话，日志
    /// 前半段是上游历史的原样拷贝，含上游当时的 usage 记录。实测
    /// session-e4b0be69 的显示金额 ¥1113.66 里有 ¥680.36（61%）是上游的账。
    #[test]
    fn boundary_comes_from_header_seed_length() {
        let events = vec![header(Some(3)), ev("tool/call", 1), ev("tool/call", 2), ev("tool/call", 4)];
        assert_eq!(fork_boundary(&events), Some(3));
        let kept: Vec<i64> = post_fork(&events)
            .iter()
            .filter_map(|e| e["seq"].as_i64())
            .collect();
        assert_eq!(kept, vec![4], "分叉前的 seq 1/2 必须滤掉");
    }

    /// **`session/end-seed` 不是分叉边界。**
    ///
    /// 初版就是那么判的，还在一个已分叉的会话上验证通过——那是巧合。这个标记
    /// 的是「一段续种结束」，会话每次被唤醒都会触发：真实日志 session-6b47acc7
    /// 完全没分叉（header 无 seedLength），唯一的 end-seed 落在**最后一个事件**
    /// 上。按事件判会把整个会话丢光，UI 上费用/上下文/常驻前缀/子代理全变
    /// 「不可用」——这个回归是用户在真机上发现的。
    #[test]
    fn end_seed_event_is_not_a_boundary() {
        // **没有 header 标记事件**——适配器只在 seedLength > 0 时才合成一个，
        // 未分叉的会话流里压根没有它。夹具必须是这个形状，否则 header 分支会
        // 先 return，测试就永远走不到 end-seed，红-绿验证也照过（第一版就是
        // 这么假绿的）。
        let events = vec![
            ev("tool/call", 1),
            ev("tool/call", 2),
            ev("session/end-seed", 3), // 末尾的续跑标记
        ];
        assert_eq!(fork_boundary(&events), None, "没有 seedLength 就是没分叉");
        assert_eq!(post_fork(&events).len(), 3, "未分叉的会话一个事件都不能滤");
    }

    /// 没有日志头（或头里没这个字段）时同样不滤——子代理会话就是这样。
    #[test]
    fn missing_header_or_field_means_no_fork() {
        let no_header = vec![ev("tool/call", 0), ev("tool/call", 1)];
        assert_eq!(fork_boundary(&no_header), None);
        assert_eq!(post_fork(&no_header).len(), 2);
        let no_field = vec![header(None), ev("tool/call", 1)];
        assert_eq!(fork_boundary(&no_field), None);
        assert_eq!(post_fork(&no_field).len(), 2);
    }

    /// 0 或负数不是有效边界——那是「没有续种」，不是「续种了 0 个事件」。
    #[test]
    fn zero_seed_length_is_not_a_boundary() {
        assert_eq!(fork_boundary(&[header(Some(0))]), None);
        assert_eq!(fork_boundary(&[header(Some(-1))]), None);
    }

    /// 没有 seq 的事件不能被静默丢掉——缺 seq 是"没上报"，不是"在分叉之前"。
    #[test]
    fn events_without_seq_survive() {
        let events = vec![
            header(Some(5)),
            json!({"type": "tool/call", "data": {}}),
            ev("tool/call", 6),
        ];
        // 日志头自己也没有 seq，同样保留（它就是边界的载体）。
        assert_eq!(post_fork(&events).len(), 3);
    }
}
