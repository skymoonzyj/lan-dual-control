#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const supportScript = resolve(scriptDir, "check-webcodecs-h264-support.mjs");
const powershellWrapperScript = "scripts/windows/check-webcodecs-h264-support.ps1";

const defaults = {
  timeoutMs: 30000,
  codec: "avc1.42C02A",
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-webcodecs-h264-support-board-summary.mjs [options]

Options:
  --timeoutMs <ms>  Per child process timeout. Default: ${defaults.timeoutMs}
  --codec <codec>   Codec string to probe. Default: ${defaults.codec}
  --help, -h        Show this help without running checks.

Description:
  Verifies check-webcodecs-h264-support --boardSummary is a single secret-free
  line, --json includes the same boardSummary field, and the PowerShell wrapper
  exposes matching -BoardSummary/-Json output. It opens only a temporary local
  browser probe page and does not start hosts, authenticate, capture screen or
  audio, send input, or execute inject.
`);
}

function parseArgs(argv) {
  const args = { ...defaults, help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(5000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    if (token === "--codec" && next && !next.startsWith("--")) {
      args.codec = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function runNode(extraArgs, timeoutMs) {
  return run(process.execPath, [supportScript, ...extraArgs], timeoutMs);
}

function runPowerShell(extraArgs, timeoutMs) {
  return run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    powershellWrapperScript,
    ...extraArgs,
  ], timeoutMs);
}

function run(command, commandArgs, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({ exitCode: null, timedOut: true, stdout, stderr });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({ exitCode: null, timedOut: false, stdout, stderr: `${stderr}\n${error.message}`.trim() });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({ exitCode, timedOut: false, stdout, stderr });
    });
  });
}

function assertNoSecretLeak(text, label) {
  const value = String(text || "");
  const forbidden = [
    /demo-password/i,
    /LAN_DUAL_PASSWORD\s*=/i,
    /--password\s+\S+/i,
    /"password"\s*:/i,
    /input_ack|video_frame|audio_frame|session_answer|hello_ack/i,
  ];
  const matched = forbidden.find((pattern) => pattern.test(value));
  assert.equal(matched, undefined, `${label} contains a secret/protocol-shaped token: ${matched}`);
}

function singleLine(text, label) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 1, `${label} expected exactly one stdout line, got ${lines.length}: ${JSON.stringify(lines)}`);
  return lines[0];
}

function assertSummary(line, label, codec) {
  assert.match(line, /^Windows WebCodecs H\.264: ok; /, `${label} should start with ok summary`);
  assert.match(line, /any=(yes|no)/, `${label} should include any support status`);
  assert.match(line, /preferred=/, `${label} should include preferred config`);
  assert.match(line, new RegExp(`supported=.*${codec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|supported=none`), `${label} should include supported codecs`);
  assert.match(line, /browser=/, `${label} should include browser summary`);
  assert.match(line, /Read-only browser capability probe/, `${label} should include safety scope`);
  assert.match(line, /no host startup/, `${label} should mention no host startup`);
  assert.match(line, /no password\/auth/, `${label} should mention password/auth safety`);
  assert.match(line, /no screen\/audio capture/, `${label} should mention capture safety`);
  assert.match(line, /no input\/inject/, `${label} should mention input/inject safety`);
  assertNoSecretLeak(line, label);
}

async function verifyNodeBoardSummary(args) {
  const result = await runNode([
    "--codecs", args.codec,
    "--boardSummary",
  ], args.timeoutMs);
  assert.equal(result.timedOut, false, "Node --boardSummary timed out");
  assert.equal(result.exitCode, 0, `Node --boardSummary failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.equal(result.stderr.trim(), "", "Node --boardSummary should not print stderr on success");
  const line = singleLine(result.stdout, "Node --boardSummary");
  assertSummary(line, "Node --boardSummary", args.codec);
  return line;
}

async function verifyNodeJson(args, expectedLine) {
  const result = await runNode([
    "--codecs", args.codec,
    "--json",
  ], args.timeoutMs);
  assert.equal(result.timedOut, false, "Node --json timed out");
  assert.equal(result.exitCode, 0, `Node --json failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.boardSummary, expectedLine);
  assert.equal(payload.args.codecs.length, 1);
  assert.equal(payload.args.codecs[0], args.codec);
  assertNoSecretLeak(JSON.stringify(payload), "Node JSON payload");
}

async function verifyPowerShellBoardSummary(args, expectedLine) {
  const result = await runPowerShell([
    "-Codecs", args.codec,
    "-BoardSummary",
  ], args.timeoutMs);
  assert.equal(result.timedOut, false, "PowerShell -BoardSummary timed out");
  assert.equal(result.exitCode, 0, `PowerShell -BoardSummary failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.equal(result.stderr.trim(), "", "PowerShell -BoardSummary should not print stderr on success");
  assert.equal(singleLine(result.stdout, "PowerShell -BoardSummary"), expectedLine);
  assertNoSecretLeak(result.stdout, "PowerShell -BoardSummary stdout");
}

async function verifyPowerShellJson(args, expectedLine) {
  const result = await runPowerShell([
    "-Codecs", args.codec,
    "-Json",
  ], args.timeoutMs);
  assert.equal(result.timedOut, false, "PowerShell -Json timed out");
  assert.equal(result.exitCode, 0, `PowerShell -Json failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.boardSummary, expectedLine);
  assertNoSecretLeak(JSON.stringify(payload), "PowerShell JSON payload");
}

async function verifyPowerShellHelp(args) {
  for (const helpArg of ["-Help", "-h"]) {
    const result = await runPowerShell([helpArg], args.timeoutMs);
    assert.equal(result.timedOut, false, `PowerShell ${helpArg} timed out`);
    assert.equal(result.exitCode, 0, `PowerShell ${helpArg} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /Usage:/);
    assert.match(output, /-BoardSummary/);
    assert.match(output, /-RequireCodec/);
    assert.match(output, /read-only/i);
    assert.match(output, /does not start Windows host/);
    assert.match(output, /does not ask for or print passwords/);
    assert.doesNotMatch(output, /Windows WebCodecs H\.264:/);
    assertNoSecretLeak(output, `PowerShell ${helpArg}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  const summary = await verifyNodeBoardSummary(args);
  await verifyNodeJson(args, summary);
  await verifyPowerShellBoardSummary(args, summary);
  await verifyPowerShellJson(args, summary);
  await verifyPowerShellHelp(args);
  console.log("[OK] Windows WebCodecs H.264 boardSummary is safe and parseable");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
