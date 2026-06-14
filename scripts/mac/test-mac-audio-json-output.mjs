#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const scriptPath = "scripts/mac/observe-mac-audio.mjs";
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
  console.log(`Usage: node scripts/mac/test-mac-audio-json-output.mjs [options]

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

function makeDiscoveryPayload(port) {
  return {
    type: "lan_dual_discovery",
    deviceName: "Mac audio JSON test",
    platform: "macos",
    host: "127.0.0.1",
    port,
    protocolVersion: 1,
    role: "host",
    runtime: {
      processId: 12345,
      buildId: "audio-json-test",
      startedAt: "2026-06-14T00:00:00.000Z",
      uptimeSeconds: 10,
    },
    capabilities: {
      audio: true,
      audioMode: "system-pcm",
      audioCodec: "pcm-f32le",
    },
  };
}

function makeAudioFrame(frameId) {
  const payload = Buffer.alloc(960 * 2 * 4, frameId % 255);
  return {
    type: "audio_frame",
    frameId,
    timestamp: new Date().toISOString(),
    codec: "pcm-f32le",
    encoding: "pcm-f32le-base64",
    sampleRate: 48000,
    channels: 2,
    frames: 960,
    durationMs: 20,
    level: frameId % 2 === 0 ? 0.08 : 0.04,
    payload: payload.toString("base64"),
    payloadBytes: payload.length,
  };
}

async function withAudioServer(fn) {
  const port = await getFreePort();
  const clients = new Set();
  const server = http.createServer((request, response) => {
    if (request.url !== "/discovery") {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(makeDiscoveryPayload(port)));
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
    let audioTimer = null;
    let frameId = 0;

    function send(message) {
      socket.write(encodeTextFrame(JSON.stringify({
        id: `audio-json-test-${randomUUID()}`,
        timestamp: new Date().toISOString(),
        ...message,
      })));
    }

    function startAudio() {
      if (audioTimer) return;
      send({ type: "audio_status", status: "started", audioMode: "system-pcm", audioCodec: "pcm-f32le" });
      audioTimer = setInterval(() => {
        frameId += 1;
        send(makeAudioFrame(frameId));
      }, 20);
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
          send({ type: "hello_ack", hostName: "Mac audio JSON test", hostPlatform: "macos" });
        } else if (message.type === "auth_request") {
          send({ type: "auth_result", ok: true });
        } else if (message.type === "session_offer") {
          send({
            type: "session_answer",
            ok: true,
            audioEnabled: true,
            audioCodec: "pcm-f32le",
            audioMode: "system-pcm",
          });
          startAudio();
        }
      }
    });
    socket.on("close", () => {
      if (audioTimer) clearInterval(audioTimer);
      clients.delete(socket);
    });
    socket.on("error", () => {
      if (audioTimer) clearInterval(audioTimer);
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

function runObserver(port, extraArgs, timeoutMs) {
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
        "unused",
        "--durationMs",
        "260",
        "--timeoutMs",
        String(timeoutMs),
        "--json",
        "--requireFrameTimestamp",
        "--requireMonotonicTimestamp",
        "--maxFrameAgeMs",
        "1000",
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
  await withAudioServer(async (port) => {
    const result = await runObserver(port, ["--minFrames", "4", "--requireLevel", "--minLevel", "0.05"], timeoutMs);
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode !== 0 || result.timedOut) {
      throw new Error(
        `observe-mac-audio JSON success should pass. exit=${result.exitCode} timedOut=${result.timedOut}\n${output}`,
      );
    }
    const payload = parseJsonOutput(result.stdout, "observe-mac-audio JSON success");
    if (payload.ok !== true) {
      throw new Error(`JSON success should report ok=true.\n${result.stdout}`);
    }
    if (payload.observation?.frameCount < 4) {
      throw new Error(`JSON success frameCount too low.\n${result.stdout}`);
    }
    if (payload.observation?.codecs?.["pcm-f32le"] < 1) {
      throw new Error(`JSON success should count pcm-f32le frames.\n${result.stdout}`);
    }
    if (payload.observation?.level?.max < 0.05) {
      throw new Error(`JSON success max level too low.\n${result.stdout}`);
    }
    if (payload.session?.audioMode !== "system-pcm") {
      throw new Error(`JSON success session audio mode missing.\n${result.stdout}`);
    }
    if (String(result.stdout).includes("[OK]")) {
      throw new Error(`JSON stdout should not include text logs.\n${result.stdout}`);
    }
    print("OK", "observe-mac-audio JSON success output is parseable");
  });
}

async function assertJsonFailure(timeoutMs) {
  await withAudioServer(async (port) => {
    const result = await runObserver(port, ["--minFrames", "999"], timeoutMs);
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode === 0 || result.timedOut) {
      throw new Error(
        `observe-mac-audio JSON failure should fail. exit=${result.exitCode} timedOut=${result.timedOut}\n${output}`,
      );
    }
    const payload = parseJsonOutput(result.stdout, "observe-mac-audio JSON failure");
    if (payload.ok !== false) {
      throw new Error(`JSON failure should report ok=false.\n${result.stdout}`);
    }
    if (!String(payload.error?.message || "").includes("audio frames")) {
      throw new Error(`JSON failure error message missing frame failure.\n${result.stdout}`);
    }
    if (!payload.observation || payload.observation.frameCount <= 0) {
      throw new Error(`JSON failure should retain partial observation.\n${result.stdout}`);
    }
    print("OK", "observe-mac-audio JSON failure keeps partial observation");
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  await assertJsonSuccess(args.timeoutMs);
  await assertJsonFailure(args.timeoutMs);
  print("OK", "Mac audio JSON output self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
