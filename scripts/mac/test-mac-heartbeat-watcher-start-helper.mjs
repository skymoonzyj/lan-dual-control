#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/start-mac-heartbeat-watcher.mjs";

const defaults = {
  timeoutMs: 15000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-heartbeat-watcher-start-helper.mjs [options]

Verifies the Mac heartbeat watcher start/status/stop helper with a fake
watcher child process. It does not contact a real Agent Link Board,
authenticate, request passwords, send input, or inject.

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

function run(extraArgs, args, env = {}) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: args.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "super-secret-heartbeat",
      ...env,
    },
  });
}

function assertNoSecrets(result, label) {
  const text = `${result.stdout}\n${result.stderr}`;
  assertNotIncludes(text, "super-secret-heartbeat", label);
  assertNotIncludes(text, "fake-board-token", label);
  assertNotIncludes(text, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(text, "--password", label);
}

function makeFakeWatcher(tmp) {
  const path = join(tmp, "fake-watch-mac-heartbeat.mjs");
  const argvLog = join(tmp, "watcher-argv.jsonl");
  writeFileSync(path, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(argvLog)}, JSON.stringify(process.argv.slice(2)) + "\\n");
console.log("Mac heartbeat watch: run=1 status=ok reason=ok post=posted");
console.log("MacHeartbeat=status=ok; checkedAt=2026-06-18T10:00:00.000Z; device=Mac; codex=ok status=idle updatedAt=2026-06-18T09:59:59.000Z ageMs=1000; macHost=online 127.0.0.1:43770 build=fake inputMode=log; macClient=online http://127.0.0.1:5188/; board=ok boardUpdatedAt=2026-06-18T09:59:59.000Z call=done; blockers=none warnings=none reason=ok. suggestedAction=none No password was requested or sent; no WebSocket auth/input/inject was attempted.");
process.on("SIGTERM", () => process.exit(0));
setInterval(() => {}, 1000);
`);
  return { path, argvLog };
}

function pathsFor(tmp) {
  return {
    pidFile: join(tmp, "watcher.pid"),
    metaFile: join(tmp, "watcher.json"),
    outLog: join(tmp, "watcher.out.log"),
    errLog: join(tmp, "watcher.err.log"),
    stateFile: join(tmp, "state.json"),
  };
}

function commonArgs(paths) {
  return [
    "--pidFile",
    paths.pidFile,
    "--metaFile",
    paths.metaFile,
    "--outLog",
    paths.outLog,
    "--errLog",
    paths.errLog,
    "--stateFile",
    paths.stateFile,
    "--server",
    "http://fake-board-token.invalid:17888",
    "--intervalMs",
    "1234",
    "--timeoutMs",
    "1200",
  ];
}

function readWatcherArgv(path) {
  return readFileSync(path, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function assertStartedPayload(payload, label) {
  assert(payload.ok === true, `${label} should be ok`);
  assert(payload.running === true, `${label} should be running`);
  assert(Number.isInteger(payload.pid) && payload.pid > 0, `${label} should include child pid`);
  assert(payload.watcher?.device === "Mac Heartbeat", `${label} should use Mac Heartbeat device`);
  assert(payload.watcher?.role === "Mac watchdog", `${label} should use Mac watchdog role`);
  assert(payload.watcher?.intervalMs === 1234, `${label} should preserve interval`);
  assert(payload.lastHeartbeat?.heartbeat?.found === true, `${label} should include the last heartbeat summary from stdout`);
  assert(payload.lastHeartbeat?.heartbeat?.status === "ok", `${label} should include last heartbeat status`);
  assert(payload.lastHeartbeat?.heartbeat?.checkedAt === "2026-06-18T10:00:00.000Z", `${label} should include last heartbeat checkedAt`);
  assert(payload.lastHeartbeat?.heartbeat?.reason === "ok", `${label} should include last heartbeat reason`);
  assert(payload.lastHeartbeat?.heartbeat?.codexAgeMs === "1000", `${label} should include last heartbeat Codex age`);
  assert(payload.lastHeartbeat?.watcherRun?.post === "posted", `${label} should include last watcher post result`);
  assertIncludes(payload.commands?.status || "", "start-mac-heartbeat-watcher.mjs --status --boardSummary", `${label} status command`);
  assertIncludes(payload.commands?.stop || "", "start-mac-heartbeat-watcher.mjs --stop --boardSummary", `${label} stop command`);
  assertIncludes(payload.commands?.once || "", "watch-mac-heartbeat.mjs --once --sendStatus --boardSummary", `${label} once command`);
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag], args);
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assertIncludes(result.stdout, "Usage:", `${script} ${flag}`);
    assertIncludes(result.stdout, "--status", `${script} ${flag}`);
    assertIncludes(result.stdout, "--stop", `${script} ${flag}`);
    assertIncludes(result.stdout, "Mac Heartbeat", `${script} ${flag}`);
    assertNoSecrets(result, `${script} ${flag}`);
  }
  print("OK", "Mac heartbeat watcher start helper help exits quickly");
}

function checkStatusNotRunning(args) {
  const tmp = mkdtempSync(join(tmpdir(), "lan-dual-heartbeat-start-"));
  try {
    const paths = pathsFor(tmp);
    const result = run(["--status", "--json", ...commonArgs(paths)], args);
    const payload = parseJson(result.stdout, "not-running status JSON");
    assert(result.status === 0, `status should pass.\n${result.stdout}\n${result.stderr}`);
    assert(payload.ok === true, "status payload should be ok");
    assert(payload.running === false, "status payload should be not running");
    assertIncludes(payload.commands?.start || "", "start-mac-heartbeat-watcher.mjs --boardSummary", "status start command");
    assertNoSecrets(result, "not-running status");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  print("OK", "Status reports not-running without side effects");
}

function checkStartStatusStop(args) {
  const tmp = mkdtempSync(join(tmpdir(), "lan-dual-heartbeat-start-"));
  const fake = makeFakeWatcher(tmp);
  const paths = pathsFor(tmp);
  const env = {
    LAN_DUAL_MAC_HEARTBEAT_WATCHER_SCRIPT: fake.path,
  };
  try {
    const start = run(["--json", ...commonArgs(paths)], args, env);
    const startPayload = parseJson(start.stdout, "start JSON");
    assert(start.status === 0, `start should pass.\n${start.stdout}\n${start.stderr}`);
    assertStartedPayload(startPayload, "start JSON");
    assert(existsSync(paths.pidFile), "start should write pid file");
    assert(existsSync(paths.metaFile), "start should write metadata file");
    assertNoSecrets(start, "start output");

    const argv = readWatcherArgv(fake.argvLog)[0].join(" ");
    assertIncludes(argv, "--sendStatus", "fake watcher argv");
    assertIncludes(argv, "--intervalMs 1234", "fake watcher argv");
    assertIncludes(argv, "--stateFile", "fake watcher argv");
    assertNotIncludes(argv, "Mac Codex", "fake watcher argv should not mask Mac Codex freshness");
    assertNotIncludes(argv, "--password", "fake watcher argv");

    const status = run(["--status", "--json", ...commonArgs(paths)], args, env);
    const statusPayload = parseJson(status.stdout, "running status JSON");
    assert(status.status === 0, `running status should pass.\n${status.stdout}\n${status.stderr}`);
    assert(statusPayload.running === true, "running status should report running");
    assert(statusPayload.pid === startPayload.pid, "running status should report same pid");
    assert(statusPayload.lastHeartbeat?.heartbeat?.checkedAt === "2026-06-18T10:00:00.000Z", "running status should expose last heartbeat checkedAt");
    assert(statusPayload.lastHeartbeat?.watcherRun?.post === "posted", "running status should expose last watcher post result");
    assertNoSecrets(status, "running status output");

    const boardSummary = run(["--status", "--boardSummary", ...commonArgs(paths)], args, env);
    assert(boardSummary.status === 0, `boardSummary status should pass.\n${boardSummary.stdout}\n${boardSummary.stderr}`);
    const summary = String(boardSummary.stdout || "").trim();
    assert(!summary.includes("\n"), "boardSummary should be one line");
    assertIncludes(summary, "Mac heartbeat watcher:", "boardSummary");
    assertIncludes(summary, "device=Mac Heartbeat", "boardSummary");
    assertIncludes(summary, "lastHeartbeat=status=ok checkedAt=2026-06-18T10:00:00.000Z reason=ok codexAgeMs=1000", "boardSummary");
    assertIncludes(summary, "lastRun=1 post=posted", "boardSummary");
    assertIncludes(summary, "Status=node scripts/mac/start-mac-heartbeat-watcher.mjs --status --boardSummary", "boardSummary");
    assertIncludes(summary, "No password was requested or sent", "boardSummary");
    assertNoSecrets(boardSummary, "boardSummary output");

    const stop = run(["--stop", "--json", ...commonArgs(paths)], args, env);
    const stopPayload = parseJson(stop.stdout, "stop JSON");
    assert(stop.status === 0, `stop should pass.\n${stop.stdout}\n${stop.stderr}`);
    assert(stopPayload.ok === true, "stop payload should be ok");
    assert(stopPayload.running === false, "stop payload should not be running");
    assert(stopPayload.stopped === true, "stop payload should report stopped=true");
    assert(!existsSync(paths.pidFile), "stop should remove pid file");
    assertNoSecrets(stop, "stop output");
  } finally {
    run(["--stop", ...commonArgs(paths)], args, env);
    rmSync(tmp, { recursive: true, force: true });
  }
  print("OK", "Start/status/boardSummary/stop lifecycle works with a fake watcher");
}

function checkRestart(args) {
  const tmp = mkdtempSync(join(tmpdir(), "lan-dual-heartbeat-start-"));
  const fake = makeFakeWatcher(tmp);
  const paths = pathsFor(tmp);
  const env = {
    LAN_DUAL_MAC_HEARTBEAT_WATCHER_SCRIPT: fake.path,
  };
  try {
    const first = run(["--json", ...commonArgs(paths)], args, env);
    const firstPayload = parseJson(first.stdout, "first start JSON");
    assertStartedPayload(firstPayload, "first start JSON");
    const restart = run(["--restart", "--json", ...commonArgs(paths)], args, env);
    const restartPayload = parseJson(restart.stdout, "restart JSON");
    assert(restart.status === 0, `restart should pass.\n${restart.stdout}\n${restart.stderr}`);
    assertStartedPayload(restartPayload, "restart JSON");
    assert(restartPayload.action === "restart", "restart payload should use action=restart");
    assert(restartPayload.pid !== firstPayload.pid, "restart should replace the watcher process");
    const stop = run(["--stop", "--json", ...commonArgs(paths)], args, env);
    assert(stop.status === 0, `stop after restart should pass.\n${stop.stdout}\n${stop.stderr}`);
    assertNoSecrets(restart, "restart output");
  } finally {
    run(["--stop", ...commonArgs(paths)], args, env);
    rmSync(tmp, { recursive: true, force: true });
  }
  print("OK", "Restart replaces the managed heartbeat watcher");
}

function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  checkStatusNotRunning(args);
  checkStartStatusStop(args);
  checkRestart(args);
  print("OK", "Mac heartbeat watcher start helper self-test passed");
}

try {
  main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
}
