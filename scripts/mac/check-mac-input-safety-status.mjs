#!/usr/bin/env node
import http from "node:http";
import https from "node:https";

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  server: "http://192.168.31.68:17888",
  timeoutMs: 2500,
  json: false,
  boardSummary: false,
  checkBoard: false,
  sendStatus: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/check-mac-input-safety-status.mjs [options]

Checks the read-only safety gate for real Mac input control. It does not start
Mac host, does not prompt for passwords, does not authenticate a WebSocket,
does not send input events, and does not enable inject mode.

Options:
  --host <host>      Mac host discovery host. Default: ${defaults.host}
  --port <port>      Mac host discovery port. Default: ${defaults.port}
  --server <url>     Agent Link Board URL for --checkBoard. Default: ${defaults.server}
  --timeoutMs <ms>   Discovery timeout. Default: ${defaults.timeoutMs}
  --checkBoard       Read /api/state.userPresence without posting anything.
  --sendStatus       Post the current secret-free summary to Agent Link Board.
  --json             Print one machine-readable JSON object.
  --boardSummary     Print one secret-free Agent Link Board summary line.
  --help, -h         Show this help without probing anything.

Real input stays blocked until a human explicitly confirms they are watching
the Mac screen. The start helper must use --confirmUserWatching before any
--inputMode inject startup, and the first validation event set must be safe.`);
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
    if (token === "--json" || token === "--boardSummary" || token === "--checkBoard" || token === "--sendStatus") {
      args[token.slice(2)] = true;
      continue;
    }
    if (token === "--server" && next && !next.startsWith("--")) {
      args.server = next;
      index += 1;
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
      args.timeoutMs = clampInteger(next, 250, 60000, defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  args.host = String(args.host || defaults.host).trim();
  args.server = String(args.server || defaults.server).trim().replace(/\/+$/, "");
  return args;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
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

function postJson(url, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = typeof url === "string" ? new URL(url) : url;
    const body = JSON.stringify(payload);
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.request(parsed, {
      method: "POST",
      timeout: timeoutMs,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        responseBody += chunk;
      });
      response.on("end", () => {
        if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
          reject(new Error(`HTTP ${response.statusCode || 0}`));
          return;
        }
        try {
          resolve(responseBody ? JSON.parse(responseBody) : { ok: true });
        } catch {
          resolve({ ok: true });
        }
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    request.on("error", reject);
    request.end(body);
  });
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function boardToken(value, fallback = "unknown") {
  const text = normalizedText(value || "");
  if (!text) return fallback;
  return text.replace(/[;\s.]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
}

function boolPermission(value) {
  return value === true;
}

function shellQuote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function makeCommand(script, args) {
  return ["node", script, ...args].map(shellQuote).join(" ");
}

function makeMacSafeInjectRehearsalCommand(args, host) {
  return makeCommand("scripts/mac/plan-mac-safe-inject-rehearsal.mjs", [
    "--host",
    host?.host || args.host || defaults.host,
    "--port",
    String(host?.port || args.port || defaults.port),
    "--checkBoard",
    "--server",
    args.server || defaults.server,
    "--boardSummary",
  ]);
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
      screenRecording: boolPermission(permissions.screenRecording ?? permissions.screen),
      accessibility: boolPermission(permissions.accessibility),
      inputMonitoring: boolPermission(permissions.inputMonitoring ?? permissions.input),
    },
    runtimeBuild: normalizedText(payload?.runtime?.buildId || payload?.buildId || "unknown"),
  };
}

function missingPermissionBlockers(permissions) {
  const blockers = [];
  if (!permissions.accessibility) blockers.push("accessibility");
  if (!permissions.inputMonitoring) blockers.push("input-monitoring");
  return blockers;
}

function assess(host, error = "") {
  const gates = {
    requiresUserWatching: true,
    requiredFlag: "--confirmUserWatching",
    firstEventSet: "safe",
    realInput: "blocked-until-user-watching",
  };
  const safety = {
    noPassword: true,
    noAuth: true,
    noInputEventsSent: true,
    noInjectExecuted: true,
    noSystemSettingsChanged: true,
  };
  const commands = {
    macInputSafetyPlan: "node scripts/mac/plan-mac-input-safety.mjs --boardSummary",
    macHostSafeLogStart: `node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port ${host?.port || defaults.port} --inputMode log`,
    macInputLogSmoke: `node scripts/mac/smoke-mac-input-log.mjs --host ${host?.host || defaults.host} --port ${host?.port || defaults.port} --promptPassword --boardSummary`,
  };

  if (!host?.online) {
    return {
      ok: false,
      status: "blocked",
      reason: "host-offline",
      readyForUserWatchedInject: false,
      host: {
        online: false,
        host: host?.host || defaults.host,
        port: host?.port || defaults.port,
        error,
      },
      gates,
      blockers: ["host-offline"],
      warnings: [],
      nextAction: "start-mac-host-log-mode",
      commands,
      safety,
    };
  }

  if (host.inputMode === "inject") {
    return {
      ok: false,
      status: "blocked",
      reason: "inject-active",
      readyForUserWatchedInject: false,
      host,
      gates,
      blockers: ["inject-active"],
      warnings: [],
      nextAction: "return-to-log-mode-or-refresh-user-watching-proof",
      commands,
      safety,
    };
  }

  const permissionBlockers = missingPermissionBlockers(host.permissions);
  if (permissionBlockers.length > 0) {
    return {
      ok: false,
      status: "blocked",
      reason: "permissions",
      readyForUserWatchedInject: false,
      host,
      gates,
      blockers: permissionBlockers,
      warnings: host.inputMode === "log" ? [] : [`input-mode-${boardToken(host.inputMode)}`],
      nextAction: "grant-accessibility-and-input-monitoring-before-user-watched-inject",
      commands,
      safety,
    };
  }

  if (host.inputMode !== "log") {
    return {
      ok: false,
      status: "blocked",
      reason: "input-mode",
      readyForUserWatchedInject: false,
      host,
      gates,
      blockers: [`input-mode-${boardToken(host.inputMode)}`],
      warnings: [],
      nextAction: "restart-mac-host-log-mode-before-planning-inject",
      commands,
      safety,
    };
  }

  return {
    ok: true,
    status: "ready",
    reason: "log-mode-permissions-ok",
    readyForUserWatchedInject: true,
    host,
    gates,
    blockers: [],
    warnings: [],
    nextAction: "ask-user-watching-before-inject-startup-and-safe-event-set",
    commands,
    safety,
  };
}

function summarizePermissions(permissions) {
  if (!permissions) return "unknown";
  const missing = missingPermissionBlockers(permissions);
  return missing.length === 0 ? "ok" : missing.join(",");
}

function summarizeIds(items) {
  return Array.isArray(items) && items.length > 0 ? items.join(",") : "none";
}

function boardStateUrl(server) {
  const url = new URL(server);
  url.pathname = "/api/state";
  url.search = "";
  url.hash = "";
  return url;
}

function boardStatusUrl(server) {
  const url = new URL(server);
  url.pathname = "/api/status";
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
  const status = normalizedText(presence?.status || presence?.state).toLowerCase();
  const mappedStatus = {
    present: "present",
    awake: "present",
    away: "away",
    sleeping: "away",
  }[status] || "unknown";
  return {
    checked: true,
    status: mappedStatus,
    source: presence ? "api-state" : "api-state-missing",
    updatedAt: normalizedText(presence?.updatedAt || presence?.at),
    label: normalizedText(presence?.label),
    reason: normalizedText(presence?.reason),
    blocker: mappedStatus === "away" ? "BLOCKED_BY_USER_AWAY" : mappedStatus === "unknown" ? "USER_PRESENCE_UNKNOWN" : "",
  };
}

async function readUserPresence(args) {
  if (!args.checkBoard) return null;
  try {
    const state = await requestJson(boardStateUrl(args.server), args.timeoutMs);
    return normalizeUserPresence(state);
  } catch (error) {
    return normalizeUserPresence(null, error.message);
  }
}

function makeMacInputSafetyAction(report) {
  const presence = report.userPresence;
  if (presence?.status === "away") {
    return {
      id: "no-auth-only",
      blocker: "BLOCKED_BY_USER_AWAY",
      description: "User is away; keep real input blocked and continue only no-auth work.",
    };
  }
  if (presence?.status === "unknown") {
    return {
      id: "check-user-presence",
      blocker: "USER_PRESENCE_UNKNOWN",
      description: "Confirm Agent Link Board userPresence before planning real input.",
    };
  }
  if (report.status === "ready" && presence?.status === "present") {
    return {
      id: "explain-before-inject",
      blocker: "",
      description: "Explain goal, safety boundary, and duration before asking the user to watch the Mac screen.",
    };
  }
  return {
    id: report.nextAction,
    blocker: "",
    description: report.nextAction,
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

function applyUserPresenceGate(report, userPresence, args = defaults) {
  report.commands.macSafeInjectRehearsal = makeMacSafeInjectRehearsalCommand(args, report.host);
  if (!userPresence?.checked) {
    report.macInputSafetyAction = makeMacInputSafetyAction(report);
    return report;
  }
  report.userPresence = userPresence;
  if (userPresence.status === "away" || userPresence.status === "unknown") {
    const blocker = userPresence.status === "away" ? "user-away" : "user-presence-unknown";
    if (!report.blockers.includes(blocker)) report.blockers.push(blocker);
    if (report.status === "ready") {
      report.ok = false;
      report.status = "blocked";
      report.reason = userPresence.status === "away" ? "user-away" : "user-presence-unknown";
      report.readyForUserWatchedInject = false;
      report.nextAction = userPresence.status === "away"
        ? "no-auth-only-BLOCKED_BY_USER_AWAY"
        : "check-agent-link-user-presence-before-inject";
    }
  }
  report.macInputSafetyAction = makeMacInputSafetyAction(report);
  if (report.macInputSafetyAction?.id === "explain-before-inject") {
    report.userNotice = makeUserNotice();
  }
  return report;
}

function appendUserNoticeParts(parts, notice) {
  if (!notice) return;
  parts.push(`UserNoticeGoal=${boardToken(notice.goal)}`);
  parts.push(`UserNoticeAction=${boardToken(notice.userAction)}`);
  parts.push(`UserNoticeBoundary=${boardToken(notice.safetyBoundary)}`);
  parts.push(`UserNoticeDuration=${boardToken(notice.estimatedDuration)}`);
}

function makeBoardSummary(report) {
  const parts = [
    `MacInputSafetyStatus=${report.status}`,
    `reason=${report.reason}`,
    `host=${report.host?.online ? "online" : "offline"}`,
    `inputMode=${report.host?.inputMode || "unknown"}`,
    `permissions=${summarizePermissions(report.host?.permissions)}`,
    `realInput=${report.gates.realInput}`,
    `required=${report.gates.requiredFlag}`,
    `eventSet=${report.gates.firstEventSet}`,
    `blockers=${summarizeIds(report.blockers)}`,
    `warnings=${summarizeIds(report.warnings)}`,
  ];
  if (report.userPresence?.checked) {
    parts.push(`UserPresence=${boardToken(report.userPresence.status)}`);
    parts.push(`source=${boardToken(report.userPresence.source)}`);
    if (report.userPresence.updatedAt) parts.push(`updatedAt=${boardToken(report.userPresence.updatedAt)}`);
    if (report.macInputSafetyAction?.id) {
      const action = report.macInputSafetyAction.blocker
        ? `${report.macInputSafetyAction.id} blocker=${report.macInputSafetyAction.blocker}`
        : report.macInputSafetyAction.id;
      parts.push(`MacInputSafetyAction=${action}`);
    }
  }
  appendUserNoticeParts(parts, report.userNotice);
  if (report.macInputSafetyAction?.id === "explain-before-inject" && report.commands?.macSafeInjectRehearsal) {
    parts.push(`MacSafeInjectRehearsal=${report.commands.macSafeInjectRehearsal}.`);
  }
  parts.push(
    ".",
    `MacInputSafetyPlan=${report.commands.macInputSafetyPlan}.`,
    `MacInputLogSmoke=${report.commands.macInputLogSmoke}.`,
    "Safety=no-password,no-auth,no-input-events,no-inject.",
  );
  return parts.join(" ");
}

function printPlain(report) {
  console.log("Mac input safety status");
  console.log(`- status: ${report.status}`);
  console.log(`- reason: ${report.reason}`);
  console.log(`- host: ${report.host?.online ? "online" : "offline"} ${report.host?.host || defaults.host}:${report.host?.port || defaults.port}`);
  console.log(`- input mode: ${report.host?.inputMode || "unknown"}`);
  console.log(`- permissions: ${summarizePermissions(report.host?.permissions)}`);
  console.log(`- ready for user-watched inject gate: ${report.readyForUserWatchedInject ? "yes" : "no"}`);
  console.log(`- required gate: ${report.gates.requiredFlag}, first event set: ${report.gates.firstEventSet}`);
  if (report.userPresence?.checked) {
    console.log(`- user presence: ${report.userPresence.status} source=${report.userPresence.source || "unknown"}`);
    console.log(`- input safety action: ${report.macInputSafetyAction?.id || "unknown"}`);
  }
  console.log(`- next action: ${report.nextAction}`);
  console.log(makeBoardSummary(report));
}

async function buildReport(args) {
  const url = `http://${args.host}:${args.port}/discovery`;
  let report;
  try {
    const payload = await requestJson(url, args.timeoutMs);
    report = assess(hostSummaryFromDiscovery(payload, args));
  } catch (error) {
    report = assess({ online: false, host: args.host, port: args.port }, error.message);
  }
  const userPresence = await readUserPresence(args);
  return applyUserPresenceGate(report, userPresence, args);
}

async function sendStatus(args, report) {
  try {
    await postJson(boardStatusUrl(args.server), {
      device: "Mac Input Safety",
      role: "Mac 端",
      status: report.status,
      note: report.boardSummary || makeBoardSummary(report),
    }, args.timeoutMs);
    report.postStatus = { ok: true };
  } catch (error) {
    report.postStatus = { ok: false, error: error.message };
  }
  return report.postStatus;
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
  report.boardSummary = makeBoardSummary(report);
  if (args.sendStatus) {
    await sendStatus(args, report);
  }
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printPlain(report);
  }
  process.exitCode = report.ok && (!args.sendStatus || report.postStatus?.ok) ? 0 : 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
