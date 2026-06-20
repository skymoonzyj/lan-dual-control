#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/check-mac-input-safety-status.mjs";

const defaults = {
  timeoutMs: 8000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-input-safety-status.mjs [options]

Verifies the read-only Mac real-input safety status gate. The test uses fake
/discovery servers only and never starts Mac host, requests passwords, sends
input events, or enables inject mode.

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
      args.timeoutMs = Math.max(1000, Number(next) || defaults.timeoutMs);
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
  assert(String(text || "").includes(expected), `${label} did not include ${JSON.stringify(expected)}.\n${text}`);
}

function assertNotIncludes(text, expected, label) {
  assert(!String(text || "").includes(expected), `${label} unexpectedly included ${JSON.stringify(expected)}.\n${text}`);
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function run(extraArgs, args) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "super-secret-input-safety-status",
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
        LAN_DUAL_PASSWORD: "super-secret-input-safety-status",
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

function outputOf(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

function assertSafeOutput(text, label) {
  for (const forbidden of [
    "super-secret-input-safety-status",
    "LAN_DUAL_PASSWORD",
    "--password",
    "input_event",
    "sudo",
    "launchctl",
    "osascript -e",
  ]) {
    assertNotIncludes(text, forbidden, label);
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

async function withFakeMacHost(discoveryPayload, callback) {
  const server = createServer((request, response) => {
    if (request.url !== "/discovery") {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(discoveryPayload));
  });
  await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    await callback({ host: "127.0.0.1", port });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function withFakeAgentLinkBoard(state, callback) {
  const server = createServer((request, response) => {
    if (request.url !== "/api/state") {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(state));
  });
  await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function baseDiscovery(overrides = {}) {
  return {
    platform: "macos",
    role: "host",
    deviceName: "Fake Mac",
    inputMode: "log",
    permissions: {
      screenRecording: true,
      accessibility: true,
      inputMonitoring: true,
    },
    capabilities: {
      inputMode: "log",
      input: { mode: "log" },
    },
    runtime: {
      buildId: "fake-build",
    },
    ...overrides,
  };
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0\n${outputOf(result)}`);
    assertIncludes(result.stdout, "Usage:", `${script} ${flag}`);
    assertIncludes(result.stdout, "--boardSummary", `${script} ${flag}`);
    assertIncludes(result.stdout, "--confirmUserWatching", `${script} ${flag}`);
    assertSafeOutput(outputOf(result), `${script} ${flag}`);
  }
  print("OK", "Mac input safety status help is pure and safe");
}

async function checkOfflineBlocked(args) {
  const port = await getFreePort();
  const result = run(["--json", "--host", "127.0.0.1", "--port", String(port), "--timeoutMs", "500"], args);
  const payload = parseJson(result.stdout, "offline input safety JSON");
  assert(result.status !== 0, `offline input safety should exit non-zero\n${outputOf(result)}`);
  assert(payload.status === "blocked", "offline JSON should be blocked");
  assert(payload.reason === "host-offline", "offline JSON should explain host-offline");
  assert(payload.readyForUserWatchedInject === false, "offline JSON should not be ready for user-watched inject");
  assert(payload.safety?.noInputEventsSent === true, "offline JSON should mark no input events sent");
  assertSafeOutput(outputOf(result), "offline input safety JSON");

  const summary = run(["--boardSummary", "--host", "127.0.0.1", "--port", String(port), "--timeoutMs", "500"], args);
  assert(summary.status !== 0, `offline boardSummary should exit non-zero\n${outputOf(summary)}`);
  assertIncludes(summary.stdout, "MacInputSafetyStatus=blocked", "offline boardSummary");
  assertIncludes(summary.stdout, "reason=host-offline", "offline boardSummary");
  assertSafeOutput(outputOf(summary), "offline input safety boardSummary");
  print("OK", "Offline Mac input safety status is blocked and secret-free");
}

async function checkReadyLogMode(args) {
  await withFakeMacHost(baseDiscovery(), async ({ host, port }) => {
    const result = await runAsync(["--json", "--host", host, "--port", String(port), "--timeoutMs", "1000"], args);
    const payload = parseJson(result.stdout, "ready input safety JSON");
    assert(result.status === 0, `ready input safety should exit 0\n${outputOf(result)}`);
    assert(payload.status === "ready", "ready JSON should expose ready status");
    assert(payload.reason === "log-mode-permissions-ok", "ready JSON should explain log-mode-permissions-ok");
    assert(payload.host?.inputMode === "log", "ready JSON should expose inputMode=log");
    assert(payload.readyForUserWatchedInject === true, "ready JSON should allow user-watched inject path");
    assert(payload.gates?.requiresUserWatching === true, "ready JSON should require user watching");
    assert(payload.gates?.requiredFlag === "--confirmUserWatching", "ready JSON should expose required confirmation flag");
    assert(payload.gates?.firstEventSet === "safe", "ready JSON should expose safe first event set");
    assertSafeOutput(outputOf(result), "ready input safety JSON");

    const summary = await runAsync(["--boardSummary", "--host", host, "--port", String(port), "--timeoutMs", "1000"], args);
    assert(summary.status === 0, `ready boardSummary should exit 0\n${outputOf(summary)}`);
    assertIncludes(summary.stdout, "MacInputSafetyStatus=ready", "ready boardSummary");
    assertIncludes(summary.stdout, "reason=log-mode-permissions-ok", "ready boardSummary");
    assertIncludes(summary.stdout, "inputMode=log", "ready boardSummary");
    assertIncludes(summary.stdout, "realInput=blocked-until-user-watching", "ready boardSummary");
    assertIncludes(summary.stdout, "required=--confirmUserWatching", "ready boardSummary");
    assertIncludes(summary.stdout, "eventSet=safe", "ready boardSummary");
    assertSafeOutput(outputOf(summary), "ready input safety boardSummary");
  });
  print("OK", "Log-mode Mac host with permissions is ready for user-watched inject gate");
}

async function checkBoardUserPresencePresentAllowsExplainedInject(args) {
  await withFakeMacHost(baseDiscovery(), async ({ host, port }) => {
    await withFakeAgentLinkBoard({
      userPresence: {
        status: "present",
        label: "user present",
        reason: "user can approve supervised tasks",
        updatedAt: "2026-06-20T10:30:00.000Z",
        updatedBy: "Supervisor",
      },
    }, async (serverUrl) => {
      const result = await runAsync([
        "--json",
        "--host",
        host,
        "--port",
        String(port),
        "--timeoutMs",
        "1000",
        "--checkBoard",
        "--server",
        serverUrl,
      ], args);
      const payload = parseJson(result.stdout, "present user input safety JSON");
      assert(result.status === 0, `present user input safety should exit 0\n${outputOf(result)}`);
      assert(payload.status === "ready", "present user JSON should stay technically ready");
      assert(payload.userPresence?.status === "present", `present user JSON should expose userPresence: ${JSON.stringify(payload.userPresence)}`);
      assert(payload.userPresence?.source === "api-state", "present user JSON should mark api-state source");
      assert(payload.macInputSafetyAction?.id === "explain-before-inject", `present user JSON action mismatch: ${JSON.stringify(payload.macInputSafetyAction)}`);
      assertIncludes(payload.boardSummary, "UserPresence=present", "present user boardSummary");
      assertIncludes(payload.boardSummary, "source=api-state", "present user boardSummary");
      assertIncludes(payload.boardSummary, "MacInputSafetyAction=explain-before-inject", "present user boardSummary");
      assertIncludes(payload.boardSummary, "MacSafeInjectRehearsal=node scripts/mac/plan-mac-safe-inject-rehearsal.mjs", "present user boardSummary");
      assertIncludes(payload.boardSummary, "--checkBoard", "present user boardSummary");
      assertIncludes(payload.boardSummary, "--boardSummary", "present user boardSummary");
      assertSafeOutput(outputOf(result), "present user input safety JSON");
    });
  });
  print("OK", "Structured userPresence=present allows only an explained user-watched inject plan");
}

async function checkBoardUserPresenceAwayBlocksInject(args) {
  await withFakeMacHost(baseDiscovery(), async ({ host, port }) => {
    await withFakeAgentLinkBoard({
      userPresence: {
        status: "away",
        label: "user away",
        reason: "user cannot approve supervised tasks",
        updatedAt: "2026-06-20T10:31:00.000Z",
        updatedBy: "Supervisor",
      },
    }, async (serverUrl) => {
      const result = await runAsync([
        "--json",
        "--host",
        host,
        "--port",
        String(port),
        "--timeoutMs",
        "1000",
        "--checkBoard",
        "--server",
        serverUrl,
      ], args);
      const payload = parseJson(result.stdout, "away user input safety JSON");
      assert(result.status !== 0, `away user input safety should exit non-zero\n${outputOf(result)}`);
      assert(payload.status === "blocked", `away user JSON should be blocked, got ${payload.status}`);
      assert(payload.reason === "user-away", `away user JSON reason mismatch: ${payload.reason}`);
      assert(payload.readyForUserWatchedInject === false, "away user JSON should not allow user-watched inject path");
      assert(payload.blockers?.includes("user-away"), `away user JSON should include user-away blocker: ${JSON.stringify(payload.blockers)}`);
      assert(payload.userPresence?.status === "away", `away user JSON should expose userPresence: ${JSON.stringify(payload.userPresence)}`);
      assert(payload.macInputSafetyAction?.id === "no-auth-only", `away user JSON action mismatch: ${JSON.stringify(payload.macInputSafetyAction)}`);
      assertIncludes(payload.macInputSafetyAction?.blocker || "", "BLOCKED_BY_USER_AWAY", "away user action blocker");
      assertIncludes(payload.boardSummary, "MacInputSafetyStatus=blocked", "away user boardSummary");
      assertIncludes(payload.boardSummary, "reason=user-away", "away user boardSummary");
      assertIncludes(payload.boardSummary, "UserPresence=away", "away user boardSummary");
      assertIncludes(payload.boardSummary, "MacInputSafetyAction=no-auth-only", "away user boardSummary");
      assertIncludes(payload.boardSummary, "BLOCKED_BY_USER_AWAY", "away user boardSummary");
      assertSafeOutput(outputOf(result), "away user input safety JSON");
    });
  });
  print("OK", "Structured userPresence=away blocks real-input inject planning");
}

async function checkPermissionBlocker(args) {
  await withFakeMacHost(baseDiscovery({
    permissions: {
      screenRecording: true,
      accessibility: false,
      inputMonitoring: false,
    },
  }), async ({ host, port }) => {
    const result = await runAsync(["--json", "--host", host, "--port", String(port), "--timeoutMs", "1000"], args);
    const payload = parseJson(result.stdout, "permission input safety JSON");
    assert(result.status !== 0, `permission blocker should exit non-zero\n${outputOf(result)}`);
    assert(payload.status === "blocked", "permission JSON should be blocked");
    assert(payload.reason === "permissions", "permission JSON should explain permissions");
    assert(payload.blockers.includes("accessibility"), "permission JSON should include accessibility blocker");
    assert(payload.blockers.includes("input-monitoring"), "permission JSON should include input-monitoring blocker");
    assert(payload.readyForUserWatchedInject === false, "permission JSON should not be ready for inject");
    assertSafeOutput(outputOf(result), "permission input safety JSON");
  });
  print("OK", "Missing Accessibility/Input Monitoring blocks real-input readiness");
}

async function checkInjectActiveFailsClosed(args) {
  await withFakeMacHost(baseDiscovery({
    inputMode: "inject",
    capabilities: {
      inputMode: "inject",
      input: { mode: "inject" },
    },
  }), async ({ host, port }) => {
    const result = await runAsync(["--json", "--host", host, "--port", String(port), "--timeoutMs", "1000"], args);
    const payload = parseJson(result.stdout, "inject-active input safety JSON");
    assert(result.status !== 0, `inject-active should exit non-zero\n${outputOf(result)}`);
    assert(payload.status === "blocked", "inject-active JSON should be blocked");
    assert(payload.reason === "inject-active", "inject-active JSON should explain inject-active");
    assert(payload.readyForUserWatchedInject === false, "inject-active JSON should fail closed without a fresh user-watching assertion");
    assertIncludes(payload.nextAction || "", "return-to-log", "inject-active JSON next action");
    assertSafeOutput(outputOf(result), "inject-active input safety JSON");
  });
  print("OK", "Already-inject Mac host fails closed without fresh user-watching proof");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  checkHelp(args);
  await checkOfflineBlocked(args);
  await checkReadyLogMode(args);
  await checkBoardUserPresencePresentAllowsExplainedInject(args);
  await checkBoardUserPresenceAwayBlocksInject(args);
  await checkPermissionBlocker(args);
  await checkInjectActiveFailsClosed(args);
  print("OK", "Mac input safety status self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
