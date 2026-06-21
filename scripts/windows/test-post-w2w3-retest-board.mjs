#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const script = "scripts/windows/post-w2w3-retest-board.mjs";

const defaults = {
  timeoutMs: 30000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/test-post-w2w3-retest-board.mjs [options]

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks

Description:
  Verifies the W2/W3 retest board-post helper with a fake Agent Link Board. It
  never requests passwords, authenticates a host, or sends real control events.
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

const macNalEvidence = "MacHostMedia=media=ok h264Key=3 sps=3 pps=3 idr=3 keyParam=3 h264Frames=300 h264Delta=297 firstKeyNal=7/8/5 firstNal=7/8/5 lastNal=1 lastKeyNal=7/8/5 keyGapFramesMax=60 keyGapMsMax=1000 keyGapFramesLast=58 keyGapMsLast=966 keyTailFrames=12 keyTailMs=200 firstKeyParam=yes lastKeyParam=yes keyParamMiss=0";
const retestLine = "W2W3Retest=video=实收 63.9 FPS · 协商 60 Hz · 平均间隔 16 ms · 最大间隔 9100 ms · 追实时请求 42 次 · 本机队列 190 ms · 本地过期丢帧 125 · 可见恢复 2 次 · 原因 live-backlog-keyframe-request surface=none h264=status=rendering decoded=3722 skippedDelta=0 needsKeyframe=no queue=4 queueMs=190 staleDrops=125 reason=live-backlog-keyframe-request recv=3722 key=87 sps=87 pps=87 idr=87 lastNal=7/8/5, audio=队列 100 ms";
const w8NativeLine = "W8NativeVideo=ui=html-shell mainSurface=native-hwnd canvasRole=diagnostic-fallback status=device-lost-rebuilt present=latest-frame-nv12-converted-presented presentFrames=188 decoded=188 presenting=yes presentGap=0 queueDrops=3722 queueDropScope=predecode queueReason=waiting-keyframe output=NV12 surface=latest-frame-presented copy=latest-frame-presented handoff=latest-frame-ready swapchain=ready streamChange=yes deviceLost=yes errors=0";

function makeState(messages) {
  return {
    updatedAt: "2026-06-21T03:40:00.000Z",
    currentCall: {
      status: "CALLING",
      from: "Mac Codex",
      need: "Windows Codex",
      goal: "Run real WinClientRetest for W2/W3",
    },
    userPresence: {
      status: "present",
      label: "用户在场",
      updatedAt: "2026-06-21T03:39:00.000Z",
      updatedBy: "Supervisor",
    },
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "ready",
        note: macNalEvidence,
        updatedAt: "2026-06-21T03:38:00.000Z",
      },
    },
    events: [
      {
        id: "mac-media",
        at: "2026-06-21T03:38:00.000Z",
        type: "message",
        from: "Mac Codex",
        text: macNalEvidence,
      },
      ...messages.map((message, index) => ({
        id: `posted-${index}`,
        at: `2026-06-21T03:39:${String(index).padStart(2, "0")}.000Z`,
        type: "message",
        from: message.from || "Windows Codex",
        text: message.text || "",
      })),
    ],
  };
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
      if (request.method === "GET" && request.url === "/api/state") {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(makeState(messages)));
        return;
      }
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
    assertIncludes(result.stdout, "W2W3Retest", `help ${flag}`);
    assertIncludes(result.stdout, "W8NativeVideo", `help ${flag}`);
    assertIncludes(result.stdout, "W8NativeGate", `help ${flag}`);
    assertIncludes(result.stdout, "W8ArrivalBacklog", `help ${flag}`);
    assertSecretSafe(result.stdout + result.stderr, `help ${flag}`);
  }
  console.log("[OK] W2/W3 retest board-post helper help is safe");
}

async function checkDryRunDoesNotPost(args) {
  await withFakeBoard(async (board) => {
    const result = await run(["--server", board.url, "--text", `noise\n${retestLine}\n${w8NativeLine}\n`, "--json"], args);
    assert(result.exitCode === 0, `dry-run JSON failed\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "dry-run JSON");
    assert(payload.ok === true, "dry-run should be ok");
    assert(payload.send === false, "dry-run should not send by default");
    assert(payload.retestLine === retestLine, "dry-run should extract the retest line");
    assert(payload.w8NativeVideoLine === w8NativeLine, "dry-run should extract the W8 native video line");
    assertIncludes(payload.w8NativeGateSummary, "W8NativeGate=status=arrival-backlog-next", "dry-run W8 native gate");
    assertIncludes(payload.w8NativeGateSummary, "mainSurface=native-hwnd", "dry-run W8 native gate");
    assertIncludes(payload.w8NativeGateSummary, "next=investigate-arrival-backlog", "dry-run W8 native gate");
    assertIncludes(payload.w8ArrivalBacklogSummary, "W8ArrivalBacklog=status=blocked", "dry-run W8 arrival backlog");
    assertIncludes(payload.w8ArrivalBacklogSummary, "queueMs=190", "dry-run W8 arrival backlog");
    assertIncludes(payload.w8ArrivalBacklogSummary, "staleDrops=125", "dry-run W8 arrival backlog");
    assertIncludes(payload.w8ArrivalBacklogSummary, "liveBacklogRequests=42", "dry-run W8 arrival backlog");
    assertIncludes(payload.w8ArrivalBacklogSummary, "maxGapMs=9100", "dry-run W8 arrival backlog");
    assertIncludes(payload.w8ArrivalBacklogSummary, "visibilityRecovery=2", "dry-run W8 arrival backlog");
    assertIncludes(payload.w8ArrivalBacklogSummary, "next=investigate-windows-arrival-backlog", "dry-run W8 arrival backlog");
    assert(board.messages.length === 0, `dry-run should not post messages, got ${board.messages.length}`);
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.requests), "dry-run");
    console.log("[OK] W2/W3 retest board-post helper dry-run is no-post and secret-safe");
  });
}

async function checkStdinDryRunDoesNotPost(args) {
  await withFakeBoard(async (board) => {
    const result = await run(["--server", board.url, "--stdin", "--json"], args, { input: `prefix\n${retestLine}\n${w8NativeLine}\n` });
    assert(result.exitCode === 0, `stdin dry-run JSON failed\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "stdin dry-run JSON");
    assert(payload.ok === true, "stdin dry-run should be ok");
    assert(payload.send === false, "stdin dry-run should not send by default");
    assert(payload.retestLine === retestLine, "stdin dry-run should extract the retest line");
    assert(payload.w8NativeVideoLine === w8NativeLine, "stdin dry-run should extract the W8 native video line");
    assertIncludes(payload.w8NativeGateSummary, "W8NativeGate=status=arrival-backlog-next", "stdin dry-run W8 native gate");
    assertIncludes(payload.w8ArrivalBacklogSummary, "W8ArrivalBacklog=status=blocked", "stdin dry-run W8 arrival backlog");
    assert(board.messages.length === 0, `stdin dry-run should not post messages, got ${board.messages.length}`);
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.requests), "stdin dry-run");
    console.log("[OK] W2/W3 retest board-post helper stdin dry-run is no-post and secret-safe");
  });
}

async function checkAcceptsFullRetestLogWithSafeInputMentions(args) {
  await withFakeBoard(async (board) => {
    const fullLog = [
      "[OK] Input status text: 输入事件：0（真实控制 / 已注入） / 输入事件：0（安全日志，不会真正控制）",
      "Windows client diagnostics: passed; no input/inject was performed.",
      `${retestLine}; fps=实收 38.7 FPS; audio=声音：接收中. No password was printed or sent to Agent Link Board; no input/inject was performed.`,
      `${w8NativeLine}. No password was printed or sent to Agent Link Board; no input/inject was performed.`,
      "unsafe marker words above are diagnostics, not board payload.",
    ].join("\n");
    const result = await run(["--server", board.url, "--text", fullLog, "--json"], args);
    assert(result.exitCode === 0, `full retest log dry-run should ignore safe non-payload input mentions\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "full retest log dry-run JSON");
    assert(payload.ok === true, "full retest log dry-run should be ok");
    assert(payload.retestLine.startsWith(retestLine), "full retest log should extract only the W2W3Retest line");
    assert(payload.w8NativeVideoLine === w8NativeLine, "full retest log should extract the W8 native video line");
    assertNotIncludes(payload.retestLine, "No password", "full retest log extracted line");
    assertNotIncludes(payload.retestLine, "input/inject", "full retest log extracted line");
    assert(board.messages.length === 0, `full retest log dry-run should not post messages, got ${board.messages.length}`);
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.requests), "full retest log dry-run");
    console.log("[OK] W2/W3 retest board-post helper accepts full logs with safe input/inject diagnostics");
  });
}

async function checkSendRetestAndDiagnosis(args) {
  await withFakeBoard(async (board) => {
    const result = await run(["--server", board.url, "--text", `prefix\n${retestLine}\n${w8NativeLine}\n`, "--send", "--json"], args);
    assert(result.exitCode === 0, `send JSON failed\n${result.stdout}\n${result.stderr}`);
    const payload = parseJson(result.stdout, "send JSON");
    assert(payload.ok === true, "send should be ok");
    assert(payload.send === true, "send should be requested");
    assert(payload.sentRetest === true, "send should post retest line");
    assert(payload.sentW8NativeVideo === true, "send should post W8 native video line");
    assert(payload.sentDiagnosis === true, "send should post diagnosis line");
    assert(payload.w8NativeVideoLine === w8NativeLine, "send JSON should include W8 native video line");
    assertIncludes(payload.w8NativeGateSummary, "W8NativeGate=status=arrival-backlog-next", "send JSON W8 native gate");
    assertIncludes(payload.boardSummary, "w8NativeGate=arrival-backlog-next", "send JSON board summary");
    assertIncludes(payload.w8ArrivalBacklogSummary, "W8ArrivalBacklog=status=blocked", "send JSON W8 arrival backlog");
    assertIncludes(payload.boardSummary, "w8ArrivalBacklog=blocked", "send JSON board summary");
    assertIncludes(payload.diagnosisBoardSummary, "W2H264BoardDiagnosis=status=ready", "send JSON diagnosis");
    assertIncludes(payload.diagnosisBoardSummary, "reason=decoded-surface-seen", "send JSON diagnosis");
    assert(board.messages.length === 3, `expected three posted messages, got ${board.messages.length}: ${JSON.stringify(board.messages)}`);
    assertIncludes(board.messages[0].text, retestLine, "posted W2W3Retest message");
    assertIncludes(board.messages[0].text, "Safety=no-password-on-board,no-input-inject", "posted W2W3Retest message");
    assertIncludes(board.messages[1].text, w8NativeLine, "posted W8 native video message");
    assertIncludes(board.messages[1].text, "W8NativeGate=status=arrival-backlog-next", "posted W8 native video message");
    assertIncludes(board.messages[1].text, "next=investigate-arrival-backlog", "posted W8 native video message");
    assertIncludes(board.messages[1].text, "W8ArrivalBacklog=status=blocked", "posted W8 native video message");
    assertIncludes(board.messages[1].text, "liveBacklogRequests=42", "posted W8 native video message");
    assertIncludes(board.messages[1].text, "next=investigate-windows-arrival-backlog", "posted W8 native video message");
    assertIncludes(board.messages[1].text, "Source=Run-WinClientRetest/native-video-summary", "posted W8 native video message");
    assertIncludes(board.messages[2].text, "W2H264BoardDiagnosis=status=ready", "posted diagnosis message");
    assertIncludes(board.messages[2].text, "reason=decoded-surface-seen", "posted diagnosis message");
    assert(board.requests.some((request) => request.method === "GET" && request.url === "/api/state"), "send should run diagnosis through /api/state");
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.messages) + JSON.stringify(board.requests), "send");
    console.log("[OK] W2/W3 retest board-post helper sends retest and diagnosis safely");
  });
}

async function checkRejectsUnsafeInput(args) {
  await withFakeBoard(async (board) => {
    const unsafe = `${retestLine} --password super-secret input_event`;
    const result = await run(["--server", board.url, "--text", unsafe, "--send", "--json"], args);
    assert(result.exitCode !== 0, "unsafe input should fail");
    assert(board.messages.length === 0, `unsafe input should not post, got ${board.messages.length}`);
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.messages), "unsafe input");
    assertIncludes(result.stderr || result.stdout, "unsafe", "unsafe input failure");
    console.log("[OK] W2/W3 retest board-post helper rejects unsafe input before posting");
  });
}

async function checkRejectsMissingRetest(args) {
  await withFakeBoard(async (board) => {
    const result = await run(["--server", board.url, "--text", "no retest line here", "--send", "--json"], args);
    assert(result.exitCode !== 0, "missing retest should fail");
    assert(board.messages.length === 0, `missing retest should not post, got ${board.messages.length}`);
    assertIncludes(result.stderr || result.stdout, "W2W3Retest", "missing retest failure");
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.messages), "missing retest");
    console.log("[OK] W2/W3 retest board-post helper rejects missing retest evidence");
  });
}

async function checkBoardRejectFailure(args) {
  await withFakeBoard(async (board) => {
    const result = await run(["--server", board.url, "--text", retestLine, "--send", "--json"], args);
    assert(result.exitCode !== 0, "board ok:false response should fail");
    assert(board.messages.length === 0, `rejected post should not store messages, got ${board.messages.length}`);
    assertIncludes(result.stderr || result.stdout, "Agent Link Board post failed", "board reject failure");
    assertSecretSafe(result.stdout + result.stderr + JSON.stringify(board.messages), "board reject failure");
    console.log("[OK] W2/W3 retest board-post helper reports board ok:false failures");
  }, { rejectPosts: true });
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  await checkHelp(args);
  await checkDryRunDoesNotPost(args);
  await checkStdinDryRunDoesNotPost(args);
  await checkAcceptsFullRetestLogWithSafeInputMentions(args);
  await checkSendRetestAndDiagnosis(args);
  await checkRejectsUnsafeInput(args);
  await checkRejectsMissingRetest(args);
  await checkBoardRejectFailure(args);
  console.log("[OK] W2/W3 retest board-post helper regression passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
