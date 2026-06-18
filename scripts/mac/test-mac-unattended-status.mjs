#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

function fakeLaunchAgentPlist({ label = "com.lan-dual-control.mac-host", maxScreenFps = 60 } = {}) {
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
    "--maxScreenFps",
    String(maxScreenFps),
  ];
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
    assertIncludes(result.stdout, "--skipLaunchctl", `${script} ${flag}`);
    assertIncludes(result.stdout, "host", `${script} ${flag}`);
    assertIncludes(result.stdout, "launchAgent", `${script} ${flag}`);
    assertIncludes(result.stdout, "power", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.launchAgentPlan", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macMaxFpsPlan", `${script} ${flag}`);
    assertNoSecretOrInputGuidance(result.stdout, `${script} ${flag}`);
  }
  print("OK", "Unattended status help exits quickly and stays side-effect-free");
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
  assertIncludes(payload.commands?.launchAgentPlan || "", "install-mac-host-launch-agent.mjs", "missing LaunchAgent commands.launchAgentPlan");
  assertIncludes(payload.commands?.launchAgentPlan || "", "--boardSummary", "missing LaunchAgent commands.launchAgentPlan");
  assertIncludes(payload.boardSummary, "MacUnattendedStatus=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacLaunchAgentPlan=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "MacMaxFpsPlan=", "missing LaunchAgent board summary");
  assertIncludes(payload.boardSummary, "HostReadiness=", "missing LaunchAgent board summary");
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
    assert(Array.isArray(payload.launchAgent?.programArguments), "fake plist should expose ProgramArguments");
    assertIncludes(payload.commands?.launchAgentPlan || "", "install-mac-host-launch-agent.mjs", "fake plist commands.launchAgentPlan");
    assertIncludes(payload.commands?.macMaxFpsPlan || "", "--maxScreenFps 60", "fake plist commands.macMaxFpsPlan");
    assertIncludes(payload.commands?.hostReadiness || "", "check-mac-host-readiness.mjs", "fake plist commands.hostReadiness");
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
    assertIncludes(payload.commands?.macMaxFpsPlan || "", "--maxScreenFps 60", "max-FPS commands.macMaxFpsPlan");
    assertIncludes(payload.boardSummary, "maxFps=30", "max-FPS board summary");
    assertIncludes(payload.boardSummary, "warnings=host-offline,launch-agent-max-fps", "max-FPS board summary");
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
  assertIncludes(text, "MacUnattendedStatus=", "board summary");
  assertIncludes(text, "MacLaunchAgentPlan=", "board summary");
  assertIncludes(text, "MacMaxFpsPlan=", "board summary");
  assertIncludes(text, "HostReadiness=", "board summary");
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
      assert(payload.launchAgent?.maxScreenFps === 60, "clean unattended payload should report LaunchAgent maxScreenFps=60");
      assertIncludes(payload.boardSummary, "attention=none", "clean unattended board summary");
      assertIncludes(payload.boardSummary, "maxFps=60", "clean unattended board summary");
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
  checkRequireLaunchAgentLoadedNeedsProbe(args);
  checkStrictWarningsFail(args);
  checkFakePlist(args);
  checkLaunchAgentMaxFpsWarning(args);
  checkBoardSummary(args);
  await checkCapabilitiesInputMode(args);
  await checkNoFindingsSummary(args);
  print("OK", "Mac unattended status self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
