#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const scriptPath = "scripts/mac/check-mac-host-readiness.mjs";

const defaults = {
  timeoutMs: 8000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-readiness-prompt-password.mjs [options]

Options:
  --timeoutMs <ms>  Per check timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Verifies check-mac-host-readiness --promptPassword is safe for automation:
when the macOS dialog is explicitly disabled, non-interactive runs fail fast,
JSON stdout is not polluted by prompts, and explicit passwords are not leaked.
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
      args.timeoutMs = Math.max(3000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function runReadiness(extraArgs, args, env = {}) {
  return spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
      LAN_DUAL_DISABLE_PASSWORD_DIALOG: "1",
      LAN_DUAL_DISABLE_PASSWORD_BEEP: "1",
      ...env,
    },
  });
}

function outputOf(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function assertIncludes(text, expected, label) {
  if (!String(text).includes(expected)) {
    throw new Error(`${label} did not include ${JSON.stringify(expected)}.\n${text}`);
  }
}

function assertNotIncludes(text, expected, label) {
  if (String(text).includes(expected)) {
    throw new Error(`${label} unexpectedly included ${JSON.stringify(expected)}.\n${text}`);
  }
}

function assertFails(result, label) {
  if (result.error) {
    throw new Error(`${label} errored before assertion: ${result.error.message}`);
  }
  if (result.status === 0 || result.signal) {
    throw new Error(`${label} should fail fast without timing out or succeeding.\n${outputOf(result)}`);
  }
}

function assertNonInteractivePromptFails(args) {
  const result = runReadiness(["--promptPassword"], args);
  const output = outputOf(result);
  assertFails(result, "non-interactive --promptPassword");
  assertIncludes(output, "--promptPassword requires a macOS password dialog", "non-interactive --promptPassword");
  console.log("[OK] Non-interactive --promptPassword fails fast when dialog is disabled");
}

function assertJsonPromptDoesNotPolluteStdout(args) {
  const result = runReadiness(["--json", "--promptPassword"], args);
  assertFails(result, "--json --promptPassword");
  if (String(result.stdout || "").trim()) {
    throw new Error(`--json --promptPassword should not print prompt text to stdout.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  assertIncludes(result.stderr, "--promptPassword requires a macOS password dialog", "--json --promptPassword");
  console.log("[OK] JSON prompt failures keep stdout empty");
}

function assertPromptPasswordRefusesExplicitPassword(args) {
  const secret = "super-secret-readiness-password";
  const result = runReadiness(["--promptPassword", "--password", secret], args);
  const output = outputOf(result);
  assertFails(result, "--promptPassword with --password");
  assertIncludes(output, "--promptPassword cannot be combined with --password", "--promptPassword with --password");
  assertNotIncludes(output, secret, "--promptPassword with --password");
  console.log("[OK] --promptPassword refuses explicit --password without leaking it");
}

function assertPromptPasswordIgnoresEnvPassword(args) {
  const secret = "super-secret-env-readiness-password";
  const result = runReadiness(["--promptPassword"], args, { LAN_DUAL_PASSWORD: secret });
  const output = outputOf(result);
  assertFails(result, "--promptPassword with LAN_DUAL_PASSWORD");
  assertIncludes(output, "--promptPassword requires a macOS password dialog", "--promptPassword with LAN_DUAL_PASSWORD");
  assertNotIncludes(output, secret, "--promptPassword with LAN_DUAL_PASSWORD");
  console.log("[OK] --promptPassword ignores existing LAN_DUAL_PASSWORD and still requires a visible dialog");
}

function assertJsonSummaryDoesNotExposePassword(args) {
  const secret = "super-secret-json-readiness-password";
  const result = runReadiness(["--json", "--port", "9", "--password", secret], args);
  const output = outputOf(result);
  if (result.error || result.signal) {
    throw new Error(`JSON readiness command should complete without timing out.\n${output}`);
  }
  assertNotIncludes(output, secret, "readiness JSON summary");
  const payload = JSON.parse(String(result.stdout || "").trim());
  if (Object.prototype.hasOwnProperty.call(payload.args || {}, "password")) {
    throw new Error(`readiness JSON summary must not expose args.password.\n${result.stdout}`);
  }
  console.log("[OK] Readiness JSON summary does not expose probe password");
}

function assertReadinessDoesNotPassPasswordArgs() {
  const source = readFileSync(new URL("./check-mac-host-readiness.mjs", import.meta.url), "utf8");
  for (const probe of [
    "scripts/mac/check-mac-displays.mjs",
    "scripts/mac/observe-mac-video.mjs",
    "scripts/mac/observe-mac-audio.mjs",
    "scripts/mac/smoke-mac-input-log.mjs",
  ]) {
    const index = source.indexOf(JSON.stringify(probe));
    if (index === -1) {
      throw new Error(`readiness source no longer references ${probe}`);
    }
    const window = source.slice(index, index + 900);
    if (window.includes('"--password"') || window.includes("'--password'")) {
      throw new Error(`readiness should pass probe passwords via environment, not argv, for ${probe}`);
    }
  }
  console.log("[OK] Readiness passes probe passwords through environment, not argv");
}

function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  assertNonInteractivePromptFails(args);
  assertJsonPromptDoesNotPolluteStdout(args);
  assertPromptPasswordRefusesExplicitPassword(args);
  assertPromptPasswordIgnoresEnvPassword(args);
  assertJsonSummaryDoesNotExposePassword(args);
  assertReadinessDoesNotPassPasswordArgs();
  console.log("[OK] Mac readiness prompt password safety checks passed");
}

try {
  main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
}
