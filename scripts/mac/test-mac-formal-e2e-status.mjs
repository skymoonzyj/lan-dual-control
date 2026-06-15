#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/check-mac-formal-e2e-status.mjs";

const defaults = {
  host: "127.0.0.1",
  port: 43770,
  timeoutMs: 10000,
  requireOnline: false,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-formal-e2e-status.mjs [options]

Verifies the formal E2E checklist script. Offline behavior is always covered
on a reserved port. The online shape is checked when the configured Mac host is
reachable, or required with --requireOnline.

Options:
  --host <host>       Mac host probe host. Default: 127.0.0.1
  --port <port>       Mac host probe port. Default: 43770
  --timeoutMs <ms>    Command timeout. Default: 10000
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

function assertNoSecretLikeText(text, label) {
  assert(!/super-secret-formal-password/.test(text), `${label} leaked secret-like password text`);
  assert(!/token=/i.test(text), `${label} should not print token-like text`);
}

function assertBoardSummaryShape(text, label) {
  assert(/Mac formal E2E:/.test(text), `${label} should start with formal E2E summary`);
  assert(/Do not send passwords/.test(text), `${label} should include password safety note`);
  assert(/inject/.test(text), `${label} should include inject safety note`);
  assertNoSecretLikeText(text, label);
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run(args, [flag]);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assert(/\bUsage\b/.test(result.stdout), `${script} ${flag} should print Usage`);
    assert(!/Mac host probe password/.test(result.stdout), `${script} ${flag} should not prompt for password`);
  }
  print("OK", "Formal E2E status help exits quickly");
}

function checkOfflineJson(args) {
  const result = run(args, [
    "--json",
    "--skipBoard",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "1200",
  ]);
  const payload = parseJson(result.stdout, "offline formal E2E status");
  assert(result.status !== 0, "offline formal status should fail because host is required");
  assert(payload.ok === false, "offline payload should report ok=false");
  assert(payload.readyToCall === false, "offline payload should not be readyToCall");
  assert(payload.counts?.blockers >= 1, "offline payload should include blocker count");
  assert(payload.checklist.some((entry) => entry.id === "host" && entry.status === "blocker"), "offline checklist should block on host");
  assert(payload.checklist.some((entry) => entry.id === "inject" && entry.status === "skip"), "offline checklist should explicitly skip inject");
  assertBoardSummaryShape(payload.boardSummary || "", "offline JSON boardSummary");
  assert(/start-mac-host --promptPassword --requirePassword/.test(payload.callText || ""), "offline callText should include safe start command");
  print("OK", "Offline formal E2E JSON blocks the call and keeps safety guidance");
}

function checkOfflineBoardSummary(args) {
  const result = run(args, [
    "--boardSummary",
    "--skipBoard",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "1200",
  ]);
  assert(result.status !== 0, "offline board summary should fail because formal E2E is blocked");
  const text = String(result.stdout || "").trim();
  assertBoardSummaryShape(text, "offline board summary");
  assert(/Mac host offline/.test(text), "offline board summary should mention host offline");
  print("OK", "Offline board summary is short, secret-free, and actionable");
}

function checkOnlineJson(args) {
  const result = run(args, [
    "--json",
    "--skipBoard",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--timeoutMs",
    String(args.timeoutMs),
  ]);
  const payload = parseJson(result.stdout, "online formal E2E status");
  if (payload.resume?.host?.online !== true) {
    if (args.requireOnline) {
      throw new Error(`online formal status required but host is offline:\n${result.stdout}\n${result.stderr}`);
    }
    print("WARN", "Online formal E2E status skipped because Mac host is offline");
    return;
  }
  assert(payload.counts && typeof payload.counts.blockers === "number", "online payload should include counts");
  assert(Array.isArray(payload.checklist), "online payload should include checklist");
  assert(payload.checklist.some((entry) => entry.id === "video"), "online checklist should include video item");
  assert(payload.checklist.some((entry) => entry.id === "audio"), "online checklist should include audio item");
  assert(payload.checklist.some((entry) => entry.id === "clipboard"), "online checklist should include clipboard item");
  assert(payload.checklist.some((entry) => entry.id === "input-log"), "online checklist should include input-log item");
  assert(payload.checklist.some((entry) => entry.id === "inject" && entry.status === "skip"), "online checklist should explicitly skip inject");
  assertBoardSummaryShape(payload.boardSummary || "", "online JSON boardSummary");
  assert(/discovery -> auth -> H\.264 5-10 min/.test(payload.callText || ""), "online callText should include formal path");
  print("OK", "Online formal E2E JSON includes video/audio/clipboard/input-log/inject safety checklist");
}

function checkOnlineBoardSummary(args) {
  const result = run(args, [
    "--boardSummary",
    "--skipBoard",
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--timeoutMs",
    String(args.timeoutMs),
  ]);
  const text = String(result.stdout || "").trim();
  assertBoardSummaryShape(text, "online board summary");
  if (/Mac host offline/.test(text)) {
    if (args.requireOnline) {
      throw new Error(`online board summary required but host is offline:\n${result.stdout}\n${result.stderr}`);
    }
    print("WARN", "Online board summary host-specific assertions skipped because Mac host is offline");
    return;
  }
  assert(/host=/.test(text), "online board summary should include host address");
  assert(/Permissions/.test(text), "online board summary should include permissions");
  assert(/Formal path:/.test(text), "online board summary should include formal path");
  print("OK", "Online board summary includes host, permissions, and formal path");
}

function checkSecretRedaction(args) {
  const result = run(args, [
    "--json",
    "--skipBoard",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "1200",
    "--server",
    "http://super-secret-formal-password.invalid",
  ]);
  assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "formal E2E JSON");
  print("OK", "Formal E2E status output does not echo unrelated secret-like server text");
}

function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  checkOfflineJson(args);
  checkOfflineBoardSummary(args);
  checkOnlineJson(args);
  checkOnlineBoardSummary(args);
  checkSecretRedaction(args);
  print("OK", "Mac formal E2E status self-test passed");
}

try {
  main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
}
