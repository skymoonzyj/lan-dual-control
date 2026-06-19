#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/check-mac-unattended-status.mjs";

const defaults = {
  timeoutMs: 8000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-unattended-status.mjs [options]

Verifies check-mac-unattended-status help, JSON, board-summary, strict failure,
and LaunchAgent plist parsing paths. It only targets loopback/offline test ports.

Options:
  --timeoutMs <ms>    Command timeout. Default: ${defaults.timeoutMs}
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
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 1000, 60000, defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
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

function runWithEnv(args, extraArgs = [], env = {}) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      ...env,
    },
  });
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
        reject(new Error(`fake host exited early\n${getStdout()}\n${getStderr()}`));
        return;
      }
      if (Date.now() - started > 5000) {
        clearInterval(timer);
        reject(new Error(`fake host did not start\n${getStdout()}\n${getStderr()}`));
      }
    }, 25);
  });
}

async function withFakeHost(discovery, callback) {
  const dir = mkdtempSync(path.join(tmpdir(), "lan-dual-unattended-host-"));
  const scriptPath = path.join(dir, "fake-host.mjs");
  writeFileSync(scriptPath, `
import http from "node:http";
const discovery = ${JSON.stringify(discovery)};
const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/discovery") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(discovery));
    return;
  }
  response.writeHead(404, { "Content-Type": "text/plain" });
  response.end("not found");
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
    await callback(port);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      child.once("exit", resolve);
      setTimeout(resolve, 1000);
    });
    rmSync(dir, { recursive: true, force: true });
  }
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

function assertIncludes(text, needle, label) {
  assert(String(text || "").includes(needle), `${label} should include ${needle}`);
}

function assertNotIncludes(text, needle, label) {
  assert(!String(text || "").includes(needle), `${label} should not include ${needle}`);
}

function assertNoSecretOrInputGuidance(text, label) {
  const value = String(text || "");
  assertNotIncludes(value, "super-secret-unattended-password", label);
  assertNotIncludes(value, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(value, "--password", label);
  assertNotIncludes(value, "input_event", label);
  assertNotIncludes(value, "--inputMode inject", label);
  assertNotIncludes(value, "--injectInput", label);
}

function makeFakeCodexLink(tmp) {
  const scriptPath = path.join(tmp, "fake-codex-link.mjs");
  const logPath = path.join(tmp, "codex-link-calls.jsonl");
  writeFileSync(scriptPath, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)) + "\\n");
console.log("ok");
`, "utf8");
  return { scriptPath, logPath };
}

function readJsonl(logPath) {
  return readFileSync(logPath, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function assertUnattendedHealth(payload, expected, label) {
  const health = payload.macUnattendedHealth;
  assert(health && typeof health === "object", `${label} should include macUnattendedHealth`);
  for (const [key, value] of Object.entries(expected)) {
    assert(
      health[key] === value,
      `${label} macUnattendedHealth.${key} expected ${value}, got ${health[key]}`,
    );
  }
}

function assertPowerHealth(payload, expected, label) {
  const health = payload.macPowerHealth;
  assert(health && typeof health === "object", `${label} should include macPowerHealth`);
  for (const [key, value] of Object.entries(expected)) {
    assert(
      health[key] === value,
      `${label} macPowerHealth.${key} expected ${value}, got ${health[key]}`,
    );
  }
}

function assertMacClientBrowserSelfTestCommand(command, label) {
  const text = String(command || "");
  assertIncludes(text, "node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs", label);
  assertIncludes(text, "--boardSummary", label);
  assertNotIncludes(text, "--promptPassword", label);
  assertNotIncludes(text, "--password", label);
  assertNotIncludes(text, "--useEnvPassword", label);
  assertNotIncludes(text, "--sendCall", label);
  assertNotIncludes(text, "--forceCall", label);
  assertNotIncludes(text, "--server", label);
  assertNotIncludes(text, "input_event", label);
  assertNotIncludes(text, "inject", label);
}

function assertMacUnattendedSendStatusCommand(command, label) {
  const text = String(command || "");
  assertIncludes(text, "node scripts/mac/check-mac-unattended-status.mjs", label);
  assertIncludes(text, "--host", label);
  assertIncludes(text, "--port", label);
  assertIncludes(text, "--server http://192.168.31.68:17888", label);
  assertIncludes(text, "--sendStatus", label);
  assertIncludes(text, "--boardSummary", label);
  assertNotIncludes(text, "--promptPassword", label);
  assertNotIncludes(text, "--password", label);
  assertNotIncludes(text, "--sendCall", label);
  assertNotIncludes(text, "--json", label);
  assertNotIncludes(text, "input_event", label);
  assertNotIncludes(text, "inject", label);
}

function assertMacPowerPlanCommand(command, label) {
  const text = String(command || "");
  assertIncludes(text, "node scripts/mac/plan-mac-power-settings.mjs", label);
  assertIncludes(text, "--profile all", label);
  assertIncludes(text, "--sleep 0", label);
  assertIncludes(text, "--displaySleep 0", label);
  assertIncludes(text, "--networkWake on", label);
  assertIncludes(text, "--boardSummary", label);
  assertNotIncludes(text, "--promptPassword", label);
  assertNotIncludes(text, "--password", label);
  assertNotIncludes(text, "--apply", label);
  assertNotIncludes(text, "sudo", label);
  assertNotIncludes(text, "input_event", label);
  assertNotIncludes(text, "inject", label);
}

function assertMacRemoteAudioPlanCommand(command, label) {
  const text = String(command || "");
  assertIncludes(text, "node scripts/mac/plan-mac-remote-audio.mjs", label);
  assertIncludes(text, "--boardSummary", label);
  assertNotIncludes(text, "--promptPassword", label);
  assertNotIncludes(text, "--password", label);
  assertNotIncludes(text, "--apply", label);
  assertNotIncludes(text, "sudo", label);
  assertNotIncludes(text, "--sendCall", label);
  assertNotIncludes(text, "--server", label);
  assertNotIncludes(text, "input_event", label);
  assertNotIncludes(text, "inject", label);
}

function gitLines(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 3000,
  });
  if (result.status !== 0) return [];
  return String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getComparableStaleMacHostBuildId() {
  const commits = gitLines([
    "log",
    "--format=%h",
    "--",
    "apps/mac-host/Package.swift",
    "apps/mac-host/Sources",
  ]);
  assert(commits.length >= 2, "test fixture needs at least two Mac host runtime commits");
  return commits[1];
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function baseOfflineArgs(launchAgentPath) {
  return [
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "800",
    "--launchAgentPath",
    launchAgentPath,
    "--skipLaunchctl",
    "--skipPmset",
  ];
}

function fakeLaunchAgentPlist({ label = "com.lan-dual-control.mac-host", maxScreenFps = 60, passwordMode = "ephemeral" } = {}) {
  const programArguments = [
    "/usr/bin/env",
    "node",
    "scripts/mac/start-mac-host.mjs",
    "--host",
    "0.0.0.0",
    "--port",
    "43770",
    "--requirePassword",
    "--inputMode",
    "log",
    "--videoMode",
    "h264",
  ];
  if (maxScreenFps !== null) {
    programArguments.push("--maxScreenFps", String(maxScreenFps));
  }
  if (passwordMode === "ephemeral") {
    programArguments.push("--ephemeralPassword");
  } else if (passwordMode === "prompt") {
    programArguments.push("--promptPassword");
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
${programArguments.map((item) => `    <string>${item}</string>`).join("\n")}
  </array>
</dict>
</plist>
`;
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run(args, [flag]);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assertIncludes(result.stdout, "Usage", `${script} ${flag}`);
    assertIncludes(result.stdout, "--requireLaunchAgent", `${script} ${flag}`);
    assertIncludes(result.stdout, "--requireLaunchAgentMaxFps", `${script} ${flag}`);
    assertIncludes(result.stdout, "--sendStatus", `${script} ${flag}`);
    assertIncludes(result.stdout, "Mac Unattended", `${script} ${flag}`);
    assertIncludes(result.stdout, "--skipLaunchctl", `${script} ${flag}`);
    assertIncludes(result.stdout, "host", `${script} ${flag}`);
    assertIncludes(result.stdout, "launchAgent", `${script} ${flag}`);
    assertIncludes(result.stdout, "power", `${script} ${flag}`);
    assertIncludes(result.stdout, "macHostAuthPath", `${script} ${flag}`);
    assertIncludes(result.stdout, "macUnattendedHealth", `${script} ${flag}`);
    assertIncludes(result.stdout, "macPowerHealth", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.launchAgentPlan", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macMaxFpsPlan", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macUnattendedStatus", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macUnattendedSendStatus", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macPowerPlan", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macRemoteAudioPlan", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macUnattendedFormal", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macHostSafeStart", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macMaxFpsSafeStart", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macHostStop", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macLaunchAgentLoad", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macLaunchAgentPrint", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macHostMedia", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macResumeStatus", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macFormalLocalSmoke", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macClientBrowserSelfTest", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macScriptHelp", `${script} ${flag}`);
    assertNoSecretOrInputGuidance(result.stdout, `${script} ${flag}`);
  }
  print("OK", "Unattended status help exits quickly and stays side-effect-free");
}

async function checkPowerHealthDetails(args) {
  if (process.platform !== "darwin") {
    print("SKIP", "Mac power health detail check requires macOS pmset semantics");
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), "lan-dual-unattended-power-"));
  try {
    const plist = path.join(dir, "com.lan-dual-control.mac-host.plist");
    writeFileSync(plist, fakeLaunchAgentPlist({ maxScreenFps: 60 }), "utf8");
    const bin = path.join(dir, "bin");
    const fakePmset = path.join(bin, "pmset");
    mkdirSync(bin, { recursive: true });
    writeFileSync(fakePmset, `#!/bin/sh
cat <<'PMSET'
Battery Power:
 sleep 0
 displaysleep 0
 womp 0
 tcpkeepalive 0
AC Power:
 sleep 1
 displaysleep 10
 womp 0
 tcpkeepalive 0
PMSET
`, "utf8");
    chmodSync(fakePmset, 0o755);

    await withFakeHost({
      deviceName: "Fake power-risk Mac",
      inputMode: "log",
      permissions: {
        screenRecording: true,
        accessibility: true,
        inputMonitoring: true,
      },
      runtime: {
        buildId: "fake-power-risk-build",
        processId: 12345,
      },
      capabilities: {
        h264Stream: true,
        capturePipeline: "screencapturekit-h264",
        audioMode: "system-pcm",
      },
    }, async (port) => {
      const result = runWithEnv(args, [
        "--json",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--timeoutMs",
        "1200",
        "--launchAgentPath",
        plist,
        "--skipLaunchctl",
      ], {
        PATH: `${bin}:${process.env.PATH || ""}`,
      });
      const payload = parseJson(result.stdout, "power health details JSON");
      assert(result.status === 0, `power risks should stay warning-only by default\n${result.stdout}\n${result.stderr}`);
      assert(Array.isArray(payload.power?.risks), "power payload should expose stable risk objects");
      assert(
        payload.power.risks.map((item) => item.id).join(",") === "system-sleep-enabled,display-sleep-enabled,network-wake-disabled",
        `power risks should preserve stable ids, got ${JSON.stringify(payload.power.risks)}`,
      );
      assert(payload.findings.filter((item) => item.id === "power").length === 1, "detailed power risks should collapse to one compatibility finding");
      assertPowerHealth(payload, {
        status: "warning",
        reason: "system-sleep-enabled",
        warnings: "system-sleep-enabled,display-sleep-enabled,network-wake-disabled",
      }, "power health details JSON");
      assertUnattendedHealth(payload, {
        status: "warning",
        reason: "power",
        blockers: "none",
        warnings: "power",
      }, "power health details JSON");
      assertIncludes(payload.boardSummary, "MacPowerHealth=warning", "power health board summary");
      assertIncludes(payload.boardSummary, "reason=system-sleep-enabled", "power health board summary");
      assertIncludes(payload.boardSummary, "warnings=system-sleep-enabled,display-sleep-enabled,network-wake-disabled", "power health board summary");
      assertIncludes(payload.boardSummary, "warnings=power", "power health compatibility board summary");
      assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "power health details JSON");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  print("OK", "Mac power risks expose stable detailed health tags");
}

function checkMissingLaunchAgentJson(args) {
  const missingPath = path.join(tmpdir(), `missing-lan-dual-agent-${Date.now()}.plist`);
  const result = run(args, [
    "--json",
    ...baseOfflineArgs(missingPath),
  ]);
  const payload = parseJson(result.stdout, "missing LaunchAgent JSON");
  assert(result.status === 0, "missing LaunchAgent should stay non-failing by default");
  assert(payload.ok === true, "missing LaunchAgent default payload should report ok=true");
  assert(payload.host?.online === false, "missing LaunchAgent payload should keep host offline");
  assert(payload.launchAgent?.exists === false, "missing LaunchAgent payload should mark plist missing");
  assert(payload.launchAgent?.launchctl?.checked === false, "missing LaunchAgent payload should skip launchctl");
  assert(payload.power?.checked === false, "missing LaunchAgent payload should skip pmset");
  assert(Array.isArray(payload.findings), "missing LaunchAgent payload should include findings");
  assert(payload.findings.some((item) => item.id === "launch-agent-missing" && item.level === "warning"), "missing LaunchAgent should be a warning by default");
  assertUnattendedHealth(payload, {
    status: "warning",
    reason: "host-offline",
    blockers: "none",
    warnings: "host-offline,launch-agent-missing",
  }, "missing LaunchAgent JSON");
  assertIncludes(payload.commands?.macUnattendedStatus || "", "check-mac-unattended-status.mjs", "missing LaunchAgent commands.macUnattendedStatus");
  assertIncludes(payload.commands?.macUnattendedStatus || "", "--host 127.0.0.1", "missing LaunchAgent commands.macUnattendedStatus");
  assertIncludes(payload.commands?.macUnattendedStatus || "", "--port 9", "missing LaunchAgent commands.macUnattendedStatus");
  assertIncludes(payload.commands?.macUnattendedStatus || "", "--timeoutMs 800", "missing LaunchAgent commands.macUnattendedStatus");
  assertIncludes(payload.commands?.macUnattendedStatus || "", "--launchAgentPath", "missing LaunchAgent commands.macUnattendedStatus");
  assertIncludes(payload.commands?.macUnattendedStatus || "", missingPath, "missing LaunchAgent commands.macUnattendedStatus");
  assertIncludes(payload.commands?.macUnattendedStatus || "", "--skipLaunchctl", "missing LaunchAgent commands.macUnattendedStatus");
  assertIncludes(payload.commands?.macUnattendedStatus || "", "--skipPmset", "missing LaunchAgent commands.macUnattendedStatus");
  assertIncludes(payload.commands?.macUnattendedStatus || "", "--boardSummary", "missing LaunchAgent commands.macUnattendedStatus");
  assertNotIncludes(payload.commands?.macUnattendedStatus || "", "--json", "missing LaunchAgent commands.macUnattendedStatus");
  assertMacUnattendedSendStatusCommand(payload.commands?.macUnattendedSendStatus || "", "missing LaunchAgent commands.macUnattendedSendStatus");
  assertIncludes(payload.commands?.macUnattendedSendStatus || "", "--host 127.0.0.1", "missing LaunchAgent commands.macUnattendedSendStatus");
  assertIncludes(payload.commands?.macUnattendedSendStatus || "", "--port 9", "missing LaunchAgent commands.macUnattendedSendStatus");
  assertIncludes(payload.commands?.macUnattendedSendStatus || "", "--launchAgentPath", "missing LaunchAgent commands.macUnattendedSendStatus");
  assertIncludes(payload.commands?.macUnattendedSendStatus || "", missingPath, "missing LaunchAgent commands.macUnattendedSendStatus");
  assertIncludes(payload.commands?.macUnattendedSendStatus || "", "--skipLaunchctl", "missing LaunchAgent commands.macUnattendedSendStatus");
  assertIncludes(payload.commands?.macUnattendedSendStatus || "", "--skipPmset", "missing LaunchAgent commands.macUnattendedSendStatus");
  assertMacPowerPlanCommand(payload.commands?.macPowerPlan || "", "missing LaunchAgent commands.macPowerPlan");
  assertMacRemoteAudioPlanCommand(payload.commands?.macRemoteAudioPlan || "", "missing LaunchAgent commands.macRemoteAudioPlan");
  assertIncludes(payload.commands?.macUnattendedFormal || "", "check-mac-unattended-status.mjs", "missing LaunchAgent commands.macUnattendedFormal");
  assertIncludes(payload.commands?.macUnattendedFormal || "", "--host 127.0.0.1", "missing LaunchAgent commands.macUnattendedFormal");
  assertIncludes(payload.commands?.macUnattendedFormal || "", "--port 9", "missing LaunchAgent commands.macUnattendedFormal");
  assertIncludes(payload.commands?.macUnattendedFormal || "", "--launchAgentPath", "missing LaunchAgent commands.macUnattendedFormal");
  assertIncludes(payload.commands?.macUnattendedFormal || "", missingPath, "missing LaunchAgent commands.macUnattendedFormal");
  assertIncludes(payload.commands?.macUnattendedFormal || "", "--requireLaunchAgentMaxFps", "missing LaunchAgent commands.macUnattendedFormal");
  assertIncludes(payload.commands?.macUnattendedFormal || "", "--requireLaunchAgentLoaded", "missing LaunchAgent commands.macUnattendedFormal");
  assertIncludes(payload.commands?.macUnattendedFormal || "", "--boardSummary", "missing LaunchAgent commands.macUnattendedFormal");
  assertNotIncludes(payload.commands?.macUnattendedFormal || "", "--json", "missing LaunchAgent commands.macUnattendedFormal");
  assertIncludes(payload.commands?.launchAgentPlan || "", "install-mac-host-launch-agent.mjs", "missing LaunchAgent commands.launchAgentPlan");
  assertIncludes(payload.commands?.launchAgentPlan || "", "--port 9", "missing LaunchAgent commands.launchAgentPlan");
  assertIncludes(payload.commands?.launchAgentPlan || "", "--boardSummary", "missing LaunchAgent commands.launchAgentPlan");
  assertIncludes(payload.commands?.macMaxFpsPlan || "", "--port 9", "missing LaunchAgent commands.macMaxFpsPlan");
  assertIncludes(payload.commands?.macMaxFpsPlan || "", "--maxScreenFps 60", "missing LaunchAgent commands.macMaxFpsPlan");
  assertIncludes(payload.commands?.macHostSafeStart || "", "start-mac-host.mjs", "missing LaunchAgent commands.macHostSafeStart");
  assertIncludes(payload.commands?.macHostSafeStart || "", "--promptPassword", "missing LaunchAgent commands.macHostSafeStart");
  assertIncludes(payload.commands?.macHostSafeStart || "", "--requirePassword", "missing LaunchAgent commands.macHostSafeStart");
  assertIncludes(payload.commands?.macHostSafeStart || "", "--host 0.0.0.0", "missing LaunchAgent commands.macHostSafeStart");
  assertIncludes(payload.commands?.macHostSafeStart || "", "--port 9", "missing LaunchAgent commands.macHostSafeStart");
  assertIncludes(payload.commands?.macMaxFpsSafeStart || "", "start-mac-host.mjs", "missing LaunchAgent commands.macMaxFpsSafeStart");
  assertIncludes(payload.commands?.macMaxFpsSafeStart || "", "--promptPassword", "missing LaunchAgent commands.macMaxFpsSafeStart");
  assertIncludes(payload.commands?.macMaxFpsSafeStart || "", "--requirePassword", "missing LaunchAgent commands.macMaxFpsSafeStart");
  assertIncludes(payload.commands?.macMaxFpsSafeStart || "", "--host 0.0.0.0", "missing LaunchAgent commands.macMaxFpsSafeStart");
  assertIncludes(payload.commands?.macMaxFpsSafeStart || "", "--port 9", "missing LaunchAgent commands.macMaxFpsSafeStart");
  assertIncludes(payload.commands?.macMaxFpsSafeStart || "", "--maxScreenFps 60", "missing LaunchAgent commands.macMaxFpsSafeStart");
  assertIncludes(payload.commands?.macHostStop || "", "start-mac-host.mjs", "missing LaunchAgent commands.macHostStop");
  assertIncludes(payload.commands?.macHostStop || "", "--stop", "missing LaunchAgent commands.macHostStop");
  assertIncludes(payload.commands?.macHostStop || "", "--host 127.0.0.1", "missing LaunchAgent commands.macHostStop");
  assertIncludes(payload.commands?.macHostStop || "", "--port 9", "missing LaunchAgent commands.macHostStop");
  assertNotIncludes(payload.commands?.macHostStop || "", "--promptPassword", "missing LaunchAgent commands.macHostStop");
  assertNotIncludes(payload.commands?.macHostStop || "", "--password", "missing LaunchAgent commands.macHostStop");
  assertNotIncludes(payload.commands?.macHostStop || "", "inject", "missing LaunchAgent commands.macHostStop");
  assertIncludes(payload.commands?.macLaunchAgentLoad || "", "launchctl bootstrap", "missing LaunchAgent commands.macLaunchAgentLoad");
  assertIncludes(payload.commands?.macLaunchAgentLoad || "", missingPath, "missing LaunchAgent commands.macLaunchAgentLoad");
  assertIncludes(payload.commands?.macLaunchAgentPrint || "", "launchctl print", "missing LaunchAgent commands.macLaunchAgentPrint");
  assertIncludes(payload.commands?.macLaunchAgentPrint || "", "com.lan-dual-control.mac-host", "missing LaunchAgent commands.macLaunchAgentPrint");
  assertIncludes(payload.commands?.macHostReadiness || "", "check-mac-host-readiness.mjs", "missing LaunchAgent commands.macHostReadiness");
  assertIncludes(payload.commands?.macHostReadiness || "", "--host 127.0.0.1", "missing LaunchAgent commands.macHostReadiness");
  assertIncludes(payload.commands?.macHostReadiness || "", "--port 9", "missing LaunchAgent commands.macHostReadiness");
  assertIncludes(payload.commands?.macHostReadiness || "", "--checkBoard", "missing LaunchAgent commands.macHostReadiness");
  assertIncludes(payload.commands?.macHostReadiness || "", "--boardSummary", "missing LaunchAgent commands.macHostReadiness");
  assertNotIncludes(payload.commands?.macHostReadiness || "", "--promptPassword", "missing LaunchAgent commands.macHostReadiness");
  assertNotIncludes(payload.commands?.macHostReadiness || "", "--password", "missing LaunchAgent commands.macHostReadiness");
  assertNotIncludes(payload.commands?.macHostReadiness || "", "inject", "missing LaunchAgent commands.macHostReadiness");
  assertIncludes(payload.commands?.hostReadiness || "", payload.commands?.macHostReadiness || "missing-command", "missing LaunchAgent commands.hostReadiness alias");
  assertIncludes(payload.commands?.macHostMedia || "", "check-mac-host-readiness.mjs", "missing LaunchAgent commands.macHostMedia");
  assertIncludes(payload.commands?.macHostMedia || "", "--host 127.0.0.1", "missing LaunchAgent commands.macHostMedia");
  assertIncludes(payload.commands?.macHostMedia || "", "--port 9", "missing LaunchAgent commands.macHostMedia");
  assertIncludes(payload.commands?.macHostMedia || "", "--checkBoard", "missing LaunchAgent commands.macHostMedia");
  assertIncludes(payload.commands?.macHostMedia || "", "--probeMedia", "missing LaunchAgent commands.macHostMedia");
  assertIncludes(payload.commands?.macHostMedia || "", "--probeMediaResourceSample", "missing LaunchAgent commands.macHostMedia");
  assertIncludes(payload.commands?.macHostMedia || "", "--promptPassword", "missing LaunchAgent commands.macHostMedia");
  assertIncludes(payload.commands?.macHostMedia || "", "--boardSummary", "missing LaunchAgent commands.macHostMedia");
  assertNotIncludes(payload.commands?.macHostMedia || "", "--password", "missing LaunchAgent commands.macHostMedia");
  assertNotIncludes(payload.commands?.macHostMedia || "", "input_event", "missing LaunchAgent commands.macHostMedia");
  assertNotIncludes(payload.commands?.macHostMedia || "", "inject", "missing LaunchAgent commands.macHostMedia");
  assertIncludes(payload.commands?.macResumeStatus || "", "check-mac-resume-status.mjs", "missing LaunchAgent commands.macResumeStatus");
  assertIncludes(payload.commands?.macResumeStatus || "", "--host 127.0.0.1", "missing LaunchAgent commands.macResumeStatus");
  assertIncludes(payload.commands?.macResumeStatus || "", "--port 9", "missing LaunchAgent commands.macResumeStatus");
  assertIncludes(payload.commands?.macResumeStatus || "", "--checkBoard", "missing LaunchAgent commands.macResumeStatus");
  assertIncludes(payload.commands?.macResumeStatus || "", "--boardSummary", "missing LaunchAgent commands.macResumeStatus");
  assertNotIncludes(payload.commands?.macResumeStatus || "", "--promptPassword", "missing LaunchAgent commands.macResumeStatus");
  assertNotIncludes(payload.commands?.macResumeStatus || "", "--password", "missing LaunchAgent commands.macResumeStatus");
  assertNotIncludes(payload.commands?.macResumeStatus || "", "input_event", "missing LaunchAgent commands.macResumeStatus");
  assertNotIncludes(payload.commands?.macResumeStatus || "", "inject", "missing LaunchAgent commands.macResumeStatus");
  assertIncludes(payload.commands?.macFormalLocalSmoke || "", "check-mac-formal-local-smoke.mjs", "missing LaunchAgent commands.macFormalLocalSmoke");
  assertIncludes(payload.commands?.macFormalLocalSmoke || "", "--host 127.0.0.1", "missing LaunchAgent commands.macFormalLocalSmoke");
  assertIncludes(payload.commands?.macFormalLocalSmoke || "", "--port 9", "missing LaunchAgent commands.macFormalLocalSmoke");
  assertIncludes(payload.commands?.macFormalLocalSmoke || "", "--promptPassword", "missing LaunchAgent commands.macFormalLocalSmoke");
  assertIncludes(payload.commands?.macFormalLocalSmoke || "", "--boardSummary", "missing LaunchAgent commands.macFormalLocalSmoke");
  assertNotIncludes(payload.commands?.macFormalLocalSmoke || "", "--json", "missing LaunchAgent commands.macFormalLocalSmoke");
  assertNotIncludes(payload.commands?.macFormalLocalSmoke || "", "--sendCall", "missing LaunchAgent commands.macFormalLocalSmoke");
  assertNotIncludes(payload.commands?.macFormalLocalSmoke || "", "--password", "missing LaunchAgent commands.macFormalLocalSmoke");
  assertIncludes(payload.commands?.macScriptHelp || "", "test-mac-script-help.mjs", "missing LaunchAgent commands.macScriptHelp");
  assertIncludes(payload.commands?.macScriptHelp || "", "--timeoutMs 10000", "missing LaunchAgent commands.macScriptHelp");
  assertIncludes(payload.commands?.macScriptHelp || "", "--boardSummary", "missing LaunchAgent commands.macScriptHelp");
  assertNotIncludes(payload.commands?.macScriptHelp || "", "--promptPassword", "missing LaunchAgent commands.macScriptHelp");
  assertNotIncludes(payload.commands?.macScriptHelp || "", "--password", "missing LaunchAgent commands.macScriptHelp");
  assertNotIncludes(payload.commands?.macScriptHelp || "", "--sendCall", "missing LaunchAgent commands.macScriptHelp");
  assertNotIncludes(payload.commands?.macScriptHelp || "", "input_event", "missing LaunchAgent commands.macScriptHelp");
  assertNotIncludes(payload.commands?.macScriptHelp || "", "inject", "missing LaunchAgent commands.macScriptHelp");
  assertMacClientBrowserSelfTestCommand(
    payload.commands?.macClientBrowserSelfTest || "",
    "missing LaunchAgent commands.macClientBrowserSelfTest",
  );
  assertIncludes(payload.boardSummary, "MacUnattendedStatus=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacUnattendedSendStatus=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacPowerPlan=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacPowerPlan=node scripts/mac/plan-mac-power-settings.mjs", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacRemoteAudioPlan=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacRemoteAudioPlan=node scripts/mac/plan-mac-remote-audio.mjs", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "--networkWake on", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "--sendStatus", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacHostSafeStart=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacHostSafeStart=node scripts/mac/start-mac-host.mjs", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacMaxFpsSafeStart=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacMaxFpsSafeStart=node scripts/mac/start-mac-host.mjs", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "--maxScreenFps 60", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "--promptPassword", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "--requirePassword", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacHostStop=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacHostStop=node scripts/mac/start-mac-host.mjs", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "--stop --host 127.0.0.1 --port 9", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacLaunchAgentLoad=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "launchctl bootstrap", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacLaunchAgentPrint=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "launchctl print", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "--launchAgentPath", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, missingPath, "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "--skipLaunchctl", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacLaunchAgentPlan=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacLaunchAgentPlan=node scripts/mac/install-mac-host-launch-agent.mjs", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "--port 9", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacMaxFpsPlan=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacUnattendedFormal=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "--requireLaunchAgentLoaded", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacHostReadiness=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacHostReadiness=node scripts/mac/check-mac-host-readiness.mjs", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "HostReadiness=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacHostMedia=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacHostMedia=node scripts/mac/check-mac-host-readiness.mjs", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "--probeMedia --probeMediaResourceSample --promptPassword", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacResumeStatus=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacResumeStatus=node scripts/mac/check-mac-resume-status.mjs", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacFormalLocalSmoke=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacFormalLocalSmoke=node scripts/mac/check-mac-formal-local-smoke.mjs", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacClientBrowserSelfTest=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacClientBrowserSelfTest=node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacScriptHelp=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacScriptHelp=node scripts/mac/test-mac-script-help.mjs", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "blockers=none", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "warnings=host-offline,launch-agent-missing", "missing LaunchAgent board summary");
  assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "missing LaunchAgent JSON");
  print("OK", "Missing LaunchAgent is reported as a warning in default JSON mode");
}

function checkRequireLaunchAgentFails(args) {
  const missingPath = path.join(tmpdir(), `missing-lan-dual-agent-required-${Date.now()}.plist`);
  const result = run(args, [
    "--json",
    ...baseOfflineArgs(missingPath),
    "--requireLaunchAgent",
  ]);
  const payload = parseJson(result.stdout, "require LaunchAgent JSON");
  assert(result.status !== 0, "requireLaunchAgent should fail when plist is missing");
  assert(payload.ok === false, "requireLaunchAgent payload should report ok=false");
  assert(payload.findings.some((item) => item.id === "launch-agent-missing" && item.level === "blocker"), "requireLaunchAgent should emit a blocker");
  assertIncludes(payload.boardSummary, "blockers=launch-agent-missing", "require LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "warnings=host-offline", "require LaunchAgent board summary");
  assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "require LaunchAgent JSON");
  print("OK", "requireLaunchAgent turns missing plist into a blocker");
}

function checkLaunchAgentPlannerPreservesOptions(args) {
  const missingPath = path.join(tmpdir(), `missing-lan-dual-agent-custom-${Date.now()}.plist`);
  const label = "com.lan-dual-control.mac-host.custom";
  const result = run(args, [
    "--json",
    ...baseOfflineArgs(missingPath),
    "--label",
    label,
  ]);
  const payload = parseJson(result.stdout, "custom LaunchAgent planner JSON");
  assert(result.status === 0, "custom LaunchAgent planner path should stay non-failing");
  assertIncludes(payload.commands?.launchAgentPlan || "", "--port 9", "custom LaunchAgent commands.launchAgentPlan");
  assertIncludes(payload.commands?.launchAgentPlan || "", `--label ${label}`, "custom LaunchAgent commands.launchAgentPlan");
  assertIncludes(payload.commands?.launchAgentPlan || "", missingPath, "custom LaunchAgent commands.launchAgentPlan");
  assertIncludes(payload.commands?.macMaxFpsPlan || "", "--port 9", "custom LaunchAgent commands.macMaxFpsPlan");
  assertIncludes(payload.commands?.macMaxFpsPlan || "", `--label ${label}`, "custom LaunchAgent commands.macMaxFpsPlan");
  assertIncludes(payload.commands?.macMaxFpsPlan || "", "--maxScreenFps 60", "custom LaunchAgent commands.macMaxFpsPlan");
  assertIncludes(payload.commands?.macHostSafeStart || "", "--port 9", "custom LaunchAgent commands.macHostSafeStart");
  assertIncludes(payload.commands?.macMaxFpsSafeStart || "", "--port 9", "custom LaunchAgent commands.macMaxFpsSafeStart");
  assertIncludes(payload.commands?.macMaxFpsSafeStart || "", "--maxScreenFps 60", "custom LaunchAgent commands.macMaxFpsSafeStart");
  assertIncludes(payload.commands?.macHostStop || "", "--port 9", "custom LaunchAgent commands.macHostStop");
  assertMacPowerPlanCommand(payload.commands?.macPowerPlan || "", "custom LaunchAgent commands.macPowerPlan");
  assertMacRemoteAudioPlanCommand(payload.commands?.macRemoteAudioPlan || "", "custom LaunchAgent commands.macRemoteAudioPlan");
  assertIncludes(payload.commands?.macLaunchAgentLoad || "", missingPath, "custom LaunchAgent commands.macLaunchAgentLoad");
  assertIncludes(payload.commands?.macLaunchAgentPrint || "", label, "custom LaunchAgent commands.macLaunchAgentPrint");
  assertIncludes(payload.commands?.macUnattendedFormal || "", `--label ${label}`, "custom LaunchAgent commands.macUnattendedFormal");
  assertIncludes(payload.commands?.macUnattendedFormal || "", "--requireLaunchAgentLoaded", "custom LaunchAgent commands.macUnattendedFormal");
  assertIncludes(payload.commands?.macFormalLocalSmoke || "", "--port 9", "custom LaunchAgent commands.macFormalLocalSmoke");
  assertIncludes(payload.commands?.macFormalLocalSmoke || "", "--promptPassword", "custom LaunchAgent commands.macFormalLocalSmoke");
  assertIncludes(payload.boardSummary || "", `--label ${label}`, "custom LaunchAgent board summary");
  assertIncludes(payload.boardSummary || "", "MacHostSafeStart=", "custom LaunchAgent board summary");
  assertIncludes(payload.boardSummary || "", "MacMaxFpsSafeStart=", "custom LaunchAgent board summary");
  assertIncludes(payload.boardSummary || "", "MacHostStop=", "custom LaunchAgent board summary");
  assertIncludes(payload.boardSummary || "", "MacPowerPlan=", "custom LaunchAgent board summary");
  assertIncludes(payload.boardSummary || "", "MacRemoteAudioPlan=", "custom LaunchAgent board summary");
  assertIncludes(payload.boardSummary || "", "MacLaunchAgentLoad=", "custom LaunchAgent board summary");
  assertIncludes(payload.boardSummary || "", "MacLaunchAgentPrint=", "custom LaunchAgent board summary");
  assertIncludes(payload.boardSummary || "", "MacFormalLocalSmoke=", "custom LaunchAgent board summary");
  assertIncludes(payload.boardSummary || "", "--port 9", "custom LaunchAgent board summary");
  assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "custom LaunchAgent planner JSON");
  print("OK", "LaunchAgent planner commands preserve checked port, label, and plist path");
}

function checkRequireLaunchAgentMaxFpsFails(args) {
  const missingPath = path.join(tmpdir(), `missing-lan-dual-agent-max-fps-${Date.now()}.plist`);
  const missingResult = run(args, [
    "--json",
    ...baseOfflineArgs(missingPath),
    "--requireLaunchAgentMaxFps",
  ]);
  const missingPayload = parseJson(missingResult.stdout, "require LaunchAgent max-FPS missing JSON");
  assert(missingResult.status !== 0, "requireLaunchAgentMaxFps should fail when plist is missing");
  assert(missingPayload.ok === false, "requireLaunchAgentMaxFps missing payload should report ok=false");
  assert(missingPayload.args?.requireLaunchAgentMaxFps === true, "requireLaunchAgentMaxFps should be echoed in JSON args");
  assert(missingPayload.findings.some((item) => item.id === "launch-agent-missing" && item.level === "blocker"), "requireLaunchAgentMaxFps should block a missing LaunchAgent");
  assertIncludes(missingPayload.boardSummary, "blockers=launch-agent-missing", "require LaunchAgent max-FPS missing board summary");
  assertIncludes(missingPayload.boardSummary, "warnings=host-offline", "require LaunchAgent max-FPS missing board summary");
  assertIncludes(missingPayload.commands?.macUnattendedStatus || "", "--requireLaunchAgentMaxFps", "require LaunchAgent max-FPS missing command");
  assertIncludes(missingPayload.boardSummary, "--requireLaunchAgentMaxFps", "require LaunchAgent max-FPS missing board summary");
  assertIncludes(missingPayload.commands?.macUnattendedFormal || "", "--requireLaunchAgentLoaded", "require LaunchAgent max-FPS missing formal command");
  assertIncludes(missingPayload.boardSummary, "--requireLaunchAgentLoaded", "require LaunchAgent max-FPS missing board summary");
  assertIncludes(missingPayload.commands?.macMaxFpsPlan || "", "--maxScreenFps 60", "require LaunchAgent max-FPS missing command");
  assertNoSecretOrInputGuidance(`${missingResult.stdout}\n${missingResult.stderr}`, "require LaunchAgent max-FPS missing JSON");

  const dir = mkdtempSync(path.join(tmpdir(), "lan-dual-unattended-agent-require-fps-"));
  try {
    const lowFpsPlist = path.join(dir, "com.lan-dual-control.mac-host-low.plist");
    writeFileSync(lowFpsPlist, fakeLaunchAgentPlist({ maxScreenFps: 30 }), "utf8");
    const lowFpsResult = run(args, [
      "--json",
      ...baseOfflineArgs(lowFpsPlist),
      "--requireLaunchAgentMaxFps",
    ]);
    const lowFpsPayload = parseJson(lowFpsResult.stdout, "require LaunchAgent low max-FPS JSON");
    assert(lowFpsResult.status !== 0, "requireLaunchAgentMaxFps should fail when LaunchAgent maxScreenFps is below 60");
    assert(lowFpsPayload.ok === false, "requireLaunchAgentMaxFps low-FPS payload should report ok=false");
    assert(lowFpsPayload.launchAgent?.maxScreenFps === 30, "requireLaunchAgentMaxFps should preserve low maxScreenFps");
    assert(lowFpsPayload.findings.some((item) => item.id === "launch-agent-max-fps" && item.level === "blocker" && /maxScreenFps=30/.test(item.text)), "low LaunchAgent max-FPS should become a blocker");
    assertIncludes(lowFpsPayload.boardSummary, "maxFps=30", "require LaunchAgent low max-FPS board summary");
    assertIncludes(lowFpsPayload.boardSummary, "blockers=launch-agent-max-fps", "require LaunchAgent low max-FPS board summary");
    assertIncludes(lowFpsPayload.boardSummary, "warnings=host-offline", "require LaunchAgent low max-FPS board summary");
    assertIncludes(lowFpsPayload.commands?.macMaxFpsPlan || "", "--maxScreenFps 60", "require LaunchAgent low max-FPS command");
    assertNoSecretOrInputGuidance(`${lowFpsResult.stdout}\n${lowFpsResult.stderr}`, "require LaunchAgent low max-FPS JSON");

    const missingFpsPlist = path.join(dir, "com.lan-dual-control.mac-host-missing-fps.plist");
    writeFileSync(missingFpsPlist, fakeLaunchAgentPlist({ maxScreenFps: null }), "utf8");
    const missingFpsResult = run(args, [
      "--json",
      ...baseOfflineArgs(missingFpsPlist),
      "--requireLaunchAgentMaxFps",
    ]);
    const missingFpsPayload = parseJson(missingFpsResult.stdout, "require LaunchAgent missing max-FPS JSON");
    assert(missingFpsResult.status !== 0, "requireLaunchAgentMaxFps should fail when LaunchAgent maxScreenFps is not explicit");
    assert(missingFpsPayload.launchAgent?.maxScreenFps === null, "missing max-FPS payload should expose maxScreenFps=null");
    assert(missingFpsPayload.findings.some((item) => item.id === "launch-agent-max-fps" && item.level === "blocker" && /not explicit/.test(item.text)), "missing LaunchAgent max-FPS should become a blocker");
    assertIncludes(missingFpsPayload.boardSummary, "maxFps=unknown", "require LaunchAgent missing max-FPS board summary");
    assertIncludes(missingFpsPayload.boardSummary, "blockers=launch-agent-max-fps", "require LaunchAgent missing max-FPS board summary");
    assertIncludes(missingFpsPayload.boardSummary, "warnings=host-offline", "require LaunchAgent missing max-FPS board summary");
    assertNoSecretOrInputGuidance(`${missingFpsResult.stdout}\n${missingFpsResult.stderr}`, "require LaunchAgent missing max-FPS JSON");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  print("OK", "requireLaunchAgentMaxFps turns missing or low LaunchAgent max FPS into blockers");
}

function checkRequireLaunchAgentLoadedNeedsProbe(args) {
  const missingPath = path.join(tmpdir(), `missing-lan-dual-agent-loaded-${Date.now()}.plist`);
  const result = run(args, [
    "--json",
    ...baseOfflineArgs(missingPath),
    "--requireLaunchAgentLoaded",
  ]);
  const payload = parseJson(result.stdout, "require LaunchAgent loaded JSON");
  assert(result.status !== 0, "requireLaunchAgentLoaded should fail when launchctl is skipped");
  assert(payload.ok === false, "requireLaunchAgentLoaded payload should report ok=false");
  assert(payload.findings.some((item) => item.id === "launch-agent-loaded-unchecked" && item.level === "blocker"), "requireLaunchAgentLoaded should require a launchctl result");
  assertUnattendedHealth(payload, {
    status: "blocked",
    reason: "launch-agent-loaded-unchecked",
    blockers: "launch-agent-loaded-unchecked",
    warnings: "host-offline,launch-agent-missing",
  }, "require LaunchAgent loaded JSON");
  assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "require LaunchAgent loaded JSON");
  print("OK", "requireLaunchAgentLoaded refuses an unchecked launchctl result");
}

function checkStrictWarningsFail(args) {
  const missingPath = path.join(tmpdir(), `missing-lan-dual-agent-strict-${Date.now()}.plist`);
  const result = run(args, [
    "--json",
    ...baseOfflineArgs(missingPath),
    "--strict",
  ]);
  const payload = parseJson(result.stdout, "strict unattended JSON");
  assert(result.status !== 0, "strict mode should fail on warnings");
  assert(payload.ok === false, "strict mode payload should report ok=false");
  assert(payload.findings.some((item) => item.level === "warning"), "strict mode should preserve warning findings");
  assertIncludes(payload.boardSummary, "warnings=host-offline,launch-agent-missing", "strict unattended board summary");
  assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "strict unattended JSON");
  print("OK", "strict mode turns unattended warnings into a failing report");
}

function checkSendStatus(args) {
  const dir = mkdtempSync(path.join(tmpdir(), "lan-dual-unattended-send-status-"));
  try {
    const missingPath = path.join(dir, "missing-agent.plist");
    const fakeLink = makeFakeCodexLink(dir);
    const result = runWithEnv(args, [
      "--json",
      "--sendStatus",
      "--server",
      "http://127.0.0.1:17888",
      ...baseOfflineArgs(missingPath),
    ], {
      LAN_DUAL_CODEX_LINK_CLIENT: fakeLink.scriptPath,
    });
    const payload = parseJson(result.stdout, "sendStatus JSON");
    assert(result.status === 0, `sendStatus warning path should stay non-failing\n${result.stdout}\n${result.stderr}`);
    assert(payload.postStatus?.ok === true, "sendStatus payload should report postStatus.ok=true");
    assert(payload.postStatus?.status === "warning", "sendStatus payload should post warning status");
    const calls = readJsonl(fakeLink.logPath);
    assert(calls.length === 1, "fake Codex Link should receive one status call");
    const argv = calls[0].join(" ");
    assertIncludes(argv, "status", "sendStatus codex-link argv");
    assertIncludes(argv, "--server http://127.0.0.1:17888", "sendStatus codex-link argv");
    assertIncludes(argv, "--device Mac Unattended", "sendStatus codex-link argv");
    assertIncludes(argv, "--role Mac 值守", "sendStatus codex-link argv");
    assertIncludes(argv, "--status warning", "sendStatus codex-link argv");
    assertIncludes(argv, "MacUnattendedHealth=warning", "sendStatus codex-link argv");
    assertIncludes(argv, "warnings=host-offline,launch-agent-missing", "sendStatus codex-link argv");
    assertIncludes(argv, "MacUnattendedSendStatus=", "sendStatus codex-link argv");
    assertIncludes(argv, "--server http://192.168.31.68:17888", "sendStatus codex-link argv should expose default self-refresh board");
    assertIncludes(argv, "--sendStatus", "sendStatus codex-link argv should expose self-refresh flag");
    assertNotIncludes(argv, "Mac Codex", "sendStatus should not mask Mac Codex freshness");
    assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}\n${argv}`, "sendStatus output");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  print("OK", "Mac unattended status can post a dedicated Agent Link Board status");
}

function checkFakePlist(args) {
  const dir = mkdtempSync(path.join(tmpdir(), "lan-dual-unattended-agent-"));
  try {
    const plist = path.join(dir, "com.lan-dual-control.mac-host.plist");
    writeFileSync(plist, fakeLaunchAgentPlist({ maxScreenFps: 60 }), "utf8");
    const result = run(args, [
      "--json",
      ...baseOfflineArgs(plist),
    ]);
    const payload = parseJson(result.stdout, "fake plist unattended JSON");
    assert(result.status === 0, "fake plist path should stay non-failing");
    assert(payload.launchAgent?.exists === true, "fake plist should exist");
    assert(payload.launchAgent?.readable === true, "fake plist should be readable");
    assert(payload.launchAgent?.installed === true, "fake plist should be considered installed");
    assert(payload.launchAgent?.labelMatches === true, "fake plist label should match");
    assert(payload.launchAgent?.maxScreenFps === 60, "fake plist should expose maxScreenFps from ProgramArguments");
    assert(payload.launchAgent?.passwordMode === "ephemeral", "fake plist should expose LaunchAgent passwordMode=ephemeral");
    assert(Array.isArray(payload.launchAgent?.programArguments), "fake plist should expose ProgramArguments");
    assert(payload.macHostAuthPath?.status === "prompt-password-required", "fake plist should expose prompt-password-required auth path");
    assert(payload.macHostAuthPath?.reason === "launch-agent-ephemeral-password", "fake plist should explain ephemeral LaunchAgent password");
    assert(payload.macHostAuthPath?.mode === "ephemeral", "fake plist auth path should include mode=ephemeral");
    assert(payload.macHostAuthPath?.next === "MacHostStop->MacMaxFpsSafeStart->MacHostMedia", "fake plist auth path should include the safe formal next-step order");
    assertIncludes(payload.commands?.launchAgentPlan || "", "install-mac-host-launch-agent.mjs", "fake plist commands.launchAgentPlan");
    assertIncludes(payload.commands?.macMaxFpsPlan || "", "--maxScreenFps 60", "fake plist commands.macMaxFpsPlan");
    assertIncludes(payload.commands?.macHostSafeStart || "", "--promptPassword", "fake plist commands.macHostSafeStart");
    assertIncludes(payload.commands?.macHostSafeStart || "", "--port 9", "fake plist commands.macHostSafeStart");
    assertIncludes(payload.commands?.macHostStop || "", "--stop", "fake plist commands.macHostStop");
    assertIncludes(payload.commands?.macHostStop || "", "--port 9", "fake plist commands.macHostStop");
    assertIncludes(payload.commands?.macLaunchAgentLoad || "", plist, "fake plist commands.macLaunchAgentLoad");
    assertIncludes(payload.commands?.macLaunchAgentPrint || "", "com.lan-dual-control.mac-host", "fake plist commands.macLaunchAgentPrint");
    assertIncludes(payload.commands?.macUnattendedFormal || "", "--requireLaunchAgentLoaded", "fake plist commands.macUnattendedFormal");
    assertIncludes(payload.commands?.macHostReadiness || "", "check-mac-host-readiness.mjs", "fake plist commands.macHostReadiness");
    assertIncludes(payload.commands?.hostReadiness || "", "check-mac-host-readiness.mjs", "fake plist commands.hostReadiness");
    assertIncludes(payload.boardSummary, "MacHostAuthPath=prompt-password-required reason=launch-agent-ephemeral-password mode=ephemeral next=MacHostStop->MacMaxFpsSafeStart->MacHostMedia", "fake plist board summary should expose MacHostAuthPath");
    assert(payload.limitations.some((item) => /System sleep/.test(item)), "fake plist payload should document sleep limit");
    assert(payload.limitations.some((item) => /Reboot/.test(item)), "fake plist payload should document reboot/login limit");
    assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "fake plist unattended JSON");
    print("OK", "LaunchAgent plist label parsing and limitations are machine-readable");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function checkLaunchAgentMaxFpsWarning(args) {
  const dir = mkdtempSync(path.join(tmpdir(), "lan-dual-unattended-agent-fps-"));
  try {
    const plist = path.join(dir, "com.lan-dual-control.mac-host.plist");
    writeFileSync(plist, fakeLaunchAgentPlist({ maxScreenFps: 30 }), "utf8");
    const result = run(args, [
      "--json",
      ...baseOfflineArgs(plist),
    ]);
    const payload = parseJson(result.stdout, "max-FPS LaunchAgent JSON");
    assert(result.status === 0, "low max-FPS LaunchAgent should stay a warning by default");
    assert(payload.launchAgent?.maxScreenFps === 30, "max-FPS payload should preserve LaunchAgent maxScreenFps");
    assert(payload.findings.some((item) => item.id === "launch-agent-max-fps" && item.level === "warning" && /maxScreenFps=30/.test(item.text)), "low max-FPS LaunchAgent should create a warning");
    assert(payload.findings.some((item) => item.id === "launch-agent-max-fps" && /foreground 60Hz safe start/.test(item.text)), "low max-FPS finding should mention foreground 60Hz safe start");
    assertIncludes(payload.commands?.macMaxFpsSafeStart || "", "--maxScreenFps 60", "max-FPS commands.macMaxFpsSafeStart");
    assertIncludes(payload.commands?.macMaxFpsPlan || "", "--maxScreenFps 60", "max-FPS commands.macMaxFpsPlan");
    assertIncludes(payload.commands?.macUnattendedFormal || "", "--requireLaunchAgentLoaded", "max-FPS commands.macUnattendedFormal");
    assertIncludes(payload.boardSummary, "maxFps=30", "max-FPS board summary");
    assertIncludes(payload.boardSummary, "warnings=host-offline,launch-agent-max-fps", "max-FPS board summary");
    assertIncludes(payload.boardSummary, "MacMaxFpsSafeStart=", "max-FPS board summary");
    assertIncludes(payload.boardSummary, "MacMaxFpsPlan=", "max-FPS board summary");
    assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "max-FPS LaunchAgent JSON");
    print("OK", "LaunchAgent maxScreenFps below 60Hz is reported as a warning");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function checkBoardSummary(args) {
  const missingPath = path.join(tmpdir(), `missing-lan-dual-agent-board-${Date.now()}.plist`);
  const result = run(args, [
    "--boardSummary",
    ...baseOfflineArgs(missingPath),
  ]);
  assert(result.status === 0, "board summary should stay non-failing by default");
  const text = String(result.stdout || "").trim();
  const lines = text.split(/\r?\n/).filter(Boolean);
  assert(lines.length === 1, `board summary should be one line, got ${lines.length}`);
  assertIncludes(text, "Mac unattended status:", "board summary");
  assertIncludes(text, "MacUnattendedHealth=warning", "board summary");
  assertIncludes(text, "reason=host-offline", "board summary");
  assertIncludes(text, "MacUnattendedStatus=", "board summary");
  assertIncludes(text, "MacUnattendedSendStatus=", "board summary");
  assertMacUnattendedSendStatusCommand(
    text.split("MacUnattendedSendStatus=")[1]?.split("; ")[0] || "",
    "board summary MacUnattendedSendStatus",
  );
  assertIncludes(text, "MacHostSafeStart=", "board summary");
  assertIncludes(text, "MacHostSafeStart=node scripts/mac/start-mac-host.mjs", "board summary");
  assertIncludes(text, "MacMaxFpsSafeStart=", "board summary");
  assertIncludes(text, "MacMaxFpsSafeStart=node scripts/mac/start-mac-host.mjs", "board summary");
  assertIncludes(text, "MacHostStop=", "board summary");
  assertIncludes(text, "MacHostStop=node scripts/mac/start-mac-host.mjs", "board summary");
  assertIncludes(text, "--stop --host 127.0.0.1 --port 9", "board summary");
  assertIncludes(text, "MacLaunchAgentLoad=", "board summary");
  assertIncludes(text, "launchctl bootstrap", "board summary");
  assertIncludes(text, "MacLaunchAgentPrint=", "board summary");
  assertIncludes(text, "launchctl print", "board summary");
  assertIncludes(text, "--promptPassword", "board summary");
  assertIncludes(text, "--requirePassword", "board summary");
  assertIncludes(text, "--maxScreenFps 60", "board summary");
  assertIncludes(text, "--port 9", "board summary");
  assertIncludes(text, missingPath, "board summary");
  assertIncludes(text, "--skipLaunchctl", "board summary");
  assertNotIncludes(text, "--json", "board summary");
  assertIncludes(text, "MacLaunchAgentPlan=", "board summary");
  assertIncludes(text, "MacMaxFpsPlan=", "board summary");
  assertIncludes(text, "MacUnattendedFormal=", "board summary");
  assertIncludes(text, "--requireLaunchAgentLoaded", "board summary");
  assertIncludes(text, "MacHostReadiness=", "board summary");
  assertIncludes(text, "MacHostReadiness=node scripts/mac/check-mac-host-readiness.mjs", "board summary");
  assertIncludes(text, "HostReadiness=", "board summary");
  assertIncludes(text, "MacHostMedia=", "board summary");
  assertIncludes(text, "MacHostMedia=node scripts/mac/check-mac-host-readiness.mjs", "board summary");
  assertIncludes(text, "--probeMedia --probeMediaResourceSample --promptPassword", "board summary");
  assertIncludes(text, "MacResumeStatus=", "board summary");
  assertIncludes(text, "MacResumeStatus=node scripts/mac/check-mac-resume-status.mjs", "board summary");
  assertIncludes(text, "MacFormalLocalSmoke=", "board summary");
  assertIncludes(text, "MacFormalLocalSmoke=node scripts/mac/check-mac-formal-local-smoke.mjs", "board summary");
  assertIncludes(text, "MacClientBrowserSelfTest=", "board summary");
  assertMacClientBrowserSelfTestCommand(
    text.split("MacClientBrowserSelfTest=")[1]?.split("; ")[0] || "",
    "board summary MacClientBrowserSelfTest",
  );
  assertIncludes(text, "MacScriptHelp=", "board summary");
  assertIncludes(text, "MacScriptHelp=node scripts/mac/test-mac-script-help.mjs", "board summary");
  assertIncludes(text, "MacRemoteAudioPlan=", "board summary");
  assertIncludes(text, "MacRemoteAudioPlan=node scripts/mac/plan-mac-remote-audio.mjs", "board summary");
  assertIncludes(text, "blockers=none", "board summary");
  assertIncludes(text, "warnings=host-offline,launch-agent-missing", "board summary");
  assertIncludes(text, "No password", "board summary");
  assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "board summary");
  print("OK", "Board summary is one line, actionable, and secret-free");
}

async function checkCapabilitiesInputMode(args) {
  await withFakeHost({
    deviceName: "Fake unattended Mac",
    permissions: {
      screenRecording: true,
      accessibility: true,
      inputMonitoring: true,
    },
    runtime: {
      buildId: "fake-unattended-build",
      processId: 12345,
    },
    capabilities: {
      inputMode: "log",
      h264Stream: true,
      capturePipeline: "screencapturekit-h264",
      audioMode: "system-pcm",
    },
  }, async (port) => {
    const result = run(args, [
      "--json",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--timeoutMs",
      "1200",
      "--skipLaunchctl",
      "--skipPmset",
    ]);
    const payload = parseJson(result.stdout, "capabilities inputMode JSON");
    assert(result.status === 0, `capabilities inputMode path should stay non-failing\n${result.stdout}\n${result.stderr}`);
    assert(payload.host?.online === true, "capabilities inputMode fake host should be online");
    assert(payload.host?.inputMode === "log", "capabilities.inputMode should be used when top-level inputMode is absent");
    assert(!payload.findings.some((item) => item.id === "input-mode"), "capabilities inputMode=log should not create input-mode finding");
    assertIncludes(payload.boardSummary, "inputMode=log", "capabilities inputMode board summary");
    assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "capabilities inputMode JSON");
  });
  print("OK", "Capabilities inputMode is surfaced in unattended JSON and board summary");
}

async function checkStaleRuntimeBuildWarning(args) {
  const dir = mkdtempSync(path.join(tmpdir(), "lan-dual-unattended-stale-build-"));
  try {
    const plist = path.join(dir, "com.lan-dual-control.mac-host.plist");
    writeFileSync(plist, fakeLaunchAgentPlist({ maxScreenFps: 60 }), "utf8");
    const staleRuntimeBuildId = getComparableStaleMacHostBuildId();
    await withFakeHost({
      deviceName: "Fake stale unattended Mac",
      inputMode: "log",
      permissions: {
        screenRecording: true,
        accessibility: true,
        inputMonitoring: true,
      },
      runtime: {
        buildId: staleRuntimeBuildId,
        processId: 12345,
      },
      capabilities: {
        h264Stream: true,
        capturePipeline: "screencapturekit-h264",
        audioMode: "system-pcm",
      },
    }, async (port) => {
      const result = run(args, [
        "--json",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--timeoutMs",
        "1200",
        "--launchAgentPath",
        plist,
        "--skipLaunchctl",
        "--skipPmset",
      ]);
      const payload = parseJson(result.stdout, "stale runtime unattended JSON");
      assert(result.status === 0, `stale runtime build should stay warning-only by default\n${result.stdout}\n${result.stderr}`);
      assert(payload.host?.buildDiff?.severity === "restart-recommended", "stale runtime payload should recommend restart");
      assert(payload.host?.buildDiff?.changedHostRuntimeFileCount > 0, "stale runtime payload should count changed host runtime files");
      assert(payload.suggestedAction?.id === "restart-mac-host-safely", "stale runtime payload should expose a safe restart suggestedAction");
      assertIncludes(payload.suggestedAction?.boardSummary || "", "suggestedAction=restart-mac-host-safely", "stale runtime suggestedAction board summary");
      assertIncludes(payload.suggestedAction?.boardSummary || "", "MacHostStop->MacHostSafeStart-or-MacMaxFpsSafeStart->MacResumeStatus", "stale runtime suggestedAction board summary");
      assertIncludes(payload.suggestedAction?.commands?.macHostStop || "", "--stop", "stale runtime suggestedAction macHostStop");
      assertIncludes(payload.suggestedAction?.commands?.macHostSafeStart || "", "--promptPassword", "stale runtime suggestedAction macHostSafeStart");
      assertIncludes(payload.suggestedAction?.commands?.macMaxFpsSafeStart || "", "--maxScreenFps 60", "stale runtime suggestedAction macMaxFpsSafeStart");
      assertIncludes(payload.suggestedAction?.commands?.macResumeStatus || "", "check-mac-resume-status.mjs", "stale runtime suggestedAction macResumeStatus");
      assertNotIncludes(payload.suggestedAction?.commands?.macResumeStatus || "", "--promptPassword", "stale runtime suggestedAction macResumeStatus");
      assertNotIncludes(payload.suggestedAction?.commands?.macResumeStatus || "", "--password", "stale runtime suggestedAction macResumeStatus");
      assert(payload.findings.some((item) => item.id === "mac-host-build-stale" && item.level === "warning"), "stale runtime build should create a stable warning id");
      assertIncludes(payload.boardSummary, "suggestedAction=restart-mac-host-safely", "stale runtime board summary");
      assertIncludes(payload.boardSummary, "MacHostMedia=", "stale runtime board summary");
      assertIncludes(payload.boardSummary, "MacResumeStatus=", "stale runtime board summary");
      assertIncludes(payload.boardSummary, "warnings=mac-host-build-stale", "stale runtime board summary");
      assertIncludes(payload.boardSummary, `runtimeBuild=${staleRuntimeBuildId} restart recommended`, "stale runtime board summary");
      assertIncludes(payload.boardSummary, "hostRuntimeChanges=", "stale runtime board summary");
      assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "stale runtime unattended JSON");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  print("OK", "Stale Mac host runtime build is surfaced in unattended status");
}

async function checkNoFindingsSummary(args) {
  const dir = mkdtempSync(path.join(tmpdir(), "lan-dual-unattended-clean-"));
  try {
    const plist = path.join(dir, "com.lan-dual-control.mac-host.plist");
    writeFileSync(plist, fakeLaunchAgentPlist({ maxScreenFps: 60 }), "utf8");
    await withFakeHost({
      deviceName: "Fake clean unattended Mac",
      inputMode: "log",
      permissions: {
        screenRecording: true,
        accessibility: true,
        inputMonitoring: true,
      },
      runtime: {
        buildId: "fake-clean-unattended-build",
        processId: 12345,
      },
      capabilities: {
        h264Stream: true,
        capturePipeline: "screencapturekit-h264",
        audioMode: "system-pcm",
      },
    }, async (port) => {
      const result = run(args, [
        "--json",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--timeoutMs",
        "1200",
        "--launchAgentPath",
        plist,
        "--skipLaunchctl",
        "--skipPmset",
      ]);
      const payload = parseJson(result.stdout, "clean unattended JSON");
      assert(result.status === 0, `clean unattended path should pass\n${result.stdout}\n${result.stderr}`);
      assert(payload.ok === true, "clean unattended payload should report ok=true");
      assert(payload.findings.length === 0, "clean unattended payload should have no findings");
      assertUnattendedHealth(payload, {
        status: "ok",
        reason: "ok",
        blockers: "none",
        warnings: "none",
      }, "clean unattended JSON");
      assert(payload.launchAgent?.maxScreenFps === 60, "clean unattended payload should report LaunchAgent maxScreenFps=60");
      assertIncludes(payload.boardSummary, "MacUnattendedHealth=ok", "clean unattended board summary");
      assertIncludes(payload.boardSummary, "attention=none", "clean unattended board summary");
      assertIncludes(payload.boardSummary, "maxFps=60", "clean unattended board summary");
      assertIncludes(payload.boardSummary, "MacUnattendedSendStatus=", "clean unattended board summary");
      assertMacUnattendedSendStatusCommand(
        payload.commands?.macUnattendedSendStatus || "",
        "clean unattended commands.macUnattendedSendStatus",
      );
      assertIncludes(payload.boardSummary, "MacMaxFpsSafeStart=", "clean unattended board summary");
      assertIncludes(payload.boardSummary, "MacHostMedia=", "clean unattended board summary");
      assertIncludes(payload.boardSummary, "MacResumeStatus=", "clean unattended board summary");
      assertIncludes(payload.boardSummary, "MacClientBrowserSelfTest=", "clean unattended board summary");
      assertMacClientBrowserSelfTestCommand(
        payload.commands?.macClientBrowserSelfTest || "",
        "clean unattended commands.macClientBrowserSelfTest",
      );
      assert(!payload.suggestedAction, "clean unattended payload should not expose a restart suggestedAction");
      assertNotIncludes(payload.boardSummary, "suggestedAction=restart-mac-host-safely", "clean unattended board summary");
      assertIncludes(payload.boardSummary, "blockers=none", "clean unattended board summary");
      assertIncludes(payload.boardSummary, "warnings=none", "clean unattended board summary");
      assertNoSecretOrInputGuidance(`${result.stdout}\n${result.stderr}`, "clean unattended JSON");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  print("OK", "Clean unattended status explicitly reports blockers=none and warnings=none");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  checkMissingLaunchAgentJson(args);
  checkRequireLaunchAgentFails(args);
  checkLaunchAgentPlannerPreservesOptions(args);
  checkRequireLaunchAgentMaxFpsFails(args);
  checkRequireLaunchAgentLoadedNeedsProbe(args);
  checkStrictWarningsFail(args);
  checkSendStatus(args);
  checkFakePlist(args);
  checkLaunchAgentMaxFpsWarning(args);
  checkBoardSummary(args);
  await checkPowerHealthDetails(args);
  await checkCapabilitiesInputMode(args);
  await checkStaleRuntimeBuildWarning(args);
  await checkNoFindingsSummary(args);
  print("OK", "Mac unattended status self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
