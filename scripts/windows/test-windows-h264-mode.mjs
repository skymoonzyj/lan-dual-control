import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const observeScript = resolve(scriptDir, "observe-windows-host-video.mjs");

const defaults = {
  timeoutMs: 45000,
  durationMs: 3000,
  minFrames: 20,
  minFps: 15,
  width: 1280,
  height: 720,
  fps: 30,
  attempts: 4,
  retryDelayMs: 1500,
  captureTimeoutMs: 10000,
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-h264-mode.mjs [options]

Options:
  --timeoutMs <ms>       Overall observer timeout. Default: ${defaults.timeoutMs}
  --durationMs <ms>      H.264 observation window. Default: ${defaults.durationMs}
  --minFrames <n>        Minimum H.264 frames required. Default: ${defaults.minFrames}
  --minFps <n>           Minimum observed FPS. Default: ${defaults.minFps}
  --width <px>           Requested width. Default: ${defaults.width}
  --height <px>          Requested height. Default: ${defaults.height}
  --fps <n>              Requested FPS. Default: ${defaults.fps}
  --attempts <n>         Retry attempts for intermittent gdigrab startup. Default: ${defaults.attempts}
  --retryDelayMs <ms>    Delay between attempts. Default: ${defaults.retryDelayMs}
  --captureTimeoutMs <ms> Host FFmpeg first-frame timeout. Default: ${defaults.captureTimeoutMs}
  --help, -h             Show this help without starting a host

Description:
  Starts a temporary Windows host with --screenMode ffmpeg-h264 and verifies it
  emits real H.264 Annex B frames through the existing WebSocket video_frame
  protocol. This is the Windows-side regression for the stream video path.
`);
}

function parseArgs(argv) {
  const args = { ...defaults, help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    const key = token.slice(2);
    if (Object.prototype.hasOwnProperty.call(args, key) && next && !next.startsWith("--")) {
      args[key] = Number(next) || args[key];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  args.timeoutMs = Math.max(5000, Number(args.timeoutMs) || defaults.timeoutMs);
  args.durationMs = Math.max(1000, Number(args.durationMs) || defaults.durationMs);
  args.minFrames = Math.max(1, Number(args.minFrames) || defaults.minFrames);
  args.minFps = Math.max(0, Number(args.minFps) || defaults.minFps);
  args.width = Math.max(320, Number(args.width) || defaults.width);
  args.height = Math.max(180, Number(args.height) || defaults.height);
  args.fps = Math.max(1, Number(args.fps) || defaults.fps);
  args.attempts = Math.max(1, Number(args.attempts) || defaults.attempts);
  args.retryDelayMs = Math.max(0, Number(args.retryDelayMs) || defaults.retryDelayMs);
  args.captureTimeoutMs = Math.max(1000, Number(args.captureTimeoutMs) || defaults.captureTimeoutMs);
  return args;
}

function runObserver(args) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [
      observeScript,
      "--screenMode",
      "ffmpeg-h264",
      "--preferredVideoCodec",
      "h264",
      "--width",
      String(args.width),
      "--height",
      String(args.height),
      "--fps",
      String(args.fps),
      "--durationMs",
      String(args.durationMs),
      "--minFrames",
      String(args.minFrames),
      "--minFps",
      String(args.minFps),
      "--maxGapMs",
      "1000",
      "--maxFrameAgeMs",
      "1000",
      "--requireMonotonicTimestamp",
      "--resourceSample",
      "false",
      "--json",
    ], {
      cwd: repoRoot,
      env: {
        ...process.env,
        LAN_DUAL_WINDOWS_CAPTURE_TIMEOUT_MS: String(args.captureTimeoutMs),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({ exitCode: null, timedOut: true, stdout, stderr });
    }, args.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({ exitCode: null, timedOut: false, stdout, stderr: `${stderr}\n${error.message}`.trim() });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({ exitCode, timedOut: false, stdout, stderr });
    });
  });
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function parseObserverJson(output) {
  const text = String(output || "").trim().replace(/^\uFEFF/, "");
  if (!text) {
    throw new Error("observer produced no JSON");
  }
  return JSON.parse(text);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateReport(report, args) {
  const screen = report.discoveryScreen || {};
  const session = report.session || {};
  const observation = report.observation || {};
  const codecs = Array.isArray(observation.codecs) ? observation.codecs : [];
  const pipelines = Array.isArray(observation.pipelines) ? observation.pipelines : [];
  const requestedModes = Array.isArray(observation.requestedScreenModes) ? observation.requestedScreenModes : [];

  assert(report.ok === true, "observer report was not ok");
  assert(screen.mode === "ffmpeg-h264", `expected discovery mode ffmpeg-h264, got ${screen.mode || "missing"}`);
  assert(screen.capturePipeline === "windows-ffmpeg-gdigrab-h264", `expected H.264 capture pipeline, got ${screen.capturePipeline || "missing"}`);
  assert(session.capturePipeline === "windows-ffmpeg-gdigrab-h264", `expected session H.264 pipeline, got ${session.capturePipeline || "missing"}`);
  assert(session.hostMode === "windows-host-ffmpeg-h264", `expected hostMode windows-host-ffmpeg-h264, got ${session.hostMode || "missing"}`);
  assert(codecs.includes("h264"), `expected observed h264 codec, got ${codecs.join(", ") || "none"}`);
  assert(pipelines.includes("windows-ffmpeg-gdigrab-h264"), `expected H.264 pipeline in frames, got ${pipelines.join(", ") || "none"}`);
  assert(requestedModes.includes("ffmpeg-h264"), `expected requestedScreenMode ffmpeg-h264, got ${requestedModes.join(", ") || "none"}`);
  assert(Number(observation.frameCount) >= args.minFrames, `expected at least ${args.minFrames} frame(s), got ${observation.frameCount || 0}`);
  assert(Number(observation.fps) >= args.minFps, `expected fps >= ${args.minFps}, got ${observation.fps || 0}`);
  assert(observation.timestampMonotonic === true, "expected monotonic video_frame.timestamp values");

  return { screen, session, observation };
}

function compactFailure(attempt, result, error) {
  const lines = [
    `attempt ${attempt} failed${result?.timedOut ? " (timeout)" : ""}`,
  ];
  if (error?.message) {
    lines.push(error.message);
  }
  const output = `${result?.stdout || ""}\n${result?.stderr || ""}`
    .replace(/\s+/g, " ")
    .trim();
  if (output) {
    lines.push(output.length > 700 ? `${output.slice(0, 697)}...` : output);
  }
  return lines.join(": ");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const failures = [];
  for (let attempt = 1; attempt <= args.attempts; attempt += 1) {
    const result = await runObserver(args);
    try {
      if (result.exitCode !== 0 || result.timedOut) {
        throw new Error(`observer exit=${result.exitCode === null ? "null" : result.exitCode}`);
      }
      const report = parseObserverJson(result.stdout);
      const { observation } = validateReport(report, args);
      console.log(`[OK] Windows host H.264 stream passed on attempt ${attempt}/${args.attempts}: ${observation.frameCount} frames / ${observation.fps} fps / max gap ${observation.maxGapMs}ms`);
      return;
    } catch (error) {
      failures.push(compactFailure(attempt, result, error));
      if (attempt < args.attempts && args.retryDelayMs > 0) {
        await delay(args.retryDelayMs);
      }
    }
  }

  throw new Error(`H.264 observer failed after ${args.attempts} attempt(s).\n${failures.join("\n")}`);
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
