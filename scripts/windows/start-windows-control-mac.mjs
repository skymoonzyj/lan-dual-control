#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";
import os from "node:os";

const defaults = {
  host: "192.168.31.122",
  port: 43770,
  clientPort: 5200,
  debugPort: 9340,
  timeoutMs: 8000,
  discover: true,
  discoverTimeoutMs: 650,
  discoverConcurrency: 64,
  boardTarget: true,
  boardTimeoutMs: 650,
  server: process.env.CODEX_LINK_SERVER || "http://192.168.31.68:17888",
};

function printHelp() {
  console.log(`Usage:
  node scripts/windows/start-windows-control-mac.mjs [options]

Options:
  --host <ip>                 Mac host LAN IP fallback. Default: ${defaults.host}
  --port <port>               Mac host WebSocket/discovery port. Default: ${defaults.port}
  --clientPort <port>         Local Windows control page port. Default: ${defaults.clientPort}
  --debugPort <port>          Reserved browser diagnostics debug port. Default: ${defaults.debugPort}
  --timeoutMs <ms>            Wait for the local page server. Default: ${defaults.timeoutMs}
  --discover                  Force a read-only /discovery probe before choosing the target.
  --noDiscover                Skip discovery and use --host/--port fallback directly.
  --discoverHost <ip>         Direct host to probe during discovery. Can be repeated.
  --discoverNoLocalSubnets    Only probe --host and --discoverHost targets.
  --discoverTimeoutMs <ms>    Per-host discovery timeout, 100-5000. Default: ${defaults.discoverTimeoutMs}
  --server <url>              Agent Link Board URL for Mac target hints. Default: ${defaults.server}
  --noBoardTarget             Do not read Agent Link Board for extra Mac discovery candidates.
  --boardTimeoutMs <ms>       Agent Link Board read timeout, 100-5000. Default: ${defaults.boardTimeoutMs}
  --noOpen                    Start/reuse the page server but do not open a browser.
  --dryRun                    Print the URL and plan without starting services or opening a browser.
  --boardSummary              Print one secret-free Agent Link Board summary line.
  --json                      Print one machine-readable JSON object.
  --help, -h                  Show this help without starting services or browsers.

Description:
  Opens the shortest Windows entry for controlling the current Mac host. By
  default it first runs a read-only LAN /discovery probe and uses the latest Mac
  host when found; otherwise it falls back to the configured host/port. The page
  clears the demo password for a real Mac connection and waits for the user to
  type the current temporary Mac password locally. It does not print passwords,
  authenticate, or send input/inject.

Examples:
  node scripts/windows/start-windows-control-mac.mjs
  node scripts/windows/start-windows-control-mac.mjs --dryRun --boardSummary
  node scripts/windows/start-windows-control-mac.mjs --dryRun --json --discoverHost 192.168.31.122
  node scripts/windows/start-windows-control-mac.mjs --dryRun --json --server http://192.168.31.68:17888
  node scripts/windows/start-windows-control-mac.mjs --dryRun --boardSummary --noDiscover
`);
}

function clampPort(value, fallback) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fallback;
  return port;
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function parseArgs(argv) {
  const args = {
    ...defaults,
    discoverHosts: [],
    discoverNoLocalSubnets: false,
    discoverRequested: false,
    hostProvided: false,
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
    if (token === "--discover") {
      args.discover = true;
      args.discoverRequested = true;
      continue;
    }
    if (token === "--noDiscover") {
      args.discover = false;
      continue;
    }
    if (token === "--discoverNoLocalSubnets") {
      args.discoverNoLocalSubnets = true;
      continue;
    }
    if (token === "--host" && next && !next.startsWith("--")) {
      args.host = next.trim();
      args.hostProvided = true;
      index += 1;
      continue;
    }
    if (token === "--discoverHost" && next && !next.startsWith("--")) {
      args.discoverHosts.push(next.trim());
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
    if (token === "--discoverTimeoutMs" && next && !next.startsWith("--")) {
      args.discoverTimeoutMs = clampInteger(next, 100, 5000, defaults.discoverTimeoutMs);
      index += 1;
      continue;
    }
    if (token === "--server" && next && !next.startsWith("--")) {
      args.server = next.trim();
      index += 1;
      continue;
    }
    if (token === "--noBoardTarget") {
      args.boardTarget = false;
      continue;
    }
    if (token === "--boardTimeoutMs" && next && !next.startsWith("--")) {
      args.boardTimeoutMs = clampInteger(next, 100, 5000, defaults.boardTimeoutMs);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  args.discoverHosts = [...new Set(args.discoverHosts.filter(Boolean))];
  args.server = normalizeBoardServer(args.server || defaults.server);
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
    `targetSource=${report.targetSource}`,
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
    targetSource: args.targetSource || (args.hostProvided ? "explicit" : "default"),
    clientPort: args.clientPort,
    debugPort: args.debugPort,
    url: makeControlUrl(args),
    openBrowser: Boolean(args.openBrowser && !args.dryRun),
    dryRun: Boolean(args.dryRun),
    discovery: args.discovery || { attempted: false, selected: false, reason: "disabled" },
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

function ipv4ToInt(address) {
  const parts = String(address).split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function intToIpv4(value) {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join(".");
}

function prefixLengthFromNetmask(netmask) {
  const numeric = ipv4ToInt(netmask);
  if (numeric === null) return 24;
  let prefix = 0;
  for (let bit = 31; bit >= 0; bit -= 1) {
    if ((numeric & (1 << bit)) !== 0) prefix += 1;
    else break;
  }
  return Math.max(1, Math.min(30, prefix));
}

function hostsForInterface(entry) {
  const address = ipv4ToInt(entry.address);
  if (address === null) return [];
  const prefix = prefixLengthFromNetmask(entry.netmask);
  const effectivePrefix = prefix < 24 ? 24 : prefix;
  const mask = (0xffffffff << (32 - effectivePrefix)) >>> 0;
  const network = address & mask;
  const broadcast = network | (~mask >>> 0);
  const hosts = [];
  for (let value = network + 1; value < broadcast; value += 1) {
    hosts.push(intToIpv4(value >>> 0));
  }
  return hosts;
}

function isLoopbackHost(host) {
  const value = String(host || "").trim().toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1" || value.startsWith("127.");
}

function isUsableDiscoveredHost(host) {
  const value = String(host || "").trim();
  if (!value || value === "0.0.0.0" || value === "::") return false;
  return !isLoopbackHost(value);
}
function normalizeBoardServer(value) {
  const server = String(value || "").trim() || defaults.server;
  return server.replace(/\/+$/, "");
}

function collectStringValues(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, output);
    return output;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStringValues(item, output);
  }
  return output;
}

function hasSecretLikeAssignment(text) {
  const value = String(text || "");
  return /(?:^|[\s;])(?:password|token|secret)\s*[:=]\s*\S+/i.test(value) || /--password\b/i.test(value);
}

function isMacRelatedBoardText(text) {
  const value = String(text || "");
  return /\bMac(?:Heartbeat|Host|ManualUx|Unattended|Formal|Client)?\b/i.test(value) || /macHost\s*=/i.test(value);
}

function extractHostPortCandidates(text) {
  const value = String(text || "");
  if (!isMacRelatedBoardText(value) || hasSecretLikeAssignment(value)) return [];
  const candidates = [];
  const patterns = [
    /\bmacHost\s*=\s*(?:online|ok|ready)?\s*((?:\d{1,3}\.){3}\d{1,3})(?::(\d{1,5}))?/gi,
    /\bTarget\s*=\s*((?:\d{1,3}\.){3}\d{1,3})(?::(\d{1,5}))?/gi,
    /\bhost\s*=\s*((?:\d{1,3}\.){3}\d{1,3})(?::(\d{1,5}))?/gi,
    /\b((?:\d{1,3}\.){3}\d{1,3}):(\d{1,5})\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const host = match[1];
      const port = clampPort(match[2], defaults.port);
      if (ipv4ToInt(host) === null) continue;
      candidates.push({ host, port });
    }
  }
  return candidates;
}

function uniqueBoardTargets(targets) {
  const seen = new Set();
  const unique = [];
  for (const target of targets) {
    const host = String(target.host || "").trim();
    const port = clampPort(target.port, defaults.port);
    const key = `${host}:${port}`;
    if (!host || seen.has(key)) continue;
    seen.add(key);
    unique.push({ host, port });
  }
  return unique;
}

async function fetchBoardState(server, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${server}/api/state`, { cache: "no-store", signal: controller.signal });
    if (!response.ok) return { ok: false, reason: `http-${response.status}`, state: null };
    return { ok: true, reason: "ok", state: await response.json() };
  } catch (error) {
    return { ok: false, reason: error?.name === "AbortError" ? "timeout" : "unavailable", state: null };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBoardDiscoveryTargets(args) {
  const server = normalizeBoardServer(args.server || defaults.server);
  const result = await fetchBoardState(server, args.boardTimeoutMs);
  if (!result.ok) return { attempted: true, ok: false, server, reason: result.reason, targets: [] };
  const texts = collectStringValues(result.state);
  const targets = uniqueBoardTargets(texts.flatMap(extractHostPortCandidates));
  return { attempted: true, ok: true, server, reason: targets.length ? "ok" : "no-mac-targets", textCount: texts.length, targets };
}

function sanitizeBoardDiscoveryReport(board = {}) {
  return {
    attempted: Boolean(board.attempted),
    ok: Boolean(board.ok),
    server: board.server || "",
    reason: board.reason || "",
    targets: board.targets?.length || 0,
  };
}

function addDiscoveryCandidate(candidateMap, host, port, source = "argument") {
  const cleanHost = String(host || "").trim();
  if (!cleanHost || cleanHost === "0.0.0.0" || cleanHost === "::") return;
  const cleanPort = clampPort(port, defaults.port);
  const key = `${cleanHost}:${cleanPort}`;
  if (!candidateMap.has(key)) candidateMap.set(key, { host: cleanHost, port: cleanPort, source });
}

function makeDiscoveryCandidates(args, boardTargets = []) {
  const candidateMap = new Map();
  addDiscoveryCandidate(candidateMap, args.host, args.port, args.hostProvided ? "explicit" : "default");
  for (const host of args.discoverHosts) addDiscoveryCandidate(candidateMap, host, args.port, "argument");
  for (const target of boardTargets) addDiscoveryCandidate(candidateMap, target.host, target.port || args.port, "board");
  if (!args.discoverNoLocalSubnets) {
    for (const entries of Object.values(os.networkInterfaces())) {
      for (const entry of entries || []) {
        if (!entry || entry.family !== "IPv4" || entry.internal || String(entry.address).startsWith("169.254.")) continue;
        for (const host of hostsForInterface(entry)) addDiscoveryCandidate(candidateMap, host, args.port, "subnet");
      }
    }
  }
  return [...candidateMap.values()];
}

function normalizeDiscoveryPayload(payload, candidate, latencyMs) {
  if (!payload || payload.type !== "lan_dual_discovery") return null;
  const discoveredPort = Number(payload.controlPort ?? payload.port);
  return {
    host: payload.host && payload.host !== "0.0.0.0" ? String(payload.host) : candidate.host,
    port: String(Number.isInteger(discoveredPort) && discoveredPort > 0 ? discoveredPort : candidate.port),
    probeHost: candidate.host,
    probePort: candidate.port,
    latencyMs,
    deviceId: payload.deviceId || "",
    deviceName: payload.deviceName || payload.hostName || "",
    platform: payload.platform || "",
    role: payload.role || "",
    runtime: payload.runtime || null,
    capabilities: payload.capabilities || {},
    candidateSource: candidate.source || "argument",
  };
}

function isMacHost(item) {
  return String(item?.platform || "").toLowerCase() === "macos" && String(item?.role || "host").toLowerCase() === "host";
}

async function fetchDiscoveryCandidate(candidate, timeoutMs) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://${candidate.host}:${candidate.port}/discovery`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return normalizeDiscoveryPayload(payload, candidate, Math.round(performance.now() - startedAt));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency(items, limit, worker) {
  const results = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function normalizeDiscoveredMacTarget(candidate) {
  if (!candidate) return null;
  const host = isUsableDiscoveredHost(candidate.host) ? String(candidate.host) : "";
  const probeHost = isUsableDiscoveredHost(candidate.probeHost) ? String(candidate.probeHost) : "";
  const targetHost = host || probeHost;
  if (!targetHost) return null;
  return {
    ...candidate,
    targetHost,
    targetPort: clampPort(candidate.port, defaults.port),
    sourceHost: host ? "payload-host" : "probe-host",
    targetSource: candidate.candidateSource === "board" ? "board-discovery" : "discovery",
  };
}

function pickDiscoveredMacHost(macHosts) {
  for (const candidate of macHosts) {
    const normalized = normalizeDiscoveredMacTarget(candidate);
    if (normalized) return normalized;
  }
  return null;
}

async function runDiscovery(args) {
  const board = args.boardTarget ? await fetchBoardDiscoveryTargets(args) : { attempted: false, ok: false, targets: [], reason: "disabled" };
  const candidates = makeDiscoveryCandidates(args, board.targets || []);
  if (candidates.length === 0) {
    return { ok: false, error: "no-candidates", candidates: 0, found: [], macHosts: [], board };
  }
  const raw = await mapWithConcurrency(candidates, defaults.discoverConcurrency, (candidate) => fetchDiscoveryCandidate(candidate, args.discoverTimeoutMs));
  const found = raw.filter(Boolean);
  const macHosts = found.filter(isMacHost);
  const bestMacHost = pickDiscoveredMacHost(macHosts);
  return {
    ok: Boolean(bestMacHost),
    error: bestMacHost ? "" : `no usable Mac host found after probing ${candidates.length} candidate(s)`,
    candidates: candidates.length,
    boardTargets: board.targets?.length || 0,
    board,
    found,
    macHosts,
    bestMacHost,
  };
}

async function resolveTarget(args) {
  const shouldDiscover = args.discover && (!args.hostProvided || args.discoverRequested || args.discoverHosts.length > 0 || args.discoverNoLocalSubnets);
  if (!shouldDiscover) {
    return {
      ...args,
      targetSource: args.hostProvided ? "explicit" : "default",
      discovery: { attempted: false, selected: false, reason: args.discover ? "explicit-host" : "disabled" },
    };
  }

  const discovery = await runDiscovery(args);
  const selected = discovery.bestMacHost;
  if (selected) {
    return {
      ...args,
      host: String(selected.targetHost),
      port: clampPort(selected.targetPort, args.port),
      targetSource: selected.targetSource || "discovery",
      discovery: {
        attempted: true,
        selected: true,
        scanned: discovery.candidates,
        boardTargets: discovery.boardTargets || 0,
        board: sanitizeBoardDiscoveryReport(discovery.board),
        found: discovery.found.length,
        macHosts: discovery.macHosts.length,
        selectedHost: String(selected.targetHost),
        selectedPort: clampPort(selected.targetPort, args.port),
        sourceHost: selected.sourceHost || "",
        deviceName: selected.deviceName || "",
        runtime: selected.runtime || null,
        capabilities: selected.capabilities || {},
      },
    };
  }

  return {
    ...args,
    targetSource: args.hostProvided ? "explicit" : "default",
    discovery: {
      attempted: true,
      selected: false,
      scanned: discovery.candidates || 0,
      boardTargets: discovery.boardTargets || 0,
      board: sanitizeBoardDiscoveryReport(discovery.board),
      found: discovery.found?.length || 0,
      macHosts: discovery.macHosts?.length || 0,
      reason: discovery.error || "no-usable-mac-host",
    },
  };
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
  console.log(`[INFO] Mac 目标：${report.host}:${report.port}（来源：${report.targetSource}）`);
  console.log(`[INFO] 本地页面端口：${report.clientPort}；诊断调试端口：${report.debugPort}`);
  if (report.discovery?.attempted && !report.discovery.selected) {
    console.log(`[WARN] 未发现可用 LAN Mac host，已回退到 ${report.targetSource} 目标：${report.discovery.reason}`);
  }
  console.log("[INFO] 页面会清空 demo 密码；请在页面里输入 Mac 端当前临时密码后点连接。");
  console.log("[INFO] 安全：不打印密码，不认证，不发送 input/inject。当前先做手工体验测试。");
  if (report.serverReused) console.log("[INFO] 已复用正在运行的本地控制端页面服务。");
  if (report.serverStarted) console.log("[INFO] 已启动本地控制端页面服务。");
  if (!report.serverOnline && !report.dryRun) console.log("[WARN] 本地控制端页面服务未在超时内响应，请直接复制打开地址或检查端口占用。");
}

async function main() {
  const parsedArgs = parseArgs(process.argv);
  if (parsedArgs.help) {
    printHelp();
    return;
  }

  const args = await resolveTarget(parsedArgs);
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
