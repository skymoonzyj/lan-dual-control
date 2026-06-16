import assert from "node:assert/strict";
import net from "node:net";

const defaults = {
  host: "127.0.0.1",
  password: "demo-password",
  timeoutMs: 10000,
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-host-reverse-control.mjs [options]

Options:
  --host <host>          Bind/connect host. Default: ${defaults.host}
  --password <password>  Temporary test password. Default: ${defaults.password}
  --timeoutMs <ms>       Per-step timeout. Default: ${defaults.timeoutMs}
  --help, -h             Show this help without starting a host

Description:
  Starts in-process Windows hosts and verifies reverse_control_request safety
  behavior. It does not use a formal password, send input, or execute inject.
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
    if (token === "--host" && next && !next.startsWith("--")) {
      args.host = next;
      index += 1;
      continue;
    }
    if (token === "--password" && next && !next.startsWith("--")) {
      args.password = next;
      index += 1;
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

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`discovery did not become ready${lastError ? `: ${lastError.message}` : ""}`);
}

async function grantReverseControl(host, port, durationMs, timeoutMs) {
  const response = await withTimeout(fetch(`http://${host}:${port}/reverse-control/grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ durationMs }),
  }), timeoutMs, "grant reverse control");
  assert.equal(response.status, 200, `grant failed with HTTP ${response.status}`);
  const json = await response.json();
  assert.equal(json.ok, true);
  assert.equal(json.reverseControlMode, "deny");
  assert.equal(json.reverseControlGrant?.active, true);
  assert.ok(Number(json.reverseControlGrant?.remainingMs) > 0);
  return json;
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
      return withTimeout(new Promise((resolve) => waiters.push(resolve)), timeoutMs, label);
    },
  };
}

async function openSocket({ host, port, timeoutMs }) {
  const socket = new WebSocket(`ws://${host}:${port}`);
  await withTimeout(new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("WebSocket open failed")), { once: true });
  }), timeoutMs, "WebSocket open");
  return { socket, messages: makeQueue(socket) };
}

async function authenticate(socket, messages, password, timeoutMs) {
  socket.send(JSON.stringify({ type: "hello" }));
  const hello = await messages.next(timeoutMs, "hello_ack");
  assert.equal(hello.type, "hello_ack", `expected hello_ack, got ${JSON.stringify(hello)}`);
  socket.send(JSON.stringify({ type: "auth_request", password }));
  const auth = await messages.next(timeoutMs, "auth_result");
  assert.equal(auth.type, "auth_result", `expected auth_result, got ${JSON.stringify(auth)}`);
  assert.equal(auth.ok, true, `auth failed: ${JSON.stringify(auth)}`);
  return hello;
}

async function startHost({ host, password, reverseControlMode, timeoutMs }) {
  const { createWindowsHostServer } = await import("../../apps/windows-host/src/windows-host-service.mjs");
  const port = await getFreePort(host);
  const logger = { info() {}, warn() {}, error() {} };
  const service = createWindowsHostServer({
    host,
    port,
    password,
    reverseControlMode,
    buildId: `reverse-control-${reverseControlMode}`,
    logger,
  });
  await withTimeout(service.listen(), timeoutMs, `listen ${reverseControlMode}`);
  return { service, host, port };
}

async function withHost(options, fn) {
  const host = await startHost(options);
  try {
    await waitForDiscovery(host.host, host.port, options.timeoutMs);
    await fn(host);
  } finally {
    await host.service.close();
  }
}

async function verifyUnauthenticatedRejected(args) {
  await withHost({ ...args, reverseControlMode: "deny" }, async ({ host, port }) => {
    const { socket, messages } = await openSocket({ host, port, timeoutMs: args.timeoutMs });
    try {
      socket.send(JSON.stringify({ type: "hello" }));
      const hello = await messages.next(args.timeoutMs, "hello_ack");
      assert.equal(hello.capabilities.reverseControlMode, "deny");
      socket.send(JSON.stringify({
        type: "reverse_control_request",
        requestId: "unauth-reverse",
        from: "Mac client",
      }));
      const response = await messages.next(args.timeoutMs, "unauth reverse response");
      assert.equal(response.type, "reverse_control_response");
      assert.equal(response.accepted, false);
      assert.equal(response.code, "LAN002");
    } finally {
      socket.close();
    }
  });
  print("OK", "Unauthenticated reverse control request is rejected with LAN002");
}

async function verifyDefaultDenied(args) {
  await withHost({ ...args, reverseControlMode: "deny" }, async ({ host, port }) => {
    const discovery = await waitForDiscovery(host, port, args.timeoutMs);
    assert.equal(discovery.capabilities.reverseControl, true);
    assert.equal(discovery.capabilities.reverseControlMode, "deny");
    assert.equal(discovery.capabilities.reverseControlPolicy.requiresConfirmation, true);

    const { socket, messages } = await openSocket({ host, port, timeoutMs: args.timeoutMs });
    try {
      const hello = await authenticate(socket, messages, args.password, args.timeoutMs);
      assert.equal(hello.capabilities.reverseControlMode, "deny");
      socket.send(JSON.stringify({
        type: "reverse_control_request",
        requestId: "default-deny",
        from: "Mac client",
        message: "请求切换控制方向",
      }));
      const response = await messages.next(args.timeoutMs, "default deny reverse response");
      assert.equal(response.type, "reverse_control_response");
      assert.equal(response.requestId, "default-deny");
      assert.equal(response.accepted, false);
      assert.equal(response.code, "LAN008");
      assert.equal(response.reverseControlMode, "deny");
      assert.equal(response.reverseControlState, "rejected");
      assert.match(response.reason, /用户确认|默认安全拒绝/);
      assert.doesNotMatch(response.reason, /尚未实装/);
    } finally {
      socket.close();
    }
  });
  print("OK", "Default reverse control policy rejects safely with LAN008");
}

async function verifyLocalTemporaryGrant(args) {
  await withHost({ ...args, reverseControlMode: "deny" }, async ({ host, port }) => {
    const grant = await grantReverseControl(host, port, 30000, args.timeoutMs);
    assert.equal(grant.reverseControlGrant.oneTime, true);
    const discovery = await waitForDiscovery(host, port, args.timeoutMs);
    assert.equal(discovery.capabilities.reverseControlMode, "deny");
    assert.equal(discovery.capabilities.reverseControlGrant.active, true);

    const { socket, messages } = await openSocket({ host, port, timeoutMs: args.timeoutMs });
    try {
      await authenticate(socket, messages, args.password, args.timeoutMs);
      socket.send(JSON.stringify({
        type: "reverse_control_request",
        requestId: "temporary-grant",
        from: "Mac client",
      }));
      const accepted = await messages.next(args.timeoutMs, "temporary grant reverse response");
      assert.equal(accepted.type, "reverse_control_response");
      assert.equal(accepted.requestId, "temporary-grant");
      assert.equal(accepted.accepted, true);
      assert.equal(accepted.reverseControlMode, "deny");
      assert.equal(accepted.reverseControlState, "accepted");
      assert.equal(accepted.reverseControlGrant, "consumed");
      assert.match(accepted.reason, /短时允许|授权已使用/);

      const afterDiscovery = await waitForDiscovery(host, port, args.timeoutMs);
      assert.equal(afterDiscovery.capabilities.reverseControlGrant.active, false);

      socket.send(JSON.stringify({
        type: "reverse_control_request",
        requestId: "temporary-grant-consumed",
        from: "Mac client",
      }));
      const rejected = await messages.next(args.timeoutMs, "consumed grant reverse response");
      assert.equal(rejected.type, "reverse_control_response");
      assert.equal(rejected.accepted, false);
      assert.equal(rejected.code, "LAN008");
      assert.equal(rejected.reverseControlState, "rejected");
    } finally {
      socket.close();
    }
  });
  print("OK", "Local temporary reverse control grant accepts once and is consumed");
}

async function verifyMissingRequestIdRejected(args) {
  await withHost({ ...args, reverseControlMode: "deny" }, async ({ host, port }) => {
    const { socket, messages } = await openSocket({ host, port, timeoutMs: args.timeoutMs });
    try {
      await authenticate(socket, messages, args.password, args.timeoutMs);
      socket.send(JSON.stringify({
        type: "reverse_control_request",
        from: "Mac client",
      }));
      const response = await messages.next(args.timeoutMs, "missing requestId response");
      assert.equal(response.type, "reverse_control_response");
      assert.equal(response.accepted, false);
      assert.equal(response.code, "LAN008");
      assert.equal(response.requestId, "");
      assert.equal(response.reverseControlState, "rejected");
      assert.match(response.reason, /requestId/);
    } finally {
      socket.close();
    }
  });
  print("OK", "Reverse control request without requestId is rejected");
}

async function verifyExplicitAcceptMode(args) {
  await withHost({ ...args, reverseControlMode: "accept" }, async ({ host, port }) => {
    const discovery = await waitForDiscovery(host, port, args.timeoutMs);
    assert.equal(discovery.capabilities.reverseControl, true);
    assert.equal(discovery.capabilities.reverseControlMode, "accept");
    assert.equal(discovery.capabilities.reverseControlPolicy.autoAccept, true);

    const { socket, messages } = await openSocket({ host, port, timeoutMs: args.timeoutMs });
    try {
      const hello = await authenticate(socket, messages, args.password, args.timeoutMs);
      assert.equal(hello.capabilities.reverseControlMode, "accept");
      socket.send(JSON.stringify({
        type: "reverse_control_request",
        requestId: "explicit-accept",
        from: "Mac client",
      }));
      const response = await messages.next(args.timeoutMs, "accept reverse response");
      assert.equal(response.type, "reverse_control_response");
      assert.equal(response.requestId, "explicit-accept");
      assert.equal(response.accepted, true);
      assert.equal(response.reverseControlMode, "accept");
      assert.equal(response.reverseControlState, "accepted");
      assert.match(response.reason, /显式实验策略/);
    } finally {
      socket.close();
    }
  });
  print("OK", "Explicit accept reverse control policy is opt-in and observable");
}

async function verifyDisabledMode(args) {
  await withHost({ ...args, reverseControlMode: "disabled" }, async ({ host, port }) => {
    const discovery = await waitForDiscovery(host, port, args.timeoutMs);
    assert.equal(discovery.capabilities.reverseControl, false);
    assert.equal(discovery.capabilities.reverseControlMode, "disabled");

    const { socket, messages } = await openSocket({ host, port, timeoutMs: args.timeoutMs });
    try {
      await authenticate(socket, messages, args.password, args.timeoutMs);
      socket.send(JSON.stringify({
        type: "reverse_control_request",
        requestId: "disabled-reverse",
        from: "Mac client",
      }));
      const response = await messages.next(args.timeoutMs, "disabled reverse response");
      assert.equal(response.type, "reverse_control_response");
      assert.equal(response.accepted, false);
      assert.equal(response.code, "LAN008");
      assert.equal(response.reverseControlMode, "disabled");
    } finally {
      socket.close();
    }
  });
  print("OK", "Disabled reverse control policy is advertised and rejected");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  await verifyUnauthenticatedRejected(args);
  await verifyDefaultDenied(args);
  await verifyLocalTemporaryGrant(args);
  await verifyMissingRequestIdRejected(args);
  await verifyExplicitAcceptMode(args);
  await verifyDisabledMode(args);
  print("OK", "Windows host reverse control tests passed");
}

main().catch((error) => {
  console.error(`[ERROR] ${error.stack || error.message}`);
  process.exit(1);
});
