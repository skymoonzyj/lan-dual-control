#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const readinessScript = "scripts/mac/check-mac-host-readiness.mjs";

const defaults = {
  timeoutMs: 30000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-readiness-clipboard-security.mjs [options]

Options:
  --timeoutMs <ms>  Per child command timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Description:
  Verifies Mac host readiness exposes --probeClipboardSecurity and wires the
  deep profile to the local file clipboard integrity regression. This test does
  not start Mac host, authenticate, write the system clipboard, or inject input.
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
      args.timeoutMs = clampInteger(next, 5000, 120000, defaults.timeoutMs);
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

function runReadiness(extraArgs, args) {
  return spawnSync(process.execPath, [readinessScript, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function outputOf(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(text, expected, label) {
  assert(String(text || "").includes(expected), `${label} should include ${JSON.stringify(expected)}`);
}

function assertNotIncludes(text, unexpected, label) {
  assert(!String(text || "").includes(unexpected), `${label} should not include ${JSON.stringify(unexpected)}`);
}

function parseJson(text, label) {
  try {
    return JSON.parse(String(text || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${text}`);
  }
}

function assertNoSecretLeak(text, label) {
  const value = String(text || "");
  for (const pattern of [/demo-password/i, /LAN_DUAL_PASSWORD\s*=/i, /--password\s+\S+/i, /"password"\s*:/i]) {
    assert(!pattern.test(value), `${label} contains a password-shaped token: ${pattern}`);
  }
}

function assertHelpMentionsProbe(args) {
  const result = runReadiness(["--help"], args);
  assert(!result.error, `readiness --help failed to start: ${result.error?.message}`);
  assert(result.status === 0, `readiness --help exited ${result.status}\n${outputOf(result)}`);
  assertIncludes(result.stdout, "--probeClipboardSecurity", "readiness help");
  assertIncludes(result.stdout, "system clipboard", "readiness help safety text");
  console.log("[OK] Readiness help documents --probeClipboardSecurity");
}

function assertSourceWiring() {
  const source = readFileSync(new URL("./check-mac-host-readiness.mjs", import.meta.url), "utf8");
  assertIncludes(source, "probeClipboardSecurity: false", "readiness defaults");
  assertIncludes(source, 'key === "probeClipboardSecurity"', "readiness parser");
  assertIncludes(source, "args.probeClipboardSecurity = true;", "deep profile wiring");
  assertIncludes(source, "Mac host file clipboard security", "readiness step label");
  assertIncludes(source, "scripts/mac/test-mac-host-clipboard-file-integrity.mjs", "readiness command");
  assertIncludes(source, "probeClipboardSecurity: args.probeClipboardSecurity", "readiness JSON args");
  console.log("[OK] Readiness source wires clipboard security probe into parser, deep profile, step, and JSON");
}

function assertJsonShape(args) {
  const result = runReadiness(
    [
      "--json",
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "5000",
      "--probeClipboardSecurity",
    ],
    args,
  );
  assert(!result.error && !result.signal, `readiness --probeClipboardSecurity --json should complete\n${outputOf(result)}`);
  const summary = parseJson(result.stdout, "readiness --probeClipboardSecurity --json");
  assert(summary.args?.probeClipboardSecurity === true, "JSON args should report probeClipboardSecurity=true");
  const step = summary.results?.find((entry) => entry.label === "Mac host file clipboard security");
  assert(step, "JSON results should include Mac host file clipboard security");
  assert(step.ok === true, `Mac host file clipboard security should pass in local-only readiness JSON\n${result.stdout}`);
  assertNoSecretLeak(result.stdout, "readiness --probeClipboardSecurity stdout");
  assertNoSecretLeak(result.stderr, "readiness --probeClipboardSecurity stderr");
  console.log("[OK] Readiness --probeClipboardSecurity JSON includes passing clipboard security result");
}

function assertDeepProfileShape(args) {
  const result = runReadiness(
    [
      "--json",
      "--profile",
      "deep",
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "5000",
    ],
    args,
  );
  assert(!result.error && !result.signal, `readiness --profile deep --json should complete\n${outputOf(result)}`);
  const summary = parseJson(result.stdout, "readiness --profile deep --json");
  assert(summary.args?.profile === "deep", "JSON args should report profile=deep");
  assert(summary.args?.probeClipboardSecurity === true, "deep profile should enable probeClipboardSecurity");
  assert(
    summary.results?.some((entry) => entry.label === "Mac host file clipboard security"),
    "deep profile JSON results should include clipboard security result",
  );
  assertNoSecretLeak(result.stdout, "readiness --profile deep stdout");
  assertNoSecretLeak(result.stderr, "readiness --profile deep stderr");
  console.log("[OK] Readiness deep profile enables clipboard security probe");
}

function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  assertHelpMentionsProbe(args);
  assertSourceWiring();
  assertJsonShape(args);
  assertDeepProfileShape(args);
  console.log("[OK] Mac readiness clipboard security coverage passed");
}

try {
  main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
}
