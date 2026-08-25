#!/usr/bin/env bash
# 一键安装 skill-vitals 的 SwiftBar / xbar 菜单栏插件。
#
# 用法：
#   bash scripts/install_swiftbar.sh                # 默认路径
#   bash scripts/install_swiftbar.sh ~/custom/dir   # 自定义路径
#   bash scripts/install_swiftbar.sh --uninstall   # 卸载
#
# 默认路径:
#   SwiftBar → ~/Library/Application Support/SwiftBar/plugins/
#   xbar     → ~/Library/Application Support/xbar/plugins/
#
# 自定义路径适用场景:
#   - SwiftBar Preferences → Plugin Folder 指向非默认位置
#   - 多个 repo 共用一个 plugins dir
#   - 想放 dotfiles 仓库里用 stow 管理
#
# 步骤：
#   1. 探测 SwiftBar / xbar 装了哪个（除非传了自定义路径）
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

# ── 解析参数 ──────────────────────────────────────────────
PLUGIN_DIR=""
UNINSTALL=0
for arg in "$@"; do
    case "$arg" in
        --uninstall) UNINSTALL=1 ;;
        --help|-h)
            sed -n '2,/^set /p' "$0" | head -20
            exit 0
            ;;
        -*) echo "unknown flag: $arg" >&2; exit 2 ;;
        *)  PLUGIN_DIR="$arg" ;;
    esac
done

# ── 卸载 ──────────────────────────────────────────────
if [[ "$UNINSTALL" -eq 1 ]]; then
    if [[ -z "$PLUGIN_DIR" ]]; then
        PLUGIN_DIR="$HOME/Library/Application Support/SwiftBar/plugins"
        [[ -d "/Applications/xbar.app" ]] && \
            PLUGIN_DIR="$HOME/Library/Application Support/xbar/plugins"
    fi
    target="$PLUGIN_DIR/skill-vitals.5m.sh"
    if [[ -f "$target" ]]; then
        rm "$target"
        echo "✓ 已卸载 $target"
    else
        echo "warning: $target 不存在" >&2
    fi
    exit 0
fi

# ── 探测已装 ─────────────────────────────────────────────
if [[ -z "$PLUGIN_DIR" ]]; then
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
        echo "" >&2
        echo "或者手动指定插件目录:" >&2
        echo "  bash scripts/install_swiftbar.sh ~/my-custom-plugins" >&2
        exit 2
    fi
else
    echo "→ 使用自定义目录: $PLUGIN_DIR"
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
echo "2. 如果这是自定义目录,Preferences → Plugin Folder 改成:"
echo "   $PLUGIN_DIR"
echo "3. 菜单栏右上角会出现 💰 / ⚠️ / 🚨 + ¥金额"
echo
echo "要触发一次真实数据:"
echo "  SKILL_VITALS_HOME=$HOME/.skill-vitals python3 scripts/scan.py oneline <your-dsh-session-log>"
echo
echo "要卸载:"
echo "  bash scripts/install_swiftbar.sh --uninstall"
