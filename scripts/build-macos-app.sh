#!/usr/bin/env bash
# Build a locally testable macOS app without mixing a stale root CLI into the
# Tauri bundle. This is intentionally unsigned; use release-macos.sh for a
# Developer ID-signed and notarized distribution artifact.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
desktop_dir="$repo_root/apps/desktop/src-tauri"
app="$desktop_dir/target/release/bundle/macos/agent-vitals.app"

case "$(uname -s)" in
  Darwin) ;;
  *) echo "build-macos-app: this script must run on macOS" >&2; exit 1 ;;
esac

echo "build-macos-app: building bundled CLI"
(cd "$repo_root" && cargo build --release -p agent-vitals)

echo "build-macos-app: building Tauri app"
(cd "$desktop_dir" && cargo tauri build --ci --bundles app)

echo "build-macos-app: verifying bundled CLI contract"
node "$repo_root/scripts/verify-macos-app-bundle.mjs" "$app" \
  "--require-architecture=$(uname -m)"

echo "build-macos-app: complete: $app"
