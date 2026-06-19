#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const script = "scripts/mac/check-mac-manual-ux-status.mjs";
const defaultTimeoutMs = 20000;
const defaultChecklist = "connection/video/audio/clipboard/file/window/fullscreen/original/copy-diagnostics";

function printHelp() {
  console.log(`Usage:
  node scripts/mac/test-mac-manual-ux-status.mjs [options]

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaultTimeoutMs}
  --help, -h        Show this help without running checks

Description:
  Verifies the Mac manual UX status script with a fake Agent Link Board.
  It is read-only and secret-safe: it does not authenticate, request passwords,
  send user-auth requests, or send input/inject.
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
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
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

async function withFakeBoard(state, callback, options = {}) {
  const posts = [];
  let currentCall = state.currentCall || null;
  const server = http.createServer((request, response) => {
    const path = new URL(request.url || "/", "http://127.0.0.1").pathname;
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    };
    if (request.method === "POST" && path === "/api/call") {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        try {
          currentCall = body ? JSON.parse(body) : {};
          posts.push({ path, body: currentCall });
          if (options.rejectCalls) {
            response.writeHead(200, headers);
            response.end(JSON.stringify({ ok: false, error: "fake-board-rejected-call" }));
            return;
          }
          response.writeHead(200, headers);
          response.end(JSON.stringify({ ok: true }));
        } catch (error) {
          response.writeHead(400, headers);
          response.end(JSON.stringify({ ok: false, error: error.message }));
        }
      });
      return;
    }
    if (request.method === "POST" && (path === "/api/status" || path === "/api/message")) {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        try {
          posts.push({ path, body: body ? JSON.parse(body) : {} });
          if (options.rejectPosts) {
            response.writeHead(200, headers);
            response.end(JSON.stringify({ ok: false, error: "fake-board-rejected-post" }));
            return;
          }
          response.writeHead(200, headers);
          response.end(JSON.stringify({ ok: true }));
        } catch (error) {
          response.writeHead(400, headers);
          response.end(JSON.stringify({ ok: false, error: error.message }));
        }
      });
      return;
    }
    if (path !== "/api/state") {
      response.writeHead(404, headers);
      response.end(JSON.stringify({ ok: false, error: "not found" }));
      return;
    }
    response.writeHead(200, headers);
    response.end(JSON.stringify({ ...state, currentCall }));
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  try {
    await callback(url, posts);
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
        status: "manual-ux-standby",
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
        status: "manual-ux-standby",
        role: "Mac 端",
        note: `server=http://192.168.31.68:17888; MAC_STANDING_BY_FOR_MANUAL_UX_TEST ManualUxChecklist=${defaultChecklist}; Mac host online 127.0.0.1:43770`,
        updatedAt: "2026-06-20T01:26:55.000Z",
      },
    },
    recentEvents: [],
  };
}

function chinesePunctuationBoardState() {
  return {
    updatedAt: "2026-06-20T01:28:00.000Z",
    currentCall: null,
    statuses: {
      "Mac Codex": {
        status: "manual-ux-standby",
        role: "Mac 端",
        note: `MAC_STANDING_BY_FOR_MANUAL_UX_TEST ManualUxChecklist=${defaultChecklist}；host=192.168.31.122:43770 inputMode=log`,
        updatedAt: "2026-06-20T01:27:55.000Z",
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

function usableEntryCurrentCallBoardState() {
  return {
    updatedAt: "2026-06-20T09:00:00.000Z",
    currentCall: {
      status: "CALLING",
      goal: "强制可用化：尽快交付用户可打开、可连接、可远程 Mac 的第一版入口",
      from: "Supervisor Codex",
      need: "Windows Codex, Mac Codex",
      expected: "双方上报 USABLE_NEXT 和 BLOCKER；Windows 提供最短启动入口，Mac 保持 host/client/heartbeat 在线并配合手工体验测试。",
      actual: "Formal E2E 主体已 PASS；现在要从测试通过切到用户可用。",
      ask: "停止外围完善，直接推进可用入口和手工体验测试。",
    },
    statuses: {
      "Mac Heartbeat": {
        status: "online",
        note: "MacHeartbeat=status=ok; host=192.168.31.122:43770; MacUnattendedHealth=ok reason=ok blockers=none warnings=none",
        updatedAt: "2026-06-20T08:59:57.000Z",
      },
      "Mac Codex": {
        status: "checking-next-usable-gap",
        role: "Mac 端",
        note: "Mac 端正在只读复核第一版可用入口链路，暂不碰 Windows 入口文件。",
        updatedAt: "2026-06-20T08:59:58.000Z",
      },
    },
    recentEvents: [],
  };
}

function userAwakeManualUxCallBoardState() {
  return {
    updatedAt: "2026-06-20T10:00:00.000Z",
    currentCall: {
      status: "CALLING",
      goal: "USER_AWAKE: resume authorized tasks and prepare real manual UX validation",
      from: "Supervisor Codex",
      need: "Windows Codex, Mac Codex",
      expected: "Before user action, send an explicit call with goal, safety boundary, and estimated duration.",
      actual: "User is awake and can authorize; Mac Manual UX is not standing by yet.",
      ask: "Prepare user-present manual UX validation without sending passwords or input/inject.",
    },
    statuses: {
      "Mac Heartbeat": {
        status: "online",
        note: "MacHeartbeat=status=ok; host=192.168.31.122:43770; MacUnattendedHealth=ok reason=ok blockers=none warnings=none",
        updatedAt: "2026-06-20T09:59:57.000Z",
      },
      "Mac Manual UX": {
        status: "manual-ux-waiting",
        role: "Mac 端",
        note: `MacManualUx=status=waiting ManualUxChecklist=${defaultChecklist} Safety=no-password,no-input-inject blockers=manual-ux-standby-not-detected`,
        updatedAt: "2026-06-20T09:59:58.000Z",
      },
    },
    recentEvents: [],
  };
}

function otherActiveCallWithUserAwakeSignalBoardState() {
  return {
    updatedAt: "2026-06-20T10:05:00.000Z",
    currentCall: {
      status: "CALLING",
      goal: "Windows audio queue follow-up",
      from: "Windows Codex",
      need: "Mac Codex",
      ask: "Please wait while Windows finishes an audio queue check.",
    },
    statuses: {
      "Mac Manual UX": {
        status: "manual-ux-waiting",
        role: "Mac 端",
        note: `MacManualUx=status=waiting ManualUxChecklist=${defaultChecklist}`,
        updatedAt: "2026-06-20T10:04:58.000Z",
      },
    },
    recentEvents: [
      {
        at: "2026-06-20T10:04:59.000Z",
        type: "message",
        from: "Supervisor Codex",
        text: "USER_AWAKE: user is awake; prepare real manual UX validation after active Windows call is resolved.",
      },
    ],
  };
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

function assertSecretSafe(text, label) {
  assertNotIncludes(text, "test-password", label);
  assertNotIncludes(text, "demo-password", label);
  assertNotIncludes(text, "NEED_USER_AUTH", label);
  assert(!/token=/i.test(text), `${label} should not include token-like text.\n${text}`);
  assert(!/secret=/i.test(text), `${label} should not include secret-like text.\n${text}`);
  assert(!/input_event/i.test(text), `${label} should not mention input_event.\n${text}`);
  assert(!/--inputMode\s+inject/i.test(text), `${label} should not include an inject-mode command.\n${text}`);
}

async function checkHelp(args) {
  const result = await run(["--help"], args);
  assert(result.exitCode === 0, `help should exit 0. stderr=${result.stderr}`);
  assertIncludes(result.stdout, "Usage:", "help");
  assertIncludes(result.stdout, "--server", "help");
  assertIncludes(result.stdout, "--requireReady", "help");
  assertIncludes(result.stdout, "--boardSummary", "help");
  assertIncludes(result.stdout, "--sendStatus", "help");
  assertIncludes(result.stdout, "--sendMessage", "help");
  assertIncludes(result.stdout, "--sendCall", "help");
  assertNotIncludes(result.stdout, "Mac host password:", "help");
  assertSecretSafe(result.stdout, "help");
  console.log("[OK] Mac manual UX status help is pure");
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
    assert(payload.target === "192.168.31.122:43770", `ready JSON should prefer LAN Mac host target over board server, got ${payload.target}`);
    assert(payload.manualChecklist?.labels?.includes("复制诊断"), "ready JSON should include Chinese labels");
    assert(payload.safety?.requestPassword === false, "ready JSON must not request passwords");
    assert(payload.safety?.sendInputOrInject === false, "ready JSON must not send input/inject");
    assertIncludes(payload.boardSummary, "MacManualUx=status=ready", "ready JSON boardSummary");
    assertIncludes(payload.boardSummary, `ManualUxChecklist=${defaultChecklist}`, "ready JSON boardSummary");
    assertIncludes(payload.boardSummary, "ManualUxLabels=连接/画面/声音/剪贴板/文件/窗口/全屏/原画/复制诊断", "ready JSON boardSummary");
    assertSecretSafe(JSON.stringify(payload), "ready JSON");
  });
  console.log("[OK] Mac manual UX status detects ready PostPass board state");
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
  console.log("[OK] Mac manual UX status does not advertise loopback-only Mac target");
}

async function checkChinesePunctuationAfterChecklist(args) {
  await withFakeBoard(chinesePunctuationBoardState(), async (serverUrl) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `Chinese-punctuation JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "Chinese-punctuation JSON");
    assert(payload.status === "ready", `Chinese-punctuation JSON status mismatch: ${payload.status}`);
    assert(payload.manualChecklist?.summary === defaultChecklist, `Chinese punctuation after checklist should not drop the last item: ${payload.manualChecklist?.summary}`);
    assert(payload.manualChecklist?.labels?.includes("复制诊断"), "Chinese punctuation after checklist should keep copy diagnostics label");
    assertIncludes(payload.boardSummary, `ManualUxChecklist=${defaultChecklist}`, "Chinese-punctuation boardSummary");
  });
  console.log("[OK] Mac manual UX status keeps full checklist before Chinese punctuation");
}

async function checkBoardSummary(args) {
  await withFakeBoard(readyBoardState(), async (serverUrl) => {
    const result = await run(["--server", serverUrl, "--boardSummary"], args);
    assert(result.exitCode === 0, `board summary should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    assertIncludes(result.stdout, "MacManualUx=status=ready", "board summary");
    assertIncludes(result.stdout, "Next=ManualUxTest", "board summary");
    assertIncludes(result.stdout, "Safety=no-password,no-input-inject", "board summary");
    assertSecretSafe(result.stdout, "board summary");
  });
  console.log("[OK] Mac manual UX status prints secret-free board summary");
}

async function checkSendStatusAndMessage(args) {
  await withFakeBoard(readyBoardState(), async (serverUrl, posts) => {
    const result = await run([
      "--server",
      serverUrl,
      "--boardSummary",
      "--sendStatus",
      "--sendMessage",
      "--device",
      "Mac Manual UX",
      "--role",
      "Mac 端",
      "--from",
      "Mac Codex",
    ], args);
    assert(result.exitCode === 0, `sendStatus/sendMessage should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    assert(posts.length === 2, `sendStatus/sendMessage should post two records, got ${posts.length}: ${JSON.stringify(posts)}`);
    const statusPost = posts.find((post) => post.path === "/api/status");
    const messagePost = posts.find((post) => post.path === "/api/message");
    assert(statusPost, `missing /api/status post: ${JSON.stringify(posts)}`);
    assert(messagePost, `missing /api/message post: ${JSON.stringify(posts)}`);
    assert(statusPost.body.device === "Mac Manual UX", `status device mismatch: ${JSON.stringify(statusPost.body)}`);
    assert(statusPost.body.role === "Mac 端", `status role mismatch: ${JSON.stringify(statusPost.body)}`);
    assert(statusPost.body.status === "manual-ux-ready", `status value mismatch: ${JSON.stringify(statusPost.body)}`);
    assertIncludes(statusPost.body.note, "MacManualUx=status=ready", "status note");
    assertIncludes(statusPost.body.note, "Safety=no-password,no-input-inject", "status note");
    assert(messagePost.body.from === "Mac Codex", `message sender mismatch: ${JSON.stringify(messagePost.body)}`);
    assert(messagePost.body.type === "message", `message type mismatch: ${JSON.stringify(messagePost.body)}`);
    assertIncludes(messagePost.body.text, "Next=ManualUxTest", "message text");
    assertSecretSafe(`${result.stdout}\n${result.stderr}\n${JSON.stringify(posts)}`, "sendStatus/sendMessage");
  });
  console.log("[OK] Mac manual UX status can post secret-free status and message");
}

async function checkPostFailureFailsClosed(args) {
  await withFakeBoard(readyBoardState(), async (serverUrl) => {
    const result = await run(["--server", serverUrl, "--boardSummary", "--sendStatus"], args);
    assert(result.exitCode === 1, `sendStatus rejected by board should exit 1. stdout=${result.stdout} stderr=${result.stderr}`);
    assertIncludes(result.stderr, "fake-board-rejected-post", "sendStatus rejection");
    assertSecretSafe(`${result.stdout}\n${result.stderr}`, "sendStatus rejection");
  }, { rejectPosts: true });
  console.log("[OK] Mac manual UX status fails closed when Agent Link rejects a post");
}

async function checkRequireReadyFailure(args) {
  await withFakeBoard(waitingBoardState(), async (serverUrl) => {
    const result = await run(["--server", serverUrl, "--requireReady", "--json"], args);
    assert(result.exitCode === 1, `requireReady waiting state should exit 1. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "waiting JSON");
    assert(payload.status === "waiting", `waiting JSON status mismatch: ${payload.status}`);
    assert(payload.blockers?.includes("manual-ux-standby-not-detected"), "waiting JSON should include blocker");
    assertIncludes(payload.boardSummary, "MacManualUx=status=waiting", "waiting JSON boardSummary");
    assertSecretSafe(JSON.stringify(payload), "waiting JSON");
  });
  console.log("[OK] Mac manual UX status requireReady fails closed before standby signal");
}

async function checkUsableEntryCurrentCallIsReady(args) {
  await withFakeBoard(usableEntryCurrentCallBoardState(), async (serverUrl) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `usable-entry currentCall JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "usable-entry currentCall JSON");
    assert(payload.status === "ready", `usable-entry currentCall should be ready, got ${payload.status}`);
    assert(payload.signals?.usableEntryManualUxCall === true, "usable-entry currentCall should be a stable ready signal");
    assert(payload.manualChecklist?.summary === defaultChecklist, "usable-entry currentCall should use default manual checklist");
    assert(payload.target === "192.168.31.122:43770", `usable-entry currentCall should keep LAN Mac target, got ${payload.target}`);
    assertIncludes(payload.boardSummary, "MacManualUx=status=ready", "usable-entry boardSummary");
    assertIncludes(payload.boardSummary, "Signals=usableEntryManualUxCall", "usable-entry boardSummary");
    assertIncludes(payload.boardSummary, "Next=ManualUxTest", "usable-entry boardSummary");
    assertSecretSafe(JSON.stringify(payload), "usable-entry currentCall JSON");
  });
  console.log("[OK] Mac manual UX status treats usable-entry currentCall as manual UX ready");
}

async function checkUserAwakeCallProducesManualUxCallPlan(args) {
  await withFakeBoard(userAwakeManualUxCallBoardState(), async (serverUrl) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `USER_AWAKE currentCall JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "USER_AWAKE currentCall JSON");
    assert(payload.status === "call-ready", `USER_AWAKE currentCall should be call-ready, got ${payload.status}`);
    assert(payload.signals?.userAwakeManualUxCall === true, "USER_AWAKE currentCall should be detected as a manual UX coordination signal");
    assert(payload.commands?.manualUxCallCommand?.includes("codex-link-client.mjs"), `USER_AWAKE currentCall should expose manual UX call command: ${JSON.stringify(payload.commands)}`);
    assert(payload.commands?.manualUxCallCommand?.includes("--server"), "manual UX call command should include board server");
    assert(payload.commands?.manualUxCallCommand?.includes("--need"), "manual UX call command should include required collaborators");
    assertIncludes(payload.boardSummary, "MacManualUx=status=call-ready", "USER_AWAKE boardSummary");
    assertIncludes(payload.boardSummary, "userAwakeManualUxCall", "USER_AWAKE boardSummary");
    assertIncludes(payload.boardSummary, "Next=SendManualUxCall", "USER_AWAKE boardSummary");
    assertIncludes(payload.boardSummary, "ManualUxCallCommand=", "USER_AWAKE boardSummary");
    assertNotIncludes(payload.boardSummary, "blockers=manual-ux-standby-not-detected", "USER_AWAKE boardSummary");
    assertSecretSafe(JSON.stringify(payload), "USER_AWAKE currentCall JSON");
  });
  console.log("[OK] Mac manual UX status turns USER_AWAKE call into a safe manual UX call plan");
}

async function checkUserAwakeSendCallPostsManualUxCall(args) {
  await withFakeBoard(userAwakeManualUxCallBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json", "--sendCall"], args);
    assert(result.exitCode === 0, `USER_AWAKE --sendCall should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "USER_AWAKE --sendCall JSON");
    const calls = posts.filter((post) => post.path === "/api/call");
    assert(calls.length === 1, `USER_AWAKE --sendCall should post exactly one call, got ${calls.length}: ${JSON.stringify(posts)}`);
    const call = calls[0].body;
    assert(payload.sentCall?.ok === true, `USER_AWAKE --sendCall payload should record sentCall ok: ${JSON.stringify(payload.sentCall)}`);
    assert(payload.boardCallBeforeSend?.active === true, "USER_AWAKE --sendCall should record the existing Supervisor call before send");
    assert(call.from === "Mac Codex", `manual UX call sender mismatch: ${JSON.stringify(call)}`);
    assert(call.need === "Windows Codex, User", `manual UX call need mismatch: ${JSON.stringify(call)}`);
    assert(call.goal === "Mac manual UX validation: user-present real experience test", `manual UX call goal mismatch: ${JSON.stringify(call)}`);
    assertIncludes(call.expected, "connection", "manual UX call expected");
    assertIncludes(call.ask, "5-10 minute", "manual UX call ask");
    assertIncludes(payload.boardSummary, "ManualUxCallSent=true", "USER_AWAKE --sendCall boardSummary");
    assertSecretSafe(`${result.stdout}\n${result.stderr}\n${JSON.stringify(posts)}`, "USER_AWAKE --sendCall");
  });
  console.log("[OK] Mac manual UX status can send one safe USER_AWAKE manual UX call");
}

async function checkSendCallRefusesWhenNotCallReady(args) {
  await withFakeBoard(readyBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json", "--sendCall"], args);
    assert(result.exitCode === 1, `ready --sendCall should fail because it is already ready, not call-ready. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "ready --sendCall refusal JSON");
    assertIncludes(payload.error?.message || "", "Refusing to send manual UX call", "ready --sendCall refusal");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `ready --sendCall should not post a call: ${JSON.stringify(posts)}`);
    assertSecretSafe(`${result.stdout}\n${result.stderr}`, "ready --sendCall refusal");
  });
  console.log("[OK] Mac manual UX status refuses --sendCall outside call-ready state");
}

async function checkSendCallRefusesOtherActiveCall(args) {
  await withFakeBoard(otherActiveCallWithUserAwakeSignalBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json", "--sendCall"], args);
    assert(result.exitCode === 1, `other active call --sendCall should fail. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "other active call --sendCall refusal JSON");
    assertIncludes(payload.error?.message || "", "Refusing to replace existing Agent Link Board call", "other active call refusal");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `other active call should not be replaced: ${JSON.stringify(posts)}`);
    assertSecretSafe(`${result.stdout}\n${result.stderr}`, "other active call --sendCall refusal");
  });
  console.log("[OK] Mac manual UX status refuses to replace non-matching active board calls");
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
  await checkChinesePunctuationAfterChecklist(args);
  await checkBoardSummary(args);
  await checkSendStatusAndMessage(args);
  await checkPostFailureFailsClosed(args);
  await checkRequireReadyFailure(args);
  await checkUsableEntryCurrentCallIsReady(args);
  await checkUserAwakeCallProducesManualUxCallPlan(args);
  await checkUserAwakeSendCallPostsManualUxCall(args);
  await checkSendCallRefusesWhenNotCallReady(args);
  await checkSendCallRefusesOtherActiveCall(args);
  console.log("[OK] Mac manual UX status checks passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.stack || error.message}`);
  process.exitCode = 1;
});
