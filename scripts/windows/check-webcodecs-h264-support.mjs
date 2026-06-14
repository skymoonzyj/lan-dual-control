import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const defaults = {
  debugPort: 9347,
  timeoutMs: 15000,
  width: 1920,
  height: 1080,
  codecs: [
    "avc1.420029",
    "avc1.42C02A",
    "avc1.42E01F",
    "avc1.42001E",
    "avc1.42E01E",
    "avc1.4D4029",
    "avc1.640029",
  ],
  headless: true,
  json: false,
  requireAny: false,
  requireCodec: "",
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/check-webcodecs-h264-support.mjs [options]

Opens a temporary Edge/Chrome instance and asks WebCodecs which H.264 avc1
codec strings are supported for annexb and default AVC formats.

Options:
  --debugPort <port>       Browser remote debugging port. Default: ${defaults.debugPort}
  --timeoutMs <ms>         Per-step timeout. Default: ${defaults.timeoutMs}
  --width <px>             Coded width in support probe. Default: ${defaults.width}
  --height <px>            Coded height in support probe. Default: ${defaults.height}
  --codecs <list>          Comma-separated avc1 codec strings to probe.
  --requireAny             Exit non-zero if no tested H.264 config is supported.
  --requireCodec <codec>   Exit non-zero if the given codec has no supported config.
  --json                   Print a single machine-readable JSON object.
  --headed                 Run browser headed instead of headless.

Examples:
  node scripts/windows/check-webcodecs-h264-support.mjs
  node scripts/windows/check-webcodecs-h264-support.mjs --requireCodec avc1.420029
  node scripts/windows/check-webcodecs-h264-support.mjs --json
`);
}

function parseArgs(argv) {
  const args = { ...defaults, codecs: [...defaults.codecs] };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];

    if (key === "headed") {
      args.headless = false;
      continue;
    }
    if (key === "json") {
      args.json = true;
      continue;
    }
    if (key === "requireAny") {
      args.requireAny = true;
      continue;
    }
    if (key === "codecs" && next && !next.startsWith("--")) {
      args.codecs = next.split(",").map((codec) => codec.trim()).filter(Boolean);
      index += 1;
      continue;
    }
    if (key === "requireCodec" && next && !next.startsWith("--")) {
      args.requireCodec = next.trim();
      index += 1;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(args, key) && next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    }
  }

  args.debugPort = Number(args.debugPort);
  args.timeoutMs = Number(args.timeoutMs);
  args.width = Number(args.width);
  args.height = Number(args.height);
  args.codecs = [...new Set(args.codecs.map(normalizeCodec).filter(Boolean))];
  if (args.requireCodec) {
    args.requireCodec = normalizeCodec(args.requireCodec);
    if (!args.codecs.includes(args.requireCodec)) {
      args.codecs.unshift(args.requireCodec);
    }
  }
  return args;
}

function normalizeCodec(value) {
  const codec = String(value || "").trim();
  if (!codec) return "";
  return codec.startsWith("avc1.") ? codec : `avc1.${codec}`;
}

function print(kind, text, args) {
  if (!args.json) {
    console.log(`[${kind}] ${text}`);
  }
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

function startProcess(command, commandArgs) {
  return spawn(command, commandArgs, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}`);
  }
  return response.json();
}

async function startProbeServer() {
  const server = createServer((request, response) => {
    if (request.url === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>LAN Dual Control WebCodecs Probe</title>
<body>WebCodecs probe</body>
</html>`);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}/`,
  };
}

async function stopProbeServer(server) {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
}

class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();

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
      }
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
    socket.addEventListener("error", reject, { once: true });
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
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result.value;
}

function buildProbeExpression(args) {
  return `(${async function probeWebCodecsH264(input) {
    const formats = [
      { name: "annexb", extra: { avc: { format: "annexb" } } },
      { name: "default", extra: {} },
    ];
    const result = {
      available: typeof VideoDecoder === "function",
      hasIsConfigSupported: Boolean(globalThis.VideoDecoder?.isConfigSupported),
      userAgent: navigator.userAgent,
      width: input.width,
      height: input.height,
      results: [],
    };
    if (!result.available || !result.hasIsConfigSupported) {
      result.anySupported = false;
      result.reason = result.available ? "VideoDecoder.isConfigSupported missing" : "VideoDecoder missing";
      return result;
    }
    for (const codec of input.codecs) {
      for (const format of formats) {
        const config = {
          codec,
          codedWidth: input.width,
          codedHeight: input.height,
          hardwareAcceleration: "prefer-hardware",
          optimizeForLatency: true,
          ...format.extra,
        };
        try {
          const support = await VideoDecoder.isConfigSupported(config);
          result.results.push({
            codec,
            format: format.name,
            supported: Boolean(support.supported),
            normalizedConfig: support.config || null,
          });
        } catch (error) {
          result.results.push({
            codec,
            format: format.name,
            supported: false,
            error: error?.message || String(error),
          });
        }
      }
    }
    result.anySupported = result.results.some((item) => item.supported);
    result.supportedCodecs = [...new Set(result.results.filter((item) => item.supported).map((item) => item.codec))];
    return result;
  }.toString()})(${JSON.stringify({
    codecs: args.codecs,
    width: args.width,
    height: args.height,
  })})`;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(2000),
  ]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

function summarize(result, args) {
  const supportByCodec = new Map();
  for (const item of result.results || []) {
    if (!supportByCodec.has(item.codec)) supportByCodec.set(item.codec, []);
    supportByCodec.get(item.codec).push(item);
  }
  const preferred = result.results?.find((item) => item.supported && item.format === "annexb") ||
    result.results?.find((item) => item.supported) ||
    null;
  const failures = [];
  if (args.requireAny && !result.anySupported) {
    failures.push("no tested H.264 WebCodecs config is supported");
  }
  if (args.requireCodec) {
    const codecSupported = (supportByCodec.get(args.requireCodec) || []).some((item) => item.supported);
    if (!codecSupported) {
      failures.push(`${args.requireCodec} is not supported by any tested config`);
    }
  }
  return { preferred, failures };
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }

  const args = parseArgs(process.argv);
  const browserPath = findBrowserPath();
  const userDataDir = await mkdtemp(join(tmpdir(), "lan-dual-webcodecs-h264-"));
  const probe = await startProbeServer();
  const browserArgs = [
    `--remote-debugging-port=${args.debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    probe.url,
  ];
  if (args.headless) {
    browserArgs.push("--headless=new");
  }

  const browser = startProcess(browserPath, browserArgs);
  let session;
  try {
    session = await connectCdp(args.debugPort, args.timeoutMs);
    await session.send("Runtime.enable");
    await session.send("Page.enable");
    await session.send("Page.navigate", { url: probe.url });
    await waitFor(
      () => evaluate(session, `location.origin === ${JSON.stringify(new URL(probe.url).origin)} && document.readyState !== "loading"`),
      args.timeoutMs,
      "probe page load",
    );
    const result = await evaluate(session, buildProbeExpression(args));
    const { preferred, failures } = summarize(result, args);
    const output = {
      ok: failures.length === 0,
      browserPath,
      probeUrl: probe.url,
      args: {
        width: args.width,
        height: args.height,
        codecs: args.codecs,
      },
      ...result,
      preferred,
      failures,
    };

    if (args.json) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      print("OK", `Browser: ${result.userAgent || browserPath}`, args);
      if (!result.available || !result.hasIsConfigSupported) {
        print("WARN", result.reason || "WebCodecs H.264 support probe unavailable", args);
      }
      for (const codec of args.codecs) {
        const entries = (result.results || []).filter((item) => item.codec === codec);
        const text = entries.map((item) => {
          const suffix = item.error ? ` (${item.error})` : "";
          return `${item.format}=${item.supported ? "yes" : "no"}${suffix}`;
        }).join(", ");
        print(entries.some((item) => item.supported) ? "OK" : "WARN", `${codec}: ${text}`, args);
      }
      if (preferred) {
        print("OK", `Preferred supported H.264 config: ${preferred.codec} / ${preferred.format}`, args);
      }
      for (const failure of failures) {
        print("ERROR", failure, args);
      }
    }
    if (failures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    session?.close();
    await stopProcess(browser);
    await stopProbeServer(probe?.server);
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`);
  process.exitCode = 1;
});
