"""M3 CLI 子命令（oneline / calendar / state list / state clean）测试。

不走 golden —— oneline / state 写的是**时间戳 + 内容**,无法 byte-for-byte
对账（每次跑 generated_at 都变）。改用 invariant 风格：跑 CLI → 检查
state 文件存在 + 关键字段存在 + 数字与单 session 审计可对账。
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "scan.py"

sys.path.insert(0, str(ROOT / "scripts"))
from skill_vitals import budget as budget_module  # noqa: E402
from skill_vitals import cost as cost_module  # noqa: E402


def _run(args, env=None):
    """跑一次 scan.py 子命令，返回 (returncode, stdout, stderr)。"""
    full_env = os.environ.copy()
    if env:
        full_env.update(env)
    return subprocess.run(
        [sys.executable, str(SCRIPT)] + list(args),
        capture_output=True, text=True, env=full_env, timeout=60,
    )


class _TmpHome:
    """每次测试一个临时 SKILL_VITALS_HOME —— 不污染真机 ~/.skill-vitals。"""

    def __enter__(self):
        self.tmp = tempfile.mkdtemp(prefix="sv-cli-m3-")
        self.env = {"SKILL_VITALS_HOME": self.tmp}
        return self

    def __exit__(self, *args):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)


class TestOnelineCli(unittest.TestCase):
    def test_oneline_writes_three_state_files(self):
        """一次 oneline 应该产生 oneline.json + today.json + month.json。"""
        with _TmpHome() as h:
            r = _run(["oneline", "fixtures/dsh/behavior.jsonl"], env=h.env)
            self.assertEqual(r.returncode, 0, r.stderr)
            sd = Path(h.tmp) / "state"
            for name in ("oneline.json", "today.json", "month.json"):
                self.assertTrue((sd / name).is_file(), "%s should exist" % name)

    def test_oneline_json_shape(self):
        """oneline.json 必须含 schema_version + 关键摘要字段。"""
        with _TmpHome() as h:
            r = _run(["oneline", "fixtures/dsh/behavior.jsonl"], env=h.env)
            self.assertEqual(r.returncode, 0, r.stderr)
            data = json.loads((Path(h.tmp) / "state" / "oneline.json").read_text())
            self.assertEqual(data["schema_version"], "1.0.0")
            self.assertIn("generated_at", data)
            self.assertIn("tokens_total", data)
            self.assertIn("cost_cny", data)
            self.assertIn("hour_buckets_summary", data)

    def test_oneline_no_merge_skips_today_and_month(self):
        """--no-merge 应该只写 oneline.json,不写 today.json / month.json。"""
        with _TmpHome() as h:
            r = _run(["oneline", "--no-merge", "fixtures/dsh/behavior.jsonl"],
                     env=h.env)
            self.assertEqual(r.returncode, 0, r.stderr)
            sd = Path(h.tmp) / "state"
            self.assertTrue((sd / "oneline.json").is_file())
            self.assertFalse((sd / "today.json").is_file())
            self.assertFalse((sd / "month.json").is_file())

    def test_oneline_today_accumulates_across_runs(self):
        """两次 oneline 同一会话 → today.json 桶内累加。"""
        with _TmpHome() as h:
            for _ in range(2):
                r = _run(["oneline", "fixtures/dsh/behavior.jsonl"], env=h.env)
                self.assertEqual(r.returncode, 0, r.stderr)
            today = json.loads((Path(h.tmp) / "state" / "today.json").read_text())
            # 累加后某个 hour 桶的非零 token 数 = 单次的两倍（同一会话跑两遍）
            bucket_values = [v for v in today["buckets"].values()]
            self.assertEqual(len(bucket_values), 1, "同一时间只应有 1 个 hour 桶")
            # 单次 input_tokens 是 1.7M,累加后应是 3.4M
            self.assertEqual(bucket_values[0]["uncached_input_tokens"], 1700000 * 2)


class TestOnelinePerModelPricing(unittest.TestCase):
    """端到端:oneline 落盘的 by_model 要真的驱动 budget.py 的定价——
    不是写了字段但没人读。fixtures/dsh/behavior.jsonl 里混了
    deepseek-v4-flash 和 deepseek-v4-pro 两个模型的事件。"""

    def test_today_by_model_populated_and_alert_uses_accurate_price(self):
        with _TmpHome() as h:
            r = _run(["oneline", "fixtures/dsh/behavior.jsonl"], env=h.env)
            self.assertEqual(r.returncode, 0, r.stderr)
            sd = Path(h.tmp) / "state"
            today = json.loads((sd / "today.json").read_text())
            by_model = today.get("by_model")
            self.assertTrue(by_model, "oneline 应该把 usage['by_model'] 写进 today.json")
            self.assertIn("deepseek/deepseek-v4-flash", by_model)
            self.assertIn("deepseek/deepseek-v4-pro-0813", by_model)

            with mock.patch.dict(os.environ, h.env, clear=False):
                accurate = budget_module.compute_today_cost()
                pricing = cost_module.load_pricing()
                # 旧近似:把同样的桶(不分模型)硬按 fallback 模型算一遍——
                # 应该跟精确定价的结果不一样,证明确实在用 by_model 路径,
                # 不是悄悄退回了 fallback。
                flat_bucket = {
                    "uncached_input_tokens": sum(
                        m["uncached_input_tokens"] for m in by_model.values()),
                    "output_tokens": sum(m["output_tokens"] for m in by_model.values()),
                    "cache_read_tokens": sum(m["cache_read_tokens"] for m in by_model.values()),
                    "cache_write_tokens": sum(m["cache_write_tokens"] for m in by_model.values()),
                    "peak_uncached_input_tokens": sum(
                        m["peak_uncached_input_tokens"] for m in by_model.values()),
                    "peak_output_tokens": sum(
                        m["peak_output_tokens"] for m in by_model.values()),
                    "peak_cache_read_tokens": sum(
                        m["peak_cache_read_tokens"] for m in by_model.values()),
                    "peak_cache_write_tokens": sum(
                        m["peak_cache_write_tokens"] for m in by_model.values()),
                }
                old_approx = budget_module._bucket_cost(flat_bucket, pricing)
            self.assertNotAlmostEqual(
                accurate["total"], old_approx["total"], places=4,
                msg="behavior.jsonl 混了 pro,精确定价不应等于旧的 flash-only 近似")


class TestStateCli(unittest.TestCase):
    def test_state_list_empty(self):
        with _TmpHome() as h:
            r = _run(["state", "list"], env=h.env)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(r.stdout.strip(), "(empty)")

    def test_state_list_after_oneline(self):
        """oneline 后 state list 应该列出三个文件。"""
        with _TmpHome() as h:
            _run(["oneline", "fixtures/dsh/behavior.jsonl"], env=h.env)
            r = _run(["state", "list"], env=h.env)
            self.assertEqual(r.returncode, 0, r.stderr)
            for name in ("oneline.json", "today.json", "month.json"):
                self.assertIn(name, r.stdout)

    def test_state_clean_refuses_without_yes(self):
        with _TmpHome() as h:
            _run(["oneline", "fixtures/dsh/behavior.jsonl"], env=h.env)
            r = _run(["state", "clean"], env=h.env)
            self.assertEqual(r.returncode, 2, "refusing without --yes 应 exit 2")
            self.assertIn("refusing without --yes", r.stderr)

    def test_state_clean_with_yes_removes_files(self):
        with _TmpHome() as h:
            _run(["oneline", "fixtures/dsh/behavior.jsonl"], env=h.env)
            r = _run(["state", "clean", "--yes"], env=h.env)
            self.assertEqual(r.returncode, 0, r.stderr)
            r2 = _run(["state", "list"], env=h.env)
            self.assertEqual(r2.stdout.strip(), "(empty)")


class TestCalendarCli(unittest.TestCase):
    def test_calendar_renders_template(self):
        """calendar 应 cp 模板 + 同目录 cp 状态文件 —— 双击 HTML 即可打开。"""
        with _TmpHome() as h:
            _run(["oneline", "fixtures/dsh/behavior.jsonl"], env=h.env)
            with tempfile.TemporaryDirectory() as td:
                out = Path(td) / "cal.html"
                r = _run(["calendar", "--source", "today", "-o", str(out)],
                         env=h.env)
                self.assertEqual(r.returncode, 0, r.stderr)
                self.assertTrue(out.is_file())
                self.assertGreater(out.stat().st_size, 1000,
                                   "模板应该有几 KB,不是空文件")
                # 同目录应 cp 一份 today.json
                self.assertTrue((Path(td) / "today.json").is_file())

    def test_calendar_inlines_accurate_per_model_cost(self):
        """日历页内联数据必须带上按真实模型精算的 cost/accurate_cost 字段——
        不能只让 budget show/xbar 菜单栏精确、日历页还留在 flash-only 近似
        （fixtures/dsh/behavior.jsonl 混了 flash 和 pro,两者价差 3 倍,足以
        暴露这个字段缺失）。sidecar 副本（file picker fallback 用）必须保持
        state 文件原始字节，不带这个额外字段——那份要跟 state.py 的 schema
        契约字面一致。"""
        with _TmpHome() as h:
            r = _run(["oneline", "fixtures/dsh/behavior.jsonl"], env=h.env)
            self.assertEqual(r.returncode, 0, r.stderr)
            with tempfile.TemporaryDirectory() as td:
                out = Path(td) / "cal.html"
                r = _run(["calendar", "--source", "today", "-o", str(out)], env=h.env)
                self.assertEqual(r.returncode, 0, r.stderr)
                html = out.read_text(encoding="utf-8")

                m = re.search(
                    r'<script id="skill-vitals-data-today"[^>]*>(.*?)</script>',
                    html, re.DOTALL)
                self.assertIsNotNone(m, "today 内联数据块必须存在")
                inlined = json.loads(m.group(1))
                self.assertIn("accurate_cost", inlined,
                              "today 视图应该有顶层 accurate_cost 字段")
                self.assertGreater(inlined["accurate_cost"]["total"], 0)

                pricing = cost_module.load_pricing()
                expected = cost_module.cost_report(
                    {"by_model": inlined["by_model"]}, pricing)
                self.assertAlmostEqual(
                    inlined["accurate_cost"]["total"], expected["total"], places=6,
                    msg="日历内联的精算总价必须与 cost_report 直接算出来的一致")

                # sidecar 副本必须是原始字节——不带 accurate_cost
                sidecar = json.loads((Path(td) / "today.json").read_text())
                self.assertNotIn("accurate_cost", sidecar,
                                  "sidecar 是 state.py 契约文件，不该带展示层附加字段")


class TestUsageHourBucketsReconcile(unittest.TestCase):
    """oneline 的 hour_buckets_summary 与 token_by_model 数字必须对得上。

    与 token_by_model / hour_buckets 的不变量是同一回事 —— M3 通过 oneline
    把 hour_buckets 暴露到 state 文件,这条对账必须仍然成立。
    """

    def test_oneline_hour_buckets_match_token_by_model(self):
        with _TmpHome() as h:
            _run(["oneline", "fixtures/dsh/behavior.jsonl"], env=h.env)
            today = json.loads((Path(h.tmp) / "state" / "today.json").read_text())
            oneline = json.loads((Path(h.tmp) / "state" / "oneline.json").read_text())
            # today.json 所有 hour 桶的 4 基础桶（input + output + cache_read
            # + cache_write）累加 = oneline tokens_total
            # —— 与 token_by_model 的同源不变量一致：两边 4 桶之和必须相等
            hour_total = sum(
                b["uncached_input_tokens"] + b["output_tokens"]
                + b["cache_read_tokens"] + b["cache_write_tokens"]
                for b in today["buckets"].values())
            self.assertEqual(hour_total, oneline["tokens_total"],
                             "hour_buckets 4 桶累加 == oneline tokens_total")


if __name__ == "__main__":
    unittest.main(verbosity=2)