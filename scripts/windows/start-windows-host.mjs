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
const hostRuntimePaths = [
  "apps/windows-host/package.json",
  "apps/windows-host/server.mjs",
  "apps/windows-host/src",
];

const defaults = {
  host: process.env.LAN_DUAL_HOST || "0.0.0.0",
  port: Number(process.env.LAN_DUAL_PORT) || 43770,
  password: "",
  screenMode: process.env.LAN_DUAL_WINDOWS_SCREEN_MODE || "",
  h264Encoder: process.env.LAN_DUAL_WINDOWS_H264_ENCODER || "",
  wgcHelper: process.env.LAN_DUAL_WINDOWS_WGC_HELPER || "",
  wgcH264Bridge: ["1", "true", "yes", "on"].includes(String(process.env.LAN_DUAL_WINDOWS_WGC_H264_BRIDGE || "").trim().toLowerCase()),
  wgcH264Source: process.env.LAN_DUAL_WINDOWS_WGC_H264_SOURCE || "",
  wgcRepeatLastFrame: ["1", "true", "yes", "on"].includes(String(process.env.LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME || "").trim().toLowerCase()),
  wgcRepeatLastFrameMode: process.env.LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME_MODE || "",
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
  status: false,
  boardSummary: false,
  json: false,
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
      key === "wgcH264Bridge" ||
      key === "wgcRepeatLastFrame" ||
      key === "status" ||
      key === "boardSummary" ||
      key === "json" ||
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
  args.h264Encoder = String(args.h264Encoder || "").trim().toLowerCase();
  args.wgcHelper = String(args.wgcHelper || "").trim();
  args.wgcH264Bridge = Boolean(args.wgcH264Bridge);
  args.wgcH264Source = normalizeMode(args.wgcH264Source, ["jpeg", "raw-bgra", "bgra", "raw", "nv12", "raw-nv12", "raw_nv12", "yuv", "yuv420"], "");
  if (args.wgcH264Source === "bgra" || args.wgcH264Source === "raw") {
    args.wgcH264Source = "raw-bgra";
  }
  if (args.wgcH264Source === "raw-nv12" || args.wgcH264Source === "raw_nv12" || args.wgcH264Source === "yuv" || args.wgcH264Source === "yuv420") {
    args.wgcH264Source = "nv12";
  }
  args.wgcRepeatLastFrame = Boolean(args.wgcRepeatLastFrame);
  args.wgcRepeatLastFrameMode = normalizeMode(args.wgcRepeatLastFrameMode, ["full", "signal"], "");
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
  --h264Encoder <name>    Optional FFmpeg H.264 encoder, for example h264_nvenc
  --wgcHelper <path>      Native Windows Graphics Capture helper executable
  --wgcH264Bridge         In WGC mode, encode helper JPEG frames through FFmpeg H.264
  --wgcH264Source <src>   jpeg | raw-bgra | nv12. Default: LAN_DUAL_WINDOWS_WGC_H264_SOURCE or jpeg
  --wgcRepeatLastFrame    In WGC mode, repeat the last helper frame for steady pacing
  --wgcRepeatLastFrameMode <mode>  full | signal
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
  --status                Print current /discovery runtime status and stale-build source diff,
                          then exit without starting.
  --boardSummary          With --status, print a short secret-free Agent Link Board summary.
  --json                  With --status, print pure machine-readable JSON.
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

function getChangedHostRuntimeFiles(fromBuildId, toBuildId) {
  const from = String(fromBuildId || "").trim();
  const to = String(toBuildId || "HEAD").trim() || "HEAD";
  if (!from) return null;

  const revParse = spawnSync("git", ["rev-parse", "--verify", "--quiet", `${from}^{commit}`], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 3000,
    windowsHide: true,
  });
  if (revParse.status !== 0) return null;

  const diff = spawnSync("git", ["diff", "--name-only", `${from}..${to}`, "--", ...hostRuntimePaths], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 3000,
    windowsHide: true,
  });
  if (diff.status !== 0) return null;

  return String(diff.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function inspectBuildDiff(fromBuildId, toBuildId) {
  const from = String(fromBuildId || "").trim();
  const to = String(toBuildId || "").trim();
  if (!from || !to || from === to) {
    return null;
  }
  const changedHostFiles = getChangedHostRuntimeFiles(fromBuildId, toBuildId);
  if (!Array.isArray(changedHostFiles)) {
    return {
      fromBuildId: from,
      toBuildId: to,
      checked: false,
      changed: null,
      changedFiles: [],
      message: `Could not inspect Windows host runtime changes since ${from}; old build is not available in local git history.`,
    };
  }
  if (changedHostFiles.length === 0) {
    return {
      fromBuildId: from,
      toBuildId: to,
      checked: true,
      changed: false,
      changedFiles: [],
      message: `No Windows host runtime source changes since ${from}; the running service behavior is likely current, but build metadata is stale.`,
    };
  }
  return {
    fromBuildId: from,
    toBuildId: to,
    checked: true,
    changed: true,
    changedFiles: changedHostFiles,
    message: `Windows host runtime source changed since ${from}.`,
  };
}

function printBuildMismatchStatus(fromBuildId, toBuildId, buildDiff = inspectBuildDiff(fromBuildId, toBuildId)) {
  console.log(`[WARN] Running Windows host build ${fromBuildId} differs from current git ${toBuildId}; restart if you need the latest build.`);
  if (!buildDiff) return;
  if (!buildDiff.checked) {
    console.log(`[INFO] ${buildDiff.message}`);
    return;
  }
  if (!buildDiff.changed) {
    console.log(`[INFO] ${buildDiff.message}`);
    return;
  }
  const shown = buildDiff.changedFiles.slice(0, 4).join(", ");
  const more = buildDiff.changedFiles.length > 4 ? ` (+${buildDiff.changedFiles.length - 4} more)` : "";
  console.log(`[WARN] Windows host runtime source changed since ${fromBuildId}: ${shown}${more}`);
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
  if (value === undefined || value === null || value === "") return "unknown";
  return String(value);
}

function compactText(value, maxLength = 140) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function statusProbeHost(args) {
  return args.host === "0.0.0.0" || args.host === "::" ? "127.0.0.1" : args.host;
}

function discoveryRuntimeSummary(runtime = {}) {
  const parts = [];
  if (runtime.processId) parts.push(`pid=${runtime.processId}`);
  if (runtime.buildId) parts.push(`build=${runtime.buildId}`);
  if (runtime.uptimeSeconds !== undefined) parts.push(`uptime=${runtime.uptimeSeconds}s`);
  if (runtime.startedAt) parts.push(`startedAt=${runtime.startedAt}`);
  return parts.length > 0 ? parts.join(" ") : "runtime=missing";
}

function discoveryScreenSummary(discovery) {
  const screen = discovery?.capabilities?.screen || {};
  const wgc = screen.wgc || {};
  const parts = [
    `mode=${statusValue(screen.mode)}`,
    `requested=${statusValue(screen.requestedMode)}`,
    `codec=${statusValue(screen.videoCodec)}`,
    `encoding=${statusValue(screen.videoEncoding)}`,
  ];
  if (screen.capturePipeline) parts.push(`pipeline=${screen.capturePipeline}`);
  if (screen.codecString) parts.push(`codecString=${screen.codecString}`);
  if (screen.h264Encoder) parts.push(`h264Encoder=${screen.h264Encoder}`);
  if (wgc.backendImplemented !== undefined || wgc.supported !== undefined || wgc.active !== undefined) {
    const wgcState = wgc.active
      ? "active"
      : wgc.backendImplemented
        ? "implemented"
        : wgc.supported
          ? "supported"
          : "off";
    parts.push(`wgc=${wgcState}`);
  }
  if (screen.displays?.length) parts.push(`displays=${screen.displays.length}`);
  return parts.join(" ");
}

function discoveryAudioSummary(discovery) {
  const audio = discovery?.capabilities?.audio || {};
  const parts = [
    `mode=${statusValue(audio.mode)}`,
    `backend=${statusValue(audio.backend)}`,
    `realPcm=${audio.mockFrames === false ? "on" : "off"}`,
  ];
  if (audio.sampleRate) parts.push(`sampleRate=${audio.sampleRate}`);
  if (audio.channels) parts.push(`channels=${audio.channels}`);
  if (audio.queueFrames) parts.push(`queueFrames=${audio.queueFrames}`);
  if (audio.configuredDevice) parts.push(`device=${compactText(audio.configuredDevice, 60)}`);
  return parts.join(" ");
}

function discoveryInputSummary(discovery) {
  const input = discovery?.capabilities?.input || {};
  return [
    `mode=${statusValue(input.mode)}`,
    `backend=${statusValue(input.backend)}`,
    `helper=${statusValue(input.helper)}`,
  ].join(" ");
}

function discoveryClipboardSummary(discovery) {
  const capabilities = discovery?.capabilities || {};
  const clipboard = capabilities.clipboard || {};
  return [
    `text=${statusValue(capabilities.clipboardText ?? clipboard.text)}`,
    `textMode=${statusValue(capabilities.clipboardTextMode ?? clipboard.textMode)}`,
    `file=${statusValue(capabilities.clipboardFile ?? clipboard.file)}`,
    `fileMode=${statusValue(capabilities.clipboardFileMode ?? clipboard.fileMode)}`,
  ].join(" ");
}

function discoveryClipboardStatus(discovery) {
  const capabilities = discovery?.capabilities || {};
  const clipboard = capabilities.clipboard || {};
  return {
    text: Boolean(capabilities.clipboardText ?? clipboard.text),
    textMode: capabilities.clipboardTextMode ?? clipboard.textMode ?? "",
    file: Boolean(capabilities.clipboardFile ?? clipboard.file),
    fileMode: capabilities.clipboardFileMode ?? clipboard.fileMode ?? "",
    backend: clipboard.backend ?? "",
  };
}

function macReadinessCommand(host, port) {
  return `node scripts/mac/check-mac-client-readiness.mjs --host ${host} --port ${port} --checkBoard --boardSummary`;
}

function macFormalCommand(host, port) {
  return `node scripts/mac/check-mac-client-formal-status.mjs --host ${host} --port ${port} --boardSummary`;
}

function macFormalSendCallCommand(host, port) {
  return `node scripts/mac/check-mac-client-formal-status.mjs --host ${host} --port ${port} --sendCall`;
}

function macReadinessTargets(status) {
  const port = status.device?.controlPort || status.probe?.port || defaults.port;
  const lanHosts = Array.isArray(status.lanAddresses)
    ? status.lanAddresses.map((entry) => entry.address).filter(Boolean)
    : [];
  const probeHost = status.probe?.host || "";
  const fallbackHosts = probeHost && !["0.0.0.0", "::"].includes(probeHost) ? [probeHost] : [];
  return [...new Set([...lanHosts, ...fallbackHosts])].map((host) => ({
    host,
    port,
    command: macReadinessCommand(host, port),
    readinessCommand: macReadinessCommand(host, port),
    formalCommand: macFormalCommand(host, port),
    sendCallCommand: macFormalSendCallCommand(host, port),
  }));
}

function makeBoardSummary(status) {
  if (!status.ok) {
    return `Windows host readiness: offline ${status.probe.host}:${status.probe.port}; start safely with ${status.suggestions[0] || "node scripts/windows/start-windows-host.mjs --promptPassword --requirePassword"}. Do not send passwords on Agent Link Board.`;
  }
  const targets = macReadinessTargets(status);
  const targetText = targets.length > 0
    ? targets.map((target) => `${target.host}:${target.port}`).join(", ")
    : "no LAN IPv4 target";
  const screen = status.capabilities?.screen || {};
  const audio = status.capabilities?.audio || {};
  const input = status.capabilities?.input || {};
  const clipboard = status.capabilities?.clipboard || {};
  const next = targets[0]?.formalCommand || targets[0]?.command || "Mac should rerun readiness after a LAN IPv4 address is available.";
  const readiness = targets[0]?.command ? ` Readiness: ${targets[0].command}.` : "";
  const sendCall = targets[0]?.sendCallCommand ? ` SendCall when ready: ${targets[0].sendCallCommand}.` : "";
  return `Windows host readiness: online targets=${targetText}; runtimeBuild=${status.runtime?.buildId || "unknown"}; screen=${screen.capturePipeline || screen.mode || "unknown"} codec=${screen.videoCodec || "unknown"} transport=${screen.videoTransport || "unknown"}; audio=${audio.mode || audio.backend || "unknown"}; input=${input.mode || "unknown"}; clipboard=text:${clipboard.text ? "on" : "off"} file:${clipboard.file ? "on" : "off"}. Mac next: ${next}.${readiness}${sendCall} Do not send passwords on Agent Link Board.`;
}

function applyDiscoveryStatus(status, discovery, args) {
  const runtime = discovery.runtime || {};
  status.ok = true;
  status.device = {
    type: discovery.type || "",
    deviceId: discovery.deviceId || "",
    deviceName: discovery.deviceName || discovery.hostName || discovery.name || "Windows host",
    platform: discovery.platform || "windows",
    role: discovery.role || "host",
    host: discovery.host || "",
    port: discovery.port || args.port,
    controlPort: discovery.controlPort || discovery.port || args.port,
    lastSeenAt: discovery.lastSeenAt || "",
  };
  status.runtime = runtime;
  status.capabilities = {
    screen: discovery?.capabilities?.screen || {},
    audio: discovery?.capabilities?.audio || {},
    input: discovery?.capabilities?.input || {},
    clipboard: discoveryClipboardStatus(discovery),
    reverseControl: Boolean(discovery?.capabilities?.reverseControl),
    mock: Boolean(discovery?.capabilities?.mock),
  };
  const screen = discovery?.capabilities?.screen || {};
  const wgcFallbackReason = screen.wgc?.fallbackReason || screen.wgcFallbackReason || "";
  if (wgcFallbackReason) {
    status.warnings.push(`WGC fallback: ${compactText(wgcFallbackReason)}`);
  }
  if (screen.lastCaptureError) {
    status.warnings.push(`Last capture error: ${compactText(screen.lastCaptureError)}`);
  }
  if (status.lanAddresses.length === 0) {
    status.warnings.push("No LAN IPv4 address was detected. Mac may not be able to connect yet.");
  }

  if (runtime.buildId && args.buildId && runtime.buildId !== args.buildId) {
    status.buildDiff = inspectBuildDiff(runtime.buildId, args.buildId);
    status.warnings.push(`Running Windows host build ${runtime.buildId} differs from current git ${args.buildId}; restart if you need the latest build.`);
  }
  status.macClientReadinessCommands = macReadinessTargets(status);
  status.boardSummary = makeBoardSummary(status);
  return status;
}

function makeStatusShell(args, probeHost = statusProbeHost(args)) {
  return {
    ok: false,
    probe: {
      host: probeHost,
      port: args.port,
      url: `http://${probeHost}:${args.port}/discovery`,
    },
    currentBuildId: args.buildId,
    device: null,
    runtime: null,
    capabilities: null,
    lanAddresses: getLanAddresses(),
    buildDiff: null,
    macClientReadinessCommands: [],
    boardSummary: "",
    warnings: [],
    suggestions: [],
    error: null,
  };
}

async function getStatus(args) {
  const probeHost = statusProbeHost(args);
  const status = makeStatusShell(args, probeHost);

  try {
    const discovery = await requestJson(status.probe.url, Math.min(args.timeoutMs, 3000));
    return applyDiscoveryStatus(status, discovery, args);
  } catch (error) {
    status.error = {
      message: error.message,
    };
    status.suggestions = [
      "node scripts/windows/start-windows-host.mjs --promptPassword --requirePassword",
      "Add --wasapi when Mac should receive Windows system sound.",
    ];
    status.macClientReadinessCommands = [];
    status.boardSummary = makeBoardSummary(status);
    return status;
  }
}

async function printStatus(args) {
  const status = await getStatus(args);
  if (args.json) {
    console.log(JSON.stringify(status, null, 2));
    return status.ok;
  }

  if (args.boardSummary) {
    console.log(status.boardSummary);
    return status.ok;
  }

  console.log(`[INFO] Windows host status probe: ${status.probe.host}:${status.probe.port}`);
  if (status.ok) {
    console.log(`[OK] /discovery online: ${status.device?.deviceName || "Windows host"} · ${discoveryRuntimeSummary(status.runtime || {})}`);
    const discoveryLike = { capabilities: {
      screen: status.capabilities?.screen || {},
      audio: status.capabilities?.audio || {},
      input: status.capabilities?.input || {},
      clipboardText: status.capabilities?.clipboard?.text,
      clipboardTextMode: status.capabilities?.clipboard?.textMode,
      clipboardFile: status.capabilities?.clipboard?.file,
      clipboardFileMode: status.capabilities?.clipboard?.fileMode,
      clipboard: status.capabilities?.clipboard || {},
    } };
    console.log(`[INFO] Screen: ${discoveryScreenSummary(discoveryLike)}`);
    console.log(`[INFO] Audio: ${discoveryAudioSummary(discoveryLike)}`);
    console.log(`[INFO] Input: ${discoveryInputSummary(discoveryLike)}`);
    console.log(`[INFO] Clipboard: ${discoveryClipboardSummary(discoveryLike)}`);
    for (const warning of status.warnings.filter((line) => !line.startsWith("Running Windows host build "))) {
      console.log(`[WARN] ${warning}`);
    }
    if (status.lanAddresses.length > 0) {
      for (const entry of status.lanAddresses) {
        console.log(`[OK] Mac side can try: ${entry.address}:${status.probe.port} (${entry.name})`);
      }
    } else {
      console.log("[WARN] No LAN IPv4 address was detected. Mac may not be able to connect yet.");
    }
    if (status.macClientReadinessCommands.length > 0) {
      console.log(`[INFO] Mac readiness command: ${status.macClientReadinessCommands[0].command}`);
      if (status.macClientReadinessCommands[0].formalCommand) {
        console.log(`[INFO] Mac formal checklist command: ${status.macClientReadinessCommands[0].formalCommand}`);
      }
      if (status.macClientReadinessCommands[0].sendCallCommand) {
        console.log(`[INFO] Mac formal send-call command: ${status.macClientReadinessCommands[0].sendCallCommand}`);
      }
      console.log("[INFO] Board summary: node scripts/windows/start-windows-host.mjs --status --boardSummary");
    }
    if (status.buildDiff) {
      printBuildMismatchStatus(status.buildDiff.fromBuildId, status.buildDiff.toBuildId, status.buildDiff);
    }
    return true;
  }

  console.log(`[WARN] /discovery offline on ${status.probe.host}:${status.probe.port}: ${status.error?.message || "unknown error"}`);
  console.log(`[INFO] Start safely with: ${status.suggestions[0]}`);
  console.log(`[INFO] ${status.suggestions[1]}`);
  return false;
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
  if (args.h264Encoder) env.LAN_DUAL_WINDOWS_H264_ENCODER = args.h264Encoder;
  if (args.wgcHelper) env.LAN_DUAL_WINDOWS_WGC_HELPER = args.wgcHelper;
  if (args.wgcH264Bridge) env.LAN_DUAL_WINDOWS_WGC_H264_BRIDGE = "1";
  if (args.wgcH264Source) env.LAN_DUAL_WINDOWS_WGC_H264_SOURCE = args.wgcH264Source;
  if (args.wgcRepeatLastFrame) env.LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME = "1";
  if (args.wgcRepeatLastFrameMode) env.LAN_DUAL_WINDOWS_WGC_REPEAT_LAST_FRAME_MODE = args.wgcRepeatLastFrameMode;
  if (args.audioMode) env.LAN_DUAL_WINDOWS_AUDIO_MODE = args.audioMode;
  if (args.inputMode) env.LAN_DUAL_WINDOWS_INPUT_MODE = args.inputMode;
  if (args.ffmpeg) env.LAN_DUAL_FFMPEG = args.ffmpeg;
  return env;
}

function printLaunchPlan(args) {
  const lanAddresses = getLanAddresses();
  console.log(`[INFO] Windows host bind: ${args.host}:${args.port}`);
  console.log(`[INFO] Build ID: ${args.buildId}`);
  if (args.h264Encoder) {
    console.log(`[INFO] H.264 encoder: ${args.h264Encoder}`);
  }
  if (args.wgcHelper) {
    console.log(`[INFO] WGC helper: ${args.wgcHelper}`);
  }
  if (args.wgcH264Bridge) {
    console.log(`[INFO] WGC H.264 bridge: enabled`);
    console.log(`[INFO] WGC H.264 source: ${args.wgcH264Source || "jpeg"}`);
  }
  if (args.wgcRepeatLastFrame) {
    console.log(`[INFO] WGC repeat-last-frame: ${args.wgcRepeatLastFrameMode || "full"}`);
  }
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

function printMacNextSteps(status) {
  const firstTarget = status.macClientReadinessCommands[0] || null;
  if (firstTarget?.command) {
    console.log(`[INFO] Mac readiness command: ${firstTarget.command}`);
  }
  if (firstTarget?.formalCommand) {
    console.log(`[INFO] Mac formal checklist command: ${firstTarget.formalCommand}`);
  }
  if (firstTarget?.sendCallCommand) {
    console.log(`[INFO] Mac formal send-call command: ${firstTarget.sendCallCommand}`);
  }
  if (status.boardSummary) {
    console.log(`[INFO] Agent Link Board summary: ${status.boardSummary}`);
  }
  for (const warning of status.warnings.filter(Boolean)) {
    console.log(`[WARN] ${warning}`);
  }
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

  if (args.status) {
    const online = await printStatus(args);
    process.exitCode = online ? 0 : 1;
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
    const status = applyDiscoveryStatus(makeStatusShell(args), discovery, args);
    printMacNextSteps(status);
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
