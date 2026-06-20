const defaults = {
  host: "127.0.0.1",
  port: 43770,
  action: "grant",
  durationMs: 30000,
  timeoutMs: 5000,
  server: "http://192.168.31.68:17888",
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/allow-windows-reverse-control.mjs [options]

Options:
  --host <host>          Local Windows host address. Default: ${defaults.host}
  --port <port>          Windows host port. Default: ${defaults.port}
  --status               Read current local reverse-control grant state
  --grant                Open a one-time temporary grant window. Default action
  --revoke               Revoke the temporary grant window
  --action <name>        One of: status, grant, revoke. Default: ${defaults.action}
  --durationMs <ms>      Grant duration, clamped by host to 5s-120s. Default: ${defaults.durationMs}
  --timeoutMs <ms>       HTTP timeout. Default: ${defaults.timeoutMs}
  --server <url>         Agent Link Board base URL for --checkBoard. Default: ${defaults.server}
  --checkBoard           Read /api/state.userPresence before opening a grant
  --json                 Print machine-readable JSON
  --boardSummary         Print one safe line for Agent Link Board
  --help, -h             Show this help without contacting a host

Description:
  Opens or inspects the Windows host local one-time reverse-control grant. The
  host management endpoint only accepts loopback requests, so this helper is a
  Windows-side convenience for letting a Mac client retry reverse_control_request
  without switching the host into long-lived accept-lab mode. With --checkBoard,
  it first reads Agent Link Board userPresence; userPresence=away blocks grant
  creation and exits non-zero. It does not use a password, send input, or
  execute inject.

Examples:
  node scripts/windows/allow-windows-reverse-control.mjs
  node scripts/windows/allow-windows-reverse-control.mjs --status
  node scripts/windows/allow-windows-reverse-control.mjs --checkBoard --boardSummary
  node scripts/windows/allow-windows-reverse-control.mjs --revoke --boardSummary
`);
}

function parseArgs(argv) {
  const args = { ...defaults, json: false, boardSummary: false, checkBoard: false, help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--boardSummary") {
      args.boardSummary = true;
      continue;
    }
    if (token === "--checkBoard") {
      args.checkBoard = true;
      continue;
    }
    if (token === "--status") {
      args.action = "status";
      continue;
    }
    if (token === "--grant") {
      args.action = "grant";
      continue;
    }
    if (token === "--revoke") {
      args.action = "revoke";
      continue;
    }
    if (token === "--action" && next && !next.startsWith("--")) {
      args.action = normalizeAction(next);
      index += 1;
      continue;
    }
    if (token === "--host" && next && !next.startsWith("--")) {
      args.host = next;
      index += 1;
      continue;
    }
    if (token === "--port" && next && !next.startsWith("--")) {
      args.port = parseInteger(next, defaults.port);
      index += 1;
      continue;
    }
    if (token === "--durationMs" && next && !next.startsWith("--")) {
      args.durationMs = parseInteger(next, defaults.durationMs);
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(1000, parseInteger(next, defaults.timeoutMs));
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
  args.action = normalizeAction(args.action);
  args.port = Math.max(1, Math.min(65535, Number(args.port) || defaults.port));
  args.durationMs = Math.max(1000, Number(args.durationMs) || defaults.durationMs);
  args.server = normalizeServer(args.server);
  args.userPresence = emptyUserPresence("not-checked", args.action);
  return args;
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAction(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["status", "grant", "revoke"].includes(normalized)) return normalized;
  throw new Error(`Unknown action: ${value}`);
}

function normalizeServer(value) {
  const text = String(value || defaults.server).trim();
  if (!text) return defaults.server;
  return text.replace(/\/+$/g, "");
}

function boardStateUrl(server) {
  const base = normalizeServer(server);
  return base.endsWith("/api/state") ? base : `${base}/api/state`;
}

function targetBase(args) {
  return `http://${args.host}:${args.port}`;
}

function endpointForAction(args) {
  if (args.action === "status") return `${targetBase(args)}/reverse-control/status`;
  if (args.action === "revoke") return `${targetBase(args)}/reverse-control/revoke`;
  return `${targetBase(args)}/reverse-control/grant`;
}

function actionVerb(action) {
  if (action === "status") return "status";
  if (action === "revoke") return "revoked";
  return "granted";
}

function supportedToken(policy = {}) {
  return policy.supported === false ? "off" : "on";
}

function modeToken(mode = "") {
  if (mode === "accept") return "accept-lab";
  if (mode === "disabled") return "disabled";
  return mode || "unknown";
}

function grantToken(grant = {}) {
  if (grant.active) return "temporary-grant";
  if (grant.lastRequest?.active) return "pending-request";
  return "inactive";
}

function formatSeconds(ms) {
  const seconds = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  return `${seconds}s`;
}

function compactText(value, maxLength = 80) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}...`;
}

function normalizedText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function emptyUserPresence(source = "none", action = "grant") {
  return {
    found: false,
    source,
    status: "unknown",
    label: "",
    updatedAt: "",
    updatedBy: "",
    action: userPresenceAction("unknown", action),
    blocker: "",
    summary: `status=unknown,source=${source},at=none`,
  };
}

const userPresenceSecretPattern = /(?:^|[\s,;])(?:password|secret|passwd|token|apikey|api-key|credential|cookie|pwd)\s*[:=]|--(?:password|token|secret|passwd|pwd)\b|密码\s*[:=]|密钥|口令|令牌/i;

function safeIsoTimestamp(value) {
  const text = normalizedText(value);
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
  if (["away", "sleeping", "sleep", "user-away", "user_sleeping", "用户不在", "不在", "休息"].includes(text)) return "away";
  return "unknown";
}

function userPresenceAction(status, action = "grant") {
  if (status === "present") return action === "grant" ? "explain-before-grant" : "explain-before-auth";
  if (status === "away") return "no-auth-only";
  return "unknown";
}

function normalizeBoardUserPresence(state, source = "api-state", action = "grant") {
  const presence = state?.userPresence;
  if (!presence || typeof presence !== "object") return emptyUserPresence(source, action);
  const status = normalizeUserPresenceStatus(presence.status || presence.state);
  const updatedAt = safeIsoTimestamp(presence.updatedAt) ? presence.updatedAt : "";
  const result = {
    found: true,
    source,
    status,
    label: safeUserPresenceText(presence.label, 80),
    updatedAt,
    updatedBy: safeUserPresenceText(presence.updatedBy, 80),
    action: userPresenceAction(status, action),
    blocker: status === "away" ? "BLOCKED_BY_USER_AWAY" : "",
  };
  result.summary = [
    `status=${result.status}`,
    `source=${result.source}`,
    result.updatedAt ? `at=${result.updatedAt}` : "at=none",
    result.label ? `label=${result.label}` : "",
    result.updatedBy ? `by=${result.updatedBy}` : "",
  ].filter(Boolean).join(",");
  return result;
}

function appendUserPresenceParts(parts, userPresence) {
  if (!userPresence?.found) return;
  parts.push(`UserPresence=${userPresence.status} source=${userPresence.source}${userPresence.updatedAt ? ` updatedAt=${userPresence.updatedAt}` : ""}`);
  parts.push(`UserPresenceAction=${userPresence.action}${userPresence.blocker ? ` blocker=${userPresence.blocker}` : ""}`);
}

function makeBoardSummary(result) {
  const target = `${result.target.host}:${result.target.port}`;
  if (!result.ok) {
    const parts = [
      "Windows reverse grant:",
      `failed action=${result.action}`,
      `target=${target}`,
      `reason=${compactText(result.error?.code || result.error?.message || "unknown", 48)}`,
    ];
    appendUserPresenceParts(parts, result.userPresence);
    parts.push("no-password", "no-input", "no-inject");
    return parts.join(" ");
  }

  const grant = result.reverseControlGrant || {};
  const lastRequest = grant.lastRequest || {};
  const parts = [
    "Windows reverse grant:",
    actionVerb(result.action),
    `mode=${modeToken(result.reverseControlMode)}`,
    `supported=${supportedToken(result.reverseControlPolicy)}`,
    `grant=${grantToken(grant)}`,
  ];
  if (grant.active) {
    parts.push(`remaining=${formatSeconds(grant.remainingMs)}`);
    parts.push(grant.oneTime ? "oneTime=on" : "oneTime=off");
  }
  if (lastRequest.active) {
    parts.push(`lastRequest=${compactText(lastRequest.status || "active", 32)}`);
    if (lastRequest.ageMs !== undefined) {
      parts.push(`age=${formatSeconds(lastRequest.ageMs)}`);
    }
  } else {
    parts.push("lastRequest=none");
  }
  appendUserPresenceParts(parts, result.userPresence);
  parts.push(`target=${target}`, "no-password", "no-input", "no-inject");
  return parts.join(" ");
}

function makeResult(args, payload, statusCode) {
  const result = {
    ok: Boolean(payload?.ok),
    action: args.action,
    target: {
      host: args.host,
      port: args.port,
      endpoint: endpointForAction(args),
    },
    statusCode,
    userPresence: args.userPresence || emptyUserPresence("not-checked", args.action),
    reverseControlMode: payload?.reverseControlMode ?? "",
    reverseControlPolicy: payload?.reverseControlPolicy ?? {},
    reverseControlGrant: payload?.reverseControlGrant ?? {},
  };
  result.boardSummary = makeBoardSummary(result);
  return result;
}

function makeErrorResult(args, error, statusCode = 0) {
  const result = {
    ok: false,
    action: args.action,
    target: {
      host: args.host,
      port: args.port,
      endpoint: endpointForAction(args),
    },
    statusCode,
    userPresence: args.userPresence || emptyUserPresence("not-checked", args.action),
    error: {
      code: error.code || "",
      message: error.message || String(error),
    },
  };
  result.boardSummary = makeBoardSummary(result);
  return result;
}

function makeBlockedUserPresenceResult(args) {
  const error = Object.assign(new Error("BLOCKED_BY_USER_AWAY"), { code: "BLOCKED_BY_USER_AWAY" });
  return makeErrorResult(args, error, 0);
}

async function requestBoardState(args) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await fetch(boardStateUrl(args.server), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw Object.assign(new Error(`Agent Link Board returned non-JSON response: ${compactText(text, 120)}`), {
        code: "BOARD_JSON",
        statusCode: response.status,
      });
    }
    if (!response.ok) {
      throw Object.assign(new Error(`Agent Link Board HTTP ${response.status}`), {
        code: `BOARD_HTTP_${response.status}`,
        statusCode: response.status,
      });
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function applyBoardGate(args) {
  if (!args.checkBoard) return null;
  const state = await requestBoardState(args);
  args.userPresence = normalizeBoardUserPresence(state, "api-state", args.action);
  if (args.action === "grant" && args.userPresence.status === "away") {
    return makeBlockedUserPresenceResult(args);
  }
  return null;
}

async function requestJson(args) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await fetch(endpointForAction(args), {
      method: args.action === "status" ? "GET" : "POST",
      headers: args.action === "status" ? undefined : { "Content-Type": "application/json" },
      body: args.action === "grant" ? JSON.stringify({ durationMs: args.durationMs }) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (error) {
      throw Object.assign(new Error(`Host returned non-JSON response: ${compactText(text, 120)}`), {
        code: "LANJSON",
        statusCode: response.status,
      });
    }
    if (!response.ok || payload.ok === false) {
      const message = payload.message || payload.reason || `HTTP ${response.status}`;
      throw Object.assign(new Error(message), {
        code: payload.code || `HTTP${response.status}`,
        statusCode: response.status,
      });
    }
    return makeResult(args, payload, response.status);
  } finally {
    clearTimeout(timer);
  }
}

function printHuman(result) {
  const target = `${result.target.host}:${result.target.port}`;
  if (!result.ok) {
    console.error(`[FAIL] Windows host reverse-control helper failed for ${target}: ${result.error?.message || "unknown error"}`);
    if (result.userPresence?.blocker) {
      console.error(`[INFO] UserPresence=${result.userPresence.summary}; action=${result.userPresence.action}; blocker=${result.userPresence.blocker}`);
    }
    console.error("[INFO] Start Windows host first, then retry from the Windows machine. This helper does not use a password or send input.");
    return;
  }

  const grant = result.reverseControlGrant || {};
  const lastRequest = grant.lastRequest || {};
  const grantState = grant.active
    ? `temporary grant active for ${formatSeconds(grant.remainingMs)}`
    : "no temporary grant";
  console.log(`[OK] Reverse-control ${result.action} completed on ${target}`);
  console.log(`[INFO] Mode: ${result.reverseControlMode || "unknown"}; supported=${supportedToken(result.reverseControlPolicy)}; ${grantState}`);
  if (result.userPresence?.found) {
    console.log(`[INFO] UserPresence=${result.userPresence.summary}; action=${result.userPresence.action}`);
  }
  if (lastRequest.active) {
    console.log(`[INFO] Recent request: ${compactText(lastRequest.requester || "peer", 32)} / ${compactText(lastRequest.status || "active", 48)} / age ${formatSeconds(lastRequest.ageMs)}`);
  }
  if (grant.active) {
    console.log("[INFO] Ask the Mac client to request or retry reverse control before the timer expires. The grant is one-time.");
  }
  console.log(`[INFO] ${result.boardSummary}`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  let result = null;
  try {
    result = await applyBoardGate(args);
    if (!result) {
      result = await requestJson(args);
    }
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    const statusCode = error.statusCode || (error.name === "AbortError" ? 408 : 0);
    result = makeErrorResult(args, error.name === "AbortError"
      ? Object.assign(new Error(`Timed out after ${args.timeoutMs}ms`), { code: "TIMEOUT" })
      : error, statusCode);
    process.exitCode = 1;
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (args.boardSummary) {
    console.log(result.boardSummary);
    return;
  }
  printHuman(result);
}

main().catch((error) => {
  console.error(`[FAIL] ${error.stack || error.message}`);
  process.exitCode = 1;
});