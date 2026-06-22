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
  --text <text>     Text that contains W8NativeVideo= and/or W14NativeVideo= evidence.
  --file <path>     Read text from a local file that contains native video evidence.
  --stdin           Read text from standard input. Use only with an explicit pipe.
  --server <url>    Agent Link Board URL. Default: ${defaults.server}
  --from <name>     Agent Link sender name. Default: ${defaults.from}
  --send            Post W8NativeVideo=/W14NativeVideo= gate summaries to the board.
  --json            Print machine-readable JSON.
  --boardSummary    Print one secret-safe summary line.
  --help, -h        Show this help.

Description:
  Safely posts Windows desktop-control W8 native video evidence after the user
  copies desktop diagnostics. It accepts redacted W8NativeVideo= and
  W14NativeVideo= lines, generates W8NativeGate=/W14NativeGate= next-step
  evidence, can derive W8ArrivalBacklog= from an optional W2W3Retest= line in
  the same pasted diagnostics, and adds a W13LocalQos= recommendation when
  local video backlog evidence is present. It rejects password/token/control
  event markers before posting and never authenticates a host or asks for a
  password.
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
  throw new Error("Missing W8NativeVideo or W14NativeVideo input. Use --text, --file, or --stdin.");
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

function normalizeW14NativeVideoLine(line) {
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
  const w8NativeVideoLine = extractOptionalW8NativeVideoLine(input);
  if (!w8NativeVideoLine) throw new Error("No W8NativeVideo= line found in input.");
  return w8NativeVideoLine;
}

function extractOptionalW8NativeVideoLine(input) {
  const matches = [...String(input).matchAll(/W8NativeVideo=[^\r\n]+/g)]
    .map((match) => normalizeW8NativeVideoLine(match[0]))
    .filter(Boolean);
  const w8NativeVideoLine = matches.at(-1) || "";
  if (!w8NativeVideoLine) return "";
  const unsafeMarker = findUnsafeMarker(w8NativeVideoLine);
  if (unsafeMarker) throw new Error("unsafe W8NativeVideo input rejected before posting");
  if (!/\bpresent=/.test(w8NativeVideoLine) && !/\bstatus=/.test(w8NativeVideoLine)) {
    throw new Error("W8NativeVideo= line is missing present= or status= evidence.");
  }
  return w8NativeVideoLine;
}

function extractOptionalW14NativeVideoLine(input) {
  const matches = [...String(input).matchAll(/W14NativeVideo=[^\r\n]+/g)]
    .map((match) => normalizeW14NativeVideoLine(match[0]))
    .filter(Boolean);
  const w14NativeVideoLine = matches.at(-1) || "";
  if (!w14NativeVideoLine) return "";
  const unsafeMarker = findUnsafeMarker(w14NativeVideoLine);
  if (unsafeMarker) throw new Error("unsafe W14NativeVideo input rejected before posting");
  if (
    !/\bstatus=/.test(w14NativeVideoLine) &&
    !/\bdecoded=/.test(w14NativeVideoLine) &&
    !/\bpresenting=/.test(w14NativeVideoLine)
  ) {
    throw new Error("W14NativeVideo= line is missing status=, decoded=, or presenting= evidence.");
  }
  return w14NativeVideoLine;
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
  const knownPrefix = ["W8NativeVideo=", "W14NativeVideo=", "W8ArrivalBacklog=", "W13LocalQos=", "W14NativeGate="].find((prefix) => text.startsWith(prefix));
  const body = knownPrefix ? text.slice(knownPrefix.length) : text;
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

function w14NativeGateStatus(summary) {
  return String(summary || "").match(/\bW14NativeGate=status=([^\s]+)/)?.[1] || "";
}

function summaryField(summary, key) {
  return parseSummaryFields(summary)[key] || "";
}

function compactSummaryToken(value, maxLength = 80) {
  const text = String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[.。]\s*$/u, "");
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(1, maxLength - 1));
}

function w8DecoderSubmissionStatus(summary) {
  const fields = {};
  for (const match of String(summary || "").matchAll(/\b(pushed|submitted|decoderGap)=([^\s]+)/g)) {
    fields[match[1]] = match[2];
  }
  if (fields.pushed === undefined && fields.submitted === undefined && fields.decoderGap === undefined) return "";
  return `pushed:${fields.pushed ?? "unknown"}/submitted:${fields.submitted ?? "unknown"}/gap:${fields.decoderGap ?? "unknown"}`;
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

function makeW14NativeGateSummary(w14NativeVideoLine) {
  const fields = parseSummaryFields(w14NativeVideoLine);
  const receiver = compactSummaryToken(fields.status || "unknown", 60) || "unknown";
  const transport = compactSummaryToken(fields.transport || "unknown", 60) || "unknown";
  const mediaOwner = compactSummaryToken(fields.mediaOwner || "unknown", 60) || "unknown";
  const videoFrames = numericField(fields, "videoFrames");
  const h264Frames = numericField(fields, "h264Frames");
  const pushed = numericField(fields, "pushed");
  const accepted = numericField(fields, "accepted");
  const dropped = numericField(fields, "dropped");
  const queueMs = numericField(fields, "queueMs");
  const decoded = numericField(fields, "decoded");
  const presentFrames = numericField(fields, "presentFrames");
  const presenting = compactSummaryToken(fields.presenting || "unknown", 20) || "unknown";
  const visibleLayer = compactSummaryToken(fields.visibleLayer || "", 80);
  const lastStatus = compactSummaryToken(fields.lastStatus || "unknown", 80) || "unknown";
  const lastError = compactSummaryToken(fields.lastError || "", 80);
  let status = "presenting-ok";
  let next = "continue-real-mac-long-run";

  if (lastError) {
    status = "native-error-next";
    next = "inspect-w14-native-error";
  } else if (!["streaming", "running", "active"].includes(receiver)) {
    status = "receiver-next";
    next = "inspect-w14-native-receiver";
  } else if (pushed <= 0 && h264Frames <= 0 && videoFrames <= 0) {
    status = "receive-next";
    next = "inspect-w14-native-receive";
  } else if (decoded <= 0) {
    status = "decode-next";
    next = "inspect-w14-native-decode";
  } else if (presenting !== "yes" || presentFrames <= 0) {
    status = "present-next";
    next = "inspect-w14-native-present";
  } else if (!visibleLayer) {
    status = "visible-layer-next";
    next = "inspect-w14-visible-layer";
  }

  return [
    `W14NativeGate=status=${status}`,
    `receiver=${receiver}`,
    `transport=${transport}`,
    `mediaOwner=${mediaOwner}`,
    `videoFrames=${videoFrames}`,
    `h264Frames=${h264Frames}`,
    `pushed=${pushed}`,
    `accepted=${accepted}`,
    `dropped=${dropped}`,
    `queueMs=${queueMs}`,
    `decoded=${decoded}`,
    `presentFrames=${presentFrames}`,
    `presenting=${presenting}`,
    `visibleLayer=${visibleLayer || "missing"}`,
    `lastStatus=${lastStatus}`,
    ...(lastError ? [`lastError=${lastError}`] : []),
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

function makeW13LocalQosSummary(w8NativeVideoLine, w8NativeGateSummary, w8ArrivalBacklogSummary) {
  if (!w8ArrivalBacklogSummary) return "";
  const nativeFields = parseSummaryFields(w8NativeVideoLine);
  const backlogFields = parseSummaryFields(w8ArrivalBacklogSummary);
  const gateStatus = w8NativeGateStatus(w8NativeGateSummary) || "unknown";
  const backlogStatus = summaryStatus("W8ArrivalBacklog", w8ArrivalBacklogSummary) || String(backlogFields.status || "unknown");
  const nativeClass = String(nativeFields.nativeClass || "unknown").trim() || "unknown";
  const nativeNext = String(nativeFields.nativeNext || "unknown").trim() || "unknown";
  const arrivalSource = String(backlogFields.arrivalSource || "unknown").trim() || "unknown";
  const presentGap = numericField(nativeFields, "presentGap");
  const decoderGap = numericField(nativeFields, "decoderGap");
  const queueMs = numericField(backlogFields, "queueMs");
  const staleDrops = numericField(backlogFields, "staleDrops");
  const liveBacklogRequests = numericField(backlogFields, "liveBacklogRequests");
  const localMaxMs = numericField(backlogFields, "localMaxMs");
  const remoteMediaMaxMs = numericField(backlogFields, "remoteMediaMaxMs");
  let status = "observe";
  let next = "continue-long-run-observation";
  let dropPolicy = "observe";
  let keyframeRequest = "no";

  if (backlogStatus === "stable-candidate" || arrivalSource === "stable") {
    status = "stable-candidate";
    next = "continue-long-run-observation";
  } else if (arrivalSource === "remote-media-gap") {
    status = "remote-cadence";
    next = "ask-mac-readonly-media-cadence";
    dropPolicy = "hold-local";
  } else if (["decoder-error", "device-lost-blocked", "stream-change-pending"].includes(nativeClass) || gateStatus === "native-error-next") {
    status = "native-error";
    next = "inspect-native-video-error";
    dropPolicy = "hold-qos";
  } else if (
    ["present-gap", "surface-ready", "decoder-submitted"].includes(nativeClass) ||
    gateStatus === "native-present-next" ||
    gateStatus === "native-present-lag-next"
  ) {
    status = "native-present";
    next = "inspect-native-present";
    dropPolicy = "hold-qos";
  } else if (arrivalSource === "windows-arrival-gap" || arrivalSource === "windows-queue-backlog" || backlogStatus === "blocked") {
    status = "local-backlog";
    next = "local-qos-trim-request-keyframe";
    dropPolicy = "drop-old-keep-keyframe";
    keyframeRequest = "yes";
  }

  return [
    `W13LocalQos=status=${status}`,
    `nativeClass=${nativeClass}`,
    `nativeNext=${nativeNext}`,
    `arrivalSource=${arrivalSource}`,
    `queueMs=${queueMs}`,
    `staleDrops=${staleDrops}`,
    `liveBacklogRequests=${liveBacklogRequests}`,
    `localMaxMs=${localMaxMs}`,
    `remoteMediaMaxMs=${remoteMediaMaxMs}`,
    `presentGap=${presentGap}`,
    `decoderGap=${decoderGap}`,
    "targetQueueMs=120",
    "maxQueueMs=180",
    `dropPolicy=${dropPolicy}`,
    `keyframeRequest=${keyframeRequest}`,
    "fpsAction=hold",
    "bandwidthAction=hold",
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

function makeW8NativeVideoMessage(
  w8NativeVideoLine,
  w8NativeGateSummary,
  w8ArrivalBacklogSummary = "",
  w13LocalQosSummary = "",
  w14NativeVideoLine = "",
  w14NativeGateSummary = "",
) {
  return [
    w8NativeVideoLine,
    w8NativeGateSummary,
    w8ArrivalBacklogSummary,
    w13LocalQosSummary,
    w14NativeVideoLine,
    w14NativeGateSummary,
    "Source=DesktopControl/copied-diagnostics.",
    "Safety=no-password-on-board,no-input-inject.",
  ].filter(Boolean).join("\n");
}

function makeBoardSummary(payload) {
  return [
    `W8DesktopVideoPost=${payload.send ? "sent" : "dry-run"}`,
    `DesktopVideoPost=${payload.send ? "sent" : "dry-run"}`,
    `w8NativeVideo=${payload.w8NativeVideoLine ? "present" : "missing"}`,
    payload.w8NativeGateSummary ? `w8NativeGate=${w8NativeGateStatus(payload.w8NativeGateSummary) || "present"}` : "w8NativeGate=missing",
    payload.w8NativeGateSummary ? `w8Decoder=${w8DecoderSubmissionStatus(payload.w8NativeGateSummary) || "missing"}` : "w8Decoder=missing",
    `w14NativeVideo=${payload.w14NativeVideoLine ? "present" : "missing"}`,
    payload.w14NativeGateSummary ? `w14NativeGate=${w14NativeGateStatus(payload.w14NativeGateSummary) || "present"}` : "w14NativeGate=missing",
    payload.w14NativeGateSummary ? `w14Presenting=${summaryField(payload.w14NativeGateSummary, "presenting") || "unknown"}` : "w14Presenting=missing",
    payload.w14NativeGateSummary ? `w14Decoded=${summaryField(payload.w14NativeGateSummary, "decoded") || "0"}` : "w14Decoded=missing",
    payload.w8ArrivalBacklogSummary ? `w8ArrivalBacklog=${summaryStatus("W8ArrivalBacklog", payload.w8ArrivalBacklogSummary) || "present"}` : "w8ArrivalBacklog=missing",
    payload.w13LocalQosSummary ? `w13LocalQos=${summaryStatus("W13LocalQos", payload.w13LocalQosSummary) || "present"}` : "w13LocalQos=missing",
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
  const w8NativeVideoLine = extractOptionalW8NativeVideoLine(input);
  const w14NativeVideoLine = extractOptionalW14NativeVideoLine(input);
  if (!w8NativeVideoLine && !w14NativeVideoLine) {
    throw new Error("No W8NativeVideo or W14NativeVideo line found in input.");
  }
  const retestLine = extractOptionalRetestLine(input);
  const w8NativeGateSummary = w8NativeVideoLine ? makeW8NativeGateSummary(w8NativeVideoLine) : "";
  const w14NativeGateSummary = w14NativeVideoLine ? makeW14NativeGateSummary(w14NativeVideoLine) : "";
  const w8ArrivalBacklogSummary = makeW8ArrivalBacklogSummary(retestLine, w8NativeGateSummary);
  const w13LocalQosSummary = makeW13LocalQosSummary(w8NativeVideoLine, w8NativeGateSummary, w8ArrivalBacklogSummary);
  const payload = {
    ok: true,
    send: Boolean(args.send),
    sentW8NativeVideo: false,
    sentW14NativeVideo: false,
    retestLine,
    w8NativeVideoLine,
    w14NativeVideoLine,
    w8NativeGateSummary,
    w14NativeGateSummary,
    w8ArrivalBacklogSummary,
    w13LocalQosSummary,
    boardSummary: "",
  };

  if (args.send) {
    await postMessage(
      args,
      makeW8NativeVideoMessage(
        w8NativeVideoLine,
        w8NativeGateSummary,
        w8ArrivalBacklogSummary,
        w13LocalQosSummary,
        w14NativeVideoLine,
        w14NativeGateSummary,
      ),
    );
    payload.sentW8NativeVideo = Boolean(w8NativeVideoLine);
    payload.sentW14NativeVideo = Boolean(w14NativeVideoLine);
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
