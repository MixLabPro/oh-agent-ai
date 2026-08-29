# Codex rollout fixtures

Two synthetic Codex session rollouts, used by the P4 differential tests
(`tests/test_cli_matrix.py`) and the characterization tests
(`tests/test_characterization.py`). Rebuild with:

```bash
python3 fixtures/codex/build_codex_fixture.py
```

The builder is deterministic (fixed timestamps/IDs) and self-verifying: it
re-opens each file and asserts the envelope plus the exact §13 coverage both
modes must produce, so a fixture that stops exercising the mapping table fails
loudly.

## Why these exist

`docs/RUNTIME_EVIDENCE_CONTRACT.md` §17 P4 is the "sound" proof: Codex is the
only host that emits **two incompatible formats without declaring which**
(`history_mode` ∈ {`legacy`, `paginated`}). If one new host + two shapes forces
a structural change in the shared type layer (`CanonicalSession`/`Coverage`/
`RuleSpec`), the model is unsound. The two files deliberately carry **different**
coverage so the differential can assert "two rows, not one" (§17.1):

| | `legacy.jsonl` | `paginated.jsonl` |
|---|---|---|
| history_mode | `legacy` | `paginated` |
| cli_version | `0.146.0-alpha.3.1` | `0.149.0-alpha.4` |
| model | `gpt-5.6-sol` | `gpt-5.6-pro` |
| signals | ToolCalls, ToolResults, TurnBoundaries, Usage, UsageAggregate, ContextWindow, ApprovalPolicy, Compaction, SubagentSpawns, SkillInvocations, FileMutations | ToolCalls, ToolResults, ApprovalDecisions, ApprovalPolicy, Compaction, SubagentSpawns, SkillInvocations, Hooks, FileMutations |
| Tool-call duration | absent | present (`CommandExecution.duration`) |
| FileMutations bucket | `lossy` (`patch_apply_end` only) | `measured` (`FileChange`) |
| Hooks / ApprovalDecisions | zero | measured (`HookPrompt` / `FileChange.auto_approved`) |

## Wire format (source of truth: the live corpus, not §14.1)

§14.1's PascalCase Rust enum names are **not** the wire format. This was
confirmed by re-surveying the live corpus (`~/.codex/sessions/`, 51 rollouts,
date-partitioned `2026/07/…` / `2026/08/…`). The real shape:

- **Envelope** `{timestamp, type, payload}`. Top-level `type` ∈
  `{session_meta, turn_context, event_msg, response_item, world_state,
  compacted, inter_agent_communication_metadata}`.
- **Shape probe** = `session_meta.payload.history_mode` ∈ {`legacy`,
  `paginated`} (lowercase). No content probing needed; mixed streams exist, so
  the reader never branches on mode — one flat type→Signal table handles both.
- **Three parallel item namespaces**, all folded into one coverage table:
  - `event_msg.payload.type` (Legacy events): `token_count`, `task_started` /
    `task_complete`, `thread_settings_applied`, `patch_apply_end`,
    `mcp_tool_call_end`, `web_search_end`, `sub_agent_activity`,
    `context_compacted`, `user_message`, `agent_message`, `agent_reasoning`,
    `thread_rolled_back`, `turn_aborted`, `image_generation_end`,
    `thread_goal_updated`, and `item_completed` (the Paginated carrier).
  - `event_msg.type == "item_completed"` → `payload.item.type` ∈
    `{CommandExecution, FileChange, McpToolCall, DynamicToolCall,
    SubAgentActivity, ContextCompaction, CollabAgentToolCall, Plan, Reasoning,
    AgentMessage, UserMessage, Extension, ImageView}` (`HookPrompt` documented
    in §14.1, absent from this corpus but mapped anyway).
  - `response_item.payload.type` ∈ `{reasoning, custom_tool_call,
    custom_tool_call_output, message, function_call, function_call_output,
    agent_message, tool_search_call, tool_search_output}`.
- **Tokens**: `event_msg.type == "token_count"` → `payload.info.{total_token_usage,
  last_token_usage, model_context_window}` + `payload.rate_limits.{plan_type, …}`.
  `model_context_window` → ContextWindow.
- **provenance**: `session_meta.payload.{session_id, id, history_mode,
  cli_version, cwd}` — **`payload.model` is NULL in session_meta**; `model` and
  `workspace_roots` come from `turn_context.payload` (latest non-empty wins,
  the same "current state" convention as DSH's `last_catalog_wins`).

## Consumers

- `scripts/agent_vitals/adapters/codex_session.py` ↔ `src/codex_session.rs` —
  the JSONL reader (locate → shape → extract).
- `scripts/agent_vitals/agent/codex_evidence.py` ↔
  `crates/agent-vitals-core/src/codex_evidence.rs` — the coverage fold
  (derive → coverage).
- `tests/test_cli_matrix.py::test_codex_evidence_legacy` /
  `test_codex_evidence_paginated` — the byte-for-byte Python↔Rust differential.
