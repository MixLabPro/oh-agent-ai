//! E04：预览绑定的激活生命周期。负责 staging → 校验 → ticket → commit /
//! rollback，以及派生 registry 快照。网络传输刻意不在此层——与 pricing
//! catalog 相同，HTTP 归桌面适配层，核心只吃字节（扩展架构 §8.1/§8.3）。
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use agent_vitals_data::authority::AuthorityDb;
use agent_vitals_data::extension_authority as ledger;
use agent_vitals_data::extension_authority::{ActivationAction, ExtensionError, ExtensionRevision, SlotMap};
use agent_vitals_runtime_core::core::extension_objects::ObjectStore;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};

pub const REGISTRY_SNAPSHOT_SCHEMA: &str = "agent-vitals-registry/v1";
static NEXT: AtomicU64 = AtomicU64::new(0);

#[derive(Debug)]
pub enum InstallError {
    Ledger(ExtensionError),
    Object(&'static str),
    UnknownRevision { revision_id: String },
}
impl From<ExtensionError> for InstallError {
    fn from(value: ExtensionError) -> Self { Self::Ledger(value) }
}
impl From<rusqlite::Error> for InstallError {
    fn from(value: rusqlite::Error) -> Self { Self::Ledger(ExtensionError::Sql(value)) }
}
impl std::fmt::Display for InstallError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Ledger(error) => write!(f, "{error}"),
            Self::Object(code) => write!(f, "{code}"),
            Self::UnknownRevision { revision_id } => write!(f, "unknown revision {revision_id}"),
        }
    }
}
impl std::error::Error for InstallError {}

fn action_tag(action: ActivationAction) -> &'static str {
    match action {
        ActivationAction::Activate => "activate",
        ActivationAction::Rollback => "rollback",
        ActivationAction::Uninstall => "uninstall",
    }
}
fn origin_tag(origin: &ledger::RevisionOrigin) -> &'static str {
    match origin {
        ledger::RevisionOrigin::Local => "local",
        ledger::RevisionOrigin::VendorCatalog { .. } => "vendor-catalog",
    }
}
fn feed(hash: &mut Sha256, line: &str) {
    hash.update(line.as_bytes());
    hash.update(b"\n");
}

/// 预览绑定（§8.1）：ticket 绑定它所针对的 generation、确切候选集与引擎
/// 版本；commit 经台账 CAS 复核，期间的任何激活都会让整张 ticket 失效。
#[derive(Debug, Clone)]
pub struct PreviewTicket {
    pub expected_generation: i64,
    pub engine_version: String,
    pub action: ActivationAction,
    /// 在 commit 事务内新登记的不可变 revision。
    pub new_revisions: Vec<ExtensionRevision>,
    /// **完整替换映射**：省略一个在用 slot 即停用它。
    pub target_map: SlotMap,
}

impl PreviewTicket {
    pub fn preview_sha256(&self) -> String {
        let mut hash = Sha256::new();
        feed(&mut hash, &format!("generation={}", self.expected_generation));
        feed(&mut hash, &format!("engine={}", self.engine_version));
        feed(&mut hash, &format!("action={}", action_tag(self.action)));
        let mut revisions: Vec<&ExtensionRevision> = self.new_revisions.iter().collect();
        revisions.sort_by(|a, b| (&a.slot_type, &a.slot_id, &a.revision_id).cmp(&(&b.slot_type, &b.slot_id, &b.revision_id)));
        for revision in revisions {
            feed(&mut hash, &format!("rev\t{}\t{}\t{}\t{}\t{}\t{}",
                revision.slot_type, revision.slot_id, revision.revision_id,
                revision.content_sha256, origin_tag(&revision.origin), revision.schema_version));
        }
        for ((slot_type, slot_id), revision_id) in &self.target_map {
            feed(&mut hash, &format!("slot\t{slot_type}\t{slot_id}\t{revision_id}"));
        }
        format!("{:x}", hash.finalize())
    }
}

/// 新 revision 的哈希来自 ticket；既有 revision 一律查台账——哈希不猜。
fn content_sha256_for(ticket: &PreviewTicket, conn: &Connection, slot_type: &str, slot_id: &str, revision_id: &str) -> Result<String, InstallError> {
    if let Some(revision) = ticket.new_revisions.iter()
        .find(|r| r.revision_id == revision_id && r.slot_type == slot_type && r.slot_id == slot_id) {
        return Ok(revision.content_sha256.clone());
    }
    conn.query_row(
        "SELECT content_sha256 FROM extension_revisions WHERE revision_id=?1 AND slot_type=?2 AND slot_id=?3",
        params![revision_id, slot_type, slot_id],
        |row| row.get(0),
    ).map_err(|_| InstallError::UnknownRevision { revision_id: revision_id.to_string() })
}

/// §8.3.3：事务之前，映射里每个 revision 的对象必须仍在且通过哈希与
/// JSON 校验；随后单个台账事务完成新 revision 登记、完整映射写入与
/// CAS 指针切换。任一步失败整体不提交。
pub fn commit(db: &AuthorityDb, store: &ObjectStore, ticket: &PreviewTicket, now_ms: i64) -> Result<i64, InstallError> {
    if ticket.engine_version.trim().is_empty() {
        return Err(InstallError::Ledger(ExtensionError::Invalid("empty engine version")));
    }
    for ((slot_type, slot_id), revision_id) in &ticket.target_map {
        let sha = content_sha256_for(ticket, db.conn(), slot_type, slot_id, revision_id)?;
        store.load(&sha).map_err(InstallError::Object)?;
    }
    ledger::activate(db.conn(), ticket.expected_generation, &ticket.new_revisions,
        &ticket.target_map, &ticket.preview_sha256(), ticket.action, now_ms).map_err(InstallError::Ledger)
}

/// 回滚 = 指向历史 generation 完整映射的新激活；revision 不重复登记，
/// 事实与历史 activation 不被抹除（§8.3 / 台账语义）。
pub fn rollback_to(db: &AuthorityDb, store: &ObjectStore, generation: i64, engine_version: &str, now_ms: i64) -> Result<i64, InstallError> {
    let map = ledger::generation_slots(db.conn(), generation)?;
    let ticket = PreviewTicket {
        expected_generation: ledger::current_generation(db.conn())?,
        engine_version: engine_version.to_string(),
        action: ActivationAction::Rollback,
        new_revisions: Vec::new(),
        target_map: map,
    };
    commit(db, store, &ticket, now_ms)
}

/// 停用全部 slot（完整映射语义下的空映射）；revision 历史保留。
pub fn uninstall_all(db: &AuthorityDb, store: &ObjectStore, engine_version: &str, now_ms: i64) -> Result<i64, InstallError> {
    let ticket = PreviewTicket {
        expected_generation: ledger::current_generation(db.conn())?,
        engine_version: engine_version.to_string(),
        action: ActivationAction::Uninstall,
        new_revisions: Vec::new(),
        target_map: SlotMap::new(),
    };
    commit(db, store, &ticket, now_ms)
}

/// 派生快照 `<data_home>/catalog/registry.json`（尽力而为）。authority 是
/// 唯一激活权威：此文件可随时删除重建，不得作为任何授权依据
/// （扩展架构 §5.2/§8.3.5）。写入失败只报错，不撤销已提交激活。
pub fn rebuild_registry_snapshot(data_home: &Path, db: &AuthorityDb, now_ms: i64) -> Result<(), InstallError> {
    let conn = db.conn();
    let generation = ledger::current_generation(conn)?;
    let mut statement = conn.prepare(
        "SELECT s.slot_type, s.slot_id, s.revision_id, r.content_sha256, r.origin, r.installed_at_ms
         FROM extension_activation_slots s
         JOIN extension_revisions r
           ON r.revision_id = s.revision_id AND r.slot_type = s.slot_type AND r.slot_id = s.slot_id
         WHERE s.generation = ?1 ORDER BY s.slot_type, s.slot_id",
    )?;
    let slots = statement.query_map(params![generation], |row| {
        Ok(serde_json::json!({
            "slot_type": row.get::<_, String>(0)?,
            "slot_id": row.get::<_, String>(1)?,
            "revision_id": row.get::<_, String>(2)?,
            "content_sha256": row.get::<_, String>(3)?,
            "origin": row.get::<_, String>(4)?,
            "installed_at_ms": row.get::<_, i64>(5)?,
        }))
    })?.collect::<Result<Vec<_>, _>>()?;
    let snapshot = serde_json::json!({
        "schema": REGISTRY_SNAPSHOT_SCHEMA,
        "generation": generation,
        "rebuilt_at_ms": now_ms,
        "slots": slots,
    });
    let catalog = data_home.join("catalog");
    std::fs::create_dir_all(&catalog).map_err(|_| InstallError::Object("object_io"))?;
    let bytes = serde_json::to_vec_pretty(&snapshot).map_err(|_| InstallError::Object("object_io"))?;
    let temporary = catalog.join(format!(".registry-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
    std::fs::write(&temporary, &bytes).map_err(|_| InstallError::Object("object_io"))?;
    match std::fs::rename(&temporary, catalog.join("registry.json")) {
        Ok(()) => Ok(()),
        Err(_) => {
            let _ = std::fs::remove_file(&temporary);
            Err(InstallError::Object("object_io"))
        }
    }
}
