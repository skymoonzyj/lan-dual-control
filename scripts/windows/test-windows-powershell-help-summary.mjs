#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/windows/test-windows-powershell-help.mjs";

const defaults = {
  timeoutMs: 20000,
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-powershell-help-summary.mjs [options]

Options:
  --timeoutMs <ms>       Command timeout. Default: ${defaults.timeoutMs}
  --help, -h             Show this help without running checks

Description:
  Verifies test-windows-powershell-help --boardSummary and --json expose a safe,
  single-line Agent Link Board summary. It only checks PowerShell help output
  paths; it does not start Windows host/dev lab/watcher, authenticate, prompt
  for a password, capture audio/video, send input events, or execute inject.

Examples:
  node scripts/windows/test-windows-powershell-help-summary.mjs
`);
}

function parseArgs(argv) {
  const args = { ...defaults, help: false };
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
  assert(!/\bToken\s*=\s*\S+/i.test(text), `${label} should not print token assignment`);
  assert(!/password\s*:\s*$/im.test(text), `${label} should not print a password prompt`);
  assert(!/updatedAt:|currentCall:|statuses:|recentEvents:/.test(text), `${label} should not print Agent Link Board state`);
  assert(!/input_ack|video_frame|audio_frame|session_answer|hello_ack/.test(text), `${label} should not print protocol traffic`);
}

function assertBoardSummary(text, label) {
  const trimmed = String(text || "").trim();
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  assert(lines.length === 1, `${label} should be exactly one line, got ${lines.length}`);
  assert(/^Windows PowerShell help: ok\b/.test(trimmed), `${label} should start with ok summary`);
  assert(/commands across 1 script/.test(trimmed), `${label} should mention scoped script count`);
  assert(/shell=powershell\.exe/.test(trimmed), `${label} should mention default Windows PowerShell shell`);
  assert(/Pure -Help\/-h only/.test(trimmed), `${label} should describe pure help scope`);
  assert(/no host\/watcher\/Agent Link startup/.test(trimmed), `${label} should mention startup safety`);
  assert(/password\/Token/.test(trimmed), `${label} should mention password/Token safety`);
  assert(/WASAPI capture/.test(trimmed), `${label} should mention WASAPI safety`);
  assert(/input, or inject/.test(trimmed), `${label} should mention input/inject safety`);
  assertNoSecretLikeOutput(trimmed, label);
}

function checkBoardSummary(args) {
  const result = run(args, [
    "--script",
    "test-windows-host.ps1",
    "--timeoutMs",
    "10000",
    "--boardSummary",
  ]);
  assert(result.status === 0, `boardSummary command should exit 0\n${result.stdout}\n${result.stderr}`);
  assertBoardSummary(result.stdout, "boardSummary stdout");
  assert(String(result.stderr || "").trim() === "", "boardSummary stderr should be empty on success");
  console.log("[OK] test-windows-powershell-help --boardSummary prints one safe summary line");
}

function checkJson(args) {
  const result = run(args, [
    "--script",
    "test-windows-host.ps1",
    "--timeoutMs",
    "10000",
    "--json",
  ]);
  assert(result.status === 0, `json command should exit 0\n${result.stdout}\n${result.stderr}`);
  const payload = parseJson(result.stdout, "test-windows-powershell-help JSON");
  assert(payload.ok === true, "JSON payload should be ok");
  assert(payload.scriptsChecked === 1, "JSON payload should cover one selected script");
  assert(payload.commandsChecked === 2, "JSON payload should cover -Help and -h");
  assert(payload.shell === "powershell.exe", "JSON payload should record default shell");
  assert(Array.isArray(payload.results) && payload.results.length === 2, "JSON payload should include two results");
  assert(payload.results.every((entry) => entry.ok === true), "JSON result entries should all be ok");
  assertBoardSummary(payload.boardSummary, "JSON boardSummary");
  assert(String(result.stderr || "").trim() === "", "JSON stderr should be empty on success");
  console.log("[OK] test-windows-powershell-help --json includes the same safe boardSummary field");
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  checkBoardSummary(args);
  checkJson(args);
  console.log("[OK] Windows PowerShell help board summary self-test passed");
}

try {
  main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
}
