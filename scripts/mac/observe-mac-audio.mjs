#!/usr/bin/env node
import { randomUUID } from "node:crypto";

const defaults = {
  host: "127.0.0.1",
  port: "43770",
  password: "demo-password",
  durationMs: 5000,
  timeoutMs: 8000,
  minFrames: 0,
  maxGapMs: 1000,
  expectedCodec: "pcm-f32le",
  expectedEncoding: "pcm-f32le-base64",
  expectedSampleRate: 48000,
  expectedChannels: 2,
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
  args.minFrames = nonNegativeInteger(args.minFrames, Math.max(3, Math.floor(args.durationMs / 100)));
  args.maxGapMs = positiveInteger(args.maxGapMs, defaults.maxGapMs);
  args.expectedCodec = String(args.expectedCodec || defaults.expectedCodec).trim().toLowerCase();
  args.expectedEncoding = String(args.expectedEncoding || defaults.expectedEncoding).trim().toLowerCase();
  args.expectedSampleRate = positiveInteger(args.expectedSampleRate, defaults.expectedSampleRate);
  args.expectedChannels = positiveInteger(args.expectedChannels, defaults.expectedChannels);
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

function createClient(socket, onAudioFrame, onAudioStatus) {
  const pending = new Map();
  const queues = new Map();

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message.type === "audio_frame") {
      onAudioFrame(message);
      return;
    }
    if (message.type === "audio_status") {
      onAudioStatus(message);
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

    if (message.type === "video_frame") {
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

function makeSessionOffer() {
  return {
    type: "session_offer",
    protocolVersion: 1,
    wantVideo: false,
    wantAudio: true,
    wantClipboardText: false,
    wantClipboardFile: false,
    preferredVideoCodec: "mjpeg",
    preferredAudioCodec: "pcm-f32le",
    maxFps: 1,
    maxBandwidthKbps: 1000,
    qualityPreset: "diagnostic",
    displayMode: "window",
    displayId: "main",
    preferredWidth: 640,
    preferredHeight: 360,
    audioVolume: 80,
  };
}

function createAudioStats(args) {
  const stats = {
    frames: 0,
    payloadBytes: 0,
    minPayloadBytes: Number.POSITIVE_INFINITY,
    maxPayloadBytes: 0,
    firstFrameId: null,
    lastFrameId: null,
    firstReceivedAt: 0,
    lastReceivedAt: 0,
    minLevel: Number.POSITIVE_INFINITY,
    maxLevel: 0,
    levelTotal: 0,
    gaps: [],
    invalidFrames: [],
    statuses: [],
  };

  function addFrame(frame) {
    const now = Date.now();
    const payloadBytes = Number(frame.payloadBytes) || estimatePayloadBytes(frame.payload);
    const level = Number(frame.level ?? frame.peak ?? 0);

    if (stats.lastReceivedAt) {
      stats.gaps.push(now - stats.lastReceivedAt);
    }
    stats.frames += 1;
    stats.payloadBytes += payloadBytes;
    stats.minPayloadBytes = Math.min(stats.minPayloadBytes, payloadBytes);
    stats.maxPayloadBytes = Math.max(stats.maxPayloadBytes, payloadBytes);
    stats.firstFrameId ??= frame.frameId ?? null;
    stats.lastFrameId = frame.frameId ?? stats.lastFrameId;
    stats.firstReceivedAt ||= now;
    stats.lastReceivedAt = now;
    stats.minLevel = Math.min(stats.minLevel, level);
    stats.maxLevel = Math.max(stats.maxLevel, level);
    stats.levelTotal += level;

    const problems = validateAudioFrame(frame, args);
    if (problems.length > 0 && stats.invalidFrames.length < 5) {
      stats.invalidFrames.push(`frame ${frame.frameId ?? "?"}: ${problems.join("; ")}`);
    }
  }

  function addStatus(status) {
    stats.statuses.push(status);
  }

  return { stats, addFrame, addStatus };
}

function estimatePayloadBytes(payload) {
  if (typeof payload !== "string" || payload.length === 0) return 0;
  return Buffer.from(payload, "base64").length;
}

function validateAudioFrame(frame, args) {
  const problems = [];
  const codec = normalizedText(frame.codec);
  const encoding = normalizedText(frame.encoding);
  const sampleRate = Number(frame.sampleRate);
  const channels = Number(frame.channels);
  const frames = Number(frame.frames);
  const payloadBytes = Number(frame.payloadBytes) || estimatePayloadBytes(frame.payload);

  if (codec !== args.expectedCodec) problems.push(`codec=${frame.codec || "missing"}`);
  if (encoding !== args.expectedEncoding) problems.push(`encoding=${frame.encoding || "missing"}`);
  if (sampleRate !== args.expectedSampleRate) problems.push(`sampleRate=${frame.sampleRate || "missing"}`);
  if (channels !== args.expectedChannels) problems.push(`channels=${frame.channels || "missing"}`);
  if (!Number.isFinite(frames) || frames <= 0) problems.push(`frames=${frame.frames || "missing"}`);
  if (!payloadBytes) problems.push("payload empty");
  return problems;
}

function summarizeStats(stats, args) {
  const elapsedMs = stats.firstReceivedAt && stats.lastReceivedAt
    ? Math.max(1, stats.lastReceivedAt - stats.firstReceivedAt)
    : args.durationMs;
  const frameRate = stats.frames > 1 ? ((stats.frames - 1) * 1000) / elapsedMs : 0;
  const maxGap = stats.gaps.length > 0 ? Math.max(...stats.gaps) : 0;
  const avgGap = stats.gaps.length > 0 ? stats.gaps.reduce((sum, gap) => sum + gap, 0) / stats.gaps.length : 0;
  const avgLevel = stats.frames > 0 ? stats.levelTotal / stats.frames : 0;
  return [
    `frames=${stats.frames}`,
    `rate=${frameRate.toFixed(1)} fps`,
    `gap avg/max=${avgGap.toFixed(1)}/${Math.round(maxGap)} ms`,
    `payload min/max=${stats.minPayloadBytes === Number.POSITIVE_INFINITY ? 0 : stats.minPayloadBytes}/${stats.maxPayloadBytes} bytes`,
    `totalPayload=${stats.payloadBytes} bytes`,
    `level min/avg/max=${finiteLevel(stats.minLevel).toFixed(3)}/${avgLevel.toFixed(3)}/${finiteLevel(stats.maxLevel).toFixed(3)}`,
    `frameId ${stats.firstFrameId ?? "?"}->${stats.lastFrameId ?? "?"}`,
  ].join(" / ");
}

function finiteLevel(value) {
  return Number.isFinite(value) ? value : 0;
}

function assertStats(stats, args) {
  const problems = [];
  if (stats.frames < args.minFrames) {
    problems.push(`only ${stats.frames} audio frames, expected at least ${args.minFrames}`);
  }
  if (stats.invalidFrames.length > 0) {
    problems.push(`invalid audio frame(s): ${stats.invalidFrames.join(" | ")}`);
  }
  if (stats.gaps.length > 0) {
    const maxGap = Math.max(...stats.gaps);
    if (maxGap > args.maxGapMs) {
      problems.push(`max audio gap ${maxGap} ms exceeds ${args.maxGapMs} ms`);
    }
  }
  if (problems.length > 0) {
    throw new Error(problems.join("; "));
  }
}

function printUsage() {
  console.log(`Usage:
  node scripts/mac/observe-mac-audio.mjs [options]

Options:
  --host <host>                 Mac host address. Default: 127.0.0.1
  --port <port>                 Mac host port. Default: 43770
  --password <password>         Probe password. Default: demo-password
  --durationMs <ms>             Audio observation window. Default: 5000
  --timeoutMs <ms>              Handshake timeout. Default: 8000
  --minFrames <count>           Minimum required audio frames. Default: durationMs / 100
  --maxGapMs <ms>               Maximum allowed receive gap. Default: 1000

Example:
  node scripts/mac/observe-mac-audio.mjs --durationMs 10000 --minFrames 80 --maxGapMs 1000`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  print("INFO", `Target: ${args.host}:${args.port}`);
  print("INFO", `Observe audio for ${args.durationMs} ms, minFrames=${args.minFrames}, maxGapMs=${args.maxGapMs}`);
  await fetchDiscovery(args);

  const audio = createAudioStats(args);
  const socket = await openWebSocket(args);
  const client = createClient(socket, audio.addFrame, audio.addStatus);
  print("OK", "WebSocket connected");

  client.send({
    type: "hello",
    clientName: "Mac audio observer",
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

  client.send(makeSessionOffer());
  const answer = await client.waitFor("session_answer", args.timeoutMs);
  if (!answer.ok) {
    throw new Error(`session failed: ${answer.reason || answer.message || "unknown"}`);
  }
  print("OK", `Session: audioCodec=${answer.audioCodec || "unknown"} / audioMode=${answer.audioMode || "unknown"}`);

  await withTimeout(
    new Promise((resolve) => {
      const poll = setInterval(() => {
        if (audio.stats.frames > 0) {
          clearInterval(poll);
          resolve();
        }
      }, 25);
    }),
    args.timeoutMs,
    "First audio_frame",
  );

  await delay(args.durationMs);
  socket.close();

  assertStats(audio.stats, args);
  print("OK", `Audio observation passed: ${summarizeStats(audio.stats, args)}`);
  if (audio.stats.statuses.length > 0) {
    print("INFO", `audio_status messages: ${audio.stats.statuses.length}`);
  }
}

main().catch((error) => {
  print("ERROR", error.message);
  process.exitCode = 1;
});
