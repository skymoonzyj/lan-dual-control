#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { emptyWindowsLanRisk, formatWindowsLanRisk, readWindowsLanRiskFromBoard } from "./board-windows-lan-risk.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  port: 43770,
  timeoutMs: 650,
  concurrency: 64,
  maxHostsPerSubnet: 254,
  requireFound: false,
  noLocalSubnets: false,
  server: "http://192.168.31.68:17888",
  checkBoard: false,
  json: false,
  boardSummary: false,
  verbose: false,
  scanTimeoutMs: 0,
};

const manualChecklistSummary = "connection/video/audio/clipboard/input_ack/diagnostics";
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
  console.log(`Usage: node scripts/mac/discover-windows-hosts.mjs [options]

Finds Windows LAN dual-control host /discovery endpoints from the Mac side.
This is read-only: it does not authenticate, connect WebSocket, ask for a
password, send input, or execute inject.

Options:
  --port <port>           Discovery port. Can be repeated. Default: ${defaults.port}
  --host <host>           Direct host to probe. Can be repeated.
  --subnet <cidr>         IPv4 subnet to scan, for example 192.168.31.0/24. Can be repeated.
  --timeoutMs <ms>        Per-host HTTP timeout. Default: ${defaults.timeoutMs}
  --scanTimeoutMs <ms>    Overall scanner timeout. Default: auto, at least 30s
  --concurrency <n>       Parallel probe count. Default: ${defaults.concurrency}
  --maxHostsPerSubnet <n> Safety cap per subnet. Default: ${defaults.maxHostsPerSubnet}
  --requireFound          Exit non-zero when no Windows host is found.
  --noLocalSubnets        Only probe 127.0.0.1, --host, and --subnet targets.
  --server <url>          Agent Link Board URL. Default: ${defaults.server}
  --checkBoard            Read Agent Link Board /api/state for WindowsLanRisk=
                          and MacUnattendedFreshness hints.
  --boardSummary          Print a short secret-free Agent Link Board summary.
  --json                  Print one machine-readable JSON object.
  --verbose               Include scanner misses.
  --help, -h              Show this help without scanning.

Examples:
  node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary
  node scripts/mac/discover-windows-hosts.mjs --subnet 192.168.31.0/24 --requireFound
  node scripts/mac/discover-windows-hosts.mjs --host 192.168.31.68 --json

Machine-readable JSON fields:
  formalChecklistCommand   Secret-free board summary command for the Mac
                           controls Windows formal checklist.
  macClientFormalChecklistCommand
                           Alias of formalChecklistCommand with the standard
                           MacClientFormalChecklist= board-summary label for
                           watcher and automation consumers.
  formalSmokeCommand       Secret-free run-mac-client-formal-smoke preflight
                           command. It can start/reuse the local Mac client
                           page, but does not authenticate, prompt for a
                           password, send a call, or send input.
  macClientFormalSmokeCommand
                           Standard MacClientFormalSmoke= board-summary label
                           for watcher and automation consumers. It uses the
                           safe --discover --ensureClient --preflightOnly shape.
  macClientPromptPasswordSmokeCommand
                           User-present browser smoke command with the standard
                           MacClientPromptPasswordSmoke= board-summary label.
                           It only prompts when this command is explicitly run.
  macClientBrowserSelfTestCommand
                           Secret-free local Mac client browser self-test. It
                           uses a temporary mock Windows host and does not use
                           a real host, password, call, or inject.
  macScriptHelpCommand     Secret-free Mac script help safety check. It only
                           runs --help/-h paths and does not start services,
                           read Agent Link Board, prompt, auth, input, or
                           inject.
  macPowerPlanCommand      Secret-free dry-run Mac power plan command for
                           keeping formal testing awake. It does not apply
                           system settings.
  macUnattendedFreshness   Optional fresh/stale summary for current Mac
                           Unattended or MacPowerHealth evidence from Agent
                           Link Board when --checkBoard is enabled.
  windowsReverseGrantStatus
                           Secret-free Windows-side PowerShell status command
                           for the local one-time reverse-control grant.
  windowsOpenOneTimeReverseGrant
                           Secret-free Windows-side PowerShell command to open
                           a short local one-time reverse-control grant.
  windowsReverseGrantStatusNodeFallback
                           Secret-free Node fallback status command for
                           Windows environments without PowerShell available.
  windowsOpenOneTimeReverseGrantNodeFallback
                           Secret-free Node fallback command to open the same
                           short local one-time reverse-control grant.
  windowsLanRisk          Secret-free WindowsLanRisk= hints copied from Agent
                           Link Board when --checkBoard is enabled. Only safe
                           comma-separated risk tokens are accepted.
  reverseControlRehearsal  Secret-free human rehearsal for the guarded
                           reverse-control request loop after authentication:
                           Mac expects LAN008 first, Windows opens a local
                           one-time grant, then Mac retries.
  manualChecklistSummary   Human true-test checklist order:
                           ${manualChecklistSummary}.
`);
}

function parseArgs(argv) {
  const args = {
    ports: [],
    hosts: [],
    subnets: [],
    timeoutMs: defaults.timeoutMs,
    scanTimeoutMs: defaults.scanTimeoutMs,
    concurrency: defaults.concurrency,
    maxHostsPerSubnet: defaults.maxHostsPerSubnet,
    requireFound: defaults.requireFound,
    noLocalSubnets: defaults.noLocalSubnets,
    server: defaults.server,
    checkBoard: defaults.checkBoard,
    json: defaults.json,
    boardSummary: defaults.boardSummary,
    verbose: defaults.verbose,
    help: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--json" || token === "--boardSummary" || token === "--verbose" || token === "--requireFound" || token === "--noLocalSubnets" || token === "--checkBoard") {
      args[token.slice(2)] = true;
      continue;
    }
    if (token === "--port" && next && !next.startsWith("--")) {
      args.ports.push(clampInteger(next, 1, 65535, defaults.port));
      index += 1;
      continue;
    }
    if (token === "--host" && next && !next.startsWith("--")) {
      args.hosts.push(next.trim());
      index += 1;
      continue;
    }
    if (token === "--subnet" && next && !next.startsWith("--")) {
      args.subnets.push(next.trim());
      index += 1;
      continue;
    }
    if (token === "--server" && next && !next.startsWith("--")) {
      args.server = next.trim();
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 100, 5000, defaults.timeoutMs);
      index += 1;
      continue;
    }
    if (token === "--scanTimeoutMs" && next && !next.startsWith("--")) {
      args.scanTimeoutMs = clampInteger(next, 1000, 300000, defaults.scanTimeoutMs);
      index += 1;
      continue;
    }
    if (token === "--concurrency" && next && !next.startsWith("--")) {
      args.concurrency = clampInteger(next, 1, 256, defaults.concurrency);
      index += 1;
      continue;
    }
    if (token === "--maxHostsPerSubnet" && next && !next.startsWith("--")) {
      args.maxHostsPerSubnet = clampInteger(next, 1, 1024, defaults.maxHostsPerSubnet);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (args.ports.length === 0) {
    args.ports.push(defaults.port);
  }
  args.hosts = [...new Set(args.hosts.filter(Boolean))];
  args.subnets = [...new Set(args.subnets.filter(Boolean))];
  args.server = String(args.server || defaults.server).trim();
  return args;
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
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

function scannerArgs(args) {
  const result = [
    process.env.LAN_DUAL_DISCOVER_LAN_HOSTS_SCRIPT || "scripts/windows/discover-lan-hosts.mjs",
    "--json",
    "--timeoutMs",
    String(args.timeoutMs),
    "--concurrency",
    String(args.concurrency),
    "--maxHostsPerSubnet",
    String(args.maxHostsPerSubnet),
  ];
  for (const port of args.ports) {
    result.push("--port", String(port));
  }
  for (const host of args.hosts) {
    result.push("--host", host);
  }
  for (const subnet of args.subnets) {
    result.push("--subnet", subnet);
  }
  if (args.noLocalSubnets) {
    result.push("--noLocalSubnets");
  }
  if (args.verbose) {
    result.push("--verbose");
  }
  return result;
}

function runScanner(args) {
  const estimatedSubnetCandidates = Math.max(1, args.hosts.length + (args.subnets.length || 1) * args.maxHostsPerSubnet);
  const estimatedWaves = Math.max(1, Math.ceil((estimatedSubnetCandidates * args.ports.length) / Math.max(args.concurrency, 1)));
  const autoTimeoutBudgetMs = Math.min(180000, Math.max(30000, args.timeoutMs * (estimatedWaves + 8) + 12000));
  const timeoutBudgetMs = args.scanTimeoutMs || autoTimeoutBudgetMs;
  const result = spawnSync(process.execPath, scannerArgs(args), {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: timeoutBudgetMs,
    maxBuffer: 12 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
  });
  if (result.error) {
    throw new Error(`LAN discovery scanner failed: ${result.error.message}`);
  }
  const stdout = String(result.stdout || "").trim();
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`LAN discovery scanner did not print valid JSON: ${error.message}\n${stdout}\n${result.stderr || ""}`);
  }
}

function isWindowsHost(item) {
  return String(item?.platform || "").toLowerCase() === "windows";
}

function summarizeHost(item) {
  const runtime = item.runtime?.buildId ? ` build=${item.runtime.buildId}` : "";
  const name = item.deviceName || "Windows host";
  const mode = item.capabilities?.input?.mode || item.capabilities?.inputMode || "";
  const input = mode ? ` input=${mode}` : "";
  return `${name} at ${item.host}:${item.port}${runtime}${input}`;
}

function readinessCommand(item) {
  return `node scripts/mac/check-mac-client-formal-status.mjs --host ${item.host} --port ${item.port} --boardSummary`;
}

function formalSmokeCommand(item) {
  return `node scripts/mac/run-mac-client-formal-smoke.mjs --host ${item.host} --port ${item.port} --ensureClient --preflightOnly --boardSummary`;
}

function macClientFormalSmokeCommand(args, item) {
  const command = [
    "node scripts/mac/run-mac-client-formal-smoke.mjs",
    "--discover",
    "--ensureClient",
    "--preflightOnly",
    "--boardSummary",
  ];
  const port = Number(item?.port || args.ports?.[0] || defaults.port);
  if (Number.isInteger(port) && port !== defaults.port) command.push("--port", String(port));
  if (args.server !== defaults.server) command.push("--server", args.server);
  return command.join(" ");
}

function macClientPromptPasswordSmokeCommand(args, item) {
  const command = ["node scripts/mac/run-mac-client-formal-smoke.mjs"];
  if (item?.host) {
    command.push("--host", item.host, "--port", String(item.port || args.ports?.[0] || defaults.port));
  } else {
    command.push("--discover");
    const port = Number(args.ports?.[0] || defaults.port);
    if (Number.isInteger(port) && port !== defaults.port) command.push("--port", String(port));
  }
  command.push("--ensureClient", "--promptPassword", "--boardSummary");
  if (args.server !== defaults.server) command.push("--server", args.server);
  return command.join(" ");
}

function macClientBrowserSelfTestCommand() {
  return "node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs --boardSummary";
}

function macScriptHelpCommand() {
  return "node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary";
}

function macPowerPlanCommand() {
  return "node scripts/mac/plan-mac-power-settings.mjs --profile all --sleep 0 --displaySleep 0 --networkWake on --boardSummary";
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

function sendCallCommand(item) {
  return `node scripts/mac/check-mac-client-formal-status.mjs --host ${item.host} --port ${item.port} --sendCall`;
}

function windowsReverseGrantPowerShellCommand(item, action = "grant") {
  const parts = [
    "pwsh -NoProfile -ExecutionPolicy Bypass",
    "-File",
    "scripts/windows/allow-windows-reverse-control.ps1",
    "-HostName",
    "127.0.0.1",
    "-Port",
    String(item.port),
  ];
  if (action === "status") {
    parts.push("-Status");
  } else {
    parts.push("-Grant", "-DurationMs", "30000");
  }
  parts.push("-BoardSummary");
  return parts.join(" ");
}

function windowsReverseGrantNodeFallbackCommand(item, action = "grant") {
  const parts = [
    "node scripts/windows/allow-windows-reverse-control.mjs",
    "--host",
    "127.0.0.1",
    "--port",
    String(item.port),
  ];
  if (action === "status") {
    parts.push("--status");
  } else {
    parts.push("--grant", "--durationMs", "30000");
  }
  parts.push("--boardSummary");
  return parts.join(" ");
}

function reverseControlRehearsal(item) {
  return [
    "Mac clicks 请求反控 after auth and expects LAN008/default deny.",
    `Windows runs local loopback grant: ${windowsReverseGrantPowerShellCommand(item, "grant")}.`,
    `Node fallback: ${windowsReverseGrantNodeFallbackCommand(item, "grant")}.`,
    "Mac clicks 重试反控 and expects accepted/临时授权已使用; no password, input_event, or inject is sent by discovery.",
  ].join(" ");
}

function buildReport(scan, args, windowsLanRisk = emptyWindowsLanRisk(false), macUnattendedFreshness = null) {
  const found = Array.isArray(scan.found) ? scan.found : [];
  const windowsHosts = found.filter(isWindowsHost);
  const nonWindowsHosts = found.filter((item) => !isWindowsHost(item));
  const best = windowsHosts[0] || null;
  const report = {
    ok: windowsHosts.length > 0 || !args.requireFound,
    found: windowsHosts,
    ignored: nonWindowsHosts,
    best,
    scanned: scan.scanned || 0,
    ports: scan.ports || args.ports,
    subnets: scan.subnets || [],
    nextCommand: best ? readinessCommand(best) : "",
    formalChecklistCommand: best ? readinessCommand(best) : "",
    macClientFormalChecklistCommand: best ? readinessCommand(best) : "",
    formalSmokeCommand: best ? formalSmokeCommand(best) : "",
    macClientFormalSmokeCommand: best ? macClientFormalSmokeCommand(args, best) : macClientFormalSmokeCommand(args, null),
    macClientPromptPasswordSmokeCommand: best ? macClientPromptPasswordSmokeCommand(args, best) : macClientPromptPasswordSmokeCommand(args, null),
    macClientBrowserSelfTestCommand: macClientBrowserSelfTestCommand(),
    macScriptHelpCommand: macScriptHelpCommand(),
    macPowerPlanCommand: macPowerPlanCommand(),
    macUnattendedFreshness,
    manualChecklistSummary,
    sendCallCommand: best ? sendCallCommand(best) : "",
    windowsReverseGrantStatus: best ? windowsReverseGrantPowerShellCommand(best, "status") : "",
    windowsOpenOneTimeReverseGrant: best ? windowsReverseGrantPowerShellCommand(best, "grant") : "",
    windowsReverseGrantStatusNodeFallback: best ? windowsReverseGrantNodeFallbackCommand(best, "status") : "",
    windowsOpenOneTimeReverseGrantNodeFallback: best ? windowsReverseGrantNodeFallbackCommand(best, "grant") : "",
    windowsLanRisk,
    reverseControlRehearsal: best ? reverseControlRehearsal(best) : "",
    boardSummary: "",
  };
  report.boardSummary = makeBoardSummary(report);
  return report;
}

function makeBoardSummary(report) {
  const risk = formatWindowsLanRisk(report.windowsLanRisk);
  const riskSummary = risk ? ` ${risk}.` : "";
  const macUnattendedFreshnessSummary = formatMacUnattendedFreshnessSummary(report.macUnattendedFreshness);
  const macUnattendedFreshnessSegment = macUnattendedFreshnessSummary ? ` ${macUnattendedFreshnessSummary}.` : "";
  if (report.best) {
    return `Windows host discovery: found ${report.found.length}; best=${summarizeHost(report.best)}.${riskSummary} FormalChecklist=${report.formalChecklistCommand}. MacClientFormalChecklist=${report.macClientFormalChecklistCommand}. FormalSmoke=${report.formalSmokeCommand}. MacClientFormalSmoke=${report.macClientFormalSmokeCommand}. MacClientPromptPasswordSmoke=${report.macClientPromptPasswordSmokeCommand}. ManualChecklist=${report.manualChecklistSummary}. MacClientBrowserSelfTest=${report.macClientBrowserSelfTestCommand}. MacScriptHelp=${report.macScriptHelpCommand}. MacPowerPlan=${report.macPowerPlanCommand}.${macUnattendedFreshnessSegment} WindowsReverseGrantStatus=${report.windowsReverseGrantStatus}. WindowsOpenOneTimeReverseGrant=${report.windowsOpenOneTimeReverseGrant}. WindowsReverseGrantStatusNodeFallback=${report.windowsReverseGrantStatusNodeFallback}. WindowsOpenOneTimeReverseGrantNodeFallback=${report.windowsOpenOneTimeReverseGrantNodeFallback}. ReverseRehearsal=${report.reverseControlRehearsal}. If that checklist is ready and Windows coordination is needed: ${report.sendCallCommand}. No password was requested or sent; no WebSocket/input/inject was attempted.`;
  }
  const ignored = report.ignored.length > 0
    ? ` Saw ${report.ignored.length} non-Windows host(s), likely Mac/self.`
    : "";
  return `Windows host discovery: no Windows host found after scanning ${report.scanned} candidate(s).${ignored}${riskSummary} Ask Windows Codex to start Windows host and share IP/port, then rerun Mac formal check. MacClientPromptPasswordSmoke=${report.macClientPromptPasswordSmokeCommand}. MacClientBrowserSelfTest=${report.macClientBrowserSelfTestCommand}. MacScriptHelp=${report.macScriptHelpCommand}. MacPowerPlan=${report.macPowerPlanCommand}.${macUnattendedFreshnessSegment} No password was requested or sent; no WebSocket/input/inject was attempted.`;
}

function printText(report, args) {
  if (report.found.length > 0) {
    console.log(`[OK] Found ${report.found.length} Windows host candidate(s).`);
    for (const item of report.found) {
      console.log(`[OK] ${summarizeHost(item)}`);
    }
    console.log(`[INFO] Next: ${report.nextCommand}`);
    console.log(`[INFO] Formal checklist: ${report.formalChecklistCommand}`);
    console.log(`[INFO] Mac client formal checklist: ${report.macClientFormalChecklistCommand}`);
    console.log(`[INFO] Formal smoke preflight: ${report.formalSmokeCommand}`);
    console.log(`[INFO] Mac client formal smoke: ${report.macClientFormalSmokeCommand}`);
    console.log(`[INFO] Mac client prompt-password smoke: ${report.macClientPromptPasswordSmokeCommand}`);
    console.log(`[INFO] Manual checklist: ${report.manualChecklistSummary}`);
    console.log(`[INFO] Mac client browser self-test: ${report.macClientBrowserSelfTestCommand}`);
    console.log(`[INFO] Mac script help safety check: ${report.macScriptHelpCommand}`);
    console.log(`[INFO] Mac power settings dry-run plan: ${report.macPowerPlanCommand}`);
    if (report.macUnattendedFreshness) {
      console.log(`[INFO] Mac unattended freshness: ${formatMacUnattendedFreshnessSummary(report.macUnattendedFreshness)}`);
    }
    console.log(`[INFO] Windows reverse grant status: ${report.windowsReverseGrantStatus}`);
    console.log(`[INFO] Windows one-time reverse grant: ${report.windowsOpenOneTimeReverseGrant}`);
    console.log(`[INFO] Windows reverse grant status (Node fallback): ${report.windowsReverseGrantStatusNodeFallback}`);
    console.log(`[INFO] Windows one-time reverse grant (Node fallback): ${report.windowsOpenOneTimeReverseGrantNodeFallback}`);
    console.log(`[INFO] Reverse rehearsal: ${report.reverseControlRehearsal}`);
    console.log(`[INFO] Ready call: ${report.sendCallCommand}`);
  } else {
    console.log("[WARN] No Windows LAN dual-control host was found.");
    if (report.ignored.length > 0) {
      for (const item of report.ignored.slice(0, 6)) {
        console.log(`[INFO] Ignored non-Windows host: ${summarizeHost(item)} platform=${item.platform || "unknown"}`);
      }
    }
    const risk = formatWindowsLanRisk(report.windowsLanRisk);
    if (risk) {
      console.log(`[INFO] Agent Link Board hint: ${risk}`);
    }
    console.log("[INFO] Ask Windows Codex to start Windows host, then rerun this discovery or check-mac-client-formal-status with the Windows IP.");
    console.log(`[INFO] Mac client prompt-password smoke: ${report.macClientPromptPasswordSmokeCommand}`);
    console.log(`[INFO] Mac client browser self-test: ${report.macClientBrowserSelfTestCommand}`);
    console.log(`[INFO] Mac script help safety check: ${report.macScriptHelpCommand}`);
    console.log(`[INFO] Mac power settings dry-run plan: ${report.macPowerPlanCommand}`);
    if (report.macUnattendedFreshness) {
      console.log(`[INFO] Mac unattended freshness: ${formatMacUnattendedFreshnessSummary(report.macUnattendedFreshness)}`);
    }
  }
  if (args.verbose && Array.isArray(report.subnets)) {
    for (const subnet of report.subnets) {
      const iface = subnet.interfaceAddress ? ` via ${subnet.interfaceName} ${subnet.interfaceAddress}` : "";
      console.log(`[INFO] Scanned subnet ${subnet.network}/${subnet.prefix}${iface}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || helpRequested(process.argv)) {
    printHelp();
    return;
  }

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
  const scan = runScanner(args);
  const report = buildReport(scan, args, windowsLanRisk, macUnattendedFreshness);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printText(report, args);
  }
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
