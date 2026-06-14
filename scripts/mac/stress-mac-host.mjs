#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");

const defaults = {
  host: "127.0.0.1",
  port: "43770",
  password: "demo-password",
  iterations: 8,
  delayMs: 250,
  timeoutMs: 12000,
  maxProbeMs: 0,
  maxFirstFrameMs: 0,
  maxH264ConfirmMs: 0,
  maxAudioFrameMs: 0,
  requireH264: true,
  requireAudio: true,
  requireRealVideo: false,
  expectInputMode: "log",
  sampleProcess: os.platform() === "darwin",
  probeScript: path.join(repoRoot, "scripts", "windows", "probe-mac-host.mjs"),
  json: false,
};

const runState = {
  args: null,
  target: null,
  probeScript: null,
  process: {
    listenerPid: null,
    startSample: null,
    endSample: null,
    delta: null,
  },
  results: [],
  summary: null,
  suiteStartedAt: null,
};

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }

  args.host = String(args.host || defaults.host);
  args.port = String(args.port || defaults.port);
  args.password = String(args.password || defaults.password);
  args.iterations = positiveInteger(args.iterations, defaults.iterations);
  args.delayMs = nonNegativeInteger(args.delayMs, defaults.delayMs);
  args.timeoutMs = positiveInteger(args.timeoutMs, defaults.timeoutMs);
  args.maxProbeMs = nonNegativeInteger(args.maxProbeMs, defaults.maxProbeMs);
  args.maxFirstFrameMs = nonNegativeInteger(args.maxFirstFrameMs, defaults.maxFirstFrameMs);
  args.maxH264ConfirmMs = nonNegativeInteger(args.maxH264ConfirmMs, defaults.maxH264ConfirmMs);
  args.maxAudioFrameMs = nonNegativeInteger(args.maxAudioFrameMs, defaults.maxAudioFrameMs);
  args.requireH264 = booleanArg(args.requireH264, defaults.requireH264);
  args.requireAudio = booleanArg(args.requireAudio, defaults.requireAudio);
  args.requireRealVideo = booleanArg(args.requireRealVideo, defaults.requireRealVideo);
  args.sampleProcess = booleanArg(args.sampleProcess, defaults.sampleProcess);
  args.expectInputMode = String(args.expectInputMode || "").trim().toLowerCase();
  args.probeScript = path.resolve(String(args.probeScript || defaults.probeScript));
  args.json = booleanArg(args.json, defaults.json);
  return args;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function booleanArg(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function print(status, text) {
  const line = `[${status}] ${text}`;
  if (runState.args?.json) {
    console.error(line);
    return;
  }
  console.log(line);
}

function formatMs(ms) {
  return `${Math.round(ms)} ms`;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runCommand(command, commandArgs, { timeoutMs = 5000, onStdoutLine = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let lineBuffer = "";
    const emitStdoutLines = (text, flush = false) => {
      if (!onStdoutLine) return;
      lineBuffer += text;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = flush ? "" : lines.pop() || "";
      const completeLines = flush ? lines.filter(Boolean).concat(lineBuffer ? [lineBuffer] : []) : lines;
      for (const line of completeLines) {
        if (line) onStdoutLine(line);
      }
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout.push(chunk);
      emitStdoutLines(chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      emitStdoutLines("", true);
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

async function findListenerPid(args) {
  if (!args.sampleProcess) return null;
  try {
    const result = await runCommand("lsof", ["-nP", `-iTCP:${args.port}`, "-sTCP:LISTEN", "-t"], { timeoutMs: 2500 });
    if (result.code !== 0) return null;
    const pid = result.stdout
      .split(/\s+/)
      .map((item) => item.trim())
      .find(Boolean);
    return pid || null;
  } catch {
    return null;
  }
}

async function sampleProcess(pid) {
  if (!pid) return null;
  const sample = { pid };
  try {
    const ps = await runCommand("ps", ["-o", "rss=", "-o", "%cpu=", "-p", pid], { timeoutMs: 2500 });
    if (ps.code === 0) {
      const [rssKb, cpuPercent] = ps.stdout.trim().split(/\s+/);
      sample.rssKb = Number(rssKb);
      sample.cpuPercent = Number(cpuPercent);
    }
  } catch {
    // Process sampling is diagnostic only; probe failures still decide pass/fail.
  }

  try {
    const lsof = await runCommand("lsof", ["-nP", "-p", pid], { timeoutMs: 3500 });
    if (lsof.code === 0) {
      sample.fdCount = lsof.stdout.trim().split(/\r?\n/).filter(Boolean).length - 1;
    }
  } catch {
    // Keep going when lsof is unavailable or transiently slow.
  }
  return sample;
}

function formatSample(sample) {
  if (!sample) return "process sample unavailable";
  const details = [`pid=${sample.pid}`];
  if (Number.isFinite(sample.rssKb)) details.push(`rss=${sample.rssKb} KB`);
  if (Number.isFinite(sample.cpuPercent)) details.push(`cpu=${sample.cpuPercent}%`);
  if (Number.isFinite(sample.fdCount)) details.push(`fd=${sample.fdCount}`);
  return details.join(", ");
}

function makeProcessDelta(start, end) {
  if (!start || !end) return null;
  const delta = {};
  if (Number.isFinite(start.rssKb) && Number.isFinite(end.rssKb)) {
    delta.rssKb = end.rssKb - start.rssKb;
  }
  if (Number.isFinite(start.fdCount) && Number.isFinite(end.fdCount)) {
    delta.fdCount = end.fdCount - start.fdCount;
  }
  return Object.keys(delta).length > 0 ? delta : null;
}

function formatDelta(start, end) {
  if (!start || !end) return "";
  const deltas = [];
  if (Number.isFinite(start.rssKb) && Number.isFinite(end.rssKb)) {
    deltas.push(`rss ${start.rssKb}->${end.rssKb} KB (${end.rssKb - start.rssKb >= 0 ? "+" : ""}${end.rssKb - start.rssKb})`);
  }
  if (Number.isFinite(start.fdCount) && Number.isFinite(end.fdCount)) {
    deltas.push(`fd ${start.fdCount}->${end.fdCount} (${end.fdCount - start.fdCount >= 0 ? "+" : ""}${end.fdCount - start.fdCount})`);
  }
  return deltas.join(", ");
}

function formatMetric(value) {
  return Number.isFinite(value) ? formatMs(value) : "n/a";
}

function summarizeMetric(name, values) {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) return `${name}=n/a`;
  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  const avg = finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
  return `${name} min/avg/max=${formatMetric(min)}/${formatMetric(avg)}/${formatMetric(max)}`;
}

function summarizeMetricObject(values) {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) {
    return {
      count: 0,
      minMs: null,
      avgMs: null,
      maxMs: null,
    };
  }
  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  const avg = finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
  return {
    count: finiteValues.length,
    minMs: Math.round(min),
    avgMs: Number(avg.toFixed(2)),
    maxMs: Math.round(max),
  };
}

function formatTimings(timings) {
  const parts = [];
  if (Number.isFinite(timings.firstFrameMs)) parts.push(`firstFrame=${formatMetric(timings.firstFrameMs)}`);
  if (Number.isFinite(timings.h264ConfirmMs)) parts.push(`h264=${formatMetric(timings.h264ConfirmMs)}`);
  if (Number.isFinite(timings.audioFrameMs)) parts.push(`audio=${formatMetric(timings.audioFrameMs)}`);
  return parts.join(", ");
}

function assertTimingThreshold(label, actualMs, thresholdMs) {
  if (!thresholdMs) return;
  if (!Number.isFinite(actualMs)) {
    throw new Error(`${label} timing was not recorded`);
  }
  if (actualMs <= thresholdMs) return;
  throw new Error(`${label} ${formatMetric(actualMs)} exceeded threshold ${formatMetric(thresholdMs)}`);
}

function redactSensitiveText(text, args) {
  let output = String(text || "");
  const password = String(args?.password || "");
  if (password) {
    output = output.split(password).join("[redacted-password]");
  }
  return output;
}

function outputTail(text, args) {
  return redactSensitiveText(text, args)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-8);
}

function buildProbeArgs(args) {
  const probeArgs = [
    args.probeScript,
    "--host",
    args.host,
    "--port",
    args.port,
    "--password",
    args.password,
    "--timeoutMs",
    String(args.timeoutMs),
  ];
  if (args.requireH264) probeArgs.push("--requireH264");
  if (args.requireAudio) probeArgs.push("--requireAudio");
  if (args.requireRealVideo) probeArgs.push("--requireRealVideo");
  if (args.expectInputMode) probeArgs.push("--expectInputMode", args.expectInputMode);
  return probeArgs;
}

function extractHighlights(output) {
  return output
    .split(/\r?\n/)
    .filter((line) => /\[OK\] (First frame|H\.264 video confirmed|Audio frame confirmed)/.test(line))
    .map((line) => line.replace(/^\[OK\]\s*/, ""))
    .join(" | ");
}

async function runProbe(iteration, args) {
  const started = performance.now();
  const timings = {};
  const recordTiming = (key) => {
    if (Number.isFinite(timings[key])) return;
    timings[key] = performance.now() - started;
  };
  let result;
  try {
    result = await runCommand(process.execPath, buildProbeArgs(args), {
      timeoutMs: args.timeoutMs + 5000,
      onStdoutLine: (line) => {
        if (/\[OK\] First frame:/.test(line)) recordTiming("firstFrameMs");
        if (/\[OK\] H\.264 video confirmed:/.test(line)) recordTiming("h264ConfirmMs");
        if (/\[OK\] Audio frame confirmed:/.test(line)) recordTiming("audioFrameMs");
      },
    });
  } catch (error) {
    error.probeResult = {
      iteration,
      ok: false,
      exitCode: null,
      durationMs: Math.round(performance.now() - started),
      timings: sanitizeTimings(timings),
      highlights: "",
      stdoutTail: [],
      stderrTail: [redactSensitiveText(error.message, args)].filter(Boolean),
    };
    throw error;
  }
  const durationMs = performance.now() - started;
  const probeResult = {
    iteration,
    ok: result.code === 0,
    exitCode: result.code,
    durationMs: Math.round(durationMs),
    timings: sanitizeTimings(timings),
    highlights: extractHighlights(result.stdout),
    stdoutTail: outputTail(result.stdout, args),
    stderrTail: outputTail(result.stderr, args),
  };
  if (result.code !== 0) {
    const details = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
    const error = new Error(`probe #${iteration} failed with exit ${result.code}\n${redactSensitiveText(details, args)}`);
    error.probeResult = probeResult;
    throw error;
  }
  try {
    assertTimingThreshold(`probe #${iteration} total`, durationMs, args.maxProbeMs);
    assertTimingThreshold(`probe #${iteration} first frame`, timings.firstFrameMs, args.maxFirstFrameMs);
    assertTimingThreshold(`probe #${iteration} H.264 confirm`, timings.h264ConfirmMs, args.maxH264ConfirmMs);
    assertTimingThreshold(`probe #${iteration} audio frame`, timings.audioFrameMs, args.maxAudioFrameMs);
  } catch (error) {
    probeResult.ok = false;
    error.probeResult = probeResult;
    throw error;
  }
  delete probeResult.stdoutTail;
  delete probeResult.stderrTail;
  return probeResult;
}

function sanitizeTimings(timings) {
  return {
    firstFrameMs: Number.isFinite(timings.firstFrameMs) ? Math.round(timings.firstFrameMs) : null,
    h264ConfirmMs: Number.isFinite(timings.h264ConfirmMs) ? Math.round(timings.h264ConfirmMs) : null,
    audioFrameMs: Number.isFinite(timings.audioFrameMs) ? Math.round(timings.audioFrameMs) : null,
  };
}

function sanitizeArgs(args) {
  return {
    host: args.host,
    port: String(args.port),
    iterations: args.iterations,
    delayMs: args.delayMs,
    timeoutMs: args.timeoutMs,
    maxProbeMs: args.maxProbeMs,
    maxFirstFrameMs: args.maxFirstFrameMs,
    maxH264ConfirmMs: args.maxH264ConfirmMs,
    maxAudioFrameMs: args.maxAudioFrameMs,
    requireH264: args.requireH264,
    requireAudio: args.requireAudio,
    requireRealVideo: args.requireRealVideo,
    expectInputMode: args.expectInputMode,
    sampleProcess: args.sampleProcess,
    json: args.json,
  };
}

function summarizeSuite(probeResults, totalMs) {
  const passedIterations = probeResults.filter((result) => result.ok === true).length;
  const failedIterations = probeResults.filter((result) => result.ok === false).length;
  return {
    requestedIterations: runState.args?.iterations ?? null,
    attemptedIterations: probeResults.length,
    completedIterations: passedIterations,
    failedIterations,
    totalMs: Math.round(totalMs),
    probe: summarizeMetricObject(probeResults.map((result) => result.durationMs)),
    firstFrame: summarizeMetricObject(probeResults.map((result) => result.timings.firstFrameMs)),
    h264Confirm: summarizeMetricObject(probeResults.map((result) => result.timings.h264ConfirmMs)),
    audioFrame: summarizeMetricObject(probeResults.map((result) => result.timings.audioFrameMs)),
  };
}

function makeJsonPayload(ok, error = null) {
  return {
    ok,
    target: runState.target,
    args: runState.args ? sanitizeArgs(runState.args) : null,
    probeScript: runState.probeScript,
    process: runState.process,
    results: runState.results,
    summary: runState.summary,
    error: error
      ? {
          message: error.message,
          name: error.name,
        }
      : null,
  };
}

function printJsonPayload(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function printUsage() {
  console.log(`Usage:
  node scripts/mac/stress-mac-host.mjs [options]

Options:
  --host <host>                 Mac host address. Default: 127.0.0.1
  --port <port>                 Mac host port. Default: 43770
  --password <password>         Probe password. Default: demo-password
  --iterations <count>          Number of sequential probe connections. Default: 8
  --delayMs <ms>                Delay between probe runs. Default: 250
  --timeoutMs <ms>              Per-probe timeout passed to probe-mac-host. Default: 12000
  --maxProbeMs <ms>             Fail when any full probe takes longer than this. Default: off
  --maxFirstFrameMs <ms>        Fail when first video frame takes longer than this. Default: off
  --maxH264ConfirmMs <ms>       Fail when H.264 confirmation takes longer than this. Default: off
  --maxAudioFrameMs <ms>        Fail when first audio frame takes longer than this. Default: off
  --requireH264 <true|false>    Require H.264 Annex B keyframe. Default: true
  --requireAudio <true|false>   Require pcm-f32le audio frame. Default: true
  --expectInputMode <mode>      Expected input mode. Default: log
  --sampleProcess <true|false>  Sample listener RSS/FDs with lsof/ps. Default: true on macOS
  --probeScript <path>          Override canonical probe script path.
  --json                        Print one machine-readable JSON object to stdout.

Example:
  node scripts/mac/stress-mac-host.mjs --iterations 20 --requireH264 true --requireAudio true --expectInputMode log`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  runState.args = args;
  runState.target = { host: args.host, port: String(args.port) };
  runState.probeScript = {
    path: args.probeScript,
    relativePath: path.relative(repoRoot, args.probeScript),
  };
  print("INFO", `Target: ${args.host}:${args.port}`);
  print("INFO", `Probe: ${path.relative(repoRoot, args.probeScript)}`);
  print(
    "INFO",
    `Checks: h264=${args.requireH264}, audio=${args.requireAudio}, realVideo=${args.requireRealVideo}, inputMode=${args.expectInputMode || "any"}`,
  );

  const pid = await findListenerPid(args);
  runState.process.listenerPid = pid;
  const startSample = await sampleProcess(pid);
  runState.process.startSample = startSample;
  if (args.sampleProcess) {
    print("INFO", `Start process: ${formatSample(startSample)}`);
  }

  const suiteStarted = performance.now();
  runState.suiteStartedAt = suiteStarted;
  const probeResults = [];
  for (let iteration = 1; iteration <= args.iterations; iteration += 1) {
    const result = await runProbe(iteration, args);
    probeResults.push(result);
    runState.results = probeResults;
    const timingSummary = formatTimings(result.timings);
    print(
      "OK",
      `#${iteration}/${args.iterations} passed in ${formatMs(result.durationMs)}${timingSummary ? ` (${timingSummary})` : ""}${
        result.highlights ? ` | ${result.highlights}` : ""
      }`,
    );
    if (iteration < args.iterations && args.delayMs > 0) {
      await delay(args.delayMs);
    }
  }

  const endSample = await sampleProcess(pid);
  runState.process.endSample = endSample;
  runState.process.delta = makeProcessDelta(startSample, endSample);
  const totalMs = performance.now() - suiteStarted;
  runState.summary = summarizeSuite(probeResults, totalMs);
  print("OK", `Completed ${args.iterations}/${args.iterations} probes in ${formatMs(totalMs)}`);
  print(
    "INFO",
    [
      summarizeMetric(
        "probe",
        probeResults.map((result) => result.durationMs),
      ),
      summarizeMetric(
        "firstFrame",
        probeResults.map((result) => result.timings.firstFrameMs),
      ),
      summarizeMetric(
        "h264",
        probeResults.map((result) => result.timings.h264ConfirmMs),
      ),
      summarizeMetric(
        "audio",
        probeResults.map((result) => result.timings.audioFrameMs),
      ),
    ].join(" / "),
  );
  if (args.sampleProcess) {
    print("INFO", `End process: ${formatSample(endSample)}`);
    const delta = formatDelta(startSample, endSample);
    if (delta) print("INFO", `Process delta: ${delta}`);
  }
  if (args.json) printJsonPayload(makeJsonPayload(true));
}

main().catch((error) => {
  if (error.probeResult && !runState.results.includes(error.probeResult)) {
    runState.results = [...runState.results, error.probeResult];
  }
  if (!runState.summary && Number.isFinite(runState.suiteStartedAt)) {
    runState.summary = summarizeSuite(runState.results, performance.now() - runState.suiteStartedAt);
  }
  print("ERROR", error.message);
  if (runState.args?.json) {
    printJsonPayload(makeJsonPayload(false, error));
  }
  process.exitCode = 1;
});
