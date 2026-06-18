#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promptPassword as promptMacPassword } from "./password-prompt.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  host: "",
  port: 43770,
  clientHost: "127.0.0.1",
  clientPort: 5188,
  debugPort: 9340,
  timeoutMs: 60000,
  observeVideoMs: 1200,
  minObservedVideoFrames: 4,
  minObservedVideoFps: 3,
  maxInitialVideoMs: 15000,
  maxAudioFrameMs: 15000,
  maxAudioPlaybackMs: 20000,
  server: "http://192.168.31.68:17888",
  discover: false,
  discoverHosts: [],
  discoverSubnets: [],
  discoverNoLocalSubnets: false,
  discoverTimeoutMs: 650,
  discoverScanTimeoutMs: 0,
  skipBoard: false,
  allowDirty: false,
  allowPreflightWarnings: false,
  ensureClient: false,
  preflightOnly: false,
  promptPassword: false,
  requirePassword: true,
  allowDemoPassword: false,
  skipAudio: false,
  skipFileClipboard: false,
  allowClipboardFallback: process.platform !== "win32",
  headed: false,
  json: false,
  boardSummary: false,
  dryRun: false,
  sendCall: false,
  forceCall: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/run-mac-client-formal-smoke.mjs [options]

Runs the Mac client browser smoke against an already-running Windows host.
It first runs the read-only formal checklist. If not --preflightOnly, it then
authenticates through the Mac client page using LAN_DUAL_PASSWORD or a frontmost
--promptPassword dialog. Passwords are passed to child probes through the
environment, not command arguments, and are never printed.

Options:
  --host <host>                  Windows host address. Required for real smoke.
  --port <port>                  Windows host port. Default: ${defaults.port}
  --clientHost <host>            Local Mac client host. Default: ${defaults.clientHost}
  --clientPort <port>            Local Mac client web port. Default: ${defaults.clientPort}
  --debugPort <port>             Browser remote debugging port. Default: ${defaults.debugPort}
  --timeoutMs <ms>               Browser smoke timeout. Default: ${defaults.timeoutMs}
  --observeVideoMs <ms>          Sustained video observation window. Default: ${defaults.observeVideoMs}
  --minObservedVideoFrames <n>   Minimum frames during observation. Default: ${defaults.minObservedVideoFrames}
  --minObservedVideoFps <fps>    Minimum FPS during observation. Default: ${defaults.minObservedVideoFps}
  --maxInitialVideoMs <ms>       Maximum first-frame time. Default: ${defaults.maxInitialVideoMs}
  --maxAudioFrameMs <ms>         Maximum first audio frame time. Default: ${defaults.maxAudioFrameMs}
  --maxAudioPlaybackMs <ms>      Maximum audio playback count time. Default: ${defaults.maxAudioPlaybackMs}
  --server <url>                 Agent Link Board URL. Default: ${defaults.server}
  --discover                     Find the best Windows host before preflight/auth.
  --discoverHost <host>          With --discover, probe this host directly. Repeatable.
  --discoverSubnet <cidr>        With --discover, scan this IPv4 subnet. Repeatable.
  --discoverNoLocalSubnets       With --discover, only probe 127.0.0.1 and explicit targets.
  --discoverTimeoutMs <ms>       Per-host discovery timeout. Default: ${defaults.discoverTimeoutMs}
  --discoverScanTimeoutMs <ms>   Overall discovery timeout. Default: auto
  --skipBoard                    Do not read Agent Link Board in preflight.
  --allowDirty                   Allow dirty git worktree as a preflight warning.
  --allowPreflightWarnings       Allow ok-but-not-ready preflight warnings before auth.
  --ensureClient                 Safely start/reuse the local Mac client page before preflight.
  --preflightOnly                Only run the read-only checklist; no password/browser auth.
  --promptPassword               Ring first, then ask for password in a frontmost macOS dialog.
  --requirePassword              Refuse empty/demo password for real smoke. Default: true
  --noRequirePassword            Allow missing password only for local non-formal diagnostics.
  --allowDemoPassword            Allow demo-password for local fake-host tests only.
  --skipAudio                    Do not require audio payload/playback in browser smoke.
  --skipFileClipboard            Skip file clipboard checks.
  --allowClipboardFallback       Allow temp/memory clipboard fallback. Default: ${defaults.allowClipboardFallback}
  --headed                       Run browser headed instead of headless.
  --dryRun                       Print the command shape without running browser auth.
  --sendCall                     With --preflightOnly, send the formal Windows test call only when ready.
  --forceCall                    Allow --sendCall to replace an existing board call after coordination.
  --boardSummary                 Print a short secret-free Agent Link Board summary.
  --json                         Print one machine-readable JSON object.
  --help, -h                     Show this help without probing anything.

Machine-readable JSON fields:
  commands.macClientFormalChecklist
                                  Secret-free formal checklist command. It
                                  prints the manual true-test checklist before
                                  true Windows control without authenticating,
                                  prompting for a password, sending a call, or
                                  sending input.
  commands.preflight             Secret-free read-only formal checklist command.
  commands.sendCall              Secret-free --preflightOnly call sender; only set after a Windows host is known.
  commands.discoverPreflight     Safe discovery + preflight retry command when no host is known.
  commands.browserSmoke          Browser smoke command shape; uses --useEnvPassword, never embeds passwords.
  commands.macClientBrowserSelfTest
                                  Secret-free local browser self-test command.
                                  It uses a temporary mock Windows host and
                                  does not use a real host, password, call, or
                                  inject.
  commands.windowsReverseGrantStatus
                                  Recommended Windows-side PowerShell loopback
                                  command to inspect the one-time reverse-
                                  control grant state.
  commands.windowsOpenOneTimeReverseGrant
                                  Recommended Windows-side PowerShell loopback
                                  command to open a short one-time reverse-
                                  control grant window.
  commands.windowsReverseGrantStatusNodeFallback
                                  Node fallback for inspecting the grant state.
  commands.windowsOpenOneTimeReverseGrantNodeFallback
                                  Node fallback for opening the grant window.
  commands.reverseControlRehearsal
                                  Safe LAN008 -> Windows local one-time grant
                                  -> Mac retry accepted rehearsal.
  commands.reverseGrantCopyAction
                                  Mac client UI evidence to verify after LAN008:
                                  both PowerShell and Node fallback grant
                                  commands can be copied without passwords.
  commands.secureAuthPath        Human-safe path when Windows host was started
                                  with an unknown random runtime password:
                                  restart Windows host locally with a hidden
                                  prompt, then type the same temporary password
                                  into the Mac --promptPassword dialog.
  commands.windowsSecureAuthPath
                                  Safe WindowsSecureAuthPath/SecureAuthPath
                                  command already validated by the nested
                                  formal checklist from Agent Link Board.
  commands.windowsSecureAuthStart
                                  Recommended Windows-side PowerShell command
                                  to restart Windows host with a hidden local
                                  password prompt.
  commands.windowsSecureAuthStartNodeFallback
                                  Node fallback for the same Windows-side
                                  hidden-prompt restart.
  ensuredClient                  Result from --ensureClient start/reuse of the local Mac client page.
  discovery                      Selected Windows host details when --discover is used.
  discovery.formalChecklistCommand
                                  Secret-free formal checklist board summary
                                  command from Windows host discovery.
  discovery.manualChecklistSummary
                                  Human true-test checklist order from Windows
                                  host discovery.
  sentCall                       Present only with --preflightOnly --sendCall; secret-free Agent Link Board result.

Examples:
  node scripts/mac/run-mac-client-formal-smoke.mjs --host 192.168.31.50 --port 43770 --preflightOnly --boardSummary
  node scripts/mac/run-mac-client-formal-smoke.mjs --discover --preflightOnly --boardSummary
  node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --sendCall
  node scripts/mac/run-mac-client-formal-smoke.mjs --host 192.168.31.50 --port 43770 --promptPassword
  node scripts/mac/run-mac-client-formal-smoke.mjs --discover --promptPassword
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
    if (
      token === "--skipBoard" ||
      token === "--allowDirty" ||
      token === "--allowPreflightWarnings" ||
      token === "--ensureClient" ||
      token === "--preflightOnly" ||
      token === "--promptPassword" ||
      token === "--requirePassword" ||
      token === "--discover" ||
      token === "--discoverNoLocalSubnets" ||
      token === "--allowDemoPassword" ||
      token === "--skipAudio" ||
      token === "--skipFileClipboard" ||
      token === "--allowClipboardFallback" ||
      token === "--headed" ||
      token === "--dryRun" ||
      token === "--sendCall" ||
      token === "--forceCall" ||
      token === "--boardSummary" ||
      token === "--json"
    ) {
      args[token.slice(2)] = true;
      continue;
    }
    if (token === "--noRequirePassword") {
      args.requirePassword = false;
      continue;
    }
    if ((token === "--host" || token === "--windowsHost") && next && !next.startsWith("--")) {
      args.host = next;
      index += 1;
      continue;
    }
    if ((token === "--discoverHost" || token === "--discoverWindowsHost") && next && !next.startsWith("--")) {
      args.discoverHosts.push(next.trim());
      index += 1;
      continue;
    }
    if (token === "--discoverSubnet" && next && !next.startsWith("--")) {
      args.discoverSubnets.push(next.trim());
      index += 1;
      continue;
    }
    if (token === "--clientHost" && next && !next.startsWith("--")) {
      args.clientHost = next;
      index += 1;
      continue;
    }
    const numericKeys = new Set([
      "port",
      "clientPort",
      "debugPort",
      "timeoutMs",
      "observeVideoMs",
      "minObservedVideoFrames",
      "minObservedVideoFps",
      "maxInitialVideoMs",
      "maxAudioFrameMs",
      "maxAudioPlaybackMs",
      "discoverTimeoutMs",
      "discoverScanTimeoutMs",
    ]);
    if (token.startsWith("--") && numericKeys.has(token.slice(2)) && next && !next.startsWith("--")) {
      args[token.slice(2)] = next;
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

  args.host = String(args.host || "").trim();
  args.clientHost = String(args.clientHost || defaults.clientHost).trim();
  args.server = String(args.server || defaults.server).trim();
  args.discoverHosts = [...new Set((args.discoverHosts || []).filter(Boolean))];
  args.discoverSubnets = [...new Set((args.discoverSubnets || []).filter(Boolean))];
  args.port = clampInteger(args.port, 1, 65535, defaults.port);
  args.clientPort = clampInteger(args.clientPort, 1, 65535, defaults.clientPort);
  args.debugPort = clampInteger(args.debugPort, 1, 65535, defaults.debugPort);
  args.timeoutMs = clampInteger(args.timeoutMs, 5000, 600000, defaults.timeoutMs);
  args.observeVideoMs = clampInteger(args.observeVideoMs, 0, 600000, defaults.observeVideoMs);
  args.minObservedVideoFrames = clampInteger(args.minObservedVideoFrames, 0, 1000000, defaults.minObservedVideoFrames);
  args.minObservedVideoFps = nonNegativeNumber(args.minObservedVideoFps, defaults.minObservedVideoFps);
  args.maxInitialVideoMs = clampInteger(args.maxInitialVideoMs, 0, 600000, defaults.maxInitialVideoMs);
  args.maxAudioFrameMs = clampInteger(args.maxAudioFrameMs, 0, 600000, defaults.maxAudioFrameMs);
  args.maxAudioPlaybackMs = clampInteger(args.maxAudioPlaybackMs, 0, 600000, defaults.maxAudioPlaybackMs);
  args.discoverTimeoutMs = clampInteger(args.discoverTimeoutMs, 100, 5000, defaults.discoverTimeoutMs);
  args.discoverScanTimeoutMs = clampInteger(args.discoverScanTimeoutMs, 0, 300000, defaults.discoverScanTimeoutMs);
  if (args.sendCall && !args.preflightOnly) {
    throw new Error("--sendCall is only allowed with --preflightOnly so it cannot accidentally authenticate.");
  }
  return args;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function nonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function redact(value, secret) {
  let text = String(value || "");
  if (secret) text = text.split(secret).join("[redacted]");
  const envSecret = process.env.LAN_DUAL_PASSWORD || "";
  if (envSecret) text = text.split(envSecret).join("[redacted]");
  return text;
}

function ensureClientServer(args) {
  if (!args.ensureClient) return { attempted: false };
  const ensureArgs = [
    "scripts/mac/start-mac-client.mjs",
    "--json",
    "--allowExisting",
    "--host",
    args.clientHost,
    "--port",
    String(args.clientPort),
    "--timeoutMs",
    String(Math.min(args.timeoutMs, 60000)),
  ];
  const result = spawnSync(process.execPath, ensureArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(Math.min(args.timeoutMs, 60000) + 5000, 10000),
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
  });
  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "");
  const spawnError = result.error?.message || "";
  const signalError = result.status === null && result.signal ? `terminated by signal ${result.signal}` : "";
  let payload = null;
  let parseError = "";
  try {
    payload = JSON.parse(stdout);
  } catch (error) {
    parseError = error.message;
  }
  return {
    attempted: true,
    ok: result.status === 0 && Boolean(payload?.ok),
    exitCode: result.status,
    signal: result.signal || null,
    payload,
    parseError,
    stdout,
    stderr,
    error: payload?.error?.message || spawnError || signalError || stderr.trim() || parseError,
  };
}

function runPreflight(args) {
  const preflightArgs = [
    "scripts/mac/check-mac-client-formal-status.mjs",
    "--json",
    "--clientHost",
    args.clientHost,
    "--clientPort",
    String(args.clientPort),
    "--timeoutMs",
    String(Math.min(args.timeoutMs, 60000)),
    "--server",
    args.server,
  ];
  if (args.host) preflightArgs.push("--host", args.host, "--port", String(args.port));
  if (args.skipBoard) preflightArgs.push("--skipBoard");
  if (args.allowDirty || args.dryRun || args.preflightOnly) preflightArgs.push("--allowDirty");
  const result = spawnSync(process.execPath, preflightArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(Math.min(args.timeoutMs, 60000) + 5000, 10000),
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
  });
  const stdout = String(result.stdout || "").trim();
  let payload = null;
  let parseError = "";
  try {
    payload = JSON.parse(stdout);
  } catch (error) {
    parseError = error.message;
  }
  return {
    exitCode: result.status,
    stdout,
    stderr: String(result.stderr || ""),
    payload,
    parseError,
  };
}

function runDiscovery(args) {
  if (!args.discover) return { requested: false };
  const discoverArgs = [
    "scripts/mac/discover-windows-hosts.mjs",
    "--json",
    "--requireFound",
    "--timeoutMs",
    String(args.discoverTimeoutMs),
  ];
  if (args.discoverScanTimeoutMs > 0) {
    discoverArgs.push("--scanTimeoutMs", String(args.discoverScanTimeoutMs));
  }
  if (args.discoverNoLocalSubnets) {
    discoverArgs.push("--noLocalSubnets");
  }
  for (const host of args.discoverHosts) {
    discoverArgs.push("--host", host);
  }
  for (const subnet of args.discoverSubnets) {
    discoverArgs.push("--subnet", subnet);
  }
  if (args.port) discoverArgs.push("--port", String(args.port));
  const result = spawnSync(process.execPath, discoverArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(args.discoverScanTimeoutMs || 30000, 10000),
    maxBuffer: 12 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
  });
  const stdout = String(result.stdout || "").trim();
  let payload = null;
  let parseError = "";
  try {
    payload = JSON.parse(stdout);
  } catch (error) {
    parseError = error.message;
  }
  return {
    requested: true,
    exitCode: result.status,
    stdout,
    stderr: String(result.stderr || ""),
    payload,
    parseError,
  };
}

function applyDiscovery(args, discovery) {
  if (!discovery?.requested) return;
  if (!discovery.payload) {
    throw new Error(`Windows host discovery did not produce JSON: ${discovery.parseError || "unknown parse error"}`);
  }
  if (!discovery.payload.ok || !discovery.payload.best) {
    throw new Error(`Windows host discovery found no usable Windows host (${discovery.payload.found?.length || 0} found).`);
  }
  args.host = String(discovery.payload.best.host || "").trim();
  args.port = clampInteger(discovery.payload.best.port, 1, 65535, args.port);
  if (!args.host) {
    throw new Error("Windows host discovery returned an empty host.");
  }
}

function makeBrowserArgs(args) {
  const browserArgs = [
    "scripts/windows/test-mac-client-browser.mjs",
    "--useExistingHost",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--clientPort",
    String(args.clientPort),
    "--debugPort",
    String(args.debugPort),
    "--timeoutMs",
    String(args.timeoutMs),
    "--useEnvPassword",
    "--requirePassword",
    "--maxInitialVideoMs",
    String(args.maxInitialVideoMs),
  ];
  if (args.observeVideoMs > 0) {
    browserArgs.push(
      "--observeVideoMs",
      String(args.observeVideoMs),
      "--minObservedVideoFrames",
      String(args.minObservedVideoFrames),
      "--minObservedVideoFps",
      String(args.minObservedVideoFps),
    );
  }
  if (!args.skipAudio) {
    browserArgs.push(
      "--enableAudio",
      "--expectAudioPayload",
      "--expectAudioPlayback",
      "--maxAudioFrameMs",
      String(args.maxAudioFrameMs),
      "--maxAudioPlaybackMs",
      String(args.maxAudioPlaybackMs),
    );
  }
  if (args.skipFileClipboard) browserArgs.push("--skipFileClipboard");
  if (args.allowClipboardFallback) browserArgs.push("--allowClipboardFallback");
  if (args.headed) browserArgs.push("--headed");
  return browserArgs;
}

function hasWindowsHost(args) {
  return Boolean(String(args.host || "").trim());
}

function makeBrowserSmokeCommand(args) {
  if (!hasWindowsHost(args)) return "";
  return makeBrowserArgs(args).join(" ");
}

function makeMacClientBrowserSelfTestCommand() {
  return "node scripts/mac/test-mac-client-browser-self-test.mjs --boardSummary";
}

function makePreflightCommand(args) {
  const parts = [
    "node scripts/mac/check-mac-client-formal-status.mjs",
    ...(args.host ? ["--host", args.host, "--port", String(args.port)] : []),
    "--boardSummary",
  ];
  if (args.server !== defaults.server) parts.push("--server", args.server);
  return parts.join(" ");
}

function makeSendCallCommand(args) {
  if (!hasWindowsHost(args)) return "";
  const parts = [
    "node scripts/mac/check-mac-client-formal-status.mjs",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--sendCall",
  ];
  if (args.server !== defaults.server) parts.push("--server", args.server);
  return parts.join(" ");
}

function makeSendCallArgs(args) {
  if (!hasWindowsHost(args)) return [];
  const sendArgs = [
    "scripts/mac/check-mac-client-formal-status.mjs",
    "--json",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--sendCall",
    "--clientHost",
    args.clientHost,
    "--clientPort",
    String(args.clientPort),
    "--timeoutMs",
    String(Math.min(args.timeoutMs, 60000)),
    "--server",
    args.server,
  ];
  if (args.forceCall) sendArgs.push("--forceCall");
  if (args.allowDirty) sendArgs.push("--allowDirty");
  return sendArgs;
}

function makeDiscoveryRetryCommand(args) {
  const command = [
    "node scripts/mac/run-mac-client-formal-smoke.mjs",
    "--discover",
    "--preflightOnly",
    "--boardSummary",
  ];
  if (args.discoverNoLocalSubnets) command.push("--discoverNoLocalSubnets");
  for (const host of args.discoverHosts || []) {
    command.push("--discoverHost", host);
  }
  for (const subnet of args.discoverSubnets || []) {
    command.push("--discoverSubnet", subnet);
  }
  if (args.port) command.push("--port", String(args.port));
  return command.join(" ");
}

function makeWindowsReverseGrantPowerShellCommand(args, action = "grant") {
  const parts = [
    "pwsh -NoProfile -ExecutionPolicy Bypass",
    "-File",
    "scripts/windows/allow-windows-reverse-control.ps1",
    "-HostName",
    "127.0.0.1",
    "-Port",
    String(args.port || defaults.port),
  ];
  if (action === "status") {
    parts.push("-Status");
  } else if (action === "revoke") {
    parts.push("-Revoke");
  } else {
    parts.push("-Grant", "-DurationMs", "30000");
  }
  parts.push("-BoardSummary");
  return parts.join(" ");
}

function makeWindowsReverseGrantNodeFallbackCommand(args, action = "grant") {
  const parts = [
    "node scripts/windows/allow-windows-reverse-control.mjs",
    "--host",
    "127.0.0.1",
    "--port",
    String(args.port || defaults.port),
  ];
  if (action === "status") {
    parts.push("--status");
  } else if (action === "revoke") {
    parts.push("--revoke");
  } else {
    parts.push("--grant", "--durationMs", "30000");
  }
  parts.push("--boardSummary");
  return parts.join(" ");
}

function makeWindowsReverseGrantCommand(args, action = "grant") {
  return makeWindowsReverseGrantPowerShellCommand(args, action);
}

function makeWindowsSecureAuthStartPowerShellCommand(args) {
  return [
    "powershell.exe -NoProfile -ExecutionPolicy Bypass",
    "-File",
    "scripts/windows/start-windows-host.ps1",
    "-HostName",
    "0.0.0.0",
    "-Port",
    String(args.port || defaults.port),
    "-PromptPassword",
    "-RequirePassword",
  ].join(" ");
}

function makeWindowsSecureAuthStartNodeFallbackCommand(args) {
  return [
    "node scripts/windows/start-windows-host.mjs",
    "--host",
    "0.0.0.0",
    "--port",
    String(args.port || defaults.port),
    "--promptPassword",
    "--requirePassword",
  ].join(" ");
}

function makeSecureAuthPathSummaryText() {
  return [
    "If Windows host was started with an unknown random runtime password, Windows stops that host and restarts it locally with WindowsSecureAuthStart.",
    "The user types the same temporary password into the Windows hidden prompt and this Mac --promptPassword dialog.",
    "Do not send the password on Agent Link Board, command arguments, logs, or chat; no input_event or inject is sent by this auth step.",
  ].join(" ");
}

function makeSecureAuthPathText(args, windowsSecureAuthPath = "") {
  const parts = [
    makeSecureAuthPathSummaryText(),
  ];
  if (windowsSecureAuthPath) {
    parts.push(`WindowsSecureAuthPath=${windowsSecureAuthPath}`);
  }
  parts.push(
    `WindowsSecureAuthStart=${makeWindowsSecureAuthStartPowerShellCommand(args)}`,
    `WindowsSecureAuthStartNodeFallback=${makeWindowsSecureAuthStartNodeFallbackCommand(args)}`,
  );
  return parts.join(" ");
}

function makeReverseControlRehearsalText(args) {
  const grantCommand = makeWindowsReverseGrantCommand(args, "grant");
  const nodeFallbackCommand = makeWindowsReverseGrantNodeFallbackCommand(args, "grant");
  return [
    "Mac authenticates in the Mac client page, clicks 请求反控, and expects LAN008/default deny first.",
    `Windows Codex runs the recommended PowerShell command on the Windows host machine: ${grantCommand}.`,
    `Node fallback if PowerShell is unavailable: ${nodeFallbackCommand}.`,
    makeReverseGrantCopyAction(),
    "Mac clicks 重试反控 and expects accepted plus 临时授权已使用.",
    "No password goes on Agent Link Board, no input_event is sent by this request, and inject stays off.",
  ].join(" ");
}

function makeReverseControlRehearsalBoardText() {
  return "Mac clicks 请求反控 -> expects LAN008/default deny; Windows uses WindowsOpenOneTimeReverseGrant above on loopback; Mac clicks 重试反控 -> accepted plus 临时授权已使用; no password, input_event, or inject.";
}

function makeReverseGrantCopyAction() {
  return "After LAN008, Mac client page shows Copy PowerShell and Copy Node for the Windows loopback grant commands; copied text must contain no password and copying must not send input_event.";
}

function makeReverseGrantBoardSummaryParts(report, args) {
  const commands = report?.commands || {};
  return [
    `WindowsReverseGrantStatus=${commands.windowsReverseGrantStatus || makeWindowsReverseGrantCommand(args, "status")}.`,
    `WindowsOpenOneTimeReverseGrant=${commands.windowsOpenOneTimeReverseGrant || makeWindowsReverseGrantCommand(args, "grant")}.`,
    `WindowsReverseGrantStatusNodeFallback=${commands.windowsReverseGrantStatusNodeFallback || makeWindowsReverseGrantNodeFallbackCommand(args, "status")}.`,
    `WindowsOpenOneTimeReverseGrantNodeFallback=${commands.windowsOpenOneTimeReverseGrantNodeFallback || makeWindowsReverseGrantNodeFallbackCommand(args, "grant")}.`,
  ];
}

function makeSecureAuthBoardSummaryParts(report, args) {
  const commands = report?.commands || {};
  const parts = [
    `SecureAuthPath=${makeSecureAuthPathSummaryText()}`,
  ];
  if (commands.windowsSecureAuthPath) {
    parts.push(`WindowsSecureAuthPath=${commands.windowsSecureAuthPath}.`);
  }
  parts.push(
    `WindowsSecureAuthStart=${commands.windowsSecureAuthStart || makeWindowsSecureAuthStartPowerShellCommand(args)}.`,
    `WindowsSecureAuthStartNodeFallback=${commands.windowsSecureAuthStartNodeFallback || makeWindowsSecureAuthStartNodeFallbackCommand(args)}.`,
  );
  return parts;
}

async function preparePassword(args) {
  if (args.preflightOnly || args.dryRun) return "";
  if (args.promptPassword) {
    const value = await promptMacPassword({
      title: "LAN Dual Control",
      message: "Enter the Windows host password for this Mac client smoke test. It is not printed or sent to Agent Link Board.",
      prompt: "Windows host password:",
      terminalLabel: "Windows host password: ",
      output: args.json ? process.stderr : process.stdout,
    });
    if (!value) throw new Error("Password cannot be empty when --promptPassword is used.");
    return value;
  }
  return process.env.LAN_DUAL_PASSWORD || "";
}

function validatePassword(args, password) {
  if (args.preflightOnly || args.dryRun || !args.requirePassword) return;
  if (!password) {
    throw new Error("Formal browser smoke requires LAN_DUAL_PASSWORD or --promptPassword.");
  }
  if (!args.allowDemoPassword && password === "demo-password") {
    throw new Error("Formal browser smoke refuses demo-password. Use the formal Windows host password, or --allowDemoPassword only for local fake-host tests.");
  }
}

function runBrowserSmoke(args, password) {
  const browserArgs = makeBrowserArgs(args);
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, browserArgs, {
      cwd: repoRoot,
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: password,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 1000);
    }, args.timeoutMs + 5000);
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
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({
        exitCode,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
      });
    });
  });
}

function runSendCall(args) {
  const sendArgs = makeSendCallArgs(args);
  if (sendArgs.length === 0) {
    return {
      attempted: false,
      ok: false,
      exitCode: null,
      payload: null,
      parseError: "",
      stdout: "",
      stderr: "",
      error: "Windows host is required before sending a board call.",
    };
  }
  const result = spawnSync(process.execPath, sendArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(Math.min(args.timeoutMs, 60000) + 5000, 10000),
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
  });
  const stdout = String(result.stdout || "").trim();
  let payload = null;
  let parseError = "";
  try {
    payload = JSON.parse(stdout);
  } catch (error) {
    parseError = error.message;
  }
  return {
    attempted: true,
    ok: result.status === 0 && Boolean(payload?.sentCall?.ok),
    exitCode: result.status,
    payload,
    parseError,
    stdout,
    stderr: String(result.stderr || ""),
    error: payload?.error?.message || parseError || String(result.stderr || "").trim(),
  };
}

function makeBoardSummary(report) {
  const target = report.args.host ? `${report.args.host}:${report.args.port}` : "<missing Windows host>";
  const discoveryText = report.discovery?.requested
    ? ` Discovery=${report.discovery.selected ? `${report.discovery.selected.host}:${report.discovery.selected.port}` : "requested"}.`
    : "";
  const discoveryChecklistText = makeDiscoveryChecklistText(report);
  const preflightFindings = formatPreflightFindings(report.preflight);
  const reverseGrantParts = makeReverseGrantBoardSummaryParts(report, report.args);
  const secureAuthParts = makeSecureAuthBoardSummaryParts(report, report.args);
  if (report.ok && report.browserSmoke?.ran) {
    return [
      `Mac client browser smoke passed against ${target}; duration=${report.browserSmoke.durationMs}ms.${discoveryText}${discoveryChecklistText}`,
      `Preflight ready=${report.preflight?.readyToCall ? "yes" : "no"}; ${preflightFindings}; command used environment password, not argv.`,
      `MacClientFormalChecklist=${report.commands?.macClientFormalChecklist || makePreflightCommand(report.args)}.`,
      ...reverseGrantParts,
      ...secureAuthParts,
      `Reverse rehearsal next if needed: ${makeReverseControlRehearsalBoardText()}`,
      "No password was sent to Agent Link Board; inject was not executed.",
    ].join(" ");
  }
  if (report.preflightOnly || report.dryRun) {
    const sendCallText = report.commands?.sendCall && report.preflight?.readyToCall
      ? report.sentCall?.ok
        ? " Agent Link Board call was sent."
        : report.sentCall?.attempted
          ? ` Agent Link Board call was not sent: ${report.sentCall.error || "sendCall failed"}.`
        : ` Coordinate first if Windows needs a board call: ${report.commands.sendCall}.`
      : "";
    const nextText = report.commands?.browserSmoke
      ? `Next: run with --promptPassword when ready to authenticate; command=${report.commands.browserSmoke}.${sendCallText}`
      : `Next: start or discover a Windows host, then rerun safe preflight; command=${report.commands?.discoverPreflight || ""}.`;
    return [
      `Mac client browser smoke preflight for ${target}: ok=${report.preflight?.ok ? "yes" : "no"} ready=${report.preflight?.readyToCall ? "yes" : "no"}; ${preflightFindings}.${discoveryText}${discoveryChecklistText}`,
      nextText,
      `MacClientFormalChecklist=${report.commands?.macClientFormalChecklist || makePreflightCommand(report.args)}.`,
      `MacClientBrowserSelfTest=${report.commands?.macClientBrowserSelfTest || makeMacClientBrowserSelfTestCommand()}.`,
      `ReverseGrantCopy=${report.commands?.reverseGrantCopyAction || makeReverseGrantCopyAction()}.`,
      ...reverseGrantParts,
      ...secureAuthParts,
      `Reverse rehearsal after auth: ${makeReverseControlRehearsalBoardText()}`,
      "No password was requested or sent; inject was not executed.",
    ].join(" ");
  }
  return [
    `Mac client browser smoke failed/blocked for ${target}: ${report.error?.message || report.browserSmoke?.error || "unknown"}. Preflight ${preflightFindings}.`,
    `MacClientFormalChecklist=${report.commands?.macClientFormalChecklist || makePreflightCommand(report.args)}.`,
    ...secureAuthParts,
    "Keep passwords off Agent Link Board; rerun preflight before retrying.",
    "Inject was not executed.",
  ].join(" ");
}

function formatPreflightFindings(preflight) {
  const blockers = summarizePreflightChecklistIds(preflight?.checklist, "blocker");
  const warnings = summarizePreflightChecklistIds(preflight?.checklist, "warning");
  return `blockers=${blockers} warnings=${warnings}`;
}

function summarizePreflightChecklistIds(checklist, status) {
  const ids = [...new Set((Array.isArray(checklist) ? checklist : [])
    .filter((entry) => entry.status === status)
    .map((entry) => entry.id)
    .filter(Boolean))];
  if (ids.length === 0) return "none";
  if (ids.length <= 4) return ids.join(",");
  return `${ids.slice(0, 4).join(",")}+${ids.length - 4}more`;
}

function makeDiscoveryChecklistText(report) {
  if (!report.discovery?.requested || !report.discovery?.formalChecklistCommand) return "";
  const manual = report.discovery.manualChecklistSummary
    ? ` ManualChecklist=${report.discovery.manualChecklistSummary}.`
    : "";
  return ` FormalChecklist=${report.discovery.formalChecklistCommand}.${manual}`;
}

function printHuman(report) {
  console.log("Mac client formal browser smoke");
  console.log(`- target: ${report.args.host || "<missing>"}:${report.args.port}`);
  if (report.discovery?.requested) {
    console.log(`- discovery: ${report.discovery.ok ? "ok" : "failed"}${report.discovery.selected ? ` selected=${report.discovery.selected.host}:${report.discovery.selected.port}` : ""}`);
  }
  console.log(`- preflight: ok=${report.preflight?.ok ? "yes" : "no"} ready=${report.preflight?.readyToCall ? "yes" : "no"}`);
  if (report.preflight?.counts) {
    console.log(`- checklist: ${report.preflight.counts.blocker} blockers, ${report.preflight.counts.warning} warnings`);
  }
  if (report.dryRun) {
    console.log(`- dryRun command: ${report.commands.browserSmoke}`);
  } else if (report.preflightOnly) {
    console.log("- browser smoke: skipped (--preflightOnly)");
  } else if (report.browserSmoke?.ran) {
    console.log(`- browser smoke: ${report.browserSmoke.ok ? "passed" : "failed"} (${report.browserSmoke.durationMs}ms)`);
  }
  if (report.error?.message) console.log(`- error: ${report.error.message}`);
  console.log(report.boardSummary);
}

function makeReport(args, preflight) {
  const windowsSecureAuthPath = preflight.payload?.runPlan?.commands?.windowsSecureAuthPath || "";
  return {
    ok: false,
    preflightOnly: args.preflightOnly,
    dryRun: args.dryRun,
    checkedAt: new Date().toISOString(),
    args: {
      host: args.host,
      port: args.port,
      discover: args.discover,
      discoverHosts: args.discoverHosts,
      discoverSubnets: args.discoverSubnets,
      discoverNoLocalSubnets: args.discoverNoLocalSubnets,
      discoverTimeoutMs: args.discoverTimeoutMs,
      discoverScanTimeoutMs: args.discoverScanTimeoutMs,
      clientHost: args.clientHost,
      clientPort: args.clientPort,
      debugPort: args.debugPort,
      skipBoard: args.skipBoard,
      allowDirty: args.allowDirty,
      allowPreflightWarnings: args.allowPreflightWarnings,
      ensureClient: args.ensureClient,
      sendCall: args.sendCall,
      forceCall: args.forceCall,
      skipAudio: args.skipAudio,
      skipFileClipboard: args.skipFileClipboard,
      allowClipboardFallback: args.allowClipboardFallback,
    },
    commands: {
      macClientFormalChecklist: makePreflightCommand(args),
      preflight: makePreflightCommand(args),
      sendCall: makeSendCallCommand(args),
      discoverPreflight: makeDiscoveryRetryCommand(args),
      browserSmoke: makeBrowserSmokeCommand(args),
      macClientBrowserSelfTest: makeMacClientBrowserSelfTestCommand(),
      windowsReverseGrantStatus: makeWindowsReverseGrantCommand(args, "status"),
      windowsOpenOneTimeReverseGrant: makeWindowsReverseGrantCommand(args, "grant"),
      windowsReverseGrantStatusPowerShell: makeWindowsReverseGrantPowerShellCommand(args, "status"),
      windowsOpenOneTimeReverseGrantPowerShell: makeWindowsReverseGrantPowerShellCommand(args, "grant"),
      windowsReverseGrantStatusNodeFallback: makeWindowsReverseGrantNodeFallbackCommand(args, "status"),
      windowsOpenOneTimeReverseGrantNodeFallback: makeWindowsReverseGrantNodeFallbackCommand(args, "grant"),
      reverseControlRehearsal: makeReverseControlRehearsalText(args),
      reverseGrantCopyAction: makeReverseGrantCopyAction(),
      secureAuthPath: makeSecureAuthPathText(args, windowsSecureAuthPath),
      windowsSecureAuthPath,
      windowsSecureAuthStart: makeWindowsSecureAuthStartPowerShellCommand(args),
      windowsSecureAuthStartNodeFallback: makeWindowsSecureAuthStartNodeFallbackCommand(args),
    },
    preflight: preflight.payload,
    preflightRaw: {
      exitCode: preflight.exitCode,
      parseError: preflight.parseError,
    },
  };
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (error) {
    const message = redact(error.message, process.env.LAN_DUAL_PASSWORD || "");
    if (process.argv.includes("--json")) {
      console.log(JSON.stringify({
        ok: false,
        checkedAt: new Date().toISOString(),
        error: { message },
      }, null, 2));
    } else if (process.argv.includes("--boardSummary")) {
      console.log(`Mac client browser smoke blocked: ${message}. No password was requested or sent; inject was not executed.`);
    } else {
      console.error(`[FAIL] ${message}`);
    }
    process.exitCode = 1;
    return;
  }
  let ensuredClient = { attempted: false };
  let discovery = { requested: false };
  try {
    ensuredClient = ensureClientServer(args);
    if (ensuredClient.attempted && !ensuredClient.ok) {
      throw new Error(`Mac client page could not be ensured: ${ensuredClient.error || "unknown error"}`);
    }
    discovery = runDiscovery(args);
    applyDiscovery(args, discovery);
  } catch (error) {
    const report = makeReport(args, {
      exitCode: null,
      payload: null,
      parseError: "",
    });
    report.ensuredClient = summarizeEnsuredClient(ensuredClient);
    report.discovery = summarizeDiscovery(discovery);
    report.error = { message: redact(error.message, process.env.LAN_DUAL_PASSWORD || "") };
    report.boardSummary = makeBoardSummary(report);
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else if (args.boardSummary) {
      console.log(report.boardSummary);
    } else {
      printHuman(report);
    }
    process.exitCode = 1;
    return;
  }
  const preflight = runPreflight(args);
  const report = makeReport(args, preflight);
  report.ensuredClient = summarizeEnsuredClient(ensuredClient);
  report.discovery = summarizeDiscovery(discovery);
  try {
    if (!args.host) {
      throw new Error("--host <Windows IP> is required. Run scripts/mac/discover-windows-hosts.mjs --boardSummary first if needed.");
    }
    if (!preflight.payload) {
      throw new Error(`formal checklist did not produce JSON: ${preflight.parseError || "unknown parse error"}`);
    }
    if (!preflight.payload.ok) {
      throw new Error(`formal checklist has blockers (${preflight.payload.counts?.blocker ?? "unknown"}).`);
    }
    if (!args.preflightOnly && !args.dryRun && !args.allowPreflightWarnings && !preflight.payload.readyToCall) {
      throw new Error("formal checklist is not readyToCall. Clear warnings/blockers or rerun preflight with board available before browser auth.");
    }
    if (args.preflightOnly) {
      report.ok = preflight.exitCode === 0;
      if (args.sendCall) {
        if (!preflight.payload?.readyToCall) {
          throw new Error("formal checklist is not readyToCall; refusing to send Agent Link Board call.");
        }
        const sentCall = runSendCall(args);
        report.sentCall = {
          attempted: sentCall.attempted,
          ok: sentCall.ok,
          exitCode: sentCall.exitCode,
          payload: sentCall.payload?.sentCall?.payload || sentCall.payload?.callPayload || null,
          boardCallBeforeSend: sentCall.payload?.boardCallBeforeSend || null,
          error: sentCall.ok ? "" : redact(sentCall.error || "sendCall failed", process.env.LAN_DUAL_PASSWORD || ""),
        };
        if (!sentCall.ok) {
          throw new Error(`sendCall failed: ${report.sentCall.error}`);
        }
      }
    } else if (args.dryRun) {
      report.ok = true;
    } else {
      const password = await preparePassword(args);
      validatePassword(args, password);
      const browserSmoke = await runBrowserSmoke(args, password);
      report.browserSmoke = {
        ran: true,
        ok: browserSmoke.exitCode === 0 && !browserSmoke.timedOut,
        exitCode: browserSmoke.exitCode,
        timedOut: browserSmoke.timedOut,
        durationMs: browserSmoke.durationMs,
        stdout: redact(browserSmoke.stdout, password),
        stderr: redact(browserSmoke.stderr, password),
      };
      if (!report.browserSmoke.ok) {
        throw new Error(`browser smoke failed with exit=${browserSmoke.exitCode}${browserSmoke.timedOut ? " timed out" : ""}`);
      }
      report.ok = true;
    }
  } catch (error) {
    report.error = { message: redact(error.message, process.env.LAN_DUAL_PASSWORD || "") };
    report.ok = false;
  }
  report.boardSummary = makeBoardSummary(report);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printHuman(report);
  }
  if (!report.ok) process.exitCode = 1;
}

function summarizeDiscovery(discovery) {
  if (!discovery?.requested) return { requested: false };
  const best = discovery.payload?.best || null;
  return {
    requested: true,
    ok: Boolean(discovery.payload?.ok && best),
    exitCode: discovery.exitCode,
    foundCount: Array.isArray(discovery.payload?.found) ? discovery.payload.found.length : 0,
    ignoredCount: Array.isArray(discovery.payload?.ignored) ? discovery.payload.ignored.length : 0,
    selected: best
      ? {
          host: best.host,
          port: best.port,
          deviceName: best.deviceName || best.name || "",
          buildId: best.runtime?.buildId || "",
          inputMode: best.capabilities?.input?.mode || best.capabilities?.inputMode || "",
        }
      : null,
    formalChecklistCommand: discovery.payload?.formalChecklistCommand || "",
    manualChecklistSummary: discovery.payload?.manualChecklistSummary || "",
    boardSummary: discovery.payload?.boardSummary || "",
    parseError: discovery.parseError || "",
  };
}

function summarizeEnsuredClient(ensuredClient) {
  if (!ensuredClient?.attempted) return { attempted: false };
  const payload = ensuredClient.payload || {};
  return {
    attempted: true,
    ok: Boolean(ensuredClient.ok),
    exitCode: ensuredClient.exitCode,
    signal: ensuredClient.signal || null,
    url: payload.url || "",
    online: Boolean(payload.online),
    processId: payload.processId || null,
    reusedExisting: payload.processId === null && Boolean(payload.online),
    error: ensuredClient.ok ? "" : ensuredClient.error || "",
  };
}

main().catch((error) => {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok: false, error: { message: redact(error.message, process.env.LAN_DUAL_PASSWORD || "") } }, null, 2));
  } else {
    console.error(`[FAIL] ${redact(error.message, process.env.LAN_DUAL_PASSWORD || "")}`);
  }
  process.exitCode = 1;
});
