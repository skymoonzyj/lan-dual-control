import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const windowsHostDir = resolve(repoRoot, "apps/windows-host");
const windowsHostServer = resolve(windowsHostDir, "server.mjs");
const defaultWindowsFfmpeg = "C:\\DevTools\\ffmpeg\\bin\\ffmpeg.exe";

const defaults = {
  host: "127.0.0.1",
  port: 43772,
  password: "demo-password",
  durationMs: 5000,
  timeoutMs: 15000,
  minFrames: 50,
  minFps: 15,
  maxGapMs: 1000,
  audioMode: "wasapi",
  audioDevice: process.env.LAN_DUAL_WINDOWS_AUDIO_DEVICE || "",
  sampleRate: Number(process.env.LAN_DUAL_WINDOWS_AUDIO_SAMPLE_RATE) || 48000,
  channels: Number(process.env.LAN_DUAL_WINDOWS_AUDIO_CHANNELS) || 2,
  frameMs: Number(process.env.LAN_DUAL_WINDOWS_AUDIO_FRAME_MS) || 20,
  screenMode: "mock",
  inputMode: "log",
  ffmpeg: process.env.LAN_DUAL_FFMPEG || "",
  requirePcm: true,
  useExisting: false,
  keepRunning: false,
  json: false,
  verbose: false,
};

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (Object.prototype.hasOwnProperty.call(args, key) && next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }

  args.port = Number(args.port) || defaults.port;
  args.durationMs = Number(args.durationMs) || defaults.durationMs;
  args.timeoutMs = Number(args.timeoutMs) || defaults.timeoutMs;
  args.minFrames = Number(args.minFrames) || defaults.minFrames;
  args.minFps = Number(args.minFps) || defaults.minFps;
  args.maxGapMs = Number(args.maxGapMs) || defaults.maxGapMs;
  args.sampleRate = Number(args.sampleRate) || defaults.sampleRate;
  args.channels = Number(args.channels) || defaults.channels;
  args.frameMs = Number(args.frameMs) || defaults.frameMs;
  args.audioMode = String(args.audioMode || defaults.audioMode).trim().toLowerCase();
  args.audioDevice = String(args.audioDevice || "").trim();
  args.screenMode = String(args.screenMode || defaults.screenMode).trim().toLowerCase();
  args.inputMode = String(args.inputMode || defaults.inputMode).trim().toLowerCase();
  args.ffmpeg = String(args.ffmpeg || "").trim();
  if (!args.ffmpeg && process.platform === "win32" && existsSync(defaultWindowsFfmpeg)) {
    args.ffmpeg = defaultWindowsFfmpeg;
  }
  args.requirePcm = booleanArg(args.requirePcm);
  args.useExisting = booleanArg(args.useExisting);
  args.keepRunning = booleanArg(args.keepRunning);
  args.json = booleanArg(args.json);
  args.verbose = booleanArg(args.verbose);
  return args;
}

function booleanArg(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function print(kind, text, args) {
  if (args?.json) return;
  console.log(`[${kind}] ${text}`);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function withTimeout(promise, ms, label) {
  return new Promise((resolveTimeout, rejectTimeout) => {
    const timer = setTimeout(() => rejectTimeout(new Error(`${label} timeout after ${ms} ms`)), ms);
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

async function waitFor(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ""}`);
}

function makeEnvelope(message) {
  return {
    id: `${message.type}-${randomUUID()}`,
    timestamp: new Date().toISOString(),
    ...message,
  };
}

function startLocalWindowsHost(args) {
  const env = {
    ...process.env,
    LAN_DUAL_HOST: args.host,
    LAN_DUAL_PORT: String(args.port),
    LAN_DUAL_PASSWORD: args.password,
    LAN_DUAL_WINDOWS_SCREEN_MODE: args.screenMode,
    LAN_DUAL_WINDOWS_MAX_SCREEN_FPS: "1",
    LAN_DUAL_WINDOWS_INPUT_MODE: args.inputMode,
    LAN_DUAL_WINDOWS_AUDIO_MODE: args.audioMode,
    LAN_DUAL_WINDOWS_AUDIO_SAMPLE_RATE: String(args.sampleRate),
    LAN_DUAL_WINDOWS_AUDIO_CHANNELS: String(args.channels),
    LAN_DUAL_WINDOWS_AUDIO_FRAME_MS: String(args.frameMs),
  };
  if (args.audioDevice) {
    env.LAN_DUAL_WINDOWS_AUDIO_DEVICE = args.audioDevice;
  }
  if (args.ffmpeg) {
    env.LAN_DUAL_FFMPEG = args.ffmpeg;
  }

  const child = spawn(process.execPath, [windowsHostServer, String(args.port), args.host], {
    cwd: windowsHostDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  if (args.verbose) {
    child.stdout.on("data", (chunk) => print("windows-host", String(chunk).trim(), args));
    child.stderr.on("data", (chunk) => print("windows-host:err", String(chunk).trim(), args));
  }

  return child;
}

function canBindPort(host, port) {
  return new Promise((resolveBind) => {
    const server = createServer();
    server.once("error", () => {
      resolveBind(false);
    });
    server.once("listening", () => {
      server.close(() => resolveBind(true));
    });
    server.listen(port, host);
  });
}

function reserveEphemeralPort(host) {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.once("listening", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
    server.listen(0, host);
  });
}

async function prepareLocalPort(args) {
  if (args.useExisting) {
    return;
  }
  if (await canBindPort(args.host, args.port)) {
    return;
  }

  const fallbackPort = await reserveEphemeralPort(args.host);
  print("INFO", `Port ${args.port} is busy; using temporary port ${fallbackPort}`, args);
  args.port = fallbackPort;
}

async function closeSocket(socket) {
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    return;
  }

  await new Promise((resolveClose) => {
    const timer = setTimeout(resolveClose, 1000);
    socket.addEventListener("close", () => {
      clearTimeout(timer);
      resolveClose();
    }, { once: true });
    socket.close();
  });
}

async function stopLocalWindowsHost(child, args) {
  if (!child || child.exitCode !== null) {
    return;
  }

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
  print("OK", `Stopped local Windows host PID ${child.pid}`, args);
}

async function fetchDiscovery(args) {
  const url = `http://${args.host}:${args.port}/discovery`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function openSocket(args) {
  const socket = new WebSocket(`ws://${args.host}:${args.port}`);
  await withTimeout(new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", () => rejectOpen(new Error("WebSocket open failed")), { once: true });
  }), args.timeoutMs, "WebSocket open");
  return socket;
}

function makeMessageClient(socket) {
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
      if (typeWaiters.length === 0) {
        waiters.delete(message.type);
      }
      return;
    }

    const queue = queues.get(message.type) || [];
    queue.push(message);
    queues.set(message.type, queue);
  });

  function waitForMessage(type, timeoutMs) {
    return withTimeout(new Promise((resolveMessage) => {
      const queue = queues.get(type) || [];
      if (queue.length > 0) {
        const message = queue.shift();
        if (queue.length === 0) {
          queues.delete(type);
        }
        resolveMessage(message);
        return;
      }
      const typeWaiters = waiters.get(type) || [];
      typeWaiters.push(resolveMessage);
      waiters.set(type, typeWaiters);
    }), timeoutMs, `wait for ${type}`);
  }

  function send(message) {
    socket.send(JSON.stringify(makeEnvelope(message)));
  }

  return { send, waitForMessage };
}

function makeSessionOffer(args) {
  return {
    type: "session_offer",
    protocolVersion: 1,
    wantVideo: false,
    wantAudio: true,
    wantClipboardText: false,
    wantClipboardFile: false,
    preferredAudioCodec: "pcm-f32le",
    maxFps: 1,
    maxBandwidthKbps: 1000,
    qualityPreset: "audio-observer",
    displayMode: "window",
    displayId: "main",
    preferredWidth: 320,
    preferredHeight: 180,
    audioVolume: 80,
  };
}

function estimatePayloadBytes(frame) {
  if (Number.isFinite(Number(frame.payloadBytes))) {
    return Number(frame.payloadBytes);
  }
  if (typeof frame.payload === "string") {
    return Math.round((frame.payload.length * 3) / 4);
  }
  return 0;
}

function assertPcmAudioFrame(frame) {
  const codec = String(frame.codec || "").toLowerCase();
  const encoding = String(frame.encoding || "").toLowerCase();
  const audioMode = String(frame.audioMode || "").toLowerCase();
  const payloadBytes = estimatePayloadBytes(frame);
  const problems = [];
  if (codec !== "pcm-f32le") problems.push(`codec=${codec || "missing"}`);
  if (encoding !== "pcm-f32le-base64") problems.push(`encoding=${encoding || "missing"}`);
  if (audioMode !== "system-pcm") problems.push(`audioMode=${audioMode || "missing"}`);
  if (payloadBytes <= 0) problems.push(`payloadBytes=${payloadBytes}`);
  if (problems.length > 0) {
    throw new Error(`expected PCM audio frame (${problems.join("; ")})`);
  }
}

async function observeAudioFrames(client, args) {
  const frames = [];
  const startedAt = performance.now();
  let lastAt = startedAt;
  let maxGapMs = 0;

  while (performance.now() - startedAt < args.durationMs) {
    const frame = await client.waitForMessage("audio_frame", args.timeoutMs);
    const now = performance.now();
    const gap = frames.length === 0 ? 0 : now - lastAt;
    lastAt = now;
    maxGapMs = Math.max(maxGapMs, gap);
    if (args.requirePcm) {
      assertPcmAudioFrame(frame);
    }
    frames.push({
      atMs: now,
      frameId: Number(frame.frameId) || frames.length + 1,
      codec: frame.codec || "",
      encoding: frame.encoding || "",
      audioMode: frame.audioMode || "",
      sampleRate: Number(frame.sampleRate) || 0,
      channels: Number(frame.channels) || 0,
      frames: Number(frame.frames) || 0,
      durationMs: Number(frame.durationMs) || 0,
      level: Number(frame.level) || 0,
      payloadBytes: estimatePayloadBytes(frame),
    });
  }

  const elapsedMs = Math.max(1, (frames.at(-1)?.atMs || performance.now()) - startedAt);
  const fps = frames.length > 1 ? (frames.length * 1000) / elapsedMs : 0;
  const levels = frames.map((frame) => frame.level);
  const payloads = frames.map((frame) => frame.payloadBytes);
  const avgLevel = levels.length ? levels.reduce((sum, value) => sum + value, 0) / levels.length : 0;
  const avgPayloadBytes = payloads.length ? payloads.reduce((sum, value) => sum + value, 0) / payloads.length : 0;

  return {
    frameCount: frames.length,
    elapsedMs: Math.round(elapsedMs),
    fps: Number(fps.toFixed(2)),
    maxGapMs: Math.round(maxGapMs),
    firstFrameId: frames[0]?.frameId || 0,
    lastFrameId: frames.at(-1)?.frameId || 0,
    avgPayloadBytes: Math.round(avgPayloadBytes),
    minPayloadBytes: payloads.length ? Math.min(...payloads) : 0,
    maxPayloadBytes: payloads.length ? Math.max(...payloads) : 0,
    minLevel: levels.length ? Number(Math.min(...levels).toFixed(4)) : 0,
    maxLevel: levels.length ? Number(Math.max(...levels).toFixed(4)) : 0,
    avgLevel: Number(avgLevel.toFixed(4)),
    codecs: [...new Set(frames.map((frame) => frame.codec).filter(Boolean))],
    encodings: [...new Set(frames.map((frame) => frame.encoding).filter(Boolean))],
    audioModes: [...new Set(frames.map((frame) => frame.audioMode).filter(Boolean))],
    sampleRates: [...new Set(frames.map((frame) => frame.sampleRate).filter(Boolean))],
    channels: [...new Set(frames.map((frame) => frame.channels).filter(Boolean))],
    frameDurationsMs: [...new Set(frames.map((frame) => frame.durationMs).filter(Boolean))],
  };
}

function assertObservation(summary, args) {
  const problems = [];
  if (summary.frameCount < args.minFrames) {
    problems.push(`frames ${summary.frameCount} < ${args.minFrames}`);
  }
  if (summary.fps < args.minFps) {
    problems.push(`fps ${summary.fps} < ${args.minFps}`);
  }
  if (summary.maxGapMs > args.maxGapMs) {
    problems.push(`maxGapMs ${summary.maxGapMs} > ${args.maxGapMs}`);
  }
  if (problems.length > 0) {
    throw new Error(`audio observation failed: ${problems.join("; ")}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  let child = null;
  let socket = null;

  try {
    await prepareLocalPort(args);

    if (!args.useExisting) {
      child = startLocalWindowsHost(args);
      print("OK", `Started local Windows host PID ${child.pid} on ${args.host}:${args.port}`, args);
    }

    const discovery = await waitFor(() => fetchDiscovery(args), args.timeoutMs, "Windows host discovery");
    const audio = discovery.capabilities?.audio || {};
    print("OK", `Discovery: ${discovery.deviceName || discovery.hostName || "Windows host"} / ${audio.mode || "unknown"} / ${audio.backend || "unknown"}`, args);

    socket = await openSocket(args);
    const client = makeMessageClient(socket);
    client.send({ type: "hello", role: "windows-audio-observer", protocolVersion: 1 });
    const hello = await client.waitForMessage("hello_ack", args.timeoutMs);
    print("OK", `hello_ack: ${hello.deviceName || hello.hostName || "Windows host"}`, args);

    client.send({ type: "auth_request", password: args.password });
    const auth = await client.waitForMessage("auth_result", args.timeoutMs);
    if (!auth.ok) {
      throw new Error(`auth failed: ${auth.reason || auth.code || "unknown"}`);
    }
    print("OK", "Auth passed", args);

    client.send(makeSessionOffer(args));
    const answer = await client.waitForMessage("session_answer", args.timeoutMs);
    if (answer.ok === false || answer.accepted === false) {
      throw new Error(`session rejected: ${answer.reason || "unknown"}`);
    }
    print("OK", `Session audio: ${answer.audioCodec || "unknown"} / ${answer.audioEncoding || "unknown"} / ${answer.audioMode || "unknown"}`, args);

    const summary = await observeAudioFrames(client, args);
    assertObservation(summary, args);

    const result = {
      ok: true,
      target: `${args.host}:${args.port}`,
      requested: {
        audioMode: args.audioMode,
        durationMs: args.durationMs,
        sampleRate: args.sampleRate,
        channels: args.channels,
        frameMs: args.frameMs,
      },
      discoveryAudio: audio,
      session: {
        audioCodec: answer.audioCodec || "",
        audioEncoding: answer.audioEncoding || "",
        audioMode: answer.audioMode || "",
        sampleRate: answer.sampleRate || 0,
        channels: answer.channels || 0,
        audioFrameIntervalMs: answer.audioFrameIntervalMs || 0,
      },
      observation: summary,
    };

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      print("OK", `Observed ${summary.frameCount} audio frames in ${summary.elapsedMs} ms`, args);
      print("OK", `Average FPS: ${summary.fps} / max gap: ${summary.maxGapMs} ms`, args);
      print("INFO", `Payload bytes avg/min/max: ${summary.avgPayloadBytes}/${summary.minPayloadBytes}/${summary.maxPayloadBytes}`, args);
      print("INFO", `Level min/avg/max: ${summary.minLevel}/${summary.avgLevel}/${summary.maxLevel}`, args);
      print("INFO", `Codec: ${summary.codecs.join(", ") || "unknown"} / sampleRates: ${summary.sampleRates.join(", ") || "unknown"} / channels: ${summary.channels.join(", ") || "unknown"}`, args);
      print("OK", "Windows host audio observation passed", args);
    }
  } finally {
    if (socket) {
      await closeSocket(socket);
    }
    if (child && !args.keepRunning) {
      await stopLocalWindowsHost(child, args);
    }
  }
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`);
  process.exit(1);
});
