#!/usr/bin/env node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/discover-windows-hosts.mjs";

const defaults = {
  timeoutMs: 8000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-discover-windows-hosts.mjs [options]

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Verifies Mac-side Windows host discovery without scanning the real network.
The test uses a fake underlying LAN scanner and never authenticates, asks for a
password, sends input, or executes inject.
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

function makeFakeScanner(tmp) {
  const fakePath = join(tmp, "scripts/windows/discover-lan-hosts.mjs");
  mkdirSync(dirname(fakePath), { recursive: true });
  writeFileSync(fakePath, `#!/usr/bin/env node
const mode = process.env.FAKE_WINDOWS_DISCOVERY_MODE || "found";
const common = {
  scanned: 4,
  ports: [43770],
  subnets: [{ network: "192.168.31.0", prefix: 24, interfaceName: "en0", interfaceAddress: "192.168.31.122" }],
};
if (mode === "none") {
  console.log(JSON.stringify({
    ok: true,
    found: [{
      ok: true,
      host: "192.168.31.122",
      port: "43770",
      platform: "macos",
      deviceName: "Mac Host",
      runtime: { buildId: "mac-build" },
      capabilities: { inputMode: "log" }
    }],
    ...common
  }));
  process.exit(0);
}
console.log(JSON.stringify({
  ok: true,
  found: [
    {
      ok: true,
      host: "192.168.31.122",
      port: "43770",
      platform: "macos",
      deviceName: "Mac Host",
      runtime: { buildId: "mac-build" },
      capabilities: { inputMode: "log" }
    },
    {
      ok: true,
      host: "192.168.31.68",
      port: "43770",
      platform: "windows",
      deviceName: "Windows Host",
      runtime: { buildId: "win-build" },
      capabilities: { input: { mode: "log" } }
    }
  ],
  ...common
}));
`, { mode: 0o755 });
}

function run(extraArgs, args, env = {}) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
      LAN_DUAL_DISCOVER_LAN_HOSTS_SCRIPT: join(env.FAKE_SCANNER_ROOT || "", "scripts/windows/discover-lan-hosts.mjs"),
      ...env,
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

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assertIncludes(result.stdout, "Usage:", `${script} ${flag}`);
    assertIncludes(result.stdout, "read-only", `${script} ${flag}`);
    assertIncludes(result.stdout, "--scanTimeoutMs", `${script} ${flag}`);
    assertNotIncludes(result.stdout, "password:", `${script} ${flag}`);
  }
  console.log("[OK] Windows host discovery help exits quickly");
}

function checkFoundJson(tmp, args) {
  const result = run(["--json", "--host", "192.168.31.68"], args, {
    FAKE_SCANNER_ROOT: tmp,
    FAKE_WINDOWS_DISCOVERY_MODE: "found",
  });
  assert(result.status === 0, `found JSON should exit 0.\n${result.stdout}\n${result.stderr}`);
  const payload = parseJson(result.stdout, "found JSON");
  assert(payload.ok === true, "found payload should be ok=true");
  assert(payload.found.length === 1, "found payload should include only Windows hosts");
  assert(payload.ignored.length === 1, "found payload should keep ignored Mac host diagnostics");
  assert(payload.best.host === "192.168.31.68", "best host should be Windows");
  assertIncludes(payload.nextCommand, "--host 192.168.31.68", "next command");
  assertIncludes(payload.boardSummary, "No password was requested or sent", "board summary");
  assertNotIncludes(`${result.stdout}\n${result.stderr}`, "LAN_DUAL_PASSWORD", "found output");
  console.log("[OK] JSON discovery filters Windows hosts and returns next formal command");
}

function checkBoardSummaryFound(tmp, args) {
  const result = run(["--boardSummary", "--scanTimeoutMs", "30000"], args, {
    FAKE_SCANNER_ROOT: tmp,
    FAKE_WINDOWS_DISCOVERY_MODE: "found",
  });
  assert(result.status === 0, `found board summary should exit 0.\n${result.stdout}\n${result.stderr}`);
  assertIncludes(result.stdout, "Windows host discovery: found 1", "found board summary");
  assertIncludes(result.stdout, "check-mac-client-formal-status.mjs --host 192.168.31.68", "found board summary");
  assertIncludes(result.stdout, "no WebSocket/input/inject", "found board summary");
  console.log("[OK] Board summary gives a secret-free next step when Windows host is found");
}

function checkNoneRequireFound(tmp, args) {
  const result = run(["--json", "--requireFound"], args, {
    FAKE_SCANNER_ROOT: tmp,
    FAKE_WINDOWS_DISCOVERY_MODE: "none",
  });
  assert(result.status !== 0, "requireFound should fail when only Mac hosts are found");
  const payload = parseJson(result.stdout, "none JSON");
  assert(payload.ok === false, "none payload should be ok=false");
  assert(payload.found.length === 0, "none payload should have no Windows hosts");
  assert(payload.ignored.length === 1, "none payload should include ignored Mac host");
  assertIncludes(payload.boardSummary, "no Windows host found", "none board summary");
  assertIncludes(payload.boardSummary, "Ask Windows Codex to start Windows host", "none board summary");
  console.log("[OK] Missing Windows host fails only when required and explains next step");
}

function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  const tmp = mkdtempSync(join(tmpdir(), "lan-dual-discover-windows-hosts-"));
  try {
    makeFakeScanner(tmp);
    checkHelp(args);
    checkFoundJson(tmp, args);
    checkBoardSummaryFound(tmp, args);
    checkNoneRequireFound(tmp, args);
    console.log("[OK] Mac Windows host discovery self-test passed");
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
