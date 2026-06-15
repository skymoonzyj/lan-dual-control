#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  timeoutMs: 8000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-password-prompt.mjs [options]

Options:
  --timeoutMs <ms>  Per check timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Verifies the shared Mac password prompt helper with a fake osascript binary, so
the test never opens a real system dialog and never uses a real password.
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(text, expected, label) {
  assert(String(text).includes(expected), `${label} did not include ${JSON.stringify(expected)}.\n${text}`);
}

function assertNotIncludes(text, expected, label) {
  assert(!String(text).includes(expected), `${label} unexpectedly included ${JSON.stringify(expected)}.\n${text}`);
}

function makeFakeOsascript(dir) {
  const path = join(dir, "osascript");
  writeFileSync(path, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const log = process.env.FAKE_OSASCRIPT_LOG;
const joined = process.argv.slice(2).join("\\n");
if (log) appendFileSync(log, joined.includes("beep") ? "beep\\n" : "dialog\\n");
if (joined.includes("beep")) process.exit(0);
if (process.env.FAKE_OSASCRIPT_MODE === "cancel") {
  console.error("execution error: Password prompt cancelled. (-128)");
  process.exit(1);
}
if (process.env.FAKE_OSASCRIPT_MODE === "fail") {
  console.error("execution error: fake dialog failure");
  process.exit(1);
}
process.stdout.write(process.env.FAKE_OSASCRIPT_PASSWORD || "fake-dialog-password");
`, { mode: 0o755 });
  return path;
}

function runPromptSnippet(extraEnv, timeoutMs) {
  const snippet = `
import { promptPassword } from "./scripts/mac/password-prompt.mjs";
import { createHash } from "node:crypto";
try {
  const value = await promptPassword({
    title: "Test Prompt",
    message: "Test message",
    prompt: "Password:",
    output: process.stderr,
    timeoutMs: 2000,
  });
  console.log(JSON.stringify({ ok: true, length: value.length, sha256: createHash("sha256").update(value).digest("hex") }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, message: error.message }));
  process.exitCode = 1;
}
`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", snippet], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: timeoutMs,
    env: {
      ...process.env,
      LAN_DUAL_DISABLE_PASSWORD_BEEP: "",
      LAN_DUAL_DISABLE_PASSWORD_DIALOG: "",
      ...extraEnv,
    },
  });
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

function checkDialogSuccess(tmp, timeoutMs) {
  const logPath = join(tmp, "osascript-success.log");
  const secret = "fake-secret-from-dialog";
  const result = runPromptSnippet({
    PATH: `${tmp}:${process.env.PATH}`,
    FAKE_OSASCRIPT_LOG: logPath,
    FAKE_OSASCRIPT_PASSWORD: secret,
  }, timeoutMs);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert(result.status === 0, `dialog success should exit 0.\n${output}`);
  const payload = parseJson(result.stdout, "dialog success");
  assert(payload.ok === true, "dialog success should report ok=true");
  assert(payload.length === secret.length, "dialog success should return the fake password length");
  assert(payload.sha256 === createHash("sha256").update(secret).digest("hex"), "dialog success should return the fake password hash");
  assertNotIncludes(output, secret, "dialog success output");
  const log = safeRead(logPath);
  assertIncludes(log, "beep", "dialog success osascript log");
  assertIncludes(log, "dialog", "dialog success osascript log");
  console.log("[OK] Password helper rings and reads a hidden macOS dialog value");
}

function checkDialogCancel(tmp, timeoutMs) {
  const result = runPromptSnippet({
    PATH: `${tmp}:${process.env.PATH}`,
    FAKE_OSASCRIPT_MODE: "cancel",
  }, timeoutMs);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert(result.status !== 0, `dialog cancel should fail.\n${output}`);
  const payload = parseJson(result.stdout, "dialog cancel");
  assert(payload.ok === false, "dialog cancel should report ok=false");
  assertIncludes(payload.message, "Password prompt cancelled", "dialog cancel message");
  console.log("[OK] Password helper reports dialog cancellation cleanly");
}

function checkDialogFailureNoTty(tmp, timeoutMs) {
  const result = runPromptSnippet({
    PATH: `${tmp}:${process.env.PATH}`,
    FAKE_OSASCRIPT_MODE: "fail",
  }, timeoutMs);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert(result.status !== 0, `dialog failure should fail without hanging.\n${output}`);
  const payload = parseJson(result.stdout, "dialog failure");
  assert(payload.ok === false, "dialog failure should report ok=false");
  assertIncludes(payload.message, "could not open a macOS password dialog", "dialog failure message");
  console.log("[OK] Password helper fails fast when no dialog or terminal is available");
}

function safeRead(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  const tmp = mkdtempSync(join(tmpdir(), "lan-dual-password-prompt-"));
  try {
    makeFakeOsascript(tmp);
    checkDialogSuccess(tmp, args.timeoutMs);
    checkDialogCancel(tmp, args.timeoutMs);
    checkDialogFailureNoTty(tmp, args.timeoutMs);
    console.log("[OK] Mac password prompt helper checks passed");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
}
