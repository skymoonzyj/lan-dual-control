import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const defaultTimeoutMs = 120000;

if (isDirectCli() && helpRequested(process.argv)) {
  printHelp();
  process.exit(0);
}

export async function promptPassword({
  title = "LAN Dual Control",
  message = "Enter the Mac host password.",
  prompt = "Password:",
  terminalLabel = "Password: ",
  output = process.stdout,
  timeoutMs = defaultTimeoutMs,
  allowTerminalFallback = process.env.LAN_DUAL_ALLOW_TERMINAL_PASSWORD_PROMPT === "1",
} = {}) {
  playAttentionSound();
  if (!dialogDisabled()) {
    const dialogErrors = [];
    try {
      return await promptWithMacDialog({ title, message, prompt, timeoutMs });
    } catch (error) {
      if (isDialogCancellation(error)) throw error;
      dialogErrors.push(`AppleScript dialog: ${error.message}`);
    }
    if (!nativeDialogDisabled()) {
      try {
        return await promptWithNativeMacDialog({ title, message, prompt, timeoutMs });
      } catch (error) {
        if (isDialogCancellation(error)) throw error;
        dialogErrors.push(`native macOS dialog: ${error.message}`);
      }
    }
    if (allowTerminalFallback && canPromptInTerminal(output)) {
      safeWrite(output, `[WARN] macOS password dialog failed: ${dialogErrors.join("; ")}\n`);
      return promptHiddenInTerminal(terminalLabel, output);
    }
    throw new Error(`${dialogErrors.join("; ")} --promptPassword could not open a frontmost macOS password dialog.`);
  }
  if (allowTerminalFallback && canPromptInTerminal(output)) {
    return promptHiddenInTerminal(terminalLabel, output);
  }
  throw new Error("--promptPassword requires a macOS password dialog. Terminal password input is disabled by default; set LAN_DUAL_ALLOW_TERMINAL_PASSWORD_PROMPT=1 only for local manual fallback.");
}

export function playAttentionSound() {
  if (process.env.LAN_DUAL_DISABLE_PASSWORD_BEEP === "1") return;
  const result = spawnSync("osascript", ["-e", "beep"], {
    encoding: "utf8",
    timeout: 3000,
  });
  if (result.status !== 0) {
    process.stderr.write("\x07");
  }
}

function dialogDisabled() {
  return process.env.LAN_DUAL_DISABLE_PASSWORD_DIALOG === "1";
}

function nativeDialogDisabled() {
  return process.env.LAN_DUAL_DISABLE_NATIVE_PASSWORD_DIALOG === "1";
}

function canPromptInTerminal(output) {
  return Boolean(process.stdin.isTTY && output?.isTTY);
}

function promptWithNativeMacDialog({ title, message, prompt, timeoutMs }) {
  const script = `
import AppKit
import Foundation

let environment = ProcessInfo.processInfo.environment
let dialogTitle = environment["LAN_DUAL_PASSWORD_PROMPT_TITLE"] ?? "LAN Dual Control"
let dialogMessage = environment["LAN_DUAL_PASSWORD_PROMPT_MESSAGE"] ?? "Enter the Mac host password."
let promptLabel = environment["LAN_DUAL_PASSWORD_PROMPT_LABEL"] ?? "Password:"

let app = NSApplication.shared
app.setActivationPolicy(.regular)
app.activate(ignoringOtherApps: true)

let width = CGFloat(380)
let label = NSTextField(labelWithString: promptLabel)
label.lineBreakMode = .byWordWrapping
let secureField = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: width, height: 24))
secureField.placeholderString = promptLabel
secureField.usesSingleLineMode = true

let stack = NSStackView(frame: NSRect(x: 0, y: 0, width: width, height: 58))
stack.orientation = .vertical
stack.alignment = .leading
stack.spacing = 8
stack.addArrangedSubview(label)
stack.addArrangedSubview(secureField)
secureField.widthAnchor.constraint(equalToConstant: width).isActive = true

let alert = NSAlert()
alert.messageText = dialogTitle
alert.informativeText = dialogMessage
alert.alertStyle = .informational
alert.accessoryView = stack
alert.addButton(withTitle: "Continue")
alert.addButton(withTitle: "Cancel")

let window = alert.window
window.title = dialogTitle
window.level = .floating
window.collectionBehavior.insert(.canJoinAllSpaces)
window.collectionBehavior.insert(.fullScreenAuxiliary)
window.center()

NSRunningApplication.current.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
app.activate(ignoringOtherApps: true)
window.makeKeyAndOrderFront(nil)
window.orderFrontRegardless()

DispatchQueue.main.async {
  NSRunningApplication.current.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
  app.activate(ignoringOtherApps: true)
  window.makeKeyAndOrderFront(nil)
  window.orderFrontRegardless()
  window.makeFirstResponder(secureField)
}

let response = alert.runModal()
if response == .alertFirstButtonReturn {
  let password = secureField.stringValue
  FileHandle.standardOutput.write((password + "\\n").data(using: .utf8)!)
  exit(0)
}

FileHandle.standardError.write("Password prompt cancelled.\\n".data(using: .utf8)!)
exit(1)
`;

  return new Promise((resolvePrompt, rejectPrompt) => {
    const child = spawn("swift", ["-"], {
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD_PROMPT_TITLE: title,
        LAN_DUAL_PASSWORD_PROMPT_MESSAGE: message,
        LAN_DUAL_PASSWORD_PROMPT_LABEL: prompt,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 1000);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPrompt(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      if (timedOut) {
        rejectPrompt(new Error(`Password prompt timed out after ${timeoutMs}ms.`));
        return;
      }
      if (exitCode !== 0) {
        rejectPrompt(new Error(normalizeDialogError(stderr || stdout || `swift exited ${exitCode}`)));
        return;
      }
      resolvePrompt(String(stdout).replace(/\r?\n$/, ""));
    });
    child.stdin.end(script);
  });
}

function promptWithMacDialog({ title, message, prompt, timeoutMs }) {
  const script = `
on bringPasswordPromptToFront(dialogProcessId)
  try
    tell application "System Events"
      set frontmost of first process whose unix id is dialogProcessId to true
    end tell
  end try
  try
    tell application "SystemUIServer" to activate
  end try
  try
    tell application "Finder" to activate
  end try
  try
    tell application "SystemUIServer" to activate
  end try
end bringPasswordPromptToFront

set dialogTitle to ${appleScriptString(title)}
set dialogMessage to ${appleScriptString(message)}
set promptLabel to ${appleScriptString(prompt)}
set dialogProcessId to (system attribute "pid") as integer
bringPasswordPromptToFront(dialogProcessId)
delay 0.15
bringPasswordPromptToFront(dialogProcessId)
try
  set dialogResult to display dialog (dialogMessage & return & return & promptLabel) default answer "" with title dialogTitle with hidden answer buttons {"Cancel", "Continue"} default button "Continue" cancel button "Cancel"
  set passwordValue to text returned of dialogResult
  return passwordValue
on error number -128
  error "Password prompt cancelled."
end try
`;

  return new Promise((resolvePrompt, rejectPrompt) => {
    const child = spawn("osascript", ["-e", script], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 1000);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPrompt(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      if (timedOut) {
        rejectPrompt(new Error(`Password prompt timed out after ${timeoutMs}ms.`));
        return;
      }
      if (exitCode !== 0) {
        rejectPrompt(new Error(normalizeDialogError(stderr || stdout || `osascript exited ${exitCode}`)));
        return;
      }
      resolvePrompt(String(stdout).replace(/\r?\n$/, ""));
    });
  });
}

function normalizeDialogError(text) {
  const message = String(text || "").trim();
  if (!message) return "Password prompt failed.";
  if (/Password prompt cancelled/i.test(message) || /User canceled/i.test(message) || /-128/.test(message)) {
    return "Password prompt cancelled.";
  }
  return message.replace(/^execution error:\s*/i, "");
}

function isDialogCancellation(error) {
  return /Password prompt cancelled/i.test(String(error?.message || ""));
}

function appleScriptString(value) {
  return `"${String(value ?? "").replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function promptHiddenInTerminal(label, output = process.stdout) {
  if (!canPromptInTerminal(output)) {
    return Promise.reject(new Error("Terminal password fallback requires an interactive terminal."));
  }

  return new Promise((resolvePrompt, rejectPrompt) => {
    const stdin = process.stdin;
    const previousRawMode = stdin.isRaw;
    let value = "";
    let settled = false;

    const cleanup = () => {
      stdin.off("data", onData);
      if (typeof stdin.setRawMode === "function") {
        stdin.setRawMode(Boolean(previousRawMode));
      }
      stdin.pause();
    };
    const finish = (result, error = null) => {
      if (settled) return;
      settled = true;
      cleanup();
      safeWrite(output, "\n");
      if (error) {
        rejectPrompt(error);
      } else {
        resolvePrompt(result);
      }
    };
    const onData = (chunk) => {
      const text = String(chunk);
      for (const char of text) {
        const code = char.charCodeAt(0);
        if (char === "\r" || char === "\n") {
          finish(value);
          return;
        }
        if (code === 3) {
          finish("", new Error("Password prompt cancelled."));
          return;
        }
        if (code === 8 || code === 127) {
          value = value.slice(0, -1);
          continue;
        }
        if (code >= 32) {
          value += char;
        }
      }
    };

    safeWrite(output, label);
    stdin.resume();
    stdin.setEncoding("utf8");
    if (typeof stdin.setRawMode === "function") {
      stdin.setRawMode(true);
    }
    stdin.on("data", onData);
  });
}

function safeWrite(output, text) {
  if (output && typeof output.write === "function") {
    output.write(text);
  }
}

function isDirectCli() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/password-prompt.mjs --help

Shared helper used by Mac scripts that need a password prompt.

Behavior:
  - Rings before asking for a password.
  - Opens a frontmost macOS hidden password dialog for --promptPassword callers.
  - Falls back to a native AppKit frontmost hidden dialog only if the system dialog cannot open.
  - Does not fall back to terminal input unless explicitly allowed for local manual fallback.
  - Never prints the password.

Environment:
  LAN_DUAL_DISABLE_PASSWORD_BEEP=1             Disable the attention sound.
  LAN_DUAL_DISABLE_PASSWORD_DIALOG=1           Disable macOS dialog for tests.
  LAN_DUAL_DISABLE_NATIVE_PASSWORD_DIALOG=1    Disable the native AppKit dialog for tests.
  LAN_DUAL_ALLOW_TERMINAL_PASSWORD_PROMPT=1    Allow hidden terminal fallback if the dialog fails.
`);
}
