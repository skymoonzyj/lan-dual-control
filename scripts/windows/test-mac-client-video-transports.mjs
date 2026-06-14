import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const browserTestScript = resolve(scriptDir, "test-mac-client-browser.mjs");

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
  --observeVideoMs <ms>   H.264/fallback observation window. Default: ${defaults.observeVideoMs}
  --binaryJpegObserveVideoMs <ms>  JPEG binary observation window. Default: ${defaults.binaryJpegObserveVideoMs}
  --minObservedVideoFrames <n>     H.264/fallback minimum frames. Default: ${defaults.minObservedVideoFrames}
  --minObservedVideoFps <fps>      H.264/fallback minimum FPS. Default: ${defaults.minObservedVideoFps}
  --json                  Print machine-readable summary only
  --verbose               Print each child self-test output
  --help, -h              Show this help without starting browsers or hosts

Cases:
  binary-h264     ffmpeg-h264 + binary-h264 WebSocket payload
  h264-json       ffmpeg-h264 with binary video disabled, old JSON/base64 path
  h264-fallback   forced H.264 unsupported path, then MJPEG/JPEG fallback
  binary-jpeg     WGC JPEG helper + binary-jpeg WebSocket payload

Description:
  Runs the Mac client video transport matrix sequentially with unique ports.
  This script is a guardrail for later WGC/H.264/transport work: one command
  verifies the H.264 binary path, legacy H.264 JSON path, H.264 fallback, and
  JPEG binary path without manually coordinating four browser self-tests.

Examples:
  node scripts/windows/test-mac-client-video-transports.mjs
  node scripts/windows/test-mac-client-video-transports.mjs --case binary-h264 --case h264-json
  node scripts/windows/test-mac-client-video-transports.mjs --json
`);
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
      args[key] = Number(next) || defaults[key];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  args.basePort = Math.max(1024, Number(args.basePort) || defaults.basePort);
  args.clientPort = Math.max(1024, Number(args.clientPort) || defaults.clientPort);
  args.debugPort = Math.max(1024, Number(args.debugPort) || defaults.debugPort);
  args.timeoutMs = Math.max(5000, Number(args.timeoutMs) || defaults.timeoutMs);
  args.observeVideoMs = Math.max(500, Number(args.observeVideoMs) || defaults.observeVideoMs);
  args.binaryJpegObserveVideoMs = Math.max(500, Number(args.binaryJpegObserveVideoMs) || defaults.binaryJpegObserveVideoMs);
  args.minObservedVideoFrames = Math.max(1, Number(args.minObservedVideoFrames) || defaults.minObservedVideoFrames);
  args.minObservedVideoFps = Math.max(0, Number(args.minObservedVideoFps) || defaults.minObservedVideoFps);
  args.binaryJpegMinObservedVideoFrames = Math.max(1, Number(args.binaryJpegMinObservedVideoFrames) || defaults.binaryJpegMinObservedVideoFrames);
  args.binaryJpegMinObservedVideoFps = Math.max(0, Number(args.binaryJpegMinObservedVideoFps) || defaults.binaryJpegMinObservedVideoFps);
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
    : [...cases];
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
    .filter((line) => /\[OK\] (Binary H\.264 video|H\.264 video|H\.264 fallback|Binary JPEG video|Video observe|Display settings|Mac client browser self-test passed)/.test(line))
    .map((line) => line.trim());
}

function runCase(testCase, args, index) {
  return new Promise((resolveRun) => {
    const port = args.basePort + index;
    const clientPort = args.clientPort + index;
    const debugPort = args.debugPort + index;
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
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({
        id: testCase.id,
        label: testCase.label,
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
      clearTimeout(timer);
      resolveRun({
        id: testCase.id,
        label: testCase.label,
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
      clearTimeout(timer);
      resolveRun({
        id: testCase.id,
        label: testCase.label,
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
    console.log(`[INFO] Running ${selectedCases.length} Mac client video transport case(s) sequentially`);
  }

  for (let index = 0; index < selectedCases.length; index += 1) {
    const testCase = selectedCases[index];
    if (!args.json) {
      console.log(`[RUN] ${testCase.id}: ${testCase.label}`);
    }
    const result = await runCase(testCase, args, index);
    results.push(result);
    if (!args.json) {
      const status = result.ok ? "OK" : "FAIL";
      console.log(`[${status}] ${testCase.id}: ${result.durationMs}ms`);
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
    timeoutMs: args.timeoutMs,
    results: results.map((result) => ({
      id: result.id,
      label: result.label,
      ok: result.ok,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      ports: result.ports,
      highlights: result.highlights,
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
