import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isLikelyLocalHost, startProcessResourceSampling } from "./lib/process-resource-sampler.mjs";

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
  qualityPreset: "balanced",
  durationMs: 5000,
  timeoutMs: 15000,
  progressIntervalMs: 10000,
  minFrames: 20,
  minFps: 8,
  minFreshFps: 0,
  minUniqueHelperFps: 0,
  maxRepeatedFrameRatio: 1,
  maxGapMs: 1000,
  maxFrameAgeMs: 0,
  maxContentAgeMs: 0,
  screenMode: "auto",
  preferredVideoCodec: "",
  h264Encoder: "",
  inputMode: "log",
  ffmpeg: process.env.LAN_DUAL_FFMPEG || "",
  useDefaultMaxScreenFps: false,
  expectSessionFps: 0,
  requireMonotonicTimestamp: false,
  requireRealVideo: true,
  useExisting: false,
  keepRunning: false,
  json: false,
  verbose: false,
  resourceSample: true,
  resourceSampleIntervalMs: 1000,
  resourceSampleTree: false,
  resourceSampleTimeoutMs: 3000,
  wgcRepeatLastFrame: false,
  wgcRepeatLastFrameMode: "full",
  wgcH264Bridge: false,
  wgcH264Source: "jpeg",
};

function printUsage() {
  console.log(`Usage:
  node scripts/windows/observe-windows-host-video.mjs [options]

Options:
  --host <host>                         Windows host address (default: ${defaults.host})
  --port <port>                         Windows host port (default: ${defaults.port})
  --password <password>                 Windows host password (default: ${defaults.password})
  --durationMs <ms>                     Observation duration (default: ${defaults.durationMs})
  --progressIntervalMs <ms>             Print observation progress every N ms; 0 disables. Default: ${defaults.progressIntervalMs}
  --width <px> --height <px> --fps <n>  Requested video size/FPS
  --bandwidthKbps <kbps>                Requested max bandwidth (default: ${defaults.bandwidthKbps})
  --qualityPreset <name>                smooth | balanced | sharp | custom
  --maxGapMs <ms>                       Fail if inter-frame receive gap is higher
  --minFps <n>                          Minimum observed FPS; use 0 for diagnostic-only fallback checks
  --minFreshFps <n>                     Minimum non-repeated frame FPS; useful with WGC repeat-last-frame
  --minUniqueHelperFps <n>              Minimum unique helper source FPS; useful for WGC source pacing
  --maxRepeatedFrameRatio <n>           Max repeated frame ratio, 0-1 or 0-100 percent. Default: ${defaults.maxRepeatedFrameRatio}
  --maxFrameAgeMs <ms>                  Fail if video_frame.timestamp receive age is higher
  --maxContentAgeMs <ms>                Fail if repeated WGC content age is higher
  --requireMonotonicTimestamp           Fail if video_frame.timestamp goes backwards
  --requireRealVideo false              Allow mock-svg frames for local smoke checks
  --screenMode <auto|ffmpeg|system|mock|wgc>
  --wgcRepeatLastFrame true             Repeat the last WGC helper frame when no fresh frame arrives
  --wgcRepeatLastFrameMode <full|signal>
                                        full resends the JPEG; signal sends a tiny repeat marker
  --wgcH264Bridge true                  In WGC mode, bridge helper JPEG frames into FFmpeg H.264
  --wgcH264Source <jpeg|raw-bgra|nv12>  Source frames for the WGC H.264 bridge
  --preferredVideoCodec <mjpeg|h264>    Preferred codec in session_offer
  --h264Encoder <name>                  Optional H.264 encoder for temporary ffmpeg-h264 host
  --ffmpeg <path>                       Explicit FFmpeg path for local temporary host
  --useExisting                         Connect to an already running Windows host
  --resourceSample false                Disable local Windows host CPU/memory sampling
  --resourceSampleIntervalMs <ms>       Resource sample interval (default: ${defaults.resourceSampleIntervalMs})
  --resourceSampleTree true             Include child processes such as FFmpeg
  --json                                Print JSON result only
  --verbose                             Print temporary Windows host logs
  --help, -h                            Show this help without starting a host

Examples:
  node scripts/windows/observe-windows-host-video.mjs --durationMs 2500 --maxFrameAgeMs 1000 --requireMonotonicTimestamp
  node scripts/windows/observe-windows-host-video.mjs --screenMode mock --requireRealVideo false --minFrames 5
`);
}

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
  args.qualityPreset = String(args.qualityPreset || defaults.qualityPreset).trim();
  args.durationMs = Number(args.durationMs) || defaults.durationMs;
  args.timeoutMs = Number(args.timeoutMs) || defaults.timeoutMs;
  const progressIntervalMs = Number(args.progressIntervalMs);
  args.progressIntervalMs = Number.isFinite(progressIntervalMs)
    ? Math.max(0, progressIntervalMs)
    : defaults.progressIntervalMs;
  args.minFrames = Number(args.minFrames) || defaults.minFrames;
  args.minFps = Number.isFinite(Number(args.minFps)) ? Number(args.minFps) : defaults.minFps;
  args.minFreshFps = Math.max(0, Number(args.minFreshFps) || defaults.minFreshFps);
  args.minUniqueHelperFps = Math.max(0, Number(args.minUniqueHelperFps) || defaults.minUniqueHelperFps);
  args.maxRepeatedFrameRatio = normalizeRatioArg(args.maxRepeatedFrameRatio, defaults.maxRepeatedFrameRatio);
  args.maxGapMs = Number(args.maxGapMs) || defaults.maxGapMs;
  args.maxFrameAgeMs = Math.max(0, Number(args.maxFrameAgeMs) || 0);
  args.maxContentAgeMs = Math.max(0, Number(args.maxContentAgeMs) || 0);
  args.screenMode = String(args.screenMode || defaults.screenMode).trim().toLowerCase();
  args.preferredVideoCodec = String(args.preferredVideoCodec || "").trim().toLowerCase();
  args.h264Encoder = String(args.h264Encoder || "").trim().toLowerCase();
  args.inputMode = String(args.inputMode || defaults.inputMode).trim().toLowerCase();
  args.ffmpeg = String(args.ffmpeg || "").trim();
  if (!args.ffmpeg && process.platform === "win32" && existsSync(defaultWindowsFfmpeg)) {
    args.ffmpeg = defaultWindowsFfmpeg;
  }
  args.useDefaultMaxScreenFps = booleanArg(args.useDefaultMaxScreenFps);
  args.expectSessionFps = Number(args.expectSessionFps) || 0;
  args.requireMonotonicTimestamp = booleanArg(args.requireMonotonicTimestamp);
  args.requireRealVideo = booleanArg(args.requireRealVideo);
  args.useExisting = booleanArg(args.useExisting);
  args.keepRunning = booleanArg(args.keepRunning);
  args.json = booleanArg(args.json);
  args.verbose = booleanArg(args.verbose);
  args.resourceSample = booleanArg(args.resourceSample);
  args.resourceSampleIntervalMs = Math.max(250, Number(args.resourceSampleIntervalMs) || defaults.resourceSampleIntervalMs);
  args.resourceSampleTree = booleanArg(args.resourceSampleTree);
  args.resourceSampleTimeoutMs = Math.max(1000, Number(args.resourceSampleTimeoutMs) || defaults.resourceSampleTimeoutMs);
  args.wgcRepeatLastFrame = booleanArg(args.wgcRepeatLastFrame);
  args.wgcRepeatLastFrameMode = normalizeWgcRepeatLastFrameMode(args.wgcRepeatLastFrameMode);
  args.wgcH264Bridge = booleanArg(args.wgcH264Bridge);
  args.wgcH264Source = normalizeWgcH264Source(args.wgcH264Source);
  return args;
}

function booleanArg(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function normalizeRatioArg(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  if (number > 1) {
    return Math.max(0, Math.min(1, number / 100));
  }
  return Math.max(0, Math.min(1, number));
}

function normalizeWgcRepeatLastFrameMode(value) {
  const mode = String(value ?? defaults.wgcRepeatLastFrameMode).trim().toLowerCase();
  if (["signal", "light", "lightweight", "thin"].includes(mode)) {
    return "signal";
  }
  return "full";
}

function normalizeWgcH264Source(value) {
  const source = String(value ?? defaults.wgcH264Source).trim().toLowerCase();
  if (["raw", "bgra", "raw-bgra", "raw_bgra"].includes(source)) {
    return "raw-bgra";
  }
  if (["nv12", "raw-nv12", "raw_nv12", "yuv", "yuv420"].includes(source)) {
    return "nv12";
  }
  return "jpeg";
}

function print(kind, text, args) {
  if (args?.json) return;
  console.log(`[${kind}] ${text}`);
}

function formatSeconds(ms) {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

function progressEveryText(args) {
  return args.progressIntervalMs > 0 ? formatSeconds(args.progressIntervalMs) : "off";
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
  const maxScreenFps = args.screenMode === "wgc"
    ? Math.max(1, Math.min(args.fps, 240))
    : Math.max(1, Math.min(args.fps, 60));
  const env = {
    ...process.env,
    LAN_DUAL_HOST: args.host,
    LAN_DUAL_PORT: String(args.port),
    LAN_DUAL_PASSWORD: args.password,
    LAN_DUAL_WINDOWS_SCREEN_MODE: args.screenMode,
    LAN_DUAL_WINDOWS_INPUT_MODE: args.inputMode,
    LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME: args.wgcRepeatLastFrame ? "1" : "0",
    LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME_MODE: args.wgcRepeatLastFrameMode,
    LAN_DUAL_WINDOWS_WGC_H264_BRIDGE: args.wgcH264Bridge ? "1" : "0",
    LAN_DUAL_WINDOWS_WGC_H264_SOURCE: args.wgcH264Source,
    ...(args.useDefaultMaxScreenFps
      ? {}
      : { LAN_DUAL_WINDOWS_MAX_SCREEN_FPS: String(maxScreenFps) }),
  };
  if (args.ffmpeg) {
    env.LAN_DUAL_FFMPEG = args.ffmpeg;
  }
  if (args.h264Encoder) {
    env.LAN_DUAL_WINDOWS_H264_ENCODER = args.h264Encoder;
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
  const preferredVideoCodec = args.preferredVideoCodec ||
    (args.screenMode === "ffmpeg-h264" || args.screenMode === "h264" ? "h264" : "mjpeg");
  return {
    type: "session_offer",
    protocolVersion: 1,
    wantVideo: true,
    wantAudio: false,
    wantClipboardText: false,
    wantClipboardFile: false,
    preferredVideoCodec,
    preferredVideoEncoding: preferredVideoCodec === "h264" ? "annexb" : "data-url",
    maxFps: args.fps,
    maxBandwidthKbps: args.bandwidthKbps,
    qualityPreset: args.qualityPreset,
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

function parseFrameTimestampMs(frame) {
  const parsed = Date.parse(String(frame.timestamp || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeFallbackReason(...values) {
  const raw = values
    .map((value) => String(value || "").trim())
    .find(Boolean);
  if (!raw) return "";

  const normalized = raw.replace(/\s+/g, " ").trim();
  const ffmpegTimeout = normalized.match(/FFmpeg did not produce a (?:JPEG|H\.264) frame within \d+ ms/i)?.[0] || "";
  if (ffmpegTimeout && /CopyFromScreen/i.test(normalized)) {
    return `${ffmpegTimeout}; System.Drawing CopyFromScreen fallback failed`;
  }

  return normalized.length > 260 ? `${normalized.slice(0, 257)}...` : normalized;
}

function normalizeHelperTimingMs(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    const number = Number(raw);
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(key) && Number.isFinite(number) && number >= 0) {
      result[key] = Number(number.toFixed(3));
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function summarizeHelperTimingMs(frames) {
  const stats = new Map();
  for (const frame of frames) {
    const timing = frame.helperTimingMs;
    if (!timing) {
      continue;
    }
    for (const [key, value] of Object.entries(timing)) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        continue;
      }
      const stat = stats.get(key) || {
        samples: 0,
        totalMs: 0,
        minMs: Number.POSITIVE_INFINITY,
        maxMs: 0,
      };
      stat.samples += 1;
      stat.totalMs += number;
      stat.minMs = Math.min(stat.minMs, number);
      stat.maxMs = Math.max(stat.maxMs, number);
      stats.set(key, stat);
    }
  }
  return Object.fromEntries(
    [...stats.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, stat]) => [key, {
        samples: stat.samples,
        avgMs: Number((stat.totalMs / Math.max(1, stat.samples)).toFixed(3)),
        minMs: Number(stat.minMs.toFixed(3)),
        maxMs: Number(stat.maxMs.toFixed(3)),
      }]),
  );
}

function formatHelperTimingSummary(timing) {
  if (!timing || Object.keys(timing).length === 0) {
    return "";
  }
  const parts = [
    ["frame", timing.frameTotalBeforeEmitMs],
    ["wait", timing.waitFrameMs],
    ["output", timing.outputTotalMs],
    ["map", timing.mapMs],
    ["convert", timing.convertEncodeMs],
    ["copy", timing.copyResourceMs],
  ]
    .filter(([, stat]) => stat && Number.isFinite(Number(stat.avgMs)) && Number.isFinite(Number(stat.maxMs)))
    .map(([label, stat]) => `${label} avg/max ${stat.avgMs}/${stat.maxMs}ms`);
  return parts.join(" / ");
}

function assertRealFrame(frame, context = {}) {
  const pipeline = String(frame.capturePipeline || "").toLowerCase();
  const source = String(frame.source || "").toLowerCase();
  const codec = String(frame.codec || "").toLowerCase();
  if (source === "mock" || pipeline.includes("mock") || codec === "mock-svg") {
    const reason = normalizeFallbackReason(frame.streamFallbackReason, frame.fallbackReason, context.fallbackReason);
    throw new Error(`expected real video frame, got codec=${codec || "missing"} source=${source || "missing"} pipeline=${pipeline || "missing"}${reason ? ` reason=${reason}` : ""}`);
  }
}

async function observeFrames(client, args, onFirstFrame = () => {}, context = {}) {
  const frames = [];
  const startedAt = performance.now();
  const deadline = startedAt + args.durationMs;
  let lastAt = startedAt;
  let maxGapMs = 0;
  let previousTimestampMs = 0;
  let timestampMonotonicViolations = 0;
  let nextProgressAt = args.progressIntervalMs > 0 ? startedAt + args.progressIntervalMs : 0;

  print(
    "INFO",
    `Video observation started: target=${formatSeconds(args.durationMs)}, progressEvery=${progressEveryText(args)}, maxGap=${args.maxGapMs}ms.`,
    args,
  );

  while (performance.now() < deadline) {
    const waitMs = Math.min(args.timeoutMs, Math.max(1, deadline - performance.now()));
    let frame;
    try {
      frame = await client.waitForMessage("video_frame", waitMs);
    } catch (error) {
      if (frames.length > 0 && (waitMs < args.timeoutMs || performance.now() >= deadline)) {
        break;
      }
      throw error;
    }
    const now = performance.now();
    const receivedAtMs = Date.now();
    const gap = frames.length === 0 ? 0 : now - lastAt;
    lastAt = now;
    maxGapMs = Math.max(maxGapMs, gap);
    if (args.requireRealVideo) {
      assertRealFrame(frame, context);
    }
    if (frames.length === 0) {
      onFirstFrame();
    }
    const timestampMs = parseFrameTimestampMs(frame);
    if (timestampMs > 0 && previousTimestampMs > 0 && timestampMs < previousTimestampMs) {
      timestampMonotonicViolations += 1;
    }
    if (timestampMs > 0) {
      previousTimestampMs = timestampMs;
    }
    frames.push({
      atMs: now,
      timestampMs,
      frameAgeMs: timestampMs > 0 ? Math.max(0, receivedAtMs - timestampMs) : null,
      frameId: Number(frame.frameId) || frames.length + 1,
      codec: frame.codec || "",
      encoding: frame.encoding || "",
      pipeline: frame.capturePipeline || "",
      source: frame.source || "",
      droppedFrames: Number(frame.droppedFrames) || 0,
      repeatedFrame: frame.repeatedFrame === true,
      repeatPreviousFrame: frame.repeatPreviousFrame === true,
      repeatLastFrameMode: String(frame.repeatLastFrameMode || "").trim(),
      bytes: estimateFrameBytes(frame),
      sourcePayloadBytes: Number(frame.sourcePayloadBytes) || 0,
      width: Number(frame.width) || 0,
      height: Number(frame.height) || 0,
      maxBandwidthKbps: Number(frame.maxBandwidthKbps) || 0,
      qualityPreset: frame.qualityPreset || "",
      jpegQuality: Number(frame.jpegQuality) || 0,
      helperFrameId: Number(frame.helperFrameId) || 0,
      helperTimingMs: normalizeHelperTimingMs(frame.helperTimingMs),
      contentAgeMs: Number.isFinite(Number(frame.contentAgeMs)) ? Number(frame.contentAgeMs) : null,
      fallbackReason: normalizeFallbackReason(frame.streamFallbackReason, frame.fallbackReason, context.fallbackReason),
      requestedScreenMode: String(frame.requestedScreenMode || context.requestedScreenMode || "").trim(),
      h264Encoder: String(frame.h264Encoder || context.h264Encoder || "").trim(),
    });

    if (nextProgressAt > 0 && now >= nextProgressAt && now < deadline) {
      printVideoProgress(frames, startedAt, deadline, maxGapMs, args);
      do {
        nextProgressAt += args.progressIntervalMs;
      } while (nextProgressAt <= now);
    }
  }

  const elapsedMs = Math.max(1, (frames.at(-1)?.atMs || performance.now()) - startedAt);
  const fps = frames.length > 1 ? (frames.length * 1000) / elapsedMs : 0;
  const bytesTotal = frames.reduce((sum, frame) => sum + frame.bytes, 0);
  const droppedFrames = frames.reduce((sum, frame) => sum + frame.droppedFrames, 0);
  const repeatedFrames = frames.filter((frame) => frame.repeatedFrame).length;
  const repeatSignalFrames = frames.filter((frame) => frame.repeatPreviousFrame).length;
  const freshFrames = frames.length - repeatedFrames;
  const frameAges = frames
    .map((frame) => frame.frameAgeMs)
    .filter((age) => Number.isFinite(age));
  const contentAges = frames
    .map((frame) => frame.contentAgeMs)
    .filter((age) => Number.isFinite(age));
  const helperFrameIds = frames
    .map((frame) => frame.helperFrameId)
    .filter((id) => id > 0);
  const firstFrame = frames[0] || {};
  const lastFrame = frames.at(-1) || {};
  const uniquePipelines = [...new Set(frames.map((frame) => frame.pipeline).filter(Boolean))];
  const uniqueCodecs = [...new Set(frames.map((frame) => frame.codec).filter(Boolean))];
  const fallbackReasons = [...new Set(frames.map((frame) => frame.fallbackReason).filter(Boolean))];
  const requestedScreenModes = [...new Set(frames.map((frame) => frame.requestedScreenMode).filter(Boolean))];
  const h264Encoders = [...new Set(frames.map((frame) => frame.h264Encoder).filter(Boolean))];
  const repeatLastFrameModes = [...new Set(frames.map((frame) => frame.repeatLastFrameMode).filter(Boolean))];
  const helperTimingMs = summarizeHelperTimingMs(frames);
  const uniqueHelperFrameCount = new Set(helperFrameIds).size;
  const freshFps = freshFrames > 0 ? (freshFrames * 1000) / elapsedMs : 0;
  const repeatedFrameRatio = frames.length > 0 ? repeatedFrames / frames.length : 0;
  const repeatSignalFrameRatio = frames.length > 0 ? repeatSignalFrames / frames.length : 0;
  const uniqueHelperFps = uniqueHelperFrameCount > 0 ? (uniqueHelperFrameCount * 1000) / elapsedMs : 0;
  const uniqueQualities = [...new Set(
    frames
      .map((frame) => frame.jpegQuality)
      .filter((quality) => quality > 0)
      .map((quality) => Number(quality.toFixed(3))),
  )];
  const uniqueBandwidths = [...new Set(
    frames
      .map((frame) => frame.maxBandwidthKbps)
      .filter((bandwidth) => bandwidth > 0),
  )];

  return {
    frameCount: frames.length,
    elapsedMs: Math.round(elapsedMs),
    fps: Number(fps.toFixed(2)),
    maxGapMs: Math.round(maxGapMs),
    avgPayloadBytes: frames.length ? Math.round(bytesTotal / frames.length) : 0,
    droppedFrames,
    repeatedFrames,
    repeatSignalFrames,
    freshFrames,
    freshFps: Number(freshFps.toFixed(2)),
    repeatedFrameRatio: Number(repeatedFrameRatio.toFixed(4)),
    repeatedFramePercent: Number((repeatedFrameRatio * 100).toFixed(1)),
    repeatSignalFrameRatio: Number(repeatSignalFrameRatio.toFixed(4)),
    repeatSignalFramePercent: Number((repeatSignalFrameRatio * 100).toFixed(1)),
    uniqueHelperFrameCount,
    uniqueHelperFps: Number(uniqueHelperFps.toFixed(2)),
    timestampFrameCount: frameAges.length,
    minFrameAgeMs: frameAges.length ? Math.round(Math.min(...frameAges)) : null,
    avgFrameAgeMs: frameAges.length
      ? Math.round(frameAges.reduce((sum, age) => sum + age, 0) / frameAges.length)
      : null,
    maxFrameAgeMs: frameAges.length ? Math.round(Math.max(...frameAges)) : null,
    avgContentAgeMs: contentAges.length
      ? Math.round(contentAges.reduce((sum, age) => sum + age, 0) / contentAges.length)
      : null,
    maxContentAgeMs: contentAges.length ? Math.round(Math.max(...contentAges)) : null,
    timestampMonotonic: timestampMonotonicViolations === 0,
    timestampMonotonicViolations,
    firstFrameId: firstFrame.frameId || 0,
    lastFrameId: lastFrame.frameId || 0,
    width: firstFrame.width || 0,
    height: firstFrame.height || 0,
    maxBandwidthKbps: firstFrame.maxBandwidthKbps || 0,
    qualityPreset: firstFrame.qualityPreset || "",
    jpegQualities: uniqueQualities,
    maxBandwidthsKbps: uniqueBandwidths,
    pipelines: uniquePipelines,
    codecs: uniqueCodecs,
    fallbackReasons,
    requestedScreenModes,
    h264Encoders,
    repeatLastFrameModes,
    helperTimingMs,
  };
}

function printVideoProgress(frames, startedAt, deadline, maxGapMs, args) {
  const now = performance.now();
  const elapsedMs = Math.max(1, now - startedAt);
  const remainingMs = Math.max(0, deadline - now);
  const fps = frames.length > 1 ? (frames.length * 1000) / elapsedMs : 0;
  const repeatedFrames = frames.filter((frame) => frame.repeatedFrame).length;
  const freshFrames = frames.length - repeatedFrames;
  const frameAges = frames
    .map((frame) => frame.frameAgeMs)
    .filter((age) => Number.isFinite(age));
  const latest = frames.at(-1) || {};
  const ageText = frameAges.length ? ` / ageMax=${Math.round(Math.max(...frameAges))}ms` : "";
  const helperText = latest.helperFrameId ? ` / helper=${latest.helperFrameId}` : "";
  print(
    "INFO",
    `Video progress: ${formatSeconds(elapsedMs)} elapsed / ${formatSeconds(remainingMs)} left / frames=${frames.length} / fps=${fps.toFixed(2)} / fresh=${freshFrames} / repeated=${repeatedFrames} / maxGap=${Math.round(maxGapMs)}ms${ageText} / codec=${latest.codec || "unknown"} / pipeline=${latest.pipeline || "unknown"}${helperText}`,
    args,
  );
}

function assertObservation(summary, args) {
  const problems = [];
  if (summary.frameCount < args.minFrames) {
    problems.push(`frames ${summary.frameCount} < ${args.minFrames}`);
  }
  if (summary.fps < args.minFps) {
    problems.push(`fps ${summary.fps} < ${args.minFps}`);
  }
  if (args.minFreshFps > 0 && summary.freshFps < args.minFreshFps) {
    problems.push(`freshFps ${summary.freshFps} < ${args.minFreshFps}`);
  }
  if (args.minUniqueHelperFps > 0 && summary.uniqueHelperFps < args.minUniqueHelperFps) {
    problems.push(`uniqueHelperFps ${summary.uniqueHelperFps} < ${args.minUniqueHelperFps}`);
  }
  if (summary.repeatedFrameRatio > args.maxRepeatedFrameRatio) {
    problems.push(`repeatedFrameRatio ${summary.repeatedFrameRatio} > ${args.maxRepeatedFrameRatio}`);
  }
  if (summary.maxGapMs > args.maxGapMs) {
    problems.push(`maxGapMs ${summary.maxGapMs} > ${args.maxGapMs}`);
  }
  if (args.maxFrameAgeMs > 0) {
    if (!summary.timestampFrameCount) {
      problems.push("no frame timestamps were observed");
    } else if (summary.maxFrameAgeMs > args.maxFrameAgeMs) {
      problems.push(`maxFrameAgeMs ${summary.maxFrameAgeMs} > ${args.maxFrameAgeMs}`);
    }
  }
  if (args.requireMonotonicTimestamp && !summary.timestampMonotonic) {
    problems.push(`timestamp monotonic violations ${summary.timestampMonotonicViolations}`);
  }
  if (args.maxContentAgeMs > 0) {
    if (summary.maxContentAgeMs === null) {
      problems.push("no WGC content age values were observed");
    } else if (summary.maxContentAgeMs > args.maxContentAgeMs) {
      problems.push(`maxContentAgeMs ${summary.maxContentAgeMs} > ${args.maxContentAgeMs}`);
    }
  }
  if (args.expectSessionFps > 0 && summary.sessionFps !== args.expectSessionFps) {
    problems.push(`sessionFps ${summary.sessionFps} != ${args.expectSessionFps}`);
  }
  if (problems.length > 0) {
    throw new Error(`video observation failed: ${problems.join("; ")}`);
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const args = parseArgs(process.argv);
  let child = null;
  let socket = null;
  let resourceSampler = null;

  try {
    await prepareLocalPort(args);

    if (!args.useExisting) {
      child = startLocalWindowsHost(args);
      print("OK", `Started local Windows host PID ${child.pid} on ${args.host}:${args.port}`, args);
    }

    const discovery = await waitFor(() => fetchDiscovery(args), args.timeoutMs, "Windows host discovery");
    const screen = discovery.capabilities?.screen || {};
    print("OK", `Discovery: ${discovery.deviceName || discovery.hostName || "Windows host"} / ${screen.mode || "unknown"} / ${screen.capturePipeline || "unknown"}`, args);
    const resourcePid = child?.pid || (args.useExisting && isLikelyLocalHost(args.host) ? Number(discovery.runtime?.processId) || 0 : 0);
    function startResourceSamplingOnce() {
      if (!resourcePid || !args.resourceSample || resourceSampler) {
        return;
      }
      resourceSampler = startProcessResourceSampling({
        pid: resourcePid,
        intervalMs: args.resourceSampleIntervalMs,
        includeTree: args.resourceSampleTree,
        timeoutMs: args.resourceSampleTimeoutMs,
      });
      print("INFO", `Resource sampling: PID ${resourcePid}${args.resourceSampleTree ? " process tree" : ""}`, args);
    }

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

    const summary = await observeFrames(client, args, startResourceSamplingOnce, {
      fallbackReason: screen.lastCaptureError || "",
      requestedScreenMode: screen.requestedMode || "",
      h264Encoder: answer.h264Encoder || screen.h264Encoder || "",
    });
    summary.sessionFps = Number(answer.fps) || 0;
    const resource = resourceSampler ? await resourceSampler.stop() : {
      available: false,
      rootPid: 0,
      sampleCount: 0,
      errors: [args.resourceSample ? "no local Windows host process id available" : "resource sampling disabled"],
    };
    assertObservation(summary, args);

    const result = {
      ok: true,
      target: `${args.host}:${args.port}`,
      requested: {
        width: args.width,
        height: args.height,
        fps: args.fps,
        bandwidthKbps: args.bandwidthKbps,
        qualityPreset: args.qualityPreset,
        useDefaultMaxScreenFps: args.useDefaultMaxScreenFps,
        durationMs: args.durationMs,
        progressIntervalMs: args.progressIntervalMs,
        minFreshFps: args.minFreshFps,
        minUniqueHelperFps: args.minUniqueHelperFps,
        maxRepeatedFrameRatio: args.maxRepeatedFrameRatio,
        maxContentAgeMs: args.maxContentAgeMs,
        screenMode: args.screenMode,
        h264Encoder: args.h264Encoder,
        resourceSample: args.resourceSample,
        resourceSampleIntervalMs: args.resourceSampleIntervalMs,
        resourceSampleTree: args.resourceSampleTree,
        wgcRepeatLastFrame: args.wgcRepeatLastFrame,
        wgcRepeatLastFrameMode: args.wgcRepeatLastFrameMode,
        wgcH264Bridge: args.wgcH264Bridge,
        wgcH264Source: args.wgcH264Source,
      },
      discoveryScreen: {
        mode: screen.mode || "",
        requestedMode: screen.requestedMode || "",
        capturePipeline: screen.capturePipeline || "",
        h264Encoder: screen.h264Encoder || "",
        lastCaptureError: screen.lastCaptureError || "",
        wgc: screen.wgc || null,
      },
      session: {
        width: answer.width || 0,
        height: answer.height || 0,
        fps: answer.fps || 0,
        requestedFps: answer.requestedFps || args.fps,
        maxScreenFps: answer.maxScreenFps || 0,
        maxBandwidthKbps: answer.maxBandwidthKbps || 0,
        qualityPreset: answer.qualityPreset || "",
        jpegQuality: answer.jpegQuality || 0,
        videoCodec: answer.videoCodec || "",
        videoEncoding: answer.videoEncoding || "",
        codecString: answer.codecString || "",
        capturePipeline: answer.capturePipeline || "",
        h264Encoder: answer.h264Encoder || "",
        hostMode: answer.hostMode || "",
        requestedScreenMode: answer.requestedScreenMode || "",
        wgcFallbackReason: answer.wgcFallbackReason || "",
      },
      observation: summary,
      resource,
    };

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      print("OK", `Observed ${summary.frameCount} frames in ${summary.elapsedMs} ms`, args);
      print("OK", `Average FPS: ${summary.fps} / fresh FPS: ${summary.freshFps} / max gap: ${summary.maxGapMs} ms / dropped: ${summary.droppedFrames}`, args);
      if (summary.repeatedFrames > 0 || args.wgcRepeatLastFrame) {
        print(
          "INFO",
          `WGC repeat: mode ${args.wgcRepeatLastFrameMode}, repeated ${summary.repeatedFrames} (${summary.repeatedFramePercent}%) / signal ${summary.repeatSignalFrames} (${summary.repeatSignalFramePercent}%) / fresh ${summary.freshFrames} @ ${summary.freshFps}fps / unique helper ${summary.uniqueHelperFrameCount} @ ${summary.uniqueHelperFps}fps / content age max ${summary.maxContentAgeMs ?? "?"} ms`,
          args,
        );
      }
      const helperTimingLine = formatHelperTimingSummary(summary.helperTimingMs);
      if (helperTimingLine) {
        print("INFO", `WGC helper timing: ${helperTimingLine}`, args);
      }
      if (summary.timestampFrameCount > 0) {
        print(
          "INFO",
          `Frame age: min/avg/max ${summary.minFrameAgeMs}/${summary.avgFrameAgeMs}/${summary.maxFrameAgeMs} ms / monotonic=${summary.timestampMonotonic}`,
          args,
        );
      } else {
        print("WARN", "No video_frame.timestamp values observed", args);
      }
      print("INFO", `Requested bandwidth: ${args.bandwidthKbps} Kbps / session: ${answer.maxBandwidthKbps || 0} Kbps / JPEG quality: ${answer.jpegQuality || "unknown"}`, args);
      print("INFO", `Pipeline: ${summary.pipelines.join(", ") || "unknown"} / codec: ${summary.codecs.join(", ") || "unknown"} / avg bytes: ${summary.avgPayloadBytes}`, args);
      if (summary.h264Encoders.length > 0) {
        print("INFO", `H.264 encoder: ${summary.h264Encoders.join(", ")}`, args);
      }
      if (summary.requestedScreenModes.length > 0 && !summary.requestedScreenModes.includes(screen.mode || "")) {
        print("INFO", `Requested screen mode: ${summary.requestedScreenModes.join(", ")} / active: ${screen.mode || "unknown"}`, args);
      }
      if (summary.fallbackReasons.length > 0) {
        print("WARN", `Fallback reason: ${summary.fallbackReasons.join(" | ")}`, args);
      }
      if (resource.available) {
        print(
          "INFO",
          `Resource: CPU avg/max ${resource.avgCpuPercent}/${resource.maxCpuPercent}% / working set avg/peak ${resource.avgWorkingSetMiB}/${resource.peakWorkingSetMiB} MiB / samples ${resource.sampleCount}`,
          args,
        );
      } else {
        print("WARN", `Resource sampling unavailable: ${(resource.errors || []).join("; ") || "unknown"}`, args);
      }
      print("OK", "Windows host video observation passed", args);
    }
  } finally {
    if (resourceSampler) {
      await resourceSampler.stop();
    }
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
