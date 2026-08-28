#!/usr/bin/env python3
"""Build the two Codex rollout fixtures: `legacy.jsonl` + `paginated.jsonl`.

These reproduce the real on-disk rollout format observed from the live corpus
(`~/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-*.jsonl`, plaintext append-only
JSONL, one `{timestamp, type, payload}` envelope per line). §14.1's Rust enum
names are NOT the wire format — these fixtures use the real snake_case /
PascalCase names (see README.md in this directory for the source-of-truth
field-path table). All content is synthetic: invented session IDs, paths,
commands. No user content, nothing scraped from real sessions.

The two files deliberately exercise the §13 Codex (Legacy) vs Codex (Paginated)
columns with *different* coverage — `legacy.jsonl` carries the Legacy-only
`token_count`/`task_started`/`patch_apply_end` events, while `paginated.jsonl`
carries the Paginated-only TurnItems (`CommandExecution`/`FileChange`/
`HookPrompt`). This is what makes the differential assertion "two rows, not
one" (§17.1) meaningful.

Only the Python standard library is used (`json` + the repo's own
`skill_vitals.codex_evidence` for self-verification).

Run:  python3 fixtures/codex/build_codex_fixture.py

Output (in the same directory as this script):
    legacy.jsonl    — a Legacy-mode rollout.
    paginated.jsonl — a Paginated-mode rollout.

The script is deterministic (fixed timestamps / IDs) and self-verifying: after
writing each file it re-opens it, asserts the envelope, and runs
`codex_evidence.derive_coverage` over the parsed items asserting the exact
coverage counts both modes must produce — so a fixture that stops exercising
the mapping table fails loudly instead of silently passing.
"""

import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.normpath(os.path.join(HERE, "..", "..", "scripts"))

# Load `skill_vitals.codex_evidence` without importing the whole package's
# __init__ chain (stdlib-only either way; this keeps the builder independent).
_spec = importlib.util.spec_from_file_location(
    "codex_evidence_selfcheck", os.path.join(SCRIPTS, "skill_vitals", "codex_evidence.py"))
_ce = importlib.util.module_from_spec(_spec)
sys.modules["codex_evidence_selfcheck"] = _ce
_spec.loader.exec_module(_ce)


def j(obj):
    """Serialize compactly, deterministic key order, no ASCII escaping."""
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


# ---------------------------------------------------------------------------
# Wire-format builders (field paths from the live corpus; see README.md)
# ---------------------------------------------------------------------------

def meta(mode, cli_version, session_id):
    """`session_meta` — carries session_id/id/history_mode/cli_version/cwd.
    `payload.model` is deliberately absent (real session_meta model is null)."""
    return {"timestamp": "2026-07-25T11:19:35.404Z",
            "type": "session_meta",
            "payload": {"session_id": session_id, "id": session_id,
                        "history_mode": mode, "cli_version": cli_version,
                        "cwd": "/Users/alice/repo"}}


def turn_context(turn_id, model, roots, approval_policy, sandbox_policy):
    """`turn_context` — the authoritative carrier of `model` and
    `workspace_roots` (session_meta's model is null on the real wire)."""
    return {"timestamp": "2026-07-25T11:19:36.000Z", "type": "turn_context",
            "payload": {"turn_id": turn_id, "cwd": "/Users/alice/repo",
                        "workspace_roots": roots, "model": model,
                        "approval_policy": approval_policy,
                        "sandbox_policy": sandbox_policy}}


def event(event_type, payload_extra=None, ts="2026-07-25T11:19:37.000Z"):
    """One `event_msg` line; `payload.type` is the event type."""
    payload = {"type": event_type, "turn_id": "t1"}
    if payload_extra:
        payload.update(payload_extra)
    return {"timestamp": ts, "type": "event_msg", "payload": payload}


def item_completed(item, ts="2026-07-25T11:20:02.000Z"):
    """Paginated carrier: `event_msg` with `payload.type == "item_completed"`
    wrapping `payload.item.{type, …}`."""
    return {"timestamp": ts, "type": "event_msg",
            "payload": {"type": "item_completed", "turn_id": "t1", "item": item}}


def response(response_type, ts="2026-07-25T11:19:40.000Z"):
    return {"timestamp": ts, "type": "response_item",
            "payload": {"type": response_type}}


# ---------------------------------------------------------------------------
# Fixture data — two rollouts with intentionally different coverage
# ---------------------------------------------------------------------------

def build_legacy():
    """A Legacy-mode rollout: the §13 Legacy column's measured carriers."""
    return [
        meta("legacy", "0.146.0-alpha.3.1", "codex-legacy-0001"),
        turn_context("t1", "gpt-5.6-sol", ["/Users/alice/repo"],
                     "on-request", "workspace-write"),
        event("task_started"),
        event("mcp_tool_call_end", ts="2026-07-25T11:19:38.000Z"),
        event("web_search_end", ts="2026-07-25T11:19:39.000Z"),
        response("custom_tool_call"),
        response("custom_tool_call_output", ts="2026-07-25T11:19:41.000Z"),
        event("patch_apply_end", ts="2026-07-25T11:19:42.000Z"),
        event("context_compacted", ts="2026-07-25T11:19:43.000Z"),
        event("sub_agent_activity", ts="2026-07-25T11:19:44.000Z"),
        event("thread_settings_applied",
              {"thread_settings": {"approval_policy": "Never"}},
              ts="2026-07-25T11:19:45.000Z"),
        event("token_count",
              {"info": {"total_token_usage": 120000, "last_token_usage": 60000,
                        "model_context_window": 128000},
               "rate_limits": {"plan_type": "plus"}},
              ts="2026-07-25T11:19:46.000Z"),
        event("task_complete", ts="2026-07-25T11:19:47.000Z"),
    ]


def build_paginated():
    """A Paginated-mode rollout: TurnItems + response_items the Legacy column
    cannot supply (duration, FileChange, HookPrompt)."""
    return [
        meta("paginated", "0.149.0-alpha.4", "codex-paginated-0002"),
        turn_context("t1", "gpt-5.6-pro", ["/Users/alice/repo", "/Users/alice/data"],
                     "never", "danger-full-access"),
        item_completed({"type": "CommandExecution", "id": "item-1", "duration": 1234,
                        "command": ["bash", "-c", "echo hi"], "exit_code": 0,
                        "stdout": "hi", "stderr": "", "status": "completed",
                        "completed_at_ms": 1750000000000}),
        item_completed({"type": "McpToolCall", "id": "item-2", "tool_call_id": "c1",
                        "name": "mcp__github"}, ts="2026-07-25T11:20:03.000Z"),
        item_completed({"type": "DynamicToolCall", "id": "item-3", "tool_call_id": "c2",
                        "name": "read"}, ts="2026-07-25T11:20:04.000Z"),
        item_completed({"type": "FileChange", "id": "item-4", "file_path": "notes.md",
                        "changes": [], "status": "applied", "auto_approved": True,
                        "completed_at_ms": 1750000000000},
                       ts="2026-07-25T11:20:05.000Z"),
        item_completed({"type": "SubAgentActivity", "id": "item-5",
                        "agent_thread_id": "thread-sub-1", "agent_path": "sub"},
                       ts="2026-07-25T11:20:06.000Z"),
        item_completed({"type": "ContextCompaction", "id": "item-6",
                        "old_len": 500, "new_len": 200}, ts="2026-07-25T11:20:07.000Z"),
        item_completed({"type": "HookPrompt", "id": "item-7", "fragments": []},
                       ts="2026-07-25T11:20:08.000Z"),
        response("function_call", ts="2026-07-25T11:20:09.000Z"),
        response("function_call_output", ts="2026-07-25T11:20:10.000Z"),
    ]


# ---------------------------------------------------------------------------
# Writing + self-verification
# ---------------------------------------------------------------------------

KNOWN_TOP_LEVEL = frozenset((
    "session_meta", "turn_context", "event_msg", "response_item", "world_state",
    "compacted", "inter_agent_communication_metadata"))


def write_jsonl(path, records):
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(j(r) for r in records) + "\n")


def read_jsonl(path):
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f.read().splitlines() if line.strip()]


def assert_envelope(records):
    assert records, "empty rollout"
    assert records[0]["type"] == "session_meta", records[0]
    for record in records:
        assert isinstance(record, dict), record
        assert record["type"] in KNOWN_TOP_LEVEL, record["type"]
        assert isinstance(record.get("payload"), dict), record
    # provenance round-trips through parse_codex_session_log (same reader both
    # implementations use), so the fixture also proves the reader's field paths.
    session_meta = records[0]["payload"]
    assert session_meta["history_mode"] in ("legacy", "paginated"), session_meta


def assert_coverage(path, expected_signals, expected_counts, session_id, mode):
    records = read_jsonl(path)
    assert_envelope(records)
    signals, coverage, unknown = _ce.derive_coverage(records)
    assert not unknown, "fixture should not trip attempts: %s" % (unknown,)
    assert signals == list(expected_signals), (path, signals, expected_signals)
    for signal, expected in expected_counts.items():
        got = coverage[signal]
        assert got["measured"] == expected[0] and got["derived"] == expected[1] \
            and got["lossy"] == expected[2] and got["unmetered"] == expected[3], \
            "%s: %s = %s, expected %s" % (path, signal, got, expected)
    # provenance: session_id + history_mode from the same record the CLI reads.
    assert records[0]["payload"]["session_id"] == session_id, records[0]
    assert records[0]["payload"]["history_mode"] == mode, records[0]


def main():
    legacy_path = os.path.join(HERE, "legacy.jsonl")
    paginated_path = os.path.join(HERE, "paginated.jsonl")
    write_jsonl(legacy_path, build_legacy())
    write_jsonl(paginated_path, build_paginated())

    # Legacy column (§13): the two rows must be different — that is the §17.1
    # "two rows, not one" assertion, pinned at fixture build time.
    assert_coverage(
        legacy_path,
        expected_signals=["ToolCalls", "ToolResults", "TurnBoundaries", "Usage",
                          "UsageAggregate", "ContextWindow", "ApprovalPolicy",
                          "Compaction", "SubagentSpawns", "SkillInvocations",
                          "FileMutations"],
        expected_counts={
            "ToolCalls": (3, 0, 0, 0),      # mcp_tool_call_end + web_search_end + custom_tool_call
            "ToolResults": (1, 0, 0, 0),    # custom_tool_call_output
            "TurnBoundaries": (2, 0, 0, 0), # task_started + task_complete
            "Usage": (1, 0, 0, 0),
            "UsageAggregate": (0, 1, 0, 0), # derived presence marker
            "ContextWindow": (1, 0, 0, 0),
            "ApprovalPolicy": (2, 0, 0, 0), # turn_context + thread_settings_applied
            "Compaction": (1, 0, 0, 0),
            "SubagentSpawns": (1, 0, 0, 0),
            "SkillInvocations": (0, 1, 0, 0),  # derived presence marker
            "FileMutations": (0, 0, 1, 0),  # patch_apply_end → lossy bucket
            "Hooks": (0, 0, 0, 0),          # absent in Legacy, not in SignalSet
            "ApprovalDecisions": (0, 0, 0, 0),
        },
        session_id="codex-legacy-0001", mode="legacy")

    assert_coverage(
        paginated_path,
        expected_signals=["ToolCalls", "ToolResults", "ApprovalDecisions",
                          "ApprovalPolicy", "Compaction", "SubagentSpawns",
                          "SkillInvocations", "Hooks", "FileMutations"],
        expected_counts={
            "ToolCalls": (4, 0, 0, 0),      # CommandExecution + McpToolCall + DynamicToolCall + function_call
            "ToolResults": (2, 0, 0, 0),    # CommandExecution + function_call_output
            "FileMutations": (1, 0, 0, 0),  # FileChange → measured bucket (not lossy)
            "ApprovalDecisions": (1, 0, 0, 0),  # FileChange.auto_approved
            "ApprovalPolicy": (1, 0, 0, 0),     # turn_context only
            "Compaction": (1, 0, 0, 0),
            "SubagentSpawns": (1, 0, 0, 0),
            "SkillInvocations": (0, 1, 0, 0),
            "Hooks": (1, 0, 0, 0),          # HookPrompt — Paginated-only
            "TurnBoundaries": (0, 0, 0, 0), # no task_started/task_complete here
            "Usage": (0, 0, 0, 0),          # no token_count in Paginated fixture
        },
        session_id="codex-paginated-0002", mode="paginated")

    print("wrote %s (%d records) and %s (%d records)"
          % (legacy_path, len(read_jsonl(legacy_path)),
             paginated_path, len(read_jsonl(paginated_path))))
    print("self-verification passed")


if __name__ == "__main__":
    main()
