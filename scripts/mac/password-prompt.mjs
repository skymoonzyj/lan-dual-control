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
} = {}) {
  playAttentionSound();
  if (!dialogDisabled()) {
    try {
      return await promptWithMacDialog({ title, message, prompt, timeoutMs });
    } catch (error) {
      if (!canPromptInTerminal(output)) {
        throw new Error(`${error.message} --promptPassword could not open a macOS password dialog.`);
      }
      safeWrite(output, `[WARN] macOS password dialog failed: ${error.message}\n`);
    }
  }
  return promptHiddenInTerminal(terminalLabel, output);
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

function canPromptInTerminal(output) {
  return Boolean(process.stdin.isTTY && output?.isTTY);
}

function promptWithMacDialog({ title, message, prompt, timeoutMs }) {
  const script = `
set dialogTitle to ${appleScriptString(title)}
set dialogMessage to ${appleScriptString(message)}
set promptLabel to ${appleScriptString(prompt)}
try
  display dialog (dialogMessage & return & return & promptLabel) default answer "" with title dialogTitle with hidden answer buttons {"Cancel", "Continue"} default button "Continue" cancel button "Cancel"
  set passwordValue to text returned of result
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

function appleScriptString(value) {
  return `"${String(value ?? "").replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function promptHiddenInTerminal(label, output = process.stdout) {
  if (!canPromptInTerminal(output)) {
    return Promise.reject(new Error("--promptPassword requires a macOS password dialog or an interactive terminal."));
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
  - Opens a macOS hidden password dialog for --promptPassword callers.
  - Falls back to hidden terminal input only when a terminal is available.
  - Never prints the password.

Environment:
  LAN_DUAL_DISABLE_PASSWORD_BEEP=1      Disable the attention sound.
  LAN_DUAL_DISABLE_PASSWORD_DIALOG=1    Disable macOS dialog fallback for tests.
`);
}
