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

from typing import Iterator, NamedTuple, Optional, Union

from .claude_cost import (
    SNAKE_KEYS,
    _row_tokens,
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
    "parse_claude_usage_row",
]
