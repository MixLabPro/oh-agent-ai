//! `agent-vitals-runtime` —— Agent Vitals 的**非宿主**本机机器（arch v3.1 §4.2）。
//!
//! 装：唯一 `HomeResolver`（`home`）、state store / ledger、Skill/Session service
//! 编排（把 `hosts::<h>::sources` 产出交给 `hosts::<h>::sessions` / `domain`）。
//! **不装**规则计算（那是 `agent-vitals-domain`）、不装宿主 wire 解释（那是
//! `agent-vitals-hosts`）。
//!
//! v0.8 Phase D7 先落 `home`（`data_home` / `snapshot_dir` / `DSH_HOME` 解析从
//! 二进制收敛进来）；D6 迁 `state` / `takeover` / `r2a_store` / `discovery`。

pub mod home;
