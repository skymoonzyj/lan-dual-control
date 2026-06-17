#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import http from "node:http";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/check-mac-formal-local-smoke.mjs";
const websocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const defaults = {
  timeoutMs: 20000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-formal-local-smoke.mjs [options]

Options:
  --timeoutMs <ms>  Per check timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Verifies the Mac formal local smoke aggregator with a temporary fake Mac host.
The fake host only returns protocol messages, media test frames, and log-mode
input acknowledgements; it does not inject input or touch the real Mac host.
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
  assert(!/super-secret-formal-local-smoke/.test(text), `${label} leaked secret-like password text`);
  assert(!/token=/i.test(text), `${label} should not print token-like text`);
}

function runSmoke(extraArgs, args, env = {}) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
      LAN_DUAL_DISABLE_PASSWORD_DIALOG: "1",
      LAN_DUAL_DISABLE_PASSWORD_BEEP: "1",
      ...env,
    },
  });
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = runSmoke([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assert(/\bUsage\b/.test(result.stdout), `${script} ${flag} should print Usage`);
    assert(/--boardSummary/.test(result.stdout), `${script} ${flag} should document --boardSummary`);
    assert(!/Mac host formal smoke password:/.test(result.stdout), `${script} ${flag} should not prompt`);
  }
  print("OK", "Formal local smoke help exits quickly");
}

function checkPasswordSafety(args) {
  const noPassword = runSmoke(["--json"], args);
  const noPasswordPayload = parseJson(noPassword.stdout, "missing password failure");
  assert(noPassword.status !== 0, "missing password should fail");
  assert(noPasswordPayload.ok === false, "missing password JSON should report ok=false");
  assert(/requires a password/.test(noPasswordPayload.error?.message || ""), "missing password should explain password requirement");

  const demoPassword = runSmoke(["--json"], args, { LAN_DUAL_PASSWORD: "demo-password" });
  const demoPayload = parseJson(demoPassword.stdout, "demo-password failure");
  assert(demoPassword.status !== 0, "demo-password should fail by default");
  assert(/refuses/.test(demoPayload.error?.message || "") && /formal password/.test(demoPayload.error?.message || ""), "demo-password failure should explain refusal");

  const prompt = runSmoke(["--json", "--promptPassword"], args);
  const promptPayload = parseJson(prompt.stdout, "non-interactive prompt failure");
  assert(prompt.status !== 0, "non-interactive --promptPassword should fail");
  assert(/requires a macOS password dialog/.test(promptPayload.error?.message || ""), "prompt failure should explain unavailable prompt UI");
  assert(!String(prompt.stdout || "").includes("Mac host formal smoke password:"), "JSON prompt failure should not pollute stdout");

  const secret = "super-secret-formal-local-smoke";
  const promptWithEnvPassword = runSmoke(["--json", "--promptPassword"], args, { LAN_DUAL_PASSWORD: secret });
  const promptEnvPayload = parseJson(promptWithEnvPassword.stdout, "prompt with environment password failure");
  assert(promptWithEnvPassword.status !== 0, "--promptPassword with LAN_DUAL_PASSWORD should still fail when dialog is disabled");
  assert(/requires a macOS password dialog/.test(promptEnvPayload.error?.message || ""), "prompt with environment password should still require dialog");
  assertNoSecretLikeText(outputOf(promptWithEnvPassword), "prompt with environment password failure");

  const promptWithPassword = runSmoke(["--json", "--promptPassword", "--password", secret], args);
  const promptPasswordPayload = parseJson(promptWithPassword.stdout, "prompt with password failure");
  assert(promptWithPassword.status !== 0, "--promptPassword with --password should fail");
  assert(/cannot be combined/.test(promptPasswordPayload.error?.message || ""), "prompt with password should explain conflict");
  assertNoSecretLikeText(outputOf(promptWithPassword), "prompt with password failure");

  const boardSummary = runSmoke(["--boardSummary"], args);
  const boardLines = String(boardSummary.stdout || "").trim().split(/\r?\n/).filter(Boolean);
  assert(boardSummary.status !== 0, "missing password boardSummary should fail");
  assert(boardLines.length === 1, `missing password boardSummary should print one stdout line, got ${boardLines.length}`);
  assert(/Mac formal local smoke failed/.test(boardLines[0]), "missing password boardSummary should explain failure");
  assert(/No inject was executed/.test(boardLines[0]), "missing password boardSummary should keep inject safety note");
  assert(!String(boardSummary.stdout || "").includes("Mac host formal smoke password:"), "boardSummary failure should not prompt on stdout");
  assertNoSecretLikeText(outputOf(boardSummary), "missing password boardSummary failure");

  print("OK", "Password safety failures are JSON, fast, and secret-free");
}

function checkSourceDoesNotPassPasswordArg() {
  const source = readFileSync(new URL("./check-mac-formal-local-smoke.mjs", import.meta.url), "utf8");
  for (const childScript of [
    "scripts/mac/observe-mac-video.mjs",
    "scripts/mac/observe-mac-audio.mjs",
    "scripts/mac/smoke-mac-input-log.mjs",
  ]) {
    const index = source.indexOf(JSON.stringify(childScript));
    assert(index >= 0, `formal smoke source should reference ${childScript}`);
    const window = source.slice(Math.max(0, index - 250), index + 1100);
    assert(!window.includes('"--password"') && !window.includes("'--password'"), `formal smoke should not pass --password argv to ${childScript}`);
  }
  print("OK", "Child probes receive the password through environment, not argv");
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
    deviceName: "Mac formal local smoke fake host",
    platform: "macos",
    host: "127.0.0.1",
    port,
    protocolVersion: 1,
    role: "host",
    runtime: {
      processId: 12345,
      buildId: "formal-local-smoke-test",
      startedAt: "2026-06-15T00:00:00.000Z",
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
      clipboardText: true,
      clipboardFile: true,
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

function makeVideoFrame(frameId) {
  const timestampUs = 1_000_000 + frameId * 33_333;
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
    capturePipeline: "screencapturekit-h264",
    activeDisplayId: "main",
    displayName: "Main",
    payload: Buffer.from(`fake-h264-${frameId}`, "utf8").toString("base64"),
    payloadBytes: Buffer.byteLength(`fake-h264-${frameId}`),
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
    level: 0.03,
    payload: Buffer.alloc(payloadBytes).toString("base64"),
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
            hostName: "Mac formal local smoke fake host",
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

function runSmokeAsync(extraArgs, args, env = {}) {
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

async function checkFakeHostSuccess(args) {
  await withFakeMacHost(async ({ port }) => {
    const secret = "super-secret-formal-local-smoke";
    const result = await runSmokeAsync([
      "--json",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--timeoutMs",
      "5000",
      "--videoDurationMs",
      "1200",
      "--videoMinFrames",
      "8",
      "--videoMinFps",
      "4",
      "--audioDurationMs",
      "1200",
      "--audioMinFrames",
      "20",
      "--inputTimeoutMs",
      "5000",
    ], args, { LAN_DUAL_PASSWORD: secret });

    assert(result.status === 0, `fake host smoke should pass.\n${outputOf(result)}`);
    const payload = parseJson(result.stdout, "fake host success");
    assert(payload.ok === true, "fake host payload should report ok=true");
    assert(payload.summary?.passed === 3, "fake host should pass all three probes");
    assert(payload.summary?.noInject === true, "fake host summary should preserve noInject=true");
    assert(payload.probes?.some((probe) => probe.id === "video" && probe.ok), "video probe should pass");
    assert(payload.probes?.some((probe) => probe.id === "audio" && probe.ok), "audio probe should pass");
    assert(payload.probes?.some((probe) => probe.id === "inputLog" && probe.ok && probe.input?.acknowledged === 16), "input-log probe should acknowledge all events");
    assert(/No inject was executed/.test(payload.boardSummary || ""), "boardSummary should include inject safety note");
    assertNoSecretLikeText(outputOf(result), "fake host success output");
  });
  print("OK", "Temporary fake Mac host passes video/audio/input-log aggregate smoke");
}

async function checkFakeHostBoardSummary(args) {
  await withFakeMacHost(async ({ port }) => {
    const secret = "super-secret-formal-local-smoke";
    const result = await runSmokeAsync([
      "--boardSummary",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--timeoutMs",
      "5000",
      "--videoDurationMs",
      "1200",
      "--videoMinFrames",
      "8",
      "--videoMinFps",
      "4",
      "--audioDurationMs",
      "1200",
      "--audioMinFrames",
      "20",
      "--inputTimeoutMs",
      "5000",
    ], args, { LAN_DUAL_PASSWORD: secret });

    assert(result.status === 0, `fake host boardSummary smoke should pass.\n${outputOf(result)}`);
    const lines = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
    assert(lines.length === 1, `fake host boardSummary should print one stdout line, got ${lines.length}`);
    assert(/Mac formal local smoke passed/.test(lines[0]), "boardSummary should report passed");
    assert(/video=/.test(lines[0]) && /audio=/.test(lines[0]) && /inputLog=/.test(lines[0]), "boardSummary should include all probes");
    assert(/No inject was executed/.test(lines[0]), "boardSummary should include inject safety note");
    assert(/\[INFO\] Running H\.264 video/.test(result.stderr), "boardSummary progress should go to stderr");
    assertNoSecretLikeText(outputOf(result), "fake host boardSummary output");
  });
  print("OK", "Temporary fake Mac host boardSummary is one line and secret-free");
}

async function checkFakeHostSkippedDemoPassword(args) {
  await withFakeMacHost(async ({ port }) => {
    const result = await runSmokeAsync([
      "--json",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--timeoutMs",
      "5000",
      "--skipVideo",
      "--skipAudio",
      "--skipInputLog",
      "--allowDemoPassword",
    ], args, { LAN_DUAL_PASSWORD: "demo-password" });

    assert(result.status === 0, `skipped demo-password smoke should pass.\n${outputOf(result)}`);
    const payload = parseJson(result.stdout, "skipped demo-password success");
    assert(payload.ok === true, "skipped demo-password payload should report ok=true");
    assert(payload.summary?.passed === 0, "all probes should be skipped");
    assert(payload.summary?.skipped?.length === 3, "skipped list should include three probes");
    assert(payload.args?.allowDemoPassword === true, "payload should mark allowDemoPassword=true");
  });
  print("OK", "--allowDemoPassword is limited to explicit fake-host style runs");
}

function checkJsonFailureParseable(args) {
  const result = runSmoke([
    "--json",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "3000",
    "--skipVideo",
    "--skipAudio",
    "--skipInputLog",
  ], args, { LAN_DUAL_PASSWORD: "super-secret-formal-local-smoke" });
  const payload = parseJson(result.stdout, "zero-probe offline smoke");
  assert(result.status === 0, "all-skipped JSON run should complete even when target is offline");
  assert(payload.ok === true, "all-skipped JSON payload should report ok=true");
  assert(payload.summary?.skipped?.length === 3, "all-skipped JSON should list skipped probes");
  assertNoSecretLikeText(outputOf(result), "all-skipped JSON run");
  print("OK", "All-skipped JSON output is parseable and target-independent");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  checkPasswordSafety(args);
  checkSourceDoesNotPassPasswordArg();
  checkJsonFailureParseable(args);
  await checkFakeHostSkippedDemoPassword(args);
  await checkFakeHostSuccess(args);
  await checkFakeHostBoardSummary(args);
  print("OK", "Mac formal local smoke self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
