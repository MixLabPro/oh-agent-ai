#!/usr/bin/env bash
# 一键安装 skill-vitals 的 SwiftBar 菜单栏插件。
#
# 用法：
#   bash scripts/install_swiftbar.sh
#
# 步骤：
#   1. 探测 SwiftBar / xbar 装了哪个
#   2. 创建插件目录
#   3. cp + chmod 脚本
#   4. 跑一次确认输出（不依赖 SwiftBar 启动）
#
# 不做（按 CLAUDE.md §no telemetry / §no network）：
#   - 不下载 SwiftBar 本身
#   - 不修改 SwiftBar 配置
#   - 不创建 daemon / launchd 服务

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_SRC="$REPO_ROOT/contrib/xbar/skill-vitals.5m.sh"

if [[ ! -f "$SCRIPT_SRC" ]]; then
    echo "error: $SCRIPT_SRC 不存在" >&2
    exit 2
fi

# ── 探测已装 ─────────────────────────────────────────────
PLUGIN_DIR=""
if [[ -d "/Applications/SwiftBar.app" ]]; then
    PLUGIN_DIR="$HOME/Library/Application Support/SwiftBar/plugins"
    echo "✓ 检测到 SwiftBar"
elif [[ -d "/Applications/xbar.app" ]]; then
    PLUGIN_DIR="$HOME/Library/Application Support/xbar/plugins"
    echo "✓ 检测到 xbar"
else
    echo "error: 没装 SwiftBar 或 xbar" >&2
    echo "" >&2
    echo "请先装一个：" >&2
    echo "  SwiftBar: https://github.com/swiftbar/SwiftBar/releases/latest" >&2
    echo "  xbar:     https://xbarapp.com/" >&2
    exit 2
fi

# ── 安装脚本 ──────────────────────────────────────────────
mkdir -p "$PLUGIN_DIR"
cp "$SCRIPT_SRC" "$PLUGIN_DIR/skill-vitals.5m.sh"
chmod +x "$PLUGIN_DIR/skill-vitals.5m.sh"

echo "✓ 已安装到 $PLUGIN_DIR/skill-vitals.5m.sh"
echo
echo "─── 测试运行 ───"
bash "$PLUGIN_DIR/skill-vitals.5m.sh"
echo
echo "─── 下一步 ───"
echo "1. 打开 SwiftBar.app（或 xbar.app）"
echo "2. 首次启动会请求「添加插件目录」——选 $PLUGIN_DIR"
echo "3. 菜单栏右上角会出现 💰 / ⚠️ / 🚨 + ¥金额"
echo
echo "要触发一次真实数据："
echo "  SKILL_VITALS_HOME=$HOME/.skill-vitals python3 scripts/scan.py oneline <your-dsh-session-log>"
