#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";

const defaults = {
  host: "192.168.31.122",
  port: 43770,
  clientPort: 5200,
  debugPort: 9340,
  timeoutMs: 8000,
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/start-windows-control-mac.mjs [options]

Options:
  --host <ip>            Mac host LAN IP. Default: ${defaults.host}
  --port <port>          Mac host WebSocket port. Default: ${defaults.port}
  --clientPort <port>    Local Windows control page port. Default: ${defaults.clientPort}
  --debugPort <port>     Reserved browser diagnostics debug port. Default: ${defaults.debugPort}
  --timeoutMs <ms>       Wait for the local page server. Default: ${defaults.timeoutMs}
  --noOpen               Start/reuse the page server but do not open a browser.
  --dryRun               Print the URL and plan without starting services or opening a browser.
  --boardSummary         Print one secret-free Agent Link Board summary line.
  --json                 Print one machine-readable JSON object.
  --help, -h             Show this help without starting services or browsers.

Description:
  Opens the shortest Windows entry for controlling the current Mac host. The page
  is prefilled with WebSocket LAN target settings, clears the demo password for a
  real Mac connection, and waits for the user to type the current temporary Mac
  password locally. It does not print passwords, authenticate, or send input/inject.

Examples:
  node scripts/windows/start-windows-control-mac.mjs
  node scripts/windows/start-windows-control-mac.mjs --dryRun --boardSummary
`);
}

function clampPort(value, fallback) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fallback;
  return port;
}

function parseArgs(argv) {
  const args = {
    ...defaults,
    openBrowser: true,
    dryRun: false,
    json: false,
    boardSummary: false,
    help: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--dryRun") {
      args.dryRun = true;
      args.openBrowser = false;
      continue;
    }
    if (token === "--noOpen") {
      args.openBrowser = false;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--boardSummary") {
      args.boardSummary = true;
      continue;
    }
    if (token === "--host" && next && !next.startsWith("--")) {
      args.host = next.trim();
      index += 1;
      continue;
    }
    if (token === "--port" && next && !next.startsWith("--")) {
      args.port = clampPort(next, defaults.port);
      index += 1;
      continue;
    }
    if (token === "--clientPort" && next && !next.startsWith("--")) {
      args.clientPort = clampPort(next, defaults.clientPort);
      index += 1;
      continue;
    }
    if (token === "--debugPort" && next && !next.startsWith("--")) {
      args.debugPort = clampPort(next, defaults.debugPort);
      index += 1;
      continue;
    }
    if (token === "--timeoutMs" && next && !next.startsWith("--")) {
      args.timeoutMs = Math.max(1000, Number(next) || defaults.timeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function makeControlUrl(args) {
  const url = new URL(`http://127.0.0.1:${args.clientPort}/`);
  url.searchParams.set("host", args.host);
  url.searchParams.set("port", String(args.port));
  url.searchParams.set("transport", "websocket");
  url.searchParams.set("clearDemoPassword", "1");
  url.searchParams.set("focusPassword", "1");
  return url.toString();
}

function makeBoardSummary(report) {
  return [
    "WindowsUsableEntry=status=ready",
    "USABLE_NEXT=open_windows_client",
    "BLOCKER=none",
    `target=${report.host}:${report.port}`,
    `clientPort=${report.clientPort}`,
    `debugPort=${report.debugPort}`,
    `OpenUrl=${report.url}`,
    "Safety=no-password,no-input-inject",
  ].join(" ");
}

function makeReport(args, extra = {}) {
  const report = {
    status: "ready",
    host: args.host,
    port: args.port,
    clientPort: args.clientPort,
    debugPort: args.debugPort,
    url: makeControlUrl(args),
    openBrowser: Boolean(args.openBrowser && !args.dryRun),
    dryRun: Boolean(args.dryRun),
    serverStarted: false,
    serverReused: false,
    safety: {
      requestPassword: false,
      printPassword: false,
      authenticate: false,
      sendInputOrInject: false,
    },
    manualSteps: [
      "在打开的 Windows 控制端页面输入 Mac 端当前临时密码。",
      "点击连接后按手工清单检查画面、声音、窗口/全屏、原画、剪贴板文字和文件、复制诊断。",
      "当前仍保持 inputMode=log；除非用户明确确认正在看 Mac 屏幕，不切 true inject。",
    ],
    ...extra,
  };
  report.boardSummary = makeBoardSummary(report);
  return report;
}

function probeHttp(url, timeoutMs) {
  return new Promise((resolveProbe) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      resolveProbe(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on("timeout", () => {
      request.destroy();
      resolveProbe(false);
    });
    request.on("error", () => resolveProbe(false));
  });
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await probeHttp(url, 500)) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  return false;
}

async function ensureClientServer(args) {
  const baseUrl = `http://127.0.0.1:${args.clientPort}/`;
  if (await probeHttp(baseUrl, 700)) {
    return { serverReused: true, serverStarted: false, serverOnline: true };
  }
  const child = spawn(process.execPath, ["apps/windows-client/server.mjs", String(args.clientPort)], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  const serverOnline = await waitForServer(baseUrl, args.timeoutMs);
  return {
    serverReused: false,
    serverStarted: true,
    serverOnline,
    serverPid: child.pid,
  };
}

function openUrl(url) {
  if (process.platform === "win32") {
    const child = spawn("cmd", ["/c", "start", "", url], {
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return;
  }
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(opener, [url], { stdio: "ignore", detached: true });
  child.unref();
}

function printHuman(report) {
  console.log("[OK] Windows 控 Mac 一键入口已准备好");
  console.log(`[INFO] 打开地址：${report.url}`);
  console.log(`[INFO] Mac 目标：${report.host}:${report.port}`);
  console.log(`[INFO] 本地页面端口：${report.clientPort}；诊断调试端口：${report.debugPort}`);
  console.log("[INFO] 页面会清空 demo 密码；请在页面里输入 Mac 端当前临时密码后点连接。");
  console.log("[INFO] 安全：不打印密码，不认证，不发送 input/inject。当前先做手工体验测试。");
  if (report.serverReused) console.log("[INFO] 已复用正在运行的本地控制端页面服务。");
  if (report.serverStarted) console.log("[INFO] 已启动本地控制端页面服务。");
  if (!report.serverOnline && !report.dryRun) console.log("[WARN] 本地控制端页面服务未在超时内响应，请直接复制打开地址或检查端口占用。");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  let runtime = {};
  if (!args.dryRun) {
    runtime = await ensureClientServer(args);
    if (args.openBrowser && runtime.serverOnline) {
      openUrl(makeControlUrl(args));
    }
  }

  const report = makeReport(args, runtime);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.boardSummary) {
    console.log(report.boardSummary);
  } else {
    printHuman(report);
  }

  if (!args.dryRun && !report.serverOnline) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});