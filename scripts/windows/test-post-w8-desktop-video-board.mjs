#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const script = "scripts/windows/post-w8-desktop-video-board.mjs";

const defaults = {
  timeoutMs: 30000,
};

const w8NativeLine = "W8NativeVideo=ui=html-shell mainSurface=native-hwnd canvasRole=diagnostic-fallback webDecode=native-main-surface webBypass=24 webBypassReason=native-main-surface-presenting webBypassFrame=188 status=device-lost-rebuilt present=latest-frame-nv12-converted-presented presentFrames=188 decoded=188 presenting=yes presentGap=0 queueDrops=3722 queueDropScope=predecode queueReason=waiting-keyframe output=NV12 surface=latest-frame-presented copy=latest-frame-presented handoff=latest-frame-ready swapchain=ready streamChange=yes deviceLost=yes errors=0";
const w8NativeLineMissingBypass = "W8NativeVideo=ui=html-shell mainSurface=native-hwnd canvasRole=diagnostic-fallback status=device-lost-rebuilt present=latest-frame-nv12-converted-presented presentFrames=188 decoded=188 presenting=yes presentGap=0 output=NV12 surface=latest-frame-presented copy=latest-frame-presented handoff=latest-frame-ready swapchain=ready streamChange=yes deviceLost=yes errors=0";
const retestLine = "W2W3Retest=video=实收 63.9 FPS · 协商 60 Hz · 平均间隔 16 ms · 最大间隔 9100 ms · 远端媒体平均间隔 17 ms · 远端媒体最大间隔 21 ms · 追实时请求 42 次 · 本机队列 190 ms · 本地过期丢帧 125 · 可见恢复 2 次 · 原因 live-backlog-keyframe-request surface=none h264=status=rendering decoded=3722 skippedDelta=0 needsKeyframe=no queue=4 queueMs=190 staleDrops=125 reason=live-backlog-keyframe-request recv=3722 key=87 sps=87 pps=87 idr=87 lastNal=7/8/5, audio=队列 100 ms";

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-post-w8-desktop-video-board.mjs [options]

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Description:
  Verifies the W8 desktop native-video board-post helper with a fake Agent Link
  Board. It never requests passwords, authenticates a host, or sends control events.
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

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${text}`);
  }
}

function run(extraArgs, args, options = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [script, ...extraArgs], {
      cwd: repoRoot,
      env: {
        ...process.env,
        LAN_DUAL_PASSWORD: "",
        CODEX_LINK_TOKEN: "",
      },
      stdio: ["pipe", "pipe", "pipe"],
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
    if (options.input !== undefined) {
      child.stdin.end(String(options.input));
    } else {
      child.stdin.end();
    }
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

async function withFakeBoard(callback, options = {}) {
  const messages = [];
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      requests.push({ method: request.method, url: request.url, body });
      if (request.method === "POST" && request.url === "/api/message") {
        const parsed = JSON.parse(body || "{}");
        if (options.rejectPosts) {
          response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ ok: false, error: "fake board rejected post" }));
          return;
        }
        messages.push(parsed);
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true }));
        return;
      }
      response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: false, error: "not found" }));
    });
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  try {
    await callback({ url: `http://127.0.0.1:${address.port}`, messages, requests });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

function assertSecretSafe(text, label) {
  assertNotIncludes(text, "super-secret", label);
  assertNotIncludes(text, "--password", label);
  assertNotIncludes(text, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(text, "CODEX_LINK_TOKEN", label);
  assertNotIncludes(text, "input_event", label);
}

async function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = await run([flag], args);
    assert(result.exitCode === 0, `help ${flag} failed\n${result.stdout}\n${result.stderr}`);
    assertIncludes(result.stdout, "Usage:", `help ${flag}`);
    assertIncludes(result.stdout, "--text", `help ${flag}`);
    assertIncludes(result.stdout, "--file", `help ${flag}`);
    assertIncludes(result.stdout, "--stdin", `help ${flag}`);
    assertIncludes(result.stdout, "--send", `help ${flag}`);
    assertIncludes(result.stdout, "W8NativeVideo", `help ${flag}`);
    assertIncludes(result.stdout, "W8NativeGate", `help ${flag}`);
    assertSecretSafe(result.stdout + result.stderr, `help ${flag}`);
  }
  console.log("[OK] W8 desktop video board helper help is safe");
}

async function checkDryRunW8Only(args) {
  await withFakeBoard(async (board) => {
    const result = await run(["--server", board.url, "--text", `noise\n${w8NativeLine}\n`, "--json"], args);
    assert(result.exitCode === 0, `dry-run JSON failed\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "dry-run JSON");
    assert(payload.ok === true, "dry-run should be ok");
    assert(payload.send === false, "dry-run should not send by default");
    assert(payload.w8NativeVideoLine === w8NativeLine, "dry-run should extract W8NativeVideo");
    assertIncludes(payload.w8NativeGateSummary, "W8NativeGate=status=arrival-backlog-next", "dry-run W8 gate");
    assertIncludes(payload.w8NativeGateSummary, "mainSurface=native-hwnd", "dry-run W8 gate");
    assertIncludes(payload.w8NativeGateSummary, "canvasRole=diagnostic-fallback", "dry-run W8 gate");
    assertIncludes(payload.w8NativeGateSummary, "webDecode=native-main-surface", "dry-run W8 gate");
    assertIncludes(payload.w8NativeGateSummary, "webBypass=24", "dry-run W8 gate");
    assertIncludes(payload.boardSummary, "W8DesktopVideoPost=dry-run", "dry-run board summary");
    assertIncludes(payload.boardSummary, "w8NativeGate=arrival-backlog-next", "dry-run board summary");
    assert(board.messages.length === 0, `dry-run should not post messages, got ${board.messages.length}`);
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.requests), "dry-run");
    console.log("[OK] W8 desktop video board helper dry-run is no-post and secret-safe");
  });
}

async function checkW8GateRequiresBypass(args) {
  await withFakeBoard(async (board) => {
    const result = await run(["--server", board.url, "--text", w8NativeLineMissingBypass, "--json"], args);
    assert(result.exitCode === 0, `missing-bypass JSON failed\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "missing-bypass JSON");
    assertIncludes(payload.w8NativeGateSummary, "W8NativeGate=status=web-bypass-next", "missing-bypass W8 gate");
    assertIncludes(payload.w8NativeGateSummary, "next=verify-webcodecs-bypass", "missing-bypass W8 gate");
    assertIncludes(payload.boardSummary, "w8NativeGate=web-bypass-next", "missing-bypass board summary");
    assert(board.messages.length === 0, `missing-bypass dry-run should not post messages, got ${board.messages.length}`);
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.requests), "missing-bypass");
    console.log("[OK] W8 desktop video board helper requires WebCodecs bypass evidence");
  });
}

async function checkOptionalRetestGeneratesArrivalBacklog(args) {
  await withFakeBoard(async (board) => {
    const result = await run(["--server", board.url, "--text", `${retestLine}\n${w8NativeLine}\n`, "--send", "--json"], args);
    assert(result.exitCode === 0, `send JSON with retest failed\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "send JSON with retest");
    assertIncludes(payload.w8NativeGateSummary, "W8NativeGate=status=arrival-backlog-next", "send JSON with retest W8 gate");
    assertIncludes(payload.w8ArrivalBacklogSummary, "W8ArrivalBacklog=status=blocked", "send JSON W8 arrival backlog");
    assertIncludes(payload.w8ArrivalBacklogSummary, "queueMs=190", "send JSON W8 arrival backlog");
    assertIncludes(payload.w8ArrivalBacklogSummary, "localMaxMs=9100", "send JSON W8 arrival backlog");
    assertIncludes(payload.w8ArrivalBacklogSummary, "remoteMediaMaxMs=21", "send JSON W8 arrival backlog");
    assertIncludes(payload.w8ArrivalBacklogSummary, "arrivalSource=windows-arrival-gap", "send JSON W8 arrival backlog");
    assertIncludes(payload.w8ArrivalBacklogSummary, "next=investigate-windows-arrival-backlog", "send JSON W8 arrival backlog");
    assertIncludes(payload.boardSummary, "w8ArrivalBacklog=blocked", "send JSON board summary");
    assert(board.messages.length === 1, `send should post one W8 message, got ${board.messages.length}`);
    assertIncludes(board.messages[0].text, "W8ArrivalBacklog=status=blocked", "posted W8 message");
    assertIncludes(board.messages[0].text, "arrivalSource=windows-arrival-gap", "posted W8 message");
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.messages), "send with retest");
    console.log("[OK] W8 desktop video board helper derives arrival backlog from optional retest evidence");
  });
}

async function checkSendW8Only(args) {
  await withFakeBoard(async (board) => {
    const result = await run(["--server", board.url, "--text", `prefix\n${w8NativeLine}\n`, "--send", "--json"], args);
    assert(result.exitCode === 0, `send JSON failed\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "send JSON");
    assert(payload.ok === true, "send should be ok");
    assert(payload.sentW8NativeVideo === true, "send should post W8 native video");
    assert(board.messages.length === 1, `send should post one W8 message, got ${board.messages.length}`);
    assertIncludes(board.messages[0].text, w8NativeLine, "posted W8 message");
    assertIncludes(board.messages[0].text, "W8NativeGate=status=arrival-backlog-next", "posted W8 message");
    assertIncludes(board.messages[0].text, "Source=DesktopControl/copied-diagnostics", "posted W8 message");
    assertIncludes(board.messages[0].text, "Safety=no-password-on-board,no-input-inject", "posted W8 message");
    assertIncludes(payload.boardSummary, "W8DesktopVideoPost=sent", "send board summary");
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.messages), "send");
    console.log("[OK] W8 desktop video board helper sends W8 summary safely");
  });
}

async function checkStdinW8Only(args) {
  await withFakeBoard(async (board) => {
    const result = await run(["--server", board.url, "--stdin", "--json"], args, { input: `prefix\n${w8NativeLine}\n` });
    assert(result.exitCode === 0, `stdin JSON failed\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "stdin JSON");
    assert(payload.ok === true, "stdin dry-run should be ok");
    assert(payload.w8NativeVideoLine === w8NativeLine, "stdin should extract W8NativeVideo");
    assert(board.messages.length === 0, `stdin dry-run should not post messages, got ${board.messages.length}`);
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.requests), "stdin");
    console.log("[OK] W8 desktop video board helper stdin dry-run is no-post and secret-safe");
  });
}

async function checkRejectsUnsafeInput(args) {
  await withFakeBoard(async (board) => {
    const result = await run(["--server", board.url, "--text", `${w8NativeLine} --password super-secret input_event`, "--send", "--json"], args);
    assert(result.exitCode !== 0, "unsafe input should fail");
    assert(board.messages.length === 0, `unsafe input should not post, got ${board.messages.length}`);
    assertIncludes(result.stderr || result.stdout, "unsafe", "unsafe input failure");
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.messages), "unsafe input");
    console.log("[OK] W8 desktop video board helper rejects unsafe input before posting");
  });
}

async function checkRejectsMissingW8(args) {
  await withFakeBoard(async (board) => {
    const result = await run(["--server", board.url, "--text", "no native evidence", "--send", "--json"], args);
    assert(result.exitCode !== 0, "missing W8 evidence should fail");
    assert(board.messages.length === 0, `missing W8 should not post, got ${board.messages.length}`);
    assertIncludes(result.stderr || result.stdout, "W8NativeVideo", "missing W8 failure");
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.messages), "missing W8");
    console.log("[OK] W8 desktop video board helper rejects missing W8 evidence");
  });
}

async function checkBoardRejectFailure(args) {
  await withFakeBoard(async (board) => {
    const result = await run(["--server", board.url, "--text", w8NativeLine, "--send", "--json"], args);
    assert(result.exitCode !== 0, "board ok:false response should fail");
    assert(board.messages.length === 0, `rejected post should not store messages, got ${board.messages.length}`);
    assertIncludes(result.stderr || result.stdout, "Agent Link Board post failed", "board reject failure");
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.messages), "board reject failure");
    console.log("[OK] W8 desktop video board helper reports board ok:false failures");
  }, { rejectPosts: true });
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  await checkHelp(args);
  await checkDryRunW8Only(args);
  await checkW8GateRequiresBypass(args);
  await checkOptionalRetestGeneratesArrivalBacklog(args);
  await checkSendW8Only(args);
  await checkStdinW8Only(args);
  await checkRejectsUnsafeInput(args);
  await checkRejectsMissingW8(args);
  await checkBoardRejectFailure(args);
  console.log("[OK] W8 desktop video board helper regression passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
