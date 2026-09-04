#!/usr/bin/env python3
"""Rust 状态写链（`crates/agent-vitals-domain/src/domain/state.rs` + `agent-vitals-runtime/src/state.rs`）的
差分 + 字符化锁步测试（R1c）。

两层：
1. `StateWriteChainDiff` —— 同一份夹具（日期在运行时按北京「今天」生成），Python
   `state.py` 进程内驱动、Rust `agent-vitals state …` 子进程驱动，各写各的隔离
   `AGENT_VITALS_HOME`，打码 `generated_at`/`archived_at` 后**逐字节**比对
   today.json / month.json / month-archive.json / oneline.json / alert.json /
   sessions.jsonl。这是 Rust 写链与 Python 镜像的差分门 —— 两边一旦漂移这里就红。
2. `StateMergeCharacterization` —— 把 Python 侧 merge 的输出钉到**具体数值**，与
   `crates/agent-vitals-domain/src/domain/state.rs` 里单测的期望值逐一对应（test_cost_priced_day
   同款交叉锁定模式）：Python 与 Rust 各自断言同一组数字，docstring 互相指认。

跑法（Rust 差分需要 AGENT_VITALS_BIN，与 test_cli_matrix 同款注入）：
    AGENT_VITALS_BIN=target/release/agent-vitals python3 -m unittest tests.test_state_write_chain -v
"""

import contextlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from tests.env_helpers import isolated_home_env  # noqa: E402
from agent_vitals.agent import state as state_mod  # noqa: E402
from agent_vitals.agent import budget as budget_mod  # noqa: E402

_BIN = os.environ.get("AGENT_VITALS_BIN")
# 与 golden_runner.py / test_cli_matrix.py 同款：解析成绝对路径。差分用例以
# tmp/workdir 为 cwd 跑子进程，相对路径在这里会 FileNotFoundError（CI 传绝对
# 路径所以没暴露；本机按 CLAUDE.md 的 `AGENT_VITALS_BIN=target/release/...`
# 跑就炸）。
if _BIN:
    _BIN = str(Path(_BIN).resolve())
_BJ = timezone(timedelta(hours=8))

# 8 桶字段 —— 与 core/state.rs 的 BUCKET_FIELDS 同清单。
BUCKET_FIELDS = (
    "uncached_input_tokens", "output_tokens",
    "cache_read_tokens", "cache_write_tokens",
    "peak_uncached_input_tokens", "peak_output_tokens",
    "peak_cache_read_tokens", "peak_cache_write_tokens",
)


def _zero_bucket():
    return {f: 0 for f in BUCKET_FIELDS}


def bj_now():
    return datetime.now(_BJ)


def today_str():
    return bj_now().strftime("%Y-%m-%d")


def yesterday_str():
    return (bj_now() - timedelta(days=1)).strftime("%Y-%m-%d")


def cur_month_str():
    return bj_now().strftime("%Y-%m")


def prev_month_str():
    return (bj_now().replace(day=1) - timedelta(days=1)).strftime("%Y-%m")


def _mask_ts(text):
    """打码写链自己盖的时间戳：Python 与 Rust 各自写各自的 now，必然不同。
    `rotated_from`/`date`/`month` 是确定性日期，不打码。"""
    return re.sub(r'"(generated_at|archived_at)": "[^"]*"',
                  r'"\1": "<TS>"', text)


def _write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2,
                               sort_keys=True, default=str),
                    encoding="utf-8")


@unittest.skipUnless(_BIN, "未设 AGENT_VITALS_BIN，跳过双实现差分")
class StateWriteChainDiff(unittest.TestCase):
    """同一夹具 → Python in-process vs Rust 子进程 → 写出的 state 文件逐字节一致。"""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp()).resolve()
        (self.tmp / "workdir").mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    # ── 驱动两边 ────────────────────────────────────────────────
    def _py_state(self, fn, *args, **kwargs):
        """进程内驱动 Python state 模块，把 AGENT_VITALS_HOME 指到 py-home。"""
        home = self.tmp / "py-home"
        home.mkdir(parents=True, exist_ok=True)
        prev = os.environ.get("AGENT_VITALS_HOME")
        os.environ["AGENT_VITALS_HOME"] = str(home)
        try:
            return fn(*args, **kwargs)
        finally:
            if prev is None:
                os.environ.pop("AGENT_VITALS_HOME", None)
            else:
                os.environ["AGENT_VITALS_HOME"] = prev

    def _rs_state(self, *argv):
        """子进程驱动 Rust CLI，AGENT_VITALS_HOME 指到 rs-home。"""
        home = self.tmp / "rs-home"
        env = isolated_home_env(self.tmp)
        env["AGENT_VITALS_HOME"] = str(home)
        r = subprocess.run([_BIN, *argv], cwd=str(self.tmp / "workdir"),
                           env=env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, "Rust %r 失败:\n%s" % (argv, r.stderr))
        return home / "state"

    def _seed_both(self, rel: str, data):
        """把同一份状态文件种子同时写进 py-home 与 rs-home。"""
        for side in ("py-home", "rs-home"):
            _write_json(self.tmp / side / "state" / rel, data)

    def _assert_state_files_equal(self, *rels):
        for rel in rels:
            a = (self.tmp / "py-home" / "state" / rel)
            b = (self.tmp / "rs-home" / "state" / rel)
            if not a.exists():
                self.assertFalse(b.exists(), f"{rel}: Rust 多写了 {rel}")
                continue
            self.assertTrue(b.exists(), f"{rel}: Rust 没写 {rel}")
            self.assertEqual(
                _mask_ts(a.read_text(encoding="utf-8")),
                _mask_ts(b.read_text(encoding="utf-8")),
                f"{rel} 字节不一致（打码 generated_at/archived_at 后）",
            )

    # ── 用例 ────────────────────────────────────────────────────
    def test_merge_today_accumulates_same_hour(self):
        """同一小时多次审计累加 + by_model 并列写入。"""
        today = today_str()
        hb = {"buckets": [
            {"date": today, "hour": 9, "uncached_input_tokens": 100},
            {"date": today, "hour": 9, "uncached_input_tokens": 50},
        ]}
        bm = {"deepseek-v4-flash": dict(_zero_bucket(), uncached_input_tokens=150)}
        # Python
        self._py_state(state_mod.merge_today, hb, by_model=bm)
        # Rust
        _write_json(self.tmp / "hb.json", hb)
        _write_json(self.tmp / "bm.json", bm)
        self._rs_state("state", "merge-today", str(self.tmp / "hb.json"),
                       "--by-model", str(self.tmp / "bm.json"))
        self._assert_state_files_equal("today.json")

    def test_merge_today_rotates_yesterday_and_clears(self):
        """today.json 里是昨天 → 合并前滚动成空桶 + 新日期 + rotated_from（不清空 by_model 例外）。"""
        today, yesterday = today_str(), yesterday_str()
        seed = {
            "schema_version": "1.0.0", "date": yesterday,
            "buckets": {"21": dict(_zero_bucket(), uncached_input_tokens=500)},
            "generated_at": "seed",
        }
        self._seed_both("today.json", seed)
        hb = {"buckets": [{"date": today, "hour": 9, "uncached_input_tokens": 10}]}
        # Python
        self._py_state(state_mod.merge_today, hb, by_model=None)
        # Rust
        _write_json(self.tmp / "hb.json", hb)
        self._rs_state("state", "merge-today", str(self.tmp / "hb.json"))
        self._assert_state_files_equal("today.json")

    def test_merge_today_drops_by_model_when_no_today_buckets(self):
        """dated 桶整段不是今天 → by_model 丢弃（兜底，不对称：无 dated 桶时保留）。"""
        yesterday = yesterday_str()
        hb = {"buckets": [{"date": yesterday, "hour": 21, "uncached_input_tokens": 99}]}
        bm = {"deepseek-v4-flash": dict(_zero_bucket(), uncached_input_tokens=99)}
        # Python
        self._py_state(state_mod.merge_today, hb, by_model=bm)
        # Rust
        _write_json(self.tmp / "hb.json", hb)
        _write_json(self.tmp / "bm.json", bm)
        self._rs_state("state", "merge-today", str(self.tmp / "hb.json"),
                       "--by-model", str(self.tmp / "bm.json"))
        self._assert_state_files_equal("today.json")

    def test_merge_today_keeps_by_model_when_no_dated_buckets(self):
        """没有任何带日期的桶 → 保留 by_model（不对称是有意的，见 state.py 注释）。"""
        hb = {"buckets": [{"uncached_input_tokens": 33}]}  # 无 date 字段
        bm = {"deepseek-v4-flash": dict(_zero_bucket(), uncached_input_tokens=33)}
        # Python
        self._py_state(state_mod.merge_today, hb, by_model=bm)
        # Rust
        _write_json(self.tmp / "hb.json", hb)
        _write_json(self.tmp / "bm.json", bm)
        self._rs_state("state", "merge-today", str(self.tmp / "hb.json"),
                       "--by-model", str(self.tmp / "bm.json"))
        self._assert_state_files_equal("today.json")

    def test_merge_month_migrates_stale_then_backfills(self):
        """① 旧月日子迁进归档（逐日替换）→ ② 新数据按日期分流（当月进 month.json、
        历史月累加进归档）。归档种子 3 被迁移替换成 10，再回填累加成 15。"""
        today, cur, prev = today_str(), cur_month_str(), prev_month_str()
        prev_date, cur_date = f"{prev}-15", (f"{cur}-01" if today != f"{cur}-01" else f"{cur}-02")
        model = "deepseek-v4-flash"
        seed_month = {
            "month": cur,
            "days": {prev_date: dict(_zero_bucket(), uncached_input_tokens=10)},
            "schema_version": "1.0.0", "generated_at": "seed",
        }
        seed_archive = {
            "months": {prev: {"days": {
                prev_date: dict(_zero_bucket(), uncached_input_tokens=3),
            }}},
            "schema_version": "1.0.0",
        }
        self._seed_both("month.json", seed_month)
        self._seed_both("month-archive.json", seed_archive)

        hb = {"buckets": [{"date": today, "hour": 9, "uncached_input_tokens": 7}]}
        bdm = {
            today: {model: dict(_zero_bucket(), uncached_input_tokens=7)},
            prev_date: {model: dict(_zero_bucket(), uncached_input_tokens=5)},
            cur_date: {model: dict(_zero_bucket(), uncached_input_tokens=4)},
        }
        # Python
        self._py_state(state_mod.merge_month, hb, by_date_model=bdm)
        # Rust
        _write_json(self.tmp / "hb.json", hb)
        _write_json(self.tmp / "bdm.json", bdm)
        self._rs_state("state", "merge-month", str(self.tmp / "hb.json"),
                       "--by-date-model", str(self.tmp / "bdm.json"))
        self._assert_state_files_equal("month.json", "month-archive.json")

    def test_merge_month_accumulates_into_existing_current_days(self):
        """第二次 merge 累加进已有的当月日子（逐字段相加，不覆盖）。"""
        today = today_str()
        model = "deepseek-v4-flash"
        seed_month = {
            "month": cur_month_str(),
            "days": {today: dict(_zero_bucket(), uncached_input_tokens=10,
                                 output_tokens=2)},
            "schema_version": "1.0.0", "generated_at": "seed",
        }
        self._seed_both("month.json", seed_month)
        hb = {"buckets": [{"date": today, "hour": 9, "uncached_input_tokens": 7}]}
        bdm = {today: {model: dict(_zero_bucket(), uncached_input_tokens=7)}}
        # Python
        self._py_state(state_mod.merge_month, hb, by_date_model=bdm)
        # Rust
        _write_json(self.tmp / "hb.json", hb)
        _write_json(self.tmp / "bdm.json", bdm)
        self._rs_state("state", "merge-month", str(self.tmp / "hb.json"),
                       "--by-date-model", str(self.tmp / "bdm.json"))
        self._assert_state_files_equal("month.json", "month-archive.json")

    def test_write_oneline_alert_and_history(self):
        """oneline.json / alert.json 盖 schema_version + generated_at；sessions.jsonl
        追加一行（Python 分隔符、不 sort_keys、generated_at 补在末尾）。"""
        summary = {
            "session_id": "s1", "session_log": "/tmp/s1.jsonl", "duration_ms": 123,
            "model": "deepseek-v4-flash", "tokens_total": 100, "tokens_peak": 100,
            "cost_cny": 0.12, "cost_peak_cny": 0.0, "unpriced_tokens": 0,
            "findings_total": 1, "findings_max_severity": "warning",
            "hour_buckets_summary": {"bucket_count": 1, "min_date": today_str(),
                                     "max_date": today_str(), "tz_name": "Asia/Shanghai"},
        }
        alert = {"level": "warning", "daily_pct": 40.0, "daily_cny": 30.0,
                 "monthly_pct": 12.5, "monthly_cny": 500.0}
        # Python —— 输入 dict 的键序就是 JSONL 行的键序，Rust 侧用同序 JSON 文件喂。
        self._py_state(state_mod.write_oneline, summary)
        self._py_state(state_mod.write_alert, alert)
        self._py_state(state_mod.append_session_history, summary)
        # Rust
        with (self.tmp / "summary.json").open("w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, default=str)  # 不 sort —— 保序
        _write_json(self.tmp / "alert.json", alert)
        self._rs_state("state", "write-oneline", str(self.tmp / "summary.json"))
        self._rs_state("state", "write-alert", str(self.tmp / "alert.json"))
        self._rs_state("state", "append-history", str(self.tmp / "summary.json"))
        self._assert_state_files_equal("oneline.json", "alert.json", "sessions.jsonl")

    def test_snooze_set_and_clear(self):
        """set_snooze 规整 ISO 写 budget.json；clear_snooze 删文件。"""
        until = "2026-08-31T18:00:00+08:00"
        self._py_state(budget_mod.set_snooze, until, "demo")
        self._rs_state("state", "snooze", until, "demo")
        self._assert_state_files_equal("budget.json")
        # clear：两边都删掉，文件消失
        self._py_state(budget_mod.clear_snooze)
        self._rs_state("state", "unsnooze")
        for side in ("py-home", "rs-home"):
            self.assertFalse((self.tmp / side / "state" / "budget.json").exists())


class StateMergeCharacterization(unittest.TestCase):
    """Python 侧 merge 的具体数值 —— 与 core/state.rs 的单测期望值对守。

    同一份夹具、同一组数字，Python 这里断言、Rust `#[cfg(test)]` 断言，docstring
    互相指认。改数字 = 两边一起改，任何一边单独漂移都会让另一侧失去参照。
    """

    @contextlib.contextmanager
    def _py_home(self):
        home = Path(tempfile.mkdtemp())
        prev = os.environ.get("AGENT_VITALS_HOME")
        os.environ["AGENT_VITALS_HOME"] = str(home)
        try:
            yield
        finally:
            shutil.rmtree(home, ignore_errors=True)
            if prev is None:
                os.environ.pop("AGENT_VITALS_HOME", None)
            else:
                os.environ["AGENT_VITALS_HOME"] = prev

    def test_merge_today_accumulates_same_hour(self):
        today = today_str()
        hb = {"buckets": [
            {"date": today, "hour": 9, "uncached_input_tokens": 100},
            {"date": today, "hour": 9, "uncached_input_tokens": 50},
        ]}
        model = "deepseek-v4-flash"
        bm = {model: dict(_zero_bucket(), uncached_input_tokens=150)}
        with self._py_home():
            state_mod.merge_today(hb, by_model=bm)
            f = state_mod._read(state_mod.state_dir() / "today.json")
            self.assertEqual(f["buckets"]["9"]["uncached_input_tokens"], 150)
            self.assertEqual(f["by_model"][model]["uncached_input_tokens"], 150)
            self.assertEqual(f["date"], today)

    def test_merge_month_accumulates_fields(self):
        """`merge_buckets` 逐字段相加：现有值 + 新值，不是覆盖。"""
        today = today_str()
        hb = {"buckets": [{"date": today, "hour": 9, "uncached_input_tokens": 7}]}
        bdm = {today: {"deepseek-v4-flash": dict(_zero_bucket(),
                                                 uncached_input_tokens=7)}}
        with self._py_home():
            state_mod.merge_month(hb, by_date_model=bdm)
            f = state_mod._read(state_mod.state_dir() / "month.json")
            day = f["days"][today]
            self.assertEqual(day["uncached_input_tokens"], 7)
            self.assertEqual(day["output_tokens"], 0)
            self.assertEqual(day["by_model"]["deepseek-v4-flash"]["uncached_input_tokens"], 7)

    def test_merge_month_second_run_accumulates_not_overwrites(self):
        today = today_str()
        bdm = {today: {"deepseek-v4-flash": dict(_zero_bucket(),
                                                 uncached_input_tokens=7)}}
        with self._py_home():
            state_mod.merge_month(
                {"buckets": [{"date": today, "hour": 9, "uncached_input_tokens": 7}]},
                by_date_model=bdm)
            state_mod.merge_month(
                {"buckets": [{"date": today, "hour": 9, "uncached_input_tokens": 3}]},
                by_date_model=bdm)
            f = state_mod._read(state_mod.state_dir() / "month.json")
            self.assertEqual(f["days"][today]["uncached_input_tokens"], 10)
            self.assertEqual(f["days"][today]["by_model"]["deepseek-v4-flash"]["uncached_input_tokens"], 14)


if __name__ == "__main__":
    unittest.main()
