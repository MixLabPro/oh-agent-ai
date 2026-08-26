"""行为审计规则引擎 —— 对 DSH 会话事件流做运行时高危行为匹配。

与 security.py（静态规则，扫 SKILL.md 内容）是同一套分类学、两个证据源：这里的
规则吃的是执行轨迹（DSH SessionEvent 流），规则码 SV601–SV610 独立顺延，住在本模块，
不混进静态规则（那是 SV501–SV508）。`match` 只判「是否命中」、不裁决 —— 与
「启发式只排序、永不裁决」同一条纪律（见 security.py 头部注释）。

纯函数、无 I/O、确定性：同一事件流重放结果逐字节一致。事件 shape 是 DSH
SessionEvent 的 camelCase 封套 `{type, seq, time, data}`；`data` 字段名以
deepseek-harness `packages/core/session/src/types.ts` 及各插件 package 的
`declare module` 为准（见 docs/AGENT_BEHAVIOR_AUDIT.md §3.2 / §6.5）。

字段核对结论（与设计 §3.2 的差异见 docs 报告）：
- `tool/call.data`：`{turn, step, callId, name, arguments}`，`arguments` 是**原始
  JSON 字符串**，须容错处理（这里直接把它当纯文本正则匹配，天然容错）。
- `tool/result.data`：`{turn, step, message, error?: {name, code}, meta?}`。
- `approval/asked.data`：`{id, toolName, callId?, reason?}` —— 字段名是 `toolName`，
  审计对按 `id` 关联（`callId` 可选），不是「按 callId 关联」。
- `approval/decided.data`：`{id, outcome}`，`outcome` ∈ {allowed-once, rejected,
  cancelled, unavailable}。
- `sandbox/mode.data`：`{mode, source?}`，`mode` ∈ {read-only, workspace-write,
  danger-full-access}。
- `tool/code-dispatch-start` / `tool/code-dispatch` 的 `data.arguments` 是
  **JSON 对象**（已规范化），不是原始字符串 —— 与设计 §3.2「arguments 是原始
  JSON 字符串」不一致，本模块对这两种事件把对象拍平成字符串叶子再匹配。
"""

from .util import post_fork, signal_coverage
import re

# 与 Rust `src/behavior.rs` 逐字节一致 —— 改动须两边同步。
EVIDENCE_MAX_CHARS = 200

# 危险命令可能藏在 run_code 桥接出的嵌套子调用里（§6.2 注），规则须一并匹配。
TOOL_CALL_TYPES = ("tool/call", "tool/code-dispatch-start", "tool/code-dispatch")

# SV601 破坏性命令：rm -rf / dd of=/dev/ / mkfs
DESTRUCTIVE_RE = re.compile(
    r"(?i)\brm\s+-[a-z]*r[a-z]*f[a-z]*\b|\brm\s+-[a-z]*f[a-z]*r[a-z]*\b"
    r"|\bdd\b[^\n]{0,60}\bof=/dev/|\bmkfs\b"
)

# SV602 提权操作：sudo / su / chmod 777 / chown -R
PRIVILEGE_RE = re.compile(
    r"(?i)\bsudo\b|\bsu\b|\bchmod\s+[^\n]{0,10}777\b|\bchown\s+-R\b"
)

# SV603 远程执行：curl … | sh / bash <(curl …)
REMOTE_EXEC_RE = re.compile(
    r"(?i)(curl|wget)[^\n|]{0,200}\|\s*(ba)?sh|\bbash\s*<\s*\(\s*(curl|wget)\b"
)

# SV604 敏感文件写：~/.ssh/authorized_keys / /etc/ / ~/.bashrc
SENSITIVE_PATH_RE = re.compile(r"(?i)~/\.ssh/authorized_keys|/etc/|~/\.bashrc")

# SV605 工作区外写：绝对路径（v1 无 workspace 根，退化为「绝对路径」启发式，§10.5）
ABS_PATH_RE = re.compile(r"/(?:[A-Za-z0-9_.+-]+/)+[A-Za-z0-9_.+-]*")

# SV606 内网/裸 IP 外联：web_fetch URL 的 host 是裸 IPv4（含内网段）
INTERNAL_IP_URL_RE = re.compile(r"(?i)https?://\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?")

# SV607 被沙箱拒绝：TOOL_TIMEOUT 之外的拒绝/中止/不可用码（TOOL_TIMEOUT 归 SV608）
DENIED_CODES = frozenset((
    "FS_SANDBOX_DENIED",
    "ABORTED",
    "ABORTED_BEFORE_DISPATCH",
    "UNKNOWN_TOOL",
    "SANDBOX_UNAVAILABLE",
))


def _flatten_strings(value):
    """把 JSON 对象/数组拍平成字符串叶子（字典键排序），用于 code-dispatch 的
    `arguments` 对象 —— 危险命令/路径/URL 都是其中的字符串叶子。"""
    parts = []

    def walk(v):
        if isinstance(v, str):
            parts.append(v)
        elif isinstance(v, list):
            for item in v:
                walk(item)
        elif isinstance(v, dict):
            for key in sorted((k for k in v if isinstance(k, str))):
                walk(v[key])

    walk(value)
    return "\n".join(parts)


def _args_text(data):
    """从 `data` 取出可搜索的参数文本：原始 JSON 字符串直接用；对象/数组拍平。"""
    args = data.get("arguments")
    if isinstance(args, str):
        return args
    if isinstance(args, (dict, list)):
        return _flatten_strings(args)
    return ""


def _tool_invocation(event):
    """工具调用型事件（tool/call + code-dispatch*）→ (工具名, 参数文本)；否则 None。"""
    if not isinstance(event, dict):
        return None
    if event.get("type") not in TOOL_CALL_TYPES:
        return None
    data = event.get("data")
    if not isinstance(data, dict):
        return None
    name = data.get("name")
    if not isinstance(name, str):
        return None
    return (name, _args_text(data))


def _match(pattern, text):
    m = pattern.search(text)
    return m.group(0) if m else None


def _result_code(event):
    """tool/result 的 error.code，不是 tool/result 或缺 error 时返回 None。"""
    if not isinstance(event, dict) or event.get("type") != "tool/result":
        return None
    data = event.get("data")
    if not isinstance(data, dict):
        return None
    err = data.get("error")
    if not isinstance(err, dict):
        return None
    code = err.get("code")
    return code if isinstance(code, str) else None


def _detect_sv601(event, _ws=None):
    inv = _tool_invocation(event)
    if inv is None or inv[0] != "bash":
        return None
    return _match(DESTRUCTIVE_RE, inv[1])


def _detect_sv602(event, _ws=None):
    inv = _tool_invocation(event)
    if inv is None or inv[0] != "bash":
        return None
    return _match(PRIVILEGE_RE, inv[1])


def _detect_sv603(event, _ws=None):
    inv = _tool_invocation(event)
    if inv is None or inv[0] != "bash":
        return None
    return _match(REMOTE_EXEC_RE, inv[1])


def _detect_sv604(event, _ws=None):
    inv = _tool_invocation(event)
    if inv is None or inv[0] not in ("write", "edit"):
        return None
    return _match(SENSITIVE_PATH_RE, inv[1])


def _detect_sv605(event, ws=None):
    inv = _tool_invocation(event)
    if inv is None or inv[0] not in ("write", "edit"):
        return None
    # 敏感目标（/etc/ 等）由 SV604 以 critical 负责，不重复报 warning —— 两条规则不重叠。
    if SENSITIVE_PATH_RE.search(inv[1]):
        return None
    path = _match(ABS_PATH_RE, inv[1])
    if path is None:
        return None
    # 工作区感知（F1）：路径在工作区根下（按路径段边界）不算「工作区外写」。
    # ws 未知/为空时退化为纯绝对路径启发式——宁可多报不误放。
    if ws:
        root = ws.rstrip("/")
        if path == root or path.startswith(root + "/"):
            return None
    return path


def _detect_sv606(event, _ws=None):
    inv = _tool_invocation(event)
    if inv is None or inv[0] != "web_fetch":
        return None
    return _match(INTERNAL_IP_URL_RE, inv[1])


def _detect_sv607(event, _ws=None):
    code = _result_code(event)
    return code if code in DENIED_CODES else None


def _detect_sv608(event, _ws=None):
    code = _result_code(event)
    return code if code == "TOOL_TIMEOUT" else None


def _detect_sv609(event, _ws=None):
    if not isinstance(event, dict) or event.get("type") != "approval/asked":
        return None
    data = event.get("data")
    if not isinstance(data, dict):
        return None
    reason = data.get("reason")
    if isinstance(reason, str) and reason:
        return reason
    tool_name = data.get("toolName")
    if isinstance(tool_name, str) and tool_name:
        return tool_name
    return ""


def _detect_sv610(event, _ws=None):
    if not isinstance(event, dict):
        return None
    etype = event.get("type")
    data = event.get("data")
    if not isinstance(data, dict):
        return None
    if etype == "sandbox/mode":
        mode = data.get("mode")
        return mode if mode == "danger-full-access" else None
    if etype == "approval/decided":
        outcome = data.get("outcome")
        return outcome if outcome == "allowed-once" else None
    return None


def _tool_name(event):
    """finding 的 tool_name：工具调用型取 data.name，approval/asked 取 data.toolName，
    其余（tool/result、sandbox/mode、approval/decided）本层拿不到工具名 → None。"""
    if not isinstance(event, dict):
        return None
    data = event.get("data")
    if not isinstance(data, dict):
        return None
    if event.get("type") in TOOL_CALL_TYPES:
        name = data.get("name")
        return name if isinstance(name, str) else None
    if event.get("type") == "approval/asked":
        name = data.get("toolName")
        return name if isinstance(name, str) else None
    return None


def _int_or_none(value):
    # bool 是 int 的子类，须显式排除 —— 与 dsh.rs 的 as_i64()（对 bool 返回 None）对齐。
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _normalize(text):
    """证据片段：换行/回车折叠为空格，再截断到 EVIDENCE_MAX_CHARS 个字符。"""
    return text.replace("\r", " ").replace("\n", " ")[:EVIDENCE_MAX_CHARS]


class Coords:
    """事件定位坐标 (turn, step, call_id)。Rust 平行实现见 `behavior.rs` 的 `Coords`。

    三个字段在真实日志里的覆盖率**完全不同**（session-e4b0be69 实测）：

        tool/call         turn 786/786  step 786/786  callId 786/786
        tool/result       turn 796/796  step 796/796  callId   0/796
        approval/asked    turn   0/2    step   0/2    callId   2/2
        approval/decided  三者全无（只有 id 回指 asked）
        sandbox/mode      三者全无

    所以**事件自带的优先**，缺的从 turn/start · step/start 顺延。顺延不是猜：
    事件流按 seq 有序，turn/start 是权威边界，落在 turn/start(N) 与 turn/end(N)
    之间的事件就在 turn N 内——实测两对 approval 事件都落在 turn 9 内。

    turn/end 之后、下一个 turn/start 之前**清空**：落在任何 turn 之外的事件
    （真实日志里 seq=1 的 sandbox/mode 就在首个 turn 之前）诚实给 None，不硬安
    一个刚结束的 turn 上去。缺列不编列。
    """

    __slots__ = ("turn", "step")

    def __init__(self):
        self.turn = None
        self.step = None

    def observe(self, event):
        """用边界事件推进状态。必须在 resolve 之前对同一事件调用。"""
        etype = event.get("type")
        data = event.get("data")
        data = data if isinstance(data, dict) else {}
        if etype == "turn/start":
            self.turn = _int_or_none(data.get("turn"))
            self.step = None  # 新 turn 的 step 由 step/start 给出
        elif etype == "turn/end":
            self.turn = None
            self.step = None
        elif etype == "step/start":
            turn = _int_or_none(data.get("turn"))
            if turn is not None:
                self.turn = turn
            self.step = _int_or_none(data.get("step"))
        elif etype == "step/end":
            self.step = None

    def resolve(self, event):
        """求某事件的 (turn, step, call_id)：自带优先，否则顺延；都没有则 None。"""
        data = event.get("data")
        data = data if isinstance(data, dict) else {}
        turn = _int_or_none(data.get("turn"))
        step = _int_or_none(data.get("step"))
        call_id = data.get("callId")
        return (
            turn if turn is not None else self.turn,
            step if step is not None else self.step,
            call_id if isinstance(call_id, str) else None,
        )


class BehaviorRule:
    """一条行为规则：`match(event)` 只判命中、不裁决；`detect` 顺带取出证据片段。"""

    def __init__(self, rule_id, severity, category, detect):
        self.rule_id = rule_id
        self.severity = severity
        self.category = category
        self._detect = detect

    def match(self, event):
        """单条规则的谓词（纯函数）：是否命中，不裁决。"""
        return self._detect(event, None) is not None


# 规则表（SV601–SV610，§6.5 码表）。severity 沿用三级 critical/warning/info，不新造。
RULES = [
    BehaviorRule("SV601", "critical", "shell", _detect_sv601),
    BehaviorRule("SV602", "warning", "shell", _detect_sv602),
    BehaviorRule("SV603", "critical", "shell", _detect_sv603),
    BehaviorRule("SV604", "critical", "sensitive-fs", _detect_sv604),
    BehaviorRule("SV605", "warning", "sensitive-fs", _detect_sv605),
    BehaviorRule("SV606", "warning", "network", _detect_sv606),
    BehaviorRule("SV607", "warning", "approval", _detect_sv607),
    BehaviorRule("SV608", "info", "approval", _detect_sv608),
    BehaviorRule("SV609", "info", "approval", _detect_sv609),
    BehaviorRule("SV610", "warning", "approval", _detect_sv610),
]


# P3 group①（docs/RUNTIME_EVIDENCE_CONTRACT.md §10）：SV601–610 对信号的
# 依赖声明。从每条 `_detect_svNNN` **实际读什么事件类型**倒推出来——不是从
# §13 矩阵的列名猜的：SV604/605 表面上像该对应 FileMutations，但它们真正读
# 的是 tool/call，所以是 ToolCalls。SV610 单靠 sandbox/mode 就能出一条
# finding，所以 ApprovalDecisions 只是 enhances，不是 requires（不在
# requires 元组里就是 enhances——本文件不做完整 19 信号的 Coverage 模型，
# 只镜像 Rust crates/skill-vitals-core/src/dsh_evidence.rs 里这四个信号）。
# 与 Rust behavior.rs::rule_specs 逐条对齐，改一边要改另一边。
RULE_REQUIRES = {
    "SV601": ("ToolCalls",), "SV602": ("ToolCalls",), "SV603": ("ToolCalls",),
    "SV604": ("ToolCalls",), "SV605": ("ToolCalls",), "SV606": ("ToolCalls",),
    "SV607": ("ToolResults",), "SV608": ("ToolResults",),
    "SV609": ("ApprovalDecisions",), "SV610": ("SandboxModes",),
    # P3 group④（trajectory，SV611–614）。SV611 只读 tool/call。SV612 只
    # 依赖 TurnBoundaries——ToolCalls 全零时每个 turn 签名列表都是空，如实
    # measured-zero("有 turn 结构但确实没有工具调用可循环"是真测出来的结
    # 论，不是缺证据)；但 TurnBoundaries 全零时连 turn 都分不出来，判断不
    # 了有没有循环，才是 unavailable。SV613/614 各自两个子判定读不同信
    # 号，任一有证据规则就不是完全测不了——这两条的语义是"至少一个"，见
    # 下面 `_OR_REQUIRES_CODES`，不是这个字典能表达的"全部都要"。
    "SV611": ("ToolCalls",), "SV612": ("TurnBoundaries",),
    "SV613": ("TurnBoundaries", "ToolResults"),
    "SV614": ("ApprovalDecisions", "SandboxModes"),
}

# requires 是"至少一个信号有证据"（OR）而不是"全部都要"（AND）的规则码。
# 与 Rust behavior.rs::OR_REQUIRES_CODES 逐字节对齐。
_OR_REQUIRES_CODES = ("SV613", "SV614")


def rule_outcomes(findings, events):
    """`findings`（已经算好、不改）+ `events` → 每条规则的三态结果
    （§10：N findings / measured-zero / unavailable），JSON-ready 字典。
    与 Rust `behavior.rs::rule_outcomes` + `rule_outcomes_json` 逐字节对齐。

    `events` 必须是**分叉之后**的事件（调用方负责先 `post_fork`）——覆盖率
    不能算进分叉前的历史,否则一个信号的证据全部落在分叉前会被误判成"有
    覆盖",而 findings 从这些分叉前事件里从来没被计过数（match_behavior 内部
    自己会 post_fork，但覆盖率是这里单独算的，两边必须用同一批"审计范围内"
    的事件，不能算错口径）。
    """
    coverage = signal_coverage(events)
    by_rule = {}
    for code, requires in RULE_REQUIRES.items():
        missing = [s for s in requires if coverage.get(s, 0) == 0]
        is_unavailable = (len(missing) == len(requires)) if code in _OR_REQUIRES_CODES else bool(missing)
        if is_unavailable:
            by_rule[code] = {
                "status": "unavailable",
                "missing": missing,
                "reason": "no evidence for required signal(s) in this session",
            }
            continue
        matched = [f for f in findings if f.get("rule") == code]
        if matched:
            by_rule[code] = {"status": "findings", "count": len(matched)}
        else:
            by_rule[code] = {"status": "measured_zero"}
    return by_rule


def match_behavior(events, workspace_root=None):
    """遍历事件流，命中即产出一条 Behavior Finding（§5.3 规则引擎层的字段）。

    纯函数、确定性：同一事件流重放结果逐字节一致。非 dict 的条目跳过；
    缺 seq/time 时以 null 落位，绝不伪造 0 次。
    """
    # 只看分叉之后的事件——审计回答的是「**这个**会话干了什么」。从上游会话
    # branch 出来时抄进日志的那段历史属于上游自己那份审计，在这里再算一遍就是
    # 对同一笔钱/同一批行为重复计数（见 util.fork_boundary 的实测数据）。
    events = post_fork(events)
    findings = []
    coords = Coords()
    for event in events:
        if not isinstance(event, dict):
            continue
        # 边界事件（turn/step start·end）先推进坐标，再对本事件求值。
        coords.observe(event)
        for rule in RULES:
            evidence = rule._detect(event, workspace_root)
            if evidence is None:
                continue
            turn, step, call_id = coords.resolve(event)
            findings.append({
                "rule": rule.rule_id,
                "severity": rule.severity,
                "category": rule.category,
                "tool_name": _tool_name(event),
                "evidence": _normalize(evidence),
                "seq": _int_or_none(event.get("seq")),
                "time": _int_or_none(event.get("time")),
                "turn": turn,
                "step": step,
                "call_id": call_id,
                "evidence_recency": "log",
                # G2（GOVERNANCE_BACKLOG.md）：单事件规则没有"区间"概念，恒 None
                # ——只有 trajectory.py 的 SV611/612/613 填真实值。恒置这一键是
                # 为了跟 match_trajectory 的 finding 保持同构（12 键、键序一致，
                # `tests/test_characterization.py::test_trajectory_findings_
                # share_the_same_key_order` 逐字节看守）。
                "run_end_seq": None,
            })
    return findings


def audit_session_log(path):
    """读会话日志 → 执行事件 → 规则引擎 → (findings, usage, requests, context, compaction,
    waste, pre_fork, subagents, skill, duration)（端到端入口）。

    `path` 是 DSH 会话日志（JSONL 文件或目录）。降级时（不可读 / 畸形 / schema
    不符）返回 `None`，**绝不返回空列表 = 0 条**——空列表只在「读全了但确实
    0 条执行事件」时出现（与 dsh.read_session_log 的 degraded 语义一致）。

    返回值是十元组，与 Rust 侧 `src/behavior.rs::Audit` 结构体的字段一一对应
    （单一真相源是各自的 core 纯函数，这里只是 I/O 入口的薄封装）。findings 是
    SV601–614 风险列表；skill 是 T11 的技能触发记录；duration 是 D11 的执行
    时长审计（`{tool_calls, turns, steps, approvals, hooks}`）；中间那几项是
    **同一批 usage_events 的三种分辨率**，不是重复：

        usage       按模型汇总的四桶（成本折算的输入）
        requests    逐请求时间序列（上下文占用曲线的数据源，PRD §9.3）
        context     常驻前缀的分类估算（系统提示词/工具定义/技能目录，FR-04a）
        compaction  压缩事件；prune 的 shadowed_token_count 是**宿主实测**的
                    被丢弃 token 数，与 context 的 est_tokens 估算 provenance
                    不同，展示层须分开标注
        waste       FR-04b 结构性浪费——规则可直接判定、不需要历史基线的浪费
                    模式，与 compaction 的 prune **不是同一件事**（prune 是正常
                    的上下文老化清理，查过真实数据不是重复，见 waste.py 头注释）

    注意 requests[].context_tokens 是 provider 计数，而 context.* 是 est_tokens
    估算——**两者不同估算器，不能相减后当作精确分类**（详见 usage.py 的
    context_composition 文档）。
    """
    from .adapters import dsh  # 延迟导入，避免模块加载期耦合
    from .trajectory import match_trajectory
    from .compaction import compaction_events
    from .waste import detect_structural_waste
    from .usage import (
        context_composition, request_metrics, token_by_model, pre_fork_usage, usage_signal_status,
    )
    from .subagent import subagent_spawns
    from .skill import skill_invocations
    from .duration import (
        tool_call_durations, turn_durations, step_durations, approval_latencies, hook_executions,
        duration_coverage,
    )
    session = dsh.read_session_log(path)
    if session["degraded"]:
        return None
    # 工作区根来自 session header 的 cwd；缺失时 None → SV605 退化为纯绝对路径启发式。
    events = session["execution_events"] or []
    # 单事件规则（SV601–610）在前、轨迹级检测（SV611–614）追加在后，字节序稳定。
    findings = match_behavior(events, session.get("cwd"))
    findings.extend(match_trajectory(events))
    # 三个消费者共用 usage_events（各取所需，不认识的事件类型自然跳过）
    usage_events = session["usage_events"] or []
    usage = token_by_model(usage_events)
    requests = request_metrics(usage_events)
    context = context_composition(usage_events)
    compaction = compaction_events(events)
    waste = detect_structural_waste(events, requests)
    # 分叉前被排除掉的用量（没分叉时 None）。上面每一项都只算分叉之后，金额会
    # 显著变小——不把排除量说出来，读的人会以为数据坏了。见 usage.pre_fork_usage。
    pre_fork = pre_fork_usage(usage_events)
    # 本会话派出的子代理——时间线的关键事件 + 父子会话的权威链路。
    subagents = subagent_spawns(events)
    # T11：本会话内 skill 触发记录（不跨会话合并）。这里之前一直缺失——
    # Rust 侧的 Audit.skill 字段和 skill-audit 子命令早就有了，Python CLI 从
    # 没把它接进 audit_session_log，是这次加 duration 时顺手发现并补上的，
    # 不是本次改动引入的新缺口。
    skill = skill_invocations(events, requests)
    # D11：执行时长审计。hooks 是 CLI 独有的一项——浏览器的 durationAudit
    # 投影不收 hook/* 事件（宿主前提未验证），CLI 直接读盘上的原始 JSONL，
    # hook/* 本来就在 execution_events 里，这里立即可用。
    duration = {
        "tool_calls": tool_call_durations(events),
        "turns": turn_durations(events),
        "steps": step_durations(events),
        "approvals": approval_latencies(events),
        "hooks": hook_executions(events),
    }
    # P3 group①：覆盖率必须算在分叉之后的事件上——match_behavior 内部自己会
    # post_fork，这里单独再 post_fork 一次（幂等，见 util.post_fork）算覆盖率，
    # 不能直接用 events（分叉前）算，否则证据全部落在分叉前的信号会被误判成
    # "有覆盖"。与 Rust src/behavior.rs 那边同一个理由、同一个修法。
    outcomes = rule_outcomes(findings, post_fork(events))
    # P3 group②：同样道理，usage_coverage 也要用分叉之后的 usage_events。
    usage_coverage = usage_signal_status(post_fork(usage_events))
    # P3 group③：duration_coverage 用同一份 post_fork(events)——跟
    # rule_outcomes 同源（execution 事件派生的信号）。
    dur_coverage = duration_coverage(duration, post_fork(events))
    return (findings, usage, requests, context, compaction, waste, pre_fork, subagents, skill,
            duration, outcomes, usage_coverage, dur_coverage)


# 行为审计的闸门阈值语义，与 doctor.gate() 一致：critical/warning/info 三级，
# 数字越小越严重。这里不复用 doctor.SEVERITY_RANK —— behavior 是独立取证命令，
# 不 import doctor（那是扫描诊断层），保持模块单向依赖。
_BEHAVIOR_SEV_RANK = {"critical": 0, "warning": 1, "info": 2}


def behavior_gate(findings, fail_on="critical", ignore=""):
    """行为审计的 CI 闸门：返回退出码 0（无达标发现）或 1（有）。

    findings 是 match_behavior 的产物（元素带 rule / severity 字段）。
    ignore 是逗号分隔的规则码（SV601–SV610），大写后按码排除——与 doctor 的
    --ignore 同一套语义；fail_on 是 critical / warning / info / none 之一。

    **行为审计没有基线，所以没有 --new-only 分支**——一份会话日志是单次取证
    的输入，不存在「相对上次的新增发现」。
    """
    ignored = {x.strip().upper() for x in ignore.split(",") if x.strip()}
    kept = [f for f in findings if f["rule"] not in ignored]
    if fail_on == "none":
        return 0
    limit = {"critical": 0, "warning": 1, "info": 2}[fail_on]
    ranks = [_BEHAVIOR_SEV_RANK[f["severity"]] for f in kept]
    worst = min(ranks) if ranks else None
    return 1 if (worst is not None and worst <= limit) else 0
