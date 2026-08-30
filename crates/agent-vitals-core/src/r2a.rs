//! R2a 最小可查询 SessionStore + 版本化契约的**纯规则层**（`docs/R2A_CONTRACT_DESIGN.md`）。
//!
//! 契约只定义「数据来源、查询模型与版本化 IPC」，本模块承载其中不碰 I/O 的部分：
//!
//!   · `SessionKey` 四元组（host_kind / native_id / source_profile /
//!     machine_namespace）——身份映射（设计 §1.1）；
//!   · `SourceFingerprint`（不透明、仅相等比较）与 `SessionRevision` /
//!     `StoreRevision`（设计 §1.5）；
//!   · versioned envelope 的**形状**（`build_envelope`）与版本矩阵兼容判定
//!     （`parse_envelope`，设计 §2.1–§2.3）；
//!   · SessionStore 的**纯查询模型**：filter / cursor / 分页 / per-filter 派生
//!     StoreRevision（设计 §3.3）与类型化错误码（`StoreError`，设计 §3.3）。
//!
//! I/O 全在 binary（`src/agent/r2a_store.rs`）：根发现、读文件、cache 读写、
//! `generated_at` 取时、`pricing_version` 计算。本模块只吃内存里的数据。
//! 与 Python 镜像 `scripts/agent_vitals/agent/r2a.py` 逐字节对齐（键序、哈希、
//! 分页边界），由 `tests/test_r2a.py` 的跨实现对账钉住。
//!
//! ## 三个「设计标推断、这里照实现」的决定（报告 main 复核）
//!
//! 1. **SessionKey 序列化键序**（设计 §1.1 标「推断，键序建议固定以便字节对账」）：
//!    固定 `host_kind → native_id → source_profile → machine_namespace`。
//! 2. **per-filter StoreRevision**（设计 §3.3 标「推断」）：= 该 filter 命中的
//!    会话集合里最大的 `store_seq`。命中集未变 → 不 bump；命中集出现更高 seq
//!    的成员（新增/更新）→ bump，旧 cursor 失效。
//! 3. **版本矩阵的 min/max**：`MIN_CONTRACT_VERSION = 0`（可读 N-1 老投影）、
//!    `MAX_CONTRACT_VERSION = 1`（当前首发）、`CURRENT = 1`。N+1（major 2）由
//!    版本闸拒绝，**不看字段名**（独立升级顺序测试）。

use serde_json::{Map, Value, json};

/// 当前 wire 契约版本（envelope 的 `schema_version`）。设计 §2.2「本次 R2a 首发 = 1」。
pub const CURRENT_CONTRACT_VERSION: u64 = 1;

/// 可读的最低契约 major —— 0 即「R2a 之前的老投影」（字段子集），向后兼容。
pub const MIN_CONTRACT_VERSION: u64 = 0;

/// 可读的最高契约 major —— 当前实现支持的最高 major。
pub const MAX_CONTRACT_VERSION: u64 = 1;

/// 引擎（core 规则）版本。语义：findings/coverage 三态规则集版本；规则语义变更才
/// 换版本（设计 §2.2）。与 crate 版本号解耦，专指 R2a 规则集。
pub const ENGINE_VERSION: &str = "1";

/// 类型化错误码（设计 §3.3）：`not-found` / `permission` / `stale-revision` /
/// `schema-mismatch` / `source-unavailable` / `cancelled`。禁止用空数组/空字符串
/// 同时表达「无会话」与「源不可用」——`source-unavailable` 是错误码，不是空页。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StoreError {
    NotFound,
    Permission,
    StaleRevision,
    SchemaMismatch,
    SourceUnavailable,
    Cancelled,
}

impl StoreError {
    pub fn code(&self) -> &'static str {
        match self {
            StoreError::NotFound => "not-found",
            StoreError::Permission => "permission",
            StoreError::StaleRevision => "stale-revision",
            StoreError::SchemaMismatch => "schema-mismatch",
            StoreError::SourceUnavailable => "source-unavailable",
            StoreError::Cancelled => "cancelled",
        }
    }

    /// 类型化错误码的 JSON 形状（binary/IPC 层原样透传）。
    pub fn to_json(&self, message: &str) -> Value {
        json!({ "error": { "code": self.code(), "message": message } })
    }
}

/// envelope 解析错误 —— 版本闸放行/拒绝的纯判定结果。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnvelopeError {
    /// `schema_version` 缺失或不是 string。
    MissingField,
    /// 版本在 [MIN, MAX] 之外（N+1 / 未知 major / 非数字）→ schema-mismatch。
    SchemaMismatch,
}

/// `SessionKey` 四元组（设计 §1.1）。host_kind + native_id 已在同一 namespace 内
/// 去重；source_profile 与 machine_namespace 把跨工作区/跨机器碰撞拆开。
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SessionKey {
    pub host_kind: String,
    pub native_id: String,
    pub source_profile: String,
    pub machine_namespace: String,
}

impl SessionKey {
    pub fn new(
        host_kind: &str,
        native_id: &str,
        source_profile: &str,
        machine_namespace: &str,
    ) -> Self {
        SessionKey {
            host_kind: host_kind.to_string(),
            native_id: native_id.to_string(),
            source_profile: source_profile.to_string(),
            machine_namespace: machine_namespace.to_string(),
        }
    }

    /// 序列化形状 —— **键序是字节一致的一部分，不能重排**（设计 §1.1 标「推断」，
    /// 此处定为 host_kind → native_id → source_profile → machine_namespace）。
    pub fn to_json(&self) -> Value {
        json!({
            "host_kind": self.host_kind,
            "native_id": self.native_id,
            "source_profile": self.source_profile,
            "machine_namespace": self.machine_namespace,
        })
    }

    /// 反序列化 —— 四个分量任一缺失/非 string → None（无法归入任何 SessionKey，
    /// 设计 §1.2「session_id 与 id 双缺 → 该 rollout 无法归入任何 SessionKey」）。
    pub fn from_json(v: &Value) -> Option<SessionKey> {
        Some(SessionKey {
            host_kind: v.get("host_kind")?.as_str()?.to_string(),
            native_id: v.get("native_id")?.as_str()?.to_string(),
            source_profile: v.get("source_profile")?.as_str()?.to_string(),
            machine_namespace: v.get("machine_namespace")?.as_str()?.to_string(),
        })
    }

    /// 自定界 ledger key（四段）。复刻 `takeover::session_key` 的长度前缀方案，
    /// 多一段 source_profile：裸拼接会让 `("ab","c")` 与 `("a","bc")` 撞同一个
    /// key，长度前缀天然无法伪造碰撞。
    pub fn ledger_key(&self) -> String {
        fn seg(s: &str) -> String {
            format!("{}:{s}", s.len())
        }
        format!(
            "{}|{}|{}|{}",
            seg(&self.host_kind),
            seg(&self.native_id),
            seg(&self.source_profile),
            seg(&self.machine_namespace),
        )
    }
}

/// 稳定排序用的四元组（host_kind → native_id → source_profile →
/// machine_namespace 的内容字典序）。Python 镜像 `r2a.sort_key` 钉同一顺序。
fn sort_tuple(k: &SessionKey) -> (&str, &str, &str, &str) {
    (&k.host_kind, &k.native_id, &k.source_profile, &k.machine_namespace)
}

/// 不透明、仅相等比较的源文件指纹（设计 §1.5）。无顺序；「相等 ⇒ 内容未变」是
/// 契约唯一要求。用于 cache 失效判断——源文件截断/替换（指纹不等）→ checkpoint/
/// cache 作废、全量重建（设计 §3.5）。内部字符串由 I/O 层计算（binary 的
/// `r2a_store::codex_source_fingerprint`），本类型只保证相等语义。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceFingerprint(pub String);

/// `SessionRevision` —— 派生自源、跨重启持久（重算得同一值，不需要 epoch）。
/// Codex = 会话 rollout 家族内最大事件 `timestamp`（ISO）；DSH = 最大 seq/time
/// （设计 §1.5/§4.4）。本模块用 `String`（ISO 时间戳按字典序单调）。
pub type SessionRevision = String;

/// `StoreRevision` —— Store 内存中的全局写序号；重启后归零（新 epoch），旧 cursor
/// 失效。envelope 里携带的是**条目构建时的写序号**（`SessionReportEntry.store_seq`）；
/// 分页 cursor 携带的是 **per-filter 派生 revision**（命中集最大 store_seq）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct StoreRevision(pub u64);

/// 会话筛选（设计 §3.3「filter = 按宿主/日期/模型/会话筛选」）。所有字段可选。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SessionFilter {
    pub host_kind: Option<String>,
    pub model: Option<String>,
    /// 日期下界（含）：会话跨度 [first, last] 与 [date_from, date_to] 有交叠才算
    /// 命中（ISO 日期字符串按字典序比较）。
    pub date_from: Option<String>,
    /// 日期上界（含）。
    pub date_to: Option<String>,
    /// 会话筛选：native_id 或 title 子串（ASCII 不区分大小写）。
    pub query: Option<String>,
}

impl SessionFilter {
    /// 命中判定（纯）。degraded 会话（date 为 None）在出现日期筛选时被排除——
    /// 没有日期可比，诚实缺失，不是「日期范围外的会话」。
    pub fn matches(&self, e: &SessionReportEntry) -> bool {
        if let Some(h) = &self.host_kind {
            if e.key.host_kind != *h {
                return false;
            }
        }
        if let Some(m) = &self.model {
            if e.model.as_deref() != Some(m.as_str()) {
                return false;
            }
        }
        if self.date_from.is_some() || self.date_to.is_some() {
            let (Some(first), Some(last)) = (e.date_first.as_deref(), e.date_last.as_deref())
            else {
                return false;
            };
            if let Some(to) = &self.date_to {
                if first > to.as_str() {
                    return false;
                }
            }
            if let Some(fr) = &self.date_from {
                if last < fr.as_str() {
                    return false;
                }
            }
        }
        if let Some(q) = &self.query {
            let q = q.to_ascii_lowercase();
            let in_id = e.key.native_id.to_ascii_lowercase().contains(&q);
            let in_title = e
                .title
                .as_deref()
                .map(|t| t.to_ascii_lowercase().contains(&q))
                .unwrap_or(false);
            if !in_id && !in_title {
                return false;
            }
        }
        true
    }

    /// filter 的确定性哈希 —— 同一 filter 在 Python/Rust 两侧产出同一串。
    /// 设计 §3.3 分页 cursor 绑定 `(store_revision, filter_hash, last_key)`，所以
    /// hash 必须跨实现稳定。用 FNV-1a 64（无第三方依赖，两侧一行实现）。
    pub fn hash(&self) -> String {
        let canon = format!(
            "host={}|model={}|from={}|to={}|q={}",
            self.host_kind.as_deref().unwrap_or(""),
            self.model.as_deref().unwrap_or(""),
            self.date_from.as_deref().unwrap_or(""),
            self.date_to.as_deref().unwrap_or(""),
            self.query.as_deref().unwrap_or(""),
        );
        format!("{:016x}", fnv1a64(canon.as_bytes()))
    }
}

/// FNV-1a 64 位非加密哈希 —— 确定性、零依赖，Python/Rust 两侧实现一致。
pub fn fnv1a64(data: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in data {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// 分页 cursor（设计 §3.3）：`(store_revision, filter_hash, last_key)`。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PageCursor {
    pub store_revision: u64,
    pub filter_hash: String,
    pub last_key: String,
}

impl PageCursor {
    pub fn to_json(&self) -> Value {
        json!({
            "store_revision": self.store_revision,
            "filter_hash": self.filter_hash,
            "last_key": self.last_key,
        })
    }

    pub fn from_json(v: &Value) -> Option<PageCursor> {
        Some(PageCursor {
            store_revision: v.get("store_revision")?.as_u64()?,
            filter_hash: v.get("filter_hash")?.as_str()?.to_string(),
            last_key: v.get("last_key")?.as_str()?.to_string(),
        })
    }
}

/// Store 内存索引里的一条 —— 规范化后的 `SessionReport` 只读索引（设计 §3.1）。
/// `envelope` = 完整的 versioned DTO（`read_session` 原样返回）；summary 字段是
/// 快查用的派生列，`store_seq` 是构建时的写序号（per-filter revision 的原料）。
#[derive(Debug, Clone)]
pub struct SessionReportEntry {
    pub key: SessionKey,
    pub session_revision: Option<SessionRevision>,
    pub title: Option<String>,
    pub model: Option<String>,
    pub date_first: Option<String>,
    pub date_last: Option<String>,
    pub files: usize,
    pub cost_usd: Option<f64>,
    pub tokens_total: Option<i64>,
    pub findings_total: usize,
    pub store_seq: u64,
    pub envelope: Value,
}

/// 一页会话列表（设计 §2.5/§3.3）：`Page { items, next_cursor | null, total,
/// store_revision }`。
#[derive(Debug, Clone, PartialEq)]
pub struct Page {
    pub items: Vec<Value>,
    pub next_cursor: Option<PageCursor>,
    pub total: usize,
    pub store_revision: u64,
}

impl Page {
    pub fn to_json(&self) -> Value {
        json!({
            "items": self.items,
            "next_cursor": self.next_cursor.as_ref().map(PageCursor::to_json),
            "total": self.total,
            "store_revision": self.store_revision,
        })
    }
}

/// 列表项 `SessionSummary`（设计 §2.5）：字段全部来自既有输出，**不发明新字段名**。
/// `title` 必须可 null（Codex 标题命中 87% 不是 100%，诚实缺失）。
pub fn summarize(e: &SessionReportEntry) -> Value {
    json!({
        "session_key": e.key.to_json(),
        "session_revision": e.session_revision,
        "title": e.title,
        "host_kind": e.key.host_kind,
        "model": e.model,
        "date_span": { "first": e.date_first, "last": e.date_last },
        "files": e.files,
        "cost_usd": e.cost_usd,
        "tokens_total": e.tokens_total,
        "findings_total": e.findings_total,
    })
}

/// versioned envelope 的**形状**（设计 §2.1）。键序是字节一致的一部分：
/// schema_version → engine_version → pricing_version → store_revision →
/// generated_at → source_statuses → session_key → session_revision → session。
///
/// `store_revision` = 条目构建时的写序号；`generated_at` 由 I/O 层取时传入（core
/// 不读时钟）；`pricing_version` 由 I/O 层从价表计算传入。
#[allow(clippy::too_many_arguments)]
pub fn build_envelope(
    engine_version: &str,
    pricing_version: &str,
    store_revision: u64,
    generated_at: &str,
    source_statuses: Value,
    key: &SessionKey,
    session_revision: Option<&str>,
    session: Value,
) -> Value {
    let mut m = Map::new();
    m.insert("schema_version".into(), json!(CURRENT_CONTRACT_VERSION.to_string()));
    m.insert("engine_version".into(), json!(engine_version));
    m.insert("pricing_version".into(), json!(pricing_version));
    m.insert("store_revision".into(), json!(store_revision));
    m.insert("generated_at".into(), json!(generated_at));
    m.insert("source_statuses".into(), source_statuses);
    m.insert("session_key".into(), key.to_json());
    m.insert("session_revision".into(), json!(session_revision));
    m.insert("session".into(), session);
    Value::Object(m)
}

/// 版本闸（设计 §2.3）：envelope 的 `schema_version` 是否落在 [MIN, MAX]。
///
/// - N-1（major 0，老投影的字段子集）→ **向后兼容**（≤ MAX 即可读，读名字取子集）。
/// - N（major 1）→ 可读。
/// - N+1（major 2）→ `SchemaMismatch`（**版本闸拒绝，不看字段名**——独立升级
///   顺序测试：N-1 → N+1 直接跳，不能「碰巧字段还叫这名字就放行」）。
pub fn parse_envelope(envelope: &Value) -> Result<(), EnvelopeError> {
    let sv = envelope
        .get("schema_version")
        .and_then(Value::as_str)
        .ok_or(EnvelopeError::MissingField)?;
    let major: u64 = sv.parse().map_err(|_| EnvelopeError::SchemaMismatch)?;
    // 版本闸：不在 [MIN, MAX] → schema-mismatch。用 range contains 而非
    // `major < MIN` —— MIN=0 时 u64 的 `< 0` 恒假，clippy 会以 absurd 告警。
    if !(MIN_CONTRACT_VERSION..=MAX_CONTRACT_VERSION).contains(&major) {
        return Err(EnvelopeError::SchemaMismatch);
    }
    Ok(())
}

/// `list_sessions`（设计 §3.3）：稳定排序 + cursor 分页 + per-filter 派生
/// StoreRevision。
///
/// - 稳定排序 = `ledger_key()`（host_kind → native_id → source_profile →
///   machine_namespace 的字典序，host_kind/native_id 是主序）。
/// - cursor 校验：`filter_hash` 与当前 filter 不符，或 `store_revision` ≠ 当前
///   per-filter revision（命中集出现更高 seq 成员）→ `StaleRevision`。命中集未变
///   或无关会话更新 → 通过（设计 §3.3「分页期间其他会话更新不误拒」）。
/// - cursor 的 `last_key` 找不到 → `StaleRevision`（页面边界移动了，诚实报错）。
pub fn list_sessions(
    entries: &[SessionReportEntry],
    filter: &SessionFilter,
    cursor: Option<&PageCursor>,
    page_size: usize,
) -> Result<Page, StoreError> {
    let page_size = page_size.max(1);
    let filter_hash = filter.hash();

    let mut matched: Vec<&SessionReportEntry> =
        entries.iter().filter(|e| filter.matches(e)).collect();
    // 稳定排序 = (host_kind, native_id) 主序（设计 §3.3）。**不能用 ledger_key
    // 排序**——它是长度前缀、按「字段长度」先排（"4:dsh" 会排在 "5:codex" 前），
    // 与「host_kind → native_id 的内容字典序」不是一回事。跨实现（Python/Rust）
    // 都要按这个四元组排。
    matched.sort_by(|a, b| sort_tuple(&a.key).cmp(&sort_tuple(&b.key)));

    // per-filter 派生 revision = 命中集最大 store_seq。
    let filter_rev = matched.iter().map(|e| e.store_seq).max().unwrap_or(0);

    if let Some(c) = cursor {
        if c.filter_hash != filter_hash || c.store_revision != filter_rev {
            return Err(StoreError::StaleRevision);
        }
        if !matched.iter().any(|e| e.key.ledger_key() == c.last_key) {
            return Err(StoreError::StaleRevision);
        }
    }

    let start = match cursor {
        Some(c) => matched
            .iter()
            .position(|e| e.key.ledger_key() == c.last_key)
            .map(|i| i + 1)
            .unwrap_or(0),
        None => 0,
    };

    let page: Vec<&&SessionReportEntry> = matched.iter().skip(start).take(page_size).collect();
    let next_cursor = if start + page.len() < matched.len() {
        let last = page.last().expect("page non-empty when next_cursor produced");
        Some(PageCursor {
            store_revision: filter_rev,
            filter_hash,
            last_key: last.key.ledger_key(),
        })
    } else {
        None
    };

    Ok(Page {
        items: page.iter().map(|e| summarize(e)).collect(),
        next_cursor,
        total: matched.len(),
        store_revision: filter_rev,
    })
}

/// `read_session`（设计 §3.3）：`session_key` 定位，`revision` 是 `SessionRevision`
/// （派生自源、持久可比）。缺省返回当前；请求的 revision 与当前不符 →
/// `StaleRevision`。找不到 key → `NotFound`。存的是已过版本闸的 envelope；理论
/// 上不会 mismatch（构建即当前版本），但防御性返回 `SchemaMismatch`。
pub fn read_session(
    entries: &[SessionReportEntry],
    key: &SessionKey,
    revision: Option<&str>,
) -> Result<Value, StoreError> {
    let entry = entries
        .iter()
        .find(|e| e.key == *key)
        .ok_or(StoreError::NotFound)?;
    if let Some(rev) = revision {
        let actual = entry.session_revision.as_deref().unwrap_or("");
        if actual != rev {
            return Err(StoreError::StaleRevision);
        }
    }
    if parse_envelope(&entry.envelope).is_err() {
        return Err(StoreError::SchemaMismatch);
    }
    Ok(entry.envelope.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(host: &str, native: &str) -> SessionKey {
        SessionKey::new(host, native, "/repo", "ns-abc")
    }

    fn entry(key: SessionKey, rev: &str, seq: u64) -> SessionReportEntry {
        SessionReportEntry {
            key,
            session_revision: Some(rev.to_string()),
            title: Some("标题".to_string()),
            model: Some("gpt-5.6-sol".to_string()),
            date_first: Some("2026-08-01".to_string()),
            date_last: Some("2026-08-30".to_string()),
            files: 2,
            cost_usd: Some(1.23),
            tokens_total: Some(45678),
            findings_total: 3,
            store_seq: seq,
            envelope: json!({"schema_version": "1", "session": {}}),
        }
    }

    // ── SessionKey ──────────────────────────────────────────────

    #[test]
    fn session_key_json_order_is_fixed() {
        let k = SessionKey::new("codex", "s1", "/repo", "ns-abc");
        let v = k.to_json();
        assert_eq!(
            v.as_object().unwrap().keys().collect::<Vec<_>>(),
            vec!["host_kind", "native_id", "source_profile", "machine_namespace"]
        );
        assert_eq!(v["host_kind"], "codex");
        assert_eq!(v["native_id"], "s1");
        assert_eq!(v["source_profile"], "/repo");
        assert_eq!(v["machine_namespace"], "ns-abc");
        // 往返一致
        assert_eq!(SessionKey::from_json(&v), Some(k));
    }

    #[test]
    fn session_key_from_json_missing_component_is_none() {
        assert_eq!(SessionKey::from_json(&json!({"host_kind": "codex"})), None);
        assert_eq!(SessionKey::from_json(&json!({"host_kind": 1, "native_id": "s",
            "source_profile": "/r", "machine_namespace": "ns"})), None);
    }

    #[test]
    fn session_key_ledger_key_is_self_delimiting_four_seg() {
        let k = SessionKey::new("codex", "s1", "/repo", "ns-abc");
        assert_eq!(k.ledger_key(), "5:codex|2:s1|5:/repo|6:ns-abc");
        // 长度前缀消除拼接歧义
        let a = SessionKey::new("ab", "c", "d", "e");
        let b = SessionKey::new("a", "bc", "d", "e");
        assert_ne!(a.ledger_key(), b.ledger_key());
        // 字段含分隔符也不撞
        let c = SessionKey::new("a|b", "c", "d", "e");
        let d = SessionKey::new("a", "b|c", "d", "e");
        assert_ne!(c.ledger_key(), d.ledger_key());
    }

    #[test]
    fn source_fingerprint_equality_only() {
        let a = SourceFingerprint("abc".into());
        let b = SourceFingerprint("abc".into());
        let c = SourceFingerprint("abd".into());
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    // ── envelope 形状与版本矩阵 ─────────────────────────────────

    #[test]
    fn envelope_key_order_and_values() {
        let k = key("codex", "s1");
        let v = build_envelope(
            "1",
            "abc123",
            7,
            "2026-08-30T12:00:00Z",
            json!({"codex": {"status": "ok"}}),
            &k,
            Some("2026-08-30T11:00:00Z"),
            json!({"session_id": "s1"}),
        );
        assert_eq!(
            v.as_object().unwrap().keys().collect::<Vec<_>>(),
            vec!["schema_version", "engine_version", "pricing_version",
                 "store_revision", "generated_at", "source_statuses",
                 "session_key", "session_revision", "session"]
        );
        assert_eq!(v["schema_version"], "1");
        assert_eq!(v["engine_version"], "1");
        assert_eq!(v["pricing_version"], "abc123");
        assert_eq!(v["store_revision"], 7);
        assert_eq!(v["generated_at"], "2026-08-30T12:00:00Z");
        assert_eq!(v["session_revision"], "2026-08-30T11:00:00Z");
        assert_eq!(v["session"]["session_id"], "s1");
        assert!(parse_envelope(&v).is_ok());
    }

    #[test]
    fn parse_envelope_accepts_current_n() {
        assert!(parse_envelope(&json!({"schema_version": "1"})).is_ok());
    }

    #[test]
    fn parse_envelope_backward_compat_n_minus_1() {
        // N-1 = major 0（老投影，字段子集）→ 向后兼容（≤ MAX 即可读）。
        assert!(parse_envelope(&json!({"schema_version": "0"})).is_ok());
    }

    #[test]
    fn parse_envelope_rejects_n_plus_1_by_version() {
        // N+1 = major 2 → schema-mismatch。
        assert_eq!(
            parse_envelope(&json!({"schema_version": "2"})),
            Err(EnvelopeError::SchemaMismatch)
        );
    }

    #[test]
    fn parse_envelope_rejects_jump_by_version_not_field_names() {
        // 独立升级顺序测试：N-1 → N+1 直接跳（跳过 N）。N+1 文档就算字段名全都
        // 还在（version-1 的名字），版本闸也必须拒 —— 不能「碰巧字段还叫这名字
        // 就放行」（设计 §2.3 原话）。
        let doc = json!({
            "schema_version": "2",
            "session_key": {"host_kind": "codex", "native_id": "s1"},
            "session_revision": "2026-08-30T11:00:00Z",
            "session": {"session_id": "s1"},
        });
        assert_eq!(parse_envelope(&doc), Err(EnvelopeError::SchemaMismatch));
    }

    #[test]
    fn parse_envelope_rejects_malformed() {
        assert_eq!(
            parse_envelope(&json!({"schema_version": 1})),
            Err(EnvelopeError::MissingField)
        );
        assert_eq!(
            parse_envelope(&json!({"schema_version": "abc"})),
            Err(EnvelopeError::SchemaMismatch)
        );
        assert_eq!(parse_envelope(&json!({})), Err(EnvelopeError::MissingField));
    }

    #[test]
    fn fnv1a64_is_deterministic_and_matches_known() {
        // 空输入与单字节 —— FNV-1a 的已知值（Python `r2a.fnv1a64` 钉同一组）。
        assert_eq!(fnv1a64(b""), 0xcbf29ce484222325);
        assert_eq!(fnv1a64(b"a"), 0xaf63dc4c8601ec8c);
        assert_eq!(fnv1a64("host=codex|model=|from=|to=|q=".as_bytes()),
                   fnv1a64("host=codex|model=|from=|to=|q=".as_bytes()));
    }

    // ── filter ──────────────────────────────────────────────────

    #[test]
    fn filter_matches_host_model_date_query() {
        let e = entry(key("codex", "s1"), "2026-08-30", 0);
        assert!(SessionFilter { host_kind: Some("codex".into()), ..Default::default() }.matches(&e));
        assert!(!SessionFilter { host_kind: Some("dsh".into()), ..Default::default() }.matches(&e));
        assert!(SessionFilter { model: Some("gpt-5.6-sol".into()), ..Default::default() }.matches(&e));
        assert!(!SessionFilter { model: Some("gpt-5.6-pro".into()), ..Default::default() }.matches(&e));
        // 日期范围交叠
        assert!(SessionFilter { date_from: Some("2026-08-01".into()), date_to: Some("2026-08-31".into()), ..Default::default() }.matches(&e));
        assert!(!SessionFilter { date_from: Some("2026-09-01".into()), ..Default::default() }.matches(&e));
        assert!(!SessionFilter { date_to: Some("2026-07-31".into()), ..Default::default() }.matches(&e));
        // query：native_id 或 title 子串（不区分大小写）
        assert!(SessionFilter { query: Some("S1".into()), ..Default::default() }.matches(&e));
        assert!(SessionFilter { query: Some("标题".into()), ..Default::default() }.matches(&e));
        assert!(!SessionFilter { query: Some("nope".into()), ..Default::default() }.matches(&e));
    }

    #[test]
    fn filter_excludes_degraded_sessions_on_date() {
        let mut e = entry(key("codex", "s1"), "2026-08-30", 0);
        e.date_first = None;
        e.date_last = None;
        assert!(SessionFilter::default().matches(&e));
        assert!(!SessionFilter { date_from: Some("2026-01-01".into()), ..Default::default() }.matches(&e));
    }

    #[test]
    fn filter_hash_is_deterministic_and_sensitive() {
        let a = SessionFilter { host_kind: Some("codex".into()), ..Default::default() };
        let b = SessionFilter { host_kind: Some("codex".into()), ..Default::default() };
        let c = SessionFilter { host_kind: Some("dsh".into()), ..Default::default() };
        assert_eq!(a.hash(), b.hash());
        assert_ne!(a.hash(), c.hash());
        // 与 Python 镜像钉的同一组数值（tests/test_r2a.py 对账）
        assert_eq!(a.hash(), format!("{:016x}", fnv1a64("host=codex|model=|from=|to=|q=".as_bytes())));
    }

    // ── list_sessions ───────────────────────────────────────────

    fn three_entries() -> Vec<SessionReportEntry> {
        // store_seq = 构建序（sorted 前）。命中集按 ledger_key 排序分页。
        vec![
            entry(key("codex", "b"), "2026-08-02", 0),
            entry(key("codex", "a"), "2026-08-01", 1),
            entry(key("dsh", "z"), "2026-08-03", 2),
        ]
    }

    #[test]
    fn list_sessions_first_page_no_cursor_sorted() {
        let es = three_entries();
        let f = SessionFilter::default();
        let page = list_sessions(&es, &f, None, 10).unwrap();
        assert_eq!(page.total, 3);
        assert!(page.next_cursor.is_none());
        // 稳定排序：codex/a, codex/b, dsh/z
        let keys: Vec<&str> = page.items.iter()
            .map(|i| i["session_key"]["native_id"].as_str().unwrap()).collect();
        assert_eq!(keys, vec!["a", "b", "z"]);
        assert_eq!(page.store_revision, 2); // max store_seq
    }

    #[test]
    fn list_sessions_paginates_through_all_without_dup_or_skip() {
        let es = three_entries();
        let f = SessionFilter::default();
        let p0 = list_sessions(&es, &f, None, 2).unwrap();
        assert_eq!(p0.items.len(), 2);
        let c0 = p0.next_cursor.clone().expect("next page exists");
        assert_eq!(c0.store_revision, 2);
        let p1 = list_sessions(&es, &f, Some(&c0), 2).unwrap();
        assert_eq!(p1.items.len(), 1);
        assert!(p1.next_cursor.is_none());
        // 两页覆盖全部，无重复无遗漏
        let all: Vec<&str> = p0.items.iter().chain(&p1.items)
            .map(|i| i["session_key"]["native_id"].as_str().unwrap()).collect();
        assert_eq!(all, vec!["a", "b", "z"]);
    }

    #[test]
    fn list_sessions_unrelated_update_does_not_stale_cursor() {
        // filter 只命中的是 codex（host=codex），dsh 会话的更新（更高 seq）不 bump
        // per-filter revision → cursor 依旧有效（设计 §3.3「分页期间其他会话更新
        // 不误拒」）。
        let es = vec![
            entry(key("codex", "a"), "2026-08-01", 0),
            entry(key("codex", "b"), "2026-08-02", 1),
        ];
        let f = SessionFilter { host_kind: Some("codex".into()), ..Default::default() };
        let p0 = list_sessions(&es, &f, None, 1).unwrap();
        let c0 = p0.next_cursor.unwrap();
        assert_eq!(c0.store_revision, 1);
        // 无关的 dsh 会话更新（seq 2 → 更高）—— 命中集不变，cursor 仍有效。
        let mut es2 = es.clone();
        es2.push(entry(key("dsh", "z"), "2026-08-03", 99));
        assert!(list_sessions(&es2, &f, Some(&c0), 1).is_ok());
    }

    #[test]
    fn list_sessions_matched_update_stales_cursor() {
        // 命中集出现更高 seq 的新成员（新增/更新）→ per-filter revision bump →
        // 旧 cursor 报 stale-revision。
        let es = vec![
            entry(key("codex", "a"), "2026-08-01", 0),
            entry(key("codex", "b"), "2026-08-02", 1),
        ];
        let f = SessionFilter { host_kind: Some("codex".into()), ..Default::default() };
        let p0 = list_sessions(&es, &f, None, 1).unwrap();
        let c0 = p0.next_cursor.unwrap();
        let mut es2 = es.clone();
        es2.push(entry(key("codex", "c"), "2026-08-04", 5)); // 命中集新成员
        assert_eq!(
            list_sessions(&es2, &f, Some(&c0), 1),
            Err(StoreError::StaleRevision)
        );
    }

    #[test]
    fn list_sessions_wrong_filter_hash_stales() {
        let es = three_entries();
        let f = SessionFilter { host_kind: Some("codex".into()), ..Default::default() };
        let p0 = list_sessions(&es, &f, None, 1).unwrap();
        let c0 = p0.next_cursor.unwrap();
        // 换 filter（hash 变）→ stale-revision
        let f2 = SessionFilter { host_kind: Some("dsh".into()), ..Default::default() };
        assert_eq!(
            list_sessions(&es, &f2, Some(&c0), 1),
            Err(StoreError::StaleRevision)
        );
    }

    #[test]
    fn list_sessions_last_key_removed_stales() {
        let es = three_entries();
        let f = SessionFilter::default();
        let p0 = list_sessions(&es, &f, None, 1).unwrap();
        let c0 = p0.next_cursor.unwrap();
        // 一页翻完后那条 last_key 被删 → 页面边界移动，诚实报 stale。
        let es2: Vec<SessionReportEntry> = es.into_iter().filter(|e| e.key.native_id != "a").collect();
        assert_eq!(
            list_sessions(&es2, &f, Some(&c0), 1),
            Err(StoreError::StaleRevision)
        );
    }

    #[test]
    fn list_sessions_empty_is_honest_page() {
        let page = list_sessions(&[], &SessionFilter::default(), None, 10).unwrap();
        assert_eq!(page.total, 0);
        assert!(page.items.is_empty());
        assert!(page.next_cursor.is_none());
        assert_eq!(page.store_revision, 0);
    }

    // ── read_session ────────────────────────────────────────────

    #[test]
    fn read_session_found_returns_envelope() {
        let es = three_entries();
        let k = key("codex", "a");
        let v = read_session(&es, &k, None).unwrap();
        assert_eq!(v["schema_version"], "1");
        // entry 的 envelope 里 session_key 必须能取回 —— read_session 原样返回
        // 构建时的 envelope（这里 entry() 夹具只放了 schema_version + session）。
        assert_eq!(v["session"], serde_json::json!({}));
    }

    #[test]
    fn read_session_not_found_is_typed_error() {
        assert_eq!(
            read_session(&three_entries(), &key("codex", "missing"), None),
            Err(StoreError::NotFound)
        );
    }

    #[test]
    fn read_session_revision_conflict_is_stale() {
        let es = three_entries();
        assert_eq!(
            read_session(&es, &key("codex", "a"), Some("2026-08-99")),
            Err(StoreError::StaleRevision)
        );
        // 匹配的 revision → Ok
        assert!(read_session(&es, &key("codex", "a"), Some("2026-08-01")).is_ok());
    }

    #[test]
    fn summarize_shape_matches_design() {
        let e = entry(key("codex", "s1"), "2026-08-30", 3);
        let v = summarize(&e);
        assert_eq!(
            v.as_object().unwrap().keys().collect::<Vec<_>>(),
            vec!["session_key", "session_revision", "title", "host_kind", "model",
                 "date_span", "files", "cost_usd", "tokens_total", "findings_total"]
        );
        assert_eq!(v["session_key"]["native_id"], "s1");
        assert_eq!(v["session_revision"], "2026-08-30");
        assert_eq!(v["title"], "标题");
        assert_eq!(v["host_kind"], "codex");
        assert_eq!(v["model"], "gpt-5.6-sol");
        assert_eq!(v["date_span"], json!({"first": "2026-08-01", "last": "2026-08-30"}));
        assert_eq!(v["files"], 2);
        assert_eq!(v["cost_usd"], 1.23);
        assert_eq!(v["tokens_total"], 45678);
        assert_eq!(v["findings_total"], 3);
    }
}
