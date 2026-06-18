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

async function checkWrapperHelp(args) {
  const result = await runPowerShell(["-Help"], args);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.exitCode === 0, `PowerShell wrapper help failed\n${output}`);
  assertIncludes(output, "Usage:", "PowerShell wrapper help");
  assertIncludes(output, "-CheckBoard -BoardSummary", "PowerShell wrapper help");
  assertIncludes(output, "-UserAuthRequest", "PowerShell wrapper help");
  assertIncludes(output, "current Agent Link", "PowerShell wrapper help");
  assertIncludes(output, "MacHostSafeStart=", "PowerShell wrapper help");
  assertIncludes(output, "MacMaxFpsSafeStart=", "PowerShell wrapper help");
  assertIncludes(output, "MacFormalLocalSmoke=", "PowerShell wrapper help");
  assertIncludes(output, "WindowsReverseGrantStatus=", "PowerShell wrapper help");
  assertIncludes(output, "WindowsOpenOneTimeReverseGrant=", "PowerShell wrapper help");
  assertIncludes(output, "WindowsSecureAuthPath=", "PowerShell wrapper help");
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
    ], args);
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
    assertIncludes(payload.userAuthRequest, "powershell.exe", "mock JSON userAuthRequest");
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
    assertIncludes(payload.macPreflight?.command, "--clientPort 5200", "PowerShell custom ports formal preflight command");
    assertIncludes(payload.macPreflight?.command, "--debugPort 9340", "PowerShell custom ports formal preflight command");
    assert(payload.windowsClientDiagnosticsPorts?.state === "occupied-stale-diagnostics", "PowerShell custom ports should detect stale diagnostics occupancy");
    assertIncludes(payload.boardSummary, "WinClientPorts=occupied(5200,9340;stale-diagnostics)", "PowerShell custom ports board summary");
    assertIncludes(payload.boardSummary, "WinClientPortsNext=use --clientPort 5201 --debugPort 9341", "PowerShell custom ports board summary");
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
    ], args);
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

async function checkBoardMacHostSafeStartExtraction(args) {
  const safeCommand = "node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43888";
  const maxFpsCommand = "node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43888 --maxScreenFps 60";
  const localSmokeCommand = "node scripts/mac/check-mac-formal-local-smoke.mjs --host 127.0.0.1 --port 43888 --promptPassword --boardSummary";
  const heartbeatOnceCommand = "node scripts/mac/watch-mac-heartbeat.mjs --once --sendStatus --boardSummary";
  const heartbeatWatchCommand = "node scripts/mac/watch-mac-heartbeat.mjs --sendStatus --intervalMs 30000";
  const heartbeatStartCommand = "node scripts/mac/start-mac-heartbeat-watcher.mjs --boardSummary";
  const heartbeatStatusCommand = "node scripts/mac/start-mac-heartbeat-watcher.mjs --status --boardSummary";
  const heartbeatStopCommand = "node scripts/mac/start-mac-heartbeat-watcher.mjs --stop --boardSummary";
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
          note: `MacHostReadiness=blocked blockers=host-offline warnings=none MacHostSafeStart=${safeCommand} MacMaxFpsSafeStart=${maxFpsCommand} MacFormalLocalSmoke=${localSmokeCommand} MacHeartbeatOnce=${heartbeatOnceCommand} MacHeartbeatWatch=${heartbeatWatchCommand} MacHeartbeatStart=${heartbeatStartCommand} MacHeartbeatStatus=${heartbeatStatusCommand} MacHeartbeatStop=${heartbeatStopCommand}`,
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
          type: "status",
          from: "Mac Codex",
          text: "RerunFormalLocalSmoke=node scripts/mac/check-mac-formal-local-smoke.mjs --host 127.0.0.1 --port <当前端口> --promptPassword --boardSummary",
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
    assertIncludes(output, "powershell.exe", "PowerShell userAuthRequest");
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
  await checkBoardMacHostSafeStartExtraction(args);
  await checkBoardWindowsSecureAuthPathExtraction(args);
  await checkUserAuthRequest(args);
  await checkSendUserAuthRequest(args);
  await checkOfflineDefaults(args);
  await checkRequireMacReady(args);
  console.log("[OK] PowerShell resume-status wrapper regression passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
