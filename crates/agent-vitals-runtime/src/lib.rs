//! `agent-vitals-runtime` —— Agent Vitals 的**非宿主**本机机器（arch v3.1 §4.2）。
//!
//! 装：唯一 `HomeResolver`（`home`）、读时钟的日期 helper（`clock`）、state store /
//! ledger（`state` / `budget` / `takeover`）、Skill/Session service 编排
//! （`session_sources`——把 `hosts::<h>::sources` 产出交给 `hosts::<h>::sessions` /
//! `domain`）。**不装**规则计算（`agent-vitals-domain`）、不装宿主 wire 解释
//! （`agent-vitals-hosts`）。
//!
//! v0.8：D7 落 `home`；D6 迁 `clock` / `state` / `budget` / `takeover` /
//! `session_sources`（`r2a_store` / `discovery` 随 Phase E 的 apps/cli 抽出一起，
//! 它们与 CLI 成本/审计 handler 交织）。

pub mod budget;
pub mod clock;
pub mod home;
pub mod session_sources;
pub mod state;
pub mod takeover;

/// 进程级环境变量锁 —— `state` / `budget` / `takeover` 的 `#[cfg(test)]` 改
/// `AGENT_VITALS_HOME` 等进程 env，必须串行（模块各自造局部锁只能串行本模块，
/// 跨模块并行还是踩）。二进制侧 `src/util.rs` 有一份同款给留在 binary 的
/// `discovery` / `r2a_store` 测试用——两个 test 进程各自独立，不共享。
#[doc(hidden)]
pub static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
