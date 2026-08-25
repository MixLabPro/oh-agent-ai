# contrib/xbar — macOS 菜单栏 5min tick

[xbar](https://github.com/matryer/xbar) / [SwiftBar](https://github.com/swiftbar/SwiftBar)
把脚本 stdout 第一行渲染到 macOS 菜单栏，`---` 之后的行作为下拉菜单项。
文件名后缀 `.5m.sh` → 每 5 分钟触发一次。本目录只放一个脚本：

- `skill-vitals.5m.sh` — 菜单栏显示**今日累计 token cost vs 日预算**，下拉给
  本次会话 / 当日 / 当月 + 「刷新 / 打开 state」入口。

数据源是 `state.py` 写出的三个 JSON（`$SKILL_VITALS_HOME/state/` 或
`~/.skill-vitals/state/`）—— `oneline.json` / `today.json` / `month.json`。脚本
**只读不写**，缺文件时显示空菜单栏（`💤 -`），不抛错、不 daemon、不走网络。

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

脚本顶部两个常量，`BUDGET_DAILY_CNY=30` / `BUDGET_MONTHLY_CNY=500`。M6 预算
模块上线后会从配置文件读，这里先硬编码 → 用户改这两个数即可临时调整。

- 菜单栏 `< 80%` → 💰 / `80–100%` → ⚠️ / `> 100%` → 🚨

## 依赖

- `bash`（脚本本体）
- `python3`（**唯一硬依赖**；jq 不在 PATH 时降级到 `python3 -c` 一行解析）
- 可选 `jq`（存在则走 jq，缺失自动回落到 python3）

**不调用网络**（`curl` / `wget` 都禁）。**不安装任何包**。**不修改任何
state 文件**。
