import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/windows/test-windows-client-browser.mjs";

const defaults = {
  timeoutMs: 45000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-client-browser-discover.mjs [options]

Options:
  --timeoutMs <ms>  Overall child test timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Description:
  Verifies the Windows control client browser self-test can use --discover to
  select a Mac host before diagnosticsOnly UI checks. It uses a local fake
  /discovery server, does not authenticate, does not request a password, does
  not open WebSocket, and does not send input or inject events.
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
      args.timeoutMs = Math.max(15000, Number(next) || defaults.timeoutMs);
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

function corsHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-allow-private-network": "true",
  };
}

function discoveryPayload(port) {
  return {
    type: "lan_dual_discovery",
    host: "0.0.0.0",
    port,
    controlPort: port,
    deviceId: "browser-discover-mac",
    deviceName: "Browser Discover Mac",
    platform: "macos",
    role: "host",
    runtime: {
      buildId: "browser-discover-build",
      processId: 4321,
      uptimeSeconds: 7,
    },
    capabilities: {
      video: true,
      h264Stream: true,
      audio: true,
      audioMode: "system-pcm",
      clipboardText: true,
      clipboardFile: true,
      inputMode: "log",
      maxScreenFps: 30,
    },
    permissions: {
      screenRecording: true,
      accessibility: true,
      inputMonitoring: true,
    },
  };
}

function startDiscoveryServer() {
  return new Promise((resolveServer, rejectServer) => {
    const server = createServer((request, response) => {
      if (request.method === "OPTIONS") {
        response.writeHead(204, corsHeaders());
        response.end();
        return;
      }
      if (request.url !== "/discovery") {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("not found");
        return;
      }
      const port = server.address().port;
      response.writeHead(200, corsHeaders());
      response.end(JSON.stringify(discoveryPayload(port)));
    });
    server.on("error", rejectServer);
    server.listen(0, "127.0.0.1", () => {
      resolveServer({ server, port: server.address().port });
    });
  });
}

function stopServer(server) {
  return new Promise((resolveStop) => server.close(resolveStop));
}

async function pickUnusedPort() {
  const { server, port } = await startDiscoveryServer();
  await stopServer(server);
  return port;
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

async function checkBrowserDiscover(args) {
  const host = await startDiscoveryServer();
  const clientPort = await pickUnusedPort();
  const debugPort = await pickUnusedPort();
  try {
    const result = await run([
      "--discover",
      "--discoverNoLocalSubnets",
      "--host", "127.0.0.1",
      "--port", String(host.port),
      "--diagnosticsOnly",
      "--expectDiscoveryRuntimeBuildId", "browser-discover-build",
      "--clientPort", String(clientPort),
      "--debugPort", String(debugPort),
      "--timeoutMs", "15000",
    ], args);
    assert(result.exitCode === 0, `${script} discover diagnostics failed\n${result.stdout}\n${result.stderr}`);
    const output = `${result.stdout}\n${result.stderr}`;
    assertIncludes(output, `Discovery target: 127.0.0.1:${host.port}`, "browser discover output");
    assertIncludes(output, "Discovery runtime:", "browser discover output");
    assertIncludes(output, "browser-discover-build", "browser discover output");
    assertIncludes(output, "Diagnostics-only browser checks passed", "browser discover output");
    assertNotIncludes(output, "Mac host password", "browser discover output");
    assertNotIncludes(output, "demo-password", "browser discover output");
    console.log("[OK] Windows client browser self-test discovers a Mac host before diagnostics");
  } finally {
    await stopServer(host.server);
  }
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  await checkBrowserDiscover(args);
  console.log("[OK] Windows client browser discovery regression passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
