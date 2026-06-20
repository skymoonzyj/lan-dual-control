#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/check-mac-host-readiness.mjs";

const defaults = {
  timeoutMs: 45000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-host-readiness-board.mjs [options]

Verifies check-mac-host-readiness Agent Link Board currentCall reporting.
The test uses a local fake board and does not start real hosts, authenticate,
prompt for passwords, or execute input injection.

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
      args.timeoutMs = Math.max(5000, Number(next) || defaults.timeoutMs);
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

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function run(extraArgs, args) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
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

function assertNoSecretLikeText(text, label) {
  const value = String(text || "");
  assert(!value.includes("super-secret-readiness-board"), `${label} leaked secret-like server text`);
  assert(!value.includes("super-secret-command-token"), `${label} leaked secret-like command text`);
}

function assertMacLaunchAgentPlanCommand(command, label) {
  const value = String(command || "");
  assert(value.includes("install-mac-host-launch-agent.mjs"), `${label} should use install-mac-host-launch-agent`);
  assert(value.includes("--port"), `${label} should keep the target port explicit`);
  assert(value.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!value.includes("--write"), `${label} should stay dry-run by default`);
  assert(!value.includes("--force"), `${label} should not overwrite files`);
  assert(!value.includes("launchctl"), `${label} should not run launchctl`);
  assert(!value.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!value.includes("--password"), `${label} should not embed a password argument`);
  assert(!value.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!value.includes("--server"), `${label} should not echo board server URLs`);
  assert(!value.includes("--json"), `${label} should default to one-line boardSummary output`);
  assert(!value.includes("inject"), `${label} should not instruct injection`);
}

function assertMacHostSafeStartCommand(command, label) {
  const value = String(command || "");
  assert(value.includes("start-mac-host.mjs"), `${label} should use start-mac-host`);
  assert(value.includes("--promptPassword"), `${label} should use a visible password prompt`);
  assert(value.includes("--requirePassword"), `${label} should require authentication`);
  assert(value.includes("--host 0.0.0.0"), `${label} should bind for LAN access`);
  assert(value.includes("--port"), `${label} should keep the target port explicit`);
  assert(!value.includes("--password"), `${label} should not embed a password argument`);
  assert(!value.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!value.includes("--server"), `${label} should not echo board server URLs`);
  assert(!value.includes("--json"), `${label} should default to user-visible startup`);
  assert(!value.includes("inject"), `${label} should not instruct injection`);
}

function assertMacHostStopCommand(command, label) {
  const value = String(command || "");
  assert(value.includes("start-mac-host.mjs"), `${label} should use start-mac-host`);
  assert(value.includes("--stop"), `${label} should make the stop action explicit`);
  assert(value.includes("--host"), `${label} should keep the target host explicit`);
  assert(value.includes("--port"), `${label} should keep the target port explicit`);
  assert(!value.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!value.includes("--requirePassword"), `${label} should not require authentication`);
  assert(!value.includes("--password"), `${label} should not embed a password argument`);
  assert(!value.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!value.includes("--server"), `${label} should not echo board server URLs`);
  assert(!value.includes("--json"), `${label} should default to user-visible shutdown`);
  assert(!value.includes("inject"), `${label} should not instruct injection`);
}

function assertMacResumeStatusCommand(command, label) {
  const value = String(command || "");
  assert(value.includes("check-mac-resume-status.mjs"), `${label} should use check-mac-resume-status`);
  assert(value.includes("--host"), `${label} should keep the target host explicit`);
  assert(value.includes("--port"), `${label} should keep the target port explicit`);
  assert(value.includes("--checkBoard"), `${label} should read Agent Link Board`);
  assert(value.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!value.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!value.includes("--requirePassword"), `${label} should not require authentication`);
  assert(!value.includes("--password"), `${label} should not embed a password argument`);
  assert(!value.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!value.includes("--forceCall"), `${label} should not force an Agent Link Board call`);
  assert(!value.includes("--server"), `${label} should not echo board server URLs`);
  assert(!value.includes("--json"), `${label} should default to one-line boardSummary output`);
  assert(!value.includes("input_event"), `${label} should not mention input events`);
  assert(!value.includes("inject"), `${label} should not instruct injection`);
}

function assertMacMaxFpsSafeStartCommand(command, label) {
  assertMacHostSafeStartCommand(command, label);
  assert(String(command || "").includes("--maxScreenFps 60"), `${label} should target the formal 60Hz foreground start`);
}

function assertMacMaxFpsPlanCommand(command, label) {
  assertMacLaunchAgentPlanCommand(command, label);
  assert(String(command || "").includes("--maxScreenFps 60"), `${label} should target the formal 60Hz max-FPS plan`);
}

function assertMacUnattendedFormalCommand(command, label) {
  const value = String(command || "");
  assert(value.includes("check-mac-unattended-status.mjs"), `${label} should use check-mac-unattended-status`);
  assert(value.includes("--host"), `${label} should keep the target host explicit`);
  assert(value.includes("--port"), `${label} should keep the target port explicit`);
  assert(value.includes("--requireLaunchAgentMaxFps"), `${label} should require the formal LaunchAgent max-FPS gate`);
  assert(value.includes("--requireLaunchAgentLoaded"), `${label} should require the LaunchAgent to be loaded`);
  assert(value.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!value.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!value.includes("--password"), `${label} should not embed a password argument`);
  assert(!value.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!value.includes("--server"), `${label} should not echo board server URLs`);
  assert(!value.includes("--json"), `${label} should default to one-line boardSummary output`);
  assert(!value.includes("inject"), `${label} should not instruct injection`);
}

function assertMacFormalLocalSmokeCommand(command, label) {
  const value = String(command || "");
  assert(value.includes("check-mac-formal-local-smoke.mjs"), `${label} should use check-mac-formal-local-smoke`);
  assert(value.includes("--host"), `${label} should keep the target host explicit`);
  assert(value.includes("--port"), `${label} should keep the target port explicit`);
  assert(value.includes("--promptPassword"), `${label} should prompt locally for the formal password`);
  assert(value.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!value.includes("--password"), `${label} should not embed a password argument`);
  assert(!value.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!value.includes("--server"), `${label} should not echo board server URLs`);
  assert(!value.includes("--json"), `${label} should default to one-line boardSummary output`);
  assert(!value.includes("inject"), `${label} should not instruct injection`);
}

function assertMacPowerPlanCommand(command, label) {
  const value = String(command || "");
  assert(value.includes("plan-mac-power-settings.mjs"), `${label} should use plan-mac-power-settings`);
  assert(value.includes("--profile all"), `${label} should cover the full Mac power profile`);
  assert(value.includes("--sleep 0"), `${label} should plan disabling system sleep`);
  assert(value.includes("--displaySleep 0"), `${label} should plan disabling display sleep`);
  assert(value.includes("--networkWake on"), `${label} should plan enabling network wake`);
  assert(value.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!value.includes("--apply"), `${label} should stay dry-run by default`);
  assert(!value.includes("sudo"), `${label} should not use sudo`);
  assert(!value.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!value.includes("--password"), `${label} should not embed a password argument`);
  assert(!value.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!value.includes("--forceCall"), `${label} should not force an Agent Link Board call`);
  assert(!value.includes("--server"), `${label} should not echo board server URLs`);
  assert(!value.includes("--json"), `${label} should default to one-line boardSummary output`);
  assert(!value.includes("input_event"), `${label} should not mention input events`);
  assert(!value.includes("inject"), `${label} should not instruct injection`);
}

function assertMacScriptHelpCommand(command, label) {
  const value = String(command || "");
  assert(value.includes("test-mac-script-help.mjs"), `${label} should use test-mac-script-help`);
  assert(value.includes("--timeoutMs 10000"), `${label} should keep the standard timeout`);
  assert(value.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!value.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!value.includes("--password"), `${label} should not embed a password argument`);
  assert(!value.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!value.includes("--forceCall"), `${label} should not force an Agent Link Board call`);
  assert(!value.includes("--server"), `${label} should not echo board server URLs`);
  assert(!value.includes("--json"), `${label} should default to one-line boardSummary output`);
  assert(!value.includes("input_event"), `${label} should not mention input events`);
  assert(!value.includes("inject"), `${label} should not instruct injection`);
}

function assertMacRemoteAudioPlanCommand(command, label) {
  const value = String(command || "");
  assert(value.includes("plan-mac-remote-audio.mjs"), `${label} should use plan-mac-remote-audio`);
  assert(value.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!value.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!value.includes("--password"), `${label} should not embed a password argument`);
  assert(!value.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!value.includes("--forceCall"), `${label} should not force an Agent Link Board call`);
  assert(!value.includes("--server"), `${label} should not echo board server URLs`);
  assert(!value.includes("--json"), `${label} should default to one-line boardSummary output`);
  assert(!value.includes("input_event"), `${label} should not mention input events`);
  assert(!value.includes("inject"), `${label} should not instruct injection`);
}

function assertMacInputSafetyPlanCommand(command, label) {
  const value = String(command || "");
  assert(value.includes("plan-mac-input-safety.mjs"), `${label} should use plan-mac-input-safety`);
  assert(value.includes("--boardSummary"), `${label} should produce a board summary`);
  assert(!value.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!value.includes("--password"), `${label} should not embed a password argument`);
  assert(!value.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!value.includes("--forceCall"), `${label} should not force an Agent Link Board call`);
  assert(!value.includes("--server"), `${label} should not echo board server URLs`);
  assert(!value.includes("--json"), `${label} should default to one-line boardSummary output`);
  assert(!value.includes("input_event"), `${label} should not mention input events`);
  assert(!value.includes("--inputMode inject"), `${label} should not start inject mode`);
}

function assertMacClientManualChecklistAction(text, label) {
  const value = String(text || "");
  assert(value.includes("Mac client 会话诊断查看“手工清单”"), `${label} should explain where to review the Mac client manual checklist`);
  assert(
    value.includes("连接/视频/音频/剪贴板/文件/窗口/全屏/原画/input_ack/复制诊断"),
    `${label} should list the manual UX checklist coverage`,
  );
  assert(value.includes("复制诊断"), `${label} should tell operators to copy diagnostics after checking`);
  assert(!value.includes("--promptPassword"), `${label} should not prompt for passwords`);
  assert(!value.includes("--password"), `${label} should not embed a password argument`);
  assert(!value.includes("--sendCall"), `${label} should not send an Agent Link Board call`);
  assert(!value.includes("--forceCall"), `${label} should not force an Agent Link Board call`);
  assert(!value.includes("input_event"), `${label} should not mention input events`);
  assert(!value.includes("inject"), `${label} should not instruct injection`);
}

function assertMacHostAuthPath(payload, expected, label) {
  const authPath = payload.board?.macHostAuthPath;
  assert(authPath?.status === expected.status, `${label} should expose MacHostAuthPath status`);
  assert(authPath?.reason === expected.reason, `${label} should expose MacHostAuthPath reason`);
  assert(authPath?.mode === expected.mode, `${label} should expose MacHostAuthPath mode`);
  assert(authPath?.next === expected.next, `${label} should expose MacHostAuthPath next action`);
}

function functionBlock(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert(start >= 0, `missing function ${name}`);
  let index = source.indexOf("{", start);
  assert(index >= 0, `missing body for function ${name}`);
  let depth = 0;
  for (; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

function formatMediaBoardSummaryFixture(summary) {
  const source = readFileSync(new URL("./check-mac-host-readiness.mjs", import.meta.url), "utf8");
  const formatter = [
    functionBlock(source, "formatMediaBoardSummary"),
    functionBlock(source, "formatMediaH264BoardSummary"),
    functionBlock(source, "formatH264NalTypesBoardSummary"),
    functionBlock(source, "normalizeMediaStatus"),
  ].join("\n");
  return Function("summary", `${formatter}\nreturn formatMediaBoardSummary(summary);`)(summary);
}

function mediaCommandArgsFixture(args) {
  const source = readFileSync(new URL("./check-mac-host-readiness.mjs", import.meta.url), "utf8");
  const helpers = [
    functionBlock(source, "mediaCommandArgs"),
  ].join("\n");
  return Function("args", `${helpers}\nreturn mediaCommandArgs(args);`)(args);
}

function h264FallbackPipelineWarningFixture(capabilities) {
  const source = readFileSync(new URL("./check-mac-host-readiness.mjs", import.meta.url), "utf8");
  const helpers = [
    functionBlock(source, "normalizedText"),
    functionBlock(source, "isH264CapturePipelineActive"),
    functionBlock(source, "h264FallbackPipelineWarning"),
  ].join("\n");
  return Function("capabilities", `${helpers}\nreturn h264FallbackPipelineWarning(capabilities);`)(capabilities);
}

function maxScreenFpsWarningFixture(capabilities) {
  const source = readFileSync(new URL("./check-mac-host-readiness.mjs", import.meta.url), "utf8");
  const helpers = [
    "const formalTargetMaxScreenFps = 60;",
    functionBlock(source, "getMaxScreenFps"),
    functionBlock(source, "maxScreenFpsWarning"),
  ].join("\n");
  return Function("capabilities", `${helpers}\nreturn maxScreenFpsWarning(capabilities);`)(capabilities);
}

function formatHostMediaBoardSummaryFixture(summary) {
  const source = readFileSync(new URL("./check-mac-host-readiness.mjs", import.meta.url), "utf8");
  const helpers = [
    functionBlock(source, "status"),
    functionBlock(source, "getMaxScreenFps"),
    functionBlock(source, "formatHostMediaBoardSummary"),
  ].join("\n");
  return Function("summary", `${helpers}\nreturn formatHostMediaBoardSummary(summary);`)(summary);
}

function formatHostBuildBoardSummaryFixture(summary) {
  const source = readFileSync(new URL("./check-mac-host-readiness.mjs", import.meta.url), "utf8");
  const helpers = [
    functionBlock(source, "formatHostBuildBoardSummary"),
  ].join("\n");
  return Function("summary", `${helpers}\nreturn formatHostBuildBoardSummary(summary);`)(summary);
}

function formatReadinessFindingsFixture(results) {
  const source = readFileSync(new URL("./check-mac-host-readiness.mjs", import.meta.url), "utf8");
  const helpers = [
    functionBlock(source, "normalizedText"),
    functionBlock(source, "readinessResultId"),
    functionBlock(source, "summarizeReadinessResultIds"),
    functionBlock(source, "isMacHostBuildStaleWarning"),
    functionBlock(source, "readinessWarningResultIds"),
    functionBlock(source, "summarizeReadinessWarningResultIds"),
    functionBlock(source, "formatReadinessFindings"),
  ].join("\n");
  return Function("results", `${helpers}\nreturn formatReadinessFindings(results);`)(results);
}

function formatReadinessBoardSummaryFixture(summary) {
  const source = readFileSync(new URL("./check-mac-host-readiness.mjs", import.meta.url), "utf8");
  const helpers = [
    "const defaultManualUxChecklist = \"connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics\";",
    functionBlock(source, "normalizedText"),
    functionBlock(source, "status"),
    functionBlock(source, "getMaxScreenFps"),
    functionBlock(source, "formatMediaProbeTarget"),
    functionBlock(source, "formatMediaBoardSummary"),
    functionBlock(source, "formatMediaH264BoardSummary"),
    functionBlock(source, "formatH264NalTypesBoardSummary"),
    functionBlock(source, "normalizeMediaStatus"),
    functionBlock(source, "formatHostBuildBoardSummary"),
    functionBlock(source, "formatHostMediaBoardSummary"),
    functionBlock(source, "readinessResultId"),
    functionBlock(source, "summarizeReadinessResultIds"),
    functionBlock(source, "isMacHostBuildStaleWarning"),
    functionBlock(source, "readinessWarningResultIds"),
    functionBlock(source, "summarizeReadinessWarningResultIds"),
    functionBlock(source, "formatReadinessFindings"),
    functionBlock(source, "formatBoardCallOneLine"),
    functionBlock(source, "formatBoardCallSummary"),
    functionBlock(source, "boardCallSearchText"),
    functionBlock(source, "isUsableEntryManualUxCall"),
    functionBlock(source, "formatManualUxStandbyBoardSummary"),
    functionBlock(source, "formatMacHostAuthPathSummary"),
    functionBlock(source, "makeMacRemoteAudioPlanCommand"),
    functionBlock(source, "makeMacInputSafetyPlanCommand"),
    functionBlock(source, "makeMacClientManualChecklistAction"),
    functionBlock(source, "formatReadinessBoardSummary"),
  ].join("\n");
  return Function("summary", `${helpers}\nreturn formatReadinessBoardSummary(summary);`)(summary);
}

function buildSuggestedActionFixture(summary) {
  const source = readFileSync(new URL("./check-mac-host-readiness.mjs", import.meta.url), "utf8");
  const helpers = [
    functionBlock(source, "buildSuggestedAction"),
  ].join("\n");
  return Function("summary", `${helpers}\nreturn buildSuggestedAction(summary);`)(summary);
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

async function withFakeBoard(currentCall, callback, options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "lan-dual-mac-readiness-board-"));
  const scriptPath = path.join(dir, "fake-board.mjs");
  const state = {
    currentCall,
    statuses: options.statuses || {},
    events: options.events || [],
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

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0; status=${result.status} signal=${result.signal || "none"} error=${result.error?.message || "none"} output=${`${result.stdout || ""}\n${result.stderr || ""}`.slice(0, 500)}`);
    assert(String(result.stdout).includes("Usage:"), `${script} ${flag} should print Usage`);
    assert(String(result.stdout).includes("--checkBoard"), `${script} ${flag} should document --checkBoard`);
    assert(String(result.stdout).includes("--boardSummary"), `${script} ${flag} should document --boardSummary`);
    assert(String(result.stdout).includes("--probeMedia"), `${script} ${flag} should document --probeMedia`);
    assert(String(result.stdout).includes("--probeMediaFps"), `${script} ${flag} should document --probeMediaFps`);
    assert(String(result.stdout).includes("--probeMediaBandwidthKbps"), `${script} ${flag} should document --probeMediaBandwidthKbps`);
    assert(String(result.stdout).includes("--probeMediaVideoDurationMs"), `${script} ${flag} should document --probeMediaVideoDurationMs`);
    assert(String(result.stdout).includes("--probeMediaAudioDurationMs"), `${script} ${flag} should document --probeMediaAudioDurationMs`);
    assert(String(result.stdout).includes("--probeMediaVideoMinFps"), `${script} ${flag} should document --probeMediaVideoMinFps`);
    assert(String(result.stdout).includes("commands.macHostSafeStartCommand"), `${script} ${flag} should document safe start command`);
    assert(String(result.stdout).includes("commands.macHostStopCommand"), `${script} ${flag} should document stop command`);
    assert(String(result.stdout).includes("commands.macMaxFpsSafeStartCommand"), `${script} ${flag} should document foreground 60Hz safe start command`);
    assert(String(result.stdout).includes("commands.macResumeStatusCommand"), `${script} ${flag} should document Mac resume status command`);
    assert(String(result.stdout).includes("commands.macLaunchAgentPlanCommand"), `${script} ${flag} should document LaunchAgent planner command`);
    assert(String(result.stdout).includes("commands.macMaxFpsPlanCommand"), `${script} ${flag} should document max-FPS planner command`);
    assert(String(result.stdout).includes("commands.macUnattendedFormalCommand"), `${script} ${flag} should document unattended formal gate command`);
    assert(String(result.stdout).includes("commands.macFormalLocalSmokeCommand"), `${script} ${flag} should document formal local smoke command`);
    assert(String(result.stdout).includes("commands.macPowerPlanCommand"), `${script} ${flag} should document Mac power dry-run plan command`);
    assert(String(result.stdout).includes("commands.macScriptHelpCommand"), `${script} ${flag} should document Mac script help safety command`);
    assert(String(result.stdout).includes("commands.macRemoteAudioPlanCommand"), `${script} ${flag} should document Mac remote audio plan command`);
    assert(String(result.stdout).includes("commands.macInputSafetyPlanCommand"), `${script} ${flag} should document Mac input safety plan command`);
    assert(String(result.stdout).includes("commands.macClientManualChecklistAction"), `${script} ${flag} should document Mac client manual checklist action`);
    assert(String(result.stdout).includes("board.macHostAuthPath"), `${script} ${flag} should document sanitized MacHostAuthPath board field`);
  }
  print("OK", "Mac host readiness board help exits quickly");
}

function checkDefaultDoesNotReadBoard(args) {
  const result = run(["--json", "--timeoutMs", "5000", "--skipCurrentBuildCheck"], args);
  const payload = parseJson(result.stdout, "default readiness JSON");
  assert(payload.board?.checked === false, "default readiness should not read Agent Link Board");
  assertMacHostSafeStartCommand(payload.commands?.macHostSafeStartCommand || "", "default readiness JSON safe start command");
  assertMacHostStopCommand(payload.commands?.macHostStopCommand || "", "default readiness JSON stop command");
  assertMacMaxFpsSafeStartCommand(payload.commands?.macMaxFpsSafeStartCommand || "", "default readiness JSON foreground 60Hz safe start command");
  assertMacResumeStatusCommand(payload.commands?.macResumeStatusCommand || "", "default readiness JSON Mac resume status command");
  assertMacLaunchAgentPlanCommand(payload.commands?.macLaunchAgentPlanCommand || "", "default readiness JSON LaunchAgent planner command");
  assertMacMaxFpsPlanCommand(payload.commands?.macMaxFpsPlanCommand || "", "default readiness JSON max-FPS planner command");
  assertMacUnattendedFormalCommand(payload.commands?.macUnattendedFormalCommand || "", "default readiness JSON unattended formal command");
  assertMacFormalLocalSmokeCommand(payload.commands?.macFormalLocalSmokeCommand || "", "default readiness JSON formal local smoke command");
  assertMacPowerPlanCommand(payload.commands?.macPowerPlanCommand || "", "default readiness JSON Mac power plan command");
  assertMacScriptHelpCommand(payload.commands?.macScriptHelpCommand || "", "default readiness JSON script help command");
  assertMacRemoteAudioPlanCommand(payload.commands?.macRemoteAudioPlanCommand || "", "default readiness JSON remote audio plan command");
  assertMacInputSafetyPlanCommand(payload.commands?.macInputSafetyPlanCommand || "", "default readiness JSON input safety plan command");
  assertMacClientManualChecklistAction(payload.commands?.macClientManualChecklistAction || "", "default readiness JSON Mac client manual checklist action");
  const maxFpsStep = payload.results?.find((item) => item.label === "Mac host max FPS");
  assert(maxFpsStep, "default readiness JSON should include an independent Mac host max FPS step");
  assert(maxFpsStep.ok === true, "Mac host max FPS step should be advisory and non-blocking");
  assert(String(payload.boardSummary || "").includes("call=not-checked"), "default boardSummary should mark call not checked");
  assert(String(payload.boardSummary || "").includes("blockers="), "default boardSummary should include blocker ids");
  assert(String(payload.boardSummary || "").includes("warnings="), "default boardSummary should include warning ids");
  assert(String(payload.boardSummary || "").includes("MacHostSafeStart="), "default boardSummary should include safe start guidance");
  assert(String(payload.boardSummary || "").includes("--host 0.0.0.0"), "default boardSummary should keep safe start bind host");
  assert(String(payload.boardSummary || "").includes("MacHostStop="), "default boardSummary should include stop guidance");
  assert(String(payload.boardSummary || "").includes("--stop"), "default boardSummary should make stop action explicit");
  assert(String(payload.boardSummary || "").includes("MacMaxFpsSafeStart="), "default boardSummary should include foreground 60Hz safe start guidance");
  assert(String(payload.boardSummary || "").includes("--maxScreenFps 60"), "default boardSummary should include foreground 60Hz safe start target");
  assert(String(payload.boardSummary || "").includes("MacResumeStatus="), "default boardSummary should include Mac resume status guidance");
  assert(String(payload.boardSummary || "").includes("check-mac-resume-status.mjs"), "default boardSummary should include the Mac resume status command");
  assert(String(payload.boardSummary || "").includes("MacLaunchAgentPlan="), "default boardSummary should include LaunchAgent planner guidance");
  assert(String(payload.boardSummary || "").includes("MacMaxFpsPlan="), "default boardSummary should include max-FPS planner guidance");
  assert(String(payload.boardSummary || "").includes("MacUnattendedFormal="), "default boardSummary should include unattended formal guidance");
  assert(String(payload.boardSummary || "").includes("MacFormalLocalSmoke="), "default boardSummary should include formal local smoke guidance");
  assert(String(payload.boardSummary || "").includes("MacPowerPlan="), "default boardSummary should include Mac power dry-run plan guidance");
  assert(String(payload.boardSummary || "").includes("MacPowerPlan=node scripts/mac/plan-mac-power-settings.mjs"), "default boardSummary should include the Mac power dry-run plan command");
  assert(String(payload.boardSummary || "").includes("MacScriptHelp="), "default boardSummary should include Mac script help safety guidance");
  assert(String(payload.boardSummary || "").includes("MacScriptHelp=node scripts/mac/test-mac-script-help.mjs"), "default boardSummary should include the Mac script help command");
  assert(String(payload.boardSummary || "").includes("MacRemoteAudioPlan="), "default boardSummary should include Mac remote audio plan guidance");
  assert(String(payload.boardSummary || "").includes("MacRemoteAudioPlan=node scripts/mac/plan-mac-remote-audio.mjs --boardSummary"), "default boardSummary should include the Mac remote audio plan command");
  assert(String(payload.boardSummary || "").includes("MacInputSafetyPlan="), "default boardSummary should include Mac input safety plan guidance");
  assert(String(payload.boardSummary || "").includes("MacInputSafetyPlan=node scripts/mac/plan-mac-input-safety.mjs --boardSummary"), "default boardSummary should include the Mac input safety plan command");
  assert(String(payload.boardSummary || "").includes("MacClientManualChecklist="), "default boardSummary should include Mac client manual checklist guidance");
  assertMacClientManualChecklistAction(
    payload.boardSummary.split("MacClientManualChecklist=")[1]?.split(". Do not send passwords")[0] || "",
    "default boardSummary MacClientManualChecklist",
  );
  assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "default readiness JSON");
  print("OK", "Mac host readiness does not read Agent Link Board by default");
}

function checkMediaBoardSummaryStatusFormatting() {
  const base = {
    args: { probeMedia: true },
    results: [
      {
        label: "Mac host media aggregate",
        ok: false,
        details: {
          summary: {
            status: "partial",
            passed: 1,
            failed: 1,
          },
        },
      },
    ],
  };
  assert(
    formatMediaBoardSummaryFixture(base) === "media=partial(passed=1,failed=1)",
    "media board summary should surface partial status",
  );
  assert(
    formatMediaBoardSummaryFixture({
      ...base,
      results: [{
        label: "Mac host media aggregate",
        ok: true,
        details: {
          summary: { status: "ok", passed: 2, failed: 0 },
          video: {
            observation: {
              h264: {
                keyFrames: 2,
                spsFrames: 2,
                ppsFrames: 2,
                idrFrames: 2,
                keyFramesWithParameterSets: 2,
                firstKeyFrameNalTypes: [7, 8, 5],
              },
            },
          },
        },
      }],
    }) === "media=ok h264Key=2 sps=2 pps=2 idr=2 keyParam=2 firstKeyNal=7,8,5",
    "media board summary should surface ok status, H.264 keyframe evidence, and first keyframe NAL types",
  );
  assert(
    formatMediaBoardSummaryFixture({
      ...base,
      results: [{
        label: "Mac host media aggregate",
        ok: false,
        details: { summary: { status: "failed", passed: 0, failed: 2 } },
      }],
    }) === "media=failed(passed=0,failed=2)",
    "media board summary should surface failed status with counts",
  );
  assert(
    formatMediaBoardSummaryFixture({
      ...base,
      results: [{
        label: "Mac host media aggregate",
        ok: false,
        details: { summary: { passed: 1, failed: 1 } },
      }],
    }) === "media=partial(passed=1,failed=1)",
    "media board summary should infer partial for older media summaries",
  );
  assert(
    formatMediaBoardSummaryFixture({
      ...base,
      results: [{
        label: "Mac host media aggregate",
        ok: false,
        details: {},
      }],
    }) === "media=failed",
    "media board summary should keep a media=failed fallback",
  );
  print("OK", "Mac host readiness media boardSummary formats ok/partial/failed");
}

function checkProbeMediaTuningCommandArgs() {
  const argv = mediaCommandArgsFixture({
    host: "192.168.31.122",
    port: 43770,
    timeoutMs: 45000,
    maxVideoFrameAgeMs: 250,
    maxAudioFrameAgeMs: 0,
    probeMediaResourceSample: true,
    probeMediaWidth: 1280,
    probeMediaHeight: 720,
    probeMediaFps: 60,
    probeMediaBandwidthKbps: 20000,
    probeMediaVideoDurationMs: 5000,
    probeMediaAudioDurationMs: 5000,
    probeMediaVideoMinFrames: 180,
    probeMediaAudioMinFrames: 200,
    probeMediaVideoMinFps: 50,
    probeMediaVideoMaxGapMs: 250,
    probeMediaAudioMaxGapMs: 250,
  });
  const joined = argv.join(" ");
  assert(joined.includes("--width 1280"), "media aggregate should forward custom width");
  assert(joined.includes("--height 720"), "media aggregate should forward custom height");
  assert(joined.includes("--fps 60"), "media aggregate should forward custom FPS");
  assert(joined.includes("--bandwidthKbps 20000"), "media aggregate should forward custom bandwidth");
  assert(joined.includes("--videoDurationMs 5000"), "media aggregate should forward custom video duration");
  assert(joined.includes("--audioDurationMs 5000"), "media aggregate should forward custom audio duration");
  assert(joined.includes("--videoMinFrames 180"), "media aggregate should forward custom video min frames");
  assert(joined.includes("--audioMinFrames 200"), "media aggregate should forward custom audio min frames");
  assert(joined.includes("--videoMinFps 50"), "media aggregate should forward custom video minimum FPS");
  assert(joined.includes("--videoMaxGapMs 250"), "media aggregate should forward custom video max gap");
  assert(joined.includes("--audioMaxGapMs 250"), "media aggregate should forward custom audio max gap");
  assert(joined.includes("--maxFrameAgeMs 250"), "media aggregate should keep freshness threshold forwarding");
  assert(joined.includes("--requireH264Keyframe"), "media aggregate should require H.264 keyframe SPS/PPS/IDR evidence");
  assert(joined.includes("--resourceSample"), "media aggregate should preserve resource sampling");
  assert(!joined.includes("--password"), "media aggregate command args should not embed passwords");
  assert(!joined.includes("input_event"), "media aggregate command args should not send input events");
  assert(!joined.includes("inject"), "media aggregate command args should not instruct injection");
  print("OK", "Mac host readiness forwards probeMedia tuning args");
}

function checkReadinessFindingsFormatting() {
  assert(
    formatReadinessFindingsFixture([
      { label: "Mac host media aggregate", ok: false, warnings: [] },
      { label: "Mac host discovery", ok: true, warnings: ["offline"] },
      { label: "Agent Link Board currentCall", ok: true, warnings: ["active call"] },
      { label: "Agent Link Board currentCall", ok: true, warnings: ["duplicate warning"] },
    ]) === "blockers=mac-host-media-aggregate warnings=mac-host-discovery,agent-link-board-currentcall",
    "readiness findings should summarize failed and warning labels as stable ids",
  );
  assert(
    formatReadinessFindingsFixture([
      {
        label: "Mac host discovery",
        ok: true,
        summary: "Mac host is online but running host build abc123 differs from current git def456",
        warnings: ["running host build abc123 differs from current git def456; restart recommended"],
        details: { buildDiff: { differs: true, severity: "restart-recommended" } },
      },
    ]) === "blockers=none warnings=mac-host-discovery,mac-host-build-stale",
    "stale Mac host runtime warning should expose a stable mac-host-build-stale id",
  );
  assert(
    formatReadinessFindingsFixture([{ label: "Node.js", ok: true, warnings: [] }]) === "blockers=none warnings=none",
    "readiness findings should emit explicit none values",
  );
  print("OK", "Mac host readiness boardSummary findings use stable ids");
}

function checkReadinessNextStepFormatting() {
  const summary = {
    args: { profile: "default", host: "127.0.0.1", port: 43770, probeMedia: true },
    passed: 12,
    failed: 0,
    warnings: 3,
    results: [
      {
        label: "Mac host discovery",
        ok: true,
        warnings: ["running host build 8015f22 has stale metadata only"],
        details: {
          online: true,
          buildDiff: {
            differs: true,
            severity: "stale-metadata",
            fromBuildId: "8015f22",
            changedHostRuntimeFileCount: 0,
          },
          capabilities: {
            h264Stream: true,
            capturePipeline: "background-jpeg",
            maxScreenFps: 60,
          },
        },
      },
      {
        label: "Agent Link Board currentCall",
        ok: true,
        warnings: ["active call from Supervisor Codex"],
      },
      {
        label: "Mac host media aggregate",
        ok: true,
        warnings: [],
        details: {
          summary: {
            status: "ok",
            passed: 2,
            failed: 0,
          },
        },
      },
      ...Array.from({ length: 9 }, (_, index) => ({
        label: `Auxiliary readiness ${index + 1}`,
        ok: true,
        warnings: [],
      })),
    ],
    board: { checked: true, ok: true, currentCall: null, activeCall: false },
    commands: {
      macHostSafeStartCommand: "node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770",
      macHostStopCommand: "node scripts/mac/start-mac-host.mjs --stop --host 127.0.0.1 --port 43770",
      macMaxFpsSafeStartCommand: "node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770 --maxScreenFps 60",
      macResumeStatusCommand: "node scripts/mac/check-mac-resume-status.mjs --host 127.0.0.1 --port 43770 --checkBoard --boardSummary",
      macLaunchAgentPlanCommand: "node scripts/mac/install-mac-host-launch-agent.mjs --port 43770 --boardSummary",
      macMaxFpsPlanCommand: "node scripts/mac/install-mac-host-launch-agent.mjs --port 43770 --maxScreenFps 60 --boardSummary",
      macUnattendedFormalCommand: "node scripts/mac/check-mac-unattended-status.mjs --host 127.0.0.1 --port 43770 --requireLaunchAgentMaxFps --requireLaunchAgentLoaded --boardSummary",
      macFormalLocalSmokeCommand: "node scripts/mac/check-mac-formal-local-smoke.mjs --host 127.0.0.1 --port 43770 --promptPassword --boardSummary",
      macPowerPlanCommand: "node scripts/mac/plan-mac-power-settings.mjs --profile all --sleep 0 --displaySleep 0 --networkWake on --boardSummary",
      macScriptHelpCommand: "node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary",
    },
  };
  const text = formatReadinessBoardSummaryFixture(summary);
  assert(text.includes("passed=12/12"), "passing readiness summary should preserve passed count");
  assert(text.includes("media=ok"), "passing media readiness summary should preserve media=ok");
  assert(!text.includes("fix failed checks"), "zero-failure readiness summary should not ask to fix failed checks");
  assert(text.includes("review warnings"), "zero-failure readiness summary with warnings should ask to review warnings");
  assert(text.includes("continue manual UX/formal E2E coordination"), "zero-failure readiness summary should keep the next validation path clear");
  assert(text.includes("keep inputMode=log"), "zero-failure readiness summary should keep unattended safety guidance");
  print("OK", "Mac host readiness boardSummary next step matches failed/warning state");
}

function checkUsableEntryCallKeepsManualUxStandby() {
  const manualUxChecklist = "connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics";
  const summary = {
    args: { profile: "default", host: "127.0.0.1", port: 43770 },
    failed: 0,
    warnings: 1,
    passed: 3,
    results: [
      {
        label: "Agent Link Board currentCall",
        ok: true,
        warnings: ["active call from Supervisor Codex"],
      },
      {
        label: "Mac host discovery",
        ok: true,
        warnings: [],
        details: { online: true },
      },
      {
        label: "Auxiliary readiness",
        ok: true,
        warnings: [],
      },
    ],
    board: {
      checked: true,
      ok: true,
      activeCall: true,
      currentCall: {
        status: "CALLING",
        goal: "强制可用化：尽快交付用户可打开、可连接、可远程 Mac 的第一版入口",
        from: "Supervisor Codex",
        need: "Windows Codex, Mac Codex",
        ask: "停止外围完善，直接推进可用入口和手工体验测试。",
      },
    },
    commands: {
      macHostSafeStartCommand: "node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770",
      macHostStopCommand: "node scripts/mac/start-mac-host.mjs --stop --host 127.0.0.1 --port 43770",
      macMaxFpsSafeStartCommand: "node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770 --maxScreenFps 60",
      macResumeStatusCommand: "node scripts/mac/check-mac-resume-status.mjs --host 127.0.0.1 --port 43770 --checkBoard --boardSummary",
      macLaunchAgentPlanCommand: "node scripts/mac/install-mac-host-launch-agent.mjs --port 43770 --boardSummary",
      macMaxFpsPlanCommand: "node scripts/mac/install-mac-host-launch-agent.mjs --port 43770 --maxScreenFps 60 --boardSummary",
      macUnattendedFormalCommand: "node scripts/mac/check-mac-unattended-status.mjs --host 127.0.0.1 --port 43770 --requireLaunchAgentMaxFps --requireLaunchAgentLoaded --boardSummary",
      macFormalLocalSmokeCommand: "node scripts/mac/check-mac-formal-local-smoke.mjs --host 127.0.0.1 --port 43770 --promptPassword --boardSummary",
      macPowerPlanCommand: "node scripts/mac/plan-mac-power-settings.mjs --profile all --sleep 0 --displaySleep 0 --networkWake on --boardSummary",
      macScriptHelpCommand: "node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary",
    },
  };
  const text = formatReadinessBoardSummaryFixture(summary);
  assert(text.includes("ManualUxStandby=MacManualUxStandby"), "usable-entry call should expose Mac manual UX standby");
  assert(text.includes(`ManualUxChecklist=${manualUxChecklist}`), "usable-entry call should expose the default manual UX checklist");
  assert(text.includes("manual UX validation"), "usable-entry next step should keep the first usable path explicit");
  assert(!text.includes("formal E2E coordination"), "usable-entry call should not send host readiness back to formal E2E coordination");
  assertNoSecretLikeText(text, "usable-entry Mac host readiness boardSummary");
  print("OK", "Usable-entry currentCall keeps Mac host readiness on manual UX path");
}

function checkHostBuildBoardSummaryFormatting() {
  assert(
    formatHostBuildBoardSummaryFixture({
      results: [{
        label: "Mac host discovery",
        details: {
          online: true,
          buildDiff: {
            differs: true,
            severity: "restart-recommended",
            fromBuildId: "abc1234",
            toBuildId: "def5678",
            changedHostRuntimeFileCount: 3,
          },
        },
      }],
    }) === "runtimeBuild=abc1234 restart recommended, hostRuntimeChanges=3",
    "host build board summary should include stale runtime build details",
  );
  assert(
    formatHostBuildBoardSummaryFixture({
      results: [{
        label: "Mac host discovery",
        details: {
          online: true,
          buildDiff: {
            differs: true,
            comparable: true,
            fromBuildId: "abc1234",
            toBuildId: "def5678",
            changedHostRuntimeFileCount: 1,
          },
        },
      }],
    }) === "runtimeBuild=abc1234 restart recommended, hostRuntimeChanges=1",
    "host build board summary should infer restart guidance from comparable runtime file changes",
  );
  assert(
    formatHostBuildBoardSummaryFixture({
      results: [{
        label: "Mac host discovery",
        details: {
          online: true,
          buildDiff: {
            differs: true,
            severity: "stale-metadata",
            fromBuildId: "abc1234",
            changedHostRuntimeFileCount: 0,
          },
        },
      }],
    }) === "runtimeBuild=abc1234 stale metadata only, hostRuntimeChanges=0",
    "host build board summary should keep stale metadata distinct from runtime changes",
  );
  assert(
    formatHostBuildBoardSummaryFixture({
      results: [{
        label: "Mac host discovery",
        details: {
          online: true,
          buildDiff: { severity: "ok", differs: false },
        },
      }],
    }) === "",
    "current host build should not add noise to the board summary",
  );
  print("OK", "Mac host readiness boardSummary includes stale build details");
}

function checkStaleBuildSuggestedActionFormatting() {
  const summary = {
    commands: {
      macHostStopCommand: "node scripts/mac/start-mac-host.mjs --stop --host 127.0.0.1 --port 43770",
      macHostSafeStartCommand: "node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770",
      macMaxFpsSafeStartCommand: "node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770 --maxScreenFps 60",
      macResumeStatusCommand: "node scripts/mac/check-mac-resume-status.mjs --host 127.0.0.1 --port 43770 --checkBoard --boardSummary",
    },
    results: [{
      label: "Mac host discovery",
      ok: true,
      warnings: ["Mac host runtime source changed since abc1234; restart before deploy-style validation."],
      details: {
        online: true,
        buildDiff: {
          differs: true,
          severity: "restart-recommended",
          fromBuildId: "abc1234",
          toBuildId: "def5678",
          changedHostRuntimeFileCount: 2,
        },
      },
    }],
  };
  const action = buildSuggestedActionFixture(summary);
  assert(action?.id === "restart-mac-host-safely", "stale build should expose a structured safe restart action");
  assert(String(action?.reason || "").includes("Mac host runtime build is stale"), "stale build action should explain stale runtime");
  assertMacHostStopCommand(action?.commands?.macHostStopCommand || "", "stale build suggested stop command");
  assertMacHostSafeStartCommand(action?.commands?.macHostSafeStartCommand || "", "stale build suggested safe start command");
  assertMacMaxFpsSafeStartCommand(action?.commands?.macMaxFpsSafeStartCommand || "", "stale build suggested 60Hz safe start command");
  assertMacResumeStatusCommand(action?.commands?.macResumeStatusCommand || "", "stale build suggested resume status command");
  assert(String(action?.boardSummary || "").includes("suggestedAction=restart-mac-host-safely"), "stale build action should include boardSummary label");
  assert(String(action?.boardSummary || "").includes("actionCommands=MacHostStop->MacHostSafeStart-or-MacMaxFpsSafeStart->MacResumeStatus"), "stale build action should include safe action order");

  const cleanAction = buildSuggestedActionFixture({
    commands: summary.commands,
    results: [{
      label: "Mac host discovery",
      ok: true,
      warnings: [],
      details: {
        online: true,
        buildDiff: { differs: false, severity: "ok" },
      },
    }],
  });
  assert(cleanAction === null, "current host build should not suggest a restart action");
  print("OK", "Mac host readiness suggests a safe restart action for stale runtime builds only");
}

function checkDiscoveryBackgroundJpegFormatting() {
  const discoveryWarning = h264FallbackPipelineWarningFixture({
    h264Stream: true,
    capturePipeline: "background-jpeg",
  });
  assert(discoveryWarning === "", "discovery background JPEG is an idle capability state and should not create a fallback warning");
  assert(
    h264FallbackPipelineWarningFixture({ h264Stream: true, capturePipeline: "screencapturekit-h264" }) === "",
    "active H.264 pipeline should not create a fallback warning",
  );
  assert(
    h264FallbackPipelineWarningFixture({ h264Stream: false, capturePipeline: "background-jpeg" }) === "",
    "non-H.264 capability should keep the existing blocker/probe paths instead of this warning",
  );
  assert(
    formatHostMediaBoardSummaryFixture({
      results: [{
        label: "Mac host discovery",
        details: {
          online: true,
          capabilities: {
            h264Stream: true,
            capturePipeline: "background-jpeg",
            maxScreenFps: 30,
          },
        },
      }],
    }) === "h264=on pipeline=background-jpeg maxFps=30",
    "host media board summary should include current H.264, pipeline, and max FPS state",
  );
  assert(
    formatHostMediaBoardSummaryFixture({
      results: [{
        label: "Mac host discovery",
        details: {
          online: false,
          capabilities: {
            h264Stream: true,
            capturePipeline: "background-jpeg",
          },
        },
      }],
    }) === "",
    "offline host media board summary should stay compact",
  );
  print("OK", "Mac host readiness avoids discovery background JPEG H.264 false warnings");
}

function checkMaxScreenFpsWarningFormatting() {
  const warning = maxScreenFpsWarningFixture({ maxScreenFps: 30 });
  assert(/maxScreenFps=30/.test(warning), "max-FPS warning should name the current remote max");
  assert(/formal 60Hz/.test(warning), "max-FPS warning should name the formal 60Hz target");
  assert(/max-FPS LaunchAgent plan/.test(warning), "max-FPS warning should recommend the dry-run planner");
  assert(maxScreenFpsWarningFixture({ maxScreenFps: 60 }) === "", "60Hz max should not create a warning");
  assert(maxScreenFpsWarningFixture({ maxScreenFps: 120 }) === "", "above-target max should not create a warning");
  assert(maxScreenFpsWarningFixture({}) === "", "missing max should not create a warning");
  assert(
    formatReadinessFindingsFixture([
      { label: "Mac host max FPS", ok: true, warnings: [warning] },
    ]) === "blockers=none warnings=mac-host-max-fps",
    "max-FPS warning should use a stable readiness id",
  );
  print("OK", "Mac host readiness formats maxScreenFps warnings safely");
}

function checkProbeMediaOfflineJson(args) {
  const result = run([
    "--json",
    "--probeMedia",
    "--probeMediaResourceSample",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "5000",
    "--skipCurrentBuildCheck",
  ], args);
  assert(result.status !== 0, "--probeMedia against an offline host should fail readiness");
  const payload = parseJson(result.stdout, "offline media readiness JSON");
  assert(payload.args?.probeMedia === true, "readiness JSON should preserve probeMedia flag");
  assert(payload.args?.probeMediaResourceSample === true, "readiness JSON should preserve probeMediaResourceSample flag");
  const step = payload.results?.find((item) => item.label === "Mac host media aggregate");
  assert(step, "readiness JSON should include Mac host media aggregate step");
  assert(step.ok === false, "offline Mac host media aggregate should fail");
  assert(String(step.summary || "").includes("Mac media baseline failed"), "media aggregate summary should include board-safe baseline failure text");
  assert(step.details?.summary?.status === "failed", "media aggregate details should preserve failed status");
  assert(step.details?.summary?.failed >= 1, "media aggregate details should preserve failed count");
  assert(step.details?.resource?.available === false, "offline media aggregate should mark resource unavailable");
  assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "offline probeMedia readiness JSON");
  print("OK", "Mac host readiness probeMedia exposes offline aggregate details safely");
}

function checkProbeMediaTuningOfflineJson(args) {
  const result = run([
    "--json",
    "--probeMedia",
    "--probeMediaFps",
    "60",
    "--probeMediaBandwidthKbps",
    "20000",
    "--probeMediaVideoDurationMs",
    "5000",
    "--probeMediaAudioDurationMs",
    "5000",
    "--probeMediaVideoMinFps",
    "50",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "5000",
    "--skipCurrentBuildCheck",
  ], args);
  assert(result.status !== 0, "tuned --probeMedia against an offline host should fail readiness");
  const payload = parseJson(result.stdout, "tuned offline media readiness JSON");
  assert(payload.args?.probeMedia === true, "tuned readiness JSON should preserve probeMedia flag");
  assert(payload.args?.probeMediaFps === 60, "tuned readiness JSON should preserve requested FPS");
  assert(payload.args?.probeMediaBandwidthKbps === 20000, "tuned readiness JSON should preserve requested bandwidth");
  assert(payload.args?.probeMediaVideoDurationMs === 5000, "tuned readiness JSON should preserve video duration");
  assert(payload.args?.probeMediaAudioDurationMs === 5000, "tuned readiness JSON should preserve audio duration");
  assert(payload.args?.probeMediaVideoMinFps === 50, "tuned readiness JSON should preserve minimum video FPS");
  assert(String(payload.boardSummary || "").includes("mediaTarget=1280x720@60Hz/20000kbps/5000ms audio=5000ms minVideoFps=50"), "tuned boardSummary should expose the secret-free media target");
  assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "tuned offline probeMedia readiness JSON");
  print("OK", "Mac host readiness preserves probeMedia tuning args in JSON and boardSummary");
}

function checkProbeMediaResourceSampleImpliesProbeMedia(args) {
  const result = run([
    "--json",
    "--probeMediaResourceSample",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "5000",
    "--skipCurrentBuildCheck",
  ], args);
  assert(result.status !== 0, "--probeMediaResourceSample against an offline host should run media aggregate and fail readiness");
  const payload = parseJson(result.stdout, "resource-sample implied media readiness JSON");
  assert(payload.args?.probeMedia === true, "--probeMediaResourceSample should imply probeMedia=true");
  assert(payload.args?.probeMediaResourceSample === true, "readiness JSON should preserve probeMediaResourceSample=true");
  const step = payload.results?.find((item) => item.label === "Mac host media aggregate");
  assert(step, "implied probeMedia should include Mac host media aggregate step");
  assert(step.details?.resource?.available === false, "implied resource sampling should preserve unavailable resource details");
  assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "resource-sample implied media readiness JSON");
  print("OK", "Mac host readiness probeMediaResourceSample implies probeMedia");
}

function checkProbeMediaBoardSummary(args) {
  const result = run([
    "--boardSummary",
    "--probeMedia",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "5000",
    "--skipCurrentBuildCheck",
  ], args);
  assert(result.status !== 0, "offline --probeMedia boardSummary should fail readiness");
  const lines = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
  assert(lines.length === 1, `offline --probeMedia boardSummary should print one line, got ${lines.length}`);
  assert(lines[0].includes("blockers=mac-host-media-aggregate"), "offline --probeMedia boardSummary should name media aggregate blocker");
  assert(lines[0].includes("warnings=mac-host-discovery"), "offline --probeMedia boardSummary should name discovery warning");
  assert(lines[0].includes("media=failed("), "offline --probeMedia boardSummary should include failed media status");
  assert(lines[0].includes("MacHostSafeStart="), "offline --probeMedia boardSummary should include safe start guidance");
  assert(lines[0].includes("--host 0.0.0.0"), "offline --probeMedia boardSummary should keep safe start bind host");
  assert(lines[0].includes("MacHostStop="), "offline --probeMedia boardSummary should include stop guidance");
  assert(lines[0].includes("--stop"), "offline --probeMedia boardSummary should make stop action explicit");
  assert(lines[0].includes("MacMaxFpsSafeStart="), "offline --probeMedia boardSummary should include foreground 60Hz safe start guidance");
  assert(lines[0].includes("--maxScreenFps 60"), "offline --probeMedia boardSummary should include foreground 60Hz safe start target");
  assert(lines[0].includes("MacLaunchAgentPlan="), "offline --probeMedia boardSummary should include LaunchAgent planner guidance");
  assert(lines[0].includes("MacMaxFpsPlan="), "offline --probeMedia boardSummary should include max-FPS planner guidance");
  assert(lines[0].includes("MacUnattendedFormal="), "offline --probeMedia boardSummary should include unattended formal guidance");
  assert(lines[0].includes("MacFormalLocalSmoke="), "offline --probeMedia boardSummary should include formal local smoke guidance");
  assert(lines[0].includes("MacPowerPlan="), "offline --probeMedia boardSummary should include Mac power dry-run plan guidance");
  assert(lines[0].includes("MacPowerPlan=node scripts/mac/plan-mac-power-settings.mjs"), "offline --probeMedia boardSummary should include the Mac power dry-run plan command");
  assert(lines[0].includes("MacScriptHelp="), "offline --probeMedia boardSummary should include Mac script help safety guidance");
  assert(lines[0].includes("MacScriptHelp=node scripts/mac/test-mac-script-help.mjs"), "offline --probeMedia boardSummary should include the Mac script help command");
  assert(lines[0].includes("MacRemoteAudioPlan="), "offline --probeMedia boardSummary should include Mac remote audio plan guidance");
  assert(lines[0].includes("MacRemoteAudioPlan=node scripts/mac/plan-mac-remote-audio.mjs --boardSummary"), "offline --probeMedia boardSummary should include the Mac remote audio plan command");
  assert(lines[0].includes("MacInputSafetyPlan="), "offline --probeMedia boardSummary should include Mac input safety plan guidance");
  assert(lines[0].includes("MacInputSafetyPlan=node scripts/mac/plan-mac-input-safety.mjs --boardSummary"), "offline --probeMedia boardSummary should include the Mac input safety plan command");
  assert(lines[0].includes("--requireLaunchAgentMaxFps"), "offline --probeMedia boardSummary should include formal max-FPS gate");
  assert(lines[0].includes("--maxScreenFps 60"), "offline --probeMedia boardSummary should include 60Hz planner command");
  assert(!lines[0].includes("media=passed"), "offline --probeMedia boardSummary should not use legacy passed wording");
  assert(lines[0].includes("Do not send passwords"), "offline --probeMedia boardSummary should keep password safety note");
  assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "offline probeMedia boardSummary");
  print("OK", "Mac host readiness boardSummary includes probeMedia status safely");
}

async function checkActiveBoardCall(args) {
  const call = {
    status: "CALLING",
    goal: "继续正式端到端验收 Mac host",
    from: "Windows Codex",
    need: "Mac Codex",
    connection: "192.168.31.122:43770",
    command: "node scripts/windows/probe-mac-host.mjs --token super-secret-command-token",
  };
  await withFakeBoard(call, async (server) => {
    const result = run([
      "--json",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "5000",
      "--skipCurrentBuildCheck",
    ], args);
    const payload = parseJson(result.stdout, "active board readiness JSON");
    assert(payload.board?.checked === true, "active board JSON should mark board checked");
    assert(payload.board?.ok === true, "active board JSON should mark board ok");
    assert(payload.board?.activeCall === true, "active board JSON should detect active call");
    assert(payload.board?.currentCall?.goal === call.goal, "active board JSON should keep call goal");
    assert(payload.board?.currentCall?.command === call.command, "active board JSON should keep command for automation");
    assert(String(payload.boardSummary || "").includes("call=active"), "boardSummary should mention active call");
    assert(String(payload.boardSummary || "").includes("warnings="), "active boardSummary should include warning ids");
    assert(String(payload.boardSummary || "").includes("agent-link-board-currentcall"), "active boardSummary should name board currentCall warning");
    assert(String(payload.boardSummary || "").includes("MacHostSafeStart="), "boardSummary should include safe start guidance");
    assert(String(payload.boardSummary || "").includes("MacHostStop="), "boardSummary should include stop guidance");
    assert(String(payload.boardSummary || "").includes("MacMaxFpsSafeStart="), "boardSummary should include foreground 60Hz safe start guidance");
    assert(String(payload.boardSummary || "").includes("MacLaunchAgentPlan="), "boardSummary should include LaunchAgent planner guidance");
    assert(String(payload.boardSummary || "").includes("MacMaxFpsPlan="), "boardSummary should include max-FPS planner guidance");
    assert(String(payload.boardSummary || "").includes("MacUnattendedFormal="), "boardSummary should include unattended formal guidance");
    assert(String(payload.boardSummary || "").includes("MacFormalLocalSmoke="), "boardSummary should include formal local smoke guidance");
    assert(String(payload.boardSummary || "").includes("MacPowerPlan="), "boardSummary should include Mac power dry-run plan guidance");
    assert(String(payload.boardSummary || "").includes("MacPowerPlan=node scripts/mac/plan-mac-power-settings.mjs"), "boardSummary should include the Mac power dry-run plan command");
    assert(String(payload.boardSummary || "").includes("MacScriptHelp="), "boardSummary should include Mac script help safety guidance");
    assert(String(payload.boardSummary || "").includes("MacScriptHelp=node scripts/mac/test-mac-script-help.mjs"), "boardSummary should include the Mac script help command");
    assert(String(payload.boardSummary || "").includes("MacRemoteAudioPlan="), "boardSummary should include Mac remote audio plan guidance");
    assert(String(payload.boardSummary || "").includes("MacRemoteAudioPlan=node scripts/mac/plan-mac-remote-audio.mjs --boardSummary"), "boardSummary should include the Mac remote audio plan command");
    assert(String(payload.boardSummary || "").includes("MacInputSafetyPlan="), "boardSummary should include Mac input safety plan guidance");
    assert(String(payload.boardSummary || "").includes("MacInputSafetyPlan=node scripts/mac/plan-mac-input-safety.mjs --boardSummary"), "boardSummary should include the Mac input safety plan command");
    assert(String(payload.boardSummary || "").includes(call.goal), "boardSummary should include call goal");
    assert(!String(payload.boardSummary || "").includes("super-secret-command-token"), "boardSummary should not echo command");
    assert(payload.results.some((item) => item.label === "Agent Link Board currentCall" && item.warnings.some((warning) => warning.includes("active call"))), "active call should create readiness warning");
    assertNoSecretLikeText(payload.boardSummary, "active board summary");
  });
  print("OK", "Mac host readiness surfaces active Agent Link Board currentCall safely");
}

async function checkDoneBoardCall(args) {
  const call = {
    status: "DONE",
    goal: "历史安全注入验收",
    from: "Windows Codex",
    need: "Mac Codex",
    connection: "192.168.31.122:43770",
    command: "completed super-secret-command-token",
  };
  await withFakeBoard(call, async (server) => {
    const result = run([
      "--json",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "5000",
      "--skipCurrentBuildCheck",
    ], args);
    const payload = parseJson(result.stdout, "done board readiness JSON");
    assert(payload.board?.activeCall === false, "DONE board call should not be active");
    assert(String(payload.boardSummary || "").includes("call=done"), "boardSummary should mark done call");
    const boardStep = payload.results.find((item) => item.label === "Agent Link Board currentCall");
    assert(boardStep && boardStep.warnings.length === 0, "DONE call should not create active-call warning");
    assertNoSecretLikeText(payload.boardSummary, "done board summary");
  });
  print("OK", "Mac host readiness treats DONE Agent Link Board currentCall as inactive");
}

async function checkBoardMacHostAuthPath(args) {
  const cleanAuthPath = "Mac unattended status: host=online inputMode=log build=bed2095; MacHostAuthPath=prompt-password-required reason=launch-agent-ephemeral-password mode=ephemeral next=MacHostStop->MacMaxFpsSafeStart->MacHostMedia; attention=1 warning(s) blockers=none warnings=accessibility.";
  await withFakeBoard(null, async (server) => {
    const result = run([
      "--json",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "5000",
      "--skipCurrentBuildCheck",
    ], args);
    const payload = parseJson(result.stdout, "Mac host readiness auth path JSON");
    assertMacHostAuthPath(payload, {
      status: "prompt-password-required",
      reason: "launch-agent-ephemeral-password",
      mode: "ephemeral",
      next: "MacHostStop->MacMaxFpsSafeStart->MacHostMedia",
    }, "Mac host readiness auth path JSON");
    assert(String(payload.boardSummary || "").includes("MacHostAuthPath=prompt-password-required reason=launch-agent-ephemeral-password mode=ephemeral next=MacHostStop->MacMaxFpsSafeStart->MacHostMedia"), "boardSummary should expose MacHostAuthPath");
    assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "Mac host readiness auth path JSON");
  }, {
    statuses: {
      "Mac Unattended": {
        status: "warning",
        note: cleanAuthPath,
      },
    },
  });

  const riskyAuthPath = "MacHostAuthPath=prompt-password-required reason=--password mode=ephemeral next=MacHostStop->MacMaxFpsSafeStart->MacHostMedia; token=super-secret-command-token";
  await withFakeBoard(null, async (server) => {
    const result = run([
      "--json",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "5000",
      "--skipCurrentBuildCheck",
    ], args);
    const payload = parseJson(result.stdout, "risky Mac host readiness auth path JSON");
    assert(!payload.board?.macHostAuthPath, "risky MacHostAuthPath should not be promoted");
    assert(!String(payload.boardSummary || "").includes("MacHostAuthPath="), "risky boardSummary should not expose MacHostAuthPath");
    assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "risky Mac host readiness auth path JSON");
  }, {
    statuses: {
      "Mac Unattended": {
        status: "warning",
        note: riskyAuthPath,
      },
    },
  });
  print("OK", "Mac host readiness surfaces Agent Link Board MacHostAuthPath safely");
}

async function checkBoardSummary(args) {
  const call = {
    status: "CALLING",
    goal: "Mac host readiness fake board summary",
    from: "Windows Codex",
    need: "Mac Codex",
    command: "super-secret-command-token",
  };
  await withFakeBoard(call, async (server) => {
    const result = run([
      "--boardSummary",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "5000",
      "--skipCurrentBuildCheck",
    ], args);
    assert(result.status === 0 || result.status === 1, "boardSummary should exit normally");
    const lines = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
    assert(lines.length === 1, `boardSummary should print one line, got ${lines.length}`);
    assert(lines[0].includes("Mac host readiness:"), "boardSummary should identify readiness");
    assert(lines[0].includes("blockers="), "boardSummary should include blocker ids");
    assert(lines[0].includes("warnings="), "boardSummary should include warning ids");
    assert(lines[0].includes("call=active"), "boardSummary should mention active call");
    assert(lines[0].includes("MacHostSafeStart="), "boardSummary should include safe start guidance");
    assert(lines[0].includes("MacHostStop="), "boardSummary should include stop guidance");
    assert(lines[0].includes("MacMaxFpsSafeStart="), "boardSummary should include foreground 60Hz safe start guidance");
    assert(lines[0].includes("MacLaunchAgentPlan="), "boardSummary should include LaunchAgent planner guidance");
    assert(lines[0].includes("MacMaxFpsPlan="), "boardSummary should include max-FPS planner guidance");
    assert(lines[0].includes("MacUnattendedFormal="), "boardSummary should include unattended formal guidance");
    assert(lines[0].includes("MacFormalLocalSmoke="), "boardSummary should include formal local smoke guidance");
    assert(lines[0].includes("MacScriptHelp="), "boardSummary should include Mac script help safety guidance");
    assert(lines[0].includes("MacScriptHelp=node scripts/mac/test-mac-script-help.mjs"), "boardSummary should include the Mac script help command");
    assert(lines[0].includes("MacRemoteAudioPlan="), "boardSummary should include Mac remote audio plan guidance");
    assert(lines[0].includes("MacRemoteAudioPlan=node scripts/mac/plan-mac-remote-audio.mjs --boardSummary"), "boardSummary should include the Mac remote audio plan command");
    assert(lines[0].includes("MacInputSafetyPlan="), "boardSummary should include Mac input safety plan guidance");
    assert(lines[0].includes("MacInputSafetyPlan=node scripts/mac/plan-mac-input-safety.mjs --boardSummary"), "boardSummary should include the Mac input safety plan command");
    assert(lines[0].includes(call.goal), "boardSummary should include call goal");
    assert(lines[0].includes("Do not send passwords"), "boardSummary should include password safety note");
    assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "readiness boardSummary");
  });
  print("OK", "Mac host readiness boardSummary is one-line and secret-free");
}

function checkPlainOutputIncludesLaunchAgentPlan(args) {
  const result = run([
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "5000",
    "--skipCurrentBuildCheck",
  ], args);
  assert(result.status === 0 || result.status === 1, "plain readiness output should exit normally");
  assert(String(result.stdout || "").includes("Mac host stop:"), "plain output should include stop label");
  assert(String(result.stdout || "").includes("Mac LaunchAgent dry-run plan:"), "plain output should include LaunchAgent planner label");
  assert(String(result.stdout || "").includes("Mac max FPS dry-run plan:"), "plain output should include max-FPS planner label");
  assert(String(result.stdout || "").includes("Mac 60Hz safe foreground start:"), "plain output should include foreground 60Hz safe start label");
  assert(String(result.stdout || "").includes("Mac unattended formal 60Hz gate:"), "plain output should include unattended formal label");
  assert(String(result.stdout || "").includes("Mac formal local smoke:"), "plain output should include formal local smoke label");
  assert(String(result.stdout || "").includes("Mac remote-only audio plan:"), "plain output should include remote audio plan label");
  assert(String(result.stdout || "").includes("Mac input safety plan:"), "plain output should include input safety plan label");
  assert(String(result.stdout || "").includes("Mac client manual checklist:"), "plain output should include Mac client manual checklist label");
  assert(String(result.stdout || "").includes("install-mac-host-launch-agent.mjs"), "plain output should include LaunchAgent planner command");
  assert(String(result.stdout || "").includes("--maxScreenFps 60"), "plain output should include max-FPS planner command");
  assert(String(result.stdout || "").includes("--requireLaunchAgentMaxFps"), "plain output should include unattended formal gate command");
  assert(String(result.stdout || "").includes("check-mac-formal-local-smoke.mjs"), "plain output should include formal local smoke command");
  assert(String(result.stdout || "").includes("plan-mac-remote-audio.mjs"), "plain output should include remote audio plan command");
  assert(String(result.stdout || "").includes("plan-mac-input-safety.mjs"), "plain output should include input safety plan command");
  const manualChecklistLine = String(result.stdout || "").split(/\r?\n/).find((line) => line.includes("Mac client manual checklist:")) || "";
  assertMacClientManualChecklistAction(manualChecklistLine, "plain output Mac client manual checklist");
  assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "plain readiness output");
  print("OK", "Mac host readiness plain output includes LaunchAgent planner guidance");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  checkDefaultDoesNotReadBoard(args);
  checkMediaBoardSummaryStatusFormatting();
  checkProbeMediaTuningCommandArgs();
  checkReadinessFindingsFormatting();
  checkReadinessNextStepFormatting();
  checkUsableEntryCallKeepsManualUxStandby();
  checkHostBuildBoardSummaryFormatting();
  checkStaleBuildSuggestedActionFormatting();
  checkDiscoveryBackgroundJpegFormatting();
  checkMaxScreenFpsWarningFormatting();
  checkProbeMediaOfflineJson(args);
  checkProbeMediaTuningOfflineJson(args);
  checkProbeMediaResourceSampleImpliesProbeMedia(args);
  checkProbeMediaBoardSummary(args);
  checkPlainOutputIncludesLaunchAgentPlan(args);
  await checkActiveBoardCall(args);
  await checkDoneBoardCall(args);
  await checkBoardMacHostAuthPath(args);
  await checkBoardSummary(args);
  print("OK", "Mac host readiness Agent Link Board self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
