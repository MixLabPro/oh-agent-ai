"""Codex 适配器的 "derive → coverage" 两段（五段式流水线 locate → shape →
extract → derive → coverage，见 `docs/RUNTIME_EVIDENCE_CONTRACT.md` §4.2）。
"locate → shape → extract" 留在 `scripts/agent_vitals/adapters/codex_session.py`，
I/O 不在这里。它把一份 rollout JSONL 里抽出的原始条目折成
`evidence::CanonicalSession` 的等价字典，覆盖计数按
`docs/RUNTIME_EVIDENCE_CONTRACT.md` §13 host coverage matrix 的 **Codex
(Legacy) 与 Codex (Paginated) 两列**逐条对应。

与 Rust `crates/agent-vitals-core/src/codex_evidence.rs` 逐字节对齐——产出
同一个 `codex_evidence_json` 输出字典（键序一致），差分测试靠这份一致把关。

**P4 的验收标准是单个词 "sound"**：Codex 是唯一一个在两种互不兼容的词表
（`ThreadHistoryMode` 的 Legacy / Paginated，见 §14.1）之间不自我声明、必须靠
探测内容区分的宿主。如果加这一个宿主、两种形状会逼着共享类型层
（`CanonicalSession`/`Coverage`/`RuleSpec`，P1 落地）做结构性改动，这个模型
就失败了。这里不触碰 `evidence.rs` 的任何类型——**"Tool-call duration" 也不
在 19 个 `Signal` 里，它是 `CommandExecutionItem.duration` 这个**值**而不是
通道**：duration 跟着原始条目走，将来做 duration 折叠时从 item 上读即可，
覆盖率模型不为它开新槽。这正是 P4 不需要改共享类型层的证据之一。

**§14.1 的 Rust 枚举名不是线格式。** 文档自己也承认格式无版本、靠兼容 shim
演进（§14.4），本机 51 份真实 rollout 实测出的 `event_msg.type` /
`item_completed.payload.item.type` / `response_item.payload.type` 三套
snake_case / PascalCase 线格式才是权威。下面的映射表直接以实测词表为准。

**不是 trait**——理由同 `dsh_evidence.rs`：宿主之间差的是"哪些阶段存在"，
trait 会强迫每个宿主实现一堆空方法。Codex 的 `build_codex_evidence` 返回的
evidence 把 `canonical`（§12 规定不持有任何宿主专属 payload）和它派生自的
原始条目捆在一起——将来把 SV 规则迁到 Codex 上时，规则引擎需要原始条目。
"""

# 19 个 Signal 的声明序——与 Rust `codex_evidence.rs::ALL_SIGNALS` 同名同序。
# `signals` 数组 / `coverage` 字典的输出顺序都靠这份显式表对齐，不靠 Python
# 的任意 set 迭代序。
ALL_SIGNALS = (
    "ToolCalls",
    "ToolResults",
    "TurnBoundaries",
    "StepBoundaries",
    "Usage",
    "UsageAggregate",
    "ContextWindow",
    "ApprovalDecisions",
    "ApprovalPolicy",
    "SandboxModes",
    "SandboxPolicy",
    "NetworkAccess",
    "Compaction",
    "SubagentSpawns",
    "SkillInvocations",
    "Hooks",
    "FileMutations",
    "UserPrompts",
    "UserCorrections",
)

# 顶层 `{type, timestamp, payload}` 包络的已知 type 值。实测（本机 51 份
# rollout）出现 7 种；`compacted` 是顶层独立类型（带着 `replacement_history`，
# §13 Compaction 行 "measured (+ replacement_history)" 的来源）。
KNOWN_TOP_LEVEL_TYPES = frozenset((
    "session_meta",
    "turn_context",
    "event_msg",
    "response_item",
    "world_state",
    "compacted",
    "inter_agent_communication_metadata",
))

# `event_msg.payload.type` 的已知值。实测 17 种（Legacy 词表 + Paginated 的
# `item_completed` 载体）。`HookPrompt` 是 §14.1 文档里有、本机语料没采样到
# 的 Paginated item——不是 event，所以这里不放。
KNOWN_EVENT_TYPES = frozenset((
    "agent_message",
    "agent_reasoning",
    "context_compacted",
    "image_generation_end",
    "item_completed",
    "mcp_tool_call_end",
    "patch_apply_end",
    "sub_agent_activity",
    "task_complete",
    "task_started",
    "thread_goal_updated",
    "thread_rolled_back",
    "thread_settings_applied",
    "token_count",
    "turn_aborted",
    "user_message",
    "web_search_end",
))

# `event_msg.payload.type == "item_completed"` 时 `payload.item.type` 的已知值
# （Paginated 的 TurnItem 词表）。实测 13 种；`HookPrompt` 是 §14.1 文档明确
# 列出的 TurnItem 变体，本机语料没采样到（n=2 份 Paginated 太小，不能当
# "不存在"，见 docs §14.1 与 `codex-corpus-facts` 记忆）。
KNOWN_ITEM_TYPES = frozenset((
    "AgentMessage",
    "CollabAgentToolCall",
    "CommandExecution",
    "ContextCompaction",
    "DynamicToolCall",
    "Extension",
    "FileChange",
    "HookPrompt",
    "ImageView",
    "McpToolCall",
    "Plan",
    "Reasoning",
    "SubAgentActivity",
    "UserMessage",
))

# `response_item.payload.type` 的已知值。实测 9 种。
KNOWN_RESPONSE_TYPES = frozenset((
    "agent_message",
    "custom_tool_call",
    "custom_tool_call_output",
    "function_call",
    "function_call_output",
    "message",
    "reasoning",
    "tool_search_call",
    "tool_search_output",
))

# §13 没有 Codex 列 / 明确 unavailable 的信号——照 DSH 的规矩显式记全零
# （不进 SignalSet），不能编一个非零数字出来。
_UNAVAILABLE_SIGNALS = (
    "StepBoundaries",
    "SandboxModes",
    "SandboxPolicy",
    "NetworkAccess",
    "UserPrompts",
    "UserCorrections",
)

# §14.3 的 SkillInvocations 说明文本——在 Rust 里逐字节相同，差分测试靠它。
_SKILL_INVOCATION_NOTE = (
    "Codex does not persist skill invocations (§14.3); SkillInvocations "
    "coverage is a derived presence lower bound, and offline inference may "
    "disagree with the host's runtime decision. The upstream heuristic "
    "detect_implicit_skill_invocation_for_command is deliberately not ported."
)


def _total(counts):
    """四个计数桶的总和——`CoverageCounts::total()` 的镜像。"""
    return counts["measured"] + counts["derived"] + counts["lossy"] + counts["unmetered"]


def _bump(coverage, signal, bucket, n=1):
    """往某个 Signal 的某个桶里加计数。与 Rust `bump` 对齐：n==0 直接返回。"""
    if n == 0:
        return
    coverage[signal][bucket] += n


def _classify(item):
    """一个条目在哪个命名空间、叫什么类型。返回 `("known", None)` 或
    `("unknown", "<报错文本>")`——报错文本是"要记进 attempts 的字符串"，已
    去重。

    顶层 type 在不在已知表里；在的话，按命名空间往下看内层 type 认不认得。
    任何一层不认识 → `("unknown", "unknown … type: …")`，调用方把它记进
    `attempts`（§14.4："unknown item types are skipped and recorded in
    attempts, never treated as corruption"）——这是 P4 顺带证明的第一条真实
    使用的 `SourceAttempt`（DSH 的 attempts 一直是空的）。

    **已知但恰好不映射到任何 Signal 的条目（`reasoning` / `agent_reasoning` /
    `world_state` …）直接跳过，不记 attempts**——`attempts` 只记"不认识"的，
    不记"认识但恰好不喂信号"的，否则一份真实会话会因为这类高频条目刷出
    一墙噪音。
    """
    top = item.get("type") if isinstance(item, dict) else None
    if not isinstance(top, str):
        top = ""
    if top not in KNOWN_TOP_LEVEL_TYPES:
        return "unknown", "unknown record type: %s" % top
    payload = item.get("payload") if isinstance(item, dict) else None
    if not isinstance(payload, dict):
        return "known", None  # 没有 payload 的 record 是合法的（如 session_meta 可能极简）
    inner = payload.get("type")
    if not isinstance(inner, str):
        inner = ""
    if top == "event_msg" and inner not in KNOWN_EVENT_TYPES:
        return "unknown", "unknown event type: %s" % inner
    if top == "event_msg" and inner == "item_completed":
        # item_completed 是 Paginated 的载体：再往下探一层 item.type。
        it = payload.get("item")
        item_type = it.get("type") if isinstance(it, dict) else None
        if not isinstance(item_type, str):
            item_type = ""
        if item_type not in KNOWN_ITEM_TYPES:
            return "unknown", "unknown item type: %s" % item_type
        return "known", None
    if top == "response_item" and inner not in KNOWN_RESPONSE_TYPES:
        return "unknown", "unknown response item type: %s" % inner
    return "known", None


def _classify_item(coverage, item_type, payload):
    """`item_completed.payload.item` 的 TurnItem 分型喂信号——单独抽出来，让
    `derive_coverage` 的主循环只读一层。与 Rust `classify_item` 逐条对齐。"""
    if item_type in ("McpToolCall", "DynamicToolCall", "CollabAgentToolCall",
                     "Extension"):
        # §14.1 列出的 typed 等价物——工具执行。
        _bump(coverage, "ToolCalls", "measured")
    elif item_type == "CommandExecution":
        _bump(coverage, "ToolCalls", "measured")
        # 带 stdout/stderr/exit_code 的执行记录同时是"结果"载体。
        _bump(coverage, "ToolResults", "measured")
        # `.duration`（实测 157/157 都有）是**值**不是通道——19 个 Signal 里
        # 没有 ToolCallDuration 变体，P4 的 "sound" 恰好证明不需要加：duration
        # 跟着原始条目走，将来做 duration 折叠时从 item 上读即可。
    elif item_type == "FileChange":
        # §13 Paginated FileMutations 列 measured；`auto_approved` 非空时是
        # ApprovalDecisions 的 partial 证据（§13 Paginated 列）。
        _bump(coverage, "FileMutations", "measured")
        it = payload.get("item")
        auto = (isinstance(it, dict) and "auto_approved" in it
                and it.get("auto_approved") is not None)
        if auto:
            _bump(coverage, "ApprovalDecisions", "measured")
    elif item_type == "ContextCompaction":
        _bump(coverage, "Compaction", "measured")
    elif item_type == "SubAgentActivity":
        _bump(coverage, "SubagentSpawns", "measured")
    elif item_type == "HookPrompt":
        _bump(coverage, "Hooks", "measured")
    # Plan / Reasoning / AgentMessage / UserMessage / ImageView 不喂信号。


def _is_u64(value):
    """`serde_json::as_u64` 的镜像：只认非负整数；bool 是 int 子类必须排除，
    浮点 `128000.0` 也一样挡在门外（Rust `as_u64` 对两者都返回 None）。"""
    return (isinstance(value, int) and not isinstance(value, bool) and value >= 0)


def derive_coverage(items):
    """顶层/event/item/response 四个来源的计数。返回 `(signals, coverage,
    未知类型的报错列表)`——报错是 §14.4 要求记进 `attempts` 的那份 "skipped,
    never corruption" 清单，去重后按字典序排序，保证跨语言字节一致。

    `signals` 是**按 ALL_SIGNALS 序过滤成员资格**的列表（与 Rust 序列化
    `signals` 数组同一个做法——SignalSet 的内部序不参与输出）；`coverage` 是
    {signal: {measured, derived, lossy, unmetered}}，19 键全量。

    映射表逐条对应 §13 的 Codex 两列（Legacy / Paginated 同列时说明两套词表
    都覆盖；分列时标在注释里）——见 Rust `codex_evidence.rs` 里那张完整表，
    这里只重述与本实现相关的口径。
    """
    coverage = {s: {"measured": 0, "derived": 0, "lossy": 0, "unmetered": 0}
                for s in ALL_SIGNALS}
    unknown = []

    for item in items:
        kind, msg = _classify(item)
        if kind == "unknown":
            if msg not in unknown:
                unknown.append(msg)

        if not isinstance(item, dict):
            continue
        payload = item.get("payload")
        if not isinstance(payload, dict):
            continue
        inner = payload.get("type")
        if not isinstance(inner, str):
            inner = ""
        top = item.get("type")
        if not isinstance(top, str):
            top = ""

        if top == "event_msg":
            if inner in ("mcp_tool_call_end", "web_search_end"):
                _bump(coverage, "ToolCalls", "measured")
            elif inner in ("task_started", "task_complete"):
                _bump(coverage, "TurnBoundaries", "measured")
            elif inner == "token_count":
                _bump(coverage, "Usage", "measured")
                # 常驻上下文窗口（model_context_window）在 payload.info 里——
                # 与逐请求 token 分离，§13 ContextWindow 行的来源。
                info = payload.get("info")
                if isinstance(info, dict) and _is_u64(info.get("model_context_window")):
                    _bump(coverage, "ContextWindow", "measured")
            elif inner == "thread_settings_applied":
                # §14.2：ThreadSettingsSnapshot 两种 mode 都持久化，携带
                # approval_policy。策略是"设置了策略"这
                # 件事的载体，数它即可，不解析策略值。键存在（即便 null）
                # 就计——与 Rust `.is_some()` 同义。
                ts = payload.get("thread_settings")
                if isinstance(ts, dict) and "approval_policy" in ts:
                    _bump(coverage, "ApprovalPolicy", "measured")
            elif inner == "patch_apply_end":
                # §13 FileMutations (Legacy) = "lossy (patch_apply_end only)"——
                # 只有 end，没有变更明细，进 lossy 桶。
                _bump(coverage, "FileMutations", "lossy")
            elif inner == "context_compacted":
                _bump(coverage, "Compaction", "measured")
            elif inner == "sub_agent_activity":
                _bump(coverage, "SubagentSpawns", "measured")
            elif inner == "item_completed":
                it = payload.get("item")
                item_type = it.get("type") if isinstance(it, dict) else None
                if not isinstance(item_type, str):
                    item_type = ""
                _classify_item(coverage, item_type, payload)
            # agent_message / agent_reasoning / user_message / turn_aborted / ...
            # 不喂信号
        elif top == "response_item":
            if inner in ("custom_tool_call", "function_call", "tool_search_call"):
                _bump(coverage, "ToolCalls", "measured")
            elif inner in ("custom_tool_call_output", "function_call_output",
                           "tool_search_output"):
                _bump(coverage, "ToolResults", "measured")
            # message / reasoning / agent_message 不喂信号
        elif top == "turn_context":
            # 顶层 turn_context 也携带 approval_policy（实测字段）——与
            # thread_settings_applied 同源不同载体，数它的存在性即可。
            if "approval_policy" in payload:
                _bump(coverage, "ApprovalPolicy", "measured")
        elif top == "compacted":
            _bump(coverage, "Compaction", "measured")
        # session_meta / world_state / inter_agent_communication_metadata 不喂
        # 信号

    # UsageAggregate / SkillInvocations 的存在性派生，收尾统一判——它们不依赖
    # 具体条目形态，只依赖"有没有 Usage 证据 / 有没有工具执行证据"。成员资格
    # 先进 sigset（与 Rust 的 SignalSet 同义），最终列表按 ALL_SIGNALS 序生成
    # —— 与 `codex_evidence_json` 的 `signals` 数组同一个顺序，这个中间列表不
    # 参与字节输出，但保持与输出一致更不容易误读。
    sigset = {s for s in ALL_SIGNALS if _total(coverage[s]) > 0}
    if _total(coverage["Usage"]) > 0:
        _bump(coverage, "UsageAggregate", "derived")
        sigset.add("UsageAggregate")
    if _total(coverage["ToolCalls"]) > 0:
        _bump(coverage, "SkillInvocations", "derived")
        sigset.add("SkillInvocations")

    # §13 没有 Codex 列 / 明确 unavailable 的信号——显式记全零（本来就是零，
    # 这里保证不出现在 signals 里），不能编一个非零数字出来。
    for s in _UNAVAILABLE_SIGNALS:
        coverage[s] = {"measured": 0, "derived": 0, "lossy": 0, "unmetered": 0}

    signals = [s for s in ALL_SIGNALS if s in sigset]
    unknown.sort()
    return signals, coverage, unknown


def build_codex_evidence(items, session_id, title, history_mode, cli_version,
                         workspace_roots, model):
    """条目数组 → evidence 字典（"derive → coverage" 两段；"locate → shape →
    extract" 留在 `adapters/codex_session.py`）。与 Rust
    `build_codex_evidence` 对齐：返回 `{"canonical", "items", "title",
    "history_mode", "cli_version"}`，其中 `canonical` 是 `CanonicalSession` 的
    等价字典。

    这是**第一条真的把 `attempts` 填起来**的适配器（DSH 的 attempts 一直是空
    列表）：未知条目类型记成 `{available: False, error: "unknown … type: …"}`
    ——§14.4 说 Codex 只能靠 existence probing 降级，"skipped and recorded in
    attempts, never treated as corruption"。

    `title` 是 `session_index.jsonl` 查出的 `thread_name`（**Codex 专属
    provenance**，与 `history_mode`/`cli_version` 同位——放 evidence 顶层，
    不放 `canonical`，§12 铁律「宿主专属字段不进共享类型层」）。`None` 表示
    索引缺失或该 session 不在索引里，绝不编造。
    """
    signals, coverage, unknown = derive_coverage(items)
    attempts = [{
        "source_id": "codex.rollout.jsonl",
        "kind": "LogFile",
        "surface": "SessionLog",
        "available": False,
        "error": msg,
        "observed_span": None,
    } for msg in unknown]

    notes = []
    if _total(coverage["SkillInvocations"]) > 0:
        # §14.3：诚实标记 Derived，说明离线推断可能与宿主运行时决定不一致，
        # 且明确拒绝 port 上游的 detect_implicit_skill_invocation_for_command。
        # 这段文本在 Rust 里逐字节相同。
        notes.append(_SKILL_INVOCATION_NOTE)

    canonical = {
        "meta": {
            "session_id": session_id,
            "host_id": "codex",
            "workspace_roots": workspace_roots,
            "model": model,
            "span": None,
        },
        "signals": signals,
        "coverage": coverage,
        "attempts": attempts,
        "notes": notes,
    }
    return {"canonical": canonical, "items": items,
            "title": title,
            "history_mode": history_mode, "cli_version": cli_version}


def codex_evidence_json(evidence):
    """evidence 字典 → `codex-evidence --json` 的输出形状。与 Rust
    `codex_evidence_json` 逐字节对齐——键序、嵌套结构、`attempts`/`notes` 的
    序列化都是这里单独控制的。`signals` 数组按 ALL_SIGNALS 序；`coverage` 19
    键全量（unavailable 的也是全零四条，不是缺键）。
    """
    canonical = evidence["canonical"]
    sigset = set(canonical["signals"])
    signals = [s for s in ALL_SIGNALS if s in sigset]
    coverage_map = {}
    for s in ALL_SIGNALS:
        c = canonical["coverage"][s]
        coverage_map[s] = {
            "measured": c["measured"],
            "derived": c["derived"],
            "lossy": c["lossy"],
            "unmetered": c["unmetered"],
        }
    attempts = []
    for a in canonical["attempts"]:
        entry = {
            "source_id": a["source_id"],
            "kind": a["kind"],
            "surface": a["surface"],
            "available": a["available"],
            "error": a["error"],
            "observed_span": a["observed_span"],
        }
        if a["observed_span"] is not None:
            span = a["observed_span"]
            entry["observed_span"] = {"start_ms": span["start_ms"],
                                      "end_ms": span["end_ms"]}
        attempts.append(entry)
    notes = [n["message"] if isinstance(n, dict) else n
             for n in canonical["notes"]]
    return {
        "host": "codex",
        "session_id": canonical["meta"]["session_id"],
        "title": evidence["title"],
        "history_mode": evidence["history_mode"],
        "cli_version": evidence["cli_version"],
        "workspace_roots": canonical["meta"]["workspace_roots"],
        "model": canonical["meta"]["model"],
        "signals": signals,
        "coverage": coverage_map,
        "attempts": attempts,
        "notes": notes,
    }
