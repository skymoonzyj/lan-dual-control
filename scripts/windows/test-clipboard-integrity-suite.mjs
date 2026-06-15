import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const defaults = {
  timeoutMs: 45000,
  json: false,
  boardSummary: false,
  verbose: false,
  help: false,
};

const checks = [
  {
    id: "windows-clipboard-bridge",
    label: "Windows clipboard bridge integrity",
    args: ["scripts/windows/test-windows-clipboard-bridge.mjs"],
  },
  {
    id: "windows-host-clipboard-security",
    label: "Windows host clipboard WebSocket security",
    args: ["scripts/windows/test-windows-host-clipboard-security.mjs", "--timeoutMs", "15000"],
  },
  {
    id: "mac-host-clipboard-integrity",
    label: "Mac host clipboard source integrity",
    args: ["scripts/mac/test-mac-host-clipboard-file-integrity.mjs"],
  },
];

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-clipboard-integrity-suite.mjs [options]

Options:
  --timeoutMs <ms>   Per child check timeout. Default: ${defaults.timeoutMs}
  --json             Print machine-readable JSON summary
  --boardSummary     Print one secret-free Agent Link Board summary line
  --verbose          Print full child stdout/stderr on success
  --help, -h         Show this help without running checks

Description:
  Runs the cross-end file clipboard integrity review suite from a Windows
  review machine. It chains existing focused checks for:
    - Windows host clipboard bridge module guards
    - Windows host real WebSocket clipboard abuse cases
    - Mac host Swift source clipboard receive integrity guards

  The suite does not require formal passwords, does not send input, and does
  not execute inject paths. The Windows service check starts a temporary local
  in-process host and uses its own test password.
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
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--boardSummary") {
      args.boardSummary = true;
      continue;
    }
    if (token === "--verbose") {
      args.verbose = true;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(5000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function shouldPrint(args) {
  return !args.json && !args.boardSummary;
}

function print(kind, text, args) {
  if (!shouldPrint(args)) return;
  console.log(`[${kind}] ${text}`);
}

function splitLines(text) {
  return String(text || "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function summarizeOutput(text) {
  const lines = splitLines(text);
  const okLine = [...lines].reverse().find((line) => line.startsWith("[OK]"));
  return okLine || lines.at(-1) || "";
}

function compactText(value, maxLength = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function runCheck(check, args) {
  const startedAt = Date.now();
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, check.args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolveRun({
        id: check.id,
        label: check.label,
        command: [process.execPath, ...check.args].join(" "),
        elapsedMs: Date.now() - startedAt,
        ...result,
      });
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({
        ok: false,
        timedOut: true,
        exitCode: null,
        stdout,
        stderr,
        summary: `${check.label} timed out after ${args.timeoutMs} ms`,
      });
    }, args.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        ok: false,
        timedOut: false,
        exitCode: null,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
        summary: error.message,
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const output = `${stdout}\n${stderr}`;
      finish({
        ok: exitCode === 0,
        timedOut: false,
        exitCode,
        stdout,
        stderr,
        summary: summarizeOutput(output),
      });
    });
  });
}

function makeBoardSummary(summary) {
  const state = summary.ok ? "passed" : "failed";
  const failed = summary.results.filter((result) => !result.ok);
  const failedText = failed.length > 0
    ? ` Failed: ${failed.map((result) => result.id).join(", ")}.`
    : "";
  return `Clipboard integrity suite ${state}: checks=${summary.passed}/${summary.total}; Windows module=${resultState(summary, "windows-clipboard-bridge")}, Windows service=${resultState(summary, "windows-host-clipboard-security")}, Mac source=${resultState(summary, "mac-host-clipboard-integrity")}.${failedText} No formal passwords, no inject.`;
}

function resultState(summary, id) {
  const result = summary.results.find((item) => item.id === id);
  if (!result) return "missing";
  return result.ok ? "ok" : "failed";
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const results = [];
  for (const check of checks) {
    print("INFO", `Running ${check.label}`, args);
    const result = await runCheck(check, args);
    results.push(result);
    if (result.ok) {
      print("OK", `${check.label}: ${result.summary || "passed"}`, args);
      if (args.verbose && shouldPrint(args)) {
        process.stdout.write(result.stdout);
        process.stderr.write(result.stderr);
      }
    } else {
      print("ERROR", `${check.label}: ${result.summary || `exit ${result.exitCode}`}`, args);
      if (shouldPrint(args)) {
        process.stdout.write(result.stdout);
        process.stderr.write(result.stderr);
      }
    }
  }

  const summary = {
    ok: results.every((result) => result.ok),
    total: results.length,
    passed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results: results.map((result) => ({
      id: result.id,
      label: result.label,
      ok: result.ok,
      timedOut: result.timedOut,
      exitCode: result.exitCode,
      elapsedMs: result.elapsedMs,
      summary: result.summary,
      command: result.command,
      stdout: args.verbose ? result.stdout : compactText(result.stdout),
      stderr: args.verbose ? result.stderr : compactText(result.stderr),
    })),
  };
  summary.boardSummary = makeBoardSummary(summary);

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else if (args.boardSummary) {
    console.log(summary.boardSummary);
  } else {
    print(
      summary.ok ? "OK" : "ERROR",
      summary.ok
        ? `Clipboard integrity suite passed: ${summary.passed}/${summary.total} checks`
        : `Clipboard integrity suite failed: ${summary.failed}/${summary.total} checks failed`,
      args,
    );
  }

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
