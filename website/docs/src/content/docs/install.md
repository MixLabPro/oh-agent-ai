---
title: How do I install Oh Agent? System requirements and release status
description: Oh Agent 1.0.0-beta.2's first public release publishes installers for Apple Silicon Mac, Intel Mac, Windows and Linux. Release status, artifact names, platform maturity and building from source.
head:
  - tag: script
    attrs:
      type: application/ld+json
    content: |
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          {"@type": "ListItem", "position": 1, "name": "Oh Agent", "item": "https://ohagent.ai/"},
          {"@type": "ListItem", "position": 2, "name": "Docs", "item": "https://ohagent.ai/docs"},
          {"@type": "ListItem", "position": 3, "name": "Install", "item": "https://ohagent.ai/docs/install"}
        ]
      }
---

You can't download a ready-made Oh Agent installer yet: version 1.0.0-beta.2 is in release preparation, and the [GitHub Releases page](https://github.com/MixLabPro/oh-agent-ai/releases) has no installer so far. The **first public release** is planned to publish installers for **Apple Silicon Mac, Intel Mac, Windows and Linux**. Apple Silicon macOS is the best-tested path today; the other platforms ship as early / experimental builds. Developers can already build the app from source.

:::caution[Release status]
As of October 2026 there is **no public, signed installer**. Any build you make yourself is a local developer build. It is not Developer ID–signed or notarized (macOS). **TBD:** update this page on release day with download links and per-platform install steps.
:::

<!-- source: website/landing/README.md ("Public release": GitHub Releases page is empty, desktop downloads remain unavailable); GitHub API /repos/MixLabPro/oh-agent-ai/releases returned [] on 2026-10-20 -->
<!-- source: README.md ("a local build is not a signed public release"; "Local bundles must not be presented as notarized distribution builds") -->
<!-- decision: Bear, 2026-10-21 — 10/27 first public launch ships installers for Apple Silicon Mac, Intel Mac, Windows and Linux from the MixLabPro/oh-agent-ai dev branch -->

## Key facts

- **Current version:** 1.0.0-beta.2 (not yet released publicly).
- **First public release ships installers for:** Apple Silicon Mac, Intel Mac, Windows (x64), and Linux (x64).
- **macOS:** 11.0 or later (`minimumSystemVersion` in `tauri.conf.json`).
- **Apple Silicon (arm64):** best-tested path; SUPPORT_MATRIX status is "release candidate in validation".
- **Intel Mac (x86_64), Windows, Linux:** installers are published by the release workflow, but SUPPORT_MATRIX still does **not** declare them supported. Treat them as **early / experimental**. **TBD:** which bugs are known on each platform; update after real-machine acceptance.
- **Price:** free and open source (MIT).
- **Checksums:** every release includes a `SHA256SUMS` file next to the installers.

<!-- source: apps/desktop/src-tauri/tauri.conf.json ("version": "1.0.0-beta.2", "minimumSystemVersion": "11.0"; productName "Oh Agent", identifier ai.ohagent.desktop) -->
<!-- source: apps/desktop/src-tauri/SUPPORT_MATRIX.md (arm64 候选验证中; x86_64 未支持; "当前不声明 universal binary，也不声明 Windows/Linux 桌面版") — matrix last checked against worktree bf7196a; CI/release workflows have since grown beyond what the matrix records -->
<!-- source: .github/workflows/release-desktop.yml publish step (public artifact names + SHA256SUMS); .github/workflows/desktop-platforms.yml (Windows nsis + Linux deb/appimage) -->

## What files will the first release publish?

Public names come from the release workflow (version = app version without the `app-v` tag prefix, must match `tauri.conf.json`):

| Platform | Public artifact name |
| --- | --- |
| macOS Apple Silicon | `Oh-Agent-<version>-macos-arm64.dmg` and `Oh-Agent-<version>-macos-arm64.app.zip` |
| macOS Intel | `Oh-Agent-<version>-macos-x64.dmg` and `Oh-Agent-<version>-macos-x64.app.zip` |
| Windows x64 | `Oh-Agent-<version>-windows-x64-setup.exe` |
| Linux x64 | `Oh-Agent-<version>-linux-x64.deb` and `Oh-Agent-<version>-linux-x64.AppImage` |
| All | `SHA256SUMS` |

On macOS the installed app is `Oh Agent.app` (bundle identifier `ai.ohagent.desktop`). On Windows the NSIS installer is verified in CI to start with the display name `Oh Agent`; on Linux the `.desktop` entry is `Name=Oh Agent`. The bundled CLI binary stays named `agent-vitals` / `agent-vitals.exe`.

<!-- source: .github/workflows/release-desktop.yml lines ~233–259 (comment cites docs/OH_AGENT_BRAND_RENAME_PLAN.md §2; public_arch x64/arm64; windows-x64-setup.exe; linux-x64.deb / .AppImage; SHA256SUMS) -->
<!-- source: .github/workflows/desktop-platforms.yml (Windows: Name starts with Oh Agent; CLI at bin/agent-vitals.exe. Linux: Name=Oh Agent; CLI path */bin/agent-vitals) -->

## Platform maturity (important)

`apps/desktop/src-tauri/SUPPORT_MATRIX.md` only records combinations that have build **and** acceptance evidence. As of the docs worktree (`bf7196a`):

- **macOS 11+ / Apple Silicon (`arm64`):** "候选验证中" — local `.app` and bundled CLI are arm64; architecture preflight, CLI `--version` and Vite/Workbench checks passed. Formal release still requires Developer ID, notarization, clean-machine install / upgrade / restore, and resource/performance acceptance.
- **macOS 11+ / Intel (`x86_64`):** matrix says **未支持** ("尚无本机或 CI 产物证据"). The release workflow **does** build and publish `macos-x64` artifacts on a `macos-15-intel` runner, so the matrix text is behind the CI. Until the matrix is updated and real-machine acceptance is done, docs call Intel **early / experimental**. **TBD:** known Intel bugs.
- **Windows / Linux:** matrix explicitly does **not** declare a desktop release. The `desktop-platforms.yml` workflow builds and CI-tests NSIS / deb / AppImage packages, and `release-desktop.yml` uploads them. Docs call these **early / experimental**. **TBD:** known Windows and Linux bugs; OS version floors beyond what Tauri needs.

No universal macOS binary is declared.

<!-- source: apps/desktop/src-tauri/SUPPORT_MATRIX.md (full file) -->
<!-- source: .github/workflows/release-desktop.yml matrix runners macos-15-intel / macos-14; platform_packages job -->
<!-- source: .github/workflows/desktop-platforms.yml -->

## When will the installer be available?

**TBD.** The first public installers will be published once signing (macOS Developer ID + notarization), packaging and the planned clean-machine checks pass for the platforms you care about. To get notified:

- Watch releases on [GitHub](https://github.com/MixLabPro/oh-agent-ai) (Watch → Custom → Releases).
- Follow [@ohagentai](https://x.com/ohagentai) on X.
- Check the [download section](https://ohagent.ai/#download).

<!-- source: apps/desktop/src-tauri/SUPPORT_MATRIX.md (正式发布条件: Developer ID, notarization, 干净机安装/升级/恢复) -->

## How will installing work once it's released?

From the Releases page, download the artifact that matches your OS and CPU, then verify it against `SHA256SUMS`. The app bundles its own `agent-vitals` command-line tool, so you won't need Python, a separate CLI or any `PATH` changes (documented for the macOS bundle; **TBD** confirm the same story on Windows and Linux installers beyond the CI smoke tests). **TBD:** exact step-by-step instructions and screenshots per platform, written against the real release packages.

<!-- source: apps/desktop/src-tauri/README.md ("不需要另外安装 Python、CLI 或修改 shell PATH"; CLI at Contents/Resources/bin/) -->
<!-- source: .github/workflows/desktop-platforms.yml (Windows install + agent-vitals.exe --build-info; Linux dpkg extract + agent-vitals --build-info) -->

## Can I try Oh Agent without installing?

Yes, partly. The [web demo on ohagent.ai](https://ohagent.ai/) runs the real City frontend on 2,000 synthetic sessions (30-day window). It doesn't read your logs, and it hides the game, export and seed controls.

<!-- source: website/landing/README.md (2000 mock sessions in 30 days; presentation=landing hides game, export and seed controls) -->

## How can developers build Oh Agent from source today?

The repository documents a local **macOS** build most clearly. You need a recent Node.js with npm, stable Rust, Tauri's platform prerequisites and the Tauri CLI. From the repository root:

```sh
# Command-line tool
cargo build --release
./target/release/agent-vitals --help

# Local macOS .app build
npm ci --prefix apps/desktop/ui-dev
npm ci --prefix apps/agent-city/ui
bash scripts/build-macos-react-app.sh

# Launch the bundle (not the bare menubar executable)
open "apps/desktop/src-tauri/target/release/bundle/macos/Oh Agent.app"
```

This produces a locally signed test build for development only. See the [desktop README](https://github.com/MixLabPro/oh-agent-ai/blob/dev/apps/desktop/src-tauri/README.md) for details. **TBD:** document Windows and Linux local build steps the same way (CI already runs `cargo tauri build` with `nsis` / `deb,appimage` bundles).

<!-- source: README.md ("Development quick start", commands verbatim) -->
<!-- NOTE: apps/desktop/src-tauri/README.md uses scripts/build-macos-app.sh while the root README uses scripts/build-macos-react-app.sh; both scripts exist — maintainer to confirm which one is canonical -->
<!-- source: .github/workflows/desktop-platforms.yml (Windows/Linux build commands) -->

## Why do I still see agent-vitals after installing?

The app display name is Oh Agent. The bundled command-line tool, some internal paths and the data folder `~/.agent-vitals/` (macOS/Linux) still use the earlier name `agent-vitals`. Don't rename them. Your data isn't tied to the app identifier, so it stays where it is.

If you ran a pre-release macOS build named `agent-vitals.app` (identifier `com.mixlabpro.agent-vitals`), quit and delete it. Otherwise macOS shows two menu bar icons. **TBD:** upgrading from the old bundle hasn't been tested on a real Mac; **TBD:** Windows/Linux upgrade paths from any older package name.

<!-- source: README.md; apps/desktop/src-tauri/tauri.conf.json; CLAUDE.md; commit 5c29146 -->

## What happens after I open it?

Oh Agent reads your agents' existing logs. You need no account and no API key. The OS may ask permission to read those folders. Next:

- [Claude Code data source](/docs/data-sources/claude-code) · [Codex data source](/docs/data-sources/codex)
- [What each building in Agent City means](/docs/city-guide)
- [Does Oh Agent upload my sessions?](/docs/privacy-and-data)
- [FAQ](https://ohagent.ai/#faq)
