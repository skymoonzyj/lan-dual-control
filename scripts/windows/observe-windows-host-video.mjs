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
  minFrames: 20,
  minFps: 8,
  maxGapMs: 1000,
  maxFrameAgeMs: 0,
  screenMode: "auto",
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
};

function printUsage() {
  console.log(`Usage:
  node scripts/windows/observe-windows-host-video.mjs [options]

Options:
  --host <host>                         Windows host address (default: ${defaults.host})
  --port <port>                         Windows host port (default: ${defaults.port})
  --password <password>                 Windows host password (default: ${defaults.password})
  --durationMs <ms>                     Observation duration (default: ${defaults.durationMs})
  --width <px> --height <px> --fps <n>  Requested video size/FPS
  --bandwidthKbps <kbps>                Requested max bandwidth (default: ${defaults.bandwidthKbps})
  --qualityPreset <name>                smooth | balanced | sharp | custom
  --maxGapMs <ms>                       Fail if inter-frame receive gap is higher
  --maxFrameAgeMs <ms>                  Fail if video_frame.timestamp receive age is higher
  --requireMonotonicTimestamp           Fail if video_frame.timestamp goes backwards
  --requireRealVideo false              Allow mock-svg frames for local smoke checks
  --screenMode <auto|ffmpeg|system|mock>
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
  args.minFrames = Number(args.minFrames) || defaults.minFrames;
  args.minFps = Number(args.minFps) || defaults.minFps;
  args.maxGapMs = Number(args.maxGapMs) || defaults.maxGapMs;
  args.maxFrameAgeMs = Math.max(0, Number(args.maxFrameAgeMs) || 0);
  args.screenMode = String(args.screenMode || defaults.screenMode).trim().toLowerCase();
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
    LAN_DUAL_WINDOWS_INPUT_MODE: args.inputMode,
    ...(args.useDefaultMaxScreenFps
      ? {}
      : { LAN_DUAL_WINDOWS_MAX_SCREEN_FPS: String(Math.max(1, Math.min(args.fps, 60))) }),
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
  const ffmpegTimeout = normalized.match(/FFmpeg did not produce a JPEG frame within \d+ ms/i)?.[0] || "";
  if (ffmpegTimeout && /CopyFromScreen/i.test(normalized)) {
    return `${ffmpegTimeout}; System.Drawing CopyFromScreen fallback failed`;
  }

  return normalized.length > 260 ? `${normalized.slice(0, 257)}...` : normalized;
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
  let lastAt = startedAt;
  let maxGapMs = 0;
  let previousTimestampMs = 0;
  let timestampMonotonicViolations = 0;

  while (performance.now() - startedAt < args.durationMs) {
    const frame = await client.waitForMessage("video_frame", args.timeoutMs);
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
      bytes: estimateFrameBytes(frame),
      width: Number(frame.width) || 0,
      height: Number(frame.height) || 0,
      maxBandwidthKbps: Number(frame.maxBandwidthKbps) || 0,
      qualityPreset: frame.qualityPreset || "",
      jpegQuality: Number(frame.jpegQuality) || 0,
      fallbackReason: normalizeFallbackReason(frame.streamFallbackReason, frame.fallbackReason, context.fallbackReason),
    });
  }

  const elapsedMs = Math.max(1, (frames.at(-1)?.atMs || performance.now()) - startedAt);
  const fps = frames.length > 1 ? (frames.length * 1000) / elapsedMs : 0;
  const bytesTotal = frames.reduce((sum, frame) => sum + frame.bytes, 0);
  const droppedFrames = frames.reduce((sum, frame) => sum + frame.droppedFrames, 0);
  const frameAges = frames
    .map((frame) => frame.frameAgeMs)
    .filter((age) => Number.isFinite(age));
  const firstFrame = frames[0] || {};
  const lastFrame = frames.at(-1) || {};
  const uniquePipelines = [...new Set(frames.map((frame) => frame.pipeline).filter(Boolean))];
  const uniqueCodecs = [...new Set(frames.map((frame) => frame.codec).filter(Boolean))];
  const fallbackReasons = [...new Set(frames.map((frame) => frame.fallbackReason).filter(Boolean))];
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
    timestampFrameCount: frameAges.length,
    minFrameAgeMs: frameAges.length ? Math.round(Math.min(...frameAges)) : null,
    avgFrameAgeMs: frameAges.length
      ? Math.round(frameAges.reduce((sum, age) => sum + age, 0) / frameAges.length)
      : null,
    maxFrameAgeMs: frameAges.length ? Math.round(Math.max(...frameAges)) : null,
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
        screenMode: args.screenMode,
        resourceSample: args.resourceSample,
        resourceSampleIntervalMs: args.resourceSampleIntervalMs,
        resourceSampleTree: args.resourceSampleTree,
      },
      discoveryScreen: {
        mode: screen.mode || "",
        capturePipeline: screen.capturePipeline || "",
        lastCaptureError: screen.lastCaptureError || "",
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
        capturePipeline: answer.capturePipeline || "",
        hostMode: answer.hostMode || "",
      },
      observation: summary,
      resource,
    };

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      print("OK", `Observed ${summary.frameCount} frames in ${summary.elapsedMs} ms`, args);
      print("OK", `Average FPS: ${summary.fps} / max gap: ${summary.maxGapMs} ms / dropped: ${summary.droppedFrames}`, args);
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
