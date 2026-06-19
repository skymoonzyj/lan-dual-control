#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/plan-mac-power-settings.mjs";

const defaults = {
  timeoutMs: 5000,
};

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-power-plan.mjs [options]

Verifies the read-only Mac power plan helper. The test never applies pmset,
never asks for a password, and only checks generated preview text.

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
    maxBuffer: 1024 * 1024,
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
  assertNotIncludes(value, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(value, "--password", label);
  assertNotIncludes(value, "sudo", label);
  assertNotIncludes(value, "--apply", label);
  assertNotIncludes(value, "input_event", label);
  assertNotIncludes(value, "--inputMode inject", label);
  assertNotIncludes(value, "inject", label);
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run(args, [flag]);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assertIncludes(result.stdout, "Usage", `${script} ${flag}`);
    assertIncludes(result.stdout, "--profile", `${script} ${flag}`);
    assertIncludes(result.stdout, "--sleep", `${script} ${flag}`);
    assertIncludes(result.stdout, "--displaySleep", `${script} ${flag}`);
    assertIncludes(result.stdout, "--networkWake", `${script} ${flag}`);
    assertIncludes(result.stdout, "read-only", `${script} ${flag}`);
    assertNoSecretOrInputGuidance(result.stdout, `${script} ${flag}`);
  }
  console.log("[OK] Mac power plan help is side-effect-free");
}

function checkJson(args) {
  const result = run(args, ["--json"]);
  assert(result.status === 0, `default JSON should exit 0\n${result.stdout}\n${result.stderr}`);
  const payload = parseJson(result.stdout, "default power plan JSON");
  assert(payload.status === "preview", "JSON status should be preview");
  assert(payload.profile === "all", "JSON profile should default to all");
  assert(payload.settings?.sleep === 0, "JSON sleep should default to 0");
  assert(payload.settings?.displaySleep === 0, "JSON displaySleep should default to 0");
  assert(payload.settings?.networkWake === "on", "JSON networkWake should default to on");
  assertIncludes(payload.commands?.preview || "", "pmset -a sleep 0 displaysleep 0 womp 1 tcpkeepalive 1", "JSON preview command");
  assertIncludes(payload.commands?.verify || "", "pmset -g custom", "JSON verify command");
  assertIncludes(payload.commands?.macUnattendedStatus || "", "check-mac-unattended-status.mjs", "JSON unattended command");
  assertIncludes(payload.commands?.macUnattendedStatus || "", "--boardSummary", "JSON unattended command");
  assertIncludes(payload.boardSummary || "", "MacPowerPlan=status=preview", "JSON board summary");
  assertIncludes(payload.boardSummary || "", "DryRunOnly", "JSON board summary");
  assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "default power plan JSON");
  console.log("[OK] Mac power plan JSON previews safe pmset and verification commands");
}

function checkBoardSummary(args) {
  const result = run(args, [
    "--boardSummary",
    "--profile",
    "ac",
    "--sleep",
    "0",
    "--displaySleep",
    "5",
    "--networkWake",
    "off",
  ]);
  assert(result.status === 0, `board summary should exit 0\n${result.stdout}\n${result.stderr}`);
  const text = String(result.stdout || "").trim();
  assertIncludes(text, "MacPowerPlan=status=preview", "board summary");
  assertIncludes(text, "profile=ac", "board summary");
  assertIncludes(text, "sleep=0", "board summary");
  assertIncludes(text, "displaySleep=5", "board summary");
  assertIncludes(text, "networkWake=off", "board summary");
  assertIncludes(text, "pmset -c sleep 0 displaysleep 5 womp 0 tcpkeepalive 0", "board summary");
  assertIncludes(text, "Verify=pmset -g custom", "board summary");
  assertIncludes(text, "MacUnattendedStatus=node scripts/mac/check-mac-unattended-status.mjs --boardSummary", "board summary");
  assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "board summary");
  console.log("[OK] Mac power plan board summary is copyable and secret-free");
}

function checkRejectsApply(args) {
  const result = run(args, ["--apply"]);
  assert(result.status !== 0, "--apply should be rejected because this helper is preview-only");
  assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "apply rejection");
  console.log("[OK] Mac power plan rejects apply-style execution");
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  checkHelp(args);
  checkJson(args);
  checkBoardSummary(args);
  checkRejectsApply(args);
  console.log("[OK] Mac power plan self-test passed");
}

try {
  main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exit(1);
}
