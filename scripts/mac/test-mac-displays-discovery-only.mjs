#!/usr/bin/env node
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const scriptPath = "scripts/mac/check-mac-displays.mjs";

const defaults = {
  timeoutMs: 10000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
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

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-displays-discovery-only.mjs [options]

Options:
  --timeoutMs <ms>  Per command timeout. Default: 10000
  --help, -h        Show this help without running checks
`);
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

async function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = net.createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

function makeDiscoveryPayload() {
  return {
    type: "lan_dual_discovery",
    deviceName: "Mac discovery-only test",
    host: "127.0.0.1",
    port: 0,
    protocolVersion: 1,
    role: "host",
    runtime: {
      processId: 12345,
      buildId: "display-discovery-test",
      startedAt: "2026-06-14T00:00:00.000Z",
      uptimeSeconds: 12,
    },
    capabilities: {
      displays: [
        { id: "main", name: "Main", width: 1920, height: 1080, primary: true },
        { id: "display-4", name: "Display 2", width: 1116, height: 756, primary: false },
      ],
    },
  };
}

async function withDiscoveryServer(fn) {
  const port = await getFreePort();
  const server = http.createServer((request, response) => {
    if (request.url !== "/discovery") {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ...makeDiscoveryPayload(), port }));
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  try {
    return await fn(port);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

function runCheck(port, extraArgs, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(
      process.execPath,
      [
        scriptPath,
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--discoveryOnly",
        "--requireRuntime",
        "--timeoutMs",
        String(timeoutMs),
        ...extraArgs,
      ],
      {
        cwd: repoRoot,
        env: { ...process.env, LAN_DUAL_PASSWORD: "unused-discovery-only-password" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({ exitCode: null, timedOut: true, stdout, stderr });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({ exitCode: null, timedOut: false, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({ exitCode, timedOut: false, stdout, stderr });
    });
  });
}

function assertIncludes(text, expected, label) {
  if (!String(text).includes(expected)) {
    throw new Error(`${label} did not include ${JSON.stringify(expected)}.\nOutput:\n${text}`);
  }
}

function parseJsonOutput(stdout, label) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${label} did not print parseable JSON: ${error.message}\nStdout:\n${stdout}`);
  }
}

async function assertDiscoveryOnlyPasses(timeoutMs) {
  await withDiscoveryServer(async (port) => {
    const result = await runCheck(port, ["--expectDisplayCount", "2"], timeoutMs);
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode !== 0 || result.timedOut) {
      throw new Error(`discovery-only check should pass.\n${output}`);
    }
    assertIncludes(output, "Discovery displays verified", "discovery-only success");
    assertIncludes(output, "main*", "discovery-only success");
    assertIncludes(output, "display-4", "discovery-only success");
    print("OK", "discovery-only display check passes without WebSocket auth");
  });
}

async function assertDiscoveryOnlyJsonPasses(timeoutMs) {
  await withDiscoveryServer(async (port) => {
    const result = await runCheck(port, ["--expectDisplayCount", "2", "--json"], timeoutMs);
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode !== 0 || result.timedOut) {
      throw new Error(`discovery-only JSON check should pass.\n${output}`);
    }
    const payload = parseJsonOutput(result.stdout, "discovery-only JSON success");
    if (payload.ok !== true) {
      throw new Error(`discovery-only JSON should report ok=true.\n${result.stdout}`);
    }
    if (payload.result?.mode !== "discoveryOnly") {
      throw new Error(`discovery-only JSON result.mode mismatch.\n${result.stdout}`);
    }
    if (payload.discovery?.displayCount !== 2 || payload.result?.displayCount !== 2) {
      throw new Error(`discovery-only JSON displayCount mismatch.\n${result.stdout}`);
    }
    if (payload.discovery?.runtime?.buildId !== "display-discovery-test") {
      throw new Error(`discovery-only JSON runtime buildId missing.\n${result.stdout}`);
    }
    if (String(result.stdout).includes("[OK]")) {
      throw new Error(`discovery-only JSON stdout should not include text logs.\n${result.stdout}`);
    }
    assertIncludes(result.stderr, "Discovery displays verified", "discovery-only JSON stderr logs");
    print("OK", "discovery-only JSON output is parseable and keeps logs off stdout");
  });
}

async function assertDisplayCountMismatchFails(timeoutMs) {
  await withDiscoveryServer(async (port) => {
    const result = await runCheck(port, ["--expectDisplayCount", "3"], timeoutMs);
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode === 0 || result.timedOut) {
      throw new Error(`display count mismatch should fail.\n${output}`);
    }
    assertIncludes(output, "display count mismatch", "display count mismatch");
    print("OK", "discovery-only display count mismatch fails");
  });
}

async function assertDisplayCountMismatchJsonFails(timeoutMs) {
  await withDiscoveryServer(async (port) => {
    const result = await runCheck(port, ["--expectDisplayCount", "3", "--json"], timeoutMs);
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode === 0 || result.timedOut) {
      throw new Error(`display count mismatch JSON should fail.\n${output}`);
    }
    const payload = parseJsonOutput(result.stdout, "display count mismatch JSON");
    if (payload.ok !== false) {
      throw new Error(`display count mismatch JSON should report ok=false.\n${result.stdout}`);
    }
    if (!String(payload.error?.message || "").includes("display count mismatch")) {
      throw new Error(`display count mismatch JSON error message missing.\n${result.stdout}`);
    }
    if (payload.discovery?.displayCount !== 2) {
      throw new Error(`display count mismatch JSON should retain discovery details.\n${result.stdout}`);
    }
    print("OK", "discovery-only display count mismatch prints structured JSON failure");
  });
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  await assertDiscoveryOnlyPasses(args.timeoutMs);
  await assertDiscoveryOnlyJsonPasses(args.timeoutMs);
  await assertDisplayCountMismatchFails(args.timeoutMs);
  await assertDisplayCountMismatchJsonFails(args.timeoutMs);
  print("OK", "Mac display discovery-only self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
