#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/install-mac-host-launch-agent.mjs";

const defaults = {
  timeoutMs: 8000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-host-launch-agent.mjs [options]

Verifies the Mac host LaunchAgent planner. The test uses temporary paths only:
dry-run must not write files, --write writes only the plist, and no path loads
launchctl, starts Mac host, requests passwords, authenticates, sends input, or
executes inject.

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

function assertNoSecretsOrRuntimeActions(text, label) {
  const value = String(text || "");
  assertNotIncludes(value, "super-secret-launch-agent-password", label);
  assertNotIncludes(value, "LAN_DUAL_PASSWORD=", label);
  assert(!/--password(?:\s|=)/.test(value), `${label} should not include --password values`);
  assertNotIncludes(value, "--inputMode inject", label);
  assertNotIncludes(value, "--injectInput", label);
  assertNotIncludes(value, "input_event", label);
  assertNotIncludes(value, "launchctl bootstrap completed", label);
  assertNotIncludes(value, "Mac client prototype:", label);
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function tempPaths() {
  const dir = mkdtempSync(path.join(tmpdir(), "lan-dual-launch-agent-"));
  return {
    dir,
    plist: path.join(dir, "LaunchAgents", "com.lan-dual-control.mac-host.plist"),
    logDir: path.join(dir, "Logs"),
  };
}

function baseArgs(paths) {
  return [
    "--launchAgentPath",
    paths.plist,
    "--logDir",
    paths.logDir,
    "--repoRoot",
    repoRoot,
  ];
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run(args, [flag]);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assertIncludes(result.stdout, "Usage", `${script} ${flag}`);
    assertIncludes(result.stdout, "--passwordMode", `${script} ${flag}`);
    assertIncludes(result.stdout, "--write", `${script} ${flag}`);
    assertIncludes(result.stdout, "loading launchctl", `${script} ${flag}`);
    assertNoSecretsOrRuntimeActions(`${result.stdout}\n${result.stderr}`, `${script} ${flag}`);
  }
  print("OK", "LaunchAgent planner help exits quickly and stays side-effect-free");
}

function checkDryRunJson(args) {
  const paths = tempPaths();
  try {
    const result = run(args, [
      "--json",
      ...baseArgs(paths),
    ]);
    const payload = parseJson(result.stdout, "dry-run LaunchAgent JSON");
    assert(result.status === 0, "dry-run JSON should exit 0");
    assert(payload.ok === true, "dry-run JSON should report ok=true");
    assert(payload.dryRun === true, "dry-run JSON should mark dryRun=true");
    assert(payload.wrote === false, "dry-run JSON should not write");
    assert(!existsSync(paths.plist), "dry-run should not create plist");
    assert(Array.isArray(payload.programArguments), "dry-run JSON should include programArguments");
    assert(payload.programArguments.includes("scripts/mac/start-mac-host.mjs"), "programArguments should start Mac host helper");
    assert(payload.programArguments.includes("--ephemeralPassword"), "default mode should use ephemeral password");
    assert(payload.programArguments.includes("--requirePassword"), "programArguments should require password");
    assert(payload.programArguments.includes("--inputMode"), "programArguments should include input mode");
    assert(payload.programArguments.includes("log"), "programArguments should keep log mode");
    assertIncludes(payload.plist, "<key>ProgramArguments</key>", "dry-run plist");
    assertIncludes(payload.commands?.bootstrap || "", "launchctl bootstrap", "dry-run commands.bootstrap");
    assertIncludes(payload.commands?.unattendedStatus || "", "check-mac-unattended-status.mjs", "dry-run commands.unattendedStatus");
    assertIncludes(payload.boardSummary || "", "MacLaunchAgentPlan=", "dry-run boardSummary");
    assertIncludes(payload.boardSummary || "", "maxFps=30", "dry-run boardSummary");
    assertIncludes(payload.boardSummary || "", "ManualLoad=", "dry-run boardSummary");
    assert(payload.warnings.some((item) => /random password is not shared/.test(item)), "dry-run warnings should explain ephemeral auth limit");
    assertNoSecretsOrRuntimeActions(`${result.stdout}\n${result.stderr}`, "dry-run LaunchAgent JSON");
    print("OK", "Dry-run JSON generates a safe ephemeral LaunchAgent plan without writing files");
  } finally {
    rmSync(paths.dir, { recursive: true, force: true });
  }
}

function checkBoardSummary(args) {
  const paths = tempPaths();
  try {
    const result = run(args, [
      "--boardSummary",
      ...baseArgs(paths),
    ]);
    assert(result.status === 0, `boardSummary should exit 0\n${result.stdout}\n${result.stderr}`);
    const text = String(result.stdout || "").trim();
    const lines = text.split(/\r?\n/).filter(Boolean);
    assert(lines.length === 1, `boardSummary should be one line, got ${lines.length}`);
    assertIncludes(text, "Mac LaunchAgent plan:", "boardSummary");
    assertIncludes(text, "auth=ephemeral-discovery-only", "boardSummary");
    assertIncludes(text, "maxFps=30", "boardSummary");
    assertIncludes(text, "MacLaunchAgentPlan=", "boardSummary");
    assertIncludes(text, "ManualWrite=", "boardSummary");
    assertIncludes(text, "ManualLoad=", "boardSummary");
    assertIncludes(text, "No password is written", "boardSummary");
    assert(!existsSync(paths.plist), "boardSummary dry-run should not create plist");
    assertNoSecretsOrRuntimeActions(`${result.stdout}\n${result.stderr}`, "boardSummary");
    print("OK", "Board summary is one safe line and still dry-runs");
  } finally {
    rmSync(paths.dir, { recursive: true, force: true });
  }
}

function checkMaxFpsDryRunSummary(args) {
  const paths = tempPaths();
  try {
    const result = run(args, [
      "--json",
      "--maxScreenFps",
      "60",
      ...baseArgs(paths),
    ]);
    const payload = parseJson(result.stdout, "max-FPS LaunchAgent JSON");
    assert(result.status === 0, "max-FPS JSON should exit 0");
    assert(payload.args?.maxScreenFps === 60, "max-FPS JSON should preserve maxScreenFps=60");
    assert(payload.programArguments.includes("--maxScreenFps"), "max-FPS programArguments should include --maxScreenFps");
    assert(payload.programArguments.includes("60"), "max-FPS programArguments should include 60");
    assertIncludes(payload.commands?.dryRun || "", "--maxScreenFps 60", "max-FPS commands.dryRun");
    assertIncludes(payload.commands?.writePlist || "", "--maxScreenFps 60", "max-FPS commands.writePlist");
    assertIncludes(payload.commands?.writePlist || "", "--write", "max-FPS commands.writePlist");
    assertIncludes(payload.commands?.writePlist || "", "--launchAgentPath", "max-FPS commands.writePlist");
    assertIncludes(payload.commands?.writePlist || "", "--logDir", "max-FPS commands.writePlist");
    assertIncludes(payload.boardSummary || "", "maxFps=60", "max-FPS boardSummary");
    assertIncludes(payload.boardSummary || "", "MacLaunchAgentPlan=node scripts/mac/install-mac-host-launch-agent.mjs", "max-FPS boardSummary");
    assertIncludes(payload.boardSummary || "", "--maxScreenFps 60 --boardSummary", "max-FPS boardSummary");
    assertIncludes(payload.boardSummary || "", "ManualWrite=", "max-FPS boardSummary");
    assertIncludes(payload.boardSummary || "", "--maxScreenFps 60", "max-FPS boardSummary ManualWrite");
    assert(!existsSync(paths.plist), "max-FPS dry-run should not create plist");
    assertNoSecretsOrRuntimeActions(`${result.stdout}\n${result.stderr}`, "max-FPS LaunchAgent JSON");
    print("OK", "Max-FPS dry-run keeps the 60Hz planner command secret-free and side-effect-free");
  } finally {
    rmSync(paths.dir, { recursive: true, force: true });
  }
}

function checkWrite(args) {
  const paths = tempPaths();
  try {
    const result = run(args, [
      "--json",
      "--write",
      ...baseArgs(paths),
    ]);
    const payload = parseJson(result.stdout, "write LaunchAgent JSON");
    assert(result.status === 0, `write JSON should exit 0\n${result.stdout}\n${result.stderr}`);
    assert(payload.wrote === true, "write JSON should mark wrote=true");
    assert(payload.dryRun === false, "write JSON should mark dryRun=false");
    assert(existsSync(paths.plist), "write should create plist");
    assert(existsSync(paths.logDir), "write should create log directory");
    const plist = readFileSync(paths.plist, "utf8");
    assertIncludes(plist, "<key>Label</key>", "written plist");
    assertIncludes(plist, "scripts/mac/start-mac-host.mjs", "written plist");
    assertIncludes(plist, "--ephemeralPassword", "written plist");
    assertIncludes(plist, "--inputMode", "written plist");
    assertIncludes(plist, "log", "written plist");
    assertNoSecretsOrRuntimeActions(`${plist}\n${result.stdout}\n${result.stderr}`, "write LaunchAgent JSON");

    const second = run(args, [
      "--json",
      "--write",
      ...baseArgs(paths),
    ]);
    const secondPayload = parseJson(second.stdout, "overwrite refusal JSON");
    assert(second.status !== 0, "second write without --force should fail");
    assert(secondPayload.ok === false, "overwrite refusal should report ok=false");
    assert(/already exists/.test(secondPayload.error?.message || ""), "overwrite refusal should explain existing plist");

    const forced = run(args, [
      "--json",
      "--write",
      "--force",
      ...baseArgs(paths),
    ]);
    const forcedPayload = parseJson(forced.stdout, "force overwrite JSON");
    assert(forced.status === 0, "forced write should exit 0");
    assert(forcedPayload.wrote === true, "forced write should report wrote=true");
    assertNoSecretsOrRuntimeActions(`${forced.stdout}\n${forced.stderr}`, "force overwrite JSON");
    print("OK", "--write creates only plist/log paths and protects existing files unless --force is explicit");
  } finally {
    rmSync(paths.dir, { recursive: true, force: true });
  }
}

function checkPasswordModes(args) {
  const promptPaths = tempPaths();
  const envPaths = tempPaths();
  try {
    const prompt = run(args, [
      "--json",
      "--passwordMode",
      "prompt",
      ...baseArgs(promptPaths),
    ]);
    const promptPayload = parseJson(prompt.stdout, "prompt mode JSON");
    assert(prompt.status === 0, "prompt mode dry-run should exit 0");
    assert(promptPayload.programArguments.includes("--promptPassword"), "prompt mode should use visible password prompt");
    assert(!promptPayload.programArguments.includes("--ephemeralPassword"), "prompt mode should not include ephemeral password");
    assertIncludes(promptPayload.commands?.writePlist || "", "--passwordMode prompt", "prompt mode commands.writePlist");
    assert(promptPayload.warnings.some((item) => /visible password dialog/.test(item)), "prompt mode should warn about visible dialog");
    assertNoSecretsOrRuntimeActions(`${prompt.stdout}\n${prompt.stderr}`, "prompt mode JSON");

    const env = run(args, [
      "--json",
      "--passwordMode",
      "env-required",
      "--keepAlive",
      ...baseArgs(envPaths),
    ]);
    const envPayload = parseJson(env.stdout, "env-required mode JSON");
    assert(env.status === 0, "env-required mode dry-run should exit 0");
    assert(!envPayload.programArguments.includes("--promptPassword"), "env-required mode should not prompt");
    assert(!envPayload.programArguments.includes("--ephemeralPassword"), "env-required mode should not use ephemeral");
    assert(envPayload.programArguments.includes("--requirePassword"), "env-required mode should require a password source");
    assertIncludes(envPayload.plist, "<key>KeepAlive</key>", "env-required plist");
    assertIncludes(envPayload.plist, "SuccessfulExit", "env-required keepAlive plist");
    assertIncludes(envPayload.commands?.writePlist || "", "--passwordMode env-required", "env-required commands.writePlist");
    assertIncludes(envPayload.commands?.writePlist || "", "--keepAlive", "env-required commands.writePlist");
    assert(envPayload.warnings.some((item) => /launchd provides LAN_DUAL_PASSWORD/.test(item)), "env-required mode should warn about launchd env");
    assertNoSecretsOrRuntimeActions(`${env.stdout}\n${env.stderr}`, "env-required mode JSON");
    print("OK", "Prompt and env-required password modes stay secret-free and explicit");
  } finally {
    rmSync(promptPaths.dir, { recursive: true, force: true });
    rmSync(envPaths.dir, { recursive: true, force: true });
  }
}

function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  checkDryRunJson(args);
  checkBoardSummary(args);
  checkMaxFpsDryRunSummary(args);
  checkWrite(args);
  checkPasswordModes(args);
  print("OK", "Mac host LaunchAgent planner self-test passed");
}

try {
  main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
}
