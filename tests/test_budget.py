"""budget.py 测试 —— 预算阈值与告警等级的 Python 侧锚点。

CLAUDE.md §六测试层: budget 是新模块,这里用 invariant + characterization
混合。每条「预算必须 X」的不变量一个 test method。

测试通过临时 `$SKILL_VITALS_HOME` 隔离 —— 不让真机 `~/.skill-vitals/config.toml`
被测试读写污染。state.py 的 fixture 与 _IsolatedHome 同款。
"""

import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from skill_vitals import budget
from skill_vitals import state


class _IsolatedHome:
    def __init__(self):
        self.tmpdir = tempfile.mkdtemp(prefix="sv-budget-test-")
        self.env = {"SKILL_VITALS_HOME": self.tmpdir}

    def __enter__(self):
        self._patcher = mock.patch.dict(os.environ, self.env, clear=False)
        self._patcher.start()
        return self

    def __exit__(self, *args):
        self._patcher.stop()
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)


class TestDefaultBudget(unittest.TestCase):
    def test_defaults_match_spec(self):
        """spec §5.1 列出的 8 个字段默认值必须与文档一致 —— 文档是契约。"""
        d = budget.default_budget()
        self.assertTrue(d["enabled"])
        self.assertEqual(d["daily_cny"], 30.0)
        self.assertEqual(d["weekly_cny"], 180.0)
        self.assertEqual(d["monthly_cny"], 600.0)
        self.assertEqual(d["peak_share_max"], 0.5)
        self.assertEqual(d["warn_at_ratio"], 0.8)
        self.assertTrue(d["adaptive_floor"])
        self.assertEqual(d["adaptive_window_days"], 7)
        self.assertEqual(d["adaptive_multiplier"], 1.5)

    def test_default_budget_returns_copy(self):
        """返回深拷贝 —— 防止调用方 mutate 默认值(否则下次读会拿到脏数据)。"""
        a = budget.default_budget()
        a["daily_cny"] = 999
        self.assertEqual(budget.default_budget()["daily_cny"], 30.0,
                         "默认预算不被 mutate 影响")


class TestLoadConfig(unittest.TestCase):
    def test_missing_config_returns_defaults(self):
        """配置文件缺场 → 返回默认 —— 不崩溃、不编一个空 dict。"""
        with _IsolatedHome():
            cfg = budget.load_config()
            self.assertEqual(cfg["daily_cny"], 30.0)

    def test_partial_config_merged_with_defaults(self):
        """部分字段 → 缺的字段用默认填(spec §5.1 8 个字段缺一不可少一不行)。"""
        with _IsolatedHome() as h:
            cfg_path = Path(h.tmpdir) / "config.toml"
            cfg_path.write_text("[budget]\ndaily_cny = 50.0\n", encoding="utf-8")
            cfg = budget.load_config()
            self.assertEqual(cfg["daily_cny"], 50.0, "显式设置覆盖默认")
            self.assertEqual(cfg["peak_share_max"], 0.5,
                             "未设置字段保留默认")
            self.assertTrue(cfg["enabled"], "布尔默认也是默认")

    def test_malformed_config_does_not_crash(self):
        """畸形配置文件 → 走默认,不抛。CLAUDE.md §host 能力缺失纪律。"""
        with _IsolatedHome() as h:
            cfg_path = Path(h.tmpdir) / "config.toml"
            cfg_path.write_text("[budget]\n= broken\n", encoding="utf-8")
            cfg = budget.load_config()
            self.assertEqual(cfg["daily_cny"], 30.0)


class TestWriteConfig(unittest.TestCase):
    def test_write_creates_file_with_budget_block(self):
        with _IsolatedHome() as h:
            budget.write_config({"daily_cny": 50.0})
            text = (Path(h.tmpdir) / "config.toml").read_text(encoding="utf-8")
            self.assertIn("[budget]", text)
            self.assertIn("daily_cny = 50.0", text)

    def test_write_does_not_touch_other_sections(self):
        """只 upsert [budget] 节 —— [scan] / [redact] 等已有节保持原样。"""
        with _IsolatedHome() as h:
            cfg_path = Path(h.tmpdir) / "config.toml"
            cfg_path.write_text("[scan]\npath = /x\n\n[budget]\ndaily_cny = 30.0\n",
                                encoding="utf-8")
            budget.write_config({"daily_cny": 99.0})
            text = cfg_path.read_text(encoding="utf-8")
            self.assertIn("[scan]", text, "[scan] 节必须保留")
            self.assertIn("path = /x", text, "[scan] 内容必须保留")
            self.assertIn("daily_cny = 99.0", text, "[budget] 已更新")
            self.assertNotIn("daily_cny = 30.0", text, "旧值被覆盖")


class TestEffectiveDailyBudget(unittest.TestCase):
    def test_no_data_uses_user_set(self):
        """无 month.json 时不应用自适应 floor —— 降级到 user_set。"""
        with _IsolatedHome():
            cfg = {"daily_cny": 30.0, "adaptive_floor": True,
                   "adaptive_multiplier": 1.5, "adaptive_window_days": 7}
            eff, applied = budget.effective_daily_budget(cfg)
            self.assertEqual(eff, 30.0)
            self.assertFalse(applied)

    def test_adaptive_floor_raises_threshold_when_avg_high(self):
        """7 日均 × 1.5 > user_set → 用 floor(spec §5.2)。"""
        with _IsolatedHome():
            sd = state.state_dir()
            # mock month.json: 最近 7 天平均 ¥40, → floor = ¥60, > user_set ¥30
            from datetime import date
            days = {}
            today = date.today()
            for offset in range(7):
                d = (today - timedelta(days=offset)).isoformat()
                days[d] = {
                    "uncached_input_tokens": 50_000_000,  # ¥100 / day
                    "output_tokens": 0, "cache_read_tokens": 0, "cache_write_tokens": 0,
                    "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                    "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
                }
            state._atomic_write(sd / "month.json",
                                {"days": days, "schema_version": "1.0.0",
                                 "generated_at": "2026-08-25T00:00:00Z",
                                 "month": today.strftime("%Y-%m")})
            cfg = {"daily_cny": 30.0, "adaptive_floor": True,
                   "adaptive_multiplier": 1.5, "adaptive_window_days": 7}
            eff, applied = budget.effective_daily_budget(cfg)
            self.assertTrue(applied, "floor 应被触发")
            self.assertGreater(eff, 30.0, "floor 高于 user_set")

    def test_adaptive_disabled_uses_user_set(self):
        """adaptive_floor = false → 永远用 user_set(spec §5.1)。"""
        with _IsolatedHome():
            cfg = {"daily_cny": 30.0, "adaptive_floor": False}
            eff, applied = budget.effective_daily_budget(cfg)
            self.assertEqual(eff, 30.0)
            self.assertFalse(applied)


class TestAlertLevel(unittest.TestCase):
    def test_level_thresholds_match_spec(self):
        """ratio → level 的阈值映射必须与 spec §5.2 一致。"""
        self.assertEqual(budget._alert_level(0.5), "ok")
        self.assertEqual(budget._alert_level(0.7), "near")
        self.assertEqual(budget._alert_level(0.85), "warn")
        self.assertEqual(budget._alert_level(1.0), "over")
        self.assertEqual(budget._alert_level(1.5), "over")


class TestEvaluate(unittest.TestCase):
    def test_disabled_budget_returns_disabled_level(self):
        """enabled = false → level = 'disabled',不报任何告警。"""
        with _IsolatedHome() as h:
            (Path(h.tmpdir) / "config.toml").write_text(
                "[budget]\nenabled = false\n", encoding="utf-8")
            r = budget.evaluate()
            self.assertEqual(r["level"], "disabled")
            self.assertEqual(r["reasons"], [])

    def test_no_today_json_returns_ok_with_explanation(self):
        """today.json 缺场 → level='ok' + 一条 reason 说明(spec 不告警但要解释)。"""
        with _IsolatedHome():
            r = budget.evaluate()
            self.assertEqual(r["level"], "ok")
            self.assertEqual(r["today_cost"], None)
            self.assertTrue(any("no today.json" in reason
                                for reason in r["reasons"]))

    def test_normal_day_returns_ok(self):
        """正常日（today_cost << daily_budget）→ level='ok',无 peak_over。"""
        with _IsolatedHome():
            sd = state.state_dir()
            # 写一份 today.json: 100 万 input, off-peak → ~¥0.30 (远远小于 ¥30)
            state._atomic_write(sd / "today.json", {
                "buckets": {"14": {
                    "uncached_input_tokens": 100_000,
                    "output_tokens": 0, "cache_read_tokens": 0,
                    "cache_write_tokens": 0,
                    "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                    "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
                }},
                "schema_version": "1.0.0",
                "date": datetime.now(budget._BEIJING).date().isoformat(),
                "generated_at": datetime.now(budget._BEIJING).isoformat(),
            })
            r = budget.evaluate()
            self.assertEqual(r["level"], "ok")
            self.assertLess(r["today_cost"], 30.0)

    def test_month_over_budget_escalates_level_even_when_today_is_fine(self):
        """月预算超支必须真的影响 level —— 之前 monthly_cny 只用来算 xbar
        显示的百分比，从不参与 level 判定：实测过「本月 198% 超支，
        今天花得少，菜单栏仍是绿色 ok」这种误导。这条测试钉住月度超支
        必须把 level 升到至少 'over'（>= 100% 用跟 today 同一套阈值）。
        """
        with _IsolatedHome():
            sd = state.state_dir()
            # 没有 today.json —— ratio=None，level 起点是 "ok"；
            # month.json 里一天的花费远超默认 monthly_cny=600。
            state._atomic_write(sd / "month.json", {
                "days": {"2026-08-01": {
                    "uncached_input_tokens": 500_000_000,
                    "output_tokens": 0, "cache_read_tokens": 0,
                    "cache_write_tokens": 0,
                    "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                    "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
                }},
                "schema_version": "1.0.0",
                "month": "2026-08",
                "generated_at": datetime.now(budget._BEIJING).isoformat(),
            })
            r = budget.evaluate()
            self.assertGreater(r["month_ratio"], 1.0)
            self.assertEqual(r["level"], "over",
                             "月预算超支必须把 level 升到 over，不能被"
                             "「今天没数据」的 ok 盖住")
            self.assertTrue(any("month at" in reason for reason in r["reasons"]))

    def test_today_over_budget_not_downgraded_by_fine_month(self):
        """月预算正常时，不该把 today 那边已经判出的 over 压回去
        （升级只单向：谁更严重听谁的，不是"最后算的那个赢"）。
        """
        with _IsolatedHome():
            sd = state.state_dir()
            state._atomic_write(sd / "month.json", {
                "days": {"2026-08-01": {
                    "uncached_input_tokens": 1_000,
                    "output_tokens": 0, "cache_read_tokens": 0,
                    "cache_write_tokens": 0,
                    "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                    "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
                }},
                "schema_version": "1.0.0",
                "month": "2026-08",
                "generated_at": datetime.now(budget._BEIJING).isoformat(),
            })
            state._atomic_write(sd / "today.json", {
                "buckets": {"14": {
                    "uncached_input_tokens": 30_000_000,
                    "output_tokens": 0, "cache_read_tokens": 0,
                    "cache_write_tokens": 0,
                    "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                    "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
                }},
                "schema_version": "1.0.0",
                "date": datetime.now(budget._BEIJING).date().isoformat(),
                "generated_at": datetime.now(budget._BEIJING).isoformat(),
            })
            r = budget.evaluate()
            self.assertLess(r["month_ratio"], 0.1)
            self.assertEqual(r["level"], "over")


class TestSnooze(unittest.TestCase):
    def test_snooze_round_trip(self):
        """set_snooze 写入 budget.json → _read_snooze 读回 datetime。"""
        with _IsolatedHome():
            future = (datetime.now(budget._BEIJING) + timedelta(hours=1)).isoformat()
            p = budget.set_snooze(future, reason="test")
            self.assertTrue(p.is_file())
            got = budget._read_snooze()
            self.assertIsNotNone(got)
            # datetime 解析后比较 — ISO 字符串可能有微秒精度差
            self.assertAlmostEqual(got.timestamp(),
                                   datetime.fromisoformat(future).timestamp(),
                                   delta=1.0)

    def test_snooze_clears_on_overdue(self):
        """过期 snooze 自动失效 —— 不需要 cron / event 触发。"""
        with _IsolatedHome():
            past = (datetime.now(budget._BEIJING) - timedelta(hours=1)).isoformat()
            budget.set_snooze(past)
            now = datetime.now(budget._BEIJING)
            r = budget.evaluate(now=now)
            # 过期 snooze → 不压制告警
            self.assertIsNone(r["snoozed_until"])

    def test_snooze_accepts_naive_iso_string(self):
        """set_snooze(<裸 ISO,无 tzinfo>) 不应在 evaluate() 里炸 TypeError。

        之前 _read_snooze / set_snooze 都直接存 datetime.fromisoformat()
        的结果——传入裸字符串时得到 naive datetime,写入 / 读出都不报错,
        但 evaluate() 拿 tz-aware 的 `now` 跟它比较(`now >= snoozed_until`)
        会抛 "can't compare offset-naive and offset-aware datetimes"。
        真实 CLI 路径(cli.py::snooze)只喂 tz-aware 字符串,所以这条从没
        被测试踩到过。
        """
        with _IsolatedHome():
            naive = (datetime.now(budget._BEIJING) + timedelta(hours=1)) \
                .replace(tzinfo=None).isoformat()
            budget.set_snooze(naive)
            got = budget._read_snooze()
            self.assertIsNotNone(got.tzinfo, "读回的 snoozed_until 必须是 tz-aware")
            # 不崩才是这条测试的重点 —— evaluate() 内部拿 tz-aware `now`
            # 跟 snoozed_until 比较,naive/aware 混用之前会在这里炸。
            budget.evaluate(now=datetime.now(budget._BEIJING))

    def test_clear_snooze_removes_file(self):
        with _IsolatedHome():
            future = (datetime.now(budget._BEIJING) + timedelta(hours=1)).isoformat()
            budget.set_snooze(future)
            self.assertTrue(budget._budget_state_path().is_file())
            budget.clear_snooze()
            self.assertFalse(budget._budget_state_path().is_file())


class TestPeakShare(unittest.TestCase):
    def test_peak_over_triggers_warning_even_if_total_under_budget(self):
        """反博弈条款:即便总费用在预算内,peak 占比超阈值仍要告警。"""
        with _IsolatedHome():
            sd = state.state_dir()
            # 构造一个「总费用低但 peak 占比 100%」的 today.json:
            # peak 子桶 = 总桶 → peak_share = 100% > 50%
            # 用真实定价的模型 deepseek-v4-flash,确保 _resolve_card 命中。
            state._atomic_write(sd / "today.json", {
                "buckets": {"14": {
                    "uncached_input_tokens": 1_000_000,  # 1M peak input
                    "output_tokens": 0, "cache_read_tokens": 0,
                    "cache_write_tokens": 0,
                    "peak_uncached_input_tokens": 1_000_000,
                    "peak_output_tokens": 0,
                    "peak_cache_read_tokens": 0,
                    "peak_cache_write_tokens": 0,
                }},
                "schema_version": "1.0.0",
                "date": datetime.now(budget._BEIJING).date().isoformat(),
                "generated_at": datetime.now(budget._BEIJING).isoformat(),
            })
            # 让 budget 知道这个模型有价格——providers["deepseek-v4-flash"]
            # 让 _resolve_card 命中 deepseek-official 的 flash 表。
            (Path(sd).parent / "config.toml").write_text(
                "[budget]\ndaily_cny = 100.0\n", encoding="utf-8")
            # 把 today.json buckets 里的 model 字段修一下 —— 我们走的是
            # _bucket_cost 入口,它写死 model=unknown。直接调 evaluate。
            r = budget.evaluate()
            # 这里 1M peak input @ ¥3/M = ¥3,远低于 ¥100 daily budget。
            # peak_share = 100% > 50% → peak_over 应为 True
            self.assertIsNotNone(r["today_cost"], "today_cost 必须有数")
            self.assertTrue(r["peak_over"],
                            "peak_share=100%% > 50%% 应触发 peak_over; got %r"
                            % r.get("peak_share"))


if __name__ == "__main__":
    unittest.main(verbosity=2)