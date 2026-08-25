#!/usr/bin/env bash
# <xbar.title>Skill Vitals</xbar.title>
# <xbar.version>1.0.0</xbar.version>
# <xbar.author>skill-vitals</xbar.author>
# <xbar.desc>今日 / 本月 token cost + 预算</xbar.desc>
# <xbar.dependencies>python3</xbar.dependencies>
# <xbar.refresh>5m</xbar.refresh>
#
# xbar 把脚本 stdout 第一行当作菜单栏文本，`---` 之后的行作为下拉菜单项。
# 文件名后缀 `.5m.sh` —— xbar / SwiftBar 每 5 分钟触发一次。
#
# 数据契约：
#   oneline.json  最近一次审计的「最后一行」（行为 + cost 摘要），xbar 默认读它
#   today.json    当日 (date, hour) 桶聚合（4+4 字段），用于预算进度
#   month.json    当月逐日聚合（4+4 字段），用于月度预算进度
# 三个文件由 state.py 产出，本脚本只读不写，**所有降级都不抛错**。
#
# 安装：
#   1. cp contrib/xbar/skill-vitals.5m.sh "$HOME/Library/Application Support/xbar/plugins/"
#   2. chmod +x "$HOME/Library/Application Support/xbar/plugins/skill-vitals.5m.sh"
#   3. xbar 自动刷新；或在 xbar 菜单里 "Refresh all"
#
# SwiftBar 把上述 plugin dir 换成 `~/Library/Application Support/SwiftBar/plugins/`。

set -euo pipefail

# ────────────────────────── 常量（预算模块 M6 实施后会从配置读）──

BUDGET_DAILY_CNY=30
BUDGET_MONTHLY_CNY=500

# 简化的固定费率 / M tokens —— 与 pricing.json 中位价对应（v4-flash 与 v4-pro
# 的算术均值）。cache_write 计费系数恒为 0，不写入此表。「简化」是刻意的：
# 浏览器 tick 不做供应商 / 模型解析，那份复杂度留在 cost_report 里。
RATE_INPUT_UNCACHED=3.0   # 元 / M tokens
RATE_INPUT_CACHED=0.10    # 元 / M tokens
RATE_OUTPUT=9.0           # 元 / M tokens
# RATE_CACHE_WRITE = 0 by spec

# 状态目录 —— SKILL_VITALS_HOME 缺省为 ~/.skill-vitals（state.py 路径选择同款）
STATE_DIR="${SKILL_VITALS_HOME:-$HOME/.skill-vitals}/state"
ONELINE_FILE="$STATE_DIR/oneline.json"
TODAY_FILE="$STATE_DIR/today.json"
MONTH_FILE="$STATE_DIR/month.json"

# ────────────────────────── 工具函数 ──────────────────────────

# 选 jq；缺或坏则降级到 python3（一行）。**不安装**任何依赖。
# 探测走烟雾测试（`jq -e . /dev/null`）而不是只看 PATH 是否找到 —— 有些
# 系统装了 jq 但依赖一个不在的 lib，触之即崩，那时 `command -v jq` 仍返回
# 0，脚本会一路走 jq 路径然后被各次失败吃字符串，最终空字段假阴性。
have_jq=0
if command -v jq >/dev/null 2>&1 && echo '{"x":1}' | jq -e . >/dev/null 2>&1; then
    have_jq=1
fi

# 读 JSON 顶层字段；缺 / 坏 → echo 空串（不抛错）。被 set -e 监管的子 shell
# 必须 `|| echo ""` 或 `2>/dev/null || true` —— 否则 empty 时 `jq -e` 退出 1
# 会把脚本带崩。
json_get() {
    local file="$1" key="$2"
    [ -f "$file" ] || { echo ""; return; }
    if [ "$have_jq" -eq 1 ]; then
        # `// empty` 让 None → 空输出；外层 `|| echo ""` 把任何 jq 错误吞掉
        jq -r --arg k "$key" '
            if has($k) then .[$k] | (if . == null then "" else tostring end)
            else "" end
        ' "$file" 2>/dev/null || echo ""
    else
        python3 -c "
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    print(''); sys.exit(0)
v = d.get(sys.argv[2])
if v is None: print('')
else: print(v)
" "$file" "$key" 2>/dev/null || echo ""
    fi
}

# 求 4+4 token 桶 → cost_cny。today.json / month.json 的 buckets / days
# 都按 hour / date str 索引到 8-字段对象；这里两路合一处理。
bucket_cost_cny() {
    local file="$1" key_path="$2"
    [ -f "$file" ] || { echo "0.00"; return; }
    if [ "$have_jq" -eq 1 ]; then
        jq -r --arg p "$key_path" '
            (.[$p] // {}) | [to_entries[].value] |
            map(
                ((.uncached_input_tokens // 0) * '"$RATE_INPUT_UNCACHED"' +
                 (.cache_read_tokens // 0)    * '"$RATE_INPUT_CACHED"' +
                 (.output_tokens // 0)         * '"$RATE_OUTPUT"'
                ) / 1000000
            ) | add // 0
        ' "$file" 2>/dev/null || echo "0.00"
    else
        python3 -c "
import json, sys
try: d = json.load(open(sys.argv[1]))
except Exception: print('0.00'); sys.exit(0)
buckets = (d.get(sys.argv[2]) or {}).values()
total = 0.0
for v in buckets:
    if not isinstance(v, dict): continue
    total += (
        (v.get('uncached_input_tokens', 0) * $RATE_INPUT_UNCACHED +
         v.get('cache_read_tokens', 0)    * $RATE_INPUT_CACHED +
         v.get('output_tokens', 0)         * $RATE_OUTPUT
        ) / 1e6
    )
print(round(total, 2))
" "$file" "$key_path" 2>/dev/null || echo "0.00"
    fi
}

# milliseconds → 「Hh Mm」 / 「Mm」 / 「Ss」；缺 → 「?」
format_duration() {
    local ms="${1:-}"
    case "$ms" in
        ""|null|"0") echo "?"; return ;;
    esac
    # 防小数 / 非数字 —— set -e 下 (( 会爆
    if ! [[ "$ms" =~ ^[0-9]+$ ]]; then echo "?"; return; fi
    local s=$((ms / 1000))
    local h=$((s / 3600))
    local m=$(((s % 3600) / 60))
    if [ "$h" -gt 0 ]; then echo "${h}h${m}m"
    elif [ "$m" -gt 0 ]; then echo "${m}m"
    elif [ "$s" -gt 0 ]; then echo "${s}s"
    else echo "<1s"
    fi
}

# 浮点 → 「¥X.XX」；空 / null → 「¥?」
format_cny() {
    local v="${1:-}"
    case "$v" in
        ""|null) echo "¥?"; return ;;
    esac
    # awk 比 printf %f 更宽容 —— 空 / 字母 / 非数字都走 0
    awk -v x="$v" 'BEGIN { printf "¥%.2f", x + 0 }'
}

# 整数 percent：100*today/budget —— 0 分母时给 0
fmt_percent() {
    local cost="$1" budget="$2"
    awk -v c="$cost" -v b="$budget" 'BEGIN {
        if (b + 0 == 0) { print 0; exit }
        printf "%d", 100 * (c + 0) / (b + 0)
    }'
}

# ────────────────────────── 主流程 ──────────────────────────

# 1. oneline.json 缺场 → 空菜单栏，不报错。
# 双重判定：文件不存在走 a；存在但 schema 字段缺失走 b。两条都算「无最新数据」，
# 与 state.py 的 _read() 把坏 JSON 当 None 等价 —— 「宁可丢一份也不要拼一个」。
if [ ! -f "$ONELINE_FILE" ] || [ -z "$(json_get "$ONELINE_FILE" schema_version)" ]; then
    echo "💤 -"
    exit 0
fi

# 解析 oneline。下列字段**可能缺失** —— oneline.json 是 audit dict 的裁剪版，
# M5 / M6 阶段还没稳定；任何字段读不到都显示「?」，不假装。state.py 的 docstring
# 列的契约是「至少含」，不是「保证含」。
oneline_cost=$(json_get "$ONELINE_FILE" cost_cny)
peak_cny=$(json_get "$ONELINE_FILE" cost_peak_cny)
duration_ms=$(json_get "$ONELINE_FILE" duration_ms)
model=$(json_get "$ONELINE_FILE" model)
session_id=$(json_get "$ONELINE_FILE" session_id)
findings_total=$(json_get "$ONELINE_FILE" findings_total)
findings_sev=$(json_get "$ONELINE_FILE" findings_max_severity)
start_iso=$(json_get "$ONELINE_FILE" session_start)
case "$oneline_cost" in
    ""|null) cost_yuan="¥?" ;;
    *)       cost_yuan=$(format_cny "$oneline_cost") ;;
esac

# 2. 预算 / 菜单栏数字 —— **优先用 today.json 汇总**（今日累计），回落到
# oneline 的会话级 cost。文档要求菜单栏报「当日花费 vs 日预算」，用会话成本
# 当日预算是错档：一次便宜会话已经把今日花超，菜单栏仍显示 💰 —— 提示
# 失真。oneline 缺 / today.json 没跑起来才回落。
today_total=$(bucket_cost_cny "$TODAY_FILE" "buckets")
menu_yuan=""
menu_pct=""
if [ "$today_total" != "0.00" ] && [ "$today_total" != "0" ]; then
    menu_yuan=$(format_cny "$today_total")
    menu_pct=$(fmt_percent "$today_total" "$BUDGET_DAILY_CNY")
elif [ -n "$oneline_cost" ] && [ "$oneline_cost" != "null" ]; then
    menu_yuan="$cost_yuan"
    menu_pct=$(fmt_percent "$oneline_cost" "$BUDGET_DAILY_CNY")
else
    menu_yuan="¥?"
    menu_pct=0
fi

case "$menu_pct" in
    "")           menu_yuan="¥?"; prefix="💰 ${menu_yuan}" ;;
    *)
        if   [ "$menu_pct" -gt 100 ]; then prefix="🚨 ${menu_yuan}"
        elif [ "$menu_pct" -ge 80  ]; then prefix="⚠️ ${menu_yuan}"
        else                                prefix="💰 ${menu_yuan}"
        fi
        ;;
esac

echo "$prefix"

# 3. 下拉菜单 —— `---` 分隔
echo "---"

# 3a. 本次会话一行 —— peak + 时长（来自 oneline，**会话级**，与上面菜单栏的
# 「当日累计」是两套数字，对应两个层次：本次会话成本 vs 今日总开销）
peak_str=$(format_cny "$peak_cny")
dur_str=$(format_duration "$duration_ms")
model_short="${model##*/}"   # "deepseek/deepseek-v4-pro" → "deepseek-v4-pro"
model_short="${model_short:-?}"
echo "本次会话 ${cost_yuan} | peak ${peak_str} | ${dur_str}"

# 3b. 今日 / 本月累计 + 预算百分比（已计算好 today_total，复用）
month_total=$(bucket_cost_cny "$MONTH_FILE" "days")

if [ -f "$TODAY_FILE" ]; then
    today_pct=$(fmt_percent "$today_total" "$BUDGET_DAILY_CNY")
    today_str=$(format_cny "$today_total")
    budget_str=$(format_cny "$BUDGET_DAILY_CNY")
    echo "今日累计 ${today_str} / ${budget_str}（${today_pct}%）"
else
    echo "今日累计：尚无数据"
fi

if [ -f "$MONTH_FILE" ]; then
    month_pct=$(fmt_percent "$month_total" "$BUDGET_MONTHLY_CNY")
    month_str=$(format_cny "$month_total")
    mbudget_str=$(format_cny "$BUDGET_MONTHLY_CNY")
    echo "本月累计 ${month_str} / ${mbudget_str}（${month_pct}%）"
else
    echo "本月累计：尚无数据"
fi

echo "---"

# 3c. 最近一次审计（oneline.json 的「最后一行」语义 —— state.py 不保存历史
# 快照缓冲区，最近 N 次的概念需要 M6 之后再加。当前只展示最近一次。）
if [ -n "$start_iso" ]; then
    # ISO8601 → HH:MM。本机：BSD `date -j -f`（macOS 默认）；
    # Linux：GNU `date -d`。两条都试，失败回 "-"，不抛错（set -e 不能
    # 让一次日期解析把整个 tick 弄崩）。
    hhmm_short="${start_iso%.*}"  # 去掉小数秒，date -f 对其更宽容
    hhmm=$(date -j -f "%Y-%m-%dT%H:%M:%S" "$hhmm_short" "+%H:%M" 2>/dev/null \
                   || date -d "$start_iso" "+%H:%M" 2>/dev/null \
                   || echo "-")
    # findings 切符号：>0 → ⚠️ ；0 → ✓
    case "$findings_total" in
        ""|"0"|"null") mark="✓" ;;
        *)             mark="⚠️" ;;
    esac
    echo "${mark} ${hhmm}  ${cost_yuan}  ${model_short}"
else
    echo "尚无审计"
fi

echo "---"

# 3d. 操作 —— shell= 是 xbar 解析参数，参数化打开。
echo "刷新 (5m)"
echo "打开 state 目录 | shell=/usr/bin/open \"$STATE_DIR\""
echo "打开 docs | shell=/usr/bin/open \"https://github.com/anthropics/skill-vitals\""
