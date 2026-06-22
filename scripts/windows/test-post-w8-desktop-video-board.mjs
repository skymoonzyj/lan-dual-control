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

const w8NativeLine = "W8NativeVideo=ui=html-shell mainSurface=native-hwnd canvasRole=diagnostic-fallback webDecode=native-main-surface webBypass=24 webBypassReason=native-main-surface-presenting webBypassFrame=188 status=device-lost-rebuilt present=latest-frame-nv12-converted-presented presentFrames=188 decoded=188 presenting=yes presentGap=0 mediaSession=native-main nativeAck=presented nativeClass=device-lost-recovered nativeNext=watch-arrival-qos queueDrops=3722 queueDropScope=predecode queueReason=waiting-keyframe submitted=190 decoderGap=2 accepted=190 pushed=192 output=NV12 surface=latest-frame-presented copy=latest-frame-presented handoff=latest-frame-ready swapchain=ready streamChange=yes deviceLost=yes errors=0";
const w8NativeLineMissingBypass = "W8NativeVideo=ui=html-shell mainSurface=native-hwnd canvasRole=diagnostic-fallback status=device-lost-rebuilt present=latest-frame-nv12-converted-presented presentFrames=188 decoded=188 presenting=yes presentGap=0 output=NV12 surface=latest-frame-presented copy=latest-frame-presented handoff=latest-frame-ready swapchain=ready streamChange=yes deviceLost=yes errors=0";
const w14NativeLine = "W14NativeVideo=status=streaming transport=websocket-native mediaOwner=native-receiver videoFrames=5 h264Frames=5 pushed=5 accepted=4 dropped=1 queueMs=12 decoded=3 presentFrames=2 presenting=yes visibleLayer=html-fallback-cleared visibleLayerMode=w14-native-receiver visibleLayerFrame=1 lastStatus=latest-frame-nv12-converted-presented lastReason=ready";
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
    assertIncludes(result.stdout, "W14NativeVideo", `help ${flag}`);
    assertIncludes(result.stdout, "W14NativeGate", `help ${flag}`);
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
    assertIncludes(payload.w8NativeGateSummary, "pushed=192", "dry-run W8 gate");
    assertIncludes(payload.w8NativeGateSummary, "submitted=190", "dry-run W8 gate");
    assertIncludes(payload.w8NativeGateSummary, "decoderGap=2", "dry-run W8 gate");
    assertIncludes(payload.boardSummary, "W8DesktopVideoPost=dry-run", "dry-run board summary");
    assertIncludes(payload.boardSummary, "w8NativeGate=arrival-backlog-next", "dry-run board summary");
    assertIncludes(payload.boardSummary, "w8Decoder=pushed:192/submitted:190/gap:2", "dry-run board summary");
    assert(board.messages.length === 0, `dry-run should not post messages, got ${board.messages.length}`);
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.requests), "dry-run");
    console.log("[OK] W8 desktop video board helper dry-run is no-post and secret-safe");
  });
}

async function checkDryRunW14Only(args) {
  await withFakeBoard(async (board) => {
    const result = await run(["--server", board.url, "--text", `noise\n${w14NativeLine}\n`, "--json"], args);
    assert(result.exitCode === 0, `W14 dry-run JSON failed\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "W14 dry-run JSON");
    assert(payload.ok === true, "W14 dry-run should be ok");
    assert(payload.send === false, "W14 dry-run should not send by default");
    assert(payload.w14NativeVideoLine === w14NativeLine, "W14 dry-run should extract W14NativeVideo");
    assertIncludes(payload.w14NativeGateSummary, "W14NativeGate=status=presenting-ok", "W14 dry-run gate");
    assertIncludes(payload.w14NativeGateSummary, "receiver=streaming", "W14 dry-run gate");
    assertIncludes(payload.w14NativeGateSummary, "transport=websocket-native", "W14 dry-run gate");
    assertIncludes(payload.w14NativeGateSummary, "mediaOwner=native-receiver", "W14 dry-run gate");
    assertIncludes(payload.w14NativeGateSummary, "pushed=5", "W14 dry-run gate");
    assertIncludes(payload.w14NativeGateSummary, "accepted=4", "W14 dry-run gate");
    assertIncludes(payload.w14NativeGateSummary, "dropped=1", "W14 dry-run gate");
    assertIncludes(payload.w14NativeGateSummary, "queueMs=12", "W14 dry-run gate");
    assertIncludes(payload.w14NativeGateSummary, "decoded=3", "W14 dry-run gate");
    assertIncludes(payload.w14NativeGateSummary, "presentFrames=2", "W14 dry-run gate");
    assertIncludes(payload.w14NativeGateSummary, "presenting=yes", "W14 dry-run gate");
    assertIncludes(payload.w14NativeGateSummary, "visibleLayer=html-fallback-cleared", "W14 dry-run gate");
    assertIncludes(payload.w14NativeGateSummary, "next=continue-real-mac-long-run", "W14 dry-run gate");
    assertIncludes(payload.boardSummary, "DesktopVideoPost=dry-run", "W14 dry-run board summary");
    assertIncludes(payload.boardSummary, "w14NativeVideo=present", "W14 dry-run board summary");
    assertIncludes(payload.boardSummary, "w14NativeGate=presenting-ok", "W14 dry-run board summary");
    assertIncludes(payload.boardSummary, "w14Presenting=yes", "W14 dry-run board summary");
    assertIncludes(payload.boardSummary, "w14Decoded=3", "W14 dry-run board summary");
    assert(board.messages.length === 0, `W14 dry-run should not post messages, got ${board.messages.length}`);
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.requests), "W14 dry-run");
    console.log("[OK] W14 desktop video board helper dry-run is no-post and secret-safe");
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
    assertIncludes(payload.w13LocalQosSummary, "W13LocalQos=status=local-backlog", "send JSON W13 local QoS");
    assertIncludes(payload.w13LocalQosSummary, "nativeClass=device-lost-recovered", "send JSON W13 local QoS");
    assertIncludes(payload.w13LocalQosSummary, "arrivalSource=windows-arrival-gap", "send JSON W13 local QoS");
    assertIncludes(payload.w13LocalQosSummary, "keyframeRequest=yes", "send JSON W13 local QoS");
    assertIncludes(payload.w13LocalQosSummary, "dropPolicy=drop-old-keep-keyframe", "send JSON W13 local QoS");
    assertIncludes(payload.w13LocalQosSummary, "next=local-qos-trim-request-keyframe", "send JSON W13 local QoS");
    assertIncludes(payload.boardSummary, "w8ArrivalBacklog=blocked", "send JSON board summary");
    assertIncludes(payload.boardSummary, "w13LocalQos=local-backlog", "send JSON board summary");
    assert(board.messages.length === 1, `send should post one W8 message, got ${board.messages.length}`);
    assertIncludes(board.messages[0].text, "submitted=190", "posted W8 message");
    assertIncludes(board.messages[0].text, "decoderGap=2", "posted W8 message");
    assertIncludes(board.messages[0].text, "W8ArrivalBacklog=status=blocked", "posted W8 message");
    assertIncludes(board.messages[0].text, "arrivalSource=windows-arrival-gap", "posted W8 message");
    assertIncludes(board.messages[0].text, "W13LocalQos=status=local-backlog", "posted W8 message");
    assertIncludes(board.messages[0].text, "next=local-qos-trim-request-keyframe", "posted W8 message");
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.messages), "send with retest");
    console.log("[OK] W8 desktop video board helper derives arrival backlog from optional retest evidence");
  });
}

async function checkSendW8AndW14(args) {
  await withFakeBoard(async (board) => {
    const result = await run(["--server", board.url, "--text", `prefix\n${w8NativeLine}\n${w14NativeLine}\n`, "--send", "--json"], args);
    assert(result.exitCode === 0, `send JSON with W14 failed\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "send JSON with W14");
    assert(payload.ok === true, "send with W14 should be ok");
    assert(payload.sentW8NativeVideo === true, "send with W14 should post W8 native video");
    assert(payload.sentW14NativeVideo === true, "send with W14 should post W14 native video");
    assert(board.messages.length === 1, `send with W14 should post one combined message, got ${board.messages.length}`);
    assertIncludes(board.messages[0].text, w8NativeLine, "posted W8+W14 message");
    assertIncludes(board.messages[0].text, w14NativeLine, "posted W8+W14 message");
    assertIncludes(board.messages[0].text, "W8NativeGate=status=arrival-backlog-next", "posted W8+W14 message");
    assertIncludes(board.messages[0].text, "W14NativeGate=status=presenting-ok", "posted W8+W14 message");
    assertIncludes(board.messages[0].text, "next=continue-real-mac-long-run", "posted W8+W14 message");
    assertIncludes(payload.boardSummary, "W8DesktopVideoPost=sent", "send W8+W14 board summary");
    assertIncludes(payload.boardSummary, "DesktopVideoPost=sent", "send W8+W14 board summary");
    assertIncludes(payload.boardSummary, "w14NativeGate=presenting-ok", "send W8+W14 board summary");
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.messages), "send with W14");
    console.log("[OK] W8 desktop video board helper sends combined W8/W14 summary safely");
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

async function checkRejectsUnsafeW14Input(args) {
  await withFakeBoard(async (board) => {
    const result = await run(["--server", board.url, "--text", `${w14NativeLine} password=super-secret input_event`, "--send", "--json"], args);
    assert(result.exitCode !== 0, "unsafe W14 input should fail");
    assert(board.messages.length === 0, `unsafe W14 input should not post, got ${board.messages.length}`);
    assertIncludes(result.stderr || result.stdout, "unsafe", "unsafe W14 input failure");
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.messages), "unsafe W14 input");
    console.log("[OK] W8 desktop video board helper rejects unsafe W14 input before posting");
  });
}

async function checkRejectsMissingW8(args) {
  await withFakeBoard(async (board) => {
    const result = await run(["--server", board.url, "--text", "no native evidence", "--send", "--json"], args);
    assert(result.exitCode !== 0, "missing native video evidence should fail");
    assert(board.messages.length === 0, `missing native video evidence should not post, got ${board.messages.length}`);
    assertIncludes(result.stderr || result.stdout, "W8NativeVideo or W14NativeVideo", "missing native video failure");
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.messages), "missing native video");
    console.log("[OK] W8 desktop video board helper rejects missing native video evidence");
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
  await checkDryRunW14Only(args);
  await checkW8GateRequiresBypass(args);
  await checkOptionalRetestGeneratesArrivalBacklog(args);
  await checkSendW8AndW14(args);
  await checkSendW8Only(args);
  await checkStdinW8Only(args);
  await checkRejectsUnsafeInput(args);
  await checkRejectsUnsafeW14Input(args);
  await checkRejectsMissingW8(args);
  await checkBoardRejectFailure(args);
  console.log("[OK] W8 desktop video board helper regression passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
