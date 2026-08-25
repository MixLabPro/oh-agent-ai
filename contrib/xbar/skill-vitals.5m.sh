#!/usr/bin/env bash
# <xbar.title>Skill Vitals</xbar.title>
# <xbar.version>1.1.0</xbar.version>
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
#   today.json    当日 (date, hour) 桶聚合（4+4 字段）——本脚本不再直接读它算钱
#   month.json    当月逐日聚合（4+4 字段）——同上
#   alert.json    budget.evaluate() 的落盘结果（level/ratio/effective_daily_budget/
#                 monthly_cny/snoozed_until……），预算颜色与百分比**唯一权威来源**
# 四个文件由 state.py 产出（alert.json 由 `oneline` 命令在写 today/month 之后
# 顺手调 budget.evaluate() 写出），本脚本只读不写，**所有降级都不抛错**。
#
# v1.1.0 之前，本脚本自己在 bash 里硬编码 ¥30/¥500 两个阈值、用一份简化
# 固定费率重新估算 today/month 的花费——budget.py 的 daily_cny/adaptive
# floor/snooze/peak_share_max 全部对菜单栏不生效（`budget show` 里全对，
# 菜单栏上全错）。现在颜色/百分比只看 alert.json；alert.json 缺场（还没
# 跑过一次新版 oneline，或 budget.enabled=false）时**不臆造预算百分比**，
# 退化成只显示本次会话花费、不带颜色判定。
#
# 安装：
#   1. cp contrib/xbar/skill-vitals.5m.sh "$HOME/Library/Application Support/xbar/plugins/"
#   2. chmod +x "$HOME/Library/Application Support/xbar/plugins/skill-vitals.5m.sh"
#   3. xbar 自动刷新；或在 xbar 菜单里 "Refresh all"
#
# SwiftBar 把上述 plugin dir 换成 `~/Library/Application Support/SwiftBar/plugins/`。
# 注意：安装是一次性 `cp`，不是符号链接——skill-vitals 仓库里的脚本之后再修，
# 已安装的副本不会跟着变，需要重新执行上面的 cp（或重跑 install_swiftbar.sh）。

set -euo pipefail

# 状态目录 —— SKILL_VITALS_HOME 缺省为 ~/.skill-vitals（state.py 路径选择同款）
STATE_DIR="${SKILL_VITALS_HOME:-$HOME/.skill-vitals}/state"
ONELINE_FILE="$STATE_DIR/oneline.json"
ALERT_FILE="$STATE_DIR/alert.json"

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

# 整数 percent：100*cost/budget —— 0 分母 / 空值时给空串（不是 0，"0%" 会被
# 误读成「没花钱」，而实际是「budget 数字缺或 0，算不出百分比」）。
fmt_percent() {
    local cost="$1" budget="$2"
    case "$cost" in ""|null) echo ""; return ;; esac
    awk -v c="$cost" -v b="$budget" 'BEGIN {
        if (b + 0 <= 0) { exit }
        printf "%d", 100 * (c + 0) / (b + 0)
    }'
}

# alert.json 的 ratio 字段已经是 0..1 的小数（budget.evaluate() 算好的，
# 含 adaptive floor），这里只是转成整数百分比，不重新计算阈值。
pct_from_ratio() {
    local r="${1:-}"
    case "$r" in ""|null) echo ""; return ;; esac
    awk -v r="$r" 'BEGIN { printf "%d", r * 100 }'
}

# 紧凑格式:金额 ≥ ¥100 隐藏小数,让菜单栏不挤;< ¥100 时走 format_cny
# 统一成两位小数 —— alert.json 里的浮点数是 Python 算出来的原始值（可能带
# 一长串浮点误差,比如 5.130000000001),不能直接拼在 "¥" 后面就往菜单栏
# 上贴,那样反而比压缩之前更难看。状态 emoji 后不加空格 — xbar 渲染时会
# 保留,我们节省 4 个字符 ≈ 节省 32px。**接收裸数值**（不带 "¥" 前缀）——
# 调用方自己剥。
yuan_compact() {
    local v="${1:-}"
    case "$v" in
        ""|"null") echo "¥?" ;;
        *)
            # awk 走整数部分;>=100 时只显示整数
            local int_part=$(awk "BEGIN { printf \"%d\", $v }" 2>/dev/null || echo "")
            if [ -z "$int_part" ]; then
                echo "¥?"  # 非数字垃圾输入 —— 不拼进菜单栏
                return
            fi
            local int_abs=$(awk "BEGIN { v = $int_part; if (v < 0) v = -v; print v }" 2>/dev/null || echo "0")
            if [ "$int_abs" -ge 100 ] 2>/dev/null; then
                echo "¥${int_part}"
            else
                format_cny "$v"
            fi
            ;;
    esac
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
# 任何字段读不到都显示「?」，不假装。state.py 的 docstring 列的契约是
# 「至少含」，不是「保证含」。
oneline_cost=$(json_get "$ONELINE_FILE" cost_cny)
peak_cny=$(json_get "$ONELINE_FILE" cost_peak_cny)
duration_ms=$(json_get "$ONELINE_FILE" duration_ms)
model=$(json_get "$ONELINE_FILE" model)
case "$oneline_cost" in
    ""|null) cost_yuan="¥?" ;;
    *)       cost_yuan=$(format_cny "$oneline_cost") ;;
esac

# 2. 预算 / 菜单栏颜色 —— 唯一权威来源是 alert.json（budget.evaluate() 的
# 落盘结果）。缺场时不臆造百分比，退化成只显示本次会话花费。
alert_level=$(json_get "$ALERT_FILE" level)
alert_today_cost=$(json_get "$ALERT_FILE" today_cost)
alert_eff_daily=$(json_get "$ALERT_FILE" effective_daily_budget)
alert_ratio=$(json_get "$ALERT_FILE" ratio)
alert_month_cost=$(json_get "$ALERT_FILE" month_cost)
alert_monthly_cny=$(json_get "$ALERT_FILE" monthly_cny)
alert_snoozed=$(json_get "$ALERT_FILE" snoozed_until)

have_alert=0
case "$alert_level" in
    ""|disabled) have_alert=0 ;;
    *)           have_alert=1 ;;
esac

if [ "$have_alert" -eq 1 ]; then
    menu_yuan_compact=$(yuan_compact "$alert_today_cost")
    case "$alert_level" in
        over)    prefix="🚨${menu_yuan_compact}" ;;
        warn)    prefix="⚠️${menu_yuan_compact}" ;;
        snoozed) prefix="🔕${menu_yuan_compact}" ;;
        *)       prefix="💰${menu_yuan_compact}" ;;  # ok / near
    esac
else
    # 没有可用的 alert（还没跑过一次新版 oneline，或 budget 已关闭）——
    # 退化到本次会话成本，不带颜色判定，也不隐藏小数（这个数通常 < ¥100）。
    prefix="💰${cost_yuan}"
fi

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

# 3b. 今日 / 本月累计 + 预算百分比 —— 全部来自 alert.json；缺场时说明原因
# 而不是编一个数字出来。
if [ "$have_alert" -eq 1 ]; then
    today_str=$(format_cny "$alert_today_cost")
    eff_daily_str=$(format_cny "$alert_eff_daily")
    today_pct=$(pct_from_ratio "$alert_ratio")
    if [ -n "$today_pct" ]; then
        echo "今日累计 ${today_str} / ${eff_daily_str}（${today_pct}%）"
    else
        echo "今日累计 ${today_str} / ${eff_daily_str}"
    fi

    case "$alert_month_cost" in
        ""|null)
            echo "本月累计：尚无数据"
            ;;
        *)
            month_str=$(format_cny "$alert_month_cost")
            mbudget_str=$(format_cny "$alert_monthly_cny")
            month_pct=$(fmt_percent "$alert_month_cost" "$alert_monthly_cny")
            if [ -n "$month_pct" ]; then
                echo "本月累计 ${month_str} / ${mbudget_str}（${month_pct}%）"
            else
                echo "本月累计 ${month_str} / ${mbudget_str}"
            fi
            ;;
    esac

    if [ -n "$alert_snoozed" ] && [ "$alert_snoozed" != "null" ]; then
        echo "🔕 告警已静默至 ${alert_snoozed}"
    fi
elif [ "$alert_level" = "disabled" ]; then
    echo "预算告警：已关闭（skill-vitals budget enable 重新打开）"
else
    echo "今日 / 本月累计：等预算数据（跑一次 oneline 后可用）"
fi

echo "---"

# 3c. 最近 N 次审计 — 读 sessions.jsonl 尾部 (state.py 追加日志)。
# 之前 oneline 只显示「最近一次」,M8 起 sessions.jsonl 保留历史,
# xbar 用 tail -N 拿最近 5 条。文件不存在 → 「尚无审计」降级文案。
SESSIONS_FILE="$STATE_DIR/sessions.jsonl"
if [ -f "$SESSIONS_FILE" ] && [ -s "$SESSIONS_FILE" ]; then
    # tail -5 → 5 行 JSONL,逐行用 python3 解析(避免 jq 缺场时连不上)
    tail -n 5 "$SESSIONS_FILE" | python3 -c "
import json, sys, datetime
for ln in sys.stdin:
    ln = ln.strip()
    if not ln: continue
    try:
        s = json.loads(ln)
    except Exception:
        continue
    iso = s.get('generated_at') or s.get('session_end') or ''
    hhmm = '-'
    if iso:
        try:
            dt = datetime.datetime.fromisoformat(iso.replace('Z','+00:00'))
            hhmm = dt.strftime('%H:%M')
        except Exception:
            pass
    cost = s.get('cost_cny')
    cost_str = '-'
    if cost is not None:
        cost = float(cost)
        cost_str = ('%.2f' % cost) if cost < 100 else ('%d' % round(cost))
        cost_str = '¥' + cost_str
    findings = s.get('findings_total') or 0
    mark = '✓' if int(findings) == 0 else '⚠️'
    model = (s.get('model') or '?').split('/')[-1]
    print('%s %s  %s  %s' % (mark, hhmm, cost_str, model))
"
else
    echo "尚无审计"
fi

echo "---"

# 3d. 操作 —— shell= 是 xbar 解析参数，参数化打开。
echo "刷新 (5m)"
echo "打开 state 目录 | shell=/usr/bin/open \"$STATE_DIR\""
echo "打开 docs | shell=/usr/bin/open \"https://github.com/anthropics/skill-vitals\""
