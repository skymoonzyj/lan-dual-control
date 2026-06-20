#!/usr/bin/env node

const defaults = {
  server: process.env.CODEX_LINK_SERVER || "http://127.0.0.1:17888",
  token: process.env.CODEX_LINK_TOKEN || "",
  intervalMs: 1000,
};

const args = parseArgs(process.argv.slice(2));
const command = args._[0] || "help";

try {
  if (command === "help" || args.help) {
    printHelp();
  } else if (command === "watch") {
    await watch(args);
  } else if (command === "state") {
    printState(await get(args, "/api/state"), args);
  } else if (command === "status") {
    await post(args, "/api/status", {
      device: args.device || args.from || "Codex",
      role: args.role || "",
      status: args.status || "online",
      note: args.note || args._.slice(1).join(" "),
    });
  } else if (command === "presence") {
    await post(args, "/api/presence", {
      status: args.status || args.presence || args.state || args._[1] || "present",
      label: args.label || "",
      instruction: args.instruction || "",
      reason: args.reason || args.note || args._.slice(2).join(" "),
      updatedBy: args.updatedBy || args.by || args.from || args.device || "Codex",
    });
  } else if (command === "send") {
    await post(args, "/api/message", {
      from: args.from || args.device || "Codex",
      text: args.text || args._.slice(1).join(" "),
      type: args.type || "message",
    });
  } else if (command === "call") {
    await post(args, "/api/call", {
      status: args.status || "CALLING",
      from: args.from || args.device || "Codex",
      need: args.need || "",
      goal: args.goal || args._.slice(1).join(" "),
      environment: args.environment || "",
      connection: args.connection || "",
      command: args.command || "",
      expected: args.expected || "",
      actual: args.actual || "",
      blockedBy: args.blockedBy || "",
      ask: args.ask || "",
      timeout: args.timeout || "",
      owner: args.owner || args.need || "",
    });
  } else if (command === "clear-call") {
    await post(args, "/api/clear-call", {});
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(`Codex Link client error: ${error.message}`);
  process.exitCode = 1;
}

async function watch(options) {
  const seen = new Set();
  let lastCallSignature = "";
  const once = Boolean(options.once);

  while (true) {
    const state = await get(options, "/api/state");
    const callSignature = JSON.stringify(state.currentCall || null);
    if (callSignature !== lastCallSignature) {
      lastCallSignature = callSignature;
      console.log(state.currentCall ? formatCall(state.currentCall) : "[call] none");
    }

    for (const event of state.events || []) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      console.log(formatEvent(event));
    }

    if (once) break;
    await sleep(options.intervalMs);
  }
}

async function post(options, path, body) {
  const result = await request(options, "POST", path, body);
  if (result?.ok === false) throw new Error(result.error || "request failed");
  console.log("ok");
  return result;
}

async function get(options, path) {
  return request(options, "GET", path);
}

async function request(options, method, path, body) {
  const url = new URL(path, options.server);
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { "X-Codex-Link-Token": options.token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status}: ${text}`);
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return text;
  }
}

function printState(state, options = {}) {
  if (options.json) {
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  console.log(`updatedAt: ${state.updatedAt || ""}`);
  console.log("");
  console.log("currentCall:");
  console.log(state.currentCall ? formatCall(state.currentCall) : "  none");
  console.log("");
  console.log("statuses:");
  for (const [device, item] of Object.entries(state.statuses || {})) {
    console.log(`  ${device}: ${item.status || ""}${item.note ? ` - ${item.note}` : ""}`);
  }
  console.log("");
  console.log("recentEvents:");
  for (const event of (state.events || []).slice(-10)) {
    console.log(`  ${formatEvent(event)}`);
  }
}

function formatCall(call) {
  return [
    `[call] ${call.status || ""}: ${call.goal || ""}`,
    `  from: ${call.from || ""}`,
    `  need: ${call.need || ""}`,
    call.environment ? `  environment: ${call.environment}` : "",
    call.connection ? `  connection: ${call.connection}` : "",
    call.command ? `  command: ${call.command}` : "",
    call.expected ? `  expected: ${call.expected}` : "",
    call.actual ? `  actual: ${call.actual}` : "",
    call.ask ? `  ask: ${call.ask}` : "",
    call.blockedBy ? `  blockedBy: ${call.blockedBy}` : "",
  ].filter(Boolean).join("\n");
}

function formatEvent(event) {
  const time = event.at ? new Date(event.at).toLocaleTimeString() : "";
  return `[${time}] ${event.type || "message"} ${event.from || "unknown"}: ${event.text || ""}`;
}

function parseArgs(argv) {
  const parsed = { ...defaults, _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  parsed.server = String(parsed.server || defaults.server).replace(/\/+$/, "");
  parsed.token = String(parsed.token || defaults.token || "");
  parsed.intervalMs = Number(parsed.intervalMs || parsed.interval || defaults.intervalMs) || defaults.intervalMs;
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHelp() {
  console.log(`Usage:
  node scripts/codex-link-client.mjs --server http://host:17888 watch [--once]
  node scripts/codex-link-client.mjs --server http://host:17888 state [--json]
  node scripts/codex-link-client.mjs --server http://host:17888 status --device "Windows Codex" --role "Windows端" --status online --note "ready"
  node scripts/codex-link-client.mjs --server http://host:17888 presence --status present --updatedBy "Mac Codex" --reason "user returned"
  node scripts/codex-link-client.mjs --server http://host:17888 send --from "Windows Codex" --text "message"
  node scripts/codex-link-client.mjs --server http://host:17888 call --from "Windows Codex" --need "Mac Codex" --goal "test" --ask "please verify"
  node scripts/codex-link-client.mjs --server http://host:17888 clear-call`);
}
