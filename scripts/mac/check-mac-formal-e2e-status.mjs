#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  timeoutMs: 8000,
  server: "http://192.168.31.68:17888",
  skipBoard: false,
  allowDirty: false,
  requireCurrentBuildId: false,
  json: false,
  boardSummary: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/check-mac-formal-e2e-status.mjs [options]

Builds a read-only formal E2E checklist for Mac Codex before calling Windows
Codex. It reuses check-mac-resume-status and does not start Mac host, does not
authenticate a WebSocket, does not require or print a password, and does not
send input events.

Options:
  --host <host>             Mac host discovery host. Default: 127.0.0.1
  --port <port>             Mac host discovery port. Default: 43770
  --timeoutMs <ms>          Per probe timeout. Default: 8000
  --server <url>            Agent Link Board URL. Default: ${defaults.server}
  --skipBoard               Do not read Agent Link Board. Default checks it.
  --allowDirty              Report dirty git state as a warning instead of a blocker.
  --requireCurrentBuildId   Treat stale runtime build metadata as a blocker.
  --boardSummary            Print a short secret-free Agent Link Board summary.
  --json                    Print one machine-readable JSON object.
  --help, -h                Show this help without probing anything.

Examples:
  node scripts/mac/check-mac-formal-e2e-status.mjs
  node scripts/mac/check-mac-formal-e2e-status.mjs --boardSummary
  node scripts/mac/check-mac-formal-e2e-status.mjs --json --skipBoard
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
      token === "--requireCurrentBuildId" ||
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
  args.host = String(args.host || defaults.host).trim();
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

function runResumeStatus(args) {
  const resumeArgs = [
    "scripts/mac/check-mac-resume-status.mjs",
    "--json",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--timeoutMs",
    String(args.timeoutMs),
  ];
  if (!args.skipBoard) {
    resumeArgs.push("--server", args.server, "--checkBoard");
  }

  const result = spawnSync(process.execPath, resumeArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(args.timeoutMs + 2000, 5000),
    maxBuffer: 8 * 1024 * 1024,
  });
  const stdout = String(result.stdout || "").trim();
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`check-mac-resume-status did not print valid JSON: ${error.message}\n${stdout}\n${result.stderr || ""}`);
  }
}

function item(id, label, status, summary, detail = "", next = "") {
  return {
    id,
    label,
    status,
    summary,
    detail,
    next,
  };
}

function okItem(id, label, summary, detail = "") {
  return item(id, label, "ok", summary, detail);
}

function warnItem(id, label, summary, detail = "", next = "") {
  return item(id, label, "warning", summary, detail, next);
}

function blockItem(id, label, summary, detail = "", next = "") {
  return item(id, label, "blocker", summary, detail, next);
}

function skipItem(id, label, summary, detail = "", next = "") {
  return item(id, label, "skip", summary, detail, next);
}

function formatHostAddress(host) {
  const lan = Array.isArray(host?.lanAddresses) && host.lanAddresses.length > 0
    ? host.lanAddresses[0]
    : null;
  if (lan?.address && lan?.port) return `${lan.address}:${lan.port}`;
  if (host?.probe?.host && host?.probe?.port) return `${host.probe.host}:${host.probe.port}`;
  return "unknown";
}

function formatBuildDiff(buildDiff) {
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
  return "build comparison unavailable";
}

function isSystemPcmAudio(capabilities) {
  const audioMode = normalizedText(capabilities?.audioMode).toLowerCase();
  return capabilities?.audio === true || audioMode === "system-pcm" || audioMode.includes("pcm");
}

function buildChecklist(resume, args) {
  const checklist = [];
  const git = resume.git || {};
  const board = resume.board || {};
  const host = resume.host || {};
  const permissions = host.permissions || {};
  const capabilities = host.capabilities || {};
  const buildDiff = host.buildDiff || {};

  if (git.clean) {
    checklist.push(okItem("repo", "Repository", `clean at ${resume.currentBuildId || "unknown"}`));
  } else if (args.allowDirty) {
    checklist.push(warnItem("repo", "Repository", `${Array.isArray(git.changes) ? git.changes.length : 0} local change(s) allowed for this local check`, "", "Commit or stash before pushing or asking Windows to rely on this exact repo state."));
  } else {
    checklist.push(blockItem("repo", "Repository", `${Array.isArray(git.changes) ? git.changes.length : 0} local change(s) present`, "", "Commit/stash or rerun with --allowDirty only for local diagnostics."));
  }

  if (args.skipBoard) {
    checklist.push(warnItem("board", "Agent Link Board", "not checked", "", "Run again without --skipBoard before calling Windows Codex."));
  } else if (board.checked && board.ok) {
    checklist.push(okItem("board", "Agent Link Board", board.summary || "readable"));
  } else {
    checklist.push(blockItem("board", "Agent Link Board", board.summary || "not readable", "", "Open/check the board before coordinating formal E2E."));
  }

  if (!host.online) {
    checklist.push(blockItem("host", "Mac Host", `offline at ${host.probe?.host || args.host}:${host.probe?.port || args.port}`, host.error?.message || "", "Start formal host with start-mac-host --promptPassword --requirePassword."));
    checklist.push(skipItem("auth", "Formal Auth", "waiting for host", "", "Do not send passwords on Agent Link Board."));
    checklist.push(skipItem("video", "H.264 Video", "waiting for host"));
    checklist.push(skipItem("audio", "System Audio", "waiting for host"));
    checklist.push(skipItem("clipboard", "Clipboard", "waiting for host"));
    checklist.push(skipItem("input-log", "Input Log", "waiting for host"));
    checklist.push(skipItem("inject", "Input Inject", "not part of unattended formal E2E", "", "Only run inject after the user explicitly confirms they are watching."));
    return checklist;
  }

  checklist.push(okItem("host", "Mac Host", `online at ${formatHostAddress(host)}`, `runtimeBuild=${host.runtime?.buildId || "unknown"} inputMode=${host.inputMode || "unknown"}`));

  if (Array.isArray(host.lanAddresses) && host.lanAddresses.length > 0) {
    checklist.push(okItem("lan", "LAN Address", `Windows can try ${formatHostAddress(host)}`));
  } else {
    checklist.push(blockItem("lan", "LAN Address", "no non-link-local IPv4 address found", "", "Confirm Mac and Windows are on the same LAN."));
  }

  if (host.inputMode === "log") {
    checklist.push(okItem("input-mode", "Input Mode", "log mode, safe for input-log validation"));
  } else {
    checklist.push(blockItem("input-mode", "Input Mode", `current mode is ${host.inputMode || "unknown"}`, "", "Restart with LAN_DUAL_INPUT_MODE=log or start-mac-host default before unattended validation."));
  }

  if (permissions.screenRecording === true) {
    checklist.push(okItem("screen-permission", "Screen Recording", "permission on"));
  } else {
    checklist.push(blockItem("screen-permission", "Screen Recording", `permission ${statusValue(permissions.screenRecording)}`, "", "Enable Screen Recording for the Codex/Mac host launch context."));
  }

  if (permissions.accessibility === true) {
    checklist.push(okItem("accessibility", "Accessibility", "permission on"));
  } else {
    checklist.push(warnItem("accessibility", "Accessibility", `permission ${statusValue(permissions.accessibility)}`, "", "Log-mode validation can continue, but inject cannot work until this is on."));
  }

  if (permissions.inputMonitoring === true) {
    checklist.push(okItem("input-monitoring", "Input Monitoring", "permission on"));
  } else {
    checklist.push(warnItem("input-monitoring", "Input Monitoring", `permission ${statusValue(permissions.inputMonitoring)}`, "", "Keyboard edge cases may need manual permission review."));
  }

  if (capabilities.h264Stream === true) {
    checklist.push(okItem("video", "H.264 Video", `advertised; currentPipeline=${capabilities.capturePipeline || "unknown"}`));
  } else {
    checklist.push(blockItem("video", "H.264 Video", `h264=${statusValue(capabilities.h264Stream)} pipeline=${capabilities.capturePipeline || "unknown"}`, "", "Fix ScreenCaptureKit/H.264 readiness before 5-10 minute formal video validation."));
  }

  if (isSystemPcmAudio(capabilities)) {
    checklist.push(okItem("audio", "System Audio", `available as ${capabilities.audioMode || "pcm"}`));
  } else {
    checklist.push(blockItem("audio", "System Audio", `audio=${capabilities.audioMode || statusValue(capabilities.audio)}`, "", "Fix system PCM audio before formal audio validation."));
  }

  const clipboardText = capabilities.clipboardText === true;
  const clipboardFile = capabilities.clipboardFile === true;
  if (clipboardText && clipboardFile) {
    checklist.push(okItem("clipboard", "Clipboard", "text and file channels advertised"));
  } else {
    checklist.push(blockItem("clipboard", "Clipboard", `text=${statusValue(clipboardText)} file=${statusValue(clipboardFile)}`, "", "Formal E2E includes clipboard; verify advertised capabilities before calling Windows."));
  }

  if (Array.isArray(host.displays) && host.displays.length > 0) {
    checklist.push(okItem("displays", "Displays", `${host.displayCount || host.displays.length} display(s) advertised`));
  } else {
    checklist.push(blockItem("displays", "Displays", "no displays advertised", "", "Formal video cannot proceed without display discovery."));
  }

  if (buildDiff.severity === "restart-recommended") {
    checklist.push(blockItem("build", "Runtime Build", formatBuildDiff(buildDiff), "", "Restart Mac host before deploy-style validation."));
  } else if (args.requireCurrentBuildId && buildDiff.differs) {
    checklist.push(blockItem("build", "Runtime Build", formatBuildDiff(buildDiff), "", "Restart Mac host so runtime build matches current git."));
  } else if (buildDiff.differs) {
    checklist.push(warnItem("build", "Runtime Build", formatBuildDiff(buildDiff), buildDiff.message || "", "OK for coordination if hostRuntimeChanges=0; restart before strict deploy-current-build validation."));
  } else {
    checklist.push(okItem("build", "Runtime Build", formatBuildDiff(buildDiff)));
  }

  checklist.push(warnItem("auth", "Formal Auth", "requires Windows side to enter the agreed password out-of-band", "", "Never send passwords, tokens, or system account details on Agent Link Board."));
  checklist.push(okItem("input-log", "Input Log", "safe validation path is input-log only"));
  checklist.push(skipItem("inject", "Input Inject", "explicitly skipped", "", "Only run inject after the user explicitly confirms they are watching the screen."));
  return checklist;
}

function summarizeCounts(checklist) {
  return {
    blockers: checklist.filter((entry) => entry.status === "blocker").length,
    warnings: checklist.filter((entry) => entry.status === "warning").length,
    skipped: checklist.filter((entry) => entry.status === "skip").length,
    ok: checklist.filter((entry) => entry.status === "ok").length,
  };
}

function makeCallText(report) {
  const host = report.resume.host || {};
  if (!host.online) {
    return "Mac formal E2E is not ready: Mac host is offline. Start with start-mac-host --promptPassword --requirePassword, then rerun the checklist.";
  }
  const address = formatHostAddress(host);
  return [
    `Mac formal E2E ${report.readyToCall ? "ready" : "needs attention"}: host=${address}, repo=${report.resume.currentBuildId || "unknown"}, runtimeBuild=${host.runtime?.buildId || "unknown"}, inputMode=${host.inputMode || "unknown"}.`,
    `Permissions screen=${statusValue(host.permissions?.screenRecording)} accessibility=${statusValue(host.permissions?.accessibility)} inputMonitoring=${statusValue(host.permissions?.inputMonitoring)}; h264=${statusValue(host.capabilities?.h264Stream)} audio=${host.capabilities?.audioMode || statusValue(host.capabilities?.audio)}.`,
    `Checklist blockers=${report.counts.blockers}, warnings=${report.counts.warnings}.`,
    "If ready, Windows should run discovery -> auth -> H.264 5-10 min -> audio -> clipboard -> input-log. Do not run inject unless the user explicitly confirms they are watching.",
  ].join(" ");
}

function makeBoardSummary(report) {
  const host = report.resume.host || {};
  const state = report.readyToCall
    ? "ready for Windows formal E2E"
    : `needs attention (${report.counts.blockers} blocker(s), ${report.counts.warnings} warning(s))`;
  if (!host.online) {
    return [
      `Mac formal E2E: ${state}; repo=${report.resume.currentBuildId || "unknown"} ${report.resume.git?.clean ? "clean" : "dirty"}.`,
      `Mac host offline at ${host.probe?.host || report.args.host}:${host.probe?.port || report.args.port}.`,
      "Next: start with start-mac-host --promptPassword --requirePassword, then rerun checklist.",
      "Do not send passwords on Agent Link Board; inject requires explicit user confirmation.",
    ].join(" ");
  }
  return [
    `Mac formal E2E: ${state}; host=${formatHostAddress(host)}; repo=${report.resume.currentBuildId || "unknown"} ${report.resume.git?.clean ? "clean" : "dirty"}; runtimeBuild=${host.runtime?.buildId || "unknown"}; inputMode=${host.inputMode || "unknown"}.`,
    `Permissions screen=${statusValue(host.permissions?.screenRecording)} accessibility=${statusValue(host.permissions?.accessibility)} inputMonitoring=${statusValue(host.permissions?.inputMonitoring)}; h264=${statusValue(host.capabilities?.h264Stream)}; audio=${host.capabilities?.audioMode || statusValue(host.capabilities?.audio)}; ${formatBuildDiff(host.buildDiff)}.`,
    "Formal path: Windows discovery -> auth -> H.264 5-10 min -> audio -> clipboard -> input-log; no inject without explicit user confirmation.",
    "Do not send passwords on Agent Link Board.",
  ].join(" ");
}

function printReport(report) {
  console.log(`[INFO] Mac formal E2E status · ${new Date(report.checkedAt).toLocaleString()}`);
  for (const entry of report.checklist) {
    const prefix = entry.status === "ok"
      ? "OK"
      : entry.status === "blocker"
        ? "BLOCK"
        : entry.status === "skip"
          ? "SKIP"
          : "WARN";
    const detail = entry.detail ? ` · ${entry.detail}` : "";
    console.log(`[${prefix}] ${entry.label}: ${entry.summary}${detail}`);
    if (entry.next) {
      console.log(`[NEXT] ${entry.next}`);
    }
  }
  console.log(report.readyToCall
    ? "[OK] Formal E2E is ready to call Windows Codex"
    : "[WARN] Formal E2E should not be called yet");
  console.log(`[INFO] ${report.callText}`);
}

function buildReport(args) {
  const resume = runResumeStatus(args);
  const checklist = buildChecklist(resume, args);
  const counts = summarizeCounts(checklist);
  const boardReady = !args.skipBoard && resume.board?.checked === true && resume.board?.ok === true;
  const readyToCall = counts.blockers === 0 && boardReady;
  const report = {
    ok: counts.blockers === 0,
    readyToCall,
    checkedAt: new Date().toISOString(),
    args: {
      host: args.host,
      port: args.port,
      timeoutMs: args.timeoutMs,
      skipBoard: args.skipBoard,
      allowDirty: args.allowDirty,
      requireCurrentBuildId: args.requireCurrentBuildId,
    },
    counts,
    checklist,
    resume,
  };
  report.callText = makeCallText(report);
  report.boardSummary = makeBoardSummary(report);
  return report;
}

function main() {
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
    printReport(report);
  }
  process.exitCode = report.ok ? 0 : 1;
}

try {
  main();
} catch (error) {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      ok: false,
      readyToCall: false,
      error: { message: error.message },
    }, null, 2));
  } else {
    console.error(`[FAIL] ${error.message}`);
  }
  process.exitCode = 1;
}
