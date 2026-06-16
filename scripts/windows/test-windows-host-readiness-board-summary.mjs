import { spawn } from "node:child_process";
import http from "node:http";
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

async function withMockLinkBoard(callback, stateOverrides = {}) {
  const state = {
    currentCall: null,
    statuses: {},
    events: [],
    ...stateOverrides,
  };
  const server = http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/api/state") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(state));
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "not found" }));
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

function macCallForWindows() {
  return {
    status: "CALLING",
    from: "Mac Codex",
    need: "Windows Codex",
    goal: "正式 Windows host 验收",
    connection: "Windows host /discovery",
    command: "node scripts/windows/start-windows-host.mjs --status --json",
    expected: "Windows confirms host readiness before Mac runs formal smoke.",
    ask: "请 Windows 先只读确认 status。",
  };
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
  assert(help.stdout.includes("--checkBoard"), "readiness --help does not mention --checkBoard");
  assert(help.stdout.includes("--server"), "readiness --help does not mention --server");
  assert(help.stdout.includes("--probeMedia"), "readiness --help does not mention --probeMedia");
  assert(help.stdout.includes("--probeClipboardSecurity"), "readiness --help does not mention --probeClipboardSecurity");
  assert(help.stdout.includes("--probeWgcH264Sources"), "readiness --help does not mention --probeWgcH264Sources");

  let jsonRun = null;
  let boardRun = null;
  await withMockLinkBoard(async (serverUrl) => {
    jsonRun = await runNode(
      "readiness JSON board summary",
      [
        readinessScript,
        "--json",
        "--checkBoard",
        "--server",
        serverUrl,
        "--timeoutMs",
        String(args.readinessTimeoutMs),
      ],
      args.timeoutMs,
    );
    boardRun = await runNode(
      "readiness board summary",
      [
        readinessScript,
        "--boardSummary",
        "--checkBoard",
        "--server",
        serverUrl,
        "--timeoutMs",
        String(args.readinessTimeoutMs),
      ],
      args.timeoutMs,
    );
  }, {
    currentCall: macCallForWindows(),
  });
  results.push(jsonRun);
  assert(!jsonRun.timedOut, "readiness --json timed out");
  const jsonSummary = parseJson(jsonRun.stdout, "readiness --json");
  assert(typeof jsonSummary.boardSummary === "string" && jsonSummary.boardSummary.length > 0, "JSON boardSummary is missing");
  assert(jsonSummary.boardSummary.includes("Windows readiness"), "JSON boardSummary has unexpected text");
  assert(jsonSummary.boardSummary.includes("Do not send passwords"), "JSON boardSummary is missing board safety reminder");
  assert(Array.isArray(jsonSummary.macClientReadinessCommands), "JSON macClientReadinessCommands must be an array");
  assert(Array.isArray(jsonSummary.results), "JSON results must be an array");
  assert(jsonSummary.args?.probeWgcH264Sources === false, "default JSON should keep WGC H.264 source probe disabled");
  assert(jsonSummary.args?.checkBoard === true, "JSON args should record checkBoard");
  assert(jsonSummary.board?.ok === true, "JSON board snapshot should be ok");
  assert(jsonSummary.board?.currentCall?.active === true, "JSON board currentCall should be active");
  assert(jsonSummary.board?.currentCall?.needsWindows === true, "JSON board currentCall should need Windows");
  assert(jsonSummary.boardSummary.includes("call=CALLING Mac Codex->Windows Codex"), "JSON boardSummary should include active currentCall");
  assert(!jsonSummary.boardSummary.includes("--status --json"), "JSON boardSummary should not echo call command");
  assert(jsonSummary.results.some((result) => result.label === "Windows host runtime"), "JSON results missing runtime check");
  const runtimeResult = jsonSummary.results.find((result) => result.label === "Windows host runtime");
  if (runtimeResult?.summary?.includes("screen=")) {
    assert(runtimeResult.summary.includes("reverse="), `runtime summary missing reverse-control policy: ${runtimeResult.summary}`);
  }
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

  const mediaRun = await runNode(
    "readiness media aggregate probe",
    [
      readinessScript,
      "--json",
      "--probeMedia",
      "--timeoutMs",
      String(args.readinessTimeoutMs),
    ],
    args.timeoutMs,
  );
  results.push(mediaRun);
  assert(!mediaRun.timedOut, "readiness --probeMedia --json timed out");
  const mediaSummary = parseJson(mediaRun.stdout, "readiness --probeMedia --json");
  assert(mediaSummary.args?.probeMedia === true, "media aggregate probe flag missing from JSON args");
  const mediaResult = mediaSummary.results?.find((result) => result.label === "Windows host media aggregate");
  assert(mediaResult, "JSON results missing Windows host media aggregate check");
  assert(mediaSummary.boardSummary.includes("media="), "media readiness boardSummary should include media status");
  assert(
    /media=(ok|partial|failed)(\(|;|\s|\.)/.test(`${mediaSummary.boardSummary} `),
    `media readiness boardSummary has unexpected media status: ${mediaSummary.boardSummary}`,
  );
  assertNoSecretLeak(mediaRun.stdout, "readiness --probeMedia stdout");
  assertNoSecretLeak(mediaRun.stderr, "readiness --probeMedia stderr");

  results.push(boardRun);
  assert(!boardRun.timedOut, "readiness --boardSummary timed out");
  const lines = boardRun.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert(lines.length === 1, `readiness --boardSummary should print one line, got ${lines.length}`);
  assert(lines[0].includes("Windows readiness"), "board summary has unexpected text");
  assert(lines[0].includes("call=CALLING Mac Codex->Windows Codex"), "board summary is missing active currentCall");
  assert(!lines[0].includes("--status --json"), "board summary should not echo call command");
  assert(lines[0].includes("media=not-checked"), "board summary should show media=not-checked by default");
  assert(lines[0].includes("Do not send passwords"), "board summary is missing board safety reminder");
  assert(!/\[(INFO|OK|WARN|ERROR|FAIL)\]/.test(lines[0]), "board summary should be plain one-line text");
  assertNoSecretLeak(boardRun.stdout, "readiness --boardSummary stdout");
  assertNoSecretLeak(boardRun.stderr, "readiness --boardSummary stderr");

  const summary = {
    ok: true,
    readinessJsonExitCode: jsonRun.exitCode,
    readinessClipboardProbeExitCode: clipboardRun.exitCode,
    readinessMediaProbeExitCode: mediaRun.exitCode,
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
