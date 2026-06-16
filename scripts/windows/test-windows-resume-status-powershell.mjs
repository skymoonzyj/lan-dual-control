import { spawn } from "node:child_process";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createMockMacHostServer } from "../../apps/mock-mac-host/server.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const wrapperScript = "scripts/windows/check-windows-resume-status.ps1";

const defaults = {
  timeoutMs: 30000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-resume-status-powershell.mjs [options]

Options:
  --timeoutMs <ms>  Per PowerShell wrapper timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Description:
  Verifies check-windows-resume-status.ps1 safely wraps the Node resume-status
  script. It never authenticates a real Mac, never requests passwords, and never
  executes inject.
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

function runPowerShell(extraArgs, args) {
  return new Promise((resolveRun) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      wrapperScript,
      ...extraArgs,
    ], {
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

async function checkWrapperHelp(args) {
  const result = await runPowerShell(["-Help"], args);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.exitCode === 0, `PowerShell wrapper help failed\n${output}`);
  assertIncludes(output, "Usage:", "PowerShell wrapper help");
  assertIncludes(output, "-CheckBoard -BoardSummary", "PowerShell wrapper help");
  assertIncludes(output, "-UserAuthRequest", "PowerShell wrapper help");
  assertIncludes(output, "current Agent Link", "PowerShell wrapper help");
  assertIncludes(output, "does not ask for or print", "PowerShell wrapper help");
  assertIncludes(output, "passwords", "PowerShell wrapper help");
  assertIncludes(output, "Windows host media baseline", "PowerShell wrapper help");
  assertIncludes(output, "--probeMedia --boardSummary", "PowerShell wrapper help");
  console.log("[OK] PowerShell resume-status wrapper help is safe");
}

async function checkMockJson(args) {
  await withMockHost(async (port) => {
    const result = await runPowerShell([
      "-Discover",
      "-DiscoverNoLocalSubnets",
      "-HostName", "127.0.0.1",
      "-Port", String(port),
      "-Json",
      "-AllowMockVideo",
      "-SkipAudio",
      "-SkipClipboard",
      "-SkipInputLog",
    ], args);
    const output = `${result.stdout}\n${result.stderr}`;
    assert(result.exitCode === 0, `PowerShell mock JSON failed\n${output}`);
    const payload = JSON.parse(result.stdout);
    assert(payload.ok === true, "mock JSON should be ok");
    assert(payload.macPreflight?.payload?.online === true, "mock JSON should include online preflight");
    assert(payload.macPreflight?.payload?.target?.port === port, "mock JSON should use discovered mock port");
    assert(payload.macPreflight?.payload?.discoverySelection?.requested === true, "preflight should record discovery");
    assertIncludes(payload.boardSummary, "Windows resume:", "mock JSON board summary");
    assertIncludes(payload.userAuthRequest, "NEED_USER_AUTH", "mock JSON userAuthRequest");
    assertIncludes(payload.userAuthRequest, "powershell.exe", "mock JSON userAuthRequest");
    assertIncludes(payload.commands?.windowsHostMediaReadinessBoardSummary, "check-windows-host-readiness.mjs", "mock JSON media command");
    assertIncludes(payload.commands?.windowsHostMediaReadinessBoardSummary, "--probeMedia", "mock JSON media command");
    assertNotIncludes(output, "test-password", "PowerShell mock JSON");
    console.log("[OK] PowerShell resume-status wrapper supports mock JSON discovery");
  });
}

async function checkBoardSummary(args) {
  await withMockHost(async (port) => {
    const result = await runPowerShell([
      "-Discover",
      "-DiscoverNoLocalSubnets",
      "-HostName", "127.0.0.1",
      "-Port", String(port),
      "-BoardSummary",
      "-AllowMockVideo",
      "-SkipAudio",
      "-SkipClipboard",
      "-SkipInputLog",
    ], args);
    const output = `${result.stdout}\n${result.stderr}`;
    assert(result.exitCode === 0, `PowerShell board summary failed\n${output}`);
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    assert(lines.length === 1, `board summary should be one line, got ${lines.length}`);
    assertIncludes(output, "mac=ready", "PowerShell board summary");
    assertIncludes(output, "WindowsHostMedia=", "PowerShell board summary");
    assertIncludes(output, "check-windows-host-readiness.mjs --checkBoard --probeMedia --boardSummary", "PowerShell board summary");
    assertIncludes(output, "No password was requested or sent", "PowerShell board summary");
    assertNotIncludes(output, "test-password", "PowerShell board summary");
    console.log("[OK] PowerShell resume-status wrapper prints one-line board summary");
  });
}

async function checkBoardCurrentCallSummary(args) {
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-BoardSummary",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell currentCall board summary failed\n${output}`);
      assertIncludes(output, "call=CALLING Mac Codex->Windows Codex", "PowerShell currentCall board summary");
      assertIncludes(output, "正式 Windows host 验收", "PowerShell currentCall board summary");
      assertNotIncludes(output, "test-password", "PowerShell currentCall board summary");
      console.log("[OK] PowerShell resume-status wrapper includes active Agent Link currentCall");
    }, {
      currentCall: macCallForWindows(),
    });
  });
}

async function checkBoardCurrentCallJson(args) {
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-CheckBoard",
        "-Json",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell currentCall JSON failed\n${output}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.board?.source === "api-state", "PowerShell currentCall should be read from Agent Link Board /api/state");
      assert(payload.board?.currentCall?.active === true, "PowerShell currentCall JSON should mark call active");
      assert(payload.board?.currentCall?.needsWindows === true, "PowerShell currentCall JSON should mark Windows need");
      assertIncludes(payload.boardSummary, "call=CALLING Mac Codex->Windows Codex", "PowerShell currentCall JSON board summary");
      assertIncludes(payload.boardSummary, "正式 Windows host 验收", "PowerShell currentCall JSON board summary");
      assertNotIncludes(output, "test-password", "PowerShell currentCall JSON");
      console.log("[OK] PowerShell resume-status wrapper reads Agent Link currentCall from /api/state");
    }, {
      currentCall: macCallForWindows(),
    });
  });
}

async function checkUserAuthRequest(args) {
  await withMockHost(async (port) => {
    const result = await runPowerShell([
      "-Discover",
      "-DiscoverNoLocalSubnets",
      "-HostName", "127.0.0.1",
      "-Port", String(port),
      "-UserAuthRequest",
      "-AllowMockVideo",
      "-SkipAudio",
      "-SkipClipboard",
      "-SkipInputLog",
    ], args);
    const output = `${result.stdout}\n${result.stderr}`;
    assert(result.exitCode === 0, `PowerShell userAuthRequest failed\n${output}`);
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    assert(lines.length === 1, `PowerShell userAuthRequest should be one line, got ${lines.length}`);
    assertIncludes(output, "NEED_USER_AUTH", "PowerShell userAuthRequest");
    assertIncludes(output, "Windows 本机隐藏输入 Mac host 正式密码", "PowerShell userAuthRequest");
    assertIncludes(output, "powershell.exe", "PowerShell userAuthRequest");
    assertIncludes(output, "-PromptPassword", "PowerShell userAuthRequest");
    assertIncludes(output, "inject 仍需", "PowerShell userAuthRequest");
    assertIncludes(output, "另行明确确认", "PowerShell userAuthRequest");
    assertNotIncludes(output, "test-password", "PowerShell userAuthRequest");
    console.log("[OK] PowerShell resume-status wrapper prints a secret-free user auth request");
  });
}

async function checkSendUserAuthRequest(args) {
  await withMockHost(async (port) => {
    await withMockLinkBoard(async (board) => {
      const result = await runPowerShell([
        "-Discover",
        "-DiscoverNoLocalSubnets",
        "-HostName", "127.0.0.1",
        "-Port", String(port),
        "-Server", board.url,
        "-SendUserAuthRequest",
        "-Json",
        "-AllowMockVideo",
        "-SkipAudio",
        "-SkipClipboard",
        "-SkipInputLog",
      ], args);
      const output = `${result.stdout}\n${result.stderr}`;
      assert(result.exitCode === 0, `PowerShell sendUserAuthRequest failed\n${output}`);
      const payload = JSON.parse(result.stdout);
      assert(payload.sentUserAuthRequest?.ok === true, "PowerShell send should pass");
      assert(board.messages.length === 1, `expected one board message, got ${board.messages.length}`);
      assert(board.messages[0].from === "Windows Codex", "PowerShell board sender mismatch");
      assertIncludes(board.messages[0].text, "NEED_USER_AUTH", "PowerShell sent userAuthRequest");
      assertIncludes(board.messages[0].text, "-PromptPassword", "PowerShell sent userAuthRequest");
      assertNotIncludes(JSON.stringify(board.messages), "test-password", "PowerShell sent userAuthRequest");
      console.log("[OK] PowerShell resume-status wrapper can send a secret-free user auth request");
    });
  });
}

async function checkOfflineDefaults(args) {
  const result = await runPowerShell([
    "-NoDiscover",
    "-HostName", "127.0.0.1",
    "-Port", "9",
    "-Json",
  ], args);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.exitCode === 0, `offline JSON should stay non-failing without -RequireMacReady\n${output}`);
  const payload = JSON.parse(result.stdout);
  assert(payload.ok === true, "offline JSON should be ok=true without RequireMacReady");
  assert(payload.macPreflight?.payload?.online === false, "offline JSON should report offline Mac");
  assertIncludes(payload.boardSummary, "mac=offline", "offline JSON board summary");
  assertNotIncludes(output, "Mac host password", "offline JSON");
  console.log("[OK] PowerShell resume-status wrapper keeps offline Mac non-failing by default");
}

async function checkRequireMacReady(args) {
  const result = await runPowerShell([
    "-NoDiscover",
    "-HostName", "127.0.0.1",
    "-Port", "9",
    "-Json",
    "-RequireMacReady",
  ], args);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.exitCode !== 0, "RequireMacReady offline path should fail");
  const payload = JSON.parse(result.stdout);
  assert(payload.ok === false, "RequireMacReady offline JSON should be ok=false");
  assert(payload.failedChecks?.some((check) => check.name === "requireMacReady"), "RequireMacReady failure should be named");
  assertNotIncludes(output, "Mac host password", "RequireMacReady JSON");
  console.log("[OK] PowerShell resume-status wrapper honors -RequireMacReady");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  await checkWrapperHelp(args);
  await checkMockJson(args);
  await checkBoardSummary(args);
  await checkBoardCurrentCallSummary(args);
  await checkBoardCurrentCallJson(args);
  await checkUserAuthRequest(args);
  await checkSendUserAuthRequest(args);
  await checkOfflineDefaults(args);
  await checkRequireMacReady(args);
  console.log("[OK] PowerShell resume-status wrapper regression passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
