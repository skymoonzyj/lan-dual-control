const defaults = {
  host: "127.0.0.1",
  port: 43770,
  action: "grant",
  durationMs: 30000,
  timeoutMs: 5000,
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
  --json                 Print machine-readable JSON
  --boardSummary         Print one safe line for Agent Link Board
  --help, -h             Show this help without contacting a host

Description:
  Opens or inspects the Windows host local one-time reverse-control grant. The
  host management endpoint only accepts loopback requests, so this helper is a
  Windows-side convenience for letting a Mac client retry reverse_control_request
  without switching the host into long-lived accept-lab mode. It does not use a
  password, send input, or execute inject.

Examples:
  node scripts/windows/allow-windows-reverse-control.mjs
  node scripts/windows/allow-windows-reverse-control.mjs --status
  node scripts/windows/allow-windows-reverse-control.mjs --revoke --boardSummary
`);
}

function parseArgs(argv) {
  const args = { ...defaults, json: false, boardSummary: false, help: false };
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
    throw new Error(`Unknown argument: ${token}`);
  }
  args.action = normalizeAction(args.action);
  args.port = Math.max(1, Math.min(65535, Number(args.port) || defaults.port));
  args.durationMs = Math.max(1000, Number(args.durationMs) || defaults.durationMs);
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

function makeBoardSummary(result) {
  const target = `${result.target.host}:${result.target.port}`;
  if (!result.ok) {
    return [
      "Windows reverse grant:",
      `failed action=${result.action}`,
      `target=${target}`,
      `reason=${compactText(result.error?.message || result.error?.code || "unknown", 48)}`,
      "no-password",
      "no-input",
      "no-inject",
    ].join(" ");
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
    error: {
      code: error.code || "",
      message: error.message || String(error),
    },
  };
  result.boardSummary = makeBoardSummary(result);
  return result;
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
    result = await requestJson(args);
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
