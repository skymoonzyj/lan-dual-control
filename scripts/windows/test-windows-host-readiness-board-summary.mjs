import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const readinessScript = resolve(scriptDir, "check-windows-host-readiness.mjs");

const defaults = {
  timeoutMs: 90000,
  readinessTimeoutMs: 8000,
  json: false,
  help: false,
};

function printHelp() {
  console.log(`Usage: node scripts/windows/test-windows-host-readiness-board-summary.mjs [options]

Options:
  --timeoutMs <ms>           Overall timeout for each child run. Default: ${defaults.timeoutMs}
  --readinessTimeoutMs <ms>  Timeout passed into readiness checks. Default: ${defaults.readinessTimeoutMs}
  --json                    Print machine-readable JSON summary.
  --help, -h                Show this help without running checks.

Description:
  Verifies check-windows-host-readiness exposes a secret-free boardSummary in
  both --json and --boardSummary modes. The check is shape-focused: readiness
  itself may pass or fail depending on the local host state, but the summary
  must remain parseable and safe to paste into Agent Link Board.
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
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(10000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    if (token === "--readinessTimeoutMs" && next && !next.startsWith("--")) {
      args.readinessTimeoutMs = Math.max(3000, Number(next) || defaults.readinessTimeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function runNode(label, args, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolveRun({
        label,
        durationMs: Date.now() - startedAt,
        ...result,
      });
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({
        exitCode: null,
        timedOut: true,
        stdout,
        stderr,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        exitCode: null,
        timedOut: false,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      finish({
        exitCode,
        timedOut: false,
        stdout,
        stderr,
      });
    });
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNoSecretLeak(text, label) {
  const value = String(text || "");
  const forbidden = [
    /demo-password/i,
    /LAN_DUAL_PASSWORD\s*=/i,
    /--password\s+\S+/i,
    /"password"\s*:/i,
  ];
  const matched = forbidden.find((pattern) => pattern.test(value));
  assert(!matched, `${label} contains a password-shaped token: ${matched}`);
}

function parseJson(text, label) {
  try {
    return JSON.parse(String(text || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const results = [];

  const help = await runNode("readiness help", [readinessScript, "--help"], args.timeoutMs);
  results.push(help);
  assert(!help.timedOut, "readiness --help timed out");
  assert(help.exitCode === 0, `readiness --help exited ${help.exitCode}`);
  assert(help.stdout.includes("--boardSummary"), "readiness --help does not mention --boardSummary");
  assert(help.stdout.includes("--probeClipboardSecurity"), "readiness --help does not mention --probeClipboardSecurity");
  assert(help.stdout.includes("--probeWgcH264Sources"), "readiness --help does not mention --probeWgcH264Sources");

  const jsonRun = await runNode(
    "readiness JSON board summary",
    [readinessScript, "--json", "--timeoutMs", String(args.readinessTimeoutMs)],
    args.timeoutMs,
  );
  results.push(jsonRun);
  assert(!jsonRun.timedOut, "readiness --json timed out");
  const jsonSummary = parseJson(jsonRun.stdout, "readiness --json");
  assert(typeof jsonSummary.boardSummary === "string" && jsonSummary.boardSummary.length > 0, "JSON boardSummary is missing");
  assert(jsonSummary.boardSummary.includes("Windows readiness"), "JSON boardSummary has unexpected text");
  assert(jsonSummary.boardSummary.includes("Do not send passwords"), "JSON boardSummary is missing board safety reminder");
  assert(Array.isArray(jsonSummary.macClientReadinessCommands), "JSON macClientReadinessCommands must be an array");
  assert(Array.isArray(jsonSummary.results), "JSON results must be an array");
  assert(jsonSummary.args?.probeWgcH264Sources === false, "default JSON should keep WGC H.264 source probe disabled");
  assert(jsonSummary.results.some((result) => result.label === "Windows host runtime"), "JSON results missing runtime check");
  assertNoSecretLeak(jsonRun.stdout, "readiness --json stdout");
  assertNoSecretLeak(jsonRun.stderr, "readiness --json stderr");

  const clipboardRun = await runNode(
    "readiness clipboard security probe",
    [
      readinessScript,
      "--json",
      "--probeClipboardSecurity",
      "--timeoutMs",
      String(Math.max(args.readinessTimeoutMs, 12000)),
    ],
    args.timeoutMs,
  );
  results.push(clipboardRun);
  assert(!clipboardRun.timedOut, "readiness --probeClipboardSecurity --json timed out");
  const clipboardSummary = parseJson(clipboardRun.stdout, "readiness --probeClipboardSecurity --json");
  assert(clipboardSummary.args?.probeClipboardSecurity === true, "clipboard security probe flag missing from JSON args");
  assert(
    clipboardSummary.results?.some((result) => result.label === "Windows host clipboard security"),
    "JSON results missing clipboard security check",
  );
  assertNoSecretLeak(clipboardRun.stdout, "readiness --probeClipboardSecurity stdout");
  assertNoSecretLeak(clipboardRun.stderr, "readiness --probeClipboardSecurity stderr");

  const boardRun = await runNode(
    "readiness board summary",
    [readinessScript, "--boardSummary", "--timeoutMs", String(args.readinessTimeoutMs)],
    args.timeoutMs,
  );
  results.push(boardRun);
  assert(!boardRun.timedOut, "readiness --boardSummary timed out");
  const lines = boardRun.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert(lines.length === 1, `readiness --boardSummary should print one line, got ${lines.length}`);
  assert(lines[0].includes("Windows readiness"), "board summary has unexpected text");
  assert(lines[0].includes("Do not send passwords"), "board summary is missing board safety reminder");
  assert(!/\[(INFO|OK|WARN|ERROR|FAIL)\]/.test(lines[0]), "board summary should be plain one-line text");
  assertNoSecretLeak(boardRun.stdout, "readiness --boardSummary stdout");
  assertNoSecretLeak(boardRun.stderr, "readiness --boardSummary stderr");

  const summary = {
    ok: true,
    readinessJsonExitCode: jsonRun.exitCode,
    readinessClipboardProbeExitCode: clipboardRun.exitCode,
    readinessBoardSummaryExitCode: boardRun.exitCode,
    boardSummary: lines[0],
    results: results.map((result) => ({
      label: result.label,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
    })),
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`[OK] Windows readiness board summary check passed: ${lines[0]}`);
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
