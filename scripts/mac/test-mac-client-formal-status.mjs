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

function assertMatches(text, pattern, label) {
  assert(pattern.test(String(text)), `${label} did not match ${pattern}.\n${text}`);
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

function runAsync(extraArgs, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...extraArgs], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: "",
      },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ status: null, stdout, stderr, error: new Error(`timed out after ${args.timeoutMs}ms`) });
    }, args.timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.once("close", (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr, error: null });
    });
  });
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

function assertNoSecretLikeText(text, label) {
  for (const secret of ["LAN_DUAL_PASSWORD", "super-secret", "demo-password", "token=", "password="]) {
    assertNotIncludes(text, secret, label);
  }
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function assertManualChecklist(checklist, label) {
  assert(Array.isArray(checklist), `${label} should be an array`);
  const ids = checklist.map((entry) => entry.id);
  for (const id of ["connection", "video", "audio", "clipboard", "input-ack", "diagnostics"]) {
    assert(ids.includes(id), `${label} should include ${id}`);
  }
  const combined = JSON.stringify(checklist);
  assertIncludes(combined, "Copy Diagnostics", `${label} diagnostics`);
  assertIncludes(combined, "Copy PowerShell", `${label} reverse grant PowerShell copy`);
  assertIncludes(combined, "Copy Node", `${label} reverse grant Node copy`);
  assertIncludes(combined, "password", `${label} password safety`);
  assertIncludes(combined, "input_event", `${label} reverse grant copy input safety`);
  assertNotIncludes(combined, "LAN_DUAL_PASSWORD", `${label}`);
}

function assertMacClientBrowserSelfTestCommand(command, label) {
  assertIncludes(command, "scripts/mac/test-mac-client-browser-self-test.mjs", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "scripts/windows/test-mac-client-browser.mjs", label);
  assertNotIncludes(command, "--useExistingHost", label);
  assertNotIncludes(command, "--useEnvPassword", label);
  assertNotIncludes(command, "--requirePassword", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
}

function assertWindowsHostStatusCommand(command, label, expectedPort = "43770") {
  assertIncludes(command, "scripts/windows/start-windows-host.mjs", label);
  assertIncludes(command, "--status", label);
  assertIncludes(command, "--host 127.0.0.1", label);
  assertIncludes(command, `--port ${expectedPort}`, label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
}

function assertMacClientFormalChecklistCommand(command, label, expectedHost = "<Windows IP>", expectedPort = "43770") {
  assertIncludes(command, "scripts/mac/check-mac-client-formal-status.mjs", label);
  assertIncludes(command, `--host ${expectedHost}`, label);
  assertIncludes(command, `--port ${expectedPort}`, label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "--json", label);
}

function assertReverseGrantBoardSummary(text, label, expectedPort = "43770") {
  assertIncludes(text, "WindowsReverseGrantStatus=pwsh -NoProfile -ExecutionPolicy Bypass", label);
  assertIncludes(text, `-Port ${expectedPort} -Status -BoardSummary`, label);
  assertIncludes(text, "WindowsOpenOneTimeReverseGrant=pwsh -NoProfile -ExecutionPolicy Bypass", label);
  assertIncludes(text, `-Port ${expectedPort} -Grant -DurationMs 30000 -BoardSummary`, label);
  assertIncludes(text, "WindowsReverseGrantStatusNodeFallback=node scripts/windows/allow-windows-reverse-control.mjs", label);
  assertIncludes(text, `--port ${expectedPort} --status --boardSummary`, label);
  assertIncludes(text, "WindowsOpenOneTimeReverseGrantNodeFallback=node scripts/windows/allow-windows-reverse-control.mjs", label);
  assertIncludes(text, `--port ${expectedPort} --grant --durationMs 30000 --boardSummary`, label);
  assertNotIncludes(text, "--password", label);
}

function assertSecureAuthPath(text, label, expectedPort = "43770", options = {}) {
  if (options.expectBoardLabel) {
    assertIncludes(text, "SecureAuthPath=", label);
  }
  assertIncludes(text, "same temporary password", label);
  assertIncludes(text, "WindowsSecureAuthStart=powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/start-windows-host.ps1", label);
  assertIncludes(text, `-Port ${expectedPort} -PromptPassword -RequirePassword`, label);
  assertIncludes(text, "WindowsSecureAuthStartNodeFallback=node scripts/windows/start-windows-host.mjs", label);
  assertIncludes(text, `--port ${expectedPort} --promptPassword --requirePassword`, label);
  assertNotIncludes(text, "--password", label);
  assertNotIncludes(text, "LAN_DUAL_PASSWORD=", label);
  assertNotIncludes(text, "token=", label);
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assertIncludes(result.stdout, "Usage:", `${script} ${flag}`);
    assertIncludes(result.stdout, "--sendCall", `${script} ${flag}`);
    assertIncludes(result.stdout, "--forceCall", `${script} ${flag}`);
    assertIncludes(result.stdout, "runPlan.manualChecklist", `${script} ${flag}`);
    assertIncludes(result.stdout, "runPlan.commands.safePreflightWithEnsureClient", `${script} ${flag}`);
    assertIncludes(result.stdout, "runPlan.commands.sendCallWithEnsureClient", `${script} ${flag}`);
    assertIncludes(result.stdout, "runPlan.commands.macClientFormalChecklist", `${script} ${flag}`);
    assertIncludes(result.stdout, "runPlan.commands.macClientBrowserSelfTest", `${script} ${flag}`);
    assertIncludes(result.stdout, "runPlan.commands.windowsHostStatus", `${script} ${flag}`);
    assertIncludes(result.stdout, "runPlan.commands.windowsReverseGrantStatus", `${script} ${flag}`);
    assertIncludes(result.stdout, "runPlan.commands.windowsOpenOneTimeReverseGrant", `${script} ${flag}`);
    assertIncludes(result.stdout, "runPlan.commands.windowsReverseGrantStatusNodeFallback", `${script} ${flag}`);
    assertIncludes(result.stdout, "runPlan.commands.windowsOpenOneTimeReverseGrantNodeFallback", `${script} ${flag}`);
    assertIncludes(result.stdout, "runPlan.commands.reverseControlRehearsal", `${script} ${flag}`);
    assertIncludes(result.stdout, "runPlan.commands.reverseGrantCopyAction", `${script} ${flag}`);
    assertIncludes(result.stdout, "runPlan.commands.secureAuthPath", `${script} ${flag}`);
    assertIncludes(result.stdout, "runPlan.commands.windowsSecureAuthStart", `${script} ${flag}`);
    assertIncludes(result.stdout, "runPlan.commands.windowsSecureAuthStartNodeFallback", `${script} ${flag}`);
    assertIncludes(result.stdout, "--ensureClient", `${script} ${flag}`);
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
  assert(payload.checklist.some((entry) => entry.id === "client-server" && String(entry.next || "").includes("start-mac-client.mjs --allowExisting")), "offline client server next step should suggest start helper");
  assert(payload.checklist.some((entry) => entry.id === "client-server" && String(entry.next || "").includes("run-mac-client-formal-smoke.mjs --discover --ensureClient")), "offline client server next step should suggest ensureClient smoke wrapper");
  assert(payload.checklist.some((entry) => entry.id === "windows-host" && String(entry.next || "").includes("discover-windows-hosts.mjs")), "offline Windows host next step should suggest discovery helper");
  assert(payload.runPlan?.safety?.passwordRequestedByThisScript === false, "offline runPlan should not request passwords");
  assert(payload.runPlan?.safety?.passwordInCommandArguments === false, "offline runPlan should keep passwords out of argv");
  assert(payload.runPlan?.safety?.inject === false, "offline runPlan should not run inject");
  assert(payload.runPlan?.commands?.discoverWindowsHost?.includes("discover-windows-hosts.mjs"), "offline runPlan should include discovery command");
  assert(payload.runPlan?.commands?.ensureMacClient?.includes("start-mac-client.mjs --allowExisting"), "offline runPlan should include start/reuse client command");
  assert(payload.runPlan?.commands?.safePreflightWithEnsureClient?.includes("--discover --ensureClient --preflightOnly --boardSummary"), "offline runPlan should include ensureClient preflight command");
  assert(payload.runPlan?.commands?.sendCallWithEnsureClient?.includes("--discover --ensureClient --preflightOnly --sendCall"), "offline runPlan should include ensureClient sendCall command");
  assertMacClientFormalChecklistCommand(payload.runPlan?.commands?.macClientFormalChecklist || "", "offline runPlan Mac client formal checklist command");
  assertWindowsHostStatusCommand(payload.runPlan?.commands?.windowsHostStatus || "", "offline runPlan Windows host status command");
  assertMacClientBrowserSelfTestCommand(
    payload.runPlan?.commands?.macClientBrowserSelfTest || "",
    "offline runPlan Mac client browser self-test command",
  );
  assert(payload.runPlan?.commands?.windowsReverseGrantStatus?.includes("allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Status -BoardSummary"), "offline runPlan should include recommended Windows PowerShell reverse grant status command");
  assert(payload.runPlan?.commands?.windowsOpenOneTimeReverseGrant?.includes("allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Grant -DurationMs 30000 -BoardSummary"), "offline runPlan should include recommended Windows PowerShell one-time grant command");
  assert(payload.runPlan?.commands?.windowsReverseGrantStatusNodeFallback?.includes("allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --status --boardSummary"), "offline runPlan should include Windows reverse grant Node fallback command");
  assert(payload.runPlan?.commands?.windowsOpenOneTimeReverseGrantNodeFallback?.includes("allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --grant --durationMs 30000 --boardSummary"), "offline runPlan should include Windows one-time grant Node fallback command");
  assertIncludes(payload.runPlan?.commands?.reverseControlRehearsal || "", "PowerShell", "offline reverse rehearsal command");
  assertIncludes(payload.runPlan?.commands?.reverseControlRehearsal || "", "LAN008", "offline reverse rehearsal command");
  assertIncludes(payload.runPlan?.commands?.reverseControlRehearsal || "", "临时授权已使用", "offline reverse rehearsal command");
  assertIncludes(payload.runPlan?.commands?.reverseGrantCopyAction || "", "Copy PowerShell", "offline reverse grant copy action");
  assertIncludes(payload.runPlan?.commands?.reverseGrantCopyAction || "", "Copy Node", "offline reverse grant copy action");
  assertSecureAuthPath(payload.runPlan?.commands?.secureAuthPath || "", "offline secure auth path");
  assertSecureAuthPath(payload.boardSummary || "", "offline board summary secure auth path", "43770", { expectBoardLabel: true });
  assert(payload.runPlan?.steps?.some((step) => step.id === "browser-smoke"), "offline runPlan should include browser smoke step");
  assert(payload.runPlan?.steps?.some((step) => step.id === "local-browser-self-test" && String(step.command || "").includes("scripts/mac/test-mac-client-browser-self-test.mjs")), "offline runPlan should include local browser self-test step");
  assert(payload.runPlan?.steps?.some((step) => step.id === "reverse-control-request"), "offline runPlan should include reverse control request step");
  assertManualChecklist(payload.runPlan?.manualChecklist, "offline manual checklist");
  assert(payload.runPlan?.safety?.reverseControlRequestSendsInput === false, "offline runPlan should say reverse request sends no input");
  assert(payload.runPlan?.safety?.windowsReverseGrantLoopbackOnly === true, "offline runPlan should keep Windows grant loopback-only");
  assertIncludes(payload.boardSummary || "", "Do not send passwords", "offline board summary");
  assertMatches(payload.boardSummary || "", /blockers=[^.]*client-server/, "offline board summary blockers");
  assertMatches(payload.boardSummary || "", /blockers=[^.]*windows-host/, "offline board summary blockers");
  assertMatches(payload.boardSummary || "", /warnings=[^.]*board/, "offline board summary warnings");
  assertIncludes(payload.boardSummary || "", "Reverse rehearsal:", "offline board summary");
  assertReverseGrantBoardSummary(payload.boardSummary || "", "offline board summary");
  assertIncludes(payload.boardSummary || "", "WindowsHostStatus=node scripts/windows/start-windows-host.mjs --status --host 127.0.0.1 --port 43770 --boardSummary", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs --host <Windows IP> --port 43770 --boardSummary", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacClientBrowserSelfTest=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "allow-windows-reverse-control.mjs", "offline board summary");
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
  assertIncludes(payload.boardSummary || "", "blockers=none", "allow offline board summary");
  assertMatches(payload.boardSummary || "", /warnings=[^.]*client-server/, "allow offline board summary warnings");
  assertMatches(payload.boardSummary || "", /warnings=[^.]*board/, "allow offline board summary warnings");
  assertMatches(payload.boardSummary || "", /warnings=[^.]*windows-host/, "allow offline board summary warnings");
  assertReverseGrantBoardSummary(payload.boardSummary || "", "allow offline board summary");
  assertSecureAuthPath(payload.boardSummary || "", "allow offline board summary secure auth path", "43770", { expectBoardLabel: true });
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
    "--clientPort",
    "9",
    "--server",
    `http://${secret}.invalid`,
    "--timeoutMs",
    "1200",
  ], args);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.status === 0, "board summary with allow flags should exit 0");
  assertIncludes(result.stdout, "Mac client formal Windows test:", "board summary");
  assertIncludes(result.stdout, "blockers=none", "board summary");
  assertMatches(result.stdout, /warnings=[^.]*client-server/, "board summary warnings");
  assertMatches(result.stdout, /warnings=[^.]*board/, "board summary warnings");
  assertMatches(result.stdout, /warnings=[^.]*windows-host/, "board summary warnings");
  assertIncludes(result.stdout, "RunPlan:", "board summary");
  assertIncludes(result.stdout, "WindowsHostStatus=", "board summary");
  assertIncludes(result.stdout, "start-windows-host.mjs --status --host 127.0.0.1 --port 43770 --boardSummary", "board summary");
  assertIncludes(result.stdout, "MacClientFormalChecklist=", "board summary");
  assertIncludes(result.stdout, "check-mac-client-formal-status.mjs --host <Windows IP> --port 43770 --boardSummary", "board summary");
  assertIncludes(result.stdout, "Reverse rehearsal:", "board summary");
  assertIncludes(result.stdout, "ReverseGrantCopy=", "board summary");
  assertReverseGrantBoardSummary(result.stdout, "board summary");
  assertSecureAuthPath(result.stdout, "board summary secure auth path", "43770", { expectBoardLabel: true });
  assertIncludes(result.stdout, "Copy Node", "board summary");
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
  assertIncludes(result.stdout, "local-browser-self-test", "human runPlan");
  assertIncludes(result.stdout, "reverse-control-request", "human runPlan");
  assertIncludes(result.stdout, "Windows host status for Windows side:", "human runPlan");
  assertIncludes(result.stdout, "start-windows-host.mjs --status --host 127.0.0.1 --port 43770 --boardSummary", "human runPlan");
  assertIncludes(result.stdout, "Mac client formal checklist:", "human runPlan");
  assertIncludes(result.stdout, "check-mac-client-formal-status.mjs --host <Windows IP> --port 43770 --boardSummary", "human runPlan");
  assertIncludes(result.stdout, "Secure auth path:", "human runPlan");
  assertSecureAuthPath(result.stdout, "human runPlan secure auth path");
  assertIncludes(result.stdout, "Manual true-test checklist", "human manual checklist");
  assertIncludes(result.stdout, "connection:", "human manual checklist");
  assertIncludes(result.stdout, "diagnostics:", "human manual checklist");
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

function readRequestBody(request) {
  return new Promise((resolveRead, rejectRead) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy(new Error("request body too large"));
      }
    });
    request.on("end", () => resolveRead(body));
    request.on("error", rejectRead);
  });
}

async function withFakeBoard(callback, options = {}) {
  const calls = [];
  let currentCall = options.currentCall || null;
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/api/state") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        updatedAt: new Date().toISOString(),
        currentCall,
        statuses: {},
        events: [
          {
            id: "fake-board-client-formal-1",
            at: new Date().toISOString(),
            type: "message",
            from: "Fake Board",
            text: "ready",
          },
        ],
      }));
      return;
    }
    if (request.method === "POST" && request.url === "/api/call") {
      const body = await readRequestBody(request);
      currentCall = JSON.parse(body || "{}");
      calls.push(currentCall);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "not found" }));
  });
  const address = await listenServer(server);
  try {
    await callback({
      serverUrl: `http://${address.address}:${address.port}`,
      calls,
    });
  } finally {
    await closeServer(server);
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

function listenServer(server) {
  return new Promise((resolveListen, rejectListen) => {
    server.on("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        rejectListen(new Error("server did not expose an address"));
        return;
      }
      resolveListen(address);
    });
  });
}

function closeServer(server) {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
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
      assert(payload.runPlan?.commands?.browserSmoke?.includes("--ensureClient"), "ready runPlan should ensure local Mac client for browser smoke");
      assert(payload.runPlan?.commands?.browserSmoke?.includes("--promptPassword"), "ready runPlan should use visible password prompt");
      assertMacClientBrowserSelfTestCommand(
        payload.runPlan?.commands?.macClientBrowserSelfTest || "",
        "ready runPlan Mac client browser self-test command",
      );
      assertWindowsHostStatusCommand(
        payload.runPlan?.commands?.windowsHostStatus || "",
        "ready runPlan Windows host status command",
        String(windowsPort),
      );
      assert(payload.runPlan?.commands?.windowsReverseGrantStatus?.includes(`-Port ${windowsPort} -Status -BoardSummary`), "ready runPlan should include target Windows PowerShell reverse grant status command");
      assert(payload.runPlan?.commands?.windowsOpenOneTimeReverseGrant?.includes(`-Port ${windowsPort} -Grant -DurationMs 30000 -BoardSummary`), "ready runPlan should include target Windows PowerShell one-time reverse grant command");
      assert(payload.runPlan?.commands?.windowsReverseGrantStatusNodeFallback?.includes(`--port ${windowsPort} --status --boardSummary`), "ready runPlan should include target Windows reverse grant Node fallback command");
      assert(payload.runPlan?.commands?.windowsOpenOneTimeReverseGrantNodeFallback?.includes(`--port ${windowsPort} --grant --durationMs 30000 --boardSummary`), "ready runPlan should include target Windows one-time reverse grant Node fallback command");
      assertIncludes(payload.runPlan?.commands?.reverseControlRehearsal || "", "recommended PowerShell command", "ready reverse rehearsal");
      assertIncludes(payload.runPlan?.commands?.reverseControlRehearsal || "", "input_event", "ready reverse rehearsal");
      assertIncludes(payload.runPlan?.commands?.reverseGrantCopyAction || "", "Copy PowerShell", "ready reverse grant copy action");
      assertIncludes(payload.runPlan?.commands?.reverseGrantCopyAction || "", "Copy Node", "ready reverse grant copy action");
      assertSecureAuthPath(payload.runPlan?.commands?.secureAuthPath || "", "ready secure auth path", String(windowsPort));
      assert(payload.runPlan?.commands?.safePreflightWithEnsureClient?.includes(`--host 127.0.0.1 --port ${windowsPort} --ensureClient --preflightOnly --boardSummary`), "ready runPlan should include target-specific ensureClient preflight");
      assert(payload.runPlan?.commands?.sendCallWithEnsureClient?.includes(`--host 127.0.0.1 --port ${windowsPort} --ensureClient --preflightOnly --sendCall`), "ready runPlan should include target-specific ensureClient sendCall");
      assertMacClientFormalChecklistCommand(
        payload.runPlan?.commands?.macClientFormalChecklist || "",
        "ready runPlan Mac client formal checklist command",
        "127.0.0.1",
        String(windowsPort),
      );
      assert(payload.runPlan?.safety?.authenticatesWebSocket === false, "formal checklist runPlan itself should not authenticate");
      assert(payload.runPlan?.safety?.reverseControlRequestSendsInput === false, "ready runPlan should say reverse request sends no input");
      assert(payload.runPlan?.safety?.windowsReverseGrantLoopbackOnly === true, "ready runPlan should keep Windows grant loopback-only");
      assert(payload.runPlan?.safety?.requiresExplicitUserConfirmationForInject === true, "runPlan should require explicit inject confirmation");
      assert(payload.runPlan?.steps?.some((step) => step.id === "reverse-control-request" && String(step.command || "").includes("allow-windows-reverse-control.ps1")), "ready runPlan should include reverse control request step");
      assert(payload.runPlan?.steps?.some((step) => step.id === "local-browser-self-test" && String(step.command || "").includes("scripts/mac/test-mac-client-browser-self-test.mjs")), "ready runPlan should include local browser self-test step");
      assertManualChecklist(payload.runPlan?.manualChecklist, "ready manual checklist");
      assert(JSON.stringify(payload.runPlan?.manualChecklist || []).includes(`127.0.0.1:${windowsPort}`), "ready manual checklist should include target address");
      assertIncludes(payload.boardSummary || "", "windowsHost=online 127.0.0.1", "ready board summary");
      assertIncludes(payload.boardSummary || "", "blockers=none", "ready board summary");
      assertMatches(payload.boardSummary || "", /warnings=[^.]*board/, "ready board summary warnings");
      assertIncludes(payload.boardSummary || "", "ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics", "ready board summary");
      assertIncludes(payload.boardSummary || "", `WindowsHostStatus=node scripts/windows/start-windows-host.mjs --status --host 127.0.0.1 --port ${windowsPort} --boardSummary`, "ready board summary");
      assertIncludes(payload.boardSummary || "", `MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs --host 127.0.0.1 --port ${windowsPort} --boardSummary`, "ready board summary");
      assertIncludes(payload.boardSummary || "", "MacClientBrowserSelfTest=", "ready board summary");
      assertIncludes(payload.boardSummary || "", "ReverseGrantCopy=", "ready board summary");
      assertReverseGrantBoardSummary(payload.boardSummary || "", "ready board summary", String(windowsPort));
      assertSecureAuthPath(payload.boardSummary || "", "ready board summary secure auth path", String(windowsPort), { expectBoardLabel: true });
      assertIncludes(payload.boardSummary || "", "Reverse rehearsal:", "ready board summary");
      assertIncludes(payload.callText || "", "Suggested browser test:", "ready call text");
      assertNotIncludes(`${result.stdout}\n${result.stderr}`, "LAN_DUAL_PASSWORD", "ready output");
    });
  });
  print("OK", "Mock ready shape includes client/server/h264/audio/clipboard and skips inject");
}

async function checkOfflineSendCallRefuses(args) {
  await withFakeBoard(async (board) => {
    const result = await runAsync([
      "--json",
      "--sendCall",
      "--allowDirty",
      "--clientPort",
      "9",
      "--server",
      board.serverUrl,
      "--timeoutMs",
      "1200",
    ], args);
    const payload = parseJson(result.stdout, "offline sendCall JSON");
    assert(result.status !== 0, "offline sendCall should fail");
    assert(payload.ok === false, "offline sendCall payload should report ok=false");
    assert(/Refusing to send Windows host formal call/.test(payload.error?.message || ""), "offline sendCall should explain refusal");
    assert(board.calls.length === 0, "offline sendCall should not post a board call");
    assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "offline sendCall refusal");
  });
  print("OK", "Offline --sendCall refuses before posting to Agent Link Board");
}

async function checkReadySendCall(args) {
  await withMacClientServer(args, async (clientPort) => {
    await withWindowsDiscoveryServer(async (windowsPort) => {
      await withFakeBoard(async (board) => {
        const result = await runAsync([
          "--json",
          "--allowDirty",
          "--sendCall",
          "--clientPort",
          String(clientPort),
          "--host",
          "127.0.0.1",
          "--port",
          String(windowsPort),
          "--server",
          board.serverUrl,
        ], args);
        const payload = parseJson(result.stdout, "ready sendCall JSON");
        assert(result.status === 0, `ready sendCall should exit 0:\n${result.stdout}\n${result.stderr}`);
        assert(payload.readyToCall === true, "ready sendCall payload should be readyToCall");
        assert(payload.sentCall?.ok === true, "ready sendCall should include sentCall.ok");
        assert(board.calls.length === 1, `fake board should receive exactly one call, got ${board.calls.length}`);
        const call = board.calls[0];
        assert(call.status === "CALLING", "call should use CALLING status");
        assert(call.from === "Mac Codex", "call should identify Mac Codex as sender");
        assert(call.need === "Windows Codex", "call should request Windows Codex");
        assert(call.goal === "正式端到端验收 Windows host", "call should describe Windows host formal goal");
        assert(call.connection === `127.0.0.1:${windowsPort}`, "call should use discovered Windows host address");
        assert(call.command === "node scripts/windows/start-windows-host.mjs --status --json", "call command should be executable on Windows side");
        assertIncludes(call.expected, "run-mac-client-formal-smoke.mjs", "ready call expected");
        assertIncludes(call.expected, `--port ${windowsPort}`, "ready call expected");
        assertIncludes(call.expected, "--ensureClient", "ready call expected");
        assertIncludes(call.expected, "反控请求安全演练", "ready call expected");
        assertIncludes(call.expected, "LAN008", "ready call expected");
        assertIncludes(call.expected, "不要执行 inject", "ready call expected");
        assertIncludes(call.ask, "allow-windows-reverse-control.ps1", "ready call ask");
        assertIncludes(call.ask, `-Port ${windowsPort}`, "ready call ask");
        assertIncludes(call.ask, "allow-windows-reverse-control.mjs", "ready call ask");
        assertIncludes(call.ask, `--port ${windowsPort}`, "ready call ask");
        assertIncludes(call.ask, "密码不要发在联络板", "ready call ask");
        assertIncludes(call.ask, "明确确认", "ready call ask");
        assertNoSecretLikeText(JSON.stringify(call), "ready sendCall board call");
        for (const field of ["status", "from", "need", "goal", "environment", "connection", "command", "expected", "ask", "owner", "timeout"]) {
          assert(call[field] === payload.sentCall.payload[field], `sentCall payload should match fake board call field ${field}`);
        }
      });
    });
  });
  print("OK", "Ready --sendCall posts one Windows-host formal call to a fake board");
}

async function checkExistingBoardCallProtection(args) {
  const existingCall = {
    status: "CALLING",
    from: "Windows Codex",
    need: "Mac Codex",
    goal: "Windows input status review",
    ask: "Please wait for this review.",
  };
  await withMacClientServer(args, async (clientPort) => {
    await withWindowsDiscoveryServer(async (windowsPort) => {
      await withFakeBoard(async (board) => {
        const result = await runAsync([
          "--json",
          "--allowDirty",
          "--sendCall",
          "--clientPort",
          String(clientPort),
          "--host",
          "127.0.0.1",
          "--port",
          String(windowsPort),
          "--server",
          board.serverUrl,
        ], args);
        const payload = parseJson(result.stdout, "existing call sendCall JSON");
        assert(result.status !== 0, "sendCall should fail when a board call already exists");
        assert(payload.ok === false, "existing-call refusal should report ok=false");
        assert(/Refusing to replace existing Agent Link Board call/.test(payload.error?.message || ""), "existing-call refusal should explain overwrite guard");
        assert(/Windows input status review/.test(payload.error?.message || ""), "existing-call refusal should name the existing call");
        assert(board.calls.length === 0, "existing-call refusal should not post a replacement call");
        assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "existing-call sendCall refusal");
      }, { currentCall: existingCall });
    });
  });
  print("OK", "Ready --sendCall refuses to overwrite an existing board call");
}

async function checkDoneBoardCallDoesNotBlock(args) {
  const doneCall = {
    status: "done",
    from: "Windows Codex",
    need: "Mac Codex",
    goal: "Completed safe probe",
  };
  await withMacClientServer(args, async (clientPort) => {
    await withWindowsDiscoveryServer(async (windowsPort) => {
      await withFakeBoard(async (board) => {
        const result = await runAsync([
          "--json",
          "--allowDirty",
          "--sendCall",
          "--clientPort",
          String(clientPort),
          "--host",
          "127.0.0.1",
          "--port",
          String(windowsPort),
          "--server",
          board.serverUrl,
        ], args);
        const payload = parseJson(result.stdout, "done call sendCall JSON");
        assert(result.status === 0, `DONE board call should not block sendCall:\n${result.stdout}\n${result.stderr}`);
        assert(payload.boardCallBeforeSend?.active === false, "DONE board call should be recorded as inactive");
        assert(payload.boardCallBeforeSend?.status === doneCall.status, "DONE board call status should be preserved");
        assert(payload.sentCall?.ok === true, "sendCall should succeed after DONE board call");
        assert(board.calls.length === 1, `DONE board call path should post one new call, got ${board.calls.length}`);
        assertNoSecretLikeText(`${result.stdout}\n${result.stderr}`, "done-call sendCall");
      }, { currentCall: doneCall });
    });
  });
  print("OK", "Ready --sendCall ignores completed Agent Link Board calls");
}

async function checkForceSendCall(args) {
  const existingCall = {
    status: "CALLING",
    from: "Windows Codex",
    need: "Mac Codex",
    goal: "Old coordinated test call",
  };
  await withMacClientServer(args, async (clientPort) => {
    await withWindowsDiscoveryServer(async (windowsPort) => {
      await withFakeBoard(async (board) => {
        const result = await runAsync([
          "--json",
          "--allowDirty",
          "--sendCall",
          "--forceCall",
          "--clientPort",
          String(clientPort),
          "--host",
          "127.0.0.1",
          "--port",
          String(windowsPort),
          "--server",
          board.serverUrl,
        ], args);
        const payload = parseJson(result.stdout, "force sendCall JSON");
        assert(result.status === 0, `force sendCall should exit 0:\n${result.stdout}\n${result.stderr}`);
        assert(payload.sentCall?.ok === true, "force sendCall should include sentCall.ok");
        assert(payload.boardCallBeforeSend?.active === true, "force sendCall should record existing board call");
        assert(payload.boardCallBeforeSend?.goal === existingCall.goal, "force sendCall should record existing board call goal");
        assert(board.calls.length === 1, `force sendCall should post exactly one replacement call, got ${board.calls.length}`);
        assertNoSecretLikeText(JSON.stringify(board.calls[0]), "force sendCall board call");
      }, { currentCall: existingCall });
    });
  });
  print("OK", "Ready --sendCall --forceCall can replace an existing board call explicitly");
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
  await checkOfflineSendCallRefuses(args);
  await checkReadySendCall(args);
  await checkExistingBoardCallProtection(args);
  await checkDoneBoardCallDoesNotBlock(args);
  await checkForceSendCall(args);
  print("OK", "Mac client formal status self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
