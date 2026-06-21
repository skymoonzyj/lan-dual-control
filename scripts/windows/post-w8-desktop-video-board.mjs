#!/usr/bin/env node
import { readFileSync } from "node:fs";

const defaults = {
  server: "http://192.168.31.68:17888",
  from: "Windows Codex",
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/post-w8-desktop-video-board.mjs [options]

Options:
  --text <text>     Text that contains one W8NativeVideo= line and optional W2W3Retest= line.
  --file <path>     Read text from a local file that contains W8NativeVideo=.
  --stdin           Read text from standard input. Use only with an explicit pipe.
  --server <url>    Agent Link Board URL. Default: ${defaults.server}
  --from <name>     Agent Link sender name. Default: ${defaults.from}
  --send            Post W8NativeVideo= and W8NativeGate= to the board.
  --json            Print machine-readable JSON.
  --boardSummary    Print one secret-safe summary line.
  --help, -h        Show this help.

Description:
  Safely posts Windows desktop-control W8 native video evidence after the user
  copies desktop diagnostics. It accepts a redacted W8NativeVideo= line,
  generates W8NativeGate= next-step evidence, and can derive W8ArrivalBacklog=
  from an optional W2W3Retest= line in the same pasted diagnostics. It rejects
  password/token/control event markers before posting and never authenticates a
  host or asks for a password.
`);
}

function parseArgs(argv) {
  const args = { ...defaults, send: false, json: false, boardSummary: false, stdin: false };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--send") {
      args.send = true;
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
    if (token === "--stdin") {
      args.stdin = true;
      continue;
    }
    if (["--text", "--file", "--server", "--from"].includes(token) && next && !next.startsWith("--")) {
      args[token.slice(2)] = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${token}`);
  }
  return args;
}

function readInput(args) {
  if (args.text) return args.text;
  if (args.file) return readFileSync(args.file, "utf8");
  if (args.stdin) {
    if (process.stdin.isTTY) {
      throw new Error("Missing piped stdin input. Pipe text into --stdin, or use --text/--file.");
    }
    return readFileSync(0, "utf8");
  }
  throw new Error("Missing W8NativeVideo input. Use --text, --file, or --stdin.");
}

function findUnsafeMarker(text) {
  const checks = [
    { label: "--password", pattern: /--password\b/i },
    { label: "password=", pattern: /\bpassword\s*=/i },
    { label: "LAN_DUAL_PASSWORD", pattern: /LAN_DUAL_PASSWORD/i },
    { label: "CODEX_LINK_TOKEN", pattern: /CODEX_LINK_TOKEN/i },
    { label: "token=", pattern: /\btoken\s*=/i },
    { label: "secret=", pattern: /\bsecret\s*=/i },
    { label: "input_event", pattern: /input_event/i },
    { label: "Mac host password", pattern: /Mac host password/i },
  ];
  return checks.find((check) => check.pattern.test(text))?.label || "";
}

function normalizeW8NativeVideoLine(line) {
  return String(line || "")
    .replace(/\s*;\s*(?:fps|audio|surface|h264Errors|error)=.*$/i, "")
    .replace(/\s+No password was printed or sent to Agent Link Board; no input\/inject was performed\.?.*$/i, "")
    .replace(/\s+Source=[^\r\n]+$/i, "")
    .replace(/\s+Safety=no-password-on-board,no-input-inject\.?.*$/i, "")
    .replace(/[.。]\s*$/u, "")
    .trim();
}

function normalizeRetestLine(line) {
  return String(line || "")
    .replace(/\s*;\s*W8NativeVideo=.*$/i, "")
    .replace(/\s*;\s*(?:fps|audio|surface|h264Errors|error)=.*$/i, "")
    .replace(/\s+No password was printed or sent to Agent Link Board; no input\/inject was performed\.?.*$/i, "")
    .replace(/\s+Source=[^\r\n]+$/i, "")
    .replace(/\s+Safety=no-password-on-board,no-input-inject\.?.*$/i, "")
    .trim();
}

function extractW8NativeVideoLine(input) {
  const matches = [...String(input).matchAll(/W8NativeVideo=[^\r\n]+/g)]
    .map((match) => normalizeW8NativeVideoLine(match[0]))
    .filter(Boolean);
  const w8NativeVideoLine = matches.at(-1) || "";
  if (!w8NativeVideoLine) throw new Error("No W8NativeVideo= line found in input.");
  const unsafeMarker = findUnsafeMarker(w8NativeVideoLine);
  if (unsafeMarker) throw new Error("unsafe W8NativeVideo input rejected before posting");
  if (!/\bpresent=/.test(w8NativeVideoLine) && !/\bstatus=/.test(w8NativeVideoLine)) {
    throw new Error("W8NativeVideo= line is missing present= or status= evidence.");
  }
  return w8NativeVideoLine;
}

function extractOptionalRetestLine(input) {
  const matches = [...String(input).matchAll(/W2W3Retest=[^\r\n]+/g)]
    .map((match) => normalizeRetestLine(match[0]))
    .filter(Boolean);
  const retestLine = matches.at(-1) || "";
  if (!retestLine) return "";
  const unsafeMarker = findUnsafeMarker(retestLine);
  if (unsafeMarker) throw new Error("unsafe W2W3Retest input rejected before posting");
  return retestLine;
}

function parseSummaryFields(line) {
  const text = String(line || "");
  const body = text.startsWith("W8NativeVideo=") ? text.slice("W8NativeVideo=".length) : text;
  const fields = {};
  for (const token of body.split(/\s+/)) {
    const separator = token.indexOf("=");
    if (separator <= 0) continue;
    const key = token.slice(0, separator);
    const value = token.slice(separator + 1).replace(/[.。]\s*$/u, "");
    if (key) fields[key] = value;
  }
  return fields;
}

function numericField(fields, key) {
  const value = Number.parseInt(String(fields[key] ?? ""), 10);
  return Number.isFinite(value) ? value : 0;
}

function w8NativeGateStatus(summary) {
  return String(summary || "").match(/\bW8NativeGate=status=([^\s]+)/)?.[1] || "";
}

function summaryStatus(prefix, summary) {
  return String(summary || "").match(new RegExp(`\\b${prefix}=status=([^\\s]+)`))?.[1] || "";
}

function makeW8NativeGateSummary(w8NativeVideoLine) {
  const fields = parseSummaryFields(w8NativeVideoLine);
  const mainSurface = String(fields.mainSurface || "unknown").trim() || "unknown";
  const presenting = String(fields.presenting || "unknown").trim() || "unknown";
  const canvasRole = String(fields.canvasRole || "unknown").trim() || "unknown";
  const webDecode = String(fields.webDecode || "unknown").trim() || "unknown";
  const webBypass = numericField(fields, "webBypass");
  const presentFrames = numericField(fields, "presentFrames");
  const decoded = numericField(fields, "decoded");
  const pushed = numericField(fields, "pushed");
  const submitted = numericField(fields, "submitted");
  const hasDecoderSubmissionEvidence =
    fields.pushed !== undefined || fields.submitted !== undefined || fields.decoderGap !== undefined;
  const decoderGap =
    fields.decoderGap !== undefined ? numericField(fields, "decoderGap") :
      pushed > 0 && submitted > 0 ? Math.max(0, pushed - submitted) : 0;
  const explicitPresentGap = fields.presentGap !== undefined ? numericField(fields, "presentGap") : null;
  const presentGap = explicitPresentGap ?? Math.max(0, decoded - presentFrames);
  const presentGapLimit = Math.max(2, Math.ceil(Math.max(decoded, presentFrames) * 0.02));
  const errors = numericField(fields, "errors");
  const nativeMainSurface = mainSurface === "native-hwnd" && presenting === "yes" && presentFrames > 0 && decoded > 0;
  const hasWebBypassEvidence =
    canvasRole === "diagnostic-fallback" &&
    (webBypass > 0 || webDecode === "native-main-surface");
  let status = "arrival-backlog-next";
  let next = "investigate-arrival-backlog";

  if (!fields.mainSurface || !fields.presenting) {
    status = "evidence-incomplete";
    next = "rerun-with-updated-w8-diagnostics";
  } else if (errors > 0) {
    status = "native-error-next";
    next = "investigate-native-errors";
  } else if (mainSurface !== "native-hwnd") {
    status = "native-present-next";
    next = "investigate-native-present";
  } else if (presenting !== "yes" || presentFrames <= 0 || decoded <= 0) {
    status = "native-present-next";
    next = "investigate-native-present";
  } else if (presentGap > presentGapLimit) {
    status = "native-present-lag-next";
    next = "investigate-native-present";
  } else if (nativeMainSurface && !hasWebBypassEvidence) {
    status = "web-bypass-next";
    next = "verify-webcodecs-bypass";
  }

  return [
    `W8NativeGate=status=${status}`,
    `mainSurface=${mainSurface}`,
    `presenting=${presenting}`,
    `canvasRole=${canvasRole}`,
    `webDecode=${webDecode}`,
    `webBypass=${webBypass}`,
    `presentGap=${presentGap}`,
    `presentGapLimit=${presentGapLimit}`,
    `presentFrames=${presentFrames}`,
    `decoded=${decoded}`,
    ...(hasDecoderSubmissionEvidence ? [`pushed=${pushed}`, `submitted=${submitted}`, `decoderGap=${decoderGap}`] : []),
    `errors=${errors}`,
    `next=${next}`,
  ].join(" ");
}

function numericFromText(text, patterns) {
  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    if (!match) continue;
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function classifyW8ArrivalSource({ blocked, localMaxMs, remoteMediaMaxMs, queueMs, staleDrops, liveBacklogRequests, reason }) {
  if (!blocked) return "stable";
  if (remoteMediaMaxMs >= 1000 && remoteMediaMaxMs >= Math.max(1000, Math.round(localMaxMs * 0.8))) {
    return "remote-media-gap";
  }
  if (localMaxMs >= 1000 && (!remoteMediaMaxMs || remoteMediaMaxMs < 1000)) {
    return "windows-arrival-gap";
  }
  if (queueMs >= 180 || staleDrops > 0 || liveBacklogRequests > 0 || /backlog|queue|wait|recovery/i.test(reason)) {
    return "windows-queue-backlog";
  }
  if (localMaxMs >= 1000) return "windows-arrival-gap";
  return "unknown";
}

function makeW8ArrivalBacklogSummary(retestLine, w8NativeGateSummary) {
  if (!retestLine || w8NativeGateStatus(w8NativeGateSummary) !== "arrival-backlog-next") return "";
  const text = String(retestLine || "");
  const fields = parseSummaryFields(text);
  const queueMs = numericField(fields, "queueMs") || numericFromText(text, [/本机队列\s*(\d+)\s*ms/u, /\bqueue\s*(\d+)\s*ms\b/i]);
  const staleDrops =
    numericField(fields, "staleDrops") ||
    numericField(fields, "droppedStale") ||
    numericFromText(text, [/本地过期丢帧\s*(\d+)/u]);
  const liveBacklogRequests =
    numericField(fields, "liveBacklogRequests") ||
    numericField(fields, "liveBacklogReq") ||
    numericFromText(text, [/追实时请求\s*(\d+)/u]);
  const localAvgMs =
    numericField(fields, "localAvgMs") ||
    numericField(fields, "avgGapMs") ||
    numericFromText(text, [/(?:^|[·,，]\s*)平均间隔\s*(\d+)\s*ms/u]);
  const localMaxMs =
    numericField(fields, "localMaxMs") ||
    numericField(fields, "maxGapMs") ||
    numericField(fields, "arrivalMs") ||
    numericFromText(text, [/(?:^|[·,，]\s*)最大间隔\s*(\d+)\s*ms/u]);
  const remoteMediaAvgMs =
    numericField(fields, "remoteMediaAvgMs") ||
    numericField(fields, "remoteAvgMs") ||
    numericFromText(text, [/远端媒体平均间隔\s*(\d+)\s*ms/u]);
  const remoteMediaMaxMs =
    numericField(fields, "remoteMediaMaxMs") ||
    numericField(fields, "remoteMaxMs") ||
    numericFromText(text, [/远端媒体最大间隔\s*(\d+)\s*ms/u]);
  const maxGapMs =
    numericField(fields, "maxGapMs") ||
    numericField(fields, "arrivalMs") ||
    localMaxMs;
  const visibilityRecovery =
    numericField(fields, "visibilityRecovery") ||
    numericField(fields, "visibilityRecoveryCount") ||
    numericFromText(text, [/可见恢复\s*(\d+)/u]);
  const reason =
    String(fields.reason || text.match(/原因\s*([^\s,，·]+)/u)?.[1] || "unknown")
      .trim()
      .replace(/\s+/g, "_");
  const blocked =
    queueMs >= 180 ||
    staleDrops > 0 ||
    liveBacklogRequests > 0 ||
    maxGapMs >= 1000 ||
    /backlog|queue|wait|recovery/i.test(reason);
  const status = blocked ? "blocked" : "stable-candidate";
  const arrivalSource = classifyW8ArrivalSource({
    blocked,
    localMaxMs,
    remoteMediaMaxMs,
    queueMs,
    staleDrops,
    liveBacklogRequests,
    reason,
  });
  const next = blocked && arrivalSource === "remote-media-gap" ? "inspect-remote-media-cadence" : blocked ? "investigate-windows-arrival-backlog" : "continue-long-run-observation";
  return [
    `W8ArrivalBacklog=status=${status}`,
    `queueMs=${queueMs}`,
    `staleDrops=${staleDrops}`,
    `liveBacklogRequests=${liveBacklogRequests}`,
    `maxGapMs=${maxGapMs}`,
    `localAvgMs=${localAvgMs}`,
    `localMaxMs=${localMaxMs}`,
    `remoteMediaAvgMs=${remoteMediaAvgMs}`,
    `remoteMediaMaxMs=${remoteMediaMaxMs}`,
    `arrivalSource=${arrivalSource}`,
    `visibilityRecovery=${visibilityRecovery}`,
    `reason=${reason || "unknown"}`,
    `next=${next}`,
  ].join(" ");
}

async function postMessage(args, text) {
  const url = new URL("/api/message", args.server);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: args.from, text, type: "message" }),
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`Agent Link Board post failed: ${response.status}`);
  if (!responseText) return true;
  let payload = {};
  try {
    payload = JSON.parse(responseText);
  } catch {
    return true;
  }
  if (payload?.ok === false) {
    throw new Error(`Agent Link Board post failed: ${payload.error || "ok=false"}`);
  }
  return true;
}

function makeW8NativeVideoMessage(w8NativeVideoLine, w8NativeGateSummary, w8ArrivalBacklogSummary = "") {
  return [
    w8NativeVideoLine,
    w8NativeGateSummary,
    w8ArrivalBacklogSummary,
    "Source=DesktopControl/copied-diagnostics.",
    "Safety=no-password-on-board,no-input-inject.",
  ].filter(Boolean).join("\n");
}

function makeBoardSummary(payload) {
  return [
    `W8DesktopVideoPost=${payload.send ? "sent" : "dry-run"}`,
    `w8NativeVideo=${payload.w8NativeVideoLine ? "present" : "missing"}`,
    payload.w8NativeGateSummary ? `w8NativeGate=${w8NativeGateStatus(payload.w8NativeGateSummary) || "present"}` : "w8NativeGate=missing",
    payload.w8ArrivalBacklogSummary ? `w8ArrivalBacklog=${summaryStatus("W8ArrivalBacklog", payload.w8ArrivalBacklogSummary) || "present"}` : "w8ArrivalBacklog=missing",
    "Safety=no-password-on-board,no-input-inject.",
  ].join(" ");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || helpRequested(process.argv)) {
    printHelp();
    return;
  }

  const input = readInput(args);
  const w8NativeVideoLine = extractW8NativeVideoLine(input);
  const retestLine = extractOptionalRetestLine(input);
  const w8NativeGateSummary = makeW8NativeGateSummary(w8NativeVideoLine);
  const w8ArrivalBacklogSummary = makeW8ArrivalBacklogSummary(retestLine, w8NativeGateSummary);
  const payload = {
    ok: true,
    send: Boolean(args.send),
    sentW8NativeVideo: false,
    retestLine,
    w8NativeVideoLine,
    w8NativeGateSummary,
    w8ArrivalBacklogSummary,
    boardSummary: "",
  };

  if (args.send) {
    await postMessage(args, makeW8NativeVideoMessage(w8NativeVideoLine, w8NativeGateSummary, w8ArrivalBacklogSummary));
    payload.sentW8NativeVideo = true;
  }

  payload.boardSummary = makeBoardSummary(payload);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (args.boardSummary || args.send) {
    console.log(payload.boardSummary);
  } else {
    console.log("Dry run only. Add --send to post this W8NativeVideo line to Agent Link Board.");
    console.log(payload.boardSummary);
  }
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exitCode = 1;
});
