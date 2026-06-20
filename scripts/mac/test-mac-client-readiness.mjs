#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/check-mac-client-readiness.mjs";

const defaults = {
  timeoutMs: 12000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-client-readiness.mjs [options]

Verifies check-mac-client-readiness help, offline JSON/summary behavior, local
client HTTP probing, and mock Windows /discovery probing.

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

function assertMatches(text, pattern, label) {
  assert(pattern.test(String(text)), `${label} did not match ${pattern}.\n${text}`);
}

function assertNotIncludes(text, expected, label) {
  assert(!String(text).includes(expected), `${label} unexpectedly included ${JSON.stringify(expected)}.\n${text}`);
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

function assertMacClientPageStatusCommand(command, label) {
  assertIncludes(command, "start-mac-client.mjs", label);
  assertIncludes(command, "--status", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--allowExisting", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--server", label);
}

function assertMacClientDiscoverWindowsCommand(command, label) {
  assertIncludes(command, "discover-windows-hosts.mjs", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
}

function assertWindowsHostStatusCommand(command, label, expectedPort = "43770") {
  assertIncludes(command, "scripts/windows/start-windows-host.mjs", label);
  assertIncludes(command, "--status", label);
  assertIncludes(command, "--host 127.0.0.1", label);
  assertIncludes(command, `--port ${expectedPort}`, label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
}

function assertWindowsHostReadinessCommand(command, label, expectedPort = "43770") {
  assertIncludes(command, "scripts/windows/check-windows-host-readiness.mjs", label);
  assertIncludes(command, "--host 127.0.0.1", label);
  assertIncludes(command, `--port ${expectedPort}`, label);
  assertIncludes(command, "--checkBoard", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "input_event", label);
  assertNotIncludes(command, "inject", label);
}

function assertMacClientReverseRehearsalAction(text, label) {
  assertIncludes(text, "MacClientDiscoverWindows", label);
  assertIncludes(text, "ReverseRehearsal=", label);
  assertIncludes(text, "LAN008", label);
  assertIncludes(text, "local loopback", label);
  assertIncludes(text, "临时授权已使用", label);
  assertNotIncludes(text, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(text, "--password", label);
  assertNotIncludes(text, "--sendCall", label);
  assertNotIncludes(text, "inject", label);
}

function assertMacClientReverseGrantCopyAction(text, label) {
  assertIncludes(text, "复制 PowerShell", label);
  assertIncludes(text, "复制 Node", label);
  assertIncludes(text, "连接密码", label);
  assertIncludes(text, "input_event", label);
  assertNotIncludes(text, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(text, "--password", label);
  assertNotIncludes(text, "--sendCall", label);
  assertNotIncludes(text, "inject", label);
}

function assertMacClientManualChecklistAction(text, label) {
  assertIncludes(text, "手工清单", label);
  assertIncludes(text, "连接/视频/音频/剪贴板/input_ack/诊断", label);
  assertIncludes(text, "复制诊断", label);
  assertIncludes(text, "连接密码", label);
  assertNotIncludes(text, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(text, "--password", label);
  assertNotIncludes(text, "--sendCall", label);
  assertNotIncludes(text, "input_event", label);
  assertNotIncludes(text, "LAN_DUAL_INPUT_MODE=inject", label);
}

function assertWindowsReverseGrantPowerShellCommand(command, label, expectedPort = "43770", action = "grant") {
  assertIncludes(command, "pwsh -NoProfile -ExecutionPolicy Bypass", label);
  assertIncludes(command, "-File scripts/windows/allow-windows-reverse-control.ps1", label);
  assertIncludes(command, "-HostName 127.0.0.1", label);
  assertIncludes(command, `-Port ${expectedPort}`, label);
  if (action === "status") {
    assertIncludes(command, "-Status", label);
    assertNotIncludes(command, "-Grant", label);
  } else {
    assertIncludes(command, "-Grant", label);
    assertIncludes(command, "-DurationMs 30000", label);
    assertNotIncludes(command, "-Status", label);
  }
  assertIncludes(command, "-BoardSummary", label);
  assertNotIncludes(command, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "input_event", label);
  assertNotIncludes(command, "inject", label);
}

function assertWindowsReverseGrantNodeFallbackCommand(command, label, expectedPort = "43770", action = "grant") {
  assertIncludes(command, "node scripts/windows/allow-windows-reverse-control.mjs", label);
  assertIncludes(command, "--host 127.0.0.1", label);
  assertIncludes(command, `--port ${expectedPort}`, label);
  if (action === "status") {
    assertIncludes(command, "--status", label);
    assertNotIncludes(command, "--grant", label);
  } else {
    assertIncludes(command, "--grant", label);
    assertIncludes(command, "--durationMs 30000", label);
    assertNotIncludes(command, "--status", label);
  }
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "input_event", label);
  assertNotIncludes(command, "inject", label);
}

function assertWindowsReverseGrantCommands(commands, label, expectedPort = "43770") {
  assertWindowsReverseGrantPowerShellCommand(commands?.windowsReverseGrantStatusCommand || "", `${label} PowerShell status`, expectedPort, "status");
  assertWindowsReverseGrantPowerShellCommand(commands?.windowsOpenOneTimeReverseGrantCommand || "", `${label} PowerShell grant`, expectedPort, "grant");
  assertWindowsReverseGrantNodeFallbackCommand(commands?.windowsReverseGrantStatusNodeFallbackCommand || "", `${label} Node status`, expectedPort, "status");
  assertWindowsReverseGrantNodeFallbackCommand(commands?.windowsOpenOneTimeReverseGrantNodeFallbackCommand || "", `${label} Node grant`, expectedPort, "grant");
}

function assertWindowsReverseGrantBoardSummary(text, label, expectedPort = "43770") {
  assertIncludes(text, "WindowsReverseGrantStatus=pwsh -NoProfile -ExecutionPolicy Bypass", label);
  assertIncludes(text, `-Port ${expectedPort} -Status -BoardSummary`, label);
  assertIncludes(text, "WindowsOpenOneTimeReverseGrant=pwsh -NoProfile -ExecutionPolicy Bypass", label);
  assertIncludes(text, `-Port ${expectedPort} -Grant -DurationMs 30000 -BoardSummary`, label);
  assertIncludes(text, "WindowsReverseGrantStatusNodeFallback=node scripts/windows/allow-windows-reverse-control.mjs", label);
  assertIncludes(text, `--host 127.0.0.1 --port ${expectedPort} --status --boardSummary`, label);
  assertIncludes(text, "WindowsOpenOneTimeReverseGrantNodeFallback=node scripts/windows/allow-windows-reverse-control.mjs", label);
  assertIncludes(text, `--host 127.0.0.1 --port ${expectedPort} --grant --durationMs 30000 --boardSummary`, label);
  assertNotIncludes(text, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(text, "--password", label);
}

function assertWindowsLanRisk(payload, output, label) {
  const risk = payload.board?.windowsLanRisk || {};
  assert(risk.checked === true, `${label} should check Agent Link Board for Windows LAN risk`);
  assert(risk.found === true, `${label} should find WindowsLanRisk on the board`);
  assert(Array.isArray(risk.risks), `${label} should expose sanitized risk tokens`);
  assert(risk.risks.join(",") === "no-firewall-allow,public-profile", `${label} should keep only safe risk tokens`);
  assert(risk.riskText === "no-firewall-allow,public-profile", `${label} should expose a compact riskText`);
  assert(risk.rejectedCount >= 2, `${label} should count rejected unsafe board candidates`);
  assertIncludes(payload.boardSummary || "", "WindowsLanRisk=no-firewall-allow,public-profile", `${label} boardSummary`);
  assertIncludes(payload.recommendations?.[0]?.text || "", "WindowsLanRisk=no-firewall-allow,public-profile", `${label} recommendation`);
  const windowsHostItem = payload.checklist?.find((item) => item.id === "windows-host") || {};
  assertIncludes(windowsHostItem.next || "", "WindowsLanRisk=no-firewall-allow,public-profile", `${label} windows-host next step`);
  assertNotIncludes(output, "hunter2", `${label} output`);
  assertNotIncludes(output, "sauce", `${label} output`);
  assertNotIncludes(output, "LAN_DUAL_PASSWORD=hunter2", `${label} output`);
  assertNotIncludes(output, "--password=sauce", `${label} output`);
}

function assertMacUnattendedFreshness(payload, expected, label) {
  const freshness = payload.board?.macUnattendedFreshness;
  assert(freshness?.status === expected.status, `${label} should expose MacUnattendedFreshness status=${expected.status}`);
  assert(freshness.checkedAt === expected.checkedAt, `${label} should preserve MacUnattendedFreshness checkedAt`);
  assert(freshness.thresholdMs === expected.thresholdMs, `${label} should expose MacUnattendedFreshness thresholdMs`);
  assert(freshness.source === expected.source, `${label} should expose MacUnattendedFreshness source`);
  assert(Number.isFinite(freshness.checkedAgeMs), `${label} should expose finite MacUnattendedFreshness checkedAgeMs`);
}

function extractPlainLineValue(text, prefix, label) {
  const line = String(text || "")
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(prefix));
  assert(line, `${label} should include ${prefix} line.\n${text}`);
  return line.slice(prefix.length).trim();
}

function assertMacClientFormalChecklistCommand(command, label, expectedHost = "<Windows IP>", expectedPort = "43770", options = {}) {
  assertIncludes(command, "check-mac-client-formal-status.mjs", label);
  if (options.discover) {
    assertIncludes(command, "--discover", label);
    assertNotIncludes(command, "--host", label);
    assertNotIncludes(command, "<Windows IP>", label);
  } else {
    assertIncludes(command, `--host ${expectedHost}`, label);
  }
  assertIncludes(command, `--port ${expectedPort}`, label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "--json", label);
}

function assertMacClientFormalSmokeCommand(command, label) {
  assertIncludes(command, "run-mac-client-formal-smoke.mjs", label);
  assertIncludes(command, "--discover", label);
  assertIncludes(command, "--ensureClient", label);
  assertIncludes(command, "--preflightOnly", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "--json", label);
}

function assertMacClientPromptPasswordSmokeCommand(command, label) {
  assertIncludes(command, "run-mac-client-formal-smoke.mjs", label);
  assertIncludes(command, "--discover", label);
  assertIncludes(command, "--ensureClient", label);
  assertIncludes(command, "--promptPassword", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--preflightOnly", label);
  assertNotIncludes(command, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(command, "--useEnvPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "--json", label);
  assertNotIncludes(command, "input_event", label);
  assertNotIncludes(command, "inject", label);
}

function assertMacClientBrowserSelfTestCommand(command, label) {
  assertIncludes(command, "scripts/mac/test-mac-client-browser-self-test-wrapper.mjs", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "scripts/mac/test-mac-client-browser-self-test.mjs", label);
  assertNotIncludes(command, "scripts/windows/test-mac-client-browser.mjs", label);
  assertNotIncludes(command, "--useExistingHost", label);
  assertNotIncludes(command, "--useEnvPassword", label);
  assertNotIncludes(command, "--requirePassword", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
}

function assertMacScriptHelpCommand(command, label) {
  assertIncludes(command, "test-mac-script-help.mjs", label);
  assertIncludes(command, "--timeoutMs 10000", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "--json", label);
  assertNotIncludes(command, "input_event", label);
  assertNotIncludes(command, "inject", label);
}

function assertMacPowerPlanCommand(command, label) {
  assertIncludes(command, "scripts/mac/plan-mac-power-settings.mjs", label);
  assertIncludes(command, "--profile all", label);
  assertIncludes(command, "--sleep 0", label);
  assertIncludes(command, "--displaySleep 0", label);
  assertIncludes(command, "--networkWake on", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--apply", label);
  assertNotIncludes(command, "sudo", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "--json", label);
  assertNotIncludes(command, "input_event", label);
  assertNotIncludes(command, "inject", label);
}

function assertMacInputSafetyPlanCommand(command, label) {
  assertIncludes(command, "scripts/mac/plan-mac-input-safety.mjs", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--apply", label);
  assertNotIncludes(command, "sudo", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "--json", label);
  assertNotIncludes(command, "input_event", label);
  assertNotIncludes(command, "inject", label);
}

function assertMacRemoteAudioPlanCommand(command, label) {
  assertIncludes(command, "scripts/mac/plan-mac-remote-audio.mjs", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--apply", label);
  assertNotIncludes(command, "sudo", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "--json", label);
  assertNotIncludes(command, "input_event", label);
  assertNotIncludes(command, "inject", label);
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assertIncludes(result.stdout, "Usage:", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macClientPageStatusCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macClientCopyDiagnosticsAction", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macClientManualChecklistAction", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macClientDiscoverWindowsCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.windowsHostStatusCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.windowsHostReadinessCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macClientReverseRehearsalAction", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macClientReverseGrantCopyAction", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.windowsReverseGrantStatusCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.windowsOpenOneTimeReverseGrantCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.windowsReverseGrantStatusNodeFallbackCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.windowsOpenOneTimeReverseGrantNodeFallbackCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macClientFormalChecklistCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macClientFormalSmokeCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macClientPromptPasswordSmokeCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macClientBrowserSelfTestCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macPowerPlanCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macRemoteAudioPlanCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macInputSafetyPlanCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macScriptHelpCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "board.windowsLanRisk", `${script} ${flag}`);
    assertIncludes(result.stdout, "board.macUnattendedFreshness", `${script} ${flag}`);
  }
  print("OK", "Mac client readiness help exits quickly");
}

function checkOfflineJson(args) {
  const result = run(["--json", "--clientPort", "9", "--timeoutMs", "1200"], args);
  const payload = parseJson(result.stdout, "offline JSON");
  assert(result.status === 0, "offline JSON without require flags should not fail");
  assert(payload.ok === true, "offline JSON without require flags should be ok with warnings");
  assert(payload.client?.ok === true, "client static checks should pass");
  assert(payload.clientServer?.checked === false, "client server should not be checked by default");
  assert(payload.windowsHost?.checked === false, "Windows host should not be checked by default");
  assert(Array.isArray(payload.checklist), "payload should include checklist");
  assertMacClientPageStatusCommand(payload.commands?.macClientPageStatusCommand || "", "offline JSON Mac client page status command");
  assertMacClientDiscoverWindowsCommand(payload.commands?.macClientDiscoverWindowsCommand || "", "offline JSON Mac client Windows discovery command");
  assertWindowsHostStatusCommand(payload.commands?.windowsHostStatusCommand || "", "offline JSON Windows host status command");
  assertWindowsHostReadinessCommand(payload.commands?.windowsHostReadinessCommand || "", "offline JSON Windows host readiness command");
  assertMacClientReverseRehearsalAction(payload.commands?.macClientReverseRehearsalAction || "", "offline JSON Mac client reverse rehearsal action");
  assertMacClientReverseGrantCopyAction(payload.commands?.macClientReverseGrantCopyAction || "", "offline JSON Mac client reverse grant copy action");
  assertWindowsReverseGrantCommands(payload.commands, "offline JSON Windows reverse grant commands");
  assertMacClientFormalChecklistCommand(
    payload.commands?.macClientFormalChecklistCommand || "",
    "offline JSON Mac client formal checklist command",
    "<Windows IP>",
    "43770",
    { discover: true },
  );
  assertMacClientFormalSmokeCommand(payload.commands?.macClientFormalSmokeCommand || "", "offline JSON Mac client formal smoke command");
  assertMacClientPromptPasswordSmokeCommand(
    payload.commands?.macClientPromptPasswordSmokeCommand || "",
    "offline JSON Mac client prompt-password smoke command",
  );
  assertMacClientBrowserSelfTestCommand(payload.commands?.macClientBrowserSelfTestCommand || "", "offline JSON Mac client browser self-test command");
  assertMacPowerPlanCommand(payload.commands?.macPowerPlanCommand || "", "offline JSON Mac power plan command");
  assertMacRemoteAudioPlanCommand(payload.commands?.macRemoteAudioPlanCommand || "", "offline JSON Mac remote audio plan command");
  assertMacInputSafetyPlanCommand(payload.commands?.macInputSafetyPlanCommand || "", "offline JSON Mac input safety plan command");
  assertMacScriptHelpCommand(payload.commands?.macScriptHelpCommand || "", "offline JSON Mac script help command");
  assertMacClientManualChecklistAction(
    payload.commands?.macClientManualChecklistAction || "",
    "offline JSON Mac client manual checklist action",
  );
  assert(String(payload.commands?.macClientCopyDiagnosticsAction || "").includes("复制诊断"), "payload should include copy diagnostics action");
  assert(String(payload.commands?.macClientCopyDiagnosticsAction || "").includes("连接密码"), "copy diagnostics action should mention password safety");
  assert(/Mac client readiness:/.test(payload.boardSummary || ""), "payload should include boardSummary");
  assertNotIncludes(payload.boardSummary || "", "Evidence=MacClientDiagnosticsOk", "offline JSON boardSummary");
  assertNotIncludes(payload.boardSummary || "", "MacClientDiagnostics=status=ok", "offline JSON boardSummary");
  assertIncludes(payload.boardSummary || "", "blockers=none", "offline JSON boardSummary");
  assertMatches(payload.boardSummary || "", /warnings=[^.]*client-server/, "offline JSON boardSummary warnings");
  assertMatches(payload.boardSummary || "", /warnings=[^.]*board/, "offline JSON boardSummary warnings");
  assertMatches(payload.boardSummary || "", /warnings=[^.]*windows-host/, "offline JSON boardSummary warnings");
  assert(/MacClientDiscoverWindows=/.test(payload.boardSummary || ""), "boardSummary should include Windows discovery command");
  assert(/WindowsHostStatus=/.test(payload.boardSummary || ""), "boardSummary should include Windows host status command");
  assert(/WindowsHostReadiness=/.test(payload.boardSummary || ""), "boardSummary should include Windows host readiness command");
  assert(/MacClientReverseRehearsal=/.test(payload.boardSummary || ""), "boardSummary should include reverse rehearsal action");
  assert(/MacClientReverseGrantCopy=/.test(payload.boardSummary || ""), "boardSummary should include reverse grant copy action");
  assertWindowsReverseGrantBoardSummary(payload.boardSummary || "", "offline JSON boardSummary");
  assert(/MacClientFormalChecklist=/.test(payload.boardSummary || ""), "boardSummary should include formal checklist command");
  assert(/MacClientFormalSmoke=/.test(payload.boardSummary || ""), "boardSummary should include formal smoke command");
  assert(/MacClientPromptPasswordSmoke=/.test(payload.boardSummary || ""), "boardSummary should include prompt-password smoke command");
  assertMacClientPromptPasswordSmokeCommand(
    (payload.boardSummary || "").split("MacClientPromptPasswordSmoke=")[1]?.split("; ")[0] || "",
    "offline JSON boardSummary Mac client prompt-password smoke command",
  );
  assert(/MacClientBrowserSelfTest=/.test(payload.boardSummary || ""), "boardSummary should include browser self-test command");
  assert(/MacPowerPlan=/.test(payload.boardSummary || ""), "boardSummary should include Mac power settings dry-run plan");
  assertMacPowerPlanCommand(
    (payload.boardSummary || "").split("MacPowerPlan=")[1]?.split("; ")[0] || "",
    "offline JSON boardSummary Mac power plan command",
  );
  assert(/MacRemoteAudioPlan=/.test(payload.boardSummary || ""), "boardSummary should include Mac remote audio plan");
  assertMacRemoteAudioPlanCommand(
    (payload.boardSummary || "").split("MacRemoteAudioPlan=")[1]?.split("; ")[0] || "",
    "offline JSON boardSummary Mac remote audio plan command",
  );
  assert(/MacInputSafetyPlan=/.test(payload.boardSummary || ""), "boardSummary should include Mac input safety plan");
  assertMacInputSafetyPlanCommand(
    (payload.boardSummary || "").split("MacInputSafetyPlan=")[1]?.split("; ")[0] || "",
    "offline JSON boardSummary Mac input safety plan command",
  );
  assert(/MacScriptHelp=/.test(payload.boardSummary || ""), "boardSummary should include Mac script help command");
  assertIncludes(payload.boardSummary || "", "MacScriptHelp=node scripts/mac/test-mac-script-help.mjs", "offline JSON boardSummary");
  assert(/MacClientManualChecklist=/.test(payload.boardSummary || ""), "boardSummary should include manual checklist action");
  assertMacClientManualChecklistAction(
    (payload.boardSummary || "").split("MacClientManualChecklist=")[1]?.split("; ")[0] || "",
    "offline JSON boardSummary manual checklist action",
  );
  assert(/CopyDiagnostics=Mac client 事件日志点击/.test(payload.boardSummary || ""), "boardSummary should include copy diagnostics action");
  print("OK", "Offline JSON is parseable and secret-free");
}

function checkRequireFailures(args) {
  const client = run([
    "--json",
    "--probeClientServer",
    "--requireClientServer",
    "--clientPort",
    "9",
    "--timeoutMs",
    "1200",
  ], args);
  const clientPayload = parseJson(client.stdout, "require client JSON");
  assert(client.status !== 0, "requireClientServer should fail offline");
  assert(clientPayload.ok === false, "requireClientServer payload should be ok=false");
  assert(clientPayload.checklist.some((item) => item.id === "client-server" && item.status === "blocker"), "client-server blocker should be present");
  assertMatches(clientPayload.boardSummary || "", /blockers=[^.]*client-server/, "require client boardSummary blockers");

  const windows = run([
    "--json",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--requireWindowsHost",
    "--timeoutMs",
    "1200",
  ], args);
  const windowsPayload = parseJson(windows.stdout, "require Windows JSON");
  assert(windows.status !== 0, "requireWindowsHost should fail offline");
  assert(windowsPayload.ok === false, "requireWindowsHost payload should be ok=false");
  assert(windowsPayload.checklist.some((item) => item.id === "windows-host" && item.status === "blocker"), "windows-host blocker should be present");
  assertMatches(windowsPayload.boardSummary || "", /blockers=[^.]*windows-host/, "require Windows boardSummary blockers");
  print("OK", "Require flags turn offline probes into blockers");
}

function checkBoardSummary(args) {
  const secret = "super-secret-mac-client-readiness";
  const result = run([
    "--boardSummary",
    "--server",
    `http://${secret}.invalid`,
    "--timeoutMs",
    "1200",
  ], args);
  const text = String(result.stdout || "").trim();
  assert(result.status === 0, "board summary should exit 0 without blockers");
  assertIncludes(text, "Mac client readiness:", "board summary");
  assertNotIncludes(text, "Evidence=MacClientDiagnosticsOk", "board summary");
  assertNotIncludes(text, "MacClientDiagnostics=status=ok", "board summary");
  assertIncludes(text, "blockers=none", "board summary");
  assertMatches(text, /warnings=[^.]*client-server/, "board summary warnings");
  assertMatches(text, /warnings=[^.]*board/, "board summary warnings");
  assertMatches(text, /warnings=[^.]*windows-host/, "board summary warnings");
  assertIncludes(text, "MacClientPage=", "board summary");
  assertIncludes(text, "start-mac-client.mjs", "board summary");
  assertIncludes(text, "MacClientDiscoverWindows=", "board summary");
  assertIncludes(text, "discover-windows-hosts.mjs", "board summary");
  assertIncludes(text, "WindowsHostStatus=", "board summary");
  assertIncludes(text, "start-windows-host.mjs --status --host 127.0.0.1 --port 43770 --boardSummary", "board summary");
  assertIncludes(text, "WindowsHostReadiness=", "board summary");
  assertIncludes(text, "check-windows-host-readiness.mjs --host 127.0.0.1 --port 43770 --checkBoard --boardSummary", "board summary");
  assertIncludes(text, "MacClientReverseRehearsal=", "board summary");
  assertIncludes(text, "MacClientReverseGrantCopy=", "board summary");
  assertWindowsReverseGrantBoardSummary(text, "board summary");
  assertIncludes(text, "ReverseRehearsal=", "board summary");
  assertIncludes(text, "LAN008", "board summary");
  assertIncludes(text, "MacClientFormalChecklist=", "board summary");
  assertIncludes(text, "check-mac-client-formal-status.mjs", "board summary");
  assertIncludes(text, "MacClientFormalSmoke=", "board summary");
  assertIncludes(text, "run-mac-client-formal-smoke.mjs", "board summary");
  assertIncludes(text, "--preflightOnly", "board summary");
  assertIncludes(text, "MacClientPromptPasswordSmoke=", "board summary");
  assertMacClientPromptPasswordSmokeCommand(
    text.split("MacClientPromptPasswordSmoke=")[1]?.split("; ")[0] || "",
    "board summary Mac client prompt-password smoke command",
  );
  assertIncludes(text, "MacClientBrowserSelfTest=", "board summary");
  assertIncludes(text, "scripts/mac/test-mac-client-browser-self-test-wrapper.mjs", "board summary");
  assertIncludes(text, "MacPowerPlan=", "board summary");
  assertMacPowerPlanCommand(
    text.split("MacPowerPlan=")[1]?.split("; ")[0] || "",
    "board summary Mac power plan command",
  );
  assertIncludes(text, "MacInputSafetyPlan=", "board summary");
  assertMacInputSafetyPlanCommand(
    text.split("MacInputSafetyPlan=")[1]?.split("; ")[0] || "",
    "board summary Mac input safety plan command",
  );
  assertIncludes(text, "MacScriptHelp=", "board summary");
  assertIncludes(text, "MacScriptHelp=node scripts/mac/test-mac-script-help.mjs", "board summary");
  assertIncludes(text, "MacClientManualChecklist=", "board summary");
  assertMacClientManualChecklistAction(
    text.split("MacClientManualChecklist=")[1]?.split("; ")[0] || "",
    "board summary manual checklist action",
  );
  assertIncludes(text, "CopyDiagnostics=Mac client 事件日志点击", "board summary");
  assertIncludes(text, "连接密码", "board summary");
  assertIncludes(text, "Do not send passwords", "board summary");
  assertNotIncludes(`${result.stdout}\n${result.stderr}`, secret, "board summary output");
  print("OK", "Board summary is short and does not echo secret-like server text");
}

function checkPlainReport(args) {
  const result = run(["--timeoutMs", "1200"], args);
  assert(result.status === 0, "plain report should exit 0 without blockers");
  assertIncludes(result.stdout, "Mac client page status:", "plain report");
  assertIncludes(result.stdout, "start-mac-client.mjs", "plain report");
  assertIncludes(result.stdout, "Mac client discover Windows host:", "plain report");
  assertIncludes(result.stdout, "discover-windows-hosts.mjs", "plain report");
  assertIncludes(result.stdout, "Windows host status for Windows side:", "plain report");
  assertIncludes(result.stdout, "start-windows-host.mjs --status --host 127.0.0.1 --port 43770 --boardSummary", "plain report");
  assertIncludes(result.stdout, "Windows host readiness for Windows side:", "plain report");
  assertIncludes(result.stdout, "check-windows-host-readiness.mjs --host 127.0.0.1 --port 43770 --checkBoard --boardSummary", "plain report");
  assertIncludes(result.stdout, "Mac client reverse rehearsal:", "plain report");
  assertIncludes(result.stdout, "ReverseRehearsal=", "plain report");
  assertIncludes(result.stdout, "Mac client reverse grant copy:", "plain report");
  assertIncludes(result.stdout, "复制 Node", "plain report");
  assertIncludes(result.stdout, "Windows reverse grant status:", "plain report");
  assertWindowsReverseGrantPowerShellCommand(
    extractPlainLineValue(result.stdout, "- Windows reverse grant status: ", "plain report"),
    "plain report PowerShell status",
    "43770",
    "status",
  );
  assertIncludes(result.stdout, "Windows one-time reverse grant:", "plain report");
  assertWindowsReverseGrantPowerShellCommand(
    extractPlainLineValue(result.stdout, "- Windows one-time reverse grant: ", "plain report"),
    "plain report PowerShell grant",
    "43770",
    "grant",
  );
  assertIncludes(result.stdout, "Windows reverse grant status (Node fallback):", "plain report");
  assertWindowsReverseGrantNodeFallbackCommand(
    extractPlainLineValue(result.stdout, "- Windows reverse grant status (Node fallback): ", "plain report"),
    "plain report Node status",
    "43770",
    "status",
  );
  assertIncludes(result.stdout, "Windows one-time reverse grant (Node fallback):", "plain report");
  assertWindowsReverseGrantNodeFallbackCommand(
    extractPlainLineValue(result.stdout, "- Windows one-time reverse grant (Node fallback): ", "plain report"),
    "plain report Node grant",
    "43770",
    "grant",
  );
  assertIncludes(result.stdout, "Mac client formal checklist:", "plain report");
  assertIncludes(result.stdout, "check-mac-client-formal-status.mjs", "plain report");
  assertIncludes(result.stdout, "Mac client formal smoke preflight:", "plain report");
  assertIncludes(result.stdout, "run-mac-client-formal-smoke.mjs", "plain report");
  assertIncludes(result.stdout, "Mac client browser self-test:", "plain report");
  assertIncludes(result.stdout, "scripts/mac/test-mac-client-browser-self-test-wrapper.mjs", "plain report");
  assertIncludes(result.stdout, "Mac power settings dry-run plan:", "plain report");
  assertMacPowerPlanCommand(
    extractPlainLineValue(result.stdout, "- Mac power settings dry-run plan: ", "plain report"),
    "plain report Mac power plan",
  );
  assertIncludes(result.stdout, "Mac input safety plan:", "plain report");
  assertMacInputSafetyPlanCommand(
    extractPlainLineValue(result.stdout, "- Mac input safety plan: ", "plain report"),
    "plain report Mac input safety plan",
  );
  assertIncludes(result.stdout, "Mac script help safety check:", "plain report");
  assertMacScriptHelpCommand(
    extractPlainLineValue(result.stdout, "- Mac script help safety check: ", "plain report"),
    "plain report Mac script help",
  );
  assertIncludes(result.stdout, "Mac client manual checklist:", "plain report");
  assertMacClientManualChecklistAction(
    extractPlainLineValue(result.stdout, "- Mac client manual checklist: ", "plain report"),
    "plain report Mac client manual checklist",
  );
  assertIncludes(result.stdout, "Copy diagnostics:", "plain report");
  assertIncludes(result.stdout, "复制诊断", "plain report");
  assertIncludes(result.stdout, "连接密码", "plain report");
  print("OK", "Plain report includes copy diagnostics guidance");
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

function waitForHttpPath(port, pathname, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolveWait, rejectWait) => {
    const attempt = () => {
      const result = spawnSync(process.execPath, [
        "--input-type=module",
        "-e",
        `const r=await fetch("http://127.0.0.1:${port}${pathname}"); if(!r.ok) process.exit(1);`,
      ], {
        encoding: "utf8",
        timeout: 2000,
      });
      if (result.status === 0) {
        resolveWait();
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        rejectWait(new Error(`HTTP server on ${port}${pathname} did not become ready`));
        return;
      }
      setTimeout(attempt, 100);
    };
    attempt();
  });
}

async function withMacClientServer(args, callback) {
  const port = await getFreePort();
  const child = spawn(process.execPath, ["apps/mac-client/server.mjs", String(port)], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  try {
    await waitForHttpPath(port, "/", args.timeoutMs);
    await callback(port);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1000);
      child.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

async function withBoardStateServer(args, state, callback) {
  const port = await getFreePort();
  const child = spawn(process.execPath, [
    "--input-type=module",
    "-e",
    `
import { createServer } from "node:http";
const port = Number(process.argv[1]);
const state = ${JSON.stringify(state)};
createServer((request, response) => {
  const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
  if (pathname !== "/api/state") {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("not found\\n");
    return;
  }
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(state));
}).listen(port, "127.0.0.1");
`,
    String(port),
  ], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForHttpPath(port, "/api/state", args.timeoutMs);
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1000);
      child.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

async function checkBoardWindowsLanRisk(args) {
  const boardState = {
    updatedAt: "2026-06-18T12:58:23.345Z",
    currentCall: null,
    statuses: {
      "Windows Codex": {
        status: "idle",
        note: "Windows readiness true summary WindowsLanRisk=no-firewall-allow,public-profile",
      },
    },
    events: [
      {
        id: "safe-risk",
        at: "2026-06-18T12:58:23.345Z",
        type: "message",
        from: "Windows Codex",
        text: "WindowsLanRisk=no-firewall-allow,public-profile",
      },
      {
        id: "unsafe-password-flag",
        at: "2026-06-18T12:58:24.345Z",
        type: "message",
        from: "Windows Codex",
        text: "Ignore unsafe candidate WindowsLanRisk=--password=sauce",
      },
      {
        id: "unsafe-env-password",
        at: "2026-06-18T12:58:25.345Z",
        type: "message",
        from: "Windows Codex",
        text: "Ignore unsafe candidate WindowsLanRisk=LAN_DUAL_PASSWORD=hunter2",
      },
    ],
  };
  await withBoardStateServer(args, boardState, async (serverUrl) => {
    const result = run([
      "--json",
      "--checkBoard",
      "--server",
      serverUrl,
      "--timeoutMs",
      "1200",
    ], args);
    const payload = parseJson(result.stdout, "board risk JSON");
    assert(result.status === 0, `board risk JSON should exit 0 with warnings allowed.\n${result.stdout}\n${result.stderr}`);
    assertWindowsLanRisk(payload, `${result.stdout}\n${result.stderr}`, "board risk JSON");
  });
  print("OK", "Board WindowsLanRisk is surfaced without leaking unsafe candidates");
}

async function checkBoardMacUnattendedFreshness(args) {
  const boardState = {
    updatedAt: "2026-06-19T08:10:00.000Z",
    currentCall: null,
    statuses: {
      "Mac Heartbeat": {
        status: "online",
        note: "MacPowerHealth=warning reason=system-sleep-enabled warnings=system-sleep-enabled,display-sleep-enabled checkedAt=2026-06-19T08:09:00.000Z.",
      },
      "Mac Unattended": {
        status: "warning",
        note: "MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded,power checkedAt=2026-01-01T00:00:00.000Z. MacPowerHealth=warning reason=system-sleep-enabled warnings=system-sleep-enabled,display-sleep-enabled checkedAt=2026-06-19T08:09:00.000Z.",
      },
    },
    events: [
      {
        id: "unsafe-password-flag",
        at: "2026-06-19T08:10:01.000Z",
        type: "message",
        from: "Mac Codex",
        text: "Ignore unsafe candidate MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=--password=sauce checkedAt=2026-06-19T08:10:00.000Z",
      },
    ],
  };
  await withBoardStateServer(args, boardState, async (serverUrl) => {
    const result = run([
      "--json",
      "--checkBoard",
      "--server",
      serverUrl,
      "--timeoutMs",
      "1200",
    ], args);
    const payload = parseJson(result.stdout, "board MacUnattendedFreshness JSON");
    assert(result.status === 0, `board MacUnattendedFreshness JSON should exit 0 with warnings allowed.\n${result.stdout}\n${result.stderr}`);
    assertMacUnattendedFreshness(payload, {
      status: "stale",
      checkedAt: "2026-01-01T00:00:00.000Z",
      thresholdMs: 600000,
      source: "MacUnattendedHealth",
    }, "board MacUnattendedFreshness JSON");
    assertIncludes(payload.boardSummary || "", "MacUnattendedFreshness=stale", "board MacUnattendedFreshness summary");
    assertIncludes(payload.boardSummary || "", "checkedAt=2026-01-01T00:00:00.000Z", "board MacUnattendedFreshness summary");
    assertIncludes(payload.boardSummary || "", "source=MacUnattendedHealth", "board MacUnattendedFreshness summary");
    assertNotIncludes(`${result.stdout}\n${result.stderr}`, "sauce", "board MacUnattendedFreshness output");
    assertNotIncludes(`${result.stdout}\n${result.stderr}`, "--password", "board MacUnattendedFreshness output");
  });
  const powerOnlyState = {
    updatedAt: "2026-06-19T08:12:00.000Z",
    currentCall: null,
    statuses: {
      "Mac Heartbeat": {
        status: "online",
        note: "MacPowerHealth=warning reason=display-sleep-enabled warnings=display-sleep-enabled checkedAt=2026-01-02T00:00:00.000Z.",
      },
    },
    events: [],
  };
  await withBoardStateServer(args, powerOnlyState, async (serverUrl) => {
    const result = run([
      "--json",
      "--checkBoard",
      "--server",
      serverUrl,
      "--timeoutMs",
      "1200",
    ], args);
    const payload = parseJson(result.stdout, "board MacPowerHealth fallback JSON");
    assert(result.status === 0, `board MacPowerHealth fallback should exit 0 with warnings allowed.\n${result.stdout}\n${result.stderr}`);
    assertMacUnattendedFreshness(payload, {
      status: "stale",
      checkedAt: "2026-01-02T00:00:00.000Z",
      thresholdMs: 600000,
      source: "MacPowerHealth",
    }, "board MacPowerHealth fallback JSON");
  });
  print("OK", "Board MacUnattendedFreshness is surfaced without leaking unsafe candidates");
}

async function checkClientServerProbe(args) {
  await withMacClientServer(args, async (port) => {
    const result = run(["--json", "--probeClientServer", "--requireClientServer", "--clientPort", String(port)], args);
    const payload = parseJson(result.stdout, "client server probe JSON");
    assert(result.status === 0, `client server probe should pass.\n${result.stdout}\n${result.stderr}`);
    assert(payload.clientServer?.online === true, "client server should be online");
    assert(payload.clientServer?.titleFound === true, "client server should look like Mac client page");
    assertIncludes(payload.boardSummary || "", "blockers=none", "client server probe boardSummary");
    assertNotIncludes(payload.boardSummary || "", "Evidence=MacClientDiagnosticsOk", "client server probe boardSummary");
    assertNotIncludes(payload.boardSummary || "", "MacClientDiagnostics=status=ok", "client server probe boardSummary");
    assertMatches(payload.boardSummary || "", /warnings=[^.]*board/, "client server probe boardSummary warnings");
    assertMatches(payload.boardSummary || "", /warnings=[^.]*windows-host/, "client server probe boardSummary warnings");
    assertMacClientPageStatusCommand(payload.commands?.macClientPageStatusCommand || "", "client server probe command");
    assertMacClientDiscoverWindowsCommand(payload.commands?.macClientDiscoverWindowsCommand || "", "client server probe Windows discovery command");
    assertWindowsHostStatusCommand(payload.commands?.windowsHostStatusCommand || "", "client server probe Windows host status command");
    assertWindowsHostReadinessCommand(payload.commands?.windowsHostReadinessCommand || "", "client server probe Windows host readiness command");
    assertMacClientReverseRehearsalAction(payload.commands?.macClientReverseRehearsalAction || "", "client server probe reverse rehearsal action");
    assertMacClientReverseGrantCopyAction(payload.commands?.macClientReverseGrantCopyAction || "", "client server probe reverse grant copy action");
    assertWindowsReverseGrantCommands(payload.commands, "client server probe Windows reverse grant commands");
    assertMacClientFormalChecklistCommand(
      payload.commands?.macClientFormalChecklistCommand || "",
      "client server probe formal checklist command",
      "<Windows IP>",
      "43770",
      { discover: true },
    );
    assertMacClientFormalSmokeCommand(payload.commands?.macClientFormalSmokeCommand || "", "client server probe formal smoke command");
    assertMacClientPromptPasswordSmokeCommand(
      payload.commands?.macClientPromptPasswordSmokeCommand || "",
      "client server probe prompt-password smoke command",
    );
    assertIncludes(payload.boardSummary || "", "MacClientPromptPasswordSmoke=", "client server probe boardSummary");
    assertMacClientBrowserSelfTestCommand(payload.commands?.macClientBrowserSelfTestCommand || "", "client server probe browser self-test command");
    assertMacInputSafetyPlanCommand(payload.commands?.macInputSafetyPlanCommand || "", "client server probe Mac input safety plan command");
    assertMacScriptHelpCommand(payload.commands?.macScriptHelpCommand || "", "client server probe script help command");
    assertMacClientManualChecklistAction(
      payload.commands?.macClientManualChecklistAction || "",
      "client server probe manual checklist action",
    );
    assertIncludes(payload.boardSummary || "", "MacClientManualChecklist=", "client server probe boardSummary");
    assert(payload.checklist.some((item) => item.id === "client-server" && item.status === "ok"), "client-server ok item should be present");
  });
  print("OK", "Running Mac client HTTP server probe passes");
}

async function checkClientDiagnosticsEvidence(args) {
  const boardState = {
    updatedAt: "2026-06-19T04:35:00.000Z",
    currentCall: null,
    statuses: {
      "Windows Codex": {
        status: "idle",
        note: "Windows ready; no risk tags",
      },
    },
    events: [],
  };
  await withMacClientServer(args, async (clientPort) => {
    await withBoardStateServer(args, boardState, async (serverUrl) => {
      const result = run([
        "--json",
        "--probeClientServer",
        "--requireClientServer",
        "--checkBoard",
        "--server",
        serverUrl,
        "--clientPort",
        String(clientPort),
        "--timeoutMs",
        "1200",
      ], args);
      const payload = parseJson(result.stdout, "client diagnostics evidence JSON");
      assert(result.status === 0, `client diagnostics evidence should pass.\n${result.stdout}\n${result.stderr}`);
      assert(payload.clientServer?.online === true, "client diagnostics evidence should see the local page online");
      assert(payload.board?.ok === true, "client diagnostics evidence should see Agent Link Board readable");
      assert(payload.checklist.some((item) => item.id === "windows-host" && item.status === "warning"), "windows-host warning should remain visible");
      assertIncludes(payload.boardSummary || "", "warnings=", "client diagnostics evidence boardSummary");
      assertIncludes(payload.boardSummary || "", "windows-host", "client diagnostics evidence boardSummary");
      assertIncludes(
        payload.boardSummary || "",
        "MacClientDiagnostics=status=ok probeClientServer=ok page=online blockers=none warnings=none",
        "client diagnostics evidence boardSummary",
      );
      assertIncludes(payload.boardSummary || "", "Evidence=MacClientDiagnosticsOk", "client diagnostics evidence boardSummary");
      assertNotIncludes(`${result.stdout}\n${result.stderr}`, "LAN_DUAL_PASSWORD", "client diagnostics evidence output");
      assertNotIncludes(`${result.stdout}\n${result.stderr}`, "--password", "client diagnostics evidence output");
    });
  });
  print("OK", "Clean local Mac client diagnostics emit stable evidence");
}

async function withWindowsDiscoveryServer(callback) {
  const port = await getFreePort();
  const child = spawn(process.execPath, [
    "--input-type=module",
    "-e",
    `
import { createServer } from "node:http";
const port = Number(process.argv[1]);
const server = createServer((request, response) => {
  if ((request.url || "").split("?")[0] !== "/discovery") {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("not found\\n");
    return;
  }
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({
    name: "Mock Windows Host",
    platform: "windows",
    host: "127.0.0.1",
    port,
    controlPort: port,
    runtime: {
      processId: 1234,
      buildId: "mock-win-build",
      uptimeSeconds: 12
    },
    capabilities: {
      reverseControl: true,
      screen: {
        active: true,
        mode: "ffmpeg-h264",
        capturePipeline: "windows-ffmpeg-gdigrab-h264",
        codec: "h264",
        h264Encoder: "h264_nvenc",
        videoTransports: ["json", "binary-jpeg", "binary-h264"]
      },
      audio: {
        active: true,
        mode: "wasapi",
        codec: "pcm-f32le-base64"
      },
      input: {
        enabled: true,
        mode: "log"
      },
      clipboard: {
        text: true,
        textMode: "system",
        file: true,
        fileMode: "clipboard"
      }
    }
  }));
});
server.listen(port, "127.0.0.1");
`,
    String(port),
  ], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForHttpPath(port, "/discovery", 5000);
    await callback(port);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1000);
      child.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

async function checkWindowsDiscoveryProbe(args) {
  await withWindowsDiscoveryServer(async (port) => {
    const result = run(["--json", "--host", "127.0.0.1", "--port", String(port), "--requireWindowsHost"], args);
    const payload = parseJson(result.stdout, "Windows discovery probe JSON");
    assert(result.status === 0, `Windows discovery probe should pass.\n${result.stdout}\n${result.stderr}`);
    assert(payload.windowsHost?.online === true, "Windows host should be online");
    assert(payload.windowsHost?.runtime?.buildId === "mock-win-build", "runtime build should be captured");
    assert(payload.windowsHost?.capabilities?.screen?.codec === "h264", "screen codec should be captured");
    assert(payload.windowsHost?.capabilities?.audio?.mode === "wasapi", "audio mode should be captured");
    assert(payload.windowsHost?.capabilities?.clipboard?.file === true, "file clipboard should be captured");
    assert(payload.checklist.some((item) => item.id === "windows-host" && item.status === "ok"), "windows-host ok item should be present");
    assert(/online 127\.0\.0\.1/.test(payload.boardSummary || ""), "board summary should include online Windows host");
    assertIncludes(payload.boardSummary || "", "blockers=none", "Windows discovery boardSummary");
    assertMatches(payload.boardSummary || "", /warnings=[^.]*client-server/, "Windows discovery boardSummary warnings");
    assertMatches(payload.boardSummary || "", /warnings=[^.]*board/, "Windows discovery boardSummary warnings");
    assertMacClientDiscoverWindowsCommand(payload.commands?.macClientDiscoverWindowsCommand || "", "Windows discovery probe Windows discovery command");
    assertWindowsHostStatusCommand(payload.commands?.windowsHostStatusCommand || "", "Windows discovery probe Windows host status command", String(port));
    assertIncludes(payload.boardSummary || "", `WindowsHostStatus=node scripts/windows/start-windows-host.mjs --status --host 127.0.0.1 --port ${port} --boardSummary`, "Windows discovery boardSummary");
    assertWindowsHostReadinessCommand(payload.commands?.windowsHostReadinessCommand || "", "Windows discovery probe Windows host readiness command", String(port));
    assertIncludes(payload.boardSummary || "", `WindowsHostReadiness=node scripts/windows/check-windows-host-readiness.mjs --host 127.0.0.1 --port ${port} --checkBoard --boardSummary`, "Windows discovery boardSummary");
    assertMacClientReverseRehearsalAction(payload.commands?.macClientReverseRehearsalAction || "", "Windows discovery probe reverse rehearsal action");
    assertMacClientReverseGrantCopyAction(payload.commands?.macClientReverseGrantCopyAction || "", "Windows discovery probe reverse grant copy action");
    assertWindowsReverseGrantCommands(payload.commands, "Windows discovery probe Windows reverse grant commands", String(port));
    assertWindowsReverseGrantBoardSummary(payload.boardSummary || "", "Windows discovery boardSummary reverse grant commands", String(port));
    assertMacClientFormalChecklistCommand(payload.commands?.macClientFormalChecklistCommand || "", "Windows discovery probe formal checklist command", "127.0.0.1", String(port));
    assertIncludes(payload.boardSummary || "", `MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs --host 127.0.0.1 --port ${port} --boardSummary`, "Windows discovery boardSummary");
    assertMacClientFormalSmokeCommand(payload.commands?.macClientFormalSmokeCommand || "", "Windows discovery probe formal smoke command");
    assertMacClientPromptPasswordSmokeCommand(
      payload.commands?.macClientPromptPasswordSmokeCommand || "",
      "Windows discovery probe prompt-password smoke command",
    );
    assertIncludes(payload.boardSummary || "", "MacClientPromptPasswordSmoke=", "Windows discovery boardSummary");
    assertMacClientBrowserSelfTestCommand(payload.commands?.macClientBrowserSelfTestCommand || "", "Windows discovery probe browser self-test command");
    assertMacInputSafetyPlanCommand(payload.commands?.macInputSafetyPlanCommand || "", "Windows discovery probe Mac input safety plan command");
    assertMacScriptHelpCommand(payload.commands?.macScriptHelpCommand || "", "Windows discovery probe script help command");
    assertMacClientManualChecklistAction(
      payload.commands?.macClientManualChecklistAction || "",
      "Windows discovery probe manual checklist action",
    );
    assertIncludes(payload.boardSummary || "", "MacClientManualChecklist=", "Windows discovery boardSummary");
  });
  print("OK", "Mock Windows /discovery probe captures runtime and capabilities");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  checkOfflineJson(args);
  checkRequireFailures(args);
  checkBoardSummary(args);
  checkPlainReport(args);
  await checkBoardWindowsLanRisk(args);
  await checkBoardMacUnattendedFreshness(args);
  await checkClientServerProbe(args);
  await checkClientDiagnosticsEvidence(args);
  await checkWindowsDiscoveryProbe(args);
  print("OK", "Mac client readiness self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
