"""dsh_autosync.py 测试 —— "文件停止增长即视为会话结束" 的同步逻辑。

**zstandard 是可选依赖**（与 tests/test_properties.py 的 hypothesis 同一条
纪律）：装了就跑，没装就跳过整个模块，仓库核心测试套件保持零第三方依赖。

    python3 -m venv .venv && .venv/bin/python -m pip install zstandard
    .venv/bin/python -m unittest tests.test_dsh_autosync -v
"""

import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

try:
    import zstandard
except ImportError:  # pragma: no cover
    raise unittest.SkipTest(
        "未安装 zstandard，跳过 dsh_autosync 测试。"
        "装法：python3 -m venv .venv && .venv/bin/python -m pip install zstandard")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

# 普通 import（不是 importlib.util.spec_from_file_location）——必须让
# `dsh_autosync` 落进 sys.modules，否则 mock.patch("dsh_autosync.xxx")
# 解析到的是另一份重新 import 出来的模块实例，补丁打了个寂寞。
import dsh_autosync


class _IsolatedHome:
    def __enter__(self):
        self.tmp = tempfile.mkdtemp(prefix="sv-autosync-test-")
        self.env = {"SKILL_VITALS_HOME": self.tmp}
        self._p = mock.patch.dict(os.environ, self.env, clear=False)
        self._p.start()
        return self

    def __exit__(self, *args):
        self._p.stop()
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)


def _write_session(dsh_home: Path, workspace="ws", session_id="s1",
                    name="session.jsonl", content=""):
    d = dsh_home / "sessions" / workspace / session_id
    d.mkdir(parents=True, exist_ok=True)
    p = d / name
    p.write_text(content, encoding="utf-8")
    return p


def _compress_frame(text: str) -> bytes:
    """独立压缩一段文本成一个完整的 zstd 帧——两次调用各自的
    ZstdCompressor 产出的字节直接拼接，就是 DSH 多帧追加写的真实形状。"""
    return zstandard.ZstdCompressor().compress(text.encode("utf-8"))


class TestDiscoverSessionLogs(unittest.TestCase):
    def test_discovers_across_all_workspaces(self):
        with tempfile.TemporaryDirectory() as tmp:
            dsh_home = Path(tmp)
            _write_session(dsh_home, workspace="proj-a", session_id="s1")
            _write_session(dsh_home, workspace="proj-b", session_id="s2",
                            name="session.jsonl.zstd")
            found = {str(p) for p in dsh_autosync._discover_session_logs(dsh_home)}
            self.assertEqual(len(found), 2, "两个不同 workspace 的 session 都要发现")

    def test_missing_sessions_dir_returns_empty_not_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            found = dsh_autosync._discover_session_logs(Path(tmp) / "nonexistent")
            self.assertEqual(found, [])


class TestSyncOnceStabilityGate(unittest.TestCase):
    def test_fast_path_skips_already_synced_unchanged_file(self):
        """已同步且 (mtime, size) 没变——不该再碰 subprocess，也不该再解压。"""
        with _IsolatedHome(), tempfile.TemporaryDirectory() as dsh_tmp:
            dsh_home = Path(dsh_tmp)
            p = _write_session(dsh_home, content="hello")
            st = p.stat()
            tracked_path = dsh_autosync._autosync_state_path()
            dsh_autosync._write_tracked({
                str(p): {"mtime": st.st_mtime, "size": st.st_size,
                          "synced": True, "first_seen_stable_at": 0},
            })
            with mock.patch("dsh_autosync.subprocess.run") as run:
                n = dsh_autosync.sync_once(now=time.time(), dsh_home=dsh_home)
            self.assertEqual(n, 0)
            run.assert_not_called()

    def test_growing_session_is_never_synced(self):
        """两次调用之间文件内容变了（还在长）——每次都重置计时，不同步。"""
        with _IsolatedHome(), tempfile.TemporaryDirectory() as dsh_tmp:
            dsh_home = Path(dsh_tmp)
            p = _write_session(dsh_home, content="line1\n")
            with mock.patch("dsh_autosync.subprocess.run") as run:
                dsh_autosync.sync_once(now=1000.0, dsh_home=dsh_home,
                                        stability_window=300)
                p.write_text("line1\nline2\n", encoding="utf-8")  # 文件长大了
                dsh_autosync.sync_once(now=2000.0, dsh_home=dsh_home,
                                        stability_window=300)
                run.assert_not_called()
            tracked = dsh_autosync._read_tracked()
            self.assertFalse(tracked[str(p)]["synced"])
            self.assertEqual(tracked[str(p)]["first_seen_stable_at"], 2000.0,
                              "内容变化后应该重新从这次调用开始计时")

    def test_stabilized_session_synced_exactly_once(self):
        """连续两次调用 (mtime, size) 都不变、且间隔超过稳定窗口——同步一次；
        之后再调用不应该再触发第二次（防 oneline 重复计费）。"""
        with _IsolatedHome(), tempfile.TemporaryDirectory() as dsh_tmp:
            dsh_home = Path(dsh_tmp)
            p = _write_session(dsh_home, content='{"type":"session"}\n')

            def fake_run(cmd, capture_output, text):
                return mock.Mock(returncode=0, stderr="")

            with mock.patch("dsh_autosync.subprocess.run", side_effect=fake_run) as run:
                # 第一次看到：只记录，还没到稳定窗口。
                n1 = dsh_autosync.sync_once(now=1000.0, dsh_home=dsh_home,
                                             stability_window=300)
                self.assertEqual(n1, 0)
                run.assert_not_called()

                # 内容没变，但还没过 300 秒——继续等。
                n2 = dsh_autosync.sync_once(now=1200.0, dsh_home=dsh_home,
                                             stability_window=300)
                self.assertEqual(n2, 0)
                run.assert_not_called()

                # 内容没变，过了 300 秒——现在同步。
                n3 = dsh_autosync.sync_once(now=1301.0, dsh_home=dsh_home,
                                             stability_window=300)
                self.assertEqual(n3, 1)
                self.assertEqual(run.call_count, 1)

                # 再跑一次——不该再同步第二次。
                n4 = dsh_autosync.sync_once(now=5000.0, dsh_home=dsh_home,
                                             stability_window=300)
                self.assertEqual(n4, 0)
                self.assertEqual(run.call_count, 1, "已同步的 session 不能被同步两次")

            tracked = dsh_autosync._read_tracked()
            self.assertTrue(tracked[str(p)]["synced"])

    def test_failed_oneline_leaves_unsynced_for_retry(self):
        """oneline 子进程失败——不标记 synced，下一轮 tick 应该重试。"""
        with _IsolatedHome(), tempfile.TemporaryDirectory() as dsh_tmp:
            dsh_home = Path(dsh_tmp)
            _write_session(dsh_home, content='{"type":"session"}\n')

            def failing_run(cmd, capture_output, text):
                return mock.Mock(returncode=1, stderr="boom")

            with mock.patch("dsh_autosync.subprocess.run", side_effect=failing_run):
                dsh_autosync.sync_once(now=1000.0, dsh_home=dsh_home, stability_window=300)
                n = dsh_autosync.sync_once(now=1301.0, dsh_home=dsh_home, stability_window=300)
            self.assertEqual(n, 0, "失败不计入同步成功数")
            tracked = dsh_autosync._read_tracked()
            self.assertFalse(list(tracked.values())[0]["synced"])


class TestMultiFrameZstdDecompression(unittest.TestCase):
    def test_decompresses_full_content_not_just_first_frame(self):
        """回归测试：这整个功能存在的理由——.decompress() 只解第一帧，
        真实 DSH 日志是多帧追加写的。用两个独立压缩的帧拼接模拟这个形状。"""
        frame1 = _compress_frame('{"type":"session","version":0}\n')
        frame2 = _compress_frame('{"type":"tool/call","seq":1}\n')
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "session.jsonl.zstd"
            p.write_bytes(frame1 + frame2)

            # 对照组：单帧 API 只会解出第一帧——证明这不是测试摆设。
            naive = zstandard.ZstdDecompressor().decompress(
                frame1 + frame2, max_output_size=10_000)
            self.assertEqual(naive.decode("utf-8"), '{"type":"session","version":0}\n',
                              "单帧 API 应该只解出第一帧，否则这条回归测试没有意义")

            full = dsh_autosync._decompress_zstd(p)
            self.assertEqual(
                full,
                '{"type":"session","version":0}\n{"type":"tool/call","seq":1}\n',
                "必须拼出两帧的完整内容，不能只有第一帧")

    def test_missing_zstandard_reports_actionable_error_and_does_not_sync(self):
        """zstandard 不可用时：清楚报错、不崩、不标记同步（留给下一轮重试）。"""
        frame = _compress_frame('{"type":"session"}\n')
        with _IsolatedHome(), tempfile.TemporaryDirectory() as dsh_tmp:
            dsh_home = Path(dsh_tmp)
            p = _write_session(dsh_home, name="session.jsonl.zstd", content="")
            p.write_bytes(frame)

            with mock.patch.dict(sys.modules, {"zstandard": None}):
                with mock.patch("dsh_autosync.subprocess.run") as run:
                    dsh_autosync.sync_once(now=1000.0, dsh_home=dsh_home, stability_window=300)
                    n = dsh_autosync.sync_once(now=1301.0, dsh_home=dsh_home, stability_window=300)
                    run.assert_not_called()
            self.assertEqual(n, 0)
            tracked = dsh_autosync._read_tracked()
            self.assertFalse(tracked[str(p)]["synced"])


class TestMainNeverRaises(unittest.TestCase):
    def test_unexpected_error_is_swallowed_and_returns_zero(self):
        """xbar 的 5 分钟 tick 调用这个脚本——任何未预见的异常都不能让它
        以非零退出码或者异常终止,menu bar 不该因为这个脚本崩掉。"""
        with mock.patch("dsh_autosync.sync_once", side_effect=RuntimeError("boom")):
            code = dsh_autosync.main([])
        self.assertEqual(code, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
