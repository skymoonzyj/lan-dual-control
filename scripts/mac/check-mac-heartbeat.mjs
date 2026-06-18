#!/usr/bin/env node
import http from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const hostRuntimePaths = [
  "apps/mac-host/Package.swift",
  "apps/mac-host/Sources",
];

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  clientHost: "127.0.0.1",
  clientPort: 5188,
  timeoutMs: 2500,
  server: "http://192.168.31.68:17888",
  checkBoard: false,
  requireHost: false,
  requireClient: false,
  requireBoard: false,
  agentStatus: "",
  lastCodexEventAt: "",
  codexText: "",
  codexTextFile: "",
  stateFile: "",
  stuckThresholdMs: 60000,
  staleThresholdMs: 300000,
  json: false,
  boardSummary: false,
};

const completedCallStatuses = new Set(["done", "completed", "cancelled", "canceled", "resolved", "closed"]);
const activeAgentStatuses = new Set(["coding", "checking", "thinking", "running", "syncing"]);

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/check-mac-heartbeat.mjs [options]

Prints a secret-free Mac health heartbeat for Windows-side monitoring. It is
read-only: it does not start Mac host, does not start Mac client, does not
authenticate a WebSocket, does not require or print a password, and does not
send input events or inject.

Options:
  --host <host>               Mac host discovery host. Default: ${defaults.host}
  --port <port>               Mac host discovery port. Default: ${defaults.port}
  --clientHost <host>         Local Mac client page host. Default: ${defaults.clientHost}
  --clientPort <port>         Local Mac client page port. Default: ${defaults.clientPort}
  --timeoutMs <ms>            Per probe timeout. Default: ${defaults.timeoutMs}
  --server <url>              Agent Link Board URL. Default: ${defaults.server}
  --checkBoard                Read Agent Link Board /api/state.
  --requireHost               Treat Mac host offline as a blocker.
  --requireClient             Treat Mac client page offline as a blocker.
  --requireBoard              Treat Agent Link Board unreadable as a blocker.
  --agentStatus <status>      Override Mac Codex status for stale detection.
  --lastCodexEventAt <iso>    Override last Mac Codex event/update time.
  --codexText <text>          Text evidence from Codex UI/OCR/logs.
  --codexTextFile <path>      Read Codex UI/OCR/log text evidence from a file.
  --stateFile <path>          Persist reconnect evidence firstSeenAt for
                              repeated watcher runs.
  --stuckThresholdMs <ms>     Reconnect evidence duration before blocker.
                              Default: ${defaults.stuckThresholdMs}
  --staleThresholdMs <ms>     Active Mac Codex status age before stale blocker.
                              Default: ${defaults.staleThresholdMs}
  --boardSummary              Print one Agent Link Board summary line,
                              including checkedAt/boardUpdatedAt freshness.
  --json                      Print one machine-readable JSON object.
  --help, -h                  Show this help without probing anything.

Machine-readable JSON fields:
  status                      ok|warning|blocked.
  blockers[] / warnings[]     Stable reason ids for Windows alert routing.
  codex.reason                codex-reconnect-stuck, codex-reconnect-signal,
                              mac-codex-stale, or ok.
  codex.signals[]             Detected reconnect/error text signals.
  macHost                     Read-only /discovery status and key runtime data.
  macClient                   Read-only local Mac client page status.
  board                       Agent Link Board readability and currentCall.
  commands                    Secret-free next-step commands for user action,
                              including the local Mac client mock browser
                              self-test.

Examples:
  node scripts/mac/check-mac-heartbeat.mjs --checkBoard --boardSummary
  node scripts/mac/check-mac-heartbeat.mjs --json --codexTextFile .dev-lab/mac-codex-ocr.txt --stateFile .dev-lab/mac-heartbeat/state.json
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
      token === "--requireHost" ||
      token === "--requireClient" ||
      token === "--requireBoard" ||
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
    if (token === "--agentStatus" && next && !next.startsWith("--")) {
      args.agentStatus = next;
      index += 1;
      continue;
    }
    if (token === "--lastCodexEventAt" && next && !next.startsWith("--")) {
      args.lastCodexEventAt = next;
      index += 1;
      continue;
    }
    if (token === "--codexText" && next && !next.startsWith("--")) {
      args.codexText = next;
      index += 1;
      continue;
    }
    if (token === "--codexTextFile" && next && !next.startsWith("--")) {
      args.codexTextFile = next;
      index += 1;
      continue;
    }
    if (token === "--stateFile" && next && !next.startsWith("--")) {
      args.stateFile = next;
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
    throw new Error(`Unknown argument: ${token}`);
  }
  args.host = String(args.host || defaults.host).trim();
  args.clientHost = String(args.clientHost || defaults.clientHost).trim();
  args.server = String(args.server || defaults.server).trim().replace(/\/+$/, "");
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
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    error: result.error ? result.error.message : "",
  };
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requestText(url, timeoutMs) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1024 * 1024) {
          request.destroy(new Error("response too large"));
        }
      });
      response.on("end", () => {
        resolveRequest({ statusCode: response.statusCode || 0, body });
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error(`timed out after ${timeoutMs}ms`));
    });
    request.on("error", rejectRequest);
  });
}

async function requestJson(url, timeoutMs) {
  const response = await requestText(url, timeoutMs);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`HTTP ${response.statusCode}`);
  }
  try {
    return JSON.parse(response.body);
  } catch (error) {
    throw new Error(`invalid JSON: ${error.message}`);
  }
}

function getGitStatus() {
  const branch = command("git", ["status", "--short", "--branch"], { timeoutMs: 5000 });
  const head = command("git", ["rev-parse", "--short", "HEAD"], { timeoutMs: 5000 });
  const lines = String(branch.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const changes = lines.filter((line) => !line.startsWith("##"));
  return {
    ok: branch.ok && head.ok,
    head: normalizedText(head.stdout),
    branchLine: lines.find((line) => line.startsWith("##")) || "",
    clean: branch.ok && changes.length === 0,
    changes,
    error: normalizedText(branch.error || branch.stderr || head.error || head.stderr),
  };
}

function splitLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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

async function probeMacHost(args) {
  const url = `http://${args.host}:${args.port}/discovery`;
  const result = {
    checked: true,
    online: false,
    url,
    host: args.host,
    port: args.port,
    runtimeBuild: "",
    runtime: null,
    inputMode: "",
    maxScreenFps: null,
    permissions: {},
    screen: {},
    audio: {},
    pipeline: "",
    buildDiff: {
      differs: false,
      fromBuildId: "",
      toBuildId: "",
      comparable: false,
      changedHostRuntimeFiles: null,
      changedHostRuntimeFileCount: null,
      severity: "unknown",
      message: "",
    },
    error: "",
  };
  try {
    const discovery = await requestJson(url, args.timeoutMs);
    const capabilities = discovery.capabilities || {};
    const screen = capabilities.screen || {};
    const input = capabilities.input || {};
    const audio = capabilities.audio || {};
    result.online = true;
    result.runtime = discovery.runtime || null;
    result.runtimeBuild = discovery.runtime?.buildId || "";
    result.inputMode = input.mode || capabilities.inputMode || "";
    result.maxScreenFps = screen.maxFps ?? screen.maxScreenFps ?? capabilities.maxScreenFps ?? null;
    result.permissions = discovery.permissions || capabilities.permissions || {};
    result.screen = screen;
    result.audio = audio;
    result.pipeline = screen.capturePipeline || screen.pipeline || "";
  } catch (error) {
    result.error = error.message;
  }
  return result;
}

async function probeMacClient(args) {
  const url = `http://${args.clientHost}:${args.clientPort}/`;
  const result = {
    checked: true,
    online: false,
    url,
    titleFound: false,
    statusCode: 0,
    error: "",
  };
  try {
    const response = await requestText(url, args.timeoutMs);
    result.statusCode = response.statusCode;
    result.online = response.statusCode >= 200 && response.statusCode < 300;
    result.titleFound = /LAN Dual|Mac 控制|控制 Windows|远程/.test(response.body);
    if (!result.online) result.error = `HTTP ${response.statusCode}`;
  } catch (error) {
    result.error = error.message;
  }
  return result;
}

async function readBoard(args) {
  const result = {
    checked: args.checkBoard,
    ok: false,
    url: `${args.server}/api/state`,
    updatedAt: "",
    currentCall: { status: "not-checked", active: false, from: "", need: "", connection: "" },
    macCodexStatus: { status: "", note: "", updatedAt: "" },
    error: "",
  };
  if (!args.checkBoard) return result;
  try {
    const state = await requestJson(result.url, args.timeoutMs);
    const call = state.currentCall || null;
    const callStatus = String(call?.status || "none").toLowerCase();
    const active = Boolean(call && callStatus && !completedCallStatuses.has(callStatus));
    const macStatus = state.statuses?.["Mac Codex"] || {};
    result.ok = true;
    result.updatedAt = state.updatedAt || "";
    result.currentCall = {
      status: call ? callStatus : "none",
      active,
      from: call?.from || "",
      need: call?.need || "",
      connection: call?.connection || "",
    };
    result.macCodexStatus = {
      status: macStatus.status || "",
      note: macStatus.note || "",
      updatedAt: macStatus.updatedAt || "",
    };
  } catch (error) {
    result.error = error.message;
  }
  return result;
}

function readCodexText(args) {
  const chunks = [];
  if (args.codexText) chunks.push(args.codexText);
  if (args.codexTextFile) {
    try {
      chunks.push(readFileSync(resolve(repoRoot, args.codexTextFile), "utf8"));
    } catch (error) {
      chunks.push(`[codexTextFileError:${error.message}]`);
    }
  }
  return chunks.join("\n").trim();
}

function detectReconnectSignals(text) {
  const signals = [];
  if (/正在重新连接\s*5\s*\/\s*5/.test(text)) signals.push("reconnecting-5-of-5");
  if (/stream disconnected before completion/i.test(text)) signals.push("stream-disconnected-before-completion");
  if (/error sending request/i.test(text) && /backend-api\/codex\/responses|chatgpt\.com\/backend-api\/codex\/responses/i.test(text)) {
    signals.push("codex-backend-api-request-error");
  }
  return [...new Set(signals)];
}

function parseTime(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function ageMs(value, nowMs) {
  const timestamp = parseTime(value);
  return timestamp === null ? null : Math.max(0, nowMs - timestamp);
}

function readJsonFile(path) {
  try {
    if (!path || !existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonFile(path, value) {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function clearStateFile(path) {
  if (!path || !existsSync(path)) return;
  rmSync(path, { force: true });
}

function analyzeCodex(args, board, nowMs) {
  const text = readCodexText(args);
  const signals = detectReconnectSignals(text);
  const agentStatus = args.agentStatus || board.macCodexStatus.status || "unknown";
  const lastCodexEventAt = args.lastCodexEventAt || board.macCodexStatus.updatedAt || "";
  const lastCodexEventAgeMs = ageMs(lastCodexEventAt, nowMs);
  let firstReconnectSeenAt = "";
  let reconnectEvidenceAgeMs = 0;
  let stateError = "";
  const signalKey = signals.join("|");

  if (signals.length > 0 && args.stateFile) {
    const statePath = resolve(repoRoot, args.stateFile);
    const state = readJsonFile(statePath);
    if (state?.signalKey === signalKey && parseTime(state.firstSeenAt) !== null) {
      firstReconnectSeenAt = state.firstSeenAt;
    } else {
      firstReconnectSeenAt = lastCodexEventAgeMs !== null
        ? lastCodexEventAt
        : new Date(nowMs).toISOString();
    }
    try {
      writeJsonFile(statePath, {
        signalKey,
        signals,
        firstSeenAt: firstReconnectSeenAt,
        lastSeenAt: new Date(nowMs).toISOString(),
        evidence: safeSnippet(text),
      });
    } catch (error) {
      stateError = error.message;
    }
    reconnectEvidenceAgeMs = Math.max(0, nowMs - Number(parseTime(firstReconnectSeenAt)));
  } else if (signals.length > 0) {
    reconnectEvidenceAgeMs = lastCodexEventAgeMs ?? 0;
  } else if (args.stateFile) {
    try {
      clearStateFile(resolve(repoRoot, args.stateFile));
    } catch (error) {
      stateError = error.message;
    }
  }

  const reconnectStuck = signals.length > 0 && reconnectEvidenceAgeMs >= args.stuckThresholdMs;
  const stale = activeAgentStatuses.has(String(agentStatus).toLowerCase())
    && lastCodexEventAgeMs !== null
    && lastCodexEventAgeMs >= args.staleThresholdMs;
  const reason = reconnectStuck
    ? "codex-reconnect-stuck"
    : signals.length > 0
      ? "codex-reconnect-signal"
      : stale
        ? "mac-codex-stale"
        : "ok";

  return {
    checked: Boolean(text || args.checkBoard || args.agentStatus || args.lastCodexEventAt),
    status: agentStatus,
    lastEventAt: lastCodexEventAt,
    lastEventAgeMs: lastCodexEventAgeMs,
    textEvidencePresent: text.length > 0,
    signals,
    reason,
    reconnectStuck,
    reconnectEvidenceAgeMs,
    firstReconnectSeenAt,
    stale,
    stateFile: args.stateFile || "",
    stateError,
    evidence: safeSnippet(text),
  };
}

function safeSnippet(text) {
  return String(text || "")
    .replace(/(password|token|secret|key)\s*[:=]\s*["']?[^"'\s]+/gi, "$1=<redacted>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function buildCommands(args) {
  return {
    macHeartbeatCommand: `node scripts/mac/check-mac-heartbeat.mjs --host ${args.host} --port ${args.port} --clientHost ${args.clientHost} --clientPort ${args.clientPort} --checkBoard --boardSummary`,
    macHostStopCommand: `node scripts/mac/start-mac-host.mjs --stop --host ${args.host} --port ${args.port}`,
    macHostSafeStartCommand: `node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port ${args.port}`,
    macHostReadinessCommand: `node scripts/mac/check-mac-host-readiness.mjs --host ${args.host} --port ${args.port} --checkBoard --boardSummary`,
    macClientPageStatusCommand: "node scripts/mac/start-mac-client.mjs --status --boardSummary",
    macClientDiagnosticsCommand: "node scripts/mac/check-mac-client-readiness.mjs --probeClientServer --checkBoard --boardSummary",
    macFormalLocalSmokeCommand: `node scripts/mac/check-mac-formal-local-smoke.mjs --host ${args.host} --port ${args.port} --promptPassword --boardSummary`,
    macClientDiscoverWindowsCommand: "node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary",
    macClientFormalChecklistCommand: "node scripts/mac/check-mac-client-formal-status.mjs --discover --port 43770 --boardSummary",
    macClientFormalSmokeCommand: "node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary",
    macClientBrowserSelfTestCommand: "node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs --boardSummary",
  };
}

function buildFindings(args, { macHost, macClient, board, codex }) {
  const blockers = [];
  const warnings = [];
  if (codex.reason === "codex-reconnect-stuck") blockers.push("codex-reconnect-stuck");
  if (codex.reason === "mac-codex-stale") blockers.push("mac-codex-stale");
  if (codex.reason === "codex-reconnect-signal") warnings.push("codex-reconnect-signal");
  if (!macHost.online) {
    (args.requireHost ? blockers : warnings).push("mac-host-offline");
  } else if (["restart-recommended", "warning"].includes(macHost.buildDiff?.severity)) {
    warnings.push("mac-host-build-stale");
  }
  if (!macClient.online) {
    (args.requireClient ? blockers : warnings).push("mac-client-offline");
  }
  if (board.checked && !board.ok) {
    (args.requireBoard ? blockers : warnings).push("agent-link-board");
  }
  if (codex.stateError) warnings.push("heartbeat-state");
  return {
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
  };
}

function statusFromFindings(findings) {
  if (findings.blockers.length > 0) return "blocked";
  if (findings.warnings.length > 0) return "warning";
  return "ok";
}

function summarizeIds(ids) {
  return ids.length > 0 ? ids.join(",") : "none";
}

function formatMacHostBuildDiff(buildDiff) {
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
  return "build=unknown";
}

function makeBoardSummary(report) {
  const checkedAt = report.checkedAt || "unknown";
  const host = report.macHost.online
    ? `online ${report.macHost.host}:${report.macHost.port} build=${report.macHost.runtimeBuild || "unknown"} inputMode=${report.macHost.inputMode || "unknown"} ${formatMacHostBuildDiff(report.macHost.buildDiff)}`
    : `offline ${report.macHost.host}:${report.macHost.port}`;
  const client = report.macClient.online ? `online ${report.macClient.url}` : `offline ${report.macClient.url}`;
  const board = !report.board.checked
    ? "not-checked"
    : report.board.ok
      ? `ok boardUpdatedAt=${report.board.updatedAt || "unknown"} call=${report.board.currentCall.status}${report.board.currentCall.active ? ":active" : ""}`
      : "failed";
  const codexUpdatedAt = report.codex.lastEventAt || "unknown";
  const codexAge = report.codex.lastEventAgeMs ?? "unknown";
  const codexAgeMs = report.codex.reason === "mac-codex-stale"
    ? report.codex.lastEventAgeMs
    : report.codex.reconnectEvidenceAgeMs;
  const codex = report.codex.reason === "ok"
    ? `ok status=${report.codex.status || "unknown"} updatedAt=${codexUpdatedAt} ageMs=${codexAge}`
    : `${report.codex.reason} status=${report.codex.status || "unknown"} updatedAt=${codexUpdatedAt} ageMs=${codexAge} evidenceAgeMs=${codexAgeMs ?? "unknown"}`;
  const evidence = report.codex.evidence ? ` evidence=${report.codex.evidence}` : "";
  const suggestedAction = report.status === "blocked"
    ? "suggestedAction=请用户查看 Mac Codex 窗口，必要时手动重试/刷新/继续"
    : "suggestedAction=none";
  return [
    `MacHeartbeat=status=${report.status}; checkedAt=${checkedAt}; device=Mac; codex=${codex}; macHost=${host}; macClient=${client}; board=${board}; blockers=${summarizeIds(report.blockers)} warnings=${summarizeIds(report.warnings)} reason=${report.codex.reason}.${evidence}`,
    suggestedAction,
    `MacHeartbeatRerun=${report.commands.macHeartbeatCommand}.`,
    `MacHostStop=${report.commands.macHostStopCommand}.`,
    `MacHostSafeStart=${report.commands.macHostSafeStartCommand}.`,
    `MacHostReadiness=${report.commands.macHostReadinessCommand}.`,
    `MacClientPage=${report.commands.macClientPageStatusCommand}.`,
    `MacClientDiagnostics=${report.commands.macClientDiagnosticsCommand}.`,
    `MacFormalLocalSmoke=${report.commands.macFormalLocalSmokeCommand}.`,
    `MacClientDiscoverWindows=${report.commands.macClientDiscoverWindowsCommand}.`,
    `MacClientFormalChecklist=${report.commands.macClientFormalChecklistCommand}.`,
    `MacClientFormalSmoke=${report.commands.macClientFormalSmokeCommand}.`,
    `MacClientBrowserSelfTest=${report.commands.macClientBrowserSelfTestCommand}.`,
    "No password was requested or sent; no WebSocket auth/input/inject was attempted.",
  ].join(" ");
}

function printHuman(report) {
  console.log("Mac heartbeat");
  console.log(`- status: ${report.status}`);
  console.log(`- codex: ${report.codex.reason} (${report.codex.signals.join(",") || "no reconnect signal"})`);
  console.log(`- Mac host: ${report.macHost.online ? "online" : "offline"} ${report.macHost.host}:${report.macHost.port}`);
  console.log(`- Mac client: ${report.macClient.online ? "online" : "offline"} ${report.macClient.url}`);
  console.log(`- Agent Link Board: ${report.board.checked ? (report.board.ok ? "ok" : "failed") : "not checked"}`);
  console.log(`- blockers: ${summarizeIds(report.blockers)}`);
  console.log(`- warnings: ${summarizeIds(report.warnings)}`);
  console.log(report.boardSummary);
}

async function buildReport(args) {
  const nowMs = Date.now();
  const [macHost, macClient, board] = await Promise.all([
    probeMacHost(args),
    probeMacClient(args),
    readBoard(args),
  ]);
  const git = getGitStatus();
  if (macHost.online) {
    macHost.buildDiff = makeBuildDiff(macHost.runtimeBuild, git.head);
  }
  const codex = analyzeCodex(args, board, nowMs);
  const commands = buildCommands(args);
  const findings = buildFindings(args, { macHost, macClient, board, codex });
  const status = statusFromFindings(findings);
  const report = {
    ok: status !== "blocked",
    status,
    checkedAt: new Date(nowMs).toISOString(),
    git,
    macHost,
    macClient,
    board,
    codex,
    commands,
    blockers: findings.blockers,
    warnings: findings.warnings,
    boardSummary: "",
  };
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
    printHuman(report);
  }
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok: false, error: { message: error.message } }, null, 2));
  } else {
    console.error(`[FAIL] ${error.message}`);
  }
  process.exitCode = 1;
});
