#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/check-mac-resume-status.mjs";

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  timeoutMs: 8000,
  requireOnline: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-resume-status.mjs [options]

Verifies check-mac-resume-status help and JSON output shape. Offline behavior
is always covered on a reserved port. The online shape is checked when the
configured Mac host is reachable, or required with --requireOnline.

Options:
  --host <host>       Mac host probe host. Default: 127.0.0.1
  --port <port>       Mac host probe port. Default: 43770
  --timeoutMs <ms>    Command timeout. Default: 8000
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
      args.timeoutMs = clampInteger(next, 1000, 60000, defaults.timeoutMs);
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

function run(args, extraArgs = []) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function assertNoPasswordLeak(result, label) {
  const combined = `${result.stdout}\n${result.stderr}`;
  assert(!combined.includes("super-secret-resume-password"), `${label} leaked password text`);
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run(args, [flag]);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assert(/\bUsage\b/.test(result.stdout), `${script} ${flag} should print Usage`);
  }
  print("OK", "Resume status help exits quickly");
}

function checkOfflineJson(args) {
  const result = run(args, [
    "--json",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "1200",
  ]);
  const payload = parseJson(result.stdout, "offline resume status");
  assert(payload.host?.online !== true, "offline payload should not report host online");
  assert(payload.host?.probe?.port === 9, "offline payload should keep probe port");
  assert(payload.host?.error?.message, "offline payload should include error.message");
  assert(Array.isArray(payload.recommendations), "offline payload should include recommendations");
  assert(payload.recommendations.some((item) => /start-mac-host/.test(item.text)), "offline recommendations should include startup guidance");
  print("OK", "Offline resume status JSON includes probe, error, and next-step guidance");
}

function checkRequireOnlineFails(args) {
  const result = run(args, [
    "--json",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "1200",
    "--requireOnline",
  ]);
  const payload = parseJson(result.stdout, "requireOnline resume status");
  assert(result.status !== 0, "requireOnline offline path should fail");
  assert(payload.ok === false, "requireOnline offline payload should report ok=false");
  assert(payload.recommendations.some((item) => item.level === "blocker"), "requireOnline offline payload should include a blocker");
  print("OK", "requireOnline turns offline Mac host into a failing JSON report");
}

function checkOnlineJson(args) {
  const result = run(args, [
    "--json",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--timeoutMs",
    String(args.timeoutMs),
  ]);
  const payload = parseJson(result.stdout, "online resume status");
  if (payload.host?.online !== true) {
    if (args.requireOnline) {
      throw new Error(`online resume status required but host is offline:\n${result.stdout}\n${result.stderr}`);
    }
    print("WARN", "Online resume status skipped because Mac host is offline");
    return;
  }
  assert(payload.currentBuildId, "online payload should include currentBuildId");
  assert(payload.git && typeof payload.git.clean === "boolean", "online payload should include git cleanliness");
  assert(payload.host.runtime?.buildId, "online payload should include runtime.buildId");
  assert(payload.host.permissions && typeof payload.host.permissions === "object", "online payload should include permissions");
  assert(payload.host.capabilities && typeof payload.host.capabilities === "object", "online payload should include capabilities");
  assert(Array.isArray(payload.host.displays), "online payload should include displays");
  assert(Array.isArray(payload.host.lanAddresses), "online payload should include lanAddresses");
  assert(payload.host.buildDiff && typeof payload.host.buildDiff === "object", "online payload should include buildDiff");
  assert(Array.isArray(payload.recommendations), "online payload should include recommendations");
  print("OK", "Online resume status JSON includes runtime, permissions, capabilities, displays, LAN addresses, and buildDiff");
}

function checkPasswordRedaction(args) {
  const result = run(args, [
    "--json",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "1200",
    "--server",
    "http://super-secret-resume-password.invalid",
  ]);
  assertNoPasswordLeak(result, "resume status JSON");
  print("OK", "Resume status output does not echo unrelated secret-like server text in normal offline mode");
}

function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  checkOfflineJson(args);
  checkRequireOnlineFails(args);
  checkOnlineJson(args);
  checkPasswordRedaction(args);
  print("OK", "Mac resume status self-test passed");
}

try {
  main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
}
