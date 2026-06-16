import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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
  durationMs: 5000,
  timeoutMs: 15000,
  progressIntervalMs: 10000,
  minFrames: 50,
  minFps: 15,
  maxGapMs: 1000,
  maxFrameAgeMs: 0,
  requireMonotonicTimestamp: false,
  warmupFrames: 5,
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
  playTone: false,
  requireLevel: false,
  resourceSample: true,
  resourceSampleIntervalMs: 1000,
  resourceSampleTree: false,
  resourceSampleTimeoutMs: 3000,
  toneFrequency: 880,
  toneDurationMs: 1500,
  toneDelayMs: 750,
  toneVolume: 0.22,
  minLevel: 0.01,
};

function printUsage() {
  console.log(`Usage:
  node scripts/windows/observe-windows-host-audio.mjs [options]

Options:
  --host <host>                         Windows host address (default: ${defaults.host})
  --port <port>                         Windows host port (default: ${defaults.port})
  --password <password>                 Windows host password (default: ${defaults.password})
  --durationMs <ms>                     Observation duration (default: ${defaults.durationMs})
  --progressIntervalMs <ms>             Print observation progress every N ms; 0 disables. Default: ${defaults.progressIntervalMs}
  --warmupFrames <n>                    Frames ignored before steady-state checks
  --audioMode <wasapi|directshow|mock>  Local temporary host audio mode
  --audioDevice <name>                  Explicit local audio device name
  --sampleRate <hz>                     Requested audio sample rate (default: ${defaults.sampleRate})
  --channels <n>                        Requested channel count (default: ${defaults.channels})
  --frameMs <ms>                        Requested audio frame size (default: ${defaults.frameMs})
  --minFrames <n>                       Minimum received audio frames
  --minFps <n>                          Minimum steady-state audio frame rate
  --maxGapMs <ms>                       Fail if steady inter-frame receive gap is higher
  --maxFrameAgeMs <ms>                  Fail if audio_frame.timestamp receive age is higher
  --requireMonotonicTimestamp           Fail if audio_frame.timestamp goes backwards
  --playTone                            Play a local test tone during observation
  --requireLevel                        Fail if steady audio level stays below --minLevel
  --minLevel <n>                        Minimum steady audio level when --requireLevel is set
  --toneFrequency <hz>                  Test tone frequency (default: ${defaults.toneFrequency})
  --toneDurationMs <ms>                 Test tone duration (default: ${defaults.toneDurationMs})
  --toneDelayMs <ms>                    Delay before test tone playback (default: ${defaults.toneDelayMs})
  --screenMode <mode>                   Local temporary host screen mode (default: ${defaults.screenMode})
  --ffmpeg <path>                       Explicit FFmpeg path for local temporary host
  --useExisting                         Connect to an already running Windows host
  --resourceSample false                Disable local Windows host CPU/memory sampling
  --resourceSampleIntervalMs <ms>       Resource sample interval (default: ${defaults.resourceSampleIntervalMs})
  --resourceSampleTree true             Include child processes such as FFmpeg/PowerShell
  --json                                Print JSON result only
  --verbose                             Print temporary Windows host logs
  --help, -h                            Show this help without starting a host

Examples:
  node scripts/windows/observe-windows-host-audio.mjs --durationMs 2500 --maxFrameAgeMs 1000 --requireMonotonicTimestamp
  node scripts/windows/observe-windows-host-audio.mjs --durationMs 4500 --playTone --requireLevel --minLevel 0.02
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
  args.durationMs = Number(args.durationMs) || defaults.durationMs;
  args.timeoutMs = Number(args.timeoutMs) || defaults.timeoutMs;
  const progressIntervalMs = Number(args.progressIntervalMs);
  args.progressIntervalMs = Number.isFinite(progressIntervalMs)
    ? Math.max(0, progressIntervalMs)
    : defaults.progressIntervalMs;
  args.minFrames = Number(args.minFrames) || defaults.minFrames;
  args.minFps = Number(args.minFps) || defaults.minFps;
  args.maxGapMs = Number(args.maxGapMs) || defaults.maxGapMs;
  args.maxFrameAgeMs = Math.max(0, Number(args.maxFrameAgeMs) || 0);
  args.warmupFrames = Math.max(0, Number(args.warmupFrames) || defaults.warmupFrames);
  args.sampleRate = Number(args.sampleRate) || defaults.sampleRate;
  args.channels = Number(args.channels) || defaults.channels;
  args.frameMs = Number(args.frameMs) || defaults.frameMs;
  args.toneFrequency = Number(args.toneFrequency) || defaults.toneFrequency;
  args.toneDurationMs = Number(args.toneDurationMs) || defaults.toneDurationMs;
  args.toneDelayMs = Number(args.toneDelayMs) || defaults.toneDelayMs;
  args.toneVolume = Math.max(0, Math.min(1, Number(args.toneVolume) || defaults.toneVolume));
  args.minLevel = Number(args.minLevel) || defaults.minLevel;
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
  args.playTone = booleanArg(args.playTone);
  args.requireLevel = booleanArg(args.requireLevel);
  args.requireMonotonicTimestamp = booleanArg(args.requireMonotonicTimestamp);
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

function makeToneWav({
  frequency = 880,
  durationMs = 1500,
  sampleRate = 48000,
  channels = 2,
  volume = 0.22,
} = {}) {
  const safeSampleRate = Math.max(8000, Math.min(192000, Math.round(Number(sampleRate) || 48000)));
  const safeChannels = Math.max(1, Math.min(2, Math.round(Number(channels) || 2)));
  const samples = Math.max(1, Math.round((safeSampleRate * Math.max(50, Number(durationMs) || 1500)) / 1000));
  const dataBytes = samples * safeChannels * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  const amplitude = Math.max(0, Math.min(1, Number(volume) || 0.22)) * 32767;

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

function powershellString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function startTonePlayback(args) {
  if (!args.playTone) {
    return Promise.resolve();
  }
  if (process.platform !== "win32") {
    throw new Error("--playTone requires Windows default audio output");
  }

  return (async () => {
    const tonePath = join(tmpdir(), `lan-dual-wasapi-tone-${Date.now()}-${randomUUID()}.wav`);
    await delay(args.toneDelayMs);
    await writeFile(tonePath, makeToneWav({
      frequency: args.toneFrequency,
      durationMs: args.toneDurationMs,
      sampleRate: args.sampleRate,
      channels: Math.min(2, args.channels),
      volume: args.toneVolume,
    }));

    const command = [
      "Add-Type -AssemblyName System",
      `$player = New-Object System.Media.SoundPlayer ${powershellString(tonePath)}`,
      "$player.PlaySync()",
    ].join("; ");

    try {
      await new Promise((resolveTone, rejectTone) => {
        let stderr = "";
        const child = spawn("powershell.exe", [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          command,
        ], {
          windowsHide: true,
          stdio: ["ignore", "ignore", "pipe"],
        });
        child.stderr.on("data", (chunk) => {
          stderr += String(chunk);
        });
        child.once("error", rejectTone);
        child.once("close", (code) => {
          if (code === 0) {
            resolveTone();
            return;
          }
          rejectTone(new Error(`test tone playback exited ${code}${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
        });
      });
    } finally {
      await rm(tonePath, { force: true });
    }
  })();
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

function parseFrameTimestampMs(frame) {
  const parsed = Date.parse(String(frame.timestamp || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function observeAudioFrames(client, args, onFirstFrame = () => {}) {
  const frames = [];
  const startedAt = performance.now();
  const deadline = startedAt + args.durationMs;
  let lastAt = startedAt;
  let nextProgressAt = args.progressIntervalMs > 0 ? startedAt + args.progressIntervalMs : 0;

  print(
    "INFO",
    `Audio observation started: target=${formatSeconds(args.durationMs)}, progressEvery=${progressEveryText(args)}, maxGap=${args.maxGapMs}ms.`,
    args,
  );

  while (performance.now() < deadline) {
    const waitMs = Math.min(args.timeoutMs, Math.max(1, deadline - performance.now()));
    let frame;
    try {
      frame = await client.waitForMessage("audio_frame", waitMs);
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
    if (args.requirePcm) {
      assertPcmAudioFrame(frame);
    }
    if (frames.length === 0) {
      onFirstFrame();
    }
    const timestampMs = parseFrameTimestampMs(frame);
    frames.push({
      atMs: now,
      relativeMs: now - startedAt,
      gapMs: gap,
      timestampMs,
      frameAgeMs: timestampMs > 0 ? Math.max(0, receivedAtMs - timestampMs) : null,
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

    if (nextProgressAt > 0 && now >= nextProgressAt && now < deadline) {
      printAudioProgress(frames, startedAt, deadline, args);
      do {
        nextProgressAt += args.progressIntervalMs;
      } while (nextProgressAt <= now);
    }
  }

  const warmupCount = Math.min(args.warmupFrames, Math.max(0, frames.length - 2));
  const steadyFrames = frames.slice(warmupCount);
  const overall = summarizeFrames(frames, startedAt);
  const steady = summarizeFrames(steadyFrames, startedAt);

  return {
    ...overall,
    frameCount: frames.length,
    firstFrameDelayMs: Math.round(frames[0]?.relativeMs || 0),
    warmupFrames: warmupCount,
    steady,
  };
}

function printAudioProgress(frames, startedAt, deadline, args) {
  const now = performance.now();
  const elapsedMs = Math.max(1, now - startedAt);
  const remainingMs = Math.max(0, deadline - now);
  const fps = frames.length > 1 ? ((frames.length - 1) * 1000) / elapsedMs : 0;
  const gaps = frames.slice(1).map((frame) => frame.gapMs).filter((gap) => Number.isFinite(gap));
  const frameAges = frames
    .map((frame) => frame.frameAgeMs)
    .filter((age) => Number.isFinite(age));
  const latest = frames.at(-1) || {};
  const gapText = gaps.length ? ` / maxGap=${Math.round(Math.max(...gaps))}ms` : "";
  const ageText = frameAges.length ? ` / ageMax=${Math.round(Math.max(...frameAges))}ms` : "";
  const levelText = Number.isFinite(Number(latest.level)) ? ` / level=${Number(latest.level).toFixed(3)}` : "";
  print(
    "INFO",
    `Audio progress: ${formatSeconds(elapsedMs)} elapsed / ${formatSeconds(remainingMs)} left / frames=${frames.length} / fps=${fps.toFixed(2)}${gapText}${ageText}${levelText} / codec=${latest.codec || "unknown"} / mode=${latest.audioMode || "unknown"}`,
    args,
  );
}

function summarizeFrames(frames, startedAt) {
  const first = frames[0];
  const last = frames.at(-1);
  const elapsedMs = first && last
    ? Math.max(1, last.atMs - (first === last ? startedAt : first.atMs))
    : 0;
  const intervalCount = Math.max(0, frames.length - 1);
  const fps = intervalCount > 0 ? (intervalCount * 1000) / elapsedMs : 0;
  const gaps = frames.slice(1).map((frame) => frame.gapMs);
  const levels = frames.map((frame) => frame.level);
  const payloads = frames.map((frame) => frame.payloadBytes);
  const frameAges = frames.map((frame) => frame.frameAgeMs).filter((value) => Number.isFinite(value));
  let timestampMonotonicViolations = 0;
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1].timestampMs;
    const current = frames[index].timestampMs;
    if (previous > 0 && current > 0 && current < previous) {
      timestampMonotonicViolations += 1;
    }
  }
  const avgLevel = levels.length ? levels.reduce((sum, value) => sum + value, 0) / levels.length : 0;
  const avgPayloadBytes = payloads.length ? payloads.reduce((sum, value) => sum + value, 0) / payloads.length : 0;
  const avgFrameAgeMs = frameAges.length
    ? frameAges.reduce((sum, value) => sum + value, 0) / frameAges.length
    : 0;

  return {
    frameCount: frames.length,
    elapsedMs: Math.round(elapsedMs),
    fps: Number(fps.toFixed(2)),
    maxGapMs: gaps.length ? Math.round(Math.max(...gaps)) : 0,
    firstFrameId: first?.frameId || 0,
    lastFrameId: last?.frameId || 0,
    avgPayloadBytes: Math.round(avgPayloadBytes),
    minPayloadBytes: payloads.length ? Math.min(...payloads) : 0,
    maxPayloadBytes: payloads.length ? Math.max(...payloads) : 0,
    timestampFrameCount: frameAges.length,
    minFrameAgeMs: frameAges.length ? Math.round(Math.min(...frameAges)) : null,
    avgFrameAgeMs: frameAges.length ? Math.round(avgFrameAgeMs) : null,
    maxFrameAgeMs: frameAges.length ? Math.round(Math.max(...frameAges)) : null,
    timestampMonotonic: timestampMonotonicViolations === 0,
    timestampMonotonicViolations,
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
  if (summary.steady.fps < args.minFps) {
    problems.push(`steadyFps ${summary.steady.fps} < ${args.minFps}`);
  }
  if (summary.steady.maxGapMs > args.maxGapMs) {
    problems.push(`steadyMaxGapMs ${summary.steady.maxGapMs} > ${args.maxGapMs}`);
  }
  if (args.requireLevel && summary.steady.maxLevel < args.minLevel) {
    problems.push(`steadyMaxLevel ${summary.steady.maxLevel} < ${args.minLevel}`);
  }
  if (args.maxFrameAgeMs > 0) {
    if (!summary.steady.timestampFrameCount) {
      problems.push("no steady audio_frame.timestamp values were observed");
    } else if (summary.steady.maxFrameAgeMs > args.maxFrameAgeMs) {
      problems.push(`steadyMaxFrameAgeMs ${summary.steady.maxFrameAgeMs} > ${args.maxFrameAgeMs}`);
    }
  }
  if (args.requireMonotonicTimestamp) {
    if (!summary.timestampFrameCount) {
      problems.push("no audio_frame.timestamp values were observed");
    } else if (!summary.timestampMonotonic) {
      problems.push(`timestamp monotonic violations ${summary.timestampMonotonicViolations}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`audio observation failed: ${problems.join("; ")}`);
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
    const audio = discovery.capabilities?.audio || {};
    print("OK", `Discovery: ${discovery.deviceName || discovery.hostName || "Windows host"} / ${audio.mode || "unknown"} / ${audio.backend || "unknown"}`, args);
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

    const tonePlayback = startTonePlayback(args);
    if (args.playTone) {
      print("INFO", `Playing test tone ${args.toneFrequency} Hz for ${args.toneDurationMs} ms after ${args.toneDelayMs} ms`, args);
    }
    const summary = await observeAudioFrames(client, args, startResourceSamplingOnce);
    await tonePlayback;
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
        audioMode: args.audioMode,
        durationMs: args.durationMs,
        progressIntervalMs: args.progressIntervalMs,
        warmupFrames: args.warmupFrames,
        sampleRate: args.sampleRate,
        channels: args.channels,
        frameMs: args.frameMs,
        playTone: args.playTone,
        requireLevel: args.requireLevel,
        minLevel: args.minLevel,
        maxFrameAgeMs: args.maxFrameAgeMs,
        requireMonotonicTimestamp: args.requireMonotonicTimestamp,
        toneFrequency: args.toneFrequency,
        toneDurationMs: args.toneDurationMs,
        toneDelayMs: args.toneDelayMs,
        resourceSample: args.resourceSample,
        resourceSampleIntervalMs: args.resourceSampleIntervalMs,
        resourceSampleTree: args.resourceSampleTree,
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
      resource,
    };

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      print("OK", `Observed ${summary.frameCount} audio frames in ${summary.elapsedMs} ms`, args);
      print("OK", `Steady FPS: ${summary.steady.fps} / max gap: ${summary.steady.maxGapMs} ms / warmup frames: ${summary.warmupFrames}`, args);
      print("INFO", `First frame delay: ${summary.firstFrameDelayMs} ms / overall FPS: ${summary.fps}`, args);
      print("INFO", `Payload bytes avg/min/max: ${summary.steady.avgPayloadBytes}/${summary.steady.minPayloadBytes}/${summary.steady.maxPayloadBytes}`, args);
      print("INFO", `Level min/avg/max: ${summary.steady.minLevel}/${summary.steady.avgLevel}/${summary.steady.maxLevel}`, args);
      if (summary.steady.timestampFrameCount > 0) {
        print(
          "INFO",
          `Frame age steady min/avg/max: ${summary.steady.minFrameAgeMs}/${summary.steady.avgFrameAgeMs}/${summary.steady.maxFrameAgeMs} ms / monotonic=${summary.timestampMonotonic}`,
          args,
        );
      } else {
        print("WARN", "No audio_frame.timestamp values observed", args);
      }
      print("INFO", `Codec: ${summary.codecs.join(", ") || "unknown"} / sampleRates: ${summary.sampleRates.join(", ") || "unknown"} / channels: ${summary.channels.join(", ") || "unknown"}`, args);
      if (resource.available) {
        print(
          "INFO",
          `Resource: CPU avg/max ${resource.avgCpuPercent}/${resource.maxCpuPercent}% / working set avg/peak ${resource.avgWorkingSetMiB}/${resource.peakWorkingSetMiB} MiB / samples ${resource.sampleCount}`,
          args,
        );
      } else {
        print("WARN", `Resource sampling unavailable: ${(resource.errors || []).join("; ") || "unknown"}`, args);
      }
      print("OK", "Windows host audio observation passed", args);
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
