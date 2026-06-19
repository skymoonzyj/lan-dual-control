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
const formalTargetMaxScreenFps = 60;
const heartbeatFreshnessStaleMs = 120000;
const allowedMacEvidenceTokens = new Set([
  "MacClientPageOnline",
  "MacClientDiagnosticsOk",
  "MacHostOnline",
  "MacHostMediaOk",
  "MacFormalLocalSmokeOk",
  "MacFormalE2EReady",
  "MacFormalE2EOk",
  "MacUnattendedReady",
]);
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
  commands.macHostMediaCommand
                             Stable alias for the Mac media baseline command;
                             board summaries expose it as MacHostMedia= for
                             easier cross-end copying.
  commands.macHostSafeStartCommand
                             Secret-free foreground Mac host start command
                             preserving the checked port; it prompts locally
                             and never embeds a password in argv.
  commands.macMaxFpsSafeStartCommand
                             Secret-free foreground Mac host start command for
                             the formal 60Hz target; it prompts locally, never
                             embeds a password in argv, and does not send input.
  commands.macHostStopCommand
                             Secret-free local stop command for the current Mac
                             host before loading the LaunchAgent; it does not
                             authenticate or request a password.
  commands.macLaunchAgentLoadCommand
                             Manual launchctl bootstrap command for loading the
                             standard Mac host LaunchAgent.
  commands.macLaunchAgentPrintCommand
                             Manual launchctl print command for verifying the
                             standard Mac host LaunchAgent status.
  commands.macHostReadinessCommand
                             Secret-free low-risk Mac host readiness command;
                             it reads host and Agent Link Board state, prints
                             a one-line summary, and does not request a password.
  commands.macFormalLocalSmokeCommand
                             Secret-free local formal smoke command for
                             H.264/PCM/input-log prep; it prompts visibly and
                             never embeds a password in argv.
  commands.macFormalE2eStatusCommand
                             Secret-free formal Mac E2E readiness command; it
                             reads readiness/board state, prints a one-line
                             summary, and does not send a call unless rerun
                             explicitly with --sendCall.
  commands.macUnattendedStatusCommand
                             Secret-free Mac controlled-end unattended status
                             command; it checks host, LaunchAgent, power, and
                             lock/sleep/reboot limits without changing system
                             state or requesting a password.
  commands.macUnattendedSendStatusCommand
                             Secret-free Mac controlled-end unattended status
                             refresh command; it posts the independent
                             "Mac Unattended" Agent Link Board status without
                             requesting a password or sending input.
  commands.macUnattendedFormalCommand
                             Secret-free formal 60Hz unattended gate; it turns
                             missing or low LaunchAgent maxScreenFps into a
                             blocker and still does not change system state.
  commands.macLaunchAgentPlanCommand
                             Secret-free Mac host LaunchAgent dry-run planner;
                             it prints a plist plan and manual load commands
                             without writing files, loading launchctl, starting
                             Mac host, or requesting a password.
  commands.macMaxFpsPlanCommand
                             Secret-free LaunchAgent dry-run planner for the
                             formal 60Hz target; it only prints a plan and does
                             not write files, load launchctl, start Mac host,
                             request a password, or send input.
  commands.macClientDiagnosticsCommand
                             Secret-free Mac client readiness command for
                             checking local page files/server state without
                             authenticating a Windows host.
  commands.macClientPageStatusCommand
                             Secret-free local Mac client page status command;
                             it does not start the page or connect to Windows.
  commands.macClientDiscoverWindowsCommand
                             Secret-free Windows host discovery command from
                             the Mac side; it does not authenticate or send
                             input.
  commands.macClientFormalChecklistCommand
                             Secret-free Mac controls Windows formal checklist
                             command; it discovers Windows hosts on the
                             default port first, then prints the manual
                             true-test checklist without authenticating or
                             sending input.
  commands.macClientFormalSmokeCommand
                             Secret-free Mac controls Windows browser-smoke
                             preflight command; it discovers Windows hosts and
                             prints a summary without authenticating, prompting
                             for a password, sending a call, or sending input.
  commands.macClientPromptPasswordSmokeCommand
                             User-run Mac controls Windows browser-smoke command;
                             it discovers Windows hosts, ensures the local Mac
                             client page, then rings and prompts in a frontmost
                             password dialog only when a human explicitly runs it.
  commands.macClientBrowserSelfTestCommand
                             Secret-free local Mac client browser self-test
                             command; it starts a temporary mock Windows host
                             and prints one board summary line without using a
                             real host, requesting a password, sending a call,
                             or running inject.
  commands.macHeartbeatOnceCommand
                             Secret-free one-shot Mac heartbeat watcher command;
                             it posts a current MacHeartbeat summary to Agent
                             Link Board as device "Mac Heartbeat" and does not
                             refresh the Mac Codex status.
  commands.macHeartbeatWatchCommand
                             Secret-free continuous Mac heartbeat watcher
                             command; it keeps posting as "Mac Heartbeat" for
                             Windows-side monitoring without authenticating a
                             host or sending input.
  commands.macHeartbeatStartCommand
                             Secret-free background Mac heartbeat watcher
                             start command. It manages PID/log files and posts
                             as device "Mac Heartbeat", not "Mac Codex".
  commands.macHeartbeatStatusCommand
                             Secret-free background watcher status command.
  commands.macHeartbeatStopCommand
                             Secret-free background watcher stop command.
  macHeartbeatWatcher        Read-only background watcher status snapshot from
                             start-mac-heartbeat-watcher --status --json,
                             including lastHeartbeat when log evidence exists.
  macHeartbeatFreshness      Stable fresh/stale/unknown summary derived from
                             the background watcher's last heartbeat, exposed
                             as MacHeartbeatFreshness= in board summaries.
  macHeartbeatHealth         Stable ok/blocked/warning/unknown health summary
                             derived from the background watcher's last
                             heartbeat, exposed as MacHeartbeatHealth= in
                             board summaries. Freshness means "recent"; health
                             means "safe/blocked/warning".
  board.macPowerHealth       Stable MacPowerHealth= status safely extracted
                             from the current Agent Link Board Mac Unattended
                             status. It keeps power warning details such as
                             system-sleep-enabled or display-sleep-enabled
                             visible in resume summaries without running pmset.
  commands.macClientReverseRehearsalAction
                             Human action for the guarded Mac-controls-Windows
                             reverse-control request rehearsal. Run discovery,
                             use its ReverseRehearsal= line, and keep the
                             Windows grant on Windows loopback.
  commands.macScriptHelpCommand
                             Pure help coverage command for scripts/mac/*.mjs;
                             it rejects runtime side-effect output and prints
                             one Agent Link Board summary line.

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

function isH264CapturePipelineActive(capabilities = {}) {
  const pipeline = normalizedText(capabilities.capturePipeline).toLowerCase();
  return pipeline.includes("h264");
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
      macEvidence: [],
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
  const macEvidence = collectMacEvidence(stateResult.state, lines);
  const macPowerHealth = collectMacPowerHealth(stateResult.state, lines);
  return {
    checked: true,
    ok: watchResult.ok && stateResult.ok,
    summary: watchResult.ok && stateResult.ok ? `read ${lines.length} non-empty line(s)` : `failed: ${watchResult.error || watchResult.stderr || stateResult.error || `exit ${watchResult.status ?? "state"}`}`,
    recentLines: lines.slice(-12),
    macEvidence,
    macPowerHealth,
    currentCall,
    activeCall: isActiveCall(currentCall),
  };
}

function collectMacEvidence(state, recentLines = []) {
  const tokens = [];
  for (const text of collectBoardEvidenceTexts(state, recentLines)) {
    tokens.push(...extractCleanMacEvidence(text));
  }
  return [...new Set(tokens)];
}

function collectMacPowerHealth(state, recentLines = []) {
  for (const text of collectBoardEvidenceTexts(state, recentLines)) {
    const health = extractMacPowerHealth(text);
    if (health) return health;
  }
  return null;
}

function collectBoardEvidenceTexts(state, recentLines = []) {
  const texts = [...(Array.isArray(recentLines) ? recentLines : [])];
  const statuses = state && typeof state === "object" && state.statuses && typeof state.statuses === "object"
    ? state.statuses
    : {};
  for (const [device, entry] of Object.entries(statuses)) {
    if (typeof entry === "string") {
      texts.push(`${device}: ${entry}`);
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const statusText = [device, entry.status, entry.note, entry.text, entry.message, entry.summary]
      .map(normalizedText)
      .filter(Boolean)
      .join(" ");
    if (statusText) texts.push(statusText);
  }
  const events = Array.isArray(state?.events) ? state.events : [];
  for (const event of events) {
    if (typeof event === "string") {
      texts.push(event);
      continue;
    }
    if (!event || typeof event !== "object") continue;
    const eventText = [event.device, event.from, event.status, event.note, event.text, event.message, event.summary]
      .map(normalizedText)
      .filter(Boolean)
      .join(" ");
    if (eventText) texts.push(eventText);
  }
  return texts.filter(Boolean);
}

function extractCleanMacEvidence(text) {
  const source = normalizedText(text);
  if (!source || !/\b(?:MacEvidence|Evidence)=/i.test(source)) return [];
  if (!hasCleanMacEvidenceContext(source)) return [];

  const tokens = [];
  for (const match of source.matchAll(/\b(?:MacEvidence|Evidence)=([A-Za-z0-9_,]+)/gi)) {
    for (const token of match[1].split(",")) {
      const normalized = token.trim();
      if (allowedMacEvidenceTokens.has(normalized)) tokens.push(normalized);
    }
  }
  return tokens;
}

function hasCleanMacEvidenceContext(text) {
  if (!/\b(?:MacHeartbeat|MacClientDiagnostics)=status=ok\b/i.test(text)) return false;
  if (/\b(?:MacHeartbeat|MacClientDiagnostics)=status=(?:blocked|warning|failed|fail|offline)\b/i.test(text)) return false;
  if (/\bblockers=(?!none\b)[^;\s.]*/i.test(text)) return false;
  if (/\bwarnings=(?!none\b)[^;\s.]*/i.test(text)) return false;
  if (/\breason=(?:blocked|warning|failed|fail|offline)\b/i.test(text)) return false;
  return /\bblockers=none\b/i.test(text) && /\bwarnings=none\b/i.test(text);
}

function extractMacPowerHealth(text) {
  const source = normalizedText(text);
  if (!source || !/\bMacPowerHealth=/i.test(source)) return null;
  const match = source.match(/\bMacPowerHealth=([A-Za-z]+)\s+reason=([A-Za-z0-9_-]+)\s+warnings=([A-Za-z0-9_,_-]+)\s+checkedAt=([0-9TZ:.-]+)/i);
  if (!match) return null;
  const status = match[1].toLowerCase();
  const reason = match[2];
  const warnings = match[3];
  const checkedAt = match[4];
  if (!allowedMacPowerStatuses.has(status)) return null;
  if (!allowedMacPowerReasons.has(reason)) return null;
  if (!isSafeMacPowerWarnings(warnings)) return null;
  if (!Number.isFinite(Date.parse(checkedAt))) return null;
  return { status, reason, warnings, checkedAt };
}

function isSafeMacPowerWarnings(value) {
  const tokens = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => allowedMacPowerWarnings.has(token));
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

function buildRecommendations({ git, host, board, macHeartbeatWatcher, args }) {
  const recommendations = [];
  if (board.checked && !board.ok) {
    recommendations.push({
      level: "warning",
      id: "board-unreadable",
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
      id: "worktree-dirty",
      text: "Worktree has uncommitted changes; commit/stash or document them before pulling or pushing.",
    });
  }
  if (macHeartbeatWatcher?.checked && macHeartbeatWatcher.ok && !macHeartbeatWatcher.running) {
    recommendations.push({
      level: "warning",
      id: "heartbeat-watcher-not-running",
      text: `Mac heartbeat background watcher is not running; start it when unattended board freshness matters: ${makeMacHeartbeatStartCommand()}.`,
    });
  }
  if (!host.online) {
    recommendations.push({
      level: args.requireOnline ? "blocker" : "warning",
      id: "host-offline",
      text: "Mac host discovery is offline; start it safely with start-mac-host before Windows validation.",
    });
    recommendations.push({
      level: "next",
      text: `For formal E2E, use ${makeMacHostSafeStartCommand(args)} and do not share secrets on the board.`,
    });
    recommendations.push({
      level: "next",
      text: `For unattended readiness, review LaunchAgent, power, and lock/sleep/reboot limits: ${makeMacUnattendedStatusCommand(args)}.`,
    });
    recommendations.push({
      level: "next",
      text: `For formal 60Hz unattended readiness, run the read-only LaunchAgent max-FPS gate: ${makeMacUnattendedFormalCommand(args)}.`,
    });
    recommendations.push({
      level: "next",
      text: `For login startup planning, dry-run the LaunchAgent template first: ${makeMacLaunchAgentPlanCommand(args)}.`,
    });
    return recommendations;
  }
  if (host.inputMode !== "log") {
    recommendations.push({
      level: "blocker",
      id: "input-mode",
      text: `Mac host inputMode is ${host.inputMode || "unknown"}; unattended validation should stay in log mode.`,
    });
  }
  if (host.permissions.screenRecording !== true) {
    recommendations.push({
      level: "blocker",
      id: "screen-recording",
      text: "Screen Recording permission is off; real video validation will fail or fall back.",
    });
  }
  if (host.permissions.accessibility !== true) {
    recommendations.push({
      level: "warning",
      id: "accessibility",
      text: "Accessibility permission is off; log-mode tests can continue, but inject cannot work.",
    });
  }
  if (host.permissions.inputMonitoring !== true) {
    recommendations.push({
      level: "warning",
      id: "input-monitoring",
      text: "Input Monitoring is not confirmed; keyboard edge cases may need manual permission review.",
    });
  }
  if (host.capabilities?.h264Stream === true && !isH264CapturePipelineActive(host.capabilities)) {
    recommendations.push({
      level: "warning",
      id: "h264-fallback",
      text: `Mac host advertises H.264, but current capture pipeline is ${host.capabilities?.capturePipeline || "unknown"}; refresh the media baseline before formal H.264 E2E.`,
    });
  }
  if (isFormalFpsLimited(host.capabilities)) {
    const maxFps = getMaxScreenFps(host.capabilities);
    recommendations.push({
      level: "warning",
      id: "fps-limit",
      text: `Mac host maxScreenFps=${maxFps}; formal 60Hz validation will run at the remote limit until the foreground 60Hz safe start or max-FPS LaunchAgent plan is used: ${makeMacMaxFpsSafeStartCommand(args)}; dry-run plan: ${makeMacMaxFpsPlanCommand(args)}.`,
    });
  }
  if (host.buildDiff.severity === "restart-recommended") {
    recommendations.push({
      level: args.requireNoRuntimeChanges ? "blocker" : "warning",
      id: "runtime-changes",
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
    text: `Before asking Windows for formal E2E, run the local H.264/PCM/input-log smoke: ${makeMacFormalLocalSmokeCommand(args)}.`,
  });
  recommendations.push({
    level: "next",
    text: `Before promising unattended control, review LaunchAgent, power, and lock/sleep/reboot limits: ${makeMacUnattendedStatusCommand(args)}.`,
  });
  recommendations.push({
    level: "next",
    text: `Before a formal 60Hz deployment, require LaunchAgent maxScreenFps to be explicit and >=${formalTargetMaxScreenFps}: ${makeMacUnattendedFormalCommand(args)}.`,
  });
  recommendations.push({
    level: "next",
    text: `Before writing any login startup plist, dry-run the LaunchAgent template first: ${makeMacLaunchAgentPlanCommand(args)}.`,
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

function getMaxScreenFps(capabilities = {}) {
  const value = Number(capabilities.maxScreenFps);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

function isFormalFpsLimited(capabilities = {}) {
  const maxScreenFps = getMaxScreenFps(capabilities);
  return maxScreenFps !== null && maxScreenFps < formalTargetMaxScreenFps;
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

function makeMacHostReadinessCommand(args) {
  return [
    "node scripts/mac/check-mac-host-readiness.mjs",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--checkBoard",
    "--boardSummary",
  ].join(" ");
}

function makeMacFormalLocalSmokeCommand(args) {
  return [
    "node scripts/mac/check-mac-formal-local-smoke.mjs",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--promptPassword",
    "--boardSummary",
  ].join(" ");
}

function makeMacFormalE2eStatusCommand(args) {
  return [
    "node scripts/mac/check-mac-formal-e2e-status.mjs",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--boardSummary",
  ].join(" ");
}

function makeMacHostSafeStartCommand(args) {
  return [
    "node scripts/mac/start-mac-host.mjs",
    "--promptPassword",
    "--requirePassword",
    "--host",
    "0.0.0.0",
    "--port",
    String(args.port),
  ].join(" ");
}

function makeMacMaxFpsSafeStartCommand(args) {
  return [
    "node scripts/mac/start-mac-host.mjs",
    "--promptPassword",
    "--requirePassword",
    "--host",
    "0.0.0.0",
    "--port",
    String(args.port),
    "--maxScreenFps",
    String(formalTargetMaxScreenFps),
  ].join(" ");
}

function makeMacResumeStatusCommand(args) {
  return [
    "node scripts/mac/check-mac-resume-status.mjs",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--checkBoard",
    "--boardSummary",
  ].join(" ");
}

function makeMacHostStopCommand(args) {
  return [
    "node scripts/mac/start-mac-host.mjs",
    "--stop",
    "--host",
    args.host,
    "--port",
    String(args.port),
  ].join(" ");
}

function defaultLaunchAgentPath() {
  return `${os.homedir()}/Library/LaunchAgents/com.lan-dual-control.mac-host.plist`;
}

function shellQuote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function makeMacLaunchAgentLoadCommand() {
  return `launchctl bootstrap gui/$(id -u) ${shellQuote(defaultLaunchAgentPath())}`;
}

function makeMacLaunchAgentPrintCommand() {
  return "launchctl print gui/$(id -u)/com.lan-dual-control.mac-host";
}

function makeMacUnattendedStatusCommand(args) {
  return [
    "node scripts/mac/check-mac-unattended-status.mjs",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--boardSummary",
  ].join(" ");
}

function makeMacUnattendedSendStatusCommand(args) {
  return [
    "node scripts/mac/check-mac-unattended-status.mjs",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--server",
    defaults.server,
    "--sendStatus",
    "--boardSummary",
  ].join(" ");
}

function makeMacUnattendedFormalCommand(args) {
  return [
    "node scripts/mac/check-mac-unattended-status.mjs",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--requireLaunchAgentMaxFps",
    "--requireLaunchAgentLoaded",
    "--boardSummary",
  ].join(" ");
}

function makeMacLaunchAgentPlanCommand(args) {
  return [
    "node scripts/mac/install-mac-host-launch-agent.mjs",
    "--port",
    String(args.port),
    "--boardSummary",
  ].join(" ");
}

function makeMacMaxFpsPlanCommand(args) {
  return [
    "node scripts/mac/install-mac-host-launch-agent.mjs",
    "--port",
    String(args.port),
    "--maxScreenFps",
    String(formalTargetMaxScreenFps),
    "--boardSummary",
  ].join(" ");
}

function makeMacClientDiagnosticsCommand() {
  return [
    "node scripts/mac/check-mac-client-readiness.mjs",
    "--probeClientServer",
    "--checkBoard",
    "--boardSummary",
  ].join(" ");
}

function makeMacClientPageStatusCommand() {
  return "node scripts/mac/start-mac-client.mjs --status --boardSummary";
}

function makeMacClientDiscoverWindowsCommand() {
  return "node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary";
}

function makeMacClientFormalChecklistCommand() {
  return "node scripts/mac/check-mac-client-formal-status.mjs --discover --port 43770 --boardSummary";
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

function makeMacHeartbeatOnceCommand() {
  return "node scripts/mac/watch-mac-heartbeat.mjs --once --sendStatus --boardSummary";
}

function makeMacHeartbeatWatchCommand() {
  return "node scripts/mac/watch-mac-heartbeat.mjs --sendStatus --intervalMs 30000";
}

function makeMacHeartbeatStartCommand() {
  return "node scripts/mac/start-mac-heartbeat-watcher.mjs --boardSummary";
}

function makeMacHeartbeatStatusCommand() {
  return "node scripts/mac/start-mac-heartbeat-watcher.mjs --status --boardSummary";
}

function makeMacHeartbeatStopCommand() {
  return "node scripts/mac/start-mac-heartbeat-watcher.mjs --stop --boardSummary";
}

function getMacHeartbeatWatcherStatus(args) {
  const result = command(process.execPath, [
    "scripts/mac/start-mac-heartbeat-watcher.mjs",
    "--status",
    "--json",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--server",
    args.server,
    "--timeoutMs",
    String(Math.min(Math.max(args.timeoutMs, 1000), 10000)),
  ], {
    timeoutMs: Math.min(Math.max(args.timeoutMs + 2000, 3000), 15000),
    maxBuffer: 2 * 1024 * 1024,
  });
  if (!result.ok) {
    return {
      checked: true,
      ok: false,
      running: false,
      status: result.status,
      error: normalizedText(result.error || result.stderr || `exit ${result.status ?? "unknown"}`),
    };
  }
  try {
    const payload = JSON.parse(result.stdout);
    return {
      checked: true,
      ok: Boolean(payload.ok),
      running: Boolean(payload.running),
      pid: payload.pid ?? null,
      stalePidFile: Boolean(payload.stalePidFile),
      lastHeartbeat: payload.lastHeartbeat || null,
      files: payload.files || {},
      commands: payload.commands || {},
      message: normalizedText(payload.message),
    };
  } catch (error) {
    return {
      checked: true,
      ok: false,
      running: false,
      status: result.status,
      error: `invalid JSON: ${error.message}`,
    };
  }
}

function makeMacClientReverseRehearsalAction() {
  return "Run MacClientDiscoverWindows first, then use its ReverseRehearsal= line: Mac requests reverse control and expects LAN008, Windows runs the local loopback one-time grant, Mac retries and expects accepted/临时授权已使用";
}

function makeMacScriptHelpCommand() {
  return "node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary";
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

function formatMacEvidenceSummary(board) {
  if (!Array.isArray(board?.macEvidence) || board.macEvidence.length === 0) return "";
  return `MacEvidence=${board.macEvidence.join(",")};`;
}

function formatMacPowerHealthSummary(board) {
  const health = board?.macPowerHealth;
  if (!health) return "";
  return [
    `MacPowerHealth=${health.status || "unknown"}`,
    `reason=${boardToken(health.reason)}`,
    `warnings=${boardToken(health.warnings)}`,
    `checkedAt=${health.checkedAt || "unknown"}`,
  ].join(" ") + ";";
}

function formatHeartbeatWatcherSummary(watcher) {
  if (!watcher?.checked) return "heartbeatWatcher=not-checked";
  if (!watcher.ok) return `heartbeatWatcher=unknown${watcher.error ? ` error=${watcher.error}` : ""}`;
  const state = watcher.running ? `running pid=${watcher.pid || "unknown"}` : "not-running";
  const heartbeat = watcher.lastHeartbeat?.heartbeat?.found
    ? `lastHeartbeat=${watcher.lastHeartbeat.heartbeat.status || "unknown"} checkedAt=${watcher.lastHeartbeat.heartbeat.checkedAt || "unknown"} reason=${watcher.lastHeartbeat.heartbeat.reason || "unknown"} codexAgeMs=${watcher.lastHeartbeat.heartbeat.codexAgeMs || "unknown"}`
    : "lastHeartbeat=not-seen";
  const run = watcher.lastHeartbeat?.watcherRun?.found
    ? `lastRun=${watcher.lastHeartbeat.watcherRun.run || "unknown"} post=${watcher.lastHeartbeat.watcherRun.post || "unknown"}`
    : "lastRun=not-seen";
  return `heartbeatWatcher=${state} ${heartbeat} ${run}`;
}

function parseTimeMs(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNonNegativeMs(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function ageFromIsoMs(value, nowMs) {
  const parsed = parseTimeMs(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, nowMs - parsed);
}

function ageSeconds(ageMs) {
  return Number.isFinite(ageMs) ? Math.max(0, Math.round(ageMs / 1000)) : null;
}

function boardToken(value, fallback = "unknown") {
  const text = normalizedText(value || "");
  if (!text) return fallback;
  return text.replace(/[;\s.]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
}

function hasIssueList(value) {
  const text = boardToken(value, "");
  return Boolean(text && text !== "none" && text !== "unknown");
}

function makeMacHeartbeatFreshness(watcher, nowMs) {
  const base = {
    checked: Boolean(watcher?.checked),
    status: "unknown",
    reason: "watcher-not-checked",
    thresholdMs: heartbeatFreshnessStaleMs,
  };
  if (!watcher?.checked) return base;
  if (!watcher.ok) {
    return {
      ...base,
      checked: true,
      reason: "watcher-unavailable",
      error: watcher.error || "",
    };
  }
  const heartbeat = watcher.lastHeartbeat?.heartbeat;
  if (!heartbeat?.found) {
    return {
      ...base,
      checked: true,
      reason: "last-heartbeat-not-seen",
    };
  }
  const checkedAgeMs = ageFromIsoMs(heartbeat.checkedAt, nowMs);
  const codexAgeMs = ageFromIsoMs(heartbeat.codexUpdatedAt, nowMs) ?? parseNonNegativeMs(heartbeat.codexAgeMs);
  const boardAgeMs = ageFromIsoMs(heartbeat.boardUpdatedAt, nowMs);
  const status = Number.isFinite(checkedAgeMs)
    ? checkedAgeMs > heartbeatFreshnessStaleMs ? "stale" : "fresh"
    : "unknown";
  return {
    checked: true,
    status,
    reason: status === "unknown"
      ? "checkedAt-missing"
      : status === "stale"
        ? "checkedAt-stale"
        : "checkedAt-fresh",
    thresholdMs: heartbeatFreshnessStaleMs,
    checkedAt: heartbeat.checkedAt || "",
    checkedAgeMs,
    checkedAgeSeconds: ageSeconds(checkedAgeMs),
    codexUpdatedAt: heartbeat.codexUpdatedAt || "",
    codexAgeMs,
    codexAgeSeconds: ageSeconds(codexAgeMs),
    boardUpdatedAt: heartbeat.boardUpdatedAt || "",
    boardAgeMs,
    boardAgeSeconds: ageSeconds(boardAgeMs),
    heartbeatStatus: heartbeat.status || "",
    blockers: heartbeat.blockers || "",
    warnings: heartbeat.warnings || "",
  };
}

function makeMacHeartbeatHealth(watcher) {
  const base = {
    checked: Boolean(watcher?.checked),
    status: "unknown",
    reason: "watcher-not-checked",
  };
  if (!watcher?.checked) return base;
  if (!watcher.ok) {
    return {
      ...base,
      checked: true,
      reason: "watcher-unavailable",
      error: watcher.error || "",
    };
  }
  const heartbeat = watcher.lastHeartbeat?.heartbeat;
  if (!heartbeat?.found) {
    return {
      ...base,
      checked: true,
      reason: "last-heartbeat-not-seen",
    };
  }

  const heartbeatStatus = boardToken(heartbeat.status, "");
  const blockers = boardToken(heartbeat.blockers || "none", "none");
  const warnings = boardToken(heartbeat.warnings || "none", "none");
  const reason = boardToken(heartbeat.reason, "unknown");
  const blocked = heartbeatStatus === "blocked" || hasIssueList(blockers);
  const warned = heartbeatStatus === "warning" || hasIssueList(warnings);
  const status = blocked
    ? "blocked"
    : warned
      ? "warning"
      : heartbeatStatus === "ok" || heartbeatStatus === "online"
        ? "ok"
        : "unknown";

  return {
    checked: true,
    status,
    reason,
    heartbeatStatus: heartbeatStatus || "unknown",
    blockers,
    warnings,
    checkedAt: heartbeat.checkedAt || "",
  };
}

function formatAgeForBoard(ageMs) {
  const seconds = ageSeconds(ageMs);
  return seconds === null ? "unknown" : `${seconds}s`;
}

function formatMacHeartbeatFreshnessSummary(freshness) {
  if (!freshness) return "MacHeartbeatFreshness=unknown checked=unknown codex=unknown board=unknown checkedAt=unknown";
  return [
    `MacHeartbeatFreshness=${freshness.status || "unknown"}`,
    `checked=${formatAgeForBoard(freshness.checkedAgeMs)}`,
    `codex=${formatAgeForBoard(freshness.codexAgeMs)}`,
    `board=${formatAgeForBoard(freshness.boardAgeMs)}`,
    `checkedAt=${freshness.checkedAt || "unknown"}`,
  ].join(" ");
}

function formatMacHeartbeatHealthSummary(health) {
  if (!health) return "MacHeartbeatHealth=unknown reason=unknown heartbeat=unknown blockers=unknown warnings=unknown checkedAt=unknown";
  return [
    `MacHeartbeatHealth=${health.status || "unknown"}`,
    `reason=${boardToken(health.reason)}`,
    `heartbeat=${boardToken(health.heartbeatStatus)}`,
    `blockers=${boardToken(health.blockers)}`,
    `warnings=${boardToken(health.warnings)}`,
    `checkedAt=${health.checkedAt || "unknown"}`,
  ].join(" ");
}

function buildSuggestedAction(report) {
  if (report.host?.online && report.host?.buildDiff?.severity === "restart-recommended") {
    return {
      id: "restart-mac-host-safely",
      reason: "Mac host runtime build is stale; stop the old local host, restart with a visible password prompt, then rerun MacResumeStatus.",
      commands: {
        macHostStopCommand: report.commands.macHostStopCommand,
        macHostSafeStartCommand: report.commands.macHostSafeStartCommand,
        macMaxFpsSafeStartCommand: report.commands.macMaxFpsSafeStartCommand,
        macResumeStatusCommand: report.commands.macResumeStatusCommand,
      },
      boardSummary: "suggestedAction=restart-mac-host-safely actionCommands=MacHostStop->MacHostSafeStart-or-MacMaxFpsSafeStart->MacResumeStatus",
    };
  }
  return null;
}

function formatBoardSummary(report) {
  const { git, host, board, currentBuildId, recommendations, macHeartbeatWatcher } = report;
  const repoState = `${currentBuildId || "unknown"} ${git.clean ? "clean" : `dirty:${git.changes.length}`}`;
  const blockerItems = recommendations.filter((item) => item.level === "blocker");
  const warningItems = recommendations.filter((item) => item.level === "warning");
  const blockers = blockerItems.length;
  const warnings = warningItems.length;
  const attention = blockers > 0
    ? `attention=${blockers} blocker(s)`
    : warnings > 0
      ? `attention=${warnings} warning(s)`
      : "attention=none";
  const findingSummary = formatRecommendationSummary(blockerItems, warningItems);
  const callSummary = formatBoardCallSummary(board);
  const heartbeatWatcherSummary = formatHeartbeatWatcherSummary(macHeartbeatWatcher);
  const heartbeatFreshnessSummary = formatMacHeartbeatFreshnessSummary(report.macHeartbeatFreshness);
  const heartbeatHealthSummary = formatMacHeartbeatHealthSummary(report.macHeartbeatHealth);
  const macEvidenceSummary = formatMacEvidenceSummary(board);
  const macPowerHealthSummary = formatMacPowerHealthSummary(board);
  const suggestedActionSummary = report.suggestedAction?.boardSummary ? ` ${report.suggestedAction.boardSummary}` : "";

  if (!host.online) {
    return [
      `Mac resume: repo=${repoState}; Mac host offline at ${host.probe.host}:${host.probe.port}; ${callSummary}; ${heartbeatWatcherSummary}; ${heartbeatFreshnessSummary}; ${heartbeatHealthSummary}; ${attention}${findingSummary ? ` ${findingSummary}` : ""}.`,
      macEvidenceSummary,
      macPowerHealthSummary,
      `MacHostSafeStart=${report.commands.macHostSafeStartCommand}.`,
      `MacMaxFpsSafeStart=${report.commands.macMaxFpsSafeStartCommand}.`,
      `MacHostStop=${report.commands.macHostStopCommand}.`,
      `MacLaunchAgentLoad=${report.commands.macLaunchAgentLoadCommand}.`,
      `MacLaunchAgentPrint=${report.commands.macLaunchAgentPrintCommand}.`,
      `MacHostReadiness=${report.commands.macHostReadinessCommand}.`,
      "Next: start the formal host with MacHostSafeStart, or MacMaxFpsSafeStart for foreground 60Hz validation, before Windows E2E; after host is online run MacHostMedia for the media baseline.",
      `MacHostMedia=${report.commands.macHostMediaCommand}.`,
      `MacFormalLocalSmoke=${report.commands.macFormalLocalSmokeCommand}.`,
      `MacFormalE2E=${report.commands.macFormalE2eStatusCommand}.`,
      `MacUnattendedStatus=${report.commands.macUnattendedStatusCommand}.`,
      `MacUnattendedSendStatus=${report.commands.macUnattendedSendStatusCommand}.`,
      `MacUnattendedFormal=${report.commands.macUnattendedFormalCommand}.`,
      `MacLaunchAgentPlan=${report.commands.macLaunchAgentPlanCommand}.`,
      `MacMaxFpsPlan=${report.commands.macMaxFpsPlanCommand}.`,
      `MacClientPage=${report.commands.macClientPageStatusCommand}; MacClientDiagnostics=${report.commands.macClientDiagnosticsCommand}; CopyDiagnostics=${report.commands.macClientCopyDiagnosticsAction}.`,
      `MacClientDiscoverWindows=${report.commands.macClientDiscoverWindowsCommand}.`,
      `MacClientReverseRehearsal=${report.commands.macClientReverseRehearsalAction}.`,
      `MacClientFormalChecklist=${report.commands.macClientFormalChecklistCommand}.`,
      `MacClientFormalSmoke=${report.commands.macClientFormalSmokeCommand}.`,
      `MacClientPromptPasswordSmoke=${report.commands.macClientPromptPasswordSmokeCommand}.`,
      `MacClientBrowserSelfTest=${report.commands.macClientBrowserSelfTestCommand}.`,
      `MacHeartbeatOnce=${report.commands.macHeartbeatOnceCommand}.`,
      `MacHeartbeatWatch=${report.commands.macHeartbeatWatchCommand}.`,
      `MacHeartbeatStart=${report.commands.macHeartbeatStartCommand}.`,
      `MacHeartbeatStatus=${report.commands.macHeartbeatStatusCommand}.`,
      `MacHeartbeatStop=${report.commands.macHeartbeatStopCommand}.`,
      `MacScriptHelp=${report.commands.macScriptHelpCommand}.`,
      "Do not send passwords on Agent Link Board; inject startups require the user watching the Mac screen and --confirmUserWatching.",
    ].filter(Boolean).join(" ");
  }

  const permissions = formatPermissions(host.permissions || {});
  const h264 = statusValue(host.capabilities?.h264Stream);
  const audio = host.capabilities?.audioMode || statusValue(host.capabilities?.audio);
  const pipeline = host.capabilities?.capturePipeline || "unknown";
  const displays = formatDisplays(host.displays);
  const runtimeBuild = host.runtime?.buildId || "unknown";
  const buildDiff = formatBoardBuildDiff(host.buildDiff);

  return [
    `Mac resume: repo=${repoState}; host=${formatBoardHostAddress(host)} online runtimeBuild=${runtimeBuild} inputMode=${host.inputMode || "unknown"}; ${callSummary}; ${heartbeatWatcherSummary}; ${heartbeatFreshnessSummary}; ${heartbeatHealthSummary}.`,
    macEvidenceSummary,
    macPowerHealthSummary,
    `Permissions ${permissions}; h264=${h264}; audio=${audio}; pipeline=${pipeline}; displays=${displays}; ${buildDiff}; ${attention}${findingSummary ? ` ${findingSummary}` : ""}${suggestedActionSummary}.`,
    `MacHostSafeStart=${report.commands.macHostSafeStartCommand}.`,
    `MacMaxFpsSafeStart=${report.commands.macMaxFpsSafeStartCommand}.`,
    `MacHostStop=${report.commands.macHostStopCommand}.`,
    `MacLaunchAgentLoad=${report.commands.macLaunchAgentLoadCommand}.`,
    `MacLaunchAgentPrint=${report.commands.macLaunchAgentPrintCommand}.`,
    `MacHostReadiness=${report.commands.macHostReadinessCommand}.`,
    `MacHostMedia=${report.commands.macHostMediaCommand}.`,
    "Media baseline command: run MacHostMedia before long formal H.264/PCM validation.",
    `MacFormalLocalSmoke=${report.commands.macFormalLocalSmokeCommand}.`,
    `MacFormalE2E=${report.commands.macFormalE2eStatusCommand}.`,
    `MacUnattendedStatus=${report.commands.macUnattendedStatusCommand}.`,
    `MacUnattendedSendStatus=${report.commands.macUnattendedSendStatusCommand}.`,
    `MacUnattendedFormal=${report.commands.macUnattendedFormalCommand}.`,
    `MacLaunchAgentPlan=${report.commands.macLaunchAgentPlanCommand}.`,
    `MacMaxFpsPlan=${report.commands.macMaxFpsPlanCommand}.`,
    `MacClientPage=${report.commands.macClientPageStatusCommand}; MacClientDiagnostics=${report.commands.macClientDiagnosticsCommand}; CopyDiagnostics=${report.commands.macClientCopyDiagnosticsAction}.`,
    `MacClientDiscoverWindows=${report.commands.macClientDiscoverWindowsCommand}.`,
    `MacClientReverseRehearsal=${report.commands.macClientReverseRehearsalAction}.`,
    `MacClientFormalChecklist=${report.commands.macClientFormalChecklistCommand}.`,
    `MacClientFormalSmoke=${report.commands.macClientFormalSmokeCommand}.`,
    `MacClientPromptPasswordSmoke=${report.commands.macClientPromptPasswordSmokeCommand}.`,
    `MacClientBrowserSelfTest=${report.commands.macClientBrowserSelfTestCommand}.`,
    `MacHeartbeatOnce=${report.commands.macHeartbeatOnceCommand}.`,
    `MacHeartbeatWatch=${report.commands.macHeartbeatWatchCommand}.`,
    `MacHeartbeatStart=${report.commands.macHeartbeatStartCommand}.`,
    `MacHeartbeatStatus=${report.commands.macHeartbeatStatusCommand}.`,
    `MacHeartbeatStop=${report.commands.macHeartbeatStopCommand}.`,
    `MacScriptHelp=${report.commands.macScriptHelpCommand}.`,
    "Next formal path: Windows discovery -> auth -> H.264 5-10 min -> audio -> clipboard -> input-log.",
    "Do not send passwords on Agent Link Board; inject startups require the user watching the Mac screen and --confirmUserWatching.",
  ].filter(Boolean).join(" ");
}

function formatRecommendationSummary(blockerItems, warningItems) {
  return [
    `blockers=${blockerItems.length > 0 ? summarizeRecommendationIds(blockerItems) : "none"}`,
    `warnings=${warningItems.length > 0 ? summarizeRecommendationIds(warningItems) : "none"}`,
  ].join(" ");
}

function summarizeRecommendationIds(items) {
  const ids = [...new Set(items.map((item) => item.id).filter(Boolean))];
  if (ids.length === 0) return "unknown";
  if (ids.length <= 4) return ids.join(",");
  return `${ids.slice(0, 4).join(",")}+${ids.length - 4}more`;
}

function printReport(report) {
  const { git, host, board, recommendations, macHeartbeatWatcher } = report;
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
    if (board.macPowerHealth) {
      console.log(`[INFO] Mac power health: status=${board.macPowerHealth.status} reason=${board.macPowerHealth.reason} warnings=${board.macPowerHealth.warnings}`);
    }
  } else {
    console.log("[INFO] Agent Link Board: not checked; add --checkBoard when coordinating with Windows Codex.");
  }
  if (macHeartbeatWatcher?.checked) {
    const state = macHeartbeatWatcher.running ? `running pid=${macHeartbeatWatcher.pid || "unknown"}` : "not running";
    const last = macHeartbeatWatcher.lastHeartbeat?.heartbeat?.found
      ? `last=${macHeartbeatWatcher.lastHeartbeat.heartbeat.status || "unknown"} checkedAt=${macHeartbeatWatcher.lastHeartbeat.heartbeat.checkedAt || "unknown"} reason=${macHeartbeatWatcher.lastHeartbeat.heartbeat.reason || "unknown"}`
      : "last=not seen";
    console.log(`[${macHeartbeatWatcher.ok ? "OK" : "WARN"}] Mac heartbeat watcher: ${state}; ${last}`);
  }
  if (report.macHeartbeatHealth) {
    const health = report.macHeartbeatHealth;
    console.log(`[INFO] Mac heartbeat health: status=${health.status || "unknown"} reason=${health.reason || "unknown"} blockers=${health.blockers || "unknown"} warnings=${health.warnings || "unknown"}`);
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
  console.log(`[NEXT] Mac formal local smoke: ${report.commands.macFormalLocalSmokeCommand}`);
  console.log(`[NEXT] Mac formal E2E preflight: ${report.commands.macFormalE2eStatusCommand}`);
  console.log(`[NEXT] Mac host safe start: ${report.commands.macHostSafeStartCommand}`);
  console.log(`[NEXT] Mac 60Hz safe foreground start: ${report.commands.macMaxFpsSafeStartCommand}`);
  console.log(`[NEXT] Mac host stop before LaunchAgent load: ${report.commands.macHostStopCommand}`);
  console.log(`[NEXT] Mac LaunchAgent load: ${report.commands.macLaunchAgentLoadCommand}`);
  console.log(`[NEXT] Mac LaunchAgent print: ${report.commands.macLaunchAgentPrintCommand}`);
  console.log(`[NEXT] Mac host readiness: ${report.commands.macHostReadinessCommand}`);
  console.log(`[NEXT] Mac unattended/startup status: ${report.commands.macUnattendedStatusCommand}`);
  console.log(`[NEXT] Mac unattended board-status refresh: ${report.commands.macUnattendedSendStatusCommand}`);
  console.log(`[NEXT] Mac unattended formal 60Hz gate: ${report.commands.macUnattendedFormalCommand}`);
  console.log(`[NEXT] Mac LaunchAgent dry-run plan: ${report.commands.macLaunchAgentPlanCommand}`);
  console.log(`[NEXT] Mac max FPS dry-run plan: ${report.commands.macMaxFpsPlanCommand}`);
  console.log(`[NEXT] Mac client page status: ${report.commands.macClientPageStatusCommand}`);
  console.log(`[NEXT] Mac client diagnostics: ${report.commands.macClientDiagnosticsCommand}`);
  console.log(`[NEXT] Mac client discover Windows host: ${report.commands.macClientDiscoverWindowsCommand}`);
  console.log(`[NEXT] Mac client reverse rehearsal: ${report.commands.macClientReverseRehearsalAction}`);
  console.log(`[NEXT] Mac client formal checklist: ${report.commands.macClientFormalChecklistCommand}`);
  console.log(`[NEXT] Mac client formal smoke preflight: ${report.commands.macClientFormalSmokeCommand}`);
  console.log(`[NEXT] Mac client prompt-password smoke: ${report.commands.macClientPromptPasswordSmokeCommand}`);
  console.log(`[NEXT] Mac client browser self-test: ${report.commands.macClientBrowserSelfTestCommand}`);
  console.log(`[NEXT] Mac heartbeat one-shot board update: ${report.commands.macHeartbeatOnceCommand}`);
  console.log(`[NEXT] Mac heartbeat continuous board watcher: ${report.commands.macHeartbeatWatchCommand}`);
  console.log(`[NEXT] Mac heartbeat background start: ${report.commands.macHeartbeatStartCommand}`);
  console.log(`[NEXT] Mac heartbeat background status: ${report.commands.macHeartbeatStatusCommand}`);
  console.log(`[NEXT] Mac heartbeat background stop: ${report.commands.macHeartbeatStopCommand}`);
  console.log(`[NEXT] Mac client copy diagnostics: ${report.commands.macClientCopyDiagnosticsAction}`);
  console.log(`[NEXT] Mac script help safety check: ${report.commands.macScriptHelpCommand}`);
  if (report.suggestedAction?.id) {
    console.log(`[NEXT] Suggested action: ${report.suggestedAction.id} · ${report.suggestedAction.reason}`);
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
  const macHeartbeatWatcher = getMacHeartbeatWatcherStatus(args);
  const recommendations = buildRecommendations({ git, host, board, macHeartbeatWatcher, args });
  const checkedAt = new Date().toISOString();
  const macHeartbeatFreshness = makeMacHeartbeatFreshness(macHeartbeatWatcher, Date.parse(checkedAt));
  const macHeartbeatHealth = makeMacHeartbeatHealth(macHeartbeatWatcher);
  const report = {
    ok: computeOk({ git, host, board, recommendations, args }),
    checkedAt,
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
    macHeartbeatWatcher,
    macHeartbeatFreshness,
    macHeartbeatHealth,
    host,
    commands: {
      mediaReadinessBoardSummary: makeMediaReadinessBoardSummaryCommand(args),
      macHostMediaCommand: makeMediaReadinessBoardSummaryCommand(args),
      macHostSafeStartCommand: makeMacHostSafeStartCommand(args),
      macMaxFpsSafeStartCommand: makeMacMaxFpsSafeStartCommand(args),
      macResumeStatusCommand: makeMacResumeStatusCommand(args),
      macHostStopCommand: makeMacHostStopCommand(args),
      macLaunchAgentLoadCommand: makeMacLaunchAgentLoadCommand(),
      macLaunchAgentPrintCommand: makeMacLaunchAgentPrintCommand(),
      macHostReadinessCommand: makeMacHostReadinessCommand(args),
      macFormalLocalSmokeCommand: makeMacFormalLocalSmokeCommand(args),
      macFormalE2eStatusCommand: makeMacFormalE2eStatusCommand(args),
      macUnattendedStatusCommand: makeMacUnattendedStatusCommand(args),
      macUnattendedSendStatusCommand: makeMacUnattendedSendStatusCommand(args),
      macUnattendedFormalCommand: makeMacUnattendedFormalCommand(args),
      macLaunchAgentPlanCommand: makeMacLaunchAgentPlanCommand(args),
      macMaxFpsPlanCommand: makeMacMaxFpsPlanCommand(args),
      macClientPageStatusCommand: makeMacClientPageStatusCommand(),
      macClientDiagnosticsCommand: makeMacClientDiagnosticsCommand(),
      macClientDiscoverWindowsCommand: makeMacClientDiscoverWindowsCommand(),
      macClientReverseRehearsalAction: makeMacClientReverseRehearsalAction(),
      macClientFormalChecklistCommand: makeMacClientFormalChecklistCommand(),
      macClientFormalSmokeCommand: makeMacClientFormalSmokeCommand(),
      macClientPromptPasswordSmokeCommand: makeMacClientPromptPasswordSmokeCommand(),
      macClientBrowserSelfTestCommand: makeMacClientBrowserSelfTestCommand(),
      macHeartbeatOnceCommand: makeMacHeartbeatOnceCommand(),
      macHeartbeatWatchCommand: makeMacHeartbeatWatchCommand(),
      macHeartbeatStartCommand: makeMacHeartbeatStartCommand(),
      macHeartbeatStatusCommand: makeMacHeartbeatStatusCommand(),
      macHeartbeatStopCommand: makeMacHeartbeatStopCommand(),
      macClientCopyDiagnosticsAction: "Mac client 事件日志点击“复制诊断”，粘贴前确认不包含连接密码",
      macScriptHelpCommand: makeMacScriptHelpCommand(),
    },
    recommendations,
  };
  report.suggestedAction = buildSuggestedAction(report);
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
