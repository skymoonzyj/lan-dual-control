#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/check-mac-remote-audio-status.mjs";

const defaults = {
  timeoutMs: 8000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-remote-audio-status.mjs [options]

Verifies the read-only Mac remote audio status gate. The test uses fake
/discovery and fake osascript output only; it never changes system volume,
switches output devices, prompts for passwords, sends input, or executes inject.

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
      args.timeoutMs = Math.max(1000, Number(next) || defaults.timeoutMs);
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
  assert(String(text || "").includes(expected), `${label} did not include ${JSON.stringify(expected)}.\n${text}`);
}

function assertNotIncludes(text, expected, label) {
  assert(!String(text || "").includes(expected), `${label} unexpectedly included ${JSON.stringify(expected)}.\n${text}`);
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function run(extraArgs, args, env = {}) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "super-secret-remote-audio-status",
      ...env,
    },
  });
}

function runAsync(extraArgs, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...extraArgs], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: "super-secret-remote-audio-status",
        ...env,
      },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), args.timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: null, signal: null, stdout, stderr: `${stderr}\n${error.message}`.trim() });
    });
  });
}

function outputOf(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

function assertSafeOutput(text, label) {
  for (const forbidden of [
    "super-secret-remote-audio-status",
    "LAN_DUAL_PASSWORD",
    "--password",
    "input_event",
    "--inputMode inject",
    "--injectInput",
    "sudo",
    "launchctl",
    "set volume",
    "switchaudio",
  ]) {
    assertNotIncludes(text, forbidden, label);
  }
}

async function withFakeMacHost(discoveryPayload, callback) {
  const server = createServer((request, response) => {
    if (request.url !== "/discovery") {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(discoveryPayload));
  });
  await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    await callback({ host: "127.0.0.1", port });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function baseDiscovery(overrides = {}) {
  return {
    platform: "macos",
    role: "host",
    deviceName: "Fake Mac",
    capabilities: {
      audio: true,
      audioMode: "system-pcm",
      inputMode: "log",
    },
    runtime: {
      buildId: "fake-build",
    },
    ...overrides,
  };
}

async function withFakeOsascript(output, callback) {
  const dir = mkdtempSync(path.join(tmpdir(), "lan-dual-fake-osascript-"));
  try {
    const bin = path.join(dir, "bin");
    mkdirSync(bin, { recursive: true });
    const osascript = path.join(bin, "osascript");
    writeFileSync(osascript, `#!/bin/sh\ncat <<'VOLUME'\n${output}\nVOLUME\n`, { mode: 0o755 });
    return await callback({ PATH: `${bin}:${process.env.PATH || ""}` });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0\n${outputOf(result)}`);
    assertIncludes(result.stdout, "Usage:", `${script} ${flag}`);
    assertIncludes(result.stdout, "--boardSummary", `${script} ${flag}`);
    assertIncludes(result.stdout, "read-only", `${script} ${flag}`);
    assertIncludes(result.stdout, "no volume changes", `${script} ${flag}`);
    assertSafeOutput(outputOf(result), `${script} ${flag}`);
  }
  print("OK", "Mac remote audio status help is pure and safe");
}

async function checkAudibleLocalOutput(args) {
  await withFakeMacHost(baseDiscovery(), async ({ host, port }) => {
    await withFakeOsascript("output volume:42, input volume:50, alert volume:100, output muted:false", async (env) => {
      const result = await runAsync(["--json", "--host", host, "--port", String(port), "--timeoutMs", "1000"], args, env);
      const payload = parseJson(result.stdout, "audible remote audio JSON");
      assert(result.status !== 0, `audible local output should exit non-zero to highlight M1 blocker\n${outputOf(result)}`);
      assert(payload.status === "local-playback-active", `audible status mismatch: ${payload.status}`);
      assert(payload.capture?.mode === "system-pcm", `capture mode mismatch: ${JSON.stringify(payload.capture)}`);
      assert(payload.localOutput?.audible === true, `local output should be audible: ${JSON.stringify(payload.localOutput)}`);
      assert(payload.remoteOnly?.state === "not-active", `remote-only state mismatch: ${JSON.stringify(payload.remoteOnly)}`);
      assert(payload.nextAction === "ask-user-consent-before-mute-or-route", `next action mismatch: ${payload.nextAction}`);
      assertIncludes(payload.boardSummary, "MacRemoteAudioStatus=status=local-playback-active", "audible boardSummary");
      assertIncludes(payload.boardSummary, "localOutput=audible", "audible boardSummary");
      assertIncludes(payload.boardSummary, "remoteOnly=not-active", "audible boardSummary");
      assertIncludes(payload.boardSummary, "Safety=read-only,no-volume-change,no-password,no-input,no-inject", "audible boardSummary");
      assertSafeOutput(outputOf(result), "audible remote audio JSON");
    });
  });
  print("OK", "Audible local output is reported as not remote-only yet");
}

async function checkMutedLocalOutput(args) {
  await withFakeMacHost(baseDiscovery(), async ({ host, port }) => {
    await withFakeOsascript("output volume:0, input volume:50, alert volume:100, output muted:true", async (env) => {
      const result = await runAsync(["--json", "--host", host, "--port", String(port), "--timeoutMs", "1000"], args, env);
      const payload = parseJson(result.stdout, "muted remote audio JSON");
      assert(result.status === 0, `muted local output should exit 0 as a user-muted candidate\n${outputOf(result)}`);
      assert(payload.status === "local-output-muted", `muted status mismatch: ${payload.status}`);
      assert(payload.localOutput?.audible === false, `local output should not be audible: ${JSON.stringify(payload.localOutput)}`);
      assert(payload.remoteOnly?.state === "manual-muted-pending-audio-smoke", `remote-only state mismatch: ${JSON.stringify(payload.remoteOnly)}`);
      assert(payload.nextAction === "run-audio-smoke-or-restore-local-output", `next action mismatch: ${payload.nextAction}`);
      assertIncludes(payload.boardSummary, "MacRemoteAudioStatus=status=local-output-muted", "muted boardSummary");
      assertIncludes(payload.boardSummary, "localOutput=muted-or-zero", "muted boardSummary");
      assertIncludes(payload.boardSummary, "remoteOnly=manual-muted-pending-audio-smoke", "muted boardSummary");
      assertSafeOutput(outputOf(result), "muted remote audio JSON");
    });
  });
  print("OK", "Muted local output is reported as a manual remote-only candidate");
}

async function checkUnknownVolumeBlocksClaim(args) {
  await withFakeMacHost(baseDiscovery(), async ({ host, port }) => {
    await withFakeOsascript("not a volume settings response", async (env) => {
      const result = await runAsync(["--boardSummary", "--host", host, "--port", String(port), "--timeoutMs", "1000"], args, env);
      assert(result.status !== 0, `unknown volume should exit non-zero\n${outputOf(result)}`);
      assertIncludes(result.stdout, "MacRemoteAudioStatus=status=unknown", "unknown boardSummary");
      assertIncludes(result.stdout, "localOutput=unknown", "unknown boardSummary");
      assertIncludes(result.stdout, "Next=check-local-volume-status", "unknown boardSummary");
      assertSafeOutput(outputOf(result), "unknown remote audio boardSummary");
    });
  });
  print("OK", "Unknown local output state blocks remote-only claims");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  checkHelp(args);
  await checkAudibleLocalOutput(args);
  await checkMutedLocalOutput(args);
  await checkUnknownVolumeBlocksClaim(args);
  print("OK", "Mac remote audio status self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
