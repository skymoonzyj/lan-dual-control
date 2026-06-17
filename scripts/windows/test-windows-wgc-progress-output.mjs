import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const benchmarkScript = resolve(scriptDir, "benchmark-windows-wgc-settings.mjs");
const compareScript = resolve(scriptDir, "compare-windows-wgc-h264-sources.mjs");
const benchmarkPowerShellScript = "scripts/windows/benchmark-windows-wgc-settings.ps1";
const comparePowerShellScript = "scripts/windows/compare-windows-wgc-h264-sources.ps1";

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-wgc-progress-output.mjs

Description:
  Verifies that WGC benchmark/compare scripts print human progress lines during
  long child waits while keeping --json and --boardSummary outputs clean.

Options:
  --help, -h  Show this help without running child scripts
`);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(text, needle, context) {
  assert(String(text).includes(needle), `${context} missing ${needle}\n${text}`);
}

function assertNotIncludes(text, needle, context) {
  assert(!String(text).includes(needle), `${context} unexpectedly included ${needle}\n${text}`);
}

function runNode(args, { env = process.env, timeoutMs = 15000 } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({
        ok: false,
        timedOut: true,
        exitCode: null,
        stdout,
        stderr,
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
        ok: false,
        timedOut: false,
        exitCode: null,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({
        ok: exitCode === 0,
        timedOut: false,
        exitCode,
        stdout,
        stderr,
      });
    });
  });
}

function runPowerShellScript(script, args, { env = process.env, timeoutMs = 15000 } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      ...args,
    ], {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({
        ok: false,
        timedOut: true,
        exitCode: null,
        stdout,
        stderr,
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
        ok: false,
        timedOut: false,
        exitCode: null,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({
        ok: exitCode === 0,
        timedOut: false,
        exitCode,
        stdout,
        stderr,
      });
    });
  });
}

function runComparePowerShell(args, options = {}) {
  return runPowerShellScript(comparePowerShellScript, args, options);
}

function runBenchmarkPowerShell(args, options = {}) {
  return runPowerShellScript(benchmarkPowerShellScript, args, options);
}

function parseJsonOutput(output, context) {
  try {
    return JSON.parse(String(output || "").trim().replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`${context} did not print clean JSON: ${error.message}\n${output}`);
  }
}

function fakeObserveSource() {
  return `
function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }
  return fallback;
}

await new Promise((resolveDelay) => setTimeout(resolveDelay, Number(process.env.FAKE_OBSERVE_DELAY_MS) || 350));

const fps = Number(argValue("--fps", "30")) || 30;
const bandwidthKbps = Number(argValue("--bandwidthKbps", "10000")) || 10000;
const frameCount = Math.max(3, Math.round((fps * 0.5)));
const report = {
  session: {
    fps,
    capturePipeline: "fake-wgc-progress",
    h264Encoder: argValue("--h264Encoder", "fake-encoder"),
  },
  observation: {
    frameCount,
    fps,
    freshFps: fps,
    uniqueHelperFps: fps,
    maxGapMs: 20,
    avgPayloadBytes: Math.max(1000, Math.round(bandwidthKbps / 10)),
    freshFrames: frameCount,
    repeatedFrames: 0,
    repeatedFramePercent: 0,
    repeatSignalFrames: 0,
    repeatSignalFramePercent: 0,
    uniqueHelperFrameCount: frameCount,
    maxFrameAgeMs: 1,
    maxContentAgeMs: 0,
    helperTimingMs: {
      frameTotalBeforeEmitMs: { avgMs: 1, maxMs: 2 },
      convertEncodeMs: { avgMs: 1, maxMs: 2 },
    },
  },
  resource: {
    avgCpuPercent: 1,
    maxCpuPercent: 2,
    peakWorkingSetMiB: 64,
  },
  discoveryScreen: {
    wgc: {
      h264BridgeSource: argValue("--wgcH264Source", ""),
    },
  },
};
console.log(JSON.stringify(report));
`;
}

function fakeBenchmarkSource() {
  return `
function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }
  return fallback;
}

function argValues(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
      values.push(process.argv[index + 1]);
      index += 1;
    }
  }
  return values;
}

function parseProfile(value) {
  const [fpsRaw, bandwidthRaw, presetRaw = "balanced"] = String(value || "60:20000:balanced").split(":");
  const fps = Number(fpsRaw) || 60;
  const bandwidthKbps = Number(bandwidthRaw) || 20000;
  const qualityPreset = presetRaw || "balanced";
  return {
    name: fps + "Hz-" + Math.round(bandwidthKbps / 1000) + "M-" + qualityPreset,
    fps,
    bandwidthKbps,
    qualityPreset,
  };
}

await new Promise((resolveDelay) => setTimeout(resolveDelay, Number(process.env.FAKE_BENCHMARK_DELAY_MS) || 350));

const source = argValue("--h264Source", "raw-bgra");
const profiles = (argValues("--profile").length ? argValues("--profile") : ["60:20000:balanced"]).map(parseProfile);
const compact = profiles.map((profile) => ({
  ok: true,
  profile,
  sessionFps: profile.fps,
  capturePipeline: "fake-wgc-" + source,
  h264Encoder: argValue("--h264Encoder", "fake-encoder"),
  wgcH264Source: source,
  frames: 12,
  fps: source === "nv12" ? 32 : 28,
  freshFps: source === "nv12" ? 31 : 27,
  uniqueHelperFps: source === "nv12" ? 30 : 26,
  maxGapMs: 22,
  avgPayloadBytes: source === "nv12" ? 1200 : 1600,
  freshFrames: 12,
  repeatedFrames: 0,
  repeatedFramePercent: 0,
  uniqueHelperFrameCount: 12,
  maxFrameAgeMs: 1,
  maxContentAgeMs: 0,
  helperTimingMs: {
    frameTotalBeforeEmitMs: { avgMs: source === "nv12" ? 4 : 6, maxMs: source === "nv12" ? 6 : 8 },
    convertEncodeMs: { avgMs: source === "nv12" ? 3 : 5, maxMs: source === "nv12" ? 5 : 7 },
  },
  helperFrameTotalAvgMs: source === "nv12" ? 4 : 6,
  helperFrameTotalMaxMs: source === "nv12" ? 6 : 8,
  avgCpuPercent: source === "nv12" ? 2 : 3,
  maxCpuPercent: source === "nv12" ? 3 : 4,
  peakWorkingSetMiB: source === "nv12" ? 60 : 70,
}));
console.log(JSON.stringify({
  ok: true,
  helper: "fake-helper",
  requested: {
    progressIntervalMs: Number(argValue("--progressIntervalMs", "0")) || 0,
  },
  profiles: compact,
  results: compact,
}));
`;
}

async function verifyHelp() {
  const benchmarkHelp = await runNode([benchmarkScript, "--help"]);
  assert(benchmarkHelp.ok, `benchmark --help failed\n${benchmarkHelp.stderr}`);
  assertIncludes(benchmarkHelp.stdout, "--progressIntervalMs", "benchmark help");
  assertIncludes(benchmarkHelp.stdout, "--boardSummary", "benchmark help");

  const benchmarkPowerShellHelp = await runBenchmarkPowerShell(["-Help"]);
  assert(benchmarkPowerShellHelp.ok, `benchmark PowerShell -Help failed\n${benchmarkPowerShellHelp.stderr}`);
  assertIncludes(benchmarkPowerShellHelp.stdout, "-BoardSummary", "benchmark PowerShell help");
  assertIncludes(benchmarkPowerShellHelp.stdout, "-ProgressIntervalMs", "benchmark PowerShell help");
  assertIncludes(benchmarkPowerShellHelp.stdout, "does not connect to Mac", "benchmark PowerShell help");

  const compareHelp = await runNode([compareScript, "--help"]);
  assert(compareHelp.ok, `compare --help failed\n${compareHelp.stderr}`);
  assertIncludes(compareHelp.stdout, "--progressIntervalMs", "compare help");

  const comparePowerShellHelp = await runComparePowerShell(["-Help"]);
  assert(comparePowerShellHelp.ok, `compare PowerShell -Help failed\n${comparePowerShellHelp.stderr}`);
  assertIncludes(comparePowerShellHelp.stdout, "-BoardSummary", "compare PowerShell help");
  assertIncludes(comparePowerShellHelp.stdout, "-ProgressIntervalMs", "compare PowerShell help");
  assertIncludes(comparePowerShellHelp.stdout, "does not connect to Mac", "compare PowerShell help");
  console.log("[OK] Help includes --progressIntervalMs");
}

async function verifyBenchmarkProgress(fakeObservePath) {
  const secret = "secret-progress-test";
  const result = await runNode([
    benchmarkScript,
    "--skipBuild",
    "--helper",
    process.execPath,
    "--profile",
    "60:20000:balanced",
    "--durationMs",
    "800",
    "--timeoutMs",
    "10000",
    "--progressIntervalMs",
    "100",
    "--password",
    secret,
  ], {
    env: {
      ...process.env,
      LAN_DUAL_WINDOWS_WGC_OBSERVE_SCRIPT: fakeObservePath,
      FAKE_OBSERVE_DELAY_MS: "350",
    },
  });
  assert(result.ok, `benchmark progress run failed\n${result.stdout}\n${result.stderr}`);
  assertIncludes(result.stdout, "progressEvery=0.1s", "benchmark progress output");
  assertIncludes(result.stdout, "profile 1/1 60Hz-20M-balanced progress", "benchmark progress output");
  assertIncludes(result.stdout, "[OK] 60Hz-20M-balanced", "benchmark progress output");
  assertNotIncludes(result.stdout, secret, "benchmark progress output");
  console.log("[OK] Benchmark ordinary output prints progress without leaking the password");
}

async function verifyBenchmarkJsonClean(fakeObservePath) {
  const result = await runNode([
    benchmarkScript,
    "--skipBuild",
    "--helper",
    process.execPath,
    "--profile",
    "60:20000:balanced",
    "--durationMs",
    "800",
    "--timeoutMs",
    "10000",
    "--progressIntervalMs",
    "100",
    "--json",
  ], {
    env: {
      ...process.env,
      LAN_DUAL_WINDOWS_WGC_OBSERVE_SCRIPT: fakeObservePath,
      FAKE_OBSERVE_DELAY_MS: "350",
    },
  });
  assert(result.ok, `benchmark JSON run failed\n${result.stdout}\n${result.stderr}`);
  assertNotIncludes(result.stdout, "[INFO]", "benchmark JSON output");
  const summary = parseJsonOutput(result.stdout, "benchmark JSON output");
  assert(summary.requested?.progressIntervalMs === 100, "benchmark JSON should include requested.progressIntervalMs");
  assert(summary.boardSummary.includes("Windows WGC benchmark passed"), "benchmark JSON should include boardSummary");
  console.log("[OK] Benchmark --json remains clean");
}

async function verifyBenchmarkBoardSummaryClean(fakeObservePath) {
  const result = await runNode([
    benchmarkScript,
    "--skipBuild",
    "--helper",
    process.execPath,
    "--profile",
    "60:20000:balanced",
    "--durationMs",
    "800",
    "--timeoutMs",
    "10000",
    "--progressIntervalMs",
    "100",
    "--boardSummary",
  ], {
    env: {
      ...process.env,
      LAN_DUAL_WINDOWS_WGC_OBSERVE_SCRIPT: fakeObservePath,
      FAKE_OBSERVE_DELAY_MS: "350",
    },
  });
  assert(result.ok, `benchmark boardSummary run failed\n${result.stdout}\n${result.stderr}`);
  assertIncludes(result.stdout, "Windows WGC benchmark passed", "benchmark boardSummary output");
  assertIncludes(result.stdout, "60Hz-20M-balanced", "benchmark boardSummary output");
  assertNotIncludes(result.stdout, "[INFO]", "benchmark boardSummary output");
  assertNotIncludes(result.stdout, "progress:", "benchmark boardSummary output");
  console.log("[OK] Benchmark --boardSummary remains one clean line");
}

async function verifyBenchmarkPowerShellBoardSummaryClean(fakeObservePath) {
  const result = await runBenchmarkPowerShell([
    "-Profile",
    "60:20000:balanced",
    "-DurationMs",
    "800",
    "-TimeoutMs",
    "10000",
    "-ProgressIntervalMs",
    "100",
    "-SkipBuild",
    "-Helper",
    process.execPath,
    "-BoardSummary",
  ], {
    env: {
      ...process.env,
      LAN_DUAL_WINDOWS_WGC_OBSERVE_SCRIPT: fakeObservePath,
      FAKE_OBSERVE_DELAY_MS: "350",
    },
  });
  assert(result.ok, `benchmark PowerShell boardSummary run failed\n${result.stdout}\n${result.stderr}`);
  assertIncludes(result.stdout, "Windows WGC benchmark passed", "benchmark PowerShell boardSummary output");
  assertIncludes(result.stdout, "60Hz-20M-balanced", "benchmark PowerShell boardSummary output");
  assertNotIncludes(result.stdout, "[INFO]", "benchmark PowerShell boardSummary output");
  assertNotIncludes(result.stdout, "progress:", "benchmark PowerShell boardSummary output");
  assert(String(result.stderr || "").trim() === "", `benchmark PowerShell boardSummary stderr should be empty\n${result.stderr}`);
  console.log("[OK] Benchmark PowerShell -BoardSummary remains one clean line");
}

async function verifyBenchmarkPowerShellJsonClean(fakeObservePath) {
  const result = await runBenchmarkPowerShell([
    "-Profile",
    "60:20000:balanced",
    "-DurationMs",
    "800",
    "-TimeoutMs",
    "10000",
    "-ProgressIntervalMs",
    "100",
    "-SkipBuild",
    "-Helper",
    process.execPath,
    "-Json",
  ], {
    env: {
      ...process.env,
      LAN_DUAL_WINDOWS_WGC_OBSERVE_SCRIPT: fakeObservePath,
      FAKE_OBSERVE_DELAY_MS: "350",
    },
  });
  assert(result.ok, `benchmark PowerShell JSON run failed\n${result.stdout}\n${result.stderr}`);
  assertNotIncludes(result.stdout, "[INFO]", "benchmark PowerShell JSON output");
  const summary = parseJsonOutput(result.stdout, "benchmark PowerShell JSON output");
  assert(summary.boardSummary.includes("Windows WGC benchmark passed"), "benchmark PowerShell JSON should include boardSummary");
  assert(summary.requested?.progressIntervalMs === 100, "benchmark PowerShell JSON should include requested.progressIntervalMs");
  assert(String(result.stderr || "").trim() === "", `benchmark PowerShell JSON stderr should be empty\n${result.stderr}`);
  console.log("[OK] Benchmark PowerShell -Json remains clean");
}

async function verifyCompareProgress(fakeBenchmarkPath) {
  const secret = "secret-compare-progress";
  const result = await runNode([
    compareScript,
    "--source",
    "raw-bgra",
    "--source",
    "nv12",
    "--profile",
    "60:20000:balanced",
    "--durationMs",
    "800",
    "--timeoutMs",
    "10000",
    "--progressIntervalMs",
    "100",
    "--skipBuild",
    "--helper",
    process.execPath,
    "--password",
    secret,
  ], {
    env: {
      ...process.env,
      LAN_DUAL_WINDOWS_WGC_BENCHMARK_SCRIPT: fakeBenchmarkPath,
      FAKE_BENCHMARK_DELAY_MS: "350",
    },
  });
  assert(result.ok, `compare progress run failed\n${result.stdout}\n${result.stderr}`);
  assertIncludes(result.stdout, "progressEvery=0.1s", "compare progress output");
  assertIncludes(result.stdout, "source raw-bgra (1/2) progress", "compare progress output");
  assertIncludes(result.stdout, "source nv12 (2/2) progress", "compare progress output");
  assertIncludes(result.stdout, "[OK] WGC H.264 source comparison passed", "compare progress output");
  assertNotIncludes(result.stdout, secret, "compare progress output");
  console.log("[OK] Compare ordinary output prints per-source progress without leaking the password");
}

async function verifyCompareBoardSummaryClean(fakeBenchmarkPath) {
  const result = await runNode([
    compareScript,
    "--source",
    "raw-bgra",
    "--source",
    "nv12",
    "--profile",
    "60:20000:balanced",
    "--durationMs",
    "800",
    "--timeoutMs",
    "10000",
    "--progressIntervalMs",
    "100",
    "--skipBuild",
    "--helper",
    process.execPath,
    "--boardSummary",
  ], {
    env: {
      ...process.env,
      LAN_DUAL_WINDOWS_WGC_BENCHMARK_SCRIPT: fakeBenchmarkPath,
      FAKE_BENCHMARK_DELAY_MS: "350",
    },
  });
  assert(result.ok, `compare boardSummary run failed\n${result.stdout}\n${result.stderr}`);
  assertIncludes(result.stdout, "Windows WGC H.264 source compare passed", "compare boardSummary output");
  assertNotIncludes(result.stdout, "[INFO]", "compare boardSummary output");
  assertNotIncludes(result.stdout, "progress:", "compare boardSummary output");
  console.log("[OK] Compare --boardSummary remains one clean line");
}

async function verifyComparePowerShellBoardSummaryClean(fakeBenchmarkPath) {
  const result = await runComparePowerShell([
    "-Source",
    "raw-bgra",
    "nv12",
    "-Profile",
    "60:20000:balanced",
    "-DurationMs",
    "800",
    "-TimeoutMs",
    "10000",
    "-ProgressIntervalMs",
    "100",
    "-SkipBuild",
    "-Helper",
    process.execPath,
    "-BoardSummary",
  ], {
    env: {
      ...process.env,
      LAN_DUAL_WINDOWS_WGC_BENCHMARK_SCRIPT: fakeBenchmarkPath,
      FAKE_BENCHMARK_DELAY_MS: "350",
    },
  });
  assert(result.ok, `compare PowerShell boardSummary run failed\n${result.stdout}\n${result.stderr}`);
  assertIncludes(result.stdout, "Windows WGC H.264 source compare passed", "compare PowerShell boardSummary output");
  assertNotIncludes(result.stdout, "[INFO]", "compare PowerShell boardSummary output");
  assertNotIncludes(result.stdout, "progress:", "compare PowerShell boardSummary output");
  assert(String(result.stderr || "").trim() === "", `compare PowerShell boardSummary stderr should be empty\n${result.stderr}`);
  console.log("[OK] Compare PowerShell -BoardSummary remains one clean line");
}

async function verifyComparePowerShellJsonClean(fakeBenchmarkPath) {
  const result = await runComparePowerShell([
    "-Source",
    "raw-bgra",
    "nv12",
    "-Profile",
    "60:20000:balanced",
    "-DurationMs",
    "800",
    "-TimeoutMs",
    "10000",
    "-ProgressIntervalMs",
    "100",
    "-SkipBuild",
    "-Helper",
    process.execPath,
    "-Json",
  ], {
    env: {
      ...process.env,
      LAN_DUAL_WINDOWS_WGC_BENCHMARK_SCRIPT: fakeBenchmarkPath,
      FAKE_BENCHMARK_DELAY_MS: "350",
    },
  });
  assert(result.ok, `compare PowerShell JSON run failed\n${result.stdout}\n${result.stderr}`);
  assertNotIncludes(result.stdout, "[INFO]", "compare PowerShell JSON output");
  const summary = parseJsonOutput(result.stdout, "compare PowerShell JSON output");
  assert(summary.boardSummary.includes("Windows WGC H.264 source compare passed"), "PowerShell JSON should include boardSummary");
  assert(summary.requested?.progressIntervalMs === 100, "PowerShell JSON should include requested.progressIntervalMs");
  assert(String(result.stderr || "").trim() === "", `compare PowerShell JSON stderr should be empty\n${result.stderr}`);
  console.log("[OK] Compare PowerShell -Json remains clean");
}

async function main() {
  await verifyHelp();
  const tempDir = await mkdtemp(join(tmpdir(), "lan-dual-wgc-progress-"));
  const fakeObservePath = join(tempDir, "fake-observe.mjs");
  const fakeBenchmarkPath = join(tempDir, "fake-benchmark.mjs");
  try {
    await writeFile(fakeObservePath, fakeObserveSource(), "utf8");
    await writeFile(fakeBenchmarkPath, fakeBenchmarkSource(), "utf8");
    await verifyBenchmarkProgress(fakeObservePath);
    await verifyBenchmarkJsonClean(fakeObservePath);
    await verifyBenchmarkBoardSummaryClean(fakeObservePath);
    await verifyBenchmarkPowerShellBoardSummaryClean(fakeObservePath);
    await verifyBenchmarkPowerShellJsonClean(fakeObservePath);
    await verifyCompareProgress(fakeBenchmarkPath);
    await verifyCompareBoardSummaryClean(fakeBenchmarkPath);
    await verifyComparePowerShellBoardSummaryClean(fakeBenchmarkPath);
    await verifyComparePowerShellJsonClean(fakeBenchmarkPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
  console.log("[OK] Windows WGC progress output tests passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.stack || error.message}`);
  process.exitCode = 1;
});
