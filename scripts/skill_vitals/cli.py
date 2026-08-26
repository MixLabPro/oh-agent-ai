
#!/usr/bin/env python3
"""
扫描本机各 Agent 宿主的 skill 安装目录，输出成本清单（JSON）。

只做确定性统计，不做判断。判断交给调用它的 Agent。

关键设计：**按宿主隔离「装在磁盘上」和「真的进了上下文」**。
不同宿主的 skill 绝不能合并计算上下文预算或覆盖冲突。

用法:
    python3 scan.py                    # 扫描默认路径
    python3 scan.py --path <dir> ...   # 追加自定义路径
    python3 scan.py --json out.json    # 写入文件
    python3 scan.py --all              # 预算按磁盘上所有 skill 算（诊断用，默认只算已加载）
"""

import argparse
import json
import os
import sys
import traceback
from pathlib import Path

from skill_vitals import __version__
from skill_vitals import behavior as behavior_module
from skill_vitals import cost as cost_module
from skill_vitals.doctor import _doctor_snapshot, diagnose, render_doctor, render_gate
from skill_vitals.explain import render_explain
from skill_vitals.inventory import build_inventory
from skill_vitals.lifecycle import render_list
from skill_vitals.overlap import DEFAULT_OVERLAP_MIN, render_overlap
import skill_vitals.redact as redact_module
from skill_vitals.report import build_report
import skill_vitals.security as security_module
from skill_vitals.snapshots import SNAPSHOT_KEEP, diff_against, latest_snapshot, render_diff, render_snapshot
from skill_vitals import state as state_module
from skill_vitals import usage as usage_module
from skill_vitals import budget as budget_module

# Windows services and CI runners may expose cp1252 consoles. Reports and
# diagnostics are bilingual, so make redirected and interactive output stable.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

# 输出 JSON 的 schema 版本。**与工具版本无关**：工具可以升版而 schema 不变，
# schema 也可以在工具小版本里升主版本。
#
# 兼容性策略见 ARCHITECTURE §2.3：字段只增不删不改语义，破坏性变更升主版本。
#
# 「1.0」是**第一个带版本号的版本**。在它之前的输出没有版本字段 —— 那段时间
# schema 改过好几次（新增 unreadable_skills、runtime_verified_* 由 0 改为 null、
# WorkBuddy 口径变更），下游无法区分自己拿到的是哪一版。**没有版本号的
# schema 等于没有契约**，这笔账早该还。
SCHEMA_VERSION = "1.0"

# Claude Code 的 skill/命令描述总预算。默认约 15000 字符（≈4000 token）。
# 超出后描述被静默丢弃，无任何告警。可用 SLASH_COMMAND_TOOL_CHAR_BUDGET 调大。
# 不同版本口径不一（另有"上下文窗口 1%"的说法），故做成可配置。
DEFAULT_DESC_BUDGET = int(os.environ.get("SLASH_COMMAND_TOOL_CHAR_BUDGET", 15000))
CODEX_FALLBACK_DESC_BUDGET = 8000

# 判定「僵尸」前至少要装够这么多天。装了一天就说零触发没有意义。
ZOMBIE_MIN_AGE_DAYS = 14

# 各宿主的常见 skill 目录。找不到的会被静默跳过。
# 同一个 host 的多个根目录按该宿主的优先级归类，绝不跨宿主比较。
DEFAULT_ROOTS = [
    ("claude-code", "./.claude/skills"),
    ("claude-code", "~/.claude/skills"),
    ("claude-code-plugins", "~/.claude/plugins"),
    ("codex", "~/.codex/skills"),
    ("openclaw", "./skills"),
    ("openclaw", "./.agents/skills"),
    # DSH 的 discovery roots（契约 §DSH，层内 rank 越小越优先）。~/.agents/skills
    # 与 OpenClaw 共享，但两边要按各自的 rank 归类，绝不跨宿主合并判定。
    ("dsh", "./.dsh/skills"),
    ("dsh", "./.agents/skills"),
    ("dsh", "~/.dsh/skills"),
    ("dsh", "~/.agents/skills"),
    ("hermes", "~/.hermes/skills"),
    ("workbuddy", "./.codebuddy/skills"),
    ("workbuddy", "./.workbuddy/skills"),
    ("workbuddy", "~/.workbuddy/skills"),
    ("cc-switch", "~/.cc-switch/skills"),
    ("cursor", "~/.cursor/skills"),
    ("gemini-cli", "~/.gemini/skills"),
    ("opencode", "~/.opencode/skills"),
]

# ── 主流程 ───────────────────────────────────────────────

def _doctor_gate(out, args, auto_snapshot, baseline):
    """doctor 文本流：报告 → 闸门 → 快照，返回退出码。

    顺序有讲究：闸门结论要紧跟报告（读者刚看完发现），存档放最后（它是
    副作用，不是结论）。快照写失败不影响闸门的退出码 —— 一个写不了快照的
    CI runner 不该因此把构建判成通过或失败。
    """
    ds = diagnose(out, args.split_threshold, args.min)

    base_ds = None
    if getattr(args, "new_only", False):
        if not baseline:
            print("--new-only needs a baseline: run `skill-vitals snapshot` first, "
                  "or specify one with --baseline.", file=sys.stderr)
            return 2
        try:
            with open(baseline, encoding="utf-8") as fp:
                prev = json.load(fp)
        except (OSError, ValueError):
            print("--new-only could not read baseline %s" % str(baseline), file=sys.stderr)
            return 2
        # 在基线文档上重跑同一个 diagnose。它是纯函数，这一步不需要任何
        # 额外的「历史诊断」存储，也就不会与快照的内容脱节。
        base_ds = diagnose(prev, args.split_threshold, args.min)

    ignore = [x.strip().upper() for x in args.ignore.split(",") if x.strip()]
    text, code = render_gate(ds, args.fail_on, ignore, base_ds)
    print(text, end="")
    _doctor_snapshot(out, auto_snapshot)
    return code


def _render_calendar_html(output_path, default_source="month"):
    """把 today.json / month.json 渲染成单文件日历 HTML，写到 output_path。

    `calendar` 子命令与 `oneline`（每次跑完顺手刷新
    `$STATE_DIR/calendar.html`，给 xbar「打开日历」菜单项用）共用同一份
    逻辑——两处各写一份，字段名/转义稍有出入就会一个能打开一个打不开，
    多一份要维护的复制代码。

    两个 tab（today / month）都内联进同一个文件，各自一个
    `<script id="skill-vitals-data-{mode}">` 块——只内联 `--source`
    选中的那一份会导致点另一个 tab 没反应或被误判成另一种 schema 硬渲染
    出一张空图（真实 bug，用户点 today tab 复现过）。**每个 mode 独立
    判断有没有数据**——today.json 不存在就不内联那个块，那个 tab 落到
    JS 的 empty-state，不影响 month 那个块正常渲染，反之亦然。

    `default_source` 决定「没有 `?file=` 时默认显示哪个 tab」，通过注入
    `window.SKILL_VITALS_DEFAULT_MODE` 传给模板 JS。

    内联进 `<script>` 的 JSON 不是 state 文件的原始字节——`_augment_
    calendar_cost` 会先给有 `by_model` 的桶/日子塞一个按真实模型精算的
    `cost` 字段（复用 `cost.py::cost_report`，不是模板自己那份
    deepseek-v4-flash 近似），让日历页的数字能和 `budget show`/xbar
    菜单栏对上，而不是各算各的（这正是之前那次「UI 显示 ¥1.20 但
    behavior --json 报 ¥1.35」类漂移的根因）。写到 sidecar 副本（file
    picker fallback 用）的还是原始字节，不带这个额外字段——那份要跟
    state.py 的 schema 契约保持字面一致。

    返回 `(embedded_modes, output_path)`；`embedded_modes` 为空列表表示
    两份 state 文件都不存在，HTML 仍会写出，JS 会显示空态而不是报错。
    """
    template = Path(__file__).resolve().parent / "templates" / "calendar.html"
    if not template.is_file():
        raise FileNotFoundError(
            "calendar template not found at %s (run M4 first)" % template)
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    html = template.read_text(encoding="utf-8")
    pricing = cost_module.load_pricing()
    embedded = []
    for mode, src_name in (("today", "today.json"), ("month", "month.json")):
        src = state_module.state_dir() / src_name
        if not src.is_file():
            continue
        json_text = src.read_text(encoding="utf-8")
        embed_text = json_text
        try:
            data = json.loads(json_text)
        except (json.JSONDecodeError, ValueError):
            data = None
        if isinstance(data, dict):
            _augment_calendar_cost(mode, data, pricing)
            embed_text = json.dumps(data)
        # JSON 里可能含 </script> —— 必须转义,否则浏览器解析到这就崩
        json_text_safe = (embed_text
                          .replace("</script", "<\\/script")
                          .replace("<!--", "<\\!--"))
        inject = ("<script id=\"skill-vitals-data-%s\" type=\"application/json\">"
                   % mode + json_text_safe + "</script>")
        html = html.replace("</head>", inject + "\n</head>", 1)
        # 同时把 state 文件 cp 到同目录,作为 fetch fallback 的副本——除非
        # 输出目录本来就是 state 目录本身(oneline 自动刷新的场景),那样
        # 会变成把文件写到自己头上,纯浪费一次 I/O。sidecar 写的是**原始**
        # json_text,不是带精算 cost 字段的 embed_text——见上面文档。
        sidecar = out.parent / src_name
        if sidecar.resolve() != src.resolve():
            sidecar.write_text(json_text, encoding="utf-8")
        embedded.append(mode)
    html = html.replace(
        "</head>",
        "<script>window.SKILL_VITALS_DEFAULT_MODE = %r;</script>\n</head>"
        % default_source, 1)
    out.write_text(html, encoding="utf-8")
    return embedded, out


def _augment_calendar_cost(mode, data, pricing):
    """给日历模板的内联数据塞一个按真实模型精算的 cost 字段。

    模板自己那份 `costOf()` 是硬编码 deepseek-v4-flash 单价的近似（见
    calendar.html 头部注释），pro 模型的日子会被低估到 1/3——与
    budget.py 之前那个 bug（已在 `_price_by_model` 修过）同一个根因。
    这里直接复用 `cost.py::cost_report`（唯一算价格的地方），不在这
    再写一份算术，也不在 JS 里再写一份——JS 侧的公式继续留着，只是
    降级成「没有精算数据时的近似兜底」，不是权威路径。

    today.json 的 `by_model` 是**整天一个总量**，没有按小时拆分——没法
    给 24 个小时格子分别精算，所以只在顶层塞一个 `accurate_cost` 供
    summary 卡片用；per-hour 小时格子/tooltip 仍走旧近似，不假装有
    数据实际不具备的精度。month.json 的 `by_model` 是**逐日**的,可以
    给每一天单独精算,直接覆盖那一天的近似值。
    """
    if mode == "today":
        by_model = data.get("by_model")
        if by_model:
            report = cost_module.cost_report({"by_model": by_model}, pricing)
            if report is not None:
                data["accurate_cost"] = {
                    "total": report["total"],
                    "peak_total": report["peak_total"],
                }
    else:
        days = data.get("days")
        if isinstance(days, dict):
            for day in days.values():
                if not isinstance(day, dict):
                    continue
                by_model = day.get("by_model")
                if by_model:
                    report = cost_module.cost_report({"by_model": by_model}, pricing)
                    if report is not None:
                        day["cost"] = {
                            "total": report["total"],
                            "peak_total": report["peak_total"],
                        }


def main():
    """入口。**未捕获异常必须以 2 退出，不是 1。**

    ARCHITECTURE §6.2 把退出码定成对外接口：0 = 无达到阈值的发现，
    1 = 有，2 = 工具自身错误。Python 默认让未捕获异常退出 1 —— 于是
    「扫出了 critical」和「工具崩了」在 CI 眼里是同一个码，而这两件事
    要做的处置完全相反。

    验收时这条真的被踩到：`scan.py`（最朴素的调用）第二次运行崩在
    `None - None`，退出 1，看起来像「有发现」。
    """
    try:
        return _main()
    except SystemExit:
        raise
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception:
        traceback.print_exc()
        sys.exit(2)


def _main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", action="version",
                    version="skill-vitals %s" % __version__)
    ap.add_argument("--host", choices=("all", "claude-code", "codex", "openclaw", "hermes", "workbuddy", "dsh"),
                    default="all", help="Analyze one host; default: scan every supported host separately")
    ap.add_argument("--path", action="append", default=[],
                    help="Additional scan path; repeatable")
    ap.add_argument("--runtime-json", metavar="FILE",
                    help="DSH registry snapshot (ctx.skills.snapshot() output) for probe evidence")
    ap.add_argument("--json", metavar="FILE",
                    help="Write scan JSON to FILE; use - for stdout. Without this option, run doctor.")
    ap.add_argument("--budget", type=int, default=DEFAULT_DESC_BUDGET,
                    help=f"Description character budget; default: {DEFAULT_DESC_BUDGET}")
    ap.add_argument("--all", action="store_true",
                    help="Calculate budget and conflicts over all on-disk skills (diagnostic; default: loaded only)")
    ap.add_argument("--zombie-age", type=int, default=ZOMBIE_MIN_AGE_DAYS,
                    help=f"Minimum installed age for zombie classification; default: {ZOMBIE_MIN_AGE_DAYS}")
    ap.add_argument("--split-threshold", type=int, default=6000,
                    help="Recommend splitting above this tier2_core_tokens value; default: 6000")
    ap.add_argument("--baseline", help="Previous scan JSON used for change comparison")
    ap.add_argument("--fail-on", choices=("none", "critical", "warning", "info"),
                    default="critical",
                    help="Exit code 1 when a finding at this severity is present (for CI). "
                         "Default: critical; none never fails on findings")
    ap.add_argument("--ignore", default="",
                    help="Diagnostic codes excluded from the gate, comma-separated "
                         "(e.g. SV301,SV302). Ignored codes are still printed")
    ap.add_argument("--new-only", action="store_true",
                    help="Gate only diagnostics that are new relative to the baseline; "
                         "exit code 2 without a baseline")
    ap.add_argument("--no-snapshot", action="store_true",
                    help="Disable doctor's automatic snapshot and comparison")
    ap.add_argument("--redact", action="store_true",
                    help="Redact home directories and user names in absolute paths for safe sharing")
    ap.add_argument("--self-root",
                    help="This tool's own skill directory, excluded from security scanning; inferred when omitted")
    ap.add_argument("--redact-names", action="store_true",
                    help="Also redact skill names to stable skill-001-style IDs and drop descriptions")
    # 子命令建在现有参数**之上**：不带子命令 = 原来的扫描行为。
    # 这条不是洁癖 —— SKILL.md 与全部集成测试都依赖裸调用 `--json`，
    # 把扫描降级成子命令会一次性打断所有调用方。
    sub = ap.add_subparsers(dest="cmd")
    p_list = sub.add_parser("list", help="List discovered skills and their effective state")
    p_list.add_argument("--unused", action="store_true", help="Show dormant / zombie only")
    p_list.add_argument("--shadowed", action="store_true", help="Show shadowed copies only")
    p_list.add_argument("--stale", type=int, help="Dormant threshold in days; default: 30")
    p_list.add_argument("--sort", choices=("usage", "cost", "name"), default="cost")
    p_list.add_argument("--top", type=int, help="Show only the first N rows")
    p_list.add_argument("--json", help="Write JSON instead of a table")
    p_over = sub.add_parser("overlap",
                            help="Lexical filter for skills that may compete for similar requests")
    p_over.add_argument("--min", type=float, default=DEFAULT_OVERLAP_MIN,
                        help="Jaccard threshold; default: %.2f" % DEFAULT_OVERLAP_MIN)
    p_over.add_argument("--top", type=int, help="Show only the first N pairs")
    p_over.add_argument("--json", help="Write JSON instead of a table")
    p_doc = sub.add_parser("doctor",
                           help="Turn scan facts into cause, impact, and action")
    p_doc.add_argument("--min", type=float, default=DEFAULT_OVERLAP_MIN,
                       help="Jaccard threshold for SV401; default: %.2f (shared with overlap)"
                            % DEFAULT_OVERLAP_MIN)
    p_doc.add_argument("--json", help="Write diagnostic JSON instead of a report")
    p_doc.add_argument("--no-snapshot", action="store_true",
                       help="Do not save a snapshot or compare automatically")
    p_exp = sub.add_parser("explain",
                           help="Explain why one skill is ineffective and how to fix it")
    p_exp.add_argument("name", help="Skill name or <plugin>:<name>")
    p_exp.add_argument("--min", type=float, default=DEFAULT_OVERLAP_MIN,
                       help="Jaccard threshold for neighbors; default: %.2f (shared with overlap)"
                            % DEFAULT_OVERLAP_MIN)
    p_exp.add_argument("--json", help="Write JSON instead of a report")
    p_snap = sub.add_parser("snapshot", help="Save a snapshot to ~/.skill-vitals/snapshots")
    p_snap.add_argument("--keep", type=int, default=SNAPSHOT_KEEP,
                        help="Retain the newest N snapshots; default: %d; 0 means unlimited" % SNAPSHOT_KEEP)
    p_diff = sub.add_parser("diff", help="Compare with the previous snapshot")
    p_diff.add_argument("file", nargs="?",
                        help="Snapshot file to compare; default: latest")
    p_diff.add_argument("--json", help="Write JSON instead of a report")
    p_beh = sub.add_parser("behavior",
                           help="Audit a DSH session log for high-risk behaviors (SV601-SV610)")
    p_beh.add_argument("session_log", help="Path to the DSH session JSONL log (file or directory)")
    p_beh.add_argument("--json", help="Write findings JSON to FILE; use - for stdout")
    # D11：执行时长审计——工具调用/turn/step/审批等待/hook 消费五路耗时数据。
    # 与 skill-audit 同一种结构（Rust 侧同时有独立子命令），Python CLI 只补
    # duration-audit（本次范围），不补 skill-audit——那是 T11 遗留的一个更早、
    # 更大的 Python CLI 缺口（behavior --json 之前一直没输出 skill 键，这次
    # 修 duration 时顺手在 audit_session_log 里补上了，但"独立的 skill-audit
    # 子命令"本身不在这个 backlog 范围内，留给专门处理它的时候再做）。
    p_dur = sub.add_parser("duration-audit",
                           help="Audit a DSH session log for execution duration "
                                "(tool calls / turns / steps / approvals / hooks)")
    p_dur.add_argument("session_log", help="Path to the DSH session JSONL log (file or directory)")
    p_dur.add_argument("--json", help="Write duration audit JSON to FILE; use - for stdout")
    # ──── M3: 跨会话聚合层（v1.x.x）── 三个新子命令 ─────────────────
    # oneline：单次审计 → oneline.json（覆盖）+ today.json / month.json（合并累加）。
    # 与 behavior 复用同一份 audit_session_log，但额外调 hour_buckets 把折叠
    # 结果写进 state 文件。xbar tick 直接读 oneline.json 不重算 cost —— 重算
    # 两份就两份可能不一致（见 cost.py 顶部 peak/off-peak 计价分支）。
    p_oneline = sub.add_parser("oneline",
                               help="Fold one session audit into the persisted state files")
    p_oneline.add_argument("session_log",
                           help="Path to the DSH session JSONL log")
    p_oneline.add_argument("--no-merge", action="store_true",
                           help="Skip today.json / month.json merge (write oneline.json only)")
    # calendar：把 month.json / today.json 渲染成单文件 HTML。模板来自
    # scripts/skill_vitals/templates/calendar.html（inline CSS/JS，无外链）。
    # 这里只做 copy + （可选）inline JSON，不重做 schema。
    p_cal = sub.add_parser("calendar",
                           help="Render the cost calendar HTML from persisted state")
    p_cal.add_argument("--source", choices=("month", "today"), default="month",
                       help="Which state file to render (default: month)")
    p_cal.add_argument("--output", "-o", required=True,
                       help="Destination HTML path")
    # state：列出 / 清理 state 目录。不接受 --json/--host 等扫描期参数。
    p_state = sub.add_parser("state", help="Inspect or clean the persisted state directory")
    p_state.add_argument("action", choices=("list", "clean"),
                         help="list = show files; clean = remove (with --yes)")
    p_state.add_argument("--yes", action="store_true",
                         help="Skip the confirmation prompt for 'state clean'")
    # ──── M6: 预算告警 ──────────────────────────────────────────
    # show / set / enable / disable / snooze —— 五种动作覆盖 spec §5.5
    p_budget = sub.add_parser("budget",
                              help="Inspect or modify the budget alert thresholds")
    p_budget.add_argument("action", choices=("show", "set", "enable", "disable",
                                             "snooze", "unsnooze"),
                          help="show = current; set = change a field; "
                               "enable/disable = toggle; snooze = silence for Nh")
    p_budget.add_argument("--daily", type=float, default=argparse.SUPPRESS,
                          help="Set daily_cny (元)")
    p_budget.add_argument("--weekly", type=float, default=argparse.SUPPRESS,
                          help="Set weekly_cny")
    p_budget.add_argument("--monthly", type=float, default=argparse.SUPPRESS,
                          help="Set monthly_cny")
    p_budget.add_argument("--peak-share-max", type=float, default=argparse.SUPPRESS,
                          help="Set peak_share_max (0.0–1.0)")
    p_budget.add_argument("--hours", type=float, default=argparse.SUPPRESS,
                          help="snooze duration in hours")
    p_budget.add_argument("--json", action="store_true",
                          help="Emit alert as JSON (for xbar tick)")
    # --fail-on / --ignore 对 behavior 同样有意义（闸门），但 --new-only 没有——
    # 一份会话日志是单次取证输入，没有「相对上次的新增发现」。这里显式补上
    # 前两个，让它们在子命令前后两个位置都能解析（对齐 Rust 的 global=true）。
    # 不放进上面的 `for pp in (...)` 循环，是因为那批参数（--host/--path/--all…）
    # 都是扫描期参数，behavior 不跑扫描，一个都不该收。
    p_beh.add_argument("--fail-on", choices=("none", "critical", "warning", "info"),
                       default=argparse.SUPPRESS)
    p_beh.add_argument("--ignore", default=argparse.SUPPRESS)
    # 子命令要复用扫描参数，故把它们也挂到子解析器上
    for pp in (p_list, p_over, p_doc, p_exp, p_snap, p_diff):
        pp.add_argument("--host", choices=("all", "claude-code", "codex", "openclaw",
                                           "hermes", "workbuddy", "dsh"), default=argparse.SUPPRESS)
        pp.add_argument("--path", action="append", default=argparse.SUPPRESS)
        pp.add_argument("--runtime-json", metavar="FILE", default=argparse.SUPPRESS)
        pp.add_argument("--all", action="store_true", default=argparse.SUPPRESS)
        pp.add_argument("--zombie-age", type=int, default=argparse.SUPPRESS)
        pp.add_argument("--split-threshold", type=int, default=argparse.SUPPRESS)
        pp.add_argument("--budget", type=int, default=argparse.SUPPRESS)
        pp.add_argument("--self-root", default=argparse.SUPPRESS)
        pp.add_argument("--redact", action="store_true", default=argparse.SUPPRESS)
        pp.add_argument("--redact-names", action="store_true", default=argparse.SUPPRESS)
        pp.add_argument("--baseline", default=argparse.SUPPRESS)
        pp.add_argument("--fail-on", choices=("none", "critical", "warning", "info"),
                        default=argparse.SUPPRESS)
        pp.add_argument("--ignore", default=argparse.SUPPRESS)
        pp.add_argument("--new-only", action="store_true", default=argparse.SUPPRESS)

    args = ap.parse_args()
    if getattr(args, "cmd", None):
        # 子命令下这些扫描期参数必须有默认值，下面的主流程要用
        args.baseline = getattr(args, "baseline", None)

    # 负数一律拒绝。**不能静默接受后产出垃圾** —— `--budget -1` 曾经算出
    # `pct_used: -6300.0` 并原样打进摘要行，一个负百分比被当成测量值输出。
    # 拒绝比编一个数好：这是本工具反复申明的那条底线。
    for flag, value in (("--budget", args.budget),
                        ("--zombie-age", args.zombie_age),
                        ("--split-threshold", args.split_threshold)):
        if value is not None and value < 0:
            ap.error("%s cannot be negative (received %d)" % (flag, value))

    # 显式指定「自己」在哪。Python 版本来能靠 __file__ 推断，二进制形态
    # 下那条线断了（二进制装在 npm/cargo 的 bin 目录，与 skill 目录无关），
    # 所以两个实现都提供这个开关，保持命令面一致。
    # **排除是可见的**：被排除的 skill 带着 self_excluded=true 出现在报告里。
    if args.self_root:
        security_module.SELF_SKILL_ROOT = Path(args.self_root).resolve()

    # 行为审计：审计一份 DSH 会话日志的执行轨迹，**不跑 skill 扫描**。
    # 这是独立的取证命令（读会话日志 → 规则引擎 → findings），在扫描之前短路。
    if getattr(args, "cmd", None) == "behavior":
        audit = behavior_module.audit_session_log(args.session_log)
        if audit is None:
            print("session log unavailable: unreadable, malformed, or schema mismatch",
                  file=sys.stderr)
            sys.exit(2)
        (findings, usage, requests, context, compaction, waste, pre_fork, subagents, skill,
         duration, rule_outcomes, usage_coverage, duration_coverage) = audit
        if args.json:
            # `--json` 输出十五个键（rule_outcomes/usage_coverage/
            # duration_coverage 是 P3 group①②③新加的，都是纯附加字段——
            # findings/usage/duration 本身的产出逻辑完全没变，见 behavior.py
            # 的对应文档）。三份用量数据是同一批事件的三种分辨率，不是重复：
            # usage 按模型汇总（成本），requests 保留逐请求时间序列（上下文
            # 占用曲线的数据源），context 是常驻前缀的分类估算。
            #
            # cost 不是 audit 六键之一——它读的是 usage × pricing.json，是 usage
            # 上的一次派生计算（cost.py 顶部注释：纯展示层）。cost_report 是
            # cost_block 和这里唯一算价格的地方，两处不会算出两个数。
            pricing = cost_module.load_pricing()
            cost = cost_module.cost_report(usage, pricing)
            # pre_fork 与 usage 是同一个形状（token_by_model 的输出），所以
            # 定价走同一个 cost_report——**不是**在这里另写一套算法。
            # usage→cost 与 pre_fork→pre_fork_cost 两条路对称：cli.py 就是
            # CLI 的展示层，它给 usage 定价本来就是合法的，给 pre_fork 定价
            # 是补上同一处遗漏的对称性，不是破例。
            #
            # 没分叉时 pre_fork 是 None → pre_fork_cost 也是 None，**不是一个
            # 全零的 cost_report**：「没分叉」和「分叉了但上游没花钱」是两回事。
            pre_fork_cost = (cost_module.cost_report(pre_fork, pricing)
                             if pre_fork is not None else None)
            text = json.dumps({"findings": findings, "usage": usage,
                               "requests": requests, "context": context,
                               "compaction": compaction, "waste": waste,
                               "cost": cost, "pre_fork": pre_fork,
                               "pre_fork_cost": pre_fork_cost,
                               "subagents": subagents,
                               "skill": skill, "duration": duration,
                               "rule_outcomes": rule_outcomes,
                               "usage_coverage": usage_coverage,
                               "duration_coverage": duration_coverage},
                              ensure_ascii=False, indent=2)
            if args.json == "-":
                print(text)
            else:
                Path(args.json).write_text(text, encoding="utf-8")
                print("Wrote %s: %d findings" % (args.json, len(findings)))
        else:
            glyph = {"critical": "✕", "warning": "⚠", "info": "·"}
            for f in findings:
                print("%s %s %s %s (seq %s)" % (
                    glyph[f["severity"]], f["rule"], f["category"], f["evidence"], f["seq"]))
            # 成本块：findings 之后空行 + 费用估算（纯展示层，见 cost.py）。无
            # 可分桶的桶时 cost_block 返回空列表 → 不打印（与 tab 空态同构）。
            pricing = cost_module.load_pricing()
            block = cost_module.cost_block(usage, pricing)
            if block:
                print()
                for line in block:
                    print(line)
            # 闸门与 doctor 同一套 --fail-on/--ignore 语义（无 --new-only，见
            # behavior_gate 的 docstring）。成本不影响退出码——闸门只看风险。
            sys.exit(behavior_module.behavior_gate(findings, args.fail_on, args.ignore))
        return

    # D11：执行时长审计——与 Rust 侧 main.rs 的 DurationAudit 子命令同一种结构
    # （独立子命令 + --json 输出同一份 core 结果 + 人读格式加"最慢的几条"）。
    if getattr(args, "cmd", None) == "duration-audit":
        audit = behavior_module.audit_session_log(args.session_log)
        if audit is None:
            print("session log unavailable: unreadable, malformed, or schema mismatch",
                  file=sys.stderr)
            sys.exit(2)
        duration = audit[9]
        if args.json:
            text = json.dumps(duration, ensure_ascii=False, indent=2)
            if args.json == "-":
                print(text)
            else:
                Path(args.json).write_text(text, encoding="utf-8")
                print("Wrote %s" % args.json)
            return
        tool_calls = duration["tool_calls"]
        turns = duration["turns"]
        steps = duration["steps"]
        approvals = duration["approvals"]
        hooks = duration["hooks"]["executions"]
        if not (tool_calls or turns or steps or approvals or hooks):
            print("No duration data found in session log.")
            return
        print("Tool calls: %d · Turns: %d · Steps: %d · Approvals: %d · Hook executions: %d" % (
            len(tool_calls), len(turns), len(steps), len(approvals), len(hooks)))
        # 最慢的几条工具调用——duration_ms 缺失（incomplete/failed 没等到结果）
        # 的排除在外，不是当成 0（那样反而会排到最前，读成"最快"）。
        timed = [r for r in tool_calls if r["duration_ms"] is not None]
        timed.sort(key=lambda r: r["duration_ms"], reverse=True)
        if timed:
            print("\nSlowest tool calls:")
            for row in timed[:5]:
                name = row["tool_name"] or "(unknown)"
                print("  %s — %dms (%s)" % (name, row["duration_ms"], row["load_status"]))
        return

    # ──── M3 oneline handler ──────────────────────────────────────
    # 与 behavior 同源（同一个 audit_session_log），但**额外**把 hour_buckets
    # 折进 today.json / month.json。审计成本：每会话多跑一次 hour_buckets 折叠
    # （纯函数、与 token_by_model 同采样路径，无额外 I/O）。
    if getattr(args, "cmd", None) == "oneline":
        audit = behavior_module.audit_session_log(args.session_log)
        if audit is None:
            print("session log unavailable: unreadable, malformed, or schema mismatch",
                  file=sys.stderr)
            sys.exit(2)
        (findings, usage, requests, ctx, compaction, waste, pre_fork, subagents, skill,
         duration, _rule_outcomes, _usage_coverage, _duration_coverage) = audit
        pricing = cost_module.load_pricing()
        cost = cost_module.cost_report(usage, pricing)
        if cost is None:
            print("warning: cost_report returned None (no usage samples to price)",
                  file=sys.stderr)
            cost = {"total": 0, "peak_total": 0, "unpriced_tokens": 0,
                    "currency": "CNY"}
        # hour_buckets 复用 token_by_model 的同 step 去重 + peak/off-peak 判定。
        # 与 token_by_model 的不变量已由 tests/test_characterization.py::TestHourBuckets
        # 钉死 —— 两边加起来必须字节相等。
        # 这里再读一次 events 列表（audit_session_log 自己内部读了一次）——
        # 双读换「不破坏 audit_session_log 签名」的简洁性，且 oneline 是
        # 5min tick 而非实时路径，多读一次 JSONL 的成本可忽略。
        from skill_vitals.adapters.dsh import read_session_log
        session = read_session_log(args.session_log)
        events = (session or {}).get("usage_events") or []
        hb = usage_module.hour_buckets(events)
        # 把 cost / hb 折成「一行摘要」。**不要**塞 findings / requests 全文——
        # oneline.json 是 xbar 5min tick 读的，塞多了每次都序列化浪费。
        # tokens_total 必须与 hour_buckets 的 4 桶之和**逐字节相等**
        # (tests/test_cli_m3::TestUsageHourBucketsReconcile 钉死)——
        # 所以这里取 4 桶全量,与 token_by_model 同源。
        tokens_total = sum(
            m["uncached_input_tokens"] + m["output_tokens"]
            + m["cache_read_tokens"] + m["cache_write_tokens"]
            for m in usage["by_model"].values())
        tokens_peak = sum(
            m["peak_uncached_input_tokens"] + m["peak_output_tokens"]
            + m["peak_cache_read_tokens"] + m["peak_cache_write_tokens"]
            for m in usage["by_model"].values())
        # session_id / duration_ms：日志 schema 没显式字段时用文件名 + None
        # 兜底 ——「没数据」与「数据为 0」是两回事（CLAUDE.md §缺列不编列）。
        session_id = Path(args.session_log).stem
        duration_ms = None
        for ev in events:
            if isinstance(ev, dict) and ev.get("type") == "session/end":
                end = ev.get("time")
                if isinstance(end, int) and isinstance(duration_ms, type(None)):
                    duration_ms = end
                    break
        max_sev = "none"
        sev_rank = {"critical": 4, "warning": 3, "info": 2}
        for f in findings:
            r = sev_rank.get(f.get("severity"), 0)
            if r > sev_rank.get(max_sev, 0):
                max_sev = f["severity"]
        summary = {
            "session_id": session_id,
            "session_log": str(args.session_log),
            "duration_ms": duration_ms,
            "model": (list(usage["by_model"].keys()) or ["unknown"])[0],
            "tokens_total": tokens_total,
            "tokens_peak": tokens_peak,
            "cost_cny": cost["total"],
            "cost_peak_cny": cost["peak_total"],
            "unpriced_tokens": cost["unpriced_tokens"],
            "findings_total": len(findings),
            "findings_max_severity": max_sev,
            "hour_buckets_summary": {
                "bucket_count": len(hb["buckets"]),
                "min_date": (hb["buckets"][0]["date"]
                             if hb["buckets"] else None),
                "max_date": (hb["buckets"][-1]["date"]
                             if hb["buckets"] else None),
                "tz_name": hb["tz_name"],
            },
        }
        p_oneline = state_module.write_oneline(summary)
        if not args.no_merge:
            # usage["by_model"] 与 hb 是同一次 audit_session_log 里出来的,
            # 顺带存进 today.json/month.json —— budget.py 按模型精确定价
            # 靠它,而不是永远假设 fallback 模型。
            state_module.merge_today(hb, by_model=usage["by_model"])
            state_module.merge_month(hb, by_model=usage["by_model"])
        # 不管 --no-merge 与否都 append 历史 —— xbar「最近 5 次审计」要靠这个
        state_module.append_session_history(summary)
        # 顺手把 budget.evaluate() 落盘成 alert.json —— xbar 之前完全绕开
        # budget.py，自己在 bash 里硬编码阈值重算一遍百分比，用户改的
        # daily_cny / adaptive floor / snooze 全部对菜单栏不生效。
        # today.json / month.json 已经 merge 完，evaluate() 读的是最新状态。
        alert = budget_module.evaluate()
        state_module.write_alert(alert)
        # 顺手把日历 HTML 刷新到 $STATE_DIR/calendar.html —— xbar「打开
        # 日历」菜单项直接 open 这个固定路径,不需要知道 repo 装在哪里
        # （已安装的 xbar 副本本来就跟 repo 断了联系）。渲染失败(模板缺失
        # 之类)只警告,不中断审计主路径——calendar.html 是展示层产物,
        # 不是审计结果的一部分。
        try:
            _render_calendar_html(state_module.state_dir() / "calendar.html",
                                  default_source="month")
        except Exception as e:
            print("warning: failed to refresh calendar.html: %s" % e, file=sys.stderr)
        # 人读输出 —— 让没装 xbar 的用户在终端也能看一眼「这一会话花了多少」。
        print("session:    %s" % summary["session_id"])
        print("duration:   %s ms" % (summary["duration_ms"] or "?"))
        print("model:      %s" % summary["model"])
        print("tokens:     %s (peak %s)" % (summary["tokens_total"], summary["tokens_peak"]))
        print("cost:       ¥%.4f (peak ¥%.4f)" % (summary["cost_cny"], summary["cost_peak_cny"]))
        if summary["unpriced_tokens"]:
            print("unpriced:   %d tokens (model not in pricing.json)"
                  % summary["unpriced_tokens"])
        print("findings:   %d (max severity: %s)"
              % (summary["findings_total"], summary["findings_max_severity"]))
        if alert["level"] != "disabled":
            print("budget:     %s" % alert["level"])
        print("state:      %s" % p_oneline)
        return

    # ──── M3 calendar handler ─────────────────────────────────────
    # 渲染逻辑在 _render_calendar_html()——oneline 每次跑完也会调它把
    # $STATE_DIR/calendar.html 刷新一遍，供 xbar「打开日历」菜单项用，
    # 两处共用同一份逻辑，不各写一份互相不一致。
    if getattr(args, "cmd", None) == "calendar":
        try:
            embedded, out = _render_calendar_html(args.output, default_source=args.source)
        except FileNotFoundError as e:
            print(str(e), file=sys.stderr)
            sys.exit(2)
        if embedded:
            print("rendered: %s (%d bytes, inline: %s, default tab: %s)"
                  % (out, out.stat().st_size, "+".join(embedded), args.source))
        else:
            # 两份都没有：HTML 仍然渲染,JS 检测到内联数据缺失 → 显示
            # 「无数据」empty state,而不是凭空编一个空 calendar。
            print("rendered: %s (no today.json/month.json yet — "
                  "calendar will show empty state)" % out)
        return

    # ──── M3 state list / clean ───────────────────────────────────
    if getattr(args, "cmd", None) == "state":
        files = state_module.list_state_files()
        if args.action == "list":
            if not files:
                print("(empty)")
                return
            for f in files:
                size = f.stat().st_size
                mtime = f.stat().st_mtime
                print("%-40s %6d B  mtime=%d" % (f.name, size, int(mtime)))
            return
        if args.action == "clean":
            # 顺带扫掉 .lock sidecar（_locked 留下的，与 .json 一一对应）
            lock_files = list(state_module.state_dir().glob("*.json.lock"))
            if not args.yes:
                print("refusing without --yes; %d files would be removed" % len(files),
                      file=sys.stderr)
                sys.exit(2)
            for f in files:
                f.unlink()
            for lf in lock_files:
                lf.unlink()
            print("removed %d files" % len(files))
            return

    # ──── M6 budget 子命令 ──────────────────────────────────────
    if getattr(args, "cmd", None) == "budget":
        if args.action == "show":
            alert = budget_module.evaluate()
            if args.json:
                print(json.dumps(alert, ensure_ascii=False, indent=2,
                                 default=str))
            else:
                cfg = budget_module.load_config()
                print("enabled:           %s" % cfg["enabled"])
                print("daily_cny:         %s" % cfg["daily_cny"])
                print("weekly_cny:        %s" % cfg["weekly_cny"])
                print("monthly_cny:       %s" % cfg["monthly_cny"])
                print("peak_share_max:    %s" % cfg["peak_share_max"])
                print("adaptive_floor:    %s" % cfg["adaptive_floor"])
                print("adaptive_window:   %s days" % cfg["adaptive_window_days"])
                print("adaptive_multiplier: %s" % cfg["adaptive_multiplier"])
                print()
                print("─── today ───")
                print("today_cost:        %s" %
                      ("¥%.2f" % alert["today_cost"] if alert["today_cost"] is not None
                       else "(no data)"))
                print("effective_daily:   ¥%.2f (adaptive_floor_applied=%s)" %
                      (alert["effective_daily_budget"],
                       alert["adaptive_floor_applied"]))
                print("ratio:             %s" %
                      ("%.1f%%" % (alert["ratio"] * 100) if alert["ratio"] is not None
                       else "(no data)"))
                print("peak_share:        %s" %
                      ("%.1f%%" % (alert["peak_share"] * 100)
                       if alert["peak_share"] is not None else "(no data)"))
                print()
                print("─── month ───")
                print("month_cost:        %s" %
                      ("¥%.2f" % alert["month_cost"] if alert["month_cost"] is not None
                       else "(no data)"))
                print("month_ratio:       %s" %
                      ("%.1f%%" % (alert["month_ratio"] * 100)
                       if alert["month_ratio"] is not None else "(no data)"))
                print()
                print("alert level:       %s" % alert["level"])
                if alert["snoozed_until"]:
                    print("snoozed_until:     %s" % alert["snoozed_until"])
                if alert["reasons"]:
                    print()
                    print("reasons:")
                    for r in alert["reasons"]:
                        print("  • %s" % r)
            return
        if args.action == "set":
            changes = {}
            if hasattr(args, "daily"):
                changes["daily_cny"] = args.daily
            if hasattr(args, "weekly"):
                changes["weekly_cny"] = args.weekly
            if hasattr(args, "monthly"):
                changes["monthly_cny"] = args.monthly
            if hasattr(args, "peak_share_max"):
                changes["peak_share_max"] = args.peak_share_max
            if not changes:
                print("no changes specified (use --daily/--weekly/...)", file=sys.stderr)
                sys.exit(2)
            budget_module.write_config(changes)
            print("wrote %s to %s" % (changes, budget_module._config_path()))
            return
        if args.action == "enable":
            budget_module.write_config({"enabled": True})
            print("budget enabled")
            return
        if args.action == "disable":
            budget_module.write_config({"enabled": False})
            print("budget disabled")
            return
        if args.action == "snooze":
            hours = getattr(args, "hours", None)
            if not hours or hours <= 0:
                print("--hours must be positive", file=sys.stderr)
                sys.exit(2)
            from datetime import datetime as _dt, timedelta
            until = (_dt.now(budget_module._BEIJING)
                     + timedelta(hours=hours)).isoformat()
            budget_module.set_snooze(until, reason="cli")
            print("snoozed until %s" % until)
            return
        if args.action == "unsnooze":
            budget_module.clear_snooze()
            print("snooze cleared")
            return

    zombie_age = args.zombie_age
    budget = args.budget
    inventory = build_inventory(
        args.host, args.path, DEFAULT_ROOTS, env=os.environ,
        home=Path(os.path.expanduser("~")), cwd=Path.cwd(),
        runtime_json=getattr(args, "runtime_json", None))
    skills = inventory["skills"]
    scanned = inventory["scanned_roots"]
    unreadable = inventory["unreadable_skills"]
    roots = inventory["roots"]
    enabled_plugins = inventory["enabled_plugins"]
    usage = inventory["usage"]
    host_cfg = inventory["host_config"]
    plugins_known = inventory["plugins_known"]
    workbuddy_mode = inventory["workbuddy_mode"]
    workbuddy_roots = inventory["workbuddy_roots"]
    openclaw_runtime = inventory["openclaw_runtime"]
    codex_runtime = inventory["codex_runtime"]

    out = build_report(
        inventory,
        host=args.host,
        include_all=args.all,
        budget=budget,
        codex_fallback_budget=CODEX_FALLBACK_DESC_BUDGET,
        zombie_age=zombie_age,
        split_threshold=args.split_threshold,
        schema_version=SCHEMA_VERSION,
        home_n=str(Path(os.path.expanduser("~")).resolve()).replace("\\", "/"),
    )
    loaded = [skill for skill in skills if skill["loaded"]]
    budget_report = out["description_budget"]
    trigger_report = out["trigger_data"]
    structure_report = out["structure"]
    security_report = out["security"]
    tier1_total = out["tier1_total_tokens"]


    # 快照要在**算完 diff 之后**才写，否则这一次会拿自己当基线，
    # 变化段永远是空的 —— 一个看起来在工作、实际什么都没比的功能。
    cmd = getattr(args, "cmd", None)
    auto_snapshot = cmd in (None, "doctor") and not getattr(args, "no_snapshot", False) \
        and not args.json
    baseline = args.baseline
    if baseline is None and (auto_snapshot or cmd == "diff" or getattr(args, "new_only", False)):
        baseline = getattr(args, "file", None) or latest_snapshot()
    if baseline:
        out["diff_vs_baseline"] = diff_against(baseline, out)

    if args.redact or args.redact_names:
        out = redact_module.redact(
            out, names=args.redact_names, name_map={},
            home_n=str(Path(os.path.expanduser("~")).resolve()).replace("\\", "/"),
            cwd_n=str(Path.cwd()).replace("\\", "/"))
        out["redacted"] = {
            "paths": True,
            "names": bool(args.redact_names),
            "note": "This output is redacted for sharing. Run a new scan to obtain the original data.",
        }

    # `skill-vitals` 无参数等价于 `doctor`（PRODUCT §5 第一行、§183）。
    #
    # 第一次用的人想知道的是「我的 Agent 到底有没有问题」，不该先学 CLI。
    # 但 SKILL.md 与全部集成测试都靠 `--json <file>` 取原始 JSON，所以判据
    # 是**有没有给 --json**，不是「有没有子命令」—— 那条路径原样保留。
    # 想把 JSON 打到 stdout（原来的裸调用行为）用 `--json -`。
    if not getattr(args, "cmd", None) and not args.json:
        args.min = DEFAULT_OVERLAP_MIN
        render_doctor(out, args)
        sys.exit(_doctor_gate(out, args, auto_snapshot, baseline))

    if getattr(args, "cmd", None) == "list":
        render_list(out, args)
        return
    if getattr(args, "cmd", None) == "overlap":
        render_overlap(out, args)
        return
    if getattr(args, "cmd", None) == "doctor":
        render_doctor(out, args)
        if args.json:
            return
        sys.exit(_doctor_gate(out, args, auto_snapshot and not args.json, baseline))
    if getattr(args, "cmd", None) == "snapshot":
        sys.exit(render_snapshot(out, args))
    if getattr(args, "cmd", None) == "diff":
        sys.exit(render_diff(out, args))
    if getattr(args, "cmd", None) == "explain":
        # 找不到那个名字要以非零退出：脚本调用方靠退出码判断，
        # 打印一行「没找到」然后返回 0 会被当成「查过了，没问题」。
        sys.exit(render_explain(out, args))

    text = json.dumps(out, ensure_ascii=False, indent=2)
    if args.json == "-":
        print(text)
    elif args.json:
        Path(args.json).write_text(text, encoding="utf-8")
        budget_text = (f"{budget_report['pct_used']}% ({budget_report['scope']})"
                       if budget_report["available"] else
                       "configurable (not set for this instance)" if args.host == "openclaw" else "unavailable")
        active_text = (f"{len(loaded)} runtime-visible records"
                       if args.host == "openclaw" else f"{len(loaded)} loaded")
        print(f"Wrote {args.json}: {len(skills)} skills on disk, "
              f"{active_text}, "
              f"approximately {tier1_total} Tier1 tokens, "
              f"description budget {budget_text}, "
              f"trigger data {'available' if trigger_report['available'] else 'unavailable'}, "
              f"{len(structure_report['oversized'])} split candidates, "
              f"{security_report['flagged_count']} security findings "
              f"({security_report['all_cited_count']} contain only citation-like matches and still require review)")

    if unreadable:
        # 也写一份到 stderr：JSON 里那条字段只有解析输出的人会看到，
        # 而直接在终端跑的人同样需要知道清点数字是不完整的。
        print("\nWarning: %d SKILL.md files could not be read and were excluded "
              "(see unreadable_skills):" % len(unreadable), file=sys.stderr)
        for u in unreadable[:10]:
            print("  %s" % u["path"], file=sys.stderr)

    if not skills:
        print("\nNo skills were found. Use --path to specify an installation directory.",
              file=sys.stderr)


if __name__ == "__main__":
    main()
