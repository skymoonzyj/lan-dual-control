#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import os from "node:os";
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
  sendCall: false,
  forceCall: false,
  clearStaleCall: false,
};
const formalTargetMaxScreenFps = 60;

const formalE2eCallIdentity = {
  from: "Mac Codex",
  need: "Windows Codex",
  goal: "正式端到端验收 Mac host",
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
  --checkBoard              Explicitly read Agent Link Board. This is the default
                            and is kept for compatibility with other Mac status tools.
  --skipBoard               Do not read Agent Link Board. Default checks it.
  --allowDirty              Report dirty git state as a warning instead of a blocker.
  --requireCurrentBuildId   Treat stale runtime build metadata as a blocker.
  --boardSummary            Print a short secret-free Agent Link Board summary.
  --sendCall                Send a formal E2E test call to Agent Link Board only when ready.
  --forceCall               Allow --sendCall to replace an existing board call.
  --clearStaleCall          Clear the existing Mac formal E2E board call only when
                            this checklist is not ready and the active call matches
                            Mac Codex -> Windows Codex formal Mac host E2E.
  --json                    Print one machine-readable JSON object.
  --help, -h                Show this help without probing anything.

JSON output:
  commands.macHostSafeStartCommand
                            Safe local foreground start command preserving the
                            checked port. It uses --promptPassword and never
                            embeds --password.
  commands.macMaxFpsSafeStartCommand
                            Safe local foreground start command for the formal
                            60Hz target. It uses --promptPassword, never embeds
                            --password, and does not send input.
  commands.macHostStopCommand
                            Secret-free local stop command for the currently
                            checked Mac host before loading the LaunchAgent. It
                            does not authenticate or request a password.
  commands.macLaunchAgentLoadCommand
                            Manual launchctl bootstrap command for loading the
                            standard Mac host LaunchAgent.
  commands.macLaunchAgentPrintCommand
                            Manual launchctl print command for verifying the
                            standard Mac host LaunchAgent status.
  commands.macHostReadinessCommand
                            Secret-free low-risk Mac host readiness command.
                            It reads host and Agent Link Board state only,
                            prints a board summary, and does not request a
                            password.
  commands.macFormalLocalSmokeCommand
                            Safe local command for H.264/PCM/input-log smoke
                            before asking Windows to run the longer formal E2E.
                            It uses --promptPassword and never embeds --password.
  commands.mediaReadinessBoardSummary
                            Safe local command for refreshing the Mac H.264/PCM
                            media baseline before long formal E2E runs.
                            It uses --promptPassword and never embeds --password.
  commands.macHostMediaCommand
                            Stable alias for the same safe local media baseline
                            command exposed as MacHostMedia= in board summaries.
                            It uses --promptPassword and never embeds --password.
  commands.macLaunchAgentPlanCommand
                            Secret-free LaunchAgent dry-run planner command.
                            It prints a plist plan and manual load commands
                            without writing files, loading launchctl, starting
                            Mac host, or requesting a password.
  commands.macMaxFpsPlanCommand
                            Secret-free LaunchAgent dry-run planner command
                            for the formal 60Hz target. It does not write
                            files, load launchctl, start Mac host, request a
                            password, or send input.
  commands.macUnattendedFormalCommand
                            Secret-free read-only formal unattended gate. It
                            turns missing or low LaunchAgent maxScreenFps into
                            a blocker without writing files, loading launchctl,
                            requesting a password, sending a call, or sending input.
  commands.macScriptHelpCommand
                            Secret-free Mac script help safety check. It runs
                            --help/-h coverage only and does not start services,
                            request passwords, read Agent Link Board, authenticate,
                            send calls, or send input.

Examples:
  node scripts/mac/check-mac-formal-e2e-status.mjs
  node scripts/mac/check-mac-formal-e2e-status.mjs --boardSummary
  node scripts/mac/check-mac-formal-e2e-status.mjs --sendCall
  node scripts/mac/check-mac-formal-e2e-status.mjs --clearStaleCall
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
      token === "--checkBoard" ||
      token === "--skipBoard" ||
      token === "--allowDirty" ||
      token === "--requireCurrentBuildId" ||
      token === "--boardSummary" ||
      token === "--sendCall" ||
      token === "--forceCall" ||
      token === "--clearStaleCall" ||
      token === "--json"
    ) {
      if (token === "--checkBoard") {
        args.skipBoard = false;
      } else {
        args[token.slice(2)] = true;
      }
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

function shellArg(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:@=-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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

function getCallTarget(report) {
  const host = report.resume.host || {};
  const lan = Array.isArray(host.lanAddresses) && host.lanAddresses.length > 0
    ? host.lanAddresses[0]
    : null;
  const targetHost = normalizedText(lan?.address || host.probe?.host || report.args.host) || "192.168.31.122";
  const targetPort = lan?.port || host.probe?.port || report.args.port || 43770;
  return {
    host: targetHost,
    port: targetPort,
    address: `${targetHost}:${targetPort}`,
  };
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

function isH264CapturePipelineActive(capabilities = {}) {
  const pipeline = normalizedText(capabilities.capturePipeline).toLowerCase();
  return pipeline.includes("h264");
}

function getMaxScreenFps(capabilities = {}) {
  const value = Number(capabilities.maxScreenFps);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

function isFormalFpsLimited(capabilities = {}) {
  const maxScreenFps = getMaxScreenFps(capabilities);
  return maxScreenFps !== null && maxScreenFps < formalTargetMaxScreenFps;
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
    checklist.push(blockItem("host", "Mac Host", `offline at ${host.probe?.host || args.host}:${host.probe?.port || args.port}`, host.error?.message || "", `Start formal host with ${makeSafeStartCommand(args)}.`));
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

  if (capabilities.h264Stream === true && isH264CapturePipelineActive(capabilities)) {
    checklist.push(okItem("video", "H.264 Video", `advertised; currentPipeline=${capabilities.capturePipeline || "unknown"}`));
  } else if (capabilities.h264Stream === true) {
    checklist.push(warnItem("video", "H.264 Video", `advertised but currentPipeline=${capabilities.capturePipeline || "unknown"}`, "", "Refresh the Mac media baseline before 5-10 minute formal H.264 validation."));
  } else {
    checklist.push(blockItem("video", "H.264 Video", `h264=${statusValue(capabilities.h264Stream)} pipeline=${capabilities.capturePipeline || "unknown"}`, "", "Fix ScreenCaptureKit/H.264 readiness before 5-10 minute formal video validation."));
  }

  if (isFormalFpsLimited(capabilities)) {
    const maxFps = getMaxScreenFps(capabilities);
    checklist.push(warnItem("fps-limit", "Screen FPS Limit", `remoteMax=${maxFps}Hz below formal target ${formalTargetMaxScreenFps}Hz`, "", `For foreground 60Hz restart use ${makeMacMaxFpsSafeStartCommand({ port: host.probe?.port || args.port })}; for persistent startup, dry-run max-FPS LaunchAgent plan: ${makeMacMaxFpsPlanCommand(host.probe?.port || args.port)}.`));
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

function formatChecklistFindings(checklist) {
  const blockers = summarizeChecklistIds(checklist, "blocker");
  const warnings = summarizeChecklistIds(checklist, "warning");
  return `blockers=${blockers} warnings=${warnings}`;
}

function summarizeChecklistIds(checklist, status) {
  const ids = [...new Set((checklist || [])
    .filter((entry) => entry.status === status)
    .map((entry) => entry.id)
    .filter(Boolean))];
  if (ids.length === 0) return "none";
  if (ids.length <= 4) return ids.join(",");
  return `${ids.slice(0, 4).join(",")}+${ids.length - 4}more`;
}

function formatGateItem(entry) {
  const summary = normalizedText(entry.summary);
  const detail = normalizedText(entry.detail);
  const next = normalizedText(entry.next);
  const parts = [`${entry.label || entry.id}: ${summary || entry.status}`];
  if (detail) parts.push(detail);
  if (next) parts.push(`Next: ${next}`);
  return parts.join("; ");
}

function formatSendCallRefusal(report) {
  const blockers = report.checklist.filter((entry) => entry.status === "blocker");
  const warnings = report.checklist.filter((entry) => entry.status === "warning");
  const blockerText = blockers.length > 0
    ? blockers.slice(0, 5).map(formatGateItem).join(" | ")
    : "none";
  const warningText = warnings.length > 0
    ? ` Warnings: ${warnings.slice(0, 3).map(formatGateItem).join(" | ")}.`
    : "";
  const buildDiff = report.resume.host?.buildDiff || {};
  const changedFiles = Array.isArray(buildDiff.changedHostRuntimeFiles) && buildDiff.changedHostRuntimeFiles.length > 0
    ? ` Changed runtime files: ${buildDiff.changedHostRuntimeFiles.slice(0, 6).join(", ")}.`
    : "";
  return [
    `Refusing to send formal E2E call because checklist is not ready: ${formatChecklistFindings(report.checklist)} (counts blockers=${report.counts.blockers}, warnings=${report.counts.warnings}).`,
    `Blockers: ${blockerText}.`,
    changedFiles,
    warningText,
  ].join(" ").replace(/\s+/g, " ").trim();
}

function makeCallText(report) {
  const host = report.resume.host || {};
  const findings = formatChecklistFindings(report.checklist);
  const readinessText = report.readyToCall
    ? report.counts.warnings > 0 ? "ready with warnings" : "ready"
    : "needs attention";
  if (!host.online) {
    return [
      "Mac formal E2E is not ready: Mac host is offline.",
      `Checklist ${findings}.`,
      `Start with ${report.commands?.macHostSafeStartCommand || makeSafeStartCommand(report.args || {})}, then rerun the checklist.`,
      `For foreground formal 60Hz, use: ${report.commands?.macMaxFpsSafeStartCommand || makeMacMaxFpsSafeStartCommand(report.args || {})}.`,
      `For LaunchAgent transition, stop the current Mac host with: ${report.commands?.macHostStopCommand || makeMacHostStopCommand(report.args?.host, report.args?.port)}.`,
      `Then manually load the LaunchAgent with: ${report.commands?.macLaunchAgentLoadCommand || makeMacLaunchAgentLoadCommand()}.`,
      `Verify launchd state with: ${report.commands?.macLaunchAgentPrintCommand || makeMacLaunchAgentPrintCommand()}.`,
      `Plan safe reboot persistence first with: ${report.commands?.macLaunchAgentPlanCommand || "install-mac-host-launch-agent --boardSummary"}.`,
      `If targeting formal 60Hz, dry-run max-FPS planning first with: ${report.commands?.macMaxFpsPlanCommand || "install-mac-host-launch-agent --maxScreenFps 60 --boardSummary"}.`,
      `Before calling Windows for formal 60Hz, run the read-only unattended gate with: ${report.commands?.macUnattendedFormalCommand || "check-mac-unattended-status --requireLaunchAgentMaxFps --boardSummary"}.`,
      `When the host is online, run low-risk host readiness with: ${report.commands?.macHostReadinessCommand || "check-mac-host-readiness --checkBoard --boardSummary"}.`,
      `When the host is online, run local smoke first with: ${report.commands?.macFormalLocalSmokeCommand || "check-mac-formal-local-smoke --promptPassword --boardSummary"}.`,
      `When the host is online, refresh the media baseline with: ${report.commands?.macHostMediaCommand || report.commands?.mediaReadinessBoardSummary || "check-mac-host-readiness --probeMedia --boardSummary"}.`,
      `If only this summary is available, verify Mac script help safety with: ${report.commands?.macScriptHelpCommand || makeMacScriptHelpCommand()}.`,
    ].join(" ");
  }
  const address = formatHostAddress(host);
  return [
    `Mac formal E2E ${readinessText}: host=${address}, repo=${report.resume.currentBuildId || "unknown"}, runtimeBuild=${host.runtime?.buildId || "unknown"}, inputMode=${host.inputMode || "unknown"}.`,
    `Permissions screen=${statusValue(host.permissions?.screenRecording)} accessibility=${statusValue(host.permissions?.accessibility)} inputMonitoring=${statusValue(host.permissions?.inputMonitoring)}; h264=${statusValue(host.capabilities?.h264Stream)} pipeline=${host.capabilities?.capturePipeline || "unknown"} audio=${host.capabilities?.audioMode || statusValue(host.capabilities?.audio)}.`,
    `Checklist ${findings}.`,
    `For foreground formal 60Hz, use: ${report.commands?.macMaxFpsSafeStartCommand || makeMacMaxFpsSafeStartCommand(report.args || {})}.`,
    `For LaunchAgent transition, stop the current Mac host with: ${report.commands?.macHostStopCommand || makeMacHostStopCommand(report.args?.host, report.args?.port)}.`,
    `Then manually load the LaunchAgent with: ${report.commands?.macLaunchAgentLoadCommand || makeMacLaunchAgentLoadCommand()}.`,
    `Verify launchd state with: ${report.commands?.macLaunchAgentPrintCommand || makeMacLaunchAgentPrintCommand()}.`,
    `If this Mac should stay ready after reboot, review the dry-run LaunchAgent plan with: ${report.commands?.macLaunchAgentPlanCommand || "install-mac-host-launch-agent --boardSummary"}.`,
    `If targeting formal 60Hz, review the max-FPS dry-run plan with: ${report.commands?.macMaxFpsPlanCommand || "install-mac-host-launch-agent --maxScreenFps 60 --boardSummary"}.`,
    `Before calling Windows for formal 60Hz, run the read-only unattended gate with: ${report.commands?.macUnattendedFormalCommand || "check-mac-unattended-status --requireLaunchAgentMaxFps --boardSummary"}.`,
    `Before long formal runs, run low-risk host readiness with: ${report.commands?.macHostReadinessCommand || "check-mac-host-readiness --checkBoard --boardSummary"}.`,
    `Before long formal runs, run local H.264/PCM/input-log smoke with: ${report.commands?.macFormalLocalSmokeCommand || "check-mac-formal-local-smoke --promptPassword --boardSummary"}.`,
    `Before long formal runs, refresh the Mac media baseline with: ${report.commands?.macHostMediaCommand || report.commands?.mediaReadinessBoardSummary || "check-mac-host-readiness --probeMedia --boardSummary"}.`,
    `If only this summary is available, verify Mac script help safety with: ${report.commands?.macScriptHelpCommand || makeMacScriptHelpCommand()}.`,
    "If ready, Windows should run discovery -> auth -> H.264 5-10 min -> audio -> clipboard -> input-log. Do not run inject unless the user explicitly confirms they are watching.",
  ].join(" ");
}

function makeBoardSummary(report) {
  const host = report.resume.host || {};
  const state = report.readyToCall
    ? report.counts.warnings > 0 ? "ready with warnings for Windows formal E2E" : "ready for Windows formal E2E"
    : `needs attention (${report.counts.blockers} blocker(s), ${report.counts.warnings} warning(s))`;
  const findings = formatChecklistFindings(report.checklist);
  if (!host.online) {
    return [
      `Mac formal E2E: ${state}; repo=${report.resume.currentBuildId || "unknown"} ${report.resume.git?.clean ? "clean" : "dirty"}; ${findings}.`,
      `Mac host offline at ${host.probe?.host || report.args.host}:${host.probe?.port || report.args.port}.`,
      `MacHostSafeStart=${report.commands?.macHostSafeStartCommand || makeSafeStartCommand(report.args || {})}.`,
      `MacMaxFpsSafeStart=${report.commands?.macMaxFpsSafeStartCommand || makeMacMaxFpsSafeStartCommand(report.args || {})}.`,
      `MacHostStop=${report.commands?.macHostStopCommand || makeMacHostStopCommand(report.args?.host, report.args?.port)}.`,
      `MacLaunchAgentLoad=${report.commands?.macLaunchAgentLoadCommand || makeMacLaunchAgentLoadCommand()}.`,
      `MacLaunchAgentPrint=${report.commands?.macLaunchAgentPrintCommand || makeMacLaunchAgentPrintCommand()}.`,
      "Next: start with MacHostSafeStart, or MacMaxFpsSafeStart for foreground 60Hz validation, then rerun checklist.",
      `MacLaunchAgentPlan=${report.commands?.macLaunchAgentPlanCommand || "install-mac-host-launch-agent --boardSummary"}.`,
      `MacMaxFpsPlan=${report.commands?.macMaxFpsPlanCommand || "install-mac-host-launch-agent --maxScreenFps 60 --boardSummary"}.`,
      `MacUnattendedFormal=${report.commands?.macUnattendedFormalCommand || "check-mac-unattended-status --requireLaunchAgentMaxFps --boardSummary"}.`,
      `MacHostReadiness=${report.commands?.macHostReadinessCommand || "check-mac-host-readiness --checkBoard --boardSummary"}.`,
      `MacFormalLocalSmoke=${report.commands?.macFormalLocalSmokeCommand || "check-mac-formal-local-smoke --promptPassword --boardSummary"}.`,
      `MacHostMedia=${report.commands?.macHostMediaCommand || report.commands?.mediaReadinessBoardSummary || "check-mac-host-readiness --probeMedia --boardSummary"}.`,
      `MacScriptHelp=${report.commands?.macScriptHelpCommand || makeMacScriptHelpCommand()}.`,
      "Do not send passwords on Agent Link Board; inject requires explicit user confirmation.",
    ].join(" ");
  }
  return [
    `Mac formal E2E: ${state}; host=${formatHostAddress(host)}; repo=${report.resume.currentBuildId || "unknown"} ${report.resume.git?.clean ? "clean" : "dirty"}; runtimeBuild=${host.runtime?.buildId || "unknown"}; inputMode=${host.inputMode || "unknown"}; ${findings}.`,
    `Permissions screen=${statusValue(host.permissions?.screenRecording)} accessibility=${statusValue(host.permissions?.accessibility)} inputMonitoring=${statusValue(host.permissions?.inputMonitoring)}; h264=${statusValue(host.capabilities?.h264Stream)}; pipeline=${host.capabilities?.capturePipeline || "unknown"}; audio=${host.capabilities?.audioMode || statusValue(host.capabilities?.audio)}; ${formatBuildDiff(host.buildDiff)}.`,
    `MacHostSafeStart=${report.commands?.macHostSafeStartCommand || makeSafeStartCommand(report.args || {})}.`,
    `MacMaxFpsSafeStart=${report.commands?.macMaxFpsSafeStartCommand || makeMacMaxFpsSafeStartCommand(report.args || {})}.`,
    `MacHostStop=${report.commands?.macHostStopCommand || makeMacHostStopCommand(report.args?.host, report.args?.port)}.`,
    `MacLaunchAgentLoad=${report.commands?.macLaunchAgentLoadCommand || makeMacLaunchAgentLoadCommand()}.`,
    `MacLaunchAgentPrint=${report.commands?.macLaunchAgentPrintCommand || makeMacLaunchAgentPrintCommand()}.`,
    `MacLaunchAgentPlan=${report.commands?.macLaunchAgentPlanCommand || "install-mac-host-launch-agent --boardSummary"}.`,
    `MacMaxFpsPlan=${report.commands?.macMaxFpsPlanCommand || "install-mac-host-launch-agent --maxScreenFps 60 --boardSummary"}.`,
    `MacUnattendedFormal=${report.commands?.macUnattendedFormalCommand || "check-mac-unattended-status --requireLaunchAgentMaxFps --boardSummary"}.`,
    `MacHostReadiness=${report.commands?.macHostReadinessCommand || "check-mac-host-readiness --checkBoard --boardSummary"}.`,
    `MacFormalLocalSmoke=${report.commands?.macFormalLocalSmokeCommand || "check-mac-formal-local-smoke --promptPassword --boardSummary"}.`,
    `MacHostMedia=${report.commands?.macHostMediaCommand || report.commands?.mediaReadinessBoardSummary || "check-mac-host-readiness --probeMedia --boardSummary"}.`,
    `MacScriptHelp=${report.commands?.macScriptHelpCommand || makeMacScriptHelpCommand()}.`,
    "Formal path: Windows discovery -> auth -> H.264 5-10 min -> audio -> clipboard -> input-log; no inject without explicit user confirmation.",
    "Do not send passwords on Agent Link Board.",
  ].join(" ");
}

function makeCommands(report) {
  const host = report.resume.host || {};
  const probeHost = normalizedText(host.probe?.host || report.args.host) || defaults.host;
  const probePort = host.probe?.port || report.args.port || defaults.port;
  const mediaReadinessCommand = [
    "node",
    "scripts/mac/check-mac-host-readiness.mjs",
    "--host",
    shellArg(probeHost),
    "--port",
    String(probePort),
    "--checkBoard",
    "--probeMedia",
    "--probeMediaResourceSample",
    "--promptPassword",
    "--boardSummary",
  ].join(" ");
  return {
    macHostSafeStartCommand: makeSafeStartCommand({ port: probePort }),
    macMaxFpsSafeStartCommand: makeMacMaxFpsSafeStartCommand({ port: probePort }),
    macHostStopCommand: makeMacHostStopCommand(probeHost, probePort),
    macLaunchAgentLoadCommand: makeMacLaunchAgentLoadCommand(),
    macLaunchAgentPrintCommand: makeMacLaunchAgentPrintCommand(),
    macLaunchAgentPlanCommand: [
      "node",
      "scripts/mac/install-mac-host-launch-agent.mjs",
      "--port",
      String(probePort),
      "--boardSummary",
    ].join(" "),
    macMaxFpsPlanCommand: makeMacMaxFpsPlanCommand(probePort),
    macUnattendedFormalCommand: makeMacUnattendedFormalCommand(probeHost, probePort),
    macHostReadinessCommand: makeMacHostReadinessCommand(probeHost, probePort),
    macFormalLocalSmokeCommand: [
      "node",
      "scripts/mac/check-mac-formal-local-smoke.mjs",
      "--host",
      shellArg(probeHost),
      "--port",
      String(probePort),
      "--promptPassword",
      "--boardSummary",
    ].join(" "),
    mediaReadinessBoardSummary: mediaReadinessCommand,
    macHostMediaCommand: mediaReadinessCommand,
    macScriptHelpCommand: makeMacScriptHelpCommand(),
  };
}

function makeMacScriptHelpCommand() {
  return "node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary";
}

function makeMacHostReadinessCommand(host, port) {
  return [
    "node",
    "scripts/mac/check-mac-host-readiness.mjs",
    "--host",
    shellArg(host || defaults.host),
    "--port",
    String(port || defaults.port),
    "--checkBoard",
    "--boardSummary",
  ].join(" ");
}

function makeSafeStartCommand(args = {}) {
  return [
    "node",
    "scripts/mac/start-mac-host.mjs",
    "--promptPassword",
    "--requirePassword",
    "--host",
    "0.0.0.0",
    "--port",
    String(args.port || defaults.port),
  ].join(" ");
}

function makeMacMaxFpsSafeStartCommand(args = {}) {
  return [
    "node",
    "scripts/mac/start-mac-host.mjs",
    "--promptPassword",
    "--requirePassword",
    "--host",
    "0.0.0.0",
    "--port",
    String(args.port || defaults.port),
    "--maxScreenFps",
    String(formalTargetMaxScreenFps),
  ].join(" ");
}

function makeMacHostStopCommand(host, port) {
  return [
    "node",
    "scripts/mac/start-mac-host.mjs",
    "--stop",
    "--host",
    shellArg(host || defaults.host),
    "--port",
    String(port || defaults.port),
  ].join(" ");
}

function defaultLaunchAgentPath() {
  return `${os.homedir()}/Library/LaunchAgents/com.lan-dual-control.mac-host.plist`;
}

function makeMacLaunchAgentLoadCommand() {
  return `launchctl bootstrap gui/$(id -u) ${shellArg(defaultLaunchAgentPath())}`;
}

function makeMacLaunchAgentPrintCommand() {
  return "launchctl print gui/$(id -u)/com.lan-dual-control.mac-host";
}

function makeMacMaxFpsPlanCommand(port) {
  return [
    "node",
    "scripts/mac/install-mac-host-launch-agent.mjs",
    "--port",
    String(port || defaults.port),
    "--maxScreenFps",
    String(formalTargetMaxScreenFps),
    "--boardSummary",
  ].join(" ");
}

function makeMacUnattendedFormalCommand(host, port) {
  return [
    "node",
    "scripts/mac/check-mac-unattended-status.mjs",
    "--host",
    shellArg(host || defaults.host),
    "--port",
    String(port || defaults.port),
    "--requireLaunchAgentMaxFps",
    "--requireLaunchAgentLoaded",
    "--boardSummary",
  ].join(" ");
}

function makeCallPayload(report) {
  const host = report.resume.host || {};
  const target = getCallTarget(report);
  const command = [
    "node scripts/windows/check-mac-formal-e2e.mjs",
    "--discover",
    "--discoverNoLocalSubnets",
    "--host",
    target.host,
    "--port",
    String(target.port),
    "--promptPassword",
  ].join(" ");
  return {
    status: "CALLING",
    from: formalE2eCallIdentity.from,
    need: formalE2eCallIdentity.need,
    goal: formalE2eCallIdentity.goal,
    environment: `Mac host ${target.address}; runtimeBuild=${host.runtime?.buildId || "unknown"}; inputMode=${host.inputMode || "unknown"}`,
    connection: target.address,
    command,
    expected: "Windows 发现 Mac host 后由用户本机隐藏输入正式密码，执行 H.264 5-10 分钟、系统音频、文本/文件剪贴板和 input-log 验收；不要执行 inject。",
    ask: "请连接该正式 Mac host 做无密发现和正式验收；密码不要发在联络板，inject 只有用户另行明确确认后才可执行。",
    owner: "Windows Codex",
    timeout: "用户在场时执行",
  };
}

function isActiveBoardCall(call) {
  if (!call) return false;
  const status = normalizedText(call.status).toLowerCase();
  if (!status) return true;
  return !["done", "completed", "complete", "cancelled", "canceled", "resolved", "closed"].includes(status);
}

function normalizeCurrentBoardCall(call) {
  if (!call || typeof call !== "object") {
    return {
      active: false,
      raw: "",
    };
  }
  const currentCall = {
    active: isActiveBoardCall(call),
    raw: JSON.stringify(call),
  };
  for (const key of ["status", "goal", "from", "need", "environment", "connection", "command", "expected", "actual", "ask", "blockedBy", "owner", "timeout", "updatedAt"]) {
    const value = normalizedText(call[key]);
    if (value) currentCall[key] = value;
  }
  return currentCall;
}

function getCurrentBoardCall(args) {
  const stateReader = `
const server = process.argv[1];
const timeoutMs = Number(process.argv[2] || 5000);
const token = process.env.CODEX_LINK_TOKEN || "";
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
try {
  const response = await fetch(new URL("/api/state", server), {
    cache: "no-store",
    signal: controller.signal,
    headers: token ? { "X-Codex-Link-Token": token } : {},
  });
  const text = await response.text();
  if (!response.ok) throw new Error(response.status + ": " + text);
  console.log(text || "{}");
} finally {
  clearTimeout(timer);
}
`;
  const result = spawnSync(process.execPath, [
    "-e",
    stateReader,
    args.server,
    String(Math.max(args.timeoutMs + 2000, 5000)),
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(args.timeoutMs + 2000, 5000),
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Could not confirm Agent Link Board current call before sending: ${String(result.stderr || result.stdout || "").trim()}`);
  }
  try {
    const state = JSON.parse(String(result.stdout || "{}"));
    return normalizeCurrentBoardCall(state.currentCall);
  } catch (error) {
    throw new Error(`Could not parse Agent Link Board state before sending: ${error.message}`);
  }
}

function isMatchingMacFormalE2eCall(call) {
  return Boolean(
    call?.active &&
    normalizedText(call.from) === formalE2eCallIdentity.from &&
    normalizedText(call.need) === formalE2eCallIdentity.need &&
    normalizedText(call.goal) === formalE2eCallIdentity.goal
  );
}

function formatBoardCallLabel(call) {
  if (!call?.active) return "none";
  const parts = [
    call.status || "status unknown",
    call.from ? `from=${call.from}` : "",
    call.need ? `need=${call.need}` : "",
    call.goal ? `goal=${call.goal}` : call.raw || "",
  ].filter(Boolean);
  return parts.join(" ");
}

function clearCurrentBoardCall(args) {
  const result = spawnSync(process.execPath, [
    "scripts/codex-link-client.mjs",
    "--server",
    args.server,
    "clear-call",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(args.timeoutMs + 2000, 5000),
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Could not clear Agent Link Board call: ${String(result.stderr || result.stdout || "").trim()}`);
  }
  return String(result.stdout || "").trim();
}

function clearStaleCall(report, args) {
  if (args.skipBoard) {
    throw new Error("Cannot clear a stale Agent Link Board call when --skipBoard is set.");
  }
  const currentCall = getCurrentBoardCall(args);
  report.boardCallBeforeClear = currentCall;
  if (!currentCall.active) {
    return {
      ok: true,
      cleared: false,
      reason: "No active Agent Link Board call to clear.",
      previousCall: currentCall,
    };
  }
  if (!isMatchingMacFormalE2eCall(currentCall)) {
    return {
      ok: true,
      cleared: false,
      reason: `Active call does not match Mac formal E2E; left it untouched: ${formatBoardCallLabel(currentCall)}.`,
      previousCall: currentCall,
    };
  }
  if (report.readyToCall) {
    return {
      ok: true,
      cleared: false,
      reason: "Mac formal E2E checklist is ready, so the matching board call is still valid.",
      previousCall: currentCall,
    };
  }
  const clearResult = clearCurrentBoardCall(args);
  return {
    ok: true,
    cleared: true,
    reason: `Cleared stale Mac formal E2E board call because checklist is not ready: ${formatChecklistFindings(report.checklist)} (counts blockers=${report.counts.blockers}, warnings=${report.counts.warnings}).`,
    previousCall: currentCall,
    result: clearResult || "ok",
  };
}

function sendCall(report, args) {
  if (!report.readyToCall) {
    throw new Error(formatSendCallRefusal(report));
  }
  const currentCall = getCurrentBoardCall(args);
  report.boardCallBeforeSend = currentCall;
  if (currentCall.active && !args.forceCall) {
    const owner = currentCall.from || currentCall.need || currentCall.owner || "unknown";
    const goal = currentCall.goal || currentCall.raw || "unknown goal";
    throw new Error(`Refusing to replace existing Agent Link Board call from ${owner}: ${goal}. Clear it or rerun with --forceCall only after coordinating on the board.`);
  }
  const payload = report.callPayload || makeCallPayload(report);
  const commandArgs = [
    "scripts/codex-link-client.mjs",
    "--server",
    args.server,
    "call",
    "--status",
    payload.status,
    "--from",
    payload.from,
    "--need",
    payload.need,
    "--goal",
    payload.goal,
    "--environment",
    payload.environment,
    "--connection",
    payload.connection,
    "--command",
    payload.command,
    "--expected",
    payload.expected,
    "--ask",
    payload.ask,
    "--owner",
    payload.owner,
    "--timeout",
    payload.timeout,
  ];
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: Math.max(args.timeoutMs + 2000, 5000),
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Could not send Agent Link Board call: ${String(result.stderr || result.stdout || "").trim()}`);
  }
  return String(result.stdout || "").trim();
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

function printClearStaleCallResult(report) {
  const result = report.clearedStaleCall || {};
  const prefix = result.cleared ? "OK" : "INFO";
  console.log(`[${prefix}] ${result.reason || "Stale call clear check completed."}`);
  if (result.previousCall?.active) {
    console.log(`[INFO] Previous call: ${formatBoardCallLabel(result.previousCall)}`);
  }
  if (!report.readyToCall) {
    console.log(`[WARN] Formal E2E still not ready: ${formatChecklistFindings(report.checklist)} (counts blockers=${report.counts.blockers}, warnings=${report.counts.warnings})`);
    console.log(`[INFO] ${report.callText}`);
  }
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
      forceCall: args.forceCall,
      clearStaleCall: args.clearStaleCall,
    },
    counts,
    checklist,
    resume,
  };
  report.commands = makeCommands(report);
  report.callText = makeCallText(report);
  report.boardSummary = makeBoardSummary(report);
  report.callPayload = makeCallPayload(report);
  return report;
}

function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  if (args.sendCall && args.clearStaleCall) {
    throw new Error("--sendCall and --clearStaleCall cannot be used together.");
  }
  const report = buildReport(args);
  if (args.clearStaleCall) {
    try {
      report.clearedStaleCall = clearStaleCall(report, args);
    } catch (error) {
      report.ok = false;
      report.clearedStaleCall = {
        ok: false,
        cleared: false,
        error: { message: error.message },
      };
      report.error = { message: error.message };
      if (!args.json) {
        throw error;
      }
    }
  }
  if (args.sendCall) {
    try {
      const sendResult = sendCall(report, args);
      report.sentCall = {
        ok: true,
        result: sendResult || "ok",
        payload: report.callPayload,
      };
    } catch (error) {
      report.ok = false;
      report.error = { message: error.message };
      if (!args.json) {
        throw error;
      }
    }
  }
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else if (args.clearStaleCall) {
    printClearStaleCallResult(report);
  } else if (args.sendCall) {
    console.log(`[OK] Sent formal E2E call to Agent Link Board: ${report.callPayload.connection}`);
    console.log(report.callText);
  } else {
    printReport(report);
  }
  const operationOk = args.clearStaleCall ? report.clearedStaleCall?.ok === true : report.ok;
  process.exitCode = operationOk ? 0 : 1;
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
