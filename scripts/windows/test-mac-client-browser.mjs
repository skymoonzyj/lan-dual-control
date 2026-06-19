import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const defaults = {
  host: "127.0.0.1",
  port: "43772",
  password: "demo-password",
  hostPassword: "",
  clientPassword: "",
  useEnvPassword: false,
  requirePassword: false,
  clientPort: 5188,
  debugPort: 9340,
  timeoutMs: 30000,
  inputMode: "log",
  screenMode: "auto",
  h264Encoder: "",
  wgcHelper: "",
  wgcH264Source: "",
  requireRealVideo: true,
  requireSystemClipboard: process.platform === "win32",
  testFileClipboard: true,
  expectAuthFailure: false,
  expectedAttemptsRemaining: "",
  expectedMaxAttempts: "",
  audioMode: "",
  enableAudio: false,
  expectAudioFrame: false,
  expectAudioPayload: false,
  expectAudioPlayback: false,
  requireAudio: false,
  expectReconnect: false,
  maxInitialVideoMs: 0,
  maxReconnectRestoreMs: 0,
  maxAudioFrameMs: 0,
  maxAudioPlaybackMs: 0,
  observeVideoMs: 0,
  testReconnectNow: false,
  minObservedVideoFrames: 0,
  minObservedVideoFps: 0,
  progressIntervalMs: 10000,
  expectRepeatSignalVideo: false,
  expectBinaryVideo: false,
  expectBinaryH264Video: false,
  expectWgcNv12H264Video: false,
  expectH264Fallback: false,
  requireH264Video: false,
  forceH264Unsupported: false,
  useExistingHost: false,
  mockVideo: false,
  headless: true,
  disableGpu: false,
  disableBinaryVideo: false,
  disableWebCodecs: false,
  boardSummary: false,
};
const temporaryWindowsHostBuildId = "mac-client-test";
let boardSummaryMode = false;
let lastBoardSummaryArgs = null;
let lastBoardSummaryReport = null;

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-mac-client-browser.mjs [options]

Runs the Mac web client browser self-test against a temporary Windows host by
default. Use --useExistingHost when connecting to a host that is already running.

Options:
  --host <host>                    Windows host address. Default: ${defaults.host}
  --port <port>                    Windows host port. Default: ${defaults.port}
  --password <password>            Shared password. Default: ${defaults.password}
  --hostPassword <password>        Password used by the temporary Windows host.
  --clientPassword <password>      Password typed into the Mac client page.
  --useEnvPassword                 Read shared/client password from LAN_DUAL_PASSWORD.
  --requirePassword                Refuse empty/demo password before connecting.
  --clientPort <port>              Local Mac client web port. Default: ${defaults.clientPort}
  --debugPort <port>               Browser remote debugging port. Default: ${defaults.debugPort}
  --timeoutMs <ms>                 Per-step timeout. Default: ${defaults.timeoutMs}
  --headed                         Run browser headed instead of headless.
  --useExistingHost                Do not start a temporary Windows host.
  --mockVideo                      Start temporary host with mock video and disable real-video requirement.
  --screenMode <mode>              Temporary host screen mode. Default: ${defaults.screenMode}
  --h264Encoder <name>             Optional temporary host H.264 encoder, for example h264_nvenc
  --wgcHelper <path>               WGC helper exe for WGC H.264 bridge tests
  --wgcH264Source <jpeg|raw-bgra|nv12>
                                   WGC helper H.264 bridge source. Default: auto per test
  --inputMode <mode>               Temporary host input mode. Default: ${defaults.inputMode}
  --noRequireRealVideo             Allow mock/svg video frames.
  --allowClipboardFallback         Allow memory/temp clipboard fallback on non-Windows systems.
  --requireSystemClipboard         Require Windows system clipboard mode.
  --skipFileClipboard              Skip file clipboard checks.
  --expectAuthFailure              Expect wrong-password auth failure and skip file clipboard checks.
  --expectedAttemptsRemaining <n>  Expected remaining attempts for --expectAuthFailure.
  --expectedMaxAttempts <n>        Expected max attempts for --expectAuthFailure.
  --enableAudio                    Turn on "play remote audio" in the Mac client.
  --expectAudioFrame               Require at least one audio_frame.
  --expectAudioPayload             Require audio payload; implies --expectAudioFrame.
  --expectAudioPlayback            Require playback count; implies payload/frame.
  --requireAudio                   Start temporary host with WASAPI audio and require playback.
  --audioMode <mode>               Temporary host audio mode, for example wasapi.
  --maxAudioFrameMs <ms>           Maximum first audio frame time. Default: off
  --maxAudioPlaybackMs <ms>        Maximum playback count time. Default: off
  --expectReconnect                Kill/restart temporary host and require auto-reconnect.
  --maxReconnectRestoreMs <ms>     Maximum reconnect restore time. Default: off
  --maxInitialVideoMs <ms>         Maximum initial visible video time. Default: off
  --observeVideoMs <ms>            Observe sustained video after connect. Default: off
  --testReconnectNow               In --expectReconnect, click the Mac client "立即重连" button before the auto timer fires.
  --minObservedVideoFrames <n>     Minimum frames during --observeVideoMs.
  --minObservedVideoFps <fps>      Minimum FPS during --observeVideoMs.
  --progressIntervalMs <ms>        Print page wait progress every N ms for video/audio/reconnect/auth waits; 0 disables. Default: ${defaults.progressIntervalMs}
  --expectRepeatSignalVideo        Start WGC mock helper with repeat signal frames and require Mac client diagnostics.
  --expectBinaryVideo              Start WGC JPEG helper and require binary JPEG video transport.
  --expectBinaryH264Video          Start ffmpeg-h264 mode and require binary H.264 video transport.
  --expectWgcNv12H264Video         Start real WGC helper NV12 bridge and require binary H.264 page video.
  --expectH264Fallback             Start ffmpeg-h264 mode and require Mac client to request MJPEG fallback.
  --requireH264Video               Require the Mac client to render H.264 video instead of JPEG fallback.
  --forceH264Unsupported           Force VideoDecoder.isConfigSupported to reject H.264 configs.
  --disableBinaryVideo             Open Mac client with ?binaryVideo=0 and require JSON/base64 video transport.
  --disableGpu                     Launch headless browser with --disable-gpu for old fallback reproduction.
  --disableWebCodecs               Hide VideoDecoder/EncodedVideoChunk and expect MJPEG request fallback.
  --boardSummary                   Print one secret-free Agent Link Board summary on stdout; detailed progress goes to stderr.

Examples:
  node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --skipFileClipboard
  node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --enableAudio --expectAudioFrame --observeVideoMs 1200 --minObservedVideoFrames 5
  node scripts/windows/test-mac-client-browser.mjs --useExistingHost --host 192.168.1.50 --port 43770 --enableAudio --expectAudioPayload --expectAudioPlayback
  node scripts/windows/test-mac-client-browser.mjs --mockVideo --allowClipboardFallback --skipFileClipboard --boardSummary
`);
}

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];

    if (key === "headed") {
      args.headless = false;
      continue;
    }
    if (key === "useEnvPassword") {
      args.useEnvPassword = true;
      continue;
    }
    if (key === "requirePassword") {
      args.requirePassword = true;
      continue;
    }
    if (key === "disableWebCodecs") {
      args.disableWebCodecs = true;
      continue;
    }
    if (key === "boardSummary") {
      args.boardSummary = true;
      continue;
    }
    if (key === "disableGpu") {
      args.disableGpu = true;
      continue;
    }
    if (key === "disableBinaryVideo") {
      args.disableBinaryVideo = true;
      continue;
    }
    if (key === "forceH264Unsupported") {
      args.forceH264Unsupported = true;
      continue;
    }
    if (key === "requireH264Video") {
      args.requireH264Video = true;
      continue;
    }
    if (key === "useExistingHost") {
      args.useExistingHost = true;
      continue;
    }
    if (key === "mockVideo") {
      args.mockVideo = true;
      args.requireRealVideo = false;
      args.screenMode = "mock";
      continue;
    }
    if (key === "noRequireRealVideo") {
      args.requireRealVideo = false;
      continue;
    }
    if (key === "allowClipboardFallback") {
      args.requireSystemClipboard = false;
      continue;
    }
    if (key === "requireSystemClipboard") {
      args.requireSystemClipboard = true;
      continue;
    }
    if (key === "skipFileClipboard") {
      args.testFileClipboard = false;
      continue;
    }
    if (key === "expectAuthFailure") {
      args.expectAuthFailure = true;
      args.testFileClipboard = false;
      args.requireRealVideo = false;
      continue;
    }
    if (key === "enableAudio") {
      args.enableAudio = true;
      continue;
    }
    if (key === "expectAudioFrame") {
      args.expectAudioFrame = true;
      continue;
    }
    if (key === "expectAudioPayload") {
      args.expectAudioPayload = true;
      continue;
    }
    if (key === "expectAudioPlayback") {
      args.expectAudioPlayback = true;
      continue;
    }
    if (key === "requireAudio") {
      args.requireAudio = true;
      args.expectAudioPlayback = true;
      if (!args.audioMode) {
        args.audioMode = "wasapi";
      }
      continue;
    }
    if (key === "expectReconnect") {
      args.expectReconnect = true;
      continue;
    }
    if (key === "testReconnectNow") {
      args.testReconnectNow = true;
      args.expectReconnect = true;
      continue;
    }
    if (key === "expectRepeatSignalVideo") {
      args.expectRepeatSignalVideo = true;
      args.screenMode = "wgc";
      continue;
    }
    if (key === "expectBinaryVideo") {
      args.expectBinaryVideo = true;
      args.screenMode = "wgc";
      continue;
    }
    if (key === "expectBinaryH264Video") {
      args.expectBinaryH264Video = true;
      args.requireH264Video = true;
      args.screenMode = "ffmpeg-h264";
      continue;
    }
    if (key === "expectWgcNv12H264Video") {
      args.expectWgcNv12H264Video = true;
      args.expectBinaryH264Video = true;
      args.requireH264Video = true;
      args.screenMode = "wgc";
      args.wgcH264Source = "nv12";
      continue;
    }
    if (key === "expectH264Fallback") {
      args.expectH264Fallback = true;
      args.forceH264Unsupported = true;
      args.screenMode = "ffmpeg-h264";
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(args, key) && next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    }
  }

  args.clientPort = Number(args.clientPort);
  args.debugPort = Number(args.debugPort);
  args.timeoutMs = Number(args.timeoutMs);
  args.h264Encoder = String(args.h264Encoder || "").trim().toLowerCase();
  args.wgcHelper = String(args.wgcHelper || "").trim();
  args.wgcH264Source = normalizeWgcH264Source(args.wgcH264Source);
  if (args.expectWgcNv12H264Video && !args.h264Encoder) {
    args.h264Encoder = "h264_nvenc";
  }
  args.maxInitialVideoMs = Number(args.maxInitialVideoMs);
  args.maxReconnectRestoreMs = Number(args.maxReconnectRestoreMs);
  args.maxAudioFrameMs = Number(args.maxAudioFrameMs);
  args.maxAudioPlaybackMs = Number(args.maxAudioPlaybackMs);
  args.observeVideoMs = Number(args.observeVideoMs);
  args.minObservedVideoFrames = Number(args.minObservedVideoFrames);
  args.minObservedVideoFps = Number(args.minObservedVideoFps);
  const progressIntervalMs = Number(args.progressIntervalMs);
  args.progressIntervalMs = Number.isFinite(progressIntervalMs)
    ? Math.max(0, progressIntervalMs)
    : defaults.progressIntervalMs;
  if (args.useEnvPassword) {
    args.password = process.env.LAN_DUAL_PASSWORD || "";
  }
  args.hostPassword = args.hostPassword || args.password;
  args.clientPassword = args.clientPassword || (args.expectAuthFailure ? `${args.password}-wrong` : args.password);
  if (args.requirePassword && !args.clientPassword) {
    throw new Error("LAN_DUAL_PASSWORD is required. Set it in the environment, pass --password, or use a wrapper with --promptPassword.");
  }
  if (args.requirePassword && args.clientPassword === "demo-password") {
    throw new Error("Refusing to use demo-password when --requirePassword is set.");
  }
  if (args.requireAudio && !args.audioMode) {
    args.audioMode = "wasapi";
  }
  if (args.requireAudio) {
    args.expectAudioPlayback = true;
  }
  if (args.expectAudioPlayback) {
    args.expectAudioPayload = true;
  }
  if (args.expectAudioPayload) {
    args.expectAudioFrame = true;
  }
  if (args.expectAudioFrame) {
    args.enableAudio = true;
  }
  return args;
}

function normalizeWgcH264Source(value) {
  const source = String(value || "").trim().toLowerCase();
  if (["raw", "bgra", "raw-bgra", "raw_bgra"].includes(source)) {
    return "raw-bgra";
  }
  if (["nv12", "raw-nv12", "raw_nv12", "yuv", "yuv420"].includes(source)) {
    return "nv12";
  }
  if (["jpeg", "jpg", "mjpeg"].includes(source)) {
    return "jpeg";
  }
  return "";
}

function print(kind, text) {
  const line = `[${kind}] ${text}`;
  if (boardSummaryMode) {
    console.error(line);
  } else {
    console.log(line);
  }
}

function compactBoardText(value, maxLength = 110) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function redactBoardSummaryText(value, args = lastBoardSummaryArgs) {
  let text = String(value ?? "");
  const secrets = [
    args?.password,
    args?.hostPassword,
    args?.clientPassword,
    process.env.LAN_DUAL_PASSWORD,
  ].filter(Boolean);
  for (const secret of secrets) {
    text = text.split(String(secret)).join("[redacted]");
  }
  return text;
}

function makeBoardSummary(report = lastBoardSummaryReport || {}, args = lastBoardSummaryArgs || defaults) {
  const status = report.ok === false ? "failed" : "passed";
  const target = `${args.host || defaults.host}:${args.port || defaults.port}`;
  const hostMode = args.useExistingHost ? "existing-host" : args.mockVideo ? "temporary-mock-host" : "temporary-host";
  const parts = [
    `Mac client browser self-test: ${status}`,
    `target=${target}`,
    `mode=${hostMode}`,
  ];
  if (report.authFailure) {
    parts.push(`authFailure=${compactBoardText(report.authFailure, 80)}`);
  } else {
    if (report.connection) parts.push(`connection=${compactBoardText(report.connection, 80)}`);
    if (report.video) parts.push(`video=${compactBoardText(report.video, 100)}`);
    if (report.videoDiagnostics) parts.push(`diagnostics=${compactBoardText(report.videoDiagnostics, 100)}`);
    if (report.videoObserve) parts.push(`observe=${compactBoardText(report.videoObserve, 80)}`);
    parts.push(`audio=${compactBoardText(report.audio || (args.enableAudio ? "requested" : "not-requested"), 90)}`);
    if (report.reverseControl) parts.push(`reverse=${compactBoardText(report.reverseControl, 100)}`);
    if (report.input) parts.push(`input=${compactBoardText(report.input, 90)}`);
    if (report.clipboardText) parts.push(`clipboardText=${compactBoardText(report.clipboardText, 90)}`);
    parts.push(`fileClipboard=${compactBoardText(report.clipboardFile || (args.testFileClipboard ? "not-run" : "skipped"), 90)}`);
  }
  if (report.error) parts.push(`error=${compactBoardText(report.error, 120)}`);
  parts.push("no password printed or sent to Agent Link Board");
  parts.push("no inject");
  return redactBoardSummaryText(parts.join("; "), args);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSeconds(ms) {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

function progressEveryText(args) {
  return args.progressIntervalMs > 0 ? formatSeconds(args.progressIntervalMs) : "off";
}

function printTimedProgress(label, startedAt, deadline, details = "") {
  const now = Date.now();
  const elapsedMs = Math.max(0, now - startedAt);
  const remainingMs = Math.max(0, deadline - now);
  const totalMs = Math.max(1, deadline - startedAt);
  const percent = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
  const suffix = details ? ` · ${details}` : "";
  print("INFO", `${label}: ${formatSeconds(elapsedMs)} elapsed / ${formatSeconds(remainingMs)} left / ${percent.toFixed(0)}%${suffix}`);
}

function compactProgressText(value, maxLength = 90) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function snapshotProgressDetails(snapshot, extra = "") {
  if (!snapshot) return extra || "snapshot=pending";
  const parts = [];
  const add = (label, value) => {
    const text = compactProgressText(value);
    if (text) parts.push(`${label}=${text}`);
  };
  add("connection", snapshot.connection);
  add("remote", snapshot.remote);
  add("video", snapshot.video);
  if (snapshot.audioToggleChecked || snapshot.audioFrameCount > 0 || snapshot.audioPlayedFrames > 0) {
    add("audio", snapshot.audio);
    add("playback", snapshot.audioPlayback);
  }
  if (Number(snapshot.binaryH264VideoFrames) > 0) {
    add("binaryH264", snapshot.binaryH264VideoFrames);
  }
  if (Number(snapshot.binaryVideoFrames) > 0) {
    add("binaryJpeg", snapshot.binaryVideoFrames);
  }
  if (Number(snapshot.repeatSignalVideoFrames) > 0) {
    add("repeat", snapshot.repeatSignalVideoFrames);
  }
  if (Number(snapshot.audioFrameCount) > 0) {
    add("audioFrames", snapshot.audioFrameCount);
  }
  if (Number(snapshot.audioPlayedFrames) > 0) {
    add("played", snapshot.audioPlayedFrames);
  }
  if (extra) parts.push(compactProgressText(extra));
  return parts.join(" · ") || "snapshot=pending";
}

async function waitForPageSnapshot({ args, session, label, timeoutMs, check, onSnapshot, summarize }) {
  const effectiveTimeoutMs = timeoutMs ?? args.timeoutMs;
  let latestSnapshot = null;
  print("INFO", `${label} waiting: timeout=${formatSeconds(effectiveTimeoutMs)}, progressEvery=${progressEveryText(args)}.`);
  return waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      latestSnapshot = value;
      onSnapshot?.(value);
      return check(value);
    },
    effectiveTimeoutMs,
    label,
    {
      progressIntervalMs: args.progressIntervalMs,
      onProgress: ({ startedAt, deadline, lastError }) => {
        const errorText = lastError ? `lastError=${lastError.message}` : "";
        const details = summarize
          ? summarize(latestSnapshot, errorText)
          : snapshotProgressDetails(latestSnapshot, errorText);
        printTimedProgress(`${label} progress`, startedAt, deadline, details);
      },
    },
  );
}

function requireWithinDuration(label, elapsedMs, maxMs) {
  if (!Number.isFinite(maxMs) || maxMs <= 0) return;
  if (elapsedMs > maxMs) {
    throw new Error(`${label} took ${elapsedMs}ms, expected <= ${maxMs}ms`);
  }
}

async function waitFor(fn, timeoutMs, label, options = {}) {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  const progressIntervalMs = Math.max(0, Number(options.progressIntervalMs) || 0);
  let nextProgressAt = progressIntervalMs > 0 ? startedAt + progressIntervalMs : 0;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    if (nextProgressAt > 0 && Date.now() >= nextProgressAt && Date.now() < deadline) {
      try {
        options.onProgress?.({ startedAt, deadline, lastError });
      } catch {}
      do {
        nextProgressAt += progressIntervalMs;
      } while (nextProgressAt <= Date.now());
    }
    await delay(250);
  }
  throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ""}`);
}

function findBrowserPath() {
  const candidates = [
    process.env.BROWSER_PATH,
    process.env.MSEDGE_PATH,
    process.env.CHROME_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean);
  const browserPath = candidates.find((candidate) => existsSync(candidate));
  if (!browserPath) {
    throw new Error("browser not found; install Microsoft Edge/Chrome or set BROWSER_PATH, MSEDGE_PATH, or CHROME_PATH");
  }
  return browserPath;
}

function startProcess(command, args, options = {}) {
  return spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function attachProcessLog(child, name) {
  child.stdout?.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) print(name, text);
  });
  child.stderr?.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) print(`${name}:err`, text);
  });
}

async function stopProcess(child, name) {
  if (!child || child.exitCode !== null || child.killed) return;
  const pid = child.pid;
  child.kill();
  await new Promise((resolveClose) => {
    const forceTimer = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }, 2500);
    const fallbackTimer = setTimeout(resolveClose, 10000);
    child.once("close", () => {
      clearTimeout(forceTimer);
      clearTimeout(fallbackTimer);
      resolveClose();
    });
  });
  print("OK", `Stopped ${name} PID ${pid}`);
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}`);
  }
  return response.json();
}

async function postJson(url, body = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}`);
  }
  return response.json();
}

async function waitForHttpOk(url, timeoutMs, label) {
  return waitFor(async () => {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok;
  }, timeoutMs, label);
}

async function waitForHttpDown(url, timeoutMs, label) {
  return waitFor(async () => {
    try {
      const response = await fetch(url, { cache: "no-store" });
      return !response.ok;
    } catch {
      return true;
    }
  }, timeoutMs, label);
}

function canBindPort(host, port) {
  return new Promise((resolveBind) => {
    const server = createServer();
    server.once("error", () => resolveBind(false));
    server.once("listening", () => {
      server.close(() => resolveBind(true));
    });
    server.listen(Number(port), host);
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

async function ensureTemporaryHostPort(args) {
  if (args.useExistingHost) {
    return;
  }
  if (await canBindPort(args.host, args.port)) {
    return;
  }
  const fallbackPort = await reserveEphemeralPort(args.host);
  print("INFO", `Port ${args.port} is busy; using temporary Windows host port ${fallbackPort}`);
  args.port = String(fallbackPort);
}

class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(message.error.message || JSON.stringify(message.error)));
        } else {
          resolve(message.result);
        }
        return;
      }
      this.events.push(message);
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  waitForEvent(method, timeoutMs) {
    return waitFor(() => {
      const index = this.events.findIndex((event) => event.method === method);
      if (index < 0) return null;
      const [event] = this.events.splice(index, 1);
      return event;
    }, timeoutMs, method);
  }

  close() {
    this.socket.close();
  }
}

async function connectCdp(debugPort, timeoutMs) {
  const target = await waitFor(
    async () => {
      const list = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
      return list.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
    },
    timeoutMs,
    "browser DevTools target",
  );
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP WebSocket error")), { once: true });
  });
  return new CdpSession(socket);
}

async function evaluate(session, expression) {
  const result = await session.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const detail =
      result.exceptionDetails.exception?.description ||
      result.exceptionDetails.exception?.value ||
      result.exceptionDetails.text ||
      "Runtime.evaluate failed";
    throw new Error(detail);
  }
  return result.result?.value;
}

async function setFileInputFiles(session, selector, files) {
  const document = await session.send("DOM.getDocument", { depth: -1, pierce: true });
  const result = await session.send("DOM.querySelector", {
    nodeId: document.root.nodeId,
    selector,
  });
  if (!result.nodeId) {
    throw new Error(`file input not found: ${selector}`);
  }
  await session.send("DOM.setFileInputFiles", {
    nodeId: result.nodeId,
    files,
  });
}

async function clickElement(session, selector) {
  const rect = await evaluate(
    session,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error("element not found: ${selector}");
      element.scrollIntoView({ block: "center", inline: "center" });
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
      };
    })()`,
  );
  if (!rect?.width || !rect?.height) {
    throw new Error(`element has no visible box: ${selector}`);
  }
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: rect.x,
    y: rect.y,
    button: "none",
  });
  await session.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: rect.x,
    y: rect.y,
    button: "left",
    clickCount: 1,
  });
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: rect.x,
    y: rect.y,
    button: "left",
    clickCount: 1,
  });
}

async function grantClipboardPermissions(session, origin) {
  await session.send("Browser.grantPermissions", {
    origin,
    permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
  }).catch((error) => {
    print("INFO", `Clipboard permission grant skipped: ${error.message}`);
  });
}

async function createRepeatSignalWgcHelper() {
  const dir = await mkdtemp(join(tmpdir(), "lan-dual-repeat-signal-wgc-helper-"));
  const helperPath = join(dir, "mock-wgc-helper.mjs");
  const onePixelJpegBase64 =
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AUf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AUf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QUf/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QUf/EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QUf/Z";
  const source = `
const width = Number(process.env.LAN_DUAL_WGC_WIDTH) || 1280;
const height = Number(process.env.LAN_DUAL_WGC_HEIGHT) || 720;
const fps = Math.max(1, Math.min(10, Number(process.env.LAN_DUAL_WGC_FPS) || 8));
const intervalMs = Math.max(100, Math.round(1000 / fps));
const dataBase64 = ${JSON.stringify(onePixelJpegBase64)};
console.log(JSON.stringify({ type: "hello", backend: "repeat-signal-test-wgc-helper", codec: "jpeg", encoding: "base64", width, height, fps }));
let frameId = 0;
setInterval(() => {
  frameId += 1;
  console.log(JSON.stringify({
    type: "frame",
    frameId,
    timestamp: new Date().toISOString(),
    width,
    height,
    sourceWidth: width,
    sourceHeight: height,
    dataBase64,
    payloadBytes: Buffer.byteLength(dataBase64, "base64"),
  }));
}, intervalMs);
`;
  await writeFile(helperPath, source, "utf8");
  return {
    dir,
    helperPath,
    cleanup: () => rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }),
  };
}

async function startWindowsHost(args, repoRoot) {
  await ensureTemporaryHostPort(args);
  const discoveryUrl = `http://${args.host}:${args.port}/discovery`;
  try {
    const response = await fetch(discoveryUrl, { cache: "no-store" });
    if (response.ok) {
      if (args.useExistingHost) {
        print("OK", `Using existing Windows host on ${args.host}:${args.port}`);
        return null;
      }
      throw new Error(`temporary port ${args.port} unexpectedly has an HTTP service`);
    }
  } catch {
    // No existing host; start a temporary one below.
  }

  if (args.useExistingHost) {
    throw new Error(`Windows host is not reachable on ${args.host}:${args.port}`);
  }

  const wgcNv12Helper = args.expectWgcNv12H264Video
    ? resolveWgcHelperPath(args, repoRoot)
    : "";
  const env = {
    ...process.env,
    LAN_DUAL_PASSWORD: args.hostPassword,
    LAN_DUAL_WINDOWS_INPUT_MODE: args.inputMode,
    LAN_DUAL_WINDOWS_SCREEN_MODE: (args.expectRepeatSignalVideo || args.expectBinaryVideo || args.expectWgcNv12H264Video) ? "wgc" : args.mockVideo ? "mock" : args.screenMode,
    LAN_DUAL_BUILD_ID: temporaryWindowsHostBuildId,
    ...(args.h264Encoder ? { LAN_DUAL_WINDOWS_H264_ENCODER: args.h264Encoder } : {}),
    ...(args.audioMode ? { LAN_DUAL_WINDOWS_AUDIO_MODE: args.audioMode } : {}),
    ...(args.expectWgcNv12H264Video
      ? {
          LAN_DUAL_WINDOWS_WGC_HELPER: wgcNv12Helper,
          LAN_DUAL_WINDOWS_WGC_ALLOW_UNSUPPORTED: "1",
          LAN_DUAL_WINDOWS_WGC_H264_BRIDGE: "1",
          LAN_DUAL_WINDOWS_WGC_H264_SOURCE: args.wgcH264Source || "nv12",
          LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME: "1",
          LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME_MODE: "full",
          LAN_DUAL_WINDOWS_MAX_SCREEN_FPS: "60",
        }
      : {}),
    ...((args.expectRepeatSignalVideo || args.expectBinaryVideo) && args.repeatSignalWgcHelperPath
      ? {
          LAN_DUAL_WINDOWS_WGC_HELPER: process.execPath,
          LAN_DUAL_WINDOWS_WGC_HELPER_ARGS: args.repeatSignalWgcHelperPath,
          LAN_DUAL_WINDOWS_WGC_ALLOW_UNSUPPORTED: "1",
          LAN_DUAL_WINDOWS_MAX_SCREEN_FPS: "60",
          ...(args.expectRepeatSignalVideo
            ? {
                LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME: "1",
                LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME_MODE: "signal",
              }
            : {}),
        }
      : {}),
  };
  const child = startProcess(
    process.execPath,
    ["apps/windows-host/server.mjs", String(args.port), args.host],
    { cwd: repoRoot, env },
  );
  attachProcessLog(child, "windows-host");
  await waitForHttpOk(discoveryUrl, args.timeoutMs, "Windows host discovery");
  print("OK", `Started temporary Windows host PID ${child.pid} on ${args.host}:${args.port}`);
  return child;
}

function resolveWgcHelperPath(args, repoRoot) {
  const helperPath = args.wgcHelper ||
    process.env.LAN_DUAL_WINDOWS_WGC_HELPER ||
    join(repoRoot, "apps", "windows-wgc-helper", "target", "debug", "lan-dual-wgc-helper.exe");
  if (!existsSync(helperPath)) {
    throw new Error(`WGC helper not found for --expectWgcNv12H264Video: ${helperPath}. Build it with cargo build in apps/windows-wgc-helper or pass --wgcHelper.`);
  }
  return helperPath;
}

async function verifyMacClientReconnect({ args, repoRoot, session, windowsHost }) {
  if (!windowsHost || args.useExistingHost) {
    throw new Error("--expectReconnect requires a temporary Windows host managed by this script");
  }

  const restoreStartedAt = Date.now();
  const discoveryUrl = `http://${args.host}:${args.port}/discovery`;
  const sessionAnswersBefore = await evaluate(
    session,
    `(() => (window.__lanDualReceivedMessages || []).filter((message) => message.type === "session_answer").length)()`,
  );
  await evaluate(
    session,
    `(() => {
      const textInput = document.querySelector("#clipboardTextInput");
      textInput.value = "reconnect clipboard button guard";
      textInput.dispatchEvent(new Event("input", { bubbles: true }));
      textInput.dispatchEvent(new Event("change", { bubbles: true }));

      const fileInput = document.querySelector("#clipboardFileInput");
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File(["reconnect-file-button-guard"], "reconnect-button-guard.txt", { type: "text/plain" }));
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event("input", { bubbles: true }));
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`,
  );
  const clipboardButtonsReadySnapshot = await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      const textReady = !value.sendClipboardButtonDisabled && value.clipboardTextValue.includes("reconnect clipboard");
      const fileReady = !value.sendClipboardFilesButtonDisabled && value.fileClipboard.includes("1 个");
      return textReady && fileReady ? value : null;
    },
    args.timeoutMs,
    "Mac client reconnect clipboard buttons ready",
  );
  print("OK", `Reconnect clipboard buttons ready: ${clipboardButtonsReadySnapshot.fileClipboard}`);

  await stopProcess(windowsHost, "Windows host for reconnect");
  await waitForHttpDown(discoveryUrl, args.timeoutMs, "Windows host discovery shutdown");

  const reconnectingSnapshot = await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      const reconnecting = value.connection.includes("自动重连") || value.connection.includes("重连");
      const countdownVisible = value.connection.includes("秒后自动重连") && value.reconnectMetric.includes("秒后重连");
      const reconnectButtonVisible = !value.reconnectNowHidden && !value.reconnectNowDisabled;
      const logVisible = value.logs.some((line) => line.includes("自动重连"));
      const surfaceCleared = value.video === "连接中断" && !value.surfaceVisible && !value.surfaceHasFrame;
      const clipboardButtonsDisabled = value.sendClipboardButtonDisabled && value.sendClipboardFilesButtonDisabled;
      const runtimeCleared = value.remoteRuntime === "未提供";
      const reversePolicyCleared = value.reversePolicy === "未提供";
      const remoteCleared = value.remote === "连接中断";
      const audioCleared = value.audioToggleChecked ? value.audio === "未接收" : value.audio === "未开启";
      return (reconnecting || logVisible) && countdownVisible && reconnectButtonVisible && surfaceCleared && clipboardButtonsDisabled && runtimeCleared && reversePolicyCleared && remoteCleared && audioCleared ? value : null;
    },
    args.timeoutMs,
    "Mac client reconnect scheduling",
  );
  print("OK", `Reconnect scheduled: ${reconnectingSnapshot.connection} · ${reconnectingSnapshot.remote} · ${reconnectingSnapshot.video}`);

  await waitFor(
    () => canBindPort(args.host, args.port),
    args.timeoutMs,
    "temporary Windows host port release",
  );
  const restartedHost = await startWindowsHost(args, repoRoot);
  if (args.testReconnectNow) {
    await clickElement(session, "#reconnectNowButton");
    const reconnectNowSnapshot = await waitFor(
      async () => {
        const value = await evaluate(session, buildSnapshotExpression());
        const clicked = value.logs.some((line) => line.includes("立即重连"));
        const reconnectStartedOrRestored = value.connection.includes("重连") || value.connection.includes("已连接");
        return clicked && value.reconnectNowHidden && reconnectStartedOrRestored ? value : null;
      },
      args.timeoutMs,
      "Mac client reconnect-now click",
    );
    print("OK", `Reconnect now clicked: ${reconnectNowSnapshot.connection}`);
  }

  let lastReconnectSnapshot = null;
  let lastReconnectSessionAnswers = sessionAnswersBefore;
  print("INFO", `Reconnect restore waiting: timeout=${formatSeconds(args.timeoutMs)}, progressEvery=${progressEveryText(args)}.`);
  const reconnectedSnapshot = await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      lastReconnectSnapshot = value;
      const sessionAnswers = await evaluate(
        session,
        `(() => (window.__lanDualReceivedMessages || []).filter((message) => message.type === "session_answer").length)()`,
      );
      lastReconnectSessionAnswers = Number(sessionAnswers);
      const connected = value.connection.includes("已连接");
      const hasNewSession = Number(sessionAnswers) > Number(sessionAnswersBefore);
      const hasVideo = value.surfaceVisible && value.surfaceHasFrame;
      return connected && hasNewSession && hasVideo ? { ...value, sessionAnswers } : null;
    },
    args.timeoutMs,
    "Mac client reconnect restore",
    {
      progressIntervalMs: args.progressIntervalMs,
      onProgress: ({ startedAt, deadline }) => {
        const snapshot = lastReconnectSnapshot || {};
        const hasVideo = Boolean(snapshot.surfaceVisible && snapshot.surfaceHasFrame);
        const sessions = `${lastReconnectSessionAnswers} (before=${sessionAnswersBefore})`;
        printTimedProgress(
          "Reconnect restore progress",
          startedAt,
          deadline,
          `connection=${snapshot.connection || "?"} · remote=${snapshot.remote || "?"} · sessions=${sessions} · video=${hasVideo ? "yes" : "no"}`,
        );
      },
    },
  );
  const restoreMs = Date.now() - restoreStartedAt;
  requireWithinDuration("Mac client reconnect restore", restoreMs, args.maxReconnectRestoreMs);
  print(
    "OK",
    `Reconnect restored: ${reconnectedSnapshot.connection} · sessions=${reconnectedSnapshot.sessionAnswers} · ${restoreMs}ms`,
  );
  assertTemporaryRuntimeDiagnostics(reconnectedSnapshot, args, "Mac client reconnect");
  return restartedHost;
}

async function verifyMacClientLogExport({ args, session }) {
  const result = await evaluate(
    session,
    `(() => {
      if (typeof buildLogExportText !== "function" || typeof scheduleReconnect !== "function") {
        throw new Error("Mac client log export helpers are not available");
      }
      const previous = {
        connect,
        connectionStatus: elements.connectionStatus.textContent,
        connectButtonDisabled: elements.connectButton.disabled,
        disconnectButtonDisabled: elements.disconnectButton.disabled,
        reconnectNowHidden: elements.reconnectNowButton.hidden,
        reconnectNowDisabled: elements.reconnectNowButton.disabled,
        eventLogHtml: elements.eventLog.innerHTML,
        logEntries: state.logEntries.slice(),
        reconnectTimer: state.reconnectTimer,
        reconnectCountdownTimer: state.reconnectCountdownTimer,
        reconnectNextAt: state.reconnectNextAt,
        reconnectReason: state.reconnectReason,
        reconnectAttempts: state.reconnectAttempts,
        reconnectTotal: state.reconnectTotal,
        manualDisconnect: state.manualDisconnect,
      };
      try {
        if (state.reconnectTimer) window.clearTimeout(state.reconnectTimer);
        if (state.reconnectCountdownTimer) window.clearInterval(state.reconnectCountdownTimer);
        state.reconnectTimer = null;
        state.reconnectCountdownTimer = null;
        state.reconnectNextAt = 0;
        state.reconnectReason = "";
        state.reconnectAttempts = 0;
        state.reconnectTotal = 0;
        state.manualDisconnect = false;
        connect = async () => {
          window.__lanDualLogExportConnectStubbed = true;
        };
        scheduleReconnect("测试断线");
        const text = buildLogExportText();
        const required = [
          "LAN Dual Control Mac 控制端日志",
          "- 当前状态：",
          "- 目标地址：${args.host}:${args.port}",
          "- 手工清单：",
          "- 重连状态：等待自动重连（1/3",
          "- 重连原因：测试断线",
          "- 下次重连：",
          "- 远端运行：",
          "- 密码安全：",
          "- 反控策略：",
          "- 视频状态：",
          "- 文本剪贴板：",
          "事件记录",
        ];
        const missing = required.filter((item) => !text.includes(item));
        const forbidden = [
          ${JSON.stringify(args.clientPassword || "")},
          "password",
          "密码：",
        ].filter((item) => item && text.toLowerCase().includes(String(item).toLowerCase()));
        return {
          ok: missing.length === 0 && forbidden.length === 0,
          missing,
          forbidden,
          hasDownloadButton: Boolean(elements.exportLogButton),
          hasCopyButton: Boolean(elements.copyLogButton),
          copyLogButtonDisabled: elements.copyLogButton?.disabled || false,
          exportLogButtonDisabled: elements.exportLogButton?.disabled || false,
          preview: text.split("\\n").slice(0, 16).join("\\n"),
        };
      } finally {
        if (state.reconnectTimer) window.clearTimeout(state.reconnectTimer);
        if (state.reconnectCountdownTimer) window.clearInterval(state.reconnectCountdownTimer);
        connect = previous.connect;
        state.reconnectTimer = null;
        state.reconnectCountdownTimer = null;
        state.reconnectNextAt = previous.reconnectNextAt;
        state.reconnectReason = previous.reconnectReason;
        state.reconnectAttempts = previous.reconnectAttempts;
        state.reconnectTotal = previous.reconnectTotal;
        state.manualDisconnect = previous.manualDisconnect;
        elements.eventLog.innerHTML = previous.eventLogHtml;
        state.logEntries = previous.logEntries;
        elements.connectButton.disabled = previous.connectButtonDisabled;
        elements.disconnectButton.disabled = previous.disconnectButtonDisabled;
        setConnectionStatus(previous.connectionStatus);
        renderReconnectCountdown();
        renderSessionDiagnostics();
        setReconnectNowVisible(Boolean(state.reconnectTimer));
        if (!state.reconnectTimer) {
          elements.reconnectNowButton.hidden = previous.reconnectNowHidden;
          elements.reconnectNowButton.disabled = previous.reconnectNowDisabled;
        }
      }
    })()`,
  );

  if (!result?.hasDownloadButton) {
    throw new Error("Mac client log export button is missing");
  }
  if (!result?.hasCopyButton) {
    throw new Error("Mac client copy diagnostics button is missing");
  }
  if (result.copyLogButtonDisabled) {
    throw new Error("Mac client copy diagnostics button is disabled");
  }
  if (result.exportLogButtonDisabled) {
    throw new Error("Mac client log export button is disabled");
  }
  if (!result.ok) {
    throw new Error(`Mac client log export mismatch: ${JSON.stringify(result)}`);
  }
  print("OK", `Log export snapshot: ${compactProgressText(result.preview, 140)}`);

  const initialInputEvents = Number(await evaluate(
    session,
    `(() => (window.__lanDualSentMessages || []).filter((message) => message.type === "input_event").length)()`,
  )) || 0;
  await clickElement(session, "#copyLogButton");
  const copiedSnapshot = await waitForPageSnapshot({
    args,
    session,
    label: "Mac client copy diagnostics",
    check: async (value) => (
      value.logCopyStatus.includes("诊断已复制") &&
      value.copyLogButtonDisabled === false &&
      Number(value.inputEvents) === initialInputEvents
        ? value
        : null
    ),
  });
  const copiedText = await evaluate(session, "navigator.clipboard.readText()");
  const requiredCopied = [
    "LAN Dual Control Mac 控制端日志",
    "连接状态",
    "手工清单",
    "密码安全",
    "显示与媒体",
    "输入与剪贴板",
    "事件记录",
  ];
  const missingCopied = requiredCopied.filter((item) => !copiedText.includes(item));
  const forbiddenCopied = [
    args.clientPassword || "",
    "password",
    "密码：",
  ].filter((item) => item && copiedText.toLowerCase().includes(String(item).toLowerCase()));
  if (missingCopied.length || forbiddenCopied.length) {
    throw new Error(`Mac client copied diagnostics mismatch: ${JSON.stringify({
      missingCopied,
      forbiddenCopied,
      preview: copiedText.slice(0, 240),
    })}`);
  }
  print("OK", `Copy diagnostics: ${copiedSnapshot.logCopyStatus}`);
}

async function observeMacClientVideo({ args, session, label = "Video observe" }) {
  const shouldObserve =
    args.observeVideoMs > 0 ||
    args.minObservedVideoFrames > 0 ||
    args.minObservedVideoFps > 0;
  if (!shouldObserve) return null;

  const durationMs = args.observeVideoMs > 0 ? args.observeVideoMs : 1000;
  const start = await evaluate(
    session,
    `(() => ({
      at: performance.now(),
      frames: Number(window.__lanDualCounters?.videoFrames || 0),
    }))()`,
  );
  const startedAt = Date.now();
  const deadline = startedAt + durationMs;
  let nextProgressAt = args.progressIntervalMs > 0 ? startedAt + args.progressIntervalMs : 0;
  print("INFO", `${label} started: target=${formatSeconds(durationMs)}, progressEvery=${progressEveryText(args)}.`);
  while (Date.now() < deadline) {
    const now = Date.now();
    const nextWake = nextProgressAt > 0 ? Math.min(deadline, Math.max(now + 1, nextProgressAt)) : deadline;
    await delay(Math.max(1, Math.min(250, nextWake - now)));
    if (nextProgressAt > 0 && Date.now() >= nextProgressAt && Date.now() < deadline) {
      const current = await evaluate(
        session,
        `(() => ({
          at: performance.now(),
          frames: Number(window.__lanDualCounters?.videoFrames || 0),
        }))()`,
      );
      const elapsedMs = Math.max(1, Math.round(current.at - start.at));
      const frames = Math.max(0, Number(current.frames) - Number(start.frames));
      const fps = frames / (elapsedMs / 1000);
      printTimedProgress(label, startedAt, deadline, `${frames} frames · ${fps.toFixed(1)} fps`);
      do {
        nextProgressAt += args.progressIntervalMs;
      } while (nextProgressAt <= Date.now());
    }
  }
  const end = await evaluate(
    session,
    `(() => ({
      at: performance.now(),
      frames: Number(window.__lanDualCounters?.videoFrames || 0),
    }))()`,
  );

  const elapsedMs = Math.max(1, Math.round(end.at - start.at));
  const frames = Math.max(0, Number(end.frames) - Number(start.frames));
  const fps = frames / (elapsedMs / 1000);
  if (args.minObservedVideoFrames > 0 && frames < args.minObservedVideoFrames) {
    throw new Error(`Mac client observed ${frames} video frames, expected >= ${args.minObservedVideoFrames}`);
  }
  if (args.minObservedVideoFps > 0 && fps < args.minObservedVideoFps) {
    throw new Error(`Mac client observed ${fps.toFixed(1)} video FPS, expected >= ${args.minObservedVideoFps}`);
  }
  print("OK", `${label}: ${frames} frames / ${elapsedMs}ms / ${fps.toFixed(1)} fps`);
  return { frames, elapsedMs, fps };
}

function buildSnapshotExpression() {
  return `(() => {
    const text = (selector) => document.querySelector(selector)?.textContent || "";
    const image = document.querySelector("#remoteImage");
    const canvas = document.querySelector("#remoteCanvas");
    const imageVisible = image?.classList.contains("is-visible") || false;
    const canvasVisible = canvas?.classList.contains("is-visible") || false;
    const canvasHasFrame = Boolean(canvas?.width && canvas?.height);
    const logs = [...document.querySelectorAll("#eventLog li")]
      .slice(0, 10)
      .map((item) => item.innerText.replace(/\\s+/g, " "));
    return {
      connection: text("#connectionStatus"),
      remote: text("#remoteStatus"),
      video: text("#videoStatus"),
      audio: text("#audioStatus"),
      audioPlayback: text("#audioPlaybackStatus"),
      firstVideoMetric: text("#firstVideoMetric"),
      videoFlowMetric: text("#videoFlowMetric"),
      audioFlowMetric: text("#audioFlowMetric"),
      reconnectMetric: text("#reconnectMetric"),
      manualChecklist: text("#manualChecklistMetric"),
      remoteRuntime: text("#remoteRuntimeMetric"),
      reversePolicy: text("#reversePolicyMetric"),
      reverseControlStatus: text("#reverseControlStatus"),
      reverseControlHint: text("#reverseControlHint"),
      reverseControlGrantCommand: text("#reverseControlGrantCommand"),
      reverseControlGrantCommandHidden: document.querySelector("#reverseControlGrantCommand")?.hidden ?? true,
      reverseControlGrantFallbackCommand: text("#reverseControlGrantFallbackCommand"),
      reverseControlGrantFallbackCommandHidden: document.querySelector("#reverseControlGrantFallbackCommand")?.hidden ?? true,
      reverseControlGrantCopyButtonHidden: document.querySelector("#copyReverseControlGrantCommandButton")?.hidden ?? true,
      reverseControlGrantCopyButtonDisabled: document.querySelector("#copyReverseControlGrantCommandButton")?.disabled ?? true,
      reverseControlGrantFallbackCopyButtonHidden: document.querySelector("#copyReverseControlGrantFallbackCommandButton")?.hidden ?? true,
      reverseControlGrantFallbackCopyButtonDisabled: document.querySelector("#copyReverseControlGrantFallbackCommandButton")?.disabled ?? true,
      reverseControlGrantCopyStatus: text("#reverseControlGrantCopyStatus"),
      reverseControlButtonText: text("#reverseControlButton"),
      reverseControlButtonDisabled: document.querySelector("#reverseControlButton")?.disabled || false,
      reverseControlRequests: (window.__lanDualSentMessages || [])
        .filter((message) => message.type === "reverse_control_request").length,
      inputEvents: (window.__lanDualSentMessages || [])
        .filter((message) => message.type === "input_event").length,
      latestReverseControlRequest: (() => {
        const request = [...(window.__lanDualSentMessages || [])]
          .reverse()
          .find((message) => message.type === "reverse_control_request");
        if (!request) return null;
        return {
          requestId: request.requestId || "",
          from: request.from || "",
          clientPlatform: request.clientPlatform || "",
          hasPassword: Object.prototype.hasOwnProperty.call(request, "password"),
          keys: Object.keys(request).sort(),
        };
      })(),
      latestReverseControlResponse: (() => {
        const response = [...(window.__lanDualReceivedMessages || [])]
          .reverse()
          .find((message) => message.type === "reverse_control_response");
        if (!response) return null;
        return {
          requestId: response.requestId || "",
          accepted: response.accepted === true,
          code: response.code || "",
          reason: response.reason || "",
          reverseControlMode: response.reverseControlMode || "",
          reverseControlState: response.reverseControlState || "",
          reverseControlGrant: response.reverseControlGrant || "",
        };
      })(),
      lastVideoFrame: (() => {
        const frame = [...(window.__lanDualReceivedMessages || [])].reverse().find((message) => message.type === "video_frame");
        if (!frame) return null;
        return {
          frameId: frame.frameId || 0,
          codec: frame.codec || "",
          encoding: frame.encoding || "",
          videoTransport: frame.videoTransport || "",
          h264Level: frame.h264Level || "",
          width: frame.width || 0,
          height: frame.height || 0,
          capturePipeline: frame.capturePipeline || "",
          keyFrame: frame.keyFrame === true,
          timestamp: frame.timestamp || "",
          binaryPayloadBytes: frame.binaryPayloadBytes || frame.payloadBytes || 0,
        };
      })(),
      lastVideoFrameAgeMs: (() => {
        const frame = [...(window.__lanDualReceivedMessages || [])].reverse().find((message) => message.type === "video_frame");
        if (!frame?.timestamp) return null;
        const parsed = Date.parse(String(frame.timestamp));
        if (Number.isNaN(parsed)) return null;
        return Math.round(Date.now() - parsed);
      })(),
      repeatSignalVideoFrames: (window.__lanDualReceivedMessages || [])
        .filter((message) => message.type === "video_frame" && message.repeatPreviousFrame === true).length,
      binaryVideoFrames: Number(window.__lanDualCounters?.binaryVideoFrames || 0),
      binaryH264VideoFrames: Number(window.__lanDualCounters?.binaryH264VideoFrames || 0),
      audioToggleChecked: document.querySelector("#audioToggle")?.checked || false,
      audioPlayedFrames: Number((text("#audioStatus").match(/播放\\s*(\\d+)/) || [])[1] || 0),
      audioFrameCount: (window.__lanDualReceivedMessages || []).filter((message) => message.type === "audio_frame").length,
      audioFrameMs: (() => {
        const timings = window.__lanDualTimings || {};
        if (!timings.connectClickedAt || !timings.firstAudioFrameAt) return 0;
        return Math.round(timings.firstAudioFrameAt - timings.connectClickedAt);
      })(),
      lastAudioFrameAgeMs: (() => {
        const frame = [...(window.__lanDualReceivedMessages || [])].reverse().find((message) => message.type === "audio_frame");
        if (!frame?.timestamp) return null;
        const parsed = Date.parse(String(frame.timestamp));
        if (Number.isNaN(parsed)) return null;
        return Math.round(Date.now() - parsed);
      })(),
      audioPlaybackMs: (() => {
        const timings = window.__lanDualTimings || {};
        const playedFrames = Number((text("#audioStatus").match(/播放\\s*(\\d+)/) || [])[1] || 0);
        if (!timings.connectClickedAt || playedFrames <= 0) return 0;
        return Math.round(performance.now() - timings.connectClickedAt);
      })(),
      lastAudioFrame: (() => {
        const frame = [...(window.__lanDualReceivedMessages || [])].reverse().find((message) => message.type === "audio_frame");
        if (!frame) return null;
        const payload = frame.payload || frame.data || frame.samples || frame.audioData || "";
        return {
          codec: frame.codec || "",
          encoding: frame.encoding || "",
          audioMode: frame.audioMode || frame.source || "",
          sampleRate: frame.sampleRate || 0,
          channels: frame.channels || 0,
          payloadBytes: frame.payloadBytes || frame.bytes || 0,
          payloadLength: String(payload).length,
          timestamp: frame.timestamp || "",
        };
      })(),
      input: text("#inputStatus"),
      discoverButtonDisabled: document.querySelector("#discoverButton")?.disabled || false,
      discoverButtonText: document.querySelector("#discoverButton")?.textContent || "",
      connectButtonDisabled: document.querySelector("#connectButton")?.disabled || false,
      reconnectNowHidden: document.querySelector("#reconnectNowButton")?.hidden !== false,
      reconnectNowDisabled: document.querySelector("#reconnectNowButton")?.disabled !== false,
      passwordSafety: text("#passwordSafetyStatus"),
      copyLogButtonDisabled: document.querySelector("#copyLogButton")?.disabled || false,
      logCopyStatus: text("#logCopyStatus"),
      exportLogButtonDisabled: document.querySelector("#exportLogButton")?.disabled || false,
      disconnectButtonDisabled: document.querySelector("#disconnectButton")?.disabled || false,
      sendClipboardButtonDisabled: document.querySelector("#sendClipboardButton")?.disabled || false,
      sendClipboardFilesButtonDisabled: document.querySelector("#sendClipboardFilesButton")?.disabled || false,
      sendClipboardFilesButtonText: document.querySelector("#sendClipboardFilesButton")?.textContent || "",
      clipboard: text("#clipboardStatus"),
      localClipboard: text("#localClipboardStatus"),
      fileClipboard: text("#fileClipboardStatus"),
      clipboardFileCount: document.querySelector("#clipboardFileInput")?.files?.length || 0,
      recentConnection: text("#recentConnectionStatus"),
      displaySettings: text("#displaySettingsStatus"),
      qualityPreset: document.querySelector("#qualityPresetSelect")?.value || "",
      resolution: document.querySelector("#resolutionSelect")?.value || "",
      fps: document.querySelector("#fpsSelect")?.value || "",
      bandwidth: document.querySelector("#bandwidthSelect")?.value || "",
      recentConnectionValue: document.querySelector("#recentConnectionSelect")?.value || "",
      recentConnectionDisabled: document.querySelector("#recentConnectionSelect")?.disabled || false,
      clearRecentConnectionsDisabled: document.querySelector("#clearRecentConnectionsButton")?.disabled || false,
      recentConnectionOptions: [...document.querySelectorAll("#recentConnectionSelect option")]
        .map((option) => ({ value: option.value, text: option.textContent || "" })),
      recentConnectionStorage: localStorage.getItem("lanDualMacClientRecentConnections") || "",
      clipboardTextValue: document.querySelector("#clipboardTextInput")?.value || "",
      supportsWebCodecsH264: typeof window.VideoDecoder === "function" && typeof window.EncodedVideoChunk === "function",
      imageVisible,
      imageHasSource: Boolean(image?.getAttribute("src")),
      canvasVisible,
      canvasHasFrame,
      surfaceVisible: imageVisible || canvasVisible,
      surfaceHasFrame: Boolean(image?.getAttribute("src")) || canvasHasFrame,
      logs,
    };
  })()`;
}

function assertTemporaryRuntimeDiagnostics(snapshot, args, label) {
  if (args.useExistingHost) {
    return;
  }
  const text = snapshot.remoteRuntime || "";
  if (!text.includes("PID ") || !text.includes(`build ${temporaryWindowsHostBuildId}`)) {
    throw new Error(`${label} runtime diagnostics missing: ${JSON.stringify({
      remoteRuntime: snapshot.remoteRuntime,
      remote: snapshot.remote,
    })}`);
  }
}

function assertTemporaryReversePolicyDiagnostics(snapshot, args, label) {
  if (args.useExistingHost) {
    return;
  }
  const text = snapshot.reversePolicy || "";
  if (!text.includes("默认拒绝") || !text.includes("需要 Windows 用户确认")) {
    throw new Error(`${label} reverse policy diagnostics missing: ${JSON.stringify({
      reversePolicy: snapshot.reversePolicy,
      remote: snapshot.remote,
    })}`);
  }
}

async function assertReversePolicyFormatterVariants(session) {
  const result = await evaluate(
    session,
    `(() => {
      if (typeof formatReversePolicyDiagnostics !== "function") {
        throw new Error("Mac client reverse policy formatter is not available");
      }
      return {
        flatDeny: formatReversePolicyDiagnostics({
          reverseControl: true,
          reverseControlMode: "deny",
          reverseControlPolicy: { requiresConfirmation: true, autoAccept: false, supported: true },
        }),
        objectAccept: formatReversePolicyDiagnostics({
          reverseControl: {
            supported: true,
            mode: "accept",
            autoAccept: true,
            requiresConfirmation: false,
            policy: { mode: "accept", autoAccept: true, supported: true },
          },
        }),
        disabled: formatReversePolicyDiagnostics({
          reverseControl: false,
          reverseControlMode: "disabled",
          reverseControlPolicy: { supported: false },
        }),
        temporaryGrant: formatReversePolicyDiagnostics({
          reverseControl: true,
          reverseControlMode: "deny",
          reverseControlPolicy: { requiresConfirmation: true, autoAccept: false, supported: true },
          reverseControlGrant: {
            active: true,
            oneTime: true,
            remainingMs: 30000,
          },
        }),
        pendingRequest: formatReversePolicyDiagnostics({
          reverseControl: true,
          reverseControlMode: "deny",
          reverseControlPolicy: { requiresConfirmation: true, autoAccept: false, supported: true },
          reverseControlGrant: {
            active: false,
            oneTime: true,
            remainingMs: 0,
            lastRequest: {
              active: true,
              status: "rejected_needs_grant",
              requestId: "reverse-request-test",
              requester: "Mac client",
              reason: "confirmation required",
              ageMs: 23000,
            },
          },
        }),
        missing: formatReversePolicyDiagnostics({ screen: { capturePipeline: "mock" } }),
      };
    })()`,
  );
  const mismatches = [];
  if (!result.flatDeny?.includes("默认拒绝") || !result.flatDeny?.includes("需要 Windows 用户确认")) {
    mismatches.push(["flatDeny", result.flatDeny]);
  }
  if (!result.objectAccept?.includes("实验自动同意") || !result.objectAccept?.includes("仅可信局域网实验")) {
    mismatches.push(["objectAccept", result.objectAccept]);
  }
  if (!result.disabled?.includes("未启用") || !result.disabled?.includes("不可请求反控")) {
    mismatches.push(["disabled", result.disabled]);
  }
  if (!result.temporaryGrant?.includes("Windows 已临时允许一次") || !result.temporaryGrant?.includes("30 秒内重试")) {
    mismatches.push(["temporaryGrant", result.temporaryGrant]);
  }
  if (!result.pendingRequest?.includes("Windows 已收到请求") || !result.pendingRequest?.includes("23 秒前") || !result.pendingRequest?.includes("临时允许后重试")) {
    mismatches.push(["pendingRequest", result.pendingRequest]);
  }
  if (result.missing !== "未提供") {
    mismatches.push(["missing", result.missing]);
  }
  if (mismatches.length > 0) {
    throw new Error(`Mac client reverse policy formatter variants mismatch: ${JSON.stringify(mismatches)}`);
  }
  print("OK", `Reverse policy formatter variants: ${result.flatDeny} / ${result.objectAccept} / ${result.disabled} / ${result.temporaryGrant} / ${result.pendingRequest}`);
}

async function verifyMacClientReverseControlRequest({ args, session }) {
  if (args.useExistingHost) {
    print("INFO", "Reverse control request click test skipped for existing host.");
    return;
  }

  const beforeSnapshot = await evaluate(session, buildSnapshotExpression());
  if (beforeSnapshot.reverseControlButtonDisabled || !beforeSnapshot.reverseControlStatus.includes("默认安全拒绝")) {
    throw new Error(`Mac client reverse request button is not ready: ${JSON.stringify({
      status: beforeSnapshot.reverseControlStatus,
      button: beforeSnapshot.reverseControlButtonText,
      disabled: beforeSnapshot.reverseControlButtonDisabled,
      reversePolicy: beforeSnapshot.reversePolicy,
    })}`);
  }

  const initialInputEvents = Number(beforeSnapshot.inputEvents) || 0;
  await clickElement(session, "#reverseControlButton");
  const rejectedSnapshot = await waitForPageSnapshot({
    args,
    session,
    label: "Mac client reverse control denied response",
    check: async (value) => {
      const latestRequest = value.latestReverseControlRequest || {};
      const latestResponse = value.latestReverseControlResponse || {};
      const requestOk = value.reverseControlRequests === 1 &&
        latestRequest.requestId &&
        latestRequest.from === "Mac client" &&
        latestRequest.clientPlatform === "macos" &&
        latestRequest.hasPassword === false;
      const responseOk = latestResponse.accepted === false &&
        latestResponse.code === "LAN008" &&
        value.reverseControlStatus.includes("Windows 已安全拒绝") &&
        value.reverseControlStatus.includes("临时允许后重试") &&
        value.reverseControlHint.includes("Windows 已安全拒绝") &&
        value.reverseControlGrantCommand.includes("pwsh -NoProfile -ExecutionPolicy Bypass") &&
        value.reverseControlGrantCommand.includes("allow-windows-reverse-control.ps1") &&
        value.reverseControlGrantCommand.includes("-HostName 127.0.0.1") &&
        value.reverseControlGrantCommand.includes(`-Port ${args.port}`) &&
        value.reverseControlGrantCommand.includes("-Grant -DurationMs 30000 -BoardSummary") &&
        value.reverseControlGrantFallbackCommand.includes("allow-windows-reverse-control.mjs") &&
        value.reverseControlGrantFallbackCommand.includes("--host 127.0.0.1") &&
        value.reverseControlGrantFallbackCommand.includes(`--port ${args.port}`) &&
        value.reverseControlGrantFallbackCommand.includes("--grant --durationMs 30000 --boardSummary") &&
        value.reverseControlGrantCommandHidden === false &&
        value.reverseControlGrantFallbackCommandHidden === false &&
        value.reverseControlGrantCopyButtonHidden === false &&
        value.reverseControlGrantCopyButtonDisabled === false &&
        value.reverseControlGrantFallbackCopyButtonHidden === false &&
        value.reverseControlGrantFallbackCopyButtonDisabled === false &&
        value.reverseControlButtonText === "重试反控" &&
        value.reverseControlButtonDisabled === false;
      const noInputEvents = Number(value.inputEvents) === initialInputEvents;
      return requestOk && responseOk && noInputEvents ? value : null;
    },
  });
  print("OK", `Reverse request denied: ${rejectedSnapshot.reverseControlStatus}`);

  await clickElement(session, "#copyReverseControlGrantCommandButton");
  const copiedSnapshot = await waitForPageSnapshot({
    args,
    session,
    label: "Mac client reverse grant command copy",
    check: async (value) => (
      value.reverseControlGrantCopyStatus.includes("已复制") &&
      value.reverseControlRequests === 1 &&
      Number(value.inputEvents) === initialInputEvents
        ? value
        : null
    ),
  });
  const copiedCommand = await evaluate(session, "navigator.clipboard.readText()");
  if (!copiedCommand.includes("allow-windows-reverse-control.ps1") ||
      !copiedCommand.includes("-HostName 127.0.0.1") ||
      !copiedCommand.includes(`-Port ${args.port}`) ||
      !copiedCommand.includes("-Grant -DurationMs 30000 -BoardSummary") ||
      copiedCommand.includes("allow-windows-reverse-control.mjs")) {
    throw new Error(`Mac client copied unexpected reverse grant command: ${copiedCommand}`);
  }
  print("OK", `Reverse grant command copy: ${copiedSnapshot.reverseControlGrantCopyStatus}`);

  await clickElement(session, "#copyReverseControlGrantFallbackCommandButton");
  const copiedFallbackSnapshot = await waitForPageSnapshot({
    args,
    session,
    label: "Mac client reverse grant fallback command copy",
    check: async (value) => (
      value.reverseControlGrantCopyStatus.includes("已复制 Node 备用命令") &&
      value.reverseControlRequests === 1 &&
      Number(value.inputEvents) === initialInputEvents
        ? value
        : null
    ),
  });
  const copiedFallbackCommand = await evaluate(session, "navigator.clipboard.readText()");
  if (!copiedFallbackCommand.includes("allow-windows-reverse-control.mjs") ||
      !copiedFallbackCommand.includes("--host 127.0.0.1") ||
      !copiedFallbackCommand.includes(`--port ${args.port}`) ||
      !copiedFallbackCommand.includes("--grant --durationMs 30000 --boardSummary") ||
      copiedFallbackCommand.includes("allow-windows-reverse-control.ps1")) {
    throw new Error(`Mac client copied unexpected reverse grant fallback command: ${copiedFallbackCommand}`);
  }
  print("OK", `Reverse grant fallback command copy: ${copiedFallbackSnapshot.reverseControlGrantCopyStatus}`);

  await postJson(`http://${args.host}:${args.port}/reverse-control/grant`, { durationMs: 30000 });
  await clickElement(session, "#discoverButton");
  const grantSnapshot = await waitForPageSnapshot({
    args,
    session,
    label: "Mac client reverse control temporary grant visible",
    check: async (value) => (
      value.reversePolicy.includes("Windows 已临时允许一次") &&
      value.reverseControlStatus.includes("Windows 已临时允许一次") &&
      value.reverseControlHint.includes("Windows 已打开一次性授权窗口") &&
      value.reverseControlGrantCommand.includes(`-Port ${args.port}`) &&
      value.reverseControlGrantFallbackCommand.includes(`--port ${args.port}`) &&
      value.reverseControlGrantCommandHidden === false &&
      value.reverseControlGrantFallbackCommandHidden === false &&
      value.reverseControlGrantCopyButtonHidden === false &&
      value.reverseControlGrantCopyButtonDisabled === false &&
      value.reverseControlGrantFallbackCopyButtonHidden === false &&
      value.reverseControlGrantFallbackCopyButtonDisabled === false &&
      value.reverseControlButtonText === "重试反控" &&
      value.reverseControlButtonDisabled === false
        ? value
        : null
    ),
  });
  print("OK", `Reverse temporary grant: ${grantSnapshot.reversePolicy}`);

  await clickElement(session, "#reverseControlButton");
  const acceptedSnapshot = await waitForPageSnapshot({
    args,
    session,
    label: "Mac client reverse control accepted response",
    check: async (value) => {
      const latestRequest = value.latestReverseControlRequest || {};
      const latestResponse = value.latestReverseControlResponse || {};
      const requestOk = value.reverseControlRequests === 2 &&
        latestRequest.requestId &&
        latestRequest.from === "Mac client" &&
        latestRequest.hasPassword === false;
      const responseOk = latestResponse.accepted === true &&
        latestResponse.reverseControlGrant === "consumed" &&
        value.reverseControlStatus.includes("Windows 已同意") &&
        value.reverseControlStatus.includes("临时授权已使用") &&
        value.reverseControlHint.includes("Windows 已同意") &&
        value.reverseControlHint.includes("无需再次运行授权命令") &&
        value.reverseControlGrantCommandHidden === true &&
        value.reverseControlGrantFallbackCommandHidden === true &&
        value.reverseControlGrantCopyButtonHidden === true &&
        value.reverseControlGrantFallbackCopyButtonHidden === true &&
        value.reverseControlButtonDisabled === false;
      const noInputEvents = Number(value.inputEvents) === initialInputEvents;
      return requestOk && responseOk && noInputEvents ? value : null;
    },
  });
  print("OK", `Reverse request accepted: ${acceptedSnapshot.reverseControlStatus}`);
}

function installWebSocketSendRecorderExpression() {
  return `(() => {
    window.__lanDualSentMessages = [];
    window.__lanDualReceivedMessages = [];
    window.__lanDualLastReceivedByType = {};
    window.__lanDualCounters = {
      videoFrames: 0,
      audioFrames: 0,
      binaryVideoFrames: 0,
      binaryH264VideoFrames: 0,
    };
    window.__lanDualTimings = {
      installedAt: performance.now(),
      connectClickedAt: 0,
      firstAudioFrameAt: 0,
    };
    if (window.__lanDualWebSocketSendHooked) return true;
    const OriginalWebSocket = window.WebSocket;
    const binaryVideoMagic = [76, 68, 67, 86, 49, 10];
    const rememberReceivedMessage = (parsed) => {
      window.__lanDualReceivedMessages.push(parsed);
      if (parsed?.type) {
        window.__lanDualLastReceivedByType[parsed.type] = parsed;
      }
      if (parsed.type === "video_frame") {
        window.__lanDualCounters.videoFrames += 1;
        if (String(parsed.encoding || "").toLowerCase() === "binary-jpeg" || parsed.binaryPayloadBytes > 0) {
          window.__lanDualCounters.binaryVideoFrames += 1;
        }
        if (
          String(parsed.videoTransport || "").toLowerCase() === "binary-h264" ||
          String(parsed.encoding || "").toLowerCase() === "annexb-binary"
        ) {
          window.__lanDualCounters.binaryH264VideoFrames += 1;
        }
      }
      if (parsed.type === "audio_frame") {
        window.__lanDualCounters.audioFrames += 1;
      }
      if (parsed.type === "audio_frame" && !window.__lanDualTimings?.firstAudioFrameAt) {
        window.__lanDualTimings.firstAudioFrameAt = performance.now();
      }
      if (window.__lanDualReceivedMessages.length > 400) {
        window.__lanDualReceivedMessages.shift();
      }
    };
    const parseBinaryMessage = async (data) => {
      const arrayBuffer = data instanceof ArrayBuffer
        ? data
        : data instanceof Blob
          ? await data.arrayBuffer()
          : data?.buffer instanceof ArrayBuffer
            ? data.buffer.slice(data.byteOffset || 0, (data.byteOffset || 0) + data.byteLength)
            : null;
      if (!arrayBuffer) {
        throw new Error("unsupported binary message");
      }
      const bytes = new Uint8Array(arrayBuffer);
      if (bytes.length < binaryVideoMagic.length + 4) {
        throw new Error("binary message too small");
      }
      for (let index = 0; index < binaryVideoMagic.length; index += 1) {
        if (bytes[index] !== binaryVideoMagic[index]) {
          throw new Error("unknown binary magic");
        }
      }
      const headerLength = new DataView(arrayBuffer).getUint32(binaryVideoMagic.length);
      const headerStart = binaryVideoMagic.length + 4;
      const payloadStart = headerStart + headerLength;
      if (headerLength <= 0 || payloadStart > bytes.length) {
        throw new Error("invalid binary header length");
      }
      const parsed = JSON.parse(new TextDecoder().decode(bytes.slice(headerStart, payloadStart)));
      const payloadBytes = bytes.length - payloadStart;
      return {
        ...parsed,
        encoding: parsed.encoding || parsed.videoTransport || "binary-jpeg",
        videoTransport: parsed.videoTransport || "binary-jpeg",
        binaryPayloadBytes: payloadBytes,
        payloadBytes: Number(parsed.payloadBytes) || payloadBytes,
      };
    };
    function RecordingWebSocket(...args) {
      const socket = new OriginalWebSocket(...args);
      window.__lanDualLastSocket = socket;
      const originalSend = socket.send.bind(socket);
      socket.addEventListener("message", (event) => {
        if (typeof event.data === "string") {
          try {
            rememberReceivedMessage(JSON.parse(event.data));
          } catch {
            window.__lanDualReceivedMessages.push({ raw: String(event.data) });
          }
          return;
        }
        parseBinaryMessage(event.data)
          .then((parsed) => rememberReceivedMessage(parsed))
          .catch((error) => window.__lanDualReceivedMessages.push({ raw: "[binary]", error: error?.message || "" }));
      });
      socket.send = (data) => {
        try {
          const parsed = JSON.parse(String(data));
          window.__lanDualSentMessages.push(parsed);
          if (window.__lanDualSentMessages.length > 200) {
            window.__lanDualSentMessages.shift();
          }
        } catch {
          window.__lanDualSentMessages.push({ raw: String(data) });
        }
        return originalSend(data);
      };
      return socket;
    }
    Object.setPrototypeOf(RecordingWebSocket, OriginalWebSocket);
    RecordingWebSocket.prototype = OriginalWebSocket.prototype;
    RecordingWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    RecordingWebSocket.OPEN = OriginalWebSocket.OPEN;
    RecordingWebSocket.CLOSING = OriginalWebSocket.CLOSING;
    RecordingWebSocket.CLOSED = OriginalWebSocket.CLOSED;
    window.WebSocket = RecordingWebSocket;
    window.__lanDualWebSocketSendHooked = true;
    return true;
  })()`;
}

function matchesExpectedAuthFailure(snapshot, args) {
  if (!snapshot.connection.includes("认证失败")) {
    return false;
  }
  if (args.expectedAttemptsRemaining !== "" && !snapshot.connection.includes(`剩余 ${args.expectedAttemptsRemaining}`)) {
    return false;
  }
  if (args.expectedMaxAttempts !== "" && !snapshot.connection.includes(`/${args.expectedMaxAttempts} 次`)) {
    return false;
  }
  return true;
}

async function verifyMacClientDiscoverButton({ args, session }) {
  await clickElement(session, "#discoverButton");
  const discoveringSnapshot = await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      return value.remote === "发现中" &&
        value.discoverButtonDisabled &&
        value.discoverButtonText === "发现中"
        ? value
        : null;
    },
    args.timeoutMs,
    "Mac client discover button busy state",
  );
  const discoveredSnapshot = await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      const buttonReset = !value.discoverButtonDisabled && value.discoverButtonText === "发现";
      return buttonReset && value.remote !== "发现中" && value.remote !== "发现失败" ? value : null;
    },
    args.timeoutMs,
    "Mac client discover button reset",
  );
  assertTemporaryRuntimeDiagnostics(discoveredSnapshot, args, "Mac client discovery");
  print("OK", `Discover button: ${discoveringSnapshot.discoverButtonText} -> ${discoveredSnapshot.remote}`);
}

async function verifyMacClientConnectCancel({ args, session }) {
  await evaluate(
    session,
    `(() => {
      window.__lanDualSentMessages = [];
      window.__lanDualReceivedMessages = [];
      window.__lanDualLastReceivedByType = {};
      return true;
    })()`,
  );
  await clickElement(session, "#connectButton");
  await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      return value.connection === "连接中" && value.connectButtonDisabled && !value.disconnectButtonDisabled
        ? value
        : null;
    },
    args.timeoutMs,
    "Mac client cancellable connecting state",
  );
  await clickElement(session, "#disconnectButton");
  const canceledSnapshot = await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      const buttonsReset = !value.connectButtonDisabled && value.disconnectButtonDisabled;
      const surfaceCleared = value.video === "无画面" && !value.surfaceVisible && !value.surfaceHasFrame;
      const remoteReset = value.remote === "等待发现";
      return value.connection === "未连接" && buttonsReset && surfaceCleared && remoteReset
        ? value
        : null;
    },
    args.timeoutMs,
    "Mac client connecting cancel state",
  );
  const discoveryDelayMs = Number(await evaluate(session, "Number(window.__lanDualDiscoveryDelayMs || 0)"));
  await delay(Math.max(500, discoveryDelayMs + 250));
  const postCancelSnapshot = await evaluate(session, buildSnapshotExpression());
  const messages = await evaluate(
    session,
    `(() => ({
      sent: (window.__lanDualSentMessages || []).map((message) => message.type || "raw"),
      received: (window.__lanDualReceivedMessages || []).map((message) => message.type || "raw"),
    }))()`,
  );
  if (
    postCancelSnapshot.connection !== "未连接" ||
    postCancelSnapshot.connectButtonDisabled ||
    !postCancelSnapshot.disconnectButtonDisabled ||
    messages.sent.length > 0 ||
    messages.received.length > 0
  ) {
    throw new Error(`Mac client connect cancel leaked connection: ${JSON.stringify({ postCancelSnapshot, messages })}`);
  }
  print("OK", `Connect cancel: ${canceledSnapshot.connection} · no WebSocket messages`);
  await evaluate(
    session,
    `(() => {
      window.__lanDualSentMessages = [];
      window.__lanDualReceivedMessages = [];
      window.__lanDualLastReceivedByType = {};
      return true;
    })()`,
  );
}

async function verifyMacClientFileClipboardOversizedSelection({ args, session }) {
  await evaluate(
    session,
    `(() => {
      const input = document.querySelector("#clipboardFileInput");
      const dataTransfer = new DataTransfer();
      const oversizedBytes = 32 * 1024 * 1024 + 1;
      dataTransfer.items.add(new File(
        [new Blob([new ArrayBuffer(oversizedBytes)])],
        "mac-client-oversized-file.bin",
        { type: "application/octet-stream" },
      ));
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`,
  );
  const oversizedSnapshot = await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      return value.sendClipboardFilesButtonDisabled && value.fileClipboard.includes("文件过大") ? value : null;
    },
    args.timeoutMs,
    "Mac client oversized file clipboard disabled state",
  );
  print("OK", `File oversize guard: ${oversizedSnapshot.fileClipboard}`);
}

async function verifyMacClientFileClipboardRemoteUnavailableGuard({ args, session, uploadDir }) {
  const unavailablePath = join(uploadDir, `mac-client-file-unsupported-${Date.now()}.txt`);
  await writeFile(unavailablePath, "Mac client should not send files when the remote file clipboard is unavailable.\n", "utf8");

  await evaluate(
    session,
    `(() => {
      const socket = window.__lanDualLastSocket;
      if (!socket) throw new Error("missing recorded WebSocket");
      socket.dispatchEvent(new MessageEvent("message", {
        data: JSON.stringify({
          type: "session_answer",
          ok: true,
          width: 1920,
          height: 1080,
          hostMode: "windows-host-self-test",
          capabilities: {
            reverseControl: true,
            reverseControlMode: "deny",
            reverseControlPolicy: {
              supported: true,
              mode: "deny",
              requiresConfirmation: true,
              autoAccept: false,
            },
            clipboardText: true,
            clipboardTextMode: "system",
            clipboardFile: false,
            clipboardFileMode: "unsupported",
            clipboard: {
              text: true,
              textMode: "system",
              file: false,
              fileMode: "unsupported",
            },
          },
        }),
      }));
      window.__lanDualSentMessages = [];
      window.__lanDualReceivedMessages = [];
      window.__lanDualLastReceivedByType = {};
      return true;
    })()`,
  );

  await setFileInputFiles(session, "#clipboardFileInput", [unavailablePath]);
  const unavailableSnapshot = await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      return value.sendClipboardFilesButtonDisabled &&
        value.clipboardFileCount === 1 &&
        value.fileClipboard.includes("文件剪贴板不可用")
        ? value
        : null;
    },
    args.timeoutMs,
    "Mac client remote file clipboard unavailable guard",
  );

  await evaluate(
    session,
    `(() => {
      document.querySelector("#sendClipboardFilesButton").click();
      return true;
    })()`,
  );
  await delay(250);
  const leakedMessages = await evaluate(
    session,
    `(() => (window.__lanDualSentMessages || [])
      .filter((message) => String(message.type || "").startsWith("clipboard_file_")))()`,
  );
  if (leakedMessages.length) {
    throw new Error(`Mac client sent file clipboard messages despite unavailable remote capability: ${JSON.stringify(leakedMessages)}`);
  }
  await assertMacClientCopiedFileClipboardAdvice({
    args,
    session,
    expectedSnippets: ["对端文件剪贴板不可用", "检查 Windows 文件剪贴板能力"],
    label: "Mac client remote file clipboard unavailable copied advice",
  });

  await evaluate(
    session,
    `(() => {
      const socket = window.__lanDualLastSocket;
      if (!socket) throw new Error("missing recorded WebSocket");
      socket.dispatchEvent(new MessageEvent("message", {
        data: JSON.stringify({
          type: "session_answer",
          ok: true,
          width: 1920,
          height: 1080,
          hostMode: "windows-host-self-test",
          capabilities: {
            reverseControl: true,
            reverseControlMode: "deny",
            reverseControlPolicy: {
              supported: true,
              mode: "deny",
              requiresConfirmation: true,
              autoAccept: false,
            },
            clipboardText: true,
            clipboardTextMode: "system",
            clipboardFile: true,
            clipboardFileMode: "system",
            clipboard: {
              text: true,
              textMode: "system",
              file: true,
              fileMode: "system",
            },
          },
        }),
      }));
      const input = document.querySelector("#clipboardFileInput");
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`,
  );
  print("OK", `File remote capability guard: ${unavailableSnapshot.fileClipboard}`);
}

async function verifyMacClientFileClipboardRejectCancel({ args, session, uploadDir }) {
  const rejectPath = join(uploadDir, `mac-client-file-reject-${Date.now()}.txt`);
  const rejectText = [
    "LAN Dual Control Mac client file clipboard rejection self-test",
    "This file should stop sending after the synthetic host rejection.",
    "fedcba9876543210".repeat(12000),
    "",
  ].join("\n");
  await writeFile(rejectPath, rejectText, "utf8");

  await setFileInputFiles(session, "#clipboardFileInput", [rejectPath]);
  await evaluate(
    session,
    `(() => {
      window.__lanDualSentMessages = [];
      window.__lanDualReceivedMessages = [];
      window.__lanDualLastReceivedByType = {};
      window.__lanDualFileReadDelayMs = 650;
      if (!window.__lanDualOriginalBlobArrayBuffer) {
        window.__lanDualOriginalBlobArrayBuffer = Blob.prototype.arrayBuffer;
        Blob.prototype.arrayBuffer = async function(...args) {
          const delayMs = Number(window.__lanDualFileReadDelayMs || 0);
          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
          return window.__lanDualOriginalBlobArrayBuffer.apply(this, args);
        };
      }
      const input = document.querySelector("#clipboardFileInput");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelector("#sendClipboardFilesButton").click();
      return true;
    })()`,
  );
  const offerSnapshot = await waitFor(
    async () => {
      const value = await evaluate(
        session,
        `(() => {
          const offer = (window.__lanDualSentMessages || []).find((message) => message.type === "clipboard_file_offer");
          const snapshot = ${buildSnapshotExpression()};
          return offer ? { ...snapshot, transferId: offer.transferId } : null;
        })()`,
      );
      return value?.transferId && value.sendClipboardFilesButtonDisabled ? value : null;
    },
    args.timeoutMs,
    "Mac client file clipboard rejection offer",
  );
  await evaluate(
    session,
    `(() => {
      const socket = window.__lanDualLastSocket;
      if (!socket) throw new Error("missing recorded WebSocket");
      socket.dispatchEvent(new MessageEvent("message", {
        data: JSON.stringify({
          type: "clipboard_file_response",
          transferId: ${JSON.stringify(offerSnapshot.transferId)},
          accepted: false,
          reason: "self-test reject",
        }),
      }));
      return true;
    })()`,
  );
  const rejectedSnapshot = await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      return value.fileClipboard.includes("对端拒绝") && value.sendClipboardFilesButtonDisabled ? value : null;
    },
    args.timeoutMs,
    "Mac client file clipboard rejection cancel",
  );
  await evaluate(
    session,
    `(() => {
      const socket = window.__lanDualLastSocket;
      if (!socket) throw new Error("missing recorded WebSocket");
      for (const message of [
        {
          type: "clipboard_file_response",
          transferId: ${JSON.stringify(offerSnapshot.transferId)},
          accepted: true,
          saveMode: "temp",
        },
        {
          type: "clipboard_file_progress",
          transferId: ${JSON.stringify(offerSnapshot.transferId)},
          receivedBytes: 64,
          totalBytes: 128,
        },
        {
          type: "clipboard_file_result",
          transferId: ${JSON.stringify(offerSnapshot.transferId)},
          accepted: true,
          saveMode: "temp",
          receivedBytes: 128,
          totalBytes: 128,
        },
      ]) {
        socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
      }
      return true;
    })()`,
  );
  await delay(250);
  const staleSnapshot = await evaluate(session, buildSnapshotExpression());
  if (!staleSnapshot.fileClipboard.includes("对端拒绝")) {
    throw new Error(`Mac client stale file transfer response overwrote rejection: ${JSON.stringify(staleSnapshot)}`);
  }
  await delay(1000);
  const leakedComplete = await evaluate(
    session,
    `(() => (window.__lanDualSentMessages || [])
      .some((message) => message.type === "clipboard_file_complete"))()`,
  );
  await evaluate(session, "window.__lanDualFileReadDelayMs = 0");
  if (leakedComplete) {
    throw new Error("Mac client sent clipboard_file_complete after host rejected file offer");
  }
  print("OK", `File clipboard reject: ${rejectedSnapshot.fileClipboard}`);
}

async function assertMacClientCopiedFileClipboardAdvice({ args, session, expectedSnippets, label }) {
  const inputEventsBefore = Number(await evaluate(
    session,
    `(() => (window.__lanDualSentMessages || []).filter((message) => message.type === "input_event").length)()`,
  )) || 0;
  await clickElement(session, "#copyLogButton");
  await waitForPageSnapshot({
    args,
    session,
    label,
    check: async (value) => (
      value.logCopyStatus.includes("诊断已复制") &&
      value.copyLogButtonDisabled === false &&
      Number(value.inputEvents) === inputEventsBefore
        ? value
        : null
    ),
  });
  const copiedText = await evaluate(session, "navigator.clipboard.readText()");
  const required = ["文件发送建议", ...expectedSnippets];
  const missing = required.filter((item) => !copiedText.includes(item));
  const forbidden = [
    args.clientPassword || "",
    "password",
    "密码：",
  ].filter((item) => item && copiedText.toLowerCase().includes(String(item).toLowerCase()));
  if (missing.length || forbidden.length) {
    throw new Error(`Mac client copied file clipboard advice mismatch: ${JSON.stringify({
      label,
      missing,
      forbidden,
      preview: copiedText.slice(0, 360),
    })}`);
  }
  print("OK", `${label}: copied diagnostics include file clipboard advice`);
}

async function verifyMacClientFileClipboardResultFailureRetry({ args, session, uploadDir }) {
  const retryPath = join(uploadDir, `mac-client-file-retry-${Date.now()}.txt`);
  const retryText = [
    "LAN Dual Control Mac client file clipboard retry self-test",
    "This file should remain selected when the host reports a result failure.",
    `createdAt=${new Date().toISOString()}`,
    "",
  ].join("\n");
  await writeFile(retryPath, retryText, "utf8");

  await setFileInputFiles(session, "#clipboardFileInput", [retryPath]);
  await evaluate(
    session,
    `(() => {
      window.__lanDualSentMessages = [];
      window.__lanDualReceivedMessages = [];
      window.__lanDualLastReceivedByType = {};
      const socket = window.__lanDualLastSocket;
      if (!socket) throw new Error("missing recorded WebSocket");
      window.__lanDualSyntheticFileSend = socket.send;
      socket.send = (data) => {
        try {
          window.__lanDualSentMessages.push(JSON.parse(String(data)));
        } catch {
          window.__lanDualSentMessages.push({ raw: String(data) });
        }
      };
      const input = document.querySelector("#clipboardFileInput");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelector("#sendClipboardFilesButton").click();
      return true;
    })()`,
  );

  const failedTransfer = await waitFor(
    async () => {
      const value = await evaluate(
        session,
        `(() => {
          const messages = window.__lanDualSentMessages || [];
          const complete = messages.find((message) => message.type === "clipboard_file_complete");
          const offer = messages.find((message) => message.type === "clipboard_file_offer");
          const snapshot = ${buildSnapshotExpression()};
          return complete && offer ? { ...snapshot, transferId: complete.transferId, offerTransferId: offer.transferId } : null;
        })()`,
      );
      return value?.transferId && value.transferId === value.offerTransferId ? value : null;
    },
    args.timeoutMs,
    "Mac client file clipboard synthetic first send",
  );

  await evaluate(
    session,
    `(() => {
      const socket = window.__lanDualLastSocket;
      if (!socket) throw new Error("missing recorded WebSocket");
      socket.dispatchEvent(new MessageEvent("message", {
        data: JSON.stringify({
          type: "clipboard_file_result",
          transferId: ${JSON.stringify(failedTransfer.transferId)},
          accepted: false,
          code: "LAN011",
          reason: "offset mismatch; please resend",
          saveMode: "temp",
          receivedBytes: 64,
          totalBytes: 128,
        }),
      }));
      return true;
    })()`,
  );

  const retryReadySnapshot = await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      return value.fileClipboard.includes("LAN011") &&
        value.fileClipboard.includes("重新发送") &&
        value.clipboardFileCount === 1 &&
        !value.sendClipboardFilesButtonDisabled &&
        value.sendClipboardFilesButtonText.includes("重新发送")
        ? value
        : null;
    },
    args.timeoutMs,
    "Mac client file clipboard failed result retry state",
  );
  await assertMacClientCopiedFileClipboardAdvice({
    args,
    session,
    expectedSnippets: ["点击“重新发送”", "检查文件剪贴板能力"],
    label: "Mac client file clipboard failed result copied advice",
  });

  await evaluate(
    session,
    `(() => {
      window.__lanDualSentMessages = [];
      document.querySelector("#sendClipboardFilesButton").click();
      return true;
    })()`,
  );

  const retryTransfer = await waitFor(
    async () => {
      const value = await evaluate(
        session,
        `(() => {
          const messages = window.__lanDualSentMessages || [];
          const complete = messages.find((message) => message.type === "clipboard_file_complete");
          const offer = messages.find((message) => message.type === "clipboard_file_offer");
          const snapshot = ${buildSnapshotExpression()};
          return complete && offer ? { ...snapshot, transferId: complete.transferId, offerTransferId: offer.transferId } : null;
        })()`,
      );
      return value?.transferId && value.transferId === value.offerTransferId && value.transferId !== failedTransfer.transferId
        ? value
        : null;
    },
    args.timeoutMs,
    "Mac client file clipboard synthetic retry send",
  );

  await evaluate(
    session,
    `(() => {
      const socket = window.__lanDualLastSocket;
      if (!socket) throw new Error("missing recorded WebSocket");
      socket.dispatchEvent(new MessageEvent("message", {
        data: JSON.stringify({
          type: "clipboard_file_result",
          transferId: ${JSON.stringify(retryTransfer.transferId)},
          accepted: true,
          saveMode: "clipboard",
          receivedBytes: 128,
          totalBytes: 128,
        }),
      }));
      if (window.__lanDualSyntheticFileSend) {
        socket.send = window.__lanDualSyntheticFileSend;
        delete window.__lanDualSyntheticFileSend;
      }
      return true;
    })()`,
  );

  const successSnapshot = await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      return value.fileClipboard.includes("已写入") &&
        value.clipboardFileCount === 0 &&
        value.sendClipboardFilesButtonDisabled &&
        value.sendClipboardFilesButtonText.includes("发送文件")
        ? value
        : null;
    },
    args.timeoutMs,
    "Mac client file clipboard retry success state",
  );

  print("OK", `File clipboard retry after failed result: ${retryReadySnapshot.fileClipboard} -> ${successSnapshot.fileClipboard}`);
}

async function verifyMacClientFileClipboardResultTimeoutRetry({ args, session, uploadDir }) {
  const timeoutPath = join(uploadDir, `mac-client-file-timeout-${Date.now()}.txt`);
  const timeoutText = [
    "LAN Dual Control Mac client file clipboard timeout self-test",
    "This file should remain selected when the host never confirms the transfer result.",
    `createdAt=${new Date().toISOString()}`,
    "",
  ].join("\n");
  await writeFile(timeoutPath, timeoutText, "utf8");

  await setFileInputFiles(session, "#clipboardFileInput", [timeoutPath]);
  await evaluate(
    session,
    `(() => {
      window.__lanDualSentMessages = [];
      window.__lanDualReceivedMessages = [];
      window.__lanDualLastReceivedByType = {};
      const socket = window.__lanDualLastSocket;
      if (!socket) throw new Error("missing recorded WebSocket");
      window.__lanDualSyntheticFileSend = socket.send;
      socket.send = (data) => {
        try {
          window.__lanDualSentMessages.push(JSON.parse(String(data)));
        } catch {
          window.__lanDualSentMessages.push({ raw: String(data) });
        }
      };
      const input = document.querySelector("#clipboardFileInput");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelector("#sendClipboardFilesButton").click();
      return true;
    })()`,
  );

  const timedOutTransfer = await waitFor(
    async () => {
      const value = await evaluate(
        session,
        `(() => {
          const messages = window.__lanDualSentMessages || [];
          const complete = messages.find((message) => message.type === "clipboard_file_complete");
          const offer = messages.find((message) => message.type === "clipboard_file_offer");
          const snapshot = ${buildSnapshotExpression()};
          return complete && offer ? { ...snapshot, transferId: complete.transferId, offerTransferId: offer.transferId } : null;
        })()`,
      );
      return value?.transferId && value.transferId === value.offerTransferId ? value : null;
    },
    args.timeoutMs,
    "Mac client file clipboard synthetic timeout send",
  );

  const timeoutReadySnapshot = await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      return value.fileClipboard.includes("确认超时") &&
        value.fileClipboard.includes("重新发送") &&
        value.clipboardFileCount === 1 &&
        !value.sendClipboardFilesButtonDisabled &&
        value.sendClipboardFilesButtonText.includes("重新发送")
        ? value
        : null;
    },
    args.timeoutMs,
    "Mac client file clipboard timeout retry state",
  );
  await assertMacClientCopiedFileClipboardAdvice({
    args,
    session,
    expectedSnippets: ["等待对端确认超时", "点击“重新发送”"],
    label: "Mac client file clipboard timeout copied advice",
  });

  await evaluate(
    session,
    `(() => {
      window.__lanDualSentMessages = [];
      document.querySelector("#sendClipboardFilesButton").click();
      return true;
    })()`,
  );

  const retryTransfer = await waitFor(
    async () => {
      const value = await evaluate(
        session,
        `(() => {
          const messages = window.__lanDualSentMessages || [];
          const complete = messages.find((message) => message.type === "clipboard_file_complete");
          const offer = messages.find((message) => message.type === "clipboard_file_offer");
          const snapshot = ${buildSnapshotExpression()};
          return complete && offer ? { ...snapshot, transferId: complete.transferId, offerTransferId: offer.transferId } : null;
        })()`,
      );
      return value?.transferId &&
        value.transferId === value.offerTransferId &&
        value.transferId !== timedOutTransfer.transferId
        ? value
        : null;
    },
    args.timeoutMs,
    "Mac client file clipboard timeout retry send",
  );

  await evaluate(
    session,
    `(() => {
      const socket = window.__lanDualLastSocket;
      if (!socket) throw new Error("missing recorded WebSocket");
      socket.dispatchEvent(new MessageEvent("message", {
        data: JSON.stringify({
          type: "clipboard_file_result",
          transferId: ${JSON.stringify(timedOutTransfer.transferId)},
          accepted: true,
          saveMode: "temp",
          receivedBytes: 128,
          totalBytes: 128,
        }),
      }));
      return true;
    })()`,
  );
  await delay(250);
  const staleSnapshot = await evaluate(session, buildSnapshotExpression());
  if (!staleSnapshot.fileClipboard.includes("等待确认")) {
    throw new Error(`Mac client stale timed-out result overwrote retry state: ${JSON.stringify(staleSnapshot)}`);
  }

  await evaluate(
    session,
    `(() => {
      const socket = window.__lanDualLastSocket;
      if (!socket) throw new Error("missing recorded WebSocket");
      socket.dispatchEvent(new MessageEvent("message", {
        data: JSON.stringify({
          type: "clipboard_file_result",
          transferId: ${JSON.stringify(retryTransfer.transferId)},
          accepted: true,
          saveMode: "clipboard",
          receivedBytes: 128,
          totalBytes: 128,
        }),
      }));
      if (window.__lanDualSyntheticFileSend) {
        socket.send = window.__lanDualSyntheticFileSend;
        delete window.__lanDualSyntheticFileSend;
      }
      return true;
    })()`,
  );

  const successSnapshot = await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      return value.fileClipboard.includes("已写入") &&
        value.clipboardFileCount === 0 &&
        value.sendClipboardFilesButtonDisabled &&
        value.sendClipboardFilesButtonText.includes("发送文件")
        ? value
        : null;
    },
    args.timeoutMs,
    "Mac client file clipboard timeout retry success state",
  );

  print("OK", `File clipboard retry after result timeout: ${timeoutReadySnapshot.fileClipboard} -> ${successSnapshot.fileClipboard}`);
}

async function verifyMacClientFileClipboardDisconnectCancel({ args, session, uploadDir }) {
  const cancelPath = join(uploadDir, `mac-client-file-cancel-${Date.now()}.txt`);
  const cancelText = [
    "LAN Dual Control Mac client file clipboard cancel self-test",
    "This file is intentionally larger than one chunk.",
    "0123456789abcdef".repeat(12000),
    "",
  ].join("\n");
  await writeFile(cancelPath, cancelText, "utf8");

  await setFileInputFiles(session, "#clipboardFileInput", [cancelPath]);
  await evaluate(
    session,
    `(() => {
      window.__lanDualSentMessages = [];
      window.__lanDualReceivedMessages = [];
      window.__lanDualLastReceivedByType = {};
      window.__lanDualFileReadDelayMs = 650;
      if (!window.__lanDualOriginalBlobArrayBuffer) {
        window.__lanDualOriginalBlobArrayBuffer = Blob.prototype.arrayBuffer;
        Blob.prototype.arrayBuffer = async function(...args) {
          const delayMs = Number(window.__lanDualFileReadDelayMs || 0);
          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
          return window.__lanDualOriginalBlobArrayBuffer.apply(this, args);
        };
      }
      const input = document.querySelector("#clipboardFileInput");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelector("#sendClipboardFilesButton").click();
      return true;
    })()`,
  );
  await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      return value.sendClipboardFilesButtonDisabled &&
        (value.fileClipboard.includes("准备") || value.fileClipboard.includes("对端准备"))
        ? value
        : null;
    },
    args.timeoutMs,
    "Mac client file clipboard sending state",
  );
  const progressSnapshot = await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      return value.fileClipboard.includes("发送 ") &&
        value.fileClipboard.includes("已发") &&
        value.fileClipboard.includes("/s") &&
        value.fileClipboard.includes("剩余约")
        ? value
        : null;
    },
    args.timeoutMs,
    "Mac client file clipboard progress speed and ETA",
  );
  print("OK", `File clipboard progress detail: ${progressSnapshot.fileClipboard}`);
  await evaluate(
    session,
    `(() => {
      document.querySelector("#disconnectButton").click();
      return true;
    })()`,
  );
  const canceledSnapshot = await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      return value.connection === "未连接" &&
        value.fileClipboard.includes("文件发送已取消") &&
        value.sendClipboardFilesButtonDisabled
        ? value
        : null;
    },
    args.timeoutMs,
    "Mac client file clipboard cancel on disconnect",
  );
  await delay(1000);
  const leakedComplete = await evaluate(
    session,
    `(() => (window.__lanDualSentMessages || [])
      .some((message) => message.type === "clipboard_file_complete"))()`,
  );
  await evaluate(session, "window.__lanDualFileReadDelayMs = 0");
  if (leakedComplete) {
    throw new Error("Mac client sent clipboard_file_complete after disconnect canceled file transfer");
  }
  print("OK", `File clipboard cancel: ${canceledSnapshot.fileClipboard}`);
}

async function run() {
  boardSummaryMode = process.argv.includes("--boardSummary");
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }

  const args = parseArgs(process.argv);
  boardSummaryMode = Boolean(args.boardSummary);
  lastBoardSummaryArgs = args;
  lastBoardSummaryReport = {
    ok: false,
    connection: "",
    video: "",
    videoDiagnostics: "",
    videoObserve: "",
    audio: args.enableAudio ? "requested" : "not-requested",
    reverseControl: args.useExistingHost ? "skipped existing host" : "",
    input: "",
    clipboardText: "",
    clipboardFile: args.testFileClipboard ? "not-run" : "skipped",
    authFailure: "",
    error: "",
  };
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  const clientOrigin = `http://127.0.0.1:${args.clientPort}`;
  const clientParams = new URLSearchParams();
  clientParams.set("clipboardFileResultTimeoutMs", "650");
  if (args.disableBinaryVideo) {
    clientParams.set("binaryVideo", "0");
  }
  if (args.testReconnectNow) {
    clientParams.set("reconnectDelayScale", "60");
  }
  const clientUrl = `http://127.0.0.1:${args.clientPort}/${clientParams.toString() ? `?${clientParams.toString()}` : ""}`;
  const userDataDir = await mkdtemp(join(tmpdir(), "lan-dual-mac-client-edge-"));
  let windowsHost = null;
  let macClientServer = null;
  let browser = null;
  let session = null;
  let uploadDir = null;
  let repeatSignalHelper = null;

  try {
    if ((args.expectRepeatSignalVideo || args.expectBinaryVideo) && !args.useExistingHost) {
      repeatSignalHelper = await createRepeatSignalWgcHelper();
      args.repeatSignalWgcHelperPath = repeatSignalHelper.helperPath;
    }
    windowsHost = await startWindowsHost(args, repoRoot);
    macClientServer = startProcess(process.execPath, ["apps/mac-client/server.mjs", String(args.clientPort)], {
      cwd: repoRoot,
    });
    attachProcessLog(macClientServer, "mac-client");
    await waitForHttpOk(clientUrl, args.timeoutMs, "Mac client server");

    const browserArgs = [
      `--remote-debugging-port=${args.debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--disable-sync",
      "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults",
      "--window-size=1280,850",
    ];
    if (args.headless) {
      browserArgs.push("--headless=new");
    }
    if (args.disableGpu) {
      browserArgs.push("--disable-gpu");
    }
    browserArgs.push(clientUrl);

    browser = startProcess(findBrowserPath(), browserArgs);
    attachProcessLog(browser, "browser");
    session = await connectCdp(args.debugPort, args.timeoutMs);
    await session.send("Runtime.enable");
    await session.send("Page.enable");
    await grantClipboardPermissions(session, clientOrigin);
    if (args.disableWebCodecs) {
      await session.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `Object.defineProperty(window, "VideoDecoder", { value: undefined, configurable: true });
Object.defineProperty(window, "EncodedVideoChunk", { value: undefined, configurable: true });`,
      });
    }
    if (args.forceH264Unsupported) {
      await session.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `(() => {
  const install = () => {
    if (!window.VideoDecoder || typeof window.VideoDecoder.isConfigSupported !== "function") return;
    const original = window.VideoDecoder.isConfigSupported.bind(window.VideoDecoder);
    Object.defineProperty(window.VideoDecoder, "isConfigSupported", {
      configurable: true,
      value: async (config) => {
        const codec = String(config?.codec || "").toLowerCase();
        if (codec.startsWith("avc1.") || codec === "h264") {
          return { supported: false, config };
        }
        return original(config);
      },
    });
  };
  install();
})();`,
      });
    }
    await session.send("Page.navigate", { url: clientUrl });
    await session.waitForEvent("Page.loadEventFired", args.timeoutMs);
    await waitFor(
      () => evaluate(session, "document.readyState === 'complete'"),
      args.timeoutMs,
      "page load",
    );
    await evaluate(session, installWebSocketSendRecorderExpression());

    await evaluate(
      session,
      `(() => {
        const setValue = (selector, value) => {
          const element = document.querySelector(selector);
          element.value = value;
          element.dispatchEvent(new Event("change", { bubbles: true }));
          element.dispatchEvent(new Event("input", { bubbles: true }));
        };
        setValue("#hostInput", ${JSON.stringify(args.host)});
        setValue("#portInput", ${JSON.stringify(String(args.port))});
        setValue("#passwordInput", ${JSON.stringify(args.clientPassword)});
        return true;
      })()`,
    );
    const defaultSettingsSnapshot = await evaluate(session, buildSnapshotExpression());
    if (
      defaultSettingsSnapshot.resolution !== "1920x1080" ||
      defaultSettingsSnapshot.fps !== "60" ||
      defaultSettingsSnapshot.bandwidth !== "20" ||
      !defaultSettingsSnapshot.displaySettings.includes("1080P") ||
      !defaultSettingsSnapshot.displaySettings.includes("60 Hz") ||
      !defaultSettingsSnapshot.displaySettings.includes("20 Mbps") ||
      !defaultSettingsSnapshot.manualChecklist.includes("连接") ||
      !defaultSettingsSnapshot.manualChecklist.includes("视频") ||
      !defaultSettingsSnapshot.manualChecklist.includes("音频") ||
      !defaultSettingsSnapshot.manualChecklist.includes("剪贴板") ||
      !defaultSettingsSnapshot.manualChecklist.includes("input_ack") ||
      !defaultSettingsSnapshot.manualChecklist.includes("诊断") ||
      !defaultSettingsSnapshot.sendClipboardButtonDisabled ||
      !defaultSettingsSnapshot.sendClipboardFilesButtonDisabled
    ) {
      throw new Error(`Mac client default video settings mismatch: ${JSON.stringify(defaultSettingsSnapshot)}`);
    }
    const expectedPasswordSafety = args.clientPassword
      ? args.clientPassword === "demo-password"
        ? "演示密码"
        : "已输入"
      : "未输入";
    if (
      !defaultSettingsSnapshot.passwordSafety.includes(expectedPasswordSafety) ||
      !defaultSettingsSnapshot.passwordSafety.includes("不保存") ||
      defaultSettingsSnapshot.passwordSafety.includes(args.clientPassword || "demo-password") ||
      /password/i.test(defaultSettingsSnapshot.passwordSafety)
    ) {
      throw new Error(`Mac client password safety status mismatch: ${JSON.stringify({
        expectedPasswordSafety,
        passwordSafety: defaultSettingsSnapshot.passwordSafety,
      })}`);
    }
    if (args.enableAudio) {
      await clickElement(session, "#audioToggle");
      await waitFor(
        () => evaluate(session, "document.querySelector('#audioToggle')?.checked === true"),
        args.timeoutMs,
        "Mac client audio toggle",
      );
    }
    await evaluate(
      session,
      `(() => {
        window.__lanDualDiscoveryDelayMs = 300;
        if (window.__lanDualFetchDelayInstalled) return true;
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (...args) => {
          const target = String(args[0]?.url || args[0] || "");
          const delayMs = Number(window.__lanDualDiscoveryDelayMs || 0);
          if (delayMs > 0 && target.includes("/discovery")) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
          return originalFetch(...args);
        };
        window.__lanDualFetchDelayInstalled = true;
        return true;
      })()`,
    );
    let lastSnapshot = null;
    await verifyMacClientDiscoverButton({ args, session });
    await verifyMacClientConnectCancel({ args, session });
    const connectStartedAt = Date.now();
    await evaluate(
      session,
      `(() => {
        window.__lanDualTimings = window.__lanDualTimings || {};
        window.__lanDualTimings.connectClickedAt = performance.now();
        window.__lanDualTimings.firstAudioFrameAt = 0;
        return true;
      })()`,
    );
    await clickElement(session, "#connectButton");
    const connectingSnapshot = await waitFor(
      async () => {
        const value = await evaluate(session, buildSnapshotExpression());
        lastSnapshot = value;
        return value.connection === "连接中" && value.connectButtonDisabled && !value.disconnectButtonDisabled
          ? value
          : null;
      },
      args.timeoutMs,
      "Mac client connecting button state",
    );
    print("OK", `Connecting buttons: ${connectingSnapshot.connection}`);
    if (args.expectAuthFailure) {
      const authFailureSnapshot = await waitForPageSnapshot({
        args,
        session,
        label: "Mac client auth failure state",
        onSnapshot: (value) => {
          lastSnapshot = value;
        },
        check: async (value) => {
          const buttonsReset = !value.connectButtonDisabled && value.disconnectButtonDisabled;
          const surfaceCleared = value.video === "无画面" && !value.surfaceVisible && !value.surfaceHasFrame;
          const clipboardButtonsDisabled = value.sendClipboardButtonDisabled && value.sendClipboardFilesButtonDisabled;
          const runtimeCleared = value.remoteRuntime === "未提供";
          const reversePolicyCleared = value.reversePolicy === "未提供";
          const remoteReset = value.remote === "等待发现";
          const audioCleared = value.audioToggleChecked ? value.audio === "未接收" : value.audio === "未开启";
          return matchesExpectedAuthFailure(value, args) && buttonsReset && surfaceCleared && clipboardButtonsDisabled && runtimeCleared && reversePolicyCleared && remoteReset && audioCleared
            ? value
            : null;
        },
      }).catch((error) => {
        if (lastSnapshot) {
          print("INFO", `Last connection: ${lastSnapshot.connection}`);
          print("INFO", `Last remote: ${lastSnapshot.remote}`);
          print("INFO", `Last video: ${lastSnapshot.video}`);
          print("INFO", `Last runtime: ${lastSnapshot.remoteRuntime}`);
          if (lastSnapshot.logs?.length) {
            print("INFO", `Last logs: ${lastSnapshot.logs.join(" | ")}`);
          }
        }
        throw error;
      });

      print("OK", `Auth failure: ${authFailureSnapshot.connection}`);
      print("OK", `Auth failure remote: ${authFailureSnapshot.remote}`);
      print("OK", `Auth failure surface: ${authFailureSnapshot.video}`);
      print("OK", `Auth failure runtime: ${authFailureSnapshot.remoteRuntime}`);
      print("OK", `Auth failure reverse policy: ${authFailureSnapshot.reversePolicy}`);
      if (authFailureSnapshot.logs.length > 0) {
        print("INFO", `Recent logs: ${authFailureSnapshot.logs.join(" | ")}`);
      }
      print("OK", "Mac client auth failure self-test passed");
      lastBoardSummaryReport = {
        ...lastBoardSummaryReport,
        ok: true,
        authFailure: authFailureSnapshot.connection,
        connection: authFailureSnapshot.connection,
        video: authFailureSnapshot.video,
        reverseControl: "not applicable after expected auth failure",
      };
      if (args.boardSummary) {
        console.log(makeBoardSummary(lastBoardSummaryReport, args));
      }
      return;
    }

    const videoSnapshot = await waitForPageSnapshot({
      args,
      session,
      label: "Mac client video surface",
      onSnapshot: (value) => {
        lastSnapshot = value;
      },
      check: async (value) => {
        if (value.connection.includes("认证失败") || value.connection.includes("连接错误")) {
          throw new Error(`${value.connection}: ${value.logs?.join(" | ")}`);
        }
        const hasVideo = value.surfaceVisible && value.surfaceHasFrame;
        const realVideoOk = !args.requireRealVideo || !value.video.includes("mock-svg");
        return value.connection.includes("已连接") && hasVideo && realVideoOk ? value : null;
      },
    }).catch((error) => {
      if (lastSnapshot) {
        print("INFO", `Last connection: ${lastSnapshot.connection}`);
        print("INFO", `Last remote: ${lastSnapshot.remote}`);
        print("INFO", `Last video: ${lastSnapshot.video}`);
        print("INFO", `Last input: ${lastSnapshot.input}`);
        if (lastSnapshot.logs?.length) {
          print("INFO", `Last logs: ${lastSnapshot.logs.join(" | ")}`);
        }
      }
      throw error;
    });
    const initialVideoMs = Date.now() - connectStartedAt;
    requireWithinDuration("Mac client initial video", initialVideoMs, args.maxInitialVideoMs);

    print("OK", `Connection: ${videoSnapshot.connection}`);
    print("OK", `Remote: ${videoSnapshot.remote}`);
    print("OK", `Video: ${videoSnapshot.video}`);
    for (const expected of ["连接已认证", "视频已出帧", "音频未开启", "剪贴板", "input_ack待测", "诊断可复制"]) {
      if (!videoSnapshot.manualChecklist.includes(expected)) {
        throw new Error(`Mac client manual checklist missing ${expected}: ${videoSnapshot.manualChecklist}`);
      }
    }
    lastBoardSummaryReport = {
      ...lastBoardSummaryReport,
      connection: videoSnapshot.connection,
      video: videoSnapshot.video,
      reverseControl: args.useExistingHost ? "skipped existing host" : "pending guarded request rehearsal",
    };
    assertTemporaryRuntimeDiagnostics(videoSnapshot, args, "Mac client session");
    assertTemporaryReversePolicyDiagnostics(videoSnapshot, args, "Mac client session");
    await assertReversePolicyFormatterVariants(session);
    print("OK", `Remote runtime: ${videoSnapshot.remoteRuntime}`);
    print("OK", `Reverse policy: ${videoSnapshot.reversePolicy}`);
    print("OK", `Initial video ready: ${initialVideoMs}ms`);
    await verifyMacClientReverseControlRequest({ args, session });
    lastBoardSummaryReport.reverseControl = args.useExistingHost
      ? "skipped existing host"
      : "LAN008 -> PowerShell copy -> temporary grant -> accepted; no input_event";
    if (!videoSnapshot.sendClipboardFilesButtonDisabled) {
      throw new Error("Mac client file send button should stay disabled until files are selected");
    }
    if (!videoSnapshot.sendClipboardButtonDisabled) {
      throw new Error("Mac client text send button should stay disabled until text is entered");
    }
    if (!videoSnapshot.firstVideoMetric.includes("ms") || videoSnapshot.videoFlowMetric.includes("等待")) {
      throw new Error(`Mac client diagnostics did not update after video: ${JSON.stringify({
        firstVideoMetric: videoSnapshot.firstVideoMetric,
        videoFlowMetric: videoSnapshot.videoFlowMetric,
      })}`);
    }
    let diagnosticsSnapshot = videoSnapshot;
    if (Number.isFinite(videoSnapshot.lastVideoFrameAgeMs)) {
      diagnosticsSnapshot = await waitFor(
        async () => {
          const value = await evaluate(session, buildSnapshotExpression());
          lastSnapshot = value;
          const hasVideoFrameAge = Number.isFinite(value.lastVideoFrameAgeMs);
          const videoStatusShowsAge = value.video.includes("到达") || value.video.includes("时钟偏差");
          const videoDiagnosticsShowsAge = value.videoFlowMetric.includes("到达") || value.videoFlowMetric.includes("时钟偏差");
          return !hasVideoFrameAge || (videoStatusShowsAge && videoDiagnosticsShowsAge) ? value : null;
        },
        Math.min(args.timeoutMs, 5000),
        "Mac client video frame age diagnostics",
      ).catch((error) => {
        if (lastSnapshot) {
          print("INFO", `Last video: ${lastSnapshot.video}`);
          print("INFO", `Last diagnostics: ${lastSnapshot.videoFlowMetric}`);
          print("INFO", `Last video frame age: ${lastSnapshot.lastVideoFrameAgeMs}`);
        }
        throw error;
      });
    }
    print("OK", `Diagnostics: ${diagnosticsSnapshot.firstVideoMetric} / ${diagnosticsSnapshot.videoFlowMetric}`);
    lastBoardSummaryReport.videoDiagnostics = `${diagnosticsSnapshot.firstVideoMetric} / ${diagnosticsSnapshot.videoFlowMetric}`;
    if (args.requireH264Video) {
      const h264Snapshot = await waitForPageSnapshot({
        args,
        session,
        label: "Mac client H.264 video surface",
        onSnapshot: (value) => {
          lastSnapshot = value;
        },
        check: async (value) => {
          const hasH264Surface = value.surfaceVisible &&
            value.surfaceHasFrame &&
            value.video.toLowerCase().includes("h264") &&
            !value.video.includes("回退");
          const h264FallbackRequested = await evaluate(
            session,
            `(() => [...(window.__lanDualSentMessages || [])]
              .some((message) => message.type === "display_settings" && message.preferredVideoCodec === "mjpeg"))()`,
          );
          return hasH264Surface && !h264FallbackRequested ? value : null;
        },
      }).catch((error) => {
        if (lastSnapshot) {
          print("INFO", `Last video: ${lastSnapshot.video}`);
          print("INFO", `Last display settings: ${lastSnapshot.displaySettings}`);
          print("INFO", `Last logs: ${(lastSnapshot.logs || []).join(" | ")}`);
        }
        throw error;
      });
      print("OK", `H.264 video: ${h264Snapshot.video} / ${h264Snapshot.displaySettings}`);
    }
    if (args.expectBinaryH264Video) {
      const binaryH264Snapshot = await waitForPageSnapshot({
        args,
        session,
        label: "Mac client binary H.264 video diagnostics",
        onSnapshot: (value) => {
          lastSnapshot = value;
        },
        check: async (value) => {
          const hasBinaryH264Frame = Number(value.binaryH264VideoFrames) > 0;
          const hasH264Surface = value.surfaceVisible &&
            value.surfaceHasFrame &&
            value.video.toLowerCase().includes("h264") &&
            !value.video.includes("回退");
          return hasBinaryH264Frame && hasH264Surface ? value : null;
        },
      }).catch((error) => {
        if (lastSnapshot) {
          print("INFO", `Last video: ${lastSnapshot.video}`);
          print("INFO", `Last video diagnostics: ${lastSnapshot.videoFlowMetric}`);
          print("INFO", `Last binary H.264 frames: ${lastSnapshot.binaryH264VideoFrames}`);
        }
        throw error;
      });
      print(
        "OK",
        `Binary H.264 video: ${binaryH264Snapshot.binaryH264VideoFrames} frames / ${binaryH264Snapshot.videoFlowMetric}`,
      );
    }
    if (args.expectH264Fallback) {
      const fallbackSnapshot = await waitForPageSnapshot({
        args,
        session,
        label: "Mac client H.264 to MJPEG fallback",
        onSnapshot: (value) => {
          lastSnapshot = value;
        },
        check: async (value) => {
          const hasJpegSurface = value.surfaceVisible && value.surfaceHasFrame && value.video.includes("jpeg");
          const sentJpegFallback = await evaluate(
            session,
            `(() => [...(window.__lanDualSentMessages || [])]
              .some((message) => message.type === "display_settings" && message.preferredVideoCodec === "mjpeg"))()`,
          );
          return hasJpegSurface && sentJpegFallback ? value : null;
        },
      }).catch((error) => {
        if (lastSnapshot) {
          print("INFO", `Last video: ${lastSnapshot.video}`);
          print("INFO", `Last display settings: ${lastSnapshot.displaySettings}`);
          print("INFO", `Last logs: ${(lastSnapshot.logs || []).join(" | ")}`);
        }
        throw error;
      });
      print("OK", `H.264 fallback: ${fallbackSnapshot.video} / ${fallbackSnapshot.displaySettings}`);
    }
    if (args.expectRepeatSignalVideo) {
      const repeatSignalSnapshot = await waitForPageSnapshot({
        args,
        session,
        label: "Mac client repeat signal video diagnostics",
        onSnapshot: (value) => {
          lastSnapshot = value;
        },
        check: async (value) => {
          const hasRepeat = Number(value.repeatSignalVideoFrames) > 0;
          const surfaceOk = value.surfaceVisible && value.surfaceHasFrame;
          const diagnosticsOk = value.video.includes("重复") || value.videoFlowMetric.includes("重复");
          return hasRepeat && surfaceOk && diagnosticsOk ? value : null;
        },
      }).catch((error) => {
        if (lastSnapshot) {
          print("INFO", `Last video: ${lastSnapshot.video}`);
          print("INFO", `Last video diagnostics: ${lastSnapshot.videoFlowMetric}`);
          print("INFO", `Last repeat signal frames: ${lastSnapshot.repeatSignalVideoFrames}`);
        }
        throw error;
      });
      print(
        "OK",
        `Repeat signal video: ${repeatSignalSnapshot.repeatSignalVideoFrames} frames / ${repeatSignalSnapshot.videoFlowMetric}`,
      );
    }
    if (args.expectBinaryVideo) {
      const binaryVideoSnapshot = await waitForPageSnapshot({
        args,
        session,
        label: "Mac client binary JPEG video diagnostics",
        onSnapshot: (value) => {
          lastSnapshot = value;
        },
        check: async (value) => {
          const hasBinaryFrame = Number(value.binaryVideoFrames) > 0;
          const surfaceOk = value.surfaceVisible && value.surfaceHasFrame;
          const diagnosticsOk = value.video.includes("binary") || value.videoFlowMetric.includes("二进制");
          return hasBinaryFrame && surfaceOk && diagnosticsOk ? value : null;
        },
      }).catch((error) => {
        if (lastSnapshot) {
          print("INFO", `Last video: ${lastSnapshot.video}`);
          print("INFO", `Last video diagnostics: ${lastSnapshot.videoFlowMetric}`);
          print("INFO", `Last binary video frames: ${lastSnapshot.binaryVideoFrames}`);
        }
        throw error;
      });
      print(
        "OK",
        `Binary JPEG video: ${binaryVideoSnapshot.binaryVideoFrames} frames / ${binaryVideoSnapshot.videoFlowMetric}`,
      );
    }
    const sessionSettings = await evaluate(
      session,
      `(() => [...(window.__lanDualSentMessages || [])].find((message) => message.type === "session_offer"))()`,
    );
    const expectedVideoCodec = videoSnapshot.supportsWebCodecsH264 ? "h264" : "mjpeg";
    const expectedVideoEncoding = expectedVideoCodec === "h264" ? "annexb" : "data-url";
    const expectedVideoTransport = args.disableBinaryVideo
      ? "json"
      : expectedVideoCodec === "h264" ? "binary-h264" : "binary-jpeg";
    const expectedSupportedTransports = args.disableBinaryVideo
      ? ["json"]
      : ["json", "binary-jpeg", "binary-h264"];
    if (
      Number(sessionSettings?.preferredWidth) !== 1920 ||
      Number(sessionSettings?.preferredHeight) !== 1080 ||
      Number(sessionSettings?.maxFps) !== 60 ||
      Number(sessionSettings?.maxBandwidthKbps) !== 20000 ||
      sessionSettings?.qualityPreset !== "balanced" ||
      sessionSettings?.preferredVideoCodec !== expectedVideoCodec ||
      sessionSettings?.preferredVideoEncoding !== expectedVideoEncoding ||
      sessionSettings?.preferredVideoTransport !== expectedVideoTransport ||
      !Array.isArray(sessionSettings?.supportedVideoTransports) ||
      expectedSupportedTransports.some((transport) => !sessionSettings.supportedVideoTransports.includes(transport)) ||
      (!args.disableBinaryVideo && sessionSettings.supportedVideoTransports.length < 3) ||
      (args.disableBinaryVideo && sessionSettings.supportedVideoTransports.some((transport) => transport !== "json"))
    ) {
      throw new Error(`Mac client session video settings mismatch: ${JSON.stringify(sessionSettings)}`);
    }
    const sessionAnswer = await evaluate(
      session,
      `(() => [...(window.__lanDualReceivedMessages || [])].find((message) => message.type === "session_answer"))()`,
    );
    const sessionJpegQuality = Number(sessionAnswer?.jpegQuality);
    if (
      Number(sessionAnswer?.fps) !== 60 ||
      Number(sessionAnswer?.requestedFps) !== 60 ||
      Number(sessionAnswer?.maxScreenFps) !== 60 ||
      Number(sessionAnswer?.maxBandwidthKbps) !== 20000 ||
      sessionAnswer?.qualityPreset !== "balanced" ||
      !(sessionJpegQuality >= 0.5 && sessionJpegQuality <= 0.62)
    ) {
      throw new Error(`Windows host session video negotiation mismatch: ${JSON.stringify(sessionAnswer)}`);
    }
    if (args.expectWgcNv12H264Video) {
      if (
        sessionAnswer?.capturePipeline !== "windows-wgc-helper-nv12-ffmpeg-h264" ||
        sessionAnswer?.videoCodec !== "h264" ||
        sessionAnswer?.videoTransport !== (args.disableBinaryVideo ? "json" : "binary-h264") ||
        sessionAnswer?.h264Encoder !== args.h264Encoder ||
        sessionAnswer?.h264Level !== "4.2"
      ) {
        throw new Error(`Windows host WGC NV12 H.264 session mismatch: ${JSON.stringify(sessionAnswer)}`);
      }
      print("OK", `WGC NV12 H.264 session: ${sessionAnswer.capturePipeline} / ${sessionAnswer.h264Encoder} / level ${sessionAnswer.h264Level}`);
    }
    print("OK", `Video settings: ${videoSnapshot.displaySettings}`);

    const observedVideo = await observeMacClientVideo({ args, session });
    if (observedVideo) {
      lastBoardSummaryReport.videoObserve = `${observedVideo.frames} frames / ${observedVideo.elapsedMs}ms / ${observedVideo.fps.toFixed(1)} fps`;
    }

    if (args.expectReconnect) {
      windowsHost = await verifyMacClientReconnect({ args, repoRoot, session, windowsHost });
    }

    await verifyMacClientLogExport({ args, session });

    await evaluate(
      session,
      `(() => {
        const setValue = (selector, value) => {
          const element = document.querySelector(selector);
          element.value = value;
          element.dispatchEvent(new Event("change", { bubbles: true }));
          element.dispatchEvent(new Event("input", { bubbles: true }));
        };
        setValue("#qualityPresetSelect", "sharp");
        return true;
      })()`,
    );
    const displaySettingsSnapshot = await waitFor(
      async () => {
        const value = await evaluate(session, buildSnapshotExpression());
        lastSnapshot = value;
        const latestDisplaySettings = await evaluate(
          session,
          `(() => [...(window.__lanDualSentMessages || [])]
            .reverse()
            .find((message) => message.type === "display_settings"))()`,
        );
        const latestDisplayAck = await evaluate(
          session,
          `(() => [...(window.__lanDualReceivedMessages || [])]
            .reverse()
            .find((message) => message.type === "display_settings_ack") || window.__lanDualLastReceivedByType?.display_settings_ack)()`,
        );
        const h264FallbackActive = await evaluate(
          session,
          `(() => [...(window.__lanDualSentMessages || [])]
            .some((message) => message.type === "display_settings" && message.preferredVideoCodec === "mjpeg"))()`,
        );
        const expectedDisplayVideoCodec = h264FallbackActive
          ? "mjpeg"
          : value.supportsWebCodecsH264 ? "h264" : "mjpeg";
        const expectedDisplayVideoEncoding = expectedDisplayVideoCodec === "h264" ? "annexb" : "data-url";
        const expectedDisplayVideoTransport = args.disableBinaryVideo
          ? "json"
          : expectedDisplayVideoCodec === "h264" ? "binary-h264" : "binary-jpeg";
        const latestAckVideoCodec = String(latestDisplayAck?.videoCodec || "").toLowerCase();
        const expectedAckVideoTransport = latestAckVideoCodec === "h264"
          ? (args.disableBinaryVideo ? "json" : "binary-h264")
          : ["jpeg", "mjpeg"].includes(latestAckVideoCodec)
            ? (args.disableBinaryVideo ? "json" : "binary-jpeg")
            : "json";
        const expectedAckH264Level = latestAckVideoCodec === "h264" ? "5.1" : "";
        const displaySupportedTransportsOk = args.disableBinaryVideo
          ? Array.isArray(latestDisplaySettings?.supportedVideoTransports) &&
            latestDisplaySettings.supportedVideoTransports.length === 1 &&
            latestDisplaySettings.supportedVideoTransports[0] === "json"
          : Array.isArray(latestDisplaySettings?.supportedVideoTransports) &&
            latestDisplaySettings.supportedVideoTransports.includes("binary-jpeg") &&
            latestDisplaySettings.supportedVideoTransports.includes("binary-h264");
        const messageOk =
          Number(latestDisplaySettings?.width) === 2560 &&
          Number(latestDisplaySettings?.height) === 1440 &&
          Number(latestDisplaySettings?.fps) === 60 &&
          Number(latestDisplaySettings?.maxBandwidthKbps) === 40000 &&
          latestDisplaySettings?.qualityPreset === "sharp" &&
          latestDisplaySettings?.preferredVideoCodec === expectedDisplayVideoCodec &&
          latestDisplaySettings?.preferredVideoEncoding === expectedDisplayVideoEncoding &&
          latestDisplaySettings?.preferredVideoTransport === expectedDisplayVideoTransport &&
          displaySupportedTransportsOk &&
          latestDisplaySettings?.audio === Boolean(value.audioToggleChecked);
        const ackOk =
          latestDisplayAck?.accepted === true &&
          Number(latestDisplayAck?.width) === 2560 &&
          Number(latestDisplayAck?.height) === 1440 &&
          Number(latestDisplayAck?.fps) === 60 &&
          Number(latestDisplayAck?.requestedFps) === 60 &&
          Number(latestDisplayAck?.maxScreenFps) === 60 &&
          Number(latestDisplayAck?.maxBandwidthKbps) === 40000 &&
          latestDisplayAck?.videoTransport === expectedAckVideoTransport &&
          (!expectedAckH264Level || latestDisplayAck?.h264Level === expectedAckH264Level) &&
          latestDisplayAck?.qualityPreset === "sharp" &&
          Number(latestDisplayAck?.jpegQuality) >= 0.74 &&
          Number(latestDisplayAck?.jpegQuality) <= 0.82;
        const statusOk =
          value.qualityPreset === "sharp" &&
          value.resolution === "2560x1440" &&
          value.fps === "60" &&
          value.bandwidth === "40" &&
          value.displaySettings.includes("2K") &&
          value.displaySettings.includes("60 Hz") &&
          value.displaySettings.includes("40 Mbps");
        return messageOk && ackOk && statusOk ? { ...value, latestDisplaySettings, latestDisplayAck } : null;
      },
      args.timeoutMs,
      "Mac client display settings update",
    ).catch(async (error) => {
      const latestDisplaySettings = await evaluate(
        session,
        `(() => [...(window.__lanDualSentMessages || [])]
          .reverse()
          .find((message) => message.type === "display_settings"))()`,
      ).catch(() => null);
      const latestDisplayAck = await evaluate(
        session,
        `(() => [...(window.__lanDualReceivedMessages || [])]
          .reverse()
          .find((message) => message.type === "display_settings_ack") || window.__lanDualLastReceivedByType?.display_settings_ack)()`,
      ).catch(() => null);
      if (lastSnapshot) {
        print("INFO", `Last display settings status: ${lastSnapshot.displaySettings}`);
        print("INFO", `Last selected settings: ${lastSnapshot.qualityPreset}/${lastSnapshot.resolution}/${lastSnapshot.fps}/${lastSnapshot.bandwidth}`);
      }
      print("INFO", `Latest display_settings: ${JSON.stringify(latestDisplaySettings)}`);
      print("INFO", `Latest display_settings_ack: ${JSON.stringify(latestDisplayAck)}`);
      throw error;
    });
    print("OK", `Display settings: ${displaySettingsSnapshot.displaySettings}`);

    const postSettingsObserve = await observeMacClientVideo({
      args,
      session,
      label: "Post-settings video observe",
    });
    if (postSettingsObserve) {
      const expectedPostSettingsCodec = String(displaySettingsSnapshot.latestDisplayAck?.videoCodec || "").toLowerCase();
      const expectedPostSettingsTransport = String(displaySettingsSnapshot.latestDisplayAck?.videoTransport || "").toLowerCase();
      const postSettingsFrameSnapshot = await waitFor(
        async () => {
          const value = await evaluate(session, buildSnapshotExpression());
          lastSnapshot = value;
          const frame = value.lastVideoFrame || {};
          const codec = String(frame.codec || "").toLowerCase();
          const transport = String(frame.videoTransport || "json").toLowerCase();
          const dimensionsOk = Number(frame.width) === 2560 && Number(frame.height) === 1440;
          const codecOk = expectedPostSettingsCodec ? codec === expectedPostSettingsCodec : true;
          const transportOk = expectedPostSettingsTransport ? transport === expectedPostSettingsTransport : true;
          const h264LevelOk = expectedPostSettingsCodec === "h264" ? frame.h264Level === "5.1" : true;
          const surfaceOk = expectedPostSettingsCodec === "h264"
            ? value.canvasVisible && value.canvasHasFrame
            : value.surfaceVisible && value.surfaceHasFrame;
          return dimensionsOk && codecOk && transportOk && h264LevelOk && surfaceOk ? value : null;
        },
        args.timeoutMs,
        "Mac client post-settings video frame",
      );
      print(
        "OK",
        `Post-settings video frame: ${postSettingsFrameSnapshot.lastVideoFrame.width}x${postSettingsFrameSnapshot.lastVideoFrame.height} / ${postSettingsFrameSnapshot.lastVideoFrame.codec}/${postSettingsFrameSnapshot.lastVideoFrame.videoTransport || "json"} / level ${postSettingsFrameSnapshot.lastVideoFrame.h264Level || "n/a"}`,
      );
    }

    if (args.expectAudioFrame) {
      const audioFrameSnapshot = await waitForPageSnapshot({
        args,
        session,
        label: "Mac client audio frame",
        onSnapshot: (value) => {
          lastSnapshot = value;
        },
        check: async (value) => {
          const hasFrame = value.audioFrameCount > 0 || value.audio.includes("接收") || value.audio.includes("level");
          const hasPayload = Boolean(value.lastAudioFrame?.payloadLength || value.lastAudioFrame?.payloadBytes);
          const frame = value.lastAudioFrame;
          const realPcmOk = !args.requireAudio || (
            String(frame?.codec || "").toLowerCase().includes("pcm-f32le") &&
            String(frame?.encoding || "").toLowerCase().includes("pcm-f32le-base64") &&
            Number(frame?.sampleRate || 0) === 48000 &&
            Number(frame?.channels || 0) === 2
          );
          const payloadOk = !args.expectAudioPayload || hasPayload;
          return hasFrame && payloadOk && realPcmOk ? value : null;
        },
      }).catch((error) => {
        if (lastSnapshot) {
          print("INFO", `Last audio: ${lastSnapshot.audio}`);
          print("INFO", `Last audio playback: ${lastSnapshot.audioPlayback}`);
          print("INFO", `Last audio frames: ${lastSnapshot.audioFrameCount}, played: ${lastSnapshot.audioPlayedFrames}`);
        }
        throw error;
      });
      requireWithinDuration("Mac client audio frame", audioFrameSnapshot.audioFrameMs, args.maxAudioFrameMs);

      let audioSnapshot = audioFrameSnapshot;
      if (args.expectAudioPlayback) {
        audioSnapshot = await waitForPageSnapshot({
          args,
          session,
          label: "Mac client audio playback",
          onSnapshot: (value) => {
            lastSnapshot = value;
          },
          check: async (value) => {
            return value.audioPlayedFrames > 0 ? value : null;
          },
        }).catch((error) => {
          if (lastSnapshot) {
            print("INFO", `Last audio: ${lastSnapshot.audio}`);
            print("INFO", `Last audio playback: ${lastSnapshot.audioPlayback}`);
            print("INFO", `Last audio frames: ${lastSnapshot.audioFrameCount}, played: ${lastSnapshot.audioPlayedFrames}`);
          }
          throw error;
        });
        requireWithinDuration("Mac client audio playback", audioSnapshot.audioPlaybackMs, args.maxAudioPlaybackMs);
      }

      const frame = audioSnapshot.lastAudioFrame;
      const payloadText = frame ? ` · payload=${frame.payloadBytes || frame.payloadLength || 0}` : "";
      const timingText = ` · firstAudio=${audioFrameSnapshot.audioFrameMs}ms` +
        (args.expectAudioPlayback ? ` · playback=${audioSnapshot.audioPlaybackMs}ms` : "");
      if (!audioSnapshot.audioFlowMetric.includes("接收")) {
        throw new Error(`Mac client audio diagnostics did not update: ${audioSnapshot.audioFlowMetric}`);
      }
      const hasAudioFrameAge = Number.isFinite(audioSnapshot.lastAudioFrameAgeMs);
      const audioStatusShowsAge = audioSnapshot.audio.includes("到达") || audioSnapshot.audio.includes("时钟偏差");
      const audioPlaybackShowsAge = audioSnapshot.audioPlayback.includes("到达") || audioSnapshot.audioPlayback.includes("时钟偏差");
      const audioDiagnosticsShowsAge = audioSnapshot.audioFlowMetric.includes("到达") || audioSnapshot.audioFlowMetric.includes("时钟偏差");
      if (hasAudioFrameAge && (!audioStatusShowsAge || !audioPlaybackShowsAge || !audioDiagnosticsShowsAge)) {
        throw new Error(`Mac client audio frame age missing: ${JSON.stringify({
          audio: audioSnapshot.audio,
          audioPlayback: audioSnapshot.audioPlayback,
          audioFlowMetric: audioSnapshot.audioFlowMetric,
          lastAudioFrameAgeMs: audioSnapshot.lastAudioFrameAgeMs,
        })}`);
      }
      const ageText = hasAudioFrameAge ? ` · frameAge=${audioSnapshot.lastAudioFrameAgeMs}ms` : "";
      print("OK", `Audio: ${audioSnapshot.audio} / ${audioSnapshot.audioPlayback}${payloadText}${timingText}`);
      print("OK", `Audio diagnostics: ${audioSnapshot.audioFlowMetric}${ageText}`);
      lastBoardSummaryReport.audio = `${audioSnapshot.audio} / ${audioSnapshot.audioPlayback}${payloadText}${timingText}`;

      await clickElement(session, "#audioToggle");
      const audioDisabledSnapshot = await waitFor(
        async () => {
          const value = await evaluate(session, buildSnapshotExpression());
          lastSnapshot = value;
          return !value.audioToggleChecked && value.audio === "未开启" && value.audioFlowMetric === "未开启"
            ? value
            : null;
        },
        args.timeoutMs,
        "Mac client audio toggle off state",
      );
      await clickElement(session, "#audioToggle");
      const audioReenabledSnapshot = await waitFor(
        async () => {
          const value = await evaluate(session, buildSnapshotExpression());
          lastSnapshot = value;
          return value.audioToggleChecked && value.audio === "未接收"
            ? value
            : null;
        },
        args.timeoutMs,
        "Mac client audio toggle on reset state",
      );
      print("OK", `Audio toggle reset: ${audioDisabledSnapshot.audio} -> ${audioReenabledSnapshot.audio}`);
    }

    const endpoint = `${args.host}:${args.port}`;
    const recentConnectionSnapshot = await waitFor(
      async () => {
        const value = await evaluate(session, buildSnapshotExpression());
        lastSnapshot = value;
        const hasEndpoint = value.recentConnectionOptions.some((option) => option.value === endpoint);
        const storesEndpoint = value.recentConnectionStorage.includes(args.host) && value.recentConnectionStorage.includes(String(args.port));
        const omitsPassword = !value.recentConnectionStorage.includes(args.clientPassword);
        return hasEndpoint && storesEndpoint && omitsPassword ? value : null;
      },
      args.timeoutMs,
      "Mac client recent connection save",
    );
    print("OK", `Recent connection: ${recentConnectionSnapshot.recentConnection}`);

    await evaluate(
      session,
      `(() => {
        const setValue = (selector, value) => {
          const element = document.querySelector(selector);
          element.value = value;
          element.dispatchEvent(new Event("change", { bubbles: true }));
          element.dispatchEvent(new Event("input", { bubbles: true }));
        };
        setValue("#hostInput", "");
        setValue("#portInput", "");
        const select = document.querySelector("#recentConnectionSelect");
        select.value = ${JSON.stringify(endpoint)};
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return {
          host: document.querySelector("#hostInput").value,
          port: document.querySelector("#portInput").value,
        };
      })()`,
    );
    const recentApplySnapshot = await waitFor(
      async () => {
        const value = await evaluate(
          session,
          `(() => ({
            host: document.querySelector("#hostInput").value,
            port: document.querySelector("#portInput").value,
            status: document.querySelector("#recentConnectionStatus").textContent || ""
          }))()`,
        );
        return value.host === args.host && value.port === String(args.port) ? value : null;
      },
      args.timeoutMs,
      "Mac client recent connection apply",
    );
    print("OK", `Recent apply: ${recentApplySnapshot.host}:${recentApplySnapshot.port}`);

    await evaluate(
      session,
      `(() => {
        document.querySelector("#clearRecentConnectionsButton").click();
        return true;
      })()`,
    );
    const recentClearSnapshot = await waitFor(
      async () => {
        const value = await evaluate(session, buildSnapshotExpression());
        lastSnapshot = value;
        const hasEndpoint = value.recentConnectionOptions.some((option) => option.value === endpoint);
        const storageCleared = !value.recentConnectionStorage.includes(args.host) && !value.recentConnectionStorage.includes(String(args.port));
        const disabled = value.recentConnectionDisabled && value.clearRecentConnectionsDisabled;
        const statusOk = value.recentConnection.includes("已清空") && value.recentConnection.includes("不保存密码");
        return !hasEndpoint && storageCleared && disabled && statusOk ? value : null;
      },
      args.timeoutMs,
      "Mac client recent connection clear",
    );
    print("OK", `Recent clear: ${recentClearSnapshot.recentConnection}`);

    await evaluate(
      session,
      `(() => {
        const viewport = document.querySelector("#remoteViewport");
        const image = document.querySelector("#remoteImage");
        const rect = image.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        viewport.focus();
        viewport.dispatchEvent(new PointerEvent("pointermove", {
          bubbles: true,
          clientX,
          clientY,
          pointerType: "mouse",
          button: 0,
        }));
        viewport.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true,
          clientX,
          clientY,
          pointerType: "mouse",
          button: 0,
        }));
        viewport.dispatchEvent(new PointerEvent("pointerup", {
          bubbles: true,
          clientX,
          clientY,
          pointerType: "mouse",
          button: 0,
        }));
        viewport.dispatchEvent(new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "a",
          code: "KeyA",
        }));
        return true;
      })()`,
    );

    const inputSnapshot = await waitFor(
      async () => {
        const value = await evaluate(session, buildSnapshotExpression());
        lastSnapshot = value;
        return value.input.includes("已确认") ? value : null;
      },
      args.timeoutMs,
      "Mac client input ack",
    );

    print("OK", `Input: ${inputSnapshot.input}`);
    lastBoardSummaryReport.input = inputSnapshot.input;
    if (inputSnapshot.logs.length > 0) {
      print("INFO", `Recent logs: ${inputSnapshot.logs.join(" | ")}`);
    }

    await evaluate(
      session,
      `(() => {
        const viewport = document.querySelector("#remoteViewport");
        viewport.focus();
        viewport.dispatchEvent(new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "c",
          code: "KeyC",
          metaKey: true,
        }));
        return true;
      })()`,
    );

    const shortcutSnapshot = await waitFor(
      async () => {
        const value = await evaluate(
          session,
          `(() => {
            const shortcut = [...(window.__lanDualSentMessages || [])]
              .reverse()
              .find((message) => message.type === "input_event" && message.event === "key" && message.code === "KeyC");
            if (!shortcut) return null;
            const logs = [...document.querySelectorAll("#eventLog li")]
              .slice(0, 10)
              .map((item) => item.innerText.replace(/\\s+/g, " "));
            return {
              shortcut,
              input: document.querySelector("#inputStatus")?.textContent || "",
              hint: document.querySelector("#viewportHint")?.textContent || "",
              logs,
            };
          })()`,
        );
        if (!value?.shortcut) return null;
        const shortcut = value.shortcut;
        const mappedToCtrl = shortcut.ctrlKey === true && shortcut.metaKey === false && shortcut.modifiers?.includes("ctrl");
        const preservedLocalMeta = shortcut.localMetaKey === true && shortcut.shortcutProfile === "mac_command_to_windows_ctrl";
        const hintVisible = value.hint.includes("Command") && value.hint.includes("Ctrl");
        const logVisible = value.logs.some((line) => line.includes("Command→Ctrl+C"));
        return mappedToCtrl && preservedLocalMeta && hintVisible && logVisible ? value : null;
      },
      args.timeoutMs,
      "Mac client Command-to-Ctrl shortcut mapping",
    );
    print("OK", `Shortcut: Command+C -> ctrlKey=${shortcutSnapshot.shortcut.ctrlKey}, metaKey=${shortcutSnapshot.shortcut.metaKey}`);

    const clipboardText = `Windows self-test clipboard ${Date.now()}`;
    await evaluate(
      session,
      `(() => {
        const setValue = (selector, value) => {
          const element = document.querySelector(selector);
          element.value = value;
          element.dispatchEvent(new Event("change", { bubbles: true }));
          element.dispatchEvent(new Event("input", { bubbles: true }));
        };
        setValue("#clipboardTextInput", ${JSON.stringify(clipboardText)});
        return true;
      })()`,
    );
    const clipboardReadySnapshot = await waitFor(
      async () => {
        const value = await evaluate(session, buildSnapshotExpression());
        lastSnapshot = value;
        return !value.sendClipboardButtonDisabled && value.clipboardTextValue === clipboardText ? value : null;
      },
      args.timeoutMs,
      "Mac client text clipboard ready button state",
    );
    print("OK", `Text button ready: ${clipboardReadySnapshot.clipboardTextValue.length} 字`);
    await evaluate(
      session,
      `(() => {
        document.querySelector("#sendClipboardButton").click();
        return true;
      })()`,
    );

    const clipboardSnapshot = await waitFor(
      async () => {
        const value = await evaluate(session, buildSnapshotExpression());
        lastSnapshot = value;
        const accepted = value.clipboard.includes("已写入");
        const modeOk = !args.requireSystemClipboard || value.clipboard.includes("system");
        return accepted && modeOk ? value : null;
      },
      args.timeoutMs,
      "Mac client clipboard ack",
    );

    print("OK", `Clipboard: ${clipboardSnapshot.clipboard}`);
    lastBoardSummaryReport.clipboardText = clipboardSnapshot.clipboard;

    const localClipboardText = `Mac client local clipboard ${Date.now()}`;
    await evaluate(session, `navigator.clipboard.writeText(${JSON.stringify(localClipboardText)})`);
    await evaluate(
      session,
      `(() => {
        document.querySelector("#readClipboardButton").click();
        return true;
      })()`,
    );
    const localClipboardReadSnapshot = await waitFor(
      async () => {
        const value = await evaluate(session, buildSnapshotExpression());
        lastSnapshot = value;
        return value.clipboardTextValue === localClipboardText && !value.sendClipboardButtonDisabled ? value : null;
      },
      args.timeoutMs,
      "Mac client local clipboard read",
    );
    print("OK", `Local clipboard: ${localClipboardReadSnapshot.localClipboard}`);

    await evaluate(
      session,
      `(() => {
        document.querySelector("#sendClipboardButton").click();
        return true;
      })()`,
    );
    const localClipboardSendSnapshot = await waitFor(
      async () => {
        const value = await evaluate(session, buildSnapshotExpression());
        lastSnapshot = value;
        const accepted = value.clipboard.includes("已写入") && value.clipboard.includes(String(localClipboardText.length));
        const modeOk = !args.requireSystemClipboard || value.clipboard.includes("system");
        return accepted && modeOk ? value : null;
      },
      args.timeoutMs,
      "Mac client local clipboard send",
    );
    print("OK", `Local clipboard send: ${localClipboardSendSnapshot.clipboard}`);
    lastBoardSummaryReport.clipboardText = localClipboardSendSnapshot.clipboard;

    const watchedClipboardText = `Mac client watched clipboard ${Date.now()}`;
    await evaluate(
      session,
      `(() => {
        document.querySelector("#clipboardWatchToggle").click();
        return true;
      })()`,
    );
    await delay(300);
    await evaluate(session, `navigator.clipboard.writeText(${JSON.stringify(watchedClipboardText)})`);
    const watchedClipboardSnapshot = await waitFor(
      async () => {
        const value = await evaluate(session, buildSnapshotExpression());
        lastSnapshot = value;
        const accepted = value.clipboard.includes("已写入") && value.clipboard.includes(String(watchedClipboardText.length));
        const modeOk = !args.requireSystemClipboard || value.clipboard.includes("system");
        return accepted && modeOk ? value : null;
      },
      args.timeoutMs,
      "Mac client local clipboard watch",
    );
    print("OK", `Clipboard watch: ${watchedClipboardSnapshot.clipboard}`);

    if (args.testFileClipboard) {
      uploadDir = await mkdtemp(join(tmpdir(), "lan-dual-mac-client-upload-"));
      await verifyMacClientFileClipboardOversizedSelection({ args, session });
      await verifyMacClientFileClipboardRemoteUnavailableGuard({ args, session, uploadDir });
      await verifyMacClientFileClipboardRejectCancel({ args, session, uploadDir });

      const uploadPath = join(uploadDir, `mac-client-file-clipboard-${Date.now()}.txt`);
      const uploadText = [
        "LAN Dual Control Mac client file clipboard self-test",
        `createdAt=${new Date().toISOString()}`,
        "",
      ].join("\n");
      await writeFile(uploadPath, uploadText, "utf8");

      await setFileInputFiles(session, "#clipboardFileInput", [uploadPath]);
      await evaluate(
        session,
        `(() => {
          const input = document.querySelector("#clipboardFileInput");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        })()`,
      );
      const fileReadySnapshot = await waitFor(
        async () => {
          const value = await evaluate(session, buildSnapshotExpression());
          lastSnapshot = value;
          return !value.sendClipboardFilesButtonDisabled && value.fileClipboard.includes("1 个") ? value : null;
        },
        args.timeoutMs,
        "Mac client file clipboard ready button state",
      );
      print("OK", `File button ready: ${fileReadySnapshot.fileClipboard}`);
      await evaluate(
        session,
        `(() => {
          document.querySelector("#sendClipboardFilesButton").click();
          return true;
        })()`,
      );

      const fileClipboardSnapshot = await waitFor(
        async () => {
          const value = await evaluate(session, buildSnapshotExpression());
          lastSnapshot = value;
          const accepted = value.fileClipboard.includes("已写入");
          const modeOk = !args.requireSystemClipboard || value.fileClipboard.includes("clipboard");
          return accepted && modeOk && value.sendClipboardFilesButtonDisabled ? value : null;
        },
        args.timeoutMs,
        "Mac client file clipboard result",
      );

      print("OK", `File clipboard: ${fileClipboardSnapshot.fileClipboard}`);
      lastBoardSummaryReport.clipboardFile = fileClipboardSnapshot.fileClipboard;
      await verifyMacClientFileClipboardResultFailureRetry({ args, session, uploadDir });
      await verifyMacClientFileClipboardResultTimeoutRetry({ args, session, uploadDir });
      await verifyMacClientFileClipboardDisconnectCancel({ args, session, uploadDir });
    }

    await evaluate(
      session,
      `(() => {
        document.querySelector("#disconnectButton").click();
        return true;
      })()`,
    );
    const disconnectSnapshot = await waitFor(
      async () => {
        const value = await evaluate(session, buildSnapshotExpression());
        lastSnapshot = value;
        const connectionOk = value.connection === "未连接";
        const videoStatusOk = value.video === "无画面";
        const firstVideoOk = value.firstVideoMetric === "未就绪";
        const videoFlowOk = value.videoFlowMetric === "未接收";
        const audioFlowOk = value.audioToggleChecked
          ? value.audioFlowMetric === "等待音频"
          : value.audioFlowMetric === "未开启";
        const audioStatusOk = value.audioToggleChecked
          ? value.audio === "未接收"
          : value.audio === "未开启";
        const reconnectOk = value.reconnectMetric === "0 次";
        const runtimeOk = value.remoteRuntime === "未提供";
        const reversePolicyOk = value.reversePolicy === "未提供";
        const remoteOk = value.remote === "等待发现";
        const surfaceCleared = !value.surfaceVisible && !value.surfaceHasFrame;
        const clipboardButtonsDisabled = value.sendClipboardButtonDisabled && value.sendClipboardFilesButtonDisabled;
        return connectionOk && videoStatusOk && firstVideoOk && videoFlowOk && audioFlowOk && audioStatusOk && reconnectOk && runtimeOk && reversePolicyOk && remoteOk && surfaceCleared && clipboardButtonsDisabled
          ? value
          : null;
      },
      args.timeoutMs,
      "Mac client manual disconnect diagnostics reset",
    );
    print(
      "OK",
      `Disconnect reset: ${disconnectSnapshot.remote} / ${disconnectSnapshot.video} / ${disconnectSnapshot.firstVideoMetric} / ${disconnectSnapshot.videoFlowMetric} / ${disconnectSnapshot.audio} / ${disconnectSnapshot.audioFlowMetric} / ${disconnectSnapshot.reconnectMetric} / ${disconnectSnapshot.remoteRuntime} / ${disconnectSnapshot.reversePolicy}`,
    );
    print("OK", "Mac client browser self-test passed");
    lastBoardSummaryReport = {
      ...lastBoardSummaryReport,
      ok: true,
    };
    if (args.boardSummary) {
      console.log(makeBoardSummary(lastBoardSummaryReport, args));
    }
  } finally {
    session?.close();
    browser?.kill();
    macClientServer?.kill();
    windowsHost?.kill();
    await delay(500);
    if (uploadDir) {
      await rm(uploadDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {});
    }
    await repeatSignalHelper?.cleanup().catch(() => {});
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {});
  }
}

run().catch((error) => {
  if (boardSummaryMode) {
    const report = {
      ...(lastBoardSummaryReport || {}),
      ok: false,
      error: error.message || String(error),
    };
    console.log(makeBoardSummary(report, lastBoardSummaryArgs || defaults));
  }
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
