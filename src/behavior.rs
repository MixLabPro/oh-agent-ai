//! 行为审计规则引擎的二进制侧薄封装。
//!
//! 纯计算（规则表、`match_behavior`、`usage::token_by_model`、`behavior_gate`）
//! 住在 `crates/skill-vitals-core`（单一真相源，CLI / Python / wasm 共用）。这里
//! 只留 I/O 入口 `audit_session_log`——它读会话日志文件（`crate::dsh::read_session_log`），
//! 把执行事件喂给 core 的 `match_behavior`、把成本账事件喂给 `token_by_model`。

use std::path::Path;

use serde_json::{json, Value};

pub use skill_vitals_core::behavior::{behavior_gate, match_behavior, rule_outcomes, rule_outcomes_json};

/// 一份会话的行为审计结果：风险 findings + 按模型分桶的 token 报告（两条正交
/// 的审计维度）。成本由 CLI 显示层（`cost.rs`）用 pricing.json 折算。
pub struct Audit {
    pub findings: Vec<Value>,
    pub usage: Value,
    /// 逐请求时间序列（PRD §9.3）。与 `usage` 同源不同分辨率：那边是按模型的
    /// 总数，这边保留每次请求一行。CLI 出报告不再需要经过 DSH 集成。
    pub requests: Value,
    /// 常驻上下文构成（FR-04a）：系统提示词 / 工具定义 / 技能目录的分类估算。
    pub context: Value,
    /// 上下文压缩事件：时间线的 ✂ 标记 + prune 的**宿主实测**被丢弃 token 数。
    /// 与 `context` 的 est_tokens 估算 provenance 不同，展示层须分开标注。
    pub compaction: Value,
    /// FR-04b 结构性浪费：规则可直接判定、不需要历史基线的浪费模式。
    pub waste: Value,
    /// 分叉前（从上游会话 branch 时抄进日志的那段）被排除掉的用量。上面每一项
    /// 都只算分叉之后，金额会显著变小——不把排除量说出来，读的人会以为数据坏了。
    /// **没分叉时是 `Value::Null`，不是全零结构**：「没分叉」与「分叉了但上游
    /// 没花钱」是两回事。
    pub pre_fork: Value,
    /// 本会话派出的子代理（FR-03 时间线的关键事件，也是父子会话的权威链路）。
    /// 子会话头里的 parentSession 不可靠——真实数据里 19 次调用只有 5 个子会话
    /// 指回本会话，其余 14 次是分叉前上游派的（见 subagent.rs 的模块注释）。
    pub subagents: Value,
    /// T11：Skill 执行审计——每次调用的触发方式/加载状态/耗时/位置（PRD §9 契约）。
    /// 与 `subagents` 不同：这是**本会话**内 skill 触发记录，不跨会话合并。
    pub skill: Value,
    /// D11：执行时长审计——`{tool_calls, turns, steps, approvals, hooks}` 五个
    /// 数组（`crates/skill-vitals-core/src/duration.rs` 的五个纯函数）。
    /// `hooks` 是 CLI 独有的一项——浏览器那边的 `durationAudit` 投影**不**收
    /// hook/* 事件（宿主能不能看到 hook 事件还没验证过），但 CLI 直接读盘上
    /// 的原始 JSONL，`hook/*` 本来就在 `EXECUTION_EVENT_TYPES` 里，这里立即
    /// 可用——两条链路的能力边界不同，不是疏漏。
    pub duration: Value,
    /// P3 group①（docs/RUNTIME_EVIDENCE_CONTRACT.md §10）：SV601–610 每条规则
    /// 的三态结果——`findings`（命中了几条）/ `measured_zero`（测了，零命中）/
    /// `unavailable`（这份日志根本没有该规则依赖的信号，不是"测了是零"）。
    /// **新增、只加不改**：`findings` 字段本身的产出逻辑完全没变。
    pub rule_outcomes: Value,
}

/// 读会话日志 → 执行事件 + 成本账事件 → (findings, usage, requests, context, compaction, waste)（端到端入口）。
///
/// 降级时（不可读 / 畸形 / schema 不符，`degraded` 为字符串）返回 `None`，
/// **绝不返回空列表 = 0 条**——空列表只在「读全了但确实 0 条执行事件」时出现。
pub fn audit_session_log(path: &Path) -> Option<Audit> {
    let session = crate::dsh::read_session_log(path);
    if session.get("degraded").and_then(|v| v.as_str()).is_some() {
        return None;
    }
    // P2（docs/RUNTIME_EVIDENCE_CONTRACT.md §17）：先把已经抽好的事件数组
    // 折成 evidence::CanonicalSession + 原始事件的捆绑（core::dsh_evidence），
    // 再反向投影回下面这套老形状——纯粹为了证明新模型不丢任何行为
    // （goldens/differential 必须字节不变）。CanonicalSession 本身这里还
    // 没有消费者，P3 迁移规则读 Signal 之后这个反向投影就删掉。
    let execution_events: Vec<Value> = session
        .get("execution_events")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let usage_events_raw: Vec<Value> = session
        .get("usage_events")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let cwd_raw: Option<String> = session.get("cwd").and_then(|v| v.as_str()).map(str::to_owned);
    let session_id = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();
    let dsh_evidence = skill_vitals_core::dsh_evidence::build_dsh_evidence(
        execution_events, usage_events_raw, cwd_raw, session_id,
    );
    let (events, usage_events, cwd_owned) = skill_vitals_core::dsh_evidence::reverse_project(&dsh_evidence);
    // 工作区根来自 session header 的 cwd；缺失时 None → SV605 退化为纯绝对路径启发式。
    let cwd = cwd_owned.as_deref();
    // 单事件规则（SV601–610）在前、轨迹级检测（SV611–614）追加在后，字节序稳定。
    let mut findings = match_behavior(&events, cwd);
    findings.extend(skill_vitals_core::trajectory::match_trajectory(&events));
    // P3 group①：SV601–610 每条规则的 requires 对着 coverage 一查——但
    // `dsh_evidence.canonical.coverage` 是从**分叉前**的 execution_events 算的
    // （build_dsh_evidence 在 post_fork 过滤之前调用，服务于 compaction/
    // subagent/skill/duration 等本来就该看到完整历史的消费者，不能改）。
    // findings 只算分叉之后（match_behavior 内部会 post_fork）——如果一个
    // signal 的证据全部落在分叉前，直接复用 dsh_evidence 的 coverage 会把
    // 本该 Unavailable 的规则误判成 MeasuredZero。单独用 post_fork 之后的
    // 事件重新算一份 coverage,只喂给 rule_outcomes,不影响 events/
    // dsh_evidence 本身（post_fork 是幂等的，见 util.rs 注释，这里是"只为了
    // 拿 coverage 而已"的第二次调用，不是改变已有语义）。
    let post_fork_events = skill_vitals_core::util::post_fork(&events);
    let post_fork_evidence = skill_vitals_core::dsh_evidence::build_dsh_evidence(
        post_fork_events, Vec::new(), None, String::new(),
    );
    let rule_outcomes_val = rule_outcomes_json(&rule_outcomes(&findings, &post_fork_evidence.canonical.coverage));
    // 三个消费者共用 usage_events（各取所需，不认识的事件类型自然跳过）：
    // token_by_model 按模型分桶、request_metrics 保留逐请求分辨率、
    // context_composition 从 header.system/tools 与 skill-catalog 载体算常驻前缀。
    let usage = skill_vitals_core::usage::token_by_model(&usage_events);
    let requests_val = skill_vitals_core::usage::request_metrics(&usage_events);
    let context = skill_vitals_core::usage::context_composition(&usage_events);
    let compaction = skill_vitals_core::compaction::compaction_events(&events);
    let waste = Value::Array(skill_vitals_core::waste::detect_structural_waste(&events, requests_val.as_array().unwrap_or(&Vec::new())));
    // 分叉前被排除掉的用量。上面每一项都只算分叉之后（post_fork），金额会因此
    // 显著变小；不把排除量说出来，读的人会以为数据坏了。没分叉时是 null。
    let pre_fork = skill_vitals_core::usage::pre_fork_usage(&usage_events);
    let subagents = skill_vitals_core::subagent::subagent_spawns(&events);
    let skill = skill_vitals_core::skill::skill_invocations(&events, requests_val.as_array().unwrap_or(&Vec::new()));
    let duration = json!({
        "tool_calls": skill_vitals_core::duration::tool_call_durations(&events),
        "turns": skill_vitals_core::duration::turn_durations(&events),
        "steps": skill_vitals_core::duration::step_durations(&events),
        "approvals": skill_vitals_core::duration::approval_latencies(&events),
        "hooks": skill_vitals_core::duration::hook_executions(&events),
    });
    Some(Audit {
        findings, usage, requests: requests_val, context, compaction, waste, pre_fork, subagents,
        skill, duration, rule_outcomes: rule_outcomes_val,
    })
}
