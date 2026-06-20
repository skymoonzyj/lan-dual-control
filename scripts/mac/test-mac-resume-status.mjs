#!/usr/bin/env node
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/check-mac-resume-status.mjs";
const manualUxChecklist = "connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics";

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  timeoutMs: 8000,
  requireOnline: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-resume-status.mjs [options]

Verifies check-mac-resume-status help and JSON output shape. Offline behavior
is always covered on a reserved port. The online shape is checked when the
configured Mac host is reachable, or required with --requireOnline.

Options:
  --host <host>       Mac host probe host. Default: 127.0.0.1
  --port <port>       Mac host probe port. Default: 43770
  --timeoutMs <ms>    Command timeout. Default: 8000
  --requireOnline     Fail when the configured Mac host is not reachable
  --help, -h          Show this help without running checks
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
    if (token === "--requireOnline") {
      args.requireOnline = true;
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
    throw new Error(`Unknown argument: ${token}`);
  }
  args.host = String(args.host || defaults.host).trim();
  return args;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function run(args, extraArgs = []) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function runAsync(args, extraArgs = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...extraArgs], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, args.timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve({
        status,
        signal,
        stdout,
        stderr,
        error: signal === "SIGTERM" ? { message: `timeout after ${args.timeoutMs}ms` } : null,
      });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        status: null,
        signal: null,
        stdout,
        stderr,
        error,
      });
    });
  });
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function assertNoPasswordLeak(result, label) {
  const combined = `${result.stdout}\n${result.stderr}`;
  assert(!combined.includes("super-secret-resume-password"), `${label} leaked password text`);
  assert(!combined.includes("fake-board-token"), `${label} leaked fake board token`);
}

function assertMacUnattendedFreshness(freshness, expectedStatus, label) {
  assert(freshness?.status === expectedStatus, `${label} should expose ${expectedStatus} freshness`);
  assert(typeof freshness.checkedAt === "string" && freshness.checkedAt.length > 0, `${label} should expose checkedAt`);
  assert(Number.isFinite(freshness.checkedAgeMs), `${label} should expose numeric checkedAgeMs`);
  assert(freshness.thresholdMs === 600000, `${label} should expose the 10 minute freshness threshold`);
  assert(["MacUnattendedHealth", "MacPowerHealth"].includes(freshness.source), `${label} should expose a safe source label`);
}

function assertMacHostAuthPath(authPath, expected, label) {
  assert(authPath?.status === expected.status, `${label} should expose MacHostAuthPath status`);
  assert(authPath?.reason === expected.reason, `${label} should expose MacHostAuthPath reason`);
  assert(authPath?.mode === expected.mode, `${label} should expose MacHostAuthPath mode`);
  assert(authPath?.next === expected.next, `${label} should expose MacHostAuthPath next`);
}

function assertBoardSummaryShape(text, label) {
  assert(/Mac resume:/.test(text), `${label} should start with Mac resume summary`);
  assert(/repo=/.test(text), `${label} should include repo state`);
  assert(/heartbeatWatcher=/.test(text), `${label} should include Mac heartbeat watcher status`);
  assert(/heartbeatWatcher=[^;]*server=/.test(text), `${label} should include Mac heartbeat watcher server`);
  assert(/heartbeatWatcher=[^;]*configMismatch=/.test(text), `${label} should include Mac heartbeat watcher configuration mismatch state`);
  assert(/lastHeartbeat=/.test(text), `${label} should include the last Mac heartbeat watcher observation`);
  assert(/MacHeartbeatFreshness=/.test(text), `${label} should include stable Mac heartbeat freshness`);
  assert(/MacHeartbeatHealth=/.test(text), `${label} should include stable Mac heartbeat health`);
  assert(/MacHeartbeatHealth=(ok|blocked|warning|unknown)\b/.test(text), `${label} should include a parseable Mac heartbeat health status`);
  assert(/MacHeartbeatHealth=[^;.]*(?: |^)reason=/.test(text), `${label} should include Mac heartbeat health reason`);
  assert(/MacCodexHealth=/.test(text), `${label} should include stable Mac Codex health`);
  assert(/MacCodexHealth=(ok|blocked|warning|unknown)\b/.test(text), `${label} should include a parseable Mac Codex health status`);
  assert(/MacCodexHealth=[^;.]*(?: |^)reason=/.test(text), `${label} should include Mac Codex health reason`);
  assert(/MacCodexHealth=[^;.]*(?: |^)codexStatus=/.test(text), `${label} should include the Mac Codex board status`);
  assert(/media baseline/i.test(text), `${label} should include media baseline guidance`);
  assert(/check-mac-host-readiness\.mjs/.test(text), `${label} should include the media readiness command`);
  assert(/MacHostMedia=/.test(text), `${label} should include stable Mac host media baseline guidance`);
  assert(/MacHostMedia=.*check-mac-host-readiness\.mjs/.test(text), `${label} should include the stable Mac host media command`);
  assert(/MacFormalLocalSmoke=/.test(text), `${label} should include Mac formal local smoke guidance`);
  assert(/check-mac-formal-local-smoke\.mjs/.test(text), `${label} should include the Mac formal local smoke command`);
  assert(/MacFormalE2E=/.test(text), `${label} should include Mac formal E2E preflight guidance`);
  assert(/check-mac-formal-e2e-status\.mjs/.test(text), `${label} should include the Mac formal E2E preflight command`);
  assert(/MacHostSafeStart=/.test(text), `${label} should include Mac host safe start guidance`);
  assert(/start-mac-host\.mjs/.test(text), `${label} should include the Mac host safe start command`);
  assert(/--promptPassword/.test(text), `${label} should make password prompting explicit for safe start`);
  assert(/--requirePassword/.test(text), `${label} should require a password for safe start`);
  assert(/MacMaxFpsSafeStart=/.test(text), `${label} should include Mac foreground 60Hz safe start guidance`);
  assert(/MacMaxFpsSafeStart=.*start-mac-host\.mjs/.test(text), `${label} should use start-mac-host for foreground 60Hz safe start`);
  assert(/MacMaxFpsSafeStart=.*--maxScreenFps 60/.test(text), `${label} should include the formal 60Hz safe start command`);
  assert(/MacHostStop=/.test(text), `${label} should include current Mac host stop guidance before LaunchAgent load`);
  assert(/MacHostStop=.*start-mac-host\.mjs/.test(text), `${label} should use start-mac-host for host stop guidance`);
  assert(/MacHostStop=.*--stop/.test(text), `${label} should make the stop action explicit`);
  assert(/MacLaunchAgentLoad=/.test(text), `${label} should include manual LaunchAgent load guidance`);
  assert(/MacLaunchAgentLoad=.*launchctl bootstrap/.test(text), `${label} should use launchctl bootstrap for manual load guidance`);
  assert(/MacLaunchAgentPrint=/.test(text), `${label} should include manual LaunchAgent verification guidance`);
  assert(/MacLaunchAgentPrint=.*launchctl print/.test(text), `${label} should use launchctl print for manual verification guidance`);
  assert(/MacHostReadiness=/.test(text), `${label} should include low-risk Mac host readiness guidance`);
  assert(/MacHostReadiness=.*check-mac-host-readiness\.mjs/.test(text), `${label} should include the low-risk Mac host readiness command`);
  assert(/MacUnattendedStatus=/.test(text), `${label} should include Mac unattended/startup guidance`);
  assert(/check-mac-unattended-status\.mjs/.test(text), `${label} should include the Mac unattended/startup command`);
  assert(/MacUnattendedSendStatus=/.test(text), `${label} should include Mac unattended board-status refresh guidance`);
  assert(/MacUnattendedSendStatus=.*--sendStatus/.test(text), `${label} should make the unattended board-status refresh explicit`);
  assert(/MacPowerPlan=/.test(text), `${label} should include Mac power settings dry-run guidance`);
  assert(/MacPowerPlan=.*plan-mac-power-settings\.mjs/.test(text), `${label} should include the Mac power settings planner command`);
  assert(/MacRemoteAudioPlan=/.test(text), `${label} should include Mac remote-only audio safety guidance`);
  assert(/MacRemoteAudioPlan=.*plan-mac-remote-audio\.mjs/.test(text), `${label} should include the Mac remote-only audio planner command`);
  assert(/MacInputSafetyPlan=/.test(text), `${label} should include Mac input safety plan guidance`);
  assert(/MacInputSafetyPlan=.*plan-mac-input-safety\.mjs/.test(text), `${label} should include the Mac input safety planner command`);
  assert(/MacUnattendedFormal=/.test(text), `${label} should include Mac unattended formal max-FPS guidance`);
  assert(/--requireLaunchAgentMaxFps/.test(text), `${label} should include the formal max-FPS gate`);
  assert(/MacLaunchAgentPlan=/.test(text), `${label} should include Mac LaunchAgent dry-run guidance`);
  assert(/install-mac-host-launch-agent\.mjs/.test(text), `${label} should include the Mac LaunchAgent planner command`);
  assert(/MacMaxFpsPlan=/.test(text), `${label} should include Mac max-FPS dry-run guidance`);
  assert(/--maxScreenFps 60/.test(text), `${label} should include the formal 60Hz max-FPS planner command`);
  assert(/MacClientPage=/.test(text), `${label} should include Mac client page status guidance`);
  assert(/start-mac-client\.mjs/.test(text), `${label} should include the Mac client page status command`);
  assert(/MacClientDiagnostics=/.test(text), `${label} should include Mac client diagnostics guidance`);
  assert(/check-mac-client-readiness\.mjs/.test(text), `${label} should include the Mac client readiness command`);
  assert(/MacClientManualChecklist=/.test(text), `${label} should include Mac client manual checklist guidance`);
  assert(/MacClientManualChecklist=.*手工清单/.test(text), `${label} should mention the Mac client manual checklist`);
  assert(/MacClientManualChecklist=.*连接\/视频\/音频\/剪贴板\/input_ack\/诊断/.test(text), `${label} should include the Mac client manual checklist items`);
  assert(/MacClientPasswordLocation=/.test(text), `${label} should include Mac client password location guidance`);
  assertMacClientPasswordLocationAction(
    String(text || "").split("MacClientPasswordLocation=")[1]?.split(". ")[0] || "",
    `${label} Mac client password location action`,
  );
  assert(/CopyDiagnostics=Mac client 事件日志点击/.test(text), `${label} should include Mac client copy diagnostics action`);
  assert(/MacClientDiscoverWindows=/.test(text), `${label} should include Mac client Windows discovery guidance`);
  assert(/discover-windows-hosts\.mjs/.test(text), `${label} should include the Mac client Windows discovery command`);
  assert(/WindowsHostStatus=/.test(text), `${label} should include Windows host status guidance`);
  assert(/WindowsHostStatus=.*start-windows-host\.mjs/.test(text), `${label} should include the Windows host status command`);
  assert(/WindowsHostReadiness=/.test(text), `${label} should include Windows host readiness guidance`);
  assert(/WindowsHostReadiness=.*check-windows-host-readiness\.mjs/.test(text), `${label} should include the Windows host readiness command`);
  assert(/MacClientReverseRehearsal=/.test(text), `${label} should include Mac client reverse rehearsal guidance`);
  assert(/ReverseRehearsal=/.test(text), `${label} should mention the discovery ReverseRehearsal line`);
  assert(/LAN008/.test(text), `${label} should mention the safe default-deny reverse-control response`);
  assert(/local loopback/.test(text), `${label} should keep reverse grant guidance on loopback`);
  assert(/MacClientFormalChecklist=/.test(text), `${label} should include Mac client formal checklist guidance`);
  assert(/check-mac-client-formal-status\.mjs/.test(text), `${label} should include the Mac client formal checklist command`);
  assert(/MacClientFormalChecklist=.*--discover/.test(text), `${label} should make Mac client formal checklist discover Windows safely`);
  assert(/MacClientFormalChecklist=.*--port 43770/.test(text), `${label} should keep the default Windows host port explicit for discovery`);
  assert(/MacClientFormalSmoke=/.test(text), `${label} should include Mac client formal smoke preflight guidance`);
  assert(/run-mac-client-formal-smoke\.mjs/.test(text), `${label} should include the Mac client formal smoke preflight command`);
  assert(/MacClientPromptPasswordSmoke=/.test(text), `${label} should include Mac client prompt-password smoke guidance`);
  assert(/MacClientPromptPasswordSmoke=.*run-mac-client-formal-smoke\.mjs/.test(text), `${label} should include the Mac client prompt-password smoke command`);
  assert(/MacClientPromptPasswordSmoke=.*--promptPassword/.test(text), `${label} should make the prompt-password smoke path explicit`);
  assert(/MacClientBrowserSelfTest=/.test(text), `${label} should include Mac client browser self-test guidance`);
  assert(/scripts\/mac\/test-mac-client-browser-self-test-wrapper\.mjs/.test(text), `${label} should include the Mac client browser self-test command`);
  assert(/MacHeartbeatOnce=/.test(text), `${label} should include Mac heartbeat one-shot guidance`);
  assert(/MacHeartbeatOnce=.*watch-mac-heartbeat\.mjs/.test(text), `${label} should include the Mac heartbeat one-shot command`);
  assert(/MacHeartbeatWatch=/.test(text), `${label} should include Mac heartbeat continuous watcher guidance`);
  assert(/MacHeartbeatWatch=.*watch-mac-heartbeat\.mjs/.test(text), `${label} should include the Mac heartbeat continuous watcher command`);
  assert(/MacHeartbeatStart=/.test(text), `${label} should include Mac heartbeat background start guidance`);
  assert(/MacHeartbeatStart=.*start-mac-heartbeat-watcher\.mjs/.test(text), `${label} should include the Mac heartbeat background start command`);
  assert(/MacHeartbeatRefresh=/.test(text), `${label} should include Mac heartbeat unattended-refresh watcher status`);
  assert(/MacHeartbeatRefresh=(enabled|disabled|unknown)\b/.test(text), `${label} should include a parseable Mac heartbeat unattended-refresh state`);
  assert(/MacHeartbeatRefreshOnce=/.test(text), `${label} should include Mac heartbeat one-shot unattended-refresh guidance`);
  assert(/MacHeartbeatRefreshOnce=.*watch-mac-heartbeat\.mjs/.test(text), `${label} should include the Mac heartbeat one-shot unattended-refresh command`);
  assert(/MacHeartbeatRefreshStart=/.test(text), `${label} should include Mac heartbeat background unattended-refresh start guidance`);
  assert(/MacHeartbeatRefreshStart=.*start-mac-heartbeat-watcher\.mjs/.test(text), `${label} should include the Mac heartbeat background unattended-refresh start command`);
  assert(/MacHeartbeatRefreshRestart=/.test(text), `${label} should include Mac heartbeat background unattended-refresh restart guidance`);
  assert(/MacHeartbeatRefreshRestart=.*start-mac-heartbeat-watcher\.mjs/.test(text), `${label} should include the Mac heartbeat background unattended-refresh restart command`);
  assert(/MacHeartbeatStatus=/.test(text), `${label} should include Mac heartbeat background status guidance`);
  assert(/MacHeartbeatStatus=.*start-mac-heartbeat-watcher\.mjs/.test(text), `${label} should include the Mac heartbeat background status command`);
  assert(/MacHeartbeatStop=/.test(text), `${label} should include Mac heartbeat background stop guidance`);
  assert(/MacHeartbeatStop=.*start-mac-heartbeat-watcher\.mjs/.test(text), `${label} should include the Mac heartbeat background stop command`);
  assert(/MacManualUxStatus=/.test(text), `${label} should include Mac manual UX status guidance`);
  assert(/MacManualUxStatus=.*check-mac-manual-ux-status\.mjs/.test(text), `${label} should include the Mac manual UX status command`);
  assert(/MacScriptHelp=/.test(text), `${label} should include Mac script help safety guidance`);
  assert(/test-mac-script-help\.mjs/.test(text), `${label} should include the Mac script help command`);
  assert(/Do not send passwords/.test(text), `${label} should include password safety note`);
  assert(/--confirmUserWatching/.test(text), `${label} should include inject confirmation flag guidance`);
  assert(!/super-secret-resume-password/.test(text), `${label} should not leak secret-like text`);
}

function assertMediaReadinessCommand(command, label) {
  assert(/check-mac-host-readiness\.mjs/.test(command), `${label} should use check-mac-host-readiness`);
  assert(command.includes("--checkBoard"), `${label} should read Agent Link Board`);
  assert(command.includes("--probeMedia"), `${label} should probe media`);
  assert(command.includes("--probeMediaResourceSample"), `${label} should request resource sampling`);
  assert(command.includes("--promptPassword"), `${label} should use a visible password prompt`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
}

function assertMacHostSafeStartCommand(command, label) {
  assert(/start-mac-host\.mjs/.test(command), `${label} should use start-mac-host`);
  assert(command.includes("--promptPassword"), `${label} should prompt visibly`);
  assert(command.includes("--requirePassword"), `${label} should require auth`);
  assert(command.includes("--host 0.0.0.0"), `${label} should bind for LAN access`);
  assert(command.includes("--port"), `${label} should keep the target port explicit`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacMaxFpsSafeStartCommand(command, label) {
  assertMacHostSafeStartCommand(command, label);
  assert(command.includes("--maxScreenFps 60"), `${label} should target the formal 60Hz foreground start`);
}

function assertMacHostStopCommand(command, label) {
  assert(/start-mac-host\.mjs/.test(command), `${label} should use start-mac-host`);
  assert(command.includes("--stop"), `${label} should stop the current local Mac host`);
  assert(command.includes("--host"), `${label} should keep the target host explicit`);
  assert(command.includes("--port"), `${label} should keep the target port explicit`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacResumeStatusCommand(command, label) {
  assert(/check-mac-resume-status\.mjs/.test(command), `${label} should use check-mac-resume-status`);
  assert(command.includes("--host"), `${label} should keep the target host explicit`);
  assert(command.includes("--port"), `${label} should keep the target port explicit`);
  assert(command.includes("--checkBoard"), `${label} should read Agent Link Board`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--forceCall"), `${label} should not replace an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("input_event"), `${label} should not send input`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacLaunchAgentLoadCommand(command, label) {
  assert(command.includes("launchctl bootstrap"), `${label} should use launchctl bootstrap`);
  assert(command.includes("$(id -u)"), `${label} should target the current GUI user`);
  assert(command.includes("com.lan-dual-control.mac-host.plist"), `${label} should name the checked LaunchAgent plist`);
  assert(!command.includes("LAN_DUAL_PASSWORD"), `${label} should not embed password environment`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("input_event"), `${label} should not send input`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacLaunchAgentPrintCommand(command, label) {
  assert(command.includes("launchctl print"), `${label} should use launchctl print`);
  assert(command.includes("$(id -u)"), `${label} should target the current GUI user`);
  assert(command.includes("com.lan-dual-control.mac-host"), `${label} should name the checked LaunchAgent label`);
  assert(!command.includes("LAN_DUAL_PASSWORD"), `${label} should not embed password environment`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("input_event"), `${label} should not send input`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacHostReadinessCommand(command, label) {
  assert(/check-mac-host-readiness\.mjs/.test(command), `${label} should use check-mac-host-readiness`);
  assert(command.includes("--checkBoard"), `${label} should read Agent Link Board`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--probeMedia"), `${label} should stay low-risk and not run media probes`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacFormalLocalSmokeCommand(command, label) {
  assert(/check-mac-formal-local-smoke\.mjs/.test(command), `${label} should use check-mac-formal-local-smoke`);
  assert(command.includes("--promptPassword"), `${label} should use a visible password prompt`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--json"), `${label} should default to one-line boardSummary output`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
}

function assertMacFormalE2eStatusCommand(command, label) {
  assert(/check-mac-formal-e2e-status\.mjs/.test(command), `${label} should use check-mac-formal-e2e-status`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--forceCall"), `${label} should not replace an Agent Link Board call`);
  assert(!command.includes("--clearStaleCall"), `${label} should not clear Agent Link Board calls`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("--json"), `${label} should default to one-line boardSummary output`);
}

function assertMacUnattendedStatusCommand(command, label) {
  assert(/check-mac-unattended-status\.mjs/.test(command), `${label} should use check-mac-unattended-status`);
  assert(command.includes("--host"), `${label} should keep the target host explicit`);
  assert(command.includes("--port"), `${label} should keep the target port explicit`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("--json"), `${label} should default to one-line boardSummary output`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacUnattendedSendStatusCommand(command, label) {
  assert(/check-mac-unattended-status\.mjs/.test(command), `${label} should use check-mac-unattended-status`);
  assert(command.includes("--host"), `${label} should keep the target host explicit`);
  assert(command.includes("--port"), `${label} should keep the target port explicit`);
  assert(command.includes("--server"), `${label} should keep the target Agent Link Board explicit`);
  assert(command.includes("--sendStatus"), `${label} should post the independent Mac Unattended board status`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--json"), `${label} should default to one-line boardSummary output`);
  assert(!command.includes("input_event"), `${label} should not send input`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacUnattendedFormalCommand(command, label) {
  assertMacUnattendedStatusCommand(command, label);
  assert(command.includes("--requireLaunchAgentMaxFps"), `${label} should require the formal LaunchAgent max-FPS gate`);
  assert(command.includes("--requireLaunchAgentLoaded"), `${label} should require the LaunchAgent to be loaded`);
  assert(!command.includes("--strict"), `${label} should not turn every warning into a blocker`);
}

function assertMacLaunchAgentPlanCommand(command, label) {
  assert(/install-mac-host-launch-agent\.mjs/.test(command), `${label} should use install-mac-host-launch-agent`);
  assert(command.includes("--port"), `${label} should keep the target port explicit`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--write"), `${label} should stay dry-run by default`);
  assert(!command.includes("--force"), `${label} should not overwrite files`);
  assert(!command.includes("launchctl"), `${label} should not run launchctl`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("--json"), `${label} should default to one-line boardSummary output`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacMaxFpsPlanCommand(command, label) {
  assertMacLaunchAgentPlanCommand(command, label);
  assert(command.includes("--maxScreenFps 60"), `${label} should target the formal 60Hz max-FPS plan`);
}

function assertMacPowerPlanCommand(command, label) {
  assert(/plan-mac-power-settings\.mjs/.test(command), `${label} should use plan-mac-power-settings`);
  assert(command.includes("--profile all"), `${label} should plan AC and battery settings`);
  assert(command.includes("--sleep 0"), `${label} should plan system sleep disablement`);
  assert(command.includes("--displaySleep 0"), `${label} should plan display sleep disablement`);
  assert(command.includes("--networkWake on"), `${label} should plan network wake`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--apply"), `${label} should stay dry-run by default`);
  assert(!command.includes("sudo"), `${label} should not request privileged shell execution`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("input_event"), `${label} should not send input`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacRemoteAudioPlanCommand(command, label) {
  assert(/plan-mac-remote-audio\.mjs/.test(command), `${label} should use plan-mac-remote-audio`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--apply"), `${label} should stay dry-run by default`);
  assert(!command.includes("sudo"), `${label} should not request privileged shell execution`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("input_event"), `${label} should not send input`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacInputSafetyPlanCommand(command, label) {
  assert(/plan-mac-input-safety\.mjs/.test(command), `${label} should use plan-mac-input-safety`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--apply"), `${label} should stay dry-run by default`);
  assert(!command.includes("sudo"), `${label} should not request privileged shell execution`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("input_event"), `${label} should not send input`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacClientDiagnosticsCommand(command, label) {
  assert(/check-mac-client-readiness\.mjs/.test(command), `${label} should use check-mac-client-readiness`);
  assert(command.includes("--probeClientServer"), `${label} should probe the local Mac client page`);
  assert(command.includes("--checkBoard"), `${label} should read Agent Link Board`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
}

function assertMacClientPageStatusCommand(command, label) {
  assert(/start-mac-client\.mjs/.test(command), `${label} should use start-mac-client`);
  assert(command.includes("--status"), `${label} should only check page status`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--allowExisting"), `${label} should not start or accept a page process`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
}

function assertMacClientDiscoverWindowsCommand(command, label) {
  assert(/discover-windows-hosts\.mjs/.test(command), `${label} should use discover-windows-hosts`);
  assert(command.includes("--checkBoard"), `${label} should read Agent Link Board for Windows LAN risk hints`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
}

function assertMacClientDiscoverWindowsCallCommand(command, label) {
  assert(/discover-windows-hosts\.mjs/.test(command), `${label} should use discover-windows-hosts`);
  assert(command.includes("--checkBoard"), `${label} should read Agent Link Board before sending a call`);
  assert(command.includes("--sendCall"), `${label} should explicitly send the Windows host readiness call`);
  assert(command.includes("--boardSummary"), `${label} should keep the operator-visible summary`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--forceCall"), `${label} should not force-replace Agent Link Board calls`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("input_event"), `${label} should not mention input events`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertWindowsHostStatusCommand(command, label) {
  assert(/scripts\/windows\/start-windows-host\.mjs/.test(command), `${label} should use Windows host status`);
  assert(command.includes("--status"), `${label} should be a status-only command`);
  assert(command.includes("--host 127.0.0.1"), `${label} should run on Windows loopback`);
  assert(command.includes("--port 43770"), `${label} should keep the default Windows host port explicit`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--forceCall"), `${label} should not replace an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("input_event"), `${label} should not mention input events`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertWindowsHostReadinessCommand(command, label) {
  assert(/scripts\/windows\/check-windows-host-readiness\.mjs/.test(command), `${label} should use Windows host readiness`);
  assert(command.includes("--host 127.0.0.1"), `${label} should run on Windows loopback`);
  assert(command.includes("--port 43770"), `${label} should keep the default Windows host port explicit`);
  assert(command.includes("--checkBoard"), `${label} should read Agent Link Board for current hints`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--forceCall"), `${label} should not replace an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("input_event"), `${label} should not mention input events`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacClientReverseRehearsalAction(text, label) {
  assert(String(text || "").includes("MacClientDiscoverWindows"), `${label} should start from discovery`);
  assert(String(text || "").includes("ReverseRehearsal="), `${label} should point to discovery ReverseRehearsal output`);
  assert(String(text || "").includes("LAN008"), `${label} should expect the safe default-deny response`);
  assert(String(text || "").includes("local loopback"), `${label} should keep the Windows grant loopback-only`);
  assert(String(text || "").includes("临时授权已使用"), `${label} should include the consumed one-time grant result`);
  assert(!String(text || "").includes("LAN_DUAL_PASSWORD"), `${label} should not mention password env vars`);
  assert(!String(text || "").includes("--password"), `${label} should not embed a password argument`);
  assert(!String(text || "").includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!String(text || "").includes("inject"), `${label} should not instruct injection`);
}

function assertMacClientManualChecklistAction(text, label) {
  assert(String(text || "").includes("手工清单"), `${label} should mention the manual checklist`);
  assert(String(text || "").includes("连接/视频/音频/剪贴板/input_ack/诊断"), `${label} should include the manual checklist items`);
  assert(String(text || "").includes("复制诊断"), `${label} should mention copy diagnostics`);
  assert(String(text || "").includes("连接密码"), `${label} should mention password safety`);
  assert(!String(text || "").includes("LAN_DUAL_PASSWORD"), `${label} should not mention password env vars`);
  assert(!String(text || "").includes("--password"), `${label} should not embed a password argument`);
  assert(!String(text || "").includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!String(text || "").includes("input_event"), `${label} should not mention input events`);
  assert(!String(text || "").includes("LAN_DUAL_INPUT_MODE=inject"), `${label} should not instruct injection mode`);
}

function assertMacClientPasswordLocationAction(text, label) {
  assert(String(text || "").includes("Mac 页面密码框"), `${label} should mention the Mac page password field`);
  assert(String(text || "").includes("Windows 临时密码"), `${label} should mention Windows temporary password location`);
  assert(String(text || "").includes("不要发到通讯板"), `${label} should keep Agent Link Board password safety visible`);
  assert(String(text || "").includes("不保存到最近连接或诊断"), `${label} should mention storage and diagnostics safety`);
  assert(!String(text || "").includes("LAN_DUAL_PASSWORD"), `${label} should not mention password env vars`);
  assert(!String(text || "").includes("--password"), `${label} should not embed a password argument`);
  assert(!String(text || "").includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!String(text || "").includes("input_event"), `${label} should not mention input events`);
  assert(!String(text || "").includes("LAN_DUAL_INPUT_MODE=inject"), `${label} should not instruct injection mode`);
}

function assertMacClientFormalChecklistCommand(command, label) {
  assert(/check-mac-client-formal-status\.mjs/.test(command), `${label} should use check-mac-client-formal-status`);
  assert(command.includes("--discover"), `${label} should discover Windows hosts safely`);
  assert(command.includes("--port 43770"), `${label} should keep the default Windows host port explicit`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("--json"), `${label} should default to one-line boardSummary output`);
  assert(!command.includes("<Windows IP>"), `${label} should not require a placeholder Windows IP`);
}

function assertMacClientFormalSmokeCommand(command, label) {
  assert(/run-mac-client-formal-smoke\.mjs/.test(command), `${label} should use run-mac-client-formal-smoke`);
  assert(command.includes("--discover"), `${label} should discover Windows hosts safely`);
  assert(command.includes("--ensureClient"), `${label} should safely start or reuse the local Mac client page before preflight`);
  assert(command.includes("--preflightOnly"), `${label} should stay in preflight mode`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--forceCall"), `${label} should not replace an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("--json"), `${label} should default to one-line boardSummary output`);
}

function assertMacClientPromptPasswordSmokeCommand(command, label) {
  assert(/run-mac-client-formal-smoke\.mjs/.test(command), `${label} should use run-mac-client-formal-smoke`);
  assert(command.includes("--discover"), `${label} should discover Windows hosts safely before the real smoke`);
  assert(command.includes("--ensureClient"), `${label} should safely start or reuse the local Mac client page`);
  assert(command.includes("--promptPassword"), `${label} should use the frontmost password prompt`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--preflightOnly"), `${label} should be the real smoke path, not preflight`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--useEnvPassword"), `${label} should not expose the child env-password test path`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--forceCall"), `${label} should not replace an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("--json"), `${label} should default to one-line boardSummary output`);
  assert(!command.includes("input_event"), `${label} should not mention input events`);
  assert(!command.includes("inject"), `${label} should not mention inject`);
}

function assertMacClientBrowserSelfTestCommand(command, label) {
  assert(/scripts\/mac\/test-mac-client-browser-self-test-wrapper\.mjs/.test(command), `${label} should use the Mac browser self-test wrapper`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!/scripts\/mac\/test-mac-client-browser-self-test\.mjs/.test(command), `${label} should not point at the noisy raw browser self-test`);
  assert(!command.includes("scripts/windows/test-mac-client-browser.mjs"), `${label} should not expose the Windows test script path`);
  assert(!command.includes("--useExistingHost"), `${label} should not target a real Windows host`);
  assert(!command.includes("--useEnvPassword"), `${label} should not read a real password from env`);
  assert(!command.includes("--requirePassword"), `${label} should not require a real password`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--forceCall"), `${label} should not replace an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
}

function assertMacHeartbeatOnceCommand(command, label) {
  assert(/watch-mac-heartbeat\.mjs/.test(command), `${label} should use watch-mac-heartbeat`);
  assert(command.includes("--once"), `${label} should run a one-shot heartbeat`);
  assert(command.includes("--sendStatus"), `${label} should post to Agent Link Board`);
  assert(command.includes("--boardSummary"), `${label} should print a one-line board summary`);
  assert(!command.includes("--device Mac Codex"), `${label} should not post as Mac Codex`);
  assert(!command.includes("--role Mac 端"), `${label} should not mimic the main Mac Codex role`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacHeartbeatWatchCommand(command, label) {
  assert(/watch-mac-heartbeat\.mjs/.test(command), `${label} should use watch-mac-heartbeat`);
  assert(command.includes("--sendStatus"), `${label} should post to Agent Link Board`);
  assert(command.includes("--intervalMs 30000"), `${label} should use the standard 30s interval`);
  assert(!command.includes("--once"), `${label} should keep running until stopped`);
  assert(!command.includes("--boardSummary"), `${label} should not use boardSummary in the continuous foreground loop`);
  assert(!command.includes("--device Mac Codex"), `${label} should not post as Mac Codex`);
  assert(!command.includes("--role Mac 端"), `${label} should not mimic the main Mac Codex role`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacHeartbeatStartCommand(command, label) {
  assert(/start-mac-heartbeat-watcher\.mjs/.test(command), `${label} should use start-mac-heartbeat-watcher`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--status"), `${label} should start by default`);
  assert(!command.includes("--stop"), `${label} should not stop in the start command`);
  assert(!command.includes("--device Mac Codex"), `${label} should not post as Mac Codex`);
  assert(!command.includes("--role Mac 端"), `${label} should not mimic the main Mac Codex role`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacHeartbeatRefreshOnceCommand(command, label) {
  assertMacHeartbeatOnceCommand(command, label);
  assert(command.includes("--refreshUnattended"), `${label} should refresh Mac Unattended before the heartbeat`);
}

function assertMacHeartbeatRefreshStartCommand(command, label) {
  assertMacHeartbeatStartCommand(command, label);
  assert(command.includes("--refreshUnattended"), `${label} should start the watcher with Mac Unattended refresh enabled`);
}

function assertMacHeartbeatRefreshRestartCommand(command, label) {
  assert(/start-mac-heartbeat-watcher\.mjs/.test(command), `${label} should use start-mac-heartbeat-watcher`);
  assert(command.includes("--restart"), `${label} should restart the watcher`);
  assert(command.includes("--refreshUnattended"), `${label} should restart with Mac Unattended refresh enabled`);
  assert(command.includes("--boardSummary"), `${label} should be board-summary friendly`);
  assert(!command.includes("--password"), `${label} should not include a password flag`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacHeartbeatStatusCommand(command, label) {
  assert(/start-mac-heartbeat-watcher\.mjs/.test(command), `${label} should use start-mac-heartbeat-watcher`);
  assert(command.includes("--status"), `${label} should check status`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--stop"), `${label} should not stop in the status command`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacHeartbeatStopCommand(command, label) {
  assert(/start-mac-heartbeat-watcher\.mjs/.test(command), `${label} should use start-mac-heartbeat-watcher`);
  assert(command.includes("--stop"), `${label} should stop the background watcher`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("inject"), `${label} should not instruct injection`);
}

function assertMacScriptHelpCommand(command, label) {
  assert(/test-mac-script-help\.mjs/.test(command), `${label} should use test-mac-script-help`);
  assert(command.includes("--timeoutMs 10000"), `${label} should use the standard timeout`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("--checkBoard"), `${label} should not read Agent Link Board`);
}

function assertMacManualUxStatusCommand(command, label) {
  assert(/check-mac-manual-ux-status\.mjs/.test(command), `${label} should use check-mac-manual-ux-status`);
  assert(command.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!command.includes("--password"), `${label} should not embed a password argument`);
  assert(!command.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!command.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!command.includes("--server"), `${label} should not echo custom board server URLs`);
  assert(!command.includes("--json"), `${label} should default to one-line boardSummary output`);
  assert(!command.includes("input_event"), `${label} should not send input events`);
  assert(!command.includes("--inputMode inject"), `${label} should not instruct inject mode`);
}

function getRuntimeBuildBeforeLatestMacHostChange() {
  const latest = spawnSync("git", ["log", "--format=%H", "-1", "--", "apps/mac-host/Sources"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 5000,
  });
  const latestCommit = String(latest.stdout || "").trim();
  assert(latest.status === 0 && latestCommit, "should find latest Mac host source commit");
  const parent = spawnSync("git", ["rev-parse", "--short", `${latestCommit}^`], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 5000,
  });
  const parentCommit = String(parent.stdout || "").trim();
  assert(parent.status === 0 && parentCommit, "should find parent of latest Mac host source commit");
  return parentCommit;
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run(args, [flag]);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assert(/\bUsage\b/.test(result.stdout), `${script} ${flag} should print Usage`);
    assert(/commands\.mediaReadinessBoardSummary/.test(result.stdout), `${script} ${flag} should document media command JSON field`);
    assert(/commands\.macHostMediaCommand/.test(result.stdout), `${script} ${flag} should document stable Mac host media JSON field`);
    assert(/commands\.macHostSafeStartCommand/.test(result.stdout), `${script} ${flag} should document Mac host safe start JSON field`);
    assert(/commands\.macMaxFpsSafeStartCommand/.test(result.stdout), `${script} ${flag} should document Mac foreground 60Hz safe start JSON field`);
    assert(/commands\.macHostReadinessCommand/.test(result.stdout), `${script} ${flag} should document Mac host readiness JSON field`);
    assert(/commands\.macFormalLocalSmokeCommand/.test(result.stdout), `${script} ${flag} should document Mac formal local smoke JSON field`);
    assert(/commands\.macFormalE2eStatusCommand/.test(result.stdout), `${script} ${flag} should document Mac formal E2E status JSON field`);
    assert(/commands\.macUnattendedStatusCommand/.test(result.stdout), `${script} ${flag} should document Mac unattended/startup JSON field`);
    assert(/commands\.macUnattendedSendStatusCommand/.test(result.stdout), `${script} ${flag} should document Mac unattended board-status refresh JSON field`);
    assert(/commands\.macUnattendedFormalCommand/.test(result.stdout), `${script} ${flag} should document Mac unattended formal JSON field`);
    assert(/commands\.macLaunchAgentPlanCommand/.test(result.stdout), `${script} ${flag} should document Mac LaunchAgent planner JSON field`);
    assert(/commands\.macMaxFpsPlanCommand/.test(result.stdout), `${script} ${flag} should document Mac max-FPS planner JSON field`);
    assert(/commands\.macClientDiagnosticsCommand/.test(result.stdout), `${script} ${flag} should document Mac client diagnostics JSON field`);
    assert(/commands\.macClientPageStatusCommand/.test(result.stdout), `${script} ${flag} should document Mac client page status JSON field`);
    assert(/commands\.macClientManualChecklistAction/.test(result.stdout), `${script} ${flag} should document Mac client manual checklist JSON field`);
    assert(/commands\.macClientDiscoverWindowsCommand/.test(result.stdout), `${script} ${flag} should document Mac client Windows discovery JSON field`);
    assert(/commands\.macClientDiscoverWindowsCallCommand/.test(result.stdout), `${script} ${flag} should document Mac client Windows discovery call JSON field`);
    assert(/commands\.windowsHostStatusCommand/.test(result.stdout), `${script} ${flag} should document Windows host status JSON field`);
    assert(/commands\.windowsHostReadinessCommand/.test(result.stdout), `${script} ${flag} should document Windows host readiness JSON field`);
    assert(/commands\.macClientFormalChecklistCommand/.test(result.stdout), `${script} ${flag} should document Mac client formal checklist JSON field`);
    assert(/commands\.macClientFormalSmokeCommand/.test(result.stdout), `${script} ${flag} should document Mac client formal smoke preflight JSON field`);
    assert(/commands\.macClientPromptPasswordSmokeCommand/.test(result.stdout), `${script} ${flag} should document Mac client prompt-password smoke JSON field`);
    assert(/commands\.macClientBrowserSelfTestCommand/.test(result.stdout), `${script} ${flag} should document Mac client browser self-test JSON field`);
    assert(/commands\.macHeartbeatOnceCommand/.test(result.stdout), `${script} ${flag} should document Mac heartbeat one-shot JSON field`);
    assert(/commands\.macHeartbeatWatchCommand/.test(result.stdout), `${script} ${flag} should document Mac heartbeat watcher JSON field`);
    assert(/commands\.macHeartbeatStartCommand/.test(result.stdout), `${script} ${flag} should document Mac heartbeat background start JSON field`);
    assert(/commands\.macHeartbeatRefreshOnceCommand/.test(result.stdout), `${script} ${flag} should document Mac heartbeat one-shot unattended refresh JSON field`);
    assert(/commands\.macHeartbeatRefreshStartCommand/.test(result.stdout), `${script} ${flag} should document Mac heartbeat background unattended refresh start JSON field`);
    assert(/commands\.macHeartbeatRefreshRestartCommand/.test(result.stdout), `${script} ${flag} should document Mac heartbeat background unattended refresh restart JSON field`);
    assert(/commands\.macHeartbeatStatusCommand/.test(result.stdout), `${script} ${flag} should document Mac heartbeat background status JSON field`);
    assert(/commands\.macHeartbeatStopCommand/.test(result.stdout), `${script} ${flag} should document Mac heartbeat background stop JSON field`);
    assert(/macHeartbeatWatcher/.test(result.stdout), `${script} ${flag} should document Mac heartbeat watcher status JSON field`);
    assert(/macHeartbeatFreshness/.test(result.stdout), `${script} ${flag} should document Mac heartbeat freshness JSON field`);
    assert(/macHeartbeatHealth/.test(result.stdout), `${script} ${flag} should document Mac heartbeat health JSON field`);
    assert(/board\.macUnattendedHealth/.test(result.stdout), `${script} ${flag} should document Mac unattended health JSON field`);
    assert(/board\.macUnattendedFreshness/.test(result.stdout), `${script} ${flag} should document Mac unattended evidence freshness JSON field`);
    assert(/commands\.macRemoteAudioPlanCommand/.test(result.stdout), `${script} ${flag} should document Mac remote-only audio plan JSON field`);
    assert(/commands\.macInputSafetyPlanCommand/.test(result.stdout), `${script} ${flag} should document Mac input safety plan JSON field`);
    assert(/commands\.macManualUxStatusCommand/.test(result.stdout), `${script} ${flag} should document Mac manual UX status JSON field`);
    assert(/commands\.macScriptHelpCommand/.test(result.stdout), `${script} ${flag} should document Mac script help JSON field`);
  }
  print("OK", "Resume status help exits quickly");
}

function checkOfflineJson(args) {
  const result = run(args, [
    "--json",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "1200",
  ]);
  const payload = parseJson(result.stdout, "offline resume status");
  assert(payload.host?.online !== true, "offline payload should not report host online");
  assert(payload.host?.probe?.port === 9, "offline payload should keep probe port");
  assert(payload.host?.error?.message, "offline payload should include error.message");
  assert(payload.macHeartbeatWatcher?.checked === true, "offline payload should include Mac heartbeat watcher status");
  assert(typeof payload.macHeartbeatWatcher.running === "boolean", "offline payload should include Mac heartbeat watcher running flag");
  assert(typeof payload.macHeartbeatWatcher.refreshUnattended === "boolean", "offline payload should include Mac heartbeat watcher refreshUnattended flag");
  assert(["fresh", "stale", "unknown"].includes(payload.macHeartbeatFreshness?.status), "offline payload should include structured Mac heartbeat freshness");
  assert(["ok", "blocked", "warning", "unknown"].includes(payload.macHeartbeatHealth?.status), "offline payload should include structured Mac heartbeat health");
  assert(typeof payload.macHeartbeatHealth?.reason === "string", "offline payload should include Mac heartbeat health reason");
  assert(Array.isArray(payload.recommendations), "offline payload should include recommendations");
  if (payload.macHeartbeatWatcher.running === false) {
    assert(payload.recommendations.some((item) => item.id === "heartbeat-watcher-not-running"), "offline recommendations should flag a stopped Mac heartbeat watcher");
  }
  assertMediaReadinessCommand(payload.commands?.mediaReadinessBoardSummary || "", "offline JSON media readiness command");
  assertMediaReadinessCommand(payload.commands?.macHostMediaCommand || "", "offline JSON Mac host media command");
  assert(
    payload.commands?.macHostMediaCommand === payload.commands?.mediaReadinessBoardSummary,
    "offline JSON Mac host media command should alias the legacy media readiness command",
  );
  assertMacHostSafeStartCommand(payload.commands?.macHostSafeStartCommand || "", "offline JSON Mac host safe start command");
  assert((payload.commands?.macHostSafeStartCommand || "").includes("--port 9"), "offline JSON Mac host safe start command should keep port");
  assertMacMaxFpsSafeStartCommand(payload.commands?.macMaxFpsSafeStartCommand || "", "offline JSON Mac foreground 60Hz safe start command");
  assert((payload.commands?.macMaxFpsSafeStartCommand || "").includes("--port 9"), "offline JSON Mac foreground 60Hz safe start command should keep port");
  assertMacHostStopCommand(payload.commands?.macHostStopCommand || "", "offline JSON Mac host stop command");
  assert((payload.commands?.macHostStopCommand || "").includes("--port 9"), "offline JSON Mac host stop command should keep port");
  assertMacLaunchAgentLoadCommand(payload.commands?.macLaunchAgentLoadCommand || "", "offline JSON Mac LaunchAgent load command");
  assertMacLaunchAgentPrintCommand(payload.commands?.macLaunchAgentPrintCommand || "", "offline JSON Mac LaunchAgent print command");
  assertMacHostReadinessCommand(payload.commands?.macHostReadinessCommand || "", "offline JSON Mac host readiness command");
  assert((payload.commands?.macHostReadinessCommand || "").includes("--port 9"), "offline JSON Mac host readiness command should keep port");
  assertMacFormalLocalSmokeCommand(payload.commands?.macFormalLocalSmokeCommand || "", "offline JSON Mac formal local smoke command");
  assertMacFormalE2eStatusCommand(payload.commands?.macFormalE2eStatusCommand || "", "offline JSON Mac formal E2E status command");
  assertMacUnattendedStatusCommand(payload.commands?.macUnattendedStatusCommand || "", "offline JSON Mac unattended/startup command");
  assertMacUnattendedSendStatusCommand(payload.commands?.macUnattendedSendStatusCommand || "", "offline JSON Mac unattended board-status refresh command");
  assertMacUnattendedFormalCommand(payload.commands?.macUnattendedFormalCommand || "", "offline JSON Mac unattended formal command");
  assertMacPowerPlanCommand(payload.commands?.macPowerPlanCommand || "", "offline JSON Mac power settings planner command");
  assertMacRemoteAudioPlanCommand(payload.commands?.macRemoteAudioPlanCommand || "", "offline JSON Mac remote-only audio planner command");
  assertMacInputSafetyPlanCommand(payload.commands?.macInputSafetyPlanCommand || "", "offline JSON Mac input safety planner command");
  assertMacLaunchAgentPlanCommand(payload.commands?.macLaunchAgentPlanCommand || "", "offline JSON Mac LaunchAgent planner command");
  assertMacMaxFpsPlanCommand(payload.commands?.macMaxFpsPlanCommand || "", "offline JSON Mac max-FPS planner command");
  assertMacClientPageStatusCommand(payload.commands?.macClientPageStatusCommand || "", "offline JSON Mac client page status command");
  assertMacClientDiagnosticsCommand(payload.commands?.macClientDiagnosticsCommand || "", "offline JSON Mac client diagnostics command");
  assertMacClientManualChecklistAction(payload.commands?.macClientManualChecklistAction || "", "offline JSON Mac client manual checklist action");
  assertMacClientPasswordLocationAction(payload.commands?.macClientPasswordLocationAction || "", "offline JSON Mac client password location action");
  assertMacClientDiscoverWindowsCommand(payload.commands?.macClientDiscoverWindowsCommand || "", "offline JSON Mac client Windows discovery command");
  assertWindowsHostStatusCommand(payload.commands?.windowsHostStatusCommand || "", "offline JSON Windows host status command");
  assertWindowsHostReadinessCommand(payload.commands?.windowsHostReadinessCommand || "", "offline JSON Windows host readiness command");
  assertMacClientReverseRehearsalAction(payload.commands?.macClientReverseRehearsalAction || "", "offline JSON Mac client reverse rehearsal action");
  assertMacClientFormalChecklistCommand(payload.commands?.macClientFormalChecklistCommand || "", "offline JSON Mac client formal checklist command");
  assertMacClientFormalSmokeCommand(payload.commands?.macClientFormalSmokeCommand || "", "offline JSON Mac client formal smoke preflight command");
  assertMacClientPromptPasswordSmokeCommand(payload.commands?.macClientPromptPasswordSmokeCommand || "", "offline JSON Mac client prompt-password smoke command");
  assertMacClientBrowserSelfTestCommand(payload.commands?.macClientBrowserSelfTestCommand || "", "offline JSON Mac client browser self-test command");
  assertMacHeartbeatOnceCommand(payload.commands?.macHeartbeatOnceCommand || "", "offline JSON Mac heartbeat one-shot command");
  assertMacHeartbeatWatchCommand(payload.commands?.macHeartbeatWatchCommand || "", "offline JSON Mac heartbeat watcher command");
  assertMacHeartbeatStartCommand(payload.commands?.macHeartbeatStartCommand || "", "offline JSON Mac heartbeat background start command");
  assertMacHeartbeatRefreshOnceCommand(payload.commands?.macHeartbeatRefreshOnceCommand || "", "offline JSON Mac heartbeat unattended refresh one-shot command");
  assertMacHeartbeatRefreshStartCommand(payload.commands?.macHeartbeatRefreshStartCommand || "", "offline JSON Mac heartbeat unattended refresh background start command");
  assertMacHeartbeatRefreshRestartCommand(payload.commands?.macHeartbeatRefreshRestartCommand || "", "offline JSON Mac heartbeat unattended refresh background restart command");
  assertMacHeartbeatStatusCommand(payload.commands?.macHeartbeatStatusCommand || "", "offline JSON Mac heartbeat background status command");
  assertMacHeartbeatStopCommand(payload.commands?.macHeartbeatStopCommand || "", "offline JSON Mac heartbeat background stop command");
  assert(String(payload.commands?.macClientCopyDiagnosticsAction || "").includes("复制诊断"), "offline JSON should include copy diagnostics action");
  assertMacManualUxStatusCommand(payload.commands?.macManualUxStatusCommand || "", "offline JSON Mac manual UX status command");
  assertMacScriptHelpCommand(payload.commands?.macScriptHelpCommand || "", "offline JSON Mac script help command");
  assertBoardSummaryShape(payload.boardSummary || "", "offline JSON boardSummary");
  assert(String(payload.boardSummary || "").includes("--port 9"), "offline JSON boardSummary should include safe start port");
  assert(String(payload.boardSummary || "").includes("blockers=none"), "offline JSON boardSummary should explicitly report no blockers");
  assert(/warnings=[^.]*host-offline/.test(String(payload.boardSummary || "")), "offline JSON boardSummary should include warning IDs");
  assert(payload.recommendations.some((item) => /start-mac-host/.test(item.text)), "offline recommendations should include startup guidance");
  print("OK", "Offline resume status JSON includes probe, error, and next-step guidance");
}

function checkRequireOnlineFails(args) {
  const result = run(args, [
    "--json",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "1200",
    "--requireOnline",
  ]);
  const payload = parseJson(result.stdout, "requireOnline resume status");
  assert(result.status !== 0, "requireOnline offline path should fail");
  assert(payload.ok === false, "requireOnline offline payload should report ok=false");
  assert(payload.recommendations.some((item) => item.level === "blocker"), "requireOnline offline payload should include a blocker");
  assert(String(payload.boardSummary || "").includes("blockers=host-offline"), "requireOnline boardSummary should include blocker IDs");
  print("OK", "requireOnline turns offline Mac host into a failing JSON report");
}

function checkOfflineBoardSummary(args) {
  const result = run(args, [
    "--boardSummary",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "1200",
  ]);
  assert(result.status === 0, "offline board summary should stay non-failing without requireOnline");
  const text = String(result.stdout || "").trim();
  assertBoardSummaryShape(text, "offline board summary");
  assert(/Mac host offline/.test(text), "offline board summary should mention host offline");
  assert(/blockers=none/.test(text), "offline board summary should explicitly report no blockers");
  assert(/warnings=[^.]*host-offline/.test(text), "offline board summary should include warning IDs");
  assert(/MacHostSafeStart=/.test(text), "offline board summary should include formal host safe start guidance");
  assert(/--host 0\.0\.0\.0 --port 9/.test(text), "offline board summary should keep formal host start target");
  assert(/MacMaxFpsSafeStart=/.test(text), "offline board summary should include foreground 60Hz safe start guidance");
  assert(/MacMaxFpsSafeStart=.*--host 0\.0\.0\.0 --port 9 --maxScreenFps 60/.test(text), "offline board summary should keep foreground 60Hz start target");
  assert(/MacHostReadiness=/.test(text), "offline board summary should include low-risk host readiness guidance");
  assert(/MacHostReadiness=.*--host 127\.0\.0\.1 --port 9 --checkBoard --boardSummary/.test(text), "offline board summary should keep host readiness target");
  print("OK", "Offline board summary is short, secret-free, and actionable");
}

function checkOfflinePlainReport(args) {
  const result = run(args, [
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "1200",
  ]);
  assert(result.status === 0, "offline plain report should stay non-failing without requireOnline");
  assert(String(result.stdout || "").includes("Mac client diagnostics:"), "plain report should include Mac client diagnostics label");
  assert(String(result.stdout || "").includes("Mac client manual checklist:"), "plain report should include Mac client manual checklist label");
  assert(String(result.stdout || "").includes("Mac formal local smoke:"), "plain report should include Mac formal local smoke label");
  assert(String(result.stdout || "").includes("Mac formal E2E preflight:"), "plain report should include Mac formal E2E preflight label");
  assert(String(result.stdout || "").includes("Mac 60Hz safe foreground start:"), "plain report should include Mac foreground 60Hz safe start label");
  assert(String(result.stdout || "").includes("Mac host readiness:"), "plain report should include low-risk Mac host readiness label");
  assert(String(result.stdout || "").includes("Mac unattended/startup status:"), "plain report should include Mac unattended/startup label");
  assert(String(result.stdout || "").includes("Mac unattended formal 60Hz gate:"), "plain report should include Mac unattended formal label");
  assert(String(result.stdout || "").includes("--requireLaunchAgentMaxFps"), "plain report should include Mac unattended formal max-FPS gate");
  assert(String(result.stdout || "").includes("Mac power settings dry-run plan:"), "plain report should include Mac power settings planner label");
  assert(String(result.stdout || "").includes("plan-mac-power-settings.mjs"), "plain report should include Mac power settings planner command");
  assert(String(result.stdout || "").includes("Mac remote-only audio dry-run plan:"), "plain report should include Mac remote-only audio planner label");
  assert(String(result.stdout || "").includes("plan-mac-remote-audio.mjs"), "plain report should include Mac remote-only audio planner command");
  assert(String(result.stdout || "").includes("Mac input safety plan:"), "plain report should include Mac input safety planner label");
  assert(String(result.stdout || "").includes("plan-mac-input-safety.mjs"), "plain report should include Mac input safety planner command");
  assert(String(result.stdout || "").includes("Mac LaunchAgent dry-run plan:"), "plain report should include Mac LaunchAgent planner label");
  assert(String(result.stdout || "").includes("Mac max FPS dry-run plan:"), "plain report should include Mac max-FPS planner label");
  assert(String(result.stdout || "").includes("--maxScreenFps 60"), "plain report should include Mac max-FPS planner command");
  assert(String(result.stdout || "").includes("Mac client page status:"), "plain report should include Mac client page status label");
  assert(String(result.stdout || "").includes("Mac client discover Windows host:"), "plain report should include Mac client Windows discovery label");
  assert(String(result.stdout || "").includes("Mac client reverse rehearsal:"), "plain report should include Mac client reverse rehearsal label");
  assert(String(result.stdout || "").includes("Mac client formal checklist:"), "plain report should include Mac client formal checklist label");
  assert(String(result.stdout || "").includes("Mac client formal smoke preflight:"), "plain report should include Mac client formal smoke preflight label");
  assert(String(result.stdout || "").includes("Mac client prompt-password smoke:"), "plain report should include Mac client prompt-password smoke label");
  assert(String(result.stdout || "").includes("Mac client browser self-test:"), "plain report should include Mac client browser self-test label");
  assert(String(result.stdout || "").includes("Mac heartbeat one-shot board update:"), "plain report should include Mac heartbeat one-shot label");
  assert(String(result.stdout || "").includes("Mac heartbeat continuous board watcher:"), "plain report should include Mac heartbeat watcher label");
  assert(String(result.stdout || "").includes("Mac heartbeat background start:"), "plain report should include Mac heartbeat background start label");
  assert(String(result.stdout || "").includes("Mac heartbeat one-shot with unattended refresh:"), "plain report should include Mac heartbeat unattended refresh one-shot label");
  assert(String(result.stdout || "").includes("Mac heartbeat background refresh start:"), "plain report should include Mac heartbeat unattended refresh background start label");
  assert(String(result.stdout || "").includes("Mac heartbeat background refresh restart:"), "plain report should include Mac heartbeat unattended refresh background restart label");
  assert(String(result.stdout || "").includes("Mac heartbeat background status:"), "plain report should include Mac heartbeat background status label");
  assert(String(result.stdout || "").includes("Mac heartbeat background stop:"), "plain report should include Mac heartbeat background stop label");
  assert(String(result.stdout || "").includes("Mac heartbeat watcher:"), "plain report should include Mac heartbeat watcher status");
  assert(String(result.stdout || "").includes("start-mac-client.mjs"), "plain report should include Mac client page status command");
  assert(String(result.stdout || "").includes("check-mac-client-readiness.mjs"), "plain report should include Mac client readiness command");
  assert(String(result.stdout || "").includes("手工清单"), "plain report should mention the Mac client manual checklist");
  assert(String(result.stdout || "").includes("连接/视频/音频/剪贴板/input_ack/诊断"), "plain report should include the Mac client manual checklist items");
  assert(String(result.stdout || "").includes("discover-windows-hosts.mjs"), "plain report should include Mac client Windows discovery command");
  assert(String(result.stdout || "").includes("Windows host status for Windows side:"), "plain report should include Windows host status label");
  assert(String(result.stdout || "").includes("start-windows-host.mjs --status --host 127.0.0.1 --port 43770 --boardSummary"), "plain report should include Windows host status command");
  assert(String(result.stdout || "").includes("Windows host readiness for Windows side:"), "plain report should include Windows host readiness label");
  assert(String(result.stdout || "").includes("check-windows-host-readiness.mjs --host 127.0.0.1 --port 43770 --checkBoard --boardSummary"), "plain report should include Windows host readiness command");
  assert(String(result.stdout || "").includes("ReverseRehearsal="), "plain report should point to discovery ReverseRehearsal output");
  assert(String(result.stdout || "").includes("check-mac-client-formal-status.mjs"), "plain report should include Mac client formal checklist command");
  assert(String(result.stdout || "").includes("run-mac-client-formal-smoke.mjs"), "plain report should include Mac client formal smoke preflight command");
  assert(String(result.stdout || "").includes("scripts/mac/test-mac-client-browser-self-test-wrapper.mjs"), "plain report should include Mac client browser self-test command");
  assert(String(result.stdout || "").includes("watch-mac-heartbeat.mjs"), "plain report should include Mac heartbeat watcher command");
  assert(String(result.stdout || "").includes("start-mac-heartbeat-watcher.mjs"), "plain report should include Mac heartbeat background helper command");
  assert(String(result.stdout || "").includes("check-mac-formal-local-smoke.mjs"), "plain report should include Mac formal local smoke command");
  assert(String(result.stdout || "").includes("check-mac-formal-e2e-status.mjs"), "plain report should include Mac formal E2E status command");
  assert(String(result.stdout || "").includes("check-mac-unattended-status.mjs"), "plain report should include Mac unattended/startup command");
  assert(String(result.stdout || "").includes("install-mac-host-launch-agent.mjs"), "plain report should include Mac LaunchAgent planner command");
  assert(String(result.stdout || "").includes("Mac client copy diagnostics:"), "plain report should include copy diagnostics label");
  assert(String(result.stdout || "").includes("复制诊断"), "plain report should mention the copy diagnostics action");
  assert(String(result.stdout || "").includes("Mac script help safety check:"), "plain report should include Mac script help label");
  assert(String(result.stdout || "").includes("test-mac-script-help.mjs"), "plain report should include Mac script help command");
  assertNoPasswordLeak(result, "offline plain report");
  print("OK", "Offline plain report includes Mac client diagnostics and copy guidance");
}

function checkOnlineJson(args) {
  const result = run(args, [
    "--json",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--timeoutMs",
    String(args.timeoutMs),
  ]);
  const payload = parseJson(result.stdout, "online resume status");
  if (payload.host?.online !== true) {
    if (args.requireOnline) {
      throw new Error(`online resume status required but host is offline:\n${result.stdout}\n${result.stderr}`);
    }
    print("WARN", "Online resume status skipped because Mac host is offline");
    return;
  }
  assert(payload.currentBuildId, "online payload should include currentBuildId");
  assert(payload.git && typeof payload.git.clean === "boolean", "online payload should include git cleanliness");
  assert(payload.host.runtime?.buildId, "online payload should include runtime.buildId");
  assert(payload.host.permissions && typeof payload.host.permissions === "object", "online payload should include permissions");
  assert(payload.host.capabilities && typeof payload.host.capabilities === "object", "online payload should include capabilities");
  assert(Array.isArray(payload.host.displays), "online payload should include displays");
  assert(Array.isArray(payload.host.lanAddresses), "online payload should include lanAddresses");
  assert(payload.host.buildDiff && typeof payload.host.buildDiff === "object", "online payload should include buildDiff");
  assert(payload.macHeartbeatWatcher?.checked === true, "online payload should include Mac heartbeat watcher status");
  assert(typeof payload.macHeartbeatWatcher.running === "boolean", "online payload should include Mac heartbeat watcher running flag");
  assert(typeof payload.macHeartbeatWatcher.server === "string" && payload.macHeartbeatWatcher.server.length > 0, "online payload should include Mac heartbeat watcher server label");
  assert(Array.isArray(payload.macHeartbeatWatcher.configurationMismatches), "online payload should include Mac heartbeat watcher configuration mismatches");
  assert(typeof payload.macHeartbeatWatcher.refreshUnattended === "boolean", "online payload should include Mac heartbeat watcher refreshUnattended flag");
  assert(["fresh", "stale", "unknown"].includes(payload.macHeartbeatFreshness?.status), "online payload should include structured Mac heartbeat freshness");
  assert(["ok", "blocked", "warning", "unknown"].includes(payload.macHeartbeatHealth?.status), "online payload should include structured Mac heartbeat health");
  assert(typeof payload.macHeartbeatHealth?.reason === "string", "online payload should include Mac heartbeat health reason");
  assertMediaReadinessCommand(payload.commands?.mediaReadinessBoardSummary || "", "online JSON media readiness command");
  assertMediaReadinessCommand(payload.commands?.macHostMediaCommand || "", "online JSON Mac host media command");
  assert(
    payload.commands?.macHostMediaCommand === payload.commands?.mediaReadinessBoardSummary,
    "online JSON Mac host media command should alias the legacy media readiness command",
  );
  assertMacFormalLocalSmokeCommand(payload.commands?.macFormalLocalSmokeCommand || "", "online JSON Mac formal local smoke command");
  assertMacHostSafeStartCommand(payload.commands?.macHostSafeStartCommand || "", "online JSON Mac host safe start command");
  assertMacMaxFpsSafeStartCommand(payload.commands?.macMaxFpsSafeStartCommand || "", "online JSON Mac foreground 60Hz safe start command");
  assertMacHostStopCommand(payload.commands?.macHostStopCommand || "", "online JSON Mac host stop command");
  assertMacLaunchAgentLoadCommand(payload.commands?.macLaunchAgentLoadCommand || "", "online JSON Mac LaunchAgent load command");
  assertMacLaunchAgentPrintCommand(payload.commands?.macLaunchAgentPrintCommand || "", "online JSON Mac LaunchAgent print command");
  assertMacHostReadinessCommand(payload.commands?.macHostReadinessCommand || "", "online JSON Mac host readiness command");
  assertMacFormalE2eStatusCommand(payload.commands?.macFormalE2eStatusCommand || "", "online JSON Mac formal E2E status command");
  assertMacUnattendedStatusCommand(payload.commands?.macUnattendedStatusCommand || "", "online JSON Mac unattended/startup command");
  assertMacUnattendedSendStatusCommand(payload.commands?.macUnattendedSendStatusCommand || "", "online JSON Mac unattended board-status refresh command");
  assertMacUnattendedFormalCommand(payload.commands?.macUnattendedFormalCommand || "", "online JSON Mac unattended formal command");
  assertMacPowerPlanCommand(payload.commands?.macPowerPlanCommand || "", "online JSON Mac power settings planner command");
  assertMacRemoteAudioPlanCommand(payload.commands?.macRemoteAudioPlanCommand || "", "online JSON Mac remote-only audio planner command");
  assertMacInputSafetyPlanCommand(payload.commands?.macInputSafetyPlanCommand || "", "online JSON Mac input safety planner command");
  assertMacLaunchAgentPlanCommand(payload.commands?.macLaunchAgentPlanCommand || "", "online JSON Mac LaunchAgent planner command");
  assertMacMaxFpsPlanCommand(payload.commands?.macMaxFpsPlanCommand || "", "online JSON Mac max-FPS planner command");
  assertMacClientPageStatusCommand(payload.commands?.macClientPageStatusCommand || "", "online JSON Mac client page status command");
  assertMacClientDiagnosticsCommand(payload.commands?.macClientDiagnosticsCommand || "", "online JSON Mac client diagnostics command");
  assertMacClientManualChecklistAction(payload.commands?.macClientManualChecklistAction || "", "online JSON Mac client manual checklist action");
  assertMacClientPasswordLocationAction(payload.commands?.macClientPasswordLocationAction || "", "online JSON Mac client password location action");
  assertMacClientDiscoverWindowsCommand(payload.commands?.macClientDiscoverWindowsCommand || "", "online JSON Mac client Windows discovery command");
  assertWindowsHostStatusCommand(payload.commands?.windowsHostStatusCommand || "", "online JSON Windows host status command");
  assertWindowsHostReadinessCommand(payload.commands?.windowsHostReadinessCommand || "", "online JSON Windows host readiness command");
  assertMacClientReverseRehearsalAction(payload.commands?.macClientReverseRehearsalAction || "", "online JSON Mac client reverse rehearsal action");
  assertMacClientFormalChecklistCommand(payload.commands?.macClientFormalChecklistCommand || "", "online JSON Mac client formal checklist command");
  assertMacClientFormalSmokeCommand(payload.commands?.macClientFormalSmokeCommand || "", "online JSON Mac client formal smoke preflight command");
  assertMacClientPromptPasswordSmokeCommand(payload.commands?.macClientPromptPasswordSmokeCommand || "", "online JSON Mac client prompt-password smoke command");
  assertMacClientBrowserSelfTestCommand(payload.commands?.macClientBrowserSelfTestCommand || "", "online JSON Mac client browser self-test command");
  assertMacHeartbeatOnceCommand(payload.commands?.macHeartbeatOnceCommand || "", "online JSON Mac heartbeat one-shot command");
  assertMacHeartbeatWatchCommand(payload.commands?.macHeartbeatWatchCommand || "", "online JSON Mac heartbeat watcher command");
  assertMacHeartbeatStartCommand(payload.commands?.macHeartbeatStartCommand || "", "online JSON Mac heartbeat background start command");
  assertMacHeartbeatRefreshOnceCommand(payload.commands?.macHeartbeatRefreshOnceCommand || "", "online JSON Mac heartbeat unattended refresh one-shot command");
  assertMacHeartbeatRefreshStartCommand(payload.commands?.macHeartbeatRefreshStartCommand || "", "online JSON Mac heartbeat unattended refresh background start command");
  assertMacHeartbeatRefreshRestartCommand(payload.commands?.macHeartbeatRefreshRestartCommand || "", "online JSON Mac heartbeat unattended refresh background restart command");
  assertMacHeartbeatStatusCommand(payload.commands?.macHeartbeatStatusCommand || "", "online JSON Mac heartbeat background status command");
  assertMacHeartbeatStopCommand(payload.commands?.macHeartbeatStopCommand || "", "online JSON Mac heartbeat background stop command");
  assert(String(payload.commands?.macClientCopyDiagnosticsAction || "").includes("连接密码"), "online JSON copy diagnostics action should mention password safety");
  assertMacManualUxStatusCommand(payload.commands?.macManualUxStatusCommand || "", "online JSON Mac manual UX status command");
  assertMacScriptHelpCommand(payload.commands?.macScriptHelpCommand || "", "online JSON Mac script help command");
  assert(Array.isArray(payload.recommendations), "online payload should include recommendations");
  if (payload.macHeartbeatWatcher.running === false) {
    assert(payload.recommendations.some((item) => item.id === "heartbeat-watcher-not-running"), "online recommendations should flag a stopped Mac heartbeat watcher");
  }
  assert(payload.recommendations.some((item) => /media baseline/.test(item.text) && /--probeMedia/.test(item.text)), "online recommendations should include media baseline command");
  assertBoardSummaryShape(payload.boardSummary || "", "online JSON boardSummary");
  print("OK", "Online resume status JSON includes runtime, permissions, capabilities, displays, LAN addresses, and buildDiff");
}

function checkOnlineBoardSummary(args) {
  const result = run(args, [
    "--boardSummary",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--timeoutMs",
    String(args.timeoutMs),
  ]);
  const text = String(result.stdout || "").trim();
  assertBoardSummaryShape(text, "online board summary");
  if (/Mac host offline/.test(text)) {
    if (args.requireOnline) {
      throw new Error(`online board summary required but host is offline:\n${result.stdout}\n${result.stderr}`);
    }
    print("WARN", "Online board summary host-specific assertions skipped because Mac host is offline");
    return;
  }
  assert(/host=/.test(text), "online board summary should include host address");
  assert(/inputMode=/.test(text), "online board summary should include inputMode");
  assert(/Permissions/.test(text), "online board summary should include permissions");
  assert(/Next formal path/.test(text), "online board summary should include formal path");
  print("OK", "Online board summary includes host, permissions, build, and formal-path status");
}

async function withFakeMacHost(callback, options = {}) {
  const discovery = {
    platform: "macos",
    deviceName: "Fake Resume Mac",
    inputMode: "log",
    runtime: {
      buildId: options.runtimeBuildId || "fake-resume-build",
      processId: 12345,
      startedAt: new Date().toISOString(),
    },
    permissions: {
      screenRecording: true,
      accessibility: true,
      inputMonitoring: true,
    },
    capabilities: {
      inputMode: "log",
      h264Stream: true,
      audio: true,
      audioMode: "system-pcm",
      clipboardText: true,
      clipboardFile: true,
      capturePipeline: options.capturePipeline || "background-jpeg",
      maxScreenFps: options.maxScreenFps ?? 60,
      displays: [
        {
          id: "main",
          name: "Main Display",
          width: 1920,
          height: 1080,
          primary: true,
        },
      ],
    },
  };
  const server = http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/discovery") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(discovery));
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("not found");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  try {
    const address = server.address();
    return await callback({ host: address.address, port: address.port, discovery });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

async function checkMaxFpsPlanWarning(args) {
  await withFakeMacHost(async (macHost) => {
    const result = await runAsync(args, [
      "--json",
      "--host",
      macHost.host,
      "--port",
      String(macHost.port),
      "--timeoutMs",
      "1200",
    ]);
    const payload = parseJson(result.stdout, "max-FPS plan resume status");
    assert(result.status === 0, `max-FPS warning should not fail resume status\n${result.stdout}\n${result.stderr}`);
    assert(payload.host?.capabilities?.maxScreenFps === 30, "max-FPS payload should preserve remote maxScreenFps");
    assertMacMaxFpsSafeStartCommand(payload.commands?.macMaxFpsSafeStartCommand || "", "max-FPS JSON foreground safe start command");
    assertMacHostStopCommand(payload.commands?.macHostStopCommand || "", "max-FPS JSON host stop command");
    assertMacLaunchAgentLoadCommand(payload.commands?.macLaunchAgentLoadCommand || "", "max-FPS JSON LaunchAgent load command");
    assertMacLaunchAgentPrintCommand(payload.commands?.macLaunchAgentPrintCommand || "", "max-FPS JSON LaunchAgent print command");
    assertMacMaxFpsPlanCommand(payload.commands?.macMaxFpsPlanCommand || "", "max-FPS JSON planner command");
    assert(payload.recommendations.some((item) => item.id === "fps-limit" && item.level === "warning" && /maxScreenFps=30/.test(item.text)), "max-FPS limit should create a warning recommendation");
    assert(payload.suggestedAction?.id !== "restart-mac-host-safely", "max-FPS-only warning should not suggest a host restart action");
    assert(/warnings=[^.]*fps-limit/.test(String(payload.boardSummary || "")), "max-FPS boardSummary should include fps-limit warning ID");
    assert(!String(payload.boardSummary || "").includes("suggestedAction=restart-mac-host-safely"), "max-FPS boardSummary should not suggest a stale-build restart");
    assert(String(payload.boardSummary || "").includes("MacMaxFpsSafeStart="), "max-FPS boardSummary should include MacMaxFpsSafeStart");
    assert(String(payload.boardSummary || "").includes("MacHostStop="), "max-FPS boardSummary should include MacHostStop");
    assert(String(payload.boardSummary || "").includes("MacLaunchAgentLoad="), "max-FPS boardSummary should include MacLaunchAgentLoad");
    assert(String(payload.boardSummary || "").includes("MacLaunchAgentPrint="), "max-FPS boardSummary should include MacLaunchAgentPrint");
    assert(String(payload.boardSummary || "").includes("MacMaxFpsPlan="), "max-FPS boardSummary should include MacMaxFpsPlan");
    assert(String(payload.boardSummary || "").includes("--maxScreenFps 60"), "max-FPS boardSummary should include 60Hz planner command");
    assertNoPasswordLeak(result, "max-FPS plan resume status");
  }, { capturePipeline: "screencapturekit-h264", maxScreenFps: 30 });
  print("OK", "Resume status warns when Mac host maxScreenFps is below the formal 60Hz target");
}

async function checkStaleBuildSuggestedAction(args) {
  const staleBuild = getRuntimeBuildBeforeLatestMacHostChange();
  await withFakeMacHost(async (macHost) => {
    const result = await runAsync(args, [
      "--json",
      "--host",
      macHost.host,
      "--port",
      String(macHost.port),
      "--timeoutMs",
      "1200",
    ]);
    const payload = parseJson(result.stdout, "stale build resume status");
    assert(result.status === 0, `stale Mac host build should remain a warning by default\n${result.stdout}\n${result.stderr}`);
    assert(payload.host?.buildDiff?.severity === "restart-recommended", "stale build should recommend a restart when Mac host runtime files changed");
    assert(payload.host?.buildDiff?.changedHostRuntimeFileCount > 0, "stale build should count changed Mac host runtime files");
    assert(payload.recommendations.some((item) => item.id === "runtime-changes" && item.level === "warning"), "stale build should create a runtime-changes warning");
    assert(payload.suggestedAction?.id === "restart-mac-host-safely", "stale build should expose a structured safe restart action");
    assert(String(payload.suggestedAction?.reason || "").includes("Mac host runtime build is stale"), "stale build action should explain the stale runtime");
    assertMacHostStopCommand(payload.suggestedAction?.commands?.macHostStopCommand || "", "stale build suggested Mac host stop command");
    assertMacHostSafeStartCommand(payload.suggestedAction?.commands?.macHostSafeStartCommand || "", "stale build suggested Mac host safe start command");
    assertMacMaxFpsSafeStartCommand(payload.suggestedAction?.commands?.macMaxFpsSafeStartCommand || "", "stale build suggested Mac 60Hz safe start command");
    assertMacResumeStatusCommand(payload.suggestedAction?.commands?.macResumeStatusCommand || "", "stale build suggested Mac resume status rerun command");
    assert(String(payload.boardSummary || "").includes("restart recommended"), "stale build boardSummary should mention restart recommended");
    assert(/warnings=[^.]*runtime-changes/.test(String(payload.boardSummary || "")), "stale build boardSummary should include runtime-changes warning ID");
    assert(String(payload.boardSummary || "").includes("suggestedAction=restart-mac-host-safely"), "stale build boardSummary should include the suggested action");
    assert(String(payload.boardSummary || "").includes("actionCommands=MacHostStop->MacHostSafeStart-or-MacMaxFpsSafeStart->MacResumeStatus"), "stale build boardSummary should include the safe action order");
    assertNoPasswordLeak(result, "stale build resume status");
  }, { capturePipeline: "screencapturekit-h264", runtimeBuildId: staleBuild });
  print("OK", "Resume status suggests a safe restart action when Mac host runtime files changed");
}

async function checkDiscoveryBackgroundJpegDoesNotWarn(args) {
  await withFakeMacHost(async (macHost) => {
    const result = await runAsync(args, [
      "--json",
      "--host",
      macHost.host,
      "--port",
      String(macHost.port),
      "--timeoutMs",
      "1200",
    ]);
    const payload = parseJson(result.stdout, "discovery background JPEG resume status");
    assert(result.status === 0, `discovery background JPEG should not fail resume status\n${result.stdout}\n${result.stderr}`);
    assert(payload.host?.online === true, "discovery background JPEG payload should report host online");
    assert(payload.host?.capabilities?.h264Stream === true, "discovery background JPEG payload should preserve H.264 capability");
    assert(payload.host?.capabilities?.capturePipeline === "background-jpeg", "discovery background JPEG payload should preserve capturePipeline");
    assert(!payload.recommendations.some((item) => item.id === "h264-fallback"), "discovery background JPEG should not create a fallback warning recommendation");
    assert(!/warnings=[^.]*h264-fallback/.test(String(payload.boardSummary || "")), "discovery background JPEG boardSummary should not include h264-fallback");
    assertNoPasswordLeak(result, "discovery background JPEG resume status");
  });
  print("OK", "Resume status treats discovery background JPEG as an idle capability state");
}

function checkPasswordRedaction(args) {
  const result = run(args, [
    "--json",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "1200",
    "--server",
    "http://super-secret-resume-password.invalid",
    "--boardSummary",
  ]);
  assertNoPasswordLeak(result, "resume status JSON");
  print("OK", "Resume status output does not echo unrelated secret-like server text in normal offline mode");
}

async function withFakeBoard(call, callback, options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "lan-dual-mac-resume-board-"));
  const scriptPath = path.join(dir, "fake-board.mjs");
  const state = {
    currentCall: call,
    statuses: options.statuses || {},
    events: options.events || [
      {
        id: "event-1",
        at: new Date().toISOString(),
        type: "message",
        from: "Windows Codex",
        text: "fake board status without secrets",
      },
    ],
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(scriptPath, `
import http from "node:http";
const state = ${JSON.stringify(state)};
const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/api/state") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(state));
    return;
  }
  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ ok: false, error: "not found" }));
});
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  console.log(address.port);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
`, "utf8");
  const child = spawn(process.execPath, [scriptPath], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  try {
    const port = await waitForPort(child, () => stdout, () => stderr);
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      child.once("exit", resolve);
      setTimeout(resolve, 1000);
    });
    rmSync(dir, { recursive: true, force: true });
  }
}

function waitForPort(child, getStdout, getStderr) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const match = getStdout().match(/(\d+)/);
      if (match) {
        clearInterval(timer);
        resolve(Number(match[1]));
        return;
      }
      if (child.exitCode !== null) {
        clearInterval(timer);
        reject(new Error(`fake board exited early\n${getStdout()}\n${getStderr()}`));
        return;
      }
      if (Date.now() - started > 5000) {
        clearInterval(timer);
        reject(new Error(`fake board did not start\n${getStdout()}\n${getStderr()}`));
      }
    }, 25);
  });
}

async function checkBoardCurrentCall(args) {
  const call = {
    status: "CALLING",
    goal: "正式 Windows host 验收",
    from: "Windows Codex",
    need: "Mac Codex",
    connection: "192.168.31.55:43770",
    command: "node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --sendCall",
    ask: "请先看板再继续，不要发送密码。",
  };
  await withFakeBoard(call, async (server) => {
    const jsonResult = run(args, [
      "--json",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "1200",
    ]);
    const payload = parseJson(jsonResult.stdout, "board currentCall resume status");
    assert(jsonResult.status === 0, `board currentCall JSON should stay non-failing\n${jsonResult.stdout}\n${jsonResult.stderr}`);
    assert(payload.board?.checked === true, "board currentCall JSON should mark board checked");
    assert(payload.board?.ok === true, "board currentCall JSON should mark board ok");
    assert(payload.board?.activeCall === true, "board currentCall JSON should detect active call");
    assert(payload.board?.currentCall?.goal === call.goal, "board currentCall JSON should include call goal");
    assert(payload.board?.currentCall?.need === call.need, "board currentCall JSON should include call need");
    assert(payload.board?.currentCall?.command === call.command, "board currentCall JSON should keep structured command for automation");
    assert(String(payload.boardSummary || "").includes("call=active"), "board summary should mention active call");
    assert(String(payload.boardSummary || "").includes(call.goal), "board summary should include call goal");
    assert(!String(payload.boardSummary || "").includes(call.command), "board summary should not echo call command");
    assert(payload.recommendations.some((item) => /active call/.test(item.text)), "recommendations should mention active call");
    assertNoPasswordLeak(jsonResult, "board currentCall JSON");

    const summaryResult = run(args, [
      "--boardSummary",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "1200",
    ]);
    assert(summaryResult.status === 0, `board currentCall summary should stay non-failing\n${summaryResult.stdout}\n${summaryResult.stderr}`);
    const lines = String(summaryResult.stdout || "").trim().split(/\r?\n/).filter(Boolean);
    assert(lines.length === 1, `board currentCall summary should be one line, got ${lines.length}`);
    assert(lines[0].includes("call=active"), "board currentCall summary should mention active call");
    assert(lines[0].includes(call.goal), "board currentCall summary should include call goal");
    assert(!lines[0].includes(call.command), "board currentCall summary should not echo call command");
    assertNoPasswordLeak(summaryResult, "board currentCall summary");
  });
  print("OK", "Agent Link Board currentCall is surfaced in JSON and board summary");
}

async function checkPostPassManualUxStandby(args) {
  const standbyStatus = [
    "本轮完成并已推送 e8f946d。",
    "MAC_STANDING_BY_FOR_MANUAL_UX_TEST：Mac 端保持 host/客户端待命，未请求密码、未 input/inject；白天继续前先看通讯板。",
    "ManualUxChecklist=connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics",
  ].join(" ");
  await withFakeMacHost(async (macHost) => {
    await withFakeBoard(null, async (server) => {
      const result = await runAsync(args, [
        "--json",
        "--checkBoard",
        "--server",
        server,
        "--host",
        macHost.host,
        "--port",
        String(macHost.port),
        "--timeoutMs",
        "1200",
      ]);
      assert(result.status === 0, `post-pass manual UX standby JSON should stay non-failing\n${result.stdout}\n${result.stderr}`);
      const payload = parseJson(result.stdout, "post-pass manual UX standby resume status");
      assert(payload.host?.online === true, "post-pass standby fixture should keep Mac host online");
      assert(payload.board?.macManualUxStandby?.status === "standby", "post-pass standby JSON should expose manual UX standby status");
      assert(payload.board.macManualUxStandby.checklist === "connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics", "post-pass standby JSON should expose the manual UX checklist");
      assert(payload.recommendations.some((item) => item.id === "manual-ux-standby" && /hand[- ]off|手工体验/i.test(item.text)), "post-pass standby recommendations should point to manual UX testing");
      assert(String(payload.boardSummary || "").includes("ManualUxStandby=MAC_STANDING_BY_FOR_MANUAL_UX_TEST"), "post-pass standby boardSummary should expose ManualUxStandby");
      assert(String(payload.boardSummary || "").includes("ManualUxChecklist=connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics"), "post-pass standby boardSummary should expose ManualUxChecklist");
      assert(!String(payload.boardSummary || "").includes("Next formal path"), "post-pass standby boardSummary should not send Mac back to the formal E2E path");
      assertNoPasswordLeak(result, "post-pass manual UX standby JSON");
    }, {
      statuses: {
        "Mac Codex": {
          status: "idle",
          role: "Mac 端",
          note: standbyStatus,
        },
      },
      events: [],
    });

    await withFakeBoard(null, async (server) => {
      const result = await runAsync(args, [
        "--json",
        "--checkBoard",
        "--server",
        server,
        "--host",
        macHost.host,
        "--port",
        String(macHost.port),
        "--timeoutMs",
        "1200",
      ]);
      assert(result.status === 0, `stale manual UX event should stay non-failing\n${result.stdout}\n${result.stderr}`);
      const payload = parseJson(result.stdout, "stale manual UX event resume status");
      assert(!payload.board?.macManualUxStandby, "manual UX standby should ignore stale historical events when current statuses do not carry the signal");
      assert(String(payload.boardSummary || "").includes("Next formal path"), "without a current standby signal, boardSummary should keep the normal formal path guidance");
      assert(!String(payload.boardSummary || "").includes("ManualUxStandby="), "stale event should not create ManualUxStandby boardSummary");
      assertNoPasswordLeak(result, "stale manual UX event JSON");
    }, {
      statuses: {
        "Mac Codex": {
          status: "coding",
          role: "Mac 端",
          note: "当前正在开发下一轮补丁，没有声明手工体验待命。",
        },
      },
      events: [
        {
          id: "stale-manual-ux",
          at: "2026-06-19T16:00:00.000Z",
          type: "status",
          device: "Mac Codex",
          text: standbyStatus,
        },
      ],
    });
  }, { capturePipeline: "screencapturekit-h264" });
  print("OK", "Post-pass Mac resume status promotes manual UX standby instead of formal rerun");
}

async function checkUsableEntryCallUsesManualUxPath(args) {
  const call = {
    status: "CALLING",
    goal: "强制可用化：尽快交付用户可打开、可连接、可远程 Mac 的第一版入口",
    from: "Supervisor Codex",
    need: "Windows Codex, Mac Codex",
    expected: "Windows 提供最短启动入口，Mac 保持 host/client/heartbeat 在线并配合手工体验测试。",
    ask: "停止外围完善，直接推进可用入口和手工体验测试。",
  };
  await withFakeMacHost(async (macHost) => {
    await withFakeBoard(call, async (server) => {
      const result = await runAsync(args, [
        "--json",
        "--checkBoard",
        "--server",
        server,
        "--host",
        macHost.host,
        "--port",
        String(macHost.port),
        "--timeoutMs",
        "1200",
      ]);
      assert(result.status === 0, `usable-entry call JSON should stay non-failing\n${result.stdout}\n${result.stderr}`);
      const payload = parseJson(result.stdout, "usable-entry call resume status");
      assert(payload.board?.activeCall === true, "usable-entry call JSON should keep the active call");
      assert(payload.board?.macManualUxStandby?.status === "standby", "usable-entry call should promote manual UX standby");
      assert(payload.board.macManualUxStandby.checklist === manualUxChecklist, "usable-entry call should use the default manual UX checklist");
      assert(payload.recommendations.some((item) => item.id === "manual-ux-standby"), "usable-entry call should recommend manual UX validation");
      assert(String(payload.boardSummary || "").includes("ManualUxStandby=MacManualUxStandby"), "usable-entry boardSummary should expose manual UX standby");
      assert(String(payload.boardSummary || "").includes(`ManualUxChecklist=${manualUxChecklist}`), "usable-entry boardSummary should expose the default checklist");
      assert(!String(payload.boardSummary || "").includes("Next formal path"), "usable-entry boardSummary should not point back to formal E2E");
      assertNoPasswordLeak(result, "usable-entry call JSON");
    }, {
      statuses: {
        "Mac Codex": {
          status: "coding",
          role: "Mac 端",
          note: "正在按强制可用化 call 刷新 Mac 可用证据，没有单独重复 MAC_STANDING_BY_FOR_MANUAL_UX_TEST。",
        },
      },
      events: [],
    });
  }, { capturePipeline: "screencapturekit-h264" });
  print("OK", "Usable-entry currentCall keeps Mac resume on manual UX path");
}

async function checkBoardMacManualUxSummary(args) {
  const reconfirmCommand = "node scripts/mac/check-mac-manual-ux-status.mjs --server http://192.168.31.68:17888 --reconfirmCall --json";
  const macManualUxSummary = `MacManualUx=status=calling ManualUxChecklist=${manualUxChecklist} ManualUxLabels=连接/画面/声音/剪贴板/文件/窗口/全屏/原画/复制诊断 Signals=manualChecklist,manualUxCallInProgress Target=unknown Next=ReconfirmManualUxCall Safety=no-password,no-input-inject NoFormalE2ERerun=true ManualUxReconfirmCommand=${reconfirmCommand} ManualUxCall=timeout ManualUxCallAgeMs=660000 ManualUxCallOverdueMs=60000 warnings=manual-ux-call-timeout`;
  await withFakeBoard(null, async (server) => {
    const result = run(args, [
      "--json",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "1200",
    ]);
    assert(result.status === 0, `MacManualUx summary JSON should stay non-failing\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "MacManualUx summary resume status");
    assert(payload.board?.macManualUx?.status === "calling", "MacManualUx JSON should expose calling status");
    assert(payload.board.macManualUx.next === "ReconfirmManualUxCall", "MacManualUx JSON should expose next action");
    assert(payload.board.macManualUx.manualUxCall === "timeout", "MacManualUx JSON should expose timeout call state");
    assert(payload.board.macManualUx.manualUxReconfirmCommand === reconfirmCommand, "MacManualUx JSON should expose the safe reconfirm command");
    assert(String(payload.boardSummary || "").includes("MacManualUx=status=calling"), "board summary should expose MacManualUx current status");
    assert(String(payload.boardSummary || "").includes("ManualUxReconfirmCommand="), "board summary should expose the safe reconfirm command label");
    assert(String(payload.boardSummary || "").includes("--reconfirmCall"), "board summary should keep the reconfirm flag visible");
    assertNoPasswordLeak(result, "MacManualUx summary JSON");
  }, {
    statuses: {
      "Mac Manual UX": {
        status: "manual-ux-calling",
        role: "Mac 端",
        note: macManualUxSummary,
      },
      "Mac Codex": {
        status: "idle",
        role: "Mac 端",
        note: "Mac 端空闲，没有重复手工体验摘要。",
      },
    },
    events: [],
  });

  const unsafeMacManualUxSummary = `MacManualUx=status=calling ManualUxChecklist=${manualUxChecklist} ManualUxLabels=连接/画面/声音/剪贴板/文件/窗口/全屏/原画/复制诊断 Signals=manualChecklist Target=unknown Next=ReconfirmManualUxCall Safety=no-password,no-input-inject NoFormalE2ERerun=true ManualUxReconfirmCommand=${reconfirmCommand} --password leaked ManualUxCall=timeout warnings=manual-ux-call-timeout`;
  await withFakeBoard(null, async (server) => {
    const result = run(args, [
      "--json",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "1200",
    ]);
    assert(result.status === 0, `unsafe MacManualUx summary JSON should stay non-failing\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "unsafe MacManualUx summary resume status");
    assert(!payload.board?.macManualUx, "unsafe MacManualUx summary should not be promoted");
    assert(!String(payload.boardSummary || "").includes("MacManualUx=status=calling"), "unsafe board summary should not expose MacManualUx");
    assert(!String(result.stdout || "").includes("--password leaked"), "unsafe output should not echo password-like reconfirm text");
    assertNoPasswordLeak(result, "unsafe MacManualUx summary JSON");
  }, {
    statuses: {
      "Mac Manual UX": {
        status: "manual-ux-calling",
        role: "Mac 端",
        note: unsafeMacManualUxSummary,
      },
    },
    events: [],
  });
  print("OK", "Agent Link Board MacManualUx summary is surfaced safely");
}

async function checkBoardMacClientDiscoverWindowsSummary(args) {
  const windowsHostStatusCommand = "node scripts/windows/start-windows-host.mjs --status --host 127.0.0.1 --port 43770 --boardSummary";
  const windowsHostReadinessCommand = "node scripts/windows/check-windows-host-readiness.mjs --host 127.0.0.1 --port 43770 --checkBoard --boardSummary";
  const discoveryNote = `Windows host discovery: no Windows host found after scanning 0 candidate(s). ScannerWarning=timeout. Ask Windows Codex to start Windows host and share IP/port, then rerun Mac formal check. WindowsHostStatus=${windowsHostStatusCommand}. WindowsHostReadiness=${windowsHostReadinessCommand}. No password was requested or sent; no WebSocket/input/inject was attempted.`;
  await withFakeBoard(null, async (server) => {
    const result = run(args, [
      "--json",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "1200",
    ]);
    assert(result.status === 0, `Mac Client Discover Windows summary JSON should stay non-failing\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "Mac Client Discover Windows summary resume status");
    assert(payload.board?.macClientDiscoverWindows?.status === "windows-discovery-timeout", "Mac Client Discover Windows JSON should expose timeout status");
    assert(payload.board.macClientDiscoverWindows.scannerWarning === "timeout", "Mac Client Discover Windows JSON should expose scanner timeout warning");
    assertWindowsHostStatusCommand(payload.board.macClientDiscoverWindows.windowsHostStatusCommand || "", "Mac Client Discover Windows JSON Windows host status command");
    assertWindowsHostReadinessCommand(payload.board.macClientDiscoverWindows.windowsHostReadinessCommand || "", "Mac Client Discover Windows JSON Windows host readiness command");
    assertMacClientDiscoverWindowsCallCommand(payload.commands?.macClientDiscoverWindowsCallCommand || "", "Mac Client Discover Windows JSON call command");
    assert(String(payload.boardSummary || "").includes("MacClientDiscoverWindowsStatus=windows-discovery-timeout"), "board summary should expose Mac Client Discover Windows status");
    assert(String(payload.boardSummary || "").includes("ScannerWarning=timeout"), "board summary should expose scanner timeout");
    assert(String(payload.boardSummary || "").includes("WindowsHostStatus="), "board summary should expose Windows host status command label");
    assert(String(payload.boardSummary || "").includes("WindowsHostReadiness="), "board summary should expose Windows host readiness command label");
    assert(String(payload.boardSummary || "").includes("MacClientDiscoverWindowsCall="), "board summary should expose the explicit discovery call command label");
    assert(String(payload.boardSummary || "").includes("--sendCall"), "board summary should make the explicit discovery call flag visible");
    assertNoPasswordLeak(result, "Mac Client Discover Windows summary JSON");
  }, {
    statuses: {
      "Mac Client Discover Windows": {
        status: "windows-discovery-timeout",
        role: "Mac 端",
        note: discoveryNote,
      },
      "Mac Codex": {
        status: "idle",
        role: "Mac 端",
        note: "Mac 端空闲，没有重复 Windows discovery 摘要。",
      },
    },
    events: [],
  });

  const unsafeDiscoveryNote = `${discoveryNote} --password leaked`;
  await withFakeBoard(null, async (server) => {
    const result = run(args, [
      "--json",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "1200",
    ]);
    assert(result.status === 0, `unsafe Mac Client Discover Windows summary JSON should stay non-failing\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "unsafe Mac Client Discover Windows summary resume status");
    assert(!payload.board?.macClientDiscoverWindows, "unsafe Mac Client Discover Windows summary should not be promoted");
    assert(!String(payload.boardSummary || "").includes("MacClientDiscoverWindowsStatus=windows-discovery-timeout"), "unsafe board summary should not expose Mac Client Discover Windows status");
    assert(!String(result.stdout || "").includes("--password leaked"), "unsafe output should not echo password-like discovery text");
    assertNoPasswordLeak(result, "unsafe Mac Client Discover Windows summary JSON");
  }, {
    statuses: {
      "Mac Client Discover Windows": {
        status: "windows-discovery-timeout",
        role: "Mac 端",
        note: unsafeDiscoveryNote,
      },
    },
    events: [],
  });
  print("OK", "Agent Link Board Mac Client Discover Windows summary is surfaced safely");
}

async function checkBoardMacEvidence(args) {
  const cleanHeartbeat = "MacHeartbeat=status=ok; checkedAt=2026-06-19T04:54:22.847Z; device=Mac; macHost=online 127.0.0.1:43770; macClient=online http://127.0.0.1:5188/; board=ok call=none; blockers=none warnings=none reason=ok. Evidence=MacClientPageOnline,MacClientDiagnosticsOk.";
  await withFakeBoard(null, async (server) => {
    const result = run(args, [
      "--json",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "1200",
    ]);
    assert(result.status === 0, `clean Mac evidence JSON should stay non-failing\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "clean Mac evidence resume status");
    assert(payload.board?.checked === true, "clean Mac evidence JSON should mark board checked");
    assert(payload.board?.ok === true, "clean Mac evidence JSON should mark board ok");
    assert(Array.isArray(payload.board?.macEvidence), "clean Mac evidence JSON should expose board.macEvidence");
    assert(payload.board.macEvidence.includes("MacClientPageOnline"), "clean Mac evidence should include MacClientPageOnline");
    assert(payload.board.macEvidence.includes("MacClientDiagnosticsOk"), "clean Mac evidence should include MacClientDiagnosticsOk");
    assert(String(payload.boardSummary || "").includes("MacEvidence=MacClientPageOnline,MacClientDiagnosticsOk;"), "board summary should expose clean MacEvidence as a standalone segment");
    assertNoPasswordLeak(result, "clean Mac evidence JSON");
  }, {
    statuses: {
      "Mac Heartbeat": {
        status: "online",
        role: "Mac heartbeat",
        note: cleanHeartbeat,
      },
    },
    events: [
      {
        id: "event-clean-mac-evidence",
        at: new Date().toISOString(),
        type: "status",
        device: "Mac Heartbeat",
        text: cleanHeartbeat,
      },
    ],
  });

  const riskyHeartbeat = "MacHeartbeat=status=blocked; checkedAt=2026-06-19T04:54:22.847Z; device=Mac; macHost=offline; macClient=offline; board=ok call=none; blockers=mac-host-offline warnings=none reason=blocked. Evidence=MacClientDiagnosticsOk.";
  await withFakeBoard(null, async (server) => {
    const result = run(args, [
      "--json",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "1200",
    ]);
    assert(result.status === 0, `risky Mac evidence JSON should stay non-failing\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "risky Mac evidence resume status");
    assert(Array.isArray(payload.board?.macEvidence), "risky Mac evidence JSON should still expose board.macEvidence array");
    assert(payload.board.macEvidence.length === 0, "risky Mac evidence should not be promoted");
    assert(!String(payload.boardSummary || "").includes("MacEvidence="), "risky board summary should not expose MacEvidence");
    assertNoPasswordLeak(result, "risky Mac evidence JSON");
  }, {
    statuses: {
      "Mac Heartbeat": {
        status: "offline",
        role: "Mac heartbeat",
        note: riskyHeartbeat,
      },
    },
    events: [
      {
        id: "event-risky-mac-evidence",
        at: new Date().toISOString(),
        type: "status",
        device: "Mac Heartbeat",
        text: riskyHeartbeat,
      },
    ],
  });
  print("OK", "Agent Link Board clean MacEvidence is surfaced while risky evidence is ignored");
}

async function checkBoardMacPowerHealth(args) {
  const cleanPower = "Mac unattended status: host=online inputMode=log build=ed937a2; power=sleep=ac-power:1 displaySleep=ac-power:10 networkWake=ac-power:1; MacPowerHealth=warning reason=system-sleep-enabled warnings=system-sleep-enabled,display-sleep-enabled checkedAt=2026-06-19T07:23:38.703Z; MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded,power checkedAt=2026-06-19T07:23:38.703Z; MacHostAuthPath=prompt-password-required reason=launch-agent-ephemeral-password mode=ephemeral next=MacHostStop->MacMaxFpsSafeStart->MacHostMedia; attention=2 warning(s) blockers=none warnings=launch-agent-not-loaded,power.";
  await withFakeBoard(null, async (server) => {
    const result = run(args, [
      "--json",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "1200",
    ]);
    assert(result.status === 0, `Mac power health JSON should stay non-failing\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "Mac power health resume status");
    assert(payload.board?.checked === true, "Mac power health JSON should mark board checked");
    assert(payload.board?.ok === true, "Mac power health JSON should mark board ok");
    assert(payload.board?.macPowerHealth?.status === "warning", "Mac power health JSON should expose warning status");
    assert(payload.board?.macPowerHealth?.reason === "system-sleep-enabled", "Mac power health JSON should expose reason");
    assert(payload.board?.macPowerHealth?.warnings === "system-sleep-enabled,display-sleep-enabled", "Mac power health JSON should expose detailed warning tags");
    assert(payload.board?.macPowerHealth?.checkedAt === "2026-06-19T07:23:38.703Z", "Mac power health JSON should expose checkedAt");
    assert(payload.board?.macUnattendedHealth?.status === "warning", "Mac unattended health JSON should expose warning status");
    assert(payload.board?.macUnattendedHealth?.reason === "launch-agent-not-loaded", "Mac unattended health JSON should expose reason");
    assert(payload.board?.macUnattendedHealth?.blockers === "none", "Mac unattended health JSON should expose blockers");
    assert(payload.board?.macUnattendedHealth?.warnings === "launch-agent-not-loaded,power", "Mac unattended health JSON should expose detailed warning tags");
    assert(payload.board?.macUnattendedHealth?.checkedAt === "2026-06-19T07:23:38.703Z", "Mac unattended health JSON should expose checkedAt");
    assertMacUnattendedFreshness(payload.board?.macUnattendedFreshness, "stale", "Mac unattended freshness JSON");
    assert(payload.board?.macUnattendedFreshness?.checkedAt === "2026-06-19T07:23:38.703Z", "Mac unattended freshness JSON should reuse the board checkedAt");
    assert(payload.board?.macUnattendedFreshness?.source === "MacUnattendedHealth", "Mac unattended freshness should prefer MacUnattendedHealth over MacPowerHealth");
    assertMacHostAuthPath(payload.board?.macHostAuthPath, {
      status: "prompt-password-required",
      reason: "launch-agent-ephemeral-password",
      mode: "ephemeral",
      next: "MacHostStop->MacMaxFpsSafeStart->MacHostMedia",
    }, "Mac host auth path JSON");
    assert(String(payload.boardSummary || "").includes("MacPowerHealth=warning reason=system-sleep-enabled warnings=system-sleep-enabled,display-sleep-enabled checkedAt=2026-06-19T07:23:38.703Z;"), "board summary should expose MacPowerHealth as a standalone segment");
    assert(String(payload.boardSummary || "").includes("MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded,power checkedAt=2026-06-19T07:23:38.703Z;"), "board summary should expose MacUnattendedHealth as a standalone segment");
    assert(String(payload.boardSummary || "").includes("MacUnattendedFreshness=stale"), "board summary should expose stale Mac unattended freshness");
    assert(String(payload.boardSummary || "").includes("MacHostAuthPath=prompt-password-required reason=launch-agent-ephemeral-password mode=ephemeral next=MacHostStop->MacMaxFpsSafeStart->MacHostMedia;"), "board summary should expose MacHostAuthPath as a standalone segment");
    assert(String(payload.boardSummary || "").includes("thresholdMs=600000"), "board summary should include the freshness threshold");
    assert(String(payload.boardSummary || "").includes("checkedAt=2026-06-19T07:23:38.703Z"), "board summary should include freshness checkedAt");
    assert(String(payload.boardSummary || "").includes("source=MacUnattendedHealth"), "board summary should include the freshness source");
    assert(String(payload.boardSummary || "").includes("MacPowerPlan=node scripts/mac/plan-mac-power-settings.mjs"), "board summary should include a safe Mac power settings dry-run plan");
    assertMacPowerPlanCommand(payload.commands?.macPowerPlanCommand || "", "Mac power health JSON Mac power settings planner command");
    assert(String(payload.boardSummary || "").includes("MacRemoteAudioPlan=node scripts/mac/plan-mac-remote-audio.mjs"), "board summary should include a safe Mac remote-only audio dry-run plan");
    assertMacRemoteAudioPlanCommand(payload.commands?.macRemoteAudioPlanCommand || "", "Mac power health JSON Mac remote-only audio planner command");
    assert(String(payload.boardSummary || "").includes("MacInputSafetyPlan=node scripts/mac/plan-mac-input-safety.mjs"), "board summary should include a safe Mac input safety dry-run plan");
    assertMacInputSafetyPlanCommand(payload.commands?.macInputSafetyPlanCommand || "", "Mac power health JSON Mac input safety planner command");
    assertNoPasswordLeak(result, "Mac power health JSON");
  }, {
    statuses: {
      "Mac Unattended": {
        status: "warning",
        role: "Mac 值守",
        note: cleanPower,
      },
    },
  });

  const staleEventPower = "Mac unattended status: MacPowerHealth=warning reason=system-sleep-enabled warnings=system-sleep-enabled,display-sleep-enabled checkedAt=2026-06-19T07:23:38.703Z; MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded,power checkedAt=2026-06-19T07:23:38.703Z;";
  const freshStatusPower = "Mac unattended status: MacPowerHealth=warning reason=system-sleep-enabled warnings=system-sleep-enabled,display-sleep-enabled checkedAt=2026-06-19T10:30:22.477Z; MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded,power checkedAt=2026-06-19T10:30:22.477Z;";
  await withFakeBoard(null, async (server) => {
    const result = run(args, [
      "--json",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "1200",
    ]);
    assert(result.status === 0, `current Mac unattended status should win over stale events\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "current Mac unattended freshness resume status");
    assert(payload.board?.macPowerHealth?.checkedAt === "2026-06-19T10:30:22.477Z", "Mac power health should prefer current status over stale event text");
    assert(payload.board?.macUnattendedHealth?.checkedAt === "2026-06-19T10:30:22.477Z", "Mac unattended health should prefer current status over stale event text");
    assert(payload.board?.macUnattendedFreshness?.checkedAt === "2026-06-19T10:30:22.477Z", "Mac unattended freshness should prefer current status over stale event text");
    assert(String(payload.boardSummary || "").includes("checkedAt=2026-06-19T10:30:22.477Z"), "board summary should use current status freshness timestamp");
  }, {
    statuses: {
      "Mac Unattended": {
        status: "warning",
        role: "Mac 值守",
        note: freshStatusPower,
      },
    },
    events: [
      {
        id: "stale-mac-unattended",
        at: "2026-06-19T10:29:00.000Z",
        type: "status",
        from: "Mac Unattended",
        text: staleEventPower,
      },
    ],
  });

  const staleHeartbeatPower = "MacHeartbeat=status=ok; MacPowerHealth=ok reason=ok warnings=none checkedAt=2026-06-19T13:52:50.216Z. MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded,power checkedAt=2026-06-19T13:52:50.216Z. MacUnattendedFreshness=fresh checkedAt=2026-06-19T13:52:50.216Z source=MacUnattendedHealth.";
  const currentAccessibilityPower = "Mac unattended status: MacPowerHealth=ok reason=ok warnings=none checkedAt=2026-06-19T15:01:42.855Z; MacUnattendedHealth=warning reason=accessibility blockers=none warnings=accessibility checkedAt=2026-06-19T15:01:42.855Z;";
  await withFakeBoard(null, async (server) => {
    const result = run(args, [
      "--json",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "1200",
    ]);
    assert(result.status === 0, `current Mac unattended status should win over stale heartbeat status\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "current Mac unattended over stale heartbeat resume status");
    assert(payload.board?.macUnattendedHealth?.reason === "accessibility", "Mac unattended health should accept current accessibility reason");
    assert(payload.board?.macUnattendedHealth?.warnings === "accessibility", "Mac unattended health should expose current accessibility warning");
    assert(payload.board?.macUnattendedHealth?.checkedAt === "2026-06-19T15:01:42.855Z", "Mac unattended health should prefer current status over stale heartbeat text");
    assert(payload.board?.macUnattendedFreshness?.source === "MacUnattendedHealth", "Mac unattended freshness should use current MacUnattendedHealth");
    assert(String(payload.boardSummary || "").includes("MacUnattendedHealth=warning reason=accessibility blockers=none warnings=accessibility checkedAt=2026-06-19T15:01:42.855Z;"), "board summary should expose current accessibility MacUnattendedHealth");
    assert(!String(payload.boardSummary || "").includes("MacUnattendedHealth=warning reason=launch-agent-not-loaded"), "board summary should not echo stale heartbeat MacUnattendedHealth");
    assertNoPasswordLeak(result, "current Mac unattended over stale heartbeat JSON");
  }, {
    statuses: {
      "Mac Heartbeat": {
        status: "online",
        role: "Mac watchdog",
        note: staleHeartbeatPower,
      },
      "Mac Unattended": {
        status: "warning",
        role: "Mac 值守",
        note: currentAccessibilityPower,
      },
    },
    events: [],
  });

  const riskyPower = "MacPowerHealth=warning reason=--password warnings=system-sleep-enabled checkedAt=2026-06-19T07:23:38.703Z; MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=fake-token-value checkedAt=2026-06-19T07:23:38.703Z; fake-board-token";
  await withFakeBoard(null, async (server) => {
    const result = run(args, [
      "--json",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "1200",
    ]);
    assert(result.status === 0, `risky Mac power health JSON should stay non-failing\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "risky Mac power health resume status");
    assert(!payload.board?.macPowerHealth, "risky Mac power health should not be promoted");
    assert(!payload.board?.macUnattendedHealth, "risky Mac unattended health should not be promoted");
    assert(!payload.board?.macUnattendedFreshness, "risky Mac power health should not create freshness");
    assert(!String(payload.boardSummary || "").includes("MacPowerHealth="), "risky board summary should not expose MacPowerHealth");
    assert(!String(payload.boardSummary || "").includes("MacUnattendedHealth="), "risky board summary should not expose MacUnattendedHealth");
    assert(!String(payload.boardSummary || "").includes("MacUnattendedFreshness="), "risky board summary should not expose freshness");
    assert(!String(result.stdout || "").includes("fake-token-value"), "risky output should not expose unsafe MacUnattendedHealth warning token");
    assertNoPasswordLeak(result, "risky Mac power health JSON");
  }, {
    statuses: {
      "Mac Unattended": {
        status: "warning",
        role: "Mac 值守",
        note: riskyPower,
      },
    },
  });
  print("OK", "Agent Link Board MacPowerHealth, MacUnattendedHealth, and MacUnattendedFreshness are surfaced safely");
}

async function checkBoardDoneCall(args) {
  const call = {
    status: "DONE",
    goal: "历史安全注入验收",
    from: "Windows Codex",
    need: "Mac Codex",
    connection: "192.168.31.122:43770",
    command: "completed safe probe",
  };
  await withFakeBoard(call, async (server) => {
    const result = run(args, [
      "--json",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "1200",
    ]);
    assert(result.status === 0, `done currentCall JSON should stay non-failing\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "done currentCall resume status");
    assert(payload.board?.activeCall === false, "DONE currentCall should not be active");
    assert(String(payload.boardSummary || "").includes("call=done"), "board summary should mark DONE call as done");
    assert(!payload.recommendations.some((item) => /active call/.test(item.text)), "DONE call should not create active-call recommendation");
    assertNoPasswordLeak(result, "done currentCall JSON");
  });
  print("OK", "DONE Agent Link Board currentCall is not treated as active work");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  checkOfflineJson(args);
  checkRequireOnlineFails(args);
  checkOfflineBoardSummary(args);
  checkOfflinePlainReport(args);
  checkOnlineJson(args);
  checkOnlineBoardSummary(args);
  await checkMaxFpsPlanWarning(args);
  await checkStaleBuildSuggestedAction(args);
  await checkDiscoveryBackgroundJpegDoesNotWarn(args);
  checkPasswordRedaction(args);
  await checkBoardCurrentCall(args);
  await checkPostPassManualUxStandby(args);
  await checkUsableEntryCallUsesManualUxPath(args);
  await checkBoardMacManualUxSummary(args);
  await checkBoardMacClientDiscoverWindowsSummary(args);
  await checkBoardMacEvidence(args);
  await checkBoardMacPowerHealth(args);
  await checkBoardDoneCall(args);
  print("OK", "Mac resume status self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
