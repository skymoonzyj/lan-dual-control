#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const defaultAppDir = resolve(repoRoot, "apps/windows-desktop");
const defaultExePath = resolve(
  defaultAppDir,
  "src-tauri/target/release/lan-dual-control-windows.exe",
);
const defaultTimeoutMs = 120000;
const w8DesktopVideoPostCommand = "node scripts/windows/post-w8-desktop-video-board.mjs --stdin --send --boardSummary";
const nativeVideoPostCommand = w8DesktopVideoPostCommand;

function printHelp() {
  console.log(`Usage:
  node scripts/windows/start-windows-desktop-control-mac.mjs [options]

Options:
  --exePath <path>       Desktop release exe path. Default: apps/windows-desktop/src-tauri/target/release/lan-dual-control-windows.exe
  --appDir <path>        Windows desktop app directory. Default: apps/windows-desktop
  --build                Build the Windows desktop release exe with npm.cmd run build before opening.
  --noOpen               Do not open the desktop app after status/build checks.
  --dryRun               Print the W10 plan without building or opening the desktop app.
  --json                 Print one machine-readable JSON object.
  --boardSummary         Print one secret-free Agent Link Board summary line.
  --timeoutMs <ms>       Build timeout when --build is used. Default: ${defaultTimeoutMs}
  --help, -h             Show this help without building or opening the desktop app.

W10 purpose:
  Use the Tauri Windows desktop control app as the main Mac control entry.
  The old Web/browser path stays diagnostic-only for W8/W10 validation.
`);
}

function clampTimeoutMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return defaultTimeoutMs;
  return Math.max(10000, Math.min(30 * 60 * 1000, Math.trunc(number)));
}

function parseArgs(argv) {
  const args = {
    exePath: defaultExePath,
    appDir: defaultAppDir,
    build: false,
    openApp: true,
    dryRun: false,
    json: false,
    boardSummary: false,
    timeoutMs: defaultTimeoutMs,
    help: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--build") {
      args.build = true;
      continue;
    }
    if (token === "--noOpen") {
      args.openApp = false;
      continue;
    }
    if (token === "--dryRun") {
      args.dryRun = true;
      args.openApp = false;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--boardSummary") {
      args.boardSummary = true;
      continue;
    }
    if (token === "--exePath" && next && !next.startsWith("--")) {
      args.exePath = resolve(repoRoot, next);
      index += 1;
      continue;
    }
    if (token === "--appDir" && next && !next.startsWith("--")) {
      args.appDir = resolve(repoRoot, next);
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampTimeoutMs(next);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function slashPath(path) {
  return relative(repoRoot, path).replaceAll("/", "\\");
}

function makeBuildCommand(args) {
  return `cd ${slashPath(args.appDir)} && npm.cmd run build`;
}

function makeReport(args, extra = {}) {
  const exeExists = existsSync(args.exePath);
  const status = exeExists ? "ready" : "needs-build";
  const report = {
    entryKind: "windows-desktop",
    status,
    exeExists,
    exePath: args.exePath,
    exeRelativePath: slashPath(args.exePath),
    appDir: args.appDir,
    appRelativeDir: slashPath(args.appDir),
    startCommand: "Start-Windows-Desktop-Control-Mac.cmd",
    buildCommand: makeBuildCommand(args),
    buildRequested: Boolean(args.build),
    buildAction: "npm-build-windows-desktop",
    openApp: Boolean(args.openApp && !args.dryRun && status === "ready"),
    dryRun: Boolean(args.dryRun),
    longRun: "desktop-connect-copy-diagnostics",
    w8DesktopVideoPostCommand,
    nativeVideoPostCommand,
    webGate: "diagnostic-only",
    safety: {
      requestPassword: false,
      authenticate: false,
      inputInject: false,
    },
    ...extra,
  };
  report.boardSummary = makeBoardSummary(report);
  return report;
}

function makeBoardSummary(report) {
  return [
    `WindowsDesktopEntry=status=${report.status}`,
    "USABLE_NEXT=open_windows_desktop",
    `Start=${report.startCommand}`,
    `Exe=${report.exeRelativePath}`,
    `BuildAction=${report.buildAction}`,
    `Build=${report.buildCommand}`,
    `LongRun=${report.longRun}`,
    `W8Post=${report.w8DesktopVideoPostCommand}`,
    `NativeVideoPost=${report.nativeVideoPostCommand}`,
    `WebGate=${report.webGate}`,
    "Safety=no-password,no-auth,no-input-inject",
  ].join(" ");
}

function printReport(report, args) {
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (args.boardSummary) {
    console.log(report.boardSummary);
    return;
  }
  console.log(`Windows desktop entry: ${report.status}`);
  console.log(`Exe: ${report.exeRelativePath}`);
  console.log(`Start: ${report.startCommand}`);
  console.log(`Build: ${report.buildCommand}`);
  console.log("Long run: open the desktop app, connect to the Mac host, then copy diagnostics for W8NativeVideo/W14NativeVideo.");
  console.log(`Post native video diagnostics: ${report.nativeVideoPostCommand}`);
  console.log(`Post W8 diagnostics: ${report.w8DesktopVideoPostCommand}`);
}

function writeBuildOutputToStderr(result) {
  const stdout = result.stdout ? String(result.stdout) : "";
  const stderr = result.stderr ? String(result.stderr) : "";
  if (stdout) process.stderr.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

function runBuild(args) {
  const keepStdoutMachineReadable = Boolean(args.json || args.boardSummary);
  const shell = process.env.ComSpec || "cmd.exe";
  const result = spawnSync(shell, ["/d", "/c", "npm.cmd", "run", "build"], {
    cwd: args.appDir,
    stdio: keepStdoutMachineReadable ? ["ignore", "pipe", "pipe"] : "inherit",
    windowsHide: false,
    timeout: args.timeoutMs,
  });
  if (keepStdoutMachineReadable) {
    writeBuildOutputToStderr(result);
  }
  if (result.error) {
    throw new Error(`Desktop build failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Desktop build exited ${result.status ?? "unknown"}`);
  }
}

function openDesktopApp(args) {
  const child = spawn(args.exePath, [], {
    cwd: repoRoot,
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  if (args.dryRun) {
    printReport(makeReport(args), args);
    return;
  }

  if (args.build) {
    runBuild(args);
  }

  const report = makeReport(args);
  if (report.status !== "ready") {
    printReport(report, args);
    process.exitCode = args.boardSummary || args.json ? 0 : 1;
    return;
  }

  if (args.openApp) {
    openDesktopApp(args);
  }
  printReport({ ...report, openApp: Boolean(args.openApp) }, args);
}

try {
  main();
} catch (error) {
  console.error(`[ERROR] ${error.message}`);
  process.exitCode = 1;
}
