//! DSH 会话根发现。
//!
//! 解析 DSH_HOME（env → 缺省 `~/.dsh`，与 `dsh-client/src/host/index.ts`
//! `sessionsRoot()` 同默认），walk `<DSH_HOME>/sessions/**/session.jsonl`，
//! 用 takeover ledger 滤掉已折会话，取 mtime 最新的一条未折会话。
//!
//! **native id 取会话日志头 `{"type":"session","id":...}`**，不是文件名：DSH
//! 落盘名恒为 `session.jsonl`（stem 恒 "session"），文件名没有判别力；日志头
//! 的 `id` 与 agentId 目录名一致（真机实测），但日志头是权威 —— 目录被移动/
//! 复制时仍能正确去重。这正对 §4.3 的碰撞教训：native id 来自 source identity，
//! 不是路径。
//!
//! R2a（§6.3-2）在这之上补三件事，全部「存在性探测、绝不报错」：
//!   · `dsh_session_files` —— population 的目录扫描：枚举
//!     `session.jsonl` / `session.jsonl.zstd`（真机 58/58 是 zstd）；
//!   · `dsh_session_roots_report` —— 与 `codex_session_roots_report` 同级的存在性
//!     报告（sessions 根 + storages/workspace.json 索引层）；
//!   · `parse_workspace_index` / `read_workspace_index` —— 把 `storages/workspace.json`
//!     折成 会话→(工作区路径, 标题) + 归档集（DSH 侧的 `session_index` 等价物，
//!     §4.5），供 `list_sessions` 做标题/归档查询，不扫日志本体。
//!
//! 真实机上的会话几乎全是 `session.jsonl.zstd`（0 个裸 `.jsonl`）—— 本发现器
//! **两种形式都浮出**：裸 `.jsonl` 读日志头取 `id`；`.zstd` 目录以**目录名**作
//! session_id（真机实测与日志头 id 一致；解压读头要付出解码全量的代价，R2a
//! SessionStore population 才是 header-authoritative 的负责方，这里与裸路径
//! 「读不到头退化为目录名」是同一个回退纪律），解压交给 oneline
//! （`read_session_text` 对 `.zstd` 走多帧解压）。`zstd_only` 仍如实数出
//! 「只以 zstd 存在的目录数」，让 tick 能区分裸/zstd 混合，而不是把
//! 「读不了」静默当成「没事做」。

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use crate::agent::takeover as tk_io;
use agent_vitals_core::takeover as tk;

/// 发现结果里的一条未折会话。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DiscoveredSession {
    pub path: PathBuf,
    /// 会话日志头 `id`（解析失败退化为 agentId 目录名）。
    pub session_id: String,
}

/// 一次发现的完整报告 —— 把「读不到的」也如实报出来（缺列不编列）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DiscoveryReport {
    /// `<DSH_HOME>/sessions` 根；DSH_HOME 未设且 HOME 也未知 → None。
    pub sessions_root: Option<PathBuf>,
    /// 找到的裸 `session.jsonl` 数（读得到的候选）。
    pub bare_jsonl: usize,
    /// 只以 `session.jsonl.zstd` 存在的会话目录数（这些也进 `unfolded`，
    /// 经 oneline 的多帧解压折账）。
    pub zstd_only: usize,
    /// 按 mtime **降序**（最新在前）的未折会话（裸 `.jsonl` 与 `.zstd` 两种
    /// 形式都算候选）。
    pub unfolded: Vec<DiscoveredSession>,
}

/// `<DSH_HOME>` 根路径解析（env → `~/.dsh` 缺省）。
pub fn dsh_home() -> Option<PathBuf> {
    if let Some(h) = std::env::var_os("DSH_HOME") {
        return Some(PathBuf::from(h));
    }
    let home = std::env::var_os("HOME")?;
    Some(PathBuf::from(home).join(".dsh"))
}

/// `<DSH_HOME>/sessions` 根路径解析（env → `~/.dsh` 缺省）。
pub fn sessions_root() -> Option<PathBuf> {
    dsh_home().map(|d| d.join("sessions"))
}

/// 枚举 `$DSH_HOME/sessions/**/session.jsonl[.zstd]` —— R2a population 的目录扫描。
/// 全局按路径字符串排序（确定性）；sessions 根缺席 → 空（存在性探测，绝不报错）。
/// 只收 `session.jsonl` / `session.jsonl.zstd` 两个文件名，其它文件不掺进会话集。
pub fn dsh_session_files(dsh_home: &Path) -> Vec<PathBuf> {
    let root = dsh_home.join("sessions");
    if !root.is_dir() {
        return Vec::new();
    }
    let mut files: Vec<PathBuf> = walkdir::WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            let n = e.file_name().to_string_lossy();
            n == "session.jsonl" || n == "session.jsonl.zstd"
        })
        .map(|e| e.into_path())
        .collect();
    files.sort_by(|a, b| a.to_string_lossy().cmp(&b.to_string_lossy()));
    files
}

/// DSH 会话根集合的存在性报告 —— 与 `codex_session_roots_report` 同级：
/// 存在性 + 计数 + 字节量，**绝不报错**（根缺席 → `exists=false` 零填充，不猜
/// 路径、不把缺席当 0 条真数据）。
///
/// 两个根：`sessions/`（会话日志，计数 = `session.jsonl[.zstd]` 文件数）与
/// `storages/`（索引层；R2a 消费其中 `workspace.json` 一个文件，故只数它——
/// 不把 379MB `session_projcache.json` 拖进报告，那只是可删 cache，§4.5）。
///
/// 键序是字节一致的一部分，不能重排：根对象 kind → path → exists →
/// file_count → total_bytes；外层 host → roots。
pub fn dsh_session_roots_report(dsh_home: &Path) -> Value {
    let roots = [
        ("sessions", dsh_home.join("sessions"), dsh_session_files(dsh_home)),
        (
            "storages",
            dsh_home.join("storages"),
            {
                let wp = dsh_home.join("storages").join("workspace.json");
                if wp.is_file() {
                    vec![wp]
                } else {
                    Vec::new()
                }
            },
        ),
    ];
    let mut out = Vec::new();
    for (kind, root, files) in roots {
        // exists = 根目录存在（与 codex 同义：目录级存在性探测）。
        let exists = root.is_dir();
        let mut total_bytes = 0u64;
        for f in &files {
            // 与 codex `_file_bytes` 同款：文件在枚举与 stat 之间消失时按 0 字节
            // 计，不 abort 整个报告；文件仍算进 file_count。
            total_bytes += std::fs::metadata(f).map(|m| m.len()).unwrap_or(0);
        }
        out.push(json!({
            "kind": kind,
            "path": root.to_string_lossy().to_string(),
            "exists": exists,
            "file_count": files.len(),
            "total_bytes": total_bytes,
        }));
    }
    json!({ "host": "dsh", "roots": out })
}

/// workspace.json 折出的会话索引：session id → (工作区路径, 标题)，外加归档集。
#[derive(Debug, Clone, Default)]
pub struct WorkspaceIndex {
    /// session id（= 会话日志头 `id`，`session-<uuid>`）→ (workspace.path, workspace.title)
    pub by_session: HashMap<String, (String, String)>,
    /// 归档 session id 集合（`global.archivedSessionIds`）。
    pub archived: HashSet<String>,
}

/// 解析 `storages/workspace.json` → 会话索引。**只读、宽容、绝不报错**：
/// JSON 解析失败 / `tables.workspaces` 缺位 / 单条 workspace 字段缺 string 值
/// → 该部分跳过，返回能折多少折多少。缺席整个索引 = 空索引（标题是加分项，
/// 不是准入项，同 `parse_session_index` 对 session_index.jsonl 的纪律）。
///
/// 真实形状（实测 2026-08-30）：`tables.workspaces.{wsid}` = `{path, title,
/// sessionIds[], createdAt, updatedAt}`；归档在 `global.archivedSessionIds[]`
/// （**全局**，不在单条 workspace 里）。
pub fn parse_workspace_index(text: &str) -> WorkspaceIndex {
    let mut idx = WorkspaceIndex::default();
    let Ok(doc) = serde_json::from_str::<Value>(text) else {
        return idx;
    };
    // 归档集（全局）。
    if let Some(archived) = doc.get("global").and_then(|g| g.get("archivedSessionIds"))
        .and_then(|v| v.as_array())
    {
        for id in archived {
            if let Some(s) = id.as_str() {
                idx.archived.insert(s.to_string());
            }
        }
    }
    let Some(workspaces) = doc.pointer("/tables/workspaces").and_then(|v| v.as_object())
    else {
        return idx;
    };
    for ws in workspaces.values() {
        let (Some(path), Some(title)) = (
            ws.get("path").and_then(|v| v.as_str()),
            ws.get("title").and_then(|v| v.as_str()),
        ) else {
            continue; // 单条 workspace 畸形 → 跳过，不 abort 整个索引
        };
        let Some(ids) = ws.get("sessionIds").and_then(|v| v.as_array()) else {
            continue;
        };
        for sid in ids {
            if let Some(s) = sid.as_str() {
                idx.by_session
                    .insert(s.to_string(), (path.to_string(), title.to_string()));
            }
        }
    }
    idx
}

/// 读 `$DSH_HOME/storages/workspace.json` → 会话索引。文件缺失/不可读 → 空索引
/// （存在性探测，绝不报错——标题是加分项，不是准入项）。
pub fn read_workspace_index(dsh_home: &Path) -> WorkspaceIndex {
    let wp = dsh_home.join("storages").join("workspace.json");
    let bytes = match std::fs::read(&wp) {
        Ok(b) => b,
        Err(_) => return WorkspaceIndex::default(),
    };
    let text = String::from_utf8_lossy(&bytes);
    parse_workspace_index(&text)
}

/// walk `<root>/**/session.jsonl`（含 `.zstd` 计数），滤 ledger，按 mtime 降序。
pub fn discover() -> DiscoveryReport {
    let Some(root) = sessions_root() else {
        return empty_report(None);
    };
    if !root.is_dir() {
        return empty_report(Some(root));
    }

    let ns = tk_io::machine_namespace();
    let mut bare_jsonl = 0usize;
    let mut candidates: Vec<(SystemTime, DiscoveredSession)> = Vec::new();
    // 两个 set：zstd 目录 / 有裸 jsonl 的目录。**不能**在 walk 里边插边删——
    // 同目录两个文件谁先被 yield 取决于 readdir 顺序，内联 remove 会在
    // insert 之前跑掉（「zstd + 裸」的目录又被数成缺口）。结束时算差集。
    let mut zstd_dirs: std::collections::HashSet<PathBuf> = Default::default();
    let mut bare_dirs: std::collections::HashSet<PathBuf> = Default::default();

    for entry in walkdir::WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let fname = entry.file_name().to_string_lossy();
        if fname == "session.jsonl.zstd" {
            if let Some(parent) = entry.path().parent() {
                zstd_dirs.insert(parent.to_path_buf());
            }
            continue;
        }
        if fname != "session.jsonl" {
            continue;
        }
        bare_jsonl += 1;
        let path = entry.path().to_path_buf();
        let parent = entry.path().parent();
        if let Some(parent) = parent {
            bare_dirs.insert(parent.to_path_buf());
        }
        let session_id = header_id(&path).unwrap_or_else(|| {
            parent
                .and_then(|p| p.file_name())
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| "unknown".to_string())
        });
        let key = tk::session_key("dsh", &session_id, &ns);
        if tk_io::folded_in_ledger(&key) {
            continue; // 已折 —— exactly-once，不重折
        }
        let mtime = std::fs::metadata(&path)
            .and_then(|m| m.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        candidates.push((mtime, DiscoveredSession { path, session_id }));
    }

    // 差集：只有 .zstd、没有可读裸文件的目录 —— **这些也是候选**，经 oneline
    // 的多帧解压折账（真机 59/59 全是这种，R1d tick 折的就是它们）。session_id
    // 取目录名：真机实测目录名 == 日志头 id；为读头去解压全部会话代价太高，
    // header-authoritative 是 R2a SessionStore population（#102）的负责方，这里
    // 与裸路径「读不到头退化为目录名」同一个回退纪律。
    let zstd_only_dirs: Vec<PathBuf> = zstd_dirs
        .iter()
        .filter(|d| !bare_dirs.contains(*d))
        .cloned()
        .collect();
    for dir in &zstd_only_dirs {
        let path = dir.join("session.jsonl.zstd");
        let session_id = dir
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "unknown".to_string());
        let key = tk::session_key("dsh", &session_id, &ns);
        if tk_io::folded_in_ledger(&key) {
            continue; // 已折 —— exactly-once，不重折
        }
        let mtime = std::fs::metadata(&path)
            .and_then(|m| m.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        candidates.push((mtime, DiscoveredSession { path, session_id }));
    }

    candidates.sort_by_key(|(mtime, _)| std::cmp::Reverse(*mtime)); // 最新在前
    let unfolded: Vec<DiscoveredSession> =
        candidates.into_iter().map(|(_, s)| s).collect();

    DiscoveryReport {
        sessions_root: Some(root),
        bare_jsonl,
        zstd_only: zstd_only_dirs.len(),
        unfolded,
    }
}

fn empty_report(root: Option<PathBuf>) -> DiscoveryReport {
    DiscoveryReport {
        sessions_root: root,
        bare_jsonl: 0,
        zstd_only: 0,
        unfolded: Vec::new(),
    }
}

/// 读第一行会话日志头，取 `id`。空/坏 JSON → None（缺列不编列）。
fn header_id(path: &Path) -> Option<String> {
    let f = std::fs::File::open(path).ok()?;
    let mut buf = Vec::new();
    std::io::BufReader::new(f).read_until(b'\n', &mut buf).ok()?;
    let line = String::from_utf8_lossy(&buf);
    let v: serde_json::Value = serde_json::from_str(line.trim()).ok()?;
    v.get("id").and_then(serde_json::Value::as_str).map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Map};
    use std::sync::atomic::{AtomicUsize, Ordering};

    static SEQ: AtomicUsize = AtomicUsize::new(0);

    /// 每个用例一个 pid 键根的独立子目录 —— 换进程重跑不捡上一轮的残留
    /// （`disc-{SEQ}` 每进程从 0 重数，`temp_dir()` 又不清，残留 session.jsonl
    /// 会把 bare_jsonl 数多）。用后 remove_dir_all 收掉。
    fn tmp_case() -> PathBuf {
        let t = std::env::temp_dir().join(format!(
            "av-discovery-{}-case-{}",
            std::process::id(),
            SEQ.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&t);
        t
    }

    /// 环境锁是进程级的（util::ENV_LOCK），不是本模块局部的 —— budget/state/
    /// takeover 的测试也改 AGENT_VITALS_HOME / DSH_HOME，各自一把锁就互相踩踏
    /// （见 util.rs 注释）。`.unwrap_or_else(poison → into_inner)`：断言在锁内
    /// panic 会把锁毒化，这是测试夹具的锁，夹具不该让一个坏断言连坐后续用例。
    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        crate::util::ENV_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner())
    }

    /// 把 AGENT_VITALS_HOME 指到夹具根，Drop 时恢复原值。
    /// discover() 会经 machine_namespace()/folded_in_ledger() 读写 takeover 状态
    /// 目录 —— 不隔离的话测试就摸真机 `~/.agent-vitals`（且沙箱里是只读的）。
    struct TestEnvGuard {
        prev: Option<String>,
    }
    impl TestEnvGuard {
        fn set(home: &Path) -> Self {
            let prev = std::env::var("AGENT_VITALS_HOME").ok();
            std::env::set_var("AGENT_VITALS_HOME", home);
            TestEnvGuard { prev }
        }
    }
    impl Drop for TestEnvGuard {
        fn drop(&mut self) {
            match &self.prev {
                Some(p) => std::env::set_var("AGENT_VITALS_HOME", p),
                None => std::env::remove_var("AGENT_VITALS_HOME"),
            }
        }
    }

    fn set_var(key: &'static str, val: Option<String>) {
        match val {
            Some(v) => std::env::set_var(key, v),
            None => std::env::remove_var(key),
        }
    }

    /// 建一个 `fake` 根：`fake/sessions/<workspace>/<agentId>/session.jsonl`。
    /// 返回 (fake_root, av_home)：DSH_HOME 指 fake_root，AGENT_VITALS_HOME 指
    /// av_home（空 takeover 状态，ledger 里没折过任何 key）。
    fn fake_root(t: &Path) -> (PathBuf, PathBuf) {
        let fake = t.join(format!("dsh-{}", SEQ.fetch_add(1, Ordering::Relaxed)));
        let av = t.join(format!("av-{}", SEQ.fetch_add(1, Ordering::Relaxed)));
        std::fs::create_dir_all(&fake).unwrap();
        std::fs::create_dir_all(&av).unwrap();
        (fake, av)
    }

    /// 写一条 `fake/sessions/<workspace>/<agentId>/session.jsonl`（header 带 id）。
    fn write_session(fake: &Path, workspace: &str, agent_id: &str, header_id: &str) -> PathBuf {
        let dir = fake.join("sessions").join(workspace).join(agent_id);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("session.jsonl");
        std::fs::write(
            &p,
            format!("{{\"type\":\"session\",\"id\":\"{header_id}\"}}\n{{}}\n"),
        )
        .unwrap();
        p
    }

    #[test]
    fn sessions_root_prefers_env_over_home_default() {
        let _env = env_lock();
        set_var("DSH_HOME", Some("/x/dsh".to_string()));
        set_var("HOME", Some("/x/home".to_string()));
        assert_eq!(sessions_root().unwrap(), PathBuf::from("/x/dsh/sessions"));
    }

    #[test]
    fn sessions_root_falls_back_to_home_dsh() {
        let _env = env_lock();
        set_var("DSH_HOME", None);
        set_var("HOME", Some("/x/home".to_string()));
        assert_eq!(
            sessions_root().unwrap(),
            PathBuf::from("/x/home/.dsh/sessions")
        );
    }

    #[test]
    fn discover_returns_empty_when_root_missing() {
        let _env = env_lock();
        set_var("DSH_HOME", Some("/definitely/not/here".to_string()));
        let r = discover();
        assert_eq!(r.bare_jsonl, 0);
        assert_eq!(r.unfolded, vec![]);
        assert!(r.sessions_root.is_some());
    }

    #[test]
    fn discover_finds_headers_and_orders_by_mtime() {
        let _env = env_lock();
        let t = tmp_case();
        let (fake, av) = fake_root(&t);
        let _g = TestEnvGuard::set(&av);
        set_var("DSH_HOME", Some(fake.to_string_lossy().into_owned()));

        // 两条会话：header id 与目录名不同 —— 必须取 header id（source identity）。
        write_session(&fake, "ws", "dir-aaa", "sess-aaa");
        let b = write_session(&fake, "ws", "dir-bbb", "sess-bbb");
        // 让 b 成为最新：重写一遍刷新 mtime（macOS APFS 纳秒粒度，跨秒无碍）。
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(
            &b,
            "{\"type\":\"session\",\"id\":\"sess-bbb\"}\n{}\n",
        )
        .unwrap();

        let r = discover();
        assert_eq!(r.bare_jsonl, 2);
        assert_eq!(r.unfolded.len(), 2);
        // 排序按 mtime 降序：最新（b）在前。
        assert_eq!(r.unfolded[0].session_id, "sess-bbb");
        assert_eq!(r.unfolded[1].session_id, "sess-aaa");
        // 路径是裸 session.jsonl。
        assert_eq!(r.unfolded[0].path.file_name().unwrap(), "session.jsonl");
    }

    #[test]
    fn discover_surfaces_zstd_only_dirs() {
        let _env = env_lock();
        let t = tmp_case();
        let (fake, av) = fake_root(&t);
        let _g = TestEnvGuard::set(&av);
        let d = fake.join("sessions").join("ws").join("sess-z");
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("session.jsonl.zstd"), b"\x28\xb5\x2f\xfd").unwrap();
        set_var("DSH_HOME", Some(fake.to_string_lossy().into_owned()));
        let r = discover();
        assert_eq!(r.bare_jsonl, 0);
        assert_eq!(r.zstd_only, 1);
        // zstd-only 目录也是候选：session_id = 目录名，path 指向 .zstd 文件，
        // 解压交给 oneline（read_session_text 的 `.zstd` 分支）。
        assert_eq!(r.unfolded.len(), 1);
        assert_eq!(r.unfolded[0].session_id, "sess-z");
        assert_eq!(r.unfolded[0].path.file_name().unwrap(), "session.jsonl.zstd");
    }

    #[test]
    fn discover_filters_zstd_only_via_ledger() {
        let _env = env_lock();
        let t = tmp_case();
        let (fake, av) = fake_root(&t);
        let _g = TestEnvGuard::set(&av);
        // 预置一条已折 ledger：sess-old 的 key（目录名作 session_id 的 dedup key）。
        let ns = tk_io::machine_namespace();
        let key = tk::session_key("dsh", "sess-old", &ns);
        let state = av.join("state");
        std::fs::create_dir_all(&state).unwrap();
        let mut entries = Map::new();
        entries.insert(
            key,
            json!({"folded_at": "2026-08-30T00:00:00Z", "session_log": "/fake/old.zstd"}),
        );
        std::fs::write(
            state.join("session-ledger.json"),
            serde_json::to_string(&json!({
                "schema_version": tk::LEDGER_SCHEMA_VERSION,
                "entries": entries,
            }))
            .unwrap(),
        )
        .unwrap();

        for name in ["sess-old", "sess-new"] {
            let d = fake.join("sessions").join("ws").join(name);
            std::fs::create_dir_all(&d).unwrap();
            std::fs::write(d.join("session.jsonl.zstd"), b"\x28\xb5\x2f\xfd").unwrap();
        }
        set_var("DSH_HOME", Some(fake.to_string_lossy().into_owned()));
        let r = discover();
        assert_eq!(r.zstd_only, 2); // 两个都是 zstd-only 目录
        assert_eq!(r.unfolded.len(), 1); // 旧的已折 → 滤掉；只剩新的
        assert_eq!(r.unfolded[0].session_id, "sess-new");
    }

    #[test]
    fn discover_takes_bare_jsonl_when_both_forms_present() {
        let _env = env_lock();
        let t = tmp_case();
        let (fake, av) = fake_root(&t);
        let _g = TestEnvGuard::set(&av);
        let d = fake.join("sessions").join("ws").join("sess-x");
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(
            d.join("session.jsonl"),
            "{\"type\":\"session\",\"id\":\"sess-x\"}\n{}\n",
        )
        .unwrap();
        std::fs::write(d.join("session.jsonl.zstd"), b"\x28\xb5\x2f\xfd").unwrap();
        set_var("DSH_HOME", Some(fake.to_string_lossy().into_owned()));
        let r = discover();
        assert_eq!(r.bare_jsonl, 1);
        // 有裸文件时同目录 zstd 不算 gap（zstd_dirs.remove 掉了）。
        assert_eq!(r.zstd_only, 0);
        assert_eq!(r.unfolded.len(), 1);
        assert_eq!(r.unfolded[0].session_id, "sess-x");
    }

    #[test]
    fn dsh_session_files_enumerates_both_forms_sorted() {
        let _env = env_lock();
        let t = tmp_case();
        let (fake, _av) = fake_root(&t);
        // 两个 workspace 目录 + 两个会话目录；同时放裸 jsonl 与 zstd，外加一个
        // 不相关的 junk 文件（不该进会话集）。
        let s1 = fake.join("sessions").join("--proj-a--").join("session-uuid-1");
        let s2 = fake.join("sessions").join("--proj-b--").join("session-uuid-2");
        let s3 = fake.join("sessions").join("--proj-a--").join("session-uuid-3");
        for (dir, name) in [
            (&s1, "session.jsonl"),
            (&s2, "session.jsonl.zstd"),
            (&s3, "session.jsonl"),
        ] {
            std::fs::create_dir_all(dir).unwrap();
            std::fs::write(dir.join(name), "{}").unwrap();
        }
        std::fs::create_dir_all(&s1).unwrap();
        std::fs::write(s1.join("junk.txt"), "x").unwrap();

        let files = dsh_session_files(&fake);
        assert_eq!(files.len(), 3);
        // 全局按路径字符串排序（确定性）。
        let names: Vec<String> = files
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        let mut sorted = names.clone();
        sorted.sort();
        assert_eq!(names, sorted);
    }

    #[test]
    fn dsh_session_files_absent_root_is_empty() {
        let _env = env_lock();
        let t = tmp_case();
        let (fake, _av) = fake_root(&t);
        assert_eq!(dsh_session_files(&fake), Vec::<PathBuf>::new());
        assert_eq!(dsh_session_files(&fake.join("no-sessions-root")), Vec::<PathBuf>::new());
    }

    #[test]
    fn dsh_session_roots_report_shape_and_bytes() {
        let _env = env_lock();
        let t = tmp_case();
        let (fake, _av) = fake_root(&t);
        let s1 = fake.join("sessions").join("--proj--").join("session-uuid-1");
        std::fs::create_dir_all(&s1).unwrap();
        std::fs::write(
            s1.join("session.jsonl"),
            "{\"type\":\"session\",\"id\":\"session-uuid-1\"}\n{}\n",
        )
        .unwrap();
        // storages/workspace.json
        let storages = fake.join("storages");
        std::fs::create_dir_all(&storages).unwrap();
        std::fs::write(
            storages.join("workspace.json"),
            r#"{"tables":{"workspaces":{}}}"#,
        )
        .unwrap();

        let v = dsh_session_roots_report(&fake);
        assert_eq!(v["host"], json!("dsh"));
        let roots = v["roots"].as_array().unwrap();
        assert_eq!(roots.len(), 2);
        assert_eq!(roots[0]["kind"], json!("sessions"));
        assert_eq!(roots[0]["exists"], json!(true));
        assert_eq!(roots[0]["file_count"], json!(1));
        assert!(roots[0]["total_bytes"].as_u64().unwrap() > 0);
        assert_eq!(roots[1]["kind"], json!("storages"));
        assert_eq!(roots[1]["file_count"], json!(1));
    }

    #[test]
    fn dsh_session_roots_report_absent_roots_zero_fill() {
        let _env = env_lock();
        let t = tmp_case();
        let (fake, _av) = fake_root(&t);
        let v = dsh_session_roots_report(&fake);
        let roots = v["roots"].as_array().unwrap();
        // 根缺席 → exists=false 零填充，不报错。
        assert_eq!(roots[0]["exists"], json!(false));
        assert_eq!(roots[0]["file_count"], json!(0));
        assert_eq!(roots[0]["total_bytes"], json!(0));
        assert_eq!(roots[1]["exists"], json!(false));
    }

    #[test]
    fn parse_workspace_index_full_shape() {
        let text = r#"{
          "unit": {"name": "dsh-storage", "version": 1},
          "global": {"initialized": true, "archivedSessionIds": ["session-old-1", "session-old-2"]},
          "tables": {"workspaces": {
            "w1": {"path": "/Users/a/proj", "title": "proj",
                    "sessionIds": ["session-aaa", "session-bbb"]},
            "w2": {"path": "/Users/a/other", "title": "other",
                    "sessionIds": ["session-ccc"]}
          }}
        }"#;
        let idx = parse_workspace_index(text);
        assert_eq!(idx.by_session.len(), 3);
        assert_eq!(idx.by_session.get("session-aaa").unwrap().0, "/Users/a/proj");
        assert_eq!(idx.by_session.get("session-aaa").unwrap().1, "proj");
        assert_eq!(idx.by_session.get("session-ccc").unwrap().1, "other");
        assert!(idx.archived.contains("session-old-1"));
        assert!(!idx.archived.contains("session-aaa"));
    }

    #[test]
    fn parse_workspace_index_malformed_is_empty_not_error() {
        // 标题是加分项不是准入项：整份 JSON 坏了 → 空索引，绝不 abort。
        let idx = parse_workspace_index("not json at all");
        assert!(idx.by_session.is_empty());
        assert!(idx.archived.is_empty());
        let idx = parse_workspace_index("{\"tables\":{\"workspaces\":\"not an object\"}}");
        assert!(idx.by_session.is_empty());
    }

    #[test]
    fn parse_workspace_index_skips_single_bad_workspace_row() {
        // 一条 workspace 缺 title / sessionIds → 跳过它，别条照常进。
        let text = r#"{
          "global": {"archivedSessionIds": []},
          "tables": {"workspaces": {
            "bad": {"path": "/x", "sessionIds": ["session-bad"]},
            "good": {"path": "/y", "title": "good", "sessionIds": ["session-good"]}
          }}
        }"#;
        let idx = parse_workspace_index(text);
        assert_eq!(idx.by_session.len(), 1);
        assert!(idx.by_session.contains_key("session-good"));
        assert!(!idx.by_session.contains_key("session-bad"));
    }

    #[test]
    fn read_workspace_index_missing_is_empty() {
        let _env = env_lock();
        let t = tmp_case();
        let (fake, _av) = fake_root(&t);
        let idx = read_workspace_index(&fake);
        assert!(idx.by_session.is_empty());
    }

    #[test]
    fn discover_filters_already_folded_via_ledger() {
        let _env = env_lock();
        let t = tmp_case();
        let (fake, av) = fake_root(&t);
        let _g = TestEnvGuard::set(&av);
        // 预置一条已折的 ledger 记录：session-ledger.json 的 `entries` 里记
        // sess-old 的 key（形状与 core `ledger_record` 产出一致）。
        let ns = tk_io::machine_namespace();
        let key = tk::session_key("dsh", "sess-old", &ns);
        let state = av.join("state");
        std::fs::create_dir_all(&state).unwrap();
        let mut entries = Map::new();
        entries.insert(
            key,
            json!({"folded_at": "2026-08-30T00:00:00Z", "session_log": "/fake/old.jsonl"}),
        );
        std::fs::write(
            state.join("session-ledger.json"),
            serde_json::to_string(&json!({
                "schema_version": tk::LEDGER_SCHEMA_VERSION,
                "entries": entries,
            }))
            .unwrap(),
        )
        .unwrap();

        write_session(&fake, "ws", "dir-old", "sess-old");
        write_session(&fake, "ws", "dir-new", "sess-new");
        set_var("DSH_HOME", Some(fake.to_string_lossy().into_owned()));

        let r = discover();
        // 旧的已折 → 滤掉；只剩新的一条。
        assert_eq!(r.bare_jsonl, 2); // 找到 2 条，滤掉 1 条
        assert_eq!(r.unfolded.len(), 1);
        assert_eq!(r.unfolded[0].session_id, "sess-new");
    }
}
