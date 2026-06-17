import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createMockMacHostServer } from "../../apps/mock-mac-host/server.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const wrapperScript = "scripts/windows/check-mac-formal-e2e.ps1";

const defaults = {
  timeoutMs: 30000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-mac-formal-e2e-powershell.mjs [options]

Options:
  --timeoutMs <ms>  Per PowerShell wrapper timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Description:
  Verifies check-mac-formal-e2e.ps1 safely wraps the Node formal E2E runner for
  discovery preflight and local mock formal checks. It never connects to a real
  Mac host, never sends a real password, and never executes inject.
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
      args.timeoutMs = Math.max(10000, Number(next) || defaults.timeoutMs);
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

function assertRunPlanSafe(payload, label) {
  const plan = payload.runPlan;
  assert(plan && typeof plan === "object", `${label} missing runPlan`);
  assert(plan.requiresPassword === true, `${label} should require a password for formal runs`);
  assert(plan.passwordInCommandArguments === false, `${label} should keep password out of argv`);
  assert(plan.passwordTransport === "LAN_DUAL_PASSWORD environment only", `${label} password transport mismatch`);
  assert(plan.inject === false, `${label} should not plan inject`);
  assert(Array.isArray(plan.steps) && plan.steps.length > 0, `${label} should include steps`);
  const serialized = JSON.stringify(plan);
  assertNotIncludes(serialized, "test-password", label);
  assertNotIncludes(serialized, "demo-password", label);
}

function runPowerShell(extraArgs, { env = {}, timeoutMs = defaults.timeoutMs } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      wrapperScript,
      ...extraArgs,
    ], {
      cwd: repoRoot,
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: "",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({ exitCode: null, timedOut: true, stdout, stderr });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({
        exitCode: null,
        timedOut: false,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({ exitCode, timedOut: false, stdout, stderr });
    });
  });
}

async function withMockHost(callback) {
  const service = createMockMacHostServer({
    host: "127.0.0.1",
    port: 0,
    password: "test-password",
  });
  await service.listen();
  const address = service.server.address();
  try {
    await callback(Number(address.port));
  } finally {
    await service.close().catch(() => {});
  }
}

async function withFakeLinkBoard(callback) {
  const requests = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      let parsed = {};
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch (error) {
        parsed = { parseError: error.message, raw: body };
      }
      requests.push({
        method: request.method,
        path: request.url,
        body: parsed,
      });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`, requests);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

async function checkWrapperHelp(args) {
  const result = await runPowerShell(["-Help"], args);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.exitCode === 0, `PowerShell wrapper help failed\n${output}`);
  assertIncludes(output, "Usage:", "PowerShell wrapper help");
  assertIncludes(output, "-Discover -PreflightOnly -BoardSummary", "PowerShell wrapper help");
  assertIncludes(output, "-SendUserAuthRequest", "PowerShell wrapper help");
  assertIncludes(output, "runPlan.manualChecklist", "PowerShell wrapper help");
  assertIncludes(output, "ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics", "PowerShell wrapper help");
  assertIncludes(output, "-CheckClientDiagnostics", "PowerShell wrapper help");
  assertIncludes(output, "-PromptPassword", "PowerShell wrapper help");
  console.log("[OK] PowerShell formal E2E wrapper help is safe");
}

async function checkDiscoverMockPreflightJson(args) {
  await withMockHost(async (port) => {
    const result = await runPowerShell([
      "-Discover",
      "-DiscoverNoLocalSubnets",
      "-Port", String(port),
      "-PreflightOnly",
      "-Json",
      "-AllowMockVideo",
      "-SkipInputLog",
      "-SkipAudio",
      "-SkipClipboard",
    ], args);
    const output = `${result.stdout}\n${result.stderr}`;
    assert(result.exitCode === 0, `PowerShell discover preflight failed\n${output}`);
    const payload = JSON.parse(result.stdout);
    assert(payload.ok === true && payload.online === true, "PowerShell discover preflight shape mismatch");
    assert(payload.discoverySelection?.requested === true, "discovery selection should be requested");
    assert(payload.discoverySelection?.ok === true, "discovery selection should pass");
    assert(payload.target.host === "127.0.0.1", "preflight should target localhost");
    assert(payload.target.port === port, "preflight should target discovered mock port");
    assert(payload.command.includes(`--port ${port}`), "safe command should use discovered port");
    assertRunPlanSafe(payload, "PowerShell discover preflight");
    assertNotIncludes(output, "test-password", "PowerShell discover preflight");
    console.log("[OK] PowerShell formal E2E wrapper supports discovery JSON preflight");
  });
}

async function checkDiscoverOfflineBeforePassword(args) {
  const result = await runPowerShell([
    "-Discover",
    "-DiscoverNoLocalSubnets",
    "-Port", "9",
    "-PreflightOnly",
    "-Json",
    "-PromptPassword",
    "-RequirePassword",
  ], args);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.exitCode !== 0, "offline discover preflight should fail");
  const payload = JSON.parse(result.stdout);
  assert(payload.ok === false && payload.online === false, "offline discover preflight shape mismatch");
  assert(payload.discoverySelection?.requested === true, "offline selection should be requested");
  assert(payload.discoverySelection?.ok === false, "offline selection should fail");
  assertNotIncludes(output, "Mac host password", "offline discover preflight");
  assertNotIncludes(output, "--promptPassword requires an interactive terminal", "offline discover preflight");
  console.log("[OK] PowerShell formal E2E wrapper discovery fails before password prompts");
}

async function checkMockFastFormalPath(args) {
  await withMockHost(async (port) => {
    const result = await runPowerShell([
      "-HostName", "127.0.0.1",
      "-Port", String(port),
      "-AllowDemoPassword",
      "-AllowMockVideo",
      "-SkipInputLog",
      "-SkipAudio",
      "-SkipBrowser",
      "-BoardSummary",
      "-VideoDurationMs", "800",
      "-MinVideoFrames", "2",
    ], {
      ...args,
      env: { LAN_DUAL_PASSWORD: "test-password" },
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert(result.exitCode === 0, `PowerShell mock fast formal path failed\n${output}`);
    assertIncludes(output, "Formal Mac E2E checks finished", "PowerShell mock fast path");
    assertIncludes(output, "Windows formal Mac E2E finished: completed", "PowerShell mock fast path");
    assertIncludes(output, "Clipboard file accepted", "PowerShell mock fast path");
    assertNotIncludes(output, "test-password", "PowerShell mock fast path");
    console.log("[OK] PowerShell formal E2E wrapper drives the mock fast formal path");
  });
}

async function checkMockSendUserAuthRequest(args) {
  await withMockHost(async (port) => {
    await withFakeLinkBoard(async (serverUrl, requests) => {
      const result = await runPowerShell([
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-PreflightOnly",
        "-SendUserAuthRequest",
        "-Server", serverUrl,
        "-AllowMockVideo",
        "-SkipInputLog",
        "-SkipAudio",
        "-SkipClipboard",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell send user auth request failed\n${output}`);
      assertIncludes(output, "NEED_USER_AUTH:", "PowerShell send user auth request");
      assert(requests.length === 1, `PowerShell send user auth request should post once, got ${requests.length}`);
      assert(requests[0].method === "POST", "PowerShell send should POST");
      assert(requests[0].path === "/api/message", `PowerShell send path mismatch: ${requests[0].path}`);
      assert(String(requests[0].body.text || "").includes("NEED_USER_AUTH:"), "PowerShell send body missing auth request");
      assertNotIncludes(JSON.stringify(requests[0].body), "test-password", "PowerShell send user auth request body");
      assertNotIncludes(output, "test-password", "PowerShell send user auth request");
      console.log("[OK] PowerShell formal E2E wrapper sends secret-free user auth request");
    });
  });
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  await checkWrapperHelp(args);
  await checkDiscoverMockPreflightJson(args);
  await checkDiscoverOfflineBeforePassword(args);
  await checkMockSendUserAuthRequest(args);
  await checkMockFastFormalPath(args);
  console.log("[OK] PowerShell formal E2E wrapper regression passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
