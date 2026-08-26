"""预算阈值与告警等级 —— M6 落地。

读 ~/.skill-vitals/state/{today,month}.json 与 config.toml 的 [budget] 节，
算三档告警 + peak_share 反博弈检查 + snooze 状态。

设计纪律（每条都有 tests 钉死）：
- 「启发式只排序不裁决」——自适应阈值（max(用户设, 7日均 × 1.5））只决定
  *什么时候*告警，**不**自动调用户设的值；用户设的数永远显示在 budget show
  输出里供对照。
- 「缺列不编列」——today.json 缺场时 today_cost = None，**不**编 0；告警 reasons
  不写「0% used」这种假数。
- 「peak_share 反博弈」——peak cost / total cost > peak_share_max → 红色告警，
  即使总费用还在预算内。Agent 全在高峰期跑会被这条抓到。
- 「snooze 持久化」——snoozed_until 写到 budget.json，每次 read 时检查 now，
  到期自动失效。不需要 cron / event 触发。

依赖：state.py 的 state_dir()、cost.py 的 load_pricing()、usage.py 的
_is_peak_slot 时间归属规则。本文件**不**重写这些 —— 单一真相源原则。

CLAUDE.md §「no third-party supply chain at scan time」：只读 stdlib +
本仓其他模块，**不**引 toml / configparser 之外的依赖。
"""

import json
import os
import re
from datetime import datetime, timedelta, timezone

from . import state
from . import cost as cost_module
from . import usage as usage_module

_BEIJING = timezone(timedelta(hours=8))


# ────────────────────────── 默认预算 ──────────────────────────

DEFAULT_BUDGET = {
    "enabled": True,
    "daily_cny": 30.0,
    "weekly_cny": 180.0,
    "monthly_cny": 600.0,
    "peak_share_max": 0.5,
    "warn_at_ratio": 0.8,
    # 自适应阈值：max(user, 7日均 × 1.5)。这两条保留默认值
    # 但暴露给用户改 —— 7 日窗口/倍率都是常见调参点。
    "adaptive_floor": True,
    "adaptive_window_days": 7,
    "adaptive_multiplier": 1.5,
}


def default_budget():
    """返回 DEFAULT_BUDGET 的深拷贝 —— 防止调用方 mutate 默认值。"""
    return dict(DEFAULT_BUDGET)


# ────────────────────────── 配置文件读写 ──────────────────────────


def _config_path():
    """~/.skill-vitals/config.toml —— 与 snapshots / state 同根。"""
    base = os.environ.get("SKILL_VITALS_HOME")
    if base:
        return os.path.join(base, "config.toml")
    return os.path.expanduser("~/.skill-vitals/config.toml")


# 极简 TOML 解析：只支持本仓 [budget] 节里那 8 个标量字段，
# **不**引 toml 依赖。CLAUDE.md §「no third-party supply chain at scan
# time」—— 引入 toml 库会让 skill-vitals 自身破例。
#
# 为什么不用 configparser：configparser 把 key 全小写，本仓 budget 字段是
# snake_case（peak_share_max），与 configparser 的 lowercase_section_names
# 默认行为冲突。TOML 风格更适合「标量配置」。
_TOML_KV_RE = re.compile(r"^\s*([a-z_]+)\s*=\s*(.+?)\s*$")
_BOOL_MAP = {"true": True, "false": False}


def _parse_scalar(text):
    """'30.0' → 30.0, 'true' → True, '"foo"' → 'foo'。"""
    s = text.strip()
    if s.startswith('"') and s.endswith('"'):
        return s[1:-1]
    if s in _BOOL_MAP:
        return _BOOL_MAP[s]
    try:
        if "." in s:
            return float(s)
        return int(s)
    except ValueError:
        return s  # 留作字符串,边界 fallback


def load_config():
    """读 ~/.skill-vitals/config.toml 的 [budget] 节,与默认预算深合并。

    缺文件 / 缺节 / 缺字段一律走默认 —— 与 CLAUDE.md §「host 能力缺失时
    降级、绝不臆造」同条纪律,但反向：**配置缺失**也要降级而非崩溃。
    """
    cfg = default_budget()
    p = _config_path()
    if not os.path.exists(p):
        return cfg
    try:
        with open(p, "r", encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return cfg
    in_budget = False
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if s.startswith("[") and s.endswith("]"):
            in_budget = (s == "[budget]")
            continue
        if not in_budget:
            continue
        m = _TOML_KV_RE.match(line)
        if not m:
            continue
        key, val = m.group(1), m.group(2)
        if key in cfg:
            cfg[key] = _parse_scalar(val)
    return cfg


def write_config(budget_dict):
    """写 [budget] 节到 config.toml —— 其余节保持原样(append/upsert)。

    CLI `budget set` 用。不引 toml 库 —— 直接拼接。**只**碰 [budget] 节
    的 8 个字段,不会写 [scan] / [redact] 等已有节。

    输入 budget_dict 是「本次要改的字段」—— 未提供的字段从现有配置读,
    再 fallback 到 DEFAULT_BUDGET。这样 CLI 的 `budget set --daily 50`
    只动 daily_cny 一行,其他字段保留(避免误覆盖用户手动改的值)。
    """
    p = _config_path()
    os.makedirs(os.path.dirname(p), exist_ok=True)

    # 先把当前配置读出来作为 base —— 这样能保留「CLI 没改的字段」
    base = load_config()
    base.update(budget_dict)

    existing = ""
    if os.path.exists(p):
        try:
            with open(p, "r", encoding="utf-8") as f:
                existing = f.read()
        except OSError:
            existing = ""

    new_block_lines = ["[budget]"]
    for k in DEFAULT_BUDGET:
        v = base.get(k, DEFAULT_BUDGET[k])
        if isinstance(v, bool):
            new_block_lines.append("%s = %s" % (k, "true" if v else "false"))
        elif isinstance(v, (int, float)):
            new_block_lines.append("%s = %s" % (k, v))
    new_block = "\n".join(new_block_lines) + "\n"

    if "[budget]" in existing:
        before, _, rest = existing.partition("[budget]")
        next_section = re.search(r"\n\[", rest)
        if next_section:
            after_start = next_section.start() + 1
            after = rest[after_start:]
        else:
            after = ""
        merged = before.rstrip() + "\n\n" + new_block + ("\n" + after.lstrip() if after.strip() else "")
    else:
        merged = (existing.rstrip() + "\n\n" if existing.strip() else "") + new_block

    with open(p, "w", encoding="utf-8") as f:
        f.write(merged)


# ────────────────────────── 今日 / 本月 cost 计算 ──────────────────────────


def _bucket_cost(b, pricing):
    """单条 hour/day 桶 → 总价 + 高峰份额价。

    today.json / month.json 不带模型信息(state.py 合并时已丢) —— 这里走
    pricing.json 里**默认 fallback 模型**（通常是 flash）按桶内 4 桶
    + 4 peak_* 字段算总价。peak 占比 = peak_cost / total_cost。
    复用 cost.py::_price 的算术式但绕过模型解析(否则 unknown 模型会被
    标 unpriced,得 0 → peak_share undefined)。
    """
    # 取 fallback 模型 —— pricing.json 顶层有 fallback_provider 字段
    fb_provider = pricing.get("fallback_provider")
    providers = pricing.get("providers") or {}
    if fb_provider and fb_provider in providers:
        models = providers[fb_provider].get("models") or {}
        # flash 优先(pro 比 flash 贵,预算按 flash 算更宽松,留缓冲)
        model_key = "deepseek-v4-flash" if "deepseek-v4-flash" in models else (
            next(iter(models.keys()), None) if models else None)
        if model_key is None:
            return {"total": 0.0, "peak_total": 0.0}
        card = models[model_key]
    else:
        return {"total": 0.0, "peak_total": 0.0}

    def _cost(card_key, bucket_key, peak_bucket_key):
        """一行算一个 token 类型的总成本。

        card_key:      pricing.json 里的字段名 ("input_uncached" 等)
        bucket_key:    state 桶里的字段名 ("uncached_input_tokens" 等)
        peak_bucket_key: state 桶里 peak 子桶的字段名

        两套命名不同 (pricing 是简写,state 是 _tokens 后缀),必须分开传。
        """
        peak_rate = card[card_key]["peak"]
        off_rate = card[card_key]["off_peak"]
        peak_tokens = (b.get(peak_bucket_key) or 0) / 1e6
        total_tokens = (b.get(bucket_key) or 0) / 1e6
        off_tokens = total_tokens - peak_tokens
        return peak_tokens * peak_rate + off_tokens * off_rate

    total = (_cost("input_uncached", "uncached_input_tokens", "peak_uncached_input_tokens")
             + _cost("input_cached", "cache_read_tokens", "peak_cache_read_tokens")
             + _cost("output", "output_tokens", "peak_output_tokens"))
    peak = ((b.get("peak_uncached_input_tokens") or 0) / 1e6
            * card["input_uncached"]["peak"]
            + (b.get("peak_cache_read_tokens") or 0) / 1e6
            * card["input_cached"]["peak"]
            + (b.get("peak_output_tokens") or 0) / 1e6
            * card["output"]["peak"])
    return {"total": total, "peak_total": peak}


def compute_today_cost():
    """today.json → 当日 cost (元) + peak 拆分。

    today.json 缺场返回 None —— 与 CLAUDE.md §「缺列不编列」一致。
    浏览器 tab 渲染时显示「尚无数据」,**不**编 0。
    """
    p = state.state_dir() / "today.json"
    if not p.is_file():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    buckets = data.get("buckets") or {}
    if not buckets:
        return None
    pricing = cost_module.load_pricing()
    total = 0.0
    peak = 0.0
    for b in buckets.values():
        c = _bucket_cost(b, pricing)
        total += c.get("total", 0.0)
        peak += c.get("peak_total", 0.0)
    return {"total": total, "peak_total": peak}


def compute_month_cost():
    """month.json → 当月 cost。与 compute_today_cost 同种「缺列 None」语义。"""
    p = state.state_dir() / "month.json"
    if not p.is_file():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    days = data.get("days") or {}
    if not days:
        return None
    pricing = cost_module.load_pricing()
    total = 0.0
    peak = 0.0
    for b in days.values():
        c = _bucket_cost(b, pricing)
        total += c.get("total", 0.0)
        peak += c.get("peak_total", 0.0)
    return {"total": total, "peak_total": peak}


def compute_7d_avg_daily():
    """近 7 天日均 cost —— 自适应阈值的输入。

    从 month.json 取最近 N 天的「日总和」算术平均。N < 7 时按现有天数
    平均 —— 「窗口不足」**不**报错，按已有数据降级（host 能力缺失纪律）。
    """
    p = state.state_dir() / "month.json"
    if not p.is_file():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    days = data.get("days") or {}
    if not days:
        return None
    pricing = cost_module.load_pricing()
    today_bj = datetime.now(_BEIJING).date()
    total = 0.0
    n = 0
    for offset in range(7):
        d = (today_bj - timedelta(days=offset)).isoformat()
        if d in days:
            c = _bucket_cost(days[d], pricing)
            total += c.get("total", 0.0)
            n += 1
    if n == 0:
        return None
    return total / n


# ────────────────────────── 自适应阈值 ──────────────────────────


def effective_daily_budget(budget=None):
    """`max(user_set, 7d_avg × adaptive_multiplier)` —— 见 spec §5.2。

    缺数据时 (`compute_7d_avg_daily` 返回 None) **不**应用自适应 floor,
    直接返回 user_set —— 与 spec 「窗口不足时降级」一致。
    """
    if budget is None:
        budget = load_config()
    user_set = float(budget.get("daily_cny", DEFAULT_BUDGET["daily_cny"]))
    if not budget.get("adaptive_floor", True):
        return user_set, False
    avg = compute_7d_avg_daily()
    if avg is None:
        return user_set, False
    window = int(budget.get("adaptive_window_days", 7))
    multiplier = float(budget.get("adaptive_multiplier", 1.5))
    floor = avg * multiplier
    if floor > user_set:
        return floor, True
    return user_set, False


# ────────────────────────── 告警等级 ──────────────────────────


def _alert_level(ratio, warn_at=None):
    """ratio → 'ok' / 'near' / 'warn' / 'over'。

    阈值：< 0.7 ok；0.7–0.9 near；0.9–1.0 warn；≥ 1.0 over。
    warn_at 默认 0.8 —— 允许用户调(留给 spec §5.5 后续开关)。
    当前实现把 warn_at 当作 near/warn 的分界(0.7 / warn_at / 1.0 三段)。
    """
    if warn_at is None:
        warn_at = 0.8
    if ratio >= 1.0:
        return "over"
    if ratio >= warn_at:
        return "warn"
    if ratio >= 0.7:
        return "near"
    return "ok"


# 用于比较两个 level 谁更严重 —— 月预算升级只升不降(见 evaluate() 里的
# 用法):今天花得少不该把月预算已经报警的级别压回去,反过来今天报警了
# 也不该被"月预算还好"盖掉。
_LEVEL_SEVERITY = {"ok": 0, "near": 1, "warn": 2, "over": 3}


def evaluate(now=None):
    """今日 / 本月 / peak_share 三维度 → alert dict (见 spec §5.3)。

    `level` 由三路输入取最严重的一个：today ratio、peak_share 反博弈、
    month ratio——之前只有前两路参与判定,月预算配了却从不影响 level
    （`monthly_cny` 只用来算 xbar 显示的百分比），会出现「本月超支
    200%，今天花得少，菜单栏还是绿的」这种误导。

    返回结构:
      {
        "level": "ok" | "near" | "warn" | "over" | "disabled" | "snoozed",
        "ratio": 0.747 | None,
        "peak_share": 0.633 | None,
        "peak_over": True | False,
        "month_ratio": 1.98 | None,
        "reasons": [...],
        "snoozed_until": "..." | None,
        "effective_daily_budget": 30.0,
        "adaptive_floor_applied": False,
        "today_cost": 22.4 | None,
        "today_peak_cost": 14.2 | None,
        "month_cost": ... | None,
        "weekly_cost": ... | None,  # 简化:目前 = month × (7/N),N=month 累计天数
      }
    """
    budget = load_config()
    if not budget.get("enabled", True):
        return {
            "level": "disabled",
            "ratio": None,
            "peak_share": None,
            "peak_over": False,
            "reasons": [],
            "snoozed_until": None,
            "effective_daily_budget": float(budget.get("daily_cny", 30.0)),
            "monthly_cny": float(budget.get("monthly_cny", DEFAULT_BUDGET["monthly_cny"])),
            "month_ratio": None,
            "adaptive_floor_applied": False,
            "today_cost": None,
            "today_peak_cost": None,
            "month_cost": None,
        }
    # snooze 检查:now > snoozed_until → 自动失效
    snoozed_until = _read_snooze()
    if snoozed_until and now is None:
        now = datetime.now(_BEIJING)
    if snoozed_until and now and now >= snoozed_until:
        snoozed_until = None  # 过期

    today = compute_today_cost()
    month = compute_month_cost()
    eff, floor_applied = effective_daily_budget(budget)
    monthly_cny = float(budget.get("monthly_cny", DEFAULT_BUDGET["monthly_cny"]))

    reasons = []
    ratio = None
    peak_share = None
    peak_over = False
    month_ratio = None

    if today is not None and today["total"] > 0:
        ratio = today["total"] / eff if eff > 0 else None
        peak_share = (today["peak_total"] / today["total"]
                      if today["total"] > 0 else 0.0)
        peak_max = float(budget.get("peak_share_max",
                                    DEFAULT_BUDGET["peak_share_max"]))
        peak_over = peak_share > peak_max

        if ratio is not None:
            reasons.append("today at %d%% of daily budget (¥%.2f / ¥%.2f)" %
                           (round(ratio * 100), today["total"], eff))
        if peak_over:
            reasons.append("peak share %d%% exceeds max %d%%" %
                           (round(peak_share * 100), round(peak_max * 100)))
    elif today is None:
        reasons.append("no today.json yet (run `behavior <log>` to start tracking)")

    # 月预算：之前只把 month_cost/monthly_cny 算出来给 xbar 显示,从没真的
    # 参与过 level 判定——用户月预算超了几倍,只要今天花得少,菜单栏照样
    # 显示绿色 💰(实测过:198% 月超支,level 仍是 "ok")。这里用跟 today
    # 同一套 _alert_level 阈值算一遍月度的,下面跟 today 那边的结论取更
    # 严重的那个,不是简单覆盖。
    if month is not None and month["total"] > 0 and monthly_cny > 0:
        month_ratio = month["total"] / monthly_cny
        reasons.append("month at %d%% of monthly budget (¥%.2f / ¥%.2f)" %
                       (round(month_ratio * 100), month["total"], monthly_cny))

    warn_at = float(budget.get("warn_at_ratio", DEFAULT_BUDGET["warn_at_ratio"]))
    if ratio is None:
        level = "ok"  # 无当日数据 = 当日无告警,符合 CLAUDE.md 缺列不编列
    else:
        level = _alert_level(ratio, warn_at=warn_at)
        if peak_over and level != "over":
            # peak 超标强制升级一档(spec §5.4)
            level = "warn" if level == "near" else "over"

    if month_ratio is not None:
        # 只升级,不降级——today 那边已经判出的 warn/over 不会被"月预算
        # 还好"压回去,月预算严重超标时也不会被"今天花得少"盖过去。
        month_level = _alert_level(month_ratio, warn_at=warn_at)
        if _LEVEL_SEVERITY[month_level] > _LEVEL_SEVERITY[level]:
            level = month_level

    if snoozed_until and level in ("warn", "over"):
        # 只压制 warn/over —— near 仍可见(spec 不写但符合 snooze 习惯用法)
        level = "snoozed"

    return {
        "level": level,
        "ratio": ratio,
        "peak_share": peak_share,
        "peak_over": peak_over,
        "reasons": reasons,
        "snoozed_until": (snoozed_until.isoformat() if snoozed_until else None),
        "effective_daily_budget": eff,
        # 用户配置的月预算原样透出 —— xbar「本月累计 X / Y」那一行需要它。
        # 之前 xbar 自己硬编码 ¥500,budget.json/config.toml 改了月预算
        # 也不生效;月预算目前没有自适应 floor（只有日预算有,spec §5.2）,
        # 所以这里直接给 user_set,不需要另算一个 floor_applied。
        "monthly_cny": monthly_cny,
        "month_ratio": month_ratio,
        "adaptive_floor_applied": floor_applied,
        "today_cost": today["total"] if today else None,
        "today_peak_cost": today["peak_total"] if today else None,
        "month_cost": month["total"] if month else None,
    }


# ────────────────────────── snooze 持久化 ──────────────────────────


def _budget_state_path():
    return state.state_dir() / "budget.json"


def _read_snooze():
    """读 budget.json 里的 snoozed_until,过期返回 None。

    与 state.py 的 _read 同款「缺列 None」语义。
    """
    p = _budget_state_path()
    if not p.is_file():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    s = data.get("snoozed_until")
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        # 兼容手写 / 旧版本写入的裸时间戳 —— 没有 tzinfo 就没法跟
        # evaluate() 里 tz-aware 的 `now` 比较(TypeError: can't compare
        # offset-naive and offset-aware datetimes)。本模块统一按北京时间
        # 解释裸时间戳,与 state.py 的 _BEIJING 常量同一约定。
        dt = dt.replace(tzinfo=_BEIJING)
    return dt


def set_snooze(until_iso, reason="user-set"):
    """写 snoozed_until 到 budget.json。until_iso 必须是 ISO8601。
    返回写入后的 budget.json 路径。
    """
    # 验证 ISO8601 —— 与 datetime.fromisoformat 同样的解析路径,失败即抛
    parsed = datetime.fromisoformat(until_iso)
    if parsed.tzinfo is None:
        # 裸时间戳按北京时间解释 —— 见 _read_snooze 同一条注释。
        parsed = parsed.replace(tzinfo=_BEIJING)
    p = _budget_state_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "snoozed_until": parsed.isoformat(),
        "snooze_reason": reason,
        "schema_version": "1.0.0",
    }
    state._atomic_write(p, payload)
    return p


def clear_snooze():
    """清掉 snooze —— 用户从 xbar 菜单点击「取消静默」时调用。"""
    p = _budget_state_path()
    if p.is_file():
        p.unlink()