"""Artifact-level checks for the ClawHub Python package."""

import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "package-clawhub.yml"

# SKILL.md 里形如 [文字](references/foo.md) 的相对链接。不匹配 http(s)。
MARKDOWN_LINK_RE = re.compile(r"\[[^\]]*\]\((?!https?:)([^)#]+)\)")


def _skill_md_local_links():
    text = (ROOT / "SKILL.md").read_text(encoding="utf-8")
    return sorted({m.group(1).strip() for m in MARKDOWN_LINK_RE.finditer(text)})

# 深重构后（第 2 刀）包分两层：顶层入口/共享 + skills/（静态体检）+
# agent/（会话行为/成本）子树 + adapters/ + templates/。清单按当前布局逐字写，
# 新增模块必须两处一起改（这里 + package-clawhub.yml），否则打包门禁自说自话。
ALLOWED_PACKAGE_FILES = {
    Path(name) for name in (
        # 顶层：入口 + 共享
        "__init__.py", "cli.py", "compat.py", "paths.py", "util.py",
        "source_identity.py",
        # skills/：静态 SKILL.md 体检
        "skills/__init__.py", "skills/analysis.py", "skills/diff.py",
        "skills/discovery.py", "skills/doctor.py", "skills/explain.py",
        "skills/frontmatter.py", "skills/inventory.py", "skills/lifecycle.py",
        "skills/overlap.py", "skills/redact.py", "skills/report.py",
        "skills/security.py", "skills/snapshots.py",
        # agent/：会话行为 + 成本
        "agent/__init__.py", "agent/behavior.py", "agent/budget.py",
        "agent/canonical_audit.py", "agent/claude_cost.py",
        "agent/claude_evidence.py",
        "agent/claude_session_audit.py",
        "agent/claude_usage_fact.py",
        "agent/codex_cost.py", "agent/codex_evidence.py",
        "agent/codex_session_audit.py", "agent/codex_usage.py",
        "agent/codex_usage_fact.py",
        "agent/compaction.py", "agent/cost.py", "agent/dsh_evidence.py",
        "agent/dsh_usage_fact.py",
        "agent/duration.py",
        "agent/host_capability.py",
        "agent/mcp.py",
        "agent/plan.py", "agent/r2a.py", "agent/skill.py", "agent/state.py",
        "agent/subagent.py",
        "agent/takeover.py",
        "agent/trajectory.py", "agent/usage.py", "agent/usage_fact.py",
        "agent/waste.py",
        "agent/workbuddy_evidence.py", "agent/workbuddy_session_audit.py",
        # adapters/：宿主适配器
        "adapters/__init__.py", "adapters/claude.py", "adapters/codex.py",
        "adapters/codex_session.py",
        "adapters/openclaw.py", "adapters/workbuddy.py", "adapters/hermes.py",
        "adapters/dsh.py", "adapters/claude_session.py",
        "adapters/workbuddy_session.py",
    )
}
ALLOWED_PACKAGE_DIRS = {Path("adapters"), Path("skills"), Path("agent")}

# v0.8 Phase E5：pricing.json/codex_pricing.json/templates/ 是 Rust/Python/
# dsh-client 三方共读的资产，从 agent_vitals/ 包搬进仓库根 assets/（不是 Python
# 包私有数据）——打包产物里单独镜像同一层，不进 ALLOWED_PACKAGE_FILES。
ALLOWED_ASSETS_FILES = {
    Path(name) for name in (
        "pricing.json", "codex_pricing.json",
        "templates/calendar.html", "templates/codex_session.html",
    )
}
ALLOWED_ASSETS_DIRS = {Path("templates")}


def _ignore_python_cache(_directory, names):
    return {
        name for name in names
        if name == "__pycache__" or name.endswith((".pyc", ".pyo"))
    }


def _unexpected_package_entries(package, allowed_files=ALLOWED_PACKAGE_FILES,
                                 allowed_dirs=ALLOWED_PACKAGE_DIRS):
    unexpected = []
    for path in package.rglob("*"):
        relative = path.relative_to(package)
        if "__pycache__" in relative.parts or path.suffix in (".pyc", ".pyo"):
            continue
        if path.is_dir():
            if relative not in allowed_dirs:
                unexpected.append(relative)
        elif relative not in allowed_files:
            unexpected.append(relative)
    return sorted(unexpected, key=lambda value: value.as_posix())


class ClawHubPackagingTests(unittest.TestCase):
    def test_workflow_packages_modules_and_smokes_artifact(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("timeout-minutes: 45", workflow)
        self.assertIn("cp -R packages/agent-vitals-python/agent_vitals", workflow)
        self.assertIn("cp assets/pricing.json assets/codex_pricing.json", workflow)
        self.assertIn("Unexpected directory in Python package", workflow)
        self.assertIn("Unexpected file in Python package", workflow)
        self.assertIn("-name '__pycache__'", workflow)
        self.assertIn("-name '*.pyc'", workflow)
        self.assertIn("cd \"$package_dir\"", workflow)
        self.assertIn("python -I scripts/scan.py --version", workflow)
        self.assertIn("python -I scripts/scan.py --help", workflow)
        # --version / --help 只证明模块能导入。真正会在用户机器上炸的是
        # 「链接指向没打进包的文件」和「命令跑起来才走到的代码路径」。
        self.assertIn("SKILL.md links missing from the package", workflow)
        self.assertIn("doctor --no-snapshot", workflow)
        self.assertIn("smoke_home", workflow)
        # 只靠「没报错」的门禁，与「一条都没跑」的门禁在 checks 页面上长得
        # 一模一样 —— verify.yml 为差分 job 明确拒绝过这种绿勾。
        self.assertIn("packaged smoke ok", workflow)
        # 探测宿主要 20–30 秒且结果随 runner 而变；这道门测的是包完整性。
        self.assertIn("AGENT_VITALS_DISABLE_CODEX_RUNTIME=1", workflow)
        self.assertIn("AGENT_VITALS_DISABLE_OPENCLAW_RUNTIME=1", workflow)
        # tag 与 __version__ 脱钩过六个版本，发布前必须校验。
        self.assertIn("Version mismatch", workflow)

    def test_cli_version_is_a_single_plain_semver_source(self):
        """ClawHub 的版本取自 tag，CLI 的取自这里；两者曾各走各的。

        发布门禁做的是字符串相等比较，所以这里必须是裸 semver ——
        写成 'v1.1.0' 或带后缀都会让每次发布在最后一步失败。
        """
        import re as _re
        source = (ROOT / "packages" / "agent-vitals-python" / "agent_vitals" / "__init__.py").read_text(
            encoding="utf-8")
        match = _re.search(r'^__version__ = "([^"]+)"', source, _re.M)
        self.assertIsNotNone(match, "__init__.py 必须定义 __version__")
        self.assertRegex(match.group(1), r"^\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$")

    def test_skill_md_links_resolve_in_the_repository(self):
        """SKILL.md 走渐进式披露后会链到 references/ 下的分层文档。

        链接写错在仓库里不报错，只在 Agent 真去读的时候变成一句「文件不存在」，
        而那时已经没人能修。
        """
        links = _skill_md_local_links()
        self.assertTrue(links, "SKILL.md 应当链接到分层参考文档")
        missing = [link for link in links if not (ROOT / link).is_file()]
        self.assertEqual(missing, [], "SKILL.md 链接指向不存在的文件")

    def test_every_skill_md_link_is_packaged_for_clawhub(self):
        """曾经的陷阱：工作流按文件名逐个 cp references/，新增一份就漏一份。

        仓库里链接是通的，发布出去的包里却没有那个文件 —— 只有装了 ClawHub
        版本的用户会踩到，本地怎么测都测不出来。
        """
        workflow = WORKFLOW.read_text(encoding="utf-8")
        for link in _skill_md_local_links():
            self.assertIn(link, workflow,
                          "%s 被 SKILL.md 引用，但没有出现在打包工作流里" % link)

    def test_source_package_has_only_explicit_runtime_modules(self):
        source_package = ROOT / "packages" / "agent-vitals-python" / "agent_vitals"
        if not source_package.is_dir():
            self.skipTest("The staged agent_vitals package has not been extracted yet")
        self.assertEqual(_unexpected_package_entries(source_package), [])

    def test_assets_dir_has_only_the_shared_files(self):
        # v0.8 Phase E5：assets/ 是 Rust/Python/dsh-client 三方共读的资产（价格表 +
        # HTML 模板），不是 Python 包私有数据——独立于 ALLOWED_PACKAGE_* 单钉一份。
        assets = ROOT / "assets"
        self.assertEqual(
            _unexpected_package_entries(
                assets, allowed_files=ALLOWED_ASSETS_FILES, allowed_dirs=ALLOWED_ASSETS_DIRS),
            [],
        )

    def test_allowlist_rejects_extra_files_and_directories(self):
        with tempfile.TemporaryDirectory() as temp:
            package = Path(temp) / "agent_vitals"
            (package / "adapters").mkdir(parents=True)
            (package / "__init__.py").write_text("", encoding="utf-8")
            (package / "adapters" / "claude.py").write_text("", encoding="utf-8")
            self.assertEqual(_unexpected_package_entries(package), [])

            (package / "notes.txt").write_text("not a runtime module", encoding="utf-8")
            (package / "tests").mkdir()
            (package / "tests" / "test_leak.py").write_text("", encoding="utf-8")
            self.assertEqual(
                _unexpected_package_entries(package),
                [Path("notes.txt"), Path("tests"), Path("tests/test_leak.py")],
            )

    def test_minimal_artifact_contains_all_modules_and_runs(self):
        # v0.8 Phase E4：源仓库把 agent_vitals 挪进 packages/agent-vitals-python/，
        # 但 scan.py 留在 scripts/（用户文档 `python3 scripts/scan.py` 不变）。
        # 打包产物镜像同一相对结构——scan.py 用
        # `Path(__file__).resolve().parent.parent / "packages" / "agent-vitals-python"`
        # 找包，源仓库和打包产物走同一份 sys.path 逻辑。
        # v0.8 Phase E5：pricing.json/codex_pricing.json/templates/ 搬出包，进了
        # 仓库根 assets/——同样镜像相对结构，各消费者往上爬的层数才对得上。
        source_package = ROOT / "packages" / "agent-vitals-python" / "agent_vitals"
        if not source_package.is_dir():
            self.skipTest("The staged agent_vitals package has not been extracted yet")
        source_assets = ROOT / "assets"
        if not source_assets.is_dir():
            self.skipTest("The staged assets/ directory has not been extracted yet")

        with tempfile.TemporaryDirectory() as temp:
            artifact = Path(temp) / "agent-vitals"
            (artifact / "scripts").mkdir(parents=True)
            (artifact / "packages" / "agent-vitals-python").mkdir(parents=True)
            for name in ("scan.py", "probe_logs.py"):
                shutil.copy2(ROOT / "scripts" / name, artifact / "scripts" / name)
            artifact_package = artifact / "packages" / "agent-vitals-python" / "agent_vitals"
            shutil.copytree(
                source_package,
                artifact_package,
                ignore=_ignore_python_cache,
            )
            artifact_assets = artifact / "assets"
            shutil.copytree(source_assets, artifact_assets, ignore=_ignore_python_cache)

            source_modules = {
                path.relative_to(source_package)
                for path in source_package.rglob("*.py")
            }
            artifact_modules = {
                path.relative_to(artifact_package)
                for path in artifact_package.rglob("*.py")
            }
            self.assertEqual(artifact_modules, source_modules)
            self.assertEqual(_unexpected_package_entries(artifact_package), [])
            self.assertEqual(
                _unexpected_package_entries(
                    artifact_assets, allowed_files=ALLOWED_ASSETS_FILES,
                    allowed_dirs=ALLOWED_ASSETS_DIRS),
                [],
            )
            self.assertFalse(list(artifact.rglob("__pycache__")))
            self.assertFalse(list(artifact.rglob("*.pyc")))

            env = os.environ.copy()
            env.pop("PYTHONPATH", None)
            env["PYTHONDONTWRITEBYTECODE"] = "1"
            for flag in ("--version", "--help"):
                result = subprocess.run(
                    [sys.executable, "-I", "scripts/scan.py", flag],
                    cwd=artifact,
                    env=env,
                    text=True,
                    capture_output=True,
                    timeout=20,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertTrue(result.stdout.strip())


if __name__ == "__main__":
    unittest.main()
