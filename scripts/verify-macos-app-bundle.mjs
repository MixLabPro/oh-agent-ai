#!/usr/bin/env node

import { existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const defaultApp = path.join(repo, "apps/desktop/src-tauri/target/release/bundle/macos/agent-vitals.app");
const args = process.argv.slice(2);
const requireDeveloperId = args.includes("--require-developer-id");
const requiredArchitecture = args.find((arg) => arg.startsWith("--require-architecture="))
  ?.slice("--require-architecture=".length);
const app = path.resolve(args.find((arg) => !arg.startsWith("--")) || defaultApp);

function fail(message) { console.error(`FAIL ${message}`); process.exitCode = 1; }
function ok(message) { console.log(`ok   ${message}`); }

if (!existsSync(app)) {
  fail(`app bundle not found: ${app}`);
  process.exit(1);
}

const executable = path.join(app, "Contents/MacOS/agent-vitals-menubar");
const cli = path.join(app, "Contents/Resources/bin/agent-vitals");
for (const [label, file] of [["app executable", executable], ["bundled CLI", cli]]) {
  if (existsSync(file)) ok(`${label}: ${path.relative(repo, file)}`);
  else fail(`${label} missing: ${file}`);
}

if (existsSync(cli)) {
  try {
    const version = execFileSync(cli, ["--version"], { encoding: "utf8" }).trim();
    if (version) ok(`bundled CLI responds: ${version}`);
    else fail("bundled CLI returned an empty version");
  } catch (error) {
    fail(`bundled CLI --version failed: ${error.message}`);
  }
}

function architecture(file) {
  try {
    return execFileSync("file", [file], { encoding: "utf8" }).trim();
  } catch (error) {
    fail(`cannot inspect architecture for ${file}: ${error.message}`);
    return "";
  }
}

const architectures = [];
for (const [label, file] of [["app executable", executable], ["bundled CLI", cli]]) {
  if (!existsSync(file)) continue;
  const description = architecture(file);
  const match = description.match(/\b(arm64|x86_64|universal)\b/g);
  if (match?.length) {
    const unique = [...new Set(match)].join(",");
    architectures.push(unique);
    ok(`${label} architecture: ${unique}`);
  } else {
    fail(`${label} architecture is not a recognized macOS Mach-O binary: ${description}`);
  }
  if (requiredArchitecture && !description.includes(requiredArchitecture)) {
    fail(`${label} architecture does not include required ${requiredArchitecture}: ${description}`);
  }
}
if (requiredArchitecture && architectures.length === 0) {
  fail(`required architecture ${requiredArchitecture} could not be verified`);
}

const signatureResult = spawnSync("codesign", ["-dvvv", app], { encoding: "utf8" });
const signature = `${signatureResult.stdout || ""}${signatureResult.stderr || ""}`;
const team = signature.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim();
const isAdhoc = /^(?:Signature=adhoc|flags=.*adhoc)/m.test(signature);
if (team && team !== "not set" && !isAdhoc) ok(`Developer ID team: ${team}`);
else if (requireDeveloperId) fail("Developer ID signature required but no valid team signature was found");
else console.warn("WARN package is not Developer ID signed (diagnostic-only mode)");

if (requireDeveloperId) {
  try {
    execFileSync("codesign", ["--verify", "--deep", "--strict", app], { encoding: "utf8" });
    ok("codesign strict verification passed");
  } catch (error) {
    fail(`codesign strict verification failed: ${(error.stderr || error.message).trim()}`);
  }
}

if (process.exitCode) process.exit(process.exitCode);
