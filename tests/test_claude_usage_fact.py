#!/usr/bin/env python3
"""Stage 1 commit 1：共享 extractor `parse_claude_usage_row` 的钉测。

R1 架构审核（commit d0ec2f2）要求 fold 与未来的 UsageFact emitter 共用
同一个 row parser。本测试只验证 extractor 自身的字段映射与 sentinel
触发条件——不验证 fold 字节一致性（那是 `tests/test_claude_cost.py`
的 `test_python_rust_state_and_stdout_byte_equal` + `golden_runner.py`
的职责）。

跑法：python3 -m unittest tests.test_claude_usage_fact -v
"""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from agent_vitals.agent.claude_usage_fact import (  # noqa: E402
    ClaudeUsageObservation,
    SKIP,
    UNATTRIBUTED,
    UNREADABLE,
    Skip,
    parse_claude_usage_row,
)


VALID_ASSISTANT = {
    "type": "assistant",
    "timestamp": "2026-09-02T03:00:00.000Z",
    "message": {
        "id": "msg_abc123",
        "model": "deepseek-v4-flash",
        "usage": {
            "input_tokens": 100,
            "cache_read_input_tokens": 50,
            "cache_creation_input_tokens": 10,
            "output_tokens": 5,
        },
    },
}


class ParseClaudeUsageRowCase(unittest.TestCase):
    """`parse_claude_usage_row` 的纯函数钉测——不依赖 fold/emit，
    只看字段映射与 sentinel 触发条件。"""

    def test_valid_assistant_returns_observation(self):
        obs = parse_claude_usage_row(
            VALID_ASSISTANT,
            native_session_id="sess-1",
            machine_namespace="ns-1",
            source_profile="default",
        )
        self.assertIsInstance(obs, ClaudeUsageObservation)
        self.assertEqual(obs.native_session_id, "sess-1")
        self.assertEqual(obs.machine_namespace, "ns-1")
        self.assertEqual(obs.source_profile, "default")
        self.assertEqual(obs.observation_kind, "assistant-usage")
        self.assertEqual(obs.source_event_id, "msg_abc123")
        # identity_basis="native"：message.id 取到 → native（不是 derived-hash）。
        self.assertEqual(obs.identity_basis, "native")
        self.assertEqual(obs.ts_iso, "2026-09-02T03:00:00.000Z")
        self.assertEqual(obs.day, "2026-09-02")
        self.assertIsNotNone(obs.ms, "合法 ts 必须解出 epoch ms")
        self.assertEqual(obs.model, "deepseek-v4-flash")
        self.assertEqual(obs.input_tokens, 100)
        self.assertEqual(obs.cache_read_tokens, 50)
        self.assertEqual(obs.cache_write_tokens, 10)
        self.assertEqual(obs.output_tokens, 5)

    def test_non_dict_returns_skip(self):
        """非 dict rec（坏行 / 空行）→ Skip(SKIP)，不增 sentinel。"""
        for bad in [None, "string", 42, [], {"no_type": 1}]:
            result = parse_claude_usage_row(
                bad,
                native_session_id="s",
                machine_namespace="ns",
                source_profile="default",
            )
            self.assertIsInstance(result, Skip)
            self.assertEqual(result.reason, SKIP)

    def test_cost_state_returns_skip(self):
        """cost-state 是累计 baseline，不是 usage observation → Skip(SKIP)。"""
        result = parse_claude_usage_row(
            {"type": "cost-state",
             "modelUsage": {"claude-opus-5": {"inputTokens": 100}}},
            native_session_id="s",
            machine_namespace="ns",
            source_profile="default",
        )
        self.assertIsInstance(result, Skip)
        self.assertEqual(result.reason, SKIP)

    def test_message_not_dict_returns_skip(self):
        """assistant 但 message 不是 dict → Skip(SKIP)，不增 sentinel。
        与旧 `_apply_record` 行为一致。"""
        result = parse_claude_usage_row(
            {"type": "assistant", "timestamp": "2026-09-02T03:00:00.000Z",
             "message": "not a dict"},
            native_session_id="s",
            machine_namespace="ns",
            source_profile="default",
        )
        self.assertIsInstance(result, Skip)
        self.assertEqual(result.reason, SKIP)

    def test_no_usage_returns_skip(self):
        """assistant 但 usage 空 → Skip(SKIP)，不增 sentinel。"""
        result = parse_claude_usage_row(
            {"type": "assistant", "timestamp": "2026-09-02T03:00:00.000Z",
             "message": {"model": "m", "usage": {}}},
            native_session_id="s",
            machine_namespace="ns",
            source_profile="default",
        )
        self.assertIsInstance(result, Skip)
        self.assertEqual(result.reason, SKIP)

    def test_no_model_returns_unreadable(self):
        """有 usage 但缺 model → Skip(UNREADABLE)。旧版 sentinel 同款。"""
        result = parse_claude_usage_row(
            {"type": "assistant", "timestamp": "2026-09-02T03:00:00.000Z",
             "message": {"usage": {"input_tokens": 1, "cache_read_input_tokens": 0,
                                   "cache_creation_input_tokens": 0, "output_tokens": 0}}},
            native_session_id="s",
            machine_namespace="ns",
            source_profile="default",
        )
        self.assertIsInstance(result, Skip)
        self.assertEqual(result.reason, UNREADABLE)

    def test_bad_usage_shape_returns_unreadable(self):
        """usage 两态皆无（真机 P0 哨兵）→ Skip(UNREADABLE)。"""
        result = parse_claude_usage_row(
            {"type": "assistant", "timestamp": "2026-09-02T03:00:00.000Z",
             "message": {"model": "m", "usage": {"prompt_tokens": 1}}},
            native_session_id="s",
            machine_namespace="ns",
            source_profile="default",
        )
        self.assertIsInstance(result, Skip)
        self.assertEqual(result.reason, UNREADABLE)

    def test_unparseable_ts_returns_unattributed(self):
        """ts 不可解析 → Skip(UNATTRIBUTED)。旧版 sentinel 同款。
        4 型 token 都齐：先过 _row_tokens，再到 ts 解析，sentinel 是
        UNATTRIBUTED（不是 UNREADABLE）。"""
        result = parse_claude_usage_row(
            {"type": "assistant", "timestamp": "bogus",
             "message": {"model": "m",
                         "usage": {"input_tokens": 1, "cache_read_input_tokens": 0,
                                   "cache_creation_input_tokens": 0, "output_tokens": 0}}},
            native_session_id="s",
            machine_namespace="ns",
            source_profile="default",
        )
        self.assertIsInstance(result, Skip)
        self.assertEqual(result.reason, UNATTRIBUTED)

    def test_no_message_id_marks_derived_hash(self):
        """message.id 缺场 → identity_basis=derived-hash（commit 2 fallback 链
        会进一步从 uuid / offset+hash 补 source_event_id）。"""
        obs = parse_claude_usage_row(
            {"type": "assistant", "timestamp": "2026-09-02T03:00:00.000Z",
             "message": {"model": "m",
                         "usage": {"input_tokens": 1, "cache_read_input_tokens": 0,
                                   "cache_creation_input_tokens": 0, "output_tokens": 0}}},
            native_session_id="s",
            machine_namespace="ns",
            source_profile="default",
        )
        self.assertIsInstance(obs, ClaudeUsageObservation)
        self.assertIsNone(obs.source_event_id,
                          "message.id 缺场时 commit 1 暂留 None，commit 2 补 fallback")
        self.assertEqual(obs.identity_basis, "derived-hash")

    def test_short_keys_shape_also_accepted(self):
        """`_row_tokens` 嗅两态——短键（真机 0 命中但仍认）也走 Observation。"""
        obs = parse_claude_usage_row(
            {"type": "assistant", "timestamp": "2026-09-02T03:00:00.000Z",
             "message": {"model": "m",
                         "usage": {"input": 1, "cache_read": 2,
                                   "cache_creation": 3, "output": 4}}},
            native_session_id="s",
            machine_namespace="ns",
            source_profile="default",
        )
        self.assertIsInstance(obs, ClaudeUsageObservation)
        self.assertEqual(obs.input_tokens, 1)
        self.assertEqual(obs.cache_read_tokens, 2)
        self.assertEqual(obs.cache_write_tokens, 3)
        self.assertEqual(obs.output_tokens, 4)

    def test_native_session_id_threads_through(self):
        """native_session_id 从 caller 注入，不从 rec 读——R2a SessionKey
        第二层（host_kind/native_id/source_profile/machine_namespace）的
        第 2 段，与 locate 阶段稳定派生对齐。"""
        obs = parse_claude_usage_row(
            VALID_ASSISTANT,
            native_session_id="specific-sid",
            machine_namespace="ns",
            source_profile="default",
        )
        self.assertEqual(obs.native_session_id, "specific-sid",
                         "native_session_id 必须从 caller 注入，extractor 不读 rec")


if __name__ == "__main__":
    unittest.main(verbosity=2)
