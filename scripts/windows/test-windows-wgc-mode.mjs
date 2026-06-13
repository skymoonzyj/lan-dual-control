import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const observeScript = resolve(scriptDir, "observe-windows-host-video.mjs");

const defaults = {
  timeoutMs: 45000,
  durationMs: 6500,
  minFrames: 1,
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-wgc-mode.mjs [options]

Options:
  --timeoutMs <ms>       Overall observer timeout. Default: ${defaults.timeoutMs}
  --durationMs <ms>      WGC-mode observation window. Default: ${defaults.durationMs}
  --minFrames <n>        Minimum frames required from the fallback path. Default: ${defaults.minFrames}
  --help, -h             Show this help without starting a host

Description:
  Starts the Windows video observer with --screenMode wgc and verifies the
  transitional WGC entrypoint reports requestedMode=wgc, screen.wgc diagnostics,
  backendImplemented=false, and an explicit fallback reason.
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
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(5000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    if (token === "--durationMs" && next && !next.startsWith("--")) {
      args.durationMs = Math.max(1000, Number(next) || defaults.durationMs);
      index += 1;
      continue;
    }
    if (token === "--minFrames" && next && !next.startsWith("--")) {
      args.minFrames = Math.max(1, Number(next) || defaults.minFrames);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function runObserver(args) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [
      observeScript,
      "--screenMode",
      "wgc",
      "--requireRealVideo",
      "false",
      "--durationMs",
      String(args.durationMs),
      "--minFrames",
      String(args.minFrames),
      "--minFps",
      "0",
      "--maxGapMs",
      String(Math.max(2000, args.durationMs + 1000)),
      "--resourceSample",
      "false",
      "--json",
    ], {
      cwd: repoRoot,
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

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const result = await runObserver(args);
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(`WGC-mode observer failed${result.timedOut ? " (timeout)" : ""}.\n${result.stdout}\n${result.stderr}`.trim());
  }

  const report = parseObserverJson(result.stdout);
  const screen = report.discoveryScreen || {};
  const wgc = screen.wgc || {};
  const observation = report.observation || {};

  assert(report.ok === true, "observer report was not ok");
  assert(screen.requestedMode === "wgc", `expected requestedMode=wgc, got ${screen.requestedMode || "missing"}`);
  assert(wgc.requested === true, "expected screen.wgc.requested=true");
  assert(wgc.active === false, "expected transitional WGC backend to be inactive");
  assert(wgc.backendImplemented === false, "expected screen.wgc.backendImplemented=false until real WGC capture lands");
  assert(String(wgc.fallbackReason || "").includes("backend is not implemented yet"), "expected WGC fallback reason to mention backend not implemented");
  assert(Array.isArray(observation.requestedScreenModes) && observation.requestedScreenModes.includes("wgc"), "expected observed frames to carry requestedScreenMode=wgc");
  assert(Number(observation.frameCount) >= args.minFrames, `expected at least ${args.minFrames} frame(s), got ${observation.frameCount || 0}`);

  console.log(`[OK] WGC mode entrypoint reports fallback diagnostics: active=${wgc.active}, supported=${wgc.supported}, pipeline=${screen.capturePipeline || "unknown"}`);
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
