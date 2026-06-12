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
  injectPcmAudio: false,
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
    if (key === "noRequireVideoSurface") {
      args.requireVideoSurface = false;
      continue;
    }
    if (key === "injectPcmAudio") {
      args.injectPcmAudio = true;
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
      const audioToggle = document.querySelector("#audioToggle");
      if (!toggle || !panel || !remoteControlCenter) {
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

      setValue("#floatingQualitySelect", "sharp");
      const qualitySynced =
        valueOf("#qualityPresetSelect") === "sharp" &&
        valueOf("#resolutionSelect") === "3840x2160" &&
        valueOf("#fpsSelect") === "120" &&
        valueOf("#bandwidthSelect") === "50";

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
        ok: opened && qualitySynced && scaleSynced && audioSynced && volumeSynced,
        opened,
        qualitySynced,
        scaleSynced,
        audioSynced,
        volumeSynced,
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

async function run() {
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
    "--autoplay-policy=no-user-gesture-required",
    "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults",
    "--window-size=1280,850",
  ];
  if (args.headless) {
    edgeArgs.push("--headless=new", "--disable-gpu");
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
      `Control center: open=${controlCenterCheck.opened}, quality=${controlCenterCheck.qualitySynced}, scale=${controlCenterCheck.scaleSynced}, audio=${controlCenterCheck.audioSynced}, volume=${controlCenterCheck.volumeSynced}`,
    );

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
        if (value.status.includes("已连接") && (!args.requireVideoSurface || hasVideoSurface)) {
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
    print("OK", `WebCodecs: VideoDecoder=${snapshot.webCodecs}, EncodedVideoChunk=${snapshot.encodedVideoChunk}`);
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
