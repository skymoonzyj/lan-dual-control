#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const entryScript = "scripts/windows/start-windows-desktop-control-mac.mjs";
const rootStartCmd = "Start-Windows-Desktop-Control-Mac.cmd";
const rootBuildCmd = "Build-Windows-Desktop-Control-Mac.cmd";
const defaultTimeoutMs = 12000;

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-desktop-control-mac-entry.mjs [options]

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaultTimeoutMs}
  --help, -h        Show this help without running checks
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

function run(extraArgs, args, envOverrides = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [entryScript, ...extraArgs], {
      cwd: repoRoot,
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: "",
        ...envOverrides,
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

function runCmd(command, extraArgs, args) {
  return new Promise((resolveRun) => {
    const shell = process.env.ComSpec || "cmd.exe";
    const child = spawn(shell, ["/d", "/c", command, ...extraArgs], {
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

async function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = await run([flag], args);
    assert(result.exitCode === 0, `${flag} should exit 0. stderr=${result.stderr}`);
    assertIncludes(result.stdout, "Usage:", `${flag} help`);
    assertIncludes(result.stdout, "--build", `${flag} help`);
    assertIncludes(result.stdout, "--exePath", `${flag} help`);
    assertIncludes(result.stdout, "--boardSummary", `${flag} help`);
    assertIncludes(result.stdout, "W10", `${flag} help`);
    assertNotIncludes(result.stdout, "password", `${flag} help`);
    assertNotIncludes(result.stdout, "token", `${flag} help`);
  }
  console.log("[OK] W10 desktop entry help is pure");
}

async function checkDryRunJsonReady(args) {
  const result = await run(["--dryRun", "--json"], args);
  assert(result.exitCode === 0, `dryRun JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
  const payload = parseJson(result.stdout, "dryRun JSON");
  assert(payload.status === "ready", `status should be ready when release exe exists, got ${payload.status}`);
  assert(payload.entryKind === "windows-desktop", `entryKind should be windows-desktop, got ${payload.entryKind}`);
  assert(payload.openApp === false, "dryRun should not open the desktop app");
  assert(String(payload.exePath || "").endsWith("lan-dual-control-windows.exe"), "exePath should point at the release exe");
  assertIncludes(payload.startCommand, rootStartCmd, "dryRun JSON startCommand");
  assertIncludes(payload.buildCommand, "npm.cmd run build", "dryRun JSON buildCommand");
  assertIncludes(payload.boardSummary, "WindowsDesktopEntry=status=ready", "dryRun JSON boardSummary");
  assertIncludes(payload.boardSummary, "USABLE_NEXT=open_windows_desktop", "dryRun JSON boardSummary");
  assertIncludes(payload.boardSummary, "WebGate=diagnostic-only", "dryRun JSON boardSummary");
  assertIncludes(payload.boardSummary, "Safety=no-password,no-auth,no-input-inject", "dryRun JSON boardSummary");
  const combined = JSON.stringify(payload);
  assertNotIncludes(combined, "demo-password", "dryRun JSON");
  assertNotIncludes(combined, "secret", "dryRun JSON");
  assertNotIncludes(combined, "token", "dryRun JSON");
  console.log("[OK] W10 desktop entry dry-run JSON points at the release exe safely");
}

async function checkMissingExeDryRunJson(args) {
  const missingExe = resolve(repoRoot, ".dev-lab/missing/lan-dual-control-windows.exe");
  const result = await run(["--dryRun", "--json", "--exePath", missingExe], args);
  assert(result.exitCode === 0, `missing exe dryRun JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
  const payload = parseJson(result.stdout, "missing exe dryRun JSON");
  assert(payload.status === "needs-build", `missing exe status should be needs-build, got ${payload.status}`);
  assert(payload.openApp === false, "missing exe dryRun should not open the desktop app");
  assertIncludes(payload.boardSummary, "WindowsDesktopEntry=status=needs-build", "missing exe boardSummary");
  assertIncludes(payload.boardSummary, "BuildAction=npm-build-windows-desktop", "missing exe boardSummary");
  assertIncludes(payload.buildCommand, "npm.cmd run build", "missing exe buildCommand");
  console.log("[OK] W10 desktop entry reports a safe build action when the exe is missing");
}

async function checkBoardSummary(args) {
  const result = await run(["--dryRun", "--boardSummary"], args);
  assert(result.exitCode === 0, `boardSummary should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
  assertIncludes(result.stdout, "WindowsDesktopEntry=status=ready", "boardSummary");
  assertIncludes(result.stdout, "USABLE_NEXT=open_windows_desktop", "boardSummary");
  assertIncludes(result.stdout, "Start=Start-Windows-Desktop-Control-Mac.cmd", "boardSummary");
  assertIncludes(result.stdout, "LongRun=desktop-connect-copy-diagnostics", "boardSummary");
  assertIncludes(result.stdout, "WebGate=diagnostic-only", "boardSummary");
  assertNotIncludes(result.stdout, "demo-password", "boardSummary");
  assertNotIncludes(result.stdout, "password=", "boardSummary");
  console.log("[OK] W10 desktop entry prints a secret-free board summary");
}

async function checkBuildJsonKeepsStdoutMachineReadable(args) {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "lan-dual-w10-entry-"));
  const fakeBin = resolve(tempRoot, "bin");
  const fakeApp = resolve(tempRoot, "app");
  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(fakeApp, { recursive: true });
  const fakeNpm = resolve(fakeBin, "npm.cmd");
  writeFileSync(
    fakeNpm,
    "@echo off\r\necho fake build stdout\r\necho fake build stderr 1>&2\r\nexit /b 0\r\n",
  );
  const existingExe = resolve(repoRoot, "apps/windows-desktop/src-tauri/target/release/lan-dual-control-windows.exe");
  const pathValue = process.env.Path || process.env.PATH || "";
  const result = await run(
    ["--build", "--noOpen", "--json", "--appDir", fakeApp, "--exePath", existingExe],
    args,
    {
      Path: `${fakeBin};${pathValue}`,
      PATH: `${fakeBin};${pathValue}`,
    },
  );
  assert(result.exitCode === 0, `build JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
  const payload = parseJson(result.stdout, "build JSON");
  assert(payload.status === "ready", `build JSON status should be ready, got ${payload.status}`);
  assert(payload.buildRequested === true, "build JSON should record buildRequested=true");
  assert(payload.openApp === false, "build JSON --noOpen should not open the desktop app");
  assertNotIncludes(result.stdout, "fake build stdout", "build JSON stdout");
  assertIncludes(result.stderr, "fake build stdout", "build JSON stderr");
  assertIncludes(result.stderr, "fake build stderr", "build JSON stderr");
  console.log("[OK] W10 desktop entry keeps --build --json stdout machine-readable");
}

async function checkRootCmdLaunchers(args) {
  for (const command of [rootStartCmd, rootBuildCmd]) {
    const path = resolve(repoRoot, command);
    assert(existsSync(path), `${command} should exist in the repository root`);
    const content = readFileSync(path, "utf8");
    assertIncludes(content, "scripts\\windows\\start-windows-desktop-control-mac.mjs", `${command} content`);
    assertIncludes(content, "%*", `${command} should forward extra args`);
    assertNotIncludes(content, "--password", `${command}`);
    assertNotIncludes(content, "secret", `${command}`);
    assertNotIncludes(content, "token", `${command}`);
  }

  if (process.platform !== "win32") {
    console.log("[OK] W10 desktop root cmd launchers are present and safe; execution skipped on non-Windows");
    return;
  }

  const startResult = await runCmd(rootStartCmd, ["--dryRun", "--boardSummary"], args);
  assert(startResult.exitCode === 0, `${rootStartCmd} dryRun should exit 0. stdout=${startResult.stdout} stderr=${startResult.stderr}`);
  assertIncludes(startResult.stdout, "WindowsDesktopEntry=status=ready", `${rootStartCmd} boardSummary`);
  assertIncludes(startResult.stdout, "USABLE_NEXT=open_windows_desktop", `${rootStartCmd} boardSummary`);

  const buildResult = await runCmd(rootBuildCmd, ["--dryRun", "--boardSummary"], args);
  assert(buildResult.exitCode === 0, `${rootBuildCmd} dryRun should exit 0. stdout=${buildResult.stdout} stderr=${buildResult.stderr}`);
  assertIncludes(buildResult.stdout, "WindowsDesktopEntry=status=ready", `${rootBuildCmd} boardSummary`);
  assertIncludes(buildResult.stdout, "BuildAction=npm-build-windows-desktop", `${rootBuildCmd} boardSummary`);
  console.log("[OK] W10 desktop root cmd launchers forward safely");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  await checkHelp(args);
  await checkDryRunJsonReady(args);
  await checkMissingExeDryRunJson(args);
  await checkBoardSummary(args);
  await checkBuildJsonKeepsStdoutMachineReadable(args);
  await checkRootCmdLaunchers(args);
  console.log("[OK] W10 Windows desktop control entry tests passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
