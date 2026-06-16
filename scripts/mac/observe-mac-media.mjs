#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const videoScript = resolve(scriptDir, "observe-mac-video.mjs");
const audioScript = resolve(scriptDir, "observe-mac-audio.mjs");

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  password: process.env.LAN_DUAL_PASSWORD || "",
  timeoutMs: 8000,
  commandTimeoutMs: 90000,
  videoDurationMs: 5000,
  videoMinFrames: 0,
  videoMinFps: 0,
  videoMaxGapMs: 1000,
  preferredVideoCodec: "h264",
  requireH264: true,
  requireRealVideo: false,
  width: 1280,
  height: 720,
  fps: 30,
  bandwidthKbps: 12000,
  displayId: "main",
  expectActiveDisplayId: "main",
  requireFrameTimestamp: false,
  maxFrameAgeMs: 0,
  requireMonotonicTimestamp: true,
  maxTimestampGapUs: 0,
  audioDurationMs: 5000,
  audioMinFrames: 0,
  audioMaxGapMs: 1000,
  requireLevel: false,
  minLevel: 0.01,
  playTone: false,
  toneFrequency: 880,
  toneDurationMs: 1500,
  toneDelayMs: 750,
  toneVolume: 0.22,
  skipVideo: false,
  skipAudio: false,
  json: false,
  boardSummary: false,
  debugCommands: false,
};

function printUsage() {
  console.log(`Usage:
  node scripts/mac/observe-mac-media.mjs [options]

Description:
  Runs Mac host video and audio observations sequentially, then prints one media
  baseline summary. It connects to an already running Mac host only: it does not
  start the host, does not send input events, and does not execute inject.

Options:
  --host <host> --port <port>          Mac host target. Default: ${defaults.host}:${defaults.port}
  --password <password>                Probe password. Prefer LAN_DUAL_PASSWORD.
                                      The child observers receive it through env.
  --timeoutMs <ms>                     Handshake timeout for each observer. Default: ${defaults.timeoutMs}
  --commandTimeoutMs <ms>              Whole child command timeout. Default: ${defaults.commandTimeoutMs}
  --videoDurationMs <ms>               Video observation window. Default: ${defaults.videoDurationMs}
  --videoMinFrames <count>             Minimum video frames. Default: child observer default
  --videoMinFps <fps>                  Minimum observed video FPS. Default: off
  --videoMaxGapMs <ms>                 Maximum video receive gap. Default: ${defaults.videoMaxGapMs}
  --preferredVideoCodec <codec>        Requested video codec. Default: ${defaults.preferredVideoCodec}
  --requireH264 <true|false>           Require H.264 Annex B frames. Default: true
  --requireRealVideo                   Reject mock/svg frames.
  --width <px> --height <px> --fps <n> Video request. Default: ${defaults.width}x${defaults.height}/${defaults.fps}
  --bandwidthKbps <kbps>               Video bandwidth request. Default: ${defaults.bandwidthKbps}
  --displayId <id>                     Requested display id. Default: ${defaults.displayId}
  --expectActiveDisplayId <id>         Require frame display id. Default: ${defaults.expectActiveDisplayId}
  --requireFrameTimestamp              Require video/audio ISO timestamps.
  --maxFrameAgeMs <ms>                 Maximum video/audio timestamp receive age. Default: off
  --requireMonotonicTimestamp <bool>   Require video timestampUs and audio timestamp monotonicity. Default: true
  --maxTimestampGapUs <us>             Maximum video timestampUs gap. Default: off
  --audioDurationMs <ms>               Audio observation window. Default: ${defaults.audioDurationMs}
  --audioMinFrames <count>             Minimum audio frames. Default: child observer default
  --audioMaxGapMs <ms>                 Maximum audio receive gap. Default: ${defaults.audioMaxGapMs}
  --requireLevel                       Require audio level above --minLevel.
  --minLevel <level>                   Minimum max audio level. Default: ${defaults.minLevel}
  --playTone                           Play a local macOS test tone during audio probe. Default: off
  --toneFrequency <hz>                 Test tone frequency. Default: ${defaults.toneFrequency}
  --toneDurationMs <ms>                Test tone duration. Default: ${defaults.toneDurationMs}
  --toneDelayMs <ms>                   Delay after first audio frame before tone. Default: ${defaults.toneDelayMs}
  --toneVolume <0..1>                  Test tone volume. Default: ${defaults.toneVolume}
  --skipVideo                          Only run audio observation.
  --skipAudio                          Only run video observation.
  --json                               Print one machine-readable JSON object.
  --boardSummary                       Print one Agent Link Board-safe summary line.
  --debugCommands                      Print child observer commands with password redacted.
  --help, -h                           Show this help without probing anything.

Examples:
  LAN_DUAL_PASSWORD=... node scripts/mac/observe-mac-media.mjs --json
  node scripts/mac/observe-mac-media.mjs --videoDurationMs 30000 --audioDurationMs 30000 --maxFrameAgeMs 250 --boardSummary
  node scripts/mac/observe-mac-media.mjs --preferredVideoCodec mjpeg --requireH264 false --requireRealVideo --skipAudio
`);
}

function parseArgs(argv) {
  const args = { ...defaults };
  args.passwordFromArg = false;

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new Error(`Unknown argument: ${token}`);
    }
    const key = token.slice(2);
    if (!Object.prototype.hasOwnProperty.call(args, key) && key !== "noRequireMonotonicTimestamp") {
      throw new Error(`Unknown argument: ${token}`);
    }
    if (key === "noRequireMonotonicTimestamp") {
      args.requireMonotonicTimestamp = false;
      continue;
    }
    if (next && !next.startsWith("--")) {
      args[key] = next;
      if (key === "password") args.passwordFromArg = true;
      index += 1;
    } else {
      args[key] = true;
    }
  }

  args.host = String(args.host || defaults.host).trim();
  args.port = clampInteger(args.port, 1, 65535, defaults.port);
  args.password = String(args.password || "");
  args.timeoutMs = clampInteger(args.timeoutMs, 1000, 600000, defaults.timeoutMs);
  args.commandTimeoutMs = clampInteger(args.commandTimeoutMs, 3000, 1200000, defaults.commandTimeoutMs);
  args.videoDurationMs = clampInteger(args.videoDurationMs, 200, 1200000, defaults.videoDurationMs);
  args.videoMinFrames = clampInteger(args.videoMinFrames, 0, 1000000, defaults.videoMinFrames);
  args.videoMinFps = nonNegativeNumber(args.videoMinFps, defaults.videoMinFps);
  args.videoMaxGapMs = clampInteger(args.videoMaxGapMs, 50, 600000, defaults.videoMaxGapMs);
  args.preferredVideoCodec = String(args.preferredVideoCodec || defaults.preferredVideoCodec).trim().toLowerCase();
  args.requireH264 = booleanArg(args.requireH264, defaults.requireH264);
  args.requireRealVideo = booleanArg(args.requireRealVideo, defaults.requireRealVideo);
  args.width = clampInteger(args.width, 1, 16384, defaults.width);
  args.height = clampInteger(args.height, 1, 16384, defaults.height);
  args.fps = clampInteger(args.fps, 1, 240, defaults.fps);
  args.bandwidthKbps = clampInteger(args.bandwidthKbps, 1, 1000000, defaults.bandwidthKbps);
  args.displayId = String(args.displayId || defaults.displayId).trim();
  args.expectActiveDisplayId = String(args.expectActiveDisplayId || "").trim();
  args.requireFrameTimestamp = booleanArg(args.requireFrameTimestamp, defaults.requireFrameTimestamp);
  args.maxFrameAgeMs = clampInteger(args.maxFrameAgeMs, 0, 600000, defaults.maxFrameAgeMs);
  args.requireMonotonicTimestamp = booleanArg(args.requireMonotonicTimestamp, defaults.requireMonotonicTimestamp);
  args.maxTimestampGapUs = clampInteger(args.maxTimestampGapUs, 0, 60_000_000, defaults.maxTimestampGapUs);
  args.audioDurationMs = clampInteger(args.audioDurationMs, 200, 1200000, defaults.audioDurationMs);
  args.audioMinFrames = clampInteger(args.audioMinFrames, 0, 1000000, defaults.audioMinFrames);
  args.audioMaxGapMs = clampInteger(args.audioMaxGapMs, 50, 600000, defaults.audioMaxGapMs);
  args.requireLevel = booleanArg(args.requireLevel, defaults.requireLevel);
  args.minLevel = nonNegativeNumber(args.minLevel, defaults.minLevel);
  args.playTone = booleanArg(args.playTone, defaults.playTone);
  args.toneFrequency = clampInteger(args.toneFrequency, 20, 20000, defaults.toneFrequency);
  args.toneDurationMs = clampInteger(args.toneDurationMs, 50, 60000, defaults.toneDurationMs);
  args.toneDelayMs = clampInteger(args.toneDelayMs, 0, 60000, defaults.toneDelayMs);
  args.toneVolume = Math.min(1, nonNegativeNumber(args.toneVolume, defaults.toneVolume));
  args.skipVideo = booleanArg(args.skipVideo, defaults.skipVideo);
  args.skipAudio = booleanArg(args.skipAudio, defaults.skipAudio);
  args.json = booleanArg(args.json, defaults.json);
  args.boardSummary = booleanArg(args.boardSummary, defaults.boardSummary);
  args.debugCommands = booleanArg(args.debugCommands, defaults.debugCommands);

  if (args.skipVideo && args.skipAudio) {
    throw new Error("--skipVideo and --skipAudio cannot both be set.");
  }
  if (args.requireH264) {
    args.preferredVideoCodec = "h264";
  }
  if (args.maxFrameAgeMs > 0) {
    args.requireFrameTimestamp = true;
  }
  if (args.maxTimestampGapUs > 0) {
    args.requireMonotonicTimestamp = true;
  }
  return args;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function nonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function booleanArg(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === false) return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function addArg(argv, name, value) {
  if (value === undefined || value === null || value === "") return;
  argv.push(name, String(value));
}

function addFlag(argv, name, enabled) {
  if (enabled) argv.push(name);
}

function makeVideoArgs(args) {
  const argv = [];
  addArg(argv, "--host", args.host);
  addArg(argv, "--port", args.port);
  addArg(argv, "--durationMs", args.videoDurationMs);
  addArg(argv, "--timeoutMs", args.timeoutMs);
  addArg(argv, "--maxGapMs", args.videoMaxGapMs);
  addArg(argv, "--preferredVideoCodec", args.preferredVideoCodec);
  addArg(argv, "--width", args.width);
  addArg(argv, "--height", args.height);
  addArg(argv, "--fps", args.fps);
  addArg(argv, "--bandwidthKbps", args.bandwidthKbps);
  addArg(argv, "--displayId", args.displayId);
  if (args.videoMinFrames > 0) addArg(argv, "--minFrames", args.videoMinFrames);
  if (args.videoMinFps > 0) addArg(argv, "--minFps", args.videoMinFps);
  if (args.expectActiveDisplayId) addArg(argv, "--expectActiveDisplayId", args.expectActiveDisplayId);
  if (args.maxFrameAgeMs > 0) addArg(argv, "--maxFrameAgeMs", args.maxFrameAgeMs);
  if (args.maxTimestampGapUs > 0) addArg(argv, "--maxTimestampGapUs", args.maxTimestampGapUs);
  addFlag(argv, "--requireH264", args.requireH264);
  addFlag(argv, "--requireRealVideo", args.requireRealVideo);
  addFlag(argv, "--requireFrameTimestamp", args.requireFrameTimestamp);
  addFlag(argv, "--requireTimestampUs", args.requireMonotonicTimestamp || args.maxTimestampGapUs > 0);
  addFlag(argv, "--requireMonotonicTimestampUs", args.requireMonotonicTimestamp);
  addFlag(argv, "--json", true);
  return argv;
}

function makeAudioArgs(args) {
  const argv = [];
  addArg(argv, "--host", args.host);
  addArg(argv, "--port", args.port);
  addArg(argv, "--durationMs", args.audioDurationMs);
  addArg(argv, "--timeoutMs", args.timeoutMs);
  addArg(argv, "--maxGapMs", args.audioMaxGapMs);
  if (args.audioMinFrames > 0) addArg(argv, "--minFrames", args.audioMinFrames);
  if (args.maxFrameAgeMs > 0) addArg(argv, "--maxFrameAgeMs", args.maxFrameAgeMs);
  addFlag(argv, "--requireFrameTimestamp", args.requireFrameTimestamp);
  addFlag(argv, "--requireMonotonicTimestamp", args.requireMonotonicTimestamp);
  addFlag(argv, "--requireLevel", args.requireLevel);
  addArg(argv, "--minLevel", args.minLevel);
  addFlag(argv, "--playTone", args.playTone);
  addArg(argv, "--toneFrequency", args.toneFrequency);
  addArg(argv, "--toneDurationMs", args.toneDurationMs);
  addArg(argv, "--toneDelayMs", args.toneDelayMs);
  addArg(argv, "--toneVolume", args.toneVolume);
  addFlag(argv, "--json", true);
  return argv;
}

function runJsonScript(probe, scriptPath, argv, args) {
  return new Promise((resolveRun) => {
    const startedAt = performance.now();
    const env = { ...process.env };
    if (args.password) {
      env.LAN_DUAL_PASSWORD = args.password;
    }

    const child = spawn(process.execPath, [scriptPath, ...argv], {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 1000);
    }, args.commandTimeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({
        id: probe.id,
        label: probe.label,
        exitCode: null,
        timedOut,
        durationMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
        payload: null,
        parseError: "",
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const { payload, parseError } = parseJsonPayload(stdout);
      resolveRun({
        id: probe.id,
        label: probe.label,
        exitCode,
        timedOut,
        durationMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr,
        payload,
        parseError,
      });
    });
  });
}

function parseJsonPayload(stdout) {
  const text = String(stdout || "").trim();
  if (!text) {
    return { payload: null, parseError: "empty stdout" };
  }
  try {
    return { payload: JSON.parse(text), parseError: "" };
  } catch (error) {
    return { payload: null, parseError: error.message };
  }
}

function makeProbeResult(probe, result) {
  const payloadOk = result.payload?.ok === true;
  const ok = result.exitCode === 0 && payloadOk && !result.timedOut;
  const message = result.timedOut
    ? `probe timed out after ${result.durationMs} ms`
    : result.payload?.error?.message || result.parseError || lastMeaningfulLine(result.stderr) || lastMeaningfulLine(result.stdout) || `exit ${result.exitCode}`;
  return {
    id: probe.id,
    label: probe.label,
    ok,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    error: ok ? null : { message: redactSensitiveText(message) },
    target: result.payload?.target || { host: probe.host, port: String(probe.port) },
    discovery: result.payload?.discovery || null,
    session: result.payload?.session || null,
    observation: result.payload?.observation || null,
  };
}

function redactSensitiveText(text) {
  let output = String(text || "");
  const secrets = [
    process.env.LAN_DUAL_PASSWORD,
    passwordFromArg(process.argv),
  ].filter((value) => typeof value === "string" && value.length > 0);
  for (const secret of secrets) {
    output = output.split(secret).join("[redacted-password]");
  }
  return output;
}

function passwordFromArg(argv) {
  const index = argv.indexOf("--password");
  if (index < 0) return "";
  const next = argv[index + 1];
  return next && !next.startsWith("--") ? next : "";
}

function lastMeaningfulLine(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) || "";
}

function formatCommand(scriptPath, argv) {
  return [
    process.execPath,
    scriptPath,
    ...argv,
  ].map((part) => {
    const text = String(part);
    return /\s/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
  }).join(" ");
}

function print(args, kind, text) {
  if (args.json || args.boardSummary) return;
  console.log(`[${kind}] ${text}`);
}

function formatProbeSummary(probe) {
  if (!probe) return "skipped";
  if (!probe.ok) return `FAIL(reason=${formatBoardReason(probe.error?.message || "unknown")})`;
  const obs = probe.observation || {};
  if (probe.id === "video") {
    const codec = firstObjectKey(obs.codecs) || probe.session?.videoCodec || "unknown";
    const pipeline = firstObjectKey(obs.pipelines) || probe.session?.capturePipeline || "unknown";
    const age = obs.timestamp?.ageMaxMs ?? "n/a";
    return `${obs.frameCount || 0} frames, ${obs.fps || 0} fps, maxGap=${obs.maxGapMs ?? "?"}ms, ageMax=${age}ms, ${codec}/${pipeline}`;
  }
  if (probe.id === "audio") {
    const codec = firstObjectKey(obs.codecs) || probe.session?.audioCodec || "unknown";
    const mode = probe.session?.audioMode || probe.discovery?.audio?.mode || "unknown";
    const age = obs.timestamp?.ageMaxMs ?? "n/a";
    const level = obs.level?.max ?? "n/a";
    return `${obs.frameCount || 0} frames, ${obs.fps || 0} fps, maxGap=${obs.maxGapMs ?? "?"}ms, ageMax=${age}ms, levelMax=${level}, ${codec}/${mode}`;
  }
  return "ok";
}

function firstObjectKey(value) {
  if (!value || typeof value !== "object") return "";
  return Object.keys(value)[0] || "";
}

function formatBoardReason(value, maxLength = 140) {
  const normalized = redactSensitiveText(value)
    .replace(/\b(token|password|secret|authorization)=\S+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .replace(/[;\r\n]+/g, " ")
    .trim();
  if (!normalized) return "unknown";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function makeBoardSummary(report) {
  const failed = report.probes.filter((probe) => !probe.ok);
  const status = failed.length === 0 ? "passed" : `failed ${failed.length}`;
  const video = report.probes.find((probe) => probe.id === "video");
  const audio = report.probes.find((probe) => probe.id === "audio");
  const parts = [
    `Mac media baseline ${status}: host=${report.target.host}:${report.target.port}`,
    `request=${formatRequestSummary(report.args)}`,
    `video=${formatProbeSummary(video)}`,
    `audio=${formatProbeSummary(audio)}`,
  ];
  return `${parts.join("; ")}. No input or inject was executed; password was not printed; playTone=${report.args.playTone}.`;
}

function formatRequestSummary(args) {
  const video = args.skipVideo
    ? "video=skipped"
    : `${args.width}x${args.height}@${args.fps}Hz/${args.bandwidthKbps}kbps/${args.preferredVideoCodec}/${args.videoDurationMs}ms`;
  const audio = args.skipAudio
    ? "audio=skipped"
    : `audio=${args.audioDurationMs}ms`;
  return `${video},${audio}`;
}

function summarizeArgs(args) {
  return {
    host: args.host,
    port: args.port,
    timeoutMs: args.timeoutMs,
    commandTimeoutMs: args.commandTimeoutMs,
    videoDurationMs: args.videoDurationMs,
    videoMinFrames: args.videoMinFrames,
    videoMinFps: args.videoMinFps,
    videoMaxGapMs: args.videoMaxGapMs,
    preferredVideoCodec: args.preferredVideoCodec,
    requireH264: args.requireH264,
    requireRealVideo: args.requireRealVideo,
    width: args.width,
    height: args.height,
    fps: args.fps,
    bandwidthKbps: args.bandwidthKbps,
    displayId: args.displayId,
    expectActiveDisplayId: args.expectActiveDisplayId,
    requireFrameTimestamp: args.requireFrameTimestamp,
    maxFrameAgeMs: args.maxFrameAgeMs,
    requireMonotonicTimestamp: args.requireMonotonicTimestamp,
    maxTimestampGapUs: args.maxTimestampGapUs,
    audioDurationMs: args.audioDurationMs,
    audioMinFrames: args.audioMinFrames,
    audioMaxGapMs: args.audioMaxGapMs,
    requireLevel: args.requireLevel,
    minLevel: args.minLevel,
    playTone: args.playTone,
    toneFrequency: args.toneFrequency,
    toneDurationMs: args.toneDurationMs,
    toneDelayMs: args.toneDelayMs,
    toneVolume: args.toneVolume,
    skipVideo: args.skipVideo,
    skipAudio: args.skipAudio,
    json: args.json,
    boardSummary: args.boardSummary,
  };
}

function makeReport(args, probes, startedAt, elapsedMs) {
  const report = {
    ok: probes.every((probe) => probe.ok),
    startedAt,
    finishedAt: new Date().toISOString(),
    elapsedMs,
    target: { host: args.host, port: args.port },
    args: summarizeArgs(args),
    probes,
    video: probes.find((probe) => probe.id === "video") || null,
    audio: probes.find((probe) => probe.id === "audio") || null,
    summary: {
      passed: probes.filter((probe) => probe.ok).length,
      failed: probes.filter((probe) => !probe.ok).length,
      failures: probes
        .filter((probe) => !probe.ok)
        .map((probe) => ({
          id: probe.id,
          label: probe.label,
          message: formatBoardReason(probe.error?.message || "unknown", 240),
        })),
      skipped: [
        args.skipVideo ? "video" : "",
        args.skipAudio ? "audio" : "",
      ].filter(Boolean),
      noInput: true,
      noInject: true,
    },
    boardSummary: "",
  };
  report.boardSummary = makeBoardSummary(report);
  return report;
}

async function runProbe(args, probe) {
  print(args, "RUN", `${probe.label} for ${probe.durationMs} ms`);
  if (args.debugCommands) {
    print(args, "DEBUG", formatCommand(probe.script, probe.argv));
  }
  const result = await runJsonScript(probe, probe.script, probe.argv, args);
  const summary = makeProbeResult(probe, result);
  print(args, summary.ok ? "OK" : "FAIL", `${probe.label}: ${formatProbeSummary(summary)}`);
  return summary;
}

function buildProbes(args) {
  const probes = [];
  if (!args.skipVideo) {
    probes.push({
      id: "video",
      label: "H.264 video",
      script: videoScript,
      argv: makeVideoArgs(args),
      durationMs: args.videoDurationMs,
      host: args.host,
      port: args.port,
    });
  }
  if (!args.skipAudio) {
    probes.push({
      id: "audio",
      label: "PCM audio",
      script: audioScript,
      argv: makeAudioArgs(args),
      durationMs: args.audioDurationMs,
      host: args.host,
      port: args.port,
    });
  }
  return probes;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printUsage();
    return;
  }

  const startedAt = new Date().toISOString();
  const started = performance.now();
  const probes = [];
  for (const probe of buildProbes(args)) {
    probes.push(await runProbe(args, probe));
  }
  const report = makeReport(args, probes, startedAt, Math.round(performance.now() - started));

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    print(args, report.ok ? "OK" : "FAIL", report.boardSummary);
  }
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  const message = redactSensitiveText(error.message);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      ok: false,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      error: { message, name: error.name },
    }, null, 2));
  } else {
    console.error(`[FAIL] ${message}`);
  }
  process.exitCode = 1;
});
