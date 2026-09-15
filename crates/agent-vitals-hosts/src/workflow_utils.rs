//! Small host-independent helpers for source adapters emitting WorkflowEvent.
//!
//! These helpers intentionally return only timestamps, bounded labels, and
//! one-way fingerprints.  They must never be used to move raw prompts,
//! arguments, paths, or error text across the adapter boundary.

use agent_vitals_domain::contracts::evidence::TimeSpan;
use agent_vitals_domain::domain::util::to_epoch_ms;
use agent_vitals_domain::source_identity::fnv1a64_hex;

/// 会话跨度 = **喂进这份证据的所有原生记录**的时间 min/max。
///
/// 语义按 `docs/v1.0.0/OBSERVED_SPAN_IMPLEMENTATION_PLAN.md` §3.1 的 D1–D4：
///
/// - **D1** 取**实测事件时间**，不是会话头声明的范围——头部可能被轮转/截断，
///   实测值才是"这份日志里真的有什么"。
/// - **D2** **0 条记录 → `None`**，**绝不返回 `(0,0)`**：后者会被下游读成
///   1970-01-01，正是本仓反复栽过的「把缺失渲染成零」。1 条 → `start == end`
///   （合法——"这一刻有记录"）。
/// - **D3** 一律过 `to_epoch_ms`：Claude 与 WorkBuddy 的 `parse_iso` 出**秒**，
///   DSH 出**毫秒**，Codex 出毫秒。调用方只负责把字段取出来，单位归一只在这一处。
/// - **D4** 只取**原生记录**的时间戳，不含合成的 `ordinal` 序数——序数不是时间，
///   拿它当时间就是把"我们排的序"冒充成"观测到的时间"。
///
/// **跨度跟随调用方的记录集合**：调用方喂的是分叉后的事件，跨度就是分叉后的。
/// 这是有意的——跨度描述「**这份证据是从什么算出来的**」，不是「宿主磁盘上有什么」。
pub fn session_span(times: impl IntoIterator<Item = i64>) -> Option<TimeSpan> {
    let mut iter = times.into_iter().map(to_epoch_ms);
    let first = iter.next()?;
    let mut start_ms = first;
    let mut end_ms = first;
    for value in iter {
        start_ms = start_ms.min(value);
        end_ms = end_ms.max(value);
    }
    Some(TimeSpan { start_ms, end_ms })
}

pub fn iso_to_epoch_ms(value: Option<&str>) -> Option<i64> {
    let value = value?;
    let (seconds, _) = agent_vitals_domain::domain::budget::parse_iso(value)?;
    let fraction = value
        .split_once('.')
        .and_then(|(_, rest)| rest.find(['Z', '+', '-']).map(|i| &rest[..i]))
        .unwrap_or("");
    let mut digits = fraction.chars().take(3).collect::<String>();
    if digits.chars().any(|c| !c.is_ascii_digit()) { return None; }
    while digits.len() < 3 { digits.push('0'); }
    let fraction_ms = if digits.is_empty() { 0 } else { digits.parse::<i64>().ok()? };
    seconds.checked_mul(1000)?.checked_add(fraction_ms)
}

pub fn safe_label(value: &str) -> String {
    if !value.is_empty()
        && value.len() <= 128
        && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"._/-".contains(&byte))
    {
        value.to_string()
    } else {
        fingerprint(value)
    }
}

pub fn fingerprint(value: &str) -> String {
    format!("fnv1a64:{}", fnv1a64_hex(value.as_bytes()))
}

pub fn outcome(status: Option<&str>, error_present: bool) -> &'static str {
    if error_present { return "failed"; }
    match status.unwrap_or("").to_ascii_lowercase().as_str() {
        "ok" | "success" | "succeeded" | "completed" | "complete" | "applied" => "succeeded",
        "error" | "failed" | "failure" => "failed",
        "cancelled" | "canceled" | "aborted" => "cancelled",
        _ => "unknown",
    }
}

#[cfg(test)]
mod session_span_tests {
    use super::session_span;

    /// **D2 是这段代码最要紧的一条**：没有记录时必须是 `None`，
    /// 绝不能是 `(0,0)`——后者会被日桶/时间窗读成 1970-01-01。
    /// 本仓已经因为"把缺失渲染成零"栽过（`issue_instances` 的 1970 日桶）。
    #[test]
    fn no_records_yields_none_not_zero_span() {
        assert_eq!(session_span(std::iter::empty()), None);
        assert_eq!(session_span(Vec::<i64>::new()), None);
    }

    /// 单条记录 → `start == end`（合法："这一刻有记录"），不是 None。
    #[test]
    fn single_record_gives_a_zero_length_span() {
        let span = session_span([1_788_449_204i64]).expect("span");
        assert_eq!(span.start_ms, 1_788_449_204_000);
        assert_eq!(span.end_ms, span.start_ms);
    }

    /// 真机取值：Claude 的 `parse_iso` 出**秒**，DSH 出**毫秒**。
    /// 归一后必须同量级——这是 D3。
    #[test]
    fn seconds_and_milliseconds_normalize_to_the_same_magnitude() {
        let claude = session_span([1_788_449_204i64]).expect("claude");
        let dsh = session_span([1_789_132_709_000i64]).expect("dsh");
        assert!(claude.start_ms >= 100_000_000_000, "秒级输入必须被放大到毫秒");
        assert!(dsh.start_ms >= 100_000_000_000);
        let gap = (dsh.start_ms - claude.start_ms).abs();
        assert!(gap < 90 * 86_400_000, "归一后应落在同一季度内，实际差 {gap}ms");
    }

    /// min/max 取对，且 `start <= end` 恒成立（防取反）。
    #[test]
    fn start_is_min_and_end_is_max_regardless_of_input_order() {
        let times = [1_788_449_300_000i64, 1_788_449_100_000, 1_788_449_200_000];
        let span = session_span(times).expect("span");
        assert_eq!(span.start_ms, 1_788_449_100_000);
        assert_eq!(span.end_ms, 1_788_449_300_000);
        assert!(span.start_ms <= span.end_ms);
        // 逆序输入结果相同
        let reversed = session_span([1_788_449_200_000i64, 1_788_449_100_000, 1_788_449_300_000]).expect("span");
        assert_eq!(reversed.start_ms, span.start_ms);
        assert_eq!(reversed.end_ms, span.end_ms);
    }
}
