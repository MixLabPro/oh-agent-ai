"""Claude Code 会话账 fold 的 Python 平行实现。

单一真相源是 `src/agent/claude_cost.rs`——那里的模块头注释讲清了为什么
cost-state 是账单真值、行只给按天归属（基线 **replace 不是 add**、两条同值
cost-state + 中间有 usage 行不双计）、行读做两态形状嗅探（API 全形 snake 优先、
短键兜底，两态皆无 → 哨兵，绝不把认不出的 usage 当 0）、checkpoint 用
(size, mtime_ns) 当状态（无时间戳字段，字节确定性由构造保证）、ledger 每次
全量重建（不是增量累加——那是 2026-08 三倍计数事故的温床）。

这一份是它的逐字节镜像，由 `tests/test_claude_cost.py` 的 `both()` 差分看守
（同一批 fixture 会话文件 → 两侧 fold.json/ledger/archive/stdout 字节一致；
`archived_at` 与 month-archive 同款会带 now 时间戳，差分对 ISO 打码）。

Fencing 同 oneline 的 Python 写者纪律：owner 是 rust 时拒绝（writer fencing
§4.2——防迁移期双写），缺 manifest（owner=python 回退）正常写；`--shadow`
演练跳过。与 Rust `require_rust_owner(shadow)` 互为镜像——差分测试里 Rust 走
`--shadow`、Python 走默认（owner=python 的种子基线），谁都不真 cutover。
"""
import json
from datetime import date, timedelta

from .codex_cost import current_month_beijing
from .state import _atomic_write, _now_iso, _read, state_dir

# 行级 usage 的 4 个计数键（API 全形，真机 100%；写入桶的固定键序）。
SNAKE_KEYS = ["input_tokens", "cache_read_input_tokens",
              "cache_creation_input_tokens", "output_tokens"]
# 短键旧形状（真机 0 命中，仍认——旧客户端语料）。顺序与 SNAKE_KEYS 一一对应。
SHORT_KEYS = ["input", "cache_read", "cache_creation", "output"]
# cost-state modelUsage 的 camel 键，同样一一对应。
CAMEL_KEYS = ["inputTokens", "cacheReadInputTokens",
              "cacheCreationInputTokens", "outputTokens"]

# 北京日线的月末天数表（add_day 用；年份闰判定走公历规则）。
_DIM = {1: 31, 3: 31, 5: 31, 7: 31, 8: 31, 10: 31, 12: 31,
        4: 30, 6: 30, 9: 30, 11: 30}


def _fold_path():
    return state_dir() / "claude-fold.json"


def _ledger_path():
    return state_dir() / "claude-ledger.json"


def _ledger_archive_path():
    return state_dir() / "claude-ledger-archive.json"


def month_key_of(date_str):
    """"YYYY-MM-DD" → "YYYY-MM"（前 7 字符）。"""
    return date_str[:7]


def day_from_iso_ts(ts):
    """ISO 时间戳（`YYYY-MM-DDTHH:MM:SS[.fff]Z`）→ **北京日** "YYYY-MM-DD"。

    Rust `claude_cost.rs::day_from_iso_ts` 的镜像（同一组单测 fixture 在两侧各
    钉一遍）。为什么从字符串直接算而不经 epoch：真机 100% 定宽 Z 格式，日线只
    需日期 + 小时两截——北京 = UTC+8，UTC 时刻小时 ≥ 16 就跨到次日。非 ASCII /
    非 Z 后缀 / 超界数字 → None（哨兵，绝不猜时区——带 `+05:00` 的旧格式若
    存在，按 UTC 算会把日线算错）。
    """
    if not isinstance(ts, str) or not ts.isascii():
        return None
    if len(ts) < 20 or ts[10] != "T" or not ts.endswith("Z"):
        return None
    try:
        y = int(ts[0:4])
        mo = int(ts[5:7])
        d = int(ts[8:10])
        hh = int(ts[11:13])
    except ValueError:
        return None
    if not 1 <= mo <= 12 or not 1 <= d <= 31 or hh > 23:
        return None
    if hh >= 16:
        y, mo, d = _add_day(y, mo, d)
    return "%04d-%02d-%02d" % (y, mo, d)


def _add_day(y, mo, d):
    """公历日 +1（月末/年末/闰年走同一张表）。镜像 Rust add_day。"""
    if mo == 2:
        leap = (y % 4 == 0 and y % 100 != 0) or y % 400 == 0
        dim = 29 if leap else 28
    else:
        dim = _DIM.get(mo, 31)
    if d < dim:
        return y, mo, d + 1
    if mo == 12:
        return y + 1, 1, 1
    return y, mo + 1, 1


def day_from_ms(ms):
    """epoch 毫秒 → 北京日。cost-state 的 `startTime`（会话起始，ms）走这条。

    与 Rust 的 `civil_from_unix_secs(ms.div_euclid(1000), 8*3600)` 同值：ms ≥ 0
    时 `// 1000` 就是 floor，`date(1970,1,1) + timedelta` 是同一本格里高利历。
    负 ms 两侧也同（floor div 与 div_euclid 同义）——但真机无负 startTime，
    两侧各自的钉测用正 ms 就够了。
    """
    secs = ms // 1000 + 8 * 3600
    return (date(1970, 1, 1) + timedelta(days=secs // 86400)).isoformat()


def _bump_obj(obj, t):
    """4 桶加到 `obj`（4 个 snake 键的桶 dict，如 tail_days[day][model]）。"""
    for i, k in enumerate(SNAKE_KEYS):
        obj[k] = int(obj.get(k) or 0) + int(t[i])


def _inc(sess, key):
    """会话状态上的哨兵计数器 +1（unattributed_rows / unreadable_usage_rows）。"""
    sess[key] = int(sess.get(key) or 0) + 1


def _row_tokens(usage):
    """从 usage 对象嗅 4 桶 token。两态都认、全形优先；键在而值不是数 → 该形
    状不算命中（corpus 值全 int）。两态皆无 → None → 哨兵计数（P0）。"""
    if not isinstance(usage, dict):
        return None
    for keys in (SNAKE_KEYS, SHORT_KEYS):
        out = []
        for k in keys:
            v = usage.get(k)
            if not isinstance(v, int) or isinstance(v, bool):
                break
            out.append(v)
        if len(out) == 4:
            return out
    return None


def _camel_entry_tokens(entry):
    """从 cost-state modelUsage 的**单个模型条目**（camelCase）读 4 桶。
    键不全（真机没见过——客户端漂移）→ None → 哨兵。"""
    if not isinstance(entry, dict):
        return None
    out = []
    for k in CAMEL_KEYS:
        v = entry.get(k)
        if not isinstance(v, int) or isinstance(v, bool):
            return None
        out.append(v)
    return out


def _apply_record(sess, rec):
    """一条记录 → 会话状态转换（assistant 行入尾差、cost-state 换基线）。
    纯函数：`sess` 是 claude-fold.json 里 `sessions[sid]` 的 dict。"""
    # tail_days 是 assistant 行的落点；fresh 会话第一个 assistant 行进来时
    # 还没有这个键（cost-state 才会显式 reset 成 {}）——懒建，别 expect。
    sess.setdefault("tail_days", {})
    rtype = rec.get("type") if isinstance(rec, dict) else None
    if rtype == "cost-state":
        # 基线替换：modelUsage 是整段会话的累计自报（真机两条同值 cost-state
        # 逐字段相同证明）。换基线、清尾差——**不叠加**；「两条同值 cost-state
        # + 中间有 usage 行」→ 中间行已被新基线包含，清掉正好不双计。
        usage = rec.get("modelUsage")
        baseline = {}
        if isinstance(usage, dict):
            for model, entry in usage.items():
                t = _camel_entry_tokens(entry)
                if t is None:
                    _inc(sess, "unreadable_usage_rows")
                else:
                    baseline[model] = dict(zip(SNAKE_KEYS, t))
        else:
            _inc(sess, "unreadable_usage_rows")
        sess["baseline"] = baseline
        # 基线日 = startTime（会话起始 ms → 北京日）；缺 startTime 退到本条
        # 记录自己的 ts 日（v1 文档化近似，模块头注释）。都没有 → unattributed
        # 哨兵（基线仍存 checkpoint，重建时无日可归）。
        day = None
        st = rec.get("startTime")
        if isinstance(st, int) and not isinstance(st, bool):
            day = day_from_ms(st)
        if day is None:
            day = day_from_iso_ts(rec.get("timestamp"))
        if day is not None:
            sess["baseline_day"] = day
        else:
            _inc(sess, "unattributed_rows")
            sess["baseline_day"] = None
        sess["tail_days"] = {}
        return
    if rtype != "assistant":
        return
    msg = rec.get("message")
    if not isinstance(msg, dict):
        return
    usage = msg.get("usage")
    has_usage = isinstance(usage, dict) and bool(usage)
    if not has_usage:
        return  # 无 usage 的 assistant 行不是 usage 行
    model = msg.get("model")
    if not isinstance(model, str) or not model:
        # 有 usage 但没 model → 无处可挂 → 哨兵，绝不编一个模型名。
        _inc(sess, "unreadable_usage_rows")
        return
    t = _row_tokens(usage)
    if t is None:
        _inc(sess, "unreadable_usage_rows")  # 两态皆无 → 哨兵（P0）
        return
    day = day_from_iso_ts(rec.get("timestamp"))
    if day is None:
        # 行有 usage 但 ts 不可解析 → 日线无处可挂 → 哨兵，不猜日。
        _inc(sess, "unattributed_rows")
        return
    day_obj = sess["tail_days"].setdefault(day, {})
    model_obj = day_obj.setdefault(model, {})
    _bump_obj(model_obj, t)


def _merge_models_into_day(day, buckets):
    """把 `{model: {4 snake}}` 桶并进一个**已铺平到 model 层**的日对象
    （多会话同日相加——逐会话 replacement 会丢别的会话，ledger 必须全量重建，
    这就是不增量累加的原因）。"""
    if not isinstance(buckets, dict):
        return
    for model, t4 in buckets.items():
        if not isinstance(t4, dict):
            continue
        arr = [0, 0, 0, 0]
        any_hit = False
        for i, k in enumerate(SNAKE_KEYS):
            v = t4.get(k)
            if isinstance(v, int) and not isinstance(v, bool):
                arr[i] = v
                any_hit = True
        if not any_hit:
            continue
        _bump_obj(day.setdefault(model, {}), arr)


def _stat_file(path):
    """(size, mtime_ns)，stat 失败 → None（枚举与 stat 之间文件消失 → 不计）。"""
    try:
        st = path.stat()
    except OSError:
        return None
    return st.st_size, st.st_mtime_ns


def _read_suffix(path, from_byte):
    """从字节偏移 `from` 读完整行，逐行解析。返回 (记录列表, 新偏移)。

    末行无换行符 → 不消费（客户端可能正写到一半，下个 sync 补上）。完整行
    JSON 解析失败 → 抛错（整份 abort、checkpoint 不动，下次 sync 重试——与
    claude_session 的「一条坏行毁整份」同款，绝不拼半截）。
    """
    with open(path, "rb") as f:
        f.seek(from_byte)
        data = f.read()
    records = []
    pos = from_byte
    start = 0
    for i, byte in enumerate(data):
        if byte == 0x0A:  # \n
            line = data[start:i]
            if line.endswith(b"\r"):
                line = line[:len(line) - 1]
            if line:
                try:
                    rec = json.loads(line.decode("utf-8", errors="replace"))
                except ValueError as e:
                    raise ValueError(
                        "non-json line in %s at byte offset %d: %s"
                        % (path, from_byte + start, e)) from e
                records.append(rec)
            pos = from_byte + i + 1
            start = i + 1
    return records, pos


def _fold_one(sessions, path, size, mtime):
    """一个会话文件折进 `sessions`。返回折叠类别（"new" 含整份重折替换）。
    对应 Rust `fold_one` → FoldKind（New/Resume/Skip）。"""
    sid = path.stem
    existing = sessions.get(sid)
    if not isinstance(existing, dict):
        # 缺 / fold.json 被手改坏 → 整份重折替换（与 Rust `as_object` 的
        # None 分支同结果）。
        from_byte, kind = 0, "new"
    else:
        csize = int(existing.get("size") or 0)
        cmtime = int(existing.get("mtime_ns") or 0)
        if size == csize and mtime == cmtime:
            return "skip"
        if size <= csize:
            # 截断重写 / 原地重写 → 整份重折替换
            from_byte, kind = 0, "new"
        else:
            from_byte, kind = csize, "resume"
    records, new_pos = _read_suffix(path, from_byte)
    # existing 不是 dict（fold.json 被手改坏）→ 当整份重折替换，与 Rust 的
    # `as_object().cloned().unwrap_or_default()` 同结果。
    sess = {} if kind == "new" else dict(existing) if isinstance(existing, dict) else {}
    for rec in records:
        _apply_record(sess, rec)
    sess["size"] = new_pos
    sess["mtime_ns"] = mtime
    sessions[sid] = sess
    return kind


def _rebuild_days(sessions, current):
    """从会话状态全量重建逐日桶。返回 (当前月 ledger days, 要滚进归档的 days)。"""
    all_days = {}
    if isinstance(sessions, dict):
        for sess in sessions.values():
            if not isinstance(sess, dict):
                continue
            # 基线 → baseline_day；tail_days → 各自的日子。同一个日会被多会话
            # 贡献 → 先全量并进 all，再统一分月。
            bd = sess.get("baseline_day")
            if isinstance(bd, str):
                b = sess.get("baseline")
                if isinstance(b, dict):
                    _merge_models_into_day(
                        all_days.setdefault(bd, {}), b)
            tail = sess.get("tail_days")
            if isinstance(tail, dict):
                for day, buckets in tail.items():
                    _merge_models_into_day(
                        all_days.setdefault(day, {}), buckets)
    # 分月：当前月 → ledger；更早的日子 → 归档（写侧逐日替换幂等）。
    ledger = {}
    archive = {}
    for day, merged in all_days.items():
        if month_key_of(day) == current:
            ledger[day] = merged
        else:
            archive[day] = merged
    return ledger, archive


def _add_days_to_archive(archive, days_by_date, now_iso):
    """把若干「日桶」并进归档文件,**逐日替换**而不是累加（镜像 core
    `state.rs::add_days_to_archive`——同一份纯函数语义，写 claude 自己的
    归档文件、不碰 DSH 的 month-archive）。幂等：写完归档、还没来得及从
    ledger 挪走就崩溃，下次重跑得到完全一样的结果。
    """
    out = dict(archive or {})
    months = out.setdefault("months", {})
    for date_str, day in days_by_date.items():
        entry = months.setdefault(month_key_of(date_str), {"days": {}})
        entry["days"][date_str] = day  # 逐日替换 —— 幂等
        entry["archived_at"] = now_iso
    from .state import SCHEMA_VERSION
    out["schema_version"] = SCHEMA_VERSION
    return out


def _strip_archive_ts(archive):
    """剥掉归档里每个月的 archived_at（写入时刻的元数据，不参与内容比较）。
    镜像 Rust `strip_archive_ts`——claude_sync 的归档写条件依赖它。"""
    import copy
    out = copy.deepcopy(archive) if archive else {}
    for entry in (out.get("months") or {}).values():
        if isinstance(entry, dict):
            entry.pop("archived_at", None)
    return out


def claude_sync(home, shadow=False):
    """`claude-sync` 主入口：发现变化会话 → 尾读折入 checkpoint → 重建
    ledger + 归档 → 打印确定性摘要（与 Rust 三行逐字节一致）。fencing 同
    oneline 的 Python 写者纪律：owner=rust 时拒绝（exit 2 由 CLI 层转），
    --shadow 跳过。单文件坏行只计 failed、不 abort 整轮（下轮重试）。

    与 Rust `claude_cost.rs::claude_sync` 一一对应；home 为会话目录根
    （.claude/projects 的父），通常由 CLI 从环境解析传入。
    """
    from ..adapters.claude_session import claude_project_files
    from .takeover import owner_allows_python

    if not shadow and not owner_allows_python():
        # 镜像 Rust 的 Err(String)：CLI 层捕获后转 exit 2（Rust 侧同款）。
        raise ValueError(
            "writer fencing: state owner is 'rust', not 'python'; run "
            "'state takeover python' first, or --shadow to rehearse on a copy")

    files = claude_project_files(home)
    fp = _fold_path()
    folds = _read(fp) or {"sessions": {}}
    sessions = folds.setdefault("sessions", {})
    scanned = fresh = resumed = skipped = failed = 0
    for path in files:
        scanned += 1
        st = _stat_file(path)
        if st is None:
            continue  # 枚举与 stat 之间文件消失 → 不计（下轮不再有它）
        size, mtime = st
        try:
            kind = _fold_one(sessions, path, size, mtime)
        except (OSError, ValueError):
            failed += 1
            continue
        if kind == "new":
            fresh += 1
        elif kind == "resume":
            resumed += 1
        else:
            skipped += 1
    # 摘要统计（最终态）：基线会话数 / 纯行和会话数 / 两个哨兵计数。
    with_baseline = row_sum_only = unreadable = unattributed = 0
    for sess in sessions.values():
        if not isinstance(sess, dict):
            continue
        if "baseline" in sess:
            with_baseline += 1
        else:
            row_sum_only += 1
        unreadable += int(sess.get("unreadable_usage_rows") or 0)
        unattributed += int(sess.get("unattributed_rows") or 0)
    _atomic_write(fp, folds)
    # 全量重建 ledger + 归档（幂等；崩溃重跑不会双计）。rebuild_days 吃的是
    # sessions 映射（sid → 会话状态），不是 {"sessions": …} 外壳——两层结构
    # 刚写出时混过一次：把外壳喂进去，整本折叠空账，ledger 恒为空还不报错
    # （smoke 时抓到的同款 bug 在 Rust 侧一行同型，两侧一起修）。
    now = _now_iso()
    current = current_month_beijing()
    ledger_days, archive_days = _rebuild_days(folds.get("sessions"), current)
    # 归档只在**日桶内容**变化时落盘：_add_days_to_archive 每调用都会给当月
    # 盖一个新 archived_at，若每轮无条件写，零变化的幂等重跑也会改写整个
    # 文件（真机冻结语料复跑抓到：fold/ledger 字节不变、archive 每轮都变）。
    # archived_at 记录的是「真正归档那次」的时刻，不是「本轮核对过」。
    if archive_days:
        existing = _read(_ledger_archive_path()) or {}
        candidate = _add_days_to_archive(existing, archive_days, now)
        if _strip_archive_ts(candidate) != _strip_archive_ts(existing):
            _atomic_write(_ledger_archive_path(), candidate)
    # 每次 sync 都写（哪怕空 days）——不清空的话跨月后旧文件停在盘上被误读
    # 成"本月"，这是 alert.json month-stale 事故的同类。
    _atomic_write(_ledger_path(), {"days": ledger_days})
    print("claude-sync: scanned %d files; folded %d (new %d, resumed %d); "
          "skipped %d; failed %d" % (scanned, fresh + resumed, fresh, resumed,
                                     skipped, failed))
    print("claude-sync: cost-state baselines: %d sessions; row-sum only: %d"
          % (with_baseline, row_sum_only))
    print("claude-sync: ledger days: %d; unreadable usage rows: %d; "
          "unattributed rows: %d" % (len(ledger_days), unreadable,
                                     unattributed))
