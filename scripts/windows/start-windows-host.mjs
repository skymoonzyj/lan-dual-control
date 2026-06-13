import http from "node:http";
import os from "node:os";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const serverPath = resolve(repoRoot, "apps/windows-host/server.mjs");
const firewallCheckPath = resolve(repoRoot, "scripts/windows/check-windows-firewall.mjs");
const defaultWindowsFfmpeg = "C:\\DevTools\\ffmpeg\\bin\\ffmpeg.exe";

const defaults = {
  host: process.env.LAN_DUAL_HOST || "0.0.0.0",
  port: Number(process.env.LAN_DUAL_PORT) || 43770,
  password: "",
  screenMode: process.env.LAN_DUAL_WINDOWS_SCREEN_MODE || "",
  audioMode: process.env.LAN_DUAL_WINDOWS_AUDIO_MODE || "",
  inputMode: process.env.LAN_DUAL_WINDOWS_INPUT_MODE || "",
  ffmpeg: process.env.LAN_DUAL_FFMPEG || "",
  buildId: process.env.LAN_DUAL_BUILD_ID || "",
  timeoutMs: 8000,
  skipFirewallCheck: false,
  noRequireOpen: false,
  addFirewallRule: false,
  dryRunFirewallRule: false,
  promptPassword: false,
  requirePassword: false,
  dryRun: false,
  help: false,
};

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "-h") {
      args.help = true;
      continue;
    }
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];

    if (key === "help" || key === "h") {
      args.help = true;
      continue;
    }
    if (
      key === "skipFirewallCheck" ||
      key === "noRequireOpen" ||
      key === "addFirewallRule" ||
      key === "dryRunFirewallRule" ||
      key === "promptPassword" ||
      key === "requirePassword" ||
      key === "dryRun"
    ) {
      args[key] = true;
      continue;
    }
    if (key === "wasapi") {
      args.audioMode = "wasapi";
      continue;
    }
    if (key === "logInput") {
      args.inputMode = "log";
      continue;
    }
    if (key === "systemInput") {
      args.inputMode = "system";
      continue;
    }

    const targetKey = key === "audio" ? "audioMode"
      : key === "screen" ? "screenMode"
        : key === "input" ? "inputMode"
          : key;

    if (Object.prototype.hasOwnProperty.call(args, targetKey) && next && !next.startsWith("--")) {
      args[targetKey] = next;
      index += 1;
    }
  }

  args.host = String(args.host || defaults.host).trim();
  args.port = clampInteger(args.port, 1, 65535, defaults.port);
  args.timeoutMs = clampInteger(args.timeoutMs, 1000, 60000, defaults.timeoutMs);
  args.screenMode = normalizeMode(args.screenMode, ["auto", "ffmpeg", "ffmpeg-h264", "h264", "system", "mock", "wgc"], "");
  args.audioMode = normalizeMode(args.audioMode, ["mock", "wasapi", "dshow"], "");
  args.inputMode = normalizeMode(args.inputMode, ["auto", "log", "system"], "");
  args.ffmpeg = resolveFfmpegCommand(String(args.ffmpeg || "").trim());
  args.buildId = String(args.buildId || "").trim() || getGitBuildId() || "dev";
  args.promptPassword = Boolean(args.promptPassword);
  args.requirePassword = Boolean(args.requirePassword);
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/windows/start-windows-host.mjs [options]

Starts the Windows host for LAN reverse-control and prints the addresses the Mac
side should use. After the service starts, it runs the read-only LAN/firewall
check so firewall or bind-address problems are visible immediately.

Options:
  --host <host>           Bind host. Default: 0.0.0.0
  --port <port>           Port. Default: 43770
  --password <value>      Set LAN_DUAL_PASSWORD for this run. The value is not printed.
  --screenMode <mode>     auto | ffmpeg | ffmpeg-h264 | h264 | system | mock | wgc
  --audioMode <mode>      mock | wasapi | dshow
  --inputMode <mode>      auto | log | system
  --ffmpeg <path>         FFmpeg path. Auto-detects C:\\DevTools\\ffmpeg\\bin\\ffmpeg.exe
  --buildId <id>          LAN_DUAL_BUILD_ID. Default: current git short hash.
  --promptPassword        Prompt for LAN_DUAL_PASSWORD without echoing it.
  --requirePassword       Refuse to start if no password/env password was set.
  --addFirewallRule       Try to add a Private TCP inbound firewall allow rule.
  --dryRunFirewallRule    Print the firewall rule command without adding it.
  --wasapi                Shortcut for --audioMode wasapi
  --logInput              Shortcut for --inputMode log
  --systemInput           Shortcut for --inputMode system
  --skipFirewallCheck     Start only, do not run the read-only firewall check.
  --noRequireOpen         Run firewall check but do not require the port probe to pass.
  --dryRun                Print the resolved launch plan and exit.
  --help, -h              Show this help without starting Windows host.
`);
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

function resolveFfmpegCommand(value) {
  if (value) return value;
  if (process.platform === "win32" && existsSync(defaultWindowsFfmpeg)) {
    return defaultWindowsFfmpeg;
  }
  return "";
}

function getGitBuildId() {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return "";
  return String(result.stdout || "").trim();
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
    args.password = await promptHidden("Windows host password: ");
    if (!args.password) {
      throw new Error("Password cannot be empty when --promptPassword is used.");
    }
  }
  if (args.requirePassword && !args.password && !process.env.LAN_DUAL_PASSWORD) {
    throw new Error("LAN_DUAL_PASSWORD is required. Set it in the environment, pass --password, or use --promptPassword.");
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
    LAN_DUAL_BUILD_ID: args.buildId,
  };
  if (args.password) env.LAN_DUAL_PASSWORD = String(args.password);
  if (args.screenMode) env.LAN_DUAL_WINDOWS_SCREEN_MODE = args.screenMode;
  if (args.audioMode) env.LAN_DUAL_WINDOWS_AUDIO_MODE = args.audioMode;
  if (args.inputMode) env.LAN_DUAL_WINDOWS_INPUT_MODE = args.inputMode;
  if (args.ffmpeg) env.LAN_DUAL_FFMPEG = args.ffmpeg;
  return env;
}

function printLaunchPlan(args) {
  const lanAddresses = getLanAddresses();
  console.log(`[INFO] Windows host bind: ${args.host}:${args.port}`);
  console.log(`[INFO] Build ID: ${args.buildId}`);
  if (lanAddresses.length > 0) {
    for (const entry of lanAddresses) {
      console.log(`[OK] Mac side can try: ${entry.address}:${args.port} (${entry.name})`);
    }
  } else {
    console.log("[WARN] No LAN IPv4 address was detected. Mac may not be able to connect yet.");
  }

  console.log(`[INFO] Screen mode: ${args.screenMode || "auto"}`);
  console.log(`[INFO] Audio mode: ${args.audioMode || "default mock; use --wasapi for system audio"}`);
  console.log(`[INFO] Input mode: ${args.inputMode || "auto"}`);
  if (args.ffmpeg) {
    console.log(`[INFO] FFmpeg: ${args.ffmpeg}`);
  } else {
    console.log("[WARN] FFmpeg path was not resolved; Windows host may fall back to slower capture.");
  }
  if (!args.password && !process.env.LAN_DUAL_PASSWORD) {
    console.log("[WARN] No LAN_DUAL_PASSWORD was set; server.mjs will use its demo password for this run.");
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
  throw new Error(lastError || `Windows host did not answer /discovery within ${timeoutMs}ms`);
}

function runFirewallCheck(args, env) {
  const commandArgs = [
    firewallCheckPath,
    "--host",
    args.host,
    "--port",
    String(args.port),
    ...(args.noRequireOpen ? [] : ["--requireOpen"]),
    ...(args.addFirewallRule ? ["--addRule"] : []),
    ...(args.dryRunFirewallRule ? ["--dryRunRule"] : []),
  ];
  console.log("[INFO] Running read-only LAN/firewall check...");
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    windowsHide: true,
    timeout: Math.max(12000, args.timeoutMs + 5000),
  });
  if (result.error) {
    console.log(`[WARN] Firewall check could not run: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) {
    console.log("[WARN] Firewall check reported a problem. The host is still running; use the messages above if Mac cannot connect.");
    return false;
  }
  return true;
}

function spawnHost(args, env) {
  return spawn(process.execPath, [serverPath, String(args.port), args.host], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    windowsHide: true,
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
    console.log("[OK] Dry run finished; Windows host was not started.");
    return;
  }

  console.log("[INFO] Starting Windows host...");
  const child = spawnHost(args, env);
  let exited = false;
  let childExitInfo = null;
  const childExit = new Promise((resolveExit) => {
    child.once("error", (error) => {
      exited = true;
      childExitInfo = { code: null, signal: "", error };
      console.log(`[ERROR] Windows host failed to start: ${error.message}`);
      process.exitCode = 1;
      resolveExit(childExitInfo);
    });
    child.once("exit", (code, signal) => {
      exited = true;
      childExitInfo = { code, signal, error: null };
      if (signal) {
        console.log(`[INFO] Windows host stopped by ${signal}.`);
      } else {
        console.log(`[INFO] Windows host exited with code ${code ?? 0}.`);
      }
      process.exitCode = code ?? 0;
      resolveExit();
    });
  });

  const stop = () => {
    if (exited) return;
    console.log("[INFO] Stopping Windows host...");
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
        throw new Error(`Windows host exited before /discovery was ready (${suffix})`);
      }),
    ]);
    const source = discovery.capturePipeline || discovery.source || discovery.hostMode || "unknown";
    const audio = discovery.audioMode || discovery.audioCodec || "unknown";
    console.log(`[OK] /discovery is ready: ${discovery.name || "Windows host"} · video=${source} · audio=${audio}`);
  } catch (error) {
    console.log(`[ERROR] ${error.message}`);
    stop();
    process.exitCode = 1;
    return;
  }

  if (!args.skipFirewallCheck) {
    runFirewallCheck(args, env);
  }
  console.log("[OK] Windows host is running. Press Ctrl+C to stop it.");

  await childExit;
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`);
  process.exitCode = 1;
});
