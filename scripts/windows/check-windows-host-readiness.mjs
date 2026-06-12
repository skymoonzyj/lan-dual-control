import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultWindowsFfmpeg = "C:\\DevTools\\ffmpeg\\bin\\ffmpeg.exe";
const hostRuntimePaths = [
  "apps/windows-host/package.json",
  "apps/windows-host/server.mjs",
  "apps/windows-host/src",
];

const defaults = {
  profile: "default",
  host: "0.0.0.0",
  port: 43770,
  timeoutMs: 20000,
  maxVideoFrameAgeMs: 1000,
  maxAudioFrameAgeMs: 1000,
  ffmpeg: process.env.LAN_DUAL_FFMPEG || "",
  probeHost: false,
  probeAudio: false,
  probeVideo: false,
  expectBuildId: "",
  requireCurrentBuildId: false,
  skipCurrentBuildCheck: false,
  requireOpen: false,
  strict: false,
  json: false,
};

function booleanArg(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
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
      key === "probeHost" ||
      key === "probeAudio" ||
      key === "probeVideo" ||
      key === "requireCurrentBuildId" ||
      key === "skipCurrentBuildCheck" ||
      key === "requireOpen" ||
      key === "strict" ||
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
  args.probeHost = booleanArg(args.probeHost);
  args.probeAudio = booleanArg(args.probeAudio);
  args.probeVideo = booleanArg(args.probeVideo);
  args.expectBuildId = String(args.expectBuildId || "").trim();
  args.currentBuildId = getGitBuildId();
  args.requireCurrentBuildId = booleanArg(args.requireCurrentBuildId);
  args.skipCurrentBuildCheck = booleanArg(args.skipCurrentBuildCheck);
  args.requireOpen = booleanArg(args.requireOpen);
  args.strict = booleanArg(args.strict);
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
  }
}

function printHelp() {
  console.log(`Usage: node scripts/windows/check-windows-host-readiness.mjs [options]

Runs a low-risk Windows host readiness check for local LAN reverse-control work.
Default checks are read-only: syntax, FFmpeg availability, LAN/firewall state,
audio device listing, WASAPI format, and safe input helper dry-run.

Options:
  --profile <name>    Preset: default, deploy, deep. Default keeps low-risk checks.
  --host <host>       Windows host bind/probe host. Default: 0.0.0.0
  --port <port>       Windows host port. Default: 43770
  --ffmpeg <path>     FFmpeg path. Auto-detects C:\\DevTools\\ffmpeg\\bin\\ffmpeg.exe
  --maxVideoFrameAgeMs <ms>  Video probe frame freshness limit. 0 disables. Default: 1000
  --maxAudioFrameAgeMs <ms>  Audio probe frame freshness limit. 0 disables. Default: 1000
  --probeHost         Run Windows host PowerShell self-test.
  --probeVideo        Run short Windows host video observer.
  --probeAudio        Run short WASAPI audio observer. Does not play a tone.
  --expectBuildId <id>      Require running host runtime.buildId to equal this value.
  --requireCurrentBuildId   Require running host runtime.buildId to match current git short hash.
  --skipCurrentBuildCheck   Do not warn when running host build differs from current git.
  --requireOpen       Require LAN/firewall port probe to be open.
  --strict            Treat warnings as failure.
  --json              Print machine-readable JSON summary.

Profiles:
  default             Low-risk checks only; no running host required.
  deploy              Require the configured port/current build, strict mode, plus video/audio probes.
  deep                deploy profile plus Windows host PowerShell self-test.
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

function print(kind, text, args) {
  if (args.json) return;
  console.log(`[${kind}] ${text}`);
}

function stripAnsi(text) {
  return String(text || "").replace(/\u001b\[[0-9;]*m/g, "");
}

function splitLines(text) {
  return stripAnsi(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
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

async function checkRunningHostRuntime(args) {
  const startedAt = Date.now();
  const discoveryHost = normalizeDiscoveryHost(args.host);
  const url = `http://${discoveryHost}:${args.port}/discovery`;
  const warnings = [];
  const errors = [];
  let summary = "";

  try {
    const discovery = await fetchJson(url, Math.min(2500, args.timeoutMs));
    const runtime = normalizeRuntime(discovery.runtime);
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
      const changedHostFiles = getChangedHostRuntimeFiles(runtime.buildId, args.currentBuildId);
      const hostSourceSummary =
        Array.isArray(changedHostFiles) && changedHostFiles.length > 0
          ? `; Windows host runtime changes since ${runtime.buildId}: ${changedHostFiles.slice(0, 4).join(", ")}${
              changedHostFiles.length > 4 ? ` (+${changedHostFiles.length - 4} more)` : ""
            }`
          : Array.isArray(changedHostFiles)
            ? `; no Windows host runtime source changes since ${runtime.buildId}`
            : "";
      const message = `running host build ${runtime.buildId} differs from current git ${args.currentBuildId}${hostSourceSummary}`;
      if (!args.skipCurrentBuildCheck) {
        warnings.push(`[WARN] ${message}`);
      }
      if (args.requireCurrentBuildId) {
        errors.push(message);
      }
    }

    summary = runtime.buildId
      ? `pid=${runtime.processId || "unknown"} build=${runtime.buildId} uptime=${runtime.uptimeSeconds ?? "?"}s`
      : "Windows host discovery reached; runtime missing";
    return {
      label: "Windows host runtime",
      ok: errors.length === 0,
      exitCode: errors.length === 0 ? 0 : 1,
      elapsedMs: Date.now() - startedAt,
      summary,
      warnings,
      errors,
    };
  } catch (error) {
    const message = `Windows host discovery runtime unavailable at ${url}: ${error.message}`;
    if (args.requireOpen || args.expectBuildId || args.requireCurrentBuildId) {
      errors.push(message);
    }
    return {
      label: "Windows host runtime",
      ok: errors.length === 0,
      exitCode: errors.length === 0 ? 0 : 1,
      elapsedMs: Date.now() - startedAt,
      summary: args.requireOpen ? message : "Windows host is not running; runtime check skipped",
      warnings,
      errors,
    };
  }
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

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const results = [];
  const node = process.execPath;
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const powershell = process.platform === "win32" ? "powershell.exe" : "pwsh";
  const envWithFfmpeg = args.ffmpeg ? { LAN_DUAL_FFMPEG: args.ffmpeg } : {};

  await runStep(results, args, "Node.js", node, ["--version"], { timeoutMs: 5000 });
  await runStep(results, args, "FFmpeg", args.ffmpeg, ["-version"], { timeoutMs: 8000 });
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
  const warnings = results.flatMap((result) => result.warnings);
  const ok = failed.length === 0 && (!args.strict || warnings.length === 0);

  const summary = {
    ok,
    strict: args.strict,
    args: {
      profile: args.profile,
      host: args.host,
      port: args.port,
      ffmpeg: args.ffmpeg,
      maxVideoFrameAgeMs: args.maxVideoFrameAgeMs,
      maxAudioFrameAgeMs: args.maxAudioFrameAgeMs,
      probeHost: args.probeHost,
      probeVideo: args.probeVideo,
      probeAudio: args.probeAudio,
      expectBuildId: args.expectBuildId,
      currentBuildId: args.currentBuildId,
      requireCurrentBuildId: args.requireCurrentBuildId,
      skipCurrentBuildCheck: args.skipCurrentBuildCheck,
      requireOpen: args.requireOpen,
    },
    passed: results.filter((result) => result.ok).length,
    failed: failed.length,
    warnings: warnings.length,
    results: results.map((result) => ({
      label: result.label,
      ok: result.ok,
      exitCode: result.exitCode,
      elapsedMs: result.elapsedMs,
      summary: result.summary,
      warnings: result.warnings,
      errors: result.errors,
    })),
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    print(
      ok ? "OK" : "ERROR",
      ok
        ? `Windows host readiness passed: ${summary.passed}/${results.length} checks`
        : `Windows host readiness failed: ${summary.failed} failed, ${summary.warnings} warnings`,
      args,
    );
    if (!ok && !args.probeHost) {
      print("INFO", "For deeper validation, rerun with --probeHost, --probeVideo, or --probeAudio as needed.", args);
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
