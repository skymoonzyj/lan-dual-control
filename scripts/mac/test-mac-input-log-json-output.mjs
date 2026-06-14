#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const scriptPath = "scripts/mac/smoke-mac-input-log.mjs";
const websocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const defaults = {
  timeoutMs: 10000,
};

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

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-input-log-json-output.mjs [options]

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks
`);
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

async function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = net.createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

function makeAcceptKey(key) {
  return createHash("sha1")
    .update(`${key}${websocketGuid}`)
    .digest("base64");
}

function encodeTextFrame(payload) {
  const body = Buffer.from(payload, "utf8");
  if (body.length < 126) {
    return Buffer.concat([Buffer.from([0x81, body.length]), body]);
  }
  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(body.length, 2);
  return Buffer.concat([header, body]);
}

function decodeFrames(buffer) {
  const messages = [];
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      if (buffer.length - offset < 4) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (buffer.length - offset < 10) break;
      length = Number(buffer.readBigUInt64BE(offset + 2));
      headerLength = 10;
    }
    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + length;
    if (buffer.length - offset < frameLength) break;
    if (opcode === 0x8) {
      messages.push("__close__");
      offset += frameLength;
      continue;
    }
    if (opcode !== 0x1) {
      offset += frameLength;
      continue;
    }
    const maskStart = offset + headerLength;
    const payloadStart = maskStart + maskLength;
    const payload = Buffer.from(buffer.subarray(payloadStart, payloadStart + length));
    if (masked) {
      const mask = buffer.subarray(maskStart, maskStart + 4);
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }
    messages.push(payload.toString("utf8"));
    offset += frameLength;
  }
  return { messages, rest: buffer.subarray(offset) };
}

function makeDiscoveryPayload(port, inputMode) {
  return {
    type: "lan_dual_discovery",
    deviceName: "Mac input JSON test",
    platform: "macos",
    host: "127.0.0.1",
    port,
    protocolVersion: 1,
    role: "host",
    runtime: {
      processId: 12345,
      buildId: "input-json-test",
      startedAt: "2026-06-14T00:00:00.000Z",
      uptimeSeconds: 10,
    },
    capabilities: {
      input: true,
      inputMode,
    },
  };
}

async function withInputServer(inputMode, fn) {
  const port = await getFreePort();
  const clients = new Set();
  const server = http.createServer((request, response) => {
    if (request.url !== "/discovery") {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(makeDiscoveryPayload(port, inputMode)));
  });

  server.on("upgrade", (request, socket) => {
    const key = request.headers["sec-websocket-key"];
    if (!key) {
      socket.destroy();
      return;
    }
    socket.write([
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${makeAcceptKey(key)}`,
      "\r\n",
    ].join("\r\n"));

    clients.add(socket);
    let buffer = Buffer.alloc(0);

    function send(message) {
      socket.write(encodeTextFrame(JSON.stringify({
        id: `input-json-test-${randomUUID()}`,
        timestamp: new Date().toISOString(),
        ...message,
      })));
    }

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const decoded = decodeFrames(buffer);
      buffer = decoded.rest;
      for (const body of decoded.messages) {
        if (body === "__close__") {
          socket.end();
          continue;
        }
        let message;
        try {
          message = JSON.parse(body);
        } catch {
          continue;
        }
        if (message.type === "hello") {
          send({ type: "hello_ack", hostName: "Mac input JSON test", hostPlatform: "macos" });
        } else if (message.type === "auth_request") {
          send({ type: "auth_result", ok: true });
        } else if (message.type === "session_offer") {
          send({
            type: "session_answer",
            ok: true,
            inputMode,
            videoCodec: "none",
            width: 640,
            height: 360,
          });
        } else if (message.type === "input_event") {
          send({
            type: "input_ack",
            inputId: message.id,
            sequence: message.sequence,
            event: message.event,
            accepted: true,
            mode: "log",
            injected: false,
          });
        }
      }
    });
    socket.on("close", () => {
      clients.delete(socket);
    });
    socket.on("error", () => {
      clients.delete(socket);
    });
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", resolveListen);
  });

  try {
    return await fn(port);
  } finally {
    for (const socket of clients) {
      socket.destroy();
    }
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

function runSmoke(port, extraArgs, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(
      process.execPath,
      [
        scriptPath,
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--password",
        "super-secret-input-json-test",
        "--timeoutMs",
        String(timeoutMs),
        "--json",
        ...extraArgs,
      ],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({ exitCode: null, timedOut: true, stdout, stderr });
    }, timeoutMs + 1000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({ exitCode: null, timedOut: false, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({ exitCode, timedOut: false, stdout, stderr });
    });
  });
}

function parseJsonOutput(stdout, label) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${label} did not print parseable JSON: ${error.message}\nStdout:\n${stdout}`);
  }
}

async function assertJsonSuccess(timeoutMs) {
  await withInputServer("log", async (port) => {
    const result = await runSmoke(port, [], timeoutMs);
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode !== 0 || result.timedOut) {
      throw new Error(`smoke-mac-input-log JSON success should pass. exit=${result.exitCode} timedOut=${result.timedOut}\n${output}`);
    }
    const payload = parseJsonOutput(result.stdout, "smoke-mac-input-log JSON success");
    if (payload.ok !== true) {
      throw new Error(`JSON success should report ok=true.\n${result.stdout}`);
    }
    if (payload.discovery?.inputMode !== "log") {
      throw new Error(`JSON success should report discovery inputMode=log.\n${result.stdout}`);
    }
    if (payload.session?.inputMode !== "log") {
      throw new Error(`JSON success should report session inputMode=log.\n${result.stdout}`);
    }
    if (payload.input?.attempted !== 16 || payload.input?.acknowledged !== 16) {
      throw new Error(`JSON success should acknowledge 16 input events.\n${result.stdout}`);
    }
    if (!Array.isArray(payload.input?.cases) || payload.input.cases.length !== 16) {
      throw new Error(`JSON success should include 16 input case summaries.\n${result.stdout}`);
    }
    if (payload.input.cases.some((item) => item.mode !== "log" || item.injected !== false || item.accepted !== true)) {
      throw new Error(`JSON success should keep every ack in log-only mode.\n${result.stdout}`);
    }
    if (String(result.stdout).includes("[OK]") || String(result.stdout).includes("[INFO]")) {
      throw new Error(`JSON stdout should not include text logs.\n${result.stdout}`);
    }
    if (String(result.stdout).includes("super-secret-input-json-test")) {
      throw new Error(`JSON stdout should not include the input smoke password.\n${result.stdout}`);
    }
    print("OK", "smoke-mac-input-log JSON success output is parseable");
  });
}

async function assertJsonRefusesInjectMode(timeoutMs) {
  await withInputServer("inject", async (port) => {
    const result = await runSmoke(port, [], timeoutMs);
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode === 0 || result.timedOut) {
      throw new Error(`smoke-mac-input-log JSON inject-mode guard should fail. exit=${result.exitCode} timedOut=${result.timedOut}\n${output}`);
    }
    const payload = parseJsonOutput(result.stdout, "smoke-mac-input-log JSON inject-mode guard");
    if (payload.ok !== false) {
      throw new Error(`JSON inject-mode guard should report ok=false.\n${result.stdout}`);
    }
    if (payload.discovery?.inputMode !== "inject") {
      throw new Error(`JSON inject-mode guard should keep discovery inputMode=inject.\n${result.stdout}`);
    }
    if (payload.input?.attempted !== 0 || payload.input?.acknowledged !== 0) {
      throw new Error(`JSON inject-mode guard should not send input events.\n${result.stdout}`);
    }
    if (!String(payload.error?.message || "").includes("Refusing to send input events")) {
      throw new Error(`JSON inject-mode guard error should explain refusal.\n${result.stdout}`);
    }
    if (String(result.stdout).includes("super-secret-input-json-test")) {
      throw new Error(`JSON failure should redact password.\n${result.stdout}`);
    }
    print("OK", "smoke-mac-input-log JSON refuses non-log discovery mode");
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  await assertJsonSuccess(args.timeoutMs);
  await assertJsonRefusesInjectMode(args.timeoutMs);
  print("OK", "Mac input log JSON output self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
