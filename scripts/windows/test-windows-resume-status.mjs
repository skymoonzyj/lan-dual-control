import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createMockMacHostServer } from "../../apps/mock-mac-host/server.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const script = "scripts/windows/check-windows-resume-status.mjs";

const defaults = {
  timeoutMs: 30000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-resume-status.mjs [options]

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Description:
  Verifies the Windows resume-status script with a local mock Mac host. It is
  secret-safe: it does not authenticate a real Mac, does not request passwords,
  and does not execute inject.
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
      args.timeoutMs = Math.max(10000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(text, expected, label) {
  assert(String(text).includes(expected), `${label} did not include ${JSON.stringify(expected)}.\n${text}`);
}

function assertNotIncludes(text, expected, label) {
  assert(!String(text).includes(expected), `${label} unexpectedly included ${JSON.stringify(expected)}.\n${text}`);
}

function run(extraArgs, args) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [script, ...extraArgs], {
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
    }, args.timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({
        exitCode: null,
        timedOut: false,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({ exitCode, timedOut: false, stdout, stderr });
    });
  });
}

async function withMockHost(callback) {
  const service = createMockMacHostServer({
    host: "127.0.0.1",
    port: 0,
    password: "test-password",
  });
  await service.listen();
  const address = service.server.address();
  try {
    await callback(Number(address.port));
  } finally {
    await service.close().catch(() => {});
  }
}

async function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = await run([flag], args);
    assert(result.exitCode === 0, `help ${flag} failed\n${result.stdout}\n${result.stderr}`);
    assertIncludes(result.stdout, "Usage:", `help ${flag}`);
    assertIncludes(result.stdout, "--boardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "--checkBoard", `help ${flag}`);
  }
  console.log("[OK] Windows resume status help is pure");
}

async function checkMockJson(args) {
  await withMockHost(async (port) => {
    const result = await run([
      "--discover",
      "--discoverNoLocalSubnets",
      "--host", "127.0.0.1",
      "--port", String(port),
      "--json",
      "--allowMockVideo",
      "--skipAudio",
      "--skipClipboard",
      "--skipInputLog",
    ], args);
    assert(result.exitCode === 0, `mock JSON resume failed\n${result.stdout}\n${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert(payload.ok === true, "mock JSON should be ok");
    assert(payload.git && typeof payload.git.clean === "boolean", "mock JSON should include git state");
    assert(payload.macPreflight?.payload?.online === true, "mock JSON should include online preflight");
    assert(payload.macPreflight?.payload?.target?.port === port, "mock JSON should use discovered mock port");
    assert(payload.macPreflight?.payload?.discoverySelection?.requested === true, "preflight should record discovery");
    assert(String(payload.boardSummary || "").includes("Windows resume:"), "mock JSON should include board summary");
    assert(String(payload.userAuthRequest || "").includes("NEED_USER_AUTH"), "mock JSON should include user auth request");
    assert(String(payload.userAuthRequest || "").includes("正式 Mac 端到端验收需要你在 Windows 本机隐藏输入"), "mock JSON should include formal auth wording");
    assert(String(payload.userAuthRequest || "").includes("powershell.exe"), "mock JSON user auth request should prefer PowerShell");
    assert(String(payload.userAuthRequest || "").includes("-PromptPassword"), "mock JSON user auth request should prompt for password");
    assert(String(payload.commands?.formalRun || "").includes("-PromptPassword"), "mock JSON should include formal command");
    assertNotIncludes(result.stdout + result.stderr, "test-password", "mock JSON");
    console.log("[OK] Windows resume status JSON summarizes mock Mac preflight");
  });
}

async function checkBoardSummary(args) {
  await withMockHost(async (port) => {
    const result = await run([
      "--discover",
      "--discoverNoLocalSubnets",
      "--host", "127.0.0.1",
      "--port", String(port),
      "--boardSummary",
      "--allowMockVideo",
      "--skipAudio",
      "--skipClipboard",
      "--skipInputLog",
    ], args);
    assert(result.exitCode === 0, `mock board summary failed\n${result.stdout}\n${result.stderr}`);
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    assert(lines.length === 1, `board summary should be one line, got ${lines.length}`);
    assertIncludes(result.stdout, "Windows resume:", "board summary");
    assertIncludes(result.stdout, "No password was requested or sent", "board summary");
    assertIncludes(result.stdout, "mac=ready", "board summary");
    assertNotIncludes(result.stdout + result.stderr, "test-password", "board summary");
    console.log("[OK] Windows resume status board summary is one-line and secret-free");
  });
}

async function checkUserAuthRequest(args) {
  await withMockHost(async (port) => {
    const result = await run([
      "--discover",
      "--discoverNoLocalSubnets",
      "--host", "127.0.0.1",
      "--port", String(port),
      "--userAuthRequest",
      "--allowMockVideo",
      "--skipAudio",
      "--skipClipboard",
      "--skipInputLog",
    ], args);
    assert(result.exitCode === 0, `mock userAuthRequest failed\n${result.stdout}\n${result.stderr}`);
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    assert(lines.length === 1, `userAuthRequest should be one line, got ${lines.length}`);
    assertIncludes(result.stdout, "NEED_USER_AUTH", "userAuthRequest");
    assertIncludes(result.stdout, "Windows 本机隐藏输入 Mac host 正式密码", "userAuthRequest");
    assertIncludes(result.stdout, "powershell.exe", "userAuthRequest");
    assertIncludes(result.stdout, "-PromptPassword", "userAuthRequest");
    assertIncludes(result.stdout, "inject 仍需", "userAuthRequest");
    assertIncludes(result.stdout, "另行明确确认", "userAuthRequest");
    assertNotIncludes(result.stdout + result.stderr, "test-password", "userAuthRequest");
    console.log("[OK] Windows resume status can print a secret-free user auth request");
  });
}

async function checkOfflineJson(args) {
  const result = await run([
    "--noDiscover",
    "--host", "127.0.0.1",
    "--port", "9",
    "--json",
  ], args);
  assert(result.exitCode === 0, `offline JSON should stay non-failing without --requireMacReady\n${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert(payload.ok === true, "offline JSON should be ok=true without --requireMacReady");
  assert(payload.macPreflight?.payload?.online === false, "offline JSON should report Mac offline");
  assertIncludes(payload.boardSummary, "mac=offline", "offline JSON board summary");
  assertNotIncludes(result.stdout + result.stderr, "Mac host password", "offline JSON");
  console.log("[OK] Windows resume status offline path is a non-failing warning by default");
}

async function checkRequireMacReady(args) {
  const result = await run([
    "--noDiscover",
    "--host", "127.0.0.1",
    "--port", "9",
    "--json",
    "--requireMacReady",
  ], args);
  assert(result.exitCode !== 0, "requireMacReady offline path should fail");
  const payload = JSON.parse(result.stdout);
  assert(payload.ok === false, "requireMacReady offline payload should be ok=false");
  assert(payload.failedChecks?.some((check) => check.name === "requireMacReady"), "requireMacReady failure should be named");
  assertIncludes(payload.boardSummary, "mac=offline", "requireMacReady board summary");
  assertNotIncludes(result.stdout + result.stderr, "Mac host password", "requireMacReady JSON");
  console.log("[OK] Windows resume status --requireMacReady turns offline Mac into a failure");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  await checkHelp(args);
  await checkMockJson(args);
  await checkBoardSummary(args);
  await checkUserAuthRequest(args);
  await checkOfflineJson(args);
  await checkRequireMacReady(args);
  console.log("[OK] Windows resume status regression passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
