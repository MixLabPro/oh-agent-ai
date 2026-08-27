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
from skill_vitals import cli as cli_module  # noqa: E402
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

    def test_month_by_model_attributed_to_the_log_own_date_not_today(self):
        """回归：`fixtures/dsh/behavior.jsonl` 的事件全部发生在 2025-06-15
        （固定历史日期，永远不等于跑测试那天，也永远不等于当前自然月）。
        老实现把 `oneline` 喂进的 `by_model` 一律记进 `_today_key()`，回填
        这份历史日志会把 by_model 错记成"今天"——真实 2026-08 的 month.json
        因此漏记了没有落到回填当天的部分（月度精算成本一度偏差 4 倍）。

        2025-06 不是当前自然月，`merge_month` 会把它迁进
        `month-archive.json`（见 state.py 的跨月归档设计）——这条测试因此
        直接检查归档文件，而不是 month.json。"""
        with _TmpHome() as h:
            r = _run(["oneline", "fixtures/dsh/behavior.jsonl"], env=h.env)
            self.assertEqual(r.returncode, 0, r.stderr)
            month = json.loads((Path(h.tmp) / "state" / "month.json").read_text())
            self.assertNotIn("2025-06-15", month.get("days", {}),
                             "历史月的数据不该留在只保存当前月的 month.json 里")

            archive = json.loads(
                (Path(h.tmp) / "state" / "month-archive.json").read_text())
            day = archive["months"]["2025-06"]["days"]["2025-06-15"]
            by_model = day.get("by_model")
            self.assertTrue(by_model, "历史日期桶应该带 by_model,不是只有 4 基础桶")
            self.assertIn("deepseek/deepseek-v4-flash", by_model)
            self.assertIn("deepseek/deepseek-v4-pro-0813", by_model)

            import datetime
            today_str = datetime.datetime.now(
                datetime.timezone(datetime.timedelta(hours=8))).strftime("%Y-%m-%d")
            if today_str in month["days"]:
                self.assertNotIn(
                    "by_model", month["days"][today_str],
                    "2025-06-15 的历史日志不应该把 by_model 记到'今天'头上")


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

    def test_state_months_lists_current_and_archived(self):
        """`fixtures/dsh/behavior.jsonl` 的事件全在 2025-06-15——不是当前
        自然月，`oneline` 之后应该被归档，`state months` 能查到它。"""
        with _TmpHome() as h:
            r = _run(["oneline", "fixtures/dsh/behavior.jsonl"], env=h.env)
            self.assertEqual(r.returncode, 0, r.stderr)
            r = _run(["state", "months"], env=h.env)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn("2025-06", r.stdout.split())

    def test_state_months_empty_says_no_data(self):
        with _TmpHome() as h:
            r = _run(["state", "months"], env=h.env)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(r.stdout.strip(), "(no data)")


class TestBudgetShowMonth(unittest.TestCase):
    """`budget show --month YYYY-MM` —— 查询特定月份，不受当前月限制。"""

    def test_query_archived_month_by_flag(self):
        with _TmpHome() as h:
            r = _run(["oneline", "fixtures/dsh/behavior.jsonl"], env=h.env)
            self.assertEqual(r.returncode, 0, r.stderr)
            r = _run(["budget", "show", "--month", "2025-06", "--json"], env=h.env)
            self.assertEqual(r.returncode, 0, r.stderr)
            out = json.loads(r.stdout)
            self.assertEqual(out["month"], "2025-06")
            self.assertIsNotNone(out["cost"])
            self.assertGreater(out["cost"]["total"], 0)

    def test_query_month_with_no_data_reports_none_not_zero(self):
        """缺数据必须报 None（缺列不编列），不能编一个 0 出来。"""
        with _TmpHome() as h:
            r = _run(["budget", "show", "--month", "1999-01", "--json"], env=h.env)
            self.assertEqual(r.returncode, 0, r.stderr)
            out = json.loads(r.stdout)
            self.assertIsNone(out["cost"])


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

    def test_calendar_does_not_embed_stale_today_as_todays_data(self):
        """`today.json` 的 `date` 字段一旦落后于真实当前日期,日历「今天」
        tab 必须当成没有数据处理,不能把陈旧的一整天热力图画出来标成"今天"。

        真机回归：`rotate_today()` 只在 `merge_today()` 开头被调用——今天
        一次 DSH 会话都没跑时 today.json 会原封不动停在最后一次有会话的
        那天。之前只在 `budget.compute_today_cost()`（菜单栏）修过这个
        校验,日历渲染是另一个读者,同一个 bug 换个入口又出现了一次：
        2026-08-27 当天没用过 DSH，日历「今天 24 小时」tab 仍然画出
        08-26 的完整 24 小时热力图（还能看出这个 bug——真正的"今天"不
        可能有 24 小时数据，一天还没过完）。
        """
        with _TmpHome() as h:
            r = _run(["oneline", "fixtures/dsh/behavior.jsonl"], env=h.env)
            self.assertEqual(r.returncode, 0, r.stderr)
            today_path = Path(h.tmp) / "state" / "today.json"
            today = json.loads(today_path.read_text())
            # 手动把 date 改成"昨天"，模拟"今天还没跑过任何 DSH 会话"
            today["date"] = "2020-01-01"
            today_path.write_text(json.dumps(today))

            with tempfile.TemporaryDirectory() as td:
                out = Path(td) / "cal.html"
                r = _run(["calendar", "--source", "today", "-o", str(out)], env=h.env)
                self.assertEqual(r.returncode, 0, r.stderr)
                html = out.read_text(encoding="utf-8")
                m = re.search(
                    r'<script id="skill-vitals-data-today"[^>]*>(.*?)</script>',
                    html, re.DOTALL)
                self.assertIsNone(
                    m, "陈旧的 today.json 不该被内联进日历,应该跟"
                       "'today.json 不存在'走同一条 empty-state 分支")
                # sidecar 仍然照写——那是原始文件的副本，不是"今天该显示
                # 什么"的判断
                self.assertTrue((Path(td) / "today.json").is_file())


class TestAugmentCalendarCostCoverage(unittest.TestCase):
    """`_augment_calendar_cost` 必须校验 `by_model` 覆盖率,不能只看「存不存在」。

    回归：8 月账目里,`by_model` 只覆盖了当天 0.7%~32.5% 的 token（跨零点
    会话只把切到那一天的一部分记了下来），老实现只要 `by_model` 存在就
    整天标「精算」、用它算出的总价直接报出去——剩下 67%~99% 的 token
    静默消失，月度成本因此漏算了 4 倍。"""

    def _flat_bucket(self, **overrides):
        b = {f: 0 for f in cost_module.DAY_BUCKET_FIELDS}
        b.update(overrides)
        return b

    def test_full_coverage_is_marked_exact(self):
        """by_model 之和 == 当天总量 → pricing_basis 'exact',coverage 1.0,
        total 与直接调用 cost_report 一致（不含任何 fallback 补齐）。"""
        pricing = cost_module.load_pricing()
        by_model = {"deepseek-v4-flash": self._flat_bucket(
            uncached_input_tokens=1_000_000, output_tokens=100_000)}
        day = self._flat_bucket(uncached_input_tokens=1_000_000, output_tokens=100_000)
        day["by_model"] = by_model
        data = {"days": {"2026-08-17": day}}

        cli_module._augment_calendar_cost("month", data, pricing)

        cost = data["days"]["2026-08-17"]["cost"]
        self.assertEqual(cost["pricing_basis"], "exact")
        self.assertEqual(cost["coverage"], 1.0)
        expected = cost_module.cost_report({"by_model": by_model}, pricing)
        self.assertAlmostEqual(cost["total"], expected["total"], places=9)

    def test_partial_coverage_tops_up_with_fallback_price_not_silently_dropped(self):
        """by_model 只覆盖当天一部分 token → pricing_basis 'partial',
        coverage < 1,total 必须严格大于「只按覆盖部分算」的价格——证明
        没覆盖的那部分token 真的被计价了,不是凭空消失。"""
        pricing = cost_module.load_pricing()
        covered = 1_000_000       # by_model 里记着的（比如 pro）
        uncovered = 9_000_000     # 当天总量比 by_model 多出来的部分（未归属）
        by_model = {"deepseek-v4-pro": self._flat_bucket(uncached_input_tokens=covered)}
        day = self._flat_bucket(uncached_input_tokens=covered + uncovered)
        day["by_model"] = by_model
        data = {"days": {"2026-08-17": day}}

        cli_module._augment_calendar_cost("month", data, pricing)

        cost = data["days"]["2026-08-17"]["cost"]
        self.assertEqual(cost["pricing_basis"], "partial")
        self.assertAlmostEqual(cost["coverage"], covered / (covered + uncovered), places=9)

        covered_only = cost_module.cost_report({"by_model": by_model}, pricing)
        self.assertGreater(
            cost["total"], covered_only["total"],
            "未覆盖的 9M token 必须被 fallback 价补齐进 total,不能悄悄消失")

        top_up = cost_module.fallback_price(
            self._flat_bucket(uncached_input_tokens=uncovered), pricing)
        self.assertAlmostEqual(
            cost["total"], covered_only["total"] + top_up["total"], places=9,
            msg="total 必须恰好等于「精算部分 + fallback 补齐部分」,不多不少")

    def test_zero_by_model_leaves_day_untouched(self):
        """没有 by_model 的日子（老数据/纯近似日）不该被这个函数动——
        continue 分支,不产生 cost 字段,calendar.html 走 JS 近似兜底。"""
        pricing = cost_module.load_pricing()
        day = self._flat_bucket(uncached_input_tokens=100)
        data = {"days": {"2026-08-01": day}}
        cli_module._augment_calendar_cost("month", data, pricing)
        self.assertNotIn("cost", data["days"]["2026-08-01"])


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