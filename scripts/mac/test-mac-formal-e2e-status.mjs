#!/usr/bin/env node
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/check-mac-formal-e2e-status.mjs";

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  timeoutMs: 10000,
  requireOnline: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-formal-e2e-status.mjs [options]

Verifies the formal E2E checklist script. Offline behavior is always covered
on a reserved port. The online shape is checked when the configured Mac host is
reachable, or required with --requireOnline.

Options:
  --host <host>       Mac host probe host. Default: 127.0.0.1
  --port <port>       Mac host probe port. Default: 43770
  --timeoutMs <ms>    Command timeout. Default: 10000
  --requireOnline     Fail when the configured Mac host is not reachable
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
    if (token === "--requireOnline") {
      args.requireOnline = true;
      continue;
    }
    if (token === "--host" && next && !next.startsWith("--")) {
      args.host = next;
      index += 1;
      continue;
    }
    if (token === "--port" && next && !next.startsWith("--")) {
      args.port = clampInteger(next, 1, 65535, defaults.port);
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 1000, 60000, defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  args.host = String(args.host || defaults.host).trim();
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

function runAsync(args, extraArgs = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...extraArgs], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
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
      resolve({
        status,
        signal,
        stdout,
        stderr,
        error: signal === "SIGTERM" ? { message: `timeout after ${args.timeoutMs}ms` } : null,
      });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        status: null,
        signal: null,
        stdout,
        stderr,
        error,
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function assertNoSecretLikeText(text, label) {
  assert(!/super-secret-formal-password/.test(text), `${label} leaked secret-like password text`);
  assert(!/token=/i.test(text), `${label} should not print token-like text`);
}

function assertBoardSummaryShape(text, label) {
  assert(/Mac formal E2E:/.test(text), `${label} should start with formal E2E summary`);
  assert(/\bblockers=/.test(text), `${label} should include blocker ids`);
  assert(/\bwarnings=/.test(text), `${label} should include warning ids`);
  assert(/MacLaunchAgentPlan=/.test(text), `${label} should include LaunchAgent dry-run planner guidance`);
  assert(/install-mac-host-launch-agent\.mjs/.test(text), `${label} should include LaunchAgent planner command`);
  assert(/MacMaxFpsPlan=/.test(text), `${label} should include Mac max-FPS dry-run planner guidance`);
  assert(/--maxScreenFps 60/.test(text), `${label} should include the formal 60Hz max-FPS planner command`);
  assert(/MacFormalLocalSmoke=/.test(text), `${label} should include local formal smoke guidance`);
  assert(/check-mac-formal-local-smoke\.mjs/.test(text), `${label} should include local formal smoke command`);
  assert(/Do not send passwords/.test(text), `${label} should include password safety note`);
  assert(/inject/.test(text), `${label} should include inject safety note`);
  assertNoSecretLikeText(text, label);
}

function assertMacLaunchAgentPlanCommand(command, label, expectedPort = null) {
  const text = String(command || "");
  assert(/node scripts\/mac\/install-mac-host-launch-agent\.mjs/.test(text), `${label} should use install-mac-host-launch-agent`);
  assert(/--port/.test(text), `${label} should keep the target port explicit`);
  assert(/--boardSummary/.test(text), `${label} should produce boardSummary`);
  assert(!/(^|\s)--write(\s|=|$)/.test(text), `${label} should stay dry-run by default`);
  assert(!/(^|\s)--force(\s|=|$)/.test(text), `${label} should not overwrite files`);
  assert(!/launchctl/.test(text), `${label} should not run launchctl`);
  assert(!/--promptPassword/.test(text), `${label} should not prompt for passwords`);
  assert(!/(^|\s)--password(\s|=|$)/.test(text), `${label} should not embed --password`);
  assert(!/--sendCall/.test(text), `${label} should not send Agent Link Board calls`);
  assert(!/--server/.test(text), `${label} should not echo custom board server URLs`);
  assert(!/input_event/.test(text), `${label} should not mention input events`);
  assert(!/inject/.test(text), `${label} should not instruct injection`);
  assert(!/super-secret-formal-password/.test(text), `${label} should not echo server-like secret text`);
  if (expectedPort !== null) {
    assert(text.includes(`--port ${expectedPort}`), `${label} should target expected port ${expectedPort}`);
  }
}

function assertMacMaxFpsPlanCommand(command, label, expectedPort = null) {
  assertMacLaunchAgentPlanCommand(command, label, expectedPort);
  assert(String(command || "").includes("--maxScreenFps 60"), `${label} should target the formal 60Hz max-FPS plan`);
}

function assertMacFormalLocalSmokeCommand(command, label, expectedPort = null) {
  const text = String(command || "");
  assert(/node scripts\/mac\/check-mac-formal-local-smoke\.mjs/.test(text), `${label} should use check-mac-formal-local-smoke`);
  assert(/--promptPassword/.test(text), `${label} should prompt locally instead of embedding a password`);
  assert(/--boardSummary/.test(text), `${label} should produce boardSummary`);
  assert(!/(^|\s)--password(\s|=|$)/.test(text), `${label} should not embed --password`);
  assert(!/--sendCall/.test(text), `${label} should not send Agent Link Board calls`);
  assert(!/--server/.test(text), `${label} should not echo custom board server URLs`);
  assert(!/super-secret-formal-password/.test(text), `${label} should not echo server-like secret text`);
  if (expectedPort !== null) {
    assert(text.includes(`--port ${expectedPort}`), `${label} should target expected port ${expectedPort}`);
  }
}

function assertMediaReadinessCommand(command, label, expectedPort = null) {
  const text = String(command || "");
  assert(/node scripts\/mac\/check-mac-host-readiness\.mjs/.test(text), `${label} should use check-mac-host-readiness`);
  assert(/--checkBoard/.test(text), `${label} should check Agent Link Board`);
  assert(/--probeMedia/.test(text), `${label} should enable media probe`);
  assert(/--probeMediaResourceSample/.test(text), `${label} should enable resource sample`);
  assert(/--promptPassword/.test(text), `${label} should prompt locally instead of embedding a password`);
  assert(/--boardSummary/.test(text), `${label} should produce boardSummary`);
  assert(!/(^|\s)--password(\s|=|$)/.test(text), `${label} should not embed --password`);
  assert(!/super-secret-formal-password/.test(text), `${label} should not echo server-like secret text`);
  if (expectedPort !== null) {
    assert(text.includes(`--port ${expectedPort}`), `${label} should target expected port ${expectedPort}`);
  }
}

function listen(server, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function gitOutput(args, label) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 3000,
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${String(result.stderr || result.stdout || "").trim()}`);
  }
  return result.stdout.trim();
}

function getCurrentBuildId() {
  return gitOutput(["rev-parse", "--short", "HEAD"], "git rev-parse HEAD");
}

function getBuildBeforeLatestMacHostRuntimeChange() {
  const latestRuntimeChange = gitOutput([
    "log",
    "-1",
    "--format=%H",
    "--",
    "apps/mac-host/Package.swift",
    "apps/mac-host/Sources",
  ], "git log latest Mac host runtime change");
  return gitOutput(["rev-parse", "--short", `${latestRuntimeChange}^`], "git rev-parse previous Mac host runtime build");
}

async function withFakeMacHost(callback, options = {}) {
  const runtimeBuildId = options.runtimeBuildId || getCurrentBuildId() || "test-build";
  const discovery = {
    platform: "macos",
    deviceName: "Fake Formal Mac",
    inputMode: "log",
    runtime: {
      buildId: runtimeBuildId,
      processId: 12345,
      startedAt: new Date().toISOString(),
    },
    permissions: {
      screenRecording: true,
      accessibility: true,
      inputMonitoring: true,
    },
    capabilities: {
      inputMode: "log",
      h264Stream: true,
      audio: true,
      audioMode: "system-pcm",
      clipboardText: true,
      clipboardFile: true,
      capturePipeline: options.capturePipeline || "screencapturekit-h264",
      maxScreenFps: options.maxScreenFps ?? 60,
      displays: [
        {
          id: "main",
          name: "Main Display",
          width: 1920,
          height: 1080,
          primary: true,
        },
      ],
    },
  };
  const server = http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/discovery") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(discovery));
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("not found");
  });
  const address = await listen(server);
  try {
    return await callback({
      host: address.address,
      port: address.port,
      discovery,
    });
  } finally {
    await closeServer(server);
  }
}

async function withFakeBoard(callback, options = {}) {
  const calls = [];
  const clears = [];
  let currentCall = options.currentCall || null;
  const server = http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/api/state") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        updatedAt: new Date().toISOString(),
        currentCall,
        statuses: {},
        events: [
          {
            id: "fake-board-event-1",
            at: new Date().toISOString(),
            type: "message",
            from: "Fake Board",
            text: "ready",
          },
        ],
      }));
      return;
    }
    if (request.method === "POST" && request.url === "/api/call") {
      const body = await readRequestBody(request);
      currentCall = JSON.parse(body || "{}");
      calls.push(currentCall);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (request.method === "POST" && request.url === "/api/clear-call") {
      clears.push(currentCall);
      currentCall = null;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "not found" }));
  });
  const address = await listen(server);
  try {
    return await callback({
      serverUrl: `http://${address.address}:${address.port}`,
      calls,
      clears,
    });
  } finally {
    await closeServer(server);
  }
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run(args, [flag]);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assert(/\bUsage\b/.test(result.stdout), `${script} ${flag} should print Usage`);
    assert(/--sendCall/.test(result.stdout), `${script} ${flag} should document --sendCall`);
    assert(/--forceCall/.test(result.stdout), `${script} ${flag} should document --forceCall`);
    assert(/--clearStaleCall/.test(result.stdout), `${script} ${flag} should document --clearStaleCall`);
    assert(/--checkBoard/.test(result.stdout), `${script} ${flag} should document --checkBoard compatibility`);
    assert(/commands\.macFormalLocalSmokeCommand/.test(result.stdout), `${script} ${flag} should document local smoke command output`);
    assert(/commands\.mediaReadinessBoardSummary/.test(result.stdout), `${script} ${flag} should document media readiness command output`);
    assert(/commands\.macLaunchAgentPlanCommand/.test(result.stdout), `${script} ${flag} should document LaunchAgent planner command output`);
    assert(/commands\.macMaxFpsPlanCommand/.test(result.stdout), `${script} ${flag} should document Mac max-FPS planner command output`);
    assert(/--promptPassword/.test(result.stdout), `${script} ${flag} should document local password prompt for media readiness command`);
    assert(!/Mac host probe password/.test(result.stdout), `${script} ${flag} should not prompt for password`);
  }
  print("OK", "Formal E2E status help exits quickly");
}

function checkOfflineJson(args) {
  const result = run(args, [
    "--json",
    "--skipBoard",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "1200",
  ]);
  const payload = parseJson(result.stdout, "offline formal E2E status");
  assert(result.status !== 0, "offline formal status should fail because host is required");
  assert(payload.ok === false, "offline payload should report ok=false");
  assert(payload.readyToCall === false, "offline payload should not be readyToCall");
  assert(payload.counts?.blockers >= 1, "offline payload should include blocker count");
  assert(payload.checklist.some((entry) => entry.id === "host" && entry.status === "blocker"), "offline checklist should block on host");
  assert(payload.checklist.some((entry) => entry.id === "inject" && entry.status === "skip"), "offline checklist should explicitly skip inject");
  assertBoardSummaryShape(payload.boardSummary || "", "offline JSON boardSummary");
  assert(/blockers=[^.]*host/.test(payload.boardSummary || ""), "offline boardSummary should name host blocker");
  assert(/warnings=[^.]*board/.test(payload.boardSummary || ""), "offline boardSummary should name board warning");
  assert(/start-mac-host --promptPassword --requirePassword/.test(payload.callText || ""), "offline callText should include safe start command");
  assert(/Checklist blockers=[^.]*host/.test(payload.callText || ""), "offline callText should name host blocker");
  assert(/warnings=[^.]*board/.test(payload.callText || ""), "offline callText should name board warning");
  assert(/install-mac-host-launch-agent\.mjs/.test(payload.callText || ""), "offline callText should include LaunchAgent planner command");
  assert(/--maxScreenFps 60/.test(payload.callText || ""), "offline callText should include max-FPS planner command");
  assert(/check-mac-formal-local-smoke\.mjs/.test(payload.callText || ""), "offline callText should include local smoke command");
  assert(/check-mac-host-readiness --probeMedia --boardSummary/.test(payload.boardSummary || ""), "offline boardSummary should mention media precheck");
  assertMacLaunchAgentPlanCommand(payload.commands?.macLaunchAgentPlanCommand, "offline LaunchAgent planner command", 9);
  assertMacMaxFpsPlanCommand(payload.commands?.macMaxFpsPlanCommand, "offline max-FPS planner command", 9);
  assertMacFormalLocalSmokeCommand(payload.commands?.macFormalLocalSmokeCommand, "offline local smoke command", 9);
  assertMediaReadinessCommand(payload.commands?.mediaReadinessBoardSummary, "offline media readiness command", 9);
  print("OK", "Offline formal E2E JSON blocks the call and keeps safety guidance");
}

function checkOfflineBoardSummary(args) {
  const result = run(args, [
    "--boardSummary",
    "--skipBoard",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "1200",
  ]);
  assert(result.status !== 0, "offline board summary should fail because formal E2E is blocked");
  const text = String(result.stdout || "").trim();
  assertBoardSummaryShape(text, "offline board summary");
  assert(/Mac host offline/.test(text), "offline board summary should mention host offline");
  assert(/blockers=[^.]*host/.test(text), "offline board summary should name host blocker");
  assert(/warnings=[^.]*board/.test(text), "offline board summary should name board warning");
  assert(/Media precheck/.test(text), "offline board summary should mention media precheck");
  print("OK", "Offline board summary is short, secret-free, and actionable");
}

function checkOfflineSendCallRefuses(args) {
  const result = run(args, [
    "--sendCall",
    "--skipBoard",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "1200",
  ]);
  assert(result.status !== 0, "offline sendCall should fail because formal E2E is not ready");
  assert(/Refusing to send formal E2E call/.test(result.stderr), "offline sendCall should explain refusal");
  assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "offline sendCall refusal");
  print("OK", "Offline --sendCall refuses before touching the board");
}

async function checkExplicitCheckBoardAlias(args) {
  await withFakeBoard(async (board) => {
    const result = await runAsync(args, [
      "--json",
      "--checkBoard",
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--server",
      board.serverUrl,
      "--timeoutMs",
      "1200",
    ]);
    const payload = parseJson(result.stdout, "explicit checkBoard formal E2E status");
    assert(result.status !== 0, "explicit checkBoard alias should still fail when Mac host is offline");
    assert(payload.resume?.board?.checked === true, "explicit checkBoard alias should read Agent Link Board");
    assert(payload.resume?.board?.ok === true, "explicit checkBoard alias should preserve readable board status");
    assert(!payload.checklist?.some((entry) => entry.id === "board" && entry.status === "warning"), "explicit checkBoard alias should not produce the skip-board warning");
    assert(/call=none|Agent Link Board/.test(payload.resume?.boardSummary || payload.boardSummary || ""), "explicit checkBoard alias should keep board evidence available");
    assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "explicit checkBoard formal E2E status");
    print("OK", "Explicit --checkBoard alias reads the Agent Link Board safely");
  });
}

async function checkClearStaleFormalCall(args) {
  const existingCall = {
    status: "CALLING",
    from: "Mac Codex",
    need: "Windows Codex",
    goal: "正式端到端验收 Mac host",
    ask: "Please run formal E2E.",
  };
  await withFakeBoard(async (board) => {
    const result = await runAsync(args, [
      "--json",
      "--clearStaleCall",
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--server",
      board.serverUrl,
      "--timeoutMs",
      "1200",
    ]);
    const payload = parseJson(result.stdout, "clear stale formal call");
    assert(result.status === 0, `clearStaleCall should exit 0 when clearing a matching stale formal call:\n${result.stdout}\n${result.stderr}`);
    assert(payload.readyToCall === false, "clear stale formal call payload should still report formal E2E not ready");
    assert(payload.clearedStaleCall?.cleared === true, "clear stale formal call should report cleared=true");
    assert(payload.clearedStaleCall?.previousCall?.goal === existingCall.goal, "clear stale formal call should include previous call identity");
    assert(/blockers=[^.]*host/.test(payload.clearedStaleCall?.reason || ""), "clear stale reason should name host blocker");
    assert(board.clears.length === 1, `fake board should receive exactly one clear-call, got ${board.clears.length}`);
    assert(board.calls.length === 0, "clear stale formal call should not post a replacement call");
    assert(/Mac host\b.*offline/i.test(payload.callText || ""), "clear stale formal call should keep blocker guidance");
    assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "clear stale formal call");
    print("OK", "Matching stale Mac formal E2E call can be cleared while preserving blocker guidance");
  }, { currentCall: existingCall });
}

async function checkClearStaleCallLeavesOtherCalls(args) {
  const existingCall = {
    status: "CALLING",
    from: "Windows Codex",
    need: "Mac Codex",
    goal: "Windows clipboard integrity recheck",
    ask: "Please wait for review.",
  };
  await withFakeBoard(async (board) => {
    const result = await runAsync(args, [
      "--json",
      "--clearStaleCall",
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--server",
      board.serverUrl,
      "--timeoutMs",
      "1200",
    ]);
    const payload = parseJson(result.stdout, "clear stale leaves other calls");
    assert(result.status === 0, `clearStaleCall should exit 0 when leaving another active call untouched:\n${result.stdout}\n${result.stderr}`);
    assert(payload.clearedStaleCall?.cleared === false, "clear stale should report cleared=false for non-matching calls");
    assert(/does not match Mac formal E2E/.test(payload.clearedStaleCall?.reason || ""), "clear stale should explain why non-matching calls are untouched");
    assert(board.clears.length === 0, "clear stale should not clear non-matching calls");
    assert(board.calls.length === 0, "clear stale should not post a replacement call");
    assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "clear stale non-matching call");
    print("OK", "Clear-stale guard leaves non-Mac-formal board calls untouched");
  }, { currentCall: existingCall });
}

async function checkClearStaleCallKeepsReadyFormalCall(args) {
  const existingCall = {
    status: "CALLING",
    from: "Mac Codex",
    need: "Windows Codex",
    goal: "正式端到端验收 Mac host",
    ask: "Please run formal E2E.",
  };
  await withFakeMacHost(async (macHost) => {
    await withFakeBoard(async (board) => {
      const localTimeoutMs = String(Math.min(args.timeoutMs, 5000));
      const result = await runAsync(args, [
        "--json",
        "--allowDirty",
        "--clearStaleCall",
        "--host",
        macHost.host,
        "--port",
        String(macHost.port),
        "--server",
        board.serverUrl,
        "--timeoutMs",
        localTimeoutMs,
      ]);
      const payload = parseJson(result.stdout, "clear stale keeps ready formal call");
      assert(result.status === 0, `clearStaleCall should exit 0 when ready call is still valid:\n${result.stdout}\n${result.stderr}`);
      assert(payload.readyToCall === true, "ready clear stale payload should be readyToCall");
      assert(payload.clearedStaleCall?.cleared === false, "ready formal call should not be cleared");
      assert(/still valid/.test(payload.clearedStaleCall?.reason || ""), "ready formal call should explain why it was kept");
      assert(board.clears.length === 0, "ready formal call should not hit clear-call");
      assert(board.calls.length === 0, "ready formal call should not post a replacement call");
      assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "clear stale ready formal call");
      print("OK", "Clear-stale guard keeps a matching formal call when checklist is ready");
    }, { currentCall: existingCall });
  });
}

async function checkStaleRuntimeSendCallRefuses(args) {
  const staleRuntimeBuildId = getBuildBeforeLatestMacHostRuntimeChange();
  await withFakeMacHost(async (macHost) => {
    await withFakeBoard(async (board) => {
      const localTimeoutMs = String(Math.min(args.timeoutMs, 5000));
      const result = await runAsync(args, [
        "--json",
        "--allowDirty",
        "--sendCall",
        "--host",
        macHost.host,
        "--port",
        String(macHost.port),
        "--server",
        board.serverUrl,
        "--timeoutMs",
        localTimeoutMs,
      ]);
      const payload = parseJson(result.stdout, "stale-runtime sendCall refusal");
      assert(result.status !== 0, "stale runtime sendCall should fail because runtime source changed");
      assert(payload.ok === false, "stale runtime refusal should report ok=false");
      assert(payload.readyToCall === false, "stale runtime refusal should not be readyToCall");
      assert(/Refusing to send formal E2E call/.test(payload.error?.message || ""), "stale runtime refusal should explain sendCall refusal");
      assert(/blockers=[^.]*build/.test(payload.error?.message || ""), "stale runtime refusal should include build blocker id");
      assert(/Runtime Build/.test(payload.error?.message || ""), "stale runtime refusal should identify the build blocker");
      assert(/restart recommended/.test(payload.error?.message || ""), "stale runtime refusal should say restart is recommended");
      assert(/Restart Mac host before deploy-style validation/.test(payload.error?.message || ""), "stale runtime refusal should give the restart next step");
      assert(/apps\/mac-host\/Sources\/MacHost\/MacHostService\.swift/.test(payload.error?.message || ""), "stale runtime refusal should name changed runtime files");
      assert(payload.counts?.blockers >= 1, "stale runtime refusal should include blocker count");
      assert(payload.checklist?.some((entry) => entry.id === "build" && entry.status === "blocker"), "stale runtime checklist should block on build");
      assert(payload.boardCallBeforeSend === undefined, "stale runtime refusal should not read board current call after readiness failed");
      assert(board.calls.length === 0, "stale runtime refusal should not post a board call");
      assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "stale-runtime sendCall refusal");
      print("OK", `Stale runtime build ${staleRuntimeBuildId} blocks --sendCall with restart guidance`);
    });
  }, { runtimeBuildId: staleRuntimeBuildId });
}

async function checkReadySendCall(args) {
  await withFakeMacHost(async (macHost) => {
    await withFakeBoard(async (board) => {
      const localTimeoutMs = String(Math.min(args.timeoutMs, 5000));
      const result = await runAsync(args, [
        "--json",
        "--allowDirty",
        "--sendCall",
        "--host",
        macHost.host,
        "--port",
        String(macHost.port),
        "--server",
        board.serverUrl,
        "--timeoutMs",
        localTimeoutMs,
      ]);
      assert(!result.error, `ready sendCall process should not time out: ${result.error?.message || ""}\n${result.stdout}\n${result.stderr}`);
      const payload = parseJson(result.stdout, "ready sendCall formal E2E status");
      assert(result.status === 0, `ready sendCall should exit 0:\n${result.stdout}\n${result.stderr}`);
      assert(payload.ok === true, "ready sendCall payload should report ok=true");
      assert(payload.readyToCall === true, "ready sendCall payload should be readyToCall");
      assert(payload.sentCall?.ok === true, "ready sendCall payload should include sentCall.ok");
      assert(board.calls.length === 1, `fake board should receive exactly one call, got ${board.calls.length}`);

      const call = board.calls[0];
      assert(call.status === "CALLING", "call should use CALLING status");
      assert(call.from === "Mac Codex", "call should identify Mac Codex as sender");
      assert(call.need === "Windows Codex", "call should request Windows Codex");
      assert(call.goal === "正式端到端验收 Mac host", "call should describe formal Mac host E2E goal");
      assert(new RegExp(`:${macHost.port}$`).test(call.connection), "call should use the probed fake Mac host port");
      assert(call.command.includes("--host"), "call command should include a host flag");
      assert(call.command.includes(`--port ${macHost.port}`), "call command should include explicit port");
      assert(!call.command.includes("--host unknown"), "call command should not use an unknown host");
      assert(call.command.includes("--promptPassword"), "call command should keep formal password entry on Windows side");
      assert(/H\.264 5-10 分钟/.test(call.expected), "call expected text should include H.264 long validation");
      assert(/系统音频/.test(call.expected), "call expected text should include system audio");
      assert(/剪贴板/.test(call.expected), "call expected text should include clipboard");
      assert(/input-log/.test(call.expected), "call expected text should include input-log");
      assert(/不要执行 inject/.test(call.expected), "call expected text should prohibit inject");
      assert(/密码不要发在联络板/.test(call.ask), "call ask should keep passwords off the board");
      assert(/明确确认/.test(call.ask), "call ask should require explicit user confirmation for inject");
      assertNoSecretLikeText(JSON.stringify(call), "ready sendCall board call");
      for (const field of ["status", "from", "need", "goal", "environment", "connection", "command", "expected", "ask", "owner", "timeout"]) {
        assert(call[field] === payload.sentCall.payload[field], `sentCall payload should match fake board call field ${field}`);
      }
      assertMacLaunchAgentPlanCommand(payload.commands?.macLaunchAgentPlanCommand, "ready sendCall LaunchAgent planner command", macHost.port);
      assertMacMaxFpsPlanCommand(payload.commands?.macMaxFpsPlanCommand, "ready sendCall max-FPS planner command", macHost.port);
      assertMediaReadinessCommand(payload.commands?.mediaReadinessBoardSummary, "ready sendCall media readiness command", macHost.port);
      assertMacFormalLocalSmokeCommand(payload.commands?.macFormalLocalSmokeCommand, "ready sendCall local smoke command", macHost.port);
      assert(/ready with warnings for Windows formal E2E/.test(payload.boardSummary || ""), "ready sendCall boardSummary should make warning state explicit");
      assert(/Mac formal E2E ready with warnings/.test(payload.callText || ""), "ready sendCall callText should make warning state explicit");
      assert(/blockers=none/.test(payload.boardSummary || ""), "ready sendCall boardSummary should report no blockers");
      assert(/warnings=[^.]*auth/.test(payload.boardSummary || ""), "ready sendCall boardSummary should name auth warning");
      assert(/Checklist blockers=none/.test(payload.callText || ""), "ready sendCall callText should report no blockers");
      assert(/warnings=[^.]*auth/.test(payload.callText || ""), "ready sendCall callText should name auth warning");
      print("OK", "Ready --sendCall posts one secret-free formal E2E call to a fake board");
    });
  });
}

async function checkExistingBoardCallProtection(args) {
  const existingCall = {
    status: "CALLING",
    from: "Windows Codex",
    need: "Mac Codex",
    goal: "Windows clipboard integrity recheck",
    ask: "Please wait for review.",
  };
  await withFakeMacHost(async (macHost) => {
    await withFakeBoard(async (board) => {
      const localTimeoutMs = String(Math.min(args.timeoutMs, 5000));
      const result = await runAsync(args, [
        "--json",
        "--allowDirty",
        "--sendCall",
        "--host",
        macHost.host,
        "--port",
        String(macHost.port),
        "--server",
        board.serverUrl,
        "--timeoutMs",
        localTimeoutMs,
      ]);
      const payload = parseJson(result.stdout, "existing-call sendCall refusal");
      assert(result.status !== 0, "sendCall should fail when a board call already exists");
      assert(payload.ok === false, "existing-call refusal should report ok=false");
      assert(/Refusing to replace existing Agent Link Board call/.test(payload.error?.message || ""), "existing-call refusal should explain overwrite guard");
      assert(/Windows clipboard integrity recheck/.test(payload.error?.message || ""), "existing-call refusal should name the existing call");
      assert(board.calls.length === 0, "existing-call refusal should not post a replacement call");
      assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "existing-call sendCall refusal");
      print("OK", "Ready --sendCall refuses to overwrite an existing board call");
    }, { currentCall: existingCall });
  });
}

async function checkDoneBoardCallDoesNotBlock(args) {
  const doneCall = {
    status: "done",
    from: "Windows Codex",
    need: "Mac Codex",
    goal: "Completed safe probe",
  };
  await withFakeMacHost(async (macHost) => {
    await withFakeBoard(async (board) => {
      const localTimeoutMs = String(Math.min(args.timeoutMs, 5000));
      const result = await runAsync(args, [
        "--json",
        "--allowDirty",
        "--sendCall",
        "--host",
        macHost.host,
        "--port",
        String(macHost.port),
        "--server",
        board.serverUrl,
        "--timeoutMs",
        localTimeoutMs,
      ]);
      const payload = parseJson(result.stdout, "done call formal E2E sendCall");
      assert(result.status === 0, `DONE board call should not block formal E2E sendCall:\n${result.stdout}\n${result.stderr}`);
      assert(payload.boardCallBeforeSend?.active === false, "DONE board call should be recorded as inactive");
      assert(payload.boardCallBeforeSend?.status === doneCall.status, "DONE board call status should be preserved");
      assert(payload.sentCall?.ok === true, "formal E2E sendCall should succeed after DONE board call");
      assert(board.calls.length === 1, `DONE board call path should post one new call, got ${board.calls.length}`);
      assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "done-call formal E2E sendCall");
      print("OK", "Ready formal E2E --sendCall ignores completed Agent Link Board calls");
    }, { currentCall: doneCall });
  });
}

async function checkForceSendCall(args) {
  const existingCall = {
    status: "CALLING",
    from: "Windows Codex",
    need: "Mac Codex",
    goal: "Old coordinated test call",
  };
  await withFakeMacHost(async (macHost) => {
    await withFakeBoard(async (board) => {
      const localTimeoutMs = String(Math.min(args.timeoutMs, 5000));
      const result = await runAsync(args, [
        "--json",
        "--allowDirty",
        "--sendCall",
        "--forceCall",
        "--host",
        macHost.host,
        "--port",
        String(macHost.port),
        "--server",
        board.serverUrl,
        "--timeoutMs",
        localTimeoutMs,
      ]);
      const payload = parseJson(result.stdout, "force sendCall formal E2E status");
      assert(result.status === 0, `force sendCall should exit 0:\n${result.stdout}\n${result.stderr}`);
      assert(payload.sentCall?.ok === true, "force sendCall payload should include sentCall.ok");
      assert(payload.boardCallBeforeSend?.active === true, "force sendCall should record existing board call");
      assert(payload.boardCallBeforeSend?.goal === existingCall.goal, "force sendCall should record existing board call goal");
      assert(board.calls.length === 1, `force sendCall should post exactly one replacement call, got ${board.calls.length}`);
      assertNoSecretLikeText(JSON.stringify(board.calls[0]), "force sendCall board call");
      print("OK", "Ready --sendCall --forceCall can replace an existing board call explicitly");
    }, { currentCall: existingCall });
  });
}

async function checkFallbackPipelineVideoWarning(args) {
  await withFakeMacHost(async (macHost) => {
    const localTimeoutMs = String(Math.min(args.timeoutMs, 5000));
    const result = await runAsync(args, [
      "--json",
      "--allowDirty",
      "--skipBoard",
      "--host",
      macHost.host,
      "--port",
      String(macHost.port),
      "--timeoutMs",
      localTimeoutMs,
    ]);
    const payload = parseJson(result.stdout, "fallback pipeline formal E2E status");
    assert(result.status === 0, `fallback pipeline warning should not fail formal status:\n${result.stdout}\n${result.stderr}`);
    assert(payload.ok === true, "fallback pipeline payload should remain ok because video fallback is a warning");
    assert(payload.readyToCall === false, "fallback pipeline payload should not be readyToCall when board is skipped");
    assert(payload.counts?.blockers === 0, "fallback pipeline payload should not add blockers");
    assert(payload.counts?.warnings >= 2, "fallback pipeline payload should include board-skip and video warnings");
    const video = payload.checklist?.find((entry) => entry.id === "video");
    assert(video?.status === "warning", "fallback pipeline video checklist item should be a warning");
    assert(/currentPipeline=background-jpeg/.test(video.summary || ""), "fallback pipeline warning should name the current pipeline");
    assert(/media baseline/.test(video.next || ""), "fallback pipeline warning should recommend refreshing the media baseline");
    assert(/needs attention/.test(payload.boardSummary || ""), "fallback pipeline board summary should show attention is needed");
    assert(/blockers=none/.test(payload.boardSummary || ""), "fallback pipeline board summary should report no blockers");
    assert(/warnings=[^.]*board/.test(payload.boardSummary || ""), "fallback pipeline board summary should name board warning");
    assert(/warnings=[^.]*video/.test(payload.boardSummary || ""), "fallback pipeline board summary should name video warning");
    assert(/pipeline=background-jpeg/.test(payload.boardSummary || ""), "fallback pipeline board summary should name the current pipeline");
    assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "fallback pipeline formal E2E status");
    print("OK", "Formal E2E status warns when H.264 is advertised but the current pipeline is JPEG fallback");
  }, { capturePipeline: "background-jpeg" });
}

async function checkMaxFpsLimitWarning(args) {
  await withFakeMacHost(async (macHost) => {
    const localTimeoutMs = String(Math.min(args.timeoutMs, 5000));
    const result = await runAsync(args, [
      "--json",
      "--allowDirty",
      "--skipBoard",
      "--host",
      macHost.host,
      "--port",
      String(macHost.port),
      "--timeoutMs",
      localTimeoutMs,
    ]);
    const payload = parseJson(result.stdout, "max-FPS formal E2E status");
    assert(result.status === 0, `max-FPS warning should not fail formal status:\n${result.stdout}\n${result.stderr}`);
    assert(payload.ok === true, "max-FPS payload should remain ok because FPS limit is a warning");
    assert(payload.counts?.blockers === 0, "max-FPS payload should not add blockers");
    assert(payload.counts?.warnings >= 2, "max-FPS payload should include board-skip and fps-limit warnings");
    const fpsLimit = payload.checklist?.find((entry) => entry.id === "fps-limit");
    assert(fpsLimit?.status === "warning", "max-FPS checklist item should be a warning");
    assert(/remoteMax=30Hz/.test(fpsLimit.summary || ""), "max-FPS warning should name the remote max FPS");
    assert(/--maxScreenFps 60/.test(fpsLimit.next || ""), "max-FPS warning should recommend the 60Hz dry-run planner");
    assertMacMaxFpsPlanCommand(payload.commands?.macMaxFpsPlanCommand, "max-FPS formal E2E planner command", macHost.port);
    assert(/warnings=[^.]*fps-limit/.test(payload.boardSummary || ""), "max-FPS board summary should name fps-limit warning");
    assert(/MacMaxFpsPlan=/.test(payload.boardSummary || ""), "max-FPS board summary should include MacMaxFpsPlan");
    assert(/--maxScreenFps 60/.test(payload.boardSummary || ""), "max-FPS board summary should include the 60Hz planner command");
    assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "max-FPS formal E2E status");
    print("OK", "Formal E2E status warns when Mac host maxScreenFps is below the formal 60Hz target");
  }, { maxScreenFps: 30 });
}

function checkOnlineJson(args) {
  const result = run(args, [
    "--json",
    "--skipBoard",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--timeoutMs",
    String(args.timeoutMs),
  ]);
  const payload = parseJson(result.stdout, "online formal E2E status");
  if (payload.resume?.host?.online !== true) {
    if (args.requireOnline) {
      throw new Error(`online formal status required but host is offline:\n${result.stdout}\n${result.stderr}`);
    }
    print("WARN", "Online formal E2E status skipped because Mac host is offline");
    return;
  }
  assert(payload.counts && typeof payload.counts.blockers === "number", "online payload should include counts");
  assert(Array.isArray(payload.checklist), "online payload should include checklist");
  assert(payload.checklist.some((entry) => entry.id === "video"), "online checklist should include video item");
  assert(payload.checklist.some((entry) => entry.id === "audio"), "online checklist should include audio item");
  assert(payload.checklist.some((entry) => entry.id === "clipboard"), "online checklist should include clipboard item");
  assert(payload.checklist.some((entry) => entry.id === "input-log"), "online checklist should include input-log item");
  assert(payload.checklist.some((entry) => entry.id === "inject" && entry.status === "skip"), "online checklist should explicitly skip inject");
  assertBoardSummaryShape(payload.boardSummary || "", "online JSON boardSummary");
  assert(/discovery -> auth -> H\.264 5-10 min/.test(payload.callText || ""), "online callText should include formal path");
  assert(/Checklist blockers=/.test(payload.callText || ""), "online callText should include blocker ids");
  assert(/warnings=/.test(payload.callText || ""), "online callText should include warning ids");
  assert(/install-mac-host-launch-agent\.mjs/.test(payload.callText || ""), "online callText should include LaunchAgent planner command");
  assert(/--maxScreenFps 60/.test(payload.callText || ""), "online callText should include max-FPS planner command");
  assert(/check-mac-formal-local-smoke\.mjs/.test(payload.callText || ""), "online callText should include local smoke command");
  assertMacLaunchAgentPlanCommand(payload.commands?.macLaunchAgentPlanCommand, "online LaunchAgent planner command", args.port);
  assertMacMaxFpsPlanCommand(payload.commands?.macMaxFpsPlanCommand, "online max-FPS planner command", args.port);
  assertMacFormalLocalSmokeCommand(payload.commands?.macFormalLocalSmokeCommand, "online local smoke command", args.port);
  assertMediaReadinessCommand(payload.commands?.mediaReadinessBoardSummary, "online media readiness command", args.port);
  print("OK", "Online formal E2E JSON includes video/audio/clipboard/input-log/inject safety checklist");
}

function checkOnlineBoardSummary(args) {
  const result = run(args, [
    "--boardSummary",
    "--skipBoard",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--timeoutMs",
    String(args.timeoutMs),
  ]);
  const text = String(result.stdout || "").trim();
  assertBoardSummaryShape(text, "online board summary");
  if (/Mac host offline/.test(text)) {
    if (args.requireOnline) {
      throw new Error(`online board summary required but host is offline:\n${result.stdout}\n${result.stderr}`);
    }
    print("WARN", "Online board summary host-specific assertions skipped because Mac host is offline");
    return;
  }
  assert(/host=/.test(text), "online board summary should include host address");
  assert(/Permissions/.test(text), "online board summary should include permissions");
  assert(/Media precheck/.test(text), "online board summary should include media precheck");
  assert(/Formal path:/.test(text), "online board summary should include formal path");
  print("OK", "Online board summary includes host, permissions, and formal path");
}

function checkSecretRedaction(args) {
  const result = run(args, [
    "--json",
    "--skipBoard",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "1200",
    "--server",
    "http://super-secret-formal-password.invalid",
  ]);
  assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "formal E2E JSON");
  const payload = parseJson(result.stdout, "secret-redaction formal E2E JSON");
  assertMacLaunchAgentPlanCommand(payload.commands?.macLaunchAgentPlanCommand, "secret-redaction LaunchAgent planner command", 9);
  assertMacMaxFpsPlanCommand(payload.commands?.macMaxFpsPlanCommand, "secret-redaction max-FPS planner command", 9);
  assertMediaReadinessCommand(payload.commands?.mediaReadinessBoardSummary, "secret-redaction media readiness command", 9);
  assertMacFormalLocalSmokeCommand(payload.commands?.macFormalLocalSmokeCommand, "secret-redaction local smoke command", 9);
  print("OK", "Formal E2E status output does not echo unrelated secret-like server text");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  checkOfflineJson(args);
  checkOfflineBoardSummary(args);
  checkOfflineSendCallRefuses(args);
  await checkExplicitCheckBoardAlias(args);
  await checkClearStaleFormalCall(args);
  await checkClearStaleCallLeavesOtherCalls(args);
  await checkClearStaleCallKeepsReadyFormalCall(args);
  await checkStaleRuntimeSendCallRefuses(args);
  await checkReadySendCall(args);
  await checkExistingBoardCallProtection(args);
  await checkDoneBoardCallDoesNotBlock(args);
  await checkForceSendCall(args);
  await checkFallbackPipelineVideoWarning(args);
  await checkMaxFpsLimitWarning(args);
  checkOnlineJson(args);
  checkOnlineBoardSummary(args);
  checkSecretRedaction(args);
  print("OK", "Mac formal E2E status self-test passed");
}

try {
  await main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
}
