//! 会话宿主注册表（W3 第 1 步，docs/ARCHITECTURE_OPTIMIZATION_GUIDE.md）。
//!
//! 为什么要这张表：此前 runtime 在三处各写一遍「按宿主字符串分支」——同步的内置根
//! 发现、自定义源根发现、findings 评估——每处都直接点名 `claude_project_files_with_errors`
//! / `codex_rollout_files_with_errors` / …。宿主的「根在哪、根下怎么枚举、会话怎么评估」
//! 是宿主适配知识，应该和宿主的 wire 解析住在一起；runtime 只遍历这张表。接一个新宿主
//! = 在这里加一行 + 在 `hosts/<h>/sources/` 写实现，runtime 不动。
//!
//! 本 crate 不读环境变量、不读时钟：根目录的解析（`HOME` / `USERPROFILE` / `DSH_HOME`）
//! 由调用方做好放进 [`HostRoots`]，价卡（含用户覆盖）由调用方放进 [`FindingsCtx`]。
//!
//! **顺序即契约**：[`SESSION_HOSTS`] 的顺序就是同步批次的处理顺序（与既有
//! `claude-code → codex → dsh → workbuddy` 一致，同步报告里 `hosts[]` 的顺序随之不变）。

use std::path::{Path, PathBuf};

use agent_vitals_domain::findings::FindingRef;
use serde_json::Value;

/// 调用方解析好的根目录。`user_home` 是 `HOME`（→ `USERPROFILE`）；`dsh_home` 是
/// `DSH_HOME`（→ `~/.dsh`），两者都未知时为 `None`。
#[derive(Debug, Clone, Copy)]
pub struct HostRoots<'a> {
    pub user_home: &'a Path,
    pub dsh_home: Option<&'a Path>,
}

/// Concrete usage directories protected from a second manifest identity.
/// Unlike default_root (an adapter argument), these delimit actual input scope.
pub fn usage_source_roots(roots: &HostRoots<'_>) -> Vec<(&'static str, PathBuf)> {
    let mut scopes = vec![
        ("claude-code", roots.user_home.join(".claude/projects")),
        ("codex", roots.user_home.join(".codex/sessions")),
        ("codex", roots.user_home.join(".codex/archived_sessions")),
        ("workbuddy", crate::workbuddy_session::workbuddy_root(roots.user_home)),
    ];
    if let Some(home) = roots.dsh_home { scopes.push(("dsh", home.join("sessions"))); }
    scopes
}

/// findings 评估的上下文。`codex_index_cache` 是 Codex「路径 → session_id」索引的缓存
/// 文件（调用方决定放哪，runtime 放 `<data_home>/facts/.codex-session-index.json`）。
pub struct FindingsCtx<'a> {
    pub roots: HostRoots<'a>,
    pub codex_index_cache: &'a Path,
    pub pricing: &'a Value,
}

/// 一个会话本轮观察到的全部 findings（空 vec = 评估成功且零命中，会关闭旧 issue）。
#[derive(Debug, Clone)]
pub struct SessionFindings {
    pub host: &'static str,
    pub native_id: String,
    pub findings: Vec<FindingRef>,
}

/// `(ctx, 本轮变化的文件, 本轮发现的全部文件) → (评估成功的会话, 逐文件错误)`。
/// 读失败的会话不进结果——没观察到 ≠ 观察到已消失，调用方据此不关它的旧 issue。
pub type FindingsFn =
    fn(&FindingsCtx<'_>, &[PathBuf], &[PathBuf]) -> (Vec<SessionFindings>, Vec<String>);

pub struct SessionHost {
    /// 宿主 id，与 UsageFact 的 `host` stamp、`FACT_HOSTS` 同一封闭词表。
    pub id: &'static str,
    /// 内置根。`None` = 本机没法定位该宿主根（不是错误，枚举为空）。
    pub default_root: fn(&HostRoots<'_>) -> Option<PathBuf>,
    /// 在一个根下枚举会话源文件（清单 + 遍历错误）。内置根与自定义源根走同一个函数。
    pub files_under: fn(&Path) -> (Vec<PathBuf>, Vec<String>),
    /// 是否接受用户登记的自定义源根（`custom_sources`）。
    pub accepts_custom_roots: bool,
    /// 会话级行为 findings（SV6xx）。`None` = 该宿主没有会话级产出。
    pub findings: Option<FindingsFn>,
    /// 下钻（trace）：在内置根下定位某个 native id 的源文件。空 = 源已不在（调用方报
    /// SourceUnavailable，不猜）。路径只在进程内用，不进任何 JSON 出口。
    pub session_sources: fn(&HostRoots<'_>, &str) -> Vec<PathBuf>,
}

fn user_home_root(roots: &HostRoots<'_>) -> Option<PathBuf> {
    Some(roots.user_home.to_path_buf())
}

fn dsh_root(roots: &HostRoots<'_>) -> Option<PathBuf> {
    roots.dsh_home.map(Path::to_path_buf)
}

fn workbuddy_root(roots: &HostRoots<'_>) -> Option<PathBuf> {
    Some(crate::workbuddy_session::workbuddy_root(roots.user_home))
}

fn claude_session_sources(roots: &HostRoots<'_>, native_id: &str) -> Vec<PathBuf> {
    crate::claude_session::claude_project_files(roots.user_home)
        .into_iter()
        .filter(|path| path.file_stem().and_then(|s| s.to_str()) == Some(native_id))
        .collect()
}

/// 按内容 session_id 过滤（resume 会开新文件名的 rollout，文件名不可信，见
/// `codex/sources/findings.rs`）。下钻是单次用户动作，全量解析可以接受。
fn codex_session_sources(roots: &HostRoots<'_>, native_id: &str) -> Vec<PathBuf> {
    crate::codex_session::codex_rollout_files(roots.user_home)
        .into_iter()
        .filter(|path| crate::codex_session::session_audit::codex_session_id_of(path) == native_id)
        .collect()
}

fn dsh_session_sources(roots: &HostRoots<'_>, native_id: &str) -> Vec<PathBuf> {
    let Some(dsh_home) = roots.dsh_home else { return Vec::new() };
    crate::dsh_sources::discovery::dsh_session_files(dsh_home)
        .into_iter()
        .filter(|path| {
            crate::canonical_input::dsh_native_session_id_for_path(path).ok().as_deref() == Some(native_id)
        })
        .collect()
}

/// WorkBuddy（E4b）：源是整个 `<HOME>/.workbuddy/` 根（db + audit-log + traces 三面按
/// session_id join），不是单个文件——返回 HOME，`canonical_input` 的 workbuddy 分派按
/// 这个约定解析根。根目录不存在 → 空。
fn workbuddy_session_sources(roots: &HostRoots<'_>, _native_id: &str) -> Vec<PathBuf> {
    if crate::workbuddy_session::workbuddy_root(roots.user_home).is_dir() {
        vec![roots.user_home.to_path_buf()]
    } else {
        Vec::new()
    }
}

/// 会话宿主注册表（顺序即同步批次顺序，见模块文档）。
pub static SESSION_HOSTS: [SessionHost; 4] = [
    SessionHost {
        id: "claude-code",
        default_root: user_home_root,
        files_under: crate::claude_session::claude_project_files_with_errors,
        accepts_custom_roots: true,
        findings: Some(crate::hosts::claude_code::sources::findings::evaluate),
        session_sources: claude_session_sources,
    },
    SessionHost {
        id: "codex",
        default_root: user_home_root,
        files_under: crate::codex_session::codex_rollout_files_with_errors,
        accepts_custom_roots: true,
        findings: Some(crate::hosts::codex::sources::findings::evaluate),
        session_sources: codex_session_sources,
    },
    SessionHost {
        id: "dsh",
        default_root: dsh_root,
        files_under: crate::dsh_sources::discovery::dsh_session_files_with_errors,
        accepts_custom_roots: true,
        findings: Some(crate::hosts::dsh::sources::findings::evaluate),
        session_sources: dsh_session_sources,
    },
    SessionHost {
        id: "workbuddy",
        default_root: workbuddy_root,
        files_under: crate::workbuddy_traces::workbuddy_trace_files_with_errors,
        accepts_custom_roots: false,
        findings: None,
        session_sources: workbuddy_session_sources,
    },
];

pub fn session_host(id: &str) -> Option<&'static SessionHost> {
    SESSION_HOSTS.iter().find(|host| host.id == id)
}

/// 「哪个字段带 findings」的单一权威（原 r2a `findings_for`，W8 起在 runtime 的
/// findings_eval，W3 随评估器搬来）。DSH 载荷是 behavior 20 键形状 → `findings`；
/// Codex / Claude 载荷 → `audit.findings`。两者皆无 → 空 vec（诚实零命中，不是错误）。
pub fn findings_from_payload(host: &str, payload: &Value) -> Vec<FindingRef> {
    let arr = if host == "dsh" {
        payload.get("findings").and_then(Value::as_array)
    } else {
        payload.pointer("/audit/findings").and_then(Value::as_array)
    };
    let Some(arr) = arr else { return Vec::new() };
    let text = |f: &Value, k: &str| f.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    arr.iter()
        .map(|f| FindingRef {
            rule: text(f, "rule"),
            severity: text(f, "severity"),
            category: text(f, "category"),
            tool_name: f.get("tool_name").and_then(Value::as_str).map(str::to_owned),
            evidence: f.get("evidence").and_then(Value::as_str).map(str::to_owned),
            time: f.get("time").and_then(Value::as_i64),
            seq: f.get("seq").and_then(Value::as_u64),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// 原 r2a `findings_for_reads_the_right_field_per_host`，随谓词搬来。
    #[test]
    fn findings_from_payload_reads_the_right_field_per_host() {
        let dsh = json!({"findings": [{"rule": "SV601", "severity": "critical", "category": "shell",
            "tool_name": "bash", "evidence": "rm -rf /", "time": 100, "seq": 1}]});
        let codex = json!({"audit": {"findings": [{"rule": "SV610", "severity": "warning",
            "category": "approval", "tool_name": null, "evidence": "danger-full-access", "seq": 2}]}});
        let d = findings_from_payload("dsh", &dsh);
        assert_eq!((d.len(), d[0].rule.as_str(), d[0].time), (1, "SV601", Some(100)));
        let c = findings_from_payload("codex", &codex);
        assert_eq!((c.len(), c[0].rule.as_str(), c[0].tool_name.clone()), (1, "SV610", None));
        // 字段错位（DSH 形状喂 codex）→ 诚实零命中，不是错误。
        assert!(findings_from_payload("codex", &dsh).is_empty());
    }

    /// 顺序即同步批次顺序；宿主集合与事实宿主封闭词表一致。
    #[test]
    fn registry_order_and_membership_are_the_fact_host_vocabulary() {
        let ids: Vec<&str> = SESSION_HOSTS.iter().map(|h| h.id).collect();
        assert_eq!(ids, ["claude-code", "codex", "dsh", "workbuddy"]);
        let with_findings: Vec<&str> =
            SESSION_HOSTS.iter().filter(|h| h.findings.is_some()).map(|h| h.id).collect();
        assert_eq!(with_findings, ["claude-code", "codex", "dsh"]);
        assert!(session_host("dsh").is_some());
        assert!(session_host("nope").is_none());
    }

    #[test]
    fn default_roots_follow_the_existing_conventions() {
        let home = Path::new("/h");
        let with_dsh = HostRoots { user_home: home, dsh_home: Some(Path::new("/d")) };
        let no_dsh = HostRoots { user_home: home, dsh_home: None };
        let root = |id: &str, r: &HostRoots<'_>| (session_host(id).unwrap().default_root)(r);
        assert_eq!(root("claude-code", &with_dsh), Some(PathBuf::from("/h")));
        assert_eq!(root("codex", &with_dsh), Some(PathBuf::from("/h")));
        assert_eq!(root("dsh", &with_dsh), Some(PathBuf::from("/d")));
        assert_eq!(root("dsh", &no_dsh), None, "DSH 根未知 → 枚举为空，不是错误");
        assert_eq!(root("workbuddy", &with_dsh), Some(PathBuf::from("/h/.workbuddy")));
    }
}
