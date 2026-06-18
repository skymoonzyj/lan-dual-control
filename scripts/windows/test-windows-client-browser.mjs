import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  clientPort: 5197,
  debugPort: 9337,
  timeoutMs: 30000,
  progressIntervalMs: 10000,
  requireVideoSurface: true,
  requireH264: false,
  injectPcmAudio: false,
  diagnosticsOnly: false,
  expectDiscoveryRuntimeBuildId: "",
  headless: true,
  boardSummary: false,
};

let activeOutputArgs = null;
let lastBoardSummary = "";
let activeSummary = null;

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-client-browser.mjs [options]

Runs the Windows control client browser self-test against a Mac host. Without
--diagnosticsOnly it connects to the configured host and validates the video
surface, diagnostics, input guards, and optional audio injection.

Options:
  --host <host>                         Mac host address. Default: ${defaults.host}
  --port <port>                         Mac host port. Default: ${defaults.port}
  --discover                            Find the best Mac host with discover-lan-hosts before testing.
  --discoverNoLocalSubnets              With --discover, only probe 127.0.0.1 and explicit --host targets.
  --discoverTimeoutMs <ms>              Per-host discovery timeout. Default: ${defaults.discoverTimeoutMs}
  --password <password>                 Probe password. Default: LAN_DUAL_PASSWORD or demo-password.
  --promptPassword                      Prompt for the probe password without echoing it.
  --requirePassword                     Refuse empty/demo-password credentials before connecting.
  --clientPort <port>                   Local Windows client web port. Default: ${defaults.clientPort}
  --debugPort <port>                    Browser remote debugging port. Default: ${defaults.debugPort}
  --timeoutMs <ms>                      Per-step timeout. Default: ${defaults.timeoutMs}
  --progressIntervalMs <ms>             Print connection/video/audio wait progress every N ms; 0 disables. Default: ${defaults.progressIntervalMs}
  --headed                              Run browser headed instead of headless.
  --diagnosticsOnly                     Only run local UI diagnostics; do not connect to a Mac host.
  --boardSummary                        Print one secret-free Agent Link Board summary line on stdout; progress goes to stderr.
  --noRequireVideoSurface               Do not require a visible decoded video surface.
  --requireH264                         Require H.264/WebCodecs decoded video.
  --injectPcmAudio                      Inject a synthetic PCM frame into the page and require playback state.
  --expectDiscoveryRuntimeBuildId <id>  Require /discovery runtime.buildId before connecting.

Examples:
  node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly
  node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly --boardSummary
  node scripts/windows/test-windows-client-browser.mjs --discover --diagnosticsOnly --expectDiscoveryRuntimeBuildId <build-id>
  node scripts/windows/test-windows-client-browser.mjs --discover --diagnosticsOnly --boardSummary --expectDiscoveryRuntimeBuildId <build-id>
  node scripts/windows/test-windows-client-browser.mjs --host 192.168.1.20 --port 43770 --promptPassword --requirePassword --requireH264
  node scripts/windows/test-windows-client-browser.mjs --discover --promptPassword --requirePassword --requireH264
  node scripts/windows/test-windows-client-browser.mjs --host 127.0.0.1 --port 43770 --injectPcmAudio
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
    if (key === "discover") {
      args.discover = true;
      continue;
    }
    if (key === "discoverNoLocalSubnets") {
      args.discoverNoLocalSubnets = true;
      continue;
    }
    if (key === "noRequireVideoSurface") {
      args.requireVideoSurface = false;
      continue;
    }
    if (key === "requireH264") {
      args.requireH264 = true;
      args.requireVideoSurface = true;
      continue;
    }
    if (key === "injectPcmAudio") {
      args.injectPcmAudio = true;
      continue;
    }
    if (key === "diagnosticsOnly") {
      args.diagnosticsOnly = true;
      args.requireVideoSurface = false;
      continue;
    }
    if (key === "boardSummary") {
      args.boardSummary = true;
      continue;
    }
    if (key === "promptPassword") {
      args.promptPassword = true;
      continue;
    }
    if (key === "requirePassword") {
      args.requirePassword = true;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(args, key) && next && !next.startsWith("--")) {
      if (key === "password") {
        args.passwordProvided = true;
      }
      if (key === "host") {
        args.hostProvided = true;
      }
      args[key] = next;
      index += 1;
    }
  }

  args.clientPort = Number(args.clientPort);
  args.debugPort = Number(args.debugPort);
  args.timeoutMs = Number(args.timeoutMs);
  const progressIntervalMs = Number(args.progressIntervalMs);
  args.progressIntervalMs = Number.isFinite(progressIntervalMs)
    ? Math.max(0, progressIntervalMs)
    : defaults.progressIntervalMs;
  args.discoverTimeoutMs = Math.max(250, Number(args.discoverTimeoutMs) || defaults.discoverTimeoutMs);
  return args;
}

async function preparePassword(args) {
  if (args.diagnosticsOnly) return;
  if (args.promptPassword && args.passwordProvided) {
    throw new Error("--promptPassword cannot be combined with --password.");
  }
  if (args.promptPassword && process.env.LAN_DUAL_PASSWORD) {
    throw new Error("--promptPassword refuses to override an existing LAN_DUAL_PASSWORD. Unset it or omit --promptPassword.");
  }
  if (args.promptPassword) {
    print("INFO", "等待隐藏密码输入：输入时不会显示字符；这是正常等待，不是卡住。");
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

function print(kind, text) {
  const line = `[${kind}] ${text}`;
  if (activeOutputArgs?.boardSummary) {
    console.error(line);
  } else {
    console.log(line);
  }
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

function compactProgressText(value, maxLength = 100) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function compactBoardSummaryText(value, maxLength = 180) {
  return compactProgressText(value, maxLength)
    .replace(/[;|]/g, ",")
    .replace(/\b(LAN_DUAL_PASSWORD|password|passwd|pwd|token|secret)\s*[:=]\s*\S+/gi, "$1=<hidden>")
    .replace(/(--(?:password|token|secret))\s+\S+/gi, "$1 <hidden>");
}

function makeBoardSummary(summary) {
  const checks = Array.from(summary.checks || []);
  const checkText = checks.length ? checks.join(",") : "none";
  const discovery = summary.discoveryTarget
    ? `${summary.discoveryTarget}${summary.discoveryRuntimeBuild ? `/build=${summary.discoveryRuntimeBuild}` : ""}`
    : "skipped";
  const details = [];
  if (summary.remote) details.push(`remote=${compactBoardSummaryText(summary.remote, 120)}`);
  if (summary.discoveryDiagnostics) {
    details.push(`discoveryDiag=${compactBoardSummaryText(summary.discoveryDiagnostics, 120)}`);
  }
  if (summary.uiDiagnostics) details.push(`uiDiag=${compactBoardSummaryText(summary.uiDiagnostics, 140)}`);
  if (!summary.discoveryDiagnostics && !summary.uiDiagnostics && summary.diagnostics) {
    details.push(`diag=${compactBoardSummaryText(summary.diagnostics, 140)}`);
  }
  if (summary.fps) details.push(`fps=${compactBoardSummaryText(summary.fps, 80)}`);
  if (summary.audio) details.push(`audio=${compactBoardSummaryText(summary.audio, 80)}`);
  if (summary.surface) details.push(`surface=${summary.surface}`);
  if (summary.h264Errors !== "") details.push(`h264Errors=${summary.h264Errors}`);
  if (summary.error) details.push(`error=${compactBoardSummaryText(summary.error, 140)}`);
  const detailText = details.length ? ` ${details.join("; ")}.` : "";
  return [
    `Windows client diagnostics: ${summary.status}; mode=${summary.mode}; target=${summary.target}; discovery=${discovery}; checks=${checkText}.`,
    detailText.trim(),
    "No password was printed or sent to Agent Link Board; no input/inject was performed.",
  ].filter(Boolean).join(" ");
}

function emitBoardSummary(summary) {
  lastBoardSummary = makeBoardSummary(summary);
  if (activeOutputArgs?.boardSummary) {
    console.log(lastBoardSummary);
  }
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

function windowsClientSnapshotExpression() {
  return `(() => {
    const text = (selector) => document.querySelector(selector)?.textContent || "";
    const canvas = document.querySelector("#remoteVideoCanvas");
    const image = document.querySelector("#remoteFrameImage");
    const diagnostics = text("#hostDiagnosticsText");
    const status = text("#statusText");
    const remote = text("#remoteStatusText");
    const audio = text("#audioText");
    const logs = [...document.querySelectorAll("#eventLog li")]
      .slice(0, 10)
      .map((item) => item.innerText.replace(/\\s+/g, " "));
    return {
      status,
      remote,
      diagnostics,
      audio,
      metricFps: text("#metricFps"),
      webCodecs: typeof VideoDecoder,
      encodedVideoChunk: typeof EncodedVideoChunk,
      h264DecoderErrors: window.state?.h264DecoderErrorCount ?? 0,
      videoFrames: window.state?.videoFrames ?? 0,
      audioFrames: window.state?.audioFrames ?? 0,
      canvasVisible: canvas?.classList.contains("is-visible") || false,
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0,
      imageVisible: image?.classList.contains("is-visible") || false,
      imageHasSource: Boolean(image?.getAttribute("src")),
      logs,
    };
  })()`;
}

function snapshotProgressDetails(snapshot, extra = "") {
  if (!snapshot) return extra || "snapshot=pending";
  const parts = [];
  const add = (label, value) => {
    const text = compactProgressText(value);
    if (text) parts.push(`${label}=${text}`);
  };
  add("status", snapshot.status);
  add("remote", snapshot.remote);
  add("diagnostics", snapshot.diagnostics);
  add("fps", snapshot.metricFps);
  if (snapshot.audio || Number(snapshot.audioFrames) > 0) {
    add("audio", snapshot.audio);
  }
  if (Number(snapshot.videoFrames) > 0) {
    add("videoFrames", snapshot.videoFrames);
  }
  if (Number(snapshot.audioFrames) > 0) {
    add("audioFrames", snapshot.audioFrames);
  }
  if (Number(snapshot.h264DecoderErrors) > 0) {
    add("h264Errors", snapshot.h264DecoderErrors);
  }
  if (extra) parts.push(compactProgressText(extra));
  return parts.join(" · ") || "snapshot=pending";
}

async function waitForWindowsClientSnapshot({ args, session, label, timeoutMs, check, onSnapshot }) {
  const effectiveTimeoutMs = timeoutMs ?? args.timeoutMs;
  let latestSnapshot = null;
  print("INFO", `${label} waiting: timeout=${formatSeconds(effectiveTimeoutMs)}, progressEvery=${progressEveryText(args)}.`);
  return waitFor(
    async () => {
      const value = await evaluate(session, windowsClientSnapshotExpression());
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
        printTimedProgress(`${label} progress`, startedAt, deadline, snapshotProgressDetails(latestSnapshot, errorText));
      },
    },
  );
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
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function stopWindowsProcessesByCommandLine(matchText) {
  if (!matchText || process.platform !== "win32") return;
  spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      [
        "$match = $env:LAN_DUAL_PROCESS_MATCH",
        "Get-CimInstance Win32_Process |",
          "Where-Object { $_.CommandLine -and $_.CommandLine.Contains($match) } |",
          "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
      ].join(" "),
    ],
    {
      env: { ...process.env, LAN_DUAL_PROCESS_MATCH: matchText },
      stdio: "ignore",
      timeout: 10000,
      windowsHide: true,
    },
  );
}

function stopProcessTree(child, { commandLineMatch = "" } = {}) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    stopWindowsProcessesByCommandLine(commandLineMatch);
    spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Stop-Process -Id ${child.pid} -Force -ErrorAction SilentlyContinue`,
      ],
      {
        stdio: "ignore",
        timeout: 10000,
        windowsHide: true,
      },
    );
  } else if (child.exitCode === null && child.signalCode === null) {
    child.kill();
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }
  child.unref?.();
  child.stdout?.destroy();
  child.stderr?.destroy();
}

async function removeDirectoryBestEffort(path) {
  if (!path) return;
  if (process.platform === "win32") {
    spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Remove-Item -LiteralPath $env:LAN_DUAL_REMOVE_PATH -Recurse -Force -ErrorAction SilentlyContinue",
      ],
      {
        env: { ...process.env, LAN_DUAL_REMOVE_PATH: path },
        stdio: "ignore",
        timeout: 10000,
        windowsHide: true,
      },
    );
    return;
  }
  await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {});
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
    const timer = setTimeout(() => {
      child.kill();
      finish({ exitCode: null, signal: "timeout", timedOut: true, ok: false });
    }, options.timeoutMs ?? 15000);
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
    command: `node ${childArgs.join(" ")}`,
    target: `${args.host}:${args.port}`,
    foundMacHosts: Array.isArray(payload.macHosts) ? payload.macHosts.length : 1,
    runtimeBuild: best.runtime?.buildId || "",
    boardSummary: payload.boardSummary || "",
  };
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}`);
  }
  return response.json();
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
    const payload = JSON.stringify({ id, method, params });
    this.socket.send(payload);
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
  const targets = await waitFor(
    async () => {
      const list = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
      return list.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    },
    timeoutMs,
    "Edge DevTools target",
  );

  const socket = new WebSocket(targets.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP WebSocket error")), { once: true });
  });
  return new CdpSession(socket);
}

async function closeBrowserBestEffort(session) {
  if (!session) return;
  await Promise.race([session.send("Browser.close").catch(() => {}), delay(1000)]).catch(() => {});
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

async function verifyFloatingControlCenter(session) {
  const result = await evaluate(
    session,
    `(async () => {
      const valueOf = (selector) => document.querySelector(selector)?.value ?? "";
      const setValue = (selector, value, eventName = "change") => {
        const element = document.querySelector(selector);
        if (!element) return;
        element.value = value;
        element.dispatchEvent(new Event(eventName, { bubbles: true }));
      };
      const toggle = document.querySelector("#controlCenterToggle");
      const panel = document.querySelector("#controlCenterPanel");
      const remoteControlCenter = document.querySelector("#remoteControlCenter");
      const summary = document.querySelector("#floatingControlSummary");
      const audioToggle = document.querySelector("#audioToggle");
      if (!toggle || !panel || !remoteControlCenter || !summary) {
        return { ok: false, reason: "missing control center elements" };
      }

      const original = {
        quality: valueOf("#qualityPresetSelect"),
        resolution: valueOf("#resolutionSelect"),
        fps: valueOf("#fpsSelect"),
        bandwidth: valueOf("#bandwidthSelect"),
        display: valueOf("#displaySelect"),
        scale: valueOf("#scaleModeSelect"),
        audio: Boolean(audioToggle?.checked),
        volume: valueOf("#audioVolumeRange"),
      };

      if (panel.hidden) toggle.click();
      const opened = !panel.hidden && toggle.getAttribute("aria-expanded") === "true";
      const centerStyles = getComputedStyle(remoteControlCenter);
      const toggleStyles = getComputedStyle(toggle);
      const floatingLayer =
        centerStyles.position === "absolute" &&
        centerStyles.pointerEvents === "none" &&
        toggleStyles.pointerEvents === "auto";

      setValue("#floatingQualitySelect", "sharp");
      const qualitySynced =
        valueOf("#qualityPresetSelect") === "sharp" &&
        valueOf("#resolutionSelect") === "3840x2160" &&
        valueOf("#fpsSelect") === "120" &&
        valueOf("#bandwidthSelect") === "50";
      const summarySynced = summary.textContent.includes("120 Hz") && summary.textContent.includes("50 Mbps");

      setValue("#floatingQualitySelect", "original");
      const originalPresetSynced =
        valueOf("#qualityPresetSelect") === "original" &&
        valueOf("#resolutionSelect") === "3840x2160" &&
        valueOf("#fpsSelect") === "60" &&
        valueOf("#bandwidthSelect") === "50" &&
        valueOf("#scaleModeSelect") === "original";

      setValue("#floatingResolutionSelect", "1920x1080");
      setValue("#floatingFpsSelect", "144");
      setValue("#floatingBandwidthSelect", "40");
      const detailedSettingsSynced =
        valueOf("#qualityPresetSelect") === "custom" &&
        valueOf("#resolutionSelect") === "1920x1080" &&
        valueOf("#fpsSelect") === "144" &&
        valueOf("#bandwidthSelect") === "40";

      setValue("#floatingScaleSelect", "stretch");
      const scaleSynced =
        valueOf("#scaleModeSelect") === "stretch" &&
        document.querySelector("#remoteCanvas")?.classList.contains("scale-stretch");

      setValue("#floatingAudioSelect", "off");
      const audioSynced = !document.querySelector("#audioToggle")?.checked;

      setValue("#floatingAudioVolumeRange", "33", "input");
      const volumeSynced =
        valueOf("#audioVolumeRange") === "33" &&
        document.querySelector("#floatingAudioVolumeText")?.textContent === "33%";

      let connectionStatusText = "";
      const connectionStatusVisible = (() => {
        const floatingReconnectButton = document.querySelector("#floatingReconnectButton");
        const originalConnectionState = {
          connected: state.connected,
          connecting: state.connecting,
          connectionState: state.connectionState,
          activeHost: state.activeHost,
          activePort: state.activePort,
          reconnectAttempts: state.reconnectAttempts,
          reconnectTimer: state.reconnectTimer,
          reconnectDueAt: state.reconnectDueAt,
          reconnectReason: state.reconnectReason,
        };
        try {
          state.connected = false;
          state.connecting = false;
          state.connectionState = "reconnecting";
          state.activeHost = "192.168.31.122";
          state.activePort = "43770";
          state.reconnectAttempts = 2;
          state.reconnectTimer = 1;
          state.reconnectDueAt = Date.now() + 2400;
          state.reconnectReason = "测试断线";
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
          connectionStatusText = document.querySelector("#floatingConnectionStatus")?.textContent || "";
          return (
            connectionStatusText.includes("连接：") &&
            connectionStatusText.includes("秒后重连") &&
            connectionStatusText.includes("2/3") &&
            !floatingReconnectButton?.hidden &&
            !floatingReconnectButton?.disabled
          );
        } finally {
          state.connected = originalConnectionState.connected;
          state.connecting = originalConnectionState.connecting;
          state.connectionState = originalConnectionState.connectionState;
          state.activeHost = originalConnectionState.activeHost;
          state.activePort = originalConnectionState.activePort;
          state.reconnectAttempts = originalConnectionState.reconnectAttempts;
          state.reconnectTimer = originalConnectionState.reconnectTimer;
          state.reconnectDueAt = originalConnectionState.reconnectDueAt;
          state.reconnectReason = originalConnectionState.reconnectReason;
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
        }
      })();

      let audioStatusText = "";
      const audioStatusVisible = (() => {
        const audioToggleElement = document.querySelector("#audioToggle");
        const originalAudioState = {
          connected: state.connected,
          audioChecked: Boolean(audioToggleElement?.checked),
          audioFrames: state.audioFrames,
          audioLevel: state.audioLevel,
          audioPlayedFrames: state.audioPlayedFrames,
          audioDroppedFrames: state.audioDroppedFrames,
          audioLastError: state.audioLastError,
        };
        try {
          state.connected = true;
          if (audioToggleElement) audioToggleElement.checked = true;
          state.audioFrames = 24;
          state.audioLevel = 0.37;
          state.audioPlayedFrames = 20;
          state.audioDroppedFrames = 2;
          state.audioLastError = "";
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
          audioStatusText = document.querySelector("#floatingAudioStatus")?.textContent || "";
          return (
            audioStatusText.includes("接收 24 帧") &&
            audioStatusText.includes("电平 37%") &&
            audioStatusText.includes("33%") &&
            audioStatusText.includes("播放 20") &&
            audioStatusText.includes("丢 2")
          );
        } finally {
          state.connected = originalAudioState.connected;
          if (audioToggleElement) audioToggleElement.checked = originalAudioState.audioChecked;
          state.audioFrames = originalAudioState.audioFrames;
          state.audioLevel = originalAudioState.audioLevel;
          state.audioPlayedFrames = originalAudioState.audioPlayedFrames;
          state.audioDroppedFrames = originalAudioState.audioDroppedFrames;
          state.audioLastError = originalAudioState.audioLastError;
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
        }
      })();

      let clipboardStatusText = "";
      const clipboardStatusVisible = (() => {
        const clipboardToggleElement = document.querySelector("#clipboardToggle");
        const originalClipboardState = {
          connected: state.connected,
          checked: Boolean(clipboardToggleElement?.checked),
          fileTransferActive: state.fileTransferActive,
          remoteFileTransfers: new Map(state.remoteFileTransfers),
          receivedClipboardWriteStatus: { ...state.receivedClipboardWriteStatus },
          receivedClipboardFiles: [...state.receivedClipboardFiles],
          hostDiagnostics: { ...state.hostDiagnostics },
        };
        try {
          state.connected = true;
          if (clipboardToggleElement) clipboardToggleElement.checked = true;
          state.fileTransferActive = false;
          state.remoteFileTransfers = new Map([
            [
              "transfer-test",
              {
                fileCount: 2,
                receivedBytes: 1048576,
                totalBytes: 2097152,
                files: [],
              },
            ],
          ]);
          state.receivedClipboardWriteStatus = { kind: "", text: "" };
          state.receivedClipboardFiles = [];
          state.hostDiagnostics = {
            ...state.hostDiagnostics,
            clipboardText: true,
            clipboardTextMode: "system",
            clipboardFile: true,
            clipboardFileMode: "system",
          };
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
          clipboardStatusText = document.querySelector("#floatingClipboardStatus")?.textContent || "";
          return (
            clipboardStatusText.includes("接收 2 个文件") &&
            clipboardStatusText.includes("1.0 MB/2.0 MB")
          );
        } finally {
          state.connected = originalClipboardState.connected;
          if (clipboardToggleElement) clipboardToggleElement.checked = originalClipboardState.checked;
          state.fileTransferActive = originalClipboardState.fileTransferActive;
          state.remoteFileTransfers = originalClipboardState.remoteFileTransfers;
          state.receivedClipboardWriteStatus = originalClipboardState.receivedClipboardWriteStatus;
          state.receivedClipboardFiles = originalClipboardState.receivedClipboardFiles;
          state.hostDiagnostics = originalClipboardState.hostDiagnostics;
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
        }
      })();

      let videoStatusText = "";
      const videoStatusVisible = (() => {
        const originalVideoState = {
          connected: state.connected,
          actualVideoFps: state.actualVideoFps,
          negotiatedFps: state.negotiatedFps,
          requestedFps: state.requestedFps,
          hostDiagnostics: { ...state.hostDiagnostics },
        };
        try {
          state.connected = true;
          state.actualVideoFps = 22.9;
          state.negotiatedFps = 30;
          state.requestedFps = 60;
          state.hostDiagnostics = {
            ...state.hostDiagnostics,
            videoCodec: "h264",
            videoFrameAgeMs: 123,
            videoFrameClockSkewed: false,
            maxScreenFps: 30,
            streamFallbackReason: "H.264 启动超时，已回退 JPEG",
          };
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
          videoStatusText = document.querySelector("#floatingVideoStatus")?.textContent || "";
          return (
            videoStatusText.includes("H.264") &&
            videoStatusText.includes("实收 22.9 FPS") &&
            videoStatusText.includes("协商 30 Hz") &&
            videoStatusText.includes("请求 60 Hz") &&
            videoStatusText.includes("低于协商 30 Hz") &&
            videoStatusText.includes("远端上限 30 Hz") &&
            videoStatusText.includes("到达 123ms") &&
            videoStatusText.includes("回退")
          );
        } finally {
          state.connected = originalVideoState.connected;
          state.actualVideoFps = originalVideoState.actualVideoFps;
          state.negotiatedFps = originalVideoState.negotiatedFps;
          state.requestedFps = originalVideoState.requestedFps;
          state.hostDiagnostics = originalVideoState.hostDiagnostics;
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
        }
      })();
      const statusVisible =
        document.querySelector("#floatingFullscreenHint")?.textContent.includes("Esc") &&
        document.querySelector("#floatingConnectionStatus")?.textContent.includes("连接") &&
        document.querySelector("#floatingVideoStatus")?.textContent.includes("视频") &&
        document.querySelector("#floatingAudioStatus")?.textContent.includes("声音") &&
        document.querySelector("#floatingClipboardStatus")?.textContent.includes("剪贴板") &&
        document.querySelector("#floatingInputModeStatus")?.textContent.includes("输入") &&
        document.querySelector("#floatingSecurityStatus")?.textContent.includes("安全");

      const shortcutSent = (() => {
        const sent = [];
        const originalConnected = state.connected;
        const originalControlDirection = state.controlDirection;
        const originalClient = state.client;
        const originalInputEvents = state.inputEvents;
        const originalInputMode = state.hostDiagnostics.inputMode;
        try {
          state.connected = true;
          state.controlDirection = "windows_to_mac";
          state.hostDiagnostics.inputMode = "inject";
          state.client = {
            sendInputEvent(payload) {
              sent.push(payload);
            },
          };
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
          setValue("#floatingShortcutSelect", "copy");
          document.querySelector("#floatingShortcutButton")?.click();
          return (
            sent.length === 1 &&
            sent[0].shortcutProfile === "toolbar" &&
            sent[0].shortcutAction === "copy" &&
            sent[0].key === "c" &&
            sent[0].metaKey === true &&
            sent[0].remoteModifiers?.includes("meta")
          );
        } finally {
          state.connected = originalConnected;
          state.controlDirection = originalControlDirection;
          state.client = originalClient;
          state.inputEvents = originalInputEvents;
          state.hostDiagnostics.inputMode = originalInputMode;
          if (typeof updateInputStatus === "function") updateInputStatus();
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
        }
      })();

      let diagnosticsCopyText = "";
      const diagnosticsCopyVisible = await (async () => {
        const button = document.querySelector("#floatingCopyDiagnosticsButton");
        const eventLog = document.querySelector("#eventLog");
        const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
        const originalLogEntries = Array.isArray(state.logEntries) ? state.logEntries.slice() : [];
        const originalEventLogHtml = eventLog?.innerHTML || "";
        const originalButtonText = button?.textContent || "";
        const originalFeedbackTimer = state.copyDiagnosticsFeedbackTimer;
        if (!button || typeof copyLogsToClipboard !== "function") return false;
        try {
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
              writeText: async (text) => {
                diagnosticsCopyText = String(text);
              },
            },
          });
          button.click();
          await new Promise((resolve) => setTimeout(resolve, 0));
          return (
            !button.disabled &&
            diagnosticsCopyText.includes("\\n快速摘要\\n") &&
            diagnosticsCopyText.includes("\\n连接状态\\n") &&
            diagnosticsCopyText.includes("\\n本机协作\\n") &&
            diagnosticsCopyText.includes("- 当前状态：") &&
            diagnosticsCopyText.includes("- 本机被控密码：不导出") &&
            !diagnosticsCopyText.includes("demo-password") &&
            button.textContent.includes("已复制") &&
            state.logEntries[0]?.title === "诊断复制"
          );
        } finally {
          if (state.copyDiagnosticsFeedbackTimer && state.copyDiagnosticsFeedbackTimer !== originalFeedbackTimer) {
            window.clearTimeout(state.copyDiagnosticsFeedbackTimer);
          }
          state.copyDiagnosticsFeedbackTimer = originalFeedbackTimer;
          button.textContent = originalButtonText;
          if (originalClipboardDescriptor) {
            Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
          } else {
            try {
              delete navigator.clipboard;
            } catch {
              // Ignore cleanup failures in older browser contexts.
            }
          }
          state.logEntries = originalLogEntries;
          if (eventLog) eventLog.innerHTML = originalEventLogHtml;
        }
      })();

      document.querySelector("#floatingFullscreenButton")?.click();
      const shell = document.querySelector(".app-shell");
      const topbar = document.querySelector(".topbar");
      const remoteSurface = document.querySelector(".remote-surface");
      const fullscreenHint = document.querySelector("#fullscreenHint");
      const fullscreenHintText = document.querySelector("#fullscreenHintText")?.textContent || "";
      const fullscreenEntered =
        shell?.classList.contains("is-fullscreen") &&
        getComputedStyle(topbar).display === "none" &&
        getComputedStyle(remoteSurface).paddingTop === "0px";
      const fullscreenHintVisible =
        fullscreenHint?.classList.contains("is-visible") &&
        fullscreenHintText.includes("Esc") &&
        fullscreenHintText.includes("144 Hz") &&
        fullscreenHintText.includes("40 Mbps");

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      const fullscreenEscExited =
        !shell?.classList.contains("is-fullscreen") &&
        getComputedStyle(topbar).display !== "none";

      const originalRequestFullscreen = shell?.requestFullscreen;
      let immersiveRequestCalled = false;
      if (shell) {
        shell.requestFullscreen = () => {
          immersiveRequestCalled = true;
          return Promise.resolve();
        };
      }
      if (typeof enterImmersiveFullscreen === "function") {
        await enterImmersiveFullscreen();
      }
      await Promise.resolve();
      const immersiveFullscreenEntered =
        immersiveRequestCalled &&
        Boolean(state.immersiveFullscreen) &&
        shell?.classList.contains("is-fullscreen") &&
        document.querySelector("#fullscreenHintText")?.textContent.includes("真全屏");
      setFullscreen(false);
      if (shell && originalRequestFullscreen) {
        shell.requestFullscreen = originalRequestFullscreen;
      }

      if (panel.hidden) toggle.click();
      document.querySelector("#floatingFullscreenButton")?.click();

      if (panel.hidden) toggle.click();
      document.querySelector("#floatingWindowButton")?.click();
      const fullscreenExited =
        !shell?.classList.contains("is-fullscreen") &&
        getComputedStyle(topbar).display !== "none";
      if (panel.hidden) toggle.click();

      const monitorModeCheck = await (async () => {
        const monitorButton = document.querySelector("#monitorModeButton");
        const floatingMonitorButton = document.querySelector("#floatingMonitorModeButton");
        const monitorBar = document.querySelector("#monitorModeBar");
        const monitorStatus = document.querySelector("#monitorModeStatus");
        const restoreButton = document.querySelector("#monitorModeRestoreButton");
        const copyButton = document.querySelector("#monitorModeCopyButton");
        if (
          !monitorButton ||
          !floatingMonitorButton ||
          !monitorBar ||
          !monitorStatus ||
          !restoreButton ||
          !copyButton ||
          typeof setMonitorMode !== "function" ||
          typeof startMonitorModeDrag !== "function" ||
          typeof moveMonitorModeWindow !== "function" ||
          typeof stopMonitorModeDrag !== "function"
        ) {
          return { ok: false, reason: "missing monitor mode elements" };
        }

        const originalMonitorMode = state.monitorMode;
        const originalConnected = state.connected;
        const originalControlDirection = state.controlDirection;
        const originalClient = state.client;
        const originalInputEvents = state.inputEvents;
        const originalHostDiagnostics = { ...state.hostDiagnostics };
        const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
        const originalLogEntries = Array.isArray(state.logEntries) ? state.logEntries.slice() : [];
        const eventLog = document.querySelector("#eventLog");
        const originalEventLogHtml = eventLog?.innerHTML || "";
        const originalFeedbackTimer = state.copyDiagnosticsFeedbackTimer;
        const originalFloatingCopyText = document.querySelector("#floatingCopyDiagnosticsButton")?.textContent || "";
        const originalRemoteSurfaceStyle = remoteSurface?.getAttribute("style") || "";
        const sent = [];
        let copiedText = "";

        try {
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
              writeText: async (text) => {
                copiedText = String(text);
              },
            },
          });
          state.connected = true;
          state.controlDirection = "windows_to_mac";
          state.inputEvents = 10;
          state.hostDiagnostics = {
            ...state.hostDiagnostics,
            inputMode: "inject",
            inputAckStatus: "injected",
          };
          state.client = {
            sendInputEvent(payload) {
              sent.push(payload);
            },
          };
          if (typeof updateInputStatus === "function") updateInputStatus();
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();

          monitorButton.click();
          await Promise.resolve();
          const monitorSurfaceStyle = getComputedStyle(remoteSurface);
          const enteredByTopbar =
            state.monitorMode &&
            shell?.classList.contains("is-monitor-mode") &&
            !monitorBar.hidden &&
            getComputedStyle(topbar).display === "none" &&
            monitorSurfaceStyle.position === "fixed" &&
            monitorSurfaceStyle.pointerEvents === "auto" &&
            monitorStatus.textContent.includes("只监看") &&
            document.querySelector("#inputText")?.textContent.includes("只监看") &&
            document.querySelector("#floatingInputModeStatus")?.textContent.includes("只监看");

          const inputBefore = state.inputEvents;
          setValue("#floatingShortcutSelect", "copy");
          const shortcutButton = document.querySelector("#floatingShortcutButton");
          shortcutButton?.click();
          const inputBlocked =
            sent.length === 0 &&
            state.inputEvents === inputBefore &&
            Boolean(shortcutButton?.disabled);

          copyButton.click();
          await new Promise((resolve) => setTimeout(resolve, 0));
          const copiedMonitorDiagnostics =
            copiedText.includes("- 全屏浮层模式：监看小窗") &&
            copiedText.includes("只监看，不发送输入") &&
            !copiedText.includes("demo-password");

          const rect = remoteSurface.getBoundingClientRect();
          startMonitorModeDrag({
            button: 0,
            clientX: rect.left + 12,
            clientY: rect.top + 12,
            preventDefault() {},
          });
          moveMonitorModeWindow({
            clientX: rect.left + 48,
            clientY: rect.top + 34,
          });
          stopMonitorModeDrag();
          const dragHandled =
            remoteSurface.style.left.endsWith("px") &&
            remoteSurface.style.top.endsWith("px") &&
            remoteSurface.style.right === "auto" &&
            remoteSurface.style.bottom === "auto";

          restoreButton.click();
          const restoredByButton =
            !state.monitorMode &&
            !shell?.classList.contains("is-monitor-mode") &&
            monitorBar.hidden;

          if (panel.hidden) toggle.click();
          floatingMonitorButton.click();
          const enteredByFloating =
            state.monitorMode &&
            shell?.classList.contains("is-monitor-mode") &&
            !monitorBar.hidden &&
            panel.hidden;

          return {
            ok:
              enteredByTopbar &&
              inputBlocked &&
              copiedMonitorDiagnostics &&
              dragHandled &&
              restoredByButton &&
              enteredByFloating,
            enteredByTopbar,
            inputBlocked,
            copiedMonitorDiagnostics,
            dragHandled,
            restoredByButton,
            enteredByFloating,
            status: monitorStatus.textContent,
          };
        } finally {
          setMonitorMode(Boolean(originalMonitorMode));
          state.connected = originalConnected;
          state.controlDirection = originalControlDirection;
          state.client = originalClient;
          state.inputEvents = originalInputEvents;
          state.hostDiagnostics = originalHostDiagnostics;
          if (state.copyDiagnosticsFeedbackTimer && state.copyDiagnosticsFeedbackTimer !== originalFeedbackTimer) {
            window.clearTimeout(state.copyDiagnosticsFeedbackTimer);
          }
          state.copyDiagnosticsFeedbackTimer = originalFeedbackTimer;
          const floatingCopyButton = document.querySelector("#floatingCopyDiagnosticsButton");
          if (floatingCopyButton) floatingCopyButton.textContent = originalFloatingCopyText;
          state.logEntries = originalLogEntries;
          if (eventLog) eventLog.innerHTML = originalEventLogHtml;
          if (remoteSurface) {
            if (originalRemoteSurfaceStyle) {
              remoteSurface.setAttribute("style", originalRemoteSurfaceStyle);
            } else {
              remoteSurface.removeAttribute("style");
            }
          }
          if (originalClipboardDescriptor) {
            Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
          } else {
            try {
              delete navigator.clipboard;
            } catch {
              // Ignore cleanup failures in older browser contexts.
            }
          }
          if (typeof updateInputStatus === "function") updateInputStatus();
          if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
        }
      })();

      document.querySelector("#qualityPresetSelect").value = original.quality;
      document.querySelector("#resolutionSelect").value = original.resolution;
      document.querySelector("#fpsSelect").value = original.fps;
      document.querySelector("#bandwidthSelect").value = original.bandwidth;
      document.querySelector("#displaySelect").value = original.display;
      document.querySelector("#scaleModeSelect").value = original.scale;
      document.querySelector("#audioToggle").checked = original.audio;
      document.querySelector("#audioVolumeRange").value = original.volume;
      if (typeof updateMetrics === "function") updateMetrics();
      if (typeof applyScaleMode === "function") applyScaleMode();
      if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
      toggle.click();

      return {
        ok:
          opened &&
          floatingLayer &&
          summarySynced &&
          qualitySynced &&
          originalPresetSynced &&
          detailedSettingsSynced &&
          scaleSynced &&
          audioSynced &&
          volumeSynced &&
          statusVisible &&
          connectionStatusVisible &&
          audioStatusVisible &&
          clipboardStatusVisible &&
          videoStatusVisible &&
          shortcutSent &&
          diagnosticsCopyVisible &&
          fullscreenEntered &&
          fullscreenHintVisible &&
          fullscreenEscExited &&
          immersiveFullscreenEntered &&
          fullscreenExited &&
          monitorModeCheck.ok,
        opened,
        floatingLayer,
        summarySynced,
        summary: summary.textContent,
        qualitySynced,
        originalPresetSynced,
        detailedSettingsSynced,
        scaleSynced,
        audioSynced,
        volumeSynced,
        statusVisible,
        connectionStatusVisible,
        connectionStatusText,
        audioStatusVisible,
        audioStatusText,
        clipboardStatusVisible,
        clipboardStatusText,
        videoStatusVisible,
        videoStatusText,
        shortcutSent,
        diagnosticsCopyVisible,
        diagnosticsCopyTextLength: diagnosticsCopyText.length,
        fullscreenEntered,
        fullscreenHintVisible,
        fullscreenEscExited,
        immersiveFullscreenEntered,
        fullscreenExited,
        monitorModeCheck,
        closed: panel.hidden,
        restored: {
          quality: valueOf("#qualityPresetSelect"),
          resolution: valueOf("#resolutionSelect"),
          fps: valueOf("#fpsSelect"),
          bandwidth: valueOf("#bandwidthSelect"),
          scale: valueOf("#scaleModeSelect"),
          audio: Boolean(document.querySelector("#audioToggle")?.checked),
          volume: valueOf("#audioVolumeRange"),
        },
      };
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`floating control center check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyDesktopOnlyHostPanel(session) {
  const result = await evaluate(
    session,
    `(() => {
      const badge = document.querySelector("#localHostBadge");
      const status = document.querySelector("#localHostStatusText");
      const watcherBadge = document.querySelector("#localMacAlertWatcherBadge");
      const watcherStatus = document.querySelector("#localMacAlertWatcherStatusText");
      const buttons = [
        "#localHostReadinessButton",
        "#localHostStartButton",
        "#localHostFirewallButton",
        "#localHostStopButton",
        "#localHostReverseGrantButton",
        "#localMacAlertWatcherToggleButton",
        "#localMacAlertWatcherRefreshButton",
      ].map((selector) => document.querySelector(selector));
      const inputs = [
        "#localHostPortInput",
        "#localHostPasswordInput",
        "#localHostScreenModeSelect",
        "#localHostAudioModeSelect",
        "#localHostInputModeSelect",
        "#localHostReverseControlModeSelect",
        "#localHostReadinessProfileSelect",
        "#localHostProbeMediaToggle",
      ].map((selector) => document.querySelector(selector));
      const profileSelect = document.querySelector("#localHostReadinessProfileSelect");
      const probeMediaToggle = document.querySelector("#localHostProbeMediaToggle");
      const reverseSelect = document.querySelector("#localHostReverseControlModeSelect");
      const originalReverseValue = reverseSelect?.value || "";
      const originalProbeMediaChecked = Boolean(probeMediaToggle?.checked);
      const profileOptions = Array.from(profileSelect?.options || []).map((option) => option.value);
      const defaultLaunchRequest =
        typeof buildLocalHostLaunchRequest === "function"
          ? buildLocalHostLaunchRequest()
          : {};
      if (reverseSelect) reverseSelect.value = "accept";
      const acceptLaunchRequest =
        typeof buildLocalHostLaunchRequest === "function"
          ? buildLocalHostLaunchRequest()
          : {};
      if (reverseSelect) reverseSelect.value = originalReverseValue;
      const readinessRequest =
        typeof buildLocalHostReadinessRequest === "function"
          ? buildLocalHostReadinessRequest()
          : {};
      if (probeMediaToggle) probeMediaToggle.checked = true;
      const mediaReadinessRequest =
        typeof buildLocalHostReadinessRequest === "function"
          ? buildLocalHostReadinessRequest()
          : {};
      if (probeMediaToggle) probeMediaToggle.checked = originalProbeMediaChecked;
      const statusRequest =
        typeof buildLocalHostStatusRequest === "function"
          ? buildLocalHostStatusRequest()
          : {};
      const watcherRequest =
        typeof buildMacAlertWatcherRequest === "function"
          ? buildMacAlertWatcherRequest()
          : {};
      const macAlertFindingText = [
        "MacUnattendedStatus=attention warnings=launch-agent-missing,launch-agent-max-fps,power-risk blockers=none",
        "MacFormalStatus=ready with warnings: blockers: none warnings: video,build,auth,windows-host,repo",
        "MacResumeStatus=ready with warnings blockers=none warnings=h264-fallback,fps-limit",
        "MacHostReadiness=attention blockers=none warnings=mac-host-discovery,agent-link-board-currentcall,mac-host-max-fps",
        "MacHostSafeStart=node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770",
        "MacMaxFpsSafeStart=node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770 --maxScreenFps 60",
        "MacClientDiscoverWindows=node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary",
        "WindowsLanRisk=no-firewall-allow,public-profile",
        "WindowsFirewallStatus=node scripts/windows/check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --json",
        "WindowsFirewallPreview=node scripts/windows/check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --dryRunRule --ruleProfile Private",
        "MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs --host 192.168.31.68 --port 43770 --boardSummary",
        "MacFormalLocalSmoke=failed blockers=auth warnings=video",
        "RerunFormalLocalSmoke=node scripts/mac/check-mac-formal-local-smoke.mjs --host 127.0.0.1 --port 43770 --promptPassword --boardSummary",
        "WindowsReverseGrantStatus=pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Status -BoardSummary",
        "WindowsOpenOneTimeReverseGrant=pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Grant -DurationMs 30000 -BoardSummary",
        "WindowsSecureAuthPath=node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port 43770 --promptPassword --requirePassword",
        "run-mac-client-formal-smoke preflight ready=false blockers=windows-host warnings=board",
        "MacHeartbeat=status=ok; checkedAt=2020-01-01T00:00:00.000Z; device=Mac; codex=ok status=coding updatedAt=2020-01-01T00:00:00.000Z ageMs=999999; macHost=online 127.0.0.1:43770; macClient=online http://127.0.0.1:5188/; board=ok boardUpdatedAt=2020-01-01T00:00:00.000Z; blockers=none warnings=none reason=ok",
        "MacHeartbeat=stale heartbeat missing; Mac host /discovery unreachable ECONNREFUSED; HTTP 502 Bad Gateway",
        "MacHeartbeat=status=blocked; codex=mac-codex-stale; blockers=mac-codex-stale warnings=none reason=mac-codex-stale",
        "MacHeartbeat=status=warning; codex=codex-reconnect-signal; blockers=none warnings=codex-reconnect-signal reason=codex-reconnect-signal",
        "MacHeartbeat=blocked reason=codex-reconnect-stuck evidence=正在重新连接 5/5 / stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses) suggestedAction=请用户查看 Mac Codex 窗口",
        "MacHeartbeatOnce=node scripts/mac/watch-mac-heartbeat.mjs --once --sendStatus --boardSummary",
        "MacHeartbeatWatch=node scripts/mac/watch-mac-heartbeat.mjs --sendStatus --intervalMs 30000",
        "MacHeartbeatStart=node scripts/mac/start-mac-heartbeat-watcher.mjs --host 127.0.0.1 --port 43770 --server http://192.168.31.68:17888 --intervalMs 30000 --boardSummary",
        "MacHeartbeatStatus=node scripts/mac/start-mac-heartbeat-watcher.mjs --status --host 127.0.0.1 --port 43770 --server http://192.168.31.68:17888 --boardSummary",
        "MacHeartbeatStop=node scripts/mac/start-mac-heartbeat-watcher.mjs --stop --host 127.0.0.1 --port 43770 --server http://192.168.31.68:17888 --boardSummary",
      ].join("; ");
      const macAlertFindingSummary = "Mac side status alert - Mac Codex | " + macAlertFindingText;
      const watcherRunningView =
        typeof macAlertWatcherUiState === "function"
          ? macAlertWatcherUiState({
              ok: true,
              action: "status",
              running: true,
              processIds: [1357],
              server: "http://192.168.31.68:17888",
              recentAlerts: [
                {
                  at: "2026-06-18 10:31:00",
                  title: "Mac side status alert - Mac Codex",
                  message: macAlertFindingText,
                  summary: macAlertFindingSummary,
                },
              ],
              lastAlert: {
                at: "2026-06-18 10:31:00",
                title: "Mac side status alert - Mac Codex",
                message: macAlertFindingText,
                summary: macAlertFindingSummary,
              },
              message: "Mac alert watcher is running.",
            }, { available: true, busy: false })
          : {};
      const watcherStoppedView =
        typeof macAlertWatcherUiState === "function"
          ? macAlertWatcherUiState({
              ok: true,
              action: "status",
              running: false,
              processIds: [],
              server: "http://192.168.31.68:17888",
              message: "Mac alert watcher is not running.",
            }, { available: true, busy: false })
          : {};
      const previousWatcherCheckedAt = typeof state === "object" ? state.localMacAlertWatcherStatusCheckedAt || 0 : 0;
      if (typeof state === "object") state.localMacAlertWatcherStatusCheckedAt = 1000;
      const freshHeartbeatNoStale =
        typeof parseMacHeartbeatFreshness === "function"
          ? parseMacHeartbeatFreshness(
              [
                "MacHeartbeat=status=ok; checkedAt=2020-01-01T00:00:00.000Z; updatedAt=2020-01-01T00:00:00.000Z; ageMs=999999; boardUpdatedAt=2020-01-01T00:00:00.000Z",
                "MacHeartbeat=status=ok; checkedAt=2026-06-18T10:00:00.000Z; updatedAt=2026-06-18T09:59:55.000Z; ageMs=65000; boardUpdatedAt=2026-06-18T10:00:02.000Z",
              ].join("; "),
              Date.parse("2026-06-18T10:01:00.000Z"),
            )
          : null;
      const watcherThrottleBefore =
        typeof shouldRefreshMacAlertWatcherStatus === "function"
          ? shouldRefreshMacAlertWatcherStatus(15999)
          : null;
      const watcherThrottleAtLimit =
        typeof shouldRefreshMacAlertWatcherStatus === "function"
          ? shouldRefreshMacAlertWatcherStatus(16000)
          : null;
      const watcherThrottleNoCache = (() => {
        if (typeof shouldRefreshMacAlertWatcherStatus !== "function" || typeof state !== "object") return null;
        state.localMacAlertWatcherStatusCheckedAt = 0;
        return shouldRefreshMacAlertWatcherStatus(2000);
      })();
      if (typeof state === "object") state.localMacAlertWatcherStatusCheckedAt = previousWatcherCheckedAt;
      const heartbeatCommandCheck = (() => {
        if (
          typeof state !== "object" ||
          typeof getMacHeartbeatCommands !== "function" ||
          typeof updateMacHeartbeatCommandButtons !== "function"
        ) {
          return { ok: false, reason: "missing heartbeat command helpers" };
        }
        const originalFindingText = state.localMacAlertWatcherFindingText || "";
        const originalStatusText = watcherStatus?.textContent || "";
        try {
          state.localMacAlertWatcherFindingText = macAlertFindingText;
          if (watcherStatus) watcherStatus.textContent = "Windows 浮窗提醒已开启。" + macAlertFindingText;
          const commands = getMacHeartbeatCommands();
          updateMacHeartbeatCommandButtons();
          const commandButtons = Array.from(document.querySelectorAll("[data-mac-heartbeat-command]"));
          const buttonTitles = Object.fromEntries(
            commandButtons.map((button) => [button.dataset.macHeartbeatCommand, button.title || ""]),
          );
          return {
            ok:
              commands.once === "node scripts/mac/watch-mac-heartbeat.mjs --once --sendStatus --boardSummary" &&
              commands.watch === "node scripts/mac/watch-mac-heartbeat.mjs --sendStatus --intervalMs 30000" &&
              commands.start?.includes("start-mac-heartbeat-watcher.mjs") &&
              commands.start?.includes("--intervalMs 30000") &&
              commands.status?.includes("start-mac-heartbeat-watcher.mjs --status") &&
              commands.stop?.includes("start-mac-heartbeat-watcher.mjs --stop") &&
              commandButtons.length === 5 &&
              commandButtons.every((button) => !button.disabled) &&
              buttonTitles.once?.includes("watch-mac-heartbeat.mjs --once") &&
              buttonTitles.start?.includes("start-mac-heartbeat-watcher.mjs"),
            commands,
            buttonTitles,
            disabled: commandButtons.map((button) => Boolean(button.disabled)),
          };
        } finally {
          state.localMacAlertWatcherFindingText = originalFindingText;
          if (watcherStatus) watcherStatus.textContent = originalStatusText;
          updateMacHeartbeatCommandButtons();
        }
      })();
      const readinessHeaderLines =
        typeof readinessLines === "function"
          ? readinessLines({
              json: {
                args: {
                  profile: "deploy",
                  currentBuildId: "client-test",
                  maxVideoFrameAgeMs: 1000,
                  maxAudioFrameAgeMs: 750,
                  probeMedia: true,
                },
                board: {
                  requested: true,
                  ok: true,
                  currentCall: {
                    present: true,
                    active: true,
                    from: "Mac Codex",
                    need: "Windows Codex",
                    goal: "正式 Windows host 验收",
                    needsWindows: true,
                    fromMacSide: true,
                    command: "node scripts/mac/check-mac-client-formal-status.mjs --sendCall --secret should-not-render",
                  },
                },
                results: [
                  {
                    ok: true,
                    label: "Windows host video observation",
                    summary: "passed",
                    warnings: [],
                    errors: [],
                  },
                  {
                    ok: true,
                    label: "Windows host media aggregate",
                    summary: "Windows media: ok | target=127.0.0.1:43772 | No passwords in summary; no input/inject.",
                    details: {
                      summary: {
                        status: "ok",
                        passed: 2,
                        failed: 0,
                      },
                      video: {
                        observation: {
                          frameCount: 144,
                          fps: 57.33,
                          maxGapMs: 39,
                          maxFrameAgeMs: 2,
                        },
                      },
                      audio: {
                        observation: {
                          frameCount: 108,
                          fps: 50.2,
                          maxGapMs: 32,
                          maxFrameAgeMs: 10,
                          steady: {
                            fps: 50,
                          },
                        },
                      },
                    },
                    warnings: [],
                    errors: [],
                  },
                ],
              },
            })
          : [];
      const readinessHeaderText = readinessHeaderLines.join("\\n");
      const readinessSummaryText =
        typeof readinessSummary === "function"
          ? readinessSummary({
              json: {
                args: {
                  profile: "default",
                  probeMedia: true,
                },
                passed: 9,
                failed: 0,
                warnings: 1,
                results: [
                  {
                    ok: true,
                    label: "Windows host media aggregate",
                    details: {
                      summary: {
                        status: "ok",
                        passed: 2,
                        failed: 0,
                      },
                    },
                    warnings: [],
                    errors: [],
                  },
                ],
              },
            })
          : "";
      const helperResult = {
        json: {
          ok: true,
          probe: {
            url: "http://127.0.0.1:43770/discovery",
          },
          runtime: {
            processId: 2468,
            uptimeSeconds: 65,
            buildId: "helper-test",
          },
          capabilities: {
            screen: {
              capturePipeline: "windows-ffmpeg-gdigrab-h264",
              videoCodec: "h264",
              videoEncoding: "annexb-base64",
            },
            audio: {
              mode: "wasapi",
              backend: "wasapi",
              mockFrames: false,
              sampleRate: 48000,
              channels: 2,
            },
            input: {
              mode: "log",
              backend: "sendinput-helper",
              helper: true,
            },
            reverseControl: {
              supported: true,
              mode: "deny",
              requiresConfirmation: true,
              autoAccept: false,
              policy: {
                mode: "deny",
              },
              grant: {
                active: false,
                remainingMs: 0,
                oneTime: true,
                lastRequest: {
                  active: true,
                  status: "rejected_needs_grant",
                  requestId: "reverse-request-ui",
                  requester: "Mac client",
                  requestedAt: "2026-06-16T12:00:00.000Z",
                  updatedAt: "2026-06-16T12:00:00.000Z",
                  reason: "confirmation required",
                  ageMs: 23000,
                  expiresAt: "2026-06-16T12:02:00.000Z",
                },
              },
            },
            clipboard: {
              text: true,
              textMode: "system",
              file: true,
              fileMode: "clipboard",
            },
          },
          warnings: ["WGC fallback: demo"],
          board: {
            requested: true,
            ok: true,
            currentCall: {
              present: true,
              active: true,
              from: "Mac Codex",
              need: "Windows Codex",
              goal: "正式 Windows host 验收",
              needsWindows: true,
              fromMacSide: true,
              command: "node scripts/mac/check-mac-client-formal-status.mjs --sendCall --secret should-not-render",
            },
          },
          buildDiff: {
            changed: false,
            message: "No Windows host runtime source changes since old-build.",
          },
        },
      };
      const helperStatus =
        typeof normalizeLocalHostHelperStatus === "function"
          ? normalizeLocalHostHelperStatus(helperResult)
          : null;
      const helperSummary =
        typeof localHostHelperStatusSummary === "function"
          ? localHostHelperStatusSummary(helperStatus, { managedPid: "2468" })
          : "";
      const helperLinesText =
        typeof localHostHelperStatusLines === "function"
          ? localHostHelperStatusLines(helperResult).join("\\n")
          : "";
      const grantReverseText =
        typeof formatLocalHostReverseControlStatus === "function"
          ? formatLocalHostReverseControlStatus({
              supported: true,
              mode: "deny",
              requiresConfirmation: true,
              grant: {
                active: true,
                remainingMs: 30000,
                oneTime: true,
              },
            })
          : "";
      const offlineHelperLinesText =
        typeof localHostHelperStatusLines === "function"
          ? localHostHelperStatusLines({
              json: {
                ok: false,
                probe: {
                  host: "127.0.0.1",
                  port: 43770,
                },
                error: {
                  message: "connect ECONNREFUSED 127.0.0.1:43770",
                },
                board: {
                  requested: true,
                  ok: true,
                  currentCall: {
                    present: true,
                    active: false,
                    from: "Mac Codex",
                    need: "Windows Codex",
                    goal: "已完成的 Windows host 验收",
                    needsWindows: true,
                    fromMacSide: true,
                    command: "done command should-not-render",
                  },
                },
              },
            }).join("\\n")
          : "";

      return {
        ok:
          typeof getTauriInvoke === "function" &&
          typeof canUseDesktopHostControl === "function" &&
          typeof buildLocalHostReadinessRequest === "function" &&
          typeof buildLocalHostStatusRequest === "function" &&
          typeof buildMacAlertWatcherRequest === "function" &&
          typeof macAlertWatcherUiState === "function" &&
          typeof shouldRefreshMacAlertWatcherStatus === "function" &&
          typeof refreshMacAlertWatcherStatus === "function" &&
          typeof toggleMacAlertWatcher === "function" &&
          typeof normalizeLocalHostHelperStatus === "function" &&
          typeof localHostHelperStatusSummary === "function" &&
          typeof localHostHelperStatusLines === "function" &&
          typeof grantLocalHostReverseControl === "function" &&
          typeof maxNativeClipboardFileBytes === "number" &&
          typeof maxClipboardFileBytes === "number" &&
          typeof nativeClipboardChunkSizeBytes === "number" &&
          getTauriInvoke() === null &&
          canUseDesktopHostControl() === false &&
          badge?.textContent === "需桌面版" &&
          status?.textContent.includes("浏览器预览版") &&
          watcherBadge?.textContent === "需桌面版" &&
          watcherStatus?.textContent.includes("Windows 浮窗提醒") &&
          buttons.every((button) => button?.disabled) &&
          inputs.every((input) => input?.disabled) &&
          profileSelect?.value === "default" &&
          probeMediaToggle?.checked === false &&
          profileOptions.join(",") === "default,deploy,deep" &&
          defaultLaunchRequest.reverseControlMode === "deny" &&
          acceptLaunchRequest.reverseControlMode === "accept" &&
          readinessRequest.profile === "default" &&
          readinessRequest.probeMedia === false &&
          mediaReadinessRequest.probeMedia === true &&
          readinessRequest.checkBoard === true &&
          statusRequest.host === "127.0.0.1" &&
          statusRequest.port === readinessRequest.port &&
          statusRequest.checkBoard === true &&
          watcherRequest.server === "http://192.168.31.68:17888" &&
          watcherRunningView.running === true &&
          watcherRunningView.badgeText === "提醒中" &&
          watcherRunningView.toggleText === "停止提醒" &&
          watcherRunningView.statusText.includes("PID 1357") &&
          watcherRunningView.statusText.includes("192.168.31.68") &&
          watcherRunningView.statusText.includes("最近提醒") &&
          watcherRunningView.statusText.includes("MacUnattendedStatus=attention") &&
          watcherRunningView.statusText.includes("风险：") &&
          watcherRunningView.statusText.includes("视频链路需检查") &&
          watcherRunningView.statusText.includes("运行版本需检查") &&
          watcherRunningView.statusText.includes("认证/密码步骤待确认") &&
          watcherRunningView.statusText.includes("Windows 被控端未指定或未就绪") &&
          watcherRunningView.statusText.includes("仓库状态需检查") &&
          watcherRunningView.statusText.includes("LaunchAgent 刷新率上限需调整") &&
          watcherRunningView.statusText.includes("Mac 心跳摘要过旧") &&
          watcherRunningView.statusText.includes("Mac 心跳过期") &&
          watcherRunningView.statusText.includes("Mac 后台心跳启动命令已提供") &&
          watcherRunningView.statusText.includes("Mac 后台心跳状态命令已提供") &&
          watcherRunningView.statusText.includes("Mac 后台心跳停止命令已提供") &&
          watcherRunningView.statusText.includes("Windows 安全认证路径已提供") &&
          watcherRunningView.statusText.includes("Mac host 不可达") &&
          watcherRunningView.statusText.includes("Mac/API 网络错误") &&
          watcherRunningView.statusText.includes("Mac Codex 可能卡在重新连接 5/5") &&
          watcherRunningView.statusText.includes("stream disconnected before completion") &&
          watcherRunningView.statusText.includes("请查看 Mac 窗口") &&
          watcherStoppedView.running === false &&
          watcherStoppedView.badgeText === "未开启" &&
          watcherStoppedView.toggleText === "开启提醒" &&
          watcherStoppedView.statusText.includes("未开启") &&
          watcherThrottleBefore === false &&
          watcherThrottleAtLimit === true &&
          watcherThrottleNoCache === true &&
          freshHeartbeatNoStale?.stale === false &&
          freshHeartbeatNoStale?.summary.includes("心跳检查 1 分钟前") &&
          heartbeatCommandCheck.ok &&
          readinessHeaderText.includes("client-test") &&
          readinessHeaderText.includes("1000 ms") &&
          readinessHeaderText.includes("750 ms") &&
          readinessHeaderText.includes("媒体基线：正常") &&
          readinessHeaderText.includes("视频 144 帧") &&
          readinessHeaderText.includes("音频 108 帧") &&
          readinessHeaderText.includes("Windows host video observation") &&
          readinessHeaderText.includes("Mac 正在请求 Windows 配合") &&
          !readinessHeaderText.includes("should-not-render") &&
          readinessSummaryText.includes("媒体基线正常") &&
          helperStatus?.runtime?.buildId === "helper-test" &&
          helperSummary.includes("PID 2468") &&
          helperSummary.includes("FFmpeg gdigrab H.264") &&
          helperSummary.includes("WASAPI") &&
          helperSummary.includes("反控 刚收到请求") &&
          grantReverseText.includes("临时允许 30 秒") &&
          helperSummary.includes("通讯板有 Mac→Windows 呼叫") &&
          helperLinesText.includes("状态助手") &&
          helperLinesText.includes("[CALL] 通讯板") &&
          helperLinesText.includes("正式 Windows host 验收") &&
          !helperLinesText.includes("should-not-render") &&
          helperLinesText.includes("build helper-test") &&
          helperLinesText.includes("反控：刚收到请求") &&
          helperLinesText.includes("反控请求：Mac client") &&
          helperLinesText.includes("临时允许反控") &&
          helperLinesText.includes("剪贴板") &&
          helperLinesText.includes("WGC fallback") &&
          offlineHelperLinesText.includes("离线") &&
          offlineHelperLinesText.includes("ECONNREFUSED") &&
          offlineHelperLinesText.includes("currentCall 已完成/非待办") &&
          !offlineHelperLinesText.includes("should-not-render") &&
          maxNativeClipboardFileBytes === maxClipboardFileBytes &&
          nativeClipboardChunkSizeBytes === 1024 * 1024,
        badge: badge?.textContent || "",
        status: status?.textContent || "",
        watcherBadge: watcherBadge?.textContent || "",
        watcherStatus: watcherStatus?.textContent || "",
        profile: profileSelect?.value || "",
        requestProfile: readinessRequest.profile || "",
        requestProbeMedia: readinessRequest.probeMedia,
        mediaRequestProbeMedia: mediaReadinessRequest.probeMedia,
        defaultLaunchRequest,
        acceptLaunchRequest,
        statusRequest,
        watcherRequest,
        watcherRunningView,
        watcherStoppedView,
        watcherThrottleBefore,
        watcherThrottleAtLimit,
        watcherThrottleNoCache,
        freshHeartbeatNoStale,
        heartbeatCommandCheck,
        readinessHeader: readinessHeaderLines.slice(0, 4),
        readinessSummaryText,
        helperSummary,
        helperLinesText,
        offlineHelperLinesText,
        buttonsDisabled: buttons.map((button) => Boolean(button?.disabled)),
        inputsDisabled: inputs.map((input) => Boolean(input?.disabled)),
        maxNativeClipboardFileBytes,
        maxClipboardFileBytes,
        nativeClipboardChunkSizeBytes,
      };
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`desktop-only host panel check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyFileClipboardRecoveryText(session) {
  const result = await evaluate(
    session,
    `(async () => {
      if (
        typeof fileClipboardRecoveryText !== "function" ||
        typeof fileClipboardLocalDetail !== "function" ||
        typeof describeOutgoingFileTransferStatus !== "function" ||
        typeof describeLastOutgoingFileTransferStatus !== "function" ||
        typeof describeIncomingFileTransferStatus !== "function" ||
        typeof expireStaleRemoteFileTransfers !== "function" ||
        typeof renderReceivedFiles !== "function" ||
        typeof openReceivedFilesTempPath !== "function" ||
        typeof updateReceivedFilesWriteStatusFromResult !== "function"
      ) {
        return { ok: false, reason: "missing file clipboard recovery helpers" };
      }
      if (typeof state !== "object" || typeof elements !== "object") {
        return { ok: false, reason: "missing app state" };
      }

      const tempResult = {
        clipboardWritten: false,
        saveMode: "temp",
        reason: "系统文件剪贴板写入失败",
        rootDir: "C:/Temp/lan-dual-control/clip-1",
        paths: ["C:/Temp/lan-dual-control/clip-1/001-demo.zip"],
      };
      const memoryResult = {
        clipboardWritten: false,
        saveMode: "memory-only",
        reason: "浏览器预览版只能保留内存托盘",
      };
      const recovery = fileClipboardRecoveryText(tempResult);
      const detail = fileClipboardLocalDetail(tempResult, "fallback");
      const memoryDetail = fileClipboardLocalDetail(memoryResult, "fallback");
      const outgoingStatus = describeOutgoingFileTransferStatus({
        fileCount: 1,
        sentBytes: 2048,
        totalBytes: 4096,
        startedAt: Date.now() - 2000,
        lastActivityAt: Date.now() - 1000,
        rateSamples: [
          { bytes: 2048, durationMs: 1000 },
          { bytes: 2048, durationMs: 1000 },
        ],
      });
      const openButton = document.querySelector("#openReceivedFilesTempButton");
      const copyButton = document.querySelector("#copyReceivedFilesButton");
      const clearButton = document.querySelector("#clearReceivedFilesButton");
      const status = document.querySelector("#receivedFilesStatus");

      const originalTauri = window.__TAURI__;
      const originalFiles = state.receivedClipboardFiles;
      const originalTempPath = state.receivedClipboardTempPath;
      const originalWriteStatus = state.receivedClipboardWriteStatus;
      const originalTransfers = state.remoteFileTransfers;
      const originalOutgoingTransfer = state.outgoingFileTransfer;
      const originalLastOutgoingTransfer = state.lastOutgoingFileTransfer;
      const originalFileTransferActive = state.fileTransferActive;
      const originalConnected = state.connected;
      const originalClient = state.client;
      const originalClipboardToggle = elements.clipboardToggle.checked;
      const originalHostDiagnostics = { ...(state.hostDiagnostics || {}) };
      const calls = [];
      const clipboardResponses = [];
      const clipboardProgress = [];
      const clipboardResults = [];
      const unsupportedSends = [];
      const nativeClipboardSends = [];
      const nativeClipboardInvokes = [];
      const nativeClipboardFailureInvokes = [];
      const failingSends = [];
      const retrySends = [];
      const originalNavigatorClipboard = navigator.clipboard;
      let navigatorClipboardOverridden = false;
      try {
        state.fileTransferActive = true;
        state.outgoingFileTransfer = {
          fileCount: 1,
          sentBytes: 2048,
          totalBytes: 4096,
          startedAt: Date.now() - 2000,
          lastActivityAt: Date.now() - 1000,
          rateSamples: [
            { bytes: 2048, durationMs: 1000 },
            { bytes: 2048, durationMs: 1000 },
          ],
        };
        if (typeof syncFloatingControlCenter === "function") syncFloatingControlCenter();
        const outgoingFloatingStatus = document.querySelector("#floatingClipboardStatus")?.textContent || "";
        state.fileTransferActive = false;
        state.outgoingFileTransfer = null;

        state.connected = false;
        elements.clipboardToggle.checked = true;
        elements.clipboardText.textContent = "剪贴板：待机";
        if (typeof syncFloatingControlStatus === "function") syncFloatingControlStatus();
        await syncClipboardBeforePaste();
        const pasteDisconnectedText = elements.clipboardText.textContent || "";
        const pasteDisconnectedFloating = document.querySelector("#floatingClipboardStatus")?.textContent || "";

        state.connected = true;
        elements.clipboardToggle.checked = false;
        elements.clipboardText.textContent = "剪贴板：已开启";
        if (typeof syncFloatingControlStatus === "function") syncFloatingControlStatus();
        await syncClipboardBeforePaste();
        const pasteDisabledText = elements.clipboardText.textContent || "";
        const pasteDisabledFloating = document.querySelector("#floatingClipboardStatus")?.textContent || "";
        elements.clipboardToggle.checked = true;

        const manualSendBlockedFile = new File([new Uint8Array([80, 75, 3, 4])], "manual-blocked.zip", {
          type: "application/zip",
        });
        state.connected = false;
        state.client = null;
        elements.clipboardToggle.checked = true;
        elements.clipboardText.textContent = "剪贴板：待机";
        if (typeof syncFloatingControlStatus === "function") syncFloatingControlStatus();
        await sendFilesToRemote([manualSendBlockedFile], { sourceLabel: "手动发送未连接测试" });
        const manualDisconnectedText = elements.clipboardText.textContent || "";
        const manualDisconnectedFloating = document.querySelector("#floatingClipboardStatus")?.textContent || "";

        state.connected = true;
        state.client = {
          sendClipboardFileOffer: () => {},
          sendClipboardFileChunk: () => {},
          sendClipboardFileComplete: () => {},
        };
        elements.clipboardToggle.checked = false;
        elements.clipboardText.textContent = "剪贴板：已开启";
        if (typeof syncFloatingControlStatus === "function") syncFloatingControlStatus();
        await sendFilesToRemote([manualSendBlockedFile], { sourceLabel: "手动发送关闭测试" });
        const manualDisabledText = elements.clipboardText.textContent || "";
        const manualDisabledFloating = document.querySelector("#floatingClipboardStatus")?.textContent || "";
        elements.clipboardToggle.checked = true;

        const nativeClipboardBytes = new Uint8Array([80, 75, 3, 4, 9]);
        const nativeClipboardBase64 = window.btoa(
          Array.from(nativeClipboardBytes, (byte) => String.fromCharCode(byte)).join(""),
        );
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            read: async () => [],
            readText: async () => "",
          },
        });
        navigatorClipboardOverridden = true;
        window.__TAURI__ = {
          core: {
            invoke: async (command, args = {}) => {
              nativeClipboardInvokes.push({ command, args });
              if (command === "begin_clipboard_file_read") {
                return {
                  transferId: "native-read-1",
                  fileCount: 1,
                  totalBytes: nativeClipboardBytes.length,
                  files: [
                    {
                      index: 0,
                      name: "native-demo.zip",
                      size: nativeClipboardBytes.length,
                      mimeType: "application/zip",
                      lastModified: 1710000000000,
                    },
                  ],
                };
              }
              if (command === "read_clipboard_file_chunk") {
                const payload = args.payload || {};
                const offset = Number(payload.offset || 0);
                const length = Number(payload.length || nativeClipboardBytes.length);
                const bytes = nativeClipboardBytes.slice(offset, Math.min(nativeClipboardBytes.length, offset + length));
                const dataBase64 = window.btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
                return {
                  transferId: payload.transferId,
                  fileIndex: payload.fileIndex,
                  offset,
                  bytes: bytes.length,
                  dataBase64,
                };
              }
              if (command === "cancel_clipboard_file_read") {
                return true;
              }
              throw new Error("unexpected native clipboard command " + command);
            },
          },
        };
        state.connected = true;
        elements.clipboardToggle.checked = true;
        state.hostDiagnostics = {
          ...(state.hostDiagnostics || {}),
          clipboardText: true,
          clipboardTextMode: "system",
          clipboardFile: true,
          clipboardFileMode: "system",
        };
        state.client = {
          sendClipboardFileOffer: (payload) => nativeClipboardSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => nativeClipboardSends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => nativeClipboardSends.push({ type: "complete", payload }),
        };
        await syncClipboardBeforePaste();
        const nativeClipboardOffer = nativeClipboardSends.find((item) => item.type === "offer")?.payload || {};
        const nativeClipboardChunk = nativeClipboardSends.find((item) => item.type === "chunk")?.payload || {};
        const nativeClipboardComplete = nativeClipboardSends.find((item) => item.type === "complete")?.payload || {};
        const nativeClipboardText = elements.clipboardText.textContent || "";
        const nativeClipboardCommands = nativeClipboardInvokes.map((item) => item.command);
        state.hostDiagnostics = { ...originalHostDiagnostics };

        window.__TAURI__ = {
          core: {
            invoke: async (command, args = {}) => {
              nativeClipboardFailureInvokes.push({ command, args });
              if (command === "begin_clipboard_file_read") {
                throw new Error("系统剪贴板里只有文件夹；当前先支持文件和压缩包，暂不递归发送文件夹。");
              }
              throw new Error("unexpected native clipboard failure command " + command);
            },
          },
        };
        state.connected = true;
        elements.clipboardToggle.checked = true;
        elements.clipboardText.textContent = "剪贴板：已开启";
        if (typeof syncFloatingControlStatus === "function") syncFloatingControlStatus();
        await syncClipboardBeforePaste();
        const nativeClipboardFailureText = elements.clipboardText.textContent || "";
        const nativeClipboardFailureFloating = document.querySelector("#floatingClipboardStatus")?.textContent || "";
        const nativeClipboardFailureCommands = nativeClipboardFailureInvokes.map((item) => item.command);

        const nativeClipboardAfterFailureSuccessSends = [];
        state.hostDiagnostics = {
          ...(state.hostDiagnostics || {}),
          clipboardText: true,
          clipboardTextMode: "system",
          clipboardFile: true,
          clipboardFileMode: "system",
        };
        state.client = {
          sendClipboardFileOffer: (payload) => nativeClipboardAfterFailureSuccessSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => nativeClipboardAfterFailureSuccessSends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => nativeClipboardAfterFailureSuccessSends.push({ type: "complete", payload }),
        };
        await sendFilesToRemote(
          [new File([new Uint8Array([80, 75, 3, 4])], "after-folder-failure.zip", { type: "application/zip" })],
          { sourceLabel: "文件剪贴板" },
        );
        const nativeClipboardAfterFailureSuccessText = elements.clipboardText.textContent || "";
        const nativeClipboardAfterFailureSuccessFloating =
          document.querySelector("#floatingClipboardStatus")?.textContent || "";
        const nativeClipboardAfterFailureSuccessSendCount = nativeClipboardAfterFailureSuccessSends.length;

        const unsupportedFile = new File([new Uint8Array([1, 2, 3, 4])], "unsupported.zip", { type: "application/zip" });
        state.connected = true;
        elements.clipboardToggle.checked = true;
        if (typeof updateHostDiagnostics === "function") {
          updateHostDiagnostics({
            clipboardText: true,
            clipboardTextMode: "system",
            clipboardFile: false,
            clipboardFileMode: "unsupported",
          });
        } else {
          state.hostDiagnostics = {
            ...(state.hostDiagnostics || {}),
            clipboardText: true,
            clipboardTextMode: "system",
            clipboardFile: false,
            clipboardFileMode: "unsupported",
          };
        }
        state.client = {
          sendClipboardFileOffer: (payload) => unsupportedSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => unsupportedSends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => unsupportedSends.push({ type: "complete", payload }),
        };
        await sendFilesToRemote([unsupportedFile], { sourceLabel: "能力拦截测试" });
        const unsupportedClipboardText = elements.clipboardText.textContent || "";
        const unsupportedSendCount = unsupportedSends.length;
        state.hostDiagnostics = { ...originalHostDiagnostics };

        const oversizeOutgoingSends = [];
        const oversizeOutgoingFile = {
          name: "too-large-local.zip",
          size: maxClipboardFileBytes + 1,
          type: "application/zip",
          lastModified: 1710000000000,
        };
        state.connected = true;
        elements.clipboardToggle.checked = true;
        state.hostDiagnostics = {
          ...(state.hostDiagnostics || {}),
          clipboardText: true,
          clipboardTextMode: "system",
          clipboardFile: true,
          clipboardFileMode: "system",
        };
        state.client = {
          sendClipboardFileOffer: (payload) => oversizeOutgoingSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => oversizeOutgoingSends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => oversizeOutgoingSends.push({ type: "complete", payload }),
        };
        elements.clipboardText.textContent = "剪贴板：已开启";
        if (typeof syncFloatingControlStatus === "function") syncFloatingControlStatus();
        await sendFilesToRemote([oversizeOutgoingFile], { sourceLabel: "文件过大测试" });
        const oversizeOutgoingText = elements.clipboardText.textContent || "";
        const oversizeOutgoingFloating = document.querySelector("#floatingClipboardStatus")?.textContent || "";
        const oversizeOutgoingSendCount = oversizeOutgoingSends.length;
        state.hostDiagnostics = { ...originalHostDiagnostics };

        const emptyOutgoingSends = [];
        state.connected = true;
        elements.clipboardToggle.checked = true;
        state.client = {
          sendClipboardFileOffer: (payload) => emptyOutgoingSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => emptyOutgoingSends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => emptyOutgoingSends.push({ type: "complete", payload }),
        };
        elements.clipboardText.textContent = "剪贴板：已开启";
        if (typeof syncFloatingControlStatus === "function") syncFloatingControlStatus();
        await sendFilesToRemote([], { sourceLabel: "未选择文件测试" });
        const emptyOutgoingText = elements.clipboardText.textContent || "";
        const emptyOutgoingFloating = document.querySelector("#floatingClipboardStatus")?.textContent || "";
        const emptyOutgoingSendCount = emptyOutgoingSends.length;

        const retryFileBytes = new Uint8Array(fileChunkSizeBytes + 2048);
        retryFileBytes.fill(65);
        const retryFile = new File([retryFileBytes], "retry-demo.zip", { type: "application/zip" });
        const retryDataTransfer = new DataTransfer();
        retryDataTransfer.items.add(retryFile);
        elements.fileClipboardInput.files = retryDataTransfer.files;
        state.connected = true;
        state.client = {
          sendClipboardFileOffer: (payload) => failingSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => {
            failingSends.push({ type: "chunk", payload });
            const chunkCount = failingSends.filter((item) => item.type === "chunk").length;
            if (chunkCount > 1) throw new Error("模拟断线");
          },
          sendClipboardFileComplete: (payload) => failingSends.push({ type: "complete", payload }),
        };
        await sendFilesToRemote([retryFile], { sourceLabel: "失败发送测试", clearFileInput: true });
        const failedClipboardText = elements.clipboardText.textContent || "";
        const lastOutgoingFailure = state.lastOutgoingFileTransfer || {};
        const lastOutgoingFailureStatus = describeLastOutgoingFileTransferStatus(lastOutgoingFailure);
        const floatingAfterSendFailure = formatFloatingClipboardStatus();
        const fileInputLengthAfterFailure = elements.fileClipboardInput.files?.length || 0;
        const chunkSendCount = failingSends.filter((item) => item.type === "chunk").length;
        const retrySentText = formatBytes(fileChunkSizeBytes);
        state.client = {
          sendClipboardFileOffer: (payload) => retrySends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => retrySends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => retrySends.push({ type: "complete", payload }),
        };
        elements.fileClipboardButton.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
        const retryOfferCount = retrySends.filter((item) => item.type === "offer").length;
        const retryChunkCount = retrySends.filter((item) => item.type === "chunk").length;
        const retryCompleteCount = retrySends.filter((item) => item.type === "complete").length;
        const retryClipboardText = elements.clipboardText.textContent || "";
        const fileInputLengthAfterRetry = elements.fileClipboardInput.files?.length || 0;
        state.remoteFileTransfers = new Map();
        state.client = {
          sendClipboardFileResponse: (payload) => clipboardResponses.push(payload),
          sendClipboardFileProgress: (payload) => clipboardProgress.push(payload),
          sendClipboardFileResult: (payload) => clipboardResults.push(payload),
        };
        elements.clipboardToggle.checked = true;
        handleClipboardFileOffer({
          type: "clipboard_file_offer",
          transferId: "live-transfer",
          fileCount: 1,
          totalBytes: 4,
          files: [
            {
              index: 0,
              name: "demo.txt",
              size: 4,
              mimeType: "text/plain",
            },
          ],
        });
        const offeredTransfer = state.remoteFileTransfers.get("live-transfer");
        if (offeredTransfer) {
          offeredTransfer.startedAt = Date.now() - 2000;
        }
        const statusVisibleAfterOffer = status && !status.hidden;
        const statusTextAfterOffer = status?.textContent || "";
        const statusClassAfterOffer = status?.className || "";
        const emptyTextAfterOffer = document.querySelector(".received-files-empty")?.textContent || "";
        handleClipboardFileChunk({
          type: "clipboard_file_chunk",
          transferId: "live-transfer",
          fileIndex: 0,
          fileName: "demo.txt",
          offset: 0,
          dataBase64: btoa("te"),
        });
        const statusVisibleAfterChunk = status && !status.hidden;
        const statusTextAfterChunk = status?.textContent || "";
        const statusClassAfterChunk = status?.className || "";
        const liveTransfer = state.remoteFileTransfers.get("live-transfer");
        const rateSampleAfterChunk = liveTransfer?.rateSamples?.[0] || {};
        const rateSampleCountAfterChunk = liveTransfer?.rateSamples?.length || 0;
        liveTransfer.lastActivityAt = Date.now() - remoteFileTransferStallTimeoutMs - 1000;
        const expiredCount = expireStaleRemoteFileTransfers(Date.now());
        const statusTextAfterTimeout = status?.textContent || "";
        const statusClassAfterTimeout = status?.className || "";
        const clipboardTextAfterTimeout = elements.clipboardText.textContent || "";
        const transferCountAfterTimeout = state.remoteFileTransfers.size;
        state.remoteFileTransfers.clear();
        handleClipboardFileOffer({
          type: "clipboard_file_offer",
          transferId: "too-large",
          fileCount: 1,
          totalBytes: maxClipboardFileBytes + 1,
          files: [
            {
              index: 0,
              name: "huge.zip",
              size: maxClipboardFileBytes + 1,
              mimeType: "application/zip",
            },
          ],
        });
        const statusTextAfterOversize = status?.textContent || "";
        const statusClassAfterOversize = status?.className || "";

        state.receivedClipboardFiles = [
          {
            name: "demo.zip",
            size: 3,
            mimeType: "application/zip",
            blob: new Blob(["zip"]),
            objectUrl: "",
          },
        ];
        state.receivedClipboardTempPath = tempResult.rootDir;
        updateReceivedFilesWriteStatusFromResult(tempResult, 1);
        window.__TAURI__ = {
          core: {
            invoke: async (command, payload) => {
              calls.push({ command, payload });
              return true;
            },
          },
        };
        renderReceivedFiles();
        const enabledAfterTempPath = openButton && !openButton.disabled;
        const retryTitleAfterFailure = copyButton?.title || "";
        const clearTitleAfterFailure = clearButton?.title || "";
        const statusTextAfterFailure = status?.textContent || "";
        const statusClassAfterFailure = status?.className || "";
        const statusHiddenAfterFailure = Boolean(status?.hidden);
        await openReceivedFilesTempPath();
        clearReceivedFiles();
        const clearedFilesLength = state.receivedClipboardFiles.length;
        const clearedTempPath = state.receivedClipboardTempPath;
        const clearButtonDisabledAfterClear = clearButton?.disabled === true;
        const openButtonDisabledAfterClear = openButton?.disabled === true;
        const statusHiddenAfterClear = Boolean(status?.hidden);
        const statusTextAfterClear = status?.textContent || "";
        const clearLogDetail = state.logEntries[0]?.detail || "";
        state.receivedClipboardFiles = [
          {
            name: "demo.zip",
            size: 3,
            mimeType: "application/zip",
            blob: new Blob(["zip"]),
            objectUrl: "",
          },
        ];
        state.receivedClipboardTempPath = "";
        updateReceivedFilesWriteStatusFromResult(
          {
            clipboardWritten: true,
            saveMode: "clipboard",
            fileCount: 1,
          },
          1,
        );
        renderReceivedFiles();
        const disabledWithoutTempPath = openButton?.disabled === true;
        const statusTextAfterSuccess = status?.textContent || "";

        return {
          ok:
            recovery === "临时目录：C:/Temp/lan-dual-control/clip-1" &&
            detail.includes("系统文件剪贴板写入失败") &&
            detail.includes("临时目录：C:/Temp/lan-dual-control/clip-1") &&
            memoryDetail === "浏览器预览版只能保留内存托盘" &&
            outgoingStatus.includes("正在发送 1 个文件") &&
            outgoingStatus.includes("2.0 KB/4.0 KB") &&
            outgoingStatus.includes("50%") &&
            outgoingStatus.includes("速度 2.0 KB/s") &&
            outgoingStatus.includes("剩余约 1 秒") &&
            outgoingFloatingStatus.includes("发送 1 个文件") &&
            outgoingFloatingStatus.includes("2.0 KB/4.0 KB") &&
            outgoingFloatingStatus.includes("速度 2.0 KB/s") &&
            pasteDisconnectedText.includes("请先连接被控端") &&
            pasteDisconnectedFloating.includes("请先连接被控端") &&
            pasteDisabledText.includes("已关闭") &&
            pasteDisabledFloating.includes("关闭") &&
            manualDisconnectedText.includes("请先连接被控端") &&
            manualDisconnectedFloating.includes("请先连接被控端") &&
            manualDisabledText.includes("已关闭") &&
            manualDisabledFloating.includes("关闭") &&
            nativeClipboardSends.filter((item) => item.type === "offer").length === 1 &&
            nativeClipboardSends.filter((item) => item.type === "chunk").length === 1 &&
            nativeClipboardSends.filter((item) => item.type === "complete").length === 1 &&
            nativeClipboardOffer.files?.[0]?.name === "native-demo.zip" &&
            nativeClipboardOffer.totalBytes === nativeClipboardBytes.length &&
            nativeClipboardChunk.bytes === nativeClipboardBytes.length &&
            nativeClipboardComplete.totalBytes === nativeClipboardBytes.length &&
            nativeClipboardCommands.includes("begin_clipboard_file_read") &&
            nativeClipboardCommands.includes("read_clipboard_file_chunk") &&
            nativeClipboardCommands.includes("cancel_clipboard_file_read") &&
            nativeClipboardText.includes("等待对端确认") &&
            nativeClipboardFailureCommands.includes("begin_clipboard_file_read") &&
            nativeClipboardFailureText.includes("系统剪贴板里只有文件夹") &&
            nativeClipboardFailureText.includes("暂不递归发送文件夹") &&
            nativeClipboardFailureFloating.includes("系统剪贴板里只有文件夹") &&
            nativeClipboardAfterFailureSuccessText.includes("等待对端确认") &&
            nativeClipboardAfterFailureSuccessFloating.includes("等待对端确认") &&
            nativeClipboardAfterFailureSuccessSendCount >= 3 &&
            unsupportedSendCount === 0 &&
            unsupportedClipboardText.includes("对端文件剪贴板不可用") &&
            unsupportedClipboardText.includes("文件/压缩包不能直接复制粘贴") &&
            oversizeOutgoingSendCount === 0 &&
            oversizeOutgoingText.includes("文件过大") &&
            oversizeOutgoingFloating.includes("文件过大") &&
            oversizeOutgoingFloating.includes("超过当前上限") &&
            emptyOutgoingSendCount === 0 &&
            emptyOutgoingText.includes("未选择文件") &&
            emptyOutgoingFloating.includes("未选择文件") &&
            failedClipboardText.includes("文件发送失败") &&
            failedClipboardText.includes("可重新发送") &&
            lastOutgoingFailure.status === "failed" &&
            lastOutgoingFailure.error === "模拟断线" &&
            lastOutgoingFailure.sentBytes === fileChunkSizeBytes &&
            lastOutgoingFailure.totalBytes === retryFile.size &&
            lastOutgoingFailureStatus.includes("发送失败") &&
            lastOutgoingFailureStatus.includes(retrySentText) &&
            lastOutgoingFailureStatus.includes("可重新发送") &&
            floatingAfterSendFailure.includes("发送失败") &&
            fileInputLengthAfterFailure === 1 &&
            chunkSendCount === 2 &&
            retryOfferCount === 1 &&
            retryChunkCount === 2 &&
            retryCompleteCount === 1 &&
            retryClipboardText.includes("文件已发送") &&
            retryClipboardText.includes("等待对端确认") &&
            fileInputLengthAfterRetry === 1 &&
            statusVisibleAfterOffer &&
            statusTextAfterOffer.includes("正在接收 1 个文件") &&
            statusTextAfterOffer.includes("0 B/4 B") &&
            statusClassAfterOffer.includes("is-busy") &&
            emptyTextAfterOffer.includes("Mac 复制文件") &&
            statusVisibleAfterChunk &&
            statusTextAfterChunk.includes("2 B/4 B") &&
            statusTextAfterChunk.includes("50%") &&
            statusTextAfterChunk.includes("速度 1 B/s") &&
            statusTextAfterChunk.includes("剩余约") &&
            rateSampleCountAfterChunk === 1 &&
            rateSampleAfterChunk.bytes === 2 &&
            rateSampleAfterChunk.durationMs > 0 &&
            statusClassAfterChunk.includes("is-busy") &&
            expiredCount === 1 &&
            statusTextAfterTimeout.includes("远端文件接收超时") &&
            statusTextAfterTimeout.includes("2 B/4 B") &&
            statusClassAfterTimeout.includes("is-warning") &&
            clipboardTextAfterTimeout.includes("远端文件接收中断") &&
            transferCountAfterTimeout === 0 &&
            statusTextAfterOversize.includes("超过当前上限") &&
            statusTextAfterOversize.includes("已拒绝接收") &&
            statusClassAfterOversize.includes("is-warning") &&
            clipboardResponses.some((payload) => payload.transferId === "live-transfer" && payload.accepted === true) &&
            clipboardResponses.some((payload) => payload.transferId === "too-large" && payload.accepted === false) &&
            clipboardProgress.some((payload) => payload.transferId === "live-transfer" && payload.receivedBytes === 2) &&
            clipboardResults.some(
              (payload) =>
                payload.transferId === "live-transfer" &&
                payload.accepted === false &&
                String(payload.reason || "").includes("接收超时") &&
                payload.receivedBytes === 2,
            ) &&
            enabledAfterTempPath &&
            disabledWithoutTempPath &&
            retryTitleAfterFailure === "重试写入系统文件剪贴板" &&
            clearTitleAfterFailure === "清空托盘（不删除系统剪贴板临时目录）" &&
            statusTextAfterFailure.includes("可打开临时目录或重试写入") &&
            statusClassAfterFailure.includes("is-warning") &&
            !statusHiddenAfterFailure &&
            statusTextAfterSuccess.includes("已写入 Windows 系统文件剪贴板") &&
            clearedFilesLength === 0 &&
            clearedTempPath === "" &&
            clearButtonDisabledAfterClear &&
            openButtonDisabledAfterClear &&
            statusHiddenAfterClear &&
            statusTextAfterClear === "" &&
            clearLogDetail.includes("系统剪贴板临时目录会保留") &&
            calls.length === 1 &&
            calls[0].command === "open_clipboard_temp_path" &&
            calls[0].payload?.path === tempResult.rootDir,
          recovery,
          detail,
          memoryDetail,
          pasteDisconnectedText,
          pasteDisconnectedFloating,
          pasteDisabledText,
          pasteDisabledFloating,
          manualDisconnectedText,
          manualDisconnectedFloating,
          manualDisabledText,
          manualDisabledFloating,
          nativeClipboardText,
          nativeClipboardCommands,
          nativeClipboardSends,
          nativeClipboardOffer,
          nativeClipboardChunk,
          nativeClipboardComplete,
          nativeClipboardFailureText,
          nativeClipboardFailureFloating,
          nativeClipboardFailureCommands,
          nativeClipboardAfterFailureSuccessText,
          nativeClipboardAfterFailureSuccessFloating,
          nativeClipboardAfterFailureSuccessSendCount,
          unsupportedClipboardText,
          unsupportedSendCount,
          unsupportedSends,
          oversizeOutgoingText,
          oversizeOutgoingFloating,
          oversizeOutgoingSendCount,
          emptyOutgoingText,
          emptyOutgoingFloating,
          emptyOutgoingSendCount,
          failedClipboardText,
          lastOutgoingFailure,
          lastOutgoingFailureStatus,
          floatingAfterSendFailure,
          fileInputLengthAfterFailure,
          chunkSendCount,
          retryOfferCount,
          retryChunkCount,
          retryCompleteCount,
          retryClipboardText,
          fileInputLengthAfterRetry,
          failingSends: failingSends.map((item) => ({
            type: item.type,
            bytes: item.payload?.bytes,
            offset: item.payload?.offset,
            totalBytes: item.payload?.totalBytes,
          })),
          statusTextAfterOffer,
          statusClassAfterOffer,
          statusTextAfterChunk,
          statusClassAfterChunk,
          expiredCount,
          statusTextAfterTimeout,
          statusClassAfterTimeout,
          clipboardTextAfterTimeout,
          transferCountAfterTimeout,
          statusTextAfterOversize,
          statusClassAfterOversize,
          clipboardResponses,
          clipboardProgress,
          clipboardResults,
          enabledAfterTempPath,
          disabledWithoutTempPath,
          retryTitleAfterFailure,
          clearTitleAfterFailure,
          statusTextAfterFailure,
          statusClassAfterFailure,
          statusTextAfterSuccess,
          clearedFilesLength,
          clearedTempPath,
          clearButtonDisabledAfterClear,
          openButtonDisabledAfterClear,
          statusHiddenAfterClear,
          statusTextAfterClear,
          clearLogDetail,
          calls,
        };
      } finally {
        if (typeof originalTauri === "undefined") {
          delete window.__TAURI__;
        } else {
          window.__TAURI__ = originalTauri;
        }
        if (navigatorClipboardOverridden) {
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: originalNavigatorClipboard,
          });
        }
        state.receivedClipboardFiles = originalFiles;
        state.receivedClipboardTempPath = originalTempPath;
        state.receivedClipboardWriteStatus = originalWriteStatus;
        state.remoteFileTransfers = originalTransfers;
        state.outgoingFileTransfer = originalOutgoingTransfer;
        state.lastOutgoingFileTransfer = originalLastOutgoingTransfer;
        state.fileTransferActive = originalFileTransferActive;
        state.connected = originalConnected;
        state.client = originalClient;
        elements.clipboardToggle.checked = originalClipboardToggle;
        state.hostDiagnostics = originalHostDiagnostics;
        elements.fileClipboardInput.value = "";
        renderReceivedFiles();
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`file clipboard recovery text check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyOutgoingFileResultStatus(session) {
  const result = await evaluate(
    session,
    `(async () => {
      if (
        typeof handleClipboardFileResult !== "function" ||
        typeof handleClipboardFileResponse !== "function" ||
        typeof formatFloatingClipboardStatus !== "function" ||
        typeof syncFloatingControlStatus !== "function" ||
        typeof sendFilesToRemote !== "function" ||
        typeof canRetryLastOutgoingFileTransfer !== "function" ||
        typeof updateFileClipboardButton !== "function" ||
        typeof expirePendingOutgoingFileResult !== "function"
      ) {
        return { ok: false, reason: "missing outgoing file result helpers" };
      }
      if (typeof state !== "object" || typeof elements !== "object") {
        return { ok: false, reason: "missing app state" };
      }

      const originalLastOutgoingTransfer = state.lastOutgoingFileTransfer;
      const originalConnected = state.connected;
      const originalClipboardToggle = elements.clipboardToggle.checked;
      const originalClient = state.client;
      const originalFileTransferActive = state.fileTransferActive;
      const originalOutgoingTransfer = state.outgoingFileTransfer;
      const offerRejectSends = [];
      const firstRemoteRejectSends = [];
      const remoteRejectRetrySends = [];
      const pendingTimeoutSends = [];
      const pendingTimeoutRetrySends = [];
      try {
        state.connected = true;
        elements.clipboardToggle.checked = true;
        state.lastOutgoingFileTransfer = {
          transferId: "result-clipboard",
          status: "sent",
          fileCount: 2,
          sentBytes: 4096,
          totalBytes: 4096,
          files: [
            { index: 0, name: "a.txt", size: 2048 },
            { index: 1, name: "b.zip", size: 2048 },
          ],
        };
        handleClipboardFileResult({
          type: "clipboard_file_result",
          transferId: "result-clipboard",
          accepted: true,
          saveMode: "clipboard",
          fileCount: 2,
          receivedBytes: 4096,
          totalBytes: 4096,
          reason: "macOS 系统剪贴板已写入。",
        });
        const clipboardText = elements.clipboardText.textContent || "";
        const floatingClipboardText = formatFloatingClipboardStatus();

        state.lastOutgoingFileTransfer = {
          transferId: "result-temp",
          status: "sent",
          fileCount: 1,
          sentBytes: 2048,
          totalBytes: 2048,
          files: [{ index: 0, name: "temp.zip", size: 2048 }],
        };
        handleClipboardFileResult({
          type: "clipboard_file_result",
          transferId: "result-temp",
          accepted: true,
          saveMode: "temp",
          fileCount: 1,
          receivedBytes: 2048,
          totalBytes: 2048,
          reason: "系统文件剪贴板写入失败，已保存到临时目录。",
        });
        const tempText = elements.clipboardText.textContent || "";

        state.lastOutgoingFileTransfer = {
          transferId: "result-memory",
          status: "sent",
          fileCount: 1,
          sentBytes: 128,
          totalBytes: 128,
          files: [{ index: 0, name: "memory.txt", size: 128 }],
        };
        handleClipboardFileResult({
          type: "clipboard_file_result",
          transferId: "result-memory",
          accepted: true,
          saveMode: "memory-only",
          fileCount: 1,
          receivedBytes: 128,
          totalBytes: 128,
          reason: "浏览器预览版只能保留内存托盘。",
        });
        const memoryText = elements.clipboardText.textContent || "";

        state.lastOutgoingFileTransfer = {
          transferId: "result-failed",
          status: "sent",
          fileCount: 1,
          sentBytes: 4096,
          totalBytes: 4096,
          files: [{ index: 0, name: "failed.zip", size: 4096 }],
        };
        handleClipboardFileResult({
          type: "clipboard_file_result",
          transferId: "result-failed",
          accepted: false,
          fileCount: 1,
          receivedBytes: 2048,
          totalBytes: 4096,
          reason: "接收超时",
        });
        const failedText = elements.clipboardText.textContent || "";
        const resultState = state.lastOutgoingFileTransfer || {};

        const offerRejectBytes = new Uint8Array(fileChunkSizeBytes + 384);
        offerRejectBytes.fill(68);
        const offerRejectFile = new File([offerRejectBytes], "offer-reject.zip", { type: "application/zip" });
        const offerRejectDataTransfer = new DataTransfer();
        offerRejectDataTransfer.items.add(offerRejectFile);
        elements.fileClipboardInput.files = offerRejectDataTransfer.files;
        state.client = {
          sendClipboardFileOffer: (payload) => offerRejectSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => offerRejectSends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => offerRejectSends.push({ type: "complete", payload }),
        };
        await sendFilesToRemote([offerRejectFile], { sourceLabel: "文件清单拒绝测试", clearFileInput: true });
        const offerRejectTransferId = offerRejectSends.find((item) => item.type === "offer")?.payload?.transferId;
        handleClipboardFileResponse({
          type: "clipboard_file_response",
          transferId: offerRejectTransferId,
          accepted: false,
          code: "LAN011",
          reason: "对端文件剪贴板空间不足，拒绝文件清单",
        });
        updateFileClipboardButton();
        const offerRejectText = elements.clipboardText.textContent || "";
        const offerRejectFloating = formatFloatingClipboardStatus();
        const offerRejectState = state.lastOutgoingFileTransfer || {};
        const fileInputLengthAfterOfferReject = elements.fileClipboardInput.files?.length || 0;
        const canRetryAfterOfferReject = canRetryLastOutgoingFileTransfer();
        const buttonLabelAfterOfferReject = elements.fileClipboardButton.querySelector("span:not([aria-hidden])")?.textContent || "";

        const remoteRejectBytes = new Uint8Array(fileChunkSizeBytes + 512);
        remoteRejectBytes.fill(66);
        const remoteRejectFile = new File([remoteRejectBytes], "remote-reject.zip", { type: "application/zip" });
        const remoteRejectDataTransfer = new DataTransfer();
        remoteRejectDataTransfer.items.add(remoteRejectFile);
        elements.fileClipboardInput.files = remoteRejectDataTransfer.files;
        state.client = {
          sendClipboardFileOffer: (payload) => firstRemoteRejectSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => firstRemoteRejectSends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => firstRemoteRejectSends.push({ type: "complete", payload }),
        };
        await sendFilesToRemote([remoteRejectFile], { sourceLabel: "对端失败重试测试", clearFileInput: true });
        const sentTransferId = firstRemoteRejectSends.find((item) => item.type === "complete")?.payload?.transferId;
        handleClipboardFileResult({
          type: "clipboard_file_result",
          transferId: sentTransferId,
          accepted: false,
          fileCount: 1,
          receivedBytes: fileChunkSizeBytes,
          totalBytes: remoteRejectFile.size,
          reason: "对端写入系统剪贴板失败",
        });
        updateFileClipboardButton();
        const remoteFailureText = elements.clipboardText.textContent || "";
        const remoteFailureFloating = formatFloatingClipboardStatus();
        const remoteFailureState = state.lastOutgoingFileTransfer || {};
        const fileInputLengthAfterRemoteFailure = elements.fileClipboardInput.files?.length || 0;
        const canRetryAfterRemoteFailure = canRetryLastOutgoingFileTransfer();
        const buttonLabelAfterRemoteFailure = elements.fileClipboardButton.querySelector("span:not([aria-hidden])")?.textContent || "";
        const buttonTitleAfterRemoteFailure = elements.fileClipboardButton.title || "";

        state.client = {
          sendClipboardFileOffer: (payload) => remoteRejectRetrySends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => remoteRejectRetrySends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => remoteRejectRetrySends.push({ type: "complete", payload }),
        };
        elements.fileClipboardButton.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
        const remoteRejectRetryOfferCount = remoteRejectRetrySends.filter((item) => item.type === "offer").length;
        const remoteRejectRetryChunkCount = remoteRejectRetrySends.filter((item) => item.type === "chunk").length;
        const remoteRejectRetryCompleteCount = remoteRejectRetrySends.filter((item) => item.type === "complete").length;
        const retrySentTransferId = remoteRejectRetrySends.find((item) => item.type === "complete")?.payload?.transferId;
        handleClipboardFileResult({
          type: "clipboard_file_result",
          transferId: retrySentTransferId,
          accepted: true,
          saveMode: "clipboard",
          fileCount: 1,
          receivedBytes: remoteRejectFile.size,
          totalBytes: remoteRejectFile.size,
          reason: "重发后已写入系统文件剪贴板",
        });
        updateFileClipboardButton();
        const fileInputLengthAfterRemoteAccept = elements.fileClipboardInput.files?.length || 0;

        const pendingBytes = new Uint8Array(fileChunkSizeBytes + 256);
        pendingBytes.fill(67);
        const pendingFile = new File([pendingBytes], "pending-timeout.zip", { type: "application/zip" });
        const pendingDataTransfer = new DataTransfer();
        pendingDataTransfer.items.add(pendingFile);
        elements.fileClipboardInput.files = pendingDataTransfer.files;
        state.client = {
          sendClipboardFileOffer: (payload) => pendingTimeoutSends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => pendingTimeoutSends.push({ type: "chunk", payload }),
          sendClipboardFileComplete: (payload) => pendingTimeoutSends.push({ type: "complete", payload }),
        };
        await sendFilesToRemote([pendingFile], { sourceLabel: "对端确认超时测试", clearFileInput: true });
        const pendingBeforeTimeout = state.lastOutgoingFileTransfer || {};
        const expiredPendingCount = expirePendingOutgoingFileResult(
          Number(pendingBeforeTimeout.completedAt || Date.now()) + remoteFileTransferStallTimeoutMs + 1000,
        );
        updateFileClipboardButton();
        const pendingTimeoutText = elements.clipboardText.textContent || "";
        const pendingTimeoutFloating = formatFloatingClipboardStatus();
        const pendingTimeoutState = state.lastOutgoingFileTransfer || {};
        const canRetryAfterPendingTimeout = canRetryLastOutgoingFileTransfer();
        const fileInputLengthAfterPendingTimeout = elements.fileClipboardInput.files?.length || 0;
        const buttonLabelAfterPendingTimeout = elements.fileClipboardButton.querySelector("span:not([aria-hidden])")?.textContent || "";

        let injectedStaleResultDuringActiveRetry = false;
        let staleResultDuringActiveReturn;
        let staleResultDuringActiveState = {};
        let staleResultDuringActiveText = "";
        let staleResultDuringActiveCurrentId = "";
        state.client = {
          sendClipboardFileOffer: (payload) => pendingTimeoutRetrySends.push({ type: "offer", payload }),
          sendClipboardFileChunk: (payload) => {
            pendingTimeoutRetrySends.push({ type: "chunk", payload });
            if (!injectedStaleResultDuringActiveRetry) {
              injectedStaleResultDuringActiveRetry = true;
              staleResultDuringActiveCurrentId = state.outgoingFileTransfer?.transferId || "";
              staleResultDuringActiveReturn = handleClipboardFileResult({
                transferId: pendingBeforeTimeout.transferId,
                accepted: true,
                saveMode: "clipboard",
                fileCount: 1,
                totalBytes: pendingFile.size,
                reason: "old result during active retry",
              });
              staleResultDuringActiveState = state.lastOutgoingFileTransfer || {};
              staleResultDuringActiveText = elements.clipboardText.textContent || "";
            }
          },
          sendClipboardFileComplete: (payload) => pendingTimeoutRetrySends.push({ type: "complete", payload }),
        };
        elements.fileClipboardButton.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
        const pendingTimeoutRetryOfferCount = pendingTimeoutRetrySends.filter((item) => item.type === "offer").length;
        const pendingTimeoutRetryChunkCount = pendingTimeoutRetrySends.filter((item) => item.type === "chunk").length;
        const pendingTimeoutRetryCompleteCount = pendingTimeoutRetrySends.filter((item) => item.type === "complete").length;
        const pendingTimeoutRetryTransferId = pendingTimeoutRetrySends.find((item) => item.type === "complete")?.payload?.transferId;
        const staleLateResultReturn = handleClipboardFileResult({
          transferId: pendingBeforeTimeout.transferId,
          accepted: true,
          saveMode: "clipboard",
          fileCount: 1,
          totalBytes: pendingFile.size,
          reason: "old transfer accepted late",
        });
        const staleLateResultState = state.lastOutgoingFileTransfer || {};
        const staleLateResultText = elements.clipboardText.textContent || "";
        handleClipboardFileProgress({
          type: "clipboard_file_progress",
          transferId: pendingBeforeTimeout.transferId,
          receivedBytes: pendingFile.size,
          totalBytes: pendingFile.size,
        });
        const staleLateProgressState = state.lastOutgoingFileTransfer || {};
        const staleLateProgressText = elements.clipboardText.textContent || "";
        const textBeforeStaleResponse = elements.clipboardText.textContent || "";
        handleClipboardFileResponse({
          type: "clipboard_file_response",
          transferId: pendingBeforeTimeout.transferId,
          accepted: true,
        });
        const staleLateAcceptResponseState = state.lastOutgoingFileTransfer || {};
        const staleLateAcceptResponseText = elements.clipboardText.textContent || "";
        handleClipboardFileResponse({
          type: "clipboard_file_response",
          transferId: pendingBeforeTimeout.transferId,
          accepted: false,
          reason: "old offer rejected late",
        });
        const staleLateRejectResponseState = state.lastOutgoingFileTransfer || {};
        const staleLateRejectResponseText = elements.clipboardText.textContent || "";

        return {
          ok:
            clipboardText.includes("对端已接收并写入系统文件剪贴板") &&
            clipboardText.includes("2 个文件") &&
            clipboardText.includes("4.0 KB") &&
            floatingClipboardText.includes("系统文件剪贴板") &&
            tempText.includes("临时目录") &&
            tempText.includes("2.0 KB") &&
            memoryText.includes("远端托盘") &&
            failedText.includes("对端文件接收失败") &&
            failedText.includes("2.0 KB/4.0 KB") &&
            failedText.includes("接收超时") &&
            resultState.status === "remote-result" &&
            resultState.accepted === false &&
            offerRejectText.includes("对端文件接收失败") &&
            offerRejectText.includes("可重新发送") &&
            offerRejectText.includes("文件剪贴板空间不足") &&
            offerRejectFloating.includes("可重新发送") &&
            offerRejectState.status === "remote-result" &&
            offerRejectState.accepted === false &&
            offerRejectState.canRetry === true &&
            fileInputLengthAfterOfferReject === 1 &&
            canRetryAfterOfferReject === true &&
            buttonLabelAfterOfferReject === "重新发送" &&
            remoteFailureText.includes("对端文件接收失败") &&
            remoteFailureText.includes("可重新发送") &&
            remoteFailureFloating.includes("可重新发送") &&
            remoteFailureState.status === "remote-result" &&
            remoteFailureState.accepted === false &&
            remoteFailureState.canRetry === true &&
            fileInputLengthAfterRemoteFailure === 1 &&
            canRetryAfterRemoteFailure === true &&
            buttonLabelAfterRemoteFailure === "重新发送" &&
            buttonTitleAfterRemoteFailure.includes("重新发送") &&
            remoteRejectRetryOfferCount === 1 &&
            remoteRejectRetryChunkCount === 2 &&
            remoteRejectRetryCompleteCount === 1 &&
            fileInputLengthAfterRemoteAccept === 0 &&
            expiredPendingCount === 1 &&
            pendingTimeoutText.includes("对端确认超时") &&
            pendingTimeoutText.includes("可重新发送") &&
            pendingTimeoutFloating.includes("对端确认超时") &&
            pendingTimeoutState.status === "remote-result" &&
            pendingTimeoutState.accepted === false &&
            pendingTimeoutState.canRetry === true &&
            canRetryAfterPendingTimeout === true &&
            fileInputLengthAfterPendingTimeout === 1 &&
            buttonLabelAfterPendingTimeout === "重新发送" &&
            pendingTimeoutRetryOfferCount === 1 &&
            pendingTimeoutRetryChunkCount === 2 &&
            pendingTimeoutRetryCompleteCount === 1 &&
            staleResultDuringActiveReturn === false &&
            staleResultDuringActiveCurrentId === pendingTimeoutRetryTransferId &&
            !staleResultDuringActiveState.transferId &&
            !staleResultDuringActiveText.includes("old result during active retry") &&
            staleLateResultReturn === false &&
            staleLateResultState.transferId === pendingTimeoutRetryTransferId &&
            staleLateResultState.status === "sent" &&
            !staleLateResultText.includes("old transfer accepted late") &&
            staleLateProgressState.transferId === pendingTimeoutRetryTransferId &&
            staleLateProgressState.status === "sent" &&
            !staleLateProgressText.includes("对端接收 100%") &&
            staleLateAcceptResponseState.transferId === pendingTimeoutRetryTransferId &&
            staleLateAcceptResponseState.status === "sent" &&
            staleLateAcceptResponseText === textBeforeStaleResponse &&
            !staleLateAcceptResponseText.includes("对端已准备接收文件") &&
            staleLateRejectResponseState.transferId === pendingTimeoutRetryTransferId &&
            staleLateRejectResponseState.status === "sent" &&
            staleLateRejectResponseText === textBeforeStaleResponse &&
            !staleLateRejectResponseText.includes("old offer rejected late"),
          clipboardText,
          floatingClipboardText,
          tempText,
          memoryText,
          failedText,
          resultState,
          offerRejectText,
          offerRejectFloating,
          offerRejectState,
          fileInputLengthAfterOfferReject,
          canRetryAfterOfferReject,
          buttonLabelAfterOfferReject,
          remoteFailureText,
          remoteFailureFloating,
          remoteFailureState,
          fileInputLengthAfterRemoteFailure,
          canRetryAfterRemoteFailure,
          buttonLabelAfterRemoteFailure,
          buttonTitleAfterRemoteFailure,
          remoteRejectRetryOfferCount,
          remoteRejectRetryChunkCount,
          remoteRejectRetryCompleteCount,
          fileInputLengthAfterRemoteAccept,
          expiredPendingCount,
          pendingTimeoutText,
          pendingTimeoutFloating,
          pendingTimeoutState,
          canRetryAfterPendingTimeout,
          fileInputLengthAfterPendingTimeout,
          buttonLabelAfterPendingTimeout,
          pendingTimeoutRetryOfferCount,
          pendingTimeoutRetryChunkCount,
          pendingTimeoutRetryCompleteCount,
          pendingTimeoutRetryTransferId,
          staleResultDuringActiveReturn,
          staleResultDuringActiveCurrentId,
          staleResultDuringActiveState,
          staleResultDuringActiveText,
          staleLateResultReturn,
          staleLateResultState,
          staleLateResultText,
          staleLateProgressState,
          staleLateProgressText,
          textBeforeStaleResponse,
          staleLateAcceptResponseState,
          staleLateAcceptResponseText,
          staleLateRejectResponseState,
          staleLateRejectResponseText,
        };
      } finally {
        state.lastOutgoingFileTransfer = originalLastOutgoingTransfer;
        state.connected = originalConnected;
        elements.clipboardToggle.checked = originalClipboardToggle;
        state.client = originalClient;
        state.fileTransferActive = originalFileTransferActive;
        state.outgoingFileTransfer = originalOutgoingTransfer;
        elements.fileClipboardInput.value = "";
        updateFileClipboardButton();
        syncFloatingControlStatus();
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`outgoing file result status check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyFileClipboardIntegrityGuards(session) {
  const result = await evaluate(
    session,
    `(() => {
      if (
        typeof handleClipboardFileOffer !== "function" ||
        typeof handleClipboardFileChunk !== "function" ||
        typeof renderReceivedFiles !== "function"
      ) {
        return { ok: false, reason: "missing file clipboard handlers" };
      }
      if (typeof state !== "object" || typeof elements !== "object") {
        return { ok: false, reason: "missing app state" };
      }

      const originalTransfers = state.remoteFileTransfers;
      const originalFiles = state.receivedClipboardFiles;
      const originalWriteStatus = state.receivedClipboardWriteStatus;
      const originalClipboardToggle = elements.clipboardToggle.checked;
      const originalClient = state.client;
      const clipboardResponses = [];
      const clipboardResults = [];
      const status = document.querySelector("#receivedFilesStatus");

      function offer(transferId, files = [{ index: 0, name: "demo.txt", size: 4, mimeType: "text/plain" }]) {
        handleClipboardFileOffer({
          type: "clipboard_file_offer",
          transferId,
          fileCount: files.length,
          totalBytes: files.reduce((sum, file) => sum + file.size, 0),
          files,
        });
      }

      function resultFor(transferId) {
        return clipboardResults.find((payload) => payload.transferId === transferId) || {};
      }

      try {
        state.remoteFileTransfers = new Map();
        state.receivedClipboardFiles = [];
        elements.clipboardToggle.checked = true;
        state.client = {
          sendClipboardFileResponse: (payload) => clipboardResponses.push(payload),
          sendClipboardFileProgress: () => {},
          sendClipboardFileResult: (payload) => clipboardResults.push(payload),
        };

        offer("duplicate-transfer");
        handleClipboardFileChunk({
          type: "clipboard_file_chunk",
          transferId: "duplicate-transfer",
          fileIndex: 0,
          offset: 0,
          dataBase64: btoa("te"),
        });
        handleClipboardFileChunk({
          type: "clipboard_file_chunk",
          transferId: "duplicate-transfer",
          fileIndex: 0,
          offset: 0,
          dataBase64: btoa("st"),
        });
        const duplicateResult = resultFor("duplicate-transfer");
        const duplicateTransferGone = !state.remoteFileTransfers.has("duplicate-transfer");
        const duplicateStatusText = status?.textContent || "";

        offer("oversize-transfer");
        handleClipboardFileChunk({
          type: "clipboard_file_chunk",
          transferId: "oversize-transfer",
          fileIndex: 0,
          offset: 0,
          dataBase64: btoa("abcde"),
        });
        const oversizeResult = resultFor("oversize-transfer");
        const oversizeTransferGone = !state.remoteFileTransfers.has("oversize-transfer");

        offer("unknown-index");
        handleClipboardFileChunk({
          type: "clipboard_file_chunk",
          transferId: "unknown-index",
          fileIndex: 1,
          offset: 0,
          dataBase64: btoa("xx"),
        });
        const unknownIndexResult = resultFor("unknown-index");
        const unknownIndexTransferGone = !state.remoteFileTransfers.has("unknown-index");

        const acceptedOffers = clipboardResponses.filter((payload) => payload.accepted).length;
        const rejectedResults = clipboardResults.filter((payload) => payload.accepted === false);
        const duplicateReason = String(duplicateResult.reason || "");
        const oversizeReason = String(oversizeResult.reason || "");
        const unknownIndexReason = String(unknownIndexResult.reason || "");

        return {
          ok:
            acceptedOffers === 3 &&
            rejectedResults.length === 3 &&
            duplicateTransferGone &&
            oversizeTransferGone &&
            unknownIndexTransferGone &&
            duplicateResult.code === "LAN011" &&
            oversizeResult.code === "LAN011" &&
            unknownIndexResult.code === "LAN011" &&
            duplicateReason.includes("offset") &&
            duplicateReason.includes("期望") &&
            oversizeReason.includes("超过声明大小") &&
            unknownIndexReason.includes("未在清单中") &&
            duplicateStatusText.includes("请让 Mac 重新复制"),
          acceptedOffers,
          rejectedResults,
          duplicateResult,
          oversizeResult,
          unknownIndexResult,
          duplicateTransferGone,
          oversizeTransferGone,
          unknownIndexTransferGone,
          duplicateStatusText,
        };
      } finally {
        state.remoteFileTransfers = originalTransfers;
        state.receivedClipboardFiles = originalFiles;
        state.receivedClipboardWriteStatus = originalWriteStatus;
        elements.clipboardToggle.checked = originalClipboardToggle;
        state.client = originalClient;
        renderReceivedFiles();
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`file clipboard integrity guard check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyBlackBarInputGuard(session) {
  const result = await evaluate(
    session,
    `(() => {
      if (
        typeof canSendControlInput !== "function" ||
        typeof registerInputEvent !== "function" ||
        typeof updateCursor !== "function"
      ) {
        return { ok: false, reason: "missing input functions" };
      }

      const canvas = document.querySelector("#remoteCanvas");
      const status = document.querySelector("#remoteStatusText");
      const cursorDot = document.querySelector("#cursorDot");
      const scaleSelect = document.querySelector("#scaleModeSelect");
      if (!canvas || !status || !cursorDot || !scaleSelect || typeof state !== "object") {
        return { ok: false, reason: "missing input guard elements" };
      }

      const originalCanSend = canSendControlInput;
      const originalRegister = registerInputEvent;
      const originalRect = canvas.getBoundingClientRect.bind(canvas);
      const originalScale = scaleSelect.value;
      const originalConnected = state.connected;
      const originalDirection = state.controlDirection;
      const originalWidth = state.remoteFrameWidth;
      const originalHeight = state.remoteFrameHeight;
      const originalLastPointer = state.lastRemotePointer;
      const originalButtons = new Set(state.remotePointerButtonsDown);
      const sent = [];

      const defineMetric = (name, value) => {
        Object.defineProperty(canvas, name, {
          configurable: true,
          value,
        });
      };
      const mouse = (type, x, y, button = 0) =>
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button,
        });

      try {
        canSendControlInput = () => true;
        registerInputEvent = (kind, detail, payload = {}) => {
          sent.push({ kind, detail, payload });
        };
        canvas.getBoundingClientRect = () => ({
          left: 10,
          top: 20,
          width: 1000,
          height: 1000,
          right: 1010,
          bottom: 1020,
          x: 10,
          y: 20,
          toJSON() {
            return this;
          },
        });
        defineMetric("clientWidth", 1000);
        defineMetric("clientHeight", 1000);
        defineMetric("scrollWidth", 1000);
        defineMetric("scrollHeight", 1000);
        defineMetric("scrollLeft", 0);
        defineMetric("scrollTop", 0);
        state.connected = true;
        state.controlDirection = "windows_to_mac";
        state.remoteFrameWidth = 1920;
        state.remoteFrameHeight = 1080;
        state.lastRemotePointer = null;
        state.remotePointerButtonsDown.clear();
        scaleSelect.value = "fit";
        if (typeof applyScaleMode === "function") applyScaleMode();

        canvas.dispatchEvent(mouse("mousemove", 20, 40));
        const moveIgnored = sent.length === 0 && cursorDot.classList.contains("is-hidden");

        canvas.dispatchEvent(mouse("mousedown", 20, 40, 0));
        const blackBarDownIgnored =
          sent.length === 0 &&
          status.textContent.includes("黑边区域不会发送远控输入");

        canvas.dispatchEvent(mouse("mousedown", 510, 520, 0));
        const insideDownSent =
          sent.length === 1 &&
          sent[0].payload.event === "mouse_button" &&
          sent[0].payload.action === "down" &&
          sent[0].payload.remoteX === 960 &&
          sent[0].payload.remoteY === 540;

        canvas.dispatchEvent(mouse("mouseup", 20, 40, 0));
        const releaseSentAtLastPoint =
          sent.length === 2 &&
          sent[1].payload.event === "mouse_button" &&
          sent[1].payload.action === "up" &&
          sent[1].payload.remoteX === 960 &&
          sent[1].payload.remoteY === 540;

        canvas.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: 20,
            clientY: 40,
            deltaY: 120,
          }),
        );
        const blackBarWheelIgnored = sent.length === 2;

        return {
          ok:
            moveIgnored &&
            blackBarDownIgnored &&
            insideDownSent &&
            releaseSentAtLastPoint &&
            blackBarWheelIgnored,
          moveIgnored,
          blackBarDownIgnored,
          insideDownSent,
          releaseSentAtLastPoint,
          blackBarWheelIgnored,
          sentCount: sent.length,
          status: status.textContent,
          sent,
        };
      } finally {
        canSendControlInput = originalCanSend;
        registerInputEvent = originalRegister;
        canvas.getBoundingClientRect = originalRect;
        delete canvas.clientWidth;
        delete canvas.clientHeight;
        delete canvas.scrollWidth;
        delete canvas.scrollHeight;
        delete canvas.scrollLeft;
        delete canvas.scrollTop;
        scaleSelect.value = originalScale;
        state.connected = originalConnected;
        state.controlDirection = originalDirection;
        state.remoteFrameWidth = originalWidth;
        state.remoteFrameHeight = originalHeight;
        state.lastRemotePointer = originalLastPointer;
        state.remotePointerButtonsDown.clear();
        for (const button of originalButtons) state.remotePointerButtonsDown.add(button);
        if (typeof applyScaleMode === "function") applyScaleMode();
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`black bar input guard check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyStreamFallbackDiagnostics(session) {
  const result = await evaluate(
    session,
    `(() => {
      if (
        typeof handleProtocolMessage !== "function" ||
        typeof resetHostDiagnostics !== "function" ||
        typeof renderHostDiagnosticsText !== "function" ||
        typeof state !== "object"
      ) {
        return { ok: false, reason: "missing diagnostics functions" };
      }

      const diagnosticsElement = document.querySelector("#hostDiagnosticsText");
      if (!diagnosticsElement) {
        return { ok: false, reason: "missing diagnostics element" };
      }

      const originalDiagnostics = { ...state.hostDiagnostics };
      const originalText = diagnosticsElement.textContent;
      const originalOk = diagnosticsElement.classList.contains("is-ok");
      const originalWarning = diagnosticsElement.classList.contains("is-warning");
      const fallbackReason = "H.264 启动超时，已回退 JPEG";
      const runtime = {
        processId: 12345,
        startedAt: "2026-06-12T08:00:00Z",
        uptimeSeconds: 7322,
        buildId: "runtime-test",
      };

      try {
        resetHostDiagnostics();
        handleProtocolMessage({
          type: "display_settings_ack",
          accepted: true,
          hostMode: "mac-host-h264-stream",
          videoCodec: "h264",
          videoEncoding: "annexb-base64",
          capturePipeline: "screencapturekit-h264",
          runtime,
        });

        const runtimeText = diagnosticsElement.textContent;
        const runtimeState = state.hostDiagnostics.runtime || {};

        handleProtocolMessage({
          type: "display_settings_ack",
          accepted: true,
          hostMode: "mac-host-background-jpeg",
          videoCodec: "jpeg",
          videoEncoding: "data-url",
          capturePipeline: "background-jpeg",
          streamFallbackReason: fallbackReason,
        });

        const fallbackText = diagnosticsElement.textContent;
        const fallbackWarning = diagnosticsElement.classList.contains("is-warning");
        const fallbackState = state.hostDiagnostics.streamFallbackReason;
        const fallbackRuntimeState = state.hostDiagnostics.runtime || {};

        handleProtocolMessage({
          type: "display_settings_ack",
          accepted: true,
          hostMode: "mac-host-h264-stream",
          videoCodec: "h264",
          videoEncoding: "annexb-base64",
          capturePipeline: "screencapturekit-h264",
        });

        const clearedText = diagnosticsElement.textContent;
        const clearedState = state.hostDiagnostics.streamFallbackReason;

        return {
          ok:
            fallbackText.includes("视频回退") &&
            fallbackText.includes(fallbackReason) &&
            runtimeText.includes("运行") &&
            runtimeText.includes("PID 12345") &&
            runtimeText.includes("runtime-test") &&
            runtimeState.buildId === runtime.buildId &&
            fallbackText.includes("runtime-test") &&
            fallbackRuntimeState.processId === "12345" &&
            fallbackWarning &&
            fallbackState === fallbackReason &&
            !clearedText.includes(fallbackReason) &&
            clearedState === "" &&
            clearedText.includes("runtime-test"),
          runtimeText,
          runtimeState,
          fallbackText,
          fallbackWarning,
          fallbackState,
          fallbackRuntimeState,
          clearedText,
          clearedState,
        };
      } finally {
        state.hostDiagnostics = originalDiagnostics;
        diagnosticsElement.textContent = originalText;
        diagnosticsElement.classList.toggle("is-ok", originalOk);
        diagnosticsElement.classList.toggle("is-warning", originalWarning);
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`stream fallback diagnostics check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyVideoFrameAgeDiagnostics(session) {
  const result = await evaluate(
    session,
    `(() => {
      if (
        typeof handleProtocolMessage !== "function" ||
        typeof resetHostDiagnostics !== "function" ||
        typeof resetVideoFrameStats !== "function" ||
        typeof state !== "object"
      ) {
        return { ok: false, reason: "missing video frame diagnostics functions" };
      }

      const diagnosticsElement = document.querySelector("#hostDiagnosticsText");
      const latencyElement = document.querySelector("#metricLatency");
      const fpsElement = document.querySelector("#metricFps");
      const resolutionElement = document.querySelector("#metricResolution");
      const remoteCanvas = document.querySelector("#remoteCanvas");
      const image = document.querySelector("#remoteFrameImage");
      if (!diagnosticsElement || !latencyElement || !fpsElement || !resolutionElement || !remoteCanvas || !image) {
        return { ok: false, reason: "missing video frame diagnostics elements" };
      }

      const originalDiagnostics = { ...state.hostDiagnostics };
      const originalText = diagnosticsElement.textContent;
      const originalOk = diagnosticsElement.classList.contains("is-ok");
      const originalWarning = diagnosticsElement.classList.contains("is-warning");
      const originalLatency = latencyElement.textContent;
      const originalFpsText = fpsElement.textContent;
      const originalResolutionText = resolutionElement.textContent;
      const originalVideoFrames = state.videoFrames;
      const originalFrameTimes = [...state.videoFrameTimes];
      const originalActualFps = state.actualVideoFps;
      const originalRequestedFps = state.requestedFps;
      const originalNegotiatedFps = state.negotiatedFps;
      const originalFrameAgeMs = state.lastVideoFrameAgeMs;
      const originalFrameTimestamp = state.lastVideoFrameTimestamp;
      const originalClockSkewed = state.videoFrameClockSkewed;
      const originalCanvasHasVideo = remoteCanvas.classList.contains("has-video-frame");
      const originalImageVisible = image.classList.contains("is-visible");
      const originalImageSrc = image.getAttribute("src");
      const svgDataUrl = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22320%22%20height%3D%22180%22%3E%3Crect%20width%3D%22320%22%20height%3D%22180%22%20fill%3D%22%230f172a%22/%3E%3C/svg%3E";

      try {
        resetHostDiagnostics();
        resetVideoFrameStats();
        handleProtocolMessage({
          type: "video_frame",
          frameId: 321,
          timestamp: new Date(Date.now() - 123).toISOString(),
          width: 320,
          height: 180,
          codec: "jpeg",
          encoding: "data-url",
          source: "screen",
          capturePipeline: "background-jpeg",
          droppedFrames: 0,
          dataUrl: svgDataUrl,
        });

        const diagnostics = diagnosticsElement.textContent;
        const latency = latencyElement.textContent;
        const age = Number(state.hostDiagnostics.videoFrameAgeMs);
        const normalOk =
          diagnostics.includes("到达") &&
          latency.includes("ms") &&
          Number.isFinite(age) &&
          age >= 0 &&
          age < 5000;

        handleProtocolMessage({
          type: "video_frame",
          frameId: 322,
          timestamp: new Date(Date.now() + 2000).toISOString(),
          width: 320,
          height: 180,
          codec: "jpeg",
          encoding: "data-url",
          source: "screen",
          capturePipeline: "background-jpeg",
          droppedFrames: 0,
          dataUrl: svgDataUrl,
        });

        const skewText = diagnosticsElement.textContent;
        const skewLatency = latencyElement.textContent;
        const skewOk =
          skewText.includes("时钟偏差") &&
          skewLatency.includes("时钟偏差") &&
          state.hostDiagnostics.videoFrameClockSkewed === true;

        return {
          ok: normalOk && skewOk,
          diagnostics,
          latency,
          age,
          skewText,
          skewLatency,
        };
      } finally {
        state.hostDiagnostics = originalDiagnostics;
        state.videoFrames = originalVideoFrames;
        state.videoFrameTimes = originalFrameTimes;
        state.actualVideoFps = originalActualFps;
        state.requestedFps = originalRequestedFps;
        state.negotiatedFps = originalNegotiatedFps;
        state.lastVideoFrameAgeMs = originalFrameAgeMs;
        state.lastVideoFrameTimestamp = originalFrameTimestamp;
        state.videoFrameClockSkewed = originalClockSkewed;
        diagnosticsElement.textContent = originalText;
        diagnosticsElement.classList.toggle("is-ok", originalOk);
        diagnosticsElement.classList.toggle("is-warning", originalWarning);
        latencyElement.textContent = originalLatency;
        fpsElement.textContent = originalFpsText;
        resolutionElement.textContent = originalResolutionText;
        remoteCanvas.classList.toggle("has-video-frame", originalCanvasHasVideo);
        image.classList.toggle("is-visible", originalImageVisible);
        if (originalImageSrc) {
          image.setAttribute("src", originalImageSrc);
        } else {
          image.removeAttribute("src");
        }
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`video frame age diagnostics check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyLowFpsDiagnostics(session) {
  const result = await evaluate(
    session,
    `(() => {
      if (
        typeof updateHostDiagnostics !== "function" ||
        typeof resetHostDiagnostics !== "function" ||
        typeof buildLogExportText !== "function" ||
        typeof state !== "object"
      ) {
        return { ok: false, reason: "missing low FPS diagnostics functions" };
      }

      const diagnosticsElement = document.querySelector("#hostDiagnosticsText");
      if (!diagnosticsElement) {
        return { ok: false, reason: "missing diagnostics element" };
      }

      const originalDiagnostics = { ...state.hostDiagnostics };
      const originalConnected = state.connected;
      const originalActualFps = state.actualVideoFps;
      const originalRequestedFps = state.requestedFps;
      const originalNegotiatedFps = state.negotiatedFps;
      const originalText = diagnosticsElement.textContent;
      const originalOk = diagnosticsElement.classList.contains("is-ok");
      const originalWarning = diagnosticsElement.classList.contains("is-warning");

      try {
        resetHostDiagnostics();
        state.connected = true;
        state.actualVideoFps = 22.9;
        state.negotiatedFps = 30;
        state.requestedFps = 60;
        updateHostDiagnostics({
          videoCodec: "jpeg",
          videoEncoding: "data-url",
          videoSource: "screen",
          capturePipeline: "background-jpeg",
          droppedFrames: 0,
          maxScreenFps: 30,
        });
        const lowText = diagnosticsElement.textContent;
        const lowWarning = diagnosticsElement.classList.contains("is-warning");
        const exportText = buildLogExportText();
        const exportVideo =
          exportText.includes("- 视频：JPEG") &&
          exportText.includes("实收 22.9 FPS") &&
          exportText.includes("协商 30 Hz") &&
          exportText.includes("请求 60 Hz") &&
          exportText.includes("低于协商 30 Hz") &&
          exportText.includes("远端上限 30 Hz") &&
          exportText.includes("- 视频状态：JPEG");

        state.actualVideoFps = 29;
        updateHostDiagnostics({ maxScreenFps: 30 });
        const cappedText = diagnosticsElement.textContent;
        const cappedWarning = diagnosticsElement.classList.contains("is-warning");

        state.actualVideoFps = 58;
        state.negotiatedFps = 60;
        updateHostDiagnostics({ maxScreenFps: null });
        const nearText = diagnosticsElement.textContent;
        const nearWarning = diagnosticsElement.classList.contains("is-warning");

        return {
          ok:
            lowText.includes("低于协商 30 Hz") &&
            lowText.includes("远端上限 30 Hz") &&
            lowWarning &&
            exportVideo &&
            cappedText.includes("远端上限 30 Hz") &&
            !cappedText.includes("低于协商") &&
            !cappedText.includes("低于请求") &&
            cappedWarning &&
            !nearText.includes("低于请求") &&
            !nearText.includes("远端上限") &&
            !nearWarning,
          lowText,
          lowWarning,
          exportVideo,
          cappedText,
          cappedWarning,
          nearText,
          nearWarning,
        };
      } finally {
        state.hostDiagnostics = originalDiagnostics;
        state.connected = originalConnected;
        state.actualVideoFps = originalActualFps;
        state.requestedFps = originalRequestedFps;
        state.negotiatedFps = originalNegotiatedFps;
        diagnosticsElement.textContent = originalText;
        diagnosticsElement.classList.toggle("is-ok", originalOk);
        diagnosticsElement.classList.toggle("is-warning", originalWarning);
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`low FPS diagnostics check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyDiscoveryRuntimeDiagnostics(session, { host, port, buildId, timeoutMs }) {
  const result = await evaluate(
    session,
    `(async () => {
      if (
        typeof refreshDevices !== "function" ||
        typeof state !== "object" ||
        typeof elements !== "object"
      ) {
        return { ok: false, reason: "missing discovery functions" };
      }

      const setValue = (selector, value) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        element.value = value;
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      };

      setValue("#transportSelect", "local");
      setValue("#hostInput", ${JSON.stringify(host)});
      setValue("#portInput", ${JSON.stringify(port)});
      await refreshDevices();

      const targetHost = ${JSON.stringify(host)};
      const targetPort = ${JSON.stringify(String(port))};
      const buildId = ${JSON.stringify(buildId)};
      const rows = [...document.querySelectorAll(".device-row")];
      const row = rows.find((item) => item.dataset.host === targetHost && item.dataset.port === targetPort);
      const detail = row?.innerText || "";
      const diagnostics = document.querySelector("#hostDiagnosticsText")?.textContent || "";
      const selectedHost = document.querySelector("#hostInput")?.value || "";
      const selectedPort = document.querySelector("#portInput")?.value || "";
      const selectedTransport = document.querySelector("#transportSelect")?.value || "";
      const device = state.discoveredDevices.find(
        (item) => item.host === targetHost && String(item.port) === targetPort,
      );
      const runtime = device?.runtime || {};

      return {
        ok:
          Boolean(row) &&
          row.classList.contains("active") &&
          selectedHost === targetHost &&
          selectedPort === targetPort &&
          selectedTransport === "websocket" &&
          detail.includes(buildId) &&
          diagnostics.includes("运行") &&
          diagnostics.includes(buildId) &&
          runtime.buildId === buildId,
        detail,
        diagnostics,
        selectedHost,
        selectedPort,
        selectedTransport,
        active: Boolean(row?.classList.contains("active")),
        runtime,
        rowCount: rows.length,
      };
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`discovery runtime diagnostics check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyH264KeyFrameDetection(session) {
  const result = await evaluate(
    session,
    `(() => {
      if (typeof isH264KeyFramePayload !== "function") {
        return { ok: false, reason: "missing H.264 key frame helper" };
      }
      const annexbKey = new Uint8Array([
        0, 0, 0, 1, 0x67, 0x42, 0xe0, 0x1f,
        0, 0, 0, 1, 0x68, 0xce, 0x06, 0xe2,
        0, 0, 0, 1, 0x65, 0x88, 0x84,
      ]);
      const annexbDelta = new Uint8Array([0, 0, 0, 1, 0x41, 0x9a, 0x22]);
      const avcKey = new Uint8Array([0, 0, 0, 3, 0x65, 0x88, 0x84]);
      return {
        ok:
          isH264KeyFramePayload(annexbKey, "annexb-base64") &&
          !isH264KeyFramePayload(annexbDelta, "annexb-base64") &&
          isH264KeyFramePayload(avcKey, "avc"),
        annexbKey: isH264KeyFramePayload(annexbKey, "annexb-base64"),
        annexbDelta: isH264KeyFramePayload(annexbDelta, "annexb-base64"),
        avcKey: isH264KeyFramePayload(avcKey, "avc"),
      };
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`H.264 key frame detection check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyInputModeStatusText(session) {
  const result = await evaluate(
    session,
    `(() => {
      if (
        typeof updateHostDiagnostics !== "function" ||
        typeof resetHostDiagnostics !== "function" ||
        typeof updateInputStatus !== "function"
      ) {
        return { ok: false, reason: "missing input status functions" };
      }

      const inputText = () => document.querySelector("#inputText")?.textContent || "";
      const reset = () => {
        resetHostDiagnostics();
        updateInputStatus();
      };

      try {
        reset();
        const initial = inputText();
        updateHostDiagnostics({
          inputMode: "log",
          inputAckStatus: "",
          inputAckCode: "",
          inputAckReason: "",
        });
        const logMode = inputText();
        updateHostDiagnostics({
          inputMode: "log",
          inputAckStatus: "logged",
          inputAckCode: "",
          inputAckReason: "",
        });
        const logged = inputText();
        updateHostDiagnostics({
          inputMode: "inject",
          inputAckStatus: "injected",
          inputAckCode: "",
          inputAckReason: "",
        });
        const injected = inputText();
        updateHostDiagnostics({
          inputMode: "log",
          inputAckStatus: "rejected",
          inputAckCode: "LAN403",
          inputAckReason: "permission missing",
        });
        const rejected = inputText();

        return {
          ok:
            /^输入事件：\\d+$/.test(initial) &&
            logMode.includes("安全日志") &&
            logMode.includes("不会真正控制") &&
            logged.includes("已记录") &&
            injected.includes("真实控制") &&
            injected.includes("已注入") &&
            rejected.includes("被拒绝") &&
            rejected.includes("LAN403"),
          initial,
          logMode,
          logged,
          injected,
          rejected,
        };
      } finally {
        reset();
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`Input mode status text check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyWindowsToMacKeyboardMapping(session) {
  const result = await evaluate(
    session,
    `(() => {
      if (
        typeof mapKeyboardModifiers !== "function" ||
        typeof describeKeyboardInput !== "function" ||
        typeof elements !== "object"
      ) {
        return { ok: false, reason: "missing keyboard mapping functions" };
      }

      const originalWin = elements.keyMapWinSelect.value;
      const originalAlt = elements.keyMapAltSelect.value;
      const originalCtrl = elements.keyMapCtrlSelect.value;
      const originalCompatibility = elements.shortcutCompatToggle.checked;
      const event = (key, code, flags = {}) =>
        new KeyboardEvent("keydown", {
          key,
          code,
          ctrlKey: Boolean(flags.ctrlKey),
          altKey: Boolean(flags.altKey),
          shiftKey: Boolean(flags.shiftKey),
          metaKey: Boolean(flags.metaKey),
          bubbles: true,
          cancelable: true,
        });

      try {
        elements.keyMapWinSelect.value = "meta";
        elements.keyMapAltSelect.value = "alt";
        elements.keyMapCtrlSelect.value = "ctrl";
        elements.shortcutCompatToggle.checked = true;

        const copy = mapKeyboardModifiers(event("c", "KeyC", { ctrlKey: true }));
        const paste = mapKeyboardModifiers(event("v", "KeyV", { ctrlKey: true }));
        const redoShift = mapKeyboardModifiers(event("z", "KeyZ", { ctrlKey: true, shiftKey: true }));
        const redoY = mapKeyboardModifiers(event("y", "KeyY", { ctrlKey: true }));
        const copyDescription = describeKeyboardInput(event("c", "KeyC", { ctrlKey: true }), copy);

        elements.shortcutCompatToggle.checked = false;
        const plainCtrl = mapKeyboardModifiers(event("c", "KeyC", { ctrlKey: true }));

        elements.shortcutCompatToggle.checked = true;
        elements.keyMapWinSelect.value = "none";
        elements.keyMapAltSelect.value = "meta";
        elements.keyMapCtrlSelect.value = "alt";
        const custom = mapKeyboardModifiers(event("k", "KeyK", {
          ctrlKey: true,
          altKey: true,
          metaKey: true,
        }));

        return {
          ok:
            copy.shortcutProfile === "windows_to_macos" &&
            copy.shortcutAction === "copy" &&
            copy.key === "c" &&
            copy.code === "KeyC" &&
            copy.metaKey === true &&
            copy.ctrlKey === false &&
            copy.modifiers.join("+") === "meta" &&
            paste.shortcutAction === "paste" &&
            redoShift.shortcutAction === "redo" &&
            redoShift.modifiers.join("+") === "meta+shift" &&
            redoY.shortcutAction === "redo" &&
            redoY.key === "z" &&
            redoY.modifiers.join("+") === "meta+shift" &&
            plainCtrl.shortcutProfile === undefined &&
            plainCtrl.ctrlKey === true &&
            plainCtrl.metaKey === false &&
            plainCtrl.modifiers.join("+") === "ctrl" &&
            custom.modifiers.join("+") === "meta+alt" &&
            custom.metaKey === true &&
            custom.altKey === true &&
            custom.ctrlKey === false &&
            copyDescription.includes("⌘ Command+c") &&
            copyDescription.includes("复制"),
          copy,
          paste,
          redoShift,
          redoY,
          plainCtrl,
          custom,
          copyDescription,
        };
      } finally {
        elements.keyMapWinSelect.value = originalWin;
        elements.keyMapAltSelect.value = originalAlt;
        elements.keyMapCtrlSelect.value = originalCtrl;
        elements.shortcutCompatToggle.checked = originalCompatibility;
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`Windows-to-Mac keyboard mapping check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function verifyReconnectControls(session) {
  const result = await evaluate(
    session,
    `(async () => {
      if (
        typeof scheduleReconnect !== "function" ||
        typeof reconnectNow !== "function" ||
        typeof clearReconnectTimers !== "function" ||
        typeof connect !== "function" ||
        typeof buildLogExportText !== "function" ||
        typeof copyLogsToClipboard !== "function" ||
        typeof state !== "object"
      ) {
        return { ok: false, reason: "missing reconnect functions" };
      }

      const reconnectButton = document.querySelector("#reconnectNowButton");
      const floatingReconnectButton = document.querySelector("#floatingReconnectButton");
      const actions = document.querySelector("#connectionActions");
      const status = document.querySelector("#statusText");
      const remote = document.querySelector("#remoteStatusText");
      const connectButton = document.querySelector("#connectButton");
      const disconnectButton = document.querySelector("#disconnectButton");
      const copyButton = document.querySelector("#copyLogButton");
      const eventLog = document.querySelector("#eventLog");
      const hostDiagnosticsElement = document.querySelector("#hostDiagnosticsText");
      if (!reconnectButton || !floatingReconnectButton || !actions || !status || !remote || !connectButton || !disconnectButton || !copyButton) {
        return { ok: false, reason: "missing reconnect elements" };
      }

      const originalConnect = connect;
      const originalAttempts = state.reconnectAttempts;
      const originalTimer = state.reconnectTimer;
      const originalCountdownTimer = state.reconnectCountdownTimer;
      const originalStableTimer = state.reconnectStableTimer;
      const originalDueAt = state.reconnectDueAt;
      const originalReason = state.reconnectReason;
      const originalHost = state.activeHost;
      const originalPort = state.activePort;
      const originalConnected = state.connected;
      const originalConnecting = state.connecting;
      const originalConnectionState = state.connectionState;
      const originalManualDisconnect = state.manualDisconnect;
      const originalActionsClass = actions.className;
      const originalReconnectHidden = reconnectButton.hidden;
      const originalReconnectDisabled = reconnectButton.disabled;
      const originalFloatingReconnectHidden = floatingReconnectButton.hidden;
      const originalFloatingReconnectDisabled = floatingReconnectButton.disabled;
      const originalConnectDisabled = connectButton.disabled;
      const originalDisconnectDisabled = disconnectButton.disabled;
      const originalStatus = status.textContent;
      const originalRemote = remote.textContent;
      const originalBadge = document.querySelector("#connectionBadge")?.className || "";
      const originalBadgeText = document.querySelector("#connectionBadge")?.textContent || "";
      const originalTauri = window.__TAURI__;
      const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
      const originalLogEntries = Array.isArray(state.logEntries) ? state.logEntries.slice() : [];
      const originalEventLogHtml = eventLog?.innerHTML || "";
      const originalWatcherRunning = state.localMacAlertWatcherRunning;
      const originalWatcherBusy = state.localMacAlertWatcherBusy;
      const originalWatcherCheckedAt = state.localMacAlertWatcherStatusCheckedAt;
      const originalWatcherFindingText = state.localMacAlertWatcherFindingText || "";
      const originalWatcherStatus = document.querySelector("#localMacAlertWatcherStatusText")?.textContent || "";
      const originalLocalHostRunning = state.localHostRunning;
      const originalLocalHostOnline = state.localHostOnline;
      const originalLocalHostBusy = state.localHostBusy;
      const localHostBadge = document.querySelector("#localHostBadge");
      const localHostStatus = document.querySelector("#localHostStatusText");
      const localHostOutput = document.querySelector("#localHostOutput");
      const localHostProbeMediaToggle = document.querySelector("#localHostProbeMediaToggle");
      const localHostInputSelect = document.querySelector("#localHostInputModeSelect");
      const localHostReverseSelect = document.querySelector("#localHostReverseControlModeSelect");
      const localHostReadinessSelect = document.querySelector("#localHostReadinessProfileSelect");
      const clipboardToggleElement = document.querySelector("#clipboardToggle");
      const audioToggleElement = document.querySelector("#audioToggle");
      const audioVolumeElement = document.querySelector("#audioVolumeRange");
      const originalLocalHostBadgeText = localHostBadge?.textContent || "";
      const originalLocalHostBadgeClass = localHostBadge?.className || "";
      const originalLocalHostStatus = localHostStatus?.textContent || "";
      const originalLocalHostOutput = localHostOutput?.textContent || "";
      const originalProbeMedia = Boolean(localHostProbeMediaToggle?.checked);
      const originalLocalHostInputValue = localHostInputSelect?.value || "";
      const originalLocalHostReverseValue = localHostReverseSelect?.value || "";
      const originalLocalHostReadinessValue = localHostReadinessSelect?.value || "";
      const originalReceivedFiles = state.receivedClipboardFiles;
      const originalReceivedTempPath = state.receivedClipboardTempPath;
      const originalReceivedWriteStatus = state.receivedClipboardWriteStatus;
      const originalRemoteFileTransfers = state.remoteFileTransfers;
      const originalLastOutgoingFileTransfer = state.lastOutgoingFileTransfer;
      const originalClipboardChecked = Boolean(clipboardToggleElement?.checked);
      const originalAudioChecked = Boolean(audioToggleElement?.checked);
      const originalAudioVolume = audioVolumeElement?.value || "";
      const originalAudioFrames = state.audioFrames;
      const originalAudioLevel = state.audioLevel;
      const originalAudioPlayedFrames = state.audioPlayedFrames;
      const originalAudioDroppedFrames = state.audioDroppedFrames;
      const originalAudioLastError = state.audioLastError;
      const originalInputEvents = state.inputEvents;
      const originalHostDiagnostics = { ...(state.hostDiagnostics || {}) };
      const originalHostDiagnosticsText = hostDiagnosticsElement?.textContent || "";
      const originalHostDiagnosticsClass = hostDiagnosticsElement?.className || "";
      const originalControlDirection = state.controlDirection;
      const calls = [];
      let copiedText = "";
      const macAlertFindingText = [
        "MacUnattendedStatus=attention warnings=launch-agent-missing,launch-agent-max-fps,power-risk blockers=none",
        "MacFormalStatus=ready with warnings: blockers: none warnings: video,build,auth,windows-host,repo",
        "MacResumeStatus=ready with warnings blockers=none warnings=h264-fallback,fps-limit",
        "MacHostReadiness=attention blockers=none warnings=mac-host-discovery,agent-link-board-currentcall,mac-host-max-fps",
        "MacHostSafeStart=node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770",
        "MacMaxFpsSafeStart=node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword --host 0.0.0.0 --port 43770 --maxScreenFps 60",
        "MacClientDiscoverWindows=node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary",
        "WindowsLanRisk=no-firewall-allow,public-profile",
        "WindowsFirewallStatus=node scripts/windows/check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --json",
        "WindowsFirewallPreview=node scripts/windows/check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --dryRunRule --ruleProfile Private",
        "MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs --host 192.168.31.68 --port 43770 --boardSummary",
        "MacFormalLocalSmoke=failed blockers=auth warnings=video",
        "RerunFormalLocalSmoke=node scripts/mac/check-mac-formal-local-smoke.mjs --host 127.0.0.1 --port 43770 --promptPassword --boardSummary",
        "WindowsReverseGrantStatus=pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Status -BoardSummary",
        "WindowsOpenOneTimeReverseGrant=pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Grant -DurationMs 30000 -BoardSummary",
        "WindowsSecureAuthPath=node scripts/windows/start-windows-host.mjs --host 0.0.0.0 --port 43770 --promptPassword --requirePassword",
        "run-mac-client-formal-smoke preflight ready=false blockers=windows-host warnings=board",
        "MacHeartbeat=status=ok; checkedAt=2020-01-01T00:00:00.000Z; device=Mac; codex=ok status=coding updatedAt=2020-01-01T00:00:00.000Z ageMs=999999; macHost=online 127.0.0.1:43770; macClient=online http://127.0.0.1:5188/; board=ok boardUpdatedAt=2020-01-01T00:00:00.000Z; blockers=none warnings=none reason=ok",
        "MacHeartbeat=stale heartbeat missing; Mac host /discovery unreachable ECONNREFUSED; HTTP 502 Bad Gateway",
        "MacHeartbeat=status=blocked; codex=mac-codex-stale; blockers=mac-codex-stale warnings=none reason=mac-codex-stale",
        "MacHeartbeat=status=warning; codex=codex-reconnect-signal; blockers=none warnings=codex-reconnect-signal reason=codex-reconnect-signal",
        "MacHeartbeat=blocked reason=codex-reconnect-stuck evidence=正在重新连接 5/5 / stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses) suggestedAction=请用户查看 Mac Codex 窗口",
        "MacHeartbeatOnce=node scripts/mac/watch-mac-heartbeat.mjs --once --sendStatus --boardSummary",
        "MacHeartbeatWatch=node scripts/mac/watch-mac-heartbeat.mjs --sendStatus --intervalMs 30000",
        "MacHeartbeatStart=node scripts/mac/start-mac-heartbeat-watcher.mjs --host 127.0.0.1 --port 43770 --server http://192.168.31.68:17888 --intervalMs 30000 --boardSummary",
        "MacHeartbeatStatus=node scripts/mac/start-mac-heartbeat-watcher.mjs --status --host 127.0.0.1 --port 43770 --server http://192.168.31.68:17888 --boardSummary",
        "MacHeartbeatStop=node scripts/mac/start-mac-heartbeat-watcher.mjs --stop --host 127.0.0.1 --port 43770 --server http://192.168.31.68:17888 --boardSummary",
      ].join("; ");

      try {
        connect = async (options = {}) => {
          calls.push({ reconnect: Boolean(options.reconnect) });
        };
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (text) => {
              copiedText = String(text);
            },
          },
        });
        window.__TAURI__ = { core: { invoke: async () => ({}) } };
        state.localMacAlertWatcherRunning = true;
        state.localMacAlertWatcherBusy = false;
        state.localMacAlertWatcherStatusCheckedAt = Date.now();
        state.localMacAlertWatcherFindingText = macAlertFindingText;
        const watcherStatus = document.querySelector("#localMacAlertWatcherStatusText");
        if (watcherStatus) {
          watcherStatus.textContent = "Windows 浮窗提醒已开启，监听测试联络板。" + macAlertFindingText;
        }
        state.localHostRunning = true;
        state.localHostOnline = true;
        state.localHostBusy = false;
        if (localHostBadge) {
          localHostBadge.textContent = "运行中";
          localHostBadge.className = "status-badge online";
        }
        if (localHostStatus) localHostStatus.textContent = "本机被控正在运行：PID 2468 · 反控 需确认";
        if (localHostOutput) localHostOutput.textContent = "[INFO] Windows host ready\\npassword=should-not-export";
        if (localHostProbeMediaToggle) localHostProbeMediaToggle.checked = true;
        if (localHostInputSelect) localHostInputSelect.value = "log";
        if (localHostReverseSelect) localHostReverseSelect.value = "deny";
        if (localHostReadinessSelect) localHostReadinessSelect.value = "default";
        state.reconnectAttempts = 0;
        state.activeHost = "192.168.31.122";
        state.activePort = "43770";
        state.connected = false;
        state.connecting = false;
        state.manualDisconnect = false;
        state.receivedClipboardFiles = [
          {
            name: "demo.zip",
            size: 3,
            mimeType: "application/zip",
            blob: new Blob(["zip"]),
            objectUrl: "",
          },
        ];
        state.receivedClipboardTempPath = "C:/Temp/lan-dual-control/clip-1";
        state.receivedClipboardWriteStatus = {
          kind: "warning",
          text: "远端文件接收超时：2 B/4 B，45 秒没有收到新分块或完成消息。已停止接收，请让 Mac 重新复制。",
        };
        state.remoteFileTransfers = new Map([
          [
            "diagnostic-transfer",
            {
              transferId: "diagnostic-transfer",
              totalBytes: 4096,
              receivedBytes: 1024,
              fileCount: 1,
              files: [
                {
                  index: 0,
                  name: "demo.txt",
                  size: 4,
                  mimeType: "text/plain",
                },
              ],
              startedAt: Date.now() - 2000,
              lastActivityAt: Date.now() - 1000,
              rateSamples: [
                { bytes: 2048, durationMs: 1000 },
                { bytes: 2048, durationMs: 1000 },
              ],
            },
          ],
        ]);
        state.lastOutgoingFileTransfer = {
          transferId: "diagnostic-outgoing-timeout",
          status: "remote-result",
          accepted: false,
          fileCount: 1,
          sentBytes: 65792,
          receivedBytes: 65792,
          totalBytes: 65792,
          files: [
            {
              index: 0,
              name: "pending-timeout.zip",
              size: 65792,
              mimeType: "application/zip",
            },
          ],
          reason: "对端确认超时：64.3 KB/64.3 KB，46 秒没有收到结果",
          canRetry: true,
          completedAt: Date.now() - 46000,
          failedAt: Date.now() - 1000,
        };
        if (clipboardToggleElement) clipboardToggleElement.checked = true;
        if (audioToggleElement) audioToggleElement.checked = true;
        if (audioVolumeElement) audioVolumeElement.value = "33";
        state.audioFrames = 24;
        state.audioLevel = 0.37;
        state.audioPlayedFrames = 0;
        state.audioDroppedFrames = 2;
        state.audioLastError = "";
        scheduleReconnect("测试断线");
        state.inputEvents = 7;
        state.controlDirection = "windows_to_mac";
        if (typeof updateHostDiagnostics === "function") updateHostDiagnostics({
          hostMode: "mac-host-background-jpeg",
          capturePipeline: "background-jpeg",
          permissions: {
            screenRecording: true,
            accessibility: false,
            inputMonitoring: true,
          },
          runtime: {
            processId: 24680,
            uptimeSeconds: 3661,
            buildId: "host-build-test",
          },
          videoCodec: "jpeg",
          videoEncoding: "data-url",
          streamFallbackReason: "H.264 启动超时，已回退 JPEG",
          clipboardText: true,
          clipboardTextMode: "system",
          clipboardFile: false,
          clipboardFileMode: "unsupported",
          inputMode: "log",
          inputAckStatus: "logged",
          inputAckCode: "",
          inputAckReason: "",
        });
        if (typeof updateInputStatus === "function") updateInputStatus();
        const exportText = typeof buildLogExportText === "function" ? buildLogExportText() : "";
        const exportChecks = {
          quickSummarySection: exportText.includes("\\n快速摘要\\n"),
          quickSummaryRemote:
            exportText.includes("- 远端连接：") && exportText.includes("192.168.31.122:43770"),
          quickSummaryHost:
            exportText.includes("- Mac 主机：") &&
            exportText.includes("PID 24680") &&
            exportText.includes("host-build-test") &&
            exportText.includes("权限") &&
            exportText.includes("辅助功能未开") &&
            exportText.includes("视频回退"),
          quickSummaryMacReachability:
            exportText.includes("- Mac 值守：恢复中") &&
            exportText.includes("值守风险") &&
            exportText.includes("提醒 提醒中") &&
            exportText.includes("Mac 心跳摘要过旧"),
          quickSummaryReconnect:
            exportText.includes("- 重连：等待自动重连") && exportText.includes("原因 测试断线"),
          quickSummaryRemoteFiles:
            exportText.includes("- 远端文件：warning") && exportText.includes("远端文件接收超时"),
          quickSummaryRemoteFileSuggestion:
            exportText.includes("- 远端文件建议：") &&
            exportText.includes("让 Mac 重新复制") &&
            exportText.includes("检查连接"),
          quickSummaryClipboard:
            exportText.includes("- 剪贴板：接收 1 个文件") &&
            exportText.includes("2 B/4 B"),
          quickSummaryClipboardCapabilitySuggestion:
            exportText.includes("- 剪贴板能力建议：") &&
            exportText.includes("文件/压缩包不能直接复制粘贴") &&
            exportText.includes("检查被控端文件剪贴板能力"),
          quickSummaryOutgoingFile:
            exportText.includes("- 本机发送文件：") &&
            exportText.includes("对端确认超时") &&
            exportText.includes("可重新发送"),
          quickSummaryOutgoingFileSuggestion:
            exportText.includes("- 本机发送建议：") &&
            exportText.includes("点击“重新发送”") &&
            exportText.includes("检查文件剪贴板能力"),
          quickSummaryAudio:
            exportText.includes("- 声音：已接收，等待播放") &&
            exportText.includes("音量 33%") &&
            exportText.includes("接收 24 帧") &&
            exportText.includes("播放 0") &&
            exportText.includes("丢 2"),
          quickSummaryInput: exportText.includes("- 输入：7（安全日志，不会真正控制 / 已记录）"),
          quickSummaryFloating:
            exportText.includes("- 全屏浮层：窗口") &&
            exportText.includes("连接：") &&
            exportText.includes("秒后重连"),
          quickSummaryLocal: exportText.includes(
            "- 本机协作：Mac 提醒 提醒中 · 本机被控 桌面壳托管运行中 · 反控 需确认",
          ),
          quickSummaryQuality: /- 画质请求：.+ Hz · .+ Mbps/.test(exportText),
          reconnectStatus: exportText.includes("- 重连状态：等待自动重连（1/3"),
          macReachabilityDetail:
            exportText.includes("- Mac 值守：恢复中") &&
            exportText.includes("视频链路需检查") &&
            exportText.includes("运行版本需检查") &&
            exportText.includes("认证/密码步骤待确认") &&
            exportText.includes("Windows 被控端未指定或未就绪") &&
            exportText.includes("仓库状态需检查") &&
            exportText.includes("LaunchAgent 刷新率上限需调整") &&
            exportText.includes("Mac 60Hz 安全启动命令已提供") &&
            exportText.includes("Mac host 安全启动命令已提供") &&
            exportText.includes("Mac client Windows 发现命令已提供") &&
            exportText.includes("Windows 防火墙入站放行需检查") &&
            exportText.includes("Windows 当前网络是 Public") &&
            exportText.includes("Windows 防火墙只读检查命令已提供") &&
            exportText.includes("Windows 防火墙放行预览命令已提供") &&
            exportText.includes("Mac client 正式清单命令已提供") &&
            exportText.includes("Mac 本机短验收需处理") &&
            exportText.includes("Mac 本机短验收重跑命令已提供") &&
            exportText.includes("Windows 反控授权状态命令已提供") &&
            exportText.includes("Windows 一次性反控授权命令已提供") &&
            exportText.includes("Windows 安全认证路径已提供") &&
            exportText.includes("Mac 心跳摘要过旧") &&
            exportText.includes("Mac 心跳过期，可能卡住") &&
            exportText.includes("Mac 后台心跳启动命令已提供") &&
            exportText.includes("Mac 后台心跳状态命令已提供") &&
            exportText.includes("Mac 后台心跳停止命令已提供") &&
            exportText.includes("Mac host 不可达") &&
            exportText.includes("Mac/API 网络错误") &&
            exportText.includes("Mac Codex 可能卡在重新连接 5/5") &&
            exportText.includes("检测到 stream disconnected before completion") &&
            exportText.includes("请查看 Mac 窗口，可能需要手动重试/刷新") &&
            exportText.includes("- Mac 值守说明：Windows 已从 Mac 提醒 watcher 状态里识别到值守 warnings/blockers"),
          reconnectReason: exportText.includes("- 重连原因：测试断线"),
          reconnectNext: exportText.includes("- 下次重连："),
          reconnectSeconds: exportText.includes("秒后）"),
          hostDiagnosticsDetail:
            exportText.includes("- 主机诊断：") &&
            exportText.includes("PID 24680") &&
            exportText.includes("host-build-test") &&
            exportText.includes("辅助功能未开"),
          macAlertStatus: exportText.includes("- Mac 提醒：提醒中"),
          macAlertDetail:
            exportText.includes("- Mac 提醒详情：Windows 浮窗提醒已开启") &&
            exportText.includes("warnings=launch-agent-missing,launch-agent-max-fps,power-risk") &&
            exportText.includes("warnings: video,build,auth,windows-host,repo") &&
            exportText.includes("warnings=h264-fallback,fps-limit") &&
            exportText.includes("warnings=mac-host-discovery,agent-link-board-currentcall,mac-host-max-fps") &&
            exportText.includes("MacHostSafeStart=node scripts/mac/start-mac-host.mjs") &&
            exportText.includes("MacMaxFpsSafeStart=node scripts/mac/start-mac-host.mjs") &&
            exportText.includes("MacClientDiscoverWindows=node scripts/mac/discover-windows-hosts.mjs") &&
            exportText.includes("WindowsLanRisk=no-firewall-allow,public-profile") &&
            exportText.includes("WindowsFirewallStatus=node scripts/windows/check-windows-firewall.mjs") &&
            exportText.includes("WindowsFirewallPreview=node scripts/windows/check-windows-firewall.mjs") &&
            !exportText.includes("WindowsFirewallPreview=node scripts/windows/check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --dryRunRule --ruleProfile Private --addRule") &&
            exportText.includes("MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs") &&
            exportText.includes("RerunFormalLocalSmoke=node scripts/mac/check-mac-formal-local-smoke.mjs") &&
            exportText.includes("WindowsReverseGrantStatus=pwsh") &&
            exportText.includes("WindowsOpenOneTimeReverseGrant=pwsh") &&
            exportText.includes("WindowsSecureAuthPath=node scripts/windows/start-windows-host.mjs") &&
            exportText.includes("checkedAt=2020-01-01T00:00:00.000Z") &&
            exportText.includes("MacHeartbeat=stale") &&
            exportText.includes("HTTP 502 Bad Gateway") &&
            exportText.includes("Mac Codex 长时间无新进展") &&
            exportText.includes("Mac Codex 出现重连异常信号") &&
            exportText.includes("Mac 单次心跳上板命令已提供") &&
            exportText.includes("Mac 持续心跳 watcher 命令已提供") &&
            exportText.includes("MacHeartbeatStart=node scripts/mac/start-mac-heartbeat-watcher.mjs") &&
            exportText.includes("MacHeartbeatStatus=node scripts/mac/start-mac-heartbeat-watcher.mjs") &&
            exportText.includes("MacHeartbeatStop=node scripts/mac/start-mac-heartbeat-watcher.mjs") &&
            exportText.includes("reason=codex-reconnect-stuck") &&
            exportText.includes("warnings=board"),
          macAlertCheckedAt: exportText.includes("- Mac 提醒最近检查："),
          macAlertHeartbeatFreshness:
            exportText.includes("- Mac 心跳新鲜度：") &&
            exportText.includes("Mac Codex") &&
            exportText.includes("联络板"),
          macAlertSecondsAgo: exportText.includes("秒前）"),
          macAlertPoll: exportText.includes("- Mac 提醒自动轮询：约 15 秒"),
          macAlertServer: exportText.includes("- Mac 提醒联络板：http://192.168.31.68:17888"),
          localCollaborationSection: exportText.includes("\\n本机协作\\n"),
          localHostStatus: exportText.includes("- 本机被控：桌面壳托管运行中"),
          localHostBadge: exportText.includes("- 本机被控徽标：运行中"),
          localHostDetail: exportText.includes("- 本机被控详情：本机被控正在运行"),
          localHostPort: exportText.includes("- 本机被控端口：43770"),
          localHostInput: exportText.includes("- 本机被控输入：安全日志"),
          localHostReverse: exportText.includes("- 本机被控反控策略：需确认"),
          localHostReadiness: exportText.includes("- 本机被控体检：低风险；媒体基线 开启"),
          localHostOutput: exportText.includes("- 本机被控最近输出："),
          localHostOutputMasked: exportText.includes("password=<hidden>"),
          localHostPasswordHidden: exportText.includes("- 本机被控密码：不导出"),
          floatingMode: exportText.includes("- 全屏浮层模式：窗口"),
          floatingSummary: exportText.includes("- 全屏浮层摘要："),
          floatingHint: exportText.includes("- 全屏浮层提示："),
          floatingConnection:
            exportText.includes("- 全屏浮层连接：连接：") && exportText.includes("秒后重连"),
          floatingVideo: exportText.includes("- 全屏浮层视频：视频："),
          floatingAudio: exportText.includes("- 全屏浮层声音：声音："),
          floatingClipboard: exportText.includes("- 全屏浮层剪贴板：剪贴板："),
          floatingInput: exportText.includes("- 全屏浮层输入：输入："),
          floatingSecurity: exportText.includes("- 全屏浮层安全：安全："),
          audioStatus:
            exportText.includes("- 声音状态：已接收，等待播放") &&
            exportText.includes("音量 33%") &&
            exportText.includes("接收 24 帧") &&
            exportText.includes("播放 0") &&
            exportText.includes("丢 2"),
          audioLevel: exportText.includes("- 声音电平：37%"),
          audioError: exportText.includes("- 声音错误：-"),
          clipboardStatus:
            exportText.includes("- 剪贴板状态：接收 1 个文件") &&
            exportText.includes("2 B/4 B"),
          clipboardCapabilitySuggestion:
            exportText.includes("- 剪贴板能力建议：") &&
            exportText.includes("文件/压缩包不能直接复制粘贴") &&
            exportText.includes("检查被控端文件剪贴板能力"),
          outgoingFileStatus:
            exportText.includes("- 本机发送文件：对端文件接收失败") &&
            exportText.includes("pending-timeout.zip") &&
            exportText.includes("对端确认超时") &&
            exportText.includes("可重新发送"),
          outgoingFileSuggestion:
            exportText.includes("- 本机发送建议：点击“重新发送”") &&
            exportText.includes("让对端检查文件剪贴板能力"),
          runtimeInput: exportText.includes("- 输入事件：7（安全日志，不会真正控制 / 已记录）"),
          remoteFileStatus:
            exportText.includes("- 远端文件状态：warning") && exportText.includes("远端文件接收超时"),
          remoteFileSuggestion:
            exportText.includes("- 远端文件建议：让 Mac 重新复制") &&
            exportText.includes("检查连接"),
          remoteFileActive:
            exportText.includes("- 正在接收远端文件：1 个文件 1.0 KB/4.0 KB") &&
            exportText.includes("速度 2.0 KB/s") &&
            exportText.includes("剩余约 2 秒") &&
            exportText.includes("秒无新分块"),
          remoteFileReceivedCount: exportText.includes("- 最近收到远端文件：1 个"),
          remoteFileTempPath: exportText.includes("- 远端文件临时目录：C:/Temp/lan-dual-control/clip-1"),
          remoteFileList: exportText.includes("1. demo.zip · 3 B · application/zip"),
          noLocalHostSecret: !exportText.includes("should-not-export"),
        };
        await copyLogsToClipboard();
        const copied =
          copiedText.includes("\\n快速摘要\\n") &&
          copiedText.includes("\\n本机协作\\n") &&
          copiedText.includes("- 远端连接：") &&
          copiedText.includes("- Mac 主机：") &&
          copiedText.includes("- Mac 值守：恢复中") &&
          copiedText.includes("视频链路需检查") &&
          copiedText.includes("运行版本需检查") &&
          copiedText.includes("认证/密码步骤待确认") &&
          copiedText.includes("Windows 被控端未指定或未就绪") &&
          copiedText.includes("仓库状态需检查") &&
          copiedText.includes("LaunchAgent 刷新率上限需调整") &&
          copiedText.includes("Mac 60Hz 安全启动命令已提供") &&
          copiedText.includes("Mac host 安全启动命令已提供") &&
          copiedText.includes("Mac client Windows 发现命令已提供") &&
          copiedText.includes("Windows 防火墙入站放行需检查") &&
          copiedText.includes("Windows 当前网络是 Public") &&
          copiedText.includes("Windows 防火墙只读检查命令已提供") &&
          copiedText.includes("Windows 防火墙放行预览命令已提供") &&
          copiedText.includes("Mac client 正式清单命令已提供") &&
          copiedText.includes("Mac 本机短验收需处理") &&
          copiedText.includes("Mac 本机短验收重跑命令已提供") &&
          copiedText.includes("Windows 反控授权状态命令已提供") &&
          copiedText.includes("Windows 一次性反控授权命令已提供") &&
          copiedText.includes("Windows 安全认证路径已提供") &&
          copiedText.includes("Mac 心跳过期，可能卡住") &&
          copiedText.includes("Mac host 不可达") &&
          copiedText.includes("Mac/API 网络错误") &&
          copiedText.includes("Mac Codex 长时间无新进展") &&
          copiedText.includes("Mac Codex 出现重连异常信号") &&
          copiedText.includes("Mac 单次心跳上板命令已提供") &&
          copiedText.includes("Mac 持续心跳 watcher 命令已提供") &&
          copiedText.includes("Mac Codex 可能卡在重新连接 5/5") &&
          copiedText.includes("检测到 stream disconnected before completion") &&
          copiedText.includes("launch-agent-max-fps") &&
          copiedText.includes("mac-host-max-fps") &&
          copiedText.includes("MacHostSafeStart=node scripts/mac/start-mac-host.mjs") &&
          copiedText.includes("MacMaxFpsSafeStart=node scripts/mac/start-mac-host.mjs") &&
          copiedText.includes("MacClientDiscoverWindows=node scripts/mac/discover-windows-hosts.mjs") &&
          copiedText.includes("WindowsLanRisk=no-firewall-allow,public-profile") &&
          copiedText.includes("WindowsFirewallStatus=node scripts/windows/check-windows-firewall.mjs") &&
          copiedText.includes("WindowsFirewallPreview=node scripts/windows/check-windows-firewall.mjs") &&
          !copiedText.includes("WindowsFirewallPreview=node scripts/windows/check-windows-firewall.mjs --host 0.0.0.0 --port 43770 --dryRunRule --ruleProfile Private --addRule") &&
          copiedText.includes("MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs") &&
          copiedText.includes("RerunFormalLocalSmoke=node scripts/mac/check-mac-formal-local-smoke.mjs") &&
          copiedText.includes("WindowsReverseGrantStatus=pwsh") &&
          copiedText.includes("WindowsOpenOneTimeReverseGrant=pwsh") &&
          copiedText.includes("WindowsSecureAuthPath=node scripts/windows/start-windows-host.mjs") &&
          copiedText.includes("host-build-test") &&
          copiedText.includes("辅助功能未开") &&
          copiedText.includes("- 本机被控：桌面壳托管运行中") &&
          copiedText.includes("- Mac 提醒：提醒中") &&
          copiedText.includes("- 全屏浮层连接：连接：") &&
          copiedText.includes("- 全屏浮层视频：视频：") &&
          copiedText.includes("- 剪贴板：接收 1 个文件") &&
          copiedText.includes("- 剪贴板状态：接收 1 个文件") &&
          copiedText.includes("- 剪贴板能力建议：") &&
          copiedText.includes("文件/压缩包不能直接复制粘贴") &&
          copiedText.includes("检查被控端文件剪贴板能力") &&
          copiedText.includes("- 本机发送文件：") &&
          copiedText.includes("pending-timeout.zip") &&
          copiedText.includes("对端确认超时") &&
          copiedText.includes("可重新发送") &&
          copiedText.includes("- 本机发送建议：") &&
          copiedText.includes("点击“重新发送”") &&
          copiedText.includes("让对端检查文件剪贴板能力") &&
          copiedText.includes("- 输入：7（安全日志，不会真正控制 / 已记录）") &&
          copiedText.includes("- 输入事件：7（安全日志，不会真正控制 / 已记录）") &&
          copiedText.includes("- 声音状态：已接收，等待播放") &&
          copiedText.includes("- 声音电平：37%") &&
          copiedText.includes("- 远端文件状态：warning") &&
          copiedText.includes("远端文件接收超时") &&
          copiedText.includes("- 远端文件建议：") &&
          copiedText.includes("让 Mac 重新复制") &&
          copiedText.includes("检查连接") &&
          copiedText.includes("- 正在接收远端文件：1 个文件 1.0 KB/4.0 KB") &&
          copiedText.includes("速度 2.0 KB/s") &&
          copiedText.includes("剩余约 2 秒") &&
          copiedText.includes("- 远端文件临时目录：C:/Temp/lan-dual-control/clip-1") &&
          copiedText.includes("password=<hidden>") &&
          !copiedText.includes("should-not-export") &&
          state.logEntries[0]?.title === "诊断复制";
        const scheduled =
          state.reconnectTimer &&
          state.reconnectCountdownTimer &&
          !reconnectButton.hidden &&
          !reconnectButton.disabled &&
          !floatingReconnectButton.hidden &&
          !floatingReconnectButton.disabled &&
          actions.classList.contains("has-reconnect") &&
          !disconnectButton.disabled &&
          status.textContent.includes("秒后自动重连") &&
          status.textContent.includes("1/3") &&
          remote.textContent.includes("秒后自动重连") &&
          Object.values(exportChecks).every(Boolean);

        floatingReconnectButton.click();
        const immediate =
          calls.length === 1 &&
          calls[0].reconnect === true &&
          state.reconnectTimer === null &&
          state.reconnectCountdownTimer === null &&
          reconnectButton.hidden &&
          floatingReconnectButton.hidden &&
          !actions.classList.contains("has-reconnect");

        return {
          ok: scheduled && immediate && copied,
          scheduled,
          immediate,
          copied,
          status: status.textContent,
          remote: remote.textContent,
          exportHasReconnectStatus: exportText.includes("- 重连状态："),
          exportHasReconnectReason: exportText.includes("- 重连原因：测试断线"),
          exportHasMacAlertWatcherStatus: exportText.includes("- Mac 提醒：提醒中"),
          exportHasMacAlertWatcherCheckedAt: exportText.includes("- Mac 提醒最近检查："),
          exportHasLocalHostStatus: exportText.includes("- 本机被控：桌面壳托管运行中"),
          exportMasksLocalHostOutput: !exportText.includes("should-not-export"),
          exportChecks,
          copiedTextHasLocalHostStatus: copiedText.includes("- 本机被控：桌面壳托管运行中"),
          copiedTextMasksLocalHostOutput: !copiedText.includes("should-not-export"),
          calls,
        };
      } finally {
        if (state.reconnectTimer) window.clearTimeout(state.reconnectTimer);
        if (state.reconnectCountdownTimer) window.clearInterval(state.reconnectCountdownTimer);
        if (state.reconnectStableTimer && state.reconnectStableTimer !== originalStableTimer) {
          window.clearTimeout(state.reconnectStableTimer);
        }
        connect = originalConnect;
        state.reconnectAttempts = originalAttempts;
        state.reconnectTimer = originalTimer;
        state.reconnectCountdownTimer = originalCountdownTimer;
        state.reconnectStableTimer = originalStableTimer;
        state.reconnectDueAt = originalDueAt;
        state.reconnectReason = originalReason;
        state.activeHost = originalHost;
        state.activePort = originalPort;
        state.connected = originalConnected;
        state.connecting = originalConnecting;
        state.connectionState = originalConnectionState;
        state.manualDisconnect = originalManualDisconnect;
        state.localMacAlertWatcherRunning = originalWatcherRunning;
        state.localMacAlertWatcherBusy = originalWatcherBusy;
        state.localMacAlertWatcherStatusCheckedAt = originalWatcherCheckedAt;
        state.localMacAlertWatcherFindingText = originalWatcherFindingText;
        state.localHostRunning = originalLocalHostRunning;
        state.localHostOnline = originalLocalHostOnline;
        state.localHostBusy = originalLocalHostBusy;
        state.receivedClipboardFiles = originalReceivedFiles;
        state.receivedClipboardTempPath = originalReceivedTempPath;
        state.receivedClipboardWriteStatus = originalReceivedWriteStatus;
        state.remoteFileTransfers = originalRemoteFileTransfers;
        state.lastOutgoingFileTransfer = originalLastOutgoingFileTransfer;
        if (clipboardToggleElement) clipboardToggleElement.checked = originalClipboardChecked;
        if (audioToggleElement) audioToggleElement.checked = originalAudioChecked;
        if (audioVolumeElement) audioVolumeElement.value = originalAudioVolume;
        state.audioFrames = originalAudioFrames;
        state.audioLevel = originalAudioLevel;
        state.audioPlayedFrames = originalAudioPlayedFrames;
        state.audioDroppedFrames = originalAudioDroppedFrames;
        state.audioLastError = originalAudioLastError;
        state.inputEvents = originalInputEvents;
        state.hostDiagnostics = originalHostDiagnostics;
        if (hostDiagnosticsElement) {
          hostDiagnosticsElement.textContent = originalHostDiagnosticsText;
          hostDiagnosticsElement.className = originalHostDiagnosticsClass;
        }
        state.controlDirection = originalControlDirection;
        if (typeof updateInputStatus === "function") updateInputStatus();
        state.logEntries = originalLogEntries;
        if (eventLog) eventLog.innerHTML = originalEventLogHtml;
        window.__TAURI__ = originalTauri;
        if (originalClipboardDescriptor) {
          Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
        } else {
          try {
            delete navigator.clipboard;
          } catch (error) {
            // Ignore cleanup failures in browsers that expose clipboard on the prototype.
          }
        }
        const watcherStatus = document.querySelector("#localMacAlertWatcherStatusText");
        if (watcherStatus) watcherStatus.textContent = originalWatcherStatus;
        if (localHostBadge) {
          localHostBadge.textContent = originalLocalHostBadgeText;
          localHostBadge.className = originalLocalHostBadgeClass;
        }
        if (localHostStatus) localHostStatus.textContent = originalLocalHostStatus;
        if (localHostOutput) localHostOutput.textContent = originalLocalHostOutput;
        if (localHostProbeMediaToggle) localHostProbeMediaToggle.checked = originalProbeMedia;
        if (localHostInputSelect) localHostInputSelect.value = originalLocalHostInputValue;
        if (localHostReverseSelect) localHostReverseSelect.value = originalLocalHostReverseValue;
        if (localHostReadinessSelect) localHostReadinessSelect.value = originalLocalHostReadinessValue;
        actions.className = originalActionsClass;
        reconnectButton.hidden = originalReconnectHidden;
        reconnectButton.disabled = originalReconnectDisabled;
        floatingReconnectButton.hidden = originalFloatingReconnectHidden;
        floatingReconnectButton.disabled = originalFloatingReconnectDisabled;
        connectButton.disabled = originalConnectDisabled;
        disconnectButton.disabled = originalDisconnectDisabled;
        status.textContent = originalStatus;
        remote.textContent = originalRemote;
        const badge = document.querySelector("#connectionBadge");
        if (badge) {
          badge.className = originalBadge;
          badge.textContent = originalBadgeText;
        }
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`reconnect controls check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function run() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }

  const args = parseArgs(process.argv);
  activeOutputArgs = args;
  const summary = {
    status: "running",
    mode: args.diagnosticsOnly ? "diagnostics" : "connect",
    target: `${args.host}:${args.port}`,
    discoveryTarget: "",
    discoveryRuntimeBuild: "",
    checks: [],
    remote: "",
    diagnostics: "",
    discoveryDiagnostics: "",
    uiDiagnostics: "",
    fps: "",
    audio: "",
    surface: "",
    h264Errors: "",
    error: "",
  };
  activeSummary = summary;
  const discoverySelection = await resolveDiscoveryTarget(args);
  if (discoverySelection) {
    const runtimeText = discoverySelection.runtimeBuild ? ` runtimeBuild=${discoverySelection.runtimeBuild}` : "";
    summary.discoveryTarget = discoverySelection.target;
    summary.discoveryRuntimeBuild = discoverySelection.runtimeBuild || "";
    summary.target = discoverySelection.target;
    summary.checks.push("discovery");
    print(
      "OK",
      `Discovery target: ${discoverySelection.target}; macHosts=${discoverySelection.foundMacHosts}${runtimeText}`,
    );
  }
  await preparePassword(args);
  const clientUrl = `http://127.0.0.1:${args.clientPort}/`;
  const userDataDir = await mkdtemp(join(tmpdir(), "lan-dual-edge-"));
  const clientServer = startProcess(process.execPath, ["apps/windows-client/server.mjs", String(args.clientPort)], {
    cwd: repoRoot,
  });
  attachProcessLog(clientServer, "client");

  const edgeArgs = [
    `--remote-debugging-port=${args.debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--disable-sync",
    "--disable-background-networking",
    "--disable-extensions",
    "--autoplay-policy=no-user-gesture-required",
    "--disable-gpu-sandbox",
    "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults",
    "--window-size=1280,850",
  ];
  if (args.headless) {
    edgeArgs.push("--headless=new");
  }
  edgeArgs.push(clientUrl);

  const edge = startProcess(findBrowserPath(), edgeArgs);
  attachProcessLog(edge, "edge");

  let session;
  try {
    await waitFor(async () => {
      const response = await fetch(clientUrl);
      return response.ok;
    }, args.timeoutMs, "Windows client server");

    session = await connectCdp(args.debugPort, args.timeoutMs);
    await session.send("Runtime.enable");
    await session.send("Page.enable");
    await session.send("Page.navigate", { url: clientUrl });
    await session.waitForEvent("Page.loadEventFired", args.timeoutMs);
    await waitFor(
      () => evaluate(session, "document.readyState === 'complete'"),
      args.timeoutMs,
      "page load",
    );

    const controlCenterCheck = await verifyFloatingControlCenter(session);
    summary.checks.push("control-center");
    print(
      "OK",
      `Control center: open=${controlCenterCheck.opened}, floating=${controlCenterCheck.floatingLayer}, summary=${controlCenterCheck.summarySynced}, quality=${controlCenterCheck.qualitySynced}, original=${controlCenterCheck.originalPresetSynced}, detailed=${controlCenterCheck.detailedSettingsSynced}, scale=${controlCenterCheck.scaleSynced}, audio=${controlCenterCheck.audioSynced}, volume=${controlCenterCheck.volumeSynced}, status=${controlCenterCheck.statusVisible}, connection=${controlCenterCheck.connectionStatusVisible}, video=${controlCenterCheck.videoStatusVisible}, audioStatus=${controlCenterCheck.audioStatusVisible}, clipboard=${controlCenterCheck.clipboardStatusVisible}, shortcut=${controlCenterCheck.shortcutSent}, diagnosticsCopy=${controlCenterCheck.diagnosticsCopyVisible}, fullscreen=${controlCenterCheck.fullscreenEntered}, hint=${controlCenterCheck.fullscreenHintVisible}, esc=${controlCenterCheck.fullscreenEscExited}, immersive=${controlCenterCheck.immersiveFullscreenEntered}, window=${controlCenterCheck.fullscreenExited}, monitor=${controlCenterCheck.monitorModeCheck?.ok}`,
    );
    const desktopOnlyPanelCheck = await verifyDesktopOnlyHostPanel(session);
    summary.checks.push("desktop-panel");
    print(
      "OK",
      `Desktop-only host panel: badge=${desktopOnlyPanelCheck.badge}, nativeLimit=${desktopOnlyPanelCheck.maxNativeClipboardFileBytes}, chunk=${desktopOnlyPanelCheck.nativeClipboardChunkSizeBytes}`,
    );
    const fileClipboardRecoveryCheck = await verifyFileClipboardRecoveryText(session);
    summary.checks.push("file-clipboard-recovery");
    print("OK", `File clipboard recovery: ${fileClipboardRecoveryCheck.recovery}`);
    const outgoingFileResultCheck = await verifyOutgoingFileResultStatus(session);
    summary.checks.push("file-clipboard-outgoing-result");
    print("OK", `File clipboard outgoing result: ${outgoingFileResultCheck.clipboardText}`);
    const fileClipboardIntegrityCheck = await verifyFileClipboardIntegrityGuards(session);
    summary.checks.push("file-clipboard-integrity");
    print("OK", `File clipboard integrity guards: rejected=${fileClipboardIntegrityCheck.rejectedResults.length}`);
    const blackBarCheck = await verifyBlackBarInputGuard(session);
    summary.checks.push("blackbar");
    print(
      "OK",
      `Black bar guard: move=${blackBarCheck.moveIgnored}, down=${blackBarCheck.blackBarDownIgnored}, release=${blackBarCheck.releaseSentAtLastPoint}, wheel=${blackBarCheck.blackBarWheelIgnored}`,
    );
    const streamFallbackCheck = await verifyStreamFallbackDiagnostics(session);
    summary.checks.push("fallback-diagnostics");
    summary.diagnostics = streamFallbackCheck.fallbackText;
    summary.uiDiagnostics = streamFallbackCheck.fallbackText;
    print("OK", `Stream fallback diagnostics: ${streamFallbackCheck.fallbackText}`);
    const frameAgeCheck = await verifyVideoFrameAgeDiagnostics(session);
    summary.checks.push("frame-age");
    print("OK", `Video frame age diagnostics: ${frameAgeCheck.latency} / ${frameAgeCheck.skewLatency}`);
    const lowFpsCheck = await verifyLowFpsDiagnostics(session);
    summary.checks.push("low-fps-diagnostics");
    print("OK", `Low FPS diagnostics: ${lowFpsCheck.lowText}`);
    const keyFrameCheck = await verifyH264KeyFrameDetection(session);
    summary.checks.push("h264-keyframe");
    print(
      "OK",
      `H.264 key frame detection: annexbKey=${keyFrameCheck.annexbKey}, annexbDelta=${keyFrameCheck.annexbDelta}, avcKey=${keyFrameCheck.avcKey}`,
    );
    const inputStatusCheck = await verifyInputModeStatusText(session);
    summary.checks.push("input-status");
    print(
      "OK",
      `Input status text: ${inputStatusCheck.logMode} / ${inputStatusCheck.injected} / ${inputStatusCheck.rejected}`,
    );
    const keyboardMappingCheck = await verifyWindowsToMacKeyboardMapping(session);
    summary.checks.push("keyboard-mapping");
    print(
      "OK",
      `Keyboard mapping: Ctrl+C -> ${keyboardMappingCheck.copy.modifiers.join("+")} / ${keyboardMappingCheck.copy.shortcutAction}; custom=${keyboardMappingCheck.custom.modifiers.join("+")}`,
    );
    const reconnectControlsCheck = await verifyReconnectControls(session);
    summary.checks.push("reconnect");
    print(
      "OK",
      `Reconnect controls: scheduled=${reconnectControlsCheck.scheduled}, immediate=${reconnectControlsCheck.immediate}`,
    );
    if (args.expectDiscoveryRuntimeBuildId) {
      const discoveryRuntimeCheck = await verifyDiscoveryRuntimeDiagnostics(session, {
        host: args.host,
        port: args.port,
        buildId: args.expectDiscoveryRuntimeBuildId,
        timeoutMs: args.timeoutMs,
      });
      print(
        "OK",
        `Discovery runtime: ${discoveryRuntimeCheck.detail} / ${discoveryRuntimeCheck.diagnostics}`,
      );
      summary.checks.push("discovery-runtime");
      summary.diagnostics = discoveryRuntimeCheck.diagnostics;
      summary.discoveryDiagnostics = discoveryRuntimeCheck.diagnostics;
    }
    if (args.diagnosticsOnly) {
      print("OK", "Diagnostics-only browser checks passed");
      summary.status = "passed";
      emitBoardSummary(summary);
      return;
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
        setValue("#transportSelect", "websocket");
        setValue("#hostInput", ${JSON.stringify(args.host)});
        setValue("#portInput", ${JSON.stringify(args.port)});
        setValue("#passwordInput", ${JSON.stringify(args.password)});
        document.querySelector("#connectButton").click();
        return true;
      })()`,
    );

    let lastSnapshot = null;
    const snapshot = await waitForWindowsClientSnapshot({
      args,
      session,
      label: "Windows client browser connection",
      onSnapshot: (value) => {
        lastSnapshot = value;
      },
      check: async (value) => {
        if (value.status.includes("连接失败")) {
          throw new Error(`${value.status}: ${value.remote || value.diagnostics}`);
        }
        const hasVideoSurface =
          (value.canvasVisible && value.canvasWidth > 0 && value.canvasHeight > 0) ||
          (value.imageVisible && value.imageHasSource);
        const diagnosticsLower = value.diagnostics.toLowerCase();
        const remoteLower = value.remote.toLowerCase();
        const hasH264Surface =
          value.canvasVisible &&
          value.canvasWidth > 0 &&
          value.canvasHeight > 0 &&
          (diagnosticsLower.includes("h264") || remoteLower.includes("h.264")) &&
          !value.diagnostics.includes("JPEG 回退");
        const hasNoH264DecodeErrors = Number(value.h264DecoderErrors || 0) === 0;
        const hasFpsDiagnostics =
          !args.requireVideoSurface ||
          (/实收\s+(?!-)\d+(?:\.\d+)?\s+FPS/.test(value.metricFps) &&
            /协商\s+\d+\s+Hz/.test(value.metricFps));
        if (
          value.status.includes("已连接") &&
          (!args.requireVideoSurface || hasVideoSurface) &&
          (!args.requireH264 || (hasH264Surface && hasNoH264DecodeErrors)) &&
          hasFpsDiagnostics
        ) {
          return value;
        }
        return null;
      },
    }).catch((error) => {
      if (lastSnapshot) {
        print("INFO", `Last status: ${lastSnapshot.status}`);
        print("INFO", `Last remote: ${lastSnapshot.remote}`);
        print("INFO", `Last diagnostics: ${lastSnapshot.diagnostics}`);
        print("INFO", `Last FPS: ${lastSnapshot.metricFps}`);
        print("INFO", `Last audio: ${lastSnapshot.audio}`);
        print("INFO", `Last surface: canvas=${lastSnapshot.canvasVisible} ${lastSnapshot.canvasWidth}x${lastSnapshot.canvasHeight}, image=${lastSnapshot.imageVisible}`);
        if (lastSnapshot.logs?.length) {
          print("INFO", `Last logs: ${lastSnapshot.logs.join(" | ")}`);
        }
      }
      throw error;
    });

    print("OK", `Status: ${snapshot.status}`);
    summary.status = "passed";
    summary.remote = snapshot.remote;
    summary.diagnostics = snapshot.diagnostics;
    summary.uiDiagnostics = snapshot.diagnostics;
    summary.fps = snapshot.metricFps;
    summary.surface = `canvas=${snapshot.canvasVisible ? `${snapshot.canvasWidth}x${snapshot.canvasHeight}` : "off"},image=${snapshot.imageVisible ? "on" : "off"}`;
    summary.h264Errors = String(snapshot.h264DecoderErrors ?? "");
    summary.checks.push("connection");
    print("OK", `Remote: ${snapshot.remote}`);
    print("OK", `Diagnostics: ${snapshot.diagnostics}`);
    print("OK", `FPS: ${snapshot.metricFps}`);
    print(
      "OK",
      `Surface: canvas=${snapshot.canvasVisible} ${snapshot.canvasWidth}x${snapshot.canvasHeight}, image=${snapshot.imageVisible}`,
    );
    print(
      "OK",
      `WebCodecs: VideoDecoder=${snapshot.webCodecs}, EncodedVideoChunk=${snapshot.encodedVideoChunk}, H264Errors=${snapshot.h264DecoderErrors}`,
    );
    if (snapshot.logs.length > 0) {
      print("INFO", `Recent logs: ${snapshot.logs.join(" | ")}`);
    }
    if (args.injectPcmAudio) {
      await evaluate(
        session,
        `(() => {
          const sampleRate = 48000;
          const channels = 2;
          const frameCount = 960;
          const samples = new Float32Array(frameCount * channels);
          for (let channel = 0; channel < channels; channel += 1) {
            for (let frame = 0; frame < frameCount; frame += 1) {
              const value = Math.sin((frame / sampleRate) * Math.PI * 2 * 440) * 0.05;
              samples[channel * frameCount + frame] = value;
            }
          }
          const bytes = new Uint8Array(samples.buffer);
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          handleAudioFrame({
            type: "audio_frame",
            frameId: 9001,
            codec: "pcm-f32le",
            encoding: "pcm-f32le-base64",
            layout: "planar",
            frames: frameCount,
            sampleRate,
            channels,
            durationMs: 20,
            level: 0.05,
            payload: btoa(binary),
          });
          return true;
        })()`,
      );
      const audioSnapshot = await waitForWindowsClientSnapshot({
        args,
        session,
        label: "Windows client PCM audio playback",
        check: async (value) => value.audio.includes("播放") ? value : null,
      });
      summary.audio = audioSnapshot.audio;
      summary.checks.push("audio");
      print("OK", `Audio: ${audioSnapshot.audio}`);
    }
    emitBoardSummary(summary);
  } finally {
    await closeBrowserBestEffort(session);
    try {
      session?.close();
    } catch {}
    const edgeDebugPortMatch = `--remote-debugging-port=${args.debugPort}`;
    stopWindowsProcessesByCommandLine(edgeDebugPortMatch);
    stopProcessTree(edge, { commandLineMatch: userDataDir });
    stopProcessTree(clientServer, { commandLineMatch: `apps\\windows-client\\server.mjs ${args.clientPort}` });
    await delay(500);
    stopWindowsProcessesByCommandLine(edgeDebugPortMatch);
    stopWindowsProcessesByCommandLine(userDataDir);
    await removeDirectoryBestEffort(userDataDir);
  }
}

run().catch((error) => {
  if (activeOutputArgs?.boardSummary && !lastBoardSummary) {
    const summary = activeSummary || {
      status: "failed",
      mode: "unknown",
      target: `${defaults.host}:${defaults.port}`,
      checks: [],
    };
    summary.status = "failed";
    summary.error = error?.message || "unknown error";
    emitBoardSummary(summary);
  }
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
