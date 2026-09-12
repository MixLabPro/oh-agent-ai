//! `agent-vitals-runtime` —— Agent Vitals 的**非宿主**本机机器（arch v3.1 §4.2）。
//!
//! 装：唯一 `HomeResolver`（`home`）、读时钟的日期 helper（`clock`）、state store /
//! ledger（`state` / `budget` / `takeover`）、Skill/Session service 编排
//! （`session_sources`——把 `hosts::<h>::sources` 产出交给 `hosts::<h>::sessions` /
//! `domain`）。**不装**规则计算（`agent-vitals-domain`）、不装宿主 wire 解释
//! （`agent-vitals-hosts`）。
//!
//! v0.8：D7 落 `home`；D6 迁 `clock` / `state` / `budget` / `takeover` /
//! `session_sources`；E7.4 迁 `skills::snapshot`（Skill Surface 的本机快照
//! 读写——本机 fs 状态，与 `state`/`budget`/`takeover` 同类，是 runtime 的
//! 天然归属，不是 hosts 的 sources/，因为它不认识任何宿主）。
//!
//! v0.9 Stage 0.3：`sessions`（`docs/AGENT_VITALS_V0_9_STAGE0_RESEARCH.md`
//! §6）——`r2a_store` 的 6 文件依赖闭包（`SessionStore` 缓存/checkpoint、
//! codex 成本折叠、codex 会话审计、DSH discovery、behavior I/O 入口、claude
//! ledger 读取）逐文件从 `apps/cli` 搬进来，落 spec §5.2"CLI 不再拥有宿主
//! wire 解释或事实写入"的门槛。
//!
//! v0.9 Stage 0.4：`summary`——`agent-vitals-data::repository::
//! SummaryRepository` 的 Stage 0 实现（`docs/AGENT_VITALS_V0_9_STAGE0_
//! RESEARCH.md` §8）。这是本 crate**新增依赖 `agent-vitals-data`**的唯一
//! 理由：spec §3.1 的依赖表把 `agent-vitals-data` 限定在只依赖 domain，够
//! 不到这里的 `sessions`/`budget`/`state`，trait 的实现只能落在这个既认识
//! hosts 又认识 data 的层。

pub mod budget;
pub mod clock;
pub mod home;
pub mod export;
pub mod ingest_service;
pub mod lease;
pub mod mcp;
pub mod money;
pub mod reimport_verify;
pub mod retention;
pub mod session_sources;
pub mod sessions;
pub mod skills;
pub mod sql_authority;
pub mod state;
pub mod summary;
pub mod trace_service;
pub mod sql_sync;
pub mod sync_service;
pub mod takeover;

/// 进程级环境变量锁 —— `state` / `budget` / `takeover` / `summary` 的
/// `#[cfg(test)]` 改 `AGENT_VITALS_HOME` 等进程 env，必须串行（模块各自造
/// 局部锁只能串行本模块，跨模块并行还是踩）。
#[doc(hidden)]
pub static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
