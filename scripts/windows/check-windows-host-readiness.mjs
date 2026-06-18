import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultWindowsFfmpeg = "C:\\DevTools\\ffmpeg\\bin\\ffmpeg.exe";

const defaults = {
  profile: "default",
  host: "0.0.0.0",
  port: 43770,
  timeoutMs: 20000,
  maxVideoFrameAgeMs: 1000,
  maxAudioFrameAgeMs: 1000,
  ffmpeg: process.env.LAN_DUAL_FFMPEG || "",
  requireWgc: false,
  probeHost: false,
  probeAudio: false,
  probeMedia: false,
  probeVideo: false,
  probeClipboardSecurity: false,
  probeWgcH264Sources: false,
  expectBuildId: "",
  requireCurrentBuildId: false,
  skipCurrentBuildCheck: false,
  requireOpen: false,
  strict: false,
  server: "http://192.168.31.68:17888",
  checkBoard: false,
  boardSummary: false,
  json: false,
};

function booleanArg(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

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
      key === "probeHost" ||
      key === "probeAudio" ||
      key === "probeMedia" ||
      key === "probeVideo" ||
      key === "probeClipboardSecurity" ||
      key === "probeWgcH264Sources" ||
      key === "requireWgc" ||
      key === "requireCurrentBuildId" ||
      key === "skipCurrentBuildCheck" ||
      key === "requireOpen" ||
      key === "strict" ||
      key === "checkBoard" ||
      key === "boardSummary" ||
      key === "json"
    ) {
      args[key] = true;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(args, key) && next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    }
  }

  args.profile = normalizeProfile(args.profile);
  applyProfile(args);
  args.port = Number(args.port) || defaults.port;
  args.timeoutMs = Math.max(3000, Number(args.timeoutMs) || defaults.timeoutMs);
  args.maxVideoFrameAgeMs = Math.max(0, Number(args.maxVideoFrameAgeMs) || 0);
  args.maxAudioFrameAgeMs = Math.max(0, Number(args.maxAudioFrameAgeMs) || 0);
  args.host = String(args.host || defaults.host).trim();
  args.ffmpeg = resolveFfmpegCommand(String(args.ffmpeg || "").trim());
  args.requireWgc = booleanArg(args.requireWgc);
  args.probeHost = booleanArg(args.probeHost);
  args.probeAudio = booleanArg(args.probeAudio);
  args.probeMedia = booleanArg(args.probeMedia);
  args.probeVideo = booleanArg(args.probeVideo);
  args.probeClipboardSecurity = booleanArg(args.probeClipboardSecurity);
  args.probeWgcH264Sources = booleanArg(args.probeWgcH264Sources);
  args.expectBuildId = String(args.expectBuildId || "").trim();
  args.currentBuildId = getGitBuildId();
  args.requireCurrentBuildId = booleanArg(args.requireCurrentBuildId);
  args.skipCurrentBuildCheck = booleanArg(args.skipCurrentBuildCheck);
  args.requireOpen = booleanArg(args.requireOpen);
  args.strict = booleanArg(args.strict);
  args.server = String(args.server || defaults.server).trim();
  args.checkBoard = booleanArg(args.checkBoard);
  args.boardSummary = booleanArg(args.boardSummary);
  args.json = booleanArg(args.json);
  return args;
}

function normalizeProfile(value) {
  const profile = String(value || defaults.profile).trim().toLowerCase();
  if (profile === "deploy" || profile === "deep" || profile === "default") {
    return profile;
  }
  throw new Error(`Unknown readiness profile: ${value}. Expected default, deploy, or deep.`);
}

function applyProfile(args) {
  if (args.profile === "default") {
    return;
  }

  args.strict = true;
  args.requireOpen = true;
  args.requireCurrentBuildId = true;
  args.probeVideo = true;
  args.probeAudio = true;

  if (args.profile === "deep") {
    args.probeHost = true;
    args.probeClipboardSecurity = true;
  }
}

function printHelp() {
  console.log(`Usage: node scripts/windows/check-windows-host-readiness.mjs [options]

Runs a low-risk Windows host readiness check for local LAN reverse-control work.
Default checks are read-only: syntax, FFmpeg availability, LAN/firewall state,
audio device listing, WASAPI format, Windows Graphics Capture preflight, and
safe input helper dry-run.

Options:
  --profile <name>    Preset: default, deploy, deep. Default keeps low-risk checks.
  --host <host>       Windows host bind/probe host. Default: 0.0.0.0
  --port <port>       Windows host port. Default: 43770
  --ffmpeg <path>     FFmpeg path. Auto-detects C:\\DevTools\\ffmpeg\\bin\\ffmpeg.exe
  --maxVideoFrameAgeMs <ms>  Video probe frame freshness limit. 0 disables. Default: 1000
  --maxAudioFrameAgeMs <ms>  Audio probe frame freshness limit. 0 disables. Default: 1000
  --requireWgc        Fail when Windows Graphics Capture preflight is unsupported.
  --probeHost         Run Windows host PowerShell self-test.
  --probeMedia        Run one combined Windows host video + audio media baseline.
  --probeVideo        Run short Windows host video observer.
  --probeAudio        Run short WASAPI audio observer. Does not play a tone.
  --probeClipboardSecurity
                       Run the Windows host file clipboard WebSocket abuse regression.
  --probeWgcH264Sources
                       Run short WGC H.264 raw-bgra vs NV12 source comparison.
  --expectBuildId <id>      Require running host runtime.buildId to equal this value.
  --requireCurrentBuildId   Require running host runtime.buildId to match current git short hash.
  --skipCurrentBuildCheck   Do not warn when running host build differs from current git.
  --requireOpen       Require LAN/firewall port probe to be open.
  --strict            Treat warnings as failure.
  --server <url>      Agent Link Board URL. Default: ${defaults.server}
  --checkBoard        Read one Agent Link Board /api/state snapshot and surface
                      active Mac -> Windows currentCall.
  --boardSummary      Print a short secret-free Agent Link Board summary.
  --json              Print machine-readable JSON summary.
  --help, -h          Show this help without running checks.

Profiles:
  default             Low-risk checks only; no running host required.
  deploy              Require the configured port/current build, strict mode, plus video/audio probes.
  deep                deploy profile plus Windows host self-test and file clipboard security regression.
                      WGC H.264 source comparison stays explicit via --probeWgcH264Sources.
`);
}

function resolveFfmpegCommand(value) {
  if (value) return value;
  if (process.platform === "win32" && existsSync(defaultWindowsFfmpeg)) {
    return defaultWindowsFfmpeg;
  }
  return "ffmpeg";
}

function getGitBuildId() {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 3000,
    windowsHide: true,
  });
  if (result.status !== 0) return "";
  return String(result.stdout || "").trim();
}

function print(kind, text, args) {
  if (args.json || args.boardSummary) return;
  console.log(`[${kind}] ${text}`);
}

function stripAnsi(text) {
  return String(text || "").replace(/\u001b\[[0-9;]*m/g, "");
}

function compactText(value, maxLength = 360) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function splitLines(text) {
  return stripAnsi(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isActiveCallStatus(status) {
  const normalized = normalizedText(status).toLowerCase();
  if (!normalized) return true;
  return !["done", "complete", "completed", "clear", "cleared", "cancelled", "canceled", "idle", "resolved", "closed"].includes(normalized);
}

function isWindowsText(text) {
  return /windows|Windows Codex|Windows 端|Windows host|windows-host|start-windows-host/i.test(String(text || ""));
}

function isMacText(text) {
  return /mac|macOS|Mac Codex|Mac 端/i.test(String(text || ""));
}

function normalizeBoardCurrentCall(call) {
  if (!call || typeof call !== "object") {
    return {
      present: false,
      active: false,
      summary: "none",
    };
  }
  const parsed = {
    present: true,
    status: normalizedText(call.status),
    from: normalizedText(call.from),
    need: normalizedText(call.need),
    goal: normalizedText(call.goal),
    environment: normalizedText(call.environment),
    connection: normalizedText(call.connection),
    command: normalizedText(call.command),
    expected: normalizedText(call.expected),
    actual: normalizedText(call.actual),
    ask: normalizedText(call.ask),
    blockedBy: normalizedText(call.blockedBy),
    startedAt: normalizedText(call.startedAt),
    updatedAt: normalizedText(call.updatedAt),
    active: false,
    needsWindows: false,
    fromMacSide: false,
    summary: "",
  };
  const text = [
    parsed.goal,
    parsed.environment,
    parsed.connection,
    parsed.command,
    parsed.expected,
    parsed.actual,
    parsed.ask,
    parsed.blockedBy,
  ].join("\n");
  parsed.active = isActiveCallStatus(parsed.status);
  parsed.needsWindows = isWindowsText(parsed.need) || isWindowsText(text);
  parsed.fromMacSide = isMacText(parsed.from) || isMacText(text);
  const direction = [parsed.from || "unknown", parsed.need || "unknown"].join("->");
  parsed.summary = `${parsed.status || "CALL"} ${direction}${parsed.goal ? ` ${parsed.goal}` : ""}`;
  return parsed;
}

async function getBoardSnapshot(args) {
  if (!args.checkBoard) {
    return {
      requested: false,
      ok: null,
      status: null,
      currentCall: {
        present: false,
        active: false,
        summary: "not checked",
      },
      error: "",
    };
  }

  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(args.timeoutMs, 5000), 30000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL("/api/state", args.server), {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(process.env.CODEX_LINK_TOKEN ? { "X-Codex-Link-Token": process.env.CODEX_LINK_TOKEN } : {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        requested: true,
        ok: false,
        status: response.status,
        currentCall: normalizeBoardCurrentCall(null),
        error: `${response.status}: ${text}`,
      };
    }
    const state = text ? JSON.parse(text) : {};
    return {
      requested: true,
      ok: true,
      status: response.status,
      currentCall: normalizeBoardCurrentCall(state.currentCall),
      error: "",
    };
  } catch (error) {
    return {
      requested: true,
      ok: false,
      status: null,
      currentCall: normalizeBoardCurrentCall(null),
      error: error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function runCommand(label, command, commandArgs, options = {}) {
  const startedAt = Date.now();
  const normalized = normalizeCommand(command, commandArgs);
  const child = spawn(normalized.command, normalized.args, {
    cwd: options.cwd || repoRoot,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
    shell: false,
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  return new Promise((resolveRun) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolveRun(result);
    };
    const timeoutMs = options.timeoutMs || 20000;
    const timer = setTimeout(() => {
      child.kill();
      finish({
        label,
        ok: false,
        timedOut: true,
        exitCode: null,
        elapsedMs: Date.now() - startedAt,
        command: [normalized.command, ...normalized.args].join(" "),
        stdout,
        stderr,
        summary: `${label} timed out after ${timeoutMs} ms`,
        warnings: [],
        errors: [`${label} timed out after ${timeoutMs} ms`],
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        label,
        ok: false,
        timedOut: false,
        exitCode: null,
        elapsedMs: Date.now() - startedAt,
        command: [normalized.command, ...normalized.args].join(" "),
        stdout,
        stderr,
        summary: error.message,
        warnings: [],
        errors: [error.message],
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const output = `${stdout}\n${stderr}`;
      const warnings = filterExpectedWarnings(label, collectLines(output, "[WARN]"));
      finish({
        label,
        ok: exitCode === 0,
        timedOut: false,
        exitCode,
        elapsedMs: Date.now() - startedAt,
        command: [normalized.command, ...normalized.args].join(" "),
        stdout,
        stderr,
        summary: summarizeOutput(output),
        warnings,
        errors: collectLines(output, "[ERROR]").concat(exitCode === 0 ? [] : collectLines(output, "[FAIL]")),
      });
    });
  });
}

function normalizeCommand(command, commandArgs) {
  if (process.platform !== "win32" || !/\.(cmd|bat)$/i.test(command)) {
    return { command, args: commandArgs };
  }
  const commandLine = [quoteCmd(command), ...commandArgs.map(quoteCmd)].join(" ");
  return {
    command: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", commandLine],
  };
}

function quoteCmd(value) {
  const text = String(value);
  if (!/[\s"&<>|^]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '\\"')}"`;
}

function summarizeOutput(text) {
  const lines = splitLines(text);
  const ffmpegVersion = lines.find((line) => line.toLowerCase().startsWith("ffmpeg version"));
  if (ffmpegVersion) return ffmpegVersion.split(" Copyright ")[0];
  const okLines = lines.filter((line) => line.startsWith("[OK]"));
  const passedLines = okLines.filter((line) => /passed/i.test(line));
  const priority =
    passedLines.at(-1) ||
    okLines.at(-1) ||
    lines.find((line) => line.startsWith("[INFO]"));
  return priority || lines.at(-1) || "";
}

function collectLines(text, marker) {
  return splitLines(text).filter((line) => line.startsWith(marker));
}

function normalizeDiscoveryHost(host) {
  const normalized = String(host || "").trim();
  if (!normalized || normalized === "0.0.0.0" || normalized === "::") {
    return "127.0.0.1";
  }
  return normalized;
}

function parseJsonOutput(text, label) {
  try {
    return JSON.parse(String(text || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}`);
  }
}

function normalizeRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") return {};
  return {
    processId: runtime.processId == null ? "" : String(runtime.processId),
    startedAt: runtime.startedAt == null ? "" : String(runtime.startedAt),
    uptimeSeconds: Number.isFinite(Number(runtime.uptimeSeconds))
      ? Math.max(0, Math.floor(Number(runtime.uptimeSeconds)))
      : null,
    buildId: runtime.buildId == null ? "" : String(runtime.buildId),
  };
}

function formatRuntime(runtime) {
  const normalized = normalizeRuntime(runtime);
  const parts = [];
  if (normalized.processId) parts.push(`pid=${normalized.processId}`);
  if (normalized.buildId) parts.push(`build=${normalized.buildId}`);
  if (normalized.uptimeSeconds !== null) parts.push(`uptime=${normalized.uptimeSeconds}s`);
  return parts.length > 0 ? parts.join(" ") : "runtime=missing";
}

function reverseControlReadinessToken(reverse = {}) {
  if (!reverse || typeof reverse !== "object") return "unknown";
  if (!reverse.supported || reverse.mode === "disabled") return "disabled";
  if (reverse.grant?.active) return "temporary-grant";
  if (reverse.grant?.lastRequest?.active) return "pending-request";
  if (reverse.autoAccept || reverse.mode === "accept") return "accept-lab";
  if (reverse.mode === "deny" || reverse.requiresConfirmation) return "deny-confirm";
  return reverse.mode || "unknown";
}

function windowsReverseControlGrantCommand(port = defaults.port) {
  const safePort = Math.max(1, Math.min(65535, Number(port) || defaults.port));
  return `node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port ${safePort} --durationMs 30000 --boardSummary`;
}

function windowsReverseControlGrantPowerShellCommand(port = defaults.port) {
  const safePort = Math.max(1, Math.min(65535, Number(port) || defaults.port));
  return `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port ${safePort} -DurationMs 30000 -BoardSummary`;
}

function windowsReverseGrantStatusCommand(port = defaults.port) {
  const safePort = Math.max(1, Math.min(65535, Number(port) || defaults.port));
  return `node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port ${safePort} --status --boardSummary`;
}

function windowsReverseGrantStatusPowerShellCommand(port = defaults.port) {
  const safePort = Math.max(1, Math.min(65535, Number(port) || defaults.port));
  return `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port ${safePort} -Status -BoardSummary`;
}

function windowsOpenOneTimeReverseGrantCommand(port = defaults.port) {
  const safePort = Math.max(1, Math.min(65535, Number(port) || defaults.port));
  return `node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port ${safePort} --grant --durationMs 30000 --boardSummary`;
}

function windowsOpenOneTimeReverseGrantPowerShellCommand(port = defaults.port) {
  const safePort = Math.max(1, Math.min(65535, Number(port) || defaults.port));
  return `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port ${safePort} -Grant -DurationMs 30000 -BoardSummary`;
}

function windowsHostMediaReadinessPowerShellCommand() {
  return "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-host-readiness.ps1 -CheckBoard -ProbeMedia -BoardSummary";
}

function windowsVideoEncoderSupportCommand() {
  return "node scripts/windows/check-windows-video-encoder-support.mjs --boardSummary";
}

function windowsVideoEncoderSupportPowerShellCommand() {
  return "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-video-encoder-support.ps1 -BoardSummary";
}

function windowsWgcSupportCommand() {
  return "node scripts/windows/check-windows-wgc-support.mjs --boardSummary";
}

function windowsWgcSupportPowerShellCommand() {
  return "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-windows-wgc-support.ps1 -BoardSummary";
}

function windowsWebCodecsH264Command() {
  return "node scripts/windows/check-webcodecs-h264-support.mjs --requireCodec avc1.42C02A --boardSummary";
}

function windowsWebCodecsH264PowerShellCommand() {
  return "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/check-webcodecs-h264-support.ps1 -RequireCodec avc1.42C02A -BoardSummary";
}

function windowsWgcBenchmarkCommand() {
  return "node scripts/windows/benchmark-windows-wgc-settings.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary";
}

function windowsWgcBenchmarkPowerShellCommand() {
  return "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/benchmark-windows-wgc-settings.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary";
}

function windowsWgcCompareCommand() {
  return "node scripts/windows/compare-windows-wgc-h264-sources.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary";
}

function windowsWgcComparePowerShellCommand() {
  return "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/compare-windows-wgc-h264-sources.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary";
}

function formatCapabilities(capabilities = {}) {
  const screen = capabilities.screen || {};
  const audio = capabilities.audio || {};
  const input = capabilities.input || {};
  const clipboard = capabilities.clipboard || {};
  const reverse = capabilities.reverseControl || {};
  const parts = [
    `screen=${screen.capturePipeline || screen.mode || screen.requestedMode || "unknown"}`,
    `audio=${audio.mode || audio.backend || "unknown"}`,
    `input=${input.mode || input.backend || "unknown"}`,
    `reverse=${reverseControlReadinessToken(reverse)}`,
    `clipboard=${clipboard.text || clipboard.file ? "on" : "unknown"}`,
  ];
  return parts.join(" ");
}

function normalizeWarning(message) {
  const text = String(message || "").trim();
  if (!text) return "";
  return text.startsWith("[WARN]") ? text : `[WARN] ${text}`;
}

function buildMismatchMessage(statusPayload, runtime, args) {
  const buildDiff = statusPayload?.buildDiff || null;
  const from = buildDiff?.fromBuildId || runtime.buildId || "missing";
  const to = buildDiff?.toBuildId || args.currentBuildId || "missing";
  if (buildDiff?.checked === true && buildDiff.changed === true) {
    const files = Array.isArray(buildDiff.changedFiles) ? buildDiff.changedFiles : [];
    const shown = files.slice(0, 4).join(", ");
    const more = files.length > 4 ? ` (+${files.length - 4} more)` : "";
    return `running host build ${from} differs from current git ${to}; Windows host runtime changes since ${from}${shown ? `: ${shown}${more}` : ""}`;
  }
  if (buildDiff?.checked === true && buildDiff.changed === false) {
    return `running host build ${from} differs from current git ${to}; no Windows host runtime source changes since ${from}`;
  }
  if (buildDiff?.message) {
    return `running host build ${from} differs from current git ${to}; ${buildDiff.message}`;
  }
  return `running host build ${runtime.buildId || "missing"} differs from current git ${args.currentBuildId}`;
}

async function getStatusPayload(args) {
  const discoveryHost = normalizeDiscoveryHost(args.host);
  const statusArgs = [
    "scripts/windows/start-windows-host.mjs",
    "--status",
    "--json",
    "--host",
    discoveryHost,
    "--port",
    String(args.port),
    "--timeoutMs",
    String(Math.min(args.timeoutMs, 8000)),
  ];
  if (args.currentBuildId) {
    statusArgs.push("--buildId", args.currentBuildId);
  }

  const result = await runCommand("Windows host status helper JSON", process.execPath, statusArgs, {
    timeoutMs: Math.max(8000, Math.min(args.timeoutMs, 15000)),
  });
  const stdout = String(result.stdout || "").trim();
  if (!stdout) {
    throw new Error(`Windows host status helper printed no JSON output: ${result.summary || `exit ${result.exitCode}`}`);
  }
  return {
    payload: parseJsonOutput(stdout, "Windows host status helper"),
    result,
  };
}

async function checkRunningHostRuntime(args) {
  const startedAt = Date.now();
  const discoveryHost = normalizeDiscoveryHost(args.host);
  const warnings = [];
  const errors = [];
  let summary = "";

  try {
    const { payload: statusPayload } = await getStatusPayload(args);
    const probe = statusPayload.probe || {
      host: discoveryHost,
      port: args.port,
      url: `http://${discoveryHost}:${args.port}/discovery`,
    };
    if (statusPayload.ok !== true) {
      const message = `Windows host discovery runtime unavailable at ${probe.url || `${probe.host}:${probe.port}`}: ${statusPayload.error?.message || "offline"}`;
      if (args.requireOpen || args.expectBuildId || args.requireCurrentBuildId) {
        errors.push(message);
      } else {
        warnings.push(`[WARN] ${message}`);
      }
      return {
        label: "Windows host runtime",
        ok: errors.length === 0,
        exitCode: errors.length === 0 ? 0 : 1,
        elapsedMs: Date.now() - startedAt,
        summary: args.requireOpen ? message : "Windows host is not running; runtime check skipped",
        boardSummary: statusPayload.boardSummary || "",
        macClientReadinessCommands: statusPayload.macClientReadinessCommands || [],
        windowsHostMediaReadinessPowerShellCommand: statusPayload.windowsHostMediaReadinessPowerShellCommand || windowsHostMediaReadinessPowerShellCommand(),
        windowsReverseControlGrantCommand: statusPayload.windowsReverseControlGrantCommand || windowsReverseControlGrantCommand(args.port),
        windowsReverseControlGrantPowerShellCommand: statusPayload.windowsReverseControlGrantPowerShellCommand || windowsReverseControlGrantPowerShellCommand(args.port),
        windowsReverseGrantStatusCommand: statusPayload.windowsReverseGrantStatusCommand || windowsReverseGrantStatusCommand(args.port),
        windowsReverseGrantStatusPowerShellCommand: statusPayload.windowsReverseGrantStatusPowerShellCommand || windowsReverseGrantStatusPowerShellCommand(args.port),
        windowsOpenOneTimeReverseGrantCommand: statusPayload.windowsOpenOneTimeReverseGrantCommand || windowsOpenOneTimeReverseGrantCommand(args.port),
        windowsOpenOneTimeReverseGrantPowerShellCommand: statusPayload.windowsOpenOneTimeReverseGrantPowerShellCommand || windowsOpenOneTimeReverseGrantPowerShellCommand(args.port),
        windowsVideoEncoderSupportCommand: statusPayload.windowsVideoEncoderSupportCommand || windowsVideoEncoderSupportCommand(),
        windowsVideoEncoderSupportPowerShellCommand: statusPayload.windowsVideoEncoderSupportPowerShellCommand || windowsVideoEncoderSupportPowerShellCommand(),
        windowsWgcSupportCommand: statusPayload.windowsWgcSupportCommand || windowsWgcSupportCommand(),
        windowsWgcSupportPowerShellCommand: statusPayload.windowsWgcSupportPowerShellCommand || windowsWgcSupportPowerShellCommand(),
        windowsWebCodecsH264Command: statusPayload.windowsWebCodecsH264Command || windowsWebCodecsH264Command(),
        windowsWebCodecsH264PowerShellCommand: statusPayload.windowsWebCodecsH264PowerShellCommand || windowsWebCodecsH264PowerShellCommand(),
        windowsWgcBenchmarkCommand: statusPayload.windowsWgcBenchmarkCommand || windowsWgcBenchmarkCommand(),
        windowsWgcBenchmarkPowerShellCommand: statusPayload.windowsWgcBenchmarkPowerShellCommand || windowsWgcBenchmarkPowerShellCommand(),
        windowsWgcCompareCommand: statusPayload.windowsWgcCompareCommand || windowsWgcCompareCommand(),
        windowsWgcComparePowerShellCommand: statusPayload.windowsWgcComparePowerShellCommand || windowsWgcComparePowerShellCommand(),
        warnings,
        errors,
      };
    }

    const runtime = normalizeRuntime(statusPayload.runtime);
    const missingFields = [];
    if (!runtime.processId) missingFields.push("processId");
    if (!runtime.startedAt) missingFields.push("startedAt");
    if (runtime.uptimeSeconds == null) missingFields.push("uptimeSeconds");
    if (!runtime.buildId) missingFields.push("buildId");

    if (missingFields.length > 0) {
      const message = `discovery.runtime missing ${missingFields.join(", ")}`;
      if (args.requireOpen || args.expectBuildId || args.requireCurrentBuildId) {
        errors.push(message);
      } else {
        warnings.push(`[WARN] ${message}`);
      }
    }

    if (args.expectBuildId && runtime.buildId !== args.expectBuildId) {
      errors.push(`runtime.buildId mismatch: ${runtime.buildId || "missing"} !== ${args.expectBuildId}`);
    }

    if (args.requireCurrentBuildId && !args.currentBuildId) {
      errors.push("current git build id is unavailable");
    }
    if (args.currentBuildId && runtime.buildId && runtime.buildId !== args.currentBuildId) {
      const message = buildMismatchMessage(statusPayload, runtime, args);
      if (!args.skipCurrentBuildCheck) {
        warnings.push(`[WARN] ${message}`);
      }
      if (args.requireCurrentBuildId) {
        errors.push(message);
      }
    }
    for (const warning of statusPayload.warnings || []) {
      const normalized = normalizeWarning(warning);
      if (normalized) warnings.push(normalized);
    }

    summary = runtime.buildId || runtime.processId
      ? `${formatRuntime(runtime)} · ${formatCapabilities(statusPayload.capabilities || {})}`
      : "Windows host discovery reached; runtime missing";
    return {
      label: "Windows host runtime",
      ok: errors.length === 0,
      exitCode: errors.length === 0 ? 0 : 1,
      elapsedMs: Date.now() - startedAt,
      summary,
      boardSummary: statusPayload.boardSummary || "",
      macClientReadinessCommands: statusPayload.macClientReadinessCommands || [],
      windowsHostMediaReadinessPowerShellCommand: statusPayload.windowsHostMediaReadinessPowerShellCommand || windowsHostMediaReadinessPowerShellCommand(),
      windowsReverseControlGrantCommand: statusPayload.windowsReverseControlGrantCommand || windowsReverseControlGrantCommand(args.port),
      windowsReverseControlGrantPowerShellCommand: statusPayload.windowsReverseControlGrantPowerShellCommand || windowsReverseControlGrantPowerShellCommand(args.port),
      windowsReverseGrantStatusCommand: statusPayload.windowsReverseGrantStatusCommand || windowsReverseGrantStatusCommand(args.port),
      windowsReverseGrantStatusPowerShellCommand: statusPayload.windowsReverseGrantStatusPowerShellCommand || windowsReverseGrantStatusPowerShellCommand(args.port),
      windowsOpenOneTimeReverseGrantCommand: statusPayload.windowsOpenOneTimeReverseGrantCommand || windowsOpenOneTimeReverseGrantCommand(args.port),
      windowsOpenOneTimeReverseGrantPowerShellCommand: statusPayload.windowsOpenOneTimeReverseGrantPowerShellCommand || windowsOpenOneTimeReverseGrantPowerShellCommand(args.port),
      windowsVideoEncoderSupportCommand: statusPayload.windowsVideoEncoderSupportCommand || windowsVideoEncoderSupportCommand(),
      windowsVideoEncoderSupportPowerShellCommand: statusPayload.windowsVideoEncoderSupportPowerShellCommand || windowsVideoEncoderSupportPowerShellCommand(),
      windowsWgcSupportCommand: statusPayload.windowsWgcSupportCommand || windowsWgcSupportCommand(),
      windowsWgcSupportPowerShellCommand: statusPayload.windowsWgcSupportPowerShellCommand || windowsWgcSupportPowerShellCommand(),
      windowsWebCodecsH264Command: statusPayload.windowsWebCodecsH264Command || windowsWebCodecsH264Command(),
      windowsWebCodecsH264PowerShellCommand: statusPayload.windowsWebCodecsH264PowerShellCommand || windowsWebCodecsH264PowerShellCommand(),
      windowsWgcBenchmarkCommand: statusPayload.windowsWgcBenchmarkCommand || windowsWgcBenchmarkCommand(),
      windowsWgcBenchmarkPowerShellCommand: statusPayload.windowsWgcBenchmarkPowerShellCommand || windowsWgcBenchmarkPowerShellCommand(),
      windowsWgcCompareCommand: statusPayload.windowsWgcCompareCommand || windowsWgcCompareCommand(),
      windowsWgcComparePowerShellCommand: statusPayload.windowsWgcComparePowerShellCommand || windowsWgcComparePowerShellCommand(),
      warnings,
      errors,
    };
  } catch (error) {
    const message = `Windows host discovery runtime unavailable at http://${discoveryHost}:${args.port}/discovery: ${error.message}`;
    if (args.requireOpen || args.expectBuildId || args.requireCurrentBuildId) {
      errors.push(message);
    }
    return {
      label: "Windows host runtime",
      ok: errors.length === 0,
      exitCode: errors.length === 0 ? 0 : 1,
      elapsedMs: Date.now() - startedAt,
      summary: args.requireOpen ? message : "Windows host is not running; runtime check skipped",
      boardSummary: "",
      macClientReadinessCommands: [],
      windowsHostMediaReadinessPowerShellCommand: windowsHostMediaReadinessPowerShellCommand(),
      windowsReverseControlGrantCommand: windowsReverseControlGrantCommand(args.port),
      windowsReverseControlGrantPowerShellCommand: windowsReverseControlGrantPowerShellCommand(args.port),
      windowsReverseGrantStatusCommand: windowsReverseGrantStatusCommand(args.port),
      windowsReverseGrantStatusPowerShellCommand: windowsReverseGrantStatusPowerShellCommand(args.port),
      windowsOpenOneTimeReverseGrantCommand: windowsOpenOneTimeReverseGrantCommand(args.port),
      windowsOpenOneTimeReverseGrantPowerShellCommand: windowsOpenOneTimeReverseGrantPowerShellCommand(args.port),
      windowsVideoEncoderSupportCommand: windowsVideoEncoderSupportCommand(),
      windowsVideoEncoderSupportPowerShellCommand: windowsVideoEncoderSupportPowerShellCommand(),
      windowsWgcSupportCommand: windowsWgcSupportCommand(),
      windowsWgcSupportPowerShellCommand: windowsWgcSupportPowerShellCommand(),
      windowsWebCodecsH264Command: windowsWebCodecsH264Command(),
      windowsWebCodecsH264PowerShellCommand: windowsWebCodecsH264PowerShellCommand(),
      windowsWgcBenchmarkCommand: windowsWgcBenchmarkCommand(),
      windowsWgcBenchmarkPowerShellCommand: windowsWgcBenchmarkPowerShellCommand(),
      windowsWgcCompareCommand: windowsWgcCompareCommand(),
      windowsWgcComparePowerShellCommand: windowsWgcComparePowerShellCommand(),
      warnings,
      errors,
    };
  }
}

function makeReadinessBoardSummary(summary) {
  const runtimeResult = summary.results.find((result) => result.label === "Windows host runtime") || null;
  const wgcSourceResult = summary.results.find((result) => result.label === "Windows WGC H.264 source comparison") || null;
  const media = formatMediaBoardSummary(summary);
  const state = summary.ok ? "passed" : "failed";
  const mode = summary.strict ? "strict" : summary.args.profile;
  const activeCall = summary.board?.currentCall?.active && summary.board.currentCall.needsWindows && summary.board.currentCall.fromMacSide
    ? ` call=${compactText(summary.board.currentCall.summary, 180)}.`
    : "";
  const hasRuntimeBoardSummary = Boolean(runtimeResult?.boardSummary);
  const runtimeText = hasRuntimeBoardSummary
    ? compactText(runtimeResult.boardSummary)
    : `runtime=${compactText(runtimeResult?.summary || "not checked", 180)}`;
  let next = "";
  if (!hasRuntimeBoardSummary) {
    next = summary.macClientReadinessCommands[0]?.command
      ? `Mac next: ${summary.macClientReadinessCommands[0].command}.`
      : "Next: start Windows host safely with node scripts/windows/start-windows-host.mjs --promptPassword --requirePassword, then rerun this readiness check.";
  }
  const safety = runtimeText.includes("Do not send passwords")
    ? ""
    : " Do not send passwords on Agent Link Board.";
  const runtimeSentence = runtimeText.endsWith(".") ? runtimeText : `${runtimeText}.`;
  const reverseGrant = summary.windowsReverseControlGrantCommand && !runtimeText.includes("ReverseGrant=")
    ? ` ReverseGrant=${summary.windowsReverseControlGrantCommand}.`
    : "";
  const reverseGrantPowerShell = summary.windowsReverseControlGrantPowerShellCommand && !runtimeText.includes("ReverseGrantPs=")
    ? ` ReverseGrantPs=${summary.windowsReverseControlGrantPowerShellCommand}.`
    : "";
  const reverseGrantStatus = summary.windowsReverseGrantStatusPowerShellCommand && !runtimeText.includes("WindowsReverseGrantStatus=")
    ? ` WindowsReverseGrantStatus=${summary.windowsReverseGrantStatusPowerShellCommand}.`
    : "";
  const openOneTimeReverseGrant = summary.windowsOpenOneTimeReverseGrantPowerShellCommand && !runtimeText.includes("WindowsOpenOneTimeReverseGrant=")
    ? ` WindowsOpenOneTimeReverseGrant=${summary.windowsOpenOneTimeReverseGrantPowerShellCommand}.`
    : "";
  const reverseGrantStatusNode = summary.windowsReverseGrantStatusCommand && !runtimeText.includes("WindowsReverseGrantStatusNodeFallback=")
    ? ` WindowsReverseGrantStatusNodeFallback=${summary.windowsReverseGrantStatusCommand}.`
    : "";
  const openOneTimeReverseGrantNode = summary.windowsOpenOneTimeReverseGrantCommand && !runtimeText.includes("WindowsOpenOneTimeReverseGrantNodeFallback=")
    ? ` WindowsOpenOneTimeReverseGrantNodeFallback=${summary.windowsOpenOneTimeReverseGrantCommand}.`
    : "";
  const hostMediaPowerShell = summary.windowsHostMediaReadinessPowerShellCommand
    && (!runtimeText.includes("WindowsHostMediaPs=") || !runtimeText.includes(summary.windowsHostMediaReadinessPowerShellCommand))
    ? ` WindowsHostMediaPs=${summary.windowsHostMediaReadinessPowerShellCommand}.`
    : "";
  const videoSupport = summary.windowsVideoEncoderSupportCommand && !runtimeText.includes("WindowsVideoSupport=")
    ? ` WindowsVideoSupport=${summary.windowsVideoEncoderSupportCommand}.`
    : "";
  const videoSupportPowerShell = summary.windowsVideoEncoderSupportPowerShellCommand && !runtimeText.includes("WindowsVideoSupportPs=")
    ? ` WindowsVideoSupportPs=${summary.windowsVideoEncoderSupportPowerShellCommand}.`
    : "";
  const wgcSupport = summary.windowsWgcSupportCommand
    && (!runtimeText.includes("WindowsWgcSupport=") || !runtimeText.includes(summary.windowsWgcSupportCommand))
    ? ` WindowsWgcSupport=${summary.windowsWgcSupportCommand}.`
    : "";
  const wgcSupportPowerShell = summary.windowsWgcSupportPowerShellCommand
    && (!runtimeText.includes("WindowsWgcSupportPs=") || !runtimeText.includes(summary.windowsWgcSupportPowerShellCommand))
    ? ` WindowsWgcSupportPs=${summary.windowsWgcSupportPowerShellCommand}.`
    : "";
  const webCodecs = summary.windowsWebCodecsH264Command
    && (!runtimeText.includes("WindowsWebCodecs=") || !runtimeText.includes(summary.windowsWebCodecsH264Command))
    ? ` WindowsWebCodecs=${summary.windowsWebCodecsH264Command}.`
    : "";
  const webCodecsPowerShell = summary.windowsWebCodecsH264PowerShellCommand
    && (!runtimeText.includes("WindowsWebCodecsPs=") || !runtimeText.includes(summary.windowsWebCodecsH264PowerShellCommand))
    ? ` WindowsWebCodecsPs=${summary.windowsWebCodecsH264PowerShellCommand}.`
    : "";
  const wgcBenchmark = summary.windowsWgcBenchmarkCommand && !runtimeText.includes("WindowsWgcBenchmark=")
    ? ` WindowsWgcBenchmark=${summary.windowsWgcBenchmarkCommand}.`
    : "";
  const wgcBenchmarkPowerShell = summary.windowsWgcBenchmarkPowerShellCommand && !runtimeText.includes("WindowsWgcBenchmarkPs=")
    ? ` WindowsWgcBenchmarkPs=${summary.windowsWgcBenchmarkPowerShellCommand}.`
    : "";
  const wgcCompare = summary.windowsWgcCompareCommand
    && (!runtimeText.includes("WindowsWgcCompare=") || !runtimeText.includes(summary.windowsWgcCompareCommand))
    ? ` WindowsWgcCompare=${summary.windowsWgcCompareCommand}.`
    : "";
  const wgcComparePowerShell = summary.windowsWgcComparePowerShellCommand
    && (!runtimeText.includes("WindowsWgcComparePs=") || !runtimeText.includes(summary.windowsWgcComparePowerShellCommand))
    ? ` WindowsWgcComparePs=${summary.windowsWgcComparePowerShellCommand}.`
    : "";
  const probeSentences = [];
  if (wgcSourceResult) {
    const probeState = wgcSourceResult.ok ? "passed" : "failed";
    probeSentences.push(
      `WGC H264 sources ${probeState}: ${compactText(wgcSourceResult.summary || "", 220)}`,
    );
  }
  const probeText = probeSentences
    .map((sentence) => (sentence.endsWith(".") ? sentence : `${sentence}.`))
    .join(" ");
  return `Windows readiness ${state} (${mode}): checks=${summary.passed}/${summary.results.length} failed=${summary.failed} warnings=${summary.warnings}; target=${summary.args.host}:${summary.args.port}; ${media};${activeCall} ${runtimeSentence}${reverseGrantStatus}${openOneTimeReverseGrant}${reverseGrantStatusNode}${openOneTimeReverseGrantNode}${reverseGrant}${reverseGrantPowerShell}${hostMediaPowerShell}${videoSupport}${videoSupportPowerShell}${wgcSupport}${wgcSupportPowerShell}${webCodecs}${webCodecsPowerShell}${wgcBenchmark}${wgcBenchmarkPowerShell}${wgcCompare}${wgcComparePowerShell}${next ? ` ${next}` : ""}${probeText ? ` ${probeText}` : ""}${safety}`;
}

function formatMediaBoardSummary(summary) {
  if (!summary.args?.probeMedia) return "media=not-checked";
  const result = Array.isArray(summary.results)
    ? summary.results.find((item) => item.label === "Windows host media aggregate")
    : null;
  if (!result) return "media=missing";
  const details = result.details || {};
  const failed = Number(details.summary?.failed);
  const passed = Number(details.summary?.passed);
  const status = normalizeMediaStatus(details.summary?.status, result.ok, passed, failed);
  if (status === "ok") return "media=ok";
  if (status === "partial") {
    return `media=partial(passed=${Number.isFinite(passed) ? passed : 0},failed=${Number.isFinite(failed) ? failed : 0})`;
  }
  if (status === "failed" && (Number.isFinite(failed) || Number.isFinite(passed))) {
    return `media=failed(passed=${Number.isFinite(passed) ? passed : 0},failed=${Number.isFinite(failed) ? failed : 0})`;
  }
  if (result.ok) return "media=ok";
  return "media=failed";
}

function normalizeMediaStatus(value, ok, passed, failed) {
  if (value === "ok" || value === "partial" || value === "failed") return value;
  if (ok) return "ok";
  if (Number.isFinite(failed) || Number.isFinite(passed)) {
    const safeFailed = Number.isFinite(failed) ? failed : 0;
    const safePassed = Number.isFinite(passed) ? passed : 0;
    return safeFailed === 0 ? "ok" : safePassed > 0 ? "partial" : "failed";
  }
  return "failed";
}

function filterExpectedWarnings(label, warnings) {
  if (label === "Windows input helper safe dry-run") {
    return warnings.filter((line) => !line.includes("Unsupported input event: __dry_run_unsupported__"));
  }
  return warnings;
}

async function runStep(results, args, label, command, commandArgs, options = {}) {
  print("INFO", `Running ${label}`, args);
  const result = await runCommand(label, command, commandArgs, options);
  results.push(result);
  if (result.ok) {
    print("OK", `${label}: ${result.summary || "passed"}`, args);
  } else {
    print("ERROR", `${label}: ${result.summary || `exit ${result.exitCode}`}`, args);
  }
  for (const warning of result.warnings.slice(0, 3)) {
    print("WARN", `${label}: ${warning.replace(/^\[WARN\]\s*/, "")}`, args);
  }
  return result;
}

async function runRuntimeStep(results, args) {
  print("INFO", "Running Windows host runtime", args);
  const result = await checkRunningHostRuntime(args);
  results.push(result);
  if (result.ok) {
    print("OK", `Windows host runtime: ${result.summary}`, args);
  } else {
    print("ERROR", `Windows host runtime: ${result.summary}`, args);
  }
  for (const warning of result.warnings.slice(0, 3)) {
    print("WARN", `Windows host runtime: ${warning.replace(/^\[WARN\]\s*/, "")}`, args);
  }
  return result;
}

function buildWgcH264SourceComparisonArgs(compareTimeoutMs, port) {
  return [
    "scripts/windows/compare-windows-wgc-h264-sources.mjs",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--profile",
    "30:10000:balanced",
    "--durationMs",
    "1200",
    "--timeoutMs",
    String(compareTimeoutMs),
    "--minFrames",
    "1",
    "--minFps",
    "0",
    "--maxGapMs",
    "10000",
    "--resourceSample",
    "false",
    "--resourceSampleTree",
    "false",
    "--boardSummary",
  ];
}

async function runWgcH264SourceComparisonStep(results, args, node, envWithFfmpeg) {
  const label = "Windows WGC H.264 source comparison";
  const compareTimeoutMs = Math.max(45000, Math.min(args.timeoutMs, 90000));
  const stepTimeoutMs = compareTimeoutMs * 2 + 45000;
  const maxAttempts = 2;
  const attempts = [];
  print("INFO", `Running ${label}`, args);

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    const result = await runCommand(
      label,
      node,
      buildWgcH264SourceComparisonArgs(compareTimeoutMs, 43824 + attemptIndex * 80),
      { timeoutMs: stepTimeoutMs, env: envWithFfmpeg },
    );
    attempts.push(result);
    if (result.ok) {
      const retryWarnings = attempts.slice(0, -1).map((attempt, index) =>
        `[WARN] WGC H.264 source comparison attempt ${index + 1} failed before retry: ${compactText(
          attempt.summary || attempt.stderr || attempt.stdout || `exit ${attempt.exitCode}`,
          220,
        )}`,
      );
      const finalResult = {
        ...result,
        summary: attempts.length > 1
          ? `${result.summary || "passed"} (passed after ${attempts.length} attempts)`
          : result.summary,
        warnings: retryWarnings.concat(result.warnings),
      };
      results.push(finalResult);
      print("OK", `${label}: ${finalResult.summary || "passed"}`, args);
      for (const warning of finalResult.warnings.slice(0, 3)) {
        print("WARN", `${label}: ${warning.replace(/^\[WARN\]\s*/, "")}`, args);
      }
      return finalResult;
    }
    if (attemptIndex < maxAttempts - 1) {
      print("WARN", `${label}: attempt ${attemptIndex + 1} failed; retrying on a fresh temporary port`, args);
    }
  }

  const failedResult = attempts.at(-1);
  results.push(failedResult);
  print("ERROR", `${label}: ${failedResult.summary || `exit ${failedResult.exitCode}`}`, args);
  for (const warning of failedResult.warnings.slice(0, 3)) {
    print("WARN", `${label}: ${warning.replace(/^\[WARN\]\s*/, "")}`, args);
  }
  return failedResult;
}

function mediaCommandArgs(args) {
  const maxFrameAgeMs = Math.max(args.maxVideoFrameAgeMs, args.maxAudioFrameAgeMs);
  const probeTimeoutMs = Math.max(args.timeoutMs, 15000);
  const commandTimeoutMs = Math.max(args.timeoutMs, 35000);
  const mediaArgs = [
    "scripts/windows/observe-windows-host-media.mjs",
    "--json",
    "--videoDurationMs",
    "2500",
    "--videoTimeoutMs",
    String(probeTimeoutMs),
    "--videoMinFrames",
    "20",
    "--videoMinFps",
    "8",
    "--videoRetries",
    "0",
    "--audioDurationMs",
    "2500",
    "--audioTimeoutMs",
    String(probeTimeoutMs),
    "--audioMinFrames",
    "60",
    "--audioMinFps",
    "30",
    "--maxGapMs",
    "1000",
    "--commandTimeoutMs",
    String(commandTimeoutMs),
  ];
  if (maxFrameAgeMs > 0) {
    mediaArgs.push("--maxFrameAgeMs", String(maxFrameAgeMs), "--requireMonotonicTimestamp");
  } else {
    mediaArgs.push("--requireMonotonicTimestamp", "false");
  }
  if (args.ffmpeg) {
    mediaArgs.push("--ffmpeg", args.ffmpeg);
  }
  return mediaArgs;
}

async function checkMediaAggregate(args, node, envWithFfmpeg) {
  const label = "Windows host media aggregate";
  const result = await runCommand(
    label,
    node,
    mediaCommandArgs(args),
    { timeoutMs: Math.max(args.timeoutMs, 45000), env: envWithFfmpeg },
  );
  let payload = null;
  try {
    payload = parseJsonOutput(result.stdout, label);
  } catch (error) {
    return {
      label,
      ok: false,
      exitCode: result.exitCode,
      elapsedMs: result.elapsedMs,
      summary: result.summary || error.message,
      boardSummary: "",
      warnings: result.warnings,
      errors: result.errors.length > 0 ? result.errors : [error.message],
      details: {
        parseError: error.message,
        exitCode: result.exitCode,
      },
    };
  }

  const failures = Array.isArray(payload.summary?.failures)
    ? payload.summary.failures
    : [];
  const ok = result.ok && payload.ok === true;
  const failureMessages = failures.map((failure) =>
    `${failure.id || failure.label || "probe"}: ${failure.summary || failure.message || "failed"}`,
  );
  return {
    label,
    ok,
    exitCode: result.exitCode,
    elapsedMs: result.elapsedMs,
    summary: payload.boardSummary || result.summary || (payload.ok ? "media aggregate passed" : "media aggregate failed"),
    boardSummary: payload.boardSummary || "",
    warnings: result.warnings,
    errors: ok ? [] : (failureMessages.length > 0 ? failureMessages : result.errors),
    details: {
      ok: payload.ok === true,
      target: payload.target || null,
      boardSummary: payload.boardSummary || "",
      summary: payload.summary || null,
      resource: payload.resource || null,
      video: payload.video
        ? { ok: payload.video.ok, observation: payload.video.observation || null, error: payload.video.error || null }
        : null,
      audio: payload.audio
        ? { ok: payload.audio.ok, observation: payload.audio.observation || null, error: payload.audio.error || null }
        : null,
    },
  };
}

async function runMediaAggregateStep(results, args, node, envWithFfmpeg) {
  const label = "Windows host media aggregate";
  print("INFO", `Running ${label}`, args);
  const result = await checkMediaAggregate(args, node, envWithFfmpeg);
  results.push(result);
  if (result.ok) {
    print("OK", `${label}: ${result.summary || "passed"}`, args);
  } else {
    print("ERROR", `${label}: ${result.summary || `exit ${result.exitCode}`}`, args);
  }
  for (const warning of result.warnings.slice(0, 3)) {
    print("WARN", `${label}: ${warning.replace(/^\[WARN\]\s*/, "")}`, args);
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const results = [];
  const board = await getBoardSnapshot(args);
  if (args.checkBoard) {
    if (board.ok) {
      if (board.currentCall?.present) {
        const state = board.currentCall.active ? "active" : "inactive";
        print("INFO", `Agent Link Board currentCall=${state} ${board.currentCall.summary}`, args);
      } else {
        print("OK", "Agent Link Board currentCall=none", args);
      }
    } else {
      print("WARN", `Agent Link Board unavailable: ${board.error || "unknown error"}`, args);
    }
  }
  const node = process.execPath;
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const powershell = process.platform === "win32" ? "powershell.exe" : "pwsh";
  const envWithFfmpeg = args.ffmpeg ? { LAN_DUAL_FFMPEG: args.ffmpeg } : {};

  await runStep(results, args, "Node.js", node, ["--version"], { timeoutMs: 5000 });
  await runStep(results, args, "FFmpeg", args.ffmpeg, ["-version"], { timeoutMs: 8000 });
  await runStep(
    results,
    args,
    "Windows Graphics Capture preflight",
    node,
    [
      "scripts/windows/check-windows-wgc-support.mjs",
      ...(args.requireWgc ? ["--requireSupported"] : []),
    ],
    { timeoutMs: args.timeoutMs },
  );
  await runStep(results, args, "Windows host syntax", npmCommand, ["run", "check"], {
    cwd: resolve(repoRoot, "apps/windows-host"),
    timeoutMs: args.timeoutMs,
    env: envWithFfmpeg,
  });
  await runStep(results, args, "Windows input helper safe dry-run", node, ["scripts/windows/test-windows-input-helper.mjs"], {
    timeoutMs: args.timeoutMs,
    env: envWithFfmpeg,
  });
  await runStep(
    results,
    args,
    "Windows audio devices",
    node,
    ["scripts/windows/check-windows-audio-devices.mjs", ...(args.ffmpeg ? ["--ffmpeg", args.ffmpeg] : [])],
    { timeoutMs: args.timeoutMs, env: envWithFfmpeg },
  );
  await runStep(
    results,
    args,
    "Windows host LAN/firewall",
    node,
    [
      "scripts/windows/check-windows-firewall.mjs",
      "--host",
      args.host,
      "--port",
      String(args.port),
      ...(args.requireOpen ? ["--requireOpen"] : []),
    ],
    { timeoutMs: args.timeoutMs },
  );
  await runRuntimeStep(results, args);

  if (args.probeHost) {
    await runStep(
      results,
      args,
      "Windows host self-test",
      powershell,
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "scripts/windows/test-windows-host.ps1",
        "-ScreenMode",
        "ffmpeg",
      ],
      { timeoutMs: Math.max(args.timeoutMs, 45000), env: envWithFfmpeg },
    );
  }

  if (args.probeClipboardSecurity) {
    await runStep(
      results,
      args,
      "Windows host clipboard security",
      node,
      [
        "scripts/windows/test-windows-host-clipboard-security.mjs",
        "--timeoutMs",
        String(Math.max(8000, Math.min(args.timeoutMs, 30000))),
      ],
      { timeoutMs: Math.max(args.timeoutMs, 45000), env: envWithFfmpeg },
    );
  }

  if (args.probeWgcH264Sources) {
    await runWgcH264SourceComparisonStep(results, args, node, envWithFfmpeg);
  }

  if (args.probeMedia) {
    await runMediaAggregateStep(results, args, node, envWithFfmpeg);
  }

  if (args.probeVideo) {
    await runStep(
      results,
      args,
      "Windows host video observation",
      node,
      [
        "scripts/windows/observe-windows-host-video.mjs",
        "--durationMs",
        "2500",
        "--minFrames",
        "20",
        "--minFps",
        "8",
        ...(args.maxVideoFrameAgeMs > 0
          ? ["--maxFrameAgeMs", String(args.maxVideoFrameAgeMs), "--requireMonotonicTimestamp"]
          : []),
        ...(args.ffmpeg ? ["--ffmpeg", args.ffmpeg] : []),
      ],
      { timeoutMs: Math.max(args.timeoutMs, 35000), env: envWithFfmpeg },
    );
  }

  if (args.probeAudio) {
    await runStep(
      results,
      args,
      "Windows host WASAPI audio observation",
      node,
      [
        "scripts/windows/observe-windows-host-audio.mjs",
        "--durationMs",
        "2500",
        "--minFrames",
        "60",
        "--minFps",
        "30",
        ...(args.maxAudioFrameAgeMs > 0
          ? ["--maxFrameAgeMs", String(args.maxAudioFrameAgeMs), "--requireMonotonicTimestamp"]
          : []),
      ],
      { timeoutMs: Math.max(args.timeoutMs, 35000), env: envWithFfmpeg },
    );
  }

  const failed = results.filter((result) => !result.ok);
  const boardWarnings = args.checkBoard && !board.ok ? [`Agent Link Board unavailable: ${board.error || "unknown error"}`] : [];
  const warnings = results.flatMap((result) => result.warnings).concat(boardWarnings);
  const ok = failed.length === 0 && (!args.strict || warnings.length === 0);
  const macClientReadinessCommands = results.flatMap((result) =>
    Array.isArray(result.macClientReadinessCommands) ? result.macClientReadinessCommands : [],
  );
  const windowsHostMediaReadinessPowerShellCommandValue = results.find((result) =>
    typeof result.windowsHostMediaReadinessPowerShellCommand === "string" && result.windowsHostMediaReadinessPowerShellCommand,
  )?.windowsHostMediaReadinessPowerShellCommand || windowsHostMediaReadinessPowerShellCommand();
  const windowsReverseControlGrantCommandValue = results.find((result) =>
    typeof result.windowsReverseControlGrantCommand === "string" && result.windowsReverseControlGrantCommand,
  )?.windowsReverseControlGrantCommand || windowsReverseControlGrantCommand(args.port);
  const windowsReverseControlGrantPowerShellCommandValue = results.find((result) =>
    typeof result.windowsReverseControlGrantPowerShellCommand === "string" && result.windowsReverseControlGrantPowerShellCommand,
  )?.windowsReverseControlGrantPowerShellCommand || windowsReverseControlGrantPowerShellCommand(args.port);
  const windowsReverseGrantStatusCommandValue = results.find((result) =>
    typeof result.windowsReverseGrantStatusCommand === "string" && result.windowsReverseGrantStatusCommand,
  )?.windowsReverseGrantStatusCommand || windowsReverseGrantStatusCommand(args.port);
  const windowsReverseGrantStatusPowerShellCommandValue = results.find((result) =>
    typeof result.windowsReverseGrantStatusPowerShellCommand === "string" && result.windowsReverseGrantStatusPowerShellCommand,
  )?.windowsReverseGrantStatusPowerShellCommand || windowsReverseGrantStatusPowerShellCommand(args.port);
  const windowsOpenOneTimeReverseGrantCommandValue = results.find((result) =>
    typeof result.windowsOpenOneTimeReverseGrantCommand === "string" && result.windowsOpenOneTimeReverseGrantCommand,
  )?.windowsOpenOneTimeReverseGrantCommand || windowsOpenOneTimeReverseGrantCommand(args.port);
  const windowsOpenOneTimeReverseGrantPowerShellCommandValue = results.find((result) =>
    typeof result.windowsOpenOneTimeReverseGrantPowerShellCommand === "string" && result.windowsOpenOneTimeReverseGrantPowerShellCommand,
  )?.windowsOpenOneTimeReverseGrantPowerShellCommand || windowsOpenOneTimeReverseGrantPowerShellCommand(args.port);
  const windowsVideoEncoderSupportCommandValue = results.find((result) =>
    typeof result.windowsVideoEncoderSupportCommand === "string" && result.windowsVideoEncoderSupportCommand,
  )?.windowsVideoEncoderSupportCommand || windowsVideoEncoderSupportCommand();
  const windowsVideoEncoderSupportPowerShellCommandValue = results.find((result) =>
    typeof result.windowsVideoEncoderSupportPowerShellCommand === "string" && result.windowsVideoEncoderSupportPowerShellCommand,
  )?.windowsVideoEncoderSupportPowerShellCommand || windowsVideoEncoderSupportPowerShellCommand();
  const windowsWgcSupportCommandValue = results.find((result) =>
    typeof result.windowsWgcSupportCommand === "string" && result.windowsWgcSupportCommand,
  )?.windowsWgcSupportCommand || windowsWgcSupportCommand();
  const windowsWgcSupportPowerShellCommandValue = results.find((result) =>
    typeof result.windowsWgcSupportPowerShellCommand === "string" && result.windowsWgcSupportPowerShellCommand,
  )?.windowsWgcSupportPowerShellCommand || windowsWgcSupportPowerShellCommand();
  const windowsWebCodecsH264CommandValue = results.find((result) =>
    typeof result.windowsWebCodecsH264Command === "string" && result.windowsWebCodecsH264Command,
  )?.windowsWebCodecsH264Command || windowsWebCodecsH264Command();
  const windowsWebCodecsH264PowerShellCommandValue = results.find((result) =>
    typeof result.windowsWebCodecsH264PowerShellCommand === "string" && result.windowsWebCodecsH264PowerShellCommand,
  )?.windowsWebCodecsH264PowerShellCommand || windowsWebCodecsH264PowerShellCommand();
  const windowsWgcBenchmarkCommandValue = results.find((result) =>
    typeof result.windowsWgcBenchmarkCommand === "string" && result.windowsWgcBenchmarkCommand,
  )?.windowsWgcBenchmarkCommand || windowsWgcBenchmarkCommand();
  const windowsWgcBenchmarkPowerShellCommandValue = results.find((result) =>
    typeof result.windowsWgcBenchmarkPowerShellCommand === "string" && result.windowsWgcBenchmarkPowerShellCommand,
  )?.windowsWgcBenchmarkPowerShellCommand || windowsWgcBenchmarkPowerShellCommand();
  const windowsWgcCompareCommandValue = results.find((result) =>
    typeof result.windowsWgcCompareCommand === "string" && result.windowsWgcCompareCommand,
  )?.windowsWgcCompareCommand || windowsWgcCompareCommand();
  const windowsWgcComparePowerShellCommandValue = results.find((result) =>
    typeof result.windowsWgcComparePowerShellCommand === "string" && result.windowsWgcComparePowerShellCommand,
  )?.windowsWgcComparePowerShellCommand || windowsWgcComparePowerShellCommand();

  const summary = {
    ok,
    strict: args.strict,
    args: {
      profile: args.profile,
      host: args.host,
      port: args.port,
      ffmpeg: args.ffmpeg,
      requireWgc: args.requireWgc,
      maxVideoFrameAgeMs: args.maxVideoFrameAgeMs,
      maxAudioFrameAgeMs: args.maxAudioFrameAgeMs,
      probeHost: args.probeHost,
      probeMedia: args.probeMedia,
      probeVideo: args.probeVideo,
      probeAudio: args.probeAudio,
      probeClipboardSecurity: args.probeClipboardSecurity,
      probeWgcH264Sources: args.probeWgcH264Sources,
      expectBuildId: args.expectBuildId,
      currentBuildId: args.currentBuildId,
      requireCurrentBuildId: args.requireCurrentBuildId,
      skipCurrentBuildCheck: args.skipCurrentBuildCheck,
      requireOpen: args.requireOpen,
      server: args.server,
      checkBoard: args.checkBoard,
      boardSummary: args.boardSummary,
    },
    board,
    passed: results.filter((result) => result.ok).length,
    failed: failed.length,
    warnings: warnings.length,
    macClientReadinessCommands,
    windowsHostMediaReadinessPowerShellCommand: windowsHostMediaReadinessPowerShellCommandValue,
    windowsReverseControlGrantCommand: windowsReverseControlGrantCommandValue,
    windowsReverseControlGrantPowerShellCommand: windowsReverseControlGrantPowerShellCommandValue,
    windowsReverseGrantStatusCommand: windowsReverseGrantStatusCommandValue,
    windowsReverseGrantStatusPowerShellCommand: windowsReverseGrantStatusPowerShellCommandValue,
    windowsOpenOneTimeReverseGrantCommand: windowsOpenOneTimeReverseGrantCommandValue,
    windowsOpenOneTimeReverseGrantPowerShellCommand: windowsOpenOneTimeReverseGrantPowerShellCommandValue,
    windowsVideoEncoderSupportCommand: windowsVideoEncoderSupportCommandValue,
    windowsVideoEncoderSupportPowerShellCommand: windowsVideoEncoderSupportPowerShellCommandValue,
    windowsWgcSupportCommand: windowsWgcSupportCommandValue,
    windowsWgcSupportPowerShellCommand: windowsWgcSupportPowerShellCommandValue,
    windowsWebCodecsH264Command: windowsWebCodecsH264CommandValue,
    windowsWebCodecsH264PowerShellCommand: windowsWebCodecsH264PowerShellCommandValue,
    windowsWgcBenchmarkCommand: windowsWgcBenchmarkCommandValue,
    windowsWgcBenchmarkPowerShellCommand: windowsWgcBenchmarkPowerShellCommandValue,
    windowsWgcCompareCommand: windowsWgcCompareCommandValue,
    windowsWgcComparePowerShellCommand: windowsWgcComparePowerShellCommandValue,
    results: results.map((result) => ({
      label: result.label,
      ok: result.ok,
      exitCode: result.exitCode,
      elapsedMs: result.elapsedMs,
      summary: result.summary,
      boardSummary: result.boardSummary || "",
      details: result.details || null,
      macClientReadinessCommands: Array.isArray(result.macClientReadinessCommands)
        ? result.macClientReadinessCommands
        : [],
      windowsHostMediaReadinessPowerShellCommand: result.windowsHostMediaReadinessPowerShellCommand || "",
      windowsReverseControlGrantCommand: result.windowsReverseControlGrantCommand || "",
      windowsReverseControlGrantPowerShellCommand: result.windowsReverseControlGrantPowerShellCommand || "",
      windowsReverseGrantStatusCommand: result.windowsReverseGrantStatusCommand || "",
      windowsReverseGrantStatusPowerShellCommand: result.windowsReverseGrantStatusPowerShellCommand || "",
      windowsOpenOneTimeReverseGrantCommand: result.windowsOpenOneTimeReverseGrantCommand || "",
      windowsOpenOneTimeReverseGrantPowerShellCommand: result.windowsOpenOneTimeReverseGrantPowerShellCommand || "",
      windowsVideoEncoderSupportCommand: result.windowsVideoEncoderSupportCommand || "",
      windowsVideoEncoderSupportPowerShellCommand: result.windowsVideoEncoderSupportPowerShellCommand || "",
      windowsWgcSupportCommand: result.windowsWgcSupportCommand || "",
      windowsWgcSupportPowerShellCommand: result.windowsWgcSupportPowerShellCommand || "",
      windowsWebCodecsH264Command: result.windowsWebCodecsH264Command || "",
      windowsWebCodecsH264PowerShellCommand: result.windowsWebCodecsH264PowerShellCommand || "",
      windowsWgcBenchmarkCommand: result.windowsWgcBenchmarkCommand || "",
      windowsWgcBenchmarkPowerShellCommand: result.windowsWgcBenchmarkPowerShellCommand || "",
      windowsWgcCompareCommand: result.windowsWgcCompareCommand || "",
      windowsWgcComparePowerShellCommand: result.windowsWgcComparePowerShellCommand || "",
      warnings: result.warnings,
      errors: result.errors,
    })),
  };
  summary.boardSummary = makeReadinessBoardSummary(summary);

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else if (args.boardSummary) {
    console.log(summary.boardSummary);
  } else {
    print(
      ok ? "OK" : "ERROR",
      ok
        ? `Windows host readiness passed: ${summary.passed}/${results.length} checks`
        : `Windows host readiness failed: ${summary.failed} failed, ${summary.warnings} warnings`,
      args,
    );
    if (!ok && !args.probeHost) {
      print(
        "INFO",
        "For deeper validation, rerun with --probeHost, --probeMedia, --probeVideo, --probeAudio, or --probeWgcH264Sources as needed.",
        args,
      );
    }
  }

  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
