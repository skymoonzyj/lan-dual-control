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
  requireH264: true,
  requireAudio: true,
  requireRealVideo: false,
  expectInputMode: "log",
  sampleProcess: os.platform() === "darwin",
  probeScript: path.join(repoRoot, "scripts", "windows", "probe-mac-host.mjs"),
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
  args.requireH264 = booleanArg(args.requireH264, defaults.requireH264);
  args.requireAudio = booleanArg(args.requireAudio, defaults.requireAudio);
  args.requireRealVideo = booleanArg(args.requireRealVideo, defaults.requireRealVideo);
  args.sampleProcess = booleanArg(args.sampleProcess, defaults.sampleProcess);
  args.expectInputMode = String(args.expectInputMode || "").trim().toLowerCase();
  args.probeScript = path.resolve(String(args.probeScript || defaults.probeScript));
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
  console.log(`[${status}] ${text}`);
}

function formatMs(ms) {
  return `${Math.round(ms)} ms`;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runCommand(command, commandArgs, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
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
  const result = await runCommand(process.execPath, buildProbeArgs(args), { timeoutMs: args.timeoutMs + 5000 });
  const durationMs = performance.now() - started;
  if (result.code !== 0) {
    const details = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
    throw new Error(`probe #${iteration} failed with exit ${result.code}\n${details}`);
  }
  return {
    durationMs,
    highlights: extractHighlights(result.stdout),
  };
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
  --requireH264 <true|false>    Require H.264 Annex B keyframe. Default: true
  --requireAudio <true|false>   Require pcm-f32le audio frame. Default: true
  --expectInputMode <mode>      Expected input mode. Default: log
  --sampleProcess <true|false>  Sample listener RSS/FDs with lsof/ps. Default: true on macOS
  --probeScript <path>          Override canonical probe script path.

Example:
  node scripts/mac/stress-mac-host.mjs --iterations 20 --requireH264 true --requireAudio true --expectInputMode log`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  print("INFO", `Target: ${args.host}:${args.port}`);
  print("INFO", `Probe: ${path.relative(repoRoot, args.probeScript)}`);
  print(
    "INFO",
    `Checks: h264=${args.requireH264}, audio=${args.requireAudio}, realVideo=${args.requireRealVideo}, inputMode=${args.expectInputMode || "any"}`,
  );

  const pid = await findListenerPid(args);
  const startSample = await sampleProcess(pid);
  if (args.sampleProcess) {
    print("INFO", `Start process: ${formatSample(startSample)}`);
  }

  const suiteStarted = performance.now();
  for (let iteration = 1; iteration <= args.iterations; iteration += 1) {
    const result = await runProbe(iteration, args);
    print("OK", `#${iteration}/${args.iterations} passed in ${formatMs(result.durationMs)}${result.highlights ? ` | ${result.highlights}` : ""}`);
    if (iteration < args.iterations && args.delayMs > 0) {
      await delay(args.delayMs);
    }
  }

  const endSample = await sampleProcess(pid);
  const totalMs = performance.now() - suiteStarted;
  print("OK", `Completed ${args.iterations}/${args.iterations} probes in ${formatMs(totalMs)}`);
  if (args.sampleProcess) {
    print("INFO", `End process: ${formatSample(endSample)}`);
    const delta = formatDelta(startSample, endSample);
    if (delta) print("INFO", `Process delta: ${delta}`);
  }
}

main().catch((error) => {
  print("ERROR", error.message);
  process.exitCode = 1;
});
