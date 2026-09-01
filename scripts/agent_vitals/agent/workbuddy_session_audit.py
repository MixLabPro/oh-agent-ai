"""WorkBuddy 单会话审计组合 —— `workbuddy-session` 子命令的数据层（Python 镜像）。

与 Rust `src/agent/workbuddy_session.rs` 的后半段（`workbuddy_session_list` /
`render_workbuddy_session_list` / `degrade_sv604_605` / `workbuddy_audit_projection` /
`workbuddy_session_audit_json`）逐字节对齐。五段式流水线：locate → shape → extract
（`adapters/workbuddy_session.py`）→ derive → coverage（`agent/workbuddy_evidence.py`）
→ 组合（本模块）。

**SV604/605 的 Unavailable 是本模块的 host-capability degradation（spec §3.1），
不是 core 规则改动。** WorkBuddy 的 `tool_calls` timeline 只有 bash（audit-log
`commandPreview`）和 web_fetch（`WebFetch` target）两个子集可 join——write/edit
工具调用只存在于会话匿名的 traces（file-history 有内容没路径）。SV604/605 是
"是否写过 workspace 文件"的检测器，在只能看见 bash/web_fetch 的 timeline 上会把
"看不见写操作"空转成 MeasuredZero——那是对「结构上读不到写维度」撒谎（DSH 的
MeasuredZero 是「跑了所有工具、确实没有写」的真测量，WorkBuddy 是「只有两类工具
join 得进来」）。所以这里在 WorkBuddy 路径把 SV604/605 从 MeasuredZero 覆盖成
Unavailable，理由写进 `reason`。**只在 WorkBuddy 路径生效**——Claude/DSH/Codex 的
golden 字节零改动。

SV604/605 的 override 放在本模块（dispatcher 层）、不在 `canonical_audit.py`
（共享求值器）——与 Claude 的 SV607/608 同款纪律：宿主特例不进共享代码。
`workbuddy_audit_projection` 委托共享求值器算三态契约（spec §10 验收 #4），然后对
rule_outcomes 做 override、重算 `summary.rules_unavailable`（Claude 侧健康会话
3 → 5 同款；WorkBuddy 侧健康会话 5 → 7）。

**成本块直接吃宿主账单**（spec §9）：`session_usage.used`（tokens）+ 解析
`credit_json` 求和（¥，按厘累计防浮点漂移），`host_billed: true` 标明这不是我们
按 pricing.json 重算的、而是宿主自己记的账。**pricing.json 零参与**——不长第四份
价格拷贝（spec §11 项 6）。
"""
import functools
import json
import math

from pathlib import Path

from agent_vitals.adapters import workbuddy_session
from agent_vitals.agent import workbuddy_evidence, canonical_audit

# 与 Rust `degrade_sv604_605` 的 reason 逐字节相同——差分测试靠它（spec §3.1 钉死）。
_SV604_605_DEGRADE_REASON = (
    "workbuddy host capability: only bash (audit-log commandPreview) and web_fetch "
    "(WebFetch target) tool calls are joinable to sessions; write/edit tool calls "
    "exist only in session-anonymous traces (file-history has content without "
    "paths), so SV604/605 cannot discriminate"
)


def workbuddy_audit_projection(canonical):
    """family① + family④ 的审计投影：findings + 三态 rule_outcomes + summary。

    委托共享求值器 `canonical_audit.audit_projection`（宿主无关），然后做唯一的
    WorkBuddy 特例：把 SV604/605 从 MeasuredZero 覆盖成 Unavailable（host-capability
    degradation，模块文档）。**只覆盖 MeasuredZero**：门控已因 timeline 空给
    Unavailable（缺失信号）或给了 Findings（audit-log 里有真命令时 SV601-603 会
    命中）时保持原样——override 不吞真命中。覆盖后重算 `rules_unavailable`——共享
    求值器的数已经不反映 degrade 后的状态（健康会话 5 → 7）。"""
    proj = canonical_audit.audit_projection(canonical)
    outcomes = proj["rule_outcomes"]
    for code in ("SV604", "SV605"):
        outcome = outcomes.get(code)
        if outcome is not None and outcome.get("status") == "measured_zero":
            outcomes[code] = {
                "status": "unavailable",
                "missing": ["ToolCalls"],
                "reason": _SV604_605_DEGRADE_REASON,
            }
    proj["summary"]["rules_unavailable"] = sum(
        1 for v in outcomes.values() if v.get("status") == "unavailable")
    return proj


def _session_cmp(a, b):
    """`workbuddy-session --list` 的排序：`updated_at` 降序（最新在前），平局按
    session_id 升序；无时间样本排最后（`a.get("last") or ""` 兜底成空串——Rust 的
    `as_str().unwrap_or("")` 同款，空串恒排最后）。"""
    al = a.get("last") or ""
    bl = b.get("last") or ""
    if bl != al:
        return -1 if bl < al else 1
    sa = a.get("session_id") or ""
    sb = b.get("session_id") or ""
    return (sa > sb) - (sa < sb)


def workbuddy_session_list(home=None):
    """`workbuddy-session --list`：db `sessions` 表是会话索引（真实语料 22 行）——
    每行的 id/title/model/cwd/created/updated，按 `_session_cmp` 排序。audit-log
    独苗会话（db 无行）不进列表（列表是索引不是账本；单会话深挖仍可按 id 审）。
    `home` 默认 `Path.home()`——尊重 `HOME`（测试用 isolated_home_env 注入）。"""
    if home is None:
        home = Path.home()
    root = workbuddy_session.workbuddy_root(home)
    db_sessions, db_usage = workbuddy_session.read_workbuddy_db(root)
    sessions = []
    if db_sessions is not None:
        for sid, rec in db_sessions.items():
            meta = workbuddy_session.workbuddy_session_meta(root, sid, rec, db_usage)
            sessions.append({
                "session_id": sid,
                "title": meta["title"],
                "model": meta["model"],
                "cwd": meta["cwd"],
                "first": meta["created_at"],
                "last": meta["updated_at"],
            })
    sessions.sort(key=functools.cmp_to_key(_session_cmp))
    return {"host": "workbuddy", "sessions": sessions}


def _render_list(out):
    """`workbuddy-session --list` 的人读呈现。缺席的字段一律 `-`（诚实缺失，不编造）；
    session_id 缺失 → 空串（`{sid:<28}` 留白，同 Rust）。与 Rust
    `render_workbuddy_session_list` 逐字节对齐：`host: workbuddy\\n` +
    `sessions: {n}\\n\\n` + 每行 `"{sid:<28}  {title}  {model}  {first} → {last}\\n"`。"""
    s = "host: workbuddy\n"
    sessions = out.get("sessions")
    sessions = sessions if isinstance(sessions, list) else []
    s += "sessions: %d\n\n" % len(sessions)
    for row in sessions:
        sid = row.get("session_id")
        sid = sid if isinstance(sid, str) else ""
        title = row.get("title")
        title = title if isinstance(title, str) else "-"
        model = row.get("model")
        model = model if isinstance(model, str) else "-"
        first = row.get("first")
        first = first if isinstance(first, str) else "-"
        last = row.get("last")
        last = last if isinstance(last, str) else "-"
        s += "%-28s  %s  %s  %s → %s\n" % (sid, title, model, first, last)
    return s


def _to_cents(value):
    """credit_json 单条 ¥ → 厘（int）。按厘累计再除 100，规避浮点逐条相加的漂移；
    int/float/数字字符串都认（真实 credit_json 里值可能是字符串），布尔与
    非数字 → 0（记账缺口报缺，不把垃圾算进成本）。"""
    if isinstance(value, bool):
        return 0
    try:
        f = float(value)
    except (TypeError, ValueError):
        return 0
    if math.isnan(f) or math.isinf(f):
        return 0
    return int(round(f * 100))


def _cost_of(meta):
    """spec §9 成本块：`{tokens, cny, host_billed: true}`。tokens = `used`（聚合
    token，无逐请求 Usage）；cny = credit_json 求和（宿主自身账单，¥）。usage 行
    缺失 → None（诚实缺失，不编 0——0 是「确实没花」的真测量，只在 usage 行存在
    时才可能）。"""
    used = meta.get("used")
    cj = meta.get("credit_json")
    if used is None and not cj:
        return None
    tokens = used if isinstance(used, int) and used >= 0 else 0
    cents = 0
    parsed = None
    if isinstance(cj, str) and cj.strip():
        try:
            parsed = json.loads(cj)
        except json.JSONDecodeError:
            parsed = None
    if isinstance(parsed, dict):
        for v in parsed.values():
            cents += _to_cents(v)
    return {"tokens": tokens, "cny": cents / 100.0, "host_billed": True}


def workbuddy_session_audit_json(home, session_id):
    """`workbuddy-session` 单会话审计：coverage（§13 逐信号）+ SV601–614 findings +
    成本块。`None` = db 无该会话行 **且** audit-log 无该 sessionId 的记录（两面都
    没有 → 不存在，不可审）。**db 有行但 audit-log 无记录 → 照审**（真会话、
    决策账本为空是诚实结果；不是不可读）。audit-log 独苗会话（db 无行）→ 照审，
    元数据降级 None（缺列报缺）。

    输出键序是字节一致的一部分（Python 镜像逐字节对齐），不能重排。"""
    root = workbuddy_session.workbuddy_root(home)
    db_sessions, db_usage = workbuddy_session.read_workbuddy_db(root)
    recs_by_session, file_of, degraded = workbuddy_session.read_workbuddy_audit_log(root)
    db_rec = None
    if db_sessions is not None:
        db_rec = db_sessions.get(session_id)
    records = recs_by_session.get(session_id, [])
    if db_rec is None and not records:
        return None

    meta = workbuddy_session.workbuddy_session_meta(root, session_id, db_rec, db_usage)
    evidence = workbuddy_evidence.build_workbuddy_evidence(records, session_id, meta)
    ev = workbuddy_evidence.workbuddy_evidence_json(evidence)
    audit = workbuddy_audit_projection(evidence["canonical"])
    roots = ev["workspace_roots"]
    roots = roots if isinstance(roots, list) else []
    cwd = roots[0] if roots else None

    # degraded 的 audit-log 文件若正是本会话的主账本文件，把账本缺口 surface 进
    # attempts（§14.4：skipped and recorded, never treated as corruption）。
    attempts = list(ev["attempts"])
    fpath = file_of.get(session_id)
    if fpath is not None:
        for path_str, reason in degraded:
            if str(path_str) == str(fpath):
                attempts.append({
                    "source_id": "workbuddy.audit-log",
                    "kind": "LogFile",
                    "surface": "SessionLog",
                    "available": False,
                    "error": "audit-log/%s: %s"
                             % (Path(path_str).name, reason),
                    "observed_span": None,
                })
                break

    # `file` = 主账本文件（审计据以计算的 audit-log）；db 独苗会话无审计记录 →
    # db 路径兜底（会话锚点所在）。date_span = audit-log 记录 min/max，无记录 →
    # db created/updated 兜底（adapter.date_span_of）。
    file = fpath if fpath is not None else (str(root / "workbuddy.db")
                                            if db_rec is not None else None)
    date_span = workbuddy_session.date_span_of(records, meta)

    return {
        "host": "workbuddy",
        "session_id": session_id,
        "title": meta["title"],
        "model": ev["model"],
        "cwd": cwd,
        "file": file,
        "date_span": date_span,
        "audit": audit,
        "coverage": ev["coverage"],
        "signals": ev["signals"],
        "attempts": attempts,
        "cost": _cost_of(meta),
        "notes": ev["notes"],
    }
