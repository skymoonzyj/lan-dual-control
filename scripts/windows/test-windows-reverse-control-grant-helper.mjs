import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const helperPath = resolve(scriptDir, "allow-windows-reverse-control.mjs");
const powerShellHelperPath = resolve(scriptDir, "allow-windows-reverse-control.ps1");

const defaults = {
  host: "127.0.0.1",
  password: "demo-password",
  timeoutMs: 10000,
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-reverse-control-grant-helper.mjs [options]

Options:
  --host <host>          Bind/connect host. Default: ${defaults.host}
  --password <password>  Temporary test password. Default: ${defaults.password}
  --timeoutMs <ms>       Per-step timeout. Default: ${defaults.timeoutMs}
  --help, -h             Show this help without starting a host

Description:
  Starts a temporary in-process Windows host and verifies the local reverse
  control grant helper. It does not use a formal password, send input, or
  execute inject.
`);
}

function parseArgs(argv) {
  const args = { ...defaults, help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--host" && next && !next.startsWith("--")) {
      args.host = next;
      index += 1;
      continue;
    }
    if (token === "--password" && next && !next.startsWith("--")) {
      args.password = next;
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(1000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function getFreePort(host) {
  return new Promise((resolvePort, rejectPort) => {
    const server = net.createServer();
    server.once("error", rejectPort);
    server.listen(0, host, () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

function runHelper(args, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [helperPath, ...args], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
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
      resolveRun({ exitCode: null, timedOut: false, stdout, stderr: `${stderr}\n${error.message}`.trim() });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({ exitCode, timedOut: false, stdout, stderr });
    });
  });
}

function runPowerShell(args, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", powerShellHelperPath,
      ...args,
    ], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
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
      resolveRun({ exitCode: null, timedOut: false, stdout, stderr: `${stderr}\n${error.message}`.trim() });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({ exitCode, timedOut: false, stdout, stderr });
    });
  });
}

function parseJsonOutput(result, label) {
  assert.equal(result.timedOut, false, `${label} timed out`);
  assert.equal(result.exitCode, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

async function waitForDiscovery(host, port, timeoutMs) {
  const url = `http://${host}:${port}/discovery`;
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        return response.json();
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`discovery did not become ready${lastError ? `: ${lastError.message}` : ""}`);
}

async function startHost({ host, password, timeoutMs }) {
  const { createWindowsHostServer } = await import("../../apps/windows-host/src/windows-host-service.mjs");
  const port = await getFreePort(host);
  const logger = { info() {}, warn() {}, error() {} };
  const service = createWindowsHostServer({
    host,
    port,
    password,
    reverseControlMode: "deny",
    buildId: "reverse-grant-helper-test",
    logger,
  });
  await withTimeout(service.listen(), timeoutMs, "listen temporary Windows host");
  await waitForDiscovery(host, port, timeoutMs);
  return { service, host, port };
}

async function verifyGrantStatusAndRevoke(args) {
  const host = await startHost(args);
  try {
    const base = ["--host", host.host, "--port", String(host.port), "--timeoutMs", "3000"];

    const status = parseJsonOutput(await runHelper([...base, "--status", "--json"], args.timeoutMs), "status JSON");
    assert.equal(status.ok, true);
    assert.equal(status.action, "status");
    assert.equal(status.reverseControlMode, "deny");
    assert.equal(status.reverseControlGrant.active, false);
    assert.match(status.boardSummary, /grant=inactive/);
    assert.match(status.boardSummary, /no-password/);
    assert.doesNotMatch(JSON.stringify(status), new RegExp(args.password));

    const granted = parseJsonOutput(
      await runHelper([...base, "--durationMs", "15000", "--json"], args.timeoutMs),
      "grant JSON",
    );
    assert.equal(granted.ok, true);
    assert.equal(granted.action, "grant");
    assert.equal(granted.reverseControlGrant.active, true);
    assert.equal(granted.reverseControlGrant.oneTime, true);
    assert.ok(Number(granted.reverseControlGrant.remainingMs) > 0);
    assert.match(granted.boardSummary, /granted/);
    assert.match(granted.boardSummary, /grant=temporary-grant/);

    const discovery = await waitForDiscovery(host.host, host.port, args.timeoutMs);
    assert.equal(discovery.capabilities.reverseControlGrant.active, true);

    const summary = await runHelper([...base, "--status", "--boardSummary"], args.timeoutMs);
    assert.equal(summary.timedOut, false, `status boardSummary timed out`);
    assert.equal(summary.exitCode, 0, `status boardSummary failed\n${summary.stderr}`);
    assert.match(summary.stdout, /Windows reverse grant:/);
    assert.match(summary.stdout, /grant=temporary-grant/);
    assert.match(summary.stdout, /oneTime=on/);
    assert.doesNotMatch(summary.stdout, new RegExp(args.password));

    const revoked = parseJsonOutput(await runHelper([...base, "--revoke", "--json"], args.timeoutMs), "revoke JSON");
    assert.equal(revoked.ok, true);
    assert.equal(revoked.action, "revoke");
    assert.equal(revoked.reverseControlGrant.active, false);
    assert.match(revoked.boardSummary, /revoked/);
    assert.match(revoked.boardSummary, /grant=inactive/);

    const psGranted = await runPowerShell([
      "-HostName", host.host,
      "-Port", String(host.port),
      "-DurationMs", "12000",
      "-BoardSummary",
      "-TimeoutMs", "3000",
    ], args.timeoutMs);
    assert.equal(psGranted.timedOut, false, "PowerShell grant boardSummary timed out");
    assert.equal(psGranted.exitCode, 0, `PowerShell grant boardSummary failed\n${psGranted.stderr}`);
    assert.match(psGranted.stdout, /Windows reverse grant:/);
    assert.match(psGranted.stdout, /granted/);
    assert.match(psGranted.stdout, /grant=temporary-grant/);
    assert.match(psGranted.stdout, /no-password/);
    assert.doesNotMatch(psGranted.stdout + psGranted.stderr, new RegExp(args.password));

    const psStatus = parseJsonOutput(await runPowerShell([
      "-HostName", host.host,
      "-Port", String(host.port),
      "-Status",
      "-Json",
      "-TimeoutMs", "3000",
    ], args.timeoutMs), "PowerShell status JSON");
    assert.equal(psStatus.ok, true);
    assert.equal(psStatus.action, "status");
    assert.equal(psStatus.reverseControlGrant.active, true);
    assert.match(psStatus.boardSummary, /grant=temporary-grant/);
    assert.doesNotMatch(JSON.stringify(psStatus), new RegExp(args.password));

    const psRevoked = parseJsonOutput(await runPowerShell([
      "-HostName", host.host,
      "-Port", String(host.port),
      "-Revoke",
      "-Json",
      "-TimeoutMs", "3000",
    ], args.timeoutMs), "PowerShell revoke JSON");
    assert.equal(psRevoked.ok, true);
    assert.equal(psRevoked.action, "revoke");
    assert.equal(psRevoked.reverseControlGrant.active, false);
    assert.match(psRevoked.boardSummary, /revoked/);
  } finally {
    await host.service.close();
  }
  print("OK", "Grant helper reads status, opens one-time grant, prints board summary, and revokes through Node and PowerShell");
}

async function verifyOfflineBoardSummary(args) {
  const port = await getFreePort(args.host);
  const result = await runHelper([
    "--host", args.host,
    "--port", String(port),
    "--status",
    "--boardSummary",
    "--timeoutMs", "1000",
  ], args.timeoutMs);
  assert.equal(result.timedOut, false, "offline boardSummary timed out");
  assert.notEqual(result.exitCode, 0, "offline boardSummary should exit non-zero");
  assert.match(result.stdout, /Windows reverse grant:/);
  assert.match(result.stdout, /failed action=status/);
  assert.match(result.stdout, /no-password/);
  assert.match(result.stdout, /no-input/);
  assert.match(result.stdout, /no-inject/);
  assert.doesNotMatch(result.stdout + result.stderr, /Error:|at /);

  const psResult = await runPowerShell([
    "-HostName", args.host,
    "-Port", String(port),
    "-Status",
    "-BoardSummary",
    "-TimeoutMs", "1000",
  ], args.timeoutMs);
  assert.equal(psResult.timedOut, false, "PowerShell offline boardSummary timed out");
  assert.notEqual(psResult.exitCode, 0, "PowerShell offline boardSummary should exit non-zero");
  assert.match(psResult.stdout, /Windows reverse grant:/);
  assert.match(psResult.stdout, /failed action=status/);
  assert.match(psResult.stdout, /no-password/);
  assert.match(psResult.stdout, /no-input/);
  assert.match(psResult.stdout, /no-inject/);
  assert.doesNotMatch(psResult.stdout + psResult.stderr, /Error:|at /);
  print("OK", "Offline helper failure stays single-line and safe for the board");
}

async function verifyPowerShellHelp(args) {
  for (const flag of ["-Help", "-h"]) {
    const result = await runPowerShell([flag], args.timeoutMs);
    assert.equal(result.timedOut, false, `PowerShell ${flag} timed out`);
    assert.equal(result.exitCode, 0, `PowerShell ${flag} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assert.match(result.stdout, /Usage:/);
    assert.match(result.stdout, /-BoardSummary/);
    assert.match(result.stdout, /-Status/);
    assert.match(result.stdout, /-Grant/);
    assert.match(result.stdout, /-Revoke/);
    assert.match(result.stdout, /Safety:/);
    assert.match(result.stdout, /not use or print passwords/);
    assert.doesNotMatch(result.stdout, /Windows reverse grant:/);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(args.password));
  }
  print("OK", "PowerShell wrapper help is pure documentation and secret-free");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  await verifyGrantStatusAndRevoke(args);
  await verifyOfflineBoardSummary(args);
  await verifyPowerShellHelp(args);
  print("OK", "Windows reverse-control grant helper tests passed");
}

main().catch((error) => {
  console.error(`[ERROR] ${error.stack || error.message}`);
  process.exit(1);
});
