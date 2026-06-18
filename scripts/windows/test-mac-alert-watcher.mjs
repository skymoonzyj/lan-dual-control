#!/usr/bin/env node

import { spawn } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
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

async function checkCodexReconnectStuckEventAlerts(args) {
  const output = await runWatcherAgainst(baseState({
    events: [{
      id: "codex-reconnect-stuck",
      at: new Date().toISOString(),
      type: "message",
      from: "Mac Watchdog",
      text: [
        "NEED_USER_ATTENTION reason=codex-reconnect-stuck",
        "evidence=正在重新连接 5/5 / stream disconnected before completion:",
        "error sending request for url (https://chatgpt.com/backend-api/codex/responses)",
        "suggestedAction=请用户查看 Mac Codex 窗口，可能需要手动重试/刷新。",
      ].join(" "),
    }],
  }), ["-AlertExistingEvents"], args);
  assertIncludes(output, "ALERT:", "codex reconnect stuck event");
  assertIncludes(output, "codex-reconnect-stuck", "codex reconnect stuck event");
  assertIncludes(output, "正在重新连接 5/5", "codex reconnect stuck event");
  assertIncludes(output, "stream disconnected before completion", "codex reconnect stuck event");
  assertIncludes(output, "/backend-api/codex/responses", "codex reconnect stuck event");
  console.log("[OK] Codex reconnect-stuck events alert");
}

async function checkReverseGrantEventAlerts(args) {
  const output = await runWatcherAgainst(baseState({
    events: [{
      id: "reverse-grant",
      at: new Date().toISOString(),
      type: "message",
      from: "Mac Codex",
      text: [
        "Mac 反控请求收到 LAN008；请 Windows 本机运行",
        "ReverseGrant=node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --durationMs 30000 --boardSummary",
        "后让 Mac 重试反控。",
      ].join(" "),
    }],
  }), ["-AlertExistingEvents"], args);
  assertIncludes(output, "ALERT:", "reverse grant event");
  assertIncludes(output, "LAN008", "reverse grant event");
  assertIncludes(output, "ReverseGrant=", "reverse grant event");
  assertIncludes(output, "allow-windows-reverse-control.mjs", "reverse grant event");
  console.log("[OK] Mac reverse-control grant events alert");
}

async function checkStructuredReverseGrantLabelsAlert(args) {
  const output = await runWatcherAgainst(baseState({
    events: [{
      id: "structured-reverse-grant",
      at: new Date().toISOString(),
      type: "message",
      from: "Mac Codex",
      text: [
        "Mac client formal status blocked waiting for Windows reverse control grant after LAN008.",
        "WindowsReverseGrantStatus=pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Status -BoardSummary",
        "WindowsOpenOneTimeReverseGrant=pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Grant -DurationMs 30000 -BoardSummary",
        "WindowsReverseGrantStatusNodeFallback=node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --status --boardSummary",
        "WindowsOpenOneTimeReverseGrantNodeFallback=node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --grant --durationMs 30000 --boardSummary",
      ].join(" "),
    }],
  }), ["-AlertExistingEvents"], args);
  assertIncludes(output, "ALERT:", "structured reverse grant labels");
  assertIncludes(output, "WindowsReverseGrantStatus=", "structured reverse grant labels");
  assertIncludes(output, "WindowsOpenOneTimeReverseGrant=", "structured reverse grant labels");
  assertIncludes(output, "allow-windows-reverse-control.ps1", "structured reverse grant labels");
  console.log("[OK] Structured Windows reverse-grant labels alert when Mac is waiting");
}

async function checkStructuredReverseGrantCleanIgnored(args) {
  const output = await runWatcherAgainst(baseState({
    events: [{
      id: "structured-reverse-grant-clean",
      at: new Date().toISOString(),
      type: "message",
      from: "Mac Codex",
      text: [
        "Mac client formal status ready warnings=none blockers=none.",
        "WindowsReverseGrantStatus=pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Status -BoardSummary",
        "WindowsOpenOneTimeReverseGrant=pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Grant -DurationMs 30000 -BoardSummary",
      ].join(" "),
    }],
  }), ["-AlertExistingEvents"], args);
  assertNotIncludes(output, "ALERT:", "clean structured reverse grant labels");
  console.log("[OK] Clean structured Windows reverse-grant labels do not alert");
}

async function checkMacUnattendedEventAlerts(args) {
  const output = await runWatcherAgainst(baseState({
    events: [{
      id: "mac-unattended-warning",
      at: new Date().toISOString(),
      type: "message",
      from: "Mac Codex",
      text: [
        "Mac unattended status: ready=false attention=warning",
        "warnings=launch-agent-missing,launch-agent-not-loaded,launch-agent-max-fps,power-risk",
        "MacUnattendedStatus=node scripts/mac/check-mac-unattended-status.mjs --boardSummary",
      ].join(" "),
    }],
  }), ["-AlertExistingEvents"], args);
  assertIncludes(output, "ALERT:", "Mac unattended event");
  assertIncludes(output, "Mac unattended status", "Mac unattended event");
  assertIncludes(output, "warnings=launch-agent-missing", "Mac unattended event");
  assertIncludes(output, "launch-agent-max-fps", "Mac unattended event");
  assertIncludes(output, "MacUnattendedStatus=", "Mac unattended event");
  console.log("[OK] Mac unattended warning events alert");
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

async function checkStaleMacCallForWindowsAlerts(args) {
  const staleAt = new Date(Date.now() - 12 * 60 * 1000).toISOString();
  const output = await runWatcherAgainst(baseState({
    currentCall: {
      status: "CALLING",
      from: "Mac Codex",
      need: "Windows Codex",
      startedAt: staleAt,
      updatedAt: staleAt,
      goal: "Mac client formal smoke waiting for Windows grant",
      connection: "Windows host reverse control",
      command: "node scripts/mac/run-mac-client-formal-smoke.mjs --boardSummary",
      expected: "Windows opens one-time reverse grant, then Mac retries.",
      ask: "请 Windows 检查是否卡住或需要授权。",
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "stale Mac call for Windows");
  assertIncludes(output, "Agent Link call may be stale", "stale Mac call for Windows");
  assertIncludes(output, "has not updated for more than 5 minute", "stale Mac call for Windows");
  console.log("[OK] Stale Mac -> Windows current calls alert");
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

async function checkCodexWorkStatusStaleAlerts(args) {
  const staleAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Checking": {
        role: "Mac 端",
        status: "checking",
        note: "checking formal E2E step 2",
        updatedAt: staleAt,
      },
      "Mac Thinking": {
        role: "Mac 端",
        status: "thinking",
        note: "thinking through build failure",
        updatedAt: staleAt,
      },
      "Mac Running": {
        role: "Mac 端",
        status: "running",
        note: "running local smoke",
        updatedAt: staleAt,
      },
    },
  }), [], args);
  assertIncludes(output, "Mac side may be stuck - Mac Checking", "checking stale status");
  assertIncludes(output, "Mac side may be stuck - Mac Thinking", "thinking stale status");
  assertIncludes(output, "Mac side may be stuck - Mac Running", "running stale status");
  console.log("[OK] Checking/thinking/running Mac statuses alert when stale");
}

async function checkMacHeartbeatAndHostUnreachableAlerts(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Watchdog": {
        role: "Mac 端",
        status: "idle",
        note: "MacHeartbeat=stale heartbeat missing; Mac host /discovery unreachable ECONNREFUSED",
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "Mac heartbeat and host unreachable status");
  assertIncludes(output, "MacHeartbeat=stale", "Mac heartbeat status");
  assertIncludes(output, "Mac host /discovery unreachable", "Mac host unreachable status");
  console.log("[OK] Mac heartbeat stale and host unreachable wording alerts");
}

async function checkCodexReconnectStuckStatusAlerts(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Watchdog": {
        role: "Mac 端",
        status: "blocked",
        note: "MacHeartbeat=blocked reason=codex-reconnect-stuck evidence=正在重新连接 5/5 / stream disconnected before completion suggestedAction=请用户查看 Mac Codex 窗口",
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "codex reconnect stuck status");
  assertIncludes(output, "reason=codex-reconnect-stuck", "codex reconnect stuck status");
  assertIncludes(output, "stream disconnected before completion", "codex reconnect stuck status");
  console.log("[OK] Codex reconnect-stuck status alerts");
}

async function checkMacHeartbeatReasonAlerts(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Watchdog": {
        role: "Mac 端",
        status: "blocked",
        note: "MacHeartbeat=status=blocked; device=Mac; codex=mac-codex-stale age=700s; macHost=online; macClient=offline; board=ok; blockers=mac-codex-stale warnings=none reason=mac-codex-stale. MacHeartbeatRerun=node scripts/mac/check-mac-heartbeat.mjs --host 127.0.0.1 --port 43770 --checkBoard --boardSummary.",
        updatedAt: new Date().toISOString(),
      },
      "Mac Watchdog Warning": {
        role: "Mac 端",
        status: "warning",
        note: "MacHeartbeat=status=warning; device=Mac; codex=codex-reconnect-signal; blockers=none warnings=codex-reconnect-signal reason=codex-reconnect-signal.",
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "Mac heartbeat reason status");
  assertIncludes(output, "reason=mac-codex-stale", "Mac heartbeat stale reason");
  assertIncludes(output, "reason=codex-reconnect-signal", "Mac heartbeat reconnect signal reason");
  console.log("[OK] Mac heartbeat reason ids alert");
}

async function checkReverseGrantStatusAlerts(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "waiting",
        note: "等待 Windows 临时允许反控后重试。",
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "reverse grant status");
  assertIncludes(output, "临时允许反控", "reverse grant status");
  console.log("[OK] Mac reverse-control grant status alerts");
}

async function checkMacUnattendedStatusAlerts(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: "MacUnattendedStatus=attention warnings=launch-agent-missing,launch-agent-max-fps,power-risk blockers=none",
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "Mac unattended status");
  assertIncludes(output, "MacUnattendedStatus=", "Mac unattended status");
  assertIncludes(output, "warnings=launch-agent-missing", "Mac unattended status");
  assertIncludes(output, "launch-agent-max-fps", "Mac unattended status");
  console.log("[OK] Mac unattended status alerts");
}

async function checkMacUnattendedOkStatusIgnored(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: "MacUnattendedStatus=ready warnings=none blockers=none launch-agent=loaded power=ok",
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertNotIncludes(output, "ALERT:", "Mac unattended ok status");
  console.log("[OK] Mac unattended ok status is ignored");
}

async function checkMacResumeFindingsAlert(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: "MacResumeStatus=ready with warnings blockers=none warnings=h264-fallback,fps-limit; MacMaxFpsPlan=node scripts/mac/install-mac-host-launch-agent.mjs --port 43770 --maxScreenFps 60 --boardSummary",
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "Mac resume findings status");
  assertIncludes(output, "MacResumeStatus=ready with warnings", "Mac resume findings status");
  assertIncludes(output, "warnings=h264-fallback,fps-limit", "Mac resume findings status");
  assertIncludes(output, "MacMaxFpsPlan=", "Mac resume findings status");
  console.log("[OK] Mac resume finding status alerts");
}

async function checkMacResumeCleanIgnored(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: "check-mac-resume-status ready blockers=none warnings=none maxScreenFps=60",
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertNotIncludes(output, "ALERT:", "Mac resume clean status");
  console.log("[OK] Mac resume clean status is ignored");
}

async function checkMacClientFormalFindingsAlert(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: [
          "MacClientReadiness=ready blockers=none warnings=windows-host",
          "Mac formal E2E status ready with warnings: blockers: none warnings: video,build,auth",
          "MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs --host 192.168.31.68 --port 43770 --boardSummary",
        ].join("; "),
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "Mac client/formal findings status");
  assertIncludes(output, "MacClientReadiness=ready", "Mac client/formal findings status");
  assertIncludes(output, "warnings=windows-host", "Mac client/formal findings status");
  assertIncludes(output, "warnings: video,build,auth", "Mac client/formal findings status");
  assertIncludes(output, "MacClientFormalChecklist=", "Mac client/formal findings status");
  console.log("[OK] Mac client/formal finding statuses alert");
}

async function checkMacClientFormalCleanIgnored(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: [
          "MacClientReadiness=ready blockers=none warnings=none",
          "Mac formal E2E status ready blockers: none warnings: none",
          "MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs --host 192.168.31.68 --port 43770 --boardSummary",
        ].join("; "),
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertNotIncludes(output, "ALERT:", "Mac client/formal clean status");
  console.log("[OK] Mac client/formal clean statuses are ignored");
}

async function checkMacClientDiscoverWindowsLanRiskAlert(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: [
          "MacClientDiscoverWindows=node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary",
          "WindowsLanRisk=no-firewall-allow,public-profile",
          "blockers=none warnings=none",
        ].join("; "),
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "MacClientDiscoverWindows WindowsLanRisk status");
  assertIncludes(output, "MacClientDiscoverWindows=", "MacClientDiscoverWindows WindowsLanRisk status");
  assertIncludes(output, "WindowsLanRisk=no-firewall-allow,public-profile", "MacClientDiscoverWindows WindowsLanRisk status");
  console.log("[OK] Mac client Windows discovery LAN risk status alerts");
}

async function checkMacHostReadinessFindingsAlert(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: "MacHostReadiness=attention blockers=none warnings=mac-host-discovery,agent-link-board-currentcall,mac-host-max-fps",
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "Mac host readiness findings status");
  assertIncludes(output, "MacHostReadiness=attention", "Mac host readiness findings status");
  assertIncludes(output, "warnings=mac-host-discovery", "Mac host readiness findings status");
  assertIncludes(output, "agent-link-board-currentcall", "Mac host readiness findings status");
  assertIncludes(output, "mac-host-max-fps", "Mac host readiness findings status");
  console.log("[OK] Mac host readiness finding status alerts");
}

async function checkMacHostReadinessCleanIgnored(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: "check-mac-host-readiness ready blockers=none warnings=none",
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertNotIncludes(output, "ALERT:", "Mac host readiness clean status");
  console.log("[OK] Mac host readiness clean status is ignored");
}

async function checkMacFormalLocalSmokeFindingsAlert(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: [
          "MacFormalLocalSmoke=failed blockers=auth warnings=video",
          "RerunFormalLocalSmoke=node scripts/mac/check-mac-formal-local-smoke.mjs --host 127.0.0.1 --port 43770 --promptPassword --boardSummary",
        ].join("; "),
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "Mac formal local smoke findings status");
  assertIncludes(output, "MacFormalLocalSmoke=failed", "Mac formal local smoke findings status");
  assertIncludes(output, "blockers=auth", "Mac formal local smoke findings status");
  assertIncludes(output, "warnings=video", "Mac formal local smoke findings status");
  assertIncludes(output, "RerunFormalLocalSmoke=", "Mac formal local smoke findings status");
  console.log("[OK] Mac formal local smoke finding status alerts");
}

async function checkMacFormalLocalSmokeCleanIgnored(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: [
          "MacFormalLocalSmoke=ready blockers=none warnings=none",
          "RerunFormalLocalSmoke=node scripts/mac/check-mac-formal-local-smoke.mjs --host 127.0.0.1 --port 43770 --promptPassword --boardSummary",
        ].join("; "),
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertNotIncludes(output, "ALERT:", "Mac formal local smoke clean status");
  console.log("[OK] Mac formal local smoke clean status is ignored");
}

async function checkMacHostSafeStartGuidanceAlert(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: [
          "MacHostReadiness=attention blockers=host-offline warnings=none",
          "MacHostSafeStart=node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770",
        ].join("; "),
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "Mac host safe-start guidance status");
  assertIncludes(output, "MacHostSafeStart=", "Mac host safe-start guidance status");
  assertIncludes(output, "blockers=host-offline", "Mac host safe-start guidance status");
  console.log("[OK] Mac host safe-start guidance alerts when readiness has blockers");
}

async function checkMacHostSafeStartCleanIgnored(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: [
          "MacHostReadiness=ready blockers=none warnings=none",
          "MacHostSafeStart=node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770",
        ].join("; "),
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertNotIncludes(output, "ALERT:", "Mac host safe-start clean status");
  console.log("[OK] Mac host safe-start guidance alone is ignored");
}

async function checkMacMaxFpsSafeStartGuidanceAlert(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: [
          "MacResumeStatus=ready blockers=none warnings=fps-limit",
          "MacMaxFpsSafeStart=node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770 --maxScreenFps 60",
        ].join("; "),
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "Mac max-FPS safe-start guidance status");
  assertIncludes(output, "MacMaxFpsSafeStart=", "Mac max-FPS safe-start guidance status");
  assertIncludes(output, "warnings=fps-limit", "Mac max-FPS safe-start guidance status");
  console.log("[OK] Mac max-FPS safe-start guidance alerts when FPS findings exist");
}

async function checkMacMaxFpsSafeStartCleanIgnored(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: [
          "MacResumeStatus=ready blockers=none warnings=none",
          "MacMaxFpsSafeStart=node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770 --maxScreenFps 60",
        ].join("; "),
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertNotIncludes(output, "ALERT:", "Mac max-FPS safe-start clean status");
  console.log("[OK] Mac max-FPS safe-start guidance alone is ignored");
}

async function checkMacLaunchAgentCommandGuidanceAlert(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Heartbeat": {
        role: "Mac heartbeat watcher",
        status: "idle",
        note: [
          "MacHeartbeat=status=ok launchAgentLoaded=false maxScreenFps=60",
          "MacLaunchAgentLoad=launchctl bootstrap gui/$(id -u) /Users/skymoonzyj/Library/LaunchAgents/com.lan-dual-control.mac-host.plist",
          "MacLaunchAgentPrint=launchctl print gui/$(id -u)/com.lan-dual-control.mac-host",
        ].join("; "),
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "Mac LaunchAgent command guidance status");
  assertIncludes(output, "MacLaunchAgentLoad=", "Mac LaunchAgent command guidance status");
  assertIncludes(output, "MacLaunchAgentPrint=", "Mac LaunchAgent command guidance status");
  assertIncludes(output, "launchAgentLoaded=false", "Mac LaunchAgent command guidance status");
  console.log("[OK] Mac LaunchAgent load/print guidance alerts when findings exist");
}

async function checkMacLaunchAgentCommandCleanIgnored(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Heartbeat": {
        role: "Mac heartbeat watcher",
        status: "idle",
        note: [
          "MacHeartbeat=status=ok warnings=none blockers=none",
          "MacLaunchAgentLoad=launchctl bootstrap gui/$(id -u) /Users/skymoonzyj/Library/LaunchAgents/com.lan-dual-control.mac-host.plist",
          "MacLaunchAgentPrint=launchctl print gui/$(id -u)/com.lan-dual-control.mac-host",
        ].join("; "),
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertNotIncludes(output, "ALERT:", "Mac LaunchAgent clean command status");
  console.log("[OK] Mac LaunchAgent load/print guidance alone is ignored");
}

async function checkMacClientFormalSmokeFindingsAlert(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: "run-mac-client-formal-smoke preflight ready=false blockers=windows-host warnings=board",
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "Mac client formal smoke findings status");
  assertIncludes(output, "run-mac-client-formal-smoke", "Mac client formal smoke findings status");
  assertIncludes(output, "blockers=windows-host", "Mac client formal smoke findings status");
  assertIncludes(output, "warnings=board", "Mac client formal smoke findings status");
  console.log("[OK] Mac client formal smoke finding status alerts");
}

async function checkMacClientFormalSmokeCleanIgnored(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: "MacClientFormalSmoke preflight ready blockers=none warnings=none",
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertNotIncludes(output, "ALERT:", "Mac client formal smoke clean status");
  console.log("[OK] Mac client formal smoke clean status is ignored");
}

async function checkMacClientBrowserSelfTestFindingsAlert(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: [
          "MacClientBrowserSelfTest=node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs --boardSummary",
          "Mac client browser self-test ready=false blockers=windows-host warnings=board",
        ].join("; "),
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertIncludes(output, "ALERT:", "Mac client browser self-test findings status");
  assertIncludes(output, "MacClientBrowserSelfTest=", "Mac client browser self-test findings status");
  assertIncludes(output, "blockers=windows-host", "Mac client browser self-test findings status");
  assertIncludes(output, "warnings=board", "Mac client browser self-test findings status");
  console.log("[OK] Mac client browser self-test finding status alerts");
}

async function checkMacClientBrowserSelfTestCleanIgnored(args) {
  const output = await runWatcherAgainst(baseState({
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "idle",
        note: [
          "MacClientBrowserSelfTest=node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs --boardSummary",
          "Mac client browser self-test ready blockers=none warnings=none",
        ].join("; "),
        updatedAt: new Date().toISOString(),
      },
    },
  }), [], args);
  assertNotIncludes(output, "ALERT:", "Mac client browser self-test clean status");
  console.log("[OK] Mac client browser self-test clean status is ignored");
}

async function checkStartWrapperJsonStatus(args) {
  const basePath = resolve(repoRoot, ".dev-lab", `mac-alert-watcher-json-status-${process.pid}-${Date.now()}`);
  const pidFile = `${basePath}.pid`;
  const outLog = `${basePath}.out.log`;
  const errLog = `${basePath}.err.log`;
  await writeFile(
    outLog,
    [
      "Watching Mac-side Agent Link alerts from http://127.0.0.1:1",
      "[2026-06-18 10:31:00] ALERT: Mac side status alert - Mac Codex",
      "MacUnattendedStatus=attention warnings=launch-agent-missing,power-risk blockers=none",
      "Token echo should be redacted: secret-token-for-test",
      "",
    ].join("\n"),
    "utf8",
  );
  const result = await runPowerShell(args.powerShellExe, [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", startWrapperScript,
    "-Server", "http://127.0.0.1:1",
    "-Token", "secret-token-for-test",
    "-PidFile", pidFile,
    "-OutLog", outLog,
    "-ErrLog", errLog,
    "-Status",
    "-Json",
  ], args);
  const output = `${result.stdout}\n${result.stderr}`;
  try {
    assert(result.exitCode === 0, `JSON status should exit 0\n${output}`);
    assertNotIncludes(output, "secret-token-for-test", "JSON status");
    const payload = JSON.parse(result.stdout);
    assert(payload.ok === true, "JSON status should be ok");
    assert(payload.action === "status", "JSON status action should be status");
    assert(payload.running === false, "JSON status should not find a watcher for a unique fake server");
    assert(Array.isArray(payload.processIds), "JSON status should include processIds array");
    assert(payload.processIds.length === 0, "JSON status should not include process ids for an offline watcher");
    assert(payload.server === "http://127.0.0.1:1", "JSON status should include server");
    assert(String(payload.pidFile || "").endsWith(".pid"), "JSON status should include pid file");
    assert(typeof payload.message === "string" && payload.message.includes("not running"), "JSON status should include status message");
    assert(Array.isArray(payload.recentAlerts), "JSON status should include recentAlerts array");
    assert(payload.recentAlerts.length === 1, "JSON status should parse one recent alert");
    assert(payload.lastAlert?.title === "Mac side status alert - Mac Codex", "JSON status should include last alert title");
    assert(String(payload.lastAlert?.summary || "").includes("MacUnattendedStatus=attention"), "JSON status should include alert summary");
    assertNotIncludes(JSON.stringify(payload), "secret-token-for-test", "JSON status recent alerts");
    const stop = await runPowerShell(args.powerShellExe, [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", startWrapperScript,
      "-Server", "http://127.0.0.1:1",
      "-Token", "secret-token-for-test",
      "-PidFile", pidFile,
      "-OutLog", outLog,
      "-ErrLog", errLog,
      "-Stop",
      "-Json",
    ], args);
    const stopOutput = `${stop.stdout}\n${stop.stderr}`;
    assert(stop.exitCode === 0, `JSON stop should exit 0 when watcher is not running\n${stopOutput}`);
    assertNotIncludes(stopOutput, "secret-token-for-test", "JSON stop");
    const stopPayload = JSON.parse(stop.stdout);
    assert(stopPayload.ok === true, "JSON stop should be ok");
    assert(stopPayload.action === "stop", "JSON stop action should be stop");
    assert(stopPayload.running === false, "JSON stop should report not running for a unique fake server");
    assert(Array.isArray(stopPayload.stoppedProcessIds), "JSON stop should include stoppedProcessIds array");
    console.log("[OK] Start wrapper JSON status is parseable and secret-free");
  } finally {
    await Promise.all([
      rm(pidFile, { force: true }),
      rm(outLog, { force: true }),
      rm(errLog, { force: true }),
    ]);
  }
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
  await checkCodexReconnectStuckEventAlerts(args);
  await checkReverseGrantEventAlerts(args);
  await checkStructuredReverseGrantLabelsAlert(args);
  await checkStructuredReverseGrantCleanIgnored(args);
  await checkMacUnattendedEventAlerts(args);
  await checkNonMacEventIgnored(args);
  await checkMacCallForWindowsAlerts(args);
  await checkStaleMacCallForWindowsAlerts(args);
  await checkDoneMacCallIgnored(args);
  await checkWindowsCallForMacIgnored(args);
  await checkBlockedStatusAlerts(args);
  await checkStaleStatusAlerts(args);
  await checkCodexWorkStatusStaleAlerts(args);
  await checkMacHeartbeatAndHostUnreachableAlerts(args);
  await checkCodexReconnectStuckStatusAlerts(args);
  await checkMacHeartbeatReasonAlerts(args);
  await checkReverseGrantStatusAlerts(args);
  await checkMacUnattendedStatusAlerts(args);
  await checkMacUnattendedOkStatusIgnored(args);
  await checkMacResumeFindingsAlert(args);
  await checkMacResumeCleanIgnored(args);
  await checkMacClientFormalFindingsAlert(args);
  await checkMacClientFormalCleanIgnored(args);
  await checkMacClientDiscoverWindowsLanRiskAlert(args);
  await checkMacHostReadinessFindingsAlert(args);
  await checkMacHostReadinessCleanIgnored(args);
  await checkMacFormalLocalSmokeFindingsAlert(args);
  await checkMacFormalLocalSmokeCleanIgnored(args);
  await checkMacHostSafeStartGuidanceAlert(args);
  await checkMacHostSafeStartCleanIgnored(args);
  await checkMacMaxFpsSafeStartGuidanceAlert(args);
  await checkMacMaxFpsSafeStartCleanIgnored(args);
  await checkMacLaunchAgentCommandGuidanceAlert(args);
  await checkMacLaunchAgentCommandCleanIgnored(args);
  await checkMacClientFormalSmokeFindingsAlert(args);
  await checkMacClientFormalSmokeCleanIgnored(args);
  await checkMacClientBrowserSelfTestFindingsAlert(args);
  await checkMacClientBrowserSelfTestCleanIgnored(args);
  await checkStartWrapperJsonStatus(args);
  if (args.includeLifecycle) {
    await checkStartWrapperLifecycle(args);
  }
  console.log("[OK] Mac alert watcher regression passed");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
