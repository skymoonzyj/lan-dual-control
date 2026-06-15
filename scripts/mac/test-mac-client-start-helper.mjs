#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/mac/start-mac-client.mjs";

const defaults = {
  timeoutMs: 15000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-client-start-helper.mjs [options]

Options:
  --timeoutMs <ms>  Per check timeout. Default: ${defaults.timeoutMs}
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

function run(args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: options.timeoutMs || defaults.timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
      ...(options.env || {}),
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

async function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

function waitForHttp(port, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolveWait, rejectWait) => {
    const attempt = () => {
      const result = spawnSync(process.execPath, [
        "--input-type=module",
        "-e",
        `const r=await fetch("http://127.0.0.1:${port}/"); if(!r.ok) process.exit(1);`,
      ], {
        encoding: "utf8",
        timeout: 2000,
      });
      if (result.status === 0) {
        resolveWait();
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        rejectWait(new Error(`HTTP server on ${port} did not become ready`));
        return;
      }
      setTimeout(attempt, 100);
    };
    attempt();
  });
}

function checkHelp(args) {
  for (const flag of ["--help", "-h"]) {
    const result = run([flag], { timeoutMs: args.timeoutMs });
    assert(result.status === 0, `${script} ${flag} should exit 0`);
    assertIncludes(result.stdout, "Usage:", `${script} ${flag}`);
    assertIncludes(result.stdout, "--status", `${script} ${flag}`);
    assertNotIncludes(result.stdout, "password:", `${script} ${flag}`);
  }
  print("OK", "Mac client start helper help exits quickly");
}

async function checkOfflineStatus(args) {
  const port = await getFreePort();
  const result = run(["--status", "--json", "--port", String(port), "--timeoutMs", "1200"], {
    timeoutMs: args.timeoutMs,
  });
  const payload = parseJson(result.stdout, "offline status JSON");
  assert(result.status !== 0, "offline status should fail");
  assert(payload.ok === false, "offline payload should be ok=false");
  assert(payload.online === false, "offline payload should be online=false");
  assertIncludes(payload.boardSummary || "", "Mac client page offline", "offline board summary");
  assertNotIncludes(`${result.stdout}\n${result.stderr}`, "LAN_DUAL_PASSWORD", "offline status");
  print("OK", "Offline status reports machine-readable JSON without secrets");
}

async function checkStartAndExisting(args) {
  const port = await getFreePort();
  const start = run(["--json", "--port", String(port), "--timeoutMs", String(args.timeoutMs)], {
    timeoutMs: args.timeoutMs + 3000,
  });
  const started = parseJson(start.stdout, "start JSON");
  assert(start.status === 0, `start should pass.\n${start.stdout}\n${start.stderr}`);
  assert(started.ok === true, "started payload should be ok=true");
  assert(started.online === true, "started payload should be online=true");
  assert(started.processId, "started payload should include processId");
  assertIncludes(started.boardSummary || "", "Mac client page online", "start board summary");
  assertNotIncludes(`${start.stdout}\n${start.stderr}`, "demo-password", "start output");

  try {
    await waitForHttp(port, args.timeoutMs);

    const status = run(["--status", "--json", "--port", String(port), "--timeoutMs", "1200"], {
      timeoutMs: args.timeoutMs,
    });
    const statusPayload = parseJson(status.stdout, "online status JSON");
    assert(status.status === 0, "online status should pass");
    assert(statusPayload.ok === true, "online status should be ok=true");
    assert(statusPayload.online === true, "online status should be online=true");

    const duplicate = run(["--json", "--port", String(port), "--timeoutMs", "1200"], {
      timeoutMs: args.timeoutMs,
    });
    const duplicatePayload = parseJson(duplicate.stdout, "duplicate start JSON");
    assert(duplicate.status !== 0, "duplicate start should fail without --allowExisting");
    assertIncludes(duplicatePayload.error?.message || "", "already running", "duplicate start");

    const allowed = run(["--json", "--allowExisting", "--port", String(port), "--timeoutMs", "1200"], {
      timeoutMs: args.timeoutMs,
    });
    const allowedPayload = parseJson(allowed.stdout, "allow existing JSON");
    assert(allowed.status === 0, "allow existing should pass");
    assert(allowedPayload.ok === true, "allow existing payload should be ok=true");
    assert(allowedPayload.processId === null, "allow existing should not claim a new process id");
  } finally {
    if (started.processId) {
      try {
        process.kill(started.processId, "SIGTERM");
      } catch {
        // Already gone.
      }
    }
  }
  print("OK", "Start helper launches, reports status, and handles existing server safely");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  checkHelp(args);
  await checkOfflineStatus(args);
  await checkStartAndExisting(args);
  print("OK", "Mac client start helper self-test passed");
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
