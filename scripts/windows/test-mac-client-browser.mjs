import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const defaults = {
  host: "127.0.0.1",
  port: "43772",
  password: "demo-password",
  clientPort: 5188,
  debugPort: 9340,
  timeoutMs: 30000,
  inputMode: "log",
  screenMode: "auto",
  requireRealVideo: true,
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
    LAN_DUAL_PASSWORD: args.password,
    LAN_DUAL_WINDOWS_INPUT_MODE: args.inputMode,
    LAN_DUAL_WINDOWS_SCREEN_MODE: args.mockVideo ? "mock" : args.screenMode,
    LAN_DUAL_WINDOWS_MAX_SCREEN_FPS: "4",
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
      input: text("#inputStatus"),
      imageVisible: image?.classList.contains("is-visible") || false,
      imageHasSource: Boolean(image?.getAttribute("src")),
      logs,
    };
  })()`;
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
    await session.send("Page.navigate", { url: clientUrl });
    await session.waitForEvent("Page.loadEventFired", args.timeoutMs);
    await waitFor(
      () => evaluate(session, "document.readyState === 'complete'"),
      args.timeoutMs,
      "page load",
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
        setValue("#hostInput", ${JSON.stringify(args.host)});
        setValue("#portInput", ${JSON.stringify(String(args.port))});
        setValue("#passwordInput", ${JSON.stringify(args.password)});
        document.querySelector("#connectButton").click();
        return true;
      })()`,
    );

    let lastSnapshot = null;
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

    print("OK", `Connection: ${videoSnapshot.connection}`);
    print("OK", `Remote: ${videoSnapshot.remote}`);
    print("OK", `Video: ${videoSnapshot.video}`);

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
    print("OK", "Mac client browser self-test passed");
  } finally {
    session?.close();
    browser?.kill();
    macClientServer?.kill();
    windowsHost?.kill();
    await delay(500);
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {});
  }
}

run().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
