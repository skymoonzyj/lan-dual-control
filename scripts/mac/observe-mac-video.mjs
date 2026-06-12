#!/usr/bin/env node
import { randomUUID } from "node:crypto";

const defaults = {
  host: "127.0.0.1",
  port: "43770",
  password: "demo-password",
  durationMs: 5000,
  timeoutMs: 8000,
  minFrames: "",
  minFps: 0,
  maxGapMs: 1000,
  preferredVideoCodec: "h264",
  requireH264: false,
  requireRealVideo: false,
  expectedCodec: "",
  expectedPipeline: "",
  displayId: "main",
  requireFrameDisplayDiagnostic: false,
  expectActiveDisplayId: "",
  width: 1280,
  height: 720,
  fps: 30,
  bandwidthKbps: 12000,
};

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }

  args.host = String(args.host || defaults.host);
  args.port = String(args.port || defaults.port);
  args.password = String(args.password || defaults.password);
  args.durationMs = positiveInteger(args.durationMs, defaults.durationMs);
  args.timeoutMs = positiveInteger(args.timeoutMs, defaults.timeoutMs);
  args.minFrames = args.minFrames === "" || args.minFrames === undefined
    ? Math.max(3, Math.floor(args.durationMs / 250))
    : nonNegativeInteger(args.minFrames, 0);
  args.minFps = nonNegativeNumber(args.minFps, defaults.minFps);
  args.maxGapMs = positiveInteger(args.maxGapMs, defaults.maxGapMs);
  args.preferredVideoCodec = normalizedText(args.preferredVideoCodec || defaults.preferredVideoCodec) || "h264";
  args.requireH264 = booleanArg(args.requireH264, defaults.requireH264);
  args.requireRealVideo = booleanArg(args.requireRealVideo, defaults.requireRealVideo);
  args.expectedCodec = normalizedText(args.expectedCodec);
  args.expectedPipeline = normalizedText(args.expectedPipeline);
  args.displayId = normalizedText(args.displayId || defaults.displayId) || "main";
  args.requireFrameDisplayDiagnostic = booleanArg(args.requireFrameDisplayDiagnostic, defaults.requireFrameDisplayDiagnostic);
  args.expectActiveDisplayId = normalizedText(args.expectActiveDisplayId);
  args.width = positiveInteger(args.width, defaults.width);
  args.height = positiveInteger(args.height, defaults.height);
  args.fps = positiveInteger(args.fps, defaults.fps);
  args.bandwidthKbps = positiveInteger(args.bandwidthKbps, defaults.bandwidthKbps);
  if (args.expectActiveDisplayId) {
    args.requireFrameDisplayDiagnostic = true;
  }
  if (args.requireH264) {
    args.preferredVideoCodec = "h264";
    args.expectedCodec ||= "h264";
    args.expectedPipeline ||= "screencapturekit-h264";
  }
  return args;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function nonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function booleanArg(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function print(status, text) {
  console.log(`[${status}] ${text}`);
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function makeEnvelope(message) {
  return {
    id: `${message.type}-${randomUUID()}`,
    timestamp: new Date().toISOString(),
    ...message,
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs} ms`)), timeoutMs);
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

async function fetchDiscovery(args) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await fetch(`http://${args.host}:${args.port}/discovery`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`discovery HTTP ${response.status}`);
    }
    const payload = await response.json();
    const name = payload.deviceName || payload.hostName || "unknown";
    const platform = payload.platform || "unknown";
    print("OK", `Discovery: ${name} / ${platform} / ${args.host}:${args.port}`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function openWebSocket(args) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://${args.host}:${args.port}`);
      socket.addEventListener("open", () => resolve(socket), { once: true });
      socket.addEventListener("error", () => reject(new Error("WebSocket open failed")), { once: true });
    }),
    args.timeoutMs,
    "WebSocket open",
  );
}

function createClient(socket, onVideoFrame) {
  const pending = new Map();
  const queues = new Map();

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message.type === "video_frame") {
      onVideoFrame(message);
      return;
    }

    const waiters = pending.get(message.type) || [];
    if (waiters.length > 0) {
      const waiter = waiters.shift();
      waiter.resolve(message);
      if (waiters.length === 0) {
        pending.delete(message.type);
      }
      return;
    }

    if (message.type === "audio_frame") {
      return;
    }

    const queue = queues.get(message.type) || [];
    queue.push(message);
    queues.set(message.type, queue);
  });

  socket.addEventListener("close", () => {
    for (const waiters of pending.values()) {
      waiters.forEach((waiter) => waiter.reject(new Error("WebSocket closed")));
    }
    pending.clear();
  });

  function send(message) {
    socket.send(JSON.stringify(makeEnvelope(message)));
  }

  function waitFor(type, timeoutMs) {
    return withTimeout(
      new Promise((resolve, reject) => {
        const queue = queues.get(type) || [];
        if (queue.length > 0) {
          const message = queue.shift();
          if (queue.length === 0) queues.delete(type);
          resolve(message);
          return;
        }
        const waiters = pending.get(type) || [];
        waiters.push({ resolve, reject });
        pending.set(type, waiters);
      }),
      timeoutMs,
      `Waiting ${type}`,
    );
  }

  return { send, waitFor };
}

function makeSessionOffer(args) {
  return {
    type: "session_offer",
    protocolVersion: 1,
    wantVideo: true,
    wantAudio: false,
    wantClipboardText: false,
    wantClipboardFile: false,
    preferredVideoCodec: args.preferredVideoCodec,
    preferredVideoEncoding: "annexb",
    preferredAudioCodec: "pcm-f32le",
    maxFps: args.fps,
    maxBandwidthKbps: args.bandwidthKbps,
    qualityPreset: "diagnostic",
    displayMode: "window",
    displayId: args.displayId,
    preferredWidth: args.width,
    preferredHeight: args.height,
    audioVolume: 0,
  };
}

function createVideoStats(args) {
  const stats = {
    frames: 0,
    firstFrameId: null,
    lastFrameId: null,
    firstReceivedAt: 0,
    lastReceivedAt: 0,
    gaps: [],
    payloadBytes: 0,
    minPayloadBytes: Number.POSITIVE_INFINITY,
    maxPayloadBytes: 0,
    codecs: new Map(),
    encodings: new Map(),
    pipelines: new Map(),
    sources: new Map(),
    activeDisplayIds: new Map(),
    displayNames: new Map(),
    sizes: new Map(),
    invalidFrames: [],
  };

  function addFrame(frame) {
    const now = Date.now();
    const payloadBytes = framePayloadBytes(frame);

    if (stats.lastReceivedAt) {
      stats.gaps.push(now - stats.lastReceivedAt);
    }
    stats.frames += 1;
    stats.firstFrameId ??= frame.frameId ?? null;
    stats.lastFrameId = frame.frameId ?? stats.lastFrameId;
    stats.firstReceivedAt ||= now;
    stats.lastReceivedAt = now;
    stats.payloadBytes += payloadBytes;
    stats.minPayloadBytes = Math.min(stats.minPayloadBytes, payloadBytes);
    stats.maxPayloadBytes = Math.max(stats.maxPayloadBytes, payloadBytes);
    countValue(stats.codecs, frame.codec || frame.videoCodec || "unknown");
    countValue(stats.encodings, frame.encoding || frame.videoEncoding || "");
    countValue(stats.pipelines, frame.capturePipeline || "");
    countValue(stats.sources, frame.source || "");
    countValue(stats.activeDisplayIds, frame.activeDisplayId || frame.displayId || "");
    countValue(stats.displayNames, frame.displayName || "");
    countValue(stats.sizes, `${frame.width || "?"}x${frame.height || "?"}`);

    const problems = validateVideoFrame(frame, args);
    if (problems.length > 0 && stats.invalidFrames.length < 5) {
      stats.invalidFrames.push(`frame ${frame.frameId ?? "?"}: ${problems.join("; ")}`);
    }
  }

  return { stats, addFrame };
}

function countValue(map, value) {
  const key = String(value || "missing");
  map.set(key, (map.get(key) || 0) + 1);
}

function framePayloadBytes(frame) {
  const explicit = Number(frame.payloadBytes || frame.bytes);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (typeof frame.payload === "string" && frame.payload.length > 0) {
    return Buffer.from(frame.payload, "base64").length;
  }
  if (typeof frame.dataUrl === "string" && frame.dataUrl.length > 0) {
    const comma = frame.dataUrl.indexOf(",");
    const payload = comma >= 0 ? frame.dataUrl.slice(comma + 1) : frame.dataUrl;
    return Math.round((payload.length * 3) / 4);
  }
  return 0;
}

function hasVideoPayload(frame) {
  return framePayloadBytes(frame) > 0 || Boolean(frame.dataUrl || frame.payload);
}

function validateVideoFrame(frame, args) {
  const problems = [];
  const codec = normalizedText(frame.codec || frame.videoCodec);
  const encoding = normalizedText(frame.encoding || frame.videoEncoding);
  const pipeline = normalizedText(frame.capturePipeline);
  const source = normalizedText(frame.source);
  const dataUrl = normalizedText(frame.dataUrl);
  const activeDisplayId = normalizedText(frame.activeDisplayId || frame.displayId);

  if (!hasVideoPayload(frame)) problems.push("payload missing");
  if (args.expectedCodec && codec !== args.expectedCodec) problems.push(`codec=${frame.codec || frame.videoCodec || "missing"}`);
  if (args.expectedPipeline && pipeline !== args.expectedPipeline) problems.push(`capturePipeline=${frame.capturePipeline || "missing"}`);
  if (args.requireFrameDisplayDiagnostic && !activeDisplayId) problems.push("activeDisplayId missing");
  if (args.expectActiveDisplayId && activeDisplayId !== args.expectActiveDisplayId) {
    problems.push(`activeDisplayId=${frame.activeDisplayId || frame.displayId || "missing"}`);
  }
  if (args.requireH264) {
    if (codec !== "h264") problems.push(`codec=${frame.codec || "missing"}`);
    if (!encoding.includes("annexb")) problems.push(`encoding=${frame.encoding || "missing"}`);
    if (pipeline !== "screencapturekit-h264") problems.push(`capturePipeline=${frame.capturePipeline || "missing"}`);
    if (!frame.payload) problems.push("h264 payload missing");
  }
  if (args.requireRealVideo) {
    if (codec === "mock-svg") problems.push("codec=mock-svg");
    if (source === "mock") problems.push("source=mock");
    if (pipeline.includes("mock")) problems.push(`capturePipeline=${frame.capturePipeline}`);
    if (dataUrl.startsWith("data:image/svg")) problems.push("dataUrl is svg mock");
  }
  return problems;
}

function summarizeStats(stats, args) {
  const elapsedMs = stats.firstReceivedAt && stats.lastReceivedAt
    ? Math.max(1, stats.lastReceivedAt - stats.firstReceivedAt)
    : args.durationMs;
  const frameRate = stats.frames > 1 ? ((stats.frames - 1) * 1000) / elapsedMs : 0;
  const maxGap = stats.gaps.length > 0 ? Math.max(...stats.gaps) : 0;
  const avgGap = stats.gaps.length > 0 ? stats.gaps.reduce((sum, gap) => sum + gap, 0) / stats.gaps.length : 0;
  return [
    `frames=${stats.frames}`,
    `rate=${frameRate.toFixed(1)} fps`,
    `gap avg/max=${avgGap.toFixed(1)}/${Math.round(maxGap)} ms`,
    `payload min/max=${stats.minPayloadBytes === Number.POSITIVE_INFINITY ? 0 : stats.minPayloadBytes}/${stats.maxPayloadBytes} bytes`,
    `codec=${formatCounts(stats.codecs)}`,
    `encoding=${formatCounts(stats.encodings)}`,
    `pipeline=${formatCounts(stats.pipelines)}`,
    `source=${formatCounts(stats.sources)}`,
    `activeDisplayId=${formatCounts(stats.activeDisplayIds)}`,
    `displayName=${formatCounts(stats.displayNames)}`,
    `size=${formatCounts(stats.sizes)}`,
    `frameId ${stats.firstFrameId ?? "?"}->${stats.lastFrameId ?? "?"}`,
  ].join(" / ");
}

function formatCounts(map) {
  return [...map.entries()]
    .filter(([key]) => key && key !== "missing")
    .map(([key, count]) => `${key}:${count}`)
    .join(",") || "unknown";
}

function actualFps(stats, args) {
  const elapsedMs = stats.firstReceivedAt && stats.lastReceivedAt
    ? Math.max(1, stats.lastReceivedAt - stats.firstReceivedAt)
    : args.durationMs;
  return stats.frames > 1 ? ((stats.frames - 1) * 1000) / elapsedMs : 0;
}

function assertStats(stats, args) {
  const problems = [];
  if (stats.frames < args.minFrames) {
    problems.push(`only ${stats.frames} video frames, expected at least ${args.minFrames}`);
  }
  if (args.minFps > 0 && actualFps(stats, args) < args.minFps) {
    problems.push(`video FPS ${actualFps(stats, args).toFixed(1)} below ${args.minFps}`);
  }
  if (stats.invalidFrames.length > 0) {
    problems.push(`invalid video frame(s): ${stats.invalidFrames.join(" | ")}`);
  }
  if (stats.gaps.length > 0) {
    const maxGap = Math.max(...stats.gaps);
    if (maxGap > args.maxGapMs) {
      problems.push(`max video gap ${maxGap} ms exceeds ${args.maxGapMs} ms`);
    }
  }
  if (problems.length > 0) {
    throw new Error(problems.join("; "));
  }
}

function printUsage() {
  console.log(`Usage:
  node scripts/mac/observe-mac-video.mjs [options]

Options:
  --host <host>                    Mac host address. Default: 127.0.0.1
  --port <port>                    Mac host port. Default: 43770
  --password <password>            Probe password. Default: demo-password
  --durationMs <ms>                Video observation window after first frame. Default: 5000
  --timeoutMs <ms>                 Handshake and first-frame timeout. Default: 8000
  --minFrames <count>              Minimum required video frames. Default: durationMs / 250
  --minFps <fps>                   Minimum observed FPS. Default: 0
  --maxGapMs <ms>                  Maximum allowed receive gap. Default: 1000
  --preferredVideoCodec <codec>    Requested codec: h264 or mjpeg. Default: h264
  --requireH264                    Require h264 / annexb / screencapturekit-h264 frames.
  --requireRealVideo               Reject mock/svg video frames.
  --expectedCodec <codec>          Require an exact frame codec.
  --expectedPipeline <pipeline>    Require an exact capturePipeline.
  --displayId <id>                 Requested display id in session_offer. Default: main
  --requireFrameDisplayDiagnostic  Require video_frame.activeDisplayId/displayId to be present.
  --expectActiveDisplayId <id>     Require every video_frame active display id to match.

Examples:
  node scripts/mac/observe-mac-video.mjs --durationMs 10000 --requireH264 --minFrames 100 --minFps 20 --expectActiveDisplayId main
  node scripts/mac/observe-mac-video.mjs --preferredVideoCodec mjpeg --requireRealVideo --minFrames 20`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  print("INFO", `Target: ${args.host}:${args.port}`);
  print(
    "INFO",
    `Observe video for ${args.durationMs} ms, preferred=${args.preferredVideoCodec}, minFrames=${args.minFrames}, minFps=${args.minFps}, maxGapMs=${args.maxGapMs}`,
  );
  await fetchDiscovery(args);

  const video = createVideoStats(args);
  const socket = await openWebSocket(args);
  const client = createClient(socket, video.addFrame);
  print("OK", "WebSocket connected");

  client.send({
    type: "hello",
    clientName: "Mac video observer",
    clientPlatform: "macos",
    protocolVersion: 1,
  });
  const hello = await client.waitFor("hello_ack", args.timeoutMs);
  print("OK", `hello_ack: ${hello.deviceName || hello.hostName || "unknown"}`);

  client.send({
    type: "auth_request",
    method: "password",
    password: args.password,
  });
  const auth = await client.waitFor("auth_result", args.timeoutMs);
  if (!auth.ok) {
    throw new Error(`auth failed: ${auth.reason || auth.message || auth.code || "unknown"}`);
  }
  print("OK", "Auth passed");

  client.send(makeSessionOffer(args));
  const answer = await client.waitFor("session_answer", args.timeoutMs);
  if (!answer.ok) {
    throw new Error(`session failed: ${answer.reason || answer.message || "unknown"}`);
  }
  print(
    "OK",
    `Session: ${answer.width || answer.screenWidth}x${answer.height || answer.screenHeight} / ${answer.fps || "?"} Hz / ${answer.videoCodec || "unknown"} / ${answer.capturePipeline || "pipeline unknown"}`,
  );

  await withTimeout(
    new Promise((resolve) => {
      const poll = setInterval(() => {
        if (video.stats.frames > 0) {
          clearInterval(poll);
          resolve();
        }
      }, 25);
    }),
    args.timeoutMs,
    "First video_frame",
  );

  await delay(args.durationMs);
  socket.close();

  assertStats(video.stats, args);
  print("OK", `Video observation passed: ${summarizeStats(video.stats, args)}`);
}

main().catch((error) => {
  print("ERROR", error.message);
  process.exitCode = 1;
});
