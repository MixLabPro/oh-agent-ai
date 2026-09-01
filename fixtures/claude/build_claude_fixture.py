#!/usr/bin/env python3
"""Build the Claude Code fixture: `healthy.jsonl`.

This reproduces the real on-disk Claude Code JSONL shape
(`~/.claude/projects/<workspace-slug>/<session-id>.jsonl`, one JSON object per
line, each an event record with `type`/`uuid`/`timestamp`/`cwd` and, for message
events, an Anthropic-Message-shaped `message` field: `id`/`model`/`content`/
`usage`). Pure-text user messages carry a *string* content; tool continuations
carry an array of `tool_use`/`tool_result` blocks; a separate `ai-title` record
carries the session title. All content is synthetic.

`healthy.jsonl` is the single fixture for the §10 acceptance gate on the
evidence layer: one rebuilt turn (pure-text user root), two tool calls (one
Bash, one Write), two tool results (one `is_error:true` → lossy `failed`, one
plain → measured `failed:None`), and one title. Write targets `/repo/x.rs`
(inside the workspace root) so SV604/605/606 never fire. The acceptance numbers
it must produce are pinned in this script's self-verification below — the same
numbers `tests/test_cli_matrix.py::test_claude_session_detail_differential`
asserts against the Rust binary, so a fixture edit that stops exercising the
mapping table fails loudly instead of silently changing the gate.

Only the Python standard library is used, plus the repo's own
`agent_vitals.claude_evidence` / `claude_session_audit` for self-verification.

Run:  python3 fixtures/claude/build_claude_fixture.py

Output (in the same directory as this script):
    healthy.jsonl — the healthy Claude session.

The script is deterministic (fixed timestamps / UUIDs) and self-verifying: after
writing it re-parses the file and runs the real evidence + audit projection,
asserting the exact coverage counts and the §10 三态契约 that the fixture must
produce.
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.normpath(os.path.join(HERE, "..", "..", "scripts"))
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)

from agent_vitals.agent import claude_evidence, claude_session_audit  # noqa: E402


def j(obj):
    """Serialize compactly, deterministic key order, no ASCII escaping."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def rec(typ, uuid, ts, **extra):
    r = {"type": typ, "uuid": uuid, "timestamp": ts, "cwd": "/repo"}
    r.update(extra)
    return r


def user_text(uuid, ts, text, model="claude-sonnet-4-5"):
    return rec("user", uuid, ts,
               message={"id": uuid, "model": model, "content": text})


def assistant_tool_use(uuid, ts, name, call_id, input_value):
    return rec("assistant", uuid, ts, message={
        "id": uuid, "model": "claude-sonnet-4-5",
        "content": [{"type": "tool_use", "id": call_id, "name": name,
                     "input": input_value}],
        "usage": {"input_tokens": 1, "output_tokens": 1}})


def user_tool_result(uuid, ts, call_id, is_error=None):
    block = {"type": "tool_result", "tool_use_id": call_id, "content": "done"}
    if is_error is not None:
        block["is_error"] = is_error
    return rec("user", uuid, ts, message={"id": uuid, "content": [block]})


def ai_title(uuid, ts, title):
    return rec("ai-title", uuid, ts, aiTitle=title)


def healthy_records():
    return [
        user_text("m1", "2026-08-20T14:27:00Z", "修复这个 bug"),
        assistant_tool_use("m2", "2026-08-20T14:27:05Z", "Bash", "call1",
                           {"command": "ls -la"}),
        user_tool_result("m3", "2026-08-20T14:27:08Z", "call1", is_error=True),
        assistant_tool_use("m4", "2026-08-20T14:27:12Z", "Write", "call2",
                           {"file_path": "/repo/x.rs",
                            "content": "fn main() {}"}),
        user_tool_result("m5", "2026-08-20T14:27:15Z", "call2", is_error=None),
        ai_title("t1", "2026-08-20T14:30:00Z", "我的会话"),
    ]


def write_healthy():
    path = os.path.join(HERE, "healthy.jsonl")
    with open(path, "w", encoding="utf-8") as fh:
        for r in healthy_records():
            fh.write(j(r) + "\n")
    return path


def self_verify(path):
    """Fixture 必须钉死 §10 验收 #4 的数字——改了映射表/记录就响亮失败。"""
    with open(path, encoding="utf-8") as fh:
        records = [json.loads(line) for line in fh]
    assert len(records) == 6, "健康夹具应是 6 条记录，实际 %d" % len(records)

    evidence = claude_evidence.build_claude_evidence(records, "c0ffee")
    ev = claude_evidence.claude_evidence_json(evidence)
    audit = claude_session_audit.claude_audit_projection(evidence["canonical"])

    cov = ev["coverage"]
    assert cov["ToolCalls"]["measured"] == 2, cov["ToolCalls"]
    assert cov["ToolResults"]["measured"] == 2, cov["ToolResults"]
    assert cov["TurnBoundaries"]["derived"] == 1, cov["TurnBoundaries"]
    assert cov["ApprovalDecisions"]["available"] is False

    rules = audit["rule_outcomes"]
    for code in ("SV607", "SV608", "SV609", "SV610", "SV614"):
        assert rules[code]["status"] == "unavailable", (code, rules[code])
    for code in ("SV601", "SV602", "SV603", "SV604", "SV605", "SV606",
                 "SV611", "SV612", "SV613"):
        assert rules[code]["status"] == "measured_zero", (code, rules[code])
    assert audit["summary"]["rules_unavailable"] == 5
    assert audit["summary"]["findings_total"] == 0


def main():
    path = write_healthy()
    self_verify(path)
    print("wrote %s (%d records)" % (path, len(healthy_records())))
    print("self-verification passed")


if __name__ == "__main__":
    main()
