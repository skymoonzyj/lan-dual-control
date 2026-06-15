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

Verifies the shared Mac password prompt helper with fake osascript/swift binaries,
so the test never opens a real system dialog and never uses a real password.
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
if (log) {
  if (joined.includes("beep")) {
    appendFileSync(log, "beep\\n");
  } else if (joined.includes("targetPid")) {
    appendFileSync(log, \`fronting\\n\${joined.includes("System Events") ? "system-events\\n" : ""}\${joined.includes("frontmost of first process") ? "frontmost-process\\n" : ""}\`);
  } else {
    appendFileSync(log, \`dialog\\n\${joined.includes("SystemUIServer") ? "system-ui-server\\n" : ""}\${joined.includes("System Events") ? "system-events\\n" : ""}\${joined.includes("frontmost of first process") ? "frontmost-process\\n" : ""}\${joined.includes("display dialog") ? "display-dialog\\n" : ""}\${joined.includes("with hidden answer") ? "hidden-answer\\n" : ""}\${joined.includes("activate") ? "activate\\n" : ""}\`);
  }
}
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

function makeFakeSwift(dir) {
  const path = join(dir, "swift");
  writeFileSync(path, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
let source = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  source += chunk;
});
process.stdin.on("end", () => {
  const log = process.env.FAKE_SWIFT_LOG;
  if (log) {
    appendFileSync(log, \`swift\\n\${source.includes("NSApplication.shared") ? "appkit\\n" : ""}\${source.includes("requestUserAttention(.criticalRequest)") ? "critical-attention\\n" : ""}\${source.includes("window.level = .modalPanel") ? "modal-panel\\n" : ""}\${source.includes(".canJoinAllSpaces") ? "all-spaces\\n" : ""}\${source.includes("orderFrontRegardless") ? "order-front\\n" : ""}\${source.includes("makeFirstResponder") ? "first-responder\\n" : ""}\${source.includes("asyncAfter(deadline: .now() + 0.25)") ? "refocus-025\\n" : ""}\${source.includes("asyncAfter(deadline: .now() + 0.75)") ? "refocus-075\\n" : ""}\${source.includes("activate(ignoringOtherApps: true)") && source.includes(".activateIgnoringOtherApps") ? "ignore-other-apps\\n" : ""}\`);
  }
  if (process.env.FAKE_SWIFT_MODE === "cancel") {
    console.error("Password prompt cancelled.");
    process.exit(1);
  }
  if (process.env.FAKE_SWIFT_MODE === "fail") {
    console.error("fake native dialog failure");
    process.exit(1);
  }
  process.stdout.write(process.env.FAKE_SWIFT_PASSWORD || "fake-native-password");
});
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

function checkNativeDialogSuccess(tmp, timeoutMs) {
  const osascriptLogPath = join(tmp, "osascript-success.log");
  const swiftLogPath = join(tmp, "swift-success.log");
  const secret = "fake-secret-from-native";
  const result = runPromptSnippet({
    PATH: `${tmp}:${process.env.PATH}`,
    FAKE_OSASCRIPT_LOG: osascriptLogPath,
    FAKE_SWIFT_LOG: swiftLogPath,
    FAKE_SWIFT_PASSWORD: secret,
  }, timeoutMs);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert(result.status === 0, `native dialog success should exit 0.\n${output}`);
  const payload = parseJson(result.stdout, "native dialog success");
  assert(payload.ok === true, "native dialog success should report ok=true");
  assert(payload.length === secret.length, "native dialog success should return the fake password length");
  assert(payload.sha256 === createHash("sha256").update(secret).digest("hex"), "native dialog success should return the fake password hash");
  assertNotIncludes(output, secret, "native dialog success output");
  const osascriptLog = safeRead(osascriptLogPath);
  const swiftLog = safeRead(swiftLogPath);
  assertIncludes(osascriptLog, "beep", "native dialog success osascript log");
  assertIncludes(osascriptLog, "fronting", "native dialog success osascript log");
  assertNotIncludes(osascriptLog, "dialog", "native dialog success should not use AppleScript dialog first");
  assertIncludes(swiftLog, "swift", "native dialog success native log");
  assertIncludes(swiftLog, "appkit", "native dialog success native log");
  assertIncludes(swiftLog, "critical-attention", "native dialog success native log");
  assertIncludes(swiftLog, "modal-panel", "native dialog success native log");
  assertIncludes(swiftLog, "all-spaces", "native dialog success native log");
  assertIncludes(swiftLog, "order-front", "native dialog success native log");
  assertIncludes(swiftLog, "first-responder", "native dialog success native log");
  assertIncludes(swiftLog, "refocus-025", "native dialog success native log");
  assertIncludes(swiftLog, "refocus-075", "native dialog success native log");
  assertIncludes(swiftLog, "ignore-other-apps", "native dialog success native log");
  console.log("[OK] Password helper rings and reads a frontmost native hidden dialog value");
}

function checkDialogCancel(tmp, timeoutMs) {
  const result = runPromptSnippet({
    PATH: `${tmp}:${process.env.PATH}`,
    FAKE_SWIFT_MODE: "cancel",
    FAKE_OSASCRIPT_MODE: "cancel",
    FAKE_OSASCRIPT_LOG: join(tmp, "osascript-cancel.log"),
    FAKE_SWIFT_LOG: join(tmp, "swift-cancel.log"),
  }, timeoutMs);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert(result.status !== 0, `dialog cancel should fail.\n${output}`);
  const payload = parseJson(result.stdout, "dialog cancel");
  assert(payload.ok === false, "dialog cancel should report ok=false");
  assertIncludes(payload.message, "Password prompt cancelled", "dialog cancel message");
  assertIncludes(safeRead(join(tmp, "swift-cancel.log")), "swift", "dialog cancel should use native dialog first");
  assertNotIncludes(safeRead(join(tmp, "osascript-cancel.log")), "dialog", "dialog cancel should not fall back after cancellation");
  console.log("[OK] Password helper reports dialog cancellation cleanly");
}

function checkNativeFailureFallsBackToAppleScript(tmp, timeoutMs) {
  const swiftLogPath = join(tmp, "swift-fallback.log");
  const osascriptLogPath = join(tmp, "osascript-fallback.log");
  const secret = "fake-secret-from-applescript-fallback";
  const result = runPromptSnippet({
    PATH: `${tmp}:${process.env.PATH}`,
    FAKE_SWIFT_MODE: "fail",
    FAKE_SWIFT_LOG: swiftLogPath,
    FAKE_OSASCRIPT_PASSWORD: secret,
    FAKE_OSASCRIPT_LOG: osascriptLogPath,
  }, timeoutMs);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert(result.status === 0, `native failure should fall back to AppleScript.\n${output}`);
  const payload = parseJson(result.stdout, "native failure fallback");
  assert(payload.ok === true, "native failure fallback should report ok=true");
  assert(payload.length === secret.length, "native failure fallback should return the fallback password length");
  assert(payload.sha256 === createHash("sha256").update(secret).digest("hex"), "native failure fallback should return the fallback password hash");
  assertNotIncludes(output, secret, "native failure fallback output");
  const osascriptLog = safeRead(osascriptLogPath);
  const swiftLog = safeRead(swiftLogPath);
  assertIncludes(swiftLog, "swift", "native failure fallback native log");
  assertIncludes(osascriptLog, "dialog", "native failure fallback osascript log");
  assertIncludes(osascriptLog, "system-ui-server", "native failure fallback osascript log");
  assertIncludes(osascriptLog, "system-events", "native failure fallback osascript log");
  assertIncludes(osascriptLog, "frontmost-process", "native failure fallback osascript log");
  assertIncludes(osascriptLog, "display-dialog", "native failure fallback osascript log");
  assertIncludes(osascriptLog, "hidden-answer", "native failure fallback osascript log");
  console.log("[OK] Password helper falls back to system dialog only when native AppKit cannot open");
}

function checkDialogFailureNoTty(tmp, timeoutMs) {
  const result = runPromptSnippet({
    PATH: `${tmp}:${process.env.PATH}`,
    FAKE_SWIFT_MODE: "fail",
    FAKE_OSASCRIPT_MODE: "fail",
  }, timeoutMs);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert(result.status !== 0, `dialog failure should fail without hanging.\n${output}`);
  const payload = parseJson(result.stdout, "dialog failure");
  assert(payload.ok === false, "dialog failure should report ok=false");
  assertIncludes(payload.message, "could not open a frontmost macOS password dialog", "dialog failure message");
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
    makeFakeSwift(tmp);
    checkNativeDialogSuccess(tmp, args.timeoutMs);
    checkDialogCancel(tmp, args.timeoutMs);
    checkNativeFailureFallsBackToAppleScript(tmp, args.timeoutMs);
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
