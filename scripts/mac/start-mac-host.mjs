#!/usr/bin/env node
import http from "node:http";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const macHostPath = resolve(repoRoot, "apps/mac-host");
const displayCheckPath = resolve(repoRoot, "scripts/mac/check-mac-displays.mjs");

const defaults = {
  host: process.env.LAN_DUAL_HOST || "0.0.0.0",
  port: Number(process.env.LAN_DUAL_PORT) || 43770,
  password: "",
  deviceName: process.env.LAN_DUAL_DEVICE_NAME || "",
  videoMode: process.env.LAN_DUAL_VIDEO_MODE || "auto",
  inputMode: process.env.LAN_DUAL_INPUT_MODE || "log",
  maxScreenFps: Number(process.env.LAN_DUAL_MAX_SCREEN_FPS) || 30,
  jpegQuality: process.env.LAN_DUAL_JPEG_QUALITY || "",
  bonjour: parseBoolean(process.env.LAN_DUAL_BONJOUR, true),
  buildId: process.env.LAN_DUAL_BUILD_ID || "",
  timeoutMs: 12000,
  promptPassword: false,
  requirePassword: false,
  skipRuntimeCheck: false,
  requireRuntimeCheck: false,
  allowExisting: false,
  dryRun: false,
  help: false,
};

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];

    if (key === "help" || key === "h") {
      args.help = true;
      continue;
    }
    if (
      key === "promptPassword" ||
      key === "requirePassword" ||
      key === "skipRuntimeCheck" ||
      key === "requireRuntimeCheck" ||
      key === "allowExisting" ||
      key === "dryRun"
    ) {
      args[key] = true;
      continue;
    }
    if (key === "noBonjour") {
      args.bonjour = false;
      continue;
    }
    if (key === "logInput") {
      args.inputMode = "log";
      continue;
    }
    if (key === "injectInput") {
      args.inputMode = "inject";
      continue;
    }
    if (key === "bonjour") {
      if (next && !next.startsWith("--")) {
        args.bonjour = next;
        index += 1;
      } else {
        args.bonjour = true;
      }
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(args, key) && next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    }
  }

  args.host = String(args.host || defaults.host).trim();
  args.port = clampInteger(args.port, 1, 65535, defaults.port);
  args.deviceName = normalizedText(args.deviceName);
  args.videoMode = normalizeMode(args.videoMode, ["auto", "screen", "mock"], defaults.videoMode);
  args.inputMode = normalizeMode(args.inputMode, ["log", "inject"], "log");
  args.maxScreenFps = clampInteger(args.maxScreenFps, 1, 60, defaults.maxScreenFps);
  args.jpegQuality = normalizeJpegQuality(args.jpegQuality);
  args.bonjour = parseBoolean(args.bonjour, defaults.bonjour);
  args.buildId = normalizedText(args.buildId) || getGitBuildId();
  args.timeoutMs = clampInteger(args.timeoutMs, 1000, 120000, defaults.timeoutMs);
  args.password = String(args.password || "").trim();
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/mac/start-mac-host.mjs [options]

Starts the macOS host with safe daily defaults, prints LAN addresses for the
Windows client, waits for /discovery, and optionally runs the read-only runtime
and display round-trip check.

Options:
  --host <host>              Bind host. Default: 0.0.0.0
  --port <port>              Port. Default: 43770
  --password <value>         Set LAN_DUAL_PASSWORD for this run. The value is not printed.
  --promptPassword           Prompt for LAN_DUAL_PASSWORD without echoing it.
  --requirePassword          Refuse empty or demo-password credentials.
  --deviceName <name>        Set LAN_DUAL_DEVICE_NAME.
  --videoMode <mode>         auto | screen | mock. Default: auto
  --inputMode <mode>         log | inject. Default: log for safety
  --logInput                 Shortcut for --inputMode log
  --injectInput              Shortcut for --inputMode inject
  --maxScreenFps <fps>       LAN_DUAL_MAX_SCREEN_FPS. Default: 30
  --jpegQuality <value>      LAN_DUAL_JPEG_QUALITY, 0.1 to 0.95
  --buildId <id>             LAN_DUAL_BUILD_ID. Default: current git short hash.
  --noBonjour                Disable Bonjour/mDNS advertisement.
  --skipRuntimeCheck         Skip check-mac-displays after /discovery is ready.
  --requireRuntimeCheck      Stop startup if the runtime/display check fails.
  --allowExisting            Do not refuse when /discovery already answers on the port.
  --dryRun                   Print the resolved launch plan and exit.
`);
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function normalizeMode(value, allowed, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeJpegQuality(value) {
  const text = normalizedText(value);
  if (!text) return "";
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return "";
  return String(Math.max(0.1, Math.min(0.95, parsed)));
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  switch (String(value).trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "y":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "n":
    case "off":
      return false;
    default:
      return fallback;
  }
}

function getGitBuildId() {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 3000,
  });
  const value = normalizedText(result.stdout);
  return value || "local-dev";
}

function getLanAddresses() {
  const result = [];
  const interfaces = os.networkInterfaces();
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      if (!entry || entry.family !== "IPv4" || entry.internal) continue;
      if (entry.address.startsWith("169.254.")) continue;
      result.push({ name, address: entry.address });
    }
  }
  return result;
}

async function preparePassword(args) {
  if (args.promptPassword && !args.password && !process.env.LAN_DUAL_PASSWORD) {
    args.password = await promptHidden("Mac host password: ");
    if (!args.password) {
      throw new Error("Password cannot be empty when --promptPassword is used.");
    }
  }

  const effectivePassword = args.password || process.env.LAN_DUAL_PASSWORD || "";
  if (args.requirePassword && !effectivePassword) {
    throw new Error("LAN_DUAL_PASSWORD is required. Set it in the environment, pass --password, or use --promptPassword.");
  }
  if (args.requirePassword && effectivePassword === "demo-password") {
    throw new Error("Refusing to start with demo-password when --requirePassword is used.");
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

function makeLaunchEnv(args) {
  const env = {
    ...process.env,
    LAN_DUAL_HOST: args.host,
    LAN_DUAL_PORT: String(args.port),
    LAN_DUAL_VIDEO_MODE: args.videoMode,
    LAN_DUAL_INPUT_MODE: args.inputMode,
    LAN_DUAL_MAX_SCREEN_FPS: String(args.maxScreenFps),
    LAN_DUAL_BONJOUR: args.bonjour ? "1" : "0",
    LAN_DUAL_BUILD_ID: args.buildId,
  };
  if (args.password) env.LAN_DUAL_PASSWORD = args.password;
  if (args.deviceName) env.LAN_DUAL_DEVICE_NAME = args.deviceName;
  if (args.jpegQuality) env.LAN_DUAL_JPEG_QUALITY = args.jpegQuality;
  return env;
}

function printLaunchPlan(args) {
  const lanAddresses = getLanAddresses();
  console.log(`[INFO] Mac host bind: ${args.host}:${args.port}`);
  if (lanAddresses.length > 0) {
    for (const entry of lanAddresses) {
      console.log(`[OK] Windows side can try: ${entry.address}:${args.port} (${entry.name})`);
    }
  } else {
    console.log("[WARN] No LAN IPv4 address was detected. Windows may not be able to connect yet.");
  }

  console.log(`[INFO] Video mode: ${args.videoMode}`);
  console.log(`[INFO] Input mode: ${args.inputMode}${args.inputMode === "log" ? " (safe, no injection)" : " (real injection)"}`);
  console.log(`[INFO] Max screen FPS: ${args.maxScreenFps}`);
  console.log(`[INFO] JPEG quality override: ${args.jpegQuality || "auto"}`);
  console.log(`[INFO] Bonjour: ${args.bonjour ? "enabled" : "disabled"}`);
  console.log(`[INFO] Build ID: ${args.buildId}`);
  console.log("[INFO] Launch command: swift run --package-path apps/mac-host lan-dual-mac-host");
  if (!args.password && !process.env.LAN_DUAL_PASSWORD) {
    console.log("[WARN] No LAN_DUAL_PASSWORD was set; mac-host will use its demo password for this run.");
  }
}

function requestJson(url, timeoutMs) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          rejectRequest(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolveRequest(JSON.parse(body));
        } catch {
          rejectRequest(new Error("discovery returned invalid JSON"));
        }
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    request.on("error", rejectRequest);
  });
}

async function assertNoExistingHost(args) {
  if (args.allowExisting) return;
  try {
    const discovery = await requestJson(`http://127.0.0.1:${args.port}/discovery`, 500);
    const name = discovery.deviceName || discovery.hostName || discovery.name || "Mac host";
    const build = discovery.runtime?.buildId ? ` build=${discovery.runtime.buildId}` : "";
    throw new Error(
      `A host already answers /discovery on 127.0.0.1:${args.port} (${name}${build}). Stop it first or choose another --port.`,
    );
  } catch (error) {
    if (String(error.message || "").startsWith("A host already answers")) throw error;
  }
}

async function waitForDiscovery(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      return await requestJson(`http://127.0.0.1:${port}/discovery`, Math.min(1000, timeoutMs));
    } catch (error) {
      lastError = error.message;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
  }
  throw new Error(lastError || `Mac host did not answer /discovery within ${timeoutMs}ms`);
}

function runRuntimeCheck(args, env) {
  if (args.skipRuntimeCheck) return true;
  const commandArgs = [
    displayCheckPath,
    "--host",
    "127.0.0.1",
    "--port",
    String(args.port),
    "--password",
    args.password || process.env.LAN_DUAL_PASSWORD || "demo-password",
    "--requireRuntime",
    "--expectBuildId",
    args.buildId,
    "--timeoutMs",
    String(args.timeoutMs),
  ];
  console.log("[INFO] Running read-only Mac runtime/display check...");
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    timeout: Math.max(15000, args.timeoutMs + 5000),
  });
  if (result.error) {
    console.log(`[WARN] Runtime/display check could not run: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) {
    console.log("[WARN] Runtime/display check reported a problem. The Mac host is still running; use the messages above for diagnosis.");
    return false;
  }
  return true;
}

function spawnHost(env) {
  return spawn("swift", ["run", "--package-path", macHostPath, "lan-dual-mac-host"], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  await preparePassword(args);
  const env = makeLaunchEnv(args);
  printLaunchPlan(args);
  if (args.dryRun) {
    console.log("[OK] Dry run finished; Mac host was not started.");
    return;
  }

  await assertNoExistingHost(args);

  console.log("[INFO] Starting Mac host...");
  const child = spawnHost(env);
  let exited = false;
  let childExitInfo = null;
  const childExit = new Promise((resolveExit) => {
    child.once("error", (error) => {
      exited = true;
      childExitInfo = { code: null, signal: "", error };
      console.log(`[ERROR] Mac host failed to start: ${error.message}`);
      process.exitCode = 1;
      resolveExit(childExitInfo);
    });
    child.once("exit", (code, signal) => {
      exited = true;
      childExitInfo = { code, signal, error: null };
      if (signal) {
        console.log(`[INFO] Mac host stopped by ${signal}.`);
      } else {
        console.log(`[INFO] Mac host exited with code ${code ?? 0}.`);
      }
      process.exitCode = code ?? 0;
      resolveExit(childExitInfo);
    });
  });

  const stop = () => {
    if (exited) return;
    console.log("[INFO] Stopping Mac host...");
    child.kill();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    const discovery = await Promise.race([
      waitForDiscovery(args.port, args.timeoutMs),
      childExit.then(() => {
        const suffix = childExitInfo?.error
          ? childExitInfo.error.message
          : `code=${childExitInfo?.code ?? "unknown"} signal=${childExitInfo?.signal || "none"}`;
        throw new Error(`Mac host exited before /discovery was ready (${suffix})`);
      }),
    ]);
    const runtime = discovery.runtime || {};
    const video = discovery.capturePipeline || discovery.source || discovery.hostMode || "unknown";
    const input = discovery.capabilities?.input?.mode || discovery.inputMode || args.inputMode;
    const build = runtime.buildId || "unknown";
    console.log(`[OK] /discovery is ready: ${discovery.deviceName || discovery.hostName || "Mac host"} · video=${video} · input=${input} · build=${build}`);
  } catch (error) {
    console.log(`[ERROR] ${error.message}`);
    stop();
    process.exitCode = 1;
    return;
  }

  const runtimeCheckPassed = runRuntimeCheck(args, env);
  if (!runtimeCheckPassed && args.requireRuntimeCheck) {
    stop();
    process.exitCode = 1;
    return;
  }
  console.log("[OK] Mac host is running. Press Ctrl+C to stop it.");

  await childExit;
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`);
  process.exitCode = 1;
});
