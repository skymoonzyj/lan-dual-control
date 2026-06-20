#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const scriptPath = "scripts/mac/observe-mac-video.mjs";
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
  console.log(`Usage: node scripts/mac/test-mac-video-json-output.mjs [options]

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
    deviceName: "Mac video JSON test",
    platform: "macos",
    host: "127.0.0.1",
    port,
    protocolVersion: 1,
    role: "host",
    runtime: {
      processId: 12345,
      buildId: "video-json-test",
      startedAt: "2026-06-14T00:00:00.000Z",
      uptimeSeconds: 10,
    },
    capabilities: {
      displays: [
        { id: "main", name: "Main", width: 1280, height: 720, primary: true },
      ],
    },
  };
}

function makeAnnexBPayload(nalTypes) {
  const chunks = [];
  for (const nalType of nalTypes) {
    chunks.push(Buffer.from([0x00, 0x00, 0x00, 0x01, nalType & 0x1f, 0x88, 0x84, 0x21]));
  }
  return Buffer.concat(chunks);
}

function makeVideoFrame(frameId, options = {}) {
  const timestampUs = 1_000_000 + frameId * 33_333;
  const keyFrame = options.keyframes !== false && (frameId === 1 || frameId % 3 === 0);
  const payload = keyFrame
    ? makeAnnexBPayload(options.omitParameterSets ? [1] : [7, 8, 5])
    : makeAnnexBPayload([1]);
  return {
    type: "video_frame",
    frameId,
    timestamp: new Date().toISOString(),
    timestampUs,
    durationUs: 33_333,
    width: 1280,
    height: 720,
    codec: "h264",
    encoding: "annexb-base64",
    keyFrame,
    capturePipeline: "screencapturekit-h264",
    activeDisplayId: "main",
    displayName: "Main",
    payload: payload.toString("base64"),
    payloadBytes: payload.length,
  };
}

async function withVideoServer(fn, options = {}) {
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
    let videoTimer = null;
    let frameId = 0;

    function send(message) {
      socket.write(encodeTextFrame(JSON.stringify({
        id: `video-json-test-${randomUUID()}`,
        timestamp: new Date().toISOString(),
        ...message,
      })));
    }

    function startVideo() {
      if (videoTimer) return;
      videoTimer = setInterval(() => {
        frameId += 1;
        send(makeVideoFrame(frameId, options));
      }, 35);
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
          send({ type: "hello_ack", hostName: "Mac video JSON test", hostPlatform: "macos" });
        } else if (message.type === "auth_request") {
          send({ type: "auth_result", ok: true });
        } else if (message.type === "session_offer") {
          send({
            type: "session_answer",
            ok: true,
            width: 1280,
            height: 720,
            fps: 30,
            requestedFps: Number(message.maxFps) || 30,
            maxBandwidthKbps: Number(message.maxBandwidthKbps) || 12000,
            videoCodec: "h264",
            videoEncoding: "annexb-base64",
            capturePipeline: "screencapturekit-h264",
            activeDisplayId: "main",
            displayName: "Main",
          });
          startVideo();
        }
      }
    });
    socket.on("close", () => {
      if (videoTimer) clearInterval(videoTimer);
      clients.delete(socket);
    });
    socket.on("error", () => {
      if (videoTimer) clearInterval(videoTimer);
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
        "350",
        "--timeoutMs",
        String(timeoutMs),
        "--json",
        "--progressIntervalMs",
        "100",
        "--requireH264",
        "--requireFrameTimestamp",
        "--requireMonotonicTimestampUs",
        "--expectActiveDisplayId",
        "main",
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
  await withVideoServer(async (port) => {
    const result = await runObserver(port, ["--minFrames", "4", "--minFps", "5", "--requireH264Keyframe"], timeoutMs);
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode !== 0 || result.timedOut) {
      throw new Error(
        `observe-mac-video JSON success should pass. exit=${result.exitCode} timedOut=${result.timedOut}\n${output}`,
      );
    }
    const payload = parseJsonOutput(result.stdout, "observe-mac-video JSON success");
    if (payload.ok !== true) {
      throw new Error(`JSON success should report ok=true.\n${result.stdout}`);
    }
    if (payload.observation?.frameCount < 4) {
      throw new Error(`JSON success frameCount too low.\n${result.stdout}`);
    }
    if (payload.observation?.codecs?.h264 < 1) {
      throw new Error(`JSON success should count h264 frames.\n${result.stdout}`);
    }
    if (!payload.observation?.h264 || Number(payload.observation.h264.keyFrames) < 1) {
      throw new Error(`JSON success should count H.264 keyframes.\n${result.stdout}`);
    }
    if (!Number.isFinite(Number(payload.observation.h264.deltaFrames)) || Number(payload.observation.h264.deltaFrames) < 1) {
      throw new Error(`JSON success should count H.264 delta frames.\n${result.stdout}`);
    }
    if (Number(payload.observation.h264.spsFrames) < 1 || Number(payload.observation.h264.ppsFrames) < 1 || Number(payload.observation.h264.idrFrames) < 1) {
      throw new Error(`JSON success should count H.264 SPS/PPS/IDR frames.\n${result.stdout}`);
    }
    if (Number(payload.observation.h264.keyFramesWithParameterSets) < 1) {
      throw new Error(`JSON success should count H.264 keyframes with parameter sets.\n${result.stdout}`);
    }
    if (Number(payload.observation.h264.keyFramesWithoutParameterSets) !== 0) {
      throw new Error(`JSON success should count H.264 keyframes missing parameter sets.\n${result.stdout}`);
    }
    if (payload.observation.h264.firstKeyFrameHasParameterSets !== true) {
      throw new Error(`JSON success should mark first H.264 keyframe parameter sets.\n${result.stdout}`);
    }
    if (payload.observation.h264.lastKeyFrameHasParameterSets !== true) {
      throw new Error(`JSON success should mark latest H.264 keyframe parameter sets.\n${result.stdout}`);
    }
    if ((payload.observation.h264.lastKeyFrameNalTypes || []).join(",") !== "7,8,5") {
      throw new Error(`JSON success should report last H.264 keyframe NAL types.\n${result.stdout}`);
    }
    if ((payload.observation.h264.lastNalTypes || []).join(",") !== "1") {
      throw new Error(`JSON success should report last H.264 frame NAL types.\n${result.stdout}`);
    }
    if (Number(payload.observation.h264.keyFrameIntervalFrames?.count) < 1 || Number(payload.observation.h264.keyFrameIntervalFrames?.max) !== 3) {
      throw new Error(`JSON success should report H.264 keyframe interval frames.\n${result.stdout}`);
    }
    if (Number(payload.observation.h264.keyFrameIntervalMs?.count) < 1 || Number(payload.observation.h264.keyFrameIntervalMs?.max) < 90) {
      throw new Error(`JSON success should report H.264 keyframe interval timing.\n${result.stdout}`);
    }
    if (!Number.isFinite(Number(payload.observation.h264.keyFrameIntervalFrames?.last)) || Number(payload.observation.h264.keyFrameIntervalFrames.last) <= 0) {
      throw new Error(`JSON success should report latest H.264 keyframe interval frames.\n${result.stdout}`);
    }
    if (!Number.isFinite(Number(payload.observation.h264.keyFrameIntervalMs?.last)) || Number(payload.observation.h264.keyFrameIntervalMs.last) <= 0) {
      throw new Error(`JSON success should report latest H.264 keyframe interval timing.\n${result.stdout}`);
    }
    if (!Number.isFinite(Number(payload.observation.h264.keyFrameTailGapFrames)) || Number(payload.observation.h264.keyFrameTailGapFrames) < 0) {
      throw new Error(`JSON success should report H.264 tail frame gap after the last keyframe.\n${result.stdout}`);
    }
    if (!Number.isFinite(Number(payload.observation.h264.keyFrameTailGapMs)) || Number(payload.observation.h264.keyFrameTailGapMs) < 0) {
      throw new Error(`JSON success should report H.264 tail time gap after the last keyframe.\n${result.stdout}`);
    }
    if (payload.observation?.activeDisplayIds?.main < 1) {
      throw new Error(`JSON success should count activeDisplayId main.\n${result.stdout}`);
    }
    if (payload.session?.capturePipeline !== "screencapturekit-h264") {
      throw new Error(`JSON success session pipeline missing.\n${result.stdout}`);
    }
    if (String(result.stdout).includes("[OK]")) {
      throw new Error(`JSON stdout should not include text logs.\n${result.stdout}`);
    }
    if (!String(result.stderr).includes("Video progress:")) {
      throw new Error(`JSON stderr should include progress heartbeat.\n${result.stderr}`);
    }
    print("OK", "observe-mac-video JSON success output is parseable");
  });
}

async function assertH264KeyframeRequirementFailure(timeoutMs) {
  await withVideoServer(async (port) => {
    const result = await runObserver(port, ["--minFrames", "4", "--requireH264Keyframe"], timeoutMs);
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode === 0 || result.timedOut) {
      throw new Error(
        `observe-mac-video should fail when required H.264 keyframe SPS/PPS/IDR are absent. exit=${result.exitCode} timedOut=${result.timedOut}\n${output}`,
      );
    }
    const payload = parseJsonOutput(result.stdout, "observe-mac-video H.264 keyframe failure");
    if (payload.ok !== false) {
      throw new Error(`H.264 keyframe failure should report ok=false.\n${result.stdout}`);
    }
    if (!String(payload.error?.message || "").includes("H.264 keyframe")) {
      throw new Error(`H.264 keyframe failure should mention missing keyframe evidence.\n${result.stdout}`);
    }
    print("OK", "observe-mac-video fails when required H.264 keyframe evidence is missing");
  }, { omitParameterSets: true });
}

async function assertJsonFailure(timeoutMs) {
  await withVideoServer(async (port) => {
    const result = await runObserver(port, ["--minFrames", "999"], timeoutMs);
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode === 0 || result.timedOut) {
      throw new Error(
        `observe-mac-video JSON failure should fail. exit=${result.exitCode} timedOut=${result.timedOut}\n${output}`,
      );
    }
    const payload = parseJsonOutput(result.stdout, "observe-mac-video JSON failure");
    if (payload.ok !== false) {
      throw new Error(`JSON failure should report ok=false.\n${result.stdout}`);
    }
    if (!String(payload.error?.message || "").includes("video frames")) {
      throw new Error(`JSON failure error message missing frame failure.\n${result.stdout}`);
    }
    if (!payload.observation || payload.observation.frameCount <= 0) {
      throw new Error(`JSON failure should retain partial observation.\n${result.stdout}`);
    }
    if (!String(result.stderr).includes("Video progress:")) {
      throw new Error(`JSON failure stderr should include progress heartbeat.\n${result.stderr}`);
    }
    print("OK", "observe-mac-video JSON failure keeps partial observation");
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  await assertJsonSuccess(args.timeoutMs);
  await assertH264KeyframeRequirementFailure(args.timeoutMs);
  await assertJsonFailure(args.timeoutMs);
  print("OK", "Mac video JSON output self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
