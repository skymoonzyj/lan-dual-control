#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  clientHost: "127.0.0.1",
  clientPort: 5188,
  windowsHost: "",
  windowsPort: 43770,
  timeoutMs: 5000,
  server: "http://192.168.31.68:17888",
  skipBoard: false,
  allowDirty: false,
  allowClientServerOffline: false,
  allowWindowsHostOffline: false,
  json: false,
  boardSummary: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/check-mac-client-formal-status.mjs [options]

Builds a read-only formal checklist before Mac controls a real Windows host.
It reuses check-mac-client-readiness, does not start Mac client or Windows host,
does not authenticate WebSocket, does not require or print a password, and does
not send input events.

Options:
  --clientHost <host>             Local Mac client web host. Default: ${defaults.clientHost}
  --clientPort <port>             Local Mac client web port. Default: ${defaults.clientPort}
  --host <host>                   Windows host discovery address.
  --windowsHost <host>            Same as --host.
  --port <port>                   Windows host discovery port. Default: ${defaults.windowsPort}
  --windowsPort <port>            Same as --port.
  --timeoutMs <ms>                Per probe timeout. Default: ${defaults.timeoutMs}
  --server <url>                  Agent Link Board URL. Default: ${defaults.server}
  --skipBoard                     Do not read Agent Link Board. Default checks it.
  --allowDirty                    Let dirty repo remain a warning.
  --allowClientServerOffline      Let local Mac client page offline remain a warning.
  --allowWindowsHostOffline       Let Windows host discovery offline remain a warning.
  --boardSummary                  Print a short secret-free Agent Link Board summary.
  --json                          Print one machine-readable JSON object.
  --help, -h                      Show this help without probing anything.

Examples:
  node scripts/mac/check-mac-client-formal-status.mjs --host 192.168.31.50 --port 43770 --boardSummary
  node scripts/mac/check-mac-client-formal-status.mjs --json --skipBoard --allowWindowsHostOffline
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
      token === "--skipBoard" ||
      token === "--allowDirty" ||
      token === "--allowClientServerOffline" ||
      token === "--allowWindowsHostOffline" ||
      token === "--boardSummary" ||
      token === "--json"
    ) {
      args[token.slice(2)] = true;
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
    if ((token === "--host" || token === "--windowsHost") && next && !next.startsWith("--")) {
      args.windowsHost = next;
      index += 1;
      continue;
    }
    if ((token === "--port" || token === "--windowsPort") && next && !next.startsWith("--")) {
      args.windowsPort = clampInteger(next, 1, 65535, defaults.windowsPort);
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 1000, 60000, defaults.timeoutMs);
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
  args.clientHost = String(args.clientHost || defaults.clientHost).trim();
  args.windowsHost = String(args.windowsHost || "").trim();
  args.server = String(args.server || defaults.server).trim();
  return args;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function statusValue(value) {
  if (value === true) return "on";
  if (value === false) return "off";
  return "unknown";
}

function runReadiness(args) {
  const readinessArgs = [
    "scripts/mac/check-mac-client-readiness.mjs",
    "--json",
    "--clientHost",
    args.clientHost,
    "--clientPort",
    String(args.clientPort),
    "--probeClientServer",
    "--timeoutMs",
    String(args.timeoutMs),
  ];
  if (args.windowsHost) {
    readinessArgs.push("--host", args.windowsHost, "--port", String(args.windowsPort));
  }
  if (!args.skipBoard) {
    readinessArgs.push("--server", args.server, "--checkBoard");
  }
  const result = spawnSync(process.execPath, readinessArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(args.timeoutMs + 3000, 6000),
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
  });
  const stdout = String(result.stdout || "").trim();
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`check-mac-client-readiness did not print valid JSON: ${error.message}\n${stdout}\n${result.stderr || ""}`);
  }
}

function item(id, status, summary, detail = "", next = "") {
  return { id, status, summary, detail, next };
}

function okItem(id, summary, detail = "") {
  return item(id, "ok", summary, detail);
}

function warnItem(id, summary, detail = "", next = "") {
  return item(id, "warning", summary, detail, next);
}

function blockItem(id, summary, detail = "", next = "") {
  return item(id, "blocker", summary, detail, next);
}

function skipItem(id, summary, detail = "", next = "") {
  return item(id, "skip", summary, detail, next);
}

function screenSummary(screen = {}) {
  const parts = [];
  if (screen.mode) parts.push(`mode=${screen.mode}`);
  if (screen.capturePipeline) parts.push(`pipeline=${screen.capturePipeline}`);
  if (screen.codec) parts.push(`codec=${screen.codec}`);
  if (screen.h264Encoder) parts.push(`h264Encoder=${screen.h264Encoder}`);
  if (Array.isArray(screen.videoTransports) && screen.videoTransports.length > 0) {
    parts.push(`transports=${screen.videoTransports.join("/")}`);
  }
  return parts.length > 0 ? parts.join(" ") : "screen capability present";
}

function audioSummary(audio = {}) {
  const parts = [];
  if (audio.mode || audio.audioMode) parts.push(`mode=${audio.mode || audio.audioMode}`);
  if (audio.codec) parts.push(`codec=${audio.codec}`);
  if (audio.active !== undefined) parts.push(`active=${statusValue(audio.active)}`);
  return parts.length > 0 ? parts.join(" ") : "audio capability present";
}

function buildChecklist(readiness, args) {
  const checklist = [];
  const git = readiness.git || {};
  const client = readiness.client || {};
  const clientServer = readiness.clientServer || {};
  const board = readiness.board || {};
  const windowsHost = readiness.windowsHost || {};
  const capabilities = windowsHost.capabilities || {};
  const screen = capabilities.screen || {};
  const audio = capabilities.audio || {};
  const input = capabilities.input || {};
  const clipboard = capabilities.clipboard || {};

  if (git.clean) {
    checklist.push(okItem("repo", `repo clean at ${readiness.currentBuildId || "unknown"}`));
  } else if (args.allowDirty) {
    checklist.push(warnItem("repo", `${Array.isArray(git.changes) ? git.changes.length : 0} local change(s) allowed`, "", "Commit or stash before pushing or asking Windows to rely on this exact result."));
  } else {
    checklist.push(blockItem("repo", `${Array.isArray(git.changes) ? git.changes.length : 0} local change(s) present`, Array.isArray(git.changes) ? git.changes.join("; ") : "", "Commit/stash or rerun with --allowDirty only for local diagnostics."));
  }

  if (client.ok) {
    checklist.push(okItem("client-files", "Mac client static files and JS syntax checks pass"));
  } else {
    checklist.push(blockItem("client-files", "Mac client static/syntax check failed", "", "Fix Mac client files before formal browser validation."));
  }

  if (clientServer.online && clientServer.titleFound) {
    checklist.push(okItem("client-server", `Mac client page online at ${clientServer.url}`));
  } else if (args.allowClientServerOffline) {
    checklist.push(warnItem("client-server", `Mac client page offline/unverified at ${clientServer.url || `${args.clientHost}:${args.clientPort}`}`, clientServer.error?.message || "", "Start node apps/mac-client/server.mjs before manual formal validation."));
  } else {
    checklist.push(blockItem("client-server", `Mac client page offline/unverified at ${clientServer.url || `${args.clientHost}:${args.clientPort}`}`, clientServer.error?.message || "", "Start node apps/mac-client/server.mjs, then rerun this checklist."));
  }

  if (args.skipBoard) {
    checklist.push(warnItem("board", "Agent Link Board not checked", "", "Run without --skipBoard before coordinating with Windows Codex."));
  } else if (board.checked && board.ok) {
    checklist.push(okItem("board", "Agent Link Board readable"));
  } else {
    checklist.push(blockItem("board", "Agent Link Board not readable", board.error || "", "Open/check the board before asking Windows to coordinate true testing."));
  }

  if (!windowsHost.checked) {
    checklist.push(args.allowWindowsHostOffline
      ? warnItem("windows-host", "Windows host discovery not checked", "", "Ask Windows Codex for the Windows host IP, then rerun with --host <Windows IP> --port 43770.")
      : blockItem("windows-host", "Windows host discovery not checked", "", "Ask Windows Codex for the Windows host IP, then rerun with --host <Windows IP> --port 43770."));
  } else if (!windowsHost.online) {
    checklist.push(args.allowWindowsHostOffline
      ? warnItem("windows-host", `Windows host offline at ${windowsHost.probe?.host}:${windowsHost.probe?.port}`, windowsHost.error?.message || "", "Ask Windows Codex to start Windows host, then rerun.")
      : blockItem("windows-host", `Windows host offline at ${windowsHost.probe?.host}:${windowsHost.probe?.port}`, windowsHost.error?.message || "", "Ask Windows Codex to start Windows host, then rerun."));
  } else {
    const runtime = windowsHost.runtime?.buildId ? ` build=${windowsHost.runtime.buildId}` : "";
    checklist.push(okItem("windows-host", `${windowsHost.device?.name || "Windows host"} online at ${windowsHost.probe?.host}:${windowsHost.probe?.port}${runtime}`));
  }

  if (windowsHost.online) {
    const videoTransports = Array.isArray(capabilities.videoTransports)
      ? capabilities.videoTransports
      : Array.isArray(screen.videoTransports)
        ? screen.videoTransports
        : [];
    checklist.push(okItem("screen", screenSummary(screen)));
    if (videoTransports.includes("binary-h264") || screen.codec === "h264") {
      checklist.push(okItem("h264", `H.264 path visible; transports=${videoTransports.join("/") || "unknown"}`));
    } else {
      checklist.push(warnItem("h264", `H.264 transport not obvious; codec=${screen.codec || "unknown"} transports=${videoTransports.join("/") || "none"}`, "", "Formal visual test may still use JPEG fallback, but H.264 comparison needs Windows host support."));
    }
    checklist.push(okItem("audio", audioSummary(audio)));
    checklist.push(okItem("input-log", `input=${statusValue(input.enabled ?? input.active)} mode=${input.mode || "unknown"}`));
    checklist.push(okItem("clipboard", `text=${statusValue(clipboard.text)} file=${statusValue(clipboard.file)}`));
  } else {
    checklist.push(skipItem("screen", "waiting for Windows host discovery"));
    checklist.push(skipItem("h264", "waiting for Windows host discovery"));
    checklist.push(skipItem("audio", "waiting for Windows host discovery"));
    checklist.push(skipItem("input-log", "waiting for Windows host discovery"));
    checklist.push(skipItem("clipboard", "waiting for Windows host discovery"));
  }

  checklist.push(okItem("password", "no password collected by this checklist"));
  checklist.push(skipItem("inject", "explicitly skipped", "", "Do not run real input injection unless the user explicitly confirms they are watching."));
  return checklist;
}

function countChecklist(checklist, status) {
  return checklist.filter((entry) => entry.status === status).length;
}

function makeCallText(report) {
  const host = report.readiness.windowsHost || {};
  if (!host.online) {
    return "Mac client formal Windows test is not ready: Windows host discovery is offline or not checked. Ask Windows Codex to start Windows host, then rerun with --host <Windows IP> --port 43770 --checkBoard.";
  }
  const address = `${host.probe?.host}:${host.probe?.port}`;
  return [
    `Mac client formal Windows test ${report.readyToCall ? "ready" : "needs attention"}: windowsHost=${address}, runtimeBuild=${host.runtime?.buildId || "unknown"}.`,
    `Screen ${screenSummary(host.capabilities?.screen || {})}; audio ${audioSummary(host.capabilities?.audio || {})}; inputMode=${host.capabilities?.input?.mode || "unknown"}; clipboard text=${statusValue(host.capabilities?.clipboard?.text)} file=${statusValue(host.capabilities?.clipboard?.file)}.`,
    `Checklist blockers=${report.counts.blocker}, warnings=${report.counts.warning}.`,
    `Suggested browser test: ${host.recommendedCommand || `node scripts/windows/test-mac-client-browser.mjs --useExistingHost --host ${address.split(":")[0]} --port ${address.split(":")[1]} --enableAudio --expectAudioPayload --expectAudioPlayback`}.`,
    "Do not send passwords on Agent Link Board; no inject unless the user explicitly confirms they are watching.",
  ].join(" ");
}

function makeBoardSummary(report) {
  const host = report.readiness.windowsHost || {};
  const repo = report.readiness.git?.clean ? "clean" : `dirty(${report.readiness.git?.changes?.length || 0})`;
  const client = report.readiness.client?.ok ? "ok" : "blocked";
  const localServer = report.readiness.clientServer?.online ? "online" : "offline";
  const hostText = host.online
    ? `online ${host.probe?.host}:${host.probe?.port} build=${host.runtime?.buildId || "unknown"}`
    : host.checked
      ? `offline ${host.probe?.host}:${host.probe?.port}`
      : "not-checked";
  return [
    `Mac client formal Windows test: ${report.readyToCall ? "ready" : `needs attention (${report.counts.blocker} blocker(s), ${report.counts.warning} warning(s))`}; repo=${repo}; client=${client}; localServer=${localServer}; windowsHost=${hostText}.`,
    report.readyToCall
      ? `Next: run Mac client true test against ${host.probe?.host}:${host.probe?.port}; compare first frame, FPS, frame age, audio playback, clipboard, input-log, bandwidth/CPU.`
      : "Next: clear blockers, start Mac client page and Windows host, then rerun with --host <Windows IP> --port 43770 --checkBoard --boardSummary.",
    "Do not send passwords on Agent Link Board; do not run inject unless the user explicitly confirms they are watching.",
  ].join(" ");
}

function printHuman(report) {
  console.log("Mac client formal Windows checklist");
  console.log(`- readyToCall: ${report.readyToCall ? "yes" : "no"}`);
  console.log(`- result: ${report.ok ? "no blockers" : "blocked"} (${report.counts.blocker} blockers, ${report.counts.warning} warnings)`);
  console.log("");
  for (const entry of report.checklist) {
    const prefix = entry.status === "ok" ? "OK" : entry.status === "blocker" ? "BLOCK" : entry.status === "skip" ? "SKIP" : "WARN";
    console.log(`[${prefix}] ${entry.id}: ${entry.summary}`);
    if (entry.detail) console.log(`      ${entry.detail}`);
    if (entry.next) console.log(`      Next: ${entry.next}`);
  }
  console.log("");
  console.log(report.boardSummary);
}

function buildReport(args) {
  const readiness = runReadiness(args);
  const checklist = buildChecklist(readiness, args);
  const counts = {
    ok: countChecklist(checklist, "ok"),
    warning: countChecklist(checklist, "warning"),
    blocker: countChecklist(checklist, "blocker"),
    skip: countChecklist(checklist, "skip"),
  };
  const readyToCall = counts.blocker === 0 && !args.skipBoard && readiness.board?.ok === true && readiness.windowsHost?.online === true && readiness.clientServer?.online === true;
  const report = {
    ok: counts.blocker === 0,
    readyToCall,
    checkedAt: new Date().toISOString(),
    args: {
      clientHost: args.clientHost,
      clientPort: args.clientPort,
      windowsHost: args.windowsHost,
      windowsPort: args.windowsPort,
      skipBoard: args.skipBoard,
      allowDirty: args.allowDirty,
      allowClientServerOffline: args.allowClientServerOffline,
      allowWindowsHostOffline: args.allowWindowsHostOffline,
    },
    counts,
    checklist,
    readiness,
  };
  report.callText = makeCallText(report);
  report.boardSummary = makeBoardSummary(report);
  return report;
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  const report = buildReport(args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printHuman(report);
  }
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok: false, error: { message: error.message } }, null, 2));
  } else {
    console.error(`[FAIL] ${error.message}`);
  }
  process.exitCode = 1;
});
