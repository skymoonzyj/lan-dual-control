import { spawn, spawnSync } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const windowsHostDir = resolve(repoRoot, "apps/windows-host");
const windowsHostServer = resolve(windowsHostDir, "server.mjs");
const startWindowsHostScript = resolve(scriptDir, "start-windows-host.mjs");
const testPassword = "diagnostics-secret-password";

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-host-diagnostics.mjs [options]

Options:
  --help, -h        Show this help without running checks

Description:
  Starts a local mock Windows host, authenticates with a fixture password, and
  verifies /diagnostics plus status summaries remain secret-free and record
  session progress. Help mode is side-effect-free and does not start services,
  request passwords, authenticate, or send input/inject events.
`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function withTimeout(promise, ms, label) {
  return new Promise((resolveTimeout, rejectTimeout) => {
    const timer = setTimeout(() => rejectTimeout(new Error(`${label} timed out after ${ms} ms`)), ms);
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

function reserveEphemeralPort(host = "127.0.0.1") {
  return new Promise((resolvePort, rejectPort) => {
    const server = createNetServer();
    server.once("error", rejectPort);
    server.once("listening", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
    server.listen(0, host);
  });
}

function startHost(port) {
  return spawn(process.execPath, [windowsHostServer, String(port), "127.0.0.1"], {
    cwd: windowsHostDir,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: testPassword,
      LAN_DUAL_BUILD_ID: "diagnostics-test-build",
      LAN_DUAL_WINDOWS_SCREEN_MODE: "mock",
      LAN_DUAL_WINDOWS_AUDIO_MODE: "mock",
      LAN_DUAL_WINDOWS_INPUT_MODE: "log",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

async function stopHost(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolveClose) => {
    const timer = setTimeout(() => {
      child.kill();
      resolveClose();
    }, 3000);
    child.once("close", () => {
      clearTimeout(timer);
      resolveClose();
    });
    child.kill("SIGTERM");
  });
}

async function waitForDiscovery(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/discovery`, { cache: "no-store" });
      if (response.ok) return response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw new Error(`discovery not available: ${lastError?.message || "unknown"}`);
}

async function fetchDiagnostics(port) {
  const response = await fetch(`http://127.0.0.1:${port}/diagnostics`, { cache: "no-store" });
  const text = await response.text();
  assert(response.ok, `/diagnostics should return HTTP 200, got ${response.status}: ${text.slice(0, 120)}`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`/diagnostics should return JSON: ${error.message}; body=${text.slice(0, 120)}`);
  }
}

async function openSocket(port, timeoutMs = 8000) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  await withTimeout(new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", () => rejectOpen(new Error("WebSocket open failed")), { once: true });
  }), timeoutMs, "WebSocket open");
  return socket;
}

function makeClient(socket) {
  const queues = new Map();
  const waiters = new Map();

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    const typeWaiters = waiters.get(message.type) || [];
    if (typeWaiters.length > 0) {
      typeWaiters.shift()(message);
      if (typeWaiters.length === 0) waiters.delete(message.type);
      return;
    }
    const queue = queues.get(message.type) || [];
    queue.push(message);
    queues.set(message.type, queue);
  });

  function send(message) {
    socket.send(JSON.stringify({
      id: `${message.type}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...message,
    }));
  }

  function waitForMessage(type, timeoutMs = 8000) {
    return withTimeout(new Promise((resolveMessage) => {
      const queue = queues.get(type) || [];
      if (queue.length > 0) {
        const message = queue.shift();
        if (queue.length === 0) queues.delete(type);
        resolveMessage(message);
        return;
      }
      const typeWaiters = waiters.get(type) || [];
      typeWaiters.push(resolveMessage);
      waiters.set(type, typeWaiters);
    }), timeoutMs, `wait for ${type}`);
  }

  return { send, waitForMessage };
}

async function closeSocket(socket) {
  if (!socket || socket.readyState === WebSocket.CLOSED) return;
  await new Promise((resolveClose) => {
    const timer = setTimeout(resolveClose, 1000);
    socket.addEventListener("close", () => {
      clearTimeout(timer);
      resolveClose();
    }, { once: true });
    socket.close();
  });
}

function latestSession(diagnostics) {
  return diagnostics.sessionDiagnostics?.latestSession
    || diagnostics.sessionDiagnostics?.recentSessions?.[0]
    || null;
}

function assertSecretFree(diagnostics) {
  const text = JSON.stringify(diagnostics);
  assert(!text.includes(testPassword), "diagnostics must not include the connection password");
  assert(!text.includes("auth_request"), "diagnostics must not include raw auth messages");
}

function runStatusSummary(port) {
  const child = spawn(process.execPath, [
    startWindowsHostScript,
    "--status",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--boardSummary",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_LINK_SERVER: "http://127.0.0.1:9",
    },
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  return withTimeout(new Promise((resolveRun, rejectRun) => {
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      const output = `${stdout}${stderr}`;
      if (code !== 0) {
        rejectRun(new Error(`status summary should exit 0, got ${code ?? signal}: ${output}`));
        return;
      }
      try {
        assert(!output.includes(testPassword), "status summary must not include the connection password");
        resolveRun(String(stdout || "").trim());
      } catch (error) {
        rejectRun(error);
      }
    });
  }), 15000, "Windows host status summary");
}
function startLegacyDiscoveryOnlyHost() {
  const server = createHttpServer((request, response) => {
    const path = String(request.url || "").split("?")[0];
    if (path === "/discovery") {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        type: "lan_dual_discovery",
        protocolVersion: 1,
        deviceId: `legacy-windows-host-${port}`,
        deviceName: "Legacy Windows Host",
        platform: "windows",
        role: "host",
        host: "127.0.0.1",
        port,
        controlPort: port,
        runtime: {
          processId: 12345,
          startedAt: new Date(0).toISOString(),
          uptimeSeconds: 60,
          buildId: "legacy-diagnostics-test",
        },
        capabilities: {
          screen: { capturePipeline: "windows-ffmpeg-gdigrab-mjpeg", videoCodec: "jpeg" },
          audio: { mode: "mock" },
          input: { mode: "system" },
          clipboardText: true,
          clipboardFile: true,
          reverseControl: true,
          reverseControlMode: "deny",
          reverseControlPolicy: { supported: true, mode: "deny", requiresConfirmation: true, autoAccept: false },
        },
        lastSeenAt: new Date().toISOString(),
      }));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("LAN dual control Windows host skeleton. Use WebSocket to connect.\n");
  });
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolveListen({ server, port });
    });
  });
}
async function assertLegacyDiagnosticsGuidance() {
  const { server, port } = await startLegacyDiscoveryOnlyHost();
  try {
    const summary = await runStatusSummary(port);
    assert(summary.includes("WindowsHostSession=diagnostics-unavailable"), `legacy summary should keep session unavailable marker: ${summary}`);
    assert(summary.includes("WindowsHostDiagnostics=unavailable"), `legacy summary should expose diagnostics availability: ${summary}`);
    assert(summary.includes("restart=only-if-session-debug-needed"), `legacy summary should mark restart as optional unless debugging smoke: ${summary}`);
    assert(!summary.includes(testPassword), "legacy status summary must not include the connection password");
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }

  await assertLegacyDiagnosticsGuidance();

  const port = await reserveEphemeralPort();
  const host = startHost(port);
  let stdout = "";
  let stderr = "";
  host.stdout.on("data", (chunk) => { stdout += String(chunk); });
  host.stderr.on("data", (chunk) => { stderr += String(chunk); });

  let socket;
  try {
    const discovery = await waitForDiscovery(port);
    assert(discovery.runtime?.buildId === "diagnostics-test-build", "temporary host should use test build id");

    const before = await fetchDiagnostics(port);
    assert(before.ok === true, "diagnostics should be ok");
    assert(before.sessionDiagnostics?.activeConnections === 0, "diagnostics should start with zero active connections");
    assertSecretFree(before);

    socket = await openSocket(port);
    const client = makeClient(socket);
    client.send({ type: "hello", protocolVersion: 1, role: "diagnostics-test" });
    await client.waitForMessage("hello_ack");
    client.send({ type: "auth_request", password: testPassword });
    const auth = await client.waitForMessage("auth_result");
    assert(auth.ok === true, "auth should pass with test password");
    client.send({
      type: "session_offer",
      protocolVersion: 1,
      wantVideo: true,
      wantAudio: true,
      wantClipboardText: false,
      wantClipboardFile: false,
      preferredVideoCodec: "mjpeg",
      preferredVideoEncoding: "data-url",
      preferredVideoTransport: "json",
      maxFps: 30,
      maxBandwidthKbps: 5000,
      qualityPreset: "smooth",
      preferredWidth: 640,
      preferredHeight: 360,
      audioVolume: 50,
    });
    const answer = await client.waitForMessage("session_answer");
    assert(answer.ok === true, "session should negotiate");
    await client.waitForMessage("video_frame", 10000);

    const during = await fetchDiagnostics(port);
    assertSecretFree(during);
    const active = latestSession(during);
    assert(active, "diagnostics should expose latest session");
    assert(active.stage === "streaming", `latest session should be streaming, got ${active.stage}`);
    assert(active.authenticated === true, "latest session should show authenticated=true");
    assert(active.videoFramesSent >= 1, "latest session should count sent video frames");
    assert(active.session?.width === 640 && active.session?.height === 360, "latest session should record negotiated size");

    const statusSummary = await runStatusSummary(port);
    assert(statusSummary.includes("WindowsHostSession=stage:streaming"), `status summary should include streaming diagnostics: ${statusSummary}`);
    assert(statusSummary.includes("videoFrames="), `status summary should include video frame count: ${statusSummary}`);

    await closeSocket(socket);
    socket = null;
    await delay(150);

    const after = await fetchDiagnostics(port);
    assertSecretFree(after);
    const closed = latestSession(after);
    assert(closed?.stage === "closed", `latest session should be closed after socket closes, got ${closed?.stage}`);
    assert(closed?.closedAt, "closed session should have closedAt");
    assert(closed?.videoFramesSent >= 1, "closed session should retain sent frame count");

    console.log("[PASS] Windows host diagnostics endpoint is secret-free and records session progress.");
  } catch (error) {
    console.error(`[FAIL] ${error.message}`);
    if (stdout.trim()) console.error(`[windows-host stdout]\n${stdout.trim()}`);
    if (stderr.trim()) console.error(`[windows-host stderr]\n${stderr.trim()}`);
    process.exitCode = 1;
  } finally {
    await closeSocket(socket);
    await stopHost(host);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
