import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const defaults = {
  host: "127.0.0.1",
  windowsPort: 43774,
  mockMacPort: 43775,
  password: "demo-password",
  timeoutMs: 8000,
  targets: "windows-host,mock-mac",
};

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (Object.prototype.hasOwnProperty.call(args, key) && next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    }
  }
  args.windowsPort = Number(args.windowsPort);
  args.mockMacPort = Number(args.mockMacPort);
  args.timeoutMs = Number(args.timeoutMs);
  args.targetSet = new Set(String(args.targets).split(",").map((value) => value.trim()).filter(Boolean));
  return args;
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
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

async function waitFor(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ""}`);
}

function startProcess(command, args, options = {}) {
  return spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function attachProcessLog(child, name) {
  child.stdout?.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) print(name, text);
  });
  child.stderr?.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) print(`${name}:err`, text);
  });
}

async function waitForDiscovery(host, port, timeoutMs, label) {
  const url = `http://${host}:${port}/discovery`;
  await waitFor(async () => {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok;
  }, timeoutMs, label);
}

async function openSocket(url, timeoutMs) {
  const socket = new WebSocket(url);
  await withTimeout(new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error(`failed to open ${url}`)), { once: true });
  }), timeoutMs, `open ${url}`);
  return socket;
}

function makeMessageQueue(socket) {
  const queue = [];
  const waiters = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (waiters.length) {
      waiters.shift()(message);
    } else {
      queue.push(message);
    }
  });
  return {
    next() {
      return queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve) => waiters.push(resolve));
    },
  };
}

async function assertAuthRetryPolicy({ name, url, password, timeoutMs }) {
  const socket = await openSocket(url, timeoutMs);
  const messages = makeMessageQueue(socket);
  const closed = new Promise((resolve) => socket.addEventListener("close", resolve, { once: true }));

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    socket.send(JSON.stringify({ type: "auth_request", password: `wrong-${attempt}` }));
    const message = await withTimeout(messages.next(), timeoutMs, `${name} auth_result ${attempt}`);
    if (message.type !== "auth_result" || message.ok !== false) {
      throw new Error(`${name}: unexpected auth response ${JSON.stringify(message)}`);
    }
    if (message.code !== "LAN002") {
      throw new Error(`${name}: expected LAN002, got ${message.code || "empty"}`);
    }
    if (message.maxAttempts !== 3) {
      throw new Error(`${name}: expected maxAttempts=3, got ${message.maxAttempts}`);
    }
    if (message.attemptsRemaining !== 3 - attempt) {
      throw new Error(`${name}: attempt ${attempt} expected remaining ${3 - attempt}, got ${message.attemptsRemaining}`);
    }
    print("OK", `${name} wrong auth ${attempt}: remaining ${message.attemptsRemaining}`);
  }

  await withTimeout(closed, timeoutMs, `${name} close after third failure`);
  print("OK", `${name} closed after third auth failure`);

  const nextSocket = await openSocket(url, timeoutMs);
  const nextMessages = makeMessageQueue(nextSocket);
  try {
    nextSocket.send(JSON.stringify({ type: "auth_request", password }));
    const okMessage = await withTimeout(nextMessages.next(), timeoutMs, `${name} correct auth`);
    if (okMessage.type !== "auth_result" || okMessage.ok !== true) {
      throw new Error(`${name}: correct password did not pass: ${JSON.stringify(okMessage)}`);
    }
    print("OK", `${name} correct auth passed after reconnect`);
  } finally {
    nextSocket.close();
  }
}

async function runWindowsHost(args, repoRoot) {
  const env = {
    ...process.env,
    LAN_DUAL_PASSWORD: args.password,
    LAN_DUAL_WINDOWS_INPUT_MODE: "log",
    LAN_DUAL_WINDOWS_SCREEN_MODE: "mock",
  };
  const child = startProcess(
    process.execPath,
    ["apps/windows-host/server.mjs", String(args.windowsPort), args.host],
    { cwd: repoRoot, env },
  );
  attachProcessLog(child, "windows-host");
  try {
    await waitForDiscovery(args.host, args.windowsPort, args.timeoutMs, "Windows host discovery");
    await assertAuthRetryPolicy({
      name: "Windows host",
      url: `ws://${args.host}:${args.windowsPort}`,
      password: args.password,
      timeoutMs: args.timeoutMs,
    });
  } finally {
    child.kill();
    await delay(300);
  }
}

async function runMockMac(args) {
  const { createMockMacHostServer } = await import("../../apps/mock-mac-host/server.mjs");
  const service = createMockMacHostServer({
    host: args.host,
    port: args.mockMacPort,
    password: args.password,
  });
  await service.listen();
  try {
    await assertAuthRetryPolicy({
      name: "Mock Mac host",
      url: `ws://${args.host}:${args.mockMacPort}`,
      password: args.password,
      timeoutMs: args.timeoutMs,
    });
  } finally {
    await service.close();
  }
}

async function run() {
  const args = parseArgs(process.argv);
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

  if (args.targetSet.has("windows-host")) {
    await runWindowsHost(args, repoRoot);
  }
  if (args.targetSet.has("mock-mac")) {
    await runMockMac(args);
  }

  print("OK", "Auth retry policy self-test passed");
}

run().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
