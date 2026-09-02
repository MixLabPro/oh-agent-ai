#!/usr/bin/env python3
"""catalog_2026_09（Claude Code 语料计价）纯函数钉测。

与 `crates/agent-vitals-core/src/cost.rs` 里同夹具同数的 inline 测试互守——
同一组数字在两侧各钉一遍（与 tests/test_cost_priced_day.py 同款交叉引用模式），
命令级差分等 claude-sync 落地后由 test_claude_cost.py 的 `both()` 补。

口径（2026-09-02 审阅裁决后的实施态）：
- 新面 = 独立的第二计价面，输出全量标 pricing_basis="catalog"，不碰
  cost_report/priced_day 等 DSH 路径（那些在既有测试里，字节不变）。
- 计价输入统一 claude 4 型 snake 键名；`claude_session_cost` 只做 cost-state
  camel → snake 键名转换，不重算。
- 未知模型 `<synthetic>` 等 → 四型全进 unpriced（含 output——与 cost_report
  的 unpriced 词表不同是有意的，见 cost.py::_price_claude_map 注释）。
- 缓存写（cache_creation）走 1h 档（host_costusd_note：Claude Code 自报
  costUSD 按 1h 计），无 1h 档的卡各取各的（M2.7 cache_write / deepseek 0）。
- MiniMax-M3 tiers 一律取首档（≤512K）并把档位标签透出。
"""

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# 与 test_cost_priced_day.py 同款：agent_vitals 包按 scripts/ 相对导入
# （agent/__init__ 链上有绝对导入，不插 scripts/ 会 ModuleNotFoundError）。
sys.path.insert(0, str(ROOT / "scripts"))

from agent_vitals.agent.cost import (  # noqa: E402
    claude_day_cost,
    claude_session_cost,
    load_pricing,
)


class CatalogResolveCase(unittest.TestCase):
    def setUp(self):
        self.pricing = load_pricing()

    def test_resolve_hits_and_misses(self):
        from scripts.agent_vitals.agent.cost import _resolve_card_catalog

        self.assertEqual(_resolve_card_catalog("claude-opus-5", self.pricing),
                         ("anthropic", "claude-opus-5", "USD"))
        self.assertEqual(_resolve_card_catalog("deepseek-v4-pro[1M]", self.pricing),
                         ("deepseek-official", "deepseek-v4-pro", "CNY"))
        self.assertEqual(_resolve_card_catalog("deepseek/deepseek-v4-pro-0813",
                                               self.pricing)[:3:2],
                         ("deepseek-official", "CNY"))
        provider, _, currency = _resolve_card_catalog("moonshot/kimi-k3",
                                                      self.pricing)
        self.assertEqual((provider, currency), ("moonshot", "USD"))
        self.assertIsNone(_resolve_card_catalog("<synthetic>", self.pricing))
        self.assertIsNone(_resolve_card_catalog("some/unknown-model", self.pricing))


class ClaudeSessionCostCase(unittest.TestCase):
    """夹具与 cost.rs::tests 的同名测试同数（互守，见文件头）。"""

    def setUp(self):
        self.pricing = load_pricing()

    def test_deepseek_variant_at_official_cny_card(self):
        out = claude_session_cost({
            "deepseek-v4-pro[1M]": {"inputTokens": 1000000, "outputTokens": 0,
                                    "cacheReadInputTokens": 0,
                                    "cacheCreationInputTokens": 0},
        }, self.pricing)
        self.assertIsNotNone(out)
        self.assertAlmostEqual(out["currency_totals"]["CNY"], 4.5)
        self.assertEqual(out["currency_totals"]["USD"], 0.0)
        pm = out["per_model"]["deepseek-v4-pro[1M]"]
        self.assertEqual(pm["pricing_basis"], "catalog")
        self.assertEqual(pm["priced_with"], "deepseek-official")
        self.assertEqual(pm["currency"], "CNY")
        self.assertNotIn("tier", pm)

    def test_anthropic_all_four_token_types(self):
        out = claude_session_cost({
            "claude-opus-5": {"inputTokens": 1000000, "outputTokens": 500000,
                              "cacheReadInputTokens": 1000000,
                              "cacheCreationInputTokens": 1000000},
        }, self.pricing)
        self.assertAlmostEqual(out["currency_totals"]["USD"], 28.0)
        self.assertEqual(out["unpriced_tokens"], 0)
        self.assertEqual(out["currency_totals"]["CNY"], 0.0)

    def test_m3_first_tier_and_label(self):
        out = claude_session_cost({
            "MiniMax-M3": {"inputTokens": 1000000, "outputTokens": 100000,
                           "cacheReadInputTokens": 0,
                           "cacheCreationInputTokens": 0},
        }, self.pricing)
        pm = out["per_model"]["MiniMax-M3"]
        self.assertEqual(pm["tier"], "≤512K input")
        self.assertAlmostEqual(out["currency_totals"]["CNY"], 2.94)

    def test_m27_cache_write_rate(self):
        out = claude_session_cost({
            "MiniMax-M2.7": {"inputTokens": 0, "outputTokens": 0,
                             "cacheReadInputTokens": 0,
                             "cacheCreationInputTokens": 1000000},
        }, self.pricing)
        self.assertAlmostEqual(out["currency_totals"]["CNY"], 2.625)

    def test_splits_two_currencies(self):
        out = claude_session_cost({
            "claude-sonnet-5": {"inputTokens": 2000000, "outputTokens": 0,
                                "cacheReadInputTokens": 0,
                                "cacheCreationInputTokens": 0},
            "deepseek-v4-flash": {"inputTokens": 2000000, "outputTokens": 0,
                                  "cacheReadInputTokens": 0,
                                  "cacheCreationInputTokens": 0},
        }, self.pricing)
        self.assertAlmostEqual(out["currency_totals"]["CNY"], 3.0)
        self.assertAlmostEqual(out["currency_totals"]["USD"], 6.0)
        self.assertEqual(list(out["per_model"]),
                         ["claude-sonnet-5", "deepseek-v4-flash"])

    def test_unknown_model_unpriced_all_four_types(self):
        out = claude_session_cost({
            "<synthetic>": {"inputTokens": 1000, "outputTokens": 40,
                            "cacheReadInputTokens": 10,
                            "cacheCreationInputTokens": 5},
        }, self.pricing)
        self.assertEqual(len(out["per_model"]), 0)
        self.assertEqual(out["unpriced_tokens"], 1055)
        self.assertEqual(out["currency_totals"]["CNY"], 0.0)
        self.assertEqual(out["currency_totals"]["USD"], 0.0)

    def test_none_when_no_usage(self):
        self.assertIsNone(claude_session_cost({}, self.pricing))
        self.assertIsNone(claude_session_cost(None, self.pricing))

    def test_day_and_session_costs_agree(self):
        """日面与 cost-state 面对同一批 token 必须报同一个数（同一个
        _price_claude_map，只差键名转换）。"""
        day = {"by_model": {"claude-sonnet-5": {
            "input_tokens": 2000000, "cache_read_input_tokens": 1000000,
            "cache_creation_input_tokens": 0, "output_tokens": 100000}}}
        sess = {"claude-sonnet-5": {
            "inputTokens": 2000000, "cacheReadInputTokens": 1000000,
            "cacheCreationInputTokens": 0, "outputTokens": 100000}}
        self.assertEqual(claude_day_cost(day, self.pricing),
                         claude_session_cost(sess, self.pricing))

    def test_day_cost_none_without_by_model(self):
        self.assertIsNone(claude_day_cost({}, self.pricing))
        self.assertIsNone(claude_day_cost({"by_model": {}}, self.pricing))


class PricingJsonShapeCase(unittest.TestCase):
    """价表形状是引擎的输入契约——结构漂移要在钉测里炸，不能在真机上静默
    算出 0（2026-09-02 P4.5 RolloutItem schema-drift sentinel 同款纪律）。"""

    def setUp(self):
        with (ROOT / "scripts" / "agent_vitals" / "pricing.json").open(
                encoding="utf-8") as f:
            self.pricing = json.load(f)

    def test_catalog_cards_flat_or_tiered(self):
        cat = self.pricing["catalog_2026_09"]["providers"]
        for provider, pv in cat.items():
            self.assertIn("currency", pv, provider)
            for model, card in pv["models"].items():
                if "tiers" in card:
                    for tier in card["tiers"]:
                        for k in ("input_uncached", "input_cached", "output"):
                            self.assertIsInstance(tier[k], (int, float),
                                                  f"{provider}/{model} tier")
                else:
                    for k in ("input_uncached", "input_cached", "output"):
                        self.assertIsInstance(card[k], (int, float),
                                              f"{provider}/{model}")


if __name__ == "__main__":
    unittest.main()
