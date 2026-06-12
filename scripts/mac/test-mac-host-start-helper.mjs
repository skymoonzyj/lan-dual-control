#!/usr/bin/env node
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const helperScript = "scripts/mac/start-mac-host.mjs";

const defaults = {
  timeoutMs: 30000,
};

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (key === "help" || key === "h") {
      args.help = true;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(args, key) && next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    }
  }
  args.timeoutMs = Math.max(5000, Number(args.timeoutMs) || defaults.timeoutMs);
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/mac/test-mac-host-start-helper.mjs [options]

Options:
  --timeoutMs <ms>  Per-step timeout. Default: 30000
`);
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function runNode(args, options = {}) {
  return run(process.execPath, [helperScript, ...args], options);
}

function run(command, commandArgs, options = {}) {
  const child = spawn(command, commandArgs, {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  return new Promise((resolveRun) => {
    const timer = setTimeout(() => {
      child.kill();
      resolveRun({
        exitCode: null,
        timedOut: true,
        stdout,
        stderr,
      });
    }, options.timeoutMs || defaults.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({
        exitCode: null,
        timedOut: false,
        stdout,
        stderr: `${stderr}\n${error.message}`,
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveRun({
        exitCode,
        timedOut: false,
        stdout,
        stderr,
      });
    });
  });
}

function assertIncludes(text, expected, label) {
  if (!String(text).includes(expected)) {
    throw new Error(`${label} did not include ${JSON.stringify(expected)}.\nOutput:\n${text}`);
  }
}

function assertNotIncludes(text, expected, label) {
  if (String(text).includes(expected)) {
    throw new Error(`${label} unexpectedly included ${JSON.stringify(expected)}.\nOutput:\n${text}`);
  }
}

async function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = net.createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

async function assertMissingPasswordFails(timeoutMs) {
  const result = await runNode(["--requirePassword", "--dryRun"], {
    timeoutMs,
    env: { LAN_DUAL_PASSWORD: "" },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode === 0 || result.timedOut) {
    throw new Error(`Missing password check should fail.\n${output}`);
  }
  assertIncludes(output, "LAN_DUAL_PASSWORD is required", "missing password failure");
  assertNotIncludes(output, "at preparePassword", "missing password failure");
  print("OK", "Missing password is rejected without a stack trace");
}

async function assertDemoPasswordFails(timeoutMs) {
  const result = await runNode(["--requirePassword", "--dryRun"], {
    timeoutMs,
    env: { LAN_DUAL_PASSWORD: "demo-password" },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode === 0 || result.timedOut) {
    throw new Error(`Demo password check should fail.\n${output}`);
  }
  assertIncludes(output, "Refusing to start with demo-password", "demo password failure");
  print("OK", "Demo password is rejected when --requirePassword is used");
}

async function assertPromptPasswordFailsWithoutTty(timeoutMs) {
  const result = await runNode(["--promptPassword", "--dryRun"], {
    timeoutMs,
    env: { LAN_DUAL_PASSWORD: "" },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode === 0 || result.timedOut) {
    throw new Error(`Non-interactive prompt password should fail.\n${output}`);
  }
  assertIncludes(output, "--promptPassword requires an interactive terminal", "non-interactive prompt failure");
  print("OK", "Password prompt refuses non-interactive terminals");
}

async function assertDryRunWithEnvPassword(timeoutMs) {
  const result = await runNode(["--requirePassword", "--dryRun"], {
    timeoutMs,
    env: { LAN_DUAL_PASSWORD: "test-password" },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(`Dry run with env password failed.\n${output}`);
  }
  assertIncludes(output, "Dry run finished", "dry run with env password");
  assertIncludes(output, "Input mode: log", "dry run with env password");
  assertNotIncludes(output, "demo password", "dry run with env password");
  print("OK", "Environment password allows dry run with safe log input mode");
}

async function assertLaunchWithEnvPassword(timeoutMs) {
  const port = await getFreePort();
  const child = spawn(process.execPath, [
    helperScript,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--videoMode",
    "mock",
    "--inputMode",
    "log",
    "--buildId",
    "start-helper-test",
    "--requirePassword",
    "--skipRuntimeCheck",
    "--noBonjour",
    "--timeoutMs",
    String(timeoutMs),
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "test-password",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  let ready = false;
  await new Promise((resolveLaunch, rejectLaunch) => {
    const timer = setTimeout(() => {
      child.kill();
      rejectLaunch(new Error(`Start helper did not become ready in time.\n${output}`));
    }, timeoutMs);

    const onData = (chunk) => {
      output += String(chunk);
      if (!ready && output.includes("Mac host is running")) {
        ready = true;
        child.kill();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectLaunch(error);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (!ready) {
        rejectLaunch(new Error(`Start helper exited before ready: code=${code} signal=${signal || ""}\n${output}`));
        return;
      }
      resolveLaunch();
    });
  });
  assertIncludes(output, "input=log", "temporary host discovery");
  assertIncludes(output, "build=start-helper-test", "temporary host discovery");
  print("OK", `Environment password starts Mac host on temporary port ${port}`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  await assertMissingPasswordFails(args.timeoutMs);
  await assertDemoPasswordFails(args.timeoutMs);
  await assertPromptPasswordFailsWithoutTty(args.timeoutMs);
  await assertDryRunWithEnvPassword(args.timeoutMs);
  await assertLaunchWithEnvPassword(args.timeoutMs);
  print("OK", "Mac host start helper self-test passed");
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`);
  process.exitCode = 1;
});
