#!/usr/bin/env node
import http from "node:http";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const hostRuntimePaths = [
  "apps/mac-host/Package.swift",
  "apps/mac-host/Sources",
];

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  timeoutMs: 5000,
  server: "http://192.168.31.68:17888",
  checkBoard: false,
  requireClean: false,
  requireOnline: false,
  requireNoRuntimeChanges: false,
  json: false,
  boardSummary: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/check-mac-resume-status.mjs [options]

Prints a safe resume-status report for Mac Codex before continuing double-end
work. It is read-only: it does not start Mac host, does not authenticate a
WebSocket, does not require or print a password, and does not send input events.

Options:
  --host <host>              Mac host discovery host. Default: 127.0.0.1
  --port <port>              Mac host discovery port. Default: 43770
  --timeoutMs <ms>           Per probe timeout. Default: 5000
  --server <url>             Agent Link Board URL. Default: ${defaults.server}
  --checkBoard               Read one Agent Link Board snapshot, including
                             currentCall status.
  --requireClean             Fail if the git worktree has uncommitted changes.
  --requireOnline            Fail if Mac host /discovery is offline.
  --requireNoRuntimeChanges  Fail if current git has Mac host runtime source
                             changes after the running host build.
  --boardSummary             Print a short secret-free summary for Agent Link
                             Board instead of the full human report.
  --json                     Print one machine-readable JSON object.
  --help, -h                 Show this help without probing anything.

Machine-readable JSON fields:
  commands.mediaReadinessBoardSummary
                             Secret-free Mac media baseline command for
                             formal-run prep; it prompts for a password and
                             never embeds one in argv.

Examples:
  node scripts/mac/check-mac-resume-status.mjs
  node scripts/mac/check-mac-resume-status.mjs --checkBoard --json
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
      token === "--requireClean" ||
      token === "--requireOnline" ||
      token === "--requireNoRuntimeChanges" ||
      token === "--boardSummary" ||
      token === "--json"
    ) {
      args[token.slice(2)] = true;
      continue;
    }
    if (token === "--host" && next && !next.startsWith("--")) {
      args.host = next;
      index += 1;
      continue;
    }
    if (token === "--port" && next && !next.startsWith("--")) {
      args.port = clampInteger(next, 1, 65535, defaults.port);
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
  const shortLines = statusLines.filter((line) => !line.startsWith("##"));
  const branchLine = statusLines.find((line) => line.startsWith("##")) || "";
  return {
    ok: branch.ok && log.ok,
    branchLine,
    head: normalizedText(log.stdout),
    clean: branch.ok && shortLines.length === 0,
    changes: shortLines,
    statusText: normalizedText(branch.stdout),
    errors: [branch.error || branch.stderr, log.error || log.stderr].map(normalizedText).filter(Boolean),
  };
}

function getChangedHostRuntimeFiles(fromBuildId, toBuildId) {
  const from = normalizedText(fromBuildId);
  const to = normalizedText(toBuildId || "HEAD") || "HEAD";
  if (!from) return null;
  const revParse = command("git", ["rev-parse", "--verify", "--quiet", `${from}^{commit}`], { timeoutMs: 3000 });
  if (!revParse.ok) return null;
  const diff = command("git", ["diff", "--name-only", `${from}..${to}`, "--", ...hostRuntimePaths], { timeoutMs: 3000 });
  if (!diff.ok) return null;
  return splitLines(diff.stdout);
}

function makeBuildDiff(runtimeBuildId, currentBuildId) {
  const from = normalizedText(runtimeBuildId);
  const to = normalizedText(currentBuildId);
  if (!from || !to) {
    return {
      differs: false,
      fromBuildId: from,
      toBuildId: to,
      comparable: false,
      changedHostRuntimeFiles: null,
      changedHostRuntimeFileCount: null,
      severity: "unknown",
      message: "Build comparison unavailable because runtime.buildId or current git build is missing.",
    };
  }
  if (from === to) {
    return {
      differs: false,
      fromBuildId: from,
      toBuildId: to,
      comparable: true,
      changedHostRuntimeFiles: [],
      changedHostRuntimeFileCount: 0,
      severity: "ok",
      message: "Running host build matches current git.",
    };
  }

  const changedFiles = getChangedHostRuntimeFiles(from, to);
  if (!Array.isArray(changedFiles)) {
    return {
      differs: true,
      fromBuildId: from,
      toBuildId: to,
      comparable: false,
      changedHostRuntimeFiles: null,
      changedHostRuntimeFileCount: null,
      severity: "warning",
      message: `Running host build ${from} differs from current git ${to}; local git history cannot prove whether Mac host runtime changed.`,
    };
  }
  if (changedFiles.length === 0) {
    return {
      differs: true,
      fromBuildId: from,
      toBuildId: to,
      comparable: true,
      changedHostRuntimeFiles: [],
      changedHostRuntimeFileCount: 0,
      severity: "stale-metadata",
      message: `No Mac host runtime source changes since ${from}; behavior is likely current, but build metadata is stale.`,
    };
  }
  return {
    differs: true,
    fromBuildId: from,
    toBuildId: to,
    comparable: true,
    changedHostRuntimeFiles: changedFiles,
    changedHostRuntimeFileCount: changedFiles.length,
    severity: "restart-recommended",
    message: `Mac host runtime source changed since ${from}; restart before deploy-style validation.`,
  };
}

function statusValue(value) {
  if (value === true) return "on";
  if (value === false) return "off";
  return "unknown";
}

function getLanAddresses(port) {
  const addresses = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (!entry || entry.family !== "IPv4" || entry.internal) continue;
      if (entry.address.startsWith("169.254.")) continue;
      addresses.push({ name, address: entry.address, port });
    }
  }
  return addresses;
}

function requestJson(url, timeoutMs) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          rejectRequest(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolveRequest(JSON.parse(body));
        } catch {
          rejectRequest(new Error("discovery returned invalid JSON"));
        }
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    request.on("error", rejectRequest);
  });
}

function discoveryInputMode(discovery) {
  return normalizedText(discovery?.capabilities?.inputMode || discovery?.capabilities?.input?.mode || discovery?.inputMode || "unknown").toLowerCase();
}

function normalizeDisplays(displays) {
  return (Array.isArray(displays) ? displays : [])
    .map((display, index) => ({
      id: normalizedText(display?.id || `display-${index + 1}`),
      name: normalizedText(display?.name || `Display ${index + 1}`),
      width: clampInteger(display?.width, 0, 100000, 0),
      height: clampInteger(display?.height, 0, 100000, 0),
      primary: Boolean(display?.primary),
    }))
    .filter((display) => display.id);
}

function summarizeHost(discovery, args, currentBuildId) {
  const capabilities = discovery.capabilities || {};
  const runtime = discovery.runtime || {};
  const permissions = discovery.permissions || {};
  const displays = normalizeDisplays(capabilities.displays ?? discovery.displays ?? []);
  return {
    online: true,
    probe: { host: args.host, port: args.port },
    deviceName: discovery.deviceName || discovery.hostName || "Mac host",
    inputMode: discoveryInputMode(discovery),
    runtime,
    permissions,
    capabilities,
    displays,
    displayCount: displays.length,
    lanAddresses: getLanAddresses(args.port),
    buildDiff: makeBuildDiff(runtime.buildId, currentBuildId),
    raw: discovery,
  };
}

async function getMacHostStatus(args, currentBuildId) {
  try {
    const discovery = await requestJson(`http://${args.host}:${args.port}/discovery`, args.timeoutMs);
    return summarizeHost(discovery, args, currentBuildId);
  } catch (error) {
    return {
      online: false,
      probe: { host: args.host, port: args.port },
      deviceName: "",
      inputMode: "",
      runtime: {},
      permissions: {},
      capabilities: {},
      displays: [],
      displayCount: 0,
      lanAddresses: getLanAddresses(args.port),
      buildDiff: makeBuildDiff("", currentBuildId),
      error: { message: error.message },
    };
  }
}

async function getBoardStatus(args) {
  if (!args.checkBoard) {
    return {
      checked: false,
      ok: null,
      summary: "not checked",
      recentLines: [],
      currentCall: null,
      activeCall: false,
    };
  }
  const watchResult = command(process.execPath, [
    "scripts/codex-link-client.mjs",
    "--server",
    args.server,
    "watch",
    "--once",
  ], {
    timeoutMs: Math.max(5000, args.timeoutMs),
    maxBuffer: 8 * 1024 * 1024,
  });
  const stateResult = await getBoardState(args);
  const output = `${watchResult.stdout}\n${watchResult.stderr}`;
  const lines = splitLines(output);
  const currentCall = normalizeBoardCall(stateResult.state?.currentCall);
  return {
    checked: true,
    ok: watchResult.ok && stateResult.ok,
    summary: watchResult.ok && stateResult.ok ? `read ${lines.length} non-empty line(s)` : `failed: ${watchResult.error || watchResult.stderr || stateResult.error || `exit ${watchResult.status ?? "state"}`}`,
    recentLines: lines.slice(-12),
    currentCall,
    activeCall: isActiveCall(currentCall),
  };
}

async function getBoardState(args) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, args.timeoutMs));
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
      return { ok: false, status: response.status, error: `${response.status}: ${text}` };
    }
    try {
      return { ok: true, status: response.status, state: text ? JSON.parse(text) : {} };
    } catch (error) {
      return { ok: false, status: response.status, error: `invalid JSON: ${error.message}` };
    }
  } catch (error) {
    return { ok: false, status: null, error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

function buildRecommendations({ git, host, board, args }) {
  const recommendations = [];
  if (board.checked && !board.ok) {
    recommendations.push({
      level: "warning",
      text: "Agent Link Board was not readable; refresh it before coordinating dual-end tests.",
    });
  }
  if (board.checked && board.activeCall) {
    recommendations.push({
      level: "next",
      text: `Agent Link Board has an active call: ${formatCallOneLine(board.currentCall)}. Coordinate before starting another formal test.`,
    });
  }
  if (!git.clean) {
    recommendations.push({
      level: args.requireClean ? "blocker" : "warning",
      text: "Worktree has uncommitted changes; commit/stash or document them before pulling or pushing.",
    });
  }
  if (!host.online) {
    recommendations.push({
      level: args.requireOnline ? "blocker" : "warning",
      text: "Mac host discovery is offline; start it safely with start-mac-host before Windows validation.",
    });
    recommendations.push({
      level: "next",
      text: "For formal E2E, use start-mac-host --promptPassword --requirePassword and do not share secrets on the board.",
    });
    return recommendations;
  }
  if (host.inputMode !== "log") {
    recommendations.push({
      level: "blocker",
      text: `Mac host inputMode is ${host.inputMode || "unknown"}; unattended validation should stay in log mode.`,
    });
  }
  if (host.permissions.screenRecording !== true) {
    recommendations.push({
      level: "blocker",
      text: "Screen Recording permission is off; real video validation will fail or fall back.",
    });
  }
  if (host.permissions.accessibility !== true) {
    recommendations.push({
      level: "warning",
      text: "Accessibility permission is off; log-mode tests can continue, but inject cannot work.",
    });
  }
  if (host.permissions.inputMonitoring !== true) {
    recommendations.push({
      level: "warning",
      text: "Input Monitoring is not confirmed; keyboard edge cases may need manual permission review.",
    });
  }
  if (host.buildDiff.severity === "restart-recommended") {
    recommendations.push({
      level: args.requireNoRuntimeChanges ? "blocker" : "warning",
      text: `${host.buildDiff.message} Changed runtime files: ${host.buildDiff.changedHostRuntimeFiles.slice(0, 6).join(", ")}`,
    });
  } else if (host.buildDiff.differs) {
    recommendations.push({
      level: "info",
      text: host.buildDiff.message,
    });
  }
  recommendations.push({
    level: "next",
    text: `Before a long formal run, refresh the Mac H.264/PCM media baseline: ${makeMediaReadinessBoardSummaryCommand(args)}.`,
  });
  recommendations.push({
    level: "next",
    text: "Next formal path: board sync -> formal password Mac host -> Windows discovery -> auth -> H.264 5-10 min -> audio -> clipboard -> input log.",
  });
  recommendations.push({
    level: "safety",
    text: "Do not run inject mode until the user explicitly confirms they are watching the screen; start-mac-host inject startups must include --confirmUserWatching.",
  });
  return recommendations;
}

function computeOk({ git, host, board, recommendations, args }) {
  if (args.requireClean && !git.clean) return false;
  if (args.requireOnline && !host.online) return false;
  if (args.checkBoard && !board.ok) return false;
  if (args.requireNoRuntimeChanges && host.buildDiff.severity === "restart-recommended") return false;
  return !recommendations.some((item) => item.level === "blocker");
}

function formatPermissions(permissions) {
  return [
    `screen=${statusValue(permissions.screenRecording)}`,
    `accessibility=${statusValue(permissions.accessibility)}`,
    `inputMonitoring=${statusValue(permissions.inputMonitoring)}`,
  ].join(" ");
}

function formatCapabilities(capabilities) {
  const parts = [];
  parts.push(`h264=${statusValue(capabilities.h264Stream)}`);
  parts.push(`audio=${capabilities.audioMode || statusValue(capabilities.audio)}`);
  parts.push(`clipboardText=${statusValue(capabilities.clipboardText)}`);
  parts.push(`clipboardFile=${statusValue(capabilities.clipboardFile)}`);
  if (capabilities.capturePipeline) parts.push(`pipeline=${capabilities.capturePipeline}`);
  if (capabilities.maxScreenFps) parts.push(`maxFps=${capabilities.maxScreenFps}`);
  return parts.join(", ");
}

function formatDisplays(displays) {
  if (!Array.isArray(displays) || displays.length === 0) return "none";
  return displays
    .map((display) => {
      const primary = display.primary ? "*" : "";
      const size = display.width && display.height ? `:${display.width}x${display.height}` : "";
      return `${display.id}${primary}${size}`;
    })
    .join(", ");
}

function formatBoardHostAddress(host) {
  const lan = Array.isArray(host.lanAddresses) && host.lanAddresses.length > 0
    ? host.lanAddresses[0]
    : null;
  if (lan?.address && lan?.port) return `${lan.address}:${lan.port}`;
  return `${host.probe.host}:${host.probe.port}`;
}

function makeMediaReadinessBoardSummaryCommand(args) {
  return [
    "node scripts/mac/check-mac-host-readiness.mjs",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--checkBoard",
    "--probeMedia",
    "--probeMediaResourceSample",
    "--promptPassword",
    "--boardSummary",
  ].join(" ");
}

function formatBoardBuildDiff(buildDiff) {
  if (!buildDiff || buildDiff.severity === "ok") return "build=current";
  if (buildDiff.severity === "stale-metadata") {
    return `runtimeBuild=${buildDiff.fromBuildId || "unknown"} stale metadata only, hostRuntimeChanges=0`;
  }
  if (buildDiff.severity === "restart-recommended") {
    return `runtimeBuild=${buildDiff.fromBuildId || "unknown"} restart recommended, hostRuntimeChanges=${buildDiff.changedHostRuntimeFileCount ?? "unknown"}`;
  }
  if (buildDiff.differs) {
    return `runtimeBuild=${buildDiff.fromBuildId || "unknown"} differs from repo=${buildDiff.toBuildId || "unknown"}`;
  }
  return "build comparison unavailable";
}

function normalizeBoardCall(call) {
  if (!call || typeof call !== "object") return null;
  const normalized = {};
  for (const key of ["status", "goal", "from", "need", "environment", "connection", "command", "expected", "actual", "ask", "blockedBy", "owner", "timeout", "updatedAt"]) {
    const value = normalizedText(call[key]);
    if (value) normalized[key] = value;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function isActiveCall(call) {
  if (!call) return false;
  const status = normalizedText(call.status).toLowerCase();
  if (!status) return true;
  return !["done", "completed", "complete", "cancelled", "canceled", "resolved", "closed"].includes(status);
}

function formatCallOneLine(call, options = {}) {
  if (!call) return "none";
  const status = normalizedText(call.status) || "CALL";
  const goal = normalizedText(call.goal) || "untitled";
  const from = normalizedText(call.from);
  const need = normalizedText(call.need);
  const connection = normalizedText(call.connection);
  const command = normalizedText(call.command);
  return [
    `${status}: ${goal}`,
    from ? `from=${from}` : "",
    need ? `need=${need}` : "",
    connection ? `connection=${connection}` : "",
    options.includeCommand && command ? `command=${command}` : "",
  ].filter(Boolean).join("; ");
}

function formatBoardCallSummary(board) {
  if (!board?.checked) return "call=not-checked";
  if (!board.ok) return "call=unknown";
  if (!board.currentCall) return "call=none";
  const state = board.activeCall ? "active" : "done";
  return `call=${state}(${formatCallOneLine(board.currentCall)})`;
}

function formatBoardSummary(report) {
  const { git, host, board, currentBuildId, recommendations } = report;
  const repoState = `${currentBuildId || "unknown"} ${git.clean ? "clean" : `dirty:${git.changes.length}`}`;
  const blockers = recommendations.filter((item) => item.level === "blocker").length;
  const warnings = recommendations.filter((item) => item.level === "warning").length;
  const attention = blockers > 0
    ? `attention=${blockers} blocker(s)`
    : warnings > 0
      ? `attention=${warnings} warning(s)`
      : "attention=none";
  const callSummary = formatBoardCallSummary(board);

  if (!host.online) {
    return [
      `Mac resume: repo=${repoState}; Mac host offline at ${host.probe.host}:${host.probe.port}; ${callSummary}; ${attention}.`,
      "Next: start formal host with start-mac-host --promptPassword --requirePassword before Windows E2E.",
      `After host is online, refresh media baseline with ${report.commands.mediaReadinessBoardSummary}.`,
      "Do not send passwords on Agent Link Board; inject startups require the user watching the Mac screen and --confirmUserWatching.",
    ].join(" ");
  }

  const permissions = formatPermissions(host.permissions || {});
  const h264 = statusValue(host.capabilities?.h264Stream);
  const audio = host.capabilities?.audioMode || statusValue(host.capabilities?.audio);
  const pipeline = host.capabilities?.capturePipeline || "unknown";
  const displays = formatDisplays(host.displays);
  const runtimeBuild = host.runtime?.buildId || "unknown";
  const buildDiff = formatBoardBuildDiff(host.buildDiff);

  return [
    `Mac resume: repo=${repoState}; host=${formatBoardHostAddress(host)} online runtimeBuild=${runtimeBuild} inputMode=${host.inputMode || "unknown"}; ${callSummary}.`,
    `Permissions ${permissions}; h264=${h264}; audio=${audio}; pipeline=${pipeline}; displays=${displays}; ${buildDiff}; ${attention}.`,
    `Media baseline command: ${report.commands.mediaReadinessBoardSummary}.`,
    "Next formal path: Windows discovery -> auth -> H.264 5-10 min -> audio -> clipboard -> input-log.",
    "Do not send passwords on Agent Link Board; inject startups require the user watching the Mac screen and --confirmUserWatching.",
  ].join(" ");
}

function printReport(report) {
  const { git, host, board, recommendations } = report;
  console.log(`[INFO] Mac resume status · ${new Date(report.checkedAt).toLocaleString()}`);
  console.log(`[${git.clean ? "OK" : "WARN"}] Git: ${git.branchLine || "branch unknown"} · ${git.head || "HEAD unknown"} · ${git.clean ? "clean" : `${git.changes.length} change(s)`}`);
  if (!git.clean) {
    for (const line of git.changes.slice(0, 8)) {
      console.log(`[WARN] Git change: ${line}`);
    }
  }
  if (board.checked) {
    console.log(`[${board.ok ? "OK" : "WARN"}] Agent Link Board: ${board.summary}`);
    if (board.currentCall) {
      const prefix = board.activeCall ? "NEXT" : "INFO";
      console.log(`[${prefix}] Agent Link Board currentCall: ${formatCallOneLine(board.currentCall)}`);
    } else if (board.ok) {
      console.log("[OK] Agent Link Board currentCall: none");
    }
  } else {
    console.log("[INFO] Agent Link Board: not checked; add --checkBoard when coordinating with Windows Codex.");
  }
  if (!host.online) {
    console.log(`[WARN] Mac host: offline at ${host.probe.host}:${host.probe.port} (${host.error?.message || "unknown error"})`);
  } else {
    const runtime = host.runtime || {};
    const runtimeParts = [
      runtime.processId ? `pid=${runtime.processId}` : "",
      runtime.buildId ? `build=${runtime.buildId}` : "",
      runtime.uptimeSeconds !== undefined ? `uptime=${runtime.uptimeSeconds}s` : "",
    ].filter(Boolean).join(", ");
    console.log(`[OK] Mac host: ${host.deviceName} · ${host.probe.host}:${host.probe.port} · inputMode=${host.inputMode || "unknown"} · ${runtimeParts || "runtime missing"}`);
    console.log(`[INFO] Permissions: ${formatPermissions(host.permissions || {})}`);
    console.log(`[INFO] Capabilities: ${formatCapabilities(host.capabilities || {})}`);
    console.log(`[INFO] Displays: ${formatDisplays(host.displays)}`);
    for (const entry of host.lanAddresses || []) {
      console.log(`[OK] Windows can try: ${entry.address}:${entry.port} (${entry.name})`);
    }
    const buildKind = host.buildDiff.severity === "ok" ? "OK" : host.buildDiff.severity === "restart-recommended" ? "WARN" : "INFO";
    console.log(`[${buildKind}] Build diff: ${host.buildDiff.message}`);
  }
  for (const item of recommendations) {
    const prefix = item.level === "blocker" ? "ERROR" : item.level === "warning" ? "WARN" : item.level === "next" ? "NEXT" : "INFO";
    console.log(`[${prefix}] ${item.text}`);
  }
  console.log(report.ok ? "[OK] Resume status passed" : "[FAIL] Resume status needs attention");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  const currentBuildId = getCurrentBuildId();
  const git = getGitStatus();
  const host = await getMacHostStatus(args, currentBuildId);
  const board = await getBoardStatus(args);
  const recommendations = buildRecommendations({ git, host, board, args });
  const report = {
    ok: computeOk({ git, host, board, recommendations, args }),
    checkedAt: new Date().toISOString(),
    args: {
      host: args.host,
      port: args.port,
      timeoutMs: args.timeoutMs,
      checkBoard: args.checkBoard,
      requireClean: args.requireClean,
      requireOnline: args.requireOnline,
      requireNoRuntimeChanges: args.requireNoRuntimeChanges,
      boardSummary: args.boardSummary,
    },
    currentBuildId,
    git,
    board,
    host,
    commands: {
      mediaReadinessBoardSummary: makeMediaReadinessBoardSummaryCommand(args),
    },
    recommendations,
  };
  report.boardSummary = formatBoardSummary(report);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printReport(report);
  }
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      ok: false,
      checkedAt: new Date().toISOString(),
      error: { message: error.message, name: error.name },
    }, null, 2));
  } else {
    console.error(`[FAIL] ${error.message}`);
  }
  process.exitCode = 1;
});
