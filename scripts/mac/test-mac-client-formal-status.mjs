#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/check-mac-client-formal-status.mjs";

const defaults = {
  timeoutMs: 15000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-client-formal-status.mjs [options]

Verifies the Mac client formal Windows checklist script. Tests stay read-only:
they use a local Mac client HTTP server and a mock Windows /discovery endpoint,
but never authenticate, never require a password, and never send input events.

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

function run(extraArgs, args) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
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

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assertIncludes(result.stdout, "Usage:", `${script} ${flag}`);
    assertNotIncludes(result.stdout, "password:", `${script} ${flag}`);
  }
  print("OK", "Mac client formal status help exits quickly");
}

function checkOfflineJson(args) {
  const result = run([
    "--json",
    "--skipBoard",
    "--clientPort",
    "9",
    "--timeoutMs",
    "1200",
  ], args);
  const payload = parseJson(result.stdout, "offline formal client JSON");
  assert(result.status !== 0, "offline formal client checklist should fail");
  assert(payload.ok === false, "offline payload should be ok=false");
  assert(payload.readyToCall === false, "offline payload should not be readyToCall");
  assert(payload.checklist.some((entry) => entry.id === "client-server" && entry.status === "blocker"), "offline payload should block on local client server");
  assert(payload.checklist.some((entry) => entry.id === "windows-host" && entry.status === "blocker"), "offline payload should block on Windows host");
  assert(payload.checklist.some((entry) => entry.id === "inject" && entry.status === "skip"), "offline payload should explicitly skip inject");
  assert(payload.checklist.some((entry) => entry.id === "windows-host" && String(entry.next || "").includes("discover-windows-hosts.mjs")), "offline Windows host next step should suggest discovery helper");
  assert(payload.runPlan?.safety?.passwordRequestedByThisScript === false, "offline runPlan should not request passwords");
  assert(payload.runPlan?.safety?.passwordInCommandArguments === false, "offline runPlan should keep passwords out of argv");
  assert(payload.runPlan?.safety?.inject === false, "offline runPlan should not run inject");
  assert(payload.runPlan?.commands?.discoverWindowsHost?.includes("discover-windows-hosts.mjs"), "offline runPlan should include discovery command");
  assert(payload.runPlan?.steps?.some((step) => step.id === "browser-smoke"), "offline runPlan should include browser smoke step");
  assertIncludes(payload.boardSummary || "", "Do not send passwords", "offline board summary");
  assertIncludes(payload.boardSummary || "", "RunPlan:", "offline board summary");
  assertIncludes(payload.callText || "", "not ready", "offline call text");
  assertNotIncludes(payload.boardSummary || "", "--checkBoard", "offline board summary");
  assertNotIncludes(payload.callText || "", "--checkBoard", "offline call text");
  print("OK", "Offline JSON blocks formal Windows test and remains secret-free");
}

function checkAllowOfflineWarnings(args) {
  const result = run([
    "--json",
    "--skipBoard",
    "--allowDirty",
    "--allowClientServerOffline",
    "--allowWindowsHostOffline",
    "--clientPort",
    "9",
    "--timeoutMs",
    "1200",
  ], args);
  const payload = parseJson(result.stdout, "allow offline JSON");
  assert(result.status === 0, "allow offline warnings should exit 0 when no blockers remain");
  assert(payload.ok === true, "allow offline payload should be ok=true");
  assert(payload.readyToCall === false, "allow offline payload should still not be readyToCall");
  assert(payload.counts?.warning >= 2, "allow offline payload should keep warnings");
  print("OK", "Allow flags keep offline state as warnings but not readyToCall");
}

function checkBoardSummarySecretFree(args) {
  const secret = "super-secret-client-formal";
  const result = run([
    "--boardSummary",
    "--skipBoard",
    "--allowDirty",
    "--allowClientServerOffline",
    "--allowWindowsHostOffline",
    "--server",
    `http://${secret}.invalid`,
    "--timeoutMs",
    "1200",
  ], args);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.status === 0, "board summary with allow flags should exit 0");
  assertIncludes(result.stdout, "Mac client formal Windows test:", "board summary");
  assertIncludes(result.stdout, "RunPlan:", "board summary");
  assertIncludes(result.stdout, "Do not send passwords", "board summary");
  assertNotIncludes(output, secret, "board summary");
  print("OK", "Board summary is short and does not echo secret-like server text");
}

function checkHumanRunPlan(args) {
  const result = run([
    "--skipBoard",
    "--allowDirty",
    "--allowClientServerOffline",
    "--allowWindowsHostOffline",
    "--clientPort",
    "9",
    "--timeoutMs",
    "1200",
  ], args);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.status === 0, "human output with allow flags should exit 0");
  assertIncludes(result.stdout, "Formal run plan", "human runPlan");
  assertIncludes(result.stdout, "local-client", "human runPlan");
  assertIncludes(result.stdout, "browser-smoke", "human runPlan");
  assertIncludes(result.stdout, "passwordInCommandArguments=false", "human runPlan safety");
  assertIncludes(result.stdout, "inject=false", "human runPlan safety");
  assertNotIncludes(output, "LAN_DUAL_PASSWORD", "human runPlan output");
  print("OK", "Human output includes formal run plan and safety boundaries");
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
    env: { ...process.env },
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
    name: "Mock Windows Host Formal",
    platform: "windows",
    host: "127.0.0.1",
    port,
    controlPort: port,
    runtime: {
      processId: 4321,
      buildId: "mock-formal-win-build",
      uptimeSeconds: 18
    },
    capabilities: {
      reverseControl: true,
      screen: {
        active: true,
        mode: "wgc",
        capturePipeline: "windows-wgc-helper-nv12-ffmpeg-h264",
        codec: "h264",
        h264Encoder: "h264_nvenc",
        videoTransports: ["json", "binary-jpeg", "binary-h264"]
      },
      audio: {
        active: true,
        mode: "wasapi",
        codec: "pcm-f32le-base64"
      },
      input: {
        enabled: true,
        mode: "log"
      },
      clipboard: {
        text: true,
        textMode: "system",
        file: true,
        fileMode: "clipboard"
      }
    }
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

async function checkReadyShape(args) {
  await withMacClientServer(args, async (clientPort) => {
    await withWindowsDiscoveryServer(async (windowsPort) => {
      const result = run([
        "--json",
        "--skipBoard",
        "--allowDirty",
        "--clientPort",
        String(clientPort),
        "--host",
        "127.0.0.1",
        "--port",
        String(windowsPort),
      ], args);
      const payload = parseJson(result.stdout, "ready shape JSON");
      assert(result.status === 0, `ready shape with skipBoard should exit 0.\n${result.stdout}\n${result.stderr}`);
      assert(payload.ok === true, "ready shape payload should be ok=true");
      assert(payload.readyToCall === false, "skipBoard should prevent readyToCall");
      assert(payload.checklist.some((entry) => entry.id === "client-server" && entry.status === "ok"), "client server should be ok");
      assert(payload.checklist.some((entry) => entry.id === "windows-host" && entry.status === "ok"), "Windows host should be ok");
      assert(payload.checklist.some((entry) => entry.id === "h264" && entry.status === "ok"), "H.264 should be ok");
      assert(payload.checklist.some((entry) => entry.id === "audio" && entry.status === "ok"), "audio should be ok");
      assert(payload.checklist.some((entry) => entry.id === "clipboard" && entry.status === "ok"), "clipboard should be ok");
      assert(payload.checklist.some((entry) => entry.id === "inject" && entry.status === "skip"), "inject should be skipped");
      assert(payload.runPlan?.target?.host === "127.0.0.1", "ready runPlan should include target host");
      assert(payload.runPlan?.target?.runtimeBuild === "mock-formal-win-build", "ready runPlan should include runtime build");
      assert(payload.runPlan?.commands?.browserSmoke?.includes("run-mac-client-formal-smoke.mjs"), "ready runPlan should include Mac browser smoke wrapper");
      assert(payload.runPlan?.commands?.browserSmoke?.includes("--host 127.0.0.1"), "ready runPlan should include target host");
      assert(payload.runPlan?.commands?.browserSmoke?.includes(`--port ${windowsPort}`), "ready runPlan should include target port");
      assert(payload.runPlan?.commands?.browserSmoke?.includes("--promptPassword"), "ready runPlan should use visible password prompt");
      assert(payload.runPlan?.safety?.authenticatesWebSocket === false, "formal checklist runPlan itself should not authenticate");
      assert(payload.runPlan?.safety?.requiresExplicitUserConfirmationForInject === true, "runPlan should require explicit inject confirmation");
      assertIncludes(payload.boardSummary || "", "windowsHost=online 127.0.0.1", "ready board summary");
      assertIncludes(payload.callText || "", "Suggested browser test:", "ready call text");
      assertNotIncludes(`${result.stdout}\n${result.stderr}`, "LAN_DUAL_PASSWORD", "ready output");
    });
  });
  print("OK", "Mock ready shape includes client/server/h264/audio/clipboard and skips inject");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  checkOfflineJson(args);
  checkAllowOfflineWarnings(args);
  checkBoardSummarySecretFree(args);
  checkHumanRunPlan(args);
  await checkReadyShape(args);
  print("OK", "Mac client formal status self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
