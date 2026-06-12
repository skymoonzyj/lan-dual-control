import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const defaults = {
  host: "127.0.0.1",
  port: "43770",
  password: "demo-password",
  timeoutMs: 8000,
  width: 1920,
  height: 1080,
  fps: 60,
  bandwidthKbps: 50000,
  clipboardText: false,
  clipboardHostToClient: false,
  clipboardFile: false,
  clipboardFileHostToClient: false,
  clipboardFileBytes: 96,
  inputEvents: false,
  requireRealVideo: false,
  requireH264: false,
  requireAudio: false,
  preferredVideoCodec: "mjpeg",
  expectInputMode: "",
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage:
  node scripts/windows/probe-mac-host.mjs [options]

Probes a running Mac host via /discovery and WebSocket. By default it performs
hello/auth/session negotiation and waits for the first video frame.

Options:
  --host <host>                       Mac host address. Default: ${defaults.host}
  --port <port>                       Mac host port. Default: ${defaults.port}
  --password <password>               Probe password. Default: ${defaults.password}
  --timeoutMs <ms>                    Per-step timeout. Default: ${defaults.timeoutMs}
  --width <px>                        Requested video width. Default: ${defaults.width}
  --height <px>                       Requested video height. Default: ${defaults.height}
  --fps <fps>                         Requested FPS. Default: ${defaults.fps}
  --bandwidthKbps <kbps>              Requested max bandwidth. Default: ${defaults.bandwidthKbps}
  --preferredVideoCodec <codec>       Requested codec: mjpeg or h264. Default: ${defaults.preferredVideoCodec}
  --requireRealVideo                  Reject mock/svg video frames.
  --requireH264                       Require H.264 Annex B video; implies preferred codec h264.
  --requireAudio                      Require one pcm-f32le audio_frame.
  --expectInputMode <mode>            Require input mode from discovery/hello/session.
  --inputEvents                       Send safe input events; requires host input mode expectations separately.
  --clipboardText                     Send a text clipboard message to the host.
  --clipboardHostToClient             Read Mac pasteboard changes sent by the host. macOS only.
  --clipboardFile                     Send a small file clipboard transfer to the host.
  --clipboardFileHostToClient         Read Mac file pasteboard changes sent by the host. macOS only.
  --clipboardRoundTrip                Enable both text clipboard directions.
  --clipboardFileRoundTrip            Enable both file clipboard directions.
  --clipboardFileBytes <bytes>        Size of synthetic clipboard file. Default: ${defaults.clipboardFileBytes}

Examples:
  node scripts/windows/probe-mac-host.mjs --host 127.0.0.1 --port 43770 --requireH264 --expectInputMode log
  node scripts/windows/probe-mac-host.mjs --host 192.168.1.20 --port 43770 --requireAudio
  node scripts/windows/probe-mac-host.mjs --clipboardRoundTrip --expectInputMode log
`);
}

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  args.port = String(args.port);
  args.timeoutMs = Number(args.timeoutMs) || defaults.timeoutMs;
  args.width = Number(args.width) || defaults.width;
  args.height = Number(args.height) || defaults.height;
  args.fps = Number(args.fps) || defaults.fps;
  args.bandwidthKbps = Number(args.bandwidthKbps) || defaults.bandwidthKbps;
  const clipboardRoundTrip = booleanArg(args.clipboardRoundTrip);
  const clipboardFileRoundTrip = booleanArg(args.clipboardFileRoundTrip);
  args.clipboardText = booleanArg(args.clipboardText) || booleanArg(args.clipboard) || clipboardRoundTrip;
  args.clipboardHostToClient = booleanArg(args.clipboardHostToClient) || clipboardRoundTrip;
  args.clipboardFile = booleanArg(args.clipboardFile) || booleanArg(args.clipboard) || clipboardFileRoundTrip;
  args.clipboardFileHostToClient = booleanArg(args.clipboardFileHostToClient) || clipboardFileRoundTrip;
  args.clipboardFileBytes = Number(args.clipboardFileBytes) || defaults.clipboardFileBytes;
  args.inputEvents = booleanArg(args.inputEvents) || booleanArg(args.input);
  args.requireRealVideo = booleanArg(args.requireRealVideo) || booleanArg(args.realVideo);
  args.requireH264 = booleanArg(args.requireH264) || booleanArg(args.h264);
  args.requireAudio = booleanArg(args.requireAudio) || booleanArg(args.audio);
  args.preferredVideoCodec = String(args.preferredVideoCodec || defaults.preferredVideoCodec).trim().toLowerCase();
  if (args.requireH264) {
    args.preferredVideoCodec = "h264";
  }
  args.expectInputMode = String(args.expectInputMode || "").trim().toLowerCase();
  return args;
}

function booleanArg(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function print(status, text) {
  console.log(`[${status}] ${text}`);
}

function fail(text) {
  print("ERROR", text);
  process.exitCode = 1;
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs} ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function makeEnvelope(message) {
  return {
    id: `${message.type}-${randomUUID()}`,
    timestamp: new Date().toISOString(),
    ...message,
  };
}

function makeProbeId(prefix) {
  return `${prefix}-${Date.now().toString(16)}-${randomUUID().slice(0, 8)}`;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runCommand(command, { input = "", args = [] } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat(stdout).toString("utf8");
      const errorOutput = Buffer.concat(stderr).toString("utf8");
      if (code === 0) {
        resolve(output);
        return;
      }
      reject(new Error(`${command} exited ${code}: ${errorOutput.trim()}`));
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

async function readLocalMacClipboardText() {
  if (process.platform !== "darwin") {
    throw new Error("clipboard host_to_client probe must run on macOS so it can update the Mac pasteboard");
  }
  return runCommand("pbpaste");
}

async function writeLocalMacClipboardText(text) {
  if (process.platform !== "darwin") {
    throw new Error("clipboard host_to_client probe must run on macOS so it can update the Mac pasteboard");
  }
  await runCommand("pbcopy", { input: text });
}

function escapeAppleScriptString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function writeLocalMacClipboardFile(filePath) {
  if (process.platform !== "darwin") {
    throw new Error("clipboard file host_to_client probe must run on macOS so it can update the Mac pasteboard");
  }
  await runCommand("osascript", {
    input: `set the clipboard to (POSIX file "${escapeAppleScriptString(filePath)}")\n`,
  });
}

async function fetchDiscovery(args) {
  const url = `http://${args.host}:${args.port}/discovery`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    const name = payload.deviceName || payload.hostName || "unknown";
    const platform = payload.platform || "unknown";
    const capabilities = payload.capabilities ? JSON.stringify(payload.capabilities) : "{}";
    print("OK", `Discovery: ${name} / ${platform} / ${args.host}:${args.port}`);
    print("INFO", `Capabilities: ${capabilities}`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function openWebSocket(args) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://${args.host}:${args.port}`);
      socket.addEventListener("open", () => resolve(socket), { once: true });
      socket.addEventListener("error", () => reject(new Error("WebSocket open failed")), { once: true });
    }),
    args.timeoutMs,
    "WebSocket open",
  );
}

function createSocketClient(socket, args) {
  const pending = new Map();
  const queues = new Map();

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    const waiters = pending.get(message.type) || [];
    if (waiters.length > 0) {
      const waiter = waiters.shift();
      waiter.resolve(message);
      if (waiters.length === 0) {
        pending.delete(message.type);
      }
      return;
    }

    if (message.type === "audio_frame") {
      return;
    }

    const queue = queues.get(message.type) || [];
    if (message.type === "video_frame" && queue.length >= 2) {
      queue.shift();
    }
    queue.push(message);
    queues.set(message.type, queue);
  });

  socket.addEventListener("close", () => {
    for (const waiters of pending.values()) {
      waiters.forEach((waiter) => waiter.reject(new Error("WebSocket closed")));
    }
    pending.clear();
  });

  function waitFor(type, timeoutMs = args.timeoutMs) {
    return withTimeout(
      new Promise((resolve, reject) => {
        const queue = queues.get(type) || [];
        if (queue.length > 0) {
          const message = queue.shift();
          if (queue.length === 0) {
            queues.delete(type);
          }
          resolve(message);
          return;
        }
        const waiters = pending.get(type) || [];
        waiters.push({ resolve, reject });
        pending.set(type, waiters);
      }),
      timeoutMs,
      `Waiting ${type}`,
    );
  }

  function send(message) {
    const envelope = makeEnvelope(message);
    socket.send(JSON.stringify(envelope));
    return envelope;
  }

  return { send, waitFor };
}

function makeSessionOffer(args) {
  return {
    type: "session_offer",
    protocolVersion: 1,
    wantVideo: true,
    wantAudio: true,
    wantClipboardText: true,
    wantClipboardFile: true,
    preferredVideoCodec: args.preferredVideoCodec,
    preferredVideoEncoding: "annexb",
    preferredAudioCodec: "opus",
    maxFps: args.fps,
    maxBandwidthKbps: args.bandwidthKbps,
    qualityPreset: "diagnostic",
    displayMode: "window",
    displayId: "main",
    preferredWidth: args.width,
    preferredHeight: args.height,
    audioVolume: 80,
  };
}

function summarizeFrame(frame) {
  const dataUrl = typeof frame.dataUrl === "string" ? frame.dataUrl : "";
  const comma = dataUrl.indexOf(",");
  const payloadLength = comma >= 0 ? dataUrl.length - comma - 1 : dataUrl.length;
  const estimatedBytes = Math.round((payloadLength * 3) / 4);
  const encodedPayload = typeof frame.payload === "string" ? frame.payload : "";
  const encodedBytes = Math.round((encodedPayload.length * 3) / 4);
  return [
    `codec=${frame.codec || "unknown"}`,
    frame.encoding ? `encoding=${frame.encoding}` : "",
    `size=${frame.width || "?"}x${frame.height || "?"}`,
    `frameId=${frame.frameId || "?"}`,
    dataUrl ? `dataUrl=${dataUrl.slice(0, 30)}` : "",
    encodedPayload ? `payloadBytes~${encodedBytes}` : "",
    dataUrl ? `bytes~${estimatedBytes}` : "",
  ].filter(Boolean).join(" / ");
}

const h264NalNames = new Map([
  [1, "non-idr"],
  [5, "idr"],
  [6, "sei"],
  [7, "sps"],
  [8, "pps"],
  [9, "aud"],
]);

function findAnnexBStartCode(buffer, offset) {
  for (let index = offset; index <= buffer.length - 3; index += 1) {
    if (buffer[index] !== 0 || buffer[index + 1] !== 0) continue;
    if (buffer[index + 2] === 1) {
      return { index, length: 3 };
    }
    if (index <= buffer.length - 4 && buffer[index + 2] === 0 && buffer[index + 3] === 1) {
      return { index, length: 4 };
    }
  }
  return null;
}

function parseAnnexBNalUnits(buffer) {
  const units = [];
  let startCode = findAnnexBStartCode(buffer, 0);

  while (startCode) {
    const nalStart = startCode.index + startCode.length;
    const nextStartCode = findAnnexBStartCode(buffer, nalStart);
    const nalEnd = nextStartCode ? nextStartCode.index : buffer.length;

    if (nalEnd > nalStart) {
      units.push({
        type: buffer[nalStart] & 0x1f,
        size: nalEnd - nalStart,
      });
    }

    startCode = nextStartCode;
  }

  return units;
}

function summarizeNalTypes(units) {
  return units
    .map((unit) => `${unit.type}:${h264NalNames.get(unit.type) || "nal"}`)
    .join(",");
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function assertExpectedInputMode({ args, discovery, hello, answer }) {
  if (!args.expectInputMode) return;

  const observedModes = [
    answer?.inputMode,
    hello?.capabilities?.input?.mode,
    discovery?.capabilities?.inputMode,
  ]
    .map((mode) => normalizedText(mode).toLowerCase())
    .filter(Boolean);
  const uniqueModes = [...new Set(observedModes)];

  if (!uniqueModes.includes(args.expectInputMode)) {
    throw new Error(
      `input mode mismatch: expected ${args.expectInputMode}, observed ${uniqueModes.join(", ") || "missing"}`,
    );
  }

  print("OK", `Input mode: ${args.expectInputMode}`);
}

function assertRealVideoFrame(frame, answer) {
  const codec = normalizedText(frame.codec).toLowerCase();
  const answerCodec = normalizedText(answer?.videoCodec).toLowerCase();
  const dataUrl = normalizedText(frame.dataUrl).toLowerCase();
  const source = normalizedText(frame.source).toLowerCase();
  const framePipeline = normalizedText(frame.capturePipeline).toLowerCase();
  const answerPipeline = normalizedText(answer?.capturePipeline).toLowerCase();
  const pipeline = framePipeline || answerPipeline;
  const hostMode = normalizedText(answer?.hostMode).toLowerCase();
  const problems = [];

  if (codec !== "jpeg") {
    problems.push(`frame codec=${frame.codec || "missing"}`);
  }
  if (answerCodec && answerCodec !== "jpeg") {
    problems.push(`session videoCodec=${answer.videoCodec}`);
  }
  if (!dataUrl.startsWith("data:image/jpeg")) {
    problems.push("dataUrl is not image/jpeg");
  }
  if (source === "mock") {
    problems.push("source=mock");
  }
  if (!pipeline) {
    problems.push("capturePipeline missing");
  } else if (pipeline.includes("mock")) {
    problems.push(`capturePipeline=${pipeline}`);
  }
  if (hostMode.includes("mock")) {
    problems.push(`hostMode=${hostMode}`);
  }

  if (problems.length > 0) {
    throw new Error(`real video required but got ${summarizeFrame(frame)} (${problems.join("; ")})`);
  }

  print("OK", `Real video confirmed: ${codec} / ${pipeline || "pipeline unknown"} / source=${source || "unknown"}`);
}

function assertH264VideoFrame(frame, answer) {
  const codec = normalizedText(frame.codec).toLowerCase();
  const answerCodec = normalizedText(answer?.videoCodec).toLowerCase();
  const encoding = normalizedText(frame.encoding).toLowerCase();
  const payload = normalizedText(frame.payload);
  const codecString = normalizedText(frame.codecString || answer?.codecString);
  const framePipeline = normalizedText(frame.capturePipeline).toLowerCase();
  const answerPipeline = normalizedText(answer?.capturePipeline).toLowerCase();
  const pipeline = framePipeline || answerPipeline;
  const hostMode = normalizedText(answer?.hostMode).toLowerCase();
  const problems = [];

  if (codec !== "h264") {
    problems.push(`frame codec=${frame.codec || "missing"}`);
  }
  if (answerCodec !== "h264") {
    problems.push(`session videoCodec=${answer?.videoCodec || "missing"}`);
  }
  if (!encoding.includes("annexb")) {
    problems.push(`encoding=${frame.encoding || "missing"}`);
  }
  if (!payload) {
    problems.push("payload missing");
  }
  let nalUnits = [];
  if (payload) {
    const payloadBuffer = Buffer.from(payload, "base64");
    if (payloadBuffer.length === 0) {
      problems.push("payload decoded to 0 bytes");
    } else {
      nalUnits = parseAnnexBNalUnits(payloadBuffer);
      if (nalUnits.length === 0) {
        problems.push("Annex B start codes missing");
      } else {
        const nalTypes = new Set(nalUnits.map((unit) => unit.type));
        const hasVcl = nalTypes.has(1) || nalTypes.has(5);
        const shouldBeKeyFrame = frame.keyFrame !== false;

        if (!hasVcl) {
          problems.push(`video slice NAL missing: ${summarizeNalTypes(nalUnits)}`);
        }
        if (shouldBeKeyFrame && !nalTypes.has(7)) {
          problems.push(`keyframe SPS missing: ${summarizeNalTypes(nalUnits)}`);
        }
        if (shouldBeKeyFrame && !nalTypes.has(8)) {
          problems.push(`keyframe PPS missing: ${summarizeNalTypes(nalUnits)}`);
        }
        if (shouldBeKeyFrame && !nalTypes.has(5)) {
          problems.push(`keyframe IDR missing: ${summarizeNalTypes(nalUnits)}`);
        }
      }
    }
  }
  if (!codecString.toLowerCase().startsWith("avc1.")) {
    problems.push(`codecString=${codecString || "missing"}`);
  }
  if (pipeline !== "screencapturekit-h264") {
    problems.push(`capturePipeline=${pipeline || "missing"}`);
  }
  if (hostMode !== "mac-host-h264-stream") {
    problems.push(`hostMode=${hostMode || "missing"}`);
  }

  if (problems.length > 0) {
    throw new Error(`H.264 required but got ${summarizeFrame(frame)} (${problems.join("; ")})`);
  }

  print("OK", `H.264 video confirmed: ${encoding} / ${pipeline} / codecString=${codecString} / nalTypes=${summarizeNalTypes(nalUnits)}`);
}

function summarizeAudioFrame(frame) {
  const payload = normalizedText(frame.payload);
  const estimatedBytes = payload ? Math.round((payload.length * 3) / 4) : 0;
  return [
    `codec=${frame.codec || "unknown"}`,
    frame.encoding ? `encoding=${frame.encoding}` : "",
    `sampleRate=${frame.sampleRate || "?"}`,
    `channels=${frame.channels || "?"}`,
    frame.frames ? `frames=${frame.frames}` : "",
    frame.layout ? `layout=${frame.layout}` : "",
    frame.audioMode ? `audioMode=${frame.audioMode}` : "",
    payload ? `payloadBytes~${estimatedBytes}` : "",
  ].filter(Boolean).join(" / ");
}

function assertAudioFrame(frame, answer) {
  const codec = normalizedText(frame.codec).toLowerCase();
  const encoding = normalizedText(frame.encoding).toLowerCase();
  const audioMode = normalizedText(frame.audioMode || answer?.audioMode).toLowerCase();
  const payload = normalizedText(frame.payload);
  const sampleRate = Number(frame.sampleRate);
  const channels = Number(frame.channels);
  const frames = Number(frame.frames);
  const layout = normalizedText(frame.layout).toLowerCase();
  const problems = [];

  if (codec !== "pcm-f32le") {
    problems.push(`codec=${frame.codec || "missing"}`);
  }
  if (encoding !== "pcm-f32le-base64") {
    problems.push(`encoding=${frame.encoding || "missing"}`);
  }
  if (audioMode !== "system-pcm") {
    problems.push(`audioMode=${audioMode || "missing"}`);
  }
  if (sampleRate !== 48000) {
    problems.push(`sampleRate=${frame.sampleRate || "missing"}`);
  }
  if (channels !== 2) {
    problems.push(`channels=${frame.channels || "missing"}`);
  }
  if (!Number.isFinite(frames) || frames <= 0) {
    problems.push(`frames=${frame.frames || "missing"}`);
  }
  if (layout && layout !== "planar" && layout !== "interleaved") {
    problems.push(`layout=${frame.layout}`);
  }
  if (!payload) {
    problems.push("payload missing");
  } else {
    const payloadBuffer = Buffer.from(payload, "base64");
    const expectedBytes = Number(frame.payloadBytes);
    if (payloadBuffer.length === 0) {
      problems.push("payload decoded to 0 bytes");
    }
    if (payloadBuffer.length % 4 !== 0) {
      problems.push(`payloadBytes not Float32 aligned: ${payloadBuffer.length}`);
    }
    if (Number.isFinite(expectedBytes) && expectedBytes > 0 && payloadBuffer.length !== expectedBytes) {
      problems.push(`payloadBytes=${payloadBuffer.length}/${expectedBytes}`);
    }
    if (Number.isFinite(frames) && frames > 0 && channels > 0) {
      const expectedFrameBytes = frames * channels * 4;
      if (payloadBuffer.length !== expectedFrameBytes) {
        problems.push(`frameBytes=${payloadBuffer.length}/${expectedFrameBytes}`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`PCM audio required but got ${summarizeAudioFrame(frame)} (${problems.join("; ")})`);
  }

  print("OK", `Audio frame confirmed: ${summarizeAudioFrame(frame)}`);
}

async function probeClipboardText(client, args) {
  const clipboardId = makeProbeId("probe-text");
  const text = `lan-dual-control clipboard probe ${new Date().toISOString()}`;
  const ackPromise = client.waitFor("clipboard_ack", args.timeoutMs);
  client.send({
    type: "clipboard_text",
    direction: "client_to_host",
    clipboardId,
    textLength: text.length,
    text,
    mode: "probe",
  });

  const ack = await ackPromise;
  if (ack.clipboardId !== clipboardId) {
    throw new Error(`clipboard_ack id mismatch: ${ack.clipboardId || "missing"}`);
  }
  if (!ack.accepted) {
    throw new Error(`clipboard_text rejected: ${ack.reason || ack.code || "unknown"}`);
  }
  print("OK", `Clipboard text accepted: ${ack.textLength || text.length} chars / mode=${ack.mode || "unknown"}`);
}

async function probeClipboardHostToClient(client, args) {
  const previousText = await readLocalMacClipboardText();
  const text = `lan-dual-control host clipboard probe ${new Date().toISOString()} ${randomUUID()}`;

  try {
    const clipboardPromise = client.waitFor("clipboard_text", Math.max(args.timeoutMs, 10000));
    await writeLocalMacClipboardText(text);
    const message = await clipboardPromise;
    if (message.direction !== "host_to_client") {
      throw new Error(`clipboard_text direction mismatch: ${message.direction || "missing"}`);
    }
    if (message.text !== text) {
      throw new Error(`clipboard_text payload mismatch: ${message.textLength || 0} chars`);
    }
    print("OK", `Clipboard host_to_client received: ${message.textLength || text.length} chars / mode=${message.mode || "unknown"}`);
  } finally {
    await writeLocalMacClipboardText(previousText);
  }
}

function makeProbeFilePayload(size) {
  const text = `lan-dual-control file clipboard probe ${new Date().toISOString()}\n`;
  const chunks = [];
  while (Buffer.byteLength(chunks.join("")) < size) {
    chunks.push(text);
  }
  return Buffer.from(chunks.join("").slice(0, Math.max(1, size)), "utf8");
}

async function probeClipboardFile(client, args) {
  const transferId = makeProbeId("probe-file");
  const fileName = `lan-dual-probe-${Date.now().toString(16)}.txt`;
  const payload = makeProbeFilePayload(args.clipboardFileBytes);
  const responsePromise = client.waitFor("clipboard_file_response", args.timeoutMs);
  client.send({
    type: "clipboard_file_offer",
    transferId,
    direction: "client_to_host",
    totalBytes: payload.byteLength,
    fileCount: 1,
    maxChunkBytes: 64 * 1024,
    files: [
      {
        index: 0,
        name: fileName,
        size: payload.byteLength,
        mimeType: "text/plain",
        lastModified: Date.now(),
      },
    ],
  });

  const response = await responsePromise;
  if (response.transferId !== transferId) {
    throw new Error(`clipboard_file_response id mismatch: ${response.transferId || "missing"}`);
  }
  if (!response.accepted) {
    throw new Error(`clipboard_file_offer rejected: ${response.reason || response.code || "unknown"}`);
  }

  const chunkSize = Math.max(1, Number(response.maxChunkBytes) || 64 * 1024);
  let sentBytes = 0;
  let chunkIndex = 0;
  for (let offset = 0; offset < payload.byteLength; offset += chunkSize) {
    const chunk = payload.subarray(offset, Math.min(offset + chunkSize, payload.byteLength));
    sentBytes += chunk.byteLength;
    client.send({
      type: "clipboard_file_chunk",
      transferId,
      fileIndex: 0,
      fileName,
      chunkIndex,
      offset,
      bytes: chunk.byteLength,
      sentBytes,
      totalBytes: payload.byteLength,
      encoding: "base64",
      dataBase64: chunk.toString("base64"),
    });
    chunkIndex += 1;
  }

  const resultPromise = client.waitFor("clipboard_file_result", args.timeoutMs);
  client.send({
    type: "clipboard_file_complete",
    transferId,
    fileCount: 1,
    totalBytes: payload.byteLength,
  });

  const result = await resultPromise;
  if (result.transferId !== transferId) {
    throw new Error(`clipboard_file_result id mismatch: ${result.transferId || "missing"}`);
  }
  if (!result.accepted) {
    throw new Error(`clipboard_file transfer failed: ${result.reason || result.code || "unknown"}`);
  }
  if (Number(result.receivedBytes) !== payload.byteLength) {
    throw new Error(`clipboard_file bytes mismatch: ${result.receivedBytes || 0}/${payload.byteLength}`);
  }
  print(
    "OK",
    `Clipboard file accepted: ${result.fileCount || 1} file / ${result.receivedBytes} bytes / saveMode=${result.saveMode || response.saveMode || "unknown"}`,
  );
}

async function probeClipboardFileHostToClient(client, args) {
  const previousText = await readLocalMacClipboardText();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lan-dual-file-clip-"));
  const fileName = `lan-dual-host-file-${Date.now().toString(16)}.txt`;
  const filePath = path.join(tempDir, fileName);
  const payload = makeProbeFilePayload(args.clipboardFileBytes);

  try {
    await fs.writeFile(filePath, payload);
    const offerPromise = client.waitFor("clipboard_file_offer", Math.max(args.timeoutMs, 12000));
    await writeLocalMacClipboardFile(filePath);
    const offer = await offerPromise;
    if (offer.direction !== "host_to_client") {
      throw new Error(`clipboard_file_offer direction mismatch: ${offer.direction || "missing"}`);
    }
    if (!offer.transferId) {
      throw new Error("clipboard_file_offer missing transferId");
    }
    if (Number(offer.fileCount) !== 1) {
      throw new Error(`clipboard_file_offer fileCount mismatch: ${offer.fileCount || 0}`);
    }
    const offeredFile = Array.isArray(offer.files) ? offer.files[0] : null;
    if (!offeredFile) {
      throw new Error("clipboard_file_offer missing file metadata");
    }
    if (offeredFile.name !== fileName) {
      throw new Error(`clipboard_file_offer filename mismatch: ${offeredFile.name || "missing"}`);
    }
    if (Number(offeredFile.size) !== payload.byteLength) {
      throw new Error(`clipboard_file_offer size mismatch: ${offeredFile.size || 0}/${payload.byteLength}`);
    }

    const transferId = offer.transferId;
    client.send({
      type: "clipboard_file_response",
      transferId,
      accepted: true,
      saveMode: "memory-only",
      maxChunkBytes: 64 * 1024,
      reason: "probe accepts host_to_client file clipboard",
    });

    const chunks = [];
    let receivedBytes = 0;
    const totalBytes = Number(offer.totalBytes) || payload.byteLength;
    while (receivedBytes < totalBytes) {
      const chunk = await client.waitFor("clipboard_file_chunk", args.timeoutMs);
      if (chunk.transferId !== transferId) {
        throw new Error(`clipboard_file_chunk id mismatch: ${chunk.transferId || "missing"}`);
      }
      if (Number(chunk.fileIndex) !== 0) {
        throw new Error(`clipboard_file_chunk fileIndex mismatch: ${chunk.fileIndex || "missing"}`);
      }
      if (chunk.encoding !== "base64") {
        throw new Error(`clipboard_file_chunk encoding mismatch: ${chunk.encoding || "missing"}`);
      }
      const data = Buffer.from(String(chunk.dataBase64 || ""), "base64");
      const offset = Number(chunk.offset) || 0;
      chunks.push({ offset, data });
      receivedBytes += data.byteLength;
      client.send({
        type: "clipboard_file_progress",
        transferId,
        receivedBytes,
        totalBytes,
      });
    }

    const complete = await client.waitFor("clipboard_file_complete", args.timeoutMs);
    if (complete.transferId !== transferId) {
      throw new Error(`clipboard_file_complete id mismatch: ${complete.transferId || "missing"}`);
    }

    const received = Buffer.concat(
      chunks
        .sort((left, right) => left.offset - right.offset)
        .map((chunk) => chunk.data),
    );
    if (!received.equals(payload)) {
      throw new Error(`clipboard_file host_to_client payload mismatch: ${received.byteLength}/${payload.byteLength}`);
    }

    client.send({
      type: "clipboard_file_result",
      transferId,
      accepted: true,
      receivedBytes,
      totalBytes,
      fileCount: 1,
      saveMode: "memory-only",
      reason: "probe reconstructed host_to_client file payload",
    });
    print("OK", `Clipboard file host_to_client received: ${fileName} / ${receivedBytes} bytes`);
  } finally {
    await writeLocalMacClipboardText(previousText);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function probeInputEvents(client, args) {
  const events = [
    {
      type: "input_event",
      event: "mouse_move",
      action: "move",
      x: 0.5,
      y: 0.5,
      remoteX: 960,
      remoteY: 540,
    },
    {
      type: "input_event",
      event: "mouse_button",
      action: "down",
      button: "left",
      x: 0.5,
      y: 0.5,
      remoteX: 960,
      remoteY: 540,
    },
    {
      type: "input_event",
      event: "mouse_button",
      action: "up",
      button: "left",
      x: 0.5,
      y: 0.5,
      remoteX: 960,
      remoteY: 540,
    },
    {
      type: "input_event",
      event: "mouse_wheel",
      action: "wheel",
      deltaY: 120,
      x: 0.5,
      y: 0.5,
      remoteX: 960,
      remoteY: 540,
    },
    {
      type: "input_event",
      event: "key",
      action: "key",
      key: "a",
      code: "KeyA",
      modifiers: ["ctrl"],
      remoteModifiers: ["ctrl"],
    },
    {
      type: "input_event",
      event: "key",
      action: "key",
      key: "Delete",
      code: "Delete",
    },
    {
      type: "input_event",
      event: "key",
      action: "key",
      key: "5",
      code: "Numpad5",
    },
    {
      type: "input_event",
      event: "key",
      action: "key",
      key: "F13",
      code: "F13",
    },
    {
      type: "input_event",
      event: "key",
      action: "key",
      key: "Insert",
      code: "Insert",
    },
  ];

  for (const event of events) {
    const envelope = client.send(event);
    const ack = await client.waitFor("input_ack", args.timeoutMs);
    if (ack.inputId && ack.inputId !== envelope.id) {
      throw new Error(`input_ack id mismatch: ${ack.inputId} !== ${envelope.id}`);
    }
    if (!ack.accepted) {
      throw new Error(`input_event rejected: ${ack.reason || ack.mode || "unknown"}`);
    }
  }

  await delay(50);
  print("OK", `Input events acknowledged: ${events.length} events`);
}

async function main() {
  if (helpRequested(process.argv.slice(2))) {
    printHelp();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  print("INFO", `Target: ${args.host}:${args.port}`);

  let discovery;
  try {
    discovery = await fetchDiscovery(args);
  } catch (error) {
    fail(`Discovery failed: ${error.message}`);
    return;
  }

  let socket;
  try {
    socket = await openWebSocket(args);
    print("OK", "WebSocket connected");
  } catch (error) {
    fail(error.message);
    return;
  }

  const client = createSocketClient(socket, args);
  try {
    client.send({
      type: "hello",
      clientName: "Windows probe",
      clientPlatform: "windows",
      protocolVersion: 1,
    });
    const hello = await client.waitFor("hello_ack");
    print("OK", `hello_ack: ${hello.hostName || "host"} / ${hello.hostPlatform || "unknown"}`);

    client.send({ type: "auth_request", password: args.password });
    const auth = await client.waitFor("auth_result");
    if (!auth.ok) {
      fail(`Auth failed: ${auth.reason || auth.message || auth.code || "unknown"}`);
      return;
    }
    print("OK", "Auth passed");

    client.send(makeSessionOffer(args));
    const answer = await client.waitFor("session_answer");
    if (!answer.ok) {
      fail(`Session rejected: ${answer.reason || answer.code || "unknown"}`);
      return;
    }
    print(
      "OK",
      `Session: ${answer.width || answer.screenWidth}x${answer.height || answer.screenHeight} / ${answer.fps} Hz / ${answer.videoCodec}`,
    );
    if (answer.hostMode) {
      print("INFO", `Host mode: ${answer.hostMode}`);
    }
    if (answer.permissions) {
      print("INFO", `Permissions: ${JSON.stringify(answer.permissions)}`);
    }

    assertExpectedInputMode({ args, discovery, hello, answer });

    const frame = await client.waitFor("video_frame", Math.max(args.timeoutMs, 10000));
    if (!frame.dataUrl && !frame.payload) {
      fail("First video_frame has neither dataUrl nor payload");
      return;
    }
    print("OK", `First frame: ${summarizeFrame(frame)}`);
    if (args.requireH264) {
      assertH264VideoFrame(frame, answer);
    } else if (args.requireRealVideo) {
      assertRealVideoFrame(frame, answer);
    }
    if (args.requireAudio) {
      const audioFrame = await client.waitFor("audio_frame", Math.max(args.timeoutMs, 10000));
      assertAudioFrame(audioFrame, answer);
    }

    if (args.clipboardText) {
      await probeClipboardText(client, args);
    }
    if (args.clipboardHostToClient) {
      await probeClipboardHostToClient(client, args);
    }
    if (args.clipboardFile) {
      await probeClipboardFile(client, args);
    }
    if (args.clipboardFileHostToClient) {
      await probeClipboardFileHostToClient(client, args);
    }
    if (args.inputEvents) {
      await probeInputEvents(client, args);
    }
  } catch (error) {
    fail(error.message);
  } finally {
    socket.close();
  }
}

await main();
