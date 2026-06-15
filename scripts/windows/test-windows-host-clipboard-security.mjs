import assert from "node:assert/strict";
import net from "node:net";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  host: "127.0.0.1",
  port: 0,
  password: "demo-password",
  timeoutMs: 10000,
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-host-clipboard-security.mjs [options]

Options:
  --host <host>          Bind/connect host. Default: ${defaults.host}
  --port <port>          Bind port. Default: 0 (auto)
  --password <password>  Temporary test password. Default: ${defaults.password}
  --timeoutMs <ms>       Per-step timeout. Default: ${defaults.timeoutMs}
  --help, -h             Show this help without starting a host

Description:
  Starts an in-process Windows host and exercises file clipboard abuse cases
  through the real WebSocket protocol path. It does not touch the system
  clipboard, send input, or require a formal password.
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
    if (token === "--port" && next && !next.startsWith("--")) {
      args.port = Number(next) || 0;
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
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`discovery did not become ready${lastError ? `: ${lastError.message}` : ""}`);
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

async function openAuthenticatedSocket({ host, port, password, timeoutMs }) {
  const socket = new WebSocket(`ws://${host}:${port}`);
  await withTimeout(new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("WebSocket open failed")), { once: true });
  }), timeoutMs, "WebSocket open");
  const messages = makeQueue(socket);
  socket.send(JSON.stringify({ type: "hello" }));
  const hello = await messages.next(timeoutMs, "hello_ack");
  assert.equal(hello.type, "hello_ack", `expected hello_ack, got ${JSON.stringify(hello)}`);
  socket.send(JSON.stringify({ type: "auth_request", password }));
  const auth = await messages.next(timeoutMs, "auth_result");
  assert.equal(auth.type, "auth_result", `expected auth_result, got ${JSON.stringify(auth)}`);
  assert.equal(auth.ok, true, `auth failed: ${JSON.stringify(auth)}`);
  return { socket, messages };
}

function send(socket, message) {
  socket.send(JSON.stringify(message));
}

async function expectMessage(messages, timeoutMs, type, label) {
  const message = await messages.next(timeoutMs, label);
  assert.equal(message.type, type, `${label}: expected ${type}, got ${JSON.stringify(message)}`);
  return message;
}

function assertRejected(message, label) {
  assert.equal(message.accepted, false, `${label}: expected accepted=false, got ${JSON.stringify(message)}`);
  assert.equal(message.code, "LAN010", `${label}: expected LAN010`);
  assert.ok(message.reason, `${label}: expected reason`);
}

function assertAccepted(message, label) {
  assert.equal(message.accepted, true, `${label}: expected accepted=true, got ${JSON.stringify(message)}`);
}

function offerMessage(transferId, files, extra = {}) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return {
    type: "clipboard_file_offer",
    transferId,
    direction: "client_to_host",
    totalBytes,
    fileCount: files.length,
    maxChunkBytes: 64 * 1024,
    files,
    ...extra,
  };
}

function chunkMessage(transferId, { fileIndex = 0, chunkIndex = 0, offset = 0, value = "" } = {}) {
  const chunk = Buffer.from(value);
  return {
    type: "clipboard_file_chunk",
    transferId,
    fileIndex,
    chunkIndex,
    offset,
    bytes: chunk.length,
    encoding: "base64",
    dataBase64: chunk.toString("base64"),
  };
}

async function assertNoOfferChunkRejected(socket, messages, timeoutMs) {
  send(socket, chunkMessage("host-security-no-offer", { value: "x" }));
  const result = await expectMessage(messages, timeoutMs, "clipboard_file_progress", "no-offer chunk response");
  assertRejected(result, "no-offer chunk response");
  print("OK", "WebSocket chunk without offer is rejected");
}

async function assertOfferLimitsRejected(socket, messages, timeoutMs) {
  send(socket, offerMessage("host-security-total-limit", [
    { index: 0, name: "too-large.bin", size: 9 },
  ]));
  const total = await expectMessage(messages, timeoutMs, "clipboard_file_response", "total limit offer response");
  assertRejected(total, "total limit offer response");

  send(socket, offerMessage("host-security-count-limit", [
    { index: 0, name: "a.txt", size: 1 },
    { index: 1, name: "b.txt", size: 1 },
    { index: 2, name: "c.txt", size: 1 },
  ]));
  const count = await expectMessage(messages, timeoutMs, "clipboard_file_response", "count limit offer response");
  assertRejected(count, "count limit offer response");
  print("OK", "WebSocket offer total size and file count limits are enforced");
}

async function assertOversizedChunkRejected(socket, messages, timeoutMs) {
  const transferId = "host-security-oversized";
  send(socket, offerMessage(transferId, [{ index: 0, name: "large.bin", size: 5 }]));
  const offer = await expectMessage(messages, timeoutMs, "clipboard_file_response", "oversized offer response");
  assertAccepted(offer, "oversized offer response");
  assert.equal(offer.maxChunkBytes, 4, "offer response should clamp maxChunkBytes to test limit");

  send(socket, chunkMessage(transferId, { value: "abcde" }));
  const progress = await expectMessage(messages, timeoutMs, "clipboard_file_progress", "oversized chunk response");
  assertRejected(progress, "oversized chunk response");

  send(socket, { type: "clipboard_file_complete", transferId, totalBytes: 5, fileCount: 1 });
  const complete = await expectMessage(messages, timeoutMs, "clipboard_file_result", "oversized complete response");
  assertRejected(complete, "oversized complete response");
  print("OK", "WebSocket oversized chunks cannot complete");
}

async function assertOverlapRejectedButValidTailCompletes(socket, messages, timeoutMs) {
  const transferId = "host-security-overlap";
  send(socket, offerMessage(transferId, [{ index: 0, name: "data.txt", size: 4 }]));
  assertAccepted(await expectMessage(messages, timeoutMs, "clipboard_file_response", "overlap offer"), "overlap offer");

  send(socket, chunkMessage(transferId, { chunkIndex: 0, offset: 0, value: "ab" }));
  const first = await expectMessage(messages, timeoutMs, "clipboard_file_progress", "first chunk");
  assertAccepted(first, "first chunk");
  assert.equal(first.receivedBytes, 2);

  send(socket, chunkMessage(transferId, { chunkIndex: 0, offset: 0, value: "ab" }));
  assertRejected(await expectMessage(messages, timeoutMs, "clipboard_file_progress", "duplicate chunk"), "duplicate chunk");

  send(socket, chunkMessage(transferId, { chunkIndex: 1, offset: 1, value: "bc" }));
  assertRejected(await expectMessage(messages, timeoutMs, "clipboard_file_progress", "overlap chunk"), "overlap chunk");

  send(socket, chunkMessage(transferId, { chunkIndex: 2, offset: 2, value: "cd" }));
  const tail = await expectMessage(messages, timeoutMs, "clipboard_file_progress", "tail chunk");
  assertAccepted(tail, "tail chunk");
  assert.equal(tail.receivedBytes, 4);

  send(socket, { type: "clipboard_file_complete", transferId, totalBytes: 4, fileCount: 1 });
  const complete = await expectMessage(messages, timeoutMs, "clipboard_file_result", "overlap complete");
  assertAccepted(complete, "overlap complete");
  assert.equal(complete.receivedBytes, 4);
  assert.equal(complete.saveMode, "temp");
  print("OK", "WebSocket duplicate/overlap chunks are rejected without breaking valid completion");
}

async function assertIncompleteRejected(socket, messages, timeoutMs) {
  const transferId = "host-security-incomplete";
  send(socket, offerMessage(transferId, [{ index: 0, name: "partial.txt", size: 4 }]));
  assertAccepted(await expectMessage(messages, timeoutMs, "clipboard_file_response", "incomplete offer"), "incomplete offer");
  send(socket, chunkMessage(transferId, { value: "ab" }));
  assertAccepted(await expectMessage(messages, timeoutMs, "clipboard_file_progress", "partial chunk"), "partial chunk");
  send(socket, { type: "clipboard_file_complete", transferId, totalBytes: 4, fileCount: 1 });
  const complete = await expectMessage(messages, timeoutMs, "clipboard_file_result", "incomplete complete");
  assertRejected(complete, "incomplete complete");
  assert.match(complete.reason, /未接收完整/);
  print("OK", "WebSocket incomplete files are rejected on completion");
}

async function assertBytesMismatchAndBadIndexRejected(socket, messages, timeoutMs) {
  const transferId = "host-security-field-validation";
  send(socket, offerMessage(transferId, [{ index: 0, name: "fields.txt", size: 4 }]));
  assertAccepted(await expectMessage(messages, timeoutMs, "clipboard_file_response", "field offer"), "field offer");

  send(socket, {
    ...chunkMessage(transferId, { value: "ab" }),
    bytes: 3,
  });
  assertRejected(await expectMessage(messages, timeoutMs, "clipboard_file_progress", "bytes mismatch"), "bytes mismatch");

  send(socket, chunkMessage(transferId, { fileIndex: 1, value: "ab" }));
  assertRejected(await expectMessage(messages, timeoutMs, "clipboard_file_progress", "bad file index"), "bad file index");

  send(socket, { type: "clipboard_file_complete", transferId, totalBytes: 4, fileCount: 1 });
  assertRejected(await expectMessage(messages, timeoutMs, "clipboard_file_result", "field validation complete"), "field validation complete");
  print("OK", "WebSocket bytes mismatch and bad fileIndex are rejected");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const port = args.port || await getFreePort(args.host);
  const previousEnv = {
    LAN_DUAL_WINDOWS_SCREEN_MODE: process.env.LAN_DUAL_WINDOWS_SCREEN_MODE,
    LAN_DUAL_WINDOWS_CLIPBOARD_MODE: process.env.LAN_DUAL_WINDOWS_CLIPBOARD_MODE,
    LAN_DUAL_WINDOWS_CLIPBOARD_MAX_CHUNK_BYTES: process.env.LAN_DUAL_WINDOWS_CLIPBOARD_MAX_CHUNK_BYTES,
    LAN_DUAL_WINDOWS_CLIPBOARD_MAX_FILE_COUNT: process.env.LAN_DUAL_WINDOWS_CLIPBOARD_MAX_FILE_COUNT,
    LAN_DUAL_WINDOWS_CLIPBOARD_MAX_TOTAL_BYTES: process.env.LAN_DUAL_WINDOWS_CLIPBOARD_MAX_TOTAL_BYTES,
  };
  process.env.LAN_DUAL_WINDOWS_SCREEN_MODE = "mock";
  process.env.LAN_DUAL_WINDOWS_CLIPBOARD_MODE = "memory";
  process.env.LAN_DUAL_WINDOWS_CLIPBOARD_MAX_CHUNK_BYTES = "4";
  process.env.LAN_DUAL_WINDOWS_CLIPBOARD_MAX_FILE_COUNT = "2";
  process.env.LAN_DUAL_WINDOWS_CLIPBOARD_MAX_TOTAL_BYTES = "8";

  const { createWindowsHostServer } = await import("../../apps/windows-host/src/windows-host-service.mjs");
  const service = createWindowsHostServer({
    host: args.host,
    port,
    password: args.password,
    buildId: "clipboard-security-test",
    logger: {
      info() {},
      warn() {},
    },
  });

  let socket = null;
  try {
    await service.listen();
    const discovery = await waitForDiscovery(args.host, port, args.timeoutMs);
    assert.equal(discovery.capabilities?.clipboardFile, true, "discovery should advertise file clipboard");
    print("OK", `Temporary Windows host ready on ${args.host}:${port}`);

    const session = await openAuthenticatedSocket({
      host: args.host,
      port,
      password: args.password,
      timeoutMs: args.timeoutMs,
    });
    socket = session.socket;
    print("OK", "WebSocket authenticated");

    await assertNoOfferChunkRejected(socket, session.messages, args.timeoutMs);
    await assertOfferLimitsRejected(socket, session.messages, args.timeoutMs);
    await assertOversizedChunkRejected(socket, session.messages, args.timeoutMs);
    await assertOverlapRejectedButValidTailCompletes(socket, session.messages, args.timeoutMs);
    await assertIncompleteRejected(socket, session.messages, args.timeoutMs);
    await assertBytesMismatchAndBadIndexRejected(socket, session.messages, args.timeoutMs);
    print("OK", "Windows host clipboard WebSocket security checks passed");
  } finally {
    socket?.close();
    await service.close().catch(() => {});
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error.stack || error.message}`);
  process.exitCode = 1;
});
