import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const benchmarkScript = process.env.LAN_DUAL_WINDOWS_WGC_BENCHMARK_SCRIPT
  ? resolve(process.env.LAN_DUAL_WINDOWS_WGC_BENCHMARK_SCRIPT)
  : resolve(scriptDir, "benchmark-windows-wgc-settings.mjs");
const helperExe = resolve(repoRoot, "apps/windows-wgc-helper/target/debug/lan-dual-wgc-helper.exe");

const defaultProfiles = ["60:20000:balanced"];
const defaultSources = ["raw-bgra", "nv12"];

const defaults = {
  host: "127.0.0.1",
  port: 43784,
  password: "demo-password",
  helper: "",
  width: 1280,
  height: 720,
  durationMs: 1800,
  timeoutMs: 60000,
  minFrames: 1,
  minFps: 0,
  minFreshFps: 0,
  minUniqueHelperFps: 0,
  maxRepeatedFrameRatio: 1,
  maxGapMs: 10000,
  maxFrameAgeMs: 1000,
  maxContentAgeMs: 0,
  resourceSample: true,
  resourceSampleTree: true,
  resourceSampleIntervalMs: 1000,
  resourceSampleTimeoutMs: 4000,
  repeatLastFrame: true,
  repeatLastFrameMode: "full",
  h264Encoder: process.env.LAN_DUAL_WINDOWS_H264_ENCODER || "h264_nvenc",
  motionStimulus: false,
  motionStimulusBackend: "winforms",
  motionStimulusWidth: 960,
  motionStimulusHeight: 540,
  motionStimulusWarmupMs: 1200,
  motionStimulusBrowser: "",
  progressIntervalMs: 10000,
  skipBuild: false,
  json: false,
  boardSummary: false,
  verbose: false,
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/compare-windows-wgc-h264-sources.mjs [options]

Description:
  Runs the existing WGC benchmark twice by default, once with raw-bgra H.264
  source frames and once with NV12 H.264 source frames. It starts temporary
  local Windows hosts only, then prints side-by-side FPS, repeat-frame,
  helperTiming, and resource deltas so WGC/H.264 performance work can be
  prioritized from reproducible data.

Options:
  --source <raw-bgra|nv12>              Source to compare; can be repeated. Default: raw-bgra,nv12
  --profile <fps:kbps:preset>           Benchmark profile; can be repeated. Default: ${defaultProfiles.join(",")}
  --helper <path>                       WGC helper exe. Default: target debug helper
  --skipBuild                           Do not let the first benchmark run cargo build
  --width <px> --height <px>            Requested video size. Default: ${defaults.width}x${defaults.height}
  --durationMs <ms>                     Per source/profile observation window. Default: ${defaults.durationMs}
  --timeoutMs <ms>                      Per child command timeout. Default: ${defaults.timeoutMs}
  --minFrames <n> --minFps <n>          Diagnostic thresholds passed to the observer
  --minFreshFps <n>                     Minimum non-repeated frame FPS
  --minUniqueHelperFps <n>              Minimum unique WGC helper source FPS
  --maxRepeatedFrameRatio <n>           Max repeated frame ratio, 0-1 or 0-100 percent
  --maxGapMs <ms>                       Max receive gap. Default: ${defaults.maxGapMs}
  --maxFrameAgeMs <ms>                  Max video_frame timestamp receive age. Default: ${defaults.maxFrameAgeMs}
  --maxContentAgeMs <ms>                Max WGC repeated content age; 0 disables
  --resourceSample false                Disable local host resource sampling
  --resourceSampleTree false            Sample only the host process, not helper/FFmpeg children
  --repeatLastFrame false               Disable WGC repeat-last-frame pacing during comparison
  --repeatLastFrameMode <full|signal>   full resends frames, signal sends repeat markers
  --h264Encoder <name>                  H.264 encoder. Default: ${defaults.h264Encoder || "benchmark default"}
  --motionStimulus                      Open a temporary animated window before each source run
  --motionStimulusBackend <name>        winforms | browser. Default: ${defaults.motionStimulusBackend}
  --motionStimulusWidth <px>            Animated window width. Default: ${defaults.motionStimulusWidth}
  --motionStimulusHeight <px>           Animated window height. Default: ${defaults.motionStimulusHeight}
  --motionStimulusWarmupMs <ms>         Wait after opening the animation. Default: ${defaults.motionStimulusWarmupMs}
  --motionStimulusBrowser <path>        Browser exe for browser motion stimulus
  --progressIntervalMs <ms>             Print per-source wait progress every N ms; 0 disables. Default: ${defaults.progressIntervalMs}
  --boardSummary                        Print one Agent Link Board-safe summary line
  --json                                Print JSON result
  --verbose                             Print child command output on failure
  --help, -h                            Show this help without starting a host

Examples:
  node scripts/windows/compare-windows-wgc-h264-sources.mjs
  node scripts/windows/compare-windows-wgc-h264-sources.mjs --profile 60:20000:balanced --durationMs 1500 --boardSummary
  node scripts/windows/compare-windows-wgc-h264-sources.mjs --motionStimulus --json
`);
}

function parseArgs(argv) {
  const args = { ...defaults, sources: [], profiles: [], help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--source" && next && !next.startsWith("--")) {
      args.sources.push(normalizeSource(next));
      index += 1;
      continue;
    }
    if (token === "--profile" && next && !next.startsWith("--")) {
      args.profiles.push(next);
      index += 1;
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

  args.sources = unique((args.sources.length ? args.sources : defaultSources).map(normalizeSource));
  args.profiles = args.profiles.length ? args.profiles : [...defaultProfiles];
  args.port = Number(args.port) || defaults.port;
  args.width = Math.max(320, Number(args.width) || defaults.width);
  args.height = Math.max(180, Number(args.height) || defaults.height);
  args.durationMs = Math.max(500, Number(args.durationMs) || defaults.durationMs);
  args.timeoutMs = Math.max(10000, Number(args.timeoutMs) || defaults.timeoutMs);
  args.minFrames = Math.max(0, Number(args.minFrames) || defaults.minFrames);
  args.minFps = Math.max(0, Number(args.minFps) || defaults.minFps);
  args.minFreshFps = Math.max(0, Number(args.minFreshFps) || defaults.minFreshFps);
  args.minUniqueHelperFps = Math.max(0, Number(args.minUniqueHelperFps) || defaults.minUniqueHelperFps);
  args.maxRepeatedFrameRatio = normalizeRatioArg(args.maxRepeatedFrameRatio, defaults.maxRepeatedFrameRatio);
  args.maxGapMs = Math.max(1000, Number(args.maxGapMs) || defaults.maxGapMs);
  args.maxFrameAgeMs = Math.max(0, Number(args.maxFrameAgeMs) || defaults.maxFrameAgeMs);
  args.maxContentAgeMs = Math.max(0, Number(args.maxContentAgeMs) || defaults.maxContentAgeMs);
  args.resourceSample = booleanArg(args.resourceSample, true);
  args.resourceSampleTree = booleanArg(args.resourceSampleTree, true);
  args.resourceSampleIntervalMs = Math.max(250, Number(args.resourceSampleIntervalMs) || defaults.resourceSampleIntervalMs);
  args.resourceSampleTimeoutMs = Math.max(1000, Number(args.resourceSampleTimeoutMs) || defaults.resourceSampleTimeoutMs);
  args.repeatLastFrame = booleanArg(args.repeatLastFrame, true);
  args.repeatLastFrameMode = normalizeRepeatLastFrameMode(args.repeatLastFrameMode);
  args.h264Encoder = String(args.h264Encoder || "").trim().toLowerCase();
  args.motionStimulus = booleanArg(args.motionStimulus);
  args.motionStimulusBackend = normalizeMotionStimulusBackend(args.motionStimulusBackend);
  args.motionStimulusWidth = Math.max(320, Number(args.motionStimulusWidth) || defaults.motionStimulusWidth);
  args.motionStimulusHeight = Math.max(240, Number(args.motionStimulusHeight) || defaults.motionStimulusHeight);
  args.motionStimulusWarmupMs = Math.max(300, Number(args.motionStimulusWarmupMs) || defaults.motionStimulusWarmupMs);
  args.motionStimulusBrowser = String(args.motionStimulusBrowser || "").trim();
  const progressIntervalMs = Number(args.progressIntervalMs);
  args.progressIntervalMs = Number.isFinite(progressIntervalMs)
    ? Math.max(0, progressIntervalMs)
    : defaults.progressIntervalMs;
  args.skipBuild = booleanArg(args.skipBuild);
  args.json = booleanArg(args.json);
  args.boardSummary = booleanArg(args.boardSummary);
  args.verbose = booleanArg(args.verbose);
  args.host = String(args.host || defaults.host).trim();
  args.password = String(args.password || defaults.password);
  args.helper = String(args.helper || process.env.LAN_DUAL_WINDOWS_WGC_HELPER || helperExe).trim();

  if (args.sources.length === 0) {
    throw new Error("No sources selected.");
  }
  return args;
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeSource(value) {
  const source = String(value || "").trim().toLowerCase();
  if (["raw", "bgra", "raw-bgra", "raw_bgra"].includes(source)) {
    return "raw-bgra";
  }
  if (["nv12", "raw-nv12", "raw_nv12", "yuv", "yuv420"].includes(source)) {
    return "nv12";
  }
  throw new Error(`Unsupported --source ${value}; expected raw-bgra or nv12.`);
}

function normalizeRepeatLastFrameMode(value) {
  const mode = String(value || defaults.repeatLastFrameMode).trim().toLowerCase();
  if (["signal", "light", "lightweight", "thin"].includes(mode)) {
    return "signal";
  }
  return "full";
}

function normalizeMotionStimulusBackend(value) {
  const backend = String(value || defaults.motionStimulusBackend).trim().toLowerCase();
  if (["browser", "edge", "chromium"].includes(backend)) {
    return "browser";
  }
  return "winforms";
}

function booleanArg(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (value === true || value === "true" || value === "1" || value === "yes") {
    return true;
  }
  if (value === false || value === "false" || value === "0" || value === "no") {
    return false;
  }
  return fallback;
}

function normalizeRatioArg(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  if (number > 1) {
    return Math.max(0, Math.min(1, number / 100));
  }
  return Math.max(0, Math.min(1, number));
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

function runCommand(command, commandArgs, {
  cwd = repoRoot,
  env = process.env,
  timeoutMs,
  verbose = false,
  progressIntervalMs = 0,
  progressLabel = "",
  expectedMs = 0,
} = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const startedAt = performance.now();
    const progressMs = Math.max(0, Number(progressIntervalMs) || 0);
    const expectedText = Number(expectedMs) > 0 ? ` / expected ${formatSeconds(expectedMs)}` : "";
    const progressTimer = progressMs > 0 && progressLabel
      ? setInterval(() => {
        const elapsedMs = performance.now() - startedAt;
        const timeoutLeftMs = Number(timeoutMs) > 0 ? Math.max(0, timeoutMs - elapsedMs) : 0;
        const timeoutText = Number(timeoutMs) > 0 ? ` / timeout left ${formatSeconds(timeoutLeftMs)}` : "";
        console.log(`[INFO] ${progressLabel} progress: elapsed ${formatSeconds(elapsedMs)}${expectedText}${timeoutText}`);
      }, progressMs)
      : null;
    progressTimer?.unref?.();
    const timer = setTimeout(() => {
      if (progressTimer) {
        clearInterval(progressTimer);
      }
      child.kill();
      resolveRun({
        ok: false,
        timedOut: true,
        exitCode: null,
        durationMs: Math.round(performance.now() - startedAt),
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
      if (progressTimer) {
        clearInterval(progressTimer);
      }
      resolveRun({
        ok: false,
        timedOut: false,
        exitCode: null,
        durationMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      if (progressTimer) {
        clearInterval(progressTimer);
      }
      if (verbose && exitCode !== 0) {
        console.error(stderr.trim());
        console.error(stdout.trim());
      }
      resolveRun({
        ok: exitCode === 0,
        timedOut: false,
        exitCode,
        durationMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr,
      });
    });
  });
}

async function runSourceBenchmark(args, source, sourceIndex) {
  const argv = [
    benchmarkScript,
    "--host",
    args.host,
    "--port",
    String(args.port + sourceIndex * 20),
    "--password",
    args.password,
    "--helper",
    args.helper,
    "--width",
    String(args.width),
    "--height",
    String(args.height),
    "--durationMs",
    String(args.durationMs),
    "--timeoutMs",
    String(args.timeoutMs),
    "--minFrames",
    String(args.minFrames),
    "--minFps",
    String(args.minFps),
    "--minFreshFps",
    String(args.minFreshFps),
    "--minUniqueHelperFps",
    String(args.minUniqueHelperFps),
    "--maxRepeatedFrameRatio",
    String(args.maxRepeatedFrameRatio),
    "--maxGapMs",
    String(args.maxGapMs),
    "--maxFrameAgeMs",
    String(args.maxFrameAgeMs),
    "--maxContentAgeMs",
    String(args.maxContentAgeMs),
    "--resourceSample",
    String(args.resourceSample),
    "--resourceSampleTree",
    String(args.resourceSampleTree),
    "--resourceSampleIntervalMs",
    String(args.resourceSampleIntervalMs),
    "--resourceSampleTimeoutMs",
    String(args.resourceSampleTimeoutMs),
    "--repeatLastFrameMode",
    args.repeatLastFrameMode,
    "--progressIntervalMs",
    String(args.progressIntervalMs),
    "--h264Bridge",
    "--h264Source",
    source,
    "--json",
  ];
  for (const profile of args.profiles) {
    argv.push("--profile", profile);
  }
  if (args.repeatLastFrame) {
    argv.push("--repeatLastFrame");
  }
  if (args.h264Encoder) {
    argv.push("--h264Encoder", args.h264Encoder);
  }
  if (args.motionStimulus) {
    argv.push(
      "--motionStimulus",
      "--motionStimulusBackend",
      args.motionStimulusBackend,
      "--motionStimulusWidth",
      String(args.motionStimulusWidth),
      "--motionStimulusHeight",
      String(args.motionStimulusHeight),
      "--motionStimulusWarmupMs",
      String(args.motionStimulusWarmupMs),
    );
    if (args.motionStimulusBrowser) {
      argv.push("--motionStimulusBrowser", args.motionStimulusBrowser);
    }
  }
  if (args.skipBuild || sourceIndex > 0) {
    argv.push("--skipBuild");
  }

  const childTimeoutMs = args.timeoutMs + args.durationMs * Math.max(1, args.profiles.length) + 15000;
  const result = await runCommand(process.execPath, argv, {
    cwd: repoRoot,
    timeoutMs: childTimeoutMs,
    verbose: args.verbose,
    progressIntervalMs: args.json || args.boardSummary ? 0 : args.progressIntervalMs,
    progressLabel: `source ${source} (${sourceIndex + 1}/${args.sources.length})`,
    expectedMs: args.durationMs * Math.max(1, args.profiles.length),
  });
  const parsed = parseMaybeJson(result.stdout);
  if (!result.ok && parsed) {
    return {
      source,
      ok: parsed.ok === true,
      commandOk: false,
      durationMs: result.durationMs,
      error: summarizeChildFailure(result),
      benchmark: parsed,
      profiles: parsed.profiles || [],
    };
  }
  if (!result.ok) {
    return {
      source,
      ok: false,
      commandOk: false,
      durationMs: result.durationMs,
      error: summarizeChildFailure(result),
      benchmark: null,
      profiles: [],
    };
  }
  if (!parsed) {
    return {
      source,
      ok: false,
      commandOk: true,
      durationMs: result.durationMs,
      error: "Benchmark did not print parseable JSON.",
      benchmark: null,
      profiles: [],
    };
  }
  return {
    source,
    ok: parsed.ok === true,
    commandOk: true,
    durationMs: result.durationMs,
    error: parsed.ok === true ? "" : "Benchmark reported at least one failed profile.",
    benchmark: parsed,
    profiles: parsed.profiles || [],
  };
}

function parseMaybeJson(text) {
  const trimmed = String(text || "").trim().replace(/^\uFEFF/, "");
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function summarizeChildFailure(result) {
  const text = `${result.stderr}\n${result.stdout}`.trim().replace(/\s+/g, " ");
  if (result.timedOut) {
    return `benchmark timed out after ${result.durationMs} ms${text ? `: ${text.slice(0, 400)}` : ""}`;
  }
  return text.slice(0, 800) || `benchmark exited ${result.exitCode}`;
}

function profileKey(profile) {
  return profile?.profile?.name || `${profile?.profile?.fps || "?"}:${profile?.profile?.bandwidthKbps || "?"}:${profile?.profile?.qualityPreset || "?"}`;
}

function compareProfiles(runs) {
  const allKeys = unique(runs.flatMap((run) => run.profiles.map(profileKey)));
  return allKeys.map((key) => {
    const bySource = {};
    for (const run of runs) {
      bySource[run.source] = run.profiles.find((profile) => profileKey(profile) === key) || null;
    }
    const raw = bySource["raw-bgra"];
    const nv12 = bySource.nv12;
    const comparison = {
      profile: key,
      sources: bySource,
      fpsDeltaNv12MinusRaw: delta(nv12?.fps, raw?.fps),
      freshFpsDeltaNv12MinusRaw: delta(nv12?.freshFps, raw?.freshFps),
      uniqueHelperFpsDeltaNv12MinusRaw: delta(nv12?.uniqueHelperFps, raw?.uniqueHelperFps),
      repeatedFramePercentDeltaNv12MinusRaw: delta(nv12?.repeatedFramePercent, raw?.repeatedFramePercent),
      helperFrameTotalAvgDeltaNv12MinusRaw: delta(nv12?.helperFrameTotalAvgMs, raw?.helperFrameTotalAvgMs),
      convertEncodeAvgDeltaNv12MinusRaw: delta(statAvg(nv12, "convertEncodeMs"), statAvg(raw, "convertEncodeMs")),
      cpuAvgDeltaNv12MinusRaw: delta(nv12?.avgCpuPercent, raw?.avgCpuPercent),
      workingSetPeakDeltaNv12MinusRaw: delta(nv12?.peakWorkingSetMiB, raw?.peakWorkingSetMiB),
      winner: inferWinner(raw, nv12),
    };
    return comparison;
  });
}

function statAvg(profile, statName) {
  return profile?.helperTimingMs?.[statName]?.avgMs ?? null;
}

function delta(left, right) {
  const l = Number(left);
  const r = Number(right);
  if (!Number.isFinite(l) || !Number.isFinite(r)) {
    return null;
  }
  return round(l - r, 3);
}

function inferWinner(raw, nv12) {
  if (!raw && !nv12) {
    return "none";
  }
  if (raw && !nv12) {
    return "raw-bgra";
  }
  if (!raw && nv12) {
    return "nv12";
  }
  const rawFrameAvg = Number(raw.helperFrameTotalAvgMs);
  const nv12FrameAvg = Number(nv12.helperFrameTotalAvgMs);
  if (Number.isFinite(rawFrameAvg) && Number.isFinite(nv12FrameAvg) && Math.abs(rawFrameAvg - nv12FrameAvg) > 1) {
    return rawFrameAvg < nv12FrameAvg ? "raw-bgra" : "nv12";
  }
  const rawFps = Number(raw.fps);
  const nv12Fps = Number(nv12.fps);
  if (Number.isFinite(rawFps) && Number.isFinite(nv12Fps) && Math.abs(rawFps - nv12Fps) > 1) {
    return rawFps > nv12Fps ? "raw-bgra" : "nv12";
  }
  return "tie";
}

function round(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
}

function formatProfileLine(profile) {
  if (!profile) {
    return "missing";
  }
  if (!profile.ok) {
    return `failed: ${profile.error || "unknown"}`;
  }
  const convertAvg = statAvg(profile, "convertEncodeMs");
  return [
    `${profile.capturePipeline || profile.wgcH264Source || "unknown"}`,
    `${profile.frames} frames`,
    `${profile.fps}fps`,
    `fresh ${profile.freshFps}fps`,
    `source ${profile.uniqueHelperFps}fps`,
    `repeat ${profile.repeatedFramePercent ?? "?"}%`,
    `helper frame avg ${profile.helperFrameTotalAvgMs ?? "?"}ms`,
    `convert avg ${convertAvg ?? "?"}ms`,
    `CPU ${profile.avgCpuPercent ?? "?"}%`,
    `WS ${profile.peakWorkingSetMiB ?? "?"}MiB`,
  ].join(", ");
}

function formatComparisonLine(comparison) {
  const raw = comparison.sources["raw-bgra"];
  const nv12 = comparison.sources.nv12;
  return (
    `${comparison.profile}: winner=${comparison.winner}; ` +
    `raw-bgra [${formatProfileLine(raw)}]; ` +
    `nv12 [${formatProfileLine(nv12)}]; ` +
    `delta nv12-raw fps=${comparison.fpsDeltaNv12MinusRaw ?? "?"}, ` +
    `helperAvg=${comparison.helperFrameTotalAvgDeltaNv12MinusRaw ?? "?"}ms, ` +
    `convertAvg=${comparison.convertEncodeAvgDeltaNv12MinusRaw ?? "?"}ms`
  );
}

function makeBoardSummary(summary) {
  if (!summary.ok) {
    const failed = summary.runs
      .filter((run) => !run.ok)
      .map((run) => `${run.source}: ${run.error || "failed"}`)
      .join("; ");
    return `Windows WGC H.264 source compare failed: ${failed || "unknown failure"}. No formal password, no WebSocket auth to Mac, no input/inject.`;
  }
  const winners = summary.comparisons.map((item) => `${item.profile}=${item.winner}`).join(", ");
  const first = summary.comparisons[0];
  return (
    `Windows WGC H.264 source compare passed: sources=${summary.sources.join("/")} ` +
    `profiles=${summary.profiles.join(",")} winners=${winners || "n/a"}; ` +
    `first delta nv12-raw fps=${first?.fpsDeltaNv12MinusRaw ?? "?"}, ` +
    `helperAvg=${first?.helperFrameTotalAvgDeltaNv12MinusRaw ?? "?"}ms, ` +
    `convertAvg=${first?.convertEncodeAvgDeltaNv12MinusRaw ?? "?"}ms. ` +
    "No formal password, no WebSocket auth to Mac, no input/inject."
  );
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const runs = [];
  for (let index = 0; index < args.sources.length; index += 1) {
    const source = args.sources[index];
    if (!args.json && !args.boardSummary) {
      console.log(
        `[RUN] WGC H.264 source ${source} (${index + 1}/${args.sources.length}) ` +
        `profiles=${args.profiles.length} duration=${formatSeconds(args.durationMs)} progressEvery=${progressEveryText(args)}`,
      );
    }
    const run = await runSourceBenchmark(args, source, index);
    runs.push(run);
    if (!args.json && !args.boardSummary) {
      if (run.ok) {
        console.log(`[OK] ${source}: ${run.profiles.length} profile(s), ${run.durationMs}ms`);
      } else {
        console.log(`[FAIL] ${source}: ${run.error}`);
      }
    }
  }

  const comparisons = compareProfiles(runs);
  const summary = {
    ok: runs.every((run) => run.ok),
    sources: args.sources,
    profiles: args.profiles,
    requested: {
      width: args.width,
      height: args.height,
      durationMs: args.durationMs,
      repeatLastFrame: args.repeatLastFrame,
      repeatLastFrameMode: args.repeatLastFrameMode,
      h264Encoder: args.h264Encoder,
      motionStimulus: args.motionStimulus,
      resourceSample: args.resourceSample,
      resourceSampleTree: args.resourceSampleTree,
      progressIntervalMs: args.progressIntervalMs,
    },
    comparisons,
    runs,
  };
  summary.boardSummary = makeBoardSummary(summary);

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else if (args.boardSummary) {
    console.log(summary.boardSummary);
  } else {
    for (const comparison of comparisons) {
      console.log(`[COMPARE] ${formatComparisonLine(comparison)}`);
    }
    console.log(summary.ok ? "[OK] WGC H.264 source comparison passed" : "[FAIL] WGC H.264 source comparison failed");
  }

  process.exitCode = summary.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
