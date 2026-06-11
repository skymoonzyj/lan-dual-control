import { randomUUID } from "node:crypto";

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
  clipboardFile: false,
  clipboardFileBytes: 96,
  inputEvents: false,
};

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
  args.clipboardText = booleanArg(args.clipboardText) || booleanArg(args.clipboard);
  args.clipboardFile = booleanArg(args.clipboardFile) || booleanArg(args.clipboard);
  args.clipboardFileBytes = Number(args.clipboardFileBytes) || defaults.clipboardFileBytes;
  args.inputEvents = booleanArg(args.inputEvents) || booleanArg(args.input);
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
  const frames = [];

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message.type === "video_frame") {
      frames.push(message);
    }

    const waiters = pending.get(message.type) || [];
    if (waiters.length > 0) {
      const waiter = waiters.shift();
      waiter.resolve(message);
      if (waiters.length === 0) {
        pending.delete(message.type);
      }
    }
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
        if (type === "video_frame" && frames.length > 0) {
          resolve(frames.shift());
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
    socket.send(JSON.stringify(makeEnvelope(message)));
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
    preferredVideoCodec: "mjpeg",
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
  return [
    `codec=${frame.codec || "unknown"}`,
    `size=${frame.width || "?"}x${frame.height || "?"}`,
    `frameId=${frame.frameId || "?"}`,
    `dataUrl=${dataUrl.slice(0, 30) || "missing"}`,
    `bytes~${estimatedBytes}`,
  ].join(" / ");
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

async function probeInputEvents(client) {
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
  ];

  events.forEach((event) => client.send(event));
  await delay(150);
  print("OK", `Input events sent: ${events.length} events`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  print("INFO", `Target: ${args.host}:${args.port}`);

  try {
    await fetchDiscovery(args);
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

    const frame = await client.waitFor("video_frame", Math.max(args.timeoutMs, 10000));
    if (!frame.dataUrl) {
      fail("First video_frame has no dataUrl");
      return;
    }
    print("OK", `First frame: ${summarizeFrame(frame)}`);

    if (args.clipboardText) {
      await probeClipboardText(client, args);
    }
    if (args.clipboardFile) {
      await probeClipboardFile(client, args);
    }
    if (args.inputEvents) {
      await probeInputEvents(client);
    }
  } catch (error) {
    fail(error.message);
  } finally {
    socket.close();
  }
}

await main();
