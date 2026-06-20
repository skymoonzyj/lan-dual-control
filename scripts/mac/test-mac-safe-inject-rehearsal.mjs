#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/plan-mac-safe-inject-rehearsal.mjs";

const defaults = {
  timeoutMs: 8000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-safe-inject-rehearsal.mjs [options]

Verifies the read-only Mac safe inject rehearsal planner. The test uses fake
/discovery and Agent Link Board servers only; it never starts Mac host,
prompts for passwords, authenticates, sends input events, or enables inject.

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
      LAN_DUAL_PASSWORD: "super-secret-safe-inject-rehearsal",
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
        LAN_DUAL_PASSWORD: "super-secret-safe-inject-rehearsal",
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
    "super-secret-safe-inject-rehearsal",
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

function presentBoardState() {
  return {
    userPresence: {
      status: "present",
      label: "user present",
      reason: "user can approve supervised tasks",
      updatedAt: "2026-06-20T10:45:00.000Z",
      updatedBy: "Supervisor",
    },
  };
}

function awayBoardState() {
  return {
    userPresence: {
      status: "away",
      label: "user away",
      reason: "user cannot approve supervised tasks",
      updatedAt: "2026-06-20T10:46:00.000Z",
      updatedBy: "Supervisor",
    },
  };
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0\n${outputOf(result)}`);
    assertIncludes(result.stdout, "Usage:", `${script} ${flag}`);
    assertIncludes(result.stdout, "--checkBoard", `${script} ${flag}`);
    assertIncludes(result.stdout, "--confirmUserWatching", `${script} ${flag}`);
    assertIncludes(result.stdout, "plan-only", `${script} ${flag}`);
    assertSafeOutput(outputOf(result), `${script} ${flag}`);
  }
  print("OK", "Mac safe inject rehearsal help is pure and safe");
}

async function checkPresentReadyPrintsPlanOnlyCommands(args) {
  await withFakeMacHost(baseDiscovery(), async ({ host, port }) => {
    await withFakeAgentLinkBoard(presentBoardState(), async (serverUrl) => {
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
      const payload = parseJson(result.stdout, "ready rehearsal JSON");
      assert(result.status === 0, `ready rehearsal should exit 0\n${outputOf(result)}`);
      assert(payload.status === "call-ready", `ready rehearsal status mismatch: ${payload.status}`);
      assert(payload.reason === "log-mode-permissions-ok", `ready rehearsal reason mismatch: ${payload.reason}`);
      assert(payload.planOnly === true, "ready rehearsal should be plan-only");
      assert(payload.userPresence?.status === "present", "ready rehearsal should expose userPresence=present");
      assert(payload.safeEventSet === "safe", "ready rehearsal should expose safe event set");
      assert(payload.requiresUserWatching === true, "ready rehearsal should require user watching");
      assert(payload.userNotice?.goal === "verify-real-mac-input-safe-event-set", `ready rehearsal should expose notice goal: ${JSON.stringify(payload.userNotice)}`);
      assert(payload.userNotice?.userAction === "watch-mac-screen-and-be-ready-to-take-over", `ready rehearsal should expose notice user action: ${JSON.stringify(payload.userNotice)}`);
      assert(payload.userNotice?.safetyBoundary === "safe-event-set-only-no-click-delete-shortcuts-return-log", `ready rehearsal should expose notice boundary: ${JSON.stringify(payload.userNotice)}`);
      assert(payload.userNotice?.estimatedDuration === "2-3-minutes", `ready rehearsal should expose notice duration: ${JSON.stringify(payload.userNotice)}`);
      assert(payload.commands?.macStartInject?.includes("--confirmUserWatching"), "ready rehearsal should include confirmation flag");
      assert(payload.commands?.macStartInject?.includes("--inputMode inject"), "ready rehearsal should include inject start command");
      assert(payload.commands?.windowsProbeSafe?.includes("--inputEvents"), "ready rehearsal should include Windows safe probe command");
      assert(payload.commands?.windowsProbeSafe?.includes("--inputEventSet safe"), "ready rehearsal should require safe event set");
      assert(payload.commands?.windowsProbeSafe?.includes("--expectInputMode inject"), "ready rehearsal should expect inject mode");
      assert(payload.commands?.windowsProbeSafe?.includes("--expectInputInjected true"), "ready rehearsal should expect injected=true ack");
      assert(payload.commands?.macReturnLog?.includes("--inputMode log"), "ready rehearsal should include return-to-log command");
      assertIncludes(payload.boardSummary, "MacSafeInjectRehearsal=status=call-ready", "ready boardSummary");
      assertIncludes(payload.boardSummary, "UserPresence=present", "ready boardSummary");
      assertIncludes(payload.boardSummary, "eventSet=safe", "ready boardSummary");
      assertIncludes(payload.boardSummary, "UserNoticeGoal=verify-real-mac-input-safe-event-set", "ready boardSummary");
      assertIncludes(payload.boardSummary, "UserNoticeAction=watch-mac-screen-and-be-ready-to-take-over", "ready boardSummary");
      assertIncludes(payload.boardSummary, "UserNoticeBoundary=safe-event-set-only-no-click-delete-shortcuts-return-log", "ready boardSummary");
      assertIncludes(payload.boardSummary, "UserNoticeDuration=2-3-minutes", "ready boardSummary");
      assertIncludes(payload.boardSummary, "MacSafeInjectStart=", "ready boardSummary");
      assertIncludes(payload.boardSummary, "WindowsSafeInjectProbe=", "ready boardSummary");
      assertIncludes(payload.boardSummary, "MacSafeInjectReturnLog=", "ready boardSummary");
      assertIncludes(payload.boardSummary, "Safety=plan-only,no-password,no-auth-now,no-input-now,no-inject-now", "ready boardSummary");
      assertSafeOutput(outputOf(result), "ready rehearsal JSON");
    });
  });
  print("OK", "User-present log-mode host prints plan-only safe inject rehearsal commands");
}

async function checkAwayBlocksCommands(args) {
  await withFakeMacHost(baseDiscovery(), async ({ host, port }) => {
    await withFakeAgentLinkBoard(awayBoardState(), async (serverUrl) => {
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
      const payload = parseJson(result.stdout, "away rehearsal JSON");
      assert(result.status !== 0, `away rehearsal should exit non-zero\n${outputOf(result)}`);
      assert(payload.status === "blocked", `away rehearsal should be blocked: ${payload.status}`);
      assert(payload.reason === "user-away", `away rehearsal reason mismatch: ${payload.reason}`);
      assert(payload.blockers?.includes("user-away"), `away rehearsal blockers mismatch: ${JSON.stringify(payload.blockers)}`);
      assert(payload.userPresence?.status === "away", "away rehearsal should expose userPresence=away");
      assertIncludes(payload.boardSummary, "BLOCKED_BY_USER_AWAY", "away boardSummary");
      assertNotIncludes(payload.boardSummary, "MacSafeInjectStart=", "away boardSummary");
      assertNotIncludes(payload.boardSummary, "WindowsSafeInjectProbe=", "away boardSummary");
      assertSafeOutput(outputOf(result), "away rehearsal JSON");
    });
  });
  print("OK", "User-away safe inject rehearsal fails closed without executable commands");
}

async function checkInjectActiveBlocksCommands(args) {
  await withFakeMacHost(baseDiscovery({
    inputMode: "inject",
    capabilities: {
      inputMode: "inject",
      input: { mode: "inject" },
    },
  }), async ({ host, port }) => {
    await withFakeAgentLinkBoard(presentBoardState(), async (serverUrl) => {
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
      const payload = parseJson(result.stdout, "inject-active rehearsal JSON");
      assert(result.status !== 0, `inject-active rehearsal should exit non-zero\n${outputOf(result)}`);
      assert(payload.status === "blocked", `inject-active rehearsal should be blocked: ${payload.status}`);
      assert(payload.reason === "inject-active", `inject-active rehearsal reason mismatch: ${payload.reason}`);
      assert(payload.blockers?.includes("inject-active"), `inject-active blockers mismatch: ${JSON.stringify(payload.blockers)}`);
      assertNotIncludes(payload.boardSummary, "MacSafeInjectStart=", "inject-active boardSummary");
      assertNotIncludes(payload.boardSummary, "WindowsSafeInjectProbe=", "inject-active boardSummary");
      assertSafeOutput(outputOf(result), "inject-active rehearsal JSON");
    });
  });
  print("OK", "Already-inject host blocks rehearsal commands until it returns to log mode");
}

async function checkPermissionBlocker(args) {
  await withFakeMacHost(baseDiscovery({
    permissions: {
      screenRecording: true,
      accessibility: false,
      inputMonitoring: false,
    },
  }), async ({ host, port }) => {
    await withFakeAgentLinkBoard(presentBoardState(), async (serverUrl) => {
      const result = await runAsync([
        "--boardSummary",
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
      assert(result.status !== 0, `permission rehearsal should exit non-zero\n${outputOf(result)}`);
      assertIncludes(result.stdout, "MacSafeInjectRehearsal=status=blocked", "permission boardSummary");
      assertIncludes(result.stdout, "reason=permissions", "permission boardSummary");
      assertIncludes(result.stdout, "blockers=accessibility,input-monitoring", "permission boardSummary");
      assertNotIncludes(result.stdout, "MacSafeInjectStart=", "permission boardSummary");
      assertSafeOutput(outputOf(result), "permission rehearsal boardSummary");
    });
  });
  print("OK", "Missing input permissions block safe inject rehearsal commands");
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
  await checkPresentReadyPrintsPlanOnlyCommands(args);
  await checkAwayBlocksCommands(args);
  await checkInjectActiveBlocksCommands(args);
  await checkPermissionBlocker(args);
  print("OK", "Mac safe inject rehearsal self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
