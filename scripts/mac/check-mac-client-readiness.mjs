#!/usr/bin/env node
import http from "node:http";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
  commands.macClientFormalSmokeCommand
                             Secret-free formal smoke preflight command. It
                             may safely start/reuse the local Mac client page,
                             discovers Windows hosts, and prints a summary
                             without authenticating, prompting for a password,
                             sending a call, or sending input.
  commands.macClientBrowserSelfTestCommand
                             Secret-free local browser self-test command. It
                             starts a temporary mock Windows host and prints a
                             one-line board summary without using a real host,
                             requesting a password, sending a call, or running
                             inject.

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
    error: normalizedText(result.error || result.stderr || result.stdout),
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
    add("windows-host", "warning", "Windows host discovery not checked", "", "Start Windows host and rerun with --host <Windows IP> --port 43770.");
  } else if (!windowsHost.online) {
    add("windows-host", args.requireWindowsHost ? "blocker" : "warning", `Windows host discovery offline at ${windowsHost.probe.host}:${windowsHost.probe.port}`, windowsHost.error?.message || "", "Ask Windows Codex to start Windows host, then rerun this preflight.");
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

function makeRecommendations(checklist, windowsHost) {
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
      text: "Ask Windows Codex to start Windows host, then rerun with --host <Windows IP> --port 43770 --checkBoard --boardSummary.",
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

function makeMacClientFormalSmokeCommand() {
  return "node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary";
}

function makeMacClientBrowserSelfTestCommand() {
  return "node scripts/mac/test-mac-client-browser-self-test.mjs --boardSummary";
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
  const counts = `blockers=${report.counts.blocker} warnings=${report.counts.warning}`;
  const next = report.recommendations[0]?.text || "No next step available.";
  return `Mac client readiness: repo=${repo}; client=${client}; localServer=${clientServer}; windowsHost=${windows}; ${counts}. Next: ${next} MacClientPage=${report.commands.macClientPageStatusCommand}; MacClientFormalSmoke=${report.commands.macClientFormalSmokeCommand}; MacClientBrowserSelfTest=${report.commands.macClientBrowserSelfTestCommand}; CopyDiagnostics=${report.commands.macClientCopyDiagnosticsAction}. Do not send passwords on Agent Link Board.`;
}

function printHuman(report) {
  console.log("Mac client readiness");
  console.log(`- repo: ${report.git.clean ? "clean" : `dirty (${report.git.changes.length} changes)`}`);
  console.log(`- Mac client files: ${report.client.ok ? "ok" : "blocked"}`);
  console.log(`- local server: ${report.clientServer.checked ? (report.clientServer.online ? `online ${report.clientServer.url}` : `offline ${report.clientServer.url}`) : "not checked"}`);
  console.log(`- Windows host: ${report.windowsHost.checked ? (report.windowsHost.online ? `online ${report.windowsHost.probe.host}:${report.windowsHost.probe.port}` : `offline ${report.windowsHost.probe.host}:${report.windowsHost.probe.port}`) : "not checked"}`);
  console.log(`- Agent Link Board: ${report.board.checked ? (report.board.ok ? "readable" : "not readable") : "not checked"}`);
  console.log(`- Mac client page status: ${report.commands.macClientPageStatusCommand}`);
  console.log(`- Mac client formal smoke preflight: ${report.commands.macClientFormalSmokeCommand}`);
  console.log(`- Mac client browser self-test: ${report.commands.macClientBrowserSelfTestCommand}`);
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
      macClientFormalSmokeCommand: makeMacClientFormalSmokeCommand(),
      macClientBrowserSelfTestCommand: makeMacClientBrowserSelfTestCommand(),
      macClientCopyDiagnosticsAction: makeMacClientCopyDiagnosticsAction(),
    },
    recommendations: makeRecommendations(checklist, windowsHost),
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
