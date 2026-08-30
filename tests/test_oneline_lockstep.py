"""R1d-tick: Rust oneline 生产者与 Python mirror 的锁步 + exactly-once + fencing。

`agent-vitals oneline <session_log>` 逐字节镜像 `scan.py oneline`
（`scripts/agent_vitals/cli.py:1149-1305`）。这里钉住：
  · 差分：同一份真实格式 DSH 会话日志，Python 与 Rust 各折进**独立** HOME，
    state 文件逐字节相等（四个时间戳字段掩码），stdout 逐字节相等（HOME 掩码）。
  · exactly-once：同一条 log 折两次，第二次 dedup，状态文件逐字节不变。
  · fencing：owner=python 时 Rust 写者拒绝（exit 2），`state takeover rust`
    之后放行；`--shadow` 演练跳过 fencing。

运行方式（AGENT_VITALS_BIN 必须是**绝对路径**——CI 契约 verify.yml，相对路径
在临时 cwd 下会 FileNotFoundError）：
  AGENT_VITALS_BIN=$PWD/target/release/agent-vitals python3 -m unittest tests.test_oneline_lockstep
没设 AGENT_VITALS_BIN 时整个模块跳过（只有一个实现，无从比对）。

**差分测试用 Rust `--shadow` 对齐 epoch 基线**：Rust 生产路径要先 `takeover rust`
才能过 fencing，而 takeover 本身 `epoch+1` 并把 `since` 盖成 now——Python
mirror 从不 takeover，epoch 永远少 1、`since` 恒 null。两侧直接比会把「takeover
步骤本身」误报成实现差。shadow 模式只跳过 owner 检查，折写链照常（epoch 1、
since null，与 Python 同基线）；真实 takeover 路径由 fencing / exactly-once /
§4.2 验收测试覆盖。
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

# 北京日期键（UTC+8 无 DST）——today.json 的 date 必须等于它，read_overview
# 的 today_cost 才认「今天」（stale → None，不把昨天的账报成今天的）。
_BJ = timezone(timedelta(hours=8))


def _today_bj():
    return datetime.now(_BJ).strftime("%Y-%m-%d")

ROOT = Path(__file__).resolve().parent.parent
_BIN = os.environ.get("AGENT_VITALS_BIN")
_BIN = str(Path(_BIN).resolve()) if _BIN else None
PY_CMD = [sys.executable, str(ROOT / "scripts" / "scan.py")]

# 固定的 machine_namespace：两个 HOME 预置同一份，ledger key 才可逐字节比较
# （各自随机生成会得到不同的 32-hex，key 不同是夹具产物，不是实现差）。
_FIXED_NS = "test-ns-0123456789abcdef"
_NS_SEED = json.dumps(
    {"schema_version": "1.0.0", "machine_namespace": _FIXED_NS})

# fold 写出的时间戳字段（Python/Rust 各用各的 now）—— 掩码后才可比。
_TS_FIELDS = {"folded_at", "last_fold_at", "generated_at", "archived_at"}

# Python 侧才有的产物（文档化的行为差量，Rust 不产）：
#   state/calendar.html —— 展示层产物，R1d 明确不刷（行为差量，见 oneline.rs 注释）；
#   cache/codex-fold.json —— `_render_calendar_html` 内部扫**真机** ~/.codex 的缓存，
#                           宿主相关、不可复现，Rust oneline 无对应产物；
#   *.lock —— Python 的 flock 副作用。
_DELTA_FILES = {"state/calendar.html", "cache/codex-fold.json"}


def _scrub(v):
    if isinstance(v, dict):
        return {k: ("" if k in _TS_FIELDS else _scrub(x)) for k, x in v.items()}
    if isinstance(v, list):
        return [_scrub(x) for x in v]
    return v


def _state_files(home: Path):
    out = []
    for root, _, files in os.walk(home):
        for f in files:
            if f.endswith(".lock"):
                continue
            rel = str(Path(root).relative_to(home) / f)
            if rel in _DELTA_FILES:
                continue
            out.append(rel)
    return sorted(out)


def _run(cmd, home: Path, log: Path):
    env = dict(os.environ)
    env["AGENT_VITALS_HOME"] = str(home)
    env["AGENT_VITALS_SNAPSHOT_DIR"] = str(home / "snap")
    # 不让 Python 初始化扫到真机宿主（isolated_home_env 同款禁用）。
    for adapter in ("CODEX_RUNTIME", "OPENCLAW_RUNTIME", "WORKBUDDY_BUILTINS"):
        env["AGENT_VITALS_DISABLE_" + adapter] = "1"
    env["AGENT_VITALS_DISABLE_OPENCLAW_BUNDLED"] = "1"
    return subprocess.run(
        cmd + [str(log)], env=env, capture_output=True, text=True)


@unittest.skipUnless(_BIN, "未设 AGENT_VITALS_BIN，跳过双实现比对")
class OnelineLockstepTests(unittest.TestCase):
    """oneline 生产者：Python mirror ↔ Rust 实现。"""

    LOG = ROOT / "fixtures" / "dsh" / "resume.jsonl"

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp()).resolve()
        # 日志必须是绝对路径 —— 差分里 Python 的 `str(args.session_log)` 与 Rust
        # 的 `path.display()` 都要进 summary 的 session_log 字段。
        self.log = self.LOG.resolve()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _fresh_home(self):
        home = self.tmp / next(tempfile._get_candidate_names())
        home.mkdir(parents=True, exist_ok=True)
        (home / "machine.json").write_text(_NS_SEED, encoding="utf-8")
        return home

    def test_python_rust_state_and_stdout_byte_equal(self):
        """同一份真实会话日志：两侧折进独立 HOME，state 文件逐字节相等
        （时间戳掩码），stdout 逐字节相等（HOME 掩码）。"""
        py_home, rs_home = self._fresh_home(), self._fresh_home()
        py = _run(PY_CMD + ["oneline"], py_home, self.log)
        # Rust 用 --shadow 对齐 epoch 基线（见模块 docstring）。
        rs = _run([_BIN, "oneline", "--shadow"], rs_home, self.log)
        self.assertEqual(py.returncode, rs.returncode,
                         "退出码不一致：py=%d rs=%d\npy stderr:\n%s\nrs stderr:\n%s"
                         % (py.returncode, rs.returncode, py.stderr, rs.stderr))
        self.assertEqual(
            py.stdout.replace(str(py_home), "<HOME>"),
            rs.stdout.replace(str(rs_home), "<HOME>"),
            "stdout 不一致",
        )

        py_files, rs_files = _state_files(py_home), _state_files(rs_home)
        self.assertEqual(py_files, rs_files, "state 文件集不一致")
        for f in py_files:
            a = _scrub(json.loads((py_home / f).read_text(encoding="utf-8")))
            b = _scrub(json.loads((rs_home / f).read_text(encoding="utf-8")))
            self.assertEqual(a, b, "state 文件 %s 不一致" % f)

        # 关键键再核对一次（掩码可能把真差别一起盖掉——挑几个逐字比）。
        for side, home in (("py", py_home), ("rs", rs_home)):
            oneline = json.loads((home / "state" / "oneline.json").read_text())
            self.assertEqual(oneline["session_id"], "resume", side)
            # resume.jsonl 有 usage 事件：摘要键不能是空壳（「缺列不编列」的反面——
            # 有数据就必须如实带上，不能因为实现差异变 0）。
            self.assertGreater(oneline["tokens_total"], 0, side)
            self.assertGreater(oneline["hour_buckets_summary"]["bucket_count"], 0, side)
            self.assertIn("generated_at", oneline, side)
            self.assertIn("schema_version", oneline, side)

    def test_exactly_once_state_unchanged(self):
        """同一条 log 折两次：第二次 dedup，状态文件逐字节不变。"""
        home = self._fresh_home()
        env = dict(os.environ)
        env["AGENT_VITALS_HOME"] = str(home)
        subprocess.run([_BIN, "state", "takeover", "rust"], env=env,
                       capture_output=True, text=True, check=True)
        r1 = _run([_BIN, "oneline"], home, self.log)
        self.assertEqual(r1.returncode, 0, r1.stderr)
        before = {f: hashlib.md5((home / f).read_bytes()).hexdigest()
                  for f in _state_files(home)}

        r2 = _run([_BIN, "oneline"], home, self.log)
        self.assertEqual(r2.returncode, 0, r2.stderr)
        self.assertIn("already folded; skipping (exactly-once, §4.3)", r2.stdout)
        after = {f: hashlib.md5((home / f).read_bytes()).hexdigest()
                 for f in _state_files(home)}
        self.assertEqual(before, after, "第二次 fold 不应改写任何 state 文件")

    def test_fencing_refuses_when_owner_is_python(self):
        """owner=python（未 takeover）→ exit 2 + fencing 消息，不落盘。"""
        home = self._fresh_home()
        r = _run([_BIN, "oneline"], home, self.log)
        self.assertEqual(r.returncode, 2)
        self.assertIn("writer fencing", r.stderr)
        self.assertIn("not 'rust'", r.stderr)
        # 快速失败：还没碰任何 state 文件。
        self.assertEqual(_state_files(home), ["machine.json"])

    def test_shadow_skips_fencing(self):
        """--shadow 演练：跳过 fencing，照常折写（epoch 基线 1，同 Python）。"""
        home = self._fresh_home()
        r = _run([_BIN, "oneline", "--shadow"], home, self.log)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("state/oneline.json", _state_files(home))
        oneline = json.loads((home / "state" / "oneline.json").read_text())
        self.assertEqual(oneline["session_id"], "resume")

    def test_takeover_then_fold_writes_all_authoritative_files(self):
        """§4.2 前置：takeover rust 之后生产路径放行，today/oneline/alert 齐。"""
        home = self._fresh_home()
        env = dict(os.environ)
        env["AGENT_VITALS_HOME"] = str(home)
        r = subprocess.run([_BIN, "state", "takeover", "rust"], env=env,
                           capture_output=True, text=True, check=True)
        self.assertIn("owner switched to rust", r.stdout)
        r = _run([_BIN, "oneline"], home, self.log)
        self.assertEqual(r.returncode, 0, r.stderr)
        for f in ("oneline.json", "today.json", "alert.json",
                  "month.json", "sessions.jsonl", "session-ledger.json",
                  "writer-manifest.json"):
            self.assertTrue((home / "state" / f).is_file(),
                            "takeover 后缺 %s" % f)
        manifest = json.loads((home / "state" / "writer-manifest.json").read_text())
        self.assertEqual(manifest["owner"], "rust")
        self.assertEqual(manifest["epoch"], 2)  # takeover(1) + fold(2)

    def test_takeover_discover_fold_updates_state_that_ui_reads(self):
        """§4.2 端到端验收：隔离 AGENT_VITALS_HOME + 假 DSH 根（真实格式日志）→
        `state takeover rust` → `discover`（拿到最新未折）→ `oneline --session-id`
        → state 文件更新，且正是 read_overview 读的那几份（today.json 的 date 是
        北京今天、by_model 非空；month.json 有 days；alert.json 有 level）。"""
        home = self._fresh_home()
        fake = self.tmp / "fake-dsh"
        sess_dir = fake / "sessions" / "ws" / "sess-acc"
        sess_dir.mkdir(parents=True)
        log = sess_dir / "session.jsonl"
        lines = self.LOG.read_text().splitlines()
        # 只换 header 的 id（agentId 目录名），其余 schema 字段原样保留——
        # 少了 version/createdAt/cwd 那组，DSH adapter 判「schema mismatch」。
        # 夹具 usage 事件落在 2025-06-15（真实历史会话），原样折进去 today.json
        # 恒空——R1c 的运行时-today 教训：夹具是历史数据，别指望它天然落在今天。
        # 把每个事件的时间整体平移到北京今天零点（保留相对偏移；事件形状不变 →
        # schema-match 保证），token 桶才会落进今天。这是本测试演示「today 非空 +
        # by_model 出数字」的唯一方式，不是改断言迁就夹具。
        header = json.loads(lines[0])
        shift = int(datetime.combine(
            datetime.now(_BJ).date(), datetime.min.time(),
            tzinfo=_BJ).timestamp() * 1000) - int(header["createdAt"])
        for i, line in enumerate(lines):
            e = json.loads(line)
            for k in ("createdAt", "time"):
                if k in e and isinstance(e[k], int):
                    e[k] += shift
            if i == 0:
                e["id"] = "sess-acc"
            lines[i] = json.dumps(e)
        log.write_text("\n".join(lines) + "\n")

        env = dict(os.environ)
        env["AGENT_VITALS_HOME"] = str(home)
        env["DSH_HOME"] = str(fake)
        env["AGENT_VITALS_SNAPSHOT_DIR"] = str(home / "snap")
        for adapter in ("CODEX_RUNTIME", "OPENCLAW_RUNTIME", "WORKBUDDY_BUILTINS"):
            env["AGENT_VITALS_DISABLE_" + adapter] = "1"
        env["AGENT_VITALS_DISABLE_OPENCLAW_BUNDLED"] = "1"

        def run(*cmd):
            return subprocess.run([_BIN] + list(cmd), env=env,
                                  capture_output=True, text=True)

        r = run("state", "takeover", "rust")
        self.assertEqual(r.returncode, 0, r.stderr)

        # discover → 最新未折就是 fake 根里那一条。
        r = run("discover")
        self.assertEqual(r.returncode, 0, r.stderr)
        report = json.loads(r.stdout)
        self.assertEqual(report["bare_jsonl"], 1)
        self.assertEqual(report["zstd_only"], 0)
        self.assertEqual(report["unfolded"][0]["session_id"], "sess-acc")
        found = Path(report["unfolded"][0]["path"]).resolve()
        self.assertEqual(found, log.resolve(), "discover 应指到 fake 根里那条日志")

        # oneline 折账 —— session-id 从 discover 传过来（DSH 落盘名恒 session.jsonl）。
        r = run("oneline", str(found), "--session-id", "sess-acc")
        self.assertEqual(r.returncode, 0, r.stderr)

        # 7 份权威文件齐 —— 正是 read_overview / 菜单栏读的那几份。
        for f in ("oneline.json", "today.json", "alert.json",
                  "month.json", "sessions.jsonl", "session-ledger.json",
                  "writer-manifest.json"):
            self.assertTrue((home / "state" / f).is_file(), "折完缺 %s" % f)

        # UI 反映（read_overview 消费这些文件）：
        #   today.json 的 date == 北京今天，by_model 非空 → today_cost 不判 stale；
        #   month.json 有 days → month_cost 出真数字；
        #   alert.json 有 level → budget 状态行有权威来源。
        today = json.loads((home / "state" / "today.json").read_text())
        self.assertEqual(today["date"], _today_bj(),
                         "today.json 的 date 必须是北京今天（read_overview 判 stale）")
        by_model = today["by_model"]
        self.assertTrue(by_model, "today.json 的 by_model 不能是空壳")
        self.assertGreater(
            by_model["deepseek-v4-flash"]["uncached_input_tokens"], 0)
        month = json.loads((home / "state" / "month.json").read_text())
        self.assertIn("days", month)
        alert = json.loads((home / "state" / "alert.json").read_text())
        self.assertIn("level", alert)
        oneline = json.loads((home / "state" / "oneline.json").read_text())
        self.assertEqual(oneline["session_id"], "sess-acc")

        # exactly-once 在 wire 上闭环：再 discover 一次，未折列表已空（ledger 滤掉）。
        r = run("discover")
        report2 = json.loads(r.stdout)
        self.assertEqual(report2["unfolded"], [],
                         "折过的会话不应再次出现在未折列表（§4.3 exactly-once）")


if __name__ == "__main__":
    unittest.main()
