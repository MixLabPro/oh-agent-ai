"""Codex 成本折叠的 Python 平行实现。

单一真相源是 `crates/skill-vitals-core/src/codex_usage.rs`——那里有一份完整的中文
注释讲**正确性铁律**（为什么读 `last_token_usage` 不读累计、为什么 `uncached` 是派生
字段、为什么连续去重必须做、为什么 model 是游标）。这一份是它的逐字节镜像，由
`tests/test_cli_matrix.py::both("codex-cost", ...)` 差分看守：Py↔Rust 的 `--json` 输出
必须一字不差。

与 DSH `usage.py::token_by_model` 的区别（为什么不能复用）：DSH 的 4 桶 +
peak/off-peak 按模型分桶，Codex 是 5 桶 + speed 分桶 + 按 `total_token_usage` 签名
去重——线格式与计价维度都不同。这里是独立折叠，不是给成本引擎套壳。
"""

CODEX_TOKEN_FIELDS = [
    "uncached_input_tokens",
    "output_tokens",
    "cached_input_tokens",
    "cache_write_input_tokens",
    "reasoning_output_tokens",
]

_TOTAL_SIG_FIELDS = (
    "input_tokens",
    "output_tokens",
    "cached_input_tokens",
    "cache_write_input_tokens",
    "reasoning_output_tokens",
    "total_tokens",
)


def codex_token_facts(last):
    """`last_token_usage` → 5 桶 `[uncached, output, cached, cache_write, reasoning]`。

    `None` = 无效（缺 input/output、`uncached < 0`、`reasoning > output`）——交给
    调用方进残差哨兵，绝不把假数字折进桶。`uncached = input - cached - cache_write`
    是**派生**字段；reasoning 已计入 output（`output >= reasoning`），绝不叠加。
    """
    if not isinstance(last, dict):
        return None
    input_t = last.get("input_tokens")
    output = last.get("output_tokens")
    if not isinstance(input_t, int) or isinstance(input_t, bool):
        return None
    if not isinstance(output, int) or isinstance(output, bool):
        return None
    cached = last.get("cached_input_tokens")
    cache_write = last.get("cache_write_input_tokens")
    reasoning = last.get("reasoning_output_tokens")
    if not isinstance(cached, int) or isinstance(cached, bool):
        cached = 0
    if not isinstance(cache_write, int) or isinstance(cache_write, bool):
        cache_write = 0
    if not isinstance(reasoning, int) or isinstance(reasoning, bool):
        reasoning = 0
    uncached = input_t - cached - cache_write
    if uncached < 0 or reasoning > output:
        return None
    return (uncached, output, cached, cache_write, reasoning)


def _total_signature(total):
    """`total_token_usage` 的 6 字段签名（去重键）。缺任一字段 → None（这种 total
    没法判定「同一计量复读」，就不去重，交给下游的 last 校验兜底）。"""
    if not isinstance(total, dict):
        return None
    parts = []
    for f in _TOTAL_SIG_FIELDS:
        v = total.get(f)
        if not isinstance(v, int) or isinstance(v, bool):
            return None
        parts.append(v)
    return tuple(parts)


def codex_date_of(event):
    """事件时间戳 → `YYYY-MM-DD` 前缀。顶层 `timestamp` 回退 `payload.timestamp`；
    不是 `YYYY-MM-DD` 开头 → None（未知时间，不编造日期）。"""
    ts = event.get("timestamp")
    if not isinstance(ts, str):
        payload = event.get("payload")
        if isinstance(payload, dict):
            ts = payload.get("timestamp")
    if not isinstance(ts, str) or len(ts) < 10:
        return None
    date, _, _ = ts[:10].partition("-")
    # YYYY-MM-DD 结构校验（与 Rust 侧 `codex_date_of` 同一条判定）。
    if not (date.isdigit() and ts[4] == "-" and ts[7] == "-"):
        return None
    return ts[:10]


def normalize_speed(tier):
    """`default|standard → standard`、`fast|priority → fast`，其余 → None（未知档位
    不猜，保持当前 speed——不是把未知档位静默降级成 standard）。"""
    if tier in ("default", "standard"):
        return "standard"
    if tier in ("fast", "priority"):
        return "fast"
    return None


def speed_from_payload(payload):
    """`payload.service_tier` 优先，回退 `thread_settings/service_tier`。"""
    if not isinstance(payload, dict):
        return None
    tier = payload.get("service_tier")
    if isinstance(tier, str):
        s = normalize_speed(tier)
        if s is not None:
            return s
    thread = payload.get("thread_settings")
    if isinstance(thread, dict):
        tier = thread.get("service_tier")
        if isinstance(tier, str):
            return normalize_speed(tier)
    return None


def _add_bucket(map_, model, speed, facts):
    """把 5 桶折进 `map_[model][speed]`。桶对象存在则按位累加，不存在则按
    `CODEX_TOKEN_FIELDS` 的桶序新建（键序是字节一致的一部分，不能重排）。"""
    speed_map = map_.setdefault(model, {})
    bucket = speed_map.get(speed)
    if bucket is None:
        bucket = {f: 0 for f in CODEX_TOKEN_FIELDS}
        speed_map[speed] = bucket
    for field, n in zip(CODEX_TOKEN_FIELDS, facts):
        bucket[field] += n


def _bucket_to_array(bucket):
    return tuple(bucket.get(f, 0) for f in CODEX_TOKEN_FIELDS)


def _bump_unaccounted(unaccounted, ttype, total_tokens):
    entry = unaccounted.setdefault(ttype, {"count": 0, "tokens_seen": 0})
    entry["count"] += 1
    entry["tokens_seen"] += total_tokens


def codex_fold_file(events):
    """单文件有序折叠：一份 rollout 的原始条目流 → `{by_date_model, by_model,
    unaccounted}`。纯函数，不碰文件系统——I/O 在适配器层。

    输出顺序：日期升序、模型/速度按首现序、`unaccounted` 按 type 名升序。这些
    顺序是字节一致的一部分（Rust 侧 BTreeMap 排序、serde_json Map 插入序对齐）。
    """
    model = None
    speed = "standard"
    last_total_sig = None
    by_date_model = {}
    by_model = {}
    unaccounted = {}

    for event in events:
        if not isinstance(event, dict):
            continue
        etype = event.get("type")
        if etype == "turn_context":
            payload = event.get("payload")
            if isinstance(payload, dict):
                m = payload.get("model")
                if isinstance(m, str):
                    model = m
                s = speed_from_payload(payload)
                if s is not None:
                    speed = s
        elif etype == "event_msg":
            payload = event.get("payload")
            if not isinstance(payload, dict):
                continue
            ptype = payload.get("type")
            if ptype == "thread_settings_applied":
                s = speed_from_payload(payload)
                if s is not None:
                    speed = s
            elif ptype == "token_count":
                info = payload.get("info")
                if not isinstance(info, dict):
                    continue
                total = info.get("total_token_usage")
                # 去重：同一计量复读（total 签名不变）→ 跳过。累计总量单调不减，
                # 连续去重 = 完全去重（实测 366 处重复签名都是连续成对）。
                if isinstance(total, dict):
                    sig = _total_signature(total)
                    if sig is not None:
                        if last_total_sig == sig:
                            continue
                        last_total_sig = sig
                total_tokens = 0
                if isinstance(total, dict):
                    tt = total.get("total_tokens")
                    if isinstance(tt, int) and not isinstance(tt, bool):
                        total_tokens = tt
                facts = codex_token_facts(info.get("last_token_usage"))
                if facts is None:
                    _bump_unaccounted(unaccounted, "token_count_invalid_last_usage",
                                      total_tokens)
                    continue
                if model is None:
                    # 首个 turn_context 之前：看见了 token、没模型可归。
                    _bump_unaccounted(unaccounted, "token_count_before_turn_context",
                                      total_tokens)
                    continue
                date = codex_date_of(event)
                if date is not None:
                    _add_bucket(by_date_model.setdefault(date, {}), model, speed, facts)
                _add_bucket(by_model, model, speed, facts)

    # 日期升序：与 Rust 侧 BTreeMap 对齐（单文件里本是时间序，但排序保证任意
    # 输入顺序下两侧仍逐字节一致）。
    by_date_out = {}
    for d in sorted(by_date_model):
        by_date_out[d] = by_date_model[d]
    unaccounted_out = [
        {"type": t, "count": v["count"], "tokens_seen": v["tokens_seen"]}
        for t, v in sorted(unaccounted.items())
    ]
    return {"by_date_model": by_date_out, "by_model": by_model,
            "unaccounted": unaccounted_out}


def codex_merge_folds(folds):
    """跨文件合并：多个 `codex_fold_file` 的结果逐桶求和。纯函数。

    顺序确定性（字节一致的一部分）：日期**全局升序**（先收集全部日期排序，再按序
    遍历——跨文件时插入序不可靠）；每个日期内的模型、速度按**跨文件首现序**（按
    folds 顺序）。`by_model` 按 folds 顺序。`unaccounted` 按 type 名升序求和。
    """
    all_dates = set()
    for fold in folds:
        bd = fold.get("by_date_model")
        if isinstance(bd, dict):
            all_dates.update(bd.keys())

    by_date_out = {}
    for d in sorted(all_dates):
        date_map = {}
        for fold in folds:
            bd = fold.get("by_date_model")
            if not isinstance(bd, dict):
                continue
            models = bd.get(d)
            if not isinstance(models, dict):
                continue
            for m, speeds in models.items():
                if not isinstance(speeds, dict):
                    continue
                for spd, bucket in speeds.items():
                    _add_bucket(date_map, m, spd, _bucket_to_array(bucket))
        by_date_out[d] = date_map

    by_model = {}
    for fold in folds:
        bm = fold.get("by_model")
        if not isinstance(bm, dict):
            continue
        for m, speeds in bm.items():
            if not isinstance(speeds, dict):
                continue
            for spd, bucket in speeds.items():
                _add_bucket(by_model, m, spd, _bucket_to_array(bucket))

    unaccounted = {}
    for fold in folds:
        ua = fold.get("unaccounted")
        if not isinstance(ua, list):
            continue
        for e in ua:
            if not isinstance(e, dict):
                continue
            t = e.get("type")
            if not isinstance(t, str):
                t = ""
            c = e.get("count")
            s = e.get("tokens_seen")
            entry = unaccounted.setdefault(t, {"count": 0, "tokens_seen": 0})
            entry["count"] += c if isinstance(c, int) and not isinstance(c, bool) else 0
            entry["tokens_seen"] += s if isinstance(s, int) and not isinstance(s, bool) else 0

    unaccounted_out = [
        {"type": t, "count": v["count"], "tokens_seen": v["tokens_seen"]}
        for t, v in sorted(unaccounted.items())
    ]
    return {"by_date_model": by_date_out, "by_model": by_model,
            "unaccounted": unaccounted_out}


def codex_by_model_from_dates(by_date_model):
    """日期轴投影 → 模型轴投影：`by_date_model`（{date:{model:{speed:桶}}}）逐桶
    求和折回 `by_model`（{model:{speed:桶}}）。模型/速度按**跨日期首现序**（日期
    已升序，逐日期插入即首现序），与 `codex_fold_file` 的模型轴同一约定。

    踩过的坑：`codex-cost --month` 过滤日期轴后，by_model 必须**重算**——过滤掉了
    哪些日期，模型轴就必须同样丢掉那些 token，否则 per_model 里残留被过滤日期的
    用量，days 与 per_model 对不上（守恒测试红）。一开始想当然拿 `codex_merge_folds`
    把过滤后的 by_date_model "折回去"，但 merge 的 by_model **只读各 fold 的
    `by_model` 字段**、从不读 by_date_model，传 `{"by_model": {}}` 得到的是空模型轴
    ——整份月报告静默变全零（per_model 空 + unpriced 0 → 返回 None → 全零兜底），
    一个「看不见的错」。重算不是新数据：`by_model == Σ 各日期桶`（同一折叠的两投影，
    usage.rs 日期轴守恒同款纪律），无日期样本没有日期桶、被月份过滤按设计丢弃。
    """
    out = {}
    if not isinstance(by_date_model, dict):
        return out
    for _date, date_map in by_date_model.items():
        if not isinstance(date_map, dict):
            continue
        for m, speeds in date_map.items():
            if not isinstance(speeds, dict):
                continue
            for spd, bucket in speeds.items():
                _add_bucket(out, m, spd, _bucket_to_array(bucket))
    return out
