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

function assertMatches(text, pattern, label) {
  assert(pattern.test(String(text)), `${label} did not match ${pattern}.\n${text}`);
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

function readyWhileWindowsPushingBoardState() {
  const state = readyBoardState();
  return {
    ...state,
    statuses: {
      ...state.statuses,
      "Windows Codex": {
        status: "pushing-soon",
        role: "Windows 端",
        note: "Preparing final push for Windows manual UX coordination; Mac should wait before starting real manual UX validation.",
        updatedAt: "2026-06-20T01:24:58.000Z",
      },
    },
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

function userAwakeWhileWindowsPushingBoardState() {
  const state = userAwakeManualUxCallBoardState();
  return {
    ...state,
    statuses: {
      ...state.statuses,
      "Windows Codex": {
        status: "pushing-soon",
        role: "Windows 端",
        note: "Preparing pull/rebase and push for Windows resume/status changes; Mac should not replace currentCall yet.",
        updatedAt: "2026-06-20T09:59:59.000Z",
      },
    },
  };
}

function macManualUxCallInProgressBoardState() {
  const startedAt = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  return {
    updatedAt: "2026-06-20T10:08:00.000Z",
    currentCall: {
      status: "CALLING",
      from: "Mac Codex",
      need: "Windows Codex, User",
      goal: "Mac manual UX validation: user-present real experience test",
      expected: "Verify connection, video, audio, clipboard, file, window, fullscreen, original quality, and copy diagnostics.",
      ask: "Please confirm a 5-10 minute user-present manual UX window. Mac will not request credentials on the board or send remote input commands.",
      owner: "Mac Codex",
      startedAt,
      timeout: "10m",
    },
    statuses: {
      "Mac Manual UX": {
        status: "manual-ux-call-ready",
        role: "Mac 端",
        note: `MacManualUx=status=call-ready ManualUxChecklist=${defaultChecklist} Next=SendManualUxCall`,
        updatedAt: "2026-06-20T10:07:55.000Z",
      },
      "Windows Codex": {
        status: "pushed",
        role: "Windows 端",
        note: "Ready to read the Mac manual UX call.",
        updatedAt: "2026-06-20T10:07:57.000Z",
      },
    },
    recentEvents: [
      {
        at: "2026-06-20T10:07:50.000Z",
        type: "message",
        from: "Supervisor Codex",
        text: "USER_AWAKE: user is awake; prepare real manual UX validation after explicit call.",
      },
    ],
  };
}

function expiredMacManualUxCallBoardState() {
  const state = macManualUxCallInProgressBoardState();
  return {
    ...state,
    currentCall: {
      ...state.currentCall,
      startedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      timeout: "10m",
    },
  };
}

function expiredMacManualUxCallWhileWindowsPushingBoardState() {
  const state = expiredMacManualUxCallBoardState();
  return {
    ...state,
    statuses: {
      ...state.statuses,
      "Windows Codex": {
        status: "pushing-soon",
        role: "Windows 端",
        note: "Preparing to push Windows manual UX resume/status parsing; Mac should not replace currentCall yet.",
        updatedAt: "2026-06-20T10:10:00.000Z",
      },
    },
  };
}

function expiredMacManualUxCallWhileWindowsCommittingBoardState() {
  const state = expiredMacManualUxCallBoardState();
  return {
    ...state,
    statuses: {
      ...state.statuses,
      "Windows Codex": {
        status: "committing",
        role: "Windows 端",
        note: "验证完成，准备提交推送：Windows ack 文案对齐 + Mac manual UX 确认防误触。",
        updatedAt: "2026-06-20T10:10:30.000Z",
      },
    },
  };
}

function expiredMacManualUxCallWhileUserSleepingBoardState() {
  const state = expiredMacManualUxCallBoardState();
  return {
    ...state,
    events: [
      ...(state.recentEvents || []),
      {
        at: "2026-06-20T10:11:00.000Z",
        type: "message",
        from: "Supervisor Codex",
        text: "【Supervisor 夜间下一批无授权任务】用户仍是 USER_SLEEPING。currentCall 是用户在场 manual UX，请发起方清理/暂停或标记 BLOCKED_BY_USER_SLEEP，醒后再重发；禁止密码、系统授权、真实 input/inject、人工听感/观感确认。",
      },
    ],
    recentEvents: [],
  };
}

function expiredMacManualUxCallWithSupervisorSleepCorrectionBoardState() {
  const state = expiredMacManualUxCallBoardState();
  return {
    ...state,
    events: [
      ...(state.recentEvents || []),
      {
        at: "2026-06-20T10:11:00.000Z",
        type: "message",
        from: "Supervisor Codex",
        text: "【Supervisor 休息模式纠偏】用户仍是 USER_SLEEPING，不能发起或推进 5-10 分钟用户在场 manual UX。当前 Mac 又发起了 active manual UX call，请立即撤销/清理，或标记 BLOCKED_BY_USER_SLEEP，等用户明确说醒了/可以操作了再重发。虽然 origin/main 已有 5881d52/9f768c7 试图 gate user presence，但通讯板当前仍显示 active call，按风险处理。",
      },
    ],
    recentEvents: [],
  };
}

function expiredMacManualUxCallWithAwakeAfterPresenceLabelReferenceBoardState() {
  const state = expiredMacManualUxCallWhileUserSleepingBoardState();
  return {
    ...state,
    statuses: {
      ...state.statuses,
      "Mac Codex": {
        status: "testing",
        role: "Mac 端",
        note: "Mac manual UX 已补 USER_SLEEPING/USER_AWAKE gate：睡眠态抑制 reconfirm/sendCall，用户醒后需按明确 call 协调；这只是功能说明，不是当前用户睡眠状态。",
        updatedAt: "2026-06-20T10:13:00.000Z",
      },
    },
    events: [
      ...(state.events || []),
      {
        at: "2026-06-20T10:12:00.000Z",
        type: "message",
        from: "Mac Codex",
        text: "USER_AWAKE: 用户已在 Mac Codex 线程确认可以正式工作并可参与授权。后续仍需按任务发明确 call；不要在通讯板发送密码、密钥或系统账号。",
      },
      {
        at: "2026-06-20T10:14:00.000Z",
        type: "message",
        from: "Mac Codex",
        text: "Mac 本轮准备本地提交：manual UX 状态脚本会区分真实用户睡眠/醒来信号与说明性标签引用；睡眠态抑制 reconfirm/sendCall，说明文字不再误判。",
      },
    ],
  };
}

function confirmedMacManualUxCallBoardState() {
  const state = macManualUxCallInProgressBoardState();
  return {
    ...state,
    recentEvents: [
      ...state.recentEvents,
      {
        at: new Date(Date.now() - 30 * 1000).toISOString(),
        type: "message",
        from: "Windows Codex",
        text: "MAC_MANUAL_UX_CONFIRMED: Windows/User confirmed the manual UX window; start ManualUxTest now.",
      },
    ],
  };
}

function confirmedMacManualUxCallEventsOnlyBoardState() {
  const state = confirmedMacManualUxCallBoardState();
  const { recentEvents, ...withoutRecentEvents } = state;
  return {
    ...withoutRecentEvents,
    events: recentEvents,
  };
}

function referencedConfirmationTagBoardState() {
  const state = macManualUxCallInProgressBoardState();
  return {
    ...state,
    statuses: {
      ...state.statuses,
      "Windows Codex": {
        status: "fixing-confirm-guard",
        role: "Windows 端",
        note: "Preparing guard fix: do not treat a planned MAC_MANUAL_UX_CONFIRMED / WINDOWS_MANUAL_UX_ACK tag mention as a real manual UX confirmation.",
        updatedAt: new Date(Date.now() - 30 * 1000).toISOString(),
      },
    },
  };
}

function descriptiveMacManualUxTagMentionBoardState() {
  const state = macManualUxCallInProgressBoardState();
  return {
    ...state,
    statuses: {
      ...state.statuses,
      "Windows Codex": {
        status: "pushing-soon",
        role: "Windows 端",
        note: "准备推送：本轮仅对齐 Windows MacManualUxAck 确认文案，让确认消息同时携带 MAC_MANUAL_UX_CONFIRMED 与 WINDOWS_MANUAL_UX_ACK；这不是实际手工体验确认。",
        updatedAt: new Date(Date.now() - 20 * 1000).toISOString(),
      },
    },
    recentEvents: [
      ...state.recentEvents,
      {
        at: new Date(Date.now() - 30 * 1000).toISOString(),
        type: "message",
        from: "Windows Codex",
        text: "准备推送：这里只是说明确认短标签 MAC_MANUAL_UX_CONFIRMED 和 WINDOWS_MANUAL_UX_ACK 会写入 ack；这不是实际手工体验确认。",
      },
    ],
  };
}

function descriptiveMacManualUxTagMentionEventsOnlyBoardState() {
  const state = descriptiveMacManualUxTagMentionBoardState();
  const { recentEvents, ...withoutRecentEvents } = state;
  return {
    ...withoutRecentEvents,
    events: recentEvents,
  };
}

async function checkReferencedConfirmationTagDoesNotReadyCall(args) {
  await withFakeBoard(referencedConfirmationTagBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `referenced confirmation tag JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "referenced confirmation tag JSON");
    assert(payload.status === "calling", `referenced confirmation tag should remain calling, got ${payload.status}`);
    assert(payload.signals?.manualUxConfirmed !== true, `referenced confirmation tag should not be accepted: ${JSON.stringify(payload.signals)}`);
    assertIncludes(payload.boardSummary, "MacManualUx=status=calling", "referenced confirmation tag boardSummary");
    assertIncludes(payload.boardSummary, "Next=WaitForManualUxConfirmation", "referenced confirmation tag boardSummary");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `referenced confirmation tag read-only status should not post a call: ${JSON.stringify(posts)}`);
    assertSecretSafe(JSON.stringify(payload), "referenced confirmation tag JSON");
  });
  console.log("[OK] Mac manual UX status ignores explanatory confirmation-tag references");
}

async function checkDescriptiveManualUxTagMentionDoesNotConfirm(args) {
  await withFakeBoard(descriptiveMacManualUxTagMentionBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `descriptive manual UX tag mention JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "descriptive manual UX tag mention JSON");
    assert(payload.status === "calling", `descriptive tag mention should remain calling, got ${payload.status}`);
    assert(payload.signals?.manualUxConfirmed !== true, `descriptive tag mention should not be accepted: ${JSON.stringify(payload.signals)}`);
    assertIncludes(payload.boardSummary, "MacManualUx=status=calling", "descriptive manual UX tag mention boardSummary");
    assertIncludes(payload.boardSummary, "Next=WaitForManualUxConfirmation", "descriptive manual UX tag mention boardSummary");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `descriptive tag mention should not post a call: ${JSON.stringify(posts)}`);
    assertSecretSafe(JSON.stringify(payload), "descriptive manual UX tag mention JSON");
  });
  console.log("[OK] Mac manual UX status ignores descriptive confirmation tag mentions");
}

async function checkEventsArrayDescriptiveManualUxTagMentionDoesNotConfirm(args) {
  await withFakeBoard(descriptiveMacManualUxTagMentionEventsOnlyBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `events-only descriptive tag mention JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "events-only descriptive tag mention JSON");
    assert(payload.status === "calling", `events-only descriptive tag mention should remain calling, got ${payload.status}`);
    assert(payload.signals?.manualUxConfirmed !== true, `events-only descriptive tag mention should not be accepted: ${JSON.stringify(payload.signals)}`);
    assertIncludes(payload.boardSummary, "MacManualUx=status=calling", "events-only descriptive tag mention boardSummary");
    assertIncludes(payload.boardSummary, "BoardEventSources=events", "events-only descriptive tag mention boardSummary");
    assertIncludes(payload.boardSummary, "Next=WaitForManualUxConfirmation", "events-only descriptive tag mention boardSummary");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `events-only descriptive tag mention should not post a call: ${JSON.stringify(posts)}`);
    assertSecretSafe(JSON.stringify(payload), "events-only descriptive tag mention JSON");
  });
  console.log("[OK] Mac manual UX status ignores descriptive confirmation tag mentions from real Agent Link events");
}

function staleConfirmedMacManualUxCallBoardState() {
  const state = macManualUxCallInProgressBoardState();
  return {
    ...state,
    recentEvents: [
      ...state.recentEvents,
      {
        at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        type: "message",
        from: "Windows Codex",
        text: "MAC_MANUAL_UX_CONFIRMED: Old manual UX window confirmation from a previous call.",
      },
    ],
  };
}

function expiredConfirmedMacManualUxCallBoardState() {
  const state = expiredMacManualUxCallBoardState();
  return {
    ...state,
    recentEvents: [
      ...state.recentEvents,
      {
        at: new Date(Date.now() - 30 * 1000).toISOString(),
        type: "message",
        from: "Windows Codex",
        text: "MAC_MANUAL_UX_CONFIRMED: Late confirmation after the manual UX call already timed out.",
      },
    ],
  };
}

function expiredCallWithInWindowConfirmationBoardState() {
  const state = expiredMacManualUxCallBoardState();
  const startedAtMs = Date.parse(state.currentCall.startedAt);
  return {
    ...state,
    recentEvents: [
      ...state.recentEvents,
      {
        at: new Date(startedAtMs + 60 * 1000).toISOString(),
        type: "message",
        from: "Windows Codex",
        text: "MAC_MANUAL_UX_CONFIRMED: Windows/User confirmed the manual UX window.",
      },
    ],
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

function userAwakeManualUxSafetyExplanationAfterSleepBoardState() {
  return {
    updatedAt: "2026-06-20T10:20:00.000Z",
    currentCall: null,
    statuses: {
      "Mac Manual UX": {
        status: "manual-ux-waiting",
        role: "Mac 端",
        note: `MacManualUx=status=waiting ManualUxChecklist=${defaultChecklist} Safety=no-password,no-input-inject blockers=manual-ux-standby-not-detected`,
        updatedAt: "2026-06-20T10:19:58.000Z",
      },
    },
    events: [
      {
        at: "2026-06-20T10:19:00.000Z",
        type: "message",
        from: "Supervisor Codex",
        text: "USER_SLEEPING: 用户仍是 USER_SLEEPING，不能发起或推进 5-10 分钟用户在场 manual UX。",
      },
      {
        at: "2026-06-20T10:20:00.000Z",
        type: "message",
        from: "Mac Codex",
        text: "USER_AWAKE: 用户已在 Mac Codex 线程确认可以正式工作并可参与必要授权；后续如果进入真实手工体验/manual UX，仍需另发明确 call 说明目标、安全边界和预计 5-10 分钟。不要在通讯板发送密码、密钥或系统账号；本消息不请求密码、不发 input/inject。",
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

function assertOperatorAction(payload, expected, label) {
  assert(payload.operatorAction?.id === expected, `${label} operatorAction mismatch: ${JSON.stringify(payload.operatorAction)}`);
  assertIncludes(payload.boardSummary || "", `ManualUxAction=${expected}`, `${label} boardSummary`);
  assertSecretSafe(JSON.stringify(payload.operatorAction), `${label} operatorAction`);
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
  assertIncludes(result.stdout, "--reconfirmCall", "help");
  assertIncludes(result.stdout, "operatorAction", "help");
  assertIncludes(result.stdout, "events", "help");
  assertIncludes(result.stdout, "recentEvents", "help");
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
    assertOperatorAction(payload, "start-manual-ux-test", "ready JSON");
    assertSecretSafe(JSON.stringify(payload), "ready JSON");
  });
  console.log("[OK] Mac manual UX status detects ready PostPass board state");
}

async function checkReadyWhileWindowsPushingAddsManualUxGate(args) {
  await withFakeBoard(readyWhileWindowsPushingBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `ready while Windows pushing JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "ready while Windows pushing JSON");
    assert(payload.status === "ready", `ready while Windows pushing status mismatch: ${payload.status}`);
    assert(payload.warnings?.includes("windows-codex-pushing"), `ready while Windows pushing should include warning: ${JSON.stringify(payload.warnings)}`);
    assertIncludes(payload.boardSummary, "ManualUxGate=wait-windows-codex-push", "ready while Windows pushing boardSummary");
    assertIncludes(payload.nextActions?.join("\n") || "", "Wait for Windows Codex to finish push/rebase coordination", "ready while Windows pushing nextActions");
    assertOperatorAction(payload, "wait-windows-codex-push", "ready while Windows pushing JSON");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `read-only ready status should not post a call: ${JSON.stringify(posts)}`);
    assertSecretSafe(JSON.stringify(payload), "ready while Windows pushing JSON");
  });
  console.log("[OK] Mac manual UX status gates ready state while Windows is pushing");
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
    assertIncludes(result.stdout, "BoardEventSources=recentEvents", "board summary");
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
    assertOperatorAction(payload, "wait-manual-ux-standby", "waiting JSON");
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
    assertOperatorAction(payload, "send-manual-ux-call", "USER_AWAKE currentCall JSON");
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

async function checkManualUxCallInProgressDoesNotOfferDuplicateCall(args) {
  await withFakeBoard(macManualUxCallInProgressBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `manual UX call-in-progress JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "manual UX call-in-progress JSON");
    assert(payload.status === "calling", `manual UX call-in-progress should be calling, got ${payload.status}`);
    assert(payload.signals?.manualUxCallInProgress === true, "manual UX call-in-progress signal should be true");
    assert(payload.manualUxCall?.state === "active", `manual UX call-in-progress should expose active call timing: ${JSON.stringify(payload.manualUxCall)}`);
    assert(Number.isFinite(payload.manualUxCall?.ageMs), `manual UX call-in-progress should expose ageMs: ${JSON.stringify(payload.manualUxCall)}`);
    assert(payload.commands?.manualUxCallCommand == null, `manual UX call-in-progress should not expose another call command: ${JSON.stringify(payload.commands)}`);
    assertIncludes(payload.boardSummary, "MacManualUx=status=calling", "manual UX call-in-progress boardSummary");
    assertIncludes(payload.boardSummary, "Next=WaitForManualUxConfirmation", "manual UX call-in-progress boardSummary");
    assertIncludes(payload.boardSummary, "ManualUxCall=active", "manual UX call-in-progress boardSummary");
    assertMatches(payload.boardSummary, /\bManualUxCallAgeMs=\d+\b/, "manual UX call-in-progress boardSummary");
    assertMatches(payload.boardSummary, /\bManualUxCallRemainingMs=\d+\b/, "manual UX call-in-progress boardSummary");
    assertNotIncludes(payload.boardSummary, "ManualUxCallCommand=", "manual UX call-in-progress boardSummary");
    assertOperatorAction(payload, "wait-manual-ux-confirmation", "manual UX call-in-progress JSON");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `read-only calling status should not post a call: ${JSON.stringify(posts)}`);
    assertSecretSafe(JSON.stringify(payload), "manual UX call-in-progress JSON");
  });
  console.log("[OK] Mac manual UX status treats an active manual UX call as waiting for confirmation");
}

async function checkConfirmedManualUxCallIsReady(args) {
  await withFakeBoard(confirmedMacManualUxCallBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `confirmed manual UX call JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "confirmed manual UX call JSON");
    assert(payload.status === "ready", `confirmed manual UX call should be ready, got ${payload.status}`);
    assert(payload.signals?.manualUxCallInProgress === true, "confirmed manual UX call should still expose current call signal");
    assert(payload.signals?.manualUxConfirmed === true, "confirmed manual UX call should expose confirmation signal");
    assert(payload.commands?.manualUxCallCommand == null, `confirmed manual UX call should not expose another call command: ${JSON.stringify(payload.commands)}`);
    assertIncludes(payload.boardSummary, "MacManualUx=status=ready", "confirmed manual UX call boardSummary");
    assertIncludes(payload.boardSummary, "manualUxConfirmed", "confirmed manual UX call boardSummary");
    assertIncludes(payload.boardSummary, "Next=ManualUxTest", "confirmed manual UX call boardSummary");
    assertIncludes(payload.boardSummary, "ManualUxCall=active", "confirmed manual UX call boardSummary");
    assertMatches(payload.boardSummary, /\bManualUxCallAgeMs=\d+\b/, "confirmed manual UX call boardSummary");
    assertMatches(payload.boardSummary, /\bManualUxCallRemainingMs=\d+\b/, "confirmed manual UX call boardSummary");
    assertOperatorAction(payload, "start-manual-ux-test", "confirmed manual UX call JSON");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `confirmed read-only status should not post a call: ${JSON.stringify(posts)}`);
    assertSecretSafe(JSON.stringify(payload), "confirmed manual UX call JSON");
  });
  console.log("[OK] Mac manual UX status treats a current call confirmation as ready");
}

async function checkEventsArrayConfirmationIsAccepted(args) {
  await withFakeBoard(confirmedMacManualUxCallEventsOnlyBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `events-only confirmation JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "events-only confirmation JSON");
    assert(payload.status === "ready", `events-only confirmation should be ready, got ${payload.status}`);
    assert(payload.signals?.manualUxConfirmed === true, `events-only confirmation should be accepted: ${JSON.stringify(payload.signals)}`);
    assertIncludes(payload.boardSummary, "MacManualUx=status=ready", "events-only confirmation boardSummary");
    assertIncludes(payload.boardSummary, "manualUxConfirmed", "events-only confirmation boardSummary");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `events-only read-only status should not post a call: ${JSON.stringify(posts)}`);
    assertSecretSafe(JSON.stringify(payload), "events-only confirmation JSON");
  });
  console.log("[OK] Mac manual UX status accepts confirmations from real Agent Link events");
}

async function checkStaleManualUxConfirmationDoesNotReadyNewCall(args) {
  await withFakeBoard(staleConfirmedMacManualUxCallBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `stale confirmed manual UX call JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "stale confirmed manual UX call JSON");
    assert(payload.status === "calling", `stale confirmed manual UX call should remain calling, got ${payload.status}`);
    assert(payload.signals?.manualUxConfirmed !== true, `stale confirmation should not be accepted: ${JSON.stringify(payload.signals)}`);
    assertIncludes(payload.boardSummary, "MacManualUx=status=calling", "stale confirmed manual UX call boardSummary");
    assertIncludes(payload.boardSummary, "Next=WaitForManualUxConfirmation", "stale confirmed manual UX call boardSummary");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `stale read-only status should not post a call: ${JSON.stringify(posts)}`);
    assertSecretSafe(JSON.stringify(payload), "stale confirmed manual UX call JSON");
  });
  console.log("[OK] Mac manual UX status ignores stale manual UX confirmations");
}

async function checkLateManualUxConfirmationDoesNotReadyExpiredCall(args) {
  await withFakeBoard(expiredConfirmedMacManualUxCallBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `late confirmed manual UX call JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "late confirmed manual UX call JSON");
    assert(payload.status === "calling", `late confirmed manual UX call should remain calling, got ${payload.status}`);
    assert(payload.signals?.manualUxConfirmed !== true, `late confirmation should not be accepted after timeout: ${JSON.stringify(payload.signals)}`);
    assert(payload.manualUxCall?.timedOut === true, `late confirmed manual UX call should expose timeout: ${JSON.stringify(payload.manualUxCall)}`);
    assertIncludes(payload.boardSummary, "MacManualUx=status=calling", "late confirmed manual UX call boardSummary");
    assertIncludes(payload.boardSummary, "Next=ReconfirmManualUxCall", "late confirmed manual UX call boardSummary");
    assertIncludes(payload.boardSummary, "ManualUxCall=timeout", "late confirmed manual UX call boardSummary");
    assertMatches(payload.boardSummary, /\bManualUxCallOverdueMs=\d+\b/, "late confirmed manual UX call boardSummary");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `late confirmed read-only status should not post a call: ${JSON.stringify(posts)}`);
    assertSecretSafe(JSON.stringify(payload), "late confirmed manual UX call JSON");
  });
  console.log("[OK] Mac manual UX status ignores confirmations after the call timeout");
}

async function checkExpiredCallRequiresReconfirmEvenWhenPreviouslyConfirmed(args) {
  await withFakeBoard(expiredCallWithInWindowConfirmationBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `previously confirmed expired call JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "previously confirmed expired call JSON");
    assert(payload.status === "calling", `previously confirmed expired call should require reconfirm, got ${payload.status}`);
    assert(payload.signals?.manualUxConfirmed !== true, `expired call should not keep manualUxConfirmed after timeout: ${JSON.stringify(payload.signals)}`);
    assert(payload.manualUxCall?.timedOut === true, `previously confirmed expired call should expose timeout: ${JSON.stringify(payload.manualUxCall)}`);
    assertIncludes(payload.boardSummary, "MacManualUx=status=calling", "previously confirmed expired call boardSummary");
    assertIncludes(payload.boardSummary, "Next=ReconfirmManualUxCall", "previously confirmed expired call boardSummary");
    assertIncludes(payload.boardSummary, "ManualUxCall=timeout", "previously confirmed expired call boardSummary");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `previously confirmed expired read-only status should not post a call: ${JSON.stringify(posts)}`);
    assertSecretSafe(JSON.stringify(payload), "previously confirmed expired call JSON");
  });
  console.log("[OK] Mac manual UX status requires reconfirm after a confirmed call times out");
}

async function checkExpiredManualUxCallRequestsReconfirmation(args) {
  await withFakeBoard(expiredMacManualUxCallBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `expired manual UX call JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "expired manual UX call JSON");
    assert(payload.status === "calling", `expired manual UX call should remain calling, got ${payload.status}`);
    assert(payload.manualUxCall?.state === "timeout", `expired manual UX call should expose timeout state: ${JSON.stringify(payload.manualUxCall)}`);
    assert(payload.manualUxCall?.timedOut === true, `expired manual UX call should expose timedOut=true: ${JSON.stringify(payload.manualUxCall)}`);
    assert(payload.warnings?.includes("manual-ux-call-timeout"), `expired manual UX call should include timeout warning: ${JSON.stringify(payload.warnings)}`);
    assertIncludes(payload.nextActions?.join("\n") || "", "--reconfirmCall", "expired manual UX call nextActions");
    assertIncludes(payload.boardSummary, "ManualUxCall=timeout", "expired manual UX call boardSummary");
    assertIncludes(payload.boardSummary, "Next=ReconfirmManualUxCall", "expired manual UX call boardSummary");
    assertMatches(payload.boardSummary, /\bManualUxCallAgeMs=\d+\b/, "expired manual UX call boardSummary");
    assertMatches(payload.boardSummary, /\bManualUxCallOverdueMs=\d+\b/, "expired manual UX call boardSummary");
    assertIncludes(payload.boardSummary, "ManualUxReconfirmCommand=", "expired manual UX call boardSummary");
    assertIncludes(payload.boardSummary, "--reconfirmCall", "expired manual UX call boardSummary");
    assertNotIncludes(payload.boardSummary, "ManualUxCallRemainingMs=", "expired manual UX call boardSummary");
    assertNotIncludes(payload.boardSummary, "ManualUxCallCommand=", "expired manual UX call boardSummary");
    assertOperatorAction(payload, "reconfirm-manual-ux-call", "expired manual UX call JSON");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `expired read-only status should not post a call: ${JSON.stringify(posts)}`);
    assertSecretSafe(JSON.stringify(payload), "expired manual UX call JSON");
  });
  console.log("[OK] Mac manual UX status warns when the active manual UX call times out");
}

async function checkExpiredManualUxCallWaitsForUserAwake(args) {
  await withFakeBoard(expiredMacManualUxCallWhileUserSleepingBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `expired manual UX while user sleeping JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "expired manual UX while user sleeping JSON");
    assert(payload.status === "calling", `expired manual UX while user sleeping should remain calling, got ${payload.status}`);
    assert(payload.coordination?.userPresence?.state === "sleeping", `user sleeping state should be detected: ${JSON.stringify(payload.coordination)}`);
    assert(payload.coordination?.manualUxGate === "wait-user-awake", `manual UX gate should wait for user awake: ${JSON.stringify(payload.coordination)}`);
    assert(payload.warnings?.includes("user-sleeping"), `expired manual UX while sleeping should include user-sleeping warning: ${JSON.stringify(payload.warnings)}`);
    assertIncludes(payload.nextActions?.join("\n") || "", "Wait for USER_AWAKE", "expired manual UX while sleeping nextActions");
    assertIncludes(payload.boardSummary, "ManualUxGate=wait-user-awake", "expired manual UX while sleeping boardSummary");
    assertIncludes(payload.boardSummary, "warnings=manual-ux-call-timeout,user-sleeping", "expired manual UX while sleeping boardSummary");
    assertNotIncludes(payload.boardSummary, "ManualUxReconfirmCommand=", "expired manual UX while sleeping boardSummary");
    assertOperatorAction(payload, "wait-user-awake", "expired manual UX while sleeping JSON");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `expired sleeping state should not post a call: ${JSON.stringify(posts)}`);
    assertSecretSafe(JSON.stringify(payload), "expired manual UX while user sleeping JSON");
  });
  console.log("[OK] Mac manual UX status suppresses reconfirm while the user is sleeping");
}

async function checkSupervisorSleepCorrectionOverridesGateReference(args) {
  await withFakeBoard(expiredMacManualUxCallWithSupervisorSleepCorrectionBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `supervisor sleep correction JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "supervisor sleep correction JSON");
    assert(payload.coordination?.userPresence?.state === "sleeping", `Supervisor sleep correction should be detected despite gate reference: ${JSON.stringify(payload.coordination)}`);
    assert(payload.coordination?.manualUxGate === "wait-user-awake", `Supervisor sleep correction should gate manual UX: ${JSON.stringify(payload.coordination)}`);
    assert(payload.warnings?.includes("user-sleeping"), `Supervisor sleep correction should include user-sleeping warning: ${JSON.stringify(payload.warnings)}`);
    assertIncludes(payload.boardSummary, "ManualUxGate=wait-user-awake", "supervisor sleep correction boardSummary");
    assertNotIncludes(payload.boardSummary, "ManualUxReconfirmCommand=", "supervisor sleep correction boardSummary");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `Supervisor sleep correction read-only status should not post a call: ${JSON.stringify(posts)}`);
    assertSecretSafe(JSON.stringify(payload), "supervisor sleep correction JSON");
  });
  console.log("[OK] Mac manual UX status honors Supervisor USER_SLEEPING even when the message mentions gate references");
}

async function checkReconfirmRefusesWhileUserSleeping(args) {
  await withFakeBoard(expiredMacManualUxCallWhileUserSleepingBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json", "--reconfirmCall"], args);
    assert(result.exitCode === 1, `expired manual UX --reconfirmCall should fail while user is sleeping. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "user sleeping --reconfirmCall refusal JSON");
    assertIncludes(payload.error?.message || "", "User is sleeping", "user sleeping reconfirm refusal");
    assertIncludes(payload.boardSummary, "ManualUxGate=wait-user-awake", "user sleeping reconfirm refusal boardSummary");
    assertNotIncludes(payload.boardSummary, "ManualUxReconfirmCommand=", "user sleeping reconfirm refusal boardSummary");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `user sleeping state should not post a reconfirm call: ${JSON.stringify(posts)}`);
    assertSecretSafe(`${result.stdout}\n${result.stderr}`, "user sleeping --reconfirmCall refusal");
  });
  console.log("[OK] Mac manual UX status refuses --reconfirmCall while the user is sleeping");
}

async function checkPresenceLabelReferenceDoesNotOverrideUserAwake(args) {
  await withFakeBoard(expiredMacManualUxCallWithAwakeAfterPresenceLabelReferenceBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `presence label reference JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "presence label reference JSON");
    assert(payload.coordination?.userPresence?.state === "awake", `presence label reference should keep latest real USER_AWAKE: ${JSON.stringify(payload.coordination)}`);
    assert(payload.coordination?.manualUxGate === "clear", `presence label reference should not gate manual UX: ${JSON.stringify(payload.coordination)}`);
    assert(!payload.warnings?.includes("user-sleeping"), `presence label reference should not add user-sleeping warning: ${JSON.stringify(payload.warnings)}`);
    assertIncludes(payload.boardSummary, "ManualUxReconfirmCommand=", "presence label reference boardSummary");
    assertNotIncludes(payload.boardSummary, "ManualUxGate=wait-user-awake", "presence label reference boardSummary");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `presence label reference read-only status should not post a call: ${JSON.stringify(posts)}`);
    assertSecretSafe(JSON.stringify(payload), "presence label reference JSON");
  });
  console.log("[OK] Mac manual UX status ignores explanatory USER_SLEEPING/USER_AWAKE label references");
}

async function checkExpiredManualUxCallCanBeReconfirmed(args) {
  await withFakeBoard(expiredMacManualUxCallBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json", "--reconfirmCall"], args);
    assert(result.exitCode === 0, `expired manual UX --reconfirmCall should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "expired manual UX --reconfirmCall JSON");
    const calls = posts.filter((post) => post.path === "/api/call");
    assert(calls.length === 1, `expired manual UX --reconfirmCall should post exactly one call, got ${calls.length}: ${JSON.stringify(posts)}`);
    assert(payload.reconfirmedCall?.ok === true, `expired manual UX --reconfirmCall should record reconfirmedCall ok: ${JSON.stringify(payload.reconfirmedCall)}`);
    assert(payload.boardCallBeforeSend?.active === true, "expired manual UX --reconfirmCall should record previous active call before replacement");
    assert(payload.manualUxCall?.state === "timeout", `expired manual UX --reconfirmCall should preserve timeout state: ${JSON.stringify(payload.manualUxCall)}`);
    assert(calls[0].body.goal === "Mac manual UX validation: user-present real experience test", `reconfirm call goal mismatch: ${JSON.stringify(calls[0].body)}`);
    assertIncludes(payload.boardSummary, "ManualUxCallReconfirmed=true", "expired manual UX --reconfirmCall boardSummary");
    assertSecretSafe(`${result.stdout}\n${result.stderr}\n${JSON.stringify(posts)}`, "expired manual UX --reconfirmCall");
  });
  console.log("[OK] Mac manual UX status can explicitly reconfirm an expired manual UX call");
}

async function checkActiveManualUxCallRefusesReconfirm(args) {
  await withFakeBoard(macManualUxCallInProgressBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json", "--reconfirmCall"], args);
    assert(result.exitCode === 1, `active manual UX --reconfirmCall should fail. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "active manual UX --reconfirmCall refusal JSON");
    assertIncludes(payload.error?.message || "", "expired manual UX call", "active manual UX --reconfirmCall refusal");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `active manual UX --reconfirmCall should not post a call: ${JSON.stringify(posts)}`);
    assertSecretSafe(`${result.stdout}\n${result.stderr}`, "active manual UX --reconfirmCall refusal");
  });
  console.log("[OK] Mac manual UX status refuses to reconfirm an active manual UX call");
}

async function checkReconfirmRefusesWhileWindowsIsPushing(args) {
  await withFakeBoard(expiredMacManualUxCallWhileWindowsPushingBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json", "--reconfirmCall"], args);
    assert(result.exitCode === 1, `expired manual UX --reconfirmCall should fail while Windows is pushing. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "Windows pushing --reconfirmCall refusal JSON");
    assertIncludes(payload.error?.message || "", "Windows Codex is pushing-soon", "Windows pushing reconfirm refusal");
    assertNotIncludes(payload.boardSummary, "ManualUxReconfirmCommand=", "Windows pushing reconfirm refusal boardSummary");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `Windows pushing state should not post a reconfirm call: ${JSON.stringify(posts)}`);
    assertSecretSafe(`${result.stdout}\n${result.stderr}`, "Windows pushing --reconfirmCall refusal");
  });
  console.log("[OK] Mac manual UX status refuses --reconfirmCall while Windows is pushing");
}

async function checkReconfirmRefusesWhileWindowsIsCommittingPush(args) {
  await withFakeBoard(expiredMacManualUxCallWhileWindowsCommittingBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json", "--reconfirmCall"], args);
    assert(result.exitCode === 1, `expired manual UX --reconfirmCall should fail while Windows is committing a push. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "Windows committing push --reconfirmCall refusal JSON");
    assertIncludes(payload.error?.message || "", "Windows Codex is committing", "Windows committing push reconfirm refusal");
    assert(payload.warnings?.includes("windows-codex-pushing"), `Windows committing push refusal should keep warning: ${JSON.stringify(payload.warnings)}`);
    assertIncludes(payload.boardSummary, "ManualUxGate=wait-windows-codex-push", "Windows committing push refusal boardSummary");
    assertNotIncludes(payload.boardSummary, "ManualUxReconfirmCommand=", "Windows committing push refusal boardSummary");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `Windows committing push state should not post a reconfirm call: ${JSON.stringify(posts)}`);
    assertSecretSafe(`${result.stdout}\n${result.stderr}`, "Windows committing push --reconfirmCall refusal");
  });
  console.log("[OK] Mac manual UX status refuses --reconfirmCall while Windows is committing a push");
}

async function checkSendCallRefusesWhileWindowsIsPushing(args) {
  await withFakeBoard(userAwakeWhileWindowsPushingBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json", "--sendCall"], args);
    assert(result.exitCode === 1, `USER_AWAKE --sendCall should fail while Windows is pushing. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "Windows pushing --sendCall refusal JSON");
    assertIncludes(payload.error?.message || "", "Windows Codex is pushing-soon", "Windows pushing refusal");
    assertIncludes(payload.error?.message || "", "manual UX call", "Windows pushing refusal");
    assert(payload.sentCall?.ok === false, `Windows pushing refusal should record sentCall ok=false: ${JSON.stringify(payload.sentCall)}`);
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `Windows pushing state should not post a call: ${JSON.stringify(posts)}`);
    assertSecretSafe(`${result.stdout}\n${result.stderr}`, "Windows pushing --sendCall refusal");
  });
  console.log("[OK] Mac manual UX status refuses --sendCall while Windows is pushing");
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

async function checkUserAwakeSafetyExplanationClearsSleepGate(args) {
  await withFakeBoard(userAwakeManualUxSafetyExplanationAfterSleepBoardState(), async (serverUrl, posts) => {
    const result = await run(["--server", serverUrl, "--json"], args);
    assert(result.exitCode === 0, `USER_AWAKE safety explanation JSON should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "USER_AWAKE safety explanation JSON");
    assert(payload.status === "call-ready", `USER_AWAKE safety explanation should become call-ready, got ${payload.status}`);
    assert(payload.coordination?.userPresence?.state === "awake", `USER_AWAKE safety explanation should clear sleep gate: ${JSON.stringify(payload.coordination)}`);
    assert(payload.coordination?.manualUxGate === "clear", `USER_AWAKE safety explanation gate mismatch: ${JSON.stringify(payload.coordination)}`);
    assert(payload.signals?.userAwakeManualUxCall === true, `USER_AWAKE safety explanation signal missing: ${JSON.stringify(payload.signals)}`);
    assert(!payload.warnings?.includes("user-sleeping"), `USER_AWAKE safety explanation should not keep user-sleeping warning: ${JSON.stringify(payload.warnings)}`);
    assertIncludes(payload.boardSummary, "ManualUxAction=send-manual-ux-call", "USER_AWAKE safety explanation boardSummary");
    assertIncludes(payload.boardSummary, "ManualUxCallCommand=", "USER_AWAKE safety explanation boardSummary");
    assertNotIncludes(payload.boardSummary, "ManualUxGate=wait-user-awake", "USER_AWAKE safety explanation boardSummary");
    assertOperatorAction(payload, "send-manual-ux-call", "USER_AWAKE safety explanation JSON");
    assert(posts.filter((post) => post.path === "/api/call").length === 0, `read-only USER_AWAKE safety explanation should not post a call: ${JSON.stringify(posts)}`);
    assertSecretSafe(JSON.stringify(payload), "USER_AWAKE safety explanation JSON");
  });
  console.log("[OK] Mac manual UX status accepts USER_AWAKE coordination that explains the safety boundary");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  await checkHelp(args);
  await checkReadyJson(args);
  await checkReadyWhileWindowsPushingAddsManualUxGate(args);
  await checkLoopbackTargetIsNotAdvertised(args);
  await checkChinesePunctuationAfterChecklist(args);
  await checkBoardSummary(args);
  await checkSendStatusAndMessage(args);
  await checkPostFailureFailsClosed(args);
  await checkRequireReadyFailure(args);
  await checkUsableEntryCurrentCallIsReady(args);
  await checkUserAwakeCallProducesManualUxCallPlan(args);
  await checkUserAwakeSendCallPostsManualUxCall(args);
  await checkManualUxCallInProgressDoesNotOfferDuplicateCall(args);
  await checkConfirmedManualUxCallIsReady(args);
  await checkEventsArrayConfirmationIsAccepted(args);
  await checkReferencedConfirmationTagDoesNotReadyCall(args);
  await checkDescriptiveManualUxTagMentionDoesNotConfirm(args);
  await checkEventsArrayDescriptiveManualUxTagMentionDoesNotConfirm(args);
  await checkStaleManualUxConfirmationDoesNotReadyNewCall(args);
  await checkLateManualUxConfirmationDoesNotReadyExpiredCall(args);
  await checkExpiredCallRequiresReconfirmEvenWhenPreviouslyConfirmed(args);
  await checkExpiredManualUxCallRequestsReconfirmation(args);
  await checkExpiredManualUxCallWaitsForUserAwake(args);
  await checkSupervisorSleepCorrectionOverridesGateReference(args);
  await checkReconfirmRefusesWhileUserSleeping(args);
  await checkPresenceLabelReferenceDoesNotOverrideUserAwake(args);
  await checkExpiredManualUxCallCanBeReconfirmed(args);
  await checkActiveManualUxCallRefusesReconfirm(args);
  await checkReconfirmRefusesWhileWindowsIsPushing(args);
  await checkReconfirmRefusesWhileWindowsIsCommittingPush(args);
  await checkSendCallRefusesWhileWindowsIsPushing(args);
  await checkSendCallRefusesWhenNotCallReady(args);
  await checkSendCallRefusesOtherActiveCall(args);
  await checkUserAwakeSafetyExplanationClearsSleepGate(args);
  console.log("[OK] Mac manual UX status checks passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.stack || error.message}`);
  process.exitCode = 1;
});
