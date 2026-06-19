#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const require = createRequire(import.meta.url);
const entryScript = "scripts/windows/start-windows-control-mac.mjs";
const defaultTimeoutMs = 12000;

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-control-mac-entry.mjs [options]

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaultTimeoutMs}
  --help, -h        Show this help without running checks

Description:
  Verifies the shortest Windows usable entry for controlling the Mac host.
  It is secret-safe: it does not request passwords, authenticate, open browsers,
  or send input/inject events.
`);
}

function parseArgs(argv) {
  const args = { timeoutMs: defaultTimeoutMs, help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(3000, Number(next) || defaultTimeoutMs);
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
    const child = spawn(process.execPath, [entryScript, ...extraArgs], {
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
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
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

function runCmd(extraArgs, args) {
  return new Promise((resolveRun) => {
    const shell = process.env.ComSpec || "cmd.exe";
    const child = spawn(shell, ["/d", "/c", "Start-Windows-Control-Mac.cmd", ...extraArgs], {
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
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
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
function parseJson(stdout, label) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

function checkIndexLoadsLaunchParams() {
  const indexHtml = require("node:fs").readFileSync(resolve(repoRoot, "apps/windows-client/index.html"), "utf8");
  const helperIndex = indexHtml.indexOf("./launch-params.js");
  const appIndex = indexHtml.indexOf("./app.js");
  assert(helperIndex >= 0, "index.html should load launch-params.js");
  assert(appIndex >= 0, "index.html should load app.js");
  assert(helperIndex < appIndex, "launch-params.js should load before app.js");
  console.log("[OK] Windows client page loads launch params before app.js");
}
function checkLaunchParamHelper() {
  const helper = require(resolve(repoRoot, "apps/windows-client/launch-params.js"));
  assert(typeof helper.parseLaunchParams === "function", "helper should export parseLaunchParams");
  assert(typeof helper.applyLaunchParams === "function", "helper should export applyLaunchParams");

  const elements = {
    transportSelect: { value: "local" },
    hostInput: { value: "127.0.0.1" },
    portInput: { value: "43770" },
    passwordInput: { value: "demo-password" },
    mockScenarioSelect: { value: "normal" },
  };
  const logs = [];
  const result = helper.applyLaunchParams({
    search: "?host=192.168.31.122&port=43770&transport=websocket&clearDemoPassword=1&focusPassword=1",
    elements,
    log: (title, detail) => logs.push(`${title}: ${detail}`),
  });

  assert(result.applied === true, "launch params should be applied");
  assert(elements.transportSelect.value === "websocket", "transport should switch to WebSocket");
  assert(elements.hostInput.value === "192.168.31.122", `host should be prefilled, got ${elements.hostInput.value}`);
  assert(elements.portInput.value === "43770", `port should be prefilled, got ${elements.portInput.value}`);
  assert(elements.passwordInput.value === "", "demo password should be cleared for real Mac entry");
  assert(result.focusPassword === true, "helper should request password focus hint");
  assertIncludes(logs.join("\n"), "192.168.31.122:43770", "launch helper log");
  assertNotIncludes(JSON.stringify(result), "demo-password", "launch helper result");
  console.log("[OK] Windows client launch params prefill the Mac target safely");
}

async function checkCmdLauncher(args) {
  const launcherPath = resolve(repoRoot, "Start-Windows-Control-Mac.cmd");
  assert(existsSync(launcherPath), "root Start-Windows-Control-Mac.cmd launcher should exist");
  const content = readFileSync(launcherPath, "utf8");
  assertIncludes(content, "scripts\\windows\\start-windows-control-mac.mjs", "cmd launcher");
  assertIncludes(content, "%*", "cmd launcher should forward extra args");
  assertNotIncludes(content, "--password", "cmd launcher");
  assertNotIncludes(content, "demo-password", "cmd launcher");
  assertNotIncludes(content, "secret", "cmd launcher");
  assertNotIncludes(content, "token", "cmd launcher");

  if (process.platform !== "win32") {
    console.log("[OK] Windows root cmd launcher content is safe; execution skipped on non-Windows");
    return;
  }

  const result = await runCmd(["--dryRun", "--boardSummary"], args);
  assert(result.exitCode === 0, `cmd dryRun boardSummary should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
  assertIncludes(result.stdout, "WindowsUsableEntry=status=ready", "cmd boardSummary");
  assertIncludes(result.stdout, "OpenUrl=http://127.0.0.1:5200/", "cmd boardSummary");
  assertIncludes(result.stdout, "target=192.168.31.122:43770", "cmd boardSummary");
  assertNotIncludes(result.stdout, "demo-password", "cmd boardSummary");
  assertNotIncludes(result.stdout, "Mac host password:", "cmd boardSummary");
  console.log("[OK] Windows root cmd launcher forwards to the usable entry safely");
}
async function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = await run([flag], args);
    assert(result.exitCode === 0, `${flag} should exit 0. stderr=${result.stderr}`);
    assertIncludes(result.stdout, "Usage:", `${flag} help`);
    assertIncludes(result.stdout, "--host", `${flag} help`);
    assertIncludes(result.stdout, "--clientPort", `${flag} help`);
    assertIncludes(result.stdout, "--debugPort", `${flag} help`);
    assertNotIncludes(result.stdout, "Mac host password:", `${flag} help`);
  }
  console.log("[OK] Windows control Mac entry help is pure");
}

async function checkDryRunJson(args) {
  const result = await run(["--dryRun", "--json"], args);
  assert(result.exitCode === 0, `dryRun JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
  const payload = parseJson(result.stdout, "dryRun JSON");
  assert(payload.status === "ready", `status should be ready, got ${payload.status}`);
  assert(payload.host === "192.168.31.122", `default host mismatch: ${payload.host}`);
  assert(payload.port === 43770, `default port mismatch: ${payload.port}`);
  assert(payload.clientPort === 5200, `default client port mismatch: ${payload.clientPort}`);
  assert(payload.debugPort === 9340, `default debug port mismatch: ${payload.debugPort}`);
  assert(payload.openBrowser === false, "dryRun should not open a browser");
  assertIncludes(payload.url, "http://127.0.0.1:5200/", "dryRun URL");
  assertIncludes(payload.url, "host=192.168.31.122", "dryRun URL");
  assertIncludes(payload.url, "port=43770", "dryRun URL");
  assertIncludes(payload.url, "transport=websocket", "dryRun URL");
  assertIncludes(payload.url, "clearDemoPassword=1", "dryRun URL");
  assertIncludes(payload.boardSummary, "WindowsUsableEntry=status=ready", "dryRun boardSummary");
  assertIncludes(payload.boardSummary, "USABLE_NEXT=open_windows_client", "dryRun boardSummary");
  assertIncludes(payload.boardSummary, "BLOCKER=none", "dryRun boardSummary");
  assertIncludes(payload.boardSummary, "target=192.168.31.122:43770", "dryRun boardSummary");
  assertIncludes(payload.boardSummary, "clientPort=5200", "dryRun boardSummary");
  assertIncludes(payload.boardSummary, "debugPort=9340", "dryRun boardSummary");
  assertIncludes(payload.boardSummary, "Safety=no-password,no-input-inject", "dryRun boardSummary");
  const combined = JSON.stringify(payload);
  assertNotIncludes(combined, "demo-password", "dryRun JSON");
  assertNotIncludes(combined, "test-password", "dryRun JSON");
  assertNotIncludes(combined, "secret", "dryRun JSON");
  assertNotIncludes(combined, "token", "dryRun JSON");
  console.log("[OK] Windows control Mac entry dry-run JSON uses fixed usable defaults");
}

async function checkBoardSummary(args) {
  const result = await run(["--dryRun", "--boardSummary"], args);
  assert(result.exitCode === 0, `boardSummary should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
  assertIncludes(result.stdout, "WindowsUsableEntry=status=ready", "boardSummary");
  assertIncludes(result.stdout, "OpenUrl=http://127.0.0.1:5200/", "boardSummary");
  assertIncludes(result.stdout, "USABLE_NEXT=open_windows_client", "boardSummary");
  assertIncludes(result.stdout, "BLOCKER=none", "boardSummary");
  assertNotIncludes(result.stdout, "demo-password", "boardSummary");
  assertNotIncludes(result.stdout, "Mac host password:", "boardSummary");
  console.log("[OK] Windows control Mac entry prints a secret-free board summary");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  checkIndexLoadsLaunchParams();
  checkLaunchParamHelper();
  await checkCmdLauncher(args);
  await checkHelp(args);
  await checkDryRunJson(args);
  await checkBoardSummary(args);
  console.log("[OK] Windows control Mac usable entry tests passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
