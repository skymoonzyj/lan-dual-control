#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  requireFrameTimestamp: false,
  maxFrameAgeMs: 0,
  requireMonotonicTimestamp: false,
  requireLevel: false,
  minLevel: 0.01,
  playTone: false,
  toneFrequency: 880,
  toneDurationMs: 1500,
  toneDelayMs: 750,
  toneVolume: 0.22,
  json: false,
};

const runState = {
  args: null,
  target: null,
  discovery: null,
  hello: null,
  auth: null,
  session: null,
  observation: null,
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
  args.requireFrameTimestamp = booleanArg(args.requireFrameTimestamp, defaults.requireFrameTimestamp);
  args.maxFrameAgeMs = nonNegativeInteger(args.maxFrameAgeMs, defaults.maxFrameAgeMs);
  args.requireMonotonicTimestamp = booleanArg(args.requireMonotonicTimestamp, defaults.requireMonotonicTimestamp);
  args.requireLevel = booleanArg(args.requireLevel, defaults.requireLevel);
  args.minLevel = nonNegativeNumber(args.minLevel, defaults.minLevel);
  args.playTone = booleanArg(args.playTone, defaults.playTone);
  args.toneFrequency = positiveInteger(args.toneFrequency, defaults.toneFrequency);
  args.toneDurationMs = positiveInteger(args.toneDurationMs, defaults.toneDurationMs);
  args.toneDelayMs = nonNegativeInteger(args.toneDelayMs, defaults.toneDelayMs);
  args.toneVolume = clamp(nonNegativeNumber(args.toneVolume, defaults.toneVolume), 0, 1);
  args.json = booleanArg(args.json, defaults.json);
  if (args.maxFrameAgeMs > 0) {
    args.requireFrameTimestamp = true;
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function booleanArg(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function print(status, text) {
  const line = `[${status}] ${text}`;
  if (runState.args?.json) {
    console.error(line);
    return;
  }
  console.log(line);
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
    runState.discovery = summarizeDiscovery(payload);
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
    timestampFrames: 0,
    missingTimestampFrames: 0,
    frameAgeMinMs: Number.POSITIVE_INFINITY,
    frameAgeMaxMs: Number.NEGATIVE_INFINITY,
    frameAgeTotalMs: 0,
    lastTimestampMs: null,
    timestampRegressions: 0,
    invalidFrames: [],
    statuses: [],
    codecs: new Map(),
    encodings: new Map(),
    sampleRates: new Map(),
    channels: new Map(),
    frameSizes: new Map(),
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
    countValue(stats.codecs, frame.codec || "unknown");
    countValue(stats.encodings, frame.encoding || "");
    countValue(stats.sampleRates, frame.sampleRate || "");
    countValue(stats.channels, frame.channels || "");
    countValue(stats.frameSizes, frame.frames || "");

    const problems = [
      ...validateAudioFrame(frame, args),
      ...trackFrameTiming(stats, frame, now, args),
    ];
    if (problems.length > 0 && stats.invalidFrames.length < 5) {
      stats.invalidFrames.push(`frame ${frame.frameId ?? "?"}: ${problems.join("; ")}`);
    }
  }

  function addStatus(status) {
    stats.statuses.push(status);
  }

  return { stats, addFrame, addStatus };
}

function trackFrameTiming(stats, frame, now, args) {
  const problems = [];
  const timestampMs = Date.parse(String(frame.timestamp || ""));
  if (Number.isFinite(timestampMs)) {
    const ageMs = now - timestampMs;
    stats.timestampFrames += 1;
    stats.frameAgeMinMs = Math.min(stats.frameAgeMinMs, ageMs);
    stats.frameAgeMaxMs = Math.max(stats.frameAgeMaxMs, ageMs);
    stats.frameAgeTotalMs += ageMs;
    if (args.maxFrameAgeMs > 0 && ageMs > args.maxFrameAgeMs) {
      problems.push(`frame age ${Math.round(ageMs)} ms exceeds ${args.maxFrameAgeMs} ms`);
    }
    if (stats.lastTimestampMs !== null && timestampMs < stats.lastTimestampMs) {
      stats.timestampRegressions += 1;
      if (args.requireMonotonicTimestamp) {
        problems.push(`timestamp regressed by ${Math.round(stats.lastTimestampMs - timestampMs)} ms`);
      }
    }
    stats.lastTimestampMs = timestampMs;
  } else {
    stats.missingTimestampFrames += 1;
    if (args.requireFrameTimestamp) {
      problems.push("timestamp missing");
    }
  }
  return problems;
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
    ...summarizeFrameTiming(stats),
    `frameId ${stats.firstFrameId ?? "?"}->${stats.lastFrameId ?? "?"}`,
  ].join(" / ");
}

function finiteLevel(value) {
  return Number.isFinite(value) ? value : 0;
}

function summarizeFrameTiming(stats) {
  const parts = [];
  if (stats.timestampFrames > 0) {
    const avgAgeMs = stats.frameAgeTotalMs / stats.timestampFrames;
    parts.push(
      `frameAge min/avg/max=${Math.round(stats.frameAgeMinMs)}/${avgAgeMs.toFixed(1)}/${Math.round(stats.frameAgeMaxMs)} ms`,
    );
  }
  if (stats.missingTimestampFrames > 0) {
    parts.push(`timestamp missing=${stats.missingTimestampFrames}`);
  }
  if (stats.timestampRegressions > 0) {
    parts.push(`timestamp regressions=${stats.timestampRegressions}`);
  }
  return parts;
}

function countValue(map, value) {
  const key = String(value || "missing");
  map.set(key, (map.get(key) || 0) + 1);
}

function countsToObject(map) {
  return Object.fromEntries([...map.entries()].filter(([key]) => key && key !== "missing"));
}

function summarizeNumberList(values) {
  if (!values.length) {
    return { min: 0, avg: 0, max: 0 };
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    min: Math.min(...values),
    avg: total / values.length,
    max: Math.max(...values),
  };
}

function actualFps(stats, args) {
  const elapsedMs = stats.firstReceivedAt && stats.lastReceivedAt
    ? Math.max(1, stats.lastReceivedAt - stats.firstReceivedAt)
    : args.durationMs;
  return stats.frames > 1 ? ((stats.frames - 1) * 1000) / elapsedMs : 0;
}

function makeObservation(stats, args) {
  const elapsedMs = stats.firstReceivedAt && stats.lastReceivedAt
    ? Math.max(1, stats.lastReceivedAt - stats.firstReceivedAt)
    : args.durationMs;
  const gaps = summarizeNumberList(stats.gaps);
  const avgLevel = stats.frames > 0 ? stats.levelTotal / stats.frames : 0;

  return {
    frameCount: stats.frames,
    firstFrameId: stats.firstFrameId,
    lastFrameId: stats.lastFrameId,
    elapsedMs,
    fps: Number(actualFps(stats, args).toFixed(2)),
    gapAvgMs: Number(gaps.avg.toFixed(2)),
    maxGapMs: Math.round(gaps.max),
    payloadBytes: {
      total: stats.payloadBytes,
      min: stats.minPayloadBytes === Number.POSITIVE_INFINITY ? 0 : stats.minPayloadBytes,
      max: stats.maxPayloadBytes,
      avg: stats.frames > 0 ? Math.round(stats.payloadBytes / stats.frames) : 0,
    },
    level: {
      min: Number(finiteLevel(stats.minLevel).toFixed(4)),
      avg: Number(avgLevel.toFixed(4)),
      max: Number(finiteLevel(stats.maxLevel).toFixed(4)),
    },
    codecs: countsToObject(stats.codecs),
    encodings: countsToObject(stats.encodings),
    sampleRates: countsToObject(stats.sampleRates),
    channels: countsToObject(stats.channels),
    frameSizes: countsToObject(stats.frameSizes),
    timestamp: {
      frames: stats.timestampFrames,
      missingFrames: stats.missingTimestampFrames,
      ageMinMs: stats.timestampFrames > 0 ? Math.round(stats.frameAgeMinMs) : null,
      ageAvgMs: stats.timestampFrames > 0 ? Number((stats.frameAgeTotalMs / stats.timestampFrames).toFixed(2)) : null,
      ageMaxMs: stats.timestampFrames > 0 ? Math.round(stats.frameAgeMaxMs) : null,
      regressions: stats.timestampRegressions,
    },
    audioStatusCount: stats.statuses.length,
    lastAudioStatus: summarizeAudioStatus(stats.statuses.at(-1)),
    invalidFrames: stats.invalidFrames,
  };
}

function summarizeDiscovery(payload) {
  if (!payload || typeof payload !== "object") return null;
  const capabilities = payload.capabilities && typeof payload.capabilities === "object"
    ? payload.capabilities
    : {};
  return {
    deviceName: String(payload.deviceName || payload.hostName || "unknown"),
    platform: String(payload.platform || "unknown"),
    runtime: payload.runtime || null,
    audio: {
      available: capabilities.audio === true || capabilities.audio?.available === true,
      mode: String(capabilities.audioMode || capabilities.audio?.mode || ""),
      codec: String(capabilities.audioCodec || capabilities.audio?.codec || ""),
    },
  };
}

function summarizeHello(message) {
  if (!message || typeof message !== "object") return null;
  return {
    deviceName: String(message.deviceName || message.hostName || "unknown"),
    platform: String(message.hostPlatform || message.platform || ""),
    runtime: message.runtime || null,
  };
}

function summarizeAuth(message) {
  if (!message || typeof message !== "object") return null;
  return {
    ok: message.ok === true,
    reason: String(message.reason || message.message || ""),
    code: String(message.code || ""),
    attemptsRemaining: Number.isFinite(Number(message.attemptsRemaining)) ? Number(message.attemptsRemaining) : null,
    maxAttempts: Number.isFinite(Number(message.maxAttempts)) ? Number(message.maxAttempts) : null,
  };
}

function summarizeSession(answer) {
  if (!answer || typeof answer !== "object") return null;
  return {
    ok: answer.ok !== false,
    audioEnabled: answer.audioEnabled === true,
    audioCodec: String(answer.audioCodec || ""),
    audioMode: String(answer.audioMode || ""),
    reason: String(answer.reason || answer.message || ""),
    code: String(answer.code || ""),
  };
}

function summarizeAudioStatus(status) {
  if (!status || typeof status !== "object") return null;
  return {
    audioMode: String(status.audioMode || ""),
    audioCodec: String(status.audioCodec || ""),
    status: String(status.status || status.state || ""),
    message: String(status.message || status.reason || ""),
    code: String(status.code || ""),
  };
}

function summarizeArgs(args) {
  return {
    host: args.host,
    port: String(args.port),
    durationMs: args.durationMs,
    timeoutMs: args.timeoutMs,
    minFrames: args.minFrames,
    maxGapMs: args.maxGapMs,
    expectedCodec: args.expectedCodec,
    expectedEncoding: args.expectedEncoding,
    expectedSampleRate: args.expectedSampleRate,
    expectedChannels: args.expectedChannels,
    requireFrameTimestamp: args.requireFrameTimestamp,
    maxFrameAgeMs: args.maxFrameAgeMs,
    requireMonotonicTimestamp: args.requireMonotonicTimestamp,
    requireLevel: args.requireLevel,
    minLevel: args.minLevel,
    playTone: args.playTone,
    toneFrequency: args.toneFrequency,
    toneDurationMs: args.toneDurationMs,
    toneDelayMs: args.toneDelayMs,
    toneVolume: args.toneVolume,
    json: args.json,
  };
}

function makeJsonPayload(ok, error = null) {
  return {
    ok,
    target: runState.target,
    args: runState.args ? summarizeArgs(runState.args) : null,
    discovery: runState.discovery,
    hello: runState.hello,
    auth: runState.auth,
    session: runState.session,
    observation: runState.observation,
    error: error
      ? {
          message: error.message,
          name: error.name,
        }
      : null,
  };
}

function printJsonPayload(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function makeToneWav({
  frequency,
  durationMs,
  sampleRate,
  channels,
  volume,
}) {
  const safeSampleRate = Math.max(8000, Math.min(192000, Math.round(sampleRate)));
  const safeChannels = Math.max(1, Math.min(2, Math.round(channels)));
  const samples = Math.max(1, Math.round((safeSampleRate * durationMs) / 1000));
  const dataBytes = samples * safeChannels * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  const amplitude = clamp(volume, 0, 1) * 32767;

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(safeChannels, 22);
  buffer.writeUInt32LE(safeSampleRate, 24);
  buffer.writeUInt32LE(safeSampleRate * safeChannels * 2, 28);
  buffer.writeUInt16LE(safeChannels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);

  for (let sample = 0; sample < samples; sample += 1) {
    const t = sample / safeSampleRate;
    const fadeIn = Math.min(1, sample / Math.max(1, safeSampleRate * 0.02));
    const fadeOut = Math.min(1, (samples - sample) / Math.max(1, safeSampleRate * 0.04));
    const value = Math.round(Math.sin(2 * Math.PI * frequency * t) * amplitude * fadeIn * fadeOut);
    for (let channel = 0; channel < safeChannels; channel += 1) {
      buffer.writeInt16LE(value, 44 + (sample * safeChannels + channel) * 2);
    }
  }

  return buffer;
}

async function startTonePlayback(args) {
  if (!args.playTone) {
    return { stop: async () => {} };
  }
  if (process.platform !== "darwin") {
    throw new Error("--playTone is only supported on macOS via afplay");
  }

  const tonePath = join(tmpdir(), `lan-dual-mac-audio-tone-${randomUUID()}.wav`);
  await writeFile(tonePath, makeToneWav({
    frequency: args.toneFrequency,
    durationMs: args.toneDurationMs,
    sampleRate: args.expectedSampleRate,
    channels: args.expectedChannels,
    volume: args.toneVolume,
  }));

  let player = null;
  const timer = setTimeout(() => {
    player = spawn("afplay", [tonePath], { stdio: "ignore" });
    player.on("error", () => {});
  }, args.toneDelayMs);

  print("INFO", `Scheduled local test tone: ${args.toneFrequency} Hz / ${args.toneDurationMs} ms / volume=${args.toneVolume}`);
  return {
    stop: async () => {
      clearTimeout(timer);
      if (player && !player.killed) {
        player.kill("SIGTERM");
      }
      await rm(tonePath, { force: true });
    },
  };
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
  if (args.requireLevel && finiteLevel(stats.maxLevel) < args.minLevel) {
    problems.push(`max audio level ${finiteLevel(stats.maxLevel).toFixed(3)} below ${args.minLevel}`);
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
  --requireFrameTimestamp       Require every audio_frame timestamp to parse as ISO time.
  --maxFrameAgeMs <ms>          Maximum receive-time age from audio_frame.timestamp. Default: off
  --requireMonotonicTimestamp   Require audio_frame.timestamp to never move backwards.
  --requireLevel                Require observed max audio level to reach --minLevel.
  --minLevel <level>            Minimum max level for --requireLevel. Default: 0.01
  --playTone                    Play a short local test tone through macOS afplay. Default: off
  --toneFrequency <hz>          Test tone frequency. Default: 880
  --toneDurationMs <ms>         Test tone duration. Default: 1500
  --toneDelayMs <ms>            Delay after first audio frame before tone starts. Default: 750
  --toneVolume <0..1>           Test tone volume. Default: 0.22
  --json                        Print one machine-readable JSON object to stdout.

Example:
  node scripts/mac/observe-mac-audio.mjs --durationMs 10000 --minFrames 80 --maxGapMs 1000
  node scripts/mac/observe-mac-audio.mjs --durationMs 4500 --minFrames 160 --playTone --requireLevel --minLevel 0.01`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  runState.args = args;
  runState.target = { host: args.host, port: String(args.port) };
  print("INFO", `Target: ${args.host}:${args.port}`);
  print(
    "INFO",
    `Observe audio for ${args.durationMs} ms, minFrames=${args.minFrames}, maxGapMs=${args.maxGapMs}, requireLevel=${args.requireLevel ? args.minLevel : "off"}`,
  );
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
  runState.hello = summarizeHello(hello);
  print("OK", `hello_ack: ${hello.deviceName || hello.hostName || "unknown"}`);

  client.send({
    type: "auth_request",
    method: "password",
    password: args.password,
  });
  const auth = await client.waitFor("auth_result", args.timeoutMs);
  runState.auth = summarizeAuth(auth);
  if (!auth.ok) {
    throw new Error(`auth failed: ${auth.reason || auth.message || auth.code || "unknown"}`);
  }
  print("OK", "Auth passed");

  client.send(makeSessionOffer());
  const answer = await client.waitFor("session_answer", args.timeoutMs);
  runState.session = summarizeSession(answer);
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

  const tonePlayback = await startTonePlayback(args);
  try {
    await delay(args.durationMs);
  } finally {
    socket.close();
    await tonePlayback.stop();
  }

  runState.observation = makeObservation(audio.stats, args);
  assertStats(audio.stats, args);
  print("OK", `Audio observation passed: ${summarizeStats(audio.stats, args)}`);
  if (audio.stats.statuses.length > 0) {
    print("INFO", `audio_status messages: ${audio.stats.statuses.length}`);
  }
  if (args.json) printJsonPayload(makeJsonPayload(true));
}

main().catch((error) => {
  print("ERROR", error.message);
  if (runState.args?.json) {
    printJsonPayload(makeJsonPayload(false, error));
  }
  process.exitCode = 1;
});
