import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const helperDir = resolve(repoRoot, "apps/windows-wgc-helper");
const helperExe = resolve(helperDir, "target/debug/lan-dual-wgc-helper.exe");
const observeScript = resolve(scriptDir, "observe-windows-host-video.mjs");

const defaultProfiles = [
  "30:10000:balanced",
  "60:20000:balanced",
  "120:40000:sharp",
];

const defaults = {
  host: "127.0.0.1",
  port: 43782,
  password: "demo-password",
  helper: "",
  width: 1280,
  height: 720,
  durationMs: 2500,
  timeoutMs: 45000,
  minFrames: 1,
  minFps: 0,
  maxGapMs: 10000,
  maxFrameAgeMs: 1000,
  resourceSample: true,
  resourceSampleTree: true,
  resourceSampleIntervalMs: 1000,
  resourceSampleTimeoutMs: 4000,
  repeatLastFrame: false,
  repeatLastFrameMode: "full",
  skipBuild: false,
  json: false,
  verbose: false,
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/benchmark-windows-wgc-settings.mjs [options]

Description:
  Builds or locates the Windows WGC Rust helper, then runs several local
  observe-windows-host-video probes sequentially in WGC mode. The output is a
  comparable FPS / gap / bytes / resource baseline for resolution, refresh-rate
  and bandwidth tuning. It starts temporary local Windows hosts and does not
  require Mac-side cooperation.

Options:
  --profile <fps:kbps:preset>           Add one profile; can be repeated
  --helper <path>                       WGC helper exe. Default: target debug helper
  --skipBuild                           Do not run cargo build before probing
  --width <px> --height <px>            Requested video size. Default: ${defaults.width}x${defaults.height}
  --durationMs <ms>                     Per-profile observation duration. Default: ${defaults.durationMs}
  --timeoutMs <ms>                      Per child command timeout. Default: ${defaults.timeoutMs}
  --minFrames <n> --minFps <n>          Diagnostic thresholds. Defaults: ${defaults.minFrames} frame, ${defaults.minFps} FPS
  --maxGapMs <ms>                       Max receive gap before a profile fails. Default: ${defaults.maxGapMs}
  --maxFrameAgeMs <ms>                  Max timestamp receive age. Default: ${defaults.maxFrameAgeMs}
  --resourceSample false                Disable local host resource sampling
  --resourceSampleTree false            Sample only the host process, not helper children
  --repeatLastFrame                     Enable WGC repeat-last-frame pacing diagnostics
  --repeatLastFrameMode <full|signal>   full resends JPEG, signal sends repeat markers
  --json                                Print JSON result
  --verbose                             Print child command stderr/stdout on failure
  --help, -h                            Show this help without starting a host

Examples:
  node scripts/windows/benchmark-windows-wgc-settings.mjs
  node scripts/windows/benchmark-windows-wgc-settings.mjs --profile 60:20000:balanced --durationMs 1500 --json
`);
}

function parseArgs(argv) {
  const args = { ...defaults, profiles: [], help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
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

  args.profiles = (args.profiles.length ? args.profiles : defaultProfiles).map(parseProfile);
  args.port = Number(args.port) || defaults.port;
  args.width = Number(args.width) || defaults.width;
  args.height = Number(args.height) || defaults.height;
  args.durationMs = Math.max(500, Number(args.durationMs) || defaults.durationMs);
  args.timeoutMs = Math.max(10000, Number(args.timeoutMs) || defaults.timeoutMs);
  args.minFrames = Math.max(0, Number(args.minFrames) || defaults.minFrames);
  args.minFps = Math.max(0, Number(args.minFps) || defaults.minFps);
  args.maxGapMs = Math.max(1000, Number(args.maxGapMs) || defaults.maxGapMs);
  args.maxFrameAgeMs = Math.max(0, Number(args.maxFrameAgeMs) || defaults.maxFrameAgeMs);
  args.resourceSample = booleanArg(args.resourceSample, true);
  args.resourceSampleTree = booleanArg(args.resourceSampleTree, true);
  args.resourceSampleIntervalMs = Math.max(250, Number(args.resourceSampleIntervalMs) || defaults.resourceSampleIntervalMs);
  args.resourceSampleTimeoutMs = Math.max(1000, Number(args.resourceSampleTimeoutMs) || defaults.resourceSampleTimeoutMs);
  args.repeatLastFrame = booleanArg(args.repeatLastFrame);
  args.repeatLastFrameMode = normalizeRepeatLastFrameMode(args.repeatLastFrameMode);
  args.skipBuild = booleanArg(args.skipBuild);
  args.json = booleanArg(args.json);
  args.verbose = booleanArg(args.verbose);
  args.host = String(args.host || defaults.host).trim();
  args.password = String(args.password || defaults.password);
  args.helper = String(args.helper || process.env.LAN_DUAL_WINDOWS_WGC_HELPER || helperExe).trim();
  return args;
}

function parseProfile(value) {
  const [fpsRaw, bandwidthRaw, presetRaw = "balanced"] = String(value || "").split(":");
  const fps = Math.max(1, Math.min(240, Number(fpsRaw) || 0));
  const bandwidthKbps = Math.max(1000, Number(bandwidthRaw) || 0);
  const qualityPreset = String(presetRaw || "balanced").trim() || "balanced";
  if (!fps || !bandwidthKbps) {
    throw new Error(`Invalid --profile ${value}; expected fps:kbps:preset`);
  }
  return {
    name: `${fps}Hz-${Math.round(bandwidthKbps / 1000)}M-${qualityPreset}`,
    fps,
    bandwidthKbps,
    qualityPreset,
  };
}

function normalizeRepeatLastFrameMode(value) {
  const mode = String(value ?? defaults.repeatLastFrameMode).trim().toLowerCase();
  if (["signal", "light", "lightweight", "thin"].includes(mode)) {
    return "signal";
  }
  return "full";
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
  argv.push(name, String(value));
}

function runCommand(command, commandArgs, { cwd = repoRoot, env = process.env, timeoutMs, verbose = false } = {}) {
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
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({
        ok: false,
        exitCode: null,
        timedOut: true,
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
      resolveRun({
        ok: false,
        exitCode: null,
        timedOut: false,
        durationMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const result = {
        ok: exitCode === 0,
        exitCode,
        timedOut: false,
        durationMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr,
      };
      if (verbose && !result.ok) {
        console.error(stderr.trim() || stdout.trim());
      }
      resolveRun(result);
    });
  });
}

async function buildHelper(args) {
  if (args.skipBuild) {
    if (!existsSync(args.helper)) {
      throw new Error(`WGC helper not found and --skipBuild was set: ${args.helper}`);
    }
    return { skipped: true, helper: args.helper };
  }

  const result = await runCommand("cargo", ["build", "--quiet"], {
    cwd: helperDir,
    timeoutMs: args.timeoutMs,
    verbose: args.verbose,
  });
  if (!result.ok) {
    throw new Error(`cargo build failed${result.stderr.trim() ? `: ${result.stderr.trim()}` : ""}`);
  }
  if (!existsSync(args.helper)) {
    throw new Error(`WGC helper was not produced at ${args.helper}`);
  }
  return { skipped: false, helper: args.helper, durationMs: result.durationMs };
}

async function runProfile(args, profile, index) {
  const port = args.port + index;
  const env = {
    ...process.env,
    LAN_DUAL_WINDOWS_WGC_HELPER: args.helper,
  };
  delete env.LAN_DUAL_WINDOWS_WGC_HELPER_ARGS;
  const argv = [
    observeScript,
    "--host",
    args.host,
    "--port",
    String(port),
    "--password",
    args.password,
    "--screenMode",
    "wgc",
    "--requireRealVideo",
    "true",
    "--width",
    String(args.width),
    "--height",
    String(args.height),
    "--fps",
    String(profile.fps),
    "--bandwidthKbps",
    String(profile.bandwidthKbps),
    "--qualityPreset",
    profile.qualityPreset,
    "--durationMs",
    String(args.durationMs),
    "--timeoutMs",
    String(args.timeoutMs),
    "--minFrames",
    String(args.minFrames),
    "--minFps",
    String(args.minFps),
    "--maxGapMs",
    String(args.maxGapMs),
    "--maxFrameAgeMs",
    String(args.maxFrameAgeMs),
    "--expectSessionFps",
    String(profile.fps),
    "--resourceSample",
    String(args.resourceSample),
    "--resourceSampleTree",
    String(args.resourceSampleTree),
    "--resourceSampleIntervalMs",
    String(args.resourceSampleIntervalMs),
    "--resourceSampleTimeoutMs",
    String(args.resourceSampleTimeoutMs),
    "--wgcRepeatLastFrame",
    String(args.repeatLastFrame),
    "--wgcRepeatLastFrameMode",
    args.repeatLastFrameMode,
    "--json",
  ];

  const result = await runCommand(process.execPath, argv, {
    cwd: repoRoot,
    env,
    timeoutMs: args.timeoutMs + args.durationMs + 5000,
    verbose: args.verbose,
  });
  if (!result.ok) {
    return {
      ok: false,
      profile,
      durationMs: result.durationMs,
      error: summarizeChildFailure(result),
    };
  }

  try {
    const report = JSON.parse(result.stdout.trim().replace(/^\uFEFF/, ""));
    return {
      ok: true,
      profile,
      durationMs: result.durationMs,
      session: report.session,
      observation: report.observation,
      resource: report.resource,
      discoveryScreen: report.discoveryScreen,
    };
  } catch (error) {
    return {
      ok: false,
      profile,
      durationMs: result.durationMs,
      error: `Failed to parse observer JSON: ${error.message}`,
    };
  }
}

function summarizeChildFailure(result) {
  const text = `${result.stderr}\n${result.stdout}`.trim().replace(/\s+/g, " ");
  if (result.timedOut) {
    return `observer timed out after ${result.durationMs} ms${text ? `: ${text.slice(0, 300)}` : ""}`;
  }
  return text.slice(0, 500) || `observer exited ${result.exitCode}`;
}

function compactResult(result) {
  const observation = result.observation || {};
  const resource = result.resource || {};
  return {
    ok: result.ok,
    profile: result.profile,
    sessionFps: result.session?.fps || 0,
    frames: observation.frameCount || 0,
    fps: observation.fps || 0,
    maxGapMs: observation.maxGapMs ?? null,
    avgPayloadBytes: observation.avgPayloadBytes || 0,
    freshFrames: observation.freshFrames || 0,
    repeatedFrames: observation.repeatedFrames || 0,
    repeatSignalFrames: observation.repeatSignalFrames || 0,
    uniqueHelperFrameCount: observation.uniqueHelperFrameCount || 0,
    maxFrameAgeMs: observation.maxFrameAgeMs ?? null,
    maxContentAgeMs: observation.maxContentAgeMs ?? null,
    avgCpuPercent: resource.avgCpuPercent ?? null,
    maxCpuPercent: resource.maxCpuPercent ?? null,
    peakWorkingSetMiB: resource.peakWorkingSetMiB ?? null,
    error: result.error || "",
  };
}

function printProfile(result) {
  const summary = compactResult(result);
  if (!summary.ok) {
    console.log(`[FAIL] ${summary.profile.name}: ${summary.error}`);
    return;
  }
  console.log(
    `[OK] ${summary.profile.name}: session ${summary.sessionFps}Hz, ` +
    `${summary.frames} frames / ${summary.fps}fps, gap ${summary.maxGapMs}ms, ` +
    `avg ${summary.avgPayloadBytes} bytes, repeated ${summary.repeatedFrames}` +
    `${summary.repeatSignalFrames ? ` (${summary.repeatSignalFrames} signal)` : ""}, ` +
    `content age max ${summary.maxContentAgeMs ?? "?"}ms, ` +
    `CPU avg/max ${summary.avgCpuPercent ?? "?"}/${summary.maxCpuPercent ?? "?"}%, ` +
    `WS peak ${summary.peakWorkingSetMiB ?? "?"} MiB`,
  );
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const build = await buildHelper(args);
  if (!args.json) {
    console.log(`[OK] WGC helper ready: ${args.helper}${build.skipped ? " (build skipped)" : ""}`);
  }

  const results = [];
  for (let index = 0; index < args.profiles.length; index += 1) {
    const profile = args.profiles[index];
    if (!args.json) {
      console.log(`[RUN] ${profile.name}`);
    }
    const result = await runProfile(args, profile, index);
    results.push(result);
    if (!args.json) {
      printProfile(result);
    }
  }

  const summary = {
    ok: results.every((result) => result.ok),
    helper: args.helper,
    requested: {
      width: args.width,
      height: args.height,
      durationMs: args.durationMs,
      resourceSample: args.resourceSample,
      resourceSampleTree: args.resourceSampleTree,
      repeatLastFrame: args.repeatLastFrame,
      repeatLastFrameMode: args.repeatLastFrameMode,
    },
    profiles: results.map(compactResult),
    results,
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  }
  process.exitCode = summary.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
