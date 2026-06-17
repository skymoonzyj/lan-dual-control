import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const readinessScript = resolve(scriptDir, "check-windows-host-readiness.mjs");
const readinessPowerShellScript = resolve(scriptDir, "check-windows-host-readiness.ps1");

const defaults = {
  timeoutMs: 120000,
  readinessTimeoutMs: 8000,
  json: false,
  help: false,
};

function printHelp() {
  console.log(`Usage: node scripts/windows/test-windows-host-readiness-board-summary.mjs [options]

Options:
  --timeoutMs <ms>           Overall timeout for each child run. Default: ${defaults.timeoutMs}
  --readinessTimeoutMs <ms>  Timeout passed into readiness checks. Default: ${defaults.readinessTimeoutMs}
  --json                    Print machine-readable JSON summary.
  --help, -h                Show this help without running checks.

Description:
  Verifies check-windows-host-readiness exposes a secret-free boardSummary in
  both --json and --boardSummary modes. The check is shape-focused: readiness
  itself may pass or fail depending on the local host state, but the summary
  must remain parseable and safe to paste into Agent Link Board.
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
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(10000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    if (token === "--readinessTimeoutMs" && next && !next.startsWith("--")) {
      args.readinessTimeoutMs = Math.max(3000, Number(next) || defaults.readinessTimeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function runNode(label, args, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolveRun({
        label,
        durationMs: Date.now() - startedAt,
        ...result,
      });
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({
        exitCode: null,
        timedOut: true,
        stdout,
        stderr,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        exitCode: null,
        timedOut: false,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      finish({
        exitCode,
        timedOut: false,
        stdout,
        stderr,
      });
    });
  });
}

function runPowerShell(label, args, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", readinessPowerShellScript,
      ...args,
    ], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolveRun({
        label,
        durationMs: Date.now() - startedAt,
        ...result,
      });
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({
        exitCode: null,
        timedOut: true,
        stdout,
        stderr,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        exitCode: null,
        timedOut: false,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      finish({
        exitCode,
        timedOut: false,
        stdout,
        stderr,
      });
    });
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNoSecretLeak(text, label) {
  const value = String(text || "");
  const forbidden = [
    /demo-password/i,
    /readiness-reverse-password/i,
    /LAN_DUAL_PASSWORD\s*=/i,
    /--password\s+\S+/i,
    /"password"\s*:/i,
  ];
  const matched = forbidden.find((pattern) => pattern.test(value));
  assert(!matched, `${label} contains a password-shaped token: ${matched}`);
}

function parseJson(text, label) {
  try {
    return JSON.parse(String(text || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}`);
  }
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolveTimeout, rejectTimeout) => {
    const timer = setTimeout(() => rejectTimeout(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolveTimeout(value);
      },
      (error) => {
        clearTimeout(timer);
        rejectTimeout(error);
      },
    );
  });
}

async function getFreePort(host) {
  return new Promise((resolvePort, rejectPort) => {
    const server = net.createServer();
    server.once("error", rejectPort);
    server.listen(0, host, () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

async function waitForDiscovery(host, port, timeoutMs) {
  const url = `http://${host}:${port}/discovery`;
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        return response.json();
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`temporary Windows host discovery did not become ready${lastError ? `: ${lastError.message}` : ""}`);
}

async function grantReverseControl(host, port, timeoutMs) {
  const response = await withTimeout(fetch(`http://${host}:${port}/reverse-control/grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ durationMs: 30000 }),
  }), timeoutMs, "grant reverse control");
  assert(response.status === 200, `grant reverse control failed with HTTP ${response.status}`);
  const payload = await response.json();
  assert(payload.ok === true, "grant reverse control response was not ok");
  assert(payload.reverseControlGrant?.active === true, "grant reverse control did not become active");
  return payload;
}

function makeQueue(socket) {
  const queue = [];
  const waiters = [];
  socket.addEventListener("message", (event) => {
    const raw = typeof event.data === "string" ? event.data : String(event.data || "");
    const message = JSON.parse(raw);
    if (waiters.length > 0) {
      waiters.shift()(message);
      return;
    }
    queue.push(message);
  });
  return {
    next(timeoutMs, label) {
      if (queue.length > 0) {
        return Promise.resolve(queue.shift());
      }
      return withTimeout(new Promise((resolveMessage) => waiters.push(resolveMessage)), timeoutMs, label);
    },
  };
}

async function openSocket(host, port, timeoutMs) {
  const socket = new WebSocket(`ws://${host}:${port}`);
  await withTimeout(new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", () => rejectOpen(new Error("WebSocket open failed")), { once: true });
  }), timeoutMs, "temporary Windows host WebSocket open");
  return { socket, messages: makeQueue(socket) };
}

async function authenticate(socket, messages, password, timeoutMs) {
  socket.send(JSON.stringify({ type: "hello" }));
  const hello = await messages.next(timeoutMs, "temporary host hello_ack");
  assert(hello.type === "hello_ack", `expected hello_ack, got ${JSON.stringify(hello)}`);
  socket.send(JSON.stringify({ type: "auth_request", password }));
  const auth = await messages.next(timeoutMs, "temporary host auth_result");
  assert(auth.type === "auth_result", `expected auth_result, got ${JSON.stringify(auth)}`);
  assert(auth.ok === true, `temporary host auth failed: ${JSON.stringify(auth)}`);
  return hello;
}

async function requestReverseControl(host, port, password, timeoutMs) {
  const { socket, messages } = await openSocket(host, port, timeoutMs);
  try {
    await authenticate(socket, messages, password, timeoutMs);
    socket.send(JSON.stringify({
      type: "reverse_control_request",
      requestId: "readiness-pending-request",
      from: "Mac client",
      message: "readiness regression request",
    }));
    const response = await messages.next(timeoutMs, "temporary host reverse_control_response");
    assert(response.type === "reverse_control_response", `expected reverse_control_response, got ${JSON.stringify(response)}`);
    assert(response.accepted === false, "default reverse control request should be rejected");
    assert(response.code === "LAN008", `default reverse control request should return LAN008, got ${response.code}`);
  } finally {
    socket.close();
  }
  const discovery = await waitForDiscovery(host, port, timeoutMs);
  assert(discovery.capabilities?.reverseControlGrant?.lastRequest?.active === true, "temporary host did not expose active lastRequest");
  return discovery;
}

async function withTemporaryWindowsHost(args, callback) {
  const { createWindowsHostServer } = await import("../../apps/windows-host/src/windows-host-service.mjs");
  const host = "127.0.0.1";
  const port = await getFreePort(host);
  const password = "readiness-reverse-password";
  const service = createWindowsHostServer({
    host,
    port,
    password,
    reverseControlMode: "deny",
    buildId: "readiness-reverse-state",
    logger: { info() {}, warn() {}, error() {} },
  });
  await withTimeout(service.listen(), args.timeoutMs, "temporary Windows host listen");
  try {
    await waitForDiscovery(host, port, args.timeoutMs);
    await callback({ host, port, password });
  } finally {
    await service.close();
  }
}

async function runReadinessJsonForHost(label, host, port, args) {
  const run = await runNode(
    label,
    [
      readinessScript,
      "--json",
      "--host",
      host,
      "--port",
      String(port),
      "--timeoutMs",
      String(args.readinessTimeoutMs),
      "--skipCurrentBuildCheck",
    ],
    args.timeoutMs,
  );
  assert(!run.timedOut, `${label} timed out`);
  assertNoSecretLeak(run.stdout, `${label} stdout`);
  assertNoSecretLeak(run.stderr, `${label} stderr`);
  return { run, payload: parseJson(run.stdout, label) };
}

function runtimeResultFrom(payload, label) {
  assert(Array.isArray(payload.results), `${label} JSON results must be an array`);
  const result = payload.results.find((entry) => entry.label === "Windows host runtime");
  assert(result, `${label} JSON results missing Windows host runtime`);
  return result;
}

async function verifyReverseControlReadinessTokens(args, results) {
  await withTemporaryWindowsHost(args, async ({ host, port, password }) => {
    await requestReverseControl(host, port, password, args.readinessTimeoutMs);
    const pending = await runReadinessJsonForHost("readiness reverse pending request", host, port, args);
    results.push(pending.run);
    const pendingRuntime = runtimeResultFrom(pending.payload, pending.run.label);
    assert(
      pendingRuntime.summary?.includes("reverse=pending-request"),
      `runtime summary should preserve pending-request: ${pendingRuntime.summary}`,
    );
    assert(
      pending.payload.boardSummary?.includes("reverse=pending-request"),
      `boardSummary should preserve pending-request: ${pending.payload.boardSummary}`,
    );
    assert(
      pending.payload.boardSummary?.includes("ReverseGrant=") && pending.payload.boardSummary?.includes("allow-windows-reverse-control.mjs"),
      `boardSummary should include reverse grant command: ${pending.payload.boardSummary}`,
    );
    assert(
      pending.payload.boardSummary?.includes("ReverseGrantPs=") && pending.payload.boardSummary?.includes("allow-windows-reverse-control.ps1"),
      `boardSummary should include reverse grant PowerShell command: ${pending.payload.boardSummary}`,
    );
    assert(
      pending.payload.windowsReverseControlGrantCommand?.includes("allow-windows-reverse-control.mjs"),
      `JSON should include reverse grant command: ${pending.payload.windowsReverseControlGrantCommand}`,
    );
    assert(
      pending.payload.windowsReverseControlGrantPowerShellCommand?.includes("allow-windows-reverse-control.ps1"),
      `JSON should include reverse grant PowerShell command: ${pending.payload.windowsReverseControlGrantPowerShellCommand}`,
    );

    await grantReverseControl(host, port, args.readinessTimeoutMs);
    const grant = await runReadinessJsonForHost("readiness reverse temporary grant", host, port, args);
    results.push(grant.run);
    const grantRuntime = runtimeResultFrom(grant.payload, grant.run.label);
    assert(
      grantRuntime.summary?.includes("reverse=temporary-grant"),
      `runtime summary should preserve temporary-grant: ${grantRuntime.summary}`,
    );
    assert(
      grant.payload.boardSummary?.includes("reverse=temporary-grant"),
      `boardSummary should preserve temporary-grant: ${grant.payload.boardSummary}`,
    );
    assert(
      grant.payload.boardSummary?.includes("ReverseGrant=") && grant.payload.boardSummary?.includes("allow-windows-reverse-control.mjs"),
      `boardSummary should include reverse grant command while grant is active: ${grant.payload.boardSummary}`,
    );
    assert(
      grant.payload.boardSummary?.includes("ReverseGrantPs=") && grant.payload.boardSummary?.includes("allow-windows-reverse-control.ps1"),
      `boardSummary should include reverse grant PowerShell command while grant is active: ${grant.payload.boardSummary}`,
    );
  });
}

async function withMockLinkBoard(callback, stateOverrides = {}) {
  const state = {
    currentCall: null,
    statuses: {},
    events: [],
    ...stateOverrides,
  };
  const server = http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/api/state") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(state));
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "not found" }));
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

function macCallForWindows() {
  return {
    status: "CALLING",
    from: "Mac Codex",
    need: "Windows Codex",
    goal: "正式 Windows host 验收",
    connection: "Windows host /discovery",
    command: "node scripts/windows/start-windows-host.mjs --status --json",
    expected: "Windows confirms host readiness before Mac runs formal smoke.",
    ask: "请 Windows 先只读确认 status。",
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const results = [];

  const help = await runNode("readiness help", [readinessScript, "--help"], args.timeoutMs);
  results.push(help);
  assert(!help.timedOut, "readiness --help timed out");
  assert(help.exitCode === 0, `readiness --help exited ${help.exitCode}`);
  assert(help.stdout.includes("--boardSummary"), "readiness --help does not mention --boardSummary");
  assert(help.stdout.includes("--checkBoard"), "readiness --help does not mention --checkBoard");
  assert(help.stdout.includes("--server"), "readiness --help does not mention --server");
  assert(help.stdout.includes("--probeMedia"), "readiness --help does not mention --probeMedia");
  assert(help.stdout.includes("--probeClipboardSecurity"), "readiness --help does not mention --probeClipboardSecurity");
  assert(help.stdout.includes("--probeWgcH264Sources"), "readiness --help does not mention --probeWgcH264Sources");

  for (const helpArg of ["-Help", "-h"]) {
    const powerShellHelp = await runPowerShell(`readiness PowerShell ${helpArg}`, [helpArg], args.timeoutMs);
    results.push(powerShellHelp);
    assert(!powerShellHelp.timedOut, `PowerShell readiness ${helpArg} timed out`);
    assert(powerShellHelp.exitCode === 0, `PowerShell readiness ${helpArg} exited ${powerShellHelp.exitCode}`);
    assert(powerShellHelp.stdout.includes("Usage:"), `PowerShell readiness ${helpArg} does not print usage`);
    assert(powerShellHelp.stdout.includes("-CheckBoard -BoardSummary"), `PowerShell readiness ${helpArg} does not mention board summary`);
    assert(powerShellHelp.stdout.includes("-Profile deploy"), `PowerShell readiness ${helpArg} does not mention deploy profile`);
    assert(powerShellHelp.stdout.includes("-ProbeMedia"), `PowerShell readiness ${helpArg} does not mention media probe`);
    assert(powerShellHelp.stdout.includes("ReverseGrantPs="), `PowerShell readiness ${helpArg} does not mention ReverseGrantPs`);
    assert(/do(?:es)? not ask for or print\s+passwords/i.test(powerShellHelp.stdout), `PowerShell readiness ${helpArg} does not document password safety`);
    assert(!powerShellHelp.stdout.includes("[INFO]"), `PowerShell readiness ${helpArg} should not run checks`);
    assertNoSecretLeak(powerShellHelp.stdout, `PowerShell readiness ${helpArg} stdout`);
    assertNoSecretLeak(powerShellHelp.stderr, `PowerShell readiness ${helpArg} stderr`);
  }

  let jsonRun = null;
  let boardRun = null;
  let powerShellJsonRun = null;
  let powerShellBoardRun = null;
  await withMockLinkBoard(async (serverUrl) => {
    jsonRun = await runNode(
      "readiness JSON board summary",
      [
        readinessScript,
        "--json",
        "--checkBoard",
        "--server",
        serverUrl,
        "--timeoutMs",
        String(args.readinessTimeoutMs),
      ],
      args.timeoutMs,
    );
    boardRun = await runNode(
      "readiness board summary",
      [
        readinessScript,
        "--boardSummary",
        "--checkBoard",
        "--server",
        serverUrl,
        "--timeoutMs",
        String(args.readinessTimeoutMs),
      ],
      args.timeoutMs,
    );
    powerShellJsonRun = await runPowerShell(
      "readiness PowerShell JSON board summary",
      [
        "-Json",
        "-CheckBoard",
        "-Server",
        serverUrl,
        "-TimeoutMs",
        String(args.readinessTimeoutMs),
      ],
      args.timeoutMs,
    );
    powerShellBoardRun = await runPowerShell(
      "readiness PowerShell board summary",
      [
        "-BoardSummary",
        "-CheckBoard",
        "-Server",
        serverUrl,
        "-TimeoutMs",
        String(args.readinessTimeoutMs),
      ],
      args.timeoutMs,
    );
  }, {
    currentCall: macCallForWindows(),
  });
  results.push(jsonRun);
  assert(!jsonRun.timedOut, "readiness --json timed out");
  const jsonSummary = parseJson(jsonRun.stdout, "readiness --json");
  assert(typeof jsonSummary.boardSummary === "string" && jsonSummary.boardSummary.length > 0, "JSON boardSummary is missing");
  assert(jsonSummary.boardSummary.includes("Windows readiness"), "JSON boardSummary has unexpected text");
  assert(jsonSummary.boardSummary.includes("Do not send passwords"), "JSON boardSummary is missing board safety reminder");
  assert(Array.isArray(jsonSummary.macClientReadinessCommands), "JSON macClientReadinessCommands must be an array");
  assert(
    typeof jsonSummary.windowsReverseControlGrantCommand === "string"
      && jsonSummary.windowsReverseControlGrantCommand.includes("allow-windows-reverse-control.mjs"),
    "JSON windowsReverseControlGrantCommand is missing",
  );
  assert(
    typeof jsonSummary.windowsReverseControlGrantPowerShellCommand === "string"
      && jsonSummary.windowsReverseControlGrantPowerShellCommand.includes("allow-windows-reverse-control.ps1"),
    "JSON windowsReverseControlGrantPowerShellCommand is missing",
  );
  assert(
    typeof jsonSummary.windowsVideoEncoderSupportCommand === "string"
      && jsonSummary.windowsVideoEncoderSupportCommand.includes("check-windows-video-encoder-support.mjs")
      && jsonSummary.windowsVideoEncoderSupportCommand.includes("--boardSummary"),
    "JSON windowsVideoEncoderSupportCommand is missing",
  );
  assert(Array.isArray(jsonSummary.results), "JSON results must be an array");
  assert(jsonSummary.args?.probeWgcH264Sources === false, "default JSON should keep WGC H.264 source probe disabled");
  assert(jsonSummary.args?.checkBoard === true, "JSON args should record checkBoard");
  assert(jsonSummary.board?.ok === true, "JSON board snapshot should be ok");
  assert(jsonSummary.board?.currentCall?.active === true, "JSON board currentCall should be active");
  assert(jsonSummary.board?.currentCall?.needsWindows === true, "JSON board currentCall should need Windows");
  assert(jsonSummary.boardSummary.includes("call=CALLING Mac Codex->Windows Codex"), "JSON boardSummary should include active currentCall");
  assert(jsonSummary.boardSummary.includes("WindowsVideoSupport="), "JSON boardSummary should include Windows video support command");
  assert(
    jsonSummary.boardSummary.includes("check-windows-video-encoder-support.mjs --boardSummary"),
    "JSON boardSummary should include the runnable Windows video support command",
  );
  assert(jsonSummary.boardSummary.includes("ReverseGrantPs="), "JSON boardSummary should include Windows reverse grant PowerShell command");
  assert(
    jsonSummary.boardSummary.includes("allow-windows-reverse-control.ps1"),
    "JSON boardSummary should include the runnable Windows reverse grant PowerShell command",
  );
  assert(!jsonSummary.boardSummary.includes("--status --json"), "JSON boardSummary should not echo call command");
  assert(jsonSummary.results.some((result) => result.label === "Windows host runtime"), "JSON results missing runtime check");
  const runtimeResult = jsonSummary.results.find((result) => result.label === "Windows host runtime");
  assert(
    typeof runtimeResult?.windowsVideoEncoderSupportCommand === "string"
      && runtimeResult.windowsVideoEncoderSupportCommand.includes("check-windows-video-encoder-support.mjs"),
    "runtime result should carry Windows video support command",
  );
  assert(
    typeof runtimeResult?.windowsReverseControlGrantPowerShellCommand === "string"
      && runtimeResult.windowsReverseControlGrantPowerShellCommand.includes("allow-windows-reverse-control.ps1"),
    "runtime result should carry Windows reverse grant PowerShell command",
  );
  if (runtimeResult?.summary?.includes("screen=")) {
    assert(runtimeResult.summary.includes("reverse="), `runtime summary missing reverse-control policy: ${runtimeResult.summary}`);
  }
  assertNoSecretLeak(jsonRun.stdout, "readiness --json stdout");
  assertNoSecretLeak(jsonRun.stderr, "readiness --json stderr");

  results.push(powerShellJsonRun);
  assert(!powerShellJsonRun.timedOut, "PowerShell readiness -Json timed out");
  const powerShellJsonSummary = parseJson(powerShellJsonRun.stdout, "PowerShell readiness -Json");
  assert(powerShellJsonSummary.args?.checkBoard === true, "PowerShell JSON args should record checkBoard");
  assert(typeof powerShellJsonSummary.boardSummary === "string" && powerShellJsonSummary.boardSummary.includes("Windows readiness"), "PowerShell JSON boardSummary is missing");
  assert(powerShellJsonSummary.boardSummary.includes("call=CALLING Mac Codex->Windows Codex"), "PowerShell JSON boardSummary should include active currentCall");
  assert(powerShellJsonSummary.boardSummary.includes("WindowsVideoSupport="), "PowerShell JSON boardSummary should include WindowsVideoSupport");
  assert(powerShellJsonSummary.boardSummary.includes("ReverseGrantPs="), "PowerShell JSON boardSummary should include ReverseGrantPs");
  assert(
    typeof powerShellJsonSummary.windowsReverseControlGrantPowerShellCommand === "string"
      && powerShellJsonSummary.windowsReverseControlGrantPowerShellCommand.includes("allow-windows-reverse-control.ps1"),
    "PowerShell JSON should include reverse grant PowerShell command",
  );
  assertNoSecretLeak(powerShellJsonRun.stdout, "PowerShell readiness -Json stdout");
  assertNoSecretLeak(powerShellJsonRun.stderr, "PowerShell readiness -Json stderr");

  await verifyReverseControlReadinessTokens(args, results);

  const clipboardRun = await runNode(
    "readiness clipboard security probe",
    [
      readinessScript,
      "--json",
      "--probeClipboardSecurity",
      "--timeoutMs",
      String(Math.max(args.readinessTimeoutMs, 12000)),
    ],
    args.timeoutMs,
  );
  results.push(clipboardRun);
  assert(!clipboardRun.timedOut, "readiness --probeClipboardSecurity --json timed out");
  const clipboardSummary = parseJson(clipboardRun.stdout, "readiness --probeClipboardSecurity --json");
  assert(clipboardSummary.args?.probeClipboardSecurity === true, "clipboard security probe flag missing from JSON args");
  assert(
    clipboardSummary.results?.some((result) => result.label === "Windows host clipboard security"),
    "JSON results missing clipboard security check",
  );
  assertNoSecretLeak(clipboardRun.stdout, "readiness --probeClipboardSecurity stdout");
  assertNoSecretLeak(clipboardRun.stderr, "readiness --probeClipboardSecurity stderr");

  const mediaRun = await runNode(
    "readiness media aggregate probe",
    [
      readinessScript,
      "--json",
      "--probeMedia",
      "--timeoutMs",
      String(args.readinessTimeoutMs),
    ],
    args.timeoutMs,
  );
  results.push(mediaRun);
  assert(!mediaRun.timedOut, "readiness --probeMedia --json timed out");
  const mediaSummary = parseJson(mediaRun.stdout, "readiness --probeMedia --json");
  assert(mediaSummary.args?.probeMedia === true, "media aggregate probe flag missing from JSON args");
  const mediaResult = mediaSummary.results?.find((result) => result.label === "Windows host media aggregate");
  assert(mediaResult, "JSON results missing Windows host media aggregate check");
  assert(mediaSummary.boardSummary.includes("media="), "media readiness boardSummary should include media status");
  assert(
    /media=(ok|partial|failed)(\(|;|\s|\.)/.test(`${mediaSummary.boardSummary} `),
    `media readiness boardSummary has unexpected media status: ${mediaSummary.boardSummary}`,
  );
  assertNoSecretLeak(mediaRun.stdout, "readiness --probeMedia stdout");
  assertNoSecretLeak(mediaRun.stderr, "readiness --probeMedia stderr");

  results.push(boardRun);
  assert(!boardRun.timedOut, "readiness --boardSummary timed out");
  const lines = boardRun.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert(lines.length === 1, `readiness --boardSummary should print one line, got ${lines.length}`);
  assert(lines[0].includes("Windows readiness"), "board summary has unexpected text");
  assert(lines[0].includes("call=CALLING Mac Codex->Windows Codex"), "board summary is missing active currentCall");
  assert(!lines[0].includes("--status --json"), "board summary should not echo call command");
  assert(lines[0].includes("media=not-checked"), "board summary should show media=not-checked by default");
  assert(lines[0].includes("WindowsVideoSupport="), "board summary should include Windows video support command");
  assert(
    lines[0].includes("check-windows-video-encoder-support.mjs --boardSummary"),
    "board summary should include the runnable Windows video support command",
  );
  assert(lines[0].includes("Do not send passwords"), "board summary is missing board safety reminder");
  assert(!/\[(INFO|OK|WARN|ERROR|FAIL)\]/.test(lines[0]), "board summary should be plain one-line text");
  assertNoSecretLeak(boardRun.stdout, "readiness --boardSummary stdout");
  assertNoSecretLeak(boardRun.stderr, "readiness --boardSummary stderr");

  results.push(powerShellBoardRun);
  assert(!powerShellBoardRun.timedOut, "PowerShell readiness -BoardSummary timed out");
  const powerShellBoardLines = powerShellBoardRun.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert(powerShellBoardLines.length === 1, `PowerShell readiness -BoardSummary should print one line, got ${powerShellBoardLines.length}`);
  assert(powerShellBoardLines[0].includes("Windows readiness"), "PowerShell board summary has unexpected text");
  assert(powerShellBoardLines[0].includes("call=CALLING Mac Codex->Windows Codex"), "PowerShell board summary is missing active currentCall");
  assert(powerShellBoardLines[0].includes("WindowsVideoSupport="), "PowerShell board summary should include WindowsVideoSupport");
  assert(powerShellBoardLines[0].includes("ReverseGrantPs="), "PowerShell board summary should include ReverseGrantPs");
  assert(powerShellBoardLines[0].includes("Do not send passwords"), "PowerShell board summary is missing board safety reminder");
  assert(!/\[(INFO|OK|WARN|ERROR|FAIL)\]/.test(powerShellBoardLines[0]), "PowerShell board summary should be plain one-line text");
  assertNoSecretLeak(powerShellBoardRun.stdout, "PowerShell readiness -BoardSummary stdout");
  assertNoSecretLeak(powerShellBoardRun.stderr, "PowerShell readiness -BoardSummary stderr");

  const summary = {
    ok: true,
    readinessJsonExitCode: jsonRun.exitCode,
    readinessPowerShellJsonExitCode: powerShellJsonRun.exitCode,
    readinessClipboardProbeExitCode: clipboardRun.exitCode,
    readinessMediaProbeExitCode: mediaRun.exitCode,
    readinessBoardSummaryExitCode: boardRun.exitCode,
    readinessPowerShellBoardSummaryExitCode: powerShellBoardRun.exitCode,
    boardSummary: lines[0],
    results: results.map((result) => ({
      label: result.label,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
    })),
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`[OK] Windows readiness board summary check passed: ${lines[0]}`);
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
