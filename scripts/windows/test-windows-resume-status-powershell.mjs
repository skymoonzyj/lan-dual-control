import { spawn } from "node:child_process";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createMockMacHostServer } from "../../apps/mock-mac-host/server.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const wrapperScript = "scripts/windows/check-windows-resume-status.ps1";

const defaults = {
  timeoutMs: 30000,
};

const freeWindowsClientPortsEnv = {
  LAN_DUAL_FAKE_WINDOWS_CLIENT_PORTS_JSON: JSON.stringify({ owners: [] }),
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-resume-status-powershell.mjs [options]

Options:
  --timeoutMs <ms>  Per PowerShell wrapper timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Description:
  Verifies check-windows-resume-status.ps1 safely wraps the Node resume-status
  script. It never authenticates a real Mac, never requests passwords, and never
  executes inject.
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

function runPowerShell(extraArgs, args, env = {}) {
  return new Promise((resolveRun) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      wrapperScript,
      ...extraArgs,
    ], {
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

async function withMockLinkBoard(callback, stateOverrides = {}) {
  const messages = [];
  const state = {
    currentCall: null,
    statuses: {},
    events: [],
    ...stateOverrides,
  };
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      if (request.method === "POST" && request.url === "/api/message") {
        try {
          messages.push(JSON.parse(body || "{}"));
        } catch {
          messages.push({ parseError: true, body });
        }
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
        return;
      }
      if (request.method === "GET" && request.url === "/api/state") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(state));
        return;
      }
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "not found" }));
    });
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  try {
    await callback({
      url: `http://127.0.0.1:${address.port}`,
      messages,
    });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

function macCallForWindows() {
  return {
    status: "CALLING",
    from: "Mac Codex",
    need: "Windows Codex",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    goal: "正式 Windows host 验收",
    connection: "Windows host /discovery",
    command: "node scripts/windows/start-windows-host.mjs --status --json",
    expected: "Windows confirms host readiness before Mac runs formal smoke.",
    ask: "请 Windows 先只读确认 status。",
  };
}

function secureAuthMacCallForWindows() {
  return {
    status: "CALLING",
    from: "Mac Codex",
    need: "Windows Codex",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    goal: "Coordinate secure auth for Mac client true browser smoke",
    connection: "Windows host 192.168.31.68:43770",
    expected: "Windows provides a safe local auth path without posting secrets.",
    ask: "Mac 环境 LAN_DUAL_PASSWORD=unset，Windows host 使用随机运行期密码且未上板。请 Windows 端协助给出安全认证路径，不要在 Agent Link Board 发送密码/token/系统账号。",
  };
}

function manualUxCallForWindows() {
  return {
    status: "CALLING",
    from: "Mac Codex",
    need: "Windows Codex",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    goal: "User Mac manual UX validation: user-present real experience test",
    expected: "Windows/User confirms the 5-10 minute manual UX validation window before Mac waits for real observations.",
    ask: "请 Windows/User 确认可进入手工体验窗口；不要发送密码/token/系统账号。",
  };
}

async function checkWrapperHelp(args) {
  const result = await runPowerShell(["-Help"], args);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.exitCode === 0, `PowerShell wrapper help failed\n${output}`);
  assertIncludes(output, "Usage:", "PowerShell wrapper help");
  assertIncludes(output, "-CheckBoard -BoardSummary", "PowerShell wrapper help");
  assertIncludes(output, "-UserAuthRequest", "PowerShell wrapper help");
  assertIncludes(output, "-SendAgentCallAck", "PowerShell wrapper help");
  assertIncludes(output, "-SendManualUxAck", "PowerShell wrapper help");
  assertIncludes(output, "current Agent Link", "PowerShell wrapper help");
  assertIncludes(output, "MacHostSafeStart=", "PowerShell wrapper help");
  assertIncludes(output, "MacMaxFpsSafeStart=", "PowerShell wrapper help");
  assertIncludes(output, "MacFormalLocalSmoke=", "PowerShell wrapper help");
  assertIncludes(output, "MacClientDiscoverWindows=", "PowerShell wrapper help");
  assertIncludes(output, "discover-windows-hosts.mjs --checkBoard --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "MacClientFormalChecklist=", "PowerShell wrapper help");
  assertIncludes(output, "check-mac-client-formal-status.mjs --discover --port 43770 --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "MacClientFormalSmoke=", "PowerShell wrapper help");
  assertIncludes(output, "run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "WindowsReverseGrantStatus=", "PowerShell wrapper help");
  assertIncludes(output, "WindowsOpenOneTimeReverseGrant=", "PowerShell wrapper help");
  assertIncludes(output, "WindowsSecureAuthPath=", "PowerShell wrapper help");
  assertIncludes(output, "MacRemoteAudioPlan=", "PowerShell wrapper help");
  assertIncludes(output, "plan-mac-remote-audio.mjs --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "MacInputSafetyPlan=", "PowerShell wrapper help");
  assertIncludes(output, "plan-mac-input-safety.mjs --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "MacManualUxStatus=", "PowerShell wrapper help");
  assertIncludes(output, "check-mac-manual-ux-status.mjs --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "does not ask for or print", "PowerShell wrapper help");
  assertIncludes(output, "passwords", "PowerShell wrapper help");
  assertIncludes(output, "Windows host media baseline", "PowerShell wrapper help");
  assertIncludes(output, "--probeMedia --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "check-windows-host-readiness.ps1 -CheckBoard -ProbeMedia -BoardSummary", "PowerShell wrapper help");
  assertIncludes(output, "Mac host discovery command", "PowerShell wrapper help");
  assertIncludes(output, "discover-lan-hosts.mjs --noLocalSubnets", "PowerShell wrapper help");
  assertIncludes(output, "discover-lan-hosts.ps1 -NoLocalSubnets", "PowerShell wrapper help");
  assertIncludes(output, "--requireMacHost --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "Mac host readiness command", "PowerShell wrapper help");
  assertIncludes(output, "check-mac-host-readiness.mjs --host <Mac IP> --port 43770 --checkBoard --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "Mac heartbeat/watchdog command", "PowerShell wrapper help");
  assertIncludes(output, "check-mac-heartbeat.mjs --host <Mac IP> --port 43770 --checkBoard --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "MacHeartbeatOnce=", "PowerShell wrapper help");
  assertIncludes(output, "MacHeartbeatWatch=", "PowerShell wrapper help");
  assertIncludes(output, "MacHeartbeatStart/Status/Stop=", "PowerShell wrapper help");
  assertIncludes(output, "Mac formal local smoke command", "PowerShell wrapper help");
  assertIncludes(output, "check-mac-formal-local-smoke.mjs --host <Mac IP> --port 43770 --promptPassword --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "Mac-side unattended/startup status command", "PowerShell wrapper help");
  assertIncludes(output, "check-mac-unattended-status.mjs --host <Mac IP> --port 43770 --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "formal 60Hz Mac-side unattended gate", "PowerShell wrapper help");
  assertIncludes(output, "check-mac-unattended-status.mjs --host <Mac IP> --port 43770 --requireLaunchAgentMaxFps --requireLaunchAgentLoaded --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "Windows -> Mac formal manual checklist command", "PowerShell wrapper help");
  assertIncludes(output, "check-mac-formal-e2e.ps1 -Discover -DiscoverNoLocalSubnets", "PowerShell wrapper help");
  assertIncludes(output, "ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics", "PowerShell wrapper help");
  assertIncludes(output, "Windows local one-time reverse-control grant", "PowerShell wrapper help");
  assertIncludes(output, "allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770", "PowerShell wrapper help");
  assertIncludes(output, "allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770", "PowerShell wrapper help");
  assertIncludes(output, "allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Status -BoardSummary", "PowerShell wrapper help");
  assertIncludes(output, "allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --status --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "one-line no-password Windows client diagnostics command", "PowerShell wrapper help");
  assertIncludes(output, "test-windows-client-browser.mjs --discover --diagnosticsOnly --boardSummary --timeoutMs 45000", "PowerShell wrapper help");
  assertIncludes(output, "test-windows-client-browser.ps1 -Discover -DiscoverNoLocalSubnets", "PowerShell wrapper help");
  assertIncludes(output, "-ClientPort 5200 -DebugPort 9340", "PowerShell wrapper help");
  assertIncludes(output, "WinClientDiagnosticsAlt", "PowerShell wrapper help");
  assertIncludes(output, "Windows video encoder/WGC/WebCodecs support command", "PowerShell wrapper help");
  assertIncludes(output, "check-windows-video-encoder-support.mjs --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "check-windows-video-encoder-support.ps1 -BoardSummary", "PowerShell wrapper help");
  assertIncludes(output, "dedicated read-only Windows Graphics Capture", "PowerShell wrapper help");
  assertIncludes(output, "check-windows-wgc-support.mjs --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "check-windows-wgc-support.ps1 -BoardSummary", "PowerShell wrapper help");
  assertIncludes(output, "WGC H.264 raw-bgra vs NV12", "PowerShell wrapper help");
  assertIncludes(output, "compare-windows-wgc-h264-sources.mjs --profile 60:20000:balanced", "PowerShell wrapper help");
  assertIncludes(output, "compare-windows-wgc-h264-sources.ps1 -Profile 60:20000:balanced", "PowerShell wrapper help");
  assertIncludes(output, "browser-only WebCodecs H.264 support command", "PowerShell wrapper help");
  assertIncludes(output, "check-webcodecs-h264-support.mjs --requireCodec avc1.42C02A --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "check-webcodecs-h264-support.ps1 -RequireCodec avc1.42C02A -BoardSummary", "PowerShell wrapper help");
  assertIncludes(output, "Windows PowerShell help coverage commands", "PowerShell wrapper help");
  assertIncludes(output, "test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "Use that first for Agent Link Board", "PowerShell wrapper help");
  assertIncludes(output, "Windows local Mac alert watcher commands", "PowerShell wrapper help");
  assertIncludes(output, "start-mac-alert-watcher.ps1 -Server", "PowerShell wrapper help");
  assertIncludes(output, "checks the watcher status read-only", "PowerShell wrapper help");
  console.log("[OK] PowerShell resume-status wrapper help is safe");
}

async function checkMockJson(args) {
  await withMockHost(async (port) => {
    const result = await runPowerShell([
      "-Discover",
      "-DiscoverNoLocalSubnets",
      "-HostName", "127.0.0.1",
      "-Port", String(port),
      "-Json",
      "-AllowMockVideo",
      "-SkipAudio",
      "-SkipClipboard",
      "-SkipInputLog",
    ], args, freeWindowsClientPortsEnv);
    const output = `${result.stdout}\n${result.stderr}`;
    assert(result.exitCode === 0, `PowerShell mock JSON failed\n${output}`);
    const payload = JSON.parse(result.stdout);
    assert(payload.ok === true, "mock JSON should be ok");
    assert(payload.macPreflight?.payload?.online === true, "mock JSON should include online preflight");
    assert(payload.macPreflight?.payload?.target?.port === port, "mock JSON should use discovered mock port");
    assert(payload.macPreflight?.payload?.discoverySelection?.requested === true, "preflight should record discovery");
    assertIncludes(payload.macPreflight?.command, "--clientPort 5197", "mock JSON formal preflight command");
    assertIncludes(payload.macPreflight?.command, "--debugPort 9337", "mock JSON formal preflight command");
    assertIncludes(payload.boardSummary, "Windows resume:", "mock JSON board summary");
    assert(payload.windowsClientDiagnosticsPorts?.clientPort === 5197, "mock JSON should record default client diagnostics page port");
    assert(payload.windowsClientDiagnosticsPorts?.debugPort === 9337, "mock JSON should record default client diagnostics debug port");
    assertIncludes(payload.userAuthRequest, "NEED_USER_AUTH", "mock JSON userAuthRequest");
    assertIncludes(payload.userAuthRequest, "pwsh -NoProfile", "mock JSON userAuthRequest should prefer PowerShell 7 for prompt-password runs");
    assertIncludes(payload.commands?.macHostDiscoveryBoardSummary, "discover-lan-hosts.mjs", "mock JSON Mac discovery command");
    assertIncludes(payload.commands?.macHostDiscoveryBoardSummary, "--noLocalSubnets", "mock JSON Mac discovery command");
    assertIncludes(payload.commands?.macHostDiscoveryBoardSummary, "--host 127.0.0.1", "mock JSON Mac discovery command");
    assertIncludes(payload.commands?.macHostDiscoveryBoardSummary, `--port ${port}`, "mock JSON Mac discovery command");
    assertIncludes(payload.commands?.macHostDiscoveryBoardSummary, "--requireMacHost", "mock JSON Mac discovery command");
    assertIncludes(payload.commands?.macHostDiscoveryBoardSummary, "--boardSummary", "mock JSON Mac discovery command");
    assertIncludes(payload.commands?.macHostDiscoveryPowerShellBoardSummary, "discover-lan-hosts.ps1", "mock JSON Mac discovery PowerShell command");
    assertIncludes(payload.commands?.macHostDiscoveryPowerShellBoardSummary, "-NoLocalSubnets", "mock JSON Mac discovery PowerShell command");
    assertIncludes(payload.commands?.macHostDiscoveryPowerShellBoardSummary, "-HostName 127.0.0.1", "mock JSON Mac discovery PowerShell command");
    assertIncludes(payload.commands?.macHostDiscoveryPowerShellBoardSummary, `-Port ${port}`, "mock JSON Mac discovery PowerShell command");
    assertIncludes(payload.commands?.macHostDiscoveryPowerShellBoardSummary, "-RequireMacHost", "mock JSON Mac discovery PowerShell command");
    assertIncludes(payload.commands?.macHostDiscoveryPowerShellBoardSummary, "-BoardSummary", "mock JSON Mac discovery PowerShell command");
    assertIncludes(payload.commands?.macHostReadinessCommand, "check-mac-host-readiness.mjs", "mock JSON Mac host readiness command");
    assertIncludes(payload.commands?.macHostReadinessCommand, "--host 127.0.0.1", "mock JSON Mac host readiness command");
    assertIncludes(payload.commands?.macHostReadinessCommand, `--port ${port}`, "mock JSON Mac host readiness command");
    assertIncludes(payload.commands?.macHostReadinessCommand, "--checkBoard", "mock JSON Mac host readiness command");
    assertIncludes(payload.commands?.macHostReadinessCommand, "--boardSummary", "mock JSON Mac host readiness command");
    assertIncludes(payload.commands?.macHeartbeatCommand, "check-mac-heartbeat.mjs", "mock JSON Mac heartbeat command");
    assertIncludes(payload.commands?.macHeartbeatCommand, "--host 127.0.0.1", "mock JSON Mac heartbeat command");
    assertIncludes(payload.commands?.macHeartbeatCommand, `--port ${port}`, "mock JSON Mac heartbeat command");
    assertIncludes(payload.commands?.macHeartbeatCommand, "--checkBoard", "mock JSON Mac heartbeat command");
    assertIncludes(payload.commands?.macHeartbeatCommand, "--boardSummary", "mock JSON Mac heartbeat command");
    assertIncludes(payload.commands?.macHeartbeatOnceCommand, "watch-mac-heartbeat.mjs", "mock JSON Mac heartbeat one-shot command");
    assertIncludes(payload.commands?.macHeartbeatOnceCommand, "--once", "mock JSON Mac heartbeat one-shot command");
    assertIncludes(payload.commands?.macHeartbeatOnceCommand, "--sendStatus", "mock JSON Mac heartbeat one-shot command");
    assertIncludes(payload.commands?.macHeartbeatOnceCommand, "--host 127.0.0.1", "mock JSON Mac heartbeat one-shot command");
    assertIncludes(payload.commands?.macHeartbeatOnceCommand, `--port ${port}`, "mock JSON Mac heartbeat one-shot command");
    assertIncludes(payload.commands?.macHeartbeatOnceCommand, "--boardSummary", "mock JSON Mac heartbeat one-shot command");
    assertIncludes(payload.commands?.macHeartbeatWatchCommand, "watch-mac-heartbeat.mjs", "mock JSON Mac heartbeat watcher command");
    assertNotIncludes(payload.commands?.macHeartbeatWatchCommand, "--once", "mock JSON Mac heartbeat watcher command should not be one-shot");
    assertIncludes(payload.commands?.macHeartbeatWatchCommand, "--sendStatus", "mock JSON Mac heartbeat watcher command");
    assertIncludes(payload.commands?.macHeartbeatWatchCommand, "--host 127.0.0.1", "mock JSON Mac heartbeat watcher command");
    assertIncludes(payload.commands?.macHeartbeatWatchCommand, `--port ${port}`, "mock JSON Mac heartbeat watcher command");
    assertIncludes(payload.commands?.macHeartbeatWatchCommand, "--intervalMs 30000", "mock JSON Mac heartbeat watcher command");
    assertIncludes(payload.commands?.macHeartbeatStartCommand, "start-mac-heartbeat-watcher.mjs", "mock JSON Mac heartbeat background start command");
    assertNotIncludes(payload.commands?.macHeartbeatStartCommand, "--status", "mock JSON Mac heartbeat background start command should start by default");
    assertNotIncludes(payload.commands?.macHeartbeatStartCommand, "--stop", "mock JSON Mac heartbeat background start command should start by default");
    assertIncludes(payload.commands?.macHeartbeatStartCommand, "--host 127.0.0.1", "mock JSON Mac heartbeat background start command");
    assertIncludes(payload.commands?.macHeartbeatStartCommand, `--port ${port}`, "mock JSON Mac heartbeat background start command");
    assertIncludes(payload.commands?.macHeartbeatStartCommand, "--intervalMs 30000", "mock JSON Mac heartbeat background start command");
    assertIncludes(payload.commands?.macHeartbeatStartCommand, "--boardSummary", "mock JSON Mac heartbeat background start command");
    assertIncludes(payload.commands?.macHeartbeatStatusCommand, "start-mac-heartbeat-watcher.mjs", "mock JSON Mac heartbeat background status command");
    assertIncludes(payload.commands?.macHeartbeatStatusCommand, "--status", "mock JSON Mac heartbeat background status command");
    assertIncludes(payload.commands?.macHeartbeatStatusCommand, "--host 127.0.0.1", "mock JSON Mac heartbeat background status command");
    assertIncludes(payload.commands?.macHeartbeatStatusCommand, `--port ${port}`, "mock JSON Mac heartbeat background status command");
    assertIncludes(payload.commands?.macHeartbeatStatusCommand, "--boardSummary", "mock JSON Mac heartbeat background status command");
    assertIncludes(payload.commands?.macHeartbeatStopCommand, "start-mac-heartbeat-watcher.mjs", "mock JSON Mac heartbeat background stop command");
    assertIncludes(payload.commands?.macHeartbeatStopCommand, "--stop", "mock JSON Mac heartbeat background stop command");
    assertIncludes(payload.commands?.macHeartbeatStopCommand, "--host 127.0.0.1", "mock JSON Mac heartbeat background stop command");
    assertIncludes(payload.commands?.macHeartbeatStopCommand, `--port ${port}`, "mock JSON Mac heartbeat background stop command");
    assertIncludes(payload.commands?.macHeartbeatStopCommand, "--boardSummary", "mock JSON Mac heartbeat background stop command");
    assertIncludes(payload.commands?.macFormalLocalSmokeCommand, "check-mac-formal-local-smoke.mjs", "mock JSON Mac formal local smoke command");
    assertIncludes(payload.commands?.macFormalLocalSmokeCommand, "--host 127.0.0.1", "mock JSON Mac formal local smoke command");
    assertIncludes(payload.commands?.macFormalLocalSmokeCommand, `--port ${port}`, "mock JSON Mac formal local smoke command");
    assertIncludes(payload.commands?.macFormalLocalSmokeCommand, "--promptPassword", "mock JSON Mac formal local smoke command");
    assertIncludes(payload.commands?.macFormalLocalSmokeCommand, "--boardSummary", "mock JSON Mac formal local smoke command");
    assertNotIncludes(payload.commands?.macFormalLocalSmokeCommand, "--password", "mock JSON Mac formal local smoke command should not include password argv");
    assertIncludes(payload.commands?.macClientDiscoverWindowsCommand, "discover-windows-hosts.mjs", "mock JSON Mac client discover Windows command");
    assertIncludes(payload.commands?.macClientDiscoverWindowsCommand, "--checkBoard", "mock JSON Mac client discover Windows command");
    assertIncludes(payload.commands?.macClientDiscoverWindowsCommand, "--boardSummary", "mock JSON Mac client discover Windows command");
    assertNotIncludes(payload.commands?.macClientDiscoverWindowsCommand, "--password", "mock JSON Mac client discover Windows command should not include password argv");
    assertIncludes(payload.commands?.macClientFormalChecklistCommand, "check-mac-client-formal-status.mjs", "mock JSON Mac client formal checklist command");
    assertIncludes(payload.commands?.macClientFormalChecklistCommand, "--discover", "mock JSON Mac client formal checklist command");
    assertIncludes(payload.commands?.macClientFormalChecklistCommand, "--port 43770", "mock JSON Mac client formal checklist command");
    assertIncludes(payload.commands?.macClientFormalChecklistCommand, "--boardSummary", "mock JSON Mac client formal checklist command");
    assertNotIncludes(payload.commands?.macClientFormalChecklistCommand, "--password", "mock JSON Mac client formal checklist command should not include password argv");
    assertIncludes(payload.commands?.macClientFormalSmokeCommand, "run-mac-client-formal-smoke.mjs", "mock JSON Mac client formal smoke command");
    assertIncludes(payload.commands?.macClientFormalSmokeCommand, "--discover", "mock JSON Mac client formal smoke command");
    assertIncludes(payload.commands?.macClientFormalSmokeCommand, "--ensureClient", "mock JSON Mac client formal smoke command");
    assertIncludes(payload.commands?.macClientFormalSmokeCommand, "--preflightOnly", "mock JSON Mac client formal smoke command");
    assertIncludes(payload.commands?.macClientFormalSmokeCommand, "--boardSummary", "mock JSON Mac client formal smoke command");
    assertNotIncludes(payload.commands?.macClientFormalSmokeCommand, "--password", "mock JSON Mac client formal smoke command should not include password argv");
    assertIncludes(payload.commands?.macUnattendedStatusCommand, "check-mac-unattended-status.mjs", "mock JSON Mac unattended command");
    assertIncludes(payload.commands?.macUnattendedStatusCommand, "--host 127.0.0.1", "mock JSON Mac unattended command");
    assertIncludes(payload.commands?.macUnattendedStatusCommand, `--port ${port}`, "mock JSON Mac unattended command");
    assertIncludes(payload.commands?.macUnattendedStatusCommand, "--boardSummary", "mock JSON Mac unattended command");
    assertIncludes(payload.commands?.macUnattendedFormalStatusCommand, "check-mac-unattended-status.mjs", "mock JSON formal Mac unattended command");
    assertIncludes(payload.commands?.macUnattendedFormalStatusCommand, "--host 127.0.0.1", "mock JSON formal Mac unattended command");
    assertIncludes(payload.commands?.macUnattendedFormalStatusCommand, `--port ${port}`, "mock JSON formal Mac unattended command");
    assertIncludes(payload.commands?.macUnattendedFormalStatusCommand, "--requireLaunchAgentMaxFps", "mock JSON formal Mac unattended command");
    assertIncludes(payload.commands?.macUnattendedFormalStatusCommand, "--requireLaunchAgentLoaded", "mock JSON formal Mac unattended command");
    assertIncludes(payload.commands?.macUnattendedFormalStatusCommand, "--boardSummary", "mock JSON formal Mac unattended command");
    assertIncludes(payload.commands?.formalChecklistBoardSummary, "check-mac-formal-e2e.ps1", "mock JSON formal checklist command");
    assertIncludes(payload.commands?.formalChecklistBoardSummary, "-DiscoverNoLocalSubnets", "mock JSON formal checklist command");
    assertIncludes(payload.commands?.formalChecklistBoardSummary, "-PreflightOnly", "mock JSON formal checklist command");
    assertIncludes(payload.commands?.formalChecklistBoardSummary, "-CheckClientDiagnostics", "mock JSON formal checklist command");
    assertIncludes(payload.commands?.formalChecklistBoardSummary, "-BoardSummary", "mock JSON formal checklist command");
    assertIncludes(payload.commands?.formalChecklistBoardSummary, `-Port ${port}`, "mock JSON formal checklist command");
    assert(payload.formalManualChecklist?.summary === "connection/video/audio/clipboard/input_ack/diagnostics", "PowerShell mock JSON should include manual checklist summary");
    assert(Array.isArray(payload.formalManualChecklist?.ids) && payload.formalManualChecklist.ids.includes("input_ack"), "PowerShell mock JSON manual checklist should include input_ack");
    assertIncludes(payload.commands?.windowsHostMediaReadinessBoardSummary, "check-windows-host-readiness.mjs", "mock JSON media command");
    assertIncludes(payload.commands?.windowsHostMediaReadinessBoardSummary, "--probeMedia", "mock JSON media command");
    assertIncludes(payload.commands?.windowsSecureAuthPath, "start-windows-host.mjs", "mock JSON Windows secure auth path");
    assertIncludes(payload.commands?.windowsSecureAuthPath, "--host 0.0.0.0", "mock JSON Windows secure auth path");
    assertIncludes(payload.commands?.windowsSecureAuthPath, "--port 43770", "mock JSON Windows secure auth path");
    assertIncludes(payload.commands?.windowsSecureAuthPath, "--promptPassword", "mock JSON Windows secure auth path");
    assertIncludes(payload.commands?.windowsSecureAuthPath, "--requirePassword", "mock JSON Windows secure auth path");
    assertNotIncludes(payload.commands?.windowsSecureAuthPath, "--password", "mock JSON Windows secure auth path should not include password argv");
    assertIncludes(payload.commands?.windowsFirewallStatusBoardSummary, "check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --json", "mock JSON Windows firewall status command");
    assertIncludes(payload.commands?.windowsFirewallPreviewBoardSummary, "check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --dryRunRule --ruleProfile Private", "mock JSON Windows firewall preview command");
    assertNotIncludes(payload.commands?.windowsFirewallPreviewBoardSummary, "--addRule", "mock JSON Windows firewall preview command should not change firewall");
    assertIncludes(payload.commands?.windowsHostMediaReadinessPowerShellBoardSummary, "check-windows-host-readiness.ps1", "mock JSON media PowerShell command");
    assertIncludes(payload.commands?.windowsHostMediaReadinessPowerShellBoardSummary, "-ProbeMedia", "mock JSON media PowerShell command");
    assertIncludes(payload.commands?.windowsHostMediaReadinessPowerShellBoardSummary, "-BoardSummary", "mock JSON media PowerShell command");
    assertIncludes(payload.commands?.windowsVideoEncoderSupportBoardSummary, "check-windows-video-encoder-support.mjs", "mock JSON video support command");
    assertIncludes(payload.commands?.windowsVideoEncoderSupportBoardSummary, "--boardSummary", "mock JSON video support command");
    assertIncludes(payload.commands?.windowsVideoEncoderSupportPowerShellBoardSummary, "check-windows-video-encoder-support.ps1", "mock JSON video support PowerShell command");
    assertIncludes(payload.commands?.windowsVideoEncoderSupportPowerShellBoardSummary, "-BoardSummary", "mock JSON video support PowerShell command");
    assertIncludes(payload.commands?.windowsWgcSupportBoardSummary, "check-windows-wgc-support.mjs", "mock JSON WGC command");
    assertIncludes(payload.commands?.windowsWgcSupportBoardSummary, "--boardSummary", "mock JSON WGC command");
    assertIncludes(payload.commands?.windowsWgcSupportPowerShellBoardSummary, "check-windows-wgc-support.ps1", "mock JSON WGC PowerShell command");
    assertIncludes(payload.commands?.windowsWgcSupportPowerShellBoardSummary, "-BoardSummary", "mock JSON WGC PowerShell command");
    assertIncludes(payload.commands?.windowsWgcBenchmarkBoardSummary, "benchmark-windows-wgc-settings.mjs", "mock JSON WGC benchmark command");
    assertIncludes(payload.commands?.windowsWgcBenchmarkBoardSummary, "--profile 60:20000:balanced", "mock JSON WGC benchmark command");
    assertIncludes(payload.commands?.windowsWgcBenchmarkBoardSummary, "--durationMs 1800", "mock JSON WGC benchmark command");
    assertIncludes(payload.commands?.windowsWgcBenchmarkBoardSummary, "--boardSummary", "mock JSON WGC benchmark command");
    assertIncludes(payload.commands?.windowsWgcBenchmarkPowerShellBoardSummary, "benchmark-windows-wgc-settings.ps1", "mock JSON WGC benchmark PowerShell command");
    assertIncludes(payload.commands?.windowsWgcBenchmarkPowerShellBoardSummary, "-Profile 60:20000:balanced", "mock JSON WGC benchmark PowerShell command");
    assertIncludes(payload.commands?.windowsWgcBenchmarkPowerShellBoardSummary, "-DurationMs 1800", "mock JSON WGC benchmark PowerShell command");
    assertIncludes(payload.commands?.windowsWgcBenchmarkPowerShellBoardSummary, "-BoardSummary", "mock JSON WGC benchmark PowerShell command");
    assertIncludes(payload.commands?.windowsWgcH264SourceCompareBoardSummary, "compare-windows-wgc-h264-sources.mjs", "mock JSON WGC compare command");
    assertIncludes(payload.commands?.windowsWgcH264SourceCompareBoardSummary, "--profile 60:20000:balanced", "mock JSON WGC compare command");
    assertIncludes(payload.commands?.windowsWgcH264SourceCompareBoardSummary, "--boardSummary", "mock JSON WGC compare command");
    assertIncludes(payload.commands?.windowsWgcH264SourceComparePowerShellBoardSummary, "compare-windows-wgc-h264-sources.ps1", "mock JSON WGC compare PowerShell command");
    assertIncludes(payload.commands?.windowsWgcH264SourceComparePowerShellBoardSummary, "-Profile 60:20000:balanced", "mock JSON WGC compare PowerShell command");
    assertIncludes(payload.commands?.windowsWgcH264SourceComparePowerShellBoardSummary, "-BoardSummary", "mock JSON WGC compare PowerShell command");
    assertIncludes(payload.commands?.windowsWebCodecsH264BoardSummary, "check-webcodecs-h264-support.mjs", "mock JSON WebCodecs command");
    assertIncludes(payload.commands?.windowsWebCodecsH264BoardSummary, "--requireCodec avc1.42C02A", "mock JSON WebCodecs command");
    assertIncludes(payload.commands?.windowsWebCodecsH264BoardSummary, "--boardSummary", "mock JSON WebCodecs command");
    assertIncludes(payload.commands?.windowsWebCodecsH264PowerShellBoardSummary, "check-webcodecs-h264-support.ps1", "mock JSON WebCodecs PowerShell command");
    assertIncludes(payload.commands?.windowsWebCodecsH264PowerShellBoardSummary, "-RequireCodec avc1.42C02A", "mock JSON WebCodecs PowerShell command");
    assertIncludes(payload.commands?.windowsWebCodecsH264PowerShellBoardSummary, "-BoardSummary", "mock JSON WebCodecs PowerShell command");
    assertIncludes(payload.commands?.windowsPowerShellHelpBoardSummary, "test-windows-powershell-help.mjs", "mock JSON PowerShell help command");
    assertIncludes(payload.commands?.windowsPowerShellHelpBoardSummary, "--timeoutMs 10000", "mock JSON PowerShell help command");
    assertIncludes(payload.commands?.windowsPowerShellHelpBoardSummary, "--boardSummary", "mock JSON PowerShell help command");
    assertIncludes(payload.commands?.windowsPowerShell7HelpBoardSummary, "test-windows-powershell-help.mjs", "mock JSON PowerShell 7 help command");
    assertIncludes(payload.commands?.windowsPowerShell7HelpBoardSummary, "--shell pwsh", "mock JSON PowerShell 7 help command");
    assertIncludes(payload.commands?.windowsPowerShell7HelpBoardSummary, "--boardSummary", "mock JSON PowerShell 7 help command");
    assertIncludes(payload.commands?.windowsReverseControlGrantBoardSummary, "allow-windows-reverse-control.mjs", "mock JSON reverse grant command");
    assertIncludes(payload.commands?.windowsReverseControlGrantBoardSummary, "--host 127.0.0.1", "mock JSON reverse grant command");
    assertIncludes(payload.commands?.windowsReverseControlGrantBoardSummary, "--port 43770", "mock JSON reverse grant command");
    assertIncludes(payload.commands?.windowsReverseControlGrantBoardSummary, "--durationMs 30000", "mock JSON reverse grant command");
    assertIncludes(payload.commands?.windowsReverseControlGrantBoardSummary, "--boardSummary", "mock JSON reverse grant command");
    assertIncludes(payload.commands?.windowsReverseControlGrantPowerShellBoardSummary, "allow-windows-reverse-control.ps1", "mock JSON reverse grant PowerShell command");
    assertIncludes(payload.commands?.windowsReverseControlGrantPowerShellBoardSummary, "-HostName 127.0.0.1", "mock JSON reverse grant PowerShell command");
    assertIncludes(payload.commands?.windowsReverseControlGrantPowerShellBoardSummary, "-Port 43770", "mock JSON reverse grant PowerShell command");
    assertIncludes(payload.commands?.windowsReverseControlGrantPowerShellBoardSummary, "-DurationMs 30000", "mock JSON reverse grant PowerShell command");
    assertIncludes(payload.commands?.windowsReverseControlGrantPowerShellBoardSummary, "-BoardSummary", "mock JSON reverse grant PowerShell command");
    assertIncludes(payload.commands?.windowsReverseGrantStatusBoardSummary, "allow-windows-reverse-control.mjs", "mock JSON reverse grant status command");
    assertIncludes(payload.commands?.windowsReverseGrantStatusBoardSummary, "--status", "mock JSON reverse grant status command");
    assertIncludes(payload.commands?.windowsReverseGrantStatusPowerShellBoardSummary, "allow-windows-reverse-control.ps1", "mock JSON reverse grant status PowerShell command");
    assertIncludes(payload.commands?.windowsReverseGrantStatusPowerShellBoardSummary, "-Status", "mock JSON reverse grant status PowerShell command");
    assertIncludes(payload.commands?.windowsOpenOneTimeReverseGrantBoardSummary, "allow-windows-reverse-control.mjs", "mock JSON one-time reverse grant command");
    assertIncludes(payload.commands?.windowsOpenOneTimeReverseGrantBoardSummary, "--grant", "mock JSON one-time reverse grant command");
    assertIncludes(payload.commands?.windowsOpenOneTimeReverseGrantBoardSummary, "--durationMs 30000", "mock JSON one-time reverse grant command");
    assertIncludes(payload.commands?.windowsOpenOneTimeReverseGrantPowerShellBoardSummary, "allow-windows-reverse-control.ps1", "mock JSON one-time reverse grant PowerShell command");
    assertIncludes(payload.commands?.windowsOpenOneTimeReverseGrantPowerShellBoardSummary, "-Grant", "mock JSON one-time reverse grant PowerShell command");
    assertIncludes(payload.commands?.windowsOpenOneTimeReverseGrantPowerShellBoardSummary, "-DurationMs 30000", "mock JSON one-time reverse grant PowerShell command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsCommand, "test-windows-client-browser.mjs", "mock JSON client diagnostics command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsCommand, "--diagnosticsOnly", "mock JSON client diagnostics command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsCommand, "--boardSummary", "mock JSON client diagnostics command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsCommand, "--discoverNoLocalSubnets", "mock JSON client diagnostics command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsCommand, `--port ${port}`, "mock JSON client diagnostics command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsCommand, "--clientPort 5197", "mock JSON client diagnostics command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsCommand, "--debugPort 9337", "mock JSON client diagnostics command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsAlternateCommand, "--clientPort 5200", "mock JSON alternate client diagnostics command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsAlternateCommand, "--debugPort 9340", "mock JSON alternate client diagnostics command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsPowerShellCommand, "test-windows-client-browser.ps1", "mock JSON client diagnostics PowerShell command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsPowerShellCommand, "-DiagnosticsOnly", "mock JSON client diagnostics PowerShell command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsPowerShellCommand, "-BoardSummary", "mock JSON client diagnostics PowerShell command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsPowerShellCommand, "-DiscoverNoLocalSubnets", "mock JSON client diagnostics PowerShell command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsPowerShellCommand, `-Port ${port}`, "mock JSON client diagnostics PowerShell command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsPowerShellCommand, "-ClientPort 5197", "mock JSON client diagnostics PowerShell command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsPowerShellCommand, "-DebugPort 9337", "mock JSON client diagnostics PowerShell command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsAlternatePowerShellCommand, "-ClientPort 5200", "mock JSON alternate client diagnostics PowerShell command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsAlternatePowerShellCommand, "-DebugPort 9340", "mock JSON alternate client diagnostics PowerShell command");
    assertIncludes(payload.commands?.windowsClientCopyDiagnosticsAction, "复制诊断", "mock JSON copy diagnostics action");
    assertIncludes(payload.commands?.windowsClientCopyDiagnosticsAction, "快速摘要", "mock JSON copy diagnostics action");
    assertIncludes(payload.commands?.windowsMacAlertWatcherStart, "start-mac-alert-watcher.ps1", "mock JSON alert watcher start command");
    assertIncludes(payload.commands?.windowsMacAlertWatcherStart, "-Server http://192.168.31.68:17888", "mock JSON alert watcher start command");
    assert(!String(payload.commands?.windowsMacAlertWatcherStart || "").includes("-Status"), "mock JSON alert watcher start command should not be status-only");
    assertIncludes(payload.commands?.windowsMacAlertWatcherStatus, "start-mac-alert-watcher.ps1", "mock JSON alert watcher status command");
    assertIncludes(payload.commands?.windowsMacAlertWatcherStatus, "-Server http://192.168.31.68:17888", "mock JSON alert watcher status command");
    assertIncludes(payload.commands?.windowsMacAlertWatcherStatus, "-Status", "mock JSON alert watcher status command");
    assert(payload.windowsMacAlertWatcher?.requested === true, "PowerShell mock JSON should check Windows Mac alert watcher status");
    assert(payload.windowsMacAlertWatcher?.command === payload.commands?.windowsMacAlertWatcherStatus, "PowerShell watcher status should report the same status command");
    assert(payload.windowsMacAlertWatcher?.source === "json", "PowerShell watcher status should consume start-mac-alert-watcher -Json output");
    assert(payload.windowsMacAlertWatcher?.payload?.action === "status", "PowerShell watcher status should expose parsed JSON payload");
    assert(payload.windowsMacAlertWatcher?.parseError === "", "PowerShell watcher status JSON parse should not fail");
    assert(["running", "not-running", "unknown", "unavailable"].includes(payload.windowsMacAlertWatcher?.state), "PowerShell watcher status should have a stable state");
    assert(payload.windowsMacAlertWatcher?.running === true || payload.windowsMacAlertWatcher?.running === false || payload.windowsMacAlertWatcher?.running === null, "PowerShell watcher running should be boolean or null");
    assertNotIncludes(output, "test-password", "PowerShell mock JSON");
    console.log("[OK] PowerShell resume-status wrapper supports mock JSON discovery");
  });
}

async function checkCustomClientDiagnosticsPorts(args) {
  await withMockHost(async (port) => {
    const fakePorts = JSON.stringify({
      owners: [
        {
          localAddress: "127.0.0.1",
          localPort: 5200,
          state: "Listen",
          owningProcess: 61088,
          processName: "node.exe",
          commandLine: "node.exe apps/windows-client/server.mjs 5200",
        },
        {
          localAddress: "::1",
          localPort: 9340,
          state: "Listen",
          owningProcess: 44488,
          processName: "msedge.exe",
          commandLine: "msedge.exe --remote-debugging-port=9340 --user-data-dir=C:\\Temp\\lan-dual-edge-pwsh",
        },
      ],
    });
    const result = await runPowerShell([
      "-Discover",
      "-DiscoverNoLocalSubnets",
      "-HostName", "127.0.0.1",
      "-Port", String(port),
      "-ClientPort", "5200",
      "-DebugPort", "9340",
      "-AlternateClientPort", "5201",
      "-AlternateDebugPort", "9341",
      "-Json",
      "-AllowMockVideo",
      "-SkipAudio",
      "-SkipClipboard",
      "-SkipInputLog",
    ], args, {
      LAN_DUAL_FAKE_WINDOWS_CLIENT_PORTS_JSON: fakePorts,
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert(result.exitCode === 0, `PowerShell custom client ports JSON failed\n${output}`);
    const payload = JSON.parse(result.stdout);
    assert(payload.args?.clientPort === 5200, "PowerShell custom ports should reach Node args clientPort");
    assert(payload.args?.debugPort === 9340, "PowerShell custom ports should reach Node args debugPort");
    assert(payload.args?.alternateClientPort === 5201, "PowerShell custom ports should reach Node args alternateClientPort");
    assert(payload.args?.alternateDebugPort === 9341, "PowerShell custom ports should reach Node args alternateDebugPort");
    assertIncludes(payload.macPreflight?.command, "--clientPort 5201", "PowerShell custom ports formal preflight command should prefer alternate page port");
    assertIncludes(payload.macPreflight?.command, "--debugPort 9341", "PowerShell custom ports formal preflight command should prefer alternate debug port");
    assert(payload.windowsClientDiagnosticsPorts?.state === "occupied-stale-diagnostics", "PowerShell custom ports should detect stale diagnostics occupancy");
    assert(payload.windowsClientDiagnosticsPorts?.ownerSummary === "5200:node.exe:61088,9340:msedge.exe:44488", `PowerShell custom ports owner summary mismatch: ${payload.windowsClientDiagnosticsPorts?.ownerSummary}`);
    assertIncludes(payload.boardSummary, "WinClientPorts=occupied(5200,9340;stale-diagnostics)", "PowerShell custom ports board summary");
    assertIncludes(payload.boardSummary, "WinClientPortsNext=use --clientPort 5201 --debugPort 9341", "PowerShell custom ports board summary");
    assertIncludes(payload.boardSummary, "WinClientPortsOwners=5200:node.exe:61088,9340:msedge.exe:44488", "PowerShell custom ports board summary should include safe owner summary");
    assertNotIncludes(payload.boardSummary, "apps/windows-client/server.mjs", "PowerShell custom ports board summary should not include process command line");
    assertNotIncludes(payload.boardSummary, "user-data-dir", "PowerShell custom ports board summary should not include browser command line");
    assertIncludes(payload.boardSummary, "Next=pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-mac-formal-e2e.ps1", "PowerShell custom ports board summary should prefer PowerShell 7 for Next");
    assertIncludes(payload.boardSummary, "-ClientPort 5201 -DebugPort 9341 -PromptPassword", "PowerShell custom ports board summary should prefer alternate ports for prompt Next");
    assertIncludes(payload.boardSummary, "-ClientPort 5201 -DebugPort 9341 -PreflightOnly -CheckClientDiagnostics -BoardSummary", "PowerShell custom ports board summary should prefer alternate ports for formal checklist");
    assertIncludes(payload.commands?.preflightBoardSummary, "-ClientPort 5201 -DebugPort 9341", "PowerShell custom ports preflight board command should prefer alternate ports");
    assertIncludes(payload.commands?.userAuthRequest, "-ClientPort 5201 -DebugPort 9341", "PowerShell custom ports user auth request should prefer alternate ports");
    assertIncludes(payload.commands?.formalChecklistBoardSummary, "-ClientPort 5201 -DebugPort 9341", "PowerShell custom ports formal checklist should prefer alternate ports");
    assertIncludes(payload.commands?.formalRun, "-ClientPort 5201 -DebugPort 9341", "PowerShell custom ports formal run should prefer alternate ports");
    assertIncludes(payload.commands?.windowsClientDiagnosticsCommand, "--clientPort 5200 --debugPort 9340", "PowerShell custom ports client diagnostics command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsAlternateCommand, "--clientPort 5201 --debugPort 9341", "PowerShell custom ports alternate diagnostics command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsPowerShellCommand, "-ClientPort 5200 -DebugPort 9340", "PowerShell custom ports client diagnostics PowerShell command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsAlternatePowerShellCommand, "-ClientPort 5201 -DebugPort 9341", "PowerShell custom ports alternate diagnostics PowerShell command");
    assertNotIncludes(output, "test-password", "PowerShell custom client ports JSON");
    console.log("[OK] PowerShell resume-status wrapper forwards custom client diagnostics ports");
  });
}

async function checkBoardSummary(args) {
  await withMockHost(async (port) => {
    const result = await runPowerShell([
      "-Discover",
      "-DiscoverNoLocalSubnets",
      "-HostName", "127.0.0.1",
      "-Port", String(port),
      "-BoardSummary",
      "-AllowMockVideo",
      "-SkipAudio",
      "-SkipClipboard",
      "-SkipInputLog",
    ], args, freeWindowsClientPortsEnv);
    const output = `${result.stdout}\n${result.stderr}`;
    assert(result.exitCode === 0, `PowerShell board summary failed\n${output}`);
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    assert(lines.length === 1, `board summary should be one line, got ${lines.length}`);
    assertIncludes(output, "mac=ready", "PowerShell board summary");
    assertIncludes(output, "WinClientPorts=", "PowerShell board summary");
    assertIncludes(output, "WinClientPortsNext=", "PowerShell board summary");
    assertIncludes(output, "MacDiscovery=", "PowerShell board summary");
    assertIncludes(output, "discover-lan-hosts.mjs --noLocalSubnets --host 127.0.0.1", "PowerShell board summary");
    assertIncludes(output, "--requireMacHost --boardSummary", "PowerShell board summary");
    assertIncludes(output, "MacDiscoveryPs=", "PowerShell board summary");
    assertIncludes(output, "discover-lan-hosts.ps1 -NoLocalSubnets -HostName 127.0.0.1", "PowerShell board summary");
    assertIncludes(output, "-RequireMacHost -BoardSummary", "PowerShell board summary");
    assertIncludes(output, "MacHostReadiness=", "PowerShell board summary");
    assertIncludes(output, "check-mac-host-readiness.mjs --host 127.0.0.1", "PowerShell board summary");
    assertIncludes(output, `--port ${port} --checkBoard --boardSummary`, "PowerShell board summary");
    assertIncludes(output, "MacHeartbeat=", "PowerShell board summary");
    assertIncludes(output, `check-mac-heartbeat.mjs --host 127.0.0.1 --port ${port}`, "PowerShell board summary");
    assertIncludes(output, "MacHeartbeatOnce=", "PowerShell board summary");
    assertIncludes(output, `watch-mac-heartbeat.mjs --once --sendStatus --host 127.0.0.1 --port ${port}`, "PowerShell board summary");
    assertIncludes(output, "MacHeartbeatWatch=", "PowerShell board summary");
    assertIncludes(output, `watch-mac-heartbeat.mjs --sendStatus --host 127.0.0.1 --port ${port}`, "PowerShell board summary");
    assertIncludes(output, "--intervalMs 30000", "PowerShell board summary");
    assertIncludes(output, "MacHeartbeatStart=", "PowerShell board summary");
    assertIncludes(output, `start-mac-heartbeat-watcher.mjs --host 127.0.0.1 --port ${port}`, "PowerShell board summary");
    assertIncludes(output, "MacHeartbeatStatus=", "PowerShell board summary");
    assertIncludes(output, `start-mac-heartbeat-watcher.mjs --status --host 127.0.0.1 --port ${port}`, "PowerShell board summary");
    assertIncludes(output, "MacHeartbeatStop=", "PowerShell board summary");
    assertIncludes(output, `start-mac-heartbeat-watcher.mjs --stop --host 127.0.0.1 --port ${port}`, "PowerShell board summary");
    assertIncludes(output, "MacFormalLocalSmoke=", "PowerShell board summary");
    assertIncludes(output, `check-mac-formal-local-smoke.mjs --host 127.0.0.1 --port ${port} --promptPassword --boardSummary`, "PowerShell board summary");
    assertNotIncludes(output, "--password", "PowerShell board summary Mac formal local smoke should not include password argv");
    assertIncludes(output, "MacClientDiscoverWindows=", "PowerShell board summary");
    assertIncludes(output, "discover-windows-hosts.mjs --checkBoard --boardSummary", "PowerShell board summary");
    assertIncludes(output, "MacClientFormalChecklist=", "PowerShell board summary");
    assertIncludes(output, "check-mac-client-formal-status.mjs --discover --port 43770 --boardSummary", "PowerShell board summary");
    assertIncludes(output, "MacClientFormalSmoke=", "PowerShell board summary");
    assertIncludes(output, "run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary", "PowerShell board summary");
    assertIncludes(output, "MacUnattended=", "PowerShell board summary");
    assertIncludes(output, "check-mac-unattended-status.mjs --host 127.0.0.1", "PowerShell board summary");
    assertIncludes(output, `--port ${port} --boardSummary`, "PowerShell board summary");
    assertIncludes(output, "MacUnattendedFormal=", "PowerShell board summary");
    assertIncludes(output, `--port ${port} --requireLaunchAgentMaxFps --requireLaunchAgentLoaded --boardSummary`, "PowerShell board summary");
    assertIncludes(output, "FormalChecklist=", "PowerShell board summary");
    assertIncludes(output, "check-mac-formal-e2e.ps1 -Discover -DiscoverNoLocalSubnets", "PowerShell board summary");
    assertIncludes(output, "ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics", "PowerShell board summary");
    assertIncludes(output, "WinClientDiagnostics=", "PowerShell board summary");
    assertIncludes(output, "test-windows-client-browser.mjs --discover --discoverNoLocalSubnets", "PowerShell board summary");
    assertIncludes(output, "--clientPort 5197 --debugPort 9337", "PowerShell board summary");
    assertIncludes(output, "--diagnosticsOnly --boardSummary --timeoutMs 45000", "PowerShell board summary");
    assertIncludes(output, "WinClientDiagnosticsPs=", "PowerShell board summary");
    assertIncludes(output, "test-windows-client-browser.ps1 -Discover -DiscoverNoLocalSubnets", "PowerShell board summary");
    assertIncludes(output, "-ClientPort 5197 -DebugPort 9337", "PowerShell board summary");
    assertIncludes(output, "-DiagnosticsOnly -BoardSummary -TimeoutMs 45000", "PowerShell board summary");
    assertIncludes(output, "WinClientDiagnosticsAlt=", "PowerShell board summary");
    assertIncludes(output, "--clientPort 5200 --debugPort 9340", "PowerShell board summary");
    assertIncludes(output, "WinClientDiagnosticsAltPs=", "PowerShell board summary");
    assertIncludes(output, "-ClientPort 5200 -DebugPort 9340", "PowerShell board summary");
    assertIncludes(output, "CopyDiagnostics=Windows 控制端事件面板点击", "PowerShell board summary");
    assertIncludes(output, "快速摘要", "PowerShell board summary");
    assertIncludes(output, "WindowsHostMedia=", "PowerShell board summary");
    assertIncludes(output, "check-windows-host-readiness.mjs --checkBoard --probeMedia --boardSummary", "PowerShell board summary");
    assertIncludes(output, "WindowsHostMediaPs=", "PowerShell board summary");
    assertIncludes(output, "check-windows-host-readiness.ps1 -CheckBoard -ProbeMedia -BoardSummary", "PowerShell board summary");
    assertIncludes(output, "WindowsVideoSupport=", "PowerShell board summary");
    assertIncludes(output, "check-windows-video-encoder-support.mjs --boardSummary", "PowerShell board summary");
    assertIncludes(output, "WindowsVideoSupportPs=", "PowerShell board summary");
    assertIncludes(output, "check-windows-video-encoder-support.ps1 -BoardSummary", "PowerShell board summary");
    assertIncludes(output, "WindowsWgcSupport=", "PowerShell board summary");
    assertIncludes(output, "check-windows-wgc-support.mjs --boardSummary", "PowerShell board summary");
    assertIncludes(output, "WindowsWgcSupportPs=", "PowerShell board summary");
    assertIncludes(output, "check-windows-wgc-support.ps1 -BoardSummary", "PowerShell board summary");
    assertIncludes(output, "WindowsWgcBenchmark=", "PowerShell board summary");
    assertIncludes(output, "benchmark-windows-wgc-settings.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary", "PowerShell board summary");
    assertIncludes(output, "WindowsWgcBenchmarkPs=", "PowerShell board summary");
    assertIncludes(output, "benchmark-windows-wgc-settings.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary", "PowerShell board summary");
    assertIncludes(output, "WindowsWgcCompare=", "PowerShell board summary");
    assertIncludes(output, "compare-windows-wgc-h264-sources.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary", "PowerShell board summary");
    assertIncludes(output, "WindowsWgcComparePs=", "PowerShell board summary");
    assertIncludes(output, "compare-windows-wgc-h264-sources.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary", "PowerShell board summary");
    assertIncludes(output, "WindowsWebCodecs=", "PowerShell board summary");
    assertIncludes(output, "check-webcodecs-h264-support.mjs --requireCodec avc1.42C02A --boardSummary", "PowerShell board summary");
    assertIncludes(output, "WindowsWebCodecsPs=", "PowerShell board summary");
    assertIncludes(output, "check-webcodecs-h264-support.ps1 -RequireCodec avc1.42C02A -BoardSummary", "PowerShell board summary");
    assertIncludes(output, "PowerShellHelp=", "PowerShell board summary");
    assertIncludes(output, "test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary", "PowerShell board summary");
    assertIncludes(output, "PowerShellHelpPwsh=", "PowerShell board summary");
    assertIncludes(output, "test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary", "PowerShell board summary");
    assertIncludes(output, "WindowsReverseGrantStatus=", "PowerShell board summary");
    assertIncludes(output, "allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Status -BoardSummary", "PowerShell board summary");
    assertIncludes(output, "WindowsOpenOneTimeReverseGrant=", "PowerShell board summary");
    assertIncludes(output, "allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Grant -DurationMs 30000 -BoardSummary", "PowerShell board summary");
    assertIncludes(output, "WindowsReverseGrantStatusNodeFallback=", "PowerShell board summary");
    assertIncludes(output, "allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --status --boardSummary", "PowerShell board summary");
    assertIncludes(output, "WindowsOpenOneTimeReverseGrantNodeFallback=", "PowerShell board summary");
    assertIncludes(output, "allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --grant --durationMs 30000 --boardSummary", "PowerShell board summary");
    assertIncludes(output, "WindowsSecureAuthPath=", "PowerShell board summary");
    assertIncludes(output, "start-windows-host.mjs --host 0.0.0.0 --port 43770 --promptPassword --requirePassword", "PowerShell board summary");
    assertIncludes(output, "WindowsFirewallStatus=", "PowerShell board summary");
    assertIncludes(output, "check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --json", "PowerShell board summary");
    assertIncludes(output, "WindowsFirewallPreview=", "PowerShell board summary");
    assertIncludes(output, "check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --dryRunRule --ruleProfile Private", "PowerShell board summary");
    assertNotIncludes(output, "--addRule", "PowerShell board summary");
    assertIncludes(output, "ReverseGrant=", "PowerShell board summary");
    assertIncludes(output, "allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --durationMs 30000 --boardSummary", "PowerShell board summary");
    assertIncludes(output, "ReverseGrantPs=", "PowerShell board summary");
    assertIncludes(output, "allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -DurationMs 30000 -BoardSummary", "PowerShell board summary");
    assertIncludes(output, "No password was requested or sent", "PowerShell board summary");
    assertNotIncludes(output, "test-password", "PowerShell board summary");
    console.log("[OK] PowerShell resume-status wrapper prints one-line board summary");
  });
}

async function checkBoardCurrentCallSummary(args) {
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-BoardSummary",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell currentCall board summary failed\n${output}`);
      assertIncludes(output, "call=CALLING Mac Codex->Windows Codex", "PowerShell currentCall board summary");
      assertIncludes(output, "正式 Windows host 验收", "PowerShell currentCall board summary");
      assertNotIncludes(output, "test-password", "PowerShell currentCall board summary");
      console.log("[OK] PowerShell resume-status wrapper includes active Agent Link currentCall");
    }, {
      currentCall: macCallForWindows(),
    });
  });
}

async function checkBoardCurrentCallJson(args) {
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-Json",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell currentCall JSON failed\n${output}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.source === "api-state", "PowerShell currentCall should be read from Agent Link Board /api/state");
      assert(payload.board?.currentCall?.active === true, "PowerShell currentCall JSON should mark call active");
      assert(payload.board?.currentCall?.needsWindows === true, "PowerShell currentCall JSON should mark Windows need");
      assertIncludes(payload.boardSummary, "call=CALLING Mac Codex->Windows Codex", "PowerShell currentCall JSON board summary");
      assertIncludes(payload.boardSummary, "正式 Windows host 验收", "PowerShell currentCall JSON board summary");
      assertNotIncludes(output, "test-password", "PowerShell currentCall JSON");
      console.log("[OK] PowerShell resume-status wrapper reads Agent Link currentCall from /api/state");
    }, {
      currentCall: macCallForWindows(),
    });
  });
}

async function checkSecureAuthCallNextSummary(args) {
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-Json",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell secure-auth currentCall JSON failed\n${output}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.currentCall?.active === true, "PowerShell secure-auth currentCall should be active");
      assert(payload.board?.currentCall?.secureAuthPathReady === true, "PowerShell secure-auth currentCall should be marked ready after WindowsSecureAuthPath is available");
      assert(payload.board?.currentCall?.next === "mac-confirm-secure-auth-path", "PowerShell secure-auth currentCall should tell Mac to confirm the safe path");
      assertIncludes(payload.boardSummary, "AgentCallNext=mac-confirm-secure-auth-path", "PowerShell secure-auth board summary");
      assertIncludes(payload.boardSummary, "WindowsSecureAuthPath=node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port 43770 --promptPassword --requirePassword", "PowerShell secure-auth board summary");
      assertNotIncludes(output, "secret-value", "PowerShell secure-auth currentCall JSON should not leak secrets");
      console.log("[OK] PowerShell resume-status wrapper marks secure-auth currentCall ready");
    }, {
      currentCall: secureAuthMacCallForWindows(),
    });
  });
}

async function checkBoardMacHeartbeatHealthExtraction(args) {
  const okCheckedAt = new Date(Date.now() - 20_000).toISOString();
  const blockedCheckedAt = new Date(Date.now() - 25_000).toISOString();
  const olderBlockedCheckedAt = new Date(Date.now() - 90_000).toISOString();
  const currentCodexCheckedAt = new Date(Date.now() - 15_000).toISOString();
  const currentCodexUpdatedAt = new Date(Date.now() - 30_000).toISOString();

  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-Json",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell MacHeartbeatHealth ok JSON failed\n${output}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.macHeartbeatHealth?.found === true, "PowerShell MacHeartbeatHealth ok should be found");
      assert(payload.board.macHeartbeatHealth.status === "ok", "PowerShell MacHeartbeatHealth ok status mismatch");
      assert(payload.board.macHeartbeatHealth.reason === "ok", "PowerShell MacHeartbeatHealth ok reason mismatch");
      assert(payload.board.macHeartbeatHealth.checkedAt === okCheckedAt, "PowerShell MacHeartbeatHealth ok checkedAt mismatch");
      assert(payload.board.macHeartbeatHealth.blockers.length === 0, "PowerShell MacHeartbeatHealth ok should not include blockers");
      assert(payload.board.macHeartbeatHealth.warnings.length === 0, "PowerShell MacHeartbeatHealth ok should not include warnings");
      assert(payload.board.macHeartbeatHealth.rejectedCount >= 2, "PowerShell unsafe MacHeartbeatHealth candidates should be rejected");
      assertIncludes(payload.boardSummary, `MacHeartbeatHealth=ok checkedAt=${okCheckedAt} reason=ok blockers=none warnings=none.`, "PowerShell MacHeartbeatHealth ok board summary");
      assertNotIncludes(output, "secret-value", "PowerShell MacHeartbeatHealth ok JSON should not leak rejected candidates");
    }, {
      statuses: {
        "Mac Heartbeat": {
          role: "Mac heartbeat watcher",
          status: "online",
          note: `MacHeartbeatHealth=ok checked=20s checkedAt=${okCheckedAt} reason=ok blockers=none warnings=none`,
        },
      },
      events: [
        {
          type: "message",
          from: "Mac Codex",
          text: "MacHeartbeatHealth=failed reason=secret-value blockers=secret-value warnings=none",
        },
        {
          type: "status",
          from: "Mac Heartbeat",
          text: "MacHeartbeatHealth=$(whoami) reason=ok blockers=none warnings=none",
        },
      ],
    });

    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-Json",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell MacHeartbeatHealth current status JSON failed\n${output}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.macHeartbeatHealth?.found === true, "PowerShell current MacHeartbeatHealth should be found");
      assert(payload.board.macHeartbeatHealth.status === "ok", "PowerShell current MacHeartbeatHealth status without checkedAt should win over older event");
      assert(payload.board.macHeartbeatHealth.checkedAt === "", "PowerShell current MacHeartbeatHealth should preserve missing checkedAt");
      assert(payload.board?.macCodexHealth?.found === true, "PowerShell current MacCodexHealth should be found");
      assert(payload.board.macCodexHealth.status === "ok", "PowerShell current MacCodexHealth status mismatch");
      assert(payload.board.macCodexHealth.reason === "ok", "PowerShell current MacCodexHealth reason mismatch");
      assert(payload.board.macCodexHealth.codexStatus === "coding", "PowerShell current MacCodexHealth codexStatus mismatch");
      assert(payload.board.macCodexHealth.updatedAt === currentCodexUpdatedAt, "PowerShell current MacCodexHealth updatedAt mismatch");
      assert(payload.board.macCodexHealth.ageMs === 15000, "PowerShell current MacCodexHealth ageMs mismatch");
      assert(payload.board.macCodexHealth.thresholdMs === 300000, "PowerShell current MacCodexHealth thresholdMs mismatch");
      assert(payload.board.macCodexHealth.checkedAt === currentCodexCheckedAt, "PowerShell current MacCodexHealth checkedAt mismatch");
      assertIncludes(payload.boardSummary, "MacHeartbeatHealth=ok reason=ok blockers=none warnings=none.", "PowerShell current MacHeartbeatHealth board summary");
      assertIncludes(payload.boardSummary, `MacCodexHealth=ok checkedAt=${currentCodexCheckedAt} reason=ok codexStatus=coding updatedAt=${currentCodexUpdatedAt} ageMs=15000 thresholdMs=300000 blockers=none warnings=none.`, "PowerShell current MacCodexHealth board summary");
      assertNotIncludes(payload.boardSummary, "mac-codex-stale", "PowerShell current MacHeartbeatHealth board summary should not use older event");
    }, {
      statuses: {
        "Mac Heartbeat": {
          role: "Mac heartbeat watcher",
          status: "online",
          note: `MacHeartbeatHealth=ok reason=ok blockers=none warnings=none MacCodexHealth=ok reason=ok codexStatus=coding updatedAt=${currentCodexUpdatedAt} ageMs=15000 thresholdMs=300000 checkedAt=${currentCodexCheckedAt}`,
        },
      },
      events: [
        {
          type: "status",
          from: "Mac Heartbeat",
          text: `MacHeartbeatHealth=blocked checkedAt=${olderBlockedCheckedAt} reason=mac-codex-stale blockers=mac-codex-stale warnings=none MacCodexHealth=blocked checkedAt=${olderBlockedCheckedAt} reason=mac-codex-stale blockers=mac-codex-stale warnings=none`,
        },
      ],
    });

    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-BoardSummary",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell MacHeartbeatHealth blocked board summary failed\n${output}`);
      assertIncludes(output, `MacHeartbeatHealth=blocked checkedAt=${blockedCheckedAt} reason=mac-codex-stale blockers=mac-codex-stale warnings=none.`, "PowerShell MacHeartbeatHealth blocked board summary");
      assertIncludes(output, `MacCodexHealth=blocked checkedAt=${blockedCheckedAt} reason=mac-codex-stale blockers=mac-codex-stale warnings=none.`, "PowerShell MacCodexHealth blocked board summary");
      assertIncludes(output, "MacCodexStaleAction=status=blocked reason=mac-codex-stale next=RefreshAgentLinkBoardOrCallMacCodex", "PowerShell MacCodexStaleAction board summary");
      assertIncludes(output, "MacCodexStaleCall=node scripts/codex-link-client.mjs", "PowerShell MacCodexStaleAction call command");
      assertNotIncludes(output, "secret-value", "PowerShell MacHeartbeatHealth blocked board summary should not leak rejected candidates");
    }, {
      statuses: {
        "Mac Heartbeat": {
          role: "Mac heartbeat watcher",
          status: "blocked",
          note: `MacHeartbeatHealth=status=blocked checked=25s checkedAt=${blockedCheckedAt} reason=mac-codex-stale blockers=mac-codex-stale warnings=none MacCodexHealth=status=blocked checked=25s checkedAt=${blockedCheckedAt} reason=mac-codex-stale blockers=mac-codex-stale warnings=none`,
        },
      },
      events: [
        {
          type: "message",
          from: "Mac Codex",
          text: "MacHeartbeatHealth=warning reason=secret-value --password secret-value blockers=none warnings=none MacCodexHealth=warning reason=secret-value --password secret-value blockers=none warnings=none",
        },
      ],
    });

    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell MacHeartbeatHealth human output failed\n${output}`);
      assertIncludes(output, `MacHeartbeatHealth=blocked checkedAt=${blockedCheckedAt} reason=mac-codex-stale blockers=mac-codex-stale warnings=none`, "PowerShell MacHeartbeatHealth human output");
      assertIncludes(output, `MacCodexHealth=blocked checkedAt=${blockedCheckedAt} reason=mac-codex-stale blockers=mac-codex-stale warnings=none`, "PowerShell MacCodexHealth human output");
      assertIncludes(output, "MacCodexStaleAction=status=blocked reason=mac-codex-stale", "PowerShell MacCodexStaleAction human output");
      assertNotIncludes(output, "secret-value", "PowerShell MacHeartbeatHealth human output should not leak rejected candidates");
      console.log("[OK] PowerShell resume status extracts Mac heartbeat health from Agent Link Board safely");
    }, {
      statuses: {
        "Mac Heartbeat": {
          role: "Mac heartbeat watcher",
          status: "blocked",
          note: `MacHeartbeatHealth=status=blocked checked=25s checkedAt=${blockedCheckedAt} reason=mac-codex-stale blockers=mac-codex-stale warnings=none MacCodexHealth=status=blocked checked=25s checkedAt=${blockedCheckedAt} reason=mac-codex-stale blockers=mac-codex-stale warnings=none`,
        },
      },
    });
  });
}

async function checkBoardMacPowerAndUnattendedHealthExtraction(args) {
  const powerCheckedAt = new Date(Date.now() - 30_000).toISOString();
  const unattendedCheckedAt = new Date(Date.now() - 35_000).toISOString();
  const olderPowerCheckedAt = new Date(Date.now() - 120_000).toISOString();

  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-Json",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell MacPowerHealth/MacUnattendedHealth JSON failed\n${output}`);
      const payload = JSON.parse(result.stdout);

      assert(payload.board?.macPowerHealth?.found === true, "PowerShell MacPowerHealth should be found");
      assert(payload.board.macPowerHealth.status === "warning", "PowerShell MacPowerHealth status mismatch");
      assert(payload.board.macPowerHealth.reason === "system-sleep-enabled", "PowerShell MacPowerHealth reason mismatch");
      assert(payload.board.macPowerHealth.checkedAt === powerCheckedAt, "PowerShell MacPowerHealth checkedAt mismatch");
      assert(payload.board.macPowerHealth.blockers.length === 0, "PowerShell MacPowerHealth should not include blockers");
      assert(payload.board.macPowerHealth.warnings.join(",") === "system-sleep-enabled,display-sleep-enabled", "PowerShell MacPowerHealth warnings mismatch");
      assert(payload.board.macPowerHealth.rejectedCount >= 1, "PowerShell unsafe MacPowerHealth candidates should be rejected");

      assert(payload.board?.macUnattendedHealth?.found === true, "PowerShell MacUnattendedHealth should be found");
      assert(payload.board.macUnattendedHealth.status === "warning", "PowerShell MacUnattendedHealth status mismatch");
      assert(payload.board.macUnattendedHealth.reason === "launch-agent-not-loaded", "PowerShell MacUnattendedHealth reason mismatch");
      assert(payload.board.macUnattendedHealth.checkedAt === unattendedCheckedAt, "PowerShell MacUnattendedHealth checkedAt mismatch");
      assert(payload.board.macUnattendedHealth.blockers.length === 0, "PowerShell MacUnattendedHealth should not include blockers");
      assert(payload.board.macUnattendedHealth.warnings.join(",") === "launch-agent-not-loaded,power", "PowerShell MacUnattendedHealth warnings mismatch");
      assert(payload.board.macUnattendedHealth.rejectedCount >= 2, "PowerShell unsafe MacUnattendedHealth candidates should be rejected");

      assertIncludes(payload.boardSummary, `MacPowerHealth=warning checkedAt=${powerCheckedAt} reason=system-sleep-enabled blockers=none warnings=system-sleep-enabled,display-sleep-enabled.`, "PowerShell MacPowerHealth board summary");
      assertIncludes(payload.boardSummary, `MacUnattendedHealth=warning checkedAt=${unattendedCheckedAt} reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded,power.`, "PowerShell MacUnattendedHealth board summary");
      assertNotIncludes(output, "secret-value", "PowerShell Mac power/unattended health JSON should not leak rejected candidates");
      assertNotIncludes(payload.boardSummary, "network-wake-disabled", "PowerShell current MacPowerHealth status should win over older event");
    }, {
      statuses: {
        "Mac Heartbeat": {
          role: "Mac heartbeat watcher",
          status: "online",
          note: [
            "MacHeartbeatHealth=ok reason=ok blockers=none warnings=none",
            `MacPowerHealth=warning reason=system-sleep-enabled warnings=system-sleep-enabled,display-sleep-enabled checkedAt=${powerCheckedAt}.`,
            "MacPowerPlan=node scripts/mac/plan-mac-power-settings.mjs --profile all --sleep 0 --displaySleep 0 --networkWake on --boardSummary",
            "MacHostMedia=node scripts/mac/check-mac-host-readiness.mjs --probeMedia --promptPassword --boardSummary",
          ].join(" "),
        },
        "Mac Unattended": {
          role: "Mac unattended status",
          status: "warning",
          note: [
            `MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded,power checkedAt=${unattendedCheckedAt}.`,
            "MacUnattendedStatus=node scripts/mac/check-mac-unattended-status.mjs --boardSummary",
          ].join(" "),
        },
      },
      events: [
        {
          type: "message",
          from: "Mac Codex",
          text: `MacPowerHealth=warning checkedAt=${olderPowerCheckedAt} reason=network-wake-disabled warnings=network-wake-disabled`,
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacPowerHealth=warning reason=secret-value --password secret-value warnings=none",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacUnattendedHealth=blocked reason=secret-value blockers=secret-value warnings=none",
        },
        {
          type: "status",
          from: "Mac Unattended",
          text: "MacUnattendedHealth=$(whoami) reason=ok blockers=none warnings=none",
        },
      ],
    });

    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-BoardSummary",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell MacPowerHealth/MacUnattendedHealth board summary failed\n${output}`);
      assertIncludes(output, `MacPowerHealth=warning checkedAt=${powerCheckedAt} reason=system-sleep-enabled blockers=none warnings=system-sleep-enabled,display-sleep-enabled.`, "PowerShell MacPowerHealth board summary output");
      assertIncludes(output, `MacUnattendedHealth=warning checkedAt=${unattendedCheckedAt} reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded,power.`, "PowerShell MacUnattendedHealth board summary output");
      assertNotIncludes(output, "secret-value", "PowerShell Mac power/unattended health board summary should not leak rejected candidates");
      console.log("[OK] PowerShell resume status extracts Mac power and unattended health from Agent Link Board safely");
    }, {
      statuses: {
        "Mac Heartbeat": {
          role: "Mac heartbeat watcher",
          status: "online",
          note: [
            `MacPowerHealth=warning reason=system-sleep-enabled warnings=system-sleep-enabled,display-sleep-enabled checkedAt=${powerCheckedAt}.`,
            "MacPowerPlan=node scripts/mac/plan-mac-power-settings.mjs --profile all --sleep 0 --displaySleep 0 --networkWake on --boardSummary",
            "MacHostMedia=node scripts/mac/check-mac-host-readiness.mjs --probeMedia --promptPassword --boardSummary",
          ].join(" "),
        },
        "Mac Unattended": {
          role: "Mac unattended status",
          status: "warning",
          note: [
            `MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded,power checkedAt=${unattendedCheckedAt}.`,
            "MacUnattendedStatus=node scripts/mac/check-mac-unattended-status.mjs --boardSummary",
          ].join(" "),
        },
      },
    });
  });
}

async function checkBoardMacHostSafeStartExtraction(args) {
  const safeCommand = "node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43888";
  const maxFpsCommand = "node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43888 --maxScreenFps 60";
  const localSmokeCommand = "node scripts/mac/check-mac-formal-local-smoke.mjs --host 127.0.0.1 --port 43888 --promptPassword --boardSummary";
  const heartbeatOnceCommand = "node scripts/mac/watch-mac-heartbeat.mjs --once --sendStatus --boardSummary";
  const heartbeatWatchCommand = "node scripts/mac/watch-mac-heartbeat.mjs --sendStatus --intervalMs 30000";
  const heartbeatStartCommand = "node scripts/mac/start-mac-heartbeat-watcher.mjs --boardSummary";
  const heartbeatStatusCommand = "node scripts/mac/start-mac-heartbeat-watcher.mjs --status --boardSummary";
  const heartbeatStopCommand = "node scripts/mac/start-mac-heartbeat-watcher.mjs --stop --boardSummary";
  const macClientDiscoverWindowsCommand = "node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary";
  const macClientFormalChecklistCommand = "node scripts/mac/check-mac-client-formal-status.mjs --discover --port 43770 --boardSummary";
  const macClientFormalSmokeCommand = "node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary";
  const macClientManualChecklistAction = "Mac client 会话诊断查看“手工清单”：连接/视频/音频/剪贴板/input_ack/诊断；复制诊断会带出同一行，粘贴前确认不包含连接密码";
  const macRemoteAudioPlanCommand = "node scripts/mac/plan-mac-remote-audio.mjs --boardSummary";
  const macInputSafetyPlanCommand = "node scripts/mac/plan-mac-input-safety.mjs --boardSummary";
  const macManualUxStatusCommand = "node scripts/mac/check-mac-manual-ux-status.mjs --boardSummary";
  const macManualUxReconfirmCommand = "node scripts/mac/check-mac-manual-ux-status.mjs --server http://192.168.31.68:17888 --reconfirmCall --json";
  const macManualUxChecklist = "connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics";
  const macManualUxSummary = `status=calling checklist=${macManualUxChecklist} labels=连接/画面/声音/文本剪贴板/文件剪贴板/窗口/全屏/原画/复制诊断 signals=manualUxCallInProgress target=192.168.31.122:43770 targetSource=mac-host-discovery next=ReconfirmManualUxCall safety=no-password,no-input-inject noFormalE2ERerun=true manualUxCall=timeout gate=wait-windows-codex-push callCommand=absent reconfirmCommand=present blockers=none warnings=manual-ux-call-timeout`;
  const macManualUxAckTimeoutSummary = "status=blocked reason=manual-ux-call-timeout next=AskMacReconfirmManualUxCall";
  const macManualUxBoardText = `MacManualUx=status=call-ready ManualUxChecklist=${macManualUxChecklist} ManualUxLabels=连接/画面/声音/文本剪贴板/文件剪贴板/窗口/全屏/原画/复制诊断 Signals=userAwakeManualUx Target=192.168.31.122:43770 TargetSource=mac-host-discovery Next=SendManualUxCall Safety=no-password,no-input-inject NoFormalE2ERerun=true ManualUxCallCommand=node scripts/codex-link-client.mjs --server http://192.168.31.68:17888 call --from MacCodex --need WindowsCodex`;
  const macManualUxCallingBoardText = `MacManualUx=status=calling ManualUxChecklist=${macManualUxChecklist} ManualUxLabels=连接/画面/声音/文本剪贴板/文件剪贴板/窗口/全屏/原画/复制诊断 Signals=manualUxCallInProgress Target=192.168.31.122:43770 TargetSource=mac-host-discovery Next=ReconfirmManualUxCall Safety=no-password,no-input-inject NoFormalE2ERerun=true ManualUxReconfirmCommand=${macManualUxReconfirmCommand} ManualUxCall=timeout MacManualUxGate=wait-windows-codex-push warnings=manual-ux-call-timeout`;
  const macRemoteAudioSummary = "status=plan-only capture=system-pcm-does-not-mute-local remoteOnlyOptions=manual-mute-restore/virtual-output-device/product-toggle recommended=product-toggle-with-explicit-consent safety=no-volume-change,no password/input/inject";
  const macRemoteAudioBoardText = "Mac remote audio plan: status=plan-only; capture=system-pcm-does-not-mute-local; RemoteOnlyOptions=manual-mute-restore/virtual-output-device/product-toggle; recommended=product-toggle-with-explicit-consent; safety=no-volume-change,no password/input/inject.";
  const macInputSafetySummary = "status=plan-only default=log realInput=blocked-until-user-watching required=--confirmUserWatching eventSet=safe safety=no-password,no-input-events,no-inject";
  const macInputSafetyBoardText = "Mac input safety plan: status=plan-only; default=log; realInput=blocked-until-user-watching; required=--confirmUserWatching; eventSet=safe; safety=no-password,no-input-events,no-inject.";
  const macInputSafetyStatusSummary = "status=ready reason=log-mode-permissions-ok inputMode=log realInput=blocked-until-user-watching required=--confirmUserWatching eventSet=safe safety=no-password,no-auth,no-input-events,no-inject";
  const macInputSafetyStatusBoardText = `MacInputSafetyStatus=ready reason=log-mode-permissions-ok host=online inputMode=log permissions=ok realInput=blocked-until-user-watching required=--confirmUserWatching eventSet=safe blockers=none warnings=none. MacInputSafetyPlan=${macInputSafetyPlanCommand}. MacInputLogSmoke=node scripts/mac/smoke-mac-input-log.mjs --host 127.0.0.1 --port 43770 --promptPassword --boardSummary. Safety=no-password,no-auth,no-input-events,no-inject.`;
  const heartbeatNow = Date.now();
  const freshCheckedAt = new Date(heartbeatNow - 60_000).toISOString();
  const freshCodexUpdatedAt = new Date(heartbeatNow - 65_000).toISOString();
  const freshBoardUpdatedAt = new Date(heartbeatNow - 58_000).toISOString();
  const staleHeartbeatSummary = "MacHeartbeat=status=ok; checkedAt=2020-01-01T00:00:00.000Z; device=Mac; codex=ok status=idle updatedAt=2020-01-01T00:00:00.000Z ageMs=999999; macHost=online 127.0.0.1:43770; macClient=online http://127.0.0.1:5188/; board=ok boardUpdatedAt=2020-01-01T00:00:00.000Z; blockers=none warnings=none reason=ok";
  const freshHeartbeatSummary = `MacHeartbeat=status=ok; checkedAt=${freshCheckedAt}; device=Mac; codex=ok status=idle updatedAt=${freshCodexUpdatedAt} ageMs=65000; macHost=online 127.0.0.1:43770; macClient=online http://127.0.0.1:5188/; board=ok boardUpdatedAt=${freshBoardUpdatedAt}; blockers=none warnings=none reason=ok`;
  await withMockHost(async (port) => {
    const boardState = {
      statuses: {
        "Mac Codex": {
          role: "Mac 端",
          status: "idle",
          note: `MacHostReadiness=blocked blockers=host-offline warnings=none MacHostSafeStart=${safeCommand} MacMaxFpsSafeStart=${maxFpsCommand} MacFormalLocalSmoke=${localSmokeCommand} MacClientDiscoverWindows=${macClientDiscoverWindowsCommand} MacClientFormalChecklist=${macClientFormalChecklistCommand} MacClientFormalSmoke=${macClientFormalSmokeCommand} MacClientManualChecklist=${macClientManualChecklistAction} MacRemoteAudioPlan=${macRemoteAudioPlanCommand} ${macRemoteAudioBoardText} MacInputSafetyPlan=${macInputSafetyPlanCommand} ${macInputSafetyBoardText} ${macInputSafetyStatusBoardText} MacManualUxStatus=${macManualUxStatusCommand} ${macManualUxBoardText} MacHeartbeatOnce=${heartbeatOnceCommand} MacHeartbeatWatch=${heartbeatWatchCommand} MacHeartbeatStart=${heartbeatStartCommand} MacHeartbeatStatus=${heartbeatStatusCommand} MacHeartbeatStop=${heartbeatStopCommand}`,
        },
        "Mac Heartbeat": {
          role: "Mac heartbeat watcher",
          status: "online",
          note: freshHeartbeatSummary,
          updatedAt: freshBoardUpdatedAt,
        },
      },
      events: [
        {
          type: "status",
          from: "Mac Heartbeat",
          text: staleHeartbeatSummary,
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacHostSafeStart=node scripts/mac/start-mac-host.mjs --password secret-value --host 0.0.0.0 --port 9",
        },
        {
          type: "status",
          from: "Mac Codex",
          text: "MacHostSafeStart=node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port <当前端口>",
        },
        {
          type: "status",
          from: "Mac Codex",
          text: "MacMaxFpsSafeStart=node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43888",
        },
        {
          type: "status",
          from: "Mac Codex",
          text: "MacMaxFpsSafeStart=node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port <当前端口> --maxScreenFps 60",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacFormalLocalSmoke=node scripts/mac/check-mac-formal-local-smoke.mjs --host 127.0.0.1 --port 43888 --password secret-value --boardSummary",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacClientFormalSmoke=node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --password secret-value --preflightOnly --boardSummary",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacClientDiscoverWindows=node scripts/mac/discover-windows-hosts.mjs --checkBoard --password secret-value --boardSummary",
        },
        {
          type: "status",
          from: "Mac Codex",
          text: "MacClientDiscoverWindows=node scripts/mac/discover-windows-hosts.mjs --boardSummary",
        },
        {
          type: "status",
          from: "Mac Codex",
          text: "MacClientDiscoverWindows=node scripts/mac/discover-windows-hosts.mjs --checkBoard",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs --discover --port 43770 --password secret-value --boardSummary",
        },
        {
          type: "status",
          from: "Mac Codex",
          text: "MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs --host <Windows IP> --port 43770 --boardSummary",
        },
        {
          type: "status",
          from: "Mac Codex",
          text: "MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs --discover --port 43770",
        },
        {
          type: "status",
          from: "Mac Codex",
          text: "MacClientFormalSmoke=node scripts/mac/run-mac-client-formal-smoke.mjs --discover --preflightOnly --boardSummary",
        },
        {
          type: "status",
          from: "Mac Codex",
          text: "MacClientFormalSmoke=node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacClientManualChecklist=Mac client 会话诊断查看“手工清单”：连接/视频/音频/剪贴板/input_ack/诊断；复制诊断会带出同一行，粘贴前确认不包含连接密码 password=secret-value",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacClientManualChecklist=Mac client 会话诊断查看“手工清单”：连接/视频/音频/剪贴板/input_ack/诊断；自动发送 input_event",
        },
        {
          type: "status",
          from: "Mac Codex",
          text: "RerunFormalLocalSmoke=node scripts/mac/check-mac-formal-local-smoke.mjs --host 127.0.0.1 --port <当前端口> --promptPassword --boardSummary",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacRemoteAudioPlan=node scripts/mac/plan-mac-remote-audio.mjs --password secret-value --boardSummary",
        },
        {
          type: "status",
          from: "Mac Codex",
          text: "MacRemoteAudioPlan=node scripts/mac/plan-mac-remote-audio.mjs --json",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "Mac remote audio plan: status=plan-only; capture=system-pcm-does-not-mute-local; RemoteOnlyOptions=manual-mute-restore/virtual-output-device/product-toggle; recommended=auto-mute; safety=no-volume-change,no password/input/inject.",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "Mac remote audio plan: status=plan-only; capture=system-pcm-does-not-mute-local; RemoteOnlyOptions=manual-mute-restore/virtual-output-device/product-toggle; recommended=product-toggle-with-explicit-consent; safety=volume-change,password=secret-value.",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacInputSafetyPlan=node scripts/mac/plan-mac-input-safety.mjs --password secret-value --boardSummary",
        },
        {
          type: "status",
          from: "Mac Codex",
          text: "MacInputSafetyPlan=node scripts/mac/plan-mac-input-safety.mjs --json",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacManualUxStatus=node scripts/mac/check-mac-manual-ux-status.mjs --password secret-value --boardSummary",
        },
        {
          type: "status",
          from: "Mac Codex",
          text: "MacManualUxStatus=node scripts/mac/check-mac-manual-ux-status.mjs --sendStatus --boardSummary",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacManualUx=status=call-ready ManualUxChecklist=connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics Safety=no-password,password=secret-value Next=SendManualUxCall",
        },
        {
          type: "status",
          from: "Mac Codex",
          text: "MacManualUx=status=armed ManualUxChecklist=connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics Safety=no-password,no-input-inject",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: `MacManualUx=status=calling ManualUxChecklist=${macManualUxChecklist} ManualUxLabels=连接/画面/声音/文本剪贴板/文件剪贴板/窗口/全屏/原画/复制诊断 Signals=manualUxCallInProgress Target=192.168.31.122:43770 TargetSource=mac-host-discovery Next=ReconfirmManualUxCall Safety=no-password,no-input-inject NoFormalE2ERerun=true ManualUxReconfirmCommand=${macManualUxReconfirmCommand} --password secret-value ManualUxCall=timeout warnings=manual-ux-call-timeout`,
        },
        {
          type: "status",
          from: "Mac Codex",
          text: macManualUxCallingBoardText,
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "Mac input safety plan: status=plan-only; default=log; realInput=blocked-until-user-watching; required=--confirmUserWatching; eventSet=full; safety=no-password,no-input-events,no-inject.",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "Mac input safety plan: status=plan-only; default=log; realInput=blocked-until-user-watching; required=--confirmUserWatching; eventSet=safe; safety=no-password,password=secret-value,no-inject.",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacInputSafetyStatus=status=ready reason=user-watching inputMode=log realInput=ready-for-user-watched-inject required=--confirmUserWatching eventSet=full safety=no-password,requires-user-watching checkedAt=2026-06-20T09:16:00.000Z",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacInputSafetyStatus=status=blocked reason=user-not-watching inputMode=log realInput=blocked-until-user-watching required=--confirmUserWatching eventSet=safe safety=no-password,password=secret-value,no-inject checkedAt=2026-06-20T09:16:00.000Z",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacHeartbeatOnce=node scripts/mac/watch-mac-heartbeat.mjs --once --sendStatus --password secret-value --boardSummary",
        },
        {
          type: "status",
          from: "Mac Codex",
          text: "MacHeartbeatOnce=node scripts/mac/watch-mac-heartbeat.mjs --once --boardSummary",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacHeartbeatWatch=node scripts/mac/watch-mac-heartbeat.mjs --sendStatus",
        },
        {
          type: "status",
          from: "Mac Codex",
          text: "MacHeartbeatWatch=node scripts/mac/check-mac-heartbeat.mjs --sendStatus --intervalMs 30000",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacHeartbeatStart=node scripts/mac/start-mac-heartbeat-watcher.mjs --password secret-value --boardSummary",
        },
        {
          type: "status",
          from: "Mac Codex",
          text: "MacHeartbeatStart=node scripts/mac/watch-mac-heartbeat.mjs --sendStatus --boardSummary",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "MacHeartbeatStatus=node scripts/mac/start-mac-heartbeat-watcher.mjs --status",
        },
        {
          type: "status",
          from: "Mac Codex",
          text: "MacHeartbeatStop=node scripts/mac/start-mac-heartbeat-watcher.mjs --restart --boardSummary",
        },
      ],
    };

    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-Json",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell MacHostSafeStart JSON failed\n${output}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.macHostSafeStart?.found === true, "PowerShell MacHostSafeStart should be found");
      assert(payload.board.macHostSafeStart.command === safeCommand, "PowerShell MacHostSafeStart command mismatch");
      assert(payload.board.macHostSafeStart.rejectedCount >= 2, "PowerShell unsafe or placeholder MacHostSafeStart should be rejected");
      assert(payload.board?.macMaxFpsSafeStart?.found === true, "PowerShell MacMaxFpsSafeStart should be found");
      assert(payload.board.macMaxFpsSafeStart.command === maxFpsCommand, "PowerShell MacMaxFpsSafeStart command mismatch");
      assert(payload.board.macMaxFpsSafeStart.rejectedCount >= 2, "PowerShell placeholder or missing max FPS MacMaxFpsSafeStart should be rejected");
      assert(payload.board?.macFormalLocalSmoke?.found === true, "PowerShell MacFormalLocalSmoke should be found");
      assert(payload.board.macFormalLocalSmoke.command === localSmokeCommand, "PowerShell MacFormalLocalSmoke command mismatch");
      assert(payload.board.macFormalLocalSmoke.rejectedCount >= 2, "PowerShell unsafe or placeholder MacFormalLocalSmoke should be rejected");
      assert(payload.board?.macClientDiscoverWindows?.found === true, "PowerShell MacClientDiscoverWindows should be found");
      assert(payload.board.macClientDiscoverWindows.command === macClientDiscoverWindowsCommand, "PowerShell MacClientDiscoverWindows command mismatch");
      assert(payload.board.macClientDiscoverWindows.rejectedCount >= 3, "PowerShell unsafe or incomplete MacClientDiscoverWindows should be rejected");
      assert(payload.board?.macClientFormalChecklist?.found === true, "PowerShell MacClientFormalChecklist should be found");
      assert(payload.board.macClientFormalChecklist.command === macClientFormalChecklistCommand, "PowerShell MacClientFormalChecklist command mismatch");
      assert(payload.board.macClientFormalChecklist.rejectedCount >= 3, "PowerShell unsafe or incomplete MacClientFormalChecklist should be rejected");
      assert(payload.board?.macClientFormalSmoke?.found === true, "PowerShell MacClientFormalSmoke should be found");
      assert(payload.board.macClientFormalSmoke.command === macClientFormalSmokeCommand, "PowerShell MacClientFormalSmoke command mismatch");
      assert(payload.board.macClientFormalSmoke.rejectedCount >= 3, "PowerShell unsafe or incomplete MacClientFormalSmoke should be rejected");
      assert(payload.board?.macClientManualChecklist?.found === true, "PowerShell MacClientManualChecklist should be found");
      assert(payload.board.macClientManualChecklist.action === macClientManualChecklistAction, "PowerShell MacClientManualChecklist action mismatch");
      assert(payload.board.macClientManualChecklist.rejectedCount >= 2, "PowerShell unsafe MacClientManualChecklist summaries should be rejected");
      assert(payload.board?.macRemoteAudioPlan?.found === true, "PowerShell MacRemoteAudioPlan should be found");
      assert(payload.board.macRemoteAudioPlan.command === macRemoteAudioPlanCommand, "PowerShell MacRemoteAudioPlan command mismatch");
      assert(payload.board.macRemoteAudioPlan.rejectedCount >= 2, "PowerShell unsafe or non-board MacRemoteAudioPlan should be rejected");
      assert(payload.board?.macRemoteAudio?.found === true, "PowerShell Mac remote audio summary should be found");
      assert(payload.board.macRemoteAudio.summary === macRemoteAudioSummary, "PowerShell Mac remote audio summary mismatch");
      assert(payload.board.macRemoteAudio.capture === "system-pcm-does-not-mute-local", "PowerShell Mac remote audio capture mismatch");
      assert(payload.board.macRemoteAudio.remoteOnlyOptions?.includes("manual-mute-restore"), "PowerShell Mac remote audio should include manual mute option");
      assert(payload.board.macRemoteAudio.remoteOnlyOptions?.includes("virtual-output-device"), "PowerShell Mac remote audio should include virtual output option");
      assert(payload.board.macRemoteAudio.remoteOnlyOptions?.includes("product-toggle"), "PowerShell Mac remote audio should include product toggle option");
      assert(payload.board.macRemoteAudio.recommended === "product-toggle-with-explicit-consent", "PowerShell Mac remote audio recommended option mismatch");
      assert(payload.board.macRemoteAudio.safety?.includes("no-volume-change"), "PowerShell Mac remote audio should include no-volume-change safety");
      assert(payload.board.macRemoteAudio.safety?.includes("no password/input/inject"), "PowerShell Mac remote audio should include no password/input/inject safety");
      assert(payload.board.macRemoteAudio.rejectedCount >= 2, "PowerShell unsafe Mac remote audio summaries should be rejected");
      assert(payload.board?.macInputSafetyPlan?.found === true, "PowerShell MacInputSafetyPlan should be found");
      assert(payload.board.macInputSafetyPlan.command === macInputSafetyPlanCommand, "PowerShell MacInputSafetyPlan command mismatch");
      assert(payload.board.macInputSafetyPlan.rejectedCount >= 2, "PowerShell unsafe or non-board MacInputSafetyPlan should be rejected");
      assert(payload.board?.macManualUxStatus?.found === true, "PowerShell MacManualUxStatus should be found");
      assert(payload.board.macManualUxStatus.command === macManualUxStatusCommand, "PowerShell MacManualUxStatus command mismatch");
      assert(payload.board.macManualUxStatus.rejectedCount >= 2, "PowerShell unsafe MacManualUxStatus candidates should be rejected");
      assert(payload.board?.macManualUx?.found === true, "PowerShell MacManualUx summary should be found");
      assert(payload.board.macManualUx.summary === macManualUxSummary, "PowerShell MacManualUx summary mismatch");
      assert(payload.board.macManualUx.status === "calling", "PowerShell MacManualUx status mismatch");
      assert(payload.board.macManualUx.next === "ReconfirmManualUxCall", "PowerShell MacManualUx next mismatch");
      assert(payload.board.macManualUx.manualUxCall === "timeout", "PowerShell MacManualUx call timing mismatch");
      assert(payload.board.macManualUx.gate === "wait-windows-codex-push", "PowerShell MacManualUx gate mismatch");
      assert(payload.board.macManualUx.warnings?.includes("manual-ux-call-timeout"), "PowerShell MacManualUx timeout warning should be preserved");
      assert(payload.board.macManualUx.callCommandPresent === false, "PowerShell MacManualUx call command should be absent while call is already active");
      assert(payload.board.macManualUx.reconfirmCommandPresent === true, "PowerShell MacManualUx reconfirm command should be present");
      assert(payload.board.macManualUx.manualUxReconfirmCommand === macManualUxReconfirmCommand, "PowerShell MacManualUx reconfirm command mismatch");
      assert(payload.board.macManualUx.rejectedCount >= 3, "PowerShell unsafe MacManualUx summaries should be rejected");
      assert(payload.board?.macManualUxAck?.status === "blocked", "PowerShell timeout MacManualUx should block Windows manual UX ack");
      assert(payload.board.macManualUxAck.summary === macManualUxAckTimeoutSummary, "PowerShell timeout MacManualUx ack summary mismatch");
      assert(payload.board?.macInputSafety?.found === true, "PowerShell Mac input safety summary should be found");
      assert(payload.board.macInputSafety.summary === macInputSafetySummary, "PowerShell Mac input safety summary mismatch");
      assert(payload.board.macInputSafety.realInput === "blocked-until-user-watching", "PowerShell Mac input safety realInput mismatch");
      assert(payload.board.macInputSafety.required === "--confirmUserWatching", "PowerShell Mac input safety required flag mismatch");
      assert(payload.board.macInputSafety.eventSet === "safe", "PowerShell Mac input safety event set mismatch");
      assert(payload.board.macInputSafety.safety?.includes("no-password"), "PowerShell Mac input safety should include no-password safety");
      assert(payload.board.macInputSafety.safety?.includes("no-input-events"), "PowerShell Mac input safety should include no-input-events safety");
      assert(payload.board.macInputSafety.safety?.includes("no-inject"), "PowerShell Mac input safety should include no-inject safety");
      assert(payload.board.macInputSafety.rejectedCount >= 2, "PowerShell unsafe Mac input safety summaries should be rejected");
      assert(payload.board?.macInputSafetyStatus?.found === true, "PowerShell MacInputSafetyStatus should be found");
      assert(payload.board.macInputSafetyStatus.summary === macInputSafetyStatusSummary, "PowerShell MacInputSafetyStatus summary mismatch");
      assert(payload.board.macInputSafetyStatus.status === "ready", "PowerShell MacInputSafetyStatus status mismatch");
      assert(payload.board.macInputSafetyStatus.reason === "log-mode-permissions-ok", "PowerShell MacInputSafetyStatus reason mismatch");
      assert(payload.board.macInputSafetyStatus.inputMode === "log", "PowerShell MacInputSafetyStatus inputMode mismatch");
      assert(payload.board.macInputSafetyStatus.realInput === "blocked-until-user-watching", "PowerShell MacInputSafetyStatus realInput mismatch");
      assert(payload.board.macInputSafetyStatus.eventSet === "safe", "PowerShell MacInputSafetyStatus event set mismatch");
      assert(payload.board.macInputSafetyStatus.safety?.includes("no-auth"), "MacInputSafetyStatus should include no-auth safety");
      assert(payload.board.macInputSafetyStatus.safety?.includes("no-password"), "PowerShell MacInputSafetyStatus should include no-password safety");
      assert(payload.board.macInputSafetyStatus.rejectedCount >= 2, "PowerShell unsafe MacInputSafetyStatus summaries should be rejected");
      assert(payload.board?.macHeartbeatOnce?.found === true, "PowerShell MacHeartbeatOnce should be found");
      assert(payload.board.macHeartbeatOnce.command === heartbeatOnceCommand, "PowerShell MacHeartbeatOnce command mismatch");
      assert(payload.board.macHeartbeatOnce.rejectedCount >= 2, "PowerShell unsafe or incomplete MacHeartbeatOnce should be rejected");
      assert(payload.board?.macHeartbeatWatch?.found === true, "PowerShell MacHeartbeatWatch should be found");
      assert(payload.board.macHeartbeatWatch.command === heartbeatWatchCommand, "PowerShell MacHeartbeatWatch command mismatch");
      assert(payload.board.macHeartbeatWatch.rejectedCount >= 2, "PowerShell unsafe or incomplete MacHeartbeatWatch should be rejected");
      assert(payload.board?.macHeartbeatStart?.found === true, "PowerShell MacHeartbeatStart should be found");
      assert(payload.board.macHeartbeatStart.command === heartbeatStartCommand, "PowerShell MacHeartbeatStart command mismatch");
      assert(payload.board.macHeartbeatStart.rejectedCount >= 2, "PowerShell unsafe MacHeartbeatStart should be rejected");
      assert(payload.board?.macHeartbeatStatus?.found === true, "PowerShell MacHeartbeatStatus should be found");
      assert(payload.board.macHeartbeatStatus.command === heartbeatStatusCommand, "PowerShell MacHeartbeatStatus command mismatch");
      assert(payload.board.macHeartbeatStatus.rejectedCount >= 1, "PowerShell incomplete MacHeartbeatStatus should be rejected");
      assert(payload.board?.macHeartbeatStop?.found === true, "PowerShell MacHeartbeatStop should be found");
      assert(payload.board.macHeartbeatStop.command === heartbeatStopCommand, "PowerShell MacHeartbeatStop command mismatch");
      assert(payload.board.macHeartbeatStop.rejectedCount >= 1, "PowerShell wrong-action MacHeartbeatStop should be rejected");
      assert(payload.board?.macHeartbeatFreshness?.present === true, "PowerShell MacHeartbeat freshness should be found");
      assert(payload.board.macHeartbeatFreshness.status === "fresh", "PowerShell MacHeartbeat freshness should use newest summary");
      assert(payload.board.macHeartbeatFreshness.checkedAt === freshCheckedAt, "PowerShell MacHeartbeat freshness should use newest checkedAt");
      assert(payload.board.macHeartbeatFreshness.codexAgeMs === 65000, "PowerShell MacHeartbeat freshness should preserve codex age");
      assertIncludes(payload.boardSummary, `MacHostSafeStart=${safeCommand}.`, "PowerShell MacHostSafeStart JSON board summary");
      assertIncludes(payload.boardSummary, `MacMaxFpsSafeStart=${maxFpsCommand}.`, "PowerShell MacMaxFpsSafeStart JSON board summary");
      assertIncludes(payload.boardSummary, `MacFormalLocalSmoke=${localSmokeCommand}.`, "PowerShell MacFormalLocalSmoke JSON board summary");
      assertIncludes(payload.boardSummary, `MacClientDiscoverWindows=${macClientDiscoverWindowsCommand}.`, "PowerShell MacClientDiscoverWindows JSON board summary");
      assertIncludes(payload.boardSummary, `MacClientFormalChecklist=${macClientFormalChecklistCommand}.`, "PowerShell MacClientFormalChecklist JSON board summary");
      assertIncludes(payload.boardSummary, `MacClientFormalSmoke=${macClientFormalSmokeCommand}.`, "PowerShell MacClientFormalSmoke JSON board summary");
      assertIncludes(payload.boardSummary, `MacClientManualChecklist=${macClientManualChecklistAction}.`, "PowerShell MacClientManualChecklist JSON board summary");
      assertIncludes(payload.boardSummary, `MacRemoteAudioPlan=${macRemoteAudioPlanCommand}.`, "PowerShell MacRemoteAudioPlan JSON board summary");
      assertIncludes(payload.boardSummary, `MacRemoteAudio=${macRemoteAudioSummary}.`, "PowerShell Mac remote audio JSON board summary");
      assertIncludes(payload.boardSummary, `MacInputSafetyPlan=${macInputSafetyPlanCommand}.`, "PowerShell MacInputSafetyPlan JSON board summary");
      assertIncludes(payload.boardSummary, `MacManualUxStatus=${macManualUxStatusCommand}.`, "PowerShell MacManualUxStatus JSON board summary");
      assertIncludes(payload.boardSummary, `MacManualUx=${macManualUxSummary}.`, "PowerShell MacManualUx JSON board summary");
      assertIncludes(payload.boardSummary, `MacManualUxReconfirm=${macManualUxReconfirmCommand}.`, "PowerShell MacManualUx reconfirm JSON board summary");
      assertIncludes(payload.boardSummary, `MacManualUxAck=${macManualUxAckTimeoutSummary}.`, "PowerShell MacManualUx timeout ack JSON board summary");
      assertIncludes(payload.boardSummary, `MacInputSafety=${macInputSafetySummary}.`, "PowerShell Mac input safety JSON board summary");
      assertIncludes(payload.boardSummary, `MacInputSafetyStatus=${macInputSafetyStatusSummary}.`, "PowerShell MacInputSafetyStatus JSON board summary");
      assertIncludes(payload.boardSummary, `MacHeartbeatOnce=${heartbeatOnceCommand}.`, "PowerShell MacHeartbeatOnce JSON board summary");
      assertIncludes(payload.boardSummary, `MacHeartbeatWatch=${heartbeatWatchCommand}.`, "PowerShell MacHeartbeatWatch JSON board summary");
      assertIncludes(payload.boardSummary, `MacHeartbeatStart=${heartbeatStartCommand}.`, "PowerShell MacHeartbeatStart JSON board summary");
      assertIncludes(payload.boardSummary, `MacHeartbeatStatus=${heartbeatStatusCommand}.`, "PowerShell MacHeartbeatStatus JSON board summary");
      assertIncludes(payload.boardSummary, `MacHeartbeatStop=${heartbeatStopCommand}.`, "PowerShell MacHeartbeatStop JSON board summary");
      assertIncludes(payload.boardSummary, "MacHeartbeatFreshness=fresh", "PowerShell MacHeartbeatFreshness JSON board summary");
      assertIncludes(payload.boardSummary, `checkedAt=${freshCheckedAt}.`, "PowerShell MacHeartbeatFreshness JSON board summary");
      assertNotIncludes(output, "secret-value", "PowerShell MacHostSafeStart JSON should not leak rejected command");
    }, boardState);

    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-BoardSummary",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell MacHostSafeStart board summary failed\n${output}`);
      assertIncludes(output, `MacHostSafeStart=${safeCommand}.`, "PowerShell MacHostSafeStart board summary");
      assertIncludes(output, `MacMaxFpsSafeStart=${maxFpsCommand}.`, "PowerShell MacMaxFpsSafeStart board summary");
      assertIncludes(output, `MacFormalLocalSmoke=${localSmokeCommand}.`, "PowerShell MacFormalLocalSmoke board summary");
      assertIncludes(output, `MacClientDiscoverWindows=${macClientDiscoverWindowsCommand}.`, "PowerShell MacClientDiscoverWindows board summary");
      assertIncludes(output, `MacClientFormalChecklist=${macClientFormalChecklistCommand}.`, "PowerShell MacClientFormalChecklist board summary");
      assertIncludes(output, `MacClientFormalSmoke=${macClientFormalSmokeCommand}.`, "PowerShell MacClientFormalSmoke board summary");
      assertIncludes(output, `MacClientManualChecklist=${macClientManualChecklistAction}.`, "PowerShell MacClientManualChecklist board summary");
      assertIncludes(output, `MacRemoteAudioPlan=${macRemoteAudioPlanCommand}.`, "PowerShell MacRemoteAudioPlan board summary");
      assertIncludes(output, `MacRemoteAudio=${macRemoteAudioSummary}.`, "PowerShell Mac remote audio board summary");
      assertIncludes(output, `MacInputSafetyPlan=${macInputSafetyPlanCommand}.`, "PowerShell MacInputSafetyPlan board summary");
      assertIncludes(output, `MacManualUxStatus=${macManualUxStatusCommand}.`, "PowerShell MacManualUxStatus board summary");
      assertIncludes(output, `MacManualUx=${macManualUxSummary}.`, "PowerShell MacManualUx board summary");
      assertIncludes(output, `MacManualUxReconfirm=${macManualUxReconfirmCommand}.`, "PowerShell MacManualUx reconfirm board summary");
      assertIncludes(output, `MacManualUxAck=${macManualUxAckTimeoutSummary}.`, "PowerShell MacManualUx timeout ack board summary");
      assertIncludes(output, `MacInputSafety=${macInputSafetySummary}.`, "PowerShell Mac input safety board summary");
      assertIncludes(output, `MacInputSafetyStatus=${macInputSafetyStatusSummary}.`, "PowerShell MacInputSafetyStatus board summary");
      assertIncludes(output, `MacHeartbeatOnce=${heartbeatOnceCommand}.`, "PowerShell MacHeartbeatOnce board summary");
      assertIncludes(output, `MacHeartbeatWatch=${heartbeatWatchCommand}.`, "PowerShell MacHeartbeatWatch board summary");
      assertIncludes(output, `MacHeartbeatStart=${heartbeatStartCommand}.`, "PowerShell MacHeartbeatStart board summary");
      assertIncludes(output, `MacHeartbeatStatus=${heartbeatStatusCommand}.`, "PowerShell MacHeartbeatStatus board summary");
      assertIncludes(output, `MacHeartbeatStop=${heartbeatStopCommand}.`, "PowerShell MacHeartbeatStop board summary");
      assertIncludes(output, "MacHeartbeatFreshness=fresh", "PowerShell MacHeartbeatFreshness board summary");
      assertIncludes(output, `checkedAt=${freshCheckedAt}.`, "PowerShell MacHeartbeatFreshness board summary");
      assertNotIncludes(output, "secret-value", "PowerShell MacHostSafeStart board summary should not leak rejected command");
      console.log("[OK] PowerShell resume-status wrapper surfaces Mac safe-start commands safely");
    }, boardState);
  });
}

async function checkBoardWindowsSecureAuthPathExtraction(args) {
  const secureAuthCommand = "node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port 45678 --promptPassword --requirePassword";
  const aliasSecureAuthCommand = "node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port 45679 --promptPassword --requirePassword";
  await withMockHost(async (port) => {
    const boardState = {
      statuses: {
        "Windows Codex": {
          role: "Windows 端",
          status: "idle",
          note: [
            "Windows host 当前使用随机运行期密码，Mac true browser smoke 需现场认证。",
            `WindowsSecureAuthPath=${secureAuthCommand}`,
            `SecureAuthPath=${aliasSecureAuthCommand}`,
          ].join(" "),
        },
      },
      events: [
        {
          type: "message",
          from: "Windows Codex",
          text: "WindowsSecureAuthPath=node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port 43770 --password secret-value --requirePassword",
        },
        {
          type: "message",
          from: "Windows Codex",
          text: "SecureAuthPath=node scripts/windows/start-windows-host.mjs --host 127.0.0.1 --port 43770 --promptPassword --requirePassword",
        },
        {
          type: "status",
          from: "Windows Codex",
          text: "WindowsSecureAuthPath=node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port <当前端口> --promptPassword --requirePassword",
        },
        {
          type: "status",
          from: "Windows Codex",
          text: "WindowsSecureAuthPath=node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port 43770 --promptPassword",
        },
      ],
    };

    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-Json",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell WindowsSecureAuthPath JSON failed\n${output}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.windowsSecureAuthPath?.found === true, "PowerShell WindowsSecureAuthPath should be found");
      assert(payload.board.windowsSecureAuthPath.command === aliasSecureAuthCommand, "PowerShell WindowsSecureAuthPath should use SecureAuthPath alias when newest");
      assert(payload.board.windowsSecureAuthPath.rejectedCount >= 4, "PowerShell unsafe WindowsSecureAuthPath candidates should be rejected");
      assertIncludes(payload.boardSummary, `WindowsSecureAuthPath=${aliasSecureAuthCommand}.`, "PowerShell WindowsSecureAuthPath JSON board summary");
      assertNotIncludes(output, "secret-value", "PowerShell WindowsSecureAuthPath JSON should not leak rejected command");
    }, boardState);

    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-BoardSummary",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell WindowsSecureAuthPath board summary failed\n${output}`);
      assertIncludes(output, `WindowsSecureAuthPath=${aliasSecureAuthCommand}.`, "PowerShell WindowsSecureAuthPath board summary");
      assertNotIncludes(output, "secret-value", "PowerShell WindowsSecureAuthPath board summary should not leak rejected command");
      console.log("[OK] PowerShell resume status extracts Windows secure-auth paths from Agent Link Board safely");
    }, boardState);
  });
}

async function checkBoardWindowsLanRiskExtraction(args) {
  await withMockHost(async (port) => {
    const boardState = {
      statuses: {
        "Windows Codex": {
          role: "Windows 端",
          status: "idle",
          note: [
            "Windows readiness reported LAN/firewall risk for current host.",
            "WindowsLanRisk=no-firewall-allow,public-profile",
          ].join(" "),
        },
      },
      events: [
        {
          type: "message",
          from: "Windows Codex",
          text: "WindowsLanRisk=no-firewall-allow --password secret-value",
        },
        {
          type: "status",
          from: "Windows Codex",
          text: "WindowsLanRisk=$(whoami)",
        },
        {
          type: "message",
          from: "Windows Codex",
          text: "WindowsLanRisk=no-firewall-allow secret:secret-value",
        },
        {
          type: "status",
          from: "Windows Codex",
          text: "WindowsLanRisk=no-firewall-allow,unknown-risk",
        },
      ],
    };

    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-Json",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell WindowsLanRisk JSON failed\n${output}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.windowsLanRisk?.found === true, "PowerShell WindowsLanRisk should be found");
      assert(payload.board.windowsLanRisk.summary === "no-firewall-allow,public-profile", "PowerShell WindowsLanRisk summary should keep safe labels");
      assert(payload.board.windowsLanRisk.risks?.includes("no-firewall-allow"), "PowerShell WindowsLanRisk should include no-firewall-allow");
      assert(payload.board.windowsLanRisk.risks?.includes("public-profile"), "PowerShell WindowsLanRisk should include public-profile");
      assert(payload.board.windowsLanRisk.rejectedCount >= 4, "PowerShell unsafe WindowsLanRisk candidates should be rejected");
      assertIncludes(payload.boardSummary, "WindowsLanRisk=no-firewall-allow,public-profile.", "PowerShell WindowsLanRisk JSON board summary");
      assertNotIncludes(output, "secret-value", "PowerShell WindowsLanRisk JSON should not leak rejected text");
      assertNotIncludes(output, "$(whoami)", "PowerShell WindowsLanRisk JSON should not leak command-like text");
    }, boardState);

    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-BoardSummary",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell WindowsLanRisk board summary failed\n${output}`);
      assertIncludes(output, "WindowsLanRisk=no-firewall-allow,public-profile.", "PowerShell WindowsLanRisk board summary");
      assertNotIncludes(output, "secret-value", "PowerShell WindowsLanRisk board summary should not leak rejected text");
      console.log("[OK] PowerShell resume status extracts Windows LAN risk from Agent Link Board safely");
    }, boardState);
  });
}

async function checkUserAuthRequest(args) {
  await withMockHost(async (port) => {
    const result = await runPowerShell([
      "-Discover",
      "-DiscoverNoLocalSubnets",
      "-HostName", "127.0.0.1",
      "-Port", String(port),
      "-UserAuthRequest",
      "-AllowMockVideo",
      "-SkipAudio",
      "-SkipClipboard",
      "-SkipInputLog",
    ], args);
    const output = `${result.stdout}\n${result.stderr}`;
    assert(result.exitCode === 0, `PowerShell userAuthRequest failed\n${output}`);
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    assert(lines.length === 1, `PowerShell userAuthRequest should be one line, got ${lines.length}`);
    assertIncludes(output, "NEED_USER_AUTH", "PowerShell userAuthRequest");
    assertIncludes(output, "Windows 本机隐藏输入 Mac host 正式密码", "PowerShell userAuthRequest");
    assertIncludes(output, "pwsh -NoProfile", "PowerShell userAuthRequest should prefer PowerShell 7 for prompt-password runs");
    assertIncludes(output, "-PromptPassword", "PowerShell userAuthRequest");
    assertIncludes(output, "inject 仍需", "PowerShell userAuthRequest");
    assertIncludes(output, "另行明确确认", "PowerShell userAuthRequest");
    assertNotIncludes(output, "test-password", "PowerShell userAuthRequest");
    console.log("[OK] PowerShell resume-status wrapper prints a secret-free user auth request");
  });
}

async function checkSendUserAuthRequest(args) {
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-SendUserAuthRequest",
        "-Json",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell sendUserAuthRequest failed\n${output}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.sentUserAuthRequest?.ok === true, "PowerShell send should pass");
      assert(board.messages.length === 1, `expected one board message, got ${board.messages.length}`);
      assert(board.messages[0].from === "Windows Codex", "PowerShell board sender mismatch");
      assertIncludes(board.messages[0].text, "NEED_USER_AUTH", "PowerShell sent userAuthRequest");
      assertIncludes(board.messages[0].text, "-PromptPassword", "PowerShell sent userAuthRequest");
      assertNotIncludes(JSON.stringify(board.messages), "test-password", "PowerShell sent userAuthRequest");
      console.log("[OK] PowerShell resume-status wrapper can send a secret-free user auth request");
    });
  });
}

async function checkSendAgentCallAck(args) {
  const secureAuthCommand = "node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port 45679 --promptPassword --requirePassword";
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-SendAgentCallAck",
        "-Json",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell sendAgentCallAck failed\n${output}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.sentAgentCallAck?.ok === true, "PowerShell AgentCallAck should pass");
      assert(board.messages.length === 1, `expected one board message, got ${board.messages.length}`);
      assert(board.messages[0].from === "Windows Codex", "PowerShell AgentCallAck sender mismatch");
      assertIncludes(board.messages[0].text, "WindowsSecureAuthPath 已提供", "PowerShell sent AgentCallAck");
      assertIncludes(board.messages[0].text, secureAuthCommand, "PowerShell sent AgentCallAck");
      assertIncludes(board.messages[0].text, "不要在 Agent Link Board 发送密码", "PowerShell sent AgentCallAck");
      assertNotIncludes(JSON.stringify(board.messages), "secret-value", "PowerShell sent AgentCallAck");
      assertNotIncludes(JSON.stringify(board.messages), "--password", "PowerShell sent AgentCallAck");
      console.log("[OK] PowerShell resume-status wrapper can send a secret-free AgentCallAck");
    }, {
      currentCall: secureAuthMacCallForWindows(),
      statuses: {
        "Windows Codex": {
          role: "Windows 端",
          status: "idle",
          note: `WindowsSecureAuthPath=${secureAuthCommand}`,
        },
      },
    });
  });
}

async function checkSendManualUxAck(args) {
  const macManualUxChecklist = "connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics";
  const macManualUxActiveText = `MacManualUx=status=calling ManualUxChecklist=${macManualUxChecklist} ManualUxLabels=连接/画面/声音/文本剪贴板/文件剪贴板/窗口/全屏/原画/复制诊断 Signals=manualUxCallInProgress Target=192.168.31.122:43770 Next=WaitForManualUxConfirmation Safety=no-password,no-input-inject NoFormalE2ERerun=true ManualUxCall=active warnings=none`;
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-SendManualUxAck",
        "-Json",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell sendManualUxAck failed\n${output}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.macManualUxAck?.status === "ready", "PowerShell active MacManualUx should prepare Windows manual UX ack");
      assertIncludes(payload.board.macManualUxAck.command, "MAC_MANUAL_UX_CONFIRMED", "PowerShell manual UX ack command");
      assertIncludes(payload.board.macManualUxAck.command, "WINDOWS_MANUAL_UX_ACK", "PowerShell manual UX ack command");
      assert(payload.sentManualUxAck?.requested === true, "PowerShell sendManualUxAck should be requested");
      assert(payload.sentManualUxAck?.ok === true, "PowerShell sendManualUxAck should pass");
      assert(board.messages.length === 1, `expected one PowerShell manual UX ack board message, got ${board.messages.length}`);
      assert(board.messages[0].from === "Windows Codex", "PowerShell ManualUxAck sender mismatch");
      assertIncludes(board.messages[0].text, "MAC_MANUAL_UX_CONFIRMED", "PowerShell sent ManualUxAck");
      assertIncludes(board.messages[0].text, "WINDOWS_MANUAL_UX_ACK", "PowerShell sent ManualUxAck");
      assertIncludes(board.messages[0].text, "5-10 分钟", "PowerShell sent ManualUxAck");
      assertIncludes(board.messages[0].text, macManualUxChecklist, "PowerShell sent ManualUxAck");
      assertIncludes(board.messages[0].text, "不请求密码", "PowerShell sent ManualUxAck");
      assertIncludes(board.messages[0].text, "不发送 input/inject", "PowerShell sent ManualUxAck");
      assertNotIncludes(JSON.stringify(board.messages), "secret-value", "PowerShell sent ManualUxAck");
      assertNotIncludes(JSON.stringify(board.messages), "--password", "PowerShell sent ManualUxAck");
      console.log("[OK] PowerShell resume-status wrapper can send a secret-free ManualUxAck");
    }, {
      currentCall: manualUxCallForWindows(),
      statuses: {
        "Mac Codex": {
          role: "Mac 端",
          status: "calling",
          note: macManualUxActiveText,
        },
      },
    });
  });
}
async function checkSendManualUxAckBlockedByGate(args) {
  const macManualUxChecklist = "connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics";
  const macManualUxActiveText = `MacManualUx=status=calling ManualUxChecklist=${macManualUxChecklist} ManualUxLabels=连接/画面/声音/文本剪贴板/文件剪贴板/窗口/全屏/原画/复制诊断 Signals=manualUxCallInProgress Target=192.168.31.122:43770 Next=WaitForManualUxConfirmation Safety=no-password,no-input-inject NoFormalE2ERerun=true ManualUxCall=active MacManualUxGate=wait-windows-codex-push warnings=windows-codex-pushing`;
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-SendManualUxAck",
        "-Json",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode !== 0, `PowerShell sendManualUxAck should fail while MacManualUxGate is active\n${output}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.macManualUx?.gate === "wait-windows-codex-push", "PowerShell gated MacManualUx should be parsed");
      assert(payload.board?.macManualUxAck?.status === "blocked", "PowerShell gated MacManualUx should block sendManualUxAck");
      assert(payload.board.macManualUxAck.reason === "mac-manual-ux-gated", "PowerShell gated MacManualUx block reason mismatch");
      assert(payload.sentManualUxAck?.requested === true, "PowerShell gated sendManualUxAck should be requested");
      assert(payload.sentManualUxAck?.ok === false, "PowerShell gated sendManualUxAck should fail");
      assert(board.messages.length === 0, `PowerShell gated ManualUxAck should not post a board message, got ${board.messages.length}`);
      console.log("[OK] PowerShell resume-status wrapper blocks ManualUxAck while MacManualUxGate is active");
    }, {
      currentCall: manualUxCallForWindows(),
      statuses: {
        "Mac Codex": {
          role: "Mac 端",
          status: "calling",
          note: macManualUxActiveText,
        },
      },
    });
  });
}

async function checkOfflineDefaults(args) {
  const result = await runPowerShell([
    "-NoDiscover",
    "-HostName", "127.0.0.1",
    "-Port", "9",
    "-Json",
  ], args);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.exitCode === 0, `offline JSON should stay non-failing without -RequireMacReady\n${output}`);
  const payload = JSON.parse(result.stdout);
  assert(payload.ok === true, "offline JSON should be ok=true without RequireMacReady");
  assert(payload.macPreflight?.payload?.online === false, "offline JSON should report offline Mac");
  assertIncludes(payload.boardSummary, "mac=offline", "offline JSON board summary");
  assertNotIncludes(output, "Mac host password", "offline JSON");
  console.log("[OK] PowerShell resume-status wrapper keeps offline Mac non-failing by default");
}

async function checkRequireMacReady(args) {
  const result = await runPowerShell([
    "-NoDiscover",
    "-HostName", "127.0.0.1",
    "-Port", "9",
    "-Json",
    "-RequireMacReady",
  ], args);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.exitCode !== 0, "RequireMacReady offline path should fail");
  const payload = JSON.parse(result.stdout);
  assert(payload.ok === false, "RequireMacReady offline JSON should be ok=false");
  assert(payload.failedChecks?.some((check) => check.name === "requireMacReady"), "RequireMacReady failure should be named");
  assertNotIncludes(output, "Mac host password", "RequireMacReady JSON");
  console.log("[OK] PowerShell resume-status wrapper honors -RequireMacReady");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  await checkWrapperHelp(args);
  await checkMockJson(args);
  await checkCustomClientDiagnosticsPorts(args);
  await checkBoardSummary(args);
  await checkBoardCurrentCallSummary(args);
  await checkBoardCurrentCallJson(args);
  await checkSecureAuthCallNextSummary(args);
  await checkBoardMacHeartbeatHealthExtraction(args);
  await checkBoardMacPowerAndUnattendedHealthExtraction(args);
  await checkBoardMacHostSafeStartExtraction(args);
  await checkBoardWindowsSecureAuthPathExtraction(args);
  await checkBoardWindowsLanRiskExtraction(args);
  await checkUserAuthRequest(args);
  await checkSendUserAuthRequest(args);
  await checkSendAgentCallAck(args);
  await checkSendManualUxAck(args);
  await checkSendManualUxAckBlockedByGate(args);
  await checkOfflineDefaults(args);
  await checkRequireMacReady(args);
  console.log("[OK] PowerShell resume-status wrapper regression passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
