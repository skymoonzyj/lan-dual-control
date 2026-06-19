#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = "scripts/codex-link-daily-items.mjs";
const defaultTimeoutMs = 10000;

function parseArgs(argv) {
  const args = { timeoutMs: defaultTimeoutMs };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if ((token === "--timeoutMs" || token === "--timeout") && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(3000, Number(next) || defaultTimeoutMs);
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(text, expected, label) {
  assert(String(text).includes(expected), `${label} did not include ${JSON.stringify(expected)}.\n${text}`);
}

function assertNotIncludes(text, unexpected, label) {
  assert(!String(text).includes(unexpected), `${label} unexpectedly included ${JSON.stringify(unexpected)}.\n${text}`);
}

function run(extraArgs, args) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    env: {
      ...process.env,
      CODEX_LINK_TOKEN: "",
    },
  });
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

function assertSafeOutput(text, label) {
  assertNotIncludes(text, "--password", label);
  assertNotIncludes(text, "demo-password", label);
  assertNotIncludes(text, "secret", label);
  assertNotIncludes(text, "token=", label);
  assertNotIncludes(text, "input_event", label);
  assertNotIncludes(text, " inject", label);
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag], args);
    assert(result.status === 0, `${flag} should exit 0. stderr=${result.stderr}`);
    assertIncludes(result.stdout, "Usage:", `${flag} help`);
    assertIncludes(result.stdout, "DAILY_ITEM", `${flag} help`);
    assertIncludes(result.stdout, "--preset", `${flag} help`);
    assertIncludes(result.stdout, "--boardSummary", `${flag} help`);
    assertIncludes(result.stdout, "--sendStatus", `${flag} help`);
    assertSafeOutput(`${result.stdout}\n${result.stderr}`, `${flag} help`);
  }
  console.log("[OK] daily item reporter help is pure and safe");
}

function checkJsonPass(args) {
  const result = run(["--json"], args);
  assert(result.status === 0, `default JSON should pass. stdout=${result.stdout} stderr=${result.stderr}`);
  const payload = parseJson(result.stdout, "default JSON");
  assert(payload.preset === "night-unattended", `unexpected preset: ${payload.preset}`);
  assert(payload.status === "PASS", `unexpected status: ${payload.status}`);
  assert(Array.isArray(payload.items), "payload should include items");
  assert(payload.items.length === 6, `expected 6 items, got ${payload.items.length}`);
  for (const id of ["N1", "N2", "N3", "N4", "N5", "N6"]) {
    const item = payload.items.find((candidate) => candidate.id === id);
    assert(item, `missing item ${id}`);
    assert(item.status === "PASS", `${id} should PASS, got ${item.status}`);
    assertIncludes(item.line, `DAILY_ITEM ${id} PASS`, `${id} line`);
  }
  assertIncludes(payload.boardSummary, "DAILY_ITEM_REPORT preset=night-unattended status=PASS", "default JSON boardSummary");
  assertIncludes(payload.boardSummary, "Safety=no-credentials,no-auth,no-input-inject", "default JSON boardSummary");
  assertSafeOutput(`${result.stdout}\n${result.stderr}`, "default JSON");
  console.log("[OK] daily item reporter emits N1-N6 PASS JSON from current task board evidence");
}

function checkBoardSummary(args) {
  const result = run(["--boardSummary"], args);
  assert(result.status === 0, `boardSummary should pass. stdout=${result.stdout} stderr=${result.stderr}`);
  const text = String(result.stdout || "").trim();
  const lines = text.split(/\r?\n/).filter(Boolean);
  assert(lines.length === 1, `boardSummary should be one line, got ${lines.length}`);
  assertIncludes(text, "DAILY_ITEM_REPORT preset=night-unattended status=PASS", "boardSummary");
  for (const id of ["N1", "N2", "N3", "N4", "N5", "N6"]) {
    assertIncludes(text, `DAILY_ITEM ${id} PASS`, "boardSummary");
  }
  assertIncludes(text, "Safety=no-credentials,no-auth,no-input-inject", "boardSummary");
  assertSafeOutput(`${result.stdout}\n${result.stderr}`, "boardSummary");
  console.log("[OK] daily item reporter boardSummary is one-line and Agent Link safe");
}

function checkMissingEvidence(args) {
  const dir = mkdtempSync(path.join(tmpdir(), "lan-dual-daily-items-"));
  try {
    const taskBoard = path.join(dir, "task-board.md");
    writeFileSync(taskBoard, "# empty task board\n", "utf8");
    const result = run(["--json", "--taskBoardPath", taskBoard], args);
    assert(result.status !== 0, "missing evidence should exit non-zero");
    const payload = parseJson(result.stdout, "missing evidence JSON");
    assert(payload.status === "BLOCKED", `missing evidence status should be BLOCKED, got ${payload.status}`);
    assert(payload.items.some((item) => item.status === "BLOCKED"), "missing evidence should include blocked items");
    assertIncludes(payload.boardSummary, "DAILY_ITEM N1 BLOCKED", "missing evidence boardSummary");
    assertSafeOutput(`${result.stdout}\n${result.stderr}`, "missing evidence JSON");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("[OK] daily item reporter fails closed when evidence is missing");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: node scripts/test-codex-link-daily-items.mjs [--timeoutMs 10000]`);
    return;
  }
  checkHelp(args);
  checkJsonPass(args);
  checkBoardSummary(args);
  checkMissingEvidence(args);
  console.log("[OK] daily item reporter self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
