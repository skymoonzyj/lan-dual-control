#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = "scripts/codex-link-client.mjs";
const defaultTimeoutMs = 10000;

function parseArgs(argv) {
  const args = { timeoutMs: defaultTimeoutMs };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if ((token === "--timeoutMs" || token === "--timeout") && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(3000, Number(next) || defaultTimeoutMs);
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(text, expected, label) {
  assert(String(text).includes(expected), `${label} did not include ${JSON.stringify(expected)}.\n${text}`);
}

function assertNotIncludes(text, unexpected, label) {
  assert(!String(text).includes(unexpected), `${label} unexpectedly included ${JSON.stringify(unexpected)}.\n${text}`);
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

function makeState() {
  return {
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:01:00.000Z",
    statuses: {
      "Mac Codex": {
        role: "Mac 端",
        status: "online",
        note: "ready",
        updatedAt: "2026-06-20T00:00:30.000Z",
      },
    },
    currentCall: {
      status: "CALLING",
      from: "Mac Codex",
      need: "Windows Codex",
      goal: "coordination smoke",
      ask: "please inspect",
      updatedAt: "2026-06-20T00:00:45.000Z",
    },
    events: [
      {
        id: "event-1",
        at: "2026-06-20T00:00:40.000Z",
        type: "message",
        from: "Mac Codex",
        text: "hello",
      },
    ],
  };
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function withFakeBoard(state, fn) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const record = { method: request.method, url: request.url };
    requests.push(record);
    if (request.method === "GET" && request.url === "/api/state") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(state));
      return;
    }
    if (request.method === "POST" && request.url === "/api/presence") {
      record.body = await readJson(request);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, state: { ...state, userPresence: record.body } }));
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("not found");
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`, requests);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function run(extraArgs, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...extraArgs], {
      cwd: repoRoot,
      env: {
        ...process.env,
        CODEX_LINK_TOKEN: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, args.timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ status: timedOut ? null : code, signal, stdout, stderr, timedOut });
    });
  });
}

async function checkStateJson(args) {
  const state = makeState();
  await withFakeBoard(state, async (serverUrl, requests) => {
    const result = await run(["--server", serverUrl, "state", "--json"], args);
    assert(result.status === 0, `state --json should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    assert(result.stderr === "", `state --json should not write stderr. stderr=${result.stderr}`);
    const payload = parseJson(result.stdout, "state --json");
    assert(payload.updatedAt === state.updatedAt, `state --json should preserve updatedAt: ${JSON.stringify(payload)}`);
    assert(payload.currentCall?.goal === state.currentCall.goal, `state --json should preserve currentCall: ${JSON.stringify(payload.currentCall)}`);
    assert(payload.statuses?.["Mac Codex"]?.status === "online", `state --json should preserve statuses: ${JSON.stringify(payload.statuses)}`);
    assert(Array.isArray(payload.events) && payload.events[0]?.id === "event-1", `state --json should preserve events: ${JSON.stringify(payload.events)}`);
    assert(requests.length === 1 && requests[0].url === "/api/state", `state --json should only read /api/state: ${JSON.stringify(requests)}`);
  });
  console.log("[OK] codex-link-client state --json emits pure Agent Link state JSON");
}

async function checkStateTextStillHumanReadable(args) {
  await withFakeBoard(makeState(), async (serverUrl) => {
    const result = await run(["--server", serverUrl, "state"], args);
    assert(result.status === 0, `state text should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    assertIncludes(result.stdout, "updatedAt: 2026-06-20T00:01:00.000Z", "state text");
    assertIncludes(result.stdout, "currentCall:", "state text");
    assertIncludes(result.stdout, "[call] CALLING: coordination smoke", "state text");
    assertIncludes(result.stdout, "Mac Codex: online - ready", "state text");
    assertNotIncludes(result.stdout.trim(), "\"updatedAt\"", "state text");
  });
  console.log("[OK] codex-link-client state default output stays human-readable");
}

async function checkPresencePost(args) {
  await withFakeBoard(makeState(), async (serverUrl, requests) => {
    const result = await run([
      "--server", serverUrl,
      "presence",
      "--status", "present",
      "--updatedBy", "Mac Codex",
      "--reason", "user returned in current chat",
    ], args);
    assert(result.status === 0, `presence should exit 0. stdout=${result.stdout} stderr=${result.stderr}`);
    assert(result.stdout.trim() === "ok", `presence should print ok. stdout=${result.stdout}`);
    const presencePost = requests.find((request) => request.method === "POST" && request.url === "/api/presence");
    assert(presencePost, `presence should post /api/presence: ${JSON.stringify(requests)}`);
    assert(presencePost.body.status === "present", `presence status mismatch: ${JSON.stringify(presencePost.body)}`);
    assert(presencePost.body.updatedBy === "Mac Codex", `presence updatedBy mismatch: ${JSON.stringify(presencePost.body)}`);
    assert(presencePost.body.reason === "user returned in current chat", `presence reason mismatch: ${JSON.stringify(presencePost.body)}`);
    assertNotIncludes(JSON.stringify(presencePost.body), "password", "presence POST");
    assertNotIncludes(JSON.stringify(presencePost.body), "input_event", "presence POST");
  });
  console.log("[OK] codex-link-client presence posts structured userPresence safely");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: node scripts/test-codex-link-client.mjs [--timeoutMs 10000]`);
    return;
  }

  await checkStateJson(args);
  await checkStateTextStillHumanReadable(args);
  await checkPresencePost(args);
  console.log("[OK] codex-link-client self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
