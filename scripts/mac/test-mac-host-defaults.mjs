#!/usr/bin/env node
import http from "node:http";
import net from "node:net";
import { execFile, spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const binaryPath = resolve(repoRoot, "apps/mac-host/.build/debug/lan-dual-mac-host");
const execFileAsync = promisify(execFile);

const defaults = {
  timeoutMs: 20000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (key === "help" || key === "h") {
      args.help = true;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(args, key) && next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    }
  }
  args.timeoutMs = Math.max(5000, Number(args.timeoutMs) || defaults.timeoutMs);
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-host-defaults.mjs [options]

Options:
  --timeoutMs <ms>  Per temporary host timeout. Default: 20000
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

function requestJson(port, timeoutMs) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = http.get(`http://127.0.0.1:${port}/discovery`, { timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          rejectRequest(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolveRequest(JSON.parse(body));
        } catch {
          rejectRequest(new Error("discovery returned invalid JSON"));
        }
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    request.on("error", rejectRequest);
  });
}

async function waitForDiscovery(port, timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await requestJson(port, Math.min(1000, timeoutMs));
    } catch (error) {
      lastError = error;
      await delay(150);
    }
  }
  throw new Error(`Timed out waiting for /discovery on ${port}: ${lastError?.message || "no response"}`);
}

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

function discoveryInputMode(discovery) {
  return discovery?.capabilities?.inputMode || discovery?.capabilities?.input?.mode || discovery?.inputMode || "";
}

function assertBooleanPermission(permissions, key, label) {
  if (typeof permissions?.[key] !== "boolean") {
    throw new Error(`${label}: expected permissions.${key} to be boolean, got ${typeof permissions?.[key]}`);
  }
}

function assertPermissionDiagnostics({ label, discovery, expectedInputMonitoring }) {
  const permissions = discovery?.permissions || {};
  assertBooleanPermission(permissions, "screenRecording", label);
  assertBooleanPermission(permissions, "accessibility", label);
  assertBooleanPermission(permissions, "inputMonitoring", label);

  if (permissions.inputMonitoring !== expectedInputMonitoring) {
    throw new Error(
      `${label}: expected permissions.inputMonitoring=${expectedInputMonitoring}, got ${permissions.inputMonitoring}`,
    );
  }
}

async function readNativeInputMonitoringAccess() {
  const code = `
import IOKit.hid
let granted = IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) == kIOHIDAccessTypeGranted
print(granted ? "true" : "false")
`;
  const { stdout } = await execFileAsync("swift", ["-e", code], {
    cwd: repoRoot,
    timeout: 10000,
    maxBuffer: 1024 * 1024,
  });
  const text = stdout.trim();
  if (text !== "true" && text !== "false") {
    throw new Error(`Unexpected native input monitoring probe output: ${text || "empty"}`);
  }
  return text === "true";
}

async function runTemporaryHost({ label, expectedInputMode, inputMode, expectedInputMonitoring, timeoutMs }) {
  const port = await getFreePort();
  const env = {
    ...process.env,
    LAN_DUAL_HOST: "127.0.0.1",
    LAN_DUAL_PORT: String(port),
    LAN_DUAL_PASSWORD: "test-password",
    LAN_DUAL_VIDEO_MODE: "mock",
    LAN_DUAL_BONJOUR: "0",
    LAN_DUAL_BUILD_ID: label,
  };
  if (inputMode) {
    env.LAN_DUAL_INPUT_MODE = inputMode;
  } else {
    delete env.LAN_DUAL_INPUT_MODE;
  }

  const child = spawn(binaryPath, [], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += String(chunk);
  });

  try {
    const discovery = await waitForDiscovery(port, timeoutMs);
    const actualInputMode = discoveryInputMode(discovery);
    if (actualInputMode !== expectedInputMode) {
      throw new Error(`${label}: expected inputMode=${expectedInputMode}, got ${actualInputMode || "missing"}\n${output}`);
    }
    assertPermissionDiagnostics({ label, discovery, expectedInputMonitoring });
    print("OK", `${label}: /discovery inputMode=${actualInputMode}, inputMonitoring=${discovery.permissions.inputMonitoring}`);
  } finally {
    child.kill();
    await new Promise((resolveClose) => {
      child.once("close", resolveClose);
      setTimeout(resolveClose, 1500);
    });
  }
}

async function ensureBinaryExists() {
  try {
    await access(binaryPath);
  } catch {
    throw new Error(`Mac host binary is missing at ${binaryPath}. Run: swift build --package-path apps/mac-host`);
  }
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);

  await ensureBinaryExists();
  const expectedInputMonitoring = await readNativeInputMonitoringAccess();
  await runTemporaryHost({
    label: "default-input-log",
    expectedInputMode: "log",
    inputMode: "",
    expectedInputMonitoring,
    timeoutMs: args.timeoutMs,
  });
  await runTemporaryHost({
    label: "explicit-input-inject",
    expectedInputMode: "inject",
    inputMode: "inject",
    expectedInputMonitoring,
    timeoutMs: args.timeoutMs,
  });

  print("OK", "Mac host direct-start input defaults verified");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
