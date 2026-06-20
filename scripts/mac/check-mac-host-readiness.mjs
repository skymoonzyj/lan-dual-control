#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promptPassword as promptMacPassword } from "./password-prompt.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  profile: "default",
  host: "127.0.0.1",
  port: 43770,
  password: process.env.LAN_DUAL_PASSWORD || "demo-password",
  promptPassword: false,
  timeoutMs: 20000,
  server: "http://192.168.31.68:17888",
  checkBoard: false,
  expectBuildId: "",
  currentBuildId: "",
  requireOpen: false,
  requireControlPermissions: false,
  requireInputMonitoring: false,
  requireCurrentBuildId: false,
  skipCurrentBuildCheck: false,
  probeHost: false,
  probeVideo: false,
  maxVideoFrameAgeMs: 0,
  probeAudio: false,
  maxAudioFrameAgeMs: 0,
  probeMedia: false,
  probeMediaResourceSample: false,
  probeInputLog: false,
  probeClipboardSecurity: false,
  probeStartHelper: false,
  strict: false,
  json: false,
  boardSummary: false,
};
const formalTargetMaxScreenFps = 60;
const allowedMacHostAuthPathStatuses = new Set([
  "prompt-password-required",
  "prompt-password-configured",
  "env-password-required",
  "no-password-required",
  "unknown",
]);
const allowedMacHostAuthPathReasons = new Set([
  "launch-agent-ephemeral-password",
  "launch-agent-prompt-password",
  "launch-agent-env-required",
  "launch-agent-no-password",
  "launch-agent-auth-mode-unknown",
  "launch-agent-missing",
  "unknown",
]);
const allowedMacHostAuthPathModes = new Set(["ephemeral", "prompt", "env-required", "none", "unknown"]);
const allowedMacHostAuthPathNext = new Set(["MacHostStop->MacMaxFpsSafeStart->MacHostMedia", "unknown"]);
const manualUxChecklistTokens = [
  "connection",
  "video",
  "audio",
  "clipboard",
  "file",
  "window",
  "fullscreen",
  "original",
  "copy-diagnostics",
];
const defaultManualUxChecklist = manualUxChecklistTokens.join("/");

const profileDescriptions = {
  default: "default low-risk checks only",
  deploy: "require reachable current-build host, control permissions, input monitoring, H.264, PCM, and safe input-log smoke",
  deep: "deploy profile plus start-helper temporary-port self-test",
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function parseArgs(argv) {
  const args = { ...defaults };
  args.passwordFromArg = false;
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
      key === "requireOpen" ||
      key === "requireControlPermissions" ||
      key === "requireInputMonitoring" ||
      key === "requireCurrentBuildId" ||
      key === "skipCurrentBuildCheck" ||
      key === "promptPassword" ||
      key === "checkBoard" ||
      key === "probeHost" ||
      key === "probeVideo" ||
      key === "probeAudio" ||
      key === "probeMedia" ||
      key === "probeMediaResourceSample" ||
      key === "probeInputLog" ||
      key === "probeClipboardSecurity" ||
      key === "probeStartHelper" ||
      key === "strict" ||
      key === "json" ||
      key === "boardSummary"
    ) {
      args[key] = true;
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

  args.profile = normalizedText(args.profile || defaults.profile).toLowerCase();
  args.host = String(args.host || defaults.host).trim();
  args.port = clampInteger(args.port, 1, 65535, defaults.port);
  args.password = String(args.password || defaults.password);
  args.promptPassword = booleanArg(args.promptPassword);
  args.timeoutMs = clampInteger(args.timeoutMs, 3000, 120000, defaults.timeoutMs);
  args.server = normalizedText(args.server || defaults.server);
  args.checkBoard = booleanArg(args.checkBoard);
  args.expectBuildId = normalizedText(args.expectBuildId);
  args.currentBuildId = getGitBuildId();
  args.maxVideoFrameAgeMs = clampInteger(args.maxVideoFrameAgeMs, 0, 600000, defaults.maxVideoFrameAgeMs);
  args.maxAudioFrameAgeMs = clampInteger(args.maxAudioFrameAgeMs, 0, 600000, defaults.maxAudioFrameAgeMs);
  args.requireOpen = booleanArg(args.requireOpen);
  args.requireControlPermissions = booleanArg(args.requireControlPermissions);
  args.requireInputMonitoring = booleanArg(args.requireInputMonitoring);
  args.requireCurrentBuildId = booleanArg(args.requireCurrentBuildId);
  args.skipCurrentBuildCheck = booleanArg(args.skipCurrentBuildCheck);
  args.probeHost = booleanArg(args.probeHost);
  args.probeVideo = booleanArg(args.probeVideo);
  args.probeAudio = booleanArg(args.probeAudio);
  args.probeMedia = booleanArg(args.probeMedia);
  args.probeMediaResourceSample = booleanArg(args.probeMediaResourceSample);
  args.probeInputLog = booleanArg(args.probeInputLog);
  args.probeClipboardSecurity = booleanArg(args.probeClipboardSecurity);
  args.probeStartHelper = booleanArg(args.probeStartHelper);
  args.strict = booleanArg(args.strict);
  args.json = booleanArg(args.json);
  args.boardSummary = booleanArg(args.boardSummary);
  applyProfile(args);
  args.probeHost = args.probeHost || Boolean(args.expectBuildId);
  args.probeVideo = args.probeVideo || args.maxVideoFrameAgeMs > 0;
  args.probeAudio = args.probeAudio || args.maxAudioFrameAgeMs > 0;
  args.probeMedia = args.probeMedia || args.probeMediaResourceSample;
  return args;
}

function applyProfile(args) {
  if (!Object.prototype.hasOwnProperty.call(profileDescriptions, args.profile)) {
    throw new Error(`Unknown readiness profile "${args.profile}". Expected one of: ${Object.keys(profileDescriptions).join(", ")}`);
  }
  if (args.profile === "default") return;

  args.requireOpen = true;
  args.requireControlPermissions = true;
  args.requireInputMonitoring = true;
  args.requireCurrentBuildId = true;
  args.probeHost = true;
  args.probeVideo = true;
  args.probeAudio = true;
  args.probeInputLog = true;
  if (args.maxVideoFrameAgeMs <= 0) {
    args.maxVideoFrameAgeMs = 250;
  }
  if (args.maxAudioFrameAgeMs <= 0) {
    args.maxAudioFrameAgeMs = 250;
  }
  if (args.profile === "deep") {
    args.probeClipboardSecurity = true;
    args.probeStartHelper = true;
  }
}

function printHelp() {
  console.log(`Usage: node scripts/mac/check-mac-host-readiness.mjs [options]

Runs a low-risk Mac host readiness check for LAN control work. Default checks
are read-only: platform, Node/Swift, Mac host build, direct-start input
defaults, helper syntax/dry-run, keymap coverage, and a non-failing
/discovery status check.

Options:
  --profile <name>          Readiness preset: default, deploy, or deep.
                            default: ${profileDescriptions.default}
                            deploy: ${profileDescriptions.deploy}
                            deep: ${profileDescriptions.deep}
  --host <host>             Mac host probe host. Default: 127.0.0.1
  --port <port>             Mac host port. Default: 43770
  --password <password>     Probe password. Default: LAN_DUAL_PASSWORD or demo-password
  --promptPassword          Ring first, then prompt for probe password in a frontmost
                            macOS hidden password dialog. Useful for formal-password
                            deep probes; the value is not printed.
  --timeoutMs <ms>          Per-step timeout. Default: 20000
  --server <url>            Agent Link Board URL for --checkBoard.
                            Default: ${defaults.server}
  --checkBoard              Read Agent Link Board /api/state currentCall and
                            include it in JSON / board summary.
  --expectBuildId <id>      Require running host runtime.buildId. Implies --probeHost.
  --requireCurrentBuildId   Require running host runtime.buildId to match current git short hash.
  --skipCurrentBuildCheck   Do not warn when running host build differs from current git.
  --requireOpen             Fail if /discovery is not reachable.
  --requireControlPermissions
                            Require screen recording and accessibility permissions.
  --requireInputMonitoring  Require input monitoring permission to be granted.
  --probeHost               Run check-mac-displays runtime/display round-trip.
  --probeVideo              Run short H.264 video observation.
  --maxVideoFrameAgeMs <ms> Require fresh video_frame.timestamp during --probeVideo.
                            Implies --probeVideo. Default: off.
  --probeAudio              Run short PCM audio observation. Does not play a tone.
  --maxAudioFrameAgeMs <ms> Require fresh audio_frame.timestamp during --probeAudio.
                            Implies --probeAudio. Default: off.
  --probeMedia              Run observe-mac-media aggregate for one combined
                            H.264 + PCM report. This does not start the host,
                            play a tone, send input, or execute inject.
  --probeMediaResourceSample
                            With --probeMedia, sample local Mac host CPU/RSS
                            when /discovery.runtime.processId is local.
  --probeInputLog           Run safe input log smoke test; refuses non-log hosts.
  --probeClipboardSecurity  Run Mac host file clipboard receive integrity guards.
                            This is local-only: it does not start the host, write
                            the system clipboard, require a password, or inject input.
  --probeStartHelper        Run start helper self-test on a temporary local port.
  --strict                  Treat warnings as failure.
  --json                    Print machine-readable JSON summary.
  --boardSummary            Print a short secret-free Agent Link Board summary.
  --help, -h                Show this help without running checks.

Machine-readable JSON fields:
  commands.macHostSafeStartCommand
                            Secret-free foreground start command preserving the
                            checked port; it prompts locally and never embeds
                            a password in argv.
  commands.macHostStopCommand
                            Secret-free local stop command for the currently
                            checked Mac host port; it does not prompt for a
                            password, send input, or embed board URLs.
  commands.macMaxFpsSafeStartCommand
                            Secret-free foreground start command for the formal
                            60Hz target; it prompts locally, never embeds a
                            password in argv, and does not send input.
  commands.macResumeStatusCommand
                            Secret-free read-only resume summary rerun command
                            for confirming host build and next steps after a
                            safe restart. It does not prompt, authenticate, or
                            send input.
  commands.macLaunchAgentPlanCommand
                            Secret-free LaunchAgent dry-run planner command.
                            It prints a plist plan and manual load commands
                            without writing files, loading launchctl, starting
                            Mac host, or requesting a password.
  commands.macMaxFpsPlanCommand
                            Secret-free LaunchAgent dry-run planner command for
                            the formal 60Hz target. It only prints a plan and
                            does not write files, load launchctl, start Mac
                            host, request a password, or send input.
  commands.macUnattendedFormalCommand
                            Secret-free read-only formal unattended gate. It
                            turns missing or low LaunchAgent maxScreenFps into
                            a blocker without writing files, loading launchctl,
                            requesting a password, or sending input.
  commands.macFormalLocalSmokeCommand
                            Secret-free formal local smoke command for the next
                            H.264 + PCM + input-log short validation step. It
                            prompts locally and never embeds a password in argv.
  commands.macPowerPlanCommand
                            Secret-free Mac power settings dry-run planner. It
                            previews pmset changes and follow-up checks without
                            applying settings, prompting, authenticating, or
                            sending input.
  commands.macScriptHelpCommand
                            Unified side-effect-free Mac script help
                            self-check command.
  commands.macRemoteAudioPlanCommand
                            Secret-free remote-only audio plan. It explains
                            current system-pcm capture behavior and safe
                            remote-only options without changing Mac audio
                            output, prompting, authenticating, or sending input.
  commands.macInputSafetyPlanCommand
                            Secret-free real-input safety plan. It explains
                            default log mode, the --confirmUserWatching gate,
                            and the safe event set without sending input.
  commands.macClientManualChecklistAction
                            User-visible Mac client manual checklist action.
                            It points operators to the page diagnostics manual
                            checklist and never prompts, authenticates, sends a
                            call, or sends input.
  board.macHostAuthPath
                            Optional sanitized MacHostAuthPath summary copied
                            from Agent Link Board statuses when --checkBoard is
                            enabled. It uses fixed allowlists and never echoes
                            raw passwords, tokens, or unsafe source text.
`);
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function booleanArg(value) {
  return value === true || value === "true" || value === "1" || value === "yes" || value === "on";
}

async function preparePassword(args) {
  if (!args.promptPassword) return;
  if (args.passwordFromArg) {
    throw new Error("--promptPassword cannot be combined with --password.");
  }
  args.password = await promptMacPassword({
    title: "LAN Dual Control",
    message: "Enter the Mac host probe password. It is only used for this readiness probe and is not printed.",
    prompt: "Probe password:",
    terminalLabel: "Mac host probe password: ",
    output: args.json ? process.stderr : process.stdout,
  });
  if (!args.password) {
    throw new Error("Password cannot be empty when --promptPassword is used.");
  }
}

function getGitBuildId() {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 3000,
  });
  return result.status === 0 ? normalizedText(result.stdout) : "";
}

function print(kind, text, args) {
  if (args.json || args.boardSummary) return;
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

function collectLines(text, marker) {
  return splitLines(text).filter((line) => line.startsWith(marker));
}

function summarizeOutput(text) {
  const lines = splitLines(text);
  const buildComplete = lines.find((line) => line.includes("Build complete!"));
  if (buildComplete) return buildComplete;
  const macVersion = lines.find((line) => line.startsWith("ProductVersion:"));
  const macBuild = lines.find((line) => line.startsWith("BuildVersion:"));
  if (macVersion) return macBuild ? `${macVersion} ${macBuild}` : macVersion;
  const okLines = lines.filter((line) => line.startsWith("[OK]"));
  const passedLines = okLines.filter((line) => /passed|complete|verified|through|通过/i.test(line));
  const priority =
    passedLines.at(-1) ||
    okLines.at(-1) ||
    lines.find((line) => line.startsWith("[INFO]")) ||
    lines.find((line) => /swift-driver version|Apple Swift version|v\d+\.\d+\.\d+/.test(line));
  return priority || lines.at(-1) || "";
}

function filterExpectedWarnings(label, warnings) {
  if (label === "Mac host helper dry-run") {
    return warnings.filter((line) => !line.includes("demo password"));
  }
  return warnings;
}

function makeResult({ label, ok, exitCode = 0, elapsedMs = 0, summary = "", stdout = "", stderr = "", warnings = [], errors = [], details }) {
  const result = {
    label,
    ok,
    exitCode,
    elapsedMs,
    summary,
    stdout,
    stderr,
    warnings,
    errors,
  };
  if (details !== undefined) {
    result.details = details;
  }
  return result;
}

function runCommand(label, command, commandArgs, options = {}) {
  const startedAt = Date.now();
  const child = spawn(command, commandArgs, {
    cwd: options.cwd || repoRoot,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
    shell: false,
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
      finish(makeResult({
        label,
        ok: false,
        exitCode: null,
        elapsedMs: Date.now() - startedAt,
        summary: `${label} timed out after ${timeoutMs} ms`,
        stdout,
        stderr,
        errors: [`${label} timed out after ${timeoutMs} ms`],
      }));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish(makeResult({
        label,
        ok: false,
        exitCode: null,
        elapsedMs: Date.now() - startedAt,
        summary: error.message,
        stdout,
        stderr,
        errors: [error.message],
      }));
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const output = `${stdout}\n${stderr}`;
      finish(makeResult({
        label,
        ok: exitCode === 0,
        exitCode,
        elapsedMs: Date.now() - startedAt,
        summary: summarizeOutput(output),
        stdout,
        stderr,
        warnings: filterExpectedWarnings(label, collectLines(output, "[WARN]")),
        errors: collectLines(output, "[ERROR]").concat(exitCode === 0 ? [] : collectLines(output, "[FAIL]")),
      }));
    });
  });
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

function probeEnv(args) {
  return {
    LAN_DUAL_PASSWORD: args.password,
  };
}

function mediaCommandArgs(args) {
  const mediaArgs = [
    "scripts/mac/observe-mac-media.mjs",
    "--json",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--timeoutMs",
    String(args.timeoutMs),
    "--commandTimeoutMs",
    String(Math.max(args.timeoutMs, 20000)),
    "--videoDurationMs",
    "2500",
    "--videoMinFrames",
    "10",
    "--videoMaxGapMs",
    "1500",
    "--audioDurationMs",
    "2500",
    "--audioMinFrames",
    "80",
    "--audioMaxGapMs",
    "1000",
    "--requireFrameTimestamp",
  ];
  const maxFrameAgeMs = Math.max(args.maxVideoFrameAgeMs, args.maxAudioFrameAgeMs);
  if (maxFrameAgeMs > 0) {
    mediaArgs.push("--maxFrameAgeMs", String(maxFrameAgeMs));
  }
  if (args.probeMediaResourceSample) {
    mediaArgs.push("--resourceSample");
  }
  return mediaArgs;
}

async function checkMediaAggregate(args) {
  const result = await runCommand(
    "Mac host media aggregate",
    process.execPath,
    mediaCommandArgs(args),
    { timeoutMs: Math.max(args.timeoutMs, 35000), env: probeEnv(args) },
  );
  let payload = null;
  try {
    payload = parseJsonOutput(result.stdout, "Mac media aggregate");
  } catch (error) {
    return {
      ok: false,
      summary: result.summary || error.message,
      errors: result.errors.length ? result.errors : [error.message],
      warnings: result.warnings,
      details: {
        parseError: error.message,
        exitCode: result.exitCode,
      },
    };
  }
  const failures = Array.isArray(payload.summary?.failures)
    ? payload.summary.failures
    : [];
  return {
    ok: result.ok && payload.ok === true,
    summary: payload.boardSummary || result.summary || (payload.ok ? "media aggregate passed" : "media aggregate failed"),
    warnings: result.warnings,
    errors: result.ok && payload.ok === true
      ? []
      : failures.map((failure) => `${failure.id || "probe"}: ${failure.message || "failed"}`),
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

async function runCustomStep(results, args, label, callback) {
  print("INFO", `Running ${label}`, args);
  const startedAt = Date.now();
  try {
    const payload = await callback();
    const result = makeResult({
      label,
      ok: payload.ok,
      exitCode: payload.ok ? 0 : 1,
      elapsedMs: Date.now() - startedAt,
      summary: payload.summary,
      warnings: payload.warnings || [],
      errors: payload.errors || [],
      details: payload.details,
    });
    results.push(result);
    print(payload.ok ? "OK" : "ERROR", `${label}: ${payload.summary}`, args);
    for (const warning of result.warnings.slice(0, 3)) {
      print("WARN", `${label}: ${warning}`, args);
    }
    return result;
  } catch (error) {
    const result = makeResult({
      label,
      ok: false,
      exitCode: 1,
      elapsedMs: Date.now() - startedAt,
      summary: error.message,
      errors: [error.message],
    });
    results.push(result);
    print("ERROR", `${label}: ${error.message}`, args);
    return result;
  }
}

function formatRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") return "runtime=missing";
  const parts = [];
  if (runtime.processId) parts.push(`pid=${runtime.processId}`);
  if (runtime.buildId) parts.push(`build=${runtime.buildId}`);
  if (runtime.uptimeSeconds !== undefined) parts.push(`uptime=${runtime.uptimeSeconds}s`);
  return parts.length > 0 ? parts.join(" ") : "runtime=missing";
}

function formatPermissions(permissions) {
  if (!permissions || typeof permissions !== "object") return "permissions=missing";
  return [
    `screen=${status(permissions.screenRecording)}`,
    `accessibility=${status(permissions.accessibility)}`,
    `inputMonitoring=${status(permissions.inputMonitoring)}`,
  ].join(" ");
}

function status(value) {
  if (value === true) return "on";
  if (value === false) return "off";
  return "unknown";
}

function isH264CapturePipelineActive(capabilities) {
  const pipeline = normalizedText((capabilities || {}).capturePipeline).toLowerCase();
  return pipeline.includes("h264");
}

function h264FallbackPipelineWarning(capabilities) {
  const safeCapabilities = capabilities || {};
  if (safeCapabilities.h264Stream !== true || isH264CapturePipelineActive(safeCapabilities)) return "";
  // Discovery reports background-jpeg before any client negotiates an H.264 session.
  if (normalizedText(safeCapabilities.capturePipeline).toLowerCase() === "background-jpeg") return "";
  return `H.264 is advertised but current capture pipeline is ${safeCapabilities.capturePipeline || "unknown"}; refresh the media baseline before formal H.264 validation`;
}

function getMaxScreenFps(capabilities) {
  const value = Number((capabilities || {}).maxScreenFps);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

function maxScreenFpsWarning(capabilities) {
  const maxScreenFps = getMaxScreenFps(capabilities);
  if (maxScreenFps === null || maxScreenFps >= formalTargetMaxScreenFps) return "";
  return `maxScreenFps=${maxScreenFps}; formal ${formalTargetMaxScreenFps}Hz validation will run at the remote limit until the max-FPS LaunchAgent plan is reviewed`;
}

function checkMaxScreenFps(discoveryDetails, args) {
  if (!discoveryDetails?.online) {
    return {
      ok: true,
      summary: "not checked; Mac host discovery is offline",
      warnings: [],
      details: { checked: false, reason: "host-offline" },
    };
  }
  const maxScreenFps = getMaxScreenFps(discoveryDetails.capabilities);
  const warning = maxScreenFpsWarning(discoveryDetails.capabilities);
  return {
    ok: true,
    summary: maxScreenFps
      ? `maxScreenFps=${maxScreenFps}; formalTarget=${formalTargetMaxScreenFps}`
      : "maxScreenFps not reported by discovery",
    warnings: warning ? [warning] : [],
    details: {
      checked: true,
      maxScreenFps,
      formalTargetMaxScreenFps,
      limited: Boolean(warning),
      macMaxFpsSafeStartCommand: makeMacMaxFpsSafeStartCommand(args),
      macMaxFpsPlanCommand: makeMacMaxFpsPlanCommand(args),
    },
  };
}

function discoveryInputMode(discovery) {
  return discovery?.capabilities?.inputMode || discovery?.capabilities?.input?.mode || discovery?.inputMode || "unknown";
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

function parseJsonOutput(text, label) {
  try {
    return JSON.parse(String(text || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}`);
  }
}

function isActiveBoardCall(call) {
  if (!call) return false;
  const status = normalizedText(call.status).toLowerCase();
  if (!status) return true;
  return !["done", "completed", "complete", "cancelled", "canceled", "resolved", "closed"].includes(status);
}

function normalizeBoardCall(call) {
  if (!call || typeof call !== "object") return null;
  const normalized = {};
  for (const key of ["status", "goal", "from", "need", "environment", "connection", "command", "expected", "actual", "ask", "blockedBy", "owner", "timeout", "updatedAt"]) {
    const value = normalizedText(call[key]);
    if (value) normalized[key] = value;
  }
  if (Object.keys(normalized).length === 0) return null;
  normalized.active = isActiveBoardCall(normalized);
  return normalized;
}

function formatBoardCallOneLine(call) {
  if (!call) return "none";
  const parts = [
    `${call.status || "CALL"}: ${call.goal || "untitled"}`,
    call.from ? `from=${call.from}` : "",
    call.need ? `need=${call.need}` : "",
    call.connection ? `connection=${call.connection}` : "",
  ].filter(Boolean);
  return parts.join("; ");
}

function formatBoardCallSummary(board) {
  if (!board?.checked) return "call=not-checked";
  if (!board.ok) return "call=unknown";
  if (!board.currentCall) return "call=none";
  return `call=${board.activeCall ? "active" : "done"}(${formatBoardCallOneLine(board.currentCall)})`;
}

function boardCallSearchText(call) {
  if (!call || typeof call !== "object") return "";
  return [
    call.status,
    call.goal,
    call.from,
    call.need,
    call.environment,
    call.connection,
    call.expected,
    call.actual,
    call.ask,
    call.blockedBy,
    call.owner,
  ].map(normalizedText).filter(Boolean).join(" ");
}

function isUsableEntryManualUxCall(call) {
  const source = boardCallSearchText(call);
  if (!source) return false;
  const usableEntry = /强制可用化|第一版入口|可打开.*可连接.*远程\s*Mac/i.test(source);
  const manualUx = /手工体验|ManualUx|Manual UX|ManualUxTest/i.test(source);
  return usableEntry && manualUx;
}

function formatManualUxStandbyBoardSummary(board) {
  if (!board?.activeCall || !isUsableEntryManualUxCall(board.currentCall)) return "";
  return `ManualUxStandby=MacManualUxStandby; ManualUxChecklist=${defaultManualUxChecklist}`;
}

function formatMacHostAuthPathSummary(board) {
  const authPath = board?.macHostAuthPath;
  if (!authPath) return "";
  return [
    `MacHostAuthPath=${authPath.status || "unknown"}`,
    `reason=${authPath.reason || "unknown"}`,
    `mode=${authPath.mode || "unknown"}`,
    `next=${authPath.next || "unknown"}`,
  ].join(" ");
}

function formatReadinessBoardSummary(summary) {
  const failed = Number(summary.failed || 0);
  const warnings = Number(summary.warnings || 0);
  const attention = failed > 0
    ? `attention=${failed} failed`
    : warnings > 0
      ? `attention=${warnings} warning(s)`
      : "attention=none";
  const findings = formatReadinessFindings(summary.results);
  const probe = `${summary.args?.host || "127.0.0.1"}:${summary.args?.port || 43770}`;
  const media = formatMediaBoardSummary(summary);
  const hostBuild = formatHostBuildBoardSummary(summary);
  const hostMedia = formatHostMediaBoardSummary(summary);
  const suggestedAction = summary.suggestedAction?.boardSummary ? `; ${summary.suggestedAction.boardSummary}` : "";
  const macHostAuthPath = formatMacHostAuthPathSummary(summary.board);
  const manualUxStandby = formatManualUxStandbyBoardSummary(summary.board);
  const nextStep = manualUxStandby
    ? failed > 0
      ? "Next: fix failed checks before manual UX validation; keep inputMode=log for unattended checks."
      : warnings > 0
        ? "Next: review warnings, then keep Mac host/client/heartbeat online for manual UX validation; keep inputMode=log for unattended checks."
        : "Next: keep Mac host/client/heartbeat online for manual UX validation; keep inputMode=log for unattended checks."
    : failed > 0
      ? "Next: fix failed checks before formal E2E; keep inputMode=log for unattended checks."
      : warnings > 0
        ? "Next: review warnings, then continue manual UX/formal E2E coordination; keep inputMode=log for unattended checks."
        : "Next: continue manual UX/formal E2E coordination; keep inputMode=log for unattended checks.";
  return [
    `Mac host readiness: profile=${summary.args?.profile || "default"}; probe=${probe}; passed=${summary.passed}/${Array.isArray(summary.results) ? summary.results.length : "?"}; ${attention}; ${findings}; ${media}${hostBuild ? `; ${hostBuild}` : ""}${hostMedia ? `; ${hostMedia}` : ""}${suggestedAction}; ${formatBoardCallSummary(summary.board)}${macHostAuthPath ? `; ${macHostAuthPath}` : ""}${manualUxStandby ? `; ${manualUxStandby}` : ""}.`,
    `MacHostSafeStart=${summary.commands?.macHostSafeStartCommand || makeMacHostSafeStartCommand(summary.args || {})}.`,
    `MacHostStop=${summary.commands?.macHostStopCommand || makeMacHostStopCommand(summary.args || {})}.`,
    `MacMaxFpsSafeStart=${summary.commands?.macMaxFpsSafeStartCommand || makeMacMaxFpsSafeStartCommand(summary.args || {})}.`,
    `MacResumeStatus=${summary.commands?.macResumeStatusCommand || makeMacResumeStatusCommand(summary.args || {})}.`,
    `MacLaunchAgentPlan=${summary.commands?.macLaunchAgentPlanCommand || makeMacLaunchAgentPlanCommand(summary.args || {})}.`,
    `MacMaxFpsPlan=${summary.commands?.macMaxFpsPlanCommand || makeMacMaxFpsPlanCommand(summary.args || {})}.`,
    `MacUnattendedFormal=${summary.commands?.macUnattendedFormalCommand || makeMacUnattendedFormalCommand(summary.args || {})}.`,
    `MacFormalLocalSmoke=${summary.commands?.macFormalLocalSmokeCommand || makeMacFormalLocalSmokeCommand(summary.args || {})}.`,
    `MacPowerPlan=${summary.commands?.macPowerPlanCommand || makeMacPowerPlanCommand()}.`,
    `MacScriptHelp=${summary.commands?.macScriptHelpCommand || makeMacScriptHelpCommand()}.`,
    `MacRemoteAudioPlan=${summary.commands?.macRemoteAudioPlanCommand || makeMacRemoteAudioPlanCommand()}.`,
    `MacInputSafetyPlan=${summary.commands?.macInputSafetyPlanCommand || makeMacInputSafetyPlanCommand()}.`,
    `MacClientManualChecklist=${summary.commands?.macClientManualChecklistAction || makeMacClientManualChecklistAction()}.`,
    nextStep,
    "Do not send passwords on Agent Link Board; inject startups require the user watching the Mac screen and --confirmUserWatching.",
  ].join(" ");
}

function formatReadinessFindings(results) {
  const items = Array.isArray(results) ? results : [];
  const blockers = summarizeReadinessResultIds(items.filter((item) => item && item.ok === false));
  const warnings = summarizeReadinessWarningResultIds(items.filter((item) => Array.isArray(item?.warnings) && item.warnings.length > 0));
  return `blockers=${blockers} warnings=${warnings}`;
}

function summarizeReadinessResultIds(items) {
  const ids = [...new Set(items
    .map((item) => readinessResultId(item?.label || item?.id || "unknown"))
    .filter(Boolean))];
  if (ids.length === 0) return "none";
  if (ids.length <= 4) return ids.join(",");
  return `${ids.slice(0, 4).join(",")}+${ids.length - 4}more`;
}

function summarizeReadinessWarningResultIds(items) {
  const ids = [...new Set(items.flatMap((item) => readinessWarningResultIds(item)))];
  if (ids.length === 0) return "none";
  if (ids.length <= 4) return ids.join(",");
  return `${ids.slice(0, 4).join(",")}+${ids.length - 4}more`;
}

function readinessWarningResultIds(item) {
  const id = readinessResultId(item?.label || item?.id || "unknown");
  const ids = [id];
  if (id === "mac-host-discovery" && isMacHostBuildStaleWarning(item)) {
    ids.push("mac-host-build-stale");
  }
  return ids.filter(Boolean);
}

function isMacHostBuildStaleWarning(item) {
  const buildDiff = item?.details?.buildDiff || {};
  if (buildDiff.differs === true && ["restart-recommended", "warning"].includes(buildDiff.severity)) {
    return true;
  }
  const warningText = [
    item?.summary,
    ...(Array.isArray(item?.warnings) ? item.warnings : []),
  ].join(" ").toLowerCase();
  return warningText.includes("running host build")
    && warningText.includes("differs from current git");
}

function readinessResultId(label) {
  const normalized = normalizedText(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown";
}

function formatHostBuildBoardSummary(summary) {
  const discovery = Array.isArray(summary.results)
    ? summary.results.find((item) => item.label === "Mac host discovery")
    : null;
  const details = discovery?.details || {};
  if (details.online !== true) return "";
  const buildDiff = details.buildDiff || {};
  if (!buildDiff || buildDiff.differs !== true || buildDiff.severity === "ok") return "";
  if (buildDiff.severity === "stale-metadata") {
    return `runtimeBuild=${buildDiff.fromBuildId || "unknown"} stale metadata only, hostRuntimeChanges=0`;
  }
  if (buildDiff.severity === "restart-recommended") {
    return `runtimeBuild=${buildDiff.fromBuildId || "unknown"} restart recommended, hostRuntimeChanges=${buildDiff.changedHostRuntimeFileCount ?? "unknown"}`;
  }
  if (buildDiff.comparable && buildDiff.changedHostRuntimeFileCount === 0) {
    return `runtimeBuild=${buildDiff.fromBuildId || "unknown"} stale metadata only, hostRuntimeChanges=0`;
  }
  if (buildDiff.comparable) {
    return `runtimeBuild=${buildDiff.fromBuildId || "unknown"} restart recommended, hostRuntimeChanges=${buildDiff.changedHostRuntimeFileCount ?? "unknown"}`;
  }
  return `runtimeBuild=${buildDiff.fromBuildId || "unknown"} differs from repo=${buildDiff.toBuildId || "unknown"}`;
}

function formatHostMediaBoardSummary(summary) {
  const discovery = Array.isArray(summary.results)
    ? summary.results.find((item) => item.label === "Mac host discovery")
    : null;
  const details = discovery?.details || {};
  if (details.online !== true) return "";
  const capabilities = details.capabilities || {};
  const maxScreenFps = getMaxScreenFps(capabilities);
  return [
    `h264=${status(capabilities.h264Stream)}`,
    `pipeline=${capabilities.capturePipeline || "unknown"}`,
    maxScreenFps ? `maxFps=${maxScreenFps}` : "",
  ].filter(Boolean).join(" ");
}

function makeMacLaunchAgentPlanCommand(args = {}) {
  return [
    "node scripts/mac/install-mac-host-launch-agent.mjs",
    "--port",
    String(args.port || 43770),
    "--boardSummary",
  ].join(" ");
}

function makeMacHostSafeStartCommand(args = {}) {
  return [
    "node scripts/mac/start-mac-host.mjs",
    "--promptPassword",
    "--requirePassword",
    "--host",
    "0.0.0.0",
    "--port",
    String(args.port || 43770),
  ].join(" ");
}

function statusProbeHost(args = {}) {
  const host = args.host || "127.0.0.1";
  return host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
}

function makeMacHostStopCommand(args = {}) {
  return [
    "node scripts/mac/start-mac-host.mjs",
    "--stop",
    "--host",
    statusProbeHost(args),
    "--port",
    String(args.port || 43770),
  ].join(" ");
}

function makeMacMaxFpsSafeStartCommand(args = {}) {
  return [
    "node scripts/mac/start-mac-host.mjs",
    "--promptPassword",
    "--requirePassword",
    "--host",
    "0.0.0.0",
    "--port",
    String(args.port || 43770),
    "--maxScreenFps",
    String(formalTargetMaxScreenFps),
  ].join(" ");
}

function makeMacResumeStatusCommand(args = {}) {
  return [
    "node scripts/mac/check-mac-resume-status.mjs",
    "--host",
    statusProbeHost(args),
    "--port",
    String(args.port || 43770),
    "--checkBoard",
    "--boardSummary",
  ].join(" ");
}

function makeMacMaxFpsPlanCommand(args = {}) {
  return [
    "node scripts/mac/install-mac-host-launch-agent.mjs",
    "--port",
    String(args.port || 43770),
    "--maxScreenFps",
    String(formalTargetMaxScreenFps),
    "--boardSummary",
  ].join(" ");
}

function makeMacUnattendedFormalCommand(args = {}) {
  return [
    "node scripts/mac/check-mac-unattended-status.mjs",
    "--host",
    args.host || "127.0.0.1",
    "--port",
    String(args.port || 43770),
    "--requireLaunchAgentMaxFps",
    "--requireLaunchAgentLoaded",
    "--boardSummary",
  ].join(" ");
}

function makeMacFormalLocalSmokeCommand(args = {}) {
  return [
    "node scripts/mac/check-mac-formal-local-smoke.mjs",
    "--host",
    args.host || "127.0.0.1",
    "--port",
    String(args.port || 43770),
    "--promptPassword",
    "--boardSummary",
  ].join(" ");
}

function makeMacPowerPlanCommand() {
  return "node scripts/mac/plan-mac-power-settings.mjs --profile all --sleep 0 --displaySleep 0 --networkWake on --boardSummary";
}

function makeMacScriptHelpCommand() {
  return "node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary";
}

function makeMacRemoteAudioPlanCommand() {
  return "node scripts/mac/plan-mac-remote-audio.mjs --boardSummary";
}

function makeMacInputSafetyPlanCommand() {
  return "node scripts/mac/plan-mac-input-safety.mjs --boardSummary";
}

function makeMacClientManualChecklistAction() {
  return "Mac client 会话诊断查看“手工清单”：连接/视频/音频/剪贴板/文件/窗口/全屏/原画/input_ack/复制诊断；复制诊断会带出同一行，粘贴前确认不包含连接密码";
}

function formatMediaBoardSummary(summary) {
  if (!summary.args?.probeMedia) return "media=not-checked";
  const result = Array.isArray(summary.results)
    ? summary.results.find((item) => item.label === "Mac host media aggregate")
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

async function getBoardStatus(args) {
  const base = {
    checked: false,
    ok: null,
    summary: "not checked",
    currentCall: null,
    activeCall: false,
    macHostAuthPath: null,
    error: "",
  };
  if (!args.checkBoard) return base;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, args.timeoutMs));
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
        ...base,
        checked: true,
        ok: false,
        summary: `Agent Link Board /api/state returned ${response.status}`,
        error: `${response.status}: ${text.slice(0, 200)}`,
      };
    }
    const state = text ? JSON.parse(text) : {};
    const currentCall = normalizeBoardCall(state.currentCall);
    return {
      checked: true,
      ok: true,
      summary: currentCall
        ? `${currentCall.active ? "active" : "inactive"} currentCall: ${formatBoardCallOneLine(currentCall)}`
        : "no currentCall",
      currentCall,
      activeCall: Boolean(currentCall?.active),
      macHostAuthPath: collectMacHostAuthPath(state),
      updatedAt: normalizedText(state.updatedAt),
    };
  } catch (error) {
    return {
      ...base,
      checked: true,
      ok: false,
      summary: "Agent Link Board /api/state was not readable",
      error: error.name || "request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

function collectMacHostAuthPath(state) {
  for (const text of collectBoardTexts(state)) {
    const authPath = extractMacHostAuthPath(text);
    if (authPath) return authPath;
  }
  return null;
}

function collectBoardTexts(state) {
  const texts = [];
  const statuses = state && typeof state === "object" && state.statuses && typeof state.statuses === "object"
    ? state.statuses
    : {};
  const statusEntries = Object.entries(statuses);
  const orderedStatusEntries = [
    ...statusEntries.filter(([device]) => isMacUnattendedDevice(device)),
    ...statusEntries.filter(([device]) => !isMacUnattendedDevice(device)),
  ];
  for (const [device, entry] of orderedStatusEntries) {
    if (typeof entry === "string") {
      texts.push(`${device}: ${entry}`);
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const statusText = [device, entry.status, entry.note, entry.text, entry.message, entry.summary]
      .map(normalizedText)
      .filter(Boolean)
      .join(" ");
    if (statusText) texts.push(statusText);
  }
  const events = Array.isArray(state?.events) ? state.events : [];
  for (const event of events) {
    if (typeof event === "string") {
      texts.push(event);
      continue;
    }
    if (!event || typeof event !== "object") continue;
    const eventText = [event.device, event.from, event.status, event.note, event.text, event.message, event.summary]
      .map(normalizedText)
      .filter(Boolean)
      .join(" ");
    if (eventText) texts.push(eventText);
  }
  return texts.filter(Boolean);
}

function isMacUnattendedDevice(device) {
  return normalizedText(device).toLowerCase() === "mac unattended";
}

function extractMacHostAuthPath(text) {
  const source = normalizedText(text);
  if (!source || !/\bMacHostAuthPath=/i.test(source)) return null;
  const match = source.match(/\bMacHostAuthPath=([A-Za-z0-9_-]+)\s+reason=([A-Za-z0-9_-]+)\s+mode=([A-Za-z0-9_-]+)\s+next=([A-Za-z0-9_>.-]+)/i);
  if (!match) return null;
  const status = match[1];
  const reason = match[2];
  const mode = match[3];
  const next = match[4];
  if (!allowedMacHostAuthPathStatuses.has(status)) return null;
  if (!allowedMacHostAuthPathReasons.has(reason)) return null;
  if (!allowedMacHostAuthPathModes.has(mode)) return null;
  if (!allowedMacHostAuthPathNext.has(next)) return null;
  return { status, reason, mode, next };
}

function buildMismatchMessage(buildDiff) {
  if (!buildDiff || buildDiff.differs !== true) return "";
  const from = buildDiff.fromBuildId || "missing";
  const to = buildDiff.toBuildId || "missing";
  const rawDetail = normalizedText(buildDiff.message).replace(/[.。]+$/, "");
  const detail = rawDetail ? `; ${rawDetail.charAt(0).toLowerCase()}${rawDetail.slice(1)}` : "";
  return `running host build ${from} differs from current git ${to}${detail}; restart with scripts/mac/start-mac-host.mjs after coordinating if you need the latest build`;
}

async function getStatusPayload(args) {
  const statusArgs = [
    "scripts/mac/start-mac-host.mjs",
    "--status",
    "--json",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--timeoutMs",
    String(args.timeoutMs),
  ];
  if (args.currentBuildId) {
    statusArgs.push("--buildId", args.currentBuildId);
  }

  const result = await runCommand("Mac host status helper JSON", process.execPath, statusArgs, {
    timeoutMs: Math.max(args.timeoutMs, 8000),
  });
  const stdout = String(result.stdout || "").trim();
  if (!stdout) {
    throw new Error(`Mac host status helper printed no JSON output: ${result.summary || `exit ${result.exitCode}`}`);
  }
  return {
    payload: parseJsonOutput(stdout, "Mac host status helper"),
    result,
  };
}

function buildSuggestedAction(summary) {
  const discovery = Array.isArray(summary.results)
    ? summary.results.find((item) => item.label === "Mac host discovery")
    : null;
  const buildDiff = discovery?.details?.buildDiff || {};
  const staleRuntime = discovery?.details?.online === true
    && buildDiff.differs === true
    && (buildDiff.severity === "restart-recommended"
      || (buildDiff.comparable === true && Number(buildDiff.changedHostRuntimeFileCount || 0) > 0));
  if (!staleRuntime) return null;
  return {
    id: "restart-mac-host-safely",
    reason: "Mac host runtime build is stale; stop the old local host, restart with a visible password prompt, then rerun MacResumeStatus.",
    commands: {
      macHostStopCommand: summary.commands?.macHostStopCommand,
      macHostSafeStartCommand: summary.commands?.macHostSafeStartCommand,
      macMaxFpsSafeStartCommand: summary.commands?.macMaxFpsSafeStartCommand,
      macResumeStatusCommand: summary.commands?.macResumeStatusCommand,
    },
    boardSummary: "suggestedAction=restart-mac-host-safely actionCommands=MacHostStop->MacHostSafeStart-or-MacMaxFpsSafeStart->MacResumeStatus",
  };
}

function statusDetails(statusPayload, args) {
  const discovery = statusPayload.discovery || {};
  const online = statusPayload.online === true;
  const details = {
    online,
    probe: statusPayload.probe || { host: args.host, port: args.port },
    currentBuildId: statusPayload.currentBuildId || args.currentBuildId || "",
  };
  if (online) {
    details.deviceName = statusPayload.deviceName || discovery.deviceName || discovery.hostName || "Mac host";
    details.inputMode = statusPayload.inputMode || discoveryInputMode(discovery);
    details.runtime = statusPayload.runtime || discovery.runtime || {};
    details.permissions = statusPayload.permissions || discovery.permissions || {};
    details.capabilities = statusPayload.capabilities || discovery.capabilities || {};
    details.displays = normalizeDisplays(statusPayload.displays ?? details.capabilities.displays ?? discovery.displays ?? []);
    details.displayCount = Number.isInteger(statusPayload.displayCount)
      ? statusPayload.displayCount
      : details.displays.length;
    details.lanAddresses = Array.isArray(statusPayload.lanAddresses) ? statusPayload.lanAddresses : [];
    details.buildDiff = statusPayload.buildDiff || {};
    details.discovery = discovery;
  } else {
    details.error = statusPayload.error || null;
    details.displays = [];
    details.displayCount = 0;
    details.suggestions = Array.isArray(statusPayload.suggestions) ? statusPayload.suggestions : [];
  }
  return details;
}

async function checkBoard(args) {
  const board = await getBoardStatus(args);
  if (!board.checked) {
    return {
      ok: true,
      summary: "not checked; add --checkBoard when coordinating with Windows Codex",
      details: board,
    };
  }
  if (!board.ok) {
    return {
      ok: false,
      summary: board.summary,
      warnings: [board.summary],
      errors: [board.error || board.summary],
      details: board,
    };
  }
  const warnings = [];
  if (board.activeCall) {
    warnings.push(`Agent Link Board has an active call: ${formatBoardCallOneLine(board.currentCall)}. Coordinate before starting another formal test.`);
  }
  return {
    ok: true,
    summary: board.summary,
    warnings,
    details: board,
  };
}

async function checkDiscovery(args) {
  try {
    const { payload: statusPayload } = await getStatusPayload(args);
    const details = statusDetails(statusPayload, args);
    if (statusPayload.online !== true) {
      const probe = statusPayload.probe || { host: args.host, port: args.port };
      const errorMessage = statusPayload.error?.message || "offline";
      const summary = `/discovery not reachable on ${probe.host}:${probe.port}: ${errorMessage}`;
      if (args.requireOpen) {
        return { ok: false, summary, errors: [summary], details };
      }
      return {
        ok: true,
        summary: `${summary}; start with scripts/mac/start-mac-host.mjs when ready`,
        warnings: [summary],
        details,
      };
    }

    const discovery = statusPayload.discovery || {};
    const input = statusPayload.inputMode || discoveryInputMode(discovery);
    const runtime = statusPayload.runtime || discovery.runtime || {};
    const permissions = statusPayload.permissions || discovery.permissions || {};
    const capabilities = statusPayload.capabilities || discovery.capabilities || {};
    const buildDiff = statusPayload.buildDiff || {};
    const warnings = [];
    const errors = [];
    if (args.expectBuildId && runtime.buildId !== args.expectBuildId) {
      return {
        ok: false,
        summary: `build mismatch: ${runtime.buildId || "missing"} !== ${args.expectBuildId}`,
        errors: [`runtime.buildId mismatch: ${runtime.buildId || "missing"} !== ${args.expectBuildId}`],
      };
    }
    if (args.requireCurrentBuildId && !runtime.buildId) {
      errors.push("runtime.buildId is required to check the running host against current git");
    }
    if (!args.skipCurrentBuildCheck && buildDiff.differs === true) {
      const message = buildMismatchMessage(buildDiff);
      warnings.push(message);
      if (args.requireCurrentBuildId) {
        errors.push(message);
      }
    }
    if (input !== "log") {
      warnings.push(`input mode is ${input}; keep log mode for unattended readiness checks`);
    }
    if (permissions.screenRecording !== true) {
      warnings.push("screen recording permission is off; real video capture may fall back or fail");
      if (args.requireControlPermissions) {
        errors.push("screen recording permission is required");
      }
    }
    if (permissions.accessibility !== true) {
      warnings.push("accessibility permission is off; real input injection will fail");
      if (args.requireControlPermissions) {
        errors.push("accessibility permission is required");
      }
    }
    if (permissions.inputMonitoring === false) {
      warnings.push("input monitoring permission is off or not yet confirmed; keyboard edge cases may need manual permission review");
    }
    const h264PipelineWarning = h264FallbackPipelineWarning(capabilities);
    if (h264PipelineWarning) {
      warnings.push(h264PipelineWarning);
    }
    if (args.requireInputMonitoring && permissions.inputMonitoring !== true) {
      errors.push("input monitoring permission is required");
    }
    return {
      ok: errors.length === 0,
      summary: `${discovery.deviceName || discovery.hostName || "Mac host"} · input=${input} · ${formatRuntime(runtime)} · ${formatPermissions(permissions)}`,
      warnings,
      errors,
      details,
    };
  } catch (error) {
    const summary = `/discovery not reachable on ${args.host}:${args.port}: ${error.message}`;
    const details = {
      online: false,
      probe: { host: args.host, port: args.port },
      currentBuildId: args.currentBuildId || "",
      error: { message: error.message },
      suggestions: [makeMacHostSafeStartCommand(args), makeMacMaxFpsSafeStartCommand(args)],
    };
    if (args.requireOpen) {
      return { ok: false, summary, errors: [summary], details };
    }
    return {
      ok: true,
      summary: `${summary}; start with scripts/mac/start-mac-host.mjs when ready`,
      warnings: [summary],
      details,
    };
  }
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  await preparePassword(args);

  const results = [];
  const node = process.execPath;

  if (args.profile !== "default") {
    print("INFO", `Using readiness profile "${args.profile}": ${profileDescriptions[args.profile]}`, args);
  }

  await runStep(results, args, "Node.js", node, ["--version"], { timeoutMs: 5000 });
  await runStep(results, args, "macOS version", "sw_vers", [], { timeoutMs: 5000 });
  await runStep(results, args, "Swift", "swift", ["--version"], { timeoutMs: 10000 });
  await runStep(results, args, "Mac host build", "swift", ["build", "--package-path", "apps/mac-host"], {
    timeoutMs: args.timeoutMs,
  });
  await runStep(results, args, "Mac host direct-start defaults", node, ["scripts/mac/test-mac-host-defaults.mjs"], {
    timeoutMs: Math.max(args.timeoutMs, 25000),
  });
  await runStep(results, args, "Mac host start helper syntax", node, ["--check", "scripts/mac/start-mac-host.mjs"], {
    timeoutMs: 8000,
  });
  await runStep(results, args, "Mac host helper dry-run", node, ["scripts/mac/start-mac-host.mjs", "--dryRun"], {
    timeoutMs: 10000,
  });
  await runStep(results, args, "Mac input keymap coverage", node, ["scripts/mac/check-input-keymap.mjs"], {
    timeoutMs: 10000,
  });
  await runCustomStep(results, args, "Agent Link Board currentCall", () => checkBoard(args));
  const discoveryResult = await runCustomStep(results, args, "Mac host discovery", () => checkDiscovery(args));
  await runCustomStep(results, args, "Mac host max FPS", () => checkMaxScreenFps(discoveryResult.details, args));

  if (args.probeHost) {
    await runStep(
      results,
      args,
      "Mac host runtime/display round-trip",
      node,
      [
        "scripts/mac/check-mac-displays.mjs",
        "--host",
        args.host,
        "--port",
        String(args.port),
        "--requireRuntime",
        ...(args.expectBuildId ? ["--expectBuildId", args.expectBuildId] : []),
        "--timeoutMs",
        String(args.timeoutMs),
      ],
      { timeoutMs: Math.max(args.timeoutMs, 25000), env: probeEnv(args) },
    );
  }

  if (args.probeStartHelper) {
    await runStep(
      results,
      args,
      "Mac host start helper self-test",
      node,
      ["scripts/mac/test-mac-host-start-helper.mjs", "--timeoutMs", String(Math.max(args.timeoutMs, 30000))],
      { timeoutMs: Math.max(args.timeoutMs, 60000) },
    );
  }

  if (args.probeClipboardSecurity) {
    await runStep(
      results,
      args,
      "Mac host file clipboard security",
      node,
      ["scripts/mac/test-mac-host-clipboard-file-integrity.mjs"],
      { timeoutMs: Math.max(args.timeoutMs, 15000) },
    );
  }

  if (args.probeVideo) {
    await runStep(
      results,
      args,
      "Mac host H.264 video observation",
      node,
      [
        "scripts/mac/observe-mac-video.mjs",
        "--host",
        args.host,
        "--port",
        String(args.port),
        "--durationMs",
        "2500",
        "--timeoutMs",
        String(args.timeoutMs),
        "--requireH264",
        "--minFrames",
        "10",
        "--maxGapMs",
        "1500",
        "--expectActiveDisplayId",
        "main",
        "--requireFrameTimestamp",
        ...(args.maxVideoFrameAgeMs > 0 ? ["--maxFrameAgeMs", String(args.maxVideoFrameAgeMs)] : []),
        "--requireMonotonicTimestampUs",
        "--maxTimestampGapUs",
        "1000000",
      ],
      { timeoutMs: Math.max(args.timeoutMs, 35000), env: probeEnv(args) },
    );
  }

  if (args.probeAudio) {
    await runStep(
      results,
      args,
      "Mac host PCM audio observation",
      node,
      [
        "scripts/mac/observe-mac-audio.mjs",
        "--host",
        args.host,
        "--port",
        String(args.port),
        "--durationMs",
        "2500",
        "--timeoutMs",
        String(args.timeoutMs),
        "--minFrames",
        "80",
        "--maxGapMs",
        "1000",
        ...(args.maxAudioFrameAgeMs > 0 ? ["--maxFrameAgeMs", String(args.maxAudioFrameAgeMs)] : []),
        "--requireMonotonicTimestamp",
      ],
      { timeoutMs: Math.max(args.timeoutMs, 35000), env: probeEnv(args) },
    );
  }

  if (args.probeMedia) {
    await runCustomStep(results, args, "Mac host media aggregate", () => checkMediaAggregate(args));
  }

  if (args.probeInputLog) {
    await runStep(
      results,
      args,
      "Mac host input log smoke",
      node,
      [
        "scripts/mac/smoke-mac-input-log.mjs",
        "--host",
        args.host,
        "--port",
        String(args.port),
        "--timeoutMs",
        String(args.timeoutMs),
        "--expectInputMode",
        "log",
      ],
      { timeoutMs: Math.max(args.timeoutMs, 25000), env: probeEnv(args) },
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
      server: args.checkBoard ? args.server : "",
      checkBoard: args.checkBoard,
      promptPassword: args.promptPassword,
      expectBuildId: args.expectBuildId,
      currentBuildId: args.currentBuildId,
      requireCurrentBuildId: args.requireCurrentBuildId,
      skipCurrentBuildCheck: args.skipCurrentBuildCheck,
      requireOpen: args.requireOpen,
      requireControlPermissions: args.requireControlPermissions,
      requireInputMonitoring: args.requireInputMonitoring,
      probeHost: args.probeHost,
      probeVideo: args.probeVideo,
      maxVideoFrameAgeMs: args.maxVideoFrameAgeMs,
      probeAudio: args.probeAudio,
      maxAudioFrameAgeMs: args.maxAudioFrameAgeMs,
      probeMedia: args.probeMedia,
      probeMediaResourceSample: args.probeMediaResourceSample,
      probeInputLog: args.probeInputLog,
      probeClipboardSecurity: args.probeClipboardSecurity,
      probeStartHelper: args.probeStartHelper,
      boardSummary: args.boardSummary,
    },
    passed: results.filter((result) => result.ok).length,
    failed: failed.length,
    warnings: warnings.length,
    commands: {
      macHostSafeStartCommand: makeMacHostSafeStartCommand(args),
      macHostStopCommand: makeMacHostStopCommand(args),
      macMaxFpsSafeStartCommand: makeMacMaxFpsSafeStartCommand(args),
      macResumeStatusCommand: makeMacResumeStatusCommand(args),
      macLaunchAgentPlanCommand: makeMacLaunchAgentPlanCommand(args),
      macMaxFpsPlanCommand: makeMacMaxFpsPlanCommand(args),
      macUnattendedFormalCommand: makeMacUnattendedFormalCommand(args),
      macFormalLocalSmokeCommand: makeMacFormalLocalSmokeCommand(args),
      macPowerPlanCommand: makeMacPowerPlanCommand(),
      macScriptHelpCommand: makeMacScriptHelpCommand(),
      macRemoteAudioPlanCommand: makeMacRemoteAudioPlanCommand(),
      macInputSafetyPlanCommand: makeMacInputSafetyPlanCommand(),
      macClientManualChecklistAction: makeMacClientManualChecklistAction(),
    },
    results: results.map((result) => ({
      label: result.label,
      ok: result.ok,
      exitCode: result.exitCode,
      elapsedMs: result.elapsedMs,
      summary: result.summary,
      warnings: result.warnings,
      errors: result.errors,
      details: result.details,
    })),
  };
  summary.suggestedAction = buildSuggestedAction(summary);
  summary.board = results.find((result) => result.label === "Agent Link Board currentCall")?.details || {
    checked: false,
    ok: null,
    summary: "not checked",
    currentCall: null,
    activeCall: false,
  };
  summary.boardSummary = formatReadinessBoardSummary(summary);

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else if (args.boardSummary) {
    console.log(summary.boardSummary);
  } else {
    print(
      ok ? "OK" : "ERROR",
      ok
        ? `Mac host readiness passed: ${summary.passed}/${results.length} checks`
        : `Mac host readiness failed: ${summary.failed} failed, ${summary.warnings} warnings`,
      args,
    );
    if (!ok && !args.probeHost) {
      print("INFO", "For deeper validation, rerun with --probeHost, --probeVideo, --probeAudio, or --probeInputLog as needed.", args);
    }
    print("NEXT", `Mac host safe start: ${summary.commands.macHostSafeStartCommand}`, args);
    print("NEXT", `Mac host stop: ${summary.commands.macHostStopCommand}`, args);
    print("NEXT", `Mac 60Hz safe foreground start: ${summary.commands.macMaxFpsSafeStartCommand}`, args);
    print("NEXT", `Mac resume status: ${summary.commands.macResumeStatusCommand}`, args);
    print("NEXT", `Mac LaunchAgent dry-run plan: ${summary.commands.macLaunchAgentPlanCommand}`, args);
    print("NEXT", `Mac max FPS dry-run plan: ${summary.commands.macMaxFpsPlanCommand}`, args);
    print("NEXT", `Mac unattended formal 60Hz gate: ${summary.commands.macUnattendedFormalCommand}`, args);
    print("NEXT", `Mac formal local smoke: ${summary.commands.macFormalLocalSmokeCommand}`, args);
    print("NEXT", `Mac power settings dry-run plan: ${summary.commands.macPowerPlanCommand}`, args);
    print("NEXT", `Mac script help safety check: ${summary.commands.macScriptHelpCommand}`, args);
    print("NEXT", `Mac remote-only audio plan: ${summary.commands.macRemoteAudioPlanCommand}`, args);
    print("NEXT", `Mac input safety plan: ${summary.commands.macInputSafetyPlanCommand}`, args);
    print("NEXT", `Mac client manual checklist: ${summary.commands.macClientManualChecklistAction}`, args);
    if (summary.suggestedAction?.id) {
      print("NEXT", `Suggested action: ${summary.suggestedAction.id} · ${summary.suggestedAction.reason}`, args);
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
