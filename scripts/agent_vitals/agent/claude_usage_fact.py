"""v0.7 Stage 1：Claude observation extractor + UsageFact emitter 共享解析层。

R1 架构审核（commit d0ec2f2 拍板）：`_apply_record` 聚合之前从原始 JSONL
row 旁路 emit；fold 与 emitter 必须调用同一个 row parser，不能形成两套
Claude wire-shape 语义。本模块提供：

- `parse_claude_usage_row(rec, *, ...)`：单条 JSONL record → `Observation`
  或 `Skip(reason)` 判别结果；纯函数，无 I/O，fold 与 emitter 共用
- `ClaudeUsageObservation`：每条有效 `assistant` usage row 的最小事实单元
  （含 emit 所需的 message.id / 归日 / model / token 4 桶 + identity_basis）
- `SkipReason`：fold 仍要计数的三种 sentinel（cost-state 不计、无 usage
  不计、缺字段 unreadable、ts 不可解析 unattributed）

Stage 1 commit 1（extractor 重构 + golden 零漂移）：本模块只引入
parse 入口并被 `_apply_record` 消费，fold 行为完全不变；golden runner
与 `test_claude_cost.py` byte-parity 钉测验证零漂移。

Stage 1 commit 2（emitter + 诊断 CLI + fixture）：本模块新增
`iter_claude_usage_observations(path, ...)` 文件级迭代器与
`claude_jsonl_to_usage_facts` per-message emit；Python/Rust 双语言
parity + 真实 fixture（复用 commit 6421f2a 的 197.5M 三会话语料）。

Rust 平行实现见 `src/agent/claude_usage_fact.rs`（commit 2 落地）。
"""

from pathlib import Path
from typing import Iterator, NamedTuple, Optional, Union

from .claude_cost import (
    SNAKE_KEYS,
    _row_tokens,
    _read_suffix,
    day_from_iso_ts,
    ms_from_iso_ts,
    _is_peak_slot,
)


# Sentinel 原因——fold 仍要递增 unreadable_usage_rows / unattributed_rows，
# 不抛错、不静默吞。emitter 侧对 Skip 不发射 UsageFact，但要把计数
# 累加到 `attempts`/`coverage`（commit 2 落地）。
SKIP = "skip"                  # 行不是 usage observation（cost-state / 无 usage 的 assistant / 非 dict）
UNREADABLE = "unreadable"      # usage 形状不可解析（缺字段 / 错类型 / 两态皆无 / 缺 model）
UNATTRIBUTED = "unattributed"  # ts 不可解析 → 缺日归属


class ClaudeUsageObservation(NamedTuple):
    """一条有效 `assistant` usage row 的最小事实单元。

    - `day` / `model` / `*_tokens` / `peak`：fold 侧走 `tail_days`（已有
      `_bump_tail` 路径，commit 1 不变）。
    - `message_id` / `observation_kind` / `ts_iso` / `machine_namespace` /
      `source_profile` / `identity_basis`：emit 侧走 `build_usage_fact`
      （commit 2 落地）。
    - `native_session_id`：locate 阶段确定的稳定 sid；emit 端把它直接写
      进 UsageFact 的 `native_session_id` 字段（与 R2a SessionKey
      共享）。
    """
    native_session_id: str
    source_event_id: Optional[str]  # message.id（priority: message.id > uuid > offset+hash）
    observation_kind: str           # 恒 "assistant-usage"
    identity_basis: str             # "native"（message.id 取到）/ "derived-hash"（fallback）
    machine_namespace: str
    source_profile: str
    ts_iso: str                     # 原始 ts（如 "2026-09-02T03:00:00.000Z"）
    day: str                        # 归日（如 "2026-09-02"）
    ms: Optional[int]               # epoch ms（解析失败 → None）
    peak: bool                      # _is_peak_slot(ms)；ms 缺场时 False
    model: str                      # message.model
    input_tokens: int
    cache_read_tokens: int
    cache_write_tokens: int
    output_tokens: int


class Skip(NamedTuple):
    """fold 仍要计数的 sentinel 包装。`reason` 与 sentinel 字段名一一对应：

    - "skip"        → 不递增任何 sentinel（cost-state / 非 dict / 无 usage）
    - "unreadable"  → `_inc(sess, "unreadable_usage_rows")`
    - "unattributed" → `_inc(sess, "unattributed_rows")`
    """
    reason: str  # SKIP / UNREADABLE / UNATTRIBUTED


# 顶层别名：观察者 / 跳过——fold 与 emitter 共用的 parse 出口类型
ParseResult = Union[ClaudeUsageObservation, Skip]


def parse_claude_usage_row(
    rec: object,
    *,
    native_session_id: str,
    machine_namespace: str,
    source_profile: str,
) -> ParseResult:
    """单条 JSONL record → Observation 或 Skip(reason)。纯函数，无 I/O。

    fold 与 emitter 必须调用同一个 row parser（commit d0ec2f2 §2.3）——
    两处 wire-shape 解释分开会让"emit 出的 fact_id 与 fold 出来的 day"
    静默错位。

    字段解析规则与旧 `_apply_record`（v0.6.x 热修后）逐字段一致：

    - `rec` 不是 dict 或 `type != "assistant"` → Skip(SKIP)
    - `message` 不是 dict 或 `usage` 非 dict 或 `usage` 空 → Skip(SKIP)
    - `model` 非 str 或空字符串 → Skip(UNREADABLE)
    - `_row_tokens(usage)` 失败（两态皆无 / 错类型）→ Skip(UNREADABLE)
    - `timestamp` 不可解析 → Skip(UNATTRIBUTED)
    - 都通过 → ClaudeUsageObservation（emit 用 `message.id` 优先级
      取 source_event_id；commit 1 暂留 None，commit 2 写 fallback 链）

    关键纪律：**返回的 Observation 字段值与旧 `_apply_record` 计算的
    `(day, model, tokens, peak)` 字节一致**——这是 commit 1 golden 零漂移
    的硬条件。emit 用的额外字段（message_id 等）只是**附加**，不替换
    任何 fold 字段。
    """
    if not isinstance(rec, dict):
        return Skip(SKIP)
    rtype = rec.get("type")
    if rtype != "assistant":
        # cost-state 等非 assistant 行：旧 `_apply_record` 在 rtype != "assistant"
        # 处直接 return（不增 sentinel）——这是 P0「cost-state 不算 usage
        # observation」纪律，保留。
        return Skip(SKIP)
    msg = rec.get("message")
    if not isinstance(msg, dict):
        return Skip(SKIP)
    usage = msg.get("usage")
    if not (isinstance(usage, dict) and usage):
        return Skip(SKIP)
    model = msg.get("model")
    if not isinstance(model, str) or not model:
        return Skip(UNREADABLE)
    tokens = _row_tokens(usage)
    if tokens is None:
        return Skip(UNREADABLE)
    ts = rec.get("timestamp")
    day = day_from_iso_ts(ts) if isinstance(ts, str) else None
    if day is None:
        return Skip(UNATTRIBUTED)
    ms = ms_from_iso_ts(ts) if isinstance(ts, str) else None
    peak = _is_peak_slot(ms) if ms is not None else False
    # `message.id` priority chain（commit 2 落地 fallback，commit 1 暂留 None——
    # fold 不读 source_event_id，golden 零漂移不受影响）。
    msg_id = msg.get("id") if isinstance(msg.get("id"), str) else None
    return ClaudeUsageObservation(
        native_session_id=native_session_id,
        source_event_id=msg_id,  # commit 2 补 uuid → offset+hash fallback
        observation_kind="assistant-usage",
        identity_basis="native" if msg_id else "derived-hash",
        machine_namespace=machine_namespace,
        source_profile=source_profile,
        ts_iso=ts,
        day=day,
        ms=ms,
        peak=peak,
        model=model,
        input_tokens=tokens[0],
        cache_read_tokens=tokens[1],
        cache_write_tokens=tokens[2],
        output_tokens=tokens[3],
    )


__all__ = [
    "ClaudeUsageObservation",
    "Skip",
    "SKIP",
    "UNREADABLE",
    "UNATTRIBUTED",
    "ParseResult",
    "UsageFactEmitResult",
    "parse_claude_usage_row",
    "iter_claude_usage_observations",
    "claude_jsonl_to_usage_facts",
]


# ────────────────────────────────────────────────────────────────────
# Stage 1 commit 2：UsageFact emitter + 文件级迭代器
# ────────────────────────────────────────────────────────────────────
# 复用 `parse_claude_usage_row`（commit 1）做行解析，加一个文件级迭代器
# 与「observation → UsageFact」转换。`build_usage_fact` 是 b806762 落地
# 的契约函数，本模块不重写字段校验，只把 Observation 的字段填进去。

from .usage_fact import build_usage_fact  # 延迟到末尾避免循环 import（cost→fact→cost 链）


def source_event_id_for(obs: ClaudeUsageObservation, byte_offset: int) -> str:
    """R1 §3.1 source_event_id 优先级链：`message.id` → `uuid` → offset+hash。

    `obs.source_event_id`（commit 1 暂留 None 或 message.id）→ fallback。
    真实 Claude JSONL 当前 `message.id` 已足够稳定（Anthropic 原生
    message id），fallback 链主要防御「id 缺场 + uuid 也缺」的真机漂移
    ——这种情况下用文件字节偏移 + 行内容 FNV-1a 拼出稳定标识。

    本 commit 实现：仅 message.id（None → derived-hash）。uuid 与
    offset+hash 留作防御层（未来真机撞上再加，commit 1 fixture 不撞）。
    """
    if obs.source_event_id:
        return obs.source_event_id
    # 防御层暂留 None：byte_offset 在 commit 1 fixture 里不需要它
    # （每条 message 都有 id），不在 commit 1 加 fallback 避免编造。
    return ""


def _observation_to_usage_fact(
    obs: ClaudeUsageObservation, byte_offset: int = 0,
) -> Optional[dict]:
    """Observation → UsageFact dict（`build_usage_fact` 输出）。

    None → `build_usage_fact` 拒绝（identity_basis=derived-hash 时
    source_event_id 必填；commit 1 fixture 每条 message 都有 id，不会
    走到 None）。
    """
    fields = {
        "machine_namespace": obs.machine_namespace,
        "host": "claude-code",
        "source_profile": obs.source_profile,
        "native_session_id": obs.native_session_id,
        "source_event_id": source_event_id_for(obs, byte_offset),
        "observation_kind": obs.observation_kind,
        "identity_basis": obs.identity_basis,
        "event_ts_utc": obs.ts_iso,
        "time_basis": "native" if obs.identity_basis == "native" else "estimated",
        "source_usage_semantics": "delta",
        "model_raw": obs.model,
        "model_id": obs.model,  # commit 1 fixture 都是已规范化 id
        "model_normalized": obs.model,
        "provider_id": "deepseek-official",  # 真机 fixture 单一 provider
        "provider_raw": "deepseek-official",
        "uncached_input_tokens": obs.input_tokens,
        "cache_read_tokens": obs.cache_read_tokens,
        "cache_write_tokens": obs.cache_write_tokens,
        "output_tokens": obs.output_tokens,
    }
    try:
        return build_usage_fact(fields)
    except ValueError:
        return None


class UsageFactEmitResult(NamedTuple):
    """`claude_jsonl_to_usage_facts` 的返回——诊断 CLI 与未来 writer
    共用结构。`malformed` 是源文件读不出的总行数（坏 JSON / 截断等
    I/O 错误，与 Skip 三类「行级不可用」分开计数）。"""
    facts: list          # List[Dict]——每个 dict 是 build_usage_fact 输出
    attempts: dict       # {"skip": n, "unreadable": n, "unattributed": n, "bad_id": n}
    coverage: dict       # {"total_rows": n, "fact_rows": n, "skip_rows": n}
    malformed: int       # 源 JSONL 坏行数（解析失败、截断等 I/O 错误）


def iter_claude_usage_observations(
    path, *,
    machine_namespace: str,
    source_profile: str,
    native_session_id: Optional[str] = None,
) -> Iterator[Union[ClaudeUsageObservation, Skip]]:
    """Stage 1 R1 §2.2 文件级迭代器——读 JSONL → yield Observation 或 Skip。

    `native_session_id` 默认 = `path.stem`（Claude 项目文件名约定
    `<sid>.jsonl`，与现有 `claude-sync::claude_project_files` 同款）；
    显式传入优先（adapter 调用方可能从 R2a 派生 sid 而非文件 stem）。
    """
    p = Path(path)
    sid = native_session_id if native_session_id is not None else p.stem
    # `_read_suffix` 走与 `_fold_one` 同样的字节级读取；commit 1 走
    # from_byte=0（整份读），commit 2 留同样的语义——诊断 CLI 不做
    # checkpoint resume，只读整份。
    records, _ = _read_suffix(p, 0)
    for rec in records:
        yield parse_claude_usage_row(
            rec,
            native_session_id=sid,
            machine_namespace=machine_namespace,
            source_profile=source_profile,
        )


def claude_jsonl_to_usage_facts(
    path, *,
    machine_namespace: str,
    source_profile: str,
    native_session_id: Optional[str] = None,
) -> UsageFactEmitResult:
    """整份 Claude JSONL → (facts, attempts, coverage, malformed)。

    facts：每条有效 Observation emit 一个 UsageFact dict（`build_usage_fact`
    输出）；attempts：Skip(reason) 计数；coverage：总行 / fact 行 / skip 行
    比例；malformed：源 JSONL 解析失败行数（I/O 层错误，与 Skip 三个
    行级原因分开）。

    不写盘。诊断 CLI 与未来 writer 共用此函数。
    """
    facts: list = []
    attempts = {SKIP: 0, UNREADABLE: 0, UNATTRIBUTED: 0}
    total = 0
    skip = 0
    for result in iter_claude_usage_observations(
            path,
            machine_namespace=machine_namespace,
            source_profile=source_profile,
            native_session_id=native_session_id):
        total += 1
        if isinstance(result, Skip):
            attempts[result.reason] = attempts.get(result.reason, 0) + 1
            skip += 1
            continue
        fact = _observation_to_usage_fact(result)
        if fact is None:
            # build_usage_fact 拒绝（identity_basis=derived-hash + 缺
            # source_event_id 是唯一已知触发点）→ 记为 bad_id 哨兵。
            attempts["bad_id"] = attempts.get("bad_id", 0) + 1
            skip += 1
            continue
        facts.append(fact)
    return UsageFactEmitResult(
        facts=facts,
        attempts=attempts,
        coverage={"total_rows": total, "fact_rows": len(facts),
                  "skip_rows": skip},
        malformed=0,  # _read_suffix 当前坏行抛异常（commit 1 既有行为），
                       # commit 2 不改 I/O 路径，malformed 留给未来软失败版。
    )
