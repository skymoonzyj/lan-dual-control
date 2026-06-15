import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { createMockMacHostServer } from "../../apps/mock-mac-host/server.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/windows/test-mac-host.ps1";

const defaults = {
  timeoutMs: 30000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-mac-host-powershell-discover.mjs [options]

Options:
  --timeoutMs <ms>  Per PowerShell probe timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Description:
  Verifies the PowerShell Mac host probe wrapper can pass -Discover through to
  probe-mac-host before prompting for a password. It uses a local mock Mac host,
  does not request a real password, and does not execute inject.
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
      args.timeoutMs = Math.max(10000, Number(next) || defaults.timeoutMs);
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

function runPowerShell(extraArgs, args) {
  return new Promise((resolveRun) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      ...extraArgs,
    ], {
      cwd: repoRoot,
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({
        exitCode: null,
        signal: "timeout",
        stdout,
        stderr,
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
      resolveRun({
        exitCode: null,
        signal: "error",
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolveRun({
        exitCode,
        signal,
        stdout,
        stderr,
      });
    });
  });
}

function reservePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => {
        if (error) rejectPort(error);
        else resolvePort(port);
      });
    });
  });
}

async function withMockHost(callback) {
  const port = await reservePort();
  const service = createMockMacHostServer({ host: "127.0.0.1", port });
  await service.listen();
  try {
    await callback(port);
  } finally {
    await service.close();
  }
}

async function checkDiscoverMockProbe(args) {
  await withMockHost(async (port) => {
    const result = await runPowerShell([
      "-Discover",
      "-DiscoverNoLocalSubnets",
      "-Port", String(port),
      "-Password", "demo-password",
      "-TimeoutMs", "8000",
      "-Width", "640",
      "-Height", "360",
      "-Fps", "30",
    ], args);
    const output = `${result.stdout}\n${result.stderr}`;
    assert(result.exitCode === 0, `PowerShell discover mock probe failed\n${output}`);
    assertIncludes(output, `Discovery target: 127.0.0.1:${port}`, "PowerShell discover mock probe");
    assertIncludes(output, "Discovery: 本机假 Mac / macos", "PowerShell discover mock probe");
    assertIncludes(output, "WebSocket connected", "PowerShell discover mock probe");
    assertIncludes(output, "Auth passed", "PowerShell discover mock probe");
    assertIncludes(output, "Session:", "PowerShell discover mock probe");
    assertIncludes(output, "First frame:", "PowerShell discover mock probe");
    assertNotIncludes(output, "Mac host password", "PowerShell discover mock probe");
    console.log("[OK] test-mac-host.ps1 -Discover selects and probes a mock Mac host");
  });
}

async function checkDiscoverFailsBeforePassword(args) {
  const result = await runPowerShell([
    "-Discover",
    "-DiscoverNoLocalSubnets",
    "-Port", "9",
    "-PromptPassword",
    "-RequirePassword",
    "-TimeoutMs", "3000",
  ], args);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.exitCode !== 0, "offline discovery should fail");
  assertIncludes(output, "Mac host discovery failed", "offline PowerShell discovery");
  assertNotIncludes(output, "--promptPassword requires an interactive terminal", "offline PowerShell discovery");
  assertNotIncludes(output, "Mac host password", "offline PowerShell discovery");
  console.log("[OK] test-mac-host.ps1 -Discover fails before prompting for a password");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  await checkDiscoverMockProbe(args);
  await checkDiscoverFailsBeforePassword(args);
  console.log("[OK] PowerShell Mac host discovery wrapper regression passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
