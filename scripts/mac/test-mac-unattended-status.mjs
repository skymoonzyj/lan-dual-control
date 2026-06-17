#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/check-mac-unattended-status.mjs";

const defaults = {
  timeoutMs: 8000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-unattended-status.mjs [options]

Verifies check-mac-unattended-status help, JSON, board-summary, strict failure,
and LaunchAgent plist parsing paths. It only targets loopback/offline test ports.

Options:
  --timeoutMs <ms>    Command timeout. Default: ${defaults.timeoutMs}
  --help, -h          Show this help without running checks
`);
}

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 1000, 60000, defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function run(args, extraArgs = []) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(text, needle, label) {
  assert(String(text || "").includes(needle), `${label} should include ${needle}`);
}

function assertNotIncludes(text, needle, label) {
  assert(!String(text || "").includes(needle), `${label} should not include ${needle}`);
}

function assertNoSecretOrInputGuidance(text, label) {
  const value = String(text || "");
  assertNotIncludes(value, "super-secret-unattended-password", label);
  assertNotIncludes(value, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(value, "--password", label);
  assertNotIncludes(value, "input_event", label);
  assertNotIncludes(value, "--inputMode inject", label);
  assertNotIncludes(value, "--injectInput", label);
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function baseOfflineArgs(launchAgentPath) {
  return [
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "800",
    "--launchAgentPath",
    launchAgentPath,
    "--skipLaunchctl",
    "--skipPmset",
  ];
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run(args, [flag]);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assertIncludes(result.stdout, "Usage", `${script} ${flag}`);
    assertIncludes(result.stdout, "--requireLaunchAgent", `${script} ${flag}`);
    assertIncludes(result.stdout, "--skipLaunchctl", `${script} ${flag}`);
    assertIncludes(result.stdout, "host", `${script} ${flag}`);
    assertIncludes(result.stdout, "launchAgent", `${script} ${flag}`);
    assertIncludes(result.stdout, "power", `${script} ${flag}`);
    assertNoSecretOrInputGuidance(result.stdout, `${script} ${flag}`);
  }
  print("OK", "Unattended status help exits quickly and stays side-effect-free");
}

function checkMissingLaunchAgentJson(args) {
  const missingPath = path.join(tmpdir(), `missing-lan-dual-agent-${Date.now()}.plist`);
  const result = run(args, [
    "--json",
    ...baseOfflineArgs(missingPath),
  ]);
  const payload = parseJson(result.stdout, "missing LaunchAgent JSON");
  assert(result.status === 0, "missing LaunchAgent should stay non-failing by default");
  assert(payload.ok === true, "missing LaunchAgent default payload should report ok=true");
  assert(payload.host?.online === false, "missing LaunchAgent payload should keep host offline");
  assert(payload.launchAgent?.exists === false, "missing LaunchAgent payload should mark plist missing");
  assert(payload.launchAgent?.launchctl?.checked === false, "missing LaunchAgent payload should skip launchctl");
  assert(payload.power?.checked === false, "missing LaunchAgent payload should skip pmset");
  assert(Array.isArray(payload.findings), "missing LaunchAgent payload should include findings");
  assert(payload.findings.some((item) => item.id === "launch-agent-missing" && item.level === "warning"), "missing LaunchAgent should be a warning by default");
  assertIncludes(payload.boardSummary, "MacUnattendedStatus=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "HostReadiness=", "missing LaunchAgent board summary");
  assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "missing LaunchAgent JSON");
  print("OK", "Missing LaunchAgent is reported as a warning in default JSON mode");
}

function checkRequireLaunchAgentFails(args) {
  const missingPath = path.join(tmpdir(), `missing-lan-dual-agent-required-${Date.now()}.plist`);
  const result = run(args, [
    "--json",
    ...baseOfflineArgs(missingPath),
    "--requireLaunchAgent",
  ]);
  const payload = parseJson(result.stdout, "require LaunchAgent JSON");
  assert(result.status !== 0, "requireLaunchAgent should fail when plist is missing");
  assert(payload.ok === false, "requireLaunchAgent payload should report ok=false");
  assert(payload.findings.some((item) => item.id === "launch-agent-missing" && item.level === "blocker"), "requireLaunchAgent should emit a blocker");
  assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "require LaunchAgent JSON");
  print("OK", "requireLaunchAgent turns missing plist into a blocker");
}

function checkRequireLaunchAgentLoadedNeedsProbe(args) {
  const missingPath = path.join(tmpdir(), `missing-lan-dual-agent-loaded-${Date.now()}.plist`);
  const result = run(args, [
    "--json",
    ...baseOfflineArgs(missingPath),
    "--requireLaunchAgentLoaded",
  ]);
  const payload = parseJson(result.stdout, "require LaunchAgent loaded JSON");
  assert(result.status !== 0, "requireLaunchAgentLoaded should fail when launchctl is skipped");
  assert(payload.ok === false, "requireLaunchAgentLoaded payload should report ok=false");
  assert(payload.findings.some((item) => item.id === "launch-agent-loaded-unchecked" && item.level === "blocker"), "requireLaunchAgentLoaded should require a launchctl result");
  assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "require LaunchAgent loaded JSON");
  print("OK", "requireLaunchAgentLoaded refuses an unchecked launchctl result");
}

function checkStrictWarningsFail(args) {
  const missingPath = path.join(tmpdir(), `missing-lan-dual-agent-strict-${Date.now()}.plist`);
  const result = run(args, [
    "--json",
    ...baseOfflineArgs(missingPath),
    "--strict",
  ]);
  const payload = parseJson(result.stdout, "strict unattended JSON");
  assert(result.status !== 0, "strict mode should fail on warnings");
  assert(payload.ok === false, "strict mode payload should report ok=false");
  assert(payload.findings.some((item) => item.level === "warning"), "strict mode should preserve warning findings");
  assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "strict unattended JSON");
  print("OK", "strict mode turns unattended warnings into a failing report");
}

function checkFakePlist(args) {
  const dir = mkdtempSync(path.join(tmpdir(), "lan-dual-unattended-agent-"));
  try {
    const plist = path.join(dir, "com.lan-dual-control.mac-host.plist");
    writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.lan-dual-control.mac-host</string>
</dict>
</plist>
`, "utf8");
    const result = run(args, [
      "--json",
      ...baseOfflineArgs(plist),
    ]);
    const payload = parseJson(result.stdout, "fake plist unattended JSON");
    assert(result.status === 0, "fake plist path should stay non-failing");
    assert(payload.launchAgent?.exists === true, "fake plist should exist");
    assert(payload.launchAgent?.readable === true, "fake plist should be readable");
    assert(payload.launchAgent?.installed === true, "fake plist should be considered installed");
    assert(payload.launchAgent?.labelMatches === true, "fake plist label should match");
    assertIncludes(payload.commands?.hostReadiness || "", "check-mac-host-readiness.mjs", "fake plist commands.hostReadiness");
    assert(payload.limitations.some((item) => /System sleep/.test(item)), "fake plist payload should document sleep limit");
    assert(payload.limitations.some((item) => /Reboot/.test(item)), "fake plist payload should document reboot/login limit");
    assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "fake plist unattended JSON");
    print("OK", "LaunchAgent plist label parsing and limitations are machine-readable");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function checkBoardSummary(args) {
  const missingPath = path.join(tmpdir(), `missing-lan-dual-agent-board-${Date.now()}.plist`);
  const result = run(args, [
    "--boardSummary",
    ...baseOfflineArgs(missingPath),
  ]);
  assert(result.status === 0, "board summary should stay non-failing by default");
  const text = String(result.stdout || "").trim();
  const lines = text.split(/\r?\n/).filter(Boolean);
  assert(lines.length === 1, `board summary should be one line, got ${lines.length}`);
  assertIncludes(text, "Mac unattended status:", "board summary");
  assertIncludes(text, "MacUnattendedStatus=", "board summary");
  assertIncludes(text, "HostReadiness=", "board summary");
  assertIncludes(text, "No password", "board summary");
  assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "board summary");
  print("OK", "Board summary is one line, actionable, and secret-free");
}

function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  checkMissingLaunchAgentJson(args);
  checkRequireLaunchAgentFails(args);
  checkRequireLaunchAgentLoadedNeedsProbe(args);
  checkStrictWarningsFail(args);
  checkFakePlist(args);
  checkBoardSummary(args);
  print("OK", "Mac unattended status self-test passed");
}

main();
