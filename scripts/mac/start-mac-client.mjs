#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const serverScript = "apps/mac-client/server.mjs";

const defaults = {
  host: "127.0.0.1",
  port: 5188,
  server: "http://192.168.31.68:17888",
  timeoutMs: 8000,
  status: false,
  json: false,
  boardSummary: false,
  checkBoard: false,
  open: false,
  allowExisting: false,
  help: false,
};
const macUnattendedFreshnessStaleMs = 600000;
const allowedMacPowerStatuses = new Set(["ok", "warning", "unknown"]);
const allowedMacPowerReasons = new Set([
  "ok",
  "skipped",
  "not-checked",
  "pmset-failed",
  "system-sleep-enabled",
  "display-sleep-enabled",
  "network-wake-disabled",
]);
const allowedMacPowerWarnings = new Set([
  "none",
  "unknown",
  "system-sleep-enabled",
  "display-sleep-enabled",
  "network-wake-disabled",
]);
const allowedMacUnattendedStatuses = new Set(["ok", "warning", "blocked", "unknown"]);
const allowedMacUnattendedReasons = new Set([
  "ok",
  "skipped",
  "not-checked",
  "host-offline",
  "launch-agent-missing",
  "launch-agent-not-loaded",
  "launch-agent-max-fps",
  "power",
  "permissions",
  "pmset-failed",
  "unknown",
]);
const allowedMacUnattendedFindings = new Set([
  "none",
  "unknown",
  "host-offline",
  "launch-agent-missing",
  "launch-agent-not-loaded",
  "launch-agent-max-fps",
  "power",
  "permissions",
  "screen-recording",
  "accessibility",
  "input-monitoring",
  "pmset-failed",
]);

const copyDiagnosticsAction = "Mac client 事件日志点击“复制诊断”，粘贴前确认不包含连接密码";
const manualChecklistAction = "Mac client 会话诊断查看“手工清单”：连接/视频/音频/剪贴板/文件/窗口/全屏/原画/input_ack/复制诊断；复制诊断会带出同一行，粘贴前确认不包含连接密码";
const passwordLocationAction = "Windows 临时密码只填 Mac 页面密码框；不要发到通讯板；不保存到最近连接或诊断";
const discoverWindowsCommand = "node scripts/mac/discover-windows-hosts.mjs --checkBoard --boardSummary";
const windowsHostStatusCommand = "node scripts/windows/start-windows-host.mjs --status --host 127.0.0.1 --port 43770 --boardSummary";
const windowsHostReadinessCommand = "node scripts/windows/check-windows-host-readiness.mjs --host 127.0.0.1 --port 43770 --checkBoard --boardSummary";
const reverseRehearsalAction = "Run MacClientDiscoverWindows first, then use its ReverseRehearsal= line: Mac requests reverse control and expects LAN008, Windows runs the local loopback one-time grant, Mac retries and expects accepted/临时授权已使用";
const reverseGrantCopyAction = "LAN008 后在 Mac client 页面点击“复制 PowerShell”和“复制 Node”，确认复制文本不含连接密码且不会发送 input_event";
const windowsReverseGrantStatusCommand = "pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Status -BoardSummary";
const windowsOpenOneTimeReverseGrantCommand = "pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/windows/allow-windows-reverse-control.ps1 -HostName 127.0.0.1 -Port 43770 -Grant -DurationMs 30000 -BoardSummary";
const windowsReverseGrantStatusNodeFallbackCommand = "node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --status --boardSummary";
const windowsOpenOneTimeReverseGrantNodeFallbackCommand = "node scripts/windows/allow-windows-reverse-control.mjs --host 127.0.0.1 --port 43770 --grant --durationMs 30000 --boardSummary";
const formalChecklistCommand = "node scripts/mac/check-mac-client-formal-status.mjs --discover --port 43770 --boardSummary";
const formalSmokeCommand = "node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --preflightOnly --boardSummary";
const promptPasswordSmokeCommand = "node scripts/mac/run-mac-client-formal-smoke.mjs --discover --ensureClient --promptPassword --boardSummary";
const browserSelfTestCommand = "node scripts/mac/test-mac-client-browser-self-test-wrapper.mjs --boardSummary";
const macPowerPlanCommand = "node scripts/mac/plan-mac-power-settings.mjs --profile all --sleep 0 --displaySleep 0 --networkWake on --boardSummary";
const macControlWindowsEntryCommand = "./Start-Mac-Control-Windows.command";
const macUsableEntrySummary = `MacUsableEntry=status=ready USABLE_NEXT=open_mac_client Entry=${macControlWindowsEntryCommand} Safety=no-password,no-input-inject`;

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
  --checkBoard           Read Agent Link Board for secret-free Mac unattended
                         freshness evidence. Default: off.
  --server <url>         Agent Link Board URL for --checkBoard.
                         Default: ${defaults.server}
  --open                 Open the local page in the default browser after start.
  --allowExisting        Treat an already-running page on the port as success.
  --help, -h             Show this help without starting anything.

Machine-readable JSON fields:
  commands.macClientStartOrReuseCommand
                         Secret-free command to start or reuse this local page.
  commands.macClientFormalStatusCommand
                         Secret-free checklist command before true Windows control.
                         It discovers the Windows host instead of using a
                         placeholder IP.
  commands.macClientDiscoverWindowsCommand
                         Secret-free Windows host discovery command from the
                         Mac side. Its board summary includes FormalChecklist=
                         and ReverseRehearsal= when a Windows host is found.
  commands.windowsHostStatusCommand
                         Secret-free command for Windows Codex to run locally
                         on the Windows machine when Mac only has this page
                         status and needs host status.
  commands.windowsHostReadinessCommand
                         Secret-free command for Windows Codex to run locally
                         on the Windows machine when Mac needs host readiness
                         before true control.
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
  commands.macClientPromptPasswordSmokeCommand
                         User-present browser smoke command. It discovers Windows,
                         ensures the local client page, then asks for the password
                         only when this command is explicitly run.
  commands.macClientBrowserSelfTestCommand
                         Secret-free local browser self-test command. It uses a
                         temporary mock Windows host and does not use a real host,
                         password, call, or inject.
  commands.macPowerPlanCommand
                         Secret-free dry-run Mac power plan command for keeping
                         formal testing awake. It does not apply system settings.
  commands.macControlWindowsEntryCommand
                         Finder double-click entry for opening or reusing the
                         local Mac control page. It does not connect,
                         authenticate, request a password, or send input.
  commands.macClientManualChecklistAction
                         Safe in-page action for reviewing the manual checklist
                         row and copying diagnostics without including the
                         connection password.
  commands.macClientPasswordLocationAction
                         Safe in-page action for finding where to enter the
                         Windows temporary password on the Mac client page
                         without sending or saving it.
  commands.macClientCopyDiagnosticsAction
                         Safe in-page action for copying diagnostics after
                         confirming no connection password is included.
  board.macUnattendedFreshness
                         Optional fresh/stale summary for current Mac
                         Unattended or MacPowerHealth evidence from Agent
                         Link Board when --checkBoard is enabled.

Examples:
  node scripts/mac/start-mac-client.mjs
  node scripts/mac/start-mac-client.mjs --status --boardSummary
  node scripts/mac/start-mac-client.mjs --status --checkBoard --boardSummary
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
      token === "--checkBoard" ||
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
    if (token === "--server" && next && !next.startsWith("--")) {
      args.server = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  args.host = String(args.host || defaults.host).trim();
  args.server = String(args.server || defaults.server).trim();
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

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasSecretLikeCommandValue(text) {
  const source = String(text || "");
  return (
    /\bLAN_DUAL_PASSWORD\s*=/i.test(source) ||
    /\b(?:token|secret|passwd|pwd)\s*[:=]\s*\S+/i.test(source) ||
    /(?:^|\s)--(?:password|token|secret|passwd|pwd)(?:[=\s]\S+)?/i.test(source)
  );
}

async function readBoard(args) {
  if (!args.checkBoard) return undefined;
  try {
    const state = await readBoardState(args.server, args.timeoutMs);
    return {
      checked: true,
      ok: true,
      macUnattendedFreshness: collectMacUnattendedFreshnessFromBoardState(state),
    };
  } catch (error) {
    return {
      checked: true,
      ok: false,
      error: error.message,
      macUnattendedFreshness: null,
    };
  }
}

async function readBoardState(server, timeoutMs) {
  const baseUrl = String(server || "").trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("missing Agent Link Board URL");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || defaults.timeoutMs));
  try {
    const token = process.env.CODEX_LINK_TOKEN || "";
    const response = await fetch(`${baseUrl}/api/state`, {
      cache: "no-store",
      signal: controller.signal,
      headers: token ? { "X-Codex-Link-Token": token } : {},
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function collectMacUnattendedFreshnessFromBoardState(state, nowMs = Date.now()) {
  for (const text of collectBoardMacUnattendedTexts(state)) {
    const freshness = extractMacUnattendedFreshness(text, nowMs);
    if (freshness) return freshness;
  }
  return null;
}

function collectBoardMacUnattendedTexts(state) {
  const priorityStatusTexts = [];
  const statusTexts = [];
  const eventTexts = [];
  const statuses = state && typeof state === "object" && state.statuses && typeof state.statuses === "object"
    ? state.statuses
    : {};
  for (const [device, entry] of Object.entries(statuses)) {
    if (typeof entry === "string") {
      const statusText = `${device}: ${entry}`;
      if (isMacUnattendedPriorityText(device, statusText)) {
        priorityStatusTexts.push(statusText);
      } else {
        statusTexts.push(statusText);
      }
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const statusText = [device, entry.status, entry.note, entry.text, entry.message, entry.summary]
      .map(normalizedText)
      .filter(Boolean)
      .join(" ");
    if (!statusText) continue;
    if (isMacUnattendedPriorityText(device, statusText)) {
      priorityStatusTexts.push(statusText);
    } else {
      statusTexts.push(statusText);
    }
  }

  const events = Array.isArray(state?.events) ? state.events : [];
  for (const event of events) {
    if (typeof event === "string") {
      eventTexts.push(event);
      continue;
    }
    if (!event || typeof event !== "object") continue;
    const eventText = [event.device, event.from, event.status, event.note, event.text, event.message, event.summary]
      .map(normalizedText)
      .filter(Boolean)
      .join(" ");
    if (eventText) eventTexts.push(eventText);
  }
  return [...priorityStatusTexts, ...statusTexts, ...eventTexts].filter(Boolean);
}

function isMacUnattendedPriorityText(device, text) {
  return /\bMac Unattended\b/i.test(String(device || "")) || /\bMacUnattendedHealth=/i.test(String(text || ""));
}

function extractMacUnattendedFreshness(text, nowMs) {
  const unattended = extractMacUnattendedHealth(text);
  if (unattended) return makeMacUnattendedFreshness(unattended.checkedAt, "MacUnattendedHealth", nowMs);
  const power = extractMacPowerHealth(text);
  if (power) return makeMacUnattendedFreshness(power.checkedAt, "MacPowerHealth", nowMs);
  return null;
}

function extractMacUnattendedHealth(text) {
  const source = normalizedText(text);
  if (!source || !/\bMacUnattendedHealth=/i.test(source)) return null;
  if (hasSecretLikeCommandValue(source)) return null;
  const match = source.match(/\bMacUnattendedHealth=([A-Za-z]+)\s+reason=([A-Za-z0-9_-]+)\s+blockers=([A-Za-z0-9_,_-]+)\s+warnings=([A-Za-z0-9_,_-]+)\s+checkedAt=([0-9TZ:.-]+)/i);
  if (!match) return null;
  const status = match[1].toLowerCase();
  const reason = match[2];
  const blockers = match[3];
  const warnings = match[4];
  const checkedAt = cleanCheckedAt(match[5]);
  if (!allowedMacUnattendedStatuses.has(status)) return null;
  if (!allowedMacUnattendedReasons.has(reason)) return null;
  if (!isSafeMacUnattendedFindings(blockers)) return null;
  if (!isSafeMacUnattendedFindings(warnings)) return null;
  if (!Number.isFinite(Date.parse(checkedAt))) return null;
  return { status, reason, blockers, warnings, checkedAt };
}

function extractMacPowerHealth(text) {
  const source = normalizedText(text);
  if (!source || !/\bMacPowerHealth=/i.test(source)) return null;
  if (hasSecretLikeCommandValue(source)) return null;
  const match = source.match(/\bMacPowerHealth=([A-Za-z]+)\s+reason=([A-Za-z0-9_-]+)\s+warnings=([A-Za-z0-9_,_-]+)\s+checkedAt=([0-9TZ:.-]+)/i);
  if (!match) return null;
  const status = match[1].toLowerCase();
  const reason = match[2];
  const warnings = match[3];
  const checkedAt = cleanCheckedAt(match[4]);
  if (!allowedMacPowerStatuses.has(status)) return null;
  if (!allowedMacPowerReasons.has(reason)) return null;
  if (!isSafeMacPowerWarnings(warnings)) return null;
  if (!Number.isFinite(Date.parse(checkedAt))) return null;
  return { status, reason, warnings, checkedAt };
}

function cleanCheckedAt(value) {
  return String(value || "").replace(/[.,;]+$/g, "");
}

function isSafeMacUnattendedFindings(value) {
  const tokens = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => allowedMacUnattendedFindings.has(token));
}

function isSafeMacPowerWarnings(value) {
  const tokens = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => allowedMacPowerWarnings.has(token));
}

function makeMacUnattendedFreshness(checkedAt, source, nowMs) {
  const checkedMs = Date.parse(checkedAt);
  if (!Number.isFinite(checkedMs)) return null;
  const checkedAgeMs = Math.max(0, Math.trunc((Number.isFinite(nowMs) ? nowMs : Date.now()) - checkedMs));
  return {
    status: checkedAgeMs > macUnattendedFreshnessStaleMs ? "stale" : "fresh",
    checkedAt,
    checkedAgeMs,
    thresholdMs: macUnattendedFreshnessStaleMs,
    source,
  };
}

function formatMacUnattendedFreshnessSummary(freshness) {
  if (!freshness) return "";
  return [
    `MacUnattendedFreshness=${freshness.status || "unknown"}`,
    `checkedAgeMs=${Number.isFinite(freshness.checkedAgeMs) ? freshness.checkedAgeMs : "unknown"}`,
    `thresholdMs=${freshness.thresholdMs ?? macUnattendedFreshnessStaleMs}`,
    `checkedAt=${freshness.checkedAt || "unknown"}`,
    `source=${freshness.source || "unknown"}`,
  ].join(" ");
}

function makeBoardSummary(report) {
  const macUnattendedFreshness = formatMacUnattendedFreshnessSummary(report.board?.macUnattendedFreshness);
  const macUnattendedFreshnessSummary = macUnattendedFreshness ? `${macUnattendedFreshness}.` : "";
  if (report.online) {
    return [
      `Mac client page online at ${report.url}; pid=${report.processId || "existing"}; title=${report.titleFound ? "ok" : "unexpected"}.`,
      "Evidence=MacClientPageOnline.",
      macUnattendedFreshnessSummary,
      "Next: run MacClientFormalChecklist before true Windows control.",
      `MacClientFormalChecklist=${formalChecklistCommand}.`,
      `MacClientFormalSmoke=${formalSmokeCommand}.`,
      `MacClientDiscoverWindows=${discoverWindowsCommand}.`,
      `WindowsHostStatus=${windowsHostStatusCommand}.`,
      `WindowsHostReadiness=${windowsHostReadinessCommand}.`,
      `MacClientReverseRehearsal=${reverseRehearsalAction}.`,
      `MacClientReverseGrantCopy=${reverseGrantCopyAction}.`,
      `WindowsReverseGrantStatus=${windowsReverseGrantStatusCommand}.`,
      `WindowsOpenOneTimeReverseGrant=${windowsOpenOneTimeReverseGrantCommand}.`,
      `WindowsReverseGrantStatusNodeFallback=${windowsReverseGrantStatusNodeFallbackCommand}.`,
      `WindowsOpenOneTimeReverseGrantNodeFallback=${windowsOpenOneTimeReverseGrantNodeFallbackCommand}.`,
      `MacClientPromptPasswordSmoke=${promptPasswordSmokeCommand}.`,
      `MacClientBrowserSelfTest=${browserSelfTestCommand}.`,
      `${macUsableEntrySummary}.`,
      `MacPowerPlan=${macPowerPlanCommand}.`,
      `MacClientManualChecklist=${manualChecklistAction}.`,
      `MacClientPasswordLocation=${passwordLocationAction}.`,
      `CopyDiagnostics=${copyDiagnosticsAction}.`,
      "No password was requested or sent; no Windows connection/input was attempted.",
    ].join(" ");
  }
  return [
    `Mac client page offline at ${report.url}: ${report.error?.message || "unknown"}.`,
    macUnattendedFreshnessSummary,
    "Next: start with node scripts/mac/start-mac-client.mjs, then rerun formal checklist.",
    `MacClientFormalChecklist=${formalChecklistCommand}.`,
    `MacClientFormalSmoke=${formalSmokeCommand}.`,
    `MacClientDiscoverWindows=${discoverWindowsCommand}.`,
    `WindowsHostStatus=${windowsHostStatusCommand}.`,
    `WindowsHostReadiness=${windowsHostReadinessCommand}.`,
    `MacClientReverseRehearsal=${reverseRehearsalAction}.`,
    `MacClientReverseGrantCopy=${reverseGrantCopyAction}.`,
    `WindowsReverseGrantStatus=${windowsReverseGrantStatusCommand}.`,
    `WindowsOpenOneTimeReverseGrant=${windowsOpenOneTimeReverseGrantCommand}.`,
    `WindowsReverseGrantStatusNodeFallback=${windowsReverseGrantStatusNodeFallbackCommand}.`,
    `WindowsOpenOneTimeReverseGrantNodeFallback=${windowsOpenOneTimeReverseGrantNodeFallbackCommand}.`,
    `MacClientPromptPasswordSmoke=${promptPasswordSmokeCommand}.`,
    `MacClientBrowserSelfTest=${browserSelfTestCommand}.`,
    `${macUsableEntrySummary}.`,
    `MacPowerPlan=${macPowerPlanCommand}.`,
    `MacClientManualChecklist=页面在线后在 ${manualChecklistAction}.`,
    `MacClientPasswordLocation=页面在线后确认 ${passwordLocationAction}.`,
    `CopyDiagnostics=页面在线后在 ${copyDiagnosticsAction}.`,
    "No password was requested or sent; no Windows connection/input was attempted.",
  ].join(" ");
}

function makeCommands(args) {
  return {
    macClientStartOrReuseCommand: `node scripts/mac/start-mac-client.mjs --host ${args.host} --port ${args.port} --allowExisting`,
    macClientFormalStatusCommand: formalChecklistCommand,
    macClientDiscoverWindowsCommand: discoverWindowsCommand,
    windowsHostStatusCommand,
    windowsHostReadinessCommand,
    macClientReverseRehearsalAction: reverseRehearsalAction,
    macClientReverseGrantCopyAction: reverseGrantCopyAction,
    windowsReverseGrantStatusCommand,
    windowsOpenOneTimeReverseGrantCommand,
    windowsReverseGrantStatusNodeFallbackCommand,
    windowsOpenOneTimeReverseGrantNodeFallbackCommand,
    macClientFormalSmokeCommand: formalSmokeCommand,
    macClientPromptPasswordSmokeCommand: promptPasswordSmokeCommand,
    macClientBrowserSelfTestCommand: browserSelfTestCommand,
    macControlWindowsEntryCommand,
    macPowerPlanCommand,
    macClientManualChecklistAction: manualChecklistAction,
    macClientPasswordLocationAction: passwordLocationAction,
    macClientCopyDiagnosticsAction: copyDiagnosticsAction,
  };
}

function printHuman(report) {
  console.log(`Mac client page: ${report.online ? "online" : "offline"} at ${report.url}`);
  if (report.processId) console.log(`Process: ${report.processId}`);
  if (report.statusCode) console.log(`HTTP: ${report.statusCode}`);
  console.log(`Page shape: ${report.titleFound ? "ok" : "not confirmed"}`);
  const macUnattendedFreshness = formatMacUnattendedFreshnessSummary(report.board?.macUnattendedFreshness);
  if (macUnattendedFreshness) console.log(`Mac unattended freshness: ${macUnattendedFreshness}`);
  if (report.error?.message) console.log(`Error: ${report.error.message}`);
  console.log(report.boardSummary);
}

async function finalizeReport(report, args) {
  const board = await readBoard(args);
  if (board) report.board = board;
  report.boardSummary = makeBoardSummary(report);
  report.commands = makeCommands(args);
  return report;
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
  return finalizeReport(report, args);
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
      return finalizeReport(report, args);
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
    await finalizeReport(report, args);
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
  await finalizeReport(report, args);

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
