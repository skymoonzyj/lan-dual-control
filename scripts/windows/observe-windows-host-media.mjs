import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const videoScript = resolve(scriptDir, "observe-windows-host-video.mjs");
const audioScript = resolve(scriptDir, "observe-windows-host-audio.mjs");

const defaults = {
  host: "127.0.0.1",
  port: 43772,
  password: "demo-password",
  useExisting: false,
  width: 1280,
  height: 720,
  fps: 60,
  bandwidthKbps: 50000,
  qualityPreset: "balanced",
  videoDurationMs: 4000,
  videoTimeoutMs: 25000,
  progressIntervalMs: 10000,
  videoMinFrames: 140,
  videoMinFps: 35,
  videoRetries: 1,
  retryDelayMs: 1500,
  videoScreenMode: "auto",
  audioDurationMs: 3500,
  audioTimeoutMs: 25000,
  audioMinFrames: 100,
  audioMinFps: 40,
  audioMode: "wasapi",
  audioScreenMode: "mock",
  warmupFrames: 5,
  maxGapMs: 1000,
  maxFrameAgeMs: 1000,
  requireMonotonicTimestamp: true,
  useDefaultMaxScreenFps: true,
  expectSessionFps: 0,
  requireRealVideo: true,
  requirePcm: true,
  sampleRate: 48000,
  channels: 2,
  frameMs: 20,
  playTone: false,
  requireLevel: false,
  minLevel: 0.02,
  ffmpeg: "",
  resourceSample: true,
  resourceSampleTree: "",
  videoResourceSampleTree: true,
  audioResourceSampleTree: false,
  resourceSampleIntervalMs: 1000,
  resourceSampleTimeoutMs: 3000,
  commandTimeoutMs: 90000,
  debugCommands: false,
  skipVideo: false,
  skipAudio: false,
  json: false,
  boardSummary: false,
  verbose: false,
};

function printUsage() {
  console.log(`Usage:
  node scripts/windows/observe-windows-host-media.mjs [options]

Description:
  Runs Windows host video and audio observations sequentially, then prints one
  media baseline summary. This avoids running temporary video/audio hosts at
  the same time, which can distort capture and resource numbers.

Options:
  --host <host> --port <port> --password <password>
  --useExisting                         Connect to an already running Windows host
  --width <px> --height <px> --fps <n>  Video request (default: ${defaults.width}x${defaults.height}/${defaults.fps}Hz)
  --bandwidthKbps <kbps>                Video max bandwidth (default: ${defaults.bandwidthKbps})
  --qualityPreset <name>                smooth | balanced | sharp | custom
  --videoDurationMs <ms>                Video observation duration (default: ${defaults.videoDurationMs})
  --audioDurationMs <ms>                Audio observation duration (default: ${defaults.audioDurationMs})
  --progressIntervalMs <ms>             Print per-probe progress every N ms; 0 disables. Default: ${defaults.progressIntervalMs}
  --videoMinFrames <n>                  Minimum video frames (default: ${defaults.videoMinFrames})
  --audioMinFrames <n>                  Minimum audio frames (default: ${defaults.audioMinFrames})
  --videoMinFps <n>                     Minimum video FPS (default: ${defaults.videoMinFps})
  --audioMinFps <n>                     Minimum steady audio FPS (default: ${defaults.audioMinFps})
  --videoRetries <n>                    Extra video attempts after a failed real capture
  --retryDelayMs <ms>                   Delay between video attempts
  --maxGapMs <ms>                       Fail if max receive gap is higher
  --maxFrameAgeMs <ms>                  Fail if frame timestamp age is higher
  --requireMonotonicTimestamp false     Disable timestamp monotonicity checks
  --videoScreenMode <auto|ffmpeg|system|mock|wgc>
  --audioMode <wasapi|directshow|mock>
  --audioScreenMode <mode>              Temporary audio host screen mode
  --resourceSample false                Disable local Windows host resource sampling
  --resourceSampleTree <true|false>     Apply process-tree sampling to both probes
  --videoResourceSampleTree <true|false>
  --audioResourceSampleTree <true|false>
  --playTone                            Play a local test tone during audio probe
  --requireLevel                        Require audio level above --minLevel
  --skipVideo                           Only run audio observation
  --skipAudio                           Only run video observation
  --debugCommands                       Print child observer commands before running
  --json                                Print JSON result only
  --boardSummary                        Print one secret-free Agent Link Board summary line
  --help, -h                            Show this help without starting a host

Examples:
  node scripts/windows/observe-windows-host-media.mjs
  node scripts/windows/observe-windows-host-media.mjs --resourceSampleTree true --json
  node scripts/windows/observe-windows-host-media.mjs --resourceSampleTree true --boardSummary
  node scripts/windows/observe-windows-host-media.mjs --useExisting --host 127.0.0.1 --port 43770
`);
}

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new Error(`Unknown argument: ${token}`);
    }

    const key = token.slice(2);
    if (!Object.prototype.hasOwnProperty.call(args, key)) {
      throw new Error(`Unknown argument: ${token}`);
    }

    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }

  args.port = Number(args.port) || defaults.port;
  args.width = Number(args.width) || defaults.width;
  args.height = Number(args.height) || defaults.height;
  args.fps = Number(args.fps) || defaults.fps;
  args.bandwidthKbps = Number(args.bandwidthKbps) || defaults.bandwidthKbps;
  args.videoDurationMs = Number(args.videoDurationMs) || defaults.videoDurationMs;
  args.videoTimeoutMs = Number(args.videoTimeoutMs) || defaults.videoTimeoutMs;
  const progressIntervalMs = Number(args.progressIntervalMs);
  args.progressIntervalMs = Number.isFinite(progressIntervalMs)
    ? Math.max(0, progressIntervalMs)
    : defaults.progressIntervalMs;
  args.videoMinFrames = Number(args.videoMinFrames) || defaults.videoMinFrames;
  args.videoMinFps = Number(args.videoMinFps) || defaults.videoMinFps;
  args.videoRetries = Math.max(0, Number(args.videoRetries) || 0);
  args.retryDelayMs = Math.max(0, Number(args.retryDelayMs) || defaults.retryDelayMs);
  args.audioDurationMs = Number(args.audioDurationMs) || defaults.audioDurationMs;
  args.audioTimeoutMs = Number(args.audioTimeoutMs) || defaults.audioTimeoutMs;
  args.audioMinFrames = Number(args.audioMinFrames) || defaults.audioMinFrames;
  args.audioMinFps = Number(args.audioMinFps) || defaults.audioMinFps;
  args.warmupFrames = Number(args.warmupFrames) || defaults.warmupFrames;
  args.maxGapMs = Number(args.maxGapMs) || defaults.maxGapMs;
  args.maxFrameAgeMs = Math.max(0, Number(args.maxFrameAgeMs) || 0);
  args.expectSessionFps = Math.max(0, Number(args.expectSessionFps) || 0);
  args.sampleRate = Number(args.sampleRate) || defaults.sampleRate;
  args.channels = Number(args.channels) || defaults.channels;
  args.frameMs = Number(args.frameMs) || defaults.frameMs;
  args.minLevel = Number(args.minLevel) || defaults.minLevel;
  args.resourceSampleIntervalMs = Math.max(250, Number(args.resourceSampleIntervalMs) || defaults.resourceSampleIntervalMs);
  args.resourceSampleTimeoutMs = Math.max(1000, Number(args.resourceSampleTimeoutMs) || defaults.resourceSampleTimeoutMs);
  args.commandTimeoutMs = Math.max(10000, Number(args.commandTimeoutMs) || defaults.commandTimeoutMs);

  args.host = String(args.host || defaults.host).trim();
  args.password = String(args.password || defaults.password);
  args.qualityPreset = String(args.qualityPreset || defaults.qualityPreset).trim();
  args.videoScreenMode = String(args.videoScreenMode || defaults.videoScreenMode).trim().toLowerCase();
  args.audioMode = String(args.audioMode || defaults.audioMode).trim().toLowerCase();
  args.audioScreenMode = String(args.audioScreenMode || defaults.audioScreenMode).trim().toLowerCase();
  args.ffmpeg = String(args.ffmpeg || "").trim();

  args.useExisting = booleanArg(args.useExisting);
  args.requireMonotonicTimestamp = booleanArg(args.requireMonotonicTimestamp, true);
  args.useDefaultMaxScreenFps = booleanArg(args.useDefaultMaxScreenFps, true);
  args.requireRealVideo = booleanArg(args.requireRealVideo, true);
  args.requirePcm = booleanArg(args.requirePcm, true);
  args.playTone = booleanArg(args.playTone);
  args.requireLevel = booleanArg(args.requireLevel);
  args.resourceSample = booleanArg(args.resourceSample, true);
  args.skipVideo = booleanArg(args.skipVideo);
  args.skipAudio = booleanArg(args.skipAudio);
  args.debugCommands = booleanArg(args.debugCommands);
  args.json = booleanArg(args.json);
  args.boardSummary = booleanArg(args.boardSummary);
  args.verbose = booleanArg(args.verbose);

  if (args.expectSessionFps === 0 && args.useDefaultMaxScreenFps) {
    args.expectSessionFps = args.fps;
  }

  if (args.resourceSampleTree !== "") {
    const includeTree = booleanArg(args.resourceSampleTree);
    args.videoResourceSampleTree = includeTree;
    args.audioResourceSampleTree = includeTree;
  } else {
    args.videoResourceSampleTree = booleanArg(args.videoResourceSampleTree, true);
    args.audioResourceSampleTree = booleanArg(args.audioResourceSampleTree, false);
  }

  if (args.skipVideo && args.skipAudio) {
    throw new Error("--skipVideo and --skipAudio cannot both be set");
  }

  return args;
}

function booleanArg(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (value === true || value === false) return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function addArg(argv, name, value) {
  if (value === undefined || value === null || value === "") return;
  argv.push(name, String(value));
}

function addFlag(argv, name, enabled) {
  if (enabled) argv.push(name);
}

function makeVideoArgs(args) {
  const argv = [];
  addArg(argv, "--host", args.host);
  addArg(argv, "--port", args.port);
  addArg(argv, "--password", args.password);
  addArg(argv, "--durationMs", args.videoDurationMs);
  addArg(argv, "--timeoutMs", args.videoTimeoutMs);
  addArg(argv, "--progressIntervalMs", args.progressIntervalMs);
  addArg(argv, "--width", args.width);
  addArg(argv, "--height", args.height);
  addArg(argv, "--fps", args.fps);
  addArg(argv, "--bandwidthKbps", args.bandwidthKbps);
  addArg(argv, "--qualityPreset", args.qualityPreset);
  addArg(argv, "--minFrames", args.videoMinFrames);
  addArg(argv, "--minFps", args.videoMinFps);
  addArg(argv, "--maxGapMs", args.maxGapMs);
  addArg(argv, "--maxFrameAgeMs", args.maxFrameAgeMs);
  addArg(argv, "--screenMode", args.videoScreenMode);
  addArg(argv, "--resourceSample", args.resourceSample);
  addArg(argv, "--resourceSampleIntervalMs", args.resourceSampleIntervalMs);
  addArg(argv, "--resourceSampleTree", args.videoResourceSampleTree);
  addArg(argv, "--resourceSampleTimeoutMs", args.resourceSampleTimeoutMs);
  addArg(argv, "--requireRealVideo", args.requireRealVideo);
  addFlag(argv, "--useExisting", args.useExisting);
  addFlag(argv, "--useDefaultMaxScreenFps", args.useDefaultMaxScreenFps);
  if (args.expectSessionFps > 0) addArg(argv, "--expectSessionFps", args.expectSessionFps);
  addFlag(argv, "--requireMonotonicTimestamp", args.requireMonotonicTimestamp);
  addArg(argv, "--ffmpeg", args.ffmpeg);
  addFlag(argv, "--verbose", args.verbose);
  addFlag(argv, "--json", true);
  return argv;
}

function makeAudioArgs(args) {
  const argv = [];
  addArg(argv, "--host", args.host);
  addArg(argv, "--port", args.port);
  addArg(argv, "--password", args.password);
  addArg(argv, "--durationMs", args.audioDurationMs);
  addArg(argv, "--timeoutMs", args.audioTimeoutMs);
  addArg(argv, "--progressIntervalMs", args.progressIntervalMs);
  addArg(argv, "--minFrames", args.audioMinFrames);
  addArg(argv, "--minFps", args.audioMinFps);
  addArg(argv, "--maxGapMs", args.maxGapMs);
  addArg(argv, "--maxFrameAgeMs", args.maxFrameAgeMs);
  addArg(argv, "--audioMode", args.audioMode);
  addArg(argv, "--screenMode", args.audioScreenMode);
  addArg(argv, "--warmupFrames", args.warmupFrames);
  addArg(argv, "--sampleRate", args.sampleRate);
  addArg(argv, "--channels", args.channels);
  addArg(argv, "--frameMs", args.frameMs);
  addArg(argv, "--requirePcm", args.requirePcm);
  addArg(argv, "--resourceSample", args.resourceSample);
  addArg(argv, "--resourceSampleIntervalMs", args.resourceSampleIntervalMs);
  addArg(argv, "--resourceSampleTree", args.audioResourceSampleTree);
  addArg(argv, "--resourceSampleTimeoutMs", args.resourceSampleTimeoutMs);
  addFlag(argv, "--useExisting", args.useExisting);
  addFlag(argv, "--requireMonotonicTimestamp", args.requireMonotonicTimestamp);
  addFlag(argv, "--playTone", args.playTone);
  addFlag(argv, "--requireLevel", args.requireLevel);
  addArg(argv, "--minLevel", args.minLevel);
  addArg(argv, "--ffmpeg", args.ffmpeg);
  addFlag(argv, "--verbose", args.verbose);
  addFlag(argv, "--json", true);
  return argv;
}

function formatSeconds(ms) {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

function progressEveryText(args) {
  return args.progressIntervalMs > 0 ? formatSeconds(args.progressIntervalMs) : "off";
}

function runJsonScript(label, scriptPath, argv, timeoutMs, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const startedAt = performance.now();
    const child = spawn(process.execPath, [scriptPath, ...argv], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const progressIntervalMs = Math.max(0, Number(options.progressIntervalMs) || 0);
    const progressArgs = options.args;
    const expectedDurationMs = Math.max(0, Number(options.expectedDurationMs) || 0);
    const cleanupTimers = () => {
      clearTimeout(timer);
      if (progressTimer) {
        clearInterval(progressTimer);
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const progressTimer = progressIntervalMs > 0
      ? setInterval(() => {
        const elapsedMs = Math.round(performance.now() - startedAt);
        const expectedLeftMs = expectedDurationMs > 0 ? Math.max(0, expectedDurationMs - elapsedMs) : 0;
        const timeoutLeftMs = Math.max(0, timeoutMs - elapsedMs);
        const leftText = expectedDurationMs > 0
          ? `${formatSeconds(expectedLeftMs)} expected left`
          : `${formatSeconds(timeoutLeftMs)} timeout left`;
        print(
          "INFO",
          `${label} observation progress: ${formatSeconds(elapsedMs)} elapsed / ${leftText} / timeout=${formatSeconds(timeoutMs)}.`,
          progressArgs,
        );
      }, progressIntervalMs)
      : null;
    progressTimer?.unref?.();

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      cleanupTimers();
      rejectRun(error);
    });
    child.on("close", (exitCode) => {
      cleanupTimers();
      const durationMs = Math.round(performance.now() - startedAt);
      if (timedOut) {
        rejectRun(new Error(`${label} observation timed out after ${timeoutMs} ms`));
        return;
      }
      if (exitCode !== 0) {
        const stdoutTail = stdout.trim().slice(-1200);
        const stderrTail = stderr.trim().slice(-1200);
        const details = [
          stderrTail ? `stderr: ${stderrTail}` : "",
          stdoutTail ? `stdout: ${stdoutTail}` : "",
          !stderrTail && !stdoutTail ? `exit ${exitCode}` : "",
        ].filter(Boolean).join("\n");
        rejectRun(new Error(`${label} observation failed:\n${details}`));
        return;
      }
      try {
        resolveRun({
          durationMs,
          result: JSON.parse(stdout.trim()),
        });
      } catch (error) {
        rejectRun(new Error(`${label} observation returned invalid JSON: ${error.message}`));
      }
    });
  });
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function runJsonScriptWithRetries(label, scriptPath, argv, timeoutMs, retries, retryDelayMs, args, options = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      print("WARN", `${label} observation retry ${attempt}/${retries} after: ${lastError.message.split("\n")[0]}`, args);
      if (retryDelayMs > 0) {
        await delay(retryDelayMs);
      }
    }
    try {
      return await runJsonScript(label, scriptPath, argv, timeoutMs, options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function formatCommand(scriptPath, argv) {
  return [
    process.execPath,
    scriptPath,
    ...argv,
  ].map((part) => {
    const text = String(part);
    return /\s/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
  }).join(" ");
}

function print(kind, text, args) {
  if (args.json || args.boardSummary) return;
  console.log(`[${kind}] ${text}`);
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
  const rounded = Number(value).toFixed(digits);
  return rounded.replace(/\.?0+$/, "");
}

function formatBitrate(kbps) {
  const value = Number(kbps);
  if (!Number.isFinite(value) || value <= 0) return "n/a";
  if (value >= 1000) return `${formatNumber(value / 1000, 1)}Mbps`;
  return `${formatNumber(value, 0)}Kbps`;
}

function videoBoardFragment(video) {
  if (!video) return "video=skipped";
  const observation = video.observation || {};
  const session = video.session || {};
  const size = observation.width && observation.height
    ? `${observation.width}x${observation.height}`
    : session.width && session.height
      ? `${session.width}x${session.height}`
      : "unknown-size";
  const pipeline = session.capturePipeline || firstValue(observation.pipelines) || "unknown-pipeline";
  const codec = session.videoCodec || firstValue(observation.codecs) || "unknown-codec";
  const fps = formatNumber(observation.fps);
  const freshFps = Number(observation.freshFps) > 0 ? ` fresh=${formatNumber(observation.freshFps)}fps` : "";
  const repeated = Number(observation.repeatedFramePercent) > 0
    ? ` repeat=${formatNumber(observation.repeatedFramePercent, 1)}%`
    : "";
  return [
    `video=${observation.frameCount ?? "n/a"}f/${fps}fps${freshFps}${repeated}`,
    size,
    `${pipeline}/${codec}`,
    `gapMax=${formatNumber(observation.maxGapMs, 0)}ms`,
    `ageMax=${formatNumber(observation.maxFrameAgeMs, 0)}ms`,
  ].join(" ");
}

function audioBoardFragment(audio) {
  if (!audio) return "audio=skipped";
  const observation = audio.observation || {};
  const steady = observation.steady || {};
  const session = audio.session || {};
  const mode = session.audioMode || firstValue(observation.audioModes) || "unknown-mode";
  const codec = session.audioCodec || firstValue(observation.codecs) || "unknown-codec";
  const encoding = session.audioEncoding || firstValue(observation.encodings) || "unknown-encoding";
  return [
    `audio=${observation.frameCount ?? "n/a"}f steady=${formatNumber(steady.fps ?? observation.fps)}fps`,
    `${mode}/${codec}/${encoding}`,
    `gapMax=${formatNumber(steady.maxGapMs ?? observation.maxGapMs, 0)}ms`,
    `ageMax=${formatNumber(steady.maxFrameAgeMs ?? observation.maxFrameAgeMs, 0)}ms`,
    Number(observation.maxLevel) > 0 ? `levelMax=${formatNumber(observation.maxLevel, 3)}` : "",
  ].filter(Boolean).join(" ");
}

function resourceBoardFragment(report) {
  const resources = [report.video?.resource, report.audio?.resource].filter(Boolean);
  const available = resources.filter((resource) => resource?.available);
  if (!resources.length) return "resource=none";
  if (!available.length) return "resource=off";
  const cpuMax = Math.max(...available
    .map((resource) => Number(resource.maxCpuPercent))
    .filter((value) => Number.isFinite(value)));
  const memoryMax = Math.max(...available
    .map((resource) => Number(resource.peakWorkingSetMiB))
    .filter((value) => Number.isFinite(value)));
  const parts = ["resource=sampled"];
  if (Number.isFinite(cpuMax)) parts.push(`cpuMax=${formatNumber(cpuMax, 1)}%`);
  if (Number.isFinite(memoryMax)) parts.push(`rssMax=${formatNumber(memoryMax, 1)}MiB`);
  return parts.join(" ");
}

function firstValue(values) {
  return Array.isArray(values) && values.length ? values[0] : "";
}

function makeRequested(args) {
  return {
    video: args.skipVideo ? null : {
      width: args.width,
      height: args.height,
      fps: args.fps,
      bandwidthKbps: args.bandwidthKbps,
      qualityPreset: args.qualityPreset,
      durationMs: args.videoDurationMs,
      progressIntervalMs: args.progressIntervalMs,
      minFrames: args.videoMinFrames,
      minFps: args.videoMinFps,
      resourceSampleTree: args.videoResourceSampleTree,
    },
    audio: args.skipAudio ? null : {
      audioMode: args.audioMode,
      durationMs: args.audioDurationMs,
      progressIntervalMs: args.progressIntervalMs,
      minFrames: args.audioMinFrames,
      minFps: args.audioMinFps,
      resourceSampleTree: args.audioResourceSampleTree,
      playTone: args.playTone,
      requireLevel: args.requireLevel,
    },
    maxGapMs: args.maxGapMs,
    maxFrameAgeMs: args.maxFrameAgeMs,
    requireMonotonicTimestamp: args.requireMonotonicTimestamp,
    resourceSample: args.resourceSample,
    progressIntervalMs: args.progressIntervalMs,
  };
}

function observationFragment(run) {
  const result = run?.result;
  if (!result) return null;
  return {
    durationMs: run.durationMs,
    target: result.target,
    session: result.session,
    observation: result.observation,
    resource: result.resource,
  };
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactSecrets(text, args) {
  let sanitized = String(text || "");
  const secrets = new Set([
    args?.password,
    process.env.LAN_DUAL_PASSWORD,
    defaults.password,
  ].filter((value) => value && String(value).length >= 3));

  for (const secret of secrets) {
    sanitized = sanitized.replace(new RegExp(escapeRegExp(secret), "g"), "[redacted]");
  }

  sanitized = sanitized.replace(/(--password\s+)(?:"[^"]*"|\S+)/gi, "$1[redacted]");
  sanitized = sanitized.replace(/(LAN_DUAL_PASSWORD\s*=\s*)(?:"[^"]*"|'[^']*'|\S+)/gi, "$1[redacted]");
  return sanitized;
}

function compactText(text, maxLength = 240) {
  const compacted = String(text || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (compacted.length <= maxLength) return compacted;
  return `${compacted.slice(0, Math.max(0, maxLength - 3))}...`;
}

function errorSummary(error, args) {
  const sanitized = redactSecrets(error?.message || String(error || ""), args);
  const firstLine = sanitized.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return compactText((firstLine || "unknown error").replace(/:$/, ""), 180);
}

function makeFailure(id, label, error, args) {
  return {
    id,
    label,
    summary: errorSummary(error, args),
    message: redactSecrets(error?.message || String(error || ""), args).slice(0, 2400),
  };
}

function failureSummaryText(failures) {
  if (!Array.isArray(failures) || failures.length === 0) return "unknown error";
  if (failures.length === 1) return failures[0].summary || "unknown error";
  return failures
    .map((failure) => `${failure.id || failure.label}: ${failure.summary || "unknown error"}`)
    .join("; ");
}

function probeFailure(report, id) {
  return report.summary?.failures?.find((failure) => failure.id === id) || null;
}

function probeBoardFragment(report, id, fragment) {
  const failure = probeFailure(report, id);
  if (failure) {
    return `${id}=failed reason=${compactText(failure.summary || "unknown error", 120)}`;
  }
  return fragment;
}

function mediaStatusFromCounts(ok, passed, failed) {
  if (ok) return "ok";
  return Number(passed) > 0 && Number(failed) > 0 ? "partial" : "failed";
}

function mediaStatus(report) {
  if (typeof report.summary?.status === "string" && report.summary.status) {
    return report.summary.status;
  }
  const passed = Number(report.summary?.passed) || 0;
  const failed = Number(report.summary?.failed) || 0;
  return mediaStatusFromCounts(report.ok, passed, failed);
}

function makeBoardSummary(report) {
  const requested = report.requested || {};
  const requestedVideo = requested.video
    ? `${report.requested.video.width}x${report.requested.video.height}@${report.requested.video.fps}Hz/${formatBitrate(report.requested.video.bandwidthKbps)}/${report.requested.video.qualityPreset}`
    : "video=skipped";
  const requestedAudio = requested.audio
    ? `${report.requested.audio.audioMode}/${report.requested.audio.durationMs}ms`
    : "audio=skipped";
  const parts = [
    `Windows media: ${mediaStatus(report)}`,
    `target=${report.target}`,
    `elapsed=${report.elapsedMs}ms`,
    `request=${requestedVideo};${requestedAudio}`,
  ];
  if (!report.ok) {
    parts.push(`error=${compactText(failureSummaryText(report.summary?.failures) || report.error?.summary || report.error?.message || "unknown error", 180)}`);
  }
  parts.push(
    probeBoardFragment(report, "video", videoBoardFragment(report.video)),
    probeBoardFragment(report, "audio", audioBoardFragment(report.audio)),
    resourceBoardFragment(report),
    "No passwords in summary; no input/inject.",
  );
  return parts.join(" | ");
}

function resourceSummary(resource) {
  if (!resource?.available) return "unavailable";
  if (!resource.peakProcessCount) return `no process samples, samples ${resource.sampleCount}`;
  const cpu = resource.sampleCount >= 2 && resource.avgCpuPercent !== null
    ? `${resource.avgCpuPercent}/${resource.maxCpuPercent}%`
    : "insufficient samples";
  const memory = resource.peakWorkingSetMiB !== null
    ? `${resource.peakWorkingSetMiB} MiB`
    : "unknown";
  return `CPU avg/max ${cpu}, working set peak ${memory}, samples ${resource.sampleCount}`;
}

function makeReport(args, videoRun, audioRun, failures, startedAtIso, finishedAtIso, elapsedMs) {
  const failed = Array.isArray(failures) ? failures : [];
  const passedCount = [videoRun, audioRun].filter(Boolean).length;
  const failedCount = failed.length;
  const report = {
    ok: failedCount === 0,
    startedAt: startedAtIso,
    finishedAt: finishedAtIso,
    elapsedMs,
    target: `${args.host}:${args.port}`,
    useExisting: args.useExisting,
    requested: makeRequested(args),
    video: observationFragment(videoRun),
    audio: observationFragment(audioRun),
    summary: {
      status: mediaStatusFromCounts(failedCount === 0, passedCount, failedCount),
      passed: passedCount,
      failed: failedCount,
      failures: failed.map((failure) => ({
        id: failure.id,
        label: failure.label,
        summary: failure.summary,
      })),
      skipped: [
        args.skipVideo ? "video" : "",
        args.skipAudio ? "audio" : "",
      ].filter(Boolean),
      noInput: true,
      noInject: true,
    },
  };
  if (!report.ok) {
    report.error = {
      summary: failureSummaryText(failed),
      message: failed.map((failure) => `${failure.label}: ${failure.message}`).join("\n"),
    };
  }
  report.boardSummary = makeBoardSummary(report);
  return report;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printUsage();
    return;
  }

  const startedAt = performance.now();
  const startedAtIso = new Date().toISOString();
  let videoRun = null;
  let audioRun = null;
  const failures = [];

  if (!args.skipVideo) {
    print("RUN", `Video baseline ${args.width}x${args.height}/${args.fps}Hz for ${args.videoDurationMs} ms, progressEvery=${progressEveryText(args)}`, args);
    const videoArgs = makeVideoArgs(args);
    if (args.debugCommands) {
      print("DEBUG", formatCommand(videoScript, videoArgs), args);
    }
    try {
      videoRun = await runJsonScriptWithRetries(
        "video",
        videoScript,
        videoArgs,
        args.commandTimeoutMs,
        args.videoRetries,
        args.retryDelayMs,
        args,
        {
          args,
          expectedDurationMs: args.videoDurationMs,
          progressIntervalMs: args.progressIntervalMs,
        },
      );
      const observation = videoRun.result.observation;
      print(
        "OK",
        `Video: ${observation.frameCount} frames, ${observation.fps} FPS, max gap ${observation.maxGapMs} ms, frame age max ${observation.maxFrameAgeMs} ms`,
        args,
      );
      print("INFO", `Video resource: ${resourceSummary(videoRun.result.resource)}`, args);
    } catch (error) {
      const failure = makeFailure("video", "Video", error, args);
      failures.push(failure);
      print("FAIL", `Video: ${failure.summary}`, args);
    }
  }

  if (!args.skipAudio) {
    print("RUN", `Audio baseline ${args.audioMode} for ${args.audioDurationMs} ms, progressEvery=${progressEveryText(args)}`, args);
    const audioArgs = makeAudioArgs(args);
    if (args.debugCommands) {
      print("DEBUG", formatCommand(audioScript, audioArgs), args);
    }
    try {
      audioRun = await runJsonScript("audio", audioScript, audioArgs, args.commandTimeoutMs, {
        args,
        expectedDurationMs: args.audioDurationMs,
        progressIntervalMs: args.progressIntervalMs,
      });
      const observation = audioRun.result.observation;
      print(
        "OK",
        `Audio: ${observation.frameCount} frames, steady ${observation.steady.fps} FPS, max gap ${observation.steady.maxGapMs} ms, frame age max ${observation.steady.maxFrameAgeMs} ms`,
        args,
      );
      print("INFO", `Audio resource: ${resourceSummary(audioRun.result.resource)}`, args);
    } catch (error) {
      const failure = makeFailure("audio", "Audio", error, args);
      failures.push(failure);
      print("FAIL", `Audio: ${failure.summary}`, args);
    }
  }

  const finishedAtIso = new Date().toISOString();
  const report = makeReport(args, videoRun, audioRun, failures, startedAtIso, finishedAtIso, Math.round(performance.now() - startedAt));

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else if (!report.ok) {
    console.error(`[ERROR] ${report.error.message}`);
  } else {
    print("OK", `Windows host media baseline passed in ${report.elapsedMs} ms`, args);
  }
  if (!report.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`);
  process.exit(1);
});
