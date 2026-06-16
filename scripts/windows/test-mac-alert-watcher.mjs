#!/usr/bin/env node

import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const watcherScript = resolve(repoRoot, "scripts/windows/watch-codex-link-mac-alerts.ps1");
const startWrapperScript = resolve(repoRoot, "scripts/windows/start-mac-alert-watcher.ps1");

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-mac-alert-watcher.mjs [options]

Options:
  --timeoutMs <ms>  Per PowerShell watcher run timeout. Default: 15000
  --includeLifecycle
                    Also start a temporary background watcher and test duplicate/status/stop.
                    This is off by default because some Windows hosts keep stdio handles open
                    for detached PowerShell aliases.
  --help, -h        Show this help.

This regression uses a local fake Agent Link Board and runs the PowerShell
watcher with -Once -NoPopup, so it does not show Windows popups or send any
messages, passwords, or input events.`);
}

function parseArgs(argv) {
  const args = {
    timeoutMs: 15000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--includeLifecycle") {
      args.includeLifecycle = true;
    } else if (arg === "--timeoutMs") {
      args.timeoutMs = Number(argv[++index] || args.timeoutMs);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(text, pattern, label) {
  assert(text.includes(pattern), `${label} should include ${JSON.stringify(pattern)}\n${text}`);
}

function assertNotIncludes(text, pattern, label) {
  assert(!text.includes(pattern), `${label} should not include ${JSON.stringify(pattern)}\n${text}`);
}

async function resolvePowerShellExe() {
  if (process.env.LAN_DUAL_POWERSHELL_EXE) {
    return process.env.LAN_DUAL_POWERSHELL_EXE;
  }
  for (const candidate of ["pwsh.exe", "powershell.exe"]) {
    const result = await spawnCapture(candidate, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], {
      timeoutMs: 5000,
    }).catch(() => null);
    if (result?.exitCode === 0) {
      return candidate;
    }
  }
  return "powershell.exe";
}

function spawnCapture(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      child.kill();
      settled = true;
      rejectRun(new Error(`PowerShell watcher timed out after ${options.timeoutMs}ms\n${stdout}\n${stderr}`));
    }, options.timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (settled) return;
      clearTimeout(timeout);
      settled = true;
      rejectRun(error);
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      clearTimeout(timeout);
      settled = true;
      resolveRun({ exitCode, stdout, stderr });
    });
  });
}

function runPowerShell(exe, args, options = {}) {
  return spawnCapture(exe, args, options);
}

async function withFakeBoard(state, fn) {
  const server = createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/api/state") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "not found" }));
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(state));
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections?.();
    server.closeIdleConnections?.();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

function baseState(overrides = {}) {
  return {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events: [],
    statuses: {},
    currentCall: null,
    ...overrides,
  };
}

async function runWatcherAgainst(state, args, options) {
  return withFakeBoard(state, async (serverUrl) => {
    const result = await runPowerShell(options.powerShellExe, [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", watcherScript,
      "-Server", serverUrl,
      "-Once",
      "-NoPopup",
      "-StaleMinutes", "5",
      ...args,
    ], options);
    const output = `${result.stdout}\n${result.stderr}`;
    assert(result.exitCode === 0, `watcher should exit 0\n${output}`);
    return output;
  });
}

async function checkExistingEventsSkipped(args) {
  const output = await runWatcherAgainst(baseState({
    events: [{
      id: "old-auth",
      at: new Date().toISOString(),
      type: "message",
      from: "Mac Codex",
      text: "NEED_USER_AUTH: old message should not alert by default.",
    }],
  }), [], args);
  assertNotIncludes(output, "ALERT:", "default existing event skip");
  console.log("[OK] Existing events are skipped by default");
}

async function checkUrgentEventAlerts(args) {
  const output = await runWatcherAgainst(baseState({
    events: [{
      id: "auth",
      at: new Date().toISOString(),
      type: "message",
      from: "Mac Codex",
      text: "NEED_USER_AUTH: please enter the password locally.",
    }],
  }), ["-AlertExistingEvents"], args);
  assertIncludes(output, "ALERT:", "urgent Mac event");
  assertIncludes(output, "NEED_USER_AUTH", "urgent Mac event");
  console.log("[OK] Urgent Mac events alert");
}

async function checkChinesePermissionEventAlerts(args) {
  const output = await runWatcherAgainst(baseState({
    events: [{
      id: "permission-cn",
      at: new Date().toISOString(),
      type: "message",
      from: "Mac Codex",
      text: "需要用户授权：请在 Mac 前台确认屏幕录制权限。",
    }],
  }), ["-AlertExistingEvents"], args);
  assertIncludes(output, "ALERT:", "Chinese permission event");
  assertIncludes(output, "需要用户授权", "Chinese permission event");
  console.log("[OK] Chinese permission wording alerts");
}

async function checkGatewayEventAlerts(args) {
  const output = await runWatcherAgainst(baseState({
    events: [{
      id: "bad-gateway",
      at: new Date().toISOString(),
      type: "message",
      from: "Mac Codex",
      text: "Mac Codex request failed with HTTP 502 Bad Gateway.",
    }],
  }), ["-AlertExistingEvents"], args);
  assertIncludes(output, "ALERT:", "502 event");
  assertIncludes(output, "502", "502 event");
  console.log("[OK] 502/Bad Gateway events alert");
}

async function checkNonMacEventIgnored(args) {
  const output = await runWatcherAgainst(baseState({
    events: [{
      id: "windows-auth",
      at: new Date().toISOString(),
      type: "message",
      from: "Windows Codex",
      text: "NEED_USER_AUTH: Windows-only event.",
    }],
  }), ["-AlertExistingEvents"], args);
  assertNotIncludes(output, "ALERT:", "non-Mac event");
  console.log("[OK] Non-Mac urgent events are ignored by default");
}

async function checkMacCallForWindowsAlerts(args) {
  const output = await runWatcherAgainst(baseState({
    currentCall: {
      status: "CALLING",
      from: "Mac Codex",
      need: "Windows Codex",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      goal: "正式 Windows host 验收",
      connection: "Windows host /discovery",
      command: "node scripts/windows/start-windows-host.mjs --status --json",
      expected: "Windows confirms host readiness, then Mac runs formal smoke.",
      ask: "请 Windows 先只读确认 status。",
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "Mac call for Windows");
  assertIncludes(output, "Agent Link call needs Windows attention", "Mac call for Windows");
  assertIncludes(output, "start-windows-host.mjs --status --json", "Mac call for Windows");
  console.log("[OK] Mac -> Windows current calls alert");
}

async function checkDoneMacCallIgnored(args) {
  const output = await runWatcherAgainst(baseState({
    currentCall: {
      status: "DONE",
      from: "Mac Codex",
      need: "Windows Codex",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      goal: "completed Windows host validation",
      command: "node scripts/windows/start-windows-host.mjs --status --json",
    },
  }), [], args);
  assertNotIncludes(output, "ALERT:", "done Mac call");
  console.log("[OK] Done Mac -> Windows calls are ignored");
}

async function checkWindowsCallForMacIgnored(args) {
  const output = await runWatcherAgainst(baseState({
    currentCall: {
      status: "CALLING",
      from: "Windows Codex",
      need: "Mac Codex",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      goal: "启动 Mac host",
      command: "node scripts/mac/start-mac-host.mjs --status",
      ask: "请 Mac 端确认 host。",
    },
  }), [], args);
  assertNotIncludes(output, "ALERT:", "Windows call for Mac");
  console.log("[OK] Windows -> Mac current calls are ignored by the Windows watcher");
}

async function checkBlockedStatusAlerts(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "blocked",
        note: "waiting for permission dialog",
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "blocked status");
  assertIncludes(output, "blocked", "blocked status");
  console.log("[OK] Blocked Mac status alerts");
}

async function checkStaleStatusAlerts(args) {
  const staleAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "waiting",
        note: "formal E2E call waiting",
        updatedAt: staleAt,
      },
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "stale status");
  assertIncludes(output, "Mac side may be stuck", "stale status");
  console.log("[OK] Stale Mac status alerts");
}

async function checkStartWrapperLifecycle(args) {
  const basePath = resolve(repoRoot, ".dev-lab", `mac-alert-watcher-test-${process.pid}-${Date.now()}`);
  const pidFile = `${basePath}.pid`;
  const outLog = `${basePath}.out.log`;
  const errLog = `${basePath}.err.log`;
  let started = false;
  await withFakeBoard(baseState(), async (serverUrl) => {
    try {
      const common = [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", startWrapperScript,
        "-Server", serverUrl,
        "-NoPopup",
        "-StaleMinutes", "60",
        "-PidFile", pidFile,
        "-OutLog", outLog,
        "-ErrLog", errLog,
      ];
      const start = await runPowerShell(args.powerShellExe, common, args);
      const startOutput = `${start.stdout}\n${start.stderr}`;
      assert(start.exitCode === 0, `start wrapper should start watcher\n${startOutput}`);
      assertIncludes(startOutput, "Mac alert watcher started.", "start wrapper");
      const pidMatch = startOutput.match(/Process ID:\s*(\d+)/);
      assert(pidMatch, `start wrapper should print process id\n${startOutput}`);
      const firstPid = pidMatch[1];
      started = true;

      const duplicate = await runPowerShell(args.powerShellExe, common, args);
      const duplicateOutput = `${duplicate.stdout}\n${duplicate.stderr}`;
      assert(duplicate.exitCode === 0, `duplicate start should exit 0\n${duplicateOutput}`);
      assertIncludes(duplicateOutput, "already running", "duplicate start");
      assertIncludes(duplicateOutput, firstPid, "duplicate start process id");

      const status = await runPowerShell(args.powerShellExe, [...common, "-Status"], args);
      const statusOutput = `${status.stdout}\n${status.stderr}`;
      assert(status.exitCode === 0, `status should exit 0\n${statusOutput}`);
      assertIncludes(statusOutput, "is running", "status");
      assertIncludes(statusOutput, firstPid, "status process id");

      const stop = await runPowerShell(args.powerShellExe, [...common, "-Stop"], args);
      const stopOutput = `${stop.stdout}\n${stop.stderr}`;
      assert(stop.exitCode === 0, `stop should exit 0\n${stopOutput}`);
      assertIncludes(stopOutput, "stopped", "stop");
      started = false;
      console.log("[OK] Start wrapper status/duplicate/stop lifecycle works");
    } finally {
      if (started) {
        await runPowerShell(args.powerShellExe, [
          "-NoProfile",
          "-ExecutionPolicy", "Bypass",
          "-File", startWrapperScript,
          "-Server", serverUrl,
          "-PidFile", pidFile,
          "-OutLog", outLog,
          "-ErrLog", errLog,
          "-Stop",
        ], args).catch(() => null);
      }
      await Promise.all([
        rm(pidFile, { force: true }),
        rm(outLog, { force: true }),
        rm(errLog, { force: true }),
      ]);
    }
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (process.platform !== "win32") {
    console.log("[SKIP] Windows PowerShell watcher regression only runs on Windows.");
    return;
  }
  args.powerShellExe = await resolvePowerShellExe();
  console.log(`[INFO] PowerShell executable: ${args.powerShellExe}`);
  await checkExistingEventsSkipped(args);
  await checkUrgentEventAlerts(args);
  await checkChinesePermissionEventAlerts(args);
  await checkGatewayEventAlerts(args);
  await checkNonMacEventIgnored(args);
  await checkMacCallForWindowsAlerts(args);
  await checkDoneMacCallIgnored(args);
  await checkWindowsCallForMacIgnored(args);
  await checkBlockedStatusAlerts(args);
  await checkStaleStatusAlerts(args);
  if (args.includeLifecycle) {
    await checkStartWrapperLifecycle(args);
  }
  console.log("[OK] Mac alert watcher regression passed");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
