#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const workflow = readFileSync(path.join(repo, ".github/workflows/release-desktop.yml"), "utf8");
const checks = [
  ["release commit CI preflight", "Require successful Verify run for release commit"],
  ["exact commit verification", '--workflow verify.yml --commit "$sha"'],
  ["native platform package workflow", "uses: ./.github/workflows/desktop-platforms.yml"],
  ["all platforms gate publication", "needs: [build, platform_packages]"],
  ["platform installer download", "pattern: desktop-*-x86_64"],
  ["tag trigger", 'tags: ["app-v*"]'],
  ["manual release tag input", "release_tag:"],
  ["Intel runner matrix", "runner: macos-15-intel"],
  ["Apple Silicon runner matrix", "runner: macos-14"],
  ["architecture-specific staging", "Stage architecture-specific artifacts"],
  ["Oh Agent DMG staging name", 'oh-agent-${version}-${EXPECTED_ARCH}.dmg'],
  ["Oh Agent DMG release name", 'oh-agent-${version}-${arch}.dmg'],
  ["architecture-specific artifact upload", "path: dist/${{ matrix.arch }}"],
  ["tag validation", "release tag must start with app-v"],
  ["pinned Tauri CLI", "tauri-cli --version 2.11.4 --locked"],
  ["React shadow bundle preflight", "Verify React shadow bundle"],
  ["React shadow bundle build", "npm ci && npm run verify:react"],
  ["React Tauri shadow candidate compile", "cargo tauri build --config tauri.react.conf.json --no-bundle --debug"],
  ["noninteractive build", "cargo tauri build --ci --bundles app,dmg"],
  ["build architecture check", "--require-architecture=$EXPECTED_ARCH"],
  ["publish artifact path", "find dist -type d -path \"*-${arch}/agent-vitals.app\""],
  ["strict signature check", "--require-developer-id"],
  ["notarization validation", "xcrun stapler validate"],
  ["artifact checksums", "shasum -a 256 *.zip *.dmg *.exe *.deb *.AppImage > SHA256SUMS"],
  ["existing tag only", "gh release create \"$RELEASE_TAG\" --verify-tag"],
  ["beta tags publish as prereleases", 'if [[ "$version" == *-* ]]; then\n            gh release create "$RELEASE_TAG" --verify-tag --title "$RELEASE_TAG" --generate-notes --prerelease'],
  ["stable tags stay releases", 'gh release create "$RELEASE_TAG" --verify-tag --title "$RELEASE_TAG" --generate-notes\n          fi'],
  ["publish ref matches tag", "ref: ${{ inputs.release_tag || github.ref }}"],
  ["pinned Node runtime", "node-version: 20"],
];

function occurrences(needle) {
  return workflow.split(needle).length - 1;
}

let failed = false;
for (const [label, needle] of checks) {
  if (workflow.includes(needle)) console.log(`ok   ${label}`);
  else {
    console.error(`FAIL ${label}: missing ${needle}`);
    failed = true;
  }
}
for (const [label, needle, minimum] of [
  ["both build paths depend on verification", "needs: preflight", 2],
  ["runner/matrix architecture mapping", "EXPECTED_ARCH", 2],
  ["publish architecture loop", "for arch in x86_64 arm64", 1],
  ["build strict architecture assertion", "--require-architecture=$EXPECTED_ARCH", 1],
  ["publish strict architecture assertion", "--require-architecture=$arch", 1],
]) {
  const count = occurrences(needle);
  if (count >= minimum) console.log(`ok   ${label}: ${count}`);
  else {
    console.error(`FAIL ${label}: found ${count}, expected at least ${minimum}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("release desktop workflow checks passed");
