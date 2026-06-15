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
  assert(/Do not send passwords/.test(text), `${label} should include password safety note`);
  assert(/inject/.test(text), `${label} should include inject safety note`);
  assertNoSecretLikeText(text, label);
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

async function withFakeMacHost(callback) {
  const currentBuildId = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 3000,
  }).stdout.trim();
  const discovery = {
    platform: "macos",
    deviceName: "Fake Formal Mac",
    inputMode: "log",
    runtime: {
      buildId: currentBuildId || "test-build",
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
      capturePipeline: "screencapturekit-h264",
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

async function withFakeBoard(callback) {
  const calls = [];
  const server = http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/api/state") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        updatedAt: new Date().toISOString(),
        currentCall: null,
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
      calls.push(JSON.parse(body || "{}"));
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
  assert(/start-mac-host --promptPassword --requirePassword/.test(payload.callText || ""), "offline callText should include safe start command");
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
      print("OK", "Ready --sendCall posts one secret-free formal E2E call to a fake board");
    });
  });
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
  await checkReadySendCall(args);
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
