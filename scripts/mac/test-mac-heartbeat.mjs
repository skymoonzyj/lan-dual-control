#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/check-mac-heartbeat.mjs";

const defaults = {
  timeoutMs: 12000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-heartbeat.mjs [options]

Verifies check-mac-heartbeat help, warning output, fake-online output, and
codex-reconnect-stuck detection without authenticating, sending passwords,
input, or inject.

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks
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
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(3000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(text, expected, label) {
  assert(String(text).includes(expected), `${label} did not include ${JSON.stringify(expected)}.\n${text}`);
}

function assertNotIncludes(text, expected, label) {
  assert(!String(text).includes(expected), `${label} unexpectedly included ${JSON.stringify(expected)}.\n${text}`);
}

function assertIsoTimestamp(value, label) {
  assert(typeof value === "string" && Number.isFinite(Date.parse(value)), `${label} should be an ISO timestamp, got ${JSON.stringify(value)}`);
}

function run(extraArgs, args) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
  });
}

function runAsync(extraArgs, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...extraArgs], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: "",
      },
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
      resolve({ status, signal, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: null, signal: null, stdout, stderr: `${stderr}\n${error.message}`.trim() });
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

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function assertNoSecrets(text, label) {
  assertNotIncludes(text, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(text, "--password", label);
  assertNotIncludes(text, "super-secret-heartbeat", label);
  assertNotIncludes(text, "fake-token-value", label);
}

function assertHeartbeatHealth(payload, expectedStatus, expectedReason, label) {
  assert(payload.macHeartbeatHealth?.status === expectedStatus, `${label} should include macHeartbeatHealth.status=${expectedStatus}`);
  assert(payload.macHeartbeatHealth?.reason === expectedReason, `${label} should include macHeartbeatHealth.reason=${expectedReason}`);
  assertIncludes(payload.boardSummary || "", `MacHeartbeatHealth=${expectedStatus}`, `${label} board summary`);
  assertIncludes(payload.boardSummary || "", `reason=${expectedReason}`, `${label} board summary`);
}

function assertMacCodexHealth(payload, expectedStatus, expectedReason, label) {
  const health = payload.macCodexHealth;
  assert(health?.status === expectedStatus, `${label} should include macCodexHealth.status=${expectedStatus}`);
  assert(health?.reason === expectedReason, `${label} should include macCodexHealth.reason=${expectedReason}`);
  assert(typeof health.codexStatus === "string" && health.codexStatus.length > 0, `${label} should expose the Mac Codex board status`);
  assert(typeof health.updatedAt === "string", `${label} should expose a safe Mac Codex updatedAt field`);
  assert(Number.isFinite(health.ageMs) || health.ageMs === null, `${label} should expose numeric/null Mac Codex ageMs`);
  assert(Number.isFinite(health.thresholdMs), `${label} should expose a Mac Codex health threshold`);
  assertIncludes(payload.boardSummary || "", `MacCodexHealth=${expectedStatus}`, `${label} board summary`);
  assertIncludes(payload.boardSummary || "", `reason=${expectedReason}`, `${label} board summary`);
  assertIncludes(payload.boardSummary || "", "codexStatus=", `${label} board summary`);
  assertIncludes(payload.boardSummary || "", "thresholdMs=", `${label} board summary`);
}

function assertMacEvidence(payload, expected, label) {
  const actual = payload.macEvidence || [];
  assert(Array.isArray(actual), `${label} should include macEvidence[]`);
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} macEvidence should be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertMacPowerHealth(payload, expected, label) {
  assert(payload.board?.macPowerHealth?.status === expected.status, `${label} should expose MacPowerHealth status`);
  assert(payload.board?.macPowerHealth?.reason === expected.reason, `${label} should expose MacPowerHealth reason`);
  assert(payload.board?.macPowerHealth?.warnings === expected.warnings, `${label} should expose MacPowerHealth warnings`);
  assert(payload.board?.macPowerHealth?.checkedAt === expected.checkedAt, `${label} should expose MacPowerHealth checkedAt`);
}

function assertMacUnattendedHealth(payload, expected, label) {
  assert(payload.board?.macUnattendedHealth?.status === expected.status, `${label} should expose MacUnattendedHealth status`);
  assert(payload.board?.macUnattendedHealth?.reason === expected.reason, `${label} should expose MacUnattendedHealth reason`);
  assert(payload.board?.macUnattendedHealth?.blockers === expected.blockers, `${label} should expose MacUnattendedHealth blockers`);
  assert(payload.board?.macUnattendedHealth?.warnings === expected.warnings, `${label} should expose MacUnattendedHealth warnings`);
  assert(payload.board?.macUnattendedHealth?.checkedAt === expected.checkedAt, `${label} should expose MacUnattendedHealth checkedAt`);
}

function assertMacUnattendedFreshness(payload, expected, label) {
  const freshness = payload.board?.macUnattendedFreshness;
  assert(freshness?.status === expected.status, `${label} should expose MacUnattendedFreshness status`);
  assert(freshness?.checkedAt === expected.checkedAt, `${label} should expose MacUnattendedFreshness checkedAt`);
  assert(Number.isFinite(freshness?.checkedAgeMs), `${label} should expose MacUnattendedFreshness checkedAgeMs`);
  assert(freshness?.thresholdMs === 600000, `${label} should expose MacUnattendedFreshness thresholdMs`);
}

function assertMacHostAuthPath(payload, expected, label) {
  const authPath = payload.board?.macHostAuthPath;
  assert(authPath?.status === expected.status, `${label} should expose MacHostAuthPath status`);
  assert(authPath?.reason === expected.reason, `${label} should expose MacHostAuthPath reason`);
  assert(authPath?.mode === expected.mode, `${label} should expose MacHostAuthPath mode`);
  assert(authPath?.next === expected.next, `${label} should expose MacHostAuthPath next`);
}

function assertMacPowerPlanCommand(command, label) {
  assertIncludes(command || "", "plan-mac-power-settings.mjs", label);
  assertIncludes(command || "", "--profile all", label);
  assertIncludes(command || "", "--sleep 0", label);
  assertIncludes(command || "", "--displaySleep 0", label);
  assertIncludes(command || "", "--networkWake on", label);
  assertIncludes(command || "", "--boardSummary", label);
  assertNotIncludes(command || "", "--apply", label);
  assertNotIncludes(command || "", "sudo", label);
  assertNotIncludes(command || "", "--promptPassword", label);
  assertNotIncludes(command || "", "--password", label);
  assertNotIncludes(command || "", "--sendCall", label);
  assertNotIncludes(command || "", "--server", label);
  assertNotIncludes(command || "", "input_event", label);
  assertNotIncludes(command || "", "inject", label);
}

function assertMacRemoteAudioPlanCommand(command, label) {
  assertIncludes(command || "", "plan-mac-remote-audio.mjs", label);
  assertIncludes(command || "", "--boardSummary", label);
  assertNotIncludes(command || "", "--apply", label);
  assertNotIncludes(command || "", "sudo", label);
  assertNotIncludes(command || "", "--promptPassword", label);
  assertNotIncludes(command || "", "--password", label);
  assertNotIncludes(command || "", "--sendCall", label);
  assertNotIncludes(command || "", "--server", label);
  assertNotIncludes(command || "", "input_event", label);
  assertNotIncludes(command || "", "inject", label);
}

function assertMacRemoteAudioStatusCommand(command, label) {
  assertIncludes(command || "", "check-mac-remote-audio-status.mjs", label);
  assertIncludes(command || "", "--host", label);
  assertIncludes(command || "", "--port", label);
  assertIncludes(command || "", "--boardSummary", label);
  assertNotIncludes(command || "", "--apply", label);
  assertNotIncludes(command || "", "sudo", label);
  assertNotIncludes(command || "", "--promptPassword", label);
  assertNotIncludes(command || "", "--password", label);
  assertNotIncludes(command || "", "--sendCall", label);
  assertNotIncludes(command || "", "--server", label);
  assertNotIncludes(command || "", "--json", label);
  assertNotIncludes(command || "", "input_event", label);
  assertNotIncludes(command || "", "--inputMode inject", label);
}

function assertMacRemoteAudioSendStatusCommand(command, label) {
  assertIncludes(command || "", "check-mac-remote-audio-status.mjs", label);
  assertIncludes(command || "", "--host", label);
  assertIncludes(command || "", "--port", label);
  assertIncludes(command || "", "--server", label);
  assertIncludes(command || "", "--sendStatus", label);
  assertIncludes(command || "", "--boardSummary", label);
  assertNotIncludes(command || "", "--apply", label);
  assertNotIncludes(command || "", "sudo", label);
  assertNotIncludes(command || "", "--promptPassword", label);
  assertNotIncludes(command || "", "--password", label);
  assertNotIncludes(command || "", "--sendCall", label);
  assertNotIncludes(command || "", "--json", label);
  assertNotIncludes(command || "", "input_event", label);
  assertNotIncludes(command || "", "--inputMode inject", label);
}

function assertMacInputSafetyPlanCommand(command, label) {
  assertIncludes(command || "", "plan-mac-input-safety.mjs", label);
  assertIncludes(command || "", "--boardSummary", label);
  assertNotIncludes(command || "", "--apply", label);
  assertNotIncludes(command || "", "sudo", label);
  assertNotIncludes(command || "", "--promptPassword", label);
  assertNotIncludes(command || "", "--password", label);
  assertNotIncludes(command || "", "--sendCall", label);
  assertNotIncludes(command || "", "--server", label);
  assertNotIncludes(command || "", "input_event", label);
  assertNotIncludes(command || "", "inject", label);
}

function assertMacInputSafetyStatusCommand(command, label) {
  assertIncludes(command || "", "check-mac-input-safety-status.mjs", label);
  assertIncludes(command || "", "--host", label);
  assertIncludes(command || "", "--port", label);
  assertIncludes(command || "", "--checkBoard", label);
  assertIncludes(command || "", "--boardSummary", label);
  assertNotIncludes(command || "", "--promptPassword", label);
  assertNotIncludes(command || "", "--password", label);
  assertNotIncludes(command || "", "--sendCall", label);
  assertNotIncludes(command || "", "--server", label);
  assertNotIncludes(command || "", "--json", label);
  assertNotIncludes(command || "", "input_event", label);
  assertNotIncludes(command || "", "--inputMode inject", label);
}

function assertMacInputSafetySendStatusCommand(command, label) {
  assertIncludes(command || "", "check-mac-input-safety-status.mjs", label);
  assertIncludes(command || "", "--host", label);
  assertIncludes(command || "", "--port", label);
  assertIncludes(command || "", "--checkBoard", label);
  assertIncludes(command || "", "--server", label);
  assertIncludes(command || "", "--sendStatus", label);
  assertIncludes(command || "", "--boardSummary", label);
  assertNotIncludes(command || "", "--apply", label);
  assertNotIncludes(command || "", "sudo", label);
  assertNotIncludes(command || "", "--promptPassword", label);
  assertNotIncludes(command || "", "--password", label);
  assertNotIncludes(command || "", "--sendCall", label);
  assertNotIncludes(command || "", "--json", label);
  assertNotIncludes(command || "", "input_event", label);
  assertNotIncludes(command || "", "--inputMode inject", label);
}

function assertMacSafeInjectRehearsalCommand(command, label) {
  assertIncludes(command || "", "plan-mac-safe-inject-rehearsal.mjs", label);
  assertIncludes(command || "", "--host", label);
  assertIncludes(command || "", "--port", label);
  assertIncludes(command || "", "--checkBoard", label);
  assertIncludes(command || "", "--boardSummary", label);
  assertNotIncludes(command || "", "--promptPassword", label);
  assertNotIncludes(command || "", "--password", label);
  assertNotIncludes(command || "", "--sendCall", label);
  assertNotIncludes(command || "", "--server", label);
  assertNotIncludes(command || "", "--json", label);
  assertNotIncludes(command || "", "input_event", label);
  assertNotIncludes(command || "", "--inputMode inject", label);
}

function assertMacManualUxStatusCommand(command, label) {
  assertIncludes(command || "", "check-mac-manual-ux-status.mjs", label);
  assertIncludes(command || "", "--boardSummary", label);
  assertNotIncludes(command || "", "--promptPassword", label);
  assertNotIncludes(command || "", "--password", label);
  assertNotIncludes(command || "", "--sendCall", label);
  assertNotIncludes(command || "", "--server", label);
  assertNotIncludes(command || "", "--json", label);
  assertNotIncludes(command || "", "input_event", label);
  assertNotIncludes(command || "", "--inputMode inject", label);
}

function assertMacManualUxSendStatusCommand(command, label) {
  assertIncludes(command || "", "check-mac-manual-ux-status.mjs", label);
  assertIncludes(command || "", "--server", label);
  assertIncludes(command || "", "--sendStatus", label);
  assertIncludes(command || "", "--boardSummary", label);
  assertNotIncludes(command || "", "--sendMessage", label);
  assertNotIncludes(command || "", "--promptPassword", label);
  assertNotIncludes(command || "", "--password", label);
  assertNotIncludes(command || "", "--sendCall", label);
  assertNotIncludes(command || "", "--json", label);
  assertNotIncludes(command || "", "input_event", label);
  assertNotIncludes(command || "", "--inputMode inject", label);
}

function assertWindowsHostStatusCommand(command, label) {
  assertIncludes(command || "", "node scripts/windows/start-windows-host.mjs", label);
  assertIncludes(command || "", "--status", label);
  assertIncludes(command || "", "--host 127.0.0.1", label);
  assertIncludes(command || "", "--port 43770", label);
  assertIncludes(command || "", "--boardSummary", label);
  assertNotIncludes(command || "", "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(command || "", "--promptPassword", label);
  assertNotIncludes(command || "", "--password", label);
  assertNotIncludes(command || "", "--sendCall", label);
  assertNotIncludes(command || "", "--forceCall", label);
  assertNotIncludes(command || "", "--server", label);
  assertNotIncludes(command || "", "--json", label);
  assertNotIncludes(command || "", "input_event", label);
  assertNotIncludes(command || "", "inject", label);
}

function assertWindowsHostReadinessCommand(command, label) {
  assertIncludes(command || "", "node scripts/windows/check-windows-host-readiness.mjs", label);
  assertIncludes(command || "", "--host 127.0.0.1", label);
  assertIncludes(command || "", "--port 43770", label);
  assertIncludes(command || "", "--checkBoard", label);
  assertIncludes(command || "", "--boardSummary", label);
  assertNotIncludes(command || "", "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(command || "", "--promptPassword", label);
  assertNotIncludes(command || "", "--password", label);
  assertNotIncludes(command || "", "--sendCall", label);
  assertNotIncludes(command || "", "--forceCall", label);
  assertNotIncludes(command || "", "--server", label);
  assertNotIncludes(command || "", "--json", label);
  assertNotIncludes(command || "", "input_event", label);
  assertNotIncludes(command || "", "inject", label);
}

function assertWindowsHostBoardSummary(text, label) {
  assertIncludes(text || "", "WindowsHostStatus=node scripts/windows/start-windows-host.mjs --status --host 127.0.0.1 --port 43770 --boardSummary", label);
  assertIncludes(text || "", "WindowsHostReadiness=node scripts/windows/check-windows-host-readiness.mjs --host 127.0.0.1 --port 43770 --checkBoard --boardSummary", label);
}

function assertHeartbeatCriticalCommandsBeforeTruncation(text, label) {
  const limit = 3400;
  for (const key of [
    "MacClientDiscoverWindows=",
    "MacClientDiscoverWindowsCall=",
    "MacClientFormalChecklist=",
    "MacClientFormalSmoke=",
    "MacClientPromptPasswordSmoke=",
    "MacClientBrowserSelfTest=",
    "MacScriptHelp=",
  ]) {
    const position = String(text || "").indexOf(key);
    assert(position >= 0, `${label} should include ${key}`);
    assert(position < limit, `${label} should surface ${key} before ${limit} chars; got ${position}`);
  }
}

function assertMacClientDiscoverWindowsCallCommand(command, label) {
  assertIncludes(command || "", "node scripts/mac/discover-windows-hosts.mjs", label);
  assertIncludes(command || "", "--checkBoard", label);
  assertIncludes(command || "", "--sendCall", label);
  assertIncludes(command || "", "--boardSummary", label);
  assertNotIncludes(command || "", "--promptPassword", label);
  assertNotIncludes(command || "", "--password", label);
  assertNotIncludes(command || "", "--forceCall", label);
  assertNotIncludes(command || "", "--server", label);
  assertNotIncludes(command || "", "input_event", label);
  assertNotIncludes(command || "", "inject", label);
}

function assertMacClientManualChecklistAction(text, label) {
  assertIncludes(text || "", "手工清单", label);
  assertIncludes(text || "", "连接/视频/音频/剪贴板/文件/窗口/全屏/原画/input_ack/复制诊断", label);
  assertIncludes(text || "", "复制诊断", label);
  assertIncludes(text || "", "连接密码", label);
  assertNotIncludes(text || "", "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(text || "", "--password", label);
  assertNotIncludes(text || "", "--sendCall", label);
  assertNotIncludes(text || "", "input_event", label);
  assertNotIncludes(text || "", "LAN_DUAL_INPUT_MODE=inject", label);
}

function assertMacClientPasswordLocationAction(text, label) {
  assertIncludes(text || "", "Mac 页面密码框", label);
  assertIncludes(text || "", "Windows 临时密码", label);
  assertIncludes(text || "", "不要发到通讯板", label);
  assertIncludes(text || "", "不保存到最近连接或诊断", label);
  assertNotIncludes(text || "", "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(text || "", "--password", label);
  assertNotIncludes(text || "", "--sendCall", label);
  assertNotIncludes(text || "", "input_event", label);
  assertNotIncludes(text || "", "LAN_DUAL_INPUT_MODE=inject", label);
}

function assertMacLaunchAgentPlanCommand(command, label) {
  assertIncludes(command || "", "install-mac-host-launch-agent.mjs", label);
  assertIncludes(command || "", "--boardSummary", label);
  assertNotIncludes(command || "", "--write", label);
  assertNotIncludes(command || "", "--force", label);
  assertNotIncludes(command || "", "launchctl", label);
  assertNotIncludes(command || "", "--promptPassword", label);
  assertNotIncludes(command || "", "--password", label);
  assertNotIncludes(command || "", "--sendCall", label);
  assertNotIncludes(command || "", "--server", label);
  assertNotIncludes(command || "", "input_event", label);
  assertNotIncludes(command || "", "inject", label);
}

function assertCommandSet(commands, label) {
  assertIncludes(commands?.macHeartbeatCommand || "", "check-mac-heartbeat.mjs", label);
  assertIncludes(commands?.macHeartbeatCommand || "", "--checkBoard", label);
  assertIncludes(commands?.macHeartbeatRefreshRestartCommand || "", "start-mac-heartbeat-watcher.mjs", label);
  assertIncludes(commands?.macHeartbeatRefreshRestartCommand || "", "--restart", label);
  assertIncludes(commands?.macHeartbeatRefreshRestartCommand || "", "--refreshUnattended", label);
  assertIncludes(commands?.macHeartbeatRefreshRestartCommand || "", "--boardSummary", label);
  assertNotIncludes(commands?.macHeartbeatRefreshRestartCommand || "", "--promptPassword", label);
  assertNotIncludes(commands?.macHeartbeatRefreshRestartCommand || "", "--password", label);
  assertNotIncludes(commands?.macHeartbeatRefreshRestartCommand || "", "--sendCall", label);
  assertNotIncludes(commands?.macHeartbeatRefreshRestartCommand || "", "input_event", label);
  assertNotIncludes(commands?.macHeartbeatRefreshRestartCommand || "", "inject", label);
  assertIncludes(commands?.macResumeStatusCommand || "", "check-mac-resume-status.mjs", label);
  assertIncludes(commands?.macResumeStatusCommand || "", "--checkBoard", label);
  assertIncludes(commands?.macResumeStatusCommand || "", "--boardSummary", label);
  assertNotIncludes(commands?.macResumeStatusCommand || "", "--promptPassword", label);
  assertNotIncludes(commands?.macResumeStatusCommand || "", "--password", label);
  assertNotIncludes(commands?.macResumeStatusCommand || "", "--sendCall", label);
  assertNotIncludes(commands?.macResumeStatusCommand || "", "--forceCall", label);
  assertNotIncludes(commands?.macResumeStatusCommand || "", "input_event", label);
  assertNotIncludes(commands?.macResumeStatusCommand || "", "inject", label);
  assertIncludes(commands?.macHostSafeStartCommand || "", "start-mac-host.mjs", label);
  assertIncludes(commands?.macHostSafeStartCommand || "", "--promptPassword", label);
  assertIncludes(commands?.macHostSafeStartCommand || "", "--requirePassword", label);
  assertIncludes(commands?.macMaxFpsSafeStartCommand || "", "start-mac-host.mjs", label);
  assertIncludes(commands?.macMaxFpsSafeStartCommand || "", "--promptPassword", label);
  assertIncludes(commands?.macMaxFpsSafeStartCommand || "", "--requirePassword", label);
  assertIncludes(commands?.macMaxFpsSafeStartCommand || "", "--maxScreenFps 60", label);
  assertIncludes(commands?.macHostReadinessCommand || "", "check-mac-host-readiness.mjs", label);
  assertIncludes(commands?.macHostReadinessCommand || "", "--checkBoard", label);
  assertIncludes(commands?.macHostReadinessCommand || "", "--boardSummary", label);
  assertIncludes(commands?.macHostMediaCommand || "", "check-mac-host-readiness.mjs", label);
  assertIncludes(commands?.macHostMediaCommand || "", "--checkBoard", label);
  assertIncludes(commands?.macHostMediaCommand || "", "--probeMedia", label);
  assertIncludes(commands?.macHostMediaCommand || "", "--probeMediaResourceSample", label);
  assertIncludes(commands?.macHostMediaCommand || "", "--probeMediaFps 60", label);
  assertIncludes(commands?.macHostMediaCommand || "", "--probeMediaBandwidthKbps 20000", label);
  assertIncludes(commands?.macHostMediaCommand || "", "--probeMediaVideoDurationMs 5000", label);
  assertIncludes(commands?.macHostMediaCommand || "", "--probeMediaAudioDurationMs 5000", label);
  assertIncludes(commands?.macHostMediaCommand || "", "--probeMediaVideoMinFps 50", label);
  assertIncludes(commands?.macHostMediaCommand || "", "--promptPassword", label);
  assertIncludes(commands?.macHostMediaCommand || "", "--boardSummary", label);
  assertNotIncludes(commands?.macHostMediaCommand || "", "--password", label);
  assertNotIncludes(commands?.macHostMediaCommand || "", "--sendCall", label);
  assertNotIncludes(commands?.macHostMediaCommand || "", "input_event", label);
  assertNotIncludes(commands?.macHostMediaCommand || "", "inject", label);
  assertIncludes(commands?.macUnattendedStatusCommand || "", "check-mac-unattended-status.mjs", label);
  assertIncludes(commands?.macUnattendedStatusCommand || "", "--boardSummary", label);
  assertIncludes(commands?.macUnattendedSendStatusCommand || "", "check-mac-unattended-status.mjs", label);
  assertIncludes(commands?.macUnattendedSendStatusCommand || "", "--sendStatus", label);
  assertIncludes(commands?.macUnattendedSendStatusCommand || "", "--boardSummary", label);
  assertIncludes(commands?.macUnattendedFormalCommand || "", "check-mac-unattended-status.mjs", label);
  assertIncludes(commands?.macUnattendedFormalCommand || "", "--requireLaunchAgentMaxFps", label);
  assertIncludes(commands?.macUnattendedFormalCommand || "", "--requireLaunchAgentLoaded", label);
  assertIncludes(commands?.macUnattendedFormalCommand || "", "--boardSummary", label);
  assertMacPowerPlanCommand(commands?.macPowerPlanCommand || "", label);
  assertMacLaunchAgentPlanCommand(commands?.macLaunchAgentPlanCommand || "", label);
  assertIncludes(commands?.macLaunchAgentLoadCommand || "", "launchctl bootstrap", label);
  assertIncludes(commands?.macLaunchAgentLoadCommand || "", "Library/LaunchAgents/com.lan-dual-control.mac-host.plist", label);
  assertIncludes(commands?.macLaunchAgentPrintCommand || "", "launchctl print", label);
  assertIncludes(commands?.macLaunchAgentPrintCommand || "", "com.lan-dual-control.mac-host", label);
  assertNotIncludes(commands?.macUnattendedStatusCommand || "", "--promptPassword", label);
  assertNotIncludes(commands?.macUnattendedSendStatusCommand || "", "--promptPassword", label);
  assertNotIncludes(commands?.macUnattendedFormalCommand || "", "--promptPassword", label);
  assertNotIncludes(commands?.macLaunchAgentLoadCommand || "", "--promptPassword", label);
  assertNotIncludes(commands?.macLaunchAgentPrintCommand || "", "--promptPassword", label);
  assertNotIncludes(commands?.macUnattendedStatusCommand || "", "--password", label);
  assertNotIncludes(commands?.macUnattendedSendStatusCommand || "", "--password", label);
  assertNotIncludes(commands?.macUnattendedFormalCommand || "", "--password", label);
  assertNotIncludes(commands?.macLaunchAgentLoadCommand || "", "--password", label);
  assertNotIncludes(commands?.macLaunchAgentPrintCommand || "", "--password", label);
  assertNotIncludes(commands?.macUnattendedStatusCommand || "", "inject", label);
  assertNotIncludes(commands?.macUnattendedSendStatusCommand || "", "inject", label);
  assertNotIncludes(commands?.macUnattendedFormalCommand || "", "inject", label);
  assertNotIncludes(commands?.macLaunchAgentLoadCommand || "", "inject", label);
  assertNotIncludes(commands?.macLaunchAgentPrintCommand || "", "inject", label);
  assertMacRemoteAudioPlanCommand(commands?.macRemoteAudioPlanCommand || "", label);
  assertMacRemoteAudioStatusCommand(commands?.macRemoteAudioStatusCommand || "", label);
  assertMacRemoteAudioSendStatusCommand(commands?.macRemoteAudioSendStatusCommand || "", label);
  assertMacInputSafetyPlanCommand(commands?.macInputSafetyPlanCommand || "", label);
  assertMacInputSafetyStatusCommand(commands?.macInputSafetyStatusCommand || "", label);
  assertMacInputSafetySendStatusCommand(commands?.macInputSafetySendStatusCommand || "", label);
  assertMacSafeInjectRehearsalCommand(commands?.macSafeInjectRehearsalCommand || "", label);
  assertMacManualUxStatusCommand(commands?.macManualUxStatusCommand || "", label);
  assertMacManualUxSendStatusCommand(commands?.macManualUxSendStatusCommand || "", label);
  assertIncludes(commands?.macClientPageStatusCommand || "", "start-mac-client.mjs --status --boardSummary", label);
  assertIncludes(commands?.macClientDiagnosticsCommand || "", "check-mac-client-readiness.mjs", label);
  assertMacClientManualChecklistAction(commands?.macClientManualChecklistAction || "", label);
  assertMacClientPasswordLocationAction(commands?.macClientPasswordLocationAction || "", label);
  assertIncludes(commands?.macFormalLocalSmokeCommand || "", "check-mac-formal-local-smoke.mjs", label);
  assertIncludes(commands?.macFormalE2eStatusCommand || "", "check-mac-formal-e2e-status.mjs", label);
  assertIncludes(commands?.macFormalE2eStatusCommand || "", "--boardSummary", label);
  assertNotIncludes(commands?.macFormalE2eStatusCommand || "", "--promptPassword", label);
  assertNotIncludes(commands?.macFormalE2eStatusCommand || "", "--password", label);
  assertNotIncludes(commands?.macFormalE2eStatusCommand || "", "--sendCall", label);
  assertNotIncludes(commands?.macFormalE2eStatusCommand || "", "--forceCall", label);
  assertNotIncludes(commands?.macFormalE2eStatusCommand || "", "input_event", label);
  assertNotIncludes(commands?.macFormalE2eStatusCommand || "", "inject", label);
  assertIncludes(commands?.macClientDiscoverWindowsCommand || "", "discover-windows-hosts.mjs", label);
  assertIncludes(commands?.macClientDiscoverWindowsCommand || "", "--checkBoard", label);
  assertNotIncludes(commands?.macClientDiscoverWindowsCommand || "", "--sendCall", label);
  assertMacClientDiscoverWindowsCallCommand(commands?.macClientDiscoverWindowsCallCommand || "", label);
  assertIncludes(commands?.macClientFormalChecklistCommand || "", "check-mac-client-formal-status.mjs", label);
  assertIncludes(commands?.macClientFormalChecklistCommand || "", "--discover", label);
  assertIncludes(commands?.macClientFormalChecklistCommand || "", "--port 43770", label);
  assertIncludes(commands?.macClientFormalChecklistCommand || "", "--boardSummary", label);
  assertWindowsHostStatusCommand(commands?.windowsHostStatusCommand || "", label);
  assertWindowsHostReadinessCommand(commands?.windowsHostReadinessCommand || "", label);
  assertIncludes(commands?.macClientFormalSmokeCommand || "", "run-mac-client-formal-smoke.mjs", label);
  assertIncludes(commands?.macClientFormalSmokeCommand || "", "--discover", label);
  assertIncludes(commands?.macClientFormalSmokeCommand || "", "--ensureClient", label);
  assertIncludes(commands?.macClientFormalSmokeCommand || "", "--preflightOnly", label);
  assertIncludes(commands?.macClientFormalSmokeCommand || "", "--boardSummary", label);
  assertIncludes(commands?.macClientPromptPasswordSmokeCommand || "", "run-mac-client-formal-smoke.mjs", label);
  assertIncludes(commands?.macClientPromptPasswordSmokeCommand || "", "--discover", label);
  assertIncludes(commands?.macClientPromptPasswordSmokeCommand || "", "--ensureClient", label);
  assertIncludes(commands?.macClientPromptPasswordSmokeCommand || "", "--promptPassword", label);
  assertIncludes(commands?.macClientPromptPasswordSmokeCommand || "", "--boardSummary", label);
  assertNotIncludes(commands?.macClientPromptPasswordSmokeCommand || "", "--preflightOnly", label);
  assertNotIncludes(commands?.macClientPromptPasswordSmokeCommand || "", "--password", label);
  assertNotIncludes(commands?.macClientPromptPasswordSmokeCommand || "", "--useEnvPassword", label);
  assertNotIncludes(commands?.macClientPromptPasswordSmokeCommand || "", "--sendCall", label);
  assertNotIncludes(commands?.macClientPromptPasswordSmokeCommand || "", "--forceCall", label);
  assertNotIncludes(commands?.macClientPromptPasswordSmokeCommand || "", "input_event", label);
  assertNotIncludes(commands?.macClientPromptPasswordSmokeCommand || "", "inject", label);
  assertIncludes(commands?.macClientBrowserSelfTestCommand || "", "scripts/mac/test-mac-client-browser-self-test-wrapper.mjs", label);
  assertIncludes(commands?.macClientBrowserSelfTestCommand || "", "--boardSummary", label);
  assertNotIncludes(commands?.macClientBrowserSelfTestCommand || "", "scripts/mac/test-mac-client-browser-self-test.mjs", label);
  assertNotIncludes(commands?.macClientBrowserSelfTestCommand || "", "--promptPassword", label);
  assertNotIncludes(commands?.macClientBrowserSelfTestCommand || "", "--password", label);
  assertNotIncludes(commands?.macClientBrowserSelfTestCommand || "", "--sendCall", label);
  assertNotIncludes(commands?.macClientBrowserSelfTestCommand || "", "--forceCall", label);
  assertNotIncludes(commands?.macClientBrowserSelfTestCommand || "", "--server", label);
  assertNotIncludes(commands?.macClientBrowserSelfTestCommand || "", "input_event", label);
  assertNotIncludes(commands?.macClientBrowserSelfTestCommand || "", "inject", label);
  assertIncludes(commands?.macScriptHelpCommand || "", "test-mac-script-help.mjs", label);
  assertIncludes(commands?.macScriptHelpCommand || "", "--timeoutMs 10000", label);
  assertIncludes(commands?.macScriptHelpCommand || "", "--boardSummary", label);
  assertNotIncludes(commands?.macScriptHelpCommand || "", "--promptPassword", label);
  assertNotIncludes(commands?.macScriptHelpCommand || "", "--password", label);
  assertNotIncludes(commands?.macScriptHelpCommand || "", "--sendCall", label);
  assertNotIncludes(commands?.macScriptHelpCommand || "", "--forceCall", label);
  assertNotIncludes(commands?.macScriptHelpCommand || "", "input_event", label);
  assertNotIncludes(commands?.macScriptHelpCommand || "", "inject", label);
  assertNotIncludes(commands?.macMaxFpsSafeStartCommand || "", "--password", label);
  assertNotIncludes(commands?.macMaxFpsSafeStartCommand || "", "inject", label);
  assertNoSecrets(JSON.stringify(commands), label);
}

function getCurrentBuildId() {
  const current = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 5000,
  });
  const currentCommit = String(current.stdout || "").trim();
  assert(current.status === 0 && currentCommit, "should find current git build id");
  return currentCommit;
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
    const result = run([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assertIncludes(result.stdout, "Usage:", `${script} ${flag}`);
    assertIncludes(result.stdout, "codex-reconnect-stuck", `${script} ${flag}`);
    assertIncludes(result.stdout, "--codexTextFile", `${script} ${flag}`);
    assertIncludes(result.stdout, "--stateFile", `${script} ${flag}`);
    assertIncludes(result.stdout, "formal E2E readiness", `${script} ${flag}`);
    assertIncludes(result.stdout, "macHeartbeatHealth", `${script} ${flag}`);
    assertIncludes(result.stdout, "macEvidence", `${script} ${flag}`);
    assertIncludes(result.stdout, "MacUnattendedSendStatus", `${script} ${flag}`);
    assertIncludes(result.stdout, "macHeartbeatRefreshRestartCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "board.macUnattendedHealth", `${script} ${flag}`);
    assertIncludes(result.stdout, "board.macUnattendedFreshness", `${script} ${flag}`);
    assertIncludes(result.stdout, "macPowerPlanCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macRemoteAudioPlanCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macInputSafetyPlanCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macRemoteAudioSendStatusCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macInputSafetyStatusCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macInputSafetySendStatusCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macSafeInjectRehearsalCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macManualUxStatusCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macManualUxSendStatusCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macLaunchAgentPlanCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "macClientDiscoverWindowsCallCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "windowsHostStatusCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "windowsHostReadinessCommand", `${script} ${flag}`);
    assertNotIncludes(result.stdout, "password:", `${script} ${flag}`);
  }
  print("OK", "Mac heartbeat help exits quickly");
}

async function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

function checkOfflineWarning(args, hostPort, clientPort) {
  const result = run([
    "--json",
    "--host",
    "127.0.0.1",
    "--port",
    String(hostPort),
    "--clientHost",
    "127.0.0.1",
    "--clientPort",
    String(clientPort),
    "--timeoutMs",
    "800",
  ], args);
  const payload = parseJson(result.stdout, "offline JSON");
  assert(result.status === 0, `offline warning should exit 0.\n${result.stdout}\n${result.stderr}`);
  assert(payload.status === "warning", "offline payload should be warning");
  assert(payload.ok === true, "offline warning should be ok=true");
  assert(payload.warnings.includes("mac-host-offline"), "offline payload should warn about Mac host");
  assert(payload.warnings.includes("mac-client-offline"), "offline payload should warn about Mac client");
  assert(payload.codex.reason === "ok", "offline payload should not invent Codex blocker");
  assertHeartbeatHealth(payload, "warning", "mac-host-offline", "offline payload");
  assertMacEvidence(payload, [], "offline payload");
  assertIsoTimestamp(payload.checkedAt, "offline checkedAt");
  assertIncludes(payload.boardSummary || "", "MacHeartbeat=status=warning", "offline board summary");
  assertIncludes(payload.boardSummary || "", "checkedAt=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "macHost=offline", "offline board summary");
  assertIncludes(payload.boardSummary || "", "macClient=offline", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacResumeStatus=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacHostReadiness=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacHostMedia=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacMaxFpsSafeStart=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacUnattendedStatus=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacUnattendedSendStatus=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacHeartbeatRefreshRestart=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "--sendStatus", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacPowerPlan=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "plan-mac-power-settings.mjs", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacRemoteAudioPlan=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "plan-mac-remote-audio.mjs", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacRemoteAudioStatus=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "check-mac-remote-audio-status.mjs", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacRemoteAudioSendStatus=", "offline board summary");
  assertMacRemoteAudioSendStatusCommand(
    (payload.boardSummary || "").split("MacRemoteAudioSendStatus=")[1]?.split(". ")[0] || "",
    "offline board summary Mac remote audio send status command",
  );
  assertIncludes(payload.boardSummary || "", "MacInputSafetyPlan=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "plan-mac-input-safety.mjs", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacInputSafetyStatus=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "check-mac-input-safety-status.mjs", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacInputSafetySendStatus=", "offline board summary");
  assertMacInputSafetySendStatusCommand(
    (payload.boardSummary || "").split("MacInputSafetySendStatus=")[1]?.split(". ")[0] || "",
    "offline board summary Mac input safety send status command",
  );
  assertIncludes(payload.boardSummary || "", "MacSafeInjectRehearsal=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "plan-mac-safe-inject-rehearsal.mjs", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacManualUxStatus=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "check-mac-manual-ux-status.mjs", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacManualUxSendStatus=", "offline board summary");
  assertMacManualUxSendStatusCommand(
    (payload.boardSummary || "").split("MacManualUxSendStatus=")[1]?.split(". ")[0] || "",
    "offline board summary Mac manual UX send status command",
  );
  assertIncludes(payload.boardSummary || "", "MacUnattendedFormal=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacLaunchAgentPlan=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "install-mac-host-launch-agent.mjs", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacLaunchAgentLoad=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacLaunchAgentPrint=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacFormalE2E=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacClientManualChecklist=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "手工清单", "offline board summary");
  assertIncludes(payload.boardSummary || "", "连接/视频/音频/剪贴板/文件/窗口/全屏/原画/input_ack/复制诊断", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacClientPasswordLocation=", "offline board summary");
  assertMacClientPasswordLocationAction(
    (payload.boardSummary || "").split("MacClientPasswordLocation=")[1]?.split(". ")[0] || "",
    "offline board summary password location action",
  );
  assertIncludes(payload.boardSummary || "", "MacClientFormalChecklist=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacClientDiscoverWindowsCall=", "offline board summary");
  assertMacClientDiscoverWindowsCallCommand(
    (payload.boardSummary || "").split("MacClientDiscoverWindowsCall=")[1]?.split(". ")[0] || "",
    "offline board summary discover call command",
  );
  assertWindowsHostBoardSummary(payload.boardSummary || "", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacClientFormalSmoke=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacClientPromptPasswordSmoke=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacClientBrowserSelfTest=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "scripts/mac/test-mac-client-browser-self-test-wrapper.mjs", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacScriptHelp=", "offline board summary");
  assertHeartbeatCriticalCommandsBeforeTruncation(payload.boardSummary || "", "offline board summary");
  assertNotIncludes(payload.boardSummary || "", "Evidence=MacClientPageOnline", "offline board summary");
  assertCommandSet(payload.commands, "offline commands");
  assertNoSecrets(`${result.stdout}\n${result.stderr}`, "offline output");
  print("OK", "Offline heartbeat reports warnings without secrets");
}

async function withServer(handler, callback) {
  const port = await getFreePort();
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  try {
    await callback(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function checkOnlineOk(args) {
  const currentBuild = getCurrentBuildId();
  await withServer((request, response) => {
    if ((request.url || "").split("?")[0] !== "/discovery") {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      platform: "macos",
      runtime: { processId: 1234, buildId: currentBuild },
      permissions: { screenRecording: true, accessibility: true, inputMonitoring: true },
      capabilities: {
        input: { mode: "log" },
        screen: {
          active: true,
          h264: true,
          maxScreenFps: 60,
          capturePipeline: "screencapturekit-h264"
        },
        audio: { active: true, mode: "system-pcm" }
      }
    }));
  }, async (hostPort) => {
    await withServer((request, response) => {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>LAN Dual Mac 控制 Windows</title>");
    }, async (clientPort) => {
      const result = await runAsync([
        "--json",
        "--host",
        "127.0.0.1",
        "--port",
        String(hostPort),
        "--clientHost",
        "127.0.0.1",
        "--clientPort",
        String(clientPort),
        "--timeoutMs",
        "1200",
      ], args);
      const payload = parseJson(result.stdout, "online JSON");
      assert(result.status === 0, `online heartbeat should pass.\n${result.stdout}\n${result.stderr}`);
      assert(payload.status === "ok", "online payload should be ok");
      assert(payload.macHost.online === true, "Mac host should be online");
      assert(payload.macHost.runtimeBuild === currentBuild, "Mac host runtime build should be captured");
      assert(payload.macHost.inputMode === "log", "Mac host inputMode should be captured");
      assert(payload.macClient.online === true, "Mac client should be online");
      assertHeartbeatHealth(payload, "ok", "ok", "online payload");
      assertMacEvidence(payload, ["MacClientPageOnline"], "online payload");
      assertIsoTimestamp(payload.checkedAt, "online checkedAt");
      assertIncludes(payload.boardSummary || "", "MacHeartbeat=status=ok", "online board summary");
      assertIncludes(payload.boardSummary || "", "checkedAt=", "online board summary");
      assertIncludes(payload.boardSummary || "", "inputMode=log", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacResumeStatus=", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacHostReadiness=", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacHostMedia=", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacMaxFpsSafeStart=", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacUnattendedStatus=", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacUnattendedSendStatus=", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacHeartbeatRefreshRestart=", "online board summary");
      assertIncludes(payload.boardSummary || "", "--sendStatus", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacPowerPlan=", "online board summary");
      assertIncludes(payload.boardSummary || "", "plan-mac-power-settings.mjs", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacRemoteAudioPlan=", "online board summary");
      assertIncludes(payload.boardSummary || "", "plan-mac-remote-audio.mjs", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacRemoteAudioStatus=", "online board summary");
      assertIncludes(payload.boardSummary || "", "check-mac-remote-audio-status.mjs", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacRemoteAudioSendStatus=", "online board summary");
      assertMacRemoteAudioSendStatusCommand(
        (payload.boardSummary || "").split("MacRemoteAudioSendStatus=")[1]?.split(". ")[0] || "",
        "online board summary Mac remote audio send status command",
      );
      assertIncludes(payload.boardSummary || "", "MacInputSafetyPlan=", "online board summary");
      assertIncludes(payload.boardSummary || "", "plan-mac-input-safety.mjs", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacInputSafetyStatus=", "online board summary");
      assertIncludes(payload.boardSummary || "", "check-mac-input-safety-status.mjs", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacInputSafetySendStatus=", "online board summary");
      assertMacInputSafetySendStatusCommand(
        (payload.boardSummary || "").split("MacInputSafetySendStatus=")[1]?.split(". ")[0] || "",
        "online board summary Mac input safety send status command",
      );
      assertIncludes(payload.boardSummary || "", "MacSafeInjectRehearsal=", "online board summary");
      assertIncludes(payload.boardSummary || "", "plan-mac-safe-inject-rehearsal.mjs", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacManualUxStatus=", "online board summary");
      assertIncludes(payload.boardSummary || "", "check-mac-manual-ux-status.mjs", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacManualUxSendStatus=", "online board summary");
      assertMacManualUxSendStatusCommand(
        (payload.boardSummary || "").split("MacManualUxSendStatus=")[1]?.split(". ")[0] || "",
        "online board summary Mac manual UX send status command",
      );
      assertIncludes(payload.boardSummary || "", "MacUnattendedFormal=", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacLaunchAgentPlan=", "online board summary");
      assertIncludes(payload.boardSummary || "", "install-mac-host-launch-agent.mjs", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacLaunchAgentLoad=", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacLaunchAgentPrint=", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacFormalE2E=", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacClientManualChecklist=", "online board summary");
      assertIncludes(payload.boardSummary || "", "手工清单", "online board summary");
      assertIncludes(payload.boardSummary || "", "连接/视频/音频/剪贴板/文件/窗口/全屏/原画/input_ack/复制诊断", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacClientPasswordLocation=", "online board summary");
      assertMacClientPasswordLocationAction(
        (payload.boardSummary || "").split("MacClientPasswordLocation=")[1]?.split(". ")[0] || "",
        "online board summary password location action",
      );
      assertIncludes(payload.boardSummary || "", "MacClientFormalChecklist=", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacClientDiscoverWindowsCall=", "online board summary");
      assertMacClientDiscoverWindowsCallCommand(
        (payload.boardSummary || "").split("MacClientDiscoverWindowsCall=")[1]?.split(". ")[0] || "",
        "online board summary discover call command",
      );
      assertWindowsHostBoardSummary(payload.boardSummary || "", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacClientFormalSmoke=", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacClientPromptPasswordSmoke=", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacClientBrowserSelfTest=", "online board summary");
      assertIncludes(payload.boardSummary || "", "scripts/mac/test-mac-client-browser-self-test-wrapper.mjs", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacScriptHelp=", "online board summary");
      assertHeartbeatCriticalCommandsBeforeTruncation(payload.boardSummary || "", "online board summary");
      assertIncludes(payload.boardSummary || "", "Evidence=MacClientPageOnline", "online board summary");
      assertNotIncludes(payload.boardSummary || "", "MacClientDiagnosticsOk", "online board summary without board check");
      assertCommandSet(payload.commands, "online commands");
      assertNoSecrets(`${result.stdout}\n${result.stderr}`, "online output");
    });
  });
  print("OK", "Online heartbeat captures fake Mac host and client state");
}

async function checkOnlineBoardEvidence(args) {
  const currentBuild = getCurrentBuildId();
  await withServer((request, response) => {
    if ((request.url || "").split("?")[0] !== "/discovery") {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      platform: "macos",
      runtime: { processId: 1234, buildId: currentBuild },
      permissions: { screenRecording: true, accessibility: true, inputMonitoring: true },
      capabilities: {
        input: { mode: "log" },
        screen: {
          active: true,
          h264: true,
          maxScreenFps: 60,
          capturePipeline: "screencapturekit-h264",
        },
        audio: { active: true, mode: "system-pcm" },
      },
    }));
  }, async (hostPort) => {
    await withServer((request, response) => {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>LAN Dual Mac 控制 Windows</title>");
    }, async (clientPort) => {
      await withServer((request, response) => {
        if ((request.url || "").split("?")[0] !== "/api/state") {
          response.writeHead(404).end("not found");
          return;
        }
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          updatedAt: new Date().toISOString(),
          currentCall: null,
          statuses: {
            "Mac Codex": {
              status: "idle",
              note: "Mac heartbeat online",
              updatedAt: new Date().toISOString(),
            },
          },
          events: [],
        }));
      }, async (boardPort) => {
        const result = await runAsync([
          "--json",
          "--host",
          "127.0.0.1",
          "--port",
          String(hostPort),
          "--clientHost",
          "127.0.0.1",
          "--clientPort",
          String(clientPort),
          "--checkBoard",
          "--server",
          `http://127.0.0.1:${boardPort}`,
          "--timeoutMs",
          "1200",
        ], args);
        const payload = parseJson(result.stdout, "online board evidence JSON");
        assert(result.status === 0, `online heartbeat with board should pass.\n${result.stdout}\n${result.stderr}`);
        assert(payload.status === "ok", "online board evidence payload should be ok");
        assert(payload.board?.ok === true, "Agent Link Board should be readable");
        assert(payload.macClient?.online === true, "Mac client page should be online");
        assert(payload.macClient?.titleFound === true, "Mac client page title should be recognized");
        assertHeartbeatHealth(payload, "ok", "ok", "online board evidence payload");
        assertMacEvidence(payload, ["MacClientPageOnline", "MacClientDiagnosticsOk"], "online board evidence payload");
        assertIncludes(payload.boardSummary || "", "Evidence=MacClientPageOnline,MacClientDiagnosticsOk", "online board evidence summary");
        assertNotIncludes(`${result.stdout}\n${result.stderr}`, "LAN_DUAL_PASSWORD", "online board evidence output");
        assertNotIncludes(`${result.stdout}\n${result.stderr}`, "--password", "online board evidence output");
      });
    });
  });
  print("OK", "Online heartbeat with readable board emits Mac client diagnostics evidence");
}

async function checkBoardMacPowerHealth(args) {
  const cleanPower = "Mac unattended status: host=online inputMode=log build=ed937a2; power=sleep=ac-power:1 displaySleep=ac-power:10 networkWake=ac-power:1; MacPowerHealth=warning reason=system-sleep-enabled warnings=system-sleep-enabled,display-sleep-enabled checkedAt=2026-06-19T07:23:38.703Z; MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded,power checkedAt=2026-06-19T07:23:38.703Z; MacHostAuthPath=prompt-password-required reason=launch-agent-ephemeral-password mode=ephemeral next=MacHostStop->MacMaxFpsSafeStart->MacHostMedia; attention=2 warning(s) blockers=none warnings=launch-agent-not-loaded,power.";
  await withServer((request, response) => {
    if ((request.url || "").split("?")[0] !== "/api/state") {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      updatedAt: new Date().toISOString(),
      currentCall: null,
      statuses: {
        "Mac Codex": {
          status: "idle",
          note: "Mac heartbeat online",
          updatedAt: new Date().toISOString(),
        },
        "Mac Unattended": {
          status: "warning",
          note: cleanPower,
          updatedAt: "2026-06-19T07:23:38.703Z",
        },
      },
      events: [],
    }));
  }, async (boardPort) => {
    const hostPort = await getFreePort();
    const clientPort = await getFreePort();
    const result = await runAsync([
      "--json",
      "--host",
      "127.0.0.1",
      "--port",
      String(hostPort),
      "--clientHost",
      "127.0.0.1",
      "--clientPort",
      String(clientPort),
      "--checkBoard",
      "--server",
      `http://127.0.0.1:${boardPort}`,
      "--timeoutMs",
      "800",
    ], args);
    const payload = parseJson(result.stdout, "Mac power heartbeat JSON");
    assert(result.status === 0, `Mac power health heartbeat should stay non-failing.\n${result.stdout}\n${result.stderr}`);
    assert(payload.board?.ok === true, "Mac power health heartbeat should read Agent Link Board");
    assertMacPowerHealth(payload, {
      status: "warning",
      reason: "system-sleep-enabled",
      warnings: "system-sleep-enabled,display-sleep-enabled",
      checkedAt: "2026-06-19T07:23:38.703Z",
    }, "Mac power health heartbeat");
    assertMacUnattendedHealth(payload, {
      status: "warning",
      reason: "launch-agent-not-loaded",
      blockers: "none",
      warnings: "launch-agent-not-loaded,power",
      checkedAt: "2026-06-19T07:23:38.703Z",
    }, "Mac unattended health heartbeat");
    assertMacUnattendedFreshness(payload, {
      status: "stale",
      checkedAt: "2026-06-19T07:23:38.703Z",
    }, "Mac power health heartbeat");
    assertMacHostAuthPath(payload, {
      status: "prompt-password-required",
      reason: "launch-agent-ephemeral-password",
      mode: "ephemeral",
      next: "MacHostStop->MacMaxFpsSafeStart->MacHostMedia",
    }, "Mac power health heartbeat");
    assertIncludes(payload.boardSummary || "", "MacPowerHealth=warning reason=system-sleep-enabled warnings=system-sleep-enabled,display-sleep-enabled checkedAt=2026-06-19T07:23:38.703Z.", "Mac power heartbeat summary");
    assertIncludes(payload.boardSummary || "", "MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded,power checkedAt=2026-06-19T07:23:38.703Z.", "Mac unattended heartbeat summary");
    assertIncludes(payload.boardSummary || "", "MacUnattendedFreshness=stale", "Mac power heartbeat summary");
    assertIncludes(payload.boardSummary || "", "MacHostAuthPath=prompt-password-required reason=launch-agent-ephemeral-password mode=ephemeral next=MacHostStop->MacMaxFpsSafeStart->MacHostMedia.", "Mac power heartbeat summary");
    assertIncludes(payload.boardSummary || "", "checkedAt=2026-06-19T07:23:38.703Z", "Mac power heartbeat summary");
    assertIncludes(payload.boardSummary || "", "MacPowerPlan=node scripts/mac/plan-mac-power-settings.mjs", "Mac power heartbeat summary");
    assertIncludes(payload.boardSummary || "", "MacLaunchAgentPlan=node scripts/mac/install-mac-host-launch-agent.mjs", "Mac power heartbeat summary");
    assertMacPowerPlanCommand(payload.commands?.macPowerPlanCommand || "", "Mac power heartbeat commands");
    assertMacLaunchAgentPlanCommand(payload.commands?.macLaunchAgentPlanCommand || "", "Mac power heartbeat commands");
    assertNoSecrets(`${result.stdout}\n${result.stderr}`, "Mac power heartbeat output");
  });

  const staleHeartbeatPower = "MacHeartbeat=status=ok; MacPowerHealth=ok reason=ok warnings=none checkedAt=2026-06-19T13:52:50.216Z. MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded,power checkedAt=2026-06-19T13:52:50.216Z. MacUnattendedFreshness=fresh checkedAt=2026-06-19T13:52:50.216Z source=MacUnattendedHealth.";
  const currentUnattendedPower = "Mac unattended status: host=online inputMode=log build=bed2095; MacPowerHealth=ok reason=ok warnings=none checkedAt=2026-06-19T15:01:42.855Z; MacUnattendedHealth=warning reason=accessibility blockers=none warnings=accessibility checkedAt=2026-06-19T15:01:42.855Z; attention=1 warning(s) blockers=none warnings=accessibility.";
  await withServer((request, response) => {
    if ((request.url || "").split("?")[0] !== "/api/state") {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      updatedAt: new Date().toISOString(),
      currentCall: null,
      statuses: {
        "Mac Heartbeat": {
          status: "online",
          note: staleHeartbeatPower,
          updatedAt: "2026-06-19T13:52:50.216Z",
        },
        "Mac Unattended": {
          status: "warning",
          note: currentUnattendedPower,
          updatedAt: "2026-06-19T15:01:42.855Z",
        },
      },
      events: [],
    }));
  }, async (boardPort) => {
    const hostPort = await getFreePort();
    const clientPort = await getFreePort();
    const result = await runAsync([
      "--json",
      "--host",
      "127.0.0.1",
      "--port",
      String(hostPort),
      "--clientHost",
      "127.0.0.1",
      "--clientPort",
      String(clientPort),
      "--checkBoard",
      "--server",
      `http://127.0.0.1:${boardPort}`,
      "--timeoutMs",
      "800",
    ], args);
    const payload = parseJson(result.stdout, "current Mac unattended over stale heartbeat JSON");
    assert(result.status === 0, `current Mac unattended health should stay non-failing.\n${result.stdout}\n${result.stderr}`);
    assert(payload.board?.macUnattendedHealth?.reason === "accessibility", "Mac unattended health should accept current accessibility reason");
    assert(payload.board?.macUnattendedHealth?.warnings === "accessibility", "Mac unattended health should expose current accessibility warning");
    assert(payload.board?.macUnattendedHealth?.checkedAt === "2026-06-19T15:01:42.855Z", "Mac unattended health should prefer current Mac Unattended status over stale Mac Heartbeat text");
    assert(payload.board?.macUnattendedFreshness?.source === "MacUnattendedHealth", "Mac unattended freshness should use the current MacUnattendedHealth source");
    assertIncludes(payload.boardSummary || "", "MacUnattendedHealth=warning reason=accessibility blockers=none warnings=accessibility checkedAt=2026-06-19T15:01:42.855Z.", "current Mac unattended heartbeat summary");
    assertNotIncludes(payload.boardSummary || "", "MacUnattendedHealth=warning reason=launch-agent-not-loaded", "current Mac unattended heartbeat summary");
    assertNoSecrets(`${result.stdout}\n${result.stderr}`, "current Mac unattended heartbeat output");
  });

  const riskyPower = "MacPowerHealth=warning reason=--password warnings=system-sleep-enabled checkedAt=2026-06-19T07:23:38.703Z; MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=fake-token-value checkedAt=2026-06-19T07:23:38.703Z; fake-board-token";
  await withServer((request, response) => {
    if ((request.url || "").split("?")[0] !== "/api/state") {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      updatedAt: new Date().toISOString(),
      currentCall: null,
      statuses: {
        "Mac Codex": {
          status: "idle",
          note: "Mac heartbeat online",
          updatedAt: new Date().toISOString(),
        },
        "Mac Unattended": {
          status: "warning",
          note: riskyPower,
          updatedAt: "2026-06-19T07:23:38.703Z",
        },
      },
      events: [],
    }));
  }, async (boardPort) => {
    const hostPort = await getFreePort();
    const clientPort = await getFreePort();
    const result = await runAsync([
      "--json",
      "--host",
      "127.0.0.1",
      "--port",
      String(hostPort),
      "--clientHost",
      "127.0.0.1",
      "--clientPort",
      String(clientPort),
      "--checkBoard",
      "--server",
      `http://127.0.0.1:${boardPort}`,
      "--timeoutMs",
      "800",
    ], args);
    const payload = parseJson(result.stdout, "risky Mac power heartbeat JSON");
    assert(result.status === 0, `risky Mac power health heartbeat should stay non-failing.\n${result.stdout}\n${result.stderr}`);
    assert(!payload.board?.macPowerHealth, "risky Mac power health should not be promoted");
    assert(!payload.board?.macUnattendedHealth, "risky Mac unattended health should not be promoted");
    assert(!payload.board?.macUnattendedFreshness, "risky Mac unattended freshness should not be promoted");
    assertNotIncludes(payload.boardSummary || "", "MacPowerHealth=", "risky Mac power heartbeat summary");
    assertNotIncludes(payload.boardSummary || "", "MacUnattendedHealth=", "risky Mac power heartbeat summary");
    assertNotIncludes(payload.boardSummary || "", "MacUnattendedFreshness=", "risky Mac power heartbeat summary");
    assertNotIncludes(`${result.stdout}\n${result.stderr}`, "fake-board-token", "risky Mac power heartbeat output");
    assertNotIncludes(`${result.stdout}\n${result.stderr}`, "fake-token-value", "risky Mac power heartbeat output");
    assertNoSecrets(`${result.stdout}\n${result.stderr}`, "risky Mac power heartbeat output");
  });
  print("OK", "Agent Link Board MacPowerHealth and MacUnattendedHealth are surfaced safely in heartbeat");
}

async function checkOnlineStaleHostBuildWarning(args) {
  const staleBuild = getRuntimeBuildBeforeLatestMacHostChange();
  await withServer((request, response) => {
    if ((request.url || "").split("?")[0] !== "/discovery") {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      platform: "macos",
      runtime: { processId: 1234, buildId: staleBuild },
      permissions: { screenRecording: true, accessibility: true, inputMonitoring: true },
      capabilities: {
        input: { mode: "log" },
        screen: {
          active: true,
          h264: true,
          maxScreenFps: 60,
          capturePipeline: "screencapturekit-h264",
        },
        audio: { active: true, mode: "system-pcm" },
      },
    }));
  }, async (hostPort) => {
    await withServer((request, response) => {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>LAN Dual Mac 控制 Windows</title>");
    }, async (clientPort) => {
      const result = await runAsync([
        "--json",
        "--host",
        "127.0.0.1",
        "--port",
        String(hostPort),
        "--clientHost",
        "127.0.0.1",
        "--clientPort",
        String(clientPort),
        "--timeoutMs",
        "1200",
      ], args);
      const payload = parseJson(result.stdout, "stale build JSON");
      assert(result.status === 0, `stale Mac host build should be a warning, not a blocker.\n${result.stdout}\n${result.stderr}`);
      assert(payload.status === "warning", "stale Mac host build payload should be warning");
      assert(payload.warnings.includes("mac-host-build-stale"), "stale build warning should be present");
      assertHeartbeatHealth(payload, "warning", "mac-host-build-stale", "stale build payload");
      assert(payload.suggestedAction?.id === "restart-mac-host-safely", "stale build should suggest a safe host restart action");
      assertIncludes(payload.suggestedAction?.reason || "", "Mac host runtime build is stale", "stale build suggested action");
      assertIncludes(payload.suggestedAction?.commands?.macHostStopCommand || "", "start-mac-host.mjs --stop", "stale build suggested action");
      assertIncludes(payload.suggestedAction?.commands?.macHostSafeStartCommand || "", "--promptPassword --requirePassword", "stale build suggested action");
      assertIncludes(payload.suggestedAction?.commands?.macMaxFpsSafeStartCommand || "", "--maxScreenFps 60", "stale build suggested action");
      assertIncludes(payload.suggestedAction?.commands?.macResumeStatusCommand || "", "check-mac-resume-status.mjs", "stale build suggested action");
      assert(payload.macHost.buildDiff?.severity === "restart-recommended", "stale build should recommend restart when runtime files changed");
      assert(payload.macHost.buildDiff?.changedHostRuntimeFileCount > 0, "stale build should count changed Mac host runtime files");
      assertIncludes(payload.boardSummary || "", "MacHeartbeat=status=warning", "stale build board summary");
      assertIncludes(payload.boardSummary || "", "warnings=mac-host-build-stale", "stale build board summary");
      assertIncludes(payload.boardSummary || "", "restart recommended", "stale build board summary");
      assertIncludes(payload.boardSummary || "", "suggestedAction=restart-mac-host-safely", "stale build board summary");
      assertIncludes(payload.boardSummary || "", "actionCommands=MacHostStop->MacHostSafeStart-or-MacMaxFpsSafeStart->MacResumeStatus", "stale build board summary");
      assertIncludes(payload.boardSummary || "", "hostRuntimeChanges=", "stale build board summary");
      assertIncludes(payload.boardSummary || "", "MacResumeStatus=node scripts/mac/check-mac-resume-status.mjs", "stale build board summary");
      assertIncludes(payload.boardSummary || "", "MacHostStop=node scripts/mac/start-mac-host.mjs --stop", "stale build board summary");
      assertIncludes(payload.boardSummary || "", "MacMaxFpsSafeStart=node scripts/mac/start-mac-host.mjs", "stale build board summary");
      assertIncludes(payload.boardSummary || "", "--maxScreenFps 60", "stale build board summary");
      assertIncludes(payload.boardSummary || "", "MacHostReadiness=node scripts/mac/check-mac-host-readiness.mjs", "stale build board summary");
      assertIncludes(payload.boardSummary || "", "MacHostMedia=node scripts/mac/check-mac-host-readiness.mjs", "stale build board summary");
      assertIncludes(payload.boardSummary || "", "MacUnattendedSendStatus=node scripts/mac/check-mac-unattended-status.mjs", "stale build board summary");
      assertIncludes(payload.boardSummary || "", "--sendStatus", "stale build board summary");
      assertIncludes(payload.boardSummary || "", "MacUnattendedFormal=node scripts/mac/check-mac-unattended-status.mjs", "stale build board summary");
      assertIncludes(payload.boardSummary || "", "MacLaunchAgentPlan=node scripts/mac/install-mac-host-launch-agent.mjs", "stale build board summary");
      assertIncludes(payload.boardSummary || "", "MacLaunchAgentLoad=launchctl bootstrap", "stale build board summary");
      assertIncludes(payload.boardSummary || "", "MacLaunchAgentPrint=launchctl print", "stale build board summary");
      assertIncludes(payload.commands?.macHostStopCommand || "", "start-mac-host.mjs --stop", "stale build commands");
      assertIncludes(payload.commands?.macMaxFpsSafeStartCommand || "", "start-mac-host.mjs", "stale build commands");
      assertIncludes(payload.commands?.macMaxFpsSafeStartCommand || "", "--maxScreenFps 60", "stale build commands");
      assertIncludes(payload.commands?.macHostReadinessCommand || "", "check-mac-host-readiness.mjs", "stale build commands");
      assertIncludes(payload.commands?.macHostMediaCommand || "", "check-mac-host-readiness.mjs", "stale build commands");
      assertIncludes(payload.commands?.macHostMediaCommand || "", "--probeMedia", "stale build commands");
      assertIncludes(payload.commands?.macUnattendedFormalCommand || "", "check-mac-unattended-status.mjs", "stale build commands");
      assertIncludes(payload.commands?.macLaunchAgentLoadCommand || "", "launchctl bootstrap", "stale build commands");
      assertIncludes(payload.commands?.macLaunchAgentPrintCommand || "", "launchctl print", "stale build commands");
      assertIncludes(payload.commands?.macHostReadinessCommand || "", `--host 127.0.0.1 --port ${hostPort}`, "stale build commands");
      assertIncludes(payload.commands?.macHostMediaCommand || "", `--host 127.0.0.1 --port ${hostPort}`, "stale build commands");
      assertIncludes(payload.commands?.macHostStopCommand || "", `--host 127.0.0.1 --port ${hostPort}`, "stale build commands");
      assertIncludes(payload.commands?.macUnattendedSendStatusCommand || "", `--host 127.0.0.1 --port ${hostPort}`, "stale build commands");
      assertIncludes(payload.commands?.macUnattendedSendStatusCommand || "", "--sendStatus", "stale build commands");
      assertIncludes(payload.commands?.macUnattendedFormalCommand || "", `--host 127.0.0.1 --port ${hostPort}`, "stale build commands");
      assertNotIncludes(payload.commands?.macHostStopCommand || "", "--promptPassword", "stale build commands");
      assertNoSecrets(`${result.stdout}\n${result.stderr}`, "stale build output");
    });
  });
  print("OK", "Online heartbeat warns when Mac host runtime build needs restart");
}

async function checkBoardTimestamps(args) {
  const boardUpdatedAt = new Date(Date.now() - 45000).toISOString();
  const macCodexUpdatedAt = new Date(Date.now() - 30000).toISOString();
  const hostPort = await getFreePort();
  const clientPort = await getFreePort();
  await withServer((request, response) => {
    if ((request.url || "").split("?")[0] !== "/api/state") {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      updatedAt: boardUpdatedAt,
      currentCall: null,
      statuses: {
        "Mac Codex": {
          status: "idle",
          note: "fake board status",
          updatedAt: macCodexUpdatedAt,
        },
      },
    }));
  }, async (boardPort) => {
    const result = await runAsync([
      "--json",
      "--host",
      "127.0.0.1",
      "--port",
      String(hostPort),
      "--clientHost",
      "127.0.0.1",
      "--clientPort",
      String(clientPort),
      "--server",
      `http://127.0.0.1:${boardPort}`,
      "--checkBoard",
      "--timeoutMs",
      "800",
    ], args);
    const payload = parseJson(result.stdout, "board timestamp JSON");
    assert(result.status === 0, `board timestamp warning should exit 0.\n${result.stdout}\n${result.stderr}`);
    assert(payload.board.ok === true, "board timestamp payload should read Agent Link Board");
    assert(payload.board.updatedAt === boardUpdatedAt, "board timestamp payload should preserve board updatedAt");
    assert(payload.board.macCodexStatus.updatedAt === macCodexUpdatedAt, "board timestamp payload should preserve Mac Codex updatedAt");
    assert(payload.codex.lastEventAt === macCodexUpdatedAt, "board timestamp payload should use Mac Codex updatedAt as last event");
    assert(payload.codex.status === "idle", "board timestamp payload should use Mac Codex status");
    assertHeartbeatHealth(payload, "warning", "mac-host-offline", "board timestamp payload");
    assertMacCodexHealth(payload, "ok", "ok", "board timestamp payload");
    assertIncludes(payload.boardSummary || "", `checkedAt=${payload.checkedAt}`, "board timestamp summary");
    assertIncludes(payload.boardSummary || "", `boardUpdatedAt=${boardUpdatedAt}`, "board timestamp summary");
    assertIncludes(payload.boardSummary || "", `codex=ok status=idle updatedAt=${macCodexUpdatedAt}`, "board timestamp summary");
    assertIncludes(payload.boardSummary || "", "ageMs=", "board timestamp summary");
    assertNoSecrets(`${result.stdout}\n${result.stderr}`, "board timestamp output");
  });
  print("OK", "Heartbeat board summary includes freshness timestamps");
}

function checkReconnectStuck(args) {
  const tmp = mkdtempSync(join(tmpdir(), "lan-dual-mac-heartbeat-"));
  try {
    const stateFile = join(tmp, "state.json");
    const textFile = join(tmp, "codex.txt");
    writeFileSync(textFile, [
      "正在重新连接 5/5",
      "stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses)",
      "token=fake-token-value password=super-secret-heartbeat",
    ].join("\n"));
    const old = new Date(Date.now() - 120000).toISOString();
    const result = run([
      "--json",
      "--codexTextFile",
      textFile,
      "--lastCodexEventAt",
      old,
      "--agentStatus",
      "coding",
      "--stuckThresholdMs",
      "60000",
      "--stateFile",
      stateFile,
      "--timeoutMs",
      "800",
    ], args);
    const payload = parseJson(result.stdout, "reconnect stuck JSON");
    assert(result.status !== 0, "reconnect stuck should exit non-zero");
    assert(payload.status === "blocked", "reconnect stuck should be blocked");
    assert(payload.blockers.includes("codex-reconnect-stuck"), "reconnect blocker should be present");
    assert(payload.codex.reason === "codex-reconnect-stuck", "codex reason should be reconnect stuck");
    assert(payload.codex.signals.includes("reconnecting-5-of-5"), "should detect reconnect 5/5");
    assert(payload.codex.signals.includes("stream-disconnected-before-completion"), "should detect stream disconnect");
    assert(payload.codex.signals.includes("codex-backend-api-request-error"), "should detect backend request error");
    assertHeartbeatHealth(payload, "blocked", "codex-reconnect-stuck", "reconnect payload");
    assertMacCodexHealth(payload, "blocked", "codex-reconnect-stuck", "reconnect payload");
    assertIncludes(payload.boardSummary || "", "reason=codex-reconnect-stuck", "reconnect board summary");
    assertIncludes(payload.boardSummary || "", "checkedAt=", "reconnect board summary");
    assertIncludes(payload.boardSummary || "", `updatedAt=${old}`, "reconnect board summary");
    assertIncludes(payload.boardSummary || "", "suggestedAction=请用户查看 Mac Codex 窗口", "reconnect board summary");
    assertNoSecrets(`${result.stdout}\n${result.stderr}`, "reconnect output");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  print("OK", "Reconnect-stuck evidence becomes a blocker without leaking secrets");
}

function checkCodexStale(args) {
  const old = new Date(Date.now() - 420000).toISOString();
  const result = run([
    "--json",
    "--agentStatus",
    "coding",
    "--lastCodexEventAt",
    old,
    "--staleThresholdMs",
    "60000",
    "--timeoutMs",
    "800",
  ], args);
  const payload = parseJson(result.stdout, "codex stale JSON");
  assert(result.status !== 0, "codex stale should exit non-zero");
  assert(payload.status === "blocked", "codex stale should be blocked");
  assert(payload.blockers.includes("mac-codex-stale"), "stale blocker should be present");
  assert(payload.codex.reason === "mac-codex-stale", "codex reason should be stale");
  assert(payload.codex.lastEventAgeMs >= 60000, "last event age should cross threshold");
  assertHeartbeatHealth(payload, "blocked", "mac-codex-stale", "stale payload");
  assertMacCodexHealth(payload, "blocked", "mac-codex-stale", "stale payload");
  assertIncludes(payload.boardSummary || "", "reason=mac-codex-stale", "stale board summary");
  assertIncludes(payload.boardSummary || "", "evidenceAgeMs=", "stale board summary");
  assertNotIncludes(payload.boardSummary || "", "evidenceAgeMs=0", "stale board summary");
  assertIncludes(payload.boardSummary || "", `updatedAt=${old}`, "stale board summary");
  assertNoSecrets(`${result.stdout}\n${result.stderr}`, "stale output");
  print("OK", "Stale active Mac Codex status becomes a blocker");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  const hostPort = await getFreePort();
  const clientPort = await getFreePort();
  checkOfflineWarning(args, hostPort, clientPort);
  await checkOnlineOk(args);
  await checkOnlineBoardEvidence(args);
  await checkBoardMacPowerHealth(args);
  await checkOnlineStaleHostBuildWarning(args);
  await checkBoardTimestamps(args);
  checkReconnectStuck(args);
  checkCodexStale(args);
  print("OK", "Mac heartbeat self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
