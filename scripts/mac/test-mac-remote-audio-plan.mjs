#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/plan-mac-remote-audio.mjs";

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
      LAN_DUAL_PASSWORD: "super-secret-remote-audio",
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
    "super-secret-remote-audio",
    "LAN_DUAL_PASSWORD",
    "--password",
    "input_event",
    "inject",
    "sudo",
    "launchctl",
    "osascript -e",
    "set volume",
  ]) {
    if (forbidden === "inject" && value.includes("no password/input/inject")) {
      continue;
    }
    assert(!value.includes(forbidden), `${label} should not include ${forbidden}`);
  }
}

function checkHelp() {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag]);
    assert(result.status === 0, `${script} ${flag} should exit 0\n${outputOf(result)}`);
    assert(String(result.stdout).includes("Usage:"), `${script} ${flag} should print Usage`);
    assert(String(result.stdout).includes("--boardSummary"), `${script} ${flag} should document boardSummary`);
    assert(String(result.stdout).includes("remote-only"), `${script} ${flag} should explain remote-only audio`);
    assertSafeOutput(outputOf(result), `${script} ${flag}`);
  }
  print("OK", "Mac remote audio plan help is pure and safe");
}

function checkJsonPlan() {
  const result = run(["--json"]);
  assert(result.status === 0, `${script} --json should exit 0\n${outputOf(result)}`);
  const payload = parseJson(result.stdout, "remote audio plan JSON");
  assert(payload.planId === "mac-remote-audio-plan", "JSON should expose stable planId");
  assert(payload.status === "plan-only", "JSON should mark this as a plan-only output");
  assert(payload.currentCapture?.captureMode === "system-pcm", "JSON should identify current system PCM capture");
  assert(payload.currentCapture?.localPlaybackControl === "not-controlled-by-host", "JSON should say local playback is not controlled by host");
  assert(payload.currentCapture?.doesNotMuteLocalOutput === true, "JSON should state current host does not mute local output");
  assert(payload.currentCapture?.evidence?.some((line) => String(line).includes("capturesAudio=true")), "JSON should cite ScreenCaptureKit audio capture evidence");
  assert(payload.currentCapture?.evidence?.some((line) => String(line).includes("no output-device or volume change")), "JSON should cite lack of output device/volume control");
  assert(payload.safety?.noPassword === true, "JSON should mark password-free");
  assert(payload.safety?.noInput === true, "JSON should mark input-free");
  assert(payload.safety?.noInject === true, "JSON should mark inject-free");
  assert(payload.safety?.noVolumeChange === true, "JSON should mark volume-change-free");
  assert(Array.isArray(payload.consentChecklist), "JSON should include a consent checklist");
  assert(
    payload.consentChecklist.some((item) => item.id === "explain-current-local-output"),
    "JSON should require explaining that current Mac output may still be audible",
  );
  assert(
    payload.consentChecklist.some((item) => item.id === "confirm-restore-path-before-change"),
    "JSON should require confirming a restore path before any change",
  );
  assert(Array.isArray(payload.restoreChecklist), "JSON should include a restore checklist");
  assert(
    payload.restoreChecklist.some((item) => item.id === "rerun-remote-audio-status"),
    "JSON should require rerunning remote audio status after restore",
  );
  const optionIds = new Set((payload.remoteOnlyOptions || []).map((option) => option.id));
  for (const id of ["manual-mute-restore", "virtual-output-device", "product-toggle"]) {
    assert(optionIds.has(id), `JSON should include ${id} option`);
  }
  assertSafeOutput(outputOf(result), "remote audio plan JSON");
  print("OK", "Mac remote audio plan JSON documents current behavior and safe options");
}

function checkBoardSummary() {
  const result = run(["--boardSummary"]);
  assert(result.status === 0, `${script} --boardSummary should exit 0\n${outputOf(result)}`);
  const lines = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
  assert(lines.length === 1, `boardSummary should print one line, got ${lines.length}`);
  const line = lines[0];
  assert(line.includes("Mac remote audio plan:"), "boardSummary should identify the plan");
  assert(line.includes("status=plan-only"), "boardSummary should mark plan-only status");
  assert(line.includes("capture=system-pcm-does-not-mute-local"), "boardSummary should summarize current capture behavior");
  assert(line.includes("RemoteOnlyOptions=manual-mute-restore/virtual-output-device/product-toggle"), "boardSummary should include remote-only options");
  assert(line.includes("no-volume-change"), "boardSummary should promise no volume change");
  assert(line.includes("no password/input/inject"), "boardSummary should include safety boundary");
  assert(line.includes("Consent=explicit-before-change"), "boardSummary should include explicit consent gate");
  assert(line.includes("RestorePath=required-before-apply"), "boardSummary should include restore path gate");
  assertSafeOutput(outputOf(result), "remote audio plan boardSummary");
  print("OK", "Mac remote audio plan boardSummary is one-line and safe");
}

function main() {
  checkHelp();
  checkJsonPlan();
  checkBoardSummary();
  print("OK", "Mac remote audio plan self-test passed");
}

main();
