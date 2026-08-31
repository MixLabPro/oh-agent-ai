"""Cross-platform subprocess environment helpers for isolated-home tests."""

import os
from pathlib import Path


def isolated_home_env(home):
    """Return an environment where POSIX and Windows agree on the home path."""
    root = str(Path(home).resolve())
    env = dict(os.environ)
    env["HOME"] = root
    env["USERPROFILE"] = root
    drive, tail = os.path.splitdrive(root)
    if drive:
        env["HOMEDRIVE"] = drive
        env["HOMEPATH"] = tail or os.sep
    # 子进程的 HOME 被改到夹具路径后，Python 的 user site 会跟着漂到
    # `<夹具>/Library/Python/…`，丢掉对装在真实 user site 的包的可见性——最典型
    # 的是 zstandard（DSH 多帧 zstd 解码，R2a `SessionStore::dsh` 的 Python 侧
    # population 需要它）。隔离的目标是 **HOME 目录**（~/.codex、~/.dsh…），
    # 不是 Python 包；用 PYTHONUSERBASE 钉住真实 user base，子进程与套件进程
    # 看到同一批包。差分测试（tests/test_r2a.py）在夹具 HOME 下跑两侧，少了这
    # 一档 Python 会诚实报 `unsupported-compression`、Rust 却正常解码 → 逐字节
    # 对账红掉。
    if "PYTHONUSERBASE" not in env:
        try:
            import site
            env["PYTHONUSERBASE"] = site.getuserbase()
        except Exception:
            pass
    for adapter in ("CODEX_RUNTIME", "OPENCLAW_RUNTIME", "WORKBUDDY_BUILTINS"):
        env["AGENT_VITALS_DISABLE_" + adapter] = "1"
    env["AGENT_VITALS_DISABLE_OPENCLAW_BUNDLED"] = "1"
    return env
