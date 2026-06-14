#!/usr/bin/env node
import { randomUUID } from "node:crypto";

const defaults = {
  host: "127.0.0.1",
  port: "43770",
  password: "demo-password",
  timeoutMs: 8000,
  expectInputMode: "log",
  json: false,
};

const runState = {
  args: null,
  target: null,
  discovery: null,
  hello: null,
  auth: null,
  session: null,
  input: {
    attempted: 0,
    acknowledged: 0,
    cases: [],
  },
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
  args.expectInputMode = normalizedText(args.expectInputMode || defaults.expectInputMode);
  args.json = booleanArg(args.json, defaults.json);
  return args;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function booleanArg(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function print(status, text) {
  const line = `[${status}] ${text}`;
  if (runState.args?.json) {
    console.error(line);
    return;
  }
  console.log(line);
}

function fail(message) {
  throw new Error(message);
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
    const name = payload.deviceName || payload.hostName || "unknown";
    const mode = discoveryInputMode(payload) || "unknown";
    runState.discovery = summarizeDiscovery(payload);
    print("OK", `Discovery: ${name} / inputMode=${mode} / ${args.host}:${args.port}`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function discoveryInputMode(discovery) {
  return normalizedText(discovery?.capabilities?.inputMode || discovery?.inputMode);
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

function createClient(socket, timeoutMs) {
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
      if (waiters.length === 0) pending.delete(message.type);
      return;
    }

    const queue = queues.get(message.type) || [];
    queue.push(message);
    queues.set(message.type, queue);
  });

  socket.addEventListener("close", () => {
    for (const waiters of pending.values()) {
      waiters.forEach((waiter) => waiter.reject(new Error("WebSocket closed")));
    }
    pending.clear();
  });

  function send(message) {
    const envelope = makeEnvelope(message);
    socket.send(JSON.stringify(envelope));
    return envelope;
  }

  function waitFor(type, customTimeoutMs = timeoutMs) {
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
      customTimeoutMs,
      `Waiting ${type}`,
    );
  }

  return { send, waitFor };
}

function makeSessionOffer() {
  return {
    type: "session_offer",
    protocolVersion: 1,
    wantVideo: false,
    wantAudio: false,
    wantClipboardText: false,
    wantClipboardFile: false,
    preferredVideoCodec: "mjpeg",
    preferredAudioCodec: "pcm-f32le",
    maxFps: 1,
    maxBandwidthKbps: 1000,
    qualityPreset: "diagnostic",
    displayMode: "window",
    displayId: "main",
    preferredWidth: 640,
    preferredHeight: 360,
  };
}

function inputCases() {
  const cases = [
    {
      name: "mouse move center",
      expectedEvent: "mouse_move",
      message: { event: "mouse_move", action: "move", x: 0.5, y: 0.5, remoteX: 960, remoteY: 540 },
    },
    {
      name: "left button down",
      expectedEvent: "mouse_button",
      message: { event: "mouse_button", action: "down", button: "left", x: 0.5, y: 0.5, remoteX: 960, remoteY: 540 },
    },
    {
      name: "left button up",
      expectedEvent: "mouse_button",
      message: { event: "mouse_button", action: "up", button: "left", x: 0.5, y: 0.5, remoteX: 960, remoteY: 540 },
    },
    {
      name: "right button click",
      expectedEvent: "mouse_button",
      message: { event: "mouse_button", action: "down", button: "right", x: 0.55, y: 0.55, remoteX: 1056, remoteY: 594 },
    },
    {
      name: "right button release",
      expectedEvent: "mouse_button",
      message: { event: "mouse_button", action: "up", button: "right", x: 0.55, y: 0.55, remoteX: 1056, remoteY: 594 },
    },
    {
      name: "mouse wheel",
      expectedEvent: "mouse_wheel",
      message: { event: "mouse_wheel", action: "wheel", deltaX: -32, deltaY: 120, x: 0.5, y: 0.5, remoteX: 960, remoteY: 540 },
    },
    {
      name: "ctrl a",
      expectedEvent: "key",
      message: { event: "key", action: "key", key: "a", code: "KeyA", modifiers: ["ctrl"], remoteModifiers: ["ctrl"] },
    },
    {
      name: "command c shortcut",
      expectedEvent: "key",
      message: {
        event: "key",
        action: "key",
        key: "c",
        code: "KeyC",
        modifiers: ["command"],
        remoteModifiers: ["command"],
        shortcutAction: "copy",
      },
    },
    {
      name: "meta fallback v",
      expectedEvent: "key",
      message: { event: "key", action: "key", key: "v", code: "KeyV", metaKey: true, localMetaKey: true },
    },
    {
      name: "option arrow left",
      expectedEvent: "key",
      message: { event: "key", action: "key", key: "ArrowLeft", code: "ArrowLeft", altKey: true, localAltKey: true },
    },
    {
      name: "shift tab",
      expectedEvent: "key",
      message: { event: "key", action: "key", key: "Tab", code: "Tab", shiftKey: true, localShiftKey: true },
    },
    {
      name: "return alias",
      expectedEvent: "key",
      message: { event: "key", action: "key", key: "return", code: "Return" },
    },
    {
      name: "escape alias",
      expectedEvent: "key",
      message: { event: "key", action: "key", key: "esc", code: "Escape" },
    },
    {
      name: "forward delete alias",
      expectedEvent: "key",
      message: { event: "key", action: "key", key: "forwarddelete", code: "ForwardDelete" },
    },
    {
      name: "function key",
      expectedEvent: "key",
      message: { event: "key", action: "key", key: "F13", code: "F13" },
    },
    {
      name: "numpad key",
      expectedEvent: "key",
      message: { event: "key", action: "key", key: "5", code: "Numpad5" },
    },
  ];

  return cases.map((item, index) => ({
    ...item,
    message: {
      ...item.message,
      sequence: index + 1,
    },
  }));
}

function assertAck(ack, envelope, item) {
  if (ack.inputId && ack.inputId !== envelope.id) {
    throw new Error(`${item.name}: input_ack id mismatch ${ack.inputId} !== ${envelope.id}`);
  }
  if (ack.sequence !== item.message.sequence) {
    throw new Error(`${item.name}: input_ack sequence mismatch ${ack.sequence} !== ${item.message.sequence}`);
  }
  if (ack.event !== item.expectedEvent) {
    throw new Error(`${item.name}: input_ack event mismatch ${ack.event} !== ${item.expectedEvent}`);
  }
  if (!ack.accepted) {
    throw new Error(`${item.name}: input_event rejected: ${ack.reason || ack.code || "unknown"}`);
  }
  if (ack.injected !== false || ack.mode !== "log") {
    throw new Error(`${item.name}: expected log-only ack, got mode=${ack.mode}, injected=${ack.injected}`);
  }
}

function redactSensitiveText(text, args) {
  let output = String(text || "");
  const password = String(args?.password || "");
  if (password) {
    output = output.split(password).join("[redacted-password]");
  }
  return output;
}

function summarizeDiscovery(payload) {
  if (!payload || typeof payload !== "object") return null;
  const inputMode = discoveryInputMode(payload);
  return {
    deviceName: String(payload.deviceName || payload.hostName || "unknown"),
    platform: String(payload.platform || "unknown"),
    inputMode,
    runtime: payload.runtime || null,
    permissions: payload.permissions || null,
    capabilities: payload.capabilities || null,
  };
}

function summarizeHello(message) {
  if (!message || typeof message !== "object") return null;
  return {
    deviceName: String(message.deviceName || message.hostName || "unknown"),
    platform: String(message.hostPlatform || message.platform || ""),
    runtime: message.runtime || null,
  };
}

function summarizeAuth(message) {
  if (!message || typeof message !== "object") return null;
  return {
    ok: message.ok === true,
    reason: String(message.reason || message.message || ""),
    code: String(message.code || ""),
    attemptsRemaining: Number.isFinite(Number(message.attemptsRemaining)) ? Number(message.attemptsRemaining) : null,
    maxAttempts: Number.isFinite(Number(message.maxAttempts)) ? Number(message.maxAttempts) : null,
  };
}

function summarizeSession(message, inputMode) {
  if (!message || typeof message !== "object") return null;
  return {
    ok: message.ok !== false,
    inputMode: normalizedText(message.inputMode || inputMode),
    videoCodec: String(message.videoCodec || message.codec || ""),
    width: Number(message.width || message.screenWidth) || 0,
    height: Number(message.height || message.screenHeight) || 0,
    reason: String(message.reason || message.message || ""),
    code: String(message.code || ""),
  };
}

function summarizeAck(ack, item) {
  return {
    sequence: Number(ack.sequence) || item.message.sequence,
    name: item.name,
    event: String(ack.event || ""),
    accepted: ack.accepted === true,
    mode: String(ack.mode || ""),
    injected: ack.injected === true,
    reason: String(ack.reason || ack.message || ""),
    code: String(ack.code || ""),
  };
}

function summarizeArgs(args) {
  return {
    host: args.host,
    port: String(args.port),
    timeoutMs: args.timeoutMs,
    expectInputMode: args.expectInputMode,
    json: args.json,
  };
}

function makeJsonPayload(ok, error = null) {
  return {
    ok,
    target: runState.target,
    args: runState.args ? summarizeArgs(runState.args) : null,
    discovery: runState.discovery,
    hello: runState.hello,
    auth: runState.auth,
    session: runState.session,
    input: runState.input,
    error: error
      ? {
          message: redactSensitiveText(error.message, runState.args),
          name: error.name,
        }
      : null,
  };
}

function printJsonPayload(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function printUsage() {
  console.log(`Usage:
  node scripts/mac/smoke-mac-input-log.mjs [options]

Options:
  --host <host>                 Mac host address. Default: 127.0.0.1
  --port <port>                 Mac host port. Default: 43770
  --password <password>         Probe password. Default: demo-password
  --timeoutMs <ms>              Per-step timeout. Default: 8000
  --expectInputMode <mode>      Required discovery input mode. Default: log
  --json                        Print one machine-readable JSON object to stdout.

This script refuses to send input unless /discovery reports inputMode=log.`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  runState.args = args;
  runState.target = { host: args.host, port: String(args.port) };
  print("INFO", `Target: ${args.host}:${args.port}`);

  let discovery;
  discovery = await fetchDiscovery(args);

  const inputMode = discoveryInputMode(discovery);
  if (args.expectInputMode !== "log") {
    fail(`This log smoke script only supports --expectInputMode log; got ${args.expectInputMode || "unknown"}`);
    return;
  }
  if (inputMode !== "log") {
    fail(`Refusing to send input events because discovery inputMode=${inputMode || "unknown"}, expected log`);
    return;
  }

  let socket;
  socket = await openWebSocket(args);
  print("OK", "WebSocket connected");

  const client = createClient(socket, args.timeoutMs);
  try {
    client.send({
      type: "hello",
      clientName: "Mac input log smoke",
      clientPlatform: "macos",
      protocolVersion: 1,
    });
    const hello = await client.waitFor("hello_ack");
    runState.hello = summarizeHello(hello);
    print("OK", `hello_ack: ${hello.hostName || hello.deviceName || "host"}`);

    client.send({ type: "auth_request", password: args.password });
    const auth = await client.waitFor("auth_result");
    runState.auth = summarizeAuth(auth);
    if (!auth.ok) {
      fail(`Auth failed: ${auth.reason || auth.message || auth.code || "unknown"}`);
    }
    print("OK", "Auth passed");

    client.send(makeSessionOffer());
    const session = await client.waitFor("session_answer");
    runState.session = summarizeSession(session, inputMode);
    if (!session.ok) {
      fail(`Session rejected: ${session.reason || session.code || "unknown"}`);
    }
    print("OK", `Session: inputMode=${session.inputMode || inputMode}, video=${session.videoCodec || "none"}`);

    const cases = inputCases();
    for (const item of cases) {
      runState.input.attempted += 1;
      const envelope = client.send({ type: "input_event", ...item.message });
      let ack;
      try {
        ack = await client.waitFor("input_ack");
        assertAck(ack, envelope, item);
        runState.input.acknowledged += 1;
        runState.input.cases.push(summarizeAck(ack, item));
      } catch (error) {
        runState.input.cases.push({
          sequence: item.message.sequence,
          name: item.name,
          event: item.expectedEvent,
          accepted: false,
          mode: "",
          injected: null,
          reason: error.message,
          code: "",
        });
        throw error;
      }
      print("OK", `${item.message.sequence}/${cases.length} ${item.name}: ${ack.event} acknowledged in ${ack.mode} mode`);
    }

    print("OK", `Mac input log smoke passed: ${cases.length} events acknowledged without injection`);
    if (args.json) printJsonPayload(makeJsonPayload(true));
  } catch (error) {
    throw error;
  } finally {
    socket.close();
  }
}

await main().catch((error) => {
  print("ERROR", redactSensitiveText(error.message, runState.args));
  if (runState.args?.json) {
    printJsonPayload(makeJsonPayload(false, error));
  }
  process.exitCode = 1;
});
