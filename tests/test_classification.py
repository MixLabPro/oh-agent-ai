"""静态扫描器模块（skills/）与会话/成本模块（agent/）的分类守卫。

repo 里有两个都叫「skill」的东西，按名字猜会互相进错门：

- **skill 体检**（静态扫描器）：读 SKILL.md / 目录 / 触发数据，判定体检指标。
  这是 Agent Vitals 最早的形态，落在 `skills/` 子树（Python 与 Rust 双侧）。
- **skill 执行**（会话审计）：审计**一次会话里 skill 被调用的好坏**——`skill.py` /
  core 的 `skill.rs` 读 DSH/会话事件，判定 SV6xx 会话规则。它不是扫描器，
  属 agent 家族，落在 `agent/` 子树（或 core crate，根本不在 `src/` 下）。

第 2 刀（深重构）按这个边界把扁平模块拆进了两个子树。本测试用**显式清单**
钉死「哪个模块进哪个子树」——不靠 import 图（图会随重构漂移，人看不出错），
就靠这份人和机器一起看的名单。谁把 `skill.py` 挪进 `skills/`，或把
`behavior.py` 挪出 `agent/`，这里立刻红。

清单按当前布局逐字写。新增模块时把它加进对应家族的 set（Python 侧还要同步
`tests/test_clawhub_packaging.py` 的 ALLOWED_PACKAGE_FILES）；跨家族移动模块
必须先改这份名单再动文件，让移动本身变成显式决策。
"""

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY_PACKAGE = ROOT / "scripts" / "agent_vitals"
RS_SRC = ROOT / "src"

# 静态 SKILL.md 体检（skills/ 子树）——两实现的名单略有出入：
# Python 有 lifecycle/snapshots，Rust 没有（这些函数在 core 或别处）；
# Rust 有 host/render/codex/openclaw/workbuddy，Python 在 adapters/ 或 core。
PY_SKILLS_FAMILY = {
    "analysis", "diff", "discovery", "doctor", "explain", "frontmatter",
    "inventory", "lifecycle", "overlap", "redact", "report", "security",
    "snapshots",
}
RS_SKILLS_FAMILY = {
    "analysis", "codex", "diff", "discovery", "doctor", "explain",
    "frontmatter", "host", "inventory", "openclaw", "overlap", "redact",
    "render", "report", "security", "snapshot", "workbuddy",
}

# 会话行为/成本审计（agent/ 子树）。**注意 skill.py 在这里**：会话 skill 执行
# 审计读的是运行证据，不是 SKILL.md 文本——名字像扫描器，家族是 agent。
PY_AGENT_FAMILY = {
    "behavior", "budget", "canonical_audit", "claude_cost", "claude_evidence",
    "claude_session_audit", "codex_cost", "codex_evidence", "codex_session_audit",
    "codex_usage", "compaction", "cost", "dsh_evidence", "duration",
    "host_capability", "plan",
    "r2a", "skill", "state", "subagent", "takeover", "trajectory", "usage",
    "usage_fact", "waste", "workbuddy_evidence", "workbuddy_session_audit",
}
RS_AGENT_FAMILY = {
    "behavior", "budget", "claude_cost", "claude_session", "codex_cost",
    "codex_session",
    "codex_session_audit", "cost", "discovery", "host_runtime_registration",
    "oneline", "plan", "r2a_store",
    "state", "takeover", "workbuddy_session",
}


def _module_stems(subdir: Path, *, python: bool) -> set:
    """子包里除 `__init__.py` / `mod.rs` 之外的模块名。"""
    pattern = "*.py" if python else "*.rs"
    skip = "__init__" if python else "mod"
    return {
        path.stem for path in subdir.glob(pattern)
        if path.stem != skip
    }


class ClassificationGuardTests(unittest.TestCase):
    def test_python_static_scanner_family_in_skills(self):
        """静态体检模块必须全部在 skills/，一个不多一个不少。"""
        self.assertEqual(
            _module_stems(PY_PACKAGE / "skills", python=True),
            PY_SKILLS_FAMILY,
            "skills/ 子树与静态扫描器清单不一致",
        )

    def test_python_session_agent_family_in_agent(self):
        """会话行为/成本模块必须全部在 agent/——尤其 skill.py 在这里。"""
        self.assertEqual(
            _module_stems(PY_PACKAGE / "agent", python=True),
            PY_AGENT_FAMILY,
            "agent/ 子树与会话/成本清单不一致",
        )

    def test_python_skill_execution_is_not_a_scanner(self):
        """命名陷阱：会话 skill 执行审计（agent/skill.py）不能住进 skills/。

        skills/ 是「对 SKILL.md 做体检」的世界，那里根本没有「skill 执行」
        这个概念；把它挪过去等于把运行时审计假装成静态扫描。
        """
        self.assertTrue(
            (PY_PACKAGE / "agent" / "skill.py").is_file(),
            "agent/skill.py 是会话 skill 执行审计，必须留在 agent/",
        )
        self.assertFalse(
            (PY_PACKAGE / "skills" / "skill.py").exists(),
            "skills/ 下不应有 skill.py——静态扫描器不含 skill 执行逻辑",
        )

    def test_rust_static_scanner_family_in_skills(self):
        """Rust 侧同样：静态体检模块全部在 src/skills/。"""
        self.assertEqual(
            _module_stems(RS_SRC / "skills", python=False),
            RS_SKILLS_FAMILY,
            "src/skills/ 子树与静态扫描器清单不一致",
        )

    def test_rust_session_agent_family_in_agent(self):
        """Rust 侧会话/成本模块全部在 src/agent/。"""
        self.assertEqual(
            _module_stems(RS_SRC / "agent", python=False),
            RS_AGENT_FAMILY,
            "src/agent/ 子树与会话/成本清单不一致",
        )

    def test_rust_skill_rs_lives_only_in_the_core_crate(self):
        """skill.rs（会话 skill 执行审计）只住在 core crate，src/ 下不该有。

        Rust binary 的 skill 会话规则走 `crate::agent::behavior` 透传 core；
        若谁在 src/skills/ 或 src/agent/ 又立了个 skill.rs，就是给
        「skill 执行」在 binary 里造第二份拷贝，与「core 是唯一真相源」相悖。
        """
        for sub in (RS_SRC / "skills", RS_SRC / "agent"):
            self.assertFalse(
                (sub / "skill.rs").exists(),
                "%s/skill.rs 不应存在——skill 会话规则只在 core crate"
                % sub.relative_to(ROOT),
            )
        self.assertTrue(
            (ROOT / "crates" / "agent-vitals-core" / "src" / "skill.rs").is_file(),
            "core crate 应持有 skill.rs（会话 skill 执行审计的唯一真相源）",
        )


if __name__ == "__main__":
    unittest.main()
