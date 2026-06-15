import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMockMacHostServer } from "../../apps/mock-mac-host/server.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const runnerScript = resolve(scriptDir, "check-mac-formal-e2e.mjs");

const defaults = {
  timeoutMs: 30000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-mac-formal-e2e-preflight.mjs [options]

Options:
  --timeoutMs <ms>       Per command timeout. Default: ${defaults.timeoutMs}
  --help, -h             Show this help.

Description:
  Verifies the Windows formal Mac E2E runner's no-password preflight behavior,
  JSON output, password safety guard, and local mock fast path. It never connects
  to a real Mac host and never sends inject.

Examples:
  node scripts/windows/test-mac-formal-e2e-preflight.mjs
`);
}

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Number(next) || defaults.timeoutMs;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(text, expected, label) {
  assert(text.includes(expected), `${label} missing: ${expected}\n${text}`);
}

function assertNotIncludes(text, unexpected, label) {
  assert(!text.includes(unexpected), `${label} leaked unexpected text: ${unexpected}\n${text}`);
}

function assertRunPlanSafe(payload, label, expectations = {}) {
  const plan = payload.runPlan;
  assert(plan && typeof plan === "object", `${label} missing runPlan`);
  assert(plan.requiresPassword === true, `${label} should require a password for the formal run`);
  assert(plan.passwordInCommandArguments === false, `${label} should keep passwords out of argv`);
  assert(plan.passwordTransport === "LAN_DUAL_PASSWORD environment only", `${label} password transport mismatch`);
  assert(plan.inject === false, `${label} should not plan inject`);
  assert(Array.isArray(plan.steps) && plan.steps.length > 0, `${label} should include planned steps`);
  assert(plan.steps.every((step) => typeof step.command === "string" && step.command.startsWith("node ")), `${label} step commands should be displayable node commands`);
  assert(plan.steps.some((step) => step.id === "protocol-media-clipboard-input-log"), `${label} should include the protocol probe`);
  assert(plan.steps.some((step) => step.id === "windows-client-browser-h264"), `${label} should include the browser probe`);
  if (Object.prototype.hasOwnProperty.call(expectations, "audioSkipped")) {
    assert(plan.audio?.skipped === expectations.audioSkipped, `${label} audio skipped mismatch`);
  }
  if (Object.prototype.hasOwnProperty.call(expectations, "clipboardText")) {
    assert(plan.clipboard?.text === expectations.clipboardText, `${label} clipboard text mismatch`);
  }
  if (Object.prototype.hasOwnProperty.call(expectations, "inputMode")) {
    assert(plan.inputMode === expectations.inputMode, `${label} input mode mismatch`);
  }
  const serialized = JSON.stringify(plan);
  assertNotIncludes(serialized, "test-password", label);
  assertNotIncludes(serialized, "demo-password", label);
}

function runRunner(args, { env = {}, timeoutMs = defaults.timeoutMs } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [runnerScript, ...args], {
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
      resolveRun({ exitCode: null, timedOut: false, stdout, stderr: `${stderr}\n${error.message}`.trim() });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({ exitCode, timedOut: false, stdout, stderr });
    });
  });
}

async function withMockHost(fn) {
  const service = createMockMacHostServer({
    host: "127.0.0.1",
    port: 0,
    password: "test-password",
  });
  await service.listen();
  const address = service.server.address();
  try {
    return await fn(Number(address.port));
  } finally {
    await service.close().catch(() => {});
  }
}

async function withFakeLinkBoard(fn) {
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
  const url = `http://127.0.0.1:${address.port}`;
  try {
    return await fn(url, requests);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

async function testOfflinePreflight(args) {
  const result = await runRunner(["--host", "127.0.0.1", "--port", "9", "--preflightOnly"], args);
  assert(result.exitCode !== 0, "offline preflight should fail");
  assertIncludes(result.stdout, "Mac host discovery offline", "offline text preflight");
  assertNotIncludes(result.stdout + result.stderr, "Mac host password", "offline text preflight");
  print("OK", "Offline text preflight fails before password");
}

async function testOfflineJson(args) {
  const result = await runRunner(["--host", "127.0.0.1", "--port", "9", "--preflightOnly", "--json"], args);
  assert(result.exitCode !== 0, "offline JSON preflight should fail");
  const payload = JSON.parse(result.stdout);
  assert(payload.ok === false && payload.online === false, "offline JSON preflight shape mismatch");
  assert(payload.command.includes("--promptPassword"), "offline JSON should include safe command");
  assert(String(payload.boardSummary || "").includes("offline"), "offline JSON should include board summary");
  assertRunPlanSafe(payload, "offline JSON run plan", { audioSkipped: false, clipboardText: true, inputMode: "log" });
  print("OK", "Offline JSON preflight is parseable");
}

async function testOfflineBoardSummary(args) {
  const result = await runRunner(["--host", "127.0.0.1", "--port", "9", "--preflightOnly", "--boardSummary"], args);
  assert(result.exitCode !== 0, "offline board summary preflight should fail");
  assertIncludes(result.stdout, "Windows formal Mac E2E preflight: offline", "offline board summary");
  assertIncludes(result.stdout, "Password was not requested", "offline board summary");
  assertIncludes(result.stdout, "--promptPassword", "offline board summary");
  assertNotIncludes(result.stdout + result.stderr, "Mac host password", "offline board summary");
  print("OK", "Offline board summary is secret-free");
}

async function testOfflineUserAuthRequest(args) {
  const result = await runRunner(["--host", "127.0.0.1", "--port", "9", "--preflightOnly", "--userAuthRequest"], args);
  assert(result.exitCode !== 0, "offline user auth request preflight should fail");
  assertIncludes(result.stdout, "NEED_USER_AUTH:", "offline user auth request");
  assertIncludes(result.stdout, "暂时不要输入正式密码", "offline user auth request");
  assertIncludes(result.stdout, "--checkClientDiagnostics --boardSummary", "offline user auth request");
  assertNotIncludes(result.stdout + result.stderr, "Mac host password", "offline user auth request");
  print("OK", "Offline user auth request points back to preflight");
}

async function testJsonRequiresPreflight(args) {
  const result = await runRunner(["--json", "--host", "127.0.0.1", "--port", "9"], args);
  assert(result.exitCode !== 0, "--json without --preflightOnly should fail");
  assertIncludes(result.stderr, "--json is only supported with --preflightOnly", "json guard");
  print("OK", "JSON guard prevents mixed child-process logs");
}

async function testUserAuthRequestRequiresPreflight(args) {
  const result = await runRunner(["--userAuthRequest", "--host", "127.0.0.1", "--port", "9"], args);
  assert(result.exitCode !== 0, "--userAuthRequest without --preflightOnly should fail");
  assertIncludes(result.stderr, "--userAuthRequest is only supported with --preflightOnly", "user auth guard");
  print("OK", "User auth request guard prevents accidental formal run");
}

async function testSendUserAuthRequestRequiresPreflight(args) {
  const result = await runRunner(["--sendUserAuthRequest", "--host", "127.0.0.1", "--port", "9"], args);
  assert(result.exitCode !== 0, "--sendUserAuthRequest without --preflightOnly should fail");
  assertIncludes(result.stderr, "--sendUserAuthRequest is only supported with --preflightOnly", "send user auth guard");
  print("OK", "Send user auth request guard prevents accidental formal run");
}

async function testMockPreflightJson(args) {
  await withMockHost(async (port) => {
    const result = await runRunner([
      "--host", "127.0.0.1",
      "--port", String(port),
      "--preflightOnly",
      "--json",
      "--allowMockVideo",
      "--skipInputLog",
      "--skipAudio",
      "--skipClipboard",
    ], args);
    assert(result.exitCode === 0, `mock preflight JSON failed\n${result.stdout}\n${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert(payload.ok === true && payload.online === true, "mock preflight JSON shape mismatch");
    assert(payload.capabilities.mock === true, "mock preflight should identify mock host");
    assert(payload.command.includes("--promptPassword"), "mock preflight should include safe command");
    assert(String(payload.boardSummary || "").includes("failedChecks=none"), "mock preflight JSON should include board summary");
    assert(String(payload.userAuthRequest || "").includes("NEED_USER_AUTH:"), "mock preflight JSON should include user auth request");
    assertRunPlanSafe(payload, "mock JSON run plan", { audioSkipped: true, clipboardText: false, inputMode: "skipped" });
    assert(payload.runPlan.video?.allowMockVideo === true, "mock JSON run plan should mark mock video allowed");
    print("OK", "Mock JSON preflight passes");
  });
}

async function testDiscoverMockPreflightJson(args) {
  await withMockHost(async (port) => {
    const result = await runRunner([
      "--discover",
      "--discoverNoLocalSubnets",
      "--host", "127.0.0.1",
      "--port", String(port),
      "--preflightOnly",
      "--json",
      "--allowMockVideo",
      "--skipInputLog",
      "--skipAudio",
      "--skipClipboard",
    ], args);
    assert(result.exitCode === 0, `discover mock preflight JSON failed\n${result.stdout}\n${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert(payload.ok === true && payload.online === true, "discover mock preflight JSON shape mismatch");
    assert(payload.target.host === "127.0.0.1", "discover mock preflight should target localhost");
    assert(payload.target.port === port, "discover mock preflight should target discovered port");
    assert(payload.discoverySelection?.requested === true, "discover selection should be requested");
    assert(payload.discoverySelection?.ok === true, "discover selection should pass");
    assert(payload.discoverySelection?.source === "discover-lan-hosts", "discover selection source mismatch");
    assert(payload.discoverySelection?.foundMacHosts >= 1, "discover selection should report Mac hosts");
    assert(payload.command.includes(`--port ${port}`), "safe command should use discovered port");
    assertRunPlanSafe(payload, "discover mock JSON run plan", { audioSkipped: true, clipboardText: false, inputMode: "skipped" });
    assertNotIncludes(result.stdout + result.stderr, "test-password", "discover mock JSON");
    print("OK", "Discovery-backed mock JSON preflight selects the Mac host");
  });
}

async function testDiscoverOfflineJson(args) {
  const result = await runRunner([
    "--discover",
    "--discoverNoLocalSubnets",
    "--host", "127.0.0.1",
    "--port", "9",
    "--preflightOnly",
    "--json",
  ], args);
  assert(result.exitCode !== 0, "discover offline JSON should fail");
  const payload = JSON.parse(result.stdout);
  assert(payload.ok === false && payload.online === false, "discover offline JSON shape mismatch");
  assert(payload.discoverySelection?.requested === true, "discover offline should include discovery selection");
  assert(payload.discoverySelection?.ok === false, "discover offline selection should fail");
  assert(String(payload.discoverySelection?.error?.message || "").includes("no Mac host found"), "discover offline should explain missing Mac host");
  assertNotIncludes(result.stdout + result.stderr, "Mac host password", "discover offline JSON");
  print("OK", "Discovery-backed offline preflight fails before password");
}

async function testMockPreflightBoardSummary(args) {
  await withMockHost(async (port) => {
    const result = await runRunner([
      "--host", "127.0.0.1",
      "--port", String(port),
      "--preflightOnly",
      "--boardSummary",
      "--allowMockVideo",
      "--skipInputLog",
      "--skipAudio",
      "--skipClipboard",
    ], args);
    assert(result.exitCode === 0, `mock preflight board summary failed\n${result.stdout}\n${result.stderr}`);
    assertIncludes(result.stdout, "Windows formal Mac E2E preflight: ready", "mock board summary");
    assertIncludes(result.stdout, "failedChecks=none", "mock board summary");
    assertIncludes(result.stdout, "Password is not included", "mock board summary");
    assertNotIncludes(result.stdout + result.stderr, "test-password", "mock board summary");
    print("OK", "Mock board summary passes without leaking password");
  });
}

async function testMockPreflightUserAuthRequest(args) {
  await withMockHost(async (port) => {
    const result = await runRunner([
      "--host", "127.0.0.1",
      "--port", String(port),
      "--preflightOnly",
      "--userAuthRequest",
      "--allowMockVideo",
      "--skipInputLog",
      "--skipAudio",
      "--skipClipboard",
    ], args);
    assert(result.exitCode === 0, `mock preflight user auth request failed\n${result.stdout}\n${result.stderr}`);
    assertIncludes(result.stdout, "NEED_USER_AUTH:", "mock user auth request");
    assertIncludes(result.stdout, "--promptPassword", "mock user auth request");
    assertIncludes(result.stdout, "不要把密码发到联络板", "mock user auth request");
    assertIncludes(result.stdout, "inject", "mock user auth request");
    assertNotIncludes(result.stdout + result.stderr, "test-password", "mock user auth request");
    print("OK", "Mock user auth request is secret-free");
  });
}

async function testOfflineSendUserAuthRequestDoesNotPost(args) {
  await withFakeLinkBoard(async (serverUrl, requests) => {
    const result = await runRunner([
      "--host", "127.0.0.1",
      "--port", "9",
      "--preflightOnly",
      "--sendUserAuthRequest",
      "--server", serverUrl,
    ], args);
    assert(result.exitCode !== 0, "offline send user auth request should fail");
    assertIncludes(result.stdout, "NEED_USER_AUTH:", "offline send user auth request");
    assertIncludes(result.stdout, "暂时不要输入正式密码", "offline send user auth request");
    assert(requests.length === 0, `offline send user auth request should not post, got ${requests.length}`);
    assertNotIncludes(result.stdout + result.stderr, "Mac host password", "offline send user auth request");
    print("OK", "Offline send user auth request does not post to Agent Link Board");
  });
}

async function testMockPreflightSendUserAuthRequest(args) {
  await withMockHost(async (port) => {
    await withFakeLinkBoard(async (serverUrl, requests) => {
      const result = await runRunner([
        "--host", "127.0.0.1",
        "--port", String(port),
        "--preflightOnly",
        "--sendUserAuthRequest",
        "--server", serverUrl,
        "--allowMockVideo",
        "--skipInputLog",
        "--skipAudio",
        "--skipClipboard",
      ], args);
      assert(result.exitCode === 0, `mock preflight send user auth request failed\n${result.stdout}\n${result.stderr}`);
      assertIncludes(result.stdout, "NEED_USER_AUTH:", "mock send user auth request");
      assert(requests.length === 1, `mock send user auth request should post once, got ${requests.length}`);
      assert(requests[0].method === "POST", "mock send should POST");
      assert(requests[0].path === "/api/message", `mock send path mismatch: ${requests[0].path}`);
      assert(requests[0].body.from === "Windows Codex", "mock send from mismatch");
      assert(String(requests[0].body.text || "").includes("NEED_USER_AUTH:"), "mock send text missing auth request");
      assert(String(requests[0].body.text || "").includes("--promptPassword"), "mock send text missing safe formal command");
      assertNotIncludes(JSON.stringify(requests[0].body), "test-password", "mock send user auth request body");
      assertNotIncludes(result.stdout + result.stderr, "test-password", "mock send user auth request output");
      print("OK", "Mock send user auth request posts a secret-free Agent Link Board message");
    });
  });
}

async function testMockPreflightClientDiagnostics(args) {
  await withMockHost(async (port) => {
    const result = await runRunner([
      "--host", "127.0.0.1",
      "--port", String(port),
      "--preflightOnly",
      "--json",
      "--checkClientDiagnostics",
      "--allowMockVideo",
      "--skipInputLog",
      "--skipAudio",
      "--skipClipboard",
    ], { ...args, timeoutMs: Math.max(args.timeoutMs, 70000) });
    assert(result.exitCode === 0, `mock preflight client diagnostics failed\n${result.stdout}\n${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert(payload.clientDiagnostics?.requested === true, "client diagnostics should be requested");
    assert(payload.clientDiagnostics?.ok === true, "client diagnostics should pass");
    assert(String(payload.boardSummary || "").includes("clientDiagnostics=passed"), "board summary should include client diagnostics state");
    assert(payload.checks.some((check) => check.name === "windowsClientDiagnostics" && check.ok === true), "checks should include client diagnostics");
    assertRunPlanSafe(payload, "mock client diagnostics run plan", { audioSkipped: true, clipboardText: false, inputMode: "skipped" });
    assertNotIncludes(result.stdout + result.stderr, "test-password", "mock client diagnostics");
    print("OK", "Mock client diagnostics preflight passes without leaking password");
  });
}

async function testMockRequiresPasswordAfterPreflight(args) {
  await withMockHost(async (port) => {
    const result = await runRunner([
      "--host", "127.0.0.1",
      "--port", String(port),
      "--allowMockVideo",
      "--skipInputLog",
      "--skipAudio",
      "--skipClipboard",
      "--skipBrowser",
    ], args);
    assert(result.exitCode !== 0, "mock runner without password should fail after preflight");
    assertIncludes(result.stderr, "Refusing to use demo-password", "password guard");
    print("OK", "Password guard runs after successful preflight");
  });
}

async function testMockFastPath(args) {
  await withMockHost(async (port) => {
    const result = await runRunner([
      "--host", "127.0.0.1",
      "--port", String(port),
      "--allowMockVideo",
      "--videoDurationMs", "800",
      "--minVideoFrames", "2",
      "--skipInputLog",
      "--skipAudio",
      "--skipBrowser",
      "--boardSummary",
    ], {
      ...args,
      env: { LAN_DUAL_PASSWORD: "test-password" },
    });
    assert(result.exitCode === 0, `mock fast path failed\n${result.stdout}\n${result.stderr}`);
    assertIncludes(result.stdout, "Formal Mac E2E checks finished", "mock fast path");
    assertIncludes(result.stdout, "Windows formal Mac E2E finished: completed", "mock fast path");
    assertIncludes(result.stdout, "Clipboard file accepted", "mock fast path");
    assertNotIncludes(result.stdout + result.stderr, "test-password", "mock fast path");
    print("OK", "Mock fast path passes without leaking password");
  });
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }

  const args = parseArgs(process.argv);
  await testOfflinePreflight(args);
  await testOfflineJson(args);
  await testOfflineBoardSummary(args);
  await testOfflineUserAuthRequest(args);
  await testJsonRequiresPreflight(args);
  await testUserAuthRequestRequiresPreflight(args);
  await testSendUserAuthRequestRequiresPreflight(args);
  await testMockPreflightJson(args);
  await testMockPreflightBoardSummary(args);
  await testMockPreflightUserAuthRequest(args);
  await testOfflineSendUserAuthRequestDoesNotPost(args);
  await testMockPreflightSendUserAuthRequest(args);
  await testMockPreflightClientDiagnostics(args);
  await testDiscoverMockPreflightJson(args);
  await testDiscoverOfflineJson(args);
  await testMockRequiresPasswordAfterPreflight(args);
  await testMockFastPath(args);
  print("OK", "Windows formal E2E preflight regression passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
