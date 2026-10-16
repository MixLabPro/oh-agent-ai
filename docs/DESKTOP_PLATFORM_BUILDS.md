# Windows and Linux desktop builds

The desktop crate is an independent workspace; a root `cargo build` only builds
the CLI. Build desktop packages on the target operating system.

## Local builds

Install Node.js 20 (with npm), stable Rust, and Tauri's platform prerequisites:
<https://v2.tauri.app/start/prerequisites/>. Windows requires MSVC C++ build tools
and WebView2. Ubuntu requires WebKitGTK 4.1, GTK development dependencies,
Ayatana AppIndicator, librsvg, libssl, libxdo and patchelf (see the CI workflow).

From the repository root:

```sh
npm ci --prefix apps/desktop/ui-dev
cargo install tauri-cli --version 2.11.4 --locked
cd apps/desktop/src-tauri
cargo tauri build --ci
```

Tauri automatically merges `tauri.windows.conf.json` or `tauri.linux.conf.json`.
Windows produces an NSIS installer; Linux produces deb and AppImage packages in
`apps/desktop/src-tauri/target/release/bundle/`. The build hook builds the frontend,
official plugins and native CLI, and checks the CLI authority schema.
Do not set a cross-compilation target with this hook: it builds the host CLI.

The CLI is bundled as `bin/agent-vitals.exe` on Windows and `bin/agent-vitals` on
Linux/macOS. Runtime discovery prefers an explicit `AGENT_VITALS_BIN` override,
then Tauri's resource directory, executable-relative fallbacks, and finally PATH.
An installed desktop app does not require a separately installed CLI or Python.

## CI and releases

`desktop-platforms.yml` builds Windows x86_64 and Linux x86_64 on native runners,
runs discovery regression tests, and checks the CLI extracted/installed from the
package. Ubuntu 22.04 is the Linux build baseline; this does not promise support
for every Linux distribution, display server, GPU or tray implementation.
PR builds and manual runs upload installers as Actions artifacts without publishing.

`release-desktop.yml` calls the same workflow at the release ref. Publication waits
for macOS and both native platform builds, collects all installers, and includes
them in SHA256SUMS. Existing macOS signing and notarization gates still apply.
Windows installers are currently unsigned: Authenticode signing is not configured.

Package checks verify CLI presence and execution, not full desktop UI acceptance.
Before declaring a platform release ready, test installation, tray/window behavior,
sync, official plugins, and uninstall on a clean machine. macOS-only screenshot
and system-proxy discovery features retain their existing limitations.
