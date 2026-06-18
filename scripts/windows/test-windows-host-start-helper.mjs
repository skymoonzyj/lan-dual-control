import net from "node:net";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const helperScript = "scripts/windows/start-windows-host.mjs";
const powershellWrapperScript = "scripts/windows/start-windows-host.ps1";

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

function runPowerShell(args, options = {}) {
  return run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    powershellWrapperScript,
    ...args,
  ], options);
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

async function startFakeBoard(state) {
  let requestCount = 0;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    if (request.method === "GET" && url.pathname === "/api/state") {
      requestCount += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(state));
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    get requestCount() {
      return requestCount;
    },
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
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
  assertIncludes(output, "Reverse control mode: deny", "dry run with env password");
  assertNotIncludes(output, "demo password", "dry run with env password");
  print("OK", "Environment password allows dry run without demo warning");
}

async function assertPowerShellWrapperHelp(timeoutMs) {
  for (const helpArg of ["-Help", "-h"]) {
    const result = await runPowerShell([helpArg], {
      timeoutMs,
      env: { LAN_DUAL_PASSWORD: "" },
    });
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.exitCode !== 0 || result.timedOut) {
      throw new Error(`PowerShell wrapper ${helpArg} should print help without starting host.\n${output}`);
    }
    assertIncludes(output, "Usage:", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "-Status -CheckBoard -BoardSummary", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "WindowsHostMedia=", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "check-windows-host-readiness.mjs --checkBoard --probeMedia --boardSummary", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "WindowsHostMediaPs=", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "check-windows-host-readiness.ps1 -CheckBoard -ProbeMedia -BoardSummary", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "WindowsVideoSupport=", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "check-windows-video-encoder-support.mjs --boardSummary", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "WindowsVideoSupportPs=", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "check-windows-video-encoder-support.ps1 -BoardSummary", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "WindowsWgcSupport=", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "check-windows-wgc-support.mjs --boardSummary", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "WindowsWgcSupportPs=", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "check-windows-wgc-support.ps1 -BoardSummary", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "WindowsWebCodecs=", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "check-webcodecs-h264-support.mjs --requireCodec avc1.42C02A --boardSummary", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "WindowsWebCodecsPs=", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "check-webcodecs-h264-support.ps1 -RequireCodec avc1.42C02A -BoardSummary", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "WindowsWgcBenchmark=", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "benchmark-windows-wgc-settings.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "WindowsWgcBenchmarkPs=", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "benchmark-windows-wgc-settings.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "WindowsWgcCompare=", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "compare-windows-wgc-h264-sources.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "WindowsWgcComparePs=", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "compare-windows-wgc-h264-sources.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "ReverseGrant=", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "ReverseGrantPs=", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "WindowsReverseGrantStatus=", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "WindowsOpenOneTimeReverseGrant=", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "allow-windows-reverse-control.ps1 -HostName 127.0.0.1", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "never starts Windows host", `PowerShell wrapper ${helpArg}`);
    assertIncludes(output, "never asks for or prints passwords", `PowerShell wrapper ${helpArg}`);
    assertNotIncludes(output, "Starting Windows host", `PowerShell wrapper ${helpArg}`);
    assertNotIncludes(output, "LAN_DUAL_PASSWORD is required", `PowerShell wrapper ${helpArg}`);
  }
  print("OK", "PowerShell start helper help is safe and documents board summary commands");
}

async function assertDryRunReverseControlMode(timeoutMs) {
  const result = await runNode(["--requirePassword", "--dryRun", "--reverseControlMode", "accept"], {
    timeoutMs,
    env: {
      LAN_DUAL_PASSWORD: "test-password",
      LAN_DUAL_BUILD_ID: "start-helper-reverse-control-test",
    },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(`Reverse control mode dry run failed.\n${output}`);
  }
  assertIncludes(output, "Reverse control mode: accept (trusted LAN lab auto-accept)", "reverse control dry run");
  assertNotIncludes(output, "test-password", "reverse control dry run");
  print("OK", "Dry run shows explicit reverse-control policy");
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
  const expectedSafeStart = `node scripts/windows/start-windows-host.mjs --host 127.0.0.1 --port ${port} --promptPassword --requirePassword`;
  const expectedEphemeralStart = `${expectedSafeStart} --skipFirewallCheck`;
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
  assertIncludes(output, expectedSafeStart, "offline status safe start command");
  assertIncludes(output, expectedEphemeralStart, "offline status ephemeral start command");
  assertIncludes(output, "Windows host media baseline command:", "offline status");
  assertIncludes(output, "check-windows-host-readiness.mjs --checkBoard --probeMedia --boardSummary", "offline status");
  assertIncludes(output, "Windows video support command:", "offline status");
  assertIncludes(output, "check-windows-video-encoder-support.mjs --boardSummary", "offline status");
  assertIncludes(output, "Windows video support PowerShell command after host is online:", "offline status");
  assertIncludes(output, "check-windows-video-encoder-support.ps1 -BoardSummary", "offline status");
  assertIncludes(output, "Windows WGC support command:", "offline status");
  assertIncludes(output, "check-windows-wgc-support.mjs --boardSummary", "offline status");
  assertIncludes(output, "Windows WGC support PowerShell command after host is online:", "offline status");
  assertIncludes(output, "check-windows-wgc-support.ps1 -BoardSummary", "offline status");
  assertIncludes(output, "Windows WebCodecs H.264 command:", "offline status");
  assertIncludes(output, "check-webcodecs-h264-support.mjs --requireCodec avc1.42C02A --boardSummary", "offline status");
  assertIncludes(output, "Windows WebCodecs H.264 PowerShell command after host is online:", "offline status");
  assertIncludes(output, "check-webcodecs-h264-support.ps1 -RequireCodec avc1.42C02A -BoardSummary", "offline status");
  assertIncludes(output, "Windows WGC benchmark command after host is online:", "offline status");
  assertIncludes(output, "benchmark-windows-wgc-settings.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary", "offline status");
  assertIncludes(output, "Windows WGC benchmark PowerShell command after host is online:", "offline status");
  assertIncludes(output, "benchmark-windows-wgc-settings.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary", "offline status");
  assertIncludes(output, "Windows reverse grant PowerShell command after host is online:", "offline status");
  assertIncludes(output, "Windows reverse grant Node fallback after host is online:", "offline status");
  assertIncludes(output, "allow-windows-reverse-control.mjs --host 127.0.0.1", "offline status");
  assertIncludes(output, "allow-windows-reverse-control.ps1 -HostName 127.0.0.1", "offline status");
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
  if (parsed.safeStartCommand !== expectedSafeStart || parsed.ephemeralStartCommand !== expectedEphemeralStart) {
    throw new Error(`Offline JSON status did not preserve host/port in start commands.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.suggestions[0] || "").includes(`--port ${port}`) || !String(parsed.suggestions[1] || "").includes("--skipFirewallCheck")) {
    throw new Error(`Offline JSON suggestions did not include precise safe/ephemeral start commands.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.windowsHostMediaReadinessCommand || "").includes("check-windows-host-readiness.mjs") || !String(parsed.windowsHostMediaReadinessCommand || "").includes("--probeMedia")) {
    throw new Error(`Offline JSON status did not include Windows host media readiness command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.windowsHostMediaReadinessPowerShellCommand || "").includes("check-windows-host-readiness.ps1") || !String(parsed.windowsHostMediaReadinessPowerShellCommand || "").includes("-ProbeMedia") || !String(parsed.windowsHostMediaReadinessPowerShellCommand || "").includes("-BoardSummary")) {
    throw new Error(`Offline JSON status did not include Windows host media readiness PowerShell command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.windowsVideoEncoderSupportCommand || "").includes("check-windows-video-encoder-support.mjs") || !String(parsed.windowsVideoEncoderSupportCommand || "").includes("--boardSummary")) {
    throw new Error(`Offline JSON status did not include Windows video support command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.windowsVideoEncoderSupportPowerShellCommand || "").includes("check-windows-video-encoder-support.ps1") || !String(parsed.windowsVideoEncoderSupportPowerShellCommand || "").includes("-BoardSummary")) {
    throw new Error(`Offline JSON status did not include Windows video support PowerShell command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.windowsWgcSupportCommand || "").includes("check-windows-wgc-support.mjs") || !String(parsed.windowsWgcSupportCommand || "").includes("--boardSummary")) {
    throw new Error(`Offline JSON status did not include Windows WGC support command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.windowsWgcSupportPowerShellCommand || "").includes("check-windows-wgc-support.ps1") || !String(parsed.windowsWgcSupportPowerShellCommand || "").includes("-BoardSummary")) {
    throw new Error(`Offline JSON status did not include Windows WGC support PowerShell command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.windowsWebCodecsH264Command || "").includes("check-webcodecs-h264-support.mjs") || !String(parsed.windowsWebCodecsH264Command || "").includes("--requireCodec avc1.42C02A") || !String(parsed.windowsWebCodecsH264Command || "").includes("--boardSummary")) {
    throw new Error(`Offline JSON status did not include Windows WebCodecs H.264 command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.windowsWebCodecsH264PowerShellCommand || "").includes("check-webcodecs-h264-support.ps1") || !String(parsed.windowsWebCodecsH264PowerShellCommand || "").includes("-RequireCodec avc1.42C02A") || !String(parsed.windowsWebCodecsH264PowerShellCommand || "").includes("-BoardSummary")) {
    throw new Error(`Offline JSON status did not include Windows WebCodecs H.264 PowerShell command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.windowsWgcBenchmarkCommand || "").includes("benchmark-windows-wgc-settings.mjs") || !String(parsed.windowsWgcBenchmarkCommand || "").includes("--boardSummary")) {
    throw new Error(`Offline JSON status did not include Windows WGC benchmark command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.windowsWgcBenchmarkPowerShellCommand || "").includes("benchmark-windows-wgc-settings.ps1") || !String(parsed.windowsWgcBenchmarkPowerShellCommand || "").includes("-BoardSummary")) {
    throw new Error(`Offline JSON status did not include Windows WGC benchmark PowerShell command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.windowsWgcCompareCommand || "").includes("compare-windows-wgc-h264-sources.mjs") || !String(parsed.windowsWgcCompareCommand || "").includes("--boardSummary")) {
    throw new Error(`Offline JSON status did not include Windows WGC compare command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.windowsWgcComparePowerShellCommand || "").includes("compare-windows-wgc-h264-sources.ps1") || !String(parsed.windowsWgcComparePowerShellCommand || "").includes("-BoardSummary")) {
    throw new Error(`Offline JSON status did not include Windows WGC compare PowerShell command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.windowsReverseControlGrantCommand || "").includes("allow-windows-reverse-control.mjs") || !String(parsed.windowsReverseControlGrantCommand || "").includes("--boardSummary")) {
    throw new Error(`Offline JSON status did not include Windows reverse grant command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.windowsReverseControlGrantPowerShellCommand || "").includes("allow-windows-reverse-control.ps1") || !String(parsed.windowsReverseControlGrantPowerShellCommand || "").includes("-BoardSummary")) {
    throw new Error(`Offline JSON status did not include Windows reverse grant PowerShell command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.windowsReverseGrantStatusCommand || "").includes("--status") || !String(parsed.windowsReverseGrantStatusPowerShellCommand || "").includes("-Status")) {
    throw new Error(`Offline JSON status did not include Windows reverse grant status commands.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.windowsOpenOneTimeReverseGrantCommand || "").includes("--grant") || !String(parsed.windowsOpenOneTimeReverseGrantPowerShellCommand || "").includes("-Grant")) {
    throw new Error(`Offline JSON status did not include Windows one-time reverse grant commands.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.boardSummary || "").includes("WindowsHostMedia=")) {
    throw new Error(`Offline JSON board summary did not include WindowsHostMedia command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.boardSummary || "").includes("WindowsHostMediaPs=") || !String(parsed.boardSummary || "").includes("check-windows-host-readiness.ps1 -CheckBoard -ProbeMedia -BoardSummary")) {
    throw new Error(`Offline JSON board summary did not include WindowsHostMediaPs command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.boardSummary || "").includes("WindowsVideoSupport=") || !String(parsed.boardSummary || "").includes("check-windows-video-encoder-support.mjs --boardSummary")) {
    throw new Error(`Offline JSON board summary did not include WindowsVideoSupport command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.boardSummary || "").includes("WindowsVideoSupportPs=") || !String(parsed.boardSummary || "").includes("check-windows-video-encoder-support.ps1 -BoardSummary")) {
    throw new Error(`Offline JSON board summary did not include WindowsVideoSupportPs command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.boardSummary || "").includes("WindowsWgcSupport=") || !String(parsed.boardSummary || "").includes("check-windows-wgc-support.mjs --boardSummary")) {
    throw new Error(`Offline JSON board summary did not include WindowsWgcSupport command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.boardSummary || "").includes("WindowsWgcSupportPs=") || !String(parsed.boardSummary || "").includes("check-windows-wgc-support.ps1 -BoardSummary")) {
    throw new Error(`Offline JSON board summary did not include WindowsWgcSupportPs command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.boardSummary || "").includes("WindowsWebCodecs=") || !String(parsed.boardSummary || "").includes("check-webcodecs-h264-support.mjs --requireCodec avc1.42C02A --boardSummary")) {
    throw new Error(`Offline JSON board summary did not include WindowsWebCodecs command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.boardSummary || "").includes("WindowsWebCodecsPs=") || !String(parsed.boardSummary || "").includes("check-webcodecs-h264-support.ps1 -RequireCodec avc1.42C02A -BoardSummary")) {
    throw new Error(`Offline JSON board summary did not include WindowsWebCodecsPs command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.boardSummary || "").includes("WindowsWgcBenchmark=") || !String(parsed.boardSummary || "").includes("benchmark-windows-wgc-settings.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary")) {
    throw new Error(`Offline JSON board summary did not include WindowsWgcBenchmark command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.boardSummary || "").includes("WindowsWgcBenchmarkPs=") || !String(parsed.boardSummary || "").includes("benchmark-windows-wgc-settings.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary")) {
    throw new Error(`Offline JSON board summary did not include WindowsWgcBenchmarkPs command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.boardSummary || "").includes("WindowsWgcCompare=") || !String(parsed.boardSummary || "").includes("compare-windows-wgc-h264-sources.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary")) {
    throw new Error(`Offline JSON board summary did not include WindowsWgcCompare command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.boardSummary || "").includes("WindowsWgcComparePs=") || !String(parsed.boardSummary || "").includes("compare-windows-wgc-h264-sources.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary")) {
    throw new Error(`Offline JSON board summary did not include WindowsWgcComparePs command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.boardSummary || "").includes("WindowsReverseGrantStatus=") || !String(parsed.boardSummary || "").includes("-Status -BoardSummary")) {
    throw new Error(`Offline JSON board summary did not include WindowsReverseGrantStatus command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.boardSummary || "").includes("WindowsOpenOneTimeReverseGrant=") || !String(parsed.boardSummary || "").includes("-Grant -DurationMs 30000 -BoardSummary")) {
    throw new Error(`Offline JSON board summary did not include WindowsOpenOneTimeReverseGrant command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.boardSummary || "").includes("WindowsReverseGrantStatusNodeFallback=") || !String(parsed.boardSummary || "").includes("--status --boardSummary")) {
    throw new Error(`Offline JSON board summary did not include WindowsReverseGrantStatusNodeFallback command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.boardSummary || "").includes("WindowsOpenOneTimeReverseGrantNodeFallback=") || !String(parsed.boardSummary || "").includes("--grant --durationMs 30000 --boardSummary")) {
    throw new Error(`Offline JSON board summary did not include WindowsOpenOneTimeReverseGrantNodeFallback command.\n${jsonResult.stdout}`);
  }
  if (!String(parsed.boardSummary || "").includes("ReverseGrantPs=") || !String(parsed.boardSummary || "").includes("allow-windows-reverse-control.ps1")) {
    throw new Error(`Offline JSON board summary did not include legacy ReverseGrantPs command.\n${jsonResult.stdout}`);
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
  assertIncludes(boardResult.stdout, expectedSafeStart, "offline board summary safe start command");
  assertIncludes(boardResult.stdout, expectedEphemeralStart, "offline board summary ephemeral start command");
  assertIncludes(boardResult.stdout, "WindowsHostMedia=", "offline board summary");
  assertIncludes(boardResult.stdout, "check-windows-host-readiness.mjs --checkBoard --probeMedia --boardSummary", "offline board summary");
  assertIncludes(boardResult.stdout, "WindowsHostMediaPs=", "offline board summary");
  assertIncludes(boardResult.stdout, "check-windows-host-readiness.ps1 -CheckBoard -ProbeMedia -BoardSummary", "offline board summary");
  assertIncludes(boardResult.stdout, "WindowsVideoSupport=", "offline board summary");
  assertIncludes(boardResult.stdout, "check-windows-video-encoder-support.mjs --boardSummary", "offline board summary");
  assertIncludes(boardResult.stdout, "WindowsVideoSupportPs=", "offline board summary");
  assertIncludes(boardResult.stdout, "check-windows-video-encoder-support.ps1 -BoardSummary", "offline board summary");
  assertIncludes(boardResult.stdout, "WindowsWgcSupport=", "offline board summary");
  assertIncludes(boardResult.stdout, "check-windows-wgc-support.mjs --boardSummary", "offline board summary");
  assertIncludes(boardResult.stdout, "WindowsWgcSupportPs=", "offline board summary");
  assertIncludes(boardResult.stdout, "check-windows-wgc-support.ps1 -BoardSummary", "offline board summary");
  assertIncludes(boardResult.stdout, "WindowsWebCodecs=", "offline board summary");
  assertIncludes(boardResult.stdout, "check-webcodecs-h264-support.mjs --requireCodec avc1.42C02A --boardSummary", "offline board summary");
  assertIncludes(boardResult.stdout, "WindowsWebCodecsPs=", "offline board summary");
  assertIncludes(boardResult.stdout, "check-webcodecs-h264-support.ps1 -RequireCodec avc1.42C02A -BoardSummary", "offline board summary");
  assertIncludes(boardResult.stdout, "WindowsWgcBenchmark=", "offline board summary");
  assertIncludes(boardResult.stdout, "benchmark-windows-wgc-settings.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary", "offline board summary");
  assertIncludes(boardResult.stdout, "WindowsWgcBenchmarkPs=", "offline board summary");
  assertIncludes(boardResult.stdout, "benchmark-windows-wgc-settings.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary", "offline board summary");
  assertIncludes(boardResult.stdout, "WindowsWgcCompare=", "offline board summary");
  assertIncludes(boardResult.stdout, "compare-windows-wgc-h264-sources.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary", "offline board summary");
  assertIncludes(boardResult.stdout, "WindowsWgcComparePs=", "offline board summary");
  assertIncludes(boardResult.stdout, "compare-windows-wgc-h264-sources.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary", "offline board summary");
  assertIncludes(boardResult.stdout, "WindowsReverseGrantStatus=", "offline board summary");
  assertIncludes(boardResult.stdout, "-Status -BoardSummary", "offline board summary");
  assertIncludes(boardResult.stdout, "WindowsOpenOneTimeReverseGrant=", "offline board summary");
  assertIncludes(boardResult.stdout, "-Grant -DurationMs 30000 -BoardSummary", "offline board summary");
  assertIncludes(boardResult.stdout, "WindowsReverseGrantStatusNodeFallback=", "offline board summary");
  assertIncludes(boardResult.stdout, "--status --boardSummary", "offline board summary");
  assertIncludes(boardResult.stdout, "WindowsOpenOneTimeReverseGrantNodeFallback=", "offline board summary");
  assertIncludes(boardResult.stdout, "--grant --durationMs 30000 --boardSummary", "offline board summary");
  assertIncludes(boardResult.stdout, "ReverseGrant=", "offline board summary");
  assertIncludes(boardResult.stdout, "ReverseGrantPs=", "offline board summary");
  assertIncludes(boardResult.stdout, "Do not send passwords", "offline board summary");
  assertNotIncludes(boardOutput, "LAN_DUAL_PASSWORD is required", "offline board summary");
  print("OK", "Status mode reports offline host without requiring a password");
}

async function assertStatusCheckBoardCurrentCall(timeoutMs) {
  const port = await getFreePort();
  const activeBoard = await startFakeBoard({
    currentCall: {
      status: "CALLING",
      from: "Mac Codex",
      need: "Windows Codex",
      goal: "Mac formal Windows host 验收",
      command: "node scripts/mac/check-mac-client-formal-status.mjs --sendCall --debugToken should-not-leak",
      expected: "Windows host ready for Mac client formal smoke",
      ask: "请 Windows 端准备 host status",
    },
  });

  try {
    const jsonResult = await runNode([
      "--status",
      "--json",
      "--checkBoard",
      "--server",
      activeBoard.url,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--requirePassword",
    ], {
      timeoutMs,
      env: { LAN_DUAL_PASSWORD: "" },
    });
    const jsonOutput = `${jsonResult.stdout}\n${jsonResult.stderr}`;
    if (jsonResult.exitCode === 0 || jsonResult.timedOut) {
      throw new Error(`Offline checkBoard JSON status should fail quickly without starting host.\n${jsonOutput}`);
    }
    const parsed = parseJsonOutput(jsonResult.stdout, "offline checkBoard JSON status");
    if (!parsed.board?.requested || !parsed.board?.ok || activeBoard.requestCount < 1) {
      throw new Error(`Offline checkBoard JSON status did not read the fake board.\n${jsonResult.stdout}`);
    }
    if (!parsed.board.currentCall?.active || !parsed.board.currentCall?.needsWindows || !parsed.board.currentCall?.fromMacSide) {
      throw new Error(`Offline checkBoard JSON status did not classify active Mac -> Windows call.\n${jsonResult.stdout}`);
    }
    assertIncludes(parsed.boardSummary, "call=CALLING Mac Codex->Windows Codex", "offline checkBoard JSON board summary");
    assertIncludes(parsed.boardSummary, "Mac formal Windows host 验收", "offline checkBoard JSON board summary");
    assertIncludes(parsed.boardSummary, "WindowsHostMedia=", "offline checkBoard JSON board summary");
    assertNotIncludes(parsed.boardSummary, "--sendCall", "offline checkBoard JSON board summary");
    assertNotIncludes(parsed.boardSummary, "should-not-leak", "offline checkBoard JSON board summary");

    const boardResult = await runNode([
      "--status",
      "--boardSummary",
      "--checkBoard",
      "--server",
      activeBoard.url,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--requirePassword",
    ], {
      timeoutMs,
      env: { LAN_DUAL_PASSWORD: "" },
    });
    const boardOutput = `${boardResult.stdout}\n${boardResult.stderr}`;
    if (boardResult.exitCode === 0 || boardResult.timedOut) {
      throw new Error(`Offline checkBoard board summary should fail quickly without starting host.\n${boardOutput}`);
    }
    assertIncludes(boardResult.stdout, "call=CALLING Mac Codex->Windows Codex", "offline checkBoard board summary");
    assertNotIncludes(boardResult.stdout, "--sendCall", "offline checkBoard board summary");
    assertNotIncludes(boardOutput, "LAN_DUAL_PASSWORD is required", "offline checkBoard board summary");
  } finally {
    await activeBoard.close();
  }

  const doneBoard = await startFakeBoard({
    currentCall: {
      status: "DONE",
      from: "Mac Codex",
      need: "Windows Codex",
      goal: "finished Windows host test",
      command: "completed command should stay out of board summary",
    },
  });
  try {
    const boardResult = await runNode([
      "--status",
      "--boardSummary",
      "--checkBoard",
      "--server",
      doneBoard.url,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--requirePassword",
    ], {
      timeoutMs,
      env: { LAN_DUAL_PASSWORD: "" },
    });
    const boardOutput = `${boardResult.stdout}\n${boardResult.stderr}`;
    if (boardResult.exitCode === 0 || boardResult.timedOut) {
      throw new Error(`DONE checkBoard board summary should fail quickly without starting host.\n${boardOutput}`);
    }
    assertIncludes(boardResult.stdout, "Windows host readiness: offline", "DONE checkBoard board summary");
    assertNotIncludes(boardResult.stdout, "call=DONE", "DONE checkBoard board summary");
    assertNotIncludes(boardResult.stdout, "finished Windows host test", "DONE checkBoard board summary");
  } finally {
    await doneBoard.close();
  }

  print("OK", "Status mode surfaces active Mac -> Windows currentCall and ignores DONE calls");
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
        assertIncludes(statusOutput, "Reverse control: mode=deny supported=on requiresConfirmation=on", "online status");
        assertIncludes(statusOutput, "Clipboard:", "online status");
        assertIncludes(statusOutput, "Mac formal checklist command:", "online status");
        assertIncludes(statusOutput, "check-mac-client-formal-status.mjs", "online status");
        assertIncludes(statusOutput, "Mac client formal checklist label:", "online status");
        assertIncludes(statusOutput, "MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs", "online status");
        assertIncludes(statusOutput, "Mac formal send-call command:", "online status");
        assertIncludes(statusOutput, "--sendCall", "online status");
        assertIncludes(statusOutput, "Windows host media baseline command:", "online status");
        assertIncludes(statusOutput, "check-windows-host-readiness.mjs --checkBoard --probeMedia --boardSummary", "online status");
        assertIncludes(statusOutput, "Windows video support command:", "online status");
        assertIncludes(statusOutput, "check-windows-video-encoder-support.mjs --boardSummary", "online status");
        assertIncludes(statusOutput, "Windows video support PowerShell command:", "online status");
        assertIncludes(statusOutput, "check-windows-video-encoder-support.ps1 -BoardSummary", "online status");
        assertIncludes(statusOutput, "Windows WGC support command:", "online status");
        assertIncludes(statusOutput, "check-windows-wgc-support.mjs --boardSummary", "online status");
        assertIncludes(statusOutput, "Windows WGC support PowerShell command:", "online status");
        assertIncludes(statusOutput, "check-windows-wgc-support.ps1 -BoardSummary", "online status");
        assertIncludes(statusOutput, "Windows WebCodecs H.264 command:", "online status");
        assertIncludes(statusOutput, "check-webcodecs-h264-support.mjs --requireCodec avc1.42C02A --boardSummary", "online status");
        assertIncludes(statusOutput, "Windows WebCodecs H.264 PowerShell command:", "online status");
        assertIncludes(statusOutput, "check-webcodecs-h264-support.ps1 -RequireCodec avc1.42C02A -BoardSummary", "online status");
        assertIncludes(statusOutput, "Windows WGC benchmark command:", "online status");
        assertIncludes(statusOutput, "benchmark-windows-wgc-settings.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary", "online status");
        assertIncludes(statusOutput, "Windows WGC benchmark PowerShell command:", "online status");
        assertIncludes(statusOutput, "benchmark-windows-wgc-settings.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary", "online status");
        assertIncludes(statusOutput, "Windows reverse grant PowerShell command:", "online status");
        assertIncludes(statusOutput, "Windows reverse grant Node fallback:", "online status");
        assertIncludes(statusOutput, "allow-windows-reverse-control.mjs --host 127.0.0.1", "online status");
        assertIncludes(statusOutput, "allow-windows-reverse-control.ps1 -HostName 127.0.0.1", "online status");
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
        if (parsed.capabilities?.reverseControl?.mode !== "deny" || parsed.capabilities?.reverseControl?.requiresConfirmation !== true) {
          throw new Error(`Online JSON status did not include default reverse-control policy.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("Windows host readiness: online") || !String(parsed.boardSummary || "").includes("Do not send passwords")) {
          throw new Error(`Online JSON status did not include expected board summary.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("reverse=deny-confirm")) {
          throw new Error(`Online JSON board summary did not include reverse-control policy.\n${jsonResult.stdout}`);
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
        if (!String(parsed.macClientReadinessCommands[0].formalChecklistLabel || "").includes("MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs")) {
          throw new Error(`Online JSON status did not include expected Mac formal checklist label.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.macClientReadinessCommands[0].sendCallCommand || "").includes("--sendCall")) {
          throw new Error(`Online JSON status did not include expected Mac formal send-call command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.windowsHostMediaReadinessCommand || "").includes("check-windows-host-readiness.mjs") || !String(parsed.windowsHostMediaReadinessCommand || "").includes("--probeMedia")) {
          throw new Error(`Online JSON status did not include Windows host media readiness command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.windowsHostMediaReadinessPowerShellCommand || "").includes("check-windows-host-readiness.ps1") || !String(parsed.windowsHostMediaReadinessPowerShellCommand || "").includes("-ProbeMedia") || !String(parsed.windowsHostMediaReadinessPowerShellCommand || "").includes("-BoardSummary")) {
          throw new Error(`Online JSON status did not include Windows host media readiness PowerShell command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.windowsVideoEncoderSupportCommand || "").includes("check-windows-video-encoder-support.mjs") || !String(parsed.windowsVideoEncoderSupportCommand || "").includes("--boardSummary")) {
          throw new Error(`Online JSON status did not include Windows video support command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.windowsVideoEncoderSupportPowerShellCommand || "").includes("check-windows-video-encoder-support.ps1") || !String(parsed.windowsVideoEncoderSupportPowerShellCommand || "").includes("-BoardSummary")) {
          throw new Error(`Online JSON status did not include Windows video support PowerShell command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.windowsWgcSupportCommand || "").includes("check-windows-wgc-support.mjs") || !String(parsed.windowsWgcSupportCommand || "").includes("--boardSummary")) {
          throw new Error(`Online JSON status did not include Windows WGC support command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.windowsWgcSupportPowerShellCommand || "").includes("check-windows-wgc-support.ps1") || !String(parsed.windowsWgcSupportPowerShellCommand || "").includes("-BoardSummary")) {
          throw new Error(`Online JSON status did not include Windows WGC support PowerShell command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.windowsWebCodecsH264Command || "").includes("check-webcodecs-h264-support.mjs") || !String(parsed.windowsWebCodecsH264Command || "").includes("--requireCodec avc1.42C02A") || !String(parsed.windowsWebCodecsH264Command || "").includes("--boardSummary")) {
          throw new Error(`Online JSON status did not include Windows WebCodecs H.264 command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.windowsWebCodecsH264PowerShellCommand || "").includes("check-webcodecs-h264-support.ps1") || !String(parsed.windowsWebCodecsH264PowerShellCommand || "").includes("-RequireCodec avc1.42C02A") || !String(parsed.windowsWebCodecsH264PowerShellCommand || "").includes("-BoardSummary")) {
          throw new Error(`Online JSON status did not include Windows WebCodecs H.264 PowerShell command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.windowsWgcBenchmarkCommand || "").includes("benchmark-windows-wgc-settings.mjs") || !String(parsed.windowsWgcBenchmarkCommand || "").includes("--boardSummary")) {
          throw new Error(`Online JSON status did not include Windows WGC benchmark command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.windowsWgcBenchmarkPowerShellCommand || "").includes("benchmark-windows-wgc-settings.ps1") || !String(parsed.windowsWgcBenchmarkPowerShellCommand || "").includes("-BoardSummary")) {
          throw new Error(`Online JSON status did not include Windows WGC benchmark PowerShell command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.windowsWgcCompareCommand || "").includes("compare-windows-wgc-h264-sources.mjs") || !String(parsed.windowsWgcCompareCommand || "").includes("--boardSummary")) {
          throw new Error(`Online JSON status did not include Windows WGC compare command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.windowsWgcComparePowerShellCommand || "").includes("compare-windows-wgc-h264-sources.ps1") || !String(parsed.windowsWgcComparePowerShellCommand || "").includes("-BoardSummary")) {
          throw new Error(`Online JSON status did not include Windows WGC compare PowerShell command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.windowsReverseControlGrantCommand || "").includes("allow-windows-reverse-control.mjs") || !String(parsed.windowsReverseControlGrantCommand || "").includes("--host 127.0.0.1")) {
          throw new Error(`Online JSON status did not include Windows reverse grant command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.windowsReverseControlGrantPowerShellCommand || "").includes("allow-windows-reverse-control.ps1") || !String(parsed.windowsReverseControlGrantPowerShellCommand || "").includes("-HostName 127.0.0.1")) {
          throw new Error(`Online JSON status did not include Windows reverse grant PowerShell command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.windowsReverseGrantStatusCommand || "").includes("--status") || !String(parsed.windowsReverseGrantStatusPowerShellCommand || "").includes("-Status")) {
          throw new Error(`Online JSON status did not include Windows reverse grant status commands.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.windowsOpenOneTimeReverseGrantCommand || "").includes("--grant") || !String(parsed.windowsOpenOneTimeReverseGrantPowerShellCommand || "").includes("-Grant")) {
          throw new Error(`Online JSON status did not include Windows one-time reverse grant commands.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("WindowsHostMedia=")) {
          throw new Error(`Online JSON board summary did not include WindowsHostMedia command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("WindowsHostMediaPs=") || !String(parsed.boardSummary || "").includes("check-windows-host-readiness.ps1 -CheckBoard -ProbeMedia -BoardSummary")) {
          throw new Error(`Online JSON board summary did not include WindowsHostMediaPs command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("WindowsVideoSupport=") || !String(parsed.boardSummary || "").includes("check-windows-video-encoder-support.mjs --boardSummary")) {
          throw new Error(`Online JSON board summary did not include WindowsVideoSupport command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("WindowsVideoSupportPs=") || !String(parsed.boardSummary || "").includes("check-windows-video-encoder-support.ps1 -BoardSummary")) {
          throw new Error(`Online JSON board summary did not include WindowsVideoSupportPs command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("WindowsWgcSupport=") || !String(parsed.boardSummary || "").includes("check-windows-wgc-support.mjs --boardSummary")) {
          throw new Error(`Online JSON board summary did not include WindowsWgcSupport command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("WindowsWgcSupportPs=") || !String(parsed.boardSummary || "").includes("check-windows-wgc-support.ps1 -BoardSummary")) {
          throw new Error(`Online JSON board summary did not include WindowsWgcSupportPs command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("WindowsWebCodecs=") || !String(parsed.boardSummary || "").includes("check-webcodecs-h264-support.mjs --requireCodec avc1.42C02A --boardSummary")) {
          throw new Error(`Online JSON board summary did not include WindowsWebCodecs command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("WindowsWebCodecsPs=") || !String(parsed.boardSummary || "").includes("check-webcodecs-h264-support.ps1 -RequireCodec avc1.42C02A -BoardSummary")) {
          throw new Error(`Online JSON board summary did not include WindowsWebCodecsPs command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("WindowsWgcBenchmark=") || !String(parsed.boardSummary || "").includes("benchmark-windows-wgc-settings.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary")) {
          throw new Error(`Online JSON board summary did not include WindowsWgcBenchmark command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("WindowsWgcBenchmarkPs=") || !String(parsed.boardSummary || "").includes("benchmark-windows-wgc-settings.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary")) {
          throw new Error(`Online JSON board summary did not include WindowsWgcBenchmarkPs command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("WindowsWgcCompare=") || !String(parsed.boardSummary || "").includes("compare-windows-wgc-h264-sources.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary")) {
          throw new Error(`Online JSON board summary did not include WindowsWgcCompare command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("WindowsWgcComparePs=") || !String(parsed.boardSummary || "").includes("compare-windows-wgc-h264-sources.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary")) {
          throw new Error(`Online JSON board summary did not include WindowsWgcComparePs command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("ReverseGrant=") || !String(parsed.boardSummary || "").includes("allow-windows-reverse-control.mjs")) {
          throw new Error(`Online JSON board summary did not include Windows reverse grant command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("ReverseGrantPs=") || !String(parsed.boardSummary || "").includes("allow-windows-reverse-control.ps1")) {
          throw new Error(`Online JSON board summary did not include Windows reverse grant PowerShell command.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("WindowsReverseGrantStatus=") || !String(parsed.boardSummary || "").includes("-Status -BoardSummary")) {
          throw new Error(`Online JSON board summary did not include Windows reverse grant status label.\n${jsonResult.stdout}`);
        }
        if (!String(parsed.boardSummary || "").includes("WindowsOpenOneTimeReverseGrant=") || !String(parsed.boardSummary || "").includes("-Grant -DurationMs 30000 -BoardSummary")) {
          throw new Error(`Online JSON board summary did not include Windows one-time reverse grant label.\n${jsonResult.stdout}`);
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
        assertIncludes(boardResult.stdout, "reverse=deny-confirm", "online board summary");
        assertIncludes(boardResult.stdout, "check-mac-client-readiness.mjs", "online board summary");
        assertIncludes(boardResult.stdout, "check-mac-client-formal-status.mjs", "online board summary");
        assertIncludes(boardResult.stdout, "MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs", "online board summary");
        assertIncludes(boardResult.stdout, "--sendCall", "online board summary");
        assertIncludes(boardResult.stdout, "WindowsHostMedia=", "online board summary");
        assertIncludes(boardResult.stdout, "check-windows-host-readiness.mjs --checkBoard --probeMedia --boardSummary", "online board summary");
        assertIncludes(boardResult.stdout, "WindowsHostMediaPs=", "online board summary");
        assertIncludes(boardResult.stdout, "check-windows-host-readiness.ps1 -CheckBoard -ProbeMedia -BoardSummary", "online board summary");
        assertIncludes(boardResult.stdout, "WindowsVideoSupport=", "online board summary");
        assertIncludes(boardResult.stdout, "check-windows-video-encoder-support.mjs --boardSummary", "online board summary");
        assertIncludes(boardResult.stdout, "WindowsVideoSupportPs=", "online board summary");
        assertIncludes(boardResult.stdout, "check-windows-video-encoder-support.ps1 -BoardSummary", "online board summary");
        assertIncludes(boardResult.stdout, "WindowsWgcSupport=", "online board summary");
        assertIncludes(boardResult.stdout, "check-windows-wgc-support.mjs --boardSummary", "online board summary");
        assertIncludes(boardResult.stdout, "WindowsWgcSupportPs=", "online board summary");
        assertIncludes(boardResult.stdout, "check-windows-wgc-support.ps1 -BoardSummary", "online board summary");
        assertIncludes(boardResult.stdout, "WindowsWebCodecs=", "online board summary");
        assertIncludes(boardResult.stdout, "check-webcodecs-h264-support.mjs --requireCodec avc1.42C02A --boardSummary", "online board summary");
        assertIncludes(boardResult.stdout, "WindowsWebCodecsPs=", "online board summary");
        assertIncludes(boardResult.stdout, "check-webcodecs-h264-support.ps1 -RequireCodec avc1.42C02A -BoardSummary", "online board summary");
        assertIncludes(boardResult.stdout, "WindowsWgcBenchmark=", "online board summary");
        assertIncludes(boardResult.stdout, "benchmark-windows-wgc-settings.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary", "online board summary");
        assertIncludes(boardResult.stdout, "WindowsWgcBenchmarkPs=", "online board summary");
        assertIncludes(boardResult.stdout, "benchmark-windows-wgc-settings.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary", "online board summary");
        assertIncludes(boardResult.stdout, "WindowsWgcCompare=", "online board summary");
        assertIncludes(boardResult.stdout, "compare-windows-wgc-h264-sources.mjs --profile 60:20000:balanced --durationMs 1800 --boardSummary", "online board summary");
        assertIncludes(boardResult.stdout, "WindowsWgcComparePs=", "online board summary");
        assertIncludes(boardResult.stdout, "compare-windows-wgc-h264-sources.ps1 -Profile 60:20000:balanced -DurationMs 1800 -BoardSummary", "online board summary");
        assertIncludes(boardResult.stdout, "ReverseGrant=", "online board summary");
        assertIncludes(boardResult.stdout, "allow-windows-reverse-control.mjs --host 127.0.0.1", "online board summary");
        assertIncludes(boardResult.stdout, "ReverseGrantPs=", "online board summary");
        assertIncludes(boardResult.stdout, "allow-windows-reverse-control.ps1 -HostName 127.0.0.1", "online board summary");
        assertIncludes(boardResult.stdout, "WindowsReverseGrantStatus=", "online board summary");
        assertIncludes(boardResult.stdout, "-Status -BoardSummary", "online board summary");
        assertIncludes(boardResult.stdout, "WindowsOpenOneTimeReverseGrant=", "online board summary");
        assertIncludes(boardResult.stdout, "-Grant -DurationMs 30000 -BoardSummary", "online board summary");
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
      if (!output.includes("Mac client formal checklist label:") || !output.includes("MacClientFormalChecklist=node scripts/mac/check-mac-client-formal-status.mjs")) {
        rejectLaunch(new Error(`Start helper did not print Mac formal checklist label.\n${output}`));
        return;
      }
      if (!output.includes("Mac formal send-call command:") || !output.includes("--sendCall")) {
        rejectLaunch(new Error(`Start helper did not print Mac formal send-call command.\n${output}`));
        return;
      }
      if (!output.includes("Windows host media baseline command:") || !output.includes("check-windows-host-readiness.mjs --checkBoard --probeMedia --boardSummary")) {
        rejectLaunch(new Error(`Start helper did not print Windows host media baseline command.\n${output}`));
        return;
      }
      if (!output.includes("Windows video support command:") || !output.includes("check-windows-video-encoder-support.mjs --boardSummary")) {
        rejectLaunch(new Error(`Start helper did not print Windows video support command.\n${output}`));
        return;
      }
      if (!output.includes("Windows WGC support command:") || !output.includes("check-windows-wgc-support.mjs --boardSummary")) {
        rejectLaunch(new Error(`Start helper did not print Windows WGC support command.\n${output}`));
        return;
      }
      if (!output.includes("Windows WebCodecs H.264 command:") || !output.includes("check-webcodecs-h264-support.mjs --requireCodec avc1.42C02A --boardSummary")) {
        rejectLaunch(new Error(`Start helper did not print Windows WebCodecs H.264 command.\n${output}`));
        return;
      }
      if (!output.includes("Windows reverse grant PowerShell command:") || !output.includes("allow-windows-reverse-control.ps1 -HostName 127.0.0.1")) {
        rejectLaunch(new Error(`Start helper did not print Windows reverse grant PowerShell command.\n${output}`));
        return;
      }
      if (!output.includes("Windows reverse grant Node fallback:") || !output.includes("allow-windows-reverse-control.mjs --host 127.0.0.1")) {
        rejectLaunch(new Error(`Start helper did not print Windows reverse grant command.\n${output}`));
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
  await assertPowerShellWrapperHelp(args.timeoutMs);
  await assertDryRunReverseControlMode(args.timeoutMs);
  await assertDryRunWgcH264BridgeOptions(args.timeoutMs);
  await assertStatusOfflineNeedsNoPassword(args.timeoutMs);
  await assertStatusCheckBoardCurrentCall(args.timeoutMs);
  await assertStatusOnlineWithTempHost(args.timeoutMs);
  await assertLaunchWithEnvPassword(args.timeoutMs);
  print("OK", "Windows host start helper self-test passed");
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`);
  process.exitCode = 1;
});
