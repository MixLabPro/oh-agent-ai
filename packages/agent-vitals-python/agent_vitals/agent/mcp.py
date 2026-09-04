"""MCP Surface（v0.8 Phase F，第一刀 F1a）—— 只拆会话证据里已经存在的
`mcp__<server>__<tool>` 命名，不读任何配置文件、不发起任何网络请求。

单一真相源是 `crates/agent-vitals-domain/src/domain/mcp.rs`，那里有完整的调研
背景（`docs/AGENT_VITALS_V0_8_PHASE_F_RESEARCH.md` §2）——这里是它的逐字节
Python 镜像，由 `tests/test_mcp.py` 交叉锁定。

命名约定目前只在 Claude Code 上被证实为三段式 `mcp__<server>__<tool>`；Codex 的
`McpToolCall` 真实 `name` 形状未经真机语料验证，本模块不为任何宿主的 wire 形状
背书——调用方决定要不要在某个宿主上使用它。
"""
from collections import defaultdict


def parse_mcp_tool_name(name):
    """`mcp__<server>__<tool>` → `(server, tool)`；不匹配三段式 → `None`。

    拆分点是**第一个** `mcp__` 前缀之后、**最后一个** `__` 处——server/tool 本身
    允许含 `_`/`-`（例如 `mcp__claude-in-chrome__read_console_messages`）。
    """
    if not name.startswith("mcp__"):
        return None
    rest = name[len("mcp__"):]
    if "__" not in rest:
        return None
    server, tool = rest.rsplit("__", 1)
    if not server or not tool:
        return None
    return server, tool


def count_mcp_tool_calls(tool_names):
    """一批工具调用名字 → `{server: {tool: 次数}}`。非 MCP 名字静默跳过——这个
    函数只回答"MCP 那部分调用了什么"，跟既有 `tool_calls` 桶不重复也不互斥。
    """
    out = defaultdict(lambda: defaultdict(int))
    for name in tool_names:
        parsed = parse_mcp_tool_name(name)
        if parsed is None:
            continue
        server, tool = parsed
        out[server][tool] += 1
    return {server: dict(tools) for server, tools in out.items()}
