import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const supportScript = resolve(scriptDir, "check-windows-wgc-support.mjs");
const powershellWrapperScript = "scripts/windows/check-windows-wgc-support.ps1";

const defaults = {
  timeoutMs: 15000,
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-wgc-support-board-summary.mjs [options]

Options:
  --timeoutMs <ms>  Per child process timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks.

Description:
  Verifies check-windows-wgc-support --boardSummary is a single secret-free
  line and that --json includes the same boardSummary field. The test only
  runs the read-only WinRT/GPU preflight. It does not start Windows host,
  authenticate, ask for passwords, capture screen/audio, send input, or inject.
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
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function runSupport(args, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [supportScript, ...args], {
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

function runPowerShell(args, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      powershellWrapperScript,
      ...args,
    ], {
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

function singleLine(text) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 1, `expected exactly one stdout line, got ${lines.length}: ${JSON.stringify(lines)}`);
  return lines[0];
}

function assertNoSecretLeak(text, label) {
  const value = String(text || "");
  const forbidden = [
    /demo-password/i,
    /test-password/i,
    /LAN_DUAL_PASSWORD\s*=/i,
    /--password\s+\S+/i,
    /"password"\s*:/i,
  ];
  const matched = forbidden.find((pattern) => pattern.test(value));
  assert.equal(matched, undefined, `${label} contains a password-shaped token: ${matched}`);
}

function assertBoardSummaryShape(line, label) {
  assert.match(line, /^Windows WGC support: (ready|informational); /, label);
  assert.match(line, /supported=(yes|no|unknown)/, label);
  assert.match(line, /required=no/, label);
  assert.match(line, /osBuild=(unknown|\d+)/, label);
  assert.match(line, /sessionSupported=(yes|no|unknown)/, label);
  assert.match(line, /winrt=(ok|missing:\d+|missing:unknown)/, label);
  assert.match(line, /gpu=.+ hardware\/.+ virtual/, label);
  assert.match(line, /blockers=/, label);
  assert.match(line, /read-only/, label);
  assert.match(line, /no-host/, label);
  assert.match(line, /no-password\/auth/, label);
  assert.match(line, /no-screen\/audio-capture/, label);
  assert.match(line, /no-input\/inject/, label);
  assertNoSecretLeak(line, label);
}

async function verifyBoardSummary(args) {
  const result = await runSupport([
    "--timeoutMs", String(args.timeoutMs),
    "--boardSummary",
  ], args.timeoutMs + 3000);
  assert.equal(result.timedOut, false, "--boardSummary timed out");
  assert.equal(result.exitCode, 0, `--boardSummary failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.equal(result.stderr.trim(), "", "--boardSummary should not print stderr on success");
  const line = singleLine(result.stdout);
  assertBoardSummaryShape(line, "boardSummary stdout");
  return line;
}

async function verifyJsonSummary(args, expectedLine) {
  const result = await runSupport([
    "--timeoutMs", String(args.timeoutMs),
    "--json",
  ], args.timeoutMs + 3000);
  assert.equal(result.timedOut, false, "--json timed out");
  assert.equal(result.exitCode, 0, `--json failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.boardSummary, expectedLine);
  assertBoardSummaryShape(payload.boardSummary, "JSON boardSummary");
  assertNoSecretLeak(JSON.stringify(payload), "JSON payload");
}

async function verifyPowerShellBoardSummary(args, expectedLine) {
  const result = await runPowerShell([
    "-TimeoutMs", String(args.timeoutMs),
    "-BoardSummary",
  ], args.timeoutMs + 5000);
  assert.equal(result.timedOut, false, "PowerShell -BoardSummary timed out");
  assert.equal(result.exitCode, 0, `PowerShell -BoardSummary failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.equal(result.stderr.trim(), "", "PowerShell -BoardSummary should not print stderr on success");
  const line = singleLine(result.stdout);
  assert.equal(line, expectedLine);
  assertBoardSummaryShape(line, "PowerShell boardSummary stdout");
}

async function verifyPowerShellJsonSummary(args, expectedLine) {
  const result = await runPowerShell([
    "-TimeoutMs", String(args.timeoutMs),
    "-Json",
  ], args.timeoutMs + 5000);
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
    assert.match(output, /-RequireSupported/);
    assert.match(output, /read-only/);
    assert.match(output, /does not start Windows host/);
    assert.match(output, /does not ask for or print passwords/);
    assert.match(output, /does not capture screen or\s+audio/);
    assert.doesNotMatch(output, /Windows WGC support:/);
    assertNoSecretLeak(output, `PowerShell ${helpArg}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  const summary = await verifyBoardSummary(args);
  await verifyJsonSummary(args, summary);
  await verifyPowerShellBoardSummary(args, summary);
  await verifyPowerShellJsonSummary(args, summary);
  await verifyPowerShellHelp(args);
  console.log("[OK] Windows WGC support boardSummary is safe and parseable");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
