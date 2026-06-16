#!/usr/bin/env node
import net from "node:net";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const helperScript = "scripts/mac/start-mac-host.mjs";

const defaults = {
  timeoutMs: 30000,
};

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

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
  --help, -h        Show this help without running checks
`);
}

function print(kind, text) {
  console.log(`[${kind}] ${text}`);
}

function canLaunchRealMacHost() {
  return process.platform === "darwin";
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

function parseJsonOutput(text, label) {
  try {
    return JSON.parse(String(text).trim());
  } catch (error) {
    throw new Error(`${label} did not print valid JSON: ${error.message}\nOutput:\n${text}`);
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
    env: { LAN_DUAL_PASSWORD: "", LAN_DUAL_DISABLE_PASSWORD_DIALOG: "1", LAN_DUAL_DISABLE_PASSWORD_BEEP: "1" },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode === 0 || result.timedOut) {
    throw new Error(`Non-interactive prompt password should fail.\n${output}`);
  }
  assertIncludes(output, "--promptPassword requires a macOS password dialog", "non-interactive prompt failure");
  print("OK", "Password prompt refuses non-interactive automation when dialog is disabled");
}

async function assertPromptPasswordIgnoresEnvAndStillRequiresDialog(timeoutMs) {
  const result = await runNode(["--promptPassword", "--dryRun"], {
    timeoutMs,
    env: {
      LAN_DUAL_PASSWORD: "existing-password",
      LAN_DUAL_DISABLE_PASSWORD_DIALOG: "1",
      LAN_DUAL_DISABLE_PASSWORD_BEEP: "1",
    },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode === 0 || result.timedOut) {
    throw new Error(`Prompt password should still require a visible dialog instead of reusing the environment password.\n${output}`);
  }
  assertIncludes(output, "--promptPassword requires a macOS password dialog", "prompt password env override failure");
  assertNotIncludes(output, "existing-password", "prompt password env override failure");
  print("OK", "Prompt password does not reuse an environment password when a visible dialog was requested");
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

async function assertEphemeralPasswordDryRun(timeoutMs) {
  const result = await runNode(["--ephemeralPassword", "--requirePassword", "--dryRun"], {
    timeoutMs,
    env: { LAN_DUAL_PASSWORD: "" },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(`Ephemeral password dry run failed.\n${output}`);
  }
  assertIncludes(output, "Password: ephemeral random value", "ephemeral password dry run");
  assertNotIncludes(output, "demo password", "ephemeral password dry run");
  assertNotIncludes(output, "ephemeral-", "ephemeral password dry run");
  print("OK", "Ephemeral password dry run avoids demo credentials and does not print the value");
}

async function assertEphemeralPasswordRefusesEnvOverride(timeoutMs) {
  const result = await runNode(["--ephemeralPassword", "--requirePassword", "--dryRun"], {
    timeoutMs,
    env: { LAN_DUAL_PASSWORD: "existing-password" },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode === 0 || result.timedOut) {
    throw new Error(`Ephemeral password should refuse to override an environment password.\n${output}`);
  }
  assertIncludes(output, "refuses to override an existing LAN_DUAL_PASSWORD", "ephemeral env override failure");
  print("OK", "Ephemeral password refuses to override an existing environment password");
}

async function assertStatusOffline(timeoutMs) {
  const port = await getFreePort();
  const result = await runNode(["--status", "--host", "127.0.0.1", "--port", String(port)], {
    timeoutMs,
    env: { LAN_DUAL_PASSWORD: "" },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode !== 1 || result.timedOut) {
    throw new Error(`Offline status should exit 1 without starting a host.\n${output}`);
  }
  assertIncludes(output, "/discovery offline", "offline status");
  assertIncludes(output, "start-mac-host.mjs --promptPassword --requirePassword", "offline status");
  assertNotIncludes(output, "Starting Mac host", "offline status");
  assertNotIncludes(output, "LAN_DUAL_PASSWORD is required", "offline status");
  print("OK", "Status reports offline hosts without starting or requiring a password");
}

async function assertStatusOfflineJson(timeoutMs) {
  const port = await getFreePort();
  const result = await runNode(["--status", "--json", "--host", "127.0.0.1", "--port", String(port)], {
    timeoutMs,
    env: { LAN_DUAL_PASSWORD: "" },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode !== 1 || result.timedOut) {
    throw new Error(`Offline JSON status should exit 1 without starting a host.\n${output}`);
  }
  const json = parseJsonOutput(result.stdout, "offline JSON status");
  if (json.online !== false || json.ok !== false || json.probe?.port !== port) {
    throw new Error(`Offline JSON status had unexpected shape.\n${result.stdout}`);
  }
  assertNotIncludes(output, "[INFO]", "offline JSON status");
  assertNotIncludes(output, "Starting Mac host", "offline JSON status");
  print("OK", "Status reports offline hosts as machine-readable JSON");
}

async function assertStopOffline(timeoutMs) {
  const port = await getFreePort();
  const result = await runNode(["--stop", "--host", "127.0.0.1", "--port", String(port)], {
    timeoutMs,
    env: { LAN_DUAL_PASSWORD: "" },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(`Offline stop should exit 0 without starting a host or requiring a password.\n${output}`);
  }
  assertIncludes(output, "nothing to stop", "offline stop");
  assertNotIncludes(output, "LAN_DUAL_PASSWORD is required", "offline stop");
  assertNotIncludes(output, "Starting Mac host", "offline stop");

  const jsonResult = await runNode(["--stop", "--json", "--host", "127.0.0.1", "--port", String(port)], {
    timeoutMs,
    env: { LAN_DUAL_PASSWORD: "" },
  });
  const jsonOutput = `${jsonResult.stdout}\n${jsonResult.stderr}`;
  if (jsonResult.exitCode !== 0 || jsonResult.timedOut) {
    throw new Error(`Offline JSON stop should exit 0.\n${jsonOutput}`);
  }
  const json = parseJsonOutput(jsonResult.stdout, "offline JSON stop");
  if (json.ok !== true || json.alreadyStopped !== true || json.stopped !== false || json.probe?.port !== port) {
    throw new Error(`Offline JSON stop had unexpected shape.\n${jsonResult.stdout}`);
  }
  assertNotIncludes(jsonOutput, "[INFO]", "offline JSON stop");
  print("OK", "Stop treats an offline Mac host as already stopped without reading a password");
}

async function assertStopRefusesNonLocalHost(timeoutMs) {
  const result = await runNode(["--stop", "--json", "--host", "192.0.2.55", "--port", "43770"], {
    timeoutMs,
    env: { LAN_DUAL_PASSWORD: "" },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode === 0 || result.timedOut) {
    throw new Error(`Stop should refuse non-local hosts.\n${output}`);
  }
  const json = parseJsonOutput(result.stdout, "non-local JSON stop");
  if (json.error?.code !== "non_local_host" || json.stopped !== false) {
    throw new Error(`Non-local JSON stop had unexpected shape.\n${result.stdout}`);
  }
  assertNotIncludes(output, "LAN_DUAL_PASSWORD is required", "non-local stop");
  print("OK", "Stop refuses non-local hosts before probing or requiring a password");
}

async function withMockDiscoveryServer(payload, fn) {
  const server = net.createServer((socket) => {
    socket.once("data", () => {
      const body = JSON.stringify(payload);
      socket.end([
        "HTTP/1.1 200 OK",
        "Content-Type: application/json",
        `Content-Length: ${Buffer.byteLength(body)}`,
        "Connection: close",
        "",
        body,
      ].join("\r\n"));
    });
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;
  try {
    return await fn(port);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

async function assertStopRefusesNonMacDiscovery(timeoutMs) {
  await withMockDiscoveryServer({
    type: "lan_dual_discovery",
    deviceName: "Mock Windows Host",
    platform: "windows",
    runtime: { processId: 987654, buildId: "mock-win" },
  }, async (port) => {
    const result = await runNode(["--stop", "--json", "--host", "127.0.0.1", "--port", String(port)], {
      timeoutMs,
      env: { LAN_DUAL_PASSWORD: "" },
    });
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode === 0 || result.timedOut) {
      throw new Error(`Stop should refuse non-Mac /discovery targets.\n${output}`);
    }
    const json = parseJsonOutput(result.stdout, "non-Mac JSON stop");
    if (json.error?.code !== "not_mac_host" || json.platform !== "windows" || json.stopped !== false) {
      throw new Error(`Non-Mac JSON stop had unexpected shape.\n${result.stdout}`);
    }
    assertNotIncludes(output, "LAN_DUAL_PASSWORD is required", "non-Mac stop");
  });
  print("OK", "Stop refuses non-macOS discovery targets");
}

async function assertStatusOnline(timeoutMs) {
  if (!canLaunchRealMacHost()) {
    print("SKIP", `Status online check starts the real Swift Mac host and only runs on macOS; current platform is ${process.platform}`);
    return;
  }
  const port = await getFreePort();
  const commandArgs = [
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
    "status-helper-test",
    "--requirePassword",
    "--skipRuntimeCheck",
    "--noBonjour",
    "--timeoutMs",
    String(timeoutMs),
  ];
  const child = spawn(process.execPath, commandArgs, {
    cwd: repoRoot,
    env: { ...process.env, LAN_DUAL_PASSWORD: "test-password" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  let ready = false;
  await new Promise((resolveLaunch, rejectLaunch) => {
    const timer = setTimeout(() => {
      child.kill();
      rejectLaunch(new Error(`Status test helper host did not become ready in time.\n${output}`));
    }, timeoutMs);
    const onData = (chunk) => {
      output += String(chunk);
      if (!ready && output.includes("Mac host is running")) {
        ready = true;
        clearTimeout(timer);
        resolveLaunch();
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
        rejectLaunch(new Error(`Status test helper host exited before ready: code=${code} signal=${signal || ""}\n${output}`));
      }
    });
  });

  try {
    const status = await runNode(["--status", "--host", "127.0.0.1", "--port", String(port)], {
      timeoutMs,
      env: { LAN_DUAL_PASSWORD: "" },
    });
    const statusOutput = `${status.stdout}\n${status.stderr}`;
    if (status.exitCode !== 0 || status.timedOut) {
      throw new Error(`Online status should exit 0.\n${statusOutput}`);
    }
    assertIncludes(statusOutput, "/discovery online", "online status");
    assertIncludes(statusOutput, "build=status-helper-test", "online status");
    assertIncludes(statusOutput, "Permissions:", "online status");
    assertIncludes(statusOutput, "Windows side can try", "online status");
    assertIncludes(statusOutput, "Displays:", "online status");
    assertIncludes(statusOutput, "Could not inspect Mac host runtime changes since status-helper-test", "online status");
    assertNotIncludes(statusOutput, "Starting Mac host", "online status");
    const jsonStatus = await runNode(["--status", "--json", "--host", "127.0.0.1", "--port", String(port)], {
      timeoutMs,
      env: { LAN_DUAL_PASSWORD: "" },
    });
    const jsonOutput = `${jsonStatus.stdout}\n${jsonStatus.stderr}`;
    if (jsonStatus.exitCode !== 0 || jsonStatus.timedOut) {
      throw new Error(`Online JSON status should exit 0.\n${jsonOutput}`);
    }
    const json = parseJsonOutput(jsonStatus.stdout, "online JSON status");
    if (json.online !== true || json.ok !== true || json.runtime?.buildId !== "status-helper-test") {
      throw new Error(`Online JSON status had unexpected runtime shape.\n${jsonStatus.stdout}`);
    }
    if (json.buildDiff?.comparable !== false || json.buildDiff?.fromBuildId !== "status-helper-test") {
      throw new Error(`Online JSON status had unexpected buildDiff shape.\n${jsonStatus.stdout}`);
    }
    if (!Array.isArray(json.lanAddresses)) {
      throw new Error(`Online JSON status should include lanAddresses array.\n${jsonStatus.stdout}`);
    }
    if (!Array.isArray(json.displays)) {
      throw new Error(`Online JSON status should include displays array.\n${jsonStatus.stdout}`);
    }
    if (json.displayCount !== json.displays.length) {
      throw new Error(`Online JSON status should keep displayCount aligned with displays length.\n${jsonStatus.stdout}`);
    }
    assertNotIncludes(jsonOutput, "[INFO]", "online JSON status");
    print("OK", `Status reports running Mac host on temporary port ${port}`);
  } finally {
    child.kill();
    await new Promise((resolveExit) => child.once("exit", resolveExit));
  }
}

async function assertLaunchWithPasswordMode(timeoutMs, mode) {
  if (!canLaunchRealMacHost()) {
    print("SKIP", `Real Swift Mac host launch (${mode}) only runs on macOS; current platform is ${process.platform}`);
    return;
  }
  const port = await getFreePort();
  const commandArgs = [
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
  ];
  const env = { ...process.env };
  if (mode === "ephemeral") {
    commandArgs.push("--ephemeralPassword");
    env.LAN_DUAL_PASSWORD = "";
  } else {
    env.LAN_DUAL_PASSWORD = "test-password";
  }
  const child = spawn(process.execPath, commandArgs, {
    cwd: repoRoot,
    env,
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
  if (mode === "ephemeral") {
    assertIncludes(output, "Password: ephemeral random value", "temporary host discovery");
    assertNotIncludes(output, "ephemeral-", "temporary host discovery");
    print("OK", `Ephemeral password starts Mac host on temporary port ${port}`);
  } else {
    print("OK", `Environment password starts Mac host on temporary port ${port}`);
  }
}

async function assertLaunchWithEnvPassword(timeoutMs) {
  await assertLaunchWithPasswordMode(timeoutMs, "env");
}

async function assertLaunchWithEphemeralPassword(timeoutMs) {
  await assertLaunchWithPasswordMode(timeoutMs, "ephemeral");
}

async function assertBackgroundLaunchWithEnvPassword(timeoutMs) {
  if (!canLaunchRealMacHost()) {
    print("SKIP", `Background Swift Mac host launch only runs on macOS; current platform is ${process.platform}`);
    return;
  }
  const port = await getFreePort();
  const logPath = `.dev-lab/test-mac-host-start-helper/background-${port}.log`;
  const result = await runNode([
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--videoMode",
    "mock",
    "--inputMode",
    "log",
    "--buildId",
    "background-helper-test",
    "--requirePassword",
    "--skipRuntimeCheck",
    "--noBonjour",
    "--background",
    "--logFile",
    logPath,
    "--timeoutMs",
    String(timeoutMs),
  ], {
    timeoutMs,
    env: { LAN_DUAL_PASSWORD: "test-password" },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(`Background launch should exit 0 after /discovery is ready.\n${output}`);
  }
  assertIncludes(output, "Background: enabled", "background launch");
  assertIncludes(output, "Mac host is running in background", "background launch");
  assertIncludes(output, `background-${port}.log`, "background launch");
  assertIncludes(output, "input=log", "background launch");
  assertIncludes(output, "build=background-helper-test", "background launch");

  const status = await runNode(["--status", "--json", "--host", "127.0.0.1", "--port", String(port)], {
    timeoutMs,
    env: { LAN_DUAL_PASSWORD: "" },
  });
  const statusOutput = `${status.stdout}\n${status.stderr}`;
  let pid = 0;
  try {
    if (status.exitCode !== 0 || status.timedOut) {
      throw new Error(`Background host status should exit 0.\n${statusOutput}`);
    }
    const json = parseJsonOutput(status.stdout, "background JSON status");
    pid = Number(json.runtime?.processId || 0);
    if (json.online !== true || json.runtime?.buildId !== "background-helper-test" || !pid) {
      throw new Error(`Background JSON status had unexpected runtime shape.\n${status.stdout}`);
    }
  } finally {
    if (pid) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Process may already be gone.
      }
    }
  }
  print("OK", `Background start keeps Mac host alive on temporary port ${port} until cleaned up`);
}

async function assertStopBackgroundHost(timeoutMs) {
  if (!canLaunchRealMacHost()) {
    print("SKIP", `Background stop check starts the real Swift Mac host and only runs on macOS; current platform is ${process.platform}`);
    return;
  }
  const port = await getFreePort();
  const logPath = `.dev-lab/test-mac-host-start-helper/stop-background-${port}.log`;
  const start = await runNode([
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--videoMode",
    "mock",
    "--inputMode",
    "log",
    "--buildId",
    "stop-helper-test",
    "--requirePassword",
    "--skipRuntimeCheck",
    "--noBonjour",
    "--background",
    "--logFile",
    logPath,
    "--timeoutMs",
    String(timeoutMs),
  ], {
    timeoutMs,
    env: { LAN_DUAL_PASSWORD: "test-password" },
  });
  const startOutput = `${start.stdout}\n${start.stderr}`;
  if (start.exitCode !== 0 || start.timedOut) {
    throw new Error(`Background launch before stop should exit 0.\n${startOutput}`);
  }

  let pid = 0;
  try {
    const status = await runNode(["--status", "--json", "--host", "127.0.0.1", "--port", String(port)], {
      timeoutMs,
      env: { LAN_DUAL_PASSWORD: "" },
    });
    const statusOutput = `${status.stdout}\n${status.stderr}`;
    if (status.exitCode !== 0 || status.timedOut) {
      throw new Error(`Background host status before stop should exit 0.\n${statusOutput}`);
    }
    const statusJson = parseJsonOutput(status.stdout, "background status before stop");
    pid = Number(statusJson.runtime?.processId || 0);
    if (statusJson.online !== true || statusJson.runtime?.buildId !== "stop-helper-test" || !pid) {
      throw new Error(`Background status before stop had unexpected shape.\n${status.stdout}`);
    }

    const stop = await runNode(["--stop", "--json", "--host", "127.0.0.1", "--port", String(port), "--timeoutMs", String(timeoutMs)], {
      timeoutMs,
      env: { LAN_DUAL_PASSWORD: "" },
    });
    const stopOutput = `${stop.stdout}\n${stop.stderr}`;
    if (stop.exitCode !== 0 || stop.timedOut) {
      throw new Error(`Stop background host should exit 0.\n${stopOutput}`);
    }
    const stopJson = parseJsonOutput(stop.stdout, "background JSON stop");
    if (stopJson.ok !== true || stopJson.stopped !== true || stopJson.targetPid !== pid || stopJson.runtime?.buildId !== "stop-helper-test") {
      throw new Error(`Background JSON stop had unexpected shape.\n${stop.stdout}`);
    }
    assertNotIncludes(stopOutput, "test-password", "background stop");

    const offline = await runNode(["--status", "--json", "--host", "127.0.0.1", "--port", String(port)], {
      timeoutMs,
      env: { LAN_DUAL_PASSWORD: "" },
    });
    const offlineOutput = `${offline.stdout}\n${offline.stderr}`;
    if (offline.exitCode !== 1 || offline.timedOut) {
      throw new Error(`Status after stop should report offline.\n${offlineOutput}`);
    }
    const offlineJson = parseJsonOutput(offline.stdout, "status after stop");
    if (offlineJson.online !== false) {
      throw new Error(`Status after stop should be offline.\n${offline.stdout}`);
    }
  } finally {
    if (pid) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Process should already be gone.
      }
    }
  }
  print("OK", `Stop safely terminates a background Mac host on temporary port ${port}`);
}

function assertRuntimeCheckDoesNotPassPasswordArgv() {
  const source = readFileSync(new URL("./start-mac-host.mjs", import.meta.url), "utf8");
  const runtimeCheckIndex = source.indexOf("function runRuntimeCheck");
  const spawnIndex = source.indexOf("spawnSync(process.execPath, commandArgs", runtimeCheckIndex);
  if (runtimeCheckIndex < 0 || spawnIndex < 0) {
    throw new Error("Could not locate runRuntimeCheck command construction in start-mac-host.mjs");
  }
  const window = source.slice(runtimeCheckIndex, spawnIndex);
  if (window.includes('"--password"') || window.includes("'--password'")) {
    throw new Error("start-mac-host runtime/display check must not pass the host password via argv.");
  }
  print("OK", "Runtime/display check keeps the host password out of child argv");
}

function assertBackgroundRequiresRuntimeCheckSuccess() {
  const source = readFileSync(new URL("./start-mac-host.mjs", import.meta.url), "utf8");
  const guardPattern = /!runtimeCheckPassed\s*&&\s*\(\s*args\.requireRuntimeCheck\s*\|\|\s*args\.background\s*\)/;
  if (!guardPattern.test(source)) {
    throw new Error("start-mac-host --background must stop and fail when the runtime/display check fails.");
  }
  print("OK", "Background start refuses to detach after a failed runtime/display check");
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);

  await assertMissingPasswordFails(args.timeoutMs);
  await assertDemoPasswordFails(args.timeoutMs);
  await assertPromptPasswordFailsWithoutTty(args.timeoutMs);
  await assertPromptPasswordIgnoresEnvAndStillRequiresDialog(args.timeoutMs);
  await assertDryRunWithEnvPassword(args.timeoutMs);
  await assertEphemeralPasswordDryRun(args.timeoutMs);
  await assertEphemeralPasswordRefusesEnvOverride(args.timeoutMs);
  await assertStatusOffline(args.timeoutMs);
  await assertStatusOfflineJson(args.timeoutMs);
  await assertStopOffline(args.timeoutMs);
  await assertStopRefusesNonLocalHost(args.timeoutMs);
  await assertStopRefusesNonMacDiscovery(args.timeoutMs);
  await assertStatusOnline(args.timeoutMs);
  await assertLaunchWithEnvPassword(args.timeoutMs);
  await assertLaunchWithEphemeralPassword(args.timeoutMs);
  await assertBackgroundLaunchWithEnvPassword(args.timeoutMs);
  await assertStopBackgroundHost(args.timeoutMs);
  assertRuntimeCheckDoesNotPassPasswordArgv();
  assertBackgroundRequiresRuntimeCheckSuccess();
  print("OK", "Mac host start helper self-test passed");
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`);
  process.exitCode = 1;
});
