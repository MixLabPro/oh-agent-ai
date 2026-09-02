"""WorkBuddy 会话读取器 —— 五段式流水线（locate → shape → extract → derive →
coverage）的"locate → shape → extract"三段，I/O 都在这里；"derive → coverage"在
`scripts/agent_vitals/agent/workbuddy_evidence.py`（与 Rust
`crates/agent-vitals-core/src/workbuddy_evidence.rs` 逐字节对齐），I/O 不进去。

与 Rust `src/agent/workbuddy_session.rs` 逐字节对齐——两条实现产出同一份字典，
`tests/test_cli_matrix.py::both()` 的差分靠这份一致把关（Rust 侧 sqlite 读用
rusqlite bundled，spec §1.4——这里是 Python stdlib `sqlite3`，同一份 fixture db
两边都要能读）。

一个 WorkBuddy 会话横跨**三个可 join 表面**（spec §2.1 的 4 表面里 traces 会话
匿名、不算 join 表面）：

- `workbuddy.db` 的 `sessions` 行（id/permission_mode/use_sandbox_cli/model/cwd/
  title/时间戳）——会话锚点；
- `session_usage` 行（session_id/used/size/credit_json）——宿主自计费（spec §9，
  成本直接吃 credit_json，不长第四份价格拷贝）；
- `audit-log/*.jsonl` 里按 `sessionId` **字段**（不是文件名）分组的决策记录；
- `file-history/<sessionId>/` 的版本文件数（FileMutations 源）。

**降级铁律与 claude_session 同款**：db 文件缺失/损坏 → `(None, None)`（不可读绝不
编成 0 会话）；audit-log 目录缺失 → 空 dict（存在性探测）；一条坏 JSON 行 → 跳过
并记 degraded（坏行属于哪个 session 无法指认，不该编进任何会话）；会话无 audit-log
记录但 db 有行 → 真会话，照审（决策账本为空是诚实结果，不是不可读）。"""
import json
import sqlite3

from pathlib import Path


def workbuddy_root(home=None):
    """`~/.workbuddy/`（真实语料实测位置；测试用 isolated_home_env 把 HOME 指到
    fixture root，根就是 `<root>/.workbuddy/`）。Rust 由 main.rs 解析
    `HOME`/`USERPROFILE` 传入同一路径。"""
    if home is None:
        home = Path.home()
    return Path(home) / ".workbuddy"


def _val(rec, key, typ):
    """从一行 db 记录里按类型取一列；列不存在 / 类型不符 → None（缺列报缺——
    编个假类型出来反而会把覆盖计数喂错）。"""
    if not isinstance(rec, dict):
        return None
    value = rec.get(key)
    return value if isinstance(value, typ) else None


def read_workbuddy_db(root):
    """读 `workbuddy.db` 的 `sessions` / `session_usage` 两表 → `(sessions, usage)`，
    各自是 `{id → 行 dict}` / `{session_id → 行 dict}`。**`SELECT *` + 按列名取**——
    真实 schema 会漂移，硬编码列清单一漂就全灭；缺列由 `_val` 报 None。

    降级：db 文件缺失 → `(None, None)`；`sessions` 表读不出来（文件不是 sqlite /
    损坏 / 表被改名）→ 整个 db 不可信，`(None, None)`（**不是** `({}, {})`——空表
    是「确实 0 会话」的真测量，读不出来是「不知道」）；`sessions` 可读但
    `session_usage` 表读不出来 → `(sessions, {})`（usage 列缺，会话照审、成本
    Unavailable）。"""
    db_path = root / "workbuddy.db"
    if not db_path.is_file():
        return None, None
    try:
        conn = sqlite3.connect("file:%s?mode=ro" % db_path, uri=True, timeout=5.0)
    except (sqlite3.Error, OSError):
        return None, None
    try:
        sessions = _read_table(conn, "sessions", "id")
        if sessions is None:
            return None, None
        usage = _read_table(conn, "session_usage", "session_id")
        usage = usage if usage is not None else {}
        return sessions, usage
    finally:
        conn.close()


def _read_table(conn, table, key_col):
    """读一张表 → `{key_col → 行 dict}`；表缺失/读失败 → None（调用方决定是
    降级整库还是只降这一列）。"""
    try:
        cur = conn.execute("SELECT * FROM %s" % table)
    except sqlite3.Error:
        return None
    cols = [d[0] for d in cur.description]
    out = {}
    for row in cur.fetchall():
        rec = dict(zip(cols, row))
        key = rec.get(key_col)
        # 只收字符串键（Rust 侧读表收 String）。SQLite 的 int 主键（如
        # session_id 存成数字）会在这里被跳过——保留 int 键会让 `{key → 行}` 的
        # 字典两侧不同构（评审 P3-7：真实语料 session_id 恒字符串，边缘对齐）。
        if not isinstance(key, str):
            continue
        out[key] = rec
    return out


def read_workbuddy_audit_log(root):
    """读 `audit-log/*.jsonl`（顶层文件，不含 `spool/` 待落盘缓冲）→
    `(records_by_session, file_of, degraded)`：

    - `records_by_session`：`{sessionId → [记录 dict]}`——按 `sessionId` **字段**
      分组（spec §2.1：join 锚点是字段不是文件名；一个文件可能横跨多个会话）。
    - `file_of`：`{sessionId → 首个出现的文件路径}`（`--list`/`file` 字段用它指认
      主账本文件；多文件会话罕见，首文件够诚实）。
    - `degraded`：`[(path, n_or_reason), ...]`——坏 JSON 行 / 无 sessionId 的记录 /
      不可读文件（无法指认归属的账本缺口，记下来由组合层 surface，绝不吞掉）。

    记录跨文件拼接后交给 evidence 层按 `sequence` 排序（并发 spool 写的跳号
    由 sequence 救回来，spec §2.3）。"""
    audit_dir = root / "audit-log"
    records_by_session = {}
    file_of = {}
    degraded = []
    if not audit_dir.is_dir():
        return records_by_session, file_of, degraded
    for path in sorted(audit_dir.glob("*.jsonl"), key=str):
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            degraded.append((str(path), "unreadable"))
            continue
        bad = 0
        for line in text.split("\n"):
            if line.strip() == "":
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                bad += 1
                continue
            if not isinstance(rec, dict):
                bad += 1
                continue
            sid = rec.get("sessionId")
            if not isinstance(sid, str) or not sid:
                bad += 1
                continue
            if sid not in file_of:
                file_of[sid] = str(path)
            records_by_session.setdefault(sid, []).append(rec)
        if bad:
            degraded.append((str(path), "malformed: %d record(s) skipped" % bad))
    return records_by_session, file_of, degraded


def count_workbuddy_file_history(root, session_id):
    """`file-history/<sessionId>/` 下的文件数 = FileMutations 源（spec §3 Measured
    行：`<contentHash>@v<n>` 版本快照数）。目录缺失 → 0（无文件快照是诚实测量，
    不是不可读）。"""
    fh = root / "file-history" / session_id
    if not fh.is_dir():
        return 0
    return sum(1 for p in fh.iterdir() if p.is_file())


def workbuddy_session_meta(root, session_id, db_rec, db_usage):
    """把一个会话的跨表面数据组装成 evidence 层的 `session_meta`。db 行缺失 →
    相关列 None（audit-log 独苗会话照审，元数据降级）；`db_usage is None`（db 整库
    降级）→ used/credit_json None。`file_mutations` 永远有个 int（0 或真实计数）。"""
    meta = {
        "permission_mode": _val(db_rec, "permission_mode", str),
        "use_sandbox_cli": _val(db_rec, "use_sandbox_cli", int),
        "model": _val(db_rec, "model", str),
        "cwd": _val(db_rec, "cwd", str),
        "title": _val(db_rec, "title", str),
        "created_at": _val(db_rec, "created_at", str),
        "updated_at": _val(db_rec, "updated_at", str),
        "used": None,
        "credit_json": None,
    }
    if db_usage is not None:
        usage = db_usage.get(session_id)
        if isinstance(usage, dict):
            meta["used"] = _val(usage, "used", int)
            cj = usage.get("credit_json")
            meta["credit_json"] = cj if isinstance(cj, str) else None
    meta["file_mutations"] = count_workbuddy_file_history(root, session_id)
    return meta


def _is_iso_ts(value):
    return value if isinstance(value, str) else None


def date_span_of(records, meta):
    """会话活动时间跨度：audit-log 记录 timestamp 的 min/max（跨文件全取，ISO 串
    字典序 = 时间序）；无记录 → db 行 created_at/updated_at 兜底。都没有 → None。"""
    stamps = [_is_iso_ts(r.get("timestamp"))
              for r in records if isinstance(r, dict)]
    stamps = [s for s in stamps if s is not None]
    if stamps:
        return {"first": min(stamps), "last": max(stamps)}
    first = meta.get("created_at")
    last = meta.get("updated_at")
    if first is None and last is None:
        return {"first": None, "last": None}
    return {"first": first, "last": last}
