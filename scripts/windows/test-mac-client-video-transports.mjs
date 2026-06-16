import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const browserTestScript = process.env.LAN_DUAL_MAC_CLIENT_BROWSER_TEST_SCRIPT
  ? resolve(process.env.LAN_DUAL_MAC_CLIENT_BROWSER_TEST_SCRIPT)
  : resolve(scriptDir, "test-mac-client-browser.mjs");

const defaults = {
  basePort: 43820,
  clientPort: 5220,
  debugPort: 9370,
  timeoutMs: 45000,
  observeVideoMs: 900,
  binaryJpegObserveVideoMs: 1200,
  minObservedVideoFrames: 4,
  minObservedVideoFps: 4,
  binaryJpegMinObservedVideoFrames: 5,
  binaryJpegMinObservedVideoFps: 5,
  wgcNv12ObserveVideoMs: 1200,
  wgcNv12MinObservedVideoFrames: 5,
  wgcNv12MinObservedVideoFps: 4,
  retries: 1,
  retryDelayMs: 1500,
  progressIntervalMs: 10000,
  h264Encoder: "",
  wgcHelper: "",
  includeWgcNv12: false,
};

const cases = [
  {
    id: "binary-h264",
    label: "H.264 binary transport",
    args: (settings) => [
      "--expectBinaryH264Video",
      "--allowClipboardFallback",
      "--skipFileClipboard",
      "--observeVideoMs",
      String(settings.observeVideoMs),
      "--minObservedVideoFrames",
      String(settings.minObservedVideoFrames),
      "--minObservedVideoFps",
      String(settings.minObservedVideoFps),
    ],
  },
  {
    id: "h264-json",
    label: "H.264 JSON/base64 compatibility",
    args: (settings) => [
      "--screenMode",
      "ffmpeg-h264",
      "--requireH264Video",
      "--disableBinaryVideo",
      "--allowClipboardFallback",
      "--skipFileClipboard",
      "--observeVideoMs",
      String(settings.observeVideoMs),
      "--minObservedVideoFrames",
      String(settings.minObservedVideoFrames),
      "--minObservedVideoFps",
      String(settings.minObservedVideoFps),
    ],
  },
  {
    id: "h264-fallback",
    label: "H.264 unsupported MJPEG fallback",
    args: (settings) => [
      "--expectH264Fallback",
      "--allowClipboardFallback",
      "--skipFileClipboard",
      "--observeVideoMs",
      String(settings.observeVideoMs),
      "--minObservedVideoFrames",
      String(settings.minObservedVideoFrames),
      "--minObservedVideoFps",
      String(settings.minObservedVideoFps),
    ],
  },
  {
    id: "binary-jpeg",
    label: "JPEG binary transport",
    h264: false,
    args: (settings) => [
      "--expectBinaryVideo",
      "--allowClipboardFallback",
      "--skipFileClipboard",
      "--observeVideoMs",
      String(settings.binaryJpegObserveVideoMs),
      "--minObservedVideoFrames",
      String(settings.binaryJpegMinObservedVideoFrames),
      "--minObservedVideoFps",
      String(settings.binaryJpegMinObservedVideoFps),
    ],
  },
  {
    id: "wgc-nv12-h264",
    label: "WGC NV12 H.264 binary transport",
    default: false,
    h264Encoder: (settings) => settings.h264Encoder || "h264_nvenc",
    args: (settings) => [
      "--expectWgcNv12H264Video",
      ...(settings.wgcHelper ? ["--wgcHelper", settings.wgcHelper] : []),
      "--allowClipboardFallback",
      "--skipFileClipboard",
      "--observeVideoMs",
      String(settings.wgcNv12ObserveVideoMs),
      "--minObservedVideoFrames",
      String(settings.wgcNv12MinObservedVideoFrames),
      "--minObservedVideoFps",
      String(settings.wgcNv12MinObservedVideoFps),
    ],
  },
];

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-mac-client-video-transports.mjs [options]

Options:
  --case <id>             Run one case; can be repeated. Default: all
  --skip <id>             Skip one case; can be repeated
  --basePort <port>       First temporary Windows host port. Default: ${defaults.basePort}
  --clientPort <port>     First Mac client HTTP port. Default: ${defaults.clientPort}
  --debugPort <port>      First browser debugging port. Default: ${defaults.debugPort}
  --timeoutMs <ms>        Per-case browser self-test timeout. Default: ${defaults.timeoutMs}
  --retries <count>       Retry a failed case before stopping. Default: ${defaults.retries}
  --retryDelayMs <ms>     Delay before retrying a failed case. Default: ${defaults.retryDelayMs}
  --progressIntervalMs <ms> Print per-case wait progress every N ms; 0 disables. Default: ${defaults.progressIntervalMs}
  --observeVideoMs <ms>   H.264/fallback observation window. Default: ${defaults.observeVideoMs}
  --binaryJpegObserveVideoMs <ms>  JPEG binary observation window. Default: ${defaults.binaryJpegObserveVideoMs}
  --wgcNv12ObserveVideoMs <ms>     WGC NV12 H.264 observation window. Default: ${defaults.wgcNv12ObserveVideoMs}
  --minObservedVideoFrames <n>     H.264/fallback minimum frames. Default: ${defaults.minObservedVideoFrames}
  --minObservedVideoFps <fps>      H.264/fallback minimum FPS. Default: ${defaults.minObservedVideoFps}
  --wgcNv12MinObservedVideoFrames <n>  WGC NV12 H.264 minimum frames. Default: ${defaults.wgcNv12MinObservedVideoFrames}
  --wgcNv12MinObservedVideoFps <fps>   WGC NV12 H.264 minimum FPS. Default: ${defaults.wgcNv12MinObservedVideoFps}
  --h264Encoder <name>             Optional encoder for H.264 cases, for example h264_nvenc
  --includeWgcNv12                 Include the real WGC NV12 + H.264 case in the default matrix
  --wgcHelper <path>               WGC helper exe for the WGC NV12 H.264 case
  --json                  Print machine-readable summary only
  --verbose               Print each child self-test output
  --help, -h              Show this help without starting browsers or hosts

Cases:
  binary-h264     ffmpeg-h264 + binary-h264 WebSocket payload
  h264-json       ffmpeg-h264 with binary video disabled, old JSON/base64 path
  h264-fallback   forced H.264 unsupported path, then MJPEG/JPEG fallback
  binary-jpeg     WGC JPEG helper + binary-jpeg WebSocket payload
  wgc-nv12-h264   real WGC helper NV12 + NVENC/H.264 + binary-h264 payload

Description:
  Runs the Mac client video transport matrix sequentially with unique ports.
  This script is a guardrail for later WGC/H.264/transport work: one command
  verifies the H.264 binary path, legacy H.264 JSON path, H.264 fallback, and
  JPEG binary path without manually coordinating four browser self-tests. The
  real WGC NV12 H.264 case is opt-in because it requires a built WGC helper and
  a Windows desktop capture context.

Examples:
  node scripts/windows/test-mac-client-video-transports.mjs
  node scripts/windows/test-mac-client-video-transports.mjs --case binary-h264 --case h264-json
  node scripts/windows/test-mac-client-video-transports.mjs --case wgc-nv12-h264
  node scripts/windows/test-mac-client-video-transports.mjs --includeWgcNv12 --h264Encoder h264_nvenc
  node scripts/windows/test-mac-client-video-transports.mjs --json
`);
}

function finiteNumberOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerAtLeast(value, fallback, min) {
  return Math.max(min, Math.trunc(finiteNumberOrDefault(value, fallback)));
}

function numberAtLeast(value, fallback, min) {
  return Math.max(min, finiteNumberOrDefault(value, fallback));
}

function parseArgs(argv) {
  const args = {
    ...defaults,
    selectedCases: [],
    skippedCases: [],
    json: false,
    verbose: false,
    help: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--verbose") {
      args.verbose = true;
      continue;
    }
    if (token === "--includeWgcNv12") {
      args.includeWgcNv12 = true;
      continue;
    }
    if (token === "--h264Encoder" && next && !next.startsWith("--")) {
      args.h264Encoder = next.trim().toLowerCase();
      index += 1;
      continue;
    }
    if (token === "--wgcHelper" && next && !next.startsWith("--")) {
      args.wgcHelper = next.trim();
      index += 1;
      continue;
    }
    if (token === "--case" && next && !next.startsWith("--")) {
      args.selectedCases.push(next);
      index += 1;
      continue;
    }
    if (token === "--skip" && next && !next.startsWith("--")) {
      args.skippedCases.push(next);
      index += 1;
      continue;
    }

    const key = token.startsWith("--") ? token.slice(2) : "";
    if (Object.prototype.hasOwnProperty.call(defaults, key) && next && !next.startsWith("--")) {
      args[key] = Number(next);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  args.basePort = integerAtLeast(args.basePort, defaults.basePort, 1024);
  args.clientPort = integerAtLeast(args.clientPort, defaults.clientPort, 1024);
  args.debugPort = integerAtLeast(args.debugPort, defaults.debugPort, 1024);
  args.timeoutMs = integerAtLeast(args.timeoutMs, defaults.timeoutMs, 5000);
  args.retries = integerAtLeast(args.retries, defaults.retries, 0);
  args.retryDelayMs = integerAtLeast(args.retryDelayMs, defaults.retryDelayMs, 0);
  args.progressIntervalMs = integerAtLeast(args.progressIntervalMs, defaults.progressIntervalMs, 0);
  args.observeVideoMs = integerAtLeast(args.observeVideoMs, defaults.observeVideoMs, 500);
  args.binaryJpegObserveVideoMs = integerAtLeast(args.binaryJpegObserveVideoMs, defaults.binaryJpegObserveVideoMs, 500);
  args.wgcNv12ObserveVideoMs = integerAtLeast(args.wgcNv12ObserveVideoMs, defaults.wgcNv12ObserveVideoMs, 500);
  args.minObservedVideoFrames = integerAtLeast(args.minObservedVideoFrames, defaults.minObservedVideoFrames, 1);
  args.minObservedVideoFps = numberAtLeast(args.minObservedVideoFps, defaults.minObservedVideoFps, 0);
  args.binaryJpegMinObservedVideoFrames = integerAtLeast(args.binaryJpegMinObservedVideoFrames, defaults.binaryJpegMinObservedVideoFrames, 1);
  args.binaryJpegMinObservedVideoFps = numberAtLeast(args.binaryJpegMinObservedVideoFps, defaults.binaryJpegMinObservedVideoFps, 0);
  args.wgcNv12MinObservedVideoFrames = integerAtLeast(args.wgcNv12MinObservedVideoFrames, defaults.wgcNv12MinObservedVideoFrames, 1);
  args.wgcNv12MinObservedVideoFps = numberAtLeast(args.wgcNv12MinObservedVideoFps, defaults.wgcNv12MinObservedVideoFps, 0);
  args.h264Encoder = String(args.h264Encoder || "").trim().toLowerCase();
  args.wgcHelper = String(args.wgcHelper || "").trim();
  return args;
}

function pickCases(args) {
  const known = new Set(cases.map((item) => item.id));
  const unknownSelected = args.selectedCases.filter((id) => !known.has(id));
  const unknownSkipped = args.skippedCases.filter((id) => !known.has(id));
  if (unknownSelected.length > 0 || unknownSkipped.length > 0) {
    throw new Error(`Unknown case(s): ${[...unknownSelected, ...unknownSkipped].join(", ")}`);
  }

  const selected = args.selectedCases.length > 0
    ? cases.filter((item) => args.selectedCases.includes(item.id))
    : cases.filter((item) => item.default !== false || args.includeWgcNv12);
  const skipped = new Set(args.skippedCases);
  return selected.filter((item) => !skipped.has(item.id));
}

function tail(text, maxLines = 24) {
  return String(text || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-maxLines)
    .join("\n");
}

function extractHighlights(output) {
  const lines = String(output || "").split(/\r?\n/);
  return lines
    .filter((line) => /\[OK\] (Binary H\.264 video|H\.264 video|H\.264 fallback|WGC NV12 H\.264 session|Binary JPEG video|Video observe|Display settings|Mac client browser self-test passed)/.test(line))
    .map((line) => line.trim());
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, Math.max(0, ms)));
}

function formatSeconds(ms) {
  const seconds = Math.max(0, Number(ms) || 0) / 1000;
  if (seconds >= 10) {
    return `${seconds.toFixed(0)}s`;
  }
  return `${seconds.toFixed(1)}s`;
}

function progressEveryText(args) {
  return args.progressIntervalMs > 0 ? formatSeconds(args.progressIntervalMs) : "off";
}

function summarizeAttempt(result) {
  return {
    attempt: result.attempt,
    ok: result.ok,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    ports: result.ports,
    highlights: result.highlights,
    tail: result.ok ? "" : tail(`${result.stdout}\n${result.stderr}`, 12),
  };
}

function runCase(testCase, args, index, attempt) {
  return new Promise((resolveRun) => {
    const portOffset = index * (args.retries + 1) + (attempt - 1);
    const port = args.basePort + portOffset;
    const clientPort = args.clientPort + portOffset;
    const debugPort = args.debugPort + portOffset;
    const h264Encoder = typeof testCase.h264Encoder === "function"
      ? testCase.h264Encoder(args)
      : args.h264Encoder;
    const childArgs = [
      browserTestScript,
      "--port",
      String(port),
      "--clientPort",
      String(clientPort),
      "--debugPort",
      String(debugPort),
      "--timeoutMs",
      String(args.timeoutMs),
      "--progressIntervalMs",
      String(args.progressIntervalMs),
      ...(h264Encoder && testCase.h264 !== false ? ["--h264Encoder", h264Encoder] : []),
      ...testCase.args(args),
    ];

    const startedAt = performance.now();
    const child = spawn(process.execPath, childArgs, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const killAfterMs = args.timeoutMs + 20000;
    let settled = false;
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (progressTimer) {
        clearInterval(progressTimer);
      }
      resolveRun(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({
        id: testCase.id,
        label: testCase.label,
        attempt,
        ok: false,
        exitCode: null,
        timedOut: true,
        durationMs: Math.round(performance.now() - startedAt),
        ports: { port, clientPort, debugPort },
        stdout,
        stderr,
        highlights: extractHighlights(`${stdout}\n${stderr}`),
      });
    }, killAfterMs);
    const progressMs = Math.max(0, Number(args.progressIntervalMs) || 0);
    const progressTimer = !args.json && progressMs > 0
      ? setInterval(() => {
        const elapsedMs = performance.now() - startedAt;
        const timeoutLeftMs = Math.max(0, killAfterMs - elapsedMs);
        console.log(
          `[INFO] case ${testCase.id} attempt ${attempt}/${args.retries + 1} progress: ` +
          `elapsed ${formatSeconds(elapsedMs)} / child timeout left ${formatSeconds(timeoutLeftMs)} ` +
          `/ ports host=${port} client=${clientPort} debug=${debugPort}`,
        );
      }, progressMs)
      : null;
    progressTimer?.unref?.();

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      if (args.verbose && !args.json) {
        process.stdout.write(text);
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      if (args.verbose && !args.json) {
        process.stderr.write(text);
      }
    });
    child.on("error", (error) => {
      finish({
        id: testCase.id,
        label: testCase.label,
        attempt,
        ok: false,
        exitCode: null,
        timedOut: false,
        durationMs: Math.round(performance.now() - startedAt),
        ports: { port, clientPort, debugPort },
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
        highlights: extractHighlights(`${stdout}\n${stderr}`),
      });
    });
    child.on("close", (exitCode) => {
      finish({
        id: testCase.id,
        label: testCase.label,
        attempt,
        ok: exitCode === 0,
        exitCode,
        timedOut: false,
        durationMs: Math.round(performance.now() - startedAt),
        ports: { port, clientPort, debugPort },
        stdout,
        stderr,
        highlights: extractHighlights(`${stdout}\n${stderr}`),
      });
    });
  });
}

async function runCaseWithRetries(testCase, args, index) {
  const maxAttempts = args.retries + 1;
  const attempts = [];
  let lastResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastResult = await runCase(testCase, args, index, attempt);
    attempts.push(summarizeAttempt(lastResult));
    if (lastResult.ok) {
      return {
        ...lastResult,
        attempts,
      };
    }

    if (attempt < maxAttempts) {
      if (!args.json) {
        console.log(`[WARN] ${testCase.id}: attempt ${attempt}/${maxAttempts} failed; retrying in ${args.retryDelayMs}ms`);
      }
      await delay(args.retryDelayMs);
    }
  }

  return {
    ...lastResult,
    attempts,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const selectedCases = pickCases(args);
  if (selectedCases.length === 0) {
    throw new Error("No cases selected");
  }

  const results = [];
  if (!args.json) {
    console.log(
      `[INFO] Running ${selectedCases.length} Mac client video transport case(s) sequentially; ` +
      `progressEvery=${progressEveryText(args)}`,
    );
  }

  for (let index = 0; index < selectedCases.length; index += 1) {
    const testCase = selectedCases[index];
    if (!args.json) {
      console.log(
        `[RUN] ${testCase.id} (${index + 1}/${selectedCases.length}): ${testCase.label}; ` +
        `attempts=${args.retries + 1}`,
      );
    }
    const result = await runCaseWithRetries(testCase, args, index);
    results.push(result);
    if (!args.json) {
      const status = result.ok ? "OK" : "FAIL";
      const attemptText = result.attempts.length > 1 ? ` after ${result.attempts.length} attempts` : "";
      console.log(`[${status}] ${testCase.id}: ${result.durationMs}ms${attemptText}`);
      for (const line of result.highlights) {
        console.log(`      ${line}`);
      }
      if (!result.ok) {
        const combinedTail = tail(`${result.stdout}\n${result.stderr}`);
        if (combinedTail) {
          console.log(combinedTail.split(/\r?\n/).map((line) => `      ${line}`).join("\n"));
        }
      }
    }
    if (!result.ok) {
      break;
    }
  }

  const failed = results.filter((result) => !result.ok);
  const summary = {
    ok: failed.length === 0 && results.length === selectedCases.length,
    casesRequested: selectedCases.map((item) => item.id),
    casesCompleted: results.length,
    casesPassed: results.filter((result) => result.ok).length,
    h264Encoder: args.h264Encoder,
    includeWgcNv12: args.includeWgcNv12,
    wgcHelper: args.wgcHelper,
    timeoutMs: args.timeoutMs,
    retries: args.retries,
    retryDelayMs: args.retryDelayMs,
    progressIntervalMs: args.progressIntervalMs,
    results: results.map((result) => ({
      id: result.id,
      label: result.label,
      ok: result.ok,
      attempt: result.attempt,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      ports: result.ports,
      highlights: result.highlights,
      attempts: result.attempts,
      tail: result.ok ? "" : tail(`${result.stdout}\n${result.stderr}`),
    })),
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(summary.ok
      ? `[OK] Mac client video transport matrix passed: ${summary.casesPassed}/${summary.casesRequested.length}`
      : `[FAIL] Mac client video transport matrix failed: ${summary.casesPassed}/${summary.casesRequested.length}`);
  }

  process.exitCode = summary.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
