# contrib/xbar — macOS 菜单栏 5min tick

[xbar](https://github.com/matryer/xbar) / [SwiftBar](https://github.com/swiftbar/SwiftBar)
把脚本 stdout 第一行渲染到 macOS 菜单栏，`---` 之后的行作为下拉菜单项。
文件名后缀 `.5m.sh` → 每 5 分钟触发一次。本目录只放一个脚本：

- `skill-vitals.5m.sh` — 菜单栏显示**今日累计 token cost vs 日预算**，下拉给
  本次会话 / 当日 / 当月 + 「刷新 / 打开 state / 打开日历」入口。

数据源是 `state.py` 写出的五个文件（`$SKILL_VITALS_HOME/state/` 或
`~/.skill-vitals/state/`）—— `oneline.json` / `today.json` / `month.json` /
`alert.json` / `calendar.html`。脚本**只读不写**，缺文件时显示空菜单栏
（`💤 -`），不抛错、不 daemon、不走网络。

下拉里的「打开日历」用 `open` 打开 `calendar.html`（本地文件，双 tab 内嵌
today/month 两份数据，离线可看）。这个文件由 `oneline` 命令在每次结算末尾
自动刷新——不需要手动生成；`calendar.html` 还不存在时（一次新版 `oneline`
都没跑过），这一行显示成提示文字而不是可点链接。

真实数据现在会**自动同步**：每次 tick 顺手跑一次 `scripts/dsh_autosync.py`
——发现 `~/.dsh/sessions/` 下有会话文件连续 5 分钟没再增长（还没同步过）就
自动解压、跑一次 `oneline`。不用 hook（DSH 没有会话结束类的钩子，见
`docs/PRODUCT.md` §5.8.4/5.8.5 关于为什么不往用户 agent 配置里装 hook 的
说明），也不新建 daemon——就是复用这个 tick 本身。需要 `pip install
zstandard` 才能解压 `.zstd` 日志；没装就跳过（打印提示，不影响菜单栏），
可以照样手动跑 `oneline`。**只装一次，不增量同步**——同一份会话内容喂
`oneline` 两次会累加两次，所以每个会话稳定之后只同步恰好一次。

## 安装

> ⚠️ Git 不能保留 `+x` 模式 —— clone 后第一次使用**必须手动 chmod**。

**推荐用安装脚本**（会把 `dsh_autosync.py` 的绝对路径烙进已安装的副本里，
自动同步才找得到它）：

```bash
bash scripts/install_swiftbar.sh                 # 自动探测 SwiftBar/xbar
bash scripts/install_swiftbar.sh ~/custom/dir    # 自定义插件目录
```

也可以手动 `cp`，但那样装出来的副本不知道仓库 checkout 在哪，自动同步会
静默跳过（不报错，就是不干活）——除非你自己把脚本里
`SKILL_VITALS_SCRIPTS_DIR="__SKILL_VITALS_SCRIPTS_DIR__"` 那行的占位符
手动换成 `<repo>/scripts` 的绝对路径：

```bash
PLUGIN_DIR="$HOME/Library/Application Support/xbar/plugins"
# SwiftBar 用这一行替换上面那行：
#   PLUGIN_DIR="$HOME/Library/Application Support/SwiftBar/plugins"

cp contrib/xbar/skill-vitals.5m.sh "$PLUGIN_DIR/"
chmod +x "$PLUGIN_DIR/skill-vitals.5m.sh"
```

xbar / SwiftBar 会**自动发现**该目录下所有可执行脚本，无需重启；首次发现
会有授权提示。完成后菜单栏出现 💰 / ⚠️ / 🚨 之一 + ¥金额，下拉看到详情。

## 预算档位

颜色/百分比唯一来自 `alert.json`（`skill-vitals budget evaluate()` 的落盘
结果，`oneline` 命令末尾自动写）——脚本自己不算阈值，改预算用
`skill-vitals budget set --daily 50` 之类的命令，改完下一次 `oneline`
跑完菜单栏就跟着变，不用碰这个脚本。

- `ok` / `near` → 💰　`warn` → ⚠️　`over` → 🚨　`snoozed` → 🔕
- `budget.enabled = false` → 💰 且下拉写「预算告警：已关闭」，不显示百分比
- 还没跑过一次新版 `oneline`（`alert.json` 不存在）→ 只显示本次会话花费，
  不带颜色判定，不臆造一个百分比出来

`effective_daily_budget`（日预算的自适应 floor 结果）和 `monthly_cny`
（月预算）都是 `alert.json` 里的字段，随 `config.toml [budget]` 或
`budget set` 实时变化。

> 已经装过旧版脚本？安装是一次性 `cp`，不是符号链接——仓库里的脚本更新
> 不会自动同步到已安装的副本，改完要重新执行下面的安装步骤（或
> `bash scripts/install_swiftbar.sh`）才会生效。

## 依赖

- `bash`（脚本本体）
- `python3`（**唯一硬依赖**；jq 不在 PATH 时降级到 `python3 -c` 一行解析）
- 可选 `jq`（存在则走 jq，缺失自动回落到 python3）
- 可选 `zstandard`（`pip install zstandard`）——只有自动同步 `.zstd` 会话
  日志需要它，缺场时自动同步跳过，菜单栏渲染本身不受影响

**不调用网络**（`curl` / `wget` 都禁）。**不安装任何包**（`zstandard` 是
可选依赖，脚本自己从不安装它）。脚本本体只读不写——但每个 tick 会顺手跑
一次 `dsh_autosync.py`，那个子进程在发现"会话已停止增长"时**会**写
state 文件（等价于用户自己手动跑了一次 `oneline`），这不是本脚本自己在
写，行为详见上面"自动同步"一节。
