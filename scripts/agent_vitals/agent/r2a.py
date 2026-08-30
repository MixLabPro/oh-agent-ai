"""R2a SessionStore 的 **Python 镜像**（`docs/R2A_CONTRACT_DESIGN.md`）。

与 Rust 两侧同构：纯规则（SessionKey / 版本闸 / filter / cursor / 分页 /
类型化错误）在本模块，I/O（Codex 填充 + 自有 cache）也在本模块 —— 因为 Python
侧没有「core crate / binary」的 crate 边界，二元结构是文件级的。字节对齐由
`tests/test_r2a.py` 与 `tests/test_cli_matrix.py::both("sessions", ...)` 钉住：
Python 写 cache → Rust 读 cache → 两次 stdout 逐字节一致（generated_at 由
cache 共享；各自重建时归一化）。

**复用铁律**：session 载荷 = `codex_session_audit.codex_session_audit_json`
（与 Rust `codex_session_audit_json` 逐字节对齐），**不发明新字段名**。
machine namespace = `agent.takeover.machine_namespace`（同一份
`data_home()/machine.json`）。

三个设计标推断的决定（与 Rust `core::r2a` 一致，报告 main 复核）：
1. SessionKey 序列化键序固定 host_kind → native_id → source_profile →
   machine_namespace；
2. per-filter StoreRevision = 命中集最大 store_seq；
3. 版本矩阵 MIN=0 / MAX=1 / CURRENT=1。
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from agent_vitals import codex_session_audit as csa
from agent_vitals.agent import codex_cost as codex_cost_mod
from agent_vitals.agent import takeover as takeover_mod
from agent_vitals.adapters import codex_session as codex_session_mod
from agent_vitals.paths import data_home

CURRENT_CONTRACT_VERSION = 1
MIN_CONTRACT_VERSION = 0
MAX_CONTRACT_VERSION = 1
ENGINE_VERSION = "1"


# ── 类型化错误码（§3.3）─────────────────────────────────────────

def _error_codes():
    return ("not-found", "permission", "stale-revision", "schema-mismatch",
            "source-unavailable", "cancelled")


class StoreError(Exception):
    """类型化错误码。`code()` 在 `_error_codes()` 内；JSON 形状与 Rust
    `StoreError::to_json` 一致（紧凑序列化）。"""

    def __init__(self, code, message=""):
        if code not in _error_codes():
            raise ValueError("unknown store error code: %r" % code)
        super().__init__(message)
        self.code = code
        self.message = message

    def to_json(self):
        return {"error": {"code": self.code, "message": self.message}}


class EnvelopeError(Exception):
    """envelope 版本闸的失败。`code` ∈ {"missing-field", "schema-mismatch"}。"""

    def __init__(self, code):
        super().__init__(code)
        self.code = code


# ── FNV-1a（确定性、零依赖，与 Rust `core::r2a::fnv1a64` 同一算法）────

def fnv1a64(data: bytes) -> int:
    h = 0xCBF29CE484222325
    for b in data:
        h ^= b
        h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return h


def _hex16(x: int) -> str:
    return "{:016x}".format(x)


# ── SessionKey（§1.1）────────────────────────────────────────────

class SessionKey:
    __slots__ = ("host_kind", "native_id", "source_profile", "machine_namespace")

    def __init__(self, host_kind, native_id, source_profile, machine_namespace):
        self.host_kind = host_kind
        self.native_id = native_id
        self.source_profile = source_profile
        self.machine_namespace = machine_namespace

    @staticmethod
    def from_json(v):
        if not isinstance(v, dict):
            return None
        for k in ("host_kind", "native_id", "source_profile", "machine_namespace"):
            if not isinstance(v.get(k), str):
                return None
        return SessionKey(v["host_kind"], v["native_id"], v["source_profile"],
                          v["machine_namespace"])

    def to_json(self):
        # 键序是字节一致的一部分，不能重排。
        return {
            "host_kind": self.host_kind,
            "native_id": self.native_id,
            "source_profile": self.source_profile,
            "machine_namespace": self.machine_namespace,
        }

    def ledger_key(self):
        def seg(s):
            return "%d:%s" % (len(s), s)
        return "|".join(seg(x) for x in (self.host_kind, self.native_id,
                                         self.source_profile,
                                         self.machine_namespace))

    def __eq__(self, other):
        return (isinstance(other, SessionKey) and
                self.host_kind == other.host_kind and
                self.native_id == other.native_id and
                self.source_profile == other.source_profile and
                self.machine_namespace == other.machine_namespace)

    def __hash__(self):
        return hash((self.host_kind, self.native_id, self.source_profile,
                     self.machine_namespace))


def sort_key(k):
    """稳定排序四元组 —— 与 Rust `core::r2a` 的排序语义一致（host_kind →
    native_id → source_profile → machine_namespace 的内容字典序）。"""
    return (k.host_kind, k.native_id, k.source_profile, k.machine_namespace)


# ── filter / cursor / page（§3.3）────────────────────────────────

class SessionFilter:
    def __init__(self, host_kind=None, model=None, date_from=None, date_to=None,
                 query=None):
        self.host_kind = host_kind
        self.model = model
        self.date_from = date_from
        self.date_to = date_to
        self.query = query

    def matches(self, e):
        if self.host_kind is not None and e.key.host_kind != self.host_kind:
            return False
        if self.model is not None and e.model != self.model:
            return False
        if self.date_from is not None or self.date_to is not None:
            first = e.date_first
            last = e.date_last
            if first is None or last is None:
                return False
            if self.date_to is not None and first > self.date_to:
                return False
            if self.date_from is not None and last < self.date_from:
                return False
        if self.query is not None:
            q = self.query.lower()
            if (q not in e.key.native_id.lower()
                    and (e.title is None or q not in e.title.lower())):
                return False
        return True

    def hash(self):
        canon = "host={}|model={}|from={}|to={}|q={}".format(
            self.host_kind or "", self.model or "",
            self.date_from or "", self.date_to or "", self.query or "")
        return _hex16(fnv1a64(canon.encode("utf-8")))


class PageCursor:
    def __init__(self, store_revision, filter_hash, last_key):
        self.store_revision = store_revision
        self.filter_hash = filter_hash
        self.last_key = last_key

    def to_json(self):
        return {"store_revision": self.store_revision,
                "filter_hash": self.filter_hash,
                "last_key": self.last_key}

    @staticmethod
    def from_json(v):
        if not isinstance(v, dict):
            return None
        if (not isinstance(v.get("store_revision"), int)
                or not isinstance(v.get("filter_hash"), str)
                or not isinstance(v.get("last_key"), str)):
            return None
        return PageCursor(v["store_revision"], v["filter_hash"], v["last_key"])


class SessionReportEntry:
    __slots__ = ("key", "session_revision", "title", "model", "date_first",
                 "date_last", "files", "cost_usd", "tokens_total",
                 "findings_total", "store_seq", "envelope")

    def __init__(self, key, session_revision, title, model, date_first,
                 date_last, files, cost_usd, tokens_total, findings_total,
                 store_seq, envelope):
        self.key = key
        self.session_revision = session_revision
        self.title = title
        self.model = model
        self.date_first = date_first
        self.date_last = date_last
        self.files = files
        self.cost_usd = cost_usd
        self.tokens_total = tokens_total
        self.findings_total = findings_total
        self.store_seq = store_seq
        self.envelope = envelope


class Page:
    def __init__(self, items, next_cursor, total, store_revision):
        self.items = items
        self.next_cursor = next_cursor
        self.total = total
        self.store_revision = store_revision

    def to_json(self):
        return {
            "items": self.items,
            "next_cursor": self.next_cursor.to_json() if self.next_cursor else None,
            "total": self.total,
            "store_revision": self.store_revision,
        }


def summarize(e):
    return {
        "session_key": e.key.to_json(),
        "session_revision": e.session_revision,
        "title": e.title,
        "host_kind": e.key.host_kind,
        "model": e.model,
        "date_span": {"first": e.date_first, "last": e.date_last},
        "files": e.files,
        "cost_usd": e.cost_usd,
        "tokens_total": e.tokens_total,
        "findings_total": e.findings_total,
    }


# ── envelope（§2.1）──────────────────────────────────────────────

def build_envelope(engine_version, pricing_version, store_revision, generated_at,
                   source_statuses, key, session_revision, session):
    return {
        "schema_version": str(CURRENT_CONTRACT_VERSION),
        "engine_version": engine_version,
        "pricing_version": pricing_version,
        "store_revision": store_revision,
        "generated_at": generated_at,
        "source_statuses": source_statuses,
        "session_key": key.to_json(),
        "session_revision": session_revision,
        "session": session,
    }


def parse_envelope(envelope):
    """版本闸（§2.3）：`schema_version` ∈ [MIN, MAX]。N-1（0）向后兼容；
    N+1（2）schema-mismatch；版本闸不看字段名（独立升级顺序测试）。"""
    sv = envelope.get("schema_version") if isinstance(envelope, dict) else None
    if not isinstance(sv, str):
        raise EnvelopeError("missing-field")
    try:
        major = int(sv)
    except ValueError:
        raise EnvelopeError("schema-mismatch")
    if not (MIN_CONTRACT_VERSION <= major <= MAX_CONTRACT_VERSION):
        raise EnvelopeError("schema-mismatch")


# ── 查询模型（§3.3）─────────────────────────────────────────────

def list_sessions(entries, filter_, cursor, page_size):
    """稳定排序 + cursor 分页 + per-filter 派生 StoreRevision。语义与 Rust
    `core::r2a::list_sessions` 逐字一致：cursor 校验（filter_hash + per-filter
    revision + last_key 存在），无关更新不误拒。"""
    page_size = max(page_size, 1)
    filter_hash = filter_.hash()

    matched = [e for e in entries if filter_.matches(e)]
    matched.sort(key=lambda e: sort_key(e.key))

    filter_rev = max((e.store_seq for e in matched), default=0)

    if cursor is not None:
        if (cursor.filter_hash != filter_hash
                or cursor.store_revision != filter_rev):
            raise StoreError("stale-revision")
        if not any(e.key.ledger_key() == cursor.last_key for e in matched):
            raise StoreError("stale-revision")

    if cursor is not None:
        pos = next((i for i, e in enumerate(matched)
                    if e.key.ledger_key() == cursor.last_key), None)
        start = (pos + 1) if pos is not None else 0
    else:
        start = 0

    page = matched[start:start + page_size]
    next_cursor = None
    if start + len(page) < len(matched):
        last = page[-1]
        next_cursor = PageCursor(filter_rev, filter_hash,
                                 last.key.ledger_key())

    return Page([summarize(e) for e in page], next_cursor, len(matched),
                filter_rev)


def read_session(entries, key, revision):
    entry = next((e for e in entries if e.key == key), None)
    if entry is None:
        raise StoreError("not-found")
    if revision is not None and (entry.session_revision or "") != revision:
        raise StoreError("stale-revision")
    try:
        parse_envelope(entry.envelope)
    except EnvelopeError:
        raise StoreError("schema-mismatch")
    return entry.envelope


# ── 源指纹 / cache（§1.5 / §3.5）────────────────────────────────

def _cache_dir():
    return data_home() / "cache" / "r2a"


def _codex_cache_path():
    return _cache_dir() / "codex-sessions.json"


def fingerprint_file(path):
    """(size, mtime_ns, 首/尾 64 字节 FNV-1a)。仅相等比较。stat/read 失败 →
    None（cache 自然失效，不 abort）。"""
    try:
        st = os.stat(path)
        with open(path, "rb") as f:
            bytes_ = f.read()
    except OSError:
        return None
    first = bytes_[:64]
    last = bytes_[-64:] if bytes_ else b""
    return "%d:%d:%s:%s" % (st.st_size, st.st_mtime_ns,
                            _hex16(fnv1a64(first)), _hex16(fnv1a64(last)))


def codex_source_fingerprints(home=None):
    return [(str(p), fingerprint_file(p) or "")
            for p in codex_session_mod.codex_rollout_files(home)]


def pricing_version():
    pricing = codex_cost_mod.load_codex_pricing()
    s = json.dumps(pricing, ensure_ascii=False, separators=(",", ":"))
    return _hex16(fnv1a64(s.encode("utf-8")))


def _now_iso_utc():
    return datetime.now(timezone.utc).isoformat()


def codex_source_statuses(home, n_sessions):
    roots = codex_session_mod.codex_session_roots_report(home)
    return {
        "codex": {
            "status": "ok",
            "sessions": n_sessions,
            "roots": roots.get("roots", []),
        },
        "dsh": {
            "status": "unavailable",
            "reason": "unsupported-compression",
            "note": "zstd decode lands in R2a Phase 2 (§6.3-1); a dsh list "
                    "request returns source-unavailable, not an empty page (§3.3)",
        },
    }


def extract_summary(payload):
    date_span = payload.get("date_span") or {}
    files = payload.get("files")
    files_n = len(files) if isinstance(files, list) else 0
    cost = payload.get("cost_report") or {}
    cost_usd = cost.get("total_cost_usd")
    tt = cost.get("total_tokens")
    tokens_total = None
    if isinstance(tt, dict):
        tokens_total = sum(v for v in tt.values() if isinstance(v, int))
    audit = payload.get("audit") or {}
    summary = audit.get("summary") or {}
    findings_total = summary.get("findings_total", 0)
    return {
        "title": payload.get("title"),
        "model": payload.get("model"),
        "date_first": date_span.get("first"),
        "date_last": date_span.get("last"),
        "files": files_n,
        "cost_usd": cost_usd,
        "tokens_total": tokens_total,
        "findings_total": findings_total,
    }


def build_entries(raw, generated_at, source_statuses):
    raw.sort(key=lambda kv: sort_key(kv[0]))
    entries = []
    for seq, (key, payload) in enumerate(raw):
        s = extract_summary(payload)
        session_revision = s["date_last"]
        envelope = build_envelope(ENGINE_VERSION, pricing_version(), seq,
                                  generated_at, source_statuses, key,
                                  session_revision, payload)
        entries.append(SessionReportEntry(
            key, session_revision, s["title"], s["model"], s["date_first"],
            s["date_last"], s["files"], s["cost_usd"], s["tokens_total"],
            s["findings_total"], seq, envelope))
    return entries


def entry_from_envelope(env):
    if not isinstance(env, dict):
        return None
    key = SessionKey.from_json(env.get("session_key"))
    if key is None:
        return None
    payload = env.get("session")
    if not isinstance(payload, dict):
        return None
    s = extract_summary(payload)
    session_revision = env.get("session_revision")
    store_seq = env.get("store_revision")
    if not isinstance(store_seq, int):
        return None
    return SessionReportEntry(
        key, session_revision, s["title"], s["model"], s["date_first"],
        s["date_last"], s["files"], s["cost_usd"], s["tokens_total"],
        s["findings_total"], store_seq, env)


def _cache_is_current(cached, fingerprints):
    if not isinstance(cached, dict):
        return False
    fp_list = cached.get("fingerprints")
    if not isinstance(fp_list, list) or len(fp_list) != len(fingerprints):
        return False
    for i, (path, fp) in enumerate(fingerprints):
        entry = fp_list[i]
        if not isinstance(entry, dict):
            return False
        if entry.get("path") != path or entry.get("fingerprint") != fp:
            return False
    return True


def _cache_to_store(cached):
    if not isinstance(cached, dict):
        return None
    generated_at = cached.get("generated_at")
    source_statuses = cached.get("source_statuses")
    entries_json = cached.get("entries")
    if not isinstance(generated_at, str) or not isinstance(entries_json, list):
        return None
    entries = []
    for env in entries_json:
        e = entry_from_envelope(env)
        if e is None:
            return None
        entries.append(e)
    entries.sort(key=lambda e: sort_key(e.key))
    return SessionStore._from_parts(entries, source_statuses, generated_at)


def _read_cache(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _write_cache(path, store, fingerprints):
    doc = {
        "schema_version": "1",
        "source": "codex",
        "fingerprints": [{"path": p, "fingerprint": f}
                         for p, f in fingerprints],
        "built_at": store.generated_at,
        "source_statuses": store.source_statuses,
        "generated_at": store.generated_at,
        "entries": [e.envelope for e in store.entries],
    }
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    except OSError:
        # cache 是「可删 memo」—— 写失败不 abort 查询，只当没写过。
        pass


class SessionStore:
    __slots__ = ("entries", "source_statuses", "generated_at")

    def __init__(self, entries, source_statuses, generated_at):
        self.entries = entries
        self.source_statuses = source_statuses
        self.generated_at = generated_at

    @classmethod
    def _from_parts(cls, entries, source_statuses, generated_at):
        return cls(entries, source_statuses, generated_at)

    @classmethod
    def codex(cls, home=None):
        ns = takeover_mod.machine_namespace()
        generated_at = _now_iso_utc()
        fingerprints = codex_source_fingerprints(home)
        cache_path = _codex_cache_path()

        cached = _read_cache(cache_path)
        if cached is not None and _cache_is_current(cached, fingerprints):
            store = _cache_to_store(cached)
            if store is not None:
                return store

        sessions = csa.codex_session_list(home).get("sessions") or []
        raw = []
        for s in sessions:
            sid = s.get("session_id")
            if not isinstance(sid, str):
                continue
            payload = csa.codex_session_audit_json(home, sid)
            if payload is None:
                continue
            roots = payload.get("workspace_roots")
            if isinstance(roots, list):
                source_profile = ", ".join(
                    r for r in roots if isinstance(r, str))
            else:
                source_profile = ""
            raw.append((SessionKey("codex", sid, source_profile, ns), payload))

        statuses = codex_source_statuses(home, len(raw))
        entries = build_entries(raw, generated_at, statuses)
        store = cls(entries, statuses, generated_at)
        _write_cache(cache_path, store, fingerprints)
        return store

    def list(self, filter_, cursor, page_size):
        return list_sessions(self.entries, filter_, cursor, page_size)

    def read(self, key, revision=None):
        return read_session(self.entries, key, revision)


# ── CLI 面（与 Rust `r2a_store` 的 `sessions list` / `sessions read` 对账）────

def _exit_with_error(e, msg):
    print(json.dumps(e.to_json(), separators=(",", ":")), file=sys.stderr)
    raise SystemExit(2)


def sessions_list(home, host_kind, model, date_from, date_to, query,
                  page_size, cursor_json, json_out):
    if host_kind is not None and host_kind != "codex":
        _exit_with_error(StoreError(
            "source-unavailable",
            "host '%s' is not readable yet: zstd decoding lands in R2a Phase 2 "
            "(codex is the only populated source)" % host_kind), "")
    try:
        store = SessionStore.codex(home)
    except StoreError as e:
        _exit_with_error(e, "session store population failed")
    filter_ = SessionFilter(host_kind=host_kind, model=model,
                            date_from=date_from, date_to=date_to, query=query)
    cursor = None
    if cursor_json is not None:
        try:
            cursor = PageCursor.from_json(json.loads(cursor_json))
        except ValueError:
            cursor = None
        if cursor is None:
            print("invalid --cursor JSON (want store_revision/filter_hash/"
                  "last_key)", file=sys.stderr)
            raise SystemExit(2)
    try:
        page = store.list(filter_, cursor, page_size)
    except StoreError as e:
        _exit_with_error(e, "list failed: cursor stale or filter changed")
    dto = {
        "schema_version": str(CURRENT_CONTRACT_VERSION),
        "engine_version": ENGINE_VERSION,
        "pricing_version": pricing_version(),
        "store_revision": page.store_revision,
        "generated_at": store.generated_at,
        "source_statuses": store.source_statuses,
        "page": page.to_json(),
    }
    text = json.dumps(dto, ensure_ascii=False, indent=2)
    if json_out:
        print(text)
    else:
        print(_render_list(dto), end="")


def sessions_read(home, session_key_json, revision, json_out):
    try:
        key = SessionKey.from_json(json.loads(session_key_json))
    except ValueError:
        key = None
    if key is None:
        _exit_with_error(StoreError(
            "schema-mismatch",
            "invalid --session-key JSON (want host_kind/native_id/"
            "source_profile/machine_namespace)"), "")
    try:
        store = SessionStore.codex(home)
    except StoreError as e:
        _exit_with_error(e, "session store population failed")
    try:
        envelope = store.read(key, revision)
    except StoreError as e:
        _exit_with_error(e, "read failed")
    text = json.dumps(envelope, ensure_ascii=False, indent=2)
    if json_out:
        print(text)
    else:
        print(csa._render_audit(envelope.get("session") or {}), end="")


def _render_list(dto):
    page = dto.get("page") or {}
    items = page.get("items") or []
    out = ["sessions: %d total | store_revision %d | schema %s"
           % (page.get("total", 0), page.get("store_revision", 0),
              dto.get("schema_version", ""))]
    for it in items:
        key = it.get("session_key") or {}
        span = it.get("date_span") or {}
        cost = it.get("cost_usd")
        out.append("%-6s %-16s %-28s %-12s %s"
                   % (key.get("host_kind", ""),
                      key.get("native_id", ""),
                      it.get("title") or "(no title)",
                      span.get("last") or "-",
                      ("$%.2f" % cost) if cost is not None else "-"))
    if page.get("next_cursor"):
        out.append("next_cursor: %s"
                   % json.dumps(page["next_cursor"], separators=(",", ":")))
    return "\n".join(out) + "\n"
