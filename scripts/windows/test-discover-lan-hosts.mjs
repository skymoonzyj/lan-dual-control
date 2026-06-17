import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/windows/discover-lan-hosts.mjs";
const psScript = "scripts/windows/discover-lan-hosts.ps1";

const defaults = {
  timeoutMs: 12000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-discover-lan-hosts.mjs [options]

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Description:
  Verifies Windows-side LAN discovery JSON, Mac formal E2E next commands, and
  secret-free Agent Link Board summaries with local fake /discovery servers.
  It does not authenticate, open WebSocket, ask for a password, send input, or
  execute inject.
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

function discoveryPayload(overrides) {
  return {
    type: "lan_dual_discovery",
    host: "0.0.0.0",
    port: 0,
    controlPort: 0,
    deviceId: "fake-device",
    deviceName: "Fake host",
    platform: "unknown",
    role: "host",
    runtime: {
      buildId: "test-build",
      processId: 1234,
      uptimeSeconds: 3,
    },
    capabilities: {
      video: true,
      h264Stream: true,
      audio: true,
      audioMode: "system-pcm",
      clipboardText: true,
      clipboardFile: true,
      inputMode: "log",
      maxScreenFps: 30,
    },
    ...overrides,
  };
}

function startDiscoveryServer(payload) {
  return new Promise((resolveServer, rejectServer) => {
    const server = createServer((request, response) => {
      if (request.url !== "/discovery") {
        response.writeHead(404);
        response.end("not found");
        return;
      }
      const address = server.address();
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        ...payload,
        controlPort: address.port,
        port: address.port,
      }));
    });
    server.on("error", rejectServer);
    server.listen(0, "127.0.0.1", () => {
      resolveServer({
        server,
        port: server.address().port,
      });
    });
  });
}

function stopServer(server) {
  return new Promise((resolveStop) => server.close(resolveStop));
}

function run(extraArgs, args) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [script, ...extraArgs], {
      cwd: repoRoot,
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({
        status: null,
        signal: "timeout",
        stdout,
        stderr,
      });
    }, args.timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({
        status: null,
        signal: "error",
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolveRun({
        status,
        signal,
        stdout,
        stderr,
      });
    });
  });
}

function runPowerShell(extraArgs, args) {
  return new Promise((resolveRun) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", psScript,
      ...extraArgs,
    ], {
      cwd: repoRoot,
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({
        status: null,
        signal: "timeout",
        stdout,
        stderr,
      });
    }, args.timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({
        status: null,
        signal: "error",
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolveRun({
        status,
        signal,
        stdout,
        stderr,
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

function baseProbeArgs(macPort, windowsPort) {
  return [
    "--noLocalSubnets",
    "--host", "127.0.0.1",
    "--timeoutMs", "250",
    "--port", String(macPort),
    "--port", String(windowsPort),
  ];
}

async function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = await run([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0.\n${result.stdout}\n${result.stderr}`);
    assertIncludes(result.stdout, "Usage:", `${script} ${flag}`);
    assertIncludes(result.stdout, "--boardSummary", `${script} ${flag}`);
    assertIncludes(result.stdout, "--requireMacHost", `${script} ${flag}`);
    assertIncludes(result.stdout, "--noLocalSubnets", `${script} ${flag}`);
  }
  console.log("[OK] LAN discovery help covers new Mac formal E2E options");
}

async function checkPowerShellHelp(args) {
  for (const flag of ["-Help", "-h"]) {
    const result = await runPowerShell([flag], args);
    assert(result.status === 0, `${psScript} ${flag} should exit 0.\n${result.stdout}\n${result.stderr}`);
    assertIncludes(result.stdout, "Usage:", `${psScript} ${flag}`);
    assertIncludes(result.stdout, "-BoardSummary", `${psScript} ${flag}`);
    assertIncludes(result.stdout, "-RequireMacHost", `${psScript} ${flag}`);
    assertIncludes(result.stdout, "-NoLocalSubnets", `${psScript} ${flag}`);
    assertIncludes(result.stdout, "ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics", `${psScript} ${flag}`);
    assertNotIncludes(result.stdout, "Mac host password:", `${psScript} ${flag}`);
    assertNotIncludes(result.stdout, "Starting Windows host", `${psScript} ${flag}`);
  }
  console.log("[OK] PowerShell LAN discovery help is pure and covers Mac formal checklist options");
}

async function checkFoundJson(macPort, windowsPort, args) {
  const result = await run(["--json", ...baseProbeArgs(macPort, windowsPort)], args);
  assert(result.status === 0, `found JSON should exit 0.\n${result.stdout}\n${result.stderr}`);
  const payload = parseJson(result.stdout, "found JSON");
  assert(payload.ok === true, "found payload should be ok=true");
  assert(payload.found.length === 2, "found payload should include both fake hosts");
  assert(payload.macHosts.length === 1, "found payload should include one Mac host");
  assert(payload.nonMacHosts.length === 1, "found payload should include one non-Mac host");
  assert(payload.bestMacHost.port === String(macPort), "bestMacHost should use the Mac server port");
  assert(typeof payload.currentBuildId === "string", "found payload should include currentBuildId");
  assert(payload.bestMacHost.buildDiff?.differs === true, "bestMacHost should include buildDiff for stale/non-comparable runtime builds");
  assert(payload.bestMacHost.buildDiff?.severity === "warning", "fake mac-build should be non-comparable and warn");
  assertIncludes(payload.macFormalE2e.preflightCommand, "--preflightOnly --checkClientDiagnostics --boardSummary", "preflight command");
  assertIncludes(payload.macFormalE2e.formalChecklistCommand, "--preflightOnly --checkClientDiagnostics --boardSummary", "formal checklist command");
  assert(payload.macFormalE2e.manualChecklistSummary === "connection/video/audio/clipboard/input_ack/diagnostics", "manual checklist summary mismatch");
  assertIncludes(payload.macFormalE2e.userAuthRequestCommand, "--userAuthRequest", "user auth command");
  assertIncludes(payload.macFormalE2e.sendUserAuthRequestCommand, "--sendUserAuthRequest", "send user auth command");
  assertIncludes(payload.macFormalE2e.formalCommand, "--promptPassword", "formal command");
  assertIncludes(payload.boardSummary, "FormalChecklist=", "board summary");
  assertIncludes(payload.boardSummary, "ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics", "board summary");
  assertIncludes(payload.boardSummary, "No password was requested or sent", "board summary");
  assertIncludes(payload.boardSummary, "no WebSocket/input/inject", "board summary");
  assertNotIncludes(`${result.stdout}\n${result.stderr}`, "test-password", "found output");
  assertNotIncludes(`${result.stdout}\n${result.stderr}`, "LAN_DUAL_PASSWORD", "found output");
  console.log("[OK] JSON discovery keeps all hosts and adds Mac formal E2E next commands");
}

async function checkPowerShellJson(macPort, args) {
  const result = await runPowerShell([
    "-Json",
    "-NoLocalSubnets",
    "-HostName", "127.0.0.1",
    "-TimeoutMs", "250",
    "-Port", String(macPort),
    "-RequireMacHost",
  ], args);
  assert(result.status === 0, `PowerShell JSON should exit 0.\n${result.stdout}\n${result.stderr}`);
  const payload = parseJson(result.stdout, "PowerShell JSON");
  assert(payload.ok === true, "PowerShell JSON payload should be ok=true");
  assert(payload.macHosts.length === 1, "PowerShell JSON payload should include one Mac host");
  assertIncludes(payload.macFormalE2e.formalChecklistCommand, "--preflightOnly --checkClientDiagnostics --boardSummary", "PowerShell formal checklist command");
  assert(payload.macFormalE2e.manualChecklistSummary === "connection/video/audio/clipboard/input_ack/diagnostics", "PowerShell manual checklist summary mismatch");
  assertNotIncludes(`${result.stdout}\n${result.stderr}`, "LAN_DUAL_PASSWORD", "PowerShell JSON output");
  console.log("[OK] PowerShell JSON discovery relays Mac formal checklist commands");
}

async function checkBoardSummary(macPort, windowsPort, args) {
  const result = await run(["--boardSummary", ...baseProbeArgs(macPort, windowsPort)], args);
  assert(result.status === 0, `board summary should exit 0.\n${result.stdout}\n${result.stderr}`);
  assertIncludes(result.stdout, "Windows-side Mac host discovery: found 1 Mac host", "board summary");
  assertIncludes(result.stdout, "Build diff:", "board summary");
  assertIncludes(result.stdout, "differs from repo", "board summary");
  assertIncludes(result.stdout, "check-mac-formal-e2e.mjs --host 127.0.0.1", "board summary");
  assertIncludes(result.stdout, "FormalChecklist=", "board summary");
  assertIncludes(result.stdout, "ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics", "board summary");
  assertIncludes(result.stdout, "--userAuthRequest", "board summary");
  assertIncludes(result.stdout, "--sendUserAuthRequest", "board summary");
  assertIncludes(result.stdout, "--promptPassword", "board summary");
  assertNotIncludes(result.stdout, "demo-password", "board summary");
  console.log("[OK] Board summary prints secret-free preflight/auth/formal commands");
}

async function checkPowerShellBoardSummary(macPort, args) {
  const result = await runPowerShell([
    "-BoardSummary",
    "-NoLocalSubnets",
    "-HostName", "127.0.0.1",
    "-TimeoutMs", "250",
    "-Port", String(macPort),
    "-RequireMacHost",
  ], args);
  assert(result.status === 0, `PowerShell board summary should exit 0.\n${result.stdout}\n${result.stderr}`);
  assertIncludes(result.stdout, "Windows-side Mac host discovery: found 1 Mac host", "PowerShell board summary");
  assertIncludes(result.stdout, "check-mac-formal-e2e.mjs --host 127.0.0.1", "PowerShell board summary");
  assertIncludes(result.stdout, "FormalChecklist=", "PowerShell board summary");
  assertIncludes(result.stdout, "ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics", "PowerShell board summary");
  assertIncludes(result.stdout, "No password was requested or sent", "PowerShell board summary");
  assertNotIncludes(result.stdout, "LAN_DUAL_PASSWORD", "PowerShell board summary");
  console.log("[OK] PowerShell board summary prints secret-free Mac formal checklist commands");
}

async function checkRequireMacHostFailsOnOnlyWindows(windowsPort, args) {
  const result = await run([
    "--boardSummary",
    "--requireMacHost",
    "--noLocalSubnets",
    "--host", "127.0.0.1",
    "--timeoutMs", "250",
    "--port", String(windowsPort),
  ], args);
  assert(result.status !== 0, "requireMacHost should fail when only Windows hosts are found");
  assertIncludes(result.stdout, "no Mac host found", "missing Mac board summary");
  assertIncludes(result.stdout, "Saw 1 non-Mac host", "missing Mac board summary");
  assertIncludes(result.stdout, "No password was requested or sent", "missing Mac board summary");
  console.log("[OK] --requireMacHost fails safely when only non-Mac hosts are found");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  const mac = await startDiscoveryServer(discoveryPayload({
    deviceName: "Mac Host",
    platform: "macos",
    runtime: { buildId: "mac-build", processId: 2222, uptimeSeconds: 4 },
    capabilities: {
      video: true,
      h264Stream: true,
      audio: true,
      audioMode: "system-pcm",
      clipboardText: true,
      clipboardFile: true,
      inputMode: "log",
      maxScreenFps: 30,
    },
  }));
  const windows = await startDiscoveryServer(discoveryPayload({
    deviceName: "Windows Host",
    platform: "windows",
    runtime: { buildId: "win-build", processId: 3333, uptimeSeconds: 5 },
    capabilities: {
      video: true,
      h264Stream: true,
      audio: true,
      audioMode: "wasapi",
      clipboardText: true,
      clipboardFile: true,
      input: { mode: "log" },
      maxScreenFps: 60,
    },
  }));

  try {
    await checkHelp(args);
    await checkPowerShellHelp(args);
    await checkFoundJson(mac.port, windows.port, args);
    await checkPowerShellJson(mac.port, args);
    await checkBoardSummary(mac.port, windows.port, args);
    await checkPowerShellBoardSummary(mac.port, args);
    await checkRequireMacHostFailsOnOnlyWindows(windows.port, args);
    console.log("[OK] Windows LAN discovery self-test passed");
  } finally {
    await stopServer(mac.server);
    await stopServer(windows.server);
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
