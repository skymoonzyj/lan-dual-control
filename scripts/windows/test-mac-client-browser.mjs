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
  clientPort: 5188,
  debugPort: 9340,
  timeoutMs: 30000,
  inputMode: "log",
  screenMode: "auto",
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
  minObservedVideoFrames: 0,
  minObservedVideoFps: 0,
  useExistingHost: false,
  mockVideo: false,
  headless: true,
};

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
    if (Object.prototype.hasOwnProperty.call(args, key) && next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    }
  }

  args.clientPort = Number(args.clientPort);
  args.debugPort = Number(args.debugPort);
  args.timeoutMs = Number(args.timeoutMs);
  args.maxInitialVideoMs = Number(args.maxInitialVideoMs);
  args.maxReconnectRestoreMs = Number(args.maxReconnectRestoreMs);
  args.maxAudioFrameMs = Number(args.maxAudioFrameMs);
  args.maxAudioPlaybackMs = Number(args.maxAudioPlaybackMs);
  args.observeVideoMs = Number(args.observeVideoMs);
  args.minObservedVideoFrames = Number(args.minObservedVideoFrames);
  args.minObservedVideoFps = Number(args.minObservedVideoFps);
  args.hostPassword = args.hostPassword || args.password;
  args.clientPassword = args.clientPassword || (args.expectAuthFailure ? `${args.password}-wrong` : args.password);
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

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireWithinDuration(label, elapsedMs, maxMs) {
  if (!Number.isFinite(maxMs) || maxMs <= 0) return;
  if (elapsedMs > maxMs) {
    throw new Error(`${label} took ${elapsedMs}ms, expected <= ${maxMs}ms`);
  }
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

  const env = {
    ...process.env,
    LAN_DUAL_PASSWORD: args.hostPassword,
    LAN_DUAL_WINDOWS_INPUT_MODE: args.inputMode,
    LAN_DUAL_WINDOWS_SCREEN_MODE: args.mockVideo ? "mock" : args.screenMode,
    ...(args.audioMode ? { LAN_DUAL_WINDOWS_AUDIO_MODE: args.audioMode } : {}),
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

  await stopProcess(windowsHost, "Windows host for reconnect");
  await waitForHttpDown(discoveryUrl, args.timeoutMs, "Windows host discovery shutdown");

  const reconnectingSnapshot = await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      const reconnecting = value.connection.includes("自动重连") || value.connection.includes("重连");
      const logVisible = value.logs.some((line) => line.includes("自动重连"));
      const surfaceCleared = value.video === "连接中断" && !value.imageVisible && !value.imageHasSource;
      return (reconnecting || logVisible) && surfaceCleared ? value : null;
    },
    args.timeoutMs,
    "Mac client reconnect scheduling",
  );
  print("OK", `Reconnect scheduled: ${reconnectingSnapshot.connection} · ${reconnectingSnapshot.video}`);

  await waitFor(
    () => canBindPort(args.host, args.port),
    args.timeoutMs,
    "temporary Windows host port release",
  );
  const restartedHost = await startWindowsHost(args, repoRoot);

  const reconnectedSnapshot = await waitFor(
    async () => {
      const value = await evaluate(session, buildSnapshotExpression());
      const sessionAnswers = await evaluate(
        session,
        `(() => (window.__lanDualReceivedMessages || []).filter((message) => message.type === "session_answer").length)()`,
      );
      const connected = value.connection.includes("已连接");
      const hasNewSession = Number(sessionAnswers) > Number(sessionAnswersBefore);
      const hasVideo = value.imageVisible && value.imageHasSource;
      return connected && hasNewSession && hasVideo ? { ...value, sessionAnswers } : null;
    },
    args.timeoutMs,
    "Mac client reconnect restore",
  );
  const restoreMs = Date.now() - restoreStartedAt;
  requireWithinDuration("Mac client reconnect restore", restoreMs, args.maxReconnectRestoreMs);
  print(
    "OK",
    `Reconnect restored: ${reconnectedSnapshot.connection} · sessions=${reconnectedSnapshot.sessionAnswers} · ${restoreMs}ms`,
  );
  return restartedHost;
}

async function observeMacClientVideo({ args, session }) {
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
  await delay(durationMs);
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
  print("OK", `Video observe: ${frames} frames / ${elapsedMs}ms / ${fps.toFixed(1)} fps`);
  return { frames, elapsedMs, fps };
}

function buildSnapshotExpression() {
  return `(() => {
    const text = (selector) => document.querySelector(selector)?.textContent || "";
    const image = document.querySelector("#remoteImage");
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
      audioToggleChecked: document.querySelector("#audioToggle")?.checked || false,
      audioPlayedFrames: Number((text("#audioStatus").match(/播放\\s*(\\d+)/) || [])[1] || 0),
      audioFrameCount: (window.__lanDualReceivedMessages || []).filter((message) => message.type === "audio_frame").length,
      audioFrameMs: (() => {
        const timings = window.__lanDualTimings || {};
        if (!timings.connectClickedAt || !timings.firstAudioFrameAt) return 0;
        return Math.round(timings.firstAudioFrameAt - timings.connectClickedAt);
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
        };
      })(),
      input: text("#inputStatus"),
      clipboard: text("#clipboardStatus"),
      localClipboard: text("#localClipboardStatus"),
      fileClipboard: text("#fileClipboardStatus"),
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
      imageVisible: image?.classList.contains("is-visible") || false,
      imageHasSource: Boolean(image?.getAttribute("src")),
      logs,
    };
  })()`;
}

function installWebSocketSendRecorderExpression() {
  return `(() => {
    window.__lanDualSentMessages = [];
    window.__lanDualReceivedMessages = [];
    window.__lanDualCounters = {
      videoFrames: 0,
      audioFrames: 0,
    };
    window.__lanDualTimings = {
      installedAt: performance.now(),
      connectClickedAt: 0,
      firstAudioFrameAt: 0,
    };
    if (window.__lanDualWebSocketSendHooked) return true;
    const OriginalWebSocket = window.WebSocket;
    function RecordingWebSocket(...args) {
      const socket = new OriginalWebSocket(...args);
      const originalSend = socket.send.bind(socket);
      socket.addEventListener("message", (event) => {
        try {
          const parsed = JSON.parse(String(event.data));
          window.__lanDualReceivedMessages.push(parsed);
          if (parsed.type === "video_frame") {
            window.__lanDualCounters.videoFrames += 1;
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
        } catch {
          window.__lanDualReceivedMessages.push({ raw: String(event.data) });
        }
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

async function run() {
  const args = parseArgs(process.argv);
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  const clientUrl = `http://127.0.0.1:${args.clientPort}/`;
  const userDataDir = await mkdtemp(join(tmpdir(), "lan-dual-mac-client-edge-"));
  let windowsHost = null;
  let macClientServer = null;
  let browser = null;
  let session = null;
  let uploadDir = null;

  try {
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
      browserArgs.push("--headless=new", "--disable-gpu");
    }
    browserArgs.push(clientUrl);

    browser = startProcess(findBrowserPath(), browserArgs);
    attachProcessLog(browser, "browser");
    session = await connectCdp(args.debugPort, args.timeoutMs);
    await session.send("Runtime.enable");
    await session.send("Page.enable");
    await grantClipboardPermissions(session, clientUrl);
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
      !defaultSettingsSnapshot.displaySettings.includes("20 Mbps")
    ) {
      throw new Error(`Mac client default video settings mismatch: ${JSON.stringify(defaultSettingsSnapshot)}`);
    }
    if (args.enableAudio) {
      await clickElement(session, "#audioToggle");
      await waitFor(
        () => evaluate(session, "document.querySelector('#audioToggle')?.checked === true"),
        args.timeoutMs,
        "Mac client audio toggle",
      );
    }
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

    let lastSnapshot = null;
    if (args.expectAuthFailure) {
      const authFailureSnapshot = await waitFor(
        async () => {
          const value = await evaluate(session, buildSnapshotExpression());
          lastSnapshot = value;
          return matchesExpectedAuthFailure(value, args) ? value : null;
        },
        args.timeoutMs,
        "Mac client auth failure state",
      ).catch((error) => {
        if (lastSnapshot) {
          print("INFO", `Last connection: ${lastSnapshot.connection}`);
          print("INFO", `Last remote: ${lastSnapshot.remote}`);
          if (lastSnapshot.logs?.length) {
            print("INFO", `Last logs: ${lastSnapshot.logs.join(" | ")}`);
          }
        }
        throw error;
      });

      print("OK", `Auth failure: ${authFailureSnapshot.connection}`);
      if (authFailureSnapshot.logs.length > 0) {
        print("INFO", `Recent logs: ${authFailureSnapshot.logs.join(" | ")}`);
      }
      print("OK", "Mac client auth failure self-test passed");
      return;
    }

    const videoSnapshot = await waitFor(
      async () => {
        const value = await evaluate(session, buildSnapshotExpression());
        lastSnapshot = value;
        if (value.connection.includes("认证失败") || value.connection.includes("连接错误")) {
          throw new Error(`${value.connection}: ${value.logs?.join(" | ")}`);
        }
        const hasVideo = value.imageVisible && value.imageHasSource;
        const realVideoOk = !args.requireRealVideo || !value.video.includes("mock-svg");
        return value.connection.includes("已连接") && hasVideo && realVideoOk ? value : null;
      },
      args.timeoutMs,
      "Mac client video surface",
    ).catch((error) => {
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
    print("OK", `Initial video ready: ${initialVideoMs}ms`);
    if (!videoSnapshot.firstVideoMetric.includes("ms") || videoSnapshot.videoFlowMetric.includes("等待")) {
      throw new Error(`Mac client diagnostics did not update after video: ${JSON.stringify({
        firstVideoMetric: videoSnapshot.firstVideoMetric,
        videoFlowMetric: videoSnapshot.videoFlowMetric,
      })}`);
    }
    print("OK", `Diagnostics: ${videoSnapshot.firstVideoMetric} / ${videoSnapshot.videoFlowMetric}`);
    const sessionSettings = await evaluate(
      session,
      `(() => [...(window.__lanDualSentMessages || [])].find((message) => message.type === "session_offer"))()`,
    );
    if (
      Number(sessionSettings?.preferredWidth) !== 1920 ||
      Number(sessionSettings?.preferredHeight) !== 1080 ||
      Number(sessionSettings?.maxFps) !== 60 ||
      Number(sessionSettings?.maxBandwidthKbps) !== 20000 ||
      sessionSettings?.qualityPreset !== "balanced"
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
    print("OK", `Video settings: ${videoSnapshot.displaySettings}`);

    await observeMacClientVideo({ args, session });

    if (args.expectReconnect) {
      windowsHost = await verifyMacClientReconnect({ args, repoRoot, session, windowsHost });
    }

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
            .find((message) => message.type === "display_settings_ack"))()`,
        );
        const messageOk =
          Number(latestDisplaySettings?.width) === 2560 &&
          Number(latestDisplaySettings?.height) === 1440 &&
          Number(latestDisplaySettings?.fps) === 60 &&
          Number(latestDisplaySettings?.maxBandwidthKbps) === 40000 &&
          latestDisplaySettings?.qualityPreset === "sharp" &&
          latestDisplaySettings?.audio === Boolean(value.audioToggleChecked);
        const ackOk =
          latestDisplayAck?.accepted === true &&
          Number(latestDisplayAck?.width) === 2560 &&
          Number(latestDisplayAck?.height) === 1440 &&
          Number(latestDisplayAck?.fps) === 60 &&
          Number(latestDisplayAck?.requestedFps) === 60 &&
          Number(latestDisplayAck?.maxScreenFps) === 60 &&
          Number(latestDisplayAck?.maxBandwidthKbps) === 40000 &&
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
    );
    print("OK", `Display settings: ${displaySettingsSnapshot.displaySettings}`);

    if (args.expectAudioFrame) {
      const audioFrameSnapshot = await waitFor(
        async () => {
          const value = await evaluate(session, buildSnapshotExpression());
          lastSnapshot = value;
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
        args.timeoutMs,
        "Mac client audio frame",
      ).catch((error) => {
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
        audioSnapshot = await waitFor(
          async () => {
            const value = await evaluate(session, buildSnapshotExpression());
            lastSnapshot = value;
            return value.audioPlayedFrames > 0 ? value : null;
          },
          args.timeoutMs,
          "Mac client audio playback",
        ).catch((error) => {
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
      print("OK", `Audio: ${audioSnapshot.audio} / ${audioSnapshot.audioPlayback}${payloadText}${timingText}`);
      print("OK", `Audio diagnostics: ${audioSnapshot.audioFlowMetric}`);
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
        return value.clipboardTextValue === localClipboardText ? value : null;
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
          return accepted && modeOk ? value : null;
        },
        args.timeoutMs,
        "Mac client file clipboard result",
      );

      print("OK", `File clipboard: ${fileClipboardSnapshot.fileClipboard}`);
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
        const reconnectOk = value.reconnectMetric === "0 次";
        const surfaceCleared = !value.imageVisible && !value.imageHasSource;
        return connectionOk && videoStatusOk && firstVideoOk && videoFlowOk && audioFlowOk && reconnectOk && surfaceCleared
          ? value
          : null;
      },
      args.timeoutMs,
      "Mac client manual disconnect diagnostics reset",
    );
    print(
      "OK",
      `Disconnect reset: ${disconnectSnapshot.video} / ${disconnectSnapshot.firstVideoMetric} / ${disconnectSnapshot.videoFlowMetric} / ${disconnectSnapshot.audioFlowMetric} / ${disconnectSnapshot.reconnectMetric}`,
    );
    print("OK", "Mac client browser self-test passed");
  } finally {
    session?.close();
    browser?.kill();
    macClientServer?.kill();
    windowsHost?.kill();
    await delay(500);
    if (uploadDir) {
      await rm(uploadDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {});
    }
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {});
  }
}

run().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
