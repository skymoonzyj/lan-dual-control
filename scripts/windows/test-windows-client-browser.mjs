import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const defaults = {
  host: "127.0.0.1",
  port: "43770",
  password: "demo-password",
  clientPort: 5197,
  debugPort: 9337,
  timeoutMs: 30000,
  requireVideoSurface: true,
  requireH264: false,
  injectPcmAudio: false,
  diagnosticsOnly: false,
  expectDiscoveryRuntimeBuildId: "",
  headless: true,
};

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
  --password <password>                 Probe password. Default: ${defaults.password}
  --clientPort <port>                   Local Windows client web port. Default: ${defaults.clientPort}
  --debugPort <port>                    Browser remote debugging port. Default: ${defaults.debugPort}
  --timeoutMs <ms>                      Per-step timeout. Default: ${defaults.timeoutMs}
  --headed                              Run browser headed instead of headless.
  --diagnosticsOnly                     Only run local UI diagnostics; do not connect to a Mac host.
  --noRequireVideoSurface               Do not require a visible decoded video surface.
  --requireH264                         Require H.264/WebCodecs decoded video.
  --injectPcmAudio                      Inject a synthetic PCM frame into the page and require playback state.
  --expectDiscoveryRuntimeBuildId <id>  Require /discovery runtime.buildId before connecting.

Examples:
  node scripts/windows/test-windows-client-browser.mjs --diagnosticsOnly
  node scripts/windows/test-windows-client-browser.mjs --host 192.168.1.20 --port 43770 --password demo-password --requireH264
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
    if (Object.prototype.hasOwnProperty.call(args, key) && next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    }
  }

  args.clientPort = Number(args.clientPort);
  args.debugPort = Number(args.debugPort);
  args.timeoutMs = Number(args.timeoutMs);
  return args;
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    `(() => {
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

      document.querySelector("#floatingFullscreenButton")?.click();
      const shell = document.querySelector(".app-shell");
      const topbar = document.querySelector(".topbar");
      const remoteSurface = document.querySelector(".remote-surface");
      const fullscreenEntered =
        shell?.classList.contains("is-fullscreen") &&
        getComputedStyle(topbar).display === "none" &&
        getComputedStyle(remoteSurface).paddingTop === "0px";

      if (panel.hidden) toggle.click();
      document.querySelector("#floatingWindowButton")?.click();
      const fullscreenExited =
        !shell?.classList.contains("is-fullscreen") &&
        getComputedStyle(topbar).display !== "none";
      if (panel.hidden) toggle.click();

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
          scaleSynced &&
          audioSynced &&
          volumeSynced &&
          fullscreenEntered &&
          fullscreenExited,
        opened,
        floatingLayer,
        summarySynced,
        summary: summary.textContent,
        qualitySynced,
        scaleSynced,
        audioSynced,
        volumeSynced,
        fullscreenEntered,
        fullscreenExited,
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
      const buttons = [
        "#localHostReadinessButton",
        "#localHostStartButton",
        "#localHostFirewallButton",
        "#localHostStopButton",
      ].map((selector) => document.querySelector(selector));
      const inputs = [
        "#localHostPortInput",
        "#localHostPasswordInput",
        "#localHostScreenModeSelect",
        "#localHostAudioModeSelect",
        "#localHostInputModeSelect",
        "#localHostReadinessProfileSelect",
      ].map((selector) => document.querySelector(selector));
      const profileSelect = document.querySelector("#localHostReadinessProfileSelect");
      const profileOptions = Array.from(profileSelect?.options || []).map((option) => option.value);
      const readinessRequest =
        typeof buildLocalHostReadinessRequest === "function"
          ? buildLocalHostReadinessRequest()
          : {};
      const readinessHeaderLines =
        typeof readinessLines === "function"
          ? readinessLines({
              json: {
                args: {
                  profile: "deploy",
                  currentBuildId: "client-test",
                  maxVideoFrameAgeMs: 1000,
                  maxAudioFrameAgeMs: 750,
                },
                results: [
                  {
                    ok: true,
                    label: "Windows host video observation",
                    summary: "passed",
                    warnings: [],
                    errors: [],
                  },
                ],
              },
            })
          : [];
      const readinessHeaderText = readinessHeaderLines.join("\\n");

      return {
        ok:
          typeof getTauriInvoke === "function" &&
          typeof canUseDesktopHostControl === "function" &&
          typeof buildLocalHostReadinessRequest === "function" &&
          typeof maxNativeClipboardFileBytes === "number" &&
          typeof maxClipboardFileBytes === "number" &&
          typeof nativeClipboardChunkSizeBytes === "number" &&
          getTauriInvoke() === null &&
          canUseDesktopHostControl() === false &&
          badge?.textContent === "需桌面版" &&
          status?.textContent.includes("浏览器预览版") &&
          buttons.every((button) => button?.disabled) &&
          inputs.every((input) => input?.disabled) &&
          profileSelect?.value === "default" &&
          profileOptions.join(",") === "default,deploy,deep" &&
          readinessRequest.profile === "default" &&
          readinessHeaderText.includes("client-test") &&
          readinessHeaderText.includes("1000 ms") &&
          readinessHeaderText.includes("750 ms") &&
          readinessHeaderText.includes("Windows host video observation") &&
          maxNativeClipboardFileBytes === maxClipboardFileBytes &&
          nativeClipboardChunkSizeBytes === 1024 * 1024,
        badge: badge?.textContent || "",
        status: status?.textContent || "",
        profile: profileSelect?.value || "",
        requestProfile: readinessRequest.profile || "",
        readinessHeader: readinessHeaderLines.slice(0, 4),
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
      const openButton = document.querySelector("#openReceivedFilesTempButton");
      const copyButton = document.querySelector("#copyReceivedFilesButton");
      const clearButton = document.querySelector("#clearReceivedFilesButton");
      const status = document.querySelector("#receivedFilesStatus");

      const originalTauri = window.__TAURI__;
      const originalFiles = state.receivedClipboardFiles;
      const originalTempPath = state.receivedClipboardTempPath;
      const originalWriteStatus = state.receivedClipboardWriteStatus;
      const calls = [];
      try {
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
        state.receivedClipboardFiles = originalFiles;
        state.receivedClipboardTempPath = originalTempPath;
        state.receivedClipboardWriteStatus = originalWriteStatus;
        renderReceivedFiles();
      }
    })()`,
  );
  if (!result?.ok) {
    throw new Error(`file clipboard recovery text check failed: ${JSON.stringify(result)}`);
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

async function run() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }

  const args = parseArgs(process.argv);
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
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
    print(
      "OK",
      `Control center: open=${controlCenterCheck.opened}, floating=${controlCenterCheck.floatingLayer}, summary=${controlCenterCheck.summarySynced}, quality=${controlCenterCheck.qualitySynced}, scale=${controlCenterCheck.scaleSynced}, audio=${controlCenterCheck.audioSynced}, volume=${controlCenterCheck.volumeSynced}, fullscreen=${controlCenterCheck.fullscreenEntered}, window=${controlCenterCheck.fullscreenExited}`,
    );
    const desktopOnlyPanelCheck = await verifyDesktopOnlyHostPanel(session);
    print(
      "OK",
      `Desktop-only host panel: badge=${desktopOnlyPanelCheck.badge}, nativeLimit=${desktopOnlyPanelCheck.maxNativeClipboardFileBytes}, chunk=${desktopOnlyPanelCheck.nativeClipboardChunkSizeBytes}`,
    );
    const fileClipboardRecoveryCheck = await verifyFileClipboardRecoveryText(session);
    print("OK", `File clipboard recovery: ${fileClipboardRecoveryCheck.recovery}`);
    const blackBarCheck = await verifyBlackBarInputGuard(session);
    print(
      "OK",
      `Black bar guard: move=${blackBarCheck.moveIgnored}, down=${blackBarCheck.blackBarDownIgnored}, release=${blackBarCheck.releaseSentAtLastPoint}, wheel=${blackBarCheck.blackBarWheelIgnored}`,
    );
    const streamFallbackCheck = await verifyStreamFallbackDiagnostics(session);
    print("OK", `Stream fallback diagnostics: ${streamFallbackCheck.fallbackText}`);
    const frameAgeCheck = await verifyVideoFrameAgeDiagnostics(session);
    print("OK", `Video frame age diagnostics: ${frameAgeCheck.latency} / ${frameAgeCheck.skewLatency}`);
    const keyFrameCheck = await verifyH264KeyFrameDetection(session);
    print(
      "OK",
      `H.264 key frame detection: annexbKey=${keyFrameCheck.annexbKey}, annexbDelta=${keyFrameCheck.annexbDelta}, avcKey=${keyFrameCheck.avcKey}`,
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
    }
    if (args.diagnosticsOnly) {
      print("OK", "Diagnostics-only browser checks passed");
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
    const snapshot = await waitFor(
      async () => {
        const value = await evaluate(
          session,
          `(() => {
            const text = (selector) => document.querySelector(selector)?.textContent || "";
            const canvas = document.querySelector("#remoteVideoCanvas");
            const image = document.querySelector("#remoteFrameImage");
            const diagnostics = text("#hostDiagnosticsText");
            const status = text("#statusText");
            const remote = text("#remoteStatusText");
            const logs = [...document.querySelectorAll("#eventLog li")]
              .slice(0, 10)
              .map((item) => item.innerText.replace(/\\s+/g, " "));
            return {
              status,
              remote,
              diagnostics,
              metricFps: text("#metricFps"),
              webCodecs: typeof VideoDecoder,
              encodedVideoChunk: typeof EncodedVideoChunk,
              h264DecoderErrors: window.state?.h264DecoderErrorCount ?? 0,
              canvasVisible: canvas?.classList.contains("is-visible") || false,
              canvasWidth: canvas?.width || 0,
              canvasHeight: canvas?.height || 0,
              imageVisible: image?.classList.contains("is-visible") || false,
              imageHasSource: Boolean(image?.getAttribute("src")),
              logs,
            };
          })()`,
        );

        if (value.status.includes("连接失败")) {
          throw new Error(`${value.status}: ${value.remote || value.diagnostics}`);
        }
        lastSnapshot = value;
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
      args.timeoutMs,
      "Windows client browser connection",
    ).catch((error) => {
      if (lastSnapshot) {
        print("INFO", `Last status: ${lastSnapshot.status}`);
        print("INFO", `Last remote: ${lastSnapshot.remote}`);
        print("INFO", `Last diagnostics: ${lastSnapshot.diagnostics}`);
        print("INFO", `Last FPS: ${lastSnapshot.metricFps}`);
        print("INFO", `Last surface: canvas=${lastSnapshot.canvasVisible} ${lastSnapshot.canvasWidth}x${lastSnapshot.canvasHeight}, image=${lastSnapshot.imageVisible}`);
        if (lastSnapshot.logs?.length) {
          print("INFO", `Last logs: ${lastSnapshot.logs.join(" | ")}`);
        }
      }
      throw error;
    });

    print("OK", `Status: ${snapshot.status}`);
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
      const audioSnapshot = await evaluate(
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
          return new Promise((resolve) => setTimeout(() => {
            resolve({
              audioText: document.querySelector("#audioText")?.textContent || "",
              logs: [...document.querySelectorAll("#eventLog li")]
                .slice(0, 6)
                .map((item) => item.innerText.replace(/\\s+/g, " ")),
            });
          }, 300));
        })()`,
      );
      if (!audioSnapshot.audioText.includes("播放")) {
        throw new Error(`PCM audio injection did not reach playback state: ${audioSnapshot.audioText}`);
      }
      print("OK", `Audio: ${audioSnapshot.audioText}`);
    }
  } finally {
    session?.close();
    edge.kill();
    clientServer.kill();
    await delay(500);
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {});
  }
}

run().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
