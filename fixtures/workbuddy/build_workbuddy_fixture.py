#!/usr/bin/env python3
"""Build the WorkBuddy fixture: a synthetic `~/.workbuddy/` home.

This reproduces the real on-disk WorkBuddy shape (`docs/WORKBUDDY_INTEGRATION.md`
§2.1): a sqlite `workbuddy.db` (`sessions` + `session_usage` tables), per-session
`audit-log/<file>.jsonl` decision ledgers, and `file-history/<sessionId>/`
version snapshots. All content is synthetic. Two sessions:

- **s1 健康会话** — three clean audit-log records (two
  `command-safety.sandbox-executed` bash, one `network`+`WebFetch`), a
  continuous hash chain, db rows with `fullAccess` + `credit_json` → the
  healthy-session shape of §10 acceptance #4.
- **s2 审批流程会话** — three approval decisions (approval/`Bash` approved,
  rejection/`Bash` rejected, `file-safety` bulk-delete rejected) + one
  `command-safety.sandbox-executed`, with a **rotated** hash-chain head →
  exercises the approvals axis and the rotation note.

**eventType 词表必须是真机词表**（category 全限定名 / 审批裸 `Bash`，2026-09-02
实测，§2.2 漂移注记）：fixture 写纸面词（'sandbox-executed'/'commandApproved'）
曾让差分门禁两侧同错互证、真机 2,471/2,563 条记录被 evidence 当 unknown 丢弃，
而 fixture 自校验却全绿——fixture 是「真机形状」的代理，写错词就是让门禁测错东西。

`write_workbuddy_home(base)` writes `base/.workbuddy/` and is the single source
the differential tests and the builder's self-verification both consume — a
fixture edit that stops exercising the mapping table fails loudly instead of
silently changing the gate.

Only the Python standard library is used (`sqlite3`), plus the repo's own
`agent_vitals` evidence / composition layers for self-verification.

Run:  python3 fixtures/workbuddy/build_workbuddy_fixture.py

Output (in the same directory as this script):
    workdir/.workbuddy/… — the committed fixture home (tests copy it into a
    temp HOME so the Rust binary reads the same sqlite db via rusqlite).

The script is deterministic (fixed timestamps / hashes) and self-verifying:
after writing it re-opens the home and runs the real evidence + audit
projection, asserting the exact §10 coverage counts, the three-state contract,
and the §9 cost block.

**Shape 对齐真机（2026-09-10 实测）**：`sessions.created_at` / `updated_at` /
`session_usage.updated_at` / audit-log `timestamp` 都是 13 位 epoch-ms 整数
（不是 ISO 串）；`session_usage` 有 `updated_at` 列；credit 量级是「每请求几十
积分」（不是 0.0x）。旧 fixture 的纸面 schema 让 `date_span` 恒 null 却全绿——
与实现同错互证（§3.2/§3.3）。
"""

import calendar
import json
import os
import shutil
import sqlite3
import sys
import time
from pathlib import Path

HERE = Path(os.path.dirname(os.path.abspath(__file__)))
# v0.8 Phase E4 起 `agent_vitals` 包在 packages/agent-vitals-python/（旧路径
# scripts/ 只剩 scan.py 薄壳）——builder 的 sys.path 当时漏改，一并修正。
_PACKAGE_DIR = str(HERE.parent.parent / "packages" / "agent-vitals-python")
if _PACKAGE_DIR not in sys.path:
    sys.path.insert(0, _PACKAGE_DIR)

from agent_vitals.agent import workbuddy_evidence, workbuddy_session_audit  # noqa: E402
from agent_vitals.adapters import workbuddy_session  # noqa: E402


def j(obj):
    """Serialize compactly, deterministic key order, no ASCII escaping."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def _ms(iso):
    """Fixed ISO-8601 (UTC) → epoch **milliseconds** (13-digit int).

    真机 `sessions.created_at` / `sessions.updated_at` /
    `session_usage.updated_at` / audit-log `timestamp` 四处都是 13 位 epoch-ms
    整数（2026-09-10 实测 `~/.workbuddy/workbuddy.db`）。纸面 ISO 串让差分门禁在
    字符串解析路径上空转——`date_span` 恒 null 却全绿（§3.2/§3.3，与 2026-09-02
    词表漂移同款教训：fixture 是「真机形状」的代理，写错型就是让门禁测错东西）。
    纯函数（只依赖入参字符串），deterministic。"""
    return calendar.timegm(time.strptime(iso, "%Y-%m-%dT%H:%M:%SZ")) * 1000


def audit_record(session_id, event_type, sequence, prev_hash, cur_hash,
                 timestamp, request_id, tool_call_id=None, category=None,
                 decision=None, command_preview=None, message_key=None,
                 message_params=None):
    """One audit-log record — the union of fields the evidence layer reads
    (spec §2.2). Missing fields are omitted (the adapter reads by name)."""
    r = {"sessionId": session_id, "eventType": event_type, "sequence": sequence,
         "prevHash": prev_hash, "hash": cur_hash, "timestamp": timestamp,
         "requestId": request_id}
    if tool_call_id is not None:
        r["toolCallId"] = tool_call_id
    if category is not None:
        r["category"] = category
    if decision is not None:
        r["decision"] = decision
    if command_preview is not None:
        r["commandPreview"] = command_preview
    if message_key is not None:
        r["messageKey"] = message_key
    if message_params is not None:
        r["messageParams"] = message_params
    return r


def s1_records():
    """s1 健康会话：连续链（head prevHash="" → 干净起点），2 bash + 1 web_fetch，
    2 distinct requestId → TurnBoundaries derived=2。词表 = 真机（category
    全限定名；WebFetch 裸名 + category=network）。"""
    return [
        audit_record("s1", "command-safety.sandbox-executed", 1, "", "h1",
                     _ms("2026-08-31T09:01:00Z"), "r1", "call-a", "command-safety",
                     "allowed", "ls -la", None, None),
        audit_record("s1", "command-safety.sandbox-executed", 2, "h1", "h2",
                     _ms("2026-08-31T09:02:00Z"), "r1", "call-b", "command-safety",
                     "allowed", "cat README.md", None, None),
        audit_record("s1", "WebFetch", 3, "h2", "h3",
                     _ms("2026-08-31T09:03:00Z"), "r2", "call-c", "network",
                     "allowed", None, None, {"target": "https://example.com"}),
    ]


def s2_records():
    """s2 审批流程会话：head prevHash 无前驱（轮转），3 审批 + 1 bash 执行。
    approval/`Bash` 带 decided allowed-once → SV610 唯一命中点。词表 = 真机：
    审批/拒绝记录 eventType 是裸工具名 `Bash`，靠 category=approval/rejection
    分轴（纸面词 'commandApproved'/'commandRejected' 真机零命中）。"""
    return [
        audit_record("s2", "Bash", 100, "5a5a...rotated", "h100",
                     _ms("2026-08-31T10:00:00Z"), "r1", "call1", "approval",
                     "approved", "rm -rf /tmp/cache", "删除临时缓存目录", None),
        audit_record("s2", "Bash", 101, "h100", "h101",
                     _ms("2026-08-31T10:01:00Z"), "r2", "call2", "rejection",
                     "rejected", "sudo rm -rf /var/log/x", "需要 root 权限清理日志", None),
        audit_record("s2", "file-safety.bulk-delete.rejected", 102, "h101", "h102",
                     _ms("2026-08-31T10:02:00Z"), "r3", "call3", "file-safety",
                     "rejected", None, "批量删除 42 个文件", None),
        audit_record("s2", "command-safety.sandbox-executed", 103, "h102", "h103",
                     _ms("2026-08-31T10:03:00Z"), "r4", "call4", "command-safety",
                     "allowed", "ls -la", None, None),
    ]


def _connect_db(db_path):
    conn = sqlite3.connect(str(db_path))
    # 列类型对齐真机（2026-09-10 实测）：`created_at` / `updated_at` 是 INTEGER
    # （epoch-ms），不是 TEXT；`session_usage` 有 `updated_at INTEGER` 列（在
    # `credit_json` 之前），旧 fixture 整列缺失。真机 `sessions` 有 30 列——适配器
    # 走 `SELECT *` + 按列名取，不必全建，但**建的列类型必须与真机一致**（§3.3）。
    conn.executescript(
        "CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT, model TEXT, "
        "cwd TEXT, permission_mode TEXT, use_sandbox_cli INTEGER, "
        "created_at INTEGER, updated_at INTEGER);"
        "CREATE TABLE session_usage (session_id TEXT PRIMARY KEY, "
        "used INTEGER, size INTEGER, updated_at INTEGER, credit_json TEXT);")
    return conn


def _file_history(root, session_id, hashes):
    """`file-history/<sessionId>/<contentHash>@v<n>` 版本快照文件（spec §3
    Measured 行：文件数 = 版本数）。"""
    d = root / "file-history" / session_id
    d.mkdir(parents=True, exist_ok=True)
    for h, v in hashes:
        (d / ("%s@v%d" % (h, v))).write_text("synthetic version\n", encoding="utf-8")


def write_workbuddy_home(base):
    """写一整套 `base/.workbuddy/`（sqlite db + audit-log + file-history）。是
    fixture 与差分测试共同的单一来源。"""
    base = Path(base)
    root = base / ".workbuddy"
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True)

    conn = _connect_db(root / "workbuddy.db")
    try:
        conn.execute(
            "INSERT INTO sessions (id, title, model, cwd, permission_mode, "
            "use_sandbox_cli, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
            ("s1", "健康会话", "deepseek-v4-flash", "/repo", "fullAccess", 1,
             _ms("2026-08-31T09:00:00Z"), _ms("2026-08-31T09:05:00Z")))
        conn.execute(
            "INSERT INTO sessions (id, title, model, cwd, permission_mode, "
            "use_sandbox_cli, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
            ("s2", "审批流程会话", "deepseek-v4-flash", "/repo", "bypassPermissions",
             1, _ms("2026-08-31T10:00:00Z"), _ms("2026-08-31T10:05:00Z")))
        # credit 量级对齐真机：单请求积分中位 ~22（旧 fixture 的 0.02/0.03 反过来
        # 印证了「把积分当人民币」的单位 bug，§3.1）。s1 两条 requestId 求和
        # 42.01 credit；`_to_cents` 按厘累计（22.53→2253、19.48→1948）。
        conn.execute(
            "INSERT INTO session_usage (session_id, used, size, updated_at, "
            "credit_json) VALUES (?,?,?,?,?)",
            ("s1", 5000, 12345, _ms("2026-08-31T09:05:00Z"),
             '{"r1":22.53,"r2":19.48}'))
        conn.execute(
            "INSERT INTO session_usage (session_id, used, size, updated_at, "
            "credit_json) VALUES (?,?,?,?,?)",
            ("s2", 12000, 90000, _ms("2026-08-31T10:05:00Z"), "{}"))
        conn.commit()
    finally:
        conn.close()

    audit_dir = root / "audit-log"
    audit_dir.mkdir(parents=True, exist_ok=True)
    (audit_dir / "s1.jsonl").write_text(
        "".join(j(r) + "\n" for r in s1_records()), encoding="utf-8")
    (audit_dir / "s2.jsonl").write_text(
        "".join(j(r) + "\n" for r in s2_records()), encoding="utf-8")

    _file_history(root, "s1", [("abc123", 1), ("abc123", 2), ("def456", 1)])
    _file_history(root, "s2", [("abc123", 1), ("def456", 1)])
    return root


def _load_session(root, session_id):
    """重开 home，按生产路径读 db + audit-log + file-history，跑真实 evidence。"""
    db_sessions, db_usage = workbuddy_session.read_workbuddy_db(root)
    recs_by_session, _, degraded = workbuddy_session.read_workbuddy_audit_log(root)
    assert not degraded, "fixture audit-log 必须无坏行，实际 %r" % degraded
    db_rec = db_sessions.get(session_id)
    records = recs_by_session.get(session_id, [])
    meta = workbuddy_session.workbuddy_session_meta(root, session_id, db_rec, db_usage)
    evidence = workbuddy_evidence.build_workbuddy_evidence(records, session_id, meta)
    ev = workbuddy_evidence.workbuddy_evidence_json(evidence)
    audit = workbuddy_session_audit.workbuddy_audit_projection(evidence["canonical"])
    cost = workbuddy_session_audit._cost_of(meta)
    return records, ev, audit, cost


def self_verify(root):
    """fixture 必须钉死 §10 验收 #4 + §9 成本块数字——改了映射表/记录就响亮失败。"""
    root = Path(root)

    # ── s1 健康会话 ──────────────────────────────────────────────
    records, ev, audit, cost = _load_session(root, "s1")
    assert len(records) == 3, "s1 应是 3 条记录，实际 %d" % len(records)
    cov = ev["coverage"]
    assert cov["ToolCalls"]["measured"] == 3, cov["ToolCalls"]
    assert cov["SandboxModes"]["measured"] == 2, cov["SandboxModes"]
    assert cov["NetworkAccess"]["measured"] == 1, cov["NetworkAccess"]
    assert cov["ApprovalDecisions"]["available"] is True, cov["ApprovalDecisions"]
    assert cov["ApprovalDecisions"]["measured"] == 0, cov["ApprovalDecisions"]
    assert cov["TurnBoundaries"]["derived"] == 2, cov["TurnBoundaries"]
    assert cov["ApprovalPolicy"]["measured"] == 1, cov["ApprovalPolicy"]
    assert cov["UsageAggregate"]["measured"] == 1, cov["UsageAggregate"]
    assert cov["FileMutations"]["measured"] == 3, cov["FileMutations"]
    rules = audit["rule_outcomes"]
    for code in ("SV604", "SV605", "SV607", "SV608", "SV609", "SV612", "SV613"):
        assert rules[code]["status"] == "unavailable", (code, rules[code])
    for code in ("SV601", "SV602", "SV603", "SV606", "SV610", "SV611", "SV614"):
        assert rules[code]["status"] == "measured_zero", (code, rules[code])
    assert audit["summary"]["rules_unavailable"] == 7, audit["summary"]
    assert audit["summary"]["findings_total"] == 0, audit["summary"]
    assert ev["notes"][2] == (
        "audit-log hash chain continuous: 3 records (verified from seq=1)"
    ), ev["notes"]
    assert ev["attempts"] == [{
        "source_id": "workbuddy.traces",
        "kind": "Directory",
        "surface": "Traces",
        "available": False,
        "error": ("traces are session-anonymous (no sessionId join); skipped per "
                  "RUNTIME_EVIDENCE_CONTRACT §14.4"),
        "observed_span": None,
    }], ev["attempts"]
    # credit_json {"r1":22.53,"r2":19.48} → 按厘累计 2253+1948 = 4201 credit → 42.01。
    # A3 起 `cny` 键消失：`credits`（积分，非货币）+ `cash_cny`（恒 None，本机无支付
    # 证据）+ `nominal_cny` = 42.01 × 0.05 → 厘累计 round(4201×0.05)=210 → 2.1 +
    # `nominal_basis`（可追溯兑换价串）。
    assert cost == {
        "tokens": 5000,
        "credits": 42.01,
        "cash_cny": None,
        "nominal_cny": 2.1,
        "nominal_basis": "pack-price-public:1000cr=50CNY@2026-07-01",
        "host_billed": True,
    }, cost

    # ── s2 审批流程会话 ──────────────────────────────────────────
    records, ev, audit, cost = _load_session(root, "s2")
    assert len(records) == 4, "s2 应是 4 条记录，实际 %d" % len(records)
    cov = ev["coverage"]
    assert cov["ToolCalls"]["measured"] == 1, cov["ToolCalls"]
    assert cov["SandboxModes"]["measured"] == 1, cov["SandboxModes"]
    assert cov["ApprovalDecisions"]["measured"] == 3, cov["ApprovalDecisions"]
    rules = audit["rule_outcomes"]
    for code in ("SV604", "SV605", "SV607", "SV608", "SV612", "SV613"):
        assert rules[code]["status"] == "unavailable", (code, rules[code])
    assert rules["SV609"]["status"] == "findings", rules["SV609"]
    assert rules["SV609"]["count"] == 3, rules["SV609"]
    assert rules["SV610"]["status"] == "findings", rules["SV610"]
    assert rules["SV610"]["count"] == 1, rules["SV610"]
    findings = audit["findings"]
    assert len(findings) == 4, findings
    assert audit["summary"] == {"critical": 0, "warning": 1, "info": 3,
                                "findings_total": 4, "rules_unavailable": 6}, \
        audit["summary"]
    sv610 = [f for f in findings if f["rule"] == "SV610"]
    assert len(sv610) == 1 and sv610[0]["evidence"] == "allowed-once", sv610
    sv609 = [f for f in findings if f["rule"] == "SV609"]
    assert [f["evidence"] for f in sv609] == [
        "删除临时缓存目录", "需要 root 权限清理日志", "批量删除 42 个文件"], sv609
    assert any("oldest records may be rotated" in n for n in ev["notes"]), ev["notes"]
    # s2 是非积分轨（used=12000、credit_json={}）：`credits`/`nominal_cny` 均 0.0 是
    # 真测量（平台积分轨确实没消耗），不是「没花钱」——审计输出会多一条 note 说明
    # 真实开销在用户自配 API 账户、本机不可见（§6.1、§11 第 14 条）。
    assert cost == {
        "tokens": 12000,
        "credits": 0.0,
        "cash_cny": None,
        "nominal_cny": 0.0,
        "nominal_basis": "pack-price-public:1000cr=50CNY@2026-07-01",
        "host_billed": True,
    }, cost
    full = workbuddy_session_audit.workbuddy_session_audit_json(root.parent, "s2")
    assert any("not observable from this machine" in n for n in full["notes"]), \
        full["notes"]


def main():
    root = write_workbuddy_home(HERE / "workdir")
    self_verify(root)
    print("wrote %s" % root)
    print("self-verification passed")


if __name__ == "__main__":
    main()
