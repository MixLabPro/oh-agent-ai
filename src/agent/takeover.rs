//! 接管协议的 **I/O + fold 驱动**（R1d，§4.2/§4.3 最小可测子集）。
//!
//! 纯规则在 core（`agent_vitals_core::takeover`）：session key、ledger
//! folded/record、manifest owner_allows/cutover/mark_fold。这里只做：
//!
//!   · `writer-manifest.json` / `session-ledger.json` / `machine.json` 的读写
//!     （全部原子写，复用 `agent::state` 的 `atomic_write_json`）；
//!   · `fold_session` —— 把一次会话审计的产物（fold-req）按 §4.3 语义折进
//!     状态文件：**fencing → dedup → fold → ledger 记 → manifest 提交**；
//!   · `takeover` / `machine_namespace` 的 CLI 入口。
//!
//! fold-req 的 JSON 形状（生产者/测试喂，字段缺了就不写那个文件，与 R1c
//! 的「读不到就不写」同纪律）：
//!
//! ```json
//! {
//!   "session_id": "s1",              // 必填：native id（§4.3 由生产者派生）
//!   "session_log": "/logs/s1.jsonl", // 仅身份参考，不读内容
//!   "host_kind": "dsh",              // 缺省 "cli"
//!   "machine_namespace": "ns-…",     // 必填：SessionKey 三要素之一（持久化
//!                                    //   见 `machine_namespace()`，tick 负责取）
//!   "oneline": {…},                  // write_oneline + append_session_history
//!   "hour_buckets": {…},             // merge_today（今天切片）+ merge_month
//!   "by_model_today": {…} | null,
//!   "by_date_model": {…} | null,
//!   "alert": {…} | null              // 可选 write_alert
//! }
//! ```
//!
//! 写序是「**state 文件先折 → ledger 记 key → manifest 提交**」：manifest 是提交
//! 点，ledger 是去重依据。崩溃窗口（state 文件已写、ledger 未记 → 下个 tick 重折
//! 翻倍）是 §4.2 约束 6 的 generation-manifest 协议（R1e/R3）才收口的事，R1d
//! 的最小子集先保证「无崩溃的连续多 tick」不重复累加（§4.2 验收 fixture）。

use std::io::Read;
use std::path::PathBuf;

use serde_json::{json, Value};

use crate::skills::snapshot::data_home;

use agent_vitals_core::takeover as tk;

use super::state::{atomic_write_json, now_iso_utc, read_json, state_dir};

/// fold 一次会话的结果。
#[derive(Debug, PartialEq, Eq)]
pub enum FoldOutcome {
    /// 首次见这条会话，状态文件已折、ledger 已记。
    Folded,
    /// 这条会话已经折过（同 key 在 ledger 里）—— 这次 tick 什么都不写。
    SkippedAlreadyFolded,
}

/// `writer-manifest.json` 路径（state 目录内）。
fn manifest_path() -> PathBuf {
    state_dir().join("writer-manifest.json")
}

/// `session-ledger.json` 路径（state 目录内）。
fn ledger_path() -> PathBuf {
    state_dir().join("session-ledger.json")
}

/// `machine.json` 路径 —— 在**数据根**下、state 目录之外：它是 app 自有
/// config（§4.3 说 machine namespace 持久在 app 自有 config），不是权威
/// 状态文件。
fn machine_path() -> PathBuf {
    data_home().join("machine.json")
}

/// 读 manifest；缺文件 / 坏 JSON → 默认（owner=python、epoch=0）。
fn read_manifest() -> Value {
    read_json(&manifest_path()).unwrap_or_else(tk::default_manifest)
}

/// 读 ledger；缺文件 / 坏 JSON → 空 ledger。
fn read_ledger() -> Value {
    read_json(&ledger_path()).unwrap_or_else(tk::empty_ledger)
}

fn write_manifest(v: &Value) {
    atomic_write_json(&manifest_path(), v);
}

fn write_ledger(v: &Value) {
    atomic_write_json(&ledger_path(), v);
}

/// 本机命名空间（SessionKey 三要素之一）。读 `machine.json`；缺了就从
/// `/dev/urandom` 抽 16 字节造一个并持久化。
///
/// §4.3 为什么不能 hash 用户名/路径：那会把可识别信息稳定泄漏到导出；每次
/// 安装随机生成则会让重装后同一日志变新会话。随机 UUID 持久化，重装丢失时
/// 明示「新 profile」，不静默重排历史。读不到 urandom（非 unix）时退化为
/// 全零 —— 测试用显式传入，生产侧只在 unix 上跑，这是文档化的平台缺口。
pub fn machine_namespace() -> String {
    if let Some(m) = read_json(&machine_path()) {
        if let Some(ns) = m.get("machine_namespace").and_then(Value::as_str) {
            return ns.to_string();
        }
    }
    let ns = random_hex(16);
    atomic_write_json(
        &machine_path(),
        &json!({"schema_version": "1.0.0", "machine_namespace": ns}),
    );
    ns
}

fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    if let Ok(mut f) = std::fs::File::open("/dev/urandom") {
        let _ = f.read_exact(&mut buf);
    }
    let mut out = String::with_capacity(bytes * 2);
    for b in buf {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

/// 原子 cutover：owner 换人 + epoch+1（core `tk::cutover` 的 I/O 接线）。
/// 返回写出的 manifest 路径。谁都能调（不做 owner 校验）—— 这就是 cutover
/// 的语义：显式动作，写者自己负责在合适的时机做。
pub fn takeover(new_owner: &str) -> PathBuf {
    let manifest = read_manifest();
    let next = tk::cutover(&manifest, new_owner, &now_iso_utc());
    write_manifest(&next);
    manifest_path()
}

/// 会话级去重 fold（§4.3 exactly-once）。返回 fold 结果；fencing 拒绝返回
/// Err（CLI 侧 exit 2，不落盘）。
///
/// `shadow=true` 时跳过 owner 检查 —— 这是 §4.2 shadow mode 的机制：Rust
/// 写者先在**非权威**的影子副本上重放真实、已填充 state（副本里 manifest 还
/// 是 python 或压根没有），逐文件与权威比对，通过后才走真 cutover。影子模式
/// 不碰权威 manifest，只折/记进 `AGENT_VITALS_HOME` 指向的那一份。
pub fn fold_session(req: &Value, shadow: bool) -> Result<FoldOutcome, String> {
    let manifest = read_manifest();
    if !shadow && !tk::owner_allows(&manifest, tk::RS_OWNER) {
        return Err(format!(
            "writer fencing: state owner is '{}', not 'rust'; run 'state takeover rust' \
             first, or --shadow to rehearse on a copy",
            tk::manifest_owner(&manifest)
        ));
    }

    let host_kind = req
        .get("host_kind")
        .and_then(Value::as_str)
        .unwrap_or("cli");
    let native_id = req.get("session_id").and_then(Value::as_str).unwrap_or("");
    if native_id.is_empty() {
        return Err("fold-session: session_id is required (producer derives it, §4.3)"
            .to_string());
    }
    let ns = req
        .get("machine_namespace")
        .and_then(Value::as_str)
        .ok_or_else(|| "fold-session: machine_namespace required (state machine-namespace)"
            .to_string())?;
    let key = tk::session_key(host_kind, native_id, ns);

    let ledger = read_ledger();
    if tk::ledger_folded(&ledger, &key) {
        return Ok(FoldOutcome::SkippedAlreadyFolded);
    }

    let now = now_iso_utc();
    let epoch = tk::manifest_epoch(&manifest);

    if let Some(oneline) = req.get("oneline").filter(|v| v.is_object()) {
        super::state::write_oneline(oneline);
        super::state::append_session_history(oneline);
    }
    if let Some(hb) = req.get("hour_buckets") {
        let by_model_today = req.get("by_model_today").filter(|v| v.is_object());
        super::state::merge_today(hb, by_model_today);
        if let Some(bdm) = req.get("by_date_model").filter(|v| v.is_object()) {
            super::state::merge_month(hb, Some(bdm));
        }
    }
    if let Some(alert) = req.get("alert").filter(|v| v.is_object()) {
        super::state::write_alert(alert);
    }

    // 提交点：ledger 先记（去重依据），manifest 后提交（代际 +1）。
    let entry = tk::ledger_entry(host_kind, native_id, ns, &now, epoch + 1);
    write_ledger(&tk::ledger_record(&ledger, &key, &entry));
    write_manifest(&tk::mark_fold(&manifest, &now));
    Ok(FoldOutcome::Folded)
}

/// R1d-tick 生产者（oneline）的 fencing 快速失败：owner 不是 rust 就拒绝，在
/// 花掉 audit + cost 之前挡在最前面 —— Python 同款「挡在最前面，省得审计半天
/// 才拒」。`shadow=true` 跳过（演练模式，折进影子副本，owner 还没 cutover）。
pub(crate) fn require_rust_owner(shadow: bool) -> Result<(), String> {
    if shadow {
        return Ok(());
    }
    let manifest = read_manifest();
    if tk::owner_allows(&manifest, tk::RS_OWNER) {
        Ok(())
    } else {
        Err(format!(
            "writer fencing: state owner is '{}', not 'rust'; run 'state takeover rust' \
             first, or --shadow to rehearse on a copy",
            tk::manifest_owner(&manifest)
        ))
    }
}

/// 这条会话 key 是否已在 ledger 里折过（exactly-once 去重门）。
pub(crate) fn folded_in_ledger(key: &str) -> bool {
    tk::ledger_folded(&read_ledger(), key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::super::codex_cost::today_beijing;

    static HOME_SEQ: AtomicUsize = AtomicUsize::new(0);

    /// 测试锁：进程级 ENV_LOCK（budget/state 的测试也改 AGENT_VITALS_HOME）。
    /// `.unwrap_or_else(poison → into_inner)`：断言在锁内 panic 会把锁毒化，
    /// 毒化再 lock 就 Err —— 这是**测试夹具**的锁，夹具不该让一个坏断言
    /// 连坐后续所有用例，直接取回即可（每个测试自带 env 恢复 guard）。
    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        crate::util::ENV_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner())
    }

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

    fn tmp_home(t: &Path) -> PathBuf {
        let seq = HOME_SEQ.fetch_add(1, Ordering::Relaxed);
        let home = t.join(format!("home-{seq}"));
        std::fs::create_dir_all(home.join("state")).unwrap();
        home
    }

    fn read(p: &Path) -> Value {
        let text = std::fs::read_to_string(p).unwrap();
        serde_json::from_str(&text).unwrap()
    }

    /// 一份 fold-req：session s1，10 token。`session_id` 可改（多会话）。
    /// 日期用**运行时北京今天**（`merge_today`/`merge_month` 按北京日期过滤，
    /// 写死日期会在非 08-30 那天被当成非今日整条丢弃 —— R1c 同款教训）。
    fn req(session_id: &str, tokens: u64) -> Value {
        let today = today_beijing();
        let oneline = json!({
            "session_id": session_id,
            "session_log": format!("/logs/{session_id}.jsonl"),
            "duration_ms": 100,
            "model": "deepseek-v4-flash",
            "tokens_total": tokens,
            "tokens_peak": tokens,
            "cost_cny": 0.1,
            "cost_peak_cny": 0.0,
            "unpriced_tokens": 0,
            "findings_total": 0,
            "findings_max_severity": "none",
            "hour_buckets_summary": {"bucket_count": 1, "min_date": today.clone(),
                                     "max_date": today.clone(), "tz_name": "Asia/Shanghai"},
        });
        let by_model_today = json!({"deepseek-v4-flash": {
            "uncached_input_tokens": tokens,
            "output_tokens": 0, "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0}});
        let by_date_model = json!({today.clone(): {"deepseek-v4-flash": {
            "uncached_input_tokens": tokens,
            "output_tokens": 0, "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0}}});
        json!({
            "session_id": session_id,
            "session_log": format!("/logs/{session_id}.jsonl"),
            "host_kind": "dsh",
            "machine_namespace": "ns-abc",
            "oneline": oneline,
            "hour_buckets": {"buckets": [
                {"date": today.clone(), "hour": 9, "uncached_input_tokens": tokens}
            ]},
            "by_model_today": by_model_today,
            "by_date_model": by_date_model,
            "alert": {"level": "warning", "daily_pct": 10.0, "daily_cny": 5.0,
                      "monthly_pct": 1.0, "monthly_cny": 20.0},
        })
    }

    // ── fencing ─────────────────────────────────────────────────

    #[test]
    fn rust_fold_refused_before_cutover() {
        let _env = env_lock();
        let t = std::env::temp_dir().join(format!("av-takeover-{}", std::process::id()));
        let home = tmp_home(&t);
        let _g = TestEnvGuard::set(&home);
        // 无 manifest → 默认 owner=python → Rust 拒绝
        let e = fold_session(&req("s1", 10), false).unwrap_err();
        assert!(e.contains("writer fencing"), "unexpected: {e}");
        assert!(!manifest_path().exists());
        assert!(!ledger_path().exists());
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn rust_fold_proceeds_after_cutover() {
        let _env = env_lock();
        let t = std::env::temp_dir().join(format!("av-takeover-{}", std::process::id()));
        let home = tmp_home(&t);
        let _g = TestEnvGuard::set(&home);
        takeover("rust");
        let r = fold_session(&req("s1", 10), false).unwrap();
        assert_eq!(r, FoldOutcome::Folded);
        // manifest 已提交（owner=rust、代际 2：cutover 1 + fold 1）
        let m = read_manifest();
        assert_eq!(tk::manifest_owner(&m), "rust");
        assert_eq!(tk::manifest_epoch(&m), 2);
        // ledger 记录了 s1
        let l = read_ledger();
        let key = tk::session_key("dsh", "s1", "ns-abc");
        assert!(tk::ledger_folded(&l, &key));
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn shadow_mode_folds_without_fencing() {
        let _env = env_lock();
        let t = std::env::temp_dir().join(format!("av-takeover-{}", std::process::id()));
        let home = tmp_home(&t);
        let _g = TestEnvGuard::set(&home);
        // 影子副本：manifest 还是默认 python，但 --shadow 直接折（不碰权威）
        let r = fold_session(&req("s1", 10), true).unwrap();
        assert_eq!(r, FoldOutcome::Folded);
        let l = read_ledger();
        assert!(tk::ledger_folded(&l, &tk::session_key("dsh", "s1", "ns-abc")));
        let _ = std::fs::remove_dir_all(&t);
    }

    // ── exactly-once（§4.2 验收：同一 session 多 tick 不重复累加）────

    #[test]
    fn same_session_multi_tick_accumulates_once() {
        let _env = env_lock();
        let t = std::env::temp_dir().join(format!("av-takeover-{}", std::process::id()));
        let home = tmp_home(&t);
        let _g = TestEnvGuard::set(&home);
        takeover("rust");
        let r = req("s1", 10);
        assert_eq!(fold_session(&r, false).unwrap(), FoldOutcome::Folded);
        // 再 tick 两次：同 key → 跳过，什么都不写
        assert_eq!(
            fold_session(&r, false).unwrap(),
            FoldOutcome::SkippedAlreadyFolded
        );
        assert_eq!(
            fold_session(&r, false).unwrap(),
            FoldOutcome::SkippedAlreadyFolded
        );
        // today.json 只折了一次（10，不是 30）
        let today = read(&state_dir().join("today.json"));
        assert_eq!(today["buckets"]["9"]["uncached_input_tokens"], 10);
        let month = read(&state_dir().join("month.json"));
        assert_eq!(
            month["days"][today_beijing()]["uncached_input_tokens"],
            10
        );
        // sessions.jsonl 只追加了一行
        let lines = std::fs::read_to_string(state_dir().join("sessions.jsonl")).unwrap();
        assert_eq!(lines.trim_end().lines().count(), 1);
        // ledger 只有一条
        let l = read_ledger();
        assert_eq!(l["entries"].as_object().unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn distinct_sessions_fold_separately() {
        let _env = env_lock();
        let t = std::env::temp_dir().join(format!("av-takeover-{}", std::process::id()));
        let home = tmp_home(&t);
        let _g = TestEnvGuard::set(&home);
        takeover("rust");
        fold_session(&req("s1", 10), false).unwrap();
        fold_session(&req("s2", 5), false).unwrap();
        let today = read(&state_dir().join("today.json"));
        // 两个会话各自去重，桶累加 10 + 5
        assert_eq!(today["buckets"]["9"]["uncached_input_tokens"], 15);
        let l = read_ledger();
        assert_eq!(l["entries"].as_object().unwrap().len(), 2);
        let _ = std::fs::remove_dir_all(&t);
    }

    // ── cutover / rollback ───────────────────────────────────────

    #[test]
    fn rollback_then_rereplay_does_not_double_count() {
        let _env = env_lock();
        let t = std::env::temp_dir().join(format!("av-takeover-{}", std::process::id()));
        let home = tmp_home(&t);
        let _g = TestEnvGuard::set(&home);
        // Rust fold s1（代际 2）
        takeover("rust");
        assert_eq!(fold_session(&req("s1", 10), false).unwrap(), FoldOutcome::Folded);
        let today_before = read(&state_dir().join("today.json"));
        let month_before = read(&state_dir().join("month.json"));
        let ledger_before = read_ledger();
        let s1_epoch = ledger_before["entries"][tk::session_key("dsh", "s1", "ns-abc")]["epoch"].clone();
        // 接管失败 → 回退 Python（代际 3）
        takeover("python");
        assert_eq!(tk::manifest_owner(&read_manifest()), "python");
        // 再接管回 rust：ledger 还在，s1 的 epoch 原封不动（没被重放）
        takeover("rust");
        assert_eq!(
            fold_session(&req("s1", 10), false).unwrap(),
            FoldOutcome::SkippedAlreadyFolded
        );
        let ledger_after = read_ledger();
        assert_eq!(
            ledger_after["entries"][tk::session_key("dsh", "s1", "ns-abc")]["epoch"],
            s1_epoch
        );
        // 状态一字未动
        assert_eq!(read(&state_dir().join("today.json")), today_before);
        assert_eq!(read(&state_dir().join("month.json")), month_before);
        let _ = std::fs::remove_dir_all(&t);
    }

    // ── shadow replay（§4.2：非权威副本上逐文件比对）─────────────

    #[test]
    fn shadow_replay_matches_authority_after_cutover() {
        // 权威：接管 rust 后 fold s1、s2。影子：从权威复制 → --shadow 折 s3。
        // 同一份 fold-req 折进两份同源的 state，today/month/ledger/manifest
        // 除时间戳外逐字节一致 —— 这就是「Rust 写者与（接管前）Python 写者
        // 产出同构」的物证；时间戳（folded_at/last_fold_at/generated_at）由
        // `mark_fold`/`ledger_entry`/state 写链各自打，必然不同，打码后比。
        let _env = env_lock();
        let t = std::env::temp_dir().join(format!("av-takeover-{}", std::process::id()));
        let home = tmp_home(&t);
        let _g = TestEnvGuard::set(&home);
        takeover("rust");
        fold_session(&req("s1", 10), false).unwrap();
        fold_session(&req("s2", 5), false).unwrap();
        let authority = state_dir();

        // 复制整份 state → shadow
        let shadow_root = home.join("shadow");
        let shadow_state = shadow_root.join("state");
        std::fs::create_dir_all(&shadow_state).unwrap();
        for entry in std::fs::read_dir(&authority).unwrap() {
            let p = entry.unwrap().path();
            std::fs::copy(&p, shadow_state.join(p.file_name().unwrap())).unwrap();
        }
        // 影子副本上折 s3（--shadow 语义，直接调 fold_session(shadow=true)）
        let _g2 = TestEnvGuard::set(&shadow_root);
        assert_eq!(
            fold_session(&req("s3", 7), true).unwrap(),
            FoldOutcome::Folded
        );
        // 权威上也折 s3 → 两边文件除时间戳外一致
        drop(_g2);
        let _g3 = TestEnvGuard::set(&home);
        assert_eq!(
            fold_session(&req("s3", 7), false).unwrap(),
            FoldOutcome::Folded
        );
        // 逐文件对比（mask 时间戳：folded_at / last_fold_at / generated_at /
        // archived_at 两边各自打 now，必然不同；日期字段如 date/month 是确定性
        // 输入，不打码）。
        let mask = |s: &str| {
            let mut out = String::new();
            let mut rest = s;
            for field in ["folded_at", "last_fold_at", "generated_at", "archived_at"] {
                let pat = format!("\"{field}\": \"");
                while let Some(idx) = rest.find(&pat) {
                    out.push_str(&rest[..idx]);
                    let after = &rest[idx + pat.len()..];
                    let end = after.find('"').unwrap();
                    out.push_str(&format!("\"{field}\": \"<TS>\""));
                    rest = &after[end + 1..];
                }
            }
            out.push_str(rest);
            out
        };
        // 文件集合也必须一致（month-archive.json 只在有跨月迁移时才出现；
        // 今天全是当前月，两边都没有 —— 集合相等比固定清单更能抓到「一边多
        // 写了一边漏写」）。
        let files = |d: &std::path::Path| -> std::collections::BTreeSet<String> {
            std::fs::read_dir(d)
                .unwrap()
                .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
                .filter(|n| !n.starts_with('.') && !n.ends_with(".tmp"))
                .collect()
        };
        let set_a = files(&authority);
        let set_b = files(&shadow_state);
        assert_eq!(set_a, set_b, "权威与影子的 state 文件集合不一致");
        for name in &set_a {
            let a = std::fs::read_to_string(authority.join(name)).unwrap();
            let b = std::fs::read_to_string(shadow_state.join(name)).unwrap();
            assert_eq!(mask(&a), mask(&b), "{name} 权威与影子不一致");
        }
        let _ = std::fs::remove_dir_all(&t);
    }

    #[test]
    fn machine_namespace_is_persistent() {
        let _env = env_lock();
        let t = std::env::temp_dir().join(format!("av-takeover-{}", std::process::id()));
        let home = tmp_home(&t);
        let _g = TestEnvGuard::set(&home);
        let a = machine_namespace();
        let b = machine_namespace();
        assert_eq!(a, b, "machine namespace 必须持久（重装才换，见 §4.3）");
        assert_eq!(a.len(), 32, "16 字节 → 32 hex");
        let m = read(&machine_path());
        assert_eq!(m["machine_namespace"], a);
        let _ = std::fs::remove_dir_all(&t);
    }
}
