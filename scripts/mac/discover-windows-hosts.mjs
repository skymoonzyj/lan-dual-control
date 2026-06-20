#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  emptyWindowsFirewallHealth,
  emptyWindowsLanRisk,
  formatWindowsFirewallHealth,
  formatWindowsLanRisk,
  readWindowsFirewallHealthFromBoard,
  readWindowsLanRiskFromBoard,
} from "./board-windows-lan-risk.mjs";

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
  sendStatus: false,
  sendMessage: false,
  sendCall: false,
  device: "Mac Client Discover Windows",
  role: "Mac 端",
  from: "Mac Codex",
  token: process.env.CODEX_LINK_TOKEN || "",
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
                          WindowsFirewallHealth=, and MacUnattendedFreshness
                          hints.
  --boardSummary          Print a short secret-free Agent Link Board summary.
  --sendStatus            Post the board summary to Agent Link Board /api/status.
  --sendMessage           Post the board summary to Agent Link Board /api/message.
  --sendCall              Send or refresh a Windows host readiness call only
                          when no Windows host is found.
  --device <name>         Status device name. Default: ${defaults.device}
  --role <role>           Status role. Default: ${defaults.role}
  --from <name>           Message sender. Default: ${defaults.from}
  --token <token>         Optional Agent Link Board token header.
  --json                  Print one machine-readable JSON object.
  --verbose               Include scanner misses.
  --help, -h              Show this help without scanning.

Examples:
  node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary
  node scripts/mac/discover-windows-hosts.mjs --checkBoard --sendStatus --sendMessage --boardSummary
  node scripts/mac/discover-windows-hosts.mjs --checkBoard --sendCall --boardSummary
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
  macRemoteAudioPlanCommand
                           Secret-free Mac remote-only audio planner command.
                           It explains current system-pcm behavior and user
                           consent checks without changing system volume or
                           output devices.
  macInputSafetyPlanCommand
                           Secret-free Mac input safety planner command. It
                           explains log-mode defaults and user-visible checks
                           before true input without applying settings or
                           sending input.
  windowsHostStatusCommand Secret-free Windows-side local host status command
                           for Windows Codex to run when Mac discovery finds
                           no Windows host. It only reads loopback status.
  windowsHostReadinessCommand
                           Secret-free Windows-side readiness command for
                           Windows Codex to run before sharing host/IP state.
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
  windowsFirewallHealth   Secret-free WindowsFirewallHealth= hint copied from
                           Agent Link Board when --checkBoard is enabled. Only
                           safe status/reason tokens are accepted.
  scanError               Optional secret-free scanner failure details. A LAN
                           scan timeout is reported as reason=timeout while
                           still printing actionable next-step commands.
  reverseControlRehearsal  Secret-free human rehearsal for the guarded
                           reverse-control request loop after authentication:
                           Mac expects LAN008 first, Windows opens a local
                           one-time grant, then Mac retries.
  windowsHostReadinessCall
                           Secret-free call payload sent only by explicit
                           --sendCall when Mac discovery found no Windows host.
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
    sendStatus: defaults.sendStatus,
    sendMessage: defaults.sendMessage,
    sendCall: defaults.sendCall,
    device: defaults.device,
    role: defaults.role,
    from: defaults.from,
    token: defaults.token,
    help: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--json" || token === "--boardSummary" || token === "--verbose" || token === "--requireFound" || token === "--noLocalSubnets" || token === "--checkBoard" || token === "--sendStatus" || token === "--sendMessage" || token === "--sendCall") {
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
    if ((token === "--device" || token === "--role" || token === "--from" || token === "--token") && next && !next.startsWith("--")) {
      args[token.slice(2)] = next.trim();
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

function compactText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (typeof value !== "object") return String(value).replace(/\s+/g, " ").trim();
  return Object.values(value)
    .map((item) => compactText(item))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function isActiveBoardCall(call) {
  if (!call || typeof call !== "object") return false;
  const status = normalizedText(call.status).toLowerCase();
  if (!status) return true;
  return !["done", "completed", "complete", "cancelled", "canceled", "resolved", "closed"].includes(status);
}

function normalizeCurrentBoardCall(call) {
  if (!call || typeof call !== "object") {
    return {
      active: false,
      raw: "",
    };
  }
  const currentCall = {
    active: isActiveBoardCall(call),
    raw: compactText(call),
  };
  for (const key of ["status", "goal", "from", "need", "environment", "connection", "command", "expected", "actual", "ask", "blockedBy", "owner", "startedAt", "timeout", "updatedAt"]) {
    const value = normalizedText(call[key]);
    if (value) currentCall[key] = value;
  }
  return currentCall;
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
    if (isScannerTimeoutError(result.error)) {
      return {
        ok: false,
        found: [],
        scanned: 0,
        ports: args.ports,
        subnets: [],
        scanError: {
          reason: "timeout",
          timeoutMs: timeoutBudgetMs,
        },
      };
    }
    throw new Error(`LAN discovery scanner failed: ${result.error.message}`);
  }
  const stdout = String(result.stdout || "").trim();
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`LAN discovery scanner did not print valid JSON: ${error.message}\n${stdout}\n${result.stderr || ""}`);
  }
}

function isScannerTimeoutError(error) {
  return error?.code === "ETIMEDOUT" || /\bETIMEDOUT\b/i.test(String(error?.message || ""));
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

function macRemoteAudioPlanCommand() {
  return "node scripts/mac/plan-mac-remote-audio.mjs --boardSummary";
}

function macInputSafetyPlanCommand() {
  return "node scripts/mac/plan-mac-input-safety.mjs --boardSummary";
}

function windowsHostStatusCommand(args, item = null) {
  const port = Number(item?.port || args.ports?.[0] || defaults.port);
  return `node scripts/windows/start-windows-host.mjs --status --host 127.0.0.1 --port ${Number.isInteger(port) ? port : defaults.port} --boardSummary`;
}

function windowsHostReadinessCommand(args, item = null) {
  const port = Number(item?.port || args.ports?.[0] || defaults.port);
  return `node scripts/windows/check-windows-host-readiness.mjs --host 127.0.0.1 --port ${Number.isInteger(port) ? port : defaults.port} --checkBoard --boardSummary`;
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

async function readBoardState(server, timeoutMs, tokenOverride = "") {
  const baseUrl = String(server || "").trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("missing Agent Link Board URL");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 5000));
  try {
    const token = String(tokenOverride || process.env.CODEX_LINK_TOKEN || "");
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

function buildReport(
  scan,
  args,
  windowsLanRisk = emptyWindowsLanRisk(false),
  macUnattendedFreshness = null,
  windowsFirewallHealth = emptyWindowsFirewallHealth(false),
) {
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
    macRemoteAudioPlanCommand: macRemoteAudioPlanCommand(),
    macInputSafetyPlanCommand: macInputSafetyPlanCommand(),
    windowsHostStatusCommand: windowsHostStatusCommand(args, best),
    windowsHostReadinessCommand: windowsHostReadinessCommand(args, best),
    macUnattendedFreshness,
    manualChecklistSummary,
    sendCallCommand: best ? sendCallCommand(best) : "",
    windowsReverseGrantStatus: best ? windowsReverseGrantPowerShellCommand(best, "status") : "",
    windowsOpenOneTimeReverseGrant: best ? windowsReverseGrantPowerShellCommand(best, "grant") : "",
    windowsReverseGrantStatusNodeFallback: best ? windowsReverseGrantNodeFallbackCommand(best, "status") : "",
    windowsOpenOneTimeReverseGrantNodeFallback: best ? windowsReverseGrantNodeFallbackCommand(best, "grant") : "",
    windowsLanRisk,
    windowsFirewallHealth,
    reverseControlRehearsal: best ? reverseControlRehearsal(best) : "",
    windowsHostReadinessCall: null,
    scanError: scan.scanError || null,
    boardSummary: "",
  };
  report.windowsHostReadinessCall = best ? null : windowsHostReadinessCallPayload(args, report);
  report.boardSummary = makeBoardSummary(report);
  return report;
}

function formatScannerWarning(scanError) {
  const reason = String(scanError?.reason || "").toLowerCase();
  if (reason === "timeout") return "ScannerWarning=timeout";
  return "";
}

function makeBoardSummary(report) {
  const risk = formatWindowsLanRisk(report.windowsLanRisk);
  const riskSummary = risk ? ` ${risk}.` : "";
  const firewallHealth = formatWindowsFirewallHealth(report.windowsFirewallHealth);
  const firewallHealthSummary = firewallHealth ? ` ${firewallHealth}.` : "";
  const scannerWarning = formatScannerWarning(report.scanError);
  const scannerWarningSummary = scannerWarning ? ` ${scannerWarning}.` : "";
  const macUnattendedFreshnessSummary = formatMacUnattendedFreshnessSummary(report.macUnattendedFreshness);
  const macUnattendedFreshnessSegment = macUnattendedFreshnessSummary ? ` ${macUnattendedFreshnessSummary}.` : "";
  if (report.best) {
    return `Windows host discovery: found ${report.found.length}; best=${summarizeHost(report.best)}.${riskSummary}${firewallHealthSummary} FormalChecklist=${report.formalChecklistCommand}. MacClientFormalChecklist=${report.macClientFormalChecklistCommand}. FormalSmoke=${report.formalSmokeCommand}. MacClientFormalSmoke=${report.macClientFormalSmokeCommand}. MacClientPromptPasswordSmoke=${report.macClientPromptPasswordSmokeCommand}. ManualChecklist=${report.manualChecklistSummary}. MacClientBrowserSelfTest=${report.macClientBrowserSelfTestCommand}. MacScriptHelp=${report.macScriptHelpCommand}. MacPowerPlan=${report.macPowerPlanCommand}. MacRemoteAudioPlan=${report.macRemoteAudioPlanCommand}. MacInputSafetyPlan=${report.macInputSafetyPlanCommand}.${macUnattendedFreshnessSegment} WindowsReverseGrantStatus=${report.windowsReverseGrantStatus}. WindowsOpenOneTimeReverseGrant=${report.windowsOpenOneTimeReverseGrant}. WindowsReverseGrantStatusNodeFallback=${report.windowsReverseGrantStatusNodeFallback}. WindowsOpenOneTimeReverseGrantNodeFallback=${report.windowsOpenOneTimeReverseGrantNodeFallback}. ReverseRehearsal=${report.reverseControlRehearsal}. If that checklist is ready and Windows coordination is needed: ${report.sendCallCommand}. WindowsHostStatus=${report.windowsHostStatusCommand}. WindowsHostReadiness=${report.windowsHostReadinessCommand}. No password was requested or sent; no WebSocket/input/inject was attempted.`;
  }
  const ignored = report.ignored.length > 0
    ? ` Saw ${report.ignored.length} non-Windows host(s), likely Mac/self.`
    : "";
  return `Windows host discovery: no Windows host found after scanning ${report.scanned} candidate(s).${ignored}${scannerWarningSummary}${riskSummary}${firewallHealthSummary} Ask Windows Codex to start Windows host and share IP/port, then rerun Mac formal check. WindowsHostStatus=${report.windowsHostStatusCommand}. WindowsHostReadiness=${report.windowsHostReadinessCommand}. MacClientPromptPasswordSmoke=${report.macClientPromptPasswordSmokeCommand}. MacClientBrowserSelfTest=${report.macClientBrowserSelfTestCommand}. MacScriptHelp=${report.macScriptHelpCommand}. MacPowerPlan=${report.macPowerPlanCommand}. MacRemoteAudioPlan=${report.macRemoteAudioPlanCommand}. MacInputSafetyPlan=${report.macInputSafetyPlanCommand}.${macUnattendedFreshnessSegment} No password was requested or sent; no WebSocket/input/inject was attempted.`;
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
    console.log(`[INFO] Mac remote audio plan: ${report.macRemoteAudioPlanCommand}`);
    console.log(`[INFO] Mac input safety plan: ${report.macInputSafetyPlanCommand}`);
    console.log(`[INFO] Windows host status: ${report.windowsHostStatusCommand}`);
    console.log(`[INFO] Windows host readiness: ${report.windowsHostReadinessCommand}`);
    if (report.macUnattendedFreshness) {
      console.log(`[INFO] Mac unattended freshness: ${formatMacUnattendedFreshnessSummary(report.macUnattendedFreshness)}`);
    }
    const firewallHealth = formatWindowsFirewallHealth(report.windowsFirewallHealth);
    if (firewallHealth) {
      console.log(`[INFO] Agent Link Board firewall health: ${firewallHealth}`);
    }
    console.log(`[INFO] Windows reverse grant status: ${report.windowsReverseGrantStatus}`);
    console.log(`[INFO] Windows one-time reverse grant: ${report.windowsOpenOneTimeReverseGrant}`);
    console.log(`[INFO] Windows reverse grant status (Node fallback): ${report.windowsReverseGrantStatusNodeFallback}`);
    console.log(`[INFO] Windows one-time reverse grant (Node fallback): ${report.windowsOpenOneTimeReverseGrantNodeFallback}`);
    console.log(`[INFO] Reverse rehearsal: ${report.reverseControlRehearsal}`);
    console.log(`[INFO] Ready call: ${report.sendCallCommand}`);
  } else {
    console.log("[WARN] No Windows LAN dual-control host was found.");
    const scannerWarning = formatScannerWarning(report.scanError);
    if (scannerWarning) {
      console.log(`[WARN] ${scannerWarning}`);
    }
    if (report.ignored.length > 0) {
      for (const item of report.ignored.slice(0, 6)) {
        console.log(`[INFO] Ignored non-Windows host: ${summarizeHost(item)} platform=${item.platform || "unknown"}`);
      }
    }
    const risk = formatWindowsLanRisk(report.windowsLanRisk);
    if (risk) {
      console.log(`[INFO] Agent Link Board hint: ${risk}`);
    }
    const firewallHealth = formatWindowsFirewallHealth(report.windowsFirewallHealth);
    if (firewallHealth) {
      console.log(`[INFO] Agent Link Board firewall health: ${firewallHealth}`);
    }
    console.log("[INFO] Ask Windows Codex to start Windows host, then rerun this discovery or check-mac-client-formal-status with the Windows IP.");
    console.log(`[INFO] Windows host status: ${report.windowsHostStatusCommand}`);
    console.log(`[INFO] Windows host readiness: ${report.windowsHostReadinessCommand}`);
    console.log(`[INFO] Mac client prompt-password smoke: ${report.macClientPromptPasswordSmokeCommand}`);
    console.log(`[INFO] Mac client browser self-test: ${report.macClientBrowserSelfTestCommand}`);
    console.log(`[INFO] Mac script help safety check: ${report.macScriptHelpCommand}`);
    console.log(`[INFO] Mac power settings dry-run plan: ${report.macPowerPlanCommand}`);
    console.log(`[INFO] Mac remote audio plan: ${report.macRemoteAudioPlanCommand}`);
    console.log(`[INFO] Mac input safety plan: ${report.macInputSafetyPlanCommand}`);
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

function discoveryBoardStatus(report) {
  if (report.best) return "windows-discovery-found";
  if (report.scanError?.reason === "timeout") return "windows-discovery-timeout";
  return report.ok ? "windows-discovery-waiting" : "windows-discovery-missing";
}

function boardPostUrl(server, path) {
  const baseUrl = String(server || defaults.server).trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("missing Agent Link Board URL");
  return `${baseUrl}${path}`;
}

async function postToBoard(args, path, payload) {
  const url = boardPostUrl(args.server, path);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
  };
  const token = String(args.token || process.env.CODEX_LINK_TOKEN || "");
  if (token) headers["X-Codex-Link-Token"] = token;
  let response;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      break;
    } catch (error) {
      if (attempt < 2 && isRetryableBoardPostError(error)) {
        await sleep(200);
        continue;
      }
      const cause = error?.cause
        ? ` cause=${error.cause.code || error.cause.name || "unknown"}:${error.cause.message || error.cause}`
        : "";
      throw new Error(`Agent Link Board ${path} fetch failed at ${url}: ${error.message}${cause}`);
    }
  }
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok || body?.ok === false) {
    throw new Error(`Agent Link Board ${path} rejected discovery summary: HTTP ${response.status} ${text}`.trim());
  }
  return body;
}

function isRetryableBoardPostError(error) {
  const code = String(error?.cause?.code || error?.code || "");
  const message = String(error?.cause?.message || error?.message || "");
  return /^(?:ECONNRESET|EPIPE|ETIMEDOUT|UND_ERR_SOCKET)$/.test(code) || /\b(?:ECONNRESET|EPIPE|ETIMEDOUT|socket|closed)\b/i.test(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendStatus(args, report) {
  return postToBoard(args, "/api/status", {
    device: args.device,
    role: args.role,
    status: discoveryBoardStatus(report),
    note: report.boardSummary,
  });
}

async function sendMessage(args, report) {
  return postToBoard(args, "/api/message", {
    from: args.from,
    type: "message",
    text: report.boardSummary,
  });
}

function windowsHostReadinessCallPayload(args, report) {
  const status = discoveryBoardStatus(report);
  const scannerWarning = formatScannerWarning(report.scanError);
  const actual = [
    `MacDiscovery=${status}`,
    `found=${report.found.length}`,
    `scanned=${report.scanned}`,
    scannerWarning,
  ].filter(Boolean).join(" ");
  const ask = [
    "Mac discovery did not find a Windows host.",
    scannerWarning,
    `WindowsHostStatus=${report.windowsHostStatusCommand}.`,
    `WindowsHostReadiness=${report.windowsHostReadinessCommand}.`,
    "Please run or refresh the Windows host locally, then post a secret-free boardSummary with reachable LAN IP/port.",
    "No password; no auth; no input/inject.",
  ].filter(Boolean).join(" ");
  return {
    status: "CALLING",
    from: args.from,
    need: "Windows Codex",
    owner: "Windows Codex",
    goal: "Start or refresh Windows host for Mac-control-Windows preflight",
    environment: "Mac client Windows discovery",
    connection: "Agent Link Board only; no password/auth/input/inject.",
    command: "",
    expected: "Windows host status/readiness boardSummary shows a reachable LAN host/port for Mac client formal preflight.",
    actual,
    blockedBy: "Windows host not discoverable from Mac LAN scan",
    ask,
    timeout: "30m",
  };
}

function isMatchingWindowsHostReadinessCall(call, payload) {
  return Boolean(
    call?.active &&
    call.from === payload.from &&
    call.need === payload.need &&
    call.goal === payload.goal
  );
}

async function sendWindowsHostReadinessCall(args, report) {
  if (report.best) {
    throw new Error(`Refusing to send Windows host readiness call because discovery already found ${report.best.host}:${report.best.port}; use ${report.sendCallCommand} after the formal checklist if coordination is needed.`);
  }
  const payload = report.windowsHostReadinessCall || windowsHostReadinessCallPayload(args, report);
  const state = await readBoardState(args.server, args.timeoutMs, args.token);
  const currentCall = normalizeCurrentBoardCall(state.currentCall);
  if (currentCall.active && !isMatchingWindowsHostReadinessCall(currentCall, payload)) {
    const owner = currentCall.from || currentCall.need || currentCall.owner || "unknown";
    const goal = currentCall.goal || currentCall.raw || "unknown goal";
    throw new Error(`Refusing to replace existing Agent Link Board active call from ${owner}: ${goal}. Wait for it to resolve before sending the Windows host readiness call.`);
  }
  const result = await postToBoard(args, "/api/call", payload);
  return {
    ok: true,
    attempted: true,
    refreshed: Boolean(currentCall.active),
    payload,
    boardCallBeforeSend: currentCall,
    result: result || { ok: true },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || helpRequested(process.argv)) {
    printHelp();
    return;
  }

  const [windowsLanRisk, macUnattendedFreshness, windowsFirewallHealth] = await Promise.all([
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
    readWindowsFirewallHealthFromBoard({
      enabled: args.checkBoard,
      server: args.server,
      timeoutMs: args.timeoutMs,
    }),
  ]);
  const scan = runScanner(args);
  const report = buildReport(scan, args, windowsLanRisk, macUnattendedFreshness, windowsFirewallHealth);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printText(report, args);
  }
  if (args.sendStatus) {
    await sendStatus(args, report);
  }
  if (args.sendMessage) {
    await sendMessage(args, report);
  }
  if (args.sendCall) {
    await sendWindowsHostReadinessCall(args, report);
  }
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
