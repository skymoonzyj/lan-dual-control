#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/test-mac-script-help.mjs";

const defaults = {
  timeoutMs: 15000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/mac/test-mac-script-help-summary.mjs [options]

Options:
  --timeoutMs <ms>       Command timeout. Default: ${defaults.timeoutMs}
  --help, -h             Show this help without running checks

Description:
  Verifies test-mac-script-help --boardSummary and --json expose a safe,
  single-line Agent Link Board summary. It only checks help output paths; it
  does not start Mac host/client, read Agent Link Board, authenticate, prompt
  for a password, send input events, or execute inject.

Examples:
  node scripts/mac/test-mac-script-help-summary.mjs
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
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 1000, 120000, defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function run(args, extraArgs) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

function assertNoSecretLikeOutput(text, label) {
  assert(!/LAN_DUAL_PASSWORD\s*=/.test(text), `${label} should not print LAN_DUAL_PASSWORD assignment`);
  assert(!/password\s*:/i.test(text), `${label} should not print a password prompt`);
  assert(!/updatedAt:|currentCall:|statuses:|recentEvents:/.test(text), `${label} should not print Agent Link Board state`);
  assert(!/input_ack|video_frame|audio_frame|session_answer|hello_ack/.test(text), `${label} should not print protocol traffic`);
}

function assertBoardSummary(text, label) {
  const trimmed = String(text || "").trim();
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  assert(lines.length === 1, `${label} should be exactly one line, got ${lines.length}`);
  assert(/^Mac script help: ok\b/.test(trimmed), `${label} should start with ok summary`);
  assert(/commands across 1 script/.test(trimmed), `${label} should mention scoped script count`);
  assert(/MacScriptHelpStatus=ok commands=2\/2 scripts=1 timeoutMs=10000\b/.test(trimmed), `${label} should include stable MacScriptHelpStatus fields`);
  assert(/Pure --help\/-h only/.test(trimmed), `${label} should describe pure help scope`);
  assert(/no service startup/.test(trimmed), `${label} should mention no service startup`);
  assert(/password prompt/.test(trimmed), `${label} should mention password prompt safety`);
  assert(/Agent Link read/.test(trimmed), `${label} should mention Agent Link safety`);
  assert(/input, or inject/.test(trimmed), `${label} should mention input/inject safety`);
  assertNoSecretLikeOutput(trimmed, label);
}

function checkBoardSummary(args) {
  const result = run(args, [
    "--script",
    "test-mac-script-help.mjs",
    "--timeoutMs",
    "10000",
    "--boardSummary",
  ]);
  assert(result.status === 0, `boardSummary command should exit 0\n${result.stdout}\n${result.stderr}`);
  assertBoardSummary(result.stdout, "boardSummary stdout");
  assert(String(result.stderr || "").trim() === "", "boardSummary stderr should be empty on success");
  console.log("[OK] test-mac-script-help --boardSummary prints one safe summary line");
}

function checkJson(args) {
  const result = run(args, [
    "--script",
    "test-mac-script-help.mjs",
    "--timeoutMs",
    "10000",
    "--json",
  ]);
  assert(result.status === 0, `json command should exit 0\n${result.stdout}\n${result.stderr}`);
  const payload = parseJson(result.stdout, "test-mac-script-help JSON");
  assert(payload.ok === true, "JSON payload should be ok");
  assert(payload.scriptsChecked === 1, "JSON payload should cover one selected script");
  assert(payload.commandsChecked === 2, "JSON payload should cover --help and -h");
  assert(Array.isArray(payload.results) && payload.results.length === 2, "JSON payload should include two results");
  assert(payload.results.every((entry) => entry.ok === true), "JSON result entries should all be ok");
  assertBoardSummary(payload.boardSummary, "JSON boardSummary");
  assert(String(result.stderr || "").trim() === "", "JSON stderr should be empty on success");
  console.log("[OK] test-mac-script-help --json includes the same safe boardSummary field");
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  checkBoardSummary(args);
  checkJson(args);
  console.log("[OK] Mac script help board summary self-test passed");
}

try {
  main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
}
