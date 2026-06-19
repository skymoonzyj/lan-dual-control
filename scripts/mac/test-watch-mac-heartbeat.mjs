#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/watch-mac-heartbeat.mjs";

const defaults = {
  timeoutMs: 12000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-watch-mac-heartbeat.mjs [options]

Verifies watch-mac-heartbeat loop/status posting behavior with fake child
commands. It does not contact a real Agent Link Board, authenticate, send
passwords, input, or inject.

Options:
  --timeoutMs <ms>  Per command timeout. Default: ${defaults.timeoutMs}
  --help, -h        Show this help without running checks
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
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(3000, Number(next) || defaults.timeoutMs);
      index += 1;
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

function assertNotIncludes(text, expected, label) {
  assert(!String(text).includes(expected), `${label} unexpectedly included ${JSON.stringify(expected)}.\n${text}`);
}

function run(extraArgs, args, env = {}) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
      ...env,
    },
  });
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\n${stdout}`);
  }
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function assertNoSecrets(text, label) {
  assertNotIncludes(text, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(text, "--password", label);
  assertNotIncludes(text, "super-secret-watch", label);
}

function makeFakeHeartbeat(tmp, status = "ok") {
  const path = join(tmp, `fake-heartbeat-${status}.mjs`);
  const blocked = status === "blocked";
  writeFileSync(path, `#!/usr/bin/env node
const status = ${JSON.stringify(status)};
const reason = status === "blocked" ? "codex-reconnect-stuck" : "ok";
console.log(JSON.stringify({
  ok: !${JSON.stringify(blocked)},
  status,
  codex: { reason },
  boardSummary: \`MacHeartbeat=status=\${status}; device=Mac; reason=\${reason}. No password was requested or sent; no WebSocket auth/input/inject was attempted.\`
}, null, 2));
process.exit(status === "blocked" ? 1 : 0);
`);
  return path;
}

function makeFakeCodexLink(tmp) {
  const path = join(tmp, "fake-codex-link.mjs");
  const logPath = join(tmp, "codex-link-calls.jsonl");
  writeFileSync(path, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)) + "\\n");
console.log("ok");
`);
  return { path, logPath };
}

function makeFakeUnattendedStatus(tmp, status = "ok") {
  const path = join(tmp, `fake-unattended-${status}.mjs`);
  const logPath = join(tmp, "unattended-calls.jsonl");
  writeFileSync(path, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)) + "\\n");
const status = ${JSON.stringify(status)};
if (status === "ok") {
  console.log("Mac unattended status: MacUnattendedHealth=warning reason=launch-agent-not-loaded blockers=none warnings=launch-agent-not-loaded,power checkedAt=2026-06-19T12:00:00.000Z; No password was requested or sent; no input/inject/system changes were attempted.");
  process.exit(0);
}
console.error("Mac unattended status failed without secrets");
process.exit(2);
`);
  return { path, logPath };
}

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assertIncludes(result.stdout, "Usage:", `${script} ${flag}`);
    assertIncludes(result.stdout, "--sendStatus", `${script} ${flag}`);
    assertIncludes(result.stdout, "--refreshUnattended", `${script} ${flag}`);
    assertIncludes(result.stdout, "Mac Heartbeat", `${script} ${flag}`);
    assertNotIncludes(result.stdout, "password:", `${script} ${flag}`);
  }
  print("OK", "Mac heartbeat watcher help exits quickly");
}

function checkOnceNoPost(args) {
  const tmp = mkdtempSync(join(tmpdir(), "lan-dual-watch-heartbeat-"));
  try {
    const heartbeat = makeFakeHeartbeat(tmp, "ok");
    const result = run(["--once", "--json", "--intervalMs", "1000"], args, {
      LAN_DUAL_MAC_HEARTBEAT_SCRIPT: heartbeat,
    });
    const payload = parseJson(result.stdout, "once JSON");
    assert(result.status === 0, `once JSON should pass.\n${result.stdout}\n${result.stderr}`);
    assert(payload.ok === true, "once payload should be ok=true");
    assert(payload.runs.length === 1, "once payload should include one run");
    assert(payload.last.reportStatus === "ok", "last status should be ok");
    assert(payload.last.posted === false, "once without --sendStatus should not post");
    assertIncludes(payload.last.boardSummary, "MacHeartbeat=status=ok", "once board summary");
    assertNoSecrets(`${result.stdout}\n${result.stderr}`, "once output");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  print("OK", "One-shot watcher can run without posting");
}

function checkSendStatus(args) {
  const tmp = mkdtempSync(join(tmpdir(), "lan-dual-watch-heartbeat-"));
  try {
    const heartbeat = makeFakeHeartbeat(tmp, "ok");
    const fakeLink = makeFakeCodexLink(tmp);
    const result = run(["--once", "--sendStatus", "--json", "--server", "http://127.0.0.1:17888"], args, {
      LAN_DUAL_MAC_HEARTBEAT_SCRIPT: heartbeat,
      LAN_DUAL_CODEX_LINK_CLIENT: fakeLink.path,
    });
    const payload = parseJson(result.stdout, "send status JSON");
    assert(result.status === 0, `send status should pass.\n${result.stdout}\n${result.stderr}`);
    assert(payload.last.posted === true, "send status should post");
    const calls = readJsonl(fakeLink.logPath);
    assert(calls.length === 1, "fake Codex Link should receive one call");
    const argv = calls[0].join(" ");
    assertIncludes(argv, "status", "codex-link argv");
    assertIncludes(argv, "--device Mac Heartbeat", "codex-link argv");
    assertIncludes(argv, "--role Mac watchdog", "codex-link argv");
    assertIncludes(argv, "--status online", "codex-link argv");
    assertIncludes(argv, "MacHeartbeat=status=ok", "codex-link argv");
    assertNotIncludes(argv, "Mac Codex", "codex-link argv should not mask Mac Codex freshness");
    assertNoSecrets(`${result.stdout}\n${result.stderr}\n${argv}`, "send status output");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  print("OK", "Watcher posts status as Mac Heartbeat, not Mac Codex");
}

function checkRefreshUnattended(args) {
  const tmp = mkdtempSync(join(tmpdir(), "lan-dual-watch-heartbeat-"));
  try {
    const heartbeat = makeFakeHeartbeat(tmp, "ok");
    const unattended = makeFakeUnattendedStatus(tmp, "ok");
    const fakeLink = makeFakeCodexLink(tmp);
    const result = run([
      "--once",
      "--refreshUnattended",
      "--sendStatus",
      "--json",
      "--host",
      "127.0.0.1",
      "--port",
      "43770",
      "--server",
      "http://127.0.0.1:17888",
    ], args, {
      LAN_DUAL_MAC_HEARTBEAT_SCRIPT: heartbeat,
      LAN_DUAL_MAC_UNATTENDED_STATUS_SCRIPT: unattended.path,
      LAN_DUAL_CODEX_LINK_CLIENT: fakeLink.path,
    });
    const payload = parseJson(result.stdout, "refresh unattended JSON");
    assert(result.status === 0, `refresh unattended should pass.\n${result.stdout}\n${result.stderr}`);
    assert(payload.last.unattendedRefresh?.requested === true, "refresh unattended should mark refresh requested");
    assert(payload.last.unattendedRefresh?.ok === true, "refresh unattended should mark refresh ok");
    assertIncludes(payload.last.summary, "unattended=refreshed", "refresh unattended summary");
    const calls = readJsonl(unattended.logPath);
    assert(calls.length === 1, "fake unattended status should receive one call");
    const argv = calls[0].join(" ");
    assertIncludes(argv, "127.0.0.1", "unattended argv");
    assertIncludes(argv, "--port 43770", "unattended argv");
    assertIncludes(argv, "--sendStatus", "unattended argv");
    assertIncludes(argv, "--boardSummary", "unattended argv");
    assertNotIncludes(argv, "--promptPassword", "unattended argv");
    assertNotIncludes(argv, "--password", "unattended argv");
    assertNoSecrets(`${result.stdout}\n${result.stderr}\n${argv}`, "refresh unattended output");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  print("OK", "Watcher can refresh Mac Unattended status before heartbeat when requested");
}

function checkRefreshUnattendedFailure(args) {
  const tmp = mkdtempSync(join(tmpdir(), "lan-dual-watch-heartbeat-"));
  try {
    const heartbeat = makeFakeHeartbeat(tmp, "ok");
    const unattended = makeFakeUnattendedStatus(tmp, "failed");
    const result = run([
      "--once",
      "--refreshUnattended",
      "--json",
    ], args, {
      LAN_DUAL_MAC_HEARTBEAT_SCRIPT: heartbeat,
      LAN_DUAL_MAC_UNATTENDED_STATUS_SCRIPT: unattended.path,
    });
    const payload = parseJson(result.stdout, "refresh unattended failure JSON");
    assert(result.status !== 0, "failed unattended refresh should make one-shot watcher exit non-zero");
    assert(payload.last.reportStatus === "ok", "heartbeat should still run after unattended refresh failure");
    assert(payload.last.unattendedRefresh?.requested === true, "refresh failure should mark refresh requested");
    assert(payload.last.unattendedRefresh?.ok === false, "refresh failure should mark refresh failed");
    assertIncludes(payload.last.summary, "unattended=refresh-failed", "refresh failure summary");
    assertNoSecrets(`${result.stdout}\n${result.stderr}`, "refresh failure output");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  print("OK", "Watcher reports Mac Unattended refresh failure without skipping heartbeat");
}

function checkBlockedStatus(args) {
  const tmp = mkdtempSync(join(tmpdir(), "lan-dual-watch-heartbeat-"));
  try {
    const heartbeat = makeFakeHeartbeat(tmp, "blocked");
    const fakeLink = makeFakeCodexLink(tmp);
    const result = run(["--once", "--sendStatus", "--json"], args, {
      LAN_DUAL_MAC_HEARTBEAT_SCRIPT: heartbeat,
      LAN_DUAL_CODEX_LINK_CLIENT: fakeLink.path,
    });
    const payload = parseJson(result.stdout, "blocked JSON");
    assert(result.status !== 0, "blocked watcher should exit non-zero");
    assert(payload.ok === false, "blocked payload should be ok=false");
    assert(payload.last.reportStatus === "blocked", "blocked report status should be preserved");
    assert(payload.last.posted === true, "blocked status should still be posted");
    const calls = readJsonl(fakeLink.logPath);
    const argv = calls[0].join(" ");
    assertIncludes(argv, "--status blocked", "blocked codex-link argv");
    assertIncludes(argv, "reason=codex-reconnect-stuck", "blocked codex-link argv");
    assertNoSecrets(`${result.stdout}\n${result.stderr}\n${argv}`, "blocked output");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  print("OK", "Watcher posts blocked heartbeat and exits non-zero for one-shot checks");
}

function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  checkOnceNoPost(args);
  checkSendStatus(args);
  checkRefreshUnattended(args);
  checkRefreshUnattendedFailure(args);
  checkBlockedStatus(args);
  print("OK", "Mac heartbeat watcher self-test passed");
}

try {
  main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
}
