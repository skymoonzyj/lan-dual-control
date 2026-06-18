import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const audioDevicesScript = resolve(scriptDir, "check-windows-audio-devices.mjs");

const defaults = {
  timeoutMs: 15000,
};

function printUsage() {
  console.log(`Usage:
  node scripts/windows/test-windows-audio-devices-summary.mjs [options]

Options:
  --timeoutMs <ms>  Per-command timeout (default: ${defaults.timeoutMs})
  --help, -h        Show this help

Description:
  Verifies check-windows-audio-devices exposes a one-line, secret-free
  AudioDevices= boardSummary and JSON boardSummary without capturing audio.
`);
}

function parseArgs(argv) {
  const args = { ...defaults, help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--timeoutMs") {
      args.timeoutMs = Number(argv[index + 1]) || defaults.timeoutMs;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function runCheck(argv, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [audioDevicesScript, ...argv], {
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
    }, args.timeoutMs);

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
      resolveRun({ exitCode, stdout, stderr, timedOut });
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(text, expected, label) {
  assert(String(text).includes(expected), `${label} should include ${expected}`);
}

function assertNotIncludes(text, unexpected, label) {
  assert(!String(text).includes(unexpected), `${label} should not include ${unexpected}`);
}

function assertNoSecretOrProtocolLeak(text, label) {
  for (const unexpected of [
    "fake-audio-secret",
    "LAN_DUAL_PASSWORD=",
    "auth_request",
    "input_event",
    "input_ack",
    "video_frame",
    "audio_frame",
  ]) {
    assertNotIncludes(text, unexpected, label);
  }
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}\n${text.slice(0, 1000)}`);
  }
}

function cmdQuotePath(value) {
  return String(value).replace(/"/g, '""');
}

async function makeFakeTools() {
  const dir = await mkdtemp(join(tmpdir(), "lan-dual-audio-devices-"));
  const ffmpegModule = join(dir, "fake-ffmpeg.mjs");
  const ffmpegCmd = join(dir, "fake-ffmpeg.cmd");
  const helperPs1 = join(dir, "fake-wasapi.ps1");

  await writeFile(ffmpegModule, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes("-list_devices")) {
  console.error('"Windows Output Mix" (audio)');
  console.error('"Virtual Loopback" (audio)');
  console.error('"Integrated Webcam" (video)');
  process.exit(0);
}
process.stderr.write("fake ffmpeg received unexpected args: " + args.join(" "));
process.exit(2);
`, "utf8");

  await writeFile(
    ffmpegCmd,
    `@echo off\r\n"${cmdQuotePath(process.execPath)}" "${cmdQuotePath(ffmpegModule)}" %*\r\n`,
    "utf8",
  );

  await writeFile(helperPs1, `
param(
  [switch]$InfoOnly,
  [int]$SampleRate = 48000,
  [int]$Channels = 2,
  [int]$FrameMs = 20,
  [int]$DurationMs = 1200
)
if ($InfoOnly) {
  [Console]::Out.WriteLine('{"ok":true,"backend":"wasapi-loopback","outputSampleRate":48000,"outputChannels":2,"inputFormat":"ieee-float32","frameMs":20,"helper":"fake"}')
  exit 0
}
[Console]::Error.WriteLine("unexpected fake WASAPI capture")
exit 3
`, "utf8");

  return {
    dir,
    ffmpeg: ffmpegCmd,
    helper: helperPs1,
  };
}

function commonFakeArgs(fake) {
  return [
    "--ffmpeg", fake.ffmpeg,
    "--helper", fake.helper,
    "--sampleRate", "48000",
    "--channels", "2",
    "--durationMs", "200",
  ];
}

async function checkBoardSummary(args) {
  const fake = await makeFakeTools();
  try {
    const result = await runCheck([...commonFakeArgs(fake), "--boardSummary"], args);
    const output = `${result.stdout}\n${result.stderr}`;
    assert(!result.timedOut, "boardSummary run timed out");
    assert(result.exitCode === 0, `boardSummary run failed:\n${output}`);
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    assert(lines.length === 1, `boardSummary should print one line, got ${lines.length}:\n${result.stdout}`);
    const line = lines[0];
    assertIncludes(line, "AudioDevices=Windows audio devices:", "boardSummary");
    assertIncludes(line, "wasapi=ok", "boardSummary");
    assertIncludes(line, "48000Hz/2ch", "boardSummary");
    assertIncludes(line, "dshowAudio=", "boardSummary");
    assertIncludes(line, "probe=skipped", "boardSummary");
    assertIncludes(line, "no password/auth/input/inject", "boardSummary");
    assertNoSecretOrProtocolLeak(output, "boardSummary output");
    console.log("[OK] Audio devices boardSummary is one line and secret-free");
  } finally {
    await rm(fake.dir, { recursive: true, force: true });
  }
}

async function checkJsonBoardSummary(args) {
  const fake = await makeFakeTools();
  try {
    const result = await runCheck([...commonFakeArgs(fake), "--json"], args);
    const output = `${result.stdout}\n${result.stderr}`;
    assert(!result.timedOut, "JSON run timed out");
    assert(result.exitCode === 0, `JSON run failed:\n${output}`);
    const payload = parseJson(result.stdout, "JSON run");
    assertIncludes(payload.boardSummary, "AudioDevices=Windows audio devices:", "JSON boardSummary");
    assertIncludes(payload.boardSummary, "wasapi=ok", "JSON boardSummary");
    assertIncludes(payload.boardSummary, "dshowAudio=", "JSON boardSummary");
    assertIncludes(payload.boardSummary, "probe=skipped", "JSON boardSummary");
    assertNoSecretOrProtocolLeak(output, "JSON output");
    console.log("[OK] Audio devices JSON includes boardSummary");
  } finally {
    await rm(fake.dir, { recursive: true, force: true });
  }
}

async function checkHelp(args) {
  const result = await runCheck(["--help"], args);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(!result.timedOut, "help run timed out");
  assert(result.exitCode === 0, `help run failed:\n${output}`);
  assertIncludes(output, "--boardSummary", "help");
  assertIncludes(output, "without listing devices or capturing audio", "help");
  assertNoSecretOrProtocolLeak(output, "help output");
  console.log("[OK] Audio devices help documents boardSummary safely");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printUsage();
    return;
  }

  await checkBoardSummary(args);
  await checkJsonBoardSummary(args);
  await checkHelp(args);
  console.log("[OK] Windows audio devices summary regression passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
