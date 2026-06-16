import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const mediaScript = resolve(scriptDir, "observe-windows-host-media.mjs");

const defaults = {
  timeoutMs: 45000,
};

function printUsage() {
  console.log(`Usage:
  node scripts/windows/test-windows-host-media-board-summary.mjs [options]

Options:
  --timeoutMs <ms>  Per-command timeout (default: ${defaults.timeoutMs})
  --help, -h        Show this help

Description:
  Verifies observe-windows-host-media exposes a secret-free boardSummary in
  JSON, failure JSON, and one-line Agent Link Board modes using local mock
  video/audio hosts.
`);
}

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--timeoutMs") {
      args.timeoutMs = Number(argv[index + 1]) || defaults.timeoutMs;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function runMedia(argv, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [mediaScript, ...argv], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, args.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({ exitCode, stdout, stderr, timedOut });
    });
  });
}

function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(text, expected, label) {
  assert(String(text).includes(expected), `${label} should include ${expected}`);
}

function assertNotIncludes(text, unexpected, label) {
  assert(!String(text).includes(unexpected), `${label} should not include ${unexpected}`);
}

function assertNoSecretLeak(text, label) {
  for (const secret of ["media-test-secret", "should-not-render", "demo-password"]) {
    assertNotIncludes(text, secret, label);
  }
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}\n${text.slice(0, 1000)}`);
  }
}

function baseFastArgs(port) {
  return [
    "--port", String(port),
    "--password", "media-test-secret-should-not-render",
    "--commandTimeoutMs", "20000",
    "--resourceSample", "false",
  ];
}

function mockVideoArgs(port) {
  return [
    ...baseFastArgs(port),
    "--skipAudio",
    "--videoScreenMode", "mock",
    "--requireRealVideo", "false",
    "--videoDurationMs", "800",
    "--videoMinFrames", "2",
    "--videoMinFps", "1",
  ];
}

function mockAudioArgs(port) {
  return [
    ...baseFastArgs(port),
    "--skipVideo",
    "--audioMode", "mock",
    "--audioScreenMode", "mock",
    "--requirePcm", "false",
    "--audioDurationMs", "800",
    "--audioMinFrames", "2",
    "--audioMinFps", "1",
  ];
}

function failingMockVideoArgs(port) {
  return [
    ...mockVideoArgs(port),
    "--videoMinFrames", "9999",
    "--videoMinFps", "999",
    "--videoRetries", "0",
  ];
}

function failingVideoPassingAudioArgs(port) {
  return [
    ...baseFastArgs(port),
    "--videoScreenMode", "mock",
    "--requireRealVideo", "false",
    "--videoDurationMs", "800",
    "--videoMinFrames", "9999",
    "--videoMinFps", "999",
    "--videoRetries", "0",
    "--audioMode", "mock",
    "--audioScreenMode", "mock",
    "--requirePcm", "false",
    "--audioDurationMs", "800",
    "--audioMinFrames", "2",
    "--audioMinFps", "1",
  ];
}

async function verifyHelp(args) {
  const result = await runMedia(["--help"], args);
  assert(result.exitCode === 0, `help should exit 0, got ${result.exitCode}`);
  assertIncludes(result.stdout, "--boardSummary", "help");
  assertIncludes(result.stdout, "--json", "help");
}

async function verifyJsonSummary(args) {
  const port = await getFreePort();
  const result = await runMedia([...mockVideoArgs(port), "--json"], args);
  assert(!result.timedOut, "JSON video run timed out");
  assert(result.exitCode === 0, `JSON video run failed: ${result.stderr || result.stdout}`);
  assertNoSecretLeak(result.stdout, "JSON stdout");
  assertNoSecretLeak(result.stderr, "JSON stderr");
  const payload = parseJson(result.stdout, "media JSON");
  assert(payload.ok === true, "JSON ok should be true");
  assert(payload.summary?.status === "ok", `JSON summary.status should be ok: ${result.stdout}`);
  assert(payload.video?.observation?.frameCount >= 2, "JSON should include video frames");
  assert(typeof payload.boardSummary === "string" && payload.boardSummary.length > 0, "JSON boardSummary missing");
  assertIncludes(payload.boardSummary, "Windows media: ok", "JSON boardSummary");
  assertIncludes(payload.boardSummary, "video=", "JSON boardSummary");
  assertIncludes(payload.boardSummary, "audio=skipped", "JSON boardSummary");
  assertIncludes(payload.boardSummary, "No passwords in summary", "JSON boardSummary");
  assertNoSecretLeak(payload.boardSummary, "JSON boardSummary");
}

async function verifyOneLineBoardSummary(args) {
  const port = await getFreePort();
  const result = await runMedia([...mockAudioArgs(port), "--boardSummary"], args);
  assert(!result.timedOut, "boardSummary audio run timed out");
  assert(result.exitCode === 0, `boardSummary audio run failed: ${result.stderr || result.stdout}`);
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert(lines.length === 1, `boardSummary should print one line, got ${lines.length}: ${result.stdout}`);
  assertIncludes(lines[0], "Windows media: ok", "boardSummary");
  assertIncludes(lines[0], "video=skipped", "boardSummary");
  assertIncludes(lines[0], "audio=", "boardSummary");
  assertIncludes(lines[0], "resource=off", "boardSummary");
  assertIncludes(lines[0], "no input/inject", "boardSummary");
  assertNoSecretLeak(lines[0], "boardSummary line");
  assertNoSecretLeak(result.stderr, "boardSummary stderr");
}

async function verifyFailureBoardSummary(args) {
  const port = await getFreePort();
  const result = await runMedia([...failingMockVideoArgs(port), "--boardSummary"], args);
  assert(!result.timedOut, "failure boardSummary video run timed out");
  assert(result.exitCode !== 0, "failure boardSummary should exit non-zero");
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert(lines.length === 1, `failure boardSummary should print one line, got ${lines.length}: ${result.stdout}`);
  assertIncludes(lines[0], "Windows media: failed", "failure boardSummary");
  assertIncludes(lines[0], "error=video observation failed", "failure boardSummary");
  assertIncludes(lines[0], "video=failed", "failure boardSummary");
  assertIncludes(lines[0], "audio=skipped", "failure boardSummary");
  assertIncludes(lines[0], "No passwords in summary", "failure boardSummary");
  assertIncludes(lines[0], "no input/inject", "failure boardSummary");
  assertNoSecretLeak(lines[0], "failure boardSummary line");
  assertNoSecretLeak(result.stderr, "failure boardSummary stderr");
}

async function verifyFailureJsonSummary(args) {
  const port = await getFreePort();
  const result = await runMedia([...failingMockVideoArgs(port), "--json"], args);
  assert(!result.timedOut, "failure JSON video run timed out");
  assert(result.exitCode !== 0, "failure JSON should exit non-zero");
  assertNoSecretLeak(result.stdout, "failure JSON stdout");
  assertNoSecretLeak(result.stderr, "failure JSON stderr");
  const payload = parseJson(result.stdout, "failure media JSON");
  assert(payload.ok === false, "failure JSON ok should be false");
  assert(payload.summary?.status === "failed", `failure JSON summary.status should be failed: ${result.stdout}`);
  assert(payload.error?.summary === "video observation failed", "failure JSON summary mismatch");
  assert(typeof payload.error?.message === "string" && payload.error.message.length > 0, "failure JSON should include sanitized error message");
  assert(typeof payload.boardSummary === "string" && payload.boardSummary.length > 0, "failure JSON boardSummary missing");
  assertIncludes(payload.boardSummary, "Windows media: failed", "failure JSON boardSummary");
  assertIncludes(payload.boardSummary, "error=video observation failed", "failure JSON boardSummary");
  assertIncludes(payload.boardSummary, "No passwords in summary", "failure JSON boardSummary");
  assertNoSecretLeak(payload.boardSummary, "failure JSON boardSummary");
}

async function verifyPartialFailureContinues(args) {
  const port = await getFreePort();
  const result = await runMedia([...failingVideoPassingAudioArgs(port), "--json"], args);
  assert(!result.timedOut, "partial failure JSON run timed out");
  assert(result.exitCode !== 0, "partial failure JSON should exit non-zero");
  assertNoSecretLeak(result.stdout, "partial failure JSON stdout");
  assertNoSecretLeak(result.stderr, "partial failure JSON stderr");
  const payload = parseJson(result.stdout, "partial failure media JSON");
  assert(payload.ok === false, "partial failure JSON ok should be false");
  assert(payload.summary?.status === "partial", `partial failure JSON summary.status should be partial: ${result.stdout}`);
  assert(payload.summary?.passed === 1, `partial failure should keep one passed probe: ${result.stdout}`);
  assert(payload.summary?.failed === 1, `partial failure should record one failed probe: ${result.stdout}`);
  assert(payload.summary?.failures?.[0]?.id === "video", "partial failure should identify video failure");
  assert(payload.video === null, "partial failure should not include failed video payload");
  assert(payload.audio?.observation?.frameCount >= 2, "partial failure should continue and keep audio frames");
  assertIncludes(payload.boardSummary, "Windows media: partial", "partial failure boardSummary");
  assertIncludes(payload.boardSummary, "video=failed", "partial failure boardSummary");
  assertIncludes(payload.boardSummary, "audio=", "partial failure boardSummary");
  assertNoSecretLeak(payload.boardSummary, "partial failure boardSummary");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printUsage();
    return;
  }

  await verifyHelp(args);
  await verifyJsonSummary(args);
  await verifyOneLineBoardSummary(args);
  await verifyFailureBoardSummary(args);
  await verifyFailureJsonSummary(args);
  await verifyPartialFailureContinues(args);
  console.log("[OK] Windows host media board summary checks passed");
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`);
  process.exit(1);
});
