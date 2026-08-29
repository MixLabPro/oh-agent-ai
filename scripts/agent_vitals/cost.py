"""CLI 显示层的成本块 —— 把 usage 报告变成人读的费用行。

纯展示层，不做任何折叠（折叠在 `usage.py`，`peak_*` 子桶已经按每笔请求自己
的 time 精确标出高峰时段）：这里只把 `{by_model, sequence}` × 价格表
（`pricing.json`）变成一组字符串，off-peak 份额（全量 − peak）按空闲价、
peak 份额按高峰价，加总成一个真实发生的费用——不再是「给空闲价和高峰价两个
数，猜不出实际该按哪个算」的区间估算。与 `src/cost.rs` 逐字节一致，由
`tests/test_cli_matrix.py` 的 `both()` 差分看守。

价格表的单一真相源是 `scripts/agent_vitals/pricing.json`（Rust 侧用
`include_str!` 内嵌、本模块读包内文件；`dsh-client/client.js` 因浏览器限制
内嵌自己的 PRICING，lockstep 测试对齐）。缓存写入报价表没有行 → 按 0 计
（不臆造价格）。高峰时段为北京时间**周一至周五** 9–12、14–18 点，周末全天
空闲；空闲价 = 高峰价的一半。
"""
import json
from pathlib import Path

from .usage import AMBIGUOUS_PROVIDER

_PRICING_PATH = Path(__file__).parent / "pricing.json"


def load_pricing():
    with open(_PRICING_PATH, encoding="utf-8") as f:
        return json.load(f)


def _strip_zero(x):
    """`f"{x:.1f}"` 去掉尾随 `.0`（226.4 保持，226.0 → 226）。"""
    s = f"{x:.1f}"
    return s[:-2] if s.endswith(".0") else s


def format_number(n):
    """token 数 → 人类可读：226423948 → 226.4M。与 tab 的 formatNumber 同 spec。"""
    if n >= 1_000_000_000:
        return _strip_zero(n / 1e9) + "B"
    if n >= 1_000_000:
        return _strip_zero(n / 1e6) + "M"
    if n >= 1_000:
        return _strip_zero(n / 1e3) + "K"
    return str(int(n))


def format_money(x):
    """金额 → `¥774.7` / `¥22.4` / `¥6.73`。≥100 一位小数否则两位，去尾零。"""
    s = f"{x:.1f}" if x >= 100 else f"{x:.2f}"
    s = s.rstrip("0").rstrip(".")
    return "¥" + s


def _models_of(pricing, provider):
    """某个供应商的模型表；找不到该供应商返回 None。"""
    p = (pricing.get("providers") or {}).get(provider)
    return (p or {}).get("models")


def _norm_model_in(model, cards):
    """`deepseek/deepseek-v4-pro-0813` → 价格卡键 `deepseek-v4-pro`，在**指定
    供应商的表里**匹配；匹配不上返回 None（不臆造）。"""
    seg = str(model).split("/")[-1]
    for key in cards:
        if seg == key or seg.startswith(key):
            return key
    return None


def _resolve_card(model, provider, pricing):
    """解析 (供应商, 模型) 实际适用的价格卡 → (模型键, 供应商键, 依据) 或 None。

    顺序：该供应商自己的表 → 回落 fallback_provider（原厂）的同名模型 → 都没有
    才算未计价。**回落是有意的默认行为**：供应商没报价时给一个标注了来源的
    估算，比什么都不给有用；但依据（"fallback"）必须一路传到展示层，由它写明
    「按原厂报价估算」，否则就是拿别家的价冒充实价。
    """
    # 归属不明：哨兵不是真实供应商名，查不到它的表，会一路掉到回落分支。
    # 单独认出来是为了让展示层说对话——也顺带保证这个内部哨兵**永远不会**被
    # 当成供应商名渲染给用户看。
    ambiguous = provider == AMBIGUOUS_PROVIDER
    if provider and not ambiguous:
        cards = _models_of(pricing, provider)
        if cards:
            key = _norm_model_in(model, cards)
            if key is not None:
                return key, provider, "provider"
    fb = pricing.get("fallback_provider")
    if not fb:
        return None
    cards = _models_of(pricing, fb)
    if not cards:
        return None
    key = _norm_model_in(model, cards)
    if key is None:
        return None
    return key, fb, ("ambiguous" if ambiguous else "fallback")


def model_short(model, pricing):
    fb = pricing.get("fallback_provider")
    cards = _models_of(pricing, fb) if fb else None
    if cards:
        key = _norm_model_in(model, cards)
        if key:
            return key
    return str(model).split("/")[-1][:24]


def _price(buckets, model_key, provider_key, pricing):
    """一个模型桶 → (真实总价, 其中高峰份额的价, 其中缓存命中单独的价)。把
    每种 token 类型拆成高峰份额（peak_*）和空闲份额（全量 − peak_*），各按
    各自单价计价再相加——不是「全量按空闲价」和「全量按高峰价」两个假设性
    区间。`cache_read_cost` 不是另一个独立的桶，是已经算进 total 里那部分
    缓存命中花的钱——单独留出来是为了回答「缓存命中帮我省了多少钱」，
    total 一个数字本身看不出这个切面。"""
    card = pricing["providers"][provider_key]["models"][model_key]
    u_peak = buckets.get("peak_uncached_input_tokens", 0) / 1e6
    c_peak = buckets.get("peak_cache_read_tokens", 0) / 1e6
    o_peak = buckets.get("peak_output_tokens", 0) / 1e6
    u_off = buckets["uncached_input_tokens"] / 1e6 - u_peak
    c_off = buckets["cache_read_tokens"] / 1e6 - c_peak
    o_off = buckets["output_tokens"] / 1e6 - o_peak
    cache_read_cost = (c_off * card["input_cached"]["off_peak"]
                        + c_peak * card["input_cached"]["peak"])
    off = (u_off * card["input_uncached"]["off_peak"]
           + c_off * card["input_cached"]["off_peak"]
           + o_off * card["output"]["off_peak"])
    peak = (u_peak * card["input_uncached"]["peak"]
            + c_peak * card["input_cached"]["peak"]
            + o_peak * card["output"]["peak"])
    return {"total": off + peak, "peak": peak, "cache_read_cost": cache_read_cost}


def fallback_price(buckets, pricing):
    """给一份**没有模型归属**的原始 8 桶按 fallback 模型估个价——`cost_report`
    需要知道"这些 token 是哪个模型"，这里是它唯一的退路，不是另一条计价规则。

    只服务 `cli.py::_augment_calendar_cost` 的"日历某天 by_model 覆盖不全"
    分支（见该函数文档），不在 `src/cost.rs` 的 lockstep/差分范围内——
    `calendar` 从来不是 Rust 二进制的子命令，没有 `test_cli_matrix.py` 会
    校验一份 Rust 镜像。calendar.html 的 JS 端已经有一份同语义的硬编码
    近似（`PRICE` 表），这里是它在 Python 侧、直接从 `pricing.json` 读数的
    对应实现，两者近似逻辑一致但不是同一份代码——JS 没有服务端 fetch 能力
    读不到 pricing.json，这是已知、记录在案的限制（见 calendar.html 头部
    注释），不是这里要解决的问题。
    """
    fb_provider = pricing.get("fallback_provider")
    return _price(buckets, "deepseek-v4-flash", fb_provider, pricing)


DAY_BUCKET_FIELDS = (
    "uncached_input_tokens", "output_tokens",
    "cache_read_tokens", "cache_write_tokens",
    "peak_uncached_input_tokens", "peak_output_tokens",
    "peak_cache_read_tokens", "peak_cache_write_tokens",
)


def _sum_by_model(by_model):
    """`by_model` 里每个模型的 8 桶按字段相加，折成一份跟 day/today 顶层
    同形状的 8 桶——用来跟顶层的「真实总量」对账覆盖率。"""
    total = {f: 0 for f in DAY_BUCKET_FIELDS}
    for buckets in by_model.values():
        for f in DAY_BUCKET_FIELDS:
            total[f] += buckets.get(f, 0) or 0
    return total


def priced_day(day, pricing):
    """一份「日桶」（`state.py` month.json/today.json 里那种 8 基础字段 +
    可选 `by_model`）→ `{total, peak_total, pricing_basis, coverage}`，或
    `None`（没有 by_model——调用方自己决定退回哪种近似）。

    **唯一的覆盖率校验入口**——`cli.py` 的日历、`budget.py` 的
    month/7d-average 三处过去各写一份「有没有 by_model 就……」，日历那份
    修过覆盖率之后，budget.py 那两份还在裸用 `by_model`，同一份
    `month.json` 因此在两个投影上报出不同的钱（¥4.50 vs ¥18.00）。三处
    都改调这一个函数，覆盖率的判断只写一次，不会有第四个地方重新引入
    同一个 bug。

    **必须校验覆盖率，不能只看「有没有 by_model」**（真实回归：8 月账目
    一度因为从不校验覆盖率，把只覆盖当天 0.7%~32.5% token 的 by_model
    当成"精算"直接报出去，剩下 67%~99% 的 token 静默消失）。做法：把
    `by_model` 折成跟 `day` 同形状的一份总量，与 `day` 做减法算出"没有
    模型归属的剩余 token"——不是 0 就说明这一天的 `by_model` 只覆盖了
    部分时段（例如一个跨零点的会话只把某一天的切片记了下来），剩余部分
    按 `fallback_price` 补齐，标 `pricing_basis: "partial"`，不假装是
    `"exact"`。
    """
    by_model = day.get("by_model") or {}
    if not by_model:
        return None
    report = cost_report({"by_model": by_model}, pricing)
    if report is None:
        return None
    covered = _sum_by_model(by_model)
    day_total = sum(day.get(f, 0) or 0 for f in DAY_BUCKET_FIELDS)
    covered_total = sum(covered.values())
    remainder_total = max(0, day_total - covered_total)
    if remainder_total == 0:
        return {
            "total": report["total"],
            "peak_total": report["peak_total"],
            "pricing_basis": "exact",
            "coverage": 1.0,
        }
    remainder = {
        f: max(0, (day.get(f, 0) or 0) - covered[f])
        for f in DAY_BUCKET_FIELDS
    }
    top_up = fallback_price(remainder, pricing)
    return {
        "total": report["total"] + top_up["total"],
        "peak_total": report["peak_total"] + top_up["peak"],
        "pricing_basis": "partial",
        # day_total 为 0 时 remainder_total 必是 0，已被上面的分支短路——
        # 到这里 day_total 必然 > 0，除法安全。
        "coverage": covered_total / day_total,
    }


def cost_report(usage, pricing):
    """usage 报告 × 价格表 → 结构化成本数据。**这是唯一算价格的地方**——
    `cost_block`（人读文本）与 `--json` 的 `cost` 键都从这里取数，不是两处
    各算一遍再凑成两种格式。之前 `cost` 完全没有 JSON 出口：想拿这份数字只能
    手写脚本重新调 `_price`/`load_pricing`，算一次就要重新验证一次是否用对了
    价格表——现在报告数据里的 `cost` 字段和人读文本走的是同一次计算。

    无任何可分桶的桶且没有未计价 token 时返回 None（与 `cost_block` 的空列表
    同一语义：没有数据就是没有，不摆一个全零的结构出来）。金额是未四舍五入的
    原始浮点——舍入是格式化文本时才做的展示决定，结构化数据不预先舍。

    Rust 平行实现见 `src/cost.rs::cost_report`。
    """
    by_model = (usage or {}).get("by_model") or {}
    if not by_model:
        return None
    providers = (usage or {}).get("providers")
    total = 0.0
    peak_total = 0.0
    unpriced = 0
    per_model = {}
    for model, buckets in by_model.items():
        # 价目表**按供应商分层**，不是按模型名一张表打天下。真实日志里
        # provider=shengsuanyun 的 pro 和 provider=deepseek-official 的 flash
        # 并存，两家报价不同（胜算云 DeepSeek 线路缓存读 0.15、Ali 线路 0.45）。
        #
        # 解析顺序见 _resolve_card：该供应商自己的表 → 回落原厂 → 未计价。
        # **回落是有意的默认**：供应商没报价时给一个标注了来源的估算，比什么
        # 都不给有用；但依据必须一路传到展示层写明「按原厂报价估算」。
        #
        # provider 为 None（老日志没上报）时自然回落到原厂——与既有行为一致。
        provider = (providers or {}).get(model)
        if not isinstance(provider, str):
            provider = None
        resolved = _resolve_card(model, provider, pricing)
        if resolved is None:
            unpriced += (buckets["uncached_input_tokens"]
                         + buckets["cache_read_tokens"]
                         + buckets["cache_write_tokens"])
            continue
        key, provider_key, basis = resolved
        p = _price(buckets, key, provider_key, pricing)
        total += p["total"]
        peak_total += p["peak"]
        per_model[model] = {
            "short_name": model_short(model, pricing),
            # 供应商随每一行一起给出：同一会话可能横跨两家，只给模型名的话
            # 这张表跟任何一家的账单都对不上。
            # 归属不明时 provider 落 None——AMBIGUOUS_PROVIDER 是内部哨兵，
            # 绝不能作为供应商名渲染给用户看。
            "provider": None if basis == "ambiguous" else provider,
            # 这一行是按谁的报价算的。fallback 时展示层必须说明。
            "pricing_basis": basis,
            "priced_with": provider_key,
            "total": p["total"],
            "peak": p["peak"],
            "cache_read_cost": p["cache_read_cost"],
        }
    if not per_model and unpriced == 0:
        return None
    return {
        "currency": "CNY",
        "estimate_disclaimer": "估算值，不是账单",
        "total": total,
        "peak_total": peak_total,
        "per_model": per_model,
        "unpriced_tokens": unpriced,
    }


def cost_block(usage, pricing):
    """usage 报告 → 成本行列表；无任何可分桶的桶时返回空列表（与 tab 空态同构，
    不打印假的 ¥0 行）。纯格式化——数字来自 cost_report，这里不重算。"""
    report = cost_report(usage, pricing)
    if report is None:
        return []
    total = report["total"]
    peak_total = report["peak_total"]
    unpriced = report["unpriced_tokens"]
    per_model_map = report["per_model"]

    seq = (usage or {}).get("sequence") or []
    line = "费用（估算）≈ " + format_money(total)
    if peak_total > 0:
        line += "（其中高峰时段 " + format_money(peak_total) + "）"
    if len(seq) == 1:
        line += " · " + model_short(seq[0], pricing)
    elif len(seq) > 1:
        line += " · 中途切换模型（" + " → ".join(model_short(m, pricing) for m in seq) + "）"
    rows = [line]
    # per_model 的展示顺序跟 by_model 的原始遍历顺序一致（dict 保留插入序）。
    if len(per_model_map) > 1:
        for model in (usage or {}).get("by_model") or {}:
            entry = per_model_map.get(model)
            if entry is not None:
                rows.append("  " + entry["short_name"] + "  " + format_money(entry["total"]))
    if unpriced > 0:
        rows.append("另有 " + format_number(unpriced) + " tokens 模型未知未计价")
    return rows
