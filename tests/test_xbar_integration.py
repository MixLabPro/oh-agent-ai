"""xbar 脚本回归测试 —— 防 M8 那次「本地没更新」bug 重演。

不直接调 bash 脚本(那需要写测试 fixture 太重)。
改成测三个关键 invariant:
1. sessions.jsonl 行数 ≥ oneline 调用次数
2. 每行 sessions.jsonl 含 generated_at 字段
3. rotate_today() 跨日自动清零

外加一个 syntax check: xbar 脚本能正常输出菜单栏 + 下拉。
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from skill_vitals import state, budget  # noqa


class _IsolatedHome:
    def __enter__(self):
        self.tmp = tempfile.mkdtemp(prefix="sv-xbar-test-")
        self.env = {"SKILL_VITALS_HOME": self.tmp}
        self._p = mock.patch.dict(os.environ, self.env, clear=False)
        self._p.start()
        return self
    def __exit__(self, *args):
        self._p.stop()
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)


class TestSessionsJsonl(unittest.TestCase):
    """session 历史日志 invariant(防 M8: xbar 看不到历史 bug)。"""

    def test_append_adds_generated_at(self):
        """append_session_history 必须自动补 generated_at — xbar 解析 hhmm 靠它。"""
        with _IsolatedHome():
            summary = {"session_id": "s1", "tokens_total": 100, "cost_cny": 1.0,
                       "model": "m"}
            state.append_session_history(summary)
            path = state.state_dir() / "sessions.jsonl"
            self.assertTrue(path.is_file())
            lines = path.read_text().strip().split("\n")
            self.assertEqual(len(lines), 1)
            row = json.loads(lines[0])
            self.assertIn("generated_at", row,
                          "append_session_history 必须自动补 generated_at")
            self.assertEqual(row["session_id"], "s1")

    def test_does_not_overwrite_existing_generated_at(self):
        """调用方已塞 generated_at 时不覆盖 — 保留调用方语义。"""
        with _IsolatedHome():
            summary = {"session_id": "s2", "generated_at": "1999-01-01T00:00:00+00:00"}
            state.append_session_history(summary)
            row = json.loads(
                (state.state_dir() / "sessions.jsonl").read_text().strip())
            self.assertEqual(row["generated_at"], "1999-01-01T00:00:00+00:00")


class TestRotateToday(unittest.TestCase):
    """today.json 跨日清零 invariant(防 M8: 累积 ¥1172 假告警)。"""

    def test_rotate_clears_today_without_touching_month(self):
        """**rotate 只清空 today.json，绝不往 month.json 里加东西。**

        回归（真实事故）：rotate 过去会把旧 today.json 的桶累加进
        `month.days[<旧日期>]`，但唯一的生产调用方 `cli.py` 的 oneline
        对同一份 hour_buckets **同时**调 merge_today 和 merge_month，
        月账早就由 merge_month 记过一遍了。于是每跨一天就重复计一次——
        实测 2026-08 的 month.json 每天正好是真实值的 3 倍，月度成本从
        ¥1733 虚增到 ¥2386。

        旧测试写死 today.json 后直接 rotate、month.json 是空的，重复相加
        看起来正好等于正确值,所以一直没红。**这条测试专门先把 month.json
        预置成「merge_month 已经记过」的真实状态**，rotate 之后数字必须
        纹丝不动。
        """
        with _IsolatedHome():
            sd = state.state_dir()
            bucket = {
                "uncached_input_tokens": 1_000_000,
                "output_tokens": 0, "cache_read_tokens": 0,
                "cache_write_tokens": 0,
                "peak_uncached_input_tokens": 0,
                "peak_output_tokens": 0,
                "peak_cache_read_tokens": 0,
                "peak_cache_write_tokens": 0,
            }
            state._atomic_write(sd / "today.json", {
                "date": "2026-08-25",
                "buckets": {"14": dict(bucket)},
                "by_model": {"deepseek-v4-pro": dict(bucket)},
                "schema_version": "1.0.0",
                "generated_at": "2026-08-25T14:00:00Z",
            })
            # 关键：预置 month.json —— 模拟 oneline 当天已经调过 merge_month，
            # 这 1M token 已经记在账上了（旧测试缺的就是这一步）。
            state._atomic_write(sd / "month.json", {
                "days": {"2026-08-25": dict(bucket,
                                            by_model={"deepseek-v4-pro": dict(bucket)})},
                "schema_version": "1.0.0",
                "month": "2026-08",
                "generated_at": "2026-08-25T14:00:00Z",
            })

            from datetime import datetime, timezone, timedelta
            fake_now = datetime(2026, 8, 26, 0, 30, 0, tzinfo=timezone(timedelta(hours=8)))
            result = state.rotate_today(now=fake_now)
            self.assertEqual(result, "2026-08-25", "rotate 应该返回旧日期")

            # today.json 被清空,date 更新
            today = json.loads((sd / "today.json").read_text())
            self.assertEqual(today["date"], "2026-08-26")
            self.assertEqual(today["buckets"], {})
            self.assertEqual(today.get("rotated_from"), "2026-08-25")

            # month.json 必须**完全不变**——1M 就是 1M，不是 2M
            month = json.loads((sd / "month.json").read_text())
            self.assertEqual(
                month["days"]["2026-08-25"]["uncached_input_tokens"], 1_000_000,
                "rotate 不能把 merge_month 已经记过的量再加一遍（3 倍虚增的根因）")
            self.assertEqual(
                month["days"]["2026-08-25"]["by_model"]["deepseek-v4-pro"]["uncached_input_tokens"],
                1_000_000, "by_model 同样不能被 rotate 重复累加")

    def test_oneline_style_merge_then_rotate_counts_each_token_once(self):
        """端到端不变量：**month.json 里每个 token 只能被记一次。**

        走真实调用顺序（merge_today + merge_month，然后跨日 rotate），
        而不是手写状态文件——上一条测试证明「rotate 不加」，这条证明
        真实路径下总量确实等于真实发生量。"""
        with _IsolatedHome():
            sd = state.state_dir()
            hb = {"buckets": [{
                "date": "2026-08-25", "hour": 14, "is_peak": False,
                "uncached_input_tokens": 1_000_000, "output_tokens": 0,
                "cache_read_tokens": 0, "cache_write_tokens": 0,
                "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
            }]}
            with mock.patch.object(state, "_today_key", return_value="2026-08-25"):
                state.merge_today(hb)          # cli.py oneline 的调用顺序
                state.merge_month(hb)
            state.rotate_today(now="2026-08-26")   # 第二天，触发 rotate

            month = json.loads((sd / "month.json").read_text())
            self.assertEqual(
                month["days"]["2026-08-25"]["uncached_input_tokens"], 1_000_000,
                "真实只发生 1M token，跨日之后 month.json 里也必须只有 1M")

    def test_no_rotate_when_same_date(self):
        """同一天再次 rotate → 不动数据(返回 None)。"""
        with _IsolatedHome():
            sd = state.state_dir()
            from datetime import datetime, timezone, timedelta
            fake_now = datetime(2026, 8, 25, 14, 0, 0, tzinfo=timezone(timedelta(hours=8)))
            state._atomic_write(sd / "today.json", {
                "date": "2026-08-25",
                "buckets": {"14": {"uncached_input_tokens": 100}},
                "schema_version": "1.0.0",
                "generated_at": "2026-08-25T14:00:00Z",
            })
            result = state.rotate_today(now=fake_now)
            self.assertIsNone(result, "同一天不 rotate")
            today = json.loads((sd / "today.json").read_text())
            self.assertEqual(today["buckets"]["14"]["uncached_input_tokens"],
                             100, "数据保持不动")

    def test_rotate_accepts_string_now(self):
        """rotate_today(now=<'YYYY-MM-DD' str>) 不应 AttributeError。

        之前把 `.isoformat()` 套在整个三元表达式外层——str 分支下对字符串
        调 `.isoformat()` 直接崩；此前测试只喂过 datetime,没测到这条路径。
        """
        with _IsolatedHome():
            sd = state.state_dir()
            state._atomic_write(sd / "today.json", {
                "date": "2026-08-25",
                "buckets": {"14": {"uncached_input_tokens": 100}},
                "schema_version": "1.0.0",
                "generated_at": "2026-08-25T14:00:00Z",
            })
            result = state.rotate_today(now="2026-08-26")
            self.assertEqual(result, "2026-08-25")
            today = json.loads((sd / "today.json").read_text())
            self.assertEqual(today["date"], "2026-08-26")

    def test_merge_today_triggers_rotate_first(self):
        """merge_today 入口应自动 rotate(无 --no-rotate flag)。"""
        with _IsolatedHome():
            sd = state.state_dir()
            state._atomic_write(sd / "today.json", {
                "date": "2026-08-25",
                "buckets": {}, "schema_version": "1.0.0",
                "generated_at": "2026-08-25T00:00:00Z",
            })
            from datetime import datetime, timezone, timedelta
            fake_now = datetime(2026, 8, 26, 0, 30, 0, tzinfo=timezone(timedelta(hours=8)))
            # 直接调 merge_today,但 env 的 today key 已变 — 用 fake 时间模拟
            import os
            os.environ["SKILL_VITALS_HOME"] = str(sd.parent)  # 但这不是 fake 时间
            # 用 monkey-patch _today_key 返回 8/26
            with mock.patch.object(state, "_today_key",
                                  return_value="2026-08-26"):
                state.merge_today({"buckets": [{"date": "2026-08-26",
                                                  "hour": 10, "is_peak": False,
                                                  "uncached_input_tokens": 100}]})
            today = json.loads((sd / "today.json").read_text())
            self.assertEqual(today["date"], "2026-08-26",
                             "merge_today 必须先 rotate 到新日期")
            self.assertIn("10", today["buckets"])
            self.assertEqual(today["buckets"]["10"]["uncached_input_tokens"], 100)


def _run_xbar(sd):
    script = Path(__file__).resolve().parent.parent / \
        "contrib" / "xbar" / "skill-vitals.5m.sh"
    return subprocess.run(["bash", str(script)],
                          capture_output=True, text=True,
                          env={**os.environ, "SKILL_VITALS_HOME": str(sd.parent)},
                          timeout=10)


class TestXbarSmokeOutput(unittest.TestCase):
    """xbar 脚本 smoke 测试 — 防 M8 「本地没更新」类 bug 再次发生。"""

    def test_xbar_outputs_menu_and_dropdown(self):
        """xbar 脚本至少要输出菜单栏一行 + 下拉(以 '---' 分隔)。"""
        # 用 contrib/ 下的脚本,设 SKILL_VITALS_HOME 到一个临时 state dir
        with _IsolatedHome() as h:
            sd = state.state_dir()
            # 写一份最小 oneline.json 让 xbar 不显示 "¥?"
            state._atomic_write(sd / "oneline.json", {
                "schema_version": "1.0.0",
                "generated_at": "2026-08-26T00:00:00Z",
                "cost_cny": 5.13,
                "tokens_total": 1000000,
            })
            # 写一份 today.json 让 xbar 不走 fall-through
            state._atomic_write(sd / "today.json", {
                "schema_version": "1.0.0",
                "date": "2026-08-26",
                "buckets": {},
                "generated_at": "2026-08-26T00:00:00Z",
            })
            # 写一份 sessions.jsonl 含 generated_at(否则 hhmm 解析失败)
            state.append_session_history({
                "session_id": "x", "tokens_total": 1000,
                "cost_cny": 0.5, "model": "m",
                "generated_at": "2026-08-26T00:01:00Z",
            })
            # 跑 xbar
            script = Path(__file__).resolve().parent.parent / \
                "contrib" / "xbar" / "skill-vitals.5m.sh"
            r = subprocess.run(["bash", str(script)],
                               capture_output=True, text=True,
                               env={**os.environ, "SKILL_VITALS_HOME": str(sd.parent)},
                               timeout=10)
            self.assertEqual(r.returncode, 0,
                             f"xbar exit {r.returncode}: {r.stderr}")
            lines = r.stdout.split("\n")
            # 第一行是菜单栏
            self.assertTrue(lines[0].startswith(("💰", "⚠️", "🚨", "💤")),
                            f"菜单栏首字符应是 emoji: {lines[0]!r}")
            # 含 '---' 分隔的下拉
            self.assertIn("---", r.stdout,
                          "xbar 必须输出下拉分隔符 '---'")

    def test_menu_bar_hides_decimals_above_100_cny(self):
        """菜单栏金额 ≥¥100 时应隐藏小数(yuan_compact)。

        M8 提交声称加了 yuan_compact() 修「菜单栏太长」,但函数定义后
        从未在 prefix 拼接处被调用——prefix 仍然拼的是未压缩的
        `menu_yuan`,¥1172.57 这类大额从没被压缩过,commit message 里的
        修复其实没生效。这条测试钉住「已接线」这件事,不只是钉住函数
        自身的输出。菜单栏数字现在来自 alert.json(见下面几条 wiring
        测试),不是本地重算的 today.json 折算。
        """
        with _IsolatedHome() as h:
            sd = state.state_dir()
            state._atomic_write(sd / "oneline.json", {
                "schema_version": "1.0.0",
                "generated_at": "2026-08-26T00:00:00Z",
                "cost_cny": 1172.57,
            })
            state._atomic_write(sd / "alert.json", {
                "schema_version": "1.0.0",
                "level": "over",
                "ratio": 1.5,
                "today_cost": 1172.57,
                "effective_daily_budget": 30.0,
                "month_cost": 2000.0,
                "monthly_cny": 500.0,
                "snoozed_until": None,
            })
            r = _run_xbar(sd)
            self.assertEqual(r.returncode, 0,
                             f"xbar exit {r.returncode}: {r.stderr}")
            menu_line = r.stdout.split("\n")[0]
            self.assertNotIn(".", menu_line,
                             f"金额 >= ¥100 时菜单栏不应含小数点: {menu_line!r}")


class TestXbarBudgetWiring(unittest.TestCase):
    """xbar 菜单栏的预算颜色/百分比必须来自 budget.evaluate() 的落盘结果
    (alert.json),不能自己在 bash 里硬编码阈值重算一遍。

    之前(v1.0.0)xbar 完全绕开 budget.py:菜单栏硬编码 BUDGET_DAILY_CNY=30 /
    BUDGET_MONTHLY_CNY=500,用户 `budget set --daily 50` 改的配置、
    adaptive floor、snooze、peak_share_max 反博弈——一条都不反映到菜单栏,
    `budget show` 里全对,菜单栏上全错。这组测试钉住 alert.json 才是唯一
    权威来源。
    """

    def _write_min_oneline(self, sd, cost=5.0):
        state._atomic_write(sd / "oneline.json", {
            "schema_version": "1.0.0",
            "generated_at": "2026-08-26T00:00:00Z",
            "cost_cny": cost,
        })

    def test_over_budget_shows_alarm_emoji(self):
        with _IsolatedHome() as h:
            sd = state.state_dir()
            self._write_min_oneline(sd)
            state._atomic_write(sd / "alert.json", {
                "level": "over", "ratio": 1.5, "today_cost": 45.0,
                "effective_daily_budget": 30.0, "month_cost": 100.0,
                "monthly_cny": 500.0, "snoozed_until": None,
            })
            r = _run_xbar(sd)
            self.assertTrue(r.stdout.startswith("🚨"), r.stdout)

    def test_snoozed_shows_mute_emoji_and_dropdown_note(self):
        with _IsolatedHome() as h:
            sd = state.state_dir()
            self._write_min_oneline(sd)
            state._atomic_write(sd / "alert.json", {
                "level": "snoozed", "ratio": 1.5, "today_cost": 45.0,
                "effective_daily_budget": 30.0, "month_cost": 100.0,
                "monthly_cny": 500.0,
                "snoozed_until": "2026-08-26T18:00:00+08:00",
            })
            r = _run_xbar(sd)
            self.assertTrue(r.stdout.startswith("🔕"), r.stdout)
            self.assertIn("2026-08-26T18:00:00+08:00", r.stdout)

    def test_effective_daily_budget_reflects_user_config_not_hardcoded_30(self):
        """用户把 daily_cny 改成 80(或 adaptive floor 算出别的数)时,
        下拉的「今日累计 X / Y」里的 Y 必须是那个数,不是写死的 ¥30.00。
        """
        with _IsolatedHome() as h:
            sd = state.state_dir()
            self._write_min_oneline(sd)
            state._atomic_write(sd / "alert.json", {
                "level": "near", "ratio": 0.75, "today_cost": 60.0,
                "effective_daily_budget": 80.0, "month_cost": None,
                "monthly_cny": 500.0, "snoozed_until": None,
            })
            r = _run_xbar(sd)
            self.assertIn("¥80.00", r.stdout)
            self.assertNotIn("¥30.00", r.stdout)

    def test_disabled_budget_shows_plain_money_bag_and_no_percent(self):
        with _IsolatedHome() as h:
            sd = state.state_dir()
            self._write_min_oneline(sd, cost=1.23)
            state._atomic_write(sd / "alert.json", {
                "level": "disabled", "ratio": None, "today_cost": None,
                "effective_daily_budget": 30.0, "month_cost": None,
                "monthly_cny": 500.0, "snoozed_until": None,
            })
            r = _run_xbar(sd)
            self.assertTrue(r.stdout.startswith("💰"), r.stdout)
            self.assertNotIn("%", r.stdout.split("\n")[0])
            self.assertIn("已关闭", r.stdout)

    def test_missing_alert_json_falls_back_to_session_cost_without_color(self):
        """还没跑过一次新版 oneline(alert.json 不存在)时,不臆造预算
        百分比——只显示本次会话花费,菜单栏用 💰(不是 🚨/⚠️,那样会在
        没有任何预算判定依据的情况下暗示"正常")。
        """
        with _IsolatedHome() as h:
            sd = state.state_dir()
            self._write_min_oneline(sd, cost=1.23)
            self.assertFalse((sd / "alert.json").exists())
            r = _run_xbar(sd)
            self.assertTrue(r.stdout.startswith("💰¥1.23"), r.stdout)
            self.assertIn("等预算数据", r.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)