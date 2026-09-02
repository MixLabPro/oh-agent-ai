#!/usr/bin/env python3
"""R2a SessionStore Phase 1 验收门（docs/R2A_CONTRACT_DESIGN.md §6.3 六项）。

Phase 1 是「最小可查询 SessionStore + 版本化契约」的落地。本文件按 §6.3 的
依赖序钉住六项：

  · §6.3-5 SessionKey + 强类型修订：四元组键序固定、ledger_key 自定界、
    FNV-1a 已知值（与 Rust core `r2a.rs` 硬编码期望串同源）、per-filter 派生
    StoreRevision 的「无关更新不误拒 / 命中集更新必失效」。
  · §6.3-6 版本化信封 + 版本矩阵 + N±1 兼容：version "0"（N-1）可读、"2"
    （N+1）schema-mismatch、且**按版本闸拒绝、不看字段名**（独立升级顺序）。
  · §6.3-3 机器命名空间持久化：可重放（同 AGENT_VITALS_HOME → 同值）、落在
    app 自有 config（data_home/machine.json），不在 state 目录。
  · §6.3-7 查询模型 + 类型化错误码：list（filter + cursor 分页）/ read
    （key + revision）；source-unavailable 是错误码不是空页；per-filter
    revision 不误拒无关更新。
  · §6.3-9 冻结夹具对账台（初版）：跨实现字节对账 —— cache 共享双方向
    逐字节一致（含 generated_at），独立重建归一化 generated_at 后结构一致，
    错误路径（source-unavailable / invalid cursor）逐字节一致。
  · §6.3-11 初填端到端（Codex 路径）：隔离 HOME + 真格式语料 → 根发现 →
    适配器 → SessionStore 查询全链；删 cache 重建逐字节稳定。

Rust 侧镜像：`core::r2a` 的 `#[cfg(test)]`（25 个纯规则单测）+ 二进制
`r2a_store.rs`（7 个 I/O/e2e 单测）。本文件的纯规则用例与 core 的断言值同源；
跨实现对账用例只在 `AGENT_VITALS_BIN` 已设时跑（只有一侧无从比对，同
test_cli_matrix 约定）。
"""

import json
import functools
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from tests.env_helpers import isolated_home_env

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from agent_vitals.agent import r2a as R2A  # noqa: E402

_BIN = os.environ.get("AGENT_VITALS_BIN")
if _BIN:
    _BIN = str(Path(_BIN).resolve())
PY_CMD = [sys.executable, str(ROOT / "scripts" / "scan.py")]

FIXTURE_COST = ROOT / "fixtures" / "codex" / "cost"
FIXTURE_DSH = ROOT / "fixtures" / "dsh"

# DSH 的多帧 zstd 会话（fixtures/dsh/session.jsonl.zstd）解码需要 zstandard——
# 该包是**可选**依赖（repo 本身零第三方，只有测试/夹具生成器在装了它时多跑一层）。
# 缺 zstandard 时 Python 侧诚实报 unsupported-compression 降级，无法与 Rust 逐字节
# 对账；所以 DSH fixture 用例整体 skip，只有装了 zstandard 才跑。
try:
    import zstandard  # noqa: F401
    _HAVE_ZSTD = True
except ImportError:
    _HAVE_ZSTD = False


# ── 夹具/环境工具 ───────────────────────────────────────────────

def _fake_codex_home(base: Path) -> Path:
    """隔离的模拟 HOME：真格式 Codex 语料（fixtures/codex/cost 的三个 rollout）。

    与 Rust `r2a_store::fake_codex_home` 同构：`rollout-sol` + `rollout-unpriced`
    在 live sessions/2026/08，`rollout-terra` 在 archived_sessions/2026/07 →
    3 个逻辑 session（session_id = 文件名 stem）。
    """
    home = base / "home"
    live = home / ".codex" / "sessions" / "2026" / "08"
    arch = home / ".codex" / "archived_sessions" / "2026" / "07"
    live.mkdir(parents=True, exist_ok=True)
    arch.mkdir(parents=True, exist_ok=True)
    shutil.copy2(FIXTURE_COST / "rollout-sol.jsonl", live / "rollout-sol.jsonl")
    shutil.copy2(FIXTURE_COST / "rollout-unpriced.jsonl",
                 live / "rollout-unpriced.jsonl")
    shutil.copy2(FIXTURE_COST / "rollout-terra.jsonl",
                 arch / "rollout-terra.jsonl")
    return home


def _env(home: Path, av: Path):
    env = isolated_home_env(home)
    env["AGENT_VITALS_HOME"] = str(Path(av).resolve())
    return env


def _run_py(args, env):
    return subprocess.run(PY_CMD + args, cwd=str(ROOT), env=env, text=True,
                          capture_output=True, timeout=180)


def _run_rs(args, env):
    return subprocess.run([_BIN] + args, cwd=str(ROOT), env=env, text=True,
                          capture_output=True, timeout=180)


def _normalize_generated_at(obj):
    """递归把 `generated_at` 归一化（None）。独立重建的墙钟字段必然不同——
    逐字节一致承诺的是**源派生内容**，墙钟字段归一化掉（同 Rust `store_bytes`）。"""
    if isinstance(obj, dict):
        return {k: (None if k == "generated_at" else _normalize_generated_at(v))
                for k, v in obj.items()}
    if isinstance(obj, list):
        return [_normalize_generated_at(x) for x in obj]
    return obj


def _cache_path(av: Path) -> Path:
    return Path(av) / "cache" / "r2a" / "codex-sessions.json"


def _dsh_cache_path(av: Path) -> Path:
    return Path(av) / "cache" / "r2a" / "dsh-sessions.json"


def _fake_dsh_home(base: Path) -> Path:
    """隔离的模拟 HOME：**多帧 zstd** DSH 语料（fixtures/dsh）。

    与 Rust `r2a_store::fake_dsh_home` 同源，只是会话文件换成已提交的
    `session.jsonl.zstd`（3 帧 = flush 了 3 次，fixtures/dsh/build_zstd_fixture.py
    生成）——Python 侧要覆盖 zstd 路径，就得喂 zstd 文件，裸 jsonl 只测得到
    `compression:'none'` 分支。目录名 `demo-proj` 故意与 header id 不同——native id
    以头行为准（§1.3/§4.5）：
      `~/.dsh/sessions/demo-proj/agent-1/session.jsonl.zstd`
      `~/.dsh/storages/workspace.json`（标题索引：sess-behavior-0001 → demo project）
    """
    home = base / "home"
    sdir = home / ".dsh" / "sessions" / "demo-proj" / "agent-1"
    sdir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(FIXTURE_DSH / "session.jsonl.zstd", sdir / "session.jsonl.zstd")
    storages = home / ".dsh" / "storages"
    storages.mkdir(parents=True, exist_ok=True)
    shutil.copy2(FIXTURE_DSH / "workspace.json", storages / "workspace.json")
    return home


FIXTURE_CLAUDE = ROOT / "fixtures" / "claude"


def _claude_cache_path(av: Path) -> Path:
    return Path(av) / "cache" / "r2a" / "claude-sessions.json"


def _fake_claude_home(base: Path) -> Path:
    """隔离的模拟 HOME：真格式 Claude 语料（fixtures/claude 的三个合成日志）。

    与 Rust `r2a_store::fake_claude_home` 同构：`healthy` + `dangerous` +
    `all-recorded` 拷进 `~/.claude/projects/<slug>/` → 3 个逻辑 session
    （session_id = 文件 stem）。"""
    home = base / "home"
    _fake_claude_under(home)
    return home


def _fake_claude_under(home: Path) -> Path:
    """在既有 home 下补 Claude 会话（供三源合并测试复用）。
    mirror Rust `fake_claude_under`。"""
    d = home / ".claude" / "projects" / "p-skill-vitals"
    d.mkdir(parents=True, exist_ok=True)
    for name in ["healthy.jsonl", "dangerous.jsonl", "all-recorded.jsonl"]:
        shutil.copy2(FIXTURE_CLAUDE / name, d / name)
    return home


# ── §6.3-5 / §6.3-6 纯规则镜像（与 core `r2a.rs` 断言值同源）───────

def _entry(native_id, rev="2026-08-30", seq=0, host="codex"):
    k = R2A.SessionKey(host, native_id, "/repo", "ns")
    return R2A.SessionReportEntry(
        key=k, session_revision=rev, title="标题", model="gpt-5.6-sol",
        date_first="2026-08-01", date_last=rev, files=2, cost_usd=1.23,
        tokens_total=45678, findings_total=3, store_seq=seq,
        envelope={"schema_version": "1", "session": {}},
    )


def _recent_entry(native_id, date_last, rev, host="codex"):
    """recent_cmp 测试专用：date_last / revision 可指定。与 Rust
    `r2a.rs::tests::recent_entry` 同构——两侧各钉同一组输入（spec §6 决策 2）。"""
    e = _entry(native_id, rev=rev or "2026-08-30T12:00:00Z", host=host)
    e.date_first = date_last
    e.date_last = date_last
    e.session_revision = rev
    return e


class R2aPureRuleTests(unittest.TestCase):
    """纯规则镜像：版本闸、键序、FNV、filter hash、list/read 语义。

    这些断言值与 Rust core `r2a.rs` 的 `#[cfg(test)]` 硬编码期望串同源——
    一侧改了另一侧立刻红。
    """

    # ── 版本矩阵（§6.3-6 / §2.3）────────────────────────────────

    def test_version_matrix_n_minus_1_backward_compat(self):
        # N-1 = major 0（老投影，字段子集）→ 向后兼容（≤ MAX 即可读）。
        R2A.parse_envelope({"schema_version": "0"})
        R2A.parse_envelope({"schema_version": "1"})

    def test_version_matrix_rejects_n_plus_1_by_version(self):
        # N+1 = major 2 → schema-mismatch。
        with self.assertRaises(R2A.EnvelopeError) as cm:
            R2A.parse_envelope({"schema_version": "2"})
        self.assertEqual(cm.exception.code, "schema-mismatch")

    def test_version_matrix_rejects_jump_by_version_not_field_names(self):
        # 独立升级顺序测试：N-1 → N+1 直接跳（跳过 N）。N+1 文档就算字段名全都
        # 还在（version-1 的名字），版本闸也必须拒 —— 不能「碰巧字段还叫这名字
        # 就放行」（设计 §2.3 原话）。
        doc = {
            "schema_version": "2",
            "session_key": {"host_kind": "codex", "native_id": "s1"},
            "session_revision": "2026-08-30T11:00:00Z",
            "session": {"session_id": "s1"},
        }
        with self.assertRaises(R2A.EnvelopeError) as cm:
            R2A.parse_envelope(doc)
        self.assertEqual(cm.exception.code, "schema-mismatch")

    def test_version_matrix_rejects_malformed(self):
        with self.assertRaises(R2A.EnvelopeError) as cm:
            R2A.parse_envelope({"schema_version": 1})
        self.assertEqual(cm.exception.code, "missing-field")
        with self.assertRaises(R2A.EnvelopeError) as cm:
            R2A.parse_envelope({"schema_version": "abc"})
        self.assertEqual(cm.exception.code, "schema-mismatch")
        with self.assertRaises(R2A.EnvelopeError):
            R2A.parse_envelope({})

    def test_envelope_key_order_is_fixed(self):
        # 键序是字节一致的一部分，不能重排（§2.1）。
        key = R2A.SessionKey("codex", "s1", "/repo", "ns-abc")
        env = R2A.build_envelope(
            "1", "abc123", 7, "2026-08-30T12:00:00Z",
            {"codex": {"status": "ok"}}, key, "2026-08-30T11:00:00Z",
            {"session_id": "s1"})
        self.assertEqual(
            list(env.keys()),
            ["schema_version", "engine_version", "pricing_version",
             "store_revision", "generated_at", "source_statuses",
             "session_key", "session_revision", "session"])
        self.assertEqual(env["schema_version"], "1")
        self.assertEqual(env["store_revision"], 7)

    # ── SessionKey（§6.3-5 / §1.1）──────────────────────────────

    def test_session_key_json_order_and_roundtrip(self):
        k = R2A.SessionKey("codex", "s1", "/repo", "ns-abc")
        v = k.to_json()
        self.assertEqual(
            list(v.keys()),
            ["host_kind", "native_id", "source_profile", "machine_namespace"])
        self.assertEqual(R2A.SessionKey.from_json(v), k)
        self.assertIsNone(R2A.SessionKey.from_json({"host_kind": "codex"}))

    def test_ledger_key_is_self_delimiting_four_seg(self):
        k = R2A.SessionKey("codex", "s1", "/repo", "ns-abc")
        self.assertEqual(k.ledger_key(), "5:codex|2:s1|5:/repo|6:ns-abc")
        # 长度前缀消除拼接歧义；字段含分隔符也不撞。
        self.assertNotEqual(
            R2A.SessionKey("ab", "c", "d", "e").ledger_key(),
            R2A.SessionKey("a", "bc", "d", "e").ledger_key())
        self.assertNotEqual(
            R2A.SessionKey("a|b", "c", "d", "e").ledger_key(),
            R2A.SessionKey("a", "b|c", "d", "e").ledger_key())

    def test_fnv1a64_matches_known_values(self):
        # 空输入与单字节 —— Rust core `r2a.rs` 钉同一组已知值。
        self.assertEqual(R2A.fnv1a64(b""), 0xCBF29CE484222325)
        self.assertEqual(R2A.fnv1a64(b"a"), 0xAF63DC4C8601EC8C)

    def test_filter_hash_matches_pinned_value(self):
        a = R2A.SessionFilter(host_kind="codex")
        expected = "{:016x}".format(R2A.fnv1a64(
            b"host=codex|model=|from=|to=|q="))
        self.assertEqual(a.hash(), expected)

    # ── 查询模型（§6.3-7 / §3.3）────────────────────────────────

    def _three(self):
        return [_entry("b", rev="2026-08-02", seq=0),
                _entry("a", rev="2026-08-01", seq=1),
                _entry("z", rev="2026-08-03", seq=2, host="dsh")]

    def test_list_stable_sort_and_per_filter_revision(self):
        page = R2A.list_sessions(self._three(), R2A.SessionFilter(), None, 10)
        self.assertEqual(page.total, 3)
        self.assertIsNone(page.next_cursor)
        ids = [it["session_key"]["native_id"] for it in page.items]
        self.assertEqual(ids, ["a", "b", "z"])  # 内容字典序，不是 ledger 长度序
        self.assertEqual(page.store_revision, 2)  # 命中集最大 store_seq

    def test_list_paginates_through_all_without_dup_or_skip(self):
        f = R2A.SessionFilter()
        p0 = R2A.list_sessions(self._three(), f, None, 2)
        self.assertEqual(len(p0.items), 2)
        c0 = p0.next_cursor
        self.assertIsNotNone(c0)
        p1 = R2A.list_sessions(self._three(), f, c0, 2)
        self.assertEqual(len(p1.items), 1)
        self.assertIsNone(p1.next_cursor)
        ids = [it["session_key"]["native_id"]
               for it in p0.items + p1.items]
        self.assertEqual(ids, ["a", "b", "z"])

    def test_list_unrelated_update_does_not_stale_cursor(self):
        # filter 只命中 codex；dsh 会话更新（更高 seq）不 bump per-filter
        # revision → cursor 依旧有效（「分页期间其他会话更新不误拒」）。
        es = [_entry("a", rev="2026-08-01", seq=0),
              _entry("b", rev="2026-08-02", seq=1)]
        f = R2A.SessionFilter(host_kind="codex")
        c0 = R2A.list_sessions(es, f, None, 1).next_cursor
        es2 = es + [_entry("z", rev="2026-08-03", seq=99, host="dsh")]
        page = R2A.list_sessions(es2, f, c0, 1)
        self.assertEqual(len(page.items), 1)
        self.assertEqual(page.items[0]["session_key"]["native_id"], "b")

    def test_list_matched_update_stales_cursor(self):
        # 命中集出现更高 seq 新成员 → per-filter revision bump → stale。
        es = [_entry("a", rev="2026-08-01", seq=0),
              _entry("b", rev="2026-08-02", seq=1)]
        f = R2A.SessionFilter(host_kind="codex")
        c0 = R2A.list_sessions(es, f, None, 1).next_cursor
        es2 = es + [_entry("c", rev="2026-08-04", seq=5)]
        with self.assertRaises(R2A.StoreError) as cm:
            R2A.list_sessions(es2, f, c0, 1)
        self.assertEqual(cm.exception.code, "stale-revision")

    # ── recent_cmp（spec §6 决策 2）──────────────────────────────

    def test_recent_cmp_date_desc_then_revision_desc_then_key_asc(self):
        # 与 Rust `r2a.rs::tests::recent_cmp_date_desc_then_revision_desc_then_key_asc`
        # 同一组输入、同一期望串——一侧改了另一侧立刻红。
        es = [
            _recent_entry("old", "2026-08-01", "r1"),
            _recent_entry("new", "2026-09-01", "r1"),
            _recent_entry("same-date", "2026-09-01", "r1", host="dsh"),
            _recent_entry("newer-rev", "2026-09-01", "r2"),
        ]
        ids = [e.key.native_id
               for e in sorted(es, key=functools.cmp_to_key(R2A.recent_cmp))]
        self.assertEqual(ids, ["newer-rev", "new", "same-date", "old"])

    def test_recent_cmp_none_date_or_revision_last(self):
        # date 主键优先：full 与 no-rev 同 date → full（有 rev）在前；no-date 与
        # nothing 都无 date → 比 revision → no-date（r9）在前。
        es = [
            _recent_entry("no-rev", "2026-09-01", None),
            _recent_entry("no-date", None, "r9"),
            _recent_entry("nothing", None, None),
            _recent_entry("full", "2026-09-01", "r9"),
        ]
        ids = [e.key.native_id
               for e in sorted(es, key=functools.cmp_to_key(R2A.recent_cmp))]
        self.assertEqual(ids, ["full", "no-rev", "no-date", "nothing"])

    def test_read_session_typed_errors(self):
        es = self._three()
        k = R2A.SessionKey("codex", "a", "/repo", "ns")
        env = R2A.read_session(es, k, None)
        self.assertEqual(env["schema_version"], "1")
        with self.assertRaises(R2A.StoreError) as cm:
            R2A.read_session(es, R2A.SessionKey("codex", "missing", "/r", "ns"),
                             None)
        self.assertEqual(cm.exception.code, "not-found")
        with self.assertRaises(R2A.StoreError) as cm:
            R2A.read_session(es, k, "2026-08-99")
        self.assertEqual(cm.exception.code, "stale-revision")


# ── §6.3-3 机器命名空间持久化 ────────────────────────────────────

class MachineNamespacePersistenceTests(unittest.TestCase):
    def test_machine_namespace_replayable_and_at_app_config(self):
        """可重放（同 AGENT_VITALS_HOME → 同值）+ 备份可迁移（在 app 自有
        config `data_home()/machine.json`，非 state 目录）。"""
        from agent_vitals.agent import takeover as TK

        tmp = tempfile.mkdtemp(prefix="av-r2a-ns-")
        av = Path(tmp) / "av"
        av.mkdir()
        prev = {k: os.environ.get(k) for k in
                ("HOME", "USERPROFILE", "AGENT_VITALS_HOME")}
        os.environ["HOME"] = str(av)  # machine_namespace 只用 data_home，与 HOME 无关
        os.environ["USERPROFILE"] = str(av)
        os.environ["AGENT_VITALS_HOME"] = str(av)
        try:
            a = TK.machine_namespace()
            b = TK.machine_namespace()
            self.assertEqual(a, b, "replayable: same config must yield the "
                                   "same namespace")
            self.assertEqual(len(a), 32, "16 random bytes → 32 hex chars")
            self.assertTrue(all(c in "0123456789abcdef" for c in a))
            path = av / "machine.json"
            self.assertTrue(path.is_file(),
                            "machine.json must persist at app data root")
            doc = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(doc["schema_version"], "1.0.0")
            self.assertEqual(doc["machine_namespace"], a)
        finally:
            for k, v in prev.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
            shutil.rmtree(tmp, ignore_errors=True)


# ── §6.3-11 Codex 初填端到端（隔离 HOME，Python CLI）─────────────

class CodexPopulationE2ETests(unittest.TestCase):
    """隔离 HOME + 真格式语料 → 根发现 → 适配器 → SessionStore 查询全链。"""

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory(prefix="av-r2a-e2e-")
        cls.tmp = Path(cls._tmp.name)
        cls.home = _fake_codex_home(cls.tmp)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def _av(self):
        av = self.tmp / self._testMethodName
        av.mkdir(exist_ok=True)
        return av

    def test_populate_builds_deterministic_entries_and_stable_sort(self):
        av = self._av()
        r = _run_py(["sessions", "list", "--json"], _env(self.home, av))
        self.assertEqual(r.returncode, 0, r.stderr)
        dto = json.loads(r.stdout)
        self.assertEqual(dto["schema_version"], "1")
        page = dto["page"]
        self.assertEqual(page["total"], 3)
        # 稳定序 = native_id 内容字典序（rollout-sol < rollout-terra < rollout-unpriced）
        ids = [it["session_key"]["native_id"] for it in page["items"]]
        self.assertEqual(ids, ["rollout-sol", "rollout-terra",
                               "rollout-unpriced"])
        self.assertEqual(page["store_revision"], 2)
        # 诚实零（§3.3/§4.3）：home 里没有 .dsh 会话 → dsh 报 ok + 0 条，
        # **不是** unavailable——那个错误码只用于「文件在但一个都读不了」。
        self.assertEqual(dto["source_statuses"]["dsh"]["status"], "ok")
        self.assertEqual(dto["source_statuses"]["dsh"]["sessions"], 0)
        self.assertEqual(dto["source_statuses"]["codex"]["status"], "ok")
        # host_kind / source_profile 形状
        it = page["items"][0]
        self.assertEqual(it["session_key"]["host_kind"], "codex")
        self.assertIn("host_kind", it["session_key"])

    def test_cache_delete_rebuild_is_identical(self):
        av = self._av()
        a = _run_py(["sessions", "list", "--json"], _env(self.home, av))
        self.assertEqual(a.returncode, 0, a.stderr)
        self.assertTrue(_cache_path(av).is_file(),
                        "cache must be written at data_home/cache/r2a/")
        # 删 cache 重建 → 源派生内容逐字节一致（墙钟字段归一化）。
        _cache_path(av).unlink()
        b = _run_py(["sessions", "list", "--json"], _env(self.home, av))
        self.assertEqual(b.returncode, 0, b.stderr)
        self.assertEqual(
            _normalize_generated_at(json.loads(a.stdout)),
            _normalize_generated_at(json.loads(b.stdout)),
            "cache delete + rebuild must reproduce the same store")

    def test_cache_is_v2_shape_with_correct_source(self):
        """v3 cache 文件形状钉死（回归：#7 之前 Python 写 v1 顶层
        `fingerprints`/`entries`、且 `source` 硬编码 "codex"；2026-09 抬 v3 是为
        `cost_series` 键进 envelope 强制冷启动）。这里**不依赖** AGENT_VITALS_BIN
        ——跨实现字节对账（generated_at 共享）由 `_BIN` 门控的 reconciliation 用
        例守，但那些用例缺二进制就 skip；本用例任何环境都跑，单独抓住「Python
        退回写 v1」的回归。"""
        av = self._av()
        r = _run_py(["sessions", "list", "--json"], _env(self.home, av))
        self.assertEqual(r.returncode, 0, r.stderr)
        doc = json.loads(_cache_path(av).read_text(encoding="utf-8"))
        self.assertEqual(doc["schema_version"], "3")
        self.assertEqual(doc["source"], "codex")
        # v3 形状（沿自 v2）：per-session 嵌套 sessions + degraded；v1 的顶层键
        # 必须消失。
        self.assertNotIn("fingerprints", doc)
        self.assertNotIn("entries", doc)
        self.assertIn("sessions", doc)
        self.assertIn("degraded", doc)
        self.assertEqual(doc["degraded"], [])
        sessions = doc["sessions"]
        self.assertEqual(len(sessions), 3)
        for s in sessions:
            # 平行数组等长且非空——read_cache_v2 的形状前提（Rust 同判，缺任一
            # 整份缓存按「不存在」处理）。
            self.assertEqual(len(s["paths"]), len(s["fingerprints"]))
            self.assertGreater(len(s["paths"]), 0)
            self.assertIn("envelope", s)
            self.assertEqual(s["envelope"]["schema_version"], "1",
                             "v2 只升 cache 文件，envelope 线格式契约仍是 1")
        # built_at 与 generated_at 同源（store 的冻结墙钟字段）。
        self.assertEqual(doc["built_at"], doc["generated_at"])

    def test_dsh_host_empty_home_is_honest_zero(self):
        # 根本没有 DSH 会话 → 诚实零：status ok + 空页 + exit 0（§3.3「文件空 →
        # ok」）。「unavailable」留给「文件在但一个都读不了」的用例。
        av = self._av()
        r = _run_py(["sessions", "list", "--host-kind", "dsh", "--json"],
                    _env(self.home, av))
        self.assertEqual(r.returncode, 0, r.stderr)
        dto = json.loads(r.stdout)
        self.assertEqual(dto["source_statuses"]["dsh"]["status"], "ok")
        self.assertEqual(dto["source_statuses"]["dsh"]["sessions"], 0)
        self.assertEqual(dto["page"]["total"], 0)
        self.assertEqual(dto["page"]["items"], [])

    def test_dsh_files_undecodable_is_source_unavailable(self):
        # 文件在但一个都读不了 → 类型化 source-unavailable（错误码，不是空页，
        # §4.3）。非 zstd、非 JSON 的 session.jsonl 即触发 non-json 降级 → built 0
        # → unavailable，而不是数成 0 条真数据。
        av = self._av()
        broken = Path(self.home) / ".dsh" / "sessions" / "broken" / "session.jsonl"
        broken.parent.mkdir(parents=True, exist_ok=True)
        broken.write_text("this is not json\n", encoding="utf-8")
        try:
            r = _run_py(["sessions", "list", "--host-kind", "dsh", "--json"],
                        _env(self.home, av))
        finally:
            broken.unlink(missing_ok=True)
        self.assertEqual(r.returncode, 2)
        self.assertEqual(r.stdout, "")  # 不是空页 —— 是错误码
        err = json.loads(r.stderr)
        self.assertEqual(err["error"]["code"], "source-unavailable")

    def test_read_not_found_and_stale_revision_are_typed_errors(self):
        av = self._av()
        # 先从 list 取一个**真实存在**的 session_key（native_id + source_profile +
        # machine_namespace 三样全对），再用它测 stale-revision；再造一个不存在的
        # key 测 not-found。用假 namespace 会让 read 先找不到 key → not-found，
        # revision 校验根本走不到（read_session 先 key 定位再对 revision）。
        lst = _run_py(["sessions", "list", "--json"], _env(self.home, av))
        self.assertEqual(lst.returncode, 0, lst.stderr)
        real_key = json.loads(lst.stdout)["page"]["items"][0]["session_key"]
        real_key_json = json.dumps(real_key, separators=(",", ":"))

        st = _run_py(["sessions", "read", "--session-key", real_key_json,
                      "--revision", "2026-08-99", "--json"],
                     _env(self.home, av))
        self.assertEqual(st.returncode, 2)
        self.assertEqual(json.loads(st.stderr)["error"]["code"],
                         "stale-revision")

        fake_key = dict(real_key)
        fake_key["native_id"] = "no-such-session"
        nf = _run_py(["sessions", "read", "--session-key",
                      json.dumps(fake_key, separators=(",", ":")), "--json"],
                     _env(self.home, av))
        self.assertEqual(nf.returncode, 2)
        self.assertEqual(json.loads(nf.stderr)["error"]["code"], "not-found")

    def test_pagination_follows_cursor_no_dup_skip(self):
        av = self._av()
        p0 = _run_py(["sessions", "list", "--page-size", "2", "--json"],
                     _env(self.home, av))
        self.assertEqual(p0.returncode, 0, p0.stderr)
        d0 = json.loads(p0.stdout)
        c0 = d0["page"]["next_cursor"]
        self.assertIsNotNone(c0)
        p1 = _run_py(["sessions", "list", "--page-size", "2", "--cursor",
                      json.dumps(c0, separators=(",", ":")), "--json"],
                     _env(self.home, av))
        self.assertEqual(p1.returncode, 0, p1.stderr)
        d1 = json.loads(p1.stdout)
        self.assertIsNone(d1["page"]["next_cursor"])
        ids = [it["session_key"]["native_id"]
               for it in d0["page"]["items"] + d1["page"]["items"]]
        self.assertEqual(ids, ["rollout-sol", "rollout-terra",
                               "rollout-unpriced"])

    def test_invalid_cursor_is_exit_2(self):
        av = self._av()
        r = _run_py(["sessions", "list", "--cursor", "{not-json", "--json"],
                    _env(self.home, av))
        self.assertEqual(r.returncode, 2)
        self.assertIn("invalid --cursor JSON", r.stderr)


# ── §6.3-9 冻结夹具对账台（跨实现字节对账）──────────────────────

@unittest.skipUnless(_BIN, "AGENT_VITALS_BIN not set — only one implementation "
                           "available, nothing to reconcile")
class CrossImplementationReconciliationTests(unittest.TestCase):
    """跨实现字节对账：cache 共享双方向逐字节一致；独立重建（各自从源）归一化
    墙钟后结构一致；错误路径逐字节一致。这是「Python↔Rust 不漂移」的对账台初版。"""

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory(prefix="av-r2a-rec-")
        cls.tmp = Path(cls._tmp.name)
        cls.home = _fake_codex_home(cls.tmp)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def _av(self):
        av = self.tmp / self._testMethodName
        av.mkdir(exist_ok=True)
        return av

    def _list(self, prog, av):
        if prog == "py":
            return _run_py(["sessions", "list", "--json"], _env(self.home, av))
        return _run_rs(["sessions", "list", "--json"], _env(self.home, av))

    def test_list_byte_identical_via_cache_share_py_then_rs(self):
        av = self._av()
        py = self._list("py", av)
        self.assertEqual(py.returncode, 0, py.stderr)
        self.assertTrue(_cache_path(av).is_file())
        rs = self._list("rs", av)
        self.assertEqual(rs.returncode, 0, rs.stderr)
        # 含 generated_at：Python 写 cache → Rust 读 cache → 同一份墙钟字段。
        self.assertEqual(py.stdout, rs.stdout,
                         "py-writes-cache / rs-reads-cache must be "
                         "byte-identical (generated_at shared via cache)")

    def test_list_byte_identical_via_cache_share_rs_then_py(self):
        av = self._av()
        rs = self._list("rs", av)
        self.assertEqual(rs.returncode, 0, rs.stderr)
        py = self._list("py", av)
        self.assertEqual(py.returncode, 0, py.stderr)
        self.assertEqual(rs.stdout, py.stdout,
                         "rs-writes-cache / py-reads-cache must be "
                         "byte-identical (generated_at shared via cache)")

    def test_independent_rebuilds_match_after_normalizing_generated_at(self):
        av = self._av()
        py = self._list("py", av)
        self.assertEqual(py.returncode, 0, py.stderr)
        _cache_path(av).unlink()  # 强制 Rust 从源重建（machine.json 保留 → 同 ns）
        rs = self._list("rs", av)
        self.assertEqual(rs.returncode, 0, rs.stderr)
        self.assertEqual(
            _normalize_generated_at(json.loads(py.stdout)),
            _normalize_generated_at(json.loads(rs.stdout)),
            "independent rebuilds of the same corpus must produce the same "
            "structure after normalizing the wall-clock field")

    def test_read_byte_identical_via_cache_share(self):
        av = self._av()
        # 先由 Python 写 cache，再由两侧读同一份。
        py_list = self._list("py", av)
        self.assertEqual(py_list.returncode, 0, py_list.stderr)
        key = json.loads(py_list.stdout)["page"]["items"][0]["session_key"]
        key_json = json.dumps(key, separators=(",", ":"))
        py = _run_py(["sessions", "read", "--session-key", key_json, "--json"],
                     _env(self.home, av))
        rs = _run_rs(["sessions", "read", "--session-key", key_json, "--json"],
                     _env(self.home, av))
        self.assertEqual(py.returncode, 0, py.stderr)
        self.assertEqual(rs.returncode, 0, rs.stderr)
        self.assertEqual(py.stdout, rs.stdout,
                         "read envelope must be byte-identical when both "
                         "impls read the same cache")

    def test_dsh_source_unavailable_error_parity(self):
        # 文件在但一个都读不了 → 两侧都走类型化 source-unavailable 错误码，stderr
        # 逐字节一致。干净 home 是诚实零（exit 0），**不是**这个错误码。
        av = self._av()
        broken = Path(self.home) / ".dsh" / "sessions" / "broken" / "session.jsonl"
        broken.parent.mkdir(parents=True, exist_ok=True)
        broken.write_text("this is not json\n", encoding="utf-8")
        try:
            py = _run_py(["sessions", "list", "--host-kind", "dsh", "--json"],
                         _env(self.home, av))
            rs = _run_rs(["sessions", "list", "--host-kind", "dsh", "--json"],
                         _env(self.home, av))
        finally:
            broken.unlink(missing_ok=True)
        self.assertEqual(py.returncode, 2)
        self.assertEqual(rs.returncode, 2)
        self.assertEqual(py.stderr, rs.stderr,
                         "source-unavailable error JSON must be byte-identical")
        self.assertEqual(py.stdout, rs.stdout)

    def test_invalid_cursor_error_parity(self):
        av = self._av()
        py = _run_py(["sessions", "list", "--cursor", "{bad", "--json"],
                     _env(self.home, av))
        rs = _run_rs(["sessions", "list", "--cursor", "{bad", "--json"],
                     _env(self.home, av))
        self.assertEqual(py.returncode, 2)
        self.assertEqual(rs.returncode, 2)
        self.assertEqual(py.stderr, rs.stderr,
                         "invalid-cursor stderr must be byte-identical")
        self.assertEqual(py.stdout, rs.stdout)


# ── Claude Code 源跨实现字节对账（§5 第三源）───────────────────

@unittest.skipUnless(_BIN, "AGENT_VITALS_BIN not set — only one implementation "
                           "available, nothing to reconcile")
class ClaudeReconciliationTests(unittest.TestCase):
    """claude-code 半边对账台：三源合并 home（3 claude + 3 codex + 1 dsh）下，
    claude 臂 list/read、no-filter 三源合并、错误路径逐字节一致。cache 共享双
    方向（generated_at 经 cache 冻结后两侧共用同一份墙钟字段）。"""

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory(prefix="av-r2a-claude-rec-")
        cls.tmp = Path(cls._tmp.name)
        cls.home = _fake_codex_home(cls.tmp)
        _fake_dsh_under(cls.home)
        _fake_claude_under(cls.home)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def _av(self):
        av = self.tmp / self._testMethodName
        av.mkdir(exist_ok=True)
        return av

    def _list(self, prog, av, extra=()):
        run = _run_py if prog == "py" else _run_rs
        return run(["sessions", "list", "--json"] + list(extra),
                   _env(self.home, av))

    def test_claude_list_byte_identical_via_cache_share_py_then_rs(self):
        av = self._av()
        py = self._list("py", av, ["--host-kind", "claude-code"])
        self.assertEqual(py.returncode, 0, py.stderr)
        self.assertTrue(_claude_cache_path(av).is_file())
        rs = self._list("rs", av, ["--host-kind", "claude-code"])
        self.assertEqual(rs.returncode, 0, rs.stderr)
        self.assertEqual(py.stdout, rs.stdout,
                         "py-writes-cache / rs-reads-cache must be "
                         "byte-identical (generated_at shared via cache)")

    def test_claude_list_byte_identical_via_cache_share_rs_then_py(self):
        av = self._av()
        rs = self._list("rs", av, ["--host-kind", "claude-code"])
        self.assertEqual(rs.returncode, 0, rs.stderr)
        py = self._list("py", av, ["--host-kind", "claude-code"])
        self.assertEqual(py.returncode, 0, py.stderr)
        self.assertEqual(rs.stdout, py.stdout)

    def test_claude_read_byte_identical_via_cache_share(self):
        av = self._av()
        py_list = self._list("py", av, ["--host-kind", "claude-code"])
        self.assertEqual(py_list.returncode, 0, py_list.stderr)
        key = json.loads(py_list.stdout)["page"]["items"][0]["session_key"]
        self.assertEqual(key["host_kind"], "claude-code")
        key_json = json.dumps(key, separators=(",", ":"))
        py = _run_py(["sessions", "read", "--session-key", key_json, "--json"],
                     _env(self.home, av))
        rs = _run_rs(["sessions", "read", "--session-key", key_json, "--json"],
                     _env(self.home, av))
        self.assertEqual(py.returncode, 0, py.stderr)
        self.assertEqual(rs.returncode, 0, rs.stderr)
        self.assertEqual(py.stdout, rs.stdout,
                         "claude read envelope must be byte-identical when "
                         "both impls read the same cache")

    def test_all_three_sources_byte_identical(self):
        """no-filter 三源合并：7 条、稳定序 claude-code 全部在前、`source_statuses`
        键序 {claude-code, codex, dsh}（preserve_order 下键序是字节序，必须一致）。"""
        av = self._av()
        py = self._list("py", av)
        self.assertEqual(py.returncode, 0, py.stderr)
        rs = self._list("rs", av)
        self.assertEqual(rs.returncode, 0, rs.stderr)
        self.assertEqual(py.stdout, rs.stdout)
        dto = json.loads(py.stdout)
        self.assertEqual(dto["page"]["total"], 7)
        hosts = [it["session_key"]["host_kind"] for it in dto["page"]["items"]]
        self.assertEqual(hosts, ["claude-code"] * 3 + ["codex"] * 3 + ["dsh"])
        self.assertEqual(list(dto["source_statuses"]),
                         ["claude-code", "codex", "dsh"],
                         "source_statuses key order is byte order")

    def test_claude_filter_and_pagination_byte_identical(self):
        """filter + 分页差分：`--host-kind claude-code --page-size 2` 两页
        逐字节一致（cursor 往返跨实现同构）。"""
        av = self._av()
        py1 = self._list("py", av, ["--host-kind", "claude-code",
                                    "--page-size", "2"])
        self.assertEqual(py1.returncode, 0, py1.stderr)
        rs1 = self._list("rs", av, ["--host-kind", "claude-code",
                                    "--page-size", "2"])
        self.assertEqual(rs1.returncode, 0, rs1.stderr)
        self.assertEqual(py1.stdout, rs1.stdout)
        page1 = json.loads(py1.stdout)["page"]
        self.assertEqual(page1["total"], 3)
        cursor = page1["next_cursor"]
        self.assertIsNotNone(cursor, "3 items at page-size 2 must have page 2")
        cursor_json = json.dumps(cursor, separators=(",", ":"))
        py2 = self._list("py", av, ["--host-kind", "claude-code",
                                    "--page-size", "2", "--cursor", cursor_json])
        rs2 = self._list("rs", av, ["--host-kind", "claude-code",
                                    "--page-size", "2", "--cursor", cursor_json])
        self.assertEqual(py2.returncode, 0, py2.stderr)
        self.assertEqual(rs2.returncode, 0, rs2.stderr)
        self.assertEqual(py2.stdout, rs2.stdout,
                         "page 2 via cursor must be byte-identical")
        page2 = json.loads(py2.stdout)["page"]
        self.assertEqual(len(page2["items"]), 1)

    def test_claude_source_unavailable_error_parity(self):
        """文件在但一个都构建不出 → 两侧都走类型化 source-unavailable 错误码，
        stderr 逐字节一致。注意必须用**只有坏文件**的 home——类 home 有 3 个好
        会话，built>0 → ok，unavailable 只留给「一个都构建不出」（§4.3）。"""
        av = self._av()
        base = Path(tempfile.mkdtemp(prefix="av-claude-rec-broken-"))
        try:
            d = base / "home" / ".claude" / "projects" / "p"
            d.mkdir(parents=True)
            (d / "bad.jsonl").write_text("this is not json\n", encoding="utf-8")
            py = _run_py(["sessions", "list", "--host-kind", "claude-code",
                          "--json"], _env(base / "home", av))
            rs = _run_rs(["sessions", "list", "--host-kind", "claude-code",
                          "--json"], _env(base / "home", av))
        finally:
            shutil.rmtree(base, ignore_errors=True)
        self.assertEqual(py.returncode, 2)
        self.assertEqual(rs.returncode, 2)
        self.assertEqual(py.stderr, rs.stderr,
                         "claude source-unavailable error JSON must be "
                         "byte-identical")
        self.assertEqual(py.stdout, rs.stdout)


# ── sessions navigation 投影（spec §5.1/§5.2）────────────────────
# 纯函数真值表与 Rust `r2a_store.rs` 单测同一批钉死输入/输出；差分侧逐字节
# 对账（cache 共享双方向 + 人读渲染 + 错误路径 + 诚实降级）。

def _fake_dsh_under(home: Path) -> Path:
    """在既有 home 下补一个裸 jsonl DSH 会话（behavior.jsonl 拷贝 +
    workspace.json 标题索引）——mirror Rust `fake_dsh_under`（fixtures/dsh/
    workspace.json 就是同形状）。裸 jsonl 不需要 zstandard。"""
    sdir = home / ".dsh" / "sessions" / "demo-proj" / "agent-1"
    sdir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(FIXTURE_DSH / "behavior.jsonl", sdir / "session.jsonl")
    storages = home / ".dsh" / "storages"
    storages.mkdir(parents=True, exist_ok=True)
    shutil.copy2(FIXTURE_DSH / "workspace.json", storages / "workspace.json")
    return home


def _write_today_json(av: Path, date: str, tokens: int):
    """av/state/today.json：4 字段基础桶（uncached 打满 tokens，其余 0）→
    当日 token 总量 == tokens（与 today_cost 同一求和口径）。"""
    (av / "state").mkdir(parents=True, exist_ok=True)
    json.dump(
        {"date": date, "schema_version": 1,
         "generated_at": "2026-08-31T10:00:00+08:00",
         "buckets": {"p1": {"uncached_input_tokens": tokens, "output_tokens": 0,
                             "cached_input_tokens": 0,
                             "cache_write_input_tokens": 0,
                             "model": "gpt-5.6-sol"}}},
        open(av / "state" / "today.json", "w"))


class NavigationProjectionTests(unittest.TestCase):
    """纯函数真值表（Python 镜像）——与 Rust 同名单测逐条对应。"""

    def test_host_snapshot_unavailable_when_host_has_no_source(self):
        # 无数据源（roots 全 exists=false）→ 整宿主 unavailable；「没有 DSH =
        # 诚实零」是 sessions list 的语义，导航固定渲染两行（spec §8）。
        store = R2A.SessionStore(
            [], {"codex": {"status": "ok", "roots": [{"exists": False}]}},
            "2026-09-01T00:00:00Z")
        snap = R2A.host_snapshot("codex", store, {"value": 5}, "2026-08-31", 5)
        self.assertEqual(snap["status"], "unavailable")
        self.assertIsNone(snap["today_tokens"])
        self.assertIsNone(snap["today_sessions"])
        self.assertEqual(snap["recent"], [])
        self.assertIsNone(snap["store_revision"])
        # store 构建失败（None）同档
        snap2 = R2A.host_snapshot("dsh", None, {"value": 5}, "2026-08-31", 5)
        self.assertEqual(snap2["status"], "unavailable")
        # DSH「文件在但一个都读不了」（§4.3）→ 也归这一档，即使 roots 存在
        store3 = R2A.SessionStore(
            [], {"dsh": {"status": "unavailable", "roots": [{"exists": True}]}},
            "2026-09-01T00:00:00Z")
        snap3 = R2A.host_snapshot("dsh", store3, {"value": 5}, "2026-08-31", 5)
        self.assertEqual(snap3["status"], "unavailable")

    def test_host_snapshot_ready_measures_today_and_recent(self):
        def entry(nid, first, last, rev, seq):
            return R2A.SessionReportEntry(
                R2A.SessionKey("codex", nid, "p", "m"), rev,
                "session-%s" % nid, "gpt-5.6-sol", first, last,
                1, None, 1000, 0, seq, None)

        entries = [
            entry("span", "2026-08-01", "2026-08-31", "r1", 3),
            entry("old", "2026-08-30", "2026-08-30", "r2", 2),
            entry("newest", "2026-08-31", "2026-08-31", "r9", 5),
        ]
        store = R2A.SessionStore(
            entries, {"codex": {"status": "ok", "roots": [{"exists": True}]}},
            "2026-09-01T00:00:00Z")
        snap = R2A.host_snapshot("codex", store, {"value": 123}, "2026-08-31", 5)
        self.assertEqual(snap["status"], "ready")
        # 跨日会话计 1 次（它今天确实活跃，spec §5.2）；old 昨天不计
        self.assertEqual(snap["today_sessions"], 2)
        self.assertEqual(snap["store_revision"], 5)
        # recent_cmp：date_span.last DESC → session_revision DESC → key ASC
        self.assertEqual([r["session_key"]["native_id"] for r in snap["recent"]],
                         ["newest", "span", "old"])
        # 4 条 → recent 截断到 N
        more = list(store.entries) + [entry("fourth", "2026-08-30", "2026-08-31",
                                            "r3", 6)]
        snap4 = R2A.host_snapshot(
            "codex", R2A.SessionStore(more, store.source_statuses, "x"),
            {"value": 123}, "2026-08-31", 2)
        self.assertEqual(len(snap4["recent"]), 2)
        # value null → partial（有会话但今天没测到，不是没会话）
        snap2 = R2A.host_snapshot("codex", store, {"value": None}, "2026-08-31", 5)
        self.assertEqual(snap2["status"], "partial")
        self.assertEqual(snap2["today_sessions"], 2)

    def test_codex_today_tokens_json_honesty_truth_table(self):
        # 零会话 → 0（真零，spec 唯一显式 0）
        self.assertEqual(R2A.codex_today_tokens_json({"by_hour_model": {}},
                                                     "2026-08-31", True),
                         {"value": 0, "basis": "events", "coverage": "complete"})
        # by_hour_model 空（有会话但没计量）→ 测不出（null 三连，不编 0）
        self.assertEqual(R2A.codex_today_tokens_json({"by_hour_model": {}},
                                                     "2026-08-31", False),
                         {"value": None, "basis": None, "coverage": None})
        # 当日桶缺席（他日有计量、今天没有）→ null（「今天没跑」≠「今天没测到」）
        merged2 = {"by_hour_model": {"2026-08-30T10+08:00": {
            "gpt-5.6-sol": {"p1": {"uncached_input_tokens": 100}}}},
            "unaccounted": []}
        v3 = R2A.codex_today_tokens_json(merged2, "2026-08-31", False)
        self.assertIsNone(v3["value"])
        # 当日桶存在 → 当日全模型/全速度之和；残差哨兵 → partial
        merged3 = {"by_hour_model": {
            "2026-08-31T09+08:00": {"gpt-5.6-sol": {"p1": {"uncached_input_tokens": 60}}},
            "2026-08-31T11+08:00": {"gpt-5.6-sol": {"p2": {"output_tokens": 40}}},
            "2026-08-31T23+08:00": {"other": {"p1": {"cached_input_tokens": 300}}}},
            "unaccounted": [{"type": "x", "count": 1, "tokens_seen": 1500}]}
        v4 = R2A.codex_today_tokens_json(merged3, "2026-08-31", False)
        self.assertEqual(v4, {"value": 400, "basis": "events",
                              "coverage": "partial"})
        # 无残差 → complete
        merged4 = {"by_hour_model": {"2026-08-31T09+08:00": {
            "gpt-5.6-sol": {"p1": {"uncached_input_tokens": 60}}}},
            "unaccounted": []}
        self.assertEqual(R2A.codex_today_tokens_json(merged4, "2026-08-31", False),
                         {"value": 60, "basis": "events", "coverage": "complete"})

    def test_render_navigation_is_byte_stable(self):
        env = {
            "schema_version": 1, "day_key": "2026-08-31",
            "timezone": "Asia/Shanghai", "generated_at": "2026-09-01T00:00:00Z",
            "hosts": [
                {"host_kind": "dsh", "status": "unavailable",
                 "today_tokens": None, "today_sessions": None,
                 "recent": [], "store_revision": None},
                {"host_kind": "codex", "status": "ready",
                 "today_tokens": {"value": 1234, "basis": "events",
                                  "coverage": "complete"},
                 "today_sessions": 2,
                 "recent": [{
                     "session_key": {"host_kind": "codex", "native_id": "c1",
                                     "source_profile": "p",
                                     "machine_namespace": "m"},
                     "title": "a title", "model": "gpt-5.6-sol",
                     "tokens_total": 500, "date_first": "2026-08-31",
                     "date_last": "2026-08-31", "revision": "r1"}],
                 "store_revision": 5},
            ],
        }
        # 与 Rust `render_navigation_is_byte_stable` 的期望字符串完全一致
        expected = ("navigation 2026-08-31 (schema 1)\n"
                    "dsh      unavailable — · — 会话\n"
                    "          · 会话数据暂不可用\n"
                    "codex    ready       1234 · 2 会话\n"
                    "          · 2026-08-31 · gpt-5.6-sol · 500\n")
        self.assertEqual(R2A.render_navigation(env), expected)


@unittest.skipUnless(_BIN, "AGENT_VITALS_BIN not set — only one implementation "
                           "to compare against (same gate as reconciliation)")
class NavigationDifferentialTests(unittest.TestCase):
    """navigation 跨实现逐字节对账：cache 共享双方向 + 人读渲染 + 错误路径 +
    诚实降级（date 校验两侧同款——缺列不编列是锁步承诺的一部分）。"""

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory(prefix="av-r2a-nav-")
        cls.tmp = Path(cls._tmp.name)
        cls.home = _fake_codex_home(cls.tmp)
        _fake_dsh_under(cls.home)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def _av(self):
        av = self.tmp / self._testMethodName
        (av / "state").mkdir(parents=True, exist_ok=True)
        return av

    def _nav(self, prog, av, day="2026-08-31"):
        args = ["sessions", "navigation", "--day", day, "--json"]
        if prog == "py":
            return _run_py(args, _env(self.home, av))
        return _run_rs(args, _env(self.home, av))

    def test_navigation_byte_identical_via_cache_share_py_then_rs(self):
        av = self._av()
        _write_today_json(av, "2026-08-31", 1200)
        py = self._nav("py", av)
        self.assertEqual(py.returncode, 0, py.stderr)
        rs = self._nav("rs", av)
        self.assertEqual(rs.returncode, 0, rs.stderr)
        self.assertEqual(py.stdout, rs.stdout,
                         "navigation envelope must be byte-identical via cache share")
        env = json.loads(py.stdout)
        # DSH 行真的带上了 today.json 的 token（ready，不是 unavailable/空值）
        self.assertEqual(env["hosts"][0]["host_kind"], "dsh")
        self.assertEqual(env["hosts"][0]["status"], "ready")
        self.assertEqual(env["hosts"][0]["today_tokens"]["value"], 1200)
        self.assertEqual(env["hosts"][0]["today_tokens"]["basis"], "state-file")
        # fixture 会话在 2025-06-15——投影 2026-08-31 无交叠 → 真 0（不是 null）
        self.assertEqual(env["hosts"][0]["today_sessions"], 0)
        self.assertEqual(env["hosts"][1]["host_kind"], "codex")
        # 键序是字节一致的一部分（serde_json preserve_order = json! 字面量序）
        self.assertEqual(list(env.keys()), ["schema_version", "day_key",
                                            "timezone", "generated_at", "hosts"])

    def test_navigation_byte_identical_via_cache_share_rs_then_py(self):
        av = self._av()
        _write_today_json(av, "2026-08-31", 1200)
        rs = self._nav("rs", av)
        self.assertEqual(rs.returncode, 0, rs.stderr)
        py = self._nav("py", av)
        self.assertEqual(py.returncode, 0, py.stderr)
        self.assertEqual(rs.stdout, py.stdout,
                         "rs-writes-cache / py-reads-cache must be byte-identical")

    def test_navigation_human_render_byte_identical(self):
        av = self._av()
        _write_today_json(av, "2026-08-31", 1200)
        py = _run_py(["sessions", "navigation", "--day", "2026-08-31"],
                     _env(self.home, av))
        rs = _run_rs(["sessions", "navigation", "--day", "2026-08-31"],
                     _env(self.home, av))
        self.assertEqual(py.returncode, 0, py.stderr)
        self.assertEqual(rs.returncode, 0, rs.stderr)
        self.assertEqual(py.stdout, rs.stdout,
                         "human render must be byte-identical")

    def test_navigation_stale_today_json_is_null_not_zero(self):
        # 日期不符（8-30 的数据、投影 8-31）→ 两侧 DSH value 都是 null：缺列不
        # 编列——「没有今天的数据」≠「今天花了 0」（真机回归：8-27 没用过 DSH
        # 却报了 8-26 的账，cost.rs::today_cost 的 date 校验就为此而存在）。
        av = self._av()
        _write_today_json(av, "2026-08-30", 9999)
        py = self._nav("py", av)
        rs = self._nav("rs", av)
        self.assertEqual(py.returncode, 0, py.stderr)
        self.assertEqual(rs.returncode, 0, rs.stderr)
        self.assertEqual(py.stdout, rs.stdout)
        env = json.loads(py.stdout)
        self.assertEqual(env["hosts"][0]["status"], "partial")
        self.assertIsNone(env["hosts"][0]["today_tokens"]["value"])
        # 会话/最近行不受影响（只降 token 一列）
        self.assertEqual(env["hosts"][0]["today_sessions"], 0)
        self.assertEqual(len(env["hosts"][0]["recent"]), 1)

    def test_navigation_timezone_error_parity(self):
        av = self._av()
        py = _run_py(["sessions", "navigation", "--day", "2026-08-31",
                      "--timezone", "Europe/Paris"], _env(self.home, av))
        rs = _run_rs(["sessions", "navigation", "--day", "2026-08-31",
                      "--timezone", "Europe/Paris"], _env(self.home, av))
        self.assertEqual(py.returncode, 2)
        self.assertEqual(rs.returncode, 2)
        self.assertEqual(py.stderr, rs.stderr,
                         "unsupported-timezone stderr must be byte-identical")
        self.assertEqual(py.stdout, rs.stdout)


# ── §6.3-1/2/11 DSH 半边 E2E（多帧 zstd 夹具）────────────────────

@unittest.skipUnless(_HAVE_ZSTD,
                     "DSH fixture is multi-frame zstd — Python decode needs the "
                     "optional `zstandard` package")
class DshPopulationE2ETests(unittest.TestCase):
    """隔离 HOME + **多帧 zstd** 会话（fixtures/dsh）→ 根发现 → workspace.json 索引
    → 适配器解码 → SessionStore 查询全链。断言值与 Rust
    `dsh_populate_builds_entries_from_fake_home` 同源——两侧对同一份真格式语料要
    推出同一批派生列（native_id=头 id、source_profile=头 cwd、title=workspace.json、
    tokens/findings 从 behavior 20 键载荷派生、cost_usd 诚实 null）。
    """

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory(prefix="av-r2a-dsh-e2e-")
        cls.tmp = Path(cls._tmp.name)
        cls.home = _fake_dsh_home(cls.tmp)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def _av(self):
        av = self.tmp / self._testMethodName
        av.mkdir(exist_ok=True)
        return av

    def test_populate_builds_one_session_from_zstd_fixture(self):
        av = self._av()
        r = _run_py(["sessions", "list", "--host-kind", "dsh", "--json"],
                    _env(self.home, av))
        self.assertEqual(r.returncode, 0, r.stderr)
        dto = json.loads(r.stdout)
        st = dto["source_statuses"]["dsh"]
        self.assertEqual(st["status"], "ok")
        self.assertEqual(st["sessions"], 1)
        self.assertIsNone(st["degraded"])
        page = dto["page"]
        self.assertEqual(page["total"], 1)
        it = page["items"][0]
        k = it["session_key"]
        self.assertEqual(k["host_kind"], "dsh")
        self.assertEqual(k["native_id"], "sess-behavior-0001",
                         "native id = header id, not dir name")
        self.assertEqual(k["source_profile"], "---Users-alice-projects-demo--")
        self.assertEqual(it["title"], "demo project",
                         "title from workspace.json index")
        self.assertEqual(it["model"], "deepseek/deepseek-v4-pro-0813")
        self.assertEqual(it["date_span"], {"first": "2025-06-15",
                                           "last": "2025-06-15"})
        self.assertEqual(it["files"], 1)
        self.assertIsNone(it["cost_usd"],
                          "CNY cost must not masquerade as cost_usd")
        self.assertEqual(it["tokens_total"], 1707000)
        self.assertEqual(it["findings_total"], 34)
        self.assertEqual(it["session_revision"], "135",
                         "revision = max seq")
        self.assertTrue(_dsh_cache_path(av).is_file(),
                        "cache must be written at data_home/cache/r2a/")

    def test_dsh_cache_is_v2_shape_with_correct_source(self):
        """DSH 半边钉死 v3 的 `source` 字段（回归：#7 之前 `_write_cache` 硬编码
        "codex"，dsh 缓存源标错；现在按源取值 "dsh"）。degraded 同时钉成
        (path, fingerprint, reason) 三元组形状——指纹随 degraded 进 cache 是
        「读不了但没变就不重试」的前提（Rust DegradedTriple 同形）。"""
        av = self._av()
        r = _run_py(["sessions", "list", "--host-kind", "dsh", "--json"],
                    _env(self.home, av))
        self.assertEqual(r.returncode, 0, r.stderr)
        doc = json.loads(_dsh_cache_path(av).read_text(encoding="utf-8"))
        self.assertEqual(doc["schema_version"], "3")
        self.assertEqual(doc["source"], "dsh",
                         "source 必须按源取值——硬编码 codex 是 #7 一起修的潜伏 bug")
        sessions = doc["sessions"]
        self.assertEqual(len(sessions), 1)
        s = sessions[0]
        # DSH 1 文件 = 1 逻辑 session：paths 就是那一个源文件，指纹平行且非空。
        self.assertEqual(len(s["paths"]), 1)
        self.assertTrue(s["paths"][0])
        self.assertEqual(len(s["paths"]), len(s["fingerprints"]))
        self.assertTrue(s["fingerprints"][0])
        self.assertIn("envelope", s)
        self.assertEqual(doc["degraded"], [])

    def test_populate_builds_from_bare_jsonl_home(self):
        """裸 jsonl（`compression:'none'`）成功路径也要跑：`parse_session_log` 抽出后，
        zstd（上面的用例）与裸文本两条分支都要推出同一批派生列。mirror Rust
        `dsh_populate_builds_entries_from_fake_home`——Rust 那侧 fake home 就是裸
        jsonl，Python 这侧只测了 zstd，两条压缩形态都要钉住才不会漂。"""
        av = self._av()
        home = self.tmp / "bare-home"
        sdir = home / ".dsh" / "sessions" / "demo-proj" / "agent-1"
        sdir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(FIXTURE_DSH / "behavior.jsonl", sdir / "session.jsonl")
        storages = home / ".dsh" / "storages"
        storages.mkdir(parents=True, exist_ok=True)
        shutil.copy2(FIXTURE_DSH / "workspace.json", storages / "workspace.json")
        r = _run_py(["sessions", "list", "--host-kind", "dsh", "--json"],
                    _env(home, av))
        self.assertEqual(r.returncode, 0, r.stderr)
        dto = json.loads(r.stdout)
        st = dto["source_statuses"]["dsh"]
        self.assertEqual(st["status"], "ok")
        self.assertEqual(st["sessions"], 1)
        it = dto["page"]["items"][0]
        self.assertEqual(it["session_key"]["native_id"], "sess-behavior-0001")
        self.assertEqual(it["title"], "demo project")
        self.assertEqual(it["findings_total"], 34)

    def test_dsh_read_returns_full_audit_doc(self):
        av = self._av()
        lst = _run_py(["sessions", "list", "--host-kind", "dsh", "--json"],
                      _env(self.home, av))
        self.assertEqual(lst.returncode, 0, lst.stderr)
        key = json.loads(lst.stdout)["page"]["items"][0]["session_key"]
        rd = _run_py(["sessions", "read", "--session-key",
                      json.dumps(key, separators=(",", ":")), "--json"],
                     _env(self.home, av))
        self.assertEqual(rd.returncode, 0, rd.stderr)
        doc = json.loads(rd.stdout)
        self.assertEqual(doc["session"]["title"], "demo project")
        self.assertEqual(len(doc["session"]["findings"]), 34)
        # 完整审计载荷（behavior 20 键）而不是空壳
        for section in ("usage", "cost", "skill", "waste", "duration"):
            self.assertIn(section, doc["session"])

    def test_dsh_cache_delete_rebuild_is_identical(self):
        av = self._av()
        a = _run_py(["sessions", "list", "--host-kind", "dsh", "--json"],
                    _env(self.home, av))
        self.assertEqual(a.returncode, 0, a.stderr)
        self.assertTrue(_dsh_cache_path(av).is_file())
        _dsh_cache_path(av).unlink()
        b = _run_py(["sessions", "list", "--host-kind", "dsh", "--json"],
                    _env(self.home, av))
        self.assertEqual(b.returncode, 0, b.stderr)
        self.assertEqual(
            _normalize_generated_at(json.loads(a.stdout)),
            _normalize_generated_at(json.loads(b.stdout)),
            "cache delete + rebuild must reproduce the same store")

    def test_dsh_source_change_invalidates_cache_disconnect_reconnect(self):
        """断线→重连（§1.5/§3.5 源指纹失效；mirror Rust `source_change_invalidates_cache`
        的 DSH 半边——Rust 那侧只测了 Codex）。源文件删掉 → 指纹列表变短 → 缓存
        作废 → 诚实 0（**不是**把旧的 1 藏在 cache 里）；源文件回来 → 缓存再作废 →
        1 又回来。缓存是可删 memo，不是把源变化藏起来的第二份 truth。有 `_BIN` 时
        每个状态都让两侧逐字节对账。"""
        av = self._av()
        session_file = (Path(self.home) / ".dsh" / "sessions" / "demo-proj"
                        / "agent-1" / "session.jsonl.zstd")

        def list_total(prog):
            run = _run_py if prog == "py" else _run_rs
            r = run(["sessions", "list", "--host-kind", "dsh", "--json"],
                    _env(self.home, av))
            self.assertEqual(r.returncode, 0, r.stderr)
            return json.loads(r.stdout)["page"]["total"]

        self.assertEqual(list_total("py"), 1, "start: fixture session present")
        session_file.unlink()
        try:
            self.assertEqual(list_total("py"), 0,
                             "file gone → honest zero, not the cached 1")
            if _BIN:
                self.assertEqual(list_total("rs"), 0)
        finally:
            shutil.copy2(FIXTURE_DSH / "session.jsonl.zstd", session_file)
        self.assertEqual(list_total("py"), 1,
                         "file back → 1 again (cache re-invalidated)")
        if _BIN:
            self.assertEqual(list_total("rs"), 1)


# ── Claude Code 源（§5 第三源）E2E ─────────────────────────────

class ClaudePopulationE2ETests(unittest.TestCase):
    """隔离 HOME + 真格式 Claude 语料 → `sessions` CLI 的 claude-code 臂全链
    （不依赖 AGENT_VITALS_BIN；跨实现对账在下面的 reconciliation 类）。"""

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory(prefix="av-r2a-claude-")
        cls.tmp = Path(cls._tmp.name)
        cls.home = _fake_claude_home(cls.tmp)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def _av(self):
        av = self.tmp / self._testMethodName
        av.mkdir(exist_ok=True)
        return av

    def test_absent_home_is_ok_zero(self):
        """没装 Claude Code 是诚实零：projects 缺席 → 空页 + ok/0 + roots
        exists=false，**不是** unavailable（错误码只留给「文件在但一个都构建
        不出」）。"""
        base = Path(tempfile.mkdtemp(prefix="av-claude-absent-"))
        try:
            av = base / "av"
            av.mkdir()
            r = _run_py(["sessions", "list", "--host-kind", "claude-code",
                         "--json"], _env(base / "home", av))
            self.assertEqual(r.returncode, 0, r.stderr)
            dto = json.loads(r.stdout)
            self.assertEqual(dto["page"]["total"], 0)
            st = dto["source_statuses"]["claude-code"]
            self.assertEqual(st["status"], "ok")
            self.assertEqual(st["sessions"], 0)
            roots = st["roots"]
            self.assertEqual(roots[0]["kind"], "projects")
            self.assertFalse(roots[0]["exists"])
            self.assertEqual(roots[0]["file_count"], 0)
            self.assertTrue(_claude_cache_path(av).is_file(),
                            "0 sessions is still a memo")
        finally:
            shutil.rmtree(base, ignore_errors=True)

    def test_populate_builds_entries_and_stable_sort(self):
        av = self._av()
        r = _run_py(["sessions", "list", "--host-kind", "claude-code", "--json"],
                    _env(self.home, av))
        self.assertEqual(r.returncode, 0, r.stderr)
        dto = json.loads(r.stdout)
        self.assertEqual(dto["schema_version"], "1")
        page = dto["page"]
        self.assertEqual(page["total"], 3)
        # 稳定序 = sort_key（host_kind 同值 → native_id 内容字典序）。
        ids = [it["session_key"]["native_id"] for it in page["items"]]
        self.assertEqual(ids, ["all-recorded", "dangerous", "healthy"])
        st = dto["source_statuses"]["claude-code"]
        self.assertEqual(st["status"], "ok")
        self.assertEqual(st["sessions"], 3)
        roots = st["roots"]
        self.assertTrue(roots[0]["exists"])
        self.assertEqual(roots[0]["file_count"], 3)

    def test_summary_columns_honest_none_for_cost(self):
        """summary 列从 audit 载荷派生：title/model/date_span/findings_total 有
        值；tokens_total/cost_usd 诚实 None（claude 载荷没有 cost_report —— §9
        是设计不是实现，列表显示「—」而不是编造数字）。"""
        av = self._av()
        r = _run_py(["sessions", "list", "--host-kind", "claude-code", "--json"],
                    _env(self.home, av))
        self.assertEqual(r.returncode, 0, r.stderr)
        page = json.loads(r.stdout)["page"]
        by_id = {it["session_key"]["native_id"]: it for it in page["items"]}
        healthy = by_id["healthy"]
        self.assertEqual(healthy["session_key"]["host_kind"], "claude-code")
        self.assertEqual(healthy["session_key"]["source_profile"], "---repo--",
                         "cwd /repo → / 替换为 -（dsh 同款清洗）")
        self.assertEqual(healthy["title"], "我的会话")
        self.assertEqual(healthy["model"], "claude-sonnet-4-5")
        self.assertEqual(healthy["date_span"]["first"], "2026-08-20T14:27:00Z")
        self.assertEqual(healthy["date_span"]["last"], "2026-08-20T14:30:00Z")
        self.assertIsNone(healthy["cost_usd"], "no cost_report → honest None")
        self.assertIsNone(healthy["tokens_total"], "no cost_report → honest None")
        self.assertEqual(by_id["dangerous"]["findings_total"], 1,
                         "SV601 from dangerous fixture")
        self.assertEqual(by_id["dangerous"]["title"], "危险命令会话")
        self.assertEqual(by_id["all-recorded"]["title"], "全覆盖会话")

    def test_cache_v3_shape_and_delete_rebuild_identical(self):
        av = self._av()
        a = _run_py(["sessions", "list", "--host-kind", "claude-code", "--json"],
                    _env(self.home, av))
        self.assertEqual(a.returncode, 0, a.stderr)
        doc = json.loads(_claude_cache_path(av).read_text(encoding="utf-8"))
        self.assertEqual(doc["schema_version"], "3")
        self.assertEqual(doc["source"], "claude-code")
        self.assertIn("sessions", doc)
        self.assertEqual(doc["degraded"], [],
                         "claude 没有逐文件 degraded（按 session 构建，codex 同款）")
        sessions = doc["sessions"]
        self.assertEqual(len(sessions), 3)
        for s in sessions:
            self.assertEqual(len(s["paths"]), 1)
            self.assertEqual(len(s["paths"]), len(s["fingerprints"]))
            self.assertTrue(all(s["fingerprints"]),
                            "fingerprints must not be placeholders")
        # 删 cache 重建 → 源派生内容逐字节一致（墙钟字段归一化）。
        _claude_cache_path(av).unlink()
        b = _run_py(["sessions", "list", "--host-kind", "claude-code", "--json"],
                    _env(self.home, av))
        self.assertEqual(b.returncode, 0, b.stderr)
        self.assertEqual(
            _normalize_generated_at(json.loads(a.stdout)),
            _normalize_generated_at(json.loads(b.stdout)),
            "cache delete + rebuild must reproduce the same store")

    def test_all_degraded_is_unavailable_error(self):
        """文件在但一个都构建不出 → 类型化 source-unavailable 错误码（exit 2，
        **不是空页**）——与 dsh 的 §4.3 同款纪律。非 JSON 内容 → parse 降级 →
        0 条记录 → 构建不出。"""
        base = Path(tempfile.mkdtemp(prefix="av-claude-degraded-"))
        try:
            d = base / "home" / ".claude" / "projects" / "p"
            d.mkdir(parents=True)
            (d / "bad.jsonl").write_text("not json at all\n", encoding="utf-8")
            av = base / "av"
            av.mkdir()
            r = _run_py(["sessions", "list", "--host-kind", "claude-code",
                         "--json"], _env(base / "home", av))
            self.assertEqual(r.returncode, 2)
            self.assertIn("claude-code source unavailable", r.stderr)
            self.assertEqual(r.stdout, "")
        finally:
            shutil.rmtree(base, ignore_errors=True)


# ── §6.3-9 DSH 跨实现字节对账 ──────────────────────────────────

@unittest.skipUnless(_BIN and _HAVE_ZSTD,
                     "needs AGENT_VITALS_BIN + optional zstandard to reconcile "
                     "both implementations on the zstd fixture")
class DshReconciliationTests(unittest.TestCase):
    """DSH 半边对账台：多帧 zstd 夹具 home 下，cache 共享双方向逐字节一致、read
    信封一致。缺任一侧（无二进制 / 无 zstandard）无从对账，整体 skip。"""

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory(prefix="av-r2a-dsh-rec-")
        cls.tmp = Path(cls._tmp.name)
        cls.home = _fake_dsh_home(cls.tmp)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def _av(self):
        av = self.tmp / self._testMethodName
        av.mkdir(exist_ok=True)
        return av

    def _list(self, prog, av):
        run = _run_py if prog == "py" else _run_rs
        return run(["sessions", "list", "--host-kind", "dsh", "--json"],
                   _env(self.home, av))

    def test_dsh_list_byte_identical_via_cache_share_py_then_rs(self):
        av = self._av()
        py = self._list("py", av)
        self.assertEqual(py.returncode, 0, py.stderr)
        self.assertTrue(_dsh_cache_path(av).is_file())
        rs = self._list("rs", av)
        self.assertEqual(rs.returncode, 0, rs.stderr)
        self.assertEqual(py.stdout, rs.stdout,
                         "py-writes-cache / rs-reads-cache must be "
                         "byte-identical (generated_at shared via cache)")

    def test_dsh_list_byte_identical_via_cache_share_rs_then_py(self):
        av = self._av()
        rs = self._list("rs", av)
        self.assertEqual(rs.returncode, 0, rs.stderr)
        py = self._list("py", av)
        self.assertEqual(py.returncode, 0, py.stderr)
        self.assertEqual(rs.stdout, py.stdout,
                         "rs-writes-cache / py-reads-cache must be "
                         "byte-identical (generated_at shared via cache)")

    def test_dsh_read_byte_identical_via_cache_share(self):
        av = self._av()
        py_list = self._list("py", av)
        self.assertEqual(py_list.returncode, 0, py_list.stderr)
        key = json.loads(py_list.stdout)["page"]["items"][0]["session_key"]
        key_json = json.dumps(key, separators=(",", ":"))
        py = _run_py(["sessions", "read", "--session-key", key_json, "--json"],
                     _env(self.home, av))
        rs = _run_rs(["sessions", "read", "--session-key", key_json, "--json"],
                     _env(self.home, av))
        self.assertEqual(py.returncode, 0, py.stderr)
        self.assertEqual(rs.returncode, 0, rs.stderr)
        self.assertEqual(py.stdout, rs.stdout,
                         "read envelope must be byte-identical when both "
                         "impls read the same cache")


if __name__ == "__main__":
    unittest.main()
