#!/usr/bin/env node
import http from "node:http";
import https from "node:https";

const defaults = {
  server: "http://192.168.31.68:17888",
  token: process.env.CODEX_LINK_TOKEN || "",
  device: "Mac Manual UX",
  role: "Mac 端",
  from: "Mac Codex",
  timeoutMs: 5000,
  requireReady: false,
  json: false,
  boardSummary: false,
  sendStatus: false,
  sendMessage: false,
  sendCall: false,
  reconfirmCall: false,
};

const manualChecklistLabels = {
  connection: "连接",
  video: "画面",
  audio: "声音",
  clipboard: "剪贴板",
  file: "文件",
  window: "窗口",
  fullscreen: "全屏",
  original: "原画",
  "copy-diagnostics": "复制诊断",
};

const defaultManualChecklist = [
  "connection",
  "video",
  "audio",
  "clipboard",
  "file",
  "window",
  "fullscreen",
  "original",
  "copy-diagnostics",
];

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/mac/check-mac-manual-ux-status.mjs [options]

Options:
  --server <url>       Agent Link Board URL. Default: ${defaults.server}
  --timeoutMs <ms>     Board request timeout. Default: ${defaults.timeoutMs}
  --requireReady       Exit non-zero unless PostPass/ManualUxStandby is visible.
  --boardSummary       Print one secret-free Agent Link Board summary line.
  --json               Print one machine-readable JSON object.
  --sendStatus         Post the summary to Agent Link Board /api/status.
  --sendMessage        Post the summary to Agent Link Board /api/message.
  --sendCall           Send a user-present manual UX call only from call-ready state.
  --reconfirmCall      Replace an expired Mac manual UX call with a fresh one.
  --device <name>      Status device name. Default: ${defaults.device}
  --role <role>        Status role. Default: ${defaults.role}
  --from <name>        Message sender. Default: ${defaults.from}
  --token <token>      Optional Agent Link Board token header.
  --help, -h           Show this help without probing anything.

Description:
  Prints a read-only Mac-side manual UX status report after REAL_TEST_PASS.
  It only posts to Agent Link Board when --sendStatus, --sendMessage, or
  --sendCall/--reconfirmCall is explicitly provided.
  It consumes PostPassNext=WindowsRecordPassAndTailError+MacManualUxStandby,
  MAC_STANDING_BY_FOR_MANUAL_UX_TEST, and ManualUxChecklist=... from Agent Link
  Board state. A Supervisor usable-entry/manual-UX currentCall is also treated
  as ready so Mac status updates do not accidentally send the team back to the
  formal E2E path. A USER_AWAKE/manual-UX currentCall is treated as
  call-ready and prints ManualUxCallCommand=... so the next user-present step
  can be coordinated before asking for any action. An active Mac manual UX call
  is treated as calling so the script does not offer a duplicate call. An expired
  Mac manual UX call can be refreshed only with explicit --reconfirmCall. When
  safe, an expired Mac manual UX call prints ManualUxReconfirmCommand=... so the
  next coordination step is visible without sending it automatically. It does
  not authenticate, does not ask for or print passwords, does not send
  user-auth requests, and does not send input events.

Examples:
  node scripts/mac/check-mac-manual-ux-status.mjs --boardSummary
  node scripts/mac/check-mac-manual-ux-status.mjs --sendStatus --sendMessage --boardSummary
  node scripts/mac/check-mac-manual-ux-status.mjs --sendCall --json
  node scripts/mac/check-mac-manual-ux-status.mjs --reconfirmCall --json
  node scripts/mac/check-mac-manual-ux-status.mjs --requireReady --json
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
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--boardSummary") {
      args.boardSummary = true;
      continue;
    }
    if (token === "--sendStatus") {
      args.sendStatus = true;
      continue;
    }
    if (token === "--sendMessage") {
      args.sendMessage = true;
      continue;
    }
    if (token === "--sendCall") {
      args.sendCall = true;
      continue;
    }
    if (token === "--reconfirmCall") {
      args.reconfirmCall = true;
      continue;
    }
    if (token === "--requireReady") {
      args.requireReady = true;
      continue;
    }
    if (token === "--checkBoard") {
      continue;
    }
    if (token === "--server" && next && !next.startsWith("--")) {
      args.server = next;
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(1000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    if ((token === "--device" || token === "--role" || token === "--from" || token === "--token") && next && !next.startsWith("--")) {
      args[token.slice(2)] = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  args.server = String(args.server || defaults.server).replace(/\/+$/, "");
  args.token = String(args.token || "");
  return args;
}

function normalizeServerUrl(server) {
  const url = new URL(server);
  url.pathname = "/api/state";
  url.search = "";
  url.hash = "";
  return url;
}

function fetchJson(url, timeoutMs) {
  return new Promise((resolveFetch, rejectFetch) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.get(url, { timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          rejectFetch(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolveFetch(JSON.parse(body));
        } catch (error) {
          rejectFetch(new Error(`Invalid JSON from Agent Link Board: ${error.message}`));
        }
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error(`Timed out after ${timeoutMs}ms`));
    });
    request.on("error", rejectFetch);
  });
}

function compactText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(compactText).filter(Boolean).join("; ");
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => !/password|passwd|pwd|token|secret/i.test(key))
      .map(([key, item]) => `${key}=${compactText(item)}`)
      .filter((item) => item !== "=")
      .join("; ");
  }
  return "";
}

function collectBoardTexts(state) {
  const texts = [];
  if (state.currentCall) texts.push(compactText(state.currentCall));
  if (state.statuses && typeof state.statuses === "object") {
    for (const [device, status] of Object.entries(state.statuses)) {
      texts.push(`${device}: ${compactText(status)}`);
    }
  }
  for (const event of boardEvents(state).slice(-20)) {
    texts.push(compactText(event));
  }
  return texts.filter(Boolean);
}

function boardEvents(state) {
  const events = [];
  if (Array.isArray(state?.events)) events.push(...state.events);
  if (Array.isArray(state?.recentEvents)) events.push(...state.recentEvents);
  return events;
}

function parseManualChecklist(texts) {
  for (const text of texts) {
    const match = /\bManualUxChecklist\s*=\s*([^;；\r\n]+)/i.exec(text);
    if (!match) continue;
    const ids = match[1]
      .split(/[,|/\s]+/)
      .map((id) => id.trim().toLowerCase())
      .filter((id) => manualChecklistLabels[id]);
    if (ids.length > 0) return [...new Set(ids)];
  }
  return [...defaultManualChecklist];
}

function boardEndpoint(server) {
  try {
    const url = new URL(server);
    return `${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}`;
  } catch {
    return "";
  }
}

function firstLanMacHostEndpoint(texts, server) {
  const board = boardEndpoint(server);
  const candidates = [];
  for (const text of texts) {
    const matches = text.matchAll(/\b((?:10|172|192|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{2,5})\b/g);
    for (const match of matches) {
      const endpoint = `${match[1]}:${match[2]}`;
      if (endpoint === board || Number(match[2]) === 17888) continue;
      candidates.push({ endpoint, host: match[1], port: Number(match[2]) });
    }
  }
  const preferredMacHost = candidates.find((item) => item.port === 43770 && !item.host.startsWith("127."));
  if (preferredMacHost) return preferredMacHost.endpoint;
  const lan = candidates.find((item) => !item.host.startsWith("127."));
  return lan?.endpoint || "unknown";
}

function isUsableEntryManualUxCall(text) {
  const source = compactText(text);
  if (!source) return false;
  const usableEntry = /强制可用化|第一版入口|可打开.*可连接.*远程\s*Mac/i.test(source);
  const manualUx = /手工体验|ManualUx|Manual UX|ManualUxTest/i.test(source);
  return usableEntry && manualUx;
}

function isUserAwakeManualUxCall(text) {
  const source = compactText(text);
  if (!source) return false;
  const userAwake = /\bUSER_AWAKE\b|用户已醒|可以授权|可授权任务/i.test(source);
  const manualUx = /真实体验|体验验收|手工体验|ManualUx|Manual UX|ManualUxTest|用户操作前先发明确\s*call/i.test(source);
  return userAwake && manualUx;
}

function isMacManualUxValidationCall(text) {
  const source = compactText(text);
  if (!source) return false;
  const fromMac = /\bfrom\s*=\s*Mac Codex\b|Mac Codex/i.test(source);
  const goal = /Mac manual UX validation|user-present real experience test|手工体验|真实体验/i.test(source);
  const expected = /connection.*video.*audio.*clipboard|连接.*画面.*声音.*剪贴板/i.test(source);
  const safety = /will not request credentials|no-password|不请求密码|不发送远端输入命令|no-input/i.test(source);
  return fromMac && goal && expected && safety;
}

function normalizedText(value) {
  return compactText(value).trim();
}

function isActiveBoardCall(call) {
  if (!call || typeof call !== "object") return false;
  const status = normalizedText(call.status).toLowerCase();
  if (!status) return true;
  return !["done", "completed", "complete", "cancelled", "canceled", "resolved", "closed"].includes(status);
}

function normalizeCurrentBoardCall(call) {
  if (!call || typeof call !== "object") {
    return {
      active: false,
      raw: "",
    };
  }
  const currentCall = {
    active: isActiveBoardCall(call),
    raw: compactText(call),
  };
  for (const key of ["status", "goal", "from", "need", "environment", "connection", "command", "expected", "actual", "ask", "blockedBy", "owner", "startedAt", "timeout", "updatedAt"]) {
    const value = normalizedText(call[key]);
    if (value) currentCall[key] = value;
  }
  return currentCall;
}

function isMatchingUserAwakeManualUxBoardCall(call) {
  return Boolean(call?.active && isUserAwakeManualUxCall(call.raw || call));
}

function isActiveMacManualUxValidationBoardCall(call) {
  return Boolean(call?.active && isMacManualUxValidationCall(call.raw || call));
}

function isManualUxConfirmationText(value) {
  const source = normalizedText(value);
  if (!source) return false;
  if (isManualUxConfirmationReferenceText(source)) return false;
  if (/^(?:MAC_MANUAL_UX_CONFIRMED|ManualUxConfirmed)\b(?:\s*[:=\-]|\s|$)/i.test(source)) return true;
  const manualUx = /manual\s*ux|ManualUx|手工体验|真实体验|体验窗口|体验验收/i.test(source);
  const confirmedPrefix = /^(?:(?:Windows\s*\/\s*User|Windows\s+Codex|User|用户)\s*[:：,，;；-]?\s*)?(?:confirmed|confirmation|ready\s+for|can\s+start|start\s+ManualUxTest|已确认|确认|可以开始|可开始|同意|准备开始)\b/i.test(source);
  return manualUx && confirmedPrefix;
}

function manualUxConfirmationTextCandidates(value) {
  if (value == null) return [];
  if (typeof value === "string") return [value];
  if (typeof value !== "object") return [value];
  return [value.text, value.note, value.message, value.body, value.summary, value.status]
    .map((item) => normalizedText(item))
    .filter(Boolean);
}

function isManualUxConfirmationReferenceText(value) {
  const source = compactText(value);
  if (!/\bMAC_MANUAL_UX_CONFIRMED\b|\bManualUxConfirmed\b/i.test(source)) return false;
  return /\b(do not|don't|not\s+(?:treat|accept|send|a\s+real)|planned|planning|prepar(?:e|ing|ed)?|will\s+(?:carry|include|send)|guard|mention(?:ed)?|reference|example)\b/i.test(source)
    || /误判|不要|不能|不应|防误触|守卫|计划|将会|会携带|提到|示例|短标签/i.test(source);
}

function isManualUxConfirmationSender(name) {
  return /windows codex|user|用户|skymoonzyj/i.test(normalizedText(name));
}

function happenedDuringCallWindow(value, call) {
  const callStartedAtMs = Date.parse(call?.startedAt || call?.updatedAt || "");
  if (!Number.isFinite(callStartedAtMs)) return true;
  const happenedAtMs = Date.parse(normalizedText(value));
  if (!Number.isFinite(happenedAtMs) || happenedAtMs < callStartedAtMs) return false;
  const timeoutMs = parseDurationMs(call?.timeout);
  if (!Number.isFinite(timeoutMs)) return true;
  return happenedAtMs <= callStartedAtMs + timeoutMs;
}

function hasManualUxConfirmation(state, call) {
  if (!isActiveMacManualUxValidationBoardCall(call)) return false;
  if (state?.statuses && typeof state.statuses === "object") {
    for (const [device, status] of Object.entries(state.statuses)) {
      if (!isManualUxConfirmationSender(device)) continue;
      if (!happenedDuringCallWindow(status?.updatedAt, call)) continue;
      if (manualUxConfirmationTextCandidates(status).some((text) => isManualUxConfirmationText(text))) return true;
    }
  }
  const events = boardEvents(state);
  if (events.length > 0) {
    for (const event of events) {
      if (!isManualUxConfirmationSender(event?.from)) continue;
      if (!happenedDuringCallWindow(event?.at, call)) continue;
      if (manualUxConfirmationTextCandidates(event).some((text) => isManualUxConfirmationText(text))) return true;
    }
  }
  return false;
}

function statusByDevice(state, deviceName) {
  if (!state?.statuses || typeof state.statuses !== "object") return null;
  const wanted = String(deviceName || "").toLowerCase();
  for (const [device, status] of Object.entries(state.statuses)) {
    if (String(device).toLowerCase() === wanted) return status;
  }
  return null;
}

function isWindowsPushCriticalStatus(status, note) {
  const combined = `${normalizedText(status)} ${normalizedText(note)}`.toLowerCase();
  return /\b(pushing-soon|pushing|rebasing|merging|resolving-conflicts|committing)\b/.test(combined)
    || /\b(preparing|prepare|ready|about)\b[^.;\n]{0,80}\b(push|rebase)\b/.test(combined)
    || /\b(pull|rebase)\b[^.;\n]{0,80}\b(push|pushing)\b/.test(combined)
    || /(?:准备|即将|正在|开始|完成)[^。；;\n]{0,40}(?:提交|推送|变基|合并|解决冲突)/.test(combined)
    || /(?:提交|推送|变基|合并|解决冲突)[^。；;\n]{0,40}(?:准备|即将|正在|开始|完成)/.test(combined);
}

function windowsCodexCoordination(state) {
  const status = statusByDevice(state, "Windows Codex");
  const value = normalizedText(status?.status);
  const note = normalizedText(status?.note);
  const pushInProgress = isWindowsPushCriticalStatus(value, note);
  return {
    status: value || "unknown",
    updatedAt: normalizedText(status?.updatedAt) || "",
    pushInProgress,
  };
}

function parseDurationMs(value) {
  const text = normalizedText(value).toLowerCase();
  if (!text) return null;
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(text);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2] || "ms";
  if (unit === "h") return Math.round(amount * 60 * 60 * 1000);
  if (unit === "m") return Math.round(amount * 60 * 1000);
  if (unit === "s") return Math.round(amount * 1000);
  return Math.round(amount);
}

function manualUxCallTiming(call, now = Date.now()) {
  if (!isActiveMacManualUxValidationBoardCall(call)) return null;
  const startedAtMs = Date.parse(call.startedAt || call.updatedAt || "");
  const timeoutMs = parseDurationMs(call.timeout);
  if (!Number.isFinite(startedAtMs)) {
    return {
      state: "active",
      startedAt: call.startedAt || "",
      timeout: call.timeout || "",
      timeoutMs,
      ageMs: null,
      remainingMs: null,
      nearTimeout: false,
      timedOut: false,
    };
  }
  const ageMs = Math.max(0, now - startedAtMs);
  const remainingMs = Number.isFinite(timeoutMs) ? timeoutMs - ageMs : null;
  const timedOut = Number.isFinite(remainingMs) && remainingMs <= 0;
  const nearTimeout = !timedOut && Number.isFinite(remainingMs) && remainingMs <= 2 * 60 * 1000;
  return {
    state: timedOut ? "timeout" : nearTimeout ? "near-timeout" : "active",
    startedAt: call.startedAt || "",
    timeout: call.timeout || "",
    timeoutMs,
    ageMs,
    remainingMs,
    nearTimeout,
    timedOut,
  };
}

function quoteCliArg(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function makeManualUxCallPayload() {
  return {
    status: "CALLING",
    from: "Mac Codex",
    need: "Windows Codex, User",
    goal: "Mac manual UX validation: user-present real experience test",
    expected: "Verify connection, video, audio, clipboard, file, window, fullscreen, original quality, and copy diagnostics.",
    ask: "Please confirm a 5-10 minute user-present manual UX window. Mac will not request credentials on the board or send remote input commands.",
    owner: "Mac Codex",
    timeout: "10m",
  };
}

function makeManualUxCallCommand(server) {
  const payload = makeManualUxCallPayload();
  return [
    "node",
    "scripts/codex-link-client.mjs",
    "--server",
    server,
    "call",
    "--status",
    payload.status,
    "--from",
    payload.from,
    "--need",
    payload.need,
    "--goal",
    payload.goal,
    "--expected",
    payload.expected,
    "--ask",
    payload.ask,
    "--owner",
    payload.owner,
    "--timeout",
    payload.timeout,
  ].map(quoteCliArg).join(" ");
}

function makeManualUxReconfirmCommand(server) {
  return [
    "node",
    "scripts/mac/check-mac-manual-ux-status.mjs",
    "--server",
    server,
    "--reconfirmCall",
    "--json",
  ].map(quoteCliArg).join(" ");
}

function makeReport(state, server) {
  const texts = collectBoardTexts(state);
  const combined = texts.join("\n");
  const boardCallBeforeCheck = normalizeCurrentBoardCall(state.currentCall);
  const manualUxCall = manualUxCallTiming(boardCallBeforeCheck);
  const signals = {
    realTestPass: /\bREAL_TEST_PASS(?:_RECORDED)?\b/i.test(combined),
    postPassNext: /\bPostPassNext\s*=\s*WindowsRecordPassAndTailError\+MacManualUxStandby\b/i.test(combined),
    manualUxStandby: /\bMAC_STANDING_BY_FOR_MANUAL_UX_TEST\b|\bMacManualUxStandby\b|\bManualUxStandby\b/i.test(combined),
    manualChecklist: /\bManualUxChecklist\s*=/i.test(combined),
    usableEntryManualUxCall: texts.some((text) => isUsableEntryManualUxCall(text)),
    userAwakeManualUxCall: texts.some((text) => isUserAwakeManualUxCall(text)),
    manualUxCallInProgress: isActiveMacManualUxValidationBoardCall(boardCallBeforeCheck),
    manualUxConfirmed: !manualUxCall?.timedOut && hasManualUxConfirmation(state, boardCallBeforeCheck),
  };
  const ready = signals.postPassNext || signals.manualUxStandby || signals.usableEntryManualUxCall || signals.manualUxConfirmed;
  const calling = signals.manualUxCallInProgress;
  const callReady = !ready && !calling && signals.userAwakeManualUxCall;
  const status = ready ? "ready" : calling ? "calling" : callReady ? "call-ready" : "waiting";
  const ids = parseManualChecklist(texts);
  const labels = ids.map((id) => manualChecklistLabels[id]);
  const warnings = [];
  const blockers = [];
  if (!ready && !calling && !callReady) blockers.push("manual-ux-standby-not-detected");
  if (/MacHeartbeat=status=blocked|MacHeartbeatHealth=blocked|reason=mac-codex-stale/i.test(combined)) {
    warnings.push("mac-heartbeat-attention");
  }
  const windowsCoordination = windowsCodexCoordination(state);
  if (windowsCoordination.pushInProgress) warnings.push("windows-codex-pushing");
  if (manualUxCall?.timedOut) warnings.push("manual-ux-call-timeout");
  else if (manualUxCall?.nearTimeout) warnings.push("manual-ux-call-near-timeout");
  const report = {
    ok: ready || calling || callReady,
    status,
    server,
    checkedAt: new Date().toISOString(),
    target: firstLanMacHostEndpoint(texts, server),
    boardCallBeforeCheck,
    signals,
    manualChecklist: {
      summary: ids.join("/"),
      ids,
      labels,
    },
    safety: {
      requestPassword: false,
      sendUserAuthRequest: false,
      sendInputOrInject: false,
      rerunFormalE2E: false,
    },
    commands: {
      manualUxCallCommand: callReady ? makeManualUxCallCommand(server) : null,
      manualUxReconfirmCommand: calling && manualUxCall?.timedOut && !windowsCoordination.pushInProgress
        ? makeManualUxReconfirmCommand(server)
        : null,
    },
    manualUxCall,
    coordination: {
      windowsCodex: windowsCoordination,
      manualUxGate: windowsCoordination.pushInProgress ? "wait-windows-codex-push" : "clear",
    },
    blockers,
    warnings,
    nextActions: makeNextActions(status, manualUxCall, server, windowsCoordination),
  };
  report.boardSummary = makeBoardSummary(report);
  return report;
}

function withCoordinationGate(actions, status, windowsCoordination = null) {
  if (!windowsCoordination?.pushInProgress || status === "waiting") return actions;
  return [
    "Wait for Windows Codex to finish push/rebase coordination before starting manual UX testing or replacing the call.",
    ...actions,
  ];
}

function makeNextActions(status, manualUxCall = null, server = defaults.server, windowsCoordination = null) {
  if (status === "ready") {
    return withCoordinationGate([
      "Keep Mac host, Mac client, and heartbeat online for user-present manual UX testing.",
      "Validate connection, video, audio, clipboard text/file, window, fullscreen, original quality, and copy diagnostics.",
      "Record real manual UX findings instead of returning to formal E2E password flow.",
    ], status, windowsCoordination);
  }
  if (status === "call-ready") {
    return withCoordinationGate([
      "Send the ManualUxCallCommand to Agent Link Board before asking the user or Windows side to act.",
      "State the goal, safety boundary, and estimated 5-10 minute duration in the call.",
      "Do not request credentials or send remote input commands from this status command.",
    ], status, windowsCoordination);
  }
  if (status === "calling") {
    if (manualUxCall?.timedOut) {
      return withCoordinationGate([
        "The current Mac manual UX call timed out before confirmation.",
        `After Windows Codex is not pushing/rebasing, run: node scripts/mac/check-mac-manual-ux-status.mjs --server ${server} --reconfirmCall --json`,
        "Do not request credentials or send remote input commands while reconfirming the manual UX window.",
      ], status, windowsCoordination);
    }
    return withCoordinationGate([
      "Wait for Windows Codex/User to confirm the manual UX validation window.",
      "Do not send another manual UX call while the current one is active.",
      "After confirmation, validate connection, video, audio, clipboard, file, window, fullscreen, original quality, and copy diagnostics.",
    ], status, windowsCoordination);
  }
  return [
    "Wait for PostPassNext=WindowsRecordPassAndTailError+MacManualUxStandby, MAC_STANDING_BY_FOR_MANUAL_UX_TEST, the usable-entry manual UX currentCall, or USER_AWAKE manual UX coordination on Agent Link Board.",
    "Do not send user-auth requests or ask for another password while waiting for manual UX standby.",
  ];
}

function makeBoardSummary(report) {
  const next = report.status === "ready"
    ? "ManualUxTest"
    : report.status === "call-ready"
      ? "SendManualUxCall"
      : report.status === "calling"
        ? report.manualUxCall?.timedOut
          ? "ReconfirmManualUxCall"
          : "WaitForManualUxConfirmation"
        : "WaitForPostPassOrManualUxStandby";
  const parts = [
    `MacManualUx=status=${report.status}`,
    `ManualUxChecklist=${report.manualChecklist.summary}`,
    `ManualUxLabels=${report.manualChecklist.labels.join("/")}`,
    `Signals=${Object.entries(report.signals).filter(([, value]) => value).map(([key]) => key).join(",") || "none"}`,
    `Target=${report.target}`,
    `Next=${next}`,
    "Safety=no-password,no-input-inject",
    "NoFormalE2ERerun=true",
  ];
  if (report.commands?.manualUxCallCommand) parts.push(`ManualUxCallCommand=${report.commands.manualUxCallCommand}`);
  if (report.commands?.manualUxReconfirmCommand) parts.push(`ManualUxReconfirmCommand=${report.commands.manualUxReconfirmCommand}`);
  if (report.manualUxCall?.state) {
    parts.push(`ManualUxCall=${report.manualUxCall.state}`);
    if (Number.isFinite(report.manualUxCall.ageMs)) {
      parts.push(`ManualUxCallAgeMs=${Math.max(0, Math.round(report.manualUxCall.ageMs))}`);
    }
    if (report.manualUxCall.timedOut && Number.isFinite(report.manualUxCall.remainingMs)) {
      parts.push(`ManualUxCallOverdueMs=${Math.max(0, Math.round(-report.manualUxCall.remainingMs))}`);
    } else if (Number.isFinite(report.manualUxCall.remainingMs)) {
      parts.push(`ManualUxCallRemainingMs=${Math.max(0, Math.round(report.manualUxCall.remainingMs))}`);
    }
  }
  if (report.sentCall?.ok) parts.push("ManualUxCallSent=true");
  if (report.sentCall?.ok === false) parts.push("ManualUxCallSent=false");
  if (report.reconfirmedCall?.ok) parts.push("ManualUxCallReconfirmed=true");
  if (report.reconfirmedCall?.ok === false) parts.push("ManualUxCallReconfirmed=false");
  if (report.coordination?.manualUxGate === "wait-windows-codex-push") parts.push("ManualUxGate=wait-windows-codex-push");
  if (report.blockers.length > 0) parts.push(`blockers=${report.blockers.join(",")}`);
  if (report.warnings.length > 0) parts.push(`warnings=${report.warnings.join(",")}`);
  return parts.join(" ");
}

function printHuman(report) {
  const prefix = report.status === "ready" ? "OK" : "WAIT";
  console.log(`[${prefix}] Mac manual UX status: ${report.status}`);
  console.log(`[INFO] Target: ${report.target}`);
  console.log(`[INFO] Checklist: ${report.manualChecklist.labels.join(" / ")} (${report.manualChecklist.summary})`);
  console.log(`[INFO] Signals: ${Object.entries(report.signals).filter(([, value]) => value).map(([key]) => key).join(", ") || "none"}`);
  if (report.blockers.length > 0) console.log(`[INFO] Blockers: ${report.blockers.join(", ")}`);
  if (report.warnings.length > 0) console.log(`[INFO] Warnings: ${report.warnings.join(", ")}`);
  console.log("[INFO] Safety: 不请求密码；不发送用户认证请求；不发送 input；不回旧 formal E2E 复跑。");
  for (const action of report.nextActions) {
    console.log(`[INFO] Next: ${action}`);
  }
  console.log(`[INFO] Board summary: ${report.boardSummary}`);
}

function makeOfflineReport(server, error) {
  const report = {
    ok: false,
    status: "offline",
    server,
    checkedAt: new Date().toISOString(),
    target: "unknown",
    signals: {
      realTestPass: false,
      postPassNext: false,
      manualUxStandby: false,
      manualChecklist: false,
      usableEntryManualUxCall: false,
      userAwakeManualUxCall: false,
    },
    manualChecklist: {
      summary: defaultManualChecklist.join("/"),
      ids: [...defaultManualChecklist],
      labels: defaultManualChecklist.map((id) => manualChecklistLabels[id]),
    },
    commands: {
      manualUxCallCommand: null,
      manualUxReconfirmCommand: null,
    },
    boardCallBeforeCheck: {
      active: false,
      raw: "",
    },
    safety: {
      requestPassword: false,
      sendUserAuthRequest: false,
      sendInputOrInject: false,
      rerunFormalE2E: false,
    },
    blockers: ["agent-link-board-unreachable"],
    warnings: [],
    nextActions: ["Check Agent Link Board connectivity, then rerun this read-only status command."],
    error: String(error?.message || error || "unknown"),
  };
  report.boardSummary = makeBoardSummary(report);
  return report;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || helpRequested(process.argv)) {
    printHelp();
    return;
  }

  let report;
  try {
    const url = normalizeServerUrl(args.server);
    const state = await fetchJson(url, args.timeoutMs);
    report = makeReport(state, args.server);
  } catch (error) {
    report = makeOfflineReport(args.server, error);
  }

  if (args.sendCall && args.reconfirmCall) {
    report.error = {
      message: "Choose only one of --sendCall or --reconfirmCall.",
    };
    report.boardSummary = makeBoardSummary(report);
    process.exitCode = 1;
  } else if (args.sendCall) {
    try {
      report.sentCall = await sendCall(args, report);
      report.boardSummary = makeBoardSummary(report);
    } catch (error) {
      report.sentCall = {
        ok: false,
        attempted: false,
        error: String(error?.message || error || "sendCall failed"),
      };
      report.error = {
        message: report.sentCall.error,
      };
      report.boardSummary = makeBoardSummary(report);
      process.exitCode = 1;
    }
  } else if (args.reconfirmCall) {
    try {
      report.reconfirmedCall = await reconfirmCall(args, report);
      report.boardSummary = makeBoardSummary(report);
    } catch (error) {
      report.reconfirmedCall = {
        ok: false,
        attempted: false,
        error: String(error?.message || error || "reconfirmCall failed"),
      };
      report.error = {
        message: report.reconfirmedCall.error,
      };
      report.boardSummary = makeBoardSummary(report);
      process.exitCode = 1;
    }
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printHuman(report);
  }

  if (args.sendStatus) {
    await sendStatus(args, report);
  }
  if (args.sendMessage) {
    await sendMessage(args, report);
  }

  if (args.requireReady && report.status !== "ready") {
    process.exitCode = 1;
  }
}

async function sendStatus(args, report) {
  await postToBoard(args, "/api/status", {
    device: args.device,
    role: args.role,
    status: `manual-ux-${report.status}`,
    note: report.boardSummary,
  });
}

async function sendMessage(args, report) {
  await postToBoard(args, "/api/message", {
    from: args.from,
    type: "message",
    text: report.boardSummary,
  });
}

async function sendCall(args, report) {
  if (report.status !== "call-ready") {
    throw new Error(`Refusing to send manual UX call from status=${report.status}; expected call-ready.`);
  }
  const currentCall = report.boardCallBeforeCheck || {
    active: false,
    raw: "",
  };
  report.boardCallBeforeSend = currentCall;
  if (currentCall.active && !isMatchingUserAwakeManualUxBoardCall(currentCall)) {
    const owner = currentCall.from || currentCall.need || currentCall.owner || "unknown";
    const goal = currentCall.goal || currentCall.raw || "unknown goal";
    throw new Error(`Refusing to replace existing Agent Link Board call from ${owner}: ${goal}. Wait for it to resolve before sending the manual UX call.`);
  }
  if (report.coordination?.windowsCodex?.pushInProgress) {
    const status = report.coordination.windowsCodex.status || "unknown";
    throw new Error(`Windows Codex is ${status}; refusing to send manual UX call until Windows finishes push/rebase coordination.`);
  }
  const payload = makeManualUxCallPayload();
  const result = await postToBoard(args, "/api/call", payload);
  return {
    ok: true,
    attempted: true,
    payload,
    boardCallBeforeSend: currentCall,
    result: result || { ok: true },
  };
}

async function reconfirmCall(args, report) {
  if (report.status !== "calling" || !report.manualUxCall?.timedOut) {
    throw new Error(`Refusing to reconfirm manual UX call from status=${report.status}; expected expired manual UX call.`);
  }
  const currentCall = report.boardCallBeforeCheck || {
    active: false,
    raw: "",
  };
  report.boardCallBeforeSend = currentCall;
  if (!isActiveMacManualUxValidationBoardCall(currentCall)) {
    const owner = currentCall.from || currentCall.need || currentCall.owner || "unknown";
    const goal = currentCall.goal || currentCall.raw || "unknown goal";
    throw new Error(`Refusing to reconfirm non-Mac manual UX call from ${owner}: ${goal}. Wait for it to resolve before sending another manual UX call.`);
  }
  if (report.coordination?.windowsCodex?.pushInProgress) {
    const status = report.coordination.windowsCodex.status || "unknown";
    throw new Error(`Windows Codex is ${status}; refusing to reconfirm manual UX call until Windows finishes push/rebase coordination.`);
  }
  const payload = makeManualUxCallPayload();
  const result = await postToBoard(args, "/api/call", payload);
  return {
    ok: true,
    attempted: true,
    payload,
    boardCallBeforeSend: currentCall,
    result: result || { ok: true },
  };
}

async function postToBoard(args, pathName, body) {
  const response = await fetch(new URL(pathName, args.server), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(args.token ? { "X-Codex-Link-Token": args.token } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Agent Link post failed: ${response.status} ${text}`);
  if (!text) return { ok: true };
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: true, raw: text };
  }
  if (payload?.ok === false) throw new Error(payload.error || "Agent Link post failed");
  return payload || { ok: true };
}

main().catch((error) => {
  console.error(`[FAIL] ${error.stack || error.message}`);
  process.exitCode = 1;
});
