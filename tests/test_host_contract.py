"""v0.6 host-contract spec §8：完整性守卫 G2–G10（G1 已在
`test_cli_matrix.py::test_hosts_json_byte_parity`/`test_hosts_human_format_byte_parity`
落地，Rust 侧对应见 `crates/agent-vitals-core/src/host_capability.rs` 与
`canonical_audit.rs` 的 `#[cfg(test)]`）。

延续 `test_classification.py` 的显式集合风格：清单人工写、checked-in，不从行
生成——行与清单互为独立 oracle，对不齐才是这层测试存在的理由（§8 G5 的分歧
处理流程）。

Rust 与 Tauri 端的对应实现（G9 的 `HostRuntimeRegistration`、G7 的托盘/
sessFilter 展示层派生）本轮**未落地**，登记为已知缺口——见模块末尾
`test_g7_g9_registered_as_known_gap`；理由：两者要求先设计跨二进制/跨语言的
新注册面，属比本轮其余守卫大一个数量级的独立工作量，不应该为了凑齐编号而
仓促写一份不真的断言。
"""

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from agent_vitals import host_capability  # noqa: E402
from agent_vitals import cost as cost_module  # noqa: E402
from agent_vitals.claude_evidence import build_claude_evidence  # noqa: E402
from agent_vitals.codex_evidence import build_codex_evidence  # noqa: E402

# ────────────────────────── §8 三集合 ──────────────────────────

RUNTIME_HOST_IDS = frozenset({"dsh", "codex", "claude-code", "workbuddy"})
# 历史 scan 命令面全局 `--host` 的 7 值清单（`ScanCliHostChoices`）——混合承载
# 安装发现（hermes/openclaw）与部分 session 静态分析，不是纯 runtime 集合。
SCAN_CLI_HOST_CHOICES = frozenset(
    {"all", "claude-code", "codex", "openclaw", "hermes", "workbuddy", "dsh"})
PSEUDO_CHOICES = frozenset({"all"})

# 三处硬编码这份清单的源文件——都必须原样含这个逗号分隔的字面量子串（源码
# 自扫描，不是四处：spec 原文写"cli.py 两处 + main.rs + test_cli_matrix.py"共
# 四处，实测 cli.py 现在只有一处全局 `--host`；本轮未处理的 P2，登记于此，
# 不是漏查——`grep -c` 已验证 cli.py 里这个字面量子串只出现一次）。
_SCAN_CLI_LITERAL = '"all", "claude-code", "codex", "openclaw", "hermes", "workbuddy", "dsh"'
_SCAN_CLI_LOCATIONS = (
    ROOT / "scripts" / "agent_vitals" / "cli.py",
    ROOT / "src" / "main.rs",
    ROOT / "tests" / "test_cli_matrix.py",
)


class G2ThreeSetSeparationTests(unittest.TestCase):
    """守卫按集合关系写，不是全集相等（v0.6 spec §8 R1 修订）。"""

    def test_hosts_row_ids_equal_runtime_host_ids_exactly(self):
        ids = frozenset(h["id"] for h in host_capability.HOSTS)
        self.assertEqual(ids, RUNTIME_HOST_IDS, "HOSTS 行 id 集合必须精确等于四个 runtime 宿主")

    def test_pseudo_choices_never_enter_the_registry(self):
        ids = frozenset(h["id"] for h in host_capability.HOSTS)
        self.assertEqual(ids & PSEUDO_CHOICES, frozenset(),
                         "'all' 是跨宿主聚合伪值，绝不进 HostProfile 行")

    def test_scan_cli_host_choices_literal_agrees_across_three_locations(self):
        """三处硬编码清单彼此相等——把现在无人守的一致性钉住（v0.6 spec §8 G2b）。
        用字面量子串比对而不是解析 AST：三处写法（Python tuple / Rust
        value_parser 数组 / Python list）不同，但内容必须逐字相同，子串匹配
        直接钉住"逐字"这条要求，解析成结构反而会掩盖顺序/引号差异。"""
        for path in _SCAN_CLI_LOCATIONS:
            with self.subTest(path=str(path.relative_to(ROOT))):
                text = path.read_text(encoding="utf-8")
                self.assertIn(_SCAN_CLI_LITERAL, text,
                             f"{path} 的 host 清单与基准字面量不一致或已改动，"
                             "需要与另外两处同步核对")

    def test_runtime_host_ids_are_a_subset_of_scan_cli_choices_today(self):
        """今天成立、但不强求为不变量的关系（v0.6 spec §8）：将来可能出现只上
        runtime 而不进入历史 scan 命令面的宿主。"""
        self.assertLessEqual(RUNTIME_HOST_IDS, SCAN_CLI_HOST_CHOICES - PSEUDO_CHOICES)


# ────────────────────────── G3：语言支持矩阵 ──────────────────────────

_LANGUAGE_SUPPORT_MATRIX = {
    "dsh": ("dsh_evidence.rs", "dsh_evidence.py"),
    "codex": ("codex_evidence.rs", "codex_evidence.py"),
    "claude-code": ("claude_code_evidence.rs", "claude_evidence.py"),
    "workbuddy": ("workbuddy_evidence.rs", "workbuddy_evidence.py"),
}


class G3LanguageSupportMatrixTests(unittest.TestCase):
    """行 × 镜像 × 文件存在。DSH 的 Python 侧曾登记 "pending M1"
    （`dsh_evidence.py` 不存在）；M1 已建成该模块，这里从显式缺口降级成
    普通存在断言（v0.6 spec §8 G3）。"""

    def test_every_runtime_host_has_both_language_evidence_modules(self):
        for host_id, (rust_name, py_name) in _LANGUAGE_SUPPORT_MATRIX.items():
            with self.subTest(host=host_id):
                rust_path = ROOT / "crates" / "agent-vitals-core" / "src" / rust_name
                py_path = ROOT / "scripts" / "agent_vitals" / "agent" / py_name
                self.assertTrue(rust_path.is_file(), f"{host_id}: 缺 {rust_path}")
                self.assertTrue(py_path.is_file(), f"{host_id}: 缺 {py_path}")


# ────────────────────────── G4：降级穷举 ──────────────────────────

class G4DegradeExhaustivenessTests(unittest.TestCase):
    """行上全部 DegradedRule × 三态输入，断言只发生
    MeasuredZero→Unavailable（v0.6 spec §5.3 条款 1 / §8 G4 的机械化）。
    按行驱动，不是硬编码 claude-code/workbuddy——将来任何宿主的行加了
    degraded_rules，这条测试自动覆盖它。"""

    def test_degrade_only_flips_measured_zero_for_declared_codes(self):
        for host in host_capability.HOSTS:
            codes = [r["code"] for r in host["degraded_rules"]]
            if not codes:
                continue
            with self.subTest(host=host["id"]):
                for label, template in (
                    ("measured_zero", {"status": "measured_zero"}),
                    ("findings", {"status": "findings", "count": 1}),
                    ("unavailable", {"status": "unavailable", "missing": ["X"],
                                     "reason": "gate: no evidence"}),
                ):
                    outcomes = {c: dict(template) for c in codes}
                    outcomes["SV999"] = {"status": "measured_zero"}  # 不在 codes 里的对照组
                    host_capability.degrade_rule_outcomes(host["id"], outcomes)
                    for c in codes:
                        if label == "measured_zero":
                            self.assertEqual(outcomes[c]["status"], "unavailable",
                                             f"{host['id']}/{c}: measured_zero 必须被翻转")
                            self.assertEqual(outcomes[c]["missing"],
                                             next(r["missing"] for r in host["degraded_rules"]
                                                  if r["code"] == c))
                        else:
                            self.assertEqual(outcomes[c]["status"], template["status"],
                                             f"{host['id']}/{c}: {label} 态不得被覆盖")
                    self.assertEqual(outcomes["SV999"]["status"], "measured_zero",
                                     "不在 degraded_rules 里的码不受影响")


# ────────────────────────── G5：§13 矩阵对账 ──────────────────────────

# 手写自 docs/RUNTIME_EVIDENCE_CONTRACT.md §13（2026-09-02 版本）人工派生，
# checked-in 成测试数据——不从 HOSTS 行生成，两者互为独立 oracle。矩阵行 ×
# {DSH, Codex(Legacy), Codex(Paginated), Claude Code, WorkBuddy} 五列；
# **宿主级**缺席 = 双 shape 交集（Codex 双 shape 都 unavailable 才算，
# §5.2 双层缺席规则）。矩阵没有 SandboxPolicy/UserPrompts/UserCorrections
# 三行——它们是"矩阵外的宿主补充项"，逐宿主分别登记，不构造全宿主共同集
# （R2 修订 2：UserPrompts 已在 Codex/Claude Code 测得，不能全宿主共同缺席）。
_MATRIX_UNAVAILABLE = {
    # 信号 → 该列文案 "unavailable"/"derivable"/"measured"/"lossy"/"partial"/"derived"/"unverified"
    # 值原样摘自 §13 表格；本模块只读它判"是否 unavailable"，不做语义翻译。
    "ToolCalls": {"dsh": "measured", "codex_legacy": "measured", "codex_paginated": "measured",
                  "claude-code": "measured", "workbuddy": "measured ※"},
    "ToolResults": {"dsh": "measured", "codex_legacy": "measured", "codex_paginated": "measured",
                    "claude-code": "measured", "workbuddy": "measured ※"},
    "TurnBoundaries": {"dsh": "measured", "codex_legacy": "measured", "codex_paginated": "measured",
                       "claude-code": "derived", "workbuddy": "derived ※"},
    "StepBoundaries": {"dsh": "measured", "codex_legacy": "unavailable", "codex_paginated": "unavailable",
                       "claude-code": "derived", "workbuddy": "unavailable"},
    "Usage": {"dsh": "measured", "codex_legacy": "measured", "codex_paginated": "measured",
              "claude-code": "measured", "workbuddy": "unverified ※"},
    "UsageAggregate": {"dsh": "derivable", "codex_legacy": "derivable", "codex_paginated": "derivable",
                       "claude-code": "derivable", "workbuddy": "measured"},
    "ContextWindow": {"dsh": "measured", "codex_legacy": "measured", "codex_paginated": "measured",
                      "claude-code": "unavailable", "workbuddy": "unavailable"},
    "QuotaConsumption": {"dsh": "unavailable", "codex_legacy": "measured", "codex_paginated": "measured",
                         "claude-code": "unavailable", "workbuddy": "unavailable"},
    "ApprovalDecisions": {"dsh": "measured", "codex_legacy": "unavailable ‡", "codex_paginated": "partial ‡",
                          "claude-code": "partial ¶", "workbuddy": "measured"},
    "ApprovalPolicy": {"dsh": "measured", "codex_legacy": "measured", "codex_paginated": "measured",
                       "claude-code": "measured", "workbuddy": "measured"},
    "SandboxModes": {"dsh": "measured", "codex_legacy": "unavailable", "codex_paginated": "unavailable",
                     "claude-code": "unavailable", "workbuddy": "measured"},
    "NetworkAccess": {"dsh": "unavailable", "codex_legacy": "unavailable", "codex_paginated": "unavailable",
                      "claude-code": "unavailable", "workbuddy": "measured"},
    "Compaction": {"dsh": "measured", "codex_legacy": "measured", "codex_paginated": "measured",
                   "claude-code": "lossy", "workbuddy": "unavailable"},
    "SubagentSpawns": {"dsh": "measured", "codex_legacy": "measured", "codex_paginated": "measured",
                       "claude-code": "measured", "workbuddy": "measured ※"},
    "SkillInvocations": {"dsh": "measured", "codex_legacy": "derived", "codex_paginated": "derived",
                         "claude-code": "derived", "workbuddy": "unavailable"},
    "Hooks": {"dsh": "measured", "codex_legacy": "unavailable", "codex_paginated": "measured",
              "claude-code": "lossy", "workbuddy": "unavailable"},
    "FileMutations": {"dsh": "measured", "codex_legacy": "lossy", "codex_paginated": "measured",
                      "claude-code": "derived", "workbuddy": "measured"},
}
_MATRIX_COLUMNS = {
    "dsh": "dsh", "codex": ("codex_legacy", "codex_paginated"),
    "claude-code": "claude-code", "workbuddy": "workbuddy",
}
# 矩阵外补充项：逐宿主分别登记（不构造全宿主共同缺席集，R2 修订 2）。
_MATRIX_EXTERNAL_SUPPLEMENTS = {
    "dsh": {"SandboxPolicy", "UserPrompts", "UserCorrections"},
    "codex": {"SandboxPolicy", "UserCorrections"},
    "claude-code": {"SandboxPolicy", "UserCorrections"},
    "workbuddy": {"SandboxPolicy", "UserPrompts", "UserCorrections"},
}
# 行与矩阵原文的**显式偏差登记项**——没有注记的偏差过不了这份对账（v0.6
# spec §8 G5 分歧处理流程）。每条都必须能在代码注释里找到出处。
_REGISTERED_DEVIATIONS = {
    ("codex", "SandboxModes"): (
        "矩阵原文两个 shape 都写 unavailable（宿主级交集应为 unavailable），"
        "但 2026-08 起 turn_context.sandbox_policy 已确认持久化、代码已改 "
        "measured（codex_evidence.py 的 _UNAVAILABLE_SIGNALS 头注释、"
        "codex_evidence.rs 的 derive_coverage 同源）——矩阵文档滞后于代码，"
        "行以代码为准，此处按 G5 分歧流程登记而非静默改矩阵。"
    ),
    ("workbuddy", "Usage"): (
        "矩阵写 unverified（※，generation span 存在但逐 span token 未核实）"
        "，workbuddy_evidence.rs 保守处理成 unavailable——WorkBuddy Usage 是"
        "spec §5.2 明文点名的偏差登记活例子。"
    ),
    ("workbuddy", "ToolResults"): (
        "矩阵写 measured ※（span.status/span.error），但该证据只存在于会话"
        "匿名的 traces/ 面、接不进具体 session（workbuddy_evidence.rs 头注释"
        "「traces 的 status/error 接不进 session」），故 audit-log 面上 "
        "ToolResults 保守处理成 unavailable。"
    ),
    ("workbuddy", "SubagentSpawns"): (
        "同上：矩阵 measured ※ 的证据源同样只在会话匿名的 traces/ 面，"
        "workbuddy_evidence.rs 的当前实现保守处理成 unavailable。"
    ),
    ("claude-code", "ApprovalDecisions"): (
        "矩阵写 partial（¶，denials only, derived+lossy——理论上能从 tool-result "
        "marker string 恢复），claude_code_evidence.rs/claude_evidence.py 当前"
        "选择先诚实报 Unavailable（first-slice 范围，未实现 marker 恢复），"
        "两处头注释与 host_capability.rs 的 HOSTS 行注释都记着这是范围内的"
        "有意选择，不是矩阵与代码打架。"
    ),
}


def _matrix_expects_unavailable(signal, host_id):
    cell = _MATRIX_UNAVAILABLE.get(signal)
    if cell is None:
        return signal in _MATRIX_EXTERNAL_SUPPLEMENTS.get(host_id, set())
    cols = _MATRIX_COLUMNS[host_id]
    if isinstance(cols, tuple):
        # 宿主级 = 双 shape 交集：两列都 unavailable 才算。
        return all(cell[c].startswith("unavailable") for c in cols)
    return cell[cols].startswith("unavailable")


class G5MatrixReconciliationTests(unittest.TestCase):
    def test_hosts_row_unmeasured_matches_matrix_derived_expectation(self):
        for host in host_capability.HOSTS:
            host_id = host["id"]
            actual = set(host["unmeasured_signals"])
            all_signals = set(_MATRIX_UNAVAILABLE) | {"SandboxPolicy", "UserPrompts", "UserCorrections"}
            with self.subTest(host=host_id):
                for signal in sorted(all_signals):
                    expected = _matrix_expects_unavailable(signal, host_id)
                    deviation = _REGISTERED_DEVIATIONS.get((host_id, signal))
                    if deviation is not None:
                        # 登记过的偏差：只要求它带出处，不要求行与矩阵一致
                        # ——行为变更已发生，矩阵文档滞后，见登记文本。
                        continue
                    self.assertEqual(
                        signal in actual, expected,
                        f"{host_id}/{signal}：行 unmeasured={signal in actual} vs "
                        f"矩阵推导={expected}，未登记的分歧——按 G5 流程要么改行"
                        "要么改矩阵、要么补登记，不能悄悄漂移")

    def test_every_registered_deviation_still_disagrees_with_the_raw_matrix(self):
        """反向校验：登记过的偏差如果哪天被悄悄改回和矩阵一致，这条登记就
        该删掉——否则它会掩盖"这条差异是否还存在"这件事。"""
        for (host_id, signal), _reason in _REGISTERED_DEVIATIONS.items():
            host = next(h for h in host_capability.HOSTS if h["id"] == host_id)
            actual_unavailable = signal in host["unmeasured_signals"]
            matrix_says = _matrix_expects_unavailable(signal, host_id)
            self.assertNotEqual(
                actual_unavailable, matrix_says,
                f"{host_id}/{signal} 的登记偏差已经消失（行与矩阵现在一致），"
                "该从 _REGISTERED_DEVIATIONS 删除，不是继续挂着")


# ────────────────────────── G6：合成会话不变量 ──────────────────────────

class G6SyntheticSessionInvariantTests(unittest.TestCase):
    """对每个（干净侧）适配器喂一条"kitchen-sink"合成会话——覆盖它所有已知
    能 bump 的信号类型——断言行声明为 unmeasured 的信号依旧零覆盖、不进
    signals 集合。workbuddy 侧（M2b）留待并行流合入后补齐，不在本测试范围。
    """

    def _assert_unmeasured_are_zero(self, host_id, canonical):
        host = next(h for h in host_capability.HOSTS if h["id"] == host_id)
        coverage = canonical["coverage"]
        signals = canonical["signals"]
        for signal in host["unmeasured_signals"]:
            with self.subTest(host=host_id, signal=signal):
                c = coverage.get(signal, {"measured": 0, "derived": 0, "lossy": 0, "unmetered": 0})
                total = c["measured"] + c["derived"] + c["lossy"] + c["unmetered"]
                self.assertEqual(total, 0, f"{host_id}/{signal} 声明 unmeasured 却有非零覆盖")
                self.assertNotIn(signal, signals, f"{host_id}/{signal} 声明 unmeasured 却进了 signals")

    def test_claude_code_kitchen_sink_session(self):
        records = [
            {"type": "user", "uuid": "m1", "timestamp": "2026-08-20T14:27:00Z",
             "cwd": "/repo", "message": {"id": "m1", "model": "claude-sonnet-4-5", "content": "去修 bug"}},
            {"type": "assistant", "uuid": "m2", "timestamp": "2026-08-20T14:27:05Z", "cwd": "/repo",
             "message": {"id": "m2", "model": "claude-sonnet-4-5", "usage": {"input_tokens": 1, "output_tokens": 1},
                         "content": [
                             {"type": "tool_use", "id": "c1", "name": "Bash", "input": {"command": "ls -la"}},
                             {"type": "tool_use", "id": "c2", "name": "WebFetch", "input": {"url": "https://1.2.3.4/x"}},
                         ]}},
            {"type": "user", "uuid": "m3", "timestamp": "2026-08-20T14:27:08Z", "cwd": "/repo",
             "message": {"id": "m3", "content": [
                 {"type": "tool_result", "tool_use_id": "c1", "content": "ok", "is_error": True},
                 {"type": "tool_result", "tool_use_id": "c2", "content": "ok"},
             ]}},
            {"type": "ai-title", "uuid": "t1", "timestamp": "2026-08-20T14:30:00Z", "cwd": "/repo",
             "aiTitle": "kitchen sink"},
        ]
        canonical = build_claude_evidence(records, "s1")["canonical"]
        self._assert_unmeasured_are_zero("claude-code", canonical)

    def test_codex_kitchen_sink_session(self):
        items = [
            {"type": "turn_context", "timestamp": 0, "payload": {
                "sandbox_policy": {"type": "danger-full-access"}, "approval_policy": "never",
                "turn_id": "t1"}},
            {"type": "event_msg", "timestamp": 0, "payload": {
                "type": "task_started", "turn_id": "t1", "started_at": 100}},
            {"type": "event_msg", "timestamp": 0, "payload": {
                "type": "item_completed", "turn_id": "t1", "item": {
                    "type": "CommandExecution", "id": "exec-1",
                    "command": ["/bin/zsh", "-lc", "rm -rf /tmp/x"], "exit_code": 0}}},
            {"type": "response_item", "timestamp": 0, "payload": {
                "type": "message", "role": "user", "content": [{"type": "input_text", "text": "hi"}]}},
            {"type": "event_msg", "timestamp": 0, "payload": {
                "type": "task_complete", "turn_id": "t1"}},
        ]
        canonical = build_codex_evidence(
            items, "s1", "title", "legacy", "0.146.0", ["/repo"], "gpt-5.3-codex")["canonical"]
        self._assert_unmeasured_are_zero("codex", canonical)


# ────────────────────────── G8：源码自扫描 ──────────────────────────

class G8SourceSelfScanTests(unittest.TestCase):
    """§5.3 条款 5 的机械形式：derive-not-copy——任何文件里出现第二份
    per-host unmeasured 字面量表 = 守卫红。M2a 把 claude/codex 两侧的
    `_UNAVAILABLE_SIGNALS`/`is_unavailable` 改成查 HOSTS 行，这里防回退。
    不是主验证（G6 才是），是廉价哨兵——只抓"看起来像残留字面量表"的形状。
    """

    def test_claude_and_codex_python_derive_unavailable_from_host_profile(self):
        for name in ("claude_evidence.py", "codex_evidence.py"):
            path = ROOT / "scripts" / "agent_vitals" / "agent" / name
            text = path.read_text(encoding="utf-8")
            with self.subTest(file=name):
                self.assertIn("host_profile(", text,
                             f"{name} 应该从 host_capability.host_profile 派生 unmeasured，"
                             "而不是本地字面量表")
                # 反面哨兵：不该再出现"一串带引号的 Signal 名 + 逗号"的多行字面量
                # 模式（超过 3 个连续 Signal 名字符串视为可疑）。
                m = re.search(
                    r'_UNAVAILABLE_SIGNALS\s*=\s*\(\s*\n(?:\s*"[A-Za-z]+",\s*\n){3,}', text)
                self.assertIsNone(m, f"{name} 的 _UNAVAILABLE_SIGNALS 疑似退回了字面量表")

    def test_claude_code_and_codex_rust_derive_unavailable_from_host_profile(self):
        for name in ("claude_code_evidence.rs", "codex_evidence.rs"):
            path = ROOT / "crates" / "agent-vitals-core" / "src" / name
            text = path.read_text(encoding="utf-8")
            with self.subTest(file=name):
                self.assertIn("host_capability::host_profile(", text,
                             f"{name} 的 is_unavailable 应该查 host_capability::HOSTS，"
                             "而不是本地 matches! 字面量表")
                m = re.search(
                    r"fn is_unavailable\(signal: Signal\) -> bool \{\s*\n\s*matches!", text)
                self.assertIsNone(m, f"{name} 的 is_unavailable 疑似退回了 matches! 字面量表")

    def test_dsh_rust_derives_unavailable_from_host_profile(self):
        path = ROOT / "crates" / "agent-vitals-core" / "src" / "dsh_evidence.rs"
        text = path.read_text(encoding="utf-8")
        self.assertIn('host_capability::host_profile("dsh")', text,
                     "dsh_evidence.rs 的五个 unmeasured 信号置零应查 HOSTS 行")


# ────────────────────────── G10：计价分辨率 ──────────────────────────

def _mechanically_find_time_varying_cards(pricing):
    """扫 pricing.json 顶层 providers，形状为 `{off_peak, peak}` 的卡即时变卡
    （机械推导，不靠人工声明——v0.6 spec §8 G10）。"""
    found = []
    for provider, pv in (pricing.get("providers") or {}).items():
        for model, card in ((pv or {}).get("models") or {}).items():
            v = (card or {}).get("input_uncached")
            if isinstance(v, dict) and "off_peak" in v and "peak" in v:
                found.append((provider, model))
    return sorted(found)


_EXPECTED_TIME_VARYING_CARDS = sorted([
    ("deepseek-official", "deepseek-v4-flash"),
    ("deepseek-official", "deepseek-v4-pro"),
    ("shengsuanyun", "deepseek-v4-pro"),
])

# 缺口登记（方案 b，沿用 G3 "pending M1" 惯例）：这两个计价入口共用
# `_price_claude_map` → `_price_claude_model` → `_flat_rate` 的 off_peak
# 兜底，v0.6 阶段以显式缺口登记，v0.7 落地峰谷读法后一并删除、改成硬断言
# （v0.6 spec §8 G10 / §12 DoD 9：必须同批结清）。
_PENDING_V07_GAP = frozenset({"claude_day_cost", "claude_session_cost"})


class G10PricingResolutionTests(unittest.TestCase):
    def test_time_varying_card_set_matches_registry(self):
        pricing = cost_module.load_pricing()
        self.assertEqual(_mechanically_find_time_varying_cards(pricing),
                         _EXPECTED_TIME_VARYING_CARDS)

    def test_price_claude_map_has_exactly_the_two_registered_callers(self):
        """廉价哨兵（G8 风格）：`_flat_rate` 的 off_peak 兜底只应经这两个已登记
        入口触达。调用点数变了就说明有新入口悄悄接上了下界读法，须同步这份
        缺口登记与 v0.6 spec §8 G10。"""
        text = (ROOT / "scripts" / "agent_vitals" / "agent" / "cost.py").read_text(encoding="utf-8")
        occurrences = len(re.findall(r"_price_claude_map\(", text))
        # 1 处定义 + 2 个已登记入口各调用 1 次。
        self.assertEqual(occurrences, 3,
                         "_price_claude_map 的调用点数量变化——检查是否有新计价入口"
                         "接上了 _flat_rate 的 off_peak 兜底，需要同步 G10 缺口登记")

    def test_registered_gap_entries_currently_take_the_off_peak_floor(self):
        """行为断言的对偶：证明这两个入口**目前**确实卡在下界读法——缺口登记
        准确，不是摆设。v0.7 把它们换成峰谷读法后，这条测试必须跟着改写成
        "不等于 off_peak 下界"的硬断言（v0.6 spec §8 G10 / §12 DoD 9）。"""
        pricing = cost_module.load_pricing()
        card = pricing["providers"]["deepseek-official"]["models"]["deepseek-v4-flash"]
        off_peak_rate = card["input_uncached"]["off_peak"]
        peak_rate = card["input_uncached"]["peak"]
        self.assertNotEqual(off_peak_rate, peak_rate, "测试卡必须真的时变，否则本断言无意义")

        day = {"deepseek-v4-flash": {"input_tokens": 1_000_000, "cache_read_input_tokens": 0,
                                     "cache_creation_input_tokens": 0, "output_tokens": 0}}
        day_total = cost_module.claude_day_cost(day, pricing)["per_model"]["deepseek-v4-flash"]["total"]
        self.assertAlmostEqual(day_total, off_peak_rate,
                               msg="claude_day_cost：pending v0.7 缺口应仍卡在 off_peak 下界")

        session = {"deepseek-v4-flash": {"inputTokens": 1_000_000, "cacheReadInputTokens": 0,
                                         "cacheCreationInputTokens": 0, "outputTokens": 0}}
        session_total = cost_module.claude_session_cost(
            session, pricing)["per_model"]["deepseek-v4-flash"]["total"]
        self.assertAlmostEqual(session_total, off_peak_rate,
                               msg="claude_session_cost：pending v0.7 缺口应仍卡在 off_peak 下界")

    def test_dsh_ledger_bucket_pricer_already_does_peak_split(self):
        """正对照：DSH 的日桶计价（`cost._price`，Rust `bucket_price` 的 Python
        对应）已经是全仓验证过的峰谷读法——喂一份全落在高峰的用量，价格必须
        按 peak 单价算，不是 off_peak（否则这条正对照本身就该红，说明基准
        代码退步了，不只是 claude 那两个入口的事）。"""
        pricing = cost_module.load_pricing()
        card = pricing["providers"]["deepseek-official"]["models"]["deepseek-v4-flash"]
        buckets_all_peak = {
            "uncached_input_tokens": 1_000_000, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 1_000_000, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
        }
        priced = cost_module._price(buckets_all_peak, "deepseek-v4-flash", "deepseek-official", pricing)
        expected_peak_total = 1.0 * card["input_uncached"]["peak"]
        expected_off_peak_total = 1.0 * card["input_uncached"]["off_peak"]
        self.assertAlmostEqual(priced["total"], expected_peak_total)
        self.assertNotAlmostEqual(priced["total"], expected_off_peak_total)


# ────────────────────────── G7 / G9：已知缺口登记 ──────────────────────────

class KnownGapRegistrationTests(unittest.TestCase):
    def test_g7_g9_registered_as_known_gap(self):
        """G7/G9 是**部分**落地，不是全空：

        - G7：src-tauri `overview.rs::HostsSnapshot::unavailable()`（托盘兜底
          三行）已改从 core `HOSTS` 的 `fold != None` 派生（见该文件同名单测
          `hosts_snapshot_unavailable_derives_from_hosts_registry_fold_
          capability`）。**未落地**的是真实数据路径
          `r2a_store.rs::sessions_navigation`——它对三个宿主各跑不同的折叠
          机制（dsh state 链 / codex 全量 rollout / claude ledger），不是可
          直接遍历的同构循环，要把它接进注册集需要先在 G9 里把 `fold` 维度
          设计进 `HostRuntimeRegistration`，两者是同一块未完成的工作，不是
          各自独立的缺口。sessFilter（`workbench.js`，前端）同样未动。
        - G9：`src/agent/host_runtime_registration.rs` 新建了 CLI 二进制的
          `HostRuntimeRegistration`，登记了 `cli.sessions` surface 的
          `session_store` 维度（`required_for_cli_sessions() ⊆
          registered_for_cli_sessions()`，Rust 侧单测钉住）。**未落地**的是
          `fold` 维度（上面 G7 那段解释了它为什么不是简单体力活）与
          `tauri.sessions`/`tauri.menubar-cost` 两个 surface（要在 src-tauri
          侧建独立的注册表——那是另一个二进制，注册面不共享）。

        这里不重复 Rust 侧断言（那些已经在各自的单测里），只登记"做了多少、
        剩多少、为什么剩"，供 M3 收尾时核对。"""
        self.assertTrue(True)
