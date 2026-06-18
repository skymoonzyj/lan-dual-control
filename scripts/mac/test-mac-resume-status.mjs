#!/usr/bin/env node
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/check-mac-resume-status.mjs";

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

function assertBoardSummaryShape(text, label) {
  assert(/Mac resume:/.test(text), `${label} should start with Mac resume summary`);
  assert(/repo=/.test(text), `${label} should include repo state`);
  assert(/heartbeatWatcher=/.test(text), `${label} should include Mac heartbeat watcher status`);
  assert(/lastHeartbeat=/.test(text), `${label} should include the last Mac heartbeat watcher observation`);
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
  assert(/CopyDiagnostics=Mac client 事件日志点击/.test(text), `${label} should include Mac client copy diagnostics action`);
  assert(/MacClientDiscoverWindows=/.test(text), `${label} should include Mac client Windows discovery guidance`);
  assert(/discover-windows-hosts\.mjs/.test(text), `${label} should include the Mac client Windows discovery command`);
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
  assert(/MacClientBrowserSelfTest=/.test(text), `${label} should include Mac client browser self-test guidance`);
  assert(/scripts\/mac\/test-mac-client-browser-self-test-wrapper\.mjs/.test(text), `${label} should include the Mac client browser self-test command`);
  assert(/MacHeartbeatOnce=/.test(text), `${label} should include Mac heartbeat one-shot guidance`);
  assert(/MacHeartbeatOnce=.*watch-mac-heartbeat\.mjs/.test(text), `${label} should include the Mac heartbeat one-shot command`);
  assert(/MacHeartbeatWatch=/.test(text), `${label} should include Mac heartbeat continuous watcher guidance`);
  assert(/MacHeartbeatWatch=.*watch-mac-heartbeat\.mjs/.test(text), `${label} should include the Mac heartbeat continuous watcher command`);
  assert(/MacHeartbeatStart=/.test(text), `${label} should include Mac heartbeat background start guidance`);
  assert(/MacHeartbeatStart=.*start-mac-heartbeat-watcher\.mjs/.test(text), `${label} should include the Mac heartbeat background start command`);
  assert(/MacHeartbeatStatus=/.test(text), `${label} should include Mac heartbeat background status guidance`);
  assert(/MacHeartbeatStatus=.*start-mac-heartbeat-watcher\.mjs/.test(text), `${label} should include the Mac heartbeat background status command`);
  assert(/MacHeartbeatStop=/.test(text), `${label} should include Mac heartbeat background stop guidance`);
  assert(/MacHeartbeatStop=.*start-mac-heartbeat-watcher\.mjs/.test(text), `${label} should include the Mac heartbeat background stop command`);
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
    assert(/commands\.macUnattendedFormalCommand/.test(result.stdout), `${script} ${flag} should document Mac unattended formal JSON field`);
    assert(/commands\.macLaunchAgentPlanCommand/.test(result.stdout), `${script} ${flag} should document Mac LaunchAgent planner JSON field`);
    assert(/commands\.macMaxFpsPlanCommand/.test(result.stdout), `${script} ${flag} should document Mac max-FPS planner JSON field`);
    assert(/commands\.macClientDiagnosticsCommand/.test(result.stdout), `${script} ${flag} should document Mac client diagnostics JSON field`);
    assert(/commands\.macClientPageStatusCommand/.test(result.stdout), `${script} ${flag} should document Mac client page status JSON field`);
    assert(/commands\.macClientDiscoverWindowsCommand/.test(result.stdout), `${script} ${flag} should document Mac client Windows discovery JSON field`);
    assert(/commands\.macClientFormalChecklistCommand/.test(result.stdout), `${script} ${flag} should document Mac client formal checklist JSON field`);
    assert(/commands\.macClientFormalSmokeCommand/.test(result.stdout), `${script} ${flag} should document Mac client formal smoke preflight JSON field`);
    assert(/commands\.macClientBrowserSelfTestCommand/.test(result.stdout), `${script} ${flag} should document Mac client browser self-test JSON field`);
    assert(/commands\.macHeartbeatOnceCommand/.test(result.stdout), `${script} ${flag} should document Mac heartbeat one-shot JSON field`);
    assert(/commands\.macHeartbeatWatchCommand/.test(result.stdout), `${script} ${flag} should document Mac heartbeat watcher JSON field`);
    assert(/commands\.macHeartbeatStartCommand/.test(result.stdout), `${script} ${flag} should document Mac heartbeat background start JSON field`);
    assert(/commands\.macHeartbeatStatusCommand/.test(result.stdout), `${script} ${flag} should document Mac heartbeat background status JSON field`);
    assert(/commands\.macHeartbeatStopCommand/.test(result.stdout), `${script} ${flag} should document Mac heartbeat background stop JSON field`);
    assert(/macHeartbeatWatcher/.test(result.stdout), `${script} ${flag} should document Mac heartbeat watcher status JSON field`);
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
  assertMacUnattendedFormalCommand(payload.commands?.macUnattendedFormalCommand || "", "offline JSON Mac unattended formal command");
  assertMacLaunchAgentPlanCommand(payload.commands?.macLaunchAgentPlanCommand || "", "offline JSON Mac LaunchAgent planner command");
  assertMacMaxFpsPlanCommand(payload.commands?.macMaxFpsPlanCommand || "", "offline JSON Mac max-FPS planner command");
  assertMacClientPageStatusCommand(payload.commands?.macClientPageStatusCommand || "", "offline JSON Mac client page status command");
  assertMacClientDiagnosticsCommand(payload.commands?.macClientDiagnosticsCommand || "", "offline JSON Mac client diagnostics command");
  assertMacClientDiscoverWindowsCommand(payload.commands?.macClientDiscoverWindowsCommand || "", "offline JSON Mac client Windows discovery command");
  assertMacClientReverseRehearsalAction(payload.commands?.macClientReverseRehearsalAction || "", "offline JSON Mac client reverse rehearsal action");
  assertMacClientFormalChecklistCommand(payload.commands?.macClientFormalChecklistCommand || "", "offline JSON Mac client formal checklist command");
  assertMacClientFormalSmokeCommand(payload.commands?.macClientFormalSmokeCommand || "", "offline JSON Mac client formal smoke preflight command");
  assertMacClientBrowserSelfTestCommand(payload.commands?.macClientBrowserSelfTestCommand || "", "offline JSON Mac client browser self-test command");
  assertMacHeartbeatOnceCommand(payload.commands?.macHeartbeatOnceCommand || "", "offline JSON Mac heartbeat one-shot command");
  assertMacHeartbeatWatchCommand(payload.commands?.macHeartbeatWatchCommand || "", "offline JSON Mac heartbeat watcher command");
  assertMacHeartbeatStartCommand(payload.commands?.macHeartbeatStartCommand || "", "offline JSON Mac heartbeat background start command");
  assertMacHeartbeatStatusCommand(payload.commands?.macHeartbeatStatusCommand || "", "offline JSON Mac heartbeat background status command");
  assertMacHeartbeatStopCommand(payload.commands?.macHeartbeatStopCommand || "", "offline JSON Mac heartbeat background stop command");
  assert(String(payload.commands?.macClientCopyDiagnosticsAction || "").includes("复制诊断"), "offline JSON should include copy diagnostics action");
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
  assert(String(result.stdout || "").includes("Mac formal local smoke:"), "plain report should include Mac formal local smoke label");
  assert(String(result.stdout || "").includes("Mac formal E2E preflight:"), "plain report should include Mac formal E2E preflight label");
  assert(String(result.stdout || "").includes("Mac 60Hz safe foreground start:"), "plain report should include Mac foreground 60Hz safe start label");
  assert(String(result.stdout || "").includes("Mac host readiness:"), "plain report should include low-risk Mac host readiness label");
  assert(String(result.stdout || "").includes("Mac unattended/startup status:"), "plain report should include Mac unattended/startup label");
  assert(String(result.stdout || "").includes("Mac unattended formal 60Hz gate:"), "plain report should include Mac unattended formal label");
  assert(String(result.stdout || "").includes("--requireLaunchAgentMaxFps"), "plain report should include Mac unattended formal max-FPS gate");
  assert(String(result.stdout || "").includes("Mac LaunchAgent dry-run plan:"), "plain report should include Mac LaunchAgent planner label");
  assert(String(result.stdout || "").includes("Mac max FPS dry-run plan:"), "plain report should include Mac max-FPS planner label");
  assert(String(result.stdout || "").includes("--maxScreenFps 60"), "plain report should include Mac max-FPS planner command");
  assert(String(result.stdout || "").includes("Mac client page status:"), "plain report should include Mac client page status label");
  assert(String(result.stdout || "").includes("Mac client discover Windows host:"), "plain report should include Mac client Windows discovery label");
  assert(String(result.stdout || "").includes("Mac client reverse rehearsal:"), "plain report should include Mac client reverse rehearsal label");
  assert(String(result.stdout || "").includes("Mac client formal checklist:"), "plain report should include Mac client formal checklist label");
  assert(String(result.stdout || "").includes("Mac client formal smoke preflight:"), "plain report should include Mac client formal smoke preflight label");
  assert(String(result.stdout || "").includes("Mac client browser self-test:"), "plain report should include Mac client browser self-test label");
  assert(String(result.stdout || "").includes("Mac heartbeat one-shot board update:"), "plain report should include Mac heartbeat one-shot label");
  assert(String(result.stdout || "").includes("Mac heartbeat continuous board watcher:"), "plain report should include Mac heartbeat watcher label");
  assert(String(result.stdout || "").includes("Mac heartbeat background start:"), "plain report should include Mac heartbeat background start label");
  assert(String(result.stdout || "").includes("Mac heartbeat background status:"), "plain report should include Mac heartbeat background status label");
  assert(String(result.stdout || "").includes("Mac heartbeat background stop:"), "plain report should include Mac heartbeat background stop label");
  assert(String(result.stdout || "").includes("Mac heartbeat watcher:"), "plain report should include Mac heartbeat watcher status");
  assert(String(result.stdout || "").includes("start-mac-client.mjs"), "plain report should include Mac client page status command");
  assert(String(result.stdout || "").includes("check-mac-client-readiness.mjs"), "plain report should include Mac client readiness command");
  assert(String(result.stdout || "").includes("discover-windows-hosts.mjs"), "plain report should include Mac client Windows discovery command");
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
  assertMacUnattendedFormalCommand(payload.commands?.macUnattendedFormalCommand || "", "online JSON Mac unattended formal command");
  assertMacLaunchAgentPlanCommand(payload.commands?.macLaunchAgentPlanCommand || "", "online JSON Mac LaunchAgent planner command");
  assertMacMaxFpsPlanCommand(payload.commands?.macMaxFpsPlanCommand || "", "online JSON Mac max-FPS planner command");
  assertMacClientPageStatusCommand(payload.commands?.macClientPageStatusCommand || "", "online JSON Mac client page status command");
  assertMacClientDiagnosticsCommand(payload.commands?.macClientDiagnosticsCommand || "", "online JSON Mac client diagnostics command");
  assertMacClientDiscoverWindowsCommand(payload.commands?.macClientDiscoverWindowsCommand || "", "online JSON Mac client Windows discovery command");
  assertMacClientReverseRehearsalAction(payload.commands?.macClientReverseRehearsalAction || "", "online JSON Mac client reverse rehearsal action");
  assertMacClientFormalChecklistCommand(payload.commands?.macClientFormalChecklistCommand || "", "online JSON Mac client formal checklist command");
  assertMacClientFormalSmokeCommand(payload.commands?.macClientFormalSmokeCommand || "", "online JSON Mac client formal smoke preflight command");
  assertMacClientBrowserSelfTestCommand(payload.commands?.macClientBrowserSelfTestCommand || "", "online JSON Mac client browser self-test command");
  assertMacHeartbeatOnceCommand(payload.commands?.macHeartbeatOnceCommand || "", "online JSON Mac heartbeat one-shot command");
  assertMacHeartbeatWatchCommand(payload.commands?.macHeartbeatWatchCommand || "", "online JSON Mac heartbeat watcher command");
  assertMacHeartbeatStartCommand(payload.commands?.macHeartbeatStartCommand || "", "online JSON Mac heartbeat background start command");
  assertMacHeartbeatStatusCommand(payload.commands?.macHeartbeatStatusCommand || "", "online JSON Mac heartbeat background status command");
  assertMacHeartbeatStopCommand(payload.commands?.macHeartbeatStopCommand || "", "online JSON Mac heartbeat background stop command");
  assert(String(payload.commands?.macClientCopyDiagnosticsAction || "").includes("连接密码"), "online JSON copy diagnostics action should mention password safety");
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
    assert(/warnings=[^.]*fps-limit/.test(String(payload.boardSummary || "")), "max-FPS boardSummary should include fps-limit warning ID");
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

async function checkH264FallbackPipelineWarning(args) {
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
    const payload = parseJson(result.stdout, "fallback pipeline resume status");
    assert(result.status === 0, `fallback pipeline warning should not fail resume status\n${result.stdout}\n${result.stderr}`);
    assert(payload.host?.online === true, "fallback pipeline payload should report host online");
    assert(payload.host?.capabilities?.capturePipeline === "background-jpeg", "fallback pipeline payload should preserve capturePipeline");
    assert(payload.recommendations.some((item) => item.id === "h264-fallback" && item.level === "warning" && /current capture pipeline is background-jpeg/.test(item.text)), "fallback pipeline should create a warning recommendation");
    assert(String(payload.boardSummary || "").includes("attention="), "fallback pipeline boardSummary should include attention");
    assert(String(payload.boardSummary || "").includes("blockers=none"), "fallback pipeline boardSummary should explicitly report no blockers");
    assert(/warnings=[^.]*h264-fallback/.test(String(payload.boardSummary || "")), "fallback pipeline boardSummary should include warning IDs");
    assert(!String(payload.boardSummary || "").includes("attention=none"), "fallback pipeline boardSummary should not say attention=none");
    assertNoPasswordLeak(result, "fallback pipeline resume status");
  });
  print("OK", "Resume status warns when H.264 is advertised but current pipeline is JPEG fallback");
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

async function withFakeBoard(call, callback) {
  const dir = mkdtempSync(path.join(tmpdir(), "lan-dual-mac-resume-board-"));
  const scriptPath = path.join(dir, "fake-board.mjs");
  const state = {
    currentCall: call,
    statuses: {},
    events: [
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
  await checkH264FallbackPipelineWarning(args);
  checkPasswordRedaction(args);
  await checkBoardCurrentCall(args);
  await checkBoardDoneCall(args);
  print("OK", "Mac resume status self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
