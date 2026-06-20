#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import http from "node:http";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/observe-mac-media.mjs";
const websocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const defaults = {
  timeoutMs: 20000,
};

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-media-json-output.mjs [options]

Options:
  --timeoutMs <ms>  Per aggregate command timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Verifies the Mac media observation aggregator with a temporary fake Mac host.
The fake host only returns protocol media frames; it does not start or touch
the real Mac host, play audio, send input, or execute inject.
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
      args.timeoutMs = clampInteger(next, 5000, 120000, defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function outputOf(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

function assertNoSecretLikeText(text, label) {
  assert(!/super-secret-mac-media/.test(text), `${label} leaked secret-like password text`);
  assert(!/token=/i.test(text), `${label} should not print token-like text`);
}

function runMediaSync(extraArgs, args, env = {}) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
      ...env,
    },
  });
}

function runMediaAsync(extraArgs, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...extraArgs], {
      cwd: repoRoot,
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: "",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000);
    }, args.timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr });
    });
  });
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = runMediaSync([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0; status=${result.status} signal=${result.signal || "none"} error=${result.error?.message || "none"} output=${outputOf(result).slice(0, 500)}`);
    assert(/\bUsage\b/.test(result.stdout), `${script} ${flag} should print Usage`);
    assert(!/password/i.test(result.stderr || ""), `${script} ${flag} should not prompt for password`);
  }
  print("OK", "Mac media observer help exits quickly");
}

function checkSourceDoesNotPassPasswordArg() {
  const source = readFileSync(new URL("./observe-mac-media.mjs", import.meta.url), "utf8");
  for (const childScript of ["observe-mac-video.mjs", "observe-mac-audio.mjs"]) {
    const index = source.indexOf(childScript);
    assert(index >= 0, `media observer should reference ${childScript}`);
  }
  const childArgBuilders = [
    functionBody(source, "makeVideoArgs"),
    functionBody(source, "makeAudioArgs"),
  ].join("\n");
  assert(
    !childArgBuilders.includes('"--password"') && !childArgBuilders.includes("'--password'"),
    "media observer should not pass --password argv to child observers",
  );
  assert(source.includes("env.LAN_DUAL_PASSWORD"), "media observer should pass password through LAN_DUAL_PASSWORD");
  assert(source.includes('"--progressIntervalMs"'), "media observer should forward --progressIntervalMs to child observers");
  print("OK", "Child media observers receive the password through environment, not argv");
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert(start >= 0, `missing function ${name}`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, nextFunction >= 0 ? nextFunction : source.length);
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
    deviceName: "Mac media observer fake host",
    platform: "macos",
    host: "127.0.0.1",
    port,
    protocolVersion: 1,
    role: "host",
    runtime: {
      processId: process.pid,
      buildId: "mac-media-json-test",
      startedAt: "2026-06-16T00:00:00.000Z",
      uptimeSeconds: 10,
    },
    permissions: {
      screenRecording: true,
      accessibility: true,
      inputMonitoring: true,
    },
    capabilities: {
      h264Stream: true,
      audio: true,
      audioMode: "system-pcm",
      audioCodec: "pcm-f32le",
      inputMode: "log",
      displays: [
        { id: "main", name: "Main", width: 1280, height: 720, primary: true },
      ],
    },
  };
}

function makeEnvelope(message) {
  return JSON.stringify({
    id: `${message.type}-${randomUUID()}`,
    timestamp: new Date().toISOString(),
    ...message,
  });
}

function makeAnnexBPayload(nalTypes) {
  const chunks = [];
  for (const nalType of nalTypes) {
    chunks.push(Buffer.from([0x00, 0x00, 0x00, 0x01, nalType & 0x1f, 0x88, 0x84, 0x21]));
  }
  return Buffer.concat(chunks);
}

function makeVideoFrame(frameId) {
  const timestampUs = 1_000_000 + frameId * 33_333;
  const keyFrame = frameId === 1 || frameId % 5 === 0;
  const payload = keyFrame ? makeAnnexBPayload([7, 8, 5]) : makeAnnexBPayload([1]);
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

function makeAudioFrame(frameId) {
  const payloadBytes = 7680;
  return {
    type: "audio_frame",
    frameId,
    timestamp: new Date().toISOString(),
    codec: "pcm-f32le",
    encoding: "pcm-f32le-base64",
    sampleRate: 48000,
    channels: 2,
    frames: 960,
    level: frameId % 2 === 0 ? 0.08 : 0.04,
    payload: Buffer.alloc(payloadBytes, frameId % 255).toString("base64"),
    payloadBytes,
  };
}

async function withFakeMacHost(fn) {
  const port = await getFreePort();
  const sockets = new Set();
  const timers = new Set();
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

    sockets.add(socket);
    let buffer = Buffer.alloc(0);
    let videoTimer = null;
    let audioTimer = null;
    let videoFrameId = 0;
    let audioFrameId = 0;

    function send(message) {
      socket.write(encodeTextFrame(makeEnvelope(message)));
    }
    function startVideo() {
      if (videoTimer) return;
      videoTimer = setInterval(() => {
        videoFrameId += 1;
        send(makeVideoFrame(videoFrameId));
      }, 30);
      timers.add(videoTimer);
    }
    function startAudio() {
      if (audioTimer) return;
      send({ type: "audio_status", status: "started", audioMode: "system-pcm", audioCodec: "pcm-f32le" });
      audioTimer = setInterval(() => {
        audioFrameId += 1;
        send(makeAudioFrame(audioFrameId));
      }, 20);
      timers.add(audioTimer);
    }
    function stopTimers() {
      if (videoTimer) clearInterval(videoTimer);
      if (audioTimer) clearInterval(audioTimer);
      timers.delete(videoTimer);
      timers.delete(audioTimer);
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
          send({
            type: "hello_ack",
            hostName: "Mac media observer fake host",
            hostPlatform: "macos",
            runtime: makeDiscoveryPayload(port).runtime,
          });
        } else if (message.type === "auth_request") {
          send({ type: "auth_result", ok: true });
        } else if (message.type === "session_offer") {
          send({
            type: "session_answer",
            ok: true,
            width: 1280,
            height: 720,
            fps: message.maxFps || 30,
            requestedFps: message.maxFps || 30,
            inputMode: "log",
            videoCodec: message.wantVideo ? "h264" : "none",
            videoEncoding: message.wantVideo ? "annexb-base64" : "",
            capturePipeline: message.wantVideo ? "screencapturekit-h264" : "",
            activeDisplayId: "main",
            displayName: "Main",
            audioEnabled: message.wantAudio === true,
            audioCodec: message.wantAudio ? "pcm-f32le" : "",
            audioMode: message.wantAudio ? "system-pcm" : "",
          });
          if (message.wantVideo) startVideo();
          if (message.wantAudio) startAudio();
        }
      }
    });
    socket.on("close", () => {
      stopTimers();
      sockets.delete(socket);
    });
    socket.on("error", () => {
      stopTimers();
      sockets.delete(socket);
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  try {
    await fn({ port });
  } finally {
    for (const timer of timers) clearInterval(timer);
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}

function baseProbeArgs(port) {
  return [
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--timeoutMs",
    "5000",
    "--commandTimeoutMs",
    "10000",
    "--videoDurationMs",
    "450",
    "--videoMinFrames",
    "4",
    "--videoMinFps",
    "4",
    "--audioDurationMs",
    "450",
    "--audioMinFrames",
    "8",
    "--progressIntervalMs",
    "100",
    "--maxFrameAgeMs",
    "1000",
  ];
}

async function checkFakeHostJsonSuccess(args) {
  await withFakeMacHost(async ({ port }) => {
    const secret = "super-secret-mac-media";
    const result = await runMediaAsync([
      "--json",
      ...baseProbeArgs(port),
    ], args, { LAN_DUAL_PASSWORD: secret });

    assert(result.status === 0, `fake host media should pass.\n${outputOf(result)}`);
    const payload = parseJson(result.stdout, "fake host media JSON");
    assert(payload.ok === true, "fake host payload should report ok=true");
    assert(payload.summary?.status === "ok", `fake host summary.status should be ok.\n${result.stdout}`);
    assert(payload.summary?.passed === 2 && payload.summary?.failed === 0, "fake host should pass video and audio");
    assert(payload.video?.ok === true && payload.video?.observation?.frameCount >= 4, "video result should pass with frames");
    assert(payload.video?.observation?.h264?.keyFramesWithParameterSets >= 1, "video result should include H.264 keyframe SPS/PPS/IDR evidence");
    assert((payload.video?.observation?.h264?.firstKeyFrameNalTypes || []).join(",") === "7,8,5", "video result should include first H.264 keyframe NAL types");
    assert(payload.audio?.ok === true && payload.audio?.observation?.frameCount >= 8, "audio result should pass with frames");
    assert(payload.summary?.noInput === true && payload.summary?.noInject === true, "summary should preserve no input/inject");
    assert(payload.resource?.enabled === false, "resource sampling should default to disabled");
    assert(payload.args?.progressIntervalMs === 100, "JSON should report progress interval");
    assert(/No input or inject was executed/.test(payload.boardSummary || ""), "boardSummary should include input/inject safety note");
    assert(/request=1280x720@30Hz\/12000kbps\/h264\/450ms,audio=450ms/.test(payload.boardSummary || ""), "boardSummary should include media request context");
    assert(/resource=off/.test(payload.boardSummary || ""), "boardSummary should mark resource sampling off by default");
    assert(payload.args?.playTone === false, "playTone should default to false");
    assert(!/\[(video|audio)\]\s+\[INFO\].*progress/i.test(result.stdout), "JSON stdout should not include forwarded progress logs");
    assert(/Video progress:/.test(result.stderr), "JSON stderr should include video progress heartbeat");
    assert(/Audio progress:/.test(result.stderr), "JSON stderr should include audio progress heartbeat");
    assertNoSecretLikeText(outputOf(result), "fake host media JSON output");
  });
  print("OK", "Temporary fake Mac host passes media aggregate JSON");
}

async function checkResourceSampling(args) {
  await withFakeMacHost(async ({ port }) => {
    const result = await runMediaAsync([
      "--json",
      "--resourceSample",
      "--resourceSampleIntervalMs",
      "100",
      ...baseProbeArgs(port),
    ], args, { LAN_DUAL_PASSWORD: "super-secret-mac-media" });

    assert(result.status === 0, `resource sampling run should pass.\n${outputOf(result)}`);
    const payload = parseJson(result.stdout, "resource sampling JSON");
    assert(payload.ok === true, "resource sampling should not fail media success");
    assert(payload.resource?.enabled === true, "resource sampling should be enabled");
    assert(payload.resource?.rootPid === process.pid, "resource sampling should use fake discovery runtime process id");
    if (process.platform === "win32") {
      assert(payload.resource?.available === false, "resource sampling should be unavailable on Windows");
      assert(/resource=unavailable/.test(payload.boardSummary || ""), "Windows boardSummary should mark resource sampling unavailable");
    } else {
      assert(payload.resource?.available === true, `resource sampling should be available: ${JSON.stringify(payload.resource)}`);
      assert(payload.resource?.sampleCount >= 1, "resource sampling should collect at least one sample");
      assert(Number.isFinite(Number(payload.resource?.peakRssMiB)), "resource sampling should include peak RSS");
      assert(/resource=sampled/.test(payload.boardSummary || ""), "boardSummary should mention sampled resources");
      assert(/rssPeak=/.test(payload.boardSummary || ""), "boardSummary should include RSS peak");
    }
    assertNoSecretLikeText(outputOf(result), "resource sampling output");
  });
  print("OK", "Resource sampling is optional, local, and secret-free");
}

async function checkPartialFailureKeepsOtherProbe(args) {
  await withFakeMacHost(async ({ port }) => {
    const result = await runMediaAsync([
      "--json",
      ...baseProbeArgs(port),
      "--videoMinFrames",
      "999",
    ], args, { LAN_DUAL_PASSWORD: "super-secret-mac-media" });

    assert(result.status !== 0, `partial failure should exit non-zero.\n${outputOf(result)}`);
    const payload = parseJson(result.stdout, "partial failure JSON");
    assert(payload.ok === false, "partial failure should report ok=false");
    assert(payload.video?.ok === false, "video should fail threshold");
    assert(payload.audio?.ok === true, "audio should still run and pass after video failure");
    assert(payload.summary?.status === "partial", `partial failure summary.status should be partial.\n${result.stdout}`);
    assert(payload.summary?.passed === 1 && payload.summary?.failed === 1, "summary should count one pass and one failure");
    assert(Array.isArray(payload.summary?.failures), "summary should include structured failures");
    assert(payload.summary.failures.some((failure) => failure.id === "video" && /Expected at least/i.test(failure.message || "")), "failures should include video threshold reason");
    assert(/Mac media baseline partial/.test(payload.boardSummary || ""), "boardSummary should mark partial failure");
    assert(/video=FAIL\(reason=/.test(payload.boardSummary || ""), "boardSummary should include failed video reason");
    assertNoSecretLikeText(outputOf(result), "partial failure output");
  });
  print("OK", "Media aggregate keeps audio result after video failure");
}

async function checkAllFailureJsonStatus(args) {
  await withFakeMacHost(async ({ port }) => {
    const result = await runMediaAsync([
      "--json",
      ...baseProbeArgs(port),
      "--videoMinFrames",
      "999",
      "--audioMinFrames",
      "999",
    ], args, { LAN_DUAL_PASSWORD: "super-secret-mac-media" });

    assert(result.status !== 0, `all-failure JSON should exit non-zero.\n${outputOf(result)}`);
    const payload = parseJson(result.stdout, "all-failure JSON");
    assert(payload.ok === false, "all-failure payload should report ok=false");
    assert(payload.summary?.status === "failed", `all-failure summary.status should be failed.\n${result.stdout}`);
    assert(payload.summary?.passed === 0 && payload.summary?.failed === 2, "summary should count two failures");
    assert(Array.isArray(payload.summary?.failures) && payload.summary.failures.length === 2, "summary should include two structured failures");
    assert(/Mac media baseline failed 2/.test(payload.boardSummary || ""), "boardSummary should mark full failure count");
    assertNoSecretLikeText(outputOf(result), "all-failure output");
  });
  print("OK", "All-failure media JSON exposes failed status");
}

async function checkFailureBoardSummary(args) {
  await withFakeMacHost(async ({ port }) => {
    const result = await runMediaAsync([
      "--boardSummary",
      ...baseProbeArgs(port),
      "--videoMinFrames",
      "999",
    ], args, { LAN_DUAL_PASSWORD: "super-secret-mac-media" });

    assert(result.status !== 0, `failure boardSummary should exit non-zero.\n${outputOf(result)}`);
    const lines = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
    assert(lines.length === 1, `failure boardSummary should print exactly one line, got ${lines.length}\n${result.stdout}`);
    assert(lines[0].includes("Mac media baseline partial"), "failure boardSummary should identify partial failure");
    assert(lines[0].includes("request=1280x720@30Hz/12000kbps/h264/450ms,audio=450ms"), "failure boardSummary should include media request context");
    assert(lines[0].includes("video=FAIL(reason="), "failure boardSummary should include video failure reason");
    assert(lines[0].includes("audio=") && !lines[0].includes("audio=FAIL"), "failure boardSummary should keep passing audio result");
    assert(lines[0].includes("resource=off"), "failure boardSummary should mark resource sampling off by default");
    assert(lines[0].includes("No input or inject was executed"), "failure boardSummary should keep safety note");
    assertNoSecretLikeText(outputOf(result), "failure boardSummary output");
  });
  print("OK", "Failure board summary is one line, useful, and secret-free");
}

async function checkBoardSummary(args) {
  await withFakeMacHost(async ({ port }) => {
    const result = await runMediaAsync([
      "--boardSummary",
      ...baseProbeArgs(port),
    ], args, { LAN_DUAL_PASSWORD: "super-secret-mac-media" });

    assert(result.status === 0, `boardSummary run should pass.\n${outputOf(result)}`);
    const lines = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
    assert(lines.length === 1, `boardSummary should print exactly one line, got ${lines.length}\n${result.stdout}`);
    assert(lines[0].includes("Mac media baseline passed"), "boardSummary should identify Mac media baseline");
    assert(lines[0].includes("request=1280x720@30Hz/12000kbps/h264/450ms,audio=450ms"), "boardSummary should include media request context");
    assert(lines[0].includes("video=") && lines[0].includes("audio="), "boardSummary should include video and audio");
    assert(lines[0].includes("h264Frames="), "boardSummary should include H.264 sent frame count");
    assert(lines[0].includes("h264Delta="), "boardSummary should include H.264 delta frame count");
    assert(lines[0].includes("firstKeyNal=7,8,5"), "boardSummary should include first H.264 keyframe NAL types");
    assert(lines[0].includes("lastKeyNal=7,8,5"), "boardSummary should include last H.264 keyframe NAL types");
    assert(lines[0].includes("lastNal="), "boardSummary should include last H.264 frame NAL types");
    assert(lines[0].includes("keyGapFramesMax=5"), "boardSummary should include H.264 keyframe max frame gap");
    assert(lines[0].includes("keyGapMsMax="), "boardSummary should include H.264 keyframe max time gap");
    assert(lines[0].includes("keyGapFramesLast="), "boardSummary should include latest H.264 keyframe frame gap");
    assert(lines[0].includes("keyGapMsLast="), "boardSummary should include latest H.264 keyframe time gap");
    assert(lines[0].includes("keyTailFrames="), "boardSummary should include H.264 tail frame gap after the last keyframe");
    assert(lines[0].includes("keyTailMs="), "boardSummary should include H.264 tail time gap after the last keyframe");
    assert(lines[0].includes("resource=off"), "boardSummary should mark resource sampling off by default");
    assert(lines[0].includes("password was not printed"), "boardSummary should include password safety note");
    assert(lines[0].includes("playTone=false"), "boardSummary should show no test tone by default");
    assert(!/\[(video|audio)\]\s+\[INFO\].*progress/i.test(result.stdout), "boardSummary stdout should not include forwarded progress logs");
    assert(/Video progress:/.test(result.stderr), "boardSummary stderr should include video progress heartbeat");
    assert(/Audio progress:/.test(result.stderr), "boardSummary stderr should include audio progress heartbeat");
    assertNoSecretLikeText(outputOf(result), "boardSummary output");
  });
  print("OK", "Board summary is one line and secret-free");
}

async function checkSkipBoardSummaryRequest(args) {
  await withFakeMacHost(async ({ port }) => {
    const result = await runMediaAsync([
      "--boardSummary",
      ...baseProbeArgs(port),
      "--skipAudio",
    ], args, { LAN_DUAL_PASSWORD: "super-secret-mac-media" });

    assert(result.status === 0, `skip audio boardSummary run should pass.\n${outputOf(result)}`);
    const line = String(result.stdout || "").trim();
    assert(line.includes("request=1280x720@30Hz/12000kbps/h264/450ms,audio=skipped"), "skip audio boardSummary should include skipped audio request context");
    assert(line.includes("audio=skipped"), "skip audio boardSummary should mark audio skipped");
    assertNoSecretLikeText(outputOf(result), "skip boardSummary output");
  });
  print("OK", "Board summary request context handles skipped probes");
}

function checkSkipModes(args) {
  const result = runMediaSync([
    "--json",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--skipVideo",
    "--skipAudio",
  ], args);
  assert(result.status !== 0, "--skipVideo and --skipAudio should fail together");
  const payload = parseJson(result.stdout, "double skip failure");
  assert(payload.ok === false, "double skip JSON should report ok=false");
  assert(/cannot both/.test(payload.error?.message || ""), "double skip should explain invalid flags");
  print("OK", "Invalid skip mode fails with parseable JSON");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  checkHelp(args);
  checkSourceDoesNotPassPasswordArg();
  checkSkipModes(args);
  await checkFakeHostJsonSuccess(args);
  await checkResourceSampling(args);
  await checkPartialFailureKeepsOtherProbe(args);
  await checkAllFailureJsonStatus(args);
  await checkFailureBoardSummary(args);
  await checkBoardSummary(args);
  await checkSkipBoardSummaryRequest(args);
  print("OK", "Mac media aggregate self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
