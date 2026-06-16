import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const helperScript = "scripts/windows/start-windows-host.mjs";

const defaults = {
  timeoutMs: 12000,
};

function parseArgs(argv) {
  const args = { ...defaults };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "-h") {
      args.help = true;
      continue;
    }
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
  args.timeoutMs = Math.max(3000, Number(args.timeoutMs) || defaults.timeoutMs);
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/windows/test-windows-host-start-helper.mjs [options]

Options:
  --timeoutMs <ms>  Per-step timeout. Default: 12000
  --help, -h        Show this help without running the start-helper self-test
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
    windowsHide: true,
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
    return JSON.parse(String(text || "").trim());
  } catch (error) {
    throw new Error(`${label} did not produce valid JSON: ${error.message}\nOutput:\n${text}`);
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
    env: {
      LAN_DUAL_PASSWORD: "test-password",
      LAN_DUAL_BUILD_ID: "start-helper-test",
    },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(`Dry run with env password failed.\n${output}`);
  }
  assertIncludes(output, "Dry run finished", "dry run with env password");
  assertIncludes(output, "Build ID: start-helper-test", "dry run with env password");
  assertNotIncludes(output, "demo password", "dry run with env password");
  print("OK", "Environment password allows dry run without demo warning");
}

async function assertDryRunWgcH264BridgeOptions(timeoutMs) {
  const result = await runNode([
    "--requirePassword",
    "--dryRun",
    "--screenMode",
    "wgc",
    "--h264Encoder",
    "h264_nvenc",
    "--wgcHelper",
    "C:\\DevTools\\lan-dual-wgc-helper.exe",
    "--wgcH264Bridge",
    "--wgcH264Source",
    "nv12",
    "--wgcRepeatLastFrame",
    "--wgcRepeatLastFrameMode",
    "full",
  ], {
    timeoutMs,
    env: {
      LAN_DUAL_PASSWORD: "test-password",
      LAN_DUAL_BUILD_ID: "start-helper-wgc-bridge-test",
    },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(`WGC H.264 bridge dry run failed.\n${output}`);
  }
  assertIncludes(output, "Screen mode: wgc", "WGC H.264 bridge dry run");
  assertIncludes(output, "H.264 encoder: h264_nvenc", "WGC H.264 bridge dry run");
  assertIncludes(output, "WGC helper: C:\\DevTools\\lan-dual-wgc-helper.exe", "WGC H.264 bridge dry run");
  assertIncludes(output, "WGC H.264 bridge: enabled", "WGC H.264 bridge dry run");
  assertIncludes(output, "WGC H.264 source: nv12", "WGC H.264 bridge dry run");
  assertIncludes(output, "WGC repeat-last-frame: full", "WGC H.264 bridge dry run");
  print("OK", "Dry run shows WGC H.264 bridge launch options");
}

async function assertStatusOfflineNeedsNoPassword(timeoutMs) {
  const port = await getFreePort();
  const result = await runNode(["--status", "--host", "127.0.0.1", "--port", String(port), "--requirePassword"], {
    timeoutMs,
    env: { LAN_DUAL_PASSWORD: "" },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode === 0 || result.timedOut) {
    throw new Error(`Offline status check should fail quickly without starting host.\n${output}`);
  }
  assertIncludes(output, "Windows host status probe", "offline status");
  assertIncludes(output, "/discovery offline", "offline status");
  assertIncludes(output, "Start safely", "offline status");
  assertNotIncludes(output, "LAN_DUAL_PASSWORD is required", "offline status");
  assertNotIncludes(output, "Starting Windows host", "offline status");
  assertNotIncludes(output, "at printStatus", "offline status");

  const jsonResult = await runNode(["--status", "--json", "--host", "127.0.0.1", "--port", String(port), "--requirePassword"], {
    timeoutMs,
    env: { LAN_DUAL_PASSWORD: "" },
  });
  const jsonOutput = `${jsonResult.stdout}\n${jsonResult.stderr}`;
  if (jsonResult.exitCode === 0 || jsonResult.timedOut) {
    throw new Error(`Offline JSON status check should fail quickly without starting host.\n${jsonOutput}`);
  }
  const parsed = parseJsonOutput(jsonResult.stdout, "offline JSON status");
  if (parsed.ok !== false || parsed.probe?.port !== port || !parsed.error?.message) {
    throw new Error(`Offline JSON status did not include expected failure shape.\n${jsonResult.stdout}`);
  }
  if (!Array.isArray(parsed.suggestions) || parsed.suggestions.length < 2) {
    throw new Error(`Offline JSON status did not include startup suggestions.\n${jsonResult.stdout}`);
  }
  assertNotIncludes(jsonOutput, "[INFO]", "offline JSON status");
  assertNotIncludes(jsonOutput, "LAN_DUAL_PASSWORD is required", "offline JSON status");

  const boardResult = await runNode(["--status", "--boardSummary", "--host", "127.0.0.1", "--port", String(port), "--requirePassword"], {
    timeoutMs,
    env: { LAN_DUAL_PASSWORD: "" },
  });
  const boardOutput = `${boardResult.stdout}\n${boardResult.stderr}`;
  if (boardResult.exitCode === 0 || boardResult.timedOut) {
    throw new Error(`Offline board summary status check should fail quickly without starting host.\n${boardOutput}`);
  }
  assertIncludes(boardResult.stdout, "Windows host readiness: offline", "offline board summary");
  assertIncludes(boardResult.stdout, "start safely", "offline board summary");
  assertIncludes(boardResult.stdout, "Do not send passwords", "offline board summary");
  assertNotIncludes(boardOutput, "LAN_DUAL_PASSWORD is required", "offline board summary");
  print("OK", "Status mode reports offline host without requiring a password");
}

async function assertStatusOnlineWithTempHost(timeoutMs) {
  const port = await getFreePort();
  const runtimeBuildId = "status-helper-test-old-build";
  const child = spawn(process.execPath, [
    helperScript,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--screenMode",
    "mock",
    "--inputMode",
    "log",
    "--buildId",
    runtimeBuildId,
    "--requirePassword",
    "--skipFirewallCheck",
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "test-password",
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  let ready = false;
  let settled = false;
  await new Promise((resolveLaunch, rejectLaunch) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      rejectLaunch(new Error(`Status temp host did not become ready in time.\n${output}`));
    }, timeoutMs);

    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (error) {
        rejectLaunch(error);
      } else {
        resolveLaunch();
      }
    };

    const runStatus = async () => {
      const result = await runNode(["--status", "--host", "127.0.0.1", "--port", String(port)], {
        timeoutMs,
        env: { LAN_DUAL_PASSWORD: "" },
      });
      const statusOutput = `${result.stdout}\n${result.stderr}`;
      try {
        if (result.exitCode !== 0 || result.timedOut) {
          throw new Error(`Online status check failed.\n${statusOutput}\nHost output:\n${output}`);
        }
        assertIncludes(statusOutput, "/discovery online", "online status");
        assertIncludes(statusOutput, `build=${runtimeBuildId}`, "online status");
        assertIncludes(statusOutput, "Screen:", "online status");
        assertIncludes(statusOutput, "Audio:", "online status");
        assertIncludes(statusOutput, "Input:", "online status");
        assertIncludes(statusOutput, "Clipboard:", "online status");
        assertIncludes(statusOutput, "Mac formal checklist command:", "online status");
        assertIncludes(statusOutput, "check-mac-client-formal-status.mjs", "online status");
        assertIncludes(statusOutput, "Mac formal send-call command:", "online status");
        assertIncludes(statusOutput, "--sendCall", "online status");
        assertIncludes(statusOutput, "differs from current git", "online status");
        assertIncludes(statusOutput, "Could not inspect Windows host runtime changes", "online status");
        assertNotIncludes(statusOutput, "test-password", "online status");

        const jsonResult = await runNode(["--status", "--json", "--host", "127.0.0.1", "--port", String(port)], {
          timeoutMs,
          env: { LAN_DUAL_PASSWORD: "" },
        });
        const jsonOutput = `${jsonResult.stdout}\n${jsonResult.stderr}`;
        if (jsonResult.exitCode !== 0 || jsonResult.timedOut) {
          throw new Error(`Online JSON status check failed.\n${jsonOutput}\nHost output:\n${output}`);
        }
        const parsed = parseJsonOutput(jsonResult.stdout, "online JSON status");
        if (parsed.ok !== true || parsed.runtime?.buildId !== runtimeBuildId) {
          throw new Error(`Online JSON status did not include expected runtime build.\n${jsonResult.stdout}`);
        }
        if (!parsed.capabilities?.screen || !parsed.capabilities?.audio || !parsed.capabilities?.input || !parsed.capabilities?.clipboard) {
          throw new Error(`Online JSON status did not include expected capability groups.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("Windows host readiness: online") || !String(parsed.boardSummary || "").includes("Do not send passwords")) {
          throw new Error(`Online JSON status did not include expected board summary.\n${jsonResult.stdout}`);
        }
        if (!Array.isArray(parsed.macClientReadinessCommands) || parsed.macClientReadinessCommands.length < 1) {
          throw new Error(`Online JSON status did not include Mac client readiness commands.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.macClientReadinessCommands[0].command || "").includes("check-mac-client-readiness.mjs")) {
          throw new Error(`Online JSON status did not include expected Mac readiness command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.macClientReadinessCommands[0].formalCommand || "").includes("check-mac-client-formal-status.mjs")) {
          throw new Error(`Online JSON status did not include expected Mac formal checklist command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.macClientReadinessCommands[0].sendCallCommand || "").includes("--sendCall")) {
          throw new Error(`Online JSON status did not include expected Mac formal send-call command.\n${jsonResult.stdout}`);
        }
        if (parsed.buildDiff?.checked !== false || !String(parsed.buildDiff?.message || "").includes("Could not inspect")) {
          throw new Error(`Online JSON status did not include expected uninspectable build diff.\n${jsonResult.stdout}`);
        }
        assertNotIncludes(jsonOutput, "[INFO]", "online JSON status");
        assertNotIncludes(jsonOutput, "test-password", "online JSON status");

        const boardResult = await runNode(["--status", "--boardSummary", "--host", "127.0.0.1", "--port", String(port)], {
          timeoutMs,
          env: { LAN_DUAL_PASSWORD: "" },
        });
        const boardOutput = `${boardResult.stdout}\n${boardResult.stderr}`;
        if (boardResult.exitCode !== 0 || boardResult.timedOut) {
          throw new Error(`Online board summary status check failed.\n${boardOutput}\nHost output:\n${output}`);
        }
        assertIncludes(boardResult.stdout, "Windows host readiness: online", "online board summary");
        assertIncludes(boardResult.stdout, "check-mac-client-readiness.mjs", "online board summary");
        assertIncludes(boardResult.stdout, "check-mac-client-formal-status.mjs", "online board summary");
        assertIncludes(boardResult.stdout, "--sendCall", "online board summary");
        assertIncludes(boardResult.stdout, "Do not send passwords", "online board summary");
        assertNotIncludes(boardOutput, "test-password", "online board summary");
        finish();
      } catch (error) {
        finish(error);
      }
    };

    const onData = (chunk) => {
      output += String(chunk);
      if (!ready && output.includes("Windows host is running")) {
        ready = true;
        void runStatus();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (error) => {
      finish(error);
    });
    child.on("exit", (code, signal) => {
      if (!settled && !ready) {
        finish(new Error(`Status temp host exited before ready: code=${code} signal=${signal || ""}\n${output}`));
      }
    });
  });
  print("OK", `Status mode reads temporary Windows host on port ${port} without printing secrets`);
}

async function assertLaunchWithEnvPassword(timeoutMs) {
  const port = await getFreePort();
  const child = spawn(process.execPath, [
    helperScript,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--screenMode",
    "mock",
    "--inputMode",
    "log",
    "--requirePassword",
    "--dryRunFirewallRule",
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "test-password",
    },
    windowsHide: true,
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
      if (!ready && output.includes("Windows host is running")) {
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
      if (!output.includes("Dry run firewall rule command")) {
        rejectLaunch(new Error(`Start helper did not print dry-run firewall rule command.\n${output}`));
        return;
      }
      if (!output.includes("Mac readiness command:") || !output.includes("check-mac-client-readiness.mjs")) {
        rejectLaunch(new Error(`Start helper did not print Mac readiness command.\n${output}`));
        return;
      }
      if (!output.includes("Mac formal checklist command:") || !output.includes("check-mac-client-formal-status.mjs")) {
        rejectLaunch(new Error(`Start helper did not print Mac formal checklist command.\n${output}`));
        return;
      }
      if (!output.includes("Mac formal send-call command:") || !output.includes("--sendCall")) {
        rejectLaunch(new Error(`Start helper did not print Mac formal send-call command.\n${output}`));
        return;
      }
      if (!output.includes("Agent Link Board summary:") || !output.includes("Do not send passwords")) {
        rejectLaunch(new Error(`Start helper did not print secret-safe board summary.\n${output}`));
        return;
      }
      resolveLaunch();
    });
  });
  print("OK", `Environment password starts Windows host on temporary port ${port} with firewall dry run`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  await assertMissingPasswordFails(args.timeoutMs);
  await assertPromptPasswordFailsWithoutTty(args.timeoutMs);
  await assertDryRunWithEnvPassword(args.timeoutMs);
  await assertDryRunWgcH264BridgeOptions(args.timeoutMs);
  await assertStatusOfflineNeedsNoPassword(args.timeoutMs);
  await assertStatusOnlineWithTempHost(args.timeoutMs);
  await assertLaunchWithEnvPassword(args.timeoutMs);
  print("OK", "Windows host start helper self-test passed");
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`);
  process.exitCode = 1;
});
