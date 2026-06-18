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

function assertMacClientFormalChecklistCommand(command, label, expectedHost = "127.0.0.1", expectedPort = "") {
  assertIncludes(command, "scripts/mac/check-mac-client-formal-status.mjs", label);
  assertIncludes(command, "--boardSummary", label);
  if (expectedHost) assertIncludes(command, `--host ${expectedHost}`, label);
  if (expectedPort) assertIncludes(command, `--port ${expectedPort}`, label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--json", label);
}

function assertReverseGrantBoardSummary(text, label, expectedPort) {
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

function assertSecureAuthPath(text, label, expectedPort, options = {}) {
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

async function withBoardServer(callback) {
  const port = await getFreePort();
  const child = spawn(process.execPath, [
    "--input-type=module",
    "-e",
    `
import { createServer } from "node:http";
const port = Number(process.argv[1]);
const state = {
  updatedAt: new Date().toISOString(),
  currentCall: null,
  statuses: {},
  events: [],
};
const server = createServer((request, response) => {
  const pathname = new URL(request.url || "/", \`http://\${request.headers.host || "127.0.0.1"}\`).pathname;
  if (pathname === "/api/state") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(state));
    return;
  }
  if (pathname === "/api/call" && request.method === "POST") {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        state.currentCall = JSON.parse(body);
      } catch {
        state.currentCall = { status: "CALLING" };
      }
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ ok: false, error: "not found" }));
});
server.listen(port, "127.0.0.1");
`,
    String(port),
  ], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForHttpPath(port, "/api/state", 5000);
    await callback(`http://127.0.0.1:${port}`);
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
    assertIncludes(result.stdout, "--ensureClient", `${script} ${flag}`);
    assertIncludes(result.stdout, "Machine-readable JSON fields", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macClientFormalChecklist", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.preflight", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.sendCall", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.browserSmoke", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macClientBrowserSelfTest", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.windowsReverseGrantStatus", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.windowsOpenOneTimeReverseGrant", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.windowsReverseGrantStatusNodeFallback", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.windowsOpenOneTimeReverseGrantNodeFallback", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.reverseControlRehearsal", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.reverseGrantCopyAction", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.secureAuthPath", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.windowsSecureAuthStart", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.windowsSecureAuthStartNodeFallback", `${script} ${flag}`);
    assertIncludes(result.stdout, "ensuredClient", `${script} ${flag}`);
    assertIncludes(result.stdout, "discovery.formalChecklistCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "discovery.manualChecklistSummary", `${script} ${flag}`);
    assertIncludes(result.stdout, "sentCall", `${script} ${flag}`);
    assertIncludes(result.stdout, "--discover --ensureClient --preflightOnly --sendCall", `${script} ${flag}`);
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

function checkSendCallRequiresPreflight(args) {
  const result = run(["--json", "--sendCall", "--host", "127.0.0.1"], args);
  const payload = parseJson(result.stdout, "sendCall without preflight JSON");
  assert(result.status !== 0, "sendCall without preflight should fail");
  assertIncludes(payload.error?.message || "", "--preflightOnly", "sendCall without preflight error");
  print("OK", "sendCall cannot accidentally enter auth mode");
}

async function checkPreflightAndDryRun(args) {
  const secret = "super-secret-smoke-password";
  await withMacClientServer(args, async (clientPort) => {
    await withWindowsDiscoveryServer(async (windowsPort) => {
      await withBoardServer(async (boardServer) => {
        const preflight = run([
          "--json",
          "--preflightOnly",
          "--host",
          "127.0.0.1",
          "--port",
          String(windowsPort),
          "--clientPort",
          String(clientPort),
          "--server",
          boardServer,
          "--timeoutMs",
          "10000",
        ], args, { LAN_DUAL_PASSWORD: secret });
        const preflightPayload = parseJson(preflight.stdout, "preflight JSON");
        assert(preflight.status === 0, `preflight should pass.\n${preflight.stdout}\n${preflight.stderr}`);
        assert(preflightPayload.ok === true, "preflight should be ok=true");
        assert(preflightPayload.preflightOnly === true, "preflightOnly should be recorded");
        assert(preflightPayload.preflight?.ok === true, "nested formal preflight should be ok=true");
        assert(preflightPayload.preflight?.readyToCall === true, "custom board server should allow readyToCall");
        assert(preflightPayload.ensuredClient?.attempted === false, "preflight without ensureClient should record no ensure attempt");
        assertMacClientFormalChecklistCommand(
          preflightPayload.commands?.macClientFormalChecklist || "",
          "preflight Mac client formal checklist command",
          "127.0.0.1",
          String(windowsPort),
        );
        assert(preflightPayload.commands?.preflight?.includes("check-mac-client-formal-status.mjs"), "preflight should expose formal checklist command");
        assert(preflightPayload.commands?.sendCall?.includes("--sendCall"), "preflight should expose sendCall command");
        assert(preflightPayload.commands?.sendCall?.includes(`--server ${boardServer}`), "sendCall command should preserve custom board server");
        assert(preflightPayload.commands?.discoverPreflight?.includes("--discover"), "preflight should expose safe discovery retry command");
        assert(preflightPayload.commands?.browserSmoke?.includes("--useEnvPassword"), "preflight should expose env-password browser command shape");
        assertMacClientBrowserSelfTestCommand(
          preflightPayload.commands?.macClientBrowserSelfTest || "",
          "preflight Mac client browser self-test command",
        );
        assert(preflightPayload.commands?.windowsReverseGrantStatus?.includes(`-Port ${windowsPort} -Status -BoardSummary`), "preflight should expose recommended Windows PowerShell reverse grant status command");
        assert(preflightPayload.commands?.windowsOpenOneTimeReverseGrant?.includes(`-Port ${windowsPort} -Grant -DurationMs 30000 -BoardSummary`), "preflight should expose recommended Windows PowerShell one-time grant command");
        assert(preflightPayload.commands?.windowsReverseGrantStatusNodeFallback?.includes(`--port ${windowsPort} --status --boardSummary`), "preflight should expose Windows reverse grant Node fallback command");
        assert(preflightPayload.commands?.windowsOpenOneTimeReverseGrantNodeFallback?.includes(`--port ${windowsPort} --grant --durationMs 30000 --boardSummary`), "preflight should expose Windows one-time grant Node fallback command");
        assertIncludes(preflightPayload.commands?.reverseControlRehearsal || "", "PowerShell", "preflight reverse rehearsal");
        assertIncludes(preflightPayload.commands?.reverseControlRehearsal || "", "LAN008", "preflight reverse rehearsal");
        assertIncludes(preflightPayload.commands?.reverseControlRehearsal || "", "临时授权已使用", "preflight reverse rehearsal");
        assertIncludes(preflightPayload.commands?.reverseGrantCopyAction || "", "Copy PowerShell", "preflight reverse grant copy action");
        assertIncludes(preflightPayload.commands?.reverseGrantCopyAction || "", "Copy Node", "preflight reverse grant copy action");
        assertSecureAuthPath(preflightPayload.commands?.secureAuthPath || "", "preflight secure auth path", windowsPort);
        assertSecureAuthPath(preflightPayload.boardSummary || "", "preflight board summary secure auth path", windowsPort, { expectBoardLabel: true });
        assertIncludes(preflightPayload.boardSummary || "", "Coordinate first", "preflight board summary");
        assertIncludes(preflightPayload.boardSummary || "", "--sendCall", "preflight board summary");
        assertIncludes(preflightPayload.boardSummary || "", "blockers=none", "preflight board summary");
        assertIncludes(preflightPayload.boardSummary || "", "warnings=", "preflight board summary");
        assertIncludes(preflightPayload.boardSummary || "", "MacClientFormalChecklist=", "preflight board summary");
        assertIncludes(preflightPayload.boardSummary || "", `--port ${windowsPort}`, "preflight board summary");
        assertIncludes(preflightPayload.boardSummary || "", "MacClientBrowserSelfTest=", "preflight board summary");
        assertIncludes(preflightPayload.boardSummary || "", "ReverseGrantCopy=", "preflight board summary");
        assertReverseGrantBoardSummary(preflightPayload.boardSummary || "", "preflight board summary", windowsPort);
        assertIncludes(preflightPayload.boardSummary || "", "Reverse rehearsal after auth", "preflight board summary");
        assertIncludes(preflightPayload.boardSummary || "", "allow-windows-reverse-control.ps1", "preflight board summary");
        assertIncludes(preflightPayload.boardSummary || "", "allow-windows-reverse-control.mjs", "preflight board summary");
        assertNotIncludes(`${preflight.stdout}\n${preflight.stderr}`, secret, "preflight output");

        const sendCall = run([
          "--json",
          "--preflightOnly",
          "--sendCall",
          "--allowDirty",
          "--host",
          "127.0.0.1",
          "--port",
          String(windowsPort),
          "--clientPort",
          String(clientPort),
          "--server",
          boardServer,
          "--timeoutMs",
          "10000",
        ], args, { LAN_DUAL_PASSWORD: secret });
        const sendCallPayload = parseJson(sendCall.stdout, "sendCall JSON");
        assert(sendCall.status === 0, `sendCall should pass.\n${sendCall.stdout}\n${sendCall.stderr}`);
        assert(sendCallPayload.ok === true, "sendCall payload should be ok=true");
        assert(sendCallPayload.sentCall?.attempted === true, "sendCall should record an attempted board call");
        assert(sendCallPayload.sentCall?.ok === true, "sendCall should report sentCall ok");
        assert("boardCallBeforeSend" in sendCallPayload.sentCall, "sendCall should expose prior board call state");
        assert(sendCallPayload.sentCall?.payload?.goal === "正式端到端验收 Windows host", "sendCall payload should keep formal goal");
        assertIncludes(sendCallPayload.boardSummary || "", "Agent Link Board call was sent", "sendCall board summary");
        assertIncludes(sendCallPayload.boardSummary || "", "blockers=none", "sendCall board summary");
        assertIncludes(sendCallPayload.boardSummary || "", "warnings=", "sendCall board summary");
        assertIncludes(sendCallPayload.boardSummary || "", "MacClientFormalChecklist=", "sendCall board summary");
        assertIncludes(sendCallPayload.boardSummary || "", `--port ${windowsPort}`, "sendCall board summary");
        assertIncludes(sendCallPayload.boardSummary || "", "ReverseGrantCopy=", "sendCall board summary");
        assertReverseGrantBoardSummary(sendCallPayload.boardSummary || "", "sendCall board summary", windowsPort);
        assertIncludes(sendCallPayload.boardSummary || "", "Reverse rehearsal after auth", "sendCall board summary");
        assertNotIncludes(`${sendCall.stdout}\n${sendCall.stderr}`, secret, "sendCall output");
      });

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
      assert(dryRunPayload.ensuredClient?.attempted === false, "dryRun without ensureClient should record no ensure attempt");
      assertMacClientFormalChecklistCommand(
        dryRunPayload.commands?.macClientFormalChecklist || "",
        "dryRun Mac client formal checklist command",
        "127.0.0.1",
        String(windowsPort),
      );
      assert(dryRunPayload.commands?.preflight?.includes("check-mac-client-formal-status.mjs"), "dryRun should expose preflight command");
      assert(dryRunPayload.commands?.sendCall?.includes("--sendCall"), "dryRun should expose sendCall command");
      assert(dryRunPayload.commands?.discoverPreflight?.includes("--discover"), "dryRun should expose safe discovery command");
      assert(dryRunPayload.commands?.browserSmoke?.includes("--useEnvPassword"), "dryRun should use environment password flag");
      assert(dryRunPayload.commands?.browserSmoke?.includes("--requirePassword"), "dryRun should require password in child command");
      assertMacClientBrowserSelfTestCommand(
        dryRunPayload.commands?.macClientBrowserSelfTest || "",
        "dryRun Mac client browser self-test command",
      );
      assert(dryRunPayload.commands?.windowsReverseGrantStatus?.includes(`-Port ${windowsPort} -Status -BoardSummary`), "dryRun should expose recommended Windows PowerShell reverse grant status command");
      assert(dryRunPayload.commands?.windowsOpenOneTimeReverseGrant?.includes(`-Port ${windowsPort} -Grant -DurationMs 30000 -BoardSummary`), "dryRun should expose recommended Windows PowerShell one-time grant command");
      assert(dryRunPayload.commands?.windowsReverseGrantStatusNodeFallback?.includes(`--port ${windowsPort} --status --boardSummary`), "dryRun should expose Windows reverse grant Node fallback command");
      assert(dryRunPayload.commands?.windowsOpenOneTimeReverseGrantNodeFallback?.includes(`--port ${windowsPort} --grant --durationMs 30000 --boardSummary`), "dryRun should expose Windows one-time grant Node fallback command");
      assertIncludes(dryRunPayload.commands?.reverseControlRehearsal || "", "recommended PowerShell command", "dryRun reverse rehearsal");
      assertIncludes(dryRunPayload.commands?.reverseGrantCopyAction || "", "Copy PowerShell", "dryRun reverse grant copy action");
      assertIncludes(dryRunPayload.commands?.reverseGrantCopyAction || "", "Copy Node", "dryRun reverse grant copy action");
      assertSecureAuthPath(dryRunPayload.commands?.secureAuthPath || "", "dryRun secure auth path", windowsPort);
      assertSecureAuthPath(dryRunPayload.boardSummary || "", "dryRun board summary secure auth path", windowsPort, { expectBoardLabel: true });
      assertIncludes(dryRunPayload.boardSummary || "", "blockers=none", "dryRun board summary");
      assert(/warnings=[^.]*board/.test(dryRunPayload.boardSummary || ""), "dryRun board summary should name board warning");
      assertIncludes(dryRunPayload.boardSummary || "", "warnings=", "dryRun board summary");
      assertIncludes(dryRunPayload.boardSummary || "", "MacClientFormalChecklist=", "dryRun board summary");
      assertReverseGrantBoardSummary(dryRunPayload.boardSummary || "", "dryRun board summary", windowsPort);
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
      assert(payload.discovery?.formalChecklistCommand?.includes(`--port ${windowsPort}`), "discover preflight should expose discovery formal checklist command");
      assert(payload.discovery?.manualChecklistSummary === "connection/video/audio/clipboard/input_ack/diagnostics", "discover preflight should expose manual checklist summary");
      assertMacClientFormalChecklistCommand(
        payload.commands?.macClientFormalChecklist || "",
        "discover preflight Mac client formal checklist command",
        "127.0.0.1",
        String(windowsPort),
      );
      assert(payload.commands?.sendCall?.includes("--sendCall"), "discover preflight should expose selected-host sendCall command");
      assert(payload.commands?.sendCall?.includes(`--port ${windowsPort}`), "discover preflight sendCall should use selected port");
      assert(payload.commands?.browserSmoke?.includes("--host 127.0.0.1"), "browser command should use discovered host");
      assertMacClientBrowserSelfTestCommand(
        payload.commands?.macClientBrowserSelfTest || "",
        "discover preflight Mac client browser self-test command",
      );
      assert(payload.commands?.windowsOpenOneTimeReverseGrant?.includes(`-Port ${windowsPort} -Grant -DurationMs 30000 -BoardSummary`), "discover preflight should use selected port for recommended Windows PowerShell grant helper");
      assert(payload.commands?.windowsOpenOneTimeReverseGrantNodeFallback?.includes(`--port ${windowsPort} --grant --durationMs 30000 --boardSummary`), "discover preflight should use selected port for Windows grant helper fallback");
      assertSecureAuthPath(payload.commands?.secureAuthPath || "", "discover preflight secure auth path", windowsPort);
      assertSecureAuthPath(payload.boardSummary || "", "discover preflight board summary secure auth path", windowsPort, { expectBoardLabel: true });
      assertIncludes(payload.boardSummary || "", "FormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs", "discover preflight board summary");
      assertIncludes(payload.boardSummary || "", "MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs", "discover preflight board summary");
      assertIncludes(payload.boardSummary || "", "blockers=none", "discover preflight board summary");
      assert(/warnings=[^.]*board/.test(payload.boardSummary || ""), "discover preflight board summary should name board warning");
      assertIncludes(payload.boardSummary || "", "warnings=", "discover preflight board summary");
      assertIncludes(payload.boardSummary || "", "ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics", "discover preflight board summary");
      assertIncludes(payload.boardSummary || "", "MacClientBrowserSelfTest=", "discover preflight board summary");
      assertIncludes(payload.boardSummary || "", "ReverseGrantCopy=", "discover preflight board summary");
      assertReverseGrantBoardSummary(payload.boardSummary || "", "discover preflight board summary", windowsPort);
      assertIncludes(payload.boardSummary || "", "Reverse rehearsal after auth", "discover preflight board summary");
      assertNotIncludes(`${result.stdout}\n${result.stderr}`, secret, "discover preflight output");
    });
  });
  print("OK", "Discovery preflight selects a Windows host without authenticating");
}

async function checkEnsureClientPreflight(args) {
  const secret = "super-secret-ensure-client-password";
  const clientPort = await getFreePort();
  await withWindowsDiscoveryServer(async (windowsPort) => {
    const result = run([
      "--json",
      "--skipBoard",
      "--preflightOnly",
      "--ensureClient",
      "--host",
      "127.0.0.1",
      "--port",
      String(windowsPort),
      "--clientPort",
      String(clientPort),
      "--timeoutMs",
      "10000",
    ], args, { LAN_DUAL_PASSWORD: secret });
    const payload = parseJson(result.stdout, "ensure client preflight JSON");
    assert(result.status === 0, `ensure client preflight should pass.\n${result.stdout}\n${result.stderr}`);
    assert(payload.ok === true, "ensure client preflight should be ok=true");
    assert(payload.args?.ensureClient === true, "ensure client flag should be recorded");
    assert(payload.ensuredClient?.attempted === true, "ensure client should be attempted");
    assert(payload.ensuredClient?.ok === true, "ensure client should report ok");
    assert(payload.ensuredClient?.online === true, "ensure client should report page online");
    assert(payload.ensuredClient?.url?.includes(`:${clientPort}`), "ensure client should report the local client URL");
    assert(payload.preflight?.ok === true, "ensure client preflight should be ok");
    assert(payload.preflight?.counts?.blocker === 0, "ensure client preflight should have no blockers");
    assertIncludes(payload.boardSummary || "", "blockers=none", "ensure client board summary");
    assertIncludes(payload.boardSummary || "", "MacClientFormalChecklist=", "ensure client board summary");
    assertReverseGrantBoardSummary(payload.boardSummary || "", "ensure client board summary", windowsPort);
    assertSecureAuthPath(payload.commands?.secureAuthPath || "", "ensure client secure auth path", windowsPort);
    assertSecureAuthPath(payload.boardSummary || "", "ensure client board summary secure auth path", windowsPort, { expectBoardLabel: true });
    assert(/warnings=[^.]*board/.test(payload.boardSummary || ""), "ensure client board summary should name board warning");
    assertNotIncludes(`${result.stdout}\n${result.stderr}`, secret, "ensure client output");
    if (payload.ensuredClient?.processId) {
      try {
        process.kill(payload.ensuredClient.processId, "SIGTERM");
      } catch {
        // The helper may already have exited.
      }
    }
  });
  print("OK", "ensureClient safely starts the local Mac client before preflight");
}

async function checkDiscoverSendCall(args) {
  const secret = "super-secret-discover-send-call-password";
  await withMacClientServer(args, async (clientPort) => {
    await withWindowsDiscoveryServer(async (windowsPort) => {
      await withBoardServer(async (boardServer) => {
        const result = run([
          "--json",
          "--preflightOnly",
          "--sendCall",
          "--allowDirty",
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
          "--server",
          boardServer,
          "--timeoutMs",
          "10000",
        ], args, { LAN_DUAL_PASSWORD: secret });
        const payload = parseJson(result.stdout, "discover sendCall JSON");
        assert(result.status === 0, `discover sendCall should pass.\n${result.stdout}\n${result.stderr}`);
        assert(payload.ok === true, "discover sendCall should be ok=true");
        assert(payload.args?.discover === true, "discover sendCall should record discover=true");
        assert(payload.discovery?.selected?.host === "127.0.0.1", "discover sendCall should select mock host");
        assertIncludes(payload.discovery?.formalChecklistCommand || "", `--port ${windowsPort}`, "discover sendCall discovery formal checklist");
        assert(payload.discovery?.manualChecklistSummary === "connection/video/audio/clipboard/input_ack/diagnostics", "discover sendCall manual checklist summary");
        assert(payload.sentCall?.ok === true, "discover sendCall should report sentCall ok");
        assert(payload.sentCall?.payload?.connection === `127.0.0.1:${windowsPort}`, "discover sendCall should call selected Windows host");
        assertIncludes(payload.boardSummary || "", "Agent Link Board call was sent", "discover sendCall board summary");
        assertIncludes(payload.boardSummary || "", "blockers=none", "discover sendCall board summary");
        assertIncludes(payload.boardSummary || "", "warnings=", "discover sendCall board summary");
        assertIncludes(payload.boardSummary || "", "FormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs", "discover sendCall board summary");
        assertIncludes(payload.boardSummary || "", "MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs", "discover sendCall board summary");
        assertIncludes(payload.boardSummary || "", "ManualChecklist=connection/video/audio/clipboard/input_ack/diagnostics", "discover sendCall board summary");
        assertIncludes(payload.boardSummary || "", "ReverseGrantCopy=", "discover sendCall board summary");
        assertReverseGrantBoardSummary(payload.boardSummary || "", "discover sendCall board summary", windowsPort);
        assertSecureAuthPath(payload.boardSummary || "", "discover sendCall board summary secure auth path", windowsPort, { expectBoardLabel: true });
        assertIncludes(payload.boardSummary || "", "Reverse rehearsal after auth", "discover sendCall board summary");
        assertNotIncludes(`${result.stdout}\n${result.stderr}`, secret, "discover sendCall output");
      });
    });
  });
  print("OK", "Discovery sendCall selects a Windows host and sends one safe call");
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
  assertNotIncludes(`${result.stdout}\n${result.stderr}`, "--host  --port", "discover failure should not print an empty host auth command");
  assert(!payload.commands?.browserSmoke, "discover failure should not provide a browser auth command without a host");
  assert(!payload.commands?.sendCall, "discover failure should not provide a sendCall command without a host");
  assertIncludes(payload.commands?.discoverPreflight || "", "--discover", "discover failure should provide a safe discovery preflight retry command");
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
      assertSecureAuthPath(noPasswordPayload.commands?.secureAuthPath || "", "no password secure auth path", windowsPort);
      assertSecureAuthPath(noPasswordPayload.boardSummary || "", "no password board summary secure auth path", windowsPort, { expectBoardLabel: true });

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
  checkSendCallRequiresPreflight(args);
  await checkPreflightAndDryRun(args);
  await checkDiscoverPreflight(args);
  await checkEnsureClientPreflight(args);
  await checkDiscoverSendCall(args);
  await checkDiscoverFailureNoPasswordPrompt(args);
  await checkPasswordSafety(args);
  print("OK", "Mac client formal smoke wrapper self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
