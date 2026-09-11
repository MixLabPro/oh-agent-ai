"""spec §9E.5 E4a：WorkBuddy traces → UsageFact（内存 emit，只读诊断）。

守的是三件事：
1. **桶映射与 Codex 同形**（OpenAI 兼容 usage）：uncached = prompt − cached、
   cache_read = cached、cache_write = 0、output = completion（**已含** reasoning，绝不叠加）；
2. **身份原生**：`source_event_id = spanId`、`identity_basis = native`；`fact_id` 跨重扫稳定；
3. **不猜**：未归属 trace 计 `attempts.unattributed` 不发事实（编 `native_session_id` 就是
   编 session）；归属 provider/route 全 null + `pricing_basis: metered_estimate` +
   `evidence_basis: missing`（§2.1 轨道不可判）；`model_raw` 原串不解析前缀。

外加 Python↔Rust `--json` stdout 逐字节相等（`AGENT_VITALS_BIN`）。
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "packages" / "agent-vitals-python"))
from agent_vitals.agent.workbuddy_usage_fact import (  # noqa: E402
    workbuddy_traces_to_usage_facts,
)

_BIN = os.environ.get("AGENT_VITALS_BIN")
_BIN = str(Path(_BIN).resolve()) if _BIN else None
PY_CMD = [sys.executable, str(ROOT / "scripts" / "scan.py")]
FIXTURE_ROOT = ROOT / "fixtures" / "workbuddy" / "workdir" / ".workbuddy"


def _gen_span(span_id, t0, model, prompt, cached, completion, reasoning=None, tool_output=None):
    usage = {"prompt_tokens": prompt, "completion_tokens": completion,
             "total_tokens": prompt + completion,
             "prompt_tokens_details": {"cached_tokens": cached}}
    if reasoning is not None:
        usage["completion_tokens_details"] = {"reasoning_tokens": reasoning}
    out = tool_output if tool_output is not None else json.dumps(
        [{"id": "r", "created": 1, "model": model, "usage": usage}])
    return {"traceId": "t", "spanId": span_id, "parentId": None, "name": "generation",
            "type": "generation", "startedAt": t0, "endedAt": t0, "duration": 0,
            "status": "ok", "error": None,
            "toolInput": json.dumps({"messages": "[redacted]"}), "toolOutput": out}


def _write_trace(root, pid, trace_id, spans, session_id=None):
    d = root / "traces" / str(pid)
    d.mkdir(parents=True, exist_ok=True)
    tr = {"traceId": trace_id, "name": "Agent workflow", "workerPid": pid,
          "startedAt": "2026-08-31T09:00:00.000Z", "endedAt": "2026-08-31T09:05:00.000Z",
          "duration": 300000, "status": "ok", "spanCount": len(spans),
          "totalTokens": 0, "metadata": {}}
    if session_id is not None:
        tr["sessionId"] = session_id
    (d / (trace_id + ".json")).write_text(
        json.dumps({"trace": tr, "spans": spans}, ensure_ascii=False), encoding="utf-8")


class WorkbuddyUsageFactEmitterCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.root = self.tmp / ".workbuddy"
        (self.root / "traces").mkdir(parents=True)

    def _emit(self, ns="ns-test"):
        return workbuddy_traces_to_usage_facts(self.root, machine_namespace=ns)

    def test_bucket_mapping_matches_codex_shape_and_reasoning_is_not_added(self):
        """prompt 12000 / cached 8000 / completion 300 / reasoning 120 →
        uncached 4000 · cache_read 8000 · cache_write 0 · output 300（reasoning ⊆ completion）。"""
        _write_trace(self.root, 1, "trace_a",
                     [_gen_span("sp1", "2026-08-31T09:00:31.000Z", "custom-local:MiniMax-M3",
                                12000, 8000, 300, reasoning=120)], session_id="s1")
        r = self._emit()
        self.assertEqual(len(r.facts), 1)
        f = r.facts[0]
        self.assertEqual((f["uncached_input_tokens"], f["cache_read_tokens"],
                          f["cache_write_tokens"], f["output_tokens"]), (4000, 8000, 0, 300))
        self.assertEqual(f["host"], "workbuddy")
        self.assertEqual(f["native_session_id"], "s1")
        self.assertEqual(f["source_event_id"], "sp1")
        self.assertEqual(f["identity_basis"], "native")
        self.assertEqual(f["observation_kind"], "assistant-usage")
        self.assertEqual(f["source_usage_semantics"], "delta")
        self.assertEqual(f["event_ts_utc"], "2026-08-31T09:00:31.000Z")
        self.assertEqual(f["time_basis"], "native")

    def test_model_raw_is_verbatim_and_route_is_unresolved(self):
        """`model_raw` 原串（含 `custom-local:` 前缀，不解析——§2.1 前缀不代表轨道）；
        provider/route 全 null；pricing_basis metered_estimate；evidence_basis missing。"""
        _write_trace(self.root, 1, "trace_a",
                     [_gen_span("sp1", "2026-08-31T09:00:31.000Z", "custom-local:deepseek/deepseek-v4-flash",
                                100, 0, 10)], session_id="s1")
        f = self._emit().facts[0]
        self.assertEqual(f["model_raw"], "custom-local:deepseek/deepseek-v4-flash")
        for k in ("provider_raw", "provider_id", "endpoint_host", "route_evidence_id",
                  "billing_source"):
            self.assertIsNone(f[k], k)
        self.assertEqual(f["billing_mode"], "metered")
        self.assertEqual(f["pricing_basis"], "metered_estimate")
        self.assertEqual(f["evidence_basis"], "missing")

    def test_unattributed_trace_is_counted_never_emitted(self):
        """无 `sessionId` 键的 trace：usage 是真的，但 `native_session_id` 是身份必填，
        编一个就是编 session → attempts.unattributed +1，facts 不增。"""
        _write_trace(self.root, 1, "trace_a",
                     [_gen_span("sp1", "2026-08-31T09:00:31.000Z", "hy3", 100, 0, 10)],
                     session_id="s1")
        _write_trace(self.root, 1, "trace_b",
                     [_gen_span("sp2", "2026-08-31T09:00:32.000Z", "hy3", 200, 0, 20),
                      _gen_span("sp3", "2026-08-31T09:00:33.000Z", "hy3", 300, 0, 30)])
        r = self._emit()
        self.assertEqual(len(r.facts), 1)
        self.assertEqual(r.attempts["unattributed"], 2)
        self.assertEqual(r.coverage["total_generation_spans"], 3)
        self.assertEqual(r.coverage["fact_rows"], 1)

    def test_cancelled_generation_is_skip_and_decode_failure_is_unreadable(self):
        """toolOutput null（取消）→ skip；toolOutput 空串（解不开）→ unreadable；
        两者都不发事实、都不 panic。"""
        _write_trace(self.root, 1, "trace_a", [
            _gen_span("ok", "2026-08-31T09:00:31.000Z", "hy3", 100, 0, 10),
            {**_gen_span("null", "2026-08-31T09:00:32.000Z", "hy3", 1, 0, 1), "toolOutput": None},
            {**_gen_span("bad", "2026-08-31T09:00:33.000Z", "hy3", 1, 0, 1), "toolOutput": ""},
        ], session_id="s1")
        r = self._emit()
        self.assertEqual(len(r.facts), 1)
        self.assertEqual(r.attempts["skip"], 1)       # null → skip
        self.assertEqual(r.attempts["unreadable"], 1)  # 空串 → unreadable（不重复计 skip）
        self.assertEqual(r.coverage["skip_rows"], 1)
        # 恒等式：每个 generation span 恰落一个桶。
        self.assertEqual(r.coverage["total_generation_spans"],
                         r.coverage["fact_rows"] + r.attempts["skip"] + r.attempts["unreadable"]
                         + r.attempts["unattributed"])

    def test_fact_ids_stable_across_rescans(self):
        _write_trace(self.root, 1, "trace_a",
                     [_gen_span("sp1", "2026-08-31T09:00:31.000Z", "hy3", 100, 0, 10)],
                     session_id="s1")
        a = [f["fact_id"] for f in self._emit().facts]
        b = [f["fact_id"] for f in self._emit().facts]
        self.assertEqual(a, b)
        self.assertNotEqual(a, [f["fact_id"] for f in self._emit("ns-other").facts])

    def test_missing_root_or_traces_dir_raises(self):
        with self.assertRaises(OSError):
            workbuddy_traces_to_usage_facts(self.tmp / "nope", machine_namespace="ns")
        shutil.rmtree(self.root / "traces")
        with self.assertRaises(OSError):
            workbuddy_traces_to_usage_facts(self.root, machine_namespace="ns")

    def test_committed_fixture_emits_two_facts_and_one_unattributed(self):
        """fixture：归属 s1 的 trace 有 3 个 generation（2 带 usage、1 取消），无 sessionId
        的 trace 有 1 个带 usage → facts 2、skip 1、unattributed 1。混合模型原串保留。"""
        r = workbuddy_traces_to_usage_facts(FIXTURE_ROOT, machine_namespace="ns-fixture")
        self.assertEqual(len(r.facts), 2)
        self.assertEqual(r.attempts, {"skip": 1, "unreadable": 0, "unattributed": 1})
        self.assertEqual(sorted(f["model_raw"] for f in r.facts),
                         ["custom-local:MiniMax-M3", "hy3"])
        self.assertEqual(r.malformed, 0)


@unittest.skipUnless(_BIN, "未设 AGENT_VITALS_BIN，跳过双实现比对")
class WorkbuddyUsageFactsBothTests(unittest.TestCase):
    """Python↔Rust `workbuddy-usage-facts --json -` stdout 逐字节相等。"""

    def _run(self, cmd, args):
        env = dict(os.environ)
        env.pop("AGENT_VITALS_BIN", None)
        return subprocess.run(cmd + ["workbuddy-usage-facts"] + args,
                              env=env, capture_output=True, text=True)

    def _assert_byte_equal(self, args):
        py = self._run(PY_CMD, args)
        rs = self._run([_BIN], args)
        self.assertEqual(py.returncode, 0, py.stderr)
        self.assertEqual(rs.returncode, 0, rs.stderr)
        self.assertEqual(py.stdout, rs.stdout,
                         "workbuddy-usage-facts --json stdout 不一致：\npy:\n%s\nrs:\n%s"
                         % (py.stdout[:2000], rs.stdout[:2000]))
        return json.loads(py.stdout)

    def test_fixture_json_byte_equal(self):
        doc = self._assert_byte_equal([str(FIXTURE_ROOT), "--machine-namespace", "ns-parity",
                                       "--json", "-"])
        self.assertEqual(doc["coverage"]["fact_rows"], 2)
        self.assertEqual(list(doc.keys()),
                         ["machine_namespace", "source_profile", "facts", "attempts",
                          "coverage", "malformed"])

    def test_human_summary_byte_equal(self):
        py = self._run(PY_CMD, [str(FIXTURE_ROOT), "--machine-namespace", "ns-parity"])
        rs = self._run([_BIN], [str(FIXTURE_ROOT), "--machine-namespace", "ns-parity"])
        self.assertEqual(py.stdout, rs.stdout)

    def test_missing_namespace_exits_2_both(self):
        for cmd in (PY_CMD, [_BIN]):
            r = self._run(cmd, [str(FIXTURE_ROOT)])
            self.assertEqual(r.returncode, 2, cmd)

    def test_synthetic_mixed_corpus_byte_equal(self):
        tmp = Path(tempfile.mkdtemp()); self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        root = tmp / ".workbuddy"; (root / "traces").mkdir(parents=True)
        _write_trace(root, 5, "trace_x", [
            _gen_span("g1", "2026-08-31T09:00:31.000Z", "custom-local:MiniMax-M3", 12000, 8000, 300, reasoning=120),
            {**_gen_span("g2", "2026-08-31T09:00:32.000Z", "hy3", 1, 0, 1), "toolOutput": None},
            {**_gen_span("g3", "2026-08-31T09:00:33.000Z", "hy3", 1, 0, 1), "toolOutput": ""},
        ], session_id="s1")
        _write_trace(root, 5, "trace_y", [_gen_span("g4", "2026-08-31T09:00:34.000Z", "auto", 50, 0, 5)])
        (root / "traces" / "9").mkdir()
        (root / "traces" / "9" / "trace_bad.json").write_text("{not json", encoding="utf-8")
        doc = self._assert_byte_equal([str(root), "--machine-namespace", "ns-mix", "--json", "-"])
        self.assertEqual(doc["attempts"], {"skip": 1, "unreadable": 1, "unattributed": 1})
        self.assertEqual(doc["malformed"], 1)
        self.assertEqual(doc["coverage"], {"total_generation_spans": 4, "fact_rows": 1, "skip_rows": 1})


if __name__ == "__main__":
    unittest.main()
