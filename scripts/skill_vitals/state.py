"""状态文件 I/O —— xbar / 日历 / 预算告警的共享持久层。

三个状态文件，三种写入语义：

  oneline.json   单次审计的「最后一行」快照。xbar / SwiftBar tick 脚本
                 每 5 分钟跑一次 `behavior <log>`，把结果原地覆盖到这里。
                 不是历史，是**当前**。多个客户端（tray、CLI）都从这里
                 读，避免各自重算 cost / peak —— 重算两份就两份可能
                 不一致（见 cost.py 的 peak/off-peak 计价分支）。

  today.json     当日 24 小时桶的累计聚合。每次审计**合并**到对应的小
                 时桶（同一小时多次会话累加），而不是覆盖 —— 日历要看
                 的是「今天到目前为止」，不是「最近一次会话」。

  month.json     当月逐日聚合。每天最多 31 条（YYYY-MM-DD → 4+4 token
                 桶），跨月滚动 —— 上月的存档在 month-archive.jsonl
                 追加一份后清空。

三件事共用同一把锁：`fcntl.flock` on `<state_dir>/.lock`。POSIX rename
原子，所以「写 tmp → rename」不需要锁保护；锁是给「read-modify-write」
合并场景防两个并发审计互相覆盖的。

CLAUDE.md 不变量：「**no telemetry · no upload · no network**」——
所有 I/O 都在 `$SKILL_VITALS_HOME/state/` 或 `~/.skill-vitals/state/`
下，不连任何外部服务；xbar tick 是本地脚本，日历是本地 HTML。
"""

import contextlib
import errno
import fcntl
import json
import os
import sys
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path


SCHEMA_VERSION = "1.0.0"
_BEIJING = timezone(timedelta(hours=8))


def state_dir() -> Path:
    """状态目录路径 —— 优先 `$SKILL_VITALS_HOME/state/`，否则
    `~/.skill-vitals/state/`。

    路径选择与 snapshots.py 同款（CLAUDE.md §Local First）：
    所有 skill-vitals 写出的产物都进 `$SKILL_VITALS_HOME`，不进
    当前目录、不进 `/tmp`、不进任何被 git 跟踪的位置。
    """
    base = os.environ.get("SKILL_VITALS_HOME")
    if base:
        p = Path(base) / "state"
    else:
        p = Path.home() / ".skill-vitals" / "state"
    try:
        p.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        # 权限 / 只读文件系统 —— 让调用方决定要不要硬崩而不是这里静默
        raise OSError(f"cannot create state dir {p}: {e}") from e
    return p


@contextlib.contextmanager
def _locked(path: Path):
    """flock(LOCK_EX) 守护 read-modify-write。

    flock 是**咨询性**锁：只对**也走 flock 的进程**生效。xbar tick 脚本
    必须用同一个 helper 取锁才不会互相覆盖。其他进程（人手 vim 改
    文件）仍然可以直读 —— 这是 POSIX flock 的语义，不补保证。

    Windows 不支持 fcntl.flock；这里直接报错而不是静默走无锁路径
    （CLAUDE.md §「host 能力缺失时降级、绝不臆造」是数据纪律不是
    锁纪律，锁缺失必须显式失败）。
    """
    if sys.platform == "win32":
        raise OSError("state.py uses POSIX flock; Windows not supported")
    lock_path = path.with_suffix(path.suffix + ".lock")
    fd = os.open(str(lock_path), os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            os.close(fd)


def _atomic_write(path: Path, data: dict) -> None:
    """写入 `<file>.tmp.<pid>` → `rename(path)`。POSIX rename 在同一文件
    系统内是原子操作 —— 任何时刻读 `<file>` 要么看到旧版、要么看到新版，
    不会看到半截。

    失败时清理 tmp 文件，避免 `.tmp.*` 残留塞满 state 目录。
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_fd, tmp_path = tempfile.mkstemp(
        prefix=path.name + ".tmp.", dir=str(path.parent))
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2,
                      sort_keys=True, default=str)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)  # atomic on POSIX, replace on Windows
    except Exception:
        # 出错清理 tmp —— 不要留垃圾在 state 目录里
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _read(path: Path):
    """读 state 文件，缺 / 坏掉返回 None。

    与 CLAUDE.md 「缺列不编列」同条纪律：state 文件损坏宁可**丢一份**
    历史也不要拼一个错的桶。xbar 会拿 None 当作「没有最新数据」并
    显示空菜单栏，而不是显示一个凭空算的 ¥0。
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _now_iso():
    """UTC ISO8601 字符串。状态文件里的时间戳统一 UTC，渲染层按需
    折算 —— 与 cost_report 同一条原则：规则唯一真相源、时间显示归
    渲染层。
    """
    return datetime.now(timezone.utc).isoformat()


# ────────────────────────── oneline.json ──────────────────────────


def write_oneline(audit: dict) -> Path:
    """把单次审计的「一行摘要」写到 oneline.json —— xbar tick 直接读。

    `audit` 是 `behavior.audit_session_log` 的产物（或行为审计子集
    + cost 子集），至少含：
      - session_id / session_start / duration_ms
      - tokens_total / tokens_peak（来自 token_by_model）
      - cost_cny / cost_peak_cny（来自 cost_report）
      - findings_total / findings_max_severity（来自 behavior）
      - hour_buckets_summary（来自 hour_buckets 的元信息）
    """
    path = state_dir() / "oneline.json"
    data = dict(audit)
    data["schema_version"] = SCHEMA_VERSION
    data["generated_at"] = _now_iso()
    _atomic_write(path, data)
    return path


def read_oneline():
    return _read(state_dir() / "oneline.json")


# ────────────────────────── today.json / month.json ──────────────


def _today_key(time_ms=None):
    """Beijing 'YYYY-MM-DD'。空 / 缺 time 时用本地 'now' 的 BJ 日期。"""
    if time_ms is None:
        now = datetime.now(_BEIJING)
        return now.date().isoformat()
    secs = int(time_ms) // 1000 + 8 * 3600
    days = secs // 86400
    from datetime import date, timedelta
    return (date(1970, 1, 1) + timedelta(days=days)).isoformat()


def _merge_buckets(existing, new_buckets, key_field):
    """把 new_buckets 折进 existing[key_field] → 8 token 字段。

    现有桶的 schema 与 hour_buckets() 单条 row 完全一致（4 基础 + 4
    peak_* 字段），逐字段相加。key_field 是「日期字段名」（today 用
    'hour'，month 用 'date'）—— 同一小时内多次审计累加；不同小时
    各自独立桶。
    """
    if existing is None:
        existing = {}
    for nb in new_buckets:
        if nb.get("date") is None:
            continue  # time 缺失的样本不入日历
        k = str(nb.get(key_field))
        cur = existing.setdefault(k, {
            "uncached_input_tokens": 0, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "peak_uncached_input_tokens": 0, "peak_output_tokens": 0,
            "peak_cache_read_tokens": 0, "peak_cache_write_tokens": 0,
        })
        for fld in ("uncached_input_tokens", "output_tokens",
                    "cache_read_tokens", "cache_write_tokens",
                    "peak_uncached_input_tokens", "peak_output_tokens",
                    "peak_cache_read_tokens", "peak_cache_write_tokens"):
            cur[fld] = cur.get(fld, 0) + (nb.get(fld) or 0)
    return existing


def merge_today(hour_buckets_result) -> Path:
    """把 hour_buckets 的所有 (date, hour) 桶合并到 today.json。

    锁住同一 `<state_dir>/.lock`，read-modify-write 期间不让其他
    tick 进来 —— 否则两个并发审计可能各读一份、各写一份，后者覆盖
    前者的累加。
    """
    path = state_dir() / "today.json"
    with _locked(path):
        existing = _read(path) or {}
        existing["buckets"] = _merge_buckets(
            existing.get("buckets"), hour_buckets_result.get("buckets", []),
            key_field="hour")
        existing["schema_version"] = SCHEMA_VERSION
        existing["generated_at"] = _now_iso()
        existing["date"] = _today_key()
        _atomic_write(path, existing)
    return path


def merge_month(hour_buckets_result) -> Path:
    """把 hour_buckets 的所有桶合并到 month.json（按日期折叠）。"""
    path = state_dir() / "month.json"
    with _locked(path):
        existing = _read(path) or {}
        existing["days"] = _merge_buckets(
            existing.get("days"), hour_buckets_result.get("buckets", []),
            key_field="date")
        existing["schema_version"] = SCHEMA_VERSION
        existing["generated_at"] = _now_iso()
        existing["month"] = _today_key()[:7]  # 'YYYY-MM'
        _atomic_write(path, existing)
    return path


# ────────────────────────── 列出 / 清理 ──────────────────────────


def list_state_files():
    """返回 state 目录下所有 .json 文件的 path 列表（不含 .lock / .tmp.*）。

    给 doctor / overlap / explain 等「扫描本地状态」的命令用。
    """
    p = state_dir()
    return sorted(f for f in p.glob("*.json") if f.is_file())