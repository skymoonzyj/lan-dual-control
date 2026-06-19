#!/usr/bin/env node
import http from "node:http";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { formatWindowsLanRisk, readWindowsLanRiskFromBoard } from "./board-windows-lan-risk.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const clientFiles = [
  "apps/mac-client/index.html",
  "apps/mac-client/app.js",
  "apps/mac-client/styles.css",
  "apps/mac-client/server.mjs",
];
const nodeCheckFiles = [
  "apps/mac-client/app.js",
  "apps/mac-client/server.mjs",
];

const defaults = {
  clientHost: "127.0.0.1",
  clientPort: 5188,
  windowsHost: "",
  windowsPort: 43770,
  timeoutMs: 5000,
  server: "http://192.168.31.68:17888",
  checkBoard: false,
  probeClientServer: false,
  requireClientServer: false,
  probeWindowsHost: false,
  requireWindowsHost: false,
  requireClean: false,
  json: false,
  boardSummary: false,
};
const macUnattendedFreshnessStaleMs = 600000;
const allowedMacPowerStatuses = new Set(["ok", "warning", "unknown"]);
const allowedMacPowerReasons = new Set([
  "ok",
  "skipped",
  "not-checked",
  "pmset-failed",
  "system-sleep-enabled",
  "display-sleep-enabled",
  "network-wake-disabled",
]);
const allowedMacPowerWarnings = new Set([
  "none",
  "unknown",
  "system-sleep-enabled",
  "display-sleep-enabled",
  "network-wake-disabled",
]);
const allowedMacUnattendedStatuses = new Set(["ok", "warning", "blocked", "unknown"]);
const allowedMacUnattendedReasons = new Set([
  "ok",
  "skipped",
  "not-checked",
  "host-offline",
  "launch-agent-missing",
  "launch-agent-not-loaded",
  "launch-agent-max-fps",
  "power",
  "permissions",
  "pmset-failed",
  "unknown",
]);
const allowedMacUnattendedFindings = new Set([
  "none",
  "unknown",
  "host-offline",
  "launch-agent-missing",
  "launch-agent-not-loaded",
  "launch-agent-max-fps",
  "power",
  "permissions",
  "screen-recording",
  "accessibility",
  "input-monitoring",
  "pmset-failed",
]);

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/check-mac-client-readiness.mjs [options]

Builds a read-only readiness report for the Mac control client before Mac
connects to a Windows host. It does not start Mac client, does not start or
authenticate a Windows host, does not require or print a password, and does not
send input events.

Options:
  --clientHost <host>        Local Mac client web host. Default: ${defaults.clientHost}
  --clientPort <port>        Local Mac client web port. Default: ${defaults.clientPort}
  --probeClientServer        Probe an already-running local Mac client HTTP page.
  --requireClientServer      Fail if the local Mac client HTTP page is offline.
  --host <host>              Windows host discovery address. Also enables probe.
  --windowsHost <host>       Same as --host.
  --port <port>              Windows host discovery port. Default: ${defaults.windowsPort}
  --windowsPort <port>       Same as --port.
  --probeWindowsHost         Probe http://<host>:<port>/discovery when host is set.
  --requireWindowsHost       Fail if Windows host discovery is offline.
  --timeoutMs <ms>           Per probe timeout. Default: ${defaults.timeoutMs}
  --server <url>             Agent Link Board URL. Default: ${defaults.server}
  --checkBoard               Read one Agent Link Board snapshot with the CLI.
  --requireClean             Fail if the git worktree has uncommitted changes.
  --boardSummary             Print a short secret-free Agent Link Board summary.
  --json                     Print one machine-readable JSON object.
  --help, -h                 Show this help without probing anything.

Machine-readable JSON fields:
  commands.macClientPageStatusCommand
                             Secret-free local Mac client page status command.
                             It does not start the page or connect to Windows.
  commands.macClientCopyDiagnosticsAction
                             Safe in-page action for copying the Mac client
                             diagnostic report. It does not contain or request
                             a password.
  commands.macClientDiscoverWindowsCommand
                             Secret-free Windows host discovery command from
                             the Mac side. Its board summary includes the
                             formal checklist and ReverseRehearsal= guidance
                             when a Windows host is found.
  commands.windowsHostStatusCommand
                             Windows-side loopback status command to run on
                             the Windows host machine. It reports current host
                             status and, when offline, the safe start command.
  commands.macClientReverseRehearsalAction
                             Human action for the guarded reverse-control
                             request rehearsal after Windows discovery.
  commands.macClientReverseGrantCopyAction
                             Human action for confirming both reverse-grant
                             copy buttons after LAN008 without passwords or
                             input.
  commands.windowsReverseGrantStatusCommand
                             Windows-side PowerShell status command for the
                             local one-time reverse-control grant.
  commands.windowsOpenOneTimeReverseGrantCommand
                             Windows-side PowerShell command to open a short
                             local one-time reverse-control grant.
  commands.windowsReverseGrantStatusNodeFallbackCommand
                             Node fallback status command for the same local
                             Windows one-time reverse-control grant.
  commands.windowsOpenOneTimeReverseGrantNodeFallbackCommand
                             Node fallback command to open the same local
                             Windows one-time reverse-control grant.
  commands.macClientFormalChecklistCommand
                             Secret-free formal checklist command. It prints
                             the manual true-test checklist before true
                             Windows control without authenticating, prompting
                             for a password, sending a call, or sending input.
  commands.macClientFormalSmokeCommand
                             Secret-free formal smoke preflight command. It
                             may safely start/reuse the local Mac client page,
                             discovers Windows hosts, and prints a summary
                             without authenticating, prompting for a password,
                             sending a call, or sending input.
  commands.macClientPromptPasswordSmokeCommand
                             User-present browser smoke command. It discovers
                             Windows hosts, ensures the local Mac client page,
                             then asks for the password only when explicitly run.
  commands.macClientBrowserSelfTestCommand
                             Secret-free local browser self-test command. It
                             starts a temporary mock Windows host and prints a
                             one-line board summary without using a real host,
                             requesting a password, sending a call, or running
                             inject.
  commands.macPowerPlanCommand
                             Secret-free Mac power settings dry-run planner.
                             It previews pmset changes and follow-up checks
                             without applying settings, prompting,
                             authenticating, or sending input.
  commands.macRemoteAudioPlanCommand
                             Secret-free Mac remote-only audio planner. It
                             explains the current system-pcm behavior and the
                             user-consent checks required before remote-only
                             audio without changing system volume or output.
  commands.macInputSafetyPlanCommand
                             Secret-free Mac input safety planner. It explains
                             the log-mode default and user-visible checks
                             required before true input without applying
                             settings or sending input.
  commands.macScriptHelpCommand
                             Unified side-effect-free Mac script help
                             self-check command.
  board.windowsLanRisk       Secret-free WindowsLanRisk= hints copied from
                             Agent Link Board when --checkBoard is enabled.
                             Only safe comma-separated risk tokens are accepted.
  board.macUnattendedFreshness
                             Optional fresh/stale summary for current Mac
                             Unattended or MacPowerHealth evidence from Agent
                             Link Board when --checkBoard is enabled.

Examples:
  node scripts/mac/check-mac-client-readiness.mjs --json
  node scripts/mac/check-mac-client-readiness.mjs --probeClientServer --boardSummary
  node scripts/mac/check-mac-client-readiness.mjs --host 192.168.31.50 --port 43770 --boardSummary
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
      token === "--checkBoard" ||
      token === "--probeClientServer" ||
      token === "--requireClientServer" ||
      token === "--probeWindowsHost" ||
      token === "--requireWindowsHost" ||
      token === "--requireClean" ||
      token === "--boardSummary" ||
      token === "--json"
    ) {
      args[token.slice(2)] = true;
      continue;
    }
    if (token === "--clientHost" && next && !next.startsWith("--")) {
      args.clientHost = next;
      index += 1;
      continue;
    }
    if (token === "--clientPort" && next && !next.startsWith("--")) {
      args.clientPort = clampInteger(next, 1, 65535, defaults.clientPort);
      index += 1;
      continue;
    }
    if ((token === "--host" || token === "--windowsHost") && next && !next.startsWith("--")) {
      args.windowsHost = next;
      args.probeWindowsHost = true;
      index += 1;
      continue;
    }
    if ((token === "--port" || token === "--windowsPort") && next && !next.startsWith("--")) {
      args.windowsPort = clampInteger(next, 1, 65535, defaults.windowsPort);
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 1000, 60000, defaults.timeoutMs);
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
  args.clientHost = String(args.clientHost || defaults.clientHost).trim();
  args.windowsHost = String(args.windowsHost || "").trim();
  args.server = String(args.server || defaults.server).trim();
  if (args.requireClientServer) args.probeClientServer = true;
  if (args.requireWindowsHost) args.probeWindowsHost = true;
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
    maxBuffer: options.maxBuffer || 4 * 1024 * 1024,
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

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasSecretLikeCommandValue(text) {
  const source = String(text || "");
  return (
    /\bLAN_DUAL_PASSWORD\s*=/i.test(source) ||
    /\b(?:token|secret|passwd|pwd)\s*[:=]\s*\S+/i.test(source) ||
    /(?:^|\s)--(?:password|token|secret|passwd|pwd)(?:[=\s]\S+)?/i.test(source)
  );
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getCurrentBuildId() {
  const result = command("git", ["rev-parse", "--short", "HEAD"], { timeoutMs: 3000 });
  return result.ok ? normalizedText(result.stdout) : "";
}

function getGitStatus() {
  const branch = command("git", ["status", "--short", "--branch"], { timeoutMs: 5000 });
  const log = command("git", ["log", "--oneline", "--decorate", "-1"], { timeoutMs: 5000 });
  const statusLines = splitLines(branch.stdout);
  const changes = statusLines.filter((line) => !line.startsWith("##"));
  const branchLine = statusLines.find((line) => line.startsWith("##")) || "";
  return {
    ok: branch.ok && log.ok,
    branchLine,
    head: normalizedText(log.stdout),
    clean: branch.ok && changes.length === 0,
    changes,
    statusText: normalizedText(branch.stdout),
    errors: [branch.error || branch.stderr, log.error || log.stderr].map(normalizedText).filter(Boolean),
  };
}

function checkClientFiles() {
  const files = clientFiles.map((path) => ({
    path,
    exists: existsSync(`${repoRoot}${path}`),
  }));
  const missing = files.filter((file) => !file.exists).map((file) => file.path);
  const nodeChecks = nodeCheckFiles.map((path) => {
    const result = command(process.execPath, ["--check", path], { timeoutMs: 5000 });
    return {
      path,
      ok: result.ok,
      error: normalizedText(result.stderr || result.stdout || result.error),
    };
  });
  return {
    ok: missing.length === 0 && nodeChecks.every((check) => check.ok),
    files,
    missing,
    nodeChecks,
  };
}

function requestText(url, timeoutMs) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 512 * 1024) {
          request.destroy(new Error("response too large"));
        }
      });
      response.on("end", () => {
        resolveRequest({ statusCode: response.statusCode || 0, body });
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error(`timed out after ${timeoutMs}ms`));
    });
    request.on("error", rejectRequest);
  });
}

async function probeClientServer(args) {
  const url = `http://${args.clientHost}:${args.clientPort}/`;
  const result = {
    checked: args.probeClientServer,
    online: false,
    url,
    statusCode: 0,
    titleFound: false,
    error: null,
  };
  if (!args.probeClientServer) return result;
  try {
    const response = await requestText(url, args.timeoutMs);
    result.statusCode = response.statusCode;
    result.online = response.statusCode >= 200 && response.statusCode < 300;
    result.titleFound = /LAN Dual|Mac 控制|控制 Windows|远程/.test(response.body);
    if (!result.online) {
      result.error = { message: `HTTP ${response.statusCode}` };
    }
  } catch (error) {
    result.error = { message: error.message };
  }
  return result;
}

async function requestJson(url, timeoutMs) {
  const response = await requestText(url, timeoutMs);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`HTTP ${response.statusCode}`);
  }
  try {
    return JSON.parse(response.body);
  } catch (error) {
    throw new Error(`invalid JSON: ${error.message}`);
  }
}

async function probeWindowsHost(args) {
  const checked = args.probeWindowsHost && Boolean(args.windowsHost);
  const url = checked ? `http://${args.windowsHost}:${args.windowsPort}/discovery` : "";
  const result = {
    checked,
    online: false,
    probe: {
      host: args.windowsHost,
      port: args.windowsPort,
      url,
    },
    device: null,
    runtime: null,
    capabilities: null,
    recommendedCommand: args.windowsHost
      ? `node scripts/windows/test-mac-client-browser.mjs --useExistingHost --host ${args.windowsHost} --port ${args.windowsPort} --enableAudio --expectAudioPayload --expectAudioPlayback`
      : "",
    error: null,
  };
  if (!checked) return result;
  try {
    const discovery = await requestJson(url, args.timeoutMs);
    const capabilities = discovery.capabilities || {};
    const screen = capabilities.screen || {};
    const audio = capabilities.audio || {};
    const input = capabilities.input || {};
    const clipboard = capabilities.clipboard || {};
    result.online = true;
    result.device = {
      name: discovery.name || discovery.deviceName || "",
      platform: discovery.platform || "windows",
      host: discovery.host || args.windowsHost,
      port: discovery.port || discovery.controlPort || args.windowsPort,
      controlPort: discovery.controlPort || discovery.port || args.windowsPort,
    };
    result.runtime = discovery.runtime || null;
    result.capabilities = {
      screen,
      audio,
      input,
      clipboard: {
        text: Boolean(capabilities.clipboardText ?? clipboard.text),
        textMode: capabilities.clipboardTextMode ?? clipboard.textMode ?? "",
        file: Boolean(capabilities.clipboardFile ?? clipboard.file),
        fileMode: capabilities.clipboardFileMode ?? clipboard.fileMode ?? "",
      },
      reverseControl: Boolean(capabilities.reverseControl),
      mock: Boolean(capabilities.mock),
      videoTransports: Array.isArray(screen.videoTransports)
        ? screen.videoTransports
        : Array.isArray(capabilities.videoTransports)
          ? capabilities.videoTransports
          : [],
    };
  } catch (error) {
    result.error = { message: error.message };
  }
  return result;
}

function checkBoard(args) {
  if (!args.checkBoard) {
    return {
      checked: false,
      ok: false,
      summary: "not checked",
      error: "",
    };
  }
  const result = command(process.execPath, [
    "scripts/codex-link-client.mjs",
    "--server",
    args.server,
    "watch",
    "--once",
  ], { timeoutMs: Math.max(args.timeoutMs, 5000), maxBuffer: 2 * 1024 * 1024 });
  return {
    checked: true,
    ok: result.ok,
    summary: result.ok ? "readable" : "not readable",
    error: result.ok ? "" : normalizedText(result.error || result.stderr),
  };
}

function statusValue(value) {
  if (value === true) return "on";
  if (value === false) return "off";
  return "unknown";
}

function screenSummary(screen = {}) {
  const parts = [];
  if (screen.active !== undefined) parts.push(`active=${statusValue(screen.active)}`);
  if (screen.mode) parts.push(`mode=${screen.mode}`);
  if (screen.capturePipeline) parts.push(`pipeline=${screen.capturePipeline}`);
  if (screen.codec) parts.push(`codec=${screen.codec}`);
  if (screen.h264Encoder) parts.push(`h264Encoder=${screen.h264Encoder}`);
  if (Array.isArray(screen.videoTransports) && screen.videoTransports.length > 0) {
    parts.push(`transports=${screen.videoTransports.join("/")}`);
  }
  return parts.length > 0 ? parts.join(" ") : "screen capability present";
}

function audioSummary(audio = {}) {
  const mode = audio.mode || audio.audioMode || "";
  const enabled = audio.enabled ?? audio.active ?? audio.system ?? audio.wasapi;
  const parts = [];
  if (enabled !== undefined) parts.push(`active=${statusValue(enabled)}`);
  if (mode) parts.push(`mode=${mode}`);
  if (audio.codec) parts.push(`codec=${audio.codec}`);
  return parts.length > 0 ? parts.join(" ") : "audio capability present";
}

function buildChecklist({ git, client, clientServer, windowsHost, board }, args) {
  const checklist = [];
  const windowsHostStatusCommand = makeWindowsHostStatusCommand(windowsHost, args);
  const lanRisk = windowsLanRiskHint(board);
  const add = (id, status, summary, detail = "", next = "") => {
    checklist.push({ id, status, summary, detail, next });
  };

  if (git.clean) {
    add("repo", "ok", `repo clean at ${git.head || "unknown"}`);
  } else if (args.requireClean) {
    add("repo", "blocker", `${git.changes.length} local change(s) present`, git.changes.join("; "), "Commit/stash before relying on this readiness result.");
  } else {
    add("repo", "warning", `${git.changes.length} local change(s) present`, git.changes.join("; "), "Commit/stash before pushing or asking Windows to rely on this exact repo state.");
  }

  if (client.ok) {
    add("client-files", "ok", "Mac client files present and JS syntax checks pass");
  } else {
    const missing = client.missing.length > 0 ? `missing=${client.missing.join(", ")}` : "";
    const failed = client.nodeChecks.filter((check) => !check.ok).map((check) => `${check.path}: ${check.error}`).join("; ");
    add("client-files", "blocker", "Mac client static/syntax check failed", [missing, failed].filter(Boolean).join("; "), "Fix Mac client files before browser readiness.");
  }

  if (!clientServer.checked) {
    add("client-server", "warning", "local Mac client HTTP server not checked", "", "Run node apps/mac-client/server.mjs or rerun with --probeClientServer.");
  } else if (clientServer.online && clientServer.titleFound) {
    add("client-server", "ok", `local Mac client page reachable at ${clientServer.url}`);
  } else if (clientServer.online) {
    add("client-server", args.requireClientServer ? "blocker" : "warning", `HTTP reachable but page shape unexpected at ${clientServer.url}`, "", "Confirm the local Mac client server is serving apps/mac-client.");
  } else {
    add("client-server", args.requireClientServer ? "blocker" : "warning", `local Mac client page offline at ${clientServer.url}`, clientServer.error?.message || "", "Start with: node apps/mac-client/server.mjs");
  }

  if (!board.checked) {
    add("board", "warning", "Agent Link Board not checked", "", "Rerun with --checkBoard before asking Windows Codex to coordinate a true test.");
  } else if (board.ok) {
    add("board", "ok", "Agent Link Board readable");
  } else {
    add("board", "blocker", "Agent Link Board not readable", board.error, "Open/check the board before cross-machine testing.");
  }

  if (!windowsHost.checked) {
    add("windows-host", "warning", "Windows host discovery not checked", "", `Ask Windows Codex to run on the Windows host machine: ${windowsHostStatusCommand}.${lanRisk} Then start safely if needed and rerun with --host <Windows IP> --port 43770.`);
  } else if (!windowsHost.online) {
    add("windows-host", args.requireWindowsHost ? "blocker" : "warning", `Windows host discovery offline at ${windowsHost.probe.host}:${windowsHost.probe.port}`, windowsHost.error?.message || "", `Ask Windows Codex to run on the Windows host machine: ${windowsHostStatusCommand}.${lanRisk} Then start safely if needed and rerun this preflight.`);
  } else {
    const runtime = windowsHost.runtime?.buildId ? ` build=${windowsHost.runtime.buildId}` : "";
    const device = windowsHost.device?.name || "Windows host";
    add("windows-host", "ok", `${device} discovery online at ${windowsHost.probe.host}:${windowsHost.probe.port}${runtime}`);
    add("screen", "ok", screenSummary(windowsHost.capabilities?.screen || {}));
    add("audio", "ok", audioSummary(windowsHost.capabilities?.audio || {}));
    add("input", "ok", `input=${statusValue(windowsHost.capabilities?.input?.enabled ?? windowsHost.capabilities?.input?.active)} mode=${windowsHost.capabilities?.input?.mode || "unknown"}`);
    add("clipboard", "ok", `text=${statusValue(windowsHost.capabilities?.clipboard?.text)} file=${statusValue(windowsHost.capabilities?.clipboard?.file)}`);
  }

  add("password", "ok", "no password collected by this preflight", "", "Only type the Windows host password into the Mac client UI or a dedicated test command when you intentionally run a real auth test.");
  return checklist;
}

function countChecklist(checklist, status) {
  return checklist.filter((item) => item.status === status).length;
}

function makeRecommendations(checklist, windowsHost, args, board = {}) {
  const blockers = checklist.filter((item) => item.status === "blocker");
  if (blockers.length > 0) {
    return blockers.map((item) => ({
      level: "blocker",
      text: item.next || item.summary,
    }));
  }
  const recommendations = [];
  if (!windowsHost.checked || !windowsHost.online) {
    recommendations.push({
      level: "next",
      text: `Ask Windows Codex to run on the Windows host machine: ${makeWindowsHostStatusCommand(windowsHost, args)}.${windowsLanRiskHint(board)} Then start safely if needed and rerun with --host <Windows IP> --port 43770 --checkBoard --boardSummary.`,
    });
  } else {
    recommendations.push({
      level: "next",
      text: windowsHost.recommendedCommand,
    });
  }
  recommendations.push({
    level: "safety",
    text: "Do not send passwords on Agent Link Board; do not run real input injection unless the user explicitly confirms they are watching.",
  });
  return recommendations;
}

function makeMacClientCopyDiagnosticsAction() {
  return "Mac client 事件日志点击“复制诊断”，粘贴前确认不包含连接密码";
}

function makeMacClientPageStatusCommand() {
  return "node scripts/mac/start-mac-client.mjs --status --boardSummary";
}

function makeMacClientDiscoverWindowsCommand() {
  return "node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary";
}

function makeWindowsHostStatusCommand(windowsHost = {}, args = {}) {
  const targetPort = windowsHost.probe?.port || args.windowsPort || defaults.windowsPort;
  return `node scripts/windows/start-windows-host.mjs --status --host 127.0.0.1 --port ${targetPort} --boardSummary`;
}

function makeMacClientReverseRehearsalAction() {
  return "Run MacClientDiscoverWindows first, then use its ReverseRehearsal= line: Mac requests reverse control and expects LAN008, Windows runs the local loopback one-time grant, Mac retries and expects accepted/临时授权已使用";
}

function makeMacClientReverseGrantCopyAction() {
  return "LAN008 后在 Mac client 页面点击“复制 PowerShell”和“复制 Node”，确认复制文本不含连接密码且不会发送 input_event";
}

function makeWindowsReverseGrantPowerShellCommand(windowsHost = {}, args = {}, action = "grant") {
  const targetPort = windowsHost.probe?.port || args.windowsPort || defaults.windowsPort;
  const parts = [
    "pwsh -NoProfile -ExecutionPolicy Bypass",
    "-File",
    "scripts/windows/allow-windows-reverse-control.ps1",
    "-HostName",
    "127.0.0.1",
    "-Port",
    String(targetPort),
  ];
  if (action === "status") {
    parts.push("-Status");
  } else {
    parts.push("-Grant", "-DurationMs", "30000");
  }
  parts.push("-BoardSummary");
  return parts.join(" ");
}

function makeWindowsReverseGrantNodeFallbackCommand(windowsHost = {}, args = {}, action = "grant") {
  const targetPort = windowsHost.probe?.port || args.windowsPort || defaults.windowsPort;
  const parts = [
    "node scripts/windows/allow-windows-reverse-control.mjs",
    "--host",
    "127.0.0.1",
    "--port",
    String(targetPort),
  ];
  if (action === "status") {
    parts.push("--status");
  } else {
    parts.push("--grant", "--durationMs", "30000");
  }
  parts.push("--boardSummary");
  return parts.join(" ");
}

function makeMacClientFormalChecklistCommand(windowsHost = {}, args = {}) {
  const targetHost = windowsHost.probe?.host || args.windowsHost || "<Windows IP>";
  const targetPort = windowsHost.probe?.port || args.windowsPort || defaults.windowsPort;
  if (!windowsHost.probe?.host && !args.windowsHost) {
    return `node scripts/mac/check-mac-client-formal-status.mjs --discover --port ${targetPort} --boardSummary`;
  }
  return `node scripts/mac/check-mac-client-formal-status.mjs --host ${targetHost} --port ${targetPort} --boardSummary`;
}

function makeMacClientFormalSmokeCommand() {
  return "node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary";
}

function makeMacClientPromptPasswordSmokeCommand() {
  return "node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --promptPassword --boardSummary";
}

function makeMacClientBrowserSelfTestCommand() {
  return "node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs --boardSummary";
}

function makeMacPowerPlanCommand() {
  return "node scripts/mac/plan-mac-power-settings.mjs --profile all --sleep 0 --displaySleep 0 --networkWake on --boardSummary";
}

function makeMacRemoteAudioPlanCommand() {
  return "node scripts/mac/plan-mac-remote-audio.mjs --boardSummary";
}

function makeMacInputSafetyPlanCommand() {
  return "node scripts/mac/plan-mac-input-safety.mjs --boardSummary";
}

function makeMacScriptHelpCommand() {
  return "node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary";
}

async function readMacUnattendedFreshnessFromBoard(options = {}) {
  const enabled = Boolean(options.enabled ?? options.checkBoard);
  if (!enabled) return null;
  try {
    const state = await readBoardState(options.server, options.timeoutMs);
    return collectMacUnattendedFreshnessFromBoardState(state);
  } catch {
    return null;
  }
}

async function readBoardState(server, timeoutMs) {
  const baseUrl = String(server || "").trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("missing Agent Link Board URL");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 5000));
  try {
    const token = process.env.CODEX_LINK_TOKEN || "";
    const response = await fetch(`${baseUrl}/api/state`, {
      cache: "no-store",
      signal: controller.signal,
      headers: token ? { "X-Codex-Link-Token": token } : {},
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function collectMacUnattendedFreshnessFromBoardState(state, nowMs = Date.now()) {
  for (const text of collectBoardMacUnattendedTexts(state)) {
    const freshness = extractMacUnattendedFreshness(text, nowMs);
    if (freshness) return freshness;
  }
  return null;
}

function collectBoardMacUnattendedTexts(state) {
  const priorityStatusTexts = [];
  const statusTexts = [];
  const eventTexts = [];
  const statuses = state && typeof state === "object" && state.statuses && typeof state.statuses === "object"
    ? state.statuses
    : {};
  for (const [device, entry] of Object.entries(statuses)) {
    if (typeof entry === "string") {
      const statusText = `${device}: ${entry}`;
      if (isMacUnattendedPriorityText(device, statusText)) {
        priorityStatusTexts.push(statusText);
      } else {
        statusTexts.push(statusText);
      }
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const statusText = [device, entry.status, entry.note, entry.text, entry.message, entry.summary]
      .map(normalizedText)
      .filter(Boolean)
      .join(" ");
    if (!statusText) continue;
    if (isMacUnattendedPriorityText(device, statusText)) {
      priorityStatusTexts.push(statusText);
    } else {
      statusTexts.push(statusText);
    }
  }

  const events = Array.isArray(state?.events) ? state.events : [];
  for (const event of events) {
    if (typeof event === "string") {
      eventTexts.push(event);
      continue;
    }
    if (!event || typeof event !== "object") continue;
    const eventText = [event.device, event.from, event.status, event.note, event.text, event.message, event.summary]
      .map(normalizedText)
      .filter(Boolean)
      .join(" ");
    if (eventText) eventTexts.push(eventText);
  }
  return [...priorityStatusTexts, ...statusTexts, ...eventTexts].filter(Boolean);
}

function isMacUnattendedPriorityText(device, text) {
  return /\bMac Unattended\b/i.test(String(device || "")) || /\bMacUnattendedHealth=/i.test(String(text || ""));
}

function extractMacUnattendedFreshness(text, nowMs) {
  const unattended = extractMacUnattendedHealth(text);
  if (unattended) return makeMacUnattendedFreshness(unattended.checkedAt, "MacUnattendedHealth", nowMs);
  const power = extractMacPowerHealth(text);
  if (power) return makeMacUnattendedFreshness(power.checkedAt, "MacPowerHealth", nowMs);
  return null;
}

function extractMacUnattendedHealth(text) {
  const source = normalizedText(text);
  if (!source || !/\bMacUnattendedHealth=/i.test(source)) return null;
  if (hasSecretLikeCommandValue(source)) return null;
  const match = source.match(/\bMacUnattendedHealth=([A-Za-z]+)\s+reason=([A-Za-z0-9_-]+)\s+blockers=([A-Za-z0-9_,_-]+)\s+warnings=([A-Za-z0-9_,_-]+)\s+checkedAt=([0-9TZ:.-]+)/i);
  if (!match) return null;
  const status = match[1].toLowerCase();
  const reason = match[2];
  const blockers = match[3];
  const warnings = match[4];
  const checkedAt = cleanCheckedAt(match[5]);
  if (!allowedMacUnattendedStatuses.has(status)) return null;
  if (!allowedMacUnattendedReasons.has(reason)) return null;
  if (!isSafeMacUnattendedFindings(blockers)) return null;
  if (!isSafeMacUnattendedFindings(warnings)) return null;
  if (!Number.isFinite(Date.parse(checkedAt))) return null;
  return { status, reason, blockers, warnings, checkedAt };
}

function extractMacPowerHealth(text) {
  const source = normalizedText(text);
  if (!source || !/\bMacPowerHealth=/i.test(source)) return null;
  if (hasSecretLikeCommandValue(source)) return null;
  const match = source.match(/\bMacPowerHealth=([A-Za-z]+)\s+reason=([A-Za-z0-9_-]+)\s+warnings=([A-Za-z0-9_,_-]+)\s+checkedAt=([0-9TZ:.-]+)/i);
  if (!match) return null;
  const status = match[1].toLowerCase();
  const reason = match[2];
  const warnings = match[3];
  const checkedAt = cleanCheckedAt(match[4]);
  if (!allowedMacPowerStatuses.has(status)) return null;
  if (!allowedMacPowerReasons.has(reason)) return null;
  if (!isSafeMacPowerWarnings(warnings)) return null;
  if (!Number.isFinite(Date.parse(checkedAt))) return null;
  return { status, reason, warnings, checkedAt };
}

function cleanCheckedAt(value) {
  return String(value || "").replace(/[.,;]+$/g, "");
}

function isSafeMacUnattendedFindings(value) {
  const tokens = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => allowedMacUnattendedFindings.has(token));
}

function isSafeMacPowerWarnings(value) {
  const tokens = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => allowedMacPowerWarnings.has(token));
}

function makeMacUnattendedFreshness(checkedAt, source, nowMs) {
  const checkedMs = Date.parse(checkedAt);
  if (!Number.isFinite(checkedMs)) return null;
  const checkedAgeMs = Math.max(0, Math.trunc((Number.isFinite(nowMs) ? nowMs : Date.now()) - checkedMs));
  return {
    status: checkedAgeMs > macUnattendedFreshnessStaleMs ? "stale" : "fresh",
    checkedAt,
    checkedAgeMs,
    thresholdMs: macUnattendedFreshnessStaleMs,
    source,
  };
}

function formatMacUnattendedFreshnessSummary(freshness) {
  if (!freshness) return "";
  return [
    `MacUnattendedFreshness=${freshness.status || "unknown"}`,
    `checkedAgeMs=${Number.isFinite(freshness.checkedAgeMs) ? freshness.checkedAgeMs : "unknown"}`,
    `thresholdMs=${freshness.thresholdMs ?? macUnattendedFreshnessStaleMs}`,
    `checkedAt=${freshness.checkedAt || "unknown"}`,
    `source=${freshness.source || "unknown"}`,
  ].join(" ");
}

function makeBoardSummary(report) {
  const repo = report.git.clean ? "clean" : `dirty(${report.git.changes.length})`;
  const client = report.client.ok ? "ok" : "blocked";
  const clientServer = !report.clientServer.checked
    ? "not-checked"
    : report.clientServer.online
      ? "online"
      : "offline";
  const windows = !report.windowsHost.checked
    ? "not-checked"
    : report.windowsHost.online
      ? `online ${report.windowsHost.probe.host}:${report.windowsHost.probe.port} build=${report.windowsHost.runtime?.buildId || "unknown"}`
      : `offline ${report.windowsHost.probe.host}:${report.windowsHost.probe.port}`;
  const lanRisk = formatWindowsLanRisk(report.board?.windowsLanRisk);
  const lanRiskSummary = lanRisk ? ` ${lanRisk};` : "";
  const macUnattendedFreshness = formatMacUnattendedFreshnessSummary(report.board?.macUnattendedFreshness);
  const macUnattendedFreshnessSummary = macUnattendedFreshness ? ` ${macUnattendedFreshness};` : "";
  const findings = formatChecklistFindings(report.checklist);
  const diagnosticsEvidence = makeMacClientDiagnosticsEvidence(report);
  const next = report.recommendations[0]?.text || "No next step available.";
  return `Mac client readiness: repo=${repo}; client=${client}; localServer=${clientServer}; windowsHost=${windows};${lanRiskSummary}${macUnattendedFreshnessSummary} ${findings}.${diagnosticsEvidence} Next: ${next} MacClientPage=${report.commands.macClientPageStatusCommand}; MacClientDiscoverWindows=${report.commands.macClientDiscoverWindowsCommand}; WindowsHostStatus=${report.commands.windowsHostStatusCommand}; MacClientReverseRehearsal=${report.commands.macClientReverseRehearsalAction}; MacClientReverseGrantCopy=${report.commands.macClientReverseGrantCopyAction}; WindowsReverseGrantStatus=${report.commands.windowsReverseGrantStatusCommand}; WindowsOpenOneTimeReverseGrant=${report.commands.windowsOpenOneTimeReverseGrantCommand}; WindowsReverseGrantStatusNodeFallback=${report.commands.windowsReverseGrantStatusNodeFallbackCommand}; WindowsOpenOneTimeReverseGrantNodeFallback=${report.commands.windowsOpenOneTimeReverseGrantNodeFallbackCommand}; MacClientFormalChecklist=${report.commands.macClientFormalChecklistCommand}; MacClientFormalSmoke=${report.commands.macClientFormalSmokeCommand}; MacClientPromptPasswordSmoke=${report.commands.macClientPromptPasswordSmokeCommand}; MacClientBrowserSelfTest=${report.commands.macClientBrowserSelfTestCommand}; MacPowerPlan=${report.commands.macPowerPlanCommand}; MacRemoteAudioPlan=${report.commands.macRemoteAudioPlanCommand}; MacInputSafetyPlan=${report.commands.macInputSafetyPlanCommand}; MacScriptHelp=${report.commands.macScriptHelpCommand}; CopyDiagnostics=${report.commands.macClientCopyDiagnosticsAction}. Do not send passwords on Agent Link Board.`;
}

function makeMacClientDiagnosticsEvidence(report) {
  if (report.counts.blocker > 0) return "";
  if (!report.client.ok) return "";
  if (!report.clientServer.checked || !report.clientServer.online || !report.clientServer.titleFound) return "";
  if (!report.board.checked || !report.board.ok) return "";
  return " MacClientDiagnostics=status=ok probeClientServer=ok page=online blockers=none warnings=none Evidence=MacClientDiagnosticsOk;";
}

function windowsLanRiskHint(board = {}) {
  const risk = formatWindowsLanRisk(board.windowsLanRisk);
  return risk ? ` Current Agent Link Board hint: ${risk}.` : "";
}

function formatChecklistFindings(checklist) {
  const blockers = summarizeChecklistIds(checklist, "blocker");
  const warnings = summarizeChecklistIds(checklist, "warning");
  return `blockers=${blockers} warnings=${warnings}`;
}

function summarizeChecklistIds(checklist, status) {
  const ids = [...new Set((checklist || [])
    .filter((item) => item.status === status)
    .map((item) => item.id)
    .filter(Boolean))];
  if (ids.length === 0) return "none";
  if (ids.length <= 4) return ids.join(",");
  return `${ids.slice(0, 4).join(",")}+${ids.length - 4}more`;
}

function printHuman(report) {
  console.log("Mac client readiness");
  console.log(`- repo: ${report.git.clean ? "clean" : `dirty (${report.git.changes.length} changes)`}`);
  console.log(`- Mac client files: ${report.client.ok ? "ok" : "blocked"}`);
  console.log(`- local server: ${report.clientServer.checked ? (report.clientServer.online ? `online ${report.clientServer.url}` : `offline ${report.clientServer.url}`) : "not checked"}`);
  console.log(`- Windows host: ${report.windowsHost.checked ? (report.windowsHost.online ? `online ${report.windowsHost.probe.host}:${report.windowsHost.probe.port}` : `offline ${report.windowsHost.probe.host}:${report.windowsHost.probe.port}`) : "not checked"}`);
  console.log(`- Agent Link Board: ${report.board.checked ? (report.board.ok ? "readable" : "not readable") : "not checked"}`);
  const lanRisk = formatWindowsLanRisk(report.board.windowsLanRisk);
  if (lanRisk) console.log(`- Windows LAN risk: ${lanRisk}`);
  const macUnattendedFreshness = formatMacUnattendedFreshnessSummary(report.board.macUnattendedFreshness);
  if (macUnattendedFreshness) console.log(`- Mac unattended freshness: ${macUnattendedFreshness}`);
  console.log(`- Mac client page status: ${report.commands.macClientPageStatusCommand}`);
  console.log(`- Mac client discover Windows host: ${report.commands.macClientDiscoverWindowsCommand}`);
  console.log(`- Windows host status for Windows side: ${report.commands.windowsHostStatusCommand}`);
  console.log(`- Mac client reverse rehearsal: ${report.commands.macClientReverseRehearsalAction}`);
  console.log(`- Mac client reverse grant copy: ${report.commands.macClientReverseGrantCopyAction}`);
  console.log(`- Windows reverse grant status: ${report.commands.windowsReverseGrantStatusCommand}`);
  console.log(`- Windows one-time reverse grant: ${report.commands.windowsOpenOneTimeReverseGrantCommand}`);
  console.log(`- Windows reverse grant status (Node fallback): ${report.commands.windowsReverseGrantStatusNodeFallbackCommand}`);
  console.log(`- Windows one-time reverse grant (Node fallback): ${report.commands.windowsOpenOneTimeReverseGrantNodeFallbackCommand}`);
  console.log(`- Mac client formal checklist: ${report.commands.macClientFormalChecklistCommand}`);
  console.log(`- Mac client formal smoke preflight: ${report.commands.macClientFormalSmokeCommand}`);
  console.log(`- Mac client prompt-password smoke: ${report.commands.macClientPromptPasswordSmokeCommand}`);
  console.log(`- Mac client browser self-test: ${report.commands.macClientBrowserSelfTestCommand}`);
  console.log(`- Mac power settings dry-run plan: ${report.commands.macPowerPlanCommand}`);
  console.log(`- Mac remote audio plan: ${report.commands.macRemoteAudioPlanCommand}`);
  console.log(`- Mac input safety plan: ${report.commands.macInputSafetyPlanCommand}`);
  console.log(`- Mac script help safety check: ${report.commands.macScriptHelpCommand}`);
  console.log(`- Copy diagnostics: ${report.commands.macClientCopyDiagnosticsAction}`);
  console.log(`- result: ${report.ok ? "ready with warnings allowed" : "blocked"} (${report.counts.blocker} blockers, ${report.counts.warning} warnings)`);
  console.log("");
  for (const item of report.checklist) {
    const marker = item.status === "ok" ? "OK" : item.status === "blocker" ? "BLOCK" : "WARN";
    console.log(`[${marker}] ${item.id}: ${item.summary}`);
    if (item.detail) console.log(`      ${item.detail}`);
    if (item.next) console.log(`      Next: ${item.next}`);
  }
  console.log("");
  console.log(report.boardSummary);
}

async function buildReport(args) {
  const git = getGitStatus();
  const currentBuildId = getCurrentBuildId();
  const client = checkClientFiles();
  const [clientServer, windowsHost] = await Promise.all([
    probeClientServer(args),
    probeWindowsHost(args),
  ]);
  const board = checkBoard(args);
  const [windowsLanRisk, macUnattendedFreshness] = await Promise.all([
    readWindowsLanRiskFromBoard({
      enabled: args.checkBoard,
      server: args.server,
      timeoutMs: args.timeoutMs,
    }),
    readMacUnattendedFreshnessFromBoard({
      enabled: args.checkBoard,
      server: args.server,
      timeoutMs: args.timeoutMs,
    }),
  ]);
  board.windowsLanRisk = windowsLanRisk;
  board.macUnattendedFreshness = macUnattendedFreshness;
  const checklist = buildChecklist({ git, client, clientServer, windowsHost, board }, args);
  const counts = {
    ok: countChecklist(checklist, "ok"),
    warning: countChecklist(checklist, "warning"),
    blocker: countChecklist(checklist, "blocker"),
  };
  const report = {
    ok: counts.blocker === 0,
    currentBuildId,
    args: {
      clientHost: args.clientHost,
      clientPort: args.clientPort,
      windowsHost: args.windowsHost,
      windowsPort: args.windowsPort,
      checkBoard: args.checkBoard,
      probeClientServer: args.probeClientServer,
      requireClientServer: args.requireClientServer,
      probeWindowsHost: args.probeWindowsHost,
      requireWindowsHost: args.requireWindowsHost,
      requireClean: args.requireClean,
    },
    git,
    client,
    clientServer,
    windowsHost,
    board,
    checklist,
    counts,
    commands: {
      macClientPageStatusCommand: makeMacClientPageStatusCommand(),
      macClientDiscoverWindowsCommand: makeMacClientDiscoverWindowsCommand(),
      windowsHostStatusCommand: makeWindowsHostStatusCommand(windowsHost, args),
      macClientReverseRehearsalAction: makeMacClientReverseRehearsalAction(),
      macClientReverseGrantCopyAction: makeMacClientReverseGrantCopyAction(),
      windowsReverseGrantStatusCommand: makeWindowsReverseGrantPowerShellCommand(windowsHost, args, "status"),
      windowsOpenOneTimeReverseGrantCommand: makeWindowsReverseGrantPowerShellCommand(windowsHost, args, "grant"),
      windowsReverseGrantStatusNodeFallbackCommand: makeWindowsReverseGrantNodeFallbackCommand(windowsHost, args, "status"),
      windowsOpenOneTimeReverseGrantNodeFallbackCommand: makeWindowsReverseGrantNodeFallbackCommand(windowsHost, args, "grant"),
      macClientFormalChecklistCommand: makeMacClientFormalChecklistCommand(windowsHost, args),
      macClientFormalSmokeCommand: makeMacClientFormalSmokeCommand(),
      macClientPromptPasswordSmokeCommand: makeMacClientPromptPasswordSmokeCommand(),
      macClientBrowserSelfTestCommand: makeMacClientBrowserSelfTestCommand(),
      macPowerPlanCommand: makeMacPowerPlanCommand(),
      macRemoteAudioPlanCommand: makeMacRemoteAudioPlanCommand(),
      macInputSafetyPlanCommand: makeMacInputSafetyPlanCommand(),
      macScriptHelpCommand: makeMacScriptHelpCommand(),
      macClientCopyDiagnosticsAction: makeMacClientCopyDiagnosticsAction(),
    },
    recommendations: makeRecommendations(checklist, windowsHost, args, board),
    boardSummary: "",
  };
  report.boardSummary = makeBoardSummary(report);
  return report;
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  const report = await buildReport(args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printHuman(report);
  }
  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok: false, error: { message: error.message } }, null, 2));
  } else {
    console.error(`[FAIL] ${error.message}`);
  }
  process.exitCode = 1;
});
