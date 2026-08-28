"""Codex 成本计价的 Python 平行实现。

单一真相源是 `src/codex_cost.rs`——那里有一份完整的中文注释讲**计价铁律**
（为什么 cache_write 全进 5m 档、为什么 speed 是 catalog 独立行而不是乘数、
为什么 longContextPriced:false 不触发乘数、为什么最长前缀匹配）。这一份是它的
逐字节镜像，由 `tests/test_cli_matrix.py::both("codex-cost", ...)` 差分看守。

与 `cost.py` 的关系：`cost.py` 是 DSH（¥、peak/off-peak、provider 分层）的计价；
本模块是 Codex（USD、5 桶、speed 行、longContext），**不是**给 DSH 的成本引擎
套 Codex 壳。价格表 `codex_pricing.json` 独立于 `pricing.json`。
"""
import json
from pathlib import Path

from .codex_usage import CODEX_TOKEN_FIELDS

_CODEX_PRICING_PATH = Path(__file__).parent / "codex_pricing.json"


def load_codex_pricing():
    with open(_CODEX_PRICING_PATH, encoding="utf-8") as f:
        return json.load(f)


def _strip_zero(x):
    """`f"{x:.1f}"` 去掉尾随 `.0`（226.4 保持，226.0 → 226）。"""
    s = f"{x:.1f}"
    return s[:-2] if s.endswith(".0") else s


def format_number(n):
    """token 数 → 人类可读：226423948 → 226.4M。与 cost.py::format_number 同 spec。"""
    if n >= 1_000_000_000:
        return _strip_zero(n / 1e9) + "B"
    if n >= 1_000_000:
        return _strip_zero(n / 1e6) + "M"
    if n >= 1_000:
        return _strip_zero(n / 1e3) + "K"
    return str(int(n))


def format_usd(x):
    """金额 → `$12.34` / `$123.4`。≥100 一位小数否则两位，去尾零。与
    cost.py::format_money 同一 spec，前缀换成 `$`（USD）。"""
    s = f"{x:.1f}" if x >= 100 else f"{x:.2f}"
    s = s.rstrip("0").rstrip(".")
    return "$" + s


def _rate(entry, key):
    """价格表条目里的金额是**字符串**（cc-trace 原样，避免浮点漂移），解析成 float。"""
    v = entry.get(key)
    try:
        return float(v) if isinstance(v, str) else 0.0
    except (TypeError, ValueError):
        return 0.0


def _resolve_entry(model, speed, entries):
    """`(model, speed)` → 价格表条目：**最长 modelPrefix 匹配**（`gpt-5.6-sol` 命中
    sol 行而非 `gpt-5.6` 泛化行）。同长度时先出现的条目赢（catalog 数组序即作者
    意图）。找不到 → None（unpriced）。"""
    best = None
    best_len = 0
    for e in entries:
        if e.get("speed") != speed:
            continue
        prefix = e.get("modelPrefix")
        if not isinstance(prefix, str):
            continue
        if len(prefix) > best_len and str(model).startswith(prefix):
            best_len = len(prefix)
            best = e
    return best


def _price_bucket(bucket, entry):
    """一个 5 桶对象 × 价格条目 → USD 费用。`reasoning` 桶存在但不参与计价——
    它已含在 `output` 里（折叠侧的校验保证 `output >= reasoning`），再乘一次就是
    双计。"""
    uncached = bucket.get("uncached_input_tokens", 0)
    cached = bucket.get("cached_input_tokens", 0)
    cache_write = bucket.get("cache_write_input_tokens", 0)
    output = bucket.get("output_tokens", 0)
    input_cost = (
        uncached * _rate(entry, "uncachedInputUsdPerMTok")
        + cached * _rate(entry, "cacheReadUsdPerMTok")
        + cache_write * _rate(entry, "cacheWrite5mUsdPerMTok")
    )
    output_cost = output * _rate(entry, "outputUsdPerMTok")
    threshold = entry.get("longContextThresholdTokens", 0)
    if not isinstance(threshold, int) or isinstance(threshold, bool):
        # 非整数 threshold（防御）：Rust 侧 as_i64 → None → 0，两侧一致。
        threshold = 0
    # `longContextPriced` 缺省 true：standard 行靠「有 threshold + 有乘数」触发；
    # fast 行显式 `false` → fast + longContext 不乘（catalog 里 fast 行都带这个
    # false，见 codex_pricing.json `_note`）。
    lc_priced = entry.get("longContextPriced", True)
    input_total = uncached + cached + cache_write
    if threshold > 0 and input_total > threshold and lc_priced is not False:
        lc_in = entry.get("longContextInputMultiplierBps", 20000) / 10000.0
        lc_out = entry.get("longContextOutputMultiplierBps", 15000) / 10000.0
        input_cost *= lc_in
        output_cost *= lc_out
    return (input_cost + output_cost) / 1e6


def _bucket_fields(bucket):
    return tuple(bucket.get(f, 0) for f in CODEX_TOKEN_FIELDS)


def _tokens_object(t):
    return dict(zip(CODEX_TOKEN_FIELDS, t))


def codex_cost_report(by_date_model, by_model, unaccounted, pricing):
    """折叠结果 × 价格表 → 结构化成本报告。**这是唯一算价格的地方**——人读文本、
    `--json`、`--html` 都从这里取数，不是三处各算一遍。

    `None` = 没有任何 token 可计价（空折叠：per_model 空、unpriced 0）。有未计价
    token 时返回 dict（total 0 + unpriced > 0 是「看见了、没价目」的诚实上报）。

    **longContext 判定粒度（踩过的坑）**：LC 阈值（272000）按**单日聚合桶**的
    `input_total` 判，**不是**按 by_model 合并后的模型总桶。一开始直接对
    by_model 的合并桶 `_price_bucket`，结果是把「每天都没超阈值」的多天小请求
    累加成一个假的大 input_total，凭空触发 LC（8 月两桶合并后 400K 触发 ×2，
    per_model $5.54 却对不上 days 之和 $5.5357，守恒测试当场红）。LC 语义是
    「这一次请求的上下文超窗」——月总量超窗不代表任何单次请求超窗，合并桶
    判 LC 是静默多收。修正：**先按 (date, model, speed) 逐桶计价**，days 轴直接
    用逐日价；per_model 轴 = 该模型各日期价之和 + **untimed 剩余**（by_model −
    Σ 各日期桶，无日期样本没有日期桶可归，单独成一个桶计价）。于是全部样本都
    带日期时 `sum(days.cost) == total_cost_usd` 精确成立（守恒测试钉死），有
    untimed 时差异恰好是 untimed 的价——两轴永远对得上，不会出现两份价格。
    """
    if not isinstance(by_model, dict):
        return None
    entries = pricing.get("entries") or []

    # ── Pass 0：日期轴计价 ──────────────────────────────────────────────
    # 同时记下每个 (model, spd) 的「有日期份额」成本与 token，供 per_model 轴
    # 求 untimed 剩余用。by_date_model 键序 = 折叠的日期升序，days 保持升序。
    dated_cost = {}    # (model, spd) -> USD 费用（只含有价目桶）
    dated_tokens = {}  # (model, spd) -> [5 桶]
    days = []
    if isinstance(by_date_model, dict):
        for date, date_map in by_date_model.items():
            if not isinstance(date_map, dict):
                continue
            cost = 0.0
            toks = 0
            for model, speeds in date_map.items():
                if not isinstance(speeds, dict):
                    continue
                for spd, bucket in speeds.items():
                    if not isinstance(bucket, dict):
                        continue
                    facts = _bucket_fields(bucket)
                    toks += sum(facts)
                    key = (model, spd)
                    dt = dated_tokens.get(key)
                    if dt is None:
                        dt = [0] * 5
                        dated_tokens[key] = dt
                    for i in range(5):
                        dt[i] += facts[i]
                    entry = _resolve_entry(model, spd, entries)
                    if entry is not None:
                        c = _price_bucket(bucket, entry)
                        cost += c
                        dated_cost[key] = dated_cost.get(key, 0.0) + c
            days.append({"date": date, "cost_usd": cost, "tokens": toks})

    # ── Pass 1：per_model / 总价 / 未计价 ──────────────────────────────
    # 遍历顺序 = 折叠的模型首现序（Python dict 插入序），与 Rust preserve_order 对齐。
    total = 0.0
    unpriced = 0
    total_tokens = [0] * 5
    per_model = {}
    for model, speeds in by_model.items():
        if not isinstance(speeds, dict):
            continue
        tokens = [0] * 5
        cost = 0.0
        all_priced = True
        speed_names = []
        for spd, bucket in speeds.items():
            if not isinstance(bucket, dict):
                continue
            facts = _bucket_fields(bucket)
            for i in range(5):
                tokens[i] += facts[i]
            entry = _resolve_entry(model, spd, entries)
            if entry is not None:
                key = (model, spd)
                dated = dated_tokens.get(key) or [0] * 5
                # untimed 剩余 = by_model − Σ 各日期桶（fold 保证逐桶 ≥，不会负）。
                untimed = [facts[i] - dated[i] for i in range(5)]
                cost += (dated_cost.get(key, 0.0)
                         + _price_bucket(_tokens_object(untimed), entry))
            else:
                # 无价目：token 进 unpriced_tokens，诚实上报——绝不按 0 价冒充。
                all_priced = False
                for i in range(5):
                    unpriced += facts[i]
            speed_names.append(spd)
        for i in range(5):
            total_tokens[i] += tokens[i]
        total += cost
        per_model[model] = {
            "tokens": _tokens_object(tokens),
            "cost_usd": cost,
            "priced": all_priced,
            # 模型名下可能挂多个 speed 子桶（真实数据只有 standard）；诚实列出
            # 全部 speed，不挑一个代表。
            "speed": ",".join(speed_names),
        }
    if not per_model and unpriced == 0:
        return None

    return {
        "total_cost_usd": total,
        "total_tokens": _tokens_object(total_tokens),
        "per_model": per_model,
        "days": days,
        "unpriced_tokens": unpriced,
        "unaccounted_usage": unaccounted if isinstance(unaccounted, list) else [],
    }


def render_codex_cost(out):
    """人读文本：host/月/币种 + 一行总费用 + 每模型一行。纯格式化——数字来自
    `codex_cost_report` + CLI 的 host/currency/month 包装（`out` 即 `--json` 输出的
    同一个 dict），这里不重算。空报告（None）由调用方处理，不打印假的 `$0` 行。
    Rust 侧 `main.rs::render_codex_cost` 逐字节对齐这一份。"""
    currency = out.get("currency", "USD")
    host = out.get("host")
    month = out.get("month")
    total = out.get("total_cost_usd", 0.0)
    unpriced = out.get("unpriced_tokens", 0)
    per_model = out.get("per_model") or {}
    tt = out.get("total_tokens") or {}

    parts = []
    if isinstance(host, str):
        parts.append(f"host: {host}\n")
    if isinstance(month, str):
        parts.append(f"month: {month}\n")
    parts.append(f"currency: {currency}\n")
    # 5 桶人读只需一个总量；分桶明细在 --json 与仪表盘里。
    all_tokens = sum(
        tt.get(f, 0) for f in CODEX_TOKEN_FIELDS
        if isinstance(tt.get(f), int) and not isinstance(tt.get(f), bool)
    )
    line = f"total cost: {format_usd(total)}"
    if all_tokens > 0:
        line += f" · total tokens: {format_number(all_tokens)}"
    parts.append(line + "\n")
    # 按折叠的模型首现序展示（per_model 的插入序即 by_model 序）。
    for model, entry in per_model.items():
        if not isinstance(entry, dict):
            continue
        cost = entry.get("cost_usd", 0.0)
        speeds = entry.get("speed", "standard")
        if entry.get("priced"):
            parts.append(f"  {model}  {format_usd(cost)}  ({speeds})\n")
        else:
            parts.append(f"  {model}  unpriced  ({speeds})\n")
    if unpriced > 0:
        parts.append(f"另有 {format_number(unpriced)} tokens 模型未计价\n")
    for e in (out.get("unaccounted_usage") or []):
        if not isinstance(e, dict):
            continue
        t = e.get("type", "?")
        c = e.get("count", 0)
        s = e.get("tokens_seen", 0)
        parts.append(f"未接住 {c} × {t}（看见 {format_number(s)} tokens）\n")
    return "".join(parts)
