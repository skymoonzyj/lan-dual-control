#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/test-mac-client-browser-self-test.mjs";

const defaults = {
  timeoutMs: 60000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs [options]

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

function assertSingleLine(text, label) {
  const trimmed = String(text || "").trim();
  assert(trimmed.length > 0, `${label} should not be empty`);
  assert(!trimmed.includes("\n"), `${label} should be a single line.\n${text}`);
  return trimmed;
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assertIncludes(result.stdout, "Usage:", `${script} ${flag}`);
    assertIncludes(result.stdout, "temporary mock Windows host", `${script} ${flag}`);
    assertIncludes(result.stdout, "single", `${script} ${flag}`);
    assertNotIncludes(result.stdout, "password:", `${script} ${flag}`);
  }
  console.log("[OK] Mac client browser self-test wrapper help exits quickly");
}

function checkRiskyArgsRefuse(args) {
  for (const flag of ["--useExistingHost", "--useEnvPassword", "--requirePassword", "--promptPassword", "--password", "--sendCall", "--forceCall", "--server", "--host", "--port", "--progressIntervalMs"]) {
    const result = run([flag, flag === "--password" || flag === "--server" || flag === "--host" || flag === "--port" || flag === "--progressIntervalMs" ? "x" : ""].filter(Boolean), args);
    assert(result.status !== 0, `${script} ${flag} should be rejected`);
    assertIncludes(`${result.stdout}\n${result.stderr}`, "not allowed", `${script} ${flag}`);
  }
  console.log("[OK] Risky real-host/password/call args are rejected");
}

function checkBoardSummary(args) {
  const result = run(["--timeoutMs", String(args.timeoutMs)], args);
  const summary = assertSingleLine(result.stdout, "wrapper board summary stdout");
  assert(result.status === 0, `wrapper self-test should pass.\n${result.stdout}\n${result.stderr}`);
  assertIncludes(summary, "Mac client browser self-test: passed", "wrapper board summary");
  assertIncludes(summary, "temporary-mock-host", "wrapper board summary");
  assertIncludes(summary, "no password", "wrapper board summary");
  assertIncludes(summary, "no inject", "wrapper board summary");
  assertNotIncludes(`${result.stdout}\n${result.stderr}`, "LAN_DUAL_PASSWORD", "wrapper output");
  console.log("[OK] Wrapper runs the local mock browser self-test with one-line stdout");
}

function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  checkRiskyArgsRefuse(args);
  checkBoardSummary(args);
  console.log("[OK] Mac client browser self-test wrapper self-test passed");
}

try {
  main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
}
