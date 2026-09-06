//! 一次性手工对账脚本（不是 CLI 面、不进测试套件）：在**这台真机**上跑
//! `JsonSummaryRepository` vs `SqlSummaryRepository`，逐宿主比较当月/今日
//! 的金额、token、新鲜度——这是 v0.9.1 Phase 3「读路径切换前必须先对账」
//! 的手工验证落点（用户 2026-09-06 明确要求："必须做一次本机真实数据迁移
//! 与校验"）。跑法：
//!   cargo run --release -p agent-vitals-runtime --example reconcile_real
//!
//! 用完即可删——真正的机器可读对账报告是 spec Phase 4.1 的独立交付物，
//! 这里只是拿真实数据给 Phase 3.1 的实现做一次高置信度的手工验收。

use agent_vitals_data::repository::{DailySummaryQuery, MonthlySummaryQuery, SummaryRepository};
use agent_vitals_runtime::summary::{JsonSummaryRepository, SqlSummaryRepository};

fn amounts_line(label: &str, h: &agent_vitals_data::projection::HostAmount) -> String {
    format!(
        "    {label:12} freshness={:?} currency={:?} unresolved={} amounts={:?}",
        h.freshness.state, h.currency, h.has_unresolved, h.amounts_by_basis
    )
}

fn main() {
    let month = agent_vitals_runtime::clock::current_month_beijing();
    let today = agent_vitals_runtime::clock::today_beijing();
    println!("== month={month} today={today} ==");

    let json_repo = JsonSummaryRepository;
    let sql_repo = SqlSummaryRepository;

    println!("\n--- monthly_summary({month}) ---");
    let jm = json_repo.monthly_summary(&MonthlySummaryQuery { month: month.clone() });
    let sm = sql_repo.monthly_summary(&MonthlySummaryQuery { month: month.clone() });
    println!("  contract_violations: json={:?} sql={:?}", jm.contract_violations(), sm.contract_violations());
    println!("  total_summable: json={:.4} sql={:.4} diff={:.6}", jm.total_summable(), sm.total_summable(), jm.total_summable() - sm.total_summable());
    println!("  total_actual_spend: json={:?} sql={:?}", jm.total_actual_spend(), sm.total_actual_spend());
    for host in ["dsh", "codex", "claude-code"] {
        println!("  by_host[{host}]:");
        println!("{}", amounts_line("json", &jm.by_host[host]));
        println!("{}", amounts_line("sql ", &sm.by_host[host]));
        let jt = &jm.tokens_by_host[host];
        let st = &sm.tokens_by_host[host];
        println!(
            "    tokens       json.total={} sql.total={} diff={} (u={}/{} cr={}/{} cw={}/{} o={}/{})",
            jt.total, st.total, jt.total - st.total,
            jt.uncached_input, st.uncached_input,
            jt.cache_read, st.cache_read,
            jt.cache_write, st.cache_write,
            jt.output, st.output,
        );
    }
    println!("  by_provider keys: json={:?}", jm.by_provider.keys().collect::<Vec<_>>());
    println!("  by_provider keys: sql ={:?}", sm.by_provider.keys().collect::<Vec<_>>());
    for key in jm.by_provider.keys() {
        if let Some(s) = sm.by_provider.get(key) {
            let j = &jm.by_provider[key];
            if j.amounts_by_basis != s.amounts_by_basis {
                println!("  !! by_provider[{key}] MISMATCH");
                println!("{}", amounts_line("json", j));
                println!("{}", amounts_line("sql ", s));
            }
        } else {
            println!("  !! by_provider[{key}] missing from sql side");
        }
    }

    println!("\n--- daily_summary({today}) ---");
    let jd = json_repo.daily_summary(&DailySummaryQuery { date: today.clone() });
    let sd = sql_repo.daily_summary(&DailySummaryQuery { date: today.clone() });
    println!("  contract_violations: json={:?} sql={:?}", jd.contract_violations(), sd.contract_violations());
    println!("  total_summable: json={:.4} sql={:.4}", jd.total_summable(), sd.total_summable());
    for host in ["dsh", "codex", "claude-code"] {
        println!("  by_host[{host}]:");
        println!("{}", amounts_line("json", &jd.by_host[host]));
        println!("{}", amounts_line("sql ", &sd.by_host[host]));
        let jt = &jd.tokens_by_host[host];
        let st = &sd.tokens_by_host[host];
        println!("    tokens       json.total={} sql.total={} diff={}", jt.total, st.total, jt.total - st.total);
    }
}
