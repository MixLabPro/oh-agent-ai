//! v0.6 host-contract spec §5.1bis/§8 G9：能力**声明**（core
//! `host_capability::HOSTS` 行）与**实现存在性**分居两侧——core 不依赖任何
//! 文件系统实现；二进制才知道自己真正接了哪些构造器/命令入口。本文件是
//! `agent-vitals` CLI 这一侧的 `HostRuntimeRegistration`：host_id → 该宿主
//! 在**这个二进制里**的能力实现是否存在。
//!
//! 守卫断言 `required_capabilities(surface) ⊆ registrations(surface)`——不
//! 要求每个二进制实现全部能力，一个二进制不消费某项能力时不要求注册
//! （R2 修订 3：避免把 CLI 与 Tauri 强制做成同构产品）。本轮只登记
//! `cli.sessions` 一个 surface（`session_store` 维度，即
//! `r2a_store.rs::SessionStore::<host>` 构造器是否存在）；`fold` 维度与
//! `tauri.*` surfaces（tauri.sessions/tauri.menubar-cost）留后续——`fold`
//! 在这个二进制里不是单一构造器，是每个子命令各自的折叠路径（dsh state
//! 链 / codex 全量 rollout / claude ledger），登记它需要先决定登记的粒度
//! 是"函数入口"还是"子命令"，属于设计问题、不是照抄这份文件的体力活。
//!
//! **暂无 CLI 表面**（`#[allow(dead_code)]`，仅本文件的单测消费）：这张表是
//! 二进制内部的声明，不进 `hosts --json`——那份 JSON 是 G1 跨语言
//! byte-parity 的对象（人读格式同样被 `test_hosts_human_format_byte_parity`
//! 差分锁死），塞进任何 Rust-only 的东西都会当场撞红。等专门给
//! `HostRuntimeRegistration` 开一个诊断表面时再摘掉这个 allow。

#![allow(dead_code)]

/// 一个宿主在**本二进制**里实际接线的运行时能力。只声明存在性，不声明
/// 实现细节（构造器函数本身仍是各自模块的普通 pub 函数，这里不做函数
/// 指针表——core 行已经说明"哪些宿主该有 session_store"，本表只答"这个
/// 二进制是否真接了"）。
pub struct HostRuntimeRegistration {
    pub host_id: &'static str,
    /// `r2a_store.rs::SessionStore::<host>` 构造器是否存在。
    pub session_store: bool,
}

/// `agent-vitals` CLI 二进制的注册集，顺序同 `host_capability::HOSTS`。
pub static CLI_REGISTRATIONS: &[HostRuntimeRegistration] = &[
    HostRuntimeRegistration { host_id: "dsh", session_store: true },
    HostRuntimeRegistration { host_id: "codex", session_store: true },
    HostRuntimeRegistration { host_id: "claude-code", session_store: true },
    // WorkBuddy：`SessionStore::all`/`sessions_list` 对未知宿主返回
    // `StoreError`（envelope 未知宿主，v0.6 spec §4）——没有 `SessionStore::
    // workbuddy` 构造器，如实登记 false，不是遗漏。
    HostRuntimeRegistration { host_id: "workbuddy", session_store: false },
];

/// `cli.sessions` surface 需要的能力——从 core `HOSTS` 行的 `session_store`
/// 字段派生（哪些宿主"应该"有 store，是声明层的事）。
pub fn required_for_cli_sessions() -> Vec<&'static str> {
    agent_vitals_core::host_capability::HOSTS
        .iter()
        .filter(|h| h.session_store)
        .map(|h| h.id)
        .collect()
}

/// `cli.sessions` surface 实际注册了的宿主（这个二进制"真的接了"，是实现层
/// 的事）。
pub fn registered_for_cli_sessions() -> Vec<&'static str> {
    CLI_REGISTRATIONS
        .iter()
        .filter(|r| r.session_store)
        .map(|r| r.host_id)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    #[test]
    fn required_capabilities_for_cli_sessions_is_a_subset_of_registrations() {
        let required: BTreeSet<&str> = required_for_cli_sessions().into_iter().collect();
        let registered: BTreeSet<&str> = registered_for_cli_sessions().into_iter().collect();
        assert!(
            required.is_subset(&registered),
            "cli.sessions 需要 {required:?}，但只注册了 {registered:?}——\
             有宿主声明了 session_store 却没有对应的 SessionStore 构造器"
        );
    }

    #[test]
    fn registration_ids_are_exactly_the_four_runtime_hosts() {
        let mut ids: Vec<&str> = CLI_REGISTRATIONS.iter().map(|r| r.host_id).collect();
        ids.sort_unstable();
        assert_eq!(ids, vec!["claude-code", "codex", "dsh", "workbuddy"]);
    }

    #[test]
    fn workbuddy_has_no_session_store_registration() {
        let wb = CLI_REGISTRATIONS.iter().find(|r| r.host_id == "workbuddy").unwrap();
        assert!(!wb.session_store, "WorkBuddy 无 SessionStore（envelope 未知宿主 → StoreError）");
    }
}
