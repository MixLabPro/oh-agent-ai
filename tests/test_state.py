"""state.py 测试 —— 状态文件 I/O 的 Python 侧锚点。

CLAUDE.md §六测试层把 fixture / golden / invariant / characterization
都分门别类，state.py 是个新模块所以这里用 invariant + characterization
混合：每条「state 文件必须 X」的不变量一个 test method，每条具体行为
也一个 test method。

测试通过临时 `$SKILL_VITALS_HOME` 隔离 —— 不能让真机 `~/.skill-vitals/
state/` 被测试读写污染（与 `tests/golden_runner.py` 同款约定）。
"""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

# 把 scripts/ 加到 sys.path 以便 import skill_vitals —— 与仓库根 `python3
# -m unittest discover` 行为一致（项目里没有 setup.py / pyproject.toml）
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from skill_vitals import state


class _IsolatedHome:
    """临时 `$SKILL_VITALS_HOME` 隔离 fixture —— 让 state.py 的
    `state_dir()` 落到 tmp 目录，**不污染**真机 `~/.skill-vitals/state/`。

    用 `mock.patch.dict(os.environ, …)` 而非真改 HOME / 真 mkdir，因为
    state.py 自己也会 mkdir，mock 阻止它创建真机目录。
    """

    def __init__(self):
        self.tmpdir = tempfile.mkdtemp(prefix="sv-state-test-")
        self.env = {"SKILL_VITALS_HOME": self.tmpdir}

    def __enter__(self):
        self._patcher = mock.patch.dict(os.environ, self.env, clear=False)
        self._patcher.start()
        return self

    def __exit__(self, *args):
        self._patcher.stop()
        # 不主动删 tmp —— 看 _cleanup 是否有问题留给 CI 收
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)


class TestStateDir(unittest.TestCase):
    def test_state_dir_under_skill_vitals_home(self):
        with _IsolatedHome() as h:
            p = state.state_dir()
            self.assertEqual(p, Path(h.tmpdir) / "state")
            self.assertTrue(p.is_dir())

    def test_state_dir_created_lazily(self):
        """state_dir() 必须自己 mkdir，不让调用方操心。"""
        with _IsolatedHome():
            p = state.state_dir()
            self.assertTrue(p.is_dir())


class TestAtomicWrite(unittest.TestCase):
    def test_atomic_write_creates_file(self):
        with _IsolatedHome() as h:
            target = Path(h.tmpdir) / "sub" / "data.json"
            state._atomic_write(target, {"hello": "world", "n": 1})
            self.assertTrue(target.is_file())
            data = json.loads(target.read_text())
            self.assertEqual(data, {"hello": "world", "n": 1})

    def test_atomic_write_leaves_no_tmp_residue_on_success(self):
        """成功路径下不应留 `.tmp.*` 文件——它们是出错时的兜底。"""
        with _IsolatedHome() as h:
            target = Path(h.tmpdir) / "x.json"
            state._atomic_write(target, {"k": "v"})
            tmps = list(Path(h.tmpdir).glob("x.json.tmp.*"))
            self.assertEqual(tmps, [], "成功路径不应留 tmp")

    def test_atomic_write_cleans_tmp_on_failure(self):
        """失败路径下 tmp 必须被清理——state 目录不能被垃圾塞满。"""
        with _IsolatedHome() as h:
            target = Path(h.tmpdir) / "x.json"

            class _Boom(Exception):
                pass

            # 在 fdopen 之后、replace 之前注入异常
            real_replace = os.replace

            def boom(src, dst):
                os.unlink(src)
                raise _Boom("simulated")

            with mock.patch.object(os, "replace", side_effect=boom):
                with self.assertRaises(_Boom):
                    state._atomic_write(target, {"k": "v"})
            tmps = list(Path(h.tmpdir).glob("x.json.tmp.*"))
            self.assertEqual(tmps, [], "失败后必须清理 tmp")


class TestOneline(unittest.TestCase):
    def test_write_oneline_round_trip(self):
        with _IsolatedHome() as h:
            audit = {
                "session_id": "s-1",
                "tokens_total": 12345,
                "cost_cny": 1.23,
                "findings_total": 3,
                "findings_max_severity": "high",
            }
            p = state.write_oneline(audit)
            self.assertTrue(p.is_file())
            loaded = state.read_oneline()
            self.assertEqual(loaded["session_id"], "s-1")
            self.assertEqual(loaded["tokens_total"], 12345)
            self.assertEqual(loaded["schema_version"], state.SCHEMA_VERSION)
            self.assertIn("generated_at", loaded)

    def test_write_oneline_overwrites_previous(self):
        """oneline.json 永远是「最后一行」——不是历史。xbar 拿最新。"""
        with _IsolatedHome():
            state.write_oneline({"session_id": "a"})
            state.write_oneline({"session_id": "b"})
            loaded = state.read_oneline()
            self.assertEqual(loaded["session_id"], "b",
                             "覆盖语义：后写者赢")

    def test_read_oneline_missing_returns_none(self):
        """文件缺场时返回 None，让调用方走「没数据」分支而非编一个。"""
        with _IsolatedHome():
            self.assertIsNone(state.read_oneline())


class TestMergeToday(unittest.TestCase):
    def test_merge_today_accumulates_across_calls(self):
        """两次 audit 同一小时 → 该小时 8 字段全部累加。"""
        with _IsolatedHome():
            # 第 1 次：14 点 +1000 input
            state.merge_today({"buckets": [
                {"date": "2026-08-25", "hour": 14, "is_peak": True,
                 "uncached_input_tokens": 1000, "output_tokens": 100,
                 "cache_read_tokens": 0, "cache_write_tokens": 0,
                 "peak_uncached_input_tokens": 1000, "peak_output_tokens": 100,
                 "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0},
            ]})
            # 第 2 次：14 点 +500 input，15 点 +200 input
            state.merge_today({"buckets": [
                {"date": "2026-08-25", "hour": 14, "is_peak": True,
                 "uncached_input_tokens": 500, "output_tokens": 50,
                 "cache_read_tokens": 0, "cache_write_tokens": 0,
                 "peak_uncached_input_tokens": 500, "peak_output_tokens": 50,
                 "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0},
                {"date": "2026-08-25", "hour": 15, "is_peak": True,
                 "uncached_input_tokens": 200, "output_tokens": 20,
                 "cache_read_tokens": 0, "cache_write_tokens": 0,
                 "peak_uncached_input_tokens": 200, "peak_output_tokens": 20,
                 "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0},
            ]})
            today = json.loads((state.state_dir() / "today.json").read_text())
            buckets = today["buckets"]
            # today.json 桶以 hour 字符串为 key —— 同一小时累加、不同小时独立
            self.assertEqual(buckets["14"]["uncached_input_tokens"], 1500)
            self.assertEqual(buckets["14"]["output_tokens"], 150)
            self.assertEqual(buckets["15"]["uncached_input_tokens"], 200)

    def test_merge_today_skips_unknown_date_buckets(self):
        """time 缺失的 (date=None) 样本不参与日历累计 —— 否则会被算成
        1970-01-01，凭空多出几万 token / 几百块。"""
        with _IsolatedHome():
            state.merge_today({"buckets": [
                {"date": None, "hour": None, "is_peak": None,
                 "uncached_input_tokens": 9999, "output_tokens": 0,
                 "cache_read_tokens": 0, "cache_write_tokens": 0,
                 "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
                 "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0},
            ]})
            today = json.loads((state.state_dir() / "today.json").read_text())
            self.assertEqual(today.get("buckets", {}), {},
                             "未知时间样本不进日历")


class TestMergeMonth(unittest.TestCase):
    def test_merge_month_groups_by_date(self):
        """month.json 按日期折叠（同一天 0–23 点累加成一个日期桶）。"""
        with _IsolatedHome():
            state.merge_month({"buckets": [
                {"date": "2026-08-25", "hour": 14, "is_peak": True,
                 "uncached_input_tokens": 100, "output_tokens": 0,
                 "cache_read_tokens": 0, "cache_write_tokens": 0,
                 "peak_uncached_input_tokens": 100, "peak_output_tokens": 0,
                 "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0},
                {"date": "2026-08-25", "hour": 15, "is_peak": True,
                 "uncached_input_tokens": 200, "output_tokens": 0,
                 "cache_read_tokens": 0, "cache_write_tokens": 0,
                 "peak_uncached_input_tokens": 200, "peak_output_tokens": 0,
                 "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0},
                {"date": "2026-08-26", "hour": 9, "is_peak": True,
                 "uncached_input_tokens": 50, "output_tokens": 0,
                 "cache_read_tokens": 0, "cache_write_tokens": 0,
                 "peak_uncached_input_tokens": 50, "peak_output_tokens": 0,
                 "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0},
            ]})
            month = json.loads((state.state_dir() / "month.json").read_text())
            days = month["days"]
            self.assertEqual(days["2026-08-25"]["uncached_input_tokens"], 300,
                             "同一天两个 hour 累加")
            self.assertEqual(days["2026-08-26"]["uncached_input_tokens"], 50)


class TestLock(unittest.TestCase):
    def test_lock_released_on_exit(self):
        """上下文退出后锁必须释放——否则下一次调用会卡死（POSIX flock
        是阻塞的）。"""
        with _IsolatedHome() as h:
            p = state.state_dir() / "x.json"
            with state._locked(p):
                pass
            # 第二次拿锁应该立即成功（如果第一次没释放会卡几秒）
            with state._locked(p):
                pass


class TestListStateFiles(unittest.TestCase):
    def test_list_excludes_lock_and_tmp(self):
        """`list_state_files()` 不返回 `.lock` 和 `.tmp.*` 文件。"""
        with _IsolatedHome():
            state.write_oneline({"k": "v"})
            (state.state_dir() / "stray.tmp.123").write_text("junk")
            (state.state_dir() / "stray.lock").write_text("junk")
            files = state.list_state_files()
            names = [f.name for f in files]
            self.assertIn("oneline.json", names)
            self.assertNotIn("stray.tmp.123", names)
            self.assertNotIn("stray.lock", names)


if __name__ == "__main__":
    unittest.main(verbosity=2)