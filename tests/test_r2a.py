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


# ── §6.3-5 / §6.3-6 纯规则镜像（与 core `r2a.rs` 断言值同源）───────

def _entry(native_id, rev="2026-08-30", seq=0, host="codex"):
    k = R2A.SessionKey(host, native_id, "/repo", "ns")
    return R2A.SessionReportEntry(
        key=k, session_revision=rev, title="标题", model="gpt-5.6-sol",
        date_first="2026-08-01", date_last=rev, files=2, cost_usd=1.23,
        tokens_total=45678, findings_total=3, store_seq=seq,
        envelope={"schema_version": "1", "session": {}},
    )


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
        # 类型化错误码不是空页：dsh 源在 source_statuses 里明说 unavailable。
        self.assertEqual(dto["source_statuses"]["dsh"]["status"], "unavailable")
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

    def test_dsh_host_is_source_unavailable_not_empty(self):
        av = self._av()
        r = _run_py(["sessions", "list", "--host-kind", "dsh", "--json"],
                    _env(self.home, av))
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
        av = self._av()
        py = _run_py(["sessions", "list", "--host-kind", "dsh", "--json"],
                     _env(self.home, av))
        rs = _run_rs(["sessions", "list", "--host-kind", "dsh", "--json"],
                     _env(self.home, av))
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


if __name__ == "__main__":
    unittest.main()
