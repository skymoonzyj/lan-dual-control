#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const serverScript = "apps/mac-client/server.mjs";

const defaults = {
  host: "127.0.0.1",
  port: 5188,
  timeoutMs: 8000,
  status: false,
  json: false,
  boardSummary: false,
  open: false,
  allowExisting: false,
  help: false,
};

const copyDiagnosticsAction = "Mac client 事件日志点击“复制诊断”，粘贴前确认不包含连接密码";
const discoverWindowsCommand = "node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary";
const reverseRehearsalAction = "Run MacClientDiscoverWindows first, then use its ReverseRehearsal= line: Mac requests reverse control and expects LAN008, Windows runs the local loopback one-time grant, Mac retries and expects accepted/临时授权已使用";
const reverseGrantCopyAction = "LAN008 后在 Mac client 页面点击“复制 PowerShell”和“复制 Node”，确认复制文本不含连接密码且不会发送 input_event";
const windowsReverseGrantStatusCommand = "pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Status -BoardSummary";
const windowsOpenOneTimeReverseGrantCommand = "pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Grant -DurationMs 30000 -BoardSummary";
const windowsReverseGrantStatusNodeFallbackCommand = "node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --status --boardSummary";
const windowsOpenOneTimeReverseGrantNodeFallbackCommand = "node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --grant --durationMs 30000 --boardSummary";
const formalChecklistCommand = "node scripts/mac/check-mac-client-formal-status.mjs --host <Windows IP> --port 43770 --boardSummary";
const formalSmokeCommand = "node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary";
const browserSelfTestCommand = "node scripts/mac/test-mac-client-browser-self-test.mjs --boardSummary";

function helpRequested(argv) {
  return argv.includes("--help") || argv.includes("-h");
}

function printHelp() {
  console.log(`Usage: node scripts/mac/start-mac-client.mjs [options]

Starts the local Mac control client web page and waits until it is reachable.
It does not connect to Windows host, does not authenticate, does not require or
print a password, and does not send input events.

Options:
  --host <host>          Local bind/probe host. Default: ${defaults.host}
  --port <port>          Local web port. Default: ${defaults.port}
  --timeoutMs <ms>       Startup/status timeout. Default: ${defaults.timeoutMs}
  --status               Only probe the local Mac client page, then exit.
  --json                 Print one machine-readable JSON object.
  --boardSummary         Print a short secret-free Agent Link Board summary.
  --open                 Open the local page in the default browser after start.
  --allowExisting        Treat an already-running page on the port as success.
  --help, -h             Show this help without starting anything.

Machine-readable JSON fields:
  commands.macClientStartOrReuseCommand
                         Secret-free command to start or reuse this local page.
  commands.macClientFormalStatusCommand
                         Secret-free checklist command before true Windows control.
  commands.macClientDiscoverWindowsCommand
                         Secret-free Windows host discovery command from the
                         Mac side. Its board summary includes FormalChecklist=
                         and ReverseRehearsal= when a Windows host is found.
  commands.macClientReverseRehearsalAction
                         Human action for the guarded reverse-control request
                         rehearsal after Windows discovery.
  commands.macClientReverseGrantCopyAction
                         Human action for confirming both reverse-grant copy
                         buttons after LAN008 without passwords or input.
  commands.windowsReverseGrantStatusCommand
                         Windows-side PowerShell status command for the local
                         one-time reverse-control grant.
  commands.windowsOpenOneTimeReverseGrantCommand
                         Windows-side PowerShell command to open a short local
                         one-time reverse-control grant.
  commands.windowsReverseGrantStatusNodeFallbackCommand
                         Node fallback status command for the same local
                         Windows one-time reverse-control grant.
  commands.windowsOpenOneTimeReverseGrantNodeFallbackCommand
                         Node fallback command to open the same local Windows
                         one-time reverse-control grant.
  commands.macClientFormalSmokeCommand
                         Secret-free preflight command. It does not authenticate,
                         prompt for a password, send a call, or send input.
  commands.macClientBrowserSelfTestCommand
                         Secret-free local browser self-test command. It uses a
                         temporary mock Windows host and does not use a real host,
                         password, call, or inject.
  commands.macClientCopyDiagnosticsAction
                         Safe in-page action for copying diagnostics after
                         confirming no connection password is included.

Examples:
  node scripts/mac/start-mac-client.mjs
  node scripts/mac/start-mac-client.mjs --status --boardSummary
  node scripts/mac/start-mac-client.mjs --port 5199 --open
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
    if (
      token === "--status" ||
      token === "--json" ||
      token === "--boardSummary" ||
      token === "--open" ||
      token === "--allowExisting"
    ) {
      args[token.slice(2)] = true;
      continue;
    }
    if (token === "--host" && next && !next.startsWith("--")) {
      args.host = next;
      index += 1;
      continue;
    }
    if (token === "--port" && next && !next.startsWith("--")) {
      args.port = clampInteger(next, 1, 65535, defaults.port);
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = clampInteger(next, 1000, 120000, defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  args.host = String(args.host || defaults.host).trim();
  return args;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function makeUrl(args) {
  return `http://${args.host}:${args.port}/`;
}

function requestText(url, timeoutMs) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 512 * 1024) {
          request.destroy(new Error("response too large"));
        }
      });
      response.on("end", () => {
        resolveRequest({ statusCode: response.statusCode || 0, body });
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error(`timed out after ${timeoutMs}ms`));
    });
    request.on("error", rejectRequest);
  });
}

async function probeClient(args) {
  const url = makeUrl(args);
  const result = {
    checked: true,
    online: false,
    url,
    statusCode: 0,
    titleFound: false,
    error: null,
  };
  try {
    const response = await requestText(url, args.timeoutMs);
    result.statusCode = response.statusCode;
    result.online = response.statusCode >= 200 && response.statusCode < 300;
    result.titleFound = /LAN Dual|Mac 控制|控制 Windows|远程/.test(response.body);
    if (!result.online) {
      result.error = { message: `HTTP ${response.statusCode}` };
    }
  } catch (error) {
    result.error = { message: error.message };
  }
  return result;
}

async function waitForReady(args, child) {
  const deadline = Date.now() + args.timeoutMs;
  let lastProbe = await probeClient({ ...args, timeoutMs: Math.min(1000, args.timeoutMs) });
  while (Date.now() < deadline) {
    if (lastProbe.online && lastProbe.titleFound) return lastProbe;
    if (child.exitCode !== null) {
      return {
        ...lastProbe,
        error: { message: `Mac client server exited with code ${child.exitCode}` },
      };
    }
    await delay(100);
    lastProbe = await probeClient({ ...args, timeoutMs: 1000 });
  }
  return {
    ...lastProbe,
    error: lastProbe.error || { message: `Mac client page did not become ready after ${args.timeoutMs}ms` },
  };
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function startServer(args) {
  const child = spawn(process.execPath, [serverScript, String(args.port)], {
    cwd: repoRoot,
    env: {
      ...process.env,
      LAN_DUAL_PASSWORD: "",
      LAN_DUAL_MAC_CLIENT_PORT: String(args.port),
    },
    detached: true,
    stdio: "ignore",
  });
  return child;
}

function openBrowser(url) {
  const child = spawn("open", [url], {
    stdio: "ignore",
    detached: true,
  });
  child.unref();
}

function makeBoardSummary(report) {
  if (report.online) {
    return [
      `Mac client page online at ${report.url}; pid=${report.processId || "existing"}; title=${report.titleFound ? "ok" : "unexpected"}.`,
      "Next: run MacClientFormalChecklist before true Windows control.",
      `MacClientFormalChecklist=${formalChecklistCommand}.`,
      `MacClientFormalSmoke=${formalSmokeCommand}.`,
      `MacClientDiscoverWindows=${discoverWindowsCommand}.`,
      `MacClientReverseRehearsal=${reverseRehearsalAction}.`,
      `MacClientReverseGrantCopy=${reverseGrantCopyAction}.`,
      `WindowsReverseGrantStatus=${windowsReverseGrantStatusCommand}.`,
      `WindowsOpenOneTimeReverseGrant=${windowsOpenOneTimeReverseGrantCommand}.`,
      `WindowsReverseGrantStatusNodeFallback=${windowsReverseGrantStatusNodeFallbackCommand}.`,
      `WindowsOpenOneTimeReverseGrantNodeFallback=${windowsOpenOneTimeReverseGrantNodeFallbackCommand}.`,
      `MacClientBrowserSelfTest=${browserSelfTestCommand}.`,
      `CopyDiagnostics=${copyDiagnosticsAction}.`,
      "No password was requested or sent; no Windows connection/input was attempted.",
    ].join(" ");
  }
  return [
    `Mac client page offline at ${report.url}: ${report.error?.message || "unknown"}.`,
    "Next: start with node scripts/mac/start-mac-client.mjs, then rerun formal checklist.",
    `MacClientFormalChecklist=${formalChecklistCommand}.`,
    `MacClientFormalSmoke=${formalSmokeCommand}.`,
    `MacClientDiscoverWindows=${discoverWindowsCommand}.`,
    `MacClientReverseRehearsal=${reverseRehearsalAction}.`,
    `MacClientReverseGrantCopy=${reverseGrantCopyAction}.`,
    `WindowsReverseGrantStatus=${windowsReverseGrantStatusCommand}.`,
    `WindowsOpenOneTimeReverseGrant=${windowsOpenOneTimeReverseGrantCommand}.`,
    `WindowsReverseGrantStatusNodeFallback=${windowsReverseGrantStatusNodeFallbackCommand}.`,
    `WindowsOpenOneTimeReverseGrantNodeFallback=${windowsOpenOneTimeReverseGrantNodeFallbackCommand}.`,
    `MacClientBrowserSelfTest=${browserSelfTestCommand}.`,
    `CopyDiagnostics=页面在线后在 ${copyDiagnosticsAction}.`,
    "No password was requested or sent; no Windows connection/input was attempted.",
  ].join(" ");
}

function makeCommands(args) {
  return {
    macClientStartOrReuseCommand: `node scripts/mac/start-mac-client.mjs --host ${args.host} --port ${args.port} --allowExisting`,
    macClientFormalStatusCommand: formalChecklistCommand,
    macClientDiscoverWindowsCommand: discoverWindowsCommand,
    macClientReverseRehearsalAction: reverseRehearsalAction,
    macClientReverseGrantCopyAction: reverseGrantCopyAction,
    windowsReverseGrantStatusCommand,
    windowsOpenOneTimeReverseGrantCommand,
    windowsReverseGrantStatusNodeFallbackCommand,
    windowsOpenOneTimeReverseGrantNodeFallbackCommand,
    macClientFormalSmokeCommand: formalSmokeCommand,
    macClientBrowserSelfTestCommand: browserSelfTestCommand,
    macClientCopyDiagnosticsAction: copyDiagnosticsAction,
  };
}

function printHuman(report) {
  console.log(`Mac client page: ${report.online ? "online" : "offline"} at ${report.url}`);
  if (report.processId) console.log(`Process: ${report.processId}`);
  if (report.statusCode) console.log(`HTTP: ${report.statusCode}`);
  console.log(`Page shape: ${report.titleFound ? "ok" : "not confirmed"}`);
  if (report.error?.message) console.log(`Error: ${report.error.message}`);
  console.log(report.boardSummary);
}

async function buildStatusReport(args) {
  const probe = await probeClient(args);
  const report = {
    ok: probe.online && probe.titleFound,
    mode: "status",
    online: probe.online,
    url: probe.url,
    statusCode: probe.statusCode,
    titleFound: probe.titleFound,
    processId: null,
    error: probe.error,
  };
  report.boardSummary = makeBoardSummary(report);
  report.commands = makeCommands(args);
  return report;
}

async function startAndReport(args) {
  const existing = await probeClient({ ...args, timeoutMs: Math.min(1200, args.timeoutMs) });
  if (existing.online && existing.titleFound) {
    if (!args.allowExisting) {
      const report = {
        ok: false,
        mode: "start",
        online: true,
        url: existing.url,
        statusCode: existing.statusCode,
        titleFound: existing.titleFound,
        processId: null,
        error: { message: "Mac client page is already running; pass --allowExisting to accept it." },
      };
      report.boardSummary = makeBoardSummary(report);
      report.commands = makeCommands(args);
      return report;
    }
    const report = {
      ok: true,
      mode: "start",
      online: true,
      url: existing.url,
      statusCode: existing.statusCode,
      titleFound: existing.titleFound,
      processId: null,
      error: null,
    };
    report.boardSummary = makeBoardSummary(report);
    report.commands = makeCommands(args);
    if (args.open) openBrowser(report.url);
    return report;
  }

  const child = startServer(args);
  const ready = await waitForReady(args, child);
  const report = {
    ok: ready.online && ready.titleFound,
    mode: "start",
    online: ready.online,
    url: ready.url,
    statusCode: ready.statusCode,
    titleFound: ready.titleFound,
    processId: child.pid || null,
    error: ready.error,
  };
  report.boardSummary = makeBoardSummary(report);
  report.commands = makeCommands(args);

  if (report.ok) {
    child.unref();
    if (args.open) openBrowser(report.url);
  } else {
    child.kill("SIGTERM");
  }
  return report;
}

async function main() {
  if (helpRequested(process.argv)) {
    printHelp();
    return;
  }
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  const report = args.status ? await buildStatusReport(args) : await startAndReport(args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printHuman(report);
  }
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((error) => {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok: false, error: { message: error.message } }, null, 2));
  } else {
    console.error(`[FAIL] ${error.message}`);
  }
  process.exitCode = 1;
});
