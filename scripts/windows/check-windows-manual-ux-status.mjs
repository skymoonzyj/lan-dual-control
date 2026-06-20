#!/usr/bin/env node
import http from "node:http";
import https from "node:https";

const defaults = {
  server: "http://192.168.31.68:17888",
  timeoutMs: 5000,
  requireReady: false,
  json: false,
  boardSummary: false,
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
const macClientManualChecklistAction = "Mac client 会话诊断查看“手工清单”：连接/视频/音频/剪贴板/文件/窗口/全屏/原画/input_ack/复制诊断；复制诊断会带出同一行，粘贴前确认不包含连接密码";
const macClientManualChecklistOfflineAction = `页面在线后在 ${macClientManualChecklistAction}`;
const macClientManualChecklistAllowedActions = new Set([
  macClientManualChecklistAction,
  macClientManualChecklistOfflineAction,
]);
const allowedMacManualUxStatus = new Set(["ready", "waiting", "call-ready", "calling"]);
const allowedMacManualUxNext = new Set(["ManualUxTest", "WaitForPostPassOrManualUxStandby", "SendManualUxCall", "WaitForManualUxConfirmation", "ReconfirmManualUxCall"]);
const allowedMacManualUxCall = new Set(["active", "near-timeout", "timeout"]);
const allowedMacManualUxTargetSource = new Set(["unknown", "mac-host-discovery", "board-discovery", "board", "manual", "agent-link-board", "current-call"]);

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/check-windows-manual-ux-status.mjs [options]

Options:
  --server <url>       Agent Link Board URL. Default: ${defaults.server}
  --timeoutMs <ms>     Board request timeout. Default: ${defaults.timeoutMs}
  --requireReady       Exit non-zero unless PostPass/ManualUxStandby is visible.
  --boardSummary       Print one secret-free line for Agent Link Board.
  --json               Print one machine-readable JSON object.
  --help, -h           Show this help without probing anything.

Description:
  Prints a read-only Windows-side manual UX status report after REAL_TEST_PASS.
  It consumes PostPassNext=WindowsRecordPassAndTailError+MacManualUxStandby,
  MAC_STANDING_BY_FOR_MANUAL_UX_TEST, ManualUxChecklist=..., MacManualUx=...,
  and MacClientManualChecklist=... from Agent Link Board state. A timed-out
  MacManualUx call becomes status=reconfirm, so Windows does not accidentally
  treat an old manual UX window as ready. It does not authenticate, does not ask for or print
  passwords, does not send user-auth requests, and does not send input or
  inject events.

Examples:
  node scripts/windows/check-windows-manual-ux-status.mjs --boardSummary
  node scripts/windows/check-windows-manual-ux-status.mjs --requireReady --json
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
    throw new Error(`Unknown argument: ${token}`);
  }
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
function normalizedText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function hasSecretLikeValue(value) {
  const text = String(value || "").replace(/\bno-password\b/gi, "");
  return /(?:--?password\b|\bpassword\s*=|\bpasswd\b|\bpwd\b|\btoken\b|\bsecret\b)/i.test(text);
}

function hasInputOrInjectValue(value) {
  return /\b(?:input_event|input_events|inject)\b/i.test(String(value || "")) || /自动发送/.test(String(value || ""));
}

function collectBoardTexts(state) {
  const texts = [];
  if (state.currentCall) texts.push(compactText(state.currentCall));
  if (state.statuses && typeof state.statuses === "object") {
    for (const [device, status] of Object.entries(state.statuses)) {
      texts.push(`${device}: ${compactText(status)}`);
    }
  }
  if (Array.isArray(state.recentEvents)) {
    for (const event of state.recentEvents.slice(-20)) {
      texts.push(compactText(event));
    }
  }
  return texts.filter(Boolean);
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

function firstPrivateEndpoint(texts, server) {
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
const macClientManualChecklistBoundaryPattern = /;\s*|\s+(?:CopyDiagnostics|MacClientFormalChecklist|MacClientFormalSmoke|MacClientDiscoverWindows|MacManualUx|MacManualUxStatus|MacHeartbeatOnce|MacHeartbeatWatch|MacHeartbeatStart|MacHeartbeatStatus|MacHeartbeatStop|MacHostSafeStart|MacMaxFpsSafeStart|MacFormalLocalSmoke|MacHostReadiness|MacHeartbeat|MacUnattended|MacUnattendedFormal|Evidence|Next|updatedAt|status|role)\s*(?:=|:|\b)|\s+No password was requested\b/i;

function cleanMacClientManualChecklistAction(fragment) {
  let value = normalizedText(fragment);
  const boundary = value.search(macClientManualChecklistBoundaryPattern);
  if (boundary >= 0) value = value.slice(0, boundary);
  return normalizedText(value).replace(/[.。]+$/g, "");
}

function emptyMacClientManualChecklist(rejectedCount = 0) {
  return { found: false, action: "", summary: "", rejectedCount };
}

function extractMacClientManualChecklist(texts) {
  let selected = null;
  let rejectedCount = 0;
  for (const text of texts) {
    const value = String(text || "");
    const regex = /\bMacClientManualChecklist\s*=\s*/gi;
    let match;
    while ((match = regex.exec(value)) !== null) {
      const action = cleanMacClientManualChecklistAction(value.slice(match.index + match[0].length));
      if (!action || hasSecretLikeValue(action) || hasInputOrInjectValue(action) || !macClientManualChecklistAllowedActions.has(action)) {
        rejectedCount += 1;
        continue;
      }
      selected = { found: true, action, summary: action, rejectedCount };
    }
  }
  if (!selected) return emptyMacClientManualChecklist(rejectedCount);
  return { ...selected, rejectedCount };
}

function extractMacManualUxField(value, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${escaped}\\s*=\\s*([^\\s;；]+)`, "i").exec(value);
  return match ? normalizedText(match[1]).replace(/[.。]+$/g, "") : "";
}

function extractMacManualUxCommandField(value, label) {
  const match = new RegExp(`\\b${label}\\s*=\\s*`, "i").exec(value);
  if (!match) return "";
  let fragment = value.slice(match.index + match[0].length);
  const boundary = fragment.search(/\s+(?:ManualUxCall|ManualUxCallAgeMs|ManualUxCallRemainingMs|ManualUxCallOverdueMs|MacManualUxGate|ManualUxGate|gate|blockers|warnings|MacClientManualChecklist|MacHeartbeat|MacUnattended)\s*(?:=|:|\b)|[;；]\s*(?:MacClientManualChecklist|MacHeartbeat|MacUnattended)\s*=/i);
  if (boundary >= 0) fragment = fragment.slice(0, boundary);
  return normalizedText(fragment).replace(/[.。]+$/g, "");
}

function isSafeMacManualUxReconfirmCommand(commandText) {
  if (!commandText || hasSecretLikeValue(commandText) || hasInputOrInjectValue(commandText)) return false;
  const tokens = normalizedText(commandText).split(/\s+/).filter(Boolean);
  if (tokens.length < 5) return false;
  if (tokens[0] !== "node" || tokens[1] !== "scripts/mac/check-mac-manual-ux-status.mjs") return false;
  let hasServer = false;
  let hasReconfirm = false;
  let hasJson = false;
  for (let index = 2; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--server") {
      const server = tokens[index + 1] || "";
      if (!/^https?:\/\//i.test(server) || hasSecretLikeValue(server)) return false;
      hasServer = true;
      index += 1;
      continue;
    }
    if (token === "--reconfirmCall") {
      hasReconfirm = true;
      continue;
    }
    if (token === "--json") {
      hasJson = true;
      continue;
    }
    return false;
  }
  return hasServer && hasReconfirm && hasJson;
}

function emptyMacManualUx(rejectedCount = 0) {
  return { found: false, rejectedCount };
}

function parseMacManualUxSegment(fragment) {
  const value = normalizedText(fragment);
  if (!value || hasSecretLikeValue(value) || hasInputOrInjectValue(value.replace(/no-input-inject/g, ""))) return null;
  const status = extractMacManualUxField(value, "status");
  const checklist = extractMacManualUxField(value, "ManualUxChecklist") || extractMacManualUxField(value, "checklist");
  const labels = extractMacManualUxField(value, "ManualUxLabels") || extractMacManualUxField(value, "labels");
  const signals = extractMacManualUxField(value, "Signals") || extractMacManualUxField(value, "signals");
  const target = extractMacManualUxField(value, "Target") || extractMacManualUxField(value, "target");
  const targetSource = extractMacManualUxField(value, "TargetSource") || extractMacManualUxField(value, "targetSource") || "unknown";
  const next = extractMacManualUxField(value, "Next") || extractMacManualUxField(value, "next");
  const safety = extractMacManualUxField(value, "Safety") || extractMacManualUxField(value, "safety");
  const noFormalE2ERerun = extractMacManualUxField(value, "NoFormalE2ERerun") || extractMacManualUxField(value, "noFormalE2ERerun");
  const manualUxCall = extractMacManualUxField(value, "ManualUxCall") || extractMacManualUxField(value, "manualUxCall");
  const warnings = extractMacManualUxField(value, "warnings");
  const blockers = extractMacManualUxField(value, "blockers");
  const manualUxReconfirmCommand = extractMacManualUxCommandField(value, "ManualUxReconfirmCommand");
  if (!allowedMacManualUxStatus.has(status) || (next && !allowedMacManualUxNext.has(next))) return null;
  if (!allowedMacManualUxTargetSource.has(targetSource)) return null;
  if (safety && safety !== "no-password,no-input-inject") return null;
  if (noFormalE2ERerun && noFormalE2ERerun !== "true") return null;
  if (manualUxCall && !allowedMacManualUxCall.has(manualUxCall)) return null;
  if (manualUxReconfirmCommand && !isSafeMacManualUxReconfirmCommand(manualUxReconfirmCommand)) return null;
  const summaryParts = [`status=${status}`];
  if (checklist) summaryParts.push(`checklist=${checklist}`);
  if (signals) summaryParts.push(`signals=${signals}`);
  if (target) summaryParts.push(`target=${target}`);
  if (targetSource !== "unknown") summaryParts.push(`targetSource=${targetSource}`);
  if (next) summaryParts.push(`next=${next}`);
  if (safety) summaryParts.push(`safety=${safety}`);
  if (manualUxCall) summaryParts.push(`manualUxCall=${manualUxCall}`);
  if (manualUxReconfirmCommand) summaryParts.push("reconfirmCommand=present");
  if (blockers) summaryParts.push(`blockers=${blockers}`);
  if (warnings) summaryParts.push(`warnings=${warnings}`);
  return {
    found: true,
    status,
    checklist,
    labels,
    signals,
    target,
    targetSource,
    next,
    safety,
    noFormalE2ERerun,
    manualUxCall,
    warnings: warnings ? warnings.split(/[,/]+/).filter(Boolean) : [],
    blockers: blockers ? blockers.split(/[,/]+/).filter(Boolean) : [],
    manualUxReconfirmCommand,
    summary: summaryParts.join(" "),
  };
}

function extractMacManualUx(texts) {
  let selected = null;
  let rejectedCount = 0;
  for (const text of texts) {
    const value = String(text || "");
    const regex = /\bMacManualUx\s*=\s*/gi;
    let match;
    while ((match = regex.exec(value)) !== null) {
      let fragment = value.slice(match.index + match[0].length);
      const boundary = fragment.search(/\s+(?:MacClientManualChecklist|MacRemoteAudioPlan|MacInputSafetyPlan|MacManualUxStatus|MacHeartbeatOnce|MacHeartbeatWatch|MacHeartbeatStart|MacHeartbeatStatus|MacHeartbeatStop|MacHostSafeStart|MacMaxFpsSafeStart|MacHostReadiness|MacHeartbeat|MacUnattended)\s*(?:=|:|\b)|[;；]\s*(?:MacClientManualChecklist|MacHeartbeat|MacUnattended)\s*=/i);
      if (boundary >= 0) fragment = fragment.slice(0, boundary);
      const parsed = parseMacManualUxSegment(fragment);
      if (!parsed) {
        rejectedCount += 1;
        continue;
      }
      selected = parsed;
    }
  }
  if (!selected) return emptyMacManualUx(rejectedCount);
  return { ...selected, rejectedCount };
}

function makeReport(state, server) {
  const texts = collectBoardTexts(state);
  const combined = texts.join("\n");
  const macManualUx = extractMacManualUx(texts);
  const macClientManualChecklist = extractMacClientManualChecklist(texts);
  const signals = {
    realTestPass: /\bREAL_TEST_PASS(?:_RECORDED)?\b/i.test(combined),
    postPassNext: /\bPostPassNext\s*=\s*WindowsRecordPassAndTailError\+MacManualUxStandby\b/i.test(combined),
    manualUxStandby: /\bMAC_STANDING_BY_FOR_MANUAL_UX_TEST\b|\bMacManualUxStandby\b|\bManualUxStandby\b/i.test(combined),
    manualChecklist: /\bManualUxChecklist\s*=/i.test(combined),
    usableEntryManualUxCall: texts.some((text) => isUsableEntryManualUxCall(text)),
    macManualUx: macManualUx.found,
    macClientManualChecklist: macClientManualChecklist.found,
  };
  const baseReady = signals.postPassNext || signals.manualUxStandby || signals.usableEntryManualUxCall || (macManualUx.found && macManualUx.status === "ready" && macManualUx.next === "ManualUxTest");
  const needsReconfirm = macManualUx.found && (macManualUx.manualUxCall === "timeout" || macManualUx.next === "ReconfirmManualUxCall" || macManualUx.warnings?.includes("manual-ux-call-timeout"));
  const needsConfirmation = macManualUx.found && !needsReconfirm && macManualUx.status === "calling" && macManualUx.next === "WaitForManualUxConfirmation";
  const status = needsReconfirm ? "reconfirm" : needsConfirmation ? "confirming" : baseReady ? "ready" : "waiting";
  const ready = status === "ready";
  const ids = parseManualChecklist(texts);
  const labels = ids.map((id) => manualChecklistLabels[id]);
  const warnings = [];
  const blockers = [];
  if (needsReconfirm) blockers.push("manual-ux-call-timeout");
  if (needsConfirmation) blockers.push("manual-ux-confirmation-required");
  if (!baseReady && !needsReconfirm && !needsConfirmation) blockers.push("manual-ux-standby-not-detected");
  if (/MacHeartbeat=status=blocked|MacHeartbeatHealth=blocked|reason=mac-codex-stale/i.test(combined)) {
    warnings.push("mac-heartbeat-attention");
  }
  const report = {
    ok: ready,
    status,
    server,
    checkedAt: new Date().toISOString(),
    target: macManualUx.target && macManualUx.target !== "unknown" ? macManualUx.target : firstPrivateEndpoint(texts, server),
    targetSource: macManualUx.targetSource || "unknown",
    signals,
    macManualUx,
    macClientManualChecklist,
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
    blockers,
    warnings,
    nextActions: ready
      ? [
          "Open Windows control page and keep Mac host in log mode unless user explicitly approves inject.",
          "Check connection, video, audio, clipboard text/file, window, fullscreen, original quality, and copy diagnostics.",
          "Record real manual UX findings instead of returning to formal E2E password flow.",
        ]
      : needsReconfirm
        ? [
            "Ask Mac to reconfirm the timed-out manual UX call before starting a new user-present test window.",
            "Do not send MAC_MANUAL_UX_CONFIRMED for an old timed-out call.",
          ]
        : needsConfirmation
          ? [
              "Confirm the active Mac manual UX call only when Windows/User is ready for a 5-10 minute test window.",
              "Do not start real input/inject; keep this as a no-password manual UX confirmation step.",
            ]
          : [
              "Wait for PostPassNext=WindowsRecordPassAndTailError+MacManualUxStandby, MAC_STANDING_BY_FOR_MANUAL_UX_TEST, or the usable-entry manual UX currentCall on Agent Link Board.",
              "Do not send NEED_USER_AUTH or ask for another password while waiting for manual UX standby.",
            ],
  };
  report.boardSummary = makeBoardSummary(report);
  return report;
}

function makeBoardSummary(report) {
  const nextByStatus = {
    ready: "ManualUxTest",
    confirming: "ConfirmManualUxWindow",
    reconfirm: "AskMacReconfirmManualUxCall",
    waiting: "WaitForPostPassOrManualUxStandby",
    offline: "CheckAgentLinkBoard",
  };
  const parts = [
    `WindowsManualUx=status=${report.status}`,
    `ManualUxChecklist=${report.manualChecklist.summary}`,
    `ManualUxLabels=${report.manualChecklist.labels.join("/")}`,
    `Signals=${Object.entries(report.signals).filter(([, value]) => value).map(([key]) => key).join(",") || "none"}`,
    `Target=${report.target}`,
    `TargetSource=${report.targetSource || "unknown"}`,
    `Next=${nextByStatus[report.status] || "WaitForPostPassOrManualUxStandby"}`,
    "Safety=no-password,no-input-inject",
    "NoFormalE2ERerun=true",
  ];
  if (report.macManualUx?.found) parts.push(`MacManualUx=${report.macManualUx.summary}`);
  if (report.macManualUx?.manualUxReconfirmCommand) parts.push(`MacManualUxReconfirm=${report.macManualUx.manualUxReconfirmCommand}`);
  if (report.macClientManualChecklist?.found) parts.push(`MacClientManualChecklist=${report.macClientManualChecklist.action}`);
  if (report.blockers.length > 0) parts.push(`blockers=${report.blockers.join(",")}`);
  if (report.warnings.length > 0) parts.push(`warnings=${report.warnings.join(",")}`);
  return parts.join(" ");
}

function printHuman(report) {
  const prefix = report.status === "ready" ? "OK" : "WAIT";
  console.log(`[${prefix}] Windows manual UX status: ${report.status}`);
  console.log(`[INFO] Target: ${report.target} (${report.targetSource || "unknown"})`);
  console.log(`[INFO] Checklist: ${report.manualChecklist.labels.join(" / ")} (${report.manualChecklist.summary})`);
  console.log(`[INFO] Signals: ${Object.entries(report.signals).filter(([, value]) => value).map(([key]) => key).join(", ") || "none"}`);
  if (report.macManualUx?.found) console.log(`[INFO] MacManualUx: ${report.macManualUx.summary}`);
  if (report.macManualUx?.manualUxReconfirmCommand) console.log(`[INFO] MacManualUxReconfirm=${report.macManualUx.manualUxReconfirmCommand}`);
  if (report.macClientManualChecklist?.found) console.log(`[INFO] MacClientManualChecklist=${report.macClientManualChecklist.action}`);
  if (report.blockers.length > 0) console.log(`[INFO] Blockers: ${report.blockers.join(", ")}`);
  if (report.warnings.length > 0) console.log(`[INFO] Warnings: ${report.warnings.join(", ")}`);
  console.log("[INFO] Safety: 不请求密码；不发送用户认证请求；不发送 input/inject；不回旧 formal E2E 复跑。");
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
    targetSource: "unknown",
    signals: {
      realTestPass: false,
      postPassNext: false,
      manualUxStandby: false,
      manualChecklist: false,
      usableEntryManualUxCall: false,
      macManualUx: false,
      macClientManualChecklist: false,
    },
    macManualUx: emptyMacManualUx(),
    macClientManualChecklist: emptyMacClientManualChecklist(),
    manualChecklist: {
      summary: defaultManualChecklist.join("/"),
      ids: [...defaultManualChecklist],
      labels: defaultManualChecklist.map((id) => manualChecklistLabels[id]),
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

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printHuman(report);
  }

  if (args.requireReady && report.status !== "ready") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error.stack || error.message}`);
  process.exitCode = 1;
});
