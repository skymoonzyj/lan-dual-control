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
  width: 1280,
  height: 720,
  fps: 30,
  bandwidthKbps: 50000,
  durationMs: 5000,
  timeoutMs: 15000,
  minFrames: 20,
  minFps: 8,
  maxGapMs: 1000,
  screenMode: "auto",
  inputMode: "log",
  ffmpeg: process.env.LAN_DUAL_FFMPEG || "",
  requireRealVideo: true,
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
  args.width = Number(args.width) || defaults.width;
  args.height = Number(args.height) || defaults.height;
  args.fps = Number(args.fps) || defaults.fps;
  args.bandwidthKbps = Number(args.bandwidthKbps) || defaults.bandwidthKbps;
  args.durationMs = Number(args.durationMs) || defaults.durationMs;
  args.timeoutMs = Number(args.timeoutMs) || defaults.timeoutMs;
  args.minFrames = Number(args.minFrames) || defaults.minFrames;
  args.minFps = Number(args.minFps) || defaults.minFps;
  args.maxGapMs = Number(args.maxGapMs) || defaults.maxGapMs;
  args.screenMode = String(args.screenMode || defaults.screenMode).trim().toLowerCase();
  args.inputMode = String(args.inputMode || defaults.inputMode).trim().toLowerCase();
  args.ffmpeg = String(args.ffmpeg || "").trim();
  if (!args.ffmpeg && process.platform === "win32" && existsSync(defaultWindowsFfmpeg)) {
    args.ffmpeg = defaultWindowsFfmpeg;
  }
  args.requireRealVideo = booleanArg(args.requireRealVideo);
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
    LAN_DUAL_WINDOWS_MAX_SCREEN_FPS: String(Math.max(1, Math.min(args.fps, 60))),
    LAN_DUAL_WINDOWS_INPUT_MODE: args.inputMode,
  };
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
    wantVideo: true,
    wantAudio: false,
    wantClipboardText: false,
    wantClipboardFile: false,
    preferredVideoCodec: "mjpeg",
    maxFps: args.fps,
    maxBandwidthKbps: args.bandwidthKbps,
    qualityPreset: "diagnostic",
    displayMode: "window",
    displayId: "main",
    preferredWidth: args.width,
    preferredHeight: args.height,
    audioVolume: 0,
  };
}

function estimateFrameBytes(frame) {
  if (Number.isFinite(Number(frame.payloadBytes))) {
    return Number(frame.payloadBytes);
  }
  if (typeof frame.payload === "string") {
    return Math.round((frame.payload.length * 3) / 4);
  }
  if (typeof frame.dataUrl === "string") {
    const comma = frame.dataUrl.indexOf(",");
    const payloadLength = comma >= 0 ? frame.dataUrl.length - comma - 1 : frame.dataUrl.length;
    return Math.round((payloadLength * 3) / 4);
  }
  return 0;
}

function assertRealFrame(frame) {
  const pipeline = String(frame.capturePipeline || "").toLowerCase();
  const source = String(frame.source || "").toLowerCase();
  const codec = String(frame.codec || "").toLowerCase();
  if (source === "mock" || pipeline.includes("mock") || codec === "mock-svg") {
    throw new Error(`expected real video frame, got codec=${codec || "missing"} source=${source || "missing"} pipeline=${pipeline || "missing"}`);
  }
}

async function observeFrames(client, args) {
  const frames = [];
  const startedAt = performance.now();
  let lastAt = startedAt;
  let maxGapMs = 0;

  while (performance.now() - startedAt < args.durationMs) {
    const frame = await client.waitForMessage("video_frame", args.timeoutMs);
    const now = performance.now();
    const gap = frames.length === 0 ? 0 : now - lastAt;
    lastAt = now;
    maxGapMs = Math.max(maxGapMs, gap);
    if (args.requireRealVideo) {
      assertRealFrame(frame);
    }
    frames.push({
      atMs: now,
      frameId: Number(frame.frameId) || frames.length + 1,
      codec: frame.codec || "",
      encoding: frame.encoding || "",
      pipeline: frame.capturePipeline || "",
      source: frame.source || "",
      droppedFrames: Number(frame.droppedFrames) || 0,
      bytes: estimateFrameBytes(frame),
      width: Number(frame.width) || 0,
      height: Number(frame.height) || 0,
    });
  }

  const elapsedMs = Math.max(1, (frames.at(-1)?.atMs || performance.now()) - startedAt);
  const fps = frames.length > 1 ? (frames.length * 1000) / elapsedMs : 0;
  const bytesTotal = frames.reduce((sum, frame) => sum + frame.bytes, 0);
  const droppedFrames = frames.reduce((sum, frame) => sum + frame.droppedFrames, 0);
  const firstFrame = frames[0] || {};
  const lastFrame = frames.at(-1) || {};
  const uniquePipelines = [...new Set(frames.map((frame) => frame.pipeline).filter(Boolean))];
  const uniqueCodecs = [...new Set(frames.map((frame) => frame.codec).filter(Boolean))];

  return {
    frameCount: frames.length,
    elapsedMs: Math.round(elapsedMs),
    fps: Number(fps.toFixed(2)),
    maxGapMs: Math.round(maxGapMs),
    avgPayloadBytes: frames.length ? Math.round(bytesTotal / frames.length) : 0,
    droppedFrames,
    firstFrameId: firstFrame.frameId || 0,
    lastFrameId: lastFrame.frameId || 0,
    width: firstFrame.width || 0,
    height: firstFrame.height || 0,
    pipelines: uniquePipelines,
    codecs: uniqueCodecs,
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
    throw new Error(`video observation failed: ${problems.join("; ")}`);
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
    const screen = discovery.capabilities?.screen || {};
    print("OK", `Discovery: ${discovery.deviceName || discovery.hostName || "Windows host"} / ${screen.mode || "unknown"} / ${screen.capturePipeline || "unknown"}`, args);

    socket = await openSocket(args);
    const client = makeMessageClient(socket);
    client.send({ type: "hello", role: "windows-video-observer", protocolVersion: 1 });
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
    print("OK", `Session: ${answer.width || args.width}x${answer.height || args.height} / ${answer.fps || "?"} Hz / ${answer.capturePipeline || answer.hostMode || "unknown"}`, args);

    const summary = await observeFrames(client, args);
    assertObservation(summary, args);

    const result = {
      ok: true,
      target: `${args.host}:${args.port}`,
      requested: {
        width: args.width,
        height: args.height,
        fps: args.fps,
        durationMs: args.durationMs,
        screenMode: args.screenMode,
      },
      discoveryScreen: {
        mode: screen.mode || "",
        capturePipeline: screen.capturePipeline || "",
      },
      session: {
        width: answer.width || 0,
        height: answer.height || 0,
        fps: answer.fps || 0,
        requestedFps: answer.requestedFps || args.fps,
        maxScreenFps: answer.maxScreenFps || 0,
        capturePipeline: answer.capturePipeline || "",
        hostMode: answer.hostMode || "",
      },
      observation: summary,
    };

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      print("OK", `Observed ${summary.frameCount} frames in ${summary.elapsedMs} ms`, args);
      print("OK", `Average FPS: ${summary.fps} / max gap: ${summary.maxGapMs} ms / dropped: ${summary.droppedFrames}`, args);
      print("INFO", `Pipeline: ${summary.pipelines.join(", ") || "unknown"} / codec: ${summary.codecs.join(", ") || "unknown"} / avg bytes: ${summary.avgPayloadBytes}`, args);
      print("OK", "Windows host video observation passed", args);
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
