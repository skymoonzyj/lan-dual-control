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
  --help, -h                            Show this help without starting a host

Examples:
  node scripts/windows/observe-windows-host-media.mjs
  node scripts/windows/observe-windows-host-media.mjs --resourceSampleTree true --json
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

function runJsonScript(label, scriptPath, argv, timeoutMs) {
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
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
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

async function runJsonScriptWithRetries(label, scriptPath, argv, timeoutMs, retries, retryDelayMs, args) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      print("WARN", `${label} observation retry ${attempt}/${retries} after: ${lastError.message.split("\n")[0]}`, args);
      if (retryDelayMs > 0) {
        await delay(retryDelayMs);
      }
    }
    try {
      return await runJsonScript(label, scriptPath, argv, timeoutMs);
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
  if (args.json) return;
  console.log(`[${kind}] ${text}`);
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

function makeReport(args, videoRun, audioRun, startedAtIso, finishedAtIso, elapsedMs) {
  const video = videoRun?.result || null;
  const audio = audioRun?.result || null;
  return {
    ok: true,
    startedAt: startedAtIso,
    finishedAt: finishedAtIso,
    elapsedMs,
    target: `${args.host}:${args.port}`,
    useExisting: args.useExisting,
    requested: {
      video: args.skipVideo ? null : {
        width: args.width,
        height: args.height,
        fps: args.fps,
        bandwidthKbps: args.bandwidthKbps,
        qualityPreset: args.qualityPreset,
        durationMs: args.videoDurationMs,
        minFrames: args.videoMinFrames,
        minFps: args.videoMinFps,
        resourceSampleTree: args.videoResourceSampleTree,
      },
      audio: args.skipAudio ? null : {
        audioMode: args.audioMode,
        durationMs: args.audioDurationMs,
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
    },
    video: video ? {
      durationMs: videoRun.durationMs,
      target: video.target,
      session: video.session,
      observation: video.observation,
      resource: video.resource,
    } : null,
    audio: audio ? {
      durationMs: audioRun.durationMs,
      target: audio.target,
      session: audio.session,
      observation: audio.observation,
      resource: audio.resource,
    } : null,
  };
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

  if (!args.skipVideo) {
    print("RUN", `Video baseline ${args.width}x${args.height}/${args.fps}Hz for ${args.videoDurationMs} ms`, args);
    const videoArgs = makeVideoArgs(args);
    if (args.debugCommands) {
      print("DEBUG", formatCommand(videoScript, videoArgs), args);
    }
    videoRun = await runJsonScriptWithRetries(
      "video",
      videoScript,
      videoArgs,
      args.commandTimeoutMs,
      args.videoRetries,
      args.retryDelayMs,
      args,
    );
    const observation = videoRun.result.observation;
    print(
      "OK",
      `Video: ${observation.frameCount} frames, ${observation.fps} FPS, max gap ${observation.maxGapMs} ms, frame age max ${observation.maxFrameAgeMs} ms`,
      args,
    );
    print("INFO", `Video resource: ${resourceSummary(videoRun.result.resource)}`, args);
  }

  if (!args.skipAudio) {
    print("RUN", `Audio baseline ${args.audioMode} for ${args.audioDurationMs} ms`, args);
    const audioArgs = makeAudioArgs(args);
    if (args.debugCommands) {
      print("DEBUG", formatCommand(audioScript, audioArgs), args);
    }
    audioRun = await runJsonScript("audio", audioScript, audioArgs, args.commandTimeoutMs);
    const observation = audioRun.result.observation;
    print(
      "OK",
      `Audio: ${observation.frameCount} frames, steady ${observation.steady.fps} FPS, max gap ${observation.steady.maxGapMs} ms, frame age max ${observation.steady.maxFrameAgeMs} ms`,
      args,
    );
    print("INFO", `Audio resource: ${resourceSummary(audioRun.result.resource)}`, args);
  }

  const finishedAtIso = new Date().toISOString();
  const report = makeReport(args, videoRun, audioRun, startedAtIso, finishedAtIso, Math.round(performance.now() - startedAt));

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    print("OK", `Windows host media baseline passed in ${report.elapsedMs} ms`, args);
  }
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`);
  process.exit(1);
});
