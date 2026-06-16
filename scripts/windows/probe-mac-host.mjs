import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  host: "127.0.0.1",
  port: "43770",
  hostProvided: false,
  discover: false,
  discoverNoLocalSubnets: false,
  discoverTimeoutMs: 1200,
  password: process.env.LAN_DUAL_PASSWORD || "demo-password",
  passwordProvided: false,
  promptPassword: false,
  requirePassword: false,
  timeoutMs: 8000,
  width: 1920,
  height: 1080,
  fps: 60,
  bandwidthKbps: 50000,
  durationMs: 0,
  observeVideoMs: 0,
  observeAudioMs: 0,
  minVideoFrames: 0,
  minVideoFps: 0,
  maxVideoGapMs: 0,
  minAudioFrames: 0,
  minAudioFps: 0,
  maxAudioGapMs: 0,
  progressIntervalMs: 10000,
  clipboardText: false,
  clipboardHostToClient: false,
  clipboardFile: false,
  clipboardFileHostToClient: false,
  clipboardFileBytes: 96,
  inputEvents: false,
  inputEventSet: "safe",
  requireRealVideo: false,
  requireH264: false,
  requireAudio: false,
  preferredVideoCodec: "mjpeg",
  expectInputMode: "",
  expectInputInjected: "",
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/probe-mac-host.mjs [options]

Probes a running Mac host via /discovery and WebSocket. By default it performs
hello/auth/session negotiation and waits for the first video frame.

Options:
  --host <host>                       Mac host address. Default: ${defaults.host}
  --port <port>                       Mac host port. Default: ${defaults.port}
  --discover                          Find the best Mac host with discover-lan-hosts before probing.
  --discoverNoLocalSubnets            With --discover, only probe 127.0.0.1 and explicit --host targets.
  --discoverTimeoutMs <ms>            Per-host discovery timeout. Default: ${defaults.discoverTimeoutMs}
  --password <password>               Probe password. Default: LAN_DUAL_PASSWORD or demo-password.
  --promptPassword                    Prompt for the probe password without echoing it.
  --requirePassword                   Refuse empty/demo-password credentials before connecting.
  --timeoutMs <ms>                    Per-step timeout. Default: ${defaults.timeoutMs}
  --width <px>                        Requested video width. Default: ${defaults.width}
  --height <px>                       Requested video height. Default: ${defaults.height}
  --fps <fps>                         Requested FPS. Default: ${defaults.fps}
  --bandwidthKbps <kbps>              Requested max bandwidth. Default: ${defaults.bandwidthKbps}
  --durationMs <ms>                   Observe video frames after the first frame. Default: off.
  --observeVideoMs <ms>               Same as --durationMs, explicit video name.
  --observeAudioMs <ms>               Observe audio frames after the first audio frame. Default: off.
  --minVideoFrames <count>            Require at least this many video frames during observation.
  --minVideoFps <fps>                 Require observed video FPS during observation.
  --maxVideoGapMs <ms>                Fail if video frame arrival gap exceeds this value.
  --minAudioFrames <count>            Require at least this many audio frames during observation.
  --minAudioFps <fps>                 Require observed audio FPS during observation.
  --maxAudioGapMs <ms>                Fail if audio frame arrival gap exceeds this value.
  --progressIntervalMs <ms>           Print video/audio observation progress every N ms; 0 disables. Default: ${defaults.progressIntervalMs}
  --preferredVideoCodec <codec>       Requested codec: mjpeg or h264. Default: ${defaults.preferredVideoCodec}
  --requireRealVideo                  Reject mock/svg video frames.
  --requireH264                       Require H.264 Annex B video; implies preferred codec h264.
  --requireAudio                      Require one pcm-f32le audio_frame.
  --expectInputMode <mode>            Require input mode from discovery/hello/session.
  --expectInputInjected <true|false>  Require input_ack injected flag when --inputEvents is enabled.
  --inputEvents                       Send safe input events; requires host input mode expectations separately.
  --inputEventSet <safe|full>         Input event set for --inputEvents. Default: ${defaults.inputEventSet}
  --clipboardText                     Send a text clipboard message to the host.
  --clipboardHostToClient             Read Mac pasteboard changes sent by the host. macOS only.
  --clipboardFile                     Send a small file clipboard transfer to the host.
  --clipboardFileHostToClient         Read Mac file pasteboard changes sent by the host. macOS only.
  --clipboardRoundTrip                Enable both text clipboard directions.
  --clipboardFileRoundTrip            Enable both file clipboard directions.
  --clipboardFileBytes <bytes>        Size of synthetic clipboard file. Default: ${defaults.clipboardFileBytes}

Examples:
  node scripts/windows/probe-mac-host.mjs --discover --promptPassword --requirePassword --requireH264 --expectInputMode log
  node scripts/windows/probe-mac-host.mjs --host 127.0.0.1 --port 43770 --promptPassword --requirePassword --requireH264 --expectInputMode log
  node scripts/windows/probe-mac-host.mjs --host 192.168.1.20 --port 43770 --promptPassword --requirePassword --requireAudio
  node scripts/windows/probe-mac-host.mjs --host 192.168.1.20 --port 43770 --promptPassword --requirePassword --requireH264 --durationMs 300000 --minVideoFps 5 --maxVideoGapMs 3000
  node scripts/windows/probe-mac-host.mjs --clipboardRoundTrip --expectInputMode log
`);
}

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      if (key === "password") {
        args.passwordProvided = true;
      }
      args[key] = true;
      continue;
    }
    if (key === "password") {
      args.passwordProvided = true;
    }
    if (key === "host") {
      args.hostProvided = true;
    }
    args[key] = next;
    index += 1;
  }
  args.port = String(args.port);
  args.discover = booleanArg(args.discover);
  args.discoverNoLocalSubnets = booleanArg(args.discoverNoLocalSubnets);
  args.discoverTimeoutMs = Math.max(250, Number(args.discoverTimeoutMs) || defaults.discoverTimeoutMs);
  args.promptPassword = booleanArg(args.promptPassword);
  args.requirePassword = booleanArg(args.requirePassword);
  args.timeoutMs = Number(args.timeoutMs) || defaults.timeoutMs;
  args.width = Number(args.width) || defaults.width;
  args.height = Number(args.height) || defaults.height;
  args.fps = Number(args.fps) || defaults.fps;
  args.bandwidthKbps = Number(args.bandwidthKbps) || defaults.bandwidthKbps;
  args.durationMs = Math.max(0, Number(args.durationMs) || 0);
  args.observeVideoMs = Math.max(0, Number(args.observeVideoMs) || args.durationMs || 0);
  args.observeAudioMs = Math.max(0, Number(args.observeAudioMs) || 0);
  args.minVideoFrames = Math.max(0, Number(args.minVideoFrames) || 0);
  args.minVideoFps = Math.max(0, Number(args.minVideoFps) || 0);
  args.maxVideoGapMs = Math.max(0, Number(args.maxVideoGapMs) || 0);
  args.minAudioFrames = Math.max(0, Number(args.minAudioFrames) || 0);
  args.minAudioFps = Math.max(0, Number(args.minAudioFps) || 0);
  args.maxAudioGapMs = Math.max(0, Number(args.maxAudioGapMs) || 0);
  const progressIntervalMs = Number(args.progressIntervalMs);
  args.progressIntervalMs = Number.isFinite(progressIntervalMs)
    ? Math.max(0, progressIntervalMs)
    : defaults.progressIntervalMs;
  const clipboardRoundTrip = booleanArg(args.clipboardRoundTrip);
  const clipboardFileRoundTrip = booleanArg(args.clipboardFileRoundTrip);
  args.clipboardText = booleanArg(args.clipboardText) || booleanArg(args.clipboard) || clipboardRoundTrip;
  args.clipboardHostToClient = booleanArg(args.clipboardHostToClient) || clipboardRoundTrip;
  args.clipboardFile = booleanArg(args.clipboardFile) || booleanArg(args.clipboard) || clipboardFileRoundTrip;
  args.clipboardFileHostToClient = booleanArg(args.clipboardFileHostToClient) || clipboardFileRoundTrip;
  args.clipboardFileBytes = Number(args.clipboardFileBytes) || defaults.clipboardFileBytes;
  args.inputEvents = booleanArg(args.inputEvents) || booleanArg(args.input);
  args.inputEventSet = normalizeChoice(args.inputEventSet, ["safe", "full"], defaults.inputEventSet, "--inputEventSet");
  args.requireRealVideo = booleanArg(args.requireRealVideo) || booleanArg(args.realVideo);
  args.requireH264 = booleanArg(args.requireH264) || booleanArg(args.h264);
  args.requireAudio = booleanArg(args.requireAudio) || booleanArg(args.audio);
  args.preferredVideoCodec = String(args.preferredVideoCodec || defaults.preferredVideoCodec).trim().toLowerCase();
  if (args.requireH264) {
    args.preferredVideoCodec = "h264";
  }
  args.expectInputMode = String(args.expectInputMode || "").trim().toLowerCase();
  args.expectInputInjected = parseOptionalBoolean(args.expectInputInjected, "--expectInputInjected");
  return args;
}

function booleanArg(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function parseOptionalBoolean(value, optionName) {
  if (value === undefined || value === null || value === "") return "";
  if (value === true || value === "true" || value === "1" || value === "yes" || value === "on") return true;
  if (value === false || value === "false" || value === "0" || value === "no" || value === "off") return false;
  throw new Error(`${optionName} must be true or false`);
}

function normalizeChoice(value, choices, fallback, optionName) {
  const normalized = String(value || fallback || "").trim().toLowerCase();
  if (choices.includes(normalized)) return normalized;
  throw new Error(`${optionName} must be one of: ${choices.join(", ")}`);
}

function print(status, text) {
  console.log(`[${status}] ${text}`);
}

function fail(text) {
  print("ERROR", text);
  process.exitCode = 1;
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

function makeEnvelope(message) {
  return {
    id: `${message.type}-${randomUUID()}`,
    timestamp: new Date().toISOString(),
    ...message,
  };
}

function makeProbeId(prefix) {
  return `${prefix}-${Date.now().toString(16)}-${randomUUID().slice(0, 8)}`;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runCommand(command, { input = "", args = [] } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat(stdout).toString("utf8");
      const errorOutput = Buffer.concat(stderr).toString("utf8");
      if (code === 0) {
        resolve(output);
        return;
      }
      reject(new Error(`${command} exited ${code}: ${errorOutput.trim()}`));
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

function runCapturedProcess(command, args, options = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const startedAt = performance.now();
    const timer = setTimeout(() => {
      child.kill();
      finish({ exitCode: null, signal: "timeout", timedOut: true, ok: false });
    }, options.timeoutMs ?? 15000);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun({
        ...result,
        stdout,
        stderr: result.stderr ?? stderr,
        durationMs: Math.round(performance.now() - startedAt),
      });
    };
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      finish({
        exitCode: null,
        signal: "error",
        timedOut: false,
        ok: false,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode, signal) => {
      finish({
        exitCode,
        signal,
        timedOut: false,
        ok: exitCode === 0,
      });
    });
  });
}

function tailLines(text, limit = 8) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(-limit).join("\n");
}

function discoveryScannerArgs(args) {
  const scannerArgs = [
    "scripts/windows/discover-lan-hosts.mjs",
    "--json",
    "--requireMacHost",
    "--timeoutMs",
    String(args.discoverTimeoutMs),
    "--port",
    String(args.port),
  ];
  if (args.discoverNoLocalSubnets) {
    scannerArgs.push("--noLocalSubnets");
  }
  if (args.hostProvided) {
    scannerArgs.push("--host", args.host);
  }
  return scannerArgs;
}

async function resolveDiscoveryTarget(args) {
  if (!args.discover) return null;
  const childArgs = discoveryScannerArgs(args);
  const result = await runCapturedProcess(process.execPath, childArgs, {
    cwd: repoRoot,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
    timeoutMs: Math.max(15000, Number(args.discoverTimeoutMs) * 12 + 8000),
  });
  let payload;
  try {
    payload = JSON.parse(String(result.stdout || "").trim());
  } catch (error) {
    throw new Error(
      `Mac host discovery did not print valid JSON: ${error.message}; exit=${result.exitCode ?? "null"}; stdout=${tailLines(result.stdout)}; stderr=${tailLines(result.stderr)}`,
    );
  }
  const best = payload.bestMacHost || null;
  if (!result.ok || !best) {
    const detail = payload.boardSummary || `no Mac host found; exit=${result.exitCode ?? "null"}`;
    throw new Error(`Mac host discovery failed: ${detail}`);
  }
  args.host = String(best.host);
  args.port = String(best.port);
  return {
    target: `${args.host}:${args.port}`,
    foundMacHosts: Array.isArray(payload.macHosts) ? payload.macHosts.length : 1,
    runtimeBuild: best.runtime?.buildId || "",
  };
}

async function readLocalMacClipboardText() {
  if (process.platform !== "darwin") {
    throw new Error("clipboard host_to_client probe must run on macOS so it can update the Mac pasteboard");
  }
  return runCommand("pbpaste");
}

async function writeLocalMacClipboardText(text) {
  if (process.platform !== "darwin") {
    throw new Error("clipboard host_to_client probe must run on macOS so it can update the Mac pasteboard");
  }
  await runCommand("pbcopy", { input: text });
}

function escapeAppleScriptString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function writeLocalMacClipboardFile(filePath) {
  if (process.platform !== "darwin") {
    throw new Error("clipboard file host_to_client probe must run on macOS so it can update the Mac pasteboard");
  }
  await runCommand("osascript", {
    input: `set the clipboard to (POSIX file "${escapeAppleScriptString(filePath)}")\n`,
  });
}

async function fetchDiscovery(args) {
  const url = `http://${args.host}:${args.port}/discovery`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    const name = payload.deviceName || payload.hostName || "unknown";
    const platform = payload.platform || "unknown";
    const capabilities = payload.capabilities ? JSON.stringify(payload.capabilities) : "{}";
    print("OK", `Discovery: ${name} / ${platform} / ${args.host}:${args.port}`);
    print("INFO", `Capabilities: ${capabilities}`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function openWebSocket(args) {
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

function createSocketClient(socket, args) {
  const pending = new Map();
  const queues = new Map();

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
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

    const queue = queues.get(message.type) || [];
    const maxQueued = message.type === "video_frame" || message.type === "audio_frame" ? 10 : 50;
    if (queue.length >= maxQueued) {
      queue.shift();
    }
    queue.push(message);
    queues.set(message.type, queue);
  });

  socket.addEventListener("close", () => {
    for (const waiters of pending.values()) {
      waiters.forEach((waiter) => waiter.reject(new Error("WebSocket closed")));
    }
    pending.clear();
  });

  function waitFor(type, timeoutMs = args.timeoutMs) {
    return withTimeout(
      new Promise((resolve, reject) => {
        const queue = queues.get(type) || [];
        if (queue.length > 0) {
          const message = queue.shift();
          if (queue.length === 0) {
            queues.delete(type);
          }
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

  function send(message) {
    const envelope = makeEnvelope(message);
    socket.send(JSON.stringify(envelope));
    return envelope;
  }

  return { send, waitFor };
}

function makeSessionOffer(args) {
  return {
    type: "session_offer",
    protocolVersion: 1,
    wantVideo: true,
    wantAudio: true,
    wantClipboardText: true,
    wantClipboardFile: true,
    preferredVideoCodec: args.preferredVideoCodec,
    preferredVideoEncoding: "annexb",
    preferredAudioCodec: "opus",
    maxFps: args.fps,
    maxBandwidthKbps: args.bandwidthKbps,
    qualityPreset: "diagnostic",
    displayMode: "window",
    displayId: "main",
    preferredWidth: args.width,
    preferredHeight: args.height,
    audioVolume: 80,
  };
}

function summarizeFrame(frame) {
  const dataUrl = typeof frame.dataUrl === "string" ? frame.dataUrl : "";
  const comma = dataUrl.indexOf(",");
  const payloadLength = comma >= 0 ? dataUrl.length - comma - 1 : dataUrl.length;
  const estimatedBytes = Math.round((payloadLength * 3) / 4);
  const encodedPayload = typeof frame.payload === "string" ? frame.payload : "";
  const encodedBytes = Math.round((encodedPayload.length * 3) / 4);
  return [
    `codec=${frame.codec || "unknown"}`,
    frame.encoding ? `encoding=${frame.encoding}` : "",
    `size=${frame.width || "?"}x${frame.height || "?"}`,
    `frameId=${frame.frameId || "?"}`,
    dataUrl ? `dataUrl=${dataUrl.slice(0, 30)}` : "",
    encodedPayload ? `payloadBytes~${encodedBytes}` : "",
    dataUrl ? `bytes~${estimatedBytes}` : "",
  ].filter(Boolean).join(" / ");
}

const h264NalNames = new Map([
  [1, "non-idr"],
  [5, "idr"],
  [6, "sei"],
  [7, "sps"],
  [8, "pps"],
  [9, "aud"],
]);

function findAnnexBStartCode(buffer, offset) {
  for (let index = offset; index <= buffer.length - 3; index += 1) {
    if (buffer[index] !== 0 || buffer[index + 1] !== 0) continue;
    if (buffer[index + 2] === 1) {
      return { index, length: 3 };
    }
    if (index <= buffer.length - 4 && buffer[index + 2] === 0 && buffer[index + 3] === 1) {
      return { index, length: 4 };
    }
  }
  return null;
}

function parseAnnexBNalUnits(buffer) {
  const units = [];
  let startCode = findAnnexBStartCode(buffer, 0);

  while (startCode) {
    const nalStart = startCode.index + startCode.length;
    const nextStartCode = findAnnexBStartCode(buffer, nalStart);
    const nalEnd = nextStartCode ? nextStartCode.index : buffer.length;

    if (nalEnd > nalStart) {
      units.push({
        type: buffer[nalStart] & 0x1f,
        size: nalEnd - nalStart,
      });
    }

    startCode = nextStartCode;
  }

  return units;
}

function summarizeNalTypes(units) {
  return units
    .map((unit) => `${unit.type}:${h264NalNames.get(unit.type) || "nal"}`)
    .join(",");
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function preparePassword(args) {
  if (args.promptPassword && args.passwordProvided) {
    throw new Error("--promptPassword cannot be combined with --password.");
  }
  if (args.promptPassword && process.env.LAN_DUAL_PASSWORD) {
    throw new Error("--promptPassword refuses to override an existing LAN_DUAL_PASSWORD. Unset it or omit --promptPassword.");
  }
  if (args.promptPassword) {
    args.password = await promptHidden("Mac host password: ");
    if (!args.password) {
      throw new Error("Password cannot be empty when --promptPassword is used.");
    }
  }
  const effectivePassword = String(args.password || "");
  if (args.requirePassword && !effectivePassword) {
    throw new Error("LAN_DUAL_PASSWORD is required. Set it in the environment, pass --password, or use --promptPassword.");
  }
  if (args.requirePassword && effectivePassword === "demo-password") {
    throw new Error("Refusing to use demo-password when --requirePassword is used.");
  }
}

function promptHidden(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.reject(new Error("--promptPassword requires an interactive terminal."));
  }

  return new Promise((resolvePrompt, rejectPrompt) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    const previousRawMode = stdin.isRaw;
    let value = "";
    let settled = false;

    const cleanup = () => {
      stdin.off("data", onData);
      if (typeof stdin.setRawMode === "function") {
        stdin.setRawMode(Boolean(previousRawMode));
      }
      stdin.pause();
    };
    const finish = (result, error = null) => {
      if (settled) return;
      settled = true;
      cleanup();
      stdout.write("\n");
      if (error) {
        rejectPrompt(error);
      } else {
        resolvePrompt(result);
      }
    };
    const onData = (chunk) => {
      const text = String(chunk);
      for (const char of text) {
        const code = char.charCodeAt(0);
        if (char === "\r" || char === "\n") {
          finish(value);
          return;
        }
        if (code === 3) {
          finish("", new Error("Password prompt cancelled."));
          return;
        }
        if (code === 8 || code === 127) {
          value = value.slice(0, -1);
          continue;
        }
        if (code >= 32) {
          value += char;
        }
      }
    };

    stdout.write(label);
    stdin.resume();
    stdin.setEncoding("utf8");
    if (typeof stdin.setRawMode === "function") {
      stdin.setRawMode(true);
    }
    stdin.on("data", onData);
  });
}

function assertExpectedInputMode({ args, discovery, hello, answer }) {
  if (!args.expectInputMode) return;

  const observedModes = [
    answer?.inputMode,
    hello?.capabilities?.input?.mode,
    discovery?.capabilities?.inputMode,
  ]
    .map((mode) => normalizedText(mode).toLowerCase())
    .filter(Boolean);
  const uniqueModes = [...new Set(observedModes)];

  if (!uniqueModes.includes(args.expectInputMode)) {
    throw new Error(
      `input mode mismatch: expected ${args.expectInputMode}, observed ${uniqueModes.join(", ") || "missing"}`,
    );
  }

  print("OK", `Input mode: ${args.expectInputMode}`);
}

function assertRealVideoFrame(frame, answer, { silent = false } = {}) {
  const codec = normalizedText(frame.codec).toLowerCase();
  const answerCodec = normalizedText(answer?.videoCodec).toLowerCase();
  const dataUrl = normalizedText(frame.dataUrl).toLowerCase();
  const source = normalizedText(frame.source).toLowerCase();
  const framePipeline = normalizedText(frame.capturePipeline).toLowerCase();
  const answerPipeline = normalizedText(answer?.capturePipeline).toLowerCase();
  const pipeline = framePipeline || answerPipeline;
  const hostMode = normalizedText(answer?.hostMode).toLowerCase();
  const problems = [];

  if (codec !== "jpeg") {
    problems.push(`frame codec=${frame.codec || "missing"}`);
  }
  if (answerCodec && answerCodec !== "jpeg") {
    problems.push(`session videoCodec=${answer.videoCodec}`);
  }
  if (!dataUrl.startsWith("data:image/jpeg")) {
    problems.push("dataUrl is not image/jpeg");
  }
  if (source === "mock") {
    problems.push("source=mock");
  }
  if (!pipeline) {
    problems.push("capturePipeline missing");
  } else if (pipeline.includes("mock")) {
    problems.push(`capturePipeline=${pipeline}`);
  }
  if (hostMode.includes("mock")) {
    problems.push(`hostMode=${hostMode}`);
  }

  if (problems.length > 0) {
    throw new Error(`real video required but got ${summarizeFrame(frame)} (${problems.join("; ")})`);
  }

  if (!silent) {
    print("OK", `Real video confirmed: ${codec} / ${pipeline || "pipeline unknown"} / source=${source || "unknown"}`);
  }
}

function assertH264VideoFrame(frame, answer, { silent = false } = {}) {
  const codec = normalizedText(frame.codec).toLowerCase();
  const answerCodec = normalizedText(answer?.videoCodec).toLowerCase();
  const encoding = normalizedText(frame.encoding).toLowerCase();
  const payload = normalizedText(frame.payload);
  const codecString = normalizedText(frame.codecString || answer?.codecString);
  const framePipeline = normalizedText(frame.capturePipeline).toLowerCase();
  const answerPipeline = normalizedText(answer?.capturePipeline).toLowerCase();
  const pipeline = framePipeline || answerPipeline;
  const hostMode = normalizedText(answer?.hostMode).toLowerCase();
  const problems = [];

  if (codec !== "h264") {
    problems.push(`frame codec=${frame.codec || "missing"}`);
  }
  if (answerCodec !== "h264") {
    problems.push(`session videoCodec=${answer?.videoCodec || "missing"}`);
  }
  if (!encoding.includes("annexb")) {
    problems.push(`encoding=${frame.encoding || "missing"}`);
  }
  if (!payload) {
    problems.push("payload missing");
  }
  let nalUnits = [];
  if (payload) {
    const payloadBuffer = Buffer.from(payload, "base64");
    if (payloadBuffer.length === 0) {
      problems.push("payload decoded to 0 bytes");
    } else {
      nalUnits = parseAnnexBNalUnits(payloadBuffer);
      if (nalUnits.length === 0) {
        problems.push("Annex B start codes missing");
      } else {
        const nalTypes = new Set(nalUnits.map((unit) => unit.type));
        const hasVcl = nalTypes.has(1) || nalTypes.has(5);
        const shouldBeKeyFrame = frame.keyFrame !== false;

        if (!hasVcl) {
          problems.push(`video slice NAL missing: ${summarizeNalTypes(nalUnits)}`);
        }
        if (shouldBeKeyFrame && !nalTypes.has(7)) {
          problems.push(`keyframe SPS missing: ${summarizeNalTypes(nalUnits)}`);
        }
        if (shouldBeKeyFrame && !nalTypes.has(8)) {
          problems.push(`keyframe PPS missing: ${summarizeNalTypes(nalUnits)}`);
        }
        if (shouldBeKeyFrame && !nalTypes.has(5)) {
          problems.push(`keyframe IDR missing: ${summarizeNalTypes(nalUnits)}`);
        }
      }
    }
  }
  if (!codecString.toLowerCase().startsWith("avc1.")) {
    problems.push(`codecString=${codecString || "missing"}`);
  }
  if (pipeline !== "screencapturekit-h264") {
    problems.push(`capturePipeline=${pipeline || "missing"}`);
  }
  if (hostMode !== "mac-host-h264-stream") {
    problems.push(`hostMode=${hostMode || "missing"}`);
  }

  if (problems.length > 0) {
    throw new Error(`H.264 required but got ${summarizeFrame(frame)} (${problems.join("; ")})`);
  }

  if (!silent) {
    print("OK", `H.264 video confirmed: ${encoding} / ${pipeline} / codecString=${codecString} / nalTypes=${summarizeNalTypes(nalUnits)}`);
  }
}

function summarizeAudioFrame(frame) {
  const payload = normalizedText(frame.payload);
  const estimatedBytes = payload ? Math.round((payload.length * 3) / 4) : 0;
  return [
    `codec=${frame.codec || "unknown"}`,
    frame.encoding ? `encoding=${frame.encoding}` : "",
    `sampleRate=${frame.sampleRate || "?"}`,
    `channels=${frame.channels || "?"}`,
    frame.frames ? `frames=${frame.frames}` : "",
    frame.layout ? `layout=${frame.layout}` : "",
    frame.audioMode ? `audioMode=${frame.audioMode}` : "",
    payload ? `payloadBytes~${estimatedBytes}` : "",
  ].filter(Boolean).join(" / ");
}

function assertAudioFrame(frame, answer, { silent = false } = {}) {
  const codec = normalizedText(frame.codec).toLowerCase();
  const encoding = normalizedText(frame.encoding).toLowerCase();
  const audioMode = normalizedText(frame.audioMode || answer?.audioMode).toLowerCase();
  const payload = normalizedText(frame.payload);
  const sampleRate = Number(frame.sampleRate);
  const channels = Number(frame.channels);
  const frames = Number(frame.frames);
  const layout = normalizedText(frame.layout).toLowerCase();
  const problems = [];

  if (codec !== "pcm-f32le") {
    problems.push(`codec=${frame.codec || "missing"}`);
  }
  if (encoding !== "pcm-f32le-base64") {
    problems.push(`encoding=${frame.encoding || "missing"}`);
  }
  if (audioMode !== "system-pcm") {
    problems.push(`audioMode=${audioMode || "missing"}`);
  }
  if (sampleRate !== 48000) {
    problems.push(`sampleRate=${frame.sampleRate || "missing"}`);
  }
  if (channels !== 2) {
    problems.push(`channels=${frame.channels || "missing"}`);
  }
  if (!Number.isFinite(frames) || frames <= 0) {
    problems.push(`frames=${frame.frames || "missing"}`);
  }
  if (layout && layout !== "planar" && layout !== "interleaved") {
    problems.push(`layout=${frame.layout}`);
  }
  if (!payload) {
    problems.push("payload missing");
  } else {
    const payloadBuffer = Buffer.from(payload, "base64");
    const expectedBytes = Number(frame.payloadBytes);
    if (payloadBuffer.length === 0) {
      problems.push("payload decoded to 0 bytes");
    }
    if (payloadBuffer.length % 4 !== 0) {
      problems.push(`payloadBytes not Float32 aligned: ${payloadBuffer.length}`);
    }
    if (Number.isFinite(expectedBytes) && expectedBytes > 0 && payloadBuffer.length !== expectedBytes) {
      problems.push(`payloadBytes=${payloadBuffer.length}/${expectedBytes}`);
    }
    if (Number.isFinite(frames) && frames > 0 && channels > 0) {
      const expectedFrameBytes = frames * channels * 4;
      if (payloadBuffer.length !== expectedFrameBytes) {
        problems.push(`frameBytes=${payloadBuffer.length}/${expectedFrameBytes}`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`PCM audio required but got ${summarizeAudioFrame(frame)} (${problems.join("; ")})`);
  }

  if (!silent) {
    print("OK", `Audio frame confirmed: ${summarizeAudioFrame(frame)}`);
  }
}

function estimateFrameBytes(frame) {
  const payload = typeof frame.payload === "string" ? frame.payload.trim() : "";
  if (payload) {
    return Math.round((payload.length * 3) / 4);
  }
  const dataUrl = typeof frame.dataUrl === "string" ? frame.dataUrl : "";
  const comma = dataUrl.indexOf(",");
  const encoded = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return encoded ? Math.round((encoded.length * 3) / 4) : 0;
}

function createMediaStats(kind, maxGapMs) {
  return {
    kind,
    maxGapLimitMs: maxGapMs,
    frames: 0,
    startedAt: performance.now(),
    firstAt: 0,
    lastAt: 0,
    maxGapMs: 0,
    totalBytes: 0,
    codecs: new Map(),
    pipelines: new Map(),
  };
}

function incrementCount(map, value) {
  const key = normalizedText(value) || "unknown";
  map.set(key, (map.get(key) || 0) + 1);
}

function recordMediaFrame(stats, frame, answer) {
  const now = performance.now();
  if (!stats.firstAt) {
    stats.firstAt = now;
  }
  if (stats.lastAt) {
    const gapMs = now - stats.lastAt;
    stats.maxGapMs = Math.max(stats.maxGapMs, gapMs);
    if (stats.maxGapLimitMs > 0 && gapMs > stats.maxGapLimitMs) {
      throw new Error(`${stats.kind} frame gap ${Math.round(gapMs)} ms exceeded ${stats.maxGapLimitMs} ms`);
    }
  }
  stats.lastAt = now;
  stats.frames += 1;
  stats.totalBytes += estimateFrameBytes(frame);
  incrementCount(stats.codecs, frame.codec || answer?.videoCodec || answer?.audioCodec);
  incrementCount(stats.pipelines, frame.capturePipeline || frame.audioMode || answer?.capturePipeline || answer?.audioMode);
}

function summarizeCounts(map) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => `${name}:${count}`)
    .join(", ");
}

function finishMediaStats(stats) {
  const endedAt = performance.now();
  const elapsedMs = Math.max(1, endedAt - stats.startedAt);
  const fps = (stats.frames * 1000) / elapsedMs;
  return {
    ...stats,
    elapsedMs,
    fps,
    averageBytes: stats.frames > 0 ? Math.round(stats.totalBytes / stats.frames) : 0,
  };
}

function formatSeconds(ms) {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

function printObservationStart(label, durationMs, args, maxGapMs) {
  const intervalText = args.progressIntervalMs > 0 ? formatSeconds(args.progressIntervalMs) : "off";
  const gapText = maxGapMs > 0 ? `${maxGapMs}ms` : "off";
  print(
    "INFO",
    `${label} observation started: target=${formatSeconds(durationMs)}, progressEvery=${intervalText}, maxGap=${gapText}.`,
  );
}

function printMediaProgress(label, stats, deadline, now = performance.now()) {
  const elapsedMs = Math.max(1, now - stats.startedAt);
  const totalMs = Math.max(1, deadline - stats.startedAt);
  const remainingMs = Math.max(0, deadline - now);
  const percent = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
  const fps = (stats.frames * 1000) / elapsedMs;
  print(
    "INFO",
    `${label} progress: ${stats.frames} frames / ${formatSeconds(elapsedMs)} elapsed / ${formatSeconds(remainingMs)} left / ${percent.toFixed(0)}% / ${fps.toFixed(2)} FPS / max gap ${Math.round(stats.maxGapMs)} ms.`,
  );
}

function maybePrintMediaProgress(label, stats, deadline, nextProgressAt, intervalMs) {
  if (nextProgressAt <= 0) return nextProgressAt;
  const now = performance.now();
  if (now < nextProgressAt || now >= deadline) return nextProgressAt;
  printMediaProgress(label, stats, deadline, now);
  const next = nextProgressAt + Math.max(1, intervalMs);
  return next <= now ? now + Math.max(1, intervalMs) : next;
}

function assertMediaStats(summary, { minFrames, minFps, label }) {
  const problems = [];
  if (minFrames > 0 && summary.frames < minFrames) {
    problems.push(`frames=${summary.frames}/${minFrames}`);
  }
  if (minFps > 0 && summary.fps < minFps) {
    problems.push(`fps=${summary.fps.toFixed(2)}/${minFps}`);
  }
  if (problems.length > 0) {
    throw new Error(`${label} observation failed: ${problems.join("; ")}`);
  }
}

async function observeVideoFrames(client, args, answer, firstFrame) {
  if (!args.observeVideoMs) return;

  const stats = createMediaStats("video", args.maxVideoGapMs);
  printObservationStart("Video", args.observeVideoMs, args, args.maxVideoGapMs);
  if (args.requireH264) {
    assertH264VideoFrame(firstFrame, answer, { silent: true });
  } else if (args.requireRealVideo) {
    assertRealVideoFrame(firstFrame, answer, { silent: true });
  }
  recordMediaFrame(stats, firstFrame, answer);

  const deadline = performance.now() + args.observeVideoMs;
  let nextProgressAt = args.progressIntervalMs > 0 ? stats.startedAt + args.progressIntervalMs : 0;
  while (performance.now() < deadline) {
    const remainingMs = deadline - performance.now();
    const waitMs = Math.max(1, Math.min(remainingMs, args.maxVideoGapMs || args.timeoutMs));
    try {
      const frame = await client.waitFor("video_frame", waitMs);
      if (args.requireH264) {
        assertH264VideoFrame(frame, answer, { silent: true });
      } else if (args.requireRealVideo) {
        assertRealVideoFrame(frame, answer, { silent: true });
      }
      recordMediaFrame(stats, frame, answer);
      nextProgressAt = maybePrintMediaProgress("Video", stats, deadline, nextProgressAt, args.progressIntervalMs);
    } catch (error) {
      if (performance.now() >= deadline) {
        break;
      }
      if (args.maxVideoGapMs > 0) {
        throw new Error(`video observation timed out before next frame: ${error.message}`);
      }
    }
  }

  const summary = finishMediaStats(stats);
  assertMediaStats(summary, {
    minFrames: args.minVideoFrames,
    minFps: args.minVideoFps,
    label: "video",
  });
  print(
    "OK",
    `Video observed: ${summary.frames} frames / ${(summary.elapsedMs / 1000).toFixed(1)}s / ${summary.fps.toFixed(2)} FPS / max gap ${Math.round(summary.maxGapMs)} ms / avg ${summary.averageBytes} bytes / codecs ${summarizeCounts(summary.codecs)} / pipelines ${summarizeCounts(summary.pipelines)}`,
  );
}

async function observeAudioFrames(client, args, answer, firstAudioFrame = null) {
  if (!args.observeAudioMs) return firstAudioFrame;

  const stats = createMediaStats("audio", args.maxAudioGapMs);
  printObservationStart("Audio", args.observeAudioMs, args, args.maxAudioGapMs);
  let audioFrame = firstAudioFrame;
  if (!audioFrame) {
    audioFrame = await client.waitFor("audio_frame", Math.max(args.timeoutMs, args.maxAudioGapMs || 0, 10000));
    assertAudioFrame(audioFrame, answer, { silent: true });
  }
  recordMediaFrame(stats, audioFrame, answer);

  const deadline = performance.now() + args.observeAudioMs;
  let nextProgressAt = args.progressIntervalMs > 0 ? stats.startedAt + args.progressIntervalMs : 0;
  while (performance.now() < deadline) {
    const remainingMs = deadline - performance.now();
    const waitMs = Math.max(1, Math.min(remainingMs, args.maxAudioGapMs || args.timeoutMs));
    try {
      const frame = await client.waitFor("audio_frame", waitMs);
      assertAudioFrame(frame, answer, { silent: true });
      recordMediaFrame(stats, frame, answer);
      nextProgressAt = maybePrintMediaProgress("Audio", stats, deadline, nextProgressAt, args.progressIntervalMs);
    } catch (error) {
      if (performance.now() >= deadline) {
        break;
      }
      if (args.maxAudioGapMs > 0) {
        throw new Error(`audio observation timed out before next frame: ${error.message}`);
      }
    }
  }

  const summary = finishMediaStats(stats);
  assertMediaStats(summary, {
    minFrames: args.minAudioFrames,
    minFps: args.minAudioFps,
    label: "audio",
  });
  print(
    "OK",
    `Audio observed: ${summary.frames} frames / ${(summary.elapsedMs / 1000).toFixed(1)}s / ${summary.fps.toFixed(2)} FPS / max gap ${Math.round(summary.maxGapMs)} ms / avg ${summary.averageBytes} bytes / codecs ${summarizeCounts(summary.codecs)} / modes ${summarizeCounts(summary.pipelines)}`,
  );

  return audioFrame;
}

async function probeClipboardText(client, args) {
  const clipboardId = makeProbeId("probe-text");
  const text = `lan-dual-control clipboard probe ${new Date().toISOString()}`;
  const ackPromise = client.waitFor("clipboard_ack", args.timeoutMs);
  client.send({
    type: "clipboard_text",
    direction: "client_to_host",
    clipboardId,
    textLength: text.length,
    text,
    mode: "probe",
  });

  const ack = await ackPromise;
  if (ack.clipboardId !== clipboardId) {
    throw new Error(`clipboard_ack id mismatch: ${ack.clipboardId || "missing"}`);
  }
  if (!ack.accepted) {
    throw new Error(`clipboard_text rejected: ${ack.reason || ack.code || "unknown"}`);
  }
  print("OK", `Clipboard text accepted: ${ack.textLength || text.length} chars / mode=${ack.mode || "unknown"}`);
}

async function probeClipboardHostToClient(client, args) {
  const previousText = await readLocalMacClipboardText();
  const text = `lan-dual-control host clipboard probe ${new Date().toISOString()} ${randomUUID()}`;

  try {
    const clipboardPromise = client.waitFor("clipboard_text", Math.max(args.timeoutMs, 10000));
    await writeLocalMacClipboardText(text);
    const message = await clipboardPromise;
    if (message.direction !== "host_to_client") {
      throw new Error(`clipboard_text direction mismatch: ${message.direction || "missing"}`);
    }
    if (message.text !== text) {
      throw new Error(`clipboard_text payload mismatch: ${message.textLength || 0} chars`);
    }
    print("OK", `Clipboard host_to_client received: ${message.textLength || text.length} chars / mode=${message.mode || "unknown"}`);
  } finally {
    await writeLocalMacClipboardText(previousText);
  }
}

function makeProbeFilePayload(size) {
  const text = `lan-dual-control file clipboard probe ${new Date().toISOString()}\n`;
  const chunks = [];
  while (Buffer.byteLength(chunks.join("")) < size) {
    chunks.push(text);
  }
  return Buffer.from(chunks.join("").slice(0, Math.max(1, size)), "utf8");
}

async function probeClipboardFile(client, args) {
  const transferId = makeProbeId("probe-file");
  const fileName = `lan-dual-probe-${Date.now().toString(16)}.txt`;
  const payload = makeProbeFilePayload(args.clipboardFileBytes);
  const responsePromise = client.waitFor("clipboard_file_response", args.timeoutMs);
  client.send({
    type: "clipboard_file_offer",
    transferId,
    direction: "client_to_host",
    totalBytes: payload.byteLength,
    fileCount: 1,
    maxChunkBytes: 64 * 1024,
    files: [
      {
        index: 0,
        name: fileName,
        size: payload.byteLength,
        mimeType: "text/plain",
        lastModified: Date.now(),
      },
    ],
  });

  const response = await responsePromise;
  if (response.transferId !== transferId) {
    throw new Error(`clipboard_file_response id mismatch: ${response.transferId || "missing"}`);
  }
  if (!response.accepted) {
    throw new Error(`clipboard_file_offer rejected: ${response.reason || response.code || "unknown"}`);
  }

  const chunkSize = Math.max(1, Number(response.maxChunkBytes) || 64 * 1024);
  let sentBytes = 0;
  let chunkIndex = 0;
  for (let offset = 0; offset < payload.byteLength; offset += chunkSize) {
    const chunk = payload.subarray(offset, Math.min(offset + chunkSize, payload.byteLength));
    sentBytes += chunk.byteLength;
    client.send({
      type: "clipboard_file_chunk",
      transferId,
      fileIndex: 0,
      fileName,
      chunkIndex,
      offset,
      bytes: chunk.byteLength,
      sentBytes,
      totalBytes: payload.byteLength,
      encoding: "base64",
      dataBase64: chunk.toString("base64"),
    });
    chunkIndex += 1;
  }

  const resultPromise = client.waitFor("clipboard_file_result", args.timeoutMs);
  client.send({
    type: "clipboard_file_complete",
    transferId,
    fileCount: 1,
    totalBytes: payload.byteLength,
  });

  const result = await resultPromise;
  if (result.transferId !== transferId) {
    throw new Error(`clipboard_file_result id mismatch: ${result.transferId || "missing"}`);
  }
  if (!result.accepted) {
    throw new Error(`clipboard_file transfer failed: ${result.reason || result.code || "unknown"}`);
  }
  if (Number(result.receivedBytes) !== payload.byteLength) {
    throw new Error(`clipboard_file bytes mismatch: ${result.receivedBytes || 0}/${payload.byteLength}`);
  }
  print(
    "OK",
    `Clipboard file accepted: ${result.fileCount || 1} file / ${result.receivedBytes} bytes / saveMode=${result.saveMode || response.saveMode || "unknown"}`,
  );
}

async function probeClipboardFileHostToClient(client, args) {
  const previousText = await readLocalMacClipboardText();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lan-dual-file-clip-"));
  const fileName = `lan-dual-host-file-${Date.now().toString(16)}.txt`;
  const filePath = path.join(tempDir, fileName);
  const payload = makeProbeFilePayload(args.clipboardFileBytes);

  try {
    await fs.writeFile(filePath, payload);
    const offerPromise = client.waitFor("clipboard_file_offer", Math.max(args.timeoutMs, 12000));
    await writeLocalMacClipboardFile(filePath);
    const offer = await offerPromise;
    if (offer.direction !== "host_to_client") {
      throw new Error(`clipboard_file_offer direction mismatch: ${offer.direction || "missing"}`);
    }
    if (!offer.transferId) {
      throw new Error("clipboard_file_offer missing transferId");
    }
    if (Number(offer.fileCount) !== 1) {
      throw new Error(`clipboard_file_offer fileCount mismatch: ${offer.fileCount || 0}`);
    }
    const offeredFile = Array.isArray(offer.files) ? offer.files[0] : null;
    if (!offeredFile) {
      throw new Error("clipboard_file_offer missing file metadata");
    }
    if (offeredFile.name !== fileName) {
      throw new Error(`clipboard_file_offer filename mismatch: ${offeredFile.name || "missing"}`);
    }
    if (Number(offeredFile.size) !== payload.byteLength) {
      throw new Error(`clipboard_file_offer size mismatch: ${offeredFile.size || 0}/${payload.byteLength}`);
    }

    const transferId = offer.transferId;
    client.send({
      type: "clipboard_file_response",
      transferId,
      accepted: true,
      saveMode: "memory-only",
      maxChunkBytes: 64 * 1024,
      reason: "probe accepts host_to_client file clipboard",
    });

    const chunks = [];
    let receivedBytes = 0;
    const totalBytes = Number(offer.totalBytes) || payload.byteLength;
    while (receivedBytes < totalBytes) {
      const chunk = await client.waitFor("clipboard_file_chunk", args.timeoutMs);
      if (chunk.transferId !== transferId) {
        throw new Error(`clipboard_file_chunk id mismatch: ${chunk.transferId || "missing"}`);
      }
      if (Number(chunk.fileIndex) !== 0) {
        throw new Error(`clipboard_file_chunk fileIndex mismatch: ${chunk.fileIndex || "missing"}`);
      }
      if (chunk.encoding !== "base64") {
        throw new Error(`clipboard_file_chunk encoding mismatch: ${chunk.encoding || "missing"}`);
      }
      const data = Buffer.from(String(chunk.dataBase64 || ""), "base64");
      const offset = Number(chunk.offset) || 0;
      chunks.push({ offset, data });
      receivedBytes += data.byteLength;
      client.send({
        type: "clipboard_file_progress",
        transferId,
        receivedBytes,
        totalBytes,
      });
    }

    const complete = await client.waitFor("clipboard_file_complete", args.timeoutMs);
    if (complete.transferId !== transferId) {
      throw new Error(`clipboard_file_complete id mismatch: ${complete.transferId || "missing"}`);
    }

    const received = Buffer.concat(
      chunks
        .sort((left, right) => left.offset - right.offset)
        .map((chunk) => chunk.data),
    );
    if (!received.equals(payload)) {
      throw new Error(`clipboard_file host_to_client payload mismatch: ${received.byteLength}/${payload.byteLength}`);
    }

    client.send({
      type: "clipboard_file_result",
      transferId,
      accepted: true,
      receivedBytes,
      totalBytes,
      fileCount: 1,
      saveMode: "memory-only",
      reason: "probe reconstructed host_to_client file payload",
    });
    print("OK", `Clipboard file host_to_client received: ${fileName} / ${receivedBytes} bytes`);
  } finally {
    await writeLocalMacClipboardText(previousText);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function probeInputEvents(client, args) {
  const safeEvents = [
    {
      type: "input_event",
      event: "mouse_move",
      action: "move",
      x: 0.5,
      y: 0.5,
      remoteX: 960,
      remoteY: 540,
    },
    {
      type: "input_event",
      event: "key",
      action: "key",
      key: "F13",
      code: "F13",
    },
  ];
  const fullEvents = [
    ...safeEvents,
    {
      type: "input_event",
      event: "mouse_button",
      action: "down",
      button: "left",
      x: 0.5,
      y: 0.5,
      remoteX: 960,
      remoteY: 540,
    },
    {
      type: "input_event",
      event: "mouse_button",
      action: "up",
      button: "left",
      x: 0.5,
      y: 0.5,
      remoteX: 960,
      remoteY: 540,
    },
    {
      type: "input_event",
      event: "mouse_wheel",
      action: "wheel",
      deltaY: 120,
      x: 0.5,
      y: 0.5,
      remoteX: 960,
      remoteY: 540,
    },
    {
      type: "input_event",
      event: "key",
      action: "key",
      key: "a",
      code: "KeyA",
      modifiers: ["ctrl"],
      remoteModifiers: ["ctrl"],
    },
    {
      type: "input_event",
      event: "key",
      action: "key",
      key: "Delete",
      code: "Delete",
    },
    {
      type: "input_event",
      event: "key",
      action: "key",
      key: "5",
      code: "Numpad5",
    },
    {
      type: "input_event",
      event: "key",
      action: "key",
      key: "Insert",
      code: "Insert",
    },
  ];
  const events = args.inputEventSet === "full" ? fullEvents : safeEvents;

  for (const event of events) {
    const envelope = client.send(event);
    const ack = await client.waitFor("input_ack", args.timeoutMs);
    if (ack.inputId && ack.inputId !== envelope.id) {
      throw new Error(`input_ack id mismatch: ${ack.inputId} !== ${envelope.id}`);
    }
    if (!ack.accepted) {
      throw new Error(`input_event rejected: ${ack.reason || ack.mode || "unknown"}`);
    }
    if (typeof args.expectInputInjected === "boolean" && ack.injected !== args.expectInputInjected) {
      throw new Error(
        `input_event injected mismatch: expected ${args.expectInputInjected}, got ${ack.injected} (${ack.reason || ack.mode || "unknown"})`,
      );
    }
  }

  await delay(50);
  const injectText = typeof args.expectInputInjected === "boolean"
    ? ` / injected=${args.expectInputInjected}`
    : "";
  print("OK", `Input events acknowledged: ${events.length} events${injectText}`);
}

async function main() {
  if (helpRequested(process.argv.slice(2))) {
    printHelp();
    return;
  }

  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
    return;
  }
  try {
    const discoverySelection = await resolveDiscoveryTarget(args);
    if (discoverySelection) {
      const runtimeText = discoverySelection.runtimeBuild ? ` runtimeBuild=${discoverySelection.runtimeBuild}` : "";
      print(
        "OK",
        `Discovery target: ${discoverySelection.target}; macHosts=${discoverySelection.foundMacHosts}${runtimeText}`,
      );
    }
  } catch (error) {
    fail(error.message);
    return;
  }
  try {
    await preparePassword(args);
  } catch (error) {
    fail(error.message);
    return;
  }

  print("INFO", `Target: ${args.host}:${args.port}`);

  let discovery;
  try {
    discovery = await fetchDiscovery(args);
  } catch (error) {
    fail(`Discovery failed: ${error.message}`);
    return;
  }

  let socket;
  try {
    socket = await openWebSocket(args);
    print("OK", "WebSocket connected");
  } catch (error) {
    fail(error.message);
    return;
  }

  const client = createSocketClient(socket, args);
  try {
    client.send({
      type: "hello",
      clientName: "Windows probe",
      clientPlatform: "windows",
      protocolVersion: 1,
    });
    const hello = await client.waitFor("hello_ack");
    print("OK", `hello_ack: ${hello.hostName || "host"} / ${hello.hostPlatform || "unknown"}`);

    client.send({ type: "auth_request", password: args.password });
    const auth = await client.waitFor("auth_result");
    if (!auth.ok) {
      fail(`Auth failed: ${auth.reason || auth.message || auth.code || "unknown"}`);
      return;
    }
    print("OK", "Auth passed");

    client.send(makeSessionOffer(args));
    const answer = await client.waitFor("session_answer");
    if (!answer.ok) {
      fail(`Session rejected: ${answer.reason || answer.code || "unknown"}`);
      return;
    }
    print(
      "OK",
      `Session: ${answer.width || answer.screenWidth}x${answer.height || answer.screenHeight} / ${answer.fps} Hz / ${answer.videoCodec}`,
    );
    if (answer.hostMode) {
      print("INFO", `Host mode: ${answer.hostMode}`);
    }
    if (answer.permissions) {
      print("INFO", `Permissions: ${JSON.stringify(answer.permissions)}`);
    }

    assertExpectedInputMode({ args, discovery, hello, answer });

    const frame = await client.waitFor("video_frame", Math.max(args.timeoutMs, 10000));
    if (!frame.dataUrl && !frame.payload) {
      fail("First video_frame has neither dataUrl nor payload");
      return;
    }
    print("OK", `First frame: ${summarizeFrame(frame)}`);
    if (args.requireH264) {
      assertH264VideoFrame(frame, answer);
    } else if (args.requireRealVideo) {
      assertRealVideoFrame(frame, answer);
    }
    await observeVideoFrames(client, args, answer, frame);

    let audioFrame = null;
    if (args.requireAudio) {
      audioFrame = await client.waitFor("audio_frame", Math.max(args.timeoutMs, 10000));
      assertAudioFrame(audioFrame, answer);
    }
    await observeAudioFrames(client, args, answer, audioFrame);

    if (args.clipboardText) {
      await probeClipboardText(client, args);
    }
    if (args.clipboardHostToClient) {
      await probeClipboardHostToClient(client, args);
    }
    if (args.clipboardFile) {
      await probeClipboardFile(client, args);
    }
    if (args.clipboardFileHostToClient) {
      await probeClipboardFileHostToClient(client, args);
    }
    if (args.inputEvents) {
      await probeInputEvents(client, args);
    }
  } catch (error) {
    fail(error.message);
  } finally {
    socket.close();
  }
}

await main();
