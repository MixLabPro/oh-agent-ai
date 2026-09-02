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

import functools
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from agent_vitals import codex_session_audit as csa
from agent_vitals.agent import behavior as behavior_mod
from agent_vitals.agent import budget as budget_mod
from agent_vitals.agent import claude_session_audit as claude_audit_mod
from agent_vitals.agent import codex_cost as codex_cost_mod
from agent_vitals.agent import codex_usage as codex_usage_mod
from agent_vitals.agent import takeover as takeover_mod
from agent_vitals.adapters import claude_session as claude_session_mod
from agent_vitals.adapters import codex_session as codex_session_mod
from agent_vitals.adapters import dsh as dsh_mod
from agent_vitals.paths import data_home
from agent_vitals.util import split_lines

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


def _opt_desc(x, y):
    """DESC 序且 None last：degraded 会话没有日期/revision，诚实排最后。"""
    if x is None and y is None:
        return 0
    if x is None:
        return 1
    if y is None:
        return -1
    return -1 if x > y else (1 if x < y else 0)


def recent_cmp(a, b):
    """「最近 N」权威排序比较器 —— 与 Rust `core::r2a::recent_cmp` 锁步
    （spec §5.2 / §6 决策 2）。键序：`date_span.last DESC（None last）→
    session_revision DESC（None last）→ SessionKey ASC（sort_key）`。

    排序发生在数据层、分页之前：`sessions list` 是 SessionKey 四元组序不是
    时间序，第一页 50 条页内取最近 ≠ 全局最近。导航命令读全量 summaries
    按此排完取前 N，不分页；不改 list 语义（spec §11）。"""
    c = _opt_desc(a.date_last, b.date_last)
    if c:
        return c
    c = _opt_desc(a.session_revision, b.session_revision)
    if c:
        return c
    return -1 if sort_key(a.key) < sort_key(b.key) else (1 if sort_key(a.key) > sort_key(b.key) else 0)


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


def _claude_cache_path():
    return _cache_dir() / "claude-sessions.json"


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


def claude_source_fingerprints(home=None):
    """Claude Code 源指纹：`~/.claude/projects/**/*.jsonl` 全量 walk（复用
    `claude_project_files`，与 codex 同款），按全局路径序。
    mirror `r2a_store::claude_source_fingerprints`。"""
    return [(str(p), fingerprint_file(p) or "")
            for p in claude_session_mod.claude_project_files(home)]


def pricing_version():
    pricing = codex_cost_mod.load_codex_pricing()
    s = json.dumps(pricing, ensure_ascii=False, separators=(",", ":"))
    return _hex16(fnv1a64(s.encode("utf-8")))


def _now_iso_utc():
    return datetime.now(timezone.utc).isoformat()


def codex_source_statuses(home, n_sessions):
    """Codex 源状态（进 envelope 的 `source_statuses` 与 list DTO）：status + 会话
    数 + 根存在性。**只报自己构建的源**：单源 store 的 envelope 只说自己，不替
    没构建的 DSH 猜一个状态——Phase 1 把 DSH 硬报成 `unavailable` 是 zstd 未接线
    时的过渡谎言，zstd 落地后那句「读不了」不再成立，而一个没扫描的源既不是 ok
    也不是 unavailable，是「本次没构建」。要看到两个源的真实状态，走
    `SessionStore.all`（no-filter），它合并两边的状态。mirror
    `r2a_store::codex_source_statuses`。"""
    roots = codex_session_mod.codex_session_roots_report(home)
    return {
        "codex": {
            "status": "ok",
            "sessions": n_sessions,
            "roots": roots.get("roots", []),
        },
    }


def dsh_source_fingerprints(home=None):
    """DSH 源指纹：`<home>/.dsh/sessions/**/session.jsonl[.zstd]` 的文件指纹列表，
    按 `dsh_session_files` 的全局路径序。mirror `r2a_store::dsh_source_fingerprints`。"""
    dsh_root = Path(home) / ".dsh" if home is not None else Path.home() / ".dsh"
    return [(str(p), fingerprint_file(p) or "")
            for p in dsh_mod.dsh_session_files(dsh_root)]


def _dsh_cache_path():
    return _cache_dir() / "dsh-sessions.json"


def dsh_source_statuses(home, files, degraded):
    """DSH 源状态。三态（§5.2 / §4.3 诚实降级），mirror `r2a_store::dsh_source_statuses`：

      · `files` 为空（sessions 根缺席或没有会话文件）→ `ok`，sessions 0 —— 诚实零，
        **不是** unavailable（「没有 DSH」和「有 DSH 但读不了」是两回事）；
      · 全部文件成功构建 → `ok`，sessions = built；
      · 部分构建（built > 0 < files）→ `ok` + `degraded` 逐文件透传；
      · 文件在但一个都读不了（built == 0）→ `unavailable` —— 源真的不可读，CLI
        面对 `--host-kind dsh` 报 source-unavailable 错误码，**不是空页**（§3.3）。
    """
    dsh_root = Path(home) / ".dsh" if home is not None else Path.home() / ".dsh"
    roots = dsh_mod.dsh_session_roots_report(dsh_root)
    built = len(files) - len(degraded)
    status = "ok" if not files or built > 0 else "unavailable"
    degraded_val = None if not degraded else [
        {"path": p, "reason": r} for p, r in degraded]
    return {
        "dsh": {
            "status": status,
            "sessions": built,
            "roots": roots.get("roots", []),
            "degraded": degraded_val,
        },
    }


def claude_source_statuses(home, files_n, built):
    """Claude Code 源状态。**DSH 式三态**（不是 codex 的恒 ok），mirror
    `r2a_store::claude_source_statuses`：

      · files 空（`~/.claude/projects` 缺席或没有 jsonl）→ `ok`，sessions 0 ——
        诚实零（没装 Claude Code ≠ 不可读），**不是** unavailable；
      · built > 0 → `ok`；
      · files > 0 但 built == 0（文件在但一个都构建不出）→ `unavailable` —— 源
        真的不可读，CLI 面对 `--host-kind claude-code` 报 source-unavailable
        错误码，**不是空页**（§4.3）。claude 按 session 构建、逐文件 degraded 的
        概念不引入（那是 dsh 的专属粒度）；损坏文件每次重试，与 codex 同款。

    `roots` = `claude_session_roots_report`（`~/.claude/projects` 单根报告）。"""
    roots = claude_session_mod.claude_session_roots_report(home)
    status = "ok" if files_n == 0 or built > 0 else "unavailable"
    return {
        "claude-code": {
            "status": status,
            "sessions": built,
            "roots": roots.get("roots", []),
        },
    }


def merge_statuses(a, b):
    """合并两个单源 statuses（codex + dsh + claude-code）成 `all` store 的完整
    statuses。键序稳定：claude-code 在前、codex 次之、dsh 在后（JSON 键序是字节
    一致的一部分——dict 保持插入序，必须先并 claude 再挂 codex+dsh）。
    mirror `r2a_store::merge_statuses`。"""
    merged = dict(a)
    merged.update(b)
    return merged


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


def dsh_header(text):
    """从**已解压文本**读会话头：`id` + `cwd`。`id` 缺失 → None（无法建
    SessionKey）。只读头行。mirror `r2a_store::dsh_header`。"""
    line = next((l for l in split_lines(text) if l.strip()), None)
    if line is None:
        return None
    try:
        v = json.loads(line.strip())
    except json.JSONDecodeError:
        return None
    if not isinstance(v, dict):
        return None
    id_ = v.get("id")
    if not isinstance(id_, str):
        return None
    cwd = v.get("cwd")
    return (id_, cwd if isinstance(cwd, str) else None)


def dsh_session_revision(text):
    """DSH 的 SessionRevision（§4.4）= 最大 `seq`（seq 单调不减，样本首 0 /
    末 16201）。从头到整个文本扫（不是只看末行）：fork 边界事件的 seq 是 null，
    且「单调不减」是实测属性不是语言保证，最大才算稳。没有任何 seq → None。
    mirror `r2a_store::dsh_session_revision`。"""
    max_seq = -1
    for line in split_lines(text):
        if not line.strip():
            continue
        try:
            v = json.loads(line.strip())
        except json.JSONDecodeError:
            continue
        if isinstance(v, dict):
            seq = v.get("seq")
            if isinstance(seq, int) and not isinstance(seq, bool) and seq > max_seq:
                max_seq = seq
    return str(max_seq) if max_seq >= 0 else None


def dsh_source_profile(cwd):
    """DSH 的 source_profile（§1.3）= 会话头 `cwd` 清洗后的项目路径：
    `--{cwd.replace('/', "-")}--`。cwd 缺失 → 空串（诚实缺失；native_id 全局
    唯一，空 source_profile 不会撞键）。mirror `r2a_store::dsh_source_profile`。"""
    if cwd is None:
        return ""
    return "--%s--" % cwd.replace("/", "-")


def _utc_civil_date(ms):
    """epoch 毫秒 → UTC 日期 `YYYY-MM-DD`。与 Rust `civil_from_unix_secs(ms/1000, 0)`
    同一天（Hinnant civil-from-days @ UTC；Python `fromtimestamp` 显式 UTC，避免
    本地时区偏移）。"""
    return datetime.fromtimestamp(ms / 1000, timezone.utc).strftime("%Y-%m-%d")


def dsh_extract_summary(payload):
    """DSH 源的 summary 派生列（§2.5 / §4.4）。DSH 的 `session` 载荷是
    `behavior --json` 的 19 键形状（§2.4），没有 Codex 形状的
    `date_span`/`files`/`cost_report`/`audit` 字段——派生列全部从既有键里读，
    **不发明新字段名**。mirror `r2a_store::dsh_extract_summary`：

      · title：workspace.json 查找，population 时以 appended `title` 键并入载荷；
      · model = 最后一次 usage 请求（`requests[-1]`）的模型；
      · date_span = `requests[].time`（epoch 毫秒）的最小/最大值 → UTC 日期；
      · files = 1（DSH 一个日志文件 = 一个会话）；
      · cost_usd = None（`behavior` 的 `cost` 是 CNY 币种，`cost_usd` 是 USD
        字段，诚实缺失，绝不把人民币当美元填）；
      · tokens_total = `usage.by_model` 每模型 **4 个非 peak 桶**之和；
      · findings_total = `findings` 数组长度。
    """
    requests = payload.get("requests")
    model = None
    if isinstance(requests, list) and requests:
        last = requests[-1]
        if isinstance(last, dict):
            model = last.get("model")
    min_ms = max_ms = None
    if isinstance(requests, list):
        for r in requests:
            if isinstance(r, dict):
                t = r.get("time")
                if isinstance(t, int) and not isinstance(t, bool):
                    min_ms = t if min_ms is None else min(min_ms, t)
                    max_ms = t if max_ms is None else max(max_ms, t)
    tokens_total = None
    by_model = (payload.get("usage") or {}).get("by_model")
    if isinstance(by_model, dict):
        total = 0
        for b in by_model.values():
            if not isinstance(b, dict):
                continue
            for k in ("uncached_input_tokens", "output_tokens",
                      "cache_read_tokens", "cache_write_tokens"):
                v = b.get(k)
                if isinstance(v, int) and not isinstance(v, bool):
                    total += v
        tokens_total = total
    findings = payload.get("findings")
    return {
        "title": payload.get("title"),
        "model": model,
        "date_first": _utc_civil_date(min_ms) if min_ms is not None else None,
        "date_last": _utc_civil_date(max_ms) if max_ms is not None else None,
        "files": 1,
        "cost_usd": None,
        "tokens_total": tokens_total,
        "findings_total": len(findings) if isinstance(findings, list) else 0,
    }


def summary_for(key, payload):
    """按 host_kind 分发 summary 派生（DSH 形状 vs Codex 形状）。
    mirror `r2a_store::summary_for`。"""
    if key.host_kind == "dsh":
        return dsh_extract_summary(payload)
    return extract_summary(payload)


def build_entries(raw, generated_at, source_statuses):
    """`raw` 是 (key, payload, session_revision) 三元组；revision 为 None 的
    （Codex）由载荷 date_last 派生。mirror `r2a_store::build_entries`。"""
    raw.sort(key=lambda kv: sort_key(kv[0]))
    entries = []
    for seq, (key, payload, revision) in enumerate(raw):
        s = summary_for(key, payload)
        session_revision = revision if revision is not None else s["date_last"]
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
    # DSH 载荷是 behavior 19 键形状，派生列走 dsh_extract_summary（含缓存往返
    # 必需的 appended `title` 键）；Codex 走 extract_summary。
    s = summary_for(key, payload)
    session_revision = env.get("session_revision")
    store_seq = env.get("store_revision")
    if not isinstance(store_seq, int):
        return None
    return SessionReportEntry(
        key, session_revision, s["title"], s["model"], s["date_first"],
        s["date_last"], s["files"], s["cost_usd"], s["tokens_total"],
        s["findings_total"], store_seq, env)


def _cache_v2_to_store(cached, fingerprints):
    """v2 cache 纯命中恢复（mirror `r2a_store` 的 read_cache_v2 + kept_sessions +
    kept_degraded + 纯命中判定 + cache_v2_to_store 一整条链）。

    v1 缓存（顶层单一 `fingerprints` 数组）或任何形状不认识的文档一律返回 None
    ——调用方当「缓存不存在」处理，落回全量重建并写一份 v2（Rust 同判，不做就地
    迁移：v1/v2 两种形状拼不起来）。这是 cache-share 双向字节对账的支点：**读侧
    必须复用 cache 文档里冻结的 `generated_at`**（§6.3-9 的字节一致含墙钟字段），
    否则读一次就重折一次、盖一次新墙钟，两侧永远对不上——#7 的 6 个红测试
    就是这个：Python 写 v1 / 只读 v1，跨实现缓存永远 miss，墙钟字段必然不同。

    命中判定（一条都不能差，缺任一 → 全量重建）：
      · schema_version == "3"，sessions/degraded 形状完好（平行数组等长且非空）；
      · 每条缓存 session 的**全部**依赖路径指纹与当前源表一致（部分命中不拼凑）；
      · 每条缓存 degraded 记录的指纹与当前源表一致（DSH 读不了的文件没变就不
        重试解压；Codex 无 degraded，恒空）；
      · 当前源表里每个文件都被某条 kept session 或 kept degraded 覆盖。
    """
    if not isinstance(cached, dict):
        return None
    if cached.get("schema_version") != "3":
        return None
    session_docs = cached.get("sessions")
    if not isinstance(session_docs, list):
        return None
    fp_map = dict(fingerprints)
    kept = []
    covered = set()
    for s in session_docs:
        paths = s.get("paths")
        fps = s.get("fingerprints")
        envelope = s.get("envelope")
        if (not isinstance(paths, list) or not isinstance(fps, list)
                or not isinstance(envelope, dict)):
            return None
        # 平行数组长度不一致或没有任何依赖路径 → 这条记录形状本身就坏了，整份
        # 缓存不值得信任（不做「部分行能读就先用着」这种没有测试能钉住的半信
        # 半疑语义），落回全量重建（Rust read_cache_v2 同判）。
        if len(paths) != len(fps) or not paths:
            return None
        if any(not isinstance(p, str) or not isinstance(f, str)
               for p, f in zip(paths, fps)):
            return None
        # kept_sessions：全部依赖路径与当前指纹表一致，一条都不能差，否则整条
        # 判脏（一个 session 可能横跨多个 rollout 文件）。
        if any(fp_map.get(p) != f for p, f in zip(paths, fps)):
            return None
        e = entry_from_envelope(envelope)
        if e is None:
            return None
        kept.append(e)
        covered.update(paths)
    degraded = cached.get("degraded")
    if degraded is not None and not isinstance(degraded, list):
        return None
    degraded = degraded if isinstance(degraded, list) else []
    kept_deg = 0
    for d in degraded:
        p, fp, r = d.get("path"), d.get("fingerprint"), d.get("reason")
        if not isinstance(p, str) or not isinstance(fp, str) or not isinstance(r, str):
            return None
        # kept_degraded：指纹没变才算覆盖——变了/文件消失 → 不覆盖 → 落到重建
        # 重新尝试（长期损坏的文件不该每次点 tab 都重试解压，但内容变了必须重试）。
        if fp_map.get(p) == fp:
            kept_deg += 1
            covered.add(p)
    # 纯命中三连：所有缓存 session 都 keep、所有缓存 degraded 都 keep、所有当前
    # 源文件都被覆盖（= Rust 的 to_process.is_empty() && kept 全量 && kept_deg 全量）。
    if len(kept) != len(session_docs):
        return None
    if kept_deg != len(degraded):
        return None
    if any(p not in covered for p, _ in fingerprints):
        return None
    generated_at = cached.get("generated_at")
    source_statuses = cached.get("source_statuses")
    if not isinstance(generated_at, str) or not isinstance(source_statuses, dict):
        return None
    kept.sort(key=lambda e: sort_key(e.key))
    return SessionStore._from_parts(kept, source_statuses, generated_at)


def _read_cache(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _codex_built_paths(payload, fp_map):
    """Codex 一个逻辑 session 依赖的源文件路径 = 载荷 `files` 数组（resume 续写
    产生新 rollout 文件、沿用旧 session_id——payload 自带的 `files` 就是这个
    session 依赖的**全部**源路径，不用另外发明映射）。指纹按当前源表取；文件已
    从源消失 → 空串（`unwrap_or_default` 镜像——写进 cache 后下次读时
    kept_sessions 对不上指纹自然判脏落回重建，不 abort）。
    mirror `r2a_store::codex_built_session_for` 的 paths/fingerprints 段。"""
    files = payload.get("files")
    if not isinstance(files, list):
        return [], []
    paths = [f for f in files if isinstance(f, str)]
    return paths, [fp_map.get(p, "") for p in paths]


def _write_cache(path, source, store, paths_fps, degraded):
    """v3 cache 文件形状（§3.5 可删 app cache）：`{schema_version:"3", source,
    built_at, source_statuses, generated_at, sessions:[{paths, fingerprints,
    envelope}], degraded:[{path, fingerprint, reason}]}`。`store.entries[i]` 与
    `paths_fps[i]` 必须同序——两者都源自 `_entries_with_paths` 里同一次排序后
    的 `built`，不是事后再配对（mirror `r2a_store::write_cache_v2`）。`source`
    按源取值（"codex"/"dsh"）——v1 时代硬编码 "codex" 让 dsh 缓存源标错，跨实
    现读不出正确 source。键序与 serde_json `json!` 的插入序一致，字节可比对。

    v3 = v2 加一条规则：envelope payload 增加 `cost_series` 键后（2026-09），
    增量失效只看源文件指纹会让旧 envelope 无限期沿用、费用曲线静默消失，所以
    抬一版 schema 强制一次性冷启动重建（mirror `r2a_store` 文件头注释）。"""
    doc = {
        "schema_version": "3",
        "source": source,
        "built_at": store.generated_at,
        "source_statuses": store.source_statuses,
        "generated_at": store.generated_at,
        "sessions": [
            {"paths": ps, "fingerprints": fp, "envelope": e.envelope}
            for e, (ps, fp) in zip(store.entries, paths_fps)
        ],
        "degraded": [
            {"path": p, "fingerprint": f, "reason": r}
            for p, f, r in degraded
        ],
    }
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    except OSError:
        # cache 是「可删 memo」—— 写失败不 abort 查询，只当没写过。
        pass


def _entries_with_paths(built, generated_at, source_statuses):
    """`built` 是 (key, payload, session_revision, paths, fingerprints) 五元组
    （paths 是会话依赖的源文件路径，fingerprints 是各路径当前指纹）。按 key 排
    序后，用同一次排序派生 entries 与对齐的 (paths, fingerprints) 平行列表——
    v2 cache 的 `sessions[i]` 与 `store.entries[i]` 必须同序。路径是写缓存专用
    的元数据，不混进 build_entries 的 (key, payload, revision) 契约（mirror
    `r2a_store::build_entries`，那侧也不带；Codex 与 DSH 共用）。"""
    built.sort(key=lambda u: sort_key(u[0]))
    raw = [(k, p, r) for k, p, r, _ps, _f in built]
    entries = build_entries(raw, generated_at, source_statuses)
    paths_fps = [(ps, f) for _k, _p, _r, ps, f in built]
    return entries, paths_fps


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
        fp_map = dict(fingerprints)
        cache_path = _codex_cache_path()

        cached = _read_cache(cache_path)
        if cached is not None:
            store = _cache_v2_to_store(cached, fingerprints)
            if store is not None:
                return store

        sessions = csa.codex_session_list(home).get("sessions") or []
        built = []
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
            paths, fps = _codex_built_paths(payload, fp_map)
            built.append((SessionKey("codex", sid, source_profile, ns),
                          payload, None, paths, fps))

        statuses = codex_source_statuses(home, len(built))
        entries, paths_fps = _entries_with_paths(built, generated_at, statuses)
        store = cls(entries, statuses, generated_at)
        # Codex 没有 degraded 概念（读不了的 rollout 直接被 codex_session_audit_json
        # 跳过），写 cache 时恒空数组——Rust 侧同写 Vec::new()。
        _write_cache(cache_path, "codex", store, paths_fps, [])
        return store

    @classmethod
    def dsh(cls, home=None):
        """从 DSH 源填充（§5.2，zstd 落地后）。`<home>/.dsh/sessions/**/
        session.jsonl[.zstd]` 逐文件：解压 → 头行（id + cwd）→
        `behavior.audit_payload`（复用 19 键载荷）→ workspace.json 查标题 →
        PendingEntry。读不了的（解压失败/畸形/无 id）逐文件记进 `degraded`，
        **绝不数成 0 条真数据**（§4.3）。标题不在 behavior 载荷里（来自
        workspace.json），但 summary 派生列必须能从 envelope 的 `session` 载荷
        重算（缓存往返，`entry_from_envelope`）——所以标题以 **appended `title`
        键** 并入载荷（复用既有字段名，§2.4 不发明新字段名）。
        mirror `r2a_store::SessionStore::dsh`。"""
        ns = takeover_mod.machine_namespace()
        generated_at = _now_iso_utc()
        fingerprints = dsh_source_fingerprints(home)
        fp_map = dict(fingerprints)
        cache_path = _dsh_cache_path()

        cached = _read_cache(cache_path)
        if cached is not None:
            store = _cache_v2_to_store(cached, fingerprints)
            if store is not None:
                return store

        dsh_root = (Path(home) / ".dsh" if home is not None
                    else Path.home() / ".dsh")
        files = dsh_mod.dsh_session_files(dsh_root)
        by_session, _archived = dsh_mod.read_workspace_index(dsh_root)

        built = []
        # (path, fingerprint, reason) 三元组：指纹随 degraded 一起进 v2 cache，
        # 内容没变下次就不重试解压（Rust DegradedTriple 同形，§4.3）。指纹在记录
        # 时刻从当前源表取——文件此刻就在 files 里，必然有指纹。
        degraded = []
        for path in files:
            path_str = str(path)
            fp = fp_map.get(path_str, "")
            text, read_err = dsh_mod.read_session_text(path)
            if read_err is not None:
                degraded.append((path_str, fp, read_err))
                continue
            # 头行有效性由 parse_session_log 验（type=="session" && version==0），
            # 这里只抽 id + cwd；parse 已通过但缺 id → 无法建键 → missing-header。
            if dsh_mod.parse_session_log(text).get("degraded"):
                degraded.append((path_str, fp, "missing-header"))
                continue
            hdr = dsh_header(text)
            if hdr is None:
                degraded.append((path_str, fp, "missing-header"))
                continue
            id_, cwd = hdr
            payload = behavior_mod.audit_payload(path)
            if payload is None:
                # 读之间文件被截断/替换（parse 干净但 audit 重建失败）→ 文件级降级。
                degraded.append((path_str, fp, "file-missing"))
                continue
            if id_ in by_session:
                payload["title"] = by_session[id_][1]
            # DSH 1 文件 = 1 逻辑 session：paths 就是这单个文件，指纹取当前源表。
            built.append((SessionKey("dsh", id_, dsh_source_profile(cwd), ns),
                          payload, dsh_session_revision(text),
                          [path_str], [fp]))

        # statuses 要的仍是 (path, reason) 对（mirror r2a_store 的 degraded_pairs
        # 派生）；三元组是 v2 cache 专用，不进 source_statuses。
        degraded_pairs = [(p, r) for p, _f, r in degraded]
        statuses = dsh_source_statuses(home, files, degraded_pairs)
        entries, paths_fps = _entries_with_paths(built, generated_at, statuses)
        store = cls(entries, statuses, generated_at)
        _write_cache(cache_path, "dsh", store, paths_fps, degraded)
        return store

    @classmethod
    def claude_code(cls, home=None):
        """从 Claude Code 源填充（§5 第三源）。镜像 Python `codex` 的路径
        （Python 侧 `_cache_v2_to_store` 是 ALL-OR-NOTHING 全命中判定，没有 Rust
        的 per-session 增量——输出仍逐字节对齐，差分门只看输出）：
        `claude_source_fingerprints`（`~/.claude/projects/**/*.jsonl`）→
        `cache/r2a/claude-sessions.json` v2 缓存 → 全命中走快路径 → 否则
        `claude_session_list` 全量重建（每 sid 调 `claude_session_audit_json`，
        读不了的直接跳过，**绝不数成 0 条真数据**）。
        `source_profile` = payload `cwd` 的 dsh 同款清洗（`--{cwd.replace('/',
        '-')}--`）；`revision: None`（载荷 date_last 派生，codex 同款）。
        mirror `r2a_store::SessionStore::claude_code`。"""
        ns = takeover_mod.machine_namespace()
        generated_at = _now_iso_utc()
        fingerprints = claude_source_fingerprints(home)
        fp_map = dict(fingerprints)
        cache_path = _claude_cache_path()
        files_n = len(fingerprints)

        cached = _read_cache(cache_path)
        if cached is not None:
            store = _cache_v2_to_store(cached, fingerprints)
            if store is not None:
                return store

        sessions = claude_audit_mod.claude_session_list(home).get("sessions") or []
        built = []
        for s in sessions:
            sid = s.get("session_id")
            if not isinstance(sid, str):
                continue
            payload = claude_audit_mod.claude_session_audit_json(home, sid)
            if payload is None:
                continue
            cwd = payload.get("cwd")
            source_profile = dsh_source_profile(cwd if isinstance(cwd, str) else None)
            paths, fps = _codex_built_paths(payload, fp_map)
            built.append((SessionKey("claude-code", sid, source_profile, ns),
                          payload, None, paths, fps))

        statuses = claude_source_statuses(home, files_n, len(built))
        entries, paths_fps = _entries_with_paths(built, generated_at, statuses)
        store = cls(entries, statuses, generated_at)
        # claude 没有 degraded 概念（读不了的 jsonl 直接被 audit_json 跳过），
        # 写 cache 时恒空数组——Rust 侧同写 Vec::new()。
        _write_cache(cache_path, "claude-code", store, paths_fps, [])
        return store

    @classmethod
    def all(cls, home=None):
        """合并 codex + dsh + claude-code 三个单源 store（no-filter = 全部源）。
        **没有自己的合并 cache**——每次把三个子 store 合并（各子 store 走自己的
        cache 快路径），`generated_at` 取三边的 max。`source_statuses` 合并成
        `{claude-code, codex, dsh}` 完整视图（键序 = 插入序 = 字节序）。
        mirror `r2a_store::SessionStore::all`。"""
        codex_store = cls.codex(home)
        dsh_store = cls.dsh(home)
        claude_store = cls.claude_code(home)
        entries = (list(codex_store.entries) + list(dsh_store.entries)
                   + list(claude_store.entries))
        entries.sort(key=lambda e: sort_key(e.key))
        return cls(entries,
                   merge_statuses(
                       claude_store.source_statuses,
                       merge_statuses(codex_store.source_statuses,
                                      dsh_store.source_statuses)),
                   max(codex_store.generated_at,
                       dsh_store.generated_at,
                       claude_store.generated_at))

    def list(self, filter_, cursor, page_size):
        return list_sessions(self.entries, filter_, cursor, page_size)

    def read(self, key, revision=None):
        return read_session(self.entries, key, revision)


# ── CLI 面（与 Rust `r2a_store` 的 `sessions list` / `sessions read` 对账）────

def _exit_with_error(e, msg):
    # ensure_ascii=False：Rust 侧 serde_json 原样输出 UTF-8（`§4.3` 不会转义成
    # §），差分测试逐字节对账 stderr——Python 必须同规则。
    print(json.dumps(e.to_json(), separators=(",", ":"), ensure_ascii=False),
          file=sys.stderr)
    raise SystemExit(2)


def sessions_list(home, host_kind, model, date_from, date_to, query,
                  page_size, cursor_json, json_out):
    # 按 host-kind 分发源（与 Rust `sessions_list` 同一张表）：
    #   · codex → 只填充 codex 源；
    #   · dsh → 只填充 dsh 源；**文件在但一个都读不了** → 类型化
    #     source-unavailable（错误码，不是空页，§4.3/§3.3）；「根本没有 DSH」
    #     是诚实零 → 空页；
    #   · claude-code → 只填充 claude-code 源；unavailable 判定与 dsh 同款
    #     （文件在但一个都构建不出 → 错误码；没装 Claude Code → 诚实零 → 空页）；
    #   · 未知 kind → source-unavailable（错误码，不是静默空）；
    #   · no-filter → `SessionStore::all`（三源合并，source_statuses 给完整视图）。
    if host_kind == "codex":
        try:
            store = SessionStore.codex(home)
        except StoreError as e:
            _exit_with_error(e, "session store population failed")
    elif host_kind == "dsh":
        try:
            store = SessionStore.dsh(home)
        except StoreError as e:
            _exit_with_error(e, "session store population failed")
        if store.source_statuses.get("dsh", {}).get("status") == "unavailable":
            _exit_with_error(StoreError(
                "source-unavailable",
                "dsh source unavailable: session files exist but none are "
                "decodable (§4.3)"), "")
    elif host_kind == "claude-code":
        try:
            store = SessionStore.claude_code(home)
        except StoreError as e:
            _exit_with_error(e, "session store population failed")
        if store.source_statuses.get("claude-code", {}).get("status") == "unavailable":
            _exit_with_error(StoreError(
                "source-unavailable",
                "claude-code source unavailable: session files exist but none "
                "are decodable (§4.3)"), "")
    elif host_kind is not None:
        _exit_with_error(StoreError(
            "source-unavailable", "unknown host kind '%s'" % host_kind), "")
    else:
        try:
            store = SessionStore.all(home)
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
    # 按 key 的 host_kind 读对应源（与 Rust `sessions_read` 同一张表）：读 codex
    # key 不用为 dsh 付扫描钱，反之亦然。
    if key.host_kind == "codex":
        try:
            store = SessionStore.codex(home)
        except StoreError as e:
            _exit_with_error(e, "session store population failed")
    elif key.host_kind == "dsh":
        try:
            store = SessionStore.dsh(home)
        except StoreError as e:
            _exit_with_error(e, "session store population failed")
    elif key.host_kind == "claude-code":
        try:
            store = SessionStore.claude_code(home)
        except StoreError as e:
            _exit_with_error(e, "session store population failed")
    else:
        _exit_with_error(StoreError(
            "source-unavailable", "unknown host kind '%s'" % key.host_kind), "")
    try:
        envelope = store.read(key, revision)
    except StoreError as e:
        _exit_with_error(e, "read failed")
    text = json.dumps(envelope, ensure_ascii=False, indent=2)
    if json_out or key.host_kind in ("dsh", "claude-code"):
        # dsh / claude-code 没有 CLI 的 HTML 渲染器（那是 Tauri 审计 tab 的
        # 活）——非 --json 的 read 直接给 pretty JSON，不走 codex 渲染器
        # （`_render_audit` 是 codex 专属形状，喂 claude/dsh 载荷会渲染错）。
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


# ── sessions navigation（多宿主导航投影，spec §5.1/§5.2）──────────
# 镜像 `r2a_store.rs` 的 `sessions_navigation` 及其纯助手。键序是字节一致的
# 一部分（serde_json preserve_order 按 json! 字面量序输出，dict 必须同序）；
# 人读渲染逐字节复刻 Rust（差分门比 stdout）。


def sessions_navigation(home, day, timezone_, recent_n, json_out):
    """多宿主导航投影：一次 spawn 返回两宿主快照（`docs/
    MENUBAR_MULTIHOST_NAVIGATION_SPEC.md` §5.1/§5.2）。排序、日界折叠、
    覆盖率、会话计数全部是数据层的测量（§6 决策 3）——Tauri 只缓存渲染，不
    重新解释。宿主失败彼此隔离：store 构建失败 / 该宿主无数据源 → 对应宿主
    `unavailable`，不 abort 全命令；托盘宿主区失败不影响顶层今日/预算行（§8）。
    mirror `r2a_store.rs::sessions_navigation`。"""
    if timezone_ != "Asia/Shanghai":
        # json.dumps → 双引号，与 Rust `{timezone:?}` 的 Debug 引号逐字节一致
        # （差分门比 stderr）。
        sys.stderr.write(
            "unsupported --timezone %s: only Asia/Shanghai (core day boundary "
            "is fixed UTC+8, no DST; §5.1)\n" % json.dumps(timezone_, ensure_ascii=False))
        raise SystemExit(2)

    # 两宿主 store 独立构建：失败各自降级（unavailable），不 abort——与
    # sessions_list 的 exit-with-error 不同面：导航是托盘固定两行的投影，
    # 一个宿主失败不能拖垮整个菜单刷新。
    try:
        dsh_store = SessionStore.dsh(home)
    except StoreError:
        dsh_store = None
    try:
        codex_store = SessionStore.codex(home)
    except StoreError:
        codex_store = None

    # DSH 今日 token：today.json → 当日 token。`today_tokens_for_day` 是
    # `compute_today_cost` 的 day 参数化（后者硬编码真实今天）；date 不符 /
    # 缺场 / buckets 与 by_model 皆空 → None（缺列不编列，spec §5.2
    # basis=state-file，与 Tauri 顶层钱行同一份 today.json）。
    today_data = None
    today_path = data_home() / "state" / "today.json"
    if today_path.is_file():
        try:
            today_data = json.loads(today_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            today_data = None
    tokens = None if today_data is None else budget_mod.today_tokens_for_day(today_data, day)
    if tokens is None:
        # spec：DSH coverage 恒 complete——state 折叠的覆盖率是 state 层自己的
        # 轴（日历已单独展示），菜单不重复读。
        dsh_today_tokens = {"value": None, "basis": None, "coverage": "complete"}
    else:
        dsh_today_tokens = {"value": tokens, "basis": "state-file",
                            "coverage": "complete"}

    # Codex 今日 token：全 rollout 折叠（codex-cost 同一条链路，§2.3）。只在
    # 该宿主有数据源时折叠——无源反正 unavailable，省掉整次折叠 I/O。
    codex_merged = None
    if codex_store is not None and host_has_source("codex", codex_store):
        folds = []
        for path in codex_session_mod.codex_rollout_files(home):
            parsed = codex_session_mod.read_codex_session_log(path)
            items = parsed.get("items") if isinstance(parsed, dict) else None
            folds.append(codex_usage_mod.codex_fold_file(items or []))
        codex_merged = codex_usage_mod.codex_merge_folds(folds)
    if codex_merged is None:
        codex_today_tokens = {"value": None, "basis": None, "coverage": None}
    else:
        codex_today_tokens = codex_today_tokens_json(
            codex_merged, day, zero_sessions=len(codex_store.entries) == 0)

    hosts = [
        host_snapshot("dsh", dsh_store, dsh_today_tokens, day, recent_n),
        host_snapshot("codex", codex_store, codex_today_tokens, day, recent_n),
    ]
    # envelope 的 generated_at 取两 store 中较新的构建时刻（`SessionStore.all`
    # 的 max 同款语义；缓存共享时两侧逐字节一致——差分门靠它）。两 store 都
    # 失败时用当前时刻（该形态没有可共享的墙钟）。
    candidates = [s.generated_at for s in (dsh_store, codex_store) if s is not None]
    generated_at = max(candidates) if candidates else _now_iso_utc()
    envelope = {
        "schema_version": 1,
        "day_key": day,
        "timezone": timezone_,
        "generated_at": generated_at,
        "hosts": hosts,
    }
    if json_out:
        print(json.dumps(envelope, ensure_ascii=False, indent=2))
    else:
        sys.stdout.write(render_navigation(envelope))


def host_snapshot(host_kind, store, today_tokens, day_key, recent_n):
    """单宿主快照组装（纯，可测）。`store` None = 构建失败 → 整宿主
    `unavailable`（spec §8：宿主区失败不 abort、也不摆 0 冒充）。「该宿主无
    数据源」——store 的 `source_statuses[host].roots` 全 exists=false（~/.codex
    或 ~/.dsh 从未安装；与 `sessions list` 的「没有 DSH = 诚实零」不同面：
    托盘固定渲染两行，未安装的宿主显示「—」而不是「0 会话」，spec §8）——
    同样 unavailable。DSH store 自报 `unavailable`（文件在但一个都读不了，
    §4.3）也归这一档。mirror `r2a_store.rs::host_snapshot`。"""
    def unavailable():
        return {"host_kind": host_kind, "status": "unavailable",
                "today_tokens": None, "today_sessions": None,
                "recent": [], "store_revision": None}

    if store is None or not host_has_source(host_kind, store):
        return unavailable()
    statuses = store.source_statuses.get(host_kind) if isinstance(
        store.source_statuses, dict) else None
    if isinstance(statuses, dict) and statuses.get("status") == "unavailable":
        return unavailable()

    # 今日会话数：date_span 与 [day_key, day_key] 交叠（`SessionFilter.matches`
    # 同语义）；无日期的 degraded 会话不计入。这是「今天碰过的会话」计数，不是
    # token 归属判定——跨日会话计 1 次是对的，它今天确实活跃（spec §5.2）。
    filter_ = SessionFilter(host_kind=host_kind, date_from=day_key,
                            date_to=day_key)
    today_sessions = sum(1 for e in store.entries if filter_.matches(e))

    # 最近 N：**全量排序后取前 N**，不分页（§6 决策 2——`sessions list` 是
    # SessionKey 序，页内取最近 ≠ 全局最近；导航命令读全量 summaries 排完取
    # 前 N）。比较器 `recent_cmp` 在 core（r2a.rs ↔ r2a.py 锁步）。
    ordered = sorted(store.entries, key=functools.cmp_to_key(recent_cmp))
    recent = []
    for e in ordered[:recent_n]:
        recent.append({
            # session_key 原样透传（SessionKey::to_json 的 4 字段对象），
            # 深链时 `sessions read` 期待同形状。
            "session_key": e.key.to_json(),
            "title": e.title,
            "model": e.model,
            "tokens_total": e.tokens_total,
            "date_first": e.date_first,
            "date_last": e.date_last,
            "revision": e.session_revision,
        })

    # store_revision：no-filter 的 per-filter 派生 revision（命中集最大
    # store_seq，与 `list_sessions` 同款推导；空 store → 0）。
    store_revision = max((e.store_seq for e in store.entries), default=0)
    status = "ready" if today_tokens.get("value") is not None else "partial"
    return {"host_kind": host_kind, "status": status,
            "today_tokens": today_tokens, "today_sessions": today_sessions,
            "recent": recent, "store_revision": store_revision}


def host_has_source(host_kind, store):
    """「该宿主有数据源」= store 的 `source_statuses[host].roots` 里至少一个
    根 exists=true（见 `host_snapshot` 的语义注释）。mirror
    `r2a_store.rs::host_has_source`。"""
    statuses = store.source_statuses.get(host_kind) if isinstance(
        store.source_statuses, dict) else None
    roots = statuses.get("roots") if isinstance(statuses, dict) else None
    return (isinstance(roots, list) and any(
        isinstance(r, dict) and r.get("exists") is True for r in roots))


def codex_today_tokens_json(merged, day_key, zero_sessions):
    """Codex 今日 token（spec §5.2 basis=events）：全折叠 → `codex_aggregate_hours`
    → 当日桶之和 + coverage。真值表与 Rust 同款（`r2a_store.rs::codex_today_tokens_json`）：

      · 零会话（store 可读且无会话）→ 0（真零，诚实测量不是编造）；
      · `by_hour_model` 空（读到了会话但没计量）→ value=null、coverage=null
        （诚实「测不出」）；
      · 当日桶存在 → value=和、coverage=partial（残差哨兵 tokens_seen>0，当日
        数可能是下界）/ complete；
      · 当日桶缺席（他日有计量、今天没有）→ value=null（「当日桶之和」的诚实
        形态——spec 只给零会话一个显式 0，「今天没跑」与「今天没测到」不混成
        一个 0）。
    """
    if zero_sessions:
        return {"value": 0, "basis": "events", "coverage": "complete"}
    by_hour = merged.get("by_hour_model") if isinstance(merged, dict) else None
    if not isinstance(by_hour, dict) or not by_hour:
        return {"value": None, "basis": None, "coverage": None}
    by_date = codex_usage_mod.codex_aggregate_hours(by_hour)
    value = codex_usage_mod.codex_day_tokens(by_date, day_key)
    if value is None:
        return {"value": None, "basis": None, "coverage": None}
    unaccounted = merged.get("unaccounted") if isinstance(merged, dict) else None
    coverage = ("partial" if codex_usage_mod.unaccounted_tokens_seen(unaccounted) > 0
                else "complete")
    return {"value": value, "basis": "events", "coverage": coverage}


def render_navigation(env):
    """人读的导航投影（`--json` 之外）——逐字节复刻 `r2a_store.rs::
    render_navigation`（差分门比的是整行 stdout）。L2 文案与 Tauri 菜单同一批
    （spec §8：「会话数据暂不可用」/「尚无会话」）。"""
    out = ["navigation %s (schema %s)" % (
        env.get("day_key", ""), env.get("schema_version", 0))]
    for h in env.get("hosts") or []:
        kind = h.get("host_kind", "")
        status = h.get("status", "")
        tk = h.get("today_tokens") or {}
        val = tk.get("value")
        ts = h.get("today_sessions")
        out.append("%-8s %-11s %s · %s 会话" % (
            kind, status,
            str(val) if val is not None else "—",
            str(ts) if ts is not None else "—"))
        if status == "unavailable":
            out.append("          · 会话数据暂不可用")
            continue
        recent = h.get("recent") or []
        if not recent:
            out.append("          · 尚无会话")
            continue
        for r in recent:
            d = r.get("date_last")
            m = r.get("model")
            t = r.get("tokens_total")
            out.append("          · %s · %s · %s" % (
                d if d is not None else "—",
                m if m is not None else "—",
                str(t) if t is not None else "—"))
    return "\n".join(out) + "\n"
