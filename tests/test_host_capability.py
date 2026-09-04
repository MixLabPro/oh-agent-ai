"""host-capability degradation 表的 Python 镜像测试。

Rust 侧单测（`crates/agent-vitals-domain/src/contracts/host_capability.rs`）逐条镜像：
claude-code 只翻 SV607/608、workbuddy 只翻 SV604/605、未知宿主 no-op、
override 永不吞 Findings / 已有 Unavailable。reason 文案逐字节钉死——差分
测试（`both()`）靠两份实现给出同串。
"""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

sys.path.insert(0, str(ROOT / "scripts"))
from agent_vitals.host_capability import (  # noqa: E402
    CLAUDE_SV607_608_REASON,
    WORKBUDDY_SV604_605_REASON,
    degrade_rule_outcomes,
)


def outcomes():
    return {
        "SV601": {"status": "measured_zero"},
        "SV604": {"status": "measured_zero"},
        "SV605": {"status": "measured_zero"},
        "SV607": {"status": "measured_zero"},
        "SV608": {"status": "measured_zero"},
    }


class HostCapabilityDegradeTests(unittest.TestCase):
    def test_claude_code_flips_only_measured_zero_sv607_sv608(self):
        out = outcomes()
        degrade_rule_outcomes("claude-code", out)
        for code, o in out.items():
            if code in ("SV607", "SV608"):
                self.assertEqual(o, {"status": "unavailable",
                                     "missing": ["ToolResults"],
                                     "reason": CLAUDE_SV607_608_REASON})
            else:
                self.assertEqual(o, {"status": "measured_zero"}, "%s 不得动" % code)

    def test_workbuddy_flips_only_measured_zero_sv604_sv605(self):
        out = outcomes()
        degrade_rule_outcomes("workbuddy", out)
        for code, o in out.items():
            if code in ("SV604", "SV605"):
                self.assertEqual(o, {"status": "unavailable",
                                     "missing": ["ToolCalls"],
                                     "reason": WORKBUDDY_SV604_605_REASON})
            else:
                self.assertEqual(o, {"status": "measured_zero"}, "%s 不得动" % code)

    def test_unknown_host_is_a_no_op(self):
        out = outcomes()
        degrade_rule_outcomes("dsh", out)
        for o in out.values():
            self.assertEqual(o, {"status": "measured_zero"})

    def test_override_never_swallows_findings_or_existing_unavailable(self):
        out = {
            "SV607": {"status": "findings", "count": 1},
            "SV608": {"status": "unavailable",
                      "missing": ["ToolResults"],
                      "reason": "gate: no evidence"},
            "SV604": {"status": "measured_zero"},
        }
        degrade_rule_outcomes("claude-code", out)
        self.assertEqual(out["SV607"], {"status": "findings", "count": 1})
        self.assertEqual(out["SV608"],
                         {"status": "unavailable",
                          "missing": ["ToolResults"],
                          "reason": "gate: no evidence"},
                         "已有 Unavailable 不得被覆盖")
        self.assertEqual(out["SV604"], {"status": "measured_zero"})


if __name__ == "__main__":
    unittest.main()
