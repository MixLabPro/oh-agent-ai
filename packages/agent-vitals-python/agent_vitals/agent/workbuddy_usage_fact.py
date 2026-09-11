"""WorkBuddy traces → `UsageFact`（spec §9E.5 E4a；分期同 v0.7 三宿主先例：内存 emit +
只读诊断，不动 FACT_HOSTS、不写盘——E4b 再接同步管线）。

源：generation span 解码后的 `usage`（OpenAI 兼容格式）+ 逐调用 `model`——E1 的读取层
（`adapters/workbuddy_traces.py`）已解开二次编码、只留 `usages`/`model`。每个 generation
span 恰好一条 usage（真机 5,067/5,067）→ `source_event_id = spanId` 是原生身份
（`identity_basis: native`）。

桶映射（与 Codex 同形）：uncached = prompt − cached、cache_read = cached、cache_write = 0
（OpenAI 格式无此桶）、output = completion（**已含** reasoning，绝不叠加）。

归属：镜像 Rust `resolve_billing_attribution(None, None)` 的输出——WorkBuddy 的轨道
（平台积分 / 自配 key / 限免）是请求级且本机不可判（spec §2.1）：`provider_id: None`、
`billing_mode: "metered"`（resolver 的保守默认，非「免费」）、`pricing_basis:
"metered_estimate"`、`evidence_basis: "missing"`。不解析 `model` 前缀、不把 models.json
当 RouteEvidence。

未归属 trace（无 `trace.sessionId`）按 Codex 先例计 `attempts["unattributed"]`，不发事实
——`native_session_id` 是身份必填字段，编一个就是编 session。

与 Rust `hosts/workbuddy/sources/usage_fact.rs` 逐字节对齐（`tests/test_workbuddy_usage_fact.py`）。
"""

from pathlib import Path
from typing import NamedTuple

from ..adapters import workbuddy_traces
from .usage_fact import build_usage_fact

HOST = "workbuddy"
OBSERVATION_KIND = "assistant-usage"
SKIP = "skip"
UNREADABLE = "unreadable"
UNATTRIBUTED = "unattributed"


class UsageFactEmitResult(NamedTuple):
    facts: list
    attempts: dict
    coverage: dict
    malformed: int


def _span_to_usage_fact(span, native_session_id, machine_namespace, source_profile):
    usages = span.get("usages") or []
    if not usages:
        return None
    u = usages[0]
    uncached = max(u["prompt_tokens"] - u["cached_tokens"], 0)
    started_at = span.get("started_at")
    fields = {
        "machine_namespace": machine_namespace,
        "host": HOST,
        "source_profile": source_profile,
        "native_session_id": native_session_id,
        "source_event_id": span["span_id"],
        "observation_kind": OBSERVATION_KIND,
        # spanId 是宿主原生 id——不像 Codex 的 token_count 要靠字节偏移派生。
        "identity_basis": "native",
        # span.startedAt 原样 ISO 毫秒串；缺失 → None（诚实无观测时间）。
        "event_ts_utc": started_at,
        "time_basis": "native" if started_at is not None else None,
        "source_usage_semantics": "delta",
        "model_raw": u.get("model"),
        # 镜像 resolve_billing_attribution(None, None)。
        "provider_raw": None,
        "endpoint_host": None,
        "provider_id": None,
        "route_evidence_id": None,
        "billing_source": None,
        "billing_mode": "metered",
        "pricing_basis": "metered_estimate",
        "evidence_basis": "missing",
        "normalization_version": "provider-v0.11",
        "attribution_version": "provider-v0.11",
        "uncached_input_tokens": uncached,
        "cache_read_tokens": u["cached_tokens"],
        "cache_write_tokens": 0,
        "output_tokens": u["completion_tokens"],
    }
    try:
        return build_usage_fact(fields)
    except ValueError:
        return None


def workbuddy_traces_to_usage_facts(root, *, machine_namespace, source_profile="default"):
    """`<workbuddy_root>/traces/**` → `UsageFactEmitResult`。facts 按 trace 文件路径序、
    span 原序。不写盘。root / traces 目录不存在 → OSError（CLI exit 2，与其他宿主的
    usage-facts 同款：源不可读不冒充 0 事实）。"""
    root = Path(root)
    if not root.is_dir():
        raise OSError("%s: not a directory" % root)
    if not workbuddy_traces.workbuddy_traces_root(root).is_dir():
        raise OSError("%s: no traces/ directory" % root)
    read = workbuddy_traces.read_workbuddy_traces(root)
    facts = []
    attempts = {SKIP: 0, UNREADABLE: 0, UNATTRIBUTED: 0}
    total_generation_spans = 0
    skip_rows = 0
    all_traces = [t for v in read["by_session"].values() for t in v] + list(read["unattributed"])
    all_traces.sort(key=lambda t: str(t["path"]))
    for tr in all_traces:
        for span in tr["spans"]:
            if span.get("kind") != "generation":
                continue
            total_generation_spans += 1
            if span.get("decode_failed"):
                # toolOutput 解不开（真机 4 例全是空串）→ unreadable，不是 skip。
                attempts[UNREADABLE] += 1
                continue
            if not span.get("usages"):
                # 取消/进行中（toolOutput null）或解码后无 usage → 跳过，不是失败。
                attempts[SKIP] += 1
                skip_rows += 1
                continue
            sid = tr.get("session_id")
            if sid is None:
                attempts[UNATTRIBUTED] += 1
                continue
            fact = _span_to_usage_fact(span, sid, machine_namespace, source_profile)
            if fact is None:
                attempts["bad_id"] = attempts.get("bad_id", 0) + 1
            else:
                facts.append(fact)
    coverage = {
        "total_generation_spans": total_generation_spans,
        "fact_rows": len(facts),
        "skip_rows": skip_rows,
    }
    return UsageFactEmitResult(facts=facts, attempts=attempts, coverage=coverage,
                               malformed=len(read["degraded"]))


__all__ = [
    "HOST",
    "OBSERVATION_KIND",
    "UsageFactEmitResult",
    "workbuddy_traces_to_usage_facts",
]
