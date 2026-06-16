#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/check-mac-host-readiness.mjs";

const defaults = {
  timeoutMs: 45000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-host-readiness-board.mjs [options]

Verifies check-mac-host-readiness Agent Link Board currentCall reporting.
The test uses a local fake board and does not start real hosts, authenticate,
prompt for passwords, or execute input injection.

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks
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
      args.timeoutMs = Math.max(5000, Number(next) || defaults.timeoutMs);
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

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function run(extraArgs, args) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
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

function assertNoSecretLikeText(text, label) {
  const value = String(text || "");
  assert(!value.includes("super-secret-readiness-board"), `${label} leaked secret-like server text`);
  assert(!value.includes("super-secret-command-token"), `${label} leaked secret-like command text`);
}

function waitForPort(child, getStdout, getStderr) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const match = getStdout().match(/(\d+)/);
      if (match) {
        clearInterval(timer);
        resolve(Number(match[1]));
        return;
      }
      if (child.exitCode !== null) {
        clearInterval(timer);
        reject(new Error(`fake board exited early\n${getStdout()}\n${getStderr()}`));
        return;
      }
      if (Date.now() - started > 5000) {
        clearInterval(timer);
        reject(new Error(`fake board did not start\n${getStdout()}\n${getStderr()}`));
      }
    }, 25);
  });
}

async function withFakeBoard(currentCall, callback) {
  const dir = mkdtempSync(path.join(tmpdir(), "lan-dual-mac-readiness-board-"));
  const scriptPath = path.join(dir, "fake-board.mjs");
  const state = {
    currentCall,
    statuses: {},
    events: [],
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(scriptPath, `
import http from "node:http";
const state = ${JSON.stringify(state)};
const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/api/state") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(state));
    return;
  }
  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ ok: false, error: "not found" }));
});
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  console.log(address.port);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
`, "utf8");
  const child = spawn(process.execPath, [scriptPath], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  try {
    const port = await waitForPort(child, () => stdout, () => stderr);
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      child.once("exit", resolve);
      setTimeout(resolve, 1000);
    });
    rmSync(dir, { recursive: true, force: true });
  }
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assert(String(result.stdout).includes("Usage:"), `${script} ${flag} should print Usage`);
    assert(String(result.stdout).includes("--checkBoard"), `${script} ${flag} should document --checkBoard`);
    assert(String(result.stdout).includes("--boardSummary"), `${script} ${flag} should document --boardSummary`);
    assert(String(result.stdout).includes("--probeMedia"), `${script} ${flag} should document --probeMedia`);
  }
  print("OK", "Mac host readiness board help exits quickly");
}

function checkDefaultDoesNotReadBoard(args) {
  const result = run(["--json", "--timeoutMs", "5000", "--skipCurrentBuildCheck"], args);
  const payload = parseJson(result.stdout, "default readiness JSON");
  assert(payload.board?.checked === false, "default readiness should not read Agent Link Board");
  assert(String(payload.boardSummary || "").includes("call=not-checked"), "default boardSummary should mark call not checked");
  assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "default readiness JSON");
  print("OK", "Mac host readiness does not read Agent Link Board by default");
}

function checkProbeMediaOfflineJson(args) {
  const result = run([
    "--json",
    "--probeMedia",
    "--probeMediaResourceSample",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "5000",
    "--skipCurrentBuildCheck",
  ], args);
  assert(result.status !== 0, "--probeMedia against an offline host should fail readiness");
  const payload = parseJson(result.stdout, "offline media readiness JSON");
  assert(payload.args?.probeMedia === true, "readiness JSON should preserve probeMedia flag");
  assert(payload.args?.probeMediaResourceSample === true, "readiness JSON should preserve probeMediaResourceSample flag");
  const step = payload.results?.find((item) => item.label === "Mac host media aggregate");
  assert(step, "readiness JSON should include Mac host media aggregate step");
  assert(step.ok === false, "offline Mac host media aggregate should fail");
  assert(String(step.summary || "").includes("Mac media baseline failed"), "media aggregate summary should include board-safe baseline failure text");
  assert(step.details?.summary?.failed >= 1, "media aggregate details should preserve failed count");
  assert(step.details?.resource?.available === false, "offline media aggregate should mark resource unavailable");
  assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "offline probeMedia readiness JSON");
  print("OK", "Mac host readiness probeMedia exposes offline aggregate details safely");
}

function checkProbeMediaResourceSampleImpliesProbeMedia(args) {
  const result = run([
    "--json",
    "--probeMediaResourceSample",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "5000",
    "--skipCurrentBuildCheck",
  ], args);
  assert(result.status !== 0, "--probeMediaResourceSample against an offline host should run media aggregate and fail readiness");
  const payload = parseJson(result.stdout, "resource-sample implied media readiness JSON");
  assert(payload.args?.probeMedia === true, "--probeMediaResourceSample should imply probeMedia=true");
  assert(payload.args?.probeMediaResourceSample === true, "readiness JSON should preserve probeMediaResourceSample=true");
  const step = payload.results?.find((item) => item.label === "Mac host media aggregate");
  assert(step, "implied probeMedia should include Mac host media aggregate step");
  assert(step.details?.resource?.available === false, "implied resource sampling should preserve unavailable resource details");
  assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "resource-sample implied media readiness JSON");
  print("OK", "Mac host readiness probeMediaResourceSample implies probeMedia");
}

function checkProbeMediaBoardSummary(args) {
  const result = run([
    "--boardSummary",
    "--probeMedia",
    "--host",
    "127.0.0.1",
    "--port",
    "9",
    "--timeoutMs",
    "5000",
    "--skipCurrentBuildCheck",
  ], args);
  assert(result.status !== 0, "offline --probeMedia boardSummary should fail readiness");
  const lines = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
  assert(lines.length === 1, `offline --probeMedia boardSummary should print one line, got ${lines.length}`);
  assert(lines[0].includes("media=failed("), "offline --probeMedia boardSummary should include failed media status");
  assert(lines[0].includes("Do not send passwords"), "offline --probeMedia boardSummary should keep password safety note");
  assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "offline probeMedia boardSummary");
  print("OK", "Mac host readiness boardSummary includes probeMedia status safely");
}

async function checkActiveBoardCall(args) {
  const call = {
    status: "CALLING",
    goal: "继续正式端到端验收 Mac host",
    from: "Windows Codex",
    need: "Mac Codex",
    connection: "192.168.31.122:43770",
    command: "node scripts/windows/probe-mac-host.mjs --token super-secret-command-token",
  };
  await withFakeBoard(call, async (server) => {
    const result = run([
      "--json",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "5000",
      "--skipCurrentBuildCheck",
    ], args);
    const payload = parseJson(result.stdout, "active board readiness JSON");
    assert(payload.board?.checked === true, "active board JSON should mark board checked");
    assert(payload.board?.ok === true, "active board JSON should mark board ok");
    assert(payload.board?.activeCall === true, "active board JSON should detect active call");
    assert(payload.board?.currentCall?.goal === call.goal, "active board JSON should keep call goal");
    assert(payload.board?.currentCall?.command === call.command, "active board JSON should keep command for automation");
    assert(String(payload.boardSummary || "").includes("call=active"), "boardSummary should mention active call");
    assert(String(payload.boardSummary || "").includes(call.goal), "boardSummary should include call goal");
    assert(!String(payload.boardSummary || "").includes("super-secret-command-token"), "boardSummary should not echo command");
    assert(payload.results.some((item) => item.label === "Agent Link Board currentCall" && item.warnings.some((warning) => warning.includes("active call"))), "active call should create readiness warning");
    assertNoSecretLikeText(payload.boardSummary, "active board summary");
  });
  print("OK", "Mac host readiness surfaces active Agent Link Board currentCall safely");
}

async function checkDoneBoardCall(args) {
  const call = {
    status: "DONE",
    goal: "历史安全注入验收",
    from: "Windows Codex",
    need: "Mac Codex",
    connection: "192.168.31.122:43770",
    command: "completed super-secret-command-token",
  };
  await withFakeBoard(call, async (server) => {
    const result = run([
      "--json",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "5000",
      "--skipCurrentBuildCheck",
    ], args);
    const payload = parseJson(result.stdout, "done board readiness JSON");
    assert(payload.board?.activeCall === false, "DONE board call should not be active");
    assert(String(payload.boardSummary || "").includes("call=done"), "boardSummary should mark done call");
    const boardStep = payload.results.find((item) => item.label === "Agent Link Board currentCall");
    assert(boardStep && boardStep.warnings.length === 0, "DONE call should not create active-call warning");
    assertNoSecretLikeText(payload.boardSummary, "done board summary");
  });
  print("OK", "Mac host readiness treats DONE Agent Link Board currentCall as inactive");
}

async function checkBoardSummary(args) {
  const call = {
    status: "CALLING",
    goal: "Mac host readiness fake board summary",
    from: "Windows Codex",
    need: "Mac Codex",
    command: "super-secret-command-token",
  };
  await withFakeBoard(call, async (server) => {
    const result = run([
      "--boardSummary",
      "--checkBoard",
      "--server",
      server,
      "--host",
      "127.0.0.1",
      "--port",
      "9",
      "--timeoutMs",
      "5000",
      "--skipCurrentBuildCheck",
    ], args);
    assert(result.status === 0 || result.status === 1, "boardSummary should exit normally");
    const lines = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
    assert(lines.length === 1, `boardSummary should print one line, got ${lines.length}`);
    assert(lines[0].includes("Mac host readiness:"), "boardSummary should identify readiness");
    assert(lines[0].includes("call=active"), "boardSummary should mention active call");
    assert(lines[0].includes(call.goal), "boardSummary should include call goal");
    assert(lines[0].includes("Do not send passwords"), "boardSummary should include password safety note");
    assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "readiness boardSummary");
  });
  print("OK", "Mac host readiness boardSummary is one-line and secret-free");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  checkDefaultDoesNotReadBoard(args);
  checkProbeMediaOfflineJson(args);
  checkProbeMediaResourceSampleImpliesProbeMedia(args);
  checkProbeMediaBoardSummary(args);
  await checkActiveBoardCall(args);
  await checkDoneBoardCall(args);
  await checkBoardSummary(args);
  print("OK", "Mac host readiness Agent Link Board self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
