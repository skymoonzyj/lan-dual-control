#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = "scripts/codex-link-server.mjs";
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

async function getFreePort() {
  const server = http.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForState(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/state`);
      if (response.ok) return response.json();
      lastError = new Error(`state returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not become ready: ${lastError?.message || "timeout"}`);
}

async function withServer(initialState, args, fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "codex-link-server-"));
  const statePath = path.join(dir, "state.json");
  await writeFile(statePath, `${JSON.stringify(initialState, null, 2)}\n`, "utf8");
  const port = await getFreePort();
  const child = spawn(process.execPath, [script, "--host", "127.0.0.1", "--port", String(port), "--state", statePath], {
    cwd: repoRoot,
    env: { ...process.env, CODEX_LINK_TOKEN: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForState(baseUrl, args.timeoutMs);
    await fn(baseUrl, { stdout: () => stdout, stderr: () => stderr });
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit").catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}

function initialState() {
  return {
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:01.000Z",
    statuses: {},
    currentCall: null,
    events: [],
    pinnedTasks: [
      {
        id: "M2",
        owner: "Mac",
        title: "真实输入控制安全路径",
        done: false,
      },
    ],
    userPresence: {
      status: "away",
      label: "用户不在",
      instruction: "只做无授权任务",
      reason: "user resting",
      updatedAt: "2026-06-20T00:00:02.000Z",
      updatedBy: "Supervisor",
    },
  };
}

async function checkStatePreservesPresenceAndPinnedTasks(args) {
  await withServer(initialState(), args, async (baseUrl) => {
    const state = await waitForState(baseUrl, args.timeoutMs);
    assert(state.userPresence?.status === "away", `server should preserve userPresence: ${JSON.stringify(state.userPresence)}`);
    assert(Array.isArray(state.pinnedTasks) && state.pinnedTasks[0]?.id === "M2", `server should preserve pinnedTasks: ${JSON.stringify(state.pinnedTasks)}`);
  });
  console.log("[OK] codex-link-server preserves userPresence and pinnedTasks from state file");
}

async function checkPresenceEndpoint(args) {
  await withServer(initialState(), args, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "present",
        updatedBy: "Mac Codex",
        reason: "presence refresh",
      }),
    });
    if (!response.ok) {
      throw new Error(`/api/presence should return 200, got ${response.status}: ${await response.text()}`);
    }
    const payload = await response.json();
    assert(payload.ok === true, `presence response should be ok: ${JSON.stringify(payload)}`);
    assert(payload.state?.userPresence?.status === "present", `presence status mismatch: ${JSON.stringify(payload.state?.userPresence)}`);
    assert(payload.state?.userPresence?.label === "用户在场", `presence label mismatch: ${JSON.stringify(payload.state?.userPresence)}`);
    assert(payload.state?.userPresence?.updatedBy === "Mac Codex", `presence updatedBy mismatch: ${JSON.stringify(payload.state?.userPresence)}`);
    assertIncludes(payload.state?.userPresence?.instruction || "", "需要密码", "presence instruction");
    assertNotIncludes(JSON.stringify(payload), "password=", "presence response");
    assertNotIncludes(JSON.stringify(payload), "input_event", "presence response");
    const state = await waitForState(baseUrl, args.timeoutMs);
    assert(state.userPresence?.status === "present", `GET /api/state should expose updated presence: ${JSON.stringify(state.userPresence)}`);
    assert(state.events?.some((event) => event.type === "presence" && event.from === "Mac Codex"), `presence event missing: ${JSON.stringify(state.events)}`);
  });
  console.log("[OK] codex-link-server /api/presence updates structured userPresence safely");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log("Usage: node scripts/test-codex-link-server.mjs [--timeoutMs 10000]");
    return;
  }
  await checkStatePreservesPresenceAndPinnedTasks(args);
  await checkPresenceEndpoint(args);
  console.log("[OK] codex-link-server self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
