import { spawn } from "node:child_process";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const script = "scripts/windows/check-windows-manual-ux-status.mjs";
const defaultTimeoutMs = 20000;
const defaultChecklist = "connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics";

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-windows-manual-ux-status.mjs [options]

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaultTimeoutMs}
  --help, -h        Show this help without running checks

Description:
  Verifies the Windows manual UX status script with a fake Agent Link Board.
  It is secret-safe: it does not authenticate, request passwords, or send input.
`);
}

function parseArgs(argv) {
  const args = { timeoutMs: defaultTimeoutMs, help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(5000, Number(next) || defaultTimeoutMs);
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
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
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

async function withFakeBoard(state, callback) {
  const server = http.createServer((request, response) => {
    const path = new URL(request.url || "/", "http://127.0.0.1").pathname;
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    };
    if (path !== "/api/state") {
      response.writeHead(404, headers);
      response.end(JSON.stringify({ ok: false, error: "not found" }));
      return;
    }
    response.writeHead(200, headers);
    response.end(JSON.stringify(state));
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  try {
    await callback(url);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

function readyBoardState() {
  return {
    updatedAt: "2026-06-20T01:25:00.000Z",
    currentCall: null,
    statuses: {
      "Mac Codex": {
        status: "idle",
        role: "Mac 端",
        note: `server=http://192.168.31.68:17888; MAC_STANDING_BY_FOR_MANUAL_UX_TEST ManualUxChecklist=${defaultChecklist}; Mac host online 192.168.31.122:43770 maxFps=60`,
        updatedAt: "2026-06-20T01:24:55.000Z",
      },
      "Windows Codex": {
        status: "idle",
        role: "Windows 端",
        note: `REAL_TEST_PASS_RECORDED; PostPassNext=WindowsRecordPassAndTailError+MacManualUxStandby; ManualUxChecklist=${defaultChecklist}; TAIL_ERROR_INVESTIGATION_STATUS=resolved`,
        updatedAt: "2026-06-20T01:24:56.000Z",
      },
      "Mac Heartbeat": {
        status: "online",
        note: "MacHeartbeat=status=ok; MacUnattendedHealth=ok reason=ok blockers=none warnings=none; MacPowerHealth=ok reason=ok warnings=none; host=192.168.31.122:43770; maxScreenFps=60",
        updatedAt: "2026-06-20T01:24:57.000Z",
      },
    },
    recentEvents: [
      { at: "2026-06-20T01:24:56.000Z", type: "message", from: "Mac Codex", text: `MAC_STANDING_BY_FOR_MANUAL_UX_TEST ManualUxChecklist=${defaultChecklist}` },
    ],
  };
}


function loopbackOnlyBoardState() {
  return {
    updatedAt: "2026-06-20T01:27:00.000Z",
    currentCall: null,
    statuses: {
      "Mac Codex": {
        status: "idle",
        role: "Mac 端",
        note: `server=http://192.168.31.68:17888; MAC_STANDING_BY_FOR_MANUAL_UX_TEST ManualUxChecklist=${defaultChecklist}; Mac host online 127.0.0.1:43770`,
        updatedAt: "2026-06-20T01:26:55.000Z",
      },
    },
    recentEvents: [],
  };
}
function waitingBoardState() {
  return {
    updatedAt: "2026-06-20T01:26:00.000Z",
    currentCall: null,
    statuses: {
      "Mac Heartbeat": {
        status: "online",
        note: "MacHeartbeat=status=ok; MacUnattendedHealth=ok reason=ok blockers=none warnings=none",
        updatedAt: "2026-06-20T01:25:57.000Z",
      },
    },
    recentEvents: [],
  };
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

async function checkHelp(args) {
  const result = await run(["--help"], args);
  assert(result.exitCode === 0, `help should exit 0. stderr=${result.stderr}`);
  assertIncludes(result.stdout, "Usage:", "help");
  assertIncludes(result.stdout, "--server", "help");
  assertIncludes(result.stdout, "--requireReady", "help");
  assertIncludes(result.stdout, "--boardSummary", "help");
  assertNotIncludes(result.stdout, "Mac host password:", "help");
  console.log("[OK] Windows manual UX status help is pure");
}

async function checkReadyJson(args) {
  await withFakeBoard(readyBoardState(), async (serverUrl) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `ready JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "ready JSON");
    assert(payload.status === "ready", `ready JSON status mismatch: ${payload.status}`);
    assert(payload.signals?.postPassNext === true, "ready JSON should detect PostPassNext");
    assert(payload.signals?.manualUxStandby === true, "ready JSON should detect ManualUxStandby");
    assert(payload.manualChecklist?.summary === defaultChecklist, "ready JSON should preserve manual checklist summary");
    assert(payload.target === "192.168.31.122:43770", `ready JSON should prefer Mac host target over board server, got ${payload.target}`);
    assert(payload.manualChecklist?.labels?.includes("复制诊断"), "ready JSON should include Chinese labels");
    assert(payload.safety?.requestPassword === false, "ready JSON must not request passwords");
    assert(payload.safety?.sendInputOrInject === false, "ready JSON must not send input/inject");
    assertIncludes(payload.boardSummary, "WindowsManualUx=status=ready", "ready JSON boardSummary");
    assertIncludes(payload.boardSummary, `ManualUxChecklist=${defaultChecklist}`, "ready JSON boardSummary");
    assertIncludes(payload.boardSummary, "ManualUxLabels=连接/画面/声音/剪贴板/文件/窗口/全屏/原画/复制诊断", "ready JSON boardSummary");
    const combined = JSON.stringify(payload);
    assertNotIncludes(combined, "test-password", "ready JSON");
    assertNotIncludes(combined, "demo-password", "ready JSON");
    assertNotIncludes(combined, "secret", "ready JSON");
  });
  console.log("[OK] Windows manual UX status detects ready PostPass board state");
}


async function checkLoopbackTargetIsNotAdvertised(args) {
  await withFakeBoard(loopbackOnlyBoardState(), async (serverUrl) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `loopback-only JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "loopback-only JSON");
    assert(payload.status === "ready", `loopback-only JSON status mismatch: ${payload.status}`);
    assert(payload.target === "unknown", `loopback-only JSON should not advertise 127.0.0.1 as Windows target, got ${payload.target}`);
    assertIncludes(payload.boardSummary, "Target=unknown", "loopback-only boardSummary");
  });
  console.log("[OK] Windows manual UX status does not advertise loopback-only Mac target");
}
async function checkBoardSummary(args) {
  await withFakeBoard(readyBoardState(), async (serverUrl) => {
    const result = await run(["--server", serverUrl, "--boardSummary"], args);
    assert(result.exitCode === 0, `board summary should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    assertIncludes(result.stdout, "WindowsManualUx=status=ready", "board summary");
    assertIncludes(result.stdout, "Next=ManualUxTest", "board summary");
    assertIncludes(result.stdout, "Safety=no-password,no-input-inject", "board summary");
    assertNotIncludes(result.stdout, "test-password", "board summary");
    assertNotIncludes(result.stdout, "demo-password", "board summary");
  });
  console.log("[OK] Windows manual UX status prints secret-free board summary");
}

async function checkRequireReadyFailure(args) {
  await withFakeBoard(waitingBoardState(), async (serverUrl) => {
    const result = await run(["--server", serverUrl, "--requireReady", "--json"], args);
    assert(result.exitCode === 1, `requireReady waiting state should exit 1. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "waiting JSON");
    assert(payload.status === "waiting", `waiting JSON status mismatch: ${payload.status}`);
    assert(payload.blockers?.includes("manual-ux-standby-not-detected"), "waiting JSON should include blocker");
    assertIncludes(payload.boardSummary, "WindowsManualUx=status=waiting", "waiting JSON boardSummary");
  });
  console.log("[OK] Windows manual UX status requireReady fails closed before standby signal");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  await checkHelp(args);
  await checkReadyJson(args);
  await checkLoopbackTargetIsNotAdvertised(args);
  await checkBoardSummary(args);
  await checkRequireReadyFailure(args);
  console.log("[OK] Windows manual UX status checks passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.stack || error.message}`);
  process.exitCode = 1;
});