import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMockMacHostServer } from "../../apps/mock-mac-host/server.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const runnerScript = resolve(scriptDir, "check-mac-formal-e2e.mjs");

const defaults = {
  timeoutMs: 30000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-mac-formal-e2e-preflight.mjs [options]

Options:
  --timeoutMs <ms>       Per command timeout. Default: ${defaults.timeoutMs}
  --help, -h             Show this help.

Description:
  Verifies the Windows formal Mac E2E runner's no-password preflight behavior,
  JSON output, password safety guard, and local mock fast path. It never connects
  to a real Mac host and never sends inject.

Examples:
  node scripts/windows/test-mac-formal-e2e-preflight.mjs
`);
}

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Number(next) || defaults.timeoutMs;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(text, expected, label) {
  assert(text.includes(expected), `${label} missing: ${expected}\n${text}`);
}

function assertNotIncludes(text, unexpected, label) {
  assert(!text.includes(unexpected), `${label} leaked unexpected text: ${unexpected}\n${text}`);
}

function runRunner(args, { env = {}, timeoutMs = defaults.timeoutMs } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [runnerScript, ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: "",
        ...env,
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

async function withMockHost(fn) {
  const service = createMockMacHostServer({
    host: "127.0.0.1",
    port: 0,
    password: "test-password",
  });
  await service.listen();
  const address = service.server.address();
  try {
    return await fn(Number(address.port));
  } finally {
    await service.close().catch(() => {});
  }
}

async function testOfflinePreflight(args) {
  const result = await runRunner(["--host", "127.0.0.1", "--port", "9", "--preflightOnly"], args);
  assert(result.exitCode !== 0, "offline preflight should fail");
  assertIncludes(result.stdout, "Mac host discovery offline", "offline text preflight");
  assertNotIncludes(result.stdout + result.stderr, "Mac host password", "offline text preflight");
  print("OK", "Offline text preflight fails before password");
}

async function testOfflineJson(args) {
  const result = await runRunner(["--host", "127.0.0.1", "--port", "9", "--preflightOnly", "--json"], args);
  assert(result.exitCode !== 0, "offline JSON preflight should fail");
  const payload = JSON.parse(result.stdout);
  assert(payload.ok === false && payload.online === false, "offline JSON preflight shape mismatch");
  assert(payload.command.includes("--promptPassword"), "offline JSON should include safe command");
  assert(String(payload.boardSummary || "").includes("offline"), "offline JSON should include board summary");
  print("OK", "Offline JSON preflight is parseable");
}

async function testOfflineBoardSummary(args) {
  const result = await runRunner(["--host", "127.0.0.1", "--port", "9", "--preflightOnly", "--boardSummary"], args);
  assert(result.exitCode !== 0, "offline board summary preflight should fail");
  assertIncludes(result.stdout, "Windows formal Mac E2E preflight: offline", "offline board summary");
  assertIncludes(result.stdout, "Password was not requested", "offline board summary");
  assertIncludes(result.stdout, "--promptPassword", "offline board summary");
  assertNotIncludes(result.stdout + result.stderr, "Mac host password", "offline board summary");
  print("OK", "Offline board summary is secret-free");
}

async function testJsonRequiresPreflight(args) {
  const result = await runRunner(["--json", "--host", "127.0.0.1", "--port", "9"], args);
  assert(result.exitCode !== 0, "--json without --preflightOnly should fail");
  assertIncludes(result.stderr, "--json is only supported with --preflightOnly", "json guard");
  print("OK", "JSON guard prevents mixed child-process logs");
}

async function testMockPreflightJson(args) {
  await withMockHost(async (port) => {
    const result = await runRunner([
      "--host", "127.0.0.1",
      "--port", String(port),
      "--preflightOnly",
      "--json",
      "--allowMockVideo",
      "--skipInputLog",
      "--skipAudio",
      "--skipClipboard",
    ], args);
    assert(result.exitCode === 0, `mock preflight JSON failed\n${result.stdout}\n${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert(payload.ok === true && payload.online === true, "mock preflight JSON shape mismatch");
    assert(payload.capabilities.mock === true, "mock preflight should identify mock host");
    assert(payload.command.includes("--promptPassword"), "mock preflight should include safe command");
    assert(String(payload.boardSummary || "").includes("failedChecks=none"), "mock preflight JSON should include board summary");
    print("OK", "Mock JSON preflight passes");
  });
}

async function testMockPreflightBoardSummary(args) {
  await withMockHost(async (port) => {
    const result = await runRunner([
      "--host", "127.0.0.1",
      "--port", String(port),
      "--preflightOnly",
      "--boardSummary",
      "--allowMockVideo",
      "--skipInputLog",
      "--skipAudio",
      "--skipClipboard",
    ], args);
    assert(result.exitCode === 0, `mock preflight board summary failed\n${result.stdout}\n${result.stderr}`);
    assertIncludes(result.stdout, "Windows formal Mac E2E preflight: ready", "mock board summary");
    assertIncludes(result.stdout, "failedChecks=none", "mock board summary");
    assertIncludes(result.stdout, "Password is not included", "mock board summary");
    assertNotIncludes(result.stdout + result.stderr, "test-password", "mock board summary");
    print("OK", "Mock board summary passes without leaking password");
  });
}

async function testMockRequiresPasswordAfterPreflight(args) {
  await withMockHost(async (port) => {
    const result = await runRunner([
      "--host", "127.0.0.1",
      "--port", String(port),
      "--allowMockVideo",
      "--skipInputLog",
      "--skipAudio",
      "--skipClipboard",
      "--skipBrowser",
    ], args);
    assert(result.exitCode !== 0, "mock runner without password should fail after preflight");
    assertIncludes(result.stderr, "Refusing to use demo-password", "password guard");
    print("OK", "Password guard runs after successful preflight");
  });
}

async function testMockFastPath(args) {
  await withMockHost(async (port) => {
    const result = await runRunner([
      "--host", "127.0.0.1",
      "--port", String(port),
      "--allowMockVideo",
      "--videoDurationMs", "800",
      "--minVideoFrames", "2",
      "--skipInputLog",
      "--skipAudio",
      "--skipBrowser",
      "--boardSummary",
    ], {
      ...args,
      env: { LAN_DUAL_PASSWORD: "test-password" },
    });
    assert(result.exitCode === 0, `mock fast path failed\n${result.stdout}\n${result.stderr}`);
    assertIncludes(result.stdout, "Formal Mac E2E checks finished", "mock fast path");
    assertIncludes(result.stdout, "Windows formal Mac E2E finished: completed", "mock fast path");
    assertIncludes(result.stdout, "Clipboard file accepted", "mock fast path");
    assertNotIncludes(result.stdout + result.stderr, "test-password", "mock fast path");
    print("OK", "Mock fast path passes without leaking password");
  });
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }

  const args = parseArgs(process.argv);
  await testOfflinePreflight(args);
  await testOfflineJson(args);
  await testOfflineBoardSummary(args);
  await testJsonRequiresPreflight(args);
  await testMockPreflightJson(args);
  await testMockPreflightBoardSummary(args);
  await testMockRequiresPasswordAfterPreflight(args);
  await testMockFastPath(args);
  print("OK", "Windows formal E2E preflight regression passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
