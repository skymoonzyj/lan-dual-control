#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promptPassword as promptMacPassword } from "./password-prompt.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  password: process.env.LAN_DUAL_PASSWORD || "",
  promptPassword: false,
  requirePassword: true,
  allowDemoPassword: false,
  timeoutMs: 12000,
  videoDurationMs: 3000,
  videoMinFrames: 30,
  videoMinFps: 8,
  videoMaxGapMs: 1000,
  videoMaxFrameAgeMs: 250,
  audioDurationMs: 3000,
  audioMinFrames: 80,
  audioMaxGapMs: 1000,
  audioMaxFrameAgeMs: 250,
  inputTimeoutMs: 10000,
  skipVideo: false,
  skipAudio: false,
  skipInputLog: false,
  json: false,
  boardSummary: false,
};

const formalTargetMaxScreenFps = 60;

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/check-mac-formal-local-smoke.mjs [options]

Runs a local, safe Mac formal E2E smoke check before asking Windows to connect.
It composes existing read-only/log-mode probes:
  1. H.264 video observation
  2. system PCM audio observation
  3. input-log smoke test

It does not start Mac host, does not send inject-mode input, and does not print
the probe password. By default it requires a non-demo password from
LAN_DUAL_PASSWORD or --promptPassword.

Options:
  --host <host>              Mac host address. Default: 127.0.0.1
  --port <port>              Mac host port. Default: 43770
  --password <password>      Probe password. Prefer LAN_DUAL_PASSWORD instead.
  --promptPassword           Ring first, then prompt for probe password in a
                             frontmost macOS hidden password dialog.
  --requirePassword          Refuse empty/demo password. Default: true
  --allowDemoPassword        Allow demo-password for local fake-host tests only.
  --timeoutMs <ms>           Default child probe timeout. Default: 12000
  --videoDurationMs <ms>     H.264 observation window. Default: 3000
  --videoMinFrames <count>   Minimum H.264 frames. Default: 30
  --videoMinFps <fps>        Minimum H.264 FPS. Default: 8
  --videoMaxGapMs <ms>       Maximum H.264 receive gap. Default: 1000
  --videoMaxFrameAgeMs <ms>  Maximum video_frame timestamp age. Default: 250
  --audioDurationMs <ms>     PCM observation window. Default: 3000
  --audioMinFrames <count>   Minimum PCM frames. Default: 80
  --audioMaxGapMs <ms>       Maximum PCM receive gap. Default: 1000
  --audioMaxFrameAgeMs <ms>  Maximum audio_frame timestamp age. Default: 250
  --inputTimeoutMs <ms>      Input-log smoke timeout. Default: 10000
  --skipVideo                Skip H.264 probe.
  --skipAudio                Skip PCM probe.
  --skipInputLog             Skip input-log probe.
  --boardSummary             Print one secret-free Agent Link Board summary line.
  --json                     Print one machine-readable JSON object.
  --help, -h                 Show this help without probing anything.

JSON output:
  commands.macClientPromptPasswordSmokeCommand
                             User-present Mac client browser smoke command with
                             the standard MacClientPromptPasswordSmoke=
                             board-summary label. It asks for the password only
                             when this command is explicitly run.
  commands.macScriptHelpCommand
                             Secret-free Mac script help safety check. It runs
                             without prompting, reading the board, authenticating,
                             or sending input/inject.

Examples:
  LAN_DUAL_PASSWORD=... node scripts/mac/check-mac-formal-local-smoke.mjs
  node scripts/mac/check-mac-formal-local-smoke.mjs --promptPassword --json
  node scripts/mac/check-mac-formal-local-smoke.mjs --promptPassword --boardSummary
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
    if (
      token === "--promptPassword" ||
      token === "--requirePassword" ||
      token === "--allowDemoPassword" ||
      token === "--skipVideo" ||
      token === "--skipAudio" ||
      token === "--skipInputLog" ||
      token === "--boardSummary" ||
      token === "--json"
    ) {
      args[token.slice(2)] = true;
      continue;
    }
    if (token === "--noRequirePassword") {
      args.requirePassword = false;
      continue;
    }
    if (token === "--host" && next && !next.startsWith("--")) {
      args.host = next;
      index += 1;
      continue;
    }
    if (token === "--password" && next && !next.startsWith("--")) {
      args.password = next;
      args.passwordFromArg = true;
      index += 1;
      continue;
    }
    const numericKeys = new Set([
      "port",
      "timeoutMs",
      "videoDurationMs",
      "videoMinFrames",
      "videoMinFps",
      "videoMaxGapMs",
      "videoMaxFrameAgeMs",
      "audioDurationMs",
      "audioMinFrames",
      "audioMaxGapMs",
      "audioMaxFrameAgeMs",
      "inputTimeoutMs",
    ]);
    if (token.startsWith("--") && numericKeys.has(token.slice(2)) && next && !next.startsWith("--")) {
      const key = token.slice(2);
      args[key] = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  args.host = String(args.host || defaults.host).trim();
  args.port = clampInteger(args.port, 1, 65535, defaults.port);
  args.password = String(args.password || "");
  args.promptPassword = booleanArg(args.promptPassword);
  args.requirePassword = booleanArg(args.requirePassword);
  args.allowDemoPassword = booleanArg(args.allowDemoPassword);
  args.timeoutMs = clampInteger(args.timeoutMs, 3000, 600000, defaults.timeoutMs);
  args.videoDurationMs = clampInteger(args.videoDurationMs, 1000, 600000, defaults.videoDurationMs);
  args.videoMinFrames = clampInteger(args.videoMinFrames, 0, 1000000, defaults.videoMinFrames);
  args.videoMinFps = nonNegativeNumber(args.videoMinFps, defaults.videoMinFps);
  args.videoMaxGapMs = clampInteger(args.videoMaxGapMs, 100, 600000, defaults.videoMaxGapMs);
  args.videoMaxFrameAgeMs = clampInteger(args.videoMaxFrameAgeMs, 0, 600000, defaults.videoMaxFrameAgeMs);
  args.audioDurationMs = clampInteger(args.audioDurationMs, 1000, 600000, defaults.audioDurationMs);
  args.audioMinFrames = clampInteger(args.audioMinFrames, 0, 1000000, defaults.audioMinFrames);
  args.audioMaxGapMs = clampInteger(args.audioMaxGapMs, 100, 600000, defaults.audioMaxGapMs);
  args.audioMaxFrameAgeMs = clampInteger(args.audioMaxFrameAgeMs, 0, 600000, defaults.audioMaxFrameAgeMs);
  args.inputTimeoutMs = clampInteger(args.inputTimeoutMs, 3000, 600000, defaults.inputTimeoutMs);
  args.skipVideo = booleanArg(args.skipVideo);
  args.skipAudio = booleanArg(args.skipAudio);
  args.skipInputLog = booleanArg(args.skipInputLog);
  args.json = booleanArg(args.json);
  args.boardSummary = booleanArg(args.boardSummary);
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

function booleanArg(value) {
  return value === true || value === "true" || value === "1" || value === "yes" || value === "on";
}

function print(args, kind, text) {
  const line = `[${kind}] ${text}`;
  if (args.json || args.boardSummary) {
    console.error(line);
  } else {
    console.log(line);
  }
}

async function preparePassword(args) {
  if (args.promptPassword) {
    if (args.passwordFromArg) {
      throw new Error("--promptPassword cannot be combined with --password.");
    }
    args.password = await promptMacPassword({
      title: "LAN Dual Control",
      message: "Enter the formal Mac host smoke password. It is only used for this local smoke check and is not printed.",
      prompt: "Formal smoke password:",
      terminalLabel: "Mac host formal smoke password: ",
      output: args.json || args.boardSummary ? process.stderr : process.stdout,
    });
  }
  if (!args.requirePassword) return;
  if (!args.password) {
    throw new Error("Formal local smoke requires a password. Set LAN_DUAL_PASSWORD or use --promptPassword.");
  }
  if (!args.allowDemoPassword && args.password === "demo-password") {
    throw new Error("Formal local smoke refuses demo-password. Use the formal password or pass --allowDemoPassword only for fake-host tests.");
  }
}

function runChild(script, childArgs, args, timeoutMs) {
  return new Promise((resolveRun) => {
    const commandArgs = [script, ...childArgs, "--json"];
    const child = spawn(process.execPath, commandArgs, {
      cwd: repoRoot,
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: args.password,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 1000);
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
        exitCode: null,
        timedOut,
        durationMs: Date.now() - startedAt,
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
        exitCode,
        timedOut,
        durationMs: Date.now() - startedAt,
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

function makeProbe(id, label, script, childArgs, timeoutMs) {
  return { id, label, script, childArgs, timeoutMs };
}

function buildProbes(args) {
  const common = ["--host", args.host, "--port", String(args.port)];
  const probes = [];
  if (!args.skipVideo) {
    probes.push(makeProbe("video", "H.264 video", "scripts/mac/observe-mac-video.mjs", [
      ...common,
      "--durationMs",
      String(args.videoDurationMs),
      "--timeoutMs",
      String(args.timeoutMs),
      "--minFrames",
      String(args.videoMinFrames),
      "--minFps",
      String(args.videoMinFps),
      "--maxGapMs",
      String(args.videoMaxGapMs),
      "--maxFrameAgeMs",
      String(args.videoMaxFrameAgeMs),
      "--requireH264",
      "--requireFrameTimestamp",
      "--requireTimestampUs",
      "--requireMonotonicTimestampUs",
      "--expectActiveDisplayId",
      "main",
    ], args.timeoutMs + args.videoDurationMs + 3000));
  }
  if (!args.skipAudio) {
    probes.push(makeProbe("audio", "PCM audio", "scripts/mac/observe-mac-audio.mjs", [
      ...common,
      "--durationMs",
      String(args.audioDurationMs),
      "--timeoutMs",
      String(args.timeoutMs),
      "--minFrames",
      String(args.audioMinFrames),
      "--maxGapMs",
      String(args.audioMaxGapMs),
      "--maxFrameAgeMs",
      String(args.audioMaxFrameAgeMs),
      "--requireFrameTimestamp",
      "--requireMonotonicTimestamp",
    ], args.timeoutMs + args.audioDurationMs + 3000));
  }
  if (!args.skipInputLog) {
    probes.push(makeProbe("inputLog", "input-log", "scripts/mac/smoke-mac-input-log.mjs", [
      ...common,
      "--timeoutMs",
      String(args.inputTimeoutMs),
      "--expectInputMode",
      "log",
    ], args.inputTimeoutMs + 3000));
  }
  return probes;
}

function summarizeProbe(probe, result) {
  const payload = result.payload;
  const rawErrorMessage = result.timedOut
    ? `probe timed out after ${probe.timeoutMs} ms`
    : payload?.error?.message || result.parseError || lastMeaningfulLine(result.stderr) || lastMeaningfulLine(result.stdout);
  const errorMessage = redactSensitiveText(rawErrorMessage);
  const summary = {
    id: probe.id,
    label: probe.label,
    ok: result.exitCode === 0 && payload?.ok === true,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    error: result.exitCode === 0 && payload?.ok === true
      ? null
      : { message: errorMessage || "probe failed" },
    observation: payload?.observation || null,
    discovery: payload?.discovery || null,
    session: payload?.session || null,
  };

  if (probe.id === "inputLog") {
    summary.input = payload?.input || null;
  }
  return summary;
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

function formatProbeSummary(probe) {
  if (!probe.ok) return probe.error?.message || "failed";
  if (probe.id === "video") {
    const obs = probe.observation || {};
    return `${obs.frameCount || 0} frames, ${obs.fps || 0} fps, maxGap=${obs.maxGapMs ?? "?"}ms`;
  }
  if (probe.id === "audio") {
    const obs = probe.observation || {};
    return `${obs.frameCount || 0} frames, ${obs.fps || 0} fps, maxGap=${obs.maxGapMs ?? "?"}ms`;
  }
  if (probe.id === "inputLog") {
    const input = probe.input || {};
    return `${input.acknowledged || 0}/${input.attempted || 0} ack, injected=false`;
  }
  return "ok";
}

function makeMacHostSafeStartCommand(args) {
  return [
    "node scripts/mac/start-mac-host.mjs",
    "--promptPassword",
    "--requirePassword",
    "--host",
    "0.0.0.0",
    "--port",
    String(args.port),
  ].join(" ");
}

function makeMacMaxFpsSafeStartCommand(args) {
  return [
    "node scripts/mac/start-mac-host.mjs",
    "--promptPassword",
    "--requirePassword",
    "--host",
    "0.0.0.0",
    "--port",
    String(args.port),
    "--maxScreenFps",
    String(formalTargetMaxScreenFps),
  ].join(" ");
}

function makeMacHostReadinessCommand(args) {
  return [
    "node scripts/mac/check-mac-host-readiness.mjs",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--checkBoard",
    "--boardSummary",
  ].join(" ");
}

function makeMacUnattendedFormalCommand(args) {
  return [
    "node scripts/mac/check-mac-unattended-status.mjs",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--requireLaunchAgentMaxFps",
    "--requireLaunchAgentLoaded",
    "--boardSummary",
  ].join(" ");
}

function makeRerunBoardSummaryCommand(args) {
  return [
    "node scripts/mac/check-mac-formal-local-smoke.mjs",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--promptPassword",
    "--boardSummary",
  ].join(" ");
}

function makeMacFormalLocalSmokeCommand(args) {
  return makeRerunBoardSummaryCommand(args);
}

function makeMacClientPromptPasswordSmokeCommand() {
  return [
    "node scripts/mac/run-mac-client-formal-smoke.mjs",
    "--discover",
    "--ensureClient",
    "--promptPassword",
    "--boardSummary",
  ].join(" ");
}

function makeMacScriptHelpCommand() {
  return "node scripts/mac/test-mac-script-help.mjs --timeoutMs 10000 --boardSummary";
}

function makeCommands(args) {
  return {
    macClientPromptPasswordSmokeCommand: makeMacClientPromptPasswordSmokeCommand(),
    macFormalLocalSmokeCommand: makeMacFormalLocalSmokeCommand(args),
    macHostReadinessCommand: makeMacHostReadinessCommand(args),
    macHostSafeStartCommand: makeMacHostSafeStartCommand(args),
    macMaxFpsSafeStartCommand: makeMacMaxFpsSafeStartCommand(args),
    macScriptHelpCommand: makeMacScriptHelpCommand(),
    macUnattendedFormalCommand: makeMacUnattendedFormalCommand(args),
    rerunBoardSummaryCommand: makeRerunBoardSummaryCommand(args),
  };
}

function argsForFailureReport(argv) {
  try {
    return parseArgs(argv);
  } catch {
    const args = { ...defaults };
    for (let index = 2; index < argv.length; index += 1) {
      const token = argv[index];
      const next = argv[index + 1];
      if (token === "--host" && next && !next.startsWith("--")) {
        args.host = String(next || defaults.host).trim() || defaults.host;
        index += 1;
        continue;
      }
      if (token === "--port" && next && !next.startsWith("--")) {
        args.port = clampInteger(next, 1, 65535, defaults.port);
        index += 1;
      }
    }
    return args;
  }
}

function makeReport(args, probes) {
  const failed = probes.filter((probe) => !probe.ok);
  const commands = makeCommands(args);
  return {
    ok: failed.length === 0,
    checkedAt: new Date().toISOString(),
    target: { host: args.host, port: args.port },
    args: summarizeArgs(args),
    commands,
    probes,
    summary: {
      passed: probes.filter((probe) => probe.ok).length,
      failed: failed.length,
      skipped: [
        args.skipVideo ? "video" : "",
        args.skipAudio ? "audio" : "",
        args.skipInputLog ? "inputLog" : "",
      ].filter(Boolean),
      noInject: true,
    },
    boardSummary: makeBoardSummary(args, probes, failed, commands),
  };
}

function makeBoardSummary(args, probes, failed, commands) {
  const status = failed.length === 0 ? "passed" : `failed ${failed.length}`;
  const parts = probes.map((probe) => `${probe.id}=${probe.ok ? formatProbeSummary(probe) : "FAIL"}`);
  const probeSummary = parts.length > 0 ? parts.join("; ") : "no probes run";
  return [
    `Mac formal local smoke ${status}: host=${args.host}:${args.port}; ${probeSummary}.`,
    "No inject was executed; password was not printed.",
    `MacHostReadiness=${commands.macHostReadinessCommand}.`,
    `MacHostSafeStart=${commands.macHostSafeStartCommand}.`,
    `MacMaxFpsSafeStart=${commands.macMaxFpsSafeStartCommand}.`,
    `MacUnattendedFormal=${commands.macUnattendedFormalCommand}.`,
    `MacFormalLocalSmoke=${commands.macFormalLocalSmokeCommand}.`,
    `MacClientPromptPasswordSmoke=${commands.macClientPromptPasswordSmokeCommand}.`,
    `MacScriptHelp=${commands.macScriptHelpCommand}.`,
    `RerunFormalLocalSmoke=${commands.rerunBoardSummaryCommand}.`,
  ].join(" ");
}

function makeFailureReport(error, argv) {
  const args = argsForFailureReport(argv);
  const commands = makeCommands(args);
  const message = redactSensitiveText(error.message);
  const reason = message.replace(/[.。]+$/u, "");
  return {
    ok: false,
    checkedAt: new Date().toISOString(),
    target: { host: args.host, port: args.port },
    commands,
    error: { message, name: error.name },
    summary: {
      passed: 0,
      failed: 1,
      skipped: [],
      noInject: true,
    },
    boardSummary: [
      `Mac formal local smoke failed before probes: host=${args.host}:${args.port}; reason=${reason}.`,
      "No inject was executed; password was not printed.",
      `MacHostReadiness=${commands.macHostReadinessCommand}.`,
      `MacHostSafeStart=${commands.macHostSafeStartCommand}.`,
      `MacMaxFpsSafeStart=${commands.macMaxFpsSafeStartCommand}.`,
      `MacUnattendedFormal=${commands.macUnattendedFormalCommand}.`,
      `MacFormalLocalSmoke=${commands.macFormalLocalSmokeCommand}.`,
      `MacClientPromptPasswordSmoke=${commands.macClientPromptPasswordSmokeCommand}.`,
      `MacScriptHelp=${commands.macScriptHelpCommand}.`,
      `RerunFormalLocalSmoke=${commands.rerunBoardSummaryCommand}.`,
    ].join(" "),
  };
}

function summarizeArgs(args) {
  return {
    host: args.host,
    port: args.port,
    requirePassword: args.requirePassword,
    allowDemoPassword: args.allowDemoPassword,
    timeoutMs: args.timeoutMs,
    videoDurationMs: args.videoDurationMs,
    videoMinFrames: args.videoMinFrames,
    videoMinFps: args.videoMinFps,
    videoMaxGapMs: args.videoMaxGapMs,
    videoMaxFrameAgeMs: args.videoMaxFrameAgeMs,
    audioDurationMs: args.audioDurationMs,
    audioMinFrames: args.audioMinFrames,
    audioMaxGapMs: args.audioMaxGapMs,
    audioMaxFrameAgeMs: args.audioMaxFrameAgeMs,
    inputTimeoutMs: args.inputTimeoutMs,
    skipVideo: args.skipVideo,
    skipAudio: args.skipAudio,
    skipInputLog: args.skipInputLog,
    json: args.json,
    boardSummary: args.boardSummary,
  };
}

function printReport(args, report) {
  for (const probe of report.probes) {
    print(args, probe.ok ? "OK" : "FAIL", `${probe.label}: ${formatProbeSummary(probe)}`);
  }
  print(args, report.ok ? "OK" : "FAIL", report.boardSummary);
  print(args, "NEXT", `Mac host readiness: ${report.commands.macHostReadinessCommand}`);
  print(args, "NEXT", `Mac host safe start: ${report.commands.macHostSafeStartCommand}`);
  print(args, "NEXT", `Mac 60Hz safe foreground start: ${report.commands.macMaxFpsSafeStartCommand}`);
  print(args, "NEXT", `Mac unattended formal 60Hz gate: ${report.commands.macUnattendedFormalCommand}`);
  print(args, "NEXT", `Mac client prompt-password smoke: ${report.commands.macClientPromptPasswordSmokeCommand}`);
  print(args, "NEXT", `Mac script help safety check: ${report.commands.macScriptHelpCommand}`);
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  await preparePassword(args);
  const probes = [];
  for (const probe of buildProbes(args)) {
    print(args, "INFO", `Running ${probe.label}`);
    const result = await runChild(probe.script, probe.childArgs, args, probe.timeoutMs);
    probes.push(summarizeProbe(probe, result));
  }
  const report = makeReport(args, probes);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printReport(args, report);
  }
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  const report = makeFailureReport(error, process.argv);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else if (process.argv.includes("--boardSummary")) {
    console.log(report.boardSummary);
  } else {
    console.error(`[FAIL] ${report.error.message}`);
    console.error(`[NEXT] Mac host readiness: ${report.commands.macHostReadinessCommand}`);
    console.error(`[NEXT] Mac host safe start: ${report.commands.macHostSafeStartCommand}`);
    console.error(`[NEXT] Mac 60Hz safe foreground start: ${report.commands.macMaxFpsSafeStartCommand}`);
    console.error(`[NEXT] Mac unattended formal 60Hz gate: ${report.commands.macUnattendedFormalCommand}`);
    console.error(`[NEXT] Mac client prompt-password smoke: ${report.commands.macClientPromptPasswordSmokeCommand}`);
    console.error(`[NEXT] Mac script help safety check: ${report.commands.macScriptHelpCommand}`);
  }
  process.exitCode = 1;
});
