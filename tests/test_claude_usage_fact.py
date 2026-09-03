#!/usr/bin/env python3
"""Stage 1 commit 1：共享 extractor `parse_claude_usage_row` 的钉测。

R1 架构审核（commit d0ec2f2）要求 fold 与未来的 UsageFact emitter 共用
同一个 row parser。本测试只验证 extractor 自身的字段映射与 sentinel
触发条件——不验证 fold 字节一致性（那是 `tests/test_claude_cost.py`
的 `test_python_rust_state_and_stdout_byte_equal` + `golden_runner.py`
的职责）。

跑法：python3 -m unittest tests.test_claude_usage_fact -v
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

_BIN = os.environ.get("AGENT_VITALS_BIN")
_BIN = str(Path(_BIN).resolve()) if _BIN else None
PY_CMD = [sys.executable, str(ROOT / "scripts" / "scan.py")]

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


class EmitEndToEndCase(unittest.TestCase):
    """Stage 1 commit 2：`claude_jsonl_to_usage_facts` 端到端钉测。

    复用 `tests/test_claude_cost.py::ClaudeSyncBothTests` 的真机 fixture
    数据（2279b7b0 / 753e080a / b695a35f 三会话）——见 commit 6421f2a。
    本测试只验 Python 端 emit；Rust 镜像 parity 在 commit 2b 钉测。
    """

    def _write_session(self, d, name, rows):
        d.mkdir(parents=True, exist_ok=True)
        (d / name).write_text(
            "".join(__import__("json").dumps(r) + "\n" for r in rows),
            encoding="utf-8",
        )

    def _real_world_rows(self):
        """复用 commit 6421f2a 真机数字：2279b7b0 / 753e080a / b695a35f。
        ms 约定与 RealWorldMisattributionCase 同款。
        """
        start_0901_bj = 1_788_192_000_000
        start_0901_bj_mid = 1_788_235_200_000
        start_0831_bj_eve = 1_788_170_400_000
        rows_2279 = [
            {"type": "cost-state",
             "timestamp": "2026-09-01T18:00:00.000Z",
             "startTime": start_0901_bj,
             "modelUsage": {"deepseek-v4-flash": {
                 "inputTokens": 0, "outputTokens": 0,
                 "cacheReadInputTokens": 38_700_000,
                 "cacheCreationInputTokens": 0,
                 "webSearchRequests": 0, "costUSD": 0.0}},
             "hasUnknownModelCost": False},
            {"type": "assistant", "timestamp": "2026-09-02T03:00:00.000Z",
             "message": {"id": "msg_2279_1", "model": "deepseek-v4-flash",
                         "usage": {"input_tokens": 0, "cache_read_input_tokens": 1_500_000,
                                   "cache_creation_input_tokens": 0, "output_tokens": 0}}},
            {"type": "assistant", "timestamp": "2026-09-02T05:00:00.000Z",
             "message": {"id": "msg_2279_2", "model": "deepseek-v4-flash",
                         "usage": {"input_tokens": 0, "cache_read_input_tokens": 1_500_000,
                                   "cache_creation_input_tokens": 0, "output_tokens": 0}}},
            {"type": "assistant", "timestamp": "2026-09-02T07:00:00.000Z",
             "message": {"id": "msg_2279_3", "model": "deepseek-v4-flash",
                         "usage": {"input_tokens": 0, "cache_read_input_tokens": 1_500_000,
                                   "cache_creation_input_tokens": 0, "output_tokens": 0}}},
            {"type": "assistant", "timestamp": "2026-09-02T09:00:00.000Z",
             "message": {"id": "msg_2279_4", "model": "deepseek-v4-flash",
                         "usage": {"input_tokens": 0, "cache_read_input_tokens": 1_200_000,
                                   "cache_creation_input_tokens": 0, "output_tokens": 0}}},
        ]
        rows_753e = [
            {"type": "cost-state",
             "timestamp": "2026-09-01T18:00:00.000Z",
             "startTime": start_0901_bj_mid,
             "modelUsage": {"deepseek-v4-flash": {
                 "inputTokens": 0, "outputTokens": 0,
                 "cacheReadInputTokens": 137_100_000,
                 "cacheCreationInputTokens": 0,
                 "webSearchRequests": 0, "costUSD": 0.0}},
             "hasUnknownModelCost": False},
            *[{"type": "assistant",
               "timestamp": "2026-09-02T%02d:00:00.000Z" % h,
               "message": {"id": "msg_753e_%d" % (h // 2), "model": "deepseek-v4-flash",
                           "usage": {"input_tokens": 0, "cache_read_input_tokens": 11_225_000,
                                     "cache_creation_input_tokens": 0, "output_tokens": 0}}}
              for h in (3, 5, 7, 9)],
        ]
        rows_b695 = [
            {"type": "cost-state",
             "timestamp": "2026-09-01T18:00:00.000Z",
             "startTime": start_0831_bj_eve,
             "modelUsage": {"deepseek-v4-flash": {
                 "inputTokens": 0, "outputTokens": 0,
                 "cacheReadInputTokens": 88_300_000,
                 "cacheCreationInputTokens": 0,
                 "webSearchRequests": 0, "costUSD": 0.0}},
             "hasUnknownModelCost": False},
            *[{"type": "assistant",
               "timestamp": "2026-09-02T%02d:00:00.000Z" % h,
               "message": {"id": "msg_b695_%d" % (h // 2), "model": "deepseek-v4-flash",
                           "usage": {"input_tokens": 0, "cache_read_input_tokens": 4_000_000,
                                     "cache_creation_input_tokens": 0, "output_tokens": 0}}}
              for h in (3, 5, 7, 9)],
        ]
        return {"2279b7b0": rows_2279, "753e080a": rows_753e, "b695a35f": rows_b695}

    def test_real_world_197_5M_emit_totals(self):
        """复用 commit 6421f2a 的 2279b7b0 / 753e080a / b695a35f 真机语料：
        - 3 个 cost-state（baseline 对账锚）→ Skip("skip")
        - 4 + 4 + 4 = 12 条 assistant usage row → emit 12 个 UsageFact
        - 总 token cache_read = 66_600_000（5.7 + 44.9 + 16.0 = 66.6M）
        - attempts["skip"] == 3、coverage.fact_rows == 12
        """
        import json
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            tmpd = Path(tmp)
            for name, rows in self._real_world_rows().items():
                self._write_session(tmpd, name + ".jsonl", rows)
            # 三份文件分别 emit，合并 attempts/coverage/facts
            from agent_vitals.agent.claude_usage_fact import claude_jsonl_to_usage_facts
            all_facts = []
            all_attempts = {"skip": 0, "unreadable": 0, "unattributed": 0}
            total_rows = 0
            total_facts = 0
            for name in ("2279b7b0", "753e080a", "b695a35f"):
                result = claude_jsonl_to_usage_facts(
                    tmpd / (name + ".jsonl"),
                    machine_namespace="ns-test",
                    source_profile="default",
                    native_session_id=name,
                )
                all_facts.extend(result.facts)
                for k, v in result.attempts.items():
                    all_attempts[k] = all_attempts.get(k, 0) + v
                total_rows += result.coverage["total_rows"]
                total_facts += result.coverage["fact_rows"]
            self.assertEqual(total_rows, 15, "3 份 × (1 cost-state + 4 assistant) = 15")
            self.assertEqual(total_facts, 12, "12 条 assistant → 12 个 fact")
            self.assertEqual(all_attempts["skip"], 3, "3 个 cost-state → 3 skip")
            # 合计 cache_read tokens = 66.6M（spec §5 后段点名数字）
            cr_total = sum(f["cache_read_tokens"] for f in all_facts)
            self.assertEqual(cr_total, 66_600_000)
            # 每条 fact 的 identity_basis="native"（message.id 取到）
            self.assertTrue(all(f["identity_basis"] == "native" for f in all_facts))
            # fact_id 跨三会话唯一（per-session sid 区别）
            fact_ids = [f["fact_id"] for f in all_facts]
            self.assertEqual(len(fact_ids), 12)
            self.assertEqual(len(set(fact_ids)), 12, "12 条 fact_id 应全唯一")

    def test_two_calls_produce_byte_equal_output(self):
        """`claude_jsonl_to_usage_facts` 必须字节决定（FNV-1a + 固定算法）——
        同输入两次调用输出逐字节相等。这是与 Rust 镜像 byte-parity 钉测的
        Python 端前置条件。"""
        import json
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            tmpd = Path(tmp)
            self._write_session(tmpd, "sid.jsonl", [
                {"type": "assistant",
                 "timestamp": "2026-09-02T03:00:00.000Z",
                 "message": {"id": "msg_byte", "model": "deepseek-v4-flash",
                             "usage": {"input_tokens": 100, "cache_read_input_tokens": 0,
                                       "cache_creation_input_tokens": 0, "output_tokens": 10}}},
            ])
            from agent_vitals.agent.claude_usage_fact import claude_jsonl_to_usage_facts
            r1 = claude_jsonl_to_usage_facts(
                tmpd / "sid.jsonl",
                machine_namespace="ns-byte", source_profile="default",
                native_session_id="sid")
            r2 = claude_jsonl_to_usage_facts(
                tmpd / "sid.jsonl",
                machine_namespace="ns-byte", source_profile="default",
                native_session_id="sid")
            self.assertEqual(
                json.dumps(r1.facts, sort_keys=True),
                json.dumps(r2.facts, sort_keys=True),
                "两次 emit 必须字节相等——FNV-1a hash 与字段映射决定性")
            self.assertEqual(r1.attempts, r2.attempts)
            self.assertEqual(r1.coverage, r2.coverage)


@unittest.skipUnless(_BIN, "未设 AGENT_VITALS_BIN，跳过双实现比对")
class ClaudeUsageFactsBothTests(unittest.TestCase):
    """Stage 1 commit 2b：`claude-usage-facts` 双实现 byte-parity。

    Python `scan.py claude-usage-facts --json -` ↔ Rust 同子命令：同一份混合
    语料（cost-state / 全形 native / 无 message.id→derived-hash→bad_id / 无
    model→unreadable / 坏 ts→unattributed / 短键形状），stdout 逐字节相等。
    `test_two_calls_produce_byte_equal_output` 是 Python 端前置（字节决定）；
    本测试是 commit 2b 的 Rust 镜像钉测——`facts`/`attempts`/`coverage` 键序、
    `attempts` 的 dict 插入序、`fact_id`（FNV-1a + `\x1f` 拼接）跨语言一致。

    Run: AGENT_VITALS_BIN=$PWD/target/release/agent-vitals python3 -m unittest
    tests.test_claude_usage_fact.ClaudeUsageFactsBothTests -v
    """

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp()).resolve()
        self.fixture = self.tmp / "fixture"
        self.fixture.mkdir()
        self.session = self.fixture / "sid-1975m.jsonl"
        # 混合语料：逐行覆盖三类 Skip + bad_id + 两态 token 形状。顺序刻意
        # 交错——attempts 的插入序（skip 先行、bad_id 后补）在 JSON 输出里
        # 必须与 Python dict 一致，不能靠巧合。
        rows = [
            {"type": "cost-state",
             "timestamp": "2026-09-01T18:00:00.000Z",
             "startTime": 1_788_192_000_000,
             "modelUsage": {"deepseek-v4-flash": {
                 "inputTokens": 0, "outputTokens": 0,
                 "cacheReadInputTokens": 38_700_000,
                 "cacheCreationInputTokens": 0,
                 "webSearchRequests": 0, "costUSD": 0.0}},
             "hasUnknownModelCost": False},
            {"type": "assistant", "timestamp": "2026-09-02T03:00:00.000Z",
             "message": {"id": "msg_full_1", "model": "deepseek-v4-flash",
                         "usage": {"input_tokens": 100, "cache_read_input_tokens": 1_500_000,
                                   "cache_creation_input_tokens": 0, "output_tokens": 5}}},
            {"type": "assistant", "timestamp": "2026-09-02T04:00:00.000Z",
             "message": {"model": "deepseek-v4-flash",
                         "usage": {"input_tokens": 200, "cache_read_input_tokens": 0,
                                   "cache_creation_input_tokens": 0, "output_tokens": 7}}},
            {"type": "assistant", "timestamp": "2026-09-02T05:00:00.000Z",
             "message": {"usage": {"input_tokens": 1, "cache_read_input_tokens": 0,
                                   "cache_creation_input_tokens": 0, "output_tokens": 0}}},
            {"type": "assistant", "timestamp": "bogus",
             "message": {"model": "deepseek-v4-flash",
                         "usage": {"input_tokens": 1, "cache_read_input_tokens": 0,
                                   "cache_creation_input_tokens": 0, "output_tokens": 0}}},
            {"type": "assistant", "timestamp": "2026-09-02T06:00:00.000Z",
             "message": {"id": "msg_short_1", "model": "deepseek-v4-flash",
                         "usage": {"input": 10, "cache_read": 20,
                                   "cache_creation": 30, "output": 40}}},
        ]
        self.session.write_text(
            "".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _run(self, cmd):
        env = dict(os.environ)
        env["HOME"] = str(self.fixture)
        env["USERPROFILE"] = str(self.fixture)
        env.pop("AGENT_VITALS_BIN", None)
        return subprocess.run(
            cmd, env=env, capture_output=True, text=True, cwd=str(self.fixture))

    def test_python_rust_json_stdout_byte_equal(self):
        """同一份混合语料：两侧 `--json -` stdout 逐字节相等 + 语义抽查。"""
        args = ["claude-usage-facts", str(self.session),
                "--machine-namespace", "ns-parity",
                "--source-profile", "default", "--json", "-"]
        py = self._run(PY_CMD + args)
        rs = self._run([_BIN] + args)
        self.assertEqual(py.returncode, 0, py.stderr)
        self.assertEqual(rs.returncode, 0, rs.stderr)
        self.assertEqual(
            py.stdout, rs.stdout,
            "claude-usage-facts --json stdout 不一致：\npy:\n%s\nrs:\n%s"
            % (py.stdout, rs.stdout))
        # 语义抽查（锚 spec §5 点名数字/分支——不逐字段重放，byte 相等已是主断言）。
        doc = json.loads(py.stdout)
        self.assertEqual(doc["coverage"]["total_rows"], 6)
        self.assertEqual(doc["coverage"]["fact_rows"], 2)
        self.assertEqual(doc["coverage"]["skip_rows"], 4)
        self.assertEqual(doc["attempts"],
                         {"skip": 1, "unreadable": 1, "unattributed": 1, "bad_id": 1})
        self.assertEqual(len(doc["facts"]), 2)
        ids = [f["fact_id"] for f in doc["facts"]]
        self.assertEqual(len(set(ids)), 2, "两条 fact_id 必须唯一")
        # 两条 fact（全形 1500K + 短键 20）的 cache_read 合计。
        cr = sum(f["cache_read_tokens"] for f in doc["facts"])
        self.assertEqual(cr, 1_500_000 + 20)


if __name__ == "__main__":
    unittest.main(verbosity=2)
