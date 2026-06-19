import { spawn } from "node:child_process";
import http from "node:http";
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

function run(extraArgs, args, env = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [script, ...extraArgs], {
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

async function withRuntimeDiscoveryHost(callback) {
  const buildId = "resume-runtime-build";
  const server = http.createServer((request, response) => {
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") {
      response.writeHead(204, headers);
      response.end();
      return;
    }
    if ((request.url ?? "").split("?")[0] !== "/discovery") {
      response.writeHead(404, headers);
      response.end(JSON.stringify({ ok: false, error: "not found" }));
      return;
    }
    const port = server.address().port;
    response.writeHead(200, headers);
    response.end(JSON.stringify({
      type: "lan_dual_discovery",
      protocolVersion: 1,
      deviceId: "resume-runtime-mac",
      deviceName: "Resume Runtime Mac",
      platform: "macos",
      role: "host",
      host: "127.0.0.1",
      port,
      controlPort: port,
      runtime: {
        buildId,
        processId: 24680,
        uptimeSeconds: 12,
      },
      capabilities: {
        video: true,
        h264Stream: true,
        audio: true,
        audioMode: "system-pcm",
        clipboardText: true,
        clipboardFile: true,
        inputMode: "log",
        mock: true,
        maxScreenFps: 30,
      },
      permissions: {
        screenRecording: true,
        accessibility: true,
        inputMonitoring: true,
      },
      lastSeenAt: new Date().toISOString(),
    }));
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  try {
    await callback(Number(address.port), buildId);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
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

function doneMacCallForWindows() {
  return {
    ...macCallForWindows(),
    status: "DONE",
    goal: "正式 Windows host 验收已完成",
    actual: "Windows confirmed readiness and posted results.",
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

async function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = await run([flag], args);
    assert(result.exitCode === 0, `help ${flag} failed\n${result.stdout}\n${result.stderr}`);
    assertIncludes(result.stdout, "Usage:", `help ${flag}`);
    assertIncludes(result.stdout, "--boardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "--checkBoard", `help ${flag}`);
    assertIncludes(result.stdout, "--clientPort", `help ${flag}`);
    assertIncludes(result.stdout, "--debugPort", `help ${flag}`);
    assertIncludes(result.stdout, "--sendAgentCallAck", `help ${flag}`);
    assertIncludes(result.stdout, "Windows host media-baseline", `help ${flag}`);
    assertIncludes(result.stdout, "check-windows-host-readiness.ps1 -CheckBoard -ProbeMedia -BoardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "one-time reverse-control grant", `help ${flag}`);
    assertIncludes(result.stdout, "Windows video encoder/WGC/WebCodecs support", `help ${flag}`);
    assertIncludes(result.stdout, "check-windows-video-encoder-support.mjs --boardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "check-windows-video-encoder-support.ps1 -BoardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "dedicated Windows Graphics Capture", `help ${flag}`);
    assertIncludes(result.stdout, "check-windows-wgc-support.mjs --boardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "check-windows-wgc-support.ps1 -BoardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "WGC H.264 raw-bgra vs NV12", `help ${flag}`);
    assertIncludes(result.stdout, "compare-windows-wgc-h264-sources.mjs --profile 60:20000:balanced", `help ${flag}`);
    assertIncludes(result.stdout, "compare-windows-wgc-h264-sources.ps1 -Profile 60:20000:balanced", `help ${flag}`);
    assertIncludes(result.stdout, "browser-only WebCodecs H.264", `help ${flag}`);
    assertIncludes(result.stdout, "check-webcodecs-h264-support.mjs --requireCodec avc1.42C02A --boardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "check-webcodecs-h264-support.ps1 -RequireCodec avc1.42C02A -BoardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "test-windows-client-browser.ps1 -Discover -DiscoverNoLocalSubnets", `help ${flag}`);
    assertIncludes(result.stdout, "local alert-watcher start/status commands", `help ${flag}`);
    assertIncludes(result.stdout, "MacDiscovery Node and PowerShell commands", `help ${flag}`);
    assertIncludes(result.stdout, "MacHostSafeStart=", `help ${flag}`);
    assertIncludes(result.stdout, "MacMaxFpsSafeStart=", `help ${flag}`);
    assertIncludes(result.stdout, "WindowsReverseGrantStatus=", `help ${flag}`);
    assertIncludes(result.stdout, "WindowsOpenOneTimeReverseGrant=", `help ${flag}`);
    assertIncludes(result.stdout, "WindowsSecureAuthPath=", `help ${flag}`);
    assertIncludes(result.stdout, "discover-lan-hosts.mjs --noLocalSubnets", `help ${flag}`);
    assertIncludes(result.stdout, "discover-lan-hosts.ps1 -NoLocalSubnets", `help ${flag}`);
    assertIncludes(result.stdout, "check-mac-host-readiness.mjs --host 192.168.31.122 --port 43770 --checkBoard --boardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "check-mac-heartbeat.mjs --host 192.168.31.122 --port 43770 --checkBoard --boardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "watch-mac-heartbeat.mjs --once --sendStatus --boardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "watch-mac-heartbeat.mjs --sendStatus --intervalMs 30000", `help ${flag}`);
    assertIncludes(result.stdout, "start-mac-heartbeat-watcher.mjs --boardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "start-mac-heartbeat-watcher.mjs --status --boardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "start-mac-heartbeat-watcher.mjs --stop --boardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "MacClientDiscoverWindows=", `help ${flag}`);
    assertIncludes(result.stdout, "discover-windows-hosts.mjs --checkBoard --boardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "MacClientFormalChecklist=", `help ${flag}`);
    assertIncludes(result.stdout, "check-mac-client-formal-status.mjs --discover --port 43770 --boardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "MacClientFormalSmoke=", `help ${flag}`);
    assertIncludes(result.stdout, "run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "check-mac-unattended-status.mjs --host 192.168.31.122 --port 43770 --boardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "check-mac-unattended-status.mjs --host 192.168.31.122 --port 43770 --requireLaunchAgentMaxFps --requireLaunchAgentLoaded --boardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "formal manual checklist command", `help ${flag}`);
    assertIncludes(result.stdout, "input_ack", `help ${flag}`);
    assertIncludes(result.stdout, "checks", `help ${flag}`);
    assertIncludes(result.stdout, "alert-watcher status read-only", `help ${flag}`);
    assertIncludes(result.stdout, "start-mac-alert-watcher.ps1", `help ${flag}`);
    assertIncludes(result.stdout, "allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Status -BoardSummary", `help ${flag}`);
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
    assert(String(payload.macPreflight?.command || "").includes("--clientPort 5197"), "mock JSON preflight should pass the default client port to formal preflight");
    assert(String(payload.macPreflight?.command || "").includes("--debugPort 9337"), "mock JSON preflight should pass the default debug port to formal preflight");
    assert(String(payload.boardSummary || "").includes("Windows resume:"), "mock JSON should include board summary");
    assert(String(payload.userAuthRequest || "").includes("NEED_USER_AUTH"), "mock JSON should include user auth request");
    assert(String(payload.userAuthRequest || "").includes("正式 Mac 端到端验收需要你在 Windows 本机隐藏输入"), "mock JSON should include formal auth wording");
    assert(String(payload.userAuthRequest || "").includes("powershell.exe"), "mock JSON user auth request should prefer PowerShell");
    assert(String(payload.userAuthRequest || "").includes("-PromptPassword"), "mock JSON user auth request should prompt for password");
    assert(String(payload.commands?.formalRun || "").includes("-PromptPassword"), "mock JSON should include formal command");
    assert(String(payload.commands?.macHostDiscoveryBoardSummary || "").includes("discover-lan-hosts.mjs"), "mock JSON should include Mac discovery command");
    assert(String(payload.commands?.macHostDiscoveryBoardSummary || "").includes("--noLocalSubnets"), "mock JSON Mac discovery should use fixed target discovery");
    assert(String(payload.commands?.macHostDiscoveryBoardSummary || "").includes("--host 127.0.0.1"), "mock JSON Mac discovery should target discovered host");
    assert(String(payload.commands?.macHostDiscoveryBoardSummary || "").includes(`--port ${port}`), "mock JSON Mac discovery should use discovered mock port");
    assert(String(payload.commands?.macHostDiscoveryBoardSummary || "").includes("--requireMacHost"), "mock JSON Mac discovery should require a Mac host");
    assert(String(payload.commands?.macHostDiscoveryBoardSummary || "").includes("--boardSummary"), "mock JSON Mac discovery should be board-safe");
    assert(String(payload.commands?.macHostDiscoveryPowerShellBoardSummary || "").includes("discover-lan-hosts.ps1"), "mock JSON should include Mac discovery PowerShell command");
    assert(String(payload.commands?.macHostDiscoveryPowerShellBoardSummary || "").includes("-NoLocalSubnets"), "mock JSON Mac discovery PowerShell should use fixed target discovery");
    assert(String(payload.commands?.macHostDiscoveryPowerShellBoardSummary || "").includes("-HostName 127.0.0.1"), "mock JSON Mac discovery PowerShell should target discovered host");
    assert(String(payload.commands?.macHostDiscoveryPowerShellBoardSummary || "").includes(`-Port ${port}`), "mock JSON Mac discovery PowerShell should use discovered mock port");
    assert(String(payload.commands?.macHostDiscoveryPowerShellBoardSummary || "").includes("-RequireMacHost"), "mock JSON Mac discovery PowerShell should require a Mac host");
    assert(String(payload.commands?.macHostDiscoveryPowerShellBoardSummary || "").includes("-BoardSummary"), "mock JSON Mac discovery PowerShell should be board-safe");
    assert(String(payload.commands?.macHostReadinessCommand || "").includes("check-mac-host-readiness.mjs"), "mock JSON should include Mac host readiness command");
    assert(String(payload.commands?.macHostReadinessCommand || "").includes("--host 127.0.0.1"), "mock JSON Mac host readiness command should target discovered host");
    assert(String(payload.commands?.macHostReadinessCommand || "").includes(`--port ${port}`), "mock JSON Mac host readiness command should use discovered mock port");
    assert(String(payload.commands?.macHostReadinessCommand || "").includes("--checkBoard"), "mock JSON Mac host readiness command should read Agent Link Board");
    assert(String(payload.commands?.macHostReadinessCommand || "").includes("--boardSummary"), "mock JSON Mac host readiness command should be board-safe");
    assert(String(payload.commands?.macHeartbeatCommand || "").includes("check-mac-heartbeat.mjs"), "mock JSON should include Mac heartbeat command");
    assert(String(payload.commands?.macHeartbeatCommand || "").includes("--host 127.0.0.1"), "mock JSON Mac heartbeat command should target discovered host");
    assert(String(payload.commands?.macHeartbeatCommand || "").includes(`--port ${port}`), "mock JSON Mac heartbeat command should use discovered mock port");
    assert(String(payload.commands?.macHeartbeatCommand || "").includes("--server http://192.168.31.68:17888"), "mock JSON Mac heartbeat command should include board server");
    assert(String(payload.commands?.macHeartbeatCommand || "").includes("--checkBoard"), "mock JSON Mac heartbeat command should read Agent Link Board");
    assert(String(payload.commands?.macHeartbeatCommand || "").includes("--boardSummary"), "mock JSON Mac heartbeat command should be board-safe");
    assert(String(payload.commands?.macHeartbeatOnceCommand || "").includes("watch-mac-heartbeat.mjs"), "mock JSON should include Mac heartbeat one-shot command");
    assert(String(payload.commands?.macHeartbeatOnceCommand || "").includes("--once"), "mock JSON Mac heartbeat one-shot command should run once");
    assert(String(payload.commands?.macHeartbeatOnceCommand || "").includes("--sendStatus"), "mock JSON Mac heartbeat one-shot command should post status");
    assert(String(payload.commands?.macHeartbeatOnceCommand || "").includes("--host 127.0.0.1"), "mock JSON Mac heartbeat one-shot command should target Mac loopback");
    assert(String(payload.commands?.macHeartbeatOnceCommand || "").includes(`--port ${port}`), "mock JSON Mac heartbeat one-shot command should use discovered Mac port");
    assert(String(payload.commands?.macHeartbeatOnceCommand || "").includes("--server http://192.168.31.68:17888"), "mock JSON Mac heartbeat one-shot command should include board server");
    assert(String(payload.commands?.macHeartbeatOnceCommand || "").includes("--boardSummary"), "mock JSON Mac heartbeat one-shot command should be board-safe");
    assert(String(payload.commands?.macHeartbeatWatchCommand || "").includes("watch-mac-heartbeat.mjs"), "mock JSON should include Mac heartbeat watcher command");
    assert(!String(payload.commands?.macHeartbeatWatchCommand || "").includes("--once"), "mock JSON Mac heartbeat watcher command should not be one-shot");
    assert(String(payload.commands?.macHeartbeatWatchCommand || "").includes("--sendStatus"), "mock JSON Mac heartbeat watcher command should post status");
    assert(String(payload.commands?.macHeartbeatWatchCommand || "").includes("--host 127.0.0.1"), "mock JSON Mac heartbeat watcher command should target Mac loopback");
    assert(String(payload.commands?.macHeartbeatWatchCommand || "").includes(`--port ${port}`), "mock JSON Mac heartbeat watcher command should use discovered Mac port");
    assert(String(payload.commands?.macHeartbeatWatchCommand || "").includes("--server http://192.168.31.68:17888"), "mock JSON Mac heartbeat watcher command should include board server");
    assert(String(payload.commands?.macHeartbeatWatchCommand || "").includes("--intervalMs 30000"), "mock JSON Mac heartbeat watcher command should use the default interval");
    assert(String(payload.commands?.macHeartbeatStartCommand || "").includes("start-mac-heartbeat-watcher.mjs"), "mock JSON should include Mac heartbeat background start command");
    assert(!String(payload.commands?.macHeartbeatStartCommand || "").includes("--status"), "mock JSON Mac heartbeat background start command should start by default");
    assert(!String(payload.commands?.macHeartbeatStartCommand || "").includes("--stop"), "mock JSON Mac heartbeat background start command should start by default");
    assert(String(payload.commands?.macHeartbeatStartCommand || "").includes("--host 127.0.0.1"), "mock JSON Mac heartbeat background start command should target Mac loopback");
    assert(String(payload.commands?.macHeartbeatStartCommand || "").includes(`--port ${port}`), "mock JSON Mac heartbeat background start command should use discovered Mac port");
    assert(String(payload.commands?.macHeartbeatStartCommand || "").includes("--server http://192.168.31.68:17888"), "mock JSON Mac heartbeat background start command should include board server");
    assert(String(payload.commands?.macHeartbeatStartCommand || "").includes("--intervalMs 30000"), "mock JSON Mac heartbeat background start command should use the default interval");
    assert(String(payload.commands?.macHeartbeatStartCommand || "").includes("--boardSummary"), "mock JSON Mac heartbeat background start command should be board-safe");
    assert(String(payload.commands?.macHeartbeatStatusCommand || "").includes("start-mac-heartbeat-watcher.mjs"), "mock JSON should include Mac heartbeat background status command");
    assert(String(payload.commands?.macHeartbeatStatusCommand || "").includes("--status"), "mock JSON Mac heartbeat background status command should use --status");
    assert(String(payload.commands?.macHeartbeatStatusCommand || "").includes("--host 127.0.0.1"), "mock JSON Mac heartbeat background status command should target Mac loopback");
    assert(String(payload.commands?.macHeartbeatStatusCommand || "").includes(`--port ${port}`), "mock JSON Mac heartbeat background status command should use discovered Mac port");
    assert(String(payload.commands?.macHeartbeatStatusCommand || "").includes("--server http://192.168.31.68:17888"), "mock JSON Mac heartbeat background status command should include board server");
    assert(String(payload.commands?.macHeartbeatStatusCommand || "").includes("--boardSummary"), "mock JSON Mac heartbeat background status command should be board-safe");
    assert(String(payload.commands?.macHeartbeatStopCommand || "").includes("start-mac-heartbeat-watcher.mjs"), "mock JSON should include Mac heartbeat background stop command");
    assert(String(payload.commands?.macHeartbeatStopCommand || "").includes("--stop"), "mock JSON Mac heartbeat background stop command should use --stop");
    assert(String(payload.commands?.macHeartbeatStopCommand || "").includes("--host 127.0.0.1"), "mock JSON Mac heartbeat background stop command should target Mac loopback");
    assert(String(payload.commands?.macHeartbeatStopCommand || "").includes(`--port ${port}`), "mock JSON Mac heartbeat background stop command should use discovered Mac port");
    assert(String(payload.commands?.macHeartbeatStopCommand || "").includes("--server http://192.168.31.68:17888"), "mock JSON Mac heartbeat background stop command should include board server");
    assert(String(payload.commands?.macHeartbeatStopCommand || "").includes("--boardSummary"), "mock JSON Mac heartbeat background stop command should be board-safe");
    assert(String(payload.commands?.macFormalLocalSmokeCommand || "").includes("check-mac-formal-local-smoke.mjs"), "mock JSON should include Mac formal local smoke command");
    assert(String(payload.commands?.macFormalLocalSmokeCommand || "").includes("--host 127.0.0.1"), "mock JSON Mac formal local smoke command should target discovered host");
    assert(String(payload.commands?.macFormalLocalSmokeCommand || "").includes(`--port ${port}`), "mock JSON Mac formal local smoke command should use discovered mock port");
    assert(String(payload.commands?.macFormalLocalSmokeCommand || "").includes("--promptPassword"), "mock JSON Mac formal local smoke command should prompt locally");
    assert(String(payload.commands?.macFormalLocalSmokeCommand || "").includes("--boardSummary"), "mock JSON Mac formal local smoke command should be board-safe");
    assert(!String(payload.commands?.macFormalLocalSmokeCommand || "").includes("--password"), "mock JSON Mac formal local smoke command should not include password argv");
    assert(String(payload.commands?.macClientDiscoverWindowsCommand || "").includes("discover-windows-hosts.mjs"), "mock JSON should include Mac client discover Windows command");
    assert(String(payload.commands?.macClientDiscoverWindowsCommand || "").includes("--checkBoard"), "mock JSON Mac client discover Windows command should read Agent Link Board");
    assert(String(payload.commands?.macClientDiscoverWindowsCommand || "").includes("--boardSummary"), "mock JSON Mac client discover Windows command should be board-safe");
    assert(!String(payload.commands?.macClientDiscoverWindowsCommand || "").includes("--password"), "mock JSON Mac client discover Windows command should not include password argv");
    assert(String(payload.commands?.macClientFormalChecklistCommand || "").includes("check-mac-client-formal-status.mjs"), "mock JSON should include Mac client formal checklist command");
    assert(String(payload.commands?.macClientFormalChecklistCommand || "").includes("--discover"), "mock JSON Mac client formal checklist command should discover Windows host");
    assert(String(payload.commands?.macClientFormalChecklistCommand || "").includes("--port 43770"), "mock JSON Mac client formal checklist command should target the default Windows host port");
    assert(String(payload.commands?.macClientFormalChecklistCommand || "").includes("--boardSummary"), "mock JSON Mac client formal checklist command should be board-safe");
    assert(!String(payload.commands?.macClientFormalChecklistCommand || "").includes("--password"), "mock JSON Mac client formal checklist command should not include password argv");
    assert(String(payload.commands?.macClientFormalSmokeCommand || "").includes("run-mac-client-formal-smoke.mjs"), "mock JSON should include Mac client formal smoke command");
    assert(String(payload.commands?.macClientFormalSmokeCommand || "").includes("--discover"), "mock JSON Mac client formal smoke command should discover Windows host");
    assert(String(payload.commands?.macClientFormalSmokeCommand || "").includes("--ensureClient"), "mock JSON Mac client formal smoke command should ensure Mac client page");
    assert(String(payload.commands?.macClientFormalSmokeCommand || "").includes("--preflightOnly"), "mock JSON Mac client formal smoke command should be preflight-only");
    assert(String(payload.commands?.macClientFormalSmokeCommand || "").includes("--boardSummary"), "mock JSON Mac client formal smoke command should be board-safe");
    assert(!String(payload.commands?.macClientFormalSmokeCommand || "").includes("--password"), "mock JSON Mac client formal smoke command should not include password argv");
    assert(String(payload.commands?.macUnattendedStatusCommand || "").includes("check-mac-unattended-status.mjs"), "mock JSON should include Mac unattended status command");
    assert(String(payload.commands?.macUnattendedStatusCommand || "").includes("--host 127.0.0.1"), "mock JSON Mac unattended command should target discovered host");
    assert(String(payload.commands?.macUnattendedStatusCommand || "").includes(`--port ${port}`), "mock JSON Mac unattended command should use discovered mock port");
    assert(String(payload.commands?.macUnattendedStatusCommand || "").includes("--boardSummary"), "mock JSON Mac unattended command should be board-safe");
    assert(String(payload.commands?.macUnattendedFormalStatusCommand || "").includes("check-mac-unattended-status.mjs"), "mock JSON should include formal Mac unattended status command");
    assert(String(payload.commands?.macUnattendedFormalStatusCommand || "").includes("--host 127.0.0.1"), "mock JSON formal Mac unattended command should target discovered host");
    assert(String(payload.commands?.macUnattendedFormalStatusCommand || "").includes(`--port ${port}`), "mock JSON formal Mac unattended command should use discovered mock port");
    assert(String(payload.commands?.macUnattendedFormalStatusCommand || "").includes("--requireLaunchAgentMaxFps"), "mock JSON formal Mac unattended command should require LaunchAgent max FPS");
    assert(String(payload.commands?.macUnattendedFormalStatusCommand || "").includes("--requireLaunchAgentLoaded"), "mock JSON formal Mac unattended command should require loaded LaunchAgent");
    assert(String(payload.commands?.macUnattendedFormalStatusCommand || "").includes("--boardSummary"), "mock JSON formal Mac unattended command should be board-safe");
    assert(String(payload.commands?.formalChecklistBoardSummary || "").includes("check-mac-formal-e2e.ps1"), "mock JSON should include formal checklist command");
    assert(String(payload.commands?.formalChecklistBoardSummary || "").includes("-DiscoverNoLocalSubnets"), "mock JSON formal checklist should use fixed target discovery");
    assert(String(payload.commands?.formalChecklistBoardSummary || "").includes("-PreflightOnly"), "mock JSON formal checklist should be preflight-only");
    assert(String(payload.commands?.formalChecklistBoardSummary || "").includes("-CheckClientDiagnostics"), "mock JSON formal checklist should include client diagnostics");
    assert(String(payload.commands?.formalChecklistBoardSummary || "").includes("-BoardSummary"), "mock JSON formal checklist should be board-safe");
    assert(String(payload.commands?.formalChecklistBoardSummary || "").includes(`-Port ${port}`), "mock JSON formal checklist should use discovered mock port");
    assert(payload.formalManualChecklist?.summary === "connection/video/audio/clipboard/input_ack/diagnostics", "mock JSON should include manual checklist summary");
    assert(payload.formalManualChecklist?.fromPreflight === true, "mock JSON manual checklist should come from formal preflight");
    assert(Array.isArray(payload.formalManualChecklist?.ids) && payload.formalManualChecklist.ids.includes("input_ack"), "mock JSON manual checklist should include input_ack");
    assert(String(payload.commands?.windowsHostMediaReadinessBoardSummary || "").includes("check-windows-host-readiness.mjs"), "mock JSON should include Windows host media readiness command");
    assert(String(payload.commands?.windowsHostMediaReadinessBoardSummary || "").includes("--probeMedia"), "mock JSON media readiness command should enable --probeMedia");
    assert(String(payload.commands?.windowsHostMediaReadinessBoardSummary || "").includes("--boardSummary"), "mock JSON media readiness command should be board-safe");
    assert(String(payload.commands?.windowsSecureAuthPath || "").includes("start-windows-host.mjs"), "mock JSON should include Windows secure auth path");
    assert(String(payload.commands?.windowsSecureAuthPath || "").includes("--host 0.0.0.0"), "mock JSON Windows secure auth path should expose LAN host binding");
    assert(String(payload.commands?.windowsSecureAuthPath || "").includes("--port 43770"), "mock JSON Windows secure auth path should use Windows host port");
    assert(String(payload.commands?.windowsSecureAuthPath || "").includes("--promptPassword"), "mock JSON Windows secure auth path should prompt locally");
    assert(String(payload.commands?.windowsSecureAuthPath || "").includes("--requirePassword"), "mock JSON Windows secure auth path should require a non-empty password");
    assert(!String(payload.commands?.windowsSecureAuthPath || "").includes("--password"), "mock JSON Windows secure auth path should not include password argv");
    assert(String(payload.commands?.windowsFirewallStatusBoardSummary || "").includes("check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --json"), "mock JSON should include Windows firewall status command");
    assert(String(payload.commands?.windowsFirewallPreviewBoardSummary || "").includes("check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --dryRunRule --ruleProfile Private"), "mock JSON should include dry-run-only Windows firewall preview command");
    assert(!String(payload.commands?.windowsFirewallPreviewBoardSummary || "").includes("--addRule"), "mock JSON Windows firewall preview command should not change firewall");
    assert(String(payload.commands?.windowsHostMediaReadinessPowerShellBoardSummary || "").includes("check-windows-host-readiness.ps1"), "mock JSON should include Windows host media PowerShell command");
    assert(String(payload.commands?.windowsHostMediaReadinessPowerShellBoardSummary || "").includes("-ProbeMedia"), "mock JSON media PowerShell command should enable -ProbeMedia");
    assert(String(payload.commands?.windowsHostMediaReadinessPowerShellBoardSummary || "").includes("-BoardSummary"), "mock JSON media PowerShell command should be board-safe");
    assert(String(payload.commands?.windowsVideoEncoderSupportBoardSummary || "").includes("check-windows-video-encoder-support.mjs"), "mock JSON should include Windows video encoder support command");
    assert(String(payload.commands?.windowsVideoEncoderSupportBoardSummary || "").includes("--boardSummary"), "mock JSON video encoder command should be board-safe");
    assert(String(payload.commands?.windowsVideoEncoderSupportPowerShellBoardSummary || "").includes("check-windows-video-encoder-support.ps1"), "mock JSON should include Windows video encoder PowerShell command");
    assert(String(payload.commands?.windowsVideoEncoderSupportPowerShellBoardSummary || "").includes("-BoardSummary"), "mock JSON video encoder PowerShell command should be board-safe");
    assert(String(payload.commands?.windowsWgcSupportBoardSummary || "").includes("check-windows-wgc-support.mjs"), "mock JSON should include Windows WGC support command");
    assert(String(payload.commands?.windowsWgcSupportBoardSummary || "").includes("--boardSummary"), "mock JSON WGC command should be board-safe");
    assert(String(payload.commands?.windowsWgcSupportPowerShellBoardSummary || "").includes("check-windows-wgc-support.ps1"), "mock JSON should include Windows WGC PowerShell command");
    assert(String(payload.commands?.windowsWgcSupportPowerShellBoardSummary || "").includes("-BoardSummary"), "mock JSON WGC PowerShell command should be board-safe");
    assert(String(payload.commands?.windowsWgcBenchmarkBoardSummary || "").includes("benchmark-windows-wgc-settings.mjs"), "mock JSON should include Windows WGC benchmark command");
    assert(String(payload.commands?.windowsWgcBenchmarkBoardSummary || "").includes("--profile 60:20000:balanced"), "mock JSON WGC benchmark command should use the default profile");
    assert(String(payload.commands?.windowsWgcBenchmarkBoardSummary || "").includes("--durationMs 1800"), "mock JSON WGC benchmark command should use the short board duration");
    assert(String(payload.commands?.windowsWgcBenchmarkBoardSummary || "").includes("--boardSummary"), "mock JSON WGC benchmark command should be board-safe");
    assert(String(payload.commands?.windowsWgcBenchmarkPowerShellBoardSummary || "").includes("benchmark-windows-wgc-settings.ps1"), "mock JSON should include Windows WGC benchmark PowerShell command");
    assert(String(payload.commands?.windowsWgcBenchmarkPowerShellBoardSummary || "").includes("-Profile 60:20000:balanced"), "mock JSON WGC benchmark PowerShell command should use the default profile");
    assert(String(payload.commands?.windowsWgcBenchmarkPowerShellBoardSummary || "").includes("-DurationMs 1800"), "mock JSON WGC benchmark PowerShell command should use the short board duration");
    assert(String(payload.commands?.windowsWgcBenchmarkPowerShellBoardSummary || "").includes("-BoardSummary"), "mock JSON WGC benchmark PowerShell command should be board-safe");
    assert(String(payload.commands?.windowsWgcH264SourceCompareBoardSummary || "").includes("compare-windows-wgc-h264-sources.mjs"), "mock JSON should include Windows WGC compare command");
    assert(String(payload.commands?.windowsWgcH264SourceCompareBoardSummary || "").includes("--profile 60:20000:balanced"), "mock JSON WGC compare command should use the default profile");
    assert(String(payload.commands?.windowsWgcH264SourceCompareBoardSummary || "").includes("--boardSummary"), "mock JSON WGC compare command should be board-safe");
    assert(String(payload.commands?.windowsWgcH264SourceComparePowerShellBoardSummary || "").includes("compare-windows-wgc-h264-sources.ps1"), "mock JSON should include Windows WGC compare PowerShell command");
    assert(String(payload.commands?.windowsWgcH264SourceComparePowerShellBoardSummary || "").includes("-Profile 60:20000:balanced"), "mock JSON WGC compare PowerShell command should use the default profile");
    assert(String(payload.commands?.windowsWgcH264SourceComparePowerShellBoardSummary || "").includes("-BoardSummary"), "mock JSON WGC compare PowerShell command should be board-safe");
    assert(String(payload.commands?.windowsWebCodecsH264BoardSummary || "").includes("check-webcodecs-h264-support.mjs"), "mock JSON should include Windows WebCodecs H.264 command");
    assert(String(payload.commands?.windowsWebCodecsH264BoardSummary || "").includes("--requireCodec avc1.42C02A"), "mock JSON WebCodecs command should require the baseline codec");
    assert(String(payload.commands?.windowsWebCodecsH264BoardSummary || "").includes("--boardSummary"), "mock JSON WebCodecs command should be board-safe");
    assert(String(payload.commands?.windowsWebCodecsH264PowerShellBoardSummary || "").includes("check-webcodecs-h264-support.ps1"), "mock JSON should include Windows WebCodecs H.264 PowerShell command");
    assert(String(payload.commands?.windowsWebCodecsH264PowerShellBoardSummary || "").includes("-RequireCodec avc1.42C02A"), "mock JSON WebCodecs PowerShell command should require the baseline codec");
    assert(String(payload.commands?.windowsWebCodecsH264PowerShellBoardSummary || "").includes("-BoardSummary"), "mock JSON WebCodecs PowerShell command should be board-safe");
    assert(String(payload.commands?.windowsPowerShellHelpBoardSummary || "").includes("test-windows-powershell-help.mjs"), "mock JSON should include Windows PowerShell help command");
    assert(String(payload.commands?.windowsPowerShellHelpBoardSummary || "").includes("--timeoutMs 10000"), "mock JSON PowerShell help command should set a stable timeout");
    assert(String(payload.commands?.windowsPowerShellHelpBoardSummary || "").includes("--boardSummary"), "mock JSON PowerShell help command should be board-safe");
    assert(String(payload.commands?.windowsPowerShell7HelpBoardSummary || "").includes("test-windows-powershell-help.mjs"), "mock JSON should include Windows PowerShell 7 help command");
    assert(String(payload.commands?.windowsPowerShell7HelpBoardSummary || "").includes("--shell pwsh"), "mock JSON PowerShell 7 help command should select pwsh");
    assert(String(payload.commands?.windowsPowerShell7HelpBoardSummary || "").includes("--boardSummary"), "mock JSON PowerShell 7 help command should be board-safe");
    assert(String(payload.commands?.windowsReverseControlGrantBoardSummary || "").includes("allow-windows-reverse-control.mjs"), "mock JSON should include Windows reverse grant command");
    assert(String(payload.commands?.windowsReverseControlGrantBoardSummary || "").includes("--host 127.0.0.1"), "mock JSON reverse grant command should be local-only");
    assert(String(payload.commands?.windowsReverseControlGrantBoardSummary || "").includes("--port 43770"), "mock JSON reverse grant command should target the default Windows host port");
    assert(String(payload.commands?.windowsReverseControlGrantBoardSummary || "").includes("--durationMs 30000"), "mock JSON reverse grant command should be time-limited");
    assert(String(payload.commands?.windowsReverseControlGrantBoardSummary || "").includes("--boardSummary"), "mock JSON reverse grant command should be board-safe");
    assert(String(payload.commands?.windowsReverseControlGrantPowerShellBoardSummary || "").includes("allow-windows-reverse-control.ps1"), "mock JSON should include Windows reverse grant PowerShell command");
    assert(String(payload.commands?.windowsReverseControlGrantPowerShellBoardSummary || "").includes("-HostName 127.0.0.1"), "mock JSON reverse grant PowerShell command should be local-only");
    assert(String(payload.commands?.windowsReverseControlGrantPowerShellBoardSummary || "").includes("-Port 43770"), "mock JSON reverse grant PowerShell command should target the default Windows host port");
    assert(String(payload.commands?.windowsReverseControlGrantPowerShellBoardSummary || "").includes("-DurationMs 30000"), "mock JSON reverse grant PowerShell command should be time-limited");
    assert(String(payload.commands?.windowsReverseControlGrantPowerShellBoardSummary || "").includes("-BoardSummary"), "mock JSON reverse grant PowerShell command should be board-safe");
    assert(String(payload.commands?.windowsReverseGrantStatusBoardSummary || "").includes("allow-windows-reverse-control.mjs"), "mock JSON should include Windows reverse grant status Node command");
    assert(String(payload.commands?.windowsReverseGrantStatusBoardSummary || "").includes("--status"), "mock JSON reverse grant status Node command should use --status");
    assert(String(payload.commands?.windowsReverseGrantStatusBoardSummary || "").includes("--boardSummary"), "mock JSON reverse grant status Node command should be board-safe");
    assert(String(payload.commands?.windowsReverseGrantStatusPowerShellBoardSummary || "").includes("allow-windows-reverse-control.ps1"), "mock JSON should include Windows reverse grant status PowerShell command");
    assert(String(payload.commands?.windowsReverseGrantStatusPowerShellBoardSummary || "").includes("-Status"), "mock JSON reverse grant status PowerShell command should use -Status");
    assert(String(payload.commands?.windowsReverseGrantStatusPowerShellBoardSummary || "").includes("-BoardSummary"), "mock JSON reverse grant status PowerShell command should be board-safe");
    assert(String(payload.commands?.windowsOpenOneTimeReverseGrantBoardSummary || "").includes("allow-windows-reverse-control.mjs"), "mock JSON should include Windows one-time reverse grant Node command");
    assert(String(payload.commands?.windowsOpenOneTimeReverseGrantBoardSummary || "").includes("--grant"), "mock JSON one-time reverse grant Node command should use --grant");
    assert(String(payload.commands?.windowsOpenOneTimeReverseGrantBoardSummary || "").includes("--durationMs 30000"), "mock JSON one-time reverse grant Node command should be time-limited");
    assert(String(payload.commands?.windowsOpenOneTimeReverseGrantBoardSummary || "").includes("--boardSummary"), "mock JSON one-time reverse grant Node command should be board-safe");
    assert(String(payload.commands?.windowsOpenOneTimeReverseGrantPowerShellBoardSummary || "").includes("allow-windows-reverse-control.ps1"), "mock JSON should include Windows one-time reverse grant PowerShell command");
    assert(String(payload.commands?.windowsOpenOneTimeReverseGrantPowerShellBoardSummary || "").includes("-Grant"), "mock JSON one-time reverse grant PowerShell command should use -Grant");
    assert(String(payload.commands?.windowsOpenOneTimeReverseGrantPowerShellBoardSummary || "").includes("-DurationMs 30000"), "mock JSON one-time reverse grant PowerShell command should be time-limited");
    assert(String(payload.commands?.windowsOpenOneTimeReverseGrantPowerShellBoardSummary || "").includes("-BoardSummary"), "mock JSON one-time reverse grant PowerShell command should be board-safe");
    assert(String(payload.commands?.windowsClientDiagnosticsCommand || "").includes("test-windows-client-browser.mjs"), "mock JSON should include Windows client diagnostics command");
    assert(String(payload.commands?.windowsClientDiagnosticsCommand || "").includes("--diagnosticsOnly"), "mock JSON client diagnostics should be no-auth diagnostics only");
    assert(String(payload.commands?.windowsClientDiagnosticsCommand || "").includes("--boardSummary"), "mock JSON client diagnostics should be board-safe");
    assert(String(payload.commands?.windowsClientDiagnosticsCommand || "").includes("--discoverNoLocalSubnets"), "mock JSON client diagnostics should target the known host without scanning the whole LAN");
    assert(String(payload.commands?.windowsClientDiagnosticsCommand || "").includes(`--port ${port}`), "mock JSON client diagnostics should use the discovered Mac port");
    assert(String(payload.commands?.windowsClientDiagnosticsCommand || "").includes("--clientPort 5197"), "mock JSON client diagnostics should show the default local page port");
    assert(String(payload.commands?.windowsClientDiagnosticsCommand || "").includes("--debugPort 9337"), "mock JSON client diagnostics should show the default browser debug port");
    assert(String(payload.commands?.windowsClientDiagnosticsAlternateCommand || "").includes("--clientPort 5200"), "mock JSON client diagnostics should include an alternate page port command");
    assert(String(payload.commands?.windowsClientDiagnosticsAlternateCommand || "").includes("--debugPort 9340"), "mock JSON client diagnostics should include an alternate browser debug port command");
    assert(String(payload.commands?.windowsClientDiagnosticsPowerShellCommand || "").includes("test-windows-client-browser.ps1"), "mock JSON should include Windows client diagnostics PowerShell command");
    assert(String(payload.commands?.windowsClientDiagnosticsPowerShellCommand || "").includes("-DiscoverNoLocalSubnets"), "mock JSON client diagnostics PowerShell should target the known host without scanning the whole LAN");
    assert(String(payload.commands?.windowsClientDiagnosticsPowerShellCommand || "").includes(`-Port ${port}`), "mock JSON client diagnostics PowerShell should use the discovered Mac port");
    assert(String(payload.commands?.windowsClientDiagnosticsPowerShellCommand || "").includes("-ClientPort 5197"), "mock JSON client diagnostics PowerShell should show the default local page port");
    assert(String(payload.commands?.windowsClientDiagnosticsPowerShellCommand || "").includes("-DebugPort 9337"), "mock JSON client diagnostics PowerShell should show the default browser debug port");
    assert(String(payload.commands?.windowsClientDiagnosticsPowerShellCommand || "").includes("-DiagnosticsOnly"), "mock JSON client diagnostics PowerShell should be no-auth diagnostics only");
    assert(String(payload.commands?.windowsClientDiagnosticsPowerShellCommand || "").includes("-BoardSummary"), "mock JSON client diagnostics PowerShell should be board-safe");
    assert(String(payload.commands?.windowsClientDiagnosticsAlternatePowerShellCommand || "").includes("-ClientPort 5200"), "mock JSON client diagnostics PowerShell should include an alternate page port command");
    assert(String(payload.commands?.windowsClientDiagnosticsAlternatePowerShellCommand || "").includes("-DebugPort 9340"), "mock JSON client diagnostics PowerShell should include an alternate browser debug port command");
    assert(payload.windowsClientDiagnosticsPorts?.requested === true, "mock JSON should inspect Windows client diagnostics ports");
    assert(payload.windowsClientDiagnosticsPorts?.clientPort === 5197, "mock JSON should record the default Windows client diagnostics port");
    assert(payload.windowsClientDiagnosticsPorts?.debugPort === 9337, "mock JSON should record the default Windows client debug port");
    assert(typeof payload.windowsClientDiagnosticsPorts?.summary === "string", "mock JSON should include a stable client ports summary");
    assert(String(payload.commands?.windowsClientCopyDiagnosticsAction || "").includes("复制诊断"), "mock JSON should include in-page copy diagnostics action");
    assert(String(payload.commands?.windowsClientCopyDiagnosticsAction || "").includes("快速摘要"), "mock JSON copy diagnostics action should mention the quick summary");
    assert(String(payload.commands?.windowsMacAlertWatcherStart || "").includes("start-mac-alert-watcher.ps1"), "mock JSON should include Windows Mac alert watcher start command");
    assert(String(payload.commands?.windowsMacAlertWatcherStart || "").includes("-Server http://192.168.31.68:17888"), "mock JSON watcher start command should include the board server");
    assert(!String(payload.commands?.windowsMacAlertWatcherStart || "").includes("-Status"), "mock JSON watcher start command should not be the status check");
    assert(String(payload.commands?.windowsMacAlertWatcherStatus || "").includes("start-mac-alert-watcher.ps1"), "mock JSON should include Windows Mac alert watcher status command");
    assert(String(payload.commands?.windowsMacAlertWatcherStatus || "").includes("-Server http://192.168.31.68:17888"), "mock JSON watcher status command should include the board server");
    assert(String(payload.commands?.windowsMacAlertWatcherStatus || "").includes("-Status"), "mock JSON watcher status command should be status-only");
    assert(payload.windowsMacAlertWatcher?.requested === true, "mock JSON should check Windows Mac alert watcher status");
    assert(payload.windowsMacAlertWatcher?.command === payload.commands?.windowsMacAlertWatcherStatus, "watcher status should report the same status command");
    assert(payload.windowsMacAlertWatcher?.source === "json", "watcher status should consume start-mac-alert-watcher -Json output");
    assert(payload.windowsMacAlertWatcher?.payload?.action === "status", "watcher status should expose the parsed JSON payload");
    assert(payload.windowsMacAlertWatcher?.parseError === "", "watcher status JSON parse should not fail");
    assert(["running", "not-running", "unknown", "unavailable"].includes(payload.windowsMacAlertWatcher?.state), "watcher status should have a stable state");
    assert(payload.windowsMacAlertWatcher?.running === true || payload.windowsMacAlertWatcher?.running === false || payload.windowsMacAlertWatcher?.running === null, "watcher running should be boolean or null");
    assert(Array.isArray(payload.windowsMacAlertWatcher?.stdoutTail), "watcher status should include stdout tail");
    assertNotIncludes(result.stdout + result.stderr, "test-password", "mock JSON");
    console.log("[OK] Windows resume status JSON summarizes mock Mac preflight");
  });
}

async function checkRuntimeBuildClientDiagnosticsCommand(args) {
  await withRuntimeDiscoveryHost(async (port, buildId) => {
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
    assert(result.exitCode === 0, `runtime discovery JSON resume failed\n${result.stdout}\n${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert(payload.macPreflight?.payload?.runtime?.buildId === buildId, "preflight should expose runtime build id");
    assertIncludes(
      payload.commands?.windowsClientDiagnosticsCommand,
      `--expectDiscoveryRuntimeBuildId ${buildId}`,
      "runtime JSON client diagnostics command",
    );
    assertIncludes(
      payload.commands?.windowsClientDiagnosticsPowerShellCommand,
      `-ExpectDiscoveryRuntimeBuildId ${buildId}`,
      "runtime JSON client diagnostics PowerShell command",
    );
    assertIncludes(
      payload.boardSummary,
      `--expectDiscoveryRuntimeBuildId ${buildId}`,
      "runtime board summary client diagnostics command",
    );
    assertIncludes(
      payload.boardSummary,
      `-ExpectDiscoveryRuntimeBuildId ${buildId}`,
      "runtime board summary client diagnostics PowerShell command",
    );
    assertNotIncludes(result.stdout + result.stderr, "test-password", "runtime JSON");
    console.log("[OK] Windows resume status client diagnostics command pins discovery runtime build");
  });
}

async function checkWindowsClientDiagnosticsPortOccupancy(args) {
  await withMockHost(async (port) => {
    const fakePorts = JSON.stringify({
      owners: [
        {
          localAddress: "127.0.0.1",
          localPort: 5197,
          state: "Listen",
          owningProcess: 61088,
          processName: "node.exe",
          commandLine: "node.exe apps/windows-client/server.mjs 5197",
        },
        {
          localAddress: "::1",
          localPort: 9337,
          state: "Listen",
          owningProcess: 44488,
          processName: "msedge.exe",
          commandLine: "msedge.exe --remote-debugging-port=9337 --user-data-dir=C:\\Temp\\lan-dual-edge-old",
        },
      ],
    });
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
    ], args, {
      LAN_DUAL_FAKE_WINDOWS_CLIENT_PORTS_JSON: fakePorts,
    });
    assert(result.exitCode === 0, `occupied client ports JSON resume failed\n${result.stdout}\n${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    const ports = payload.windowsClientDiagnosticsPorts;
    assert(ports?.available === false, "occupied client ports should not be available");
    assert(ports?.state === "occupied-stale-diagnostics", `occupied client ports should be stale diagnostics, got ${ports?.state}`);
    assert(Array.isArray(ports?.occupiedPorts) && ports.occupiedPorts.includes(5197), "occupied client ports should include page port");
    assert(Array.isArray(ports?.occupiedPorts) && ports.occupiedPorts.includes(9337), "occupied client ports should include debug port");
    assertIncludes(payload.boardSummary, "WinClientPorts=occupied(5197,9337;stale-diagnostics)", "occupied client ports board summary");
    assertIncludes(payload.boardSummary, "WinClientPortsNext=use --clientPort 5200 --debugPort 9340", "occupied client ports board summary");
    assertIncludes(payload.boardSummary, "WinClientDiagnosticsAlt=", "occupied client ports board summary");
    assertIncludes(payload.boardSummary, "--clientPort 5200 --debugPort 9340", "occupied client ports board summary");
    assertNotIncludes(result.stdout + result.stderr, "test-password", "occupied client ports JSON");
    console.log("[OK] Windows resume status warns about occupied client diagnostics ports");
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
    assertIncludes(result.stdout, "WinClientPorts=", "board summary");
    assertIncludes(result.stdout, "WinClientPortsNext=", "board summary");
    assertIncludes(result.stdout, "MacDiscovery=", "board summary");
    assertIncludes(result.stdout, "discover-lan-hosts.mjs --noLocalSubnets --host 127.0.0.1", "board summary");
    assertIncludes(result.stdout, "--requireMacHost --boardSummary", "board summary");
    assertIncludes(result.stdout, "MacDiscoveryPs=", "board summary");
    assertIncludes(result.stdout, "discover-lan-hosts.ps1 -NoLocalSubnets -HostName 127.0.0.1", "board summary");
    assertIncludes(result.stdout, "-RequireMacHost -BoardSummary", "board summary");
    assertIncludes(result.stdout, "MacHostReadiness=", "board summary");
    assertIncludes(result.stdout, "check-mac-host-readiness.mjs --host 127.0.0.1", "board summary");
    assertIncludes(result.stdout, `--port ${port} --checkBoard --boardSummary`, "board summary");
    assertIncludes(result.stdout, "MacHeartbeat=", "board summary");
    assertIncludes(result.stdout, "check-mac-heartbeat.mjs --host 127.0.0.1", "board summary");
    assertIncludes(result.stdout, `--port ${port} --server http://192.168.31.68:17888 --checkBoard --boardSummary`, "board summary");
    assertIncludes(result.stdout, "MacHeartbeatOnce=", "board summary");
    assertIncludes(result.stdout, "watch-mac-heartbeat.mjs --once --sendStatus --host 127.0.0.1", "board summary");
    assertIncludes(result.stdout, `--port ${port} --server http://192.168.31.68:17888 --boardSummary`, "board summary");
    assertIncludes(result.stdout, "MacHeartbeatWatch=", "board summary");
    assertIncludes(result.stdout, "watch-mac-heartbeat.mjs --sendStatus --host 127.0.0.1", "board summary");
    assertIncludes(result.stdout, `--port ${port} --server http://192.168.31.68:17888 --intervalMs 30000`, "board summary");
    assertIncludes(result.stdout, "MacHeartbeatStart=", "board summary");
    assertIncludes(result.stdout, "start-mac-heartbeat-watcher.mjs --host 127.0.0.1", "board summary");
    assertIncludes(result.stdout, `--port ${port} --server http://192.168.31.68:17888 --intervalMs 30000 --boardSummary`, "board summary");
    assertIncludes(result.stdout, "MacHeartbeatStatus=", "board summary");
    assertIncludes(result.stdout, "start-mac-heartbeat-watcher.mjs --status --host 127.0.0.1", "board summary");
    assertIncludes(result.stdout, `--port ${port} --server http://192.168.31.68:17888 --boardSummary`, "board summary");
    assertIncludes(result.stdout, "MacHeartbeatStop=", "board summary");
    assertIncludes(result.stdout, "start-mac-heartbeat-watcher.mjs --stop --host 127.0.0.1", "board summary");
    assertIncludes(result.stdout, "MacFormalLocalSmoke=", "board summary");
    assertIncludes(result.stdout, `check-mac-formal-local-smoke.mjs --host 127.0.0.1 --port ${port} --promptPassword --boardSummary`, "board summary");
    assertNotIncludes(result.stdout, "--password", "board summary Mac formal local smoke should not include password argv");
    assertIncludes(result.stdout, "MacClientDiscoverWindows=", "board summary");
    assertIncludes(result.stdout, "discover-windows-hosts.mjs --checkBoard --boardSummary", "board summary");
    assertIncludes(result.stdout, "MacClientFormalChecklist=", "board summary");
    assertIncludes(result.stdout, "check-mac-client-formal-status.mjs --discover --port 43770 --boardSummary", "board summary");
    assertIncludes(result.stdout, "MacClientFormalSmoke=", "board summary");
    assertIncludes(result.stdout, "run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary", "board summary");
    assertIncludes(result.stdout, "MacUnattended=", "board summary");
    assertIncludes(result.stdout, "check-mac-unattended-status.mjs --host 127.0.0.1", "board summary");
    assertIncludes(result.stdout, `--port ${port} --boardSummary`, "board summary");
    assertIncludes(result.stdout, "MacUnattendedFormal=", "board summary");
    assertIncludes(result.stdout, `--port ${port} --requireLaunchAgentMaxFps --requireLaunchAgentLoaded --boardSummary`, "board summary");
    assertIncludes(result.stdout, "FormalChecklist=", "board summary");
    assertIncludes(result.stdout, "check-mac-formal-e2e.ps1 -Discover -DiscoverNoLocalSubnets", "board summary");
    assertIncludes(result.stdout, "ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics", "board summary");
    assertIncludes(result.stdout, "WindowsHostMedia=", "board summary");
    assertIncludes(result.stdout, "WinClientDiagnostics=", "board summary");
    assertIncludes(result.stdout, "test-windows-client-browser.mjs --discover --discoverNoLocalSubnets", "board summary");
    assertIncludes(result.stdout, "--clientPort 5197 --debugPort 9337", "board summary");
    assertIncludes(result.stdout, "--diagnosticsOnly --boardSummary --timeoutMs 45000", "board summary");
    assertIncludes(result.stdout, "WinClientDiagnosticsPs=", "board summary");
    assertIncludes(result.stdout, "test-windows-client-browser.ps1 -Discover -DiscoverNoLocalSubnets", "board summary");
    assertIncludes(result.stdout, "-ClientPort 5197 -DebugPort 9337", "board summary");
    assertIncludes(result.stdout, "-DiagnosticsOnly -BoardSummary -TimeoutMs 45000", "board summary");
    assertIncludes(result.stdout, "WinClientDiagnosticsAlt=", "board summary");
    assertIncludes(result.stdout, "--clientPort 5200 --debugPort 9340", "board summary");
    assertIncludes(result.stdout, "WinClientDiagnosticsAltPs=", "board summary");
    assertIncludes(result.stdout, "-ClientPort 5200 -DebugPort 9340", "board summary");
    assertIncludes(result.stdout, "CopyDiagnostics=Windows 控制端事件面板点击", "board summary");
    assertIncludes(result.stdout, "快速摘要", "board summary");
    assertIncludes(result.stdout, "check-windows-host-readiness.mjs --checkBoard --probeMedia --boardSummary", "board summary");
    assertIncludes(result.stdout, "WindowsHostMediaPs=", "board summary");
    assertIncludes(result.stdout, "check-windows-host-readiness.ps1 -CheckBoard -ProbeMedia -BoardSummary", "board summary");
    assertIncludes(result.stdout, "WindowsVideoSupport=", "board summary");
    assertIncludes(result.stdout, "check-windows-video-encoder-support.mjs --boardSummary", "board summary");
    assertIncludes(result.stdout, "WindowsVideoSupportPs=", "board summary");
    assertIncludes(result.stdout, "check-windows-video-encoder-support.ps1 -BoardSummary", "board summary");
    assertIncludes(result.stdout, "WindowsWgcSupport=", "board summary");
    assertIncludes(result.stdout, "check-windows-wgc-support.mjs --boardSummary", "board summary");
    assertIncludes(result.stdout, "WindowsWgcSupportPs=", "board summary");
    assertIncludes(result.stdout, "check-windows-wgc-support.ps1 -BoardSummary", "board summary");
    assertIncludes(result.stdout, "WindowsWgcBenchmark=", "board summary");
    assertIncludes(result.stdout, "benchmark-windows-wgc-settings.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary", "board summary");
    assertIncludes(result.stdout, "WindowsWgcBenchmarkPs=", "board summary");
    assertIncludes(result.stdout, "benchmark-windows-wgc-settings.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary", "board summary");
    assertIncludes(result.stdout, "WindowsWgcCompare=", "board summary");
    assertIncludes(result.stdout, "compare-windows-wgc-h264-sources.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary", "board summary");
    assertIncludes(result.stdout, "WindowsWgcComparePs=", "board summary");
    assertIncludes(result.stdout, "compare-windows-wgc-h264-sources.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary", "board summary");
    assertIncludes(result.stdout, "WindowsWebCodecs=", "board summary");
    assertIncludes(result.stdout, "check-webcodecs-h264-support.mjs --requireCodec avc1.42C02A --boardSummary", "board summary");
    assertIncludes(result.stdout, "WindowsWebCodecsPs=", "board summary");
    assertIncludes(result.stdout, "check-webcodecs-h264-support.ps1 -RequireCodec avc1.42C02A -BoardSummary", "board summary");
    assertIncludes(result.stdout, "PowerShellHelp=", "board summary");
    assertIncludes(result.stdout, "test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary", "board summary");
    assertIncludes(result.stdout, "PowerShellHelpPwsh=", "board summary");
    assertIncludes(result.stdout, "test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary", "board summary");
    assertIncludes(result.stdout, "WindowsReverseGrantStatus=", "board summary");
    assertIncludes(result.stdout, "allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Status -BoardSummary", "board summary");
    assertIncludes(result.stdout, "WindowsOpenOneTimeReverseGrant=", "board summary");
    assertIncludes(result.stdout, "allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Grant -DurationMs 30000 -BoardSummary", "board summary");
    assertIncludes(result.stdout, "WindowsReverseGrantStatusNodeFallback=", "board summary");
    assertIncludes(result.stdout, "allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --status --boardSummary", "board summary");
    assertIncludes(result.stdout, "WindowsOpenOneTimeReverseGrantNodeFallback=", "board summary");
    assertIncludes(result.stdout, "allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --grant --durationMs 30000 --boardSummary", "board summary");
    assertIncludes(result.stdout, "WindowsSecureAuthPath=", "board summary");
    assertIncludes(result.stdout, "start-windows-host.mjs --host 0.0.0.0 --port 43770 --promptPassword --requirePassword", "board summary");
    assertIncludes(result.stdout, "WindowsFirewallStatus=", "board summary");
    assertIncludes(result.stdout, "check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --json", "board summary");
    assertIncludes(result.stdout, "WindowsFirewallPreview=", "board summary");
    assertIncludes(result.stdout, "check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --dryRunRule --ruleProfile Private", "board summary");
    assertNotIncludes(result.stdout, "--addRule", "board summary");
    assertIncludes(result.stdout, "ReverseGrant=", "board summary");
    assertIncludes(result.stdout, "allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --durationMs 30000 --boardSummary", "board summary");
    assertIncludes(result.stdout, "ReverseGrantPs=", "board summary");
    assertIncludes(result.stdout, "allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -DurationMs 30000 -BoardSummary", "board summary");
    assertNotIncludes(result.stdout + result.stderr, "test-password", "board summary");
    console.log("[OK] Windows resume status board summary is one-line and secret-free");
  });
}

async function checkBoardCurrentCallJson(args) {
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--json",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock currentCall JSON failed\n${result.stdout}\n${result.stderr}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.source === "api-state", "currentCall should be read from Agent Link Board /api/state");
      assert(payload.board?.currentCall?.present === true, "currentCall should be present");
      assert(payload.board?.currentCall?.active === true, "currentCall should be active");
      assert(payload.board?.currentCall?.from === "Mac Codex", "currentCall from mismatch");
      assert(payload.board?.currentCall?.need === "Windows Codex", "currentCall need mismatch");
      assert(payload.board?.currentCall?.needsWindows === true, "currentCall should need Windows");
      assert(payload.board?.currentCall?.fromMacSide === true, "currentCall should be Mac-side");
      assertIncludes(payload.boardSummary, "call=CALLING Mac Codex->Windows Codex", "currentCall board summary");
      assertIncludes(payload.boardSummary, "正式 Windows host 验收", "currentCall board summary");
      assertNotIncludes(result.stdout + result.stderr, "test-password", "currentCall JSON");
      console.log("[OK] Windows resume status JSON includes active Agent Link currentCall");
    }, {
      currentCall: macCallForWindows(),
    });
  });
}

async function checkBoardDoneCallJson(args) {
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--json",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock DONE currentCall JSON failed\n${result.stdout}\n${result.stderr}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.source === "api-state", "DONE currentCall should be read from Agent Link Board /api/state");
      assert(payload.board?.currentCall?.present === true, "DONE currentCall should be present");
      assert(payload.board?.currentCall?.active === false, "DONE currentCall should not be active");
      assertIncludes(payload.board.currentCall.summary, "DONE Mac Codex->Windows Codex", "DONE currentCall summary");
      assertNotIncludes(payload.boardSummary, "call=DONE", "DONE currentCall board summary");
      assertNotIncludes(payload.boardSummary, "start-windows-host.mjs --status --json", "DONE currentCall board summary");
      assertNotIncludes(result.stdout + result.stderr, "test-password", "DONE currentCall JSON");
      console.log("[OK] Windows resume status keeps DONE Agent Link currentCall out of board summary");
    }, {
      currentCall: doneMacCallForWindows(),
    });
  });
}

async function checkBoardCurrentCallSummary(args) {
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--boardSummary",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock currentCall board summary failed\n${result.stdout}\n${result.stderr}`);
      const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
      assert(lines.length === 1, `currentCall board summary should be one line, got ${lines.length}`);
      assertIncludes(result.stdout, "call=CALLING Mac Codex->Windows Codex", "currentCall board summary");
      assertIncludes(result.stdout, "正式 Windows host 验收", "currentCall board summary");
      assertNotIncludes(result.stdout + result.stderr, "test-password", "currentCall board summary");
      console.log("[OK] Windows resume status board summary includes active Agent Link currentCall");
    }, {
      currentCall: macCallForWindows(),
    });
  });
}

async function checkSecureAuthCallNextSummary(args) {
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--json",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock secure-auth currentCall JSON failed\n${result.stdout}\n${result.stderr}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.currentCall?.active === true, "secure-auth currentCall should be active");
      assert(payload.board?.currentCall?.secureAuthPathReady === true, "secure-auth currentCall should be marked ready after WindowsSecureAuthPath is available");
      assert(payload.board?.currentCall?.next === "mac-confirm-secure-auth-path", "secure-auth currentCall should tell Mac to confirm the safe path");
      assertIncludes(payload.board?.currentCall?.agentCallAckCommand || "", "node scripts/codex-link-client.mjs", "secure-auth currentCall ack command");
      assertIncludes(payload.board?.currentCall?.agentCallAckCommand || "", `--server ${board.url}`, "secure-auth currentCall ack command");
      assertIncludes(payload.board?.currentCall?.agentCallAckCommand || "", "send --from", "secure-auth currentCall ack command");
      assertIncludes(payload.board?.currentCall?.agentCallAckCommand || "", "WindowsSecureAuthPath", "secure-auth currentCall ack command");
      assertIncludes(payload.boardSummary, "AgentCallNext=mac-confirm-secure-auth-path", "secure-auth currentCall board summary");
      assertIncludes(payload.boardSummary, "AgentCallAck=node scripts/codex-link-client.mjs", "secure-auth currentCall board summary");
      assertIncludes(payload.boardSummary, "WindowsSecureAuthPath=node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port 43770 --promptPassword --requirePassword", "secure-auth currentCall board summary");
      assertNotIncludes(result.stdout + result.stderr, "secret-value", "secure-auth currentCall JSON should not leak secrets");
      assertNotIncludes(result.stdout + result.stderr, "--password", "secure-auth currentCall JSON should not include password args");
      console.log("[OK] Windows resume status marks secure-auth currentCall ready when WindowsSecureAuthPath is available");
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
  const macClientDiscoverWindowsCommand = "node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary";
  const macClientFormalChecklistCommand = "node scripts/mac/check-mac-client-formal-status.mjs --discover --port 43770 --boardSummary";
  const macClientFormalSmokeCommand = "node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary";
  const heartbeatNow = Date.now();
  const freshCheckedAt = new Date(heartbeatNow - 60_000).toISOString();
  const freshCodexUpdatedAt = new Date(heartbeatNow - 65_000).toISOString();
  const freshBoardUpdatedAt = new Date(heartbeatNow - 58_000).toISOString();
  const staleHeartbeatSummary = "MacHeartbeat=status=ok; checkedAt=2020-01-01T00:00:00.000Z; device=Mac; codex=ok status=idle updatedAt=2020-01-01T00:00:00.000Z ageMs=999999; macHost=online 127.0.0.1:43770; macClient=online http://127.0.0.1:5188/; board=ok boardUpdatedAt=2020-01-01T00:00:00.000Z; blockers=none warnings=none reason=ok";
  const freshHeartbeatSummary = `MacHeartbeat=status=ok; checkedAt=${freshCheckedAt}; device=Mac; codex=ok status=idle updatedAt=${freshCodexUpdatedAt} ageMs=65000; macHost=online 127.0.0.1:43770; macClient=online http://127.0.0.1:5188/; board=ok boardUpdatedAt=${freshBoardUpdatedAt}; blockers=none warnings=none reason=ok`;
  const macEvidenceSummary = "MacFormalE2E=status=ok readyToCall=true checklist=passed blockers=none warnings=none Evidence=MacHostMediaOk,MacFormalLocalSmokeOk,MacClientPageOnline";
  const riskyEvidenceSummary = "MacHeartbeat=status=blocked reason=codex-reconnect-stuck evidence=正在重新连接 5/5 blockers=mac-codex-stale warnings=none";
  await withMockHost(async (port) => {
    const boardState = {
      statuses: {
        "Mac Codex": {
          role: "Mac 端",
          status: "idle",
          note: `MacHostReadiness=blocked blockers=host-offline warnings=none MacHostSafeStart=${safeCommand} MacMaxFpsSafeStart=${maxFpsCommand} MacFormalLocalSmoke=${localSmokeCommand} MacClientDiscoverWindows=${macClientDiscoverWindowsCommand} MacClientFormalChecklist=${macClientFormalChecklistCommand} MacClientFormalSmoke=${macClientFormalSmokeCommand} MacHeartbeatOnce=${heartbeatOnceCommand} MacHeartbeatWatch=${heartbeatWatchCommand} MacHeartbeatStart=${heartbeatStartCommand} MacHeartbeatStatus=${heartbeatStatusCommand} MacHeartbeatStop=${heartbeatStopCommand}`,
        },
        "Mac Heartbeat": {
          role: "Mac heartbeat watcher",
          status: "online",
          note: freshHeartbeatSummary,
          updatedAt: freshBoardUpdatedAt,
        },
        "Mac Formal": {
          role: "Mac 端",
          status: "online",
          note: macEvidenceSummary,
        },
      },
      events: [
        {
          type: "status",
          from: "Mac Heartbeat",
          text: staleHeartbeatSummary,
        },
        {
          type: "status",
          from: "Mac Heartbeat",
          text: riskyEvidenceSummary,
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
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--json",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock MacHostSafeStart JSON failed\n${result.stdout}\n${result.stderr}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.macHostSafeStart?.found === true, "MacHostSafeStart should be found in board state");
      assert(payload.board.macHostSafeStart.command === safeCommand, "MacHostSafeStart command mismatch");
      assert(payload.board.macHostSafeStart.source === "api-state", "MacHostSafeStart should come from /api/state");
      assert(payload.board.macHostSafeStart.rejectedCount >= 2, "unsafe or placeholder MacHostSafeStart should be rejected");
      assert(payload.board?.macMaxFpsSafeStart?.found === true, "MacMaxFpsSafeStart should be found in board state");
      assert(payload.board.macMaxFpsSafeStart.command === maxFpsCommand, "MacMaxFpsSafeStart command mismatch");
      assert(payload.board.macMaxFpsSafeStart.source === "api-state", "MacMaxFpsSafeStart should come from /api/state");
      assert(payload.board.macMaxFpsSafeStart.rejectedCount >= 2, "placeholder or missing max FPS MacMaxFpsSafeStart should be rejected");
      assert(payload.board?.macFormalLocalSmoke?.found === true, "MacFormalLocalSmoke should be found in board state");
      assert(payload.board.macFormalLocalSmoke.command === localSmokeCommand, "MacFormalLocalSmoke command mismatch");
      assert(payload.board.macFormalLocalSmoke.source === "api-state", "MacFormalLocalSmoke should come from /api/state");
      assert(payload.board.macFormalLocalSmoke.rejectedCount >= 2, "unsafe or placeholder MacFormalLocalSmoke should be rejected");
      assert(payload.board?.macClientDiscoverWindows?.found === true, "MacClientDiscoverWindows should be found in board state");
      assert(payload.board.macClientDiscoverWindows.command === macClientDiscoverWindowsCommand, "MacClientDiscoverWindows command mismatch");
      assert(payload.board.macClientDiscoverWindows.source === "api-state", "MacClientDiscoverWindows should come from /api/state");
      assert(payload.board.macClientDiscoverWindows.rejectedCount >= 3, "unsafe or incomplete MacClientDiscoverWindows should be rejected");
      assert(payload.board?.macClientFormalChecklist?.found === true, "MacClientFormalChecklist should be found in board state");
      assert(payload.board.macClientFormalChecklist.command === macClientFormalChecklistCommand, "MacClientFormalChecklist command mismatch");
      assert(payload.board.macClientFormalChecklist.source === "api-state", "MacClientFormalChecklist should come from /api/state");
      assert(payload.board.macClientFormalChecklist.rejectedCount >= 3, "unsafe or incomplete MacClientFormalChecklist should be rejected");
      assert(payload.board?.macClientFormalSmoke?.found === true, "MacClientFormalSmoke should be found in board state");
      assert(payload.board.macClientFormalSmoke.command === macClientFormalSmokeCommand, "MacClientFormalSmoke command mismatch");
      assert(payload.board.macClientFormalSmoke.source === "api-state", "MacClientFormalSmoke should come from /api/state");
      assert(payload.board.macClientFormalSmoke.rejectedCount >= 3, "unsafe or incomplete MacClientFormalSmoke should be rejected");
      assert(payload.board?.macHeartbeatOnce?.found === true, "MacHeartbeatOnce should be found in board state");
      assert(payload.board.macHeartbeatOnce.command === heartbeatOnceCommand, "MacHeartbeatOnce command mismatch");
      assert(payload.board.macHeartbeatOnce.source === "api-state", "MacHeartbeatOnce should come from /api/state");
      assert(payload.board.macHeartbeatOnce.rejectedCount >= 2, "unsafe or incomplete MacHeartbeatOnce should be rejected");
      assert(payload.board?.macHeartbeatWatch?.found === true, "MacHeartbeatWatch should be found in board state");
      assert(payload.board.macHeartbeatWatch.command === heartbeatWatchCommand, "MacHeartbeatWatch command mismatch");
      assert(payload.board.macHeartbeatWatch.source === "api-state", "MacHeartbeatWatch should come from /api/state");
      assert(payload.board.macHeartbeatWatch.rejectedCount >= 2, "unsafe or incomplete MacHeartbeatWatch should be rejected");
      assert(payload.board?.macHeartbeatStart?.found === true, "MacHeartbeatStart should be found in board state");
      assert(payload.board.macHeartbeatStart.command === heartbeatStartCommand, "MacHeartbeatStart command mismatch");
      assert(payload.board.macHeartbeatStart.source === "api-state", "MacHeartbeatStart should come from /api/state");
      assert(payload.board.macHeartbeatStart.rejectedCount >= 2, "unsafe MacHeartbeatStart should be rejected");
      assert(payload.board?.macHeartbeatStatus?.found === true, "MacHeartbeatStatus should be found in board state");
      assert(payload.board.macHeartbeatStatus.command === heartbeatStatusCommand, "MacHeartbeatStatus command mismatch");
      assert(payload.board.macHeartbeatStatus.source === "api-state", "MacHeartbeatStatus should come from /api/state");
      assert(payload.board.macHeartbeatStatus.rejectedCount >= 1, "incomplete MacHeartbeatStatus should be rejected");
      assert(payload.board?.macHeartbeatStop?.found === true, "MacHeartbeatStop should be found in board state");
      assert(payload.board.macHeartbeatStop.command === heartbeatStopCommand, "MacHeartbeatStop command mismatch");
      assert(payload.board.macHeartbeatStop.source === "api-state", "MacHeartbeatStop should come from /api/state");
      assert(payload.board.macHeartbeatStop.rejectedCount >= 1, "wrong-action MacHeartbeatStop should be rejected");
      assert(payload.board?.macHeartbeatFreshness?.present === true, "MacHeartbeat freshness should be found in board state");
      assert(payload.board.macHeartbeatFreshness.status === "fresh", "fresh MacHeartbeat should not be marked stale when a newer summary exists");
      assert(payload.board.macHeartbeatFreshness.checkedAt === freshCheckedAt, "MacHeartbeat freshness should use newest checkedAt");
      assert(payload.board.macHeartbeatFreshness.codexAgeMs === 65000, "MacHeartbeat freshness should preserve codex age");
      assertIncludes(payload.board.macHeartbeatFreshness.summary, "checked=", "MacHeartbeat freshness JSON summary");
      assertIncludes(payload.board.macHeartbeatFreshness.summary, "codex=65s", "MacHeartbeat freshness JSON summary");
      assertIncludes(payload.board.macHeartbeatFreshness.summary, "board=", "MacHeartbeat freshness JSON summary");
      assert(payload.board?.macEvidence?.found === true, "Mac positive evidence should be found in board state");
      assert(payload.board.macEvidence.source === "api-state", "Mac positive evidence should come from /api/state");
      assert(payload.board.macEvidence.summary === "MacHostMediaOk,MacFormalLocalSmokeOk,MacClientPageOnline", "Mac positive evidence summary mismatch");
      assert(payload.board.macEvidence.tokens.includes("MacHostMediaOk"), "MacHostMediaOk evidence should be captured");
      assert(payload.board.macEvidence.tokens.includes("MacFormalLocalSmokeOk"), "MacFormalLocalSmokeOk evidence should be captured");
      assert(payload.board.macEvidence.tokens.includes("MacClientPageOnline"), "MacClientPageOnline evidence should be captured");
      assert(payload.board.macEvidence.rejectedCount >= 1, "risky Mac evidence should be rejected");
      assertNotIncludes(payload.board.macEvidence.summary, "正在重新连接", "Mac positive evidence JSON should not include risky reconnect text");
      assertIncludes(payload.boardSummary, `MacHostSafeStart=${safeCommand}.`, "MacHostSafeStart JSON board summary");
      assertIncludes(payload.boardSummary, `MacMaxFpsSafeStart=${maxFpsCommand}.`, "MacMaxFpsSafeStart JSON board summary");
      assertIncludes(payload.boardSummary, `MacFormalLocalSmoke=${localSmokeCommand}.`, "MacFormalLocalSmoke JSON board summary");
      assertIncludes(payload.boardSummary, `MacClientDiscoverWindows=${macClientDiscoverWindowsCommand}.`, "MacClientDiscoverWindows JSON board summary");
      assertIncludes(payload.boardSummary, `MacClientFormalChecklist=${macClientFormalChecklistCommand}.`, "MacClientFormalChecklist JSON board summary");
      assertIncludes(payload.boardSummary, `MacClientFormalSmoke=${macClientFormalSmokeCommand}.`, "MacClientFormalSmoke JSON board summary");
      assertIncludes(payload.boardSummary, `MacHeartbeatOnce=${heartbeatOnceCommand}.`, "MacHeartbeatOnce JSON board summary");
      assertIncludes(payload.boardSummary, `MacHeartbeatWatch=${heartbeatWatchCommand}.`, "MacHeartbeatWatch JSON board summary");
      assertIncludes(payload.boardSummary, `MacHeartbeatStart=${heartbeatStartCommand}.`, "MacHeartbeatStart JSON board summary");
      assertIncludes(payload.boardSummary, `MacHeartbeatStatus=${heartbeatStatusCommand}.`, "MacHeartbeatStatus JSON board summary");
      assertIncludes(payload.boardSummary, `MacHeartbeatStop=${heartbeatStopCommand}.`, "MacHeartbeatStop JSON board summary");
      assertIncludes(payload.boardSummary, `MacHeartbeatFreshness=fresh`, "MacHeartbeatFreshness JSON board summary");
      assertIncludes(payload.boardSummary, `checkedAt=${freshCheckedAt}.`, "MacHeartbeatFreshness JSON board summary");
      assertIncludes(payload.boardSummary, "MacEvidence=MacHostMediaOk,MacFormalLocalSmokeOk,MacClientPageOnline.", "Mac positive evidence JSON board summary");
      assertNotIncludes(payload.boardSummary, "正在重新连接", "Mac positive evidence JSON board summary should not include risky reconnect text");
      assertNotIncludes(result.stdout + result.stderr, "secret-value", "MacHostSafeStart JSON should not leak rejected command");
    }, boardState);

    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--boardSummary",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock MacHostSafeStart board summary failed\n${result.stdout}\n${result.stderr}`);
      const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
      assert(lines.length === 1, `MacHostSafeStart board summary should be one line, got ${lines.length}`);
      assertIncludes(result.stdout, `MacHostSafeStart=${safeCommand}.`, "MacHostSafeStart board summary");
      assertIncludes(result.stdout, `MacMaxFpsSafeStart=${maxFpsCommand}.`, "MacMaxFpsSafeStart board summary");
      assertIncludes(result.stdout, `MacFormalLocalSmoke=${localSmokeCommand}.`, "MacFormalLocalSmoke board summary");
      assertIncludes(result.stdout, `MacClientDiscoverWindows=${macClientDiscoverWindowsCommand}.`, "MacClientDiscoverWindows board summary");
      assertIncludes(result.stdout, `MacClientFormalChecklist=${macClientFormalChecklistCommand}.`, "MacClientFormalChecklist board summary");
      assertIncludes(result.stdout, `MacClientFormalSmoke=${macClientFormalSmokeCommand}.`, "MacClientFormalSmoke board summary");
      assertIncludes(result.stdout, `MacHeartbeatOnce=${heartbeatOnceCommand}.`, "MacHeartbeatOnce board summary");
      assertIncludes(result.stdout, `MacHeartbeatWatch=${heartbeatWatchCommand}.`, "MacHeartbeatWatch board summary");
      assertIncludes(result.stdout, `MacHeartbeatStart=${heartbeatStartCommand}.`, "MacHeartbeatStart board summary");
      assertIncludes(result.stdout, `MacHeartbeatStatus=${heartbeatStatusCommand}.`, "MacHeartbeatStatus board summary");
      assertIncludes(result.stdout, `MacHeartbeatStop=${heartbeatStopCommand}.`, "MacHeartbeatStop board summary");
      assertIncludes(result.stdout, "MacHeartbeatFreshness=fresh", "MacHeartbeatFreshness board summary");
      assertIncludes(result.stdout, `checkedAt=${freshCheckedAt}.`, "MacHeartbeatFreshness board summary");
      assertIncludes(result.stdout, "MacEvidence=MacHostMediaOk,MacFormalLocalSmokeOk,MacClientPageOnline.", "Mac positive evidence board summary");
      assertNotIncludes(result.stdout, "正在重新连接", "Mac positive evidence board summary should not include risky reconnect text");
      assertNotIncludes(result.stdout + result.stderr, "secret-value", "MacHostSafeStart board summary should not leak rejected command");
    }, boardState);

    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock MacHostSafeStart human output failed\n${result.stdout}\n${result.stderr}`);
      assertIncludes(result.stdout, `MacHostSafeStart=${safeCommand}`, "MacHostSafeStart human output");
      assertIncludes(result.stdout, `MacMaxFpsSafeStart=${maxFpsCommand}`, "MacMaxFpsSafeStart human output");
      assertIncludes(result.stdout, `MacFormalLocalSmoke=${localSmokeCommand}`, "MacFormalLocalSmoke human output");
      assertIncludes(result.stdout, `MacClientDiscoverWindows=${macClientDiscoverWindowsCommand}`, "MacClientDiscoverWindows human output");
      assertIncludes(result.stdout, `MacClientFormalChecklist=${macClientFormalChecklistCommand}`, "MacClientFormalChecklist human output");
      assertIncludes(result.stdout, `MacClientFormalSmoke=${macClientFormalSmokeCommand}`, "MacClientFormalSmoke human output");
      assertIncludes(result.stdout, `MacHeartbeatOnce=${heartbeatOnceCommand}`, "MacHeartbeatOnce human output");
      assertIncludes(result.stdout, `MacHeartbeatWatch=${heartbeatWatchCommand}`, "MacHeartbeatWatch human output");
      assertIncludes(result.stdout, `MacHeartbeatStart=${heartbeatStartCommand}`, "MacHeartbeatStart human output");
      assertIncludes(result.stdout, `MacHeartbeatStatus=${heartbeatStatusCommand}`, "MacHeartbeatStatus human output");
      assertIncludes(result.stdout, `MacHeartbeatStop=${heartbeatStopCommand}`, "MacHeartbeatStop human output");
      assertIncludes(result.stdout, "MacHeartbeatFreshness=fresh", "MacHeartbeatFreshness human output");
      assertIncludes(result.stdout, `checkedAt=${freshCheckedAt}`, "MacHeartbeatFreshness human output");
      assertIncludes(result.stdout, "MacEvidence=MacHostMediaOk,MacFormalLocalSmokeOk,MacClientPageOnline", "Mac positive evidence human output");
      assertNotIncludes(result.stdout, "正在重新连接", "Mac positive evidence human output should not include risky reconnect text");
      assertNotIncludes(result.stdout + result.stderr, "secret-value", "MacHostSafeStart human output should not leak rejected command");
      console.log("[OK] Windows resume status extracts Mac safe-start commands and positive evidence from Agent Link Board safely");
    }, boardState);
  });
}

async function checkBoardWindowsReverseGrantExtraction(args) {
  const statusCommand = "pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Status -BoardSummary";
  const grantCommand = "pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Grant -DurationMs 30000 -BoardSummary";
  const statusNodeCommand = "node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --status --boardSummary";
  const grantNodeCommand = "node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --grant --durationMs 30000 --boardSummary";
  await withMockHost(async (port) => {
    const boardState = {
      statuses: {
        "Mac Codex": {
          role: "Mac 端",
          status: "blocked",
          note: [
            "LAN008 pending-request waiting for Windows reverse control grant.",
            `WindowsReverseGrantStatus=${statusCommand}`,
            `WindowsOpenOneTimeReverseGrant=${grantCommand}`,
            `WindowsReverseGrantStatusNodeFallback=${statusNodeCommand}`,
            `WindowsOpenOneTimeReverseGrantNodeFallback=${grantNodeCommand}`,
          ].join(" "),
        },
      },
      events: [
        {
          type: "message",
          from: "Mac Codex",
          text: "WindowsReverseGrantStatus=pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 192.168.31.68 -Port 43770 -Status -BoardSummary",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "WindowsOpenOneTimeReverseGrant=pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Grant -DurationMs 30000 -Password secret-value -BoardSummary",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "WindowsReverseGrantStatusNodeFallback=node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --status",
        },
        {
          type: "message",
          from: "Mac Codex",
          text: "WindowsOpenOneTimeReverseGrantNodeFallback=node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port <当前端口> --grant --durationMs 30000 --boardSummary",
        },
      ],
    };

    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--json",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock WindowsReverseGrant JSON failed\n${result.stdout}\n${result.stderr}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.windowsReverseGrantStatus?.found === true, "WindowsReverseGrantStatus should be found");
      assert(payload.board.windowsReverseGrantStatus.command === statusCommand, "WindowsReverseGrantStatus command mismatch");
      assert(payload.board.windowsReverseGrantStatus.rejectedCount >= 1, "unsafe WindowsReverseGrantStatus should be rejected");
      assert(payload.board?.windowsOpenOneTimeReverseGrant?.found === true, "WindowsOpenOneTimeReverseGrant should be found");
      assert(payload.board.windowsOpenOneTimeReverseGrant.command === grantCommand, "WindowsOpenOneTimeReverseGrant command mismatch");
      assert(payload.board.windowsOpenOneTimeReverseGrant.rejectedCount >= 1, "unsafe WindowsOpenOneTimeReverseGrant should be rejected");
      assert(payload.board?.windowsReverseGrantStatusNodeFallback?.found === true, "WindowsReverseGrantStatusNodeFallback should be found");
      assert(payload.board.windowsReverseGrantStatusNodeFallback.command === statusNodeCommand, "WindowsReverseGrantStatusNodeFallback command mismatch");
      assert(payload.board.windowsReverseGrantStatusNodeFallback.rejectedCount >= 1, "missing boardSummary fallback should be rejected");
      assert(payload.board?.windowsOpenOneTimeReverseGrantNodeFallback?.found === true, "WindowsOpenOneTimeReverseGrantNodeFallback should be found");
      assert(payload.board.windowsOpenOneTimeReverseGrantNodeFallback.command === grantNodeCommand, "WindowsOpenOneTimeReverseGrantNodeFallback command mismatch");
      assert(payload.board.windowsOpenOneTimeReverseGrantNodeFallback.rejectedCount >= 1, "placeholder fallback should be rejected");
      assertIncludes(payload.boardSummary, `WindowsReverseGrantStatus=${statusCommand}.`, "WindowsReverseGrant JSON board summary");
      assertIncludes(payload.boardSummary, `WindowsOpenOneTimeReverseGrant=${grantCommand}.`, "WindowsReverseGrant JSON board summary");
      assertIncludes(payload.boardSummary, `WindowsReverseGrantStatusNodeFallback=${statusNodeCommand}.`, "WindowsReverseGrant JSON board summary");
      assertIncludes(payload.boardSummary, `WindowsOpenOneTimeReverseGrantNodeFallback=${grantNodeCommand}.`, "WindowsReverseGrant JSON board summary");
      assertNotIncludes(result.stdout + result.stderr, "secret-value", "WindowsReverseGrant JSON should not leak rejected command");
      assertNotIncludes(result.stdout + result.stderr, "192.168.31.68 -Port 43770 -Status", "WindowsReverseGrant JSON should not leak non-loopback command");
    }, boardState);

    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--boardSummary",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock WindowsReverseGrant board summary failed\n${result.stdout}\n${result.stderr}`);
      assertIncludes(result.stdout, `WindowsReverseGrantStatus=${statusCommand}.`, "WindowsReverseGrant board summary");
      assertIncludes(result.stdout, `WindowsOpenOneTimeReverseGrant=${grantCommand}.`, "WindowsReverseGrant board summary");
      assertIncludes(result.stdout, `WindowsReverseGrantStatusNodeFallback=${statusNodeCommand}.`, "WindowsReverseGrant board summary");
      assertIncludes(result.stdout, `WindowsOpenOneTimeReverseGrantNodeFallback=${grantNodeCommand}.`, "WindowsReverseGrant board summary");
      assertNotIncludes(result.stdout + result.stderr, "secret-value", "WindowsReverseGrant board summary should not leak rejected command");
    }, boardState);

    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock WindowsReverseGrant human output failed\n${result.stdout}\n${result.stderr}`);
      assertIncludes(result.stdout, `WindowsReverseGrantStatus=${statusCommand}`, "WindowsReverseGrant human output");
      assertIncludes(result.stdout, `WindowsOpenOneTimeReverseGrant=${grantCommand}`, "WindowsReverseGrant human output");
      assertIncludes(result.stdout, `WindowsReverseGrantStatusNodeFallback=${statusNodeCommand}`, "WindowsReverseGrant human output");
      assertIncludes(result.stdout, `WindowsOpenOneTimeReverseGrantNodeFallback=${grantNodeCommand}`, "WindowsReverseGrant human output");
      assertNotIncludes(result.stdout + result.stderr, "secret-value", "WindowsReverseGrant human output should not leak rejected command");
      console.log("[OK] Windows resume status extracts Windows reverse-grant commands from Agent Link Board safely");
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
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--json",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock WindowsSecureAuthPath JSON failed\n${result.stdout}\n${result.stderr}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.windowsSecureAuthPath?.found === true, "WindowsSecureAuthPath should be found");
      assert(payload.board.windowsSecureAuthPath.command === aliasSecureAuthCommand, "WindowsSecureAuthPath should use the newest safe command including SecureAuthPath alias");
      assert(payload.board.windowsSecureAuthPath.rejectedCount >= 4, "unsafe WindowsSecureAuthPath candidates should be rejected");
      assertIncludes(payload.boardSummary, `WindowsSecureAuthPath=${aliasSecureAuthCommand}.`, "WindowsSecureAuthPath JSON board summary");
      assertNotIncludes(result.stdout + result.stderr, "secret-value", "WindowsSecureAuthPath JSON should not leak rejected command");
      assertNotIncludes(result.stdout + result.stderr, "--host 127.0.0.1 --port 43770 --promptPassword", "WindowsSecureAuthPath JSON should not leak non-LAN binding candidate");
    }, boardState);

    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--boardSummary",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock WindowsSecureAuthPath board summary failed\n${result.stdout}\n${result.stderr}`);
      assertIncludes(result.stdout, `WindowsSecureAuthPath=${aliasSecureAuthCommand}.`, "WindowsSecureAuthPath board summary");
      assertNotIncludes(result.stdout + result.stderr, "secret-value", "WindowsSecureAuthPath board summary should not leak rejected command");
    }, boardState);

    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock WindowsSecureAuthPath human output failed\n${result.stdout}\n${result.stderr}`);
      assertIncludes(result.stdout, `WindowsSecureAuthPath=${aliasSecureAuthCommand}`, "WindowsSecureAuthPath human output");
      assertNotIncludes(result.stdout + result.stderr, "secret-value", "WindowsSecureAuthPath human output should not leak rejected command");
      console.log("[OK] Windows resume status extracts Windows secure-auth paths from Agent Link Board safely");
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
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--json",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock WindowsLanRisk JSON failed\n${result.stdout}\n${result.stderr}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.windowsLanRisk?.found === true, "WindowsLanRisk should be found");
      assert(payload.board.windowsLanRisk.summary === "no-firewall-allow,public-profile", "WindowsLanRisk summary should keep safe labels");
      assert(payload.board.windowsLanRisk.risks?.includes("no-firewall-allow"), "WindowsLanRisk should include no-firewall-allow");
      assert(payload.board.windowsLanRisk.risks?.includes("public-profile"), "WindowsLanRisk should include public-profile");
      assert(payload.board.windowsLanRisk.rejectedCount >= 4, "unsafe WindowsLanRisk candidates should be rejected");
      assertIncludes(payload.boardSummary, "WindowsLanRisk=no-firewall-allow,public-profile.", "WindowsLanRisk JSON board summary");
      assertNotIncludes(result.stdout + result.stderr, "secret-value", "WindowsLanRisk JSON should not leak rejected text");
      assertNotIncludes(result.stdout + result.stderr, "$(whoami)", "WindowsLanRisk JSON should not leak command-like text");
    }, boardState);

    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--boardSummary",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock WindowsLanRisk board summary failed\n${result.stdout}\n${result.stderr}`);
      assertIncludes(result.stdout, "WindowsLanRisk=no-firewall-allow,public-profile.", "WindowsLanRisk board summary");
      assertNotIncludes(result.stdout + result.stderr, "secret-value", "WindowsLanRisk board summary should not leak rejected text");
    }, boardState);

    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock WindowsLanRisk human output failed\n${result.stdout}\n${result.stderr}`);
      assertIncludes(result.stdout, "WindowsLanRisk=no-firewall-allow,public-profile", "WindowsLanRisk human output");
      assertNotIncludes(result.stdout + result.stderr, "secret-value", "WindowsLanRisk human output should not leak rejected text");
      console.log("[OK] Windows resume status extracts Windows LAN risk from Agent Link Board safely");
    }, boardState);
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

async function checkSendUserAuthRequest(args) {
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--sendUserAuthRequest",
        "--json",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock sendUserAuthRequest failed\n${result.stdout}\n${result.stderr}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.sentUserAuthRequest?.requested === true, "sendUserAuthRequest should be requested");
      assert(payload.sentUserAuthRequest?.ok === true, "sendUserAuthRequest should pass");
      assert(board.messages.length === 1, `expected one board message, got ${board.messages.length}`);
      assert(board.messages[0].from === "Windows Codex", "board message should use Windows Codex sender");
      assertIncludes(board.messages[0].text, "NEED_USER_AUTH", "sent userAuthRequest");
      assertIncludes(board.messages[0].text, "-PromptPassword", "sent userAuthRequest");
      assertNotIncludes(JSON.stringify(board.messages), "test-password", "sent userAuthRequest");
      console.log("[OK] Windows resume status can send a secret-free user auth request");
    });
  });
}

async function checkSendUserAuthRequestOffline(args) {
  await withMockLinkBoard(async (board) => {
    const result = await run([
      "--noDiscover",
      "--host", "127.0.0.1",
      "--port", "9",
      "--server", board.url,
      "--sendUserAuthRequest",
      "--json",
    ], args);
    assert(result.exitCode !== 0, "offline sendUserAuthRequest should fail");
    const payload = JSON.parse(result.stdout);
    assert(payload.sentUserAuthRequest?.requested === true, "offline send should be requested");
    assert(payload.sentUserAuthRequest?.ok === false, "offline send should fail");
    assert(payload.failedChecks?.some((check) => check.name === "sendUserAuthRequest"), "offline send failure should be named");
    assert(board.messages.length === 0, `offline send should not post a board message, got ${board.messages.length}`);
    assertNotIncludes(result.stdout + result.stderr, "Mac host password", "offline sendUserAuthRequest");
    console.log("[OK] Windows resume status refuses to send user auth request before preflight is ready");
  });
}

async function checkSendAgentCallAck(args) {
  const secureAuthCommand = "node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port 45679 --promptPassword --requirePassword";
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--sendAgentCallAck",
        "--json",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock sendAgentCallAck failed\n${result.stdout}\n${result.stderr}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.sentAgentCallAck?.requested === true, "sendAgentCallAck should be requested");
      assert(payload.sentAgentCallAck?.ok === true, "sendAgentCallAck should pass");
      assert(board.messages.length === 1, `expected one board message, got ${board.messages.length}`);
      assert(board.messages[0].from === "Windows Codex", "AgentCallAck message should use Windows Codex sender");
      assertIncludes(board.messages[0].text, "WindowsSecureAuthPath 已提供", "sent AgentCallAck");
      assertIncludes(board.messages[0].text, secureAuthCommand, "sent AgentCallAck");
      assertIncludes(board.messages[0].text, "不要在 Agent Link Board 发送密码", "sent AgentCallAck");
      assertIncludes(board.messages[0].text, "不认证、不发送 input/inject", "sent AgentCallAck");
      assertNotIncludes(JSON.stringify(board.messages), "secret-value", "sent AgentCallAck");
      assertNotIncludes(JSON.stringify(board.messages), "--password", "sent AgentCallAck");
      console.log("[OK] Windows resume status can send a secret-free AgentCallAck");
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

async function checkSendAgentCallAckWithoutReadyCall(args) {
  const secureAuthCommand = "node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port 45679 --promptPassword --requirePassword";
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--sendAgentCallAck",
        "--json",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode !== 0, "sendAgentCallAck should fail when there is no active secure-auth call");
      const payload = JSON.parse(result.stdout);
      assert(payload.sentAgentCallAck?.requested === true, "sendAgentCallAck refusal should be requested");
      assert(payload.sentAgentCallAck?.ok === false, "sendAgentCallAck refusal should fail");
      assert(payload.failedChecks?.some((check) => check.name === "sendAgentCallAck"), "AgentCallAck refusal should be named");
      assert(board.messages.length === 0, `refused AgentCallAck should not post a board message, got ${board.messages.length}`);
      assertNotIncludes(result.stdout + result.stderr, "secret-value", "refused AgentCallAck");
      console.log("[OK] Windows resume status refuses AgentCallAck without an active secure-auth call");
    }, {
      currentCall: macCallForWindows(),
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
  await checkRuntimeBuildClientDiagnosticsCommand(args);
  await checkWindowsClientDiagnosticsPortOccupancy(args);
  await checkBoardSummary(args);
  await checkBoardCurrentCallJson(args);
  await checkBoardDoneCallJson(args);
  await checkBoardCurrentCallSummary(args);
  await checkSecureAuthCallNextSummary(args);
  await checkBoardMacHostSafeStartExtraction(args);
  await checkBoardWindowsReverseGrantExtraction(args);
  await checkBoardWindowsSecureAuthPathExtraction(args);
  await checkBoardWindowsLanRiskExtraction(args);
  await checkUserAuthRequest(args);
  await checkSendUserAuthRequest(args);
  await checkSendUserAuthRequestOffline(args);
  await checkSendAgentCallAck(args);
  await checkSendAgentCallAckWithoutReadyCall(args);
  await checkOfflineJson(args);
  await checkRequireMacReady(args);
  console.log("[OK] Windows resume status regression passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
