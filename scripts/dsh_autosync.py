#!/usr/bin/env python3
"""DSH 会话自动同步 —— 见 docs/PRODUCT.md §5.8.4/5.8.5、docs/DSH_INTEGRATION.md。

本脚本**不是**发行给 ClawHub 的技能扫描器的一部分（不在 `scripts/skill_vitals/`
包里）——它需要 `zstandard` 做多帧 zstd 解压，而 CLAUDE.md 要求被审计分发的
技能扫描器保持 stdlib-only（"a skill that audits skills for supply-chain risk
cannot itself pull third-party code at scan time"）。这个脚本是本地便利工具，
与 `scripts/install_swiftbar.sh` 同一层级，不参与"发行"——它可以 import
`skill_vitals` 包里的纯函数（`state.py` 的锁/原子写），但不会给那个包本身
引入任何第三方依赖。

**为什么不用 hook**：DSH 没有会话结束类的钩子。唯一有文档的钩子
（`hook/invoked`/`hook/result`）是逐次 tool-call 的 `PreToolUse` 类，
dialect ∈ {claude-code, codex}——不是生命周期钩子，连这条能不能到达宿主
实时事件流都没验证过（只在离线 JSONL 里见过，见 `fixtures/dsh/README.md`、
`docs/RUNTIME_EVIDENCE_CONTRACT.md`）。`docs/PRODUCT.md` §5.8.4/§5.8.5 已经
明确拒绝了"往用户 agent 配置里装 hook"这条路——那是产品定位的改变，要单独
决定，不能因为顺手就绕过去。改用"tick 脚本看到会话文件停止增长"这个纯读
的信号：*"我们只需要在状态栏或终端里说一句——tick 脚本看到会话文件停止
增长就到了同一个时刻，零写入用户配置。"*

**为什么每个 session 只同步一次，不做增量同步**：`oneline` 命令没有按
session 去重——同一份日志内容喂两次会累加两次（这是既有测试钉死的行为，
见 `tests/test_cli_m3.py::test_oneline_today_accumulates_across_runs`，本来
就是为"重新审计一份新日志"设计的）。所以这里每个 session 只在**确认文件
不再增长**（`(mtime, size)` 连续 `STABILITY_WINDOW_SECONDS` 不变）之后同步
恰好一次，宁可晚几分钟看到数据，也不能重复计费。

**为什么多帧解压不能用 `ZstdDecompressor().decompress()`**：DSH 的会话
日志是多帧追加写的（session 存续期间可能多次落盘，每次另起一个 zstd
帧）。`.decompress()` 只解第一帧——真机验证过：93941 字节的压缩文件用
`.decompress()` 只解出 280 字节（刚好是 session 头，看起来像"空会话"），
`stream_reader()` 读到 EOF 才是完整的 258228 字节 / 324 行。dsh-client
（TypeScript 那边）踩过同一个坑，见 `dsh-client/src/host/index.ts` 里
`readZstdFrames()` 的注释。

**为什么只同步 mtime 是"今天"的 session**：真机踩过——第一次跑这个脚本
时机器上有 38 个横跨 Aug 14–23 的历史 session 一次性被判定"已经稳定"，
全部同步进了 today.json，把当天预算显示炸成 283%。根因是 `oneline`/
`merge_today` 从来不校验日志里的日期是否真的是"今天"（既有测试钉死的
行为——`merge_today` 信任调用方，fixtures 也是拿历史日期直接喂），过去
没出问题只是因为 `oneline` 一直是人手动、当天跑。改 `merge_today` 自己
会连带打碎那些既有测试；正确的修法是在这里拦：只同步 mtime 落在今天
（北京时间）的会话，见 `_is_from_today`。更早的历史 session 永远标记
`skipped_stale`，宁可不自动处理，也不要把陈年消费错记成"今天"。
"""

import argparse
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from skill_vitals import state as state_module  # noqa: E402

# 5 分钟不再增长 = 大概率会话已结束（与 xbar 的 5 分钟 tick 同一个节奏，
# 见 contrib/xbar/skill-vitals.5m.sh）。
STABILITY_WINDOW_SECONDS = 5 * 60
SCAN_PY = _SCRIPT_DIR / "scan.py"


def _dsh_home() -> Path:
    override = os.environ.get("SKILL_VITALS_DSH_HOME")
    if override:
        return Path(override)
    return Path.home() / ".dsh"


def _discover_session_logs(dsh_home: Path):
    """`$DSH_HOME/sessions/*/*/session.jsonl[.zstd]` —— 跨所有 workspace，
    不只当前项目：skill-vitals 的预算状态是整机级的（`~/.skill-vitals/
    state/`），不是按项目分的。"""
    sessions_dir = dsh_home / "sessions"
    try:
        workspace_dirs = [p for p in sessions_dir.iterdir() if p.is_dir()]
    except OSError:
        return []
    found = []
    for workspace_dir in workspace_dirs:
        try:
            session_dirs = [p for p in workspace_dir.iterdir() if p.is_dir()]
        except OSError:
            continue
        for session_dir in session_dirs:
            for name in ("session.jsonl", "session.jsonl.zstd"):
                p = session_dir / name
                if p.is_file():
                    found.append(p)
    return found


def _is_from_today(mtime: float) -> bool:
    """会话文件的 mtime 落在北京时间的今天吗？

    真机验证过这条检查为什么**必须**存在：第一次跑这个脚本时，机器上有
    38 个横跨 Aug 14–23 的历史 session 一次性被判定"已经稳定"，全部同步
    进了 today.json——`oneline`/`merge_today` 从来没有校验过日志里的日期
    是否真的是"今天"（这是既有测试钉死的行为：`merge_today` 信任调用方,
    fixtures 里也是拿历史日期直接喂），过去之所以没出过问题，是因为
    `oneline` 一直只被人手动、当天跑。自动化把这条隐含前提打破了——补的
    不是 `merge_today` 自己（改它会连带打碎那些既有 fixture 测试），而是
    在这里拦住：**只同步 mtime 落在今天的会话**,更早的历史 session 宁可
    一直不同步，也不要被套上"今天"这个错误的日期。"""
    mtime_dt = datetime.fromtimestamp(mtime, tz=timezone.utc)
    return state_module._to_bj_date(mtime_dt).isoformat() == state_module._today_key()


def _autosync_state_path() -> Path:
    return state_module.state_dir() / "dsh_autosync.json"


def _read_tracked():
    return state_module._read(_autosync_state_path()) or {}


def _write_tracked(tracked):
    state_module._atomic_write(_autosync_state_path(), tracked)


def _decompress_zstd(path: Path) -> str:
    """多帧 zstd → 拼接后的纯文本。见模块 docstring"为什么多帧解压不能用
    ZstdDecompressor().decompress()"。抛 ImportError 时调用方负责给出
    可操作的提示（pip install zstandard），这里不吞。"""
    import zstandard

    dctx = zstandard.ZstdDecompressor()
    chunks = []
    with open(path, "rb") as fh:
        with dctx.stream_reader(fh) as reader:
            while True:
                chunk = reader.read(1 << 16)
                if not chunk:
                    break
                chunks.append(chunk)
    return b"".join(chunks).decode("utf-8", errors="replace")


def _run_oneline(text: str) -> bool:
    """把解压/读到的纯文本落一个临时 .jsonl，喂给现有 `oneline` 命令——
    复用整条已测试过的落盘链路（state.merge_today/merge_month/写
    alert.json/刷新 calendar.html），不在这里重新实现一遍。"""
    fd, tmp_path = tempfile.mkstemp(suffix=".jsonl")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        r = subprocess.run(
            [sys.executable, str(SCAN_PY), "oneline", tmp_path],
            capture_output=True, text=True)
        if r.returncode != 0:
            print("dsh_autosync: oneline failed for %s: %s" %
                  (tmp_path, r.stderr.strip()), file=sys.stderr)
            return False
        return True
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _read_session_text(path: Path):
    """返回 (text, error)。error 非 None 时 text 是 None——区分"读不到"
    和"读到了空字符串"，不能拿 None 冒充空串，也不能拿空串冒充读成功。"""
    if path.suffix == ".zstd":
        try:
            return _decompress_zstd(path), None
        except ImportError:
            return None, "zstandard not installed (pip install zstandard)"
        except Exception as e:
            return None, "zstd decompress failed: %s" % e
    try:
        return path.read_text(encoding="utf-8", errors="replace"), None
    except OSError as e:
        return None, "read failed: %s" % e


def sync_once(now=None, dsh_home=None, stability_window=STABILITY_WINDOW_SECONDS):
    """跑一轮发现 + 同步。返回本轮实际同步（跑了 `oneline`）的 session 数。

    每个 session 只在 `(mtime, size)` 相对上一次检查**没变**、且距那次
    检查已经过了 `stability_window` 才同步——"文件不再增长"是
    docs/PRODUCT.md 已经定下的会话结束信号，不是猜的。同步过一次的
    session（`synced=True`）永远不会再同步第二次，防止 `oneline` 的
    "同一份内容喂两次会累加两次"在这里造成重复计费。
    """
    now = now if now is not None else time.time()
    dsh_home = dsh_home if dsh_home is not None else _dsh_home()
    tracked = _read_tracked()
    synced_count = 0

    for path in _discover_session_logs(dsh_home):
        key = str(path)
        try:
            st = path.stat()
        except OSError:
            continue
        mtime, size = st.st_mtime, st.st_size
        prev = tracked.get(key)

        if prev is None:
            tracked[key] = {"mtime": mtime, "size": size, "synced": False,
                             "first_seen_stable_at": now}
            continue

        if prev.get("synced") or prev.get("skipped_stale"):
            if prev.get("mtime") == mtime and prev.get("size") == size:
                continue  # 快路径：没变化，已经处理过（同步了或判定过期跳过），跳过
            # 之后文件又变了（罕见——比如路径被复用）：保守起见重新计时，
            # 不假装没看见新增内容，也不盲目沿用旧的判定。
            tracked[key] = {"mtime": mtime, "size": size, "synced": False,
                             "first_seen_stable_at": now}
            continue

        if prev.get("mtime") == mtime and prev.get("size") == size:
            first_seen = prev.get("first_seen_stable_at")
            if first_seen is not None and (now - first_seen) >= stability_window:
                if not _is_from_today(mtime):
                    # 这份日志不是今天产生的——`oneline`/`merge_today` 没有
                    # 校验日期的能力，硬跑只会把历史消费错记成"今天"（见
                    # `_is_from_today` 的文档注释，真机踩过）。标记跳过，
                    # 不再每轮重新判断这同一份文件。
                    print("dsh_autosync: %s predates today, skipping "
                          "auto-sync (run oneline manually if you want a "
                          "historical backfill)" % path, file=sys.stderr)
                    tracked[key] = {"mtime": mtime, "size": size, "synced": False,
                                     "first_seen_stable_at": first_seen,
                                     "skipped_stale": True}
                    continue
                text, err = _read_session_text(path)
                if err is not None:
                    print("dsh_autosync: skip %s: %s" % (path, err), file=sys.stderr)
                    # 不动 tracked[key]——下一轮 tick 用同样的 first_seen 再试一次
                    # （比如用户这次装上了 zstandard，下次就能成功）。
                    continue
                if _run_oneline(text):
                    tracked[key] = {"mtime": mtime, "size": size, "synced": True,
                                     "first_seen_stable_at": first_seen}
                    synced_count += 1
                # 失败：不标记 synced，保留原状态，下一轮自动重试。
            continue  # 还没到稳定窗口——继续等，不动 tracked[key]

        # 内容变了（还在长）——重新开始计时。
        tracked[key] = {"mtime": mtime, "size": size, "synced": False,
                         "first_seen_stable_at": now}

    _write_tracked(tracked)
    return synced_count


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args(argv)
    try:
        n = sync_once()
    except Exception as e:
        # 这个脚本被 xbar 的 5 分钟 tick 调用——绝不能因为它崩了菜单栏
        # 就跟着空掉。任何未预见的错误都吞掉，什么都不改，下一轮再试。
        print("dsh_autosync: unexpected error, doing nothing this tick: %s" % e,
              file=sys.stderr)
        return 0
    if n:
        print("dsh_autosync: synced %d session(s)" % n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
