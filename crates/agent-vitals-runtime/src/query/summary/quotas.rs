//! codex/claude 的配额快照（产品特性面）。

use super::*;

pub fn codex_quota_snapshot(home: &Path) -> Option<serde_json::Value> {
    // 签名保留给 Tauri 调用点；配额现由同步管线写入 authority，产品读面不得
    // 回退扫描 ~/.codex rollout（库缺记录就诚实 None）。
    let _ = home;
    let db = SqlSummaryRepository::new().open_db()?;
    let (payload, _observed_at_ms) = db.runtime_snapshot_get("codex", "codex_quota").ok()??;
    let plan: serde_json::Value = serde_json::from_str(&payload).ok()?;
    agent_vitals_hosts::codex_usage::validate_quota_snapshot(&plan)
}

/// Claude Pro 的窗口状态（决策卡「现在该用谁」的 Claude 行）。
///
/// **与 `codex_quota_snapshot` 同一条纪律**：只读权威库里的宿主快照，产品读面
/// **不回退扫描 `~/.claude`**——库缺记录就诚实 `None`（宁可不显示，也不现扫）。
///
/// **状态机在这里算完再交给展示层**，`now_secs` 由调用方注入：前端不做时间判断，
/// 否则同一个"现在"在卡片、待处理、通知三处会各算各的，出现自相矛盾的显示。
///
/// 数据边界（真机核对 2026-09-14，42 条 `quotaLimits` 全为 `rejected`）：
/// **没有正向余量这回事**，所以这里只可能给出 `unknown` 或 `exhausted`，
/// 永远不会有"剩余 N%"（spec §8.3.2 明令）。
pub fn claude_quota_status(now_secs: i64) -> Option<serde_json::Value> {
    use agent_vitals_hosts::claude_quota::{window_state, ClaudeQuotaSnapshot, WindowState};
    let db = SqlSummaryRepository::new().open_db()?;
    let (payload, _observed_at_ms) = db.runtime_snapshot_get("claude-code", "claude_quota").ok()??;
    let value: serde_json::Value = serde_json::from_str(&payload).ok()?;
    // 库里的 payload 也当**不可信输入**再校验一遍：半截数据不该让界面显示一个
    // 凭空的"重置时刻"（与 Codex 的 validate_quota_snapshot 同一纪律）。
    let snapshot = ClaudeQuotaSnapshot::from_payload(&value)?;
    let windows_recent = value
        .get("windows_recent")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    Some(match window_state(&snapshot, now_secs) {
        WindowState::Unknown => serde_json::json!({
            "state": "unknown",
            "observed_at": snapshot.observed_at,
            "windows_recent": windows_recent,
            // 「未知」不等于"什么都不知道"：上次那条限流记录的重置时刻是**已知**的
            // （而且走到这个分支时它一定已经过去了）。把它带出来，展示层才能说
            // 「上次限流已于 02:20 重置」——而不是一句干巴巴的"窗口状态未知"。
            "last_resets_at": snapshot.resets_at,
            "last_window": snapshot.rate_limit_type,
        }),
        WindowState::Exhausted { resets_at, window } => serde_json::json!({
            "state": "exhausted",
            "window": window,
            // 人类标签随 DTO 走：卡片、待处理任务、系统通知三处必须叫同一个名字，
            // 而通知那条路径（Tauri）不依赖 hosts crate，只能从这里拿。
            "window_label": agent_vitals_hosts::claude_quota::window_label(window),
            "resets_at": resets_at,
            "observed_at": snapshot.observed_at,
            "windows_recent": windows_recent,
        }),
    })
}

/// 宿主 → 该宿主可能出现的 billing_source 提供方。接线知识（与
/// `WIRED_HOSTS` 同类）：新宿主/新提供方接线时同步维护；漏登记的已声明
/// 订阅会落 `unattributed/<provider>` 条目可见，不会静默消失。
pub(crate) const HOST_PROVIDER_MAP: &[(&str, &[&str])] = &[
    (
        "claude-code",
        &["anthropic", "minimax", "zhipu-glm", "moonshot"],
    ),
    ("codex", &["openai"]),
    ("dsh", &["deepseek-official", "shengsuanyun"]),
    // WorkBuddy：无价卡声明的 provider（三轨请求级不可判，§2.1）——空表是
    // 显式声明「没有可摊订阅的 provider」，不是漏登记。
    ("workbuddy", &[]),
];

