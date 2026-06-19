#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/plan-mac-input-safety.mjs";

function printHelp() {
  console.log(`Usage:
  node scripts/mac/test-mac-input-safety-plan.mjs [options]

Options:
  --help, -h        Show this help without running checks

Description:
  Verifies the Mac input safety plan script. The self-test checks that plan
  output stays read-only and secret-safe before real user-watched input work.
`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "super-secret-input-safety",
    },
  });
}

function outputOf(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

function assertSafeOutput(text, label) {
  const value = String(text || "");
  for (const forbidden of [
    "super-secret-input-safety",
    "LAN_DUAL_PASSWORD",
    "--password",
    "input_event",
    "sudo",
    "launchctl",
    "osascript -e",
  ]) {
    assert(!value.includes(forbidden), `${label} should not include ${forbidden}`);
  }
}

function checkHelp() {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag]);
    assert(result.status === 0, `${script} ${flag} should exit 0\n${outputOf(result)}`);
    assert(String(result.stdout).includes("Usage:"), `${script} ${flag} should print Usage`);
    assert(String(result.stdout).includes("--boardSummary"), `${script} ${flag} should document boardSummary`);
    assert(String(result.stdout).includes("--confirmUserWatching"), `${script} ${flag} should document the user-watching gate`);
    assertSafeOutput(outputOf(result), `${script} ${flag}`);
  }
  print("OK", "Mac input safety plan help is pure and safe");
}

function checkJsonPlan() {
  const result = run(["--json"]);
  assert(result.status === 0, `${script} --json should exit 0\n${outputOf(result)}`);
  const payload = parseJson(result.stdout, "input safety plan JSON");
  assert(payload.planId === "mac-input-safety-plan", "JSON should expose stable planId");
  assert(payload.status === "plan-only", "JSON should mark this as a plan-only output");
  assert(payload.defaultMode === "log", "JSON should keep log as default mode");
  assert(payload.realInput?.requiresUserWatching === true, "JSON should require user watching for real input");
  assert(payload.realInput?.startHelperRequiresConfirmFlag === true, "JSON should require start helper confirmation flag");
  assert(payload.realInput?.recommendedEventSet === "safe", "JSON should recommend safe event set first");
  assert(payload.blockers?.includes("requires-user-watching"), "JSON should expose the user-watching blocker");
  assert(payload.safety?.noPassword === true, "JSON should mark password-free");
  assert(payload.safety?.noInputEventsSent === true, "JSON should mark no input events sent");
  assert(payload.safety?.noInjectExecuted === true, "JSON should mark no inject executed");
  assertSafeOutput(outputOf(result), "input safety plan JSON");
  print("OK", "Mac input safety plan JSON documents safe real-input gates");
}

function checkBoardSummary() {
  const result = run(["--boardSummary"]);
  assert(result.status === 0, `${script} --boardSummary should exit 0\n${outputOf(result)}`);
  const lines = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
  assert(lines.length === 1, `boardSummary should print one line, got ${lines.length}`);
  const line = lines[0];
  assert(line.includes("Mac input safety plan:"), "boardSummary should identify the plan");
  assert(line.includes("status=plan-only"), "boardSummary should mark plan-only status");
  assert(line.includes("default=log"), "boardSummary should keep log as default");
  assert(line.includes("realInput=blocked-until-user-watching"), "boardSummary should block real input until user watches");
  assert(line.includes("required=--confirmUserWatching"), "boardSummary should include the confirmation flag");
  assert(line.includes("eventSet=safe"), "boardSummary should recommend the safe event set first");
  assert(line.includes("safety=no-password,no-input-events,no-inject"), "boardSummary should include safety boundary");
  assertSafeOutput(outputOf(result), "input safety plan boardSummary");
  print("OK", "Mac input safety plan boardSummary is one-line and safe");
}

function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }
  checkHelp();
  checkJsonPlan();
  checkBoardSummary();
  print("OK", "Mac input safety plan self-test passed");
}

main();
