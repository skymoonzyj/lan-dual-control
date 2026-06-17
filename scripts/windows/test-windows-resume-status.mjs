import { spawn } from "node:child_process";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createMockMacHostServer } from "../../apps/mock-mac-host/server.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const script = "scripts/windows/check-windows-resume-status.mjs";

const defaults = {
  timeoutMs: 30000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-resume-status.mjs [options]

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Description:
  Verifies the Windows resume-status script with a local mock Mac host. It is
  secret-safe: it does not authenticate a real Mac, does not request passwords,
  and does not execute inject.
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
      args.timeoutMs = Math.max(10000, Number(next) || defaults.timeoutMs);
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
      resolveRun({ exitCode: null, timedOut: true, stdout, stderr });
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
        timedOut: false,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({ exitCode, timedOut: false, stdout, stderr });
    });
  });
}

async function withMockHost(callback) {
  const service = createMockMacHostServer({
    host: "127.0.0.1",
    port: 0,
    password: "test-password",
  });
  await service.listen();
  const address = service.server.address();
  try {
    await callback(Number(address.port));
  } finally {
    await service.close().catch(() => {});
  }
}

async function withMockLinkBoard(callback, stateOverrides = {}) {
  const messages = [];
  const state = {
    currentCall: null,
    statuses: {},
    events: [],
    ...stateOverrides,
  };
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      if (request.method === "POST" && request.url === "/api/message") {
        try {
          messages.push(JSON.parse(body || "{}"));
        } catch {
          messages.push({ parseError: true, body });
        }
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
        return;
      }
      if (request.method === "GET" && request.url === "/api/state") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(state));
        return;
      }
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "not found" }));
    });
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  try {
    await callback({
      url: `http://127.0.0.1:${address.port}`,
      messages,
    });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

function macCallForWindows() {
  return {
    status: "CALLING",
    from: "Mac Codex",
    need: "Windows Codex",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    goal: "正式 Windows host 验收",
    connection: "Windows host /discovery",
    command: "node scripts/windows/start-windows-host.mjs --status --json",
    expected: "Windows confirms host readiness before Mac runs formal smoke.",
    ask: "请 Windows 先只读确认 status。",
  };
}

function doneMacCallForWindows() {
  return {
    ...macCallForWindows(),
    status: "DONE",
    goal: "正式 Windows host 验收已完成",
    actual: "Windows confirmed readiness and posted results.",
  };
}

async function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = await run([flag], args);
    assert(result.exitCode === 0, `help ${flag} failed\n${result.stdout}\n${result.stderr}`);
    assertIncludes(result.stdout, "Usage:", `help ${flag}`);
    assertIncludes(result.stdout, "--boardSummary", `help ${flag}`);
    assertIncludes(result.stdout, "--checkBoard", `help ${flag}`);
    assertIncludes(result.stdout, "Windows host media-baseline", `help ${flag}`);
    assertIncludes(result.stdout, "one-time reverse-control grant", `help ${flag}`);
    assertIncludes(result.stdout, "local alert-watcher start/status commands", `help ${flag}`);
    assertIncludes(result.stdout, "start-mac-alert-watcher.ps1", `help ${flag}`);
  }
  console.log("[OK] Windows resume status help is pure");
}

async function checkMockJson(args) {
  await withMockHost(async (port) => {
    const result = await run([
      "--discover",
      "--discoverNoLocalSubnets",
      "--host", "127.0.0.1",
      "--port", String(port),
      "--json",
      "--allowMockVideo",
      "--skipAudio",
      "--skipClipboard",
      "--skipInputLog",
    ], args);
    assert(result.exitCode === 0, `mock JSON resume failed\n${result.stdout}\n${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert(payload.ok === true, "mock JSON should be ok");
    assert(payload.git && typeof payload.git.clean === "boolean", "mock JSON should include git state");
    assert(payload.macPreflight?.payload?.online === true, "mock JSON should include online preflight");
    assert(payload.macPreflight?.payload?.target?.port === port, "mock JSON should use discovered mock port");
    assert(payload.macPreflight?.payload?.discoverySelection?.requested === true, "preflight should record discovery");
    assert(String(payload.boardSummary || "").includes("Windows resume:"), "mock JSON should include board summary");
    assert(String(payload.userAuthRequest || "").includes("NEED_USER_AUTH"), "mock JSON should include user auth request");
    assert(String(payload.userAuthRequest || "").includes("正式 Mac 端到端验收需要你在 Windows 本机隐藏输入"), "mock JSON should include formal auth wording");
    assert(String(payload.userAuthRequest || "").includes("powershell.exe"), "mock JSON user auth request should prefer PowerShell");
    assert(String(payload.userAuthRequest || "").includes("-PromptPassword"), "mock JSON user auth request should prompt for password");
    assert(String(payload.commands?.formalRun || "").includes("-PromptPassword"), "mock JSON should include formal command");
    assert(String(payload.commands?.windowsHostMediaReadinessBoardSummary || "").includes("check-windows-host-readiness.mjs"), "mock JSON should include Windows host media readiness command");
    assert(String(payload.commands?.windowsHostMediaReadinessBoardSummary || "").includes("--probeMedia"), "mock JSON media readiness command should enable --probeMedia");
    assert(String(payload.commands?.windowsHostMediaReadinessBoardSummary || "").includes("--boardSummary"), "mock JSON media readiness command should be board-safe");
    assert(String(payload.commands?.windowsReverseControlGrantBoardSummary || "").includes("allow-windows-reverse-control.mjs"), "mock JSON should include Windows reverse grant command");
    assert(String(payload.commands?.windowsReverseControlGrantBoardSummary || "").includes("--host 127.0.0.1"), "mock JSON reverse grant command should be local-only");
    assert(String(payload.commands?.windowsReverseControlGrantBoardSummary || "").includes("--port 43770"), "mock JSON reverse grant command should target the default Windows host port");
    assert(String(payload.commands?.windowsReverseControlGrantBoardSummary || "").includes("--durationMs 30000"), "mock JSON reverse grant command should be time-limited");
    assert(String(payload.commands?.windowsReverseControlGrantBoardSummary || "").includes("--boardSummary"), "mock JSON reverse grant command should be board-safe");
    assert(String(payload.commands?.windowsMacAlertWatcherStart || "").includes("start-mac-alert-watcher.ps1"), "mock JSON should include Windows Mac alert watcher start command");
    assert(String(payload.commands?.windowsMacAlertWatcherStart || "").includes("-Server http://192.168.31.68:17888"), "mock JSON watcher start command should include the board server");
    assert(!String(payload.commands?.windowsMacAlertWatcherStart || "").includes("-Status"), "mock JSON watcher start command should not be the status check");
    assert(String(payload.commands?.windowsMacAlertWatcherStatus || "").includes("start-mac-alert-watcher.ps1"), "mock JSON should include Windows Mac alert watcher status command");
    assert(String(payload.commands?.windowsMacAlertWatcherStatus || "").includes("-Server http://192.168.31.68:17888"), "mock JSON watcher status command should include the board server");
    assert(String(payload.commands?.windowsMacAlertWatcherStatus || "").includes("-Status"), "mock JSON watcher status command should be status-only");
    assertNotIncludes(result.stdout + result.stderr, "test-password", "mock JSON");
    console.log("[OK] Windows resume status JSON summarizes mock Mac preflight");
  });
}

async function checkBoardSummary(args) {
  await withMockHost(async (port) => {
    const result = await run([
      "--discover",
      "--discoverNoLocalSubnets",
      "--host", "127.0.0.1",
      "--port", String(port),
      "--boardSummary",
      "--allowMockVideo",
      "--skipAudio",
      "--skipClipboard",
      "--skipInputLog",
    ], args);
    assert(result.exitCode === 0, `mock board summary failed\n${result.stdout}\n${result.stderr}`);
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    assert(lines.length === 1, `board summary should be one line, got ${lines.length}`);
    assertIncludes(result.stdout, "Windows resume:", "board summary");
    assertIncludes(result.stdout, "No password was requested or sent", "board summary");
    assertIncludes(result.stdout, "mac=ready", "board summary");
    assertIncludes(result.stdout, "WindowsHostMedia=", "board summary");
    assertIncludes(result.stdout, "check-windows-host-readiness.mjs --checkBoard --probeMedia --boardSummary", "board summary");
    assertIncludes(result.stdout, "ReverseGrant=", "board summary");
    assertIncludes(result.stdout, "allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --durationMs 30000 --boardSummary", "board summary");
    assertNotIncludes(result.stdout + result.stderr, "test-password", "board summary");
    console.log("[OK] Windows resume status board summary is one-line and secret-free");
  });
}

async function checkBoardCurrentCallJson(args) {
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--json",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock currentCall JSON failed\n${result.stdout}\n${result.stderr}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.source === "api-state", "currentCall should be read from Agent Link Board /api/state");
      assert(payload.board?.currentCall?.present === true, "currentCall should be present");
      assert(payload.board?.currentCall?.active === true, "currentCall should be active");
      assert(payload.board?.currentCall?.from === "Mac Codex", "currentCall from mismatch");
      assert(payload.board?.currentCall?.need === "Windows Codex", "currentCall need mismatch");
      assert(payload.board?.currentCall?.needsWindows === true, "currentCall should need Windows");
      assert(payload.board?.currentCall?.fromMacSide === true, "currentCall should be Mac-side");
      assertIncludes(payload.boardSummary, "call=CALLING Mac Codex->Windows Codex", "currentCall board summary");
      assertIncludes(payload.boardSummary, "正式 Windows host 验收", "currentCall board summary");
      assertNotIncludes(result.stdout + result.stderr, "test-password", "currentCall JSON");
      console.log("[OK] Windows resume status JSON includes active Agent Link currentCall");
    }, {
      currentCall: macCallForWindows(),
    });
  });
}

async function checkBoardDoneCallJson(args) {
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--json",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock DONE currentCall JSON failed\n${result.stdout}\n${result.stderr}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.source === "api-state", "DONE currentCall should be read from Agent Link Board /api/state");
      assert(payload.board?.currentCall?.present === true, "DONE currentCall should be present");
      assert(payload.board?.currentCall?.active === false, "DONE currentCall should not be active");
      assertIncludes(payload.board.currentCall.summary, "DONE Mac Codex->Windows Codex", "DONE currentCall summary");
      assertNotIncludes(payload.boardSummary, "call=DONE", "DONE currentCall board summary");
      assertNotIncludes(payload.boardSummary, "start-windows-host", "DONE currentCall board summary");
      assertNotIncludes(result.stdout + result.stderr, "test-password", "DONE currentCall JSON");
      console.log("[OK] Windows resume status keeps DONE Agent Link currentCall out of board summary");
    }, {
      currentCall: doneMacCallForWindows(),
    });
  });
}

async function checkBoardCurrentCallSummary(args) {
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--checkBoard",
        "--boardSummary",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock currentCall board summary failed\n${result.stdout}\n${result.stderr}`);
      const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
      assert(lines.length === 1, `currentCall board summary should be one line, got ${lines.length}`);
      assertIncludes(result.stdout, "call=CALLING Mac Codex->Windows Codex", "currentCall board summary");
      assertIncludes(result.stdout, "正式 Windows host 验收", "currentCall board summary");
      assertNotIncludes(result.stdout + result.stderr, "test-password", "currentCall board summary");
      console.log("[OK] Windows resume status board summary includes active Agent Link currentCall");
    }, {
      currentCall: macCallForWindows(),
    });
  });
}

async function checkUserAuthRequest(args) {
  await withMockHost(async (port) => {
    const result = await run([
      "--discover",
      "--discoverNoLocalSubnets",
      "--host", "127.0.0.1",
      "--port", String(port),
      "--userAuthRequest",
      "--allowMockVideo",
      "--skipAudio",
      "--skipClipboard",
      "--skipInputLog",
    ], args);
    assert(result.exitCode === 0, `mock userAuthRequest failed\n${result.stdout}\n${result.stderr}`);
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    assert(lines.length === 1, `userAuthRequest should be one line, got ${lines.length}`);
    assertIncludes(result.stdout, "NEED_USER_AUTH", "userAuthRequest");
    assertIncludes(result.stdout, "Windows 本机隐藏输入 Mac host 正式密码", "userAuthRequest");
    assertIncludes(result.stdout, "powershell.exe", "userAuthRequest");
    assertIncludes(result.stdout, "-PromptPassword", "userAuthRequest");
    assertIncludes(result.stdout, "inject 仍需", "userAuthRequest");
    assertIncludes(result.stdout, "另行明确确认", "userAuthRequest");
    assertNotIncludes(result.stdout + result.stderr, "test-password", "userAuthRequest");
    console.log("[OK] Windows resume status can print a secret-free user auth request");
  });
}

async function checkSendUserAuthRequest(args) {
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await run([
        "--discover",
        "--discoverNoLocalSubnets",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--server", board.url,
        "--sendUserAuthRequest",
        "--json",
        "--allowMockVideo",
        "--skipAudio",
        "--skipClipboard",
        "--skipInputLog",
      ], args);
      assert(result.exitCode === 0, `mock sendUserAuthRequest failed\n${result.stdout}\n${result.stderr}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.sentUserAuthRequest?.requested === true, "sendUserAuthRequest should be requested");
      assert(payload.sentUserAuthRequest?.ok === true, "sendUserAuthRequest should pass");
      assert(board.messages.length === 1, `expected one board message, got ${board.messages.length}`);
      assert(board.messages[0].from === "Windows Codex", "board message should use Windows Codex sender");
      assertIncludes(board.messages[0].text, "NEED_USER_AUTH", "sent userAuthRequest");
      assertIncludes(board.messages[0].text, "-PromptPassword", "sent userAuthRequest");
      assertNotIncludes(JSON.stringify(board.messages), "test-password", "sent userAuthRequest");
      console.log("[OK] Windows resume status can send a secret-free user auth request");
    });
  });
}

async function checkSendUserAuthRequestOffline(args) {
  await withMockLinkBoard(async (board) => {
    const result = await run([
      "--noDiscover",
      "--host", "127.0.0.1",
      "--port", "9",
      "--server", board.url,
      "--sendUserAuthRequest",
      "--json",
    ], args);
    assert(result.exitCode !== 0, "offline sendUserAuthRequest should fail");
    const payload = JSON.parse(result.stdout);
    assert(payload.sentUserAuthRequest?.requested === true, "offline send should be requested");
    assert(payload.sentUserAuthRequest?.ok === false, "offline send should fail");
    assert(payload.failedChecks?.some((check) => check.name === "sendUserAuthRequest"), "offline send failure should be named");
    assert(board.messages.length === 0, `offline send should not post a board message, got ${board.messages.length}`);
    assertNotIncludes(result.stdout + result.stderr, "Mac host password", "offline sendUserAuthRequest");
    console.log("[OK] Windows resume status refuses to send user auth request before preflight is ready");
  });
}

async function checkOfflineJson(args) {
  const result = await run([
    "--noDiscover",
    "--host", "127.0.0.1",
    "--port", "9",
    "--json",
  ], args);
  assert(result.exitCode === 0, `offline JSON should stay non-failing without --requireMacReady\n${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert(payload.ok === true, "offline JSON should be ok=true without --requireMacReady");
  assert(payload.macPreflight?.payload?.online === false, "offline JSON should report Mac offline");
  assertIncludes(payload.boardSummary, "mac=offline", "offline JSON board summary");
  assertNotIncludes(result.stdout + result.stderr, "Mac host password", "offline JSON");
  console.log("[OK] Windows resume status offline path is a non-failing warning by default");
}

async function checkRequireMacReady(args) {
  const result = await run([
    "--noDiscover",
    "--host", "127.0.0.1",
    "--port", "9",
    "--json",
    "--requireMacReady",
  ], args);
  assert(result.exitCode !== 0, "requireMacReady offline path should fail");
  const payload = JSON.parse(result.stdout);
  assert(payload.ok === false, "requireMacReady offline payload should be ok=false");
  assert(payload.failedChecks?.some((check) => check.name === "requireMacReady"), "requireMacReady failure should be named");
  assertIncludes(payload.boardSummary, "mac=offline", "requireMacReady board summary");
  assertNotIncludes(result.stdout + result.stderr, "Mac host password", "requireMacReady JSON");
  console.log("[OK] Windows resume status --requireMacReady turns offline Mac into a failure");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  await checkHelp(args);
  await checkMockJson(args);
  await checkBoardSummary(args);
  await checkBoardCurrentCallJson(args);
  await checkBoardDoneCallJson(args);
  await checkBoardCurrentCallSummary(args);
  await checkUserAuthRequest(args);
  await checkSendUserAuthRequest(args);
  await checkSendUserAuthRequestOffline(args);
  await checkOfflineJson(args);
  await checkRequireMacReady(args);
  console.log("[OK] Windows resume status regression passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
