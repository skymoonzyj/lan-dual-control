#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/run-mac-client-formal-smoke.mjs";

const defaults = {
  timeoutMs: 20000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-client-formal-smoke.mjs [options]

Verifies the Mac client formal browser smoke wrapper. Tests stay safe: they use
local HTTP discovery stubs, --preflightOnly, and --dryRun. They never open a real
password dialog, never authenticate a real host, and never send input events.

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

function run(extraArgs, args, extraEnv = {}) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
      LAN_DUAL_DISABLE_PASSWORD_DIALOG: "1",
      LAN_DUAL_DISABLE_PASSWORD_BEEP: "1",
      ...extraEnv,
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

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

async function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

function waitForHttpPath(port, pathname, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolveWait, rejectWait) => {
    const attempt = () => {
      const result = spawnSync(process.execPath, [
        "--input-type=module",
        "-e",
        `const r=await fetch("http://127.0.0.1:${port}${pathname}"); if(!r.ok) process.exit(1);`,
      ], {
        encoding: "utf8",
        timeout: 2000,
      });
      if (result.status === 0) {
        resolveWait();
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        rejectWait(new Error(`HTTP server on ${port}${pathname} did not become ready`));
        return;
      }
      setTimeout(attempt, 100);
    };
    attempt();
  });
}

async function withMacClientServer(args, callback) {
  const port = await getFreePort();
  const child = spawn(process.execPath, ["apps/mac-client/server.mjs", String(port)], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, LAN_DUAL_PASSWORD: "" },
  });
  try {
    await waitForHttpPath(port, "/", args.timeoutMs);
    await callback(port);
  } finally {
    child.kill("SIGTERM");
    await waitForClose(child);
  }
}

async function withWindowsDiscoveryServer(callback) {
  const port = await getFreePort();
  const child = spawn(process.execPath, [
    "--input-type=module",
    "-e",
    `
import { createServer } from "node:http";
const port = Number(process.argv[1]);
const server = createServer((request, response) => {
  if ((request.url || "").split("?")[0] !== "/discovery") {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("not found\\n");
    return;
  }
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({
    type: "lan_dual_discovery",
    name: "Mock Windows Host Smoke",
    deviceName: "Mock Windows Host Smoke",
    platform: "windows",
    host: "127.0.0.1",
    port,
    controlPort: port,
    runtime: {
      processId: 9876,
      buildId: "mock-smoke-win-build",
    },
    capabilities: {
      reverseControl: true,
      screen: {
        active: true,
        mode: "wgc",
        capturePipeline: "windows-wgc-helper-nv12-ffmpeg-h264",
        codec: "h264",
        h264Encoder: "h264_nvenc",
        videoTransports: ["json", "binary-jpeg", "binary-h264"],
      },
      audio: {
        active: true,
        mode: "wasapi",
        codec: "pcm-f32le-base64",
      },
      input: {
        enabled: true,
        mode: "log",
      },
      clipboard: {
        text: true,
        textMode: "system",
        file: true,
        fileMode: "clipboard",
      },
    },
  }));
});
server.listen(port, "127.0.0.1");
`,
    String(port),
  ], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForHttpPath(port, "/discovery", 5000);
    await callback(port);
  } finally {
    child.kill("SIGTERM");
    await waitForClose(child);
  }
}

async function waitForClose(child) {
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 1000);
    child.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assertIncludes(result.stdout, "Usage:", `${script} ${flag}`);
    assertIncludes(result.stdout, "--promptPassword", `${script} ${flag}`);
    assertIncludes(result.stdout, "--discover", `${script} ${flag}`);
    assertNotIncludes(result.stdout, "LAN_DUAL_PASSWORD=", `${script} ${flag}`);
  }
  print("OK", "Formal smoke help exits quickly");
}

function checkMissingHost(args) {
  const result = run(["--json", "--skipBoard", "--allowClipboardFallback", "--preflightOnly"], args);
  const payload = parseJson(result.stdout, "missing host JSON");
  assert(result.status !== 0, "missing host should fail");
  assert(payload.ok === false, "missing host payload should be ok=false");
  assertIncludes(payload.error?.message || "", "--host", "missing host error");
  print("OK", "Missing host is rejected before any browser auth");
}

async function checkPreflightAndDryRun(args) {
  const secret = "super-secret-smoke-password";
  await withMacClientServer(args, async (clientPort) => {
    await withWindowsDiscoveryServer(async (windowsPort) => {
      const preflight = run([
        "--json",
        "--skipBoard",
        "--preflightOnly",
        "--host",
        "127.0.0.1",
        "--port",
        String(windowsPort),
        "--clientPort",
        String(clientPort),
        "--timeoutMs",
        "10000",
      ], args, { LAN_DUAL_PASSWORD: secret });
      const preflightPayload = parseJson(preflight.stdout, "preflight JSON");
      assert(preflight.status === 0, `preflight should pass.\n${preflight.stdout}\n${preflight.stderr}`);
      assert(preflightPayload.ok === true, "preflight should be ok=true");
      assert(preflightPayload.preflightOnly === true, "preflightOnly should be recorded");
      assert(preflightPayload.preflight?.ok === true, "nested formal preflight should be ok=true");
      assert(preflightPayload.preflight?.readyToCall === false, "skipBoard should prevent readyToCall");
      assertNotIncludes(`${preflight.stdout}\n${preflight.stderr}`, secret, "preflight output");

      const dryRun = run([
        "--json",
        "--skipBoard",
        "--dryRun",
        "--host",
        "127.0.0.1",
        "--port",
        String(windowsPort),
        "--clientPort",
        String(clientPort),
        "--timeoutMs",
        "10000",
      ], args, { LAN_DUAL_PASSWORD: secret });
      const dryRunPayload = parseJson(dryRun.stdout, "dryRun JSON");
      assert(dryRun.status === 0, `dryRun should pass.\n${dryRun.stdout}\n${dryRun.stderr}`);
      assert(dryRunPayload.ok === true, "dryRun should be ok=true");
      assert(dryRunPayload.commands?.browserSmoke?.includes("--useEnvPassword"), "dryRun should use environment password flag");
      assert(dryRunPayload.commands?.browserSmoke?.includes("--requirePassword"), "dryRun should require password in child command");
      assertNotIncludes(dryRunPayload.commands?.browserSmoke || "", secret, "dryRun command");
      assertNotIncludes(`${dryRun.stdout}\n${dryRun.stderr}`, secret, "dryRun output");
    });
  });
  print("OK", "Preflight/dryRun are secret-free and do not authenticate");
}

async function checkDiscoverPreflight(args) {
  const secret = "super-secret-discover-smoke-password";
  await withMacClientServer(args, async (clientPort) => {
    await withWindowsDiscoveryServer(async (windowsPort) => {
      const result = run([
        "--json",
        "--skipBoard",
        "--preflightOnly",
        "--discover",
        "--discoverHost",
        "127.0.0.1",
        "--discoverNoLocalSubnets",
        "--discoverTimeoutMs",
        "300",
        "--discoverScanTimeoutMs",
        "5000",
        "--port",
        String(windowsPort),
        "--clientPort",
        String(clientPort),
        "--timeoutMs",
        "10000",
      ], args, { LAN_DUAL_PASSWORD: secret });
      const payload = parseJson(result.stdout, "discover preflight JSON");
      assert(result.status === 0, `discover preflight should pass.\n${result.stdout}\n${result.stderr}`);
      assert(payload.ok === true, "discover preflight should be ok=true");
      assert(payload.args?.discover === true, "discover preflight should record discover=true");
      assert(payload.args?.host === "127.0.0.1", "discover preflight should select mock Windows host");
      assert(payload.args?.port === windowsPort, "discover preflight should select mock Windows port");
      assert(payload.discovery?.ok === true, "discover preflight should report discovery ok");
      assert(payload.discovery?.selected?.host === "127.0.0.1", "discover preflight selected host mismatch");
      assert(payload.commands?.browserSmoke?.includes("--host 127.0.0.1"), "browser command should use discovered host");
      assertNotIncludes(`${result.stdout}\n${result.stderr}`, secret, "discover preflight output");
    });
  });
  print("OK", "Discovery preflight selects a Windows host without authenticating");
}

async function checkDiscoverFailureNoPasswordPrompt(args) {
  const unusedPort = await getFreePort();
  const result = run([
    "--json",
    "--discover",
    "--discoverHost",
    "127.0.0.1",
    "--discoverNoLocalSubnets",
    "--discoverTimeoutMs",
    "200",
    "--discoverScanTimeoutMs",
    "4000",
    "--port",
    String(unusedPort),
    "--promptPassword",
    "--requirePassword",
  ], args);
  const payload = parseJson(result.stdout, "discover failure JSON");
  assert(result.status !== 0, "discover failure should fail");
  assert(payload.ok === false, "discover failure payload should be ok=false");
  assert(payload.discovery?.requested === true, "discover failure should record discovery requested");
  assertIncludes(payload.error?.message || "", "Windows host discovery", "discover failure error");
  assertNotIncludes(`${result.stdout}\n${result.stderr}`, "--promptPassword requires", "discover failure should not reach password prompt");
  assertNotIncludes(`${result.stdout}\n${result.stderr}`, "Password cannot be empty", "discover failure should not prompt for password");
  print("OK", "Discovery failure exits before password prompt");
}

async function checkPasswordSafety(args) {
  await withMacClientServer(args, async (clientPort) => {
    await withWindowsDiscoveryServer(async (windowsPort) => {
      const noPassword = run([
        "--json",
        "--skipBoard",
        "--allowDirty",
        "--allowPreflightWarnings",
        "--host",
        "127.0.0.1",
        "--port",
        String(windowsPort),
        "--clientPort",
        String(clientPort),
      ], args);
      const noPasswordPayload = parseJson(noPassword.stdout, "no password JSON");
      assert(noPassword.status !== 0, "no password should fail");
      assertIncludes(noPasswordPayload.error?.message || "", "requires LAN_DUAL_PASSWORD", "no password error");

      const demoPassword = run([
        "--json",
        "--skipBoard",
        "--allowDirty",
        "--allowPreflightWarnings",
        "--host",
        "127.0.0.1",
        "--port",
        String(windowsPort),
        "--clientPort",
        String(clientPort),
      ], args, { LAN_DUAL_PASSWORD: "demo-password" });
      const demoPayload = parseJson(demoPassword.stdout, "demo password JSON");
      assert(demoPassword.status !== 0, "demo password should fail");
      assertIncludes(demoPayload.error?.message || "", "Formal browser smoke refuses", "demo password error");
      assertNotIncludes(`${demoPassword.stdout}\n${demoPassword.stderr}`, "demo-password", "demo password output");
    });
  });
  print("OK", "Real smoke requires a non-demo local password source");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  checkMissingHost(args);
  await checkPreflightAndDryRun(args);
  await checkDiscoverPreflight(args);
  await checkDiscoverFailureNoPasswordPrompt(args);
  await checkPasswordSafety(args);
  print("OK", "Mac client formal smoke wrapper self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
