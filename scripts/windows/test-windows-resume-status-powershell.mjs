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

function runPowerShell(extraArgs, args) {
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

async function checkWrapperHelp(args) {
  const result = await runPowerShell(["-Help"], args);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.exitCode === 0, `PowerShell wrapper help failed\n${output}`);
  assertIncludes(output, "Usage:", "PowerShell wrapper help");
  assertIncludes(output, "-CheckBoard -BoardSummary", "PowerShell wrapper help");
  assertIncludes(output, "-UserAuthRequest", "PowerShell wrapper help");
  assertIncludes(output, "current Agent Link", "PowerShell wrapper help");
  assertIncludes(output, "does not ask for or print", "PowerShell wrapper help");
  assertIncludes(output, "passwords", "PowerShell wrapper help");
  assertIncludes(output, "Windows host media baseline", "PowerShell wrapper help");
  assertIncludes(output, "--probeMedia --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "check-windows-host-readiness.ps1 -CheckBoard -ProbeMedia -BoardSummary", "PowerShell wrapper help");
  assertIncludes(output, "Mac host discovery command", "PowerShell wrapper help");
  assertIncludes(output, "discover-lan-hosts.mjs --noLocalSubnets", "PowerShell wrapper help");
  assertIncludes(output, "discover-lan-hosts.ps1 -NoLocalSubnets", "PowerShell wrapper help");
  assertIncludes(output, "--requireMacHost --boardSummary", "PowerShell wrapper help");
  assertIncludes(output, "Windows -> Mac formal manual checklist command", "PowerShell wrapper help");
  assertIncludes(output, "check-mac-formal-e2e.ps1 -Discover -DiscoverNoLocalSubnets", "PowerShell wrapper help");
  assertIncludes(output, "ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics", "PowerShell wrapper help");
  assertIncludes(output, "Windows local one-time reverse-control grant", "PowerShell wrapper help");
  assertIncludes(output, "allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770", "PowerShell wrapper help");
  assertIncludes(output, "allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770", "PowerShell wrapper help");
  assertIncludes(output, "one-line no-password Windows client diagnostics command", "PowerShell wrapper help");
  assertIncludes(output, "test-windows-client-browser.mjs --discover --diagnosticsOnly --boardSummary --timeoutMs 45000", "PowerShell wrapper help");
  assertIncludes(output, "test-windows-client-browser.ps1 -Discover -DiscoverNoLocalSubnets", "PowerShell wrapper help");
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
    assertIncludes(payload.boardSummary, "Windows resume:", "mock JSON board summary");
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
    assertIncludes(payload.commands?.windowsClientDiagnosticsCommand, "test-windows-client-browser.mjs", "mock JSON client diagnostics command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsCommand, "--diagnosticsOnly", "mock JSON client diagnostics command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsCommand, "--boardSummary", "mock JSON client diagnostics command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsCommand, "--discoverNoLocalSubnets", "mock JSON client diagnostics command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsCommand, `--port ${port}`, "mock JSON client diagnostics command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsPowerShellCommand, "test-windows-client-browser.ps1", "mock JSON client diagnostics PowerShell command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsPowerShellCommand, "-DiagnosticsOnly", "mock JSON client diagnostics PowerShell command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsPowerShellCommand, "-BoardSummary", "mock JSON client diagnostics PowerShell command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsPowerShellCommand, "-DiscoverNoLocalSubnets", "mock JSON client diagnostics PowerShell command");
    assertIncludes(payload.commands?.windowsClientDiagnosticsPowerShellCommand, `-Port ${port}`, "mock JSON client diagnostics PowerShell command");
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
    assertIncludes(output, "MacDiscovery=", "PowerShell board summary");
    assertIncludes(output, "discover-lan-hosts.mjs --noLocalSubnets --host 127.0.0.1", "PowerShell board summary");
    assertIncludes(output, "--requireMacHost --boardSummary", "PowerShell board summary");
    assertIncludes(output, "MacDiscoveryPs=", "PowerShell board summary");
    assertIncludes(output, "discover-lan-hosts.ps1 -NoLocalSubnets -HostName 127.0.0.1", "PowerShell board summary");
    assertIncludes(output, "-RequireMacHost -BoardSummary", "PowerShell board summary");
    assertIncludes(output, "FormalChecklist=", "PowerShell board summary");
    assertIncludes(output, "check-mac-formal-e2e.ps1 -Discover -DiscoverNoLocalSubnets", "PowerShell board summary");
    assertIncludes(output, "ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics", "PowerShell board summary");
    assertIncludes(output, "WinClientDiagnostics=", "PowerShell board summary");
    assertIncludes(output, "test-windows-client-browser.mjs --discover --discoverNoLocalSubnets", "PowerShell board summary");
    assertIncludes(output, "--diagnosticsOnly --boardSummary --timeoutMs 45000", "PowerShell board summary");
    assertIncludes(output, "WinClientDiagnosticsPs=", "PowerShell board summary");
    assertIncludes(output, "test-windows-client-browser.ps1 -Discover -DiscoverNoLocalSubnets", "PowerShell board summary");
    assertIncludes(output, "-DiagnosticsOnly -BoardSummary -TimeoutMs 45000", "PowerShell board summary");
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
  await checkBoardSummary(args);
  await checkBoardCurrentCallSummary(args);
  await checkBoardCurrentCallJson(args);
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
