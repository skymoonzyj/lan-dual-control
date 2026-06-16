#!/usr/bin/env node
import http from "node:http";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promptPassword as promptMacPassword } from "./password-prompt.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const macHostPath = resolve(repoRoot, "apps/mac-host");
const displayCheckPath = resolve(repoRoot, "scripts/mac/check-mac-displays.mjs");
const hostRuntimePaths = [
  "apps/mac-host/Package.swift",
  "apps/mac-host/Sources",
];

const defaults = {
  host: process.env.LAN_DUAL_HOST || "0.0.0.0",
  port: Number(process.env.LAN_DUAL_PORT) || 43770,
  password: "",
  passwordFromArg: false,
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
  ephemeralPassword: false,
  skipRuntimeCheck: false,
  requireRuntimeCheck: false,
  allowExisting: false,
  background: false,
  logFile: "",
  status: false,
  stop: false,
  confirmUserWatching: false,
  json: false,
  dryRun: false,
  help: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

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
      key === "ephemeralPassword" ||
      key === "skipRuntimeCheck" ||
      key === "requireRuntimeCheck" ||
      key === "allowExisting" ||
      key === "background" ||
      key === "status" ||
      key === "stop" ||
      key === "confirmUserWatching" ||
      key === "json" ||
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
      if (key === "password") {
        args.passwordFromArg = true;
      }
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
  --promptPassword           Ring first, then prompt for LAN_DUAL_PASSWORD in a
                             frontmost macOS hidden password dialog.
  --ephemeralPassword        Generate a one-time random password for this run. It is not printed.
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
  --background               Detach the Mac host after /discovery and runtime checks pass.
  --logFile <path>           With --background, append Mac host logs here.
                             Default: .dev-lab/mac-host/lan-dual-mac-host-<port>.log
  --status                   Print current /discovery runtime status and stale-build source diff,
                             then exit without starting.
  --stop                     Stop the local Mac host that answers /discovery on this port.
                             Requires macOS /discovery and runtime.processId; no password is read.
  --confirmUserWatching      Required with --inputMode inject / --injectInput. Confirms a human
                             is watching the Mac screen and can take over.
  --json                     With --status, print machine-readable JSON only.
                             With --stop, print machine-readable JSON only.
  --dryRun                   Print the resolved launch plan and exit.
  --help, -h                 Show this help without starting Mac host.
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

function getChangedHostRuntimeFiles(fromBuildId, toBuildId) {
  const from = normalizedText(fromBuildId);
  const to = normalizedText(toBuildId || "HEAD") || "HEAD";
  if (!from) return null;
  const revParse = spawnSync("git", ["rev-parse", "--verify", "--quiet", `${from}^{commit}`], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 3000,
  });
  if (revParse.status !== 0) {
    return null;
  }
  const diff = spawnSync("git", ["diff", "--name-only", `${from}..${to}`, "--", ...hostRuntimePaths], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 3000,
  });
  if (diff.status !== 0) {
    return null;
  }
  return diff.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getBuildDiffStatus(fromBuildId, toBuildId) {
  const changedHostFiles = getChangedHostRuntimeFiles(fromBuildId, toBuildId);
  if (!Array.isArray(changedHostFiles)) {
    return {
      differs: true,
      fromBuildId,
      toBuildId,
      comparable: false,
      changedHostRuntimeFiles: null,
      changedHostRuntimeFileCount: null,
      message: `Could not inspect Mac host runtime changes since ${fromBuildId}; old build is not available in local git history.`,
    };
  }
  if (changedHostFiles.length === 0) {
    return {
      differs: true,
      fromBuildId,
      toBuildId,
      comparable: true,
      changedHostRuntimeFiles: [],
      changedHostRuntimeFileCount: 0,
      message: `No Mac host runtime source changes since ${fromBuildId}; the running service behavior is likely current, but build metadata is stale.`,
    };
  }
  return {
    differs: true,
    fromBuildId,
    toBuildId,
    comparable: true,
    changedHostRuntimeFiles: changedHostFiles,
    changedHostRuntimeFileCount: changedHostFiles.length,
    message: `Mac host runtime source changed since ${fromBuildId}: ${changedHostFiles.slice(0, 4).join(", ")}${
      changedHostFiles.length > 4 ? ` (+${changedHostFiles.length - 4} more)` : ""
    }`,
  };
}

function printBuildMismatchStatus(buildDiff) {
  console.log(
    `[WARN] Running host build ${buildDiff.fromBuildId} differs from current git ${buildDiff.toBuildId}; restart if you need the latest build.`,
  );
  if (!buildDiff.comparable) {
    console.log(`[INFO] ${buildDiff.message}`);
    return;
  }
  if (buildDiff.changedHostRuntimeFileCount === 0) {
    console.log(`[INFO] ${buildDiff.message}`);
    return;
  }
  console.log(`[WARN] ${buildDiff.message}`);
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

function statusValue(value) {
  if (value === true) return "on";
  if (value === false) return "off";
  return "unknown";
}

function statusProbeHost(args) {
  return args.host === "0.0.0.0" || args.host === "::" ? "127.0.0.1" : args.host;
}

function isLocalProbeHost(host) {
  const value = normalizedText(host).toLowerCase();
  if (!value) return false;
  if (value === "localhost" || value === "::1") return true;
  if (value === "127.0.0.1" || value.startsWith("127.")) return true;
  return getLanAddresses().some((entry) => entry.address === value);
}

function discoveryInputMode(discovery) {
  return discovery?.capabilities?.inputMode || discovery?.capabilities?.input?.mode || discovery?.inputMode || "unknown";
}

function discoveryRuntimeSummary(runtime = {}) {
  const parts = [];
  if (runtime.processId) parts.push(`pid=${runtime.processId}`);
  if (runtime.buildId) parts.push(`build=${runtime.buildId}`);
  if (runtime.uptimeSeconds !== undefined) parts.push(`uptime=${runtime.uptimeSeconds}s`);
  if (runtime.startedAt) parts.push(`startedAt=${runtime.startedAt}`);
  return parts.length > 0 ? parts.join(" ") : "runtime=missing";
}

function discoveryCapabilitySummary(discovery) {
  const capabilities = discovery?.capabilities || {};
  const parts = [
    `video=${statusValue(capabilities.video)}`,
    `h264=${statusValue(capabilities.h264Stream)}`,
    `audio=${capabilities.audioMode || statusValue(capabilities.audio)}`,
    `clipboardText=${statusValue(capabilities.clipboardText)}`,
    `clipboardFile=${statusValue(capabilities.clipboardFile)}`,
  ];
  if (capabilities.capturePipeline) parts.push(`pipeline=${capabilities.capturePipeline}`);
  if (capabilities.maxScreenFps) parts.push(`maxFps=${capabilities.maxScreenFps}`);
  return parts.join(" ");
}

function normalizeDisplays(displays) {
  return (Array.isArray(displays) ? displays : [])
    .map((display, index) => ({
      id: normalizedText(display?.id || `display-${index + 1}`),
      name: normalizedText(display?.name || `Display ${index + 1}`),
      width: clampInteger(display?.width, 0, 100000, 0),
      height: clampInteger(display?.height, 0, 100000, 0),
      primary: Boolean(display?.primary),
    }))
    .filter((display) => display.id);
}

function discoveryDisplays(discovery) {
  return normalizeDisplays(discovery?.capabilities?.displays ?? discovery?.displays ?? []);
}

function formatDisplays(displays) {
  if (!Array.isArray(displays) || displays.length === 0) return "none";
  return displays
    .map((display) => {
      const marker = display.primary ? "*" : "";
      const size = display.width && display.height ? `:${display.width}x${display.height}` : "";
      return `${display.id}${marker}${size}`;
    })
    .join(", ");
}

function discoveryPermissionSummary(discovery) {
  const permissions = discovery?.permissions || {};
  return [
    `screen=${statusValue(permissions.screenRecording)}`,
    `accessibility=${statusValue(permissions.accessibility)}`,
    `inputMonitoring=${statusValue(permissions.inputMonitoring)}`,
  ].join(" ");
}

function isMacHostDiscovery(discovery) {
  const platform = normalizedText(discovery?.platform).toLowerCase();
  if (platform === "macos" || platform === "darwin") return true;
  const hostMarkers = [
    discovery?.hostMode,
    discovery?.capturePipeline,
    discovery?.source,
  ].map((value) => normalizedText(value).toLowerCase());
  return hostMarkers.some((value) => value.includes("mac-host"));
}

function discoveryRuntimePid(discovery) {
  const pid = Number(discovery?.runtime?.processId ?? discovery?.runtime?.pid ?? 0);
  if (!Number.isSafeInteger(pid) || pid <= 1) return 0;
  return pid;
}

function printStopPayload(payload, args) {
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (payload.alreadyStopped) {
    console.log(`[OK] No Mac host answers /discovery on ${payload.probe.host}:${payload.probe.port}; nothing to stop.`);
    return;
  }
  if (!payload.ok) {
    console.log(`[ERROR] ${payload.error?.message || "Mac host stop failed."}`);
    return;
  }
  console.log(`[OK] Stopped Mac host pid=${payload.runtime?.processId || payload.targetPid} on ${payload.probe.host}:${payload.probe.port}.`);
}

async function waitForStoppedDiscovery({ host, port, targetPid, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let lastDiscovery = null;
  while (Date.now() < deadline) {
    try {
      const discovery = await requestJson(`http://${host}:${port}/discovery`, Math.min(1000, timeoutMs));
      lastDiscovery = discovery;
      const pid = discoveryRuntimePid(discovery);
      if (pid && pid !== targetPid) {
        return { offline: false, replaced: true, discovery };
      }
    } catch (error) {
      return { offline: true, replaced: false, error: error.message };
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  return { offline: false, replaced: false, discovery: lastDiscovery };
}

async function stopHost(args) {
  const probeHost = statusProbeHost(args);
  const payloadBase = {
    ok: false,
    stopped: false,
    alreadyStopped: false,
    probe: { host: probeHost, port: args.port },
    targetPid: 0,
  };

  if (!isLocalProbeHost(probeHost)) {
    const payload = {
      ...payloadBase,
      error: {
        code: "non_local_host",
        message: `Refusing to stop a non-local host (${probeHost}). Use 127.0.0.1 or this Mac's LAN IP.`,
      },
    };
    printStopPayload(payload, args);
    return payload;
  }

  let discovery = null;
  try {
    discovery = await requestJson(`http://${probeHost}:${args.port}/discovery`, Math.min(args.timeoutMs, 3000));
  } catch (error) {
    const payload = {
      ...payloadBase,
      ok: true,
      alreadyStopped: true,
      online: false,
      error: { message: error.message },
    };
    printStopPayload(payload, args);
    return payload;
  }

  const runtime = discovery.runtime || {};
  const targetPid = discoveryRuntimePid(discovery);
  const payloadTarget = {
    ...payloadBase,
    online: true,
    targetPid,
    deviceName: discovery.deviceName || discovery.hostName || discovery.name || "Mac host",
    platform: discovery.platform || "",
    runtime,
  };

  if (!isMacHostDiscovery(discovery)) {
    const payload = {
      ...payloadTarget,
      error: {
        code: "not_mac_host",
        message: `Refusing to stop /discovery target because platform is ${discovery.platform || "unknown"}, not macOS.`,
      },
    };
    printStopPayload(payload, args);
    return payload;
  }
  if (!targetPid) {
    const payload = {
      ...payloadTarget,
      error: {
        code: "missing_runtime_pid",
        message: "Refusing to stop Mac host because /discovery.runtime.processId is missing.",
      },
    };
    printStopPayload(payload, args);
    return payload;
  }
  if (targetPid === process.pid) {
    const payload = {
      ...payloadTarget,
      error: {
        code: "self_pid",
        message: "Refusing to stop because /discovery.runtime.processId matches this helper process.",
      },
    };
    printStopPayload(payload, args);
    return payload;
  }

  try {
    process.kill(targetPid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") {
      const payload = {
        ...payloadTarget,
        error: {
          code: error.code || "kill_failed",
          message: `Failed to send SIGTERM to Mac host pid=${targetPid}: ${error.message}`,
        },
      };
      printStopPayload(payload, args);
      return payload;
    }
  }

  const stopped = await waitForStoppedDiscovery({
    host: probeHost,
    port: args.port,
    targetPid,
    timeoutMs: Math.max(1000, args.timeoutMs),
  });
  if (stopped.offline) {
    const payload = {
      ...payloadTarget,
      ok: true,
      stopped: true,
      online: false,
      signal: "SIGTERM",
    };
    printStopPayload(payload, args);
    return payload;
  }

  const stillPid = discoveryRuntimePid(stopped.discovery);
  const payload = {
    ...payloadTarget,
    error: {
      code: stopped.replaced ? "host_replaced" : "stop_timeout",
      message: stopped.replaced
        ? `Sent SIGTERM to pid=${targetPid}, but /discovery is still online with pid=${stillPid || "unknown"}.`
        : `Sent SIGTERM to pid=${targetPid}, but /discovery did not go offline within ${args.timeoutMs}ms.`,
    },
    latestDiscovery: stopped.discovery || null,
  };
  printStopPayload(payload, args);
  return payload;
}

async function printStatus(args) {
  const probeHost = statusProbeHost(args);
  try {
    const discovery = await requestJson(`http://${probeHost}:${args.port}/discovery`, Math.min(args.timeoutMs, 3000));
    const runtime = discovery.runtime || {};
    const input = discoveryInputMode(discovery);
    const lanAddresses = getLanAddresses();
    const displays = discoveryDisplays(discovery);
    const inputModeWarning = input !== "log" ? `Input mode is ${input}; keep log mode for unattended readiness checks.` : "";
    const buildDiff = runtime.buildId && args.buildId && runtime.buildId !== args.buildId
      ? getBuildDiffStatus(runtime.buildId, args.buildId)
      : {
          differs: false,
          fromBuildId: runtime.buildId || "",
          toBuildId: args.buildId || "",
          comparable: true,
          changedHostRuntimeFiles: [],
          changedHostRuntimeFileCount: 0,
          message: runtime.buildId && args.buildId
            ? "Running host build matches current git."
            : "Build comparison unavailable because runtime.buildId or current git build is missing.",
        };
    const payload = {
      ok: true,
      online: true,
      probe: { host: probeHost, port: args.port },
      deviceName: discovery.deviceName || discovery.hostName || "Mac host",
      inputMode: input,
      inputModeWarning,
      runtime,
      permissions: discovery.permissions || {},
      capabilities: discovery.capabilities || {},
      displays,
      displayCount: displays.length,
      lanAddresses: lanAddresses.map((entry) => ({ ...entry, port: args.port })),
      currentBuildId: args.buildId,
      buildDiff,
      discovery,
    };
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return payload;
    }
    console.log(`[INFO] Mac host status probe: ${probeHost}:${args.port}`);
    console.log(`[OK] /discovery online: ${payload.deviceName} · input=${input} · ${discoveryRuntimeSummary(runtime)}`);
    console.log(`[INFO] Permissions: ${discoveryPermissionSummary(discovery)}`);
    console.log(`[INFO] Capabilities: ${discoveryCapabilitySummary(discovery)}`);
    console.log(`[INFO] Displays: ${formatDisplays(displays)}`);
    if (lanAddresses.length > 0) {
      for (const entry of lanAddresses) {
        console.log(`[OK] Windows side can try: ${entry.address}:${args.port} (${entry.name})`);
      }
    }
    if (inputModeWarning) {
      console.log(`[WARN] ${inputModeWarning}`);
    }
    if (runtime.buildId && args.buildId && runtime.buildId !== args.buildId) {
      printBuildMismatchStatus(buildDiff);
    }
    return payload;
  } catch (error) {
    const payload = {
      ok: false,
      online: false,
      probe: { host: probeHost, port: args.port },
      currentBuildId: args.buildId,
      error: {
        message: error.message,
      },
      displays: [],
      displayCount: 0,
      suggestions: [
        "node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword",
        "node scripts/mac/start-mac-host.mjs --ephemeralPassword --requirePassword",
      ],
    };
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return payload;
    }
    console.log(`[INFO] Mac host status probe: ${probeHost}:${args.port}`);
    console.log(`[WARN] /discovery offline on ${probeHost}:${args.port}: ${error.message}`);
    console.log("[INFO] Start safely with: node scripts/mac/start-mac-host.mjs --promptPassword --requirePassword");
    console.log("[INFO] For temporary discovery/runtime diagnostics without sharing a password: node scripts/mac/start-mac-host.mjs --ephemeralPassword --requirePassword");
    return payload;
  }
}

async function preparePassword(args) {
  if (args.ephemeralPassword && args.password) {
    throw new Error("--ephemeralPassword cannot be combined with --password.");
  }
  if (args.ephemeralPassword && args.promptPassword) {
    throw new Error("--ephemeralPassword cannot be combined with --promptPassword.");
  }
  if (args.ephemeralPassword && process.env.LAN_DUAL_PASSWORD) {
    throw new Error("--ephemeralPassword refuses to override an existing LAN_DUAL_PASSWORD. Unset it or omit --ephemeralPassword.");
  }
  if (args.ephemeralPassword) {
    args.password = makeEphemeralPassword();
  }

  if (args.promptPassword && args.passwordFromArg) {
    throw new Error("--promptPassword cannot be combined with --password.");
  }
  if (args.promptPassword) {
    args.password = await promptMacPassword({
      title: "LAN Dual Control",
      message: "Enter the formal Mac host password. It stays in this process and is not printed.",
      prompt: "Mac host password:",
      terminalLabel: "Mac host password: ",
    });
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

function assertInjectUserConfirmation(args) {
  if (args.status || args.stop || args.dryRun) return;
  if (args.inputMode !== "inject") return;
  if (args.confirmUserWatching) return;
  throw new Error(
    "Refusing to start real input injection without --confirmUserWatching. Only use inject mode when a human is watching the Mac screen and can take over.",
  );
}

function makeEphemeralPassword() {
  return `ephemeral-${crypto.randomBytes(24).toString("base64url")}`;
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
  if (args.background) {
    console.log(`[INFO] Background: enabled; log file: ${resolveBackgroundLogFile(args)}`);
  }
  if (args.ephemeralPassword) {
    console.log("[INFO] Password: ephemeral random value for this process only (not printed)");
  }
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

function resolveBackgroundLogFile(args) {
  return resolve(repoRoot, args.logFile || `.dev-lab/mac-host/lan-dual-mac-host-${args.port}.log`);
}

function openBackgroundLog(args) {
  const logFile = resolveBackgroundLogFile(args);
  mkdirSync(dirname(logFile), { recursive: true });
  const fd = openSync(logFile, "a");
  writeSync(
    fd,
    `\n[${new Date().toISOString()}] start-mac-host --background launching port=${args.port} build=${args.buildId} inputMode=${args.inputMode}\n`,
  );
  return { fd, logFile };
}

function spawnHost(env, launch = {}) {
  return spawn("swift", ["run", "--package-path", macHostPath, "lan-dual-mac-host"], {
    cwd: repoRoot,
    env,
    detached: launch.background === true,
    stdio: launch.background ? ["ignore", launch.logFd, launch.logFd] : "inherit",
  });
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);

  if (args.stop) {
    const result = await stopHost(args);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (args.status) {
    const status = await printStatus(args);
    process.exitCode = status.online ? 0 : 1;
    return;
  }

  assertInjectUserConfirmation(args);
  await preparePassword(args);
  const env = makeLaunchEnv(args);
  printLaunchPlan(args);
  if (args.dryRun) {
    console.log("[OK] Dry run finished; Mac host was not started.");
    return;
  }

  await assertNoExistingHost(args);

  console.log("[INFO] Starting Mac host...");
  let backgroundLog = null;
  if (args.background) {
    backgroundLog = openBackgroundLog(args);
  }
  const child = spawnHost(env, {
    background: args.background,
    logFd: backgroundLog?.fd,
  });
  if (backgroundLog) {
    closeSync(backgroundLog.fd);
  }
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
  if (!runtimeCheckPassed && (args.requireRuntimeCheck || args.background)) {
    stop();
    process.exitCode = 1;
    return;
  }
  if (args.background) {
    child.unref();
    console.log(`[OK] Mac host is running in background: pid=${child.pid} log=${backgroundLog?.logFile || resolveBackgroundLogFile(args)}`);
    return;
  }
  console.log("[OK] Mac host is running. Press Ctrl+C to stop it.");

  await childExit;
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`);
  process.exitCode = 1;
});
