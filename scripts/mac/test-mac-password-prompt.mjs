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
    appendFileSync(log, \`beep\\n\${joined.includes("beep 2") ? "beep-twice\\n" : ""}\`);
  } else if (joined.includes("targetPid")) {
    appendFileSync(log, \`fronting\\n\${joined.includes("System Events") ? "system-events\\n" : ""}\${joined.includes("frontmost of first process") ? "frontmost-process\\n" : ""}\`);
  } else {
    appendFileSync(log, \`dialog\\n\${joined.includes("SystemUIServer") ? "system-ui-server\\n" : ""}\${joined.includes("System Events") ? "system-events\\n" : ""}\${joined.includes("frontmost of first process") ? "frontmost-process\\n" : ""}\${joined.includes("display dialog") ? "display-dialog\\n" : ""}\${joined.includes("with hidden answer") ? "hidden-answer\\n" : ""}\${joined.includes("with icon caution") ? "caution-icon\\n" : ""}\${joined.includes("activate") ? "activate\\n" : ""}\`);
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
    appendFileSync(log, \`swift\\n\${source.includes("NSApplication.shared") ? "appkit\\n" : ""}\${source.includes("import CoreGraphics") ? "core-graphics\\n" : ""}\${source.includes("requestUserAttention(.criticalRequest)") ? "critical-attention\\n" : ""}\${source.includes("alert.alertStyle = .warning") ? "warning-alert\\n" : ""}\${source.includes("CGWindowLevelForKey(.screenSaverWindow)") ? "screen-saver-level\\n" : ""}\${source.includes("window.level = promptWindowLevel") ? "prompt-window-level\\n" : ""}\${source.includes(".canJoinAllSpaces") ? "all-spaces\\n" : ""}\${source.includes(".transient") ? "transient\\n" : ""}\${source.includes("window.deminiaturize") ? "deminiaturize\\n" : ""}\${source.includes("orderFrontRegardless") ? "order-front\\n" : ""}\${source.includes("makeKey()") ? "make-key\\n" : ""}\${source.includes("makeMain()") ? "unsafe-make-main\\n" : ""}\${source.includes("makeFirstResponder") ? "first-responder\\n" : ""}\${source.includes("becomeFirstResponder") ? "become-first-responder\\n" : ""}\${source.includes("0.15") ? "refocus-015\\n" : ""}\${source.includes("0.35") ? "refocus-035\\n" : ""}\${source.includes("1.50") ? "refocus-150\\n" : ""}\${source.includes("3.00") ? "refocus-300\\n" : ""}\${source.includes("activate(ignoringOtherApps: true)") && source.includes(".activateIgnoringOtherApps") ? "ignore-other-apps\\n" : ""}\${source.includes("unhide") ? "unhide\\n" : ""}\`);
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

function checkSystemDialogSuccess(tmp, timeoutMs) {
  const osascriptLogPath = join(tmp, "osascript-success.log");
  const swiftLogPath = join(tmp, "swift-success.log");
  const secret = "fake-secret-from-system";
  const result = runPromptSnippet({
    PATH: `${tmp}:${process.env.PATH}`,
    FAKE_OSASCRIPT_LOG: osascriptLogPath,
    FAKE_SWIFT_LOG: swiftLogPath,
    FAKE_OSASCRIPT_PASSWORD: secret,
  }, timeoutMs);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert(result.status === 0, `system dialog success should exit 0.\n${output}`);
  const payload = parseJson(result.stdout, "system dialog success");
  assert(payload.ok === true, "system dialog success should report ok=true");
  assert(payload.length === secret.length, "system dialog success should return the fake password length");
  assert(payload.sha256 === createHash("sha256").update(secret).digest("hex"), "system dialog success should return the fake password hash");
  assertNotIncludes(output, secret, "system dialog success output");
  const osascriptLog = safeRead(osascriptLogPath);
  const swiftLog = safeRead(swiftLogPath);
  assertIncludes(output, "[ACTION] Password required", "system dialog success output");
  assertIncludes(output, "look for the macOS password pop-up", "system dialog success output");
  assertIncludes(osascriptLog, "beep", "system dialog success osascript log");
  assertIncludes(osascriptLog, "beep-twice", "system dialog success osascript log");
  assertIncludes(osascriptLog, "dialog", "system dialog success osascript log");
  assertIncludes(osascriptLog, "system-ui-server", "system dialog success osascript log");
  assertIncludes(osascriptLog, "system-events", "system dialog success osascript log");
  assertIncludes(osascriptLog, "frontmost-process", "system dialog success osascript log");
  assertIncludes(osascriptLog, "display-dialog", "system dialog success osascript log");
  assertIncludes(osascriptLog, "hidden-answer", "system dialog success osascript log");
  assertIncludes(osascriptLog, "caution-icon", "system dialog success osascript log");
  assertNotIncludes(swiftLog, "swift", "system dialog success should not need native fallback");
  console.log("[OK] Password helper rings and reads the visible system hidden dialog value");
}

function checkPreferNativeDialogSuccess(tmp, timeoutMs) {
  const osascriptLogPath = join(tmp, "osascript-prefer-native.log");
  const swiftLogPath = join(tmp, "swift-prefer-native.log");
  const secret = "fake-secret-from-native";
  const result = runPromptSnippet({
    PATH: `${tmp}:${process.env.PATH}`,
    LAN_DUAL_PREFER_NATIVE_PASSWORD_DIALOG: "1",
    FAKE_OSASCRIPT_LOG: osascriptLogPath,
    FAKE_SWIFT_LOG: swiftLogPath,
    FAKE_SWIFT_PASSWORD: secret,
  }, timeoutMs);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert(result.status === 0, `prefer native dialog success should exit 0.\n${output}`);
  const payload = parseJson(result.stdout, "prefer native dialog success");
  assert(payload.ok === true, "prefer native dialog success should report ok=true");
  assert(payload.length === secret.length, "prefer native dialog success should return the fake password length");
  assert(payload.sha256 === createHash("sha256").update(secret).digest("hex"), "prefer native dialog success should return the fake password hash");
  assertNotIncludes(output, secret, "prefer native dialog success output");
  const osascriptLog = safeRead(osascriptLogPath);
  const swiftLog = safeRead(swiftLogPath);
  assertIncludes(output, "[ACTION] Password required", "prefer native dialog success output");
  assertIncludes(osascriptLog, "beep", "prefer native dialog success osascript log");
  assertIncludes(osascriptLog, "beep-twice", "prefer native dialog success osascript log");
  assertIncludes(osascriptLog, "fronting", "prefer native dialog success osascript log");
  assertNotIncludes(osascriptLog, "dialog", "prefer native dialog success should not use AppleScript dialog first");
  assertIncludes(swiftLog, "swift", "native dialog success native log");
  assertIncludes(swiftLog, "appkit", "native dialog success native log");
  assertIncludes(swiftLog, "core-graphics", "native dialog success native log");
  assertIncludes(swiftLog, "critical-attention", "native dialog success native log");
  assertIncludes(swiftLog, "warning-alert", "native dialog success native log");
  assertIncludes(swiftLog, "screen-saver-level", "native dialog success native log");
  assertIncludes(swiftLog, "prompt-window-level", "native dialog success native log");
  assertIncludes(swiftLog, "all-spaces", "native dialog success native log");
  assertIncludes(swiftLog, "transient", "native dialog success native log");
  assertIncludes(swiftLog, "deminiaturize", "native dialog success native log");
  assertIncludes(swiftLog, "order-front", "native dialog success native log");
  assertIncludes(swiftLog, "make-key", "native dialog success native log");
  assertNotIncludes(swiftLog, "unsafe-make-main", "native dialog success native log");
  assertIncludes(swiftLog, "first-responder", "native dialog success native log");
  assertIncludes(swiftLog, "become-first-responder", "native dialog success native log");
  assertIncludes(swiftLog, "refocus-015", "native dialog success native log");
  assertIncludes(swiftLog, "refocus-035", "native dialog success native log");
  assertIncludes(swiftLog, "refocus-150", "native dialog success native log");
  assertIncludes(swiftLog, "refocus-300", "native dialog success native log");
  assertIncludes(swiftLog, "ignore-other-apps", "native dialog success native log");
  assertIncludes(swiftLog, "unhide", "native dialog success native log");
  console.log("[OK] Password helper can still use the frontmost native hidden dialog when requested");
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
  assertIncludes(safeRead(join(tmp, "osascript-cancel.log")), "dialog", "dialog cancel should use system dialog first");
  assertNotIncludes(safeRead(join(tmp, "swift-cancel.log")), "swift", "dialog cancel should not fall back after cancellation");
  console.log("[OK] Password helper reports dialog cancellation cleanly");
}

function checkSystemFailureFallsBackToNative(tmp, timeoutMs) {
  const swiftLogPath = join(tmp, "swift-fallback.log");
  const osascriptLogPath = join(tmp, "osascript-fallback.log");
  const secret = "fake-secret-from-native-fallback";
  const result = runPromptSnippet({
    PATH: `${tmp}:${process.env.PATH}`,
    FAKE_OSASCRIPT_MODE: "fail",
    FAKE_SWIFT_PASSWORD: secret,
    FAKE_SWIFT_LOG: swiftLogPath,
    FAKE_OSASCRIPT_LOG: osascriptLogPath,
  }, timeoutMs);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert(result.status === 0, `system failure should fall back to native dialog.\n${output}`);
  const payload = parseJson(result.stdout, "system failure fallback");
  assert(payload.ok === true, "system failure fallback should report ok=true");
  assert(payload.length === secret.length, "system failure fallback should return the fallback password length");
  assert(payload.sha256 === createHash("sha256").update(secret).digest("hex"), "system failure fallback should return the fallback password hash");
  assertNotIncludes(output, secret, "system failure fallback output");
  const osascriptLog = safeRead(osascriptLogPath);
  const swiftLog = safeRead(swiftLogPath);
  assertIncludes(osascriptLog, "dialog", "system failure fallback osascript log");
  assertIncludes(swiftLog, "swift", "system failure fallback native log");
  assertIncludes(swiftLog, "appkit", "system failure fallback native log");
  console.log("[OK] Password helper falls back to native AppKit only when the system dialog cannot open");
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
    checkSystemDialogSuccess(tmp, args.timeoutMs);
    checkPreferNativeDialogSuccess(tmp, args.timeoutMs);
    checkDialogCancel(tmp, args.timeoutMs);
    checkSystemFailureFallsBackToNative(tmp, args.timeoutMs);
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
