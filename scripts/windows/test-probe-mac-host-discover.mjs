import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { createMockMacHostServer } from "../../apps/mock-mac-host/server.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/windows/probe-mac-host.mjs";

const defaults = {
  timeoutMs: 30000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-probe-mac-host-discover.mjs [options]

Options:
  --timeoutMs <ms>  Per probe timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Description:
  Verifies probe-mac-host can use --discover to select a Mac host before the
  WebSocket/auth/session probe. It uses a local mock Mac host, does not request
  a real password, and does not execute inject.
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

function assertMatches(text, pattern, label) {
  assert(pattern.test(String(text)), `${label} did not match ${pattern}.\n${text}`);
}

function run(extraArgs, args) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [script, ...extraArgs], {
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

async function withMockHostOptions(options, callback) {
  const port = await reservePort();
  const service = createMockMacHostServer({ host: "127.0.0.1", port, ...options });
  await service.listen();
  try {
    await callback(port);
  } finally {
    await service.close();
  }
}

async function checkDiscoverMockProbe(args) {
  await withMockHost(async (port) => {
    const result = await run([
      "--discover",
      "--discoverNoLocalSubnets",
      "--host", "127.0.0.1",
      "--port", String(port),
      "--password", "demo-password",
      "--timeoutMs", "8000",
      "--width", "640",
      "--height", "360",
      "--fps", "30",
    ], args);
    assert(result.exitCode === 0, `discover mock probe failed\n${result.stdout}\n${result.stderr}`);
    const output = `${result.stdout}\n${result.stderr}`;
    assertIncludes(output, `Discovery target: 127.0.0.1:${port}`, "discover mock probe");
    assertIncludes(output, "Discovery: 本机假 Mac / macos", "discover mock probe");
    assertIncludes(output, "WebSocket connected", "discover mock probe");
    assertIncludes(output, "Auth passed", "discover mock probe");
    assertIncludes(output, "Session:", "discover mock probe");
    assertIncludes(output, "First frame:", "discover mock probe");
    assertNotIncludes(output, "Mac host password", "discover mock probe");
    console.log("[OK] probe-mac-host --discover selects and probes a mock Mac host");
  });
}

async function checkInputInjectedExpectation(args) {
  await withMockHost(async (port) => {
    const passResult = await run([
      "--discover",
      "--discoverNoLocalSubnets",
      "--host", "127.0.0.1",
      "--port", String(port),
      "--password", "demo-password",
      "--timeoutMs", "8000",
      "--width", "640",
      "--height", "360",
      "--fps", "30",
      "--inputEvents",
      "--expectInputInjected", "false",
    ], args);
    const passOutput = `${passResult.stdout}\n${passResult.stderr}`;
    assert(passResult.exitCode === 0, `log-mode injected=false expectation should pass\n${passOutput}`);
    assertIncludes(passOutput, "Input events acknowledged: 2 events", "input injected=false expectation");
    assertIncludes(passOutput, "injected=false", "input injected=false expectation");

    const failResult = await run([
      "--discover",
      "--discoverNoLocalSubnets",
      "--host", "127.0.0.1",
      "--port", String(port),
      "--password", "demo-password",
      "--timeoutMs", "8000",
      "--width", "640",
      "--height", "360",
      "--fps", "30",
      "--inputEvents",
      "--expectInputInjected", "true",
    ], args);
    const failOutput = `${failResult.stdout}\n${failResult.stderr}`;
    assert(failResult.exitCode !== 0, "log-mode injected=true expectation should fail");
    assertIncludes(failOutput, "input_event injected mismatch", "input injected=true mismatch");
    console.log("[OK] probe-mac-host validates input_ack injected flag");
  });
}

async function checkInputOptionValidation(args) {
  const injectedResult = await run([
    "--host", "127.0.0.1",
    "--port", "9",
    "--expectInputInjected", "maybe",
  ], args);
  const injectedOutput = `${injectedResult.stdout}\n${injectedResult.stderr}`;
  assert(injectedResult.exitCode !== 0, "invalid --expectInputInjected should fail");
  assertIncludes(injectedOutput, "--expectInputInjected must be true or false", "invalid expectInputInjected");

  const setResult = await run([
    "--host", "127.0.0.1",
    "--port", "9",
    "--inputEventSet", "unsafe",
  ], args);
  const setOutput = `${setResult.stdout}\n${setResult.stderr}`;
  assert(setResult.exitCode !== 0, "invalid --inputEventSet should fail");
  assertIncludes(setOutput, "--inputEventSet must be one of: safe, full", "invalid inputEventSet");
  console.log("[OK] probe-mac-host rejects invalid input safety options");
}

async function checkVideoRepeatFrameObservation(args) {
  await withMockHostOptions({ repeatPreviousFrameEvery: 2 }, async (port) => {
    const result = await run([
      "--host", "127.0.0.1",
      "--port", String(port),
      "--password", "demo-password",
      "--timeoutMs", "8000",
      "--width", "640",
      "--height", "360",
      "--fps", "8",
      "--durationMs", "1600",
      "--minVideoFrames", "4",
      "--minVideoFps", "2",
      "--progressIntervalMs", "0",
    ], args);
    const output = `${result.stdout}\n${result.stderr}`;
    assert(result.exitCode === 0, `repeat-frame observation probe failed\n${output}`);
    assertIncludes(output, "Video observed:", "repeat-frame observation");
    assertMatches(output, /repeat [1-9]\d* \([0-9.]+%\)/, "repeat-frame observation");
    console.log("[OK] probe-mac-host reports repeat-frame video observations");
  });
}

async function checkDiscoverFailsBeforePassword(args) {
  const result = await run([
    "--discover",
    "--discoverNoLocalSubnets",
    "--host", "127.0.0.1",
    "--port", "9",
    "--promptPassword",
    "--requirePassword",
    "--timeoutMs", "3000",
  ], args);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.exitCode !== 0, "offline discovery should fail");
  assertIncludes(output, "Mac host discovery failed", "offline discovery");
  assertNotIncludes(output, "--promptPassword requires an interactive terminal", "offline discovery");
  assertNotIncludes(output, "Mac host password", "offline discovery");
  console.log("[OK] probe-mac-host --discover fails before prompting for a password");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  await checkDiscoverMockProbe(args);
  await checkInputInjectedExpectation(args);
  await checkInputOptionValidation(args);
  await checkVideoRepeatFrameObservation(args);
  await checkDiscoverFailsBeforePassword(args);
  console.log("[OK] probe-mac-host discovery regression passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
