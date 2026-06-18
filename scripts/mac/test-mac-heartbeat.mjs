#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/check-mac-heartbeat.mjs";

const defaults = {
  timeoutMs: 12000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-heartbeat.mjs [options]

Verifies check-mac-heartbeat help, warning output, fake-online output, and
codex-reconnect-stuck detection without authenticating, sending passwords,
input, or inject.

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

function assertNotIncludes(text, expected, label) {
  assert(!String(text).includes(expected), `${label} unexpectedly included ${JSON.stringify(expected)}.\n${text}`);
}

function assertIsoTimestamp(value, label) {
  assert(typeof value === "string" && Number.isFinite(Date.parse(value)), `${label} should be an ISO timestamp, got ${JSON.stringify(value)}`);
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

function runAsync(extraArgs, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...extraArgs], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: "",
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

function assertNoSecrets(text, label) {
  assertNotIncludes(text, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(text, "--password", label);
  assertNotIncludes(text, "super-secret-heartbeat", label);
  assertNotIncludes(text, "fake-token-value", label);
}

function assertCommandSet(commands, label) {
  assertIncludes(commands?.macHeartbeatCommand || "", "check-mac-heartbeat.mjs", label);
  assertIncludes(commands?.macHeartbeatCommand || "", "--checkBoard", label);
  assertIncludes(commands?.macHostSafeStartCommand || "", "start-mac-host.mjs", label);
  assertIncludes(commands?.macHostSafeStartCommand || "", "--promptPassword", label);
  assertIncludes(commands?.macHostSafeStartCommand || "", "--requirePassword", label);
  assertIncludes(commands?.macClientPageStatusCommand || "", "start-mac-client.mjs --status --boardSummary", label);
  assertIncludes(commands?.macClientDiagnosticsCommand || "", "check-mac-client-readiness.mjs", label);
  assertIncludes(commands?.macFormalLocalSmokeCommand || "", "check-mac-formal-local-smoke.mjs", label);
  assertIncludes(commands?.macClientDiscoverWindowsCommand || "", "discover-windows-hosts.mjs", label);
  assertIncludes(commands?.macClientDiscoverWindowsCommand || "", "--checkBoard", label);
  assertIncludes(commands?.macClientFormalChecklistCommand || "", "check-mac-client-formal-status.mjs", label);
  assertIncludes(commands?.macClientFormalChecklistCommand || "", "--boardSummary", label);
  assertIncludes(commands?.macClientFormalSmokeCommand || "", "run-mac-client-formal-smoke.mjs", label);
  assertIncludes(commands?.macClientFormalSmokeCommand || "", "--discover", label);
  assertIncludes(commands?.macClientFormalSmokeCommand || "", "--ensureClient", label);
  assertIncludes(commands?.macClientFormalSmokeCommand || "", "--preflightOnly", label);
  assertIncludes(commands?.macClientFormalSmokeCommand || "", "--boardSummary", label);
  assertNoSecrets(JSON.stringify(commands), label);
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assertIncludes(result.stdout, "Usage:", `${script} ${flag}`);
    assertIncludes(result.stdout, "codex-reconnect-stuck", `${script} ${flag}`);
    assertIncludes(result.stdout, "--codexTextFile", `${script} ${flag}`);
    assertIncludes(result.stdout, "--stateFile", `${script} ${flag}`);
    assertNotIncludes(result.stdout, "password:", `${script} ${flag}`);
  }
  print("OK", "Mac heartbeat help exits quickly");
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

function checkOfflineWarning(args, hostPort, clientPort) {
  const result = run([
    "--json",
    "--host",
    "127.0.0.1",
    "--port",
    String(hostPort),
    "--clientHost",
    "127.0.0.1",
    "--clientPort",
    String(clientPort),
    "--timeoutMs",
    "800",
  ], args);
  const payload = parseJson(result.stdout, "offline JSON");
  assert(result.status === 0, `offline warning should exit 0.\n${result.stdout}\n${result.stderr}`);
  assert(payload.status === "warning", "offline payload should be warning");
  assert(payload.ok === true, "offline warning should be ok=true");
  assert(payload.warnings.includes("mac-host-offline"), "offline payload should warn about Mac host");
  assert(payload.warnings.includes("mac-client-offline"), "offline payload should warn about Mac client");
  assert(payload.codex.reason === "ok", "offline payload should not invent Codex blocker");
  assertIsoTimestamp(payload.checkedAt, "offline checkedAt");
  assertIncludes(payload.boardSummary || "", "MacHeartbeat=status=warning", "offline board summary");
  assertIncludes(payload.boardSummary || "", "checkedAt=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "macHost=offline", "offline board summary");
  assertIncludes(payload.boardSummary || "", "macClient=offline", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacClientFormalChecklist=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacClientFormalSmoke=", "offline board summary");
  assertCommandSet(payload.commands, "offline commands");
  assertNoSecrets(`${result.stdout}\n${result.stderr}`, "offline output");
  print("OK", "Offline heartbeat reports warnings without secrets");
}

async function withServer(handler, callback) {
  const port = await getFreePort();
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  try {
    await callback(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function checkOnlineOk(args) {
  await withServer((request, response) => {
    if ((request.url || "").split("?")[0] !== "/discovery") {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      platform: "macos",
      runtime: { processId: 1234, buildId: "mac-heartbeat-build" },
      permissions: { screenRecording: true, accessibility: true, inputMonitoring: true },
      capabilities: {
        input: { mode: "log" },
        screen: {
          active: true,
          h264: true,
          maxScreenFps: 60,
          capturePipeline: "screencapturekit-h264"
        },
        audio: { active: true, mode: "system-pcm" }
      }
    }));
  }, async (hostPort) => {
    await withServer((request, response) => {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>LAN Dual Mac 控制 Windows</title>");
    }, async (clientPort) => {
      const result = await runAsync([
        "--json",
        "--host",
        "127.0.0.1",
        "--port",
        String(hostPort),
        "--clientHost",
        "127.0.0.1",
        "--clientPort",
        String(clientPort),
        "--timeoutMs",
        "1200",
      ], args);
      const payload = parseJson(result.stdout, "online JSON");
      assert(result.status === 0, `online heartbeat should pass.\n${result.stdout}\n${result.stderr}`);
      assert(payload.status === "ok", "online payload should be ok");
      assert(payload.macHost.online === true, "Mac host should be online");
      assert(payload.macHost.runtimeBuild === "mac-heartbeat-build", "Mac host runtime build should be captured");
      assert(payload.macHost.inputMode === "log", "Mac host inputMode should be captured");
      assert(payload.macClient.online === true, "Mac client should be online");
      assertIsoTimestamp(payload.checkedAt, "online checkedAt");
      assertIncludes(payload.boardSummary || "", "MacHeartbeat=status=ok", "online board summary");
      assertIncludes(payload.boardSummary || "", "checkedAt=", "online board summary");
      assertIncludes(payload.boardSummary || "", "inputMode=log", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacClientFormalChecklist=", "online board summary");
      assertIncludes(payload.boardSummary || "", "MacClientFormalSmoke=", "online board summary");
      assertCommandSet(payload.commands, "online commands");
      assertNoSecrets(`${result.stdout}\n${result.stderr}`, "online output");
    });
  });
  print("OK", "Online heartbeat captures fake Mac host and client state");
}

async function checkBoardTimestamps(args) {
  const boardUpdatedAt = new Date(Date.now() - 45000).toISOString();
  const macCodexUpdatedAt = new Date(Date.now() - 30000).toISOString();
  const hostPort = await getFreePort();
  const clientPort = await getFreePort();
  await withServer((request, response) => {
    if ((request.url || "").split("?")[0] !== "/api/state") {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      updatedAt: boardUpdatedAt,
      currentCall: null,
      statuses: {
        "Mac Codex": {
          status: "idle",
          note: "fake board status",
          updatedAt: macCodexUpdatedAt,
        },
      },
    }));
  }, async (boardPort) => {
    const result = await runAsync([
      "--json",
      "--host",
      "127.0.0.1",
      "--port",
      String(hostPort),
      "--clientHost",
      "127.0.0.1",
      "--clientPort",
      String(clientPort),
      "--server",
      `http://127.0.0.1:${boardPort}`,
      "--checkBoard",
      "--timeoutMs",
      "800",
    ], args);
    const payload = parseJson(result.stdout, "board timestamp JSON");
    assert(result.status === 0, `board timestamp warning should exit 0.\n${result.stdout}\n${result.stderr}`);
    assert(payload.board.ok === true, "board timestamp payload should read Agent Link Board");
    assert(payload.board.updatedAt === boardUpdatedAt, "board timestamp payload should preserve board updatedAt");
    assert(payload.board.macCodexStatus.updatedAt === macCodexUpdatedAt, "board timestamp payload should preserve Mac Codex updatedAt");
    assert(payload.codex.lastEventAt === macCodexUpdatedAt, "board timestamp payload should use Mac Codex updatedAt as last event");
    assert(payload.codex.status === "idle", "board timestamp payload should use Mac Codex status");
    assertIncludes(payload.boardSummary || "", `checkedAt=${payload.checkedAt}`, "board timestamp summary");
    assertIncludes(payload.boardSummary || "", `boardUpdatedAt=${boardUpdatedAt}`, "board timestamp summary");
    assertIncludes(payload.boardSummary || "", `codex=ok status=idle updatedAt=${macCodexUpdatedAt}`, "board timestamp summary");
    assertIncludes(payload.boardSummary || "", "ageMs=", "board timestamp summary");
    assertNoSecrets(`${result.stdout}\n${result.stderr}`, "board timestamp output");
  });
  print("OK", "Heartbeat board summary includes freshness timestamps");
}

function checkReconnectStuck(args) {
  const tmp = mkdtempSync(join(tmpdir(), "lan-dual-mac-heartbeat-"));
  try {
    const stateFile = join(tmp, "state.json");
    const textFile = join(tmp, "codex.txt");
    writeFileSync(textFile, [
      "正在重新连接 5/5",
      "stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses)",
      "token=fake-token-value password=super-secret-heartbeat",
    ].join("\n"));
    const old = new Date(Date.now() - 120000).toISOString();
    const result = run([
      "--json",
      "--codexTextFile",
      textFile,
      "--lastCodexEventAt",
      old,
      "--agentStatus",
      "coding",
      "--stuckThresholdMs",
      "60000",
      "--stateFile",
      stateFile,
      "--timeoutMs",
      "800",
    ], args);
    const payload = parseJson(result.stdout, "reconnect stuck JSON");
    assert(result.status !== 0, "reconnect stuck should exit non-zero");
    assert(payload.status === "blocked", "reconnect stuck should be blocked");
    assert(payload.blockers.includes("codex-reconnect-stuck"), "reconnect blocker should be present");
    assert(payload.codex.reason === "codex-reconnect-stuck", "codex reason should be reconnect stuck");
    assert(payload.codex.signals.includes("reconnecting-5-of-5"), "should detect reconnect 5/5");
    assert(payload.codex.signals.includes("stream-disconnected-before-completion"), "should detect stream disconnect");
    assert(payload.codex.signals.includes("codex-backend-api-request-error"), "should detect backend request error");
    assertIncludes(payload.boardSummary || "", "reason=codex-reconnect-stuck", "reconnect board summary");
    assertIncludes(payload.boardSummary || "", "checkedAt=", "reconnect board summary");
    assertIncludes(payload.boardSummary || "", `updatedAt=${old}`, "reconnect board summary");
    assertIncludes(payload.boardSummary || "", "suggestedAction=请用户查看 Mac Codex 窗口", "reconnect board summary");
    assertNoSecrets(`${result.stdout}\n${result.stderr}`, "reconnect output");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  print("OK", "Reconnect-stuck evidence becomes a blocker without leaking secrets");
}

function checkCodexStale(args) {
  const old = new Date(Date.now() - 420000).toISOString();
  const result = run([
    "--json",
    "--agentStatus",
    "coding",
    "--lastCodexEventAt",
    old,
    "--staleThresholdMs",
    "60000",
    "--timeoutMs",
    "800",
  ], args);
  const payload = parseJson(result.stdout, "codex stale JSON");
  assert(result.status !== 0, "codex stale should exit non-zero");
  assert(payload.status === "blocked", "codex stale should be blocked");
  assert(payload.blockers.includes("mac-codex-stale"), "stale blocker should be present");
  assert(payload.codex.reason === "mac-codex-stale", "codex reason should be stale");
  assert(payload.codex.lastEventAgeMs >= 60000, "last event age should cross threshold");
  assertIncludes(payload.boardSummary || "", "reason=mac-codex-stale", "stale board summary");
  assertIncludes(payload.boardSummary || "", "evidenceAgeMs=", "stale board summary");
  assertNotIncludes(payload.boardSummary || "", "evidenceAgeMs=0", "stale board summary");
  assertIncludes(payload.boardSummary || "", `updatedAt=${old}`, "stale board summary");
  assertNoSecrets(`${result.stdout}\n${result.stderr}`, "stale output");
  print("OK", "Stale active Mac Codex status becomes a blocker");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  const hostPort = await getFreePort();
  const clientPort = await getFreePort();
  checkOfflineWarning(args, hostPort, clientPort);
  await checkOnlineOk(args);
  await checkBoardTimestamps(args);
  checkReconnectStuck(args);
  checkCodexStale(args);
  print("OK", "Mac heartbeat self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
