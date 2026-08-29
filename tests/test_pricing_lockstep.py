# 价格表单源锁步测试：CLI 用 `scripts/agent_vitals/pricing.json`（单一真相源）。
# dsh-client 现在有两份派生副本，理由不同：
#   - `src/client/styles/index.ts` 的 PRICING —— 浏览器读不到 repo 文件，只能
#     内嵌一份，供**展示层**用（模型短名查找）。逐值人工转录，值必须一致。
#   - `dsh-client/pricing.json` —— 宿主是 Node，跟 CLI 一样能读文件，这份
#     是 build 时从源文件**直接复制**（不是转录）过去的运行时资产，宿主的
#     costReport 投影拿它算钱（host/index.ts::costReportFrom）。既是复制，
#     理论上不该漂移，但复制这个动作本身可能被忘记执行——这条测试钉的正是
#     "改了 pricing.json 却忘了重新复制" 这类疏漏，跟 PRICING 转录漂移是
#     同一类缺陷的两种成因。
#
# 两份 PRICING 提取都要——src/client/styles/index.ts 用 node 求值（对象字面量
# 本身是合法 JS）；dsh-client/pricing.json 是纯 JSON，直接 json.load。盯的是
# **签入的源**，不是构建产物：tsup 迁移（9efaafb）把手写的 `dsh-client/client.js`
# 换成了 `lib/client.cjs`，而 `lib/` 在 .gitignore 里。这条测试当时仍指着已删除
# 的 client.js，`readFileSync` 抛异常、`check=True` 把它变成 ERROR——**价格表
# 护栏从那次迁移起就静默死了**，直到 2026-08-20 的体验评审跑全量测试才发现。
# 改指构建产物会让 Python 套件依赖先跑 npm build；源文件既签入又是那份内嵌
# 副本的唯一来源，是正确的靶子。
#
# 提取 client.js 的 PRICING 用 node 求值；node 不在环境里时跳过整个 class
# （CI 的 ubuntu 自带 node，本地通常也有）——`dsh-client/pricing.json` 是
# 纯 JSON，不需要 node，单独一个不带 skip 装饰器的 class 覆盖它。

import json
import shutil
import subprocess
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PRICING_JSON = REPO / "scripts" / "agent_vitals" / "pricing.json"
CLIENT_JS = REPO / "dsh-client" / "src" / "client" / "styles" / "index.ts"
HOST_PRICING_JSON = REPO / "dsh-client" / "pricing.json"

_has_node = shutil.which("node") is not None


def _client_pricing():
    """用 node 求值 styles/index.ts 里的 `export const PRICING… = {…}` 字面量。

    路径必须用 `json.dumps` 转成合法 JS 字符串字面量，不能裸拼进单引号——
    Windows 的 `str(Path)` 是反斜杠分隔（`D:\\a\\agent-vitals\\...`），裸拼
    进 `'...'` 会被 JS 当成转义序列吃掉（`\\a`→`a`、`\\s`→`s`），把路径拼成
    读不到文件的乱码，`fs.readFileSync` 抛出未捕获异常、node 非零退出——
    这条测试在 Windows CI 上一直是这样挂的。`json.dumps` 输出的双反斜杠
    JS/JSON 都认，跨平台都对。
    """
    script = (
        "const fs=require('fs');"
        f"const src=fs.readFileSync({json.dumps(str(CLIENT_JS))},'utf8');"
        # TS 声明带类型注解（`export const PRICING: Record<…> = {`），所以从
        # `=` 之后抓字面量；结束锚点是行首的 `}`（该常量的字面量不缩进收尾）。
        "const m=src.match(/export const PRICING[^=]*=\\s*(\\{[\\s\\S]*?\\n\\})\\n/);"
        "if(!m){console.error('PRICING literal not found');process.exit(1)}"
        "const PRICING=eval('('+m[1]+')');"
        "console.log(JSON.stringify(PRICING));"
    )
    out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


@unittest.skipUnless(_has_node, "node not available — cannot evaluate client.js PRICING")
class PricingLockstepTests(unittest.TestCase):
    def test_client_pricing_matches_pricing_json(self):
        pricing = json.loads(PRICING_JSON.read_text(encoding="utf-8"))
        client = _client_pricing()
        # 价目表改成按供应商分层后，styles/index.ts 那份**展示用**副本对应的是
        # 回落供应商（原厂）的模型集合——它只用来查模型短名，不参与算钱，所以
        # 不需要镜像每一家供应商的表。
        fb = pricing["fallback_provider"]
        cards = pricing["providers"][fb]["models"]

        # client.js PRICING 的形状：{model: {inputUncached, inputCached, output}, ...}
        self.assertEqual(set(client.keys()), set(cards.keys()),
                         "client.js 与 pricing.json 的模型卡集合不一致")
        for model in cards:
            # (pricing.json 键, client.js 键) —— 键名不同，值必须一致
            for src_key, dst_key in (
                ("input_uncached", "inputUncached"),
                ("input_cached", "inputCached"),
                ("output", "output"),
            ):
                # pricing.json 用 off_peak/peak，client.js 用 off/peak（同名不同前缀）
                for json_tariff, client_tariff in (("off_peak", "off"), ("peak", "peak")):
                    self.assertEqual(
                        client[model][dst_key][client_tariff],
                        cards[model][src_key][json_tariff],
                        f"{model}.{dst_key}.{json_tariff} 不一致：pricing.json="
                        f"{cards[model][src_key][json_tariff]} client.js={client[model][dst_key][client_tariff]}",
                    )

    def test_cache_write_is_zero(self):
        # 报价表没有缓存写入行 → 两处都按 0 计（注释标注假设）
        pricing = json.loads(PRICING_JSON.read_text(encoding="utf-8"))
        self.assertEqual(pricing["cache_write_per_million"], 0)


class HostPricingCopyLockstepTests(unittest.TestCase):
    """dsh-client/pricing.json 是 pricing.json 的运行时副本（宿主 costReport
    投影读它算钱），应该逐字节相同——不需要 node，任何环境都跑。"""

    def test_host_copy_matches_source_byte_for_byte(self):
        if not HOST_PRICING_JSON.exists():
            self.fail("dsh-client/pricing.json 缺失——运行时副本没有从 "
                      "scripts/agent_vitals/pricing.json 复制过去，host/index.ts "
                      "的 costReport 投影会在 readFileSync 处直接崩")
        self.assertEqual(
            HOST_PRICING_JSON.read_bytes(), PRICING_JSON.read_bytes(),
            "dsh-client/pricing.json 与 scripts/agent_vitals/pricing.json 内容不同——"
            "改了价目表后忘了重新复制到 dsh-client/，宿主的 costReport 会算出旧价钱")


if __name__ == "__main__":
    unittest.main()
