#!/usr/bin/env node
import http from "node:http";
import https from "node:https";
import os from "node:os";

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  probeHost: "",
  server: "http://192.168.31.68:17888",
  timeoutMs: 2500,
  checkBoard: false,
  json: false,
  boardSummary: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/plan-mac-safe-inject-rehearsal.mjs [options]

Plans a supervised Mac safe inject rehearsal without executing it. This command
is plan-only: it reads Mac host /discovery and, when --checkBoard is set, Agent
Link Board /api/state.userPresence. It does not start Mac host, does not prompt
for passwords, does not authenticate, does not send input events, and does not
enable inject mode.

Options:
  --host <host>       Mac host discovery host. Default: ${defaults.host}
  --port <port>       Mac host discovery port. Default: ${defaults.port}
  --probeHost <host>  Host address Windows should probe. Default: first LAN IPv4,
                      or --host when no LAN IPv4 is available.
  --server <url>      Agent Link Board URL for --checkBoard. Default: ${defaults.server}
  --timeoutMs <ms>    Discovery/board timeout. Default: ${defaults.timeoutMs}
  --checkBoard        Read /api/state.userPresence without posting anything.
  --json              Print one machine-readable JSON object.
  --boardSummary      Print one secret-free Agent Link Board summary line.
  --help, -h          Show this help without probing anything.

The resulting commands are copy-only rehearsal steps. Real input still requires
a human watching the Mac screen, --confirmUserWatching, and the first probe must
use --inputEventSet safe.`);
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
    if (token === "--json" || token === "--boardSummary" || token === "--checkBoard") {
      args[token.slice(2)] = true;
      continue;
    }
    if (token === "--host" && next && !next.startsWith("--")) {
      args.host = next;
      index += 1;
      continue;
    }
    if (token === "--probeHost" && next && !next.startsWith("--")) {
      args.probeHost = next;
      index += 1;
      continue;
    }
    if (token === "--port" && next && !next.startsWith("--")) {
      args.port = clampInteger(next, 1, 65535, defaults.port);
      index += 1;
      continue;
    }
    if (token === "--server" && next && !next.startsWith("--")) {
      args.server = next;
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 250, 60000, defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  args.host = normalizedText(args.host || defaults.host);
  args.probeHost = normalizedText(args.probeHost);
  args.server = normalizedText(args.server || defaults.server).replace(/\/+$/, "");
  return args;
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function shellQuote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function makeCommand(script, args) {
  return ["node", script, ...args].map(shellQuote).join(" ");
}

function requestJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = typeof url === "string" ? new URL(url) : url;
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.get(parsed, { timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1024 * 1024) {
          request.destroy(new Error("response too large"));
        }
      });
      response.on("end", () => {
        if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
          reject(new Error(`HTTP ${response.statusCode || 0}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`invalid JSON: ${error.message}`));
        }
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    request.on("error", reject);
  });
}

function boolPermission(value) {
  return value === true;
}

function inputModeFromDiscovery(payload) {
  return normalizedText(payload?.capabilities?.input?.mode || payload?.capabilities?.inputMode || payload?.inputMode || "unknown").toLowerCase();
}

function hostSummaryFromDiscovery(payload, args) {
  const permissions = payload?.permissions && typeof payload.permissions === "object" ? payload.permissions : {};
  return {
    online: true,
    host: args.host,
    port: args.port,
    platform: normalizedText(payload?.platform || "unknown").toLowerCase(),
    role: normalizedText(payload?.role || "unknown").toLowerCase(),
    deviceName: normalizedText(payload?.deviceName || payload?.name || "unknown"),
    inputMode: inputModeFromDiscovery(payload),
    permissions: {
      accessibility: boolPermission(permissions.accessibility),
      inputMonitoring: boolPermission(permissions.inputMonitoring ?? permissions.input),
      screenRecording: boolPermission(permissions.screenRecording ?? permissions.screen),
    },
    runtimeBuild: normalizedText(payload?.runtime?.buildId || payload?.buildId || "unknown"),
  };
}

function missingPermissionBlockers(permissions) {
  const blockers = [];
  if (!permissions?.accessibility) blockers.push("accessibility");
  if (!permissions?.inputMonitoring) blockers.push("input-monitoring");
  return blockers;
}

function firstLanIpv4() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry && entry.family === "IPv4" && !entry.internal && entry.address) {
        return entry.address;
      }
    }
  }
  return "";
}

function isLoopbackHost(host) {
  const value = normalizedText(host).toLowerCase();
  return value === "127.0.0.1" || value === "localhost" || value === "::1";
}

function windowsProbeHost(args) {
  if (args.probeHost) return args.probeHost;
  if (!isLoopbackHost(args.host)) return args.host;
  return firstLanIpv4() || args.host;
}

function boardStateUrl(server) {
  const url = new URL(server);
  url.pathname = "/api/state";
  url.search = "";
  url.hash = "";
  return url;
}

function normalizeUserPresence(state, error = "") {
  if (error) {
    return {
      checked: true,
      status: "unknown",
      source: "api-state-error",
      updatedAt: "",
      blocker: "USER_PRESENCE_UNKNOWN",
      error,
    };
  }
  const presence = state?.userPresence && typeof state.userPresence === "object" ? state.userPresence : null;
  const raw = normalizedText(presence?.status || presence?.state).toLowerCase();
  const status = {
    present: "present",
    awake: "present",
    away: "away",
    sleeping: "away",
  }[raw] || "unknown";
  return {
    checked: true,
    status,
    source: presence ? "api-state" : "api-state-missing",
    updatedAt: normalizedText(presence?.updatedAt || presence?.at),
    label: normalizedText(presence?.label),
    reason: normalizedText(presence?.reason),
    blocker: status === "away" ? "BLOCKED_BY_USER_AWAY" : status === "unknown" ? "USER_PRESENCE_UNKNOWN" : "",
  };
}

async function readUserPresence(args) {
  if (!args.checkBoard) {
    return {
      checked: false,
      status: "unknown",
      source: "not-checked",
      blocker: "USER_PRESENCE_UNKNOWN",
    };
  }
  try {
    const state = await requestJson(boardStateUrl(args.server), args.timeoutMs);
    return normalizeUserPresence(state);
  } catch (error) {
    return normalizeUserPresence(null, error.message);
  }
}

function assessHost(host, error = "") {
  if (!host?.online) {
    return {
      status: "blocked",
      reason: "host-offline",
      host: {
        online: false,
        host: host?.host || defaults.host,
        port: host?.port || defaults.port,
        error,
      },
      blockers: ["host-offline"],
      warnings: [],
    };
  }

  if (host.inputMode === "inject") {
    return {
      status: "blocked",
      reason: "inject-active",
      host,
      blockers: ["inject-active"],
      warnings: [],
    };
  }

  const permissionBlockers = missingPermissionBlockers(host.permissions);
  if (permissionBlockers.length > 0) {
    return {
      status: "blocked",
      reason: "permissions",
      host,
      blockers: permissionBlockers,
      warnings: host.inputMode === "log" ? [] : [`input-mode-${safeToken(host.inputMode)}`],
    };
  }

  if (host.inputMode !== "log") {
    return {
      status: "blocked",
      reason: "input-mode",
      host,
      blockers: [`input-mode-${safeToken(host.inputMode)}`],
      warnings: [],
    };
  }

  return {
    status: "host-ready",
    reason: "log-mode-permissions-ok",
    host,
    blockers: [],
    warnings: [],
  };
}

function makeRehearsalCommands(args, probeHost) {
  const port = String(args.port);
  return {
    macStopCurrent: makeCommand("scripts/mac/start-mac-host.mjs", [
      "--host",
      args.host,
      "--port",
      port,
      "--stop",
      "--json",
    ]),
    macStartInject: makeCommand("scripts/mac/start-mac-host.mjs", [
      "--promptPassword",
      "--requirePassword",
      "--host",
      "0.0.0.0",
      "--port",
      port,
      "--inputMode",
      "inject",
      "--confirmUserWatching",
      "--background",
    ]),
    windowsProbeSafe: makeCommand("scripts/windows/probe-mac-host.mjs", [
      "--host",
      probeHost,
      "--port",
      port,
      "--promptPassword",
      "--requirePassword",
      "--inputEvents",
      "--inputEventSet",
      "safe",
      "--expectInputMode",
      "inject",
      "--expectInputInjected",
      "true",
    ]),
    macReturnLog: makeCommand("scripts/mac/start-mac-host.mjs", [
      "--promptPassword",
      "--requirePassword",
      "--host",
      "0.0.0.0",
      "--port",
      port,
      "--inputMode",
      "log",
      "--background",
    ]),
    macInputSafetyStatus: makeCommand("scripts/mac/check-mac-input-safety-status.mjs", [
      "--host",
      args.host,
      "--port",
      port,
      "--checkBoard",
      "--server",
      args.server,
      "--boardSummary",
    ]),
  };
}

function makeUserNotice() {
  return {
    goal: "verify-real-mac-input-safe-event-set",
    userAction: "watch-mac-screen-and-be-ready-to-take-over",
    safetyBoundary: "safe-event-set-only-no-click-delete-shortcuts-return-log",
    estimatedDuration: "2-3-minutes",
  };
}

function applyPresenceGate(base, userPresence, args) {
  const probeHost = windowsProbeHost(args);
  const report = {
    planId: "mac-safe-inject-rehearsal",
    planOnly: true,
    status: base.status === "host-ready" ? "blocked" : base.status,
    reason: base.status === "host-ready" ? "user-presence-unknown" : base.reason,
    host: base.host,
    userPresence,
    probeHost,
    safeEventSet: "safe",
    requiresUserWatching: true,
    requiredFlag: "--confirmUserWatching",
    blockers: [...base.blockers],
    warnings: [...base.warnings],
    commands: {},
    steps: [],
    safety: {
      noPasswordPrinted: true,
      noAuthNow: true,
      noInputEventsNow: true,
      noInjectNow: true,
      noSystemSettingsChanged: true,
    },
  };

  if (base.status !== "host-ready") {
    report.nextAction = nextActionForBase(base);
    return report;
  }

  if (userPresence.status === "away") {
    report.status = "blocked";
    report.reason = "user-away";
    report.blockers.push("user-away");
    report.nextAction = "no-auth-only-BLOCKED_BY_USER_AWAY";
    return report;
  }

  if (userPresence.status !== "present") {
    report.status = "blocked";
    report.reason = "user-presence-unknown";
    report.blockers.push("user-presence-unknown");
    report.nextAction = "check-agent-link-user-presence-before-safe-inject-rehearsal";
    return report;
  }

  report.status = "call-ready";
  report.reason = base.reason;
  report.nextAction = "explain-boundary-then-coordinate-safe-inject-rehearsal";
  report.steps = [
    "explain-goal-safety-duration",
    "stop-current-log-host-if-needed",
    "start-inject-host-with-user-watching-confirmation",
    "windows-run-safe-input-event-set",
    "return-mac-host-to-log-mode",
  ];
  report.commands = makeRehearsalCommands(args, probeHost);
  report.userNotice = makeUserNotice();
  return report;
}

function nextActionForBase(base) {
  if (base.reason === "host-offline") return "start-mac-host-log-mode-before-safe-inject-rehearsal";
  if (base.reason === "inject-active") return "return-to-log-mode-before-planning-safe-inject-rehearsal";
  if (base.reason === "permissions") return "grant-accessibility-and-input-monitoring-before-safe-inject-rehearsal";
  return "restart-mac-host-log-mode-before-safe-inject-rehearsal";
}

function safeToken(value, fallback = "unknown") {
  const text = normalizedText(value);
  if (!text) return fallback;
  return text.replace(/[;\s]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
}

function summarizePermissions(permissions) {
  if (!permissions) return "unknown";
  const missing = missingPermissionBlockers(permissions);
  return missing.length === 0 ? "ok" : missing.join(",");
}

function summarizeList(items) {
  return Array.isArray(items) && items.length > 0 ? items.map((item) => safeToken(item)).join(",") : "none";
}

function appendUserNoticeParts(parts, notice) {
  if (!notice) return;
  parts.push(`UserNoticeGoal=${safeToken(notice.goal)}`);
  parts.push(`UserNoticeAction=${safeToken(notice.userAction)}`);
  parts.push(`UserNoticeBoundary=${safeToken(notice.safetyBoundary)}`);
  parts.push(`UserNoticeDuration=${safeToken(notice.estimatedDuration)}`);
}

function makeBoardSummary(report) {
  const parts = [
    `MacSafeInjectRehearsal=status=${safeToken(report.status)}`,
    `reason=${safeToken(report.reason)}`,
    `host=${report.host?.online ? "online" : "offline"}`,
    `target=${safeToken(report.probeHost)}:${report.host?.port || defaults.port}`,
    `inputMode=${safeToken(report.host?.inputMode)}`,
    `permissions=${summarizePermissions(report.host?.permissions)}`,
    `UserPresence=${safeToken(report.userPresence?.status)}`,
    `source=${safeToken(report.userPresence?.source)}`,
    `required=${report.requiredFlag}`,
    `eventSet=${report.safeEventSet}`,
    `blockers=${summarizeList(report.blockers)}`,
    `warnings=${summarizeList(report.warnings)}`,
  ];
  if (report.userPresence?.blocker) {
    parts.push(report.userPresence.blocker);
  }
  appendUserNoticeParts(parts, report.userNotice);
  if (report.status === "call-ready") {
    parts.push(
      `MacSafeInjectStopCurrent=${report.commands.macStopCurrent}.`,
      `MacSafeInjectStart=${report.commands.macStartInject}.`,
      `WindowsSafeInjectProbe=${report.commands.windowsProbeSafe}.`,
      `MacSafeInjectReturnLog=${report.commands.macReturnLog}.`,
    );
  }
  parts.push("Safety=plan-only,no-password,no-auth-now,no-input-now,no-inject-now,requires-user-watching.");
  return parts.join(" ");
}

function printPlain(report) {
  console.log("Mac safe inject rehearsal plan");
  console.log(`- status: ${report.status}`);
  console.log(`- reason: ${report.reason}`);
  console.log(`- host: ${report.host?.online ? "online" : "offline"} ${report.host?.host || defaults.host}:${report.host?.port || defaults.port}`);
  console.log(`- Windows probe target: ${report.probeHost}:${report.host?.port || defaults.port}`);
  console.log(`- user presence: ${report.userPresence?.status || "unknown"} source=${report.userPresence?.source || "unknown"}`);
  console.log(`- event set: ${report.safeEventSet}`);
  console.log(`- required: ${report.requiredFlag}`);
  if (report.status === "call-ready") {
    console.log("- plan-only commands:");
    console.log(`  stop current host: ${report.commands.macStopCurrent}`);
    console.log(`  start inject host: ${report.commands.macStartInject}`);
    console.log(`  Windows safe probe: ${report.commands.windowsProbeSafe}`);
    console.log(`  return to log mode: ${report.commands.macReturnLog}`);
  }
  console.log(makeBoardSummary(report));
}

async function buildReport(args) {
  const url = `http://${args.host}:${args.port}/discovery`;
  let base;
  try {
    const payload = await requestJson(url, args.timeoutMs);
    base = assessHost(hostSummaryFromDiscovery(payload, args));
  } catch (error) {
    base = assessHost({ online: false, host: args.host, port: args.port }, error.message);
  }
  const userPresence = await readUserPresence(args);
  const report = applyPresenceGate(base, userPresence, args);
  report.boardSummary = makeBoardSummary(report);
  return report;
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  const report = await buildReport(args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printPlain(report);
  }
  process.exitCode = report.status === "call-ready" ? 0 : 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
