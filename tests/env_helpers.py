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
    for adapter in ("CODEX_RUNTIME", "OPENCLAW_RUNTIME", "WORKBUDDY_BUILTINS"):
        env["SKILL_VITALS_DISABLE_" + adapter] = "1"
    env["SKILL_VITALS_DISABLE_OPENCLAW_BUNDLED"] = "1"
    return env
