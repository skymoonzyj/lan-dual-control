#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  timeoutMs: 12000,
  requireOnline: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-readiness-json-details.mjs [options]

Verifies check-mac-host-readiness --json exposes machine-readable discovery
details. The offline path is always checked. The online path is checked when
the configured Mac host is reachable, or required with --requireOnline.

Options:
  --host <host>       Mac host probe host. Default: 127.0.0.1
  --port <port>       Mac host port. Default: 43770
  --timeoutMs <ms>    Readiness timeout. Default: 12000
  --requireOnline     Fail when the configured Mac host is not reachable
  --help, -h          Show this help without running checks
`);
}

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--requireOnline") {
      args.requireOnline = true;
      continue;
    }
    if (token === "--host" && next && !next.startsWith("--")) {
      args.host = next;
      index += 1;
      continue;
    }
    if (token === "--port" && next && !next.startsWith("--")) {
      args.port = clampInteger(next, 1, 65535, defaults.port);
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 3000, 120000, defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  args.host = String(args.host || defaults.host).trim();
  return args;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function runReadiness(args, extraArgs) {
  return spawnSync(
    process.execPath,
    [
      "scripts/mac/check-mac-host-readiness.mjs",
      "--json",
      "--host",
      args.host,
      "--port",
      String(args.port),
      "--timeoutMs",
      String(args.timeoutMs),
      ...extraArgs,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    },
  );
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

function discoveryStep(summary, label) {
  const step = summary.results?.find((result) => result.label === "Mac host discovery");
  if (!step) {
    throw new Error(`${label}: missing Mac host discovery result`);
  }
  if (!step.details || typeof step.details !== "object") {
    throw new Error(`${label}: Mac host discovery result is missing details`);
  }
  return step;
}

function assertOfflineDetails(summary, expectedPort) {
  const step = discoveryStep(summary, "offline readiness");
  if (step.ok !== true) {
    throw new Error(`offline readiness discovery should be a warning, not a failure: ${step.summary}`);
  }
  if (step.details.online !== false) {
    throw new Error("offline readiness details should report online=false");
  }
  if (step.details.probe?.port !== expectedPort) {
    throw new Error(`offline readiness details should keep probe port ${expectedPort}`);
  }
  if (!step.details.error?.message) {
    throw new Error("offline readiness details should include error.message");
  }
  if (!Array.isArray(step.details.suggestions) || step.details.suggestions.length === 0) {
    throw new Error("offline readiness details should include startup suggestions");
  }
}

function assertOnlineDetails(summary, expectedPort) {
  const step = discoveryStep(summary, "online readiness");
  if (step.ok !== true) {
    throw new Error(`online readiness discovery should pass: ${step.summary}`);
  }
  const details = step.details;
  if (details.online !== true) {
    throw new Error("online readiness details should report online=true");
  }
  if (details.probe?.port !== expectedPort) {
    throw new Error(`online readiness details should keep probe port ${expectedPort}`);
  }
  if (!details.runtime?.buildId) {
    throw new Error("online readiness details should include runtime.buildId");
  }
  if (details.permissions?.screenRecording !== true) {
    throw new Error("online readiness details should include permissions.screenRecording=true");
  }
  if (!details.capabilities || typeof details.capabilities !== "object") {
    throw new Error("online readiness details should include capabilities");
  }
  if (!Array.isArray(details.lanAddresses)) {
    throw new Error("online readiness details should include lanAddresses array");
  }
  if (!details.buildDiff || typeof details.buildDiff !== "object") {
    throw new Error("online readiness details should include buildDiff object");
  }
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);

  const offline = runReadiness({ ...args, port: 9 }, []);
  const offlineSummary = parseJson(offline.stdout, "offline readiness");
  assertOfflineDetails(offlineSummary, 9);
  if (offline.status !== 0) {
    print("WARN", "Offline readiness reported unrelated failed checks; discovery details shape is still valid");
  }
  print("OK", "Offline readiness JSON details include probe, error, and suggestions");

  const online = runReadiness(args, ["--requireOpen", "--skipCurrentBuildCheck"]);
  const onlineSummary = parseJson(online.stdout, "online readiness");
  const onlineStep = discoveryStep(onlineSummary, "online readiness");
  if (onlineStep.details?.online !== true) {
    if (args.requireOnline) {
      throw new Error(`online readiness path failed but --requireOnline was set.\n${online.stdout}\n${online.stderr}`);
    }
    print("WARN", `Online readiness details skipped: ${onlineStep.summary || "host offline"}`);
    return;
  }
  assertOnlineDetails(onlineSummary, args.port);
  if (online.status !== 0) {
    print("WARN", "Online readiness reported unrelated failed checks; discovery details shape is still valid");
  }
  print("OK", "Online readiness JSON details include runtime, permissions, capabilities, LAN addresses, and buildDiff");
  print("OK", "Mac readiness JSON details coverage passed");
}

try {
  main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
}
