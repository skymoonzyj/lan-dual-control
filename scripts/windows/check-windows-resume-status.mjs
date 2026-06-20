#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  hostProvided: false,
  discover: true,
  discoverNoLocalSubnets: false,
  discoverTimeoutMs: 1200,
  timeoutMs: 12000,
  clientPort: 5197,
  debugPort: 9337,
  alternateClientPort: 5200,
  alternateDebugPort: 9340,
  server: "http://192.168.31.68:17888",
  checkBoard: false,
  checkClientDiagnostics: false,
  allowMockVideo: false,
  skipAudio: false,
  skipClipboard: false,
  skipFileClipboard: false,
  skipInputLog: false,
  requireClean: false,
  requireMacReady: false,
  json: false,
  boardSummary: false,
  userAuthRequest: false,
  sendUserAuthRequest: false,
  sendAgentCallAck: false,
  sendManualUxAck: false,
};
const macHeartbeatFreshnessStaleMs = 2 * 60 * 1000;
const windowsClientRetestUserEntryCommand = "Run-WinClientRetest.cmd";
const windowsClientRetestAndPostUserEntryCommand = "Run-WinClientRetest-And-Post.cmd";
const macClientManualChecklistAction = "Mac client 会话诊断查看“手工清单”：连接/视频/音频/剪贴板/文件/窗口/全屏/原画/input_ack/复制诊断；复制诊断会带出同一行，粘贴前确认不包含连接密码";
const macClientManualChecklistOfflineAction = `页面在线后在 ${macClientManualChecklistAction}`;
const macClientManualChecklistAllowedActions = new Set([
  macClientManualChecklistAction,
  macClientManualChecklistOfflineAction,
]);
const macClientPasswordLocationAction = "Mac client 页面连接 Windows 时，把 Windows 当前临时密码填页面“连接密码”框；formal/browser runner 的终端隐藏输入只用于脚本；不要把密码发通讯板";
const macClientPasswordLocationAllowedActions = new Set([
  macClientPasswordLocationAction,
]);

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/check-windows-resume-status.mjs [options]

Prints a safe Windows-side resume-status report before continuing LAN dual
control work. It is read-only: it does not authenticate a WebSocket, does not
ask for or print passwords, does not send input, and does not execute inject.
JSON, human output, and board summaries include a Windows host media-baseline
command for checking local controlled-side video/audio before Mac reverse
control, including a PowerShell equivalent, plus a local one-time reverse-control grant command for retrying a
Mac reverse-control request without switching Windows host to accept-lab mode.
They also include a no-password Windows client diagnostics command, read-only
Windows video encoder/WGC/WebCodecs support, dedicated Windows Graphics Capture
preflight, and WGC H.264 raw-bgra vs NV12 compare commands.
They also include browser-only WebCodecs H.264 commands and remind the team to
copy the in-page diagnostics report first when UI symptoms need to be shared.
Windows PowerShell and PowerShell 7 help coverage commands are included so .ps1
entry points can be checked before posting a handoff.
JSON and human output also include local alert-watcher start/status commands
so Windows can surface Mac-side auth, permission, blocked, and reverse-grant
requests while a remote-control window is minimized. The report also checks
the local alert-watcher status read-only, without starting it.
When --checkBoard is enabled, the report also surfaces recent
MacHostSafeStart=, MacMaxFpsSafeStart=, MacFormalLocalSmoke=,
MacClientDiscoverWindows=,
MacClientFormalChecklist=,
MacClientFormalSmoke=,
MacClientManualChecklist=,
MacClientPasswordLocation=,
MacRemoteAudioPlan=,
MacInputSafetyPlan=,
MacManualUxStatus=,
MacHeartbeatOnce=, MacHeartbeatWatch=, WindowsReverseGrantStatus=, and
WindowsOpenOneTimeReverseGrant= commands from
Agent Link Board status/messages so Mac host safe foreground-start guidance
and Windows local reverse-control grant guidance are visible in Windows resume
JSON, human output, and one-line board summaries. It also publishes and safely
extracts WindowsSecureAuthPath= / SecureAuthPath= so Mac true browser smoke can
recover from random runtime passwords by asking the user to type the same
temporary password locally on both machines.
It also safely extracts WindowsLanRisk= short labels from the board so the
first Windows resume line can show known Windows host LAN/firewall risks such
as no-firewall-allow or public-profile without leaking free-form board text.
It also includes a secret-free MacHostReadiness command so Windows can ask the
Mac side to run the detailed host readiness/status check before formal testing.
It also includes a secret-free MacHeartbeat command so Windows can ask the Mac
side to publish the independent heartbeat/watchdog summary for stale Codex,
reconnect, Mac host, Mac client, and Agent Link Board status.
The report also includes MacHeartbeatOnce=, MacHeartbeatWatch=, and
MacHeartbeatStart/Status/Stop= commands so the Mac side can either post one
heartbeat now or manage a continuous independent heartbeat watcher. When Mac
resume has already posted its own versions, those commands are safely extracted
and preferred.
If Agent Link Board already has a MacHeartbeat= status, the report also emits
MacHeartbeatFreshness= from the newest checkedAt= timestamp, with checked,
Mac Codex, and board ages, so old heartbeat status is visible in the first
Windows resume line.
If Agent Link Board already has stable MacHeartbeatHealth=, MacCodexHealth=,
MacPowerHealth=, or MacUnattendedHealth= fields, the report also emits
the latest safe health status separately from freshness, including Mac Codex
codexStatus/updatedAt/ageMs/thresholdMs when present, so ok and
blocked/warning states cannot be confused with stale timestamps.
The report also surfaces the formal manual checklist command and the checklist
ids so a resume handoff can immediately verify connection, video, audio,
clipboard, input_ack, and diagnostics in that order.
  It also includes MacDiscovery Node and PowerShell commands that can be posted
  before formal preflight when the team wants a fresh, secret-free /discovery
  snapshot.
  It also includes MacUnattendedFormal with --requireLaunchAgentMaxFps and
  --requireLaunchAgentLoaded so formal 60Hz readiness can treat LaunchAgent max
  FPS gaps and unloaded LaunchAgents as blockers before asking for a password.
  It also includes MacFormalLocalSmoke for the local Mac H.264/PCM/input-log
  smoke check before long formal E2E runs.
  It also includes MacClientDiscoverWindows for the Mac-side read-only Windows
  host discovery check that also reads WindowsLanRisk hints.
  It also includes MacClientFormalChecklist for the Mac client no-password
  formal checklist that can discover the Windows host first.
  It also includes MacClientFormalSmoke for the Mac client no-password formal
  preflight that first starts or reuses the Mac client page.
  It also includes MacClientManualChecklist for the Mac client in-page manual
  checklist row and copy-diagnostics reminder; extraction accepts only the
  known safe text and rejects password/input_event/inject variants.
  It also includes MacClientPasswordLocation for the Mac client page password
  field location reminder; extraction accepts only the known safe text and
  rejects password/input_event/inject variants.
  It also includes MacRemoteAudioPlan for the Mac remote-only audio planning
  path; command extraction accepts only the read-only --boardSummary form.
  It also includes MacInputSafetyPlan for the plan-only Mac real-input safety
  boundary; summary extraction accepts only status=plan-only, default=log,
  realInput=blocked-until-user-watching, required=--confirmUserWatching,
  eventSet=safe, and safety=no-password,no-input-events,no-inject.
  It also includes MacInputSafetyStatus for the current Mac real-input gate;
  status extraction accepts only safe short fields such as blocked/ready,
  inputMode, realInput, --confirmUserWatching, eventSet=safe, no-password
  safety tokens, and checkedAt; password/secret/input_event candidates are rejected.
  It also includes MacInputSafetyUserNotice for the short user-facing notice
  required before real Mac input tests: goal/action/boundary/duration tokens
  are accepted only from a fixed allow-list and never trigger input/inject.
  It also includes MacManualUxStatus for the secret-free post-PASS manual UX
  first-screen status path; command extraction accepts only the read-only
  --boardSummary form.

Options:
  --host <host>                 Explicit Mac host target. Default: ${defaults.host}
  --port <port>                 Mac host port. Default: ${defaults.port}
  --noDiscover                  Do not scan; only preflight --host/--port.
  --discover                    Auto-discover the best Mac host. Default: on.
  --discoverNoLocalSubnets      Only probe 127.0.0.1 and explicit --host targets.
  --discoverTimeoutMs <ms>      Per-host discovery timeout. Default: ${defaults.discoverTimeoutMs}
  --timeoutMs <ms>              Per child command timeout. Default: ${defaults.timeoutMs}
  --clientPort <port>           Windows client diagnostics page port. Default: ${defaults.clientPort}
  --debugPort <port>            Windows client diagnostics browser CDP port. Default: ${defaults.debugPort}
  --alternateClientPort <port>  Suggested alternate page port if defaults are busy. Default: ${defaults.alternateClientPort}
  --alternateDebugPort <port>   Suggested alternate CDP port if defaults are busy. Default: ${defaults.alternateDebugPort}
  --server <url>                Agent Link Board URL. Default: ${defaults.server}
  --checkBoard                  Read one Agent Link Board snapshot, including currentCall.
  --checkClientDiagnostics      Also run Windows client diagnostics in formal preflight.
  --allowMockVideo              Permit mock video in formal preflight; tests only.
  --skipAudio                   Skip audio capability in formal preflight.
  --skipClipboard               Skip text/file clipboard in formal preflight.
  --skipFileClipboard           Skip file clipboard only in formal preflight.
  --skipInputLog                Skip inputMode=log in formal preflight.
  --requireClean                Exit non-zero if git worktree is dirty.
  --requireMacReady             Exit non-zero if Mac formal preflight is not ready.
  --boardSummary                Print a one-line secret-free Agent Link Board summary.
  --userAuthRequest             Print a secret-free NEED_USER_AUTH message for Agent Link Board.
  --sendUserAuthRequest         Send NEED_USER_AUTH to Agent Link Board only when preflight is ready.
  --sendAgentCallAck            Send the secret-free AgentCallAck only when secure-auth currentCall is ready.
  --sendManualUxAck           Send the secret-free Mac manual UX ack only when the manual UX call is active.
  --json                        Print one machine-readable JSON object.
  --help, -h                    Show this help without probing anything.

Examples:
  node scripts/windows/check-windows-resume-status.mjs --checkBoard --boardSummary
  node scripts/windows/check-windows-resume-status.mjs --checkBoard --checkClientDiagnostics --userAuthRequest
  node scripts/windows/check-windows-resume-status.mjs --checkBoard --checkClientDiagnostics --sendUserAuthRequest
  node scripts/windows/check-windows-resume-status.mjs --checkBoard --sendAgentCallAck --json
  node scripts/windows/check-windows-resume-status.mjs --checkBoard --sendManualUxAck --json
  node scripts/windows/check-windows-resume-status.mjs --discoverNoLocalSubnets --host 192.168.31.122 --port 43770 --json
  node scripts/windows/discover-lan-hosts.mjs --noLocalSubnets --host 192.168.31.122 --port 43770 --requireMacHost --boardSummary
  node scripts/mac/check-mac-host-readiness.mjs --host 192.168.31.122 --port 43770 --checkBoard --boardSummary
  node scripts/mac/check-mac-heartbeat.mjs --host 192.168.31.122 --port 43770 --checkBoard --boardSummary
  node scripts/mac/watch-mac-heartbeat.mjs --once --sendStatus --boardSummary
  node scripts/mac/watch-mac-heartbeat.mjs --sendStatus --intervalMs 30000
  node scripts/mac/start-mac-heartbeat-watcher.mjs --boardSummary
  node scripts/mac/start-mac-heartbeat-watcher.mjs --status --boardSummary
  node scripts/mac/start-mac-heartbeat-watcher.mjs --stop --boardSummary
  node scripts/mac/check-mac-formal-local-smoke.mjs --host 192.168.31.122 --port 43770 --promptPassword --boardSummary
  node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary
  node scripts/mac/check-mac-client-formal-status.mjs --discover --port 43770 --boardSummary
  node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary
  node scripts/mac/plan-mac-remote-audio.mjs --boardSummary
  node scripts/mac/plan-mac-input-safety.mjs --boardSummary
  node scripts/mac/check-mac-manual-ux-status.mjs --boardSummary
  node scripts/mac/check-mac-unattended-status.mjs --host 192.168.31.122 --port 43770 --boardSummary
  node scripts/mac/check-mac-unattended-status.mjs --host 192.168.31.122 --port 43770 --requireLaunchAgentMaxFps --requireLaunchAgentLoaded --boardSummary
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/discover-lan-hosts.ps1 -NoLocalSubnets -HostName 192.168.31.122 -Port 43770 -RequireMacHost -BoardSummary
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-mac-formal-e2e.ps1 -Discover -DiscoverNoLocalSubnets -HostName 192.168.31.122 -Port 43770 -PreflightOnly -CheckClientDiagnostics -BoardSummary
  node scripts/windows/check-windows-resume-status.mjs --checkBoard --clientPort 5200 --debugPort 9340 --boardSummary
  node scripts/windows/test-windows-client-browser.mjs --discover --diagnosticsOnly --boardSummary --timeoutMs 45000
  Run-WinClientRetest.cmd
  Run-WinClientRetest-And-Post.cmd
  Run-WinClientRetest.cmd -DiscoverNoLocalSubnets -HostName 192.168.31.122 -Port 43770
  node scripts/windows/test-windows-client-browser.mjs --discover --discoverNoLocalSubnets --host 192.168.31.122 --port 43770 --promptPassword --requirePassword --requireH264 --boardSummary --timeoutMs 45000
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-client-browser.ps1 -Discover -DiscoverNoLocalSubnets -HostName 192.168.31.122 -Port 43770 -DiagnosticsOnly -BoardSummary -TimeoutMs 45000
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-client-browser.ps1 -Discover -DiscoverNoLocalSubnets -HostName 192.168.31.122 -Port 43770 -PromptPassword -RequirePassword -RequireH264 -BoardSummary -TimeoutMs 45000
  node scripts/windows/check-windows-host-readiness.mjs --checkBoard --probeMedia --boardSummary
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-host-readiness.ps1 -CheckBoard -ProbeMedia -BoardSummary
  node scripts/windows/check-windows-video-encoder-support.mjs --boardSummary
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-video-encoder-support.ps1 -BoardSummary
  node scripts/windows/check-windows-wgc-support.mjs --boardSummary
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-wgc-support.ps1 -BoardSummary
  node scripts/windows/compare-windows-wgc-h264-sources.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/compare-windows-wgc-h264-sources.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary
  node scripts/windows/check-webcodecs-h264-support.mjs --requireCodec avc1.42C02A --boardSummary
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-webcodecs-h264-support.ps1 -RequireCodec avc1.42C02A -BoardSummary
  node scripts/windows/test-windows-powershell-help.mjs --timeoutMs 10000 --boardSummary
  node scripts/windows/test-windows-powershell-help.mjs --shell pwsh --timeoutMs 10000 --boardSummary
  node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --durationMs 30000 --boardSummary
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -DurationMs 30000 -BoardSummary
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Status -BoardSummary
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Grant -DurationMs 30000 -BoardSummary
  node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port 43770 --promptPassword --requirePassword
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-mac-alert-watcher.ps1 -Server ${defaults.server}
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-mac-alert-watcher.ps1 -Server ${defaults.server} -Status
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
    if (token === "--noDiscover") {
      args.discover = false;
      continue;
    }
    if (
      token === "--discover" ||
      token === "--discoverNoLocalSubnets" ||
      token === "--checkBoard" ||
      token === "--checkClientDiagnostics" ||
      token === "--allowMockVideo" ||
      token === "--skipAudio" ||
      token === "--skipClipboard" ||
      token === "--skipFileClipboard" ||
      token === "--skipInputLog" ||
      token === "--requireClean" ||
      token === "--requireMacReady" ||
      token === "--boardSummary" ||
      token === "--userAuthRequest" ||
      token === "--sendUserAuthRequest" ||
      token === "--sendAgentCallAck" ||
      token === "--sendManualUxAck" ||
      token === "--json"
    ) {
      args[token.slice(2)] = true;
      continue;
    }
    if (token === "--host" && next && !next.startsWith("--")) {
      args.host = next;
      args.hostProvided = true;
      index += 1;
      continue;
    }
    if (token === "--port" && next && !next.startsWith("--")) {
      args.port = clampInteger(next, 1, 65535, defaults.port);
      index += 1;
      continue;
    }
    if (token === "--discoverTimeoutMs" && next && !next.startsWith("--")) {
      args.discoverTimeoutMs = clampInteger(next, 250, 10000, defaults.discoverTimeoutMs);
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 3000, 120000, defaults.timeoutMs);
      index += 1;
      continue;
    }
    if (token === "--clientPort" && next && !next.startsWith("--")) {
      args.clientPort = clampInteger(next, 1, 65535, defaults.clientPort);
      index += 1;
      continue;
    }
    if (token === "--debugPort" && next && !next.startsWith("--")) {
      args.debugPort = clampInteger(next, 1, 65535, defaults.debugPort);
      index += 1;
      continue;
    }
    if (token === "--alternateClientPort" && next && !next.startsWith("--")) {
      args.alternateClientPort = clampInteger(next, 1, 65535, defaults.alternateClientPort);
      index += 1;
      continue;
    }
    if (token === "--alternateDebugPort" && next && !next.startsWith("--")) {
      args.alternateDebugPort = clampInteger(next, 1, 65535, defaults.alternateDebugPort);
      index += 1;
      continue;
    }
    if (token === "--server" && next && !next.startsWith("--")) {
      args.server = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  args.host = String(args.host || defaults.host).trim();
  args.server = String(args.server || defaults.server).trim();
  return args;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function command(commandName, commandArgs, options = {}) {
  const result = spawnSync(commandName, commandArgs, {
    cwd: options.cwd || repoRoot,
    encoding: "utf8",
    timeout: options.timeoutMs || 5000,
    maxBuffer: options.maxBuffer || 8 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
      ...(options.env || {}),
    },
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    error: result.error ? result.error.message : "",
  };
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function tailLines(text, limit = 12) {
  const lines = splitLines(text);
  return lines.slice(-limit);
}

function isActiveCallStatus(status) {
  const normalized = normalizedText(status).toLowerCase();
  if (!normalized) return true;
  return !["done", "complete", "completed", "clear", "cleared", "cancelled", "canceled", "idle"].includes(normalized);
}

function isWindowsText(text) {
  return /windows|Windows Codex|Windows 端|Windows host|windows-host|start-windows-host/i.test(String(text || ""));
}

function isMacText(text) {
  return /mac|macOS|Mac Codex|Mac 端/i.test(String(text || ""));
}

function parseBoardCurrentCall(output) {
  const lines = splitLines(output);
  const callIndex = lines.findIndex((line) => line.startsWith("[call]"));
  if (callIndex < 0) {
    return {
      present: false,
      active: false,
      summary: "none",
    };
  }
  const callLine = lines[callIndex];
  if (/^\[call\]\s+none\b/i.test(callLine)) {
    return {
      present: false,
      active: false,
      summary: "none",
    };
  }

  const parsed = {
    present: true,
    status: "",
    from: "",
    need: "",
    goal: "",
    environment: "",
    connection: "",
    command: "",
    expected: "",
    actual: "",
    ask: "",
    blockedBy: "",
    active: false,
    needsWindows: false,
    fromMacSide: false,
    summary: "",
  };
  const header = callLine.match(/^\[call\]\s*([^:]*):\s*(.*)$/);
  if (header) {
    parsed.status = normalizedText(header[1]);
    parsed.goal = normalizedText(header[2]);
  }

  const fields = new Map([
    ["from", "from"],
    ["need", "need"],
    ["environment", "environment"],
    ["connection", "connection"],
    ["command", "command"],
    ["expected", "expected"],
    ["actual", "actual"],
    ["ask", "ask"],
    ["blockedBy", "blockedBy"],
  ]);
  for (const line of lines.slice(callIndex + 1)) {
    if (line.startsWith("[")) break;
    const field = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (!field) continue;
    const key = fields.get(field[1]);
    if (key) parsed[key] = normalizedText(field[2]);
  }

  const text = [
    parsed.goal,
    parsed.environment,
    parsed.connection,
    parsed.command,
    parsed.expected,
    parsed.actual,
    parsed.ask,
    parsed.blockedBy,
  ].join("\n");
  parsed.active = isActiveCallStatus(parsed.status);
  parsed.needsWindows = isWindowsText(parsed.need) || isWindowsText(text);
  parsed.fromMacSide = isMacText(parsed.from) || isMacText(text);
  const direction = [parsed.from || "unknown", parsed.need || "unknown"].join("->");
  parsed.summary = `${parsed.status || "CALL"} ${direction}${parsed.goal ? ` ${parsed.goal}` : ""}`;
  return parsed;
}

function normalizeBoardCurrentCall(call) {
  if (!call || typeof call !== "object") {
    return {
      present: false,
      active: false,
      summary: "none",
    };
  }
  const parsed = {
    present: true,
    status: normalizedText(call.status),
    from: normalizedText(call.from),
    need: normalizedText(call.need),
    goal: normalizedText(call.goal),
    environment: normalizedText(call.environment),
    connection: normalizedText(call.connection),
    command: normalizedText(call.command),
    expected: normalizedText(call.expected),
    actual: normalizedText(call.actual),
    ask: normalizedText(call.ask),
    blockedBy: normalizedText(call.blockedBy),
    owner: normalizedText(call.owner),
    timeout: normalizedText(call.timeout),
    startedAt: normalizedText(call.startedAt),
    updatedAt: normalizedText(call.updatedAt),
    active: false,
    needsWindows: false,
    fromMacSide: false,
    summary: "",
  };
  const text = [
    parsed.goal,
    parsed.environment,
    parsed.connection,
    parsed.command,
    parsed.expected,
    parsed.actual,
    parsed.ask,
    parsed.blockedBy,
  ].join("\n");
  parsed.active = isActiveCallStatus(parsed.status);
  parsed.needsWindows = isWindowsText(parsed.need) || isWindowsText(text);
  parsed.fromMacSide = isMacText(parsed.from) || isMacText(text);
  const direction = [parsed.from || "unknown", parsed.need || "unknown"].join("->");
  parsed.summary = `${parsed.status || "CALL"} ${direction}${parsed.goal ? ` ${parsed.goal}` : ""}`;
  return parsed;
}

function isSecureAuthCurrentCall(call) {
  if (!call?.active || !call.needsWindows || !call.fromMacSide || !isMacText(call.from)) {
    return false;
  }
  const text = [
    call.goal,
    call.environment,
    call.connection,
    call.command,
    call.expected,
    call.actual,
    call.ask,
    call.blockedBy,
  ].join("\n");
  return /secure\s*auth|安全认证|认证路径|随机运行期密码|运行期密码|LAN_DUAL_PASSWORD|promptPassword|password|密码|auth/i.test(text);
}

function isPostPassCurrentCall(call) {
  if (!call?.active) return false;
  const text = [
    call.goal,
    call.environment,
    call.connection,
    call.command,
    call.expected,
    call.actual,
    call.ask,
    call.blockedBy,
  ].join("\n");
  return /REAL_TEST_PASS/.test(text) &&
    /(后续|PASS_RECORDED|TAIL_ERROR|NativeCommandFailed|手工体验|manual\s*ux|不要回旧|diagnostics\s*循环)/i.test(text);
}

function makePrimaryNextSegments(report, mac) {
  if (isPostPassCurrentCall(report.board?.currentCall)) {
    return [
      "PostPassNext=WindowsRecordPassAndTailError+MacManualUxStandby.",
      "ManualUxChecklist=connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics.",
    ];
  }
  return [
    `Next=${mac.ok ? report.commands.formalRunFixedTarget : report.commands.preflightBoardSummary}.`,
  ];
}

function annotateBoardCurrentCall(board, commands) {
  const currentCall = board?.currentCall;
  if (!currentCall?.present) {
    return;
  }
  const windowsSecureAuthPathCommand = board.windowsSecureAuthPath?.command || commands?.windowsSecureAuthPath || "";
  if (isSecureAuthCurrentCall(currentCall) && windowsSecureAuthPathCommand) {
    currentCall.secureAuthPathReady = true;
    currentCall.next = "mac-confirm-secure-auth-path";
    currentCall.nextDetail = "WindowsSecureAuthPath is available; Mac can confirm the local safe auth path before the call is cleared.";
    currentCall.agentCallAckCommand = makeAgentCallAckCommand(commands?.server || defaults.server, windowsSecureAuthPathCommand);
  } else {
    currentCall.secureAuthPathReady = false;
    currentCall.next = "";
    currentCall.nextDetail = "";
    currentCall.agentCallAckCommand = "";
  }
}

function countBoardStateItems(state) {
  if (!state || typeof state !== "object") return 0;
  const statusCount = state.statuses && typeof state.statuses === "object"
    ? Object.keys(state.statuses).length
    : 0;
  const eventCount = Array.isArray(state.events) ? state.events.length : 0;
  const messageCount = Array.isArray(state.messages) ? state.messages.length : 0;
  const callCount = state.currentCall ? 1 : 0;
  const userPresenceCount = state.userPresence ? 1 : 0;
  return statusCount + eventCount + messageCount + callCount + userPresenceCount;
}

function emptyMacSafeStart(source = "none", textCount = 0, rejectedCount = 0) {
  return {
    found: false,
    command: "",
    commands: [],
    source,
    textCount,
    rejectedCount,
  };
}

function emptyMacClientManualChecklist(source = "none", textCount = 0, rejectedCount = 0) {
  return {
    found: false,
    action: "",
    summary: "",
    source,
    textCount,
    segmentCount: 0,
    rejectedCount,
  };
}

function emptyMacClientPasswordLocation(source = "none", textCount = 0, rejectedCount = 0) {
  return {
    found: false,
    action: "",
    summary: "",
    source,
    textCount,
    segmentCount: 0,
    rejectedCount,
  };
}

function emptyMacInputSafety(source = "none", textCount = 0, rejectedCount = 0) {
  return {
    found: false,
    source,
    textCount,
    rejectedCount,
    status: "",
    defaultMode: "",
    realInput: "",
    required: "",
    eventSet: "",
    safety: [],
    summary: "not-seen",
  };
}

function emptyMacInputSafetyStatus(source = "none", textCount = 0, rejectedCount = 0) {
  return {
    found: false,
    source,
    textCount,
    segmentCount: 0,
    rejectedCount,
    status: "",
    reason: "",
    inputMode: "",
    realInput: "",
    required: "",
    eventSet: "",
    safety: [],
    checkedAt: "",
    summary: "not-seen",
  };
}

function emptyMacInputSafetyUserNotice(source = "none", textCount = 0, rejectedCount = 0) {
  return {
    found: false,
    source,
    textCount,
    segmentCount: 0,
    rejectedCount,
    goal: "",
    action: "",
    boundary: "",
    duration: "",
    summary: "not-seen",
  };
}
function emptyUserPresence(source = "none") {
  return {
    found: false,
    source,
    status: "unknown",
    label: "",
    reason: "",
    instruction: "",
    updatedAt: "",
    updatedBy: "",
    action: "unknown",
    blocker: "",
    summary: "status=unknown source=none action=unknown",
  };
}

const userPresenceSecretPattern = /(?:^|[\s,;])(?:password|secret|passwd|token|apikey|api-key|credential|cookie|pwd)\s*[:=]|--(?:password|token|secret|passwd|pwd)\b|密码\s*[:=]|密钥|口令|令牌/i;

function safeIsoTimestamp(value) {
  const text = normalizedText(value);
  if (!text) return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text) && Number.isFinite(Date.parse(text));
}
function safeUserPresenceText(value, maxLength = 120) {
  const text = normalizedText(value).replace(/[.]+$/g, "");
  if (!text || userPresenceSecretPattern.test(text)) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function normalizeUserPresenceStatus(value) {
  const text = normalizedText(value).toLowerCase();
  if (["present", "awake", "user-present", "user_awake", "用户在场", "在场"].includes(text)) return "present";
  if (["away", "sleeping", "asleep", "user-away", "user_sleeping", "用户不在", "不在", "休息", "睡觉"].includes(text)) return "away";
  if (["unknown", "none", ""].includes(text)) return "unknown";
  return "unknown";
}

function userPresenceAction(status) {
  if (status === "present") return "explain-before-auth";
  if (status === "away") return "no-auth-only";
  return "unknown";
}

function normalizeBoardUserPresence(state, source = "api-state") {
  const presence = state?.userPresence;
  if (!presence || typeof presence !== "object") return emptyUserPresence(source);
  const status = normalizeUserPresenceStatus(presence.status || presence.state);
  const action = userPresenceAction(status);
  const updatedAt = safeIsoTimestamp(presence.updatedAt) ? presence.updatedAt : "";
  const result = {
    found: status !== "unknown" || Boolean(presence.status || presence.state),
    source,
    status,
    label: safeUserPresenceText(presence.label, 80),
    reason: safeUserPresenceText(presence.reason, 120),
    instruction: safeUserPresenceText(presence.instruction, 180),
    updatedAt,
    updatedBy: safeUserPresenceText(presence.updatedBy, 80),
    action,
    blocker: status === "away" ? "BLOCKED_BY_USER_AWAY" : "",
  };
  const parts = [
    `status=${result.status}`,
    `source=${result.source}`,
    ...(result.updatedAt ? [`updatedAt=${result.updatedAt}`] : []),
    ...(result.label ? [`label=${result.label}`] : []),
    `action=${result.action}`,
    ...(result.blocker ? [`blocker=${result.blocker}`] : []),
  ];
  result.summary = parts.join(" ");
  return result;
}

function emptyMacManualUx(source = "none", textCount = 0, rejectedCount = 0) {
  return {
    found: false,
    source,
    textCount,
    rejectedCount,
    status: "",
    checklist: "",
    labels: "",
    signals: [],
    target: "",
    next: "",
    safety: [],
    noFormalE2ERerun: false,
    manualUxCall: "",
    callCommandPresent: false,
    blockers: [],
    warnings: [],
    summary: "not-seen",
  };
}

function emptyMacRemoteAudio(source = "none", textCount = 0, rejectedCount = 0) {
  return {
    found: false,
    source,
    textCount,
    rejectedCount,
    status: "",
    capture: "",
    remoteOnlyOptions: [],
    recommended: "",
    safety: [],
    summary: "not-seen",
  };
}

function emptyMacHeartbeatFreshness(source = "none", textCount = 0) {
  return {
    present: false,
    source,
    textCount,
    status: "not-seen",
    stale: false,
    checkedAt: "",
    boardUpdatedAt: "",
    codexUpdatedAt: "",
    checkedAgeMs: null,
    boardAgeMs: null,
    codexAgeMs: null,
    summary: "not-seen",
  };
}

function emptyMacHealth(source = "none", textCount = 0, rejectedCount = 0) {
  return {
    found: false,
    source,
    textCount,
    status: "not-seen",
    reason: "",
    checkedAt: "",
    checked: "",
    codexStatus: "",
    updatedAt: "",
    ageMs: null,
    thresholdMs: null,
    blockers: [],
    warnings: [],
    summary: "not-seen",
    rejectedCount,
  };
}

function emptyMacHeartbeatHealth(source = "none", textCount = 0, rejectedCount = 0) {
  return emptyMacHealth(source, textCount, rejectedCount);
}

function emptyMacCodexHealth(source = "none", textCount = 0, rejectedCount = 0) {
  return emptyMacHealth(source, textCount, rejectedCount);
}

function emptyMacPowerHealth(source = "none", textCount = 0, rejectedCount = 0) {
  return emptyMacHealth(source, textCount, rejectedCount);
}

function emptyMacUnattendedHealth(source = "none", textCount = 0, rejectedCount = 0) {
  return emptyMacHealth(source, textCount, rejectedCount);
}

function emptyMacEvidence(source = "none", textCount = 0, rejectedCount = 0) {
  return {
    found: false,
    source,
    textCount,
    tokens: [],
    summary: "not-seen",
    rejectedCount,
  };
}
function emptyMacReadyForRealTest(source = "none", textCount = 0, rejectedCount = 0) {
  return {
    found: false,
    source,
    textCount,
    segmentCount: 0,
    rejectedCount,
    host: "",
    port: null,
    build: "",
    inputMode: "",
    maxScreenFps: null,
    media: "",
    readiness: "",
    blockers: [],
    warnings: [],
    summary: "not-seen",
  };
}

function splitMacReadyForRealTestSegments(text) {
  const source = String(text || "");
  const matches = [...source.matchAll(/\bMAC_READY_FOR_REAL_TEST\b/gi)];
  return matches.map((match, index) => {
    const next = matches[index + 1];
    return source.slice(match.index, next ? next.index : source.length);
  });
}

function isSafeMacReadyHost(value) {
  const host = String(value || "").trim();
  if (!host || host.length > 253) return false;
  if (/^(?:0\.0\.0\.0|\*|unknown|none|null|undefined)$/i.test(host)) return false;
  if (/(?:secret|password|passwd|token|apikey|api-key|credential|cookie|账号|密钥|密码|口令)/i.test(host)) return false;
  return /^[A-Za-z0-9_.:-]+$/.test(host);
}

function parseMacReadyHostPort(rawHost, rawPort) {
  let host = String(rawHost || "").trim();
  let portText = String(rawPort || "").trim();
  const bracketMatch = host.match(/^\[([^\]]+)\]:(\d{1,5})$/);
  const simpleMatch = host.match(/^([^:]+):(\d{1,5})$/);
  if (bracketMatch) {
    host = bracketMatch[1];
    if (!portText) portText = bracketMatch[2];
  } else if (simpleMatch) {
    host = simpleMatch[1];
    if (!portText) portText = simpleMatch[2];
  }
  const port = Number(portText);
  if (!isSafeMacReadyHost(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }
  return { host, port };
}

function normalizeSafeMacReadyToken(value) {
  const token = String(value || "").trim();
  if (!token || token.length > 80) return "";
  if (/(?:secret|password|passwd|token|apikey|api-key|credential|cookie|账号|密钥|密码|口令)/i.test(token)) return "";
  return /^[A-Za-z0-9._/:=-]+$/.test(token) ? token : "";
}

function parseMacReadyForRealTestSegment(segment, source) {
  const text = String(segment || "");
  if (!/\bMAC_READY_FOR_REAL_TEST\b/i.test(text)) return null;
  if (/(?:--password\s+|-Password\s+|LAN_DUAL_PASSWORD\s*=|CODEX_LINK_TOKEN\s*=|secret-value|token\s*=|passwd\s*=|credential\s*=|cookie\s*=|密钥\s*=|密码\s*=|口令\s*=)/i.test(text)) {
    return null;
  }

  const target = parseMacReadyHostPort(extractLabeledValue(text, "host"), extractLabeledValue(text, "port"));
  if (!target) return null;

  const blockers = parseMacHealthList(text, "blockers");
  const warnings = parseMacHealthList(text, "warnings");
  if (!blockers.ok || !warnings.ok || blockers.values.length > 0) return null;

  const media = normalizeSafeMacReadyToken(extractLabeledValue(text, "media"));
  const readiness = normalizeSafeMacReadyToken(extractLabeledValue(text, "readiness"));
  const hasReadyEvidence =
    /^(?:ok|passed|ready)$/i.test(media) ||
    /^(?:passed|ok|ready)(?:=|:|\/|$)/i.test(readiness) ||
    /\bblockers\s*=\s*none\b/i.test(text);
  if (!hasReadyEvidence) return null;

  const build = normalizeSafeMacReadyToken(extractLabeledValue(text, "build"));
  const inputMode = normalizeSafeMacReadyToken(extractLabeledValue(text, "inputMode"));
  const fpsRaw = extractLabeledValue(text, "maxScreenFps");
  const maxScreenFps = /^\d{1,4}$/.test(fpsRaw) ? Number(fpsRaw) : null;
  const summary = [
    `host=${target.host}`,
    `port=${target.port}`,
    build ? `build=${build}` : "",
    inputMode ? `inputMode=${inputMode}` : "",
    maxScreenFps ? `maxScreenFps=${maxScreenFps}` : "",
    media ? `media=${media}` : "",
    readiness ? `readiness=${readiness}` : "",
    `blockers=${blockers.values.length ? blockers.values.join(",") : "none"}`,
    `warnings=${warnings.values.length ? warnings.values.join(",") : "none"}`,
  ].filter(Boolean).join(" ");

  return {
    found: true,
    source,
    host: target.host,
    port: target.port,
    build,
    inputMode,
    maxScreenFps,
    media,
    readiness,
    blockers: blockers.values,
    warnings: warnings.values,
    summary,
  };
}

function extractMacReadyForRealTestFromTexts(texts, source = "text") {
  let selected = null;
  let segmentCount = 0;
  let rejectedCount = 0;
  for (const text of texts) {
    for (const segment of splitMacReadyForRealTestSegments(text)) {
      segmentCount += 1;
      const parsed = parseMacReadyForRealTestSegment(segment, source);
      if (!parsed) {
        rejectedCount += 1;
        continue;
      }
      selected = parsed;
    }
  }
  if (!selected) return emptyMacReadyForRealTest(source, texts.length, rejectedCount);
  return {
    ...selected,
    textCount: texts.length,
    segmentCount,
    rejectedCount,
  };
}

function extractMacReadyForRealTestFromBoardState(state) {
  return extractMacReadyForRealTestFromTexts(collectStringValues(state), "api-state");
}

function extractMacReadyForRealTestFromText(text, source = "text") {
  const value = String(text || "");
  return extractMacReadyForRealTestFromTexts(value ? [value] : [], source);
}

function collectStringValues(value, results = [], depth = 0) {
  if (depth > 6 || value === null || value === undefined) return results;
  if (typeof value === "string") {
    const text = normalizedText(value);
    if (text) results.push(text);
    return results;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, results, depth + 1);
    return results;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value)) collectStringValues(item, results, depth + 1);
  }
  return results;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractLabeledValue(text, key) {
  const pattern = new RegExp(`\\b${escapeRegExp(key)}\\s*=\\s*([^\\s;；，。]+)`, "i");
  const match = pattern.exec(String(text || ""));
  return match ? match[1].replace(/[.。]+$/g, "") : "";
}

function parseIsoAgeMs(value, now = Date.now()) {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, now - parsed);
}

function formatAgeSeconds(ageMs) {
  const age = Number(ageMs);
  if (!Number.isFinite(age) || age < 0) return "unknown";
  return `${Math.round(age / 1000)}s`;
}

function extractMacHeartbeatSegments(text) {
  const source = String(text || "");
  const matches = [...source.matchAll(/\bMacHeartbeat\s*=/gi)];
  return matches.map((match, index) => {
    const next = matches[index + 1];
    return source.slice(match.index, next ? next.index : source.length);
  });
}

function parseMacHeartbeatSegment(segment, source, now = Date.now()) {
  const checkedAt = extractLabeledValue(segment, "checkedAt");
  const boardUpdatedAt = extractLabeledValue(segment, "boardUpdatedAt");
  const codexUpdatedAt = extractLabeledValue(segment, "updatedAt");
  const codexAgeRaw = extractLabeledValue(segment, "ageMs");
  const rawCodexAgeMs = Number(codexAgeRaw);
  const checkedAgeMs = parseIsoAgeMs(checkedAt, now);
  const boardAgeMs = parseIsoAgeMs(boardUpdatedAt, now);
  const codexAgeMs = Number.isFinite(rawCodexAgeMs)
    ? Math.max(0, rawCodexAgeMs)
    : parseIsoAgeMs(codexUpdatedAt, now);
  const checkedTime = Date.parse(checkedAt);
  const stale = checkedAgeMs !== null && checkedAgeMs >= macHeartbeatFreshnessStaleMs;
  const status = checkedAgeMs === null ? "unknown" : stale ? "stale" : "fresh";
  const summary = [
    status,
    `checked=${formatAgeSeconds(checkedAgeMs)}`,
    `codex=${formatAgeSeconds(codexAgeMs)}`,
    `board=${formatAgeSeconds(boardAgeMs)}`,
    checkedAt ? `checkedAt=${checkedAt}` : "",
  ].filter(Boolean).join(" ");
  return {
    present: true,
    source,
    status,
    stale,
    checkedAt,
    boardUpdatedAt,
    codexUpdatedAt,
    checkedAgeMs,
    boardAgeMs,
    codexAgeMs,
    checkedTime: Number.isFinite(checkedTime) ? checkedTime : Number.NEGATIVE_INFINITY,
    summary,
  };
}

function extractMacHeartbeatFreshnessFromTexts(texts, source = "text") {
  const segments = [];
  for (const text of texts) {
    segments.push(...extractMacHeartbeatSegments(text));
  }
  if (!segments.length) return emptyMacHeartbeatFreshness(source, texts.length);
  let selected = null;
  const now = Date.now();
  for (const segment of segments) {
    const parsed = parseMacHeartbeatSegment(segment, source, now);
    if (!selected || parsed.checkedTime >= selected.checkedTime) {
      selected = parsed;
    }
  }
  const { checkedTime, ...safeSelected } = selected;
  return {
    ...safeSelected,
    textCount: texts.length,
    segmentCount: segments.length,
  };
}

function extractMacHeartbeatFreshnessFromBoardState(state) {
  return extractMacHeartbeatFreshnessFromTexts(collectStringValues(state), "api-state");
}

function extractMacHeartbeatFreshnessFromText(text, source = "text") {
  const value = String(text || "");
  return extractMacHeartbeatFreshnessFromTexts(value ? [value] : [], source);
}

function splitLabeledSegments(text, label) {
  const source = String(text || "");
  const matches = [...source.matchAll(new RegExp(`\\b${escapeRegExp(label)}\\s*=`, "gi"))];
  return matches.map((match, index) => {
    const next = matches[index + 1];
    const rawSegment = source.slice(match.index, next ? next.index : source.length);
    const boundaryMatch = /\s+(?=(?:Mac|Windows|Win|PowerShell|Formal|Manual|Next|Copy|ReverseGrant)[A-Za-z0-9]*\s*=)/.exec(rawSegment.slice(1));
    return boundaryMatch ? rawSegment.slice(0, boundaryMatch.index + 1) : rawSegment;
  });
}

function normalizeMacHealthStatus(value) {
  const status = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "");
  if (!status) return "";
  if (status === "healthy" || status === "normal") return "ok";
  if (["ok", "warning", "blocked", "failed", "stale", "unknown"].includes(status)) return status;
  return "";
}

function isSafeMacHealthToken(value) {
  const token = String(value || "").trim();
  if (!token || token.length > 80) return false;
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(token)) return false;
  if (/(?:secret|password|passwd|token|apikey|api-key|key|pwd|pass|credential|cookie|账号|密钥|密码)/i.test(token)) {
    return false;
  }
  return true;
}

function normalizeMacHealthTimestamp(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length > 48 || !/^[0-9T:Z.+-]+$/i.test(text)) return "";
  return Number.isFinite(Date.parse(text)) ? text : "";
}

function parseMacHealthInteger(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (!/^\d{1,12}$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseMacHealthList(segment, label) {
  const raw = extractLabeledValue(segment, label);
  if (!raw || /^none$/i.test(raw)) return { ok: true, values: [] };
  const values = raw
    .split(/[,|/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (values.length === 0) return { ok: true, values: [] };
  if (!values.every(isSafeMacHealthToken)) return { ok: false, values: [] };
  return { ok: true, values };
}

function parseMacHealthSegment(segment, source, fieldName) {
  if (/(?:--password|--token|LAN_DUAL_PASSWORD|secret|password|passwd|token|apikey|api-key|credential|cookie|密钥|密码)/i.test(segment)) {
    return null;
  }

  const directMatch = new RegExp(`\\b${escapeRegExp(fieldName)}\\s*=\\s*([^\\s;；，。]+)`, "i").exec(String(segment || ""));
  const directValue = directMatch ? directMatch[1] : "";
  const status = normalizeMacHealthStatus(extractLabeledValue(segment, "status") || directValue.replace(/^status=/i, ""));
  if (!status) return null;

  const reason = extractLabeledValue(segment, "reason") || (status === "ok" ? "ok" : status);
  if (!isSafeMacHealthToken(reason)) return null;

  const blockers = parseMacHealthList(segment, "blockers");
  const warnings = parseMacHealthList(segment, "warnings");
  if (!blockers.ok || !warnings.ok) return null;

  const checkedAt = extractLabeledValue(segment, "checkedAt");
  const checked = extractLabeledValue(segment, "checked");
  const codexStatusRaw = extractLabeledValue(segment, "codexStatus");
  if (codexStatusRaw && !isSafeMacHealthToken(codexStatusRaw)) return null;
  const codexStatus = codexStatusRaw || "";
  const updatedAtRaw = extractLabeledValue(segment, "updatedAt");
  const updatedAt = normalizeMacHealthTimestamp(updatedAtRaw);
  if (updatedAtRaw && !updatedAt) return null;
  const ageMsRaw = extractLabeledValue(segment, "ageMs");
  const ageMs = parseMacHealthInteger(ageMsRaw);
  if (ageMsRaw && ageMs === null) return null;
  const thresholdMsRaw = extractLabeledValue(segment, "thresholdMs");
  const thresholdMs = parseMacHealthInteger(thresholdMsRaw);
  if (thresholdMsRaw && thresholdMs === null) return null;
  const checkedTime = Date.parse(checkedAt);
  const summary = [
    status,
    checkedAt ? `checkedAt=${checkedAt}` : checked ? `checked=${checked}` : "",
    `reason=${reason}`,
    codexStatus ? `codexStatus=${codexStatus}` : "",
    updatedAt ? `updatedAt=${updatedAt}` : "",
    ageMs !== null ? `ageMs=${ageMs}` : "",
    thresholdMs !== null ? `thresholdMs=${thresholdMs}` : "",
    `blockers=${blockers.values.length ? blockers.values.join(",") : "none"}`,
    `warnings=${warnings.values.length ? warnings.values.join(",") : "none"}`,
  ].filter(Boolean).join(" ");
  return {
    found: true,
    source,
    status,
    reason,
    checkedAt,
    checked,
    codexStatus,
    updatedAt,
    ageMs,
    thresholdMs,
    blockers: blockers.values,
    warnings: warnings.values,
    summary,
    checkedTime: Number.isFinite(checkedTime) ? checkedTime : Number.NEGATIVE_INFINITY,
  };
}

function extractMacHealthFromTexts(texts, fieldName, source = "text") {
  const segments = [];
  for (const text of texts) {
    segments.push(...splitLabeledSegments(text, fieldName));
  }
  if (!segments.length) return emptyMacHealth(source, texts.length);

  let selected = null;
  let rejectedCount = 0;
  for (const segment of segments) {
    const parsed = parseMacHealthSegment(segment, source, fieldName);
    if (!parsed) {
      rejectedCount += 1;
      continue;
    }
    if (!selected || parsed.checkedTime >= selected.checkedTime) {
      selected = parsed;
    }
  }
  if (!selected) return emptyMacHealth(source, texts.length, rejectedCount);

  const { checkedTime, ...safeSelected } = selected;
  return {
    ...safeSelected,
    textCount: texts.length,
    segmentCount: segments.length,
    rejectedCount,
  };
}

function extractMacHeartbeatHealthFromTexts(texts, source = "text") {
  return extractMacHealthFromTexts(texts, "MacHeartbeatHealth", source);
}

function extractMacCodexHealthFromTexts(texts, source = "text") {
  return extractMacHealthFromTexts(texts, "MacCodexHealth", source);
}

function extractMacPowerHealthFromTexts(texts, source = "text") {
  return extractMacHealthFromTexts(texts, "MacPowerHealth", source);
}

function extractMacUnattendedHealthFromTexts(texts, source = "text") {
  return extractMacHealthFromTexts(texts, "MacUnattendedHealth", source);
}

function extractMacHeartbeatHealthFromBoardState(state) {
  const allTexts = collectStringValues(state);
  const allResult = extractMacHeartbeatHealthFromTexts(allTexts, "api-state");
  const statusTexts = collectStringValues(state?.statuses);
  const statusResult = extractMacHeartbeatHealthFromTexts(statusTexts, "api-state");
  if (!statusResult.found) return allResult;
  return {
    ...statusResult,
    textCount: allResult.textCount,
    segmentCount: allResult.segmentCount,
    rejectedCount: allResult.rejectedCount,
  };
}

function extractMacCodexHealthFromBoardState(state) {
  const allTexts = collectStringValues(state);
  const allResult = extractMacCodexHealthFromTexts(allTexts, "api-state");
  const statusTexts = collectStringValues(state?.statuses);
  const statusResult = extractMacCodexHealthFromTexts(statusTexts, "api-state");
  if (!statusResult.found) return allResult;
  return {
    ...statusResult,
    textCount: allResult.textCount,
    segmentCount: allResult.segmentCount,
    rejectedCount: allResult.rejectedCount,
  };
}

function extractMacPowerHealthFromBoardState(state) {
  const allTexts = collectStringValues(state);
  const allResult = extractMacPowerHealthFromTexts(allTexts, "api-state");
  const statusTexts = collectStringValues(state?.statuses);
  const statusResult = extractMacPowerHealthFromTexts(statusTexts, "api-state");
  if (!statusResult.found) return allResult;
  return {
    ...statusResult,
    textCount: allResult.textCount,
    segmentCount: allResult.segmentCount,
    rejectedCount: allResult.rejectedCount,
  };
}

function extractMacUnattendedHealthFromBoardState(state) {
  const allTexts = collectStringValues(state);
  const allResult = extractMacUnattendedHealthFromTexts(allTexts, "api-state");
  const statusTexts = collectStringValues(state?.statuses);
  const statusResult = extractMacUnattendedHealthFromTexts(statusTexts, "api-state");
  if (!statusResult.found) return allResult;
  return {
    ...statusResult,
    textCount: allResult.textCount,
    segmentCount: allResult.segmentCount,
    rejectedCount: allResult.rejectedCount,
  };
}

function extractMacHeartbeatHealthFromText(text, source = "text") {
  const value = String(text || "");
  return extractMacHeartbeatHealthFromTexts(value ? [value] : [], source);
}

function extractMacCodexHealthFromText(text, source = "text") {
  const value = String(text || "");
  return extractMacCodexHealthFromTexts(value ? [value] : [], source);
}

function extractMacPowerHealthFromText(text, source = "text") {
  const value = String(text || "");
  return extractMacPowerHealthFromTexts(value ? [value] : [], source);
}

function extractMacUnattendedHealthFromText(text, source = "text") {
  const value = String(text || "");
  return extractMacUnattendedHealthFromTexts(value ? [value] : [], source);
}

function splitMacEvidenceSegments(text) {
  return String(text || "")
    .split(/[;\r\n]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function isCleanMacEvidenceSegment(segment) {
  return (
    !/\b(?:failed|blocked|cancelled|timeout|timed out|stale|unreachable|offline|partial)\b|失败|阻塞|离线|不可达|未通过|不通过/i.test(segment) &&
    !/\bready(?:ToCall)?\s*=\s*false\b/i.test(segment) &&
    !/\bstatus\s*=\s*(?:warning|blocked|failed)\b/i.test(segment) &&
    !/\bwarnings?\s*[:=]\s*(?!none\b)[^;\s]+/i.test(segment) &&
    !/\bblockers?\s*[:=]\s*(?!none\b)[^;\s]+/i.test(segment) &&
    !/\bnode\s+scripts[\\/]+mac[\\/]+|\bscripts[\\/]+mac[\\/]+|\.mjs\b/i.test(segment)
  );
}

function normalizeMacEvidenceToken(value) {
  const compact = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  if (!compact) return "";
  if (/macheartbeat(?:ok|healthy|normal)|mac心跳正常|心跳正常/.test(compact)) return "MacHeartbeatOk";
  if (/machostmedia(?:ok|passed|ready)|macmediabaseline(?:ok|passed)|媒体基线(?:已)?(?:通过|正常)/.test(compact)) return "MacHostMediaOk";
  if (/macformallocalsmoke(?:ok|passed|ready)|本机短验收(?:已)?通过/.test(compact)) return "MacFormalLocalSmokeOk";
  if (/macformale2e(?:ok|passed|ready|readytocall|checklistpassed)|formale2e(?:ok|passed|ready)|formale2e已就绪|正式e2e已就绪/.test(compact)) {
    return "MacFormalE2EOk";
  }
  if (/macclientpage(?:online|ok|ready)|clientpage(?:online|ok|ready)|macclient页面在线|控制页在线|页面在线/.test(compact)) {
    return "MacClientPageOnline";
  }
  if (/macclientdiagnostics(?:ok|passed|ready)|macclientreadiness(?:ok|passed|ready)|clientdiagnostics(?:ok|passed|ready)|clientreadiness(?:ok|passed|ready)|macclient诊断(?:已)?通过|诊断(?:已)?通过/.test(compact)) {
    return "MacClientDiagnosticsOk";
  }
  return "";
}

function collectStandaloneMacEvidenceTokens(segment) {
  const tokens = [];
  for (const match of String(segment || "").matchAll(/\b(MacHeartbeatOk|MacHostMediaOk|MacFormalLocalSmokeOk|MacFormalE2EOk|MacClientPageOnline|MacClientDiagnosticsOk)\b/gi)) {
    const token = normalizeMacEvidenceToken(match[1]);
    if (token && !tokens.includes(token)) tokens.push(token);
  }
  return tokens;
}

function extractMacEvidenceFromText(text, source = "text") {
  const value = String(text || "");
  const tokens = [];
  let rejectedCount = 0;
  for (const segment of splitMacEvidenceSegments(value)) {
    const hasEvidenceField = /\bevidence\s*[:=]/i.test(segment);
    const standaloneTokens = collectStandaloneMacEvidenceTokens(segment);
    if (!hasEvidenceField && standaloneTokens.length === 0) continue;
    if (!isCleanMacEvidenceSegment(segment)) {
      rejectedCount += 1;
      continue;
    }
    if (hasEvidenceField) {
      for (const match of segment.matchAll(/\bevidence\s*[:=]\s*([^;]+)/gi)) {
        const rawValues = String(match[1] || "")
          .replace(/\b(?:warnings?|blockers?|reason|suggestedAction|actionCommands)\s*[:=][\s\S]*$/i, "")
          .split(/[,|/]+|\s{2,}/)
          .map((item) => item.trim())
          .filter(Boolean);
        let matchAccepted = false;
        for (const rawValue of rawValues) {
          const token = normalizeMacEvidenceToken(rawValue);
          if (!token) continue;
          if (!tokens.includes(token)) tokens.push(token);
          matchAccepted = true;
        }
        if (!matchAccepted) rejectedCount += 1;
      }
    }
    for (const token of standaloneTokens) {
      if (!tokens.includes(token)) tokens.push(token);
    }
  }
  if (tokens.length === 0) return emptyMacEvidence(source, value ? 1 : 0, rejectedCount);
  return {
    found: true,
    source,
    textCount: value ? 1 : 0,
    tokens,
    summary: tokens.join(","),
    rejectedCount,
  };
}

function extractMacEvidenceFromBoardState(state) {
  const texts = collectStringValues(state);
  const tokens = [];
  let rejectedCount = 0;
  for (const text of texts) {
    const extracted = extractMacEvidenceFromText(text, "api-state");
    for (const token of extracted.tokens) {
      if (!tokens.includes(token)) tokens.push(token);
    }
    rejectedCount += extracted.rejectedCount;
  }
  if (tokens.length === 0) return emptyMacEvidence("api-state", texts.length, rejectedCount);
  return {
    found: true,
    source: "api-state",
    textCount: texts.length,
    tokens,
    summary: tokens.join(","),
    rejectedCount,
  };
}

function stripCommandToken(token) {
  let value = normalizedText(token);
  const sentenceBoundary = value.search(/[;，。；]/);
  if (sentenceBoundary >= 0) value = value.slice(0, sentenceBoundary);
  return value.replace(/[.,]+$/g, "");
}

function hasSecretLikeCommandValue(commandText) {
  const text = String(commandText || "");
  return (
    /\bLAN_DUAL_PASSWORD\s*=/i.test(text) ||
    /\b(?:token|secret|passwd|pwd)\s*[:=]\s*\S+/i.test(text) ||
    /(?:^|\s)--(?:password|token|secret|passwd|pwd)\s+\S+/i.test(text)
  );
}

function parseMacHostSafeStartCommand(fragment) {
  const rawTokens = String(fragment || "").split(/\s+/).map(stripCommandToken).filter(Boolean);
  if (rawTokens.length < 2) return null;
  if (rawTokens[0] !== "node") return null;
  if (rawTokens[1].replace(/\\/g, "/") !== "scripts/mac/start-mac-host.mjs") return null;

  const noValueFlags = new Set([
    "--promptPassword",
    "--requirePassword",
    "--background",
    "--ephemeralPassword",
    "--confirmUserWatching",
    "--boardSummary",
  ]);
  const valueFlags = new Set([
    "--host",
    "--port",
    "--inputMode",
    "--maxScreenFps",
    "--width",
    "--height",
    "--fps",
    "--bandwidthKbps",
    "--logFile",
  ]);
  const tokens = [rawTokens[0], rawTokens[1]];
  for (let index = 2; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    if (!token || /^[A-Za-z][A-Za-z0-9_-]*=/.test(token)) break;
    if (!token.startsWith("--")) break;
    if (/^--(?:password|token|secret|passwd|pwd)$/i.test(token)) return null;
    if (noValueFlags.has(token)) {
      tokens.push(token);
      continue;
    }
    if (valueFlags.has(token)) {
      const value = stripCommandToken(rawTokens[index + 1] || "");
      if (!value || value.startsWith("--") || /^[A-Za-z][A-Za-z0-9_-]*=/.test(value)) break;
      if (/[<>]/.test(value)) return null;
      if (token === "--port") {
        const port = Number(value);
        if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
      }
      if (token === "--maxScreenFps") {
        const fps = Number(value);
        if (!Number.isInteger(fps) || fps < 1 || fps > 240) return null;
      }
      const pair = `${token} ${value}`;
      if (hasSecretLikeCommandValue(pair)) return null;
      tokens.push(token, value);
      index += 1;
      continue;
    }
    break;
  }

  const commandText = tokens.join(" ");
  if (tokens.length < 4 || hasSecretLikeCommandValue(commandText)) return null;
  return commandText;
}

function parseMacFormalLocalSmokeCommand(fragment) {
  const rawTokens = String(fragment || "").split(/\s+/).map(stripCommandToken).filter(Boolean);
  if (rawTokens.length < 2) return null;
  if (rawTokens[0] !== "node") return null;
  if (rawTokens[1].replace(/\\/g, "/") !== "scripts/mac/check-mac-formal-local-smoke.mjs") return null;

  const noValueFlags = new Set([
    "--promptPassword",
    "--requirePassword",
    "--allowDemoPassword",
    "--skipVideo",
    "--skipAudio",
    "--skipInputLog",
    "--boardSummary",
  ]);
  const valueFlags = new Set([
    "--host",
    "--port",
    "--timeoutMs",
    "--videoDurationMs",
    "--videoMinFrames",
    "--videoMinFps",
    "--videoMaxGapMs",
    "--videoMaxFrameAgeMs",
    "--audioDurationMs",
    "--audioMinFrames",
    "--audioMaxGapMs",
    "--audioMaxFrameAgeMs",
    "--inputTimeoutMs",
  ]);
  const integerValueFlags = new Set([
    "--port",
    "--timeoutMs",
    "--videoDurationMs",
    "--videoMinFrames",
    "--videoMaxGapMs",
    "--videoMaxFrameAgeMs",
    "--audioDurationMs",
    "--audioMinFrames",
    "--audioMaxGapMs",
    "--audioMaxFrameAgeMs",
    "--inputTimeoutMs",
  ]);
  const numberValueFlags = new Set(["--videoMinFps"]);
  const tokens = [rawTokens[0], rawTokens[1]];
  for (let index = 2; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    if (!token || /^[A-Za-z][A-Za-z0-9_-]*=/.test(token)) break;
    if (!token.startsWith("--")) break;
    if (/^--(?:password|token|secret|passwd|pwd)$/i.test(token)) return null;
    if (noValueFlags.has(token)) {
      tokens.push(token);
      continue;
    }
    if (valueFlags.has(token)) {
      const value = stripCommandToken(rawTokens[index + 1] || "");
      if (!value || value.startsWith("--") || /^[A-Za-z][A-Za-z0-9_-]*=/.test(value)) break;
      if (/[<>]/.test(value)) return null;
      if (token === "--port") {
        const port = Number(value);
        if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
      } else if (integerValueFlags.has(token)) {
        const integerValue = Number(value);
        if (!Number.isInteger(integerValue) || integerValue < 0) return null;
      } else if (numberValueFlags.has(token)) {
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue) || numberValue < 0) return null;
      }
      const pair = `${token} ${value}`;
      if (hasSecretLikeCommandValue(pair)) return null;
      tokens.push(token, value);
      index += 1;
      continue;
    }
    break;
  }

  const commandText = tokens.join(" ");
  if (
    tokens.length < 4 ||
    hasSecretLikeCommandValue(commandText) ||
    !commandHasFlag(commandText, "--boardSummary")
  ) {
    return null;
  }
  return commandText;
}

function parseMacClientFormalSmokeCommand(fragment) {
  const rawTokens = String(fragment || "").split(/\s+/).map(stripCommandToken).filter(Boolean);
  if (rawTokens.length < 2) return null;
  if (rawTokens[0] !== "node") return null;
  if (rawTokens[1].replace(/\\/g, "/") !== "scripts/mac/run-mac-client-formal-smoke.mjs") return null;

  const noValueFlags = new Set([
    "--discover",
    "--ensureClient",
    "--preflightOnly",
    "--boardSummary",
  ]);
  const valueFlags = new Set([
    "--host",
    "--port",
    "--clientHost",
    "--clientPort",
    "--debugPort",
    "--server",
    "--timeoutMs",
    "--discoverTimeoutMs",
    "--clientTimeoutMs",
  ]);
  const integerValueFlags = new Set([
    "--port",
    "--clientPort",
    "--debugPort",
    "--timeoutMs",
    "--discoverTimeoutMs",
    "--clientTimeoutMs",
  ]);
  const tokens = [rawTokens[0], rawTokens[1]];
  let hasDiscover = false;
  let hasEnsureClient = false;
  let hasPreflightOnly = false;
  let hasBoardSummary = false;
  for (let index = 2; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    if (!token || /^[A-Za-z][A-Za-z0-9_-]*=/.test(token)) break;
    if (!token.startsWith("--")) break;
    if (/^--(?:password|token|secret|passwd|pwd)$/i.test(token)) return null;
    if (noValueFlags.has(token)) {
      if (token === "--discover") hasDiscover = true;
      if (token === "--ensureClient") hasEnsureClient = true;
      if (token === "--preflightOnly") hasPreflightOnly = true;
      if (token === "--boardSummary") hasBoardSummary = true;
      tokens.push(token);
      continue;
    }
    if (valueFlags.has(token)) {
      const value = stripCommandToken(rawTokens[index + 1] || "");
      if (!value || value.startsWith("--") || /^[A-Za-z][A-Za-z0-9_-]*=/.test(value)) return null;
      if (/[<>]/.test(value)) return null;
      if (integerValueFlags.has(token)) {
        const integerValue = Number(value);
        if (!Number.isInteger(integerValue) || integerValue < 0) return null;
        if ((token === "--port" || token === "--clientPort" || token === "--debugPort") && (integerValue < 1 || integerValue > 65535)) return null;
      } else if (token === "--server") {
        try {
          const url = new URL(value);
          if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
        } catch {
          return null;
        }
      }
      const pair = `${token} ${value}`;
      if (hasSecretLikeCommandValue(pair)) return null;
      tokens.push(token, value);
      index += 1;
      continue;
    }
    return null;
  }

  const commandText = tokens.join(" ");
  if (
    tokens.length < 6 ||
    hasSecretLikeCommandValue(commandText) ||
    !hasDiscover ||
    !hasEnsureClient ||
    !hasPreflightOnly ||
    !hasBoardSummary
  ) {
    return null;
  }
  return commandText;
}

function parseMacRemoteAudioPlanCommand(fragment) {
  const rawTokens = String(fragment || "").split(/\s+/).map(stripCommandToken).filter(Boolean);
  if (rawTokens.length < 3) return null;
  if (rawTokens[0] !== "node") return null;
  if (rawTokens[1].replace(/\\/g, "/") !== "scripts/mac/plan-mac-remote-audio.mjs") return null;

  const tokens = [rawTokens[0], rawTokens[1]];
  let hasBoardSummary = false;
  for (let index = 2; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    if (!token || /^[A-Za-z][A-Za-z0-9_-]*=/.test(token)) break;
    if (!token.startsWith("--")) break;
    if (/^--(?:password|token|secret|passwd|pwd)$/i.test(token)) return null;
    if (token === "--boardSummary") {
      hasBoardSummary = true;
      tokens.push(token);
      continue;
    }
    return null;
  }

  const commandText = tokens.join(" ");
  if (tokens.length !== 3 || !hasBoardSummary || hasSecretLikeCommandValue(commandText)) return null;
  return commandText;
}

function parseMacInputSafetyPlanCommand(fragment) {
  const rawTokens = String(fragment || "").split(/\s+/).map(stripCommandToken).filter(Boolean);
  if (rawTokens.length < 3) return null;
  if (rawTokens[0] !== "node") return null;
  if (rawTokens[1].replace(/\\/g, "/") !== "scripts/mac/plan-mac-input-safety.mjs") return null;

  const tokens = [rawTokens[0], rawTokens[1]];
  let hasBoardSummary = false;
  for (let index = 2; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    if (!token || /^[A-Za-z][A-Za-z0-9_-]*=/.test(token)) break;
    if (!token.startsWith("--")) break;
    if (/^--(?:password|token|secret|passwd|pwd)$/i.test(token)) return null;
    if (token === "--boardSummary") {
      hasBoardSummary = true;
      tokens.push(token);
      continue;
    }
    return null;
  }

  const commandText = tokens.join(" ");
  if (tokens.length !== 3 || !hasBoardSummary || hasSecretLikeCommandValue(commandText)) return null;
  return commandText;
}

function parseMacManualUxStatusCommand(fragment) {
  const rawTokens = String(fragment || "").split(/\s+/).map(stripCommandToken).filter(Boolean);
  if (rawTokens.length < 3) return null;
  if (rawTokens[0] !== "node") return null;
  if (rawTokens[1].replace(/\\/g, "/") !== "scripts/mac/check-mac-manual-ux-status.mjs") return null;

  const tokens = [rawTokens[0], rawTokens[1]];
  let hasBoardSummary = false;
  for (let index = 2; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    if (!token || /^[A-Za-z][A-Za-z0-9_-]*=/.test(token)) break;
    if (!token.startsWith("--")) break;
    if (/^--(?:password|token|secret|passwd|pwd)$/i.test(token)) return null;
    if (token === "--boardSummary") {
      hasBoardSummary = true;
      tokens.push(token);
      continue;
    }
    return null;
  }

  const commandText = tokens.join(" ");
  if (tokens.length !== 3 || !hasBoardSummary || hasSecretLikeCommandValue(commandText)) return null;
  return commandText;
}

const macInputSafetyAllowedSafety = new Set(["no-password", "no-input-events", "no-inject"]);

function splitMacInputSafetySegments(text) {
  const value = String(text || "");
  const matches = [...value.matchAll(/\bMac input safety plan\s*:/gi)];
  return matches.map((match, index) => {
    const start = match.index || 0;
    const end = index + 1 < matches.length ? matches[index + 1].index || value.length : value.length;
    return value.slice(start, end);
  });
}

function extractMacInputSafetyField(segment, fieldName) {
  const escaped = String(fieldName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(segment || "").match(new RegExp(`\\b${escaped}\\s*=\\s*([^;\\s]+)`, "i"));
  return match ? stripCommandToken(match[1]).replace(/[.]+$/g, "") : "";
}

function parseMacInputSafetySegment(segment, source = "text") {
  const value = String(segment || "");
  const status = extractMacInputSafetyField(value, "status");
  const defaultMode = extractMacInputSafetyField(value, "default");
  const realInput = extractMacInputSafetyField(value, "realInput");
  const required = extractMacInputSafetyField(value, "required");
  const eventSet = extractMacInputSafetyField(value, "eventSet");
  const safetyRaw = extractMacInputSafetyField(value, "safety");
  const safety = safetyRaw.split(",").map((item) => item.trim()).filter(Boolean);
  const validSafety = safety.length === macInputSafetyAllowedSafety.size &&
    safety.every((item) => macInputSafetyAllowedSafety.has(item)) &&
    [...macInputSafetyAllowedSafety].every((item) => safety.includes(item));
  if (
    status !== "plan-only" ||
    defaultMode !== "log" ||
    realInput !== "blocked-until-user-watching" ||
    required !== "--confirmUserWatching" ||
    eventSet !== "safe" ||
    !validSafety
  ) {
    return null;
  }
  const summary = `status=${status} default=${defaultMode} realInput=${realInput} required=${required} eventSet=${eventSet} safety=${safety.join(",")}`;
  return {
    found: true,
    source,
    status,
    defaultMode,
    realInput,
    required,
    eventSet,
    safety,
    summary,
  };
}

function extractMacInputSafetyFromTexts(texts, source = "text") {
  let selected = null;
  let segmentCount = 0;
  let rejectedCount = 0;
  for (const text of texts) {
    for (const segment of splitMacInputSafetySegments(text)) {
      segmentCount += 1;
      const parsed = parseMacInputSafetySegment(segment, source);
      if (!parsed) {
        rejectedCount += 1;
        continue;
      }
      selected = parsed;
    }
  }
  if (!selected) return emptyMacInputSafety(source, texts.length, rejectedCount);
  return {
    ...selected,
    textCount: texts.length,
    segmentCount,
    rejectedCount,
  };
}

function extractMacInputSafetyFromBoardState(state) {
  return extractMacInputSafetyFromTexts(collectStringValues(state), "api-state");
}

function extractMacInputSafetyFromText(text, source = "text") {
  const value = String(text || "");
  return extractMacInputSafetyFromTexts(value ? [value] : [], source);
}

const macInputSafetyStatusAllowedStatuses = new Set(["blocked", "ready", "warning", "unknown"]);
const macInputSafetyStatusAllowedInputModes = new Set(["log", "inject", "unknown", "not-available"]);
const macInputSafetyStatusAllowedRealInputs = new Set(["blocked", "blocked-until-user-watching", "ready-for-user-watched-inject", "unknown"]);
const macInputSafetyStatusAllowedRequired = new Set(["--confirmUserWatching", "none"]);
const macInputSafetyStatusAllowedEventSets = new Set(["safe"]);
const macInputSafetyStatusAllowedSafety = new Set(["no-password", "no-auth", "no-input-events", "no-inject", "requires-user-watching", "confirm-user-watching"]);
const macInputSafetyStatusSecretPattern = /(?:^|[\s,;])(?:password|secret|passwd|token|apikey|api-key|credential|cookie|pwd)\s*[:=]|--(?:password|token|secret|passwd|pwd)\b|密码|密钥|口令|令牌/i;
const macInputSafetyStatusBoundaryPattern = /\s+(?:MacHostReadiness|MacHostSafeStart|MacMaxFpsSafeStart|MacFormalLocalSmoke|MacClientDiscoverWindows|MacClientFormalChecklist|MacClientFormalSmoke|MacClientManualChecklist|MacClientPasswordLocation|MacRemoteAudioPlan|MacRemoteAudio|MacManualUxStatus|MacManualUx|MacHeartbeatOnce|MacHeartbeatWatch|MacHeartbeatStart|MacHeartbeatStatus|MacHeartbeatStop|MacHeartbeat|MacCodexHealth|MacPowerHealth|MacUnattendedHealth|MacEvidence|WindowsLanRisk|Next)\s*(?:=|:|\b)/i;

function normalizeMacInputSafetyStatusSegment(segment) {
  const value = String(segment || "");
  const label = value.match(/\b(?:MacInputSafetyStatus\s*=|Mac input safety status\s*:)/i);
  if (!label) return value;
  const offset = (label.index || 0) + label[0].length;
  const tail = value.slice(offset);
  const boundary = tail.search(macInputSafetyStatusBoundaryPattern);
  return boundary >= 0 ? value.slice(0, offset + boundary) : value;
}

function splitMacInputSafetyStatusSegments(text) {
  const value = String(text || "");
  const matches = [...value.matchAll(/\b(?:MacInputSafetyStatus\s*=|Mac input safety status\s*:)/gi)];
  return matches.map((match, index) => {
    const start = match.index || 0;
    const end = index + 1 < matches.length ? matches[index + 1].index || value.length : value.length;
    return normalizeMacInputSafetyStatusSegment(value.slice(start, end));
  });
}

function extractMacInputSafetyStatusLabelValue(segment) {
  const match = String(segment || "").match(/\b(?:MacInputSafetyStatus\s*=\s*|Mac input safety status\s*:\s*)([a-z0-9][a-z0-9_-]*)/i);
  return match ? stripCommandToken(match[1]).replace(/[.]+$/g, "") : "";
}

function isMacInputSafetyStatusReasonSafe(reason) {
  if (!reason) return true;
  return /^[a-z0-9][a-z0-9_-]{0,80}$/i.test(reason) && !macInputSafetyStatusSecretPattern.test(reason);
}

function isMacInputSafetyStatusCheckedAtSafe(checkedAt) {
  if (!checkedAt) return true;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(checkedAt) && !Number.isNaN(Date.parse(checkedAt));
}

function parseMacInputSafetyStatusSegment(segment, source = "text") {
  const value = normalizeMacInputSafetyStatusSegment(segment);
  if (!value || macInputSafetyStatusSecretPattern.test(value)) return null;
  const status = extractMacInputSafetyField(value, "status") || extractMacInputSafetyStatusLabelValue(value);
  const reason = extractMacInputSafetyField(value, "reason");
  const inputMode = extractMacInputSafetyField(value, "inputMode");
  const realInput = extractMacInputSafetyField(value, "realInput");
  const required = extractMacInputSafetyField(value, "required");
  const eventSet = extractMacInputSafetyField(value, "eventSet");
  const safetyRaw = extractMacInputSafetyField(value, "safety");
  const checkedAt = extractMacInputSafetyField(value, "checkedAt");
  const safety = safetyRaw.split(",").map((item) => item.trim()).filter(Boolean);
  const validSafety = safety.length > 0 && safety.includes("no-password") && safety.every((item) => macInputSafetyStatusAllowedSafety.has(item));
  if (
    !macInputSafetyStatusAllowedStatuses.has(status) ||
    !isMacInputSafetyStatusReasonSafe(reason) ||
    !macInputSafetyStatusAllowedInputModes.has(inputMode) ||
    !macInputSafetyStatusAllowedRealInputs.has(realInput) ||
    !macInputSafetyStatusAllowedRequired.has(required) ||
    !macInputSafetyStatusAllowedEventSets.has(eventSet) ||
    !validSafety ||
    !isMacInputSafetyStatusCheckedAtSafe(checkedAt)
  ) {
    return null;
  }
  const parts = [
    `status=${status}`,
    ...(reason ? [`reason=${reason}`] : []),
    `inputMode=${inputMode}`,
    `realInput=${realInput}`,
    `required=${required}`,
    `eventSet=${eventSet}`,
    `safety=${safety.join(",")}`,
    ...(checkedAt ? [`checkedAt=${checkedAt}`] : []),
  ];
  return {
    found: true,
    source,
    status,
    reason,
    inputMode,
    realInput,
    required,
    eventSet,
    safety,
    checkedAt,
    summary: parts.join(" "),
  };
}

function extractMacInputSafetyStatusFromTexts(texts, source = "text") {
  let selected = null;
  let segmentCount = 0;
  let rejectedCount = 0;
  for (const text of texts) {
    for (const segment of splitMacInputSafetyStatusSegments(text)) {
      segmentCount += 1;
      const parsed = parseMacInputSafetyStatusSegment(segment, source);
      if (!parsed) {
        rejectedCount += 1;
        continue;
      }
      selected = parsed;
    }
  }
  if (!selected) return emptyMacInputSafetyStatus(source, texts.length, rejectedCount);
  return {
    ...selected,
    textCount: texts.length,
    segmentCount,
    rejectedCount,
  };
}

function extractMacInputSafetyStatusFromBoardState(state) {
  return extractMacInputSafetyStatusFromTexts(collectStringValues(state), "api-state");
}

function extractMacInputSafetyStatusFromText(text, source = "text") {
  const value = String(text || "");
  return extractMacInputSafetyStatusFromTexts(value ? [value] : [], source);
}

const macInputSafetyUserNoticeAllowedGoals = new Set(["verify-real-mac-input-safe-event-set"]);
const macInputSafetyUserNoticeAllowedActions = new Set(["watch-mac-screen-and-be-ready-to-take-over"]);
const macInputSafetyUserNoticeAllowedBoundaries = new Set(["safe-event-set-only-no-click-delete-shortcuts-return-log"]);
const macInputSafetyUserNoticeAllowedDurations = new Set(["2-3-minutes"]);
const macInputSafetyUserNoticeSecretPattern = /(?:^|[\s,;])(?:password|secret|passwd|token|apikey|api-key|credential|cookie|pwd)\s*[:=]|--(?:password|token|secret|passwd|pwd)\b|密码|密钥|口令|令牌|input_event/i;

function splitMacInputSafetyUserNoticeSegments(text) {
  const value = String(text || "");
  const matches = [...value.matchAll(/\bUserNoticeGoal\s*=/gi)];
  return matches.map((match, index) => {
    const start = match.index || 0;
    const end = index + 1 < matches.length ? matches[index + 1].index || value.length : value.length;
    return value.slice(start, end);
  });
}

function parseMacInputSafetyUserNoticeSegment(segment, source = "text") {
  const value = String(segment || "");
  if (!value || macInputSafetyUserNoticeSecretPattern.test(value)) return null;
  const goal = extractMacInputSafetyField(value, "UserNoticeGoal");
  const action = extractMacInputSafetyField(value, "UserNoticeAction");
  const boundary = extractMacInputSafetyField(value, "UserNoticeBoundary");
  const duration = extractMacInputSafetyField(value, "UserNoticeDuration");
  if (
    !macInputSafetyUserNoticeAllowedGoals.has(goal) ||
    !macInputSafetyUserNoticeAllowedActions.has(action) ||
    !macInputSafetyUserNoticeAllowedBoundaries.has(boundary) ||
    !macInputSafetyUserNoticeAllowedDurations.has(duration)
  ) {
    return null;
  }
  const summary = `goal=${goal} action=${action} boundary=${boundary} duration=${duration}`;
  return {
    found: true,
    source,
    goal,
    action,
    boundary,
    duration,
    summary,
  };
}

function extractMacInputSafetyUserNoticeFromTexts(texts, source = "text") {
  let selected = null;
  let segmentCount = 0;
  let rejectedCount = 0;
  for (const text of texts) {
    for (const segment of splitMacInputSafetyUserNoticeSegments(text)) {
      segmentCount += 1;
      const parsed = parseMacInputSafetyUserNoticeSegment(segment, source);
      if (!parsed) {
        rejectedCount += 1;
        continue;
      }
      selected = parsed;
    }
  }
  if (!selected) return emptyMacInputSafetyUserNotice(source, texts.length, rejectedCount);
  return {
    ...selected,
    textCount: texts.length,
    segmentCount,
    rejectedCount,
  };
}

function extractMacInputSafetyUserNoticeFromBoardState(state) {
  return extractMacInputSafetyUserNoticeFromTexts(collectStringValues(state), "api-state");
}

function extractMacInputSafetyUserNoticeFromText(text, source = "text") {
  const value = String(text || "");
  return extractMacInputSafetyUserNoticeFromTexts(value ? [value] : [], source);
}

const macManualUxAllowedStatuses = new Set(["ready", "waiting", "call-ready", "calling"]);
const macManualUxChecklist = "connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics";
const macManualUxAllowedNext = new Set(["ManualUxTest", "WaitForPostPassOrManualUxStandby", "SendManualUxCall", "WaitForManualUxConfirmation", "ReconfirmManualUxCall"]);
const macManualUxAllowedSafety = new Set(["no-password", "no-input-inject"]);
const macManualUxAllowedCallStates = new Set(["active", "near-timeout", "timeout"]);
const macManualUxAllowedGates = new Set(["clear", "wait-windows-codex-push", "wait-windows-codex-commit"]);
const macManualUxAllowedTargetSources = new Set(["unknown", "mac-host-discovery", "board-discovery", "board", "manual", "agent-link-board", "current-call"]);
const macManualUxSecretPattern = /(?:^|[\s,;])(?:password|secret|passwd|token|apikey|api-key|credential|cookie|pwd)\s*[:=]|--(?:password|token|secret|passwd|pwd)\b|密码|密钥|口令|令牌/i;

function splitMacManualUxSegments(text) {
  const value = String(text || "");
  const matches = [...value.matchAll(/\bMacManualUx\s*=/gi)];
  return matches.map((match, index) => {
    const start = match.index || 0;
    const next = index + 1 < matches.length ? matches[index + 1].index || value.length : value.length;
    const rawSegment = value.slice(start, next);
    const boundaryMatch = /\s+(?=(?:Mac(?!ManualUx)|Windows|Win|PowerShell|Formal|Copy|ReverseGrant)[A-Za-z0-9]*\s*=)/.exec(rawSegment.slice(1));
    return boundaryMatch ? rawSegment.slice(0, boundaryMatch.index + 1) : rawSegment;
  });
}

function extractMacManualUxField(segment, fieldName) {
  const escaped = String(fieldName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(segment || "").match(new RegExp(`\\b${escaped}\\s*=\\s*([^;\\s]+)`, "i"));
  return match ? stripCommandToken(match[1]).replace(/[.]+$/g, "") : "";
}

function extractMacManualUxCommandField(segment, fieldName) {
  const escaped = String(fieldName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundary = "(?:ManualUxCall|ManualUxCallAgeMs|ManualUxCallRemainingMs|ManualUxCallOverdueMs|MacManualUxGate|ManualUxGate|gate|blockers|warnings)";
  const match = String(segment || "").match(new RegExp(`\\b${escaped}\\s*=\\s*(.+?)(?=\\s+${boundary}\\s*=|$)`, "i"));
  return match ? match[1].trim().replace(/[.]+$/g, "") : "";
}

function isSafeMacManualUxReconfirmCommand(commandText) {
  const command = String(commandText || "").trim();
  if (!command || macManualUxSecretPattern.test(command)) return false;
  if (/\binput\b|inject|sendCall|sendStatus|sendMessage/i.test(command)) return false;
  const tokens = command.split(/\s+/).filter(Boolean);
  if (tokens[0] !== "node" || tokens[1] !== "scripts/mac/check-mac-manual-ux-status.mjs") return false;
  let hasReconfirm = false;
  let hasJson = false;
  for (let index = 2; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--server") {
      const server = tokens[index + 1] || "";
      if (!isSafeHttpUrl(server)) return false;
      index += 1;
      continue;
    }
    if (token === "--reconfirmCall") {
      hasReconfirm = true;
      continue;
    }
    if (token === "--json") {
      hasJson = true;
      continue;
    }
    return false;
  }
  return hasReconfirm && hasJson;
}

function isSafeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function parseMacManualUxTokenList(raw, { allowNone = true } = {}) {
  const value = String(raw || "").trim();
  if (!value || (allowNone && /^none$/i.test(value))) return { ok: true, values: [] };
  const values = value.split(/[,|]+/).map((item) => item.trim()).filter(Boolean);
  if (!values.every(isSafeMacHealthToken)) return { ok: false, values: [] };
  return { ok: true, values };
}

function parseOptionalMacManualUxMs(segment, ...fieldNames) {
  const raw = fieldNames.map((fieldName) => extractMacManualUxField(segment, fieldName)).find(Boolean) || "";
  if (!raw) return { ok: true, value: null };
  if (!/^\d{1,12}$/.test(raw)) return { ok: false, value: null };
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return { ok: false, value: null };
  return { ok: true, value };
}

function isSafeMacManualUxTarget(value) {
  const target = String(value || "").trim();
  return target === "unknown" || /^(?:localhost|127(?:\.\d{1,3}){3}|(?:\d{1,3}\.){3}\d{1,3}):\d{1,5}$/i.test(target);
}

function isSafeMacManualUxTargetSource(value) {
  return macManualUxAllowedTargetSources.has(String(value || "unknown"));
}

function parseMacManualUxSegment(segment, source = "text") {
  const value = String(segment || "");
  if (macManualUxSecretPattern.test(value)) return null;
  const status = extractMacManualUxField(value, "status");
  const checklist = extractMacManualUxField(value, "ManualUxChecklist") || extractMacManualUxField(value, "checklist");
  const labels = extractMacManualUxField(value, "ManualUxLabels") || extractMacManualUxField(value, "labels");
  const signalsRaw = extractMacManualUxField(value, "Signals") || extractMacManualUxField(value, "signals") || "none";
  const target = extractMacManualUxField(value, "Target") || extractMacManualUxField(value, "target") || "unknown";
  const targetSource = extractMacManualUxField(value, "TargetSource") || extractMacManualUxField(value, "targetSource") || "unknown";
  const next = extractMacManualUxField(value, "Next") || extractMacManualUxField(value, "next");
  const safetyRaw = extractMacManualUxField(value, "Safety") || extractMacManualUxField(value, "safety");
  const noFormalE2ERerunRaw = extractMacManualUxField(value, "NoFormalE2ERerun") || extractMacManualUxField(value, "noFormalE2ERerun");
  const manualUxCall = extractMacManualUxField(value, "ManualUxCall") || extractMacManualUxField(value, "manualUxCall");
  const callAgeMs = parseOptionalMacManualUxMs(value, "ManualUxCallAgeMs", "callAgeMs");
  const callRemainingMs = parseOptionalMacManualUxMs(value, "ManualUxCallRemainingMs", "callRemainingMs");
  const callOverdueMs = parseOptionalMacManualUxMs(value, "ManualUxCallOverdueMs", "callOverdueMs");
  const gate = extractMacManualUxField(value, "MacManualUxGate") || extractMacManualUxField(value, "ManualUxGate") || extractMacManualUxField(value, "gate");
  const manualUxReconfirmCommand = extractMacManualUxCommandField(value, "ManualUxReconfirmCommand");
  const blockersRaw = extractMacManualUxField(value, "blockers") || "none";
  const warningsRaw = extractMacManualUxField(value, "warnings") || "none";
  const safety = safetyRaw.split(",").map((item) => item.trim()).filter(Boolean);
  const signals = parseMacManualUxTokenList(signalsRaw);
  const blockers = parseMacManualUxTokenList(blockersRaw);
  const warnings = parseMacManualUxTokenList(warningsRaw);
  const validSafety = safety.length === macManualUxAllowedSafety.size &&
    safety.every((item) => macManualUxAllowedSafety.has(item)) &&
    [...macManualUxAllowedSafety].every((item) => safety.includes(item));
  if (
    !macManualUxAllowedStatuses.has(status) ||
    checklist !== macManualUxChecklist ||
    !labels || macManualUxSecretPattern.test(labels) || /\s/.test(labels) ||
    !signals.ok || !isSafeMacManualUxTarget(target) || !isSafeMacManualUxTargetSource(targetSource) ||
    !macManualUxAllowedNext.has(next) ||
    !validSafety ||
    noFormalE2ERerunRaw !== "true" ||
    (manualUxCall && !macManualUxAllowedCallStates.has(manualUxCall)) ||
    (gate && !macManualUxAllowedGates.has(gate)) ||
    (manualUxReconfirmCommand && !isSafeMacManualUxReconfirmCommand(manualUxReconfirmCommand)) ||
    !callAgeMs.ok ||
    !callRemainingMs.ok ||
    !callOverdueMs.ok ||
    !blockers.ok ||
    !warnings.ok
  ) {
    return null;
  }
  const callCommandPresent = /\bManualUxCallCommand\s*=/.test(value);
  const summary = [
    `status=${status}`,
    `checklist=${checklist}`,
    `labels=${labels}`,
    `signals=${signals.values.length ? signals.values.join(",") : "none"}`,
    `target=${target}`,
    ...(targetSource !== "unknown" ? [`targetSource=${targetSource}`] : []),
    `next=${next}`,
    `safety=${safety.join(",")}`,
    "noFormalE2ERerun=true",
    ...(manualUxCall ? [`manualUxCall=${manualUxCall}`] : []),
    ...(callAgeMs.value != null ? [`callAgeMs=${callAgeMs.value}`] : []),
    ...(callRemainingMs.value != null ? [`callRemainingMs=${callRemainingMs.value}`] : []),
    ...(callOverdueMs.value != null ? [`callOverdueMs=${callOverdueMs.value}`] : []),
    ...(gate && gate !== "clear" ? [`gate=${gate}`] : []),
    callCommandPresent ? "callCommand=present" : "callCommand=absent",
    ...(manualUxReconfirmCommand ? ["reconfirmCommand=present"] : []),
    `blockers=${blockers.values.length ? blockers.values.join(",") : "none"}`,
    `warnings=${warnings.values.length ? warnings.values.join(",") : "none"}`,
  ].join(" ");
  return {
    found: true,
    source,
    status,
    checklist,
    labels,
    signals: signals.values,
    target,
    targetSource,
    next,
    safety,
    noFormalE2ERerun: true,
    manualUxCall,
    callAgeMs: callAgeMs.value,
    callRemainingMs: callRemainingMs.value,
    callOverdueMs: callOverdueMs.value,
    gate: gate || "",
    callCommandPresent,
    reconfirmCommandPresent: Boolean(manualUxReconfirmCommand),
    manualUxReconfirmCommand: manualUxReconfirmCommand || "",
    blockers: blockers.values,
    warnings: warnings.values,
    summary,
  };
}

function extractMacManualUxFromTexts(texts, source = "text") {
  let selected = null;
  let segmentCount = 0;
  let rejectedCount = 0;
  for (const text of texts) {
    for (const segment of splitMacManualUxSegments(text)) {
      segmentCount += 1;
      const parsed = parseMacManualUxSegment(segment, source);
      if (!parsed) {
        rejectedCount += 1;
        continue;
      }
      selected = parsed;
    }
  }
  if (!selected) return emptyMacManualUx(source, texts.length, rejectedCount);
  return {
    ...selected,
    textCount: texts.length,
    segmentCount,
    rejectedCount,
  };
}

function extractMacManualUxFromBoardState(state) {
  return extractMacManualUxFromTexts(collectStringValues(state), "api-state");
}

function extractMacManualUxFromText(text, source = "text") {
  const value = String(text || "");
  return extractMacManualUxFromTexts(value ? [value] : [], source);
}

const macRemoteAudioAllowedOptions = new Set(["manual-mute-restore", "virtual-output-device", "product-toggle"]);
const macRemoteAudioAllowedSafety = new Set(["no-volume-change", "no password/input/inject"]);

function splitMacRemoteAudioSegments(text) {
  const value = String(text || "");
  const matches = [...value.matchAll(/\bMac remote audio plan\s*:/gi)];
  return matches.map((match, index) => {
    const start = match.index || 0;
    const end = index + 1 < matches.length ? matches[index + 1].index || value.length : value.length;
    return value.slice(start, end);
  });
}

function extractMacRemoteAudioField(segment, fieldName) {
  const escaped = String(fieldName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(segment || "").match(new RegExp(`\\b${escaped}\\s*=\\s*([^;.]+)`, "i"));
  return match ? stripCommandToken(match[1]).trim().replace(/[.]+$/g, "") : "";
}

function hasUnsafeMacRemoteAudioSummaryValue(value) {
  const text = String(value || "");
  return /--(?:password|token|secret|passwd|pwd)\b/i.test(text) ||
    /\b(?:password|token|secret|passwd|pwd)\s*=/i.test(text) ||
    /\bsecret-value\b/i.test(text);
}

function parseMacRemoteAudioSegment(segment, source = "text") {
  const value = String(segment || "");
  if (hasUnsafeMacRemoteAudioSummaryValue(value)) return null;

  const status = extractMacRemoteAudioField(value, "status");
  const capture = extractMacRemoteAudioField(value, "capture");
  const remoteOnlyOptionsRaw = extractMacRemoteAudioField(value, "RemoteOnlyOptions");
  const recommended = extractMacRemoteAudioField(value, "recommended");
  const safetyRaw = extractMacRemoteAudioField(value, "safety");
  const remoteOnlyOptions = remoteOnlyOptionsRaw.split("/").map((item) => item.trim()).filter(Boolean);
  const safety = safetyRaw.split(",").map((item) => item.trim()).filter(Boolean);
  const validOptions = remoteOnlyOptions.length === macRemoteAudioAllowedOptions.size &&
    remoteOnlyOptions.every((item) => macRemoteAudioAllowedOptions.has(item)) &&
    [...macRemoteAudioAllowedOptions].every((item) => remoteOnlyOptions.includes(item));
  const validSafety = safety.length === macRemoteAudioAllowedSafety.size &&
    safety.every((item) => macRemoteAudioAllowedSafety.has(item)) &&
    [...macRemoteAudioAllowedSafety].every((item) => safety.includes(item));

  if (
    status !== "plan-only" ||
    capture !== "system-pcm-does-not-mute-local" ||
    !validOptions ||
    recommended !== "product-toggle-with-explicit-consent" ||
    !validSafety
  ) {
    return null;
  }

  const summary = `status=${status} capture=${capture} remoteOnlyOptions=${remoteOnlyOptions.join("/")} recommended=${recommended} safety=${safety.join(",")}`;
  return {
    found: true,
    source,
    status,
    capture,
    remoteOnlyOptions,
    recommended,
    safety,
    summary,
  };
}

function extractMacRemoteAudioFromTexts(texts, source = "text") {
  let selected = null;
  let segmentCount = 0;
  let rejectedCount = 0;
  for (const text of texts) {
    for (const segment of splitMacRemoteAudioSegments(text)) {
      segmentCount += 1;
      const parsed = parseMacRemoteAudioSegment(segment, source);
      if (!parsed) {
        rejectedCount += 1;
        continue;
      }
      selected = parsed;
    }
  }
  if (!selected) return emptyMacRemoteAudio(source, texts.length, rejectedCount);
  return {
    ...selected,
    textCount: texts.length,
    segmentCount,
    rejectedCount,
  };
}

function extractMacRemoteAudioFromBoardState(state) {
  return extractMacRemoteAudioFromTexts(collectStringValues(state), "api-state");
}

function extractMacRemoteAudioFromText(text, source = "text") {
  const value = String(text || "");
  return extractMacRemoteAudioFromTexts(value ? [value] : [], source);
}

function parseMacClientFormalChecklistCommand(fragment) {
  const rawTokens = String(fragment || "").split(/\s+/).map(stripCommandToken).filter(Boolean);
  if (rawTokens.length < 2) return null;
  if (rawTokens[0] !== "node") return null;
  if (rawTokens[1].replace(/\\/g, "/") !== "scripts/mac/check-mac-client-formal-status.mjs") return null;

  const noValueFlags = new Set([
    "--discover",
    "--checkBoard",
    "--boardSummary",
    "--allowDirty",
    "--allowClientServerOffline",
    "--allowWindowsHostOffline",
  ]);
  const valueFlags = new Set([
    "--host",
    "--port",
    "--clientHost",
    "--clientPort",
    "--debugPort",
    "--server",
    "--timeoutMs",
    "--discoverTimeoutMs",
    "--clientTimeoutMs",
  ]);
  const integerValueFlags = new Set([
    "--port",
    "--clientPort",
    "--debugPort",
    "--timeoutMs",
    "--discoverTimeoutMs",
    "--clientTimeoutMs",
  ]);
  const tokens = [rawTokens[0], rawTokens[1]];
  let hasBoardSummary = false;
  for (let index = 2; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    if (!token || /^[A-Za-z][A-Za-z0-9_-]*=/.test(token)) break;
    if (!token.startsWith("--")) break;
    if (/^--(?:password|token|secret|passwd|pwd|promptPassword|sendCall|forceCall)$/i.test(token)) return null;
    if (noValueFlags.has(token)) {
      if (token === "--boardSummary") hasBoardSummary = true;
      tokens.push(token);
      continue;
    }
    if (valueFlags.has(token)) {
      const value = stripCommandToken(rawTokens[index + 1] || "");
      if (!value || value.startsWith("--") || /^[A-Za-z][A-Za-z0-9_-]*=/.test(value)) return null;
      if (/[<>]/.test(value)) return null;
      if (integerValueFlags.has(token)) {
        const integerValue = Number(value);
        if (!Number.isInteger(integerValue) || integerValue < 0) return null;
        if ((token === "--port" || token === "--clientPort" || token === "--debugPort") && (integerValue < 1 || integerValue > 65535)) return null;
      } else if (token === "--server") {
        try {
          const url = new URL(value);
          if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
        } catch {
          return null;
        }
      }
      const pair = `${token} ${value}`;
      if (hasSecretLikeCommandValue(pair)) return null;
      tokens.push(token, value);
      index += 1;
      continue;
    }
    return null;
  }

  const commandText = tokens.join(" ");
  if (
    tokens.length < 3 ||
    hasSecretLikeCommandValue(commandText) ||
    !hasBoardSummary
  ) {
    return null;
  }
  return commandText;
}

function parseMacClientDiscoverWindowsCommand(fragment) {
  const rawTokens = String(fragment || "").split(/\s+/).map(stripCommandToken).filter(Boolean);
  if (rawTokens.length < 2) return null;
  if (rawTokens[0] !== "node") return null;
  if (rawTokens[1].replace(/\\/g, "/") !== "scripts/mac/discover-windows-hosts.mjs") return null;

  const noValueFlags = new Set([
    "--checkBoard",
    "--boardSummary",
    "--noLocalSubnets",
    "--requireFound",
  ]);
  const valueFlags = new Set([
    "--host",
    "--port",
    "--subnet",
    "--server",
    "--timeoutMs",
    "--scanTimeoutMs",
    "--concurrency",
    "--maxHostsPerSubnet",
  ]);
  const integerValueFlags = new Set([
    "--port",
    "--timeoutMs",
    "--scanTimeoutMs",
    "--concurrency",
    "--maxHostsPerSubnet",
  ]);
  const tokens = [rawTokens[0], rawTokens[1]];
  let hasCheckBoard = false;
  let hasBoardSummary = false;
  for (let index = 2; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    if (!token || /^[A-Za-z][A-Za-z0-9_-]*=/.test(token)) break;
    if (!token.startsWith("--")) break;
    if (/^--(?:password|token|secret|passwd|pwd|promptPassword|sendCall|forceCall)$/i.test(token)) return null;
    if (noValueFlags.has(token)) {
      if (token === "--checkBoard") hasCheckBoard = true;
      if (token === "--boardSummary") hasBoardSummary = true;
      tokens.push(token);
      continue;
    }
    if (valueFlags.has(token)) {
      const value = stripCommandToken(rawTokens[index + 1] || "");
      if (!value || value.startsWith("--") || /^[A-Za-z][A-Za-z0-9_-]*=/.test(value)) return null;
      if (/[<>]/.test(value)) return null;
      if (integerValueFlags.has(token)) {
        const integerValue = Number(value);
        if (!Number.isInteger(integerValue) || integerValue < 0) return null;
        if (token === "--port" && (integerValue < 1 || integerValue > 65535)) return null;
      } else if (token === "--server") {
        try {
          const url = new URL(value);
          if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
        } catch {
          return null;
        }
      } else if (token === "--subnet") {
        if (!/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/.test(value)) return null;
      }
      const pair = `${token} ${value}`;
      if (hasSecretLikeCommandValue(pair)) return null;
      tokens.push(token, value);
      index += 1;
      continue;
    }
    return null;
  }

  const commandText = tokens.join(" ");
  if (
    tokens.length < 4 ||
    hasSecretLikeCommandValue(commandText) ||
    !hasCheckBoard ||
    !hasBoardSummary
  ) {
    return null;
  }
  return commandText;
}

function parseMacHeartbeatWatcherCommand(fragment, expectedMode) {
  const rawTokens = String(fragment || "").split(/\s+/).map(stripCommandToken).filter(Boolean);
  if (rawTokens.length < 2) return null;
  if (rawTokens[0] !== "node") return null;
  if (rawTokens[1].replace(/\\/g, "/") !== "scripts/mac/watch-mac-heartbeat.mjs") return null;

  const noValueFlags = new Set(["--once", "--sendStatus", "--boardSummary"]);
  const valueFlags = new Set([
    "--host",
    "--port",
    "--clientHost",
    "--clientPort",
    "--timeoutMs",
    "--server",
    "--intervalMs",
    "--maxRuns",
    "--stuckThresholdMs",
    "--staleThresholdMs",
  ]);
  const integerValueFlags = new Set([
    "--port",
    "--clientPort",
    "--timeoutMs",
    "--intervalMs",
    "--maxRuns",
    "--stuckThresholdMs",
    "--staleThresholdMs",
  ]);
  const tokens = [rawTokens[0], rawTokens[1]];
  let hasOnce = false;
  let hasSendStatus = false;
  let hasBoardSummary = false;
  let hasIntervalMs = false;
  for (let index = 2; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    if (!token || /^[A-Za-z][A-Za-z0-9_-]*=/.test(token)) break;
    if (!token.startsWith("--")) break;
    if (/^--(?:password|token|secret|passwd|pwd)$/i.test(token)) return null;
    if (noValueFlags.has(token)) {
      if (token === "--once") hasOnce = true;
      if (token === "--sendStatus") hasSendStatus = true;
      if (token === "--boardSummary") hasBoardSummary = true;
      tokens.push(token);
      continue;
    }
    if (valueFlags.has(token)) {
      const value = stripCommandToken(rawTokens[index + 1] || "");
      if (!value || value.startsWith("--") || /^[A-Za-z][A-Za-z0-9_-]*=/.test(value)) break;
      if (/[<>]/.test(value)) return null;
      if (integerValueFlags.has(token)) {
        const integerValue = Number(value);
        if (!Number.isInteger(integerValue) || integerValue < 0) return null;
        if ((token === "--port" || token === "--clientPort") && (integerValue < 1 || integerValue > 65535)) return null;
        if ((token === "--intervalMs" || token === "--stuckThresholdMs") && integerValue < 1000) return null;
        if (token === "--timeoutMs" && integerValue < 500) return null;
        if (token === "--intervalMs") hasIntervalMs = true;
      } else if (token === "--server") {
        try {
          const url = new URL(value);
          if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
        } catch {
          return null;
        }
      }
      const pair = `${token} ${value}`;
      if (hasSecretLikeCommandValue(pair)) return null;
      tokens.push(token, value);
      index += 1;
      continue;
    }
    break;
  }

  const commandText = tokens.join(" ");
  if (tokens.length < 3 || hasSecretLikeCommandValue(commandText) || !hasSendStatus) return null;
  if (expectedMode === "once" && (!hasOnce || !hasBoardSummary)) return null;
  if (expectedMode === "watch" && (hasOnce || !hasIntervalMs)) return null;
  return commandText;
}

function parseMacHeartbeatStartHelperCommand(fragment, expectedAction) {
  const rawTokens = String(fragment || "").split(/\s+/).map(stripCommandToken).filter(Boolean);
  if (rawTokens.length < 2) return null;
  if (rawTokens[0] !== "node") return null;
  if (rawTokens[1].replace(/\\/g, "/") !== "scripts/mac/start-mac-heartbeat-watcher.mjs") return null;

  const noValueFlags = new Set(["--status", "--stop", "--restart", "--boardSummary"]);
  const valueFlags = new Set([
    "--host",
    "--port",
    "--clientHost",
    "--clientPort",
    "--timeoutMs",
    "--server",
    "--intervalMs",
  ]);
  const integerValueFlags = new Set(["--port", "--clientPort", "--timeoutMs", "--intervalMs"]);
  const tokens = [rawTokens[0], rawTokens[1]];
  let action = "start";
  let hasBoardSummary = false;
  for (let index = 2; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    if (!token || /^[A-Za-z][A-Za-z0-9_-]*=/.test(token)) break;
    if (!token.startsWith("--")) break;
    if (/^--(?:password|token|secret|passwd|pwd)$/i.test(token)) return null;
    if (noValueFlags.has(token)) {
      if (token === "--status") action = "status";
      if (token === "--stop") action = "stop";
      if (token === "--restart") action = "restart";
      if (token === "--boardSummary") hasBoardSummary = true;
      tokens.push(token);
      continue;
    }
    if (valueFlags.has(token)) {
      const value = stripCommandToken(rawTokens[index + 1] || "");
      if (!value || value.startsWith("--") || /^[A-Za-z][A-Za-z0-9_-]*=/.test(value)) break;
      if (/[<>]/.test(value)) return null;
      if (integerValueFlags.has(token)) {
        const integerValue = Number(value);
        if (!Number.isInteger(integerValue) || integerValue < 0) return null;
        if ((token === "--port" || token === "--clientPort") && (integerValue < 1 || integerValue > 65535)) return null;
        if (token === "--intervalMs" && integerValue < 1000) return null;
        if (token === "--timeoutMs" && integerValue < 500) return null;
      } else if (token === "--server") {
        try {
          const url = new URL(value);
          if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
        } catch {
          return null;
        }
      }
      const pair = `${token} ${value}`;
      if (hasSecretLikeCommandValue(pair)) return null;
      tokens.push(token, value);
      index += 1;
      continue;
    }
    break;
  }

  const commandText = tokens.join(" ");
  if (tokens.length < 3 || hasSecretLikeCommandValue(commandText) || !hasBoardSummary) return null;
  if (action !== expectedAction) return null;
  return commandText;
}

function isLoopbackHost(value) {
  const host = String(value || "").trim().toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

function parseWindowsReverseGrantCommand(fragment, expectedAction) {
  const rawTokens = String(fragment || "").split(/\s+/).map(stripCommandToken).filter(Boolean);
  if (rawTokens.length < 2) return null;

  let index = 0;
  let style = "";
  let action = "";
  let host = "";
  let port = 0;
  let hasBoardSummary = false;
  let hasDurationMs = false;
  const tokens = [];
  const executable = rawTokens[index];
  const normalizedExecutable = executable.toLowerCase();

  if (executable === "node") {
    if (rawTokens[index + 1]?.replace(/\\/g, "/") !== "scripts/windows/allow-windows-reverse-control.mjs") {
      return null;
    }
    style = "node";
    tokens.push(rawTokens[index], rawTokens[index + 1]);
    index += 2;
  } else if (["pwsh", "pwsh.exe", "powershell", "powershell.exe"].includes(normalizedExecutable)) {
    style = "powershell";
    tokens.push(rawTokens[index]);
    index += 1;
    while (index < rawTokens.length) {
      const token = rawTokens[index];
      const normalized = token.toLowerCase();
      if (normalized === "-noprofile" || normalized === "-noninteractive") {
        tokens.push(token);
        index += 1;
        continue;
      }
      if (normalized === "-executionpolicy") {
        const value = rawTokens[index + 1] || "";
        if (!/^(bypass|remotesigned|unrestricted)$/i.test(value)) return null;
        tokens.push(token, value);
        index += 2;
        continue;
      }
      if (normalized === "-file") {
        const scriptPath = rawTokens[index + 1] || "";
        if (scriptPath.replace(/\\/g, "/") !== "scripts/windows/allow-windows-reverse-control.ps1") return null;
        tokens.push(token, scriptPath);
        index += 2;
        break;
      }
      return null;
    }
    if (!tokens.some((token) => token.toLowerCase() === "-file")) return null;
  } else {
    return null;
  }

  while (index < rawTokens.length) {
    const token = rawTokens[index];
    if (!token || /^[A-Za-z][A-Za-z0-9_-]*=/.test(token)) break;
    if (!token.startsWith("-")) break;
    if (/^-{1,2}(?:password|token|secret|passwd|pwd)$/i.test(token)) return null;

    if (style === "node") {
      if (token === "--status" || token === "--grant" || token === "--revoke" || token === "--boardSummary") {
        if (token === "--status") action = "status";
        if (token === "--grant") action = "grant";
        if (token === "--revoke") action = "revoke";
        if (token === "--boardSummary") hasBoardSummary = true;
        tokens.push(token);
        index += 1;
        continue;
      }
      if (["--host", "--port", "--action", "--durationMs", "--timeoutMs"].includes(token)) {
        const value = stripCommandToken(rawTokens[index + 1] || "");
        if (!value || value.startsWith("-") || /^[A-Za-z][A-Za-z0-9_-]*=/.test(value) || /[<>]/.test(value)) return null;
        if (token === "--host") {
          host = value;
          if (!isLoopbackHost(value)) return null;
        } else if (token === "--port") {
          port = Number(value);
          if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
        } else if (token === "--durationMs" || token === "--timeoutMs") {
          const integerValue = Number(value);
          if (!Number.isInteger(integerValue) || integerValue < 0 || integerValue > 120000) return null;
          if (token === "--durationMs") hasDurationMs = true;
        } else if (token === "--action") {
          if (!["status", "grant", "revoke"].includes(value)) return null;
          action = value;
        }
        const pair = `${token} ${value}`;
        if (hasSecretLikeCommandValue(pair)) return null;
        tokens.push(token, value);
        index += 2;
        continue;
      }
      return null;
    }

    const normalized = token.toLowerCase();
    if (["-status", "-grant", "-revoke", "-boardsummary"].includes(normalized)) {
      if (normalized === "-status") action = "status";
      if (normalized === "-grant") action = "grant";
      if (normalized === "-revoke") action = "revoke";
      if (normalized === "-boardsummary") hasBoardSummary = true;
      tokens.push(token);
      index += 1;
      continue;
    }
    if (["-hostname", "-host", "-port", "-action", "-durationms", "-timeoutms"].includes(normalized)) {
      const value = stripCommandToken(rawTokens[index + 1] || "");
      if (!value || value.startsWith("-") || /^[A-Za-z][A-Za-z0-9_-]*=/.test(value) || /[<>]/.test(value)) return null;
      if (normalized === "-hostname" || normalized === "-host") {
        host = value;
        if (!isLoopbackHost(value)) return null;
      } else if (normalized === "-port") {
        port = Number(value);
        if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
      } else if (normalized === "-durationms" || normalized === "-timeoutms") {
        const integerValue = Number(value);
        if (!Number.isInteger(integerValue) || integerValue < 0 || integerValue > 120000) return null;
        if (normalized === "-durationms") hasDurationMs = true;
      } else if (normalized === "-action") {
        if (!["status", "grant", "revoke"].includes(value)) return null;
        action = value;
      }
      const pair = `${token} ${value}`;
      if (hasSecretLikeCommandValue(pair)) return null;
      tokens.push(token, value);
      index += 2;
      continue;
    }
    return null;
  }

  if (!action) action = "grant";
  if (action !== expectedAction) return null;
  if (!host || !port || !hasBoardSummary) return null;
  if (expectedAction === "grant" && !hasDurationMs) return null;
  const commandText = tokens.join(" ");
  if (hasSecretLikeCommandValue(commandText)) return null;
  return commandText;
}

function parseWindowsSecureAuthPathCommand(fragment) {
  const rawTokens = String(fragment || "").split(/\s+/).map(stripCommandToken).filter(Boolean);
  const nodeIndex = rawTokens.findIndex((token, index) =>
    token === "node" &&
    rawTokens[index + 1]?.replace(/\\/g, "/") === "scripts/windows/start-windows-host.mjs",
  );
  if (nodeIndex < 0) return null;

  const tokens = [rawTokens[nodeIndex], rawTokens[nodeIndex + 1]];
  let host = "";
  let port = null;
  let hasPromptPassword = false;
  let hasRequirePassword = false;
  for (let index = nodeIndex + 2; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    if (!token || /^[A-Za-z][A-Za-z0-9_-]*=/.test(token)) break;
    if (!token.startsWith("--")) break;
    if (/^--(?:password|token|secret|passwd|pwd)$/i.test(token)) return null;
    if (token === "--promptPassword" || token === "--requirePassword") {
      if (token === "--promptPassword") hasPromptPassword = true;
      if (token === "--requirePassword") hasRequirePassword = true;
      tokens.push(token);
      continue;
    }
    if (token === "--host" || token === "--port") {
      const value = stripCommandToken(rawTokens[index + 1] || "");
      if (!value || value.startsWith("--") || /^[A-Za-z][A-Za-z0-9_-]*=/.test(value) || /[<>]/.test(value)) return null;
      if (token === "--host") {
        host = value;
        if (value !== "0.0.0.0") return null;
      }
      if (token === "--port") {
        port = Number(value);
        if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
      }
      const pair = `${token} ${value}`;
      if (hasSecretLikeCommandValue(pair)) return null;
      tokens.push(token, value);
      index += 1;
      continue;
    }
    return null;
  }

  if (host !== "0.0.0.0" || !port || !hasPromptPassword || !hasRequirePassword) return null;
  const commandText = tokens.join(" ");
  if (hasSecretLikeCommandValue(commandText)) return null;
  return commandText;
}

function commandHasFlag(commandText, flagName) {
  return String(commandText || "").split(/\s+/).includes(flagName);
}

function extractMacSafeStartFromText(text, label, source = "text", options = {}) {
  const value = String(text || "");
  const escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escapedLabel}\\s*=\\s*`, "gi");
  const commands = [];
  let rejectedCount = 0;
  let match;
  while ((match = regex.exec(value)) !== null) {
    const fragment = value.slice(match.index + match[0].length);
    const commandText = parseMacHostSafeStartCommand(fragment);
    if (!commandText) {
      rejectedCount += 1;
    } else if (options.requireMaxScreenFps && !commandHasFlag(commandText, "--maxScreenFps")) {
      rejectedCount += 1;
    } else {
      if (!commands.includes(commandText)) commands.push(commandText);
    }
  }
  if (commands.length === 0) return emptyMacSafeStart(source, value ? 1 : 0, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source,
    textCount: value ? 1 : 0,
    rejectedCount,
  };
}

function extractMacSafeStartFromBoardState(state, label, options = {}) {
  const texts = collectStringValues(state);
  const commands = [];
  let rejectedCount = 0;
  for (const text of texts) {
    const extracted = extractMacSafeStartFromText(text, label, "api-state", options);
    for (const commandText of extracted.commands) {
      if (!commands.includes(commandText)) commands.push(commandText);
    }
    rejectedCount += extracted.rejectedCount;
  }
  if (commands.length === 0) return emptyMacSafeStart("api-state", texts.length, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source: "api-state",
    textCount: texts.length,
    rejectedCount,
  };
}

function extractMacRemoteAudioPlanFromText(text, source = "text") {
  const value = String(text || "");
  const labels = ["MacRemoteAudioPlan"];
  const commands = [];
  let rejectedCount = 0;
  for (const label of labels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedLabel}\\s*=\\s*`, "gi");
    let match;
    while ((match = regex.exec(value)) !== null) {
      const fragment = value.slice(match.index + match[0].length);
      const commandText = parseMacRemoteAudioPlanCommand(fragment);
      if (!commandText) {
        rejectedCount += 1;
      } else if (!commands.includes(commandText)) {
        commands.push(commandText);
      }
    }
  }
  if (commands.length === 0) return emptyMacSafeStart(source, value ? 1 : 0, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source,
    textCount: value ? 1 : 0,
    rejectedCount,
  };
}

function extractMacRemoteAudioPlanFromBoardState(state) {
  const texts = collectStringValues(state);
  const commands = [];
  let rejectedCount = 0;
  for (const text of texts) {
    const extracted = extractMacRemoteAudioPlanFromText(text, "api-state");
    for (const commandText of extracted.commands) {
      if (!commands.includes(commandText)) commands.push(commandText);
    }
    rejectedCount += extracted.rejectedCount;
  }
  if (commands.length === 0) return emptyMacSafeStart("api-state", texts.length, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source: "api-state",
    textCount: texts.length,
    rejectedCount,
  };
}

function extractMacInputSafetyPlanFromText(text, source = "text") {
  const value = String(text || "");
  const labels = ["MacInputSafetyPlan"];
  const commands = [];
  let rejectedCount = 0;
  for (const label of labels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedLabel}\\s*=\\s*`, "gi");
    let match;
    while ((match = regex.exec(value)) !== null) {
      const fragment = value.slice(match.index + match[0].length);
      const commandText = parseMacInputSafetyPlanCommand(fragment);
      if (!commandText) {
        rejectedCount += 1;
      } else if (!commands.includes(commandText)) {
        commands.push(commandText);
      }
    }
  }
  if (commands.length === 0) return emptyMacSafeStart(source, value ? 1 : 0, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source,
    textCount: value ? 1 : 0,
    rejectedCount,
  };
}

function extractMacInputSafetyPlanFromBoardState(state) {
  const texts = collectStringValues(state);
  const commands = [];
  let rejectedCount = 0;
  for (const text of texts) {
    const extracted = extractMacInputSafetyPlanFromText(text, "api-state");
    for (const commandText of extracted.commands) {
      if (!commands.includes(commandText)) commands.push(commandText);
    }
    rejectedCount += extracted.rejectedCount;
  }
  if (commands.length === 0) return emptyMacSafeStart("api-state", texts.length, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source: "api-state",
    textCount: texts.length,
    rejectedCount,
  };
}

function extractMacManualUxStatusFromText(text, source = "text") {
  const value = String(text || "");
  const labels = ["MacManualUxStatus"];
  const commands = [];
  let rejectedCount = 0;
  for (const label of labels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedLabel}\\s*=\\s*`, "gi");
    let match;
    while ((match = regex.exec(value)) !== null) {
      const fragment = value.slice(match.index + match[0].length);
      const commandText = parseMacManualUxStatusCommand(fragment);
      if (!commandText) {
        rejectedCount += 1;
      } else if (!commands.includes(commandText)) {
        commands.push(commandText);
      }
    }
  }
  if (commands.length === 0) return emptyMacSafeStart(source, value ? 1 : 0, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source,
    textCount: value ? 1 : 0,
    rejectedCount,
  };
}

function extractMacManualUxStatusFromBoardState(state) {
  const texts = collectStringValues(state);
  const commands = [];
  let rejectedCount = 0;
  for (const text of texts) {
    const extracted = extractMacManualUxStatusFromText(text, "api-state");
    for (const commandText of extracted.commands) {
      if (!commands.includes(commandText)) commands.push(commandText);
    }
    rejectedCount += extracted.rejectedCount;
  }
  if (commands.length === 0) return emptyMacSafeStart("api-state", texts.length, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source: "api-state",
    textCount: texts.length,
    rejectedCount,
  };
}

function extractMacFormalLocalSmokeFromText(text, source = "text") {
  const value = String(text || "");
  const labels = ["MacFormalLocalSmoke", "RerunFormalLocalSmoke"];
  const commands = [];
  let rejectedCount = 0;
  for (const label of labels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedLabel}\\s*=\\s*`, "gi");
    let match;
    while ((match = regex.exec(value)) !== null) {
      const fragment = value.slice(match.index + match[0].length);
      const commandText = parseMacFormalLocalSmokeCommand(fragment);
      if (!commandText) {
        rejectedCount += 1;
      } else if (!commands.includes(commandText)) {
        commands.push(commandText);
      }
    }
  }
  if (commands.length === 0) return emptyMacSafeStart(source, value ? 1 : 0, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source,
    textCount: value ? 1 : 0,
    rejectedCount,
  };
}

function extractMacFormalLocalSmokeFromBoardState(state) {
  const texts = collectStringValues(state);
  const commands = [];
  let rejectedCount = 0;
  for (const text of texts) {
    const extracted = extractMacFormalLocalSmokeFromText(text, "api-state");
    for (const commandText of extracted.commands) {
      if (!commands.includes(commandText)) commands.push(commandText);
    }
    rejectedCount += extracted.rejectedCount;
  }
  if (commands.length === 0) return emptyMacSafeStart("api-state", texts.length, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source: "api-state",
    textCount: texts.length,
    rejectedCount,
  };
}

function extractMacClientFormalSmokeFromText(text, source = "text") {
  const value = String(text || "");
  const labels = ["MacClientFormalSmoke", "RerunMacClientFormalSmoke"];
  const commands = [];
  let rejectedCount = 0;
  for (const label of labels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedLabel}\\s*=\\s*`, "gi");
    let match;
    while ((match = regex.exec(value)) !== null) {
      const fragment = value.slice(match.index + match[0].length);
      const commandText = parseMacClientFormalSmokeCommand(fragment);
      if (!commandText) {
        rejectedCount += 1;
      } else if (!commands.includes(commandText)) {
        commands.push(commandText);
      }
    }
  }
  if (commands.length === 0) return emptyMacSafeStart(source, value ? 1 : 0, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source,
    textCount: value ? 1 : 0,
    rejectedCount,
  };
}

function extractMacClientFormalChecklistFromText(text, source = "text") {
  const value = String(text || "");
  const labels = ["MacClientFormalChecklist", "RerunMacClientFormalChecklist"];
  const commands = [];
  let rejectedCount = 0;
  for (const label of labels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedLabel}\\s*=\\s*`, "gi");
    let match;
    while ((match = regex.exec(value)) !== null) {
      const fragment = value.slice(match.index + match[0].length);
      const commandText = parseMacClientFormalChecklistCommand(fragment);
      if (!commandText) {
        rejectedCount += 1;
      } else if (!commands.includes(commandText)) {
        commands.push(commandText);
      }
    }
  }
  if (commands.length === 0) return emptyMacSafeStart(source, value ? 1 : 0, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source,
    textCount: value ? 1 : 0,
    rejectedCount,
  };
}

const macClientManualChecklistBoundaryPattern = /\s+(?:CopyDiagnostics|MacClientPasswordLocation|MacClientFormalChecklist|MacClientFormalSmoke|MacClientDiscoverWindows|MacClientReverseRehearsal|MacClientReverseGrantCopy|MacClientPromptPasswordSmoke|MacClientBrowserSelfTest|WindowsReverseGrantStatus|WindowsOpenOneTimeReverseGrant|WindowsReverseGrantStatusNodeFallback|WindowsOpenOneTimeReverseGrantNodeFallback|MacPowerPlan|MacRemoteAudioPlan|MacInputSafetyPlan|MacManualUxStatus|MacHeartbeatOnce|MacHeartbeatWatch|MacHeartbeatStart|MacHeartbeatStatus|MacHeartbeatStop|MacHostSafeStart|MacMaxFpsSafeStart|MacFormalLocalSmoke|MacHostReadiness|MacHeartbeat|MacUnattended|MacUnattendedFormal|Evidence|Next)\s*(?:=|:|\b)|\s+No password was requested\b|\s+No Windows connection\b/i;
const macClientPasswordLocationBoundaryPattern = /\s+(?:CopyDiagnostics|MacClientManualChecklist|MacClientFormalChecklist|MacClientFormalSmoke|MacClientDiscoverWindows|MacClientReverseRehearsal|MacClientReverseGrantCopy|MacClientPromptPasswordSmoke|MacClientBrowserSelfTest|WindowsReverseGrantStatus|WindowsOpenOneTimeReverseGrant|WindowsReverseGrantStatusNodeFallback|WindowsOpenOneTimeReverseGrantNodeFallback|MacPowerPlan|MacRemoteAudioPlan|MacInputSafetyPlan|MacManualUxStatus|MacHeartbeatOnce|MacHeartbeatWatch|MacHeartbeatStart|MacHeartbeatStatus|MacHeartbeatStop|MacHostSafeStart|MacMaxFpsSafeStart|MacFormalLocalSmoke|MacHostReadiness|MacHeartbeat|MacUnattended|MacUnattendedFormal|Evidence|Next)\s*(?:=|:|\b)|\s+No password was requested\b|\s+No Windows connection\b/i;

function cleanMacClientManualChecklistAction(fragment) {
  let value = normalizedText(fragment).replace(/\s+/g, " ");
  const boundary = value.search(macClientManualChecklistBoundaryPattern);
  if (boundary >= 0) value = value.slice(0, boundary);
  return normalizedText(value).replace(/[.。]+$/g, "");
}

function parseMacClientManualChecklistSegment(fragment, source = "text") {
  const action = cleanMacClientManualChecklistAction(fragment);
  if (!action || hasSecretLikeCommandValue(action) || /\b(?:input_event|input_events|inject)\b/i.test(action) || /自动发送/.test(action)) {
    return null;
  }
  if (!macClientManualChecklistAllowedActions.has(action)) return null;
  return {
    found: true,
    action,
    summary: action,
    source,
  };
}

function extractMacClientManualChecklistFromText(text, source = "text") {
  const value = String(text || "");
  const regex = /\bMacClientManualChecklist\s*=\s*/gi;
  let selected = null;
  let segmentCount = 0;
  let rejectedCount = 0;
  let match;
  while ((match = regex.exec(value)) !== null) {
    segmentCount += 1;
    const fragment = value.slice(match.index + match[0].length);
    const parsed = parseMacClientManualChecklistSegment(fragment, source);
    if (!parsed) {
      rejectedCount += 1;
      continue;
    }
    selected = parsed;
  }
  if (!selected) return emptyMacClientManualChecklist(source, value ? 1 : 0, rejectedCount);
  return {
    ...selected,
    textCount: value ? 1 : 0,
    segmentCount,
    rejectedCount,
  };
}

function extractMacClientManualChecklistFromBoardState(state) {
  const texts = collectStringValues(state);
  let selected = null;
  let segmentCount = 0;
  let rejectedCount = 0;
  for (const text of texts) {
    const extracted = extractMacClientManualChecklistFromText(text, "api-state");
    segmentCount += extracted.segmentCount || 0;
    rejectedCount += extracted.rejectedCount || 0;
    if (extracted.found) selected = extracted;
  }
  if (!selected) return emptyMacClientManualChecklist("api-state", texts.length, rejectedCount);
  return {
    ...selected,
    source: "api-state",
    textCount: texts.length,
    segmentCount,
    rejectedCount,
  };
}

function cleanMacClientPasswordLocationAction(fragment) {
  let value = normalizedText(fragment).replace(/\s+/g, " ");
  const boundary = value.search(macClientPasswordLocationBoundaryPattern);
  if (boundary >= 0) value = value.slice(0, boundary);
  return normalizedText(value).replace(/[.。]+$/g, "");
}

function parseMacClientPasswordLocationSegment(fragment, source = "text") {
  const action = cleanMacClientPasswordLocationAction(fragment);
  if (!action || hasSecretLikeCommandValue(action) || /\b(?:input_event|input_events|inject)\b/i.test(action) || /自动发送/.test(action)) {
    return null;
  }
  if (!macClientPasswordLocationAllowedActions.has(action)) return null;
  return {
    found: true,
    action,
    summary: action,
    source,
  };
}

function extractMacClientPasswordLocationFromText(text, source = "text") {
  const value = String(text || "");
  const regex = /\bMacClientPasswordLocation\s*=\s*/gi;
  let selected = null;
  let segmentCount = 0;
  let rejectedCount = 0;
  let match;
  while ((match = regex.exec(value)) !== null) {
    segmentCount += 1;
    const fragment = value.slice(match.index + match[0].length);
    const parsed = parseMacClientPasswordLocationSegment(fragment, source);
    if (!parsed) {
      rejectedCount += 1;
      continue;
    }
    selected = parsed;
  }
  if (!selected) return emptyMacClientPasswordLocation(source, value ? 1 : 0, rejectedCount);
  return {
    ...selected,
    textCount: value ? 1 : 0,
    segmentCount,
    rejectedCount,
  };
}

function extractMacClientPasswordLocationFromBoardState(state) {
  const texts = collectStringValues(state);
  let selected = null;
  let segmentCount = 0;
  let rejectedCount = 0;
  for (const text of texts) {
    const extracted = extractMacClientPasswordLocationFromText(text, "api-state");
    segmentCount += extracted.segmentCount || 0;
    rejectedCount += extracted.rejectedCount || 0;
    if (extracted.found) selected = extracted;
  }
  if (!selected) return emptyMacClientPasswordLocation("api-state", texts.length, rejectedCount);
  return {
    ...selected,
    source: "api-state",
    textCount: texts.length,
    segmentCount,
    rejectedCount,
  };
}
function extractMacClientDiscoverWindowsFromText(text, source = "text") {
  const value = String(text || "");
  const labels = ["MacClientDiscoverWindows", "RerunMacClientDiscoverWindows"];
  const commands = [];
  let rejectedCount = 0;
  for (const label of labels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedLabel}\\s*=\\s*`, "gi");
    let match;
    while ((match = regex.exec(value)) !== null) {
      const fragment = value.slice(match.index + match[0].length);
      const commandText = parseMacClientDiscoverWindowsCommand(fragment);
      if (!commandText) {
        rejectedCount += 1;
      } else if (!commands.includes(commandText)) {
        commands.push(commandText);
      }
    }
  }
  if (commands.length === 0) return emptyMacSafeStart(source, value ? 1 : 0, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source,
    textCount: value ? 1 : 0,
    rejectedCount,
  };
}

function extractMacClientDiscoverWindowsFromBoardState(state) {
  const texts = collectStringValues(state);
  const commands = [];
  let rejectedCount = 0;
  for (const text of texts) {
    const extracted = extractMacClientDiscoverWindowsFromText(text, "api-state");
    for (const commandText of extracted.commands) {
      if (!commands.includes(commandText)) commands.push(commandText);
    }
    rejectedCount += extracted.rejectedCount;
  }
  if (commands.length === 0) return emptyMacSafeStart("api-state", texts.length, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source: "api-state",
    textCount: texts.length,
    rejectedCount,
  };
}

function extractMacClientFormalChecklistFromBoardState(state) {
  const texts = collectStringValues(state);
  const commands = [];
  let rejectedCount = 0;
  for (const text of texts) {
    const extracted = extractMacClientFormalChecklistFromText(text, "api-state");
    for (const commandText of extracted.commands) {
      if (!commands.includes(commandText)) commands.push(commandText);
    }
    rejectedCount += extracted.rejectedCount;
  }
  if (commands.length === 0) return emptyMacSafeStart("api-state", texts.length, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source: "api-state",
    textCount: texts.length,
    rejectedCount,
  };
}

function extractMacClientFormalSmokeFromBoardState(state) {
  const texts = collectStringValues(state);
  const commands = [];
  let rejectedCount = 0;
  for (const text of texts) {
    const extracted = extractMacClientFormalSmokeFromText(text, "api-state");
    for (const commandText of extracted.commands) {
      if (!commands.includes(commandText)) commands.push(commandText);
    }
    rejectedCount += extracted.rejectedCount;
  }
  if (commands.length === 0) return emptyMacSafeStart("api-state", texts.length, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source: "api-state",
    textCount: texts.length,
    rejectedCount,
  };
}

function extractMacHeartbeatWatcherFromText(text, label, expectedMode, source = "text") {
  const value = String(text || "");
  const escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escapedLabel}\\s*=\\s*`, "gi");
  const commands = [];
  let rejectedCount = 0;
  let match;
  while ((match = regex.exec(value)) !== null) {
    const fragment = value.slice(match.index + match[0].length);
    const commandText = parseMacHeartbeatWatcherCommand(fragment, expectedMode);
    if (!commandText) {
      rejectedCount += 1;
    } else if (!commands.includes(commandText)) {
      commands.push(commandText);
    }
  }
  if (commands.length === 0) return emptyMacSafeStart(source, value ? 1 : 0, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source,
    textCount: value ? 1 : 0,
    rejectedCount,
  };
}

function extractMacHeartbeatWatcherFromBoardState(state, label, expectedMode) {
  const texts = collectStringValues(state);
  const commands = [];
  let rejectedCount = 0;
  for (const text of texts) {
    const extracted = extractMacHeartbeatWatcherFromText(text, label, expectedMode, "api-state");
    for (const commandText of extracted.commands) {
      if (!commands.includes(commandText)) commands.push(commandText);
    }
    rejectedCount += extracted.rejectedCount;
  }
  if (commands.length === 0) return emptyMacSafeStart("api-state", texts.length, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source: "api-state",
    textCount: texts.length,
    rejectedCount,
  };
}

function extractMacHeartbeatStartHelperFromText(text, label, expectedAction, source = "text") {
  const value = String(text || "");
  const escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escapedLabel}\\s*=\\s*`, "gi");
  const commands = [];
  let rejectedCount = 0;
  let match;
  while ((match = regex.exec(value)) !== null) {
    const fragment = value.slice(match.index + match[0].length);
    const commandText = parseMacHeartbeatStartHelperCommand(fragment, expectedAction);
    if (!commandText) {
      rejectedCount += 1;
    } else if (!commands.includes(commandText)) {
      commands.push(commandText);
    }
  }
  if (commands.length === 0) return emptyMacSafeStart(source, value ? 1 : 0, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source,
    textCount: value ? 1 : 0,
    rejectedCount,
  };
}

function extractMacHeartbeatStartHelperFromBoardState(state, label, expectedAction) {
  const texts = collectStringValues(state);
  const commands = [];
  let rejectedCount = 0;
  for (const text of texts) {
    const extracted = extractMacHeartbeatStartHelperFromText(text, label, expectedAction, "api-state");
    for (const commandText of extracted.commands) {
      if (!commands.includes(commandText)) commands.push(commandText);
    }
    rejectedCount += extracted.rejectedCount;
  }
  if (commands.length === 0) return emptyMacSafeStart("api-state", texts.length, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source: "api-state",
    textCount: texts.length,
    rejectedCount,
  };
}

function extractWindowsReverseGrantFromText(text, label, expectedAction, source = "text") {
  const value = String(text || "");
  const escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escapedLabel}\\s*=\\s*`, "gi");
  const commands = [];
  let rejectedCount = 0;
  let match;
  while ((match = regex.exec(value)) !== null) {
    const fragment = value.slice(match.index + match[0].length);
    const commandText = parseWindowsReverseGrantCommand(fragment, expectedAction);
    if (!commandText) {
      rejectedCount += 1;
    } else if (!commands.includes(commandText)) {
      commands.push(commandText);
    }
  }
  if (commands.length === 0) return emptyMacSafeStart(source, value ? 1 : 0, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source,
    textCount: value ? 1 : 0,
    rejectedCount,
  };
}

function extractWindowsReverseGrantFromBoardState(state, label, expectedAction) {
  const texts = collectStringValues(state);
  const commands = [];
  let rejectedCount = 0;
  for (const text of texts) {
    const extracted = extractWindowsReverseGrantFromText(text, label, expectedAction, "api-state");
    for (const commandText of extracted.commands) {
      if (!commands.includes(commandText)) commands.push(commandText);
    }
    rejectedCount += extracted.rejectedCount;
  }
  if (commands.length === 0) return emptyMacSafeStart("api-state", texts.length, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source: "api-state",
    textCount: texts.length,
    rejectedCount,
  };
}

function extractWindowsSecureAuthPathFromText(text, source = "text") {
  const value = String(text || "");
  const regex = /\b(?:WindowsSecureAuthPath|SecureAuthPath)\s*=\s*/gi;
  const commands = [];
  let rejectedCount = 0;
  let match;
  while ((match = regex.exec(value)) !== null) {
    const fragment = value.slice(match.index + match[0].length);
    const commandText = parseWindowsSecureAuthPathCommand(fragment);
    if (!commandText) {
      rejectedCount += 1;
    } else if (!commands.includes(commandText)) {
      commands.push(commandText);
    }
  }
  if (commands.length === 0) return emptyMacSafeStart(source, value ? 1 : 0, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source,
    textCount: value ? 1 : 0,
    rejectedCount,
  };
}

function extractWindowsSecureAuthPathFromBoardState(state) {
  const texts = collectStringValues(state);
  const commands = [];
  let rejectedCount = 0;
  for (const text of texts) {
    const extracted = extractWindowsSecureAuthPathFromText(text, "api-state");
    for (const commandText of extracted.commands) {
      if (!commands.includes(commandText)) commands.push(commandText);
    }
    rejectedCount += extracted.rejectedCount;
  }
  if (commands.length === 0) return emptyMacSafeStart("api-state", texts.length, rejectedCount);
  return {
    found: true,
    command: commands[commands.length - 1],
    commands,
    source: "api-state",
    textCount: texts.length,
    rejectedCount,
  };
}

const windowsLanRiskLabels = new Set([
  "none",
  "not-checked",
  "no-lan-ip",
  "no-listener",
  "bind-address",
  "tcp-unreachable",
  "lan-probe-blocked",
  "firewall-query-failed",
  "public-profile",
  "no-firewall-allow",
]);

function emptyWindowsLanRisk(source = "none", textCount = 0, rejectedCount = 0) {
  return {
    found: false,
    source,
    textCount,
    risks: [],
    summary: "not-seen",
    rejectedCount,
  };
}

function parseWindowsLanRiskFragment(fragment) {
  const value = String(fragment || "").trimStart();
  const match = /^([A-Za-z0-9_-]+(?:,[A-Za-z0-9_-]+)*)/.exec(value);
  if (!match) return null;
  const token = match[1].replace(/[.,;，。；]+$/g, "");
  const tail = value.slice(match[1].length);
  const sameSentenceTail = String(tail.split(/[\r\n;；。]/)[0] || "");
  if (
    /^\s+(?:--|\$|\||&|>|<|`|node\b|cmd\b|pwsh\b|powershell\b)/i.test(sameSentenceTail) ||
    hasSecretLikeCommandValue(sameSentenceTail)
  ) {
    return null;
  }

  const risks = [];
  for (const item of token.split(",")) {
    const risk = item.trim();
    if (!risk || !windowsLanRiskLabels.has(risk)) return null;
    if (!risks.includes(risk)) risks.push(risk);
  }
  if (risks.length === 0) return null;
  if (risks.includes("none")) {
    return risks.length === 1 ? { risks: [], summary: "none" } : null;
  }
  return {
    risks,
    summary: risks.join(","),
  };
}

function extractWindowsLanRiskFromText(text, source = "text") {
  const value = String(text || "");
  const regex = /\bWindowsLanRisk\s*=\s*/gi;
  const findings = [];
  let rejectedCount = 0;
  let match;
  while ((match = regex.exec(value)) !== null) {
    const fragment = value.slice(match.index + match[0].length);
    const parsed = parseWindowsLanRiskFragment(fragment);
    if (!parsed) {
      rejectedCount += 1;
      continue;
    }
    findings.push(parsed);
  }
  if (findings.length === 0) return emptyWindowsLanRisk(source, value ? 1 : 0, rejectedCount);
  const latest = findings[findings.length - 1];
  return {
    found: true,
    source,
    textCount: value ? 1 : 0,
    risks: latest.risks,
    summary: latest.summary,
    rejectedCount,
  };
}

function extractWindowsLanRiskFromBoardState(state) {
  const texts = collectStringValues(state);
  const findings = [];
  let rejectedCount = 0;
  for (const text of texts) {
    const extracted = extractWindowsLanRiskFromText(text, "api-state");
    if (extracted.found) {
      findings.push({
        risks: extracted.risks,
        summary: extracted.summary,
      });
    }
    rejectedCount += extracted.rejectedCount;
  }
  if (findings.length === 0) return emptyWindowsLanRisk("api-state", texts.length, rejectedCount);
  const latest = findings[findings.length - 1];
  return {
    found: true,
    source: "api-state",
    textCount: texts.length,
    risks: latest.risks,
    summary: latest.summary,
    rejectedCount,
  };
}

async function getBoardState(args) {
  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(args.timeoutMs, 5000), 30000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL("/api/state", args.server), {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(process.env.CODEX_LINK_TOKEN ? { "X-Codex-Link-Token": process.env.CODEX_LINK_TOKEN } : {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, status: response.status, state: null, error: `${response.status}: ${text}` };
    }
    try {
      return { ok: true, status: response.status, state: text ? JSON.parse(text) : {}, error: "" };
    } catch (error) {
      return { ok: false, status: response.status, state: null, error: `invalid JSON: ${error.message}` };
    }
  } catch (error) {
    return { ok: false, status: null, state: null, error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

function getGitStatus() {
  const branch = command("git", ["status", "--short", "--branch"], { timeoutMs: 5000 });
  const head = command("git", ["log", "--oneline", "--decorate", "-1"], { timeoutMs: 5000 });
  const currentBuildId = command("git", ["rev-parse", "--short", "HEAD"], { timeoutMs: 3000 });
  const statusLines = splitLines(branch.stdout);
  const changes = statusLines.filter((line) => !line.startsWith("##"));
  return {
    ok: branch.ok && head.ok,
    clean: branch.ok && changes.length === 0,
    branchLine: statusLines.find((line) => line.startsWith("##")) || "",
    head: normalizedText(head.stdout),
    currentBuildId: normalizedText(currentBuildId.stdout),
    changeCount: changes.length,
    changes,
    errors: [branch.error || branch.stderr, head.error || head.stderr, currentBuildId.error || currentBuildId.stderr]
      .map(normalizedText)
      .filter(Boolean),
  };
}

async function getBoardSnapshot(args) {
  if (!args.checkBoard) {
    return {
      requested: false,
      ok: null,
      status: null,
      source: "skipped",
      lineCount: 0,
      tail: [],
      currentCall: {
        present: false,
        active: false,
        summary: "not checked",
      },
      userPresence: emptyUserPresence("skipped"),
      macHostSafeStart: emptyMacSafeStart("skipped"),
      macMaxFpsSafeStart: emptyMacSafeStart("skipped"),
      macFormalLocalSmoke: emptyMacSafeStart("skipped"),
      macClientDiscoverWindows: emptyMacSafeStart("skipped"),
      macClientFormalChecklist: emptyMacSafeStart("skipped"),
      macClientFormalSmoke: emptyMacSafeStart("skipped"),
      macClientManualChecklist: emptyMacClientManualChecklist("skipped"),
      macClientPasswordLocation: emptyMacClientPasswordLocation("skipped"),
      macRemoteAudioPlan: emptyMacSafeStart("skipped"),
      macRemoteAudio: emptyMacRemoteAudio("skipped"),
      macInputSafetyPlan: emptyMacSafeStart("skipped"),
      macManualUxStatus: emptyMacSafeStart("skipped"),
      macManualUx: emptyMacManualUx("skipped"),
      macInputSafety: emptyMacInputSafety("skipped"),
      macInputSafetyStatus: emptyMacInputSafetyStatus("skipped"),
      macInputSafetyUserNotice: emptyMacInputSafetyUserNotice("skipped"),
      macHeartbeatOnce: emptyMacSafeStart("skipped"),
      macHeartbeatWatch: emptyMacSafeStart("skipped"),
      macHeartbeatStart: emptyMacSafeStart("skipped"),
      macHeartbeatStatus: emptyMacSafeStart("skipped"),
      macHeartbeatStop: emptyMacSafeStart("skipped"),
      macHeartbeatFreshness: emptyMacHeartbeatFreshness("skipped"),
      macHeartbeatHealth: emptyMacHeartbeatHealth("skipped"),
      macPowerHealth: emptyMacPowerHealth("skipped"),
      macUnattendedHealth: emptyMacUnattendedHealth("skipped"),
      macEvidence: emptyMacEvidence("skipped"),
      macReadyForRealTest: emptyMacReadyForRealTest("skipped"),
      windowsReverseGrantStatus: emptyMacSafeStart("skipped"),
      windowsOpenOneTimeReverseGrant: emptyMacSafeStart("skipped"),
      windowsReverseGrantStatusNodeFallback: emptyMacSafeStart("skipped"),
      windowsOpenOneTimeReverseGrantNodeFallback: emptyMacSafeStart("skipped"),
      windowsSecureAuthPath: emptyMacSafeStart("skipped"),
      windowsLanRisk: emptyWindowsLanRisk("skipped"),
      error: "",
    };
  }

  const stateResult = await getBoardState(args);
  if (stateResult.ok) {
    return {
      requested: true,
      ok: true,
      status: stateResult.status,
      source: "api-state",
      lineCount: countBoardStateItems(stateResult.state),
      tail: [],
      currentCall: normalizeBoardCurrentCall(stateResult.state?.currentCall),
      userPresence: normalizeBoardUserPresence(stateResult.state, "api-state"),
      macHostSafeStart: extractMacSafeStartFromBoardState(stateResult.state, "MacHostSafeStart"),
      macMaxFpsSafeStart: extractMacSafeStartFromBoardState(stateResult.state, "MacMaxFpsSafeStart", { requireMaxScreenFps: true }),
      macFormalLocalSmoke: extractMacFormalLocalSmokeFromBoardState(stateResult.state),
      macClientDiscoverWindows: extractMacClientDiscoverWindowsFromBoardState(stateResult.state),
      macClientFormalChecklist: extractMacClientFormalChecklistFromBoardState(stateResult.state),
      macClientFormalSmoke: extractMacClientFormalSmokeFromBoardState(stateResult.state),
      macClientManualChecklist: extractMacClientManualChecklistFromBoardState(stateResult.state),
      macClientPasswordLocation: extractMacClientPasswordLocationFromBoardState(stateResult.state),
      macRemoteAudioPlan: extractMacRemoteAudioPlanFromBoardState(stateResult.state),
      macRemoteAudio: extractMacRemoteAudioFromBoardState(stateResult.state),
      macInputSafetyPlan: extractMacInputSafetyPlanFromBoardState(stateResult.state),
      macManualUxStatus: extractMacManualUxStatusFromBoardState(stateResult.state),
      macManualUx: extractMacManualUxFromBoardState(stateResult.state),
      macInputSafety: extractMacInputSafetyFromBoardState(stateResult.state),
      macInputSafetyStatus: extractMacInputSafetyStatusFromBoardState(stateResult.state),
      macInputSafetyUserNotice: extractMacInputSafetyUserNoticeFromBoardState(stateResult.state),
      macHeartbeatOnce: extractMacHeartbeatWatcherFromBoardState(stateResult.state, "MacHeartbeatOnce", "once"),
      macHeartbeatWatch: extractMacHeartbeatWatcherFromBoardState(stateResult.state, "MacHeartbeatWatch", "watch"),
      macHeartbeatStart: extractMacHeartbeatStartHelperFromBoardState(stateResult.state, "MacHeartbeatStart", "start"),
      macHeartbeatStatus: extractMacHeartbeatStartHelperFromBoardState(stateResult.state, "MacHeartbeatStatus", "status"),
      macHeartbeatStop: extractMacHeartbeatStartHelperFromBoardState(stateResult.state, "MacHeartbeatStop", "stop"),
      macHeartbeatFreshness: extractMacHeartbeatFreshnessFromBoardState(stateResult.state),
      macHeartbeatHealth: extractMacHeartbeatHealthFromBoardState(stateResult.state),
      macCodexHealth: extractMacCodexHealthFromBoardState(stateResult.state),
      macPowerHealth: extractMacPowerHealthFromBoardState(stateResult.state),
      macUnattendedHealth: extractMacUnattendedHealthFromBoardState(stateResult.state),
      macEvidence: extractMacEvidenceFromBoardState(stateResult.state),
      macReadyForRealTest: extractMacReadyForRealTestFromBoardState(stateResult.state),
      windowsReverseGrantStatus: extractWindowsReverseGrantFromBoardState(stateResult.state, "WindowsReverseGrantStatus", "status"),
      windowsOpenOneTimeReverseGrant: extractWindowsReverseGrantFromBoardState(stateResult.state, "WindowsOpenOneTimeReverseGrant", "grant"),
      windowsReverseGrantStatusNodeFallback: extractWindowsReverseGrantFromBoardState(stateResult.state, "WindowsReverseGrantStatusNodeFallback", "status"),
      windowsOpenOneTimeReverseGrantNodeFallback: extractWindowsReverseGrantFromBoardState(stateResult.state, "WindowsOpenOneTimeReverseGrantNodeFallback", "grant"),
      windowsSecureAuthPath: extractWindowsSecureAuthPathFromBoardState(stateResult.state),
      windowsLanRisk: extractWindowsLanRiskFromBoardState(stateResult.state),
      error: "",
    };
  }

  const result = command(process.execPath, [
    "scripts/codex-link-client.mjs",
    "--server", args.server,
    "watch",
    "--once",
  ], { timeoutMs: Math.min(Math.max(args.timeoutMs, 5000), 30000) });
  const output = `${result.stdout}\n${result.stderr}`;
  return {
    requested: true,
    ok: result.ok,
    status: stateResult.status ?? result.status,
    source: result.ok ? "codex-link-client" : "unavailable",
    lineCount: splitLines(output).length,
    tail: tailLines(output, 8),
    currentCall: parseBoardCurrentCall(output),
    userPresence: emptyUserPresence(result.ok ? "codex-link-client" : "unavailable"),
    macHostSafeStart: extractMacSafeStartFromText(output, "MacHostSafeStart", result.ok ? "codex-link-client" : "unavailable"),
    macMaxFpsSafeStart: extractMacSafeStartFromText(output, "MacMaxFpsSafeStart", result.ok ? "codex-link-client" : "unavailable", { requireMaxScreenFps: true }),
    macFormalLocalSmoke: extractMacFormalLocalSmokeFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macClientDiscoverWindows: extractMacClientDiscoverWindowsFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macClientFormalChecklist: extractMacClientFormalChecklistFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macClientFormalSmoke: extractMacClientFormalSmokeFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macClientManualChecklist: extractMacClientManualChecklistFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macClientPasswordLocation: extractMacClientPasswordLocationFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macRemoteAudioPlan: extractMacRemoteAudioPlanFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macRemoteAudio: extractMacRemoteAudioFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macInputSafetyPlan: extractMacInputSafetyPlanFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macManualUxStatus: extractMacManualUxStatusFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macManualUx: extractMacManualUxFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macInputSafety: extractMacInputSafetyFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macInputSafetyStatus: extractMacInputSafetyStatusFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macInputSafetyUserNotice: extractMacInputSafetyUserNoticeFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macHeartbeatOnce: extractMacHeartbeatWatcherFromText(output, "MacHeartbeatOnce", "once", result.ok ? "codex-link-client" : "unavailable"),
    macHeartbeatWatch: extractMacHeartbeatWatcherFromText(output, "MacHeartbeatWatch", "watch", result.ok ? "codex-link-client" : "unavailable"),
    macHeartbeatStart: extractMacHeartbeatStartHelperFromText(output, "MacHeartbeatStart", "start", result.ok ? "codex-link-client" : "unavailable"),
    macHeartbeatStatus: extractMacHeartbeatStartHelperFromText(output, "MacHeartbeatStatus", "status", result.ok ? "codex-link-client" : "unavailable"),
    macHeartbeatStop: extractMacHeartbeatStartHelperFromText(output, "MacHeartbeatStop", "stop", result.ok ? "codex-link-client" : "unavailable"),
    macHeartbeatFreshness: extractMacHeartbeatFreshnessFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macHeartbeatHealth: extractMacHeartbeatHealthFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macCodexHealth: extractMacCodexHealthFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macPowerHealth: extractMacPowerHealthFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macUnattendedHealth: extractMacUnattendedHealthFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macEvidence: extractMacEvidenceFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    macReadyForRealTest: extractMacReadyForRealTestFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    windowsReverseGrantStatus: extractWindowsReverseGrantFromText(output, "WindowsReverseGrantStatus", "status", result.ok ? "codex-link-client" : "unavailable"),
    windowsOpenOneTimeReverseGrant: extractWindowsReverseGrantFromText(output, "WindowsOpenOneTimeReverseGrant", "grant", result.ok ? "codex-link-client" : "unavailable"),
    windowsReverseGrantStatusNodeFallback: extractWindowsReverseGrantFromText(output, "WindowsReverseGrantStatusNodeFallback", "status", result.ok ? "codex-link-client" : "unavailable"),
    windowsOpenOneTimeReverseGrantNodeFallback: extractWindowsReverseGrantFromText(output, "WindowsOpenOneTimeReverseGrantNodeFallback", "grant", result.ok ? "codex-link-client" : "unavailable"),
    windowsSecureAuthPath: extractWindowsSecureAuthPathFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    windowsLanRisk: extractWindowsLanRiskFromText(output, result.ok ? "codex-link-client" : "unavailable"),
    apiStateError: normalizedText(stateResult.error),
    error: result.ok ? "" : normalizedText(stateResult.error || result.error || result.stderr),
  };
}

function makePreflightArgs(args, windowsClientDiagnosticsPorts = null) {
  const preferredClientPorts = getPreferredWindowsClientDiagnosticsPorts(args, windowsClientDiagnosticsPorts);
  const child = [
    "scripts/windows/check-mac-formal-e2e.mjs",
    "--preflightOnly",
    "--json",
    "--timeoutMs", String(args.timeoutMs),
    "--discoverTimeoutMs", String(args.discoverTimeoutMs),
    "--port", String(args.port),
    "--clientPort", String(preferredClientPorts.clientPort),
    "--debugPort", String(preferredClientPorts.debugPort),
  ];
  if (args.discover) {
    child.push("--discover");
  }
  if (!args.discover || args.hostProvided || args.discoverNoLocalSubnets) {
    child.push("--host", args.host);
  }
  if (args.discoverNoLocalSubnets) {
    child.push("--discoverNoLocalSubnets");
  }
  if (args.checkClientDiagnostics) {
    child.push("--checkClientDiagnostics");
  }
  if (args.allowMockVideo) {
    child.push("--allowMockVideo");
  }
  if (args.skipAudio) {
    child.push("--skipAudio");
  }
  if (args.skipClipboard) {
    child.push("--skipClipboard");
  }
  if (args.skipFileClipboard) {
    child.push("--skipFileClipboard");
  }
  if (args.skipInputLog) {
    child.push("--skipInputLog");
  }
  return child;
}

function runFormalPreflight(args, windowsClientDiagnosticsPorts = null) {
  const childArgs = makePreflightArgs(args, windowsClientDiagnosticsPorts);
  const result = command(process.execPath, childArgs, {
    timeoutMs: Math.max(args.timeoutMs, args.checkClientDiagnostics ? 70000 : 15000),
  });
  let payload = null;
  let parseError = "";
  try {
    payload = JSON.parse(String(result.stdout || "").trim());
  } catch (error) {
    parseError = error.message;
  }
  return {
    requested: true,
    ok: result.ok,
    status: result.status,
    command: `node ${childArgs.join(" ")}`,
    payload,
    parseError,
    stdoutTail: tailLines(result.stdout),
    stderrTail: tailLines(result.stderr),
    error: normalizedText(result.error || result.stderr),
  };
}

function safeCommandLineSnippet(value) {
  let text = String(value || "").replace(/\s+/g, " ").trim();
  text = text.replace(/(LAN_DUAL_PASSWORD=)[^\s]+/gi, "$1<redacted>");
  text = text.replace(/(--password\s+)[^\s]+/gi, "$1<redacted>");
  text = text.replace(/(-Password\s+)[^\s]+/gi, "$1<redacted>");
  if (text.length > 220) {
    text = `${text.slice(0, 217)}...`;
  }
  return text;
}

function normalizePortOwner(owner) {
  const localPort = Number(owner?.localPort ?? owner?.LocalPort);
  return {
    localAddress: String(owner?.localAddress ?? owner?.LocalAddress ?? ""),
    localPort: Number.isFinite(localPort) ? localPort : null,
    state: String(owner?.state ?? owner?.State ?? ""),
    owningProcess: Number(owner?.owningProcess ?? owner?.OwningProcess ?? owner?.pid ?? 0) || null,
    processName: String(owner?.processName ?? owner?.Name ?? ""),
    commandLineSnippet: safeCommandLineSnippet(owner?.commandLine ?? owner?.CommandLine ?? ""),
  };
}

function isLikelyWindowsClientDiagnosticsOwner(owner, args) {
  const text = `${owner.processName || ""} ${owner.commandLineSnippet || ""}`
    .toLowerCase()
    .replace(/\//g, "\\");
  if (owner.localPort === args.clientPort) {
    return text.includes("apps\\windows-client\\server.mjs")
      && text.includes(String(args.clientPort));
  }
  if (owner.localPort === args.debugPort) {
    return text.includes(`--remote-debugging-port=${args.debugPort}`)
      && text.includes("lan-dual-edge");
  }
  return false;
}

function safePortOwnerToken(value, fallback = "unknown") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text.replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 64) || fallback;
}

function makePortOwnerSummary(owners) {
  const seen = new Set();
  const items = [];
  for (const owner of Array.isArray(owners) ? owners : []) {
    const port = Number(owner?.localPort);
    if (!Number.isFinite(port) || port <= 0) continue;
    const processName = safePortOwnerToken(owner?.processName || "unknown");
    const pid = Number(owner?.owningProcess);
    const pidText = Number.isFinite(pid) && pid > 0 ? String(pid) : "unknown";
    const item = `${port}:${processName}:${pidText}`;
    if (seen.has(item)) continue;
    seen.add(item);
    items.push({ port, item });
  }
  return items
    .sort((left, right) => left.port - right.port || left.item.localeCompare(right.item))
    .map((entry) => entry.item)
    .join(",");
}

function parseFakeWindowsClientPorts(args) {
  const raw = process.env.LAN_DUAL_FAKE_WINDOWS_CLIENT_PORTS_JSON;
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw);
    const owners = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.owners)
        ? payload.owners
        : payload?.owners
          ? [payload.owners]
          : [];
    return {
      source: "fake-env",
      ok: payload?.ok !== false,
      error: String(payload?.error || ""),
      owners: owners.map(normalizePortOwner),
    };
  } catch (error) {
    return {
      source: "fake-env",
      ok: false,
      error: `LAN_DUAL_FAKE_WINDOWS_CLIENT_PORTS_JSON parse failed: ${error.message}`,
      owners: [],
    };
  }
}

function queryWindowsClientPortOwners(args) {
  const fake = parseFakeWindowsClientPorts(args);
  if (fake) return fake;
  if (process.platform !== "win32") {
    return {
      source: "platform",
      ok: true,
      unsupported: true,
      error: "Windows TCP port inspection is only implemented on Windows.",
      owners: [],
    };
  }
  const ports = [args.clientPort, args.debugPort].map((port) => Number(port)).filter(Boolean).join(",");
  const ps = [
    `$ports = @(${ports})`,
    "$items = @()",
    "try {",
    "  $connections = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }",
    "  foreach ($conn in @($connections)) {",
    "    $proc = $null",
    "    try { $proc = Get-CimInstance Win32_Process -Filter \"ProcessId=$($conn.OwningProcess)\" -ErrorAction SilentlyContinue } catch {}",
    "    $items += [pscustomobject]@{",
    "      localAddress = [string] $conn.LocalAddress",
    "      localPort = [int] $conn.LocalPort",
    "      state = [string] $conn.State",
    "      owningProcess = [int] $conn.OwningProcess",
    "      processName = [string] $proc.Name",
    "      commandLine = [string] $proc.CommandLine",
    "    }",
    "  }",
    "  [pscustomobject]@{ ok = $true; owners = @($items) } | ConvertTo-Json -Compress -Depth 5",
    "} catch {",
    "  [pscustomobject]@{ ok = $false; error = $_.Exception.Message; owners = @() } | ConvertTo-Json -Compress -Depth 5",
    "}",
  ].join("\n");
  const result = command("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    ps,
  ], { timeoutMs: 7000 });
  if (!result.ok && !String(result.stdout || "").trim()) {
    return {
      source: "powershell",
      ok: false,
      error: normalizedText(result.error || result.stderr || `exit ${result.status}`),
      owners: [],
    };
  }
  try {
    const payload = JSON.parse(String(result.stdout || "").trim() || "{}");
    return {
      source: "powershell",
      ok: payload?.ok !== false,
      error: String(payload?.error || ""),
      owners: (
        Array.isArray(payload?.owners)
          ? payload.owners
          : payload?.owners
            ? [payload.owners]
            : []
      ).map(normalizePortOwner),
    };
  } catch (error) {
    return {
      source: "powershell",
      ok: false,
      error: error.message,
      owners: [],
      stdoutTail: tailLines(result.stdout, 4),
      stderrTail: tailLines(result.stderr, 4),
    };
  }
}

function inspectWindowsClientDiagnosticsPorts(args) {
  const query = queryWindowsClientPortOwners(args);
  const owners = query.owners.filter((owner) => owner.localPort === args.clientPort || owner.localPort === args.debugPort);
  const ports = [
    {
      name: "client",
      port: args.clientPort,
      occupied: owners.some((owner) => owner.localPort === args.clientPort),
    },
    {
      name: "debug",
      port: args.debugPort,
      occupied: owners.some((owner) => owner.localPort === args.debugPort),
    },
  ];
  const occupiedPorts = ports.filter((port) => port.occupied).map((port) => port.port);
  const staleOwners = owners.filter((owner) => isLikelyWindowsClientDiagnosticsOwner(owner, args));
  const state = query.unsupported
    ? "unsupported"
    : !query.ok
      ? "unknown"
      : occupiedPorts.length === 0
        ? "free"
        : staleOwners.length > 0
          ? "occupied-stale-diagnostics"
          : "occupied";
  const available = state === "free";
  const stale = state === "occupied-stale-diagnostics";
  const ownerSummary = makePortOwnerSummary(owners);
  const summary = state === "free"
    ? `free(${args.clientPort},${args.debugPort})`
    : state === "unsupported"
      ? `unsupported(${args.clientPort},${args.debugPort})`
      : state === "unknown"
        ? `unknown(${args.clientPort},${args.debugPort})`
        : `occupied(${occupiedPorts.join(",")}${stale ? ";stale-diagnostics" : ""})`;
  const recommendation = available
    ? "default Windows client diagnostics ports are free"
    : `use --clientPort ${args.alternateClientPort} --debugPort ${args.alternateDebugPort} for the next browser diagnostics/formal preflight, or close stale diagnostics processes you own`;
  return {
    requested: true,
    ok: true,
    source: query.source,
    state,
    available,
    staleDiagnostics: stale,
    clientPort: args.clientPort,
    debugPort: args.debugPort,
    alternateClientPort: args.alternateClientPort,
    alternateDebugPort: args.alternateDebugPort,
    occupiedPorts,
    ports,
    owners,
    ownerSummary,
    staleOwnerCount: staleOwners.length,
    summary,
    recommendation,
    error: query.error || "",
  };
}

function getPreferredWindowsClientDiagnosticsPorts(args, windowsClientDiagnosticsPorts = null) {
  const useAlternate = windowsClientDiagnosticsPorts?.requested && windowsClientDiagnosticsPorts.available === false;
  const clientPort = useAlternate
    ? Number(windowsClientDiagnosticsPorts.alternateClientPort || args.alternateClientPort)
    : Number(args.clientPort);
  const debugPort = useAlternate
    ? Number(windowsClientDiagnosticsPorts.alternateDebugPort || args.alternateDebugPort)
    : Number(args.debugPort);
  return {
    clientPort: clampInteger(clientPort, 1, 65535, defaults.clientPort),
    debugPort: clampInteger(debugPort, 1, 65535, defaults.debugPort),
    usingAlternate: Boolean(useAlternate),
    reason: useAlternate ? String(windowsClientDiagnosticsPorts.state || "unavailable") : "default",
  };
}

function makeWindowsSecureAuthPathCommand(port = 43770) {
  const safePort = clampInteger(port, 1, 65535, 43770);
  return `node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port ${safePort} --promptPassword --requirePassword`;
}

function makeWindowsFirewallStatusCommand(port = 43770) {
  const safePort = clampInteger(port, 1, 65535, 43770);
  return `node scripts/windows/check-windows-firewall.mjs --host 0.0.0.0 --port ${safePort} --json`;
}

function makeWindowsFirewallPreviewCommand(port = 43770) {
  const safePort = clampInteger(port, 1, 65535, 43770);
  return `node scripts/windows/check-windows-firewall.mjs --host 0.0.0.0 --port ${safePort} --dryRunRule --ruleProfile Private`;
}

function quoteCommandArg(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:=@-]+$/.test(text) ? text : JSON.stringify(text);
}

function makeAgentCallAckText(windowsSecureAuthPathCommand) {
  return [
    `WindowsSecureAuthPath 已提供：${windowsSecureAuthPathCommand}。`,
    "请 Mac 端/人工确认这条本机隐藏输入同一临时密码的安全认证路径；确认后再按需要清理 currentCall。",
    "不要在 Agent Link Board 发送密码/token/系统账号；不认证、不发送 input/inject。",
  ].join("");
}

function makeAgentCallAckCommand(server, windowsSecureAuthPathCommand) {
  const text = makeAgentCallAckText(windowsSecureAuthPathCommand);
  return [
    "node",
    "scripts/codex-link-client.mjs",
    "--server",
    server || defaults.server,
    "send",
    "--from",
    "Windows Codex",
    "--text",
    text,
  ].map(quoteCommandArg).join(" ");
}

function makeManualUxAckText(macManualUx) {
  const checklist = String(macManualUx?.checklist || "connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics");
  const target = String(macManualUx?.target || "unknown");
  return [
    "MAC_MANUAL_UX_CONFIRMED: WINDOWS_MANUAL_UX_ACK: Windows/User 确认可进入 5-10 分钟手工体验窗口；",
    `Target=${target}；Checklist=${checklist}；`,
    "按连接/画面/声音/剪贴板/文件/窗口/全屏/原画/复制诊断验收；",
    "不请求密码，不发送 input/inject。",
  ].join("");
}

function makeManualUxAckCommand(server, macManualUx) {
  const text = makeManualUxAckText(macManualUx);
  return [
    "node",
    "scripts/codex-link-client.mjs",
    "--server",
    server || defaults.server,
    "send",
    "--from",
    "Windows Codex",
    "--text",
    text,
  ].map(quoteCommandArg).join(" ");
}

function healthHasToken(health, token) {
  if (!health?.found) return false;
  const needle = String(token || "").toLowerCase();
  const values = [
    health.status,
    health.reason,
    ...(Array.isArray(health.blockers) ? health.blockers : []),
    ...(Array.isArray(health.warnings) ? health.warnings : []),
  ];
  return values.some((value) => String(value || "").toLowerCase() === needle);
}

function makeMacCodexStaleCallCommand(server) {
  return [
    "node",
    "scripts/codex-link-client.mjs",
    "--server",
    server || defaults.server,
    "call",
    "--from",
    "Windows Codex",
    "--need",
    "Mac Codex",
    "--goal",
    "Refresh Mac Codex heartbeat",
    "--ask",
    "请刷新或继续 Mac Codex，并重新上报 MacHeartbeat/ManualUx 状态；不要发送密码、密钥或系统账号。",
    "--timeout",
    "10m",
  ].map(quoteCommandArg).join(" ");
}

function makeMacCodexStaleAction(args, macHeartbeatHealth) {
  if (!healthHasToken(macHeartbeatHealth, "mac-codex-stale")) {
    return {
      found: false,
      status: "clear",
      reason: "not-stale",
      next: "",
      summary: "status=clear",
      callCommand: "",
    };
  }

  return {
    found: true,
    status: "blocked",
    reason: "mac-codex-stale",
    next: "RefreshAgentLinkBoardOrCallMacCodex",
    summary: "status=blocked reason=mac-codex-stale next=RefreshAgentLinkBoardOrCallMacCodex",
    callCommand: makeMacCodexStaleCallCommand(args.server),
  };
}

function makeMacManualUxAck(args, macManualUx) {
  if (!macManualUx?.found) {
    return {
      found: false,
      status: "not-needed",
      reason: "mac-manual-ux-not-found",
      summary: "",
      command: "",
    };
  }

  if (macManualUx.status !== "calling") {
    return {
      found: true,
      status: "not-needed",
      reason: `mac-manual-ux-${macManualUx.status || "unknown"}`,
      summary: "",
      command: "",
    };
  }

  const warnings = Array.isArray(macManualUx.warnings) ? macManualUx.warnings : [];

  const timedOut = macManualUx.manualUxCall === "timeout" ||
    macManualUx.next === "ReconfirmManualUxCall" ||
    warnings.includes("manual-ux-call-timeout");
  if (timedOut) {
    return {
      found: true,
      status: "blocked",
      reason: "manual-ux-call-timeout",
      next: "AskMacReconfirmManualUxCall",
      summary: "status=blocked reason=manual-ux-call-timeout next=AskMacReconfirmManualUxCall",
      command: "",
    };
  }
  if (macManualUx.gate && macManualUx.gate !== "clear") {
    return {
      found: true,
      status: "blocked",
      reason: "mac-manual-ux-gated",
      next: "WaitForManualUxGateClear",
      summary: `status=blocked reason=mac-manual-ux-gated gate=${macManualUx.gate} next=WaitForManualUxGateClear`,
      command: "",
    };
  }

  const activeCall = macManualUx.manualUxCall === "active" ||
    macManualUx.manualUxCall === "near-timeout" ||
    macManualUx.next === "WaitForManualUxConfirmation";
  if (!activeCall) {
    return {
      found: true,
      status: "blocked",
      reason: "manual-ux-call-state-unknown",
      next: "AskMacReconfirmManualUxCall",
      summary: "status=blocked reason=manual-ux-call-state-unknown next=AskMacReconfirmManualUxCall",
      command: "",
    };
  }

  const command = makeManualUxAckCommand(args.server, macManualUx);
  return {
    found: true,
    status: "ready",
    reason: "manual-ux-call-active",
    next: "SendManualUxAck",
    summary: `status=ready command=${command}`,
    command,
  };
}

function makeCommands(args, preflight, windowsClientDiagnosticsPorts = null) {
  const target = preflight.payload?.target || { host: args.host, port: args.port };
  const host = String(target.host || args.host);
  const port = Number(target.port || args.port);
  const preferredClientPorts = getPreferredWindowsClientDiagnosticsPorts(args, windowsClientDiagnosticsPorts);
  const runtimeBuildId = String(preflight.payload?.runtime?.buildId || "").trim();
  const windowsHostPort = 43770;
  const windowsSecureAuthPath = makeWindowsSecureAuthPathCommand(windowsHostPort);
  const windowsFirewallStatusBoardSummary = makeWindowsFirewallStatusCommand(windowsHostPort);
  const windowsFirewallPreviewBoardSummary = makeWindowsFirewallPreviewCommand(windowsHostPort);
  const macHostDiscoveryBoardSummary = makeMacHostDiscoveryCommand(args, preflight, host, port);
  const macHostDiscoveryPowerShellBoardSummary = makeMacHostDiscoveryPowerShellCommand(args, preflight, host, port);
  const macHostReadinessCommand = [
    "node scripts/mac/check-mac-host-readiness.mjs",
    "--host", host,
    "--port", String(port),
    "--checkBoard",
    "--boardSummary",
  ].join(" ");
  const macHeartbeatCommand = [
    "node scripts/mac/check-mac-heartbeat.mjs",
    "--host", host,
    "--port", String(port),
    "--server", args.server,
    "--checkBoard",
    "--boardSummary",
  ].join(" ");
  const macHeartbeatOnceCommand = [
    "node scripts/mac/watch-mac-heartbeat.mjs",
    "--once",
    "--sendStatus",
    "--host", "127.0.0.1",
    "--port", String(port),
    "--server", args.server,
    "--boardSummary",
  ].join(" ");
  const macHeartbeatWatchCommand = [
    "node scripts/mac/watch-mac-heartbeat.mjs",
    "--sendStatus",
    "--host", "127.0.0.1",
    "--port", String(port),
    "--server", args.server,
    "--intervalMs", "30000",
  ].join(" ");
  const macHeartbeatStartCommand = [
    "node scripts/mac/start-mac-heartbeat-watcher.mjs",
    "--host", "127.0.0.1",
    "--port", String(port),
    "--server", args.server,
    "--intervalMs", "30000",
    "--boardSummary",
  ].join(" ");
  const macHeartbeatStatusCommand = [
    "node scripts/mac/start-mac-heartbeat-watcher.mjs",
    "--status",
    "--host", "127.0.0.1",
    "--port", String(port),
    "--server", args.server,
    "--boardSummary",
  ].join(" ");
  const macHeartbeatStopCommand = [
    "node scripts/mac/start-mac-heartbeat-watcher.mjs",
    "--stop",
    "--host", "127.0.0.1",
    "--port", String(port),
    "--server", args.server,
    "--boardSummary",
  ].join(" ");
  const macFormalLocalSmokeCommand = [
    "node scripts/mac/check-mac-formal-local-smoke.mjs",
    "--host", host,
    "--port", String(port),
    "--promptPassword",
    "--boardSummary",
  ].join(" ");
  const macClientDiscoverWindowsCommand = [
    "node scripts/mac/discover-windows-hosts.mjs",
    "--checkBoard",
    "--boardSummary",
  ].join(" ");
  const macClientFormalChecklistCommand = [
    "node scripts/mac/check-mac-client-formal-status.mjs",
    "--discover",
    "--port", String(windowsHostPort),
    "--boardSummary",
  ].join(" ");
  const macRemoteAudioPlanCommand = "node scripts/mac/plan-mac-remote-audio.mjs --boardSummary";
  const macInputSafetyPlanCommand = "node scripts/mac/plan-mac-input-safety.mjs --boardSummary";
  const macManualUxStatusCommand = "node scripts/mac/check-mac-manual-ux-status.mjs --boardSummary";
  const macClientFormalSmokeCommand = [
    "node scripts/mac/run-mac-client-formal-smoke.mjs",
    "--discover",
    "--ensureClient",
    "--preflightOnly",
    "--boardSummary",
  ].join(" ");
  const macClientManualChecklistCommand = macClientManualChecklistAction;
  const macClientPasswordLocationCommand = macClientPasswordLocationAction;
  const macUnattendedStatusCommand = [
    "node scripts/mac/check-mac-unattended-status.mjs",
    "--host", host,
    "--port", String(port),
    "--boardSummary",
  ].join(" ");
  const macUnattendedFormalStatusCommand = [
    "node scripts/mac/check-mac-unattended-status.mjs",
    "--host", host,
    "--port", String(port),
    "--requireLaunchAgentMaxFps",
    "--requireLaunchAgentLoaded",
    "--boardSummary",
  ].join(" ");
  const formalChecklistBoardSummary = [
    "pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-mac-formal-e2e.ps1",
    "-Discover",
    "-DiscoverNoLocalSubnets",
    "-HostName", host,
    "-Port", String(port),
    "-ClientPort", String(preferredClientPorts.clientPort),
    "-DebugPort", String(preferredClientPorts.debugPort),
    "-PreflightOnly",
    "-CheckClientDiagnostics",
    "-BoardSummary",
  ].join(" ");
  const windowsClientDiagnosticsCommand = [
    "node scripts/windows/test-windows-client-browser.mjs",
    "--discover",
    "--discoverNoLocalSubnets",
    "--host", host,
    "--port", String(port),
    "--clientPort", String(args.clientPort),
    "--debugPort", String(args.debugPort),
    "--diagnosticsOnly",
    "--boardSummary",
    "--timeoutMs", "45000",
  ];
  const windowsClientDiagnosticsAlternateCommand = [
    "node scripts/windows/test-windows-client-browser.mjs",
    "--discover",
    "--discoverNoLocalSubnets",
    "--host", host,
    "--port", String(port),
    "--clientPort", String(args.alternateClientPort),
    "--debugPort", String(args.alternateDebugPort),
    "--diagnosticsOnly",
    "--boardSummary",
    "--timeoutMs", "45000",
  ];
  const windowsClientRetestBoardSummaryCommand = [
    "node scripts/windows/test-windows-client-browser.mjs",
    "--discover",
    "--discoverNoLocalSubnets",
    "--host", host,
    "--port", String(port),
    "--clientPort", String(args.clientPort),
    "--debugPort", String(args.debugPort),
    "--promptPassword",
    "--requirePassword",
    "--requireH264",
    "--boardSummary",
    "--timeoutMs", "45000",
  ];
  if (runtimeBuildId && !/\s/.test(runtimeBuildId)) {
    windowsClientDiagnosticsCommand.push("--expectDiscoveryRuntimeBuildId", runtimeBuildId);
    windowsClientDiagnosticsAlternateCommand.push("--expectDiscoveryRuntimeBuildId", runtimeBuildId);
    windowsClientRetestBoardSummaryCommand.push("--expectDiscoveryRuntimeBuildId", runtimeBuildId);
  }
  const windowsClientDiagnosticsPowerShellCommand = [
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-client-browser.ps1",
    "-Discover",
    "-DiscoverNoLocalSubnets",
    "-HostName", host,
    "-Port", String(port),
    "-ClientPort", String(args.clientPort),
    "-DebugPort", String(args.debugPort),
    "-DiagnosticsOnly",
    "-BoardSummary",
    "-TimeoutMs", "45000",
  ];
  const windowsClientDiagnosticsAlternatePowerShellCommand = [
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-client-browser.ps1",
    "-Discover",
    "-DiscoverNoLocalSubnets",
    "-HostName", host,
    "-Port", String(port),
    "-ClientPort", String(args.alternateClientPort),
    "-DebugPort", String(args.alternateDebugPort),
    "-DiagnosticsOnly",
    "-BoardSummary",
    "-TimeoutMs", "45000",
  ];
  const windowsClientRetestBoardSummaryPowerShellCommand = [
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-windows-client-browser.ps1",
    "-Discover",
    "-DiscoverNoLocalSubnets",
    "-HostName", host,
    "-Port", String(port),
    "-ClientPort", String(args.clientPort),
    "-DebugPort", String(args.debugPort),
    "-PromptPassword",
    "-RequirePassword",
    "-RequireH264",
    "-BoardSummary",
    "-TimeoutMs", "45000",
  ];
  if (runtimeBuildId && !/\s/.test(runtimeBuildId)) {
    windowsClientDiagnosticsPowerShellCommand.push("-ExpectDiscoveryRuntimeBuildId", runtimeBuildId);
    windowsClientDiagnosticsAlternatePowerShellCommand.push("-ExpectDiscoveryRuntimeBuildId", runtimeBuildId);
    windowsClientRetestBoardSummaryPowerShellCommand.push("-ExpectDiscoveryRuntimeBuildId", runtimeBuildId);
  }
  return {
    server: args.server,
    resumeBoardSummary: "node scripts/windows/check-windows-resume-status.mjs --checkBoard --boardSummary",
    macHostDiscoveryBoardSummary,
    macHostDiscoveryPowerShellBoardSummary,
    macHostReadinessCommand,
    macHeartbeatCommand,
    macHeartbeatOnceCommand,
    macHeartbeatWatchCommand,
    macHeartbeatStartCommand,
    macHeartbeatStatusCommand,
    macHeartbeatStopCommand,
    macFormalLocalSmokeCommand,
    macClientDiscoverWindowsCommand,
    macClientFormalChecklistCommand,
    macClientFormalSmokeCommand,
    macClientManualChecklistAction: macClientManualChecklistCommand,
    macClientPasswordLocationAction: macClientPasswordLocationCommand,
    macRemoteAudioPlanCommand,
    macInputSafetyPlanCommand,
    macManualUxStatusCommand,
    macUnattendedStatusCommand,
    macUnattendedFormalStatusCommand,
    formalChecklistBoardSummary,
    preflightBoardSummary: [
      "pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-mac-formal-e2e.ps1",
      "-Discover",
      "-ClientPort", String(preferredClientPorts.clientPort),
      "-DebugPort", String(preferredClientPorts.debugPort),
      "-PreflightOnly",
      "-CheckClientDiagnostics",
      "-BoardSummary",
    ].join(" "),
    userAuthRequest: [
      "pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-mac-formal-e2e.ps1",
      "-Discover",
      "-ClientPort", String(preferredClientPorts.clientPort),
      "-DebugPort", String(preferredClientPorts.debugPort),
      "-PreflightOnly",
      "-CheckClientDiagnostics",
      "-UserAuthRequest",
    ].join(" "),
    formalRun: [
      "pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-mac-formal-e2e.ps1",
      "-Discover",
      "-ClientPort", String(preferredClientPorts.clientPort),
      "-DebugPort", String(preferredClientPorts.debugPort),
      "-PromptPassword",
    ].join(" "),
    formalRunFixedTarget: [
      "pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-mac-formal-e2e.ps1",
      "-Discover",
      "-DiscoverNoLocalSubnets",
      "-HostName", host,
      "-Port", String(port),
      "-ClientPort", String(preferredClientPorts.clientPort),
      "-DebugPort", String(preferredClientPorts.debugPort),
      "-PromptPassword",
    ].join(" "),
    windowsHostMediaReadinessBoardSummary: [
      "node scripts/windows/check-windows-host-readiness.mjs",
      "--checkBoard",
      "--probeMedia",
      "--boardSummary",
    ].join(" "),
    windowsSecureAuthPath,
    windowsFirewallStatusBoardSummary,
    windowsFirewallPreviewBoardSummary,
    windowsHostMediaReadinessPowerShellBoardSummary: [
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-host-readiness.ps1",
      "-CheckBoard",
      "-ProbeMedia",
      "-BoardSummary",
    ].join(" "),
    windowsVideoEncoderSupportBoardSummary: [
      "node scripts/windows/check-windows-video-encoder-support.mjs",
      "--boardSummary",
    ].join(" "),
    windowsVideoEncoderSupportPowerShellBoardSummary: [
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-video-encoder-support.ps1",
      "-BoardSummary",
    ].join(" "),
    windowsWgcSupportBoardSummary: [
      "node scripts/windows/check-windows-wgc-support.mjs",
      "--boardSummary",
    ].join(" "),
    windowsWgcSupportPowerShellBoardSummary: [
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-wgc-support.ps1",
      "-BoardSummary",
    ].join(" "),
    windowsWgcBenchmarkBoardSummary: [
      "node scripts/windows/benchmark-windows-wgc-settings.mjs",
      "--profile", "60:20000:balanced",
      "--durationMs", "1800",
      "--boardSummary",
    ].join(" "),
    windowsWgcBenchmarkPowerShellBoardSummary: [
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/benchmark-windows-wgc-settings.ps1",
      "-Profile", "60:20000:balanced",
      "-DurationMs", "1800",
      "-BoardSummary",
    ].join(" "),
    windowsWgcH264SourceCompareBoardSummary: [
      "node scripts/windows/compare-windows-wgc-h264-sources.mjs",
      "--profile", "60:20000:balanced",
      "--durationMs", "1800",
      "--boardSummary",
    ].join(" "),
    windowsWgcH264SourceComparePowerShellBoardSummary: [
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/compare-windows-wgc-h264-sources.ps1",
      "-Profile", "60:20000:balanced",
      "-DurationMs", "1800",
      "-BoardSummary",
    ].join(" "),
    windowsWebCodecsH264BoardSummary: [
      "node scripts/windows/check-webcodecs-h264-support.mjs",
      "--requireCodec", "avc1.42C02A",
      "--boardSummary",
    ].join(" "),
    windowsWebCodecsH264PowerShellBoardSummary: [
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-webcodecs-h264-support.ps1",
      "-RequireCodec", "avc1.42C02A",
      "-BoardSummary",
    ].join(" "),
    windowsPowerShellHelpBoardSummary: [
      "node scripts/windows/test-windows-powershell-help.mjs",
      "--timeoutMs", "10000",
      "--boardSummary",
    ].join(" "),
    windowsPowerShell7HelpBoardSummary: [
      "node scripts/windows/test-windows-powershell-help.mjs",
      "--shell", "pwsh",
      "--timeoutMs", "10000",
      "--boardSummary",
    ].join(" "),
    windowsReverseControlGrantBoardSummary: [
      "node scripts/windows/allow-windows-reverse-control.mjs",
      "--host", "127.0.0.1",
      "--port", String(windowsHostPort),
      "--durationMs", "30000",
      "--boardSummary",
    ].join(" "),
    windowsReverseControlGrantPowerShellBoardSummary: [
      "pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1",
      "-HostName", "127.0.0.1",
      "-Port", String(windowsHostPort),
      "-DurationMs", "30000",
      "-BoardSummary",
    ].join(" "),
    windowsReverseGrantStatusBoardSummary: [
      "node scripts/windows/allow-windows-reverse-control.mjs",
      "--host", "127.0.0.1",
      "--port", String(windowsHostPort),
      "--status",
      "--boardSummary",
    ].join(" "),
    windowsReverseGrantStatusPowerShellBoardSummary: [
      "pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1",
      "-HostName", "127.0.0.1",
      "-Port", String(windowsHostPort),
      "-Status",
      "-BoardSummary",
    ].join(" "),
    windowsOpenOneTimeReverseGrantBoardSummary: [
      "node scripts/windows/allow-windows-reverse-control.mjs",
      "--host", "127.0.0.1",
      "--port", String(windowsHostPort),
      "--grant",
      "--durationMs", "30000",
      "--boardSummary",
    ].join(" "),
    windowsOpenOneTimeReverseGrantPowerShellBoardSummary: [
      "pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1",
      "-HostName", "127.0.0.1",
      "-Port", String(windowsHostPort),
      "-Grant",
      "-DurationMs", "30000",
      "-BoardSummary",
    ].join(" "),
    windowsClientRetestUserEntryCommand,
    windowsClientRetestAndPostUserEntryCommand,
    windowsClientRetestBoardSummaryCommand: windowsClientRetestBoardSummaryCommand.join(" "),
    windowsClientRetestBoardSummaryPowerShellCommand: windowsClientRetestBoardSummaryPowerShellCommand.join(" "),
    windowsClientDiagnosticsCommand: windowsClientDiagnosticsCommand.join(" "),
    windowsClientDiagnosticsPowerShellCommand: windowsClientDiagnosticsPowerShellCommand.join(" "),
    windowsClientDiagnosticsAlternateCommand: windowsClientDiagnosticsAlternateCommand.join(" "),
    windowsClientDiagnosticsAlternatePowerShellCommand: windowsClientDiagnosticsAlternatePowerShellCommand.join(" "),
    windowsClientCopyDiagnosticsAction: "Windows 控制端事件面板点击“复制诊断”，先看“快速摘要”。",
    windowsMacAlertWatcherStart: [
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-mac-alert-watcher.ps1",
      "-Server", args.server,
    ].join(" "),
    windowsMacAlertWatcherStatus: [
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-mac-alert-watcher.ps1",
      "-Server", args.server,
      "-Status",
    ].join(" "),
  };
}

function makeMacHostDiscoveryCommand(args, preflight, host, port) {
  const commandParts = [
    "node scripts/windows/discover-lan-hosts.mjs",
    "--requireMacHost",
    "--boardSummary",
  ];
  const hasOnlineTarget = Boolean(preflight.payload?.online && preflight.payload?.target?.host);
  const hasExplicitTarget = args.hostProvided || args.discoverNoLocalSubnets || !args.discover;
  if (hasOnlineTarget || hasExplicitTarget) {
    commandParts.splice(1, 0, "--noLocalSubnets", "--host", host, "--port", String(port));
  }
  return commandParts.join(" ");
}

function makeMacHostDiscoveryPowerShellCommand(args, preflight, host, port) {
  const commandParts = [
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/discover-lan-hosts.ps1",
    "-RequireMacHost",
    "-BoardSummary",
  ];
  const hasOnlineTarget = Boolean(preflight.payload?.online && preflight.payload?.target?.host);
  const hasExplicitTarget = args.hostProvided || args.discoverNoLocalSubnets || !args.discover;
  if (hasOnlineTarget || hasExplicitTarget) {
    commandParts.splice(1, 0, "-NoLocalSubnets", "-HostName", host, "-Port", String(port));
  }
  return commandParts.join(" ");
}

function makeFormalManualChecklist(mac, commands) {
  const items = Array.isArray(mac?.runPlan?.manualChecklist)
    ? mac.runPlan.manualChecklist
    : [];
  const ids = items
    .map((item) => normalizedText(item?.id))
    .filter(Boolean);
  const fallbackIds = ["connection", "video", "audio", "clipboard", "input_ack", "diagnostics"];
  const effectiveIds = ids.length > 0 ? ids : fallbackIds;
  return {
    fromPreflight: ids.length > 0,
    ids: effectiveIds,
    summary: effectiveIds.join("/"),
    command: commands.formalChecklistBoardSummary,
  };
}

function getWindowsMacAlertWatcherStatus(args, commands) {
  const result = command("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "scripts/windows/start-mac-alert-watcher.ps1",
    "-Server", args.server,
    "-Status",
    "-Json",
  ], { timeoutMs: Math.min(Math.max(args.timeoutMs, 5000), 15000) });
  const combined = `${result.stdout}\n${result.stderr}`;
  const lines = splitLines(combined);
  let payload = null;
  let parseError = "";
  try {
    payload = JSON.parse(String(result.stdout || "").trim());
  } catch (error) {
    parseError = error.message;
  }
  let source = payload && typeof payload === "object" ? "json" : "text";
  let running = typeof payload?.running === "boolean" ? payload.running : null;
  if (running === null) {
    if (lines.some((line) => /Mac alert watcher is running\./i.test(line))) {
      running = true;
    } else if (lines.some((line) => /Mac alert watcher is not running\./i.test(line))) {
      running = false;
    }
  }
  const state = running === true
    ? "running"
    : running === false
      ? "not-running"
      : result.ok
        ? "unknown"
        : "unavailable";
  return {
    requested: true,
    ok: result.ok,
    running,
    state,
    source,
    payload,
    parseError,
    command: commands.windowsMacAlertWatcherStatus,
    status: result.status,
    signal: result.signal,
    stdoutTail: tailLines(result.stdout, 8),
    stderrTail: tailLines(result.stderr, 4),
    error: normalizedText(result.error || result.stderr),
  };
}

function makeBoardSummary(report) {
  const mac = report.macPreflight?.payload || {};
  const failedChecks = Array.isArray(mac.failedChecks) && mac.failedChecks.length > 0
    ? mac.failedChecks.map((check) => check.name).join(",")
    : "none";
  const target = mac.target
    ? `${mac.target.host}:${mac.target.port}`
    : `${report.args.host}:${report.args.port}`;
  const macState = mac.online
    ? mac.ok
      ? "ready"
      : `blocked(${failedChecks})`
    : "offline";
  const board = report.board.requested
    ? report.board.ok
      ? "ok"
      : "failed"
    : "skipped";
  const boardCall = report.board.currentCall?.active
    ? `; call=${report.board.currentCall.summary}`
    : "";
  const boardCallNext = report.board.currentCall?.active && report.board.currentCall.next
    ? `; AgentCallNext=${report.board.currentCall.next}`
    : "";
  const boardCallAck = report.board.currentCall?.active && report.board.currentCall.agentCallAckCommand
    ? `; AgentCallAck=${report.board.currentCall.agentCallAckCommand}`
    : "";
  const presence = report.board.userPresence || emptyUserPresence("none");
  const git = report.git.ok
    ? report.git.clean
      ? "clean"
      : `dirty(${report.git.changeCount})`
    : "unknown";
  const runtime = mac.runtime?.buildId || "unknown";
  const inputMode = mac.capabilities?.inputMode || "unknown";
  const clientDiagnostics = mac.clientDiagnostics?.requested
    ? mac.clientDiagnostics.ok
      ? "passed"
      : "failed"
    : "skipped";
  const clientPorts = report.windowsClientDiagnosticsPorts?.summary || "unknown";
  const clientPortsNext = report.windowsClientDiagnosticsPorts?.available
    ? "default-ok"
    : `use --clientPort ${report.windowsClientDiagnosticsPorts?.alternateClientPort || defaults.alternateClientPort} --debugPort ${report.windowsClientDiagnosticsPorts?.alternateDebugPort || defaults.alternateDebugPort}`;
  const clientPortOwners = report.windowsClientDiagnosticsPorts?.ownerSummary
    ? ` WinClientPortsOwners=${report.windowsClientDiagnosticsPorts.ownerSummary}.`
    : "";
  const macFormalLocalSmokeCommand = report.board.macFormalLocalSmoke?.command || report.commands.macFormalLocalSmokeCommand;
  const macClientDiscoverWindowsCommand = report.board.macClientDiscoverWindows?.command || report.commands.macClientDiscoverWindowsCommand;
  const macClientFormalChecklistCommand = report.board.macClientFormalChecklist?.command || report.commands.macClientFormalChecklistCommand;
  const macClientFormalSmokeCommand = report.board.macClientFormalSmoke?.command || report.commands.macClientFormalSmokeCommand;
  const macClientManualChecklistActionText = report.board.macClientManualChecklist?.action || report.commands.macClientManualChecklistAction;
  const macClientPasswordLocationActionText = report.board.macClientPasswordLocation?.action || report.commands.macClientPasswordLocationAction;
  const macRemoteAudioPlanCommand = report.board.macRemoteAudioPlan?.command || report.commands.macRemoteAudioPlanCommand;
  const macInputSafetyPlanCommand = report.board.macInputSafetyPlan?.command || report.commands.macInputSafetyPlanCommand;
  const macManualUxStatusCommand = report.board.macManualUxStatus?.command || report.commands.macManualUxStatusCommand;
  const macHeartbeatOnceCommand = report.board.macHeartbeatOnce?.command || report.commands.macHeartbeatOnceCommand;
  const macHeartbeatWatchCommand = report.board.macHeartbeatWatch?.command || report.commands.macHeartbeatWatchCommand;
  const macHeartbeatStartCommand = report.board.macHeartbeatStart?.command || report.commands.macHeartbeatStartCommand;
  const macHeartbeatStatusCommand = report.board.macHeartbeatStatus?.command || report.commands.macHeartbeatStatusCommand;
  const macHeartbeatStopCommand = report.board.macHeartbeatStop?.command || report.commands.macHeartbeatStopCommand;
  const windowsReverseGrantStatusCommand = report.board.windowsReverseGrantStatus?.command || report.commands.windowsReverseGrantStatusPowerShellBoardSummary;
  const windowsOpenOneTimeReverseGrantCommand = report.board.windowsOpenOneTimeReverseGrant?.command || report.commands.windowsOpenOneTimeReverseGrantPowerShellBoardSummary;
  const windowsReverseGrantStatusNodeCommand = report.board.windowsReverseGrantStatusNodeFallback?.command || report.commands.windowsReverseGrantStatusBoardSummary;
  const windowsOpenOneTimeReverseGrantNodeCommand = report.board.windowsOpenOneTimeReverseGrantNodeFallback?.command || report.commands.windowsOpenOneTimeReverseGrantBoardSummary;
  const windowsSecureAuthPathCommand = report.board.windowsSecureAuthPath?.command || report.commands.windowsSecureAuthPath;
  return [
    `Windows resume: repo=${git}; head=${report.git.currentBuildId || "unknown"}; board=${board}${boardCall}${boardCallNext}${boardCallAck}; mac=${macState}; target=${target}; runtimeBuild=${runtime}; inputMode=${inputMode}; clientDiagnostics=${clientDiagnostics}; failedChecks=${failedChecks}.`,
    `WinClientPorts=${clientPorts}; WinClientPortsNext=${clientPortsNext}.${clientPortOwners}`,
    ...(presence.found
      ? [`UserPresence=${presence.status} source=${presence.source}${presence.updatedAt ? ` updatedAt=${presence.updatedAt}` : ""}.`, `UserPresenceAction=${presence.action}${presence.blocker ? ` blocker=${presence.blocker}` : ""}.`]
      : []),
    ...(report.board.windowsLanRisk?.found
      ? [`WindowsLanRisk=${report.board.windowsLanRisk.summary}.`]
      : []),
    ...makePrimaryNextSegments(report, mac),
    `MacDiscovery=${report.commands.macHostDiscoveryBoardSummary}.`,
    `MacDiscoveryPs=${report.commands.macHostDiscoveryPowerShellBoardSummary}.`,
    `MacHostReadiness=${report.commands.macHostReadinessCommand}.`,
    `MacHeartbeat=${report.commands.macHeartbeatCommand}.`,
    ...(report.board.macHeartbeatFreshness?.present
      ? [`MacHeartbeatFreshness=${report.board.macHeartbeatFreshness.summary}.`]
      : []),
    ...(report.board.macHeartbeatHealth?.found
      ? [`MacHeartbeatHealth=${report.board.macHeartbeatHealth.summary}.`]
      : []),
    ...(report.board.macCodexStaleAction?.found
      ? [
        `MacCodexStaleAction=${report.board.macCodexStaleAction.summary}.`,
        `MacCodexStaleCall=${report.board.macCodexStaleAction.callCommand}.`,
      ]
      : []),
    ...(report.board.macCodexHealth?.found
      ? [`MacCodexHealth=${report.board.macCodexHealth.summary}.`]
      : []),
    ...(report.board.macPowerHealth?.found
      ? [`MacPowerHealth=${report.board.macPowerHealth.summary}.`]
      : []),
    ...(report.board.macUnattendedHealth?.found
      ? [`MacUnattendedHealth=${report.board.macUnattendedHealth.summary}.`]
      : []),
    ...(report.board.macEvidence?.found
      ? [`MacEvidence=${report.board.macEvidence.summary}.`]
      : []),
    ...(report.board.macReadyForRealTest?.found
      ? [`MacReadyForRealTest=${report.board.macReadyForRealTest.summary}.`]
      : []),
    `MacHeartbeatOnce=${macHeartbeatOnceCommand}.`,
    `MacHeartbeatWatch=${macHeartbeatWatchCommand}.`,
    `MacHeartbeatStart=${macHeartbeatStartCommand}.`,
    `MacHeartbeatStatus=${macHeartbeatStatusCommand}.`,
    `MacHeartbeatStop=${macHeartbeatStopCommand}.`,
    `MacFormalLocalSmoke=${macFormalLocalSmokeCommand}.`,
    `MacClientDiscoverWindows=${macClientDiscoverWindowsCommand}.`,
    `MacClientFormalChecklist=${macClientFormalChecklistCommand}.`,
    `MacClientFormalSmoke=${macClientFormalSmokeCommand}.`,
    `MacClientManualChecklist=${macClientManualChecklistActionText}.`,
    `MacClientPasswordLocation=${macClientPasswordLocationActionText}.`,
    `MacRemoteAudioPlan=${macRemoteAudioPlanCommand}.`,
    ...(report.board.macRemoteAudio?.found
      ? [`MacRemoteAudio=${report.board.macRemoteAudio.summary}.`]
      : []),
    `MacInputSafetyPlan=${macInputSafetyPlanCommand}.`,
    `MacManualUxStatus=${macManualUxStatusCommand}.`,
    ...(report.board.macManualUx?.found
      ? [`MacManualUx=${report.board.macManualUx.summary}.`]
      : []),
    ...(report.board.macManualUx?.manualUxReconfirmCommand
      ? [`MacManualUxReconfirm=${report.board.macManualUx.manualUxReconfirmCommand}.`]
      : []),
    ...(report.board.macManualUxAck?.status === "ready" && report.board.macManualUxAck.command
      ? [`MacManualUxAck=${report.board.macManualUxAck.command}.`]
      : []),
    ...(report.board.macManualUxAck?.status === "blocked" && report.board.macManualUxAck.summary
      ? [`MacManualUxAck=${report.board.macManualUxAck.summary}.`]
      : []),
    ...(report.board.macInputSafety?.found
      ? [`MacInputSafety=${report.board.macInputSafety.summary}.`]
      : []),
    ...(report.board.macInputSafetyStatus?.found
      ? [`MacInputSafetyStatus=${report.board.macInputSafetyStatus.summary}.`]
      : []),
    ...(report.board.macInputSafetyUserNotice?.found
      ? [`MacInputSafetyUserNotice=${report.board.macInputSafetyUserNotice.summary}.`]
      : []),
    `MacUnattended=${report.commands.macUnattendedStatusCommand}.`,
    `MacUnattendedFormal=${report.commands.macUnattendedFormalStatusCommand}.`,
    ...(report.board.macHostSafeStart?.command ? [`MacHostSafeStart=${report.board.macHostSafeStart.command}.`] : []),
    ...(report.board.macMaxFpsSafeStart?.command ? [`MacMaxFpsSafeStart=${report.board.macMaxFpsSafeStart.command}.`] : []),
    `FormalChecklist=${report.commands.formalChecklistBoardSummary}; ManualChecklist=${report.formalManualChecklist.summary}.`,
    `WinClientRetestEntry=${report.commands.windowsClientRetestUserEntryCommand}; WinClientRetestAndPostEntry=${report.commands.windowsClientRetestAndPostUserEntryCommand}; WinClientRetest=${report.commands.windowsClientRetestBoardSummaryCommand}; WinClientRetestPs=${report.commands.windowsClientRetestBoardSummaryPowerShellCommand}.`,
    `WinClientDiagnostics=${report.commands.windowsClientDiagnosticsCommand}; WinClientDiagnosticsPs=${report.commands.windowsClientDiagnosticsPowerShellCommand}; CopyDiagnostics=${report.commands.windowsClientCopyDiagnosticsAction}`,
    `WinClientDiagnosticsAlt=${report.commands.windowsClientDiagnosticsAlternateCommand}; WinClientDiagnosticsAltPs=${report.commands.windowsClientDiagnosticsAlternatePowerShellCommand}.`,
    `WindowsHostMedia=${report.commands.windowsHostMediaReadinessBoardSummary}.`,
    `WindowsHostMediaPs=${report.commands.windowsHostMediaReadinessPowerShellBoardSummary}.`,
    `WindowsVideoSupport=${report.commands.windowsVideoEncoderSupportBoardSummary}.`,
    `WindowsVideoSupportPs=${report.commands.windowsVideoEncoderSupportPowerShellBoardSummary}.`,
    `WindowsWgcSupport=${report.commands.windowsWgcSupportBoardSummary}.`,
    `WindowsWgcSupportPs=${report.commands.windowsWgcSupportPowerShellBoardSummary}.`,
    `WindowsWgcBenchmark=${report.commands.windowsWgcBenchmarkBoardSummary}.`,
    `WindowsWgcBenchmarkPs=${report.commands.windowsWgcBenchmarkPowerShellBoardSummary}.`,
    `WindowsWgcCompare=${report.commands.windowsWgcH264SourceCompareBoardSummary}.`,
    `WindowsWgcComparePs=${report.commands.windowsWgcH264SourceComparePowerShellBoardSummary}.`,
    `WindowsWebCodecs=${report.commands.windowsWebCodecsH264BoardSummary}.`,
    `WindowsWebCodecsPs=${report.commands.windowsWebCodecsH264PowerShellBoardSummary}.`,
    `PowerShellHelp=${report.commands.windowsPowerShellHelpBoardSummary}.`,
    `PowerShellHelpPwsh=${report.commands.windowsPowerShell7HelpBoardSummary}.`,
    `WindowsReverseGrantStatus=${windowsReverseGrantStatusCommand}.`,
    `WindowsOpenOneTimeReverseGrant=${windowsOpenOneTimeReverseGrantCommand}.`,
    `WindowsReverseGrantStatusNodeFallback=${windowsReverseGrantStatusNodeCommand}.`,
    `WindowsOpenOneTimeReverseGrantNodeFallback=${windowsOpenOneTimeReverseGrantNodeCommand}.`,
    `WindowsSecureAuthPath=${windowsSecureAuthPathCommand}.`,
    `WindowsFirewallStatus=${report.commands.windowsFirewallStatusBoardSummary}.`,
    `WindowsFirewallPreview=${report.commands.windowsFirewallPreviewBoardSummary}.`,
    `ReverseGrant=${report.commands.windowsReverseControlGrantBoardSummary}.`,
    `ReverseGrantPs=${report.commands.windowsReverseControlGrantPowerShellBoardSummary}.`,
    "No password was requested or sent; no WebSocket auth/input/inject was performed.",
  ].join(" ");
}

function makeUserAuthRequest(report) {
  if (isPostPassCurrentCall(report.board?.currentCall)) {
    return [
      "NO_USER_AUTH: 当前 Agent Link Board 已进入 REAL_TEST_PASS 后续分工。",
      "Windows 端应记录 PASS 并排查尾部 NativeCommandFailed；Mac 端保持值守等待用户在场手工体验测试。",
      "不要回旧 formal E2E 第二步，不要再次请求或发送密码。",
    ].join(" ");
  }
  const mac = report.macPreflight?.payload;
  if (mac?.ok) {
    const target = mac.target
      ? `${mac.target.host}:${mac.target.port}`
      : `${report.args.host}:${report.args.port}`;
    return [
      `NEED_USER_AUTH: 正式 Mac 端到端验收需要你在 Windows 本机隐藏输入 Mac host 正式密码，target=${target}。`,
      `位置/步骤：在 ${repoRoot.replace(/[\\/]+$/, "")} 运行 ${report.commands.formalRunFixedTarget}。`,
      "不要把密码发到联络板；本命令默认不执行 inject，inject 仍需你另行明确确认。",
      "处理后请回复 已输入密码并开始验收。",
    ].join(" ");
  }

  const preflightRequest = normalizedText(report.macPreflight?.payload?.userAuthRequest);
  if (preflightRequest) return preflightRequest;

  const target = report.macPreflight?.payload?.target
    ? `${report.macPreflight.payload.target.host}:${report.macPreflight.payload.target.port}`
    : `${report.args.host}:${report.args.port}`;
  const detail = report.macPreflight?.parseError || report.macPreflight?.error || "preflight unavailable";
  return [
    `NEED_USER_AUTH: 暂时不要输入正式密码，Windows 侧恢复总览尚未拿到可用 formal preflight，target=${target}。`,
    `位置/步骤：先处理预检问题后重跑 ${report.commands.preflightBoardSummary}。`,
    `当前细节：${detail}。密码不要发到联络板；inject 仍需用户另行明确确认。`,
  ].join(" ");
}

function sendUserAuthRequest(args, report) {
  if (!args.sendUserAuthRequest) {
    return {
      requested: false,
      ok: null,
      status: null,
      error: "",
      detail: "not requested",
    };
  }

  if (isPostPassCurrentCall(report.board?.currentCall)) {
    return {
      requested: true,
      ok: false,
      status: null,
      error: "",
      detail: "REAL_TEST_PASS post-pass currentCall does not require a user auth request; nothing was sent.",
    };
  }

  if (!report.macPreflight?.payload?.ok) {
    return {
      requested: true,
      ok: false,
      status: null,
      error: "",
      detail: "Mac formal preflight is not ready; user auth request was not sent.",
    };
  }

  const result = command(process.execPath, [
    "scripts/codex-link-client.mjs",
    "--server", args.server,
    "send",
    "--from", "Windows Codex",
    "--text", report.userAuthRequest,
  ], { timeoutMs: Math.min(Math.max(args.timeoutMs, 5000), 30000) });
  return {
    requested: true,
    ok: result.ok,
    status: result.status,
    error: normalizedText(result.error || result.stderr),
    detail: result.ok ? "sent" : normalizedText(result.error || result.stderr || `exit ${result.status}`),
  };
}

function sendAgentCallAck(args, report) {
  if (!args.sendAgentCallAck) {
    return {
      requested: false,
      ok: null,
      status: null,
      error: "",
      detail: "not requested",
    };
  }

  const currentCall = report.board?.currentCall;
  if (!currentCall?.active || !currentCall.secureAuthPathReady || !currentCall.agentCallAckCommand) {
    return {
      requested: true,
      ok: false,
      status: null,
      error: "",
      detail: "No active secure-auth currentCall with a ready WindowsSecureAuthPath; AgentCallAck was not sent.",
    };
  }

  const windowsSecureAuthPathCommand = report.board.windowsSecureAuthPath?.command || report.commands.windowsSecureAuthPath;
  const result = command(process.execPath, [
    "scripts/codex-link-client.mjs",
    "--server", args.server,
    "send",
    "--from", "Windows Codex",
    "--text", makeAgentCallAckText(windowsSecureAuthPathCommand),
  ], { timeoutMs: Math.min(Math.max(args.timeoutMs, 5000), 30000) });
  return {
    requested: true,
    ok: result.ok,
    status: result.status,
    error: normalizedText(result.error || result.stderr),
    detail: result.ok ? "sent" : normalizedText(result.error || result.stderr || `exit ${result.status}`),
  };
}

function sendManualUxAck(args, report) {
  if (!args.sendManualUxAck) {
    return {
      requested: false,
      ok: null,
      status: null,
      error: "",
      detail: "not requested",
    };
  }

  const ack = report.board?.macManualUxAck;
  if (ack?.status !== "ready" || !ack.command) {
    const detail = ack?.summary || "No active unexpired MacManualUx call; ManualUxAck was not sent.";
    return {
      requested: true,
      ok: false,
      status: null,
      error: "",
      detail,
    };
  }

  const result = command(process.execPath, [
    "scripts/codex-link-client.mjs",
    "--server", args.server,
    "send",
    "--from", "Windows Codex",
    "--text", makeManualUxAckText(report.board.macManualUx),
  ], { timeoutMs: Math.min(Math.max(args.timeoutMs, 5000), 30000) });
  return {
    requested: true,
    ok: result.ok,
    status: result.status,
    error: normalizedText(result.error || result.stderr),
    detail: result.ok ? "sent" : normalizedText(result.error || result.stderr || `exit ${result.status}`),
  };
}

function applyBoardReadyTarget(args, board) {
  const ready = board?.macReadyForRealTest;
  if (!args.hostProvided && ready?.found && ready.host && ready.port) {
    return {
      ...args,
      originalHost: args.host,
      originalPort: args.port,
      host: ready.host,
      port: ready.port,
      discover: false,
      hostProvided: true,
      discoverNoLocalSubnets: true,
      boardReadyTarget: {
        applied: true,
        source: "MAC_READY_FOR_REAL_TEST",
        host: ready.host,
        port: ready.port,
        build: ready.build || "",
        inputMode: ready.inputMode || "",
        maxScreenFps: ready.maxScreenFps ?? null,
        media: ready.media || "",
      },
    };
  }

  const manualTarget = parseMacReadyHostPort(board?.macManualUx?.target, "");
  if (!args.hostProvided && board?.macManualUx?.found && manualTarget) {
    return {
      ...args,
      originalHost: args.host,
      originalPort: args.port,
      host: manualTarget.host,
      port: manualTarget.port,
      discover: false,
      hostProvided: true,
      discoverNoLocalSubnets: true,
      boardReadyTarget: {
        applied: true,
        source: "MacManualUx",
        host: manualTarget.host,
        port: manualTarget.port,
        status: board.macManualUx.status || "",
        targetSource: board.macManualUx.targetSource || "",
      },
    };
  }

  return args;
}
async function makeReport(args) {
  const git = getGitStatus();
  const board = await getBoardSnapshot(args);
  const effectiveArgs = applyBoardReadyTarget(args, board);
  const windowsClientDiagnosticsPorts = inspectWindowsClientDiagnosticsPorts(effectiveArgs);
  const macPreflight = runFormalPreflight(effectiveArgs, windowsClientDiagnosticsPorts);
  const commands = makeCommands(effectiveArgs, macPreflight, windowsClientDiagnosticsPorts);
  annotateBoardCurrentCall(board, commands);
  const formalManualChecklist = makeFormalManualChecklist(macPreflight.payload, commands);
  const windowsMacAlertWatcher = getWindowsMacAlertWatcherStatus(effectiveArgs, commands);
  const checks = [
    { name: "gitStatus", ok: git.ok, detail: git.clean ? "clean" : `${git.changeCount} change(s)` },
    { name: "board", ok: !board.requested || board.ok, detail: board.requested ? `lines=${board.lineCount}` : "skipped" },
    {
      name: "macPreflight",
      ok: Boolean(macPreflight.payload),
      detail: macPreflight.payload?.online
        ? `target=${macPreflight.payload.target?.host}:${macPreflight.payload.target?.port}`
        : macPreflight.payload?.error?.message || macPreflight.parseError || "offline",
    },
  ];
  if (effectiveArgs.requireClean) {
    checks.push({ name: "requireClean", ok: git.clean, detail: git.clean ? "clean" : `${git.changeCount} change(s)` });
  }
  if (effectiveArgs.requireMacReady) {
    checks.push({
      name: "requireMacReady",
      ok: Boolean(macPreflight.payload?.ok),
      detail: macPreflight.payload?.ok ? "ready" : "not ready",
    });
  }
  const report = {
    ok: false,
    generatedAt: new Date().toISOString(),
    args: {
      host: effectiveArgs.host,
      port: effectiveArgs.port,
      discover: effectiveArgs.discover,
      discoverNoLocalSubnets: effectiveArgs.discoverNoLocalSubnets,
      clientPort: effectiveArgs.clientPort,
      debugPort: effectiveArgs.debugPort,
      alternateClientPort: effectiveArgs.alternateClientPort,
      alternateDebugPort: effectiveArgs.alternateDebugPort,
      checkBoard: effectiveArgs.checkBoard,
      checkClientDiagnostics: effectiveArgs.checkClientDiagnostics,
      requireClean: effectiveArgs.requireClean,
      requireMacReady: effectiveArgs.requireMacReady,
      sendUserAuthRequest: effectiveArgs.sendUserAuthRequest,
      sendAgentCallAck: effectiveArgs.sendAgentCallAck,
      sendManualUxAck: effectiveArgs.sendManualUxAck,
      originalHost: effectiveArgs.originalHost || args.host,
      originalPort: effectiveArgs.originalPort || args.port,
      boardReadyTarget: effectiveArgs.boardReadyTarget || null,
    },
    git,
    board,
    macPreflight,
    windowsMacAlertWatcher,
    windowsClientDiagnosticsPorts,
    commands,
    formalManualChecklist,
    checks,
    failedChecks: [],
  };
  report.board.macManualUxAck = makeMacManualUxAck(effectiveArgs, report.board?.macManualUx);
  report.board.macCodexStaleAction = makeMacCodexStaleAction(effectiveArgs, report.board?.macHeartbeatHealth);
  report.boardSummary = makeBoardSummary(report);
  report.userAuthRequest = makeUserAuthRequest(report);
  report.sentUserAuthRequest = sendUserAuthRequest(effectiveArgs, report);
  report.sentAgentCallAck = sendAgentCallAck(effectiveArgs, report);
  report.sentManualUxAck = sendManualUxAck(effectiveArgs, report);
  if (effectiveArgs.sendUserAuthRequest) {
    checks.push({
      name: "sendUserAuthRequest",
      ok: report.sentUserAuthRequest.ok,
      detail: report.sentUserAuthRequest.detail,
    });
  }
  if (effectiveArgs.sendAgentCallAck) {
    checks.push({
      name: "sendAgentCallAck",
      ok: report.sentAgentCallAck.ok,
      detail: report.sentAgentCallAck.detail,
    });
  }
  if (effectiveArgs.sendManualUxAck) {
    checks.push({
      name: "sendManualUxAck",
      ok: report.sentManualUxAck.ok,
      detail: report.sentManualUxAck.detail,
    });
  }
  report.failedChecks = checks.filter((check) => !check.ok);
  report.ok = report.failedChecks.length === 0;
  return report;
}

function printHuman(report) {
  console.log("Windows resume status");
  const repoState = report.git.ok
    ? report.git.clean
      ? "clean"
      : `dirty (${report.git.changeCount} change(s))`
    : "unknown";
  console.log(`- Repo: ${repoState} ${report.git.currentBuildId || ""}`);
  if (report.git.head) {
    console.log(`  ${report.git.head}`);
  }
  if (report.board.requested) {
    console.log(`- Agent Link Board: ${report.board.ok ? "ok" : "failed"} (${report.board.lineCount} line(s))`);
    if (report.board.currentCall?.present) {
      const callState = report.board.currentCall.active ? "active" : "inactive";
      console.log(`  currentCall=${callState} ${report.board.currentCall.summary}`);
      if (report.board.currentCall.active && report.board.currentCall.command) {
        console.log(`  callCommand=${report.board.currentCall.command}`);
      }
      if (report.board.currentCall.active && report.board.currentCall.next) {
        console.log(`  callNext=${report.board.currentCall.next}`);
      }
    } else {
      console.log("  currentCall=none");
    }
    if (report.board.userPresence?.found) {
      console.log(`  UserPresence=${report.board.userPresence.summary}`);
      if (report.board.userPresence.blocker) {
        console.log(`  UserPresenceAction=${report.board.userPresence.action} blocker=${report.board.userPresence.blocker}`);
      } else {
        console.log(`  UserPresenceAction=${report.board.userPresence.action}`);
      }
    }
    if (report.board.macHostSafeStart?.command) {
      console.log(`  MacHostSafeStart=${report.board.macHostSafeStart.command}`);
    }
    if (report.board.macMaxFpsSafeStart?.command) {
      console.log(`  MacMaxFpsSafeStart=${report.board.macMaxFpsSafeStart.command}`);
    }
    if (report.board.macFormalLocalSmoke?.command) {
      console.log(`  MacFormalLocalSmoke=${report.board.macFormalLocalSmoke.command}`);
    }
    if (report.board.macClientDiscoverWindows?.command) {
      console.log(`  MacClientDiscoverWindows=${report.board.macClientDiscoverWindows.command}`);
    }
    if (report.board.macClientFormalChecklist?.command) {
      console.log(`  MacClientFormalChecklist=${report.board.macClientFormalChecklist.command}`);
    }
    if (report.board.macClientFormalSmoke?.command) {
      console.log(`  MacClientFormalSmoke=${report.board.macClientFormalSmoke.command}`);
    }
    if (report.board.macClientManualChecklist?.found) {
      console.log(`  MacClientManualChecklist=${report.board.macClientManualChecklist.action}`);
    }
    if (report.board.macClientPasswordLocation?.found) {
      console.log(`  MacClientPasswordLocation=${report.board.macClientPasswordLocation.action}`);
    }
    if (report.board.macRemoteAudioPlan?.command) {
      console.log(`  MacRemoteAudioPlan=${report.board.macRemoteAudioPlan.command}`);
    }
    if (report.board.macRemoteAudio?.found) {
      console.log(`  MacRemoteAudio=${report.board.macRemoteAudio.summary}`);
    }
    if (report.board.macInputSafetyPlan?.command) {
      console.log(`  MacInputSafetyPlan=${report.board.macInputSafetyPlan.command}`);
    }
    if (report.board.macManualUxStatus?.command) {
      console.log(`  MacManualUxStatus=${report.board.macManualUxStatus.command}`);
    }
    if (report.board.macManualUx?.found) {
      console.log(`  MacManualUx=${report.board.macManualUx.summary}`);
    }
    if (report.board.macManualUx?.manualUxReconfirmCommand) {
      console.log(`  MacManualUxReconfirm=${report.board.macManualUx.manualUxReconfirmCommand}`);
    }
    if (report.board.macManualUxAck?.status === "ready" && report.board.macManualUxAck.command) {
      console.log(`  MacManualUxAck=${report.board.macManualUxAck.command}`);
    } else if (report.board.macManualUxAck?.status === "blocked" && report.board.macManualUxAck.summary) {
      console.log(`  MacManualUxAck=${report.board.macManualUxAck.summary}`);
    }
    if (report.board.macInputSafety?.found) {
      console.log(`  MacInputSafety=${report.board.macInputSafety.summary}`);
    }
    if (report.board.macInputSafetyStatus?.found) {
      console.log(`  MacInputSafetyStatus=${report.board.macInputSafetyStatus.summary}`);
    }
    if (report.board.macInputSafetyUserNotice?.found) {
      console.log(`  MacInputSafetyUserNotice=${report.board.macInputSafetyUserNotice.summary}`);
    }
    if (report.board.macHeartbeatFreshness?.present) {
      console.log(`  MacHeartbeatFreshness=${report.board.macHeartbeatFreshness.summary}`);
    }
    if (report.board.macHeartbeatHealth?.found) {
      console.log(`  MacHeartbeatHealth=${report.board.macHeartbeatHealth.summary}`);
    }
    if (report.board.macCodexStaleAction?.found) {
      console.log(`  MacCodexStaleAction=${report.board.macCodexStaleAction.summary}`);
      console.log(`  MacCodexStaleCall=${report.board.macCodexStaleAction.callCommand}`);
    }
    if (report.board.macCodexHealth?.found) {
      console.log(`  MacCodexHealth=${report.board.macCodexHealth.summary}`);
    }
    if (report.board.macPowerHealth?.found) {
      console.log(`  MacPowerHealth=${report.board.macPowerHealth.summary}`);
    }
    if (report.board.macUnattendedHealth?.found) {
      console.log(`  MacUnattendedHealth=${report.board.macUnattendedHealth.summary}`);
    }
    if (report.board.macEvidence?.found) {
      console.log(`  MacEvidence=${report.board.macEvidence.summary}`);
    }
    if (report.board.windowsReverseGrantStatus?.command) {
      console.log(`  WindowsReverseGrantStatus=${report.board.windowsReverseGrantStatus.command}`);
    }
    if (report.board.windowsOpenOneTimeReverseGrant?.command) {
      console.log(`  WindowsOpenOneTimeReverseGrant=${report.board.windowsOpenOneTimeReverseGrant.command}`);
    }
    if (report.board.windowsReverseGrantStatusNodeFallback?.command) {
      console.log(`  WindowsReverseGrantStatusNodeFallback=${report.board.windowsReverseGrantStatusNodeFallback.command}`);
    }
    if (report.board.windowsOpenOneTimeReverseGrantNodeFallback?.command) {
      console.log(`  WindowsOpenOneTimeReverseGrantNodeFallback=${report.board.windowsOpenOneTimeReverseGrantNodeFallback.command}`);
    }
    if (report.board.windowsSecureAuthPath?.command) {
      console.log(`  WindowsSecureAuthPath=${report.board.windowsSecureAuthPath.command}`);
    }
    console.log(`  WindowsFirewallStatus=${report.commands.windowsFirewallStatusBoardSummary}`);
    console.log(`  WindowsFirewallPreview=${report.commands.windowsFirewallPreviewBoardSummary}`);
    if (report.board.windowsLanRisk?.found) {
      console.log(`  WindowsLanRisk=${report.board.windowsLanRisk.summary}`);
    }
  } else {
    console.log("- Agent Link Board: skipped (use --checkBoard)");
  }
  const watcher = report.windowsMacAlertWatcher;
  if (watcher?.requested) {
    const watcherState = watcher.ok ? watcher.state : "unavailable";
    console.log(`- Windows Mac alert watcher: ${watcherState}`);
    if (!watcher.ok && watcher.error) {
      console.log(`  statusError=${watcher.error}`);
    }
  }
  const clientPorts = report.windowsClientDiagnosticsPorts;
  if (clientPorts?.requested) {
    console.log(`- Windows client diagnostics ports: ${clientPorts.summary}`);
    if (!clientPorts.available) {
      console.log(`  recommendation=${clientPorts.recommendation}`);
    }
  }
  const mac = report.macPreflight.payload || null;
  if (mac?.online) {
    const state = mac.ok ? "ready" : "blocked";
    console.log(`- Mac formal preflight: ${state} ${mac.target?.host}:${mac.target?.port}`);
    console.log(`  runtime=${mac.runtime?.buildId || "unknown"} inputMode=${mac.capabilities?.inputMode || "unknown"} h264=${flag(mac.capabilities?.h264Stream)} audio=${mac.capabilities?.audioMode || flag(mac.capabilities?.audio)} clipboardFile=${flag(mac.capabilities?.clipboardFile)}`);
    if (!mac.ok && Array.isArray(mac.failedChecks) && mac.failedChecks.length > 0) {
      console.log(`  failedChecks=${mac.failedChecks.map((check) => check.name).join(",")}`);
    }
  } else {
    const detail = mac?.error?.message || report.macPreflight.parseError || "offline";
    console.log(`- Mac formal preflight: offline (${detail})`);
  }
  console.log("- Next safe commands:");
  console.log(`  ${report.commands.macHostDiscoveryBoardSummary}`);
  console.log(`  ${report.commands.macHostDiscoveryPowerShellBoardSummary}`);
  console.log(`  ${report.commands.macHostReadinessCommand}`);
  console.log(`  MacHeartbeat=${report.commands.macHeartbeatCommand}`);
  console.log(`  MacHeartbeatOnce=${report.board.macHeartbeatOnce?.command || report.commands.macHeartbeatOnceCommand}`);
  console.log(`  MacHeartbeatWatch=${report.board.macHeartbeatWatch?.command || report.commands.macHeartbeatWatchCommand}`);
  console.log(`  MacHeartbeatStart=${report.board.macHeartbeatStart?.command || report.commands.macHeartbeatStartCommand}`);
  console.log(`  MacHeartbeatStatus=${report.board.macHeartbeatStatus?.command || report.commands.macHeartbeatStatusCommand}`);
  console.log(`  MacHeartbeatStop=${report.board.macHeartbeatStop?.command || report.commands.macHeartbeatStopCommand}`);
  console.log(`  MacFormalLocalSmoke=${report.board.macFormalLocalSmoke?.command || report.commands.macFormalLocalSmokeCommand}`);
  console.log(`  MacClientDiscoverWindows=${report.board.macClientDiscoverWindows?.command || report.commands.macClientDiscoverWindowsCommand}`);
  console.log(`  MacClientFormalChecklist=${report.board.macClientFormalChecklist?.command || report.commands.macClientFormalChecklistCommand}`);
  console.log(`  MacClientFormalSmoke=${report.board.macClientFormalSmoke?.command || report.commands.macClientFormalSmokeCommand}`);
  console.log(`  MacClientManualChecklist=${report.board.macClientManualChecklist?.action || report.commands.macClientManualChecklistAction}`);
  console.log(`  MacClientPasswordLocation=${report.board.macClientPasswordLocation?.action || report.commands.macClientPasswordLocationAction}`);
  console.log(`  MacRemoteAudioPlan=${report.board.macRemoteAudioPlan?.command || report.commands.macRemoteAudioPlanCommand}`);
  if (report.board.macRemoteAudio?.found) {
    console.log(`  MacRemoteAudio=${report.board.macRemoteAudio.summary}`);
  }
  console.log(`  MacInputSafetyPlan=${report.board.macInputSafetyPlan?.command || report.commands.macInputSafetyPlanCommand}`);
  console.log(`  MacManualUxStatus=${report.board.macManualUxStatus?.command || report.commands.macManualUxStatusCommand}`);
  if (report.board.macManualUx?.found) {
    console.log(`  MacManualUx=${report.board.macManualUx.summary}`);
  }
  if (report.board.macManualUx?.manualUxReconfirmCommand) {
    console.log(`  MacManualUxReconfirm=${report.board.macManualUx.manualUxReconfirmCommand}`);
  }
  if (report.board.macManualUxAck?.status === "ready" && report.board.macManualUxAck.command) {
    console.log(`  MacManualUxAck=${report.board.macManualUxAck.command}`);
  } else if (report.board.macManualUxAck?.status === "blocked" && report.board.macManualUxAck.summary) {
    console.log(`  MacManualUxAck=${report.board.macManualUxAck.summary}`);
  }
  if (report.board.macInputSafety?.found) {
    console.log(`  MacInputSafety=${report.board.macInputSafety.summary}`);
  }
  if (report.board.macInputSafetyStatus?.found) {
    console.log(`  MacInputSafetyStatus=${report.board.macInputSafetyStatus.summary}`);
  }
  if (report.board.macInputSafetyUserNotice?.found) {
    console.log(`  MacInputSafetyUserNotice=${report.board.macInputSafetyUserNotice.summary}`);
  }
  console.log(`  ${report.commands.macUnattendedStatusCommand}`);
  console.log(`  ${report.commands.macUnattendedFormalStatusCommand}`);
  if (report.board.macHostSafeStart?.command) {
    console.log(`  MacHostSafeStart=${report.board.macHostSafeStart.command}`);
  }
  if (report.board.macMaxFpsSafeStart?.command) {
    console.log(`  MacMaxFpsSafeStart=${report.board.macMaxFpsSafeStart.command}`);
  }
  if (report.board.macFormalLocalSmoke?.command) {
    console.log(`  MacFormalLocalSmoke=${report.board.macFormalLocalSmoke.command}`);
  }
  if (report.board.macClientDiscoverWindows?.command) {
    console.log(`  MacClientDiscoverWindows=${report.board.macClientDiscoverWindows.command}`);
  }
  if (report.board.macClientFormalChecklist?.command) {
    console.log(`  MacClientFormalChecklist=${report.board.macClientFormalChecklist.command}`);
  }
  if (report.board.macClientFormalSmoke?.command) {
    console.log(`  MacClientFormalSmoke=${report.board.macClientFormalSmoke.command}`);
  }
  console.log(`  ${report.commands.formalChecklistBoardSummary}`);
  console.log(`  ${report.commands.preflightBoardSummary}`);
  console.log(`  ${report.commands.userAuthRequest}`);
  console.log(`  ${report.commands.formalRun}`);
  console.log(`  ${report.commands.windowsClientRetestUserEntryCommand}`);
  console.log(`  ${report.commands.windowsClientRetestAndPostUserEntryCommand}`);
  console.log(`  ${report.commands.windowsClientRetestBoardSummaryCommand}`);
  console.log(`  ${report.commands.windowsClientRetestBoardSummaryPowerShellCommand}`);
  console.log(`  ${report.commands.windowsClientDiagnosticsCommand}`);
  console.log(`  ${report.commands.windowsClientDiagnosticsPowerShellCommand}`);
  if (!report.windowsClientDiagnosticsPorts?.available) {
    console.log(`  ${report.commands.windowsClientDiagnosticsAlternateCommand}`);
    console.log(`  ${report.commands.windowsClientDiagnosticsAlternatePowerShellCommand}`);
  }
  console.log(`  ${report.commands.windowsClientCopyDiagnosticsAction}`);
  console.log(`  ${report.commands.windowsHostMediaReadinessBoardSummary}`);
  console.log(`  ${report.commands.windowsHostMediaReadinessPowerShellBoardSummary}`);
  console.log(`  ${report.commands.windowsVideoEncoderSupportBoardSummary}`);
  console.log(`  ${report.commands.windowsVideoEncoderSupportPowerShellBoardSummary}`);
  console.log(`  ${report.commands.windowsWgcSupportBoardSummary}`);
  console.log(`  ${report.commands.windowsWgcSupportPowerShellBoardSummary}`);
  console.log(`  ${report.commands.windowsWgcBenchmarkBoardSummary}`);
  console.log(`  ${report.commands.windowsWgcBenchmarkPowerShellBoardSummary}`);
  console.log(`  ${report.commands.windowsWgcH264SourceCompareBoardSummary}`);
  console.log(`  ${report.commands.windowsWgcH264SourceComparePowerShellBoardSummary}`);
  console.log(`  ${report.commands.windowsWebCodecsH264BoardSummary}`);
  console.log(`  ${report.commands.windowsWebCodecsH264PowerShellBoardSummary}`);
  console.log(`  ${report.commands.windowsPowerShellHelpBoardSummary}`);
  console.log(`  ${report.commands.windowsPowerShell7HelpBoardSummary}`);
  console.log(`  WindowsReverseGrantStatus=${report.board.windowsReverseGrantStatus?.command || report.commands.windowsReverseGrantStatusPowerShellBoardSummary}`);
  console.log(`  WindowsOpenOneTimeReverseGrant=${report.board.windowsOpenOneTimeReverseGrant?.command || report.commands.windowsOpenOneTimeReverseGrantPowerShellBoardSummary}`);
  console.log(`  WindowsReverseGrantStatusNodeFallback=${report.board.windowsReverseGrantStatusNodeFallback?.command || report.commands.windowsReverseGrantStatusBoardSummary}`);
  console.log(`  WindowsOpenOneTimeReverseGrantNodeFallback=${report.board.windowsOpenOneTimeReverseGrantNodeFallback?.command || report.commands.windowsOpenOneTimeReverseGrantBoardSummary}`);
  console.log(`  WindowsSecureAuthPath=${report.board.windowsSecureAuthPath?.command || report.commands.windowsSecureAuthPath}`);
  console.log(`  WindowsFirewallStatus=${report.commands.windowsFirewallStatusBoardSummary}`);
  console.log(`  WindowsFirewallPreview=${report.commands.windowsFirewallPreviewBoardSummary}`);
  console.log(`  ${report.commands.windowsReverseControlGrantBoardSummary}`);
  console.log(`  ${report.commands.windowsReverseControlGrantPowerShellBoardSummary}`);
  console.log(`  ${report.commands.windowsMacAlertWatcherStart}`);
  console.log(`  ${report.commands.windowsMacAlertWatcherStatus}`);
  console.log("- Board summary:");
  console.log(`  ${report.boardSummary}`);
  console.log("- User auth request:");
  console.log(`  ${report.userAuthRequest}`);
  if (report.sentUserAuthRequest.requested) {
    console.log(`- Sent user auth request: ${report.sentUserAuthRequest.ok ? "ok" : "failed"} (${report.sentUserAuthRequest.detail})`);
  }
  if (report.sentAgentCallAck.requested) {
    console.log(`- Sent AgentCallAck: ${report.sentAgentCallAck.ok ? "ok" : "failed"} (${report.sentAgentCallAck.detail})`);
  }
  if (report.sentManualUxAck.requested) {
    console.log(`- Sent ManualUxAck: ${report.sentManualUxAck.ok ? "ok" : "failed"} (${report.sentManualUxAck.detail})`);
  }
}

function flag(value) {
  if (value === true) return "on";
  if (value === false) return "off";
  return value == null || value === "" ? "unknown" : String(value);
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  const report = await makeReport(args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.userAuthRequest) {
    console.log(report.userAuthRequest);
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printHuman(report);
  }
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
