#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const workflow = readFileSync(path.join(repo, ".github/workflows/release-desktop.yml"), "utf8");
const checks = [
  ["tag trigger", 'tags: ["app-v*"]'],
  ["manual release tag input", "release_tag:"],
  ["tag validation", "release tag must start with app-v"],
  ["pinned Tauri CLI", "tauri-cli --version 2.11.4 --locked"],
  ["noninteractive build", "cargo tauri build --ci --bundles app,dmg"],
  ["build architecture check", "--require-architecture=$expected"],
  ["publish architecture check", "dist/macos/agent-vitals.app"],
  ["strict signature check", "--require-developer-id"],
  ["notarization validation", "xcrun stapler validate"],
  ["artifact checksums", "shasum -a 256 *.zip *.dmg > SHA256SUMS"],
  ["existing tag only", "gh release create \"$RELEASE_TAG\" --verify-tag"],
  ["publish ref matches tag", "ref: ${{ inputs.release_tag || github.ref }}"],
];

let failed = false;
for (const [label, needle] of checks) {
  if (workflow.includes(needle)) console.log(`ok   ${label}`);
  else {
    console.error(`FAIL ${label}: missing ${needle}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("release desktop workflow checks passed");

