import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const helperDir = resolve(repoRoot, "apps/windows-wgc-helper");
const helperExe = resolve(helperDir, "target/debug/lan-dual-wgc-helper.exe");
const observeScript = resolve(scriptDir, "observe-windows-host-video.mjs");

const defaults = {
  timeoutMs: 90000,
  observerDurationMs: 1200,
  minObserverFrames: 5,
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-wgc-helper.mjs [options]

Options:
  --timeoutMs <ms>          Per command timeout. Default: ${defaults.timeoutMs}
  --observerDurationMs <ms> Node host integration observation window. Default: ${defaults.observerDurationMs}
  --minObserverFrames <n>   Minimum frames in Node host integration check. Default: ${defaults.minObserverFrames}
  --skipObserver            Skip Node host integration check
  --json                    Print JSON summary
  --help, -h                Show this help without building

Description:
  Builds apps/windows-wgc-helper, verifies --probe creates WGC/D3D objects,
  verifies --mock emits json-lines-v1 frames with parseable timestamps, then
  points the Windows host WGC helper mode at the built Rust helper.
`);
}

function parseArgs(argv) {
  const args = { ...defaults, skipObserver: false, json: false, help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--skipObserver") {
      args.skipObserver = true;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(10000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    if (token === "--observerDurationMs" && next && !next.startsWith("--")) {
      args.observerDurationMs = Math.max(500, Number(next) || defaults.observerDurationMs);
      index += 1;
      continue;
    }
    if (token === "--minObserverFrames" && next && !next.startsWith("--")) {
      args.minObserverFrames = Math.max(1, Number(next) || defaults.minObserverFrames);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function runCommand(command, args, { cwd = repoRoot, env = process.env, timeoutMs = defaults.timeoutMs } = {}) {
  return new Promise((resolveRun) => {
    const startedAt = performance.now();
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({
        command,
        args,
        cwd,
        exitCode: null,
        timedOut: true,
        stdout,
        stderr,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({
        command,
        args,
        cwd,
        exitCode: null,
        timedOut: false,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({
        command,
        args,
        cwd,
        exitCode,
        timedOut: false,
        stdout,
        stderr,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    });
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runRequired(command, args, options) {
  const result = await runCommand(command, args, options);
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(`${command} ${args.join(" ")} failed${result.timedOut ? " (timeout)" : ""}.\n${result.stdout}\n${result.stderr}`.trim());
  }
  return result;
}

function parseJsonLines(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
}

async function buildHelper(args) {
  await runRequired("cargo", ["check", "--quiet"], { cwd: helperDir, timeoutMs: args.timeoutMs });
  await runRequired("cargo", ["build", "--quiet"], { cwd: helperDir, timeoutMs: args.timeoutMs });
  assert(existsSync(helperExe), `helper exe not found after build: ${helperExe}`);
  return helperExe;
}

async function probeHelper(args) {
  const result = await runRequired(helperExe, ["--probe"], { cwd: helperDir, timeoutMs: args.timeoutMs });
  const lines = parseJsonLines(result.stdout);
  const probe = lines.find((line) => line.type === "probe");
  assert(probe, "missing probe JSON line");
  assert(probe.ok === true, `expected WGC probe ok=true, got ${JSON.stringify(probe)}`);
  assert(Number(probe.width) > 0 && Number(probe.height) > 0, `invalid WGC probe display size: ${JSON.stringify(probe)}`);
  assert(probe.sessionSupported === true, "expected GraphicsCaptureSession support");
  return probe;
}

async function checkMockFrames(args) {
  const result = await runRequired(helperExe, ["--mock", "--frames", "3", "--fps", "30", "--width", "640", "--height", "360"], {
    cwd: helperDir,
    timeoutMs: args.timeoutMs,
  });
  const lines = parseJsonLines(result.stdout);
  const hello = lines.find((line) => line.type === "hello");
  const frames = lines.filter((line) => line.type === "frame");
  assert(hello?.protocol === "json-lines-v1", `missing helper hello protocol: ${JSON.stringify(hello)}`);
  assert(frames.length === 3, `expected 3 mock frames, got ${frames.length}`);
  for (const frame of frames) {
    assert(Date.parse(String(frame.timestamp || "")) > 0, `frame timestamp is not parseable: ${JSON.stringify(frame)}`);
    assert(String(frame.dataBase64 || "").length > 0, "mock frame missing dataBase64");
  }
  return { hello, frameCount: frames.length };
}

async function checkNodeHostIntegration(args) {
  const env = {
    ...process.env,
    LAN_DUAL_WINDOWS_WGC_HELPER: helperExe,
    LAN_DUAL_WINDOWS_WGC_HELPER_ARGS: "--mock",
  };
  const result = await runRequired(process.execPath, [
    observeScript,
    "--screenMode",
    "wgc",
    "--requireRealVideo",
    "false",
    "--durationMs",
    String(args.observerDurationMs),
    "--minFrames",
    String(args.minObserverFrames),
    "--minFps",
    "0",
    "--maxGapMs",
    String(Math.max(10000, args.observerDurationMs + 6000)),
    "--resourceSample",
    "false",
    "--json",
  ], {
    cwd: repoRoot,
    env,
    timeoutMs: args.timeoutMs,
  });
  const report = JSON.parse(result.stdout.trim().replace(/^\uFEFF/, ""));
  const screen = report.discoveryScreen || {};
  const wgc = screen.wgc || {};
  const observation = report.observation || {};
  assert(report.ok === true, "observer report was not ok");
  assert(screen.capturePipeline === "windows-wgc-helper-jpeg", `expected WGC helper pipeline, got ${screen.capturePipeline || "missing"}`);
  assert(wgc.active === true, `expected screen.wgc.active=true, got ${JSON.stringify(wgc)}`);
  assert(wgc.helperCommand === helperExe, `expected helper command ${helperExe}, got ${wgc.helperCommand || "missing"}`);
  assert(Array.isArray(observation.pipelines) && observation.pipelines.includes("windows-wgc-helper-jpeg"), "observer did not receive WGC helper frames");
  assert(Number(observation.frameCount) >= args.minObserverFrames, `expected at least ${args.minObserverFrames} frames, got ${observation.frameCount || 0}`);
  return { frameCount: observation.frameCount, fps: observation.fps, pipeline: screen.capturePipeline };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const helperPath = await buildHelper(args);
  const probe = await probeHelper(args);
  const mock = await checkMockFrames(args);
  const observer = args.skipObserver ? null : await checkNodeHostIntegration(args);
  const summary = { ok: true, helperPath, probe, mock, observer };
  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`[OK] Rust WGC helper built: ${helperPath}`);
    console.log(`[OK] WGC probe: ${probe.displayName || "display"} ${probe.width}x${probe.height}`);
    console.log(`[OK] Mock contract frames: ${mock.frameCount}`);
    if (observer) {
      console.log(`[OK] Node host integration: ${observer.frameCount} frames via ${observer.pipeline}`);
    }
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
