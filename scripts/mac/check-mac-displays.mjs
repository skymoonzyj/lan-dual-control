#!/usr/bin/env node
import { randomUUID } from "node:crypto";

const defaults = {
  host: "127.0.0.1",
  port: "43770",
  password: "demo-password",
  timeoutMs: 8000,
  displayId: "",
  switchDisplayId: "",
  expectDisplayCount: 0,
  preferredVideoCodec: "mjpeg",
  width: 1280,
  height: 720,
  fps: 30,
  bandwidthKbps: 12000,
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

  args.host = String(args.host || defaults.host);
  args.port = String(args.port || defaults.port);
  args.password = String(args.password || defaults.password);
  args.timeoutMs = positiveInteger(args.timeoutMs, defaults.timeoutMs);
  args.displayId = normalizedText(args.displayId);
  args.switchDisplayId = normalizedText(args.switchDisplayId);
  args.expectDisplayCount = nonNegativeInteger(args.expectDisplayCount, defaults.expectDisplayCount);
  args.preferredVideoCodec = normalizedText(args.preferredVideoCodec) || defaults.preferredVideoCodec;
  args.width = positiveInteger(args.width, defaults.width);
  args.height = positiveInteger(args.height, defaults.height);
  args.fps = positiveInteger(args.fps, defaults.fps);
  args.bandwidthKbps = positiveInteger(args.bandwidthKbps, defaults.bandwidthKbps);
  return args;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function print(status, text) {
  console.log(`[${status}] ${text}`);
}

function makeEnvelope(message) {
  return {
    id: `${message.type}-${randomUUID()}`,
    timestamp: new Date().toISOString(),
    ...message,
  };
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

async function fetchDiscovery(args) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await fetch(`http://${args.host}:${args.port}/discovery`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`discovery HTTP ${response.status}`);
    }
    const payload = await response.json();
    const displays = normalizeDisplays(payload?.capabilities?.displays ?? payload?.displays ?? []);
    print("OK", `Discovery: ${payload.deviceName || payload.hostName || "unknown"} / displays=${formatDisplays(displays)}`);
    return { payload, displays };
  } finally {
    clearTimeout(timer);
  }
}

function openWebSocket(args) {
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

function createClient(socket, args) {
  const pending = new Map();
  const queues = new Map();
  const frameWaiters = [];
  let lastVideoFrameId = 0;

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message.type === "video_frame") {
      lastVideoFrameId = Math.max(lastVideoFrameId, Number(message.frameId) || 0);
      for (let index = 0; index < frameWaiters.length; index += 1) {
        const waiter = frameWaiters[index];
        if (waiter.predicate(message)) {
          frameWaiters.splice(index, 1);
          waiter.resolve(message);
          return;
        }
      }
      const queue = queues.get("video_frame") || [];
      if (queue.length >= 20) queue.shift();
      queue.push(message);
      queues.set("video_frame", queue);
      return;
    }

    const waiters = pending.get(message.type) || [];
    if (waiters.length > 0) {
      const waiter = waiters.shift();
      waiter.resolve(message);
      if (waiters.length === 0) pending.delete(message.type);
      return;
    }

    if (message.type === "audio_frame") return;

    const queue = queues.get(message.type) || [];
    queue.push(message);
    queues.set(message.type, queue);
  });

  socket.addEventListener("close", () => {
    for (const waiters of pending.values()) {
      waiters.forEach((waiter) => waiter.reject(new Error("WebSocket closed")));
    }
    pending.clear();
    frameWaiters.splice(0).forEach((waiter) => waiter.reject(new Error("WebSocket closed")));
  });

  function send(message) {
    socket.send(JSON.stringify(makeEnvelope(message)));
  }

  function waitFor(type, timeoutMs = args.timeoutMs) {
    return withTimeout(
      new Promise((resolve, reject) => {
        const queue = queues.get(type) || [];
        if (queue.length > 0) {
          const message = queue.shift();
          if (queue.length === 0) queues.delete(type);
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

  function waitForVideoFrame(predicate, label, timeoutMs = args.timeoutMs) {
    const queue = queues.get("video_frame") || [];
    const queuedIndex = queue.findIndex(predicate);
    if (queuedIndex >= 0) {
      const [frame] = queue.splice(queuedIndex, 1);
      if (queue.length === 0) queues.delete("video_frame");
      return Promise.resolve(frame);
    }

    return withTimeout(
      new Promise((resolve, reject) => {
        frameWaiters.push({ predicate, resolve, reject });
      }),
      timeoutMs,
      label,
    );
  }

  return {
    send,
    waitFor,
    waitForVideoFrame,
    get lastVideoFrameId() {
      return lastVideoFrameId;
    },
  };
}

function normalizeDisplays(displays) {
  return (Array.isArray(displays) ? displays : [])
    .map((display, index) => ({
      id: normalizedText(display?.id || `display-${index + 1}`),
      name: normalizedText(display?.name || `显示器 ${index + 1}`),
      width: positiveInteger(display?.width, 0),
      height: positiveInteger(display?.height, 0),
      primary: Boolean(display?.primary),
    }))
    .filter((display) => display.id);
}

function formatDisplays(displays) {
  if (displays.length === 0) return "none";
  return displays
    .map((display) => `${display.id}${display.primary ? "*" : ""}:${display.width || "?"}x${display.height || "?"}`)
    .join(", ");
}

function chooseDisplay(displays, requestedId, label) {
  if (requestedId) {
    const requested = displays.find((display) => display.id === requestedId);
    if (!requested) {
      throw new Error(`${label} displayId not found: ${requestedId}; available=${formatDisplays(displays)}`);
    }
    return requested;
  }
  return displays.find((display) => display.primary) || displays[0];
}

function chooseSwitchDisplay(displays, currentDisplay, requestedId) {
  if (requestedId) {
    return chooseDisplay(displays, requestedId, "switch");
  }
  return displays.find((display) => display.id !== currentDisplay.id) || currentDisplay;
}

function makeSessionOffer(args, display) {
  return {
    type: "session_offer",
    protocolVersion: 1,
    wantVideo: true,
    wantAudio: false,
    wantClipboardText: false,
    wantClipboardFile: false,
    preferredVideoCodec: args.preferredVideoCodec,
    preferredVideoEncoding: "annexb",
    preferredAudioCodec: "pcm-f32le",
    maxFps: args.fps,
    maxBandwidthKbps: args.bandwidthKbps,
    qualityPreset: "diagnostic",
    displayMode: "window",
    displayId: display.id,
    preferredWidth: args.width || display.width,
    preferredHeight: args.height || display.height,
    audioVolume: 0,
  };
}

function makeDisplaySettings(args, display) {
  return {
    type: "display_settings",
    qualityPreset: "diagnostic",
    displayMode: "window",
    displayId: display.id,
    resolutionMode: "fixed",
    scaleMode: "fit",
    width: args.width || display.width,
    height: args.height || display.height,
    fps: args.fps,
    maxBandwidthKbps: args.bandwidthKbps,
    preferredVideoCodec: args.preferredVideoCodec,
    preferredVideoEncoding: "annexb",
    audio: false,
    audioVolume: 0,
    clipboardText: false,
    clipboardFile: false,
  };
}

function activeDisplayId(message) {
  return normalizedText(message?.activeDisplayId || message?.displayId);
}

function assertActiveDisplay(message, expectedDisplay, label) {
  const actual = activeDisplayId(message);
  if (actual !== expectedDisplay.id) {
    throw new Error(`${label} activeDisplayId mismatch: ${actual || "missing"} !== ${expectedDisplay.id}`);
  }
}

function assertDisplayCount(displays, expectedCount) {
  if (expectedCount > 0 && displays.length !== expectedCount) {
    throw new Error(`display count mismatch: ${displays.length} !== ${expectedCount}; displays=${formatDisplays(displays)}`);
  }
}

function assertFrameDisplay(frame, expectedDisplay, label) {
  const actual = activeDisplayId(frame);
  if (!actual) {
    print("INFO", `${label}: frame has no activeDisplayId diagnostic; ack path already verified`);
    return;
  }
  if (actual !== expectedDisplay.id) {
    throw new Error(`${label} frame activeDisplayId mismatch: ${actual} !== ${expectedDisplay.id}`);
  }
  print("OK", `${label}: frame display=${actual} / ${frame.displayName || expectedDisplay.name}`);
}

function printUsage() {
  console.log(`Usage:
  node scripts/mac/check-mac-displays.mjs [options]

Options:
  --host <host>                    Mac host address. Default: 127.0.0.1
  --port <port>                    Mac host port. Default: 43770
  --password <password>            Host password. Default: demo-password
  --displayId <id>                 Initial display id. Default: primary/main
  --switchDisplayId <id>           Display id to switch to. Default: first non-current display, or same display on single-screen Macs
  --expectDisplayCount <count>     Require an exact display count.
  --preferredVideoCodec <codec>    Requested codec: mjpeg or h264. Default: mjpeg
  --timeoutMs <ms>                 Network timeout. Default: 8000

Examples:
  node scripts/mac/check-mac-displays.mjs
  node scripts/mac/check-mac-displays.mjs --displayId main --switchDisplayId display-123456`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  print("INFO", `Target: ${args.host}:${args.port}`);

  const discovery = await fetchDiscovery(args);
  const socket = await openWebSocket(args);
  const client = createClient(socket, args);
  print("OK", "WebSocket connected");

  client.send({
    type: "hello",
    clientName: "Mac display checker",
    clientPlatform: "macos",
    protocolVersion: 1,
  });
  const hello = await client.waitFor("hello_ack");
  print("OK", `hello_ack: ${hello.deviceName || hello.hostName || "unknown"}`);

  client.send({
    type: "auth_request",
    method: "password",
    password: args.password,
  });
  const auth = await client.waitFor("auth_result");
  if (!auth.ok) {
    throw new Error(`auth failed: ${auth.reason || auth.message || auth.code || "unknown"}`);
  }
  print("OK", "Auth passed");

  const initialDiscoveryDisplays = discovery.displays;
  assertDisplayCount(initialDiscoveryDisplays, args.expectDisplayCount);
  if (initialDiscoveryDisplays.length === 0) {
    throw new Error("discovery returned no displays");
  }
  const initialDisplay = chooseDisplay(initialDiscoveryDisplays, args.displayId, "initial");

  client.send(makeSessionOffer(args, initialDisplay));
  const answer = await client.waitFor("session_answer");
  if (!answer.ok) {
    throw new Error(`session failed: ${answer.reason || answer.message || "unknown"}`);
  }

  const sessionDisplays = normalizeDisplays(answer.displays);
  assertDisplayCount(sessionDisplays, args.expectDisplayCount);
  if (sessionDisplays.length === 0) {
    throw new Error("session_answer returned no displays");
  }

  const activeInitialDisplay = chooseDisplay(sessionDisplays, initialDisplay.id, "session");
  assertActiveDisplay(answer, activeInitialDisplay, "session_answer");
  print("OK", `Session active display: ${activeInitialDisplay.id} / ${activeInitialDisplay.name} / displays=${formatDisplays(sessionDisplays)}`);

  const firstFrame = await client.waitForVideoFrame(
    (frame) => Boolean(frame.frameId),
    "Waiting first video_frame",
  );
  assertFrameDisplay(firstFrame, activeInitialDisplay, "First frame");

  const switchDisplay = chooseSwitchDisplay(sessionDisplays, activeInitialDisplay, args.switchDisplayId);
  const previousFrameId = client.lastVideoFrameId;
  client.send(makeDisplaySettings(args, switchDisplay));
  const ack = await client.waitFor("display_settings_ack");
  if (ack.accepted === false) {
    throw new Error(`display_settings rejected: ${ack.reason || ack.code || "unknown"}`);
  }
  assertActiveDisplay(ack, switchDisplay, "display_settings_ack");
  print("OK", `Display settings ack: ${switchDisplay.id} / ${ack.displayName || switchDisplay.name}`);

  const switchedFrame = await client.waitForVideoFrame(
    (frame) => {
      const frameId = Number(frame.frameId) || 0;
      if (frameId <= previousFrameId) return false;
      const frameDisplayId = activeDisplayId(frame);
      return !frameDisplayId || frameDisplayId === switchDisplay.id;
    },
    "Waiting switched video_frame",
  );
  assertFrameDisplay(switchedFrame, switchDisplay, "Switched frame");

  socket.close();
  print(
    "OK",
    sessionDisplays.length > 1
      ? `Display switch verified: ${activeInitialDisplay.id} -> ${switchDisplay.id}`
      : `Single-display round-trip verified: ${switchDisplay.id}`,
  );
}

main().catch((error) => {
  print("ERROR", error.message);
  process.exitCode = 1;
});
