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

function assertSingleLine(text, label) {
  const trimmed = String(text || "").trim();
  assert(trimmed.length > 0, `${label} should not be empty`);
  assert(!trimmed.includes("\n"), `${label} should be a single line.\n${text}`);
  return trimmed;
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

function assertFormalSmokeCommand(command, label) {
  assertIncludes(command, "run-mac-client-formal-smoke.mjs", label);
  assertIncludes(command, "--discover", label);
  assertIncludes(command, "--ensureClient", label);
  assertIncludes(command, "--preflightOnly", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "--json", label);
}

function assertMacClientFormalStatusCommand(command, label) {
  assertIncludes(command, "check-mac-client-formal-status.mjs", label);
  assertIncludes(command, "--host <Windows IP>", label);
  assertIncludes(command, "--port 43770", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
  assertNotIncludes(command, "--json", label);
}

function assertMacClientDiscoverWindowsCommand(command, label) {
  assertIncludes(command, "discover-windows-hosts.mjs", label);
  assertIncludes(command, "--checkBoard", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
}

function assertMacClientReverseRehearsalAction(text, label) {
  assertIncludes(text, "MacClientDiscoverWindows", label);
  assertIncludes(text, "ReverseRehearsal=", label);
  assertIncludes(text, "LAN008", label);
  assertIncludes(text, "local loopback", label);
  assertIncludes(text, "临时授权已使用", label);
  assertNotIncludes(text, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(text, "--password", label);
  assertNotIncludes(text, "--sendCall", label);
  assertNotIncludes(text, "inject", label);
}

function assertMacClientReverseGrantCopyAction(text, label) {
  assertIncludes(text, "复制 PowerShell", label);
  assertIncludes(text, "复制 Node", label);
  assertIncludes(text, "连接密码", label);
  assertIncludes(text, "input_event", label);
  assertNotIncludes(text, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(text, "--password", label);
  assertNotIncludes(text, "--sendCall", label);
  assertNotIncludes(text, "inject", label);
}

function assertWindowsReverseGrantPowerShellCommand(command, label, action = "grant") {
  assertIncludes(command, "pwsh -NoProfile -ExecutionPolicy Bypass", label);
  assertIncludes(command, "-File scripts/windows/allow-windows-reverse-control.ps1", label);
  assertIncludes(command, "-HostName 127.0.0.1", label);
  assertIncludes(command, "-Port 43770", label);
  if (action === "status") {
    assertIncludes(command, "-Status", label);
    assertNotIncludes(command, "-Grant", label);
  } else {
    assertIncludes(command, "-Grant", label);
    assertIncludes(command, "-DurationMs 30000", label);
    assertNotIncludes(command, "-Status", label);
  }
  assertIncludes(command, "-BoardSummary", label);
  assertNotIncludes(command, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "input_event", label);
  assertNotIncludes(command, "inject", label);
}

function assertWindowsReverseGrantNodeFallbackCommand(command, label, action = "grant") {
  assertIncludes(command, "node scripts/windows/allow-windows-reverse-control.mjs", label);
  assertIncludes(command, "--host 127.0.0.1", label);
  assertIncludes(command, "--port 43770", label);
  if (action === "status") {
    assertIncludes(command, "--status", label);
    assertNotIncludes(command, "--grant", label);
  } else {
    assertIncludes(command, "--grant", label);
    assertIncludes(command, "--durationMs 30000", label);
    assertNotIncludes(command, "--status", label);
  }
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "input_event", label);
  assertNotIncludes(command, "inject", label);
}

function assertWindowsReverseGrantCommands(commands, label) {
  assertWindowsReverseGrantPowerShellCommand(commands?.windowsReverseGrantStatusCommand || "", `${label} PowerShell status`, "status");
  assertWindowsReverseGrantPowerShellCommand(commands?.windowsOpenOneTimeReverseGrantCommand || "", `${label} PowerShell grant`, "grant");
  assertWindowsReverseGrantNodeFallbackCommand(commands?.windowsReverseGrantStatusNodeFallbackCommand || "", `${label} Node status`, "status");
  assertWindowsReverseGrantNodeFallbackCommand(commands?.windowsOpenOneTimeReverseGrantNodeFallbackCommand || "", `${label} Node grant`, "grant");
}

function assertWindowsReverseGrantBoardSummary(text, label) {
  assertIncludes(text, "WindowsReverseGrantStatus=pwsh -NoProfile -ExecutionPolicy Bypass", label);
  assertIncludes(text, "-Port 43770 -Status -BoardSummary", label);
  assertIncludes(text, "WindowsOpenOneTimeReverseGrant=pwsh -NoProfile -ExecutionPolicy Bypass", label);
  assertIncludes(text, "-Port 43770 -Grant -DurationMs 30000 -BoardSummary", label);
  assertIncludes(text, "WindowsReverseGrantStatusNodeFallback=node scripts/windows/allow-windows-reverse-control.mjs", label);
  assertIncludes(text, "--host 127.0.0.1 --port 43770 --status --boardSummary", label);
  assertIncludes(text, "WindowsOpenOneTimeReverseGrantNodeFallback=node scripts/windows/allow-windows-reverse-control.mjs", label);
  assertIncludes(text, "--host 127.0.0.1 --port 43770 --grant --durationMs 30000 --boardSummary", label);
  assertNotIncludes(text, "LAN_DUAL_PASSWORD", label);
  assertNotIncludes(text, "--password", label);
}

function assertMacClientBrowserSelfTestCommand(command, label) {
  assertIncludes(command, "scripts/mac/test-mac-client-browser-self-test.mjs", label);
  assertIncludes(command, "--boardSummary", label);
  assertNotIncludes(command, "scripts/windows/test-mac-client-browser.mjs", label);
  assertNotIncludes(command, "--useExistingHost", label);
  assertNotIncludes(command, "--useEnvPassword", label);
  assertNotIncludes(command, "--requirePassword", label);
  assertNotIncludes(command, "--promptPassword", label);
  assertNotIncludes(command, "--password", label);
  assertNotIncludes(command, "--sendCall", label);
  assertNotIncludes(command, "--forceCall", label);
  assertNotIncludes(command, "--server", label);
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
    assertIncludes(result.stdout, "commands.macClientFormalStatusCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macClientDiscoverWindowsCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macClientReverseRehearsalAction", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macClientReverseGrantCopyAction", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.windowsReverseGrantStatusCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.windowsOpenOneTimeReverseGrantCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.windowsReverseGrantStatusNodeFallbackCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.windowsOpenOneTimeReverseGrantNodeFallbackCommand", `${script} ${flag}`);
    assertIncludes(result.stdout, "commands.macClientBrowserSelfTestCommand", `${script} ${flag}`);
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
  assertIncludes(payload.boardSummary || "", "MacClientFormalChecklist=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacClientFormalSmoke=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacClientDiscoverWindows=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacClientReverseRehearsal=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacClientReverseGrantCopy=", "offline board summary");
  assertWindowsReverseGrantBoardSummary(payload.boardSummary || "", "offline board summary");
  assertIncludes(payload.boardSummary || "", "ReverseRehearsal=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "MacClientBrowserSelfTest=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "CopyDiagnostics=", "offline board summary");
  assertIncludes(payload.boardSummary || "", "复制诊断", "offline board summary");
  assertIncludes(payload.boardSummary || "", "连接密码", "offline board summary");
  assertIncludes(payload.commands?.macClientStartOrReuseCommand || "", `--port ${port}`, "offline commands");
  assertIncludes(payload.commands?.macClientStartOrReuseCommand || "", "--allowExisting", "offline commands");
  assertMacClientFormalStatusCommand(payload.commands?.macClientFormalStatusCommand || "", "offline formal checklist command");
  assertMacClientDiscoverWindowsCommand(payload.commands?.macClientDiscoverWindowsCommand || "", "offline Windows discovery command");
  assertMacClientReverseRehearsalAction(payload.commands?.macClientReverseRehearsalAction || "", "offline reverse rehearsal action");
  assertMacClientReverseGrantCopyAction(payload.commands?.macClientReverseGrantCopyAction || "", "offline reverse grant copy action");
  assertWindowsReverseGrantCommands(payload.commands, "offline Windows reverse grant commands");
  assertFormalSmokeCommand(payload.commands?.macClientFormalSmokeCommand || "", "offline formal smoke commands");
  assertMacClientBrowserSelfTestCommand(
    payload.commands?.macClientBrowserSelfTestCommand || "",
    "offline Mac client browser self-test command",
  );
  assertIncludes(payload.commands?.macClientCopyDiagnosticsAction || "", "复制诊断", "offline commands");
  assertIncludes(payload.commands?.macClientCopyDiagnosticsAction || "", "连接密码", "offline commands");
  assertNotIncludes(`${result.stdout}\n${result.stderr}`, "LAN_DUAL_PASSWORD", "offline status");

  const summary = run(["--status", "--boardSummary", "--port", String(port), "--timeoutMs", "1200"], {
    timeoutMs: args.timeoutMs,
  });
  const summaryLine = assertSingleLine(summary.stdout, "offline board summary stdout");
  assert(summary.status !== 0, "offline board summary should fail");
  assertIncludes(summaryLine, "Mac client page offline", "offline board summary stdout");
  assertIncludes(summaryLine, "MacClientFormalChecklist=", "offline board summary stdout");
  assertIncludes(summaryLine, "check-mac-client-formal-status.mjs", "offline board summary stdout");
  assertIncludes(summaryLine, "MacClientFormalSmoke=", "offline board summary stdout");
  assertIncludes(summaryLine, "MacClientDiscoverWindows=", "offline board summary stdout");
  assertIncludes(summaryLine, "MacClientReverseRehearsal=", "offline board summary stdout");
  assertIncludes(summaryLine, "MacClientReverseGrantCopy=", "offline board summary stdout");
  assertWindowsReverseGrantBoardSummary(summaryLine, "offline board summary stdout");
  assertIncludes(summaryLine, "LAN008", "offline board summary stdout");
  assertIncludes(summaryLine, "MacClientBrowserSelfTest=", "offline board summary stdout");
  assertIncludes(summaryLine, "CopyDiagnostics=", "offline board summary stdout");
  assertIncludes(summaryLine, "复制诊断", "offline board summary stdout");
  assertIncludes(summaryLine, "连接密码", "offline board summary stdout");
  assertNotIncludes(`${summary.stdout}\n${summary.stderr}`, "LAN_DUAL_PASSWORD", "offline board summary stdout");
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
  assertIncludes(started.boardSummary || "", "MacClientFormalChecklist=", "start board summary");
  assertIncludes(started.boardSummary || "", "MacClientFormalSmoke=", "start board summary");
  assertIncludes(started.boardSummary || "", "MacClientDiscoverWindows=", "start board summary");
  assertIncludes(started.boardSummary || "", "MacClientReverseRehearsal=", "start board summary");
  assertIncludes(started.boardSummary || "", "MacClientReverseGrantCopy=", "start board summary");
  assertWindowsReverseGrantBoardSummary(started.boardSummary || "", "start board summary");
  assertIncludes(started.boardSummary || "", "MacClientBrowserSelfTest=", "start board summary");
  assertIncludes(started.boardSummary || "", "CopyDiagnostics=", "start board summary");
  assertIncludes(started.boardSummary || "", "复制诊断", "start board summary");
  assertIncludes(started.boardSummary || "", "连接密码", "start board summary");
  assertIncludes(started.commands?.macClientStartOrReuseCommand || "", `--port ${port}`, "start commands");
  assertMacClientFormalStatusCommand(started.commands?.macClientFormalStatusCommand || "", "start formal checklist command");
  assertMacClientDiscoverWindowsCommand(started.commands?.macClientDiscoverWindowsCommand || "", "start Windows discovery command");
  assertMacClientReverseRehearsalAction(started.commands?.macClientReverseRehearsalAction || "", "start reverse rehearsal action");
  assertMacClientReverseGrantCopyAction(started.commands?.macClientReverseGrantCopyAction || "", "start reverse grant copy action");
  assertWindowsReverseGrantCommands(started.commands, "start Windows reverse grant commands");
  assertFormalSmokeCommand(started.commands?.macClientFormalSmokeCommand || "", "start formal smoke commands");
  assertMacClientBrowserSelfTestCommand(
    started.commands?.macClientBrowserSelfTestCommand || "",
    "start Mac client browser self-test command",
  );
  assertIncludes(started.commands?.macClientCopyDiagnosticsAction || "", "复制诊断", "start commands");
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
    assertIncludes(statusPayload.boardSummary || "", "CopyDiagnostics=", "online status board summary");
    assertIncludes(statusPayload.boardSummary || "", "MacClientFormalChecklist=", "online status board summary");
    assertIncludes(statusPayload.boardSummary || "", "MacClientFormalSmoke=", "online status board summary");
    assertIncludes(statusPayload.boardSummary || "", "MacClientDiscoverWindows=", "online status board summary");
    assertIncludes(statusPayload.boardSummary || "", "MacClientReverseRehearsal=", "online status board summary");
    assertIncludes(statusPayload.boardSummary || "", "MacClientReverseGrantCopy=", "online status board summary");
    assertWindowsReverseGrantBoardSummary(statusPayload.boardSummary || "", "online status board summary");
    assertIncludes(statusPayload.boardSummary || "", "MacClientBrowserSelfTest=", "online status board summary");
    assertIncludes(statusPayload.boardSummary || "", "复制诊断", "online status board summary");
    assertIncludes(statusPayload.commands?.macClientStartOrReuseCommand || "", `--port ${port}`, "online status commands");
    assertMacClientFormalStatusCommand(
      statusPayload.commands?.macClientFormalStatusCommand || "",
      "online status formal checklist command",
    );
    assertMacClientDiscoverWindowsCommand(statusPayload.commands?.macClientDiscoverWindowsCommand || "", "online status Windows discovery command");
    assertMacClientReverseRehearsalAction(statusPayload.commands?.macClientReverseRehearsalAction || "", "online status reverse rehearsal action");
    assertMacClientReverseGrantCopyAction(statusPayload.commands?.macClientReverseGrantCopyAction || "", "online status reverse grant copy action");
    assertWindowsReverseGrantCommands(statusPayload.commands, "online status Windows reverse grant commands");
    assertFormalSmokeCommand(statusPayload.commands?.macClientFormalSmokeCommand || "", "online status formal smoke commands");
    assertMacClientBrowserSelfTestCommand(
      statusPayload.commands?.macClientBrowserSelfTestCommand || "",
      "online status Mac client browser self-test command",
    );
    assertIncludes(statusPayload.commands?.macClientCopyDiagnosticsAction || "", "连接密码", "online status commands");

    const summary = run(["--status", "--boardSummary", "--port", String(port), "--timeoutMs", "1200"], {
      timeoutMs: args.timeoutMs,
    });
    const summaryLine = assertSingleLine(summary.stdout, "online board summary stdout");
    assert(summary.status === 0, "online board summary should pass");
    assertIncludes(summaryLine, "Mac client page online", "online board summary stdout");
    assertIncludes(summaryLine, "MacClientFormalChecklist=", "online board summary stdout");
    assertIncludes(summaryLine, "check-mac-client-formal-status.mjs", "online board summary stdout");
    assertIncludes(summaryLine, "MacClientFormalSmoke=", "online board summary stdout");
    assertIncludes(summaryLine, "MacClientDiscoverWindows=", "online board summary stdout");
    assertIncludes(summaryLine, "MacClientReverseRehearsal=", "online board summary stdout");
    assertIncludes(summaryLine, "MacClientReverseGrantCopy=", "online board summary stdout");
    assertWindowsReverseGrantBoardSummary(summaryLine, "online board summary stdout");
    assertIncludes(summaryLine, "MacClientBrowserSelfTest=", "online board summary stdout");
    assertIncludes(summaryLine, "CopyDiagnostics=", "online board summary stdout");
    assertIncludes(summaryLine, "复制诊断", "online board summary stdout");
    assertIncludes(summaryLine, "连接密码", "online board summary stdout");
    assertNotIncludes(`${summary.stdout}\n${summary.stderr}`, "LAN_DUAL_PASSWORD", "online board summary stdout");

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
    assertIncludes(allowedPayload.commands?.macClientStartOrReuseCommand || "", `--port ${port}`, "allow existing commands");
    assertMacClientDiscoverWindowsCommand(allowedPayload.commands?.macClientDiscoverWindowsCommand || "", "allow existing Windows discovery command");
    assertMacClientReverseRehearsalAction(allowedPayload.commands?.macClientReverseRehearsalAction || "", "allow existing reverse rehearsal action");
    assertMacClientReverseGrantCopyAction(allowedPayload.commands?.macClientReverseGrantCopyAction || "", "allow existing reverse grant copy action");
    assertWindowsReverseGrantCommands(allowedPayload.commands, "allow existing Windows reverse grant commands");
    assertFormalSmokeCommand(allowedPayload.commands?.macClientFormalSmokeCommand || "", "allow existing formal smoke commands");
    assertMacClientBrowserSelfTestCommand(
      allowedPayload.commands?.macClientBrowserSelfTestCommand || "",
      "allow existing Mac client browser self-test command",
    );
    assertIncludes(
      allowedPayload.commands?.macClientCopyDiagnosticsAction || "",
      "复制诊断",
      "allow existing commands",
    );
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
