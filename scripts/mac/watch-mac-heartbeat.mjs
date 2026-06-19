#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const heartbeatScript = process.env.LAN_DUAL_MAC_HEARTBEAT_SCRIPT || "scripts/mac/check-mac-heartbeat.mjs";
const unattendedStatusScript = process.env.LAN_DUAL_MAC_UNATTENDED_STATUS_SCRIPT || "scripts/mac/check-mac-unattended-status.mjs";
const codexLinkClient = process.env.LAN_DUAL_CODEX_LINK_CLIENT || "scripts/codex-link-client.mjs";

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  clientHost: "127.0.0.1",
  clientPort: 5188,
  timeoutMs: 2500,
  server: "http://192.168.31.68:17888",
  intervalMs: 30000,
  maxRuns: 0,
  stateFile: ".dev-lab/mac-heartbeat/state.json",
  codexTextFile: "",
  stuckThresholdMs: 60000,
  staleThresholdMs: 300000,
  refreshUnattended: false,
  sendStatus: false,
  once: false,
  device: "Mac Heartbeat",
  role: "Mac watchdog",
  json: false,
  boardSummary: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/watch-mac-heartbeat.mjs [options]

Runs the Mac heartbeat check once or in a loop. It is read-only: it does not
start Mac host, does not start Mac client, does not authenticate, does not
request or print a password, and does not send input events or inject.

Options:
  --once                    Run one heartbeat check and exit.
  --intervalMs <ms>         Delay between checks. Default: ${defaults.intervalMs}
  --maxRuns <n>             Stop after n checks. Default: 0 means forever.
  --sendStatus              Send each heartbeat summary to Agent Link Board
                            as device "Mac Heartbeat" by default.
  --refreshUnattended       Before each heartbeat, refresh the independent
                            "Mac Unattended" status with a read-only check.
                            Default: off.
  --device <name>           Agent Link Board status device. Default: ${defaults.device}
  --role <role>             Agent Link Board status role. Default: ${defaults.role}
  --host <host>             Mac host discovery host. Default: ${defaults.host}
  --port <port>             Mac host discovery port. Default: ${defaults.port}
  --clientHost <host>       Local Mac client host. Default: ${defaults.clientHost}
  --clientPort <port>       Local Mac client port. Default: ${defaults.clientPort}
  --timeoutMs <ms>          Child heartbeat timeout. Default: ${defaults.timeoutMs}
  --server <url>            Agent Link Board URL. Default: ${defaults.server}
  --stateFile <path>        Persistent reconnect evidence state. Default:
                            ${defaults.stateFile}
  --codexTextFile <path>    Optional Codex UI/OCR/log text evidence file.
  --stuckThresholdMs <ms>   Reconnect evidence duration before blocker.
                            Default: ${defaults.stuckThresholdMs}
  --staleThresholdMs <ms>   Active Mac Codex status age before stale blocker.
                            Default: ${defaults.staleThresholdMs}
  --boardSummary            Print only the last/current summary line.
  --json                    Print one machine-readable watcher summary.
  --help, -h                Show this help without probing anything.

Examples:
  node scripts/mac/watch-mac-heartbeat.mjs --once --sendStatus --boardSummary
  node scripts/mac/watch-mac-heartbeat.mjs --sendStatus --intervalMs 30000 --codexTextFile .dev-lab/mac-codex-ocr.txt
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
    if (token === "--once" || token === "--sendStatus" || token === "--refreshUnattended" || token === "--json" || token === "--boardSummary") {
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
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 500, 60000, defaults.timeoutMs);
      index += 1;
      continue;
    }
    if (token === "--server" && next && !next.startsWith("--")) {
      args.server = next;
      index += 1;
      continue;
    }
    if (token === "--intervalMs" && next && !next.startsWith("--")) {
      args.intervalMs = clampInteger(next, 1000, 3600000, defaults.intervalMs);
      index += 1;
      continue;
    }
    if (token === "--maxRuns" && next && !next.startsWith("--")) {
      args.maxRuns = clampInteger(next, 0, 1000000, defaults.maxRuns);
      index += 1;
      continue;
    }
    if (token === "--stateFile" && next && !next.startsWith("--")) {
      args.stateFile = next;
      index += 1;
      continue;
    }
    if (token === "--codexTextFile" && next && !next.startsWith("--")) {
      args.codexTextFile = next;
      index += 1;
      continue;
    }
    if (token === "--stuckThresholdMs" && next && !next.startsWith("--")) {
      args.stuckThresholdMs = clampInteger(next, 1000, 3600000, defaults.stuckThresholdMs);
      index += 1;
      continue;
    }
    if (token === "--staleThresholdMs" && next && !next.startsWith("--")) {
      args.staleThresholdMs = clampInteger(next, 1000, 86400000, defaults.staleThresholdMs);
      index += 1;
      continue;
    }
    if (token === "--device" && next && !next.startsWith("--")) {
      args.device = next;
      index += 1;
      continue;
    }
    if (token === "--role" && next && !next.startsWith("--")) {
      args.role = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  args.host = String(args.host || defaults.host).trim();
  args.clientHost = String(args.clientHost || defaults.clientHost).trim();
  args.server = String(args.server || defaults.server).trim().replace(/\/+$/, "");
  if (args.once && args.maxRuns === 0) args.maxRuns = 1;
  return args;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function heartbeatArgs(args) {
  const result = [
    "--json",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--clientHost",
    args.clientHost,
    "--clientPort",
    String(args.clientPort),
    "--timeoutMs",
    String(args.timeoutMs),
    "--server",
    args.server,
    "--checkBoard",
    "--stateFile",
    args.stateFile,
    "--stuckThresholdMs",
    String(args.stuckThresholdMs),
    "--staleThresholdMs",
    String(args.staleThresholdMs),
  ];
  if (args.codexTextFile) {
    result.push("--codexTextFile", args.codexTextFile);
  }
  return result;
}

function runHeartbeat(args) {
  const result = spawnSync(process.execPath, [heartbeatScript, ...heartbeatArgs(args)], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(args.timeoutMs + 3000, 5000),
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
  });
  let report = null;
  let parseError = "";
  try {
    report = JSON.parse(String(result.stdout || "").trim());
  } catch (error) {
    parseError = error.message;
  }
  return {
    ok: Boolean(report) && result.status === 0,
    status: result.status,
    signal: result.signal,
    error: result.error ? result.error.message : "",
    stderr: String(result.stderr || ""),
    report,
    parseError,
  };
}

function unattendedRefreshArgs(args) {
  return [
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--server",
    args.server,
    "--sendStatus",
    "--boardSummary",
  ];
}

function refreshUnattended(args) {
  if (!args.refreshUnattended) {
    return {
      requested: false,
      ok: null,
      status: null,
      signal: null,
      summary: "not-requested",
      error: "",
    };
  }
  const result = spawnSync(process.execPath, [unattendedStatusScript, ...unattendedRefreshArgs(args)], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(args.timeoutMs + 3000, 5000),
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
  });
  const output = safeSnippet(String(result.stdout || "").trim() || String(result.stderr || "").trim() || result.error?.message || "");
  return {
    requested: true,
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    summary: output || `unattended status exit ${result.status ?? "unknown"}`,
    error: safeSnippet(result.error?.message || String(result.stderr || "")),
  };
}

function statusForReport(report, unattendedRefresh) {
  if (unattendedRefresh?.requested && unattendedRefresh.ok === false) return "warning";
  if (!report) return "blocked";
  if (report.status === "blocked") return "blocked";
  if (report.status === "warning") return "warning";
  return "online";
}

function noteForReport(run, unattendedRefresh) {
  if (unattendedRefresh?.requested && unattendedRefresh.ok === false) {
    const heartbeatStatus = run.report?.status || "unknown";
    const reason = unattendedRefresh.error || unattendedRefresh.summary || "refresh-failed";
    return `MacHeartbeat=status=warning; reason=mac-unattended-refresh-failed; heartbeat=${heartbeatStatus}; unattendedRefresh=${safeSnippet(reason)}. ${run.report?.boardSummary || "Heartbeat still ran after refresh failure."} No password was requested or sent; no WebSocket auth/input/inject was attempted.`;
  }
  if (run.report?.boardSummary) return run.report.boardSummary;
  const reason = run.parseError || run.error || run.stderr || `heartbeat exit ${run.status ?? "unknown"}`;
  return `MacHeartbeat=status=blocked; device=Mac; reason=heartbeat-run-failed; error=${safeSnippet(reason)}. No password was requested or sent; no WebSocket auth/input/inject was attempted.`;
}

function safeSnippet(text) {
  return String(text || "")
    .replace(/(password|token|secret|key)\s*[:=]\s*["']?[^"'\s]+/gi, "$1=<redacted>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function postStatus(args, run, unattendedRefresh) {
  const status = statusForReport(run.report, unattendedRefresh);
  const note = noteForReport(run, unattendedRefresh);
  const result = spawnSync(process.execPath, [
    codexLinkClient,
    "--server",
    args.server,
    "status",
    "--device",
    args.device,
    "--role",
    args.role,
    "--status",
    status,
    "--note",
    note,
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(args.timeoutMs + 3000, 5000),
    maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    error: result.error ? result.error.message : "",
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unattendedRefreshLabel(unattendedRefresh) {
  if (!unattendedRefresh?.requested) return "not-requested";
  return unattendedRefresh.ok ? "refreshed" : "refresh-failed";
}

function makeSummary(iteration, run, post, unattendedRefresh) {
  const reportStatus = run.report?.status || "blocked";
  const reason = run.report?.codex?.reason || (run.parseError ? "heartbeat-parse-failed" : "heartbeat-run-failed");
  const posted = post ? (post.ok ? "posted" : "post-failed") : "not-posted";
  return `Mac heartbeat watch: run=${iteration} status=${reportStatus} reason=${reason} post=${posted} unattended=${unattendedRefreshLabel(unattendedRefresh)}`;
}

async function watch(args) {
  const runs = [];
  let iteration = 0;
  while (true) {
    iteration += 1;
    const unattendedRefresh = refreshUnattended(args);
    const run = runHeartbeat(args);
    const post = args.sendStatus ? postStatus(args, run, unattendedRefresh) : null;
    const summary = makeSummary(iteration, run, post, unattendedRefresh);
    const item = {
      iteration,
      unattendedRefresh,
      heartbeatStatus: run.status,
      heartbeatOk: run.ok,
      reportStatus: run.report?.status || "blocked",
      reason: run.report?.codex?.reason || "",
      boardSummary: noteForReport(run, unattendedRefresh),
      posted: post ? post.ok : false,
      postStatus: post?.status ?? null,
      postError: post ? safeSnippet(post.error || post.stderr) : "",
      summary,
    };
    runs.push(item);
    if (!args.json && !args.boardSummary) {
      console.log(summary);
      if (run.report?.boardSummary) console.log(run.report.boardSummary);
      if (unattendedRefresh.requested && !unattendedRefresh.ok) {
        console.error(`[WARN] Mac Unattended refresh failed: ${safeSnippet(unattendedRefresh.error || unattendedRefresh.summary)}`);
      }
      if (post && !post.ok) console.error(`[WARN] Agent Link Board status post failed: ${item.postError}`);
    }
    if (args.maxRuns > 0 && iteration >= args.maxRuns) break;
    await sleep(args.intervalMs);
  }
  const last = runs[runs.length - 1] || null;
  const unattendedOk = !args.refreshUnattended || last?.unattendedRefresh?.ok === true;
  const ok = Boolean(last) && unattendedOk && last.reportStatus !== "blocked" && (!args.sendStatus || last.posted);
  return { ok, runs, last };
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
  const result = await watch(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (args.boardSummary) {
    console.log(result.last?.boardSummary || "MacHeartbeat=status=blocked; reason=no-run.");
  }
  process.exitCode = result.ok ? 0 : 1;
}

main().catch((error) => {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok: false, error: { message: error.message } }, null, 2));
  } else {
    console.error(`[FAIL] ${error.message}`);
  }
  process.exitCode = 1;
});
