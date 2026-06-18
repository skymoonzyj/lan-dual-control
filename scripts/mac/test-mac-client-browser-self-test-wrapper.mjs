#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/test-mac-client-browser-self-test.mjs";
const wrapperScript = "scripts/mac/test-mac-client-browser-self-test-wrapper.mjs";

const defaults = {
  timeoutMs: 60000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs [options]

Options:
  --boardSummary  Run the local mock browser self-test and print one safe line.
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
    if (token === "--boardSummary") {
      args.boardSummary = true;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(5000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Argument not allowed: ${token}`);
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

function run(extraArgs, args) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
  });
}

function runWrapper(extraArgs, args) {
  return spawnSync(process.execPath, [wrapperScript, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
  });
}

function assertSingleLine(text, label) {
  const trimmed = String(text || "").trim();
  assert(trimmed.length > 0, `${label} should not be empty`);
  assert(!trimmed.includes("\n"), `${label} should be a single line.\n${text}`);
  return trimmed;
}

function occupyPortIfAvailable(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => {
      resolve(null);
    });
    server.listen(port, host, () => {
      resolve(server);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = runWrapper([flag], args);
    assert(result.status === 0, `${wrapperScript} ${flag} should exit 0`);
    assertIncludes(result.stdout, "Usage:", `${wrapperScript} ${flag}`);
    assertIncludes(result.stdout, "--boardSummary", `${wrapperScript} ${flag}`);
    assertIncludes(result.stdout, "one safe line", `${wrapperScript} ${flag}`);
    assertNotIncludes(result.stdout, "password:", `${wrapperScript} ${flag}`);
  }
  console.log("[OK] Mac client browser self-test wrapper help exits quickly");
}

function checkRiskyArgsRefuse(args) {
  for (const flag of ["--useExistingHost", "--useEnvPassword", "--requirePassword", "--promptPassword", "--password", "--sendCall", "--forceCall", "--server", "--host", "--port", "--progressIntervalMs"]) {
    const result = runWrapper([flag, flag === "--password" || flag === "--server" || flag === "--host" || flag === "--port" || flag === "--progressIntervalMs" ? "x" : ""].filter(Boolean), args);
    assert(result.status !== 0, `${wrapperScript} ${flag} should be rejected`);
    assertIncludes(`${result.stdout}\n${result.stderr}`, "not allowed", `${wrapperScript} ${flag}`);
  }
  console.log("[OK] Risky real-host/password/call args are rejected");
}

async function checkBoardSummary(args) {
  const occupiedServer = await occupyPortIfAvailable(5188);
  try {
    const result = runWrapper(["--boardSummary", "--timeoutMs", String(args.timeoutMs)], args);
    const summary = assertSingleLine(result.stdout, "wrapper board summary stdout");
    assert(result.status === 0, `wrapper self-test should pass.\n${result.stdout}\n${result.stderr}`);
    assertIncludes(summary, "Mac client browser self-test: passed", "wrapper board summary");
    assertIncludes(summary, "temporary-mock-host", "wrapper board summary");
    assertIncludes(summary, "no password", "wrapper board summary");
    assertIncludes(summary, "no inject", "wrapper board summary");
    assertNotIncludes(`${result.stdout}\n${result.stderr}`, "LAN_DUAL_PASSWORD", "wrapper output");
    assertNotIncludes(`${result.stdout}\n${result.stderr}`, "EADDRINUSE", "wrapper output");
  } finally {
    await closeServer(occupiedServer);
  }
  console.log("[OK] Wrapper runs the local mock browser self-test with one-line stdout and no client-port collision noise");
}

function printBoardSummary(args) {
  const result = run(["--boardSummary", "--timeoutMs", String(args.timeoutMs)], args);
  const lines = String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const summary = [...lines].reverse().find((line) => line.startsWith("Mac client browser self-test:"));
  if (!summary || result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error("Mac client browser self-test did not produce a board summary line.");
  }
  console.log(summary);
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  if (args.boardSummary) {
    printBoardSummary(args);
    return;
  }
  checkHelp(args);
  checkRiskyArgsRefuse(args);
  await checkBoardSummary(args);
  console.log("[OK] Mac client browser self-test wrapper self-test passed");
}

try {
  await main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
}
