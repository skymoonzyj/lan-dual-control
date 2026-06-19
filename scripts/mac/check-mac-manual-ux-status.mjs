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
  --help, -h           Show this help without probing anything.

Description:
  Prints a read-only Mac-side manual UX status report after REAL_TEST_PASS.
  It consumes PostPassNext=WindowsRecordPassAndTailError+MacManualUxStandby,
  MAC_STANDING_BY_FOR_MANUAL_UX_TEST, and ManualUxChecklist=... from Agent Link
  Board state. A Supervisor usable-entry/manual-UX currentCall is also treated
  as ready so Mac status updates do not accidentally send the team back to the
  formal E2E path. It does not authenticate, does not ask for or print
  passwords, does not send user-auth requests, and does not send input events.

Examples:
  node scripts/mac/check-mac-manual-ux-status.mjs --boardSummary
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

function makeReport(state, server) {
  const texts = collectBoardTexts(state);
  const combined = texts.join("\n");
  const signals = {
    realTestPass: /\bREAL_TEST_PASS(?:_RECORDED)?\b/i.test(combined),
    postPassNext: /\bPostPassNext\s*=\s*WindowsRecordPassAndTailError\+MacManualUxStandby\b/i.test(combined),
    manualUxStandby: /\bMAC_STANDING_BY_FOR_MANUAL_UX_TEST\b|\bMacManualUxStandby\b|\bManualUxStandby\b/i.test(combined),
    manualChecklist: /\bManualUxChecklist\s*=/i.test(combined),
    usableEntryManualUxCall: texts.some((text) => isUsableEntryManualUxCall(text)),
  };
  const ready = signals.postPassNext || signals.manualUxStandby || signals.usableEntryManualUxCall;
  const ids = parseManualChecklist(texts);
  const labels = ids.map((id) => manualChecklistLabels[id]);
  const warnings = [];
  const blockers = [];
  if (!ready) blockers.push("manual-ux-standby-not-detected");
  if (/MacHeartbeat=status=blocked|MacHeartbeatHealth=blocked|reason=mac-codex-stale/i.test(combined)) {
    warnings.push("mac-heartbeat-attention");
  }
  const report = {
    ok: ready,
    status: ready ? "ready" : "waiting",
    server,
    checkedAt: new Date().toISOString(),
    target: firstLanMacHostEndpoint(texts, server),
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
    blockers,
    warnings,
    nextActions: ready
      ? [
          "Keep Mac host, Mac client, and heartbeat online for user-present manual UX testing.",
          "Validate connection, video, audio, clipboard text/file, window, fullscreen, original quality, and copy diagnostics.",
          "Record real manual UX findings instead of returning to formal E2E password flow.",
        ]
      : [
          "Wait for PostPassNext=WindowsRecordPassAndTailError+MacManualUxStandby, MAC_STANDING_BY_FOR_MANUAL_UX_TEST, or the usable-entry manual UX currentCall on Agent Link Board.",
          "Do not send user-auth requests or ask for another password while waiting for manual UX standby.",
        ],
  };
  report.boardSummary = makeBoardSummary(report);
  return report;
}

function makeBoardSummary(report) {
  const parts = [
    `MacManualUx=status=${report.status}`,
    `ManualUxChecklist=${report.manualChecklist.summary}`,
    `ManualUxLabels=${report.manualChecklist.labels.join("/")}`,
    `Signals=${Object.entries(report.signals).filter(([, value]) => value).map(([key]) => key).join(",") || "none"}`,
    `Target=${report.target}`,
    `Next=${report.status === "ready" ? "ManualUxTest" : "WaitForPostPassOrManualUxStandby"}`,
    "Safety=no-password,no-input-inject",
    "NoFormalE2ERerun=true",
  ];
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
    },
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
