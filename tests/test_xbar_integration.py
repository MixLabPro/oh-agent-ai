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

    def test_rotate_moves_buckets_to_month(self):
        with _IsolatedHome():
            sd = state.state_dir()
            # 手动写一份「昨天」的 today.json
            state._atomic_write(sd / "today.json", {
                "date": "2026-08-25",
                "buckets": {"14": {
                    "uncached_input_tokens": 1_000_000,
                    "output_tokens": 0, "cache_read_tokens": 0,
                    "cache_write_tokens": 0,
                    "peak_uncached_input_tokens": 0,
                    "peak_output_tokens": 0,
                    "peak_cache_read_tokens": 0,
                    "peak_cache_write_tokens": 0,
                }},
                "schema_version": "1.0.0",
                "generated_at": "2026-08-25T14:00:00Z",
            })
            # 模拟「今天」(BJ 2026-08-26) 触发 rotate
            from datetime import datetime, timezone, timedelta
            fake_now = datetime(2026, 8, 26, 0, 30, 0, tzinfo=timezone(timedelta(hours=8)))
            result = state.rotate_today(now=fake_now)
            self.assertEqual(result, "2026-08-25", "rotate 应该返回旧日期")

            # today.json 应该被清空,date 字段更新
            today = json.loads((sd / "today.json").read_text())
            self.assertEqual(today["date"], "2026-08-26")
            self.assertEqual(today["buckets"], {})
            self.assertEqual(today.get("rotated_from"), "2026-08-25")

            # month.json.days[<8/25>] 应该收到那 1M input
            month = json.loads((sd / "month.json").read_text())
            self.assertIn("2026-08-25", month["days"],
                          "rotate 应把旧桶搬到 month.days[<旧日期>]")
            self.assertEqual(month["days"]["2026-08-25"]["uncached_input_tokens"],
                             1_000_000)

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
        自身的输出。
        """
        with _IsolatedHome() as h:
            sd = state.state_dir()
            state._atomic_write(sd / "oneline.json", {
                "schema_version": "1.0.0",
                "generated_at": "2026-08-26T00:00:00Z",
                "cost_cny": 1172.57,
            })
            # today.json 的桶要折算出 >= ¥100、且触发 >100% 告警(BUDGET_DAILY_CNY=30)
            state._atomic_write(sd / "today.json", {
                "schema_version": "1.0.0",
                "date": "2026-08-26",
                "buckets": {"10": {
                    "uncached_input_tokens": 100_000_000,
                    "output_tokens": 0, "cache_read_tokens": 0,
                    "cache_write_tokens": 0,
                    "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                    "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
                }},
                "generated_at": "2026-08-26T10:00:00Z",
            })
            script = Path(__file__).resolve().parent.parent / \
                "contrib" / "xbar" / "skill-vitals.5m.sh"
            r = subprocess.run(["bash", str(script)],
                               capture_output=True, text=True,
                               env={**os.environ, "SKILL_VITALS_HOME": str(sd.parent)},
                               timeout=10)
            self.assertEqual(r.returncode, 0,
                             f"xbar exit {r.returncode}: {r.stderr}")
            menu_line = r.stdout.split("\n")[0]
            self.assertNotIn(".", menu_line,
                             f"金额 >= ¥100 时菜单栏不应含小数点: {menu_line!r}")


if __name__ == "__main__":
    unittest.main(verbosity=2)