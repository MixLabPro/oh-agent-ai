"""会话级成本折叠 —— 把 usage 事件按当时活跃的模型分桶。

与 behavior.py（SV601–610 风险规则）是两条正交的审计维度：风险规则输出
finding 列表，这里输出 `{"by_model": {model: 四桶}, "sequence": [模型激活序列]}`。

折叠语义与 DSH token-meter（packages/llm/token-meter/src/usage-projection.ts
的 tokenUsageProjectionDefinition）完全一致，并已用真实日志对账：各桶之和
== tokenUsage 投影累计值（94997694 会话 180577354/498735/712320/0 逐字节
一致）。这里是 Python 平行实现，单一真相源是
`crates/skill-vitals-core/src/usage.rs`；差分防护在 core 的 parity 测试与
`tests/test_cli_matrix.py` 的双实现逐字节比较。

三个关键语义（为什么这样实现，对应共性缺陷）：
- **按模型分桶**：request/header 的 config.model 会在会话中途变化（真实日志
  出现过 pro → flash → pro），`tokenUsage` 投影只有全会话累计、没有模型维度
  ——拿一个模型价算整段账会错 3 倍（flash 与 pro 输入价差 3 倍）。
- **同 (turn, step) 去重**：usage chunk 先到、assistant/message 后到是同一
  step 的两份 sample，只计最后一份；替换时从**原归属模型**减掉旧值——否则
  双计会让分桶之和超过真实累计。
- **无活跃模型归 unknown**：老日志无 request/header 时宁缺勿造，落进
  `"unknown"` 桶由展示层标「未计价」，绝不臆造一个模型。

每个桶除四个全量字段外还带四个 peak_* 子字段——落在北京高峰时段（**周一至
周五** 9–12、14–18 点；周末全天为空闲）的部分，由触发这份贡献的事件自己的
time 字段判定。这让展示层能算
出真实发生的费用（按每笔请求实际的时段计价），而不是「给空闲价和高峰价两个
数，猜不出实际该按哪个算」的区间估算——旧注释说「累计桶无法重建每笔请求的
时刻」，那是折叠时把 time 直接扔掉的自我实现，不是数据不存在。
"""

import json
from datetime import date, timedelta

from .util import est_tokens, post_fork

_EPOCH_DATE = date(1970, 1, 1)


_EMPTY_BUCKET = {
    "uncached_input_tokens": 0,
    "output_tokens": 0,
    "cache_read_tokens": 0,
    "cache_write_tokens": 0,
    "peak_uncached_input_tokens": 0,
    "peak_output_tokens": 0,
    "peak_cache_read_tokens": 0,
    "peak_cache_write_tokens": 0,
}

_BEIJING_OFFSET_SECS = 8 * 3600


def _beijing_hour(time_ms):
    """Unix ms → 北京时间小时数 [0,24)。中国自 1991 年起全境固定 UTC+8、无夏
    令时，这是精确换算。"""
    secs = time_ms // 1000 + _BEIJING_OFFSET_SECS
    return (secs % 86400) // 3600


def _beijing_weekday(time_ms):
    """Unix ms → 北京时间星期几（周一=0 … 周日=6）。

    1970-01-01 是星期四（以周一=0 计即 3），所以 `(天数 + 3) % 7`。用纯整数算，
    不引日期库——Python 的 // 和 % 对负数本身就是向下取整/取正余数，1970 年
    之前的负时间戳也对。
    """
    secs = time_ms // 1000 + _BEIJING_OFFSET_SECS
    return (secs // 86400 + 3) % 7


def _is_peak_slot(time_ms):
    """高峰时段：北京时间**周一至周五**的 9–12 点、14–18 点（左闭右开）。
    其余一切时间（含周六周日全天）都是空闲时段，空闲价 = 高峰价的一半。

    **周末那一条以前漏了**，代价是精确的 2 倍：真实账单对照（2026-08-23 周日
    14:45 那次会话）我们算 ¥1.0308372、官方收 ¥0.5154186，正好 ×2.0000——
    29 次请求的 token 数逐位吻合，只有时段判错。而且这条从来没被真实账单验证
    过：上一次对账的会话跑在 21–22 点，全程落在空闲时段，走的根本不是这个
    分支，所以碰巧对上了。
    """
    if _beijing_weekday(time_ms) > 4:
        return False  # 周六(5)、周日(6) 全天空闲
    hour = _beijing_hour(time_ms)
    return (9 <= hour < 12) or (14 <= hour < 18)


def _is_peak(event):
    """事件是否落在高峰时段。缺 time（老日志/畸形事件）保守按空闲算——峰值
    单价更高，宁可少算费用也不要凭空安一个「高峰」时刻上去（不臆造）。"""
    time_ms = event.get("time")
    if not isinstance(time_ms, int) or isinstance(time_ms, bool):
        return False
    return _is_peak_slot(time_ms)


def _int_or_none(v):
    """缺字段/布尔返回 None；真整数原样返回（token 数不会为负/浮点）。"""
    return v if isinstance(v, int) and not isinstance(v, bool) else None


# usage sample 的四个字段名（日志里的 camelCase），顺序与 _BASE_KEYS 对齐。
#: 同一模型名在一次会话里被两家供应商服务过时的标记。故意用一个不可能是
#: 真实供应商名的字符串：它不会命中 priced_providers 白名单，于是自动落进
#: 「不计价」——不需要计价方再认一个特殊分支。
AMBIGUOUS_PROVIDER = "__ambiguous__"

_SAMPLE_FIELDS = ("inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens")


def _buckets_from(usage, seen=None):
    """usage sample → 四桶。字段映射与 token-meter `bucketsFrom` 完全一致
    （reasoning 已含在 outputTokens，不重复计）。

    缺字段仍按 0 累加——这是**求和**的正确语义，且四桶之和必须与 DSH 的
    `tokenUsage` 逐字节相等（已对账的不变量，不能动）。但「求和按 0」不等于
    「测到了 0」：`seen` 收集**真正出现过**的字段名，由 `token_by_model` 折成
    `unreported_fields`，让展示层能写「未上报」而不是「0」。

    这条区分是有实测依据的：真实会话（session-e4b0be69）的 1398 个 usage 样本
    （720 条 assistant/chunk + 678 条 assistant/message）里 `cacheWriteTokens`
    **一次都没出现过**，`cacheReadTokens` 出现 1348 次。（早先这条注释写的是
    「679 个样本」——那个数只数了 assistant/message 一种类型，漏了
    assistant/chunk；发现于事后核对真实日志时，已更正。）原来
    `or 0` 把「宿主根本不报这个字段」和「宿主报了 0」合并成同一个 0，UI 于是
    显示「缓存写 0」——一个被伪造出来的测量值。这与 CLAUDE.md 的纪律直接冲突：
    缺列的报告有用，编造列的报告没用（host 能力缺失时降级、绝不臆造）。
    """
    if seen is not None:
        for name in _SAMPLE_FIELDS:
            if _int_or_none(usage.get(name)) is not None:
                seen.add(name)
    return {
        "uncached_input_tokens": _int_or_none(usage.get("inputTokens")) or 0,
        "output_tokens": _int_or_none(usage.get("outputTokens")) or 0,
        "cache_read_tokens": _int_or_none(usage.get("cacheReadTokens")) or 0,
        "cache_write_tokens": _int_or_none(usage.get("cacheWriteTokens")) or 0,
    }


#: 残差哨兵递归深度上限。真实 payload 里 usage 最深出现在 `data.usage.*`
#: （2 层）；给到 6 层是留余量，同时避免在 `compaction/summary.rawOutput`
#: 这类大对象上无界递归。
_SHAPE_SCAN_MAX_DEPTH = 6
#: 单个列表最多看前 N 个元素——同上，防止在长文本块数组上退化。
_SHAPE_SCAN_MAX_ITEMS = 32


def usage_shaped_tokens(node, depth=0):
    """在一份 payload 里找**我们认识的** usage 字段，返回它们的和；没有则 None。

    这是「残差哨兵」的判据。它故意只认 `_SAMPLE_FIELDS` 这四个名字——就是
    折叠自己会读的那四个。所以它回答的问题非常精确：

        「这条事件的 payload 里有我们**认得**的 token 字段，
          但它没被 `_usage_sample` 接住。」

    而不是宽泛的「这看起来像某种用量」——后者会在 `maxTokens`、
    `shadowedTokenCount`、`model_context_window` 这类**配置/统计**字段上误报，
    把哨兵变成没人看的噪音。

    **哨兵只用于「留候选 + 报警」，绝不用于计价。** 同一笔用量会在多个事件
    里重复出现（`assistant/chunk` 先报一次、`assistant/message` 再报最终值，
    这正是 `(turn, step)` 去重在解决的问题），把结构识别的结果直接算进钱里
    就是双计。计价必须走 `_usage_sample` 那条显式注册的路径——机器负责
    **发现**，人负责**归类**。

    真实来由：DSH 的 `compaction/summary` 带 `data.usage`（实测
    `{inputTokens:462, outputTokens:3520, cacheReadTokens:245760}`）且自带
    `model`/`provider`，但因为 ① 不在 `_usage_sample` 的类型白名单里、
    ② 没有 `turn`/`step`（compaction 由命令触发，不属于任何 turn），
    被静默丢弃——用户在菜单栏上肉眼发现"今天有消耗但日历是 0"才暴露。
    """
    if depth > _SHAPE_SCAN_MAX_DEPTH:
        return None
    total = None
    if isinstance(node, dict):
        for key, value in node.items():
            if key in _SAMPLE_FIELDS:
                n = _int_or_none(value)
                if n is not None:
                    total = (total or 0) + n
                    continue
            sub = usage_shaped_tokens(value, depth + 1)
            if sub is not None:
                total = (total or 0) + sub
    elif isinstance(node, list):
        for value in node[:_SHAPE_SCAN_MAX_ITEMS]:
            sub = usage_shaped_tokens(value, depth + 1)
            if sub is not None:
                total = (total or 0) + sub
    return total


_BASE_KEYS = ("uncached_input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens")
_PEAK_KEYS = ("peak_uncached_input_tokens", "peak_output_tokens", "peak_cache_read_tokens", "peak_cache_write_tokens")


def _record_provider(providers, model, provider):
    """登记"这个模型名这次是哪家供应商服务的"，处理三种取值——
    见 `token_by_model` 里这段逻辑原本的详细注释（`request/header` 分支）。
    抽成函数是因为 `compaction/summary` 现在也会带自己的 model/provider，
    需要跟 `request/header` 走同一套"未上报 vs 唯一供应商 vs 两家服务过
    同一模型名"的判定，两处各写一份迟早分叉。
    """
    if not isinstance(provider, str):
        provider = None
    if model not in providers:
        providers[model] = provider
    elif providers[model] != AMBIGUOUS_PROVIDER and providers[model] != provider:
        providers[model] = AMBIGUOUS_PROVIDER


def _add_buckets(by_model, model, buckets, sign, peak):
    """分桶相加。`sign=-1` 用于替换语义（从原归属模型减掉旧值）。`peak` 决定
    这份贡献是否也叠进 peak_* 子桶——四个基础桶始终是全量（空闲+高峰），
    peak_* 只是其中高峰时段的子集，off-peak 由展示层用 全量 − peak 推出。"""
    cur = by_model.setdefault(model, dict(_EMPTY_BUCKET))
    for key in _BASE_KEYS:
        cur[key] = cur[key] + sign * buckets[key]
    if peak:
        for base_key, peak_key in zip(_BASE_KEYS, _PEAK_KEYS):
            cur[peak_key] = cur[peak_key] + sign * buckets[base_key]


#: compaction 的 (turn, step) 命名空间——真实 turn 永远非负，这里全部取负数，
#: 结构上不可能撞真实 turn/step。
_COMPACTION_STEP = 0


def _compaction_identity(compaction_id):
    """把 `compactionId` 映射成一个跟真实 turn 不冲突的负数——当 compaction
    的 `(turn, step)` 去重身份。

    compaction **不属于任何 turn**（`compaction/start` 里 `"turn": null`，
    由 `sourceCommandId` 触发，不是某一轮对话的产物），伪造一个 turn 号会
    跟真实样本抢 `(turn, step)` 去重槽。但去重槽本身是 `(int, int)` 形状，
    改成第三种"独立 id"类型要牵动 `token_by_model`/`hour_buckets`/
    `request_metrics`/`token_by_date_model` 四处的 dedup slot 定义,以及
    Rust 平行实现——用哈希把 `compactionId` 稳定映射进负数空间,不用改
    任何一处的 slot 类型,是这四处改动量最小、且行为完全正确的做法。

    用哈希而不是自增计数器：本函数是无状态纯函数,不能维护跨调用计数器;
    哈希对同一个 `compactionId` 总产出同一个值，这正是去重需要的性质——
    真实撞见过一次 compaction 被 fork 复制进 4 个会话文件,4 份 summary
    落进同一个槽,`(turn,step)` 相同、`buckets` 相同，`token_by_model`
    的"值相同就跳过"分支会正确地只算一次（`post_fork` 已经会滤掉大多数
    这类副本，这里是双保险，不依赖 post_fork 覆盖所有场景）。

    缺 `compactionId`（不应该发生，但宁可退化也不崩）时退化成一个固定值,
    此时同一会话里的多次 compaction 会互相覆盖只保留最后一次——比崩溃或
    静默丢弃这一个样本更好，且极端情况在真实语料里没出现过。
    """
    if not isinstance(compaction_id, str) or not compaction_id:
        return -1
    import hashlib
    digest = hashlib.sha256(compaction_id.encode("utf-8")).hexdigest()
    return -1 - (int(digest[:8], 16) % (2 ** 30))


def _usage_sample(event, etype, data):
    """usage 事件 → (turn, step, usage, model_override)；非 usage 或畸形返回 None。

    `model_override` 是 `(model, provider)` 或 `None`——大多数事件类型没有
    自己的模型信息，沿用调用方从 `request/header` 追踪的"当前激活模型"
    （返回 `None`）；`compaction/summary` 是例外，它自带 `data.model`/
    `data.provider`（真实实测：会话主体用 pro/flash 混合，但 compaction
    走的是 `deepseek-v4-flash`/`deepseek-official`，跟当时激活的模型
    不是同一个）——不能落进"当前激活模型"，那会把这笔钱记错供应商/模型，
    价格算错。

    `token_by_model` / `request_metrics` / `token_by_date_model` /
    `hour_buckets` **共用**这一个提取器（Rust 侧同名 `usage_sample` 亦然）
    ——四者的去重语义必须一致，各写一遍迟早分叉。这也是新增
    `compaction/summary` 只改这一处、四个消费者自动生效的原因。
    """
    if etype == "assistant/chunk":
        chunk = data.get("chunk")
        if not isinstance(chunk, dict) or chunk.get("type") != "usage":
            return None
        turn, step, usage = data.get("turn"), data.get("step"), chunk.get("usage")
        model_override = None
    elif etype == "assistant/message":
        if "usage" not in data:
            return None
        turn, step, usage = data.get("turn"), data.get("step"), data.get("usage")
        model_override = None
    elif etype == "compaction/summary":
        usage = data.get("usage")
        if not isinstance(usage, dict):
            return None
        turn = _compaction_identity(data.get("compactionId"))
        step = _COMPACTION_STEP
        model = data.get("model")
        model_override = (
            model if isinstance(model, str) else None,
            data.get("provider") if isinstance(data.get("provider"), str) else None,
        )
    else:
        return None
    if (_int_or_none(turn) is None or _int_or_none(step) is None
            or not isinstance(usage, dict)):
        return None
    return turn, step, usage, model_override


def _opt_int(usage, key):
    """usage sample 的单个字段：在场取值，缺席取 None。

    与 `_buckets_from` 的「缺字段按 0」是**两种正确语义**：那边在求和（四桶之和
    必须与 DSH tokenUsage 逐字节相等），求和里缺项当 0 是对的；这里是逐请求的
    测量值，缺项落 0 就是把「宿主没报」伪造成「测到 0」。
    """
    return _int_or_none(usage.get(key))


def request_metrics(events):
    """逐请求指标（PRD §9.3 RequestMetric）。Rust 平行实现见 `usage.rs`。

    与 `token_by_model` 是**同一个 fold 的两个出口**：那边把每个样本折进按模型
    的总数，这里保留每次请求自己的一行。会话健康时间线上的每个点都来自它。
    不变量：逐请求四桶之和 == token_by_model 四桶之和（两侧都有测试钉死）。

    三条诚实性约定（与本仓「缺列不编列」同一条纪律）：
    - 缺字段落 None（JSON null）不落 0；
    - `context_tokens` 只在两个加数都在场时才非空——真实会话 687 个请求点里
      13 个缺 cacheReadTokens，这些点该在图上留缺口，而不是拿部分和凑一个偏低值；
    - **不输出逐请求的 `compacted` 布尔列**：压缩事件类型已确认（见 `compaction.py`），
      但它独立于请求，不该硬塞成每行一个 True/False；真正的压缩视图是
      `compaction_events()` 单独的输出。
    """
    # 只看分叉之后的事件——审计回答的是「**这个**会话干了什么」。从上游会话
    # branch 出来时抄进日志的那段历史属于上游自己那份审计，在这里再算一遍就是
    # 对同一笔钱/同一批行为重复计数（见 util.fork_boundary 的实测数据）。
    events = post_fork(events)
    out = []
    active = None
    window = None
    last_key = None  # 同 (turn, step) 去重

    for event in events:
        if not isinstance(event, dict):
            continue
        etype = event.get("type")
        data = event.get("data")

        if etype == "request/header":
            if isinstance(data, dict):
                header = data.get("header")
                if isinstance(header, dict):
                    config = header.get("config")
                    if isinstance(config, dict) and isinstance(config.get("model"), str):
                        active = config["model"]
            continue
        if etype == "request/context":
            # 缺 contextWindow 时保留上一次的值——一次畸形事件不该让后面所有
            # 请求都失去分母。真实日志里它一个会话只出现 5 次（每次模型切换各
            # 一次），所以只能沿用最近值，不能按请求去找。
            if isinstance(data, dict):
                w = _int_or_none(data.get("contextWindow"))
                if w is not None:
                    window = w
            continue

        if not isinstance(data, dict):
            continue
        sample = _usage_sample(event, etype, data)
        if sample is None:
            continue
        turn, step, usage, model_override = sample
        # compaction 的 (turn, step) 是内部去重用的哈希身份（见
        # `_compaction_identity`），不是真实存在的 turn 号——报给调用方的
        # 这一行必须诚实写 None，不能把去重实现细节泄漏成一个看起来像
        # 真实 turn 的负数（缺列不编列，这里是同一条纪律）。
        is_compaction = etype == "compaction/summary"

        uncached = _opt_int(usage, "inputTokens")
        cache_read = _opt_int(usage, "cacheReadTokens")
        context_tokens = (uncached + cache_read
                          if uncached is not None and cache_read is not None else None)

        row = {
            "request_seq": 0,  # 去重后统一回填
            "seq": _int_or_none(event.get("seq")),
            "time": _int_or_none(event.get("time")),
            "turn": None if is_compaction else _int_or_none(turn),
            "step": None if is_compaction else _int_or_none(step),
            "model": (model_override[0] if model_override and model_override[0]
                      else (active if active is not None else "unknown")),
            "context_window": window,
            "context_tokens": context_tokens,
            "uncached_input_tokens": uncached,
            "output_tokens": _opt_int(usage, "outputTokens"),
            "cache_read_tokens": cache_read,
            "cache_write_tokens": _opt_int(usage, "cacheWriteTokens"),
            # 这笔请求是否落在北京高峰时段。**规则留在这里，价格留给调用方**：
            # 展示层要画逐请求费用曲线就必须知道每笔按高峰价还是空闲价算，
            # 让浏览器自己重算一遍 _is_peak 就是这条规则的第四份拷贝。
            # 时间戳缺失时为 None——不是 False（"没测到"不等于"不在高峰"）。
            "is_peak": _is_peak(event) if _int_or_none(event.get("time")) is not None else None,
        }

        if last_key == (turn, step) and out:
            out[-1] = row  # 后到者覆盖（与 token_by_model 的替换语义一致）
        else:
            out.append(row)
            last_key = (turn, step)

    # request_seq 在去重之后才有意义：它是「第几个请求点」，不是「第几个样本」。
    for i, row in enumerate(out):
        row["request_seq"] = i + 1
    return out


def context_composition(events):
    """常驻上下文构成（PRD FR-04a）。Rust 平行实现见 `usage.rs`。

    返回**每次请求都要重发的那段前缀**的分类估算：

        system_tokens   ← request/header.data.header.system
        tools_tokens    ← request/header.data.header.tools（序列化后）
        catalog_tokens  ← source.kind == "skill-catalog" 的 entries[].name + description
        catalog_names   ← 上面那份的逐条拆分 [{"name", "tokens"}]（T1，不带 description
                          原文——FR-SK-09 要求导出不含未脱敏内容，进投影的东西迟早流
                          进导出，逐 skill「目录 Token」只需要这个数）

    **这三个数与 request_metrics 的 context_tokens 不是同一个估算器，不能相加
    相等。** 真实会话实测：首次请求的常驻前缀 est_tokens = 10,830，而 provider
    报的 uncached + cacheRead = 13,959，差的 3,129 是首条用户消息与消息封套开销。
    所以本函数只给常驻部分的分类与 estimator 标注；剩下多少由展示层自己减，且
    差额必须标成「未分类」而不是某个具体类别——否则就是把估算误差伪装成测量结果。

    缺源事件时给 None（JSON null）而不是 0：「日志里没有 skill-catalog 事件」与
    「发布了一个空目录」是两回事。与 unreported_fields 是同一条纪律。

    「最近一次发布覆盖前一次」——目录与 request/header 都会在会话中途重发
    （模型切换），当前状态是最后那次，不是历次累加。
    """
    # 只看分叉之后的事件——审计回答的是「**这个**会话干了什么」。从上游会话
    # branch 出来时抄进日志的那段历史属于上游自己那份审计，在这里再算一遍就是
    # 对同一笔钱/同一批行为重复计数（见 util.fork_boundary 的实测数据）。
    events = post_fork(events)
    system = tools = catalog = entries = names = None

    for event in events:
        if not isinstance(event, dict):
            continue
        data = event.get("data")
        if not isinstance(data, dict):
            continue

        if event.get("type") == "request/header":
            header = data.get("header")
            if isinstance(header, dict):
                if isinstance(header.get("system"), str):
                    system = est_tokens(header["system"])
                if header.get("tools") is not None:
                    # 模型看到的就是这份 JSON —— 分隔符须与 Rust serde_json 一致
                    text = json.dumps(header["tools"], ensure_ascii=False,
                                      separators=(",", ":"))
                    tools = est_tokens(text)
            continue

        # 技能目录挂在多种事件的 data.source 上（不是专用事件类型）
        source = data.get("source")
        if not isinstance(source, dict) or source.get("kind") != "skill-catalog":
            continue
        items = source.get("entries")
        if not isinstance(items, list):
            continue
        total = 0
        this_names = []
        for entry in items:
            name = entry.get("name") or "" if isinstance(entry, dict) else ""
            desc = entry.get("description") or "" if isinstance(entry, dict) else ""
            tokens = est_tokens(f"{name}{desc}")
            total += tokens
            this_names.append({"name": name, "tokens": tokens})
        catalog = total
        entries = len(items)
        names = this_names

    if system is None and tools is None and catalog is None:
        resident_total = None  # 三项全缺时不拿 0 当合计
    else:
        resident_total = (system or 0) + (tools or 0) + (catalog or 0)

    return {
        "system_tokens": system,
        "tools_tokens": tools,
        "catalog_tokens": catalog,
        "catalog_entries": entries,
        "catalog_names": names,
        "resident_total": resident_total,
        # 展示层据此标注「估算」，且不得把它与 provider 的 context_tokens 直接
        # 相减后当作精确的分类结果。
        "estimator": "est_tokens",
    }


def usage_signal_status(usage_events):
    """P3 group②（docs/RUNTIME_EVIDENCE_CONTRACT.md §17，cost fold）：
    `token_by_model`/`request_metrics`/`context_composition`/
    `cost.cost_report` 这族函数依赖同一个信号——"这份日志里有没有 usage
    证据"。**不新造一套裁决逻辑**：这族函数早就有自己的"不编造"纪律
    （零样本时 `by_model` 是 `{}`、`unreported_fields` 是 `[]`、
    `cost_report` 直接返回 `None`），这里只是把它正式挂到 Signal 词汇上，
    给跨规则族的一致性检查用。与 Rust `usage.rs::usage_signal_status`
    逐字节对齐——调用方必须传**分叉之后**的 usage_events（`post_fork` 一次，
    `token_by_model` 自己内部也会再 post_fork 一次，幂等，不重复计数）。
    """
    count = len(usage_events)
    if count == 0:
        return {
            "status": "unavailable",
            "missing": ["Usage"],
            "reason": "no evidence for required signal(s) in this session",
        }
    return {"status": "measured", "sample_count": count}


def token_by_model(events):
    """事件流 → `{"by_model": {...}, "sequence": [...]}`。

    纯函数、确定性：同一事件流重放结果逐字节一致（与 Rust core 对齐）。
    非 object 条目跳过；request/header 设活跃模型（sequence 相邻去重，保留
    「切回」信息）；assistant/chunk（usage 型）与 assistant/message（带
    usage）折进当前模型；缺 turn/step 或 usage 非 object 的 usage 事件跳过；
    无 request/header 时归 `"unknown"` 桶。
    """
    # 只看分叉之后的事件——审计回答的是「**这个**会话干了什么」。从上游会话
    # branch 出来时抄进日志的那段历史属于上游自己那份审计，在这里再算一遍就是
    # 对同一笔钱/同一批行为重复计数（见 util.fork_boundary 的实测数据）。
    events = post_fork(events)
    by_model = {}
    # 模型名 → 供应商（冲突或未上报时为 None）。与 by_model 并列而不是把两者
    # 拼成复合键：展示层要按 (供应商, 模型) 拆行，拼成一个字符串反而要再拆开。
    providers = {}
    last = None  # (turn, step, buckets, model, peak) —— 同 step 去重槽
    active = None
    sequence = []
    seen_fields = set()   # 真正出现过的 usage 字段名（见 _buckets_from 的注释）
    samples = 0           # usage 样本计数——0 个样本时不对「未上报」下任何断言
    unaccounted = {}      # 残差哨兵：类型 → {count, tokens_seen}（见 usage_shaped_tokens）

    for event in events:
        if not isinstance(event, dict):
            continue
        etype = event.get("type")
        if etype == "request/header":
            data = event.get("data")
            model = None
            provider = None
            if isinstance(data, dict):
                header = data.get("header")
                if isinstance(header, dict):
                    config = header.get("config")
                    if isinstance(config, dict):
                        model = config.get("model")
                        provider = config.get("provider")
            if not isinstance(model, str):
                continue
            # 供应商与模型是**两个维度**：真实会话里同一份日志既有
            # provider=deepseek-official 的 flash，也有 provider=shengsuanyun 的
            # pro——两家的价目表不同，只按模型名计价会把一家的用量按另一家的价
            # 算（实测把胜算云的 3.5M token 按 DeepSeek 官方价算出了 ¥1.66）。
            #
            # 三种取值必须分开，否则会把「老日志没这个字段」和「两家都服务过
            # 这个模型」混为一谈：
            #   - None       = 所有 header 都没上报 provider（老日志）→ 计价方
            #                  沿用默认表，保持既有行为；
            #   - "…"        = 唯一确定的供应商 → 按白名单判断能不能计价；
            #   - AMBIGUOUS  = 同一模型名被两家服务过 → 我们无法判断哪些 token
            #                  属于哪家，猜一个等于替用户编一次归属，拒绝计价。
            _record_provider(providers, model, provider)
            if active != model:
                sequence.append(model)
            active = model
            continue

        data = event.get("data")
        if not isinstance(data, dict):
            continue
        sample = _usage_sample(event, etype, data)
        if sample is None:
            # 残差哨兵：这条事件没被接住，但 payload 里有我们认得的 token
            # 字段 → 记下来。见 `usage_shaped_tokens` 的文档：哨兵只报警，
            # 不计价，归类由人来做。
            seen_tokens = usage_shaped_tokens(data)
            if seen_tokens is not None:
                entry = unaccounted.setdefault(
                    etype if isinstance(etype, str) else "(unknown)",
                    {"count": 0, "tokens_seen": 0})
                entry["count"] += 1
                entry["tokens_seen"] += seen_tokens
            continue
        turn, step, usage, model_override = sample
        samples += 1
        buckets = _buckets_from(usage, seen_fields)
        if model_override and model_override[0]:
            # 这份样本自带模型归属（目前只有 compaction/summary）——不能
            # 沿用"当前激活模型"，那是给对话轮次用的追踪状态，compaction
            # 走的往往是另一个模型/供应商（真实实测：会话主体 pro/flash
            # 混合，compaction 用的是 deepseek-v4-flash/deepseek-official）。
            model = model_override[0]
            _record_provider(providers, model, model_override[1])
        else:
            model = active if active is not None else "unknown"
        peak = _is_peak(event)
        if last is not None and last[0] == turn and last[1] == step:
            if last[2] == buckets and last[4] == peak:
                continue
            _add_buckets(by_model, last[3], last[2], -1, last[4])
            _add_buckets(by_model, model, buckets, 1, peak)
            last = (turn, step, buckets, model, peak)
        else:
            _add_buckets(by_model, model, buckets, 1, peak)
            last = (turn, step, buckets, model, peak)

    # 一个样本都没有时返回空列表：没有数据就不做「宿主不报这个字段」的断言，
    # 与 host 能力缺失时「缺列而不是编列」是同一条纪律。
    unreported = [f for f in _SAMPLE_FIELDS if f not in seen_fields] if samples else []
    # `unaccounted_usage` 是 `unreported_fields` 的**对偶**：后者说「宿主
    # 从没报过这个字段」，前者说「宿主报了 token，但我们没接住」。在证据
    # 模型里它就是 `Signal::Usage` 的 `unmetered` 计数——`evidence.rs` 的
    # 那句注释精确预言了这个 bug：「适配器不能靠"读不到就不算"来偷偷刷高
    # 自己的覆盖率」。按类型名排序保证确定性输出（Rust 侧用 BTreeMap 对齐）。
    unaccounted_usage = [
        {"type": t, "count": v["count"], "tokens_seen": v["tokens_seen"]}
        for t, v in sorted(unaccounted.items())
    ]
    return {"by_model": by_model, "providers": providers,
            "sequence": sequence, "unreported_fields": unreported,
            "unaccounted_usage": unaccounted_usage}


def token_by_date_model(events):
    """`token_by_model` 的模型维 × `hour_buckets` 的日期维 —— `{date: {model: 八桶}}`。

    单一真相源是 `crates/skill-vitals-core/src/usage.rs::token_by_date_model`，
    这里是 Python 平行实现，由该文件的
    `token_by_date_model_python_rust_byte_for_byte_parity` 逐字节看守（键序：
    日期升序、模型按首现顺序）。

    **它属于 core 而不是"只给 Python 状态层用的辅助函数"**：日历（按天）和
    DSH 审计（按 session）是同一个审计能力的两个投影，同月 token 总数与成本
    必须相等；按天这一维一旦掉出双实现差分，两个投影就能各自漂移而无人发现
    （真实事故：日历报 ¥2386，按 session 重算是 ¥1733）。状态栏后续接
    Rust-Tauri 也要用同一份折叠，不能是 Python 私有的第二套。

    **为什么 `token_by_model` 本身不够**：它按模型累加整个 session 的用量，
    完全不留时间戳；一个跨零点的 session 被喂进 `merge_month` 时,过去唯一的
    办法是把 by_model 整体归到调用方那一天（`_today_key()`）——这在「回填历史
    日志」场景下会把钱记错日子（真实 case：`session-e4b0be69` 横跨 4 天，
    整段 by_model 被记成回填当天,月度精算成本因此漏记了未落到该日的部分）。

    这里改成**逐事件**判日期（复用 `_hour_key`，与 `hour_buckets` 同一条时区
    规则），跨午夜的 session 天然按各自 `event.time` 分到正确的日期，不需要
    对同一个 session 是否跨天做特殊判断。去重语义（同 (turn, step) 先扣旧
    归属再加新归属）与 `token_by_model` 逐字节一致——否则这份数据与
    `token_by_model`/`hour_buckets` 的「总和必须相等」不变量就会各算各的。

    时间戳缺失的样本不产生日期桶（与 `hour_buckets` 同一条纪律：未知时间
    不能算进任何一天，否则会被 1970-01-01 污染或凭空当成「今天」）。
    """
    events = post_fork(events)
    by_date_model = {}
    active = None
    last = None  # (turn, step, date, model, buckets, peak)

    def fold(date_str, model, buckets, peak, sign):
        if date_str is None:
            return
        day = by_date_model.setdefault(date_str, {})
        cur = day.setdefault(model, dict(_EMPTY_BUCKET))
        for k in _BASE_KEYS:
            cur[k] = cur[k] + sign * buckets[k]
        if peak:
            for base_key, peak_key in zip(_BASE_KEYS, _PEAK_KEYS):
                cur[peak_key] = cur[peak_key] + sign * buckets[base_key]

    for event in events:
        if not isinstance(event, dict):
            continue
        etype = event.get("type")
        if etype == "request/header":
            data = event.get("data")
            model = None
            if isinstance(data, dict):
                header = data.get("header")
                if isinstance(header, dict):
                    config = header.get("config")
                    if isinstance(config, dict):
                        model = config.get("model")
            if isinstance(model, str):
                active = model
            continue
        if not isinstance(event.get("data"), dict):
            continue
        sample = _usage_sample(event, etype, event["data"])
        if sample is None:
            continue
        turn, step, usage, model_override = sample
        buckets = _buckets_from(usage, set())
        time_ms = _int_or_none(event.get("time"))
        date_str = _hour_key(time_ms)[0] if time_ms is not None else None
        peak = _is_peak(event) if time_ms is not None else None
        # 同 token_by_model：自带模型归属的样本（目前只有 compaction/summary）
        # 不沿用"当前激活模型"。
        model = (model_override[0] if model_override and model_override[0]
                 else (active if active is not None else "unknown"))

        if last is not None and last[0] == turn and last[1] == step:
            fold(last[2], last[3], last[4], last[5], -1)
            fold(date_str, model, buckets, peak, 1)
        else:
            fold(date_str, model, buckets, peak, 1)
        last = (turn, step, date_str, model, buckets, peak)

    return by_date_model


def _hour_key(time_ms):
    """time_ms → (date_str, hour) in Asia/Shanghai。

    纯整数算 + `date(1970,1,1) + timedelta` 拼出 ISO 日期，避开本地时区陷阱：
    `datetime.fromtimestamp` 会按 **本地** 时区算，机器在 UTC+0 跑就把 14 点
    写成 06 点——日历直接错一天。**整差 = 北京时间天数**（已加 8 小时偏移），
    用 timedelta 推进到日期对象，跨时区一致。

    `secs % 86400 // 3600` 是北京时间的小时数（0–23）。
    """
    secs = time_ms // 1000 + _BEIJING_OFFSET_SECS
    days = secs // 86400
    d = _EPOCH_DATE + timedelta(days=days)
    return d.isoformat(), (secs % 86400) // 3600


def _fold_hour_bucket(buckets_map, time_ms, add_buckets, peak, sign):
    """按 (date, hour) 累加/扣除一份 4 桶贡献。`sign=-1` 用于同 (turn, step)
    去重时回滚旧值——见 `token_by_model` 的同 step 替换语义，那边怎么写这边
    怎么写，否则两边的逐请求 vs 逐小时会出现不可解释的偏差。

    time_ms 缺场时落进 ("unknown", None) 这一个特殊键——保留数据但**不让它
    混进实际时间桶**，否则下游做「过去 7 天合计」会把时间戳缺失的样本算成
    1970-01-01。`is_peak` 同步置 None（缺 time ≠ 在空闲时段，与 `_is_peak`
    的保守 fallback 是同一条纪律：未测到不如实给空）。
    """
    if time_ms is None:
        key = (None, None)
        bucket_peak = None
    else:
        key = _hour_key(time_ms)
        bucket_peak = peak
    cur = buckets_map.setdefault(key, dict(_EMPTY_BUCKET))
    for k in _BASE_KEYS:
        cur[k] = cur[k] + sign * add_buckets[k]
    if bucket_peak:
        for base_key, peak_key in zip(_BASE_KEYS, _PEAK_KEYS):
            cur[peak_key] = cur[peak_key] + sign * add_buckets[base_key]


def hour_buckets(events):
    """事件流 → 按 (date, hour) 折叠到 token 桶。Rust 平行实现见
    `crates/skill-vitals-core/src/usage.rs::hour_buckets`。

    与 `token_by_model` 是**同一次 fold 的第三个出口**：那边按模型折、
    `request_metrics` 按请求点折、这里按小时折。共用 `_usage_sample` +
    `_buckets_from` + `_is_peak`，三处去重/peak 语义必须一致——任何一处
    改了去重而另两处没改，三方对账立刻红。

    不变量（测试钉死）：
    - 全桶 4+4 字段之和 == `token_by_model` 按模型聚合后求和（按同一份 events）；
    - (date, hour) 是**去重后**的聚合粒度，不受 chunk/message 顺序影响；
    - 跨午夜事件按各自 `event.time` 归属，不归到 session 开始那天——
      真实日志单会话跨 23:50→00:10 时归属各自时间，不是「session 那天」；
    - 时间戳缺失的样本落 `("unknown", None)` 桶，**不**进入日历。

    输出结构：
        {
          "buckets": [
            {"date": "2026-08-25", "hour": 14, "is_peak": true,
             "uncached_input_tokens": ..., ..., "peak_uncached_input_tokens": ...},
            ...
          ],
          "schema_version": 1,
          "tz_name": "Asia/Shanghai (UTC+8 fixed, no DST)",
          "tz_offset_hours": 8,
          "unreported_fields": [...],
        }

    `is_peak` 在每条 bucket 上保留而不是从外部用 date+hour 重算——
    让调用方决定怎么画日历（颜色条/阈值提示线）时不必重新实现一遍
    北京时间规则（与 `request_metrics` 的 `is_peak` 列是同一条设计）。
    """
    # 只看分叉之后的事件——见 token_by_model 的同条注释
    events = post_fork(events)
    buckets_map = {}  # (date_str, hour) → bucket dict
    last = None  # (turn, step, time_ms, add_buckets, peak) —— 同 step 去重槽
    seen_fields = set()
    samples = 0

    for event in events:
        if not isinstance(event, dict):
            continue
        etype = event.get("type")
        # request/header 在这里**只用于触发 _usage_sample 的提取路径**——
        # hour_bucket 不按模型分桶，但跳过 header 会让去重槽丢失上下文
        # （chunk/message 之前必须有 header 才能识别 active model），与
        # token_by_model 行为对齐
        if etype == "request/header":
            continue
        if not isinstance(event.get("data"), dict):
            continue
        sample = _usage_sample(event, etype, event["data"])
        if sample is None:
            continue
        turn, step, usage, _model_override = sample  # hour_buckets 不按模型分桶
        samples += 1
        add_buckets = _buckets_from(usage, seen_fields)
        time_ms = _int_or_none(event.get("time"))
        peak = _is_peak(event) if time_ms is not None else None

        if last is not None and last[0] == turn and last[1] == step:
            # 同 step：先扣掉旧归属，再把新归属加到当前 hour 桶
            _fold_hour_bucket(buckets_map, last[2], last[3], last[4], -1)
            _fold_hour_bucket(buckets_map, time_ms, add_buckets, peak, 1)
            last = (turn, step, time_ms, add_buckets, peak)
        else:
            _fold_hour_bucket(buckets_map, time_ms, add_buckets, peak, 1)
            last = (turn, step, time_ms, add_buckets, peak)

    # 展平成列表 + 按 (date, hour) 排序 + 每条带上 is_peak 标签
    # 时间缺失的桶 (date=None, hour=None) 一律沉到最后；calendar 渲染时再过滤掉它们
    rows = []
    for (date_str, hour), b in buckets_map.items():
        if date_str is None:
            is_peak = None
        else:
            sample_peak = b["peak_uncached_input_tokens"] or b["peak_output_tokens"] \
                or b["peak_cache_read_tokens"] or b["peak_cache_write_tokens"]
            is_peak = bool(sample_peak)
        rows.append({"date": date_str, "hour": hour, "is_peak": is_peak, **b})
    rows.sort(key=lambda r: (
        r["date"] is None,  # 缺时间的桶沉底
        r["date"],
        r["hour"] if r["hour"] is not None else -1,
    ))

    unreported = [f for f in _SAMPLE_FIELDS if f not in seen_fields] if samples else []
    return {
        "buckets": rows,
        "schema_version": 1,
        "tz_name": "Asia/Shanghai (UTC+8 fixed, no DST)",
        "tz_offset_hours": 8,
        "unreported_fields": unreported,
    }


def pre_fork_usage(events):
    """分叉前那段被排除掉的用量——**只为把话说清楚而存在**。

    主输出已经把分叉前的事件滤掉了（审计回答的是「这个会话干了什么」），但金额
    会因此显著变小（实测 ¥1113.66 → ¥433.30）。不给出被排除的量，用户会以为
    数据坏了。

    返回 None 表示这个会话根本没有分叉——不是返回一个全零的结构，「没分叉」和
    「分叉了但上游没花钱」是两回事。

    Rust 平行实现见 `crates/skill-vitals-core/src/usage.rs::pre_fork_usage`。
    """
    from .util import fork_boundary
    b = fork_boundary(events)
    if b is None:
        return None
    before = [e for e in events if isinstance(e.get("seq"), int) and e["seq"] < b]
    if not before:
        return None
    # 不能直接调 token_by_model —— 它自己会先 post_fork 把这批全滤掉。
    # 追加一个哨兵边界，让内部的 post_fork 认为「分叉在最开头」，从而全量保留。
    out = token_by_model([{"type": "session/end-seed", "seq": -1, "data": {}}] + before)
    out["boundary_seq"] = b
    return out
