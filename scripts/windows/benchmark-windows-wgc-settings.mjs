import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  repeatLastFrame: false,
  repeatLastFrameMode: "full",
  h264Bridge: false,
  h264Source: "jpeg",
  h264Encoder: "",
  motionStimulus: false,
  motionStimulusBackend: "winforms",
  motionStimulusWidth: 960,
  motionStimulusHeight: 540,
  motionStimulusWarmupMs: 1200,
  motionStimulusBrowser: "",
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
  --minFreshFps <n>                     Minimum non-repeated frame FPS per profile
  --minUniqueHelperFps <n>              Minimum unique WGC helper source FPS per profile
  --maxRepeatedFrameRatio <n>           Max repeated frame ratio, 0-1 or 0-100 percent. Default: ${defaults.maxRepeatedFrameRatio}
  --maxGapMs <ms>                       Max receive gap before a profile fails. Default: ${defaults.maxGapMs}
  --maxFrameAgeMs <ms>                  Max timestamp receive age. Default: ${defaults.maxFrameAgeMs}
  --maxContentAgeMs <ms>                Max repeated WGC content age; 0 disables. Default: ${defaults.maxContentAgeMs}
  --resourceSample false                Disable local host resource sampling
  --resourceSampleTree false            Sample only the host process, not helper children
  --repeatLastFrame                     Enable WGC repeat-last-frame pacing diagnostics
  --repeatLastFrameMode <full|signal>   full resends JPEG, signal sends repeat markers
  --h264Bridge                          Request H.264 and enable the WGC helper -> FFmpeg bridge
  --h264Source <jpeg|raw-bgra|nv12>     Helper source for --h264Bridge. Default: ${defaults.h264Source}
  --h264Encoder <name>                  Optional FFmpeg H.264 encoder, for example h264_nvenc
  --motionStimulus                      Open a temporary visible animated window before probing
  --motionStimulusBackend <name>        winforms | browser. Default: ${defaults.motionStimulusBackend}
  --motionStimulusWidth <px>            Animated window width. Default: ${defaults.motionStimulusWidth}
  --motionStimulusHeight <px>           Animated window height. Default: ${defaults.motionStimulusHeight}
  --motionStimulusWarmupMs <ms>         Wait after opening the animation. Default: ${defaults.motionStimulusWarmupMs}
  --motionStimulusBrowser <path>        Browser exe for the animation window. Default: auto-detect Edge
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
  args.repeatLastFrame = booleanArg(args.repeatLastFrame);
  args.repeatLastFrameMode = normalizeRepeatLastFrameMode(args.repeatLastFrameMode);
  args.h264Bridge = booleanArg(args.h264Bridge);
  args.h264Source = normalizeH264Source(args.h264Source);
  args.h264Encoder = String(args.h264Encoder || "").trim().toLowerCase();
  args.motionStimulus = booleanArg(args.motionStimulus);
  args.motionStimulusBackend = normalizeMotionStimulusBackend(args.motionStimulusBackend);
  args.motionStimulusWidth = Math.max(320, Number(args.motionStimulusWidth) || defaults.motionStimulusWidth);
  args.motionStimulusHeight = Math.max(240, Number(args.motionStimulusHeight) || defaults.motionStimulusHeight);
  args.motionStimulusWarmupMs = Math.max(300, Number(args.motionStimulusWarmupMs) || defaults.motionStimulusWarmupMs);
  args.motionStimulusBrowser = String(args.motionStimulusBrowser || process.env.LAN_DUAL_MOTION_STIMULUS_BROWSER || "").trim();
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

function normalizeH264Source(value) {
  const source = String(value ?? defaults.h264Source).trim().toLowerCase();
  if (["raw", "bgra", "raw-bgra", "raw_bgra"].includes(source)) {
    return "raw-bgra";
  }
  if (["nv12", "raw-nv12", "raw_nv12", "yuv", "yuv420"].includes(source)) {
    return "nv12";
  }
  return "jpeg";
}

function normalizeMotionStimulusBackend(value) {
  const backend = String(value ?? defaults.motionStimulusBackend).trim().toLowerCase();
  if (["browser", "edge", "chrome", "chromium"].includes(backend)) {
    return "browser";
  }
  return "winforms";
}

function booleanArg(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (value === true || value === false) return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
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

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
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

function findMotionStimulusBrowser(args) {
  const configured = String(args.motionStimulusBrowser || "").trim();
  if (configured) {
    if (!existsSync(configured)) {
      throw new Error(`motion stimulus browser not found: ${configured}`);
    }
    return configured;
  }

  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  const browser = candidates.find((candidate) => existsSync(candidate));
  if (!browser) {
    throw new Error("motion stimulus requires Microsoft Edge or Chrome; pass --motionStimulusBrowser <path>");
  }
  return browser;
}

function makeMotionStimulusHtml(args) {
  const targetFps = Math.max(1, Math.min(240, Number(args.profiles?.[0]?.fps) || 60));
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>LAN Dual Control WGC Motion Stimulus</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #05070b; }
    canvas { display: block; width: 100vw; height: 100vh; }
  </style>
</head>
<body>
<canvas id="stage"></canvas>
<script>
const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d", { alpha: false });
let frame = 0;
function resize() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();
function draw(now) {
  frame += 1;
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  const t = now / 1000;
  const hue = (t * 90) % 360;
  ctx.fillStyle = "hsl(" + hue + " 80% 8%)";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 24; i += 1) {
    const x = ((t * (80 + i * 7)) + i * 97) % (w + 260) - 130;
    const y = (i * 41 + Math.sin(t * 2 + i) * 80 + h * 0.45) % h;
    ctx.fillStyle = "hsl(" + ((hue + i * 31) % 360) + " 90% 58%)";
    ctx.fillRect(x, y, 180 + (i % 5) * 24, 18 + (i % 4) * 12);
  }
  for (let i = 0; i < 9; i += 1) {
    const radius = 34 + i * 9;
    const x = w * 0.5 + Math.cos(t * (1.3 + i * 0.08) + i) * (w * 0.32);
    const y = h * 0.5 + Math.sin(t * (1.1 + i * 0.11) + i * 2) * (h * 0.34);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "hsla(" + ((hue + 180 + i * 19) % 360) + " 90% 60% / 0.7)";
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.font = "700 34px Segoe UI, Arial, sans-serif";
  ctx.fillText("WGC MOTION STIMULUS", 28, 52);
  ctx.font = "22px Consolas, monospace";
  ctx.fillText("target " + ${JSON.stringify(targetFps)} + "Hz  frame " + frame, 30, 86);
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
</script>
</body>
</html>
`;
}

function makeMotionStimulusPowerShell(args) {
  const width = Math.round(args.motionStimulusWidth);
  const height = Math.round(args.motionStimulusHeight);
  const targetFps = Math.max(1, Math.min(240, Number(args.profiles?.[0]?.fps) || 60));
  return `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$form = New-Object System.Windows.Forms.Form
$form.Text = 'LAN Dual Control WGC Motion Stimulus'
$form.StartPosition = 'Manual'
$form.Location = New-Object System.Drawing.Point(64, 64)
$form.Size = New-Object System.Drawing.Size(${width}, ${height})
$form.TopMost = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(5, 7, 11)
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::SizableToolWindow
try {
  $prop = $form.GetType().GetProperty('DoubleBuffered', [System.Reflection.BindingFlags]'NonPublic,Instance')
  if ($prop) { $prop.SetValue($form, $true, $null) }
} catch {}
$script:Frame = 0
$script:StartedAt = [DateTime]::UtcNow
$fontTitle = New-Object System.Drawing.Font('Segoe UI', 24, [System.Drawing.FontStyle]::Bold)
$fontMono = New-Object System.Drawing.Font('Consolas', 14, [System.Drawing.FontStyle]::Regular)
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = [Math]::Max(8, [Math]::Round(1000 / ${targetFps}))
$form.Add_Paint({
  param($sender, $event)
  $g = $event.Graphics
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighSpeed
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
  $w = [Math]::Max(1, $sender.ClientSize.Width)
  $h = [Math]::Max(1, $sender.ClientSize.Height)
  $elapsed = ([DateTime]::UtcNow - $script:StartedAt).TotalSeconds
  $base = [int](($elapsed * 110) % 360)
  $g.Clear([System.Drawing.Color]::FromArgb(5, 7, 11))
  for ($i = 0; $i -lt 30; $i++) {
    $x = [int]((($elapsed * (90 + $i * 8)) + $i * 101) % ($w + 280) - 140)
    $y = [int](($i * 37 + [Math]::Sin($elapsed * 2.4 + $i) * 88 + $h * 0.48) % $h)
    $color = [System.Drawing.Color]::FromArgb(230, (($base + $i * 23) % 255), ((90 + $i * 41) % 255), ((210 + $i * 17) % 255))
    $brush = New-Object System.Drawing.SolidBrush($color)
    $g.FillRectangle($brush, $x, $y, 180 + (($i % 5) * 28), 18 + (($i % 4) * 12))
    $brush.Dispose()
  }
  for ($i = 0; $i -lt 8; $i++) {
    $radius = 32 + $i * 10
    $x = [int]($w * 0.5 + [Math]::Cos($elapsed * (1.5 + $i * 0.12) + $i) * ($w * 0.34))
    $y = [int]($h * 0.5 + [Math]::Sin($elapsed * (1.2 + $i * 0.15) + $i * 2) * ($h * 0.34))
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, ((230 + $i * 19) % 255), ((70 + $i * 31) % 255), ((120 + $i * 43) % 255)))
    $g.FillEllipse($brush, $x - $radius, $y - $radius, $radius * 2, $radius * 2)
    $brush.Dispose()
  }
  $white = [System.Drawing.Brushes]::White
  $g.DrawString('WGC MOTION STIMULUS', $fontTitle, $white, 24, 24)
  $g.DrawString(('target ${targetFps}Hz  frame ' + $script:Frame), $fontMono, $white, 28, 68)
})
$timer.Add_Tick({
  $script:Frame += 1
  $form.Invalidate()
})
$form.Add_Shown({
  $timer.Start()
  $form.Activate()
})
$form.Add_FormClosed({
  $timer.Stop()
  $fontTitle.Dispose()
  $fontMono.Dispose()
})
[System.Windows.Forms.Application]::Run($form)
`;
}

async function startMotionStimulus(args) {
  if (!args.motionStimulus) {
    return {
      enabled: false,
      ok: true,
      pid: 0,
      browser: "",
      cleanup: async () => {},
    };
  }

  const dir = await mkdtemp(join(tmpdir(), "lan-dual-wgc-motion-"));
  let child;
  let browser = "";
  let htmlPath = "";
  let scriptPath = "";
  if (args.motionStimulusBackend === "browser") {
    browser = findMotionStimulusBrowser(args);
    htmlPath = join(dir, "motion.html");
    await writeFile(htmlPath, makeMotionStimulusHtml(args), "utf8");
    const userDataDir = join(dir, "profile");
    child = spawn(browser, [
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--disable-session-crashed-bubble",
      "--disable-features=Translate",
      "--new-window",
      `--window-size=${Math.round(args.motionStimulusWidth)},${Math.round(args.motionStimulusHeight)}`,
      "--window-position=64,64",
      `--app=${pathToFileURL(htmlPath).href}`,
    ], {
      stdio: "ignore",
      windowsHide: false,
    });
  } else {
    scriptPath = join(dir, "motion.ps1");
    await writeFile(scriptPath, makeMotionStimulusPowerShell(args), "utf8");
    child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
    ], {
      stdio: "ignore",
      windowsHide: false,
    });
  }

  let started = false;
  await new Promise((resolveStart, rejectStart) => {
    const timer = setTimeout(() => {
      started = true;
      resolveStart();
    }, args.motionStimulusWarmupMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectStart(error);
    });
    child.once("exit", (code, signal) => {
      if (!started) {
        clearTimeout(timer);
        rejectStart(new Error(`motion stimulus browser exited early: ${code ?? signal ?? "unknown"}`));
      }
    });
  }).catch(async (error) => {
    if (child.exitCode === null) {
      child.kill();
    }
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw error;
  });

  return {
    enabled: true,
    ok: true,
    backend: args.motionStimulusBackend,
    pid: child.pid || 0,
    browser,
    htmlPath,
    scriptPath,
    width: args.motionStimulusWidth,
    height: args.motionStimulusHeight,
    warmupMs: args.motionStimulusWarmupMs,
    cleanup: async () => {
      if (child.exitCode === null) {
        child.kill();
      }
      await delay(350);
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    },
  };
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
  if (args.h264Bridge) {
    argv.push(
      "--preferredVideoCodec",
      "h264",
      "--wgcH264Bridge",
      "true",
      "--wgcH264Source",
      args.h264Source,
    );
    if (args.h264Encoder) {
      argv.push("--h264Encoder", args.h264Encoder);
    }
  }

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
    capturePipeline: result.session?.capturePipeline || "",
    h264Encoder: result.session?.h264Encoder || "",
    wgcH264Source: result.session?.wgcH264Source || result.discoveryScreen?.wgc?.h264BridgeSource || "",
    frames: observation.frameCount || 0,
    fps: observation.fps || 0,
    freshFps: observation.freshFps || 0,
    uniqueHelperFps: observation.uniqueHelperFps || 0,
    maxGapMs: observation.maxGapMs ?? null,
    avgPayloadBytes: observation.avgPayloadBytes || 0,
    freshFrames: observation.freshFrames || 0,
    repeatedFrames: observation.repeatedFrames || 0,
    repeatedFramePercent: observation.repeatedFramePercent ?? null,
    repeatSignalFrames: observation.repeatSignalFrames || 0,
    repeatSignalFramePercent: observation.repeatSignalFramePercent ?? null,
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
    `${summary.capturePipeline || "unknown-pipeline"}${summary.h264Encoder ? `/${summary.h264Encoder}` : ""}, ` +
    `${summary.frames} frames / ${summary.fps}fps, fresh ${summary.freshFps}fps, ` +
    `source ${summary.uniqueHelperFrameCount}@${summary.uniqueHelperFps}fps, gap ${summary.maxGapMs}ms, ` +
    `avg ${summary.avgPayloadBytes} bytes, repeated ${summary.repeatedFrames}` +
    `${summary.repeatedFramePercent !== null ? ` (${summary.repeatedFramePercent}%)` : ""}` +
    `${summary.repeatSignalFrames ? ` / signal ${summary.repeatSignalFrames} (${summary.repeatSignalFramePercent ?? "?"}%)` : ""}, ` +
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

  let motionStimulus = {
    enabled: false,
    ok: true,
    cleanup: async () => {},
  };
  const results = [];

  const build = await buildHelper(args);
  if (!args.json) {
    console.log(`[OK] WGC helper ready: ${args.helper}${build.skipped ? " (build skipped)" : ""}`);
  }

  try {
    motionStimulus = await startMotionStimulus(args);
    if (motionStimulus.enabled && !args.json) {
      console.log(`[OK] Motion stimulus ready: PID ${motionStimulus.pid}, ${Math.round(motionStimulus.width)}x${Math.round(motionStimulus.height)}`);
    }

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
  } finally {
    await motionStimulus.cleanup();
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
      minFreshFps: args.minFreshFps,
      minUniqueHelperFps: args.minUniqueHelperFps,
      maxRepeatedFrameRatio: args.maxRepeatedFrameRatio,
      maxContentAgeMs: args.maxContentAgeMs,
      repeatLastFrame: args.repeatLastFrame,
      repeatLastFrameMode: args.repeatLastFrameMode,
      h264Bridge: args.h264Bridge,
      h264Source: args.h264Bridge ? args.h264Source : "",
      h264Encoder: args.h264Bridge ? args.h264Encoder : "",
      motionStimulus: args.motionStimulus,
      motionStimulusBackend: args.motionStimulusBackend,
      motionStimulusWidth: args.motionStimulusWidth,
      motionStimulusHeight: args.motionStimulusHeight,
      motionStimulusWarmupMs: args.motionStimulusWarmupMs,
    },
    motionStimulus: {
      enabled: motionStimulus.enabled,
      backend: motionStimulus.backend || "",
      pid: motionStimulus.pid || 0,
      browser: motionStimulus.browser || "",
      width: motionStimulus.width || 0,
      height: motionStimulus.height || 0,
      warmupMs: motionStimulus.warmupMs || 0,
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
