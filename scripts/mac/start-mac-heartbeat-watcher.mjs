#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const watcherScript = process.env.LAN_DUAL_MAC_HEARTBEAT_WATCHER_SCRIPT || "scripts/mac/watch-mac-heartbeat.mjs";

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  clientHost: "127.0.0.1",
  clientPort: 5188,
  timeoutMs: 2500,
  server: "http://192.168.31.68:17888",
  intervalMs: 30000,
  stateFile: ".dev-lab/mac-heartbeat/state.json",
  codexTextFile: "",
  pidFile: ".dev-lab/mac-heartbeat/watcher.pid",
  metaFile: ".dev-lab/mac-heartbeat/watcher.json",
  outLog: ".dev-lab/mac-heartbeat/watcher.out.log",
  errLog: ".dev-lab/mac-heartbeat/watcher.err.log",
  status: false,
  stop: false,
  restart: false,
  refreshUnattended: false,
  json: false,
  boardSummary: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/start-mac-heartbeat-watcher.mjs [options]

Starts, inspects, stops, or restarts the local Mac heartbeat watcher. The
background watcher posts to Agent Link Board as device "Mac Heartbeat" by
default, so it does not refresh or mask the main "Mac Codex" status.

It is safe for unattended coordination: it does not start Mac host, does not
start Mac client, does not authenticate a WebSocket, does not request or print
a password, and does not send input events or inject.

Options:
  --status                  Inspect the background watcher and exit.
  --stop                    Stop the background watcher if it is running.
  --restart                 Stop then start the background watcher.
  --refreshUnattended       Start watcher with a read-only Mac Unattended
                            status refresh before each heartbeat. Default: off.
  --host <host>             Mac host discovery host. Default: ${defaults.host}
  --port <port>             Mac host discovery port. Default: ${defaults.port}
  --clientHost <host>       Local Mac client host. Default: ${defaults.clientHost}
  --clientPort <port>       Local Mac client port. Default: ${defaults.clientPort}
  --timeoutMs <ms>          Child heartbeat timeout. Default: ${defaults.timeoutMs}
  --server <url>            Agent Link Board URL. Default: ${defaults.server}
  --intervalMs <ms>         Watcher interval. Default: ${defaults.intervalMs}
  --stateFile <path>        Reconnect evidence state file. Default:
                            ${defaults.stateFile}
  --codexTextFile <path>    Optional Codex UI/OCR/log text evidence file.
  --pidFile <path>          PID file. Default: ${defaults.pidFile}
  --metaFile <path>         Metadata file. Default: ${defaults.metaFile}
  --outLog <path>           Watcher stdout log. Default: ${defaults.outLog}
  --errLog <path>           Watcher stderr log. Default: ${defaults.errLog}
  --json                    Print one machine-readable result.
  --boardSummary            Print one secret-free Agent Link Board summary.
  --help, -h                Show this help without starting/stopping anything.

Examples:
  node scripts/mac/start-mac-heartbeat-watcher.mjs --boardSummary
  node scripts/mac/start-mac-heartbeat-watcher.mjs --status --json
  node scripts/mac/start-mac-heartbeat-watcher.mjs --stop --boardSummary
  node scripts/mac/start-mac-heartbeat-watcher.mjs --restart --refreshUnattended --boardSummary
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
    if (token === "--status" || token === "--stop" || token === "--restart" || token === "--refreshUnattended" || token === "--json" || token === "--boardSummary") {
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
    if (token === "--pidFile" && next && !next.startsWith("--")) {
      args.pidFile = next;
      index += 1;
      continue;
    }
    if (token === "--metaFile" && next && !next.startsWith("--")) {
      args.metaFile = next;
      index += 1;
      continue;
    }
    if (token === "--outLog" && next && !next.startsWith("--")) {
      args.outLog = next;
      index += 1;
      continue;
    }
    if (token === "--errLog" && next && !next.startsWith("--")) {
      args.errLog = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  args.host = String(args.host || defaults.host).trim();
  args.clientHost = String(args.clientHost || defaults.clientHost).trim();
  args.server = String(args.server || defaults.server).trim().replace(/\/+$/, "");
  args.pidFile = normalizeRepoPath(args.pidFile);
  args.metaFile = normalizeRepoPath(args.metaFile);
  args.outLog = normalizeRepoPath(args.outLog);
  args.errLog = normalizeRepoPath(args.errLog);
  args.stateFile = normalizeRepoPath(args.stateFile);
  if (args.codexTextFile) args.codexTextFile = normalizeRepoPath(args.codexTextFile);
  return args;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function normalizeRepoPath(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return resolve(repoRoot, text);
}

function toDisplayPath(value) {
  const text = String(value || "");
  if (!text.startsWith(repoRoot)) return text;
  return text.slice(repoRoot.length).replace(/^\/+/, "") || ".";
}

function safeReadJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function safeSnippet(text, maxLength = 260) {
  return String(text || "")
    .replace(/(password|token|secret|key)\s*[:=]\s*["']?[^"'\s]+/gi, "$1=<redacted>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function readTextTail(path, maxChars = 128 * 1024) {
  try {
    const text = readFileSync(path, "utf8");
    return text.length > maxChars ? text.slice(-maxChars) : text;
  } catch {
    return "";
  }
}

function lastMatchingLine(text, predicate) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (predicate(lines[index])) return lines[index];
  }
  return "";
}

function matchValue(text, pattern) {
  const match = String(text || "").match(pattern);
  return match ? match[1] : "";
}

function parseHeartbeatLine(line) {
  if (!line || !line.startsWith("MacHeartbeat=status=")) {
    return { found: false };
  }
  return {
    found: true,
    status: matchValue(line, /MacHeartbeat=status=([^;\s]+)/),
    checkedAt: matchValue(line, /checkedAt=([^;\s]+)/),
    reason: matchValue(line, /\breason=([^.\s;]+)/),
    blockers: matchValue(line, /\bblockers=([^;\s]+)/),
    warnings: matchValue(line, /\bwarnings=([^;\s]+)/),
    codexStatus: matchValue(line, /\bcodex=[^;]*\bstatus=([^;\s]+)/),
    codexUpdatedAt: matchValue(line, /\bcodex=[^;]*\bupdatedAt=([^;\s]+)/),
    codexAgeMs: matchValue(line, /\bcodex=[^;]*\bageMs=([^;\s]+)/),
    boardUpdatedAt: matchValue(line, /\bboard=[^;]*\bboardUpdatedAt=([^;\s]+)/),
    summary: safeSnippet(line),
  };
}

function parseWatcherRunLine(line) {
  if (!line || !line.startsWith("Mac heartbeat watch:")) {
    return { found: false };
  }
  return {
    found: true,
    run: matchValue(line, /\brun=([^;\s]+)/),
    status: matchValue(line, /\bstatus=([^;\s]+)/),
    reason: matchValue(line, /\breason=([^;\s]+)/),
    post: matchValue(line, /\bpost=([^;\s]+)/),
    summary: safeSnippet(line),
  };
}

function inspectRecentHeartbeat(args) {
  const text = readTextTail(args.outLog);
  const heartbeatLine = lastMatchingLine(text, (line) => line.startsWith("MacHeartbeat=status="));
  const watcherRunLine = lastMatchingLine(text, (line) => line.startsWith("Mac heartbeat watch:"));
  return {
    checked: Boolean(text),
    outLog: toDisplayPath(args.outLog),
    heartbeat: parseHeartbeatLine(heartbeatLine),
    watcherRun: parseWatcherRunLine(watcherRunLine),
  };
}

function readPid(path) {
  try {
    const raw = readFileSync(path, "utf8").trim();
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isPidRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function cleanupState(args) {
  for (const path of [args.pidFile, args.metaFile]) {
    rmSync(path, { force: true });
  }
}

function inspectWatcher(args) {
  const pid = readPid(args.pidFile);
  const running = isPidRunning(pid);
  const meta = existsSync(args.metaFile) ? safeReadJson(args.metaFile) : null;
  const stalePidFile = Boolean(pid) && !running;
  if (stalePidFile) cleanupState(args);
  return {
    running,
    pid: running ? pid : null,
    stalePidFile,
    meta,
    pidFile: toDisplayPath(args.pidFile),
    metaFile: toDisplayPath(args.metaFile),
    outLog: toDisplayPath(args.outLog),
    errLog: toDisplayPath(args.errLog),
    lastHeartbeat: inspectRecentHeartbeat(args),
  };
}

function watcherArgs(args) {
  const result = [
    "--sendStatus",
    "--intervalMs",
    String(args.intervalMs),
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
    "--stateFile",
    args.stateFile,
  ];
  if (args.codexTextFile) result.push("--codexTextFile", args.codexTextFile);
  if (args.refreshUnattended) result.push("--refreshUnattended");
  return result;
}

async function startWatcher(args) {
  const existing = inspectWatcher(args);
  if (existing.running) {
    return makeReport("start", args, {
      ok: true,
      started: false,
      reused: true,
      status: existing,
      message: "Mac heartbeat watcher is already running.",
    });
  }

  mkdirSync(dirname(args.pidFile), { recursive: true });
  mkdirSync(dirname(args.metaFile), { recursive: true });
  mkdirSync(dirname(args.outLog), { recursive: true });
  mkdirSync(dirname(args.errLog), { recursive: true });

  const outFd = openSync(args.outLog, "a");
  const errFd = openSync(args.errLog, "a");
  let child;
  try {
    child = spawn(process.execPath, [watcherScript, ...watcherArgs(args)], {
      cwd: repoRoot,
      detached: true,
      stdio: ["ignore", outFd, errFd],
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: "",
      },
    });
    child.unref();
  } finally {
    closeSync(outFd);
    closeSync(errFd);
  }

  const meta = {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    script: watcherScript,
    intervalMs: args.intervalMs,
    host: args.host,
    port: args.port,
    clientHost: args.clientHost,
    clientPort: args.clientPort,
    stateFile: toDisplayPath(args.stateFile),
    codexTextFile: args.codexTextFile ? toDisplayPath(args.codexTextFile) : "",
    refreshUnattended: args.refreshUnattended,
    device: "Mac Heartbeat",
    role: "Mac watchdog",
  };
  writeFileSync(args.pidFile, `${child.pid}\n`);
  writeFileSync(args.metaFile, `${JSON.stringify(meta, null, 2)}\n`);

  await sleep(250);
  const status = inspectWatcher(args);
  const ok = status.running;
  return makeReport("start", args, {
    ok,
    started: ok,
    reused: false,
    status,
    message: ok ? "Mac heartbeat watcher started." : "Mac heartbeat watcher exited before it became ready.",
  });
}

async function stopWatcher(args) {
  const before = inspectWatcher(args);
  if (!before.running) {
    cleanupState(args);
    return makeReport("stop", args, {
      ok: true,
      stopped: false,
      status: inspectWatcher(args),
      message: before.stalePidFile ? "Removed stale Mac heartbeat watcher PID file." : "Mac heartbeat watcher is not running.",
    });
  }
  if (before.pid === process.pid) {
    return makeReport("stop", args, {
      ok: false,
      stopped: false,
      status: before,
      message: "Refusing to stop the current helper process.",
    });
  }

  try {
    process.kill(before.pid, "SIGTERM");
  } catch (error) {
    cleanupState(args);
    return makeReport("stop", args, {
      ok: true,
      stopped: false,
      status: inspectWatcher(args),
      message: `Watcher was already gone: ${error.message}`,
    });
  }

  const stopped = await waitUntilStopped(before.pid, 3000);
  if (stopped) cleanupState(args);
  return makeReport("stop", args, {
    ok: stopped,
    stopped,
    status: inspectWatcher(args),
    message: stopped ? "Mac heartbeat watcher stopped." : "Mac heartbeat watcher did not stop within 3000ms.",
  });
}

async function restartWatcher(args) {
  const stopped = await stopWatcher(args);
  if (!stopped.ok) {
    return makeReport("restart", args, {
      ok: false,
      stopped: false,
      started: false,
      status: stopped.status,
      message: stopped.message,
    });
  }
  const started = await startWatcher(args);
  return {
    ...started,
    action: "restart",
    stopped: stopped.stopped,
    message: started.ok ? "Mac heartbeat watcher restarted." : started.message,
  };
}

function makeReport(action, args, details) {
  const status = details.status || inspectWatcher(args);
  const refreshUnattended = typeof status.meta?.refreshUnattended === "boolean"
    ? status.meta.refreshUnattended
    : args.refreshUnattended;
  const reportArgs = { ...args, refreshUnattended };
  return {
    ok: Boolean(details.ok),
    action,
    running: Boolean(status.running),
    pid: status.pid,
    started: Boolean(details.started),
    reused: Boolean(details.reused),
    stopped: Boolean(details.stopped),
    stalePidFile: Boolean(status.stalePidFile),
    message: details.message || "",
    watcher: {
      device: "Mac Heartbeat",
      role: "Mac watchdog",
      intervalMs: args.intervalMs,
      host: args.host,
      port: args.port,
      clientHost: args.clientHost,
      clientPort: args.clientPort,
      stateFile: toDisplayPath(args.stateFile),
      codexTextFile: args.codexTextFile ? toDisplayPath(args.codexTextFile) : "",
      refreshUnattended,
    },
    files: {
      pidFile: status.pidFile,
      metaFile: status.metaFile,
      outLog: status.outLog,
      errLog: status.errLog,
    },
    lastHeartbeat: status.lastHeartbeat,
    commands: makeCommands(reportArgs),
    safety: "No password was requested or sent; no WebSocket auth/input/inject was attempted.",
  };
}

function makeCommands(args) {
  const refreshStart = args.refreshUnattended ? " --refreshUnattended" : "";
  const refreshOnce = args.refreshUnattended ? " --refreshUnattended" : "";
  return {
    start: `node scripts/mac/start-mac-heartbeat-watcher.mjs${refreshStart} --boardSummary`,
    status: "node scripts/mac/start-mac-heartbeat-watcher.mjs --status --boardSummary",
    stop: "node scripts/mac/start-mac-heartbeat-watcher.mjs --stop --boardSummary",
    restart: `node scripts/mac/start-mac-heartbeat-watcher.mjs --restart${refreshStart} --boardSummary`,
    once: `node scripts/mac/watch-mac-heartbeat.mjs --once --sendStatus${refreshOnce} --boardSummary`,
    startWithUnattendedRefresh: "node scripts/mac/start-mac-heartbeat-watcher.mjs --refreshUnattended --boardSummary",
    restartWithUnattendedRefresh: "node scripts/mac/start-mac-heartbeat-watcher.mjs --restart --refreshUnattended --boardSummary",
    onceWithUnattendedRefresh: "node scripts/mac/watch-mac-heartbeat.mjs --once --sendStatus --refreshUnattended --boardSummary",
  };
}

function makeBoardSummary(report) {
  const state = report.running ? `running pid=${report.pid}` : "not-running";
  const heartbeat = report.lastHeartbeat?.heartbeat?.found
    ? `lastHeartbeat=status=${report.lastHeartbeat.heartbeat.status || "unknown"} checkedAt=${report.lastHeartbeat.heartbeat.checkedAt || "unknown"} reason=${report.lastHeartbeat.heartbeat.reason || "unknown"} codexAgeMs=${report.lastHeartbeat.heartbeat.codexAgeMs || "unknown"}`
    : "lastHeartbeat=not-seen";
  const watcherRun = report.lastHeartbeat?.watcherRun?.found
    ? `lastRun=${report.lastHeartbeat.watcherRun.run || "unknown"} post=${report.lastHeartbeat.watcherRun.post || "unknown"}`
    : "lastRun=not-seen";
  return [
    `Mac heartbeat watcher: action=${report.action} ok=${report.ok ? "true" : "false"} ${state}; device=Mac Heartbeat; intervalMs=${report.watcher.intervalMs}; refreshUnattended=${report.watcher.refreshUnattended ? "true" : "false"}; ${heartbeat}; ${watcherRun}.`,
    `Status=${report.commands.status}.`,
    `Start=${report.commands.start}.`,
    `RefreshStart=${report.commands.startWithUnattendedRefresh}.`,
    `RefreshRestart=${report.commands.restartWithUnattendedRefresh}.`,
    `RefreshOnce=${report.commands.onceWithUnattendedRefresh}.`,
    `Stop=${report.commands.stop}.`,
    `Once=${report.commands.once}.`,
    report.safety,
  ].join(" ");
}

function printHuman(report) {
  console.log(`[${report.ok ? "OK" : "FAIL"}] ${report.message}`);
  console.log(`[INFO] Action: ${report.action}`);
  console.log(`[INFO] Running: ${report.running ? `yes pid=${report.pid}` : "no"}`);
  console.log(`[INFO] Device: ${report.watcher.device}; role=${report.watcher.role}; intervalMs=${report.watcher.intervalMs}`);
  console.log(`[INFO] Refresh Mac Unattended: ${report.watcher.refreshUnattended ? "yes" : "no"}`);
  console.log(`[INFO] PID file: ${report.files.pidFile}`);
  console.log(`[INFO] Output log: ${report.files.outLog}`);
  console.log(`[INFO] Error log: ${report.files.errLog}`);
  if (report.lastHeartbeat?.heartbeat?.found) {
    const last = report.lastHeartbeat.heartbeat;
    console.log(`[INFO] Last heartbeat: status=${last.status || "unknown"} checkedAt=${last.checkedAt || "unknown"} reason=${last.reason || "unknown"} codexAgeMs=${last.codexAgeMs || "unknown"}`);
  } else {
    console.log("[INFO] Last heartbeat: not seen in stdout log");
  }
  console.log(`[NEXT] Status: ${report.commands.status}`);
  console.log(`[NEXT] Start: ${report.commands.start}`);
  console.log(`[NEXT] Start with Mac Unattended refresh: ${report.commands.startWithUnattendedRefresh}`);
  console.log(`[NEXT] Restart with Mac Unattended refresh: ${report.commands.restartWithUnattendedRefresh}`);
  console.log(`[NEXT] Stop: ${report.commands.stop}`);
  console.log(`[NEXT] One-shot heartbeat: ${report.commands.once}`);
  console.log(`[NEXT] One-shot with Mac Unattended refresh: ${report.commands.onceWithUnattendedRefresh}`);
  console.log(`[INFO] ${report.safety}`);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitUntilStopped(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidRunning(pid)) return true;
    await sleep(100);
  }
  return !isPidRunning(pid);
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

  let report;
  if (args.restart) {
    report = await restartWatcher(args);
  } else if (args.stop) {
    report = await stopWatcher(args);
  } else if (args.status) {
    report = makeReport("status", args, {
      ok: true,
      status: inspectWatcher(args),
      message: inspectWatcher(args).running ? "Mac heartbeat watcher is running." : "Mac heartbeat watcher is not running.",
    });
  } else {
    report = await startWatcher(args);
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(makeBoardSummary(report));
  } else {
    printHuman(report);
  }
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      ok: false,
      action: "error",
      running: false,
      error: { message: error.message, name: error.name },
    }, null, 2));
  } else {
    console.error(`[FAIL] ${error.message}`);
  }
  process.exitCode = 1;
});
