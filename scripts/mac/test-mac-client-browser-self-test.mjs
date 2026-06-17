#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultClientPort = 5188;
const deniedFlags = new Set([
  "--host",
  "--windowsHost",
  "--port",
  "--windowsPort",
  "--useExistingHost",
  "--useEnvPassword",
  "--requirePassword",
  "--promptPassword",
  "--password",
  "--sendCall",
  "--forceCall",
  "--server",
  "--progressIntervalMs",
]);

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-client-browser-self-test.mjs [options]

Runs the Mac client browser page self-test against a temporary mock Windows host.
This wrapper is intentionally secret-free: it always uses mock video, allows the
local clipboard fallback, skips system file clipboard coupling, prints a single
board summary line, and keeps progress output off stdout.

Options are forwarded to scripts/windows/test-mac-client-browser.mjs, except
real-host, password, Agent Link Board call, custom board server, and stdout
progress options are rejected.

Examples:
  node scripts/mac/test-mac-client-browser-self-test.mjs --boardSummary
  node scripts/mac/test-mac-client-browser-self-test.mjs --timeoutMs 45000
`);
}

function assertSafeArgs(args) {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const flag = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
    if (deniedFlags.has(flag)) {
      throw new Error(`${flag} is not allowed in the Mac client browser self-test wrapper; use the formal smoke tool for real host/password flows.`);
    }
  }
}

function hasFlag(args, flag) {
  return args.some((token) => token === flag || token.startsWith(`${flag}=`));
}

function tcpPortAvailable(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

function findEphemeralPort(host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function maybeAddClientPort(forwardedArgs) {
  if (hasFlag(forwardedArgs, "--clientPort")) return forwardedArgs;
  if (await tcpPortAvailable(defaultClientPort)) return forwardedArgs;
  const clientPort = await findEphemeralPort();
  if (!clientPort) return forwardedArgs;
  console.error(`[INFO] Mac client port ${defaultClientPort} is already in use; using temporary self-test port ${clientPort}.`);
  return [...forwardedArgs, "--clientPort", String(clientPort)];
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }

  let forwardedArgs = process.argv.slice(2);
  assertSafeArgs(forwardedArgs);
  forwardedArgs = await maybeAddClientPort(forwardedArgs);
  const childArgs = [
    "scripts/windows/test-mac-client-browser.mjs",
    "--mockVideo",
    "--allowClipboardFallback",
    "--skipFileClipboard",
    "--boardSummary",
    "--progressIntervalMs",
    "0",
    ...forwardedArgs,
  ];
  const result = spawnSync(process.execPath, childArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
    },
  });
  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
}

try {
  await main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
}
