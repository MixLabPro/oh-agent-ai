"""Codex canonical 与 Rust `CanonicalSession` 的形状对账（反遗漏网）。

Python 的 canonical 是个 dict，没有 schema——漏一个 key 静默，正是这次修的
「5 个 timeline key 整个缺掉」事故（`build_codex_evidence` 曾有 meta/signals/
coverage/attempts/notes，独缺 §11.5 的五个 timeline）。这里把
`build_codex_evidence` 产出的 canonical key 集与 Rust `evidence.rs` 的
`CanonicalSession` struct 字段逐字段对账：Rust 加字段 / Python 漏 key，任何
一边漂移测试都红。仿 `test_classification.py` 的显式清单风格，但清单不是
终点——`_rust_canonical_session_fields` 解析真实 struct，清单只是给人读的锚。
"""

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

sys.path.insert(0, str(ROOT / "scripts"))
from agent_vitals.codex_evidence import build_codex_evidence  # noqa: E402

# `CanonicalSession` 的字段集——对账目标。`_rust_canonical_session_fields` 的
# 解析结果必须与这份清单一致，否则就是 struct 排版变了或字段动了，而解析
# 悄悄拿到了错的集合还绿着。
EXPECTED_CANONICAL_FIELDS = frozenset({
    "meta", "signals", "coverage", "attempts", "notes",
    "tool_calls", "tool_results", "approvals", "sandbox_modes", "turns",
})


def _rust_canonical_session_fields():
    """解析 `evidence.rs` 里 `CanonicalSession` struct 的字段名。

    解析而不是只信硬编码清单：Rust struct 是字段集的真相源，字段增删了这里
    跟着对不上——这才是「对账」，不是「钉死一份静态清单」。struct 排版若变成
    字段跨行（`pub x:` 后换行写类型），这个正则拿不到字段名，测试会红，需要
    同步更新解析——这比静默漂移好。
    """
    source = (ROOT / "crates" / "agent-vitals-core" / "src" / "evidence.rs").read_text(
        encoding="utf-8")
    start = source.index("pub struct CanonicalSession {")
    body = source[start:]
    # struct 的闭合花括号（独立一行、顶格）——字段全是单行 `pub x: T,`，类型
    # 里没有裸括号，碰不到更早的 `\n}\n`。
    end = body.index("\n}\n")
    struct = body[:end]
    return frozenset(re.findall(r"^\s+pub ([a-z_]+):", struct, re.M))


class CodexCanonicalShapeTests(unittest.TestCase):
    def test_hardcoded_field_set_matches_rust_struct(self):
        self.assertEqual(_rust_canonical_session_fields(), EXPECTED_CANONICAL_FIELDS)

    def test_python_canonical_keys_equal_rust_fields(self):
        canonical = build_codex_evidence(
            [], "s1", "title", "legacy", "0.1.0", [], None)["canonical"]
        self.assertEqual(
            frozenset(canonical), _rust_canonical_session_fields(),
            "Python codex canonical 的 key 集必须与 Rust CanonicalSession 字段"
            "逐一对应——缺一个就是这次修的「整个缺 timeline key」事故复发")

    def test_timelines_are_present_and_empty(self):
        """五个 timeline key 在、值为空——结构对齐 + 反编造（§1）。"""
        canonical = build_codex_evidence(
            [], "s1", "title", "legacy", "0.1.0", [], None)["canonical"]
        for key in ("tool_calls", "tool_results", "approvals", "sandbox_modes", "turns"):
            self.assertEqual(canonical[key], {"entries": []},
                             "%s 应存在且为空时间线" % key)


if __name__ == "__main__":
    unittest.main()
