# contrib/xbar — macOS 菜单栏 5min tick

[xbar](https://github.com/matryer/xbar) / [SwiftBar](https://github.com/swiftbar/SwiftBar)
把脚本 stdout 第一行渲染到 macOS 菜单栏，`---` 之后的行作为下拉菜单项。
文件名后缀 `.5m.sh` → 每 5 分钟触发一次。本目录只放一个脚本：

- `skill-vitals.5m.sh` — 菜单栏显示**今日累计 token cost vs 日预算**，下拉给
  本次会话 / 当日 / 当月 + 「刷新 / 打开 state」入口。

数据源是 `state.py` 写出的四个 JSON（`$SKILL_VITALS_HOME/state/` 或
`~/.skill-vitals/state/`）—— `oneline.json` / `today.json` / `month.json` /
`alert.json`。脚本**只读不写**，缺文件时显示空菜单栏（`💤 -`），不抛错、
不 daemon、不走网络。

## 安装

> ⚠️ Git 不能保留 `+x` 模式 —— clone 后第一次使用**必须手动 chmod**。

```bash
# xbar 插件目录
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

**不调用网络**（`curl` / `wget` 都禁）。**不安装任何包**。**不修改任何
state 文件**。
