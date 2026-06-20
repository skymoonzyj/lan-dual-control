#!/usr/bin/env node

const defaults = {
  server: "http://192.168.31.68:17888",
  eventLimit: 80,
};

const safety = "read-only,no-password,no-auth,no-input,no-inject";

const tokenKeys = new Set([
  "status",
  "decoded",
  "skippedDelta",
  "needsKeyframe",
  "queue",
  "queueMs",
  "staleDrops",
  "reason",
  "recovery",
  "pause",
  "recv",
  "key",
  "sps",
  "pps",
  "idr",
  "lastNal",
  "surface",
  "h264Key",
  "keyParam",
  "firstKeyNal",
  "firstNal",
  "lastKeyNal",
  "keyGapFramesMax",
  "keyGapMsMax",
  "keyTailFrames",
  "keyTailMs",
]);

function printHelp() {
  console.log(`Usage:
  node scripts/windows/diagnose-w2-h264-board.mjs [options]

Options:
  --server <url>      Agent Link Board URL. Default: ${defaults.server}
  --eventLimit <n>    Recent events to inspect. Default: ${defaults.eventLimit}
  --json              Print machine-readable JSON.
  --boardSummary      Print one secret-safe board summary line.
  --help, -h          Show this help.

Description:
  Read-only W2 H.264 diagnosis for Windows controlling Mac. It reads
  Agent Link Board /api/state, compares Windows W2W3Retest h264= evidence with
  Mac H.264 NAL summaries, and suggests whether to look at Mac sending,
  Windows receiving, or the Windows WebCodecs/decode path.

Safety:
  This helper is read-only: no password prompts, no host authentication, no
  WebSocket control, no input, and no inject.
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
    if (token === "--server" && next && !next.startsWith("--")) {
      args.server = next;
      index += 1;
      continue;
    }
    if (token === "--eventLimit" && next && !next.startsWith("--")) {
      args.eventLimit = Math.max(1, Number(next) || defaults.eventLimit);
      index += 1;
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
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function numberOrString(value) {
  if (typeof value !== "string") return value;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d+\.\d+$/.test(value)) return Number(value);
  return value;
}

function toNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function cleanTokenValue(value) {
  return String(value ?? "")
    .replace(/[。；;，,]+$/g, "")
    .replace(/[)"'`]+$/g, "")
    .trim();
}

function isPlaceholderTokenValue(value) {
  return /^<[^>]+>$/.test(String(value || ""));
}

function parseTokens(text) {
  const tokens = {};
  const matcher = /(?:^|\s)([A-Za-z][A-Za-z0-9_-]*)=([^\s,;，；]+)/g;
  let match;
  while ((match = matcher.exec(text)) !== null) {
    const key = match[1];
    if (!tokenKeys.has(key)) continue;
    const value = cleanTokenValue(match[2]);
    if (isPlaceholderTokenValue(value)) continue;
    tokens[key] = numberOrString(value);
  }
  return tokens;
}

function hasWindowsH264EvidenceTokens(tokens) {
  return ["status", "decoded", "recv", "key", "sps", "pps", "idr", "needsKeyframe", "lastNal"].some((key) => tokens[key] !== undefined);
}

function statusCodeFor(result) {
  if (result.status === "ready") return 0;
  if (result.status === "blocked") return 2;
  return 1;
}

function safeText(value) {
  return String(value ?? "");
}

function entryTimestamp(entry) {
  const value = Date.parse(entry.at || entry.updatedAt || "");
  return Number.isFinite(value) ? value : 0;
}

function collectEntries(state, eventLimit) {
  const entries = [];
  const statuses = state && typeof state.statuses === "object" ? state.statuses : {};
  for (const [name, status] of Object.entries(statuses)) {
    if (!status || typeof status !== "object") continue;
    entries.push({
      kind: "status",
      actor: name,
      role: status.role,
      at: status.updatedAt,
      text: [status.status, status.note].filter(Boolean).map(safeText).join(" "),
    });
  }

  const events = Array.isArray(state?.events) ? state.events.slice(-eventLimit) : [];
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    entries.push({
      kind: "event",
      actor: event.from || event.device || event.updatedBy || "",
      role: event.role || "",
      at: event.at || event.updatedAt,
      text: [event.status, event.note, event.text, event.goal, event.ask, event.actual]
        .filter(Boolean)
        .map(safeText)
        .join(" "),
    });
  }

  return entries.sort((a, b) => entryTimestamp(a) - entryTimestamp(b));
}

function isWindowsEntry(entry) {
  const actor = `${entry.actor || ""} ${entry.role || ""}`;
  const text = entry.text || "";
  return /Windows/i.test(actor) || /W2W3Retest=|WinClientRetest/i.test(text);
}

function isMacEvidenceEntry(entry) {
  const actor = `${entry.actor || ""} ${entry.role || ""}`;
  const text = entry.text || "";
  if (/Windows/i.test(actor) && !/MacHostMedia|Mac media|observe-mac-media|check-mac-host-readiness/i.test(text)) {
    return false;
  }
  return /Mac/i.test(actor)
    || /MacHostMedia|Mac media|observe-mac-media|check-mac-host-readiness|h264Key=|firstKeyNal=|lastKeyNal=|keyGapFramesMax=|keyTailFrames=/i.test(text);
}

function h264TextSegment(text) {
  const marker = text.indexOf("h264=");
  if (marker < 0) return "";
  const segment = text.slice(marker + "h264=".length);
  const nextTopLevel = segment.search(/\s(?:audio|clipboard|input|MacHostMedia|WindowsHostMedia)=/);
  return nextTopLevel >= 0 ? segment.slice(0, nextTopLevel) : segment;
}

function extractWindowsEvidence(entries) {
  const ordered = [...entries].reverse();
  for (const entry of ordered) {
    if (!isWindowsEntry(entry)) continue;
    const text = entry.text || "";
    const retestIndex = text.lastIndexOf("W2W3Retest=");
    if (retestIndex < 0) continue;
    const retestText = text.slice(retestIndex);
    const h264Segment = h264TextSegment(retestText);
    if (!h264Segment) continue;
    const h264Tokens = parseTokens(h264Segment);
    if (!hasWindowsH264EvidenceTokens(h264Tokens)) continue;
    const tokens = {
      ...parseTokens(retestText),
      ...h264Tokens,
    };
    const evidence = {
      status: tokens.status ? String(tokens.status) : undefined,
      decoded: toNumber(tokens.decoded, 0),
      skippedDelta: toNumber(tokens.skippedDelta, 0),
      needsKeyframe: tokens.needsKeyframe ? String(tokens.needsKeyframe) : undefined,
      queue: toNumber(tokens.queue, 0),
      queueMs: toNumber(tokens.queueMs, 0),
      staleDrops: toNumber(tokens.staleDrops, 0),
      reason: tokens.reason ? String(tokens.reason) : undefined,
      recovery: toNumber(tokens.recovery, 0),
      pause: toNumber(tokens.pause, 0),
      recv: toNumber(tokens.recv, 0),
      key: toNumber(tokens.key, 0),
      sps: toNumber(tokens.sps, 0),
      pps: toNumber(tokens.pps, 0),
      idr: toNumber(tokens.idr, 0),
      lastNal: tokens.lastNal ? String(tokens.lastNal) : undefined,
      surface: tokens.surface ? String(tokens.surface) : undefined,
      updatedAt: entry.at,
    };
    return evidence;
  }
  return null;
}

function extractMacEvidence(entries) {
  const ordered = [...entries].reverse();
  for (const entry of ordered) {
    if (!isMacEvidenceEntry(entry)) continue;
    const text = entry.text || "";
    const tokens = parseTokens(text);
    const hasEvidence = [
      "h264Key",
      "sps",
      "pps",
      "idr",
      "keyParam",
      "firstKeyNal",
      "firstNal",
      "lastNal",
      "lastKeyNal",
      "keyGapFramesMax",
      "keyTailFrames",
    ].some((key) => tokens[key] !== undefined);
    if (!hasEvidence) continue;
    return {
      h264Key: toNumber(tokens.h264Key, 0),
      sps: toNumber(tokens.sps, 0),
      pps: toNumber(tokens.pps, 0),
      idr: toNumber(tokens.idr, 0),
      keyParam: toNumber(tokens.keyParam, 0),
      firstKeyNal: tokens.firstKeyNal ? String(tokens.firstKeyNal) : undefined,
      firstNal: tokens.firstNal ? String(tokens.firstNal) : undefined,
      lastNal: tokens.lastNal ? String(tokens.lastNal) : undefined,
      lastKeyNal: tokens.lastKeyNal ? String(tokens.lastKeyNal) : undefined,
      keyGapFramesMax: tokens.keyGapFramesMax !== undefined ? toNumber(tokens.keyGapFramesMax, 0) : undefined,
      keyGapMsMax: tokens.keyGapMsMax !== undefined ? toNumber(tokens.keyGapMsMax, 0) : undefined,
      keyTailFrames: tokens.keyTailFrames !== undefined ? toNumber(tokens.keyTailFrames, 0) : undefined,
      keyTailMs: tokens.keyTailMs !== undefined ? toNumber(tokens.keyTailMs, 0) : undefined,
      updatedAt: entry.at,
    };
  }
  return null;
}

function hasMacKeyEvidence(mac) {
  if (!mac) return false;
  if (toNumber(mac.h264Key, 0) > 0 || toNumber(mac.keyParam, 0) > 0) return true;
  if (toNumber(mac.sps, 0) > 0 && toNumber(mac.pps, 0) > 0 && toNumber(mac.idr, 0) > 0) return true;
  return /(^|\/)5(\/|$)/.test(mac.firstKeyNal || "") || /(^|\/)5(\/|$)/.test(mac.lastKeyNal || "");
}

function hasDecodedSurface(windows) {
  if (!windows) return false;
  if (toNumber(windows.decoded, 0) > 0) return true;
  const surface = String(windows.surface || "").toLowerCase();
  return Boolean(surface && surface !== "none" && surface !== "false" && surface !== "0");
}

function diagnose(windows, mac) {
  if (!windows) {
    return {
      status: "waiting",
      reason: "waiting-for-w2w3-retest",
      diagnosis: "No Windows W2W3Retest h264= evidence was found on the board yet.",
      next: "RunWinClientRetest",
    };
  }

  if (hasDecodedSurface(windows)) {
    return {
      status: "ready",
      reason: "decoded-surface-seen",
      diagnosis: "Windows has decoded at least one H.264 surface.",
      next: "ManualVisualFpsAudioClipboardCheck",
    };
  }

  if (!hasMacKeyEvidence(mac)) {
    return {
      status: "waiting",
      reason: "waiting-for-mac-nal-evidence",
      diagnosis: "Windows retest exists, but no current Mac H.264 keyframe/NAL summary was found.",
      next: "RunMacHostMedia",
    };
  }

  const recv = toNumber(windows.recv, 0);
  const hasReceivedKeyNal = toNumber(windows.sps, 0) > 0 || toNumber(windows.pps, 0) > 0 || toNumber(windows.idr, 0) > 0 || toNumber(windows.key, 0) > 0;
  const needsKeyframe = String(windows.needsKeyframe || "").toLowerCase() === "yes";

  if (recv > 0 && hasReceivedKeyNal && (toNumber(windows.decoded, 0) === 0 || needsKeyframe)) {
    return {
      status: "blocked",
      reason: "windows-decode-path",
      diagnosis: "Mac reports keyframe/NAL evidence and Windows received SPS/PPS/IDR, but Windows did not decode a surface.",
      next: "InspectWebCodecsConfigureDecodeQueue",
    };
  }

  if (recv > 0 && !hasReceivedKeyNal) {
    return {
      status: "blocked",
      reason: "windows-receive-missing-keyframe",
      diagnosis: "Mac reports keyframe/NAL evidence, but Windows receive evidence has no SPS/PPS/IDR.",
      next: "CompareTransportPayloadWindow",
    };
  }

  if (recv === 0) {
    return {
      status: "blocked",
      reason: "windows-receive-missing-video",
      diagnosis: "Mac reports keyframe/NAL evidence, but Windows W2W3Retest has no received H.264 frames.",
      next: "CheckWebSocketVideoReceive",
    };
  }

  return {
    status: "warning",
    reason: "insufficient-evidence",
    diagnosis: "The board has partial H.264 evidence, but it is not enough to isolate the blocker.",
    next: "RunWinClientRetestAndMacHostMedia",
  };
}

function compactNumber(value) {
  return value === undefined || value === null ? "na" : String(value);
}

function boardSummaryFor(payload) {
  const windows = payload.windows || {};
  const mac = payload.mac || {};
  return [
    `W2H264BoardDiagnosis=status=${payload.status}`,
    `reason=${payload.reason}`,
    `windows=recv:${compactNumber(windows.recv)} key:${compactNumber(windows.key)} sps:${compactNumber(windows.sps)} pps:${compactNumber(windows.pps)} idr:${compactNumber(windows.idr)} decoded:${compactNumber(windows.decoded)} lastNal:${compactNumber(windows.lastNal)}`,
    `mac=firstKeyNal:${compactNumber(mac.firstKeyNal)} lastKeyNal:${compactNumber(mac.lastKeyNal)} lastNal:${compactNumber(mac.lastNal)}`,
    `macKey=h264Key:${compactNumber(mac.h264Key)} sps:${compactNumber(mac.sps)} pps:${compactNumber(mac.pps)} idr:${compactNumber(mac.idr)} keyParam:${compactNumber(mac.keyParam)}`,
    `Next=${payload.next}`,
    `Safety=${safety}`,
  ].join(" ");
}

function textFor(payload) {
  const windows = payload.windows || {};
  const mac = payload.mac || {};
  return [
    `W2 H.264 board diagnosis: ${payload.status} (${payload.reason})`,
    `diagnosis: ${payload.diagnosis}`,
    `next: ${payload.next}`,
    `windows: recv=${compactNumber(windows.recv)} key=${compactNumber(windows.key)} sps=${compactNumber(windows.sps)} pps=${compactNumber(windows.pps)} idr=${compactNumber(windows.idr)} decoded=${compactNumber(windows.decoded)} lastNal=${compactNumber(windows.lastNal)} needsKeyframe=${compactNumber(windows.needsKeyframe)} reason=${compactNumber(windows.reason)}`,
    `mac: h264Key=${compactNumber(mac.h264Key)} sps=${compactNumber(mac.sps)} pps=${compactNumber(mac.pps)} idr=${compactNumber(mac.idr)} firstKeyNal=${compactNumber(mac.firstKeyNal)} lastKeyNal=${compactNumber(mac.lastKeyNal)} lastNal=${compactNumber(mac.lastNal)}`,
    `safety: ${safety}`,
  ].join("\n");
}

async function fetchBoardState(server) {
  const url = new URL("/api/state", server);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Agent Link Board /api/state returned HTTP ${response.status}`);
  }
  return response.json();
}

async function buildPayload(args) {
  const state = await fetchBoardState(args.server);
  const entries = collectEntries(state, args.eventLimit);
  const windows = extractWindowsEvidence(entries);
  const mac = extractMacEvidence(entries);
  const result = diagnose(windows, mac);
  const payload = {
    ...result,
    windows,
    mac,
    board: {
      server: args.server,
      updatedAt: state?.updatedAt,
      inspectedEntries: entries.length,
    },
    safety,
  };
  payload.boardSummary = boardSummaryFor(payload);
  return payload;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  let payload;
  try {
    payload = await buildPayload(args);
  } catch (error) {
    payload = {
      status: "waiting",
      reason: "board-unavailable",
      diagnosis: `Could not read Agent Link Board state: ${error.message}`,
      next: "CheckAgentLinkBoard",
      windows: null,
      mac: null,
      board: {
        server: args.server,
      },
      safety,
    };
    payload.boardSummary = boardSummaryFor(payload);
  }

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (args.boardSummary) {
    console.log(payload.boardSummary);
  } else {
    console.log(textFor(payload));
  }
  process.exitCode = statusCodeFor(payload);
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
