import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const supportScript = resolve(scriptDir, "check-windows-video-encoder-support.mjs");

const defaults = {
  timeoutMs: 10000,
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-video-encoder-support-board-summary.mjs [options]

Options:
  --timeoutMs <ms>  Per child process timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks.

Description:
  Verifies check-windows-video-encoder-support --boardSummary is a single
  secret-free line and that --json includes the same boardSummary field. The
  test skips real FFmpeg/WGC/WebCodecs probes, so it does not start a host,
  capture the screen, authenticate, send input, or execute inject.
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
      args.timeoutMs = Math.max(3000, Number(next) || defaults.timeoutMs);
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
  ];
  const matched = forbidden.find((pattern) => pattern.test(value));
  assert.equal(matched, undefined, `${label} contains a password-shaped token: ${matched}`);
}

function singleLine(text) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 1, `expected exactly one stdout line, got ${lines.length}: ${JSON.stringify(lines)}`);
  return lines[0];
}

async function verifyBoardSummary(args) {
  const result = await runSupport([
    "--skipFfmpeg",
    "--skipWgc",
    "--skipWebCodecs",
    "--boardSummary",
  ], args.timeoutMs);
  assert.equal(result.timedOut, false, "--boardSummary timed out");
  assert.equal(result.exitCode, 0, `--boardSummary failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.equal(result.stderr.trim(), "", "--boardSummary should not print stderr on success");
  const line = singleLine(result.stdout);
  assert.match(line, /^Windows video encoder support: ok; /);
  assert.match(line, /ffmpeg=skipped/);
  assert.match(line, /wgc=skipped/);
  assert.match(line, /webcodecs=skipped/);
  assert.match(line, /recommendation=/);
  assert.match(line, /read-only/);
  assert.match(line, /no-password/);
  assert.match(line, /no-host/);
  assert.match(line, /no-input\/inject/);
  assertNoSecretLeak(line, "boardSummary stdout");
  return line;
}

async function verifyJsonSummary(args, expectedLine) {
  const result = await runSupport([
    "--skipFfmpeg",
    "--skipWgc",
    "--skipWebCodecs",
    "--json",
  ], args.timeoutMs);
  assert.equal(result.timedOut, false, "--json timed out");
  assert.equal(result.exitCode, 0, `--json failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.boardSummary, expectedLine);
  assertNoSecretLeak(JSON.stringify(payload), "JSON payload");
}

async function verifyFailureSummary(args) {
  const result = await runSupport([
    "--skipFfmpeg",
    "--skipWgc",
    "--skipWebCodecs",
    "--requireAnyH264",
    "--boardSummary",
  ], args.timeoutMs);
  assert.equal(result.timedOut, false, "failure --boardSummary timed out");
  assert.notEqual(result.exitCode, 0, "failure --boardSummary should exit non-zero");
  const line = singleLine(result.stdout);
  assert.match(line, /^Windows video encoder support: failed; /);
  assert.match(line, /failures=1/);
  assert.match(line, /no-password/);
  assertNoSecretLeak(line, "failure boardSummary stdout");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  const summary = await verifyBoardSummary(args);
  await verifyJsonSummary(args, summary);
  await verifyFailureSummary(args);
  console.log("[OK] Windows video encoder support boardSummary is safe and parseable");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
